// [PM 지시 2026-09-23 · 동기화] 사용자 선택 방식 - 15개 충돌 시나리오.
//
// 확정 정책: 두 곳이 **같으면** 묻지 않고 그대로 동기화하고(Case A), **다르면** 앱이 어느 쪽을
// 쓸지 고르지 않고 사용자가 [이 기기 데이터] · [클라우드 데이터] 중에서 고른다(Case B).
// v267(PC-6 · SoT §53-9)이 "손실이 생길 수 있는 차이만" 묻게 완화했던 것을 되돌린 상태를 고정한다.
//
// 여기서 재는 것은 "묻는가 / 묻지 않는가"와 "고른 쪽이 그대로 반영되는가" 둘이다.
// 실제 js/01~10 · js/25를 vm 샌드박스에 실어 정규화 규칙을 가짜로 만들지 않는다(sync-diff.test.js와 같은 방식).
// 실행: node --test test/sync-user-choice.test.js
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');
/* js/12는 브라우저 전용이라 require하면 최상위 DOM 배선이 즉시 실행된다 -
 * merge.test.js와 똑같이 관대한 가짜 DOM을 먼저 깔고 순수 함수만 가져온다. */
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
global.document = { getElementById: () => makeFakeElement(), addEventListener: () => {}, createElement: () => makeFakeElement(), documentElement: makeFakeElement(), body: makeFakeElement() };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = global;
const { mergeCollectionById } = require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

const SB = (() => {
  const sb = loadAdapterSandbox();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '25-sync-diff.js'), 'utf8'), sb, { filename: '25-sync-diff.js' });
  return sb;
})();
const clone = (x) => JSON.parse(JSON.stringify(x));

/* 합성 데이터만 쓴다(ZZ 접두어) - 실제 보유 자산 · 거래가 아니다. */
const asset = (id, o = {}) => ({
  id, ticker: 'ZZ0001.KS', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'user',
  name: 'ZZ합성주식', isDomestic: '국내', currency: 'KRW', quantity: 100, buyPrice: 70000,
  currentPrice: 80000, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000, ...o
});
const tx = (id, o = {}) => ({
  id, date: '2026-09-03', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS', name: 'ZZ합성주식',
  type: 'buy', quantity: 10, price: 70000, currency: 'KRW', fee: 0, origin: 'period',
  createdAt: 1000, updatedAt: 1000, ...o
});

/* 주식 · ETF · 채권 · 현금과 여러 계좌 · 여러 자산을 담은 기본 상태(지시문 §10). */
function baseLocal() {
  return {
    assets: [
      asset('a-stock'),
      asset('a-etf', { ticker: 'ZZ0002.KS', name: 'ZZ합성ETF', category: 'ETF', accountType: 'ISA', quantity: 50, rateMatchOverride: 'S&P500' }),
      asset('a-bond', { ticker: 'KR0000000ZZ1', name: 'ZZ합성국고채', category: '채권', accountType: 'IRP', quantity: 1000, buyPrice: 10000 }),
      asset('a-cash', { ticker: '', name: 'ZZ예수금', category: '현금', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, fxHedgeStatus: 'UNHEDGED' })
    ],
    transactions: [
      tx('t-buy'),
      tx('t-sell', { id: 't-sell', type: 'sell', quantity: 3 }),
      tx('t-isa', { id: 't-isa', accountType: 'ISA', ticker: 'ZZ0002.KS', name: 'ZZ합성ETF' }),
      tx('t-bond', { id: 't-bond', accountType: 'IRP', ticker: 'KR0000000ZZ1', name: 'ZZ합성국고채', quantity: 1000, price: 10000 })
    ],
    rebalance: clone(SB.state.rebalance),
    projection: clone(SB.state.projection)
  };
}
// 다른 기기가 올린 클라우드 데이터 = buildSyncBlob 모양의 JSON 왕복본
const cloudOf = (local) => ({
  app: 'smart-asset-manager', exportedAt: '2026-09-23T00:00:00.000Z', exchangeRate: 1400, dailyChangeRate: 0,
  ...clone(local), dailySnapshots: {}, learnedTickerNames: {}, tickerRoles: {}
});
// "물어봐야 하는가" - 앱이 보는 판정 그대로(gateIncomingSyncData가 쓰는 값).
const asksUser = (local, cloud) => SB.compareSyncData(local, cloud).hasMeaningfulDifference;
const diffOf = (local, cloud) => clone(SB.compareSyncData(local, cloud));
const ids = (arr) => arr.map((x) => x.id).sort();

