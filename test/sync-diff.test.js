// [P1-1 동기화 차이 확인] js/25 순수 비교 함수 검증 - 실제 js/01~10을 vm 샌드박스에 싣고 js/25를 그 위에서 실행한다
// (정규화 규칙 resolveImportedCategory · sanitize* · normalizeRebalanceState 등을 가짜로 만들지 않는다).
// 실행: node --test test/sync-diff.test.js
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = (() => {
  const sb = loadAdapterSandbox();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '25-sync-diff.js'), 'utf8'), sb, { filename: '25-sync-diff.js' });
  return sb;
})();

const clone = (x) => JSON.parse(JSON.stringify(x));
function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

// 합성 fixture(실제 사용자 데이터 아님)
const asset = (id, o = {}) => ({
  id, ticker: '005930.KS', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'user', name: '삼성전자',
  isDomestic: '국내', currency: 'KRW', quantity: 100, buyPrice: 70000, currentPrice: 80000, regularMarketPrice: 80000,
  positionSource: 'ledger', createdAt: 1000, updatedAt: 1000, ...o
});
const tx = (id, o = {}) => ({
  id, date: '2026-09-03', owner: '신랑', accountType: 'IRP', ticker: 'QQQM', name: 'NASDAQ', type: 'buy', quantity: 17,
  price: 250, currency: 'USD', appliedRate: 1390, fee: 0, origin: 'period', createdAt: 1000, updatedAt: 1000, ...o
});
function base() {
  return {
    assets: [
      asset('a1'),
      asset('a2', { ticker: 'QQQM', name: 'NASDAQ', accountType: 'IRP', currency: 'USD', isDomestic: '해외', category: 'ETF', quantity: 527, buyPrice: 200, buyRate: 1350 })
    ],
    transactions: [tx('t1'), tx('t2', { type: 'sell', quantity: 3 })],
    rebalance: clone(SB.state.rebalance),
    projection: clone(SB.state.projection)
  };
}
// 다른 기기가 올린 클라우드 데이터 = buildSyncBlob 모양의 JSON 왕복본
const cloudOf = (local) => ({
  app: 'smart-asset-manager', exportedAt: '2026-09-15T00:00:00.000Z', exchangeRate: 1400, dailyChangeRate: 0,
  ...clone(local), dailySnapshots: {}, learnedTickerNames: {}, tickerRoles: {}
});
const sizes = (g) => [g.localOnly.length, g.cloudOnly.length, g.different.length];
// vm 샌드박스에서 만든 배열은 프로토타입이 달라 deepStrictEqual이 값이 같아도 실패한다 - 값만 비교한다.
const same = (actual, expected, msg) => assert.deepStrictEqual(clone(actual), clone(expected), msg);

test('1. 같은 데이터 - updatedAt · createdAt · 배열 순서 · 키 순서가 달라도 차이 없음', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.assets.reverse();
  cloud.transactions.reverse();
  cloud.assets = cloud.assets.map((a) => Object.fromEntries(Object.entries({ ...a, updatedAt: 999999, createdAt: 5 }).reverse()));
  cloud.transactions.forEach((t) => { t.updatedAt = 999999; t.createdAt = 7; });
  cloud.rebalance.updatedAt = 12345;
  cloud.projection = Object.fromEntries(Object.entries({ ...cloud.projection, updatedAt: 12345 }).reverse());
  assert.strictEqual(SB.validateSyncPayload(cloud).ok, true);
  const d = SB.compareSyncData(local, cloud);
  assert.strictEqual(d.hasMeaningfulDifference, false);
  same(sizes(d.assets), [0, 0, 0]);
  same(sizes(d.transactions), [0, 0, 0]);
  assert.strictEqual(d.rebalance.changed, false);
  assert.strictEqual(d.projection.changed, false);
});

test('2. 이 기기에만 있는 자산 · 클라우드에만 있는 자산을 실제 항목으로 돌려준다', () => {
  const local = base();
  const cloud = cloudOf(local);
  local.assets.push(asset('a-local', { name: '로컬전용', ticker: '000660.KS', quantity: 50 }));
  cloud.assets.push(asset('a-cloud', { name: 'SK하이닉스', ticker: '000660.KS', quantity: 50 }));
  const d = SB.compareSyncData(local, cloud);
  assert.strictEqual(d.hasMeaningfulDifference, true);
  same(sizes(d.assets), [1, 1, 0]);
  assert.strictEqual(d.assets.localOnly[0].id, 'a-local');
  same(SB.syncDiffItemLines('asset', d.assets.cloudOnly[0]), ['SK하이닉스 (000660.KS)', '신랑 · 일반계좌', '수량 50주']);
  same(SB.syncDiffEffectLines(d, 'pull'), [
    '이 기기에만 있는 자산 1건은 이 기기에서 사라집니다.',
    '클라우드에만 있는 자산 1건을 이 기기에 받아옵니다.'
  ]);
  same(SB.syncDiffEffectLines(d, 'push'), [
    '클라우드에만 있는 자산 1건은 클라우드에서 빠집니다.',
    '이 기기에만 있는 자산 1건을 클라우드에 올립니다.'
  ]);
});

