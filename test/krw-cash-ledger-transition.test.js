// [1단계 · KRW 현금 거래기반 관리 전환] 원화 현금을 달러 현금과 같은 거래원장 구조로 관리할 수 있는지,
// 그리고 0단계 안전장치(기존 잔액 보호)가 그대로 살아 있는지 검증한다(PM 지시 2026-10-01 · Case 1~12).
//
// 0단계 테스트(test/krw-cash-ledger-guard.test.js)는 "보호가 작동하는가"를 본다. 이 파일은 그 위에서
// "정상 상태에서는 원장 기반으로 동작하는가"와 "기존 영역이 그대로인가"를 본다.
//
// test/daily-pnl-valuation.test.js와 같은 vm 방식 - production 코드에 export를 덧붙이지 않고
// index.html과 같은 순서로 원본을 올린 뒤 js/23을 얹는다. 네트워크 · 현재 시각 · 실사용 데이터 미사용.
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '23-daily-valuation.js'), 'utf8'), SB, { filename: '23-daily-valuation.js' });
const D = SB.evalInSandbox('KRW_CASH_LEDGER_SYNC');

const A = (o) => Object.assign({
  id: 'zz-a', ticker: '', owner: '신랑', accountType: '일반계좌', category: '현금', categorySource: 'user',
  name: 'ZZ현금', isDomestic: '국내', currency: 'KRW', quantity: 0, buyPrice: 1, currentPrice: 1,
  positionSource: 'ledger', createdAt: 1, updatedAt: 1
}, o);
const T = (o) => Object.assign({
  id: 'zz-t', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금',
  type: 'buy', quantity: 0, price: 1, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1
}, o);

function seed(assets, transactions, snapshots) {
  SB.state.assets = assets.map((a) => Object.assign({}, a));
  SB.state.transactions = transactions.map((t) => Object.assign({}, t));
  SB.state.dailySnapshots = snapshots || {};
}
const classOf = (asset) => {
  const fin = SB.computePositionsAndRealizedPnL(SB.state.transactions).positions;
  const c = SB.dvClassifyAsset(asset, fin);
  return c.kind + (c.key ? ':' + c.key : '') + (c.reason ? ':' + c.reason : '');
};
// 총평가금액 행을 실제 계산 함수로 만든다(스냅샷 · 시세는 인자로만 들어간다).
function valuation(dates, seriesBySymbol) {
  const fin = SB.computePositionsAndRealizedPnL(SB.state.transactions).positions;
  const classified = SB.state.assets.map((asset) => ({ asset, cls: SB.dvClassifyAsset(asset, fin) }));
  const owners = [...new Set(SB.state.assets.map((a) => a.owner))];
  const rows = SB.dvBuildRows({
    dates, owners, classified, transactions: SB.state.transactions,
    snapshots: SB.state.dailySnapshots, seriesBySymbol: seriesBySymbol || {}, K: 3
  });
  return Object.fromEntries(rows.map((r) => [r.date, { total: r.total, owners: r.owners, reasons: r.reasons }]));
}
// 일별 손익 행(스냅샷을 쓰지 않는다 - 인자 자체가 없다).
function dailyPnl(dates) {
  const fin = SB.computePositionsAndRealizedPnL(SB.state.transactions).positions;
  const classified = SB.state.assets.map((asset) => ({ asset, cls: SB.dvClassifyAsset(asset, fin) }));
  const owners = [...new Set(SB.state.assets.map((a) => a.owner))];
  const rows = SB.dvBuildDailyPnlRows({
    dates, owners, classified, transactions: SB.state.transactions,
    seriesBySymbol: {}, K: 3, defaultTradeRate: 1450
  });
  return Object.fromEntries(rows.map((r) => [r.date, r.total]));
}

