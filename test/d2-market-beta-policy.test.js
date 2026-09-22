/* [D-2 · PM 최종 정책 2026-09-21] Market Beta 기준 시장 판정 통합 검증.
 *
 * PM이 확정한 규칙은 두 줄이다.
 *   ① 국내 노출  → 상장 시장 지수(KOSPI 상장 → KOSPI · KOSDAQ 상장 → KOSDAQ)
 *   ② 미국 노출  → S&P500 (상장 거래소는 보지 않는다 - 나스닥 · 뉴욕 · 아멕스 · 국내 상장 모두 같다)
 * 그리고 경제적 노출시장은 **승인된 원장에서만** 읽는다 - 근거가 없으면 미확정이다(STEP 5 · GAP-1).
 *
 * 이 파일이 고정하는 것(PM 지시 STEP 20 A~I · K · L · M · O · P · Q):
 *   A 국내 KOSPI 상장 → KOSPI              B 국내 KOSDAQ 상장 → KOSDAQ
 *   C 국내 상장 미국 ETF → S&P500(비동기 · H.10)   D NASDAQ 미국 노출 → S&P500
 *   E NYSE 미국 노출 → S&P500              F AMEX 미국 노출 → S&P500
 *   G ACE 360200 UNHEDGED + S&P500         H 237370 KR + MIXED + KOSPI
 *   I 472170 MIXED + KOSPI + hedgeStatus   K HEDGED 차단   L 환헤지 미확인 차단
 *   M Tracking Beta 기준 무변경             O 채권 · 현금 · 부동산 제외
 *   P 포트폴리오 베타 · 기준시장 구성 표시   Q 위험점수 산출
 *   + 거래소 기준과 노출 기준을 섞지 않는다(STEP 19) · 원장 미등재 → 미확정(STEP 5)
 *
 * 테스트 데이터는 합성값이다 - 수량 · 금액은 전부 지어낸 값이고, 종목 식별자는 공개 원장(js/28)에
 * 이미 있는 공개 사실이거나 가상의 ZZ 티커다. 실제 사용자 보유 정보는 담지 않는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const EM = require('../js/28-exposure-master.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = require('./risk-sandbox.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

/* 가상 원장 - 실제 원장에 없는 조합(코스닥 상장 · 환헤지형 · 미국 상장인데 미국 노출이 아닌 상품)을
 * 만들기 위해서만 쓴다. 실제 원장으로 검사할 수 있는 항목은 실제 원장을 쓴다. */
