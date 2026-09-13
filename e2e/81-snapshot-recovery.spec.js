// E2E-81 [FIX-2] 일별 이력만 복구 - 백업의 dailySnapshots만 되메운다.
//
// 지키려는 것은 두 가지다.
//   ① 비어 있는 날짜만 채운다 - 이미 있는 날짜는 값이 같든 다르든 절대 덮지 않는다.
//   ② 복구가 건드리는 것은 dailySnapshots 하나뿐이다 - 자산/거래/리밸런싱/미래예측/Return Key는
//      한 글자도 바뀌지 않고, 클라우드로도 아무것도 올라가지 않는다.
//
// 실제 앱 함수(planSnapshotRecovery / applySnapshotRecovery / persistDailySnapshots)를 그대로 태운다.
// Cloud Worker는 절대 호출하지 않는다 - page.route로 가로채 요청 자체를 세고, 0건임을 단언한다.
// 실제 사용자 백업은 쓰지 않는다 - 아래 fixture는 전부 합성 데이터다.
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof planSnapshotRecovery === 'function' && typeof applySnapshotRecovery === 'function');
}

// 합성 자산/거래/설정을 심고, 현재 dailySnapshots를 원하는 날짜만 남긴 상태로 만든다.
function seed(page, currentDates) {
  return page.locator('body').evaluate((el, dates) => {
    const A = (id, t, own, cat) => ({
      id, ticker: t, owner: own, accountType: '일반계좌', category: cat, categorySource: 'user',
      name: 'E81_' + t, isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 1000,
      currentPrice: 1200, positionSource: 'manual', buyRate: 1300, createdAt: 1000, updatedAt: 1000
    });
    state.assets = [A('e81a', 'AAA', '신랑', '주식'), A('e81b', 'BBB', '와이프', 'ETF')];
    state.transactions = [{
      id: 'e81t1', date: '2026-02-02', owner: '신랑', accountType: '일반계좌', ticker: 'AAA',
      name: 'E81_AAA', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0,
      origin: 'period', createdAt: 2000, updatedAt: 2000
    }];
    const mk = (cur, pnl) => ({
      total: { cur, dailyPnL: pnl },
      byOwner: { '신랑': { cur: cur * 0.6, dailyPnL: pnl * 0.6 }, '와이프': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } },
      byOwnerCategory: {
        '신랑': { '주식': { cur: cur * 0.6, dailyPnL: pnl * 0.6 } },
        '와이프': { 'ETF': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } }
      }
    });
    const snaps = {};
    dates.forEach((d, i) => { snaps[d] = mk(1000 + i * 10, 5 + i); });
    state.dailySnapshots = snaps;
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    renderAll();
  }, currentDates);
}

// 다른 state 전체를 지문으로 뜬다 - 복구 전후 이 값이 한 글자라도 달라지면 실패다.
function fingerprint(page) {
  return page.locator('body').evaluate(() => JSON.stringify({
    assets: state.assets,
    transactions: state.transactions,
    rebalance: state.rebalance,
    projection: state.projection,
    tickerRoles: state.tickerRoles,
    learnedTickerNames: state.learnedTickerNames,
    exchangeRate: state.exchangeRate,
    dailyChangeRate: state.dailyChangeRate,
    scenarioRates: localStorage.getItem('sam_custom_scenario_rates')
  }));
}

// 합성 백업 payload. 복구는 dailySnapshots만 읽어야 하므로, 나머지 키에는 일부러 "틀린" 값을 넣어
// 혹시라도 읽히면 즉시 드러나게 한다.
function makeBackup(dates, opts) {
  const o = opts || {};
  const mk = (cur, pnl) => ({
    total: { cur, dailyPnL: pnl },
    byOwner: { '신랑': { cur: cur * 0.6, dailyPnL: pnl * 0.6 }, '와이프': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } },
    byOwnerCategory: {
      '신랑': { '주식': { cur: cur * 0.6, dailyPnL: pnl * 0.6 } },
      '와이프': { 'ETF': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } }
    }
  });
  const snaps = {};
  dates.forEach((d, i) => { snaps[d] = mk(1000 + i * 10, 5 + i); });
  if (o.conflictDate) snaps[o.conflictDate] = mk(999999, -999);
  if (o.malformed) snaps[o.malformed] = { total: { cur: 1 } };
  if (o.badDateKey) snaps[o.badDateKey] = mk(1, 1);
  return {
    app: 'smart-asset-manager', schemaVersion: 'sam_assets_v5', exportedAt: '2026-01-01T00:00:00.000Z',
    // ↓ 복구가 절대 읽으면 안 되는 값들(읽히면 자산/거래가 오염되어 지문 비교에서 잡힌다)
    assets: [{ id: 'POISON', ticker: 'ZZZ', owner: '신랑', name: '오염', quantity: 999, buyPrice: 1, category: '채권', categorySource: 'auto', positionSource: 'ledger' }],
    transactions: [{ id: 'POISON_TX', date: '2020-01-01', ticker: 'ZZZ', name: '오염', type: 'buy', quantity: 999, price: 1 }],
    rebalance: { updatedAt: 9999999999999, targets: { POISON: 1 } },
    projection: { updatedAt: 9999999999999, monthlyContribution: 999999999, inflationRate: 99 },
    tickerRoles: { ZZZ: 'core' }, learnedTickerNames: { ZZZ: '오염' },
    exchangeRate: 99999, dailyChangeRate: 99,
    dailySnapshots: snaps
  };
}

// 파일 선택 없이 복구 경로를 태운다(파일 입력 자체는 브라우저 UI라, 검증 대상은 그 뒤의 로직이다).
function runRecovery(page, backup) {
  return page.locator('body').evaluate((el, bk) => {
    const plan = planSnapshotRecovery(bk && bk.dailySnapshots, state.dailySnapshots);
    if (!plan.ok) return { ok: false, reason: plan.reason };
    const res = applySnapshotRecovery(plan);
    return { ok: true, added: res.added, conflicts: res.conflicts, invalid: res.invalid };
  }, backup);
}

function previewOnly(page, backup) {
  return page.locator('body').evaluate((el, bk) => {
    const plan = planSnapshotRecovery(bk && bk.dailySnapshots, state.dailySnapshots);
    return { ok: plan.ok, added: plan.added.length, kept: plan.kept.length,
      conflicts: plan.conflicts.length, invalid: plan.invalid.length };
  }, backup);
}

// [오늘 날짜 제외] renderKPIs()가 렌더링할 때마다 오늘자 스냅샷을 실시간으로 기록한다(정상 동작).
// 복구 검증의 대상은 "과거 날짜를 어떻게 다루는가"이므로, 비교에서는 오늘을 빼고 본다.
// [로컬 날짜 기준] 앱의 todayDateStr()/dateKeyFromDate()와 같은 로컬 날짜로 키를 만든다. UTC(toISOString)를
// 쓰면 KST 00:00~08:59에 하루 어긋나 오늘/과거 판정이 틀어진다. page.evaluate 안에서는 앱 함수를 그대로 쓴다.
function localDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TODAY = localDateKey(new Date());
const past = (arr) => arr.filter((k) => k !== TODAY).sort();

const snapKeys = (page) => page.locator('body').evaluate(() => Object.keys(state.dailySnapshots)).then(past);
const storedKeys = (page) => page.locator('body').evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}'))).then(past);
// 오늘 값은 실시간으로 계속 갱신되므로 과거 날짜만 뽑아 JSON으로 굳힌다.
const pastSnapshotsJson = (page) => page.locator('body').evaluate((el, today) => {
  const o = {};
  Object.keys(state.dailySnapshots).sort().forEach((k) => { if (k !== today) o[k] = state.dailySnapshots[k]; });
  return JSON.stringify(o);
}, TODAY);
const pastStoredJson = (page) => page.locator('body').evaluate((el, today) => {
  const raw = JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}');
  const o = {};
  Object.keys(raw).sort().forEach((k) => { if (k !== today) o[k] = raw[k]; });
  return JSON.stringify(o);
}, TODAY);

const CUR = ['2026-03-08', '2026-03-09'];
const BK = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08'];

/* ── A. 없는 날짜만 추가된다 ─────────────────────────────────────────── */

test('A. 현재 2일 + 백업 5일(1일 겹침) -> 6일이 되고 추가는 4일뿐이다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  expect(await snapKeys(page)).toEqual(CUR);

  const r = await runRecovery(page, makeBackup(BK));
  expect(r.ok).toBe(true);
  expect(r.added).toBe(4);

  expect(await snapKeys(page)).toEqual(
    ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09']);
  expect(await storedKeys(page), 'localStorage에도 그대로 반영된다').toEqual(
    ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09']);
});

/* ── B. 멱등성 ──────────────────────────────────────────────────────── */

test('B. 같은 백업을 다시 적용하면 변화가 0이다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  const r1 = await runRecovery(page, makeBackup(BK));
  const after1 = await pastSnapshotsJson(page);

  const r2 = await runRecovery(page, makeBackup(BK));
  expect(r2.added, '2회차에는 추가가 없다').toBe(0);
  // 충돌은 "해소되지 않은 채 그대로 남는 상태"다 - 2회차에도 같은 날짜가 같은 이유로 보고되는 것이
  // 정상이며, 횟수가 달라진다면 그 사이에 값이 바뀌었다는 뜻이라 그때가 실패다.
  expect(r2.conflicts, '충돌 건수가 회차마다 달라지면 안 된다').toBe(r1.conflicts);

  const after2 = await pastSnapshotsJson(page);
  expect(after2, '2회차가 데이터를 바꾸면 안 된다').toBe(after1);
});

