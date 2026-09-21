/* [§50 · PM FINAL INTEGRATED IMPLEMENTATION DIRECTIVE] 통합 수정 회귀 테스트.
 *
 * 무엇을 고정하는가 - 이번 변경의 주장 그대로다.
 *   A. 식별자 분류기는 **형태만** 판정한다. ISIN은 통화도 시장도 알려주지 않는다(PD-01).
 *   B. 국내/해외를 ticker 문자열 형태로 정하지 않는다 - ISIN 채권이 '해외'가 되지 않는다(PD-04 · 감사 B-01).
 *   C. 확정 metadata와 거래 통화가 다르면 resolveInstrumentMetadata가 conflict를 만든다(PD-03).
 *   D. Position identity에 통화가 들어간다 - 통화가 섞인 거래는 한 포지션으로 합쳐지지 않는다(PD-02).
 *   E. 채권 · 현금 · 부동산은 주식 전용 기능(분석 · 차트 · 재무 · 주식 벤치마크) 대상이 아니다(PD-05).
 *   F. 채권 평가는 MARKET → PURCHASE이고, 자산 화면과 Bond Risk가 **같은 단가**를 쓴다(PD-07 · 감사 A-02).
 *   G. calcRow가 curKRW를 실제로 돌려준다 - bondWeightPct가 늘 0이던 문제의 원인이었다(PD-09 · 감사 A-03).
 *   H. 채권 세부 성격 + BOND Return Key 조합을 오류로 표시하지 않는다(PD-10 · 감사 B-02).
 *   I. 어긋난 데이터는 **탐지만** 한다 - 고치거나 자동 변환하지 않는다(PD-17).
 *   J. 채권 발행조건은 자산 id가 바뀌어도 ISIN으로 다시 이어진다(PD-11 · 감사 J-02).
 *
 * 실제 보유 종목 · 실제 금융정보는 쓰지 않는다 - 전부 ZZ 접두어 합성 데이터다.
 * 실행: node --test test/instrument-metadata-integrity.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadRiskSandbox } = require('./risk-sandbox.js');

const ISIN = 'KRZZ00000001';          // 합성 채권 표준코드(실재하지 않는다)
const ISIN_B = 'KRZZ00000019';
const OWNER = '신랑';
const ACC = 'ZZ채권계좌';

/* 거래원장 · 미래예측까지 필요한 테스트라 index.html과 같은 순서로 js/04 · 05 · 06을 더 올린다
 * (js/06이 transactionIdentityKey · computePositionsAndRealizedPnL · syncAssetsFromTransactions를 준다). */
