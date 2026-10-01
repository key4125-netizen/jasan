// [2단계] 역사적 총평가금액 + 채권/부동산 취득원가 fallback (PM 지시 2026-10-01 · §15 검증 1~20).
//
// 확정 정책
//   K-1  소유자에게 스냅샷에서 읽을 유지형 자산이 없으면 beforeFirstRecord(null) 조각을 넣지 않는다.
//   우선순위  ① 기준일에 유효한 dailySnapshot 기록값 → ② 기준일 pos.totalCost →
//             ③ 채권이고 원장 없으면 resolveBondHolding MANUAL purchaseAmount → ④ null
//   취득원가는 시장가격이 아니다 → state 'costBasis'
//   asset.quantity × asset.buyPrice 는 쓰지 않는다 · 계산할 수 없으면 null · 첫 거래일 이전은 0
//
// test/daily-pnl-valuation.test.js와 같은 vm 방식 - production 코드에 export를 덧붙이지 않는다.
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '23-daily-valuation.js'), 'utf8'), SB, { filename: '23-daily-valuation.js' });

const ts = (iso) => Date.parse(iso) / 1000;
const A = (o) => Object.assign({
  id: 'zz-a', ticker: '', owner: '신랑', accountType: '일반계좌', categorySource: 'user',
  isDomestic: '국내', currency: 'KRW', quantity: 0, buyPrice: 1, currentPrice: 1,
  positionSource: 'ledger', createdAt: 1, updatedAt: 1
}, o);
const T = (o) => Object.assign({
  id: 'zz-t', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ',
  type: 'buy', quantity: 0, price: 1, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1
}, o);
// 스냅샷 한 날짜 - byOwnerCategory[owner][category].cur 만 쓴다(스키마 무변경).
const snap = (byOwnerCat) => ({
  total: { cur: 1, dailyPnL: 0 }, byOwner: {},
  byOwnerCategory: Object.fromEntries(Object.entries(byOwnerCat).map(([o, cats]) =>
    [o, Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { cur: v, dailyPnL: 0 }]))]))
});
// 합성 일봉(국내) - 주식 historical price 용.
function krSeries(symbol, closesByDate) {
  const dates = Object.keys(closesByDate).sort();
  return SB.dvNormalizeChart({
    meta: {
      exchangeTimezoneName: 'Asia/Seoul', firstTradeDate: ts('2020-01-02T00:00:00Z'),
      currentTradingPeriod: { regular: { start: ts('2026-09-30T00:00:00Z'), end: ts('2026-09-30T06:00:00Z') } },
      regularMarketTime: ts('2026-09-30T06:30:10Z')
    },
    timestamp: dates.map((d) => ts(d + 'T00:00:00Z')),
    indicators: { quote: [{ close: dates.map((d) => closesByDate[d]) }] }
  }, { symbol, marketKey: 'KR', fetchedAtMs: Date.parse('2026-09-30T08:00:00Z'), requestedStartDate: '2026-08-01' });
}
const flat = (val, from, to) => {
  const out = {};
  for (let d = from; d <= to; d++) out['2026-09-' + String(d).padStart(2, '0')] = val;
  return out;
};

function build(assets, transactions, snapshots, dates, seriesBySymbol) {
  SB.state.assets = assets.map((a) => Object.assign({}, a));
  SB.state.transactions = transactions.map((t) => Object.assign({}, t));
  SB.state.dailySnapshots = snapshots || {};
  const fin = SB.computePositionsAndRealizedPnL(SB.state.transactions).positions;
  const classified = SB.state.assets.map((asset) => ({ asset, cls: SB.dvClassifyAsset(asset, fin) }));
  const owners = [...new Set(SB.state.assets.map((a) => a.owner))];
  const rows = SB.dvBuildRows({
    dates, owners, classified, transactions: SB.state.transactions,
    snapshots: SB.state.dailySnapshots, seriesBySymbol: seriesBySymbol || {}, K: 3
  });
  const out = {};
  rows.forEach((r) => { out[r.date] = { total: r.total, owners: r.owners, flags: [...r.flags], reasons: [...r.reasons] }; });
  return out;
}
const STOCK = { id: 's1', name: 'ZZ주식', category: '주식', ticker: '900001.KS', quantity: 100, buyPrice: 10000, currentPrice: 10000 };
const stockSeries = () => ({ '900001.KS': krSeries('900001.KS', flat(10000, 1, 30)), '^KS11': krSeries('^KS11', flat(3000, 1, 30)) });

