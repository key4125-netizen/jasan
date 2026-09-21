// [Bond Stage 2 · 체크리스트 §49 BOND-41~46] KIS 채권 연동 · 가격기준액면 · MARKET/PURCHASE
// 실행: node --test test/bond-kis-stage2.test.js
//
// 무엇을 고정하는가
//   ① KIS 응답에서 실제로 확인된 필드 이름만 쓴다(2026-08 추정 필드명으로 되돌아가지 않는다).
//   ② 없는 채권에 rt_cd "0"으로 오는 응답을 시세로 쓰지 않는다 - 0원 평가를 만들지 않는다.
//   ③ 가격기준액면은 응답 자체(가격↔수익률↔발행조건)로 종목마다 확인하고, 못 하면 PURCHASE로 간다.
//   ④ 거래 quantity는 액면 1만원 단위 그대로다(BOND-07 · BOND-43).
//   ⑤ valuation source 변경이 듀레이션 · 금리충격 계산을 건드리지 않는다(BOND-46).
//
// 실제 보유 채권 · 실제 KIS raw response를 쓰지 않는다 - 전부 ZZ 합성 응답이다.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/29-bond-domain.js');

const ISIN = 'KRZZ00000001';
const OWNER = '신랑';
const ACC = '일반계좌';
const ASOF = '2026-09-21';

/* 합성 KIS bond-info 응답 - 실측으로 확인된 필드 이름만 쓴다. */
function infoRaw(over) {
  return {
    rtCd: '0', msgCd: 'KIOK0530', msg1: '조회되었습니다          ', fetchedAt: 1700000000000,
    output: Object.assign({
      pdno: ISIN,
      ksd_bond_item_name: 'ZZ합성국고채권 01125-3909',
      bond_clsf_kor_name: '국고채권',
      issu_dt: '20190910',
      rdpt_dt: '20390910',
      ksd_rcvg_bond_srfc_inrt: '1.125000000000',
      ksd_rcvg_bond_dsct_rt: '0.000000000000',
      int_caltm_mcnt: '6',
      iso_crcy_cd: 'KRW',
      tlg_rcvg_dtl_dtime: '20260901060518038',
      // 발행인으로 오인하기 쉬운 필드들 - 실제 응답에 있고, issuer로 쓰면 안 된다.
      padf_plac_hdof_name: '한국',
      krx_issu_istt_cd: 'GB035'
    }, over || {}),
    output2: null
  };
}
/* 합성 KIS bond-price 응답 */
function priceRaw(over) {
  return {
    rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.', fetchedAt: 1700000000000,
    output: Object.assign({
      stnd_iscd: ISIN, hts_kor_isnm: 'ZZ합성국고',
      bond_prpr: '6785.00', bond_prdy_clpr: '6782.00', bond_prdy_vrss: '3.00',
      prdy_ctrt: '0.04', ernn_rate: '4.409'
    }, over || {}),
    output2: null
  };
}
function bondFromInfo(raw) {
  const m = B.mapKisBondInfo(raw || infoRaw(), ISIN);
  return B.makeBondPosition({
    assetId: 'ZZ-A', identity: m.position.identity, terms: m.position.terms,
    holding: { owner: OWNER, account: ACC, purchaseDate: '2024-01-15' }
  });
}
// [§50 · PD-02] 포지션 키에 통화가 들어간다 - 합성 채권은 전부 KRW다(bondLedgerKey와 같은 규칙).
const ledger = (quantity, avgPrice) => ({ [`${OWNER}__${ACC}__${ISIN}__KRW`]: { quantity, avgPrice } });
const quoteOf = (raw) => B.mapKisBondQuote(raw || priceRaw(), ISIN).quote;

/* ══ 1~6 · bondType 전체 매핑표 ═══════════════════════════════════════════ */

