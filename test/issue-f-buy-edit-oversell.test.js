/* [PM 지시 2026-09-27 · ISSUE-F] 매수 거래 수정이 기존 매도를 과매도로 만드는 경우 - 순수 로직 고정.
 *
 * 문제: 과매도 검증이 "저장하는 거래가 매도일 때"만 돌아서, 매수를 줄이는 수정은 검증 없이 통과했고
 *       계산이 -Math.min(매도수량, 보유수량)으로 조용히 잘라냈다(실측: 매수 10 · 매도 8에서 매수를
 *       5로 줄이면 보유 0 · 매도 기록 8 · 실현손익은 5 기준 · 안내 없음).
 *
 * 고친 방식: 새 규칙을 만들지 않고, 같은 규칙("매도는 그 시점 보유수량을 넘을 수 없다")을 매수 수정
 *           경로에도 적용했다. 판정 근거도 실제 계산과 같다 - 같은 포지션 키, 같은 정렬.
 *
 * 실제 js/01~10을 vm 샌드박스에 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 전부 합성 데이터(ZZ 접두어)다.
 * 실행: node --test test/issue-f-buy-edit-oversell.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
const ev = (code) => SB.evalInSandbox(code);
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const BASE = { owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS', name: 'ZZ합성주식', currency: 'KRW' };
const tx = (over) => Object.assign({}, BASE, { fee: 0, origin: 'period' }, over);

// 매수 10(09-01) + 매도 8(09-05) - 이 보고서의 실측 사례 그대로.
const BUY = tx({ id: 'ZZ-B1', date: '2026-09-01', type: 'buy', quantity: 10, price: 1000, createdAt: 1 });
const SELL = tx({ id: 'ZZ-S1', date: '2026-09-05', type: 'sell', quantity: 8, price: 1200, createdAt: 2 });

function seed(list) {
  ev(`state.transactions = ${JSON.stringify(list)};`);
}
// 고칠 거래(editingTxId)를 proposed로 바꿔 저장했을 때 위반이 있는가.
function check(proposed, editingTxId) {
  return JSON.parse(ev(`JSON.stringify(findOversellAfterTransactionEdit(${JSON.stringify(proposed)}, ${JSON.stringify(editingTxId)}) || null)`));
}

/* ══════════════ PM 지시 §4 필수 시나리오 1~4 ══════════════ */

test('F-1. 매수 10 → 5 (매도 8이 남아 있다) - 위반으로 잡는다', () => {
  seed([BUY, SELL]);
  const v = check(Object.assign({}, BUY, { quantity: 5 }), 'ZZ-B1');
  assert.ok(v, '위반을 돌려준다');
  assert.strictEqual(v.tx.id, 'ZZ-S1', '어느 매도가 문제인지 가리킨다');
  assert.strictEqual(v.requested, 8, '그 매도가 팔려는 수량');
  assert.strictEqual(v.available, 5, '그 시점 보유수량');
});

test('F-2. 매수 10 → 8 (매도와 같다) - 통과한다', () => {
  seed([BUY, SELL]);
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 8 }), 'ZZ-B1'), null);
});

test('F-3. 매수 10 → 9 (매도보다 크다) - 통과한다', () => {
  seed([BUY, SELL]);
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 9 }), 'ZZ-B1'), null);
});

test('F-4. 매수 10 → 15 (늘리는 수정) - 통과한다', () => {
  seed([BUY, SELL]);
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 15 }), 'ZZ-B1'), null);
});

/* ══════════════ 경계 · 같은 규칙이 잡는 다른 모양의 같은 문제 ══════════════ */

test('F-5. 소수점 수량에서도 경계가 정확하다(7.9999는 막고 8은 통과)', () => {
  seed([BUY, SELL]);
  assert.ok(check(Object.assign({}, BUY, { quantity: 7.9999 }), 'ZZ-B1'), '조금이라도 모자라면 막는다');
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 8 }), 'ZZ-B1'), null, '딱 맞으면 통과');
});

test('F-6. 날짜만 뒤로 옮겨 매도보다 늦어져도 같은 규칙이 잡는다', () => {
  // 수량은 그대로 10이지만 매수가 매도 뒤로 가면, 매도 시점 보유수량은 0이다.
  seed([BUY, SELL]);
  const v = check(Object.assign({}, BUY, { date: '2026-09-10' }), 'ZZ-B1');
  assert.ok(v, '날짜 이동도 같은 문제를 만든다');
  assert.strictEqual(v.available, 0);
  assert.strictEqual(v.requested, 8);
});

test('F-7. 다른 포지션으로 옮기는 수정은 떠나는 쪽도 확인한다', () => {
  // 소유자를 바꾸면 원래 포지션에는 매수가 사라지고 매도 8만 남는다.
  seed([BUY, SELL]);
  const v = check(Object.assign({}, BUY, { owner: '와이프' }), 'ZZ-B1');
  assert.ok(v, '떠나는 포지션에 남겨진 매도를 잡는다');
  assert.strictEqual(v.tx.id, 'ZZ-S1');
  assert.strictEqual(v.available, 0);
});

test('F-8. 매도가 여러 건이면 처음 넘어서는 지점을 가리킨다', () => {
  const s2 = tx({ id: 'ZZ-S2', date: '2026-09-07', type: 'sell', quantity: 2, price: 1300, createdAt: 3 });
  seed([BUY, SELL, s2]);
  // 매수 10 → 7: 09-05 매도 8이 먼저 넘어선다(09-07 매도 2가 아니라).
  const v = check(Object.assign({}, BUY, { quantity: 7 }), 'ZZ-B1');
  assert.ok(v);
  assert.strictEqual(v.tx.id, 'ZZ-S1', '먼저 오는 매도를 가리킨다');
  assert.strictEqual(v.available, 7);
  // 매수 10 → 9: 09-05 매도 8은 통과하고(남은 1) 09-07 매도 2가 넘어선다.
  const v2 = check(Object.assign({}, BUY, { quantity: 9 }), 'ZZ-B1');
  assert.ok(v2);
  assert.strictEqual(v2.tx.id, 'ZZ-S2');
  assert.strictEqual(v2.available, 1);
  assert.strictEqual(v2.requested, 2);
});

