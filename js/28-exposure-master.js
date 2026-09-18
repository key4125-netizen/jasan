/* -------------------------------------------------------------------------
 * 28. Exposure Master - Risk · MC 공통 사실 원장 (체크리스트 §44 제5조)
 *
 * [Phase 1B · 활성] 구조(1A) 위에 앱 기본 자산의 사실 정보를 채우고 활성화했다(§44 제46조).
 *   - EXPOSURE_MASTER_ENABLED = true. 다만 원장은 기존 판정을 "대체"하지 않고 "선행"한다 -
 *     RESOLVED 항목만 값을 주고, 나머지는 기존 Risk · MC 경로가 그대로 실행된다.
 *   - 담은 범위: 앱이 코드로 이미 알고 있는 종목뿐이다(js/09 SECTOR_MAP 개별주 ·
 *     js/09 ETF_HOLDINGS_MAP ETF). 사용자 보유 수량 · 금액 · 거래내역은 담지 않는다.
 *   - 근거 없는 값을 채우지 않는다. 앱에 대응 지수가 없으면 benchmark를 비워 UNRESOLVED로 둔다.
 *
 * [무엇을 담는가]
 *   "이 자산이 무엇에 노출되어 있는가"라는 사실만 담는다. 사용자의 기대수익률 가정
 *   (Return Key)은 여기 들어오지 않는다 - 두 축은 §44 제3조 · 제5조(EM-3)에 따라 분리한다.
 *
 * [가장 중요한 FX 원칙 - §44 제6조]
 *   Risk는 "관측된 가격계열의 통화(priceCcy)"로 측정하고,
 *   MC는 "실제 경제적 환노출(fxExposure · hedgeStatus)"로 생성한다.
 *   그래서 priceCcy · underlyingCcy · fxExposure 를 하나의 currency 필드로 합치지 않는다.
 *   예: 국내 상장 해외 ETF는 priceCcy=KRW 이지만 underlyingCcy=USD 이고,
 *       환노출형이면 fxExposure=EXPOSED(MC는 환율을 결합), 환헤지형이면 NONE이다.
 *       Risk는 두 경우 모두 원화 가격계열을 그대로 쓰므로 환율을 다시 곱하지 않는다.
 * ---------------------------------------------------------------------- */

// [§44 제46조] Phase 1B에서 앱 기본 자산 데이터가 채워져 활성화했다.
const EXPOSURE_MASTER_ENABLED = true;
const EXPOSURE_MASTER_SCHEMA_VERSION = 1;

/* --- 1. Enum -------------------------------------------------------------
 * 자산군(assetClass)은 js/05 ASSET_CHARACTERS와 같은 문자열 집합을 쓴다. 여기서
 * 다시 선언하는 이유는 로드 순서 · Node 단위 테스트에서의 독립 실행 때문이며,
 * 값을 새로 만들지 않는다(UNRESOLVED는 "저장 값"이 아니라 판정 결과라 제외).
 */