/* ── C. 같은 날짜 + 같은 값 ─────────────────────────────────────────── */

test('C. 겹치는 날짜의 값이 같으면 충돌도 변경도 없다', async ({ page }) => {
  await open(page);
  await seed(page, ['2026-03-01']);
  // seed와 makeBackup은 같은 규칙으로 값을 만든다 - 첫 날짜끼리는 값이 동일하다.
  const r = await runRecovery(page, makeBackup(['2026-03-01']));
  expect(r.added).toBe(0);
  expect(r.conflicts).toBe(0);
  expect(await snapKeys(page)).toEqual(['2026-03-01']);
});

/* ── D. 같은 날짜 + 다른 값 -> 현재 값 유지 + 충돌 보고 ─────────────── */

test('D. 겹치는 날짜의 값이 다르면 현재 값을 유지하고 충돌로만 보고한다', async ({ page }) => {
  await open(page);
  await seed(page, ['2026-03-08']);
  const before = await page.locator('body').evaluate(() => JSON.stringify(state.dailySnapshots['2026-03-08']));

  const r = await runRecovery(page, makeBackup(['2026-03-01'], { conflictDate: '2026-03-08' }));
  expect(r.conflicts).toBe(1);
  expect(r.added, '겹치지 않는 날짜는 정상 추가된다').toBe(1);

  const after = await page.locator('body').evaluate(() => JSON.stringify(state.dailySnapshots['2026-03-08']));
  expect(after, '백업 값으로 덮이면 안 된다').toBe(before);
});

/* ── E. 형식 오류 차단 ──────────────────────────────────────────────── */

test('E. 형식이 깨진 스냅샷은 제외되고 나머지만 복구된다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);

  const r = await runRecovery(page, makeBackup(['2026-03-01'], { malformed: '2026-03-02', badDateKey: 'not-a-date' }));
  expect(r.added).toBe(1);
  expect(r.invalid).toBe(2);

  const keys = await snapKeys(page);
  expect(keys).toContain('2026-03-01');
  expect(keys, '형식 불량 날짜는 들어오지 않는다').not.toContain('2026-03-02');
  expect(keys).not.toContain('not-a-date');
});

/* ── F~I. 다른 state 무변경 ─────────────────────────────────────────── */

test('F~I. 복구 전후 자산·거래·리밸런싱·미래예측이 한 글자도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  const before = await fingerprint(page);

  const r = await runRecovery(page, makeBackup(BK));
  expect(r.added).toBe(4);

  const after = await fingerprint(page);
  expect(after, 'dailySnapshots 외의 state가 바뀌면 안 된다').toBe(before);

  // 백업에 심어둔 오염 값이 하나라도 들어왔는지 개별 확인
  const poisoned = await page.locator('body').evaluate(() => ({
    assetIds: state.assets.map((a) => a.id),
    txIds: state.transactions.map((t) => t.id),
    hasPoisonRole: !!(state.tickerRoles && state.tickerRoles.ZZZ),
    fx: state.exchangeRate,
    inflation: state.projection && state.projection.inflationRate
  }));
  expect(poisoned.assetIds).toEqual(['e81a', 'e81b']);
  expect(poisoned.txIds).toEqual(['e81t1']);
  expect(poisoned.hasPoisonRole).toBe(false);
  expect(poisoned.fx).not.toBe(99999);
  expect(poisoned.inflation).not.toBe(99);
});

test('F-2. 자산의 세부 필드(category/positionSource/buyRate 등)도 그대로다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  const pick = () => page.locator('body').evaluate(() => state.assets.map((a) => [
    a.id, a.quantity, a.buyPrice, a.buyRate, a.category, a.categorySource, a.positionSource].join('|')));
  const before = await pick();
  await runRecovery(page, makeBackup(BK));
  expect(await pick()).toEqual(before);
});

/* ── J. Cloud write 0 ───────────────────────────────────────────────── */

test('J. 복구 중 Cloud write(POST/PUT/DELETE)가 단 1건도 발생하지 않는다', async ({ page, context }) => {
  // [세는 대상] 검증 목표는 "복구가 클라우드를 바꾸지 않는다"이므로 쓰기 메서드만 센다. 동기화를
  // 켜 두면 10초 주기 pullFromCloud가 GET을 계속 날리는데(정상 동작), 그걸 함께 세면 복구와 무관한
  // 이유로 실패한다.
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await open(page);
  // 동기화를 켜 둔 상태에서도 복구가 push를 예약하지 않아야 한다 - 이게 이번 검증의 핵심이다.
  await page.locator('body').evaluate(() => {
    syncState.enabled = true;
    syncState.password = 'e81-pw';
  });
  await seed(page, CUR);
  // seed가 건 schedulePush(3초 디바운스)를 먼저 흘려보낸 뒤에 세기 시작한다 - 그래야 여기서 잡히는
  // 요청은 오직 "복구가 유발한 것"뿐이다.
  await page.waitForTimeout(4500);
  writes.length = 0;

  const r = await runRecovery(page, makeBackup(BK));
  expect(r.added).toBe(4);

  // schedulePush의 3초 디바운스보다 넉넉히 기다린다 - 예약이 걸렸다면 여기서 POST가 나간다.
  await page.waitForTimeout(4500);
  expect(writes, `복구로 Cloud write가 발생했다: ${writes.join(',')}`).toEqual([]);
});

test('J-2. 일반 저장 경로는 예전처럼 push를 예약한다(기본 동작 무변경)', async ({ page, context }) => {
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await open(page);
  await page.locator('body').evaluate(() => { syncState.enabled = true; syncState.password = 'e81-pw'; });
  await seed(page, CUR);
  await page.waitForTimeout(4500);
  writes.length = 0;

  // 인자 없이 부르는 기존 호출부와 동일
  await page.locator('body').evaluate(() => { persistDailySnapshots(); });
  await page.waitForTimeout(4500);
  expect(writes.length, '기존 동작(push 예약)이 유지되어야 한다').toBeGreaterThan(0);
});

/* ── K. 미리보기는 아무것도 쓰지 않는다 ─────────────────────────────── */

test('K. 미리보기만 실행하면 state도 localStorage도 변하지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  const beforeState = await pastSnapshotsJson(page);
  const beforeStore = await pastStoredJson(page);

  const p = await previewOnly(page, makeBackup(BK));
  expect(p.ok).toBe(true);
  expect(p.added).toBe(4);
  expect(p.kept, '오늘자 실시간 기록 1일이 더해져 3일이다').toBe(3);

  expect(await pastSnapshotsJson(page), '미리보기는 state를 건드리지 않는다').toBe(beforeState);
  expect(await pastStoredJson(page), '미리보기는 localStorage를 건드리지 않는다').toBe(beforeStore);
});

/* ── L. 실패 시 무변경(원자성) ──────────────────────────────────────── */

test('L. 저장이 실패하면 state도 localStorage도 그대로다', async ({ page }) => {
  await open(page);
  await seed(page, CUR);
  const beforeState = await pastSnapshotsJson(page);
  const beforeStore = await pastStoredJson(page);

  const r = await page.locator('body').evaluate((el, bk) => {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new Error('quota exceeded (합성)'); };
    let threw = false;
    try {
      const plan = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots);
      applySnapshotRecovery(plan);
    } catch (err) { threw = true; void err; }
    localStorage.setItem = orig;
    return { threw, stateKeys: Object.keys(state.dailySnapshots) };
  }, makeBackup(BK));

  expect(r.threw, '저장 실패는 예외로 드러나야 한다').toBe(true);
  expect(past(r.stateKeys), '메모리 state도 원복되어야 한다').toEqual(CUR);
  expect(await pastSnapshotsJson(page)).toBe(beforeState);
  expect(await pastStoredJson(page)).toBe(beforeStore);
});

/* ── 전부 소실된 실제 피해 상태에서의 회복 ──────────────────────────── */

test('M. 과거가 전부 소실된 상태에서 복구하면 차트 계열이 수평선에서 벗어난다', async ({ page }) => {
  await open(page);
  await seed(page, []); // 과거 이력 0일 = 피해 상태
  const flat = await page.locator('body').evaluate(() => {
    const s = buildTotalValueSeries(30);
    return new Set(s.map((r) => Math.round(r.total))).size;
  });

  const dates = [];
  for (let i = 25; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(localDateKey(d));
  }
  const r = await runRecovery(page, makeBackup(dates));
  expect(r.added).toBe(25);

  const varied = await page.locator('body').evaluate(() => {
    const s = buildTotalValueSeries(30);
    return new Set(s.map((r2) => Math.round(r2.total))).size;
  });
  expect(varied, `복구 후에도 고유값이 늘지 않았다(before=${flat})`).toBeGreaterThan(flat);
});

