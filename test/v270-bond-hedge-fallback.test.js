/* [PM 결정 2026-09-24 · D-2 = A안] 외화 채권 환헤지의 폴백 규칙.
 *
 * 환헤지 값이 두 곳에 따로 있다 - `bondPosition.identity.hedgeStatus`와 `asset.fxHedgeStatus`.
 *
 * [MM-015 · PM 결정 ⓙ 2026-09-28] 둘은 **같은 상품에 관한 하나의 사실의 입력원 둘**이다.
 * 예전 규칙("레코드가 1순위 · 어긋나도 레코드가 이긴다")은 폐기됐다. 채권 분류는 이렇게 따른다.
 *   · 두 값이 같거나 한쪽만 있으면  그 값으로 확정 (source는 어디에 적혀 있는지의 표시다)
 *   · 두 값이 서로 다르면          CONFLICT · 분류하지 않음(UNCLASSIFIED) · 저장값은 양쪽 보존
 *   · 아무것도 없으면              UNRESOLVED (비헤지로 단정하지 않는다)
 *   · 원화 채권은 이 판단 자체를 하지 않는다(NOT_APPLICABLE)
 *
 * 앞부분은 js/29를 모듈로 직접 불러 순수 판정을 고정하고, 뒷부분은 실제 앱을 vm 샌드박스에
 * 그대로 실어 MC까지 흐르는지 확인한다(자산군 · CMA · MC 로직은 하나도 흉내 내지 않는다).
 * 보유 종목은 전부 합성(ZZ)이다.
 * 실행: node --test test/v270-bond-hedge-fallback.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const B = require('../js/29-bond-domain.js');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const pos = (identity, assetId) => B.makeBondPosition({
  assetId: assetId || 'ZZ-A1',
  identity: Object.assign({ instrumentName: 'ZZ 합성채권' }, identity),
  terms: { maturityDate: '2032-05-15', couponRate: 3.25 },
  holding: { owner: '신랑', account: '일반계좌' }, source: 'manual'
});

/* ══════════════ 1 · 2 · 9 · 원화 채권은 환헤지를 보지 않는다 ══════════════ */

test('D-2-1. 원화 채권 + 환헤지 없음 - 환헤지 판단 자체를 하지 않는다', () => {
  const p = pos({ currency: 'KRW', bondType: '국채' });
  const d = B.resolveBondHedgeStatusDetail(p);
  assert.deepStrictEqual([d.status, d.source], [null, 'NOT_APPLICABLE']);
  assert.strictEqual(B.resolveBondClass(p), B.BOND_CLASS.KR_GOV, '발행인 유형만으로 분류된다');
});

test('D-2-2. 원화 채권 + 환헤지 존재 - 분류에 쓰지 않는다', () => {
  const plain = pos({ currency: 'KRW', bondType: '회사채' });
  ['HEDGED', 'UNHEDGED'].forEach((h) => {
    const p = pos({ currency: 'KRW', bondType: '회사채', hedgeStatus: h });
    assert.strictEqual(B.resolveBondHedgeStatusDetail(p).source, 'NOT_APPLICABLE', h);
    assert.strictEqual(B.resolveBondClass(p), B.resolveBondClass(plain), `환헤지 ${h}가 원화 채권 분류를 바꿨다`);
  });
  // 자산 쪽 값이 있어도 마찬가지다.
  assert.strictEqual(B.resolveBondClass(plain, { id: 'ZZ-A1', fxHedgeStatus: 'HEDGED' }), B.BOND_CLASS.KR_CORP);
});

