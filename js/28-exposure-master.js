/* -------------------------------------------------------------------------
 * 28. Exposure Master - Risk · MC 공통 사실 원장 (체크리스트 §44 제5조)
 *
 * [Phase 1B · 활성] 구조(1A) 위에 앱 기본 자산의 사실 정보를 채우고 활성화했다(§44 제46조).
 *   - EXPOSURE_MASTER_ENABLED = true. 다만 원장은 기존 판정을 "대체"하지 않고 "선행"한다 -
 *     RESOLVED 항목만 값을 주고, 나머지는 기존 Risk · MC 경로가 그대로 실행된다.
 *   - 담은 범위: 앱이 코드로 이미 알고 있는 종목(js/09 SECTOR_MAP 개별주 · js/09 ETF_HOLDINGS_MAP ETF ·
 *     EM-2026.1)과 PM이 공식 기초지수를 확인한 상품(EM-2026.2 · 근거 등급 A).
 *     사용자 보유 수량 · 금액 · 거래내역은 담지 않는다(상품의 사실만 담는다).
 *   - [1차 통합 구현 · D-16] 자산 성격(Asset Character) · MC 자산군의 우선 근거다(js/05 resolveAssetCharacter).
 *     단 Return Key 자동 판정에는 쓰지 않는다 - 원장 추가가 MC 기대수익률(μ)을 조용히 바꾸지 않게 한다.
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
// [1차 통합 구현 · §44 44-16 Evidence Grade] 근거 등급. 자동 연결(Benchmark · 환헤지 판정)은 A만 쓴다.
//   A - 공식 1차 자료(운용사 상품정보 · 투자설명서 · 규제기관 공시 · 지수산출기관 · 거래소/KIS 종목마스터)
//   B - 공식 자료의 2차 요약(데이터 벤더 · 포털) - 기록만 하고 자동 연결 근거로 쓰지 않는다
//   C - 확인 불가 · 추정 - 원장 값으로 넣지 않는다(해당 필드를 비워 UNRESOLVED/HOLD로 둔다)
// 기존 49건(EM-2026.1)은 이 필드 없이 저장소 안 근거(종목마스터 · ETF 구성표)만 쓴다 - 소급해 채우지 않는다.
const EM_EVIDENCE_GRADE = Object.freeze({ A: 'A', B: 'B', C: 'C' });
// [1차 통합 구현 · §44 44-16] 한 상품이 여러 자산군을 함께 담는 구조(주식 + 채권 혼합 등).
// 1:N 노출 구조는 아직 만들지 않는다 - 이 표시가 있으면 단일 자산군 · 단일 Benchmark를 주지 않고
// UNRESOLVED(MIXED_EXPOSURE)로 둔다(혼합 ETF를 단일 Benchmark로 강제하지 않는다).
const EM_EXPOSURE_STRUCTURE = Object.freeze({ MIXED: 'MIXED' });
// [2차 통합 보완 · D-06 · PM 결정 ③] 해외 상장 개별주의 상장 형태. 거래소 상장 사실만으로는 정하지 않는다 -
// 공식 1차 자료(근거 등급 A)로 확인된 경우에만 적는다. HOME_COMMON(본국 보통주)만 원장 Benchmark를 쓴다.
const EM_EQUITY_LISTING = Object.freeze({ HOME_COMMON: 'HOME_COMMON', ADR: 'ADR' });
/* [D-11 · §47-5 · PM APPROVED 2026-09-20] 본국 보통주 판정 규칙 v2.
 * v1은 등록증권의 "명칭"이 보통주(common stock)인지를 봤다. 그러나 이 규칙의 목적은 "외국 발행인 ·
 * 예탁증권을 국내 대표지수와 비교하지 않는 것"이지 명칭 대조가 아니다 - 같은 발행인이 의결권만 다르게
 * 발행한 지분증권(예: Alphabet Class C Capital Stock)까지 보류시키면 목적과 무관하게 정보만 잃는다.
 * v2 판정 조건(네 가지를 모두 만족해야 HOME_COMMON):
 *   ① 발행인이 미국 주에 설립됐다(SEC EDGAR 설립지)
 *   ② 연차보고서가 10-K다(외국 발행인 20-F · 40-F가 아니다)
 *   ③ 해당 종목이 그 발행인의 본국 발행 지분증권이다(보통주 및 의결권만 다른 동일 지분권)
 *   ④ 예탁증권(ADR/ADS) · 우선주 · ETF가 아니다
 * 거래소 상장 사실만으로는 절대 판정하지 않는다(그 금지는 v1과 동일). 불명확 · 충돌은 REVIEW로 남긴다. */
