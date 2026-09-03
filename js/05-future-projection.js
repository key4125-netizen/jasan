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
// [코스닥/코스피 구분 - 버그 수정] 국내 상장 종목의 자동판별 최종 폴백 - 예전엔 국내 종목이면 무조건
// 'KOSPI' 하나로만 묶어서, 코스닥 상장 종목(예: 파크시스템즈 140860.KQ)도 코스피 지수 수익률을 그대로
// 썼다(사용자가 "수익률 관리"에 'KOSDAQ' 키를 따로 등록해도 실제 계산에 전혀 반영되지 않던 원인).
// 티커 접미사(.KQ)로 실제 상장 시장을 구분해 코스닥 종목은 전용 'KOSDAQ' 키로 대표 매칭한다.
function getRegionFallbackRateKey(yahooTicker, isDomestic) {
  if (isDomestic === '해외') return 'S&P500';
  return /\.KQ$/i.test(String(yahooTicker ?? '')) ? 'KOSDAQ' : 'KOSPI';
}
function getProjectionAssetGroupKey(asset) {
  // [대표매칭 오버라이드 - 요청 반영] 자동판별보다 항상 우선한다 - 엑셀의 "대표매칭(수익률연동키)"
  // 컬럼을 직접 고쳐서 업로드하면 makeAsset()이 여기 저장하고(js/01), 이후 모든 계산이 그 값을 그대로
  // 쓴다. 값이 실제로 유효한 수익률에 연결되는지는 resolveProjectionRateForKey가 알아서 안전하게
  // 처리한다(못 알아보는 키는 지역 대표지수로 조용히 대체) - 여기서는 형식 검증을 하지 않는다.
  if (asset.rateMatchOverride) return asset.rateMatchOverride;
  // [정확매칭·키워드매칭 - 카테고리 캐치올보다 우선, 요청 반영] 예전엔 findCustomRateKeyForAsset가
  // '주식형자산' 카테고리 안에서만 동작해, 채권/현금/부동산 카테고리 자산은 아무리 정확히 등록해도(혹은
  // 키워드가 걸려도) 항상 카테고리 캐치올(예: 현금=하드코딩 0%)로만 갔다 - 두 매칭을 카테고리 분기보다
  // 앞으로 옮겨 모든 카테고리에 동일하게 적용한다. 예: "달러 예수금"이 CASH 키워드("현금","달러")에
  // 걸리면 하드코딩된 0% 대신 CASH의 등록 수익률을 쓴다.
  const customKey = findCustomRateKeyForAsset(asset.ticker, asset.name);
  if (customKey) return customKey; // 사용자 정의 등록 종목 - 코드/티커/이름 중 하나로 매칭(SK하이닉스 등)
  const keywordKey = getCustomKeywordRateKey(asset.name);
  if (keywordKey) return keywordKey;
  const groupKey = getProjectionGroupKey(asset.category);
  if (groupKey !== '주식형자산') return groupKey; // 위 두 매칭에 안 걸린 채권/현금/커스텀 카테고리는 기존 카테고리 단위 유지
  const sanitized = sanitizeTicker(asset.ticker);
  const yahoo = sanitized.yahooTicker;
  if (SCENARIO_RATE_PRESETS.normal.tickers[yahoo] !== undefined) return yahoo;
  if (TICKER_RATE_KEY_ALIAS[yahoo]) return TICKER_RATE_KEY_ALIAS[yahoo]; // 실제 QQQM/SPYM 티커 보유 - 이름 무관하게 항상 매칭
  const nameKey = getNameKeywordRateKey(asset.name);
  if (nameKey) return nameKey; // 국내상장 해외지수 ETF(절세계좌 등) - 이름 키워드로 대표 상품에 매칭
  return getRegionFallbackRateKey(yahoo, sanitized.isDomestic);
}
// [절세계좌 종목별 복리 계산 - 요청 반영] getProjectionAssetGroupKey()가 반환하는 키 하나(티커/'NAME:x'/
// 'S&P500'/'KOSPI' 같은 "상품형" 키, 또는 채권/현금/커스텀 자산군명 같은 "카테고리형" 키)를 실제 프리셋
// 수익률로 변환한다 - 절세계좌 개별 보유 종목 복리 계산(getAssetProjectionRate)에서 쓴다. 알아볼 수
// 없는 키(유효하지 않은 대표매칭 오버라이드, 처음 보는 커스텀 자산군명 등)는 조용히 지역 대표지수로
// 대체해 절대 undefined/NaN을 반환하지 않는다.
function resolveProjectionRateForKey(key, presetKey, isForeign) {
  if (key === '현금') return 0;
  if (key === '채권') return getReferenceRate(presetKey, 'BOND');
  if (key === '부동산') return getReferenceRate(presetKey, '부동산');
  if (key === 'KOSPI') return getEffectiveIndexRate(presetKey, 'domestic');
  if (key === 'KOSDAQ') return getEffectiveIndexRate(presetKey, 'kosdaq');
  if (key === 'S&P500') return getEffectiveIndexRate(presetKey, 'foreign');
  const custom = getCustomRate(key, presetKey);
  if (custom !== undefined) return custom;
  const presetTicker = SCENARIO_RATE_PRESETS[presetKey].tickers[key];
  if (presetTicker !== undefined) return presetTicker;
  // [코스닥 대표매칭 오버라이드 - 버그 수정] key 자체가 코스닥 티커(예: rateMatchOverride를 직접
  // "140860.KQ"로 지정한 경우)면 isForeign 플래그보다 우선해서 코스닥 지수로 대체한다.
  if (/\.KQ$/i.test(key)) return getEffectiveIndexRate(presetKey, 'kosdaq');
  return isForeign ? getEffectiveIndexRate(presetKey, 'foreign') : getEffectiveIndexRate(presetKey, 'domestic');
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
  document.getElementById('inflationRateInput').value =
    (state.projection.inflationRate !== undefined && state.projection.inflationRate !== null) ? state.projection.inflationRate : 2.5;
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
      'NASDAQ': 7.0, 'S&P500': 7.0, 'SCHD': 7.0,
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
      'NASDAQ': 11.0, 'S&P500': 9.0, 'SCHD': 10.0,
      'MSFT': 10.5, 'GOOGL': 11.5, 'AAPL': 10.0, 'AMZN': 11.5, 'META': 12.0, 'NVDA': 12.5
    }
  },
  optimistic: {
    label: '긍정적', color: '#10b981',
    categories: { '채권': 5.5, '부동산': 8.0 },
    indexRates: { domestic: 11.0, foreign: 13.0 },
    tickers: {
      '005930.KS': 15.0,
      'NASDAQ': 15.0, 'S&P500': 13.0, 'SCHD': 13.0,
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
    const sanitizedTarget = sanitizeTicker(target.ticker);
    if (sanitizedTarget.isDomestic === '해외') return getEffectiveIndexRate(presetKey, 'foreign');
    // [코스닥 대표지수 - 버그 수정] getProjectionAssetGroupKey/resolveTickerToRateKey와 동일하게
    // 코스닥 상장 종목(.KQ)은 코스피가 아니라 코스닥 대표지수로 대체한다.
    return getEffectiveIndexRate(presetKey, /\.KQ$/i.test(sanitizedTarget.yahooTicker) ? 'kosdaq' : 'domestic');
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
  if (key === 'KOSDAQ') return preset.indexRates.domestic; // 코스닥 전용 시스템 기본값이 아직 없어 코스피와 동일하게 시작(getEffectiveIndexRate와 동일 규칙)
  if (preset.tickers[key] !== undefined) return preset.tickers[key];
  // [SSOT 정합성 - 버그 수정] 여기까지 안 걸리는 키(엑셀 대표매칭 칸에 시스템이 모르는 값을 넣었거나,
  // 아직 customScenarioRates에도 등록되지 않은 커스텀 키를 조회하면 여기 온다) - 예전엔 undefined를
  // 그대로 반환해 num(undefined)→0으로 "0%로 리셋"된 것처럼 보일 수 있었다. 실제 계산 경로
  // (resolveProjectionRateForKey)와 동일하게 지역별 대표지수로 대체해 최소한 그럴듯한 값을 보여준다 -
  // 두 경로가 "알 수 없는 키"를 똑같은 방식으로 처리하도록 맞춘 것(요구사항 4 SSOT).
  if (/\.KQ$/i.test(key)) return preset.indexRates.domestic;
  return sanitizeTicker(key).isDomestic === '해외' ? preset.indexRates.foreign : preset.indexRates.domestic;
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
  return getRegionFallbackRateKey(sanitized.yahooTicker, sanitized.isDomestic);
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
let detailCardAccordionOpen = { generalSchedule: false, totalSchedule: false, taxHusband: false, taxWife: false };
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

// [계좈 세부 - 포지션(역할) 비중 표기 - 요청 반영] "위험/안전자산 구성" 대신, 그 소유자가 절세계좈에
// 실제로 보유 중인 종목들을 포지션(역할)별로 나눠 보여준다 - 개별 자산에 직접 지정된 role이 없으면
// 티커별 역할 단일 소스(getTickerRole)로 폴백한다(다른 화면과 동일한 원칙). 목표 비중이 아니라 "지금
// 실제로 뭘 들고 있는가" 기준이라는 점에서, 위 카드 상단의 부부합산 목표 기준 요약과는 성격이 다르다.
function getTaxAdvantagedRoleBreakdown(owner) {
  const weights = { attacker: 0, core_mid: 0, defender: 0, unassigned: 0 };
  let total = 0;
  state.assets.forEach((a) => {
    if (isRebalanceEligibleAccount(a) || a.owner !== owner) return;
    const value = calcRow(a).curAmount;
    total += value;
    const role = a.role || getTickerRole(a.ticker);
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
    if (!byAccount[accType].has(key)) byAccount[accType].set(key, { ticker: a.ticker || '', name: a.name, curAmount: 0 });
    byAccount[accType].get(key).curAmount += calcRow(a).curAmount;
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
function simulateTaxAdvantagedOwnerGrowth(owner, presetKey, evalYears) {
  const plan = state.projection.taxAdvantagedPlan;
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
// 안전) 기준 단순 이분법이었으나, 이제 "포트폴리오 구성" 탭과 같은 포지션(공격수/코어미드필드/수비수)
// 축으로 통일한다. 상단 대표 줄은 "포지션별 목표비중 분석" 카드와 동일한 데이터(computePositionRoleBreakdown,
// js/04 - 부부합산·일반계좈 목표비중 기준)를 그대로 참조해 두 곳의 숫자가 항상 일치하고, 계좈 세부
// 드롭다운(소유자별)은 그 사람이 절세계좈에 실제로 보유 중인 종목들의 포지션 구성(getTaxAdvantagedRoleBreakdown)
// 을 보여준다 - "목표"가 아니라 "지금 실제로 뭘 들고 있는가" 기준이라는 점에서 성격이 다르다.
function renderTaxAdvantagedCard() {
  const container = document.getElementById('taxAdvantagedSummary');
  if (!container) return;
  const holdings = getTaxAdvantagedHoldingsByOwner();
  const total = TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + holdings[o].total, 0);
  if (total === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400">보유 중인 절세계좌 자산이 없습니다.</p>';
    return;
  }
  const householdRoleSummary = formatRolePctSummary(computePositionRoleBreakdown('all').pct);

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
        <span class="text-[11px] font-medium">${escapeHtml(owner)} 계좌 세부</span>
        <span class="flex items-center gap-1 shrink-0">
          <span class="text-[11px] text-slate-400">${fmtKRWShort(h.total)}</span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200 detail-card-accordion-chevron"></i>
        </span>
      </button>
      <div id="${ids.bodyId}" class="overflow-hidden transition-[max-height] duration-300 ease-in-out" style="max-height:0px;">
        <div class="pb-2 space-y-1">
          ${accountTypeRows.length > 0 ? accountTypeRows.map((t) => `
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-500 dark:text-slate-400">${escapeHtml(t)}</span>
            <span class="font-medium text-slate-700 dark:text-slate-300">${fmtKRWShort(h.byAccountType[t])}</span>
          </div>`).join('') : '<p class="text-[11px] text-slate-400">보유 중인 자산이 없습니다.</p>'}
          <div class="pt-1">
            <p class="text-[11px] text-slate-400 mb-0.5">포지션별 비중(실제 보유 기준)</p>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">${roleSummary}</p>
          </div>
        </div>
      </div>
    </div>`;
  };

  container.innerHTML = `
    <div class="flex items-baseline justify-between mb-2">
      <span class="text-[11px] text-slate-400">합계 평가금액</span>
      <span class="text-base font-bold">${fmtKRWShort(total)}</span>
    </div>
    <div class="pb-2 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-400 mb-0.5">포지션별 비중(부부합산 목표 · 일반계좈 기준)</p>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">${householdRoleSummary}</p>
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

function openTaxAdvantagedPlanModal() {
  TAX_ADVANTAGED_OWNERS.forEach((owner) => {
    renderTaxAdvantagedAllocationEditor(owner, taxAdvantagedAllocationContainerId(owner));
  });
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
    container.innerHTML = '<p class="text-[11px] text-slate-400">보유 중인 절세계좈 종목이 없습니다 - 종목을 매수하면 계좈별로 자동으로 카드가 생깁니다. 그 전까지는 예전처럼 계좈 구분 없는 단일 적립액(설정했다면)으로 계산됩니다.</p>';
    return;
  }
  const plan = state.projection.taxAdvantagedPlan;
  const contribList = plan.contributionByOwnerAccount[owner] || (plan.contributionByOwnerAccount[owner] = []);
  let seeded = false;
  accountTypes.forEach((accType) => {
    if (!contribList.some((c) => c.accountType === accType)) {
      contribList.push({ accountType: accType, frequency: 'monthly', amount: 0, years: 15 });
      seeded = true;
    }
  });
  if (seeded) persistProjection();
  const contribFor = (accType) => contribList.find((c) => c.accountType === accType);
  const allocation = plan.allocationByOwner[owner] || [];
  const pctFor = (accType, ticker) => {
    const found = allocation.find((it) => it.accountType === accType && it.ticker === (ticker || ''));
    return found ? found.pct : 0;
  };
  // [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 계좈에서 아직 배분 항목을 만든 적 없는(=보유는
  // 하지만 적립 배분을 한 번도 설정 안 한) 종목도, 자산관리/거래내역 등 다른 화면에 이미 등록된
  // 역할이 있으면 그 값을 보여준다.
  const roleFor = (accType, ticker) => {
    const found = allocation.find((it) => it.accountType === accType && it.ticker === (ticker || ''));
    return (found && found.role) || getTickerRole(ticker);
  };
  const roleOptionsHtml = (selected) => ['<option value="">역할 미지정</option>', ...ASSET_ROLE_OPTIONS.map((o) => `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`)].join('');
  container.innerHTML = accountTypes.map((accType) => {
    const c = contribFor(accType);
    // [계좈별 종목 추가 - 요청 반영] 보유 종목(byAccount) 외에, 아직 안 산 미보유 종목이라도 이 계좈의
    // 배분 목록(allocationByOwner)에 이미 지정돼 있으면(+ 종목 추가로 넣은 경우) 함께 행으로 보여준다.
    const heldTickers = new Set(byAccount[accType].map((a) => a.ticker));
    const plannedRows = allocation
      .filter((it) => it.accountType === accType && it.ticker && !heldTickers.has(it.ticker))
      .map((it) => ({ ticker: it.ticker, name: it.label, planned: true }));
    const displayRows = [...byAccount[accType].map((a) => ({ ticker: a.ticker, name: a.name, planned: false })), ...plannedRows];
    return `
    <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 mt-2 first:mt-0">
      <div class="mb-2">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="flex-1 min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(accType)}">${escapeHtml(accType)}</span>
          <select data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="frequency"
            class="tax-contrib-input shrink-0 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
            <option value="monthly" ${c.frequency === 'yearly' ? '' : 'selected'}>매월</option>
            <option value="yearly" ${c.frequency === 'yearly' ? 'selected' : ''}>매년</option>
          </select>
        </div>
        <div class="flex items-center justify-end gap-1">
          <input type="number" step="any" value="${c.amount || ''}" placeholder="금액"
            data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="amount"
            class="tax-contrib-input w-24 shrink-0 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none">
          <span class="text-[10px] text-slate-400 shrink-0">원</span>
          <input type="number" step="1" min="1" value="${c.years || ''}" placeholder="기간"
            data-contrib-owner="${escapeHtml(owner)}" data-contrib-account="${escapeHtml(accType)}" data-contrib-field="years"
            class="tax-contrib-input w-12 shrink-0 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-[10px] text-slate-400 shrink-0">년</span>
        </div>
      </div>
      <div class="space-y-1.5 pl-1">
        ${displayRows.map((row) => `
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="flex-1 min-w-0 text-[11px] text-slate-600 dark:text-slate-300 truncate" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}${row.planned ? ' <span class="text-amber-500">(미보유)</span>' : ''}</span>
          <input type="number" step="0.1" min="0" max="100" value="${pctFor(accType, row.ticker)}"
            data-alloc-owner="${escapeHtml(owner)}" data-alloc-account="${escapeHtml(accType)}" data-alloc-ticker="${escapeHtml(row.ticker)}" data-alloc-label="${escapeHtml(row.name)}"
            class="tax-alloc-input w-16 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-[10px] text-slate-400 shrink-0">%</span>
          <!-- [종목 삭제 버튼 - 요청 반영] 보유 종목은 배분 항목만 지워져 pct 0으로 돌아가고(행 자체는
               실제 보유 자산이라 계속 남음), 미보유(planned) 종목은 배분 항목이 곧 행의 존재 근거라
               삭제 시 행 자체가 사라진다. -->
          <button type="button" data-tax-alloc-remove data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" data-ticker="${escapeHtml(row.ticker)}" title="삭제"
            class="touch-target w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
          <select data-alloc-role-owner="${escapeHtml(owner)}" data-alloc-role-account="${escapeHtml(accType)}" data-alloc-role-ticker="${escapeHtml(row.ticker)}" data-alloc-role-label="${escapeHtml(row.name)}"
            class="tax-alloc-role-select basis-full text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 outline-none">${roleOptionsHtml(roleFor(accType, row.ticker))}</select>
        </div>`).join('')}
      </div>
      <p class="tax-alloc-sum-hint text-[10px] text-slate-400 mt-1.5" data-alloc-sum-owner="${escapeHtml(owner)}" data-alloc-sum-account="${escapeHtml(accType)}"></p>
      <!-- [계좈별 종목 추가 - "수익률 관리" 팝업의 +신규 종목 추가 버튼 형식 차용] -->
      <button type="button" data-tax-add-toggle data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}"
        class="w-full mt-1.5 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300">
        <i data-lucide="plus" class="w-3 h-3"></i> 종목 추가
      </button>
      <div data-tax-add-form data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" class="hidden mt-1.5 p-1.5 rounded bg-slate-50 dark:bg-slate-800/60"></div>
    </div>`; }).join('');
  accountTypes.forEach((accType) => updateTaxAdvantagedAllocationSumHint(owner, accType));
  lucide.createIcons();
}
// [계좈별 종목 추가 - 검색 결과] searchStockCandidates(js/04, 보유종목+종목 마스터+Yahoo)를 그대로
// 재사용한다 - 다른 "+ 종목 추가" 플로우들과 동일한 검색 범위(미보유 종목도 대상).
async function renderTaxAddSearchResults(resultsEl, owner, accType, query) {
  const q = query.trim();
  if (!q) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-1">검색 중...</p>';
  const results = await searchStockCandidates(q);
  const existing = new Set((state.projection.taxAdvantagedPlan.allocationByOwner[owner] || [])
    .filter((it) => it.accountType === accType).map((it) => it.ticker));
  const candidates = results.filter((r) => r.symbol && !existing.has(r.symbol)).slice(0, 10);
  if (candidates.length === 0) {
    resultsEl.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-1">검색 결과가 없습니다.</p>';
    return;
  }
  resultsEl.innerHTML = candidates.map((r) => `
    <button type="button" data-tax-add-candidate data-owner="${escapeHtml(owner)}" data-account="${escapeHtml(accType)}" data-ticker="${escapeHtml(r.symbol)}" data-name="${escapeHtml(r.name)}"
      class="w-full flex items-center justify-between gap-2 text-left px-1.5 py-1 rounded hover:bg-white dark:hover:bg-slate-700">
      <span class="text-[11px] truncate">${escapeHtml(r.name)}</span>
      <span class="text-[10px] text-slate-400 shrink-0">${escapeHtml(r.symbol)}</span>
    </button>`).join('');
}
function updateTaxAdvantagedAllocationSumHint(owner, accountType) {
  const el = document.querySelector(`.tax-alloc-sum-hint[data-alloc-sum-owner="${CSS.escape(owner)}"][data-alloc-sum-account="${CSS.escape(accountType)}"]`);
  if (!el) return;
  const allocation = (state.projection.taxAdvantagedPlan.allocationByOwner[owner] || []).filter((it) => it.accountType === accountType);
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
    const list = state.projection.taxAdvantagedPlan.contributionByOwnerAccount[owner];
    const entry = list && list.find((c) => c.accountType === accType);
    if (!entry) return;
    entry[field] = (field === 'frequency') ? contribInput.value : num(contribInput.value);
    persistProjection();
    renderTaxAdvantagedPlanResults();
    updateProjection();
    return;
  }
  const input = e.target.closest('.tax-alloc-input');
  if (!input) return;
  const owner = input.dataset.allocOwner;
  const accountType = input.dataset.allocAccount;
  const ticker = input.dataset.allocTicker;
  const label = input.dataset.allocLabel;
  const pct = num(input.value);
  const plan = state.projection.taxAdvantagedPlan;
  const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
  const idx = list.findIndex((it) => it.accountType === accountType && it.ticker === ticker);
  if (pct > 0) {
    // [티커별 역할(포지션) 단일 소스 - 자동 연동] 직접 % 입력으로 새 배분 항목이 처음 생기는 경우에도
    // 이미 다른 곳에 지정된 role이 있으면 이어받는다(+ 종목 추가 플로우와 동일한 원칙).
    if (idx >= 0) list[idx].pct = pct; else list.push({ accountType, ticker, label, pct, role: getTickerRole(ticker) });
  } else if (idx >= 0) {
    list.splice(idx, 1); // 0%로 낮추면 배분 목록에서 완전히 제거해 깔끔하게 유지한다.
  }
  persistProjection();
  updateTaxAdvantagedAllocationSumHint(owner, accountType);
  renderTaxAdvantagedPlanResults();
  updateProjection();
});
document.getElementById('taxAdvantagedPlanModal').addEventListener('change', (e) => {
  const roleSelect = e.target.closest('.tax-alloc-role-select');
  if (!roleSelect) return;
  const owner = roleSelect.dataset.allocRoleOwner;
  const accountType = roleSelect.dataset.allocRoleAccount;
  const ticker = roleSelect.dataset.allocRoleTicker;
  const role = parseAssetRoleInput(roleSelect.value);
  const plan = state.projection.taxAdvantagedPlan;
  const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
  const idx = list.findIndex((it) => it.accountType === accountType && it.ticker === ticker);
  // pct가 아직 0(=배분 목록에 항목 자체가 없음)인 상태에서 role만 먼저 지정할 수도 있으므로, 없으면
  // pct:0으로 새로 만든다 - 나중에 pct를 올리면 위 input 핸들러가 이 항목을 그대로 이어받는다.
  if (idx >= 0) list[idx].role = role; else list.push({ accountType, ticker, label: roleSelect.dataset.allocRoleLabel, pct: 0, role });
  // [티커별 역할(포지션) 단일 소스] 이 화면에서 지정한 role을 다른 화면에서도 이어받도록 레지스트리에도 반영.
  setTickerRole(ticker, role);
  persistProjection();
});
document.getElementById('taxAdvantagedPlanModal').addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-tax-alloc-remove]');
  if (removeBtn) {
    const owner = removeBtn.dataset.owner, accType = removeBtn.dataset.account, ticker = removeBtn.dataset.ticker;
    const list = state.projection.taxAdvantagedPlan.allocationByOwner[owner] || [];
    const idx = list.findIndex((it) => it.accountType === accType && it.ticker === ticker);
    if (idx >= 0) {
      list.splice(idx, 1);
      persistProjection();
      renderTaxAdvantagedAllocationEditor(owner, taxAdvantagedAllocationContainerId(owner));
      renderTaxAdvantagedPlanResults();
      updateProjection();
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
        class="w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none">
      <div data-tax-add-results class="mt-1 space-y-0.5 max-h-32 overflow-y-auto"></div>`;
    const input = form.querySelector('[data-tax-add-search]');
    setTimeout(() => input.focus(), 50);
    return;
  }
  const addCandidateBtn = e.target.closest('[data-tax-add-candidate]');
  if (addCandidateBtn) {
    const owner = addCandidateBtn.dataset.owner, accType = addCandidateBtn.dataset.account;
    const ticker = addCandidateBtn.dataset.ticker, label = addCandidateBtn.dataset.name;
    const plan = state.projection.taxAdvantagedPlan;
    const list = plan.allocationByOwner[owner] || (plan.allocationByOwner[owner] = []);
    // [미보유 종목 추가 - 요청 반영] pct:0으로 우선 추가하고, 이 티커에 이미 지정된 role이 있으면
    // 자동으로 이어받는다(티커별 역할 단일 소스, getTickerRole).
    if (!list.some((it) => it.accountType === accType && it.ticker === ticker)) {
      list.push({ accountType: accType, ticker, label, pct: 0, role: getTickerRole(ticker) });
      persistProjection();
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
function getTaxAdvantagedOwnerHorizon(owner) {
  const plan = state.projection.taxAdvantagedPlan;
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
  TAX_ADVANTAGED_OWNERS.forEach((o) => { horizonByOwner[o] = getTaxAdvantagedOwnerHorizon(o); });
  const rows = [...TAX_ADVANTAGED_OWNERS, '합계'].map((owner) => {
    const values = presetKeys.map((presetKey) => {
      if (owner === '합계') {
        return TAX_ADVANTAGED_OWNERS.reduce((s, o) => s + simulateTaxAdvantagedOwnerGrowth(o, presetKey, horizonByOwner[o]), 0);
      }
      return simulateTaxAdvantagedOwnerGrowth(owner, presetKey, horizonByOwner[owner]);
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
        ${rows.map((r) => {
          const rowLabel = r.owner === '합계' ? '합계' : `${r.owner} (${horizonByOwner[r.owner]}년 후)`;
          return `
        <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 ${r.owner === '합계' ? 'font-bold' : ''}">
          <td class="py-2 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">${escapeHtml(rowLabel)}</td>
          ${r.values.map((v) => `<td class="py-2 px-1 text-right ${r.owner === '합계' ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}">${fmtKRWShort(v)}</td>`).join('')}
        </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <p class="text-[10px] text-slate-400 mt-2 leading-relaxed">신랑은 ${horizonByOwner['신랑']}년 후, 와이프는 ${horizonByOwner['와이프']}년 후(각자 등록한 계좌 중 가장 늦게 끝나는 계좌 기준) 예상 적립금액(원금+수익)입니다. "합계"는 두 시점 금액을 단순 합산한 값입니다. 실제 보유 중인 종목과 계좌별로 배분한 종목은 각자의 대표 수익률로, 배분되지 않은 나머지 적립금은 위험자산(주식형) 70% · 안전자산(채권형) 30% 고정 비율로 복리 성장한다고 가정합니다.</p>`;
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

function renderScenarioRateManagerList() {
  const container = document.getElementById('scenarioRateManagerList');
  if (scenarioRateManagerDraft.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">아직 매칭된 종목이 없습니다 - 보유 자산이나 "포트폴리오 구성" 목표 비중에 종목을 등록하면 여기 표시됩니다.</p>';
    return;
  }
  container.innerHTML = scenarioRateManagerDraft.map((row, idx) => `
    <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1.5">
      <div class="flex items-center gap-1.5">
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
      </div>
      <input type="text" value="${escapeHtml(row.keywords.join(', '))}" data-rate-idx="${idx}" data-rate-field="keywords"
        placeholder="종목명 키워드(쉼표로 구분) - 예: 현금, 달러"
        class="scenario-rate-keyword-input w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none text-slate-500 dark:text-slate-400">
    </div>`).join('');
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
    <input id="newScenarioRateName" type="text" autocomplete="off" placeholder="종목명 검색 (예: SK하이닉스, 하이닉스, TSLA)" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
    <div id="newScenarioRateSearchResults" class="hidden space-y-0.5 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-100 dark:bg-slate-900"></div>
    <input id="newScenarioRateCode" type="text" autocomplete="off" placeholder="종목코드/티커 (예: 000660, 검색결과 선택 시 자동입력)" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
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
    <input id="newScenarioRateKeywords" type="text" autocomplete="off" placeholder="종목명 키워드(쉼표로 구분, 선택) - 예: 채권혼합" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
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
function getOwnerMonthlyContributionInputs(owner) {
  const byOwner = state.projection.monthlyContributionByOwner;
  const bothUnset = REBALANCE_OWNERS.every((o) => !(byOwner[o] && num(byOwner[o].total) > 0));
  if (!bothUnset) {
    const entry = byOwner[owner] || { total: 0, allocation: [] };
    return { monthlyContribution: num(entry.total), allocation: entry.allocation || [] };
  }
  const ownerTotals = {};
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((o) => {
    const t = getProjectionGroupTotal(getProjectionGroupStats(o));
    ownerTotals[o] = t;
    grandTotal += t;
  });
  const share = grandTotal > 0 ? (ownerTotals[owner] / grandTotal) : (owner === REBALANCE_OWNERS[0] ? 1 : 0);
  return { monthlyContribution: num(state.projection.monthlyContribution) * share, allocation: state.projection.monthlyContributionAllocation || [] };
}

// [소유자별 독립 계산 - Option B] owner별로 자기 자신의 현재 원금(일반계좌, getProjectionGroupStats(owner))
// × 자기 목표 국내/해외 split × 자기 목표 종목별 가중수익률로 각자 복리 성장시킨 뒤 합산한다. 월
// 적립금도 owner별 monthlyContributionByOwner를 그대로 쓴다(getOwnerMonthlyContributionInputs가 하위
// 호환 폴백을 담당) - totalValue/monthlyContribution을 인자로 받던 예전 시그니처와 달리 이제 두 owner의
// 원금/적립금을 함수 내부에서 직접 계산한다.
function simulateRebalancedPreset(presetKey, maxYears) {
  const ownerCalcs = REBALANCE_OWNERS.map((owner) => {
    const totalValue = getProjectionGroupTotal(getProjectionGroupStats(owner));
    const regionPV = {
      '국내': totalValue * num(state.rebalance[owner].domestic['국내']) / 100,
      '해외': totalValue * num(state.rebalance[owner].domestic['해외']) / 100
    };
    const regionRate = { '국내': computeRegionWeightedRate(owner, '국내', presetKey), '해외': computeRegionWeightedRate(owner, '해외', presetKey) };
    const { monthlyContribution, allocation } = getOwnerMonthlyContributionInputs(owner);
    return { totalValue, regionPV, regionRate, monthlyContribution, allocation };
  });
  const principalFutureValue = (calc, region, y) => computeFutureValue(calc.regionPV[region], calc.regionRate[region], y, 0);
  const yearlyPoints = [];
  for (let y = 0; y <= maxYears; y++) {
    let domestic = 0, foreign = 0, contribution = 0;
    ownerCalcs.forEach((calc) => {
      domestic += principalFutureValue(calc, '국내', y);
      foreign += principalFutureValue(calc, '해외', y);
      contribution += simulateMonthlyContributionGrowth(presetKey, calc.monthlyContribution, calc.regionPV, calc.regionRate, calc.totalValue, y, calc.allocation);
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
        <span class="text-[10px] sm:text-sm font-semibold truncate">${escapeHtml(s.label)}</span>
      </div>
      <p class="text-[10px] sm:text-[11px] text-slate-400">기대수익률</p>
      <p class="text-sm sm:text-lg font-bold truncate" style="color:${s.color}">${fmtNum(s.weightedAvgRate, 2)}%</p>
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
  const shortLabel = (label) => label.replace('목표배분·', '');
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
  // [소유자별 독립 원금/적립금 - Option B] 예전엔 여기서 가구 합산 원금(totalValueForRebalance)과 단일
  // monthlyContribution을 미리 구해 simulateRebalancedPreset에 넘겼으나, 이제 그 함수가 owner별로
  // 자기 자신의 원금·적립금을 내부에서 직접 계산하므로(getProjectionGroupStats(owner),
  // getOwnerMonthlyContributionInputs) 여기서 미리 구할 필요가 없다.
  updateMonthlyContributionSummary();
  const inflationRate = num(document.getElementById('inflationRateInput').value);
  state.projection.inflationRate = inflationRate;

  const milestoneOffsets = getMilestoneYearOffsets(); // [5, 10, 15, 20, 25, 30] - 항상 고정

  // ===== 3개 시나리오: 리밸런싱 후 - 보수적/일반적/긍정적 =====
  // 목표 지역/항목 비중대로 재배분했다고 가정하되, 프리셋별로 자산군/티커 기대수익률만 다르게 적용한다
  // (SCENARIO_RATE_PRESETS 참고). "일반적"은 예전 "리밸런싱 후" 시나리오와 완전히 동일한 값(사용자
  // 수동 입력 포함)을 그대로 쓴다.
  const presetResults = {};
  ['conservative', 'normal', 'optimistic'].forEach((presetKey) => {
    presetResults[presetKey] = simulateRebalancedPreset(presetKey, 20);
  });

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

  // ===== [Part 5] 합산 포트폴리오 몬테카를로 시뮬레이션 =====
  renderMonteCarloSection();
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
function computeHouseholdMonteCarloPV() {
  return state.assets.filter((a) => a.category !== '부동산').reduce((s, a) => s + calcRow(a).curAmount, 0);
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
      const key = t.type === 'ticker' ? `T:${sanitizeTicker(t.ticker).yahooTicker}` : `C:${region}:${t.category}`;
      const prev = weights.get(key) || { weight: 0, kind: t.type, ticker: t.ticker, category: t.category, region };
      prev.weight += rowWeight;
      weights.set(key, prev);
    });
  });
  return weights;
}
// 가구 전체 목표 비중 - computeTargetWeightedAvgRate(위쪽)와 동일한 가중 방식(각 owner의 목표 비중을
// 그 owner의 현재 원금 비중으로 가중평균)으로 두 owner의 목표를 하나로 합친다. μ 계산과 같은 가중
// 기준을 쓰므로, "목표 비중 기준"이라는 말이 μ와 σ 양쪽에서 일관되게 같은 의미를 갖는다.
function computeHouseholdTargetInstrumentWeights() {
  const merged = new Map();
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((owner) => {
    const ownerTotal = getProjectionGroupTotal(getProjectionGroupStats(owner));
    if (ownerTotal <= 0) return;
    grandTotal += ownerTotal;
    computeOwnerTargetInstrumentWeights(owner).forEach((v, key) => {
      const prev = merged.get(key) || { ...v, weight: 0 };
      prev.weight += v.weight * ownerTotal;
      merged.set(key, prev);
    });
  });
  if (grandTotal > 0) merged.forEach((v) => { v.weight = v.weight / grandTotal; });
  return merged;
}
// 목표 비중 Map을 실제 일별 수익률 시계열과 짝지어 "포트폴리오 목표 비중 기준" 연환산 변동성(%)을
// 계산한다. 티커는 그 종목의 캐시된 종가(getCachedDailyCloses, js/09 - RISK 카드와 캐시를 공유해
// 중복 조회하지 않음)를 쓰고, '주식' 캐치올처럼 특정 종목이 없는 항목은 지역 대표지수(KOSPI/S&P500)로
// 대체한다(μ 계산의 getTargetProjectionRate 지역 폴백 규칙과 동일). 채권/현금은 수익률 시계열 자체를
// 만들지 않는다 - 그 비중만큼 가중합에서 빠지므로 자연히 "변동성 0인 자산이 섞여 전체를 희석"하는
// 효과가 그대로 반영된다(별도 희석 계수를 곱할 필요가 없다). 가격 이력이 부족한 항목도 같은 방식으로
// 안전하게 제외된다(예외 없이 계속 진행).
async function computeTargetPortfolioVolatilityPct() {
  const weightsMap = computeHouseholdTargetInstrumentWeights();
  const withReturns = [];
  const tasks = [];
  weightsMap.forEach((v) => {
    if (v.kind === 'ticker') {
      tasks.push((async () => {
        const yahoo = sanitizeTicker(v.ticker).yahooTicker;
        const data = await getCachedDailyCloses(yahoo);
        if (data && data.closes.length >= 10) withReturns.push({ weight: v.weight, returns: dailyReturnsFromCloses(data.closes) });
      })());
      return;
    }
    if (v.category === '채권' || v.category === '현금') return; // 변동성 0으로 근사 - 시계열을 만들지 않음
    const indexTicker = v.region === '해외' ? INDEX_TICKERS.SP500 : INDEX_TICKERS.KOSPI;
    tasks.push((async () => {
      const data = await getCachedDailyCloses(indexTicker);
      if (data && data.closes.length >= 10) withReturns.push({ weight: v.weight, returns: dailyReturnsFromCloses(data.closes) });
    })());
  });
  await Promise.all(tasks);
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

// [결과 안정화 - 시드 고정 PRNG, 요청 반영] Math.random()을 직접 쓰면 조회할 때마다(자동 5분 갱신,
// 탭 재진입 등) 완전히 새 난수 시퀀스로 1,000개 표본을 다시 뽑아 P10/P50/P90이 눈에 띄게 출렁였다 -
// mulberry32(공개 도메인 소형 시드 PRNG)로 항상 같은 시드에서 시작해, pv/mu/sigma가 같으면 언제 다시
// 계산해도 완전히 동일한 결과가 나오게 한다. 표본 수(MONTE_CARLO_ITERATIONS)도 1,000 -> 10,000으로
// 늘려 백분위수 추정 자체의 표본오차도 함께 줄였다(시드 고정은 "매번 같은 답"을, 표본 수 증가는
// "그 답이 실제 분포에 더 가깝게 수렴"을 각각 담당 - 서로 다른 문제라 둘 다 필요하다).
function createSeededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const MONTE_CARLO_SEED = 20260101;
const MONTE_CARLO_ITERATIONS = 10000;
// 기하 브라운 운동(GBM) - 마일스톤 연도(t)마다 S_t = S0 * exp((μ-σ²/2)t + σ√t·Z)를 MONTE_CARLO_ITERATIONS회
// 독립 샘플링해 그 분포에서 P10/P50/P90을 뽑는다.
// [P10/P90 라벨링 - 통계 표준 확정, 요청 반영] 예전엔 자원평가(reserve estimation) 업계 관례("P10=10%
// 확률로 초과=낙관")를 따라 코드상 p10에 상위 90th percentile 값을, p90에 하위 10th percentile 값을
// 넣었다 - 하지만 이건 이 앱(개인 자산 시뮬레이션)의 일반적인 통계/금융 percentile 관례("P10=분포의
// 하위 10%=비관", "P90=분포의 상위 10%=낙관")와 정반대라 라벨과 실제 값이 뒤바뀐 것처럼 보이는 오류였다.
// 이제 p10은 문자 그대로 10th percentile(보수/하위 10%), p90은 90th percentile(낙관/상위 10%)이다.
function runMonteCarloSimulation(pv, muPct, sigmaPct, yearOffsets) {
  const mu = muPct / 100, sigma = Math.max(0, sigmaPct / 100);
  const rng = createSeededRandom(MONTE_CARLO_SEED);
  const nextStandardNormal = () => {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const percentileOfSorted = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
  return yearOffsets.map((y) => {
    const samples = new Array(MONTE_CARLO_ITERATIONS);
    for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
      const z = nextStandardNormal();
      samples[i] = pv * Math.exp((mu - (sigma * sigma) / 2) * y + sigma * Math.sqrt(y) * z);
    }
    samples.sort((a, b) => a - b);
    return {
      year: y,
      p10: percentileOfSorted(samples, 10), // 보수(하위 10%, 10th percentile)
      p50: percentileOfSorted(samples, 50), // 중앙값
      p90: percentileOfSorted(samples, 90)  // 낙관(상위 10%, 90th percentile)
    };
  });
}

// [경쟁 상태 방지] σ 계산이 이제 비동기(가격 이력 조회)라, 이 함수가 끝나기 전에 다시 호출되면(빠른
// 탭 전환, 자동 갱신 등) 먼저 시작된 느린 호출이 나중에 끝나 최신 결과를 덮어쓸 수 있다 - 다른 비동기
// 렌더들(coreStocksRequestToken 등)과 동일한 토큰 가드 패턴으로 막는다.
let monteCarloRequestToken = 0;
async function renderMonteCarloSection() {
  const loadingEl = document.getElementById('monteCarloLoadingNote');
  const contentEl = document.getElementById('monteCarloContent');
  if (!loadingEl || !contentEl) return;
  const myToken = ++monteCarloRequestToken;
  loadingEl.textContent = '목표 비중 기준으로 계산 중...';
  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');

  const pv = computeHouseholdMonteCarloPV();
  const mu = computeTargetWeightedAvgRate('normal');
  const sigma = await computeTargetPortfolioVolatilityPct();
  if (myToken !== monteCarloRequestToken) return; // 그 사이 더 최신 호출이 시작됐으면 이 결과는 버린다
  if (pv <= 0) {
    loadingEl.textContent = '집계할 금융자산이 없습니다.';
    return;
  }

  loadingEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  document.getElementById('monteCarloSigmaText').textContent = `${fmtNum(sigma, 1)}%`;
  document.getElementById('monteCarloMuText').textContent = `${fmtNum(mu, 1)}%`;
  document.getElementById('monteCarloPvText').textContent = fmtKRWShort(pv);

  const milestoneOffsets = getMilestoneYearOffsets();
  const points = runMonteCarloSimulation(pv, mu, sigma, [0, ...milestoneOffsets]);

  // [X축 연도 표기 통일 - 요청 반영] 스케줄 표(points, 위 5개 마일스톤만)는 그대로 두고, 차트에는
  // "시나리오별 일반계좌/총자산" 그래프(renderScenarioCompareChart)와 동일한 방식 - 매년 촘촘한 값을
  // 밑에 깔고 마일스톤 연도에만 점(marker)을 찍는 방식 - 을 쓴다. 두 그래프의 x축이 같은 데이터 밀도로
  // 그려져야 Chart.js의 autoSkip 눈금 배치가 동일한 규칙(예: Y26, Y28, Y30...)으로 맞춰진다 - 마일스톤
  // 연도만 5개 점으로 계산하면 그 사이를 채울 데이터 자체가 없어 5년 간격으로만 표기될 수밖에 없었다.
  const maxOffset = Math.max(...milestoneOffsets);
  const denseYears = Array.from({ length: maxOffset + 1 }, (_, i) => i);
  const chartPoints = runMonteCarloSimulation(pv, mu, sigma, denseYears);

  renderMonteCarloChart(chartPoints, milestoneOffsets);
  document.getElementById('monteCarloScheduleBody').innerHTML = points.map((p) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${p.year === 0 ? '현재' : `${p.year}년후`}<span class="block text-[10px] font-normal text-slate-400">${CURRENT_YEAR + p.year}</span></td>
      <td class="px-1 py-2 text-right font-bold text-red-500 dark:text-red-400">${fmtKRWShort(p.p10)}</td>
      <td class="px-1 py-2 text-right font-bold text-slate-900 dark:text-white">${fmtKRWShort(p.p50)}</td>
      <td class="px-1 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">${fmtKRWShort(p.p90)}</td>
    </tr>`).join('');
}

// [이 프로젝트 최초의 밴드/영역채우기 차트] renderScenarioCompareChart의 옵션 구조(색상/툴팁/legend)를
// 그대로 재사용하되, P10~P90 사이를 fill:'-1'로 채워 밴드(fan chart)를 만든다 - Chart.js는 데이터셋
// 배열에서 "바로 앞 데이터셋과의 사이"만 채우므로 [P90(낙관, 채우기 없음), P10(보수, 바로 앞
// 데이터셋인 P90과의 사이를 채워 밴드를 만듦), P50(강조선, 맨 위에 그려지도록 마지막)] 순서로 등록한다
// - 이 등록 순서는 시각적 밴드를 만들기 위한 것일 뿐 P10/P90 각각의 의미(보수/낙관)와는 무관하다.
// [범례/툴팁 표시 순서 - 요청 반영] 위 데이터셋 배열 순서(P90→P10→P50)는 밴드 채우기 때문에 그대로
// 둬야 하지만, 범례/툴팁에 "보이는" 순서는 이거와 무관하게 낙관→중앙값→보수(P90→P50→P10)로 강제한다
// - legend는 generateLabels를, tooltip은 itemSort를 각각 커스터마이징해 데이터셋 배열 순서와 표시
// 순서를 분리한다(datasetIndex를 그대로 넘겨야 범례 클릭 시 해당 라인 토글이 정상 동작한다).
const MONTE_CARLO_DISPLAY_ORDER = { 'P90(낙관)': 0, 'P50(중앙값)': 1, 'P10(보수)': 2 };
function renderMonteCarloChart(points, milestoneOffsets) {
  const textColor = chartTextColor();
  if (charts.monteCarlo) charts.monteCarlo.destroy();
  const labels = points.map((p) => `Y${String(CURRENT_YEAR + p.year).slice(-2)}`);
  const bandColor = 'rgba(99,102,241,0.15)';
  // [X축 연도 표기 통일 - 요청 반영] renderScenarioCompareChart와 동일하게, 마일스톤 연도에만 점을
  // 찍고 나머지는 반지름 0으로 숨긴다(연결선 자체는 매년 값으로 촘촘하게 그려짐).
  const MILESTONE_YEARS = [0, ...milestoneOffsets];
  const pointRadiusFor = (r) => points.map((p) => (MILESTONE_YEARS.includes(p.year) ? r : 0));
  charts.monteCarlo = new Chart(document.getElementById('monteCarloChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'P90(낙관)', data: points.map((p) => p.p90), borderColor: '#10b981', backgroundColor: bandColor, fill: false, tension: 0.3, borderWidth: 1.5, pointRadius: pointRadiusFor(2) },
        { label: 'P10(보수)', data: points.map((p) => p.p10), borderColor: '#ef4444', backgroundColor: bandColor, fill: '-1', tension: 0.3, borderWidth: 1.5, pointRadius: pointRadiusFor(2) },
        { label: 'P50(중앙값)', data: points.map((p) => p.p50), borderColor: '#6366f1', backgroundColor: '#6366f1', fill: false, tension: 0.3, borderWidth: 2.5, pointRadius: pointRadiusFor(3) }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      events: ['click'],
      onClick: (evt, elements, chart) => scheduleTooltipAutoHide(chart, 'monteCarlo'),
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor, callback: (v) => (v / 1e8).toFixed(1) + '억' }, grid: { color: 'rgba(148,163,184,.15)' } }
      },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            color: textColor, boxWidth: 10, font: { size: 11 },
            generateLabels: (chart) => chart.data.datasets
              .map((ds, i) => ({ text: ds.label, fillStyle: ds.borderColor, strokeStyle: ds.borderColor, lineWidth: 2, hidden: !chart.isDatasetVisible(i), datasetIndex: i }))
              .sort((a, b) => MONTE_CARLO_DISPLAY_ORDER[a.text] - MONTE_CARLO_DISPLAY_ORDER[b.text])
          }
        },
        tooltip: {
          itemSort: (a, b) => MONTE_CARLO_DISPLAY_ORDER[a.dataset.label] - MONTE_CARLO_DISPLAY_ORDER[b.dataset.label],
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtKRWShort(ctx.raw)}` }
        }
      }
    }
  });
}

document.getElementById('inflationRateInput').addEventListener('input', (e) => {
  state.projection.inflationRate = num(e.target.value);
  persistProjection();
  updateProjection();
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
let monthlyContributionByOwnerDraft = { '신랑': { total: 0, years: 15, allocation: [] }, '와이프': { total: 0, years: 15, allocation: [] } };

function openMonthlyContributionAllocationModal() {
  const byOwner = state.projection.monthlyContributionByOwner || {};
  const bothUnset = REBALANCE_OWNERS.every((o) => !(byOwner[o] && num(byOwner[o].total) > 0));
  REBALANCE_OWNERS.forEach((owner) => {
    const saved = byOwner[owner];
    // [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 배분 항목에 role이 없어도, 자산관리/거래내역 등
    // 다른 화면에 이미 등록된 역할이 있으면 그 값을 이어받는다.
    const withRoleFallback = (it) => ({ ...it, role: it.role || getTickerRole(it.ticker) });
    if (bothUnset) {
      monthlyContributionByOwnerDraft[owner] = owner === '신랑'
        ? { total: num(state.projection.monthlyContribution), years: 15, allocation: state.projection.monthlyContributionAllocation.map(withRoleFallback) }
        : { total: 0, years: 15, allocation: [] };
    } else {
      monthlyContributionByOwnerDraft[owner] = { total: num(saved && saved.total), years: (saved && num(saved.years)) || 15, allocation: ((saved && saved.allocation) || []).map(withRoleFallback) };
    }
    const suffix = rebalanceOwnerSuffix(owner);
    document.getElementById('monthlyContributionTotalInput' + suffix).value = monthlyContributionByOwnerDraft[owner].total || '';
    document.getElementById('monthlyContributionYearsInput' + suffix).value = monthlyContributionByOwnerDraft[owner].years;
    const form = document.getElementById('monthlyContributionAllocationAddForm' + suffix);
    form.classList.add('hidden');
    form.innerHTML = '';
    renderMonthlyContributionAllocationList(owner);
  });
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
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">아직 배분된 종목이 없습니다 - 월 적립금 전액이 ${escapeHtml(owner)}의 국내/해외 목표 비중대로 계산됩니다.</p>`;
  } else {
    // [미보유 종목 포지션 태깅 - 요청 반영] 배분 항목 자체(state.projection, state.assets와 무관)에
    // 역할을 저장한다 - 실제 보유 여부와 상관없이 "이 적립 계획은 어떤 성격이다"를 기록해 둘 수 있다.
    container.innerHTML = draft.allocation.map((row, idx) => {
      const roleOptionsHtml = ['<option value="">역할 미지정</option>', ...ASSET_ROLE_OPTIONS.map((o) => `<option value="${o.value}" ${row.role === o.value ? 'selected' : ''}>${o.label}</option>`)].join('');
      return `
    <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
      <div class="flex items-center gap-1.5">
        <span class="flex-1 min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
        <div class="flex items-center gap-1 shrink-0">
          <input type="number" step="0.1" min="0" max="100" value="${row.pct}" data-alloc-idx="${idx}"
            class="monthly-alloc-input w-16 text-[11px] font-semibold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 outline-none">
          <span class="text-[11px] text-slate-400">%</span>
          <button type="button" class="monthly-alloc-remove-btn w-6 h-6 shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400" data-alloc-idx="${idx}" title="삭제"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </div>
      <select data-alloc-role-idx="${idx}" class="monthly-alloc-role-select mt-1.5 w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none">${roleOptionsHtml}</select>
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
  document.getElementById('monthlyContributionTotalInput' + suffix).addEventListener('input', (e) => {
    monthlyContributionByOwnerDraft[owner].total = num(e.target.value);
  });
  document.getElementById('monthlyContributionYearsInput' + suffix).addEventListener('input', (e) => {
    monthlyContributionByOwnerDraft[owner].years = num(e.target.value);
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
  container.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-2">검색 중...</p>';
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
      const draft = monthlyContributionByOwnerDraft[owner];
      if (draft.allocation.some((it) => it.ticker === btn.dataset.pickSymbol)) {
        alert('이미 배분된 종목입니다.');
        return;
      }
      // [티커별 역할(포지션) 단일 소스 - 자동 연동] 다른 3개 추가 플로우와 동일하게 이 티커에 이미
      // 등록된 role이 있으면 이어받는다.
      draft.allocation.push({ ticker: btn.dataset.pickSymbol, label: btn.dataset.pickName, pct: 0, role: getTickerRole(btn.dataset.pickSymbol) });
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
      <input id="newMonthlyAllocSearchInput${suffix}" type="text" autocomplete="off" placeholder="종목명/티커 검색 (예: 삼성전자, QQQM)" class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none">
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
  const next = {};
  REBALANCE_OWNERS.forEach((owner) => {
    const draft = monthlyContributionByOwnerDraft[owner];
    next[owner] = { total: num(draft.total), years: num(draft.years) || 15, allocation: draft.allocation.map((it) => ({ ...it })) };
  });
  // [티커별 역할(포지션) 단일 소스] 이 팝업에서 저장한 role을 레지스트리에도 반영해 다른 화면에서도
  // 이어받게 한다 - 위 draft 시딩 단계에서 이미 role이 항상 채워져 있어 여기서 지워질 위험은 없다.
  REBALANCE_OWNERS.forEach((owner) => {
    next[owner].allocation.forEach((it) => { if (it.ticker) setTickerRole(it.ticker, it.role); });
  });
  state.projection.monthlyContributionByOwner = next;
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
function simulateMonthlyContributionGrowth(presetKey, monthlyContribution, regionPV, regionRate, totalValue, y, allocationList) {
  const allocation = (allocationList || state.projection.monthlyContributionAllocation).filter((it) => num(it.pct) > 0);
  const allocatedPct = Math.min(100, allocation.reduce((s, it) => s + num(it.pct), 0));
  const remainderPct = Math.max(0, 100 - allocatedPct);

  let total = 0;
  allocation.forEach((item) => {
    const rate = getMonthlyAllocationItemRate(item, presetKey);
    const itemMonthly = monthlyContribution * num(item.pct) / 100;
    total += computeFutureValue(0, rate, y, itemMonthly);
  });

  if (remainderPct > 0) {
    const remainderMonthly = monthlyContribution * remainderPct / 100;
    ['국내', '해외'].forEach((region) => {
      const share = totalValue !== 0 ? regionPV[region] / totalValue : 0;
      total += computeFutureValue(0, regionRate[region], y, remainderMonthly * share);
    });
  }
  return total;
}

