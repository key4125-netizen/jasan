// [0단계 · KRW 현금 거래기반 전환 선행 안전장치] 기존 사용자의 원화 현금 잔액이 거래원장 전환
// 과정에서 소실 · 강제 덮어쓰기 · 잘못된 자산 매칭으로 훼손되지 않는지 검증한다(PM 지시 2026-10-01).
//
// 이 단계에서는 원화 현금 거래 등록을 아직 열지 않는다(findMatchingCashAsset의 차단은 그대로다).
// 그래서 여기서는 "차단이 열렸을 때도 안전한가"를 보기 위해 거래 배열을 직접 주입하고,
// 실제 동기화 함수(syncAssetsFromTransactions)와 판정 함수를 그대로 호출해 결과를 확인한다.
//
// test/mc-adapter-sandbox.js와 같은 vm 방식 - production 코드에 export를 덧붙이지 않고 index.html과
// 같은 순서로 원본을 올린다(새 의존성 0개). 네트워크 · 현재 시각 · 실제 사용자 데이터를 쓰지 않는다.
const assert = require('node:assert');
const { test } = require('node:test');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
// 상태 상수는 vm 컨텍스트의 const라 sandbox 프로퍼티가 되지 않는다(mc-adapter-sandbox.js 주석 참고) -
// 공용 로더를 고치지 않고 evalInSandbox로 가져온다.
const D = SB.evalInSandbox('KRW_CASH_LEDGER_SYNC');

// 합성 자산/거래(ZZ 접두어). 금액 기반 입력 규칙 그대로 - quantity = 금액 · buyPrice = 1.
const A = (o) => Object.assign({
  id: 'zz-a', ticker: '', owner: '신랑', accountType: '일반계좌', category: '현금', categorySource: 'user',
  name: 'ZZ현금', isDomestic: '국내', currency: 'KRW', quantity: 0, buyPrice: 1, currentPrice: 1,
  positionSource: 'ledger', createdAt: 1, updatedAt: 1
}, o);
const T = (o) => Object.assign({
  id: 'zz-t', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'ZZ현금',
  type: 'buy', quantity: 0, price: 1, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1
}, o);

// 자산 · 거래를 심고 실제 동기화를 돌린 뒤, 심은 값과 돌린 뒤의 값을 함께 돌려준다.
function run(assets, transactions) {
  SB.state.assets = assets.map((a) => Object.assign({}, a));
  SB.state.transactions = transactions.map((t) => Object.assign({}, t));
  const seeded = SB.state.assets.map((a) => ({ id: a.id, name: a.name, quantity: a.quantity, buyPrice: a.buyPrice }));
  const diagnosis = SB.diagnoseKrwCashLedgerState();
  SB.syncAssetsFromTransactions();                     // 사용자 거래 입력 경로(auto 아님)
  const after = SB.state.assets.map((a) => ({ id: a.id, name: a.name, quantity: a.quantity, buyPrice: a.buyPrice, positionSource: a.positionSource }));
  return { seeded, diagnosis, after };
}
const qtyOf = (rows, id) => (rows.find((r) => r.id === id) || {}).quantity;
const statusOf = (dg, id) => (dg.items.find((i) => i.id === id) || {}).status;

test('Case 1. 기존 KRW 현금 1억 + 거래 0건 → 잔액이 그대로 유지된다(절대 0이 되지 않는다)', () => {
  const r = run([A({ id: 'c1', quantity: 100000000 })], []);
  assert.strictEqual(qtyOf(r.after, 'c1'), 100000000, '동기화 후에도 1억 그대로');
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.NO_LEDGER_POSITION);
  assert.strictEqual(r.diagnosis.items[0].ledgerQuantity, null, '원장 포지션 없음');
  assert.strictEqual(r.diagnosis.items[0].overwriteAllowed, false, '덮어쓰기 허용 안 함');
  assert.strictEqual(r.diagnosis.needsUserReview, true);
  // 판정 함수 자체도 같은 답을 내야 한다(동기화 경로와 진단 경로가 갈라지면 안 된다).
  assert.strictEqual(SB.krwCashLedgerSyncDecision(SB.state.assets[0], null, [SB.state.assets[0]]), D.NO_LEDGER_POSITION);
});