/* ───────────── K-1 (검증 1~4) ───────────── */

test('1. [K-1] Snapshot 없음 + 주식 + historical price → 평가된다(스냅샷 조각을 강제로 넣지 않는다)', () => {
  const v = build([A(STOCK)], [T({ id: 't1', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000 })],
    {}, ['2026-08-31', '2026-09-01', '2026-09-30'], stockSeries());
  assert.strictEqual(v['2026-08-31'].total, 0, '첫 거래일 이전 = 0');
  assert.strictEqual(v['2026-09-01'].total, 1000000, '100주 × 10,000원');
  assert.strictEqual(v['2026-09-30'].total, 1000000);
  assert.ok(!v['2026-09-01'].reasons.includes('beforeFirstRecord'), '스냅샷 부재가 사유로 남지 않는다');
});

test('2. [K-1] Snapshot 없음 + 주식 + historical price 없음 → 기존 null semantics 유지', () => {
  const v = build([A(STOCK)], [T({ id: 't1', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000 })],
    {}, ['2026-09-30'], {});   // 시세 주입 없음
  assert.strictEqual(v['2026-09-30'].total, null, '가격을 모르면 null 그대로');
  assert.ok(v['2026-09-30'].reasons.length > 0);
});

test('3. [K-1] 유지형 자산이 실제로 있으면 스냅샷 필요성이 유지된다', () => {
  const re = A({ id: 'r1', name: 'ZZ아파트', category: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, positionSource: 'manual' });
  // 부동산은 거래도 없고 스냅샷도 없다 → 취득원가 원천이 없으므로 null(아래 15번과 같은 상태)
  const v = build([A(STOCK), re], [T({ id: 't1', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000 })],
    {}, ['2026-09-30'], stockSeries());
  assert.strictEqual(v['2026-09-30'].total, null, '유지형 자산을 평가할 수 없으면 소유자 합계는 null이다');
});

test('4. [K-1] 유지형 자산 + 스냅샷 있음 → 스냅샷 값이 그대로 합산된다', () => {
  const re = A({ id: 'r1', name: 'ZZ아파트', category: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, positionSource: 'manual' });
  const snaps = { '2026-09-01': snap({ '신랑': { '부동산': 350000000 } }) };
  const v = build([A(STOCK), re], [T({ id: 't1', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000 })],
    snaps, ['2026-09-30'], stockSeries());
  assert.strictEqual(v['2026-09-30'].total, 351000000, '주식 100만 + 부동산 스냅샷 3.5억');
  assert.ok(v['2026-09-30'].flags.includes('maintained'));
  assert.ok(!v['2026-09-30'].flags.includes('costBasis'), '스냅샷이 있으면 취득원가를 쓰지 않는다');
});

/* ───────────── 채권 (검증 5~12) ───────────── */

const BOND = { id: 'b1', name: 'ZZ국고채', category: '채권', quantity: 40000, buyPrice: 10000, currentPrice: 10000 };
const bondTx = (o) => T(Object.assign({ name: 'ZZ국고채', quantity: 40000, price: 10000 }, o));

test('5. 채권 — Snapshot 없음 + 거래 있음 → pos.totalCost', () => {
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], {}, ['2026-08-31', '2026-09-01', '2026-09-30']);
  assert.strictEqual(v['2026-08-31'].total, 0, '첫 거래일 이전 = 0');
  assert.strictEqual(v['2026-09-01'].total, 400000000, '40,000 × 10,000 = 4억(totalCost)');
  assert.strictEqual(v['2026-09-30'].total, 400000000);
});