/* ── UI 진입점 ──────────────────────────────────────────────────────── */

test('N. 데이터 관리에 [일별 이력만 복구] 진입점이 있고 전체 복원과 구분된다', async ({ page }) => {
  await open(page);
  const btn = page.locator('#recoverSnapshotsBtn');
  await expect(btn).toHaveCount(1);
  await expect(btn).toContainText('일별 이력만 복구');
  await expect(btn, '범위를 분명히 적어 전체 복원과 혼동되지 않게 한다')
    .toContainText('현재 자산·거래·투자설정은 변경하지 않습니다');
  // 기존 전체 복원 버튼은 그대로 남아 있다
  await expect(page.locator('#importJsonBtn')).toHaveCount(1);
  await expect(page.locator('#snapshotRecoveryFileInput')).toHaveCount(1);
});

/* ══════════════════════════════════════════════════════════════════════
 * [FIX-3 최소] 근거 없는 과거 스냅샷을 시스템이 새로 만들지 않는다.
 *
 * 예전 reconstructHistoricalCurValues는 기록이 없는 날짜에도 스냅샷을 만들어 역산값을 채웠다.
 * 역산의 근거인 과거 dailyPnL까지 없으면 매일 0을 빼게 되어, 365일 전부에 오늘 값이 복제된
 * 스냅샷이 생겼다 - 화면에는 "6개월 내내 무변동"이라는 사실 아닌 수평선으로 나타났다.
 * 이제 기록이 없는 날짜는 건너뛴다. 이미 기록이 있는 날짜의 cur 재계산은 그대로 유지한다.
 * ══════════════════════════════════════════════════════════════════════ */

test('O. 이력이 전부 소실된 상태에서 재구성이 가짜 과거 스냅샷을 만들지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  const r = await page.locator('body').evaluate((el, today) => {
    state.dailySnapshots = {};
    reconstructHistoricalCurValues();
    const keys = Object.keys(state.dailySnapshots);
    return { total: keys.length, past: keys.filter((k) => k !== today).length };
  }, TODAY);
  expect(r.past, '근거 없는 과거 날짜를 만들어내면 안 된다').toBe(0);
});

test('P. 기록이 있는 날짜의 cur 재계산은 예전처럼 동작한다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  const r = await page.locator('body').evaluate(() => {
    // 실제 기록이 있는 과거 2일을 심는다(dailyPnL 보유 = 역산 근거 있음).
    const mk = (cur, pnl) => ({
      total: { cur, dailyPnL: pnl },
      byOwner: { '신랑': { cur, dailyPnL: pnl } },
      byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } }
    });
    const d1 = new Date(); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(); d2.setDate(d2.getDate() - 2);
    const k1 = dateKeyFromDate(d1), k2 = dateKeyFromDate(d2);
    state.dailySnapshots = {};
    state.dailySnapshots[k1] = mk(111, 11);
    state.dailySnapshots[k2] = mk(222, 22);
    reconstructHistoricalCurValues();
    const keys = Object.keys(state.dailySnapshots).sort();
    return { keys, k1, k2, stillThere: !!(state.dailySnapshots[k1] && state.dailySnapshots[k2]),
      pnlKept: state.dailySnapshots[k1].total.dailyPnL };
  });
  expect(r.stillThere, '기록이 있는 날짜는 그대로 남는다').toBe(true);
  expect(r.pnlKept, '기록된 손익은 재구성이 건드리지 않는다').toBe(11);
  expect(r.keys.length, '있는 날짜 외에 새로 만들어지지 않는다').toBeLessThanOrEqual(3);
});

/* ── FIX-2a : placeholder 후보 ──────────────────────────────────────── */

// 피해 상태를 실제 메커니즘 그대로 만든다.
// 손으로 임의의 값을 심으면 안 된다 - 실기기에서 오늘 스냅샷은 recordDailySnapshot(renderKPIs)이
// 쓰고 과거 placeholder는 reconstructHistoricalCurValues가 "그 시점의 실제 평가금액"을 복제해
// 만들었다. 두 값이 같아야 실제 피해 상태와 일치하므로, 앱이 기록한 오늘 스냅샷의 cur을 그대로
// 과거로 복제한다(FIX-3 이전 재구성이 하던 일과 동일하다).
function seedDamaged(page, runDays) {
  return page.locator('body').evaluate((el, n) => {
    const A = (id, t, own, cat) => ({
      id, ticker: t, owner: own, accountType: '일반계좌', category: cat, categorySource: 'user',
      name: 'E81_' + t, isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 1000,
      currentPrice: 1200, positionSource: 'manual', buyRate: 1300, createdAt: 1000, updatedAt: 1000
    });
    state.assets = [A('e81a', 'AAA', '신랑', '주식')];
    state.transactions = [];
    state.dailySnapshots = {};
    renderAll();   // 앱이 오늘자 스냅샷을 실제 경로로 기록한다

    const today = todayDateStr();
    const t = state.dailySnapshots[today];
    // 오늘 스냅샷의 cur 구성을 그대로 복제하고 dailyPnL만 0으로 둔다 = 재구성 placeholder의 모양
    const clone = (src) => {
      const out = { total: { cur: src.total.cur, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
      Object.keys(src.byOwner || {}).forEach((o) => { out.byOwner[o] = { cur: src.byOwner[o].cur, dailyPnL: 0 }; });
      Object.keys(src.byOwnerCategory || {}).forEach((o) => {
        out.byOwnerCategory[o] = {};
        Object.keys(src.byOwnerCategory[o]).forEach((c) => {
          out.byOwnerCategory[o][c] = { cur: src.byOwnerCategory[o][c].cur, dailyPnL: 0 };
        });
      });
      return out;
    };
    const dates = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dateKeyFromDate(d);
      state.dailySnapshots[k] = clone(t); dates.push(k);
    }
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    return dates;
  }, runDays);
}

function backupForDates(dates) {
  const mk = (cur, pnl) => ({
    total: { cur, dailyPnL: pnl },
    byOwner: { '신랑': { cur, dailyPnL: pnl } },
    byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } }
  });
  const snaps = {};
  dates.forEach((d, i) => { snaps[d] = mk(40000000 + i * 123456, (i % 5 - 2) * 50000); });
  return { app: 'smart-asset-manager', dailySnapshots: snaps,
    assets: [{ id: 'POISON', ticker: 'ZZZ', owner: '신랑', name: '오염', quantity: 999, buyPrice: 1 }],
    transactions: [{ id: 'POISON_TX', date: '2020-01-01', ticker: 'ZZZ', name: '오염', type: 'buy', quantity: 999, price: 1 }],
    rebalance: { updatedAt: 9e12 }, projection: { updatedAt: 9e12, inflationRate: 99 }, exchangeRate: 99999 };
}

test('Q. 피해 상태에서 placeholder가 후보로 분리되고 승인 전에는 교체되지 않는다', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 20);
  const before = await page.locator('body').evaluate(() => JSON.stringify(state.dailySnapshots));

  const p = await page.locator('body').evaluate((el, bk) => {
    const pl = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots);
    return { added: pl.added.length, cands: pl.placeholderCandidates.length,
      conflicts: pl.conflicts.length, replaced: pl.replaced.length };
  }, backupForDates(dates));

  expect(p.cands, '20일이 후보로 분리된다').toBe(20);
  expect(p.added, '후보는 added에 섞이지 않는다').toBe(0);
  expect(p.conflicts, '후보는 conflict로도 세지 않는다').toBe(0);
  expect(p.replaced, '승인 전에는 교체 0').toBe(0);
  expect(await page.locator('body').evaluate(() => JSON.stringify(state.dailySnapshots)),
    '미리보기는 state를 바꾸지 않는다').toBe(before);
});

test('R. 후보를 승인하면 교체되고, 차트가 수평선에서 벗어난다', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 20);
  const flat = await page.locator('body').evaluate(() =>
    new Set(buildTotalValueSeries(25).map((r) => Math.round(r.total))).size);

  const r = await page.locator('body').evaluate((el, bk) => {
    const plan = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots, { includePlaceholders: true });
    return applySnapshotRecovery(plan);
  }, backupForDates(dates));
  expect(r.replaced).toBe(20);

  const varied = await page.locator('body').evaluate(() =>
    new Set(buildTotalValueSeries(25).map((r2) => Math.round(r2.total))).size);
  expect(varied, `복구 후에도 수평선이다(before=${flat})`).toBeGreaterThan(flat);
});

test('S. 후보 교체 중에도 다른 state는 한 글자도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 20);
  const before = await fingerprint(page);
  await page.locator('body').evaluate((el, bk) => {
    const plan = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots, { includePlaceholders: true });
    applySnapshotRecovery(plan);
  }, backupForDates(dates));
  expect(await fingerprint(page)).toBe(before);
});