test('3. 같은 자산의 수량이 다르면 그 필드만 양쪽 값으로 보여 준다', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.assets[1].quantity = 510;
  cloud.assets[1].updatedAt = 5000;
  const d = SB.compareSyncData(local, cloud);
  same(sizes(d.assets), [0, 0, 1]);
  const item = d.assets.different[0];
  assert.strictEqual(item.id, 'a2');
  same(item.fields.map((f) => f.field), ['quantity']);
  assert.strictEqual(SB.syncDiffValueText('quantity', item.fields[0].local, item.local), '527주');
  assert.strictEqual(SB.syncDiffValueText('quantity', item.fields[0].cloud, item.cloud), '510주');
  same(SB.syncDiffEffectLines(d, 'pull'), ['내용이 다른 자산 1건은 클라우드 내용으로 바뀝니다.']);
});

test('4. 같은 거래의 수량 · 단가가 다르면 거래 차이로 필드를 보여 준다', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.transactions[0].quantity = 20;
  cloud.transactions[0].price = 255.5;
  const d = SB.compareSyncData(local, cloud);
  same(sizes(d.transactions), [0, 0, 1]);
  const item = d.transactions.different[0];
  same(item.fields.map((f) => f.field), ['quantity', 'price']);
  assert.strictEqual(SB.syncDiffValueText('price', item.fields[1].cloud, item.cloud), '255.5달러');
  same(SB.syncDiffItemLines('transaction', item.local), ['2026-09-03 · NASDAQ (QQQM)', '신랑 · IRP · 매수', '수량 17 · 단가 250달러']);
});

test('5. 삭제 vs 수정 - 한쪽에만 남은 항목은 어느 방향이든 차이로 잡는다(자동으로 지우지 않게)', () => {
  const localDeleted = base();
  const cloudEdited = cloudOf(base());
  localDeleted.assets = localDeleted.assets.filter((a) => a.id !== 'a2');
  cloudEdited.assets[1].quantity = 600;
  const d1 = SB.compareSyncData(localDeleted, cloudEdited);
  assert.strictEqual(d1.hasMeaningfulDifference, true);
  same(d1.assets.cloudOnly.map((v) => v.id), ['a2']);

  const localEdited = base();
  const cloudDeleted = cloudOf(base());
  localEdited.transactions[1].quantity = 9;
  cloudDeleted.transactions = cloudDeleted.transactions.filter((t) => t.id !== 't2');
  const d2 = SB.compareSyncData(localEdited, cloudDeleted);
  assert.strictEqual(d2.hasMeaningfulDifference, true);
  same(d2.transactions.localOnly.map((v) => v.id), ['t2']);
});

test('6. 목표비중 · 미래예측 설정은 내용이 바뀌었을 때만 차이다(updatedAt · 추천 배지 기록은 제외)', () => {
  const local = base();
  const unchanged = cloudOf(local);
  unchanged.rebalance.updatedAt = 99;
  unchanged.projection.updatedAt = 99;
  unchanged.projection.cmaRecommendationStatus = { anything: { seenVersion: 3 } };
  assert.strictEqual(SB.compareSyncData(local, unchanged).hasMeaningfulDifference, false);

  const r = cloudOf(local);
  r.rebalance['신랑'].domestic['국내'] = 55;
  const dr = SB.compareSyncData(local, r);
  same([dr.rebalance.changed, dr.projection.changed, dr.hasMeaningfulDifference], [true, false, true]);

  const p = cloudOf(local);
  p.projection.monthlyContribution = Number(p.projection.monthlyContribution) + 1;
  const dp = SB.compareSyncData(local, p);
  same([dp.rebalance.changed, dp.projection.changed, dp.hasMeaningfulDifference], [false, true, true]);
  same(SB.syncDiffEffectLines(dp, 'pull'), ['미래예측 설정은 클라우드 값으로 바뀝니다.']);
  same(SB.syncDiffEffectLines(dp, 'push'), ['미래예측 설정도 이 기기 기준으로 올립니다.']);

  // 클라우드에 설정 자체가 없으면 받아도 바뀌지 않으므로 차이가 아니다
  const none = cloudOf(local);
  delete none.rebalance;
  delete none.projection;
  assert.strictEqual(SB.compareSyncData(local, none).hasMeaningfulDifference, false);
});

test('7. 시세 · 환율 · 일간변동률 같은 자동 갱신 값만 다르면 차이 없음', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.assets.forEach((a) => { a.currentPrice = 1; a.regularMarketPrice = 2; a.todayOpen = 3; a.todayHigh = 4; a.todayLow = 5; });
  cloud.exchangeRate = 1999;
  cloud.dailyChangeRate = 3.3;
  const d = SB.compareSyncData(local, cloud);
  assert.strictEqual(d.hasMeaningfulDifference, false);
});