test('1~5. bondType 매핑표 전 항목 - 국고/지방/특수/회사/금융', () => {
  const cases = [['국고채권', '국채'], ['지방채권', '지방채'], ['특수채권', '특수채'],
    ['회사채권', '회사채'], ['금융채권', '금융채']];
  cases.forEach(([kis, app]) => {
    const m = B.mapKisBondInfo(infoRaw({ bond_clsf_kor_name: kis }), ISIN);
    assert.strictEqual(m.position.identity.bondType, app, `${kis} → ${app}`);
  });
  assert.deepStrictEqual({ ...B.KIS_BOND_CLASS_TO_TYPE }, {
    국고채권: '국채', 지방채권: '지방채', 특수채권: '특수채', 회사채권: '회사채', 금융채권: '금융채'
  });
});

test('6. 매핑표에 없는 값은 비슷해 보여도 분류하지 않는다(UNCLASSIFIED로 남는다)', () => {
  ['외국채권', '채권', '국민주택채권', '', '전환사채권'].forEach((kis) => {
    const m = B.mapKisBondInfo(infoRaw({ bond_clsf_kor_name: kis }), ISIN);
    assert.strictEqual(m.position.identity.bondType, null, `"${kis}" 를 임의 분류했다`);
    assert.strictEqual(B.resolveBondClass(m.position), B.BOND_CLASS.UNCLASSIFIED);
  });
});

/* ══ 7~8 · issuer ═══════════════════════════════════════════════════════ */

test('7. 발행인명이 없는 KIS 응답에서 issuer는 null이다(저장을 막지도 않는다)', () => {
  const m = B.mapKisBondInfo(infoRaw(), ISIN);
  assert.strictEqual(m.position.identity.issuer, null);
  assert.strictEqual(m.status, B.BOND_SOURCE_STATUS.FOUND, 'issuer가 없다고 조회 실패로 만들지 않는다');
});

test('8. 발행인으로 오인하기 쉬운 필드를 issuer에 넣지 않는다', () => {
  const m = B.mapKisBondInfo(infoRaw({
    padf_plac_hdof_name: '한국', krx_issu_istt_cd: 'GB035', bond_clsf_kor_name: '국고채권'
  }), ISIN);
  assert.strictEqual(m.position.identity.issuer, null);
  const asText = JSON.stringify(m.position.identity);
  ['한국', 'GB035'].forEach((v) => assert.ok(!asText.includes(`"issuer":"${v}"`), `${v} 가 issuer에 들어갔다`));
});

/* ══ 9~13 · ISIN 검증 ════════════════════════════════════════════════════ */

test('9. 정상 ISIN은 채택된다', () => {
  assert.strictEqual(B.mapKisBondInfo(infoRaw(), ISIN).status, B.BOND_SOURCE_STATUS.FOUND);
  assert.strictEqual(B.mapKisBondQuote(priceRaw(), ISIN).status, 'OK');
});

test('10. 소문자로 요청해도 같은 코드로 본다', () => {
  assert.strictEqual(B.mapKisBondInfo(infoRaw(), ISIN.toLowerCase()).status, B.BOND_SOURCE_STATUS.FOUND);
  assert.strictEqual(B.mapKisBondQuote(priceRaw(), ISIN.toLowerCase()).status, 'OK');
});

test('11. bond-info의 pdno가 요청과 다르면 채택하지 않는다(엉뚱한 채권 조건을 심지 않는다)', () => {
  const r = B.mapKisBondInfo(infoRaw({ pdno: 'KRZZ00000019' }), ISIN);
  assert.strictEqual(r.status, B.BOND_SOURCE_STATUS.NOT_FOUND);
  assert.strictEqual(r.position, null);
});

test('12. bond-price의 stnd_iscd가 요청과 다르면 시세로 쓰지 않는다', () => {
  const r = B.mapKisBondQuote(priceRaw({ stnd_iscd: 'KRZZ00000019' }), ISIN);
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.strictEqual(r.quote, null);
});

