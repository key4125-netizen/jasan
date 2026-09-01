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
const PROJECTION_GROUP_LABELS = { '주식형자산': '주식형 자산 (주식+ETF)' };

// 자산의 카테고리를 예측 그룹 키로 변환한다 - 주식/ETF만 '주식형자산'으로 통합하고 나머지는 그대로.
function getProjectionGroupKey(category) {
  if (category === '주식' || category === 'ETF') return '주식형자산';
  return category;
}
function getProjectionGroupLabel(groupKey) { return PROJECTION_GROUP_LABELS[groupKey] || groupKey; }

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
  { key: 'QQQM', keywords: ['나스닥100', '나스닥 100', 'NASDAQ100', 'NASDAQ 100', '나스닥', 'NASDAQ'] },
  { key: 'SCHD', keywords: ['배당다우존스', '배당 다우존스', 'SCHD'] },
  { key: 'SPYM', keywords: ['S&P500', 'S&P 500', 'SP500', 'S&P지수'] }
];
function getNameKeywordRateKey(name) {
  const hay = String(name ?? '').toUpperCase();
  for (const { key, keywords } of NAME_KEYWORD_RATE_MAP) {
    if (keywords.some((k) => hay.includes(k.toUpperCase()))) return key;
  }
  return null;
}
function getProjectionAssetGroupKey(asset) {
  const groupKey = getProjectionGroupKey(asset.category);
  if (groupKey !== '주식형자산') return groupKey; // 채권/현금/커스텀 카테고리는 기존 카테고리 단위 유지
  const customKey = findCustomRateKeyForAsset(asset.ticker, asset.name);
  if (customKey) return customKey; // 사용자 정의 등록 종목 - 코드/티커/이름 중 하나로 매칭(SK하이닉스 등)
  const sanitized = sanitizeTicker(asset.ticker);
  const yahoo = sanitized.yahooTicker;
  if (SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined) return yahoo;
  const nameKey = getNameKeywordRateKey(asset.name);
  if (nameKey) return nameKey; // 국내상장 해외지수 ETF(절세계좌 등) - 이름 키워드로 대표 상품에 매칭
  return sanitized.isDomestic === '해외' ? 'SPYM' : 'KOSPI';
}
function getProjectionGroupStats() {
  const byGroup = {}; // { 그룹키: { value, buy, returnRate } }
  state.assets.forEach((a) => {
    // [버그 수정 - 일반계좌 자산만 대상] 절세계좌(ISA/IRP/연금저축)와 부동산은 "포트폴리오 구성"(옛
    // 리밸런싱 설정) 탭과 마찬가지로 미래예측에서도 완전히 제외한다 - 두 탭이 같은 "일반계좌 보유
    // 자산" 범위를 공유하도록 통일했다(요청 반영). 한때는 미래예측만 절세계좌/부동산을 포함하도록
    // 넓혔던 적이 있었으나(부동산은 자체 그룹으로 별도 복리 성장 후 합산, 절세계좌도 전부 합산) 다시
    // 되돌렸다 - 부동산 전용 복리 성장 로직은 simulateRebalancedPreset/computeTargetWeightedAvgRate에서
    // 함께 제거했다.
    if (!isRebalanceEligibleAccount(a) || a.category === '부동산') return;
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

// 실제 보유 중인(평가금액이 0이 아닌) 그룹만 남긴다 - 입력창/그래프 라인 모두 이 목록을 기준으로 한다.
function getHeldProjectionGroupKeys(byGroup) {
  return Object.keys(byGroup)
    .filter((k) => Math.round(byGroup[k].value) !== 0)
    .sort((a, b) => byGroup[b].value - byGroup[a].value); // 보유금액 큰 순
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
  document.getElementById('monthlyContributionInput').value = state.projection.monthlyContribution || '';
  document.getElementById('inflationRateInput').value =
    (state.projection.inflationRate !== undefined && state.projection.inflationRate !== null) ? state.projection.inflationRate : 2.5;
  updateProjection();
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

// [고정 5년 간격 마일스톤] 예전엔 "실제 달력상 5의 배수 연도"(2030/2035/2040/2045년처럼)를 기준으로
// 잡아서, 오늘이 몇 년이냐에 따라 "4년후"/"9년후"처럼 불규칙한 오프셋이 나왔다(사용자 실측 신고로
// 확인) - 오늘(CURRENT_YEAR)로부터 정확히 5/10/15/20/25/30년 후로 고정한다(30년 시야까지 확장,
// 사용자 요청). 표시 연도(하위 캡션)는 CURRENT_YEAR + offset으로 그대로 자동 계산되므로 이 배열만
// 바꾸면 표/차트 전부 자동으로 반영된다.
function getMilestoneYearOffsets() {
  return [5, 10, 15, 20, 25, 30];
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
//     국내는 KOSPI, 해외는 S&P500(=SPYM과 동일 값, 대표지수 그 자체이므로 의도적으로 같다)을 쓴다.
//   - categories: 채권(국채) 캐치올 전용 수익률. 현금은 항상 0%(getTargetProjectionRate에서 처리),
//     주식 캐치올은 categories가 아니라 indexRates(지역별 대표지수)를 쓴다.
// 전부 과거 장기 시장 평균·변동성을 참고한 근사치이며 실제 백테스트 데이터가 아니다 - 숫자만 바꾸면
// 전체 시나리오 계산에 바로 반영된다.
const SCENARIO_RATE_PRESETS = {
  conservative: {
    label: '보수적', color: '#ef4444',
    // [부동산 수익률 매핑 추가] 채권과 동일한 "카테고리 캐치올" 방식 - 부동산은 종목 단위 매핑이 없는
    // 단일 자산군이라 tickers가 아니라 categories에 둔다(getRateForProjectionGroupKey/getReferenceRate 참고).
    categories: { '채권': 3.5, '부동산': 3.0 },
    indexRates: { domestic: 5.0, foreign: 7.0 }, // KOSPI / S&P500(SPYM) 대표지수
    tickers: {
      '005930.KS': 8.0, // 삼성전자
      'QQQM': 7.0, 'SPYM': 7.0, 'SCHD': 7.0,
      'MSFT': 7.0, 'GOOGL': 8.0, 'AAPL': 6.0, 'AMZN': 7.0, 'META': 7.0, 'NVDA': 6.5
    }
  },
  normal: {
    label: '일반적', color: '#f59e0b',
    // [기본 수익률 프리셋 조정] 채권 4.5→4.0 / KOSPI 8.0→7.0 / 삼성전자 11.0→9.0 / SCHD 9.0→10.0 /
    // AAPL 9.0→10.0 (사용자 요청값 - "일반적" 프리셋만 변경, 보수적/긍정적은 그대로 유지).
    categories: { '채권': 4.0, '부동산': 5.5 },
    indexRates: { domestic: 7.0, foreign: 9.0 },
    tickers: {
      '005930.KS': 9.0,
      'QQQM': 11.0, 'SPYM': 9.0, 'SCHD': 10.0,
      'MSFT': 10.5, 'GOOGL': 11.5, 'AAPL': 10.0, 'AMZN': 11.5, 'META': 12.0, 'NVDA': 12.5
    }
  },
  optimistic: {
    label: '긍정적', color: '#10b981',
    categories: { '채권': 5.5, '부동산': 8.0 },
    indexRates: { domestic: 11.0, foreign: 13.0 },
    tickers: {
      '005930.KS': 15.0,
      'QQQM': 15.0, 'SPYM': 13.0, 'SCHD': 13.0,
      'MSFT': 14.5, 'GOOGL': 15.5, 'AAPL': 12.0, 'AMZN': 15.5, 'META': 16.5, 'NVDA': 18.0
    }
  }
};

// 프리셋 표에 있는 티커(위 tickers 참고) 하나의 수익률을 정한다 - 사용자 정의 오버라이드(key=yahooTicker)가
// 있으면 그 값이 최우선이고, 없으면 프리셋 표 기본값을 그대로 쓴다.
function getPresetTickerRate(presetKey, yahooTicker) {
  const custom = getCustomRate(yahooTicker, presetKey);
  if (custom !== undefined) return custom;
  return SCENARIO_RATE_PRESETS[presetKey].tickers[yahooTicker];
}

// 지역별 대표지수(국내=KOSPI, 해외=SPYM/S&P500) 수익률 하나 - 이 값도 'KOSPI'/'SPYM' 키로 사용자 정의
// 오버라이드가 가능하다(참조표의 해당 행과 동일한 키를 공유하므로 자연스럽게 맞물린다).
function getEffectiveIndexRate(presetKey, region) {
  const key = region === 'foreign' ? 'SPYM' : 'KOSPI';
  const custom = getCustomRate(key, presetKey);
  if (custom !== undefined) return custom;
  return SCENARIO_RATE_PRESETS[presetKey].indexRates[region];
}

// 목표 항목(티커 지정 또는 자산군 캐치올) 하나가 특정 프리셋·지역에서 쓸 예상 수익률을 정한다.
//   1. 사용자 정의 오버라이드: 종목코드/티커/이름 중 하나라도 등록돼 있으면 최우선 적용(findCustomRateKeyForAsset).
//   2. 시스템 기본 매핑: SCENARIO_RATE_PRESETS[presetKey].tickers에 전용 매핑이 있으면 그 값(삼성전자/
//      대표 ETF/미국 대형주), 없으면 지역별 대표지수(국내=KOSPI, 해외=S&P500)로 대체(fallback)한다.
//   3. 자산군 캐치올: 채권(국채)은 categories.채권(역시 'BOND' 키로 오버라이드 가능), 현금은 항상 0%,
//      그 외(주식 등)는 지역별 대표지수를 그대로 쓴다 - region 인자로 국내/해외 중 어느 소속인지 판단한다.
function getTargetProjectionRate(target, presetKey, region) {
  const preset = SCENARIO_RATE_PRESETS[presetKey];
  if (target.type === 'ticker') {
    const customKey = findCustomRateKeyForAsset(target.ticker, target.label);
    if (customKey) {
      const custom = getCustomRate(customKey, presetKey);
      if (custom !== undefined) return custom;
    }
    const yahoo = sanitizeTicker(target.ticker).yahooTicker;
    if (preset.tickers[yahoo] !== undefined) return getPresetTickerRate(presetKey, yahoo);
    // [절세계좌 국내상장 해외지수 ETF] KODEX 미국S&P500/TIGER 미국나스닥100/SOL 미국배당다우존스 등
    // 이름 키워드로 실제 추종 지수의 대표 수익률에 매핑한다(getProjectionAssetGroupKey와 동일 규칙).
    const nameKey = getNameKeywordRateKey(target.label);
    if (nameKey) return getPresetTickerRate(presetKey, nameKey);
    const isForeign = sanitizeTicker(target.ticker).isDomestic === '해외';
    return isForeign ? getEffectiveIndexRate(presetKey, 'foreign') : getEffectiveIndexRate(presetKey, 'domestic');
  }
  const groupKey = getProjectionGroupKey(target.category);
  if (groupKey === '현금') return 0;
  if (groupKey === '채권') {
    const custom = getCustomRate('BOND', presetKey);
    return custom !== undefined ? custom : preset.categories['채권'];
  }
  return region === '해외' ? getEffectiveIndexRate(presetKey, 'foreign') : getEffectiveIndexRate(presetKey, 'domestic');
}

// [시나리오별 적용 수익률 요약 표] 화면에 나열할 시스템 기본 참조 상품 목록 - SCENARIO_RATE_PRESETS.
// tickers에 있는 종목 전부 + 지역별 대표지수(KOSPI)/국채(BOND) 2개를 합친 것이다. 'SPYM'이 대표 ETF이자
// 동시에 "S&P500 대표지수"(indexRates.foreign)도 겸하므로 행을 따로 두지 않고 하나로 합쳐 보여준다.
// [부동산 삭제 - 요청 반영] 부동산은 이제 미래예측/포트폴리오 구성 계산 전체에서 제외되므로(일반계좌
// 자산만 대상), 더 이상 관리할 기대수익률이 없어 이 목록에서도 뺐다.
const SCENARIO_RATE_BASE_ROWS = [
  { key: 'BOND', label: '국채/채권형' },
  { key: 'KOSPI', label: 'KOSPI (국내 대표지수)' },
  { key: '005930.KS', label: '삼성전자' },
  { key: 'SPYM', label: 'S&P500 (SPYM)' },
  { key: 'SCHD', label: 'SCHD' },
  { key: 'QQQM', label: 'QQQM' },
  { key: 'MSFT', label: 'Microsoft' },
  { key: 'GOOGL', label: 'Alphabet' },
  { key: 'AAPL', label: 'Apple' },
  { key: 'AMZN', label: 'Amazon' },
  { key: 'META', label: 'Meta' },
  { key: 'NVDA', label: 'Nvidia' }
];
// [수익률 관리 모달 - 신규 종목 지원] 화면에 표시할 전체 행 = 시스템 기본 12행 + 사용자가 등록한
// 종목 중 기본 목록에 없는 것(SK하이닉스 등 신규 매핑, key로 중복 판별)만 이어붙인 것. 기본 행에
// 이미 있는 종목(삼성전자 등)을 사용자가 수정한 경우는 새 행을 만들지 않고 기존 행의 수치만 바뀐다
// (getReferenceRate가 오버라이드를 최우선 적용하므로 자동으로 반영됨).
function getScenarioRateDisplayRows() {
  const rows = SCENARIO_RATE_BASE_ROWS.slice();
  const baseKeys = new Set(rows.map((r) => r.key));
  const customRates = state.projection.customScenarioRates || {};
  Object.keys(customRates).forEach((key) => {
    if (baseKeys.has(key)) return;
    rows.push({ key, label: customRates[key].label || key, custom: true });
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
  return preset.tickers[key];
}
// 지금 리밸런싱 목표(pct>0인 활성 항목)에 실제로 배분돼 있어 계산에 쓰이고 있는 참조행 키 집합 -
// getTargetProjectionRate와 완전히 동일한 판별 로직(사용자 정의 오버라이드 → 전용 매핑 → 지역별
// 대표지수/국채)을 그대로 따라간다.
// "적용 중" 판정은 두 소스를 합친다(union): ① 리밸런싱 목표에 실제 배분(pct>0)된 항목, ② 지금 실제로
// 보유 중인 일반계좌 자산(getProjectionAssetGroupKey 참고 - 절세계좌/부동산은 getProjectionGroupStats와
// 동일하게 제외). 둘 중 하나라도 해당하면 그 상품의 수익률이 실제 계산에 쓰이고 있다는 뜻이라 점(●)을 붙인다.
function getActiveScenarioRateKeys() {
  const active = new Set();
  ['국내', '해외'].forEach((region) => {
    (state.rebalance.targets[region] || []).filter((t) => num(t.pct) > 0).forEach((t) => {
      if (t.type === 'ticker') {
        const customKey = findCustomRateKeyForAsset(t.ticker, t.label);
        if (customKey) { active.add(customKey); return; }
        const sanitized = sanitizeTicker(t.ticker);
        if (SCENARIO_RATE_PRESETS.normal.tickers[sanitized.yahooTicker] !== undefined) { active.add(sanitized.yahooTicker); return; }
        const nameKey = getNameKeywordRateKey(t.label);
        if (nameKey) { active.add(nameKey); return; }
        active.add(sanitized.isDomestic === '해외' ? 'SPYM' : 'KOSPI');
        return;
      }
      const groupKey = getProjectionGroupKey(t.category);
      if (groupKey === '현금') return;
      active.add(groupKey === '채권' ? 'BOND' : (region === '해외' ? 'SPYM' : 'KOSPI'));
    });
  });
  state.assets.forEach((a) => {
    // [버그 수정 - 절세계좌/부동산 제외] getProjectionGroupStats()가 이제 절세계좌(ISA/IRP/연금저축)와
    // 부동산 보유 자산을 미래예측 계산에서 아예 빼므로, 여기서도 같은 필터를 적용해야 한다 - 안 그러면
    // 계산에 전혀 안 쓰이는데도 "실제 보유 중"이라는 이유만으로 참조표에 활성(●) 표시가 붙는 모순이 생긴다.
    if (!isRebalanceEligibleAccount(a) || a.category === '부동산') return;
    const key = getProjectionAssetGroupKey(a); // '채권'|'현금'|'KOSPI'|yahooTicker|'NAME:...'|커스텀 카테고리명
    if (key === '현금') return;
    active.add(key === '채권' ? 'BOND' : key);
  });
  return active;
}
// 메인 화면 "시나리오별 적용 수익률 요약" 표 - 상품/종목별로 보수적/일반적/긍정적 3개 수익률을 나란히
// 비교하고, 지금 실제로 리밸런싱 계산에 쓰이고 있는 상품에는 점(●) 표시를 붙인다.
// [가독성 개선] 모바일에서 흐릿하고 작게 보이던 문제를 고쳤다 - 폰트를 text-sm(14px) 이상으로 키우고,
// 종목명/일반적 값은 진한 색(slate-800/900, 다크모드 slate-100/white)으로, 보수적/긍정적 값도 연한
// 회색 대신 slate-700/dark:slate-300 정도의 뚜렷한 색으로 바꿨다. 행 패딩을 넉넉히 주고(py-2) 행 사이
// 구분선(border-slate-100, 다크 border-slate-800)을 모든 행에 일관되게 넣어 시선이 따라가기 쉽게 했다.
// [전체 상품 표시로 원복] 활성 상품만 필터링했다가, "적용 중"의 의미가 리밸런싱 목표뿐 아니라 실제
// 보유(getActiveScenarioRateKeys 참고)로도 넓어지면서 - 사용자 요청에 따라 다시 전체 상품을 나열하고, 점(●)으로만
// 실제 적용 여부(목표로 배분됐거나/실제로 보유 중)를 표시한다.
function renderScenarioRateReferenceTable() {
  const container = document.getElementById('scenarioRateReferenceTable');
  if (!container) return;
  const activeKeys = getActiveScenarioRateKeys();
  container.innerHTML = `
  <div class="overflow-x-auto -mx-1 px-1">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-slate-100 dark:border-slate-800">
          <th class="text-left py-2 pr-1 font-semibold text-slate-500 dark:text-slate-400">상품/종목</th>
          <th class="text-right py-2 px-1 font-bold" style="color:${SCENARIO_RATE_PRESETS.conservative.color}">보수적</th>
          <th class="text-right py-2 px-1 font-bold text-slate-900 dark:text-white">일반적</th>
          <th class="text-right py-2 pl-1 font-bold" style="color:${SCENARIO_RATE_PRESETS.optimistic.color}">긍정적</th>
        </tr>
      </thead>
      <tbody>
        ${getScenarioRateDisplayRows().map((row) => {
          const isActive = activeKeys.has(row.key);
          return `
          <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 ${isActive ? 'bg-brand-50/60 dark:bg-brand-900/10' : ''}">
            <td class="py-2 pr-1">
              <span class="inline-flex items-center gap-1.5 min-w-0">
                ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" title="현재 실제로 보유 중이거나 리밸런싱 목표에 배분되어 적용 중"></span>' : '<span class="w-1.5 h-1.5 shrink-0"></span>'}
                <span class="truncate font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(row.label)}</span>
                ${row.custom ? '<span class="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">사용자 등록</span>' : ''}
              </span>
            </td>
            <td class="text-right py-2 px-1 font-semibold text-slate-700 dark:text-slate-300">${fmtNum(getReferenceRate('conservative', row.key), 1)}%</td>
            <td class="text-right py-2 px-1 font-bold text-slate-900 dark:text-white">${fmtNum(getReferenceRate('normal', row.key), 1)}%</td>
            <td class="text-right py-2 pl-1 font-semibold text-slate-700 dark:text-slate-300">${fmtNum(getReferenceRate('optimistic', row.key), 1)}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
  reapplyDetailCardAccordionHeight('rate', 'scenarioRateAccordionBtn', 'scenarioRateAccordionBody');
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
 *    적립금 입력만 상단 고정 영역으로 옮겨 계속 수정할 수 있게 남겨뒀다(monthlyContributionInput
 *    리스너는 그대로 유지). 아래 두 카드 자체는 순수 읽기 전용이며, 세부 표는 detailCardAccordionOpen
 *    아코디언으로 접고 편다 - [수익률 관리] 버튼(scenarioRateManagerModal)만 별도로 열어야 종목별
 *    보수/일반/긍정 수익률을 직접 등록·수정할 수 있다(카드 자체에 인라인 편집 UI는 없음).
 * ---------------------------------------------------------------------- */
let detailCardAccordionOpen = { rate: false, allocation: false, generalSchedule: false, totalSchedule: false };
function toggleDetailCardAccordion(key, btnId, bodyId) {
  detailCardAccordionOpen[key] = !detailCardAccordionOpen[key];
  const btn = document.getElementById(btnId);
  const body = document.getElementById(bodyId);
  setAccordionOpen(body, btn.querySelector('.detail-card-accordion-chevron'), detailCardAccordionOpen[key]);
  btn.querySelector('.detail-card-accordion-label').textContent = detailCardAccordionOpen[key] ? '접기' : '세부 항목 보기';
}
document.getElementById('scenarioRateAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('rate', 'scenarioRateAccordionBtn', 'scenarioRateAccordionBody'));
document.getElementById('targetAllocationAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('allocation', 'targetAllocationAccordionBtn', 'targetAllocationAccordionBody'));
// [드롭다운 요청 → 아코디언으로 확정] "시나리오별 일반계좌/총자산 금액 비교" 카드는 평소엔 표를 접어
// 숨겨두고, 버튼을 눌렀을 때만 펼치는 아코디언으로 구현했다(사용자 확인 - 드롭다운 필터가 아니라
// 접기/펼치기 토글을 원함) - 위 두 카드와 완전히 동일한 setAccordionOpen/detailCardAccordionOpen 패턴.
document.getElementById('scenarioCompareScheduleAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('generalSchedule', 'scenarioCompareScheduleAccordionBtn', 'scenarioCompareScheduleAccordionBody'));
document.getElementById('totalAssetCompareScheduleAccordionBtn').addEventListener('click', () => toggleDetailCardAccordion('totalSchedule', 'totalAssetCompareScheduleAccordionBtn', 'totalAssetCompareScheduleAccordionBody'));

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

// 절세계좌 보유 자산을 소유자별로 집계 - 총액과, 참고용으로 계좌종류별 소계·실제 위험/안전자산
// 구성비(카테고리 기준: 주식/ETF=위험, 그 외=안전)도 함께 반환한다. 미래 적립 시뮬레이션 자체는
// 위 TAX_ADVANTAGED_RISK_SHARE 고정 비율을 쓰지만, 카드에는 "지금 실제로 어떻게 구성돼 있는지"를
// 보여주는 게 유용하므로 따로 계산해 둔다.
function getTaxAdvantagedHoldingsByOwner() {
  const result = {};
  TAX_ADVANTAGED_OWNERS.forEach((o) => { result[o] = { total: 0, byAccountType: {}, riskValue: 0, safeValue: 0 }; });
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a)) return; // 일반계좌는 대상 아님 - 절세계좌만
    if (!TAX_ADVANTAGED_OWNERS.includes(a.owner)) return;
    const bucket = result[a.owner];
    const value = calcRow(a).curAmount;
    bucket.total += value;
    const accType = a.accountType || '(미지정)';
    bucket.byAccountType[accType] = (bucket.byAccountType[accType] || 0) + value;
    if (a.category === '주식' || a.category === 'ETF') bucket.riskValue += value;
    else bucket.safeValue += value;
  });
  return result;
}

// 절세계좌 하나(또는 소유자 합계)의 시작 잔액+매월 적립금을 위험:안전 = 70:30 고정 비율로 나눠 각자
// 복리 성장시킨 뒤 합산한다 - simulateRebalancedPreset과 동일한 "지역(여기선 위험/안전군)별로 따로
// 복리 계산 후 합산" 원칙(가중평균으로 통짜 계산하면 총액이 왜곡되는 것을 방지).
function simulateTaxAdvantagedGrowth(presetKey, startValue, monthlyContribution, years) {
  const preset = SCENARIO_RATE_PRESETS[presetKey];
  const riskRate = preset.indexRates.domestic;
  const safeRate = preset.categories['채권'];
  const riskShare = TAX_ADVANTAGED_RISK_SHARE;
  const futureRisk = computeFutureValue(startValue * riskShare, riskRate, years, monthlyContribution * riskShare);
  const futureSafe = computeFutureValue(startValue * (1 - riskShare), safeRate, years, monthlyContribution * (1 - riskShare));
  return futureRisk + futureSafe;
}
// 위 함수의 연도별(0~maxYears) 스냅샷 배열 버전 - "시나리오별 총자산" 통합 그래프/표(milestoneOffsets
// 기준)가 이 배열을 그대로 재사용한다.
function simulateTaxAdvantagedYearlyPoints(presetKey, startValue, monthlyContribution, maxYears) {
  const points = [];
  for (let y = 0; y <= maxYears; y++) points.push({ year: y, total: simulateTaxAdvantagedGrowth(presetKey, startValue, monthlyContribution, y) });
  return points;
}

let taxAdvantagedCardScope = 'all'; // 'all' | '신랑' | '와이프' - 카드 상단 드롭다운으로 전환
document.getElementById('taxAdvantagedScopeSelect').addEventListener('change', (e) => {
  taxAdvantagedCardScope = e.target.value;
  renderTaxAdvantagedCard();
});
function renderTaxAdvantagedCard() {
  const container = document.getElementById('taxAdvantagedSummary');
  if (!container) return;
  const holdings = getTaxAdvantagedHoldingsByOwner();
  const owners = taxAdvantagedCardScope === 'all' ? TAX_ADVANTAGED_OWNERS : [taxAdvantagedCardScope];
  const total = owners.reduce((s, o) => s + holdings[o].total, 0);
  const riskValue = owners.reduce((s, o) => s + holdings[o].riskValue, 0);
  const safeValue = owners.reduce((s, o) => s + holdings[o].safeValue, 0);
  const byAccountType = {};
  owners.forEach((o) => {
    Object.keys(holdings[o].byAccountType).forEach((t) => { byAccountType[t] = (byAccountType[t] || 0) + holdings[o].byAccountType[t]; });
  });
  const accountTypeRows = Object.keys(byAccountType).sort();
  if (total === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400">해당 범위에 보유 중인 절세계좌 자산이 없습니다.</p>';
    return;
  }
  container.innerHTML = `
    <div class="flex items-baseline justify-between mb-2">
      <span class="text-[11px] text-slate-400">합계 평가금액</span>
      <span class="text-base font-bold">${fmtKRWShort(total)}</span>
    </div>
    ${accountTypeRows.length > 0 ? `
    <div class="space-y-1 mb-2">
      ${accountTypeRows.map((t) => `
      <div class="flex items-center justify-between text-[11px]">
        <span class="text-slate-500 dark:text-slate-400">${escapeHtml(t)}</span>
        <span class="font-medium text-slate-700 dark:text-slate-300">${fmtKRWShort(byAccountType[t])}</span>
      </div>`).join('')}
    </div>` : ''}
    <div class="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
      <span class="text-slate-400">현재 실제 구성(참고용)</span>
      <span class="text-slate-500 dark:text-slate-400">위험자산 ${total !== 0 ? fmtNum(riskValue / total * 100, 0) : 0}% · 안전자산 ${total !== 0 ? fmtNum(safeValue / total * 100, 0) : 0}%</span>
    </div>`;
}

function openTaxAdvantagedPlanModal() {
  const plan = state.projection.taxAdvantagedPlan;
  document.getElementById('taxAdvantagedYearsInput').value = plan.years;
  document.getElementById('taxAdvantagedMonthlyHusbandInput').value = plan.monthlyByOwner['신랑'] || '';
  document.getElementById('taxAdvantagedMonthlyWifeInput').value = plan.monthlyByOwner['와이프'] || '';
  renderTaxAdvantagedPlanResults();
  document.getElementById('taxAdvantagedPlanModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeTaxAdvantagedPlanModal(viaBackButton) {
  document.getElementById('taxAdvantagedPlanModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('taxAdvantagedPlanBtn').addEventListener('click', () => openTaxAdvantagedPlanModal());
document.getElementById('closeTaxAdvantagedPlanModalBtn').addEventListener('click', () => closeTaxAdvantagedPlanModal(false));
document.getElementById('closeTaxAdvantagedPlanModalBtnBottom').addEventListener('click', () => closeTaxAdvantagedPlanModal(false));
document.getElementById('taxAdvantagedPlanModal').addEventListener('click', (e) => {
  if (e.target.id === 'taxAdvantagedPlanModal') closeTaxAdvantagedPlanModal(false);
});

// 입력값이 바뀔 때마다 state.projection.taxAdvantagedPlan에 즉시 저장하고(다른 입력창들과 동일 패턴)
// 결과를 다시 계산해 보여준다.
function onTaxAdvantagedPlanInputChange() {
  const years = Math.max(1, num(document.getElementById('taxAdvantagedYearsInput').value) || 15);
  state.projection.taxAdvantagedPlan = {
    years,
    monthlyByOwner: {
      '신랑': num(document.getElementById('taxAdvantagedMonthlyHusbandInput').value),
      '와이프': num(document.getElementById('taxAdvantagedMonthlyWifeInput').value)
    }
  };
  persistProjection();
  renderTaxAdvantagedPlanResults();
  updateProjection(); // [시나리오별 총자산] 카드도 이 적립 계획을 참조하므로 함께 갱신한다
}
['taxAdvantagedYearsInput', 'taxAdvantagedMonthlyHusbandInput', 'taxAdvantagedMonthlyWifeInput'].forEach((id) => {
  document.getElementById(id).addEventListener('input', onTaxAdvantagedPlanInputChange);
});

// 팝업 안의 결과 표 - 신랑/와이프/합계 3행 × 보수적/일반적/긍정적 3열.
function renderTaxAdvantagedPlanResults() {
  const container = document.getElementById('taxAdvantagedPlanResults');
  if (!container) return;
  const plan = state.projection.taxAdvantagedPlan;
  const holdings = getTaxAdvantagedHoldingsByOwner();
  const presetKeys = ['conservative', 'normal', 'optimistic'];
  const presetLabels = { conservative: '보수적', normal: '일반적', optimistic: '긍정적' };
  const rows = [...TAX_ADVANTAGED_OWNERS, '합계'].map((owner) => {
    const values = presetKeys.map((presetKey) => {
      if (owner === '합계') {
        return TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + simulateTaxAdvantagedGrowth(presetKey, holdings[o].total, num(plan.monthlyByOwner[o]), plan.years), 0);
      }
      return simulateTaxAdvantagedGrowth(presetKey, holdings[owner].total, num(plan.monthlyByOwner[owner]), plan.years);
    });
    return { owner, values };
  });
  container.innerHTML = `
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-left">
          <th class="py-2 pr-2 font-semibold"></th>
          ${presetKeys.map((k) => `<th class="py-2 px-1 text-right font-semibold">${presetLabels[k]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
        <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 ${r.owner === '합계' ? 'font-bold' : ''}">
          <td class="py-2 pr-2 text-slate-600 dark:text-slate-300">${escapeHtml(r.owner)}</td>
          ${r.values.map((v) => `<td class="py-2 px-1 text-right ${r.owner === '합계' ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}">${fmtKRWShort(v)}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="text-[10px] text-slate-400 mt-2 leading-relaxed">${plan.years}년 후 예상 적립금액(원금+수익)입니다. 매월 적립금은 위험자산(주식형) 70% · 안전자산(채권형) 30% 고정 비율로 나뉘어 각자의 기대수익률로 복리 성장한다고 가정합니다 - 실제 종목별 수익률과는 차이가 있을 수 있습니다.</p>`;
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
  return getScenarioRateDisplayRows().map((row) => ({
    key: row.key,
    label: row.label,
    isBase: !row.custom,
    conservative: num(getReferenceRate('conservative', row.key)),
    normal: num(getReferenceRate('normal', row.key)),
    optimistic: num(getReferenceRate('optimistic', row.key))
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

function renderScenarioRateManagerList() {
  const container = document.getElementById('scenarioRateManagerList');
  container.innerHTML = scenarioRateManagerDraft.map((row, idx) => `
    <div class="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
      <span class="flex-1 min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
      <div class="flex items-center gap-1 shrink-0">
        <input type="number" step="0.1" value="${row.conservative}" data-rate-idx="${idx}" data-rate-field="conservative"
          class="scenario-rate-input w-14 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none" style="color:#ef4444">
        <input type="number" step="0.1" value="${row.normal}" data-rate-idx="${idx}" data-rate-field="normal"
          class="scenario-rate-input w-14 text-[11px] font-bold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
        <input type="number" step="0.1" value="${row.optimistic}" data-rate-idx="${idx}" data-rate-field="optimistic"
          class="scenario-rate-input w-14 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none" style="color:#10b981">
        ${row.isBase ? '<span class="w-6 shrink-0"></span>' : `<button type="button" class="scenario-rate-remove-btn w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400" data-rate-idx="${idx}" title="삭제"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`}
      </div>
    </div>`).join('');
  lucide.createIcons();
}

// 종목명/코드 입력값으로부터 저장 키를 만든다(buildCustomRateKey 재사용) - 등록된 종목 목록의
// 수치 입력은 매 keystroke마다 draft 배열에 그대로 반영한다(아직 state에는 커밋되지 않음).
document.getElementById('scenarioRateManagerList').addEventListener('input', (e) => {
  const idx = e.target.dataset.rateIdx;
  const field = e.target.dataset.rateField;
  if (idx === undefined || !field) return;
  scenarioRateManagerDraft[Number(idx)][field] = num(e.target.value);
});

document.getElementById('scenarioRateManagerList').addEventListener('click', (e) => {
  const btn = e.target.closest('.scenario-rate-remove-btn');
  if (!btn) return;
  scenarioRateManagerDraft.splice(Number(btn.dataset.rateIdx), 1);
  renderScenarioRateManagerList();
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
    container.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-2">검색 결과가 없습니다</p>';
    return;
  }
  container.innerHTML = results.map((r) => `
    <button type="button" data-pick-symbol="${escapeHtml(r.symbol)}" data-pick-name="${escapeHtml(r.name)}"
      class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700">
      <span class="min-w-0 text-xs truncate">${escapeHtml(r.name)}</span>
      <span class="text-[10px] text-slate-400 shrink-0">${escapeHtml(r.symbol)} · ${escapeHtml(r.exch || '')}</span>
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
      if (SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined) {
        const c = getSystemDefaultRate('conservative', yahoo);
        const n = getSystemDefaultRate('normal', yahoo);
        const o = getSystemDefaultRate('optimistic', yahoo);
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
  container.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-2">검색 중...</p>';
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
    <input id="newScenarioRateName" type="text" placeholder="종목명 검색 (예: SK하이닉스, 하이닉스, TSLA)" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <div id="newScenarioRateSearchResults" class="hidden space-y-0.5 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-100 dark:bg-slate-900"></div>
    <input id="newScenarioRateCode" type="text" placeholder="종목코드/티커 (예: 000660, 검색결과 선택 시 자동입력)" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <div class="flex items-start gap-1.5">
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateConservative" class="block text-[10px] text-slate-400 whitespace-nowrap mb-0.5">보수</label>
        <input id="newScenarioRateConservative" type="number" step="0.1" placeholder="%" class="w-full text-xs text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none" style="color:#ef4444">
      </div>
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateNormal" class="block text-[10px] text-slate-400 whitespace-nowrap mb-0.5">일반</label>
        <input id="newScenarioRateNormal" type="number" step="0.1" placeholder="%" class="w-full text-xs font-bold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none">
      </div>
      <div class="flex-1 min-w-0">
        <label for="newScenarioRateOptimistic" class="block text-[10px] text-slate-400 whitespace-nowrap mb-0.5">긍정</label>
        <input id="newScenarioRateOptimistic" type="number" step="0.1" placeholder="%" class="w-full text-xs text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none" style="color:#10b981">
      </div>
    </div>
    <button type="button" id="confirmAddScenarioRateBtn" class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white">추가</button>
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
    scenarioRateManagerDraft.push({
      key, label: name || code, isBase: false,
      conservative: num(rawConservative), normal: num(rawNormal), optimistic: num(rawOptimistic)
    });
    renderScenarioRateManagerList();
    form.classList.add('hidden');
    form.innerHTML = '';
  });
});

// [기본값으로 초기화] 초안에서 모든 사용자 등록/수정 내용을 지운다 - 시스템 기본 12개 상품만 남기고
// 각 수치도 SCENARIO_RATE_PRESETS 원본값으로 되돌린다. 아직 초안일 뿐이라 [저장]을 눌러야 확정된다.
document.getElementById('scenarioRateResetDefaultsBtn').addEventListener('click', () => {
  scenarioRateManagerDraft = SCENARIO_RATE_BASE_ROWS.map((row) => ({
    key: row.key, label: row.label, isBase: true,
    conservative: num(getSystemDefaultRate('conservative', row.key)),
    normal: num(getSystemDefaultRate('normal', row.key)),
    optimistic: num(getSystemDefaultRate('optimistic', row.key))
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
      if (Object.keys(entry).length > 0) { entry.label = row.label; next[row.key] = entry; }
    } else {
      next[row.key] = { label: row.label, conservative: num(row.conservative), normal: num(row.normal), optimistic: num(row.optimistic) };
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
function computeTargetWeightedAvgRate(presetKey) {
  let sum = 0;
  ['국내', '해외'].forEach((region) => {
    const regionFrac = num(state.rebalance.domestic[region]) / 100;
    const targets = state.rebalance.targets[region] || [];
    targets.forEach((t) => { sum += regionFrac * (num(t.pct) / 100) * getTargetProjectionRate(t, presetKey, region); });
  });
  return sum;
}

// 지역(국내/해외) 하나의 목표 배분 "내에서만"의 가중평균 수익률(프리셋별) - 리밸런싱 후 시나리오의
// 지역별 미래가치 계산에 쓰인다(전체 가중평균과 달리 지역 비중은 곱하지 않고 그 지역 내 100% 기준).
function computeRegionWeightedRate(region, presetKey) {
  const targets = state.rebalance.targets[region] || [];
  const sumPct = targets.reduce((s, t) => s + num(t.pct), 0);
  if (sumPct === 0) return 0;
  let weighted = 0;
  targets.forEach((t) => { weighted += (num(t.pct) / sumPct) * getTargetProjectionRate(t, presetKey, region); });
  return weighted;
}

// 프리셋 하나(예: 'normal')로 리밸런싱 후 시나리오의 30년치 연간 스냅샷을 계산한다 - 국내/해외를 각자
// 복리 계산한 뒤 합산해서(단일 가중평균으로 통짜 복리 계산하지 않아) 총자산이 두 지역의 합보다 작아지는
// 역전 현상을 방지한다.
function simulateRebalancedPreset(presetKey, totalValue, monthlyContribution, maxYears) {
  const regionPV = {
    '국내': totalValue * num(state.rebalance.domestic['국내']) / 100,
    '해외': totalValue * num(state.rebalance.domestic['해외']) / 100
  };
  const regionRate = { '국내': computeRegionWeightedRate('국내', presetKey), '해외': computeRegionWeightedRate('해외', presetKey) };
  const regionContributionShare = {
    '국내': totalValue !== 0 ? regionPV['국내'] / totalValue : 0,
    '해외': totalValue !== 0 ? regionPV['해외'] / totalValue : 0
  };
  const regionFutureValue = (region, y) => computeFutureValue(regionPV[region], regionRate[region], y, monthlyContribution * regionContributionShare[region]);
  const yearlyPoints = [];
  for (let y = 0; y <= maxYears; y++) {
    const domestic = regionFutureValue('국내', y);
    const foreign = regionFutureValue('해외', y);
    yearlyPoints.push({ year: y, '국내': domestic, '해외': foreign, total: domestic + foreign });
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
  { key: 'conservative', label: '리밸런싱 후·보수적', color: SCENARIO_RATE_PRESETS.conservative.color, kind: 'rebalanced', preset: 'conservative' },
  { key: 'normal', label: '리밸런싱 후·일반적', color: SCENARIO_RATE_PRESETS.normal.color, kind: 'rebalanced', preset: 'normal' },
  { key: 'optimistic', label: '리밸런싱 후·긍정적', color: SCENARIO_RATE_PRESETS.optimistic.color, kind: 'rebalanced', preset: 'optimistic' }
];

// 시나리오 2 카드의 "재편 후 가중평균" 옆에 표시할, 목표 항목별 배분 금액/수익률 요약 목록.
// [상품별 비중 표시 상세화] 기존에는 "종목명 / 금액·수익률"만 한 줄에 좁게 표시해 비중(%)이 아예
// 빠져 있고, 나머지 값도 서로 붙어 있어 모바일에서 구분이 어려웠다 - 종목(국가 배지 포함)/목표금액/
// 비중/수익률 4개 항목을 표(<table>) 형태의 별도 열로 나눠 겹침 없이 정렬한다. 비중(%)은 "지역
// 목표비중(국내/해외) × 지역 내 항목비중"으로 계산한 포트폴리오 전체 기준값이라 목표금액(역시
// 포트폴리오 전체 기준 금액)과 항상 서로 일치한다.
function renderTargetAllocationSummary(regionPV2) {
  const container = document.getElementById('targetAllocationSummary');
  const rows = [];
  ['국내', '해외'].forEach((region) => {
    const regionPct = num(state.rebalance.domestic[region]);
    const targets = state.rebalance.targets[region] || [];
    // [비중 0% 상품 숨김] 목표 비중(targetRatio)이 0% 이하로 설정된 항목(예: 아직 배분하지 않은 지역의
    // 캐치올)은 실제로 아무 것도 사지 않는 "죽은 행"이라 목록에 보여줄 실익이 없다 - 실제로 배분된
    // 상품만 필터링해서 남긴다.
    targets.filter((t) => num(t.pct) > 0).forEach((t) => {
      const amount = regionPV2[region] * num(t.pct) / 100;
      const overallPct = regionPct * num(t.pct) / 100;
      rows.push({ name: t.label, region, amount, pct: overallPct, rate: getTargetProjectionRate(t, 'normal', region), ticker: t.type === 'ticker' ? t.ticker : '' });
    });
  });
  if (rows.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400">"리밸런싱" 탭에서 목표 비중을 먼저 설정하세요.</p>';
    reapplyDetailCardAccordionHeight('allocation', 'targetAllocationAccordionBtn', 'targetAllocationAccordionBody');
    return;
  }
  // [가독성 개선] 폰트를 text-sm(14px)으로 키우고, 종목명/금액/수익률처럼 핵심 수치는 진한 색+굵게,
  // 행 패딩(py-2)과 모든 행에 일관된 구분선(border-slate-100)을 넣어 눈으로 따라 읽기 쉽게 했다.
  container.innerHTML = `
  <div class="overflow-x-auto -mx-1 px-1">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-slate-100 dark:border-slate-800">
          <th class="text-left py-2 pr-1 sm:pr-2 font-semibold text-slate-500 dark:text-slate-400">종목</th>
          <th class="text-right py-2 px-1 font-semibold text-slate-500 dark:text-slate-400">금액</th>
          <th class="text-right py-2 px-1 font-semibold text-slate-500 dark:text-slate-400">비중</th>
          <th class="text-right py-2 pl-1 font-semibold text-slate-500 dark:text-slate-400">수익률</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
        <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
          <td class="py-2 pr-1 sm:pr-2">
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate max-w-[92px] sm:max-w-[120px] font-semibold text-slate-800 dark:text-slate-100 ${r.ticker ? 'cursor-pointer hover:underline' : ''}"${r.ticker ? ` data-open-stock-detail data-ticker="${escapeHtml(r.ticker)}" data-name="${escapeHtml(r.name)}"` : ''}>${escapeHtml(r.name)}</span>
              <span class="shrink-0 px-1 py-0.5 rounded text-[10px] font-medium leading-none ${r.region === '해외' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${r.region === '해외' ? '미국' : '국내'}</span>
            </div>
          </td>
          <td class="text-right py-2 px-1 font-bold text-slate-900 dark:text-white whitespace-nowrap">${fmtKRWShort(r.amount)}</td>
          <td class="text-right py-2 px-1 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${fmtNum(r.pct, 1)}%</td>
          <td class="text-right py-2 pl-1 font-bold text-slate-900 dark:text-white whitespace-nowrap">${fmtNum(r.rate, 1)}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="sm:hidden text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-right">← 좌우로 스크롤 →</p>`;
  reapplyDetailCardAccordionHeight('allocation', 'targetAllocationAccordionBtn', 'targetAllocationAccordionBody');
}

// [3가지 시나리오 리팩토링] 상단 요약 카드 그리드 - PROJECTION_SCENARIOS(+계산된 points/weightedAvgRate)를
// 순회하며 카드 3개를 동일한 템플릿으로 그린다. 시나리오를 늘리거나 줄여도 이 함수는 그대로 두고
// PROJECTION_SCENARIOS 배열만 바꾸면 된다 - 색상 점 + 기대수익률 + 20년 후 예상자산만 보여주는 순수
// 읽기 전용 요약이며, 수정 버튼은 없다(수익률은 전부 SCENARIO_RATE_PRESETS로 자동 계산됨).
// [2040년/2045년 고정 표기] 예전엔 "20년 후 예상자산" 하나만 보여줬으나, 이제 향후 3번째·4번째 5년
// 단위 캘린더 연도(milestoneOffsets[2]/[3] - 2026년 기준으로는 14년후=2040년, 19년후=2045년) 두
// 시점을 각각 독립된 블록으로 보여준다. CURRENT_YEAR 기준으로 계산하므로 다른 해에 열어도 "앞으로
// 다가올 3·4번째 5년 단위 연도" 두 개를 자동으로 가리킨다(2026년엔 2040/2045년과 일치).
// [15년 후/20년 후 - 상대 연차 고정 표기] 예전엔 "앞으로 다가올 3·4번째 5년 단위 캘린더 연도"(예:
// 2040/2045년)로 표기했으나, 캘린더 연도 대신 오늘 기준 상대 연차인 "15년 후"/"20년 후"로 단순화했다 -
// CURRENT_YEAR와 무관하게 항상 고정된 두 시점(offset 15와 20)을 가리킨다. 시뮬레이션은 이제 30년치까지
// 계산되므로(getMilestoneYearOffsets가 30년후까지 다루게 되면서 함께 늘림) "20년 후"가 더 이상 마지막
// 스냅샷은 아니지만, 이 카드가 보여주는 시점 자체는 그대로 15/20년후로 고정이다.
const SCENARIO_CARD_YEAR_OFFSETS = [15, 20];

function renderScenarioSummaryCards(scenarioData) {
  const grid = document.getElementById('scenarioSummaryCardsGrid');
  if (!grid) return;

  // [버그 수정 - 부동산 구분 줄 제거] 부동산은 이제 이 계산에 아예 들어오지 않으므로(point에 '부동산'
  // 키 자체가 없다) 예전에 있던 "금융자산/부동산" 구분 표시는 더 이상 의미가 없어 제거했다 - 총액 한
  // 줄만 보여준다.
  const renderMilestoneBlock = (point, offset) => `
    <div class="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
      <p class="text-[10px] sm:text-[11px] text-slate-400">${offset}년 후(${CURRENT_YEAR + offset}년) 예상자산</p>
      <p class="text-xs sm:text-base font-semibold truncate">${fmtKRWShort(point.total)}</p>
    </div>`;

  grid.innerHTML = scenarioData.map((s) => `
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-4 shadow-sm min-w-0 flex flex-col">
      <div class="flex items-center gap-1.5 mb-2 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${s.color}"></span>
        <span class="text-[10px] sm:text-sm font-semibold truncate">${escapeHtml(s.label)}</span>
      </div>
      <p class="text-[10px] sm:text-[11px] text-slate-400">기대수익률</p>
      <p class="text-sm sm:text-lg font-bold truncate" style="color:${s.color}">${fmtNum(s.weightedAvgRate, 2)}%</p>
      ${SCENARIO_CARD_YEAR_OFFSETS.map((offset) => renderMilestoneBlock(s.points[offset], offset)).join('')}
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
        y: { ticks: { color: textColor, callback: (v) => (v / 1e8).toFixed(1) + '억' }, grid: { color: 'rgba(148,163,184,.15)' } }
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
// 헤더 때문에 5개 열이 375px 화면 폭을 넘어 가로 스크롤이 필요했다 - 금액을 "5.2억"처럼 억 단위
// 한 자리로 축약하고, 헤더도 "리밸런싱 후·" 접두어를 뗀 짧은 이름만 써서 한 화면에 다 들어오게 했다.
// [총자산 카드 재사용 - 파라미터화] headId/bodyId를 인자로 받아 "시나리오별 일반계좌 금액 비교"와
// "시나리오별 총자산 금액 비교" 두 카드가 이 함수 하나를 공유한다.
function renderScenarioCompareScheduleTable(rows, scenarioData, headId = 'scenarioCompareScheduleHead', bodyId = 'scenarioCompareScheduleBody') {
  const fmtEok = (v) => (v / 1e8).toFixed(1) + '억';
  // 이 표 헤더에서만 쓰는 짧은 이름 - "리밸런싱 후·" 접두어를 뗀다(요약 카드/차트 범례의 원래 라벨은
  // 그대로 둔다 - 그쪽은 폭 여유가 있어 줄일 필요가 없다).
  const shortLabel = (label) => label.replace('리밸런싱 후·', '');
  document.getElementById(headId).innerHTML = `
    <th class="pl-1 pr-1.5 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">시점</th>
    ${scenarioData.map((s) => `<th class="px-1 py-2 text-right font-bold" style="color:${s.color}">${escapeHtml(shortLabel(s.label))}</th>`).join('')}`;
  document.getElementById(bodyId).innerHTML = rows.map((r) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${r.year === 0 ? '현재' : `${r.year}년후`}<span class="block text-[10px] font-normal text-slate-400">${CURRENT_YEAR + r.year}</span></td>
      ${scenarioData.map((s) => `<td class="px-1 py-2 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">${fmtEok(r.values[s.key])}</td>`).join('')}
    </tr>`).join('');
}

function updateProjection() {
  const byGroup = getProjectionGroupStats();
  const groupKeys = getHeldProjectionGroupKeys(byGroup);
  // "시나리오별 적용 수익률 요약" 카드(순수 읽기 전용)는 renderScenarioRateReferenceTable()가 담당한다.
  // [부동산 완전 제외] getProjectionGroupStats()가 이미 부동산 보유 자산을 걸러내므로 byGroup/groupKeys에
  // '부동산' 키 자체가 존재하지 않는다 - 재배분 원금 계산에 별도로 뺄 필요가 없다.
  const totalValueForRebalance = groupKeys.reduce((s, k) => s + byGroup[k].value, 0);

  renderScenarioRateReferenceTable();

  // [버그 수정] 입력창이 비어 있는 동안(사용자가 값을 지우고 새로 입력하는 중)에 num('')=0으로 그대로
  // 덮어쓰면, updateProjection()이 다른 경로(가격 자동갱신 등)에서 호출될 때 state가 0으로 뭉개졌다.
  // 비어 있으면 기존 state 값을 그대로 유지한다 - 콤마가 섞여 들어와도(붙여넣기 등) 안전하도록 제거 후 파싱.
  const rawMonthlyInput = document.getElementById('monthlyContributionInput').value.replace(/,/g, '').trim();
  const monthlyContribution = rawMonthlyInput === '' ? state.projection.monthlyContribution : num(rawMonthlyInput);
  state.projection.monthlyContribution = monthlyContribution;
  const inflationRate = num(document.getElementById('inflationRateInput').value);
  state.projection.inflationRate = inflationRate;

  const milestoneOffsets = getMilestoneYearOffsets(); // [5, 10, 15, 20, 25, 30] - 항상 고정

  // ===== 3개 시나리오: 리밸런싱 후 - 보수적/일반적/긍정적 =====
  // 목표 지역/항목 비중대로 재배분했다고 가정하되, 프리셋별로 자산군/티커 기대수익률만 다르게 적용한다
  // (SCENARIO_RATE_PRESETS 참고). "일반적"은 예전 "리밸런싱 후" 시나리오와 완전히 동일한 값(사용자
  // 수동 입력 포함)을 그대로 쓴다.
  const presetResults = {};
  ['conservative', 'normal', 'optimistic'].forEach((presetKey) => {
    presetResults[presetKey] = simulateRebalancedPreset(presetKey, totalValueForRebalance, monthlyContribution, 30);
  });

  // "리밸런싱 후(일반적)" 상세 패널용 - 상품별 비중 표는 자산 배분 자체가 프리셋과 무관하게 동일하므로
  // "일반적" 프리셋의 수익률 기준으로 보여준다.
  const regionPV2 = {
    '국내': totalValueForRebalance * num(state.rebalance.domestic['국내']) / 100,
    '해외': totalValueForRebalance * num(state.rebalance.domestic['해외']) / 100
  };
  renderTargetAllocationSummary(regionPV2);

  // ===== 3개 시나리오 데이터 묶기 - 요약 카드 그리드/비교 차트/비교표가 전부 이 배열 하나를 순회한다 =====
  const scenarioData = PROJECTION_SCENARIOS.map((s) => {
    const result = presetResults[s.preset];
    return { ...s, points: result.yearlyPoints, weightedAvgRate: result.weightedAvgRate };
  });

  renderScenarioSummaryCards(scenarioData);
  renderScenarioCompareChart(scenarioData, milestoneOffsets);

  // 표/카드용: "현재" + 고정 5년 간격 마일스톤(5/10/15/20/25/30년 후)만 추린다. 각 시나리오의
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
  // 일반계좌 기준으로 유지하되, 이 카드만 가구 전체 총자산 관점을 별도로 보여준다(요청 반영). 절세계좌
  // 몫은 팝업에서 저장해 둔 월 적립액을 그대로 30년 내내 적용한다(팝업을 아직 한 번도 안 썼으면
  // 월 0원 - 그래도 현재 잔액만큼은 항상 복리 성장에 포함되므로 NaN/누락 없이 정상 동작한다).
  const taxAdvantagedHoldings = getTaxAdvantagedHoldingsByOwner();
  const taxAdvantagedTotalValue = TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + taxAdvantagedHoldings[o].total, 0);
  const taxAdvantagedMonthlyTotal = TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + num(state.projection.taxAdvantagedPlan.monthlyByOwner[o]), 0);
  const realEstateTotalValue = state.assets.filter((a) => a.category === '부동산').reduce((s, a) => s + calcRow(a).curAmount, 0);

  const totalScenarioData = PROJECTION_SCENARIOS.map((s) => {
    const generalPoints = presetResults[s.preset].yearlyPoints;
    const taxPoints = simulateTaxAdvantagedYearlyPoints(s.preset, taxAdvantagedTotalValue, taxAdvantagedMonthlyTotal, 30);
    const realEstateRate = SCENARIO_RATE_PRESETS[s.preset].categories['부동산'];
    const points = generalPoints.map((p, idx) => ({
      year: p.year,
      total: p.total + taxPoints[idx].total + computeFutureValue(realEstateTotalValue, realEstateRate, p.year, 0)
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
}

document.getElementById('monthlyContributionInput').addEventListener('input', (e) => {
  // [버그 수정 - 월 적립금이 자꾸 0원으로 초기화됨] 값을 지우고 새로 입력하는 중간에도 매 keystroke마다
  // 이 리스너가 실행되는데, 비어 있는 순간 그대로 num('')=0을 state에 반영해 즉시 persistProjection()으로
  // localStorage에 저장해버리면 그 사이 가격 자동갱신 등으로 updateProjection()이 한 번이라도 더 호출될
  // 때 0원이 영구히 굳어졌다. 입력이 비어 있는 동안은 아직 확정된 값이 아니므로 state/저장을 건드리지
  // 않고 다음 입력을 기다린다 - 콤마가 섞여 들어와도(붙여넣기 등) 안전하도록 제거 후 파싱한다.
  const raw = e.target.value.replace(/,/g, '').trim();
  if (raw === '') return;
  // state.projection.monthlyContribution은 updateProjection()이 내부적으로도 갱신하지만,
  // 그건 persist 호출 '다음'에 일어나 저장이 한 박자 늦어지는 문제가 있었다 - 여기서 먼저 반영한다.
  state.projection.monthlyContribution = num(raw);
  persistProjection();
  updateProjection();
});
// 입력창을 비운 채로 포커스를 벗어나면(예: 다른 값을 지운 뒤 딴 곳을 탭) 화면에 빈 칸이 그대로 남아
// 현재 저장된 값과 화면 표시가 어긋나 보인다 - 마지막으로 확정된 state 값으로 되돌려 보여준다.
document.getElementById('monthlyContributionInput').addEventListener('blur', (e) => {
  if (e.target.value.trim() === '') e.target.value = state.projection.monthlyContribution || '';
});

document.getElementById('inflationRateInput').addEventListener('input', (e) => {
  state.projection.inflationRate = num(e.target.value);
  persistProjection();
  updateProjection();
});