const EM_ASSET_CLASS = Object.freeze({
  KR_EQUITY: 'KR_EQUITY', US_EQUITY: 'US_EQUITY', EM_EQUITY: 'EM_EQUITY',
  DEV_EX_US_EQUITY: 'DEV_EX_US_EQUITY', BOND: 'BOND', CASH: 'CASH',
  REAL_ESTATE: 'REAL_ESTATE', COMMODITY: 'COMMODITY', CRYPTO: 'CRYPTO'
});
// 실질 시장 노출(어느 시장의 움직임을 타는가). 지역 표기가 아니라 노출 대상이다.
const EM_MARKET_EXPOSURE = Object.freeze({
  KR: 'KR', US: 'US', DEV_EX_US: 'DEV_EX_US', EM: 'EM', GLOBAL: 'GLOBAL', NONE: 'NONE'
});
// 통화는 앱이 실제로 다루는 두 가지만 인정한다(js/01 normalizeCurrency와 같은 집합).
const EM_CURRENCY = Object.freeze({ KRW: 'KRW', USD: 'USD' });
// 경제적 환노출 여부(MC 전용 판단 축).
const EM_FX_EXPOSURE = Object.freeze({ NONE: 'NONE', EXPOSED: 'EXPOSED' });
const EM_HEDGE_STATUS = Object.freeze({ UNHEDGED: 'UNHEDGED', HEDGED: 'HEDGED', NOT_APPLICABLE: 'NOT_APPLICABLE' });
// 환산 방법 - §44 제5조 ConversionMethod.
const EM_CONVERSION_METHOD = Object.freeze({ NONE: 'NONE', FX_MULTIPLY: 'FX_MULTIPLY', HEDGE_COST: 'HEDGE_COST' });
// 자산 유형 - §44 44-1 "자산유형별 필수 필드 매트릭스"의 8행을 그대로 쓴다(새 유형 추가 없음).
const EM_ASSET_TYPE = Object.freeze({
  KRW_CASH: 'KRW_CASH',
  FX_CASH: 'FX_CASH',
  KR_STOCK: 'KR_STOCK',
  FOREIGN_STOCK: 'FOREIGN_STOCK',
  KR_LISTED_DOMESTIC_ETF: 'KR_LISTED_DOMESTIC_ETF',
  KR_LISTED_FOREIGN_ETF: 'KR_LISTED_FOREIGN_ETF',
  FOREIGN_LISTED_ETF: 'FOREIGN_LISTED_ETF',
  BOND_OTHER: 'BOND_OTHER'
});
// 판정 상태. §44 제20조의 UNRESOLVED를 그대로 쓰고, "값은 있는데 규칙을 어긴" 경우를
// BLOCKED로 따로 구분한다(정보 부족과 정의 위반은 원인이 다르다).
const EM_STATUS = Object.freeze({ RESOLVED: 'RESOLVED', UNRESOLVED: 'UNRESOLVED', BLOCKED: 'BLOCKED' });

/* --- 2. 자산유형별 필수 필드 (§44 44-1 매트릭스) ------------------------
 * "모든 자산에 모든 필드를 강제하지 않는다"(§44 제5조 EM-4). N/A 칸이 비어 있는 것은
 * 정상이며 오류로 보지 않는다. 아래 목록에 없는 필드는 선택 항목이다.
 */
const EM_REQUIRED_FIELDS = Object.freeze({
  KRW_CASH: Object.freeze(['assetClass', 'priceCcy', 'evidence', 'version']),
  FX_CASH: Object.freeze(['assetClass', 'priceCcy', 'underlyingCcy', 'fxExposure', 'evidence', 'version']),
  KR_STOCK: Object.freeze(['assetClass', 'marketExposure', 'benchmark', 'priceCcy', 'evidence', 'version']),
  FOREIGN_STOCK: Object.freeze(['assetClass', 'marketExposure', 'benchmark', 'priceCcy', 'underlyingCcy', 'fxExposure', 'evidence', 'version']),
  KR_LISTED_DOMESTIC_ETF: Object.freeze(['assetClass', 'marketExposure', 'benchmark', 'priceCcy', 'evidence', 'version']),
  KR_LISTED_FOREIGN_ETF: Object.freeze(['assetClass', 'marketExposure', 'benchmark', 'priceCcy', 'underlyingCcy', 'fxExposure', 'hedgeStatus', 'conversionMethod', 'evidence', 'version']),
  FOREIGN_LISTED_ETF: Object.freeze(['assetClass', 'marketExposure', 'benchmark', 'priceCcy', 'underlyingCcy', 'fxExposure', 'hedgeStatus', 'conversionMethod', 'evidence', 'version']),
  // 채권 · 기타는 §44 매트릭스에서 benchmark · underlyingCcy · fxExposure · hedgeStatus가
  // "조건부"다 - 필수로 강제하지 않고, 값이 들어오면 규칙 검사만 받는다.
  BOND_OTHER: Object.freeze(['assetClass', 'marketExposure', 'priceCcy', 'evidence', 'version'])
});
// priceCcy가 KRW로 고정되는 유형(§44 매트릭스의 "필수(KRW)" 칸).
const EM_KRW_PRICED_TYPES = Object.freeze(['KRW_CASH', 'KR_STOCK', 'KR_LISTED_DOMESTIC_ETF', 'KR_LISTED_FOREIGN_ETF']);