test('13. stnd_iscd가 아예 없으면 시세로 쓰지 않는다', () => {
  const o = priceRaw();
  delete o.output.stnd_iscd;
  const r = B.mapKisBondQuote(o, ISIN);
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.match(r.reason, /표준코드/);
});

/* ══ 14~17 · 시세 검증 (BOND-42) ═════════════════════════════════════════ */

test('14. 정상 bond_prpr은 숫자로 변환된다', () => {
  const q = quoteOf();
  assert.strictEqual(q.price, 6785);
  assert.strictEqual(q.prevClose, 6782);
  assert.strictEqual(q.yieldPct, 4.409);
});

test('15. 숫자가 아닌 bond_prpr은 시세로 쓰지 않는다', () => {
  ['', 'N/A', '-', 'abc'].forEach((v) => {
    assert.strictEqual(B.mapKisBondQuote(priceRaw({ bond_prpr: v }), ISIN).status, 'UNAVAILABLE', `"${v}"`);
  });
});

test('16. [실측 함정] 없는 채권의 rt_cd "0" + 전부 0 응답을 시세로 쓰지 않는다', () => {
  // 실제 KIS가 이렇게 답한다: 성공이라고 하면서 stnd_iscd가 빠지고 값이 전부 0이다.
  const r = B.mapKisBondQuote({
    rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.',
    output: { bond_prpr: '0.00', bond_prdy_clpr: '0.00', ernn_rate: '0.000', acml_vol: '0' }
  }, ISIN);
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.strictEqual(r.quote, null);
});

test('17. rt_cd가 0이 아니면(없는 ISIN의 bond-info) 조회 실패로 다룬다', () => {
  const r = B.mapKisBondInfo({ rtCd: '7', msgCd: 'APBN0024', msg1: '조회된 데이터가 없습니다.', output: null }, ISIN);
  assert.strictEqual(r.status, B.BOND_SOURCE_STATUS.NOT_FOUND);
  assert.match(r.reason, /조회된 데이터가 없습니다/);
});

/* ══ 18~21 · 가격기준액면 (BOND-44) ══════════════════════════════════════ */

test('18. 액면 1만원 기준 가격은 응답 자체(가격↔수익률)로 확인된다', () => {
  const pos = bondFromInfo();
  const r = B.resolveBondPriceBasis(pos, quoteOf(), { asOf: ASOF, positions: ledger(1000, 9800) });
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.basisFace, 10000);
  assert.ok(Math.abs(r.deviationPct) < 5, `편차 ${r.deviationPct}%`);
});

test('19. 기준액면이 다른 채권(10만원 기준 합성)도 그 채권의 응답으로 스스로 판정된다', () => {
  const pos = bondFromInfo();
  // 같은 채권인데 가격만 10배로 매겨진 시장이라면 기준액면은 100,000이어야 한다.
  const q = quoteOf(priceRaw({ bond_prpr: '67850.00' }));
  const r = B.resolveBondPriceBasis(pos, q, { asOf: ASOF, positions: ledger(1000, 9800) });
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.basisFace, 100000, '국고채에서 본 10,000을 다른 채권에 그대로 쓰지 않는다');
  // 시장가치는 기준액면으로 나눠 정규화되므로 결과가 같아야 한다.
  const mv = B.computeBondMarketValue(pos, q, { asOf: ASOF, positions: ledger(1000, 9800) });
  assert.strictEqual(mv.marketValue, 6785000);
});

test('20. 근거가 없으면(수익률 없음 · 만기 없음) 기준액면을 추정하지 않는다', () => {
  const pos = bondFromInfo();
  const led = ledger(1000, 9800);
  const noYield = B.resolveBondPriceBasis(pos, quoteOf(priceRaw({ ernn_rate: '' })), { asOf: ASOF, positions: led });
  assert.strictEqual(noYield.status, 'UNAVAILABLE');
  assert.match(noYield.reason, /수익률/);
  // 만기가 없으면 이론가격 자체를 만들 수 없다.
  const noTerms = B.makeBondPosition({ identity: { isin: ISIN }, holding: { owner: OWNER, account: ACC } });
  const r2 = B.resolveBondPriceBasis(noTerms, quoteOf(), { asOf: ASOF, positions: led });
  assert.strictEqual(r2.status, 'UNAVAILABLE');
});

