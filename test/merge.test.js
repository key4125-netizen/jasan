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

const { mergeCollectionById, buildCarryIfAbsentIndex, carryOverAbsentFields } = require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

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

/* =========================================================================
 * [P1 데이터 보존 - FIX-4/FIX-5] 엑셀 가져오기의 buyRate / rateMatchOverride 이월
 *
 * pick()이 "빈 셀"과 "열 자체가 없음"을 똑같이 ''로 뭉개기 때문에, 구형 엑셀(열 없음)을 올리기만
 * 해도 이 두 값이 사라졌다. carryOverAbsentFields는 "파일이 값을 안 담고 있으면 기존 값을 그대로
 * 둔다"만 하고, 없던 값을 추정해 만들지는 않는다(상시 정책 5항).
 * ====================================================================== */
const A = (over) => Object.assign({
  id: 'A1', ticker: 'GOOGL', owner: '신랑', accountType: '일반계좌',
  category: '주식', name: 'Alphabet', currency: 'USD', isDomestic: '해외'
}, over);

test('9. [FIX-4] 파일에 buyRate가 없으면 기존 값을 이어받는다 (id로 매칭)', () => {
  const index = buildCarryIfAbsentIndex([A({ buyRate: 1200 })]);
  const out = carryOverAbsentFields(A({ buyRate: undefined }), index);
  assert.strictEqual(out.buyRate, 1200);
});

test('10. [FIX-4] 파일에 buyRate가 있으면 파일 값이 이긴다', () => {
  const index = buildCarryIfAbsentIndex([A({ buyRate: 1200 })]);
  const out = carryOverAbsentFields(A({ buyRate: 1350 }), index);
  assert.strictEqual(out.buyRate, 1350);
});

test('11. [FIX-4] id가 없는 구형 파일도 identity(assetMergeKey)로 찾아 이어받는다', () => {
  const index = buildCarryIfAbsentIndex([A({ id: 'OLD', buyRate: 1200 })]);
  const out = carryOverAbsentFields(A({ id: 'NEW', buyRate: undefined }), index);
  assert.strictEqual(out.buyRate, 1200);
});

test('12. [FIX-5] 파일에 rateMatchOverride가 없으면 기존 값을 이어받는다', () => {
  const index = buildCarryIfAbsentIndex([A({ rateMatchOverride: 'S&P500' })]);
  const out = carryOverAbsentFields(A({ rateMatchOverride: undefined }), index);
  assert.strictEqual(out.rateMatchOverride, 'S&P500');
});

test('13. [FIX-5] 파일에 rateMatchOverride가 있으면 파일 값이 이긴다', () => {
  const index = buildCarryIfAbsentIndex([A({ rateMatchOverride: 'S&P500' })]);
  const out = carryOverAbsentFields(A({ rateMatchOverride: 'KOSPI' }), index);
  assert.strictEqual(out.rateMatchOverride, 'KOSPI');
});

test('14. [FIX-4/5] 매칭되는 기존 자산이 없으면(신규 자산) 남의 값을 이월하지 않는다', () => {
  const index = buildCarryIfAbsentIndex([A({ buyRate: 1200, rateMatchOverride: 'S&P500' })]);
  const 신규 = carryOverAbsentFields(A({ id: 'B1', ticker: 'MSFT', name: 'Microsoft', buyRate: undefined, rateMatchOverride: undefined }), index);
  assert.strictEqual(신규.buyRate, undefined);
  assert.strictEqual(신규.rateMatchOverride, undefined);
});

test('15. [FIX-4/5] 기존 자산에도 값이 없으면 없는 채로 둔다 - 값을 만들어내지 않는다', () => {
  const index = buildCarryIfAbsentIndex([A({})]);
  const out = carryOverAbsentFields(A({}), index);
  assert.strictEqual(out.buyRate, undefined);
  assert.strictEqual(out.rateMatchOverride, undefined);
});

test('16. [FIX-4/5] 두 필드 중 하나만 비어 있으면 그 하나만 이어받는다', () => {
  const index = buildCarryIfAbsentIndex([A({ buyRate: 1200, rateMatchOverride: 'S&P500' })]);
  const out = carryOverAbsentFields(A({ buyRate: undefined, rateMatchOverride: 'KOSPI' }), index);
  assert.strictEqual(out.buyRate, 1200);
  assert.strictEqual(out.rateMatchOverride, 'KOSPI');
});

test('17. [FIX-4/5] 원본 객체를 변형하지 않는다', () => {
  const index = buildCarryIfAbsentIndex([A({ buyRate: 1200 })]);
  const incoming = A({ buyRate: undefined });
  const out = carryOverAbsentFields(incoming, index);
  assert.strictEqual(incoming.buyRate, undefined);
  assert.strictEqual(out.buyRate, 1200);
  assert.notStrictEqual(out, incoming);
});
