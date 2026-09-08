// [V1.1 Phase 1 - BL-13/BL-16] 병합이 "상대에 없는 값"으로 "여기 있는 값"을 지우지 않는지 검증한다.
// 실행: node --test test/merge-preserve.test.js
//
// 로딩 방식은 test/merge.test.js와 같다(브라우저 전용 파일이라 가짜 DOM을 먼저 깔고 require) -
// 그쪽 파일 상단 주석 참고. 여기서는 승자 선택 규칙 자체가 아니라, 원격이 이겼는데 원격에
// 그 값이 아예 없을 때만 로컬 값을 남기는 보존 규칙만 본다.

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

function makeFakeElement() {
  const store = { value: '', textContent: '', innerHTML: '', className: '', type: '' };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === 'style') return {};
      if (prop === 'dataset') return {};
      return () => makeFakeElement();
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}
global.document = {
  getElementById: () => makeFakeElement(),
  addEventListener: () => {},
  createElement: () => makeFakeElement(),
  documentElement: makeFakeElement(),
  body: makeFakeElement()
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = global;

const { mergeCollectionById } = require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

const SEEN = (...ids) => new Set(ids);

/* ── A. BL-13 : 구버전 원격이 더 최신이어도 manual 표식이 사라지지 않는다 ────────── */
test('A. remote에 positionSource가 아예 없으면 local의 manual이 유지된다', () => {
  const local = [{ id: 'X', quantity: 100, positionSource: 'manual', updatedAt: 100 }];
  // 이 필드를 몰랐던 구버전 기기가 더 나중에 저장한 레코드
  const remote = [{ id: 'X', quantity: 70, updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('X'));
  assert.strictEqual(merged.length, 1);
  // 수량은 최신승 규칙 그대로 remote 값을 따른다 - 승자 선택 규칙은 바꾸지 않았다.
  assert.strictEqual(merged[0].quantity, 70);
  // 수정 전에는 여기가 undefined였다 - 표식이 사라져 다음 부팅에 거래원장이 수량을 덮어썼다.
  assert.strictEqual(merged[0].positionSource, 'manual');
});

test('A-2. local이 더 최신이면 예전 그대로 local이 통째로 채택된다 (보존 규칙 개입 없음)', () => {
  const local = [{ id: 'X', quantity: 100, positionSource: 'manual', updatedAt: 300 }];
  const remote = [{ id: 'X', quantity: 70, updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('X'));
  assert.deepStrictEqual(merged[0], local[0]);
});

/* ── B. BL-13 : 상대가 명시적으로 값을 갖고 있으면 최신승 규칙을 그대로 따른다 ──── */
test('B. remote가 명시적으로 ledger를 갖고 더 최신이면 ledger가 채택된다', () => {
  const local = [{ id: 'X', positionSource: 'manual', updatedAt: 100 }];
  const remote = [{ id: 'X', positionSource: 'ledger', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('X'));
  // 양쪽에 값이 있으면 보존 규칙이 개입하지 않는다 - 승자 값을 그대로 쓴다.
  assert.strictEqual(merged[0].positionSource, 'ledger');
});

test('B-2. 반대 방향도 대칭이다 - local이 최신이면 local 값이 남는다', () => {
  const local = [{ id: 'X', positionSource: 'ledger', updatedAt: 300 }];
  const remote = [{ id: 'X', positionSource: 'manual', updatedAt: 200 }];
  assert.strictEqual(mergeCollectionById(local, remote, SEEN('X'))[0].positionSource, 'ledger');
});

test('B-3. [정책] local에 표식이 없으면 오래된 remote 표식을 심지 않는다', () => {
  // 이 보존 규칙은 "원격이 이겼을 때 로컬 값이 사라지는 것"만 막는다. 반대 방향으로 채우면
  // 표식이 없는 legacy 자산이 동기화만으로 manual이 되어 legacy 자동 승격이 된다(정책 금지).
  // e2e/52 I/J가 이 동작을 고정하고 있다.
  const local = [{ id: 'X', updatedAt: 300 }];                        // local이 승자, 표식 없음
  const remote = [{ id: 'X', positionSource: 'manual', updatedAt: 100 }];
  assert.strictEqual(mergeCollectionById(local, remote, SEEN('X'))[0].positionSource, undefined);
});

test('B-4. remote가 이기고 remote에 값이 있으면 그 값을 그대로 쓴다', () => {
  const local = [{ id: 'X', updatedAt: 100 }];
  const remote = [{ id: 'X', positionSource: 'ledger', updatedAt: 300 }];
  assert.strictEqual(mergeCollectionById(local, remote, SEEN('X'))[0].positionSource, 'ledger');
});

/* ── C. BL-16 : 함께 보호하는 필드 / 보호하지 않는 필드 ───────────────────────── */
test('C. buyRate는 remote 구버전 레코드에 없어도 유지된다', () => {
  const local = [{ id: 'X', buyRate: 1300, updatedAt: 100 }];
  const remote = [{ id: 'X', updatedAt: 200 }];
  assert.strictEqual(mergeCollectionById(local, remote, SEEN('X'))[0].buyRate, 1300);
});

test('C-2. role / rateMatchOverride는 일부러 보호하지 않는다', () => {
  // 이 둘은 거래 수정 모드에서 칸을 비우면 undefined로 저장되어 "사용자가 지웠다"를 뜻한다(js/06).
  // 보호하면 사용자가 의도적으로 지운 값이 되살아나므로, 없어지는 것이 올바른 동작이다.
  const local = [{ id: 'X', role: 'core', rateMatchOverride: 'KOSPI', updatedAt: 100 }];
  const remote = [{ id: 'X', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('X'));
  assert.strictEqual(merged[0].role, undefined);
  assert.strictEqual(merged[0].rateMatchOverride, undefined);
});

/* ── G. 여러 필드를 한 레코드에서 동시에 ─────────────────────────────────────── */
test('G. 한 레코드에서 positionSource와 buyRate가 함께 보존된다', () => {
  const local = [{
    id: 'X', quantity: 100, buyPrice: 100, buyRate: 1300,
    positionSource: 'manual', role: 'core', rateMatchOverride: 'KOSPI', updatedAt: 100,
  }];
  const remote = [{ id: 'X', quantity: 70, buyPrice: 90, updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('X'));
  assert.strictEqual(merged[0].positionSource, 'manual');  // 보호
  assert.strictEqual(merged[0].buyRate, 1300);             // 보호
  assert.strictEqual(merged[0].quantity, 70);              // 최신승 그대로
  assert.strictEqual(merged[0].buyPrice, 90);              // 최신승 그대로
  assert.strictEqual(merged[0].role, undefined);           // 보호하지 않음
  assert.strictEqual(merged[0].rateMatchOverride, undefined);
});

/* ── 부작용 방지 ─────────────────────────────────────────────────────────────── */
test('입력 배열/객체를 변형하지 않는다 (순수성 유지)', () => {
  const local = [{ id: 'X', positionSource: 'manual', updatedAt: 100 }];
  const remote = [{ id: 'X', updatedAt: 200 }];
  const localSnapshot = JSON.stringify(local);
  const remoteSnapshot = JSON.stringify(remote);
  mergeCollectionById(local, remote, SEEN('X'));
  assert.strictEqual(JSON.stringify(local), localSnapshot);
  assert.strictEqual(JSON.stringify(remote), remoteSnapshot);   // 승자 remote에 값을 덧쓰지 않는다
});

test('거래내역처럼 두 필드가 아예 없는 레코드는 아무 영향도 받지 않는다', () => {
  const local = [{ id: 'T1', date: '2025-01-01', quantity: 10, updatedAt: 100 }];
  const remote = [{ id: 'T1', date: '2025-01-01', quantity: 20, updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, SEEN('T1'));
  assert.deepStrictEqual(merged[0], remote[0]);
  assert.ok(!('positionSource' in merged[0]));
  assert.ok(!('buyRate' in merged[0]));
});

test('한쪽에만 있는 id의 기존 삭제 판정(lastSyncedIds)은 그대로다', () => {
  // 이번 수정은 "양쪽에 다 있는 id"만 건드린다 - 나머지 세 분기는 손대지 않았다.
  assert.strictEqual(mergeCollectionById([{ id: 'A', updatedAt: 1 }], [], SEEN('A')).length, 0);
  assert.strictEqual(mergeCollectionById([{ id: 'A', updatedAt: 1 }], [], SEEN()).length, 1);
  assert.strictEqual(mergeCollectionById([], [{ id: 'B', updatedAt: 1 }], SEEN('B')).length, 0);
  assert.strictEqual(mergeCollectionById([], [{ id: 'B', updatedAt: 1 }], SEEN()).length, 1);
});
