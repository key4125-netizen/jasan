// E2E-88 [Daily Valuation 통합] 일별 손익 추이도 거래내역 + 시장 종가 · 환율로 계산하고(PM 확정 U1=C · U2 · U3 · U4 · U6),
// 두 팝업(일별 손익 · 총 평가금액)의 기간 선택을 당월/3개월/6개월/1년 · 기본 당월로 통일한다.
//
// U1=C  손익 = D일 수량×평가 − D−1일 수량×평가 − 당일 매수대금 + 당일 매도대금(원장 자산만). 원화 현금 · 부동산 · 채권은 0.
// U3    원장으로 수량을 알 수 없는 달러 현금은 계산 불가 · U4 계산 불가 자산이 있으면 그 소유자 · 합계 null.
// U6    위 KPI 카드의 실시간 일간 손익 산식은 그대로다. dailySnapshots는 DV가 만들거나 고치지 않는다.
// 시세는 route로 가짜 Yahoo 일봉(합성)을 준다. 부팅 때 나가는 기존 시세 요청은 DNS 단계에서 막힌다. 시각은 context.clock으로 고정한다.
// 실제 사용자 데이터 · 실제 Cloud를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const ts = (iso) => Date.parse(iso) / 1000;
const D = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']; // 월~금

// e2e/87과 같은 합성 일봉. phase: 'friNight'(한국 금 23:30 · 뉴욕 장중) | 'satMorning'(한국 토 15:00 · 모든 시장 종가 확정 뒤)
function yahooFixtures(phase, overrides) {
  const krPeriod = (day) => ({ regular: { start: ts(`${day}T00:00:00Z`), end: ts(`${day}T06:00:00Z`) } });
  const usPeriod = (day) => ({ regular: { start: ts(`${day}T13:30:00Z`), end: ts(`${day}T20:00:00Z`) } });
  const mk = (tz, bars, meta, splits) => ({
    meta: Object.assign({ exchangeTimezoneName: tz, firstTradeDate: ts('2020-01-02T00:00:00Z') }, meta),
    timestamp: bars.map((b) => ts(b[0])), indicators: { quote: [{ close: bars.map((b) => b[1]) }] },
    events: splits ? { splits } : undefined
  });
  const sat = phase === 'satMorning';
  const fx = {
    '900001.KS': mk('Asia/Seoul', [[`${D[0]}T00:00:00Z`, 10000], [`${D[2]}T00:00:00Z`, 10500], [`${D[4]}T00:00:00Z`, 11000]],
      { currentTradingPeriod: krPeriod(sat ? '2026-10-12' : D[4]), regularMarketTime: ts(`${D[4]}T06:30:10Z`) }),
    '^KS11': mk('Asia/Seoul', [D[0], D[2], D[3], D[4]].map((d) => [`${d}T00:00:00Z`, 3000]),
      { currentTradingPeriod: krPeriod(sat ? '2026-10-12' : D[4]), regularMarketTime: ts(`${D[4]}T06:32:00Z`) }),
    'ZZDV': mk('America/New_York', [[`${D[0]}T13:30:00Z`, 100], [`${D[1]}T13:30:00Z`, 101], [`${D[3]}T13:30:00Z`, 103], [`${D[4]}T13:30:00Z`, sat ? 105 : 104]],
      { currentTradingPeriod: usPeriod(sat ? '2026-10-12' : D[4]), regularMarketTime: ts(sat ? `${D[4]}T20:00:01Z` : `${D[4]}T14:29:00Z`) }),
    '^GSPC': mk('America/New_York', [D[0], D[1], D[3], D[4]].map((d) => [`${d}T13:30:00Z`, 7000]),
      { currentTradingPeriod: usPeriod(sat ? '2026-10-12' : D[4]), regularMarketTime: ts(sat ? `${D[4]}T20:00:01Z` : `${D[4]}T14:29:00Z`) }),
    'KRW=X': mk('Europe/London', [['2026-10-04T23:00:00Z', 1300], ['2026-10-05T23:00:00Z', 1310], ['2026-10-06T23:00:00Z', 1320], ['2026-10-07T23:00:00Z', 1330],
      sat ? ['2026-10-08T23:00:00Z', 1338] : ['2026-10-09T14:29:00Z', 1340]], {})
  };
  return Object.assign(fx, overrides || {});
}