test('T. 후보 교체도 멱등하다 - 두 번째에는 추가도 교체도 0이다', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 20);
  const bk = backupForDates(dates);
  await page.locator('body').evaluate((el, b) =>
    applySnapshotRecovery(planSnapshotRecovery(b.dailySnapshots, state.dailySnapshots, { includePlaceholders: true })), bk);
  const after1 = await pastSnapshotsJson(page);

  const r2 = await page.locator('body').evaluate((el, b) =>
    applySnapshotRecovery(planSnapshotRecovery(b.dailySnapshots, state.dailySnapshots, { includePlaceholders: true })), bk);
  expect(r2.added).toBe(0);
  expect(r2.replaced, '이미 원본으로 바뀐 날짜를 또 교체하면 안 된다').toBe(0);
  expect(await pastSnapshotsJson(page)).toBe(after1);
});

test('U. 후보 교체 중에도 Cloud write가 0이다', async ({ page, context }) => {
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await open(page);
  await page.locator('body').evaluate(() => { syncState.enabled = true; syncState.password = 'e81-pw2'; });
  const dates = await seedDamaged(page, 20);
  await page.waitForTimeout(4500);
  writes.length = 0;

  await page.locator('body').evaluate((el, bk) =>
    applySnapshotRecovery(planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots, { includePlaceholders: true })),
  backupForDates(dates));
  await page.waitForTimeout(4500);
  expect(writes, `후보 교체로 Cloud write가 발생했다: ${writes.join(',')}`).toEqual([]);
});

test('V. 복구 -> 다음 부팅 재구성이 복구된 이력을 훼손하지 않는다(순환 안정성)', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 20);
  await page.locator('body').evaluate((el, bk) =>
    applySnapshotRecovery(planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots, { includePlaceholders: true })),
  backupForDates(dates));

  const r = await page.locator('body').evaluate((el, ds) => {
    const pnlBefore = ds.map((d) => state.dailySnapshots[d].total.dailyPnL);
    const uniqBefore = new Set(ds.map((d) => Math.round(state.dailySnapshots[d].total.cur))).size;
    reconstructHistoricalCurValues();       // 다음 부팅에서 도는 것과 같은 경로
    const stillAll = ds.every((d) => !!state.dailySnapshots[d]);
    const pnlAfter = ds.map((d) => state.dailySnapshots[d].total.dailyPnL);
    const uniqAfter = new Set(ds.map((d) => Math.round(state.dailySnapshots[d].total.cur))).size;
    return { stillAll, same: JSON.stringify(pnlBefore) === JSON.stringify(pnlAfter), uniqBefore, uniqAfter };
  }, dates);

  expect(r.stillAll, '복구된 날짜가 사라지면 안 된다').toBe(true);
  expect(r.same, '복구된 dailyPnL을 재구성이 바꾸면 안 된다').toBe(true);
  expect(r.uniqAfter, '재구성 후에도 수평선으로 되돌아가면 안 된다').toBeGreaterThan(1);
});

test('W. 손익이 기록된 정상 기록이 끼어 있으면 그 날은 후보가 아니고 구간이 끊긴다', async ({ page }) => {
  await open(page);
  // 한복판을 끊어도 양쪽이 14일 기준을 넘도록 충분히 긴 구간으로 만든다.
  const dates = await seedDamaged(page, 40);
  // 후보 구간 한복판의 하루를 "실제로 손익이 기록된 정상 기록"으로 바꾼다.
  const target = dates[19];
  await page.locator('body').evaluate((el, d) => {
    state.dailySnapshots[d] = {
      total: { cur: 12345678, dailyPnL: 4321 },
      byOwner: { '신랑': { cur: 12345678, dailyPnL: 4321 } },
      byOwnerCategory: { '신랑': { '주식': { cur: 12345678, dailyPnL: 4321 } } }
    };
    persistDailySnapshots();
  }, target);

  const p = await page.locator('body').evaluate((el, bk) => {
    const pl = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots);
    return { cands: pl.placeholderCandidates, conflicts: pl.conflicts };
  }, backupForDates(dates));

  expect(p.cands, '손익이 기록된 정상 기록은 후보가 아니다').not.toContain(target);
  expect(p.conflicts, '그 날짜는 충돌로만 보고된다').toContain(target);
  // 끊긴 양쪽 구간(19일 + 20일)은 각각 14일 기준을 넘으므로 후보로 남는다 - 그 하루만 빠진다.
  expect(p.cands.length).toBe(39);
});

test('W-2. [F2] 구간 안 하루의 평가금액이 달라도(손익 0) cur은 판정에 쓰지 않는다', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 40);
  const target = dates[19];
  await page.locator('body').evaluate((el, d) => {
    state.dailySnapshots[d] = {
      total: { cur: 12345678, dailyPnL: 0 },
      byOwner: { '신랑': { cur: 12345678, dailyPnL: 0 } },
      byOwnerCategory: { '신랑': { '주식': { cur: 12345678, dailyPnL: 0 } } }
    };
    persistDailySnapshots();
  }, target);

  const p = await page.locator('body').evaluate((el, bk) => {
    const pl = planSnapshotRecovery(bk.dailySnapshots, state.dailySnapshots);
    return { cands: pl.placeholderCandidates, conflicts: pl.conflicts };
  }, backupForDates(dates));

  expect(p.cands, '손익 0 구간의 날짜는 평가금액과 무관하게 같은 판정을 받는다').toContain(target);
  expect(p.cands.length).toBe(40);
  expect(p.conflicts).not.toContain(target);
});

/* ══════════════════════════════════════════════════════════════════════
 * [FIX-1 / POLICY-SNAPSHOT-PRESERVATION] 마이그레이션은 더 이상 과거 이력을 지우지 않는다.
 *
 * 예전엔 "중복 가능성이 있다"는 이유로 오늘 이전 스냅샷을 통째로 지우고 소급 채우기에 재생성을
 * 맡겼다. 그런데 소급 채우기는 티커가 있는 자산만 다룬다 - 부동산·채권·현금·달러는 시세 이력을
 * 조회할 수 없어 한 번 지우면 어떤 경로로도 돌아오지 않는다.
 *
 * 그래서 정리 방식을 삭제에서 "덧쓰지 않기"로 바꿨다. 소급 채우기가 이미 기록이 있는 날짜를
 * 건너뛰므로, 기존 이력을 그대로 두어도 이중 가산이 생기지 않는다. 이 블록은 그 두 가지를
 * 함께 고정한다 - ① 아무것도 지우지 않는다 ② 그래도 이중 가산이 없다.
 * ══════════════════════════════════════════════════════════════════════ */

// 마이그레이션 직전 상태를 원하는 대로 만들고 실행한다(실제 부팅이 타는 함수 그대로).
function runMigration(page, opts) {
  return page.locator('body').evaluate((el, o) => {
    const mk = (cur, pnl) => ({
      total: { cur, dailyPnL: pnl },
      byOwner: { '신랑': { cur, dailyPnL: pnl } },
      byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } }
    });
    const today = todayDateStr();
    const snaps = {};
    snaps[today] = mk(1000, 1);                       // 오늘 기록은 항상 있다
    for (let i = 1; i <= o.pastDays; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      snaps[dateKeyFromDate(d)] = mk(1000 + i, 10 + i);
    }
    state.dailySnapshots = snaps;
    localStorage.setItem('sam_daily_snapshot_v1', JSON.stringify(snaps));
    if (o.fingerprints) localStorage.setItem('sam_daily_backfill_done_fingerprints_v2', JSON.stringify(o.fingerprints));
    else localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    localStorage.removeItem('sam_daily_snapshot_dedup_migrated_v1');

    const result = remediateDuplicatedDailySnapshotHistory();
    const fpAfter = localStorage.getItem('sam_daily_backfill_done_fingerprints_v2');
    return {
      result,
      pastLeft: Object.keys(state.dailySnapshots).filter((k) => k !== today).length,
      todayLeft: !!state.dailySnapshots[today],
      pnlKept: o.pastDays ? state.dailySnapshots[Object.keys(state.dailySnapshots).filter((k) => k !== today).sort()[0]].total.dailyPnL : null,
      fingerprintsAfter: fpAfter ? JSON.parse(fpAfter).length : 0,
      migratedFlag: localStorage.getItem('sam_daily_snapshot_dedup_migrated_v1')
    };
  }, opts);
}

// 네트워크 없이 소급 채우기를 돌리기 위한 합성 종가(하루 +100).
// 외부 시세 API를 부르지 않으려고 fetchDailyHistory만 갈아끼운다 - 검증 대상은 "어느 날짜에
// 쓰는가"이지 종가 자체가 아니다.
function stubDailyHistory(page) {
  return page.locator('body').evaluate((el) => {
    el.ownerDocument.defaultView.fetchDailyHistory = async () => {
      const pts = [];
      for (let i = 400; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); pts.push({ date: d, close: 10000 + (400 - i) * 100 }); }
      return pts;
    };
  });
}

test('X-1. Case 1 - 이력 있음 + 지문 있음: 아무것도 지우지 않고 지문도 그대로다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  const r = await runMigration(page, { pastDays: 30, fingerprints: ['신랑|일반계좌|005930.KS'] });
  expect(r.result.case).toBe('PRESERVED');
  expect(r.result.deleted).toBe(0);
  expect(r.pastLeft, '과거 30일이 그대로 남는다').toBe(30);
  expect(r.pnlKept, '기록된 손익이 그대로다').toBe(40);
  expect(r.fingerprintsAfter, '지문을 비우면 이미 채운 자산이 다시 대상이 된다').toBe(1);
  expect(r.migratedFlag).toBe('1');
});

