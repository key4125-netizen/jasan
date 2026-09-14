// E2E-82 [P0 HISTORICAL SNAPSHOT INTEGRITY] 과거 일별 이력은 자동으로 만들어지거나 다시 쓰이지 않는다.
//
// PM 확정 정책(D1 · D2 · D3):
//   D1 부팅·pull·가져오기의 자동 재구성이 기존 과거 스냅샷의 cur을 지금 보유 기준으로 다시 계산해 덮어쓰지 않는다.
//   D2 자동 소급 채우기가 기록이 없는 과거 날짜를 지금 수량·환율로 만들어내지 않는다.
//   D3 스냅샷이 없는 날은 그래프·요약에서 null(공백)이다. 스냅샷이 있고 값이 0이면 0이다.
// JSON 복원·동기화 병합으로 받은 과거 이력은 재부팅 뒤에도 그대로여야 하고, 이후 이력 경로에서 과거 이력이 Cloud로
// 다시 올라가면 안 된다(오늘 기록 push는 기존대로).
// [PM 지시 2/3] 일별 이력 복구 기능이 제거되어, 예전에 복구 API로 검증하던 T2·T7·T8·T9·R0-1·R0-4는 같은 성질(받거나
// 저장된 과거 이력 불변)을 JSON 복원·동기화 병합(pull 경로)·직접 저장으로 검증한다.
//
// 전부 합성 데이터다. 실제 사용자 데이터·실제 백업·실제 Cloud를 쓰지 않는다(Worker는 route로 가로챈다).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;

// 부팅 비동기 작업(시세 갱신 → finally)이 끝날 때까지 기다린다. 검증환경은 외부 시세가 DNS 단계에서 막혀 곧 끝난다.
async function settle(page) {
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof pullFromCloud === 'function' && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(500);
}
async function open(page) { await page.goto('/'); await settle(page); }
async function reboot(page) { await page.reload(); await settle(page); }

async function routeWrites(context) {
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return writes;
}

// 합성 포트폴리오 + 과거 이력. o.days: 과거 일수, o.gaps: [from, to] 기록 없는 구간, o.realZeroDay: 값 0으로 기록된 날.
function seedHistory(page, opts) {
  return page.locator('body').evaluate((el, o) => {
    const A = (id, t, own, cat, qty, price, ccy) => ({
      id, ticker: t, owner: own, accountType: '일반계좌', category: cat, categorySource: 'user', name: 'E82_' + id,
      isDomestic: ccy === 'USD' ? '해외' : '국내', currency: ccy, quantity: qty, buyPrice: price, currentPrice: price,
      positionSource: 'manual', createdAt: 1000, updatedAt: 1000
    });
    state.assets = [A('k1', '005930', '신랑', '주식', 10, 70000, 'KRW'), A('u1', 'QQQM', '와이프', 'ETF', 5, 190, 'USD'),
      A('r1', '', '신랑', '부동산', 1, 300000000, 'KRW')];
    state.transactions = [];
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const snaps = {};
    for (let n = 1; n <= (o.days || 120); n++) {
      if (o.gaps && n >= o.gaps[0] && n <= o.gaps[1]) continue;
      const g = new Date(); g.setDate(g.getDate() - n);
      const wk = g.getDay() === 0 || g.getDay() === 6;
      const p1 = wk ? 0 : ((n % 9) - 4) * 1234.5, p2 = wk ? 0 : ((n % 5) - 2) * 321.25;
      const c1 = 310000000 + n * 1111, c2 = 1300000 + n * 77.7, c3 = 250000 + n;
      snaps[dk(n)] = {
        total: { cur: c1 + c2 + c3, dailyPnL: p1 + p2 },
        byOwner: { '신랑': { cur: c1, dailyPnL: p1 }, '와이프': { cur: c2 + c3, dailyPnL: p2 } },
        byOwnerCategory: {
          '신랑': { '주식': { cur: c1 - 300000000, dailyPnL: p1 }, '부동산': { cur: 300000000, dailyPnL: 0 } },
          '와이프': { 'ETF': { cur: c2, dailyPnL: p2 }, '달러': { cur: c3, dailyPnL: 0 } }
        }
      };
    }
    if (o.realZeroDay) snaps[dk(o.realZeroDay)] = { total: { cur: 0, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
    state.dailySnapshots = snaps;
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2'); // 예전엔 지문이 없으면 소급 대상이었다
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    renderAll();
  }, opts || {});
}

// 오늘을 뺀 과거 이력(메모리·저장소)을 키 정렬 JSON으로 굳힌다 - 오늘 기록은 실시간으로 바뀌는 게 정상이다.
function historySnapshot(page) {
  return page.locator('body').evaluate(() => {
    const today = todayDateStr();
    const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((acc, k) => { acc[k] = sortK(x[k]); return acc; }, {}) : x);
    const pick = (src) => { const o = {}; Object.keys(src).forEach((k) => { if (k !== today) o[k] = src[k]; }); return JSON.stringify(sortK(o)); };
    return {
      mem: pick(state.dailySnapshots),
      stored: pick(JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}')),
      count: Object.keys(state.dailySnapshots).filter((k) => k !== today).length
    };
  });
}

// 과거 시세 조회를 합성 종가로 바꾸고 호출 수를 센다. gated면 풀어줄 때까지 응답을 붙잡는다(경쟁 상태 재현).
function stubHistory(page, gated) {
  return page.locator('body').evaluate((el, g) => {
    const win = el.ownerDocument.defaultView;
    win.__historyCalls = 0;
    win.__historyGate = g ? new Promise((r) => { win.__releaseHistory = r; }) : null;
    win.fetchDailyHistory = async () => {
      win.__historyCalls++;
      if (win.__historyGate) await win.__historyGate;
      const pts = [];
      for (let i = 400; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); pts.push({ date: d, close: 10000 + (400 - i) * 10 }); }
      return pts;
    };
  }, !!gated);
}