// delayMs(url): 응답을 늦출 시간(경쟁 상태 재현용).
async function routeYahoo(context, fixtures, log, delayMs) {
  await context.route(/finance\.yahoo\.com\/v8\/finance\/chart\//, async (route) => {
    const url = route.request().url();
    const m = url.match(/\/v8\/finance\/chart\/([^?]+)\?(.*)$/);
    if (!m || !/interval=1d/.test(m[2]) || !/period1=/.test(m[2])) return route.fallback();
    const symbol = decodeURIComponent(m[1]);
    if (new URL(url).hostname === 'query1.finance.yahoo.com') log.push(symbol);
    const wait = delayMs ? delayMs(url) : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const body = fixtures[symbol];
    if (!body || body.fail) return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'fail' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ chart: { result: [body], error: null } }) });
  });
}

async function routeWorker(context) {
  const writes = [];
  await context.route(WORKER, async (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().method());
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return writes;
}

async function settle(page) {
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof loadDailyPnlRows === 'function'
    && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(300);
}

async function start(page, context, clockIso, fixtures, delayMs) {
  const log = [];
  await context.clock.setFixedTime(new Date(clockIso));
  await routeYahoo(context, fixtures, log, delayMs);
  const writes = await routeWorker(context);
  await page.goto('/manifest.json');
  await page.locator('body').evaluate((el) => { el.ownerDocument.defaultView.localStorage.clear(); el.ownerDocument.defaultView.localStorage.setItem('sam_has_launched_v1', '1'); });
  await page.goto('/');
  await settle(page);
  return { log, writes };
}

// e2e/87과 같은 골든 포트폴리오: 신랑 = 국내주식 A(원장) + 원화현금(manual), 와이프 = 미국주식 B(원장) + 달러 현금(원장).
// 스냅샷은 10-05 · 10-08에만 있다(10-06 · 10-07은 앱을 열지 않은 날).
function seedGolden(page, extra) {
  return page.locator('body').evaluate((el, x) => {
    const A = (o) => Object.assign({ accountType: '일반계좌', categorySource: 'user', createdAt: 1, updatedAt: 1 }, o);
    state.assets = [
      A({ id: 'dvA', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_A', isDomestic: '국내', currency: 'KRW', quantity: 15, buyPrice: 10333, currentPrice: 11000, positionSource: 'ledger' }),
      A({ id: 'dvCash', ticker: '', owner: '신랑', category: '현금', name: 'DV_현금', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 900000, currentPrice: 900000, positionSource: 'manual' }),
      A({ id: 'dvB', ticker: 'ZZDV', owner: '와이프', category: '주식', name: 'DV_B', isDomestic: '해외', currency: 'USD', quantity: 2, buyPrice: 100, currentPrice: 104, buyRate: 1300, positionSource: 'ledger' }),
      A({ id: 'dvUsd', ticker: '', owner: '와이프', category: '현금', name: '달러', isDomestic: '해외', currency: 'USD', quantity: 1000, buyPrice: 1, currentPrice: 1, buyRate: 1300, positionSource: 'ledger' })
    ];
    const T = (o) => Object.assign({ accountType: '일반계좌', fee: 0, origin: 'period', updatedAt: 1, type: 'buy' }, o);
    state.transactions = [
      T({ id: 't1', date: '2026-10-05', owner: '신랑', ticker: '900001.KS', name: 'DV_A', quantity: 10, price: 10000, currency: 'KRW', createdAt: 1 }),
      T({ id: 't2', date: '2026-10-05', owner: '와이프', ticker: 'ZZDV', name: 'DV_B', quantity: 2, price: 100, currency: 'USD', appliedRate: 1300, createdAt: 1 }),
      T({ id: 't3', date: '2026-10-05', owner: '와이프', ticker: '', name: '달러', quantity: 1000, price: 1, currency: 'USD', appliedRate: 1300, createdAt: 1 }),
      T({ id: 't4', date: '2026-10-06', owner: '신랑', ticker: '900001.KS', name: 'DV_A', quantity: 5, price: 10500, currency: 'KRW', createdAt: 3 })
    ];
    const cat = (cash) => ({ '신랑': { '주식': { cur: 1, dailyPnL: 0 }, '현금': { cur: cash, dailyPnL: 0 } }, '와이프': { '주식': { cur: 1, dailyPnL: 0 }, '달러': { cur: 999999, dailyPnL: 0 } } });
    state.dailySnapshots = {
      '2026-10-05': { total: { cur: 1, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: cat(1000000) },
      '2026-10-08': { total: { cur: 1, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: cat(900000) }
    };
    if (x && x.mutate) (0, eval)(`(${x.mutate})`)(); // 테스트별 합성 변형
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    renderAll(); // 오늘(고정 시각) 스냅샷은 앱이 평소처럼 기록한다
  }, extra || {});
}

const pnlRowsOf = (page, days) => page.locator('body').evaluate(async (el, n) => {
  const r = await loadDailyPnlRows(n);
  return r.rows.map((x) => ({ date: x.date, s: x.owners['신랑'], w: x.owners['와이프'], t: x.total, flags: x.flags, sf: x.ownerFlags['신랑'], wf: x.ownerFlags['와이프'], reasons: x.reasons }));
}, days);

// 팝업 안에서 비동기 재계산이 끝날 때까지 기다리는 짧은 폴링(고정 시각이어도 타이머는 흐른다).
const WAIT_FOR = `async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; }`;

test('1. [Golden · U1=C] 일별 손익 D1~D5를 손계산과 일치시킨다 - 매수대금 · 현금 기록 변경은 손익이 아니고, 스냅샷이 없는 날(앱 미실행)도 막대가 있다', async ({ page, context }) => {
  const { log } = await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const opened = await page.locator('body').evaluate(async (el) => {
    const doc = el.ownerDocument;
    await openDailyPnlModal();
    const chart = doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart'));
    const tip = (i) => chart.options.plugins.tooltip.callbacks.label({ dataIndex: i, parsed: { y: chart.data.datasets[0].data[i] } });
    return {
      labels: chart.data.labels, total: chart.data.datasets[0].data, minBarLength: chart.data.datasets[0].minBarLength,
      tipTotalD5: tip(8), tipTotalD2: tip(5),
      summary: doc.getElementById('dailyPnlList').textContent.replace(/\s+/g, ' '),
      sums: [fmtSigned(12500), fmtSigned(58720), fmtSigned(71220)],
      snapKeys: Object.keys(state.dailySnapshots).sort()
    };
  });
  const requestsAfterOpen = log.length;
  const tabs = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const read = () => doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart')).data.datasets[0].data;
    doc.querySelector('#dailyPnlOwnerTabs button[data-pnl-owner="신랑"]').click();
    const chart = doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart'));
    const husband = { data: read(), tipD4: chart.options.plugins.tooltip.callbacks.label({ dataIndex: 7, parsed: { y: read()[7] } }), summary: doc.getElementById('dailyPnlList').textContent };
    doc.querySelector('#dailyPnlOwnerTabs button[data-pnl-owner="와이프"]').click();
    const wife = read();
    closeDailyPnlModal();
    return { husband, wife };
  });
  expect(opened.labels).toEqual(['10/1', '10/2', '10/3', '10/4', '10/5', '10/6', '10/7', '10/8', '10/9']);
  expect(opened.total, '합계').toEqual([0, 0, 0, 0, 0, 12120, 19520, 17340, 22240]);
  expect(tabs.husband.data, '신랑: D2 매수대금 52,500원은 손익이 아니다 · D4 현금 기록 10만원 감소도 손익이 아니다').toEqual([0, 0, 0, 0, 0, -2500, 7500, 0, 7500]);
  expect(tabs.wife, '와이프: 가격 · 환율 변화').toEqual([0, 0, 0, 0, 0, 14620, 12020, 17340, 14740]);
  expect(opened.snapKeys, '10-06 · 10-07은 스냅샷이 없는데도 막대가 있다').toEqual(['2026-10-05', '2026-10-08', '2026-10-09']);
  expect(opened.minBarLength, '손익 0원인 날도 막대가 보인다(계산 불가 null과 구분)').toBeGreaterThan(0);
  expect(opened.tipTotalD5).toContain('잠정');
  expect(opened.tipTotalD2).not.toContain('(');
  expect(tabs.husband.tipD4).toContain('추정 포함');
  expect(opened.summary).toContain('당월 기준 합계');
  opened.sums.forEach((s) => expect(opened.summary).toContain(s));
  expect(opened.summary).toContain('일별 손익은 거래내역과 각 시장의 종가·환율로 계산합니다. 사고판 금액 자체는 손익에 넣지 않습니다.');
  expect(opened.summary).toContain('오늘 값은 장중 시세에 따른 잠정값이며, 종가가 확인되면 확정됩니다.');
  expect(opened.summary).toContain('위 카드의 일간 손익은 실시간 시세로 계산해, 이 그래프의 오늘 값과 다를 수 있습니다.');
  expect(opened.summary).toContain('현금·부동산·채권은 시세가 없어 일별 손익에 넣지 않습니다.');
  expect(tabs.husband.summary).toContain('신랑 손익 합계');
  expect(log.length, '소유자 탭은 다시 조회하지 않는다').toBe(requestsAfterOpen);
  expect([...new Set(log)].sort()).toEqual(['900001.KS', 'KRW=X', 'ZZDV', '^GSPC', '^KS11']);
});

test('2. [U-A] 모든 시장 종가가 확인된 뒤에는 금요일 손익이 확정되고, 토요일은 손익 0으로 이어진다', async ({ page, context }) => {
  await start(page, context, '2026-10-10T06:00:00Z', yahooFixtures('satMorning'));
  await seedGolden(page);
  const rows = await pnlRowsOf(page, 6);
  const fri = rows.find((x) => x.date === D[4]), sat = rows.find((x) => x.date === '2026-10-10');
  expect([fri.s, fri.w, fri.t], '와이프 = 2×105×1338 − 2×103×1330 + 1000×(1338−1330)').toEqual([7500, 15000, 22500]);
  expect(fri.flags).not.toContain('provisional');
  expect(fri.wf).not.toContain('provisional');
  expect([sat.s, sat.w, sat.t]).toEqual([0, 0, 0]);
  expect(sat.flags).not.toContain('provisional');
});

test('3. [기간 통일] 두 팝업의 기간 버튼 4종 · 기본 당월 · 같은 날짜 목록 · 다시 열면 당월 · 버튼 터치 영역 44px', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const r = await page.locator('body').evaluate(async (el, waitForSrc) => {
    const doc = el.ownerDocument;
    const waitFor = (0, eval)(waitForSrc);
    const labelsOf = (id) => { const c = doc.defaultView.Chart.getChart(doc.getElementById(id)); return c ? c.data.labels : null; };
    const buttons = (sel, key) => [...doc.querySelectorAll(sel)].map((b) => ({ text: b.textContent.trim(), months: b.dataset[key], active: b.classList.contains('active'), h: b.getBoundingClientRect().height }));

    await openDailyPnlModal();
    const pnl = { buttons: buttons('#dailyPnlModal .daily-pnl-period-btn', 'pnlMonths'), labels: labelsOf('dailyPnlChart'),
      ownerTabHeights: [...doc.querySelectorAll('#dailyPnlOwnerTabs button')].map((b) => b.getBoundingClientRect().height) };
    doc.querySelector('#dailyPnlModal [data-pnl-months="3"]').click();
    await waitFor(() => (labelsOf('dailyPnlChart') || []).length > 9);
    pnl.labels3 = labelsOf('dailyPnlChart');
    pnl.prefix3 = doc.getElementById('dailyPnlList').textContent;
    closeDailyPnlModal();

    await openTotalValueModal();
    const tv = { buttons: buttons('#totalValueModal .total-value-period-btn', 'tvMonths'), labels: labelsOf('totalValueChart') };
    doc.querySelector('#totalValueModal [data-tv-months="3"]').click();
    await waitFor(() => (labelsOf('totalValueChart') || []).length > 9);
    tv.labels3 = labelsOf('totalValueChart');
    tv.prefix3 = doc.getElementById('totalValueList').textContent;
    closeTotalValueModal();

    await openDailyPnlModal();
    const reopened = { buttons: buttons('#dailyPnlModal .daily-pnl-period-btn', 'pnlMonths'), labels: labelsOf('dailyPnlChart') };
    closeDailyPnlModal();
    await openTotalValueModal();
    reopened.tvLabels = labelsOf('totalValueChart');
    closeTotalValueModal();
    return { pnl, tv, reopened };
  }, WAIT_FOR);
  const expectedButtons = () => [['당월', '1', true], ['3개월', '3', false], ['6개월', '6', false], ['1년', '12', false]];
  expect(r.pnl.buttons.map((b) => [b.text, b.months, b.active])).toEqual(expectedButtons());
  expect(r.tv.buttons.map((b) => [b.text, b.months, b.active])).toEqual(expectedButtons());
  [...r.pnl.buttons, ...r.tv.buttons].forEach((b) => expect(b.h, `${b.text} 버튼 높이`).toBeGreaterThanOrEqual(43.9));
  r.pnl.ownerTabHeights.forEach((h) => expect(h, '소유자 탭 높이').toBeGreaterThanOrEqual(43.9));
  expect(r.pnl.labels, '기본 당월 = 10/1~10/9').toEqual(['10/1', '10/2', '10/3', '10/4', '10/5', '10/6', '10/7', '10/8', '10/9']);
  expect(r.tv.labels, '총 평가금액도 같은 날짜').toEqual(r.pnl.labels);
  expect(r.pnl.labels3[0], '3개월 = 8/1부터').toBe('8/1');
  expect(r.pnl.labels3[r.pnl.labels3.length - 1]).toBe('10/9');
  expect(r.tv.labels3).toEqual(r.pnl.labels3);
  expect(r.pnl.prefix3).toContain('최근 3개월 기준 합계');
  expect(r.tv.prefix3).toContain('최근 3개월 기준');
  expect(r.reopened.buttons.map((b) => b.active)).toEqual([true, false, false, false]);
  expect(r.reopened.labels).toEqual(r.pnl.labels);
  expect(r.reopened.tvLabels).toEqual(r.pnl.labels);
});

test('4. [U4 · U3] 계산 불가 자산(manual 시세 · 원장 없는 달러 현금)이 있는 소유자와 합계는 null, 다른 소유자는 그대로 · 막대 없음', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page, { mutate: String(() => {
    state.assets.push({ id: 'dvM', ticker: '900002.KS', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'user', name: 'DV_M', isDomestic: '국내', currency: 'KRW', quantity: 3, buyPrice: 1000, currentPrice: 1000, positionSource: 'manual', createdAt: 1, updatedAt: 1 });
  }) });
  const manual = await pnlRowsOf(page, 5);
  expect(manual.map((x) => x.s)).toEqual([null, null, null, null, null]);
  expect(manual.map((x) => x.t)).toEqual([null, null, null, null, null]);
  expect(manual.map((x) => x.w), '와이프는 그대로').toEqual([0, 14620, 12020, 17340, 14740]);
  expect(manual[0].reasons).toContain('manualMarketAsset');
  const popup = await page.locator('body').evaluate(async (el) => {
    const doc = el.ownerDocument;
    await openDailyPnlModal();
    const out = { total: doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart')).data.datasets[0].data.slice(4), summary: doc.getElementById('dailyPnlList').textContent.replace(/\s+/g, ' ') };
    closeDailyPnlModal();
    return out;
  });
  expect(popup.total, '합계 막대 없음(0으로 채우지 않음)').toEqual([null, null, null, null, null]);
  expect(popup.summary).toContain('거래내역으로 과거 수량을 확인할 수 없는 자산이 있어, 그 자산을 가진 소유자와 합계는 표시하지 않습니다.');
  expect(popup.summary).toContain('표시할 값 없음');

  await seedGolden(page, { mutate: String(() => {
    state.assets.push({ id: 'dvU2', ticker: '', owner: '와이프', accountType: '일반계좌', category: '현금', categorySource: 'user', name: '달러 예금', isDomestic: '해외', currency: 'USD', quantity: 300, buyPrice: 1, currentPrice: 1, positionSource: 'manual', createdAt: 1, updatedAt: 1 });
  }) });
  const usd = await pnlRowsOf(page, 5);
  expect(usd.map((x) => x.w), '원장 없는 달러 현금 → 와이프 null').toEqual([null, null, null, null, null]);
  expect(usd.map((x) => x.s), '신랑은 그대로').toEqual([0, -2500, 7500, 0, 7500]);
  expect(usd.map((x) => x.t)).toEqual([null, null, null, null, null]);
  expect(usd[0].reasons).toContain('usdCashNoLedger');
});

test('5. [불변성 · U6] 두 팝업 계산 전후 자산 · 거래 · 스냅샷 · 설정 · 동기화 페이로드 · KPI 카드 값이 그대로 · Cloud 쓰기 0 · 부팅 때 역사 시세 조회 0', async ({ page, context }) => {
  const { log, writes } = await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const dvRequestsAtBoot = log.length;
  const fingerprint = () => page.locator('body').evaluate((el) => {
    const ls = el.ownerDocument.defaultView.localStorage;
    // 종목 마스터 캐시는 부팅 때 백그라운드로 받는 검색용 캐시라 DV와 무관하게 늦게 써질 수 있어 제외한다.
    const keys = Object.keys(ls).filter((k) => k !== 'sam_ticker_master_cache_v1').sort();
    return JSON.stringify({
      ls: keys.map((k) => [k, ls.getItem(k)]),
      assets: state.assets, tx: state.transactions, snaps: state.dailySnapshots, rebalance: state.rebalance, projection: state.projection,
      exchangeRate: state.exchangeRate, dailyChangeRate: state.dailyChangeRate, tickerRoles: state.tickerRoles, learnedTickerNames: state.learnedTickerNames,
      syncSnaps: buildSyncBlob().dailySnapshots,
      kpi: el.ownerDocument.getElementById('kpiDailyProfit').textContent, kpiTotal: el.ownerDocument.getElementById('kpiTotalValue').textContent
    });
  });
  const fp1 = await fingerprint();
  const kpi = await page.locator('body').evaluate(async (el, waitForSrc) => {
    const doc = el.ownerDocument;
    const waitFor = (0, eval)(waitForSrc);
    await openDailyPnlModal();
    doc.querySelector('#dailyPnlModal [data-pnl-months="12"]').click();
    await waitFor(() => { const c = doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart')); return c && c.data.labels.length > 300; });
    doc.querySelector('#dailyPnlOwnerTabs button[data-pnl-owner="와이프"]').click();
    closeDailyPnlModal();
    await openTotalValueModal();
    closeTotalValueModal();
    // [U6] KPI 카드는 기존 실시간 산식(calcDailyPnL · 부동산 제외 합계) 그대로다.
    const expected = fmtSigned(state.assets.filter((a) => a.category !== '부동산').reduce((acc, a) => acc + calcDailyPnL(a, calcRow(a)), 0));
    return { card: doc.getElementById('kpiDailyProfit').textContent, expected };
  }, WAIT_FOR);
  const fp2 = await fingerprint();
  expect(dvRequestsAtBoot, '부팅은 역사 시세를 조회하지 않는다').toBe(0);
  expect(fp2, 'Daily Valuation 계산은 저장 데이터 · 동기화 페이로드 · KPI를 바꾸지 않는다').toBe(fp1);
  expect(kpi.card).toBe(kpi.expected);
  expect(writes).toEqual([]);
});

test('6. [팝업 갱신] 일별 손익 팝업이 열린 채 시세 갱신이 끝나면 새 시세로 다시 계산한다(불러오는 중 표시 없이) · 닫혀 있으면 계산하지 않는다', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const r = await page.locator('body').evaluate(async (el) => {
    const win = el.ownerDocument.defaultView;
    await openDailyPnlModal();
    const calls = [];
    const original = win.updateDailyPnlModal;
    win.updateDailyPnlModal = (opts) => { calls.push(opts || null); return original(opts); };
    await refreshPricesAndRates();
    const openCalls = calls.length;
    closeDailyPnlModal();
    await refreshPricesAndRates();
    win.updateDailyPnlModal = original;
    return { openCalls, afterClose: calls.length, opts: calls[0] };
  });
  expect(r.openCalls).toBe(1);
  expect(r.opts).toEqual({ silent: true, fresh: true });
  expect(r.afterClose, '팝업이 닫혀 있으면 다시 계산하지 않는다').toBe(1);
});

test('7. [경쟁 상태] 기간을 빠르게 바꾸면 마지막으로 누른 기간 결과만 그린다 - 늦게 도착한 이전 요청은 버린다', async ({ page, context }) => {
  // 1년 조회(시작일이 6월 이전)만 1.2초 늦게 응답한다.
  const slowOld = (url) => { const p1 = Number((url.match(/period1=(\d+)/) || [])[1]); return p1 && p1 < ts('2026-06-01T00:00:00Z') ? 1200 : 0; };
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'), slowOld);
  await seedGolden(page);
  const r = await page.locator('body').evaluate(async (el) => {
    const doc = el.ownerDocument;
    await openDailyPnlModal();
    doc.querySelector('#dailyPnlModal [data-pnl-months="12"]').click();
    doc.querySelector('#dailyPnlModal [data-pnl-months="1"]').click();
    await new Promise((res) => setTimeout(res, 2500));
    const chart = doc.defaultView.Chart.getChart(doc.getElementById('dailyPnlChart'));
    const out = { labels: chart.data.labels.length, active: doc.querySelector('#dailyPnlModal .daily-pnl-period-btn.active').dataset.pnlMonths, summary: doc.getElementById('dailyPnlList').textContent };
    closeDailyPnlModal();
    return out;
  });
  expect(r.active).toBe('1');
  expect(r.labels, '당월(9일) 결과가 남는다').toBe(9);
  expect(r.summary).toContain('당월 기준 합계');
});

test('8. [M4 · 조회 실패] 분할이 있으면 분할일까지 손익을 계산하지 않고, 시세를 못 받은 종목의 소유자 · 합계는 표시하지 않는다', async ({ page, context }) => {
  const split = yahooFixtures('friNight');
  split.ZZDV = Object.assign({}, split.ZZDV, { events: { splits: { s: { date: ts(`${D[3]}T13:30:00Z`), numerator: 2, denominator: 1, splitRatio: '2:1' } } } });
  await start(page, context, '2026-10-09T14:30:00Z', split);
  await seedGolden(page);
  const rows = await pnlRowsOf(page, 5);
  expect(rows.map((r) => r.w), '분할일(10-08)까지 null').toEqual([null, null, null, null, 14740]);
  expect(rows.map((r) => r.t)).toEqual([null, null, null, null, 22240]);
  expect(rows[3].reasons).toContain('corporateActionUnverified');
  expect(rows.map((r) => r.s), '신랑은 그대로').toEqual([0, -2500, 7500, 0, 7500]);
});

test('8-b. [조회 실패] 한 종목 일봉을 받지 못하면 그 종목을 보유한 날의 소유자 · 합계만 표시하지 않는다(보유 전은 실제 0)', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight', { ZZDV: { fail: true } }));
  await seedGolden(page);
  const rows = await pnlRowsOf(page, 9);
  expect(rows.slice(0, 4).map((r) => r.w), '보유 전(10-01~04) = 0').toEqual([0, 0, 0, 0]);
  expect(rows.slice(4).map((r) => r.w)).toEqual([null, null, null, null, null]);
  expect(rows.slice(4).map((r) => r.s)).toEqual([0, -2500, 7500, 0, 7500]);
  expect(rows[4].reasons).toContain('fetchFailed');
  expect(errors).toEqual([]);
});

test('9. [기기 초기화 회귀] 일별 손익 팝업이 열린 채 기기 데이터를 초기화하면 오류 없이 빈 안내로 다시 그린다', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const r = await page.locator('body').evaluate(async (el, waitForSrc) => {
    const doc = el.ownerDocument;
    const waitFor = (0, eval)(waitForSrc);
    await openDailyPnlModal();
    doc.getElementById('resetDataBtn').click();
    const ok = await waitFor(() => doc.getElementById('dailyPnlChartMsg').textContent.includes('계산할 수 있는 날이 아직 없습니다'));
    const out = { ok, hiddenChart: doc.getElementById('dailyPnlChart').classList.contains('hidden'), assets: state.assets.length, tx: state.transactions.length, snaps: Object.keys(state.dailySnapshots).length };
    closeDailyPnlModal();
    return out;
  }, WAIT_FOR);
  expect(r).toEqual({ ok: true, hiddenChart: true, assets: 0, tx: 0, snaps: 0 });
  expect(errors).toEqual([]);
});
