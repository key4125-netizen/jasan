/* [PM 결정 2026-09-24 · D-3 = B안] 채권 레코드가 동기화 차이 검사에 포함된다.
 *
 * 무엇을 고정하는가
 *   · 채권이 같으면 차이가 아니다(불필요한 확인 화면을 띄우지 않는다)
 *   · 만기 · 쿠폰 · 발행인 유형 · 환헤지 · 표준코드 등 저장되는 값이 다르면 차이다
 *   · 비교 대상을 손으로 적지 않는다 - makeBondPosition이 저장하는 값 전부가 대상이다
 *   · 자산 · 거래 · 목표비중 · 미래예측의 기존 판정은 달라지지 않는다
 *
 * 실제 js/01~10 · 29를 vm 샌드박스에 싣고 그 위에서 js/25를 돌린다(정규화 규칙을 가짜로 만들지 않는다).
 * 합성 데이터만 쓴다(ZZ 접두어 · 공개 표준코드 형식).
 * 실행: node --test test/v270-sync-bond-diff.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = (() => {
  const sb = loadAdapterSandbox();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '25-sync-diff.js'), 'utf8'), sb, { filename: '25-sync-diff.js' });
  return sb;
})();

const ISIN = 'KR103502G990';
const asset = (id) => ({
  id, ticker: '005930.KS', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'user',
  name: 'ZZ국내주식', isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 70000, positionSource: 'manual'
});
const tx = (id) => ({
  id, date: '2026-01-02', name: 'ZZ국내주식', ticker: '005930.KS', owner: '신랑', accountType: '일반계좌',
  type: 'buy', quantity: 10, price: 70000, currency: 'KRW', fee: 0, origin: 'period'
});
// 저장 구조 그대로의 채권 레코드(makeBondPosition이 받는 모양).
const bond = (over) => JSON.parse(JSON.stringify(Object.assign({
  id: 'ZZ-BOND-1', assetId: 'ZZ-A1',
  identity: { isin: ISIN, instrumentName: 'ZZ국고채권 23-5', issuer: 'ZZ발행인', currency: 'KRW', bondType: '국채', creditRating: 'AAA', hedgeStatus: null },
  terms: { issueDate: '2023-06-10', maturityDate: '2033-06-10', couponRate: 3.25, couponType: 'COUPON', paymentFrequency: 2, paymentDates: [] },
  holding: { owner: '신랑', account: '일반계좌', purchaseDate: '2024-03-10', faceAmount: 10000000, purchaseAmount: 9800000 },
  source: {}, userOverride: {}, updatedAt: 1000
}, over || {})));

const blob = (bonds, over) => Object.assign({
  assets: [asset('ZZ-A1')], transactions: [tx('ZZ-T1')],
  bondPositions: bonds === undefined ? [bond()] : bonds
}, over || {});

const compare = (local, cloud) => SB.evalInSandbox('compareSyncData')(local, cloud);
const bondSize = (d) => d.bondPositions.localOnly.length + d.bondPositions.cloudOnly.length + d.bondPositions.different.length;

/* ══════════════ 1. 같으면 차이가 아니다 ══════════════ */

test('D-3-1. 채권이 같으면 차이가 아니다', () => {
  const d = compare(blob(), blob());
  assert.strictEqual(bondSize(d), 0);
  assert.strictEqual(d.hasMeaningfulDifference, false);
});

test('D-3-12. 같은 데이터에서는 확인 화면을 부르지 않는다 - updatedAt · 표기 차이는 차이가 아니다', () => {
  // updatedAt은 비교하지 않는다(기존 원칙).
  assert.strictEqual(compare(blob(), blob([bond({ updatedAt: 9999999 })])).hasMeaningfulDifference, false);
  // 받는 쪽 정규화로 같아지는 표기 차이 - 소문자 표준코드 · 앞뒤 공백 · 통화 소문자.
  const messy = bond();
  messy.identity.isin = ISIN.toLowerCase();
  messy.identity.instrumentName = '  ZZ국고채권 23-5  ';
  messy.identity.currency = 'krw';
  assert.strictEqual(compare(blob(), blob([messy])).hasMeaningfulDifference, false,
    '동기화하면 같아지는 표기 차이를 차이로 보면 사용자가 매번 선택을 강요받는다');
});

/* ══════════════ 2~6. 실제 값이 다르면 차이다 ══════════════ */