const HOME_COMMON_RULE_VERSION = 'v2';
/* [P-5 · PM 승인 2026-09-20] 규칙이 바뀌었을 때 "무엇을 다시 봐야 하는가"를 기계가 찾을 수 있어야 한다.
 * 원장 항목의 근거 문구에는 어떤 규칙 버전으로 판정했는지가 적혀 있다(예: HOME_COMMON_RULE_V2).
 * 아래 두 함수가 그 표기를 읽어, 규칙이 올라갔을 때 옛 버전으로 판정된 항목만 골라낸다 -
 * 전수 재조사 대신 대상만 다시 보게 하는 것이 목적이다(자동 재적용은 하지 않는다 · N-2 범위). */
function equityListingRuleVersionOf(entry) {
  // 근거 문구에는 버전이 여러 번 적힐 수 있다(예: v1으로 판정한 뒤 v2 기준으로 재확인).
  // 그 항목이 "지금 어느 규칙 위에 서 있는가"는 그중 가장 높은 버전이다.
  const all = String((entry && entry.evidence) || '').match(/HOME_COMMON_RULE_V(\d+)/gi) || [];
  if (!all.length) return null;
  const max = Math.max.apply(null, all.map((x) => Number(/(\d+)$/.exec(x)[1])));
  return 'v' + max;
}
function listEntriesJudgedUnderOlderRule(currentVersion) {
  const target = String(currentVersion || HOME_COMMON_RULE_VERSION).toLowerCase();
  return EXPOSURE_MASTER_ENTRIES
    .filter((e) => e.equityListing)
    .map((e) => ({ ticker: e.ticker, ruleVersion: equityListingRuleVersionOf(e) }))
    .filter((x) => x.ruleVersion !== target);
}

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
    ['conversionMethod', EM_CONVERSION_METHOD],
    ['evidenceGrade', EM_EVIDENCE_GRADE], ['exposureStructure', EM_EXPOSURE_STRUCTURE],
    ['equityListing', EM_EQUITY_LISTING]
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
  // [§44 44-16] 근거 등급이 A가 아니면 자동 연결에 쓰는 사실(Benchmark · 환헤지)을 담지 않는다.
  if (e.evidenceGrade && e.evidenceGrade !== EM_EVIDENCE_GRADE.A && (e.benchmark || e.hedgeStatus)) {
    violations.push('evidenceGrade:notAForAutoLink');
  }
  // [D-06 · PM 결정 ③] 상장 형태(본국 보통주 · ADR)는 A등급 근거로만 적고, 개별주에만 쓴다.
  if (e.equityListing && e.evidenceGrade !== EM_EVIDENCE_GRADE.A) violations.push('equityListing:notGradeA');
  if (e.equityListing && assetType !== EM_ASSET_TYPE.FOREIGN_STOCK) violations.push('equityListing:notForeignStock');
  // [§44 44-16] 혼합 노출 상품에는 단일 자산군 · 단일 Benchmark를 적지 않는다.
  const mixed = e.exposureStructure === EM_EXPOSURE_STRUCTURE.MIXED;
  if (mixed && (e.assetClass || e.benchmark)) violations.push('exposureStructure:mixedButSingleClass');

  if (violations.length) return { status: EM_STATUS.BLOCKED, assetType, missing, violations };
  // 혼합 노출은 "정보가 모자란 것"이 아니라 "단일 값으로 표현하면 왜곡되는 것"이다 - 사유를 따로 남긴다.
  if (mixed) return { status: EM_STATUS.UNRESOLVED, assetType, missing, violations, mixedExposure: true };
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
 * 근거(evidence)는 외부 로그인 · API Key · 유료 데이터 없이 재확인할 수 있는 것만 쓴다.
 * EM-2026.1은 저장소 안 근거만, EM-2026.2는 운용사 공식 공개자료(근거 등급 A · evidenceGrade)를 쓴다.
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
  //   [실행 묶음 B · 2026-09-20] 본국 보통주 여부(equityListing)를 1차 자료로 확인해 채웠다 - SEC EDGAR 설립지 ·
  //   연차보고서 서식(10-K) · 거래소 종목 디렉터리/10-K 표지의 증권 종류 세 가지를 모두 만족한 19건만 HOME_COMMON이다
  //   (판정 규칙 · 기록 docs/closeout/research/us-home-common.json). 거래소 상장 사실만으로는 판정하지 않는다.
  //   [D-11 · 2026-09-20] 규칙 v2(위 HOME_COMMON_RULE_VERSION 주석) 채택으로 GOOG도 HOME_COMMON이 됐다 - 같은 발행인의
  //   본국 발행 지분증권이고 ADR이 아니며, Class C는 의결권만 다르다(10-K 표지 12(b) 등록증권으로 확인). 20건이 됐다.
  //   NYSE 상장분은 본국 보통주가 확인돼도 앱에 NYSE 종합지수가 없어 benchmark가 비어 있다(여전히 UNRESOLVED · 대장 D-2).
  { ticker: "AAPL", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 CA · 연차보고서 10-K(2025-10-31) · 증권 종류 \"Apple Inc. - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "MSFT", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 WA · 연차보고서 10-K(2026-07-29) · 증권 종류 \"Microsoft Corporation - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "GOOGL", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-05) · 증권 종류 \"Class A Common Stock, $0.001 par value\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "GOOG", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-05) · 10-K 표지 12(b) 등록증권에 Class A Common Stock(GOOGL)과 Class C Capital Stock(GOOG)이 함께 등록 · 예탁증권(ADR/ADS) 아님 · 같은 발행인의 본국 발행 지분증권으로 의결권만 다르다 · HOME_COMMON_RULE_V2 판정 2026-09-20(§47-5 PM 승인)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "AMZN", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-06) · 증권 종류 \"Amazon.com, Inc. - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "NVDA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-25) · 증권 종류 \"NVIDIA Corporation - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "AVGO", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2025-12-18) · 증권 종류 \"Common Stock, $0.001 par value\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "AMD", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-04) · 증권 종류 \"Advanced Micro Devices, Inc. - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "META", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-01-29) · 증권 종류 \"Meta Platforms, Inc. - Class A Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "TSLA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 TX · 연차보고서 10-K(2026-01-29) · 증권 종류 \"Tesla, Inc.  - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "NFLX", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 미국 거래소 상장(USD 표시) · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-01-23) · 증권 종류 \"Netflix, Inc. - Common Stock\"(nasdaqlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "JPM", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-13) · 증권 종류 \"JP Morgan Chase & Co. Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "V", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2025-11-06) · 증권 종류 \"Class A Common Stock, par value $0.0001 per share\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "MA", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-11) · 증권 종류 \"Mastercard Incorporated Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "JNJ", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 NJ · 연차보고서 10-K(2026-02-11) · 증권 종류 \"Johnson & Johnson Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "UNH", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-03-02) · 증권 종류 \"UnitedHealth Group Incorporated Common Stock (DE)\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "XOM", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 NJ · 연차보고서 10-K(2026-02-18) · 증권 종류 \"Common Stock, without par value\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "CVX", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-24) · 증권 종류 \"Chevron Corporation Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "PG", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 OH · 연차보고서 10-K(2026-08-04) · 증권 종류 \"Procter & Gamble Company (The) Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "KO", assetType: "FOREIGN_STOCK", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NYSE · 미국 거래소 상장(USD 표시) · 앱에 NYSE 종합지수 없음 · 본국 보통주 근거: SEC EDGAR 설립지 DE · 연차보고서 10-K(2026-02-20) · 증권 종류 \"Coca-Cola Company (The) Common Stock\"(otherlisted) · HOME_COMMON_RULE_V1 판정 2026-09-20 · HOME_COMMON_RULE_V2 기준 재확인 2026-09-20(v2는 v1 조건을 모두 포함하므로 같은 근거로 성립)", equityListing: "HOME_COMMON", evidenceGrade: "A", version: "EM-2026.1" },
  // --- 해외(미국) 상장 ETF(js/09 ETF_HOLDINGS_MAP 등록분) --------------------
  { ticker: "QQQM", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ100", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100\"", version: "EM-2026.1" },
  { ticker: "QQQ", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ100", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100\"", version: "EM-2026.1" },
  { ticker: "SPY", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "SPYM", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "VOO", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 앱 ETF 구성표 label=\"S&P500\"", version: "EM-2026.1" },
  { ticker: "SOXX", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"반도체 ETF\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "SMH", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"반도체 ETF\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "TQQQ", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"나스닥100 3배 레버리지\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  // [EM-2026.2] 공식 기초지수(Dow Jones U.S. Dividend 100) 확인 - 지수 가격 원천이 없어(Index Master UNAVAILABLE)
  // Benchmark는 기록하되 계산 가능으로 처리하지 않는다. PR/TR 구분은 A등급으로 확인하지 못해 비워 둔다.
  { ticker: "SCHD", assetType: "FOREIGN_LISTED_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "DJ_US_DIV100_PR", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=AMEX · 운용사 공시(SEC 497K) 기초지수 Dow Jones U.S. Dividend 100 Index · 2026-09-19 확인 · 투자설명서(SEC 497K)의 \"track ... the total return of the Dow Jones U.S. Dividend 100 Index\"는 펀드 운용목표 서술이고 지수 자체의 PR/TR 표기는 아니다 · 지수 제공기관 공식 페이지는 이 지수 대표값을 Price Return으로 표시 · 2026-09-20 재확인", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "TLT", assetType: "FOREIGN_LISTED_ETF", assetClass: "BOND", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"미국 장기국채\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  { ticker: "IEF", assetType: "FOREIGN_LISTED_ETF", assetClass: "BOND", marketExposure: "US", priceCcy: "USD", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=NASDAQ · 앱 ETF 구성표 label=\"미국 중기국채\" · 앱에 대응 지수 없음", version: "EM-2026.1" },
  // --- 국내 상장 ETF(기초자산 국내) -----------------------------------------
  //   KOSPI200을 추종하지만 앱이 가진 지수는 KOSPI 종합뿐이라 benchmark를 비워 둔다.
  { ticker: "069500.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI200_PR", underlyingReturnType: "PR", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 앱 ETF 구성표 label=\"KODEX 200\" · 운용사 공식 상품정보(samsungfund.com) 기초지수 \"KOSPI 200\"(지수산출: 한국거래소) · KRX 공식 지수 정의로 원지수(PR) 확인 · 2026-09-20 확인", evidenceGrade: "A", version: "EM-2026.1" },
  { ticker: "102110.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI200_PR", underlyingReturnType: "PR", priceCcy: "KRW", evidence: "KIS 공식 종목마스터(data/ticker-master.json 2026-09-08) exchange=KOSPI · 앱 ETF 구성표 label=\"TIGER 200\" · 운용사 공식 상품정보 \"한국거래소가 발표하는 코스피 200 지수를 추적대상지수로하여\" · 환헤지 해당없음 · KRX 공식 지수 정의로 원지수(PR) 확인 · 2026-09-20 확인", evidenceGrade: "A", version: "EM-2026.1" },
  // --- [EM-2026.2 · 1차 통합 구현] 공식 기초지수 확인분(운용사 공식 상품정보 · 2026-09-19 확인 · 근거 등급 A) ----
  //   Benchmark는 공식 기초지수 그 자체를 Index Master 키로 적는다. 그 지수의 가격 원천이 앱에 없으면
  //   (Index Master UNAVAILABLE) Risk는 UNRESOLVED로 두고 다른 지수로 대신하지 않는다(§44 제10조 · D-01).
  //   underlyingReturnType은 공식 자료로 PR/TR이 확인된 경우에만 적는다(모르면 비운다 - PR을 TR이라 쓰지 않는다).
  { ticker: "278530.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "KOSPI200_TR", underlyingReturnType: "TR", priceCcy: "KRW", evidence: "운용사 공식 상품정보(KODEX 200TR) 기초지수 코스피 200 TR(Total Return) · 분배금 재투자형 · 2026-09-19 확인 · 운용사 공식 상품정보(KODEX 200TR) 기초지수 \"코스피 200 TR\" \"코스피200 지수 구성종목의 세전 현금배당이 재투자되는 것을 가정하여, 배당수익률이 가산된 총수익률을 반영한 지수\" · KRX 공식 총수익지수 정의 확인 · 2026-09-20 재확인", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "0052D0.KS", assetType: "KR_LISTED_DOMESTIC_ETF", assetClass: "KR_EQUITY", marketExposure: "KR", benchmark: "DJ_KOREA_DIV30_PR", underlyingReturnType: "PR", priceCcy: "KRW", evidence: "운용사 공식 상품정보(TIGER 코리아배당다우존스) 기초지수 Dow Jones Korea Dividend 30 Index(Price Return) · 2026-09-19 확인 · 운용사 공식 상품정보(TIGER 코리아배당다우존스) 기초지수 \"Dow Jones Korea Dividend 30 지수 (Price Return)\" · 환헤지 해당없음 · 상장 2025-05-20 · 2026-09-20 재확인", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "487230.KS", assetType: "KR_LISTED_FOREIGN_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "ISELECT_US_AI_POWER_PR", underlyingReturnType: "PR", priceCcy: "KRW", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "운용사 공식 상품정보(KODEX 미국AI전력핵심인프라) 기초지수 iSelect 미국AI전력핵심인프라 지수(Price Return) · 환노출(환헤지 안 함) · 2026-09-19 확인 · 운용사 공식 상품정보(KODEX 미국AI전력핵심인프라) 기초지수 \"iSelect 미국AI전력핵심인프라 지수(Price Return)\" · 환노출 · 상장 2024-07-09 · 2026-09-20 재확인", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "360750.KS", assetType: "KR_LISTED_FOREIGN_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "KRW", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "운용사 공식 상품정보(TIGER 미국S&P500) 기초지수 S&P 500 Index(원화환산) · 환헤지 안 함 · 2026-09-19 확인(PR/TR 구분 미확인) · 발행사 공식 페이지 재확인(2026-09-20) \"S&P Dow Jones Indices에서 발표하는 S&P 500 지수\" · \"환헤지를 하지 않으므로 ... 원화환산 수익률에 연동\". 지수 제공기관 공식 페이지는 S&P 500 대표값을 Price Return으로 표시하나 이 상품 자료에는 PR/TR 표기가 없어 underlyingReturnType은 비워 둔다", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "458730.KS", assetType: "KR_LISTED_FOREIGN_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "DJ_US_DIV100_PR", underlyingReturnType: "PR", priceCcy: "KRW", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "운용사 공식 상품정보(TIGER 미국배당다우존스) 기초지수 Dow Jones U.S. Dividend 100 Index(Price Return) · 환헤지 안 함 · 2026-09-19 확인 · 발행사 공식 페이지 재확인(2026-09-20) \"Dow Jones U.S. Dividend 100 Price Return Index\" · \"환헤지 사항: 환헤지를 하지 아니함\" · 지수 제공기관(S&P DJI) 공식 페이지도 이 지수 대표값을 Price Return으로 표시", evidenceGrade: "A", version: "EM-2026.2" },
  //   환헤지 여부를 A등급으로 확인하지 못한 상품 - hedgeStatus · fxExposure · conversionMethod를 비워 둔다
  //   (비헤지로 간주하지 않는다 · §44 제6조 6-3). 필수 칸이 비어 UNRESOLVED(HOLD)이며 Risk Benchmark를 주지 않는다.
  { ticker: "368590.KS", assetType: "KR_LISTED_FOREIGN_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "NASDAQ100", priceCcy: "KRW", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "운용사 공식 상품정보(RISE 미국나스닥100 · kbam.co.kr/products/44A9) 기초지수 \"NASDAQ 100 Index(KRW)(T-1)\"(산출: NASDAQ OMX Group) · \"미국 나스닥100 지수를 추종하는 환노출형 ETF\" → 비헤지 확정 · 2026-09-20 확인. 기초지수가 원화환산 · 1일 시차 버전이라 앱은 같은 기초지수의 달러 수준값을 비동기 · H.10 원화환산으로 비교한다. 지수 자체의 PR/TR 표기는 자료에 없어 underlyingReturnType은 비워 둔다", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "360200.KS", assetType: "KR_LISTED_FOREIGN_ETF", assetClass: "US_EQUITY", marketExposure: "US", benchmark: "SP500", priceCcy: "KRW", underlyingCcy: "USD", fxExposure: "EXPOSED", hedgeStatus: "UNHEDGED", conversionMethod: "FX_MULTIPLY", evidence: "운용사 공식 상품정보(ACE 미국S&P500) 기초지수 S&P 500 지수 · 2026-09-19 확인 · 환헤지: 한국투자신탁운용 공식 「간이투자설명서」(한국투자 ACE 미국 S&P500 증권 상장지수투자신탁(주식) · 작성기준일 2025.12.31) 「환율변동 위험」 항목에 외국통화 표시 투자대상자산에 대하여 환헤지 거래를 실행하지 아니할 계획이라고 명시 → hedgeStatus=UNHEDGED · fxExposure=EXPOSED(PM 문서 확인 2026-09-21 · §51 D-2 STEP 6). 종전 '환헤지 여부 A등급 미확인 → 연결 보류'(R-2 · PD-14) 상태를 이 근거로 해제한다", evidenceGrade: "A", version: "EM-2026.2" },
  //   혼합 노출(주식 + 채권) - 단일 자산군 · 단일 Benchmark를 적지 않는다(1:N 구조는 이번 범위 밖).
  { ticker: "237370.KS", assetType: "KR_LISTED_DOMESTIC_ETF", exposureStructure: "MIXED", marketExposure: "KR", priceCcy: "KRW", evidence: "운용사 공식 상품정보(KODEX 배당성장채권혼합) 기초지수 KRX 배당성장 채권혼합지수(코스피 배당성장50 30% + 국고채 70%) · 2026-09-19 확인 · 운용사 공식 상품정보(KODEX 코리아배당성장채권혼합) 기초지수 \"KRX 배당성장 채권혼합지수\" = 코스피 배당성장 50 지수 30% + KTB지수 70%(2010-01-04 = 1000.00pt) · 2026-09-20 확인", evidenceGrade: "A", version: "EM-2026.2" },
  { ticker: "472170.KS", assetType: "KR_LISTED_FOREIGN_ETF", exposureStructure: "MIXED", marketExposure: "GLOBAL", priceCcy: "KRW", hedgeStatus: "UNHEDGED", evidence: "운용사 공식 상품정보(TIGER 미국테크TOP10채권혼합) 기초지수 FnGuide 미국테크TOP10 채권혼합지수(미국 기술주 50% + 국내 국고채 50%) · 2026-09-19 확인 · 운용사 공식 상품정보(TIGER 미국테크TOP10채권혼합) 기초지수 \"FnGuide 미국테크TOP10 채권혼합지수\" = \"Indxx US Tech Top10 지수\" + \"KIS 국채 3-10년(총수익 지수) 지수\" 비중 5:5(2025-10-31부터 4:6에서 변경 · 미국 기술주 50% + 국내 국고채 50%의 혼합구조) · \"환헤지를 하지 아니함\" · 2026-09-20 확인 · 이 '환헤지를 하지 아니함' 문장을 hedgeStatus=UNHEDGED 항목으로 구조화(PM 결정 2026-09-21 · §51 D-2 STEP 8 - 새 근거가 아니라 기존 A등급 근거의 구조화다)", evidenceGrade: "A", version: "EM-2026.2" },
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
    reason: hit.verdict.status === EM_STATUS.RESOLVED ? 'OK' : (hit.verdict.mixedExposure ? 'MIXED_EXPOSURE' : 'INCOMPLETE_ENTRY'),
    identity,
    entry: hit.verdict.status === EM_STATUS.RESOLVED ? hit.entry : null,
    missing: hit.verdict.missing,
    violations: hit.verdict.violations
  };
}
// [1차 통합 구현] 원장에 "등록은 돼 있지만 확정되지 않은" 항목의 사실 - 연결을 보류할 사유를 판단하는 데만 쓴다
// (값을 대신 채우는 데 쓰지 않는다). 등록되지 않았거나 규칙 위반(BLOCKED)이면 null.
function lookupExposureRecord(assetLike, master) {
  if (!isExposureMasterActive()) return null;
  const hit = lookupExposure(assetLike, master);
  return hit ? { entry: hit.entry, verdict: hit.verdict } : null;
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
/* [1차 통합 구현 · D-16 · §44 제5조 시행 경계] 자산 성격(Asset Character) · MC 자산군 판정용 사실.
 *   - 자산군(assetClass)은 Benchmark · 환헤지와 무관한 사실이라, 그 항목이 Benchmark 미확정(UNRESOLVED)이어도
 *     assetClass 자체가 규칙을 통과했으면 쓴다(BLOCKED는 원장에 들어오지 않는다).
 *   - 혼합 노출(MIXED)은 { mixed: true } - 단일 자산군으로 판정하지 않는다.
 *   - 이 값은 Return Key 자동 판정에 쓰지 않는다(js/05 resolveRateKeyFromAssetCharacter가 명시적으로 제외).
 * 반환: null(원장에 없음) | { assetClass, mixed:false } | { assetClass:null, mixed:true }
 */
function resolveExposureCharacter(assetLike, master) {
  const rec = lookupExposureRecord(assetLike, master);
  if (!rec) return null;
  if (rec.verdict.mixedExposure) return { assetClass: null, mixed: true };
  const cls = rec.entry.assetClass;
  if (!isEnumValue(EM_ASSET_CLASS, cls) || (rec.verdict.missing || []).includes('assetClass')) return null;
  return { assetClass: cls, mixed: false };
}

/* --- 6-2. Index Master (§44 44-16 · 1차 통합 구현) --------------------------
 * Risk Benchmark 키 → 실제 지수 정의와 가격 원천. Benchmark(무엇과 비교할지)와 Price Source(그 값을 어디서
 * 받는지)를 분리한다. 공식 근거가 없는 칸은 null로 둔다(추정 금지).
 *   returnType      : PR(가격지수) | TR(총수익지수) | null(미확인)
 *   priceDefinition : INDEX_LEVEL - 지수 수준(종가)을 통계용 가격으로 쓴다(D-01 ① · 지수에는 조정주가 개념을 적용하지 않는다)
 *   market          : 산출 시장(세션 마감 순서 판단용 · 비동기 쌍 판정) - KR | US | null
 *   availability    : AVAILABLE(앱이 지금 받을 수 있고 1년 이력이 있음) | UNAVAILABLE(사유를 unavailableReason에)
 * sourceId는 앱이 이미 쓰는 공개 시세 경로(Yahoo chart)의 기호다. 새 공급자 · KIS 지수 API는 쓰지 않는다
 * (KIS 약관 확인 전 KIS 지수코드 2035 등 신규 연결 금지 - D-01 ⑤).
 */
const INDEX_RETURN_TYPE = Object.freeze({ PR: 'PR', TR: 'TR' });
const INDEX_AVAILABILITY = Object.freeze({ AVAILABLE: 'AVAILABLE', UNAVAILABLE: 'UNAVAILABLE' });
const INDEX_MASTER_ENTRIES = Object.freeze([
  { key: 'KOSPI', officialName: '코스피 지수(KOSPI)', provider: 'KRX', sourceId: '^KS11', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'KRW', market: 'KR', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  { key: 'KOSDAQ', officialName: '코스닥 지수(KOSDAQ)', provider: 'KRX', sourceId: '^KQ11', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'KRW', market: 'KR', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  { key: 'NASDAQ', officialName: 'NASDAQ Composite Index', provider: 'Nasdaq', sourceId: '^IXIC', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'USD', market: 'US', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  { key: 'SP500', officialName: 'S&P 500 Index', provider: 'S&P Dow Jones Indices', sourceId: '^GSPC', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'USD', market: 'US', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  { key: 'NASDAQ100', officialName: 'Nasdaq-100 Index', provider: 'Nasdaq', sourceId: '^NDX', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'USD', market: 'US', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  { key: 'DOW', officialName: 'Dow Jones Industrial Average', provider: 'S&P Dow Jones Indices', sourceId: '^DJI', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'USD', market: 'US', source: 'YAHOO', evidenceGrade: 'A', availability: 'AVAILABLE', unavailableReason: null },
  // 공식 기초지수로 확인됐지만 앱이 지금 가격을 받을 수 없는 지수 - 기록만 하고 계산 가능으로 처리하지 않는다.
  // [실행 묶음 B · 2026-09-20] KRX 공식 지수 사이트(index.krx.co.kr)에서 정의를 확인했다.
  //   코스피 200: 대표지수 · 기준일 1990.01.03 · 발표일 1994.06.15 · 기준지수 100
  //   총수익지수 설명: "총수익지수는 원지수 구성종목의 현금배당이 재투자되는 것을 가정하여 배당수익률이 가산된 총수익률을 반영한 지수입니다."
  //   → 코스피 200은 원지수(배당 미반영 · PR)이고 코스피 200 TR이 배당 재투자 지수다.
  //   정의는 확인됐지만 **일별 역사 시계열 원천은 여전히 없다**(정의 확인 ≠ 가격 데이터 사용 가능 · 대장 D-5).
  { key: 'KOSPI200_PR', officialName: '코스피 200', provider: 'KRX', sourceId: null, returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'KRW', market: 'KR', source: null, evidenceGrade: 'A', availability: 'UNAVAILABLE', unavailableReason: 'NO_PERMITTED_SOURCE' },
  { key: 'KOSPI200_TR', officialName: '코스피 200 TR', provider: 'KRX', sourceId: null, returnType: 'TR', priceDefinition: 'INDEX_LEVEL', currency: 'KRW', market: 'KR', source: null, evidenceGrade: 'A', availability: 'UNAVAILABLE', unavailableReason: 'NO_PERMITTED_SOURCE' },
  { key: 'DJ_KOREA_DIV30_PR', officialName: 'Dow Jones Korea Dividend 30 Index (Price Return)', provider: 'S&P Dow Jones Indices', sourceId: null, returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'KRW', market: 'KR', source: null, evidenceGrade: 'A', availability: 'UNAVAILABLE', unavailableReason: 'NO_PUBLIC_SOURCE' },
  { key: 'ISELECT_US_AI_POWER_PR', officialName: 'iSelect 미국AI전력핵심인프라 지수 (Price Return)', provider: null, sourceId: null, returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: null, market: null, source: null, evidenceGrade: 'A', availability: 'UNAVAILABLE', unavailableReason: 'NO_PUBLIC_SOURCE' },
  /* [§50 · PD-13 · 감사 F-01] 사유 코드를 사실에 맞게 정정한다.
   *
   * 예전 값 SOURCE_INSUFFICIENT_HISTORY는 "이력이 아직 짧다 = 시간이 지나면 쌓인다"로 읽힌다.
   * 실측(2026-09-21 · 400일 요청)은 정반대였다 - Yahoo는 이 기호들에 **과거 시계열을 아예 갖고
   * 있지 않고** 당일 수준값 1건만 준다. 기간을 넓게 요청해도 1건이고, 1년 뒤에도 1건이다.
   *   ^DJUSDIV 1건 · ^DJUSDV 1건 · ^DJDVY 1건 (대조군 ^GSPC 274건 · ^IXIC 274건 · ^KS11 268건)
   *   DJUSDIV · ^SDY · ^DJUSDVP → 404(기호 없음)
   * 따라서 상태는 DJ_KOREA_DIV30_PR · ISELECT와 같은 NO_PUBLIC_SOURCE다.
   * sourceId는 지우지 않고 남긴다 - "무엇을 시도했고 왜 안 되는지"의 근거이며,
   * availability가 UNAVAILABLE이라 조회에는 쓰이지 않는다(isIndexPriceSourceAvailable). */
  { key: 'DJ_US_DIV100_PR', officialName: 'Dow Jones U.S. Dividend 100 Index (Price Return)', provider: 'S&P Dow Jones Indices', sourceId: '^DJUSDIV', returnType: 'PR', priceDefinition: 'INDEX_LEVEL', currency: 'USD', market: 'US', source: 'YAHOO', evidenceGrade: 'A', availability: 'UNAVAILABLE', unavailableReason: 'NO_PUBLIC_SOURCE' }
]);
const INDEX_MASTER_BY_KEY = Object.freeze(INDEX_MASTER_ENTRIES.reduce((acc, e) => { acc[e.key] = e; return acc; }, {}));
function resolveIndexMasterEntry(key) {
  return (typeof key === 'string' && Object.prototype.hasOwnProperty.call(INDEX_MASTER_BY_KEY, key)) ? INDEX_MASTER_BY_KEY[key] : null;
}
// 앱이 지금 그 지수의 가격을 받을 수 있는가 - AVAILABLE이고 원천 기호가 있을 때만 true.
function isIndexPriceSourceAvailable(key) {
  const e = resolveIndexMasterEntry(key);
  return !!(e && e.availability === INDEX_AVAILABILITY.AVAILABLE && e.sourceId);
}
function indexPriceSourceTicker(key) {
  return isIndexPriceSourceAvailable(key) ? resolveIndexMasterEntry(key).sourceId : null;
}
// [D-01 ② ③] 상품의 공식 기초지수 수익 정의와 Benchmark 지수의 정의를 비교한다.
//   MATCH                - 둘 다 확인됐고 같다
//   DEFINITION_MISMATCH  - 둘 다 확인됐고 다르다(같은 것으로 취급하지 않고 상태를 남긴다)
//   UNCONFIRMED          - 상품 쪽 정의가 공식 자료로 확인되지 않았다(일치한다고도 다르다고도 말하지 않는다)
function resolveBenchmarkDefinitionStatus(exposureEntry, indexEntry) {
  const want = exposureEntry && exposureEntry.underlyingReturnType;
  const have = indexEntry && indexEntry.returnType;
  if (!want || !have) return 'UNCONFIRMED';
  return want === have ? 'MATCH' : 'DEFINITION_MISMATCH';
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
    resolveExposureBenchmark, resolveExposureAssetClass,
    EM_EVIDENCE_GRADE, EM_EXPOSURE_STRUCTURE, EM_EQUITY_LISTING, lookupExposureRecord, resolveExposureCharacter,
    INDEX_RETURN_TYPE, INDEX_AVAILABILITY, INDEX_MASTER_ENTRIES, INDEX_MASTER_BY_KEY,
    resolveIndexMasterEntry, isIndexPriceSourceAvailable, indexPriceSourceTicker, resolveBenchmarkDefinitionStatus,
    HOME_COMMON_RULE_VERSION, equityListingRuleVersionOf, listEntriesJudgedUnderOlderRule
};
}