test('8. 합집합 3종(일별 기록 · 역할 · 학습 종목명)만 다르면 차이 없음', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.dailySnapshots = { '2026-09-13': { total: { cur: 1 } } };
  cloud.tickerRoles = { QQQM: 'core' };
  cloud.learnedTickerNames = { QQQM: '다른 이름' };
  assert.strictEqual(SB.compareSyncData(local, cloud).hasMeaningfulDifference, false);
});

test('9. 모양이 잘못된 클라우드 데이터는 검사에서 거부한다(빈 목록으로 보지 않는다)', () => {
  const bad = [
    null, [], 'text',
    { assets: {}, transactions: [] },
    { transactions: [] },
    { assets: [], transactions: 'x' },
    { assets: [] },
    { assets: [{ name: 'id 없음' }], transactions: [] },
    { assets: [], transactions: [null] },
    { assets: [{ id: '' }], transactions: [] },
    { assets: [], transactions: [], rebalance: [] },
    { assets: [], transactions: [], projection: 'x' }
  ];
  bad.forEach((p) => assert.strictEqual(SB.validateSyncPayload(p).ok, false, JSON.stringify(p)));
  assert.strictEqual(SB.validateSyncPayload({ assets: [], transactions: [] }).ok, true);
  assert.strictEqual(SB.validateSyncPayload(cloudOf(base())).ok, true);
  assert.strictEqual(SB.validateSyncPayload({ assets: [{ id: 7 }], transactions: [], rebalance: null }).ok, true);
});

test('10. 입력 객체를 바꾸지 않는다(깊은 동결 입력으로 계산해도 예외 없음 · 결과 표시값은 복사본)', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.assets[0].quantity = 1;
  cloud.transactions.push(tx('t3'));
  cloud.rebalance['와이프'].domestic['해외'] = 10;
  const beforeLocal = JSON.stringify(local);
  const beforeCloud = JSON.stringify(cloud);
  deepFreeze(local);
  deepFreeze(cloud);
  const d = SB.compareSyncData(local, cloud);
  assert.strictEqual(d.hasMeaningfulDifference, true);
  assert.strictEqual(JSON.stringify(local), beforeLocal);
  assert.strictEqual(JSON.stringify(cloud), beforeCloud);
  assert.notStrictEqual(d.assets.different[0].local, local.assets[0]);
  SB.validateSyncPayload(cloud);
  SB.syncDiffSignature(d);
  SB.syncDiffEffectLines(d, 'pull');
});

test('11. 받는 쪽 정규화와 같은 규칙 - 동기화하면 같아지는 표기 차이는 차이가 아니다', () => {
  const local = base();
  local.assets[0].role = 'midfielder';
  local.assets[0].rateMatchOverride = undefined;
  local.assets[1].buyRate = 1350;
  const cloud = cloudOf(local);
  cloud.assets[0].role = '미드필더';                 // 라벨 → 같은 내부 키
  cloud.assets[0].rateMatchOverride = '  ';           // 빈 값 = 지정 안 함
  cloud.assets[0].ticker = ' 005930.KS ';            // 앞뒤 공백
  cloud.assets[1].buyRate = 1350 + 1e-10;            // 부동소수점 오차
  cloud.transactions[0].appliedRate = 1390;
  cloud.transactions[1].currency = 'KRW';            // KRW 거래의 적용 환율은 저장하지 않는다
  cloud.transactions[1].appliedRate = 1390;
  local.transactions[1].currency = 'KRW';
  local.transactions[1].appliedRate = undefined;
  delete cloud.assets[0].positionSource;
  delete local.assets[0].positionSource;
  assert.strictEqual(SB.compareSyncData(local, cloud).hasMeaningfulDifference, false);

  cloud.assets[0].positionSource = 'manual';
  const d = SB.compareSyncData(local, cloud);
  same(d.assets.different[0].fields.map((f) => f.field), ['positionSource']);
  assert.strictEqual(SB.syncDiffValueText('positionSource', 'manual'), '직접 입력');
  assert.strictEqual(SB.syncDiffValueText('positionSource', null), '없음');
});

test('12. 취소 판정용 서명 - 배열 순서와 무관하고, 차이 내용이 바뀌면 달라진다', () => {
  const local = base();
  const cloud = cloudOf(local);
  cloud.assets.push(asset('x1'), asset('x2'));
  const s1 = SB.syncDiffSignature(SB.compareSyncData(local, cloud));
  const reordered = clone(cloud);
  reordered.assets.reverse();
  assert.strictEqual(SB.syncDiffSignature(SB.compareSyncData(local, reordered)), s1);
  reordered.assets[0].quantity = 3; // a-계열이 아닌 x2/x1 중 하나(클라우드에만 있는 항목 내용 변경은 서명에 넣지 않는다)
  cloud.assets[0].quantity = 42;    // 양쪽에 있는 a1 내용이 달라짐
  assert.notStrictEqual(SB.syncDiffSignature(SB.compareSyncData(local, cloud)), s1);
});