function fingerprint(page) {
  return page.locator('body').evaluate(() => JSON.stringify({
    assets: state.assets, transactions: state.transactions, rebalance: state.rebalance, projection: state.projection,
    tickerRoles: state.tickerRoles, learnedTickerNames: state.learnedTickerNames,
    exchangeRate: state.exchangeRate, dailyChangeRate: state.dailyChangeRate,
    scenarioRates: localStorage.getItem('sam_custom_scenario_rates')
  }));
}

/* ── T1 부팅 불변 ───────────────────────────────────────────────────── */

test('T1. [P0 D1·D2] 부팅해도 과거 이력(cur·dailyPnL·소유자·자산군)이 한 글자도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 120 });
  const before = await historySnapshot(page);
  expect(before.count).toBe(120);
  expect(before.mem).toBe(before.stored);

  await reboot(page);
  const after1 = await historySnapshot(page);
  expect(after1.stored, '부팅 1회 뒤 저장된 과거 이력').toBe(before.stored);
  expect(after1.mem, '부팅 1회 뒤 메모리의 과거 이력').toBe(before.stored);

  await reboot(page);
  expect((await historySnapshot(page)).stored, '부팅 2회 뒤').toBe(before.stored);
});

/* ── T2 JSON 복원으로 받은 이력 · 재부팅 3회 ────────────────────────── */

// [PM 지시 2/3] 예전 T2는 일별 이력 복구 API로 받은 이력을 검증했다. 복구 기능이
// 제거되어, 과거 이력을 통째로 받는 남은 사용자 경로인 JSON 복원(applyRemoteState)으로 같은 성질을 검증한다.
test('T2. [P0] JSON 복원으로 받은 과거 이력은 부팅 3회 뒤에도 파일 값 그대로다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 3 });
  const backup = await page.locator('body').evaluate(async () => {
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const snaps = {};
    for (let n = 4; n <= 120; n++) {
      const cur = 40000000 + n * 12345.67;
      const pnl = n % 7 === 3 ? 0 : ((n % 5) - 2) * 1000.5;
      snaps[dk(n)] = { total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } }, byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } } };
    }
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    blob.dailySnapshots = JSON.parse(JSON.stringify(snaps));
    await applyRemoteState(blob);
    return snaps;
  });
  const restoredDiff = () => page.locator('body').evaluate((el, bk) => {
    const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((acc, k) => { acc[k] = sortK(x[k]); return acc; }, {}) : x);
    const stored = JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}');
    return Object.keys(bk).filter((d) => JSON.stringify(sortK(stored[d])) !== JSON.stringify(sortK(bk[d]))).length;
  }, backup);
  expect(await restoredDiff(), '복원 직후 = 파일 값').toBe(0);
  const baseline = await historySnapshot(page);

  for (let i = 1; i <= 3; i++) {
    await reboot(page);
    expect(await restoredDiff(), `부팅 ${i}회 뒤 복원한 날짜가 파일과 달라졌다`).toBe(0);
    const h = await historySnapshot(page);
    expect(h.stored, `부팅 ${i}회 뒤 과거 이력 전체(저장소)`).toBe(baseline.stored);
    expect(h.mem, `부팅 ${i}회 뒤 과거 이력 전체(메모리)`).toBe(baseline.stored);
  }
});

/* ── T3 포트폴리오 변경 ─────────────────────────────────────────────── */

test('T3. [P0 D1·D2] 매수·매도·자산 추가·삭제·소유자·자산군 변경 뒤에도 과거 이력이 그대로다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 90 });
  await stubHistory(page);
  const before = await historySnapshot(page);

  const r = await page.locator('body').evaluate(async (el) => {
    const win = el.ownerDocument.defaultView;
    state.assets[0].quantity = 4;                                  // 매도
    state.assets[1].quantity = 20;                                 // 매수
    state.assets.push({ ...state.assets[0], id: 'k2', ticker: '000660', name: 'E82_k2', quantity: 3 }); // 티커 자산 추가(예전엔 소급 대상)
    state.assets = state.assets.filter((a) => a.id !== 'r1');      // 자산 삭제
    state.assets[1].owner = '신랑';                                // 소유자 변경
    state.assets[0].category = 'ETF';                              // 자산군 변경
    persistAssets(true);
    renderAll();
    await backfillAllHoldingsDailyPnlHistory();                    // 부팅·pull·가져오기가 부르던 경로
    await backfillDailyPnlHistory(state.assets[2]);                // 자산 추가·거래원장이 부르던 경로
    reconstructHistoricalCurValues();
    return { historyCalls: win.__historyCalls };
  });
  expect(r.historyCalls, '과거 시세를 조회해 과거를 만들지 않는다').toBe(0);
  const after = await historySnapshot(page);
  expect(after.mem, '메모리의 과거 이력').toBe(before.stored);
  expect(after.stored, '저장된 과거 이력').toBe(before.stored);

  await reboot(page);
  expect((await historySnapshot(page)).stored, '변경한 포트폴리오로 재부팅한 뒤에도 그대로').toBe(before.stored);
});