test('6. 채권 — Snapshot 존재 → Snapshot 우선(취득원가로 덮어쓰지 않는다)', () => {
  const snaps = { '2026-09-20': snap({ '신랑': { '채권': 405000000 } }) };
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], snaps, ['2026-09-10', '2026-09-20', '2026-09-30']);
  assert.strictEqual(v['2026-09-10'].total, 400000000, '첫 스냅샷 이전은 취득원가');
  assert.ok(v['2026-09-10'].flags.includes('costBasis'));
  assert.strictEqual(v['2026-09-20'].total, 405000000, '스냅샷이 있는 날은 기록값 405M');
  assert.strictEqual(v['2026-09-30'].total, 405000000, '그 이후는 마지막 기록값 유지');
  assert.ok(!v['2026-09-20'].flags.includes('costBasis'), '스냅샷 날에는 취득원가 표시가 붙지 않는다');
});

test('7. 채권 — Snapshot 없음 + 거래 없음 + manual bondPosition.purchaseAmount → purchaseAmount', () => {
  SB.state.bondPositions = [{
    id: 'bp1', assetId: 'b1', identity: { isin: 'KR103502G990', currency: 'KRW' },
    holding: { owner: '신랑', account: '일반계좌', purchaseDate: '2026-09-05', faceAmount: 400000000, purchaseAmount: 398000000 }
  }];
  try {
    const v = build([A(Object.assign({}, BOND, { positionSource: 'manual' }))], [], {}, ['2026-09-04', '2026-09-05', '2026-09-30']);
    assert.strictEqual(v['2026-09-04'].total, 0, '매입일 이전은 보유하지 않았다 = 0');
    assert.strictEqual(v['2026-09-05'].total, 398000000, '사용자가 확정한 매입금액');
    assert.strictEqual(v['2026-09-30'].total, 398000000);
    assert.ok(v['2026-09-05'].flags.includes('costBasis'));
  } finally { SB.state.bondPositions = []; }
});

test('8. 채권 — Snapshot 없음 + 거래 없음 + 안전한 원가 원천 없음 → null', () => {
  SB.state.bondPositions = [];
  const v = build([A(Object.assign({}, BOND, { positionSource: 'manual' }))], [], {}, ['2026-09-30']);
  assert.strictEqual(v['2026-09-30'].total, null, '추정하지 않고 null');
  assert.ok(v['2026-09-30'].reasons.includes('costBasisUnavailable'));
});

test('9. 채권 — 여러 번 매입 → 기준일 pos.totalCost(수수료 포함 · 누적)', () => {
  const v = build([A(Object.assign({}, BOND, { quantity: 60000 }))], [
    bondTx({ id: 'tb1', date: '2026-09-01', quantity: 40000, price: 10000 }),
    bondTx({ id: 'tb2', date: '2026-09-10', quantity: 20000, price: 10100, fee: 5000, createdAt: 2 })
  ], {}, ['2026-09-05', '2026-09-10', '2026-09-30']);
  assert.strictEqual(v['2026-09-05'].total, 400000000, '2차 매입 전에는 1차분만');
  assert.strictEqual(v['2026-09-10'].total, 400000000 + 20000 * 10100 + 5000, '누적 취득원가(수수료 포함)');
  assert.strictEqual(v['2026-09-30'].total, 400000000 + 20000 * 10100 + 5000);
});

test('10. 채권 — 일부 매도 후 → 기준일 잔존 Position의 totalCost', () => {
  const v = build([A(Object.assign({}, BOND, { quantity: 10000 }))], [
    bondTx({ id: 'tb1', date: '2026-09-01', quantity: 40000, price: 10000 }),
    bondTx({ id: 'tb2', date: '2026-09-15', type: 'sell', quantity: 30000, price: 10200, createdAt: 2 })
  ], {}, ['2026-09-10', '2026-09-15', '2026-09-30']);
  assert.strictEqual(v['2026-09-10'].total, 400000000, '매도 전 4억');
  assert.strictEqual(v['2026-09-15'].total, 100000000, '잔존 10,000 × 평단 10,000 = 1억');
  assert.strictEqual(v['2026-09-30'].total, 100000000);
});

test('11. 채권 — 취득원가 평가에는 costBasis 상태가 붙는다', () => {
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], {}, ['2026-09-30']);
  assert.ok(v['2026-09-30'].flags.includes('costBasis'));
});