const EXTRA = ['04-rebalancing.js', '05-future-projection.js', '06-transactions.js'];
const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh() {
  const s = loadRiskSandbox({ extraFiles: EXTRA });
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  s.state.transactions = [];
  s.state.bondPositions = [];
  // js/12(동기화)는 올리지 않는다 - 저장 경로가 부르는 push 예약만 비워 둔다(테스트 범위 밖).
  s.schedulePush = () => {};
  return s;
}
/** 거래원장 기반 합성 채권 한 건(자산 + 채권 레코드 + 거래). */
function seedLedgerBond(s, { qty = 7066, price = 6861.0859, currency = 'KRW' } = {}) {
  const a = s.makeAsset({
    ticker: ISIN, name: 'ZZ국고채권(합성)', owner: OWNER, accountType: ACC, category: '채권',
    currency, quantity: 0, buyPrice: 0, currentPrice: 0, positionSource: 'ledger'
  });
  s.state.assets.push(a);
  s.state.bondPositions.push(s.makeBondPosition({
    assetId: a.id,
    identity: { isin: ISIN, instrumentName: 'ZZ국고채권(합성)', currency, bondType: '국채', creditRating: 'AAA' },
    terms: { issueDate: '2024-01-10', maturityDate: '2034-01-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC }
  }));
  s.state.transactions.push({
    id: 'ZZTX1', date: '2025-03-10', type: 'buy', owner: OWNER, accountType: ACC, ticker: ISIN,
    name: 'ZZ국고채권(합성)', quantity: qty, price, currency, fee: 0, updatedAt: 1
  });
  s.syncAssetsFromTransactions();
  return a;
}

/* ══ A. 식별자 분류기 ═══════════════════════════════════════════════════ */

test('A. 식별자는 형태만 판정한다 - ISIN은 통화도 시세 심볼도 주지 않는다', () => {
  const s = fresh();
  const k = s.IDENTIFIER_KIND;
  const c = (t) => s.classifyIdentifier(t);

  assert.strictEqual(c(ISIN).kind, k.ISIN);
  assert.strictEqual(c(ISIN).currencyHint, null, 'ISIN 국가코드로 통화를 단정하지 않는다');
  assert.strictEqual(c(ISIN).marketHint, null, 'ISIN으로 시장을 단정하지 않는다');
  assert.strictEqual(c(ISIN).quoteSymbolSupported, false, 'ISIN은 주가 조회 심볼이 아니다');

  assert.strictEqual(c('005930.KS').kind, k.KRX_SUFFIXED);
  assert.strictEqual(c('005930.KS').currencyHint, 'KRW');
  assert.strictEqual(c('0052D0').kind, k.KRX_SHORT, '영문 혼합 신규 국내 코드도 국내 체계다');
  assert.strictEqual(c('A005930').normalized, '005930.KS');
  assert.strictEqual(c('AAPL').kind, k.FOREIGN_TICKER);
  assert.strictEqual(c('AAPL').currencyHint, null, '해외 티커도 통화를 단정하지 않는다');
  assert.strictEqual(c('^KS11').kind, k.INDEX_SYMBOL);
  assert.strictEqual(c('').kind, k.NONE);
});

/* ══ B. 국내/해외 판정 (PD-04 · 감사 B-01) ══════════════════════════════ */

test('B. ISIN 채권이 해외로 분류되지 않는다 - 거래에서 태어난 자산까지 확인', () => {
  const s = fresh();
  // 함수 단위
  assert.strictEqual(s.classifyIsDomestic(ISIN, 'KRW'), '국내');
  assert.strictEqual(s.classifyIsDomestic(ISIN, 'USD'), '해외', '외화 채권은 통화를 따른다');
  assert.strictEqual(s.classifyIsDomestic(ISIN, undefined), '국내', '통화를 모르면 원화로 근사(기존 무티커 동작과 같다)');
  assert.deepStrictEqual(plain(s.deriveDefaults(ISIN, 'ZZ국고채권', 'KRW')), { category: '채권', isDomestic: '국내' });
  // 거래소 코드 체계는 통화보다 강하다(누가 통화를 잘못 적었든 .KS는 한국 상장이다)
  assert.strictEqual(s.classifyIsDomestic('005930.KS', 'USD'), '국내');
  assert.strictEqual(s.classifyIsDomestic('AAPL', 'USD'), '해외');
  // 거래원장에서 태어난 자산
  const a = seedLedgerBond(s);
  assert.strictEqual(a.isDomestic, '국내');
  assert.strictEqual(a.currency, 'KRW');
  assert.strictEqual(a.category, '채권');
});

/* ══ C. 통화 충돌 판정 (PD-01 · PD-03) ═════════════════════════════════ */

test('C. 확정 metadata와 거래 통화가 다르면 conflict로 남는다(조용히 덮어쓰지 않는다)', () => {
  const s = fresh();
  seedLedgerBond(s);
  const conflict = s.resolveInstrumentMetadata({ ticker: ISIN, name: 'ZZ국고채권(합성)', currency: 'USD', owner: OWNER, accountType: ACC, category: '채권' });
  assert.strictEqual(conflict.currency, 'KRW', '근거 있는 통화가 이긴다');
  assert.strictEqual(conflict.currencyConfidence, 'CONFIRMED');
  assert.deepStrictEqual(plain(conflict.conflicts).map((x) => x.field), ['currency']);
  assert.strictEqual(conflict.conflicts[0].source, 'bondMaster');

  // 같은 통화면 충돌이 없다.
  const ok = s.resolveInstrumentMetadata({ ticker: ISIN, name: 'ZZ국고채권(합성)', currency: 'KRW', owner: OWNER, accountType: ACC, category: '채권' });
  assert.deepStrictEqual(plain(ok.conflicts), []);

  // 국내 상장 코드 + USD도 충돌이다. 근거는 우선순위대로 붙는다 -
  // 종목 기준정보(Exposure Master)에 등록된 종목이면 그쪽이, 없으면 식별자 힌트가 근거다.
  const krx = s.resolveInstrumentMetadata({ ticker: '005930.KS', name: 'ZZ국내주식', currency: 'USD' });
  assert.strictEqual(krx.currency, 'KRW');
  assert.strictEqual(krx.conflicts[0].source, 'exposureMaster', '등록된 종목은 Master가 우선이다(PD-01 2순위)');
  const krxUnlisted = s.resolveInstrumentMetadata({ ticker: '999999.KS', name: 'ZZ미등록 국내종목', currency: 'USD' });
  assert.strictEqual(krxUnlisted.currency, 'KRW');
  assert.strictEqual(krxUnlisted.conflicts[0].source, 'identifier', 'Master에 없으면 식별자 힌트가 근거다(3순위)');

  // 근거가 하나도 없으면 입력값을 그대로 쓰고 충돌로 보지 않는다(모르는 것을 틀렸다고 하지 않는다).
  const unknown = s.resolveInstrumentMetadata({ ticker: 'ZZUNKNOWN', name: 'ZZ미지자산', currency: 'USD' });
  assert.strictEqual(unknown.currency, 'USD');
  assert.strictEqual(unknown.currencyConfidence, 'USER');
  assert.deepStrictEqual(plain(unknown.conflicts), []);
});

/* ══ D. Position identity에 통화 (PD-02) ═══════════════════════════════ */

test('D. 통화가 다른 거래는 한 포지션으로 합쳐지지 않는다(마지막 통화가 전체를 지배하지 않는다)', () => {
  const s = fresh();
  seedLedgerBond(s, { qty: 3000, price: 6808 });
  s.state.transactions.push({
    id: 'ZZTX-USD', date: '2026-01-10', type: 'buy', owner: OWNER, accountType: ACC, ticker: ISIN,
    name: 'ZZ국고채권(합성)', quantity: 2000, price: 6900, currency: 'USD', fee: 0, appliedRate: 1372.23, updatedAt: 2
  });
  const { positions } = s.computePositionsAndRealizedPnL();
  const keys = Object.keys(positions).sort();
  assert.deepStrictEqual(keys, [`${OWNER}__${ACC}__${ISIN}__KRW`, `${OWNER}__${ACC}__${ISIN}__USD`]);
  assert.strictEqual(positions[keys[0]].quantity, 3000);
  assert.strictEqual(positions[keys[1]].quantity, 2000);
  // 통화가 전부 같으면 예전과 똑같이 한 포지션이다(기존 데이터에 영향이 없다는 사실을 고정한다).
  const s2 = fresh();
  seedLedgerBond(s2, { qty: 3000, price: 6808 });
  s2.state.transactions.push({
    id: 'ZZTX2', date: '2026-01-10', type: 'buy', owner: OWNER, accountType: ACC, ticker: ISIN,
    name: 'ZZ국고채권(합성)', quantity: 2000, price: 6900, currency: 'KRW', fee: 0, updatedAt: 2
  });
  const p2 = s2.computePositionsAndRealizedPnL().positions;
  assert.strictEqual(Object.keys(p2).length, 1);
  assert.strictEqual(p2[`${OWNER}__${ACC}__${ISIN}__KRW`].quantity, 5000);
});

test('D-2. 채권 원장 키도 같은 규칙을 쓴다(규칙이 갈라지면 보유가 사라진다)', () => {
  const s = fresh();
  seedLedgerBond(s);
  const rec = s.state.bondPositions[0];
  assert.strictEqual(s.bondLedgerKey(rec), `${OWNER}__${ACC}__${ISIN}__KRW`);
  const held = s.resolveBondHolding(rec, s.computePositionsAndRealizedPnL().positions);
  assert.strictEqual(held.source, 'LEDGER');
  assert.strictEqual(held.quantity, 7066);
  assert.strictEqual(held.faceAmount, 70660000);
});

/* ══ E. 주식 전용 기능 차단 (PD-05) ════════════════════════════════════ */

test('E. 채권 · 현금 · 부동산은 주식 전용 기능 대상이 아니다', () => {
  const s = fresh();
  const cap = (o) => s.instrumentCapabilities(o);
  const bond = { ticker: ISIN, category: '채권' };
  assert.strictEqual(cap(bond).equityAnalysis, false);
  assert.strictEqual(cap(bond).marketPriceLookup, false);
  assert.strictEqual(cap(bond).equityBenchmark, false);
  assert.strictEqual(cap(bond).bondValuation, true);
  assert.strictEqual(s.assetSupportsEquityAnalysis(bond), false);

  assert.strictEqual(cap({ ticker: '', category: '부동산' }).equityAnalysis, false);
  assert.strictEqual(cap({ ticker: '', category: '현금' }).marketPriceLookup, false);
  // 주식 · ETF는 예전 그대로다.
  assert.strictEqual(cap({ ticker: '005930.KS', category: '주식' }).equityAnalysis, true);
  assert.strictEqual(cap({ ticker: 'QQQM', category: 'ETF' }).marketPriceLookup, true);
  // 지수 심볼(매크로 팝업)은 시세 조회 대상이다 - 차트가 계속 그려져야 한다.
  assert.strictEqual(cap({ ticker: '^KS11', category: '' }).marketPriceLookup, true);
});

test('E-2. Risk 엔진의 시장 베타 대상에서도 채권은 빠진다(기존 정책 유지)', () => {
  const s = fresh();
  assert.strictEqual(s.resolveMarketRiskBenchmark({ ticker: ISIN, category: '채권' }).source, 'notEquityLike');
  assert.strictEqual(s.resolveMarketRiskBenchmark({ ticker: ISIN, category: '채권' }).key, null);
});

/* ══ F · G. 채권 평가 (PD-07 · PD-08 · PD-09) ══════════════════════════ */

test('F. 채권 현재가가 첫 거래 단가로 고정되지 않는다(추가매수 · 삭제 · 재계산 전부)', () => {
  const s = fresh();
  const a = seedLedgerBond(s, { qty: 3000, price: 6808 });
  assert.strictEqual(s.calcRow(a).unitPrice, 6808);
  s.state.transactions.push({
    id: 'ZZTX2', date: '2025-06-11', type: 'buy', owner: OWNER, accountType: ACC, ticker: ISIN,
    name: 'ZZ국고채권(합성)', quantity: 2000, price: 6900, currency: 'KRW', fee: 0, updatedAt: 2
  });
  s.syncAssetsFromTransactions();
  assert.strictEqual(s.calcRow(a).unitPrice, 6844.8, '추가매수 후에는 가중평균 매입단가를 쓴다');
  assert.strictEqual(a.currentPrice, 6844.8, '저장값도 함께 따라간다(첫 거래가 고정 제거)');
  // 부팅 자동 재계산에서도 되돌아가지 않는다.
  s.syncAssetsFromTransactions({ auto: true });
  assert.strictEqual(s.calcRow(a).unitPrice, 6844.8);
  // 거래를 지우면 남은 거래 기준으로 다시 계산된다.
  s.state.transactions.splice(1, 1);
  s.syncAssetsFromTransactions();
  assert.strictEqual(s.calcRow(a).unitPrice, 6808);
});

test('F-2. 자산 화면과 Bond Risk가 같은 단가를 쓴다(MARKET → PURCHASE) · 시세는 저장하지 않는다', () => {
  const s = fresh();
  const a = seedLedgerBond(s);
  const ledger = s.computePositionsAndRealizedPnL().positions;

  // ① 시세 없음 → 양쪽 다 PURCHASE, 금액이 정확히 같다.
  let row = s.calcRow(a);
  let summary = s.computeBondRiskSummary(s.state.bondPositions, { positions: ledger, quotes: {} });
  assert.strictEqual(row.valuationSource, 'PURCHASE');
  assert.strictEqual(summary.rows[0].valuationSource, 'PURCHASE');
  assert.strictEqual(Math.round(row.curAmount), Math.round(summary.rows[0].amount));

  // ② 유효한 시세 → 양쪽 다 MARKET, 금액이 정확히 같다.
  const quotes = { [ISIN]: { isin: ISIN, price: 6785, yieldPct: 3.6 } };
  s.getCachedBondQuotes = () => quotes;
  s.bondQuoteVersion = () => 1; // 평가 캐시 무효화 신호
  row = s.calcRow(a);
  summary = s.computeBondRiskSummary(s.state.bondPositions, { positions: ledger, quotes });
  assert.strictEqual(row.valuationSource, 'MARKET');
  assert.strictEqual(summary.rows[0].valuationSource, 'MARKET');
  assert.strictEqual(row.unitPrice, 6785, '좌당 단가 = 10,000 × (시세 / 가격기준액면)');
  assert.strictEqual(summary.rows[0].priceBasisFace, 10000);
  assert.strictEqual(Math.round(row.curAmount), Math.round(summary.rows[0].amount));
  // [PD-08] 시세는 자산 레코드에 저장되지 않는다 - 저장값은 매입원가 그대로다.
  assert.ok(Math.abs(a.currentPrice - 6861.0859) < 1e-6, String(a.currentPrice));
});

test('G. calcRow가 curKRW를 돌려준다(bondWeightPct가 늘 0이던 원인)', () => {
  const s = fresh();
  const a = seedLedgerBond(s);
  const row = s.calcRow(a);
  assert.strictEqual(typeof row.curKRW, 'number');
  assert.strictEqual(row.curKRW, row.curAmount);
  assert.ok(row.curKRW > 0);
});

/* ══ H. Return Key validator (PD-10) ═══════════════════════════════════ */

test('H. 채권 세부 성격 + BOND 기준 조합을 오류로 표시하지 않는다', () => {
  const s = loadRiskSandbox({ extraFiles: EXTRA });
  s.state.exchangeRate = 1300;
  const check = (bondType, currency, hedgeStatus) => {
    s.state.assets = []; s.state.transactions = []; s.state.bondPositions = [];
    const a = s.makeAsset({
      ticker: ISIN, name: 'ZZ채권(합성)', owner: OWNER, accountType: ACC, category: '채권',
      currency, isDomestic: currency === 'KRW' ? '국내' : '해외',
      quantity: 100, buyPrice: 10000, currentPrice: 10000, positionSource: 'ledger', rateMatchOverride: 'BOND'
    });
    s.state.assets.push(a);
    s.state.bondPositions.push(s.makeBondPosition({
      assetId: a.id,
      identity: { isin: ISIN, instrumentName: 'ZZ채권(합성)', currency, bondType, creditRating: 'AAA', hedgeStatus },
      terms: { issueDate: '2024-01-10', maturityDate: '2034-01-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
      holding: { owner: OWNER, account: ACC }
    }));
    return { character: s.resolveAssetCharacter(a).character, status: s.assessReturnAssumptionStatus(a).status };
  };
  // 국내 국공채 계열 · 회사채 계열 · 외화채 4종 - 전부 정상 조합이다.
  [['국채', 'KRW', undefined, 'KR_GOV_BOND'], ['지방채', 'KRW', undefined, 'KR_GOV_BOND'],
    ['특수채', 'KRW', undefined, 'KR_GOV_BOND'], ['회사채', 'KRW', undefined, 'KR_CORP_BOND'],
    ['금융채', 'KRW', undefined, 'KR_CORP_BOND'],
    ['국채', 'USD', 'HEDGED', 'FOREIGN_GOV_BOND_HEDGED'], ['국채', 'USD', 'UNHEDGED', 'FOREIGN_GOV_BOND_UNHEDGED'],
    ['회사채', 'USD', 'HEDGED', 'FOREIGN_CORP_BOND_HEDGED'], ['회사채', 'USD', 'UNHEDGED', 'FOREIGN_CORP_BOND_UNHEDGED']
  ].forEach(([bondType, ccy, hedge, expectChar]) => {
    const r = check(bondType, ccy, hedge);
    assert.strictEqual(r.character, expectChar, bondType + '/' + ccy);
    assert.notStrictEqual(r.status, 'NEEDS_REVIEW', `${bondType}/${ccy} - 추천기가 추천한 BOND를 검증기가 오류로 보면 안 된다`);
  });
  // 진짜로 어긋난 조합은 여전히 걸러낸다(검증기를 무력화하지 않았다).
  s.state.assets = []; s.state.bondPositions = [];
  const stock = s.makeAsset({ ticker: '005930.KS', name: 'ZZ국내주식', owner: OWNER, accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 70000, currentPrice: 70000, rateMatchOverride: 'BOND' });
  s.state.assets.push(stock);
  assert.strictEqual(s.assessReturnAssumptionStatus(stock).status, 'NEEDS_REVIEW', '주식에 채권 기준을 붙이면 여전히 확인 요청이다');
});

/* ══ I. 오염 데이터 탐지 (PD-17) ═══════════════════════════════════════ */

test('I. 어긋난 데이터는 탐지만 하고 고치지 않는다', () => {
  const s = fresh();
  const a = seedLedgerBond(s);
  assert.deepStrictEqual(plain(s.detectInstrumentIntegrityIssues(a)), [], '정상 자산은 아무것도 보고하지 않는다');

  // 채권 원장 KRW ↔ 자산 USD
  a.currency = 'USD';
  const found = s.detectInstrumentIntegrityIssues(a);
  assert.deepStrictEqual(plain(found).map((x) => x.code), ['BOND_CURRENCY_CONFLICT']);
  assert.strictEqual(found[0].grade, 'REVIEW');
  assert.strictEqual(a.currency, 'USD', '탐지 함수는 값을 고치지 않는다');
  a.currency = 'KRW';

  // 국내 상장 코드 + USD
  const krx = s.makeAsset({ ticker: '005930.KS', name: 'ZZ국내주식', owner: OWNER, accountType: '일반계좌', category: '주식', currency: 'USD', isDomestic: '해외', quantity: 1, buyPrice: 1, currentPrice: 1 });
  s.state.assets.push(krx);
  assert.ok(s.detectInstrumentIntegrityIssues(krx).some((x) => x.code === 'DOMESTIC_CODE_FOREIGN_CURRENCY'));

  // 통화가 섞인 거래
  s.state.transactions.push({ id: 'ZZ-U', date: '2026-01-10', type: 'buy', owner: OWNER, accountType: ACC, ticker: ISIN, name: 'ZZ국고채권(합성)', quantity: 1, price: 1, currency: 'USD', fee: 0, updatedAt: 3 });
  assert.ok(s.detectInstrumentIntegrityIssues(a).some((x) => x.code === 'LEDGER_CURRENCY_CONFLICT'));

  // 전수 훑기 - 고아 채권 레코드도 잡는다.
  s.state.bondPositions.push(s.makeBondPosition({
    assetId: 'ZZ-NONE', identity: { isin: ISIN_B, instrumentName: 'ZZ고아채권', currency: 'KRW' },
    holding: { owner: OWNER, account: ACC }
  }));
  const scan = s.scanInstrumentIntegrity();
  assert.ok(scan.some((x) => x.code === 'BOND_POSITION_ORPHAN' && x.grade === 'UNRESOLVED'));
  assert.strictEqual(s.state.bondPositions.length, 2, '탐지는 레코드를 지우지 않는다');
});

/* ══ J. 채권 레코드 재연결 (PD-11) ═════════════════════════════════════ */

test('J. 자산 id가 바뀌어도 채권 발행조건이 ISIN으로 다시 이어진다(삭제하지 않는다)', () => {
  const s = fresh();
  seedLedgerBond(s);
  const rec = s.state.bondPositions[0];
  const oldId = rec.assetId;
  // 엑셀 가져오기처럼 자산이 통째로 새 id로 교체된 상황을 흉내 낸다.
  s.state.assets = [s.makeAsset({
    ticker: ISIN, name: 'ZZ국고채권(합성)', owner: OWNER, accountType: ACC, category: '채권',
    currency: 'KRW', quantity: 7066, buyPrice: 6861.0859, currentPrice: 6861.0859
  })];
  assert.notStrictEqual(s.state.assets[0].id, oldId);
  const result = s.relinkBondPositionsToAssets();
  assert.strictEqual(result.relinked, 1);
  assert.strictEqual(result.orphan, 0);
  assert.strictEqual(s.state.bondPositions[0].assetId, s.state.assets[0].id);

  // 이을 자산이 없으면 고아로 세되 **지우지 않는다**.
  s.state.assets = [];
  const orphan = s.relinkBondPositionsToAssets();
  assert.strictEqual(orphan.orphan, 1);
  assert.strictEqual(s.state.bondPositions.length, 1);
});
