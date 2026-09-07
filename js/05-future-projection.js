/* -------------------------------------------------------------------------
 * 10-3. 미래 자산예측 (연복리 + 월 적립 시뮬레이션)
 *    - 예측 전용 그룹으로 재분류한다: 주식+ETF는 '주식형자산' 하나로 묶고, 채권/현금은 카테고리를
 *      그대로 그룹으로 쓴다. 그 외 커스텀 카테고리(원자재/암호화폐 등)도 자기 이름으로 개별 그룹을
 *      유지해 어떤 자산도 계산에서 누락되지 않게 한다. 부동산은 실물자산이라 매수/매도로 조절하거나
 *      복리로 "투자 성장"시키는 대상이 아니므로 이 예측 전체에서 완전히 제외한다(리밸런싱 탭과 동일한
 *      정책).
 *    - 그룹별 예상 연수익률은 수동 입력값이 있으면 그 값을, 없으면 그룹별 기본값을 사용한다.
 *      포트폴리오 전체는 각 그룹 평가금액으로 가중평균한다.
 *    - 그래프/표의 연도 표기는 실행 시점의 실제 캘린더 연도(CURRENT_YEAR) 기준으로 계산한다.
 * ---------------------------------------------------------------------- */
const CURRENT_YEAR = new Date().getFullYear();

// 그룹별 기본 예상 연수익률(%). 사용자가 입력창에서 값을 직접 넣으면 이 기본값 대신 그 값이 쓰인다.
// "현재 구성 유지" 시나리오와, 리밸런싱 후 "일반적" 프리셋이 공유하는 기준값이다(SCENARIO_RATE_PRESETS
// 참고 - "일반적"은 이 값을 그대로 재사용해 예전 "리밸런싱 후" 시나리오와 동일하게 동작한다).
const PROJECTION_GROUP_DEFAULT_RATES = { '주식형자산': 8.0, '채권': 4.0, '현금': 0.0 };

// 자산의 카테고리를 예측 그룹 키로 변환한다 - 주식/ETF만 '주식형자산'으로 통합하고 나머지는 그대로.
function getProjectionGroupKey(category) {
  if (category === '주식' || category === 'ETF') return '주식형자산';
  return category;
}

// [현재 구성 유지 - 종목별 세부 수익률 반영] 예전엔 "현재 구성 유지" 시나리오가 보유 자산을 주식형자산/
// 채권/현금 3개 카테고리로만 뭉뚱그려(주식형자산=8% 고정) 계산했다 - 삼성전자든 QQQM이든 메타든 다
// 똑같은 8%를 썼다는 뜻이다. 이제 "리밸런싱 후" 시나리오와 동일한 종목별 세부 매핑표(SCENARIO_RATE_
// PRESETS)를 그대로 재사용해, 실제 보유 종목 하나하나에 대해 전용 수익률(삼성전자 11%/QQQM 11%/메타
// 12% 등, "일반적" 프리셋 기준)을 우선 적용하고, 매핑에 없는 종목만 지역별 대표지수(국내 개별종목→
// KOSPI, 해외 개별종목→S&P500/SPYM)로 대체(fallback)한다 - getTargetProjectionRate가 리밸런싱 목표
// 항목에 적용하는 규칙과 완전히 동일한 판별 로직이라, 두 시나리오가 "같은 데이터베이스"를 본다.
// 채권/현금/그 외 커스텀 카테고리(원자재 등)는 종목 단위 매핑이 없으므로 기존처럼 카테고리 단위로 묶는다.
//
// [절세계좌 국내상장 해외지수 ETF 키워드 매핑] KODEX/TIGER/SOL 등 국내 브랜드로 상장된 해외지수 추종
// ETF(예: KODEX 미국S&P500, TIGER 미국나스닥100, SOL 미국배당다우존스)는 티커가 국내 6자리 코드라
// sanitizeTicker/티커표 매칭만으로는 SPYM/QQQM/SCHD 같은 대표 상품과 연결되지 않는다 - 종목명에 특정
// 키워드가 들어있으면 실제 추종 지수의 대표 수익률로 매핑한다. 나스닥을 SCHD/SPYM보다 먼저 확인해야
// "TIGER 미국나스닥100"처럼 여러 키워드가 겹칠 수 있는 이름에서 올바른 지수가 선택된다.
const NAME_KEYWORD_RATE_MAP = [
  { key: 'NASDAQ', keywords: ['나스닥100', '나스닥 100', 'NASDAQ100', 'NASDAQ 100', '나스닥', 'NASDAQ'] },
  { key: 'SCHD', keywords: ['배당다우존스', '배당 다우존스', 'SCHD'] },
  { key: 'S&P500', keywords: ['S&P500', 'S&P 500', 'SP500', 'S&P지수'] }
];
function getNameKeywordRateKey(name) {
  const hay = String(name ?? '').toUpperCase();
  for (const { key, keywords } of NAME_KEYWORD_RATE_MAP) {
    if (keywords.some((k) => hay.includes(k.toUpperCase()))) return key;
  }
  return null;
}
// [대표매칭 키 이름 - 요청 반영] 사용자가 실제로 SPYM/QQQM 티커를 보유한 자산은 대표매칭 키 이름이
// 'S&P500'/'NASDAQ'로 바뀐 뒤에도(아래) 여전히 정확히 매칭돼야 한다 - 티커 문자열 자체를 키 이름으로
// 쓰던 예전 방식(preset.tickers['QQQM'] 등)이 더 이상 통하지 않으므로, "이 티커를 보유하면 이 대표
// 키로 간다"는 별도 별칭표를 둔다(getProjectionAssetGroupKey/resolveTickerToRateKey/getTargetProjectionRate
// 공용).
const TICKER_RATE_KEY_ALIAS = { QQQM: 'NASDAQ', SPYM: 'S&P500' };
// [Phase 47-A] getRegionFallbackRateKey()를 여기서 삭제했다. "뭔지 모르겠으면 국내는 KOSPI,
// 해외는 S&P500"이라는 이 함수가 국고채 ETF에 한국 주식 수익률을, 미국 국채 ETF에 미국 주식
// 수익률을 붙이던 원인이었다. 이제 마지막 판단은 자산 성격이 맡고(resolveRateKeyFromAssetCharacter),
// 성격이 확인되지 않으면 어떤 가정도 적용하지 않는다. 코스닥 종목 구분(.KQ → KOSDAQ)은 사라지지
// 않았다 - returnKeyCandidatesForCharacter가 KR_EQUITY 후보 순서를 티커 접미사로 정하므로 그대로 유지된다.
/* =========================================================================
 * [Phase 40-C] 자산 성격(Asset Character) 판정 계층
 *
 * 왜 필요한가: 지금까지 "이 자산이 어떤 수익률 가정을 받을 것인가"를 정하는 마지막 폴백이
 * getRegionFallbackRateKey()였다 - 즉 "미국 자산인데 뭔지 모르겠으면 S&P500, 국내면 KOSPI".
 * 그래서 미국 장기국채 ETF(TLT)나 금 ETF(GLD)에 미국 주식 기대수익률이, 국내 국고채 ETF에
 * 한국 주식 기대수익률이 조용히 붙었다. 지역은 자산의 성격이 아니다.
 *
 * 이 계층은 "무엇으로 성격을 아는가"만 담당하며 수익률 숫자는 전혀 모른다.
 * 새 분류 체계를 만들지 않고 앱에 이미 있는 정보를 재사용한다:
 *   - ETF_HOLDINGS_MAP(js/09)의 sectorWeights - Risk 엔진은 이미 TLT/IEF를 {채권:1}로 알고 있었다
 *   - SECTOR_MAP(js/09) - 개별 주식 종목
 *   - asset.category / asset.isDomestic (js/01)
 *   - BOND_KEYWORDS / CASH_KEYWORDS (js/01) - classifyCategory가 쓰는 바로 그 목록
 * classifyCategory() 자체는 건드리지 않는다 - 거기를 고치면 category가 바뀌고 Risk 대상 자산
 * (RISK_ELIGIBLE_CATEGORIES)이 달라져 위험점수가 움직인다. 성격 판정은 그 위에 얹는 별도 개념이다.
 *
 * 이 값은 Portfolio Position(코어자산/수비수/미드필더/공격수)이나 Risk Benchmark와 무관하다 -
 * 세 개념을 하나로 합치지 않는다.
 * ====================================================================== */
const ASSET_CHARACTERS = Object.freeze({
  KR_EQUITY: 'KR_EQUITY', US_EQUITY: 'US_EQUITY',
  EM_EQUITY: 'EM_EQUITY', DEV_EX_US_EQUITY: 'DEV_EX_US_EQUITY',
  BOND: 'BOND', CASH: 'CASH', REAL_ESTATE: 'REAL_ESTATE',
  COMMODITY: 'COMMODITY', CRYPTO: 'CRYPTO',
  UNRESOLVED: 'UNRESOLVED'
});

// BOND_KEYWORDS/CASH_KEYWORDS(js/01)와 같은 방식의 이름 키워드 - classifyCategory에는 넣지 않는다
// (넣으면 category가 바뀌어 Risk 대상 자산이 달라진다). 성격 판정에서만 쓴다.
const COMMODITY_NAME_KEYWORDS = ['금현물', '금 현물', 'GOLD', '골드', '은현물', 'SILVER', '원자재', 'COMMODITY', '원유', 'CRUDE'];
const CRYPTO_NAME_KEYWORDS = ['비트코인', 'BITCOIN', 'BTC', '이더리움', 'ETHEREUM', 'ETH-', '가상자산', '암호화폐'];
const EM_NAME_KEYWORDS = ['신흥국', 'EMERGING', '이머징'];
// [Phase 43] 상품명이 밝히는 "기초지수의 시장" - 상장 시장이 아니라 무엇을 추종하는지를 가리킨다.
// 국내 상장 ETF에는 둘 다 있다: 'TIGER 미국S&P500'은 국내 상장이지만 미국 지수를, 'TIGER
// 코리아배당다우존스'는 국내 상장이면서 국내 지수를 추종한다. 이름에 'S&P500'/'다우존스' 같은
// 미국 지수 브랜드가 들어 있다는 것만으로 미국 주식이라고 단정하면 후자를 틀리게 판정한다.
const KR_UNDERLYING_NAME_KEYWORDS = ['코리아', '한국', 'KOREA', 'KRX', '국내'];
const US_UNDERLYING_NAME_KEYWORDS = ['미국', 'US ', 'U.S', 'AMERICA'];
const DEV_EX_US_NAME_KEYWORDS = ['선진국', 'DEVELOPED', 'EAFE', '유럽', 'EUROPE', '일본', 'JAPAN'];
// [Phase 45] 이름이 스스로 "한 자산군이 아니다"라고 밝히는 상품 - 채권혼합/주식혼합/혼합형 등.
// '혼합' 한 단어가 '채권혼합' · '채권혼합형' · '주식혼합' · '혼합형'을 모두 덮으므로 따로 적지 않고,
// '혼합'이라는 단어를 쓰지 않는 표기만 별도로 나열한다.
const MIXED_ASSET_NAME_KEYWORDS = ['혼합', '주식+채권', '주식 + 채권', '채권+주식', '채권 + 주식'];

// asset.category가 이미 성격을 확정해 주는 경우(사용자가 직접 고르거나 티커 없는 자산이
// classifyCategory로 확정된 경우) - 가장 강한 근거다.
const CATEGORY_TO_CHARACTER = Object.freeze({
  '채권': ASSET_CHARACTERS.BOND, '현금': ASSET_CHARACTERS.CASH,
  '부동산': ASSET_CHARACTERS.REAL_ESTATE, '원자재': ASSET_CHARACTERS.COMMODITY,
  '암호화폐': ASSET_CHARACTERS.CRYPTO
});

function matchesAnyKeyword(name, keywords) {
  const hay = String(name ?? '').toUpperCase();
  if (!hay) return false;
  return keywords.some((k) => hay.includes(k.toUpperCase()));
}

// 지역만 아는 상태를 성격으로 착각하지 않기 위해 region은 character와 별도로 돌려준다.
// confidence: 'high'(등록된 구성정보/명시적 카테고리) | 'medium'(이름 키워드/개별종목표) | 'none'
function resolveAssetCharacter(asset) {
  const name = String((asset && asset.name) ?? '');
  const rawTicker = String((asset && asset.ticker) ?? '').trim();
  const sanitized = sanitizeTicker(rawTicker);
  const yahoo = sanitized.yahooTicker;
  const region = (asset && asset.isDomestic) || sanitized.isDomestic || null;
  const out = (character, source, confidence) => ({ character, source, confidence, region, ticker: yahoo });

  // 0) [Phase 45] 이름이 이미 "여러 자산군이 섞여 있다"고 말하는 상품은 어떤 단일 성격으로도 판정하지
  //    않는다. 이 검사가 아래 어떤 규칙보다 먼저 오는 이유는, 혼합형을 단일 자산군으로 잘못 미는 경로가
  //    하나가 아니기 때문이다:
  //      - 이름 키워드(3단계): '채권혼합'에 '채권'이 들어 있다는 이유만으로 BOND로 판정됐다
  //        (실제 Golden 자산 'KODEX 코리아배당성장채권혼합' · 'TIGER 미국테크TOP10채권혼합'이 그랬다).
  //      - 카테고리(1단계): 티커 없는 '채권혼합형 펀드'는 classifyCategory(js/01)가 같은 BOND_KEYWORDS로
  //        category를 '채권'으로 자동 확정하므로, 3단계에 닿기도 전에 BOND가 된다.
  //      - 이름 지수 키워드(5단계): 'TIGER 미국테크TOP10채권혼합'의 '미국'을 보고 미국 주식이 될 수 있다.
  //    '채권'이라는 단어가 이름에 있다는 것은 그 상품이 채권만 담는다는 뜻이 아니다. 성격을 모르는 상태를
  //    UNRESOLVED로 정직하게 남기면 수익률 가정이 자동으로 붙지 않고 사용자 확인을 요청하게 된다
  //    (recommendReturnAssumptionKey Step 3). 기존 자산의 계산값은 rateMatchOverride가 그대로 우선하므로
  //    이 변경으로 이미 등록된 자산의 수익률이 달라지지 않는다.
  if (matchesAnyKeyword(name, MIXED_ASSET_NAME_KEYWORDS)) {
    return out(ASSET_CHARACTERS.UNRESOLVED, 'mixedAssetName', 'none');
  }

  // 1) 명시적 카테고리 - 사용자가 고르거나 티커 없는 자산이 확정된 경우.
  const byCategory = CATEGORY_TO_CHARACTER[asset && asset.category];
  if (byCategory) return out(byCategory, 'category', 'high');

  // 2) 이미 등록된 ETF 구성정보 - Risk 엔진이 쓰는 바로 그 표를 재사용한다.
  //    채권 100%로 등록된 ETF(TLT/IEF)는 이름이나 지역과 무관하게 채권형이다.
  const etf = (typeof ETF_HOLDINGS_MAP !== 'undefined') ? ETF_HOLDINGS_MAP[yahoo] : null;
  if (etf && etf.sectorWeights) {
    if (etf.sectorWeights['채권'] === 1) return out(ASSET_CHARACTERS.BOND, 'etfHoldings', 'high');
    return out(region === '해외' ? ASSET_CHARACTERS.US_EQUITY : ASSET_CHARACTERS.KR_EQUITY, 'etfHoldings', 'high');
  }

  // 3) 이름 키워드 - 티커가 있으면 classifyCategory가 'ETF'로 밀어버려 위 1)에 안 걸리는 자산들
  //    (예: "iShares 20+ Year Treasury Bond ETF", "KOSEF 국고채10년")을 여기서 잡는다.
  if (matchesAnyKeyword(name, CRYPTO_NAME_KEYWORDS)) return out(ASSET_CHARACTERS.CRYPTO, 'nameKeyword', 'medium');
  if (matchesAnyKeyword(name, BOND_KEYWORDS)) return out(ASSET_CHARACTERS.BOND, 'nameKeyword', 'medium');
  if (matchesAnyKeyword(name, COMMODITY_NAME_KEYWORDS)) return out(ASSET_CHARACTERS.COMMODITY, 'nameKeyword', 'medium');
  if (matchesAnyKeyword(name, EM_NAME_KEYWORDS)) return out(ASSET_CHARACTERS.EM_EQUITY, 'nameKeyword', 'medium');
  if (matchesAnyKeyword(name, DEV_EX_US_NAME_KEYWORDS)) return out(ASSET_CHARACTERS.DEV_EX_US_EQUITY, 'nameKeyword', 'medium');
  if (matchesAnyKeyword(name, CASH_KEYWORDS)) return out(ASSET_CHARACTERS.CASH, 'nameKeyword', 'medium');

  // 4) 시스템이 이미 개별 종목으로 알고 있는 주식(SECTOR_MAP) 또는 수익률 표에 직접 등록된 티커.
  const inSectorMap = (typeof SECTOR_MAP !== 'undefined') && SECTOR_MAP[yahoo] !== undefined;
  const inPresetTickers = SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined || TICKER_RATE_KEY_ALIAS[yahoo] !== undefined;
  if (inSectorMap || inPresetTickers) {
    return out(region === '해외' ? ASSET_CHARACTERS.US_EQUITY : ASSET_CHARACTERS.KR_EQUITY, inSectorMap ? 'sectorMap' : 'presetTicker', 'high');
  }
  // 5) 이름으로 대표 상품이 특정되는 경우(NAME_KEYWORD_RATE_MAP 재사용).
  //    성격은 "상장 시장"이 아니라 "추종하는 기초지수"를 따른다(TIGER 미국S&P500 = 미국 주식).
  //    [Phase 43 버그 수정] 예전엔 이 분기가 무조건 US_EQUITY를 돌려줬다. 그래서 국내 지수를
  //    추종하는 'TIGER 코리아배당다우존스'가 이름 속 '배당다우존스'(SCHD 키워드)에 걸려 미국 주식으로
  //    판정됐다 - 지수 브랜드 이름과 그 지수가 담는 시장은 다른 문제다. 이제 상품명이 밝히는
  //    기초지수 시장을 먼저 보고, 국내 시장이 명시돼 있으면 국내 주식으로 판정한다.
  //    (미국 표기가 함께 있으면 미국을 우선한다 - 'TIGER 미국배당다우존스'처럼 국내 상장 + 미국 지수)
  if (getNameKeywordRateKey(name)) {
    const saysUS = matchesAnyKeyword(name, US_UNDERLYING_NAME_KEYWORDS);
    const saysKR = matchesAnyKeyword(name, KR_UNDERLYING_NAME_KEYWORDS);
    if (saysKR && !saysUS) return out(ASSET_CHARACTERS.KR_EQUITY, 'indexNameKeyword', 'medium');
    return out(ASSET_CHARACTERS.US_EQUITY, 'indexNameKeyword', 'medium');
  }
  // [Phase 43] 지수 브랜드 키워드에는 안 걸리지만 이름이 국내 시장을 명시한 ETF(예: 'KODEX 코리아…')도
  //    국내 주식으로 본다. 미국 표기가 함께 있으면 위와 같은 이유로 여기 해당하지 않는다.
  if (matchesAnyKeyword(name, KR_UNDERLYING_NAME_KEYWORDS)
      && !matchesAnyKeyword(name, US_UNDERLYING_NAME_KEYWORDS)
      && region === '국내') {
    return out(ASSET_CHARACTERS.KR_EQUITY, 'domesticIndexName', 'medium');
  }

  // 6) 개별 주식 종목(category '주식')은 상장 시장이 곧 성격이다 - 위 3)에서 채권/현금/원자재/가상자산
  //    키워드를 이미 걸러냈으므로 여기 남은 '주식'은 실제 개별 주식이다. 이건 "지역만 보고 찍는 것"이
  //    아니라 상품 구조(개별 지분증권)를 확인한 결과다. ETF는 무엇이든 담을 수 있으므로 제외한다 -
  //    성격을 모르는 ETF가 지역 대표지수로 흘러가던 문제가 이번 Phase가 막으려는 바로 그 경로다.
  if (asset && asset.category === '주식' && region) {
    return out(region === '해외' ? ASSET_CHARACTERS.US_EQUITY : ASSET_CHARACTERS.KR_EQUITY, 'individualStock', 'medium');
  }

  // 7) 여기까지 왔다면 지역밖에 모른다 - 지역은 성격이 아니므로 주식으로 단정하지 않는다.
  return out(ASSET_CHARACTERS.UNRESOLVED, 'none', 'none');
}

/* -------------------------------------------------------------------------
 * [Phase 40-C] Return Key ↔ 자산 성격 연결표
 *   수익률 숫자는 전혀 건드리지 않는다 - 어떤 Key가 어떤 성격을 대표하는지만 적는다.
 *   여기 없는 성격(EM/선진국ex-US/원자재/암호화폐/해외채권)은 "그 성격에 맞는 Key가 아직 없다"는
 *   뜻이며, 근거 있는 CMA를 확보하기 전까지 임의의 수익률 숫자를 만들지 않는다(PM 지시 12).
 * ---------------------------------------------------------------------- */
const RETURN_KEY_CHARACTER = Object.freeze({
  'KOSPI': ASSET_CHARACTERS.KR_EQUITY, 'KOSDAQ': ASSET_CHARACTERS.KR_EQUITY, '005930.KS': ASSET_CHARACTERS.KR_EQUITY,
  'S&P500': ASSET_CHARACTERS.US_EQUITY, 'NASDAQ': ASSET_CHARACTERS.US_EQUITY, 'SCHD': ASSET_CHARACTERS.US_EQUITY,
  'MSFT': ASSET_CHARACTERS.US_EQUITY, 'GOOGL': ASSET_CHARACTERS.US_EQUITY, 'AAPL': ASSET_CHARACTERS.US_EQUITY,
  'AMZN': ASSET_CHARACTERS.US_EQUITY, 'META': ASSET_CHARACTERS.US_EQUITY, 'NVDA': ASSET_CHARACTERS.US_EQUITY,
  'BOND': ASSET_CHARACTERS.BOND, 'CASH': ASSET_CHARACTERS.CASH, 'CASH.USD': ASSET_CHARACTERS.CASH,
  '부동산': ASSET_CHARACTERS.REAL_ESTATE,
  // [Phase 41-B] 둘 다 주식이지만 지역이 달라 US_EQUITY와 다른 가정을 쓴다.
  'DEV_EX_US': ASSET_CHARACTERS.DEV_EX_US_EQUITY, 'EMERGING': ASSET_CHARACTERS.EM_EQUITY
});
// 'BOND' Key의 근거(CMA_SOURCE_METADATA.KR_BOND)는 한국 국고채를 검토한 것이라 통화/시장이 다른
// 해외 채권에 그대로 적용하면 안 된다 - 그래서 해외 채권은 자동 추천하지 않고 대안으로만 제시한다.
const RETURN_KEY_REGION = Object.freeze({
  'KOSPI': '국내', 'KOSDAQ': '국내', '005930.KS': '국내', 'BOND': '국내',
  'S&P500': '해외', 'NASDAQ': '해외', 'SCHD': '해외', 'MSFT': '해외', 'GOOGL': '해외',
  'AAPL': '해외', 'AMZN': '해외', 'META': '해외', 'NVDA': '해외',
  'DEV_EX_US': '해외', 'EMERGING': '해외'
});

// 사용자가 이미 등록한 커스텀 Key는 성격을 알 수 없다 - 사용자의 명시적 의도로 존중하되
// "성격 일치 여부"를 단정하지 않는다(unknown).
function getReturnKeyCharacter(key) {
  if (!key) return null;
  return RETURN_KEY_CHARACTER[key] || null;
}

/* =========================================================================
 * [Phase 47-A] 자산 성격 → Return Key 연결 (정책 계층과 계산 계층의 통합)
 *
 * Phase 40-C~46까지 자산 성격 판정(resolveAssetCharacter)은 정확했지만, 실제 수익률을 정하는
 * 계산 경로는 그 판정을 보지 않고 "국내면 KOSPI, 해외면 S&P500"이라는 지역 폴백을 썼다.
 * 그래서 국내 국고채 ETF에 한국 주식 수익률(7%), 미국 국채 ETF에 미국 주식 수익률(5.1%)이
 * 조용히 붙었다 - 성격 판정은 BOND라고 정확히 말하고 있었는데도. 정책과 계산이 서로 다른 말을
 * 하고 있었던 셈이다. 이 함수가 그 둘을 하나로 잇는다.
 *
 * 여기서 새 수익률 숫자를 만들지 않는다 - 이미 있는 Key 중 그 성격에 맞는 것을 고를 뿐이고,
 * 맞는 것이 없으면 null(= 가정을 적용하지 않는다)을 돌려준다.
 * ====================================================================== */
// 성격 판정 근거 중 "이 상품이 실제로 무엇인지 확인한" 것만 자동 적용에 쓴다.
// [Phase 47-A §2] individualStock은 여기 없다 - classifyCategory(js/01)의 마지막 줄이 아무 규칙에도
// 걸리지 않은 자산을 '주식'으로 되돌리기 때문에, 그 근거는 "개별 주식임을 확인했다"가 아니라
// "정체를 모른다"와 구분되지 않는다. 이름이 '블라블라'인 자산까지 KOSPI를 받던 경로가 바로 이것이다.
// 실제로 등록된 개별 종목(SECTOR_MAP의 sectorMap, 시스템 상품표의 presetTicker)은 여전히 통과한다.
const CHARACTER_SOURCES_FOR_AUTO_RATE_KEY = Object.freeze([
  'category', 'etfHoldings', 'nameKeyword', 'sectorMap', 'presetTicker', 'indexNameKeyword', 'domesticIndexName'
]);
// 어떤 Return Key도 적용하지 않는 상태를 나타내는 키. 실제 수익률은 0%(= 성장 가정 없음)이며,
// 이 키는 사용자에게 노출되거나 엑셀에 저장되지 않는다(getActiveScenarioRateKeys / js/12 export 참고).
const UNRESOLVED_RATE_KEY = 'UNRESOLVED';

// 자산(또는 자산 모양의 객체) 하나에 대해 "성격으로부터 정당화되는 Return Key"를 찾는다.
// 찾지 못하면 null - 지역만 보고 아무 주식 지수나 붙이지 않는다.
function resolveRateKeyFromAssetCharacter(assetLike) {
  const char = resolveAssetCharacter(assetLike);
  if (!CHARACTER_SOURCES_FOR_AUTO_RATE_KEY.includes(char.source)) return null;
  const candidates = returnKeyCandidatesForCharacter(char.character, char.ticker);
  if (candidates.length === 0) return null; // 그 성격에 맞는 Key가 아직 없다(원자재/암호화폐 등)
  const primary = candidates[0];
  // 통화·시장이 다른 채권에 국내 'BOND' 기준을 그대로 붙이지 않는다 - recommendReturnAssumptionKey가
  // 쓰는 것과 정확히 같은 규칙이라, 추천 화면과 실제 계산이 어긋날 수 없다.
  if (char.character === ASSET_CHARACTERS.BOND
      && RETURN_KEY_REGION[primary] && char.region && RETURN_KEY_REGION[primary] !== char.region) return null;
  return primary;
}

// [Phase 30 - 판단 근거까지 함께 돌려주는 단일 소스] 아래 getProjectionAssetGroupKey()의 판별 체인을
// 그대로 옮겨온 것이며 순서·조건·반환 키가 전부 동일하다(동작 변경 없음). 달라진 건 "어느 단계에서
// 결정됐는지"를 source로 함께 돌려준다는 점뿐이다 - 거래 입력의 대표매칭키 추천(js/06)이 "근거 있는
// 매칭"과 "마지막 지역 폴백"을 구분해야 하는데, 그걸 위해 판별 로직을 복사해 두 번 관리하면 언젠가
// 반드시 어긋난다. 그래서 판별은 여기 한 곳에만 두고 두 용도가 이 함수를 공유한다.
//   source: 'override' | 'customKey' | 'customKeyword' | 'category' | 'presetTicker' | 'tickerAlias'
//           | 'nameKeyword' | 'assetCharacter' | 'unresolved'   ([Phase 47-A] regionFallback 제거)
function resolveAssetGroupKeyDetail(asset) {
  // [대표매칭 오버라이드 - 요청 반영] 자동판별보다 항상 우선한다 - 엑셀의 "대표매칭(수익률연동키)"
  // 컬럼을 직접 고쳐서 업로드하면 makeAsset()이 여기 저장하고(js/01), 이후 모든 계산이 그 값을 그대로
  // 쓴다. 값이 실제로 유효한 수익률에 연결되는지는 resolveProjectionRateForKey가 알아서 안전하게
  // 처리한다(못 알아보는 키는 지역 대표지수로 조용히 대체) - 여기서는 형식 검증을 하지 않는다.
  if (asset.rateMatchOverride) return { key: asset.rateMatchOverride, source: 'override' };
  // [정확매칭·키워드매칭 - 카테고리 캐치올보다 우선, 요청 반영] 예전엔 findCustomRateKeyForAsset가
  // '주식형자산' 카테고리 안에서만 동작해, 채권/현금/부동산 카테고리 자산은 아무리 정확히 등록해도(혹은
  // 키워드가 걸려도) 항상 카테고리 캐치올(예: 현금=하드코딩 0%)로만 갔다 - 두 매칭을 카테고리 분기보다
  // 앞으로 옮겨 모든 카테고리에 동일하게 적용한다. 예: "달러 예수금"이 CASH 키워드("현금","달러")에
  // 걸리면 하드코딩된 0% 대신 CASH의 등록 수익률을 쓴다.
  const customKey = findCustomRateKeyForAsset(asset.ticker, asset.name);
  if (customKey) return { key: customKey, source: 'customKey' }; // 사용자 정의 등록 종목 - 코드/티커/이름 중 하나로 매칭(SK하이닉스 등)
  const keywordKey = getCustomKeywordRateKey(asset.name);
  if (keywordKey) return { key: keywordKey, source: 'customKeyword' };
  const groupKey = getProjectionGroupKey(asset.category);
  if (groupKey !== '주식형자산') return { key: groupKey, source: 'category' }; // 위 두 매칭에 안 걸린 채권/현금/커스텀 카테고리는 기존 카테고리 단위 유지
  const sanitized = sanitizeTicker(asset.ticker);
  const yahoo = sanitized.yahooTicker;
  if (SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined) return { key: yahoo, source: 'presetTicker' };
  if (TICKER_RATE_KEY_ALIAS[yahoo]) return { key: TICKER_RATE_KEY_ALIAS[yahoo], source: 'tickerAlias' }; // 실제 QQQM/SPYM 티커 보유 - 이름 무관하게 항상 매칭
  const nameKey = getNameKeywordRateKey(asset.name);
  if (nameKey) return { key: nameKey, source: 'nameKeyword' }; // 국내상장 해외지수 ETF(절세계좌 등) - 이름 키워드로 대표 상품에 매칭
  // [Phase 47-A] 여기까지 왔다면 "이 종목이라서 이 키"라고 말할 종목 단위 근거는 없다. 예전엔 이 자리에서
  // 지역 대표지수로 대체했지만(getRegionFallbackRateKey), 지역은 자산의 성격이 아니다 - 그래서 국고채
  // ETF가 KOSPI를, 미국 국채 ETF가 S&P500을 받았다. 이제 자산 성격을 한 번 더 물어보고, 그 성격에 맞는
  // 기준이 실제로 있을 때만 적용한다.
  const characterKey = resolveRateKeyFromAssetCharacter(asset);
  if (characterKey) return { key: characterKey, source: 'assetCharacter' };
  // 성격도 확인되지 않았다 - 여기서 멈춘다. 그럴듯한 숫자를 만들어 넣는 것보다 "가정 없음"이 정직하다.
  return { key: UNRESOLVED_RATE_KEY, source: 'unresolved' };
}
function getProjectionAssetGroupKey(asset) {
  return resolveAssetGroupKeyDetail(asset).key;
}
// [절세계좌 종목별 복리 계산 - 요청 반영] getProjectionAssetGroupKey()가 반환하는 키 하나(티커/'NAME:x'/
// 'S&P500'/'KOSPI' 같은 "상품형" 키, 또는 채권/현금/커스텀 자산군명 같은 "카테고리형" 키)를 실제 프리셋
// 수익률로 변환한다 - 절세계좌 개별 보유 종목 복리 계산(getAssetProjectionRate)에서 쓴다. 알아볼 수
// 없는 키(유효하지 않은 대표매칭 오버라이드, 처음 보는 커스텀 자산군명 등)는 조용히 지역 대표지수로
// 대체해 절대 undefined/NaN을 반환하지 않는다.
function resolveProjectionRateForKey(key, presetKey, isForeign) {
  // [Phase 47-A] 성격을 확인하지 못한 자산 - 어떤 장기 수익률 가정도 적용하지 않는다.
  // 0%는 "수익률이 0일 것으로 예상한다"는 뜻이 아니라 "적용할 근거 있는 가정이 없어 원금을 그대로
  // 둔다"는 뜻이다. 사용자가 이 자산에 대표매칭키나 수익률을 직접 지정하면 위 경로에서 그 값이 쓰인다.
  if (key === UNRESOLVED_RATE_KEY || key === null || key === undefined || key === '') return 0;
  if (key === '현금') return 0;
  if (key === '채권') return getReferenceRate(presetKey, 'BOND');
  if (key === '부동산') return getReferenceRate(presetKey, '부동산');
  // [Phase 28-E - 표준 카테고리 키 연결 버그 수정] 엑셀 "대표매칭(수익률연동키)"에 앱의 표준 키인
  // BOND/CASH/CASH.USD를 적었는데 "수익률 관리 기준" 시트가 함께 올라오지 않아 customScenarioRates에
  // 그 키가 없으면, 예전엔 아래 getCustomRate/preset.tickers 둘 다 비어서 마지막 지역 대표지수 폴백까지
  // 흘러내려 "현금 7%(KOSPI)·달러 5.1%(S&P500)·국채 7%(KOSPI)"처럼 주식 지수 수익률로 계산됐다.
  // 같은 자산이 목표비중 경로(getTargetProjectionRate)에서는 classifyCategory 추론으로 채권 프리셋/현금 0%를
  // 내므로 두 경로가 서로 다른 값을 내는 연결 불일치였다. 여기서도 동일한 기존 정책(getSystemDefaultRate의
  // BOND→categories.채권, classifyCategory('달러')==='현금'→0)을 그대로 따른다 - 새 수익률을 만들지 않으며,
  // customScenarioRates에 키가 있으면 여전히 그 값이 우선한다(getReferenceRate가 custom을 먼저 본다).
  // CASH와 CASH.USD는 서로 다른 키로 유지되어 사용자가 각각 다른 값을 등록할 수 있다 - 시트 미등록 시의
  // 폴백만 둘 다 현금 0%로 맞춘다. BOND.STOCK은 앱 어디에도 기본 정책이 없어 여기서 다루지 않는다(정책 결정 필요).
  if (key === 'BOND') return getReferenceRate(presetKey, 'BOND');
  if (key === 'CASH' || key === 'CASH.USD') { const custom = getCustomRate(key, presetKey); return custom !== undefined ? custom : 0; }
  if (key === 'KOSPI') return getEffectiveIndexRate(presetKey, 'domestic');
  if (key === 'KOSDAQ') return getEffectiveIndexRate(presetKey, 'kosdaq');
  // [Phase 47-A §4] 삼성전자는 더 이상 전용 시스템 수익률(8/9/15)을 갖지 않고 KOSPI 앵커를 상속한다.
  // 미국 개별종목 6종이 US_EQUITY 앵커를 alpha 0으로 상속하는 기존 정책과 국내 정책을 일치시킨 것이다.
  // 별도 숫자를 복사해 두지 않고 여기서 KOSPI를 그대로 가리키므로 앞으로도 두 값이 어긋날 수 없다.
  // 사용자가 customScenarioRates['005930.KS']를 등록해 두었다면 그 값이 언제나 우선한다 - 이 분기는
  // getCustomRate 조회(아래)보다 앞에 있으므로 여기서 직접 확인해야 한다. 확인하지 않으면 삼성전자
  // 수익률을 직접 설정해 둔 기존 사용자의 값이 조용히 KOSPI로 덮여 쓰인다(정책 변경이 사용자 데이터를
  // 바꾸지 않는다는 원칙 위반). KOSPI/KOSDAQ/S&P500 분기는 getEffectiveIndexRate가 같은 확인을 이미 한다.
  if (key === '005930.KS') {
    const samsungCustom = getCustomRate(key, presetKey);
    return samsungCustom !== undefined ? samsungCustom : getEffectiveIndexRate(presetKey, 'domestic');
  }
  if (key === 'S&P500') return getEffectiveIndexRate(presetKey, 'foreign');
  const custom = getCustomRate(key, presetKey);
  if (custom !== undefined) return custom;
  const presetTicker = SCENARIO_RATE_PRESETS[presetKey].tickers[key];
  if (presetTicker !== undefined) return presetTicker;
  // [코스닥 대표매칭 오버라이드 - 버그 수정] key 자체가 코스닥 티커(예: rateMatchOverride를 직접
  // "140860.KQ"로 지정한 경우)면 isForeign 플래그보다 우선해서 코스닥 지수로 대체한다.
  if (/\.KQ$/i.test(key)) return getEffectiveIndexRate(presetKey, 'kosdaq');
  // [Phase 47-A §3] 여기까지 온 키는 시스템도 모르고 사용자도 등록하지 않은 키다(대표적으로
  // 'BOND.STOCK' - 채권혼합 상품용으로 사용자가 만든 키인데 수익률 시트가 함께 올라오지 않은 경우).
  // 예전엔 지역 대표지수로 대체해서, 채권혼합 상품에 순수 주식 지수 수익률이 붙고 심지어 같은 키인데
  // 자산의 국내/해외 표기에 따라 값이 갈렸다. 이제 가정을 적용하지 않는다 - 이 키는 "수익률 관리"
  // 목록에 그대로 나타나므로(getActiveScenarioRateKeys의 고아 키 처리) 사용자가 직접 값을 넣을 수 있다.
  return 0;
}
// 보유 자산(또는 자산과 같은 모양의 객체) 하나의 대표 매칭 수익률 - 위 두 함수를 묶어서 "이 자산이
// 지금 어떤 수익률로 계산돼야 하는가"를 한 번에 답한다. 절세계좌 원금/적립 계산(js/05 10-3-3-2)에서 쓴다.
function getAssetProjectionRate(asset, presetKey) {
  return resolveProjectionRateForKey(getProjectionAssetGroupKey(asset), presetKey, asset.isDomestic === '해외');
}
// ownerFilter: [소유자별 독립 리밸런싱 - Option B] 생략(또는 'all')하면 가구 전체(기존 동작), 실제
// 소유자명을 넘기면 그 소유자 소유 자산만 집계한다 - simulateRebalancedPreset이 owner별 원금 계산에 쓴다.
function getProjectionGroupStats(ownerFilter) {
  const byGroup = {}; // { 그룹키: { value, buy, returnRate } }
  state.assets.forEach((a) => {
    // [버그 수정 - 일반계좌 자산만 대상] 절세계좌(ISA/IRP/연금저축)와 부동산은 "포트폴리오 구성"(옛
    // 리밸런싱 설정) 탭과 마찬가지로 미래예측에서도 완전히 제외한다 - 두 탭이 같은 "일반계좌 보유
    // 자산" 범위를 공유하도록 통일했다(요청 반영). 한때는 미래예측만 절세계좌/부동산을 포함하도록
    // 넓혔던 적이 있었으나(부동산은 자체 그룹으로 별도 복리 성장 후 합산, 절세계좌도 전부 합산) 다시
    // 되돌렸다 - 부동산 전용 복리 성장 로직은 simulateRebalancedPreset/computeTargetWeightedAvgRate에서
    // 함께 제거했다.
    if (!isRebalanceEligibleAccount(a) || a.category === '부동산') return;
    if (!isAssetIncludedForOwner(a, ownerFilter)) return;
    const r = calcRow(a);
    const key = getProjectionAssetGroupKey(a);
    if (!byGroup[key]) byGroup[key] = { value: 0, buy: 0 };
    byGroup[key].value += r.curAmount;
    byGroup[key].buy += r.buyAmount;
  });
  Object.keys(byGroup).forEach((k) => {
    const b = byGroup[k];
    b.returnRate = b.buy !== 0 ? ((b.value - b.buy) / b.buy * 100) : 0;
  });
  return byGroup;
}