const changes = [
  ['D-3-2. 만기 변경', { terms: Object.assign(bond().terms, { maturityDate: '2035-06-10' }) }, 'terms.maturityDate'],
  ['D-3-3. 쿠폰 변경', { terms: Object.assign(bond().terms, { couponRate: 4.5 }) }, 'terms.couponRate'],
  ['D-3-4. 발행인 유형 변경', { identity: Object.assign(bond().identity, { bondType: '회사채' }) }, 'identity.bondType'],
  ['D-3-5. 환헤지 변경', { identity: Object.assign(bond().identity, { currency: 'USD', hedgeStatus: 'HEDGED' }) }, 'identity.hedgeStatus'],
  ['D-3-6. 표준코드(ISIN) 변경', { identity: Object.assign(bond().identity, { isin: 'KR000000ZZ01' }) }, 'identity.isin']
];
changes.forEach(([label, over, field]) => {
  test(`${label} → 차이로 감지된다`, () => {
    const d = compare(blob(), blob([bond(over)]));
    assert.strictEqual(d.hasMeaningfulDifference, true, '차이를 놓치면 사용자 모르게 병합된다');
    assert.strictEqual(d.bondPositions.different.length, 1);
    const fields = d.bondPositions.different[0].fields.map((f) => f.field);
    assert.ok(fields.includes(field), `${field}가 달라진 항목으로 잡히지 않았다: ${fields.join(', ')}`);
  });
});

test('D-3. 나머지 저장 항목도 전부 비교 대상이다(목록을 손으로 적지 않는다)', () => {
  const rest = [
    [{ identity: Object.assign(bond().identity, { issuer: 'ZZ다른발행인' }) }, 'identity.issuer'],
    [{ identity: Object.assign(bond().identity, { creditRating: 'AA' }) }, 'identity.creditRating'],
    [{ identity: Object.assign(bond().identity, { seniority: '후순위' }) }, 'identity.seniority'],
    [{ terms: Object.assign(bond().terms, { issueDate: '2023-07-10' }) }, 'terms.issueDate'],
    [{ terms: Object.assign(bond().terms, { couponType: 'DISCOUNT' }) }, 'terms.couponType'],
    [{ terms: Object.assign(bond().terms, { paymentFrequency: 4 }) }, 'terms.paymentFrequency'],
    [{ terms: Object.assign(bond().terms, { paymentDates: ['2026-06-10'] }) }, 'terms.paymentDates'],
    [{ holding: Object.assign(bond().holding, { faceAmount: 20000000 }) }, 'holding.faceAmount'],
    [{ holding: Object.assign(bond().holding, { purchaseDate: '2024-04-01' }) }, 'holding.purchaseDate'],
    [{ holding: Object.assign(bond().holding, { owner: '와이프' }) }, 'holding.owner'],
    [{ holding: Object.assign(bond().holding, { account: 'ISA' }) }, 'holding.account'],
    [{ holding: Object.assign(bond().holding, { soldDate: '2026-01-05' }) }, 'holding.soldDate'],
    [{ assetId: 'ZZ-A9' }, 'assetId'],
    [{ userOverride: { couponRate: 9 } }, 'userOverride']
  ];
  rest.forEach(([over, field]) => {
    const d = compare(blob(), blob([bond(over)]));
    assert.strictEqual(d.hasMeaningfulDifference, true, field);
    const fields = d.bondPositions.different[0].fields.map((f) => f.field);
    assert.ok(fields.includes(field), `${field}가 비교되지 않는다`);
  });
});

test('D-3. 비교 필드 목록이 저장 구조에서 파생된다 - updatedAt과 id만 빠진다', () => {
  const fields = SB.evalInSandbox('syncDiffBondFields()');
  const sample = SB.evalInSandbox('makeBondPosition')({});
  const expected = [];
  ['identity', 'terms', 'source', 'holding'].forEach((g) => Object.keys(sample[g]).forEach((k) => expected.push(`${g}.${k}`)));
  expected.push('assetId', 'userOverride');
  assert.deepStrictEqual(Array.from(fields).sort(), expected.sort());
  assert.ok(!fields.includes('updatedAt'), 'updatedAt은 기존 원칙대로 비교하지 않는다');
  assert.ok(!fields.includes('id'), 'id는 짝을 짓는 키라 값 비교에서 뺀다');
});

/* ══════════════ 한쪽에만 있는 채권 ══════════════ */

test('D-3-11. 한쪽에만 있는 채권도 차이다 - 조용히 병합되지 않는다', () => {
  const onlyLocal = compare(blob(), blob([]));
  assert.strictEqual(onlyLocal.bondPositions.localOnly.length, 1);
  assert.strictEqual(onlyLocal.hasMeaningfulDifference, true);

  const onlyCloud = compare(blob([]), blob());
  assert.strictEqual(onlyCloud.bondPositions.cloudOnly.length, 1);
  assert.strictEqual(onlyCloud.hasMeaningfulDifference, true);
});

test('D-3. 채권 키가 없는 구버전 클라우드 데이터는 차이로 보지 않는다', () => {
  // 받아도 이 기기 채권이 바뀌지 않는다(js/12가 병합을 건너뛴다) - 목표비중 · 미래예측과 같은 규칙.
  const legacy = { assets: [asset('ZZ-A1')], transactions: [tx('ZZ-T1')] };
  const d = compare(blob(), legacy);
  assert.strictEqual(bondSize(d), 0);
  assert.strictEqual(d.hasMeaningfulDifference, false);
});