test('Case 1. KRW 현금 buy 1억 → 원장 포지션 · 자산 수량 · 평가금액이 모두 1억', () => {
  seed([], [T({ id: 't1', quantity: 100000000 })]);          // 신규 자산 경로(원장에서 태어난다)
  SB.syncAssetsFromTransactions();
  const asset = SB.state.assets.find((a) => a.name === 'ZZ현금');
  assert.ok(asset, '원장만 있어도 현금 자산이 만들어진다');
  assert.strictEqual(asset.quantity, 100000000, '자산 수량 = 1억');
  assert.strictEqual(asset.positionSource, 'ledger');
  const pos = SB.findLedgerPositionForAsset(asset, SB.computePositionsAndRealizedPnL(SB.state.transactions).positions);
  assert.strictEqual(pos.quantity, 100000000, '원장 포지션 = 1억');
  assert.strictEqual(classOf(asset), 'ledgerKrwCash', '원장이 관리하는 원화 현금으로 분류된다');
  // 스냅샷이 하나도 없어도 원장으로 계산된다(§16 최소 연결) · 최초 거래일 이전은 0.
  const v = valuation(['2026-08-31', '2026-09-01', '2026-09-30']);
  assert.strictEqual(v['2026-08-31'].total, 0, '최초 거래일 이전 = 0');
  assert.strictEqual(v['2026-09-01'].total, 100000000, '평가금액 = 수량 × 1');
  assert.strictEqual(v['2026-09-30'].total, 100000000);
});

test('Case 2. KRW 현금 buy 1억 → sell 3천만 → 기준일 포지션이 7천만', () => {
  seed([A({ id: 'c1', quantity: 70000000 })], [
    T({ id: 't1', date: '2026-09-01', quantity: 100000000 }),
    T({ id: 't2', date: '2026-09-10', type: 'sell', quantity: 30000000, createdAt: 2 })
  ]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 70000000, '자산도 7천만(원장과 일치)');
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash');
  const v = valuation(['2026-09-01', '2026-09-09', '2026-09-10', '2026-09-30']);
  assert.strictEqual(v['2026-09-01'].total, 100000000, '9/1 = 1억');
  assert.strictEqual(v['2026-09-09'].total, 100000000, '9/9 = 1억(그대로)');
  assert.strictEqual(v['2026-09-10'].total, 70000000, '9/10 = 7천만');
  assert.strictEqual(v['2026-09-30'].total, 70000000);
});

test('Case 3. 기존 잔액 1억 + 거래 없음 → 1억 유지 · 유지형 분류 그대로', () => {
  seed([A({ id: 'c1', quantity: 100000000, positionSource: 'manual' })], []);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000);
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금', '원장이 없으면 예전처럼 유지형');
  assert.strictEqual(SB.diagnoseKrwCashLedgerState().items[0].status, D.NO_LEDGER_POSITION);
});