/* --- 3. 식별자 -----------------------------------------------------------
 * 원장은 "공통 사실"만 담으므로 소유자 · 계좌를 식별자에 넣지 않는다(§44 제5조).
 * 같은 종목이라도 사용자별 설정(Return Key · 목표 비중 등)은 기존 구조가 계속 관리하며,
 * 이 원장이 덮어쓰지 않는다.
 */
function exposureIdentityOf(assetLike) {
  const raw = assetLike && typeof assetLike === 'object' ? assetLike.ticker : assetLike;
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // 기존 티커 정규화(js/05 sanitizeTicker)가 로드돼 있으면 그대로 재사용한다 -
  // 야후 티커 기준 식별을 Risk · MC와 어긋나지 않게 하기 위함이다.
  if (typeof sanitizeTicker === 'function') {
    const y = sanitizeTicker(s).yahooTicker;
    if (y) s = y;
  }
  return s.toUpperCase();
}

/* --- 4. 검증 -------------------------------------------------------------
 * 반환: { status, assetType, missing[], violations[] }
 *   RESOLVED   - 그 유형에 필요한 정보가 모두 있고 규칙 위반이 없다.
 *   UNRESOLVED - 필요한 정보가 없다(추정해서 채우지 않는다 - §44 제20조).
 *   BLOCKED    - 값이 enum/정의 규칙을 위반했다(그 상태로 쓰면 안 된다).
 */
function isEnumValue(enumObj, v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(enumObj, v);
}
function validateExposureEntry(entry) {
  const missing = [];
  const violations = [];
  const e = entry && typeof entry === 'object' ? entry : {};
  const assetType = typeof e.assetType === 'string' ? e.assetType : null;

  if (!assetType || !isEnumValue(EM_ASSET_TYPE, assetType)) {
    return { status: EM_STATUS.BLOCKED, assetType: null, missing: [], violations: ['assetType:invalid'] };
  }
  if (!exposureIdentityOf(e)) missing.push('ticker');

  // 4-1. enum · 통화 코드 검사(값이 들어온 필드만).
  const enumChecks = [
    ['assetClass', EM_ASSET_CLASS], ['marketExposure', EM_MARKET_EXPOSURE],
    ['priceCcy', EM_CURRENCY], ['underlyingCcy', EM_CURRENCY],
    ['fxExposure', EM_FX_EXPOSURE], ['hedgeStatus', EM_HEDGE_STATUS],
    ['conversionMethod', EM_CONVERSION_METHOD]
  ];
  enumChecks.forEach(([field, enumObj]) => {
    if (e[field] === undefined || e[field] === null || e[field] === '') return;
    if (!isEnumValue(enumObj, e[field])) violations.push(`${field}:invalid`);
  });
  if (e.benchmark !== undefined && e.benchmark !== null && String(e.benchmark).trim() === '') violations.push('benchmark:empty');
  if (e.evidence !== undefined && e.evidence !== null && String(e.evidence).trim() === '') violations.push('evidence:empty');
  if (e.version !== undefined && e.version !== null && String(e.version).trim() === '') violations.push('version:empty');

  // 4-2. 필수 필드 누락(그 유형에 의미 있는 필드만).
  (EM_REQUIRED_FIELDS[assetType] || []).forEach((field) => {
    const v = e[field];
    if (v === undefined || v === null || String(v).trim() === '') missing.push(field);
  });

  // 4-3. 정의 규칙(§44 제6조를 그대로 옮긴 것 - 새 사업규칙이 아니다).
  //   · 환헤지형은 경제적 환노출이 없고 헤지비용으로 환산한다.
  //   · 환노출형은 환율을 결합한다.
  //   · 가격통화와 기초통화가 모두 KRW면 환노출이 없다.
  if (e.hedgeStatus === EM_HEDGE_STATUS.HEDGED) {
    if (e.fxExposure && e.fxExposure !== EM_FX_EXPOSURE.NONE) violations.push('hedgeStatus:hedgedButFxExposed');
    if (e.conversionMethod && e.conversionMethod !== EM_CONVERSION_METHOD.HEDGE_COST) violations.push('conversionMethod:hedgedNotHedgeCost');
  }
  if (e.hedgeStatus === EM_HEDGE_STATUS.UNHEDGED) {
    if (e.fxExposure && e.fxExposure !== EM_FX_EXPOSURE.EXPOSED) violations.push('hedgeStatus:unhedgedButNoFxExposure');
    if (e.conversionMethod && e.conversionMethod !== EM_CONVERSION_METHOD.FX_MULTIPLY) violations.push('conversionMethod:unhedgedNotFxMultiply');
  }
  if (e.fxExposure === EM_FX_EXPOSURE.NONE && e.conversionMethod === EM_CONVERSION_METHOD.FX_MULTIPLY) {
    violations.push('conversionMethod:noExposureButMultiply');
  }
  if (e.fxExposure === EM_FX_EXPOSURE.EXPOSED && e.conversionMethod === EM_CONVERSION_METHOD.NONE) {
    violations.push('conversionMethod:exposedButNone');
  }
  if (e.priceCcy === EM_CURRENCY.KRW && e.underlyingCcy === EM_CURRENCY.KRW && e.fxExposure === EM_FX_EXPOSURE.EXPOSED) {
    violations.push('fxExposure:krwOnlyButExposed');
  }
  if (EM_KRW_PRICED_TYPES.includes(assetType) && e.priceCcy && e.priceCcy !== EM_CURRENCY.KRW) {
    violations.push('priceCcy:mustBeKrwForType');
  }
  if (assetType === EM_ASSET_TYPE.FX_CASH && e.underlyingCcy && e.priceCcy && e.underlyingCcy !== e.priceCcy) {
    violations.push('underlyingCcy:cashMustMatchPriceCcy');
  }

  if (violations.length) return { status: EM_STATUS.BLOCKED, assetType, missing, violations };
  if (missing.length) return { status: EM_STATUS.UNRESOLVED, assetType, missing, violations };
  return { status: EM_STATUS.RESOLVED, assetType, missing, violations };
}