const SYN = {
  kosdaqStock: { ticker: 'ZZKQ.KQ', assetType: 'KR_STOCK', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSDAQ', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA 코스닥 상장 국내 보통주', evidenceGrade: 'A', version: 'TEST' },
  kospiStock: { ticker: 'ZZKP.KS', assetType: 'KR_STOCK', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSPI', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA 코스피 상장 국내 보통주', evidenceGrade: 'A', version: 'TEST' },
  hedged: { ticker: 'ZZHG.KS', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', fxExposure: 'NONE', hedgeStatus: 'HEDGED', conversionMethod: 'HEDGE_COST', evidence: 'SYNTHETIC_TEST_DATA 환헤지형 국내 상장 미국 ETF', evidenceGrade: 'A', version: 'TEST' },
  hedgeUnknown: { ticker: 'ZZUK.KS', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', evidence: 'SYNTHETIC_TEST_DATA 환헤지 미확인', evidenceGrade: 'A', version: 'TEST' },
  // 미국 거래소에 상장돼 있지만 경제적 노출은 미국이 아닌 상품(선진국 ex-US).
  usListedNonUsExposure: { ticker: 'ZZEX', assetType: 'FOREIGN_LISTED_ETF', assetClass: 'DEV_EX_US_EQUITY', marketExposure: 'DEV_EX_US', benchmark: 'SP500', priceCcy: 'USD', underlyingCcy: 'USD', fxExposure: 'EXPOSED', hedgeStatus: 'UNHEDGED', conversionMethod: 'FX_MULTIPLY', evidence: 'SYNTHETIC_TEST_DATA 미국 상장 · 미국 외 노출', evidenceGrade: 'A', version: 'TEST' }
};
function withSyntheticLedger(s) {
  const master = s.buildExposureMaster(Object.values(SYN));
  assert.deepStrictEqual(plain(master.invalid), [], '가상 원장이 규칙을 통과해야 한다');
  const original = s.lookupExposureRecord;
  s.lookupExposureRecord = (a) => original(a, master);
  return s;
}

const LISTED = {
  '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자', market: 'KR' },
  'ZZKP.KS': { exchange: 'KOSPI', nameKr: 'ZZ 코스피주', market: 'KR' },
  'ZZKQ.KQ': { exchange: 'KOSDAQ', nameKr: 'ZZ 코스닥주', market: 'KR' },
  'ZZEX': { exchange: 'NASDAQ', nameEn: 'ZZ EX US ETF', market: 'US' },
  'AAPL': { exchange: 'NASDAQ', nameEn: 'APPLE INC', market: 'US' },
  'JPM': { exchange: 'NYSE', nameEn: 'JPMORGAN CHASE', market: 'US' },
  'SPY': { exchange: 'AMEX', nameEn: 'SPDR S&P 500 ETF', market: 'US' }
};

const bmOf = (s, ticker, category = 'ETF') => plain(s.resolveMarketRiskBenchmark({ ticker, category, name: `ZZ ${ticker}` }));
const entryOf = (ticker) => EM.EXPOSURE_MASTER_ENTRIES.find((e) => e.ticker === ticker);

/* ══════════════════ A · B  국내 노출은 상장 시장 기준 ══════════════════ */

test('A - 국내 노출 · KOSPI 상장이면 KOSPI 시장 지수를 쓴다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, '005930.KS', '주식');
  assert.strictEqual(bm.key, 'KOSPI');
  assert.strictEqual(bm.status, 'RESOLVED');
  assert.strictEqual(bm.source, 'listingMarket');
  // 같은 시장 · 같은 통화이므로 비동기 정렬도 환산도 타지 않는다.
  assert.strictEqual(bm.alignment, undefined);
  assert.strictEqual(bm.benchmarkFx, undefined);
});

test('B - 국내 노출 · KOSDAQ 상장이면 KOSDAQ 시장 지수를 쓴다(코스피로 합치지 않는다)', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.setTickerMaster(LISTED);
  assert.strictEqual(bmOf(s, 'ZZKQ.KQ', '주식').key, 'KOSDAQ');
  assert.strictEqual(bmOf(s, 'ZZKP.KS', '주식').key, 'KOSPI');
});

test('B-2 - 종목 마스터에 없어도 국내 거래소 접미사로 상장 시장을 읽는다(노출 근거는 별개로 필요하다)', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.setTickerMaster({});   // 마스터 비움
  assert.strictEqual(bmOf(s, 'ZZKQ.KQ', '주식').key, 'KOSDAQ');
  assert.strictEqual(bmOf(s, 'ZZKP.KS', '주식').key, 'KOSPI');
});

/* ══════════════════ C ~ F  미국 노출은 상장지와 무관하게 S&P500 ══════════════════ */

test('C - 국내 상장 미국 ETF는 S&P500 기준이고, 비동기 정렬 + H.10 원화 환산 경로를 탄다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  ['360750.KS', '360200.KS', '368590.KS', '458730.KS', '487230.KS'].forEach((t) => {
    const bm = bmOf(s, t);
    assert.strictEqual(bm.key, 'SP500', t);
    assert.strictEqual(bm.status, 'RESOLVED', t);
    assert.strictEqual(bm.source, 'usExposure', t);
    // [§44 44-15 · D-05] 국내 달력 ↔ 미국 지수이므로 시차 0+1, 원화 상품 ↔ 달러 지수이므로 H.10 환산.
    assert.strictEqual(bm.alignment, 'ASYNC_DIMSON', t);
    assert.strictEqual(bm.benchmarkFx, 'USD_TO_KRW_H10', t);
  });
});