test('Case 4. 기존 잔액 1억 + 원장 3천만 → 1억 유지 · 자동 덮어쓰기 없음 · 사용자 확인 상태', () => {
  seed([A({ id: 'c1', quantity: 100000000 })], [T({ id: 't1', quantity: 30000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000, '원장 3천만으로 덮어쓰지 않는다');
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금', '불일치면 유지형으로 되돌린다(기존 잔액 보호)');
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(dg.items[0].status, D.BALANCE_MISMATCH);
  assert.strictEqual(dg.items[0].overwriteAllowed, false);
  assert.strictEqual(dg.needsUserReview, true, '사용자 확인 필요 상태로 남는다');
});

test('Case 5. 중복 identity → 자동 매칭 · 자동 덮어쓰기 금지 · 거래 저장도 막는다', () => {
  seed([A({ id: 'c1', quantity: 10000000 }), A({ id: 'c2', quantity: 20000000 })], [T({ id: 't1', quantity: 5000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 10000000, '첫 자산을 임의로 고르지 않는다');
  assert.strictEqual(SB.state.assets[1].quantity, 20000000);
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(dg.items[0].status, D.DUPLICATE_IDENTITY);
  assert.strictEqual(dg.duplicateIdentities.length, 1);
  // 거래 저장 · 엑셀 업로드가 함께 쓰는 판정도 "저장 불가"를 돌려준다.
  assert.strictEqual(SB.cashTransactionIdentityAmbiguous(
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금', currency: 'KRW' }), true);
});

test('Case 6. Owner가 다른 동명 KRW 현금 → 서로 간섭하지 않는다', () => {
  seed([A({ id: 'c1', owner: '신랑', quantity: 100000000 }), A({ id: 'c2', owner: '와이프', quantity: 20000000 })],
    [T({ id: 't1', owner: '신랑', quantity: 100000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000);
  assert.strictEqual(SB.state.assets[1].quantity, 20000000, '다른 소유자는 그대로');
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash', '거래가 있는 쪽만 원장 기반');
  assert.strictEqual(classOf(SB.state.assets[1]), 'maintained:현금');
  assert.strictEqual(SB.cashTransactionIdentityAmbiguous(
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금', currency: 'KRW' }), false, '중복이 아니다');
});

test('Case 7. AccountType이 다른 동명 KRW 현금 → 서로 간섭하지 않는다', () => {
  seed([A({ id: 'c1', accountType: '일반계좌', quantity: 30000000 }), A({ id: 'c2', accountType: 'ISA', quantity: 7000000 })],
    [T({ id: 't1', accountType: 'ISA', quantity: 7000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 30000000);
  assert.strictEqual(SB.state.assets[1].quantity, 7000000);
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금', '거래 없는 일반계좌는 유지형');
  assert.strictEqual(classOf(SB.state.assets[1]), 'ledgerKrwCash', '거래 있는 ISA는 원장 기반');
});

test('Case 8. USD 현금 regression — 기존 거래기반 동작과 분류가 그대로다', () => {
  const usd = A({ id: 'u1', name: 'ZZ달러', currency: 'USD', isDomestic: '해외', quantity: 1000 });
  seed([usd], [T({ id: 'tu', name: 'ZZ달러', currency: 'USD', quantity: 1000, price: 1, appliedRate: 1300 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 1000, '원장이 그대로 반영된다');
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerUsdCash', '달러 분류 무변경');
  assert.strictEqual(SB.isKrwCashAsset(SB.state.assets[0]), false, '원화 안전장치 대상이 아니다');
  // 수량 불일치면 달러는 예전처럼 계산 불가(원화와 달리 유지형으로 되돌리지 않는다).
  seed([A({ id: 'u1', name: 'ZZ달러', currency: 'USD', isDomestic: '해외', quantity: 999 })],
    [T({ id: 'tu', name: 'ZZ달러', currency: 'USD', quantity: 1000, price: 1, appliedRate: 1300 })]);
  assert.strictEqual(classOf(SB.state.assets[0]), 'unavailable:ledgerMismatch', '달러 불일치 판정 무변경');
});

test('Case 9. 주식 regression — 분류 · 수량 반영 · 평가가 그대로다', () => {
  const stock = A({ id: 's1', name: 'ZZ주식', category: '주식', ticker: '900001.KS', quantity: 100, buyPrice: 10000, currentPrice: 10000 });
  seed([stock], [T({ id: 'ts', name: 'ZZ주식', ticker: '900001.KS', quantity: 100, price: 10000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100);
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerMarket', '주식 분류 무변경');
  assert.strictEqual(SB.isKrwCashAsset(SB.state.assets[0]), false);
});

test('Case 10. manual 자산 regression — 원장이 덮어쓰지 않는다(BL-12)', () => {
  seed([A({ id: 's1', name: 'ZZ주식', category: '주식', ticker: '900001.KS', quantity: 10, buyPrice: 10000, positionSource: 'manual' })],
    [T({ id: 'ts', name: 'ZZ주식', ticker: '900001.KS', quantity: 99, price: 20000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 10, 'manual 주식은 예전 그대로 보호된다');
  // manual 원화 현금도 유지형 그대로다.
  seed([A({ id: 'c1', quantity: 100000000, positionSource: 'manual' })], [T({ id: 't1', quantity: 30000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000);
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금');
});

test('Case 11. Excel import — KRW 현금 buy/sell 행이 기존 schema로 통과하고, 중복 identity 행만 걸러진다', () => {
  // 엑셀 업로드 필터가 쓰는 판정 함수를 그대로 호출한다(수동 저장과 같은 함수다).
  seed([A({ id: 'c1', quantity: 100000000 })], []);
  const rows = [
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금', type: 'buy', quantity: 100000000, price: 1, currency: 'KRW' },
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금', type: 'sell', quantity: 30000000, price: 1, currency: 'KRW' }
  ];
  assert.deepStrictEqual(rows.map((r) => SB.cashTransactionIdentityAmbiguous(r)), [false, false], '현금 행이 더 이상 걸러지지 않는다');
  // 같은 identity의 현금 자산이 둘이면 그 행만 걸러진다.
  seed([A({ id: 'c1', quantity: 10000000 }), A({ id: 'c2', quantity: 20000000 })], []);
  assert.deepStrictEqual(rows.map((r) => SB.cashTransactionIdentityAmbiguous(r)), [true, true]);
  // 주식 · 달러 행은 영향 없다.
  assert.strictEqual(SB.cashTransactionIdentityAmbiguous(
    { owner: '신랑', accountType: '일반계좌', ticker: '900001.KS', name: 'ZZ주식', type: 'buy', quantity: 1, price: 1, currency: 'KRW' }), false);
  assert.strictEqual(SB.cashTransactionIdentityAmbiguous(
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ달러', type: 'buy', quantity: 1, price: 1, currency: 'USD' }), false);
});

test('Case 12. 거래 검색 — KRW 현금 자산이 거래 추가 검색 결과에 나온다', () => {
  seed([
    A({ id: 'c1', name: 'ZZ현금', quantity: 100000000 }),
    A({ id: 'u1', name: 'ZZ달러', currency: 'USD', isDomestic: '해외', quantity: 1000 })
  ], []);
  // searchLocalHoldings의 배열은 vm 컨텍스트에서 만들어져 프로토타입이 호스트와 다르다 - 값만 비교한다.
  const names = [...SB.searchLocalHoldings('ZZ').map((r) => r.name)].sort();
  assert.deepStrictEqual(names, ['ZZ달러', 'ZZ현금'], '원화 현금도 달러 현금과 함께 검색된다');
  assert.ok(SB.searchLocalHoldings('ZZ현금').some((r) => r.name === 'ZZ현금'));
});

test('일별 손익 regression — KRW 현금은 입출금이 있어도 손익이 0이다(§15)', () => {
  seed([A({ id: 'c1', quantity: 70000000 })], [
    T({ id: 't1', date: '2026-09-01', quantity: 100000000 }),
    T({ id: 't2', date: '2026-09-10', type: 'sell', quantity: 30000000, createdAt: 2 })
  ]);
  SB.syncAssetsFromTransactions();
  const p = dailyPnl(['2026-09-01', '2026-09-05', '2026-09-10', '2026-09-30']);
  assert.deepStrictEqual(p, { '2026-09-01': 0, '2026-09-05': 0, '2026-09-10': 0, '2026-09-30': 0 },
    '잔액 변화는 평가금액 변화일 뿐 가격손익이 아니다');
});

test('이중 계상 방지 — 원장 현금이 있으면 스냅샷의 현금 합계를 다시 더하지 않는다', () => {
  const snaps = { '2026-09-01': { total: { cur: 1, dailyPnL: 0 }, byOwner: {},
    byOwnerCategory: { '신랑': { '현금': { cur: 100000000, dailyPnL: 0 }, '부동산': { cur: 300000000, dailyPnL: 0 } } } } };
  seed([
    A({ id: 'c1', quantity: 100000000 }),
    A({ id: 'r1', name: 'ZZ아파트', category: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, positionSource: 'manual' })
  ], [T({ id: 't1', quantity: 100000000 })], snaps);
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash');
  const v = valuation(['2026-09-01']);
  assert.strictEqual(v['2026-09-01'].total, 400000000,
    '현금 1억(원장) + 부동산 3억(스냅샷) = 4억 - 현금을 두 번 더하지 않는다');
});

test('혼재 가드 — 원장형과 유지형 원화 현금이 함께 있으면 그 소유자를 계산하지 않는다', () => {
  const snaps = { '2026-09-01': { total: { cur: 1, dailyPnL: 0 }, byOwner: {},
    byOwnerCategory: { '신랑': { '현금': { cur: 150000000, dailyPnL: 0 } } } } };
  seed([
    A({ id: 'c1', name: 'ZZ현금', quantity: 100000000 }),                                  // 원장형
    A({ id: 'c2', name: 'ZZ다른현금', quantity: 50000000, positionSource: 'manual' })      // 유지형
  ], [T({ id: 't1', name: 'ZZ현금', quantity: 100000000 })], snaps);
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash');
  assert.strictEqual(classOf(SB.state.assets[1]), 'maintained:현금');
  const v = valuation(['2026-09-01']);
  assert.strictEqual(v['2026-09-01'].total, null, '어느 쪽이 스냅샷에 들어갔는지 가를 수 없어 계산하지 않는다');
  assert.ok(v['2026-09-01'].reasons.includes('krwCashMixed'));
});

/* ===========================================================================
 * [1단계 보완 · PM 지시 2026-10-01] 기존 KRW 현금 잔액이 정확히 0인 자산의 최초 거래 전환.
 * 0원짜리 자산은 보호할 잔액이 없으므로 첫 거래가 그 자산의 잔액이 된다. 잔액이 0보다 크면
 * 예전처럼 BALANCE_MISMATCH로 보호한다(아래 Test 4 · 5가 그것을 계속 고정한다).
 * ======================================================================== */

test('보완 Test 1. 기존 0원 + 최초 buy 1억 → 원장 채택(ledger 전환)', () => {
  seed([A({ id: 'c1', quantity: 0, positionSource: 'ledger' })], [T({ id: 't1', quantity: 100000000 })]);
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(dg.items[0].status, D.ZERO_BALANCE_ADOPT);
  assert.strictEqual(dg.items[0].overwriteAllowed, true, '원장을 써도 되는 상태다');
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000, 'asset = 1억');
  assert.strictEqual(SB.state.assets[0].buyPrice, 1);
  assert.strictEqual(SB.state.assets[0].positionSource, 'ledger');
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash');
  const pos = SB.findLedgerPositionForAsset(SB.state.assets[0], SB.computePositionsAndRealizedPnL(SB.state.transactions).positions);
  assert.strictEqual(pos.quantity, 100000000, 'ledger = 1억');
  // [§6 DV 검증] 스냅샷이 없어도 원장으로 계산된다 · 최초 거래일 이전은 0.
  const v = valuation(['2026-08-31', '2026-09-01', '2026-09-30']);
  assert.strictEqual(v['2026-08-31'].total, 0);
  assert.strictEqual(v['2026-09-01'].total, 100000000);
  assert.strictEqual(v['2026-09-30'].total, 100000000);
});

test('보완 Test 1-b. legacy(표식 없음) 0원 자산도 같은 규칙으로 전환된다 · manual 0원은 계속 보호된다', () => {
  seed([A({ id: 'c1', quantity: 0, positionSource: undefined })], [T({ id: 't1', quantity: 100000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000, 'legacy도 원장을 채택한다');
  assert.strictEqual(classOf(SB.state.assets[0]), 'ledgerKrwCash');
  // manual은 BL-12 보호가 먼저 걸려 그대로 0원이다(이번 보완이 manual 보호를 건드리지 않는다).
  seed([A({ id: 'c1', quantity: 0, positionSource: 'manual' })], [T({ id: 't1', quantity: 100000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 0, 'manual 0원은 예전 그대로 보호된다');
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금');
});

test('보완 Test 2. 기존 0원 + 원장도 0 → 0 그대로(채택 대상이 아니다)', () => {
  seed([A({ id: 'c1', quantity: 0 })], [
    T({ id: 't1', date: '2026-09-01', quantity: 50000000 }),
    T({ id: 't2', date: '2026-09-10', type: 'sell', quantity: 50000000, createdAt: 2 })
  ]);
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.notStrictEqual(dg.items[0].status, D.ZERO_BALANCE_ADOPT, '원장 수량이 0이면 채택하지 않는다');
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 0, 'asset = 0 그대로');
});

test('보완 Test 3. 기존 0원 + 중복 identity → 중복 판정이 먼저다(자동 매칭 금지)', () => {
  seed([A({ id: 'c1', quantity: 0 }), A({ id: 'c2', quantity: 0 })], [T({ id: 't1', quantity: 100000000 })]);
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(dg.items[0].status, D.DUPLICATE_IDENTITY);
  assert.strictEqual(dg.items[1].status, D.DUPLICATE_IDENTITY);
  assert.strictEqual(dg.items[0].overwriteAllowed, false);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 0, '둘 다 건드리지 않는다');
  assert.strictEqual(SB.state.assets[1].quantity, 0);
  assert.strictEqual(SB.cashTransactionIdentityAmbiguous(
    { owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금', currency: 'KRW' }), true, '거래 저장도 막는다');
});

test('보완 Test 4. 기존 1억 + 원장 3천만 → 1억 유지 · BALANCE_MISMATCH(보호 그대로)', () => {
  seed([A({ id: 'c1', quantity: 100000000 })], [T({ id: 't1', quantity: 30000000 })]);
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(dg.items[0].status, D.BALANCE_MISMATCH);
  assert.strictEqual(dg.items[0].overwriteAllowed, false);
  assert.strictEqual(dg.needsUserReview, true);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000, '잔액이 0보다 크면 예전 그대로 보호된다');
});

test('보완 Test 4-b. 잔액이 0에 가깝지만 0이 아니면 채택하지 않는다(허용오차를 쓰지 않는다)', () => {
  seed([A({ id: 'c1', quantity: 0.0001 })], [T({ id: 't1', quantity: 100000000 })]);
  assert.strictEqual(SB.diagnoseKrwCashLedgerState().items[0].status, D.BALANCE_MISMATCH);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 0.0001, '"거의 0"은 0이 아니다');
});

test('보완 Test 5. 기존 1억 + 거래 없음 → 1억 유지(보호 그대로)', () => {
  seed([A({ id: 'c1', quantity: 100000000 })], []);
  assert.strictEqual(SB.diagnoseKrwCashLedgerState().items[0].status, D.NO_LEDGER_POSITION);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 100000000);
});

test('보완 Test 6. 기존 0원 자산이 Owner · AccountType별로 서로 간섭하지 않는다', () => {
  seed([
    A({ id: 'c1', owner: '신랑', quantity: 0 }),
    A({ id: 'c2', owner: '와이프', quantity: 0 }),
    A({ id: 'c3', owner: '신랑', accountType: 'ISA', quantity: 0 })
  ], [T({ id: 't1', owner: '신랑', accountType: 'ISA', quantity: 7000000 })]);
  SB.syncAssetsFromTransactions();
  assert.strictEqual(SB.state.assets[0].quantity, 0, '신랑 일반계좌는 그대로');
  assert.strictEqual(SB.state.assets[1].quantity, 0, '와이프는 그대로');
  assert.strictEqual(SB.state.assets[2].quantity, 7000000, '거래가 있는 ISA만 채택된다');
  assert.strictEqual(classOf(SB.state.assets[2]), 'ledgerKrwCash');
  assert.strictEqual(classOf(SB.state.assets[0]), 'maintained:현금');
  assert.strictEqual(SB.diagnoseKrwCashLedgerState().duplicateIdentities.length, 0);
});

test('0단계 안전장치 보존 — 판정 5상태와 진단의 읽기 전용성이 그대로다', () => {
  seed([A({ id: 'c1', quantity: 100000000 })], [T({ id: 't1', quantity: 30000000 })]);
  const frozen = JSON.stringify({ a: SB.state.assets, t: SB.state.transactions });
  const dg = SB.diagnoseKrwCashLedgerState();
  assert.strictEqual(JSON.stringify({ a: SB.state.assets, t: SB.state.transactions }), frozen, '진단은 읽기만 한다');
  // [1단계 보완 2026-10-01] 기존 잔액 0 + 정상 최초 거래를 가리키는 ZERO_BALANCE_ADOPT가 추가됐다.
  assert.deepStrictEqual(Object.keys(D).sort(),
    ['BALANCE_MISMATCH', 'DUPLICATE_IDENTITY', 'LEDGER_MATCH', 'NOT_KRW_CASH', 'NO_LEDGER_POSITION', 'ZERO_BALANCE_ADOPT']);
  assert.strictEqual(dg.items[0].status, D.BALANCE_MISMATCH);
});