test('21. 어느 후보와도 맞지 않는 가격은 기준액면을 확정하지 않는다', () => {
  const pos = bondFromInfo();
  // 이론가의 4.7배 - 1만원(1배)과 10만원(10배) 사이 어디에도 2배 이내로 붙지 않는다.
  const q = quoteOf(priceRaw({ bond_prpr: '31889.00' }));
  const r = B.resolveBondPriceBasis(pos, q, { asOf: ASOF, positions: ledger(1000, 9800) });
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.match(r.reason, /가격 기준액면/);
  assert.deepStrictEqual([...B.BOND_PRICE_BASIS_CANDIDATES], [1000, 10000, 100000, 1000000]);
});

/* ══ 22~26 · 평가 (BOND-41 · BOND-43 · BOND-45) ══════════════════════════ */

test('22. faceAmount는 여전히 quantity × 10,000이다(BOND-07 · BOND-43 불변)', () => {
  const held = B.resolveBondHolding(bondFromInfo(), ledger(1000, 9800));
  assert.strictEqual(held.quantity, 1000);
  assert.strictEqual(held.faceAmount, 10000000);
  assert.strictEqual(B.BOND_FACE_UNIT, 10000);
});

test('23. marketValue = faceAmount × (가격 / 가격기준액면)', () => {
  const mv = B.computeBondMarketValue(bondFromInfo(), quoteOf(), { asOf: ASOF, positions: ledger(1000, 9800) });
  assert.strictEqual(mv.status, 'OK');
  assert.strictEqual(mv.faceAmount, 10000000);
  assert.strictEqual(mv.priceBasisFace, 10000);
  assert.strictEqual(mv.marketValue, 10000000 * (6785 / 10000));
  assert.strictEqual(mv.marketValue, 6785000);
});

test('24. 유효한 시세가 있으면 MARKET으로 평가한다', () => {
  const pos = bondFromInfo();
  const s = B.computeBondRiskSummary([pos], { asOf: ASOF, positions: ledger(1000, 9800), quotes: { [ISIN]: quoteOf() } });
  assert.strictEqual(s.valuationSource, 'MARKET');
  assert.strictEqual(s.rows[0].valuationSource, 'MARKET');
  assert.strictEqual(s.rows[0].amount, 6785000);
  assert.strictEqual(s.rows[0].priceBasisFace, 10000);
});

test('25. MARKET이 불가능하면 PURCHASE로 되돌아간다(0원으로 만들지 않는다)', () => {
  const pos = bondFromInfo();
  const led = ledger(1000, 9800);
  // 시세 자체가 없는 경우
  const noQuote = B.computeBondRiskSummary([pos], { asOf: ASOF, positions: led });
  assert.strictEqual(noQuote.valuationSource, 'PURCHASE');
  assert.strictEqual(noQuote.rows[0].amount, 9800000);
  // 기준액면을 확인하지 못하는 시세가 온 경우 - 이유를 남기고 매입원가를 쓴다
  const badQuote = B.computeBondRiskSummary([pos], {
    asOf: ASOF, positions: led, quotes: { [ISIN]: { isin: ISIN, price: 6785, yieldPct: null } }
  });
  assert.strictEqual(badQuote.valuationSource, 'PURCHASE');
  assert.strictEqual(badQuote.rows[0].amount, 9800000, '0원이 아니라 매입원가다');
  assert.match(badQuote.rows[0].marketUnavailableReason, /수익률/);
});

test('26. purchaseAmount 계산 자체는 바뀌지 않았다(거래원장 누적 매입원가 그대로)', () => {
  const held = B.resolveBondHolding(bondFromInfo(), ledger(1500, (1000 * 10000 + 500 * 11000) / 1500));
  assert.ok(Math.abs(held.purchaseAmount - 15500000) < 1e-6);
});