// getProjectionGroupStats(ownerFilter) 결과의 총 평가금액 합계 - owner별 원금 계산에 반복적으로 쓰인다.
function getProjectionGroupTotal(byGroup) {
  return Object.keys(byGroup).reduce((s, k) => s + byGroup[k].value, 0);
}

// 주의: '현재 수익률'은 매수 시점 이후 누적 손익률일 뿐 연환산(CAGR) 수치가 아니다(이 앱은 매수일을
// 기록하지 않아 실제 보유기간을 알 수 없다). 그래서 사용자가 명시적으로 입력하거나 "현재값 사용"
// 버튼을 눌러 값을 채워 넣기 전까지는 그룹별 기본값을 사용하고, 현재 수익률을 자동으로 미래 예측에
// 끌어쓰지 않는다 - 그렇지 않으면 단기 급등 종목의 수익률이 그대로 연 수익률처럼 복리 적용되어
// 20년 후 자산이 비현실적인 천문학적 수치로 계산되는 문제가 있었다.
function getGroupReturnRate(groupKey) {
  // 현금은 수익률 연산을 적용하지 않고 항상 0%로 고정한다 - 입력창 자체도 없앴으므로(요청에 따름)
  // 혹시 예전에 저장된 수동값이 남아있어도 여기서 무시한다.
  if (groupKey === '현금') return 0;
  const manual = state.projection.categoryReturns[groupKey];
  if (manual !== undefined && manual !== '' && Number.isFinite(num(manual))) return num(manual);
  return PROJECTION_GROUP_DEFAULT_RATES[groupKey] !== undefined ? PROJECTION_GROUP_DEFAULT_RATES[groupKey] : 0;
}

function renderProjection() {
  // [Phase 25 P1] 두 입력칸은 이제 팝업 안에 있고 팝업을 열 때 draft로 채워진다 - 여기서는 화면에
  // 항상 보이는 요약 텍스트만 state 기준으로 갱신한다(입력칸을 여기서 건드리면 편집 중인 draft
  // 값을 덮어써 버린다).
  updateProjectionAssumptionsSummary();
  if (typeof updateMcFeeSummary === 'function') updateMcFeeSummary();
  updateMonthlyContributionSummary();
  updateProjection();
}
// [입력 일원화 - 요청 반영] 월 적립금 입력칸이 메인 화면에서 사라지고 [월적립금 설정] 팝업 안으로
// 옮겨가면서, 메인 화면엔 지금 값이 얼마인지 확인만 할 수 있는 읽기 전용 배지를 남겨뒀다 - 값이
// 바뀔 때마다(팝업 입력, 상태 로드 등) 이 함수로 배지 텍스트를 다시 맞춘다.
// [소유자별 독립 월적립금 - Part 2-B] 신랑+와이프 합산 총액을 보여준다 - 둘 다 미설정이면(총액 0)
// 기존 단일 monthlyContribution으로 하위호환 폴백한다(getOwnerMonthlyContributionInputs와 동일 판정).
function updateMonthlyContributionSummary() {
  const el = document.getElementById('monthlyContributionSummary');
  if (!el) return;
  const byOwner = state.projection.monthlyContributionByOwner;
  const ownerSum = REBALANCE_OWNERS.reduce((s, o) => s + num(byOwner[o] && byOwner[o].total), 0);
  const amount = ownerSum > 0 ? ownerSum : num(state.projection.monthlyContribution);
  el.textContent = amount > 0 ? `${fmtNum(amount, 0)}원` : '미설정';
}

// 월복리 미래가치: FV = PV*(1+r)^n + PMT*(1+r)*(((1+r)^n - 1)/r), r=월이율, n=개월수.
// 월 적립금은 매월 "초"에 넣는다고 가정하는 기초급(Annuity Due) 연금 복리식이다 - 그래서 일반적인
// 기말급(적립금이 그 달 말에 들어와 그 달의 성장에는 참여하지 않는) 공식에 (1+월이율)을 한 번 더
// 곱해, 이번 달 초에 넣은 적립금도 이번 달 성장분을 온전히 받도록 한다.
function computeFutureValue(pv, annualRatePct, years, monthlyContribution) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;
  if (Math.abs(monthlyRate) < 1e-9) return pv + monthlyContribution * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return pv * growth + monthlyContribution * (1 + monthlyRate) * ((growth - 1) / monthlyRate);
}
// [Phase 3-3 통합 감사 - 버그 수정] Monte Carlo(js/15)는 연간 납입액 증가율(state.projection.
// contributionGrowthRate)을 반영하는데, 이 결정론적 시나리오 카드는 그동안 이 값을 전혀 몰랐다 -
// 같은 입력(월 적립금 300만원, 증가율 3%, 20년)인데 위 "시나리오별 예상자산" 카드는 매달 300만원
// 고정으로, 그 바로 아래 Monte Carlo 카드는 매년 늘어나는 금액으로 계산해 서로 다른 결과가 나오는
// 불일치였다(사용자 입장에서는 같은 조건처럼 보여 알아채기 어렵다). growthRate=0이면 computeFutureValue를
// 그대로 한 번만 호출해(기존과 완전히 동일한 코드 경로) 회귀 위험이 없고, growthRate>0일 때만 연 단위로
// 나눠 매년 커지는 PMT를 반영한다 - computeFutureValue 자체는 손대지 않는다(다른 호출부 전부 무변경).
function computeFutureValueWithContributionGrowth(pv, annualRatePct, years, initialMonthlyContribution, contributionGrowthRate) {
  const g = contributionGrowthRate || 0;
  if (Math.abs(g) < 1e-9) return computeFutureValue(pv, annualRatePct, years, initialMonthlyContribution);
  let balance = pv;
  for (let y = 0; y < years; y++) {
    // [Phase 3-3 통합감사] js/15의 computeContributionYearMultiplier를 그대로 재사용 - 이 파일이
    // 독자적인 "연차별 배율" 공식을 따로 갖지 않도록 한다(Monte Carlo와 어긋날 위험 제거).
    const yearMonthly = initialMonthlyContribution * computeContributionYearMultiplier(g, y);
    balance = computeFutureValue(balance, annualRatePct, 1, yearMonthly);
  }
  return balance;
}
// [절세계좌 연납 지원 - 요청 반영] 매년 "초"에 한 번씩 납입하는 연납 버전 - 위 월복리 공식과 완전히
// 같은 구조(기초급 연금 복리식)를 연 단위 그대로 쓴다(월 환산 없음). 기존 computeFutureValue(월복리
// 전용)는 다른 호출부(일반계좌 시나리오, 원금 성장 등)에 그대로 쓰이므로 절대 안 건드리고, 절세계좌
// 계좌별 적립 설정(simulateTaxAdvantagedOwnerGrowth)이 frequency==='yearly'일 때만 이 함수를 쓴다.
function computeFutureValueAnnual(pv, annualRatePct, years, annualContribution) {
  const rate = annualRatePct / 100;
  if (Math.abs(rate) < 1e-9) return pv + annualContribution * years;
  const growth = Math.pow(1 + rate, years);
  return pv * growth + annualContribution * (1 + rate) * ((growth - 1) / rate);
}

// [고정 5년 간격 마일스톤] 예전엔 "실제 달력상 5의 배수 연도"(2030/2035/2040/2045년처럼)를 기준으로
// 잡아서, 오늘이 몇 년이냐에 따라 "4년후"/"9년후"처럼 불규칙한 오프셋이 나왔다(사용자 실측 신고로
// 확인) - 오늘(CURRENT_YEAR)로부터 정확히 5/10/15/20년 후로 고정한다(최대 20년 시야, 사용자 요청).
// 표시 연도(하위 캡션)는 CURRENT_YEAR + offset으로 그대로 자동 계산되므로 이 배열만 바꾸면 표/차트
// 전부 자동으로 반영된다.
function getMilestoneYearOffsets() {
  return [5, 10, 15, 20];
}

/* -------------------------------------------------------------------------
 * 10-3-2. 시나리오 2: 목표 포트폴리오로 오늘 전액 리밸런싱했다고 가정한 미래예측
 *    - 시나리오 1과 정확히 같은 원금(부동산 제외 총액)을 "금융자산 리밸런싱" 탭의 목표 지역/항목
 *      비중대로 재배분했다고 가정한다. 별도의 수익률 입력창은 없고, 시나리오 1에서 입력한 자산군별
 *      수익률을 그대로 재사용한다(아래 getTargetProjectionRate).
 * ---------------------------------------------------------------------- */
/* -------------------------------------------------------------------------
 * [사용자 정의 수익률 오버라이드] "수익률 관리" 모달에서 사용자가 직접 등록/수정한 종목별 기대수익률.
 *    예전 SCENARIO2_TICKER_RATE_OVERRIDES(QQQM/SPYM/SCHD 3종목 한정, 하나의 수치를 3개 시나리오에
 *    동일 적용)를 완전히 대체하는 범용 시스템이다 - 어떤 종목이든(기존 매핑 종목의 수치 수정 포함,
 *    SK하이닉스처럼 시스템에 없던 신규 종목 추가 포함) 보수적/일반적/긍정적 3개 값을 각각 등록할 수 있다.
 *    state.projection.customScenarioRates: { [key]: { label, conservative, normal, optimistic } }
 *    key 규칙(findCustomRateKeyForAsset 참고) - 종목코드/티커가 있으면 sanitizeTicker().yahooTicker를
 *    그대로 쓰고('005930.KS','000660.KS','MSFT' 등 - 시스템 기본 매핑표와 동일한 키 체계라 그대로
 *    맞물린다), 코드/티커 없이 이름만 있는 종목은 'NAME:정규화이름'을 쓴다.
 * ---------------------------------------------------------------------- */
function normalizeNameKey(name) {
  return String(name ?? '').replace(/\s+/g, '').toUpperCase();
}

// 모달에서 사용자가 입력한 종목코드/티커(선택)와 종목명으로 저장 키를 만든다.
function buildCustomRateKey(codeOrTicker, name) {
  const sanitized = sanitizeTicker(codeOrTicker);
  if (sanitized.yahooTicker) return sanitized.yahooTicker;
  const normalized = normalizeNameKey(name);
  return normalized ? 'NAME:' + normalized : null;
}

// 실제 보유/거래/리밸런싱 목표 종목(ticker+name) 하나가 사용자 정의 오버라이드와 매칭되는 키를 찾는다.
// 1순위 종목코드/티커(sanitizeTicker 정제), 2순위 정규화된 종목명 - 매칭되는 게 하나도 없으면 null을
// 반환해 호출부가 시스템 기본 매핑(SCENARIO_RATE_PRESETS)으로 진행하게 한다.
function findCustomRateKeyForAsset(ticker, name) {
  const customRates = state.projection.customScenarioRates || {};
  const sanitized = sanitizeTicker(ticker);
  if (sanitized.yahooTicker && customRates[sanitized.yahooTicker]) return sanitized.yahooTicker;
  const nameKey = 'NAME:' + normalizeNameKey(name);
  if (name && customRates[nameKey]) return nameKey;
  return null;
}

/* -------------------------------------------------------------------------
 * [Phase 3-4] Instrument별 연간 운용보수(Fee/Expense Ratio) - customScenarioRates와 완전히 별개의
 * 맵이다(시나리오에 따라 달라지지 않는 값이라 {label,conservative,normal,optimistic} 구조가 필요
 * 없다 - 단일 숫자 하나만 쓴다). key 체계는 buildCustomRateKey(이미 존재하는 함수)를 그대로 재사용해
 * "수익률 관리"의 키와 동일한 종목이 동일한 키로 연결되게 한다.
 *    state.projection.customFeeRates: { [key]: feeRatePct }  (예: 0.20 = 연 0.20%)
 * [명시적으로 설정 안 하면 0%] - 확인되지 않은 보수율을 임의로 추정해 채우지 않는다(요청 반영) -
 * ETF든 개별주식이든 이 맵에 없으면 전부 0%다.
 * ---------------------------------------------------------------------- */
// target: getTargetProjectionRate가 받는 것과 동일한 모양({type, ticker, label, name, category}).
// 수익률과 달리 "대표지수로 대체" 같은 폴백이 없다 - 딱 이 종목/카테고리에 사용자가 직접 등록한 값만
// 쓰고, 없으면 무조건 0이다(폴백 체인이 있으면 "모르는 값"과 "확인된 0%"가 헷갈릴 위험이 있다).
function getTargetProjectionFeeRate(target) {
  const feeRates = state.projection.customFeeRates || {};
  if (target.type === 'ticker') {
    const key = buildCustomRateKey(target.ticker, target.label);
    return key && feeRates[key] !== undefined ? num(feeRates[key]) : 0;
  }
  if (target.type === 'namedHolding') {
    const key = buildCustomRateKey('', target.name);
    return key && feeRates[key] !== undefined ? num(feeRates[key]) : 0;
  }
  const groupKey = getProjectionGroupKey(target.category);
  return feeRates[groupKey] !== undefined ? num(feeRates[groupKey]) : 0;
}
// [Phase 3-5 Safety Layer - F. Fee UNKNOWN 처리] "명시적으로 0% 설정"과 "아예 미설정"을 구분하는
// 병행 조회 함수 - 스키마는 그대로 둔다(customFeeRates[key]가 존재하면 명시적 설정, 없으면 UNKNOWN).
// getTargetProjectionFeeRate의 반환값(항상 숫자, 0 포함)은 이 함수와 무관하게 그대로 유지된다 - 이
// 함수는 오직 Safety Layer가 "Fee 미확인" 경고를 붙일지 판단하는 데만 쓰인다.
function isFeeExplicitlySet(target) {
  const feeRates = state.projection.customFeeRates || {};
  if (target.type === 'ticker') {
    const key = buildCustomRateKey(target.ticker, target.label);
    return !!key && feeRates[key] !== undefined;
  }
  if (target.type === 'namedHolding') {
    const key = buildCustomRateKey('', target.name);
    return !!key && feeRates[key] !== undefined;
  }
  const groupKey = getProjectionGroupKey(target.category);
  return feeRates[groupKey] !== undefined;
}
// 지역(국내/해외) 하나의 목표 배분 "내에서"의 가중평균 운용보수(%) - computeRegionWeightedRate(수익률)와
// 완전히 동일한 구조. Fee는 프리셋(보수/일반/긍정)에 따라 달라지지 않으므로 presetKey 인자가 없다.
// 선형(가중평균) 계산이 상관관계·분산 효과가 있는 σ와 달리 Fee에는 수학적으로 정확하다(비용은 그냥
// 잔고에 비례해 빠져나가는 값이라 "분산 효과"라는 개념 자체가 없다).
function computeRegionWeightedFeeRate(owner, region) {
  const targets = expandRebalanceTargetsForComputation(owner, region);
  const sumPct = targets.reduce((s, t) => s + num(t.pct), 0);
  if (sumPct === 0) return 0;
  let weighted = 0;
  targets.forEach((t) => { weighted += (num(t.pct) / sumPct) * getTargetProjectionFeeRate(t); });
  return weighted;
}
// [월적립금 설정] 배분 종목 하나의 운용보수 - getMonthlyAllocationItemRate(수익률)와 동일한 대응 함수.
function getMonthlyAllocationItemFeeRate(item) {
  return getTargetProjectionFeeRate({ type: 'ticker', ticker: item.ticker, label: item.label });
}

// [Phase 3-4] computeFutureValueWithContributionGrowth(성장률 반영, 이미 fee=0과 bit-identical하도록
// 방어됨)에 Fee까지 접어 넣는다 - Gross Return을 직접 수정하지 않는다는 원칙을 지키기 위해, "그로스
// 월수익률"과 "월별 fee 배율"을 곱한 하나의 "유효 월성장률"을 구한 뒤, 이를 다시 "연율(%)" 표현으로
// 되돌려 기존 computeFutureValueWithContributionGrowth에 그대로 넘긴다(그 함수/computeFutureValue
// 자체는 한 글자도 안 바뀐다). feeRateAnnual=0이면 반드시 기존 함수를 그대로(분기) 호출해 부동소수점
// 오차 없이 bit-identical을 보장한다(회귀테스트 필수 요구사항).
function computeFutureValueWithContributionGrowthAndFee(pv, annualRatePct, years, initialMonthlyContribution, contributionGrowthRate, feeRateAnnual) {
  if (Math.abs(feeRateAnnual || 0) < 1e-9) {
    return computeFutureValueWithContributionGrowth(pv, annualRatePct, years, initialMonthlyContribution, contributionGrowthRate);
  }
  const grossMonthlyRate = annualRatePct / 100 / 12;
  const feeMonthlyFactor = computeMonthlyFeeFactor(feeRateAnnual);
  const effectiveMonthlyGrowth = (1 + grossMonthlyRate) * feeMonthlyFactor;
  const effectiveAnnualRatePct = (effectiveMonthlyGrowth - 1) * 1200;
  return computeFutureValueWithContributionGrowth(pv, effectiveAnnualRatePct, years, initialMonthlyContribution, contributionGrowthRate);
}

// [범용 키워드 자동매칭 - 요청 반영] "수익률 관리"에서 어떤 대표매칭 키에든(BOND/BOND.STOCK/부동산/
// CASH/GOLD 등 카테고리성 키 포함) 사용자가 직접 등록한 키워드 목록(customScenarioRates[key].keywords)과
// 종목명을 대조한다. 예전 NAME_KEYWORD_RATE_MAP(QQQM/SCHD/SPYM 3종 고정)은 하드코딩이라 사용자가
// 확장할 수 없었는데, 이 함수는 등록된 어떤 키든(카테고리성 키 포함) 키워드로 자동 매칭되게 한다 -
// 예: "달러 예수금"이 CASH 키워드("현금","달러")에 걸리면 하드코딩된 현금=0% 대신 CASH의 등록
// 수익률을 쓰고, "TIGER 미국테크TOP10채권혼합"이 BOND.STOCK 키워드("채권혼합")에 걸리면 단순 지역
// 폴백이 아니라 채권혼합 전용 수익률을 쓴다.
function keywordMatchesName(hay, keyword) {
  const kw = String(keyword ?? '').trim().toUpperCase();
  if (!kw) return false;
  // [오매칭 방지] 한 글자짜리 키워드(예: '금')는 단순 부분포함으로 매칭하면 '현금'(현+금)/'예금'/'입금'
  // 처럼 전혀 무관한 단어까지 전부 걸린다 - 종목명을 공백/괄호/하이픈/쉼표로 토큰화해 정확히 일치하는
  // 토큰이 있을 때만 인정한다(부분포함 매칭 안 함).
  if (kw.length <= 1) {
    const tokens = hay.split(/[\s()[\]\-·,/]+/).filter(Boolean);
    return tokens.includes(kw);
  }
  return hay.includes(kw);
}
function getCustomKeywordRateKey(name) {
  const hay = String(name ?? '').toUpperCase();
  if (!hay) return null;
  const customRates = state.projection.customScenarioRates || {};
  // [겹침 방지 - 버그 수정] "채권혼합"(BOND.STOCK 키워드)은 "채권"(BOND 키워드)을 부분문자열로 포함한다 -
  // 그냥 먼저 등록된 키가 이기게 두면(Object.keys 순서 의존) 등록 순서에 따라 채권혼합 상품이 엉뚱하게
  // BOND로 잡힐 수 있다. 매칭되는 키워드 중 "가장 긴(더 구체적인)" 것을 우선한다 - 등록 순서와 무관하게
  // 항상 안정적으로 더 구체적인 키가 이긴다.
  let bestKey = null;
  let bestLen = 0;
  for (const key of Object.keys(customRates)) {
    const keywords = customRates[key].keywords;
    if (!Array.isArray(keywords)) continue;
    keywords.forEach((kw) => {
      const trimmedLen = String(kw ?? '').trim().length;
      if (trimmedLen > bestLen && keywordMatchesName(hay, kw)) { bestKey = key; bestLen = trimmedLen; }
    });
  }
  return bestKey;
}

// 오버라이드 키 하나의 특정 프리셋(보수/일반/긍정) 값을 읽는다 - 등록은 돼 있어도 그 프리셋 칸만
// 비워뒀다면(예: 보수/긍정만 입력) undefined를 반환해 호출부가 시스템 기본값으로 자연스럽게 대체하게 한다.
function getCustomRate(key, presetKey) {
  const entry = key ? (state.projection.customScenarioRates || {})[key] : undefined;
  if (!entry) return undefined;
  const v = entry[presetKey];
  return (v !== undefined && v !== '' && Number.isFinite(num(v))) ? num(v) : undefined;
}

// [상품/종목별 세부 기대수익률 매핑] 리밸런싱 후 3개 프리셋(보수적/일반적/긍정적)의 종목별 예상 연수익률.
// 이 표의 값들도 이제 전부 사용자 정의 오버라이드가 있으면 그 값이 최우선이다(getPresetTickerRate 등 참고).
//   - tickers: 특정 티커로 지정된 목표(리밸런싱 탭에서 직접 추가한 종목)의 전용 수익률. 키는
//     sanitizeTicker().yahooTicker 형식('005930.KS'=삼성전자, 'MSFT' 등)이다.
//   - indexRates: 위 tickers 표에 없는 "기타 개별 종목"이 대신 쓰는 지역별 대표 지수 수익률 -
//     국내는 KOSPI, 해외는 S&P500(=tickers표의 'S&P500' 행과 동일 값, 대표지수 그 자체이므로 의도적으로
//     같다 - 실제로 SPYM 티커를 보유해도 이 'S&P500' 대표매칭 키로 잡힌다, TICKER_RATE_KEY_ALIAS 참고)을 쓴다.
//   - categories: 채권(국채) 캐치올 전용 수익률. 현금은 항상 0%(getTargetProjectionRate에서 처리),
//     주식 캐치올은 categories가 아니라 indexRates(지역별 대표지수)를 쓴다.
// [Phase 6-B/6-C 감사 - Price Return vs Total Return 문서화] 이 preset 수치가 배당 재투자를 포함한
// Total Return 기준인지, 가격 변동만 반영한 Price Return 기준인지는 원 출처가 명시되어 있지 않아
// 코드로 확정할 수 없다. 참고로 실측 변동성(js/09 computeAnnualizedVolatilityPct)은 배당
// 재투자를 반영하지 않은 순수 종가(Yahoo Finance close, 비수정 Adjusted Close) 기준이다 - 두 값의
// 기준이 서로 다를 수 있다는 점을 임의로 통일해서 서술하지 않는다.
// [Phase 7-F - CMA 실제 적용] 이 표의 값은 이제 두 종류가 섞여 있다 - 아래 CMA_SOURCE_METADATA의
// US_EQUITY 항목(status: 'cma_verified')에 해당하는 것(indexRates.foreign, 그리고 NASDAQ/S&P500/
// SCHD/MSFT/GOOGL/AAPL/AMZN/META/NVDA 9개 tickers 행)은 Vanguard Capital Markets Model(VCMM)
// 기준 검증된 값이고, 그 외(indexRates.domestic=KOSPI, categories.채권/부동산)는 여전히 출처 불명의
// legacy_approximation이다([Phase 47-A] 삼성전자 전용 행은 근거가 없어 폐지되고 KOSPI 앵커를 상속한다)(Phase 7-D/7-E 감사에서 신뢰할 수 있는
// forward-looking CMA를 확보하지 못해 이번 라운드에서 의도적으로 변경하지 않음 - 임의 숫자 생성 금지
// 원칙). 이 metadata는 순수 내부 추적용이며 계산 로직(getTargetProjectionRate 등)은 이 값들을
// 전혀 참조하지 않는다 - 사용자에게 노출되는 기능이 아니다.
// [Phase 41-B] 외부 CMA(연 기하수익률) → 앱 저장값(연 명목 APR, 월복리) 변환.
// Phase 7-F에서 US_EQUITY 값을 만들 때 손으로 계산했던 바로 그 식을 함수로 옮긴 것이다:
//   앱 저장값 = 12 × ((1 + 연기하수익률)^(1/12) − 1)
// 이렇게 저장해야 결정론 경로의 (1 + r/12)^12 − 1 이 원자료의 연 기하수익률과 같아지고,
// Monte Carlo의 GBM median 연성장률도 같은 값이 된다(Phase 40-A/B에서 동치 증명).
// 소수 첫째 자리 반올림은 기존 US_EQUITY와 동일한 정책이며, 이 함수에 4.2/5.2/6.2를 넣으면
// 현재 코드에 하드코딩된 4.1/5.1/6.0이 그대로 재현된다(테스트로 고정).
function cmaGeometricToAppRate(annualGeometricPct) {
  return Math.round(12 * (Math.pow(1 + annualGeometricPct / 100, 1 / 12) - 1) * 100 * 10) / 10;
}
// [Phase 41-B] Vanguard VCMM(2026-06-30 실행분)의 두 자산군 원자료 range - 하단/중앙/상단을
// 그대로 Bear/Base/Bull에 대응시킨다(US_EQUITY와 동일한 방식, 임의 조정 없음).
// 숫자를 직접 적지 않고 위 변환 함수를 태워서 "원자료 → 저장값" 관계가 코드에 남게 한다.
const CMA_RAW_RANGES = Object.freeze({
  DEV_EX_US: { conservative: 4.5, normal: 5.5, optimistic: 6.5 },
  EMERGING: { conservative: 2.0, normal: 3.0, optimistic: 4.0 }
});
function cmaPresetRate(rangeKey, presetKey) {
  return cmaGeometricToAppRate(CMA_RAW_RANGES[rangeKey][presetKey]);
}

const SCENARIO_RATE_PRESETS = {
  conservative: {
    label: '보수적', color: '#ef4444',
    // [부동산 수익률 매핑 추가] 채권과 동일한 "카테고리 캐치올" 방식 - 부동산은 종목 단위 매핑이 없는
    // 단일 자산군이라 tickers가 아니라 categories에 둔다(getRateForProjectionGroupKey/getReferenceRate 참고).
    // [legacy_approximation - Phase 7-F에서 변경 안 함] 채권/부동산 - 신뢰할 수 있는 forward CMA 미확보.
    categories: { '채권': 3.5, '부동산': 3.0 },
    // [legacy_approximation] domestic=KOSPI(KR_EQUITY) - Phase 7-D 감사 결과 신뢰할 수 있는 한국주식
    // forward CMA를 확보하지 못해 변경하지 않음. [cma_verified - Phase 7-F FINAL VALIDATION 갱신] foreign
    // =US_EQUITY Anchor(Vanguard VCMM 2026-06-30 실행분 range 4.2%~6.2% 하단값, Case A 변환식
    // 12×((1+0.042)^(1/12)-1)=4.1213% 적용 결과 - 이전 3.4%는 구버전(2025년말 실행분, 3.5~5.5%) 기준값이라
    // 최신 원문 재검증 결과 교체함, 아래 CMA_SOURCE_METADATA 참고).
    indexRates: { domestic: 5.0, foreign: 4.1 },
    // [Phase 47-A §4] '005930.KS'(삼성전자) 전용 수익률 8.0을 여기서 제거했다 - 근거 없는
    // Individual Alpha(KOSPI 대비 +3.0%p)였고, 미국 개별종목 6종이 US_EQUITY Anchor를 alpha 0으로
    // 상속하는 정책과도 모순됐다. 이제 KOSPI 앵커를 상속한다(resolveProjectionRateForKey/
    // getSystemDefaultRate의 '005930.KS' 분기). 사용자가 직접 등록한 값은 그대로 유지된다.
    tickers: {
      // [cma_verified - US_EQUITY Anchor 무조정 상속] NASDAQ/S&P500/SCHD/개별 미국주식 6종 전부
      // 동일한 US_EQUITY Anchor 값을 상속한다 - 개별 종목/스타일 프리미엄을 임의로 추가하지 않는다
      // (Phase 7-C~7-F 원칙: Expected Growth=Anchor, Volatility만 종목별 실측값 사용).
      'NASDAQ': 4.1, 'S&P500': 4.1, 'SCHD': 4.1,
      'MSFT': 4.1, 'GOOGL': 4.1, 'AAPL': 4.1, 'AMZN': 4.1, 'META': 4.1, 'NVDA': 4.1,
      // [Phase 41-B - cma_verified] 미국 외 선진국 / 신흥국. 기존 값은 하나도 건드리지 않았고
      // 이 두 줄만 새로 추가됐다(변환식은 US_EQUITY와 동일).
      'DEV_EX_US': cmaPresetRate('DEV_EX_US', 'conservative'),
      'EMERGING': cmaPresetRate('EMERGING', 'conservative')
    }
  },
  normal: {
    label: '일반적', color: '#f59e0b',
    // [legacy_approximation - Phase 7-F에서 변경 안 함]
    categories: { '채권': 4.0, '부동산': 5.5 },
    // [cma_verified - Phase 7-F FINAL VALIDATION 갱신] foreign=US_EQUITY Anchor 중앙값(Vanguard 자신의
    // 최신 range 4.2~6.2%의 중간값 5.2%를 Case A 변환식 12×((1+0.052)^(1/12)-1)=5.0800%한 결과 - 다른
    // 기관과의 평균이 아니라 Vanguard 단일 출처의 자체 range 중앙값임을 반드시 구분할 것(Phase 7-F 지시사항).
    indexRates: { domestic: 7.0, foreign: 5.1 },
    tickers: {
      // [Phase 47-A §4] 삼성전자 전용값 9.0 제거 - KOSPI 앵커 상속.
      'NASDAQ': 5.1, 'S&P500': 5.1, 'SCHD': 5.1,
      'MSFT': 5.1, 'GOOGL': 5.1, 'AAPL': 5.1, 'AMZN': 5.1, 'META': 5.1, 'NVDA': 5.1,
      'DEV_EX_US': cmaPresetRate('DEV_EX_US', 'normal'),
      'EMERGING': cmaPresetRate('EMERGING', 'normal')
    }
  },
  optimistic: {
    label: '긍정적', color: '#10b981',
    // [legacy_approximation - Phase 7-F에서 변경 안 함]
    categories: { '채권': 5.5, '부동산': 8.0 },
    // [cma_verified - Phase 7-F FINAL VALIDATION 갱신] foreign=US_EQUITY Anchor 상단값(Vanguard 최신
    // range 상단 6.2%를 Case A 변환식 12×((1+0.062)^(1/12)-1)=6.0305% 적용)
    indexRates: { domestic: 11.0, foreign: 6.0 },
    tickers: {
      // [Phase 47-A §4] 삼성전자 전용값 15.0 제거 - KOSPI 앵커 상속.
      'NASDAQ': 6.0, 'S&P500': 6.0, 'SCHD': 6.0,
      'MSFT': 6.0, 'GOOGL': 6.0, 'AAPL': 6.0, 'AMZN': 6.0, 'META': 6.0, 'NVDA': 6.0,
      'DEV_EX_US': cmaPresetRate('DEV_EX_US', 'optimistic'),
      'EMERGING': cmaPresetRate('EMERGING', 'optimistic')
    }
  }
};

// [Phase 7-F - CMA Source Metadata, 순수 내부 추적용] 사용자에게 노출되는 기능/UI가 아니며,
// getTargetProjectionRate() 등 계산 로직은 이 객체를 전혀 참조하지 않는다(추가해도 계산 결과에
// 영향 없음 - 회귀테스트 관점에서 이 객체는 "죽은 데이터"다). 향후 내부 감사/개발자 도구에서만
// 참고할 목적으로 Phase 7-C에서 설계한 metadata 스키마를 그대로 반영한다.
const CMA_SOURCE_METADATA = Object.freeze({
  US_EQUITY: {
    status: 'cma_verified',
    appliesTo: ['indexRates.foreign', 'NASDAQ', 'S&P500', 'SCHD', 'MSFT', 'GOOGL', 'AAPL', 'AMZN', 'META', 'NVDA'],
    source: 'Vanguard Capital Markets Model (VCMM) - "Setting realistic expectations" 공식 페이지',
    sourceUrl: 'https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html',
    // [Phase 7-F FINAL VALIDATION - 원문 재확인 완료] 2026-06-30 VCMM 실행분 기준(페이지 자체에 언급된
    // 날짜는 2026-03-31/2026-06-30/2026-07-22 세 개) 원문 인용: "our 10-year expected annualized return
    // for U.S. equities declined from a range of 4.9%-6.9% to a range of 4.2%-6.2%". 이전(Phase 7-F 1차)
    // 에 쓰인 3.5~5.5%는 그보다 앞선 2025년말 실행분 기준 구버전 수치였음 - 이번 재검증으로 최신 원문
    // (4.2~6.2%)으로 교체함(단순 재인용이 아니라 원문 페이지를 직접 확인).
    asOfDate: '2026-06-30(VCMM 모델 실행 기준일), 페이지 게시/갱신일 2026-07-22 표기 확인',
    forecastHorizonYears: 10,
    currency: 'USD',
    nominalReal: 'nominal',
    // [원문 확인 완료] "The asset-return distributions shown here are in nominal terms...and represent
    // Vanguard's views of likely total returns, in U.S. dollar terms" - nominal/total return/USD 전부
    // 원문에 명시적으로 확인됨(이전엔 "추정"이었으나 이번 재검증으로 확정).
    returnType: 'total(원문 확인: "likely total returns")',
    // [원문 확인 완료] "Forecasts represent the distribution of geometric returns" - geometric으로 명시.
    // median이라는 단어 자체는 원문에 없으나, 이 앱의 GBM 모델에서 median 연성장률과 geometric 연성장률은
    // 수학적으로 동일한 값이므로(Phase 7-C 증명) Case A 변환식을 그대로 적용해도 무방하다.
    meanType: 'geometric(원문 확인: "distribution of geometric returns")',
    methodologyNote: 'VCMM 10,000회 시뮬레이션(원문 확인: "10,000 simulations for each modeled asset class") ' +
      'geometric return 분포. Conservative=Vanguard 자체 range 하단(4.2%), Optimistic=상단(6.2%), Normal=' +
      '그 range의 중간값(5.2%) - 다른 기관과의 평균이 아니라 Vanguard 단일 출처의 자체 range 중앙값. ' +
      '원문은 이 range가 어떤 백분위수(percentile)를 의미하는지 명시하지 않음(Phase 7-C 경고사항대로, ' +
      '25th/75th 등으로 임의 해석하지 않았음). BlackRock(~5%, geometric 명시)·J.P.Morgan(6.7%, 10-15y, ' +
      'return definition 미확인)은 교차검증 참고자료로만 사용했고 수치 산정에 기계적으로 반영하지 않았다.',
    uncertaintyNote: '10년 기관 전망을 20년 앱 horizon에 그대로 적용하는 horizon mismatch를 내포함. ' +
      '개별종목(MSFT/GOOGL/AAPL/AMZN/META/NVDA)과 NASDAQ/SCHD는 이 Anchor를 무조정 상속하며, ' +
      '이 값은 미래 수익률을 보장하지 않는다. VCMM은 분기마다 갱신되므로 이 값도 정적 스냅샷일 뿐이다.',
    version: 2,
    // [Phase 29-A - 검증된 추천 후보] "지금 활성 기준(위 SCENARIO_RATE_PRESETS)"과 완전히 분리된
    // 별도 필드다 - 여기 값은 사용자가 "수익률 관리"에서 [적용]을 누르기 전까지 어떤 계산에도 영향을
    // 주지 않는다(recommended != active rate, PM 원칙 4). 사람이 원문을 재검증해 Phase 29 승인 기준
    // (출처신뢰성/투자기간/자산군정의/nominal-real/arithmetic-geometric/price-total/통화/장기타당성/
    // 앱 성장률정의 호환)을 전부 통과한 값만 여기 채운다 - 지금은 신규로 검증된 후보가 없어 null이다.
    // 채울 때는 { version(정수, 이전보다 반드시 큼), conservative, normal, optimistic, source,
    // sourceUrl, asOfDate, forecastHorizonYears } 형태를 쓴다(아래 appliesToKeys에 있는 모든 키에
    // 공통 적용).
    recommended: null,
    // [Phase 29-A - 추천 배지 매칭용 정확한 키 목록] 위 appliesTo는 사람이 읽는 주석(괄호 설명 포함)이라
    // 코드가 문자열 비교로 안전하게 쓸 수 없다 - getCmaAnchorForKey()가 쓸 정확한 SCENARIO_RATE_BASE_ROWS
    // 키만 별도로 둔다. appliesTo와 같은 대상을 가리키되 형식만 기계 매칭용으로 정리한 것.
    appliesToKeys: ['S&P500', 'NASDAQ', 'SCHD', 'MSFT', 'GOOGL', 'AAPL', 'AMZN', 'META', 'NVDA']
  },
  KR_EQUITY: {
    status: 'legacy_approximation',
    // [Phase 47-A §4] 삼성전자 전용 tickers 항목이 제거되어, 이 앵커는 이제 국내 대표지수 하나로
    // 국내 주식 전체(삼성전자 포함)를 덮는다 - 종목별 프리미엄을 시스템이 임의로 부여하지 않는다.
    appliesTo: ['indexRates.domestic(KOSPI - 삼성전자를 포함한 국내 주식 전체가 이 앵커를 상속)'],
    source: null, sourceUrl: null, asOfDate: null,
    methodologyNote: '신뢰할 수 있는 forward-looking CMA를 확보하지 못함(Phase 7-D/7-E 감사) - ' +
      '기존 하드코딩 근사치를 그대로 유지, 임의 숫자를 생성하지 않음.',
    uncertaintyNote: '출처 불명. 실제 수익률을 보장하지 않으며, 특정 근거에 기반한 값이 아니다.',
    version: 0,
    // [Phase 29-A] 출처(source)가 없는 legacy_approximation 앵커에는 recommended를 만들지 않는다
    // (PM 지시 12) - 신뢰 가능한 forward CMA가 확보되기 전까지 이 값은 계속 null로 남는다.
    recommended: null,
    appliesToKeys: ['KOSPI', 'KOSDAQ', '005930.KS']
  },
  KR_BOND: {
    status: 'legacy_approximation', appliesTo: ['categories.채권'],
    source: null, sourceUrl: null, asOfDate: null,
    methodologyNote: '한국 국고채 10년물 시장금리(약 4%대)를 방법론적으로 검토했으나 이는 기관 CMA가 ' +
      '아니라 시장 관측치라 US_EQUITY와 같은 기준으로 채택하지 않음(Phase 7-D/7-E) - 기존 값 유지.',
    uncertaintyNote: '출처 불명. 실제 수익률을 보장하지 않는다.',
    version: 0,
    recommended: null,
    appliesToKeys: ['BOND']
  },
  REAL_ESTATE: {
    status: 'legacy_approximation', appliesTo: ['categories.부동산'],
    source: null, sourceUrl: null, asOfDate: null,
    methodologyNote: '과거 실현수익률만 확인되고 forward-looking CMA는 확보하지 못함(Phase 7-D) - ' +
      '과거 수익률을 미래 기대수익률로 사용하지 않는다는 원칙에 따라 기존 값 유지.',
    uncertaintyNote: '출처 불명. 실제 수익률을 보장하지 않는다.',
    version: 0,
    recommended: null,
    appliesToKeys: ['부동산']
  },
  // [Phase 41-B] US_EQUITY와 같은 Vanguard VCMM 실행분(2026-06-30)에서 나온 두 자산군.
  // 앵커 schema는 US_EQUITY와 동일하게 쓰고, 원문에 없는 항목은 비워 둔다(임의로 채우지 않는다).
  DEV_EX_US_EQUITY: {
    status: 'cma_verified',
    appliesTo: ["tickers['DEV_EX_US'](미국 외 선진국 주식)"],
    source: 'Vanguard Capital Markets Model (VCMM) - "Setting realistic expectations" 공식 페이지',
    sourceUrl: 'https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html',
    asOfDate: '2026-06-30(VCMM 모델 실행 기준일), 페이지 게시/갱신일 2026-07-22 표기 확인',
    forecastHorizonYears: 10,
    currency: 'USD',
    nominalReal: 'nominal',
    returnType: 'total(원문 확인: "likely total returns")',
    meanType: 'geometric(원문 확인: "geometric returns over different time horizons")',
    methodologyNote: 'Vanguard 원문 range 4.5%~6.5%(직전 2026-03-31 실행분 5.4%~7.4%에서 하향). ' +
      'Conservative=하단 4.5%, Normal=range 중간값 5.5%, Optimistic=상단 6.5% - US_EQUITY와 동일한 방식이며 ' +
      '다른 기관과의 평균이 아니라 Vanguard 단일 출처의 자체 range다. 앱 저장값은 cmaGeometricToAppRate()로 ' +
      '변환한 결과(연 명목 APR, 월복리)이며 임의 조정하지 않았다. 원문은 이 range가 어떤 백분위수인지 명시하지 않는다.',
    uncertaintyNote: 'FTSE 기준 분류라 이 바스켓에는 한국도 포함된다 - 특정 단일 국가의 기대수익률이 아니라 ' +
      '미국 외 선진국 전체의 가정이다. 10년 전망을 20년 앱 horizon에 적용하는 horizon mismatch를 내포하며, ' +
      'USD 기준이라 원화 투자자의 실현 수익률과는 환율만큼 달라질 수 있다. 미래 수익률을 보장하지 않는다.',
    version: 1,
    recommended: null,
    appliesToKeys: ['DEV_EX_US']
  },
  EM_EQUITY: {
    status: 'cma_verified',
    appliesTo: ["tickers['EMERGING'](신흥국 주식)"],
    source: 'Vanguard Capital Markets Model (VCMM) - "Setting realistic expectations" 공식 페이지',
    sourceUrl: 'https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html',
    asOfDate: '2026-06-30(VCMM 모델 실행 기준일), 페이지 게시/갱신일 2026-07-22 표기 확인',
    forecastHorizonYears: 10,
    currency: 'USD',
    nominalReal: 'nominal',
    returnType: 'total(원문 확인: "likely total returns")',
    meanType: 'geometric(원문 확인: "geometric returns over different time horizons")',
    methodologyNote: 'Vanguard 원문 range 2%~4%(직전 2026-03-31 실행분 3.6%~5.6%에서 하향). ' +
      'Conservative=하단 2%, Normal=range 중간값 3%, Optimistic=상단 4% - US_EQUITY와 동일한 방식. ' +
      '앱 저장값은 cmaGeometricToAppRate() 변환 결과이며 임의 조정하지 않았다.',
    uncertaintyNote: 'FTSE 기준 분류라 이 바스켓에서 한국은 제외된다(FTSE는 2009년부터 한국을 선진국으로 분류). ' +
      '따라서 이 가정을 국내 주식에 적용해서는 안 된다. 10년 전망을 20년 horizon에 적용하는 mismatch를 ' +
      '내포하고 USD 기준이다. 미래 수익률을 보장하지 않는다.',
    version: 1,
    recommended: null,
    appliesToKeys: ['EMERGING']
  },
  CASH: {
    status: 'legacy_approximation', appliesTo: ['현금(항상 0% 고정, getTargetProjectionRate)'],
    source: null, sourceUrl: null, asOfDate: null,
    methodologyNote: '정책금리(한국은행 기준금리)만 확인되고 실제 단기시장금리는 확보하지 못함(Phase ' +
      '7-D/7-E) - 정의가 불명확한 상태에서 임의 숫자를 넣지 않고 기존 값(0%) 유지.',
    uncertaintyNote: '명목/실질 여부 불명확. 실제 수익률을 보장하지 않는다.',
    version: 0,
    recommended: null,
    appliesToKeys: ['CASH', 'CASH.USD']
  }
});