test('X-2. Case 2 - 이력 있음 + 지문 없음: 지우지 않으며, 그래도 이중 가산이 없다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await runMigration(page, { pastDays: 30, fingerprints: null });
  expect(r.result.case).toBe('PRESERVED');
  expect(r.pastLeft).toBe(30);

  // 마이그레이션 직후 부팅이 하던 그대로 소급 채우기를 돌린다 - 예전엔 여기서 값이 2배가 됐다.
  const dbl = await page.locator('body').evaluate(async () => {
    const today = todayDateStr();
    const past = Object.keys(state.dailySnapshots).filter((k) => k !== today).sort();
    const before = past.map((k) => state.dailySnapshots[k].total.dailyPnL);
    await backfillAllHoldingsDailyPnlHistory();
    const after = past.map((k) => state.dailySnapshots[k].total.dailyPnL);
    return { changed: before.filter((v, i) => v !== after[i]).length, before: before[0], after: after[0] };
  });
  expect(dbl.changed, `기존 날짜의 손익이 바뀌었다(${dbl.before} -> ${dbl.after})`).toBe(0);
});

test('X-3. Case 3 - 이력 없음 + 지문 없음: 신규 소급 채우기가 정상 동작한다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await runMigration(page, { pastDays: 0, fingerprints: null });
  expect(r.result.case).toBe('PRESERVED');
  expect(r.pastLeft).toBe(0);

  const filled = await page.locator('body').evaluate(async () => {
    await backfillAllHoldingsDailyPnlHistory();
    const today = todayDateStr();
    return Object.keys(state.dailySnapshots).filter((k) => k !== today).length;
  });
  expect(filled, '빈 기기에서는 소급 채우기가 과거를 채워야 한다').toBeGreaterThan(100);
});

test('X-4. Case 4 - 이력 없음 + 지문 있음: 아무것도 다시 계산하지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await page.locator('body').evaluate(async () => {
    state.dailySnapshots = {};
    localStorage.setItem('sam_daily_backfill_done_fingerprints_v2', JSON.stringify(state.assets.map(getBackfillFingerprint)));
    localStorage.removeItem('sam_daily_snapshot_dedup_migrated_v1');
    const res = remediateDuplicatedDailySnapshotHistory();
    await backfillAllHoldingsDailyPnlHistory();
    const today = todayDateStr();
    return { case: res.case, past: Object.keys(state.dailySnapshots).filter((k) => k !== today).length };
  });
  expect(r.case).toBe('PRESERVED');
  expect(r.past, '지문이 다 있으면 재계산 대상이 없다').toBe(0);
});

test('X-5. 소급 채우기는 기존 기록이 있는 날짜를 절대 덧쓰지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await page.locator('body').evaluate(async () => {
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    state.dailySnapshots = {};
    const kept = [];
    for (let i = 5; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dateKeyFromDate(d); kept.push(k);
      state.dailySnapshots[k] = { total: { cur: 1, dailyPnL: 777 }, byOwner: {}, byOwnerCategory: {} };
    }
    await backfillAllHoldingsDailyPnlHistory();
    const today = todayDateStr();
    return {
      keptSame: kept.every((k) => state.dailySnapshots[k].total.dailyPnL === 777),
      filled: Object.keys(state.dailySnapshots).filter((k) => k !== today && kept.indexOf(k) < 0).length
    };
  });
  expect(r.keptSame, '기존 5일의 손익이 그대로여야 한다').toBe(true);
  expect(r.filled, '비어 있던 날짜는 정상적으로 채워져야 한다').toBeGreaterThan(100);
});

test('X-6. 한 번의 패스 안에서는 여러 자산이 같은 날짜에 정상 누적된다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await page.locator('body').evaluate(async () => {
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    const A = (id, t, own) => ({ id, ticker: t, owner: own, accountType: '일반계좌', category: '주식',
      categorySource: 'user', name: 'BF_' + t, isDomestic: '국내', currency: 'KRW', quantity: 10,
      buyPrice: 10000, currentPrice: 50000, positionSource: 'manual', createdAt: 1, updatedAt: 1 });
    state.assets = [A('x1', '005930', '신랑'), A('x2', '000660', '와이프')];
    state.dailySnapshots = {};
    await backfillAllHoldingsDailyPnlHistory();
    const today = todayDateStr();
    const keys = Object.keys(state.dailySnapshots).filter((k) => k !== today).sort();
    const mid = state.dailySnapshots[keys[Math.floor(keys.length / 2)]];
    return { days: keys.length, owners: Object.keys(mid.byOwner || {}).sort() };
  });
  expect(r.days).toBeGreaterThan(100);
  expect(r.owners, '두 자산이 같은 날짜에 함께 반영되어야 한다').toEqual(['신랑', '와이프']);
});

test('X-7. 소급 채우기를 두 번 돌려도 값이 변하지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await page.locator('body').evaluate(async () => {
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    state.dailySnapshots = {};
    await backfillAllHoldingsDailyPnlHistory();
    const today = todayDateStr();
    const keys = Object.keys(state.dailySnapshots).filter((k) => k !== today).sort();
    const before = keys.map((k) => state.dailySnapshots[k].total.dailyPnL);
    await backfillAllHoldingsDailyPnlHistory();
    const after = keys.map((k) => state.dailySnapshots[k].total.dailyPnL);
    return JSON.stringify(before) === JSON.stringify(after);
  });
  expect(r, '두 번째 실행이 값을 바꾸면 안 된다').toBe(true);
});

test('X-8. 두 번째 부팅에서 마이그레이션이 다시 돌지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await runMigration(page, { pastDays: 30, fingerprints: ['a|b|c'] });
  const second = await page.locator('body').evaluate(() => {
    const res = remediateDuplicatedDailySnapshotHistory();
    const today = todayDateStr();
    return { case: res.case, pastLeft: Object.keys(state.dailySnapshots).filter((k) => k !== today).length };
  });
  expect(second.case).toBe('ALREADY_MIGRATED');
  expect(second.pastLeft).toBe(30);
});

test('X-9. 마이그레이션은 자산·거래·설정을 바꾸지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  const before = await fingerprint(page);
  await runMigration(page, { pastDays: 30, fingerprints: ['a|b|c'] });
  expect(await fingerprint(page), 'dailySnapshots 외의 state가 바뀌면 안 된다').toBe(before);
});

test('X-10. 마이그레이션 중 Cloud write가 발생하지 않는다', async ({ page, context }) => {
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await open(page);
  await page.locator('body').evaluate(() => { syncState.enabled = true; syncState.password = 'e81-mig'; });
  await seed(page, []);
  await page.waitForTimeout(4500);
  writes.length = 0;
  await runMigration(page, { pastDays: 30, fingerprints: ['a|b|c'] });
  await page.waitForTimeout(4500);
  expect(writes, `마이그레이션이 Cloud write를 유발했다: ${writes.join(',')}`).toEqual([]);
});

test('X-11. 티커 없는 자산(부동산·채권·현금)의 과거 이력이 보존된다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  await stubDailyHistory(page);
  const r = await page.locator('body').evaluate(async () => {
    const A = (id, t, cat) => ({ id, ticker: t, owner: '신랑', accountType: '일반계좌', category: cat,
      categorySource: 'user', name: 'TL_' + cat, isDomestic: '국내', currency: 'KRW', quantity: 1,
      buyPrice: 1000000, currentPrice: 1200000, positionSource: 'manual', createdAt: 1, updatedAt: 1 });
    state.assets = [A('t1', '005930', '주식'), A('t2', '', '부동산'), A('t3', '', '채권'), A('t4', '', '현금')];
    state.transactions = [];
    localStorage.removeItem('sam_daily_backfill_done_fingerprints_v2');
    localStorage.removeItem('sam_daily_snapshot_dedup_migrated_v1');

    // 티커 없는 자산군의 과거 이력(소급 채우기로는 절대 되살릴 수 없는 값)
    const snaps = {};
    const dates = [];
    for (let i = 20; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dateKeyFromDate(d); dates.push(k);
      snaps[k] = { total: { cur: 3000000, dailyPnL: 500 },
        byOwner: { '신랑': { cur: 3000000, dailyPnL: 500 } },
        byOwnerCategory: { '신랑': { '부동산': { cur: 1200000, dailyPnL: 200 },
          '채권': { cur: 1000000, dailyPnL: 200 }, '현금': { cur: 800000, dailyPnL: 100 } } } };
    }
    state.dailySnapshots = snaps;

    remediateDuplicatedDailySnapshotHistory();
    await backfillAllHoldingsDailyPnlHistory();

    return {
      allThere: dates.every((d) => !!state.dailySnapshots[d]),
      realEstateKept: dates.every((d) => (((state.dailySnapshots[d].byOwnerCategory || {})['신랑'] || {})['부동산'] || {}).dailyPnL === 200),
      bondKept: dates.every((d) => (((state.dailySnapshots[d].byOwnerCategory || {})['신랑'] || {})['채권'] || {}).dailyPnL === 200),
      cashKept: dates.every((d) => (((state.dailySnapshots[d].byOwnerCategory || {})['신랑'] || {})['현금'] || {}).dailyPnL === 100),
      totalKept: dates.every((d) => state.dailySnapshots[d].total.dailyPnL === 500)
    };
  });
  expect(r.allThere, '과거 날짜가 사라지면 안 된다').toBe(true);
  expect(r.realEstateKept, '부동산 이력은 소급 채우기로 되살릴 수 없다 - 반드시 보존').toBe(true);
  expect(r.bondKept, '채권 이력 보존').toBe(true);
  expect(r.cashKept, '현금 이력 보존').toBe(true);
  expect(r.totalKept, '합계 손익이 부풀려지면 안 된다').toBe(true);
});