test('D · E · F - 미국 상장 자산은 거래소(NASDAQ · NYSE · AMEX)와 무관하게 전부 S&P500이다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const cases = [['AAPL', '주식', 'NASDAQ'], ['JPM', '주식', 'NYSE'], ['SPY', 'ETF', 'AMEX'], ['SCHD', 'ETF', 'AMEX'], ['QQQM', 'ETF', 'NASDAQ']];
  cases.forEach(([t, cat, exch]) => {
    const bm = bmOf(s, t, cat);
    assert.strictEqual(bm.key, 'SP500', `${t}(${exch})`);
    assert.strictEqual(bm.status, 'RESOLVED', t);
    // 미국 상장 · 달러 표시 → 지수와 같은 달력 · 같은 통화다(환산 없음).
    assert.strictEqual(bm.alignment, undefined, t);
    assert.strictEqual(bm.benchmarkFx, undefined, t);
  });
});

test('E-2 - 뉴욕 · 아멕스 상장분은 v265에서 미확정이었으나 이제 계산된다(대장 D-2 해소)', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  ['JPM', 'V', 'MA', 'JNJ', 'UNH', 'XOM', 'CVX', 'PG', 'KO'].forEach((t) => {
    assert.strictEqual(bmOf(s, t, '주식').key, 'SP500', t);
  });
  ['SPY', 'SPYM', 'VOO', 'SCHD'].forEach((t) => {
    assert.strictEqual(bmOf(s, t, 'ETF').key, 'SP500', t);
  });
});

/* ══════════════════ 거래소 기준과 노출 기준을 섞지 않는다 (STEP 19) ══════════════════ */

test('STEP 19 - 상장 거래소는 노출시장이 아니다: 미국 상장이어도 미국 노출이 아니면 S&P500을 붙이지 않는다', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, 'ZZEX');
  assert.strictEqual(bm.key, null);
  assert.strictEqual(bm.status, 'UNRESOLVED');
  // 상장 시장(NASDAQ)에 대응하는 국내 시장 지수가 없다 - 미국 노출이 아니므로 S&P500도 쓰지 않는다.
  assert.strictEqual(bm.source, 'marketIndexNotAvailable');
});

test('STEP 19 - .KS 접미사는 상장 시장 판정에만 쓴다: 국내 상장이어도 미국 노출이면 KOSPI를 붙이지 않는다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  assert.strictEqual(bmOf(s, '360750.KS').key, 'SP500');
  assert.notStrictEqual(bmOf(s, '360750.KS').key, 'KOSPI');
});

/* ══════════════════ STEP 5 · GAP-1  원장 미등재 → 미확정 ══════════════════ */

test('STEP 5 - 승인된 노출 근거가 없으면 접미사 · 거래소 · 이름으로 추정하지 않고 미확정으로 둔다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({ 'ZZNEW.KS': { exchange: 'KOSPI', nameKr: 'ZZ 미등재 국내주', market: 'KR' } });
  // 국내 접미사가 있어도, 종목 마스터에 상장 사실이 있어도 노출 근거가 없으면 붙이지 않는다.
  const kr = bmOf(s, 'ZZNEW.KS', '주식');
  assert.strictEqual(kr.key, null);
  assert.strictEqual(kr.source, 'exposureUnconfirmed');
  // 이름에 '미국'이 들어가도 S&P500을 자동 부여하지 않는다.
  const named = plain(s.resolveMarketRiskBenchmark({ ticker: 'ZZUSA.KS', category: 'ETF', name: 'ZZ 미국 S&P500 추종' }));
  assert.strictEqual(named.key, null);
  assert.strictEqual(named.source, 'exposureUnconfirmed');
  // 해외 티커도 마찬가지다.
  assert.strictEqual(bmOf(s, 'ZZFGN', '주식').source, 'exposureUnconfirmed');
});

/* ══════════════════ K · L  환헤지 게이트 ══════════════════ */

test('K - 환헤지형(HEDGED)은 헤지비용 자료가 없으므로 원화 환산 경로를 그대로 쓰지 않고 미확정으로 둔다', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, 'ZZHG.KS');
  assert.strictEqual(bm.key, null);
  assert.strictEqual(bm.source, 'hedgeCostUnavailable');
});