test('Case 2. 기존 KRW 현금 1억 + 원장 3천만 → 1억 유지 · 불일치 감지 · 자동 덮어쓰기 없음', () => {
  const r = run([A({ id: 'c1', quantity: 100000000 })], [T({ id: 't1', quantity: 30000000 })]);
  assert.strictEqual(qtyOf(r.after, 'c1'), 100000000, '원장 3천만으로 덮어쓰지 않는다');
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.BALANCE_MISMATCH);
  assert.strictEqual(r.diagnosis.items[0].assetQuantity, 100000000);
  assert.strictEqual(r.diagnosis.items[0].ledgerQuantity, 30000000);
  assert.strictEqual(r.diagnosis.items[0].overwriteAllowed, false);
  assert.strictEqual(r.diagnosis.needsUserReview, true);
});

test('Case 2-b. 전량 매도로 원장 수량이 0이어도 기존 잔액을 0으로 만들지 않는다', () => {
  const r = run([A({ id: 'c1', quantity: 100000000 })], [
    T({ id: 't1', date: '2026-09-01', quantity: 50000000 }),
    T({ id: 't2', date: '2026-09-10', type: 'sell', quantity: 50000000, createdAt: 2 })
  ]);
  assert.strictEqual(qtyOf(r.after, 'c1'), 100000000, '원장이 0이어도 자산은 그대로');
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.BALANCE_MISMATCH);
});

test('Case 3. KRW 현금 자산 없음 + 원장 1억 → 기존 자산은 바뀌지 않고, 엉뚱한 자산에 연결되지 않는다', () => {
  // 이름이 다른 기존 현금 자산을 함께 심어 "잘못된 매칭"이 일어나지 않는지 본다.
  const r = run([A({ id: 'other', name: 'ZZ다른현금', quantity: 55000000, positionSource: 'manual' })],
    [T({ id: 't1', name: 'ZZ현금', quantity: 100000000 })]);
  assert.strictEqual(qtyOf(r.after, 'other'), 55000000, '이름이 다른 기존 자산은 손대지 않는다');
  // 진단은 "원장에만 있는 현금 포지션"을 1단계에서 자산이 생길 경로로 보고한다.
  assert.strictEqual(r.diagnosis.orphanPositions.length, 1);
  assert.deepStrictEqual(
    { owner: r.diagnosis.orphanPositions[0].owner, name: r.diagnosis.orphanPositions[0].name, q: r.diagnosis.orphanPositions[0].ledgerQuantity },
    { owner: '신랑', name: 'ZZ현금', q: 100000000 });
  assert.strictEqual(r.diagnosis.needsUserReview, true);
  // identity 충돌이 없으므로 원장만으로 자산을 만드는 구조는 유효하다(현재 구조 확인 - 정책 활성화는 1단계).
  const created = r.after.find((a) => a.name === 'ZZ현금');
  assert.ok(created, '원장만 있는 포지션에서 자산이 만들어질 수 있는 구조다');
  assert.strictEqual(created.quantity, 100000000);
  assert.strictEqual(created.positionSource, 'ledger');
});

test('Case 4. 동일 owner · accountType · name · KRW 현금 자산 2개 → 자동 매칭 · 자동 덮어쓰기 금지', () => {
  const r = run([
    A({ id: 'c1', quantity: 10000000, positionSource: 'ledger' }),
    A({ id: 'c2', quantity: 20000000, positionSource: 'ledger' })
  ], [T({ id: 't1', quantity: 5000000 })]);
  assert.strictEqual(qtyOf(r.after, 'c1'), 10000000, '첫 자산을 덮어쓰지 않는다');
  assert.strictEqual(qtyOf(r.after, 'c2'), 20000000, '둘째 자산도 그대로다');
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.DUPLICATE_IDENTITY);
  assert.strictEqual(statusOf(r.diagnosis, 'c2'), D.DUPLICATE_IDENTITY);
  assert.strictEqual(r.diagnosis.duplicateIdentities.length, 1);
  assert.strictEqual(r.diagnosis.duplicateIdentities[0].count, 2);
  assert.strictEqual(r.diagnosis.needsUserReview, true);
});

test('Case 5. Owner가 다른 동명 KRW 현금 → 서로 간섭하지 않는다', () => {
  const r = run([
    A({ id: 'c1', owner: '신랑', quantity: 10000000 }),
    A({ id: 'c2', owner: '와이프', quantity: 20000000 })
  ], [T({ id: 't1', owner: '신랑', quantity: 7000000 })]);
  assert.strictEqual(qtyOf(r.after, 'c1'), 10000000);
  assert.strictEqual(qtyOf(r.after, 'c2'), 20000000);
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.BALANCE_MISMATCH, '거래가 있는 쪽만 불일치로 잡힌다');
  assert.strictEqual(statusOf(r.diagnosis, 'c2'), D.NO_LEDGER_POSITION, '다른 소유자는 원장 포지션 없음');
  assert.strictEqual(r.diagnosis.duplicateIdentities.length, 0, 'owner가 다르면 중복이 아니다');
});