test('T3-b. [P0 D2] 매수일이 30일 전인 자산이 있는 빈 기기에서도 과거 날짜를 만들어내지 않는다', async ({ page }) => {
  await open(page);
  await stubHistory(page);
  const r = await page.locator('body').evaluate(async (el) => {
    const win = el.ownerDocument.defaultView;
    state.assets = [{ id: 't1', ticker: '005930', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'user',
      name: 'E82_t1', isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 50000, currentPrice: 50000,
      positionSource: 'manual', createdAt: 1, updatedAt: 1 }];
    const d = new Date(); d.setDate(d.getDate() - 30);
    state.transactions = [{ id: 'tx1', date: dateKeyFromDate(d), owner: '신랑', accountType: '일반계좌', ticker: '005930',
      name: 'E82_t1', type: 'buy', quantity: 10, price: 50000, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    state.dailySnapshots = {};
    renderAll();
    await backfillAllHoldingsDailyPnlHistory();
    await backfillDailyPnlHistory(state.assets[0]);
    const today = todayDateStr();
    return { past: Object.keys(state.dailySnapshots).filter((k) => k < today).length, historyCalls: win.__historyCalls };
  });
  expect(r.past, '예전엔 매수일 이전 221일에 손익·평가액이 생겼다').toBe(0);
  expect(r.historyCalls).toBe(0);
});

/* ── T4 · T5 그래프 ─────────────────────────────────────────────────── */

test('T4. [P0 D3] 기록이 없는 날은 시계열·차트에서 null(공백)이다 - 0원으로 떨어지지 않는다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 40, gaps: [11, 15] });
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView; const doc = el.ownerDocument;
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const gaps = [11, 12, 13, 14, 15].map(dk);
    const label = (g) => `${Number(g.slice(5, 7))}/${Number(g.slice(8, 10))}`;
    const gapLabels = gaps.map(label);
    const tv = buildTotalValueSeries(30);
    const dp = buildDailyPnlSeries(30);

    // [D-1 Daily Valuation] 총자산 추이 팝업은 이제 원장 기반 Daily Valuation을 그린다(e2e/87에서 검증). 여기서는 스냅샷(기록)
    // 시리즈를 같은 렌더러로 직접 그려, 기록 없는 날이 null로 끊기고 기록된 0은 0으로 그려지는 성질을 계속 고정한다.
    const tvModal = doc.getElementById('totalValueModal');
    tvModal.classList.remove('hidden');
    renderTotalValueChart(tv);
    const lc = win.Chart.getChart(doc.getElementById('totalValueChart'));
    const li = lc.data.labels.map((l, i) => i).filter((i) => gapLabels.includes(lc.data.labels[i]));
    const lineGapValues = lc.data.datasets.map((ds) => li.map((i) => ds.data[i]));
    const lineSpanGaps = lc.options.spanGaps;
    tvModal.classList.add('hidden');

    openDailyPnlModal();
    dailyPnlPopupDays = 30; updateDailyPnlModal();
    const bc = win.Chart.getChart(doc.getElementById('dailyPnlChart'));
    const bi = bc.data.labels.map((l, i) => i).filter((i) => gapLabels.includes(bc.data.labels[i]));
    const barGapValues = bi.map((i) => bc.data.datasets[0].data[i]);
    const barNonGapNull = bc.data.datasets[0].data.filter((v, i) => !bi.includes(i) && v === null).length;
    closeDailyPnlModal();

    return {
      tvGap: tv.filter((x) => gaps.includes(x.date)).map((x) => [x.recorded, x.total, Object.keys(x.byOwnerAmounts).length]),
      dpGap: dp.filter((x) => gaps.includes(x.date)).map((x) => [x.recorded, x.total]),
      tvOthersNumeric: tv.filter((x) => !gaps.includes(x.date)).every((x) => x.recorded && typeof x.total === 'number'),
      lineGapLabels: li.length, lineGapValues, lineSpanGaps, datasets: lc.data.datasets.length,
      barGapLabels: bi.length, barGapValues, barNonGapNull
    };
  });
  expect(r.tvGap).toEqual(Array(5).fill([false, null, 0]));
  expect(r.dpGap).toEqual(Array(5).fill([false, null]));
  expect(r.tvOthersNumeric, '기록된 날은 숫자다').toBe(true);
  expect(r.lineGapLabels).toBe(5);
  expect(r.datasets, '합계 + 소유자 2').toBe(3);
  r.lineGapValues.forEach((vals) => expect(vals, '합계·소유자 라인 모두 공백이다').toEqual([null, null, null, null, null]));
  expect(r.lineSpanGaps, '공백을 이어 그리지 않는다').toBe(false);
  expect(r.barGapLabels).toBe(5);
  expect(r.barGapValues, '기록 없는 날에 0 막대를 그리지 않는다').toEqual([null, null, null, null, null]);
  expect(r.barNonGapNull, '기록된 날은 막대가 있다').toBe(0);
});