// [Phase 29-A - 새로운 장기 전망 확인 기능] 이 블록 전체는 "검증된 추천값을 사용자에게 제안하고,
// 사용자가 명시적으로 [적용]을 눌렀을 때만 customScenarioRates에 반영"하는 기능이다. 새 resolver를
// 만들지 않는다 - getReferenceRate/resolveProjectionRateForKey/getTargetProjectionRate는 이 블록을
// 전혀 모르고, 이 블록이 하는 일은 오직 "무엇을 배지로 보여줄지 계산"과 "[적용] 시 기존
// customScenarioRates에 기존 저장 로직과 동일한 방식으로 값을 써넣는 것"뿐이다.

// key(SCENARIO_RATE_BASE_ROWS 소속) 하나가 어느 CMA_SOURCE_METADATA 앵커에 속하는지 찾는다 - 사용자가
// 늘리는 customScenarioRates 커스텀 키는 시스템 앵커 개념이 없으므로 항상 null.
/* =========================================================================
 * [Phase 40-C] Return Assumption Key 추천 - 대표매칭 추천(recommendRateMatchKey)과 별개다
 *
 * 두 함수를 합치지 않는 이유: 대표매칭 키는 "이 자산을 수익률 관리 목록의 어느 행에 붙일 것인가"
 * 라는 매칭 문제이고, 여기는 "이 자산에 어떤 장기 성장률 가정을 적용해도 되는가"라는 정책 문제다.
 * 매칭은 이름/티커가 같으면 성립하지만, 가정은 자산 성격이 같아야 성립한다.
 * 예: 미국 장기국채 ETF는 "해외 자산"이라 대표매칭은 S&P500 행으로 갈 수 있지만,
 *     장기 수익률 가정으로 미국 주식 5.1%를 쓰는 것은 명백히 틀렸다.
 *
 * 이 함수는 수익률 숫자를 만들지 않는다. 근거가 없으면 NONE을 돌려주는 것이 정상 결과다.
 * ====================================================================== */
const RETURN_RECOMMENDATION_STRENGTH = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', NONE: 'NONE' });
const RETURN_ASSUMPTION_STATUS = Object.freeze({
  OK: 'OK',                       // 성격에 맞는 가정이 연결됨
  NEEDS_REVIEW: 'NEEDS_REVIEW',   // 연결은 되어 있으나 성격과 맞지 않아 사람이 확인해야 함
  USER_DEFINED: 'USER_DEFINED',   // 사용자가 직접 등록한 키 - 성격을 시스템이 판단하지 않는다
  UNRESOLVED: 'UNRESOLVED',       // 성격을 몰라 가정을 자동으로 붙이지 않음
  // [M3] 성격은 알지만 그 성격에 쓸 수 있는 장기 수익률 가정이 시스템에 아직 없음.
  // UNRESOLVED("무엇인지 모른다")와 다르고, OK("맞는 가정을 쓰고 있다")와는 더 다르다.
  // 지금은 원자재와 가상자산이 여기 해당한다 - 계산에서 0%로 처리되지만 그 0%는
  // "이 자산의 장기 기대수익률이 0%"라는 뜻이 아니다.
  NO_SYSTEM_ASSUMPTION: 'NO_SYSTEM_ASSUMPTION'
});

// 성격 하나가 어떤 Return Key 후보를 갖는지 - 여기 없는 성격은 "쓸 수 있는 Key가 아직 없다"는 뜻이다.
function returnKeyCandidatesForCharacter(character, region) {
  if (character === ASSET_CHARACTERS.KR_EQUITY) {
    return /\.KQ$/i.test(String(region || '')) ? ['KOSDAQ', 'KOSPI'] : ['KOSPI', 'KOSDAQ'];
  }
  if (character === ASSET_CHARACTERS.US_EQUITY) return ['S&P500', 'NASDAQ', 'SCHD'];
  // [Phase 41-B] Vanguard VCMM 근거가 확보되어 더 이상 "적합한 기준 없음"이 아니다.
  if (character === ASSET_CHARACTERS.DEV_EX_US_EQUITY) return ['DEV_EX_US'];
  if (character === ASSET_CHARACTERS.EM_EQUITY) return ['EMERGING'];
  if (character === ASSET_CHARACTERS.CASH) return ['CASH', 'CASH.USD'];
  if (character === ASSET_CHARACTERS.REAL_ESTATE) return ['부동산'];
  if (character === ASSET_CHARACTERS.BOND) return ['BOND'];
  return [];
}

// 사람이 읽는 성격 이름 - 화면에 'US_EQUITY' 같은 내부 값을 그대로 노출하지 않는다.
const ASSET_CHARACTER_LABELS = Object.freeze({
  KR_EQUITY: '국내 주식', US_EQUITY: '미국 주식', EM_EQUITY: '신흥국 주식',
  DEV_EX_US_EQUITY: '미국 외 선진국 주식', BOND: '채권', CASH: '현금성',
  REAL_ESTATE: '부동산', COMMODITY: '금·원자재', CRYPTO: '가상자산', UNRESOLVED: '확인 필요'
});
function getAssetCharacterLabel(character) { return ASSET_CHARACTER_LABELS[character] || character; }

/**
 * 신규/보유 자산에 어떤 장기 수익률 가정을 붙일지 추천한다.
 * 반환: { recommendedReturnKey, recommendationStrength, reason, evidence, alternatives,
 *         requiresUserConfirmation, status, character }
 * recommendedReturnKey가 null이면 "적합한 가정을 찾지 못했다"는 정상 결과다 - 호출부는 이때
 * 지역 대표지수로 대신 채우면 안 된다.
 */
function recommendReturnAssumptionKey(input) {
  const ticker = String((input && input.ticker) ?? '').trim();
  const name = String((input && input.name) ?? '').trim();
  if (!ticker && !name) return null;

  // 실제로 저장될 자산과 같은 방식으로 만든다(카테고리/국내해외 자동판별 포함).
  const probe = makeAsset({ ticker, name, currency: input && input.currency, category: input && input.category });
  const char = resolveAssetCharacter(probe);
  const base = { character: char.character, characterLabel: getAssetCharacterLabel(char.character), characterSource: char.source, evidence: [] };

  // Step 1 - 사용자가 이미 명시한 값이 있으면 최우선으로 존중한다(덮어쓰지 않는다).
  const explicitKey = (input && input.explicitReturnKey) || (probe.rateMatchOverride || '');
  if (explicitKey) {
    const keyChar = getReturnKeyCharacter(explicitKey);
    const conflict = keyChar && char.character !== ASSET_CHARACTERS.UNRESOLVED && keyChar !== char.character;
    return Object.assign(base, {
      recommendedReturnKey: explicitKey,
      recommendationStrength: RETURN_RECOMMENDATION_STRENGTH.HIGH,
      reason: conflict
        ? `이미 지정된 기준(${getRateMatchKeyDisplayLabel(explicitKey)})이 있으나, 이 자산은 ${getAssetCharacterLabel(char.character)}으로 보입니다. 확인이 필요합니다.`
        : '사용자가 직접 지정한 기준을 그대로 사용합니다.',
      evidence: ['사용자 지정'],
      alternatives: conflict ? returnKeyCandidatesForCharacter(char.character, char.ticker) : [],
      requiresUserConfirmation: !!conflict,
      status: conflict ? RETURN_ASSUMPTION_STATUS.NEEDS_REVIEW : RETURN_ASSUMPTION_STATUS.OK
    });
  }

  // Step 2 - 같은 티커를 이미 보유 중이고 그 자산에 명시적 지정이 있으면 강한 증거로 쓴다.
  if (ticker) {
    const yahoo = sanitizeTicker(ticker).yahooTicker;
    const twin = (state.assets || []).find((a) => a.rateMatchOverride && sanitizeTicker(a.ticker).yahooTicker === yahoo);
    if (twin) {
      return Object.assign(base, {
        recommendedReturnKey: twin.rateMatchOverride,
        recommendationStrength: RETURN_RECOMMENDATION_STRENGTH.HIGH,
        reason: `이미 보유 중인 같은 종목에 적용된 기준(${getRateMatchKeyDisplayLabel(twin.rateMatchOverride)})과 동일하게 맞춥니다.`,
        evidence: ['동일 종목 기존 설정'],
        alternatives: [], requiresUserConfirmation: false, status: RETURN_ASSUMPTION_STATUS.OK
      });
    }
  }

  // Step 3 - 성격을 확인하지 못하면 여기서 멈춘다. 지역만 보고 주식 가정을 붙이지 않는다.
  // [Phase 47-A §2] 실제 계산과 동일한 근거 기준을 쓴다 - 계산은 적용하지 않는데 화면은 추천하거나,
  // 그 반대가 되지 않도록 CHARACTER_SOURCES_FOR_AUTO_RATE_KEY 하나만 본다.
  if (char.character === ASSET_CHARACTERS.UNRESOLVED
      || !CHARACTER_SOURCES_FOR_AUTO_RATE_KEY.includes(char.source)) {
    return Object.assign(base, {
      recommendedReturnKey: null,
      recommendationStrength: RETURN_RECOMMENDATION_STRENGTH.NONE,
      // 두 경우를 구분해 말한다 - "성격을 전혀 모른다"와 "국내 주식처럼 보이지만 그 판단의 근거가
      // classifyCategory의 기본값('주식')뿐이라 확인했다고 말할 수 없다"는 서로 다른 상황이다.
      reason: char.character === ASSET_CHARACTERS.UNRESOLVED
        ? '자산 성격을 확인할 수 없어 장기 수익률 가정을 자동으로 적용하지 않았습니다.'
        : '이 상품이 실제로 무엇인지 확인할 수 있는 정보가 없어 장기 수익률 가정을 자동으로 적용하지 않았습니다. 기준을 직접 지정하면 그 값을 사용합니다.',
      evidence: [], alternatives: [], requiresUserConfirmation: true,
      status: RETURN_ASSUMPTION_STATUS.UNRESOLVED
    });
  }

  // Step 4~5 - 성격에 맞는 Key 후보를 찾는다. 없으면 "가정 없음"이 정상 결과다.
  let candidates = returnKeyCandidatesForCharacter(char.character, char.ticker);
  // 성격이 확인된 다음에는 "그 성격 안에서 어느 Key가 가장 정확한가"를 기존 매칭 로직에 맡긴다
  // (QQQM은 NASDAQ, SPYM은 S&P500 - 같은 미국 주식이라도 등록된 전용 행이 있으면 그쪽이 정확하다).
  // 성격 판정을 통과한 뒤에만 쓰므로, 이 재사용이 지역 폴백을 되살리지는 않는다.
  const detail = resolveAssetGroupKeyDetail(probe);
  if (RATE_MATCH_RECOMMENDABLE_SOURCES.includes(detail.source)) {
    const detailChar = getReturnKeyCharacter(detail.key);
    const isCustomKey = !!(state.projection.customScenarioRates || {})[detail.key];
    if (detailChar === char.character || (isCustomKey && !detailChar)) {
      candidates = [detail.key].concat(candidates.filter((k) => k !== detail.key));
    }
  }
  if (candidates.length === 0) {
    return Object.assign(base, {
      recommendedReturnKey: null,
      recommendationStrength: RETURN_RECOMMENDATION_STRENGTH.NONE,
      reason: `${getAssetCharacterLabel(char.character)} 자산에 쓸 수 있는 장기 수익률 기준이 아직 없습니다. 직접 등록하면 그 값을 사용합니다.`,
      evidence: [`자산 성격: ${getAssetCharacterLabel(char.character)}`],
      alternatives: [], requiresUserConfirmation: true,
      status: RETURN_ASSUMPTION_STATUS.UNRESOLVED
    });
  }

  // 통화/시장이 다른 채권은 자동 확정하지 않는다 - 'BOND' 기준은 한국 국고채를 검토한 값이라
  // 미국 국채/회사채에 그대로 쓰면 통화와 시장이 어긋난다(CMA_SOURCE_METADATA.KR_BOND 참고).
  // 주식에는 이 검사를 적용하지 않는다 - 국내 상장 미국지수 ETF처럼 "상장 시장 ≠ 기초지수"인 상품이
  // 정상적으로 존재하고, 그 경우 위 성격 판정이 이미 기초지수를 보고 결정했기 때문이다.
  const primary = candidates[0];
  const regionMismatch = char.character === ASSET_CHARACTERS.BOND
    && RETURN_KEY_REGION[primary] && char.region && RETURN_KEY_REGION[primary] !== char.region;
  if (regionMismatch) {
    return Object.assign(base, {
      recommendedReturnKey: null,
      recommendationStrength: RETURN_RECOMMENDATION_STRENGTH.LOW,
      reason: `${getAssetCharacterLabel(char.character)} 자산이지만, 지금 등록된 기준(${getRateMatchKeyDisplayLabel(primary)})은 국내 기준이라 그대로 적용하기 어렵습니다.`,
      evidence: [`자산 성격: ${getAssetCharacterLabel(char.character)}`, `지역: ${char.region}`],
      alternatives: candidates, requiresUserConfirmation: true,
      status: RETURN_ASSUMPTION_STATUS.UNRESOLVED
    });
  }

  const strength = char.confidence === 'high'
    ? RETURN_RECOMMENDATION_STRENGTH.HIGH : RETURN_RECOMMENDATION_STRENGTH.MEDIUM;
  return Object.assign(base, {
    recommendedReturnKey: primary,
    recommendationStrength: strength,
    reason: `${getAssetCharacterLabel(char.character)} 자산으로 확인되어 ${getRateMatchKeyDisplayLabel(primary)} 기준을 제안합니다.`,
    evidence: [`자산 성격: ${getAssetCharacterLabel(char.character)}`],
    alternatives: candidates.slice(1),
    requiresUserConfirmation: strength !== RETURN_RECOMMENDATION_STRENGTH.HIGH,
    status: RETURN_ASSUMPTION_STATUS.OK
  });
}

/**
 * [Phase 40-C] 이미 보유 중인 자산에 지금 적용되고 있는 가정이 자산 성격과 맞는지 판정한다.
 * 계산을 바꾸지 않는다 - 화면에 상태만 표시하기 위한 읽기 전용 판정이다(기존 사용자 유예 정책).
 */
function assessReturnAssumptionStatus(asset) {
  const detail = resolveAssetGroupKeyDetail(asset);
  const appliedKey = detail.key;
  const char = resolveAssetCharacter(asset);
  const keyChar = getReturnKeyCharacter(appliedKey);
  const isUserDefined = !!(state.projection.customScenarioRates || {})[appliedKey];

  // [Phase 47-A] 가장 먼저 볼 것은 성격이 아니라 "이 자산에 실제로 적용된 가정이 있는가"다.
  // 예전엔 이 자리에서 "성격을 모르는데 지역 폴백으로 주식 기준이 붙어 있다"를 알렸는데, 그 폴백은
  // 이제 존재하지 않는다. 성격을 알아도(예: 금 ETF = 원자재) 그 성격에 맞는 기준이 앱에 없으면
  // 적용된 가정은 없다 - 성격 먼저 보면 이 경우를 'OK'로 잘못 보고하게 된다.
  if (detail.source === 'unresolved') {
    return {
      appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
      status: RETURN_ASSUMPTION_STATUS.UNRESOLVED,
      message: '이 자산에 적용할 장기 수익률 가정을 찾지 못해 성장 없이(0%) 계산하고 있습니다. 기준을 지정하면 그 값이 사용됩니다.'
    };
  }
  if (char.character === ASSET_CHARACTERS.UNRESOLVED) {
    // 성격은 모르지만 사용자가 기준을 직접 지정해 둔 상태 - 그 선택을 존중하고 판단하지 않는다.
    return {
      appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
      status: isUserDefined ? RETURN_ASSUMPTION_STATUS.USER_DEFINED : RETURN_ASSUMPTION_STATUS.OK,
      message: ''
    };
  }
  if (isUserDefined && !keyChar) {
    return { appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
      status: RETURN_ASSUMPTION_STATUS.USER_DEFINED, message: '' };
  }
  if (keyChar && keyChar !== char.character) {
    return {
      appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
      status: RETURN_ASSUMPTION_STATUS.NEEDS_REVIEW,
      message: `이 자산은 ${getAssetCharacterLabel(char.character)}인데 ${getRateMatchKeyDisplayLabel(appliedKey)} 기준이 적용되어 있습니다. 확인해 주세요.`
    };
  }
  /* [M3] 여기까지 왔는데 그 성격에 쓸 수 있는 Return Key가 하나도 없으면, 지금 붙어 있는 키는
   * "성격에 맞춰 고른 것"이 아니라 카테고리 이름이 그대로 키가 된 것뿐이다(원자재/암호화폐).
   * resolveProjectionRateForKey는 그런 키를 모르므로 마지막에 0을 돌려주고, 그 0이 화면에서는
   * 지금까지 "적합한 가정을 사용 중"으로 보였다 - 사용자는 앱이 이 자산의 장기 기대수익률을 0%로
   * 판단했다고 읽게 된다. 그건 이 앱의 정책이 아니다.
   *
   * 판별에 새 목록을 만들지 않는다. returnKeyCandidatesForCharacter가 이미 "이 성격에 쓸 수 있는
   * Key"를 알고 있고, 비어 있다는 것이 곧 "가정이 아직 없다"는 뜻이다(그 함수 주석 그대로).
   * 사용자가 값을 넣어둔 경우는 위 isUserDefined 분기에서 이미 USER_DEFINED로 빠져나갔다. */
  if (returnKeyCandidatesForCharacter(char.character, char.ticker).length === 0) {
    return {
      appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
      status: RETURN_ASSUMPTION_STATUS.NO_SYSTEM_ASSUMPTION,
      message: `${getAssetCharacterLabel(char.character)}에 쓸 장기 수익률 가정이 아직 없습니다. 지금은 성장 없이(0%) 계산되며, 이 자산의 기대수익률이 0%라는 뜻은 아닙니다. 「수익률 관리」에서 직접 지정할 수 있습니다.`
    };
  }
  return { appliedKey, character: char.character, characterLabel: getAssetCharacterLabel(char.character),
    status: RETURN_ASSUMPTION_STATUS.OK, message: '' };
}

/* =========================================================================
 * [Phase 47-F] "이 자산에 지금 어떤 기준이 적용되고 있는가"를 화면에 그대로 쓸 수 있는 형태로 요약한다.
 *
 * 왜 필요한가: 대표매칭키를 지정하고 확인할 수 있는 곳이 거래 등록 모달과 엑셀 대표매칭 칸뿐이라,
 * 거래내역을 쓰지 않는 자산(부동산·실물채권·원화현금·자산 추가로만 등록한 종목)은 사용자가 자기
 * 자산에 어떤 수익률 가정이 붙어 있는지 앱 안에서 확인할 방법이 아예 없었다. Phase 47-A로 지역 폴백이
 * 사라진 뒤에는 그런 자산이 성장 0%로 계산될 수 있는데, 그 사실조차 보이지 않았다.
 *
 * 판정은 하나도 새로 하지 않는다 - resolveAssetGroupKeyDetail(실제 계산이 쓰는 바로 그 함수)과
 * assessReturnAssumptionStatus의 결과를 그대로 옮겨 담기만 한다. 화면 전용 판정 로직을 따로 두면
 * "화면에는 KOSPI라고 나오는데 실제 계산은 다른 키"라는 불일치가 언젠가 반드시 생긴다.
 * ====================================================================== */
// source(판별 단계) -> 사용자에게 보여줄 "적용 방식". 사용자가 직접 만든 근거인지, 앱이 스스로
// 판단한 것인지만 구분한다 - 내부 단계 이름(presetTicker 등)을 그대로 노출하지 않는다.
const RATE_KEY_SOURCE_LABELS = Object.freeze({
  override: '사용자 지정',        // 자산에 직접 지정한 대표매칭키
  customKey: '사용자 지정',       // "수익률 관리"에 등록한 종목으로 매칭됨
  customKeyword: '사용자 지정',   // "수익률 관리"에 등록한 키워드로 매칭됨
  category: '자동 판별',
  presetTicker: '자동 판별',
  tickerAlias: '자동 판별',
  nameKeyword: '자동 판별',
  assetCharacter: '자동 판별'
});
// UNRESOLVED일 때 쓰는 문구는 assessReturnAssumptionStatus가 이미 갖고 있다(0% 계산 중이라는 사실과
// 해결 방법을 함께 말한다). 나머지 두 상태는 그 함수가 빈 문자열을 돌려주므로 여기서 채운다 -
// 사용자를 비난하거나 겁주지 않고, 지금 무슨 일이 일어나고 있는지만 사실대로 적는다.
const RATE_ASSUMPTION_DEFAULT_MESSAGES = Object.freeze({
  OK: '적합한 장기 수익률 가정을 사용하고 있습니다.',
  USER_DEFINED: '사용자가 지정한 수익률 기준을 사용하고 있습니다.'
});

// 반환: { keyLabel, appliedKey, sourceLabel, isUserSet, status, message, tone, resolved }
//   resolved=false면 적용된 가정이 없다는 뜻이다(성장 0%로 계산 중).
function describeAppliedReturnAssumption(asset) {
  const detail = resolveAssetGroupKeyDetail(asset);
  const assessed = assessReturnAssumptionStatus(asset);
  const resolved = detail.source !== 'unresolved';
  // [M3] 사용자가 「수익률 관리」에서 그 키의 숫자를 직접 넣어둔 경우도 "사용자 지정"이다.
  // 예전에는 키를 고른 경로(source)만 봤기 때문에, 원자재처럼 키가 카테고리에서 자동으로 붙는
  // 자산은 사용자가 값을 넣어도 "자동 판별"로 표시됐다 - 자기가 넣은 값인데 앱이 정한 것처럼 보였다.
  const isUserSet = RATE_KEY_SOURCE_LABELS[detail.source] === '사용자 지정'
    || assessed.status === RETURN_ASSUMPTION_STATUS.USER_DEFINED;
  // 문구는 assessed.message가 있으면 그것을 그대로 쓴다(UNRESOLVED/NEEDS_REVIEW - 더 구체적이다).
  // 비어 있을 때만 여기서 채우는데, 기준은 assessed.status가 아니라 "사용자가 지정한 것인가"다 -
  // status의 USER_DEFINED는 "customScenarioRates에 등록된 키"만 가리켜서, 사용자가 자산에
  // KOSDAQ 같은 시스템 키를 직접 지정한 경우를 놓친다(그때 status는 OK다). 그러면 화면에
  // "적용 방식: 사용자 지정"과 "적합한 가정을 사용 중"이 나란히 뜨는 앞뒤가 안 맞는 조합이 된다.
  const message = assessed.message
    || (isUserSet ? RATE_ASSUMPTION_DEFAULT_MESSAGES.USER_DEFINED : RATE_ASSUMPTION_DEFAULT_MESSAGES.OK);
  return {
    appliedKey: detail.key,
    // 사람이 읽는 이름은 "수익률 관리"가 쓰는 것과 같은 표를 그대로 쓴다(라벨을 새로 짓지 않는다).
    keyLabel: resolved ? getRateMatchKeyDisplayLabel(detail.key) : null,
    // [M3] isUserSet을 표시의 단일 기준으로 삼는다. 예전에는 라벨만 "키를 고른 경로"(source)에서
    // 따로 뽑아서, 사용자가 값을 직접 넣은 자산이 "적용 방식: 자동 판별 / 사용자가 지정한 값 사용 중"
    // 처럼 앞뒤가 안 맞게 보였다(47-F가 반대 방향으로 겪은 것과 같은 종류의 불일치다).
    sourceLabel: isUserSet ? '사용자 지정' : (RATE_KEY_SOURCE_LABELS[detail.source] || null),
    isUserSet,
    status: assessed.status,
    message,
    // 색은 보조 수단일 뿐이다 - 아래 UI는 아이콘과 문구로 먼저 구분하고 색을 덧붙인다(색만으로
    // 구분하면 색각 이상이나 흑백 환경에서 상태를 전혀 알 수 없다).
    // [M3] 가정이 없는 상태(NO_SYSTEM_ASSUMPTION)도 확인이 필요한 쪽이다 - 색은 보조일 뿐이고
    // 위 message와 아래 UI의 기호가 먼저 구분한다.
    tone: (!resolved || assessed.status === RETURN_ASSUMPTION_STATUS.NEEDS_REVIEW
      || assessed.status === RETURN_ASSUMPTION_STATUS.NO_SYSTEM_ASSUMPTION)
      ? 'weak' : (isUserSet ? 'user' : 'ok'),
    resolved
  };
}

function getCmaAnchorForKey(key) {
  for (const anchor of Object.keys(CMA_SOURCE_METADATA)) {
    if ((CMA_SOURCE_METADATA[anchor].appliesToKeys || []).includes(key)) return anchor;
  }
  return null;
}
// 이 key의 conservative/normal/optimistic 중 "지금 추천 배지를 보여줘도 되는" 필드만 골라 돌려준다.
//   - 앵커 자체가 없거나(커스텀 키) recommended가 없으면(legacy_approximation 포함) 빈 배열.
//   - 이미 이 버전을 [나중에]/[적용]으로 처리했으면(state.projection.cmaRecommendationStatus[anchor].
//     seenVersion >= recommended.version) 빈 배열 - 같은 추천을 계속 들이밀지 않는다.
//   - [필드 단위 override 보호 - PM 지시 10] customScenarioRates[key][preset]가 이미 존재하면(사용자가
//     그 필드를 직접 확정했다는 뜻 - getReferenceRate/저장 로직과 동일한 판단 기준) 그 필드는 절대
//     후보에 넣지 않는다. 판단은 항상 지금 커밋된 state를 직접 읽는다 - 아직 저장 전인 draft
//     (scenarioRateManagerDraft)를 참고하면 화면에서 만지작거리는 중인 임시값 때문에 배지가 잘못
//     깜빡일 수 있어 의도적으로 배제한다.
function getPendingCmaFields(key) {
  const anchor = getCmaAnchorForKey(key);
  if (!anchor) return { anchor: null, fields: [], recommended: null, meta: null };
  const meta = CMA_SOURCE_METADATA[anchor];
  const rec = meta && meta.recommended;
  if (!rec) return { anchor, fields: [], recommended: null, meta };
  const status = (state.projection.cmaRecommendationStatus || {})[anchor];
  const seenVersion = (status && num(status.seenVersion)) || 0;
  if (num(rec.version) <= seenVersion) return { anchor, fields: [], recommended: rec, meta };
  const existing = (state.projection.customScenarioRates || {})[key] || {};
  const fields = ['conservative', 'normal', 'optimistic'].filter((preset) =>
    rec[preset] !== undefined && existing[preset] === undefined);
  return { anchor, fields, recommended: rec, meta };
}

// 프리셋 표에 있는 티커(위 tickers 참고) 하나의 수익률을 정한다 - 사용자 정의 오버라이드(key=yahooTicker)가
// 있으면 그 값이 최우선이고, 없으면 프리셋 표 기본값을 그대로 쓴다.
function getPresetTickerRate(presetKey, yahooTicker) {
  const custom = getCustomRate(yahooTicker, presetKey);
  if (custom !== undefined) return custom;
  return SCENARIO_RATE_PRESETS[presetKey].tickers[yahooTicker];
}

// 지역별 대표지수(국내=KOSPI, 코스닥=KOSDAQ, 해외=S&P500) 수익률 하나 - 이 값도 'KOSPI'/'KOSDAQ'/
// 'S&P500' 키로 사용자 정의 오버라이드가 가능하다(참조표의 해당 행과 동일한 키를 공유하므로 자연스럽게
// 맞물린다). [코스닥 지수 - 버그 수정] SCENARIO_RATE_PRESETS.indexRates엔 domestic/foreign 두 값만
// 있어 코스닥 전용 시스템 기본값은 아직 없다 - 사용자 정의 오버라이드가 없으면 코스피와 같은 domestic
// 값을 시작점으로 쓴다(코스닥이 대체로 변동성/기대수익률이 더 높지만 별도 근거 수치를 새로 만들기보다
// 사용자가 "수익률 관리"에서 직접 조정하도록 한다).
function getEffectiveIndexRate(presetKey, region) {
  const key = region === 'foreign' ? 'S&P500' : (region === 'kosdaq' ? 'KOSDAQ' : 'KOSPI');
  const custom = getCustomRate(key, presetKey);
  if (custom !== undefined) return custom;
  if (region === 'kosdaq') return SCENARIO_RATE_PRESETS[presetKey].indexRates.domestic;
  return SCENARIO_RATE_PRESETS[presetKey].indexRates[region];
}

// [Phase 47-A] 성격 판정에 넘길 "자산 모양" 객체 - 경로 B(목표/배분 항목)가 경로 A(보유 자산)와
// 완전히 같은 입력으로 resolveAssetCharacter를 부르게 해 두 경로의 판정이 갈라지지 않게 한다.
function makeRateProbe(ticker, name, category, region) {
  const t = String(ticker ?? '');
  const n = String(name ?? '');
  return { ticker: t, name: n, category: category || classifyCategory(t, n), isDomestic: region || sanitizeTicker(t).isDomestic };
}

