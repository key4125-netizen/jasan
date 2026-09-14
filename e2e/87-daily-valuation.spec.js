// E2E-87 [D-1~D-4 Daily Valuation] 총자산 추이 그래프 = 거래내역 + 시장 현지일 종가 · 환율 + 마지막 기록값 유지.
//
// PM · 사용자 확정 정책: D-1(원장 기반 · 스냅샷 보존) · D-3-A/B(현금·부동산·채권 마지막 기록값 유지, 첫 기록 전 계산 안 함) ·
// D-3-C(신랑/와이프/합계 한 그래프) · D-4-U1(시장 현지 날짜) · D-4-U2(K=3) · U-A(오늘 잠정 → 종가 확인 후 확정) ·
// U-B(계산 불가 자산이 있으면 그 소유자·합계 null) · M4(분할 이전 계산 안 함) · 삭제 자산은 거래만으로 복원하지 않음.
//
// 시세는 route로 가짜 Yahoo 일봉을 준다(합성 데이터). 부팅 때 나가는 기존 시세 요청은 그대로 DNS 단계에서 막힌다.
// 시각은 context.clock으로 고정한다. 실제 사용자 데이터 · 실제 Cloud를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const ts = (iso) => Date.parse(iso) / 1000;
const D = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']; // 월~금

// phase: 'friNight'(한국 금 23:30 · 뉴욕 장중) | 'satMorning'(한국 토 15:00 · 모든 시장 종가 확정 뒤)
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

async function routeYahoo(context, fixtures, log) {
  await context.route(/finance\.yahoo\.com\/v8\/finance\/chart\//, async (route) => {
    const url = route.request().url();
    const m = url.match(/\/v8\/finance\/chart\/([^?]+)\?(.*)$/);
    if (!m || !/interval=1d/.test(m[2]) || !/period1=/.test(m[2])) return route.fallback();
    const symbol = decodeURIComponent(m[1]);
    if (new URL(url).hostname === 'query1.finance.yahoo.com') log.push(symbol);
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
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof loadDailyValuationRows === 'function'
    && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(300);
}

async function start(page, context, clockIso, fixtures) {
  const log = [];
  await context.clock.setFixedTime(new Date(clockIso));
  await routeYahoo(context, fixtures, log);
  const writes = await routeWorker(context);
  await page.goto('/manifest.json');
  await page.locator('body').evaluate((el) => { el.ownerDocument.defaultView.localStorage.clear(); el.ownerDocument.defaultView.localStorage.setItem('sam_has_launched_v1', '1'); });
  await page.goto('/');
  await settle(page);
  return { log, writes };
}

// 골든 포트폴리오: 신랑 = 국내주식 A(원장) + 원화현금(manual · 기록값 유지), 와이프 = 미국주식 B(원장) + 달러 현금(원장).
// A의 D2 거래는 D3에 뒤늦게 입력한 것(createdAt이 가장 늦다).
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
    if (x && x.mutate) (0, eval)(`(${x.mutate})`)(); // 테스트별 합성 변형(자산 추가·삭제 등)
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    renderAll(); // 오늘(고정 시각) 스냅샷은 앱이 평소처럼 기록한다
  }, extra || {});
}

const rowsOf = (page, days) => page.locator('body').evaluate(async (el, n) => {
  const r = await loadDailyValuationRows(n);
  return r.rows.map((x) => ({ date: x.date, s: x.owners['신랑'], w: x.owners['와이프'], t: x.total, flags: x.flags, sf: x.ownerFlags['신랑'], wf: x.ownerFlags['와이프'], reasons: x.reasons }));
}, days);