test('T5. [P0 D3] 스냅샷이 있고 값이 0인 날은 0이다 - 기록된 0은 공백으로 숨기지 않는다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 20, realZeroDay: 7 });
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView; const doc = el.ownerDocument;
    const d = new Date(); d.setDate(d.getDate() - 7);
    const k = dateKeyFromDate(d);
    const lbl = `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
    const tvRow = buildTotalValueSeries(20).find((x) => x.date === k);
    const dpRow = buildDailyPnlSeries(20).find((x) => x.date === k);
    openDailyPnlModal();
    dailyPnlPopupDays = 20; updateDailyPnlModal();
    const bc = win.Chart.getChart(doc.getElementById('dailyPnlChart'));
    const bar = bc.data.datasets[0].data[bc.data.labels.indexOf(lbl)];
    closeDailyPnlModal();
    // [D-1 Daily Valuation] 총자산 추이 팝업은 이제 원장 기반 Daily Valuation을 그린다(e2e/87에서 검증). 여기서는 스냅샷(기록)
    // 시리즈를 같은 렌더러로 직접 그려, 기록 없는 날이 null로 끊기고 기록된 0은 0으로 그려지는 성질을 계속 고정한다.
    const tvModal = doc.getElementById('totalValueModal');
    tvModal.classList.remove('hidden');
    renderTotalValueChart(buildTotalValueSeries(30));
    const lc = win.Chart.getChart(doc.getElementById('totalValueChart'));
    const line = lc.data.datasets[0].data[lc.data.labels.indexOf(lbl)];
    tvModal.classList.add('hidden');
    return { tv: [tvRow.recorded, tvRow.total], dp: [dpRow.recorded, dpRow.total], bar, line };
  });
  expect(r.tv).toEqual([true, 0]);
  expect(r.dp).toEqual([true, 0]);
  expect(r.bar, '기록된 0원 손익은 0 막대').toBe(0);
  expect(r.line, '기록된 0원 평가액은 0').toBe(0);
});

/* ── T6 요약 ────────────────────────────────────────────────────────── */

test('T6. [P0 D3] 요약은 기간 안 첫·마지막 "기록된 날" 기준이고, 기록 없는 날을 0원으로 세지 않는다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 25 }); // 30일 기간 중 앞쪽 26~29일은 기록 없음
  const r = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const tv = buildTotalValueSeries(30);
    const rec = tv.filter((x) => x.recorded);
    renderTotalValueSummary(tv);
    const tvText = doc.getElementById('totalValueList').textContent;
    const dp = buildDailyPnlSeries(30);
    renderDailyPnlSummary(dp);
    const dpText = doc.getElementById('dailyPnlList').textContent;
    const pnlSum = dp.filter((x) => x.recorded).reduce((z, x) => z + x.total, 0);
    const empty = tv.map((x) => ({ date: x.date, recorded: false, total: null, byOwnerAmounts: {} }));
    renderTotalValueSummary(empty);
    const emptyTv = doc.getElementById('totalValueList').textContent;
    renderDailyPnlSummary(empty);
    const emptyDp = doc.getElementById('dailyPnlList').textContent;
    const last = rec[rec.length - 1];
    return {
      firstMissing: !tv[0].recorded, firstRecordedIsDay25: rec[0].date === (() => { const d = new Date(); d.setDate(d.getDate() - 25); return dateKeyFromDate(d); })(),
      expectedCurrent: fmtKRW(last.total), expectedDiff: fmtSigned(last.total - rec[0].total), wrongDiff: fmtSigned(last.total),
      tvText, dpText, expectedPnl: fmtSigned(pnlSum), emptyTv, emptyDp
    };
  });
  expect(r.firstMissing).toBe(true);
  expect(r.firstRecordedIsDay25).toBe(true);
  expect(r.tvText).toContain(r.expectedCurrent);
  expect(r.tvText, '첫 기록일 대비 증감').toContain(r.expectedDiff);
  expect(r.tvText, '기간 첫날 0원을 시작값으로 쓰지 않는다').not.toContain(r.wrongDiff);
  expect(r.tvText).toContain('기간 내 첫 기록일 대비 증감');
  expect(r.tvText).toContain('기록이 없는 날짜는 그래프에서 비워 표시합니다.');
  expect(r.dpText, '기록된 날의 손익만 더한다').toContain(r.expectedPnl);
  expect(r.emptyTv).toContain('데이터 없음');
  expect(r.emptyDp).toContain('데이터 없음');
});

/* ── T7 경쟁 상태 ──────────────────────────────────────────────────── */

// [PM 지시 2/3] 예전 T7은 복구 Preview/Apply와의 경합을 검증했다. 복구 기능이 제거되어, 과거 이력을 받는 남은 자동 경로인
// 동기화 병합(mergeAssetsAndTransactionsWithRemote - pull이 부르는 함수)과 지연된 백그라운드 이력 경로의 경합으로 검증한다.
test('T7. [P0] 백그라운드 이력 작업과 동기화 병합이 겹쳐도 받은 날짜가 바뀌지 않고 과거 날짜가 새로 생기지 않는다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 3 });
  await stubHistory(page, true);
  const r = await page.locator('body').evaluate(async (el) => {
    const win = el.ownerDocument.defaultView;
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((acc, k) => { acc[k] = sortK(x[k]); return acc; }, {}) : x);
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const bk = {};
    for (let n = 4; n <= 63; n++) bk[dk(n)] = { total: { cur: 9000000 + n, dailyPnL: 777 }, byOwner: { '신랑': { cur: 9000000 + n, dailyPnL: 777 } }, byOwnerCategory: { '신랑': { '주식': { cur: 9000000 + n, dailyPnL: 777 } } } };
    const pick = () => JSON.stringify(sortK(Object.fromEntries(Object.keys(bk).map((d) => [d, state.dailySnapshots[d]]))));
    const countBefore = Object.keys(state.dailySnapshots).length;
    const running = backfillAllHoldingsDailyPnlHistory();
    const countDuring = Object.keys(state.dailySnapshots).length;
    mergeAssetsAndTransactionsWithRemote({ assets: state.assets, transactions: state.transactions, dailySnapshots: JSON.parse(JSON.stringify(bk)) });
    const afterMerge = pick();
    if (win.__releaseHistory) win.__releaseHistory();
    await running;
    reconstructHistoricalCurValues();
    await new Promise((res) => setTimeout(res, 300));
    return { countBefore, countDuring, countAfter: Object.keys(state.dailySnapshots).length, same: afterMerge === pick(),
      equalsRemote: afterMerge === JSON.stringify(sortK(bk)), historyCalls: win.__historyCalls };
  });
  expect(r.countDuring, '백그라운드 작업이 시작돼도 날짜가 생기지 않는다').toBe(r.countBefore);
  expect(r.equalsRemote, '병합으로 받은 날짜 = 원격 값').toBe(true);
  expect(r.same, '끝난 백그라운드 작업이 받은 날짜를 바꾸지 않는다').toBe(true);
  expect(r.countAfter, '받은 60일만 늘어난다').toBe(r.countBefore + 60);
  expect(r.historyCalls).toBe(0);
});

/* ── T8 Cloud ───────────────────────────────────────────────────────── */

// [PM 지시 2/3] 예전 T8 앞부분은 복구 적용의 POST 0을 검증했다. 복구 기능이 제거되어 그 부분을 뺐고, 이력 경로의 POST 0과
// 오늘 기록 push 유지(올라가는 과거 이력 불변)는 그대로 검증한다.
test('T8. [P0] 부팅 이력 경로는 과거 재작성 POST 0 - 오늘 기록 push는 기존대로이고 과거 이력은 그대로다', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await seedHistory(page, { days: 40 });
  await stubHistory(page);
  await page.locator('body').evaluate(() => { syncState.enabled = true; syncState.password = 'e82-pw'; });
  await page.waitForTimeout(4500);
  writes.length = 0;
  const baseline = await historySnapshot(page);

  // 부팅·pull·가져오기가 부르던 이력 경로 - 과거를 만들거나 다시 쓰지 않으니 push도 예약되지 않는다.
  await page.locator('body').evaluate(async () => { await backfillAllHoldingsDailyPnlHistory(); reconstructHistoricalCurValues(); });
  await page.waitForTimeout(4500);
  expect(writes, `이력 경로가 Cloud write를 유발했다: ${writes.join(',')}`).toEqual([]);
  expect((await historySnapshot(page)).stored).toBe(baseline.stored);

  // 오늘 기록(renderAll → recordDailySnapshot)의 push는 기존 기능 그대로다.
  await page.locator('body').evaluate(() => { renderAll(); });
  await page.waitForTimeout(4500);
  expect(writes.length, '오늘 기록 동기화는 기존대로 동작한다').toBeGreaterThan(0);
  expect((await historySnapshot(page)).stored, '오늘 기록 push 뒤에도 과거 이력은 그대로').toBe(baseline.stored);
});

/* ── T9 State isolation ─────────────────────────────────────────────── */

test('T9. [P0] 동기화 병합과 이력 경로 전후로 자산·거래·리밸런싱·미래예측·설정이 그대로다', async ({ page }) => {
  await open(page);
  await seedHistory(page, { days: 10 });
  await stubHistory(page);
  const before = await fingerprint(page);
  await page.locator('body').evaluate(async () => {
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const bk = {};
    for (let n = 11; n <= 40; n++) bk[dk(n)] = { total: { cur: 7000000 + n, dailyPnL: 10 }, byOwner: { '신랑': { cur: 7000000 + n, dailyPnL: 10 } }, byOwnerCategory: { '신랑': { '주식': { cur: 7000000 + n, dailyPnL: 10 } } } };
    mergeAssetsAndTransactionsWithRemote({ assets: state.assets, transactions: state.transactions, dailySnapshots: bk }); // [PM 지시 2/3] 복구 대신 동기화 병합으로 이력만 받는다
    await backfillAllHoldingsDailyPnlHistory();
    reconstructHistoricalCurValues();
  });
  expect(await fingerprint(page), '동기화 병합·이력 경로가 dailySnapshots 밖을 바꾸면 안 된다').toBe(before);
});

/* ══════════════════════════════════════════════════════════════════════
 * [RECOVERY ERROR ZERO] 수정 전(v237 · e1b8663) 코드에서 실제로 재현된 오류 R0-1~R0-5를 같은 조건으로 고정한다.
 * 재현 하네스에서 수정 전 수치: R0-1 복구 날짜 cur 변경 362/362 · R0-2 기록 없는 날 0 표시 · R0-3 매수일 이전 과거 생성 221일 ·
 * R0-4 Preview 추가 60 → 0 / 충돌 0 → 60 · 복구 날짜 손익 가산 60/60 · R0-5 요약 시작값 0(증감 +1.1억).
 * 아래 테스트는 같은 조건에서 오류가 0건인지 확인한다.
 * ══════════════════════════════════════════════════════════════════════ */

const R0_ASSET = (id, t, own, cat, qty, price) => ({
  id, ticker: t, owner: own, accountType: '일반계좌', category: cat, categorySource: 'user', name: 'R0_' + id,
  isDomestic: '국내', currency: 'KRW', quantity: qty, buyPrice: price, currentPrice: price, positionSource: 'manual', createdAt: 1, updatedAt: 1
});

test('R0-1. [P0-1] 과거 395일 이력 저장 → 자산 변경 → 실제 부팅 3회: 저장된 날짜 변경 0/395 (수정 전 창 안 362/362 변경)', async ({ page }) => {
  test.setTimeout(120000);
  await open(page);
  const setup = await page.locator('body').evaluate((el, A) => {
    const mkA = (...a) => ({ ...A, id: a[0], ticker: a[1], owner: a[2], category: a[3], quantity: a[4], buyPrice: a[5], currentPrice: a[5], name: 'R0_' + a[0] });
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    state.assets = [mkA('s1', '', '신랑', '주식', 100, 70000), mkA('c1', '', '신랑', '현금', 1, 3000000), mkA('e1', '', '와이프', 'ETF', 10, 50000)];
    state.transactions = [];
    state.dailySnapshots = {};
    renderAll();
    // 피해 state: 과거 365일이 예전 재구성 모양의 placeholder(지금 보유 자산 기준 cur, 손익 0)
    const oc = {};
    state.assets.forEach((a) => { if (!oc[a.owner]) oc[a.owner] = {}; oc[a.owner][a.category] = (oc[a.owner][a.category] || 0) + calcRow(a).curAmount; });
    const placeholder = () => {
      const byOwner = {}, byOwnerCategory = {}; let total = 0;
      Object.keys(oc).forEach((o) => {
        byOwnerCategory[o] = {}; let s = 0;
        Object.keys(oc[o]).forEach((c) => { byOwnerCategory[o][c] = { cur: oc[o][c], dailyPnL: 0 }; s += oc[o][c]; });
        byOwner[o] = { cur: s, dailyPnL: 0 }; total += s;
      });
      return { total: { cur: total, dailyPnL: 0 }, byOwner, byOwnerCategory };
    };
    for (let n = 1; n <= 365; n++) state.dailySnapshots[dk(n)] = placeholder();
    // 백업 395일(dk4~dk398): 겹치는 362일 + 더 과거 33일
    const backup = {};
    for (let n = 4; n <= 398; n++) {
      const g = new Date(); g.setDate(g.getDate() - n);
      const wk = g.getDay() === 0 || g.getDay() === 6;
      const p1 = wk ? 0 : ((n % 7) - 3) * 12000, p2 = wk ? 0 : ((n % 5) - 2) * 3000;
      const c1 = 7000000 + n * 1234, c2 = 3000000, c3 = 500000 + n * 99;
      backup[dk(n)] = { total: { cur: c1 + c2 + c3, dailyPnL: p1 + p2 },
        byOwner: { '신랑': { cur: c1 + c2, dailyPnL: p1 }, '와이프': { cur: c3, dailyPnL: p2 } },
        byOwnerCategory: { '신랑': { '주식': { cur: c1, dailyPnL: p1 }, '현금': { cur: c2, dailyPnL: 0 } }, '와이프': { 'ETF': { cur: c3, dailyPnL: p2 } } } };
    }
    // [PM 지시 2/3] 예전엔 복구 API로 이 395일을 적용했다(추가 33 · 교체 362). 복구 기능이 제거되어 같은 395일이 저장된 상태를
    // 직접 만든다 - 검증 대상(부팅·자산 변경이 저장된 과거 이력을 바꾸지 않는가)은 같다.
    Object.keys(backup).forEach((k) => { state.dailySnapshots[k] = JSON.parse(JSON.stringify(backup[k])); });
    persistDailySnapshots();
    // 현재 자산 변경: 매도 · 자산 추가 · 소유자 변경 · 자산군 변경
    state.assets[0].quantity = 50;
    state.assets.push(mkA('r1', '', '신랑', '부동산', 1, 500000000));
    state.assets[2].owner = '신랑';
    state.assets[1].category = '채권';
    persistAssets(true); persistTransactions();
    return { backup };
  }, R0_ASSET('x', '', '신랑', '주식', 1, 1));

  const count = () => page.locator('body').evaluate((el, bk) => {
    const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((acc, k) => { acc[k] = sortK(x[k]); return acc; }, {}) : x);
    const stored = JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}');
    const d = new Date(); d.setDate(d.getDate() - 365);
    const d365 = dateKeyFromDate(d);
    const keys = Object.keys(bk);
    const inWin = keys.filter((k) => k >= d365);
    return {
      backupDates: keys.length, windowDates: inWin.length,
      changed: keys.filter((k) => JSON.stringify(sortK(stored[k])) !== JSON.stringify(sortK(bk[k]))).length,
      windowCurChanged: inWin.filter((k) => !stored[k] || stored[k].total.cur !== bk[k].total.cur).length
    };
  }, setup.backup);

  expect(await count()).toEqual({ backupDates: 395, windowDates: 362, changed: 0, windowCurChanged: 0 });
  for (let i = 1; i <= 3; i++) {
    await reboot(page);
    expect(await count(), `부팅 ${i}회 뒤`).toEqual({ backupDates: 395, windowDates: 362, changed: 0, windowCurChanged: 0 });
  }
});

test('R0-2. [P0-5] D1 기록 1억 · D2 기록 0 · D3 기록 없음 · D4 기록 2억 → 시계열·차트 [1억, 0, null, 2억]', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el, A) => {
    const win = el.ownerDocument.defaultView; const doc = el.ownerDocument;
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const mk = (cur, pnl) => ({ total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } }, byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } } });
    state.assets = [{ ...A, id: 's1' }];
    state.transactions = [];
    state.dailySnapshots = {};
    renderAll();
    state.dailySnapshots[dk(4)] = mk(100000000, 1000);
    state.dailySnapshots[dk(3)] = mk(0, 0);
    delete state.dailySnapshots[dk(2)];
    state.dailySnapshots[dk(1)] = mk(200000000, 2000);
    const tv = buildTotalValueSeries(5).slice(0, 4).map((x) => x.total);
    const dp = buildDailyPnlSeries(5).slice(0, 4).map((x) => x.total);
    // [D-1 Daily Valuation] 총자산 추이 팝업은 이제 원장 기반 Daily Valuation을 그린다(e2e/87에서 검증). 여기서는 스냅샷(기록)
    // 시리즈를 같은 렌더러로 직접 그려, 기록 없는 날이 null로 끊기고 기록된 0은 0으로 그려지는 성질을 계속 고정한다.
    const tvModal = doc.getElementById('totalValueModal');
    tvModal.classList.remove('hidden');
    renderTotalValueChart(buildTotalValueSeries(5));
    const lc = win.Chart.getChart(doc.getElementById('totalValueChart'));
    const lineTotal = lc.data.datasets[0].data.slice(0, 4);
    const lineOwner = lc.data.datasets[1].data.slice(0, 4);
    tvModal.classList.add('hidden');
    openDailyPnlModal(); dailyPnlPopupDays = 5; updateDailyPnlModal();
    const bar = win.Chart.getChart(doc.getElementById('dailyPnlChart')).data.datasets[0].data.slice(0, 4);
    closeDailyPnlModal();
    return { tv, dp, lineTotal, lineOwner, bar, spanGaps: lc.options.spanGaps };
  }, R0_ASSET('s1', '', '신랑', '주식', 100, 70000));
  expect(r.tv, '총 평가금액 시계열').toEqual([100000000, 0, null, 200000000]);
  expect(r.lineTotal, '합계 라인').toEqual([100000000, 0, null, 200000000]);
  expect(r.lineOwner, '소유자 라인').toEqual([100000000, 0, null, 200000000]);
  expect(r.dp, '일별 손익 시계열').toEqual([1000, 0, null, 2000]);
  expect(r.bar, '일별 손익 막대').toEqual([1000, 0, null, 2000]);
  expect(r.spanGaps).toBe(false);
});

test('R0-3. [P0-2] 매수일 30일 전 자산 · 지문 없음: 과거 생성 0 · 매수일 이전 0 · 손익 0 · 평가액 0 (수정 전 251 · 221 · 221 · 221) · 오늘 기록은 정상', async ({ page }) => {
  await open(page);
  await stubHistory(page);
  const r = await page.locator('body').evaluate(async (el, A) => {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const buy = dateKeyFromDate(d30);
    state.assets = [{ ...A, id: 't1' }];
    state.transactions = [{ id: 'tx1', date: buy, owner: '신랑', accountType: '일반계좌', ticker: '005930', name: 'R0_t1', type: 'buy', quantity: 10, price: 50000, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    state.dailySnapshots = {};
    renderAll();
    await backfillAllHoldingsDailyPnlHistory();
    await backfillDailyPnlHistory(state.assets[0]);
    const today = todayDateStr();
    const past = Object.keys(state.dailySnapshots).filter((k) => k < today);
    const before = past.filter((k) => k < buy);
    return {
      pastDatesCreated: past.length, createdBeforePurchase: before.length,
      beforePurchaseNonZeroPnL: before.filter((k) => state.dailySnapshots[k].total.dailyPnL !== 0).length,
      beforePurchasePositiveCur: before.filter((k) => state.dailySnapshots[k].total.cur > 0).length,
      todaySnapshotRecorded: !!state.dailySnapshots[today], historyCalls: el.ownerDocument.defaultView.__historyCalls
    };
  }, R0_ASSET('t1', '005930', '신랑', '주식', 10, 50000));
  expect(r).toEqual({ pastDatesCreated: 0, createdBeforePurchase: 0, beforePurchaseNonZeroPnL: 0, beforePurchasePositiveCur: 0, todaySnapshotRecorded: true, historyCalls: 0 });
});

// [PM 지시 2/3] 예전 R0-4는 복구 Preview/Apply와 지연된 백그라운드 이력 작업의 경합을 검증했다. 복구 기능이 제거되어
// 같은 경합을 동기화 병합(pull 경로)으로 검증한다 - 스냅샷 수·받은 날짜 손익 변화 0.
test('R0-4. [P0-3·P0-4] 지연된 백그라운드 이력 작업과 동기화 병합이 겹쳐도 스냅샷 수·받은 날짜 손익 변화 0', async ({ page }) => {
  await open(page);
  await stubHistory(page, true);
  const r = await page.locator('body').evaluate(async (el, A) => {
    const win = el.ownerDocument.defaultView;
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const mk = (cur, pnl) => ({ total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } }, byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } } });
    state.assets = [{ ...A, id: 't1' }];
    state.transactions = [];
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    state.dailySnapshots = {};
    renderAll();
    const bk = {};
    for (let n = 1; n <= 60; n++) bk[dk(n)] = mk(9000000 + n, 777);

    const count1 = Object.keys(state.dailySnapshots).length;
    const running = backfillAllHoldingsDailyPnlHistory();       // 지연된 백그라운드 작업(수정 전: 과거 날짜 생성 · 손익 가산)
    await new Promise((res) => setTimeout(res, 50));
    const count2 = Object.keys(state.dailySnapshots).length;
    mergeAssetsAndTransactionsWithRemote({ assets: state.assets, transactions: state.transactions, dailySnapshots: JSON.parse(JSON.stringify(bk)) });
    const pnlAfterMerge = Object.keys(bk).map((d) => state.dailySnapshots[d].total.dailyPnL);
    const count3 = Object.keys(state.dailySnapshots).length;
    if (win.__releaseHistory) win.__releaseHistory();
    await running;
    reconstructHistoricalCurValues();
    await new Promise((res) => setTimeout(res, 300));
    return {
      count1, count2, count3, count4: Object.keys(state.dailySnapshots).length,
      mergedPnLChanged: Object.keys(bk).filter((d, i) => state.dailySnapshots[d].total.dailyPnL !== pnlAfterMerge[i]).length,
      historyCalls: win.__historyCalls
    };
  }, R0_ASSET('t1', '005930', '신랑', '주식', 10, 50000));
  expect(r.count2, '백그라운드 작업 중 스냅샷 수 동일').toBe(r.count1);
  expect(r.count3, '병합으로 받은 60일만 늘어난다').toBe(r.count1 + 60);
  expect(r.count4, '백그라운드 작업이 끝나도 날짜가 늘지 않는다').toBe(r.count3);
  expect(r.mergedPnLChanged, '받은 날짜 손익 변경 0').toBe(0);
  expect(r.historyCalls).toBe(0);
});

test('R0-5. [P0-5] D1 기록 없음 · D2 1억 · D3 1.1억 → 요약 시작값 1억 · 증감 +1천만원 (수정 전 시작값 0 · +1.1억)', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el, A) => {
    const doc = el.ownerDocument;
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const mk = (cur, pnl) => ({ total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } }, byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } } });
    state.assets = [{ ...A, id: 's1' }];
    state.transactions = [];
    renderAll();
    state.dailySnapshots = {};
    state.dailySnapshots[dk(1)] = mk(100000000, 500);
    state.dailySnapshots[todayDateStr()] = mk(110000000, 700);
    const series = buildTotalValueSeries(3);
    renderTotalValueSummary(series);
    const text = doc.getElementById('totalValueList').textContent;
    const dps = buildDailyPnlSeries(3);
    renderDailyPnlSummary(dps);
    const dpText = doc.getElementById('dailyPnlList').textContent;
    return {
      firstDayMissing: !series[0].recorded,
      startAmount: series.filter((x) => x.recorded)[0].total,
      hasCorrectDiff: text.includes(fmtSigned(10000000)), hasZeroStartDiff: text.includes(fmtSigned(110000000)),
      basis: text.includes('기간 내 첫 기록일 대비 증감'),
      pnlSumCorrect: dpText.includes(fmtSigned(1200)), missingCountedAsZero: dps.filter((x) => !x.recorded && x.total === 0).length
    };
  }, R0_ASSET('s1', '', '신랑', '주식', 100, 70000));
  expect(r).toEqual({ firstDayMissing: true, startAmount: 100000000, hasCorrectDiff: true, hasZeroStartDiff: false, basis: true, pnlSumCorrect: true, missingCountedAsZero: 0 });
});