/* --- 5. 원장 구성 --------------------------------------------------------
 * 같은 식별자가 두 번 나오면 둘 다 쓰지 않는다(어느 쪽이 맞는지 모르는 상태이므로
 * 임의로 하나를 고르지 않는다 - §44 제20조의 추정 금지와 같은 취지).
 */
function buildExposureMaster(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const byIdentity = Object.create(null);
  const duplicates = [];
  const invalid = [];
  const seen = Object.create(null);

  list.forEach((entry, index) => {
    const identity = exposureIdentityOf(entry);
    const verdict = validateExposureEntry(entry);
    if (!identity) { invalid.push({ index, identity: null, verdict }); return; }
    if (seen[identity]) {
      if (!duplicates.includes(identity)) duplicates.push(identity);
      delete byIdentity[identity];
      return;
    }
    seen[identity] = true;
    if (verdict.status === EM_STATUS.BLOCKED) { invalid.push({ index, identity, verdict }); return; }
    byIdentity[identity] = { entry, verdict };
  });

  return {
    schemaVersion: EXPOSURE_MASTER_SCHEMA_VERSION,
    byIdentity,
    duplicates,
    invalid,
    size: Object.keys(byIdentity).length
  };
}

/* [Phase 1B] 앱이 코드로 이미 알고 있는 종목의 사실 정보.
 * 근거(evidence)는 전부 저장소 안에서 확인 가능한 것만 쓴다 - 외부 로그인 · API Key ·
 * 유료 데이터 없이 재확인할 수 있어야 하기 때문이다.
 *   · 상장 거래소 : data/ticker-master.json(KIS 공식 종목마스터, 매달 자동 생성)
 *   · 추종 지수   : js/09 ETF_HOLDINGS_MAP의 label(앱이 이미 선언해 둔 사실)
 *   · 앱 보유 지수: js/09 INDEX_TICKERS(KOSPI · KOSDAQ · NASDAQ · SP500 · NASDAQ100 · DOW)
 * benchmark를 비워 둔 항목은 "모르는 것"이 아니라 "앱에 대응 지수가 없는 것"이다 -
 * 비슷한 지수로 대신 채우지 않는다(§44 제10조).
 * 제외한 것: TSM(미국 상장 ADR - 기초 기업의 경제적 통화 · 자산군을 확정할 근거가
 * 저장소 안에 없다), Return Key 전용 키(NASDAQ · S&P500 · DEV_EX_US · EMERGING -
 * 종목이 아니라 수익률 기준이므로 이 원장의 대상이 아니다 · §44 제3조).
 */