test('L - 환헤지 여부가 확인되지 않으면 비헤지로 간주하지 않고 계산을 막는다', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, 'ZZUK.KS');
  assert.strictEqual(bm.key, null);
  assert.strictEqual(bm.source, 'hedgeUnconfirmed');
});

/* ══════════════════ G · H · I  PM이 지목한 세 상품 ══════════════════ */

test('G - ACE 미국S&P500(360200)은 운용사 공식 문서로 UNHEDGED가 확정돼 S&P500 시장 베타를 받는다', () => {
  const e = entryOf('360200.KS');
  assert.strictEqual(e.marketExposure, 'US');
  assert.strictEqual(e.hedgeStatus, 'UNHEDGED');
  assert.strictEqual(e.fxExposure, 'EXPOSED');
  assert.strictEqual(e.conversionMethod, 'FX_MULTIPLY');
  assert.strictEqual(e.benchmark, 'SP500');
  assert.strictEqual(e.evidenceGrade, 'A');
  // 근거는 추정이 아니라 문서다 - 무엇을 봤는지가 원장에 남아 있어야 한다.
  assert.ok(e.evidence.includes('간이투자설명서'), e.evidence);
  assert.ok(e.evidence.includes('환헤지 거래를 실행하지 아니할 계획'), e.evidence);
  // 원장 검증에서도 더 이상 보류 상태가 아니다.
  assert.strictEqual(EM.validateExposureEntry(e).status, 'RESOLVED');

  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, '360200.KS');
  assert.strictEqual(bm.key, 'SP500');
  assert.strictEqual(bm.status, 'RESOLVED');
  assert.strictEqual(bm.benchmarkFx, 'USD_TO_KRW_H10');
});

test('H - KODEX 코리아배당성장채권혼합(237370)은 국내 노출 혼합형이므로 KOSPI다(미국 지수로 보내지 않는다)', () => {
  const e = entryOf('237370.KS');
  assert.strictEqual(e.marketExposure, 'KR');
  assert.strictEqual(e.exposureStructure, 'MIXED');
  assert.strictEqual(e.priceCcy, 'KRW');
  assert.strictEqual(e.assetClass, undefined, 'MIXED에는 단일 자산군을 두지 않는다');
  assert.strictEqual(e.benchmark, undefined, 'MIXED에는 단일 기초지수를 두지 않는다');

  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const bm = bmOf(s, '237370.KS');
  assert.strictEqual(bm.key, 'KOSPI');
  assert.strictEqual(bm.source, 'listingMarket');
  assert.strictEqual(bm.benchmarkFx, undefined, '국내 노출이므로 환율 게이트 대상이 아니다');
});

test('I - TIGER 미국테크TOP10채권혼합(472170)은 혼합형이고 KOSPI를 유지하며, 환헤지 사실이 구조화돼 있다', () => {
  const e = entryOf('472170.KS');
  assert.strictEqual(e.exposureStructure, 'MIXED');
  assert.strictEqual(e.marketExposure, 'GLOBAL');
  assert.strictEqual(e.hedgeStatus, 'UNHEDGED', '기존 A등급 근거를 항목으로 구조화한 결과');
  assert.ok(e.evidence.includes('환헤지를 하지 아니함'), e.evidence);
  assert.strictEqual(e.assetClass, undefined);
  assert.strictEqual(e.benchmark, undefined);
  // 구조화가 원장 검증 결과를 바꾸지 않는다(여전히 혼합 → 단일 판정 없음).
  const v = EM.validateExposureEntry(e);
  assert.strictEqual(v.mixedExposure, true);
  assert.deepStrictEqual(plain(v.violations), []);

  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  // [PM 결정] 50:50 혼합이지만 1:N Exposure Engine을 도입하지 않고 KOSPI를 유지한다(D-13).
  assert.strictEqual(bmOf(s, '472170.KS').key, 'KOSPI');
});