test('X-12. FIX-1 -> FIX-3 순서로 돌아도 가짜 과거가 생기지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, []);
  const r = await page.locator('body').evaluate(() => {
    state.dailySnapshots = {};
    renderAll();                                  // 오늘 기록만 있는 상태
    localStorage.removeItem('sam_daily_snapshot_dedup_migrated_v1');
    remediateDuplicatedDailySnapshotHistory();
    reconstructHistoricalCurValues();
    const today = todayDateStr();
    return { past: Object.keys(state.dailySnapshots).filter((k) => k !== today).length };
  });
  expect(r.past, '마이그레이션 직후 재구성이 가짜 과거를 만들면 안 된다').toBe(0);
});

test('X-L. 통합 시나리오 - 피해 -> FIX-3 -> Preview -> 승인 -> 복구 -> 재부팅 유지', async ({ page }) => {
  await open(page);
  const dates = await seedDamaged(page, 40);   // 40일 placeholder (14일 기준 초과)
  const bk = backupForDates(dates);
  const beforeOther = await fingerprint(page);

  // ① FIX-3: 새 placeholder 생성 0
  const created = await page.locator('body').evaluate(() => {
    const before = Object.keys(state.dailySnapshots).length;
    reconstructHistoricalCurValues();
    return Object.keys(state.dailySnapshots).length - before;
  });
  expect(created).toBe(0);

  // ② Preview - 승인 전 변경 0
  const snapBefore = await pastSnapshotsJson(page);
  const p = await page.locator('body').evaluate((el, b) => {
    const pl = planSnapshotRecovery(b.dailySnapshots, state.dailySnapshots);
    return { added: pl.added.length, cands: pl.placeholderCandidates.length, conflicts: pl.conflicts.length };
  }, bk);
  expect(p.cands, '40일이 14일 기준으로도 후보가 된다').toBe(40);
  expect(p.conflicts).toBe(0);
  expect(await pastSnapshotsJson(page), '승인 전에는 아무것도 바뀌지 않는다').toBe(snapBefore);

  // ③ 승인 후 복구
  const res = await page.locator('body').evaluate((el, b) =>
    applySnapshotRecovery(planSnapshotRecovery(b.dailySnapshots, state.dailySnapshots, { includePlaceholders: true })), bk);
  expect(res.replaced).toBe(40);

  // ④ 재부팅 시 재구성이 복구된 이력을 훼손하지 않는다
  const after = await page.locator('body').evaluate((el, ds) => {
    const pnlBefore = ds.map((d) => state.dailySnapshots[d].total.dailyPnL);
    reconstructHistoricalCurValues();
    return {
      allThere: ds.every((d) => !!state.dailySnapshots[d]),
      pnlSame: JSON.stringify(pnlBefore) === JSON.stringify(ds.map((d) => state.dailySnapshots[d].total.dailyPnL)),
      curUniq: new Set(ds.map((d) => Math.round(state.dailySnapshots[d].total.cur))).size
    };
  }, dates);
  expect(after.allThere, '복구된 날짜가 사라지면 안 된다').toBe(true);
  expect(after.pnlSame, '복구된 dailyPnL이 바뀌면 안 된다').toBe(true);
  expect(after.curUniq, '다시 수평선으로 돌아가면 안 된다').toBeGreaterThan(1);

  // ⑤ 다른 state는 전혀 바뀌지 않았다
  expect(await fingerprint(page)).toBe(beforeOther);
});

/* ══════════════════════════════════════════════════════════════════════
 * [v236 P1-A] 실제 UI 경로(파일 선택 -> 확인창)로 복구해도 Cloud write가 0이다
 *
 * 위 J/U는 복구 함수를 직접 불렀다 - 그래서 핸들러가 복구 직후 부르는 renderAll()이
 * renderKPIs -> recordDailySnapshot -> persistDailySnapshots()를 거쳐 push를 예약하는 경로를 놓쳤다.
 * 여기서는 사용자가 실제로 거치는 파일 입력과 확인창을 그대로 태운다.
 * Worker는 route로 가로채 쓰기 메서드만 센다(실제 Worker 호출 0).
 * ══════════════════════════════════════════════════════════════════════ */

async function routeWrites(context) {
  const writes = [];
  await context.route(WORKER, async (route) => {
    const m = route.request().method();
    if (m !== 'GET' && m !== 'HEAD') writes.push(m);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return writes;
}

const enableSyntheticSync = (page) => page.locator('body').evaluate(() => {
  syncState.enabled = true;
  syncState.password = 'e81-ui-pw';
});

// 파일 입력으로 복구를 실행한다. answers는 확인창 순서대로 수락/거절이다.
// acceptDelayMs: 확인창을 그만큼 띄워 둔 뒤 답한다 - 확인창이 떠 있는 동안 페이지 스크립트는 멈추므로,
// 그 사이 예약 시각이 지난 push 타이머도 확인창이 닫힌 뒤에야 실행 기회를 얻는다.
async function recoverViaUi(page, backup, opts) {
  const o = opts || {};
  const answers = (o.answers || ['accept']).slice();
  const messages = [];
  const onDialog = async (dialog) => {
    messages.push(dialog.message());
    const answer = answers.length ? answers.shift() : 'dismiss';
    if (o.acceptDelayMs) await new Promise((r) => setTimeout(r, o.acceptDelayMs));
    if (answer === 'accept') await dialog.accept(); else await dialog.dismiss();
  };
  page.on('dialog', onDialog);
  await page.setInputFiles('#snapshotRecoveryFileInput', {
    name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))
  });
  const toast = page.locator('#toastContainer');
  await expect(toast).toContainText(o.expectToast || '일별 이력', { timeout: 15000 });
  page.off('dialog', onDialog);
  return { messages, toastText: await toast.innerText() };
}

// 1차 확인창 문구 -> 숫자. 화면 문구와 내부 값의 대응이 틀어지면 여기서 드러난다.
function parsePreview(msg) {
  const n = (re) => { const m = msg.match(re); return m ? Number(m[1]) : null; };
  return {
    added: n(/새로 추가되는 이력: (\d+)일/),
    candidates: n(/복구 후보: (\d+)일/),
    kept: n(/기존 유지: (\d+)일/),
    conflicts: n(/값이 달라 건너뜀\(현재 값 유지\): (\d+)일/),
    invalid: n(/형식이 맞지 않아 제외: (\d+)건/)
  };
}

const SYNC_ON_NOTE = '복구하는 동안에는 클라우드에 올리지 않았습니다. 이후 정상 동기화에서 이 기기의 변경사항이 반영됩니다.';
const SYNC_OFF_NOTE = '클라우드에는 올리지 않았습니다.';
// 1차 확인창의 클라우드 안내 - 복구 적용 중에는 쓰지 않고, 이후 일반 동기화로 반영될 수 있음을 함께 알린다.
const CONFIRM_CLOUD_LINES = ['복구 적용 중에는 클라우드에 저장하지 않습니다.', '이후 일반 동기화가 실행되면 복구 결과가 반영될 수 있습니다.'];
const CONFIRM_CLOUD_OLD = '클라우드에는 자동으로 올리지 않습니다';

test('Y-1. [P1-A] 동기화 OFF - UI로 복구해도 Cloud POST 0, 안내는 "올리지 않았습니다"', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await seed(page, CUR);
  const before = await fingerprint(page);

  const r = await recoverViaUi(page, makeBackup(BK));
  expect(r.messages.length, '후보가 없으면 확인창은 1번뿐이다').toBe(1);
  CONFIRM_CLOUD_LINES.forEach((line) => expect(r.messages[0]).toContain(line));
  expect(r.messages[0], '오해 가능한 예전 문구는 남아 있으면 안 된다').not.toContain(CONFIRM_CLOUD_OLD);
  // 기존 유지 3 = seed한 2일 + renderAll이 실시간으로 기록한 오늘
  expect(parsePreview(r.messages[0])).toEqual({ added: 4, candidates: 0, kept: 3, conflicts: 1, invalid: 0 });
  await page.waitForTimeout(4500);

  expect(writes, `Cloud write가 발생했다: ${writes.join(',')}`).toEqual([]);
  expect(r.toastText).toContain(SYNC_OFF_NOTE);
  expect(r.toastText).not.toContain('복구하는 동안');
  expect(await storedKeys(page)).toEqual(
    ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09']);
  expect(await fingerprint(page), '다른 state가 바뀌면 안 된다').toBe(before);
});