/* 사용자가 고른 결과. 두 선택 모두 **기준 데이터를 통째로** 쓴다 -
 * [이 기기 데이터]는 로컬 그대로 올리고, [클라우드 데이터]는 원격 그대로 받는다(fullAdopt). */
const chooseLocal = (local) => clone(local);
const chooseCloud = (cloud) => ({ assets: clone(cloud.assets), transactions: clone(cloud.transactions) });

/* ══════════════ Case A - 같으면 묻지 않는다 ══════════════ */

test('Case 1. Local == Cloud - 사용자에게 아무것도 묻지 않는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  assert.equal(asksUser(local, cloud), false);
});

test('Case 1-b. 시각 · 시세 · 배열 순서만 다른 것은 차이가 아니다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets.reverse();
  cloud.transactions.reverse();
  cloud.assets.forEach((a) => { a.updatedAt = 9e12; a.createdAt = 1; a.currentPrice = 123456; });
  cloud.transactions.forEach((t) => { t.updatedAt = 9e12; });
  cloud.exchangeRate = 1500;
  assert.equal(asksUser(local, cloud), false, '동기화가 그대로 진행돼야 한다');
});

/* ══════════════ Case B - 다르면 반드시 묻는다 ══════════════ */

test('Case 2. Local에 신규 자산 추가 - 자동 병합하지 않고 묻는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets.push(asset('a-new-local', { name: 'ZZ새로산주식' }));
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.localOnly), ['a-new-local']);
});

test('Case 3. Cloud에 신규 자산 추가 - 자동 병합하지 않고 묻는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets.push(asset('a-new-cloud', { name: 'ZZ배우자가산주식' }));
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.cloudOnly), ['a-new-cloud']);
});

test('Case 4. Local의 기존 자산 수정', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets[0].quantity = 120;
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.different), ['a-stock']);
});

test('Case 5. Cloud의 기존 자산 수정', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets[0].quantity = 80;
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.different), ['a-stock']);
});

test('Case 6. 같은 자산을 양쪽이 서로 다르게 수정 - 고른 쪽 값이 그대로 남는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets[0].quantity = 120;
  cloud.assets[0].quantity = 80;
  cloud.assets[0].updatedAt = 9e12; // 클라우드가 "더 최신"이어도 자동으로 이기지 않는다
  assert.equal(asksUser(local, cloud), true, '최신 시각으로 자동 결정하지 않는다');
  assert.equal(chooseLocal(local).assets[0].quantity, 120);
  assert.equal(chooseCloud(cloud).assets[0].quantity, 80);
});

test('Case 7. Local에서 자산 삭제 - 삭제를 자동 전파하지 않는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets = local.assets.filter((a) => a.id !== 'a-etf');
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.cloudOnly), ['a-etf']);
  assert.equal(chooseLocal(local).assets.length, 3, '이 기기 선택 = 삭제가 반영된다');
  assert.equal(chooseCloud(cloud).assets.length, 4, '클라우드 선택 = 그 자산이 남는다');
});

test('Case 8. Cloud에서 동일 자산 삭제', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets = cloud.assets.filter((a) => a.id !== 'a-etf');
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).assets.localOnly), ['a-etf']);
});

test('Case 9. Local에서 거래 추가', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.transactions.push(tx('t-new-local', { date: '2026-09-20' }));
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).transactions.localOnly), ['t-new-local']);
});

