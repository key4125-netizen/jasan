/* Exposure Master (js/28) 단위 테스트 - 체크리스트 §44 제5조 · 제6조 · 제20조 · 제46조.
 *
 * Phase 1A의 합격 조건은 "구조는 있으나 계산에는 쓰이지 않는다"이므로,
 * 마지막 블록에서 비활성 상태와 기존 경로 무간섭을 명시적으로 고정한다.
 */
const test = require('node:test');
const assert = require('node:assert');
const EM = require('../js/28-exposure-master.js');

// 검증에 쓰는 최소 완전 항목들(§44 44-1 매트릭스 기준).
const KR_STOCK_OK = {
  ticker: '005930', assetType: 'KR_STOCK', assetClass: 'KR_EQUITY', marketExposure: 'KR',
  benchmark: 'KOSPI', priceCcy: 'KRW', evidence: 'KIS 종목마스터 exchange=KOSPI (2026-09-18 확인)', version: 'EM-2026.1'
};
const KR_LISTED_FOREIGN_ETF_UNHEDGED_OK = {
  ticker: '360750', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US',
  benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', fxExposure: 'EXPOSED',
  hedgeStatus: 'UNHEDGED', conversionMethod: 'FX_MULTIPLY',
  evidence: '운용사 상품페이지 기초지수 · 환노출 표기 (2026-09-18 확인)', version: 'EM-2026.1'
};
const KR_LISTED_FOREIGN_ETF_HEDGED_OK = Object.assign({}, KR_LISTED_FOREIGN_ETF_UNHEDGED_OK, {
  ticker: '360751', hedgeStatus: 'HEDGED', fxExposure: 'NONE', conversionMethod: 'HEDGE_COST'
});

test('스키마: 필수 enum과 상태값이 정책 그대로 정의돼 있다', () => {
  assert.deepStrictEqual(Object.keys(EM.EM_STATUS).sort(), ['BLOCKED', 'RESOLVED', 'UNRESOLVED']);
  assert.deepStrictEqual(Object.keys(EM.EM_CONVERSION_METHOD).sort(), ['FX_MULTIPLY', 'HEDGE_COST', 'NONE']);
  assert.deepStrictEqual(Object.keys(EM.EM_FX_EXPOSURE).sort(), ['EXPOSED', 'NONE']);
  assert.deepStrictEqual(Object.keys(EM.EM_CURRENCY).sort(), ['KRW', 'USD']);
  // 자산 유형은 §44 매트릭스의 8행 그대로 - 임의로 늘리지 않았다.
  assert.strictEqual(Object.keys(EM.EM_ASSET_TYPE).length, 8);
  // 자산군은 js/05 ASSET_CHARACTERS와 같은 집합(UNRESOLVED는 저장값이 아니라 판정 결과라 제외).
  assert.deepStrictEqual(Object.keys(EM.EM_ASSET_CLASS).sort(),
    ['BOND', 'CASH', 'COMMODITY', 'CRYPTO', 'DEV_EX_US_EQUITY', 'EM_EQUITY', 'KR_EQUITY', 'REAL_ESTATE', 'US_EQUITY']);
});

test('required field: 자산유형마다 필요한 필드만 요구한다(모든 필드 강제 아님)', () => {
  // 원화 현금성에는 환 관련 필드가 필수가 아니다.
  const cashReq = EM.EM_REQUIRED_FIELDS.KRW_CASH;
  ['underlyingCcy', 'fxExposure', 'hedgeStatus', 'conversionMethod', 'benchmark'].forEach((f) => {
    assert.ok(!cashReq.includes(f), `${f}는 원화 현금성의 필수 필드가 아니어야 한다`);
  });
  const krwCash = { ticker: 'KRW-CASH', assetType: 'KRW_CASH', assetClass: 'CASH', priceCcy: 'KRW', evidence: '원화 예수금', version: 'EM-2026.1' };
  assert.strictEqual(EM.validateExposureEntry(krwCash).status, 'RESOLVED');

  // 국내상장 해외 ETF는 기초통화 · 환노출 · 환헤지 · 환산방법까지 전부 필수다.
  ['underlyingCcy', 'fxExposure', 'hedgeStatus', 'conversionMethod'].forEach((f) => {
    assert.ok(EM.EM_REQUIRED_FIELDS.KR_LISTED_FOREIGN_ETF.includes(f), `${f}는 국내상장 해외ETF의 필수 필드다`);
  });
});