/* ══ 27~32 · Bond Risk (BOND-46) ═════════════════════════════════════════ */

test('27~28. 요약에 MARKET · PURCHASE 건수가 따로 집계된다(섞이면 MIXED)', () => {
  const a = bondFromInfo();
  const bIsin = 'KRZZ00000019';
  const b = B.makeBondPosition({
    assetId: 'ZZ-B', identity: { isin: bIsin, instrumentName: 'ZZ합성회사채', bondType: '회사채', currency: 'KRW' },
    terms: { maturityDate: '2029-01-15', couponRate: 4.2, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC, purchaseDate: '2025-01-15' }
  });
  const led = Object.assign(ledger(1000, 9800), { [`${OWNER}__${ACC}__${bIsin}__KRW`]: { quantity: 500, avgPrice: 10100 } });
  const s = B.computeBondRiskSummary([a, b], { asOf: ASOF, positions: led, quotes: { [ISIN]: quoteOf() } });
  assert.strictEqual(s.valuationSource, 'MIXED');
  assert.strictEqual(s.marketCount, 1);
  assert.strictEqual(s.purchaseCount, 1);
});

test('29. 각 채권이 어떤 평가를 썼는지 행마다 남는다(화면이 그대로 말할 수 있게)', () => {
  const s = B.computeBondRiskSummary([bondFromInfo()], {
    asOf: ASOF, positions: ledger(1000, 9800), quotes: { [ISIN]: quoteOf() }
  });
  assert.strictEqual(s.rows[0].valuationSource, 'MARKET');
  assert.strictEqual(s.rows[0].weightBasis, 'MARKET', '기존 weightBasis 계약도 유지된다');
  assert.strictEqual(s.rows[0].marketUnitPrice, 6785);
});

test('30~32. 채권별 듀레이션 · 수정듀레이션 · ±100bp 계산은 평가 기준이 바뀌어도 그대로다', () => {
  const pos = bondFromInfo();
  const led = ledger(1000, 9800);
  const withMarket = B.computeBondRiskSummary([pos], { asOf: ASOF, positions: led, quotes: { [ISIN]: quoteOf() } });
  const withPurchase = B.computeBondRiskSummary([pos], { asOf: ASOF, positions: led });
  // 채권 하나하나의 듀레이션은 현금흐름 구조에서 나온다 - 얼마로 평가했는지와 무관하다.
  assert.strictEqual(withMarket.rows[0].duration.macaulayYears, withPurchase.rows[0].duration.macaulayYears);
  assert.strictEqual(withMarket.rows[0].duration.modifiedDuration, withPurchase.rows[0].duration.modifiedDuration);
  assert.deepStrictEqual(withMarket.rows[0].duration.priceImpactPctByBp, withPurchase.rows[0].duration.priceImpactPctByBp);
  assert.strictEqual(withMarket.primaryShockBp, withPurchase.primaryShockBp);
  assert.strictEqual(withMarket.dayCount, withPurchase.dayCount);
  // 채권이 하나뿐이면 가중평균도 같다(가중치가 하나라 비중이 100%로 동일하다).
  assert.strictEqual(withMarket.weightedModifiedDuration, withPurchase.weightedModifiedDuration);
  assert.strictEqual(withMarket.primaryImpactPct, withPurchase.primaryImpactPct);
  // 신용위험은 여전히 수치화하지 않는다.
  assert.match(withMarket.creditRiskNote, /수치로 계산하지 않습니다/);
});

