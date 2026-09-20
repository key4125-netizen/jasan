// [BOND-4 · §47-3] 채권 → MC 자산군 연결 (PM EXECUTION DIRECTIVE 2026-09-20 §5)
//
// 무엇을 고정하는가:
//   ① 분류된 채권은 공식 장기가정(J.P. Morgan LTCMA KRW)에서 변동성을 받는다 - 더 이상 σ=0이 아니다.
//   ② 분류 근거가 없는 채권은 변동성을 만들지 않되, 그 사실을 사용자에게 알린다(조용한 0 금지).
//   ③ 현금성은 기존 정책 그대로 σ=0이다(채권으로 취급하지 않는다).
//   ④ 원금은 사라지지 않는다 - 위험을 못 재는 것과 자산이 없어지는 것은 다르다.
// 실제 보유 종목은 쓰지 않는다(ZZ 합성).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');
const rt = require('../js/27-cma-runtime.js');
const { CMA_ACTIVE_SET } = require('../js/26-cma-data.js');

const JPM = 'J.P. Morgan Asset Management';

test('자산군 표: 채권 5종이 J.P. Morgan LTCMA KRW를 riskProvider로 쓴다(근거 문구 포함)', () => {
  const map = require(path.join(__dirname, '..', 'data', 'cma', 'app-asset-class-map.json'));
  const expected = {
    KR_GOV_BOND: 'Korean Government Bonds',
    KR_CORP_BOND: 'Korean Corporate Bonds',
    FOREIGN_GOV_BOND_HEDGED: 'World Government Bonds hedged',
    FOREIGN_GOV_BOND_UNHEDGED: 'World Government Bonds',
    FOREIGN_CORP_BOND_HEDGED: 'Global Credit hedged'
  };
  Object.entries(expected).forEach(([appClass, cmaClass]) => {
    const ac = map.appClasses[appClass];
    assert.ok(ac, `${appClass} 연결이 없다`);
    assert.strictEqual(ac.riskProvider, JPM, appClass);
    assert.strictEqual(ac.providers[JPM].class, cmaClass, appClass);
    assert.ok(ac.providers[JPM].evidence && ac.providers[JPM].evidence.length > 20, `${appClass} 근거 문구가 없다`);
  });
  // 비헤지 글로벌 크레딧은 원문에 없으므로 연결하지 않는다 - 가까운 자산군으로 옮겨 쓰지 않는다.
  assert.ok(!map.appClasses.FOREIGN_CORP_BOND_UNHEDGED);
  assert.ok(map.unmapped.FOREIGN_CORP_BOND_UNHEDGED.includes('연결하지 않는다'));
});

test('변동성 해석: 분류된 채권은 JPM 원문 값을 그대로 쓰고, 미분류 · 현금은 자산군이 없다', () => {
  const gov = rt.resolveCmaRiskForAppClass('KR_GOV_BOND', CMA_ACTIVE_SET);
  assert.strictEqual(gov.status, 'MAPPED');
  assert.strictEqual(gov.cmaClass, 'Korean Government Bonds');
  assert.ok(Math.abs(gov.volatilityPct - 5.357291318235813) < 1e-9, String(gov.volatilityPct));
  assert.strictEqual(gov.riskProvider, JPM);
  // Benchmark Dataset의 기대수익률은 MC 수익률 경로를 열지 않는다(§37-5 유지).
  assert.strictEqual(gov.returnUsableForMc, false);

  const corp = rt.resolveCmaRiskForAppClass('KR_CORP_BOND', CMA_ACTIVE_SET);
  assert.ok(Math.abs(corp.volatilityPct - 2.539956328818818) < 1e-9);

  // 분류 근거가 없는 채권 · 비헤지 글로벌 크레딧 · 현금은 자산군이 없다(사유 문구가 있다).
  ['BOND', 'FOREIGN_CORP_BOND_UNHEDGED', 'CASH'].forEach((k) => {
    const r = rt.resolveCmaRiskForAppClass(k, CMA_ACTIVE_SET);
    assert.strictEqual(r.status, 'UNMAPPED', k);
    assert.ok(r.reason && r.reason.length > 10, k);
  });
});