test('RESOLVED: 유형별 필수 필드가 모두 있으면 해결로 판정한다', () => {
  assert.strictEqual(EM.validateExposureEntry(KR_STOCK_OK).status, 'RESOLVED');
  assert.strictEqual(EM.validateExposureEntry(KR_LISTED_FOREIGN_ETF_UNHEDGED_OK).status, 'RESOLVED');
  assert.strictEqual(EM.validateExposureEntry(KR_LISTED_FOREIGN_ETF_HEDGED_OK).status, 'RESOLVED');
});

test('UNRESOLVED: 필수 필드가 없으면 추정하지 않고 미해결로 둔다', () => {
  const noHedge = Object.assign({}, KR_LISTED_FOREIGN_ETF_UNHEDGED_OK);
  delete noHedge.hedgeStatus;
  const v = EM.validateExposureEntry(noHedge);
  assert.strictEqual(v.status, 'UNRESOLVED');
  assert.deepStrictEqual(v.missing, ['hedgeStatus']);
  // 미확인을 UNHEDGED로 가정하지 않는다.
  assert.strictEqual(v.violations.length, 0);

  const noBenchmark = Object.assign({}, KR_STOCK_OK); delete noBenchmark.benchmark;
  assert.deepStrictEqual(EM.validateExposureEntry(noBenchmark).missing, ['benchmark']);
  const noEvidence = Object.assign({}, KR_STOCK_OK); delete noEvidence.evidence;
  assert.deepStrictEqual(EM.validateExposureEntry(noEvidence).missing, ['evidence']);
  const noVersion = Object.assign({}, KR_STOCK_OK); delete noVersion.version;
  assert.deepStrictEqual(EM.validateExposureEntry(noVersion).missing, ['version']);
});

test('BLOCKED: 잘못된 enum · 통화코드 · 자산유형은 차단한다', () => {
  assert.strictEqual(EM.validateExposureEntry({ ticker: 'A', assetType: 'MADE_UP' }).status, 'BLOCKED');
  const badCcy = Object.assign({}, KR_STOCK_OK, { priceCcy: 'JPY' });
  const v1 = EM.validateExposureEntry(badCcy);
  assert.strictEqual(v1.status, 'BLOCKED');
  assert.ok(v1.violations.includes('priceCcy:invalid'));
  const badClass = Object.assign({}, KR_STOCK_OK, { assetClass: 'UNRESOLVED' });
  assert.strictEqual(EM.validateExposureEntry(badClass).status, 'BLOCKED');
  const emptyEvidence = Object.assign({}, KR_STOCK_OK, { evidence: '   ' });
  assert.strictEqual(EM.validateExposureEntry(emptyEvidence).status, 'BLOCKED');
});