test('F-9. 매수가 여러 건이면 합계로 본다', () => {
  const b2 = tx({ id: 'ZZ-B2', date: '2026-09-02', type: 'buy', quantity: 6, price: 1100, createdAt: 2 });
  const sell = tx({ id: 'ZZ-S1', date: '2026-09-05', type: 'sell', quantity: 12, price: 1200, createdAt: 3 });
  seed([BUY, b2, sell]);
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 6 }), 'ZZ-B1'), null, '6 + 6 = 12 - 딱 맞는다');
  assert.ok(check(Object.assign({}, BUY, { quantity: 5 }), 'ZZ-B1'), '5 + 6 = 11 - 모자란다');
});

test('F-10. 다른 포지션(소유자 · 계좌 · 종목 · 통화)의 거래는 섞지 않는다', () => {
  const other = tx({ id: 'ZZ-X1', owner: '와이프', date: '2026-09-05', type: 'sell', quantity: 50, price: 1200, createdAt: 3 });
  seed([BUY, SELL, other]);
  // 와이프 포지션에는 매수가 없어 그 자체로 과매도지만, 이번 수정과 무관하므로 건드리지 않는다.
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 8 }), 'ZZ-B1'), null,
    '이번 수정이 만든 문제만 본다(기존에 이미 있던 다른 포지션의 상태를 새로 차단하지 않는다)');
});

test('F-11. 매도 기록이 없으면 얼마로 줄이든 통과한다', () => {
  seed([BUY]);
  assert.strictEqual(check(Object.assign({}, BUY, { quantity: 1 }), 'ZZ-B1'), null);
});

/* ══════════════ 계산과 같은 것을 본다 ══════════════ */

test('F-12. 판정이 실제 계산과 같은 포지션 · 같은 정렬을 쓴다', () => {
  const src = read('js/06-transactions.js');
  const fn = /function findOversellAfterTransactionEdit\(proposedTx, editingTxId\) \{([\s\S]*?)\r?\n\}/.exec(src);
  assert.ok(fn, '함수를 찾았다');
  assert.match(fn[1], /transactionIdentityKey\(/, '포지션 키는 실제 계산과 같은 함수를 쓴다');
  assert.match(fn[1], /localeCompare[\s\S]*?createdAt/, '정렬도 날짜 → 생성시각으로 같다');
  assert.ok(!/state\.\w+\s*=/.test(fn[1]), '순수 사전 검증 - state를 바꾸지 않는다');
  assert.ok(!/persist/.test(fn[1]), '저장하지 않는다');
});

test('F-13. 계산 쪽 clamp는 그대로 둔다(이 화면을 거치지 않는 경로의 최후 방어선)', () => {
  /* 엑셀 업로드 · 클라우드 병합 · 예전 데이터는 이 폼을 거치지 않는다.
   * clamp를 없애면 그 경로에서 보유수량이 음수가 될 수 있다 - 계산 모델 변경이라 범위 밖이다.
   * 이번 변경은 "저장 경로에서 조용히 통과시키던 것"을 막은 것이다. */
  const src = read('js/06-transactions.js');
  assert.match(src, /qty \+= t\.type === 'buy' \? t\.quantity : -Math\.min\(t\.quantity, qty\)/,
    'computeCurrentHoldingQuantity의 clamp 유지');
  assert.match(src, /Math\.min\(tx\.quantity, pos\.quantity\)|-Math\.min/,
    'computePositionsAndRealizedPnL 쪽 clamp도 유지');
});

test('F-14. 저장 핸들러가 검증에 실패하면 아무것도 바꾸지 않고 돌아간다', () => {
  const src = read('js/06-transactions.js');
  const guard = /const violation = findOversellAfterTransactionEdit\(proposed, editingTx\.id\);([\s\S]{0,600}?)\n {2}\}/.exec(src);
  assert.ok(guard, '검증 호출부를 찾았다');
  assert.match(guard[1], /showToast\(/, '무엇이 문제인지 알린다');
  assert.match(guard[1], /return;/, '저장하지 않고 돌아간다');
  // 검증은 state를 건드리는 첫 코드(state.transactions[idx] = tx / push)보다 앞에 있어야 한다.
  const iGuard = src.indexOf('const violation = findOversellAfterTransactionEdit');
  const iWrite = src.indexOf('state.transactions[idx] = tx;');
  const iPush = src.indexOf('state.transactions.push(tx);');
  assert.ok(iGuard > 0 && iWrite > iGuard, '수정 저장보다 앞에 있다');
  assert.ok(iPush > iGuard, '신규 저장보다도 앞에 있다');
});

test('F-15. 새 거래 추가와 매도 수정은 기존 경로 그대로다', () => {
  const src = read('js/06-transactions.js');
  // 기존 매도 검증이 그대로 남아 있다.
  assert.match(src, /현재 보유수량\(\$\{fmtNum\(available, 4\)\}\)보다 많은 수량을 매도할 수 없습니다\./);
  // 새 검증은 "고치는 거래가 매수일 때"만 돈다.
  assert.match(src, /if \(editingTx && editingTx\.type === 'buy'\) \{/);
});