const EXPOSURE_MASTER_ENTRIES = Object.freeze([
  // --- 국내 상장 개별주(js/09 SECTOR_MAP 등록 종목) ---------------------------
  { ticker: "005930.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "000660.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "035420.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "035720.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "051910.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "006400.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "373220.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "005380.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "000270.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "105560.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "055550.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "086790.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "207940.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "068270.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "028260.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  { ticker: "015760.KS", assetType: "KR_STOCK", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 원화 상장 개별주", version: "EM-2026.1" },
  // --- 해외(미국) 상장 개별주 ------------------------------------------------
  //   NYSE · AMEX 상장분은 앱에 해당 종합지수가 없어 benchmark를 비워 둔다(UNRESOLVED).
  { ticker: "AAPL", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "MSFT", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "GOOGL", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "GOOG", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "AMZN", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "NVDA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "AVGO", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "AMD", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "META", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "TSLA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "NFLX", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시)", version: "EM-2026.1" },
  { ticker: "JPM", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "V", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "MA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "JNJ", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "UNH", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "XOM", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "CVX", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "PG", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  { ticker: "KO", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음", version: "EM-2026.1" },
  // --- 해외(미국) 상장 ETF(js/09 ETF_HOLDINGS_MAP 등록분) --------------------
  { ticker: "QQQM", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ100", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100\"", version: "EM-2026.1" },
  { ticker: "QQQ", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ100", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100\"", version: "EM-2026.1" },
  { ticker: "SPY", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "SPYM", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "VOO", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "SOXX", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"반도체 ETF\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "SMH", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"반도체 ETF\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "TQQQ", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100 3배 레버리지\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "SCHD", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"미국 배당 ETF\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "TLT", assetType: "FOREIGN_LISTED_ETF", assetClass: "BOND", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"미국 장기국채\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "IEF", assetType: "FOREIGN_LISTED_ETF", assetClass: "BOND", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"미국 중기국채\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  // --- 국내 상장 ETF(기초자산 국내) -----------------------------------------
  //   KOSPI200을 추종하지만 앱이 가진 지수는 KOSPI 종합뿐이라 benchmark를 비워 둔다.
  { ticker: "069500.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 앱 ETF 구성표 label=\"KODEX 200\" · 앱에 KOSPI200 지수 없음", version: "EM-2026.1" },
  { ticker: "102110.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 앱 ETF 구성표 label=\"TIGER 200\" · 앱에 KOSPI200 지수 없음", version: "EM-2026.1" },
]);
const EXPOSURE_MASTER = buildExposureMaster(EXPOSURE_MASTER_ENTRIES);

/* --- 6. 조회 -------------------------------------------------------------
 * 비활성(Phase 1A) 상태에서는 어떤 자산에 대해서도 값을 만들어 주지 않는다.
 * 호출부가 생기더라도 기존 경로를 대체하지 못하게 하기 위함이다(§44 제46조).
 */
function isExposureMasterActive() {
  return EXPOSURE_MASTER_ENABLED === true;
}
function lookupExposure(assetLike, master) {
  const m = master || EXPOSURE_MASTER;
  const identity = exposureIdentityOf(assetLike);
  if (!identity) return null;
  return m.byIdentity[identity] || null;
}
function resolveExposure(assetLike, master) {
  if (!isExposureMasterActive()) {
    return { active: false, status: EM_STATUS.UNRESOLVED, reason: 'MASTER_INACTIVE', identity: exposureIdentityOf(assetLike), entry: null, missing: [], violations: [] };
  }
  const identity = exposureIdentityOf(assetLike);
  if (!identity) {
    return { active: true, status: EM_STATUS.UNRESOLVED, reason: 'NO_IDENTITY', identity: null, entry: null, missing: ['ticker'], violations: [] };
  }
  const hit = lookupExposure(assetLike, master);
  if (!hit) {
    return { active: true, status: EM_STATUS.UNRESOLVED, reason: 'NOT_IN_MASTER', identity, entry: null, missing: [], violations: [] };
  }
  return {
    active: true,
    status: hit.verdict.status,
    reason: hit.verdict.status === EM_STATUS.RESOLVED ? 'OK' : 'INCOMPLETE_ENTRY',
    identity,
    entry: hit.verdict.status === EM_STATUS.RESOLVED ? hit.entry : null,
    missing: hit.verdict.missing,
    violations: hit.verdict.violations
  };
}

/* --- 6-1. Risk · MC 연결점 ----------------------------------------------
 * 이 두 함수만이 원장을 바깥에 내보내는 통로다. RESOLVED가 아니면 null을 주고,
 * 호출부는 기존 로직으로 그대로 넘어간다 - 원장이 기존 판정을 조용히 덮어쓰지 않는다.
 */
function resolveExposureBenchmark(assetLike, master) {
  const r = resolveExposure(assetLike, master);
  if (r.status !== EM_STATUS.RESOLVED || !r.entry) return null;
  return r.entry.benchmark || null;
}
function resolveExposureAssetClass(assetLike, master) {
  const r = resolveExposure(assetLike, master);
  if (r.status !== EM_STATUS.RESOLVED || !r.entry) return null;
  return r.entry.assetClass || null;
}

/* --- 7. 유형 추정(참고용) ------------------------------------------------
 * 기존 자산 레코드(js/01)의 category · isDomestic · currency 만으로 판정 가능한
 * 범위에서만 유형을 제안한다. ETF의 기초자산이 국내인지 해외인지, 환헤지형인지는
 * 이 정보만으로 알 수 없으므로 null을 돌려준다 - 그 판정은 근거와 함께 Phase 1B에서
 * 사람이 확정한다(추정해서 채우지 않는다).
 */
function suggestExposureAssetType(asset) {
  const a = asset && typeof asset === 'object' ? asset : {};
  const category = String(a.category ?? '').trim();
  const currency = String(a.currency ?? '').trim().toUpperCase();
  const region = String(a.isDomestic ?? '').trim();
  if (category === '현금') return currency === 'USD' ? EM_ASSET_TYPE.FX_CASH : EM_ASSET_TYPE.KRW_CASH;
  if (category === '주식') {
    if (region === '국내') return EM_ASSET_TYPE.KR_STOCK;
    if (region === '해외') return EM_ASSET_TYPE.FOREIGN_STOCK;
    return null;
  }
  if (category === 'ETF') {
    // 해외 거래소 상장 ETF는 가격통화로 구분되지만, 국내 상장 ETF는 기초자산이
    // 국내인지 해외인지를 이 레코드만으로 알 수 없다.
    if (region === '해외') return EM_ASSET_TYPE.FOREIGN_LISTED_ETF;
    return null;
  }
  if (category === '채권') return EM_ASSET_TYPE.BOND_OTHER;
  return null;
}

// js/15 · js/26 등과 같은 export 패턴(브라우저에서는 전역, Node 테스트에서는 require).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EXPOSURE_MASTER_ENABLED, EXPOSURE_MASTER_SCHEMA_VERSION,
    EM_ASSET_CLASS, EM_MARKET_EXPOSURE, EM_CURRENCY, EM_FX_EXPOSURE,
    EM_HEDGE_STATUS, EM_CONVERSION_METHOD, EM_ASSET_TYPE, EM_STATUS,
    EM_REQUIRED_FIELDS, EM_KRW_PRICED_TYPES,
    exposureIdentityOf, validateExposureEntry, buildExposureMaster,
    EXPOSURE_MASTER_ENTRIES, EXPOSURE_MASTER,
    isExposureMasterActive, lookupExposure, resolveExposure, suggestExposureAssetType,
    resolveExposureBenchmark, resolveExposureAssetClass
  };
}