test('FX 정의 규칙(§44 제6조): 환헤지/환노출과 환산방법이 어긋나면 차단한다', () => {
  const hedgedButExposed = Object.assign({}, KR_LISTED_FOREIGN_ETF_HEDGED_OK, { fxExposure: 'EXPOSED' });
  assert.ok(EM.validateExposureEntry(hedgedButExposed).violations.includes('hedgeStatus:hedgedButFxExposed'));

  const hedgedButMultiply = Object.assign({}, KR_LISTED_FOREIGN_ETF_HEDGED_OK, { conversionMethod: 'FX_MULTIPLY' });
  const v = EM.validateExposureEntry(hedgedButMultiply);
  assert.strictEqual(v.status, 'BLOCKED');
  assert.ok(v.violations.includes('conversionMethod:hedgedNotHedgeCost'));

  const unhedgedNoConversion = Object.assign({}, KR_LISTED_FOREIGN_ETF_UNHEDGED_OK, { conversionMethod: 'NONE' });
  assert.ok(EM.validateExposureEntry(unhedgedNoConversion).violations.includes('conversionMethod:unhedgedNotFxMultiply'));

  // 가격통화 · 기초통화가 모두 KRW인데 환노출이 있다고 적으면 모순이다.
  const krwOnlyExposed = { ticker: 'X', assetType: 'KR_LISTED_DOMESTIC_ETF', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSPI', priceCcy: 'KRW', underlyingCcy: 'KRW', fxExposure: 'EXPOSED', evidence: 'e', version: 'EM-2026.1' };
  assert.ok(EM.validateExposureEntry(krwOnlyExposed).violations.includes('fxExposure:krwOnlyButExposed'));

  // 국내 상장 유형인데 가격통화가 원화가 아니면 유형 정의 위반이다.
  const krTypeUsdPrice = Object.assign({}, KR_STOCK_OK, { priceCcy: 'USD' });
  assert.ok(EM.validateExposureEntry(krTypeUsdPrice).violations.includes('priceCcy:mustBeKrwForType'));
});

test('가격통화 · 기초통화 · 환노출은 각각 독립 필드다(하나로 합치지 않는다)', () => {
  const e = KR_LISTED_FOREIGN_ETF_UNHEDGED_OK;
  // 국내 상장 해외 ETF: 가격은 원화, 기초는 달러, 경제적 환노출은 있음 - 세 값이 모두 다르다.
  assert.strictEqual(e.priceCcy, 'KRW');
  assert.strictEqual(e.underlyingCcy, 'USD');
  assert.strictEqual(e.fxExposure, 'EXPOSED');
  assert.strictEqual(EM.validateExposureEntry(e).status, 'RESOLVED');
  // 같은 기초자산이라도 환헤지형은 환노출이 없고 환산방법이 다르다.
  assert.strictEqual(KR_LISTED_FOREIGN_ETF_HEDGED_OK.underlyingCcy, 'USD');
  assert.strictEqual(KR_LISTED_FOREIGN_ETF_HEDGED_OK.fxExposure, 'NONE');
  assert.strictEqual(KR_LISTED_FOREIGN_ETF_HEDGED_OK.conversionMethod, 'HEDGE_COST');
});

test('원장 구성: 중복 식별자는 어느 쪽도 쓰지 않고, 규칙 위반 항목은 제외한다', () => {
  const dup = Object.assign({}, KR_STOCK_OK, { benchmark: 'KOSDAQ' });
  const built = EM.buildExposureMaster([KR_STOCK_OK, dup, KR_LISTED_FOREIGN_ETF_UNHEDGED_OK]);
  assert.deepStrictEqual(built.duplicates, [EM.exposureIdentityOf(KR_STOCK_OK)]);
  assert.strictEqual(built.byIdentity[EM.exposureIdentityOf(KR_STOCK_OK)], undefined);
  assert.ok(built.byIdentity[EM.exposureIdentityOf(KR_LISTED_FOREIGN_ETF_UNHEDGED_OK)]);

  const blocked = Object.assign({}, KR_LISTED_FOREIGN_ETF_HEDGED_OK, { conversionMethod: 'FX_MULTIPLY' });
  const built2 = EM.buildExposureMaster([blocked]);
  assert.strictEqual(built2.size, 0);
  assert.strictEqual(built2.invalid.length, 1);
  assert.strictEqual(built2.invalid[0].verdict.status, 'BLOCKED');

  // 티커가 없으면 공통 식별자를 만들 수 없다.
  const noTicker = Object.assign({}, KR_STOCK_OK); delete noTicker.ticker;
  const built3 = EM.buildExposureMaster([noTicker]);
  assert.strictEqual(built3.size, 0);
  assert.strictEqual(built3.invalid[0].identity, null);
});

test('식별자는 종목 단위 공통 사실이며 소유자 · 계좌를 섞지 않는다', () => {
  const husband = { ticker: '005930', owner: '신랑', accountType: '일반계좌' };
  const wife = { ticker: '005930', owner: '와이프', accountType: 'ISA' };
  assert.strictEqual(EM.exposureIdentityOf(husband), EM.exposureIdentityOf(wife));
  assert.strictEqual(EM.exposureIdentityOf({ ticker: '  aapl ' }), 'AAPL');
  assert.strictEqual(EM.exposureIdentityOf({ ticker: '' }), null);
});

test('유형 추정은 확정 가능한 범위에서만 값을 주고 나머지는 null이다', () => {
  assert.strictEqual(EM.suggestExposureAssetType({ category: '주식', isDomestic: '국내' }), 'KR_STOCK');
  assert.strictEqual(EM.suggestExposureAssetType({ category: '주식', isDomestic: '해외' }), 'FOREIGN_STOCK');
  assert.strictEqual(EM.suggestExposureAssetType({ category: '현금', currency: 'USD' }), 'FX_CASH');
  assert.strictEqual(EM.suggestExposureAssetType({ category: '현금', currency: 'KRW' }), 'KRW_CASH');
  // 국내 상장 ETF의 기초자산이 국내인지 해외인지는 이 정보만으로 알 수 없다 - 추정하지 않는다.
  assert.strictEqual(EM.suggestExposureAssetType({ category: 'ETF', isDomestic: '국내' }), null);
  assert.strictEqual(EM.suggestExposureAssetType({ category: '부동산' }), null);
});

test('[Phase 1A] 비활성: 플래그가 꺼져 있고 어떤 자산도 해결해 주지 않는다', () => {
  assert.strictEqual(EM.EXPOSURE_MASTER_ENABLED, false);
  assert.strictEqual(EM.isExposureMasterActive(), false);
  // 원장은 비어 있다(실제 데이터 입력은 Phase 1B).
  assert.strictEqual(EM.EXPOSURE_MASTER_ENTRIES.length, 0);
  assert.strictEqual(EM.EXPOSURE_MASTER.size, 0);
  // 완전한 항목을 넣은 원장을 넘겨도 비활성 상태에서는 값을 내주지 않는다.
  const master = EM.buildExposureMaster([KR_STOCK_OK]);
  const r = EM.resolveExposure(KR_STOCK_OK, master);
  assert.strictEqual(r.active, false);
  assert.strictEqual(r.status, 'UNRESOLVED');
  assert.strictEqual(r.reason, 'MASTER_INACTIVE');
  assert.strictEqual(r.entry, null);
});

test('[Phase 1A] 기존 경로 무간섭: 이 모듈은 다른 전역을 만들거나 바꾸지 않는다', () => {
  // require만으로 앱 전역(Risk · MC · Return Key 관련)이 생기지 않아야 한다.
  ['state', 'computeAdvancedRiskMetrics', 'runMonthlyPrecisionMC', 'RETURN_KEY_CHARACTER', 'resolveRiskBenchmark']
    .forEach((name) => assert.strictEqual(typeof globalThis[name], 'undefined', `${name}이 전역에 생기면 안 된다`));
  // 원장 조회는 순수 함수이며 입력 객체를 바꾸지 않는다.
  const before = JSON.stringify(KR_STOCK_OK);
  EM.validateExposureEntry(KR_STOCK_OK);
  EM.resolveExposure(KR_STOCK_OK);
  assert.strictEqual(JSON.stringify(KR_STOCK_OK), before);
});