// 목표 항목(티커 지정 또는 자산군 캐치올) 하나가 특정 프리셋·지역에서 쓸 예상 수익률을 정한다.
//   1. 사용자 정의 오버라이드: 종목코드/티커/이름 중 하나라도 등록돼 있으면 최우선 적용(findCustomRateKeyForAsset).
//   2. 시스템 기본 매핑: SCENARIO_RATE_PRESETS[presetKey].tickers에 전용 매핑이 있으면 그 값(삼성전자/
//      대표 ETF/미국 대형주), 없으면 지역별 대표지수(국내=KOSPI, 해외=S&P500)로 대체(fallback)한다.
//   3. 자산군 캐치올: 채권(국채)은 categories.채권(역시 'BOND' 키로 오버라이드 가능), 현금은 항상 0%,
//      그 외(주식 등)는 지역별 대표지수를 그대로 쓴다 - region 인자로 국내/해외 중 어느 소속인지 판단한다.
// [Phase 28-F - 대표매칭키 전달 계층 통합] 목표비중 target은 목표비중 모달이 만든 {type,ticker,label,pct,role}
// 뿐이라 보유 자산의 rateMatchOverride(엑셀 "대표매칭(수익률연동키)")를 갖고 있지 않다. 그래서 결정론
// 일반계좌 예측과 Monte Carlo(둘 다 이 함수를 쓴다)는 사용자가 자산에 지정한 대표매칭키를 전혀 못 보고
// 키워드/지역 추론으로만 해석했다(경로 B) - 절세계좌/현재구성(경로 A, getProjectionAssetGroupKey)과 같은
// 자산이 다른 값을 내는 원인. 이 helper는 target에 대응하는 보유 자산을 "지금 state"에서 동적으로 찾아
// 그 override를 돌려준다. 특정 키 이름을 코드에 적지 않으므로 사용자가 수익률 관리 기준에 어떤 키를
// 추가/수정/삭제하든 코드 수정 없이 그대로 따라간다.
//   - ticker형: 정규화 티커(sanitizeTicker.yahooTicker)가 같은 보유 자산
//   - namedHolding형: 티커 없는 보유 자산 중 정규화 이름(normalizeNameKey)이 같은 것
//   - target.owner가 있으면 그 소유자의 자산을 우선한다(두 소유자가 같은 종목에 다른 키를 지정한 경우 대비).
//   - category형(캐치올)은 특정 자산에 대응하지 않으므로 override 개념이 없다 -> null.
function findRateMatchOverrideForTarget(target) {
  if (!target) return null;
  if (target.rateMatchOverride) return String(target.rateMatchOverride).trim() || null;
  const assets = state.assets || [];
  let matcher = null;
  if (target.type === 'ticker') {
    const want = sanitizeTicker(target.ticker).yahooTicker;
    if (!want) return null;
    matcher = (a) => sanitizeTicker(a.ticker).yahooTicker === want;
  } else if (target.type === 'namedHolding') {
    const want = normalizeNameKey(target.name || target.label);
    if (!want) return null;
    matcher = (a) => !String(a.ticker ?? '').trim() && normalizeNameKey(a.name) === want;
  } else {
    return null;
  }
  const candidates = assets.filter((a) => a.rateMatchOverride && matcher(a));
  if (candidates.length === 0) return null;
  const preferred = target.owner ? candidates.find((a) => a.owner === target.owner) : null;
  return String((preferred || candidates[0]).rateMatchOverride).trim() || null;
}
function getTargetProjectionRate(target, presetKey, region) {
  const preset = SCENARIO_RATE_PRESETS[presetKey];
  // [Phase 28-F] 0순위: 사용자가 자산에 명시한 대표매칭키. 경로 A와 완전히 같은 resolver를 태워
  // (customScenarioRates -> BOND/CASH 기존 정책 -> 시스템 프리셋 -> 지역 폴백) 두 경로의 의미를 통일한다.
  const overrideKey = findRateMatchOverrideForTarget(target);
  if (overrideKey) return resolveProjectionRateForKey(overrideKey, presetKey, region === '해외');
  if (target.type === 'ticker') {
    const customKey = findCustomRateKeyForAsset(target.ticker, target.label);
    if (customKey) {
      const custom = getCustomRate(customKey, presetKey);
      if (custom !== undefined) return custom;
    }
    const keywordKey = getCustomKeywordRateKey(target.label);
    if (keywordKey) {
      const custom = getCustomRate(keywordKey, presetKey);
      if (custom !== undefined) return custom;
    }
    const yahoo = sanitizeTicker(target.ticker).yahooTicker;
    if (preset.tickers[yahoo] !== undefined) return getPresetTickerRate(presetKey, yahoo);
    if (TICKER_RATE_KEY_ALIAS[yahoo]) return getPresetTickerRate(presetKey, TICKER_RATE_KEY_ALIAS[yahoo]); // 실제 QQQM/SPYM 티커 보유
    // [절세계좌 국내상장 해외지수 ETF] KODEX 미국S&P500/TIGER 미국나스닥100/SOL 미국배당다우존스 등
    // 이름 키워드로 실제 추종 지수의 대표 수익률에 매핑한다(getProjectionAssetGroupKey와 동일 규칙).
    const nameKey = getNameKeywordRateKey(target.label);
    if (nameKey) return getPresetTickerRate(presetKey, nameKey);
    // [Phase 47-A] 경로 A(resolveAssetGroupKeyDetail)와 완전히 같은 규칙으로 성격을 물어본다 -
    // 지역 폴백은 여기서도 제거됐다. 목표 항목에는 category가 없을 수 있어 자산 등록과 동일한
    // classifyCategory로 채워 넣어, 같은 상품이 두 경로에서 다른 성격으로 읽히지 않게 한다.
    const tickerCharKey = resolveRateKeyFromAssetCharacter(makeRateProbe(target.ticker, target.label, target.category, region));
    return resolveProjectionRateForKey(tickerCharKey || UNRESOLVED_RATE_KEY, presetKey, region === '해외');
  }
  // [namedHolding 기대수익률 버그 수정 - 요청 반영] 티커 없는 보유 자산을 이름으로 지정한 목표
  // (searchRtmAddCandidates의 이름 검색 결과, js/04)는 target.category가 아예 없어서, 예전엔 바로
  // 아래 "category형 목표" 분기로 떨어져 target.name을 전혀 보지 않고 지역 대표지수(KOSPI/S&P500)를
  // 적용했다 - "국채"/"현금"/"달러"처럼 이름만 봐도 명백한 자산도 마치 개별 주식인 것처럼 6~9%로
  // 부풀려진 원인이다. type==='ticker'와 동일하게 사용자 정의 오버라이드(종목명 매칭)·키워드 매칭을
  // 먼저 시도하고("수익률 관리"에 국채/현금/달러 키워드로 BOND/CASH/CASH.USD를 등록해뒀다면 그 값을
  // 그대로 따른다), 등록된 게 하나도 없으면 자산 등록 시 자동판별과 동일한 규칙(BOND_KEYWORDS/
  // CASH_KEYWORDS, js/01 classifyCategory)으로 이름만 보고 채권/현금 여부를 추론해 최소한 지역
  // 지수보다는 훨씬 현실적인 값(채권 프리셋 수익률 / 현금 0%)으로 대체한다.
  if (target.type === 'namedHolding') {
    const customKey = findCustomRateKeyForAsset('', target.name);
    if (customKey) {
      const custom = getCustomRate(customKey, presetKey);
      if (custom !== undefined) return custom;
    }
    const keywordKey = getCustomKeywordRateKey(target.name);
    if (keywordKey) {
      const custom = getCustomRate(keywordKey, presetKey);
      if (custom !== undefined) return custom;
    }
    const inferredCategory = classifyCategory('', target.name);
    if (inferredCategory === '현금') return 0;
    if (inferredCategory === '채권') {
      const custom = getCustomRate('BOND', presetKey);
      return custom !== undefined ? custom : preset.categories['채권'];
    }
    // [Phase 47-A] 이름만 있는 보유 항목도 지역 폴백 대신 성격 판정을 따른다.
    const namedCharKey = resolveRateKeyFromAssetCharacter(makeRateProbe('', target.name, inferredCategory, region));
    return resolveProjectionRateForKey(namedCharKey || UNRESOLVED_RATE_KEY, presetKey, region === '해외');
  }
  const groupKey = getProjectionGroupKey(target.category);
  if (groupKey === '현금') return 0;
  if (groupKey === '채권') {
    const custom = getCustomRate('BOND', presetKey);
    return custom !== undefined ? custom : preset.categories['채권'];
  }
  // [Phase 47-A] 자산군 캐치올 목표('주식' 등)는 특정 상품을 가리키지 않는다 - 그 안에 무엇이 들어올지
  // 모르는 상태에서 지역 대표지수를 붙이면 "국내 주식 캐치올"과 "국내 채권 ETF"가 같은 값을 받는다.
  // 캐치올이 주식형으로 명시된 경우에만 해당 지역 대표지수를 쓰고, 그 외에는 가정을 적용하지 않는다.
  if (groupKey === '주식형자산') {
    return region === '해외' ? getEffectiveIndexRate(presetKey, 'foreign') : getEffectiveIndexRate(presetKey, 'domestic');
  }
  return 0;
}

// [시나리오별 적용 수익률 요약 표] 화면에 나열할 시스템 기본 참조 상품 목록 - SCENARIO_RATE_PRESETS.
// tickers에 있는 종목 전부 + 지역별 대표지수(KOSPI)/국채(BOND) 2개를 합친 것이다. 'S&P500'이 대표 ETF(SPYM
// 실제 보유 시에도 TICKER_RATE_KEY_ALIAS로 매칭됨)이자 동시에 "S&P500 대표지수"(indexRates.foreign)도
// 겸하므로 행을 따로 두지 않고 하나로 합쳐 보여준다.
// [부동산 복원 - 버그 수정] 한때 부동산을 미래예측/포트폴리오 구성 계산 전체에서 뺐을 때 이 목록에서도
// 함께 지웠으나, 이후 "시나리오별 총자산" 카드가 부동산을 다시 계산에 포함시키면서(updateProjection
// 참고) 정작 그 수익률을 사용자가 조정할 UI가 없는 상태로 남아있었다 - 여기 다시 등록해 다른 상품과
// 동일하게 "수익률 관리"에서 조정 가능하게 한다(getReferenceRate('부동산', ...)가 이미 오버라이드를
// 지원하므로 이 목록에만 추가하면 저장/초기화/표시 로직은 자동으로 따라온다).
const SCENARIO_RATE_BASE_ROWS = [
  { key: 'BOND', label: '국채/채권형' },
  { key: '부동산', label: '부동산' },
  { key: 'KOSPI', label: 'KOSPI (국내 대표지수)' },
  { key: 'KOSDAQ', label: 'KOSDAQ (코스닥 대표지수)' },
  { key: '005930.KS', label: '삼성전자' },
  { key: 'S&P500', label: 'S&P500 (SPYM)' },
  { key: 'SCHD', label: 'SCHD' },
  { key: 'NASDAQ', label: 'NASDAQ 100 (QQQM)' },
  // [Phase 41-B] 사용자에게는 내부 키가 아니라 이해 가능한 이름으로 보여준다.
  { key: 'DEV_EX_US', label: '선진국(미국 제외) 주식' },
  { key: 'EMERGING', label: '신흥국 주식' },
  { key: 'MSFT', label: 'Microsoft' },
  { key: 'GOOGL', label: 'Alphabet' },
  { key: 'AAPL', label: 'Apple' },
  { key: 'AMZN', label: 'Amazon' },
  { key: 'META', label: 'Meta' },
  { key: 'NVDA', label: 'Nvidia' }
];
// [동적 필터링 - 요청 반영] 화면에 표시할 행 = ① "지금 실제 포트폴리오에서 쓰이는 키"(getActiveScenarioRateKeys,
// 일반계좌+절세계좌 보유 종목·목표 비중·월적립금/절세계좌 적립 배분을 전부 포함)만 남긴 시스템 기본
// 행 + ② 사용자가 등록한 모든 오버라이드(customScenarioRates - "수익률 관리" 모달의 [+신규 종목 추가]나
// 엑셀 "수익률 관리 기준" 두 번째 시트로 등록한 것 전부). 예전엔 SCENARIO_RATE_BASE_ROWS 12개를 항상
// 전부 보여줬으나, 보유/매칭과 무관한 상품까지 나열해 어떤 게 실제로 계산에 쓰이는지 알기 어려웠다 -
// 시스템 기본 목록만 실제 매칭 여부로 거르고, 사용자가 명시적으로 등록한 종목(엑셀 두 번째 시트 포함)은
// 아직 보유/배분 전이라도 계속 보이게 해서 미리 수익률을 설정해 둘 수 있게 한다(요청 반영).
// [수익률 관리 팝업 - 버그 수정] getActiveScenarioRateKeys()가 활성 키로 잡았는데도 SCENARIO_RATE_BASE_
// ROWS에도 customScenarioRates에도 없는 "고아 키"(예: 엑셀 대표매칭 칸에 오타/잘못된 값을 입력했거나,
// 아직 수익률을 등록하지 않은 신규 커스텀 키)에 표시할 이름을 찾는다 - 보유 자산 → 리밸런싱 목표 →
// 월적립금/절세계좌 배분 순으로 실제 그 키를 쓰고 있는 항목을 찾아 이름을 쓰고, 못 찾으면 키 자체를
// 이름으로 쓴다(그래도 최소한 화면에 나타나 사용자가 알아채고 고칠 수 있다).
function findLabelForRateKey(key) {
  const asset = state.assets.find((a) => a.category !== '부동산' && getProjectionAssetGroupKey(a) === key);
  if (asset) return asset.name;
  for (const owner of REBALANCE_OWNERS) {
    for (const region of ['국내', '해외']) {
      const target = expandRebalanceTargetsForComputation(owner, region)
        .find((t) => t.type === 'ticker' && resolveTickerToRateKey(t.ticker, t.label) === key);
      if (target) return target.label;
    }
  }
  const contrib = (state.projection.monthlyContributionAllocation || [])
    .find((it) => resolveTickerToRateKey(it.ticker, it.label) === key);
  if (contrib) return contrib.label;
  for (const owner of REBALANCE_OWNERS) {
    const byOwnerAlloc = ((state.projection.monthlyContributionByOwner[owner] || {}).allocation || [])
      .find((it) => resolveTickerToRateKey(it.ticker, it.label) === key);
    if (byOwnerAlloc) return byOwnerAlloc.label;
  }
  for (const owner of TAX_ADVANTAGED_OWNERS) {
    const alloc = (state.projection.taxAdvantagedPlan.allocationByOwner[owner] || [])
      .find((it) => resolveTickerToRateKey(it.ticker, it.label) === key);
    if (alloc) return alloc.label;
  }
  return key;
}

/* -------------------------------------------------------------------------
 * [Phase 30] 거래 입력 화면의 대표매칭키 추천 - 새 판단을 만들지 않는다.
 *    이 앱은 원래도 대표매칭키를 비워두면 계산 시점에 자동판별(resolveAssetGroupKeyDetail)한다.
 *    Phase 30이 하는 일은 그 "보이지 않던 자동판별 결과"를 입력 시점에 미리 보여주고, 사용자가
 *    확인하면 그때서야 명시적 override로 굳히는 것뿐이다. 종목명/브랜드/가격/수익률/역할을 보고
 *    임의로 분류하거나 추정하는 로직은 일절 넣지 않는다.
 * ---------------------------------------------------------------------- */
// "이 종목이라서 이 키"라고 말할 수 있는 근거가 있는 단계만 추천한다.
//   - customKey/customKeyword: 사용자가 "수익률 관리"에 직접 등록한 종목/키워드에 걸린 경우
//   - presetTicker/tickerAlias: 시스템 기본 상품표의 티커에 정확히 걸린 경우
//   - nameKeyword: 국내상장 해외지수 ETF 이름 규칙(NAME_KEYWORD_RATE_MAP)에 걸린 경우
// 제외하는 단계:
//   - unresolved: 성격조차 확인되지 않아 어떤 가정도 적용하지 않은 것([Phase 47-A]에서 regionFallback을
//     대체했다) - 추천할 것이 없으므로 당연히 제외한다
//   - assetCharacter: 성격으로부터 유도된 것은 맞지만 "이 종목이라서 이 키"는 아니다 - 자동 계산에는
//     쓰되(그래야 국고채 ETF가 채권 기준을 받는다) 사용자에게 확정값으로 고정하라고 권하지는 않는다
//   - category: '채권'/'현금' 같은 자산군 캐치올 - 종목 단위 근거가 아니고, 비워둬도 자동판별이 정확히
//     같은 값을 쓰므로 굳이 확정값으로 고정할 이유가 없다(고정하면 나중에 정책이 바뀌어도 안 따라간다)
const RATE_MATCH_RECOMMENDABLE_SOURCES = ['customKey', 'customKeyword', 'presetTicker', 'tickerAlias', 'nameKeyword'];
// input: { ticker, name, currency } - 거래 입력 폼이 지금 들고 있는 값 그대로.
// 반환: { key, source, label } 또는 null(추천 없음 - 실패가 아니라 안전한 정상 상태다).
function recommendRateMatchKey(input) {
  const ticker = String((input && input.ticker) ?? '').trim();
  const name = String((input && input.name) ?? '').trim();
  if (!ticker && !name) return null;
  // 실제로 저장될 자산과 완전히 같은 방식으로 만든다(카테고리/국내해외 자동판별 포함) - makeAsset을
  // 그대로 재사용하므로 "추천값"과 "저장 후 실제로 쓰이는 값"이 어긋날 수 없다.
  const probe = makeAsset({ ticker, name, currency: input && input.currency });
  const detail = resolveAssetGroupKeyDetail(probe);
  if (!RATE_MATCH_RECOMMENDABLE_SOURCES.includes(detail.source)) return null;
  return { key: detail.key, source: detail.source, label: getRateMatchKeyDisplayLabel(detail.key) };
}
// 추천 문구에 쓸 사람이 읽는 이름 - 시스템 기본 상품표와 사용자 등록(customScenarioRates)에 이미
// 있는 라벨만 쓴다. 둘 다 없으면 키를 그대로 보여준다(설명을 새로 지어내지 않는다).
function getRateMatchKeyDisplayLabel(key) {
  const baseRow = SCENARIO_RATE_BASE_ROWS.find((r) => r.key === key);
  if (baseRow) return baseRow.label;
  const custom = (state.projection.customScenarioRates || {})[key];
  if (custom && custom.label) return custom.label;
  return key;
}

function getScenarioRateDisplayRows() {
  const activeKeys = getActiveScenarioRateKeys();
  const rows = SCENARIO_RATE_BASE_ROWS.filter((r) => activeKeys.has(r.key));
  const shownKeys = new Set(rows.map((r) => r.key));
  const customRates = state.projection.customScenarioRates || {};
  Object.keys(customRates).forEach((key) => {
    if (shownKeys.has(key)) return;
    rows.push({ key, label: customRates[key].label || key, custom: true });
    shownKeys.add(key);
  });
  // [고아 키 노출 - 버그 수정] 실제 계산에는 이미 쓰이고 있는데(resolveProjectionRateForKey가 조용히
  // 지역 대표지수로 대체) 화면엔 전혀 안 보여 사용자가 존재조차 모른 채 방치되던 항목들을 마지막으로
  // 채워 넣는다 - "일부 종목만 필터링되어 숨겨진다"는 신고의 직접적인 원인이었다.
  activeKeys.forEach((key) => {
    if (shownKeys.has(key)) return;
    rows.push({ key, label: findLabelForRateKey(key), custom: true, orphan: true });
    shownKeys.add(key);
  });
  return rows;
}
// BOND/KOSPI는 SCENARIO_RATE_PRESETS[x].tickers가 아니라 categories/indexRates에 있으므로 별도로 조회하고,
// 그 외 모든 키는 사용자 정의 오버라이드를 먼저 확인한 뒤 프리셋 표 기본값으로 대체(fallback)한다.
function getReferenceRate(presetKey, key) {
  const custom = getCustomRate(key, presetKey);
  if (custom !== undefined) return custom;
  return getSystemDefaultRate(presetKey, key);
}
// 사용자 정의 오버라이드를 무시하고 시스템 기본 매핑값만 조회한다 - [수익률 관리] 모달의 [기본값으로
// 초기화]와, 저장 시 "사용자가 실제로 기본값과 다르게 고쳤는지" 판별하는 데 쓰인다.
function getSystemDefaultRate(presetKey, key) {
  const preset = SCENARIO_RATE_PRESETS[presetKey];
  if (key === 'BOND') return preset.categories['채권'];
  if (key === '부동산') return preset.categories['부동산'];
  if (key === 'KOSPI') return preset.indexRates.domestic;
  if (key === 'KOSDAQ') return preset.indexRates.domestic;
  // [Phase 45 버그 수정] CASH/CASH.USD는 아래 어느 분기에도 걸리지 않아 마지막 지역 폴백까지 흘러내렸고,
  // 그 결과 "현금의 시스템 기본 가정"을 물으면 미국 주식 지수 값(S&P500)이 돌아왔다. 앱이 실제 계산에
  // 쓰는 현금의 정의는 0%다(resolveProjectionRateForKey / getTargetProjectionRate 모두 동일) - 여기서도
  // 같은 정의를 돌려줘 표시값과 계산값이 어긋나지 않게 한다. 새 수익률을 만드는 것이 아니라 이미
  // 확정된 정의를 한 곳 더 적용하는 것이며, 사용자가 CASH에 값을 등록했다면 getReferenceRate가
  // customScenarioRates를 먼저 보므로 그 값이 그대로 우선한다.
  if (key === 'CASH' || key === 'CASH.USD') return 0;
  // [Phase 47-A §4] 삼성전자 = KOSPI 앵커 상속(전용 시스템 수익률 8/9/15 폐지). resolveProjectionRateForKey와
  // 같은 규칙이라 "수익률 관리"에 보이는 시스템 참고값과 실제 계산값이 항상 일치한다.
  if (key === '005930.KS') return preset.indexRates.domestic;
  if (preset.tickers[key] !== undefined) return preset.tickers[key];
  // [Phase 47-A §3 - 지역 대체 폐지] 여기까지 안 걸리는 키(엑셀 대표매칭 칸에 시스템이 모르는 값을 넣었거나,
  // 아직 customScenarioRates에도 등록되지 않은 커스텀 키 - 대표적으로 'BOND.STOCK')는 시스템 기본 가정이
  // "없다". 예전엔 지역별 대표지수로 대체해 "최소한 그럴듯한 값"을 보여줬지만, 그 결과 채권혼합 상품용
  // 키에 미국 주식 값(4.1/5.1/6.0)이 참고값으로 표시됐다 - 그럴듯한 값이 없는 것보다 나쁘다.
  // 이제 계산 경로(resolveProjectionRateForKey)와 동일하게 0(가정 없음)을 돌려준다.
  return 0;
}
// [티커 → 대표 수익률 키] getTargetProjectionRate/getProjectionAssetGroupKey의 "티커 판별" 부분과 동일한
// 규칙(사용자 정의 오버라이드 → 시스템 티커 매핑 → 이름 키워드 매핑 → 지역별 대표지수 폴백)을
// target/allocation 항목(자산 객체가 아니라 {ticker,label} 모양)에도 그대로 적용한다 - "수익률 관리"
// 동적 목록(getActiveScenarioRateKeys)에서 여러 출처(목표 비중, 월적립금 배분, 절세계좌 배분)에 반복
// 필요해 공용 함수로 뽑았다.
function resolveTickerToRateKey(ticker, label) {
  const customKey = findCustomRateKeyForAsset(ticker, label);
  if (customKey) return customKey;
  const keywordKey = getCustomKeywordRateKey(label);
  if (keywordKey) return keywordKey;
  const sanitized = sanitizeTicker(ticker);
  if (SCENARIO_RATE_PRESETS.normal.tickers[sanitized.yahooTicker] !== undefined) return sanitized.yahooTicker;
  if (TICKER_RATE_KEY_ALIAS[sanitized.yahooTicker]) return TICKER_RATE_KEY_ALIAS[sanitized.yahooTicker];
  const nameKey = getNameKeywordRateKey(label);
  if (nameKey) return nameKey;
  // [Phase 47-A] 계산 경로와 같은 규칙을 쓴다 - 여기만 지역 폴백을 남겨두면 "수익률 관리" 목록에는
  // KOSPI 행이 보이는데 실제 계산은 가정 없음(0%)이 되어 화면과 계산이 다른 말을 하게 된다.
  return resolveRateKeyFromAssetCharacter(makeRateProbe(ticker, label, null, sanitized.isDomestic)) || UNRESOLVED_RATE_KEY;
}
// [수익률 관리 팝업 동적 필터링 - 요청 반영] "수익률 관리"에 나열할 상품을 하드코딩된 시스템 기본
// 목록 그대로가 아니라, 지금 실제 포트폴리오에서 대표 수익률로 매칭·지정된 것만 모아 반환한다
// (getScenarioRateDisplayRows가 이 결과로 필터링한다). 네 가지 출처를 모두 합친다(union):
//  ① "포트폴리오 구성" 목표 비중에 실제 배분(pct>0)된 항목 - '주식' 캐치올 내 [보유 주식 종목 선택]
//     세부 종목까지 놓치지 않도록 expandRebalanceTargetsForComputation으로 펼쳐서 본다(요청 반영 -
//     예전엔 raw targets만 봐서 캐치올 안의 개별 지정 종목이 빠졌었다).
//  ② 지금 실제로 보유 중인 모든 자산 - 일반계좌 + 절세계좌(ISA/IRP/연금저축) 둘 다 포함한다(요청 반영 -
//     예전엔 일반계좌만 봤다). 부동산은 개별 종목 매칭이 아니라 전용 '부동산' 키로 취급한다.
//  ③ [월적립금 설정](일반계좌) 배분 종목 - 아직 보유 비중이 작거나 신규 적립 예정인 종목도 포함한다.
//  ④ [적립설정](절세계좌) 계좌별·종목별 배분 종목.
function getActiveScenarioRateKeys() {
  const active = new Set();
  REBALANCE_OWNERS.forEach((owner) => {
    ['국내', '해외'].forEach((region) => {
      expandRebalanceTargetsForComputation(owner, region).filter((t) => num(t.pct) > 0).forEach((t) => {
        if (t.type === 'ticker') { active.add(resolveTickerToRateKey(t.ticker, t.label)); return; }
        const groupKey = getProjectionGroupKey(t.category);
        if (groupKey === '현금') return;
        active.add(groupKey === '채권' ? 'BOND' : (region === '해외' ? 'S&P500' : 'KOSPI'));
      });
    });
  });
  state.assets.forEach((a) => {
    // [버그 수정 - 절세계좌 제외 삭제] 예전엔 일반계좌만 봤으나(getProjectionGroupStats와 동일 필터),
    // 절세계좌 보유 종목도 이제 대표 매칭 수익률로 독립 복리 계산되므로(simulateTaxAdvantagedOwnerGrowth)
    // 여기서도 함께 봐야 "수익률 관리"가 절세계좌 보유 종목까지 놓치지 않는다.
    if (a.category === '부동산') { active.add('부동산'); return; }
    const key = getProjectionAssetGroupKey(a); // '채권'|'현금'|'KOSPI'|yahooTicker|'NAME:...'|커스텀 카테고리명
    if (key === '현금') return;
    // [Phase 47-A] 'UNRESOLVED'는 실제 Key가 아니라 "적용할 가정이 없다"는 상태다 - 목록에 넣으면
    // 사용자가 거기에 값을 등록할 수 있게 되고, 그 값이 성격이 전혀 다른 모든 미확인 자산에
    // 한꺼번에 적용된다. 상태를 Key처럼 다루지 않는다.
    if (key === UNRESOLVED_RATE_KEY) return;
    active.add(key === '채권' ? 'BOND' : key);
  });
  // ③ [월적립금 설정](일반계좌) 배분 종목 - 소유자별 독립 배분(신규) + 하위호환 단일 배분 둘 다 본다.
  (state.projection.monthlyContributionAllocation || []).filter((it) => num(it.pct) > 0).forEach((it) => {
    active.add(resolveTickerToRateKey(it.ticker, it.label));
  });
  REBALANCE_OWNERS.forEach((owner) => {
    ((state.projection.monthlyContributionByOwner[owner] || {}).allocation || []).filter((it) => num(it.pct) > 0).forEach((it) => {
      active.add(resolveTickerToRateKey(it.ticker, it.label));
    });
  });
  // ④ [적립설정](절세계좌) 계좌별·종목별 배분 종목.
  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    (state.projection.taxAdvantagedPlan.allocationByOwner[owner] || []).filter((it) => num(it.pct) > 0).forEach((it) => {
      active.add(resolveTickerToRateKey(it.ticker, it.label));
    });
  });
  return active;
}
// 방금 다시 그린 표 기준으로 펼침 상태를 재적용한다 - 표 내용(활성 상품 등)이 바뀌어도 max-height가
// 새 높이에 맞게 갱신되고, 접힌 상태였다면 계속 접힌 채로 유지된다(다른 아코디언들과 동일한 이유).
function reapplyDetailCardAccordionHeight(key, btnId, bodyId) {
  const btn = document.getElementById(btnId);
  const body = document.getElementById(bodyId);
  if (btn && body) setAccordionOpen(body, btn.querySelector('.detail-card-accordion-chevron'), detailCardAccordionOpen[key]);
}

/* -------------------------------------------------------------------------
 * 10-3-3. [편집 UI 제거] 예전엔 카드1/카드2 각각 [›] 버튼을 탭하면 수익률/적립금을 수동으로 고칠 수
 *    있는 팝업(scenarioModal1/scenarioModal2)이 열렸다 - 그 팝업과 여는 버튼은 완전히 제거했다. 월
 *    적립금 입력은 이후 [월적립금 설정] 팝업 안으로 옮겨갔다(monthlyContributionTotalInput 리스너
 *    참고, 10-3-2-1). 아래 두 카드 자체는 순수 읽기 전용이며, 세부 표는 detailCardAccordionOpen
 *    아코디언으로 접고 편다 - [수익률 관리] 버튼(scenarioRateManagerModal)만 별도로 열어야 종목별
 *    보수/일반/긍정 수익률을 직접 등록·수정할 수 있다(카드 자체에 인라인 편집 UI는 없음).
 * ---------------------------------------------------------------------- */
// [절세계좌 카드 아코디언 - 요청 반영] taxHusband/taxWife는 "절세계좌 현황" 카드 하단의 신랑/와이프
// 세부 현황 아코디언 상태다(renderTaxAdvantagedCard 참고) - 다른 키들과 같은 객체에 두면
// resetAllAccordionsOnTabSwitch(js/03)의 범용 순회가 자동으로 이 두 개도 초기화해준다(키를 따로
// 나열할 필요 없음).
let detailCardAccordionOpen = { generalSchedule: false, totalSchedule: false, taxHusband: false, taxWife: false, assumptions: false, scenarioSection: false };
function toggleDetailCardAccordion(key, btnId, bodyId) {
  detailCardAccordionOpen[key] = !detailCardAccordionOpen[key];
  const btn = document.getElementById(btnId);
  const body = document.getElementById(bodyId);
  setAccordionOpen(body, btn.querySelector('.detail-card-accordion-chevron'), detailCardAccordionOpen[key]);
  const label = btn.querySelector('.detail-card-accordion-label');
  if (label) label.textContent = detailCardAccordionOpen[key] ? '접기' : '세부 항목 보기';
}
// [드롭다운 요청 → 아코디언으로 확정] "시나리오별 일반계좌/총자산 금액 비교" 카드는 평소엔 표를 접어
// 숨겨두고, 버튼을 눌렀을 때만 펼치는 아코디언으로 구현했다(사용자 확인 - 드롭다운 필터가 아니라
// 접기/펼치기 토글을 원함) - 위 두 카드와 완전히 동일한 setAccordionOpen/detailCardAccordionOpen 패턴.
document.getElementById('scenarioCompareScheduleAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('generalSchedule', 'scenarioCompareScheduleAccordionBtn', 'scenarioCompareScheduleAccordionBody'));
// [Phase 24-B STEP 4] Scenario 전체를 감싸는 바깥 아코디언 - 기존 패턴(setAccordionOpen/
// detailCardAccordionOpen) 그대로 재사용, 새 토글 메커니즘을 만들지 않았다.
document.getElementById('scenarioSectionAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('scenarioSection', 'scenarioSectionAccordionBtn', 'scenarioSectionAccordionBody'));

// [Phase 24-B STEP 5 - 일반계좌/전체 자산 관점 전환] Assets 관점전환 세그먼트 컨트롤과 동일한 시각
// 패턴(active/idle 클래스 토글)을 재사용한다 - 계산은 항상 둘 다 실행되고, 여기서는 어느 쪽을 보여줄지만
// 정한다.
let scenarioViewMode = 'general';
const SCENARIO_VIEW_BTN_IDLE_CLASSES = ['border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400'];
const SCENARIO_VIEW_BTN_ACTIVE_CLASSES = ['border-brand-600', 'dark:border-brand-400', 'bg-brand-50', 'dark:bg-brand-950', 'text-brand-700', 'dark:text-brand-200'];
function applyScenarioViewMode() {
  document.getElementById('scenarioGeneralView').classList.toggle('hidden', scenarioViewMode !== 'general');
  document.getElementById('scenarioTotalView').classList.toggle('hidden', scenarioViewMode !== 'total');
  document.querySelectorAll('#scenarioViewToggle .scenario-view-btn').forEach((btn) => {
    const active = btn.dataset.view === scenarioViewMode;
    btn.classList.remove(...SCENARIO_VIEW_BTN_IDLE_CLASSES, ...SCENARIO_VIEW_BTN_ACTIVE_CLASSES);
    btn.classList.add(...(active ? SCENARIO_VIEW_BTN_ACTIVE_CLASSES : SCENARIO_VIEW_BTN_IDLE_CLASSES));
  });
  reapplyDetailCardAccordionHeight('scenarioSection', 'scenarioSectionAccordionBtn', 'scenarioSectionAccordionBody');
}
document.getElementById('scenarioViewToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.scenario-view-btn');
  if (!btn) return;
  scenarioViewMode = btn.dataset.view;
  applyScenarioViewMode();
});
// updateProjection()이 매 렌더마다 호출해 "총자산 관점이 일반계좌와 다른 숫자를 낼 때만" 토글 자체를
// 보여준다(hasDistinctTotalAssetScenario, 위 정의) - 조건이 없으면(신규 사용자 다수) 토글을 숨기고
// 일반계좌 관점만 보여줘 중복 카드를 없앤다(계산은 계속 실행됨, 표시만 다름).
function updateScenarioViewToggleVisibility() {
  const distinct = hasDistinctTotalAssetScenario();
  document.getElementById('scenarioViewToggle').classList.toggle('hidden', !distinct);
  if (!distinct && scenarioViewMode !== 'general') { scenarioViewMode = 'general'; }
  applyScenarioViewMode();
}
document.getElementById('totalAssetCompareScheduleAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('totalSchedule', 'totalAssetCompareScheduleAccordionBtn', 'totalAssetCompareScheduleAccordionBody'));
document.getElementById('projectionAssumptionsAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('assumptions', 'projectionAssumptionsAccordionBtn', 'projectionAssumptionsAccordionBody'));

// [P2 - Phase 9 감사 후속] years(null=제한없음/0=신규납입없음/숫자=사용자가 설정한 적립기간)를
// 초보자가 이해할 수 있는 문장으로 바꾼다 - js/01 normalizeMonthlyContributionByOwnerEntry의 규약을
// 그대로 반영한 표시 전용 함수(계산 없음).
function formatContributionYearsForDisplay(years) {
  if (years === null || years === undefined) return '제한 없음';
  if (years === 0) return '0년(신규 납입 없음)';
  return `${years}년`;
}

// [초보자용 핵심 요약 카드] "① 현재 자산 ② 앞으로 넣을 돈 ③ 예상 미래자산 ④ 어떤 가정을 썼는지"를
// 새 계산 없이 이미 계산된 값만 읽어 조합한다 - presetResults.normal은 updateProjection()이 이미
// simulateRebalancedPreset('normal', 20)으로 계산해둔 것을 그대로 받는다(이 함수 자신은 계산을 하지
// 않고 표시만 담당 - "숫자와 설명을 분리"하되, 기존 코드 구조상 과도한 리팩터링은 하지 않는다).
function renderProjectionHeroSummary(presetResults, milestoneOffsets) {
  const container = document.getElementById('projectionHeroSummary');
  if (!container) return;
  const points = presetResults.normal.yearlyPoints;
  const years = milestoneOffsets[milestoneOffsets.length - 1]; // 20(고정, getMilestoneYearOffsets 참고)
  const currentTotal = points[0].total;
  const futureTotal = points[years].total;
  // [기존 값 재사용] "월적립금 설정" 배지(updateMonthlyContributionSummary)와 정확히 같은 계산(js/19
  // getHouseholdMonthlyContributionTotal)을 그대로 호출한다 - 이 카드만의 별도 계산을 새로 만들지 않는다.
  const monthly = (typeof getHouseholdMonthlyContributionTotal === 'function') ? getHouseholdMonthlyContributionTotal() : num(state.projection.monthlyContribution);

  const currentEl = document.getElementById('projectionHeroCurrent');
  const monthlyEl = document.getElementById('projectionHeroMonthly');
  const futureLabelEl = document.getElementById('projectionHeroFutureLabel');
  const futureEl = document.getElementById('projectionHeroFuture');
  if (currentEl) currentEl.textContent = fmtKRWShort(currentTotal);
  if (monthlyEl) monthlyEl.textContent = monthly > 0 ? `${fmtKRWShort(monthly)}/월` : '미설정';
  if (futureLabelEl) futureLabelEl.textContent = `${years}년 후 예상 자산`;
  if (futureEl) futureEl.textContent = fmtKRWShort(futureTotal);

  // [장기 투자계획 UX 개선 - 신규] "현재자산 → 앞으로 투자 → 미래자산"으로 이어지는 계획의 핵심 조건 중
  // "투자 기간"과 "투자금 증가"는 아코디언을 펼치지 않아도 바로 보이는 한 줄로도 함께 보여준다 - 아래
  // items 배열과 동일하게 이미 구한 years/growthRate를 그대로 표시만 한다(새 계산 없음).
  const growthRate = num(state.projection.contributionGrowthRate);
  const planYearsEl = document.getElementById('projectionPlanYearsText');
  if (planYearsEl) planYearsEl.textContent = `${years}년`;
  const planGrowthEl = document.getElementById('projectionPlanGrowthText');
  if (planGrowthEl) planGrowthEl.textContent = growthRate > 0 ? `매년 ${fmtNum(growthRate, 1)}%씩` : '증가 없음(매월 동일)';
  // [Phase 17 P1-3] 한 줄 요약 확장분 - 아래 아코디언 목록이 이미 읽는 것과 동일한 값(presetResults.normal.weightedAvgRate,
  // state.projection.inflationRate)을 여기서도 그대로 표시만 한다(새 계산 없음).
  const planRateEl = document.getElementById('projectionPlanRateText');
  if (planRateEl) planRateEl.textContent = `${fmtNum(presetResults.normal.weightedAvgRate, 2)}%`;
  const planInflationEl = document.getElementById('projectionPlanInflationText');
  if (planInflationEl) planInflationEl.textContent = `${fmtNum(num(state.projection.inflationRate), 1)}%`;

  const list = document.getElementById('projectionAssumptionsList');
  if (list) {
    const inflationRate = num(state.projection.inflationRate);
    const normalRatePct = presetResults.normal.weightedAvgRate;
    // [P2 - Phase 9 감사 후속] owner별 적립기간이 실제로 계산에 반영되는데도(Step 1-4) 결과 화면
    // 어디에도 텍스트로 드러나지 않아, 초보자가 "왜 이 금액이 나왔는지" 알기 어렵다는 문제가 있었다
    // (Phase 9 감사 P2). Deterministic/Monte Carlo가 이미 공유하는 getOwnerMonthlyContributionInputs를
    // 그대로 재사용해 표시만 한다(새 계산 없음) - "투자 기간"(미래예측이 몇 년 후를 계산하는가, 위
    // 고정값)과 이 "적립 기간"(신규 월 적립을 몇 년 동안 하는가)은 서로 다른 개념임을 라벨로 구분한다.
    const husbandYears = getOwnerMonthlyContributionInputs('신랑').years;
    const wifeYears = getOwnerMonthlyContributionInputs('와이프').years;
    const contributionPeriodText = husbandYears === wifeYears
      ? formatContributionYearsForDisplay(husbandYears)
      : `신랑 ${formatContributionYearsForDisplay(husbandYears)} · 와이프 ${formatContributionYearsForDisplay(wifeYears)}`;
    const items = [
      `투자 기간(미래예측 기간): ${years}년`,
      // [Phase 22 STEP 9 - 용어 스코프 명확화] Dashboard의 "금융자산 평가금액"(절세계좌 포함), Assets의
      // "총자산"(부동산까지 포함)과 범위가 다르다는 것을 이 한 줄에서 바로 알 수 있도록 "(일반계좌)"만
      // 덧붙였다(Phase 21 T-09) - currentTotal 계산 자체는 무변경, 문구만 추가.
      `현재 자산(일반계좌): ${fmtKRWShort(currentTotal)}`,
      monthly > 0
        ? `월 적립금: ${fmtKRWShort(monthly)}${growthRate > 0 ? ` (매년 ${fmtNum(growthRate, 1)}%씩 증가)` : '(매월 동일)'}`
        : '월 적립금: 미설정',
      `적립 기간(신규 납입 기간): ${contributionPeriodText}`,
      `기준 연간 성장률(일반적 시나리오): ${fmtNum(normalRatePct, 2)}%`,
      `물가상승률: ${fmtNum(inflationRate, 1)}%(Monte Carlo 실질가치 환산에 사용)`,
      'Monte Carlo를 실행하면 변동성과 여러 번의 시뮬레이션을 반영한 결과 범위도 함께 볼 수 있어요.'
    ];
    list.innerHTML = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  }
  reapplyDetailCardAccordionHeight('assumptions', 'projectionAssumptionsAccordionBtn', 'projectionAssumptionsAccordionBody');
}

/* -------------------------------------------------------------------------
 * 10-3-3-2. [절세계좌 현황 카드] ISA/IRP/연금저축 등 절세계좌 보유 자산은 미래예측 계산(일반계좌
 *    전용)에서 완전히 빠져 있으므로, 별도의 간단한 카드+팝업으로 "이 계좌들은 얼마나 있고, 매월
 *    얼마씩 넣으면 몇 년 후 얼마가 되는지"를 확인할 수 있게 한다. ISA/IRP/연금저축은 법적으로 개인
 *    명의 전용 계좌라 부부 공동명의가 불가능하므로, '공동' 소유 자산은 대상에서 제외하고 신랑/와이프
 *    두 명 기준으로만 집계한다.
 * ---------------------------------------------------------------------- */
const TAX_ADVANTAGED_OWNERS = ['신랑', '와이프'];
// [적립 비율 고정 - 요청 반영] 매월 적립금을 지금 실제 보유 비중에 맞춰 나누면 종목별 수익률 차이로
// 시뮬레이션 내내 비중이 계속 흔들려 결과가 불안정해진다 - 대신 위험자산(주식형)/안전자산(채권형)을
// 항상 정확히 70:30으로 고정 배분한다(시작 잔액도 동일 비율로 재해석). 위험자산 수익률은 리밸런싱
// 후 시나리오와 동일한 국내 대표지수(KOSPI, SCENARIO_RATE_PRESETS.indexRates.domestic)를, 안전자산은
// 채권 수익률(categories.채권)을 그대로 재사용해 다른 카드들과 기준이 어긋나지 않게 한다.
const TAX_ADVANTAGED_RISK_SHARE = 0.7;

// 절세계좌 보유 자산을 소유자별로 집계 - 총액과, 참고용으로 계좌종류별 소계도 함께 반환한다.
function getTaxAdvantagedHoldingsByOwner() {
  const result = {};
  TAX_ADVANTAGED_OWNERS.forEach((o) => { result[o] = { total: 0, byAccountType: {} }; });
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a)) return; // 일반계좌는 대상 아님 - 절세계좌만
    if (!TAX_ADVANTAGED_OWNERS.includes(a.owner)) return;
    const bucket = result[a.owner];
    const value = calcRow(a).curAmount;
    bucket.total += value;
    const accType = a.accountType || '(미지정)';
    bucket.byAccountType[accType] = (bucket.byAccountType[accType] || 0) + value;
  });
  return result;
}

