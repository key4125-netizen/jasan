// [P1-1] 업로드 payload 스탬프(stampPayload) 검증 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/sync-payload.test.js
//
// 이 함수의 존재 이유는 "사용자가 [이 기기 데이터 올리기]를 고른 경우에만, 로컬 데이터를 건드리지
// 않고 업로드본에만 지금 시각을 찍는다"이다. 그래서 검증의 핵심도 두 가지다.
//   ① 찍어야 할 네 곳만 찍힌다 (assets/transactions/rebalance/projection의 updatedAt)
//   ② 원본(= state에서 온 객체)이 한 글자도 바뀌지 않는다 - 업로드가 실패해도 로컬이 멀쩡해야 한다
//
// merge.test.js와 같은 방식으로, 브라우저 전용 top-level 코드를 통과시키기 위한 가짜 DOM을 깔고
// module.exports로 노출된 순수 함수만 가져온다.

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

const { stampPayload } = require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

// buildSyncBlob()이 만드는 것과 같은 모양의 payload를 손으로 만든다(합성 데이터 - 실제 사용자 값 아님).
function makeBlob() {
  return {
    app: 'smart-asset-manager',
    exchangeRate: 1400,
    dailyChangeRate: 0.5,
    rebalance: { updatedAt: 1000, targets: { A: 1 } },
    projection: { updatedAt: 1000, monthlyContribution: 100000, taxAdvantagedPlan: { x: 1 } },
    assets: [
      { id: 'AS-1', name: 'A_종목', quantity: 10, buyPrice: 100, createdAt: 111, updatedAt: 1000,
        positionSource: 'ledger', categorySource: 'user', buyRate: 1300, rateMatchOverride: 'KOSPI', role: 'core' },
      { id: 'AS-2', name: 'B_종목', quantity: 5, buyPrice: 200, createdAt: 222, updatedAt: 2000 }
    ],
    transactions: [
      { id: 'TX-1', date: '2026-01-02', quantity: 10, price: 100, createdAt: 333, updatedAt: 1000, origin: 'period' },
      { id: 'TX-2', date: '2026-02-03', quantity: 5, price: 200, createdAt: 444, updatedAt: 2000, origin: 'initial' }
    ],
    tickerRoles: { 'AAA': 'core' },
    learnedTickerNames: { 'AAA': '가나다' },
    dailySnapshots: { '2026-01-02': { total: 1 } }
  };
}

test('U-01. 원본 blob과 그 안의 객체를 전혀 변경하지 않는다', () => {
  const blob = makeBlob();
  const before = JSON.parse(JSON.stringify(blob));
  const assetRef = blob.assets[0];
  const txRef = blob.transactions[0];
  const rebalanceRef = blob.rebalance;
  const projectionRef = blob.projection;

  const out = stampPayload(blob, 999999);

  assert.deepStrictEqual(blob, before, '원본 blob이 변경되었다');
  assert.strictEqual(blob.assets[0], assetRef, '원본 asset 참조가 바뀌었다');
  assert.strictEqual(blob.transactions[0], txRef, '원본 transaction 참조가 바뀌었다');
  assert.strictEqual(blob.rebalance, rebalanceRef, '원본 rebalance 참조가 바뀌었다');
  assert.strictEqual(blob.projection, projectionRef, '원본 projection 참조가 바뀌었다');
  // 결과는 반드시 새 객체여야 한다(같은 참조를 돌려주면 위 불변성이 우연히 성립한 것뿐이다)
  assert.notStrictEqual(out, blob);
  assert.notStrictEqual(out.assets[0], assetRef);
  assert.notStrictEqual(out.transactions[0], txRef);
  assert.notStrictEqual(out.rebalance, rebalanceRef);
  assert.notStrictEqual(out.projection, projectionRef);
});

test('U-02. assets/transactions/rebalance/projection의 updatedAt만 현재 시각으로 바뀐다', () => {
  const ts = 1789000000000;
  const out = stampPayload(makeBlob(), ts);

  out.assets.forEach((a) => assert.strictEqual(a.updatedAt, ts));
  out.transactions.forEach((t) => assert.strictEqual(t.updatedAt, ts));
  assert.strictEqual(out.rebalance.updatedAt, ts);
  assert.strictEqual(out.projection.updatedAt, ts);
});

test('U-03. createdAt과 보존 대상 필드는 바뀌지 않는다', () => {
  const blob = makeBlob();
  const out = stampPayload(blob, 1789000000000);

  assert.strictEqual(out.assets[0].createdAt, 111);
  assert.strictEqual(out.assets[1].createdAt, 222);
  assert.strictEqual(out.transactions[0].createdAt, 333);
  assert.strictEqual(out.transactions[1].createdAt, 444);

  assert.strictEqual(out.assets[0].positionSource, 'ledger');
  assert.strictEqual(out.assets[0].categorySource, 'user');
  assert.strictEqual(out.assets[0].buyRate, 1300);
  assert.strictEqual(out.assets[0].rateMatchOverride, 'KOSPI');
  assert.strictEqual(out.assets[0].role, 'core');
  assert.strictEqual(out.assets[0].quantity, 10);
  assert.strictEqual(out.assets[0].buyPrice, 100);
  assert.strictEqual(out.transactions[1].origin, 'initial');
});

test('U-03-2. 합집합으로 병합되는 세 가지와 스칼라 설정은 손대지 않는다', () => {
  const blob = makeBlob();
  const out = stampPayload(blob, 1789000000000);

  // tickerRoles/learnedTickerNames/dailySnapshots는 timestamp 개념이 없는 합집합 구조라
  // 스탬프 대상이 아니다 - 참조 그대로 넘어가야 한다.
  assert.strictEqual(out.tickerRoles, blob.tickerRoles);
  assert.strictEqual(out.learnedTickerNames, blob.learnedTickerNames);
  assert.strictEqual(out.dailySnapshots, blob.dailySnapshots);
  assert.strictEqual(out.exchangeRate, 1400);
  assert.strictEqual(out.dailyChangeRate, 0.5);
  assert.strictEqual(out.app, 'smart-asset-manager');
});

test('U-03-3. rebalance/projection의 나머지 내용은 그대로 함께 올라간다', () => {
  const out = stampPayload(makeBlob(), 1789000000000);
  assert.deepStrictEqual(out.rebalance.targets, { A: 1 });
  assert.strictEqual(out.projection.monthlyContribution, 100000);
  assert.deepStrictEqual(out.projection.taxAdvantagedPlan, { x: 1 });
});

test('U-03-4. assets/transactions/rebalance/projection이 없는 payload에서도 죽지 않는다', () => {
  const out = stampPayload({ app: 'smart-asset-manager', exchangeRate: 1400 }, 123);
  assert.deepStrictEqual(out.assets, []);
  assert.deepStrictEqual(out.transactions, []);
  assert.strictEqual(out.rebalance, undefined);
  assert.strictEqual(out.projection, undefined);
});

test('U-03-5. 삭제된 레코드는 payload에 없으므로 스탬프 대상도 아니다(삭제 전파 무영향)', () => {
  // 삭제는 "payload에 그 id가 없음 + 받는 기기의 기준선에 있었음"으로 표현된다(mergeCollectionById).
  // stampPayload는 있는 레코드의 시각만 바꿀 뿐이라 삭제 표현에 관여하지 않는다.
  const blob = makeBlob();
  blob.transactions = blob.transactions.filter((t) => t.id !== 'TX-2'); // TX-2를 지운 상태
  const out = stampPayload(blob, 1789000000000);
  assert.deepStrictEqual(out.transactions.map((t) => t.id), ['TX-1']);
});