test('STEP 9 - MIXED라는 값만으로 기준을 정하지 않는다(같은 MIXED라도 노출시장에 따라 갈린다)', () => {
  assert.strictEqual(entryOf('237370.KS').exposureStructure, entryOf('472170.KS').exposureStructure);
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  // 둘 다 MIXED이고 둘 다 KOSPI다 - 그러나 그 이유는 "MIXED라서"가 아니라 "미국 노출이 아니라서"다.
  // 미국 노출이면 MIXED 여부와 무관하게 S&P500으로 간다는 것은 위 C · D 테스트가 고정한다.
  assert.strictEqual(bmOf(s, '237370.KS').key, 'KOSPI');
  assert.strictEqual(bmOf(s, '472170.KS').key, 'KOSPI');
});

/* ══════════════════ 원장 전건 ══════════════════ */

test('원장 58건의 Market Beta 판정 분포가 정책과 같다(채권 자산군 2건은 대상 아님)', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const dist = {};
  EM.EXPOSURE_MASTER_ENTRIES.forEach((e) => {
    const category = (e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK') ? '주식' : 'ETF';
    const bm = bmOf(s, e.ticker, category);
    const k = `${e.marketExposure}:${bm.key || bm.source}`;
    dist[k] = (dist[k] || 0) + 1;
  });
  /* [D2-Q1 기대값 갱신 · PM 최종 승인 2026-09-22] 국내 노출 21건 + GLOBAL 1건 → KOSPI,
   * 미국 노출 36건 중 **채권 자산군(TLT · IEF) 2건을 뺀 34건**이 S&P500이다.
   * 채권은 주식 시장지수 베타의 대상이 아니라는 기존 정책(PD-15)을 원장의 assetClass로 적용한 결과다. */
  assert.deepStrictEqual(dist, { 'KR:KOSPI': 21, 'GLOBAL:KOSPI': 1, 'US:SP500': 34, 'US:bondAssetClass': 2 });
  // 채권 자산군을 뺀 나머지는 하나도 미확정이 아니다.
  EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.assetClass !== 'BOND').forEach((e) => {
    const category = (e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK') ? '주식' : 'ETF';
    assert.strictEqual(bmOf(s, e.ticker, category).status, 'RESOLVED', e.ticker);
  });
});

/* ══════════════════ M  Tracking Beta는 그대로 ══════════════════ */

test('M - 공식 기초지수(Tracking) 기준은 이번 변경으로 바뀌지 않는다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  const trk = (t, cat = 'ETF') => plain(s.resolveRiskBenchmark({ ticker: t, category: cat, name: `ZZ ${t}` })).key;
  assert.strictEqual(trk('005930.KS', '주식'), 'KOSPI');       // 국내 개별주 - 원장 기초지수
  assert.strictEqual(trk('QQQM'), 'NASDAQ100');                 // 나스닥100 추종
  assert.strictEqual(trk('SPY'), 'SP500');
  assert.strictEqual(trk('AAPL', '주식'), 'NASDAQ');            // 미국 개별주 - 원장이 지정한 지수 그대로
  // DJ US Dividend 100 - 기준 지수는 확인됐고 공개 가격 원천만 없다(키는 남고 베타만 안 만든다).
  assert.strictEqual(trk('SCHD'), 'DJ_US_DIV100_PR');
  assert.strictEqual(EM.isIndexPriceSourceAvailable('DJ_US_DIV100_PR'), false);
  assert.strictEqual(trk('237370.KS'), null);                   // 혼합 - 단일 기초지수 없음
  // Market Beta와 값이 다를 수 있다는 것이 정상이다(서로 다른 통계량).
  assert.strictEqual(bmOf(s, 'QQQM').key, 'SP500');
  assert.strictEqual(bmOf(s, 'AAPL', '주식').key, 'SP500');
});

/* ══════════════════ O  채권 · 현금 · 부동산 제외 ══════════════════ */

test('O - 채권 · 현금 · 부동산 카테고리는 시장 베타 대상이 아니다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  ['채권', '현금', '부동산', '기타'].forEach((cat) => {
    const bm = plain(s.resolveMarketRiskBenchmark({ ticker: '005930.KS', category: cat, name: 'ZZ' }));
    assert.strictEqual(bm.key, null, cat);
    assert.strictEqual(bm.source, 'notEquityLike', cat);
  });
});

/* ══════════════════ P · Q  포트폴리오 베타 · 위험점수 · 기준시장 표시 ══════════════════ */