test('D-2-9. 원화 채권 전 유형 회귀 - 이전과 같은 분류가 나온다', () => {
  const expect = {
    '국채': 'KR_GOV', '국고채권': 'KR_GOV', '지방채': 'KR_GOV', '특수채': 'KR_GOV',
    '통안채': 'KR_GOV', '통화안정증권': 'KR_GOV',
    '회사채': 'KR_CORP', '금융채': 'KR_CORP', '은행채': 'KR_CORP', '기업어음': 'KR_CORP'
  };
  Object.entries(expect).forEach(([type, cls]) => {
    assert.strictEqual(B.resolveBondClass(pos({ currency: 'KRW', bondType: type })), B.BOND_CLASS[cls], type);
  });
  assert.strictEqual(B.resolveBondClass(pos({ currency: 'KRW', bondType: 'ZZ없는유형' })), B.BOND_CLASS.UNCLASSIFIED);
});

/* ══════════════ 3 · 4 · 5 · 7 · 외화 채권 우선순위 ══════════════ */

test('D-2-3. 외화 채권 + 채권 레코드에 환헤지 - 그 값을 쓴다', () => {
  const p = pos({ currency: 'USD', bondType: '국채', hedgeStatus: 'HEDGED' });
  const d = B.resolveBondHedgeStatusDetail(p);
  assert.deepStrictEqual([d.status, d.source, d.currency], ['HEDGED', 'bondPosition', 'USD']);
  assert.strictEqual(B.resolveBondClass(p), B.BOND_CLASS.FOREIGN_GOV_HEDGED);
});

test('D-2-4. 외화 채권 + 채권 레코드에 없음 + 자산에 있음 - 자산 값을 쓴다', () => {
  const p = pos({ currency: 'USD', bondType: '회사채' });
  const asset = { id: 'ZZ-A1', fxHedgeStatus: 'UNHEDGED' };
  const d = B.resolveBondHedgeStatusDetail(p, asset);
  assert.deepStrictEqual([d.status, d.source], ['UNHEDGED', 'asset']);
  assert.strictEqual(B.resolveBondClass(p, asset), B.BOND_CLASS.FOREIGN_CORP_UNHEDGED);
  // 예전에는 여기서 분류가 되지 않았다 - 그것이 이번에 고친 지점이다.
  assert.strictEqual(B.resolveBondClass(p), B.BOND_CLASS.UNCLASSIFIED, '자산을 못 찾으면 여전히 단정하지 않는다');
});

test('D-2-5. 외화 채권 + 둘 다 없음 - UNRESOLVED (비헤지로 단정하지 않는다)', () => {
  const p = pos({ currency: 'USD', bondType: '국채' });
  assert.deepStrictEqual(
    [B.resolveBondHedgeStatusDetail(p, { id: 'ZZ-A1' }).status, B.resolveBondHedgeStatusDetail(p, { id: 'ZZ-A1' }).source],
    [null, 'UNRESOLVED']);
  assert.strictEqual(B.resolveBondClass(p, { id: 'ZZ-A1' }), B.BOND_CLASS.UNCLASSIFIED);
  // 빈 문자열 · 알 수 없는 값도 없는 것과 같다(임의 해석 금지).
  ['', '   ', 'ZZ', 'yes', null, undefined].forEach((bad) => {
    assert.strictEqual(B.resolveBondHedgeStatusDetail(pos({ currency: 'USD', bondType: '국채', hedgeStatus: bad }),
      { id: 'ZZ-A1', fxHedgeStatus: bad }).status, null, JSON.stringify(bad));
  });
});

/* [MM-015 · PM 결정 ⓙ 2026-09-28 — 기대값 변경] 예전 기대값은 "언제나 채권 레코드 쪽이 이긴다"
 * (status=레코드값 · source='bondPosition' · bondClass=HEDGED/UNHEDGED)였다.
 * PM 결정으로 §60-2의 그 규칙이 폐기됐다 - 같은 상품에 관한 하나의 사실을 두 곳에 적어 둔 것이므로
 * 어긋나면 **어느 쪽도 자동 채택하지 않는다**. 충돌 케이스 자체는 그대로 두고 기대값만 바꾼다. */