test('Case 10. Cloud에서 거래 추가', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.transactions.push(tx('t-new-cloud', { date: '2026-09-21' }));
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(diffOf(local, cloud).transactions.cloudOnly), ['t-new-cloud']);
});

test('Case 11. Asset은 Local 변경 · Transaction은 Cloud 변경 - 한 번의 선택으로 한쪽 기준이 된다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets[0].quantity = 120;
  cloud.transactions.push(tx('t-cloud-only'));
  const d = diffOf(local, cloud);
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(d.assets.different), ['a-stock']);
  assert.deepEqual(ids(d.transactions.cloudOnly), ['t-cloud-only']);
  // 필드별 · 컬렉션별로 섞지 않는다 - 고른 쪽이 자산과 거래 모두의 기준이다.
  const pickedLocal = chooseLocal(local);
  assert.equal(pickedLocal.assets[0].quantity, 120);
  assert.equal(pickedLocal.transactions.length, 4, '이 기기 선택이면 클라우드의 거래는 들어오지 않는다');
  const pickedCloud = chooseCloud(cloud);
  assert.equal(pickedCloud.assets[0].quantity, 100);
  assert.equal(pickedCloud.transactions.length, 5);
});

test('Case 12. Asset과 Transaction이 서로 반대 방향으로 변경', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets = local.assets.filter((a) => a.id !== 'a-cash'); // 이 기기는 지웠다
  cloud.transactions[0].quantity = 99;                          // 저쪽은 거래를 고쳤다
  const d = diffOf(local, cloud);
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(d.assets.cloudOnly), ['a-cash']);
  assert.deepEqual(ids(d.transactions.different), ['t-buy']);
});

test('Case 13. 같은 ticker지만 owner · 계좌가 다르면 서로 다른 항목이다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets.push(asset('a-wife', { owner: '와이프', accountType: 'ISA' })); // 같은 ticker · 다른 보유자
  const d = diffOf(local, cloud);
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(d.assets.cloudOnly), ['a-wife'], '같은 종목이라고 하나로 합치지 않는다');
  assert.deepEqual(ids(d.assets.different), [], '기존 자산은 건드리지 않는다');
});

test('Case 14. 채권 거래 + 채권 원장 - ISIN identity가 유지된다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.transactions = cloud.transactions.map((t) => (t.id === 't-bond' ? { ...t, quantity: 2000 } : t));
  const d = diffOf(local, cloud);
  assert.equal(asksUser(local, cloud), true);
  assert.deepEqual(ids(d.transactions.different), ['t-bond']);
  // 채권의 신원은 ticker 칸에 담긴 ISIN이다(§49 BOND-05) - 비교에서도 그대로다.
  assert.equal(chooseCloud(cloud).transactions.find((t) => t.id === 't-bond').ticker, 'KR0000000ZZ1');
  assert.equal(chooseLocal(local).transactions.find((t) => t.id === 't-bond').quantity, 1000);
});

test('Case 15. 사용자 확정값이 포함된 자산 - 고른 쪽의 확정값이 그대로 남는다', () => {
  const local = baseLocal();
  local.assets[1].rateMatchOverride = 'S&P500';
  local.assets[1].marketBetaIndexOverride = 'SP500';
  local.assets[1].fxHedgeStatus = 'HEDGED';
  const cloud = cloudOf(local);
  cloud.assets[1].rateMatchOverride = 'KOSPI';
  cloud.assets[1].marketBetaIndexOverride = 'KOSPI';
  cloud.assets[1].fxHedgeStatus = 'UNHEDGED';
  assert.equal(asksUser(local, cloud), true, '사용자 확정값 차이도 반드시 묻는다');

  const l = chooseLocal(local).assets[1];
  assert.deepEqual([l.rateMatchOverride, l.marketBetaIndexOverride, l.fxHedgeStatus], ['S&P500', 'SP500', 'HEDGED']);
  const c = chooseCloud(cloud).assets[1];
  assert.deepEqual([c.rateMatchOverride, c.marketBetaIndexOverride, c.fxHedgeStatus], ['KOSPI', 'KOSPI', 'UNHEDGED']);
});