test('32-1. [측정 결과 고정] 여러 채권이면 가중평균 듀레이션은 달라진다 - 가중치가 달라지기 때문이다', () => {
  /* 이것은 부작용이 아니라 BOND-41이 정의한 동작이다. 평균 듀레이션은 평가금액으로 가중하므로,
   * 평가 기준이 매입원가에서 시장가로 바뀌면 비중이 바뀌고 평균도 따라 움직인다.
   * 바뀌지 않아야 하는 것은 **채권별 듀레이션 계산**이고, 그것은 아래에서 동일함을 확인한다. */
  const a2 = bondFromInfo();
  const bIsin = 'KRZZ00000019';
  const b2 = B.makeBondPosition({
    assetId: 'ZZ-B', identity: { isin: bIsin, instrumentName: 'ZZ합성회사채', bondType: '회사채', currency: 'KRW' },
    terms: { maturityDate: '2029-01-15', couponRate: 4.2, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC, purchaseDate: '2025-01-15' }
  });
  const led = Object.assign(ledger(1000, 9800), { [`${OWNER}__${ACC}__${bIsin}__KRW`]: { quantity: 500, avgPrice: 10100 } });
  const quotes = { [ISIN]: quoteOf(), [bIsin]: { isin: bIsin, price: 9950, yieldPct: 4.55 } };
  const m = B.computeBondRiskSummary([a2, b2], { asOf: ASOF, positions: led, quotes });
  const p = B.computeBondRiskSummary([a2, b2], { asOf: ASOF, positions: led });
  assert.strictEqual(m.valuationSource, 'MARKET');
  assert.strictEqual(p.valuationSource, 'PURCHASE');
  assert.notStrictEqual(m.weightedModifiedDuration, p.weightedModifiedDuration);
  // 채권별 듀레이션은 두 경우가 완전히 같다 - 달라진 것은 가중치뿐이다.
  m.rows.forEach((r, i) => {
    assert.strictEqual(r.duration.modifiedDuration, p.rows[i].duration.modifiedDuration, r.name);
    assert.strictEqual(r.duration.macaulayYears, p.rows[i].duration.macaulayYears, r.name);
  });
  // 가중평균은 항상 개별 듀레이션의 최소~최대 사이에 있다(엉뚱한 값이 되지 않는다).
  const mins = Math.min(...m.rows.map((r) => r.duration.modifiedDuration));
  const maxs = Math.max(...m.rows.map((r) => r.duration.modifiedDuration));
  assert.ok(m.weightedModifiedDuration >= mins && m.weightedModifiedDuration <= maxs);
});

/* ══ 33~40 · 거래원장 (Stage 1 불변) ═════════════════════════════════════ */

test('33~36. 매수 · 추가매수 · 부분매도 · 전량매도에서 MARKET 평가가 보유를 바꾸지 않는다', () => {
  const pos = bondFromInfo();
  const q = { [ISIN]: quoteOf() };
  const at = (qty, avg) => B.computeBondRiskSummary([pos], { asOf: ASOF, positions: ledger(qty, avg), quotes: q });
  assert.strictEqual(at(1000, 10000).rows[0].faceAmount, 10000000);
  assert.strictEqual(at(1500, 10333.333333).rows[0].faceAmount, 15000000);
  assert.strictEqual(at(1200, 10333.333333).rows[0].faceAmount, 12000000);
  const sold = at(0, 0);
  assert.strictEqual(sold.status, 'EMPTY', '전량매도는 평가 대상이 아니다');
  assert.strictEqual(sold.closedCount, 1);
});

test('37~39. 거래 재계산 결과가 그대로 시장가치에 반영된다(Position은 여전히 거래원장에서 나온다)', () => {
  const pos = bondFromInfo();
  const mv = (qty) => B.computeBondMarketValue(pos, quoteOf(), { asOf: ASOF, positions: ledger(qty, 9800) });
  assert.strictEqual(mv(1000).marketValue, 6785000);
  assert.strictEqual(mv(1200).marketValue, 8142000);   // 거래 수정/추가 후
  assert.strictEqual(mv(600).marketValue, 4071000);    // 일부 삭제/매도 후
  assert.strictEqual(mv(0).status, 'UNAVAILABLE');     // 전량매도
});