test('12. 채권 — 취득원가가 시장가격 계열로 표현되지 않는다', () => {
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], {}, ['2026-09-30']);
  const f = v['2026-09-30'].flags;
  assert.ok(!f.includes('provisional') && !f.includes('estimated') && !f.includes('closedCarry'),
    '시세 계열 상태(잠정 · 추정 · 직전종가)가 붙지 않는다');
  // 화면 문구도 "취득원가 기준"이고 시장가격 · 현재가 · 시세라는 말을 쓰지 않는다(js/11 DV_FLAG_WORDS).
  const words = fs.readFileSync(path.join(__dirname, '..', 'js', '11-refresh-history.js'), 'utf8');
  const line = words.split(/\r?\n/).find((l) => l.includes('const DV_FLAG_WORDS'));
  assert.ok(/costBasis: '취득원가 기준'/.test(line), 'costBasis 문구 = 취득원가 기준');
  assert.ok(!/costBasis: '[^']*(시장가격|현재가|시세)/.test(line));
});

/* ───────────── 부동산 (검증 13~16) ───────────── */

const RE = { id: 'r1', name: 'ZZ아파트', category: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 350000000 };

test('13. 부동산 — Snapshot 없음 + 거래 있음 → pos.totalCost', () => {
  const v = build([A(RE)], [T({ id: 'tr', date: '2026-09-01', name: 'ZZ아파트', quantity: 1, price: 300000000 })],
    {}, ['2026-08-31', '2026-09-01', '2026-09-30']);
  assert.strictEqual(v['2026-08-31'].total, 0);
  assert.strictEqual(v['2026-09-01'].total, 300000000, '취득원가 3억(저장된 현재가 3.5억을 쓰지 않는다)');
  assert.ok(v['2026-09-01'].flags.includes('costBasis'));
});

test('14. 부동산 — Snapshot 존재 → Snapshot 우선', () => {
  const snaps = { '2026-09-20': snap({ '신랑': { '부동산': 350000000 } }) };
  const v = build([A(RE)], [T({ id: 'tr', date: '2026-09-01', name: 'ZZ아파트', quantity: 1, price: 300000000 })],
    snaps, ['2026-09-10', '2026-09-20']);
  assert.strictEqual(v['2026-09-10'].total, 300000000, '기록 이전은 취득원가');
  assert.strictEqual(v['2026-09-20'].total, 350000000, '기록이 있으면 기록값');
  assert.ok(!v['2026-09-20'].flags.includes('costBasis'));
});

test('15. 부동산 — 거래 없음 + 안전한 원가 원천 없음 → null', () => {
  const v = build([A(Object.assign({}, RE, { positionSource: 'manual' }))], [], {}, ['2026-09-30']);
  assert.strictEqual(v['2026-09-30'].total, null);
  assert.ok(v['2026-09-30'].reasons.includes('costBasisUnavailable'));
});

test('16. 부동산 — buyPrice 미입력(0)을 취득원가로 오인하지 않는다', () => {
  // 거래가 있지만 단가 0 → totalCost 0 → 취득원가로 쓸 수 없다(null). 0원이라고 단정하지 않는다.
  const v = build([A(Object.assign({}, RE, { buyPrice: 0 }))],
    [T({ id: 'tr', date: '2026-09-01', name: 'ZZ아파트', quantity: 1, price: 0 })], {}, ['2026-09-30']);
  assert.strictEqual(v['2026-09-30'].total, null, 'quantity × buyPrice = 0 을 취득원가로 쓰지 않는다');
  assert.ok(v['2026-09-30'].reasons.includes('costBasisUnavailable'));
  // asset.buyPrice 자체를 쓰지 않는다는 것도 코드로 확인한다.
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '23-daily-valuation.js'), 'utf8');
  const fn = src.slice(src.indexOf('function dvCostBasisAt'), src.indexOf('function dvFindLedgerEntry'));
  assert.ok(!/asset\.buyPrice/.test(fn), 'dvCostBasisAt은 asset.buyPrice를 참조하지 않는다');
  assert.ok(!/asset\.quantity/.test(fn), 'dvCostBasisAt은 asset.quantity를 참조하지 않는다');
});

/* ───────────── 공통 (검증 17~20) ───────────── */