test('Case 6. accountType이 다른 동명 KRW 현금 → 서로 간섭하지 않는다', () => {
  const r = run([
    A({ id: 'c1', accountType: '일반계좌', quantity: 10000000 }),
    A({ id: 'c2', accountType: 'ISA', quantity: 30000000 })
  ], [T({ id: 't1', accountType: 'ISA', quantity: 7000000 })]);
  assert.strictEqual(qtyOf(r.after, 'c1'), 10000000);
  assert.strictEqual(qtyOf(r.after, 'c2'), 30000000);
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.NO_LEDGER_POSITION);
  assert.strictEqual(statusOf(r.diagnosis, 'c2'), D.BALANCE_MISMATCH);
  assert.strictEqual(r.diagnosis.duplicateIdentities.length, 0, 'accountType이 다르면 중복이 아니다');
});

test('안전장치 범위. 잔액이 원장과 정확히 같으면 통과하되 값은 바뀌지 않는다(현재 동작 보존)', () => {
  const r = run([A({ id: 'c1', quantity: 30000000, buyPrice: 1 })], [T({ id: 't1', quantity: 30000000, price: 1 })]);
  assert.strictEqual(statusOf(r.diagnosis, 'c1'), D.LEDGER_MATCH);
  assert.strictEqual(r.diagnosis.items[0].overwriteAllowed, true);
  assert.strictEqual(r.diagnosis.needsUserReview, false);
  assert.strictEqual(qtyOf(r.after, 'c1'), 30000000, '통과해도 값이 그대로다');
  assert.strictEqual(r.after[0].buyPrice, 1);
});

test('안전장치 범위. 달러 현금과 다른 자산군은 이 안전장치의 대상이 아니다', () => {
  const usd = A({ id: 'u1', name: 'ZZ달러', currency: 'USD', isDomestic: '해외', quantity: 1000 });
  const stock = A({ id: 's1', name: 'ZZ주식', category: '주식', ticker: '900001.KS', quantity: 10, buyPrice: 10000 });
  assert.strictEqual(SB.isKrwCashAsset(usd), false);
  assert.strictEqual(SB.isKrwCashAsset(stock), false);
  assert.strictEqual(SB.krwCashLedgerSyncDecision(usd, null, [usd]), D.NOT_KRW_CASH);
  assert.strictEqual(SB.krwCashLedgerSyncDecision(stock, null, [stock]), D.NOT_KRW_CASH);
  // 달러 현금은 예전 그대로 거래원장이 관리한다 - 원장 수량이 자산에 반영돼야 한다.
  const r = run([usd], [T({ id: 'tu', name: 'ZZ달러', currency: 'USD', quantity: 1500, price: 1, appliedRate: 1300 })]);
  assert.strictEqual(qtyOf(r.after, 'u1'), 1500, '달러 현금은 원장이 반영된다(기존 정책 유지)');
  assert.strictEqual(r.diagnosis.items.length, 0, '달러 현금은 진단 대상이 아니다');
});

test('안전장치 범위. manual 자산 보호(BL-12)는 그대로다 - 주식 manual은 원장이 덮어쓰지 않는다', () => {
  const r = run([A({ id: 's1', name: 'ZZ주식', category: '주식', ticker: '900001.KS', quantity: 10, buyPrice: 10000, positionSource: 'manual' })],
    [T({ id: 'ts', name: 'ZZ주식', ticker: '900001.KS', quantity: 99, price: 20000 })]);
  assert.strictEqual(qtyOf(r.after, 's1'), 10, 'manual 주식은 예전 그대로 보호된다');
});

test('진단은 읽기만 한다 - 자산 · 거래를 바꾸지 않는다', () => {
  SB.state.assets = [A({ id: 'c1', quantity: 100000000 })];
  SB.state.transactions = [T({ id: 't1', quantity: 30000000 })];
  const frozen = JSON.stringify({ a: SB.state.assets, t: SB.state.transactions });
  SB.diagnoseKrwCashLedgerState();
  SB.diagnoseKrwCashLedgerState(SB.state.assets, SB.state.transactions);
  assert.strictEqual(JSON.stringify({ a: SB.state.assets, t: SB.state.transactions }), frozen);
});