test('상관: 채권↔주식은 Benchmark 원문 값이고, 같은 자산군끼리는 정확히 1이다', () => {
  const c = rt.resolveCmaCorrelation('KR_GOV_BOND', 'KR_EQUITY', CMA_ACTIVE_SET);
  assert.strictEqual(c.sourceType, 'BENCHMARK_REFERENCE');
  assert.ok(typeof c.value === 'number' && c.value > -1 && c.value < 1);
  // 원문 대각 원소가 1.0000000000000002로 내려오더라도 1로 확정한다(상관행렬 분해가 깨지지 않도록).
  assert.strictEqual(rt.resolveCmaCorrelation('KR_GOV_BOND', 'KR_GOV_BOND', CMA_ACTIVE_SET).value, 1);
});

/* ── 어댑터 경로: 채권 레코드가 있으면 σ가 붙고, 없으면 알린다 ─────────── */

function sandboxWithBond(bondFields) {
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
  const bond = sb.makeAsset({ ticker: '', name: 'ZZ 합성채권', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내' });
  S.assets = [equity, bond];
  S.bondPositions = bondFields ? [sb.evalInSandbox('makeBondPosition')(Object.assign({ assetId: bond.id }, bondFields))] : [];
  S.rebalance['신랑'].targets['국내'] = [
    { type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 50 },
    { type: 'namedHolding', label: 'ZZ 합성채권', name: 'ZZ 합성채권', pct: 50 }
  ];
  sb.getCachedDailyCloses = async () => null;
  return sb;
}

test('분류된 국공채: σ가 0이 아니라 공식 값이 되고, 경고는 생기지 않는다', async () => {
  const sb = sandboxWithBond({
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'KRW' },
    terms: { issueDate: '2024-03-10', maturityDate: '2034-03-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  });
  const r = await sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
  assert.deepStrictEqual(Array.from(r.errors), []);
  const bond = r.cma.instruments.find((i) => i.label === 'ZZ 합성채권');
  assert.ok(bond, 'instrument 목록에 채권이 없다 - 원금이 사라지면 안 된다');
  assert.strictEqual(bond.appClass, 'KR_GOV_BOND');
  assert.strictEqual(bond.appClassBasis, 'bondLedger');
  assert.strictEqual(bond.riskFree, false);
  assert.ok(Math.abs(bond.volatilityPct - 5.357291318235813) < 1e-9, String(bond.volatilityPct));
  assert.strictEqual(r.bondsWithoutRiskAssumption.length, 0);
});

test('미분류 채권: σ는 만들지 않지만 자산은 남고, 이유를 사용자에게 알린다', async () => {
  const sb = sandboxWithBond(null); // 채권 레코드 없음 = 발행인 유형 · 통화 · 환헤지 미확인
  const r = await sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
  assert.deepStrictEqual(Array.from(r.errors), []);
  const idx = r.assetOrder.findIndex((k) => k.includes('ZZ 합성채권'));
  assert.ok(idx >= 0, 'universe에서 빼면 채권 원금이 미래예측에서 사라진다');
  assert.strictEqual(r.instruments[idx].sigmaAnnual, 0);
  assert.ok(r.instruments[idx].weight > 0, '비중은 그대로 유지된다');
  // 조용히 0으로 두지 않는다 - 이유를 남긴다.
  assert.strictEqual(r.bondsWithoutRiskAssumption.length, 1);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].reason, 'BOND_CLASS_UNRESOLVED');
  const issue = r.safety.dataQuality.issues.find((i) => i.code === 'BOND_RISK_ASSUMPTION_UNRESOLVED');
  assert.ok(issue, '안내가 없다');
  assert.match(issue.message, /위험이 없다"는 뜻이 아니라/);
});

test('환헤지 미확인 외화채: 헤지로도 비헤지로도 단정하지 않고 위험 미반영으로 남긴다', async () => {
  const sb = sandboxWithBond({
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'USD' }, // hedgeStatus 없음
    terms: { issueDate: '2024-03-10', maturityDate: '2032-05-15', couponRate: 4, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  });
  const r = await sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
  assert.deepStrictEqual(Array.from(r.errors), []);
  assert.strictEqual(r.bondsWithoutRiskAssumption.length, 1);
  const bond = r.cma.instruments.find((i) => i.label === 'ZZ 합성채권');
  assert.strictEqual(bond.appClass, 'BOND', '환헤지를 모르면 세분 성격을 붙이지 않는다');
});