test('40. legacy 수동 채권은 거래원장이 없어도 예전 경로 그대로다(KIS가 바꾸지 않는다)', () => {
  const legacy = B.makeBondPosition({
    identity: { isin: ISIN, bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2039-09-10', couponRate: 1.125, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC, faceAmount: 5000000, purchaseAmount: 4900000 }
  });
  const held = B.resolveBondHolding(legacy, {});
  assert.strictEqual(held.source, 'MANUAL');
  assert.strictEqual(held.purchaseAmount, 4900000);
  // 시세가 있으면 legacy 채권도 시장가치로 평가된다(보유 액면은 여전히 레코드 값이다).
  const mv = B.computeBondMarketValue(legacy, quoteOf(), { asOf: ASOF, positions: {} });
  assert.strictEqual(mv.status, 'OK');
  assert.strictEqual(mv.faceAmount, 5000000);
  assert.strictEqual(mv.marketValue, 5000000 * (6785 / 10000));
});

/* ══ 41~46 · 회귀 (BOND-46) ══════════════════════════════════════════════ */

test('41~45. MC 자산 성격 · 채권 구분 매핑은 Stage 2로 바뀌지 않았다', () => {
  const pos = bondFromInfo();
  assert.strictEqual(B.resolveBondClass(pos), B.BOND_CLASS.KR_GOV);
  assert.strictEqual(B.BOND_CLASS_TO_CHARACTER[B.resolveBondClass(pos)], 'KR_GOV_BOND');
  assert.deepStrictEqual({ ...B.BOND_CLASS_TO_CHARACTER }, {
    KR_GOV: 'KR_GOV_BOND', KR_CORP: 'KR_CORP_BOND',
    FOREIGN_GOV_HEDGED: 'FOREIGN_GOV_BOND_HEDGED', FOREIGN_GOV_UNHEDGED: 'FOREIGN_GOV_BOND_UNHEDGED',
    FOREIGN_CORP_HEDGED: 'FOREIGN_CORP_BOND_HEDGED', FOREIGN_CORP_UNHEDGED: 'FOREIGN_CORP_BOND_UNHEDGED'
  });
  // 시세가 붙어도 자산 성격은 달라지지 않는다.
  const ch = B.resolveBondAssetCharacter({ id: 'ZZ-A' }, [pos]);
  assert.strictEqual(ch.character, 'KR_GOV_BOND');
});

test('46. 조회가 사용자 값과 보유를 덮어쓰지 않는다(BOND-27 · BOND-28 유지)', () => {
  const base = B.makeBondPosition({
    identity: { isin: ISIN, currency: 'USD', creditRating: 'AA-', issuer: '사용자가 적은 발행인' },
    terms: { maturityDate: '2030-01-01' },
    userOverride: { couponRate: 9.99 },
    holding: { owner: OWNER, account: ACC, faceAmount: 5000000, purchaseDate: '2024-01-15' }
  });
  // 통화가 빈 문자열로 오는 응답(실측 사례) - 기존 USD를 지우면 안 된다.
  const merged = B.mergeKisBondInfoIntoPosition(base, B.mapKisBondInfo(infoRaw({ iso_crcy_cd: '' }), ISIN));
  assert.strictEqual(merged.identity.currency, 'USD');
  assert.strictEqual(merged.identity.creditRating, 'AA-');
  assert.strictEqual(merged.identity.issuer, '사용자가 적은 발행인');
  assert.strictEqual(merged.holding.faceAmount, 5000000);
  assert.strictEqual(merged.holding.purchaseDate, '2024-01-15');
  assert.strictEqual(merged.userOverride.couponRate, 9.99);
  // KIS가 준 항목은 반영된다.
  assert.strictEqual(merged.terms.maturityDate, '2039-09-10');
  assert.strictEqual(merged.terms.couponRate, 1.125);
  assert.strictEqual(merged.source.provider, 'KIS');
});