test('17. 첫 거래일 이전 → 0 (v279 정책 유지)', () => {
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], {}, ['2026-07-01', '2026-08-31', '2026-09-01']);
  assert.strictEqual(v['2026-07-01'].total, 0);
  assert.strictEqual(v['2026-08-31'].total, 0);
  assert.strictEqual(v['2026-09-01'].total, 400000000);
});

test('18. 첫 Snapshot 이전 + 거래원장 평가 가능 → 정상 평가(채권 + 주식 혼합)', () => {
  const snaps = { '2026-09-20': snap({ '신랑': { '채권': 405000000 } }) };
  const v = build([A(BOND), A(STOCK)], [
    bondTx({ id: 'tb', date: '2026-09-01' }),
    T({ id: 'ts', date: '2026-09-01', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000, createdAt: 2 })
  ], snaps, ['2026-09-10', '2026-09-20'], stockSeries());
  assert.strictEqual(v['2026-09-10'].total, 400000000 + 1000000, '채권 취득원가 + 주식 시세');
  assert.ok(v['2026-09-10'].flags.includes('costBasis'));
  assert.strictEqual(v['2026-09-20'].total, 405000000 + 1000000, '스냅샷이 생긴 날부터 기록값 + 주식 시세');
});

test('19. 실제 null → null propagation 유지(U-B)', () => {
  // 무티커 manual 암호화폐는 예전처럼 unavailable → 소유자 · 합계 null.
  const coin = A({ id: 'x1', name: 'ZZ코인', category: '암호화폐', quantity: 5, buyPrice: 1000000, currentPrice: 1000000, positionSource: 'manual' });
  const v = build([A(BOND), coin], [bondTx({ id: 'tb', date: '2026-09-01' })], {}, ['2026-09-30']);
  assert.strictEqual(v['2026-09-30'].total, null);
  assert.ok(v['2026-09-30'].reasons.includes('tickerlessMarketAsset'));
});

test('20. 0 → 실제 0 유지(그날 보유하지 않은 자산 · 전량 매도)', () => {
  const v = build([A(Object.assign({}, BOND, { quantity: 0 }))], [
    bondTx({ id: 'tb1', date: '2026-09-01', quantity: 40000, price: 10000 }),
    bondTx({ id: 'tb2', date: '2026-09-10', type: 'sell', quantity: 40000, price: 10000, createdAt: 2 })
  ], {}, ['2026-09-10', '2026-09-30']);
  assert.strictEqual(v['2026-09-10'].total, 0, '전량 매도한 날은 실제 0(null이 아니다)');
  assert.strictEqual(v['2026-09-30'].total, 0);
});

test('추가. 현금은 취득원가 fallback 대상이 아니다(0·1단계 보호를 되돌리지 않는다)', () => {
  // 유지형 원화 현금 + 스냅샷 없음 → 예전 그대로 계산하지 않는다(원장 값을 꺼내 쓰지 않는다).
  const cash = A({ id: 'c1', name: 'ZZ현금', category: '현금', quantity: 100000000, positionSource: 'manual' });
  const v = build([cash], [T({ id: 't1', name: 'ZZ현금', quantity: 30000000, price: 1 })], {}, ['2026-09-30']);
  assert.strictEqual(v['2026-09-30'].total, null, '보호된 잔액을 원장 값으로 드러내지 않는다');
  assert.ok(v['2026-09-30'].reasons.includes('beforeFirstRecord'));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '23-daily-valuation.js'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('const DV_COST_BASIS_KEYS'));
  assert.ok(/\['채권', '부동산'\]/.test(line), '취득원가 대상은 채권 · 부동산뿐이다');
});

test('추가. 스냅샷이 깨진 경우(형식 불량)는 취득원가로 넘어가지 않고 예전처럼 null이다', () => {
  const broken = { '2026-09-01': { total: { cur: 1 }, byOwner: {} } };   // byOwnerCategory 없음
  const v = build([A(BOND)], [bondTx({ id: 'tb', date: '2026-09-01' })], broken, ['2026-09-10']);
  assert.strictEqual(v['2026-09-10'].total, null, '"기록이 없다"와 "기록이 깨졌다"는 다른 상태다');
  assert.ok(v['2026-09-10'].reasons.includes('snapshotWithoutCategory'));
});