test('1. [Golden] D1~D5 신랑·와이프·합계를 손계산과 일치시킨다 - 휴장 직전값 · 결측 추정 · 마지막 기록값 · 한국 확정/미국 잠정', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const rows = await rowsOf(page, 30);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  expect(rows).toHaveLength(30);
  expect(rows.filter((r) => r.date < '2026-10-05').every((r) => r.s === null && r.w === null && r.t === null), '첫 기록 이전은 계산하지 않는다').toBe(true);
  expect(D.map((d) => [byDate[d].s, byDate[d].w, byDate[d].t])).toEqual([
    [1100000, 1560000, 2660000],
    [1150000, 1574620, 2724620],
    [1157500, 1586640, 2744140],
    [1057500, 1603980, 2661480],
    [1065000, 1618720, 2683720]
  ]);
  expect(byDate[D[0]].sf).toEqual(['maintained']);
  expect(byDate[D[1]].sf, '국내 휴장 = 직전 확정가 유지(표시 없음)').toEqual(['maintained', 'closedCarry']);
  expect(byDate[D[2]].wf, '미국 휴장 = 직전 확정가 유지').toEqual(['closedCarry']);
  expect(byDate[D[3]].sf, '국내 종목만 결측 1거래일 = 추정').toEqual(['estimated', 'maintained']);
  expect(byDate[D[4]].sf, '한국 장 종료 · 종가 확인 = 확정').toEqual(['maintained']);
  expect(byDate[D[4]].wf, '뉴욕 장중 = 잠정').toEqual(['provisional']);
  expect(byDate[D[4]].flags).toContain('provisional');
});

test('2. [positionsAsOf] 뒤늦게 입력한 과거 거래는 그 거래일부터만 반영되고 이전 날짜 값은 바뀌지 않는다 · 원장 함수 결과 동일', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page, { mutate: String(() => { state.transactions = state.transactions.filter((t) => t.id !== 't4'); state.assets[0].quantity = 10; }) });
  const before = await rowsOf(page, 5);
  const same = await page.locator('body').evaluate(() => JSON.stringify(computePositionsAndRealizedPnL()) === JSON.stringify(computePositionsAndRealizedPnL(state.transactions)));
  await page.locator('body').evaluate(() => {
    state.transactions.push({ id: 't4', date: '2026-10-06', owner: '신랑', accountType: '일반계좌', ticker: '900001.KS', name: 'DV_A', type: 'buy', quantity: 5, price: 10500, currency: 'KRW', fee: 0, origin: 'period', createdAt: 3, updatedAt: 3 });
    syncAssetsFromTransactions();
  });
  const after = await rowsOf(page, 5);
  expect(same).toBe(true);
  expect(before.map((r) => r.s)).toEqual([1100000, 1100000, 1105000, 1005000, 1010000]);
  expect(after.map((r) => r.s)).toEqual([1100000, 1150000, 1157500, 1057500, 1065000]);
  expect(after[0], 'D1은 그대로').toEqual(before[0]);
});

test('3. [팝업] 신랑/와이프/합계 한 그래프 · null 공백 · 잠정/추정/기록값 글자 표시 · 계산 전후 데이터 불변 · Cloud 쓰기 0', async ({ page, context }) => {
  const { log, writes } = await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const dvRequestsAtBoot = log.length;
  const fingerprint = () => page.locator('body').evaluate((el) => JSON.stringify({
    ls: Object.keys(el.ownerDocument.defaultView.localStorage).sort().map((k) => [k, el.ownerDocument.defaultView.localStorage.getItem(k)]),
    assets: state.assets, tx: state.transactions, snaps: state.dailySnapshots, rebalance: state.rebalance, projection: state.projection,
    kpi: el.ownerDocument.getElementById('kpiTotalValue').textContent
  }));
  const fp1 = await fingerprint();
  const r = await page.locator('body').evaluate(async (el) => {
    const doc = el.ownerDocument;
    await openTotalValueModal();
    const chart = doc.defaultView.Chart.getChart(doc.getElementById('totalValueChart'));
    const n = chart.data.labels.length;
    const label = (dsIdx, i) => chart.options.plugins.tooltip.callbacks.label({ dataset: chart.data.datasets[dsIdx], dataIndex: i, parsed: { y: chart.data.datasets[dsIdx].data[i] } });
    const out = {
      datasets: chart.data.datasets.map((ds) => ds.label), spanGaps: chart.options.spanGaps,
      last5: chart.data.datasets.map((ds) => ds.data.slice(n - 5)), earlierNull: chart.data.datasets.every((ds) => ds.data.slice(0, n - 5).every((v) => v === null)),
      tipTotalToday: label(0, n - 1), tipHusbandD4: label(1, n - 2), tipWifeD3: label(2, n - 3),
      summary: doc.getElementById('totalValueList').textContent.replace(/\s+/g, ' ')
    };
    closeTotalValueModal();
    return out;
  });
  const fp2 = await fingerprint();
  expect(dvRequestsAtBoot, '부팅은 역사 시세를 조회하지 않는다').toBe(0);
  expect(r.datasets).toEqual(['합계', '신랑', '와이프']);
  expect(r.spanGaps).toBe(false);
  expect(r.last5).toEqual([[2660000, 2724620, 2744140, 2661480, 2683720], [1100000, 1150000, 1157500, 1057500, 1065000], [1560000, 1574620, 1586640, 1603980, 1618720]]);
  expect(r.earlierNull, '첫 기록 이전은 0이 아니라 공백').toBe(true);
  expect(r.tipTotalToday).toContain('잠정');
  expect(r.tipHusbandD4).toContain('추정 포함');
  expect(r.tipHusbandD4).toContain('마지막 기록값 포함');
  expect(r.tipWifeD3, '휴장일 직전값 유지는 따로 표시하지 않는다').not.toContain('(');
  expect(r.summary).toContain('오늘 값은 현재 정규장 시세를 반영한 잠정값이며, 종가가 확인되면 확정됩니다.');
  expect(r.summary).toContain('시세를 받지 못한 날은 직전 확정값을 기준으로 추정합니다.');
  expect(r.summary).toContain('현금·부동산·채권은 앱에 마지막으로 기록된 값을 이어서 사용합니다.');
  expect(r.summary).toContain('거래내역과 현금 잔액은 자동으로 연결되지 않으므로');
  expect(r.summary).toContain('계산할 수 없는 날은 표시하지 않습니다.');
  expect(fp2, 'Daily Valuation 계산은 거래·자산·스냅샷·저장소·KPI를 바꾸지 않는다').toBe(fp1);
  expect(writes).toEqual([]);
  expect([...new Set(log)].sort()).toEqual(['900001.KS', 'KRW=X', 'ZZDV', '^GSPC', '^KS11']);
});