// [Phase 24-B STEP 5 - Scenario 중복 판정] "시나리오별 총자산"(일반계좌+절세계좌+부동산)이 "시나리오별
// 일반계좌"와 실제로 다른 숫자를 낼 조건이 하나라도 있는지 확인한다 - updateProjection()의 총자산
// 계산(realEstateTotalValue/ownerPointsList, 아래 참고)이 실제로 참조하는 세 원천(부동산 보유,
// 절세계좌 보유자산, 절세계좌 월적립 계획)을 그대로 다시 조회할 뿐 새 계산식을 만들지 않는다. 셋 다
// 없으면(신규 사용자 다수) 총자산 시나리오는 일반계좌 시나리오와 100% 동일한 숫자를 반복 표시하므로
// (Phase 24-A 감사에서 실측 확인된 중복), 그 경우에만 UI에서 "총자산" 관점을 숨긴다 - 계산 자체
// (updateProjection의 totalScenarioData)는 계속 그대로 실행된다(삭제 아님, 표시 여부만 판단).
function hasDistinctTotalAssetScenario() {
  const realEstateTotal = state.assets.filter((a) => a.category === '부동산').reduce((s, a) => s + calcRow(a).curAmount, 0);
  if (realEstateTotal > 0) return true;
  const holdingsByOwner = getTaxAdvantagedHoldingsByOwner();
  if (TAX_ADVANTAGED_OWNERS.some((o) => holdingsByOwner[o] && holdingsByOwner[o].total > 0)) return true;
  const monthlyByOwner = (state.projection.taxAdvantagedPlan && state.projection.taxAdvantagedPlan.monthlyByOwner) || {};
  return TAX_ADVANTAGED_OWNERS.some((o) => num(monthlyByOwner[o]) > 0);
}

// [계좈 세부/카드 상단 - 포지션(역할) 비중 표기 - 요청 반영] "위험/안전자산 구성" 대신, 절세계좈에
// 실제로 보유 중인 종목들을 포지션(역할)별로 나눠 보여준다 - 개별 자산에 직접 지정된 role이 없으면
// 티커별 역할 단일 소스(getTickerRole)로 폴백한다(다른 화면과 동일한 원칙). ownerFilter를 생략하거나
// 'all'을 넘기면 신랑+와이프 절세계좈 보유분을 합쳐 부부합산으로 계산한다(카드 상단 대표 표시용) -
// 특정 소유자명을 넘기면 그 사람만(계좈 세부 드롭다운용). [버그 수정 - 요청 반영] 예전엔 카드 상단이
// 이 함수가 아니라 일반계좈 목표비중(computePositionRoleBreakdown)을 잘못 참조해 "일반계좈 기준"
// 문구가 절세계좈 카드에 섞여 들어갔었다 - 이제 상단/드롭다운 모두 이 함수 하나(절세계좈 실제 보유
// 기준)만 쓴다. 목표 비중이 아니라 "지금 실제로 뭘 들고 있는가" 기준이다(적립 예상 계획과도 무관).
function getTaxAdvantagedRoleBreakdown(ownerFilter) {
  const owners = (ownerFilter && ownerFilter !== 'all') ? [ownerFilter] : TAX_ADVANTAGED_OWNERS;
  const weights = emptyRoleWeights(); // [Phase 32] js/01 단일 소스(정식 4개 + legacy + 미지정)
  let total = 0;
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a) || !owners.includes(a.owner)) return;
    const value = calcRow(a).curAmount;
    total += value;
    const role = a.role || getTickerRole(a.ticker, a.name);
    const key = (role && weights[role] !== undefined) ? role : 'unassigned';
    weights[key] += value;
  });
  const pct = {};
  Object.keys(weights).forEach((k) => { pct[k] = total !== 0 ? weights[k] / total * 100 : 0; });
  return pct;
}

// 절세계좌 보유 자산을 소유자별로 "계좌종류 → 종목" 계층으로 묶어 반환한다 - [적립설정] 팝업이 "이
// 계좌에 실제로 어떤 종목이 있는지" 보여주고 종목별 배분 비중을 입력받는 용도. 같은 티커가 같은 계좌
// 안에 거래가 나뉘어 있어도(예: 여러 번 매수) 하나의 행으로 합산해서 보여준다.
function getTaxAdvantagedAssetsByOwnerAccount(owner) {
  const byAccount = {};
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a) || a.owner !== owner) return;
    const accType = a.accountType || '(미지정)';
    if (!byAccount[accType]) byAccount[accType] = new Map();
    const key = String(a.ticker ?? '').trim() || `__name__${a.name}`;
    // [포지션 자동 연동 - 요청 반영] role도 함께 실어 보낸다 - 이 자산에 자산관리 화면에서 직접
    // 태깅해 둔 역할이 있으면(레지스트리를 거치지 않고도) roleFor가 바로 이어받을 수 있게.
    if (!byAccount[accType].has(key)) byAccount[accType].set(key, { ticker: a.ticker || '', name: a.name, curAmount: 0, role: a.role });
    byAccount[accType].get(key).curAmount += calcRow(a).curAmount;
    if (!byAccount[accType].get(key).role && a.role) byAccount[accType].get(key).role = a.role;
  });
  const result = {};
  Object.keys(byAccount).forEach((accType) => { result[accType] = Array.from(byAccount[accType].values()); });
  return result;
}

// [계좌별·종목별 대표 수익률 연동 - 요청 반영] 절세계좌 하나(소유자 owner)의 미래가치를 세 조각으로
// 나눠 계산한 뒤 합산한다:
//  1) 원금 - 지금 실제 보유 중인 종목 하나하나를 getProjectionAssetGroupKey(일반계좌와 완전히 동일한
//     대표 매칭 로직, "수익률 관리" 오버라이드도 그대로 적용)로 매칭해 각자의 대표 수익률로 독립 복리
//     성장시킨다(예전엔 위험:안전 70:30으로 뭉뚱그렸으나, 이제 실제 보유 종목의 성격이 그대로 반영됨).
//  2) 배분된 월 적립금 - [적립설정] 팝업에서 이 소유자가 특정 (계좌,종목)에 직접 배분한 몫을 그 종목의
//     대표 수익률로 독립 복리 성장시킨다(getMonthlyAllocationItemRate를 그대로 재사용 - 일반계좌
//     [월적립금 설정]과 동일한 함수).
//  3) 배분되지 않은 나머지 월 적립금 - [버그 수정 방지 - 폴백] 배분표가 비어있거나(신규 계좌 등) 일부만
//     채워졌을 때, 나머지는 기존처럼 위험:안전(KOSPI:채권) 70:30 고정 비율로 계산해 항상 안전하게
//     동작한다.
// [개별 적립 기간 지원] contributionYears 동안만 매월 적립하고, evalYears가 그보다 길면 그 이후로는
// 적립 없이 이미 쌓인 금액이 계속 같은 수익률로 복리 성장한다고 가정한다(growWithStop).
// [Phase 25 P0] planOverride는 절세계좌 팝업이 draft를 미리보기로 계산할 때만 넘긴다 - 생략하면
// 예전과 완전히 동일하게 실제 state를 읽는다(Phase 24-B ownerFilter와 같은 "optional 인자, 기본값은
// 기존 동작" 패턴).
function simulateTaxAdvantagedOwnerGrowth(owner, presetKey, evalYears, planOverride) {
  const plan = planOverride || state.projection.taxAdvantagedPlan;
  const accountPlans = (plan.contributionByOwnerAccount && plan.contributionByOwnerAccount[owner]) || [];

  let total = 0;

  // 1) 원금 - 실제 보유 종목별 대표 매칭 수익률로 독립 복리 성장(신규 적립 없이, PMT=0). [계좌별 적립
  // 설정 - 리팩터링] 예전엔 owner의 단일 적립기간(contribYears/idleYears)으로 두 단계 나눠 계산했는데,
  // PMT=0일 때 두 단계로 나눠 계산한 값은 한 번에 evalYears만큼 계산한 값과 수학적으로 완전히 같다
  // (연속 복리 곱셈 법칙: (1+r)^a * (1+r)^b = (1+r)^(a+b)) - 계좌마다 적립기간이 달라질 수 있는 이제는
  // 원금 성장 자체를 특정 계좌 기간에 묶을 이유가 없으므로 한 번에 계산하도록 단순화한다(결과값 불변).
  const principalGroups = {}; // key -> { value, sample }
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a) || a.owner !== owner) return;
    const key = getProjectionAssetGroupKey(a);
    if (!principalGroups[key]) principalGroups[key] = { value: 0, sample: a };
    principalGroups[key].value += calcRow(a).curAmount;
  });
  Object.keys(principalGroups).forEach((key) => {
    const g = principalGroups[key];
    total += computeFutureValue(g.value, getAssetProjectionRate(g.sample, presetKey), evalYears, 0);
  });

  if (accountPlans.length === 0) {
    // [하위호환 폴백] 이 소유자가 새 계좌별 적립 설정을 하나도 등록하지 않았으면(마이그레이션 직후
    // 또는 아직 안 써본 사용자), 예전처럼 owner 전체를 하나의 풀로 취급하는 monthlyByOwner/
    // yearsByOwner 기준으로 계산한다 - 기존 동작과 완전히 동일(회귀 없음).
    const contributionYears = num(plan.yearsByOwner[owner]);
    const monthlyTotal = num(plan.monthlyByOwner[owner]);
    const allocation = (plan.allocationByOwner[owner] || []).filter((it) => num(it.pct) > 0);
    const contribYears = Math.min(contributionYears, evalYears);
    const idleYears = Math.max(0, evalYears - contributionYears);
    const growWithStop = (pv, rate, monthly) => {
      const atContribEnd = computeFutureValue(pv, rate, contribYears, monthly);
      return idleYears > 0 ? computeFutureValue(atContribEnd, rate, idleYears, 0) : atContribEnd;
    };
    const allocatedPct = Math.min(100, allocation.reduce((s, it) => s + num(it.pct), 0));
    allocation.forEach((item) => {
      total += growWithStop(0, getMonthlyAllocationItemRate(item, presetKey), monthlyTotal * num(item.pct) / 100);
    });
    const remainderPct = Math.max(0, 100 - allocatedPct);
    if (remainderPct > 0) {
      const remainderMonthly = monthlyTotal * remainderPct / 100;
      const riskShare = TAX_ADVANTAGED_RISK_SHARE;
      total += growWithStop(0, getEffectiveIndexRate(presetKey, 'domestic'), remainderMonthly * riskShare);
      total += growWithStop(0, getReferenceRate(presetKey, 'BOND'), remainderMonthly * (1 - riskShare));
    }
    return total;
  }

  // [계좌별 적립 설정 - 요청 반영] 계좌(accountType)마다 독립적인 납입주기(매월/매년)·금액·기간을 쓴다 -
  // 계좌마다 다른 시점에 납입이 끝나고, 그 이후엔 해당 계좌 몫만 복리로 계속 성장한다.
  accountPlans.forEach((acc) => {
    const accYears = num(acc.years);
    const contribYears = Math.min(accYears, evalYears);
    const idleYears = Math.max(0, evalYears - accYears);
    const grow = (rate, amount) => {
      const computeFn = acc.frequency === 'yearly' ? computeFutureValueAnnual : computeFutureValue;
      const atContribEnd = computeFn(0, rate, contribYears, amount);
      return idleYears > 0 ? computeFutureValue(atContribEnd, rate, idleYears, 0) : atContribEnd;
    };
    // 이 계좌(accountType)에 배분된 종목만 - pct의 의미가 "이 계좌 적립금 중 비중"으로 바뀐다.
    const allocation = (plan.allocationByOwner[owner] || [])
      .filter((it) => it.accountType === acc.accountType && num(it.pct) > 0);
    const allocatedPct = Math.min(100, allocation.reduce((s, it) => s + num(it.pct), 0));
    allocation.forEach((item) => {
      total += grow(getMonthlyAllocationItemRate(item, presetKey), num(acc.amount) * num(item.pct) / 100);
    });
    const remainderPct = Math.max(0, 100 - allocatedPct);
    if (remainderPct > 0) {
      const remainderAmount = num(acc.amount) * remainderPct / 100;
      const riskShare = TAX_ADVANTAGED_RISK_SHARE;
      total += grow(getEffectiveIndexRate(presetKey, 'domestic'), remainderAmount * riskShare);
      total += grow(getReferenceRate(presetKey, 'BOND'), remainderAmount * (1 - riskShare));
    }
  });

  return total;
}
// 위 함수의 연도별(0~maxYears) 스냅샷 배열 버전 - "시나리오별 총자산" 통합 그래프/표(milestoneOffsets
// 기준)가 이 배열을 그대로 재사용한다.
function simulateTaxAdvantagedOwnerYearlyPoints(owner, presetKey, maxYears) {
  const points = [];
  for (let y = 0; y <= maxYears; y++) points.push({ year: y, total: simulateTaxAdvantagedOwnerGrowth(owner, presetKey, y) });
  return points;
}

// [UI 개편 - 요청 반영] [전체/신랑/와이프] 필터 select를 없애고 항상 가구 합계로 보여준다. 소유자별
// 세부 현황은 상단 요약 아래 아코디언 2개(신랑/와이프)로 접어두고, 펼쳤을 때만 그 사람의 계좌종류별
// 소계 + 포지션별 비중을 보여준다. 매번 innerHTML을 통째로 새로 그리므로(다른 아코디언 카드들과 동일한
// 이유) 버튼도 매번 다시 만들어지고, 클릭 리스너도 매번 다시 붙여야 한다.
// [대표 표시 - "위험/안전자산" → "포지션별 비중" 전환, 요청 반영] 예전엔 카테고리(주식/ETF=위험, 그 외=
// 안전) 기준 단순 이분법이었으나, 이제 "포트폴리오 구성" 탭과 같은 포지션(공격수/코어미드필더/수비수)
// 축으로 통일한다. [버그 수정 - 요청 반영] 상단 대표 줄이 한때 일반계좈 목표비중(computePositionRoleBreakdown)
// 을 잘못 참조해 절세계좈 카드에 "일반계좈 기준" 문구가 섞여 나오는 오류가 있었다 - 상단/계좈 세부
// 드롭다운(소유자별) 모두 getTaxAdvantagedRoleBreakdown(ownerFilter) 하나만 쓴다(상단은 ownerFilter
// 생략='all'=부부합산, 드롭다운은 그 owner만) - "목표"가 아니라 절세계좈에 "지금 실제로 뭘 들고
// 있는가"만을 기준으로 한다(적립 예상 계획과도 무관).
function renderTaxAdvantagedCard() {
  const container = document.getElementById('taxAdvantagedSummary');
  if (!container) return;
  const holdings = getTaxAdvantagedHoldingsByOwner();
  const total = TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + holdings[o].total, 0);
  if (total === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400">보유 중인 절세계좌 자산이 없습니다.</p>';
    return;
  }
  const householdRoleSummary = formatRolePctSummary(getTaxAdvantagedRoleBreakdown('all'));

  const ownerAccordionKey = { '신랑': 'taxHusband', '와이프': 'taxWife' };
  const ownerAccordionIds = (owner) => ({ key: ownerAccordionKey[owner], btnId: `taxAdvantaged${owner === '신랑' ? 'Husband' : 'Wife'}AccordionBtn`, bodyId: `taxAdvantaged${owner === '신랑' ? 'Husband' : 'Wife'}AccordionBody` });
  const ownerAccordionHtml = (owner) => {
    const h = holdings[owner];
    const ids = ownerAccordionIds(owner);
    const accountTypeRows = Object.keys(h.byAccountType).sort();
    const roleSummary = formatRolePctSummary(getTaxAdvantagedRoleBreakdown(owner));
    return `
    <div class="border-t border-slate-100 dark:border-slate-800">
      <button type="button" id="${ids.btnId}" class="detail-card-accordion-btn w-full flex items-center justify-between gap-1.5 py-2 text-left text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300">
        <span class="text-sm font-medium">${escapeHtml(owner)} 계좌 세부</span>
        <span class="flex items-center gap-1 shrink-0">
          <span class="text-sm text-slate-400">${fmtKRWShort(h.total)}</span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200 detail-card-accordion-chevron"></i>
        </span>
      </button>
      <div id="${ids.bodyId}" class="overflow-hidden transition-[max-height] duration-300 ease-in-out" style="max-height:0px;">
        <div class="pb-2 space-y-1">
          ${accountTypeRows.length > 0 ? accountTypeRows.map((t) => `
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-500 dark:text-slate-400">${escapeHtml(t)}</span>
            <span class="font-medium text-slate-700 dark:text-slate-300">${fmtKRWShort(h.byAccountType[t])}</span>
          </div>`).join('') : '<p class="text-sm text-slate-400">보유 중인 자산이 없습니다.</p>'}
          <div class="pt-1">
            <p class="text-sm text-slate-400 mb-0.5">포지션별 비중(실제 보유 기준)</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">${roleSummary}</p>
          </div>
        </div>
      </div>
    </div>`;
  };

  container.innerHTML = `
    <div class="flex items-baseline justify-between mb-2">
      <span class="text-sm text-slate-400">합계 평가금액</span>
      <span class="text-base font-bold whitespace-nowrap">${fmtKRWShort(total)}</span>
    </div>
    <div class="pb-2 border-b border-slate-100 dark:border-slate-800">
      <p class="text-sm text-slate-400 mb-0.5">포지션별 비중(부부합산 · 절세계좈 실제 보유 기준)</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">${householdRoleSummary}</p>
    </div>
    ${TAX_ADVANTAGED_OWNERS.map(ownerAccordionHtml).join('')}`;

  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    const ids = ownerAccordionIds(owner);
    document.getElementById(ids.btnId).addEventListener('click', () => toggleDetailCardAccordion(ids.key, ids.btnId, ids.bodyId));
    reapplyDetailCardAccordionHeight(ids.key, ids.btnId, ids.bodyId);
  });
  lucide.createIcons();
}

function taxAdvantagedAllocationContainerId(owner) { return owner === '신랑' ? 'taxAdvantagedAllocationHusband' : 'taxAdvantagedAllocationWife'; }

/* -------------------------------------------------------------------------
 * [Phase 25 P0 - 절세계좌 적립계획 draft] 예전엔 이 팝업의 입력이 키를 누를 때마다 곧바로
 *    state.projection.taxAdvantagedPlan을 바꾸고 persistProjection()까지 실행해서, [닫기]를 눌러도
 *    되돌릴 방법이 자체가 없었다(같은 화면의 [적립금 설정] 팝업은 정확히 반대로 동작해 일관성도
 *    깨져 있었다). 이제 monthlyContributionByOwnerDraft/rebalanceModalDraft와 완전히 동일한
 *    draft-then-commit 계약을 쓴다 - 팝업이 열려 있는 동안에는 taxAdvantagedPlanDraft만 바뀌고,
 *    [확인]을 눌러 validation을 통과해야 state에 반영된다.
 *    [미리보기를 잃지 않는다] 팝업 안의 결과표(renderTaxAdvantagedPlanResults)는 draft를 그대로
 *    넘겨 계산하므로, 입력 중 예상 적립금액이 실시간으로 갱신되는 기존 장점은 그대로 유지된다.
 * ---------------------------------------------------------------------- */
let taxAdvantagedPlanDraft = null;
// 팝업이 열려 있으면 draft를, 닫혀 있으면 실제 state를 반환한다 - 팝업 바깥(updateProjection 등)에서
// 호출되는 계산 경로는 draft가 null이라 예전과 완전히 동일하게 동작한다.
function taxPlanSource() { return taxAdvantagedPlanDraft || state.projection.taxAdvantagedPlan; }
function buildTaxAdvantagedPlanDraft() {
  // 구조적 깊은 복사 - allocationByOwner/contributionByOwnerAccount가 배열이라 얕은 복사로는 draft에서
  // push/splice한 것이 그대로 state에 새어 들어간다(rebalanceModalDraft가 같은 이유로 깊은 복사를 쓴다).
  return JSON.parse(JSON.stringify(state.projection.taxAdvantagedPlan));
}

function openTaxAdvantagedPlanModal() {
  taxAdvantagedPlanDraft = buildTaxAdvantagedPlanDraft();
  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    renderTaxAdvantagedAllocationEditor(owner, taxAdvantagedAllocationContainerId(owner));
  });
  renderTaxAdvantagedPlanResults();
  document.getElementById('taxAdvantagedPlanModal').classList.remove('hidden');
  pushModalHistoryState();
}
// [취소 계약] draft를 버리는 것 외에 아무 것도 하지 않는다 - state/localStorage/화면 결과 모두 그대로다.
function closeTaxAdvantagedPlanModal(viaBackButton) {
  taxAdvantagedPlanDraft = null;
  document.getElementById('taxAdvantagedPlanModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
/* -------------------------------------------------------------------------
 * [Phase 25 P0 - 절세계좌 적립계획 validation & commit] 월적립금 설정 팝업
 *    (saveMonthlyContributionAllocationModalBtn)과 완전히 같은 계약이다 - validation을 통과하지
 *    못하면 state를 전혀 건드리지 않고 저장 자체를 막는다(값을 조용히 보정하지 않는다).
 *    검사 항목은 월적립금 팝업이 이미 쓰는 기준을 그대로 맞춘다: 배분 합계 100% 초과 금지,
 *    음수 금액/기간 금지. 여기에 절세계좌 고유 항목(납입주기)이 유효한 값인지도 확인한다.
 * ---------------------------------------------------------------------- */
const TAX_CONTRIB_FREQUENCIES = ['monthly', 'yearly'];
function validateTaxAdvantagedPlanDraft(plan) {
  const errors = [];
  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    (plan.contributionByOwnerAccount[owner] || []).forEach((c) => {
      const where = `${owner} ${c.accountType}`;
      if (num(c.amount) < 0) errors.push(`${where}의 적립 금액은 0 이상이어야 합니다.`);
      // years는 "제한 없음"이 없는 값이라(계좌마다 반드시 납입 기간이 있다) 0 미만만 막는다 -
      // 월적립금 팝업의 적립기간 검사와 동일한 기준이다.
      if (num(c.years) < 0) errors.push(`${where}의 적립 기간은 0 이상이어야 합니다.`);
      if (c.frequency && !TAX_CONTRIB_FREQUENCIES.includes(c.frequency)) {
        errors.push(`${where}의 납입 주기 값이 올바르지 않습니다.`);
      }
    });
    // 배분 합계는 계좌별로 검사한다 - 화면의 합계 안내문(updateTaxAdvantagedAllocationSumHint)이
    // 계좌 단위로 표시되므로 사용자가 어느 계좌를 고쳐야 하는지 바로 알 수 있다.
    const byAccount = {};
    (plan.allocationByOwner[owner] || []).forEach((it) => {
      if (num(it.pct) < 0) errors.push(`${owner} ${it.accountType}의 "${it.label || it.ticker}" 배분 비중은 0 이상이어야 합니다.`);
      byAccount[it.accountType] = (byAccount[it.accountType] || 0) + num(it.pct);
    });
    Object.keys(byAccount).forEach((accType) => {
      if (byAccount[accType] > 100) errors.push(`${owner} ${accType}의 배분 비중 합계가 100%를 넘을 수 없습니다(현재 ${fmtNum(byAccount[accType], 1)}%).`);
    });
  });
  return errors;
}
function commitTaxAdvantagedPlanDraft() {
  if (!taxAdvantagedPlanDraft) return;
  const errors = validateTaxAdvantagedPlanDraft(taxAdvantagedPlanDraft);
  if (errors.length > 0) { alert(errors.join('\n')); return; } // state를 건드리지 않고 중단
  // [티커별 역할(포지션) 단일 소스] 팝업에서 지정한 role을 이 시점에 한 번에 레지스트리로 넘긴다.
  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    (taxAdvantagedPlanDraft.allocationByOwner[owner] || []).forEach((it) => {
      if (it.ticker || it.label) setTickerRole(it.ticker, it.role, it.label);
    });
  });
  state.projection.taxAdvantagedPlan = taxAdvantagedPlanDraft;
  taxAdvantagedPlanDraft = null;
  persistProjection();
  closeTaxAdvantagedPlanModal(false);
  updateProjection();
  showToast('절세계좌 적립계획을 저장했습니다.', 'success');
}
document.getElementById('cancelTaxAdvantagedPlanModalBtn').addEventListener('click', () => closeTaxAdvantagedPlanModal(false));
document.getElementById('saveTaxAdvantagedPlanModalBtn').addEventListener('click', commitTaxAdvantagedPlanDraft);
document.getElementById('taxAdvantagedPlanBtn').addEventListener('click', () => openTaxAdvantagedPlanModal());
document.getElementById('closeTaxAdvantagedPlanModalBtn').addEventListener('click', () => closeTaxAdvantagedPlanModal(false));

// [계좌 통합 카드 - 요청 반영] 예전엔 "적립 설정"(주기·금액·기간)과 "계좈별·종목별 배분"이 서로 다른
// 목록이라, 이미 아래쪽에 자동으로 뜨는 IRP/ISA 같은 실제 보유 계좈종류를 위쪽에 사용자가 오타 없이
// 직접 다시 타이핑해야만 서로 연결됐다(사용자 신고 - "IRP/ISA 각각 어떻게 넣으라는거냐" +
// "계좈종류/금액/배분을 계좈마다 한 덩어리로 보이게 해달라"). 이제 실제 보유 중인 계좈종류
// (getTaxAdvantagedAssetsByOwnerAccount)마다 카드 하나에 [계좈명 + 납입주기 + 금액 + 기간] 헤더와
// 그 계좈이 보유한 종목별 배분 비중을 함께 묶어서 소유자(신랑/와이프)별로 보여준다 - 계좈종류는 더
// 이상 직접 입력하지 않고 보유 종목에서 자동으로 정해지므로(수동 "계좈 추가/삭제" 버튼 자체가 필요
// 없어짐), 새 절세계좌에 종목을 사면(신규 accountType 발생) 다음에 이 팝업을 열 때 카드가 자동으로
// 하나 더 나타난다. contributionByOwnerAccount[owner]에 아직 없는 계좈종류는 렌더링 시점에
// 기본값(매월/0원/15년)으로 자동 생성해 저장한다 - 그래야 처음 여는 순간부터 바로 금액·기간 입력칸이
// 보인다.
function renderTaxAdvantagedAllocationEditor(owner, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const byAccount = getTaxAdvantagedAssetsByOwnerAccount(owner);
  const accountTypes = Object.keys(byAccount).sort();
  if (accountTypes.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400">보유 중인 절세계좈 종목이 없습니다 - 종목을 매수하면 계좈별로 자동으로 카드가 생깁니다. 그 전까지는 예전처럼 계좈 구분 없는 단일 적립액(설정했다면)으로 계산됩니다.</p>';
    return;
  }
  const plan = taxPlanSource();
  const contribList = plan.contributionByOwnerAccount[owner] || (plan.contributionByOwnerAccount[owner] = []);
  // [Phase 25 P0] 새 계좌 기본값 시드는 draft에만 넣는다 - 예전엔 팝업을 "열기만 해도"
  // persistProjection()이 실행돼, 아무 것도 입력하지 않고 닫아도 저장 파일이 바뀌었다.
  accountTypes.forEach((accType) => {
    if (!contribList.some((c) => c.accountType === accType)) {
      contribList.push({ accountType: accType, frequency: 'monthly', amount: 0, years: 15 });
    }
  });
  const contribFor = (accType) => contribList.find((c) => c.accountType === accType);
  const allocation = plan.allocationByOwner[owner] || [];
  // [티커 없는 자산까지 확장 - 요청 반영] 티커만으론 국채/현금처럼 티커 없는 종목끼리 구분이 안 되므로
  // (전부 빈 문자열) name까지 포함한 identity로 이 계좈에 이미 만들어진 배분 항목을 찾는다.
  const pctFor = (accType, ticker, name) => {
    const found = allocation.find((it) => it.accountType === accType && allocEntryIdentity(it.ticker, it.label) === allocEntryIdentity(ticker || '', name));
    return found ? found.pct : 0;
  };
  // [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 계좈에서 아직 배분 항목을 만든 적 없는(=보유는
  // 하지만 적립 배분을 한 번도 설정 안 한) 종목도, 자산관리/거래내역 등 다른 화면에 이미 등록된
  // 역할이 있으면 그 값을 보여준다 - 우선순위: 이 화면에서 직접 지정한 배분 항목의 role → 실제 보유
  // 자산 자체에 태깅된 role(assetRole, 티커 없는 자산은 레지스트리를 안 거치고도 바로 이어받는다) →
  // 레지스트리(다른 팝업에서 먼저 지정해 뒀을 수 있음, 티커 없으면 이름으로 조회).
  const roleFor = (accType, ticker, name, assetRole) => {
    const found = allocation.find((it) => it.accountType === accType && allocEntryIdentity(it.ticker, it.label) === allocEntryIdentity(ticker || '', name));
    return (found && found.role) || assetRole || getTickerRole(ticker, name);
  };
  const roleOptionsHtml = (selected) => assetRoleSelectOptionsHtml(selected, '역할 미지정');
  container.innerHTML = accountTypes.map((accType) => {
    const c = contribFor(accType);
    // [계좈별 종목 추가 - 티커 없는 자산까지 확장, 요청 반영] 보유 종목(byAccount) 외에, 아직 안 산
    // 미보유 종목이라도 이 계좈의 배분 목록(allocationByOwner)에 이미 지정돼 있으면(+ 종목 추가로
    // 넣은 경우) 함께 행으로 보여준다 - 예전엔 it.ticker가 있어야만(진짜 티커형만) 보여줘서, 국채/
    // 현금처럼 미보유 상태로 이름검색만으로 추가한 티커 없는 목표는 배분 목록엔 저장되는데 화면
    // 카드에는 영원히 안 보이는 사각지대가 있었다 - allocEntryIdentity로 이미 보유 중인 항목과
    // 겹치는지 판정해, 겹치지 않는 티커 없는 계획 항목도 "미보유" 행으로 노출한다.
    const heldIdentities = new Set(byAccount[accType].map((a) => allocEntryIdentity(a.ticker, a.name)));
    const plannedRows = allocation
      .filter((it) => it.accountType === accType && !heldIdentities.has(allocEntryIdentity(it.ticker, it.label)))
      .map((it) => ({ ticker: it.ticker, name: it.label, planned: true }));
    const displayRows = [...byAccount[accType].map((a) => ({ ticker: a.ticker, name: a.name, role: a.role, planned: false })), ...plannedRows];
    return `
    <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 mt-2 first:mt-0">
      <div class="mb-2">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="flex-1 min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(accType)}">${escapeHtml(accType)}</span>
          <select data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="frequency"
            class="tax-contrib-input shrink-0 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
            <option value="monthly" ${c.frequency === 'yearly' ? '' : 'selected'}>매월</option>
            <option value="yearly" ${c.frequency === 'yearly' ? 'selected' : ''}>매년</option>
          </select>
        </div>
        <div class="flex items-center justify-end gap-1">
          <input type="text" inputmode="numeric" value="${formatInputNumber(c.amount || '')}" placeholder="금액"
            data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="amount"
            class="tax-contrib-input w-24 shrink-0 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none">
          <span class="text-sm text-slate-400 shrink-0">원</span>
          <input type="number" step="1" min="1" value="${c.years || ''}" placeholder="기간"
            data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="years"
            class="tax-contrib-input w-12 shrink-0 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-sm text-slate-400 shrink-0">년</span>
        </div>
      </div>
      <div class="space-y-1.5 pl-1">
        ${displayRows.map((row) => `
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="flex-1 min-w-0 text-sm text-slate-600 dark:text-slate-300 truncate" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}${row.planned ? ' <span class="text-amber-500">(미보유)</span>' : ''}</span>
          <input type="number" step="0.1" min="0" max="100" value="${pctFor(accType, row.ticker, row.name)}"
            data-alloc-owner="${escapeHtml(owner)}" data-alloc-account="${escapeHtml(accType)}" data-alloc-ticker="${escapeHtml(row.ticker)}" data-alloc-label="${escapeHtml(row.name)}"
            class="tax-alloc-input w-16 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-sm text-slate-400 shrink-0">%</span>
          <!-- [종목 삭제 버튼 - 요청 반영] 보유 종목은 배분 항목만 지워져 pct 0으로 돌아가고(행 자체는
               실제 보유 자산이라 계속 남음), 미보유(planned) 종목은 배분 항목이 곧 행의 존재 근거라
               삭제 시 행 자체가 사라진다. -->
          <button type="button" data-tax-alloc-remove data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" data-ticker="${escapeHtml(row.ticker)}" data-name="${escapeHtml(row.name)}" title="삭제"
            class="touch-target w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
          <select data-alloc-role-owner="${escapeHtml(owner)}" data-alloc-role-account="${escapeHtml(accType)}" data-alloc-role-ticker="${escapeHtml(row.ticker)}" data-alloc-role-label="${escapeHtml(row.name)}"
            class="tax-alloc-role-select basis-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 outline-none">${roleOptionsHtml(roleFor(accType, row.ticker, row.name, row.role))}</select>
        </div>`).join('')}
      </div>
      <p class="tax-alloc-sum-hint text-sm text-slate-400 mt-1.5" data-alloc-sum-owner="${escapeHtml(owner)}" data-alloc-sum-account="${escapeHtml(accType)}"></p>
      <!-- [계좈별 종목 추가 - "수익률 관리" 팝업의 +신규 종목 추가 버튼 형식 차용] -->
      <button type="button" data-tax-add-toggle data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}"
        class="w-full mt-1.5 flex items-center justify-center gap-1 text-sm font-semibold px-2 py-1 rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300">
        <i data-lucide="plus" class="w-3 h-3"></i> 종목 추가
      </button>
      <div data-tax-add-form data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" class="hidden mt-1.5 p-1.5 rounded bg-slate-50 dark:bg-slate-800/60"></div>
    </div>`; }).join('');
  accountTypes.forEach((accType) => updateTaxAdvantagedAllocationSumHint(owner, accType));
  // [천단위 콤마 자동 포맷팅 - 요청 반영] 매번 innerHTML을 새로 그리므로 그때마다 다시 붙여야 한다.
  container.querySelectorAll('.tax-contrib-input[data-contrib-field="amount"]').forEach((el) => attachThousandsInputFormatting(el));
  lucide.createIcons();
}
// [계좈별 종목 추가 - 검색 결과] searchStockCandidates(js/04, 보유종목+종목 마스터+Yahoo)를 그대로
// 재사용한다 - 다른 "+ 종목 추가" 플로우들과 동일한 검색 범위(미보유 종목도 대상).
// [티커 없는 후보도 노출 - 요청 반영] 예전엔 r.symbol이 있는(티커형) 결과만 남기고 국채/현금처럼
// 티커 없는 보유 자산은 검색 결과에서 통째로 걸러냈다 - 이제 함께 보여주고, 이미 배분 목록에 있는지
// 판정하는 기준도 티커 하나만으론 부족해(티커 없는 항목은 전부 빈 문자열로 뭉개짐) 티커 없으면
// 이름 기반 키로 대신 식별한다(buildCustomRateKey와 동일 규칙 - allocEntryIdentity).
function allocEntryIdentity(ticker, label) {
  return ticker || `NAME:${normalizeNameKey(label)}`;
}
async function renderTaxAddSearchResults(resultsEl, owner, accType, query) {
  const q = query.trim();
  if (!q) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-1">검색 중...</p>';
  const results = await searchStockCandidates(q);
  const existing = new Set((taxPlanSource().allocationByOwner[owner] || [])
    .filter((it) => it.accountType === accType).map((it) => allocEntryIdentity(it.ticker, it.label)));
  const candidates = results.filter((r) => !existing.has(allocEntryIdentity(r.symbol, r.name))).slice(0, 10);
  if (candidates.length === 0) {
    resultsEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-1">검색 결과가 없습니다.</p>';
    return;
  }
  resultsEl.innerHTML = candidates.map((r) => `
    <button type="button" data-tax-add-candidate data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" data-ticker="${escapeHtml(r.symbol)}" data-name="${escapeHtml(r.name)}" data-role="${escapeHtml(r.role || '')}"
      class="w-full flex items-center justify-between gap-2 text-left px-1.5 py-1 rounded hover:bg-white dark:hover:bg-slate-700">
      <span class="text-sm truncate">${escapeHtml(r.name)}</span>
      <span class="text-sm text-slate-400 shrink-0">${escapeHtml(r.symbol || '보유 중(티커 없음)')}</span>
    </button>`).join('');
}
function updateTaxAdvantagedAllocationSumHint(owner, accountType) {
  const el = document.querySelector(`.tax-alloc-sum-hint[data-alloc-sum-owner="${CSS.escape(owner)}"][data-alloc-sum-account="${CSS.escape(accountType)}"]`);
  if (!el) return;
  const allocation = (taxPlanSource().allocationByOwner[owner] || []).filter((it) => it.accountType === accountType);
  const sumPct = allocation.reduce((s, it) => s + num(it.pct), 0);
  el.textContent = `이 계좌 배분 합계 ${fmtNum(sumPct, 1)}% · 나머지 ${fmtNum(Math.max(0, 100 - sumPct), 1)}%는 위험:안전 70:30으로 계산`;
}
// [이벤트 위임] 카드를 매번 다시 그릴 때마다 리스너를 새로 붙일 필요가 없도록, 절대 다시 그려지지 않는
// 모달 자체에 하나만 걸어둔다. 입력할 때마다 카드 전체를 다시 그리면 포커스가 끊겨 타이핑이 불편해지므로,
// 값만 state에 반영하고 합계 안내문/결과표/시나리오별 총자산만 갱신한다.
document.getElementById('taxAdvantagedPlanModal').addEventListener('input', (e) => {
  const addSearchInput = e.target.closest('[data-tax-add-search]');
  if (addSearchInput) {
    const form = addSearchInput.closest('[data-tax-add-form]');
    const resultsEl = form.querySelector('[data-tax-add-results]');
    renderTaxAddSearchResults(resultsEl, form.dataset.owner, form.dataset.account, addSearchInput.value);
    return;
  }
  const contribInput = e.target.closest('.tax-contrib-input');
  if (contribInput) {
    const owner = contribInput.dataset.contribOwner;
    const accType = contribInput.dataset.contribAccount;
    const field = contribInput.dataset.contribField;
    const list = taxPlanSource().contributionByOwnerAccount[owner];
    const entry = list && list.find((c) => c.accountType === accType);
    if (!entry) return;
    entry[field] = (field === 'frequency') ? contribInput.value : num(contribInput.value);
    // [Phase 25 P0] draft만 바꾸고 저장하지 않는다 - 팝업 안 결과표는 draft로 계산되므로 미리보기는
    // 예전 그대로 실시간 갱신되고, 바깥 화면은 [확인]을 눌러야 갱신된다.
    renderTaxAdvantagedPlanResults();
    return;
  }
  const input = e.target.closest('.tax-alloc-input');
  if (!input) return;
  const owner = input.dataset.allocOwner;
  const accountType = input.dataset.allocAccount;
  const ticker = input.dataset.allocTicker;
  const label = input.dataset.allocLabel;
  const pct = num(input.value);
  const plan = taxPlanSource();
  const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
  // [티커 없는 자산까지 확장 - 요청 반영] 티커 하나만으론 국채/현금처럼 티커 없는 항목끼리 서로 구분이
  // 안 된다(전부 빈 문자열) - 이름까지 포함한 identity로 이 계좈의 몇 번째 배분 항목인지 찾는다.
  const idx = list.findIndex((it) => it.accountType === accountType && allocEntryIdentity(it.ticker, it.label) === allocEntryIdentity(ticker, label));
  if (pct > 0) {
    // [티커별 역할(포지션) 단일 소스 - 자동 연동] 직접 % 입력으로 새 배분 항목이 처음 생기는 경우에도
    // 이미 다른 곳에 지정된 role이 있으면 이어받는다(+ 종목 추가 플로우와 동일한 원칙).
    if (idx >= 0) list[idx].pct = pct; else list.push({ accountType, ticker, label, pct, role: getTickerRole(ticker, label) });
  } else if (idx >= 0) {
    list.splice(idx, 1); // 0%로 낮추면 배분 목록에서 완전히 제거해 깔끔하게 유지한다.
  }
  updateTaxAdvantagedAllocationSumHint(owner, accountType);
  renderTaxAdvantagedPlanResults();
});
document.getElementById('taxAdvantagedPlanModal').addEventListener('change', (e) => {
  const roleSelect = e.target.closest('.tax-alloc-role-select');
  if (!roleSelect) return;
  const owner = roleSelect.dataset.allocRoleOwner;
  const accountType = roleSelect.dataset.allocRoleAccount;
  const ticker = roleSelect.dataset.allocRoleTicker;
  const label = roleSelect.dataset.allocRoleLabel;
  const role = parseAssetRoleInput(roleSelect.value);
  const plan = taxPlanSource();
  const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
  const idx = list.findIndex((it) => it.accountType === accountType && allocEntryIdentity(it.ticker, it.label) === allocEntryIdentity(ticker, label));
  // pct가 아직 0(=배분 목록에 항목 자체가 없음)인 상태에서 role만 먼저 지정할 수도 있으므로, 없으면
  // pct:0으로 새로 만든다 - 나중에 pct를 올리면 위 input 핸들러가 이 항목을 그대로 이어받는다.
  if (idx >= 0) list[idx].role = role; else list.push({ accountType, ticker, label, pct: 0, role });
  // [티커별 역할(포지션) 단일 소스 - 티커 없는 자산까지 확장] 이 화면에서 지정한 role을 다른 화면에서도
  // 이어받도록 레지스트리에도 반영한다(티커 없으면 이름으로 대신 키를 만든다).
  // [Phase 25 P0] 역할 레지스트리 반영도 [확인] 시점으로 미룬다 - 취소했는데 역할만 남는 부분 커밋을
  // 만들지 않기 위해서다(commitTaxAdvantagedPlanDraft에서 일괄 수행).
});
document.getElementById('taxAdvantagedPlanModal').addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-tax-alloc-remove]');
  if (removeBtn) {
    const owner = removeBtn.dataset.owner, accType = removeBtn.dataset.account, ticker = removeBtn.dataset.ticker, label = removeBtn.dataset.name;
    const list = taxPlanSource().allocationByOwner[owner] || [];
    const idx = list.findIndex((it) => it.accountType === accType && allocEntryIdentity(it.ticker, it.label) === allocEntryIdentity(ticker, label));
    if (idx >= 0) {
      list.splice(idx, 1);
      renderTaxAdvantagedAllocationEditor(owner, taxAdvantagedAllocationContainerId(owner));
      renderTaxAdvantagedPlanResults();
    }
    return;
  }
  const addToggleBtn = e.target.closest('[data-tax-add-toggle]');
  if (addToggleBtn) {
    const owner = addToggleBtn.dataset.owner, accType = addToggleBtn.dataset.account;
    const form = document.querySelector(`[data-tax-add-form][data-owner="${CSS.escape(owner)}"][data-account="${CSS.escape(accType)}"]`);
    if (!form) return;
    if (!form.classList.contains('hidden')) { form.classList.add('hidden'); form.innerHTML = ''; return; }
    form.classList.remove('hidden');
    form.innerHTML = `
      <input type="text" data-tax-add-search autocomplete="off" placeholder="종목명/티커 검색"
        class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none">
      <div data-tax-add-results class="mt-1 space-y-0.5 max-h-32 overflow-y-auto"></div>`;
    const input = form.querySelector('[data-tax-add-search]');
    setTimeout(() => input.focus(), 50);
    return;
  }
  const addCandidateBtn = e.target.closest('[data-tax-add-candidate]');
  if (addCandidateBtn) {
    const owner = addCandidateBtn.dataset.owner, accType = addCandidateBtn.dataset.account;
    const ticker = addCandidateBtn.dataset.ticker, label = addCandidateBtn.dataset.name;
    const plan = taxPlanSource();
    const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
    // [미보유 종목 추가 - 티커 없는 자산까지 확장, 요청 반영] pct:0으로 우선 추가하고, 이미 지정된
    // role이 있으면 자동으로 이어받는다 - 검색 후보가 실어 보낸 실제 보유 자산의 role을 우선 쓰고,
    // 없으면 레지스트리로 한 번 더 폴백한다(getTickerRole이 티커/이름 둘 다 지원). 중복 판정도 티커
    // 하나만으론 부족해(티커 없는 항목은 전부 빈 문자열로 뭉개짐) allocEntryIdentity로 통일한다.
    const identity = allocEntryIdentity(ticker, label);
    if (!list.some((it) => it.accountType === accType && allocEntryIdentity(it.ticker, it.label) === identity)) {
      const role = addCandidateBtn.dataset.role || getTickerRole(ticker, label);
      list.push({ accountType: accType, ticker, label, pct: 0, role });
    }
    renderTaxAdvantagedAllocationEditor(owner, taxAdvantagedAllocationContainerId(owner));
    return;
  }
  if (e.target.id === 'taxAdvantagedPlanModal') closeTaxAdvantagedPlanModal(false);
});