test('D-2-7. 두 값이 모두 있고 서로 다르면 어느 쪽도 채택하지 않는다(CONFLICT)', () => {
  const pairs = [['HEDGED', 'UNHEDGED'], ['UNHEDGED', 'HEDGED']];
  pairs.forEach(([own, onAsset]) => {
    const p = pos({ currency: 'USD', bondType: '국채', hedgeStatus: own });
    const asset = { id: 'ZZ-A1', fxHedgeStatus: onAsset };
    // 여러 번 불러도 같은 답이다(순서 · 호출 횟수에 흔들리지 않는다).
    for (let i = 0; i < 5; i += 1) {
      const d = B.resolveBondHedgeStatusDetail(p, asset);
      assert.deepStrictEqual([d.status, d.source], [null, 'INSTRUMENT_CONFLICT'], `${own}/${onAsset}`);
      assert.strictEqual(d.conflict, true, `${own}/${onAsset} - 충돌 사실을 말한다`);
    }
    // 확정하지 못했으므로 분류도 하지 않는다 - 기존 미확인 처리구조(UNCLASSIFIED)를 그대로 쓴다.
    assert.strictEqual(B.resolveBondClass(p, asset), B.BOND_CLASS.UNCLASSIFIED, `${own}/${onAsset}`);
    // 저장된 두 값은 어느 쪽도 지우거나 바꾸지 않는다(migration 없음).
    assert.strictEqual(p.identity.hedgeStatus, own);
    assert.strictEqual(asset.fxHedgeStatus, onAsset);
  });
});

/* 같은 값이 두 곳에 적혀 있으면 충돌이 아니다 - 확정한다(정상 경로가 막히지 않는 것을 고정한다). */
test('D-2-7b. 두 값이 모두 있고 서로 같으면 그대로 확정한다', () => {
  ['HEDGED', 'UNHEDGED'].forEach((v) => {
    const p = pos({ currency: 'USD', bondType: '국채', hedgeStatus: v });
    const asset = { id: 'ZZ-A1', fxHedgeStatus: v };
    const d = B.resolveBondHedgeStatusDetail(p, asset);
    assert.deepStrictEqual([d.status, d.source], [v, 'bondPosition'], v);
    assert.ok(!d.conflict, v);
    assert.strictEqual(B.resolveBondClass(p, asset),
      v === 'HEDGED' ? B.BOND_CLASS.FOREIGN_GOV_HEDGED : B.BOND_CLASS.FOREIGN_GOV_UNHEDGED);
  });
});

test('D-2. 환헤지가 있어도 발행인 유형이 없으면 여전히 분류하지 않는다', () => {
  const p = pos({ currency: 'USD' });
  assert.strictEqual(B.resolveBondHedgeStatusDetail(p, { id: 'ZZ-A1', fxHedgeStatus: 'HEDGED' }).status, 'HEDGED');
  assert.strictEqual(B.resolveBondClass(p, { id: 'ZZ-A1', fxHedgeStatus: 'HEDGED' }), B.BOND_CLASS.UNCLASSIFIED);
});

/* ══════════════ 6 · 8 · 10 · 실제 앱에서 끝까지 흐르는지 ══════════════ */