test('4. [U-A] 모든 시장 종가가 확인된 뒤에는 금요일 값이 확정되고, 토요일은 직전 확정값 유지로 표시 없이 이어진다', async ({ page, context }) => {
  await start(page, context, '2026-10-10T06:00:00Z', yahooFixtures('satMorning'));
  await seedGolden(page);
  const rows = await rowsOf(page, 6);
  const fri = rows.find((x) => x.date === D[4]), sat = rows.find((x) => x.date === '2026-10-10');
  expect([fri.s, fri.w, fri.t]).toEqual([1065000, 1618980, 2683980]);
  expect(fri.flags.includes('provisional') || fri.wf.includes('provisional')).toBe(false);
  expect([sat.s, sat.w, sat.t]).toEqual([1065000, 1618980, 2683980]);
  expect(sat.flags).not.toContain('provisional');
});

test('5. [U-B · 분류] manual 시세 자산 · 티커 없는 주식 · 원장 불일치 자산은 그 소유자와 합계를 null로 만들고 다른 소유자는 그대로다', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  const variants = {
    manual: String(() => { state.assets.push({ id: 'm1', ticker: 'ZZMAN', owner: '와이프', accountType: '일반계좌', category: '주식', categorySource: 'user', name: 'DV_M', isDomestic: '해외', currency: 'USD', quantity: 3, buyPrice: 10, currentPrice: 10, positionSource: 'manual', createdAt: 1, updatedAt: 1 }); }),
    tickerless: String(() => { state.assets.push({ id: 'n1', ticker: '', owner: '와이프', accountType: '일반계좌', category: '주식', categorySource: 'user', name: 'DV_펀드', isDomestic: '국내', currency: 'KRW', quantity: 3, buyPrice: 10, currentPrice: 10, createdAt: 1, updatedAt: 1 }); }),
    mismatch: String(() => { state.assets[2].positionSource = undefined; state.assets[2].quantity = 3; })
  };
  const out = {};
  for (const [name, mutate] of Object.entries(variants)) {
    await seedGolden(page, { mutate });
    out[name] = await rowsOf(page, 5);
  }
  for (const [name, rows] of Object.entries(out)) {
    expect(rows.map((r) => r.s), `${name}: 신랑은 그대로`).toEqual([1100000, 1150000, 1157500, 1057500, 1065000]);
    expect(rows.every((r) => r.w === null && r.t === null), `${name}: 와이프 · 합계는 계산하지 않는다`).toBe(true);
  }
  expect(out.manual[0].reasons).toContain('manualMarketAsset');
  expect(out.tickerless[0].reasons).toContain('tickerlessMarketAsset');
  expect(out.mismatch[0].reasons).toContain('ledgerMismatch');
});

