// [Bond Domain V1] 채권 사실 · 현금흐름 · 수익률 · 듀레이션 · MC 연결 (§47-7 · PM 지시 2026-09-20 §4)
//
// 원칙 검증이 목적이다: "값이 없으면 0이 아니라 계산 불가", "시세가 없어도 확정 계층과 듀레이션은
// 나온다", "자동 조회가 사용자 매입정보를 덮지 않는다". 실제 보유 종목은 쓰지 않는다(ZZ 합성).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/29-bond-domain.js');

const GOV = () => B.makeBondPosition({
  assetId: 'ZZA-1',
  identity: { isin: 'KRZZ00000001', instrumentName: 'ZZ 국고채권 10년(합성)', issuer: 'ZZ정부', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
  terms: { issueDate: '2024-03-10', maturityDate: '2034-03-10', faceValue: 10000, couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
  holding: { owner: '신랑', account: '일반계좌', faceAmount: 10000000, purchaseDate: '2024-03-10', purchaseAmount: 9800000 }
});
const ASOF = '2026-09-20';

test('스키마: 공식 조건(A)과 사용자 보유(B)를 섞지 않고, 통화 · 날짜를 정규화한다', () => {
  const p = GOV();
  assert.strictEqual(p.identity.isin, 'KRZZ00000001');
  assert.strictEqual(p.terms.maturityDate, '2034-03-10');
  assert.strictEqual(p.holding.faceAmount, 10000000);
  // 보유 정보는 identity · terms 어디에도 들어가지 않는다.
  assert.ok(!('faceAmount' in p.terms) && !('purchaseAmount' in p.identity));
  // 환헤지는 A등급 근거가 있을 때만 적힌다 - 기본은 null(비헤지로 단정하지 않는다).
  assert.strictEqual(p.identity.hedgeStatus, null);
});

test('채권 구분: 발행인 유형으로 정하고, 근거가 없으면 UNCLASSIFIED다(추정 금지)', () => {
  assert.strictEqual(B.resolveBondClass(GOV()), B.BOND_CLASS.KR_GOV);
  const corp = B.makeBondPosition({ identity: { bondType: '회사채', currency: 'KRW' } });
  assert.strictEqual(B.resolveBondClass(corp), B.BOND_CLASS.KR_CORP);
  const unknown = B.makeBondPosition({ identity: { bondType: '기타', currency: 'KRW' } });
  assert.strictEqual(B.resolveBondClass(unknown), B.BOND_CLASS.UNCLASSIFIED);
  // 외화채는 환헤지가 확인돼야 분류된다 - 미확인이면 헤지로도 비헤지로도 단정하지 않는다.
  const usd = B.makeBondPosition({ identity: { bondType: '국채', currency: 'USD' } });
  assert.strictEqual(B.resolveBondClass(usd), B.BOND_CLASS.UNCLASSIFIED);
  const usdH = B.makeBondPosition({ identity: { bondType: '국채', currency: 'USD', hedgeStatus: 'HEDGED' } });
  assert.strictEqual(B.resolveBondClass(usdH), B.BOND_CLASS.FOREIGN_GOV_HEDGED);
  const usdCorp = B.makeBondPosition({ identity: { bondType: '회사채', currency: 'USD', hedgeStatus: 'UNHEDGED' } });
  assert.strictEqual(B.resolveBondClass(usdCorp), B.BOND_CLASS.FOREIGN_CORP_UNHEDGED);
  // 발행인 유형을 모르면 환헤지를 알아도 분류하지 않는다.
  const usdNoType = B.makeBondPosition({ identity: { currency: 'USD', hedgeStatus: 'HEDGED' } });
  assert.strictEqual(B.resolveBondClass(usdNoType), B.BOND_CLASS.UNCLASSIFIED);
});

test('현금흐름: 지급일정이 없으면 만기에서 역산하되 "생성값"임을 남긴다', () => {
  const cf = B.buildBondCashFlows(GOV(), { asOf: ASOF });
  assert.strictEqual(cf.status, 'OK');
  assert.strictEqual(cf.generatedSchedule, true);
  // 반기 지급 10년물 = 쿠폰 20회 + 만기 상환 1회
  assert.strictEqual(cf.flows.filter((f) => f.kind === 'COUPON').length, 20);
  assert.strictEqual(cf.flows.filter((f) => f.kind === 'PRINCIPAL').length, 1);
  assert.strictEqual(cf.flows[cf.flows.length - 1].date, '2034-03-10');
  // 쿠폰 1회 = 액면 × 표면이율 ÷ 지급횟수
  assert.ok(Math.abs(cf.flows[0].amount - 10000000 * 0.035 / 2) < 1e-6);
});

test('현금흐름: 만기일 · 표면이율 · 액면이 없으면 만들지 않는다(0으로 채우지 않는다)', () => {
  const noMaturity = B.makeBondPosition({ terms: { couponRate: 3 }, holding: { faceAmount: 1000000 } });
  const a = B.buildBondCashFlows(noMaturity, { asOf: ASOF });
  assert.strictEqual(a.status, 'UNAVAILABLE');
  assert.match(a.reason, /만기일/);
  const noFace = B.makeBondPosition({ terms: { maturityDate: '2030-01-01', couponRate: 3, couponType: 'COUPON', paymentFrequency: 2 } });
  assert.strictEqual(B.buildBondCashFlows(noFace, { asOf: ASOF }).status, 'UNAVAILABLE');
});

test('할인채 · 복리채: 중간 지급이 없고 상환 흐름 하나만 생긴다', () => {
  const disc = B.makeBondPosition({
    terms: { issueDate: '2025-01-01', maturityDate: '2027-01-01', couponType: 'DISCOUNT', couponRate: 0 },
    holding: { faceAmount: 5000000, purchaseDate: '2025-01-01', purchaseAmount: 4700000 }
  });
  const cf = B.buildBondCashFlows(disc, { asOf: ASOF });
  assert.strictEqual(cf.status, 'OK');
  assert.deepStrictEqual(cf.flows.map((f) => f.kind), ['PRINCIPAL']);
  // 할인채의 Macaulay 듀레이션은 정의상 잔존만기와 같다.
  const d = B.computeBondDuration(disc, { asOf: '2026-01-01' });
  assert.strictEqual(d.status, 'OK');
  assert.ok(Math.abs(d.macaulayYears - 1) < 0.01, `잔존 1년인데 ${d.macaulayYears}`);
});

test('수익률: 시장가격이 없어도 확정 계층은 전부 계산된다(BOND-1)', () => {
  const y = B.computeBondYields(GOV(), { asOf: ASOF });
  assert.strictEqual(y.marketPriceAvailable, false);
  const c = y.layer.confirmed;
  ['couponYield', 'purchaseAmount', 'realizedInterest', 'maturityRepayment', 'maturityPL', 'remainingYears', 'nextCouponDate', 'purchaseYtm'].forEach((k) => {
    assert.strictEqual(c[k].status, 'OK', `${k}는 시세 없이도 계산돼야 한다`);
  });
  // 매입 시 YTM: 표면 3.5%를 98에 샀으니 표면이율보다 높다.
  assert.ok(c.purchaseYtm.value > 0.035, `매입 YTM ${c.purchaseYtm.value}`);
  assert.strictEqual(c.realizedInterest.count, 5); // 2024-09 ~ 2026-09
});

test('수익률: 시장가격이 없으면 평가 계층은 0이 아니라 "계산 불가"다', () => {
  const y = B.computeBondYields(GOV(), { asOf: ASOF });
  ['marketValue', 'valuationPL', 'currentYield', 'currentYtm'].forEach((k) => {
    assert.strictEqual(y.layer.valuation[k].status, 'UNAVAILABLE', k);
    assert.strictEqual(y.layer.valuation[k].value, null, k);
  });
  // 보유기간수익률은 쿠폰 수령분만 부분 표시하고 그 사실을 남긴다.
  assert.strictEqual(y.layer.valuation.holdingPeriodReturn.status, 'OK');
  assert.strictEqual(y.layer.valuation.holdingPeriodReturn.partial, true);
});

test('수익률: 시장가격이 들어오면 평가 계층이 채워지고 확정 계층은 그대로다', () => {
  const base = B.computeBondYields(GOV(), { asOf: ASOF });
  const y = B.computeBondYields(GOV(), { asOf: ASOF, marketPrice: 10100000 });
  assert.strictEqual(y.layer.valuation.valuationPL.value, 10100000 - 9800000);
  assert.strictEqual(y.layer.valuation.currentYtm.status, 'OK');
  assert.ok(y.layer.valuation.currentYtm.value < 0.035, '액면 위 가격이면 YTM은 표면이율보다 낮다');
  // 시세가 생겼다고 확정 계층이 바뀌지 않는다(대체 금지).
  assert.strictEqual(y.layer.confirmed.purchaseYtm.value, base.layer.confirmed.purchaseYtm.value);
});

test('듀레이션: 시장가격 없이도 계산되고, 모형값임을 표시한다', () => {
  const d = B.computeBondDuration(GOV(), { asOf: ASOF });
  assert.strictEqual(d.status, 'OK');
  assert.strictEqual(d.modelValue, true);
  assert.strictEqual(d.discountRateSource, 'purchaseYtm');
  assert.ok(d.modifiedDuration > 0 && d.modifiedDuration < d.macaulayYears, '수정듀레이션 < Macaulay');
  // ±100bp는 부호가 반대이고 크기는 수정듀레이션과 같다(%).
  assert.ok(Math.abs(d.priceImpactPctByBp['100'] + d.modifiedDuration) < 1e-9);
  assert.ok(Math.abs(d.priceImpactPctByBp['-100'] - d.modifiedDuration) < 1e-9);
  assert.strictEqual(d.primaryShockBp, 100);
});

test('듀레이션: 잔존만기가 짧아지면 민감도도 함께 작아진다', () => {
  const far = B.computeBondDuration(GOV(), { asOf: '2026-09-20' });
  const near = B.computeBondDuration(GOV(), { asOf: '2033-09-20' });
  assert.ok(near.modifiedDuration < far.modifiedDuration, `${near.modifiedDuration} < ${far.modifiedDuration}`);
});

test('Bond Risk 요약: 점수를 만들지 않고, 신용은 수치화하지 않는다', () => {
  const corp = B.makeBondPosition({
    assetId: 'ZZA-2', identity: { instrumentName: 'ZZ 회사채(합성)', currency: 'KRW', bondType: '회사채', creditRating: 'AA-' },
    terms: { issueDate: '2025-06-01', maturityDate: '2028-06-01', couponRate: 4.2, couponType: 'COUPON', paymentFrequency: 4 },
    holding: { faceAmount: 5000000, purchaseDate: '2025-06-01', purchaseAmount: 5000000 }
  });
  const s = B.computeBondRiskSummary([GOV(), corp], { asOf: ASOF });
  assert.strictEqual(s.status, 'OK');
  assert.strictEqual(s.count, 2);
  assert.strictEqual(s.durationCoveragePct, 100);
  assert.ok(s.weightedModifiedDuration > 0);
  assert.ok(s.primaryImpactPct < 0, '금리 +100bp면 평가금액은 내려간다');
  assert.deepStrictEqual(s.creditRatingDistribution, { AAA: 1, 'AA-': 1 });
  assert.match(s.creditRiskNote, /수치로 계산하지 않습니다/);
  // 0~100 점수를 만들지 않는다(주식 위험점수와 섞이면 의미가 무너진다).
  assert.ok(!('riskScore' in s) && !('score' in s));
});

test('Bond Risk 요약: 계산 불가 항목은 사유와 함께 따로 모은다(빠뜨리지 않는다)', () => {
  const broken = B.makeBondPosition({ identity: { instrumentName: 'ZZ 만기미상(합성)' }, holding: { faceAmount: 1000000, purchaseAmount: 1000000 } });
  const s = B.computeBondRiskSummary([GOV(), broken], { asOf: ASOF });
  assert.strictEqual(s.count, 2);
  assert.strictEqual(s.unavailable.length, 1);
  assert.match(s.unavailable[0].reason, /만기일/);
  assert.strictEqual(s.durationCoveragePct, 50);
});

test('ISIN 어댑터: 6상태를 구분하고, 사용자 매입정보를 덮어쓰지 않는다', () => {
  assert.strictEqual(B.mapBondSourceResponse([]).status, B.BOND_SOURCE_STATUS.NOT_FOUND);
  assert.strictEqual(B.mapBondSourceResponse([{ isinCd: 'A' }, { isinCd: 'B' }]).status, B.BOND_SOURCE_STATUS.MULTIPLE_MATCH);
  const incomplete = B.mapBondSourceResponse([{ isinCd: 'KRZZ00000002', isinCdNm: 'ZZ채권', bondIssuDt: '20250101' }]);
  assert.strictEqual(incomplete.status, B.BOND_SOURCE_STATUS.SOURCE_DATA_INCOMPLETE);
  assert.deepStrictEqual(incomplete.missingFields, ['maturityDate', 'couponRate']);

  const found = B.mapBondSourceResponse([{
    isinCd: 'KRZZ00000003', isinCdNm: 'ZZ 국고채권(합성)', bondIsurNm: 'ZZ정부', bondIssuDt: '20240310',
    bondExprDt: '20340310', bondSrfcInrt: 3.5, bondIntTcdNm: '이표채', bondPymtCnt: 2, kindNm: '국채', basDt: '20260901'
  }]);
  assert.strictEqual(found.status, B.BOND_SOURCE_STATUS.FOUND);
  assert.strictEqual(found.position.terms.maturityDate, '2034-03-10');
  assert.strictEqual(found.position.source.evidenceGrade, 'A');
  assert.match(found.position.source.licenseNote, /제2유형/);

  // 자동 갱신이 사용자 보유(B 계층)와 사용자 수정값을 덮지 않는다.
  const mine = B.makeBondPosition({
    assetId: 'ZZA-9', identity: { isin: 'KRZZ00000003' },
    terms: { maturityDate: '2030-01-01', couponRate: 1 },
    userOverride: { couponRate: 3.25 },
    holding: { faceAmount: 7000000, purchaseDate: '2025-02-02', purchaseAmount: 6900000 }
  });
  const merged = B.mergeBondSourceIntoPosition(mine, found.position);
  assert.deepStrictEqual(merged.holding, mine.holding);
  assert.deepStrictEqual(merged.userOverride, { couponRate: 3.25 });
  assert.strictEqual(merged.assetId, 'ZZA-9');
  assert.strictEqual(merged.terms.maturityDate, '2034-03-10'); // 공식 조건은 갱신된다
  // 계산은 사용자 수정값을 우선한다(원본 terms는 그대로 남는다).
  assert.strictEqual(B.bondEffectiveTerms(merged).terms.couponRate, 3.25);
  assert.strictEqual(merged.terms.couponRate, 3.5);
});

test('자산 성격 연결: 분류된 채권만 MC 자산군 후보가 된다', () => {
  const gov = GOV();
  assert.deepStrictEqual(B.resolveBondAssetCharacter({ id: 'ZZA-1' }, [gov]).character, 'KR_GOV_BOND');
  const unclassified = B.makeBondPosition({ assetId: 'ZZA-3', identity: { bondType: '기타' } });
  assert.strictEqual(B.resolveBondAssetCharacter({ id: 'ZZA-3' }, [unclassified]).character, null);
  // 연결된 채권 레코드가 없으면 판단하지 않는다(기존 BOND 성격 유지).
  assert.strictEqual(B.resolveBondAssetCharacter({ id: 'NOPE' }, [gov]), null);
});