/* ══════════════ 다른 묶음에 영향 없음 ══════════════ */

test('D-3-10. 자산 · 거래 · 목표비중 · 미래예측의 기존 판정은 그대로다', () => {
  // 채권만 다를 때 다른 묶음은 비어 있어야 한다.
  const d = compare(blob(), blob([bond({ terms: Object.assign(bond().terms, { couponRate: 9 }) })]));
  assert.deepStrictEqual(
    [d.assets.localOnly.length, d.assets.cloudOnly.length, d.assets.different.length], [0, 0, 0]);
  assert.deepStrictEqual(
    [d.transactions.localOnly.length, d.transactions.cloudOnly.length, d.transactions.different.length], [0, 0, 0]);
  assert.strictEqual(d.rebalance.changed, false);
  assert.strictEqual(d.projection.changed, false);

  // 반대로 자산만 다를 때 채권 묶음은 비어 있어야 한다.
  const a2 = Object.assign(asset('ZZ-A1'), { quantity: 99 });
  const d2 = compare(blob(), blob(undefined, { assets: [a2] }));
  assert.strictEqual(d2.assets.different.length, 1);
  assert.strictEqual(bondSize(d2), 0);
});

/* ══════════════ 확인 화면에 쓰는 값 ══════════════ */

test('D-3. 차이 서명에 채권이 들어간다 - 같은 차이로 화면을 다시 띄우지 않는다', () => {
  const same = compare(blob(), blob());
  const diff = compare(blob(), blob([bond({ terms: Object.assign(bond().terms, { couponRate: 9 }) })]));
  const sig = SB.evalInSandbox('syncDiffSignature');
  assert.notStrictEqual(sig(same), sig(diff), '채권만 달라졌는데 서명이 같으면 확인 화면이 뜨지 않는다');
  assert.strictEqual(sig(diff), sig(compare(blob(), blob([bond({ terms: Object.assign(bond().terms, { couponRate: 9 }) })]))),
    '같은 차이는 같은 서명이어야 한다');
});

test('D-3. 화면 문구가 사람이 읽는 말이다', () => {
  const d = compare(blob(), blob([bond({ identity: Object.assign(bond().identity, { bondType: '회사채' }) })]));
  const lines = SB.evalInSandbox('syncDiffItemLines')('bond', d.bondPositions.different[0].local);
  assert.match(lines[0], /ZZ국고채권 23-5/);
  assert.match(lines[0], new RegExp(ISIN));
  assert.match(lines[1], /신랑 · 일반계좌/);
  assert.match(lines[2], /만기 2033-06-10/);

  const labels = SB.evalInSandbox('SYNC_DIFF_FIELD_LABELS');
  assert.strictEqual(labels['identity.bondType'], '발행인 유형');
  assert.strictEqual(labels['identity.hedgeStatus'], '환헤지');
  const valueText = SB.evalInSandbox('syncDiffValueText');
  assert.strictEqual(valueText('identity.hedgeStatus', 'HEDGED'), '환헤지');
  assert.strictEqual(valueText('identity.hedgeStatus', 'UNHEDGED'), '환노출');

  // 버튼 아래 안내에 채권 건수가 들어간다.
  const pull = SB.evalInSandbox('syncDiffEffectLines')(d, 'pull').join(' ');
  assert.match(pull, /채권 정보 1건/);
});

test('D-3. 채권 차이가 없으면 안내 문구에 채권이 등장하지 않는다(기존 문구 유지)', () => {
  const a2 = Object.assign(asset('ZZ-A1'), { quantity: 99 });
  const d = compare(blob(), blob(undefined, { assets: [a2] }));
  const lines = SB.evalInSandbox('syncDiffEffectLines')(d, 'pull').join(' ');
  assert.ok(!/채권/.test(lines), lines);
});

/* ══════════════ payload 모양 검사 ══════════════ */

test('D-3. 모양이 잘못된 채권 데이터는 받지도 병합하지도 않는다', () => {
  const validate = SB.evalInSandbox('validateSyncPayload');
  assert.strictEqual(validate(blob()).ok, true);
  assert.strictEqual(validate({ assets: [], transactions: [] }).ok, true, '채권 키가 없는 구버전은 통과한다');
  // 샌드박스가 돌려준 객체라 프로토타입이 다르다 - 값만 본다.
  const bad1 = validate(Object.assign(blob(), { bondPositions: 'nope' }));
  assert.deepStrictEqual([bad1.ok, bad1.reason], [false, 'bondPositionsNotArray']);
  const bad2 = validate(Object.assign(blob(), { bondPositions: [{ identity: {} }] }));
  assert.deepStrictEqual([bad2.ok, bad2.reason], [false, 'bondPositionWithoutId']);
});