test('6. [삭제 자산] 자산 목록에서 지운 종목은 거래가 남아 있어도 복원해서 더하지 않는다', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page, { mutate: String(() => { state.assets = state.assets.filter((a) => a.id !== 'dvB'); }) });
  const rows = await rowsOf(page, 5);
  expect(rows.map((r) => r.w), '와이프 = 달러 현금만').toEqual([1300000, 1310000, 1320000, 1330000, 1340000]);
  expect(rows.map((r) => r.t)).toEqual([2400000, 2460000, 2477500, 2387500, 2405000]);
});

test('7. [M4 · 조회 실패] 보유 중 분할 이벤트가 있으면 그 이전 날짜는 계산하지 않고, 시세를 못 받은 종목의 소유자는 표시하지 않는다', async ({ page, context }) => {
  const split = yahooFixtures('friNight');
  split.ZZDV = Object.assign({}, split.ZZDV, { events: { splits: { s: { date: ts(`${D[3]}T13:30:00Z`), numerator: 2, denominator: 1, splitRatio: '2:1' } } } });
  await start(page, context, '2026-10-09T14:30:00Z', split);
  await seedGolden(page);
  const rows = await rowsOf(page, 5);
  expect(rows.map((r) => r.w)).toEqual([null, null, null, 1603980, 1618720]);
  expect(rows.map((r) => r.t)).toEqual([null, null, null, 2661480, 2683720]);
  expect(rows[0].reasons).toContain('corporateActionUnverified');
  const note = await page.locator('body').evaluate(async (el) => {
    totalValuePopupDays = 30;
    await openTotalValueModal();
    const t = el.ownerDocument.getElementById('totalValueList').textContent;
    closeTotalValueModal();
    // 와이프·합계는 D4부터 있다 - 요약은 모든 선을 합계와 같은 첫날(D4)·마지막날(D5)로 비교해 소유자 증감의 합이 합계 증감과 같다.
    return { t, husband: fmtSigned(1065000 - 1057500), wife: fmtSigned(1618720 - 1603980), total: fmtSigned(2683720 - 2661480), husbandFromD1: fmtSigned(1065000 - 1100000) };
  });
  expect(note.t).toContain('분할 또는 병합 이력을 안전하게 반영할 수 없어');
  expect(note.t).toContain(note.husband);
  expect(note.t).toContain(note.wife);
  expect(note.t).toContain(note.total);
  expect(note.t, '신랑만 다른 첫날(D1)로 비교하지 않는다').not.toContain(note.husbandFromD1);
});

test('8. [조회 실패] 한 종목 일봉을 받지 못하면 그 소유자·합계만 표시하지 않고 오류 없이 그린다', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight', { ZZDV: { fail: true } }));
  await seedGolden(page);
  const rows = await rowsOf(page, 5);
  expect(rows.map((r) => r.s)).toEqual([1100000, 1150000, 1157500, 1057500, 1065000]);
  expect(rows.every((r) => r.w === null && r.t === null)).toBe(true);
  expect(rows[0].reasons).toContain('fetchFailed');
  expect(errors).toEqual([]);
});

test('9. [팝업 갱신] 팝업이 열린 채 시세 갱신이 끝나면 다시 계산한다(불러오는 중 표시 없이)', async ({ page, context }) => {
  await start(page, context, '2026-10-09T14:30:00Z', yahooFixtures('friNight'));
  await seedGolden(page);
  const r = await page.locator('body').evaluate(async (el) => {
    const win = el.ownerDocument.defaultView;
    await openTotalValueModal();
    const calls = [];
    const original = win.updateTotalValueModal;
    win.updateTotalValueModal = (opts) => { calls.push(opts || null); return original(opts); };
    await refreshPricesAndRates();
    const closedCalls = calls.length;
    closeTotalValueModal();
    await refreshPricesAndRates();
    win.updateTotalValueModal = original;
    return { closedCalls, afterClose: calls.length, silent: calls[0] && calls[0].silent };
  });
  expect(r.closedCalls).toBe(1);
  expect(r.silent).toBe(true);
  expect(r.afterClose, '팝업이 닫혀 있으면 다시 계산하지 않는다').toBe(1);
});