// 팝업 안의 결과 표 - 신랑/와이프/합계 3행 × 보수적/일반적/긍정적 3열. [개별 적립 기간 지원] 각 소유자는
// 자기 자신의 yearsByOwner만큼의 결과를 보여준다 - "합계" 행은 서로 다른 두 시점의 금액을 단순히 더한
// 값이라는 점을 아래 안내 문구에서 명시한다(합계 자체는 "각자 자기 목표 시점에 도달했을 때의 총액"으로
// 자연스럽게 해석된다).
// [계좌별 적립 설정 - 요청 반영] 예전엔 owner 전체가 단일 적립기간(yearsByOwner)을 가져 "N년 후"가
// 하나로 정해졌는데, 이제 계좌마다 기간이 다를 수 있어 하나의 숫자로 대표할 수 없다 - 그 owner가 등록한
// 계좌들 중 가장 늦게 끝나는 기간(모든 계좌의 납입이 끝난 뒤 = "완전히 쌓인" 시점)을 기준으로 삼는다.
// 계좌별 설정이 하나도 없으면(하위호환) 예전 yearsByOwner로 폴백한다.
function getTaxAdvantagedOwnerHorizon(owner, planOverride) {
  const plan = planOverride || state.projection.taxAdvantagedPlan;
  const accs = plan.contributionByOwnerAccount[owner] || [];
  if (accs.length > 0) return Math.max(...accs.map((a) => num(a.years)));
  return num(plan.yearsByOwner[owner]) || 15;
}
function renderTaxAdvantagedPlanResults() {
  const container = document.getElementById('taxAdvantagedPlanResults');
  if (!container) return;
  const presetKeys = ['conservative', 'normal', 'optimistic'];
  const presetLabels = { conservative: '보수적', normal: '일반적', optimistic: '긍정적' };
  const horizonByOwner = {};
  const plan = taxPlanSource();
  TAX_ADVANTAGED_OWNERS.forEach((o) => { horizonByOwner[o] = getTaxAdvantagedOwnerHorizon(o, plan); });
  const rows = [...TAX_ADVANTAGED_OWNERS, '합계'].map((owner) => {
    const values = presetKeys.map((presetKey) => {
      if (owner === '합계') {
        return TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + simulateTaxAdvantagedOwnerGrowth(o, presetKey, horizonByOwner[o], plan), 0);
      }
      return simulateTaxAdvantagedOwnerGrowth(owner, presetKey, horizonByOwner[owner], plan);
    });
    return { owner, values };
  });
  container.innerHTML = `
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-left">
          <th class="py-2 pr-2 font-semibold"></th>
          ${presetKeys.map((k) => `<th class="py-2 px-1 text-right font-semibold whitespace-nowrap">${presetLabels[k]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const rowLabel = r.owner === '합계' ? '합계' : `${r.owner} (${horizonByOwner[r.owner]}년 후)`;
          return `
        <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 ${r.owner === '합계' ? 'font-bold' : ''}">
          <td class="py-2 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">${escapeHtml(rowLabel)}</td>
          ${r.values.map((v) => `<td class="py-2 px-1 text-right whitespace-nowrap ${r.owner === '합계' ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}">${fmtKRWShort(v)}</td>`).join('')}
        </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <p class="text-sm text-slate-400 mt-2 leading-relaxed">신랑은 ${horizonByOwner['신랑']}년 후, 와이프는 ${horizonByOwner['와이프']}년 후(각자 등록한 계좌 중 가장 늦게 끝나는 계좌 기준) 예상 적립금액(원금+수익)입니다. "합계"는 두 시점 금액을 단순 합산한 값입니다. 실제 보유 중인 종목과 계좌별로 배분한 종목은 각자의 대표 수익률로, 배분되지 않은 나머지 적립금은 위험자산(주식형) 70% · 안전자산(채권형) 30% 고정 비율로 복리 성장한다고 가정합니다.</p>`;
}

/* -------------------------------------------------------------------------
 * 10-3-3-1. [수익률 관리 모달] 사용자가 종목별 보수/일반/긍정 수익률을 직접 등록·수정한다 - 시스템
 *    기본 매핑(SCENARIO_RATE_PRESETS)을 덮어쓰는 오버라이드를 state.projection.customScenarioRates에
 *    저장한다(getCustomRate/findCustomRateKeyForAsset 참고). rebalanceTargetModal과 동일하게 draft
 *    (초안) 배열에서만 수정하다가 [저장]을 눌러야 실제 state에 커밋되고, [취소]/스와이프/뒤로가기로
 *    닫으면 초안이 버려진다.
 * ---------------------------------------------------------------------- */
let scenarioRateManagerDraft = [];

// 모달을 열 때 현재 유효 수익률(오버라이드가 있으면 그 값, 없으면 시스템 기본값)로 초안을 채운다.
function buildScenarioRateManagerDraft() {
  const customRates = state.projection.customScenarioRates || {};
  return getScenarioRateDisplayRows().map((row) => ({
    key: row.key,
    label: row.label,
    isBase: !row.custom,
    conservative: num(getReferenceRate('conservative', row.key)),
    normal: num(getReferenceRate('normal', row.key)),
    optimistic: num(getReferenceRate('optimistic', row.key)),
    // [키워드 자동매칭 - 요청 반영] 종목명에 이 키워드가 있으면 카테고리/지역 폴백보다 우선해서 이
    // 키로 자동 매칭된다(getCustomKeywordRateKey 참고) - 등록 안 해도 그만이라 안 써도 기존과 동일.
    keywords: (customRates[row.key] && Array.isArray(customRates[row.key].keywords)) ? customRates[row.key].keywords.slice() : []
  }));
}

function openScenarioRateManagerModal() {
  scenarioRateManagerDraft = buildScenarioRateManagerDraft();
  const form = document.getElementById('scenarioRateAddNewForm');
  form.classList.add('hidden');
  form.innerHTML = '';
  renderScenarioRateManagerList();
  document.getElementById('scenarioRateManagerModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}

function closeScenarioRateManagerModal(viaBackButton) {
  document.getElementById('scenarioRateManagerModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
  scenarioRateManagerDraft = [];
}

document.getElementById('openScenarioRateManagerBtn').addEventListener('click', openScenarioRateManagerModal);
document.getElementById('closeScenarioRateManagerModalBtn').addEventListener('click', () => closeScenarioRateManagerModal(false));
document.getElementById('cancelScenarioRateManagerModalBtn').addEventListener('click', () => closeScenarioRateManagerModal(false));

/* [Phase 40-C] 이 기준의 근거가 어디까지 확인됐는지 한 줄로 보여준다.
 * CMA_SOURCE_METADATA는 지금까지 순수 내부 추적용이라 사용자에게 전혀 노출되지 않았다 - 그래서
 * 출처가 확인된 값(S&P500)과 출처 불명 값(KOSPI)이 화면에서 똑같아 보였다. 없는 출처를 만들어내지
 * 않고, 이미 기록돼 있는 내용만 초보자 표현으로 옮긴다. 전문용어(CMA/geometric 등)는 배지에 쓰지
 * 않고 상세 툴팁에만 남긴다. */
/* [Phase 43] 이 기준에 "시스템이 제공하는 참고 가정"이 존재하는가.
 * 사용자가 직접 만든 키(BOND.STOCK, 개별 종목 등)에는 애초에 시스템 기본값이 없다 -
 * getSystemDefaultRate()는 모르는 키를 지역 대표지수로 대체해 그럴듯한 숫자를 돌려주므로,
 * 그걸 "시스템 참고값"이라고 보여주면 없는 근거를 지어내는 셈이 된다(PM 지시 6).
 * 그래서 시스템 기본 행(SCENARIO_RATE_BASE_ROWS)에 실제로 있는 키에만 참고값을 붙인다. */
function getSystemReferenceRates(key) {
  if (!SCENARIO_RATE_BASE_ROWS.some((r) => r.key === key)) return null;
  return {
    conservative: getSystemDefaultRate('conservative', key),
    normal: getSystemDefaultRate('normal', key),
    optimistic: getSystemDefaultRate('optimistic', key)
  };
}
// [Phase 43] 이 키의 세 시나리오 중 사용자가 실제로 값을 넣은 것이 하나라도 있는가.
// customScenarioRates는 "필드가 있으면 오버라이드"라는 의미 체계를 쓴다(Phase 29-B) -
// 보수만 입력하고 일반/긍정은 비워 둘 수 있으므로 프리셋별로 따로 본다.
function getUserOverriddenPresets(key) {
  const custom = (state.projection.customScenarioRates || {})[key];
  if (!custom) return [];
  return ['conservative', 'normal', 'optimistic'].filter((p) => getCustomRate(key, p) !== undefined);
}

function getReturnAssumptionSourceInfo(key) {
  const custom = (state.projection.customScenarioRates || {})[key];
  if (custom) {
    // 사용자 값을 "틀렸다"고 판단하지 않는다 - 어떤 값이 실제 계산에 쓰이는지만 밝힌다.
    const ref = getSystemReferenceRates(key);
    const refText = ref ? `${fmtNum(ref.conservative, 1)} / ${fmtNum(ref.normal, 1)} / ${fmtNum(ref.optimistic, 1)}%` : null;
    const detail = refText
      ? `직접 입력한 값이 계산(미래예측·몬테카를로)에 그대로 사용됩니다. 참고로 시스템이 제공하는 기본 가정은 보수/일반/긍정 ${refText}입니다 - 어느 쪽이 맞다는 뜻은 아니며, 지금 적용되는 값은 위 입력값입니다.`
      : '직접 입력한 값이 계산(미래예측·몬테카를로)에 그대로 사용됩니다. 이 기준은 직접 만든 항목이라 시스템이 제공하는 참고 가정이 없습니다.';
    return { label: '사용자 설정값 적용', tone: 'user', detail, systemReference: ref, systemReferenceText: refText };
  }
  // getCmaAnchorForKey()는 앵커 "이름"을 돌려준다(객체가 아니다) - 메타는 여기서 꺼낸다.
  const anchorName = getCmaAnchorForKey(key);
  const meta = anchorName ? CMA_SOURCE_METADATA[anchorName] : null;
  if (!meta) {
    return { label: '추가 확인 필요', tone: 'weak', systemReference: getSystemReferenceRates(key), systemReferenceText: null,
      detail: '이 기준의 장기 수익률 근거가 아직 등록되어 있지 않습니다.' };
  }
  if (meta.status === 'cma_verified' && meta.source) {
    const bits = [meta.source];
    if (meta.asOfDate) bits.push('기준일 ' + meta.asOfDate);
    if (meta.forecastHorizonYears) bits.push('전망기간 ' + meta.forecastHorizonYears + '년');
    if (meta.returnType) bits.push('수익률 정의 ' + meta.returnType);
    if (meta.nominalReal) bits.push(meta.nominalReal === 'nominal' ? '명목' : '실질');
    if (meta.currency) bits.push('통화 ' + meta.currency);
    if (meta.uncertaintyNote) bits.push(meta.uncertaintyNote);
    return { label: '근거 확인됨', tone: 'ok', systemReference: getSystemReferenceRates(key), systemReferenceText: null,
      detail: bits.join(' · ') };
  }
  return { label: '추가 확인 필요', tone: 'weak', systemReference: getSystemReferenceRates(key), systemReferenceText: null,
    detail: (meta.methodologyNote || '') + ' ' + (meta.uncertaintyNote || '') };
}
const RETURN_SOURCE_TONE_CLASSES = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  user: 'text-brand-600 dark:text-brand-400',
  weak: 'text-amber-600 dark:text-amber-400'
};

function renderScenarioRateManagerList() {
  const container = document.getElementById('scenarioRateManagerList');
  if (scenarioRateManagerDraft.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center py-3">아직 매칭된 종목이 없습니다 - 보유 자산이나 "포트폴리오 구성" 목표 비중에 종목을 등록하면 여기 표시됩니다.</p>';
    return;
  }
  container.innerHTML = scenarioRateManagerDraft.map((row, idx) => {
    // [Phase 29-A] draft가 아니라 지금 커밋된 state 기준으로 판단(getPendingCmaFields 주석 참고) -
    // 커스텀 키(row.isBase===false)는 애초에 앵커가 없어 항상 빈 배열이다.
    const pending = getPendingCmaFields(row.key);
    const src = getReturnAssumptionSourceInfo(row.key);
    // [Phase 43] 사용자가 입력한 값과 시스템 참고 가정을 구분해 보여준다. 색만으로 구분하지 않도록
    // 아이콘과 문구를 함께 쓰고, 참고값이 없으면 줄 자체를 만들지 않는다(없는 근거를 지어내지 않는다).
    const overriddenPresets = getUserOverriddenPresets(row.key);
    const referenceLine = (overriddenPresets.length > 0 && src.systemReferenceText)
      ? `<p class="text-sm text-slate-500 dark:text-slate-400 break-keep">시스템 참고 가정: ${escapeHtml(src.systemReferenceText)}</p>`
      : '';
    const badge = pending.fields.length > 0
      ? `<button type="button" class="cma-recommend-badge touch-target w-full flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300" data-cma-key="${escapeHtml(row.key)}">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>새로운 장기 전망 확인
        </button>`
      : '';
    return `
    <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1.5">
      <div class="flex items-center gap-1.5">
        <span class="flex-1 min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
        <div class="flex items-center gap-1 shrink-0">
          <input type="number" step="0.1" value="${row.conservative}" data-rate-idx="${idx}" data-rate-field="conservative"
            class="scenario-rate-input w-14 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none" style="color:#ef4444">
          <input type="number" step="0.1" value="${row.normal}" data-rate-idx="${idx}" data-rate-field="normal"
            class="scenario-rate-input w-14 text-sm font-bold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <input type="number" step="0.1" value="${row.optimistic}" data-rate-idx="${idx}" data-rate-field="optimistic"
            class="scenario-rate-input w-14 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none" style="color:#10b981">
          ${row.isBase ? '<span class="w-6 shrink-0"></span>' : `<button type="button" class="scenario-rate-remove-btn w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400" data-rate-idx="${idx}" title="삭제"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`}
        </div>
      </div>
      <input type="text" value="${escapeHtml(row.keywords.join(', '))}" data-rate-idx="${idx}" data-rate-field="keywords"
        placeholder="종목명 키워드(쉼표로 구분) - 예: 현금, 달러"
        class="scenario-rate-keyword-input w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none text-slate-500 dark:text-slate-400">
      <p class="text-sm ${RETURN_SOURCE_TONE_CLASSES[src.tone]} flex items-center gap-1">
        <span>${src.tone === 'user' ? '📝 ' : ''}장기 수익률 가정: ${escapeHtml(src.label)}</span>
        <button type="button" data-info-tip="${escapeHtml(src.detail)}" class="text-slate-400" aria-label="근거 설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </p>
      ${referenceLine}
      ${badge}
    </div>`;
  }).join('');
  lucide.createIcons();
}

// 종목명/코드 입력값으로부터 저장 키를 만든다(buildCustomRateKey 재사용) - 등록된 종목 목록의
// 수치 입력은 매 keystroke마다 draft 배열에 그대로 반영한다(아직 state에는 커밋되지 않음).
document.getElementById('scenarioRateManagerList').addEventListener('input', (e) => {
  const idx = e.target.dataset.rateIdx;
  const field = e.target.dataset.rateField;
  if (idx === undefined || !field) return;
  if (field === 'keywords') {
    scenarioRateManagerDraft[Number(idx)][field] = e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    return;
  }
  scenarioRateManagerDraft[Number(idx)][field] = num(e.target.value);
});

document.getElementById('scenarioRateManagerList').addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.scenario-rate-remove-btn');
  if (removeBtn) {
    scenarioRateManagerDraft.splice(Number(removeBtn.dataset.rateIdx), 1);
    renderScenarioRateManagerList();
    return;
  }
  // [Phase 29-A] 배지 클릭 - 상세 확인 팝업을 연다(아래 openCmaRecommendationModal).
  const cmaBtn = e.target.closest('.cma-recommend-badge');
  if (!cmaBtn) return;
  openCmaRecommendationModal(cmaBtn.dataset.cmaKey);
});

/* -------------------------------------------------------------------------
 * 10-3-3-1-b. [Phase 29-A - 새로운 장기 전망 확인 팝업] 위 getPendingCmaFields가 고른 필드만 보여주고,
 *    [적용]은 그 필드만 골라 기존 customScenarioRates 저장 로직과 동일한 방식으로 써넣는다 - 사용자가
 *    이미 확정한 필드는 getPendingCmaFields 단계에서 이미 걸러졌으므로 여기서 다시 검사할 필요가 없다
 *    (이중 방어이자 단일 출처 - 후보 계산과 적용 대상이 항상 같은 함수 결과를 공유).
 * ---------------------------------------------------------------------- */
let cmaRecommendationModalKey = null;
const CMA_PRESET_LABELS = { conservative: '보수적', normal: '일반적', optimistic: '긍정적' };

function openCmaRecommendationModal(key) {
  const pending = getPendingCmaFields(key);
  if (!pending.recommended || pending.fields.length === 0) return; // 배지가 사라진 사이 늦게 도착한 클릭 등 방어
  cmaRecommendationModalKey = key;
  const rec = pending.recommended;
  const meta = pending.meta;
  const rows = pending.fields.map((preset) => {
    const current = num(getReferenceRate(preset, key));
    return `<div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
      <span class="text-slate-500 dark:text-slate-400">${CMA_PRESET_LABELS[preset]}</span>
      <span class="font-semibold tabular-nums">${current}% → <span class="text-brand-600 dark:text-brand-400">${num(rec[preset])}%</span></span>
    </div>`;
  }).join('');
  // [초보자 UX - PM 지시 9] "Geometric mean"/"VCMM" 같은 전문용어는 기본 화면에 노출하지 않는다 -
  // 여기 보이는 건 출처/기준일/투자기간뿐이고, methodologyNote/meanType 등 전문 설명은 이 팝업에도
  // 넣지 않는다(필요하면 향후 별도 "자세히 보기"에서 다룰 사안 - 이번 범위 밖).
  document.getElementById('cmaRecommendationBody').innerHTML = `
    ${rows}
    <div class="pt-1 space-y-0.5 text-sm text-slate-400 dark:text-slate-500">
      <div>출처 ${escapeHtml(rec.source || (meta && meta.source) || '-')}</div>
      <div>기준일 ${escapeHtml(rec.asOfDate || '-')}</div>
      <div>투자기간 ${rec.forecastHorizonYears ? escapeHtml(String(rec.forecastHorizonYears)) + '년' : '-'}</div>
    </div>`;
  document.getElementById('cmaRecommendationModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}

function closeCmaRecommendationModal(viaBackButton) {
  document.getElementById('cmaRecommendationModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
  cmaRecommendationModalKey = null;
}
document.getElementById('closeCmaRecommendationModalBtn').addEventListener('click', () => closeCmaRecommendationModal(false));

// [나중에] - 값은 절대 바꾸지 않는다. "이 버전을 봤다"는 사실만 기록해 같은 추천을 반복해서 들이밀지
// 않는다(다음에 더 새로운 버전이 나오면 그때 다시 뜬다 - getPendingCmaFields의 seenVersion 비교 참고).
document.getElementById('cmaRecommendationLaterBtn').addEventListener('click', () => {
  const key = cmaRecommendationModalKey;
  const anchor = getCmaAnchorForKey(key);
  const meta = anchor && CMA_SOURCE_METADATA[anchor];
  if (meta && meta.recommended) {
    state.projection.cmaRecommendationStatus = state.projection.cmaRecommendationStatus || {};
    state.projection.cmaRecommendationStatus[anchor] = { seenVersion: meta.recommended.version };
    persistProjection();
  }
  closeCmaRecommendationModal(false);
  renderScenarioRateManagerList();
});

// [적용] - PM 지시 5: customScenarioRates[key][preset] = recommended[preset] 형태로 기존 저장
// 로직과 동일하게(diff 방식이 아니라 이미 getPendingCmaFields가 "건드려도 되는 필드"만 골라줬으므로
// 그 필드만 그대로 씀) 커밋한다. 사용자가 이미 확정한 필드는 pending.fields에 애초에 없으므로 여기서
// 절대 덮어쓰지 않는다(override 보호, PM 지시 6).
document.getElementById('cmaRecommendationApplyBtn').addEventListener('click', () => {
  const key = cmaRecommendationModalKey;
  const pending = getPendingCmaFields(key);
  if (!pending.recommended || pending.fields.length === 0) { closeCmaRecommendationModal(false); return; }
  const customRates = state.projection.customScenarioRates;
  const entry = { ...(customRates[key] || {}) };
  pending.fields.forEach((preset) => { entry[preset] = num(pending.recommended[preset]); });
  if (!entry.label) entry.label = findLabelForRateKey(key) || key;
  customRates[key] = entry;
  state.projection.cmaRecommendationStatus = state.projection.cmaRecommendationStatus || {};
  state.projection.cmaRecommendationStatus[pending.anchor] = { seenVersion: pending.recommended.version };
  persistProjection();
  closeCmaRecommendationModal(false);
  // [모달이 열려 있는 경우 draft 재동기화] "수익률 관리" 모달이 열린 채로 적용했다면, 아직 저장 전인
  // draft를 그대로 두면 나중에 [저장]을 누를 때 방금 적용한 값이 draft의 옛 값으로 되돌아간다 - 방금
  // 커밋된 state를 기준으로 draft를 다시 만들어 항상 일치시킨다(이 시점에 다른 행의 미저장 편집이
  // 있었다면 함께 새로고침됨 - 적용은 그 자체로 즉시 커밋되는 동작이라는 게 이 기능의 전제).
  if (!document.getElementById('scenarioRateManagerModal').classList.contains('hidden')) {
    scenarioRateManagerDraft = buildScenarioRateManagerDraft();
  }
  renderScenarioRateManagerList();
  updateProjection();
  showToast('새로운 장기 전망을 적용했습니다.', 'success');
});

// [종목 검색 자동완성] 거래내역/자산등록 탭에서 쓰는 searchStockCandidates()(보유종목 로컬 검색 +
// Yahoo Finance 검색 API)를 그대로 재사용한다 - 별도 API 연동 없이 기존 검색 인프라에 그대로 올라탄다.
// 드롭다운은 stockAllocationSearchResults와 동일하게 "겹치지 않는 인라인(그 자리에서 펼쳐지는)" 방식으로
// 렌더링한다(absolute 오버레이 대신) - 모달 자체가 스크롤 컨테이너라 absolute 오버레이는 z-index를
// 아무리 높여도 overflow-y-auto 경계에서 잘리는 문제가 있어, 이미 이 앱에서 검증된 인라인 방식을 그대로 쓴다.
let scenarioRateSearchDebounceTimer = null;
let scenarioRateSearchRequestSeq = 0;

function renderScenarioRateSearchResults(results, seq) {
  if (seq !== scenarioRateSearchRequestSeq) return; // 더 최신 검색이 진행 중이면 늦게 도착한 응답은 버린다
  const container = document.getElementById('newScenarioRateSearchResults');
  if (!container) return;
  if (results.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">검색 결과가 없습니다</p>';
    return;
  }
  container.innerHTML = results.map((r) => `
    <button type="button" data-pick-symbol="${escapeHtml(r.symbol)}" data-pick-name="${escapeHtml(r.name)}"
      class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700">
      <span class="min-w-0 text-sm truncate">${escapeHtml(r.name)}</span>
      <span class="text-sm text-slate-400 shrink-0">${escapeHtml(r.symbol)} · ${escapeHtml(r.exch || '')}</span>
    </button>`).join('');
  container.querySelectorAll('button[data-pick-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.pickSymbol;
      const name = btn.dataset.pickName;
      document.getElementById('newScenarioRateName').value = name;
      document.getElementById('newScenarioRateCode').value = symbol;
      container.innerHTML = '';
      container.classList.add('hidden');
      // [기본 매핑 종목 자동 세팅] 이미 SCENARIO_RATE_PRESETS에 전용 수익률이 있는 종목(삼성전자/QQQM/
      // 미국 대형주 등)을 골랐다면, 시스템 기본값(일반적 프리셋 기준)을 3개 입력창에 미리 채워 넣고
      // 안내한다 - 사용자는 필요하면 그 값을 그대로 두거나 수정만 하면 된다.
      const yahoo = sanitizeTicker(symbol).yahooTicker;
      const presetTickerKey = SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined ? yahoo : TICKER_RATE_KEY_ALIAS[yahoo];
      if (presetTickerKey) {
        const c = getSystemDefaultRate('conservative', presetTickerKey);
        const n = getSystemDefaultRate('normal', presetTickerKey);
        const o = getSystemDefaultRate('optimistic', presetTickerKey);
        document.getElementById('newScenarioRateConservative').value = c;
        document.getElementById('newScenarioRateNormal').value = n;
        document.getElementById('newScenarioRateOptimistic').value = o;
        showToast(`${name}은(는) 이미 시스템 기본 매핑에 등록된 종목입니다. 기본 수익률(보수 ${fmtNum(c, 1)}% · 일반 ${fmtNum(n, 1)}% · 긍정 ${fmtNum(o, 1)}%)이 자동 입력되었습니다.`, 'info');
      }
    });
  });
}

function triggerScenarioRateSearch(query) {
  const container = document.getElementById('newScenarioRateSearchResults');
  clearTimeout(scenarioRateSearchDebounceTimer);
  if (!query) { container.classList.add('hidden'); container.innerHTML = ''; return; }
  container.classList.remove('hidden');
  container.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">검색 중...</p>';
  scenarioRateSearchDebounceTimer = setTimeout(async () => {
    const seq = ++scenarioRateSearchRequestSeq;
    const results = await searchStockCandidates(query);
    renderScenarioRateSearchResults(results, seq);
  }, 350);
}

// [+ 신규 종목 추가] 버튼 - 인라인 폼을 펼쳐서 종목명/코드 및 3개 수익률을 입력받는다. 코드는
// 선택사항(없으면 이름만으로 'NAME:' 키를 만든다 - findCustomRateKeyForAsset과 동일한 규칙).
document.getElementById('scenarioRateAddNewBtn').addEventListener('click', () => {
  const form = document.getElementById('scenarioRateAddNewForm');
  if (!form.classList.contains('hidden')) { form.classList.add('hidden'); form.innerHTML = ''; return; }
  form.classList.remove('hidden'); // [버그 수정] innerHTML만 채우고 hidden을 안 벗겨서 폼이 채워져도
  // 화면엔 계속 안 보이던 문제 - 실기기 터치로 버튼을 눌러도 "아무 변화가 없는 것처럼" 보였다.
  form.innerHTML = `
    <input id="newScenarioRateName" type="text" autocomplete="off" placeholder="종목명 검색 (예: SK하이닉스, 하이닉스, TSLA)" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <div id="newScenarioRateSearchResults" class="hidden space-y-0.5 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-100 dark:bg-slate-900"></div>
    <input id="newScenarioRateCode" type="text" autocomplete="off" placeholder="종목코드/티커 (예: 000660, 검색결과 선택 시 자동입력)" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <div class="flex items-start gap-1.5">
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateConservative" class="block text-sm text-slate-400 whitespace-nowrap mb-0.5">보수</label>
        <input id="newScenarioRateConservative" type="number" step="0.1" placeholder="%" class="w-full text-sm text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none" style="color:#ef4444">
      </div>
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateNormal" class="block text-sm text-slate-400 whitespace-nowrap mb-0.5">일반</label>
        <input id="newScenarioRateNormal" type="number" step="0.1" placeholder="%" class="w-full text-sm font-bold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none">
      </div>
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateOptimistic" class="block text-sm text-slate-400 whitespace-nowrap mb-0.5">긍정</label>
        <input id="newScenarioRateOptimistic" type="number" step="0.1" placeholder="%" class="w-full text-sm text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none" style="color:#10b981">
      </div>
    </div>
    <input id="newScenarioRateKeywords" type="text" autocomplete="off" placeholder="종목명 키워드(쉼표로 구분, 선택) - 예: 채권혼합" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <button type="button" id="confirmAddScenarioRateBtn" class="w-full text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white">추가</button>
  `;
  // [모바일 스크롤 개선] 폼을 펼친 직후 화면(특히 모바일)에서 입력창이 하단에 가려 안 보일 수 있으므로,
  // 부드럽게 스크롤해 방금 펼친 입력 폼이 바로 눈에 들어오게 한다.
  form.scrollIntoView({ behavior: 'smooth', block: 'end' });
  document.getElementById('newScenarioRateName').addEventListener('input', (e) => triggerScenarioRateSearch(e.target.value.trim()));
  document.getElementById('newScenarioRateCode').addEventListener('input', (e) => triggerScenarioRateSearch(e.target.value.trim()));
  document.getElementById('confirmAddScenarioRateBtn').addEventListener('click', () => {
    const name = document.getElementById('newScenarioRateName').value.trim();
    const code = document.getElementById('newScenarioRateCode').value.trim();
    const rawConservative = document.getElementById('newScenarioRateConservative').value.trim();
    const rawNormal = document.getElementById('newScenarioRateNormal').value.trim();
    const rawOptimistic = document.getElementById('newScenarioRateOptimistic').value.trim();
    if (!name && !code) { alert('종목명 또는 종목코드/티커를 입력하세요.'); return; }
    if (rawConservative === '' || rawNormal === '' || rawOptimistic === '') { alert('보수/일반/긍정 수익률을 모두 입력하세요.'); return; }
    const key = buildCustomRateKey(code, name);
    if (scenarioRateManagerDraft.some((r) => r.key === key)) { alert('이미 등록된 종목입니다.'); return; }
    const keywords = document.getElementById('newScenarioRateKeywords').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    scenarioRateManagerDraft.push({
      key, label: name || code, isBase: false,
      conservative: num(rawConservative), normal: num(rawNormal), optimistic: num(rawOptimistic), keywords
    });
    renderScenarioRateManagerList();
    form.classList.add('hidden');
    form.innerHTML = '';
  });
});

// [기본값으로 초기화] 초안에서 모든 사용자 등록/수정 내용을 지운다 - 지금 실제 포트폴리오에서 쓰이는
// 시스템 기본 상품(동적 필터링, getActiveScenarioRateKeys)만 남기고 각 수치도 SCENARIO_RATE_PRESETS
// 원본값으로 되돌린다 - 관련 없는 상품까지 되살리지 않는다. 아직 초안일 뿐이라 [저장]을 눌러야 확정된다.
document.getElementById('scenarioRateResetDefaultsBtn').addEventListener('click', () => {
  const activeKeys = getActiveScenarioRateKeys();
  scenarioRateManagerDraft = SCENARIO_RATE_BASE_ROWS.filter((row) => activeKeys.has(row.key)).map((row) => ({
    key: row.key, label: row.label, isBase: true,
    conservative: num(getSystemDefaultRate('conservative', row.key)),
    normal: num(getSystemDefaultRate('normal', row.key)),
    optimistic: num(getSystemDefaultRate('optimistic', row.key)),
    keywords: [] // 시스템 기본값엔 등록된 키워드가 없다(전부 사용자가 직접 등록한 것) - 초기화 시 함께 비운다.
  }));
  // 신규 종목 추가 폼이 열려 있었다면 함께 접는다 - 방금 지워진 초안 목록과 어긋난 채로 남아있으면
  // 안 되므로(예: 방금 추가하려던 종목이 사라졌는데 입력 폼만 남아있는 상태 방지).
  const addForm = document.getElementById('scenarioRateAddNewForm');
  addForm.classList.add('hidden');
  addForm.innerHTML = '';
  renderScenarioRateManagerList();
  showToast('모든 시나리오 수익률이 시스템 기본값으로 초기화되었습니다.', 'success');
});