test('Y-2. [P1-A] 동기화 ON - UI로 복구하고 4.5초가 지나도 Cloud POST 0, 동기화 설정은 그대로다', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await enableSyntheticSync(page);
  await seed(page, CUR);
  await page.waitForTimeout(4500); // seed가 건 예약을 먼저 흘려보낸다
  writes.length = 0;
  const before = await fingerprint(page);

  const r = await recoverViaUi(page, makeBackup(BK));
  await page.waitForTimeout(4500); // schedulePush 3초 디바운스보다 길게
  // 동기화 ON이어도 1차 확인창 문구는 같다 - 동작(POST 0 · 이후 일반 동기화)은 아래에서 따로 확인한다.
  CONFIRM_CLOUD_LINES.forEach((line) => expect(r.messages[0]).toContain(line));
  expect(r.messages[0]).not.toContain(CONFIRM_CLOUD_OLD);

  expect(writes, `복구 과정에서 Cloud write가 발생했다: ${writes.join(',')}`).toEqual([]);
  expect(r.toastText).toContain(SYNC_ON_NOTE);
  const s = await page.locator('body').evaluate(() => ({
    enabled: syncState.enabled, password: syncState.password, guard: applyingRemoteUpdate
  }));
  expect(s).toEqual({ enabled: true, password: 'e81-ui-pw', guard: false });
  expect(await storedKeys(page)).toEqual(
    ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09']);
  expect(await fingerprint(page), '다른 state가 바뀌면 안 된다').toBe(before);
});

test('Y-3. [P1-A] 동기화 ON - 복구 과정은 POST 0이고, 이후 정상 사용자 변경은 기존처럼 올라간다', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await enableSyntheticSync(page);
  await seed(page, CUR);
  await page.waitForTimeout(4500);
  writes.length = 0;

  await recoverViaUi(page, makeBackup(BK));
  await page.waitForTimeout(4500);
  expect(writes, '복구 과정').toEqual([]);

  // 일반 편집 저장 경로(persistAssets)는 예전처럼 push를 예약해야 한다.
  await page.locator('body').evaluate(() => { state.assets[0].quantity = 11; persistAssets(); });
  await page.waitForTimeout(4500);
  expect(writes.length, '복구 뒤 정상 변경의 동기화가 끊기면 안 된다').toBeGreaterThan(0);
});

test('Y-4. [P1-A] 복구 직전에 이미 예약된 push도 복구 직후 실행되지 않는다(로컬 변경은 그대로)', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await enableSyntheticSync(page);
  await seed(page, CUR);
  await page.waitForTimeout(4500);
  writes.length = 0;

  // 정상 편집으로 push가 예약된 상태에서 곧바로 복구를 시작하고, 확인창을 예약 시각(3초)보다 오래 띄워 둔다.
  await page.locator('body').evaluate(() => { state.assets[0].quantity = 12; persistAssets(); });
  await recoverViaUi(page, makeBackup(BK), { acceptDelayMs: 3500 });
  await page.waitForTimeout(4500);
  expect(writes, `예약돼 있던 push가 복구 직후 실행됐다: ${writes.join(',')}`).toEqual([]);

  // 예약 취소는 전송을 미룬 것뿐이다 - 로컬 변경은 state와 localStorage에 그대로 남아 있어야 한다.
  const kept = await page.locator('body').evaluate(() => ({
    mem: state.assets[0].quantity,
    stored: JSON.parse(localStorage.getItem(LS_ASSETS)).find((a) => a.id === state.assets[0].id).quantity
  }));
  expect(kept).toEqual({ mem: 12, stored: 12 });
});

test('Y-5. [P1-A] 복구가 끝나면 정기 갱신(renderAll) 경로의 동기화도 다시 동작한다', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  await enableSyntheticSync(page);
  await seed(page, CUR);
  await page.waitForTimeout(4500);
  writes.length = 0;

  await page.locator('body').evaluate(() => { state.assets[0].quantity = 13; persistAssets(); });
  await recoverViaUi(page, makeBackup(BK), { acceptDelayMs: 3500 });
  await page.waitForTimeout(4500);
  expect(writes, '복구 과정').toEqual([]);

  // 시세 자동 갱신·탭 복귀가 부르는 것과 같은 renderAll() - 가드가 풀려 있어야 다시 예약된다.
  await page.locator('body').evaluate(() => { renderAll(); });
  await page.waitForTimeout(4500);
  expect(writes.length, '복구 뒤 정기 동기화가 끊기면 안 된다').toBeGreaterThan(0);
  expect(await page.locator('body').evaluate(() => applyingRemoteUpdate)).toBe(false);
});

/* ══════════════════════════════════════════════════════════════════════
 * [v236 P1-B · F2] 최근 실제 손익 + 부팅 재구성 뒤에도 placeholder 후보를 놓치지 않는다
 *
 * 과거 cur은 부팅 재구성이 "오늘 값 - 그 사이 손익"으로 다시 계산하는 파생값이다. 그래서 F2는 cur을 판정에
 * 쓰지 않고, 현재의 손익 0 연속 구간(14일 이상)과 백업의 손익 기록(25% 이상)만 본다.
 * 피해 state는 앱 코드 경로로 만든다: 오늘 기록(renderAll, USD 현금은 '달러') -> 빈 과거 날짜를 재구성이 채움
 * ('현금') -> 최근 3일에 실제 손익 기록 -> 부팅 재구성을 한 번 더 실행해 placeholder cur이 오늘 값에서 벗어난 상태.
 * 부팅의 비동기 재구성이 뒤늦게 한 번 더 돌아도 cur만 같은 값으로 다시 계산할 뿐이라 판정 결과는 같다 -
 * 그래서 경쟁 상태를 대기 시간으로 숨길 필요가 없다.
 * 구성: 오늘 + 최근 실제 기록 3일(백업에 없음) + placeholder 362일(백업과 겹침) / 백업: 겹치는 362일 + 더 과거 33일.
 * 실제 휴대폰 state나 실제 백업을 반입한 것이 아니다 - 휴대폰 관찰값과 같은 모양을 합성으로 만든 것이다.
 * ══════════════════════════════════════════════════════════════════════ */

function seedUsdCashDamage(page) {
  return page.locator('body').evaluate(() => {
    const A = (id, own, cat, qty, price, ccy) => ({
      id, ticker: '', owner: own, accountType: '일반계좌', category: cat, categorySource: 'user',
      name: 'E81_USD_' + id, isDomestic: ccy === 'USD' ? '해외' : '국내', currency: ccy, quantity: qty,
      buyPrice: price, currentPrice: price, positionSource: 'manual', createdAt: 1000, updatedAt: 1000
    });
    state.assets = [A('u1', '신랑', '주식', 100, 71000, 'KRW'), A('u2', '신랑', '현금', 1, 3000000, 'KRW'),
      A('u3', '신랑', '현금', 1000, 1, 'USD')];
    state.transactions = [];
    state.exchangeRate = 1382.37;
    state.dailySnapshots = {};
    renderAll(); // 오늘 기록 - USD 현금은 '달러' 키

    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const today = todayDateStr();
    for (let n = 1; n <= 365; n++) state.dailySnapshots[dk(n)] = { total: { cur: 0, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
    reconstructHistoricalCurValues(); // 기존 날짜의 cur 채우기 - USD 현금은 '현금' 키

    // 최근 3일은 실제로 손익이 기록된 날이다(백업보다 최신이라 백업에 없다).
    const recent = [];
    for (let n = 1; n <= 3; n++) {
      const v = 70000000 + n * 111111;
      state.dailySnapshots[dk(n)] = { total: { cur: v, dailyPnL: n * 1000 }, byOwner: { '신랑': { cur: v, dailyPnL: n * 1000 } },
        byOwnerCategory: { '신랑': { '주식': { cur: v, dailyPnL: n * 1000 } } } };
      recent.push(dk(n));
    }
    reconstructHistoricalCurValues(); // 다음 부팅의 재구성 - 최근 손익만큼 placeholder cur이 오늘 값에서 벗어난다
    persistAssets(true); persistTransactions(); persistDailySnapshots();

    const placeholders = [];
    for (let n = 4; n <= 365; n++) placeholders.push(dk(n));
    const backupOnly = [];
    for (let n = 366; n <= 398; n++) backupOnly.push(dk(n));
    return { today, recent, placeholders, backupOnly };
  });
}

function usdBackup(dates) {
  const mk = (i) => {
    const cur = 45000000 + i * 23456, pnl = ((i % 7) - 3) * 12000;
    return { total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } },
      byOwnerCategory: { '신랑': { '주식': { cur: cur - 2000000, dailyPnL: pnl }, '현금': { cur: 2000000, dailyPnL: 0 } } } };
  };
  const snaps = {};
  dates.forEach((d, i) => { snaps[d] = mk(i); });
  return { app: 'smart-asset-manager', exportedAt: '2026-09-09T15:30:00.000Z', dailySnapshots: snaps,
    assets: [{ id: 'POISON', ticker: 'ZZZ', owner: '신랑', name: '오염', quantity: 999, buyPrice: 1 }],
    transactions: [{ id: 'POISON_TX', date: '2020-01-01', ticker: 'ZZZ', name: '오염', type: 'buy', quantity: 999, price: 1 }],
    rebalance: { updatedAt: 9e12 }, projection: { updatedAt: 9e12, inflationRate: 99 }, exchangeRate: 99999 };
}

