// 가족 동기화 스마트 머지(mergeCollectionById) 검증 - Node 내장 test 러너/assert만 사용(추가 설치 불필요).
// 실행: node --test test/merge.test.js
//
// js/12-import-export-sync.js는 브라우저 전용 파일이라 최상위(top-level)에 document.getElementById(...)
// 배선 코드가 잔뜩 있다 - require()하면 그 코드가 전부 즉시 실행돼 Node에서는 바로 예외가 난다. 그래서
// require 전에 아주 관대한 가짜 DOM(무엇을 묻든 그냥 통과하는 스텁)을 전역에 깔아 top-level 코드가
// 조용히 지나가게 한 뒤, module.exports로 노출된 mergeCollectionById()만 순수 함수로 가져와 검증한다.

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
      return () => makeFakeElement(); // 그 외 메서드 호출(addEventListener 등)은 전부 무해한 no-op
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

test('1. id가 겹치지 않는 신규 레코드는 양쪽 다 유지된다 (Append-Only 핵심 케이스)', () => {
  const local = [{ id: 'A', name: '로컬신규', updatedAt: 100 }];
  const remote = [{ id: 'B', name: '원격신규', updatedAt: 100 }];
  const merged = mergeCollectionById(local, remote, new Set());
  const ids = merged.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ['A', 'B']);
});

test('2. 같은 id, updatedAt이 더 최신인 쪽이 채택된다', () => {
  const local = [{ id: 'A', name: '로컬버전', updatedAt: 100 }];
  const remote = [{ id: 'A', name: '원격버전(최신)', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['A']));
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].name, '원격버전(최신)');
});

test('2b. 같은 id, 로컬이 더 최신이면 로컬이 채택된다', () => {
  const local = [{ id: 'A', name: '로컬버전(최신)', updatedAt: 300 }];
  const remote = [{ id: 'A', name: '원격버전', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['A']));
  assert.strictEqual(merged[0].name, '로컬버전(최신)');
});

test('3. 로컬에만 있는 id가 기준선에도 있으면(=원격이 지움) 제외된다', () => {
  const local = [{ id: 'A', name: '로컬만있음', updatedAt: 100 }];
  const remote = [];
  const merged = mergeCollectionById(local, remote, new Set(['A']));
  assert.strictEqual(merged.length, 0);
});

test('4. 원격에만 있는 id가 기준선에도 있으면(=로컬이 지움) 되살아나지 않는다', () => {
  const local = [];
  const remote = [{ id: 'A', name: '원격만있음', updatedAt: 100 }];
  const merged = mergeCollectionById(local, remote, new Set(['A']));
  assert.strictEqual(merged.length, 0);
});

test('5. 로컬에만 있는 id가 기준선에 없으면(아직 동기화 안 된 순수 신규) 유지된다', () => {
  const local = [{ id: 'A', name: '방금로컬추가', updatedAt: 100 }];
  const remote = [];
  const merged = mergeCollectionById(local, remote, new Set()); // 기준선 비어있음 = 첫 동기화
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].id, 'A');
});

test('6. 원격에만 있는 id가 기준선에 없으면(상대가 만든 순수 신규) 유지된다', () => {
  const local = [];
  const remote = [{ id: 'B', name: '상대가추가', updatedAt: 100 }];
  const merged = mergeCollectionById(local, remote, new Set());
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].id, 'B');
});

test('7. 같은 id가 양쪽에 달리 있어도 병합 결과에는 정확히 1건만 존재한다(중복 제거)', () => {
  const local = [{ id: 'A', v: 1, updatedAt: 100 }];
  const remote = [{ id: 'A', v: 2, updatedAt: 200 }, { id: 'C', v: 1, updatedAt: 100 }];
  const merged = mergeCollectionById(local, remote, new Set(['A']));
  const ids = merged.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ['A', 'C']);
  assert.strictEqual(merged.filter((x) => x.id === 'A').length, 1);
  assert.strictEqual(merged.find((x) => x.id === 'A').v, 2); // 더 최신(원격)이 채택됐는지도 함께 확인
});

test('8. 실제 사용 시나리오 - 부부가 비슷한 시간에 각자 다른 자산을 추가해도 둘 다 살아남는다', () => {
  // 두 기기 다 이전 병합에서 {X, Y}를 알고 있었다고 가정
  const baseline = new Set(['X', 'Y']);
  const local = [
    { id: 'X', name: '공통자산', updatedAt: 100 },
    { id: 'Y', name: '공통자산2', updatedAt: 100 },
    { id: 'HUSBAND-NEW', name: '신랑이추가', updatedAt: 500 }
  ];
  const remote = [
    { id: 'X', name: '공통자산', updatedAt: 100 },
    { id: 'Y', name: '공통자산2', updatedAt: 100 },
    { id: 'WIFE-NEW', name: '와이프가추가', updatedAt: 400 }
  ];
  const merged = mergeCollectionById(local, remote, baseline);
  const ids = merged.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ['HUSBAND-NEW', 'WIFE-NEW', 'X', 'Y']); // 둘 다 살아남음 - 원래 버그였던 소실 시나리오 해결 확인
});