// [저장] 초안을 state.projection.customScenarioRates로 커밋한다. 기본 상품 행은 시스템 기본값과
// 실제로 다른 필드만 오버라이드로 저장하고(전부 기본값과 같으면 그 종목의 오버라이드를 아예 지운다 -
// 기본값으로 초기화 후 저장한 경우가 여기 해당), 신규 등록 행은 입력값을 그대로 저장한다.
document.getElementById('saveScenarioRateManagerModalBtn').addEventListener('click', () => {
  const next = {};
  scenarioRateManagerDraft.forEach((row) => {
    if (row.isBase) {
      const entry = {};
      if (num(row.conservative) !== num(getSystemDefaultRate('conservative', row.key))) entry.conservative = num(row.conservative);
      if (num(row.normal) !== num(getSystemDefaultRate('normal', row.key))) entry.normal = num(row.normal);
      if (num(row.optimistic) !== num(getSystemDefaultRate('optimistic', row.key))) entry.optimistic = num(row.optimistic);
      if (Array.isArray(row.keywords) && row.keywords.length > 0) entry.keywords = row.keywords;
      if (Object.keys(entry).length > 0) { entry.label = row.label; next[row.key] = entry; }
    } else {
      next[row.key] = { label: row.label, conservative: num(row.conservative), normal: num(row.normal), optimistic: num(row.optimistic) };
      if (Array.isArray(row.keywords) && row.keywords.length > 0) next[row.key].keywords = row.keywords;
    }
  });
  state.projection.customScenarioRates = next;
  persistProjection();
  closeScenarioRateManagerModal(false);
  updateProjection();
  showToast('수익률 설정을 저장했습니다.', 'success');
});

// 리밸런싱 후 포트폴리오 전체의 가중평균 연수익률(프리셋별) - 지역 배분(국내/해외 %) × 지역 내
// 목표 항목 비중(%) × 그 항목의 예상 수익률(해당 프리셋 기준)을 전부 더한다.
// [버그 수정 - 캐치올 세부 선택 종목 무시] '주식' 캐치올 아래 [보유 주식 종목 선택]으로 개별 종목
// (예: 삼성전자)을 지정해도, 예전엔 여기서 캐치올을 통째로 하나의 "주식" 카테고리로만 보고 지역
// 대표지수 수익률을 적용해 개별 종목 수익률이 완전히 무시됐다 - 종목별 실행 가이드가 이미 쓰고 있는
// expandRebalanceTargetsForComputation(js/04, selectedStocks를 개별 티커 항목으로 "펼침")을 그대로
// 재사용해 두 계산이 항상 같은 데이터를 보게 했다. selectedStocks가 없으면 펼치기 전과 완전히 동일한
// 배열을 그대로 돌려주므로(js/04 참고) 기존 동작에 영향이 없다.
// [소유자별 독립 목표 - Option B] owner 한 명의 목표 비중만 기준으로 한 가중평균(지역 비중 포함, 전체
// 100% 기준) - computeTargetWeightedAvgRate가 owner별로 이 값을 구해 원금 비중으로 다시 가중평균한다.
function computeOwnerWeightedAvgRate(owner, presetKey) {
  let sum = 0;
  ['국내', '해외'].forEach((region) => {
    const regionFrac = num(state.rebalance[owner].domestic[region]) / 100;
    const targets = expandRebalanceTargetsForComputation(owner, region);
    targets.forEach((t) => { sum += regionFrac * (num(t.pct) / 100) * getTargetProjectionRate(t, presetKey, region); });
  });
  return sum;
}
// 리밸런싱 후 가구 전체의 가중평균 연수익률(프리셋별, 요약 카드용 단일 숫자) - 이제 목표 자체가
// owner별로 독립이라, 각 owner의 가중평균 수익률(computeOwnerWeightedAvgRate)을 그 owner의 현재
// 원금(일반계좌) 비중으로 다시 가중평균한다. 마이그레이션 직후(두 owner 목표가 동일)에는 어느 쪽으로
// 가중해도 결과가 같아 기존 값과 정확히 일치한다.
function computeTargetWeightedAvgRate(presetKey) {
  const ownerTotals = {};
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((owner) => {
    const total = getProjectionGroupTotal(getProjectionGroupStats(owner));
    ownerTotals[owner] = total;
    grandTotal += total;
  });
  if (grandTotal <= 0) {
    return REBALANCE_OWNERS.reduce((sum, owner) => sum + computeOwnerWeightedAvgRate(owner, presetKey), 0) / REBALANCE_OWNERS.length;
  }
  return REBALANCE_OWNERS.reduce((sum, owner) => sum + computeOwnerWeightedAvgRate(owner, presetKey) * (ownerTotals[owner] / grandTotal), 0);
}

// 지역(국내/해외) 하나의 목표 배분 "내에서만"의 가중평균 수익률(프리셋별) - 리밸런싱 후 시나리오의
// 지역별 미래가치 계산에 쓰인다(전체 가중평균과 달리 지역 비중은 곱하지 않고 그 지역 내 100% 기준).
// owner: [소유자별 독립 목표 - Option B] 이제 항상 실제 소유자명이 필요하다(expandRebalanceTargetsForComputation과 동일).
function computeRegionWeightedRate(owner, region, presetKey) {
  const targets = expandRebalanceTargetsForComputation(owner, region);
  const sumPct = targets.reduce((s, t) => s + num(t.pct), 0);
  if (sumPct === 0) return 0;
  let weighted = 0;
  targets.forEach((t) => { weighted += (num(t.pct) / sumPct) * getTargetProjectionRate(t, presetKey, region); });
  return weighted;
}

// 프리셋 하나(예: 'normal')로 목표 배분 시나리오의 20년치 연간 스냅샷을 계산한다 - 국내/해외를 각자
// 복리 계산한 뒤 합산해서(단일 가중평균으로 통짜 복리 계산하지 않아) 총자산이 두 지역의 합보다 작아지는
// 역전 현상을 방지한다.
// [월적립금 종목별 배분 지원 - 요청 반영] 원금(기존 보유 평가금액)과 월 적립금(새로 들어오는 돈)을
// 분리해서 계산한다 - 원금은 예전처럼 국내/해외 지역별 가중평균 수익률로, 월 적립금은
// simulateMonthlyContributionGrowth()가 [월적립금 설정]에서 사용자가 지정한 종목별 배분(있으면 그
// 종목 고유 수익률로, 없으면 예전처럼 지역 비례로)을 반영해 계산한다. computeFutureValue가 PV/PMT에
// 대해 선형이라(원금만 계산 + 적립금만 계산 = 합쳐서 계산한 것과 동일) 배분을 하나도 지정하지 않으면
// 이전 동작과 수학적으로 완전히 같다(하위 호환).
// [소유자별 독립 월적립금 - Part 2-B] owner의 월 적립 총액/배분을 반환한다 - 두 owner 모두
// monthlyContributionByOwner.total===0(한 번도 설정 안 함)이면 기존 단일 monthlyContribution/
// monthlyContributionAllocation을 owner의 현재 원금 비중대로 나눠 하위호환 폴백한다(원금 비중이 전혀
// 없으면 신랑에게 전액 배정 - 마이그레이션 직후에는 owner 목표가 동일해 어느 쪽에 배정해도 합산 결과가
// 예전과 정확히 같다).
// [적립기간 연결 - 요청 반영] years: null(또는 미설정)은 "제한 없음"(평가기간 내내 계속 적립 - 지금까지의
// 유일한 동작)을 뜻한다. 0을 포함한 그 외 모든 유효한 숫자는 사용자가 실제로 설정한 값으로 그대로
// 신뢰한다(js/01 normalizeMonthlyContributionByOwnerEntry 규약 참고 - num()에 그냥 통과시키면 null이
// 0으로 바뀌어 "제한없음"과 "0년"을 구분할 수 없게 되므로, 여기서는 num()을 쓰지 않고 null 여부를
// 직접 확인한다). 예전 단일 monthlyContribution 하위호환 폴백 경로(bothUnset)에는 애초에 owner별
// 적립기간이라는 개념 자체가 없었으므로 항상 null(제한 없음)을 반환해 기존 동작을 그대로 유지한다.
function getOwnerMonthlyContributionInputs(owner) {
  const byOwner = state.projection.monthlyContributionByOwner;
  const bothUnset = REBALANCE_OWNERS.every((o) => !(byOwner[o] && num(byOwner[o].total) > 0));
  if (!bothUnset) {
    const entry = byOwner[owner] || { total: 0, years: null, allocation: [] };
    const years = (entry.years === null || entry.years === undefined) ? null : num(entry.years);
    return { monthlyContribution: num(entry.total), years, allocation: entry.allocation || [] };
  }
  const ownerTotals = {};
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((o) => {
    const t = getProjectionGroupTotal(getProjectionGroupStats(o));
    ownerTotals[o] = t;
    grandTotal += t;
  });
  const share = grandTotal > 0 ? (ownerTotals[owner] / grandTotal) : (owner === REBALANCE_OWNERS[0] ? 1 : 0);
  return { monthlyContribution: num(state.projection.monthlyContribution) * share, years: null, allocation: state.projection.monthlyContributionAllocation || [] };
}

// [소유자별 독립 계산 - Option B] owner별로 자기 자신의 현재 원금(일반계좌, getProjectionGroupStats(owner))
// × 자기 목표 국내/해외 split × 자기 목표 종목별 가중수익률로 각자 복리 성장시킨 뒤 합산한다. 월
// 적립금도 owner별 monthlyContributionByOwner를 그대로 쓴다(getOwnerMonthlyContributionInputs가 하위
// 호환 폴백을 담당) - totalValue/monthlyContribution을 인자로 받던 예전 시그니처와 달리 이제 두 owner의
// 원금/적립금을 함수 내부에서 직접 계산한다.
// [Phase 24-B STEP 2 - Hero owner별 분해] ownerFilter를 주면 REBALANCE_OWNERS 중 그 owner 하나만
// 계산에 포함시킨다 - 아래 계산 공식(regionPV/regionRate/월적립금 성장 등)은 단 한 글자도 바뀌지
// 않았다(새 계산식이 아니라 "합산 대상 owner 목록만 좁힌 것"). ownerFilter 생략 시 기존과 완전히
// 동일(bit-identical) - 두 owner를 그대로 순회해 합산한다.
function simulateRebalancedPreset(presetKey, maxYears, ownerFilter) {
  const owners = ownerFilter ? [ownerFilter] : REBALANCE_OWNERS;
  const ownerCalcs = owners.map((owner) => {
    const totalValue = getProjectionGroupTotal(getProjectionGroupStats(owner));
    const regionPV = {
      '국내': totalValue * num(state.rebalance[owner].domestic['국내']) / 100,
      '해외': totalValue * num(state.rebalance[owner].domestic['해외']) / 100
    };
    const regionRate = { '국내': computeRegionWeightedRate(owner, '국내', presetKey), '해외': computeRegionWeightedRate(owner, '해외', presetKey) };
    // [Phase 3-4] 지역별 가중평균 운용보수 - regionRate와 완전히 같은 방식(가중평균)으로 구한다.
    const regionFeeRate = { '국내': feePercentToDecimal(computeRegionWeightedFeeRate(owner, '국내')), '해외': feePercentToDecimal(computeRegionWeightedFeeRate(owner, '해외')) };
    const { monthlyContribution, years, allocation } = getOwnerMonthlyContributionInputs(owner);
    // [P1 수정 - Phase 9 감사 후속] totalValue===0일 때 아래 simulateMonthlyContributionGrowth가 안전한
    // fallback으로 쓸 수 있도록, 이 owner의 목표 국내/해외 비중(이미 존재하는 구조)을 함께 넘긴다.
    return { totalValue, regionPV, regionRate, regionFeeRate, monthlyContribution, contributionYears: years, allocation, regionWeightPct: state.rebalance[owner].domestic };
  });
  // [Phase 3-4] 원금(신규 납입 없음)도 Fee를 적용한다 - contributionGrowthRate는 PMT=0이라 의미가
  // 없지만(계산에 영향 없음), 동일한 fee-aware 함수를 재사용해 이 값도 Monte Carlo와 같은 가정을 쓴다.
  const principalFutureValue = (calc, region, y) => computeFutureValueWithContributionGrowthAndFee(calc.regionPV[region], calc.regionRate[region], y, 0, 0, calc.regionFeeRate[region]);
  const yearlyPoints = [];
  for (let y = 0; y <= maxYears; y++) {
    let domestic = 0, foreign = 0, contribution = 0;
    ownerCalcs.forEach((calc) => {
      domestic += principalFutureValue(calc, '국내', y);
      foreign += principalFutureValue(calc, '해외', y);
      contribution += simulateMonthlyContributionGrowth(presetKey, calc.monthlyContribution, calc.regionPV, calc.regionRate, calc.totalValue, y, calc.allocation, calc.regionFeeRate, calc.contributionYears, calc.regionWeightPct);
    });
    yearlyPoints.push({ year: y, '국내': domestic, '해외': foreign, total: domestic + foreign + contribution });
  }
  return { yearlyPoints, weightedAvgRate: computeTargetWeightedAvgRate(presetKey) };
}

// [3가지 시나리오 리팩토링] 요약 카드 그리드·비교 차트·비교표가 전부 이 배열 하나를 순회(loop)해서
// 그려진다 - 시나리오를 추가/삭제하려면 이 배열만 바꾸면 된다. 전부 kind:'rebalanced'(리밸런싱 후
// 프리셋 3종, 지역별 복리 계산)이다.
// [버그 수정 - "현재 구성 유지" 제거] 예전엔 리밸런싱을 하지 않는 kind:'current' 시나리오도 함께
// 비교했으나, 요청에 따라 이 통합 비교(요약 카드/차트/스케줄 표)에서는 완전히 뺐다. 이 기준값을 쓰던
// "리밸런싱 효과 요약" 카드도 리밸런싱 설정 탭 개편으로 함께 제거되어, 이제 currentPoints/weightedAvg
// 계산 자체가 필요 없다.
const PROJECTION_SCENARIOS = [
  { key: 'conservative', label: '목표배분·보수적', color: SCENARIO_RATE_PRESETS.conservative.color, kind: 'rebalanced', preset: 'conservative' },
  { key: 'normal', label: '목표배분·일반적', color: SCENARIO_RATE_PRESETS.normal.color, kind: 'rebalanced', preset: 'normal' },
  { key: 'optimistic', label: '목표배분·긍정적', color: SCENARIO_RATE_PRESETS.optimistic.color, kind: 'rebalanced', preset: 'optimistic' }
];

// [3가지 시나리오 리팩토링] 상단 요약 카드 그리드 - PROJECTION_SCENARIOS(+계산된 points/weightedAvgRate)를
// 순회하며 카드 3개를 동일한 템플릿으로 그린다. 시나리오를 늘리거나 줄여도 이 함수는 그대로 두고
// PROJECTION_SCENARIOS 배열만 바꾸면 된다 - 색상 점 + 기대수익률 + 20년 후 예상자산만 보여주는 순수
// 읽기 전용 요약이며, 수정 버튼은 없다(수익률은 전부 SCENARIO_RATE_PRESETS로 자동 계산됨).
// [카드 내용 간소화 - 요청 반영] 예전엔 카드에 "15년 후/20년 후 예상자산" 금액까지 함께 보여줬으나,
// 요청에 따라 기대수익률까지만 표시하도록 줄였다 - 구체적인 예상 자산 규모는 아래 "시나리오별 일반계좌
// 그래프"/"금액 비교" 카드에서 확인할 수 있어 중복이었다.
function renderScenarioSummaryCards(scenarioData) {
  const grid = document.getElementById('scenarioSummaryCardsGrid');
  if (!grid) return;

  grid.innerHTML = scenarioData.map((s) => `
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-4 shadow-sm min-w-0 flex flex-col">
      <div class="flex items-center gap-1.5 mb-2 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${s.color}"></span>
        <!-- [Phase 27] 14px 상향 후 truncate가 걸리면 "목표배분..."까지만 남아 구분어(보수적/일반적/
             긍정적)가 사라진다 - 색 점만으로 구분하게 되므로 "색상만으로 상태를 전달하지 않는다"는
             원칙에 어긋난다. 글자를 줄이지 않고 줄바꿈을 허용한다. -->
        <span class="text-sm font-semibold leading-tight min-w-0">${escapeHtml(s.label)}</span>
      </div>
      <p class="text-sm">
        <span class="text-slate-400">기준 연간 성장률</span>
        <span class="text-sm sm:text-lg font-bold" style="color:${s.color}">${fmtNum(s.weightedAvgRate, 2)}%</span>
      </p>
    </div>`).join('');
}

// [금융자산 미래예측] 탭의 통합 비교 차트 전용: 평소에는 세부 현황(툴팁)을
// 표시하지 않다가 그래프를 클릭/터치했을 때만 3초간 보여주고 자동으로 사라지게 한다.
// [버그 수정 - 팝업마다 자동 숨김 시간이 제각각이었음] 예전엔 여기만 10초였고 다른 그래프 팝업(일별
// 손익 추이/총 평가금액 추이/자산군별 투자금액 추이/환율 추이/비중 확대)은 3초(scheduleDailyPnl
// TooltipHide)였다 - 전부 3초로 통일한다.
// 각 차트의 options.events를 'click'만 남겨 마우스 호버만으로는 툴팁이 뜨지 않게 하고, 대신
// options.onClick에서 이 함수를 호출해 3초 뒤 활성 요소를 비워 툴팁을 강제로 닫는다.
// key로 charts 레지스트리와 비교해, 그 사이 차트가 다시 그려져 이전 인스턴스가 destroy됐으면
// (예: 데이터 갱신으로 재렌더링) 파괴된 인스턴스를 건드리지 않도록 방어한다.
const tooltipAutoHideTimers = {};
function scheduleTooltipAutoHide(chart, key) {
  clearTimeout(tooltipAutoHideTimers[key]);
  tooltipAutoHideTimers[key] = setTimeout(() => {
    if (charts[key] !== chart) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  }, 3000);
}

// [3가지 시나리오 리팩토링] scenarioData: [{key,label,color,points}, ...] (PROJECTION_SCENARIOS + 각자의
// yearlyPoints) - 시나리오 수가 몇 개든 그대로 라인 하나씩 그린다. 라인이 여러 개로 늘면서 예전처럼
// 시점마다 "더 큰 쪽 위/작은 쪽 아래" 방식으로 값을 라벨로 항상 띄워두면 라인이 겹치는 구간에서
// 라벨끼리도 겹쳐 알아보기 어려워진다 - 대신 마일스톤 연도에는 점만 크게 찍어두고, 정확한 금액은 아래
// 스케줄 표와 그래프를 탭했을 때 뜨는 툴팁(3개 시나리오 값이 한 번에 표시됨)으로 확인하도록 단순화했다.
// [총자산 카드 재사용 - 파라미터화] chartKey(charts 레지스트리 키)/canvasId를 인자로 받아, "시나리오별
// 일반계좌 그래프"와 "시나리오별 총 자산 그래프" 두 카드가 이 함수 하나를 그대로 공유한다(기본값은
// 기존 일반계좌 카드 그대로라 기존 호출부는 수정 없이 동작).
function renderScenarioCompareChart(scenarioData, milestoneOffsets, chartKey = 'scenarioCompare', canvasId = 'scenarioCompareChart') {
  const textColor = chartTextColor();
  if (charts[chartKey]) charts[chartKey].destroy();

  const MILESTONE_YEARS = [0, ...milestoneOffsets];
  const labels = scenarioData[0].points.map((p) => `Y${String(CURRENT_YEAR + p.year).slice(-2)}`);
  const datasets = scenarioData.map((s) => ({
    label: s.label,
    data: s.points.map((p) => p.total),
    borderColor: s.color,
    backgroundColor: s.color,
    fill: false,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: s.points.map((p) => (MILESTONE_YEARS.includes(p.year) ? 4 : 0)),
    pointBackgroundColor: s.color
  }));

  charts[chartKey] = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels, datasets }, // X축 연도 표기: "2026년"이 아니라 "Y26" 형식(년도 뒤 2자리)으로 축약
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false }, // 한 시점에 3개 시나리오 값을 모두 툴팁으로 보여준다
      // 호버(마우스 이동)로는 반응하지 않고 클릭/터치했을 때만 툴팁이 뜨도록 이벤트를 click으로 제한한다.
      events: ['click'],
      onClick: (evt, elements, chart) => scheduleTooltipAutoHide(chart, chartKey),
      scales: {
        x: { ticks: { color: textColor, maxTicksLimit: 11 }, grid: { display: false } },
        y: { ticks: { color: textColor, callback: (v) => fmtKRWShort(v) }, grid: { color: 'rgba(148,163,184,.15)' } }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtKRWShort(ctx.raw)}` } }
      }
    }
  });
}

// 통합 비교 차트 하단의 상세 스케줄 표 - 5년 단위 시점마다 3개 시나리오의 예상 자산(명목)을 나란히
// 표기한다. rows: [{ year, values: { conservative, normal, optimistic } }, ...]
// [모바일 가로 스크롤 제거] 예전엔 "1,234,567,890원" 전체 자릿수 + 긴 시나리오명("리밸런싱 후·보수적")
// 헤더 때문에 5개 열이 375px 화면 폭을 넘어 가로 스크롤이 필요했다 - 금액을 fmtKRWShort로 축약하고
// (요청 반영: 이제 "10.21억" 형식), 헤더도 "리밸런싱 후·" 접두어를 뗀 짧은 이름만 써서 한 화면에
// 최대한 들어오게 했다(그래도 안 들어오면 표 자체가 가로 스크롤됨).
// [총자산 카드 재사용 - 파라미터화] headId/bodyId를 인자로 받아 "시나리오별 일반계좌 금액 비교"와
// "시나리오별 총자산 금액 비교" 두 카드가 이 함수 하나를 공유한다.
function renderScenarioCompareScheduleTable(rows, scenarioData, headId = 'scenarioCompareScheduleHead', bodyId = 'scenarioCompareScheduleBody') {
  const fmtEok = fmtKRWShort;
  // 이 표 헤더에서만 쓰는 짧은 이름 - "리밸런싱 후·" 접두어를 뗀다(요약 카드/차트 범례의 원래 라벨은
  // 그대로 둔다 - 그쪽은 폭 여유가 있어 줄일 필요가 없다).
  const shortLabel = (label) => label.replace('목표배분·', '');
  document.getElementById(headId).innerHTML = `
    <th class="pl-1 pr-1.5 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">시점</th>
    ${scenarioData.map((s) => `<th class="px-1 py-2 text-right font-bold" style="color:${s.color}">${escapeHtml(shortLabel(s.label))}</th>`).join('')}`;
  document.getElementById(bodyId).innerHTML = rows.map((r) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${r.year === 0 ? '현재' : `${r.year}년후`}<span class="block text-sm font-normal text-slate-400">${CURRENT_YEAR + r.year}</span></td>
      ${scenarioData.map((s) => `<td class="px-1 py-2 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">${fmtEok(r.values[s.key])}</td>`).join('')}
    </tr>`).join('');
}

// [Phase 19-P1] preserveMcResult=true면 마지막에 MC UI를 READY로 되돌리는 단계만 건너뛴다 - 나머지
// 계산/렌더링(deterministic 시나리오, 차트 등)은 평소와 완전히 동일하게 전부 수행된다. 다크모드
// 토글(js/14 darkModeBtn)처럼 "데이터는 그대로인데 차트 테마 색만 다시 그려야 하는" 호출 전용 옵션 -
// 값 계산이나 State에는 전혀 영향을 주지 않는 순수 렌더링 분기다.
function updateProjection(preserveMcResult) {
  // [Phase 3-5 Safety Layer - B3] 목표 비중 합계가 깨져 있으면(±1%p 초과) 계산 자체를 시작하지 않고
  // 배너만 보여준다 - 자동으로 비중을 재정규화하지 않는다(사용자 지시). Monte Carlo(js/16 어댑터)도
  // 정확히 같은 assessHouseholdWeightSums()를 쓰므로 두 계산 경로가 항상 같은 기준으로 막힌다.
  const weightSumIssues = assessHouseholdWeightSums();
  const blockBanner = document.getElementById('projectionSafetyBlockBanner');
  if (weightSumIssues.length > 0) {
    if (typeof renderSafetyBlockBanner === 'function') renderSafetyBlockBanner(blockBanner, weightSumIssues);
    return; // [계산 시작 전 BLOCK] 이 아래 렌더 함수들을 전혀 호출하지 않는다 - 새 숫자를 만들지 않음
  }
  if (blockBanner) blockBanner.classList.add('hidden');

  // [소유자별 독립 원금/적립금 - Option B] 예전엔 여기서 가구 합산 원금(totalValueForRebalance)과 단일
  // monthlyContribution을 미리 구해 simulateRebalancedPreset에 넘겼으나, 이제 그 함수가 owner별로
  // 자기 자신의 원금·적립금을 내부에서 직접 계산하므로(getProjectionGroupStats(owner),
  // getOwnerMonthlyContributionInputs) 여기서 미리 구할 필요가 없다.
  updateMonthlyContributionSummary();
  // [Phase 25 P1] 예전엔 여기서 DOM 입력값을 읽어 state에 되썼다 - 두 입력이 이제 draft를 가진 팝업
  // 안에 있으므로 그대로 두면 "취소했는데도 draft 값이 state로 새어 들어가는" 경로가 된다. state가
  // 단일 소스이고, 팝업의 [확인]만이 state를 바꾼다(계산 semantics는 그대로 - 같은 값을 읽는다).
  const inflationRate = num(state.projection.inflationRate);

  const milestoneOffsets = getMilestoneYearOffsets(); // [5, 10, 15, 20, 25, 30] - 항상 고정

  // ===== 3개 시나리오: 리밸런싱 후 - 보수적/일반적/긍정적 =====
  // 목표 지역/항목 비중대로 재배분했다고 가정하되, 프리셋별로 자산군/티커 기대수익률만 다르게 적용한다
  // (SCENARIO_RATE_PRESETS 참고). "일반적"은 예전 "리밸런싱 후" 시나리오와 완전히 동일한 값(사용자
  // 수동 입력 포함)을 그대로 쓴다.
  const presetResults = {};
  ['conservative', 'normal', 'optimistic'].forEach((presetKey) => {
    presetResults[presetKey] = simulateRebalancedPreset(presetKey, 20);
  });

  renderProjectionHeroSummary(presetResults, milestoneOffsets);

  // ===== 3개 시나리오 데이터 묶기 - 요약 카드 그리드/비교 차트/비교표가 전부 이 배열 하나를 순회한다 =====
  const scenarioData = PROJECTION_SCENARIOS.map((s) => {
    const result = presetResults[s.preset];
    return { ...s, points: result.yearlyPoints, weightedAvgRate: result.weightedAvgRate };
  });

  renderScenarioSummaryCards(scenarioData);
  renderScenarioCompareChart(scenarioData, milestoneOffsets);

  // 표/카드용: "현재" + 고정 5년 간격 마일스톤(5/10/15/20년 후)만 추린다. 각 시나리오의
  // point.total은 이미 위에서 "자산군(또는 지역)별 합산" 방식으로 정확히 계산된 값이므로 그대로
  // 재사용한다.
  const compareRows = [0, ...milestoneOffsets].map((y) => {
    const values = {};
    scenarioData.forEach((s) => { values[s.key] = s.points[y].total; });
    return { year: y, values };
  });
  renderScenarioCompareScheduleTable(compareRows, scenarioData);
  reapplyDetailCardAccordionHeight('generalSchedule', 'scenarioCompareScheduleAccordionBtn', 'scenarioCompareScheduleAccordionBody');

  // ===== [절세계좌 현황] 카드 =====
  renderTaxAdvantagedCard();

  // ===== [시나리오별 총자산] 일반계좌 + 절세계좌(적립 예상 팝업의 저장된 계획) + 부동산(현재가치를
  // preset별 부동산 수익률로 복리 성장, 신규 매수 없음) 통합 - "포트폴리오 구성"/미래예측 본편은 순수
  // 일반계좌 기준으로 유지하되, 이 카드만 가구 전체 총자산 관점을 별도로 보여준다(요청 반영).
  // [개별 적립 기간 지원 - 요청 반영] 신랑/와이프가 서로 다른 적립 기간을 쓸 수 있게 되면서, "합산
  // 시작잔액 + 합산 월적립액"을 하나의 곡선으로 계산하는 이전 방식은 더 이상 정확하지 않다(예: 신랑
  // 10년·와이프 15년이면 11~15년째는 와이프만 적립 중이어야 한다) - 대신 소유자별로 각자의 적립 기간을
  // 반영한 연도별 포인트 배열을 독립적으로 계산한 뒤, 연도(인덱스)별로 두 배열을 합산한다.
  const realEstateTotalValue = state.assets.filter((a) => a.category === '부동산').reduce((s, a) => s + calcRow(a).curAmount, 0);

  const totalScenarioData = PROJECTION_SCENARIOS.map((s) => {
    const generalPoints = presetResults[s.preset].yearlyPoints;
    const ownerPointsList = TAX_ADVANTAGED_OWNERS.map((o) => simulateTaxAdvantagedOwnerYearlyPoints(o, s.preset, 20));
    // [버그 수정 - "수익률 관리" 오버라이드 미반영] 시스템 기본값을 직접 참조하던 것을 getReferenceRate로
    // 바꿔, 위 SCENARIO_RATE_BASE_ROWS에 복원한 "부동산" 행을 사용자가 수정하면 여기도 그대로 반영된다.
    const realEstateRate = getReferenceRate(s.preset, '부동산');
    const points = generalPoints.map((p, idx) => ({
      year: p.year,
      total: p.total
        + ownerPointsList.reduce((sum, pts) => sum + pts[idx].total, 0)
        + computeFutureValue(realEstateTotalValue, realEstateRate, p.year, 0)
    }));
    return { ...s, points };
  });
  renderScenarioCompareChart(totalScenarioData, milestoneOffsets, 'totalAssetCompare', 'totalAssetCompareChart');
  const totalCompareRows = [0, ...milestoneOffsets].map((y) => {
    const values = {};
    totalScenarioData.forEach((s) => { values[s.key] = s.points[y].total; });
    return { year: y, values };
  });
  renderScenarioCompareScheduleTable(totalCompareRows, totalScenarioData, 'totalAssetCompareScheduleHead', 'totalAssetCompareScheduleBody');
  reapplyDetailCardAccordionHeight('totalSchedule', 'totalAssetCompareScheduleAccordionBtn', 'totalAssetCompareScheduleAccordionBody');
  updateScenarioViewToggleVisibility(); // [Phase 24-B STEP 5]

  // ===== [Part 5] Monte Carlo 미래자산 예측 v2 (Phase 2-3, js/19) =====
  // [자동 실행 제거] 예전엔 이 렌더가 호출될 때마다(탭 진입/데이터 변경마다) renderMonteCarloSection()이
  // 자동으로 스칼라 시뮬레이션을 돌렸다 - 새 엔진은 Worker로 수 초~수십 초 걸릴 수 있어 자동 실행하지
  // 않고 사용자가 [Monte Carlo 실행] 버튼을 눌러야 시작된다(js/19). 여기서는 화면을 READY 상태로
  // 되돌리기만 한다(직전 실행 중이던 결과가 다른 탭/데이터 상태에 남아 혼동을 주지 않도록).
  // [Phase 19-P1] 단, preserveMcResult=true(다크모드 토글 전용 호출)면 이 리셋을 건너뛴다 - MC 결과
  // 표시는 전부 Tailwind dark: 클래스 기반이라(캔버스/JS 색상 계산 없음) html에 이미 토글된 dark 클래스만
  // 으로 자동으로 재도색되므로, 기존 결과 DOM을 그대로 두는 것만으로 아무 재계산 없이 보존된다.
  if (!preserveMcResult && typeof resetMonteCarloUiToReady === 'function') resetMonteCarloUiToReady();
}

/* -------------------------------------------------------------------------
 * [Part 5] 합산 포트폴리오 몬테카를로 시뮬레이션
 *    - [목표 비중 기준으로 전환 - 요청 반영] 원금(PV)만 "지금 실제로 들고 있는 총 평가금액"을 그대로
 *      쓰고, 미래 성장 동력인 기대수익률(μ)과 변동성(σ)은 둘 다 "포트폴리오 구성" 탭에서 설정한
 *      목표 비중(Targets)을 기준으로 계산한다 - 오늘 특정 종목에 편중돼 있어도(예: 한 종목이 89%),
 *      "앞으로 목표대로 분산 투자·리밸런싱해 나간다"는 가정 하에 장기 프로젝션(P10/P50/P90)을 만드는
 *      것이 이 시뮬레이션의 목적에 맞기 때문이다.
 *    - μ는 이미 "리밸런싱 후" 시나리오가 쓰는 computeTargetWeightedAvgRate(js/05 위쪽, owner별 목표
 *      비중을 그 owner의 현재 원금 비중으로 가중평균)를 그대로 재사용한다 - 별도 계산을 새로 만들지
 *      않아 "포트폴리오 구성 탭에서 본 기대수익률"과 항상 같은 숫자를 본다.
 *    - σ는 이 섹션에서 새로 만든다(computeTargetPortfolioVolatilityPct) - 목표 항목(티커)마다 실측
 *      과거 1년 일별 수익률(getCachedDailyCloses, js/09와 캐시 공유)을 목표 비중으로 가중합해 "포트폴리오
 *      일별 수익률 시계열"을 만들고, 거기에 연환산 변동성 공식(computeAnnualizedVolatilityPct, js/09)을
 *      적용한다 - 종목 하나가 아니라 목표에 들어있는 여러 종목/지수의 실제 상관관계가 그대로 반영되므로,
 *      오늘 한 종목에 쏠려 있어도 목표가 분산돼 있으면 분산 효과(공분산 구조)가 살아난다. 채권/현금
 *      목표는 변동성을 0으로 근사한다(이 앱 전반에서 채권/현금을 NON_TRADABLE_CATEGORIES로 시세 조회
 *      대상에서 빼는 것과 같은 단순화).
 * ---------------------------------------------------------------------- */
// 가구 전체(일반계좌+절세계좌, 부동산 제외) 총 평가금액 - 몬테카를로 원금(PV)은 목표 비중과 무관하게
// 항상 "지금 실제로 들고 있는 금액"을 그대로 쓴다(요청 사양).
// [Phase 24-B - Owner MC] ownerFilter를 주면 그 owner 소유 자산만(isAssetIncludedForOwner, js/04 -
// 기존 Deterministic owner별 화면이 이미 쓰는 것과 동일한 필터) 합산한다 - '공동' 자산은 어느 단일
// owner 필터에도 포함되지 않는다(기존 관례 그대로 재사용, 새 규칙 아님). ownerFilter 생략 시 기존과
// 완전히 동일(bit-identical).
function computeHouseholdMonteCarloPV(ownerFilter) {
  return state.assets.filter((a) => a.category !== '부동산' && isAssetIncludedForOwner(a, ownerFilter)).reduce((s, a) => s + calcRow(a).curAmount, 0);
}