test('Y-6. [P1-B·F2] 최근 실제 손익 + 부팅 재구성 뒤에도 Preview 후보 362 / 건너뜀 0, 33일 분리 · 최신 날짜 보호', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  const s = await seedUsdCashDamage(page);
  expect(s.placeholders.length).toBe(362);
  expect(s.backupOnly.length).toBe(33);

  // 전제: placeholder cur이 오늘 값과 실제로 다르고(재구성 이동), 손익은 0이며, 최근 3일은 실제 손익 기록이다.
  const st = await page.locator('body').evaluate((el, d) => ({
    todayTotal: state.dailySnapshots[d.today].total.cur,
    phTotal: state.dailySnapshots[d.placeholders[0]].total.cur,
    phZero: d.placeholders.every((k) => hasNoRecordedPnl(state.dailySnapshots[k])),
    recentRecorded: d.recent.every((k) => !hasNoRecordedPnl(state.dailySnapshots[k])),
    todayKeys: Object.keys(state.dailySnapshots[d.today].byOwnerCategory['신랑']).sort(),
    phKeys: Object.keys(state.dailySnapshots[d.placeholders[0]].byOwnerCategory['신랑']).sort()
  }), s);
  expect(st.phTotal, 'placeholder cur이 오늘 값과 같으면 이 테스트의 전제가 무너진다').not.toBe(st.todayTotal);
  expect(st.phZero).toBe(true);
  expect(st.recentRecorded).toBe(true);
  expect(st.todayKeys).toContain('달러');
  expect(st.phKeys).not.toContain('달러');

  const bk = usdBackup(s.placeholders.concat(s.backupOnly));
  // 계획 단계에서 33일 분리와 최신 날짜 보호를 직접 확인한다.
  const p = await page.locator('body').evaluate((el, a) => {
    const pl = planSnapshotRecovery(a.bk.dailySnapshots, state.dailySnapshots);
    const c = new Set(pl.placeholderCandidates);
    return {
      latestHit: [a.s.today].concat(a.s.recent).filter((d) => c.has(d)).length,
      addedInCandidates: pl.added.filter((d) => c.has(d)).length,
      addedAlreadyInCurrent: pl.added.filter((d) => Object.prototype.hasOwnProperty.call(state.dailySnapshots, d)).length,
      candidatesArePlaceholders: JSON.stringify(pl.placeholderCandidates) === JSON.stringify(a.s.placeholders.slice().sort()),
      addedAreBackupOnly: JSON.stringify(pl.added) === JSON.stringify(a.s.backupOnly.slice().sort())
    };
  }, { s, bk });
  expect(p).toEqual({ latestHit: 0, addedInCandidates: 0, addedAlreadyInCurrent: 0, candidatesArePlaceholders: true, addedAreBackupOnly: true });

  const beforePast = await pastSnapshotsJson(page);
  const r = await recoverViaUi(page, bk, { answers: ['dismiss'], expectToast: '복구를 취소했습니다' });
  expect(r.messages.length).toBe(1);
  expect(parsePreview(r.messages[0])).toEqual({ added: 33, candidates: 362, kept: 4, conflicts: 0, invalid: 0 });
  expect(await pastSnapshotsJson(page), '취소하면 아무것도 바뀌지 않는다').toBe(beforePast);
  expect(writes).toEqual([]);
});

test('Y-7. [P1-B·F2] 같은 state를 UI에서 승인 - 확인창 메타데이터 표시, 추가 33 · 교체 362, 최신 기록·다른 state 보존, Cloud POST 0', async ({ page, context }) => {
  const writes = await routeWrites(context);
  await open(page);
  const s = await seedUsdCashDamage(page);
  await enableSyntheticSync(page);
  await page.waitForTimeout(4500); // seed가 건 push 예약(3초 디바운스)을 먼저 흘려보낸다
  writes.length = 0;

  const bk = usdBackup(s.placeholders.concat(s.backupOnly));
  const before = await fingerprint(page);
  const recentBefore = await page.locator('body').evaluate((el, d) => JSON.stringify(d.map((k) => state.dailySnapshots[k])), s.recent);

  const r = await recoverViaUi(page, bk, { answers: ['accept', 'accept'] });
  expect(r.messages.length, '후보가 있으면 확인창이 2번 뜬다').toBe(2);
  expect(parsePreview(r.messages[0])).toEqual({ added: 33, candidates: 362, kept: 4, conflicts: 0, invalid: 0 });

  const second = r.messages[1];
  const allDates = s.placeholders.concat(s.backupOnly).sort();
  expect(second).toContain('복구 후보 362일');
  expect(second).toContain('손익 기록이 없는 날이 14일 이상 이어진 구간');
  expect(second).toContain('[선택한 백업 파일]');
  expect(second).toContain('· 내보낸 시각: 2026-09-10 00:30 (KST)');
  expect(second).toContain(`· 이력 기간: ${allDates[0]} ~ ${allDates[allDates.length - 1]}`);
  expect(second).toContain('· 소유자: 신랑');
  expect(second).toContain('· 복구 후보: 362일');
  expect(second, '예전의 확정적 표현은 남아 있으면 안 된다').not.toContain('평가금액이 오늘과');

  expect(r.toastText).toContain('일별 이력 33일을 추가했습니다 · 후보 362일을 백업 이력으로 교체');
  expect(r.toastText).toContain(SYNC_ON_NOTE);
  await page.waitForTimeout(4500);
  expect(writes, `복구 과정에서 Cloud write가 발생했다: ${writes.join(',')}`).toEqual([]);

  const after = await page.locator('body').evaluate((el, a) => {
    const stored = JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}');
    const dates = a.s.placeholders.concat(a.s.backupOnly);
    return {
      allFromBackup: dates.every((d) => JSON.stringify(stored[d]) === JSON.stringify(a.bk.dailySnapshots[d])),
      memMatchesStored: dates.every((d) => JSON.stringify(state.dailySnapshots[d]) === JSON.stringify(stored[d])),
      recent: JSON.stringify(a.s.recent.map((k) => stored[k])),
      todayKeys: Object.keys(stored[a.s.today].byOwnerCategory['신랑']).sort(),
      total: Object.keys(stored).length
    };
  }, { s, bk });
  expect(after.allFromBackup, '추가 33일과 교체 362일이 백업 값이어야 한다').toBe(true);
  expect(after.memMatchesStored).toBe(true);
  expect(after.recent, '백업보다 최신인 기록은 한 글자도 바뀌면 안 된다').toBe(recentBefore);
  expect(after.todayKeys, '오늘 기록의 키는 그대로다').toContain('달러');
  expect(after.total).toBe(366 + 33);
  expect(await fingerprint(page), '다른 state가 바뀌면 안 된다').toBe(before);
});

test('Y-8. [F2] 경계값 - 백업 손익 비율 24% 불통과 / 25% 통과, 연속 13일 불통과 / 14일 통과, 오늘 이후 제외', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    const today = todayDateStr();
    const dk = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyFromDate(d); };
    const mk = (cur, pnl) => ({ total: { cur, dailyPnL: pnl }, byOwner: { '신랑': { cur, dailyPnL: pnl } },
      byOwnerCategory: { '신랑': { '주식': { cur, dailyPnL: pnl } } } });
    // 현재: 손익 0이지만 평가금액은 날마다 다르다(cur은 판정에 쓰지 않는다)
    const current = (days) => { const c = {}; c[today] = mk(1000, 7); for (let n = 1; n <= days; n++) c[dk(n)] = mk(1000 - n, 0); return c; };
    const backup = (days, pnlDays) => { const b = {}; for (let n = 1; n <= days; n++) b[dk(n)] = mk(2000 + n, n <= pnlDays ? 100 + n : 0); return b; };
    const count = (cur, bk) => detectPlaceholderCandidates(cur, bk, today).length;

    const t = new Date(); t.setDate(t.getDate() + 1);
    const tomorrow = dateKeyFromDate(t);
    const cL = current(30); cL[today] = mk(1000, 0); cL[tomorrow] = mk(1000, 0);
    const bL = backup(30, 30); bL[today] = mk(1, 1); bL[tomorrow] = mk(1, 1);
    const latest = detectPlaceholderCandidates(cL, bL, today);

    return {
      ratio: PLACEHOLDER_BACKUP_PNL_RATIO, minRun: PLACEHOLDER_MIN_RUN,
      p24: count(current(100), backup(100, 24)), p25: count(current(100), backup(100, 25)),
      run13: count(current(13), backup(13, 13)), run14: count(current(14), backup(14, 14)),
      latestCount: latest.length, latestHit: latest.filter((d) => d >= today).length
    };
  });
  expect(r).toEqual({ ratio: 0.25, minRun: 14, p24: 0, p25: 100, run13: 0, run14: 14, latestCount: 30, latestHit: 0 });
});