function sandboxWithFxBond(bondIdentity, assetOverride) {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 100, '해외': 0 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });

  const equity = sb.makeAsset({ ticker: '005930', name: 'ZZ 국내주식', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내' });
  const bond = sb.makeAsset(Object.assign({
    ticker: '', name: 'ZZ 외화채권', category: '채권', owner: '신랑', accountType: '일반계좌',
    quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'USD', isDomestic: '해외',
    positionSource: 'ledger'
  }, assetOverride || {}));
  S.assets = [equity, bond];
  S.bondPositions = [sb.evalInSandbox('makeBondPosition')({
    assetId: bond.id,
    identity: Object.assign({ instrumentName: 'ZZ 외화채권', currency: 'USD' }, bondIdentity || {}),
    terms: { issueDate: '2024-03-10', maturityDate: '2032-05-15', couponRate: 4, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: '신랑', account: '일반계좌', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  })];
  S.rebalance['신랑'].targets['국내'] = [
    { type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 50 },
    { type: 'namedHolding', label: 'ZZ 외화채권', name: 'ZZ 외화채권', pct: 50 }
  ];
  sb.getCachedDailyCloses = async () => null;
  return sb;
}

const runMc = (sb) => sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
const bondInstrument = (r) => r.cma.instruments.find((i) => i.label === 'ZZ 외화채권');

test('D-2-6. 거래내역 기반 외화 채권 - 자산의 환헤지만으로 MC까지 정상 분류된다', async () => {
  // 거래 폼에서 고른 값은 자산에 저장된다(js/06). 채권 레코드에는 환헤지 칸이 닿지 않는다(BL-8).
  const sb = sandboxWithFxBond({ bondType: '국채' }, { fxHedgeStatus: 'HEDGED' });
  // 자산을 인자로 넘기지 않아도 같은 답이 나와야 한다 - 화면마다 갈라지면 안 된다.
  assert.strictEqual(sb.evalInSandbox('resolveBondClass(state.bondPositions[0])'), 'FOREIGN_GOV_HEDGED');
  assert.strictEqual(sb.evalInSandbox('resolveBondHedgeStatusDetail(state.bondPositions[0]).source'), 'asset');

  const r = await runMc(sb);
  assert.deepStrictEqual(Array.from(r.errors), []);
  const bond = bondInstrument(r);
  assert.strictEqual(bond.appClass, 'FOREIGN_GOV_BOND_HEDGED');
  assert.strictEqual(bond.appClassBasis, 'bondLedger');
  assert.strictEqual(bond.riskFree, false, '분류됐으므로 더 이상 σ=0이 아니다');
  assert.ok(bond.volatilityPct > 0);
  assert.strictEqual(r.bondsWithoutRiskAssumption.length, 0, '경고가 남아 있으면 안 된다');
});

test('D-2-10. MC 변화는 hedgeStatus → 자산군 → 기존 로직의 결과다(변경 전/후 추적 가능)', async () => {
  const before = await runMc(sandboxWithFxBond({ bondType: '국채' }, {}));           // 환헤지 없음
  const after = await runMc(sandboxWithFxBond({ bondType: '국채' }, { fxHedgeStatus: 'HEDGED' }));

  const b = bondInstrument(before), a = bondInstrument(after);
  // 달라진 것은 자산군 하나뿐이고, σ는 그 자산군의 공식 값이다(임의 조정이 아니다).
  assert.strictEqual(b.appClass, 'BOND');
  assert.strictEqual(a.appClass, 'FOREIGN_GOV_BOND_HEDGED');
  assert.strictEqual(b.volatilityPct ?? 0, 0, '미분류 채권은 예전대로 σ=0이다');
  assert.ok(a.volatilityPct > 0);
  const rt = require('../js/27-cma-runtime.js');
  const { CMA_ACTIVE_SET } = require('../js/26-cma-data.js');
  const official = rt.resolveCmaRiskForAppClass('FOREIGN_GOV_BOND_HEDGED', CMA_ACTIVE_SET);
  assert.strictEqual(official.status, 'MAPPED');
  assert.ok(Math.abs(a.volatilityPct - official.volatilityPct) < 1e-9,
    `σ가 공식 장기가정 값과 다르다: ${a.volatilityPct} vs ${official.volatilityPct}`);
  // 수익률(μ)과 비중은 그대로다 - 이번 변경은 자산군(σ · 상관)에만 닿는다.
  assert.strictEqual(a.returnKey, b.returnKey);
  assert.strictEqual(a.weight, b.weight);
  // 함께 담긴 국내주식은 한 글자도 달라지지 않는다.
  const eqB = before.cma.instruments.find((i) => i.label === 'ZZ 국내주식');
  const eqA = after.cma.instruments.find((i) => i.label === 'ZZ 국내주식');
  assert.deepStrictEqual(
    { c: eqA.appClass, v: eqA.volatilityPct, w: eqA.weight },
    { c: eqB.appClass, v: eqB.volatilityPct, w: eqB.weight });
});

test('D-2-8. 주식 · ETF의 환헤지 동작은 그대로다(채권 규칙이 번지지 않는다)', () => {
  const sb = loadAdapterSandbox();
  // 환헤지 선택 UI 판정 - 채권 폴백과 무관하게 이전 규칙 그대로다.
  const cases = [
    [{ ticker: '005930.KS', category: '주식', currency: 'KRW', isDomestic: '국내' }, false],
    [{ ticker: '069500.KS', category: 'ETF', currency: 'KRW', isDomestic: '국내' }, false],
    [{ ticker: '360750.KS', category: 'ETF', currency: 'KRW', isDomestic: '해외' }, true],
    /* [PM 지시 2026-09-26 · 미결 2번] 해외 거래소 직접 상장은 묻지 않는다(환헤지형이 없다).
     * 이 테스트의 관심사는 "채권 폴백이 주식 · ETF로 번지지 않는다"이고 그 관심사는 그대로다. */
    [{ ticker: 'AAPL', category: '주식', currency: 'USD', isDomestic: '해외' }, false]
  ];
  cases.forEach(([a, want]) => {
    assert.strictEqual(sb.evalInSandbox(`shouldOfferFxHedgeChoice(${JSON.stringify(a)})`), want, a.ticker);
  });
  // 미국 주식의 환헤지 자산군 전환(applyUserHedgeToAppClass)은 asset.fxHedgeStatus만 본다 - 무변경.
  const usd = { ticker: 'AAPL', category: '주식', currency: 'USD', isDomestic: '해외' };
  assert.strictEqual(sb.evalInSandbox(`applyUserHedgeToAppClass('US_EQUITY', ${JSON.stringify(usd)})`), null,
    '환헤지를 고르지 않았으면 아무것도 하지 않는다');
  assert.strictEqual(
    sb.evalInSandbox(`applyUserHedgeToAppClass('KR_EQUITY', ${JSON.stringify(Object.assign({ fxHedgeStatus: 'HEDGED' }, usd))})`),
    null, '국내 주식에는 환헤지 자산군이 없다');
});

/* [MM-015 · PM 결정 ⓙ 2026-09-28 — 기대값 변경] 예전 기대값은 분류 `FOREIGN_GOV_UNHEDGED`
 * ("레코드 값이 자산 값으로 덮이지 않는다")였다. 이제는 두 값이 어긋나면 분류하지 않는다 -
 * 레코드가 자산에 덮이는 것도, 자산이 레코드에 덮이는 것도 아니다(어느 쪽도 채택하지 않는다).
 * **저장된 두 값이 그대로 남는다는 단언은 그대로 유지한다** - 이것이 이 테스트의 원래 목적이다. */
test('D-2. 두 값이 어긋나면 분류하지 않되 저장된 사용자 선택은 양쪽 다 보존한다', () => {
  const sb = sandboxWithFxBond({ bondType: '국채', hedgeStatus: 'UNHEDGED' }, { fxHedgeStatus: 'HEDGED' });
  assert.strictEqual(sb.evalInSandbox('resolveBondClass(state.bondPositions[0])'), 'UNCLASSIFIED');
  assert.strictEqual(sb.evalInSandbox('resolveBondHedgeStatusDetail(state.bondPositions[0]).source'), 'INSTRUMENT_CONFLICT');
  // 폴백은 읽기만 한다 - 저장된 두 값 어느 쪽도 바뀌지 않는다.
  assert.strictEqual(sb.evalInSandbox('state.bondPositions[0].identity.hedgeStatus'), 'UNHEDGED');
  assert.strictEqual(sb.evalInSandbox("state.assets.find((a) => a.category === '채권').fxHedgeStatus"), 'HEDGED');
});