// 소유자 한 명의 목표 비중(전체 포트폴리오 대비 0~1, 국내/해외 split × 지역 내 항목 비중)을
// "종목(티커)/자산군 캐치올" 단위로 펼쳐서 Map으로 반환한다 - computePositionRoleBreakdown의
// computeOwnerTargetRoleWeights(js/04)와 같은 원리이지만, 여기서는 role이 아니라 실제 수익률/변동성
// 계산에 쓸 수 있도록 티커·카테고리 정보 자체를 담아 반환한다. selectedStocks까지 놓치지 않도록 펼쳐진
// 목록(expandRebalanceTargetsForComputation, js/04)을 쓴다.
function computeOwnerTargetInstrumentWeights(owner) {
  const weights = new Map();
  const domestic = state.rebalance[owner].domestic;
  ['국내', '해외'].forEach((region) => {
    const regionWeight = num(domestic[region]) / 100;
    expandRebalanceTargetsForComputation(owner, region).forEach((t) => {
      const rowWeight = regionWeight * (num(t.pct) / 100);
      if (rowWeight <= 0) return;
      // [namedHolding 키 충돌 버그 수정] namedHolding은 t.category가 없으므로, 예전엔 이 항목들이
      // 전부 같은 키(C:지역:undefined)로 뭉개져 같은 지역의 "현금"과 "국채"처럼 서로 다른 namedHolding
      // 목표 둘 이상이 하나로 합산돼버렸다(비중은 합쳐지고 이름은 먼저 들어온 쪽만 남음) - 티커처럼
      // name까지 키에 포함해 서로 다른 항목으로 구분한다.
      const key = t.type === 'ticker' ? `T:${sanitizeTicker(t.ticker).yahooTicker}`
        : t.type === 'namedHolding' ? `N:${region}:${t.name}`
        : `C:${region}:${t.category}`;
      // label: [Monte Carlo Engine v2 어댑터 지원] getTargetProjectionRate(target, presetKey, region)가
      // 티커형 목표의 사용자 정의 오버라이드/키워드 매칭에 target.label을 쓴다(js/05:379) - 이 필드가
      // 없으면 어댑터가 이 Map에서 원본 t 없이 뽑아낸 값만으로는 그 매칭을 재현할 수 없었다.
      // [Phase 28-F] owner를 함께 실어 어댑터(js/16)가 만드는 pseudoTarget이 findRateMatchOverrideForTarget에서
      // 소유자별 보유 자산의 대표매칭키를 우선 조회할 수 있게 한다(state schema 변경 아님 - 파생 Map 필드).
      const prev = weights.get(key) || { weight: 0, kind: t.type, ticker: t.ticker, category: t.category, name: t.name, label: t.label, region, owner };
      prev.weight += rowWeight;
      weights.set(key, prev);
    });
  });
  return weights;
}
// [Phase 3-5 Safety Layer - B3] 목표 비중 합계 판정 - state.rebalance[owner].targets[region] 원본을
// 직접 검사한다. computeOwnerTargetInstrumentWeights/computeHouseholdTargetInstrumentWeights(Monte
// Carlo가 쓰는 파생 맵)와 expandRebalanceTargetsForComputation(Future Projection의
// simulateRebalancedPreset이 쓰는 함수, js/04)이 전부 이 원본 배열을 읽으므로, 여기서 검사하면 두
// 계산 경로 모두에 동일한 기준이 적용된다(조건부승인 항목 14 - Deterministic ↔ Monte Carlo 일관성).
// 목표가 하나도 없는 owner/region은 건너뛴다(미설정은 "비중 합계 오류"와 다른 별개 상태).
// [B3 후속수정 - 개별 음수 비중] 합계만 검사하면 [-20,120](합=100)처럼 개별 항목의 음수가 tolerance를
// 통과해 숨을 수 있다(sanity check로 실측 확인됨: MC 경로는 이런 음수 항목을 조용히 제외하고 Deterministic
// 경로는 그대로 음수 가중치로 포함시켜 서로 다른 결과를 냈다) - 그래서 합계 검사와 별개로 각 항목의
// pct 부호도 반드시 함께 검사한다. 이 함수 하나가 js/05(updateProjection)/js/16(어댑터) 두 호출부의
// 유일한 진입점이므로, 여기 한 곳만 고치면 두 계산 경로 모두에 즉시 적용된다.
// [Phase 24-B - Owner MC] ownerFilter를 주면 그 owner 하나만 검사한다(신랑만 MC를 돌릴 때 와이프의
// 목표비중 오류가 신랑 결과를 BLOCK하면 안 되므로) - 생략 시 기존과 완전히 동일(두 owner 모두 검사).
function assessHouseholdWeightSums(ownerFilter) {
  const regionSums = [];
  const individualItems = [];
  const ownersToCheck = ownerFilter ? [ownerFilter] : REBALANCE_OWNERS;
  ownersToCheck.forEach((owner) => {
    ['국내', '해외'].forEach((region) => {
      const targets = (state.rebalance[owner].targets && state.rebalance[owner].targets[region]) || [];
      if (targets.length === 0) return;
      const sumPct = targets.reduce((s, t) => s + num(t.pct), 0);
      regionSums.push({ owner, region, sumPct });
      targets.forEach((t) => {
        individualItems.push({ owner, region, label: t.label || t.name || t.ticker || t.category || '', pct: num(t.pct) });
      });
    });
  });
  return assessWeightSums(regionSums).concat(assessIndividualWeightSigns(individualItems));
}
// 가구 전체 목표 비중 - computeTargetWeightedAvgRate(위쪽)와 동일한 가중 방식(각 owner의 목표 비중을
// 그 owner의 현재 원금 비중으로 가중평균)으로 두 owner의 목표를 하나로 합친다. μ 계산과 같은 가중
// 기준을 쓰므로, "목표 비중 기준"이라는 말이 μ와 σ 양쪽에서 일관되게 같은 의미를 갖는다.
// [F-1 수정 - Phase 10 후속] 가구 전체(두 owner 모두) 현재 원금이 0원이면(신규 사용자), "현재 원금
// 비중"이라는 가중 기준 자체가 존재하지 않는다(0/0) - 이 경우에만 owner별 "현재 원금" 대신 owner별
// "월 적립금 총액"(getOwnerMonthlyContributionInputs - Deterministic이 이미 쓰는 것과 동일한 함수,
// 새 데이터 없음)으로 가중치를 대체한다. 앞으로 실제로 투입될 돈의 크기가 그 owner의 목표 비중이
// 결합 결과에 얼마나 반영돼야 하는지의 가장 자연스러운 대체 기준이기 때문이다(임의의 50:50이나
// 새 asset 생성이 아니다). 두 owner 모두 월 적립금까지 0이면(진짜로 투입될 돈이 전혀 없는 경우)
// merged가 비어있는 채로 남고, 이는 기존 검증 흐름(validateMonteCarloInput의 "instruments가
// 비어있습니다")이 그대로 처리한다 - 새 규칙을 만들지 않는다.
// [회귀 방지] grandTotal(현재 원금 합계) > 0인 기존 정상 케이스는 이 함수의 계산 순서/공식이 전혀
// 바뀌지 않아 완전히 bit-identical하다 - 아래 두 owner의 ownerTotal을 먼저 구하는 것은 계산 방식이
// 아니라 "0/0 여부를 먼저 판정하기 위해 조회 순서만 앞당긴 것"뿐이다(호출 결과 자체는 그대로).
// [Phase 24-B - Owner MC] ownerFilter를 주면 두 owner를 가중 병합하지 않고 그 owner 자신의 목표비중
// (computeOwnerTargetInstrumentWeights)을 그대로 반환한다 - 한 owner의 목표비중은 이미 그 자체로
// 정규화돼 있어(국내/해외 split 합 100% × 각 지역 targets pct 합 100%) 별도 가중 병합·재정규화가
// 필요 없다(새 계산식이 아니라 기존 함수를 그대로 재사용). ownerFilter 생략 시 기존과 완전히 동일
// (bit-identical) - 아래 두 owner 가중 병합 로직은 전혀 건드리지 않았다.
function computeHouseholdTargetInstrumentWeights(ownerFilter) {
  if (ownerFilter) return computeOwnerTargetInstrumentWeights(ownerFilter);
  const ownerTotals = {};
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((owner) => {
    ownerTotals[owner] = getProjectionGroupTotal(getProjectionGroupStats(owner));
    grandTotal += ownerTotals[owner];
  });

  const useContributionFallback = grandTotal <= 0;
  const weightBasisByOwner = {};
  let normalizeTotal = grandTotal;
  if (useContributionFallback) {
    normalizeTotal = 0;
    REBALANCE_OWNERS.forEach((owner) => {
      weightBasisByOwner[owner] = num(getOwnerMonthlyContributionInputs(owner).monthlyContribution);
      normalizeTotal += weightBasisByOwner[owner];
    });
  } else {
    REBALANCE_OWNERS.forEach((owner) => { weightBasisByOwner[owner] = ownerTotals[owner]; });
  }

  const merged = new Map();
  REBALANCE_OWNERS.forEach((owner) => {
    const weightBasis = weightBasisByOwner[owner];
    if (weightBasis <= 0) return;
    computeOwnerTargetInstrumentWeights(owner).forEach((v, key) => {
      const prev = merged.get(key) || { ...v, weight: 0 };
      prev.weight += v.weight * weightBasis;
      merged.set(key, prev);
    });
  });
  if (normalizeTotal > 0) merged.forEach((v) => { v.weight = v.weight / normalizeTotal; });
  return merged;
}
// 목표 비중 Map을 실제 일별 수익률 시계열과 짝지어 "포트폴리오 목표 비중 기준" 연환산 변동성(%)을
// 계산한다. 티커는 그 종목의 캐시된 종가(getCachedDailyCloses, js/09 - RISK 카드와 캐시를 공유해
// 중복 조회하지 않음)를 쓰고, '주식' 캐치올처럼 특정 종목이 없는 항목은 지역 대표지수(KOSPI/S&P500)로
// 대체한다(μ 계산의 getTargetProjectionRate 지역 폴백 규칙과 동일). 채권/현금은 수익률 시계열 자체를
// 만들지 않는다 - 그 비중만큼 가중합에서 빠지므로 자연히 "변동성 0인 자산이 섞여 전체를 희석"하는
// 효과가 그대로 반영된다(별도 희석 계수를 곱할 필요가 없다). 가격 이력이 부족한 항목도 같은 방식으로
// 안전하게 제외된다(예외 없이 계속 진행).
// [Monte Carlo Engine v2 어댑터 지원 - 추출] 예전엔 이 정보(자산별 개별 returns/dates)를 모아서
// 바로 포트폴리오 하나로 뭉개버렸는데(가중합산 후 스칼라 변동성 하나만 반환), js/16 어댑터가 종목별
// 변동성/날짜정렬 상관관계를 계산하려면 뭉개기 "전" 단계의 개별 시계열이 필요하다. 이 함수가 그 개별
// 시계열(키 포함, computeHouseholdTargetInstrumentWeights와 동일한 T:/N:/C: 키 체계)을 그대로 반환하고,
// 아래 computeTargetPortfolioVolatilityPct()는 이 함수를 호출해 가중합산만 하는 얇은 wrapper로 남아
// 기존 호출부(요약 카드의 σ 텍스트 등)의 동작·반환값은 전혀 바뀌지 않는다.
// [Phase 24-B - Owner MC] ownerFilter는 그대로 computeHouseholdTargetInstrumentWeights에 전달만
// 한다 - 생략 시 기존과 완전히 동일.
async function buildHouseholdInstrumentReturnSeries(ownerFilter) {
  const weightsMap = computeHouseholdTargetInstrumentWeights(ownerFilter);
  const withReturns = [];
  const tasks = [];
  weightsMap.forEach((v, key) => {
    if (v.kind === 'ticker') {
      tasks.push((async () => {
        const yahoo = sanitizeTicker(v.ticker).yahooTicker;
        const data = await getCachedDailyCloses(yahoo);
        if (data && data.closes.length >= 10) {
          withReturns.push({ key, weight: v.weight, returns: dailyReturnsFromCloses(data.closes), dates: data.dates || null, closes: data.closes });
        }
      })());
      return;
    }
    // [namedHolding 변동성 버그 수정 - 요청 반영] namedHolding은 category 필드가 없어서, 예전엔 이
    // 아래 채권/현금 판정에 걸리지 못하고 전부 "종목명 매핑 없는 일반 종목"처럼 지역 지수 변동성을
    // 그대로 적용받았다(자산 등록 화면과 동일한 BOND_KEYWORDS/CASH_KEYWORDS 이름 판정, js/01
    // classifyCategory 재사용) - "현금"/"국채"라는 이름의 목표가 실제로는 KOSPI/S&P500 수준
    // 변동성으로 잡혀 σ가 부풀려지던 원인이다.
    const effectiveCategory = v.kind === 'namedHolding' ? classifyCategory('', v.name) : v.category;
    if (effectiveCategory === '채권' || effectiveCategory === '현금') return; // 변동성 0으로 근사 - 시계열을 만들지 않음
    const indexTicker = v.region === '해외' ? INDEX_TICKERS.SP500 : INDEX_TICKERS.KOSPI;
    tasks.push((async () => {
      const data = await getCachedDailyCloses(indexTicker);
      if (data && data.closes.length >= 10) {
        withReturns.push({ key, weight: v.weight, returns: dailyReturnsFromCloses(data.closes), dates: data.dates || null, closes: data.closes });
      }
    })());
  });
  await Promise.all(tasks);
  return withReturns;
}

// 목표 비중 Map을 실제 일별 수익률 시계열과 짝지어 "포트폴리오 목표 비중 기준" 연환산 변동성(%)을
// 계산한다. 티커는 그 종목의 캐시된 종가(getCachedDailyCloses, js/09 - RISK 카드와 캐시를 공유해
// 중복 조회하지 않음)를 쓰고, '주식' 캐치올처럼 특정 종목이 없는 항목은 지역 대표지수(KOSPI/S&P500)로
// 대체한다(μ 계산의 getTargetProjectionRate 지역 폴백 규칙과 동일). 채권/현금은 수익률 시계열 자체를
// 만들지 않는다 - 그 비중만큼 가중합에서 빠지므로 자연히 "변동성 0인 자산이 섞여 전체를 희석"하는
// 효과가 그대로 반영된다(별도 희석 계수를 곱할 필요가 없다). 가격 이력이 부족한 항목도 같은 방식으로
// 안전하게 제외된다(예외 없이 계속 진행).
async function computeTargetPortfolioVolatilityPct() {
  const withReturns = await buildHouseholdInstrumentReturnSeries();
  if (withReturns.length === 0) return 0;
  const minLen = Math.min(...withReturns.map((h) => h.returns.length));
  if (minLen < 10) return 0;
  const portfolioReturns = [];
  for (let i = 1; i <= minLen; i++) {
    let sum = 0;
    withReturns.forEach((h) => { sum += h.returns[h.returns.length - i] * h.weight; });
    portfolioReturns.unshift(sum);
  }
  return computeAnnualizedVolatilityPct(portfolioReturns) || 0;
}

// [Phase 22 STEP 1 - legacy MC 코드 제거] 이 자리에 있던 구(舊) 스칼라 단일자산 GBM Monte Carlo
// 파이프라인(createSeededRandom/runMonteCarloSimulation/renderMonteCarloSection/
// renderMonteCarloChart/MONTE_CARLO_DISPLAY_ORDER, 약 160줄)은 js/15~19의 Worker 기반 다자산 상관
// Monte Carlo 엔진으로 완전히 대체된 뒤에도 삭제되지 않고 남아있었다. Phase 21 감사에서 이 블록이
// 참조하는 DOM id 7개(monteCarloLoadingNote/monteCarloContent/monteCarloSigmaText/monteCarloMuText/
// monteCarloPvText/monteCarloScheduleBody/monteCarloChart)가 index.html 어디에도 존재하지 않고,
// 유일한 진입점 renderMonteCarloSection()도 실제로 호출하는 곳이 전혀 없음(주석 1곳에서만 언급)을
// 확인해 완전히 도달 불가능한 코드임을 검증한 뒤 삭제했다 - 계산/State/Safety/현재 MC 엔진에는
// 전혀 영향 없음(js/15의 독립적인 createSeededRandom 사본만 계속 쓰인다).
/* -------------------------------------------------------------------------
 * [Phase 25 P1 - 미래예측 가정(인플레이션율) draft] 예전엔 두 입력이 타이핑할 때마다 곧바로 state를
 *    바꾸고 persistProjection()까지 실행해서 되돌릴 수 없었다. 이제 인플레이션율은 이 팝업의
 *    draft에서만 편집되고, 매년 투자금 증가율은 [적립금 설정] 팝업의 기존 draft 계약을 그대로
 *    물려받는다(투자계획의 일부이므로 - Phase 25 P2).
 * ---------------------------------------------------------------------- */
let projectionAssumptionsDraft = null;
// 화면에 항상 보이는 요약 텍스트 - 팝업을 열지 않아도 현재 가정값을 알 수 있어야 한다.
function updateProjectionAssumptionsSummary() {
  const el = document.getElementById('projectionInflationSummary');
  if (el) el.textContent = `${fmtNum(num(state.projection.inflationRate), 1)}%`;
}
function openProjectionAssumptionsModal() {
  projectionAssumptionsDraft = { inflationRate: num(state.projection.inflationRate) };
  document.getElementById('inflationRateInput').value = projectionAssumptionsDraft.inflationRate;
  document.getElementById('projectionAssumptionsModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}
function closeProjectionAssumptionsModal(viaBackButton) {
  projectionAssumptionsDraft = null; // [취소 계약] state/localStorage/화면 결과 모두 그대로다.
  document.getElementById('projectionAssumptionsModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('inflationRateInput').addEventListener('input', (e) => {
  if (!projectionAssumptionsDraft) return;
  projectionAssumptionsDraft.inflationRate = num(e.target.value);
});
document.getElementById('openProjectionAssumptionsBtn').addEventListener('click', openProjectionAssumptionsModal);
// [Phase 25 P3] 목표비중은 Portfolio에 그대로 둔다 - 여기서는 그 화면으로 이동만 시킨다(기존
// 서브탭 전환 버튼을 그대로 클릭해 재사용하므로 새 라우팅 로직을 만들지 않는다).
document.getElementById('goToRebalanceTargetBtn').addEventListener('click', () => {
  const btn = document.querySelector('[data-subtab="target"]');
  if (btn) { btn.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.getElementById('closeProjectionAssumptionsModalBtn').addEventListener('click', () => closeProjectionAssumptionsModal(false));
document.getElementById('cancelProjectionAssumptionsModalBtn').addEventListener('click', () => closeProjectionAssumptionsModal(false));
document.getElementById('projectionAssumptionsModal').addEventListener('click', (e) => {
  if (e.target.id === 'projectionAssumptionsModal') closeProjectionAssumptionsModal(false);
});
document.getElementById('saveProjectionAssumptionsModalBtn').addEventListener('click', () => {
  if (!projectionAssumptionsDraft) return;
  // [validation] 음수 인플레이션(디플레이션)은 이 화면의 일반 사용자 입력 정책상 막는다 - 예전
  // min="0" + clamp와 같은 기준이되, 조용히 보정하지 않고 저장 자체를 막는다.
  const v = num(projectionAssumptionsDraft.inflationRate);
  if (!(v >= 0)) { alert('인플레이션율은 0 이상이어야 합니다.'); return; }
  state.projection.inflationRate = v;
  projectionAssumptionsDraft = null;
  persistProjection();
  closeProjectionAssumptionsModal(false);
  updateProjectionAssumptionsSummary(); // updateProjection()은 요약 배지를 갱신하지 않는다(renderProjection 소관)
  updateProjection();
  showToast('미래예측 가정을 저장했습니다.', 'success');
});

/* -------------------------------------------------------------------------
 * 10-3-2-1. [월적립금 설정 모달] 월 적립금이 특정 종목에 직접 배분되도록 사용자가 지정한다 - "포트폴리오
 *    구성" 탭의 목표 비중(리밸런싱용)과는 완전히 별개의 설정이다. scenarioRateManagerModal과 동일한
 *    draft(초안) 패턴: monthlyContributionAllocationDraft에서만 수정하다가 [저장]을 눌러야
 *    state.projection.monthlyContributionAllocation에 커밋된다.
 *    배분되지 않은 나머지 비중(100% - 배분 합계)은 simulateMonthlyContributionGrowth()가 기존처럼
 *    "포트폴리오 구성" 탭의 국내/해외 목표 비중대로 계산한다 - 아무것도 배분하지 않으면(빈 배열) 이전
 *    동작과 완전히 동일하다(하위 호환).
 * ---------------------------------------------------------------------- */
// [소유자별 독립 - Option B] owner('신랑'/'와이프')별로 독립된 draft를 갖는다. 두 owner 모두
// total===0 상태로 처음 열면(한 번도 owner별로 설정한 적 없음) 기존 단일 값을 "신랑" 초안에만 시작점으로
// 옮겨 보여준다 - [저장]을 누르기 전까지는 state에 전혀 반영되지 않으므로 어느 쪽에 몰아 보여주든 계산
// 결과에는 영향이 없다(하위호환 폴백은 getOwnerMonthlyContributionInputs가 total===0 여부로만 판단).
// [적립기간 null=제한없음 - 요청 반영] js/01 normalizeMonthlyContributionByOwnerEntry와 동일한 규약
// (null=제한없음, 0을 포함한 숫자=사용자가 실제로 설정한 기간)을 이 draft 객체에도 그대로 유지한다 -
// 예전엔 여기서도 "값이 없으면 15"로 채웠는데, 그러면 사용자가 기간 칸을 전혀 건드리지 않고 저장만
// 눌러도 15가 "실제로 설정한 값"인 것처럼 저장되어 버린다(기존 사용자 결과 보존 원칙 위반).
let monthlyContributionByOwnerDraft = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };

let monthlyContributionGrowthDraft = 0;
document.getElementById('contributionGrowthRateInput').addEventListener('input', (e) => {
  monthlyContributionGrowthDraft = Math.max(0, num(e.target.value));
});
function openMonthlyContributionAllocationModal() {
  const byOwner = state.projection.monthlyContributionByOwner || {};
  const bothUnset = REBALANCE_OWNERS.every((o) => !(byOwner[o] && num(byOwner[o].total) > 0));
  REBALANCE_OWNERS.forEach((owner) => {
    const saved = byOwner[owner];
    // [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 배분 항목에 role이 없어도, 자산관리/거래내역 등
    // 다른 화면에 이미 등록된 역할이 있으면 그 값을 이어받는다.
    const withRoleFallback = (it) => ({ ...it, role: it.role || getTickerRole(it.ticker, it.label) });
    if (bothUnset) {
      monthlyContributionByOwnerDraft[owner] = owner === '신랑'
        ? { total: num(state.projection.monthlyContribution), years: null, allocation: state.projection.monthlyContributionAllocation.map(withRoleFallback) }
        : { total: 0, years: null, allocation: [] };
    } else {
      const savedYears = (saved && saved.years !== null && saved.years !== undefined) ? num(saved.years) : null;
      monthlyContributionByOwnerDraft[owner] = { total: num(saved && saved.total), years: savedYears, allocation: ((saved && saved.allocation) || []).map(withRoleFallback) };
    }
    const suffix = rebalanceOwnerSuffix(owner);
    document.getElementById('monthlyContributionTotalInput' + suffix).value = formatInputNumber(monthlyContributionByOwnerDraft[owner].total || '');
    // years===null(제한없음)이면 입력칸을 빈 값으로 보여준다(placeholder="15"가 안내 문구 역할).
    document.getElementById('monthlyContributionYearsInput' + suffix).value = monthlyContributionByOwnerDraft[owner].years === null ? '' : monthlyContributionByOwnerDraft[owner].years;
    const form = document.getElementById('monthlyContributionAllocationAddForm' + suffix);
    form.classList.add('hidden');
    form.innerHTML = '';
    renderMonthlyContributionAllocationList(owner);
  });
  // [Phase 25 P2] 매년 투자금 증가율도 이 팝업의 draft에 함께 담는다 - "매달 얼마 / 몇 년 /
  // 매년 얼마나 늘릴지"가 하나의 투자계획이기 때문이다. 취소 계약도 자동으로 함께 적용된다.
  monthlyContributionGrowthDraft = num(state.projection.contributionGrowthRate);
  document.getElementById('contributionGrowthRateInput').value = monthlyContributionGrowthDraft;
  document.getElementById('monthlyContributionAllocationModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}
function closeMonthlyContributionAllocationModal(viaBackButton) {
  document.getElementById('monthlyContributionAllocationModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('openMonthlyContributionAllocationBtn').addEventListener('click', openMonthlyContributionAllocationModal);
document.getElementById('closeMonthlyContributionAllocationModalBtn').addEventListener('click', () => closeMonthlyContributionAllocationModal(false));
document.getElementById('cancelMonthlyContributionAllocationModalBtn').addEventListener('click', () => closeMonthlyContributionAllocationModal(false));
document.getElementById('monthlyContributionAllocationModal').addEventListener('click', (e) => {
  if (e.target.id === 'monthlyContributionAllocationModal') closeMonthlyContributionAllocationModal(false);
});

function renderMonthlyContributionAllocationList(owner) {
  const suffix = rebalanceOwnerSuffix(owner);
  const draft = monthlyContributionByOwnerDraft[owner];
  const container = document.getElementById('monthlyContributionAllocationList' + suffix);
  if (draft.allocation.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-2">아직 배분된 종목이 없습니다 - 월 적립금 전액이 ${escapeHtml(owner)}의 국내/해외 목표 비중대로 계산됩니다.</p>`;
  } else {
    // [미보유 종목 포지션 태깅 - 요청 반영] 배분 항목 자체(state.projection, state.assets와 무관)에
    // 역할을 저장한다 - 실제 보유 여부와 상관없이 "이 적립 계획은 어떤 성격이다"를 기록해 둘 수 있다.
    container.innerHTML = draft.allocation.map((row, idx) => {
      const roleOptionsHtml = assetRoleSelectOptionsHtml(row.role, '역할 미지정');
      return `
    <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
      <div class="flex items-center gap-1.5">
        <span class="flex-1 min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
        <div class="flex items-center gap-1 shrink-0">
          <input type="number" step="0.1" min="0" max="100" value="${row.pct}" data-alloc-idx="${idx}"
            class="monthly-alloc-input w-16 text-sm font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-sm text-slate-400">%</span>
          <button type="button" class="monthly-alloc-remove-btn w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400" data-alloc-idx="${idx}" title="삭제"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </div>
      <select data-alloc-role-idx="${idx}" class="monthly-alloc-role-select mt-1.5 w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none">${roleOptionsHtml}</select>
    </div>`;
    }).join('');
  }
  const sumPct = draft.allocation.reduce((s, r) => s + num(r.pct), 0);
  const remainderPct = Math.max(0, 100 - sumPct);
  document.getElementById('monthlyContributionAllocationSumHint' + suffix).textContent = `합계 ${fmtNum(sumPct, 1)}%`;
  document.getElementById('monthlyContributionAllocationRemainderHint' + suffix).textContent = `${fmtNum(remainderPct, 1)}%`;
  lucide.createIcons();
}

REBALANCE_OWNERS.forEach((owner) => {
  const suffix = rebalanceOwnerSuffix(owner);
  // [천단위 콤마 자동 포맷팅 - 요청 반영] "적립금 설정" 월 적립 총액 입력창.
  attachThousandsInputFormatting(document.getElementById('monthlyContributionTotalInput' + suffix));
  document.getElementById('monthlyContributionTotalInput' + suffix).addEventListener('input', (e) => {
    monthlyContributionByOwnerDraft[owner].total = num(e.target.value);
  });
  document.getElementById('monthlyContributionYearsInput' + suffix).addEventListener('input', (e) => {
    // 빈 값으로 지우면 "제한 없음"(null)으로 되돌아간다 - num('')===0이라 그냥 넘기면 "0년"(신규 납입
    // 즉시 중단)이 되어버려 사용자 의도(그냥 비워서 무제한으로 두려는 것)와 달라진다.
    monthlyContributionByOwnerDraft[owner].years = e.target.value === '' ? null : num(e.target.value);
  });
  document.getElementById('monthlyContributionAllocationList' + suffix).addEventListener('input', (e) => {
    const idx = e.target.dataset.allocIdx;
    if (idx === undefined) return;
    monthlyContributionByOwnerDraft[owner].allocation[Number(idx)].pct = num(e.target.value);
    const draft = monthlyContributionByOwnerDraft[owner];
    const sumPct = draft.allocation.reduce((s, r) => s + num(r.pct), 0);
    document.getElementById('monthlyContributionAllocationSumHint' + suffix).textContent = `합계 ${fmtNum(sumPct, 1)}%`;
    document.getElementById('monthlyContributionAllocationRemainderHint' + suffix).textContent = `${fmtNum(Math.max(0, 100 - sumPct), 1)}%`;
  });
  document.getElementById('monthlyContributionAllocationList' + suffix).addEventListener('click', (e) => {
    const btn = e.target.closest('.monthly-alloc-remove-btn');
    if (!btn) return;
    monthlyContributionByOwnerDraft[owner].allocation.splice(Number(btn.dataset.allocIdx), 1);
    renderMonthlyContributionAllocationList(owner);
  });
  document.getElementById('monthlyContributionAllocationList' + suffix).addEventListener('change', (e) => {
    const select = e.target.closest('.monthly-alloc-role-select');
    if (!select) return;
    monthlyContributionByOwnerDraft[owner].allocation[Number(select.dataset.allocRoleIdx)].role = parseAssetRoleInput(select.value);
  });
});

// [종목 검색 자동완성] scenarioRateManagerModal의 신규 종목 추가 폼과 동일한 패턴 - searchStockCandidates
// (js/04, 보유종목 로컬 검색 + Yahoo Finance 검색 API)를 그대로 재사용한다. owner별로 독립된
// 디바운스/요청순번 상태를 갖는다(두 카드가 동시에 열려 있으므로 전역 단일 변수는 서로 경합한다).
const monthlyAllocSearchState = { '신랑': { timer: null, seq: 0 }, '와이프': { timer: null, seq: 0 } };

function triggerMonthlyAllocSearch(owner, query) {
  const suffix = rebalanceOwnerSuffix(owner);
  const st = monthlyAllocSearchState[owner];
  const container = document.getElementById('newMonthlyAllocSearchResults' + suffix);
  clearTimeout(st.timer);
  if (!query) { container.classList.add('hidden'); container.innerHTML = ''; return; }
  container.classList.remove('hidden');
  container.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">검색 중...</p>';
  st.timer = setTimeout(async () => {
    const seq = ++st.seq;
    const results = await searchStockCandidates(query);
    renderMonthlyAllocSearchResults(owner, results, seq);
  }, 350);
}
function renderMonthlyAllocSearchResults(owner, results, seq) {
  const suffix = rebalanceOwnerSuffix(owner);
  if (seq !== monthlyAllocSearchState[owner].seq) return;
  const container = document.getElementById('newMonthlyAllocSearchResults' + suffix);
  if (!container) return;
  if (results.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center py-2">검색 결과가 없습니다</p>';
    return;
  }
  container.innerHTML = results.map((r) => `
    <button type="button" data-pick-symbol="${escapeHtml(r.symbol)}" data-pick-name="${escapeHtml(r.name)}" data-pick-role="${escapeHtml(r.role || '')}"
      class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700">
      <span class="min-w-0 text-sm truncate">${escapeHtml(r.name)}</span>
      <span class="text-sm text-slate-400 shrink-0">${escapeHtml(r.symbol || '보유 중(티커 없음)')} ${r.exch ? '· ' + escapeHtml(r.exch) : ''}</span>
    </button>`).join('');
  container.querySelectorAll('button[data-pick-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const draft = monthlyContributionByOwnerDraft[owner];
      // [티커 없는 자산까지 확장 - 요청 반영] 티커 하나만으론 국채/현금처럼 티커 없는 종목끼리 중복
      // 판정이 안 된다(전부 빈 문자열로 뭉개짐) - 이름까지 포함한 identity로 비교한다.
      const identity = allocEntryIdentity(btn.dataset.pickSymbol, btn.dataset.pickName);
      if (draft.allocation.some((it) => allocEntryIdentity(it.ticker, it.label) === identity)) {
        alert('이미 배분된 종목입니다.');
        return;
      }
      // [티커별 역할(포지션) 단일 소스 - 자동 연동] 다른 추가 플로우들과 동일한 원칙 - 검색 후보가 실어
      // 보낸 실제 보유 자산의 role을 우선 쓰고, 없으면 레지스트리(티커/이름)로 한 번 더 폴백한다.
      const role = btn.dataset.pickRole || getTickerRole(btn.dataset.pickSymbol, btn.dataset.pickName);
      draft.allocation.push({ ticker: btn.dataset.pickSymbol, label: btn.dataset.pickName, pct: 0, role });
      renderMonthlyContributionAllocationList(owner);
      const form = document.getElementById('monthlyContributionAllocationAddForm' + suffix);
      form.classList.add('hidden');
      form.innerHTML = '';
    });
  });
}
REBALANCE_OWNERS.forEach((owner) => {
  const suffix = rebalanceOwnerSuffix(owner);
  document.getElementById('monthlyContributionAllocationAddBtn' + suffix).addEventListener('click', () => {
    const form = document.getElementById('monthlyContributionAllocationAddForm' + suffix);
    if (!form.classList.contains('hidden')) { form.classList.add('hidden'); form.innerHTML = ''; return; }
    form.classList.remove('hidden');
    form.innerHTML = `
      <input id="newMonthlyAllocSearchInput${suffix}" type="text" autocomplete="off" placeholder="종목명/티커 검색 (예: 삼성전자, QQQM)" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
      <div id="newMonthlyAllocSearchResults${suffix}" class="hidden space-y-0.5 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-100 dark:bg-slate-900"></div>`;
    form.scrollIntoView({ behavior: 'smooth', block: 'end' });
    document.getElementById('newMonthlyAllocSearchInput' + suffix).addEventListener('input', (e) => triggerMonthlyAllocSearch(owner, e.target.value.trim()));
  });
});

document.getElementById('saveMonthlyContributionAllocationModalBtn').addEventListener('click', () => {
  for (const owner of REBALANCE_OWNERS) {
    const sumPct = monthlyContributionByOwnerDraft[owner].allocation.reduce((s, r) => s + num(r.pct), 0);
    if (sumPct > 100) { alert(`${owner}의 배분 비중 합계가 100%를 넘을 수 없습니다.`); return; }
  }
  // [적립기간 명확한 validation - 요청 반영] 음수는 "0년(신규 납입 없음)"과 전혀 다른 의미인데, num()에
  // 그냥 통과시키면 조용히 "제한 없음"으로 취급되어(simulateMonthlyContributionGrowth의 hasContributionCap
  // 판정이 음수를 걸러내므로) 사용자가 실수를 눈치채지 못한다 - 자동으로 되돌리지 않고 저장 자체를 막는다.
  for (const owner of REBALANCE_OWNERS) {
    const draftYears = monthlyContributionByOwnerDraft[owner].years;
    if (draftYears !== null && draftYears !== undefined && num(draftYears) < 0) {
      alert(`${owner}의 적립 기간은 0 이상이어야 합니다.`);
      return;
    }
  }
  const next = {};
  REBALANCE_OWNERS.forEach((owner) => {
    const draft = monthlyContributionByOwnerDraft[owner];
    // [적립기간 null=제한없음 - 요청 반영] draft.years가 null(사용자가 건드리지 않음)이면 그대로 null로
    // 저장한다 - "|| 15"로 채우면 손대지 않은 사용자도 "15년으로 설정"된 것처럼 저장되어 버린다.
    const years = (draft.years === null || draft.years === undefined) ? null : num(draft.years);
    next[owner] = { total: num(draft.total), years, allocation: draft.allocation.map((it) => ({ ...it })) };
  });
  // [티커별 역할(포지션) 단일 소스] 이 팝업에서 저장한 role을 레지스트리에도 반영해 다른 화면에서도
  // 이어받게 한다 - 위 draft 시딩 단계에서 이미 role이 항상 채워져 있어 여기서 지워질 위험은 없다.
  REBALANCE_OWNERS.forEach((owner) => {
    next[owner].allocation.forEach((it) => { if (it.ticker || it.label) setTickerRole(it.ticker, it.role, it.label); });
  });
  // [Phase 25 P2] 증가율도 같은 [저장]에서 함께 validation 후 커밋한다.
  if (!(num(monthlyContributionGrowthDraft) >= 0)) { alert('매년 투자금 증가율은 0 이상이어야 합니다.'); return; }
  state.projection.monthlyContributionByOwner = next;
  state.projection.contributionGrowthRate = num(monthlyContributionGrowthDraft);
  persistProjection();
  closeMonthlyContributionAllocationModal(false);
  updateProjection();
  showToast('월적립금 배분 설정을 저장했습니다.', 'success');
});

// 배분된 종목 하나의 월 적립금 몫을 그 종목 고유 수익률로 독립 복리 성장시킨다(원금 없이 적립만 -
// 이 함수는 "새로 들어오는 돈"만 다룬다. 기존 원금은 simulateRebalancedPreset의 지역별 계산이 그대로
// 맡는다). getTargetProjectionRate가 type:'ticker' 대상의 수익률을 그대로 재사용한다(수익률 관리 모달의
// 오버라이드, 시스템 기본 매핑, 이름 키워드 매핑, 국내/해외 대표지수 폴백까지 전부 동일하게 적용됨).
function getMonthlyAllocationItemRate(item, presetKey) {
  return getTargetProjectionRate({ type: 'ticker', ticker: item.ticker, label: item.label }, presetKey, sanitizeTicker(item.ticker).isDomestic);
}

// 월 적립금 전체의 미래가치(연차 y 기준) - 사용자가 [월적립금 설정]에서 배분한 종목들은 각자의 수익률로
// 독립 계산하고, 배분되지 않은 나머지(100% - 배분 합계)는 기존처럼 "포트폴리오 구성" 탭의 국내/해외
// 목표 비중 비율대로 지역 가중평균 수익률(regionRate)로 계산한다. 배분이 비어 있으면(기본값) 나머지가
// 100%가 되어 이전 동작과 수학적으로 완전히 동일하다(computeFutureValue가 PV/PMT에 대해 선형이라
// "원금 따로 + 적립금 따로" 계산과 "합쳐서 한 번에" 계산이 같은 결과를 낸다).
// [적립기간 연결 - 요청 반영] contributionYears: null/undefined(또는 y 이상)이면 "제한 없음"(y년
// 내내 적립 - 기존 동작과 완전히 동일, computeFutureValueWithContributionGrowthAndFee를 그대로 한
// 번만 호출)이다. 0 이상 y 미만인 값이 실제로 주어졌을 때만, 절세계좌 simulateTaxAdvantagedOwnerGrowth
// 의 growWithStop과 정확히 같은 두 단계(적립 구간을 먼저 계산 -> 그 잔고를 유휴 구간 동안 신규납입
// 없이 이어서 복리성장)로 나눠 계산한다 - computeFutureValueWithContributionGrowthAndFee 자체는
// 한 글자도 수정하지 않는다(새 계산 공식을 만들지 않고 기존 검증된 패턴만 재사용).
function simulateMonthlyContributionGrowth(presetKey, monthlyContribution, regionPV, regionRate, totalValue, y, allocationList, regionFeeRate, contributionYears, regionWeightPct) {
  // [Phase 3-3 통합 감사] Monte Carlo와 동일한 state.projection.contributionGrowthRate를 여기서도
  // 그대로 읽는다 - state.projection.monthlyContributionAllocation을 이미 이 함수가 직접 읽고 있는
  // 것과 같은 방식(새 파라미터를 여러 호출부에 추가로 꿰어넣지 않는다).
  const growthRate = num(state.projection.contributionGrowthRate) / 100;
  const allocation = (allocationList || state.projection.monthlyContributionAllocation).filter((it) => num(it.pct) > 0);
  const allocatedPct = Math.min(100, allocation.reduce((s, it) => s + num(it.pct), 0));
  const remainderPct = Math.max(0, 100 - allocatedPct);

  const hasContributionCap = Number.isFinite(contributionYears) && contributionYears >= 0 && contributionYears < y;
  const growWithOptionalStop = (rate, monthly, feeRate) => {
    if (!hasContributionCap) return computeFutureValueWithContributionGrowthAndFee(0, rate, y, monthly, growthRate, feeRate);
    const atStop = computeFutureValueWithContributionGrowthAndFee(0, rate, contributionYears, monthly, growthRate, feeRate);
    return computeFutureValueWithContributionGrowthAndFee(atStop, rate, y - contributionYears, 0, 0, feeRate);
  };

  let total = 0;
  allocation.forEach((item) => {
    const rate = getMonthlyAllocationItemRate(item, presetKey);
    const feeRate = feePercentToDecimal(getMonthlyAllocationItemFeeRate(item)); // [Phase 3-4]
    const itemMonthly = monthlyContribution * num(item.pct) / 100;
    total += growWithOptionalStop(rate, itemMonthly, feeRate);
  });

  if (remainderPct > 0) {
    const remainderMonthly = monthlyContribution * remainderPct / 100;
    ['국내', '해외'].forEach((region) => {
      // [P1 수정 - Phase 9 감사 후속] regionPV[region]/totalValue는 애초에 "이 owner의 목표 국내/해외
      // 비중"(state.rebalance[owner].domestic, 호출부 simulateRebalancedPreset이 regionPV = totalValue
      // * domestic/100으로 만든 것)을 다시 역산해 재구성하는 것뿐이다 - totalValue===0(기존 자산이
      // 없는 신규 사용자)이면 이 역산이 0/0이 되어, 종목 배분을 지정하지 않은 신규 적립금 전액이
      // 조용히 사라지는 문제가 있었다(Phase 9 감사에서 발견). totalValue!==0인 기존 정상 케이스는
      // 이전과 완전히 동일한 계산식을 그대로 타 bit-identical하고, totalValue===0일 때만 이미 존재하는
      // 목표비중 구조(regionWeightPct = state.rebalance[owner].domestic)를 직접 사용한다 - 임의의
      // 50:50 등 새로운 가정을 만들지 않는다.
      const share = totalValue !== 0
        ? regionPV[region] / totalValue
        : ((regionWeightPct && num(regionWeightPct[region])) || 0) / 100;
      // [Phase 3-4] regionFeeRate가 없으면(하위호환 - 이 함수를 다른 곳에서 옛 시그니처로 호출하는
      // 경우) 0%로 취급한다 - fee=0은 기존 함수(computeFutureValueWithContributionGrowth)로 정확히
      // bit-identical 폴백되므로 안전하다.
      const feeRate = (regionFeeRate && regionFeeRate[region]) || 0;
      total += growWithOptionalStop(regionRate[region], remainderMonthly * share, feeRate);
    });
  }
  return total;
}