/* ══════════════ 설정 · 무결성 ══════════════ */

test('설정. 목표비중 · 미래예측 설정이 다르면 묻는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.rebalance['신랑'].domestic = { '국내': 10, '해외': 90 };
  assert.equal(asksUser(local, cloud), true);
  assert.equal(diffOf(local, cloud).rebalance.changed, true);

  const local2 = baseLocal();
  const cloud2 = cloudOf(local2);
  cloud2.projection.monthlyContribution = 9999999;
  assert.equal(asksUser(local2, cloud2), true);
  assert.equal(diffOf(local2, cloud2).projection.changed, true);
});

test('무결성. 어느 선택에서도 중복 · orphan · identity 어긋남이 생기지 않는다', () => {
  const local = baseLocal();
  const cloud = cloudOf(local);
  local.assets.push(asset('a-new-local'));
  cloud.transactions.push(tx('t-new-cloud'));
  [chooseLocal(local), chooseCloud(cloud)].forEach((picked, i) => {
    const label = i === 0 ? '이 기기 데이터' : '클라우드 데이터';
    const aIds = picked.assets.map((a) => a.id);
    const tIds = picked.transactions.map((t) => t.id);
    assert.equal(new Set(aIds).size, aIds.length, label + ' - 자산 중복 없음');
    assert.equal(new Set(tIds).size, tIds.length, label + ' - 거래 중복 없음');
    assert.ok(picked.assets.every((a) => a.id && a.owner && a.accountType), label + ' - identity 필드 유지');
    // 티커가 있는 거래는 같은 identity의 자산이 있거나(원장 기반) 새 자산을 만드는 입력이다 - id가 빈 항목은 없다.
    assert.ok(picked.transactions.every((t) => t.id && t.owner && t.accountType), label + ' - 거래 identity 유지');
  });
});

/* ══════════════ 자동 우선순위가 남아 있지 않다 ══════════════ */

test('정책. 차이가 없을 때만 병합이 돌고, 그 결과는 어느 쪽을 골라도 같다', () => {
  // 차이가 없다고 판정된 상태에서는 mergeCollectionById가 예전처럼 돈다(정상 경로).
  // 그때는 의미 있는 값이 모두 같으므로 최신 시각으로 어느 쪽을 골라도 결과가 같다.
  const local = baseLocal();
  const cloud = cloudOf(local);
  cloud.assets.forEach((a) => { a.updatedAt = 9e12; a.currentPrice = 111111; });
  assert.equal(asksUser(local, cloud), false);
  const merged = mergeCollectionById(clone(local.assets), clone(cloud.assets), new Set(local.assets.map((a) => a.id)));
  assert.deepEqual(ids(merged), ids(local.assets), '항목이 사라지거나 늘지 않는다');
  merged.forEach((m) => {
    const l = local.assets.find((a) => a.id === m.id);
    assert.equal(m.quantity, l.quantity, '의미 있는 값은 그대로다');
    assert.equal(m.owner, l.owner);
  });
});

test('정책. 차이가 있으면 앱이 고르지 않는다 - 판정은 hasMeaningfulDifference 하나뿐이다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '12-import-export-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/syncDifferenceNeedsReview/.test(src), 'v267 완화 판정 함수가 남아 있지 않다');
  const gate = src.match(/function gateIncomingSyncData\([\s\S]*?\n\}/)[0];
  assert.match(gate, /if \(!diff\.hasMeaningfulDifference\) \{ clearSyncDiffHold\(\); return 'ok'; \}/);
  assert.match(gate, /holdSyncForDifference\(parsed, remoteVersion, diff\);\s*\n\s*return 'held';/);
  // 게이트 안에서 updatedAt · 최신 우선으로 방향을 정하는 코드가 없다.
  assert.ok(!/updatedAt|lastWrite|newer/i.test(gate), '자동 우선순위 판정이 게이트에 없다');
});