function mixedMarketPortfolio(s) {
  s.state.assets = [
    makeTestAsset({ name: 'ZZ 국내주', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'ZZ 미국주', ticker: 'AAPL', category: '주식', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 })
  ];
  s.setDailyCloses('005930.KS', withDates({ closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1) }));
  s.setDailyCloses('AAPL', withDates({ closes: zigzagCloses(260, 100, 1.1, 0.9), volumes: volumes(260, 1000, 1) }));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1.0, 0.9), volumes: volumes(260, 1, 1) }));
  s.setDailyCloses('^GSPC', withDates({ closes: zigzagCloses(260, 5000, 0.95, 0.85), volumes: volumes(260, 1, 1) }));
  s.setTickerMaster(LISTED);
  return s;
}

test('P · Q - 기준시장이 서로 다른 종목이 섞여도 포트폴리오 베타와 위험점수가 산출된다', async () => {
  const s = mixedMarketPortfolio(loadRiskSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  assert.deepStrictEqual(plain(m.holdings.map((h) => h.benchmarkKey)), ['KOSPI', 'SP500']);
  assert.strictEqual(m.betaDefinition, 'MARKET');
  assert.ok(m.holdings.every((h) => typeof h.beta === 'number'));
  assert.strictEqual(typeof m.portfolioBeta, 'number');
  assert.strictEqual(typeof m.subScores.market, 'number');
  assert.strictEqual(typeof m.riskScore, 'number');
  assert.strictEqual(m.betaMissingCount, 0);
});

test('P - 화면은 포트폴리오 베타가 서로 다른 기준의 가중평균임을 밝히고 기준시장 구성을 보여준다', async () => {
  const s = mixedMarketPortfolio(loadRiskSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  const html = s.betaBenchmarkMixHtml(m);
  assert.ok(html.includes('기준시장 구성'), html);
  assert.ok(html.includes('코스피'), html);
  assert.ok(html.includes('S&amp;P500'), html);   // HTML 이스케이프된 형태
  // 하나의 지수에 대한 통합 베타로 오해하지 않도록 명시한다(STEP 13).
  assert.ok(html.includes('자기 시장'), html);
  assert.ok(html.includes('data-risk-benchmark-mix'), html);
});

test('P - 기준시장이 하나뿐이면 구성 대신 그 시장 하나임을 말한다', async () => {
  const s = loadRiskSandbox();
  s.state.assets = [makeTestAsset({ name: 'ZZ 국내주', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', withDates({ closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1) }));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1.0, 0.9), volumes: volumes(260, 1, 1) }));
  s.setTickerMaster(LISTED);
  const html = s.betaBenchmarkMixHtml(await s.computeAdvancedRiskMetrics());
  assert.ok(html.includes('기준시장: 코스피'), html);
  assert.ok(!html.includes('기준시장 구성'), html);
});

test('P - 종목별 시장 민감도에는 기준시장이 함께 적히고, 혼합구조 상품은 그 사실을 밝힌다', async () => {
  const s = mixedMarketPortfolio(loadRiskSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  const us = m.holdings.find((h) => h.ticker === 'AAPL');
  const kr = m.holdings.find((h) => h.ticker === '005930.KS');
  assert.ok(s.buildIndividualRiskDetailHtml(us, 50).includes('(S&P500 기준)'));
  assert.ok(s.buildIndividualRiskDetailHtml(kr, 50).includes('(코스피 기준)'));
  // 노출 사실이 종목 레코드에 표시용으로 실린다(계산에는 쓰지 않는다).
  assert.strictEqual(us.exposureMarket, 'US');
  assert.strictEqual(kr.exposureMarket, 'KR');
  assert.strictEqual(us.exposureStructure, null);
  // 혼합구조 상품은 별도 안내가 붙는다(472170 · 237370).
  const mixedHtml = s.buildIndividualRiskDetailHtml({ ...kr, exposureStructure: 'MIXED', benchmarkKey: 'KOSPI' }, 50);
  assert.ok(mixedHtml.includes('data-holding-mixed-note'), mixedHtml.slice(0, 400));
  assert.ok(mixedHtml.includes('한 시장만 담고 있지 않습니다'));
});
