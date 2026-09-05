/* -------------------------------------------------------------------------
 * 8. KPI 렌더링 (전체 포트폴리오 기준 - 필터 영향 없음)
 * ---------------------------------------------------------------------- */
// 시장별(국내/미국) 일간 손익 자정(00:00) 리셋 - 실제 거래소 개장/휴장 캘린더 API 없이 클라이언트에서
// 판단 가능한 최선의 근사치다. 주말은 각 시장 타임존 기준으로 휴장 처리하지만, 설/추석·Thanksgiving
// 같은 개별 공휴일까지는 알 수 없다(전용 캘린더 데이터 없이는 정확히 판별 불가 - 알려진 한계).
const MARKET_TIMEZONES = { KR: 'Asia/Seoul', US: 'America/New_York' };
// 각 시장에서 "자정 이후 처음으로 새 시세가 나타나는 시각"(프리마켓/시간외 단일가 포함) - 이 시각 전에는
// 날짜(캘린더)는 이미 바뀌었어도 아직 그 거래일의 시세가 나오지 않았으므로 0원으로 유지한다.
// KRX는 08:00부터 시간외 단일가가, 미국은 04:00부터 프리마켓이 시작되는 통상적인 시각을 기준으로 삼았다.
const MARKET_SESSION_START_HOUR = { KR: 8, US: 4 };

// 자산의 티커로 어느 시장(KR/US) 소속인지 판별한다. isDomestic/currency가 아니라 실제 상장 거래소
// 접미사(.KS/.KQ)를 기준으로 삼는다 - "TIGER 미국S&P500"처럼 '해외' 자산으로 분류돼도 실제로는
// KRX(한국거래소)에 상장돼 원화로 거래되는 경우가 흔해서, 그런 상품은 국내 시장 시간대를 따라야 한다.
function getMarketKeyForTicker(ticker) {
  const yahooTicker = sanitizeTicker(ticker).yahooTicker;
  return /\.(KS|KQ)$/i.test(yahooTicker) ? 'KR' : 'US';
}

// [휴장일 이중 반영 방지 - 일자 앵커] marketKey('KR'|'US') 기준 "오늘" 날짜를 YYYY-MM-DD로 반환한다 -
// 체결 식별값(lastTradeKey)의 날짜(getMarketDateKeyForEpoch)와 비교해 "오늘 새 정규장 체결이 있었는지"를
// 판정하는 기준값이다(fetchPricesForTargets 참고). en-CA 로케일이 YYYY-MM-DD 순서를 그대로 내려준다.
function getMarketDateKey(marketKey) {
  const timeZone = MARKET_TIMEZONES[marketKey] || MARKET_TIMEZONES.KR;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) {
    return todayDateStr();
  }
}

// [기기 간 판정 통일] getMarketDateKey()의 "지금" 대신 임의의 epoch(초)를 그 시장 타임존 기준 날짜로
// 바꾼다 - lastTradeKey(=regularMarketTime, API가 내려준 절대 시각)가 그 시장의 "오늘"에 속하는지
// 판정하는 데 쓴다(fetchPricesForTargets 참고). 어느 기기에서 계산하든 절대 시각+고정 타임존만으로
// 결정되므로 항상 같은 결과가 나온다 - 기기별 localStorage 스냅샷이 전혀 필요 없다.
function getMarketDateKeyForEpoch(marketKey, epochSeconds) {
  const timeZone = MARKET_TIMEZONES[marketKey] || MARKET_TIMEZONES.KR;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epochSeconds * 1000));
  } catch (e) {
    return null;
  }
}

// timeZone 기준 "지금"의 시(hour)와 주말 여부를 안전하게 계산한다. Intl.DateTimeFormat이 타임존을
// 지원하지 않는 예외적인 환경(구형 WebView 등)에 대비해, 실패 시 브라우저 로컬 시간으로 안전하게
// 폴백한다(완벽히 정확하진 않아도 앱이 죽는 것보다 낫다).
function getZonedHourInfo(timeZone) {
  try {
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now));
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    return { hour, isWeekend: weekday === 'Sat' || weekday === 'Sun' };
  } catch (e) {
    const now = new Date();
    return { hour: now.getHours(), isWeekend: now.getDay() === 0 || now.getDay() === 6 };
  }
}

// marketKey('KR'|'US')가 지금 "자정은 지났지만 아직 새 거래일 시세가 나오기 전"(또는 주말)인지 -
// 참이면 그 시장 자산의 일간 손익을 0으로 강제해야 한다.
function isMarketInDailyResetWindow(marketKey) {
  const tz = MARKET_TIMEZONES[marketKey] || MARKET_TIMEZONES.KR;
  const info = getZonedHourInfo(tz);
  if (info.isWeekend) return true;
  return info.hour < (MARKET_SESSION_START_HOUR[marketKey] ?? 8);
}

// [장 상태(Market State) 라벨 정비] 국내(KRX/NEXTRADE) 장 상태 판별 - 실시간 시세 API가 실제로
// 시간외 데이터를 주는지와 무관하게, "지금이 물리적으로 몇 시인가"만으로 시간대를 구분한다. 실제
// 화면 라벨(프리마켓/정규장/애프터마켓/장마감)은 이 시간대 판정과 API가 실제로 내려준 시간외 시세
// 유무를 함께 봐서 fetchNaverKrPrice가 최종 결정한다(시간대는 맞아도 그 종목의 시간외 데이터 자체가
// 없으면 장마감으로 표기 - 사용자 요구사항). 공휴일(설/추석 등)까지는 캘린더 데이터 없이는 판별할
// 수 없어 주말만 휴장으로 처리하는 근사치다(위 isMarketInDailyResetWindow와 동일한 한계).
function getZonedHHMM(timeZone) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour').value) % 24; // 자정(24시)이 '24'로 나오는 로케일 대응
    const minute = Number(parts.find((p) => p.type === 'minute').value);
    const weekday = (parts.find((p) => p.type === 'weekday') || {}).value;
    return { hhmm: hour * 100 + minute, isWeekend: weekday === 'Sat' || weekday === 'Sun' };
  } catch (e) {
    const now = new Date();
    return { hhmm: now.getHours() * 100 + now.getMinutes(), isWeekend: now.getDay() === 0 || now.getDay() === 6 };
  }
}

// 국내 시장 시간대 경계(KST 기준, 사용자 확정 스펙): 08:00~08:50 프리마켓, 08:50~15:30 정규장,
// 15:30~20:00 애프터마켓, 그 외(20:00 이후·주말)는 장마감.
function resolveDomesticTimeWindow() {
  const { hhmm, isWeekend } = getZonedHHMM('Asia/Seoul');
  if (isWeekend) return 'closed';
  if (hhmm >= 800 && hhmm < 850) return 'pre';
  if (hhmm >= 850 && hhmm < 1530) return 'regular';
  if (hhmm >= 1530 && hhmm < 2000) return 'post';
  return 'closed';
}

// 미국 시장 시간대 경계(현지 동부시간 기준 통상 스펙: 04:00 프리 시작, 09:30 정규장 시작, 16:00 정규장
// 마감, 20:00 애프터마켓 종료). Stooq처럼 시간외 시세 자체를 제공하지 않는 소스에서, 최소한 "지금이
// 정규장 시간대인가"만 판단해 정규장이 아닌데도 '정규장'으로 잘못 표기되는 것을 막는 용도로만 쓴다
// (실제 프리/애프터 라벨은 Yahoo의 currentTradingPeriod 실측 데이터가 있을 때만 pickCurrentPriceFromChart가
// 붙인다 - 이 함수는 그 데이터가 없는 소스를 위한 최소한의 안전장치).
function resolveForeignTimeWindow() {
  const { hhmm, isWeekend } = getZonedHHMM('America/New_York');
  if (isWeekend) return 'closed';
  if (hhmm >= 400 && hhmm < 930) return 'pre';
  if (hhmm >= 930 && hhmm < 1600) return 'regular';
  if (hhmm >= 1600 && hhmm < 2000) return 'post';
  return 'closed';
}

// [정규장 외 거래 적격성 검증] 국내(KRX/NEXTRADE) 상장 상품 중 실제로 프리마켓/애프터마켓에서
// 유동성 있게 거래되는 것은 사실상 개별 보통주뿐이다. ETF/ETN(집합투자기구)은 유동성공급자(LP)의
// 호가 제공 의무가 정규장에만 있어 시간외 단일가 시장에 사실상 참여하지 않고, 국내 우선주도 대다수가
// 거래량이 적어 시간외 데이터가 거의 없다. 이 함수는 API 응답에 실제 시간외 데이터가 유무와 무관하게
// (API가 어쩌다 깡통/오류 데이터를 흘려보내는 경우까지 대비한 이중 안전장치) 카테고리 기준으로 먼저
// 판정해, fetchNaverKrPrice/fetchYahooViaProxy/fetchStooqPrice가 이 결과가 참이면 무조건 프리/애프터
// 라벨을 걸지 않고 '장마감'으로 고정하게 한다. 미국(해외) 티커에는 적용하지 않는다 - 미국 ETF(QQQM 등)는
// 실제로 프리/애프터마켓에서 정상 거래된다.
//   - ETF/ETN: classifyCategory와 동일한 ETF_KEYWORDS를 재사용해 판정 기준을 하나로 통일한다.
//   - 우선주: KRX 종목코드 부여 관례상 끝자리가 0이 아닌 홀수(1/3/5/7/9)인 6자리 코드.
function isDomesticAfterHoursIneligible(yahooTicker, name) {
  const code = String(yahooTicker ?? '').replace(/\.(KS|KQ)$/i, '');
  const isPreferredStockCode = /^\d{5}[13579]$/.test(code);
  const hay = ((yahooTicker || '') + ' ' + (name || '')).toUpperCase();
  const isEtfOrEtn = ETF_KEYWORDS.some((k) => hay.includes(k)) || hay.includes('ETN');
  return isPreferredStockCode || isEtfOrEtn;
}

// 자산 하나의 오늘 하루 손익(KRW)을 계산한다. 우선순위:
//   1) 전일종가(prevCloseMap)가 있으면 "오늘 평가액 - 어제 종가 기준 평가액"으로 정확히 계산한다.
//      해외자산은 오늘값에는 현재 환율을, 어제값에는 오늘 하루의 기준환율(refExchangeRate)을 각각
//      적용해 가격 변동분과 환율 변동분을 모두 반영한다. "오늘 평가액"에는 시간외 틱이 섞일 수 있는
//      a.currentPrice 대신, 정규장 기준가(a.regularMarketPrice, 없으면 a.currentPrice로 폴백)를 쓴다 -
//      애프터마켓 등락으로 그날의 확정 평가손익/스냅샷이 흔들리지 않게 하기 위함.
//   2) 전일종가는 없지만 API 등락률(dayChangeMap)만 있으면(예: Stooq 폴백) 근사치로 사용한다.
//   3) 채권/현금/부동산(NON_TRADABLE_CATEGORIES) 카테고리는 티커 입력 여부와 무관하게 항상 0 -
//      시세 자체가 없는 자산군이므로 전역 수동 변동률의 영향을 받지 않는다. 단 예외로, 달러(USD)
//      현금은 가격 변동은 없어도 환율은 매일 움직이므로 qty*(오늘환율-오늘 기준환율)만큼만 반영한다
//      (아래 함수 맨 앞의 '현금' 분기 참고) - "해외통화" 일간손익 버킷에 달러 현금의 환차손익이
//      잡히도록 하기 위함.
//   4) 그 외 티커가 아예 없는 자산도 시세 조회 대상이 아니므로 항상 0 - 이게 이전 버전의 버그였다
//      (수동 변동률이 현금/채권에도 적용됨).
//   5) 티커는 있지만 아직 한 번도 시세를 못 받아온 경우에만 수동 변동률로 추정한다.
//   6) [휴장일 이중 반영 방지] state.noNewSessionMap[a.id]가 true면(이번에 받아온 체결 식별값이 직전과
//      완전히 같음 - 평일 공휴일 등으로 새 정규장이 없었다는 뜻) 주가 변동분은 0으로 고정하되, 해외
//      자산의 환율 변동분(오늘 환율 - 오늘 하루 기준환율)만은 그대로 반영한다 - 환율은 주식시장 휴장
//      여부와 무관하게 계속 움직이므로.
//   7) noNewSessionMap이 undefined면(체결 식별값을 안 주는 Stooq 등 소스) 판별 불가 - 기존의 시장별
//      (국내는 KST 자정, 미국은 미 동부시간 자정) 리셋 창 근사 로직으로 폴백한다 - isMarketInDailyResetWindow() 참고.
function calcDailyPnL(a, r) {
  // [달러 현금 - 환차만 반영] 현금성 자산은 시세(가격) 자체가 없어 주가 변동분은 존재하지 않지만,
  // 달러라면 원/달러 환율이 매일 움직이므로 그 변동분(오늘 환율 - 오늘 하루 기준환율)만큼은 원화
  // 평가액이 실제로 바뀐다 - 이걸 반영해야 "해외통화" 일간손익 버킷에 달러 현금의 환차손익이 잡힌다.
  // 원화 현금/채권/부동산은 이 예외에 해당하지 않아 아래 NON_TRADABLE_CATEGORIES 규칙대로 항상 0이다.
  if (a.category === '현금') {
    if (a.currency !== 'USD') return 0;
    return num(a.quantity) * num(a.currentPrice) * (state.exchangeRate - (state.refExchangeRate || state.exchangeRate));
  }
  if (NON_TRADABLE_CATEGORIES.includes(a.category)) return 0;
  const hasTicker = String(a.ticker ?? '').trim() !== '';
  if (!hasTicker) return 0;

  const qty = num(a.quantity);
  const prevClose = state.prevCloseMap[a.id];
  const todayRate = r.isForeign ? state.exchangeRate : 1;
  const prevRate = r.isForeign ? (state.refExchangeRate || state.exchangeRate) : 1;
  const noNewSession = state.noNewSessionMap[a.id];

  if (noNewSession === true) {
    if (typeof prevClose === 'number' && prevClose > 0) return qty * prevClose * (todayRate - prevRate);
    return 0; // 전일종가 정보가 없으면 환차손익도 계산할 기준이 없어 안전하게 0
  }
  if (noNewSession === undefined && isMarketInDailyResetWindow(getMarketKeyForTicker(a.ticker))) return 0;

  if (typeof prevClose === 'number' && prevClose > 0) {
    const regularPrice = a.regularMarketPrice;
    const effectivePrice = (typeof regularPrice === 'number' && regularPrice > 0) ? regularPrice : num(a.currentPrice);
    const todayValue = qty * effectivePrice * todayRate;
    const prevValue = qty * prevClose * prevRate;
    return todayValue - prevValue;
  }

  const fetchedPct = state.dayChangeMap[a.id];
  if (typeof fetchedPct === 'number') return r.curAmount * (fetchedPct / 100);

  return r.curAmount * (state.dailyChangeRate / 100);
}

// [자산군별 집계 태그 - 현금/달러 분리 표시, 요청 반영] 자산군(a.category) 자체는 그대로 '현금'으로
// 두고(일간손익 계산·리밸런싱 캐치올 매칭 등 다른 모든 로직이 이 값을 그대로 참조하므로 절대 안
// 건드림) - KPI 카드 하단 자산군별 집계 태그를 "그릴 때"만 원화현금/달러현금을 별도 항목으로
// 갈라서 보여준다. 원화 채권/부동산 등 다른 자산군은 그대로 자산군명을 쓴다.
function categoryDisplayKey(a) {
  if (a.category === '현금' && a.currency === 'USD') return '달러';
  return a.category;
}

// [일간평가손익/총평가손익 카드 - 실현손익 배지] 세부내용 버튼 밑에 다는 소형 배지 공용 렌더러.
// amount가 0이면(해당 없음 - 오늘 매도 없음/전체 매도 이력 없음) 배지 자체를 숨긴다.
function renderRealizedBadge(elId, amount, label) {
  const el = document.getElementById(elId);
  if (Math.round(amount) === 0) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.textContent = `${label}: ${fmtSigned(amount)}`;
  el.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/60 whitespace-nowrap ' + profitColor(amount);
}

// KPI 카드 하단에 자산군별 세부 집계 태그를 렌더링한다. entries가 비어있으면(보유 자산군이 없거나
// 전부 0원) 컨테이너 자체를 숨겨 빈 구분선만 남는 것을 방지한다.
// valueFn(catStats) -> 표시할 금액, formatFn -> 표시 문자열 포맷터, colored -> true면 손익처럼 +/-/0 색상 적용.
// sizeClass -> 태그 글씨 크기(생략 시 다른 KPI 카드와 동일한 기본 10px 유지).
// ownerOrder -> true면 금액 큰 순 대신 소유자 표시 순서(신랑→와이프→그 외, ownerRank 참고)로 정렬한다.
function renderKpiBreakdown(containerId, byCategory, valueFn, formatFn, colored, sizeClass, ownerOrder) {
  const container = document.getElementById(containerId);
  const textSizeClass = sizeClass || 'text-[10px]';
  const entries = Object.keys(byCategory)
    .map(cat => ({ cat, val: valueFn(byCategory[cat]) }))
    .filter(e => Math.round(e.val) !== 0)
    .sort((a, b) => ownerOrder ? (ownerRank(a.cat) - ownerRank(b.cat)) : (Math.abs(b.val) - Math.abs(a.val))); // 금액 큰 자산군부터, 소유자 태그는 신랑→와이프 순

  if (entries.length === 0) {
    container.classList.add('hidden');
    container.classList.remove('flex');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.classList.add('flex');
  container.innerHTML = entries.map(e => {
    const colorClass = colored ? profitColor(e.val) : 'text-slate-500 dark:text-slate-300';
    return `<span class="${textSizeClass} px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/60 max-w-full whitespace-normal sm:whitespace-nowrap break-keep ${colorClass}">${escapeHtml(e.cat)} ${formatFn(e.val)}</span>`;
  }).join('');
}

// [총 평가손익 카드 전용] 소유자별 세부 손익 - 다른 태그(renderKpiBreakdown)는 값 하나만 보여주지만,
// 이건 "+850만원 (+18.2%)"처럼 금액과 수익률을 함께 한 줄에 보여준다. 양수=빨강/음수=파랑/0=기본색은
// profitColor()를 그대로 재사용해 앱 전체와 색상 규칙을 통일한다.
function renderKpiOwnerProfitBreakdown(containerId, byOwner) {
  const container = document.getElementById(containerId);
  const entries = Object.keys(byOwner)
    .map((owner) => {
      const o = byOwner[owner];
      const profit = o.cur - o.buy;
      const rate = o.buy !== 0 ? (profit / o.buy) * 100 : 0;
      return { owner, profit, rate };
    })
    .filter((e) => Math.round(e.profit) !== 0)
    .sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner));

  if (entries.length === 0) {
    container.classList.add('hidden');
    container.classList.remove('flex');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.classList.add('flex');
  container.innerHTML = entries.map((e) => {
    const colorClass = profitColor(e.profit);
    return `<span class="text-[11px] sm:text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/60 max-w-full whitespace-normal sm:whitespace-nowrap break-keep ${colorClass}">${escapeHtml(e.owner)} ${fmtSignedShort(e.profit)} (${fmtPct(e.rate)})</span>`;
  }).join('');
}

// [달러자산 누적 환차손익] 해외주식/ETF/달러현금 전체를 대상으로, 매수 시점 가중평균 환율(buyRate) 대비
// 현재 환율이 얼마나 움직였는지만 떼어낸 순수 환차손익 합계를 구한다(주가 변동분은 제외) - "총자산
// 평가금액" 카드의 "달러자산 평가금액" 바로 아래 라인에 표시된다.
//   - 해외주식/ETF: 수량 × 매수단가($) × (현재환율 - 매수시환율) = buyAmountOriginal × (오늘환율-buyRate)
//   - 달러현금: 보유 달러($) × (현재환율 - 가중평균 매수환율) - buyPrice가 항상 1로 고정이라 위 공식과
//     형태는 같지만(수량 자체가 곧 달러 금액이므로) 별도 분기 없이 동일한 식으로 처리된다.
// buyRate가 아직 없는 자산(거래내역 없이 수동 등록된 경우 등)은 오늘 환율을 그대로 대입해 0으로 처리.
function computeForeignFxPnL() {
  let fxPnL = 0;
  state.assets.forEach((a) => {
    if (a.currency !== 'USD' || !['주식', 'ETF', '현금'].includes(a.category)) return;
    const buyRate = Number.isFinite(a.buyRate) && a.buyRate > 0 ? a.buyRate : state.exchangeRate;
    fxPnL += num(a.quantity) * num(a.buyPrice) * (state.exchangeRate - buyRate);
  });
  return fxPnL;
}

function renderKPIs() {
  let totalBuy = 0, totalCur = 0, foreignCur = 0, dailyProfit = 0;
  // [부동산 제외 - 금융자산 전용 집계] "총금융자산평가손익"/"일간금융평가손익" 카드는 부동산을 뺀
  // 순수 금융자산 기준으로만 계산한다 - totalBuy/totalCur/dailyProfit(전체, 부동산 포함)와는 별도로
  // financialBuy/financialCur/financialDailyProfit를 따로 누적한다. 부동산 쪽 합계(realEstateBuy/Cur)는
  // "총자산평가금액"/"총자산투자금액" 카드의 부동산 구분값 표기에 쓰인다.
  let financialBuy = 0, financialCur = 0, financialDailyProfit = 0;
  let realEstateBuy = 0, realEstateCur = 0;
  const hasAnyFetchedChange = Object.keys(state.dayChangeMap).length > 0 || Object.keys(state.prevCloseMap).length > 0;
  // 자산군별(주식/채권/현금/부동산 등) 세부 집계 - "총자산평가금액"/"총자산투자금액" 카드 하단 태그용
  // (부동산 포함, 전체 포트폴리오 기준).
  const byCategory = {}; // { category: { buy, cur, dailyPnL } }
  // 소유자별(신랑/와이프/공동 등) 세부 집계 - "총자산평가금액" 카드 하단 태그 전용(부동산 포함).
  const byOwner = {}; // { owner: { dailyPnL, cur, buy } }
  // [금융자산 전용 소유자/자산군별 집계] "총금융자산평가손익"/"일간금융평가손익" 카드 하단 태그는
  // 부동산을 뺀 이 집계를 쓴다.
  const byOwnerFinancial = {}; // { owner: { dailyPnL, cur, buy } }
  const byCategoryFinancial = {}; // { category: { buy, cur, dailyPnL } } - 부동산 키 자체가 없음
  // [자산군별 투자금액 추이 팝업] 소유자×자산군 교차 집계 - 소유자 필터별로도 자산군 구성을 볼 수 있어야
  // 하므로 byOwner/byCategory 둘만으로는 부족하다(둘 다 서로 다른 축으로만 합산된 값이라 "이 소유자의
  // 이 자산군"을 따로 뽑아낼 수 없음). recordDailySnapshot에 그대로 전달해 일자별 스냅샷에도 이 교차
  // 집계 기준으로 남긴다.
  const byOwnerCategory = {}; // { owner: { category: { dailyPnL, cur, buy } } }
  // [일간금융평가손익 카드 - 통화별 표기] 거래 통화(a.currency) 기준 원화/해외통화 일간손익(부동산 제외) -
  // 계산 로직은 전혀 바꾸지 않고 이미 구한 dp(원화 환산 완료된 값)를 통화 라벨로 다시 묶기만 한다.
  const byCurrency = {}; // { '원화': { dailyPnL }, '해외통화': { dailyPnL } }

  state.assets.forEach(a => {
    const r = calcRow(a);
    const dp = calcDailyPnL(a, r);
    const isRealEstate = a.category === '부동산';
    totalBuy += r.buyAmount;
    totalCur += r.curAmount;
    if (r.isForeign) foreignCur += r.curAmount;
    dailyProfit += dp;
    if (isRealEstate) {
      realEstateBuy += r.buyAmount;
      realEstateCur += r.curAmount;
    } else {
      financialBuy += r.buyAmount;
      financialCur += r.curAmount;
      financialDailyProfit += dp;
    }

    const catKey = categoryDisplayKey(a);
    if (!byCategory[catKey]) byCategory[catKey] = { buy: 0, cur: 0, dailyPnL: 0 };
    byCategory[catKey].buy += r.buyAmount;
    byCategory[catKey].cur += r.curAmount;
    byCategory[catKey].dailyPnL += dp;

    if (!byOwner[a.owner]) byOwner[a.owner] = { dailyPnL: 0, cur: 0, buy: 0 };
    byOwner[a.owner].dailyPnL += dp;
    byOwner[a.owner].cur += r.curAmount;
    byOwner[a.owner].buy += r.buyAmount;

    if (!byOwnerCategory[a.owner]) byOwnerCategory[a.owner] = {};
    if (!byOwnerCategory[a.owner][catKey]) byOwnerCategory[a.owner][catKey] = { dailyPnL: 0, cur: 0, buy: 0 };
    byOwnerCategory[a.owner][catKey].dailyPnL += dp;
    byOwnerCategory[a.owner][catKey].cur += r.curAmount;
    byOwnerCategory[a.owner][catKey].buy += r.buyAmount;

    if (!isRealEstate) {
      if (!byOwnerFinancial[a.owner]) byOwnerFinancial[a.owner] = { dailyPnL: 0, cur: 0, buy: 0 };
      byOwnerFinancial[a.owner].dailyPnL += dp;
      byOwnerFinancial[a.owner].cur += r.curAmount;
      byOwnerFinancial[a.owner].buy += r.buyAmount;

      if (!byCategoryFinancial[catKey]) byCategoryFinancial[catKey] = { buy: 0, cur: 0, dailyPnL: 0 };
      byCategoryFinancial[catKey].buy += r.buyAmount;
      byCategoryFinancial[catKey].cur += r.curAmount;
      byCategoryFinancial[catKey].dailyPnL += dp;

      const currencyLabel = a.currency === 'KRW' ? '원화' : '해외통화';
      if (!byCurrency[currencyLabel]) byCurrency[currencyLabel] = { dailyPnL: 0 };
      byCurrency[currencyLabel].dailyPnL += dp;
    }
  });

  // [금융자산평가손익 - 부동산 제외] 예전엔 totalCur-totalBuy(전체)를 썼으나, 이제 financialCur/Buy로
  // 부동산을 뺀 순수 금융자산 손익만 계산한다.
  const totalProfit = financialCur - financialBuy;
  const totalProfitRate = financialBuy !== 0 ? (totalProfit / financialBuy) * 100 : 0;

  document.getElementById('kpiTotalValue').textContent = fmtKRW(totalCur);
  document.getElementById('kpiTotalCost').textContent = fmtKRW(totalBuy);
  // [4가지/3가지 구분값 표기] 총자산평가금액/총자산투자금액 카드에 금융자산·부동산 세부 금액을 채운다.
  document.getElementById('kpiFinancialValue').textContent = fmtKRW(financialCur);
  document.getElementById('kpiRealEstateValue').textContent = fmtKRW(realEstateCur);
  document.getElementById('kpiFinancialCost').textContent = fmtKRW(financialBuy);
  document.getElementById('kpiRealEstateCost').textContent = fmtKRW(realEstateBuy);
  // [보유 부동산 없으면 숨김 - 요청 반영] renderKpiBreakdown의 "Math.round(val) !== 0이면 표시" 규칙과
  // 동일한 기준을 재사용한다 - 부동산을 아예 보유하지 않는 사용자에게는 "부동산 0원" 줄이 두 KPI
  // 카드에 영구히 남아있지 않게 한다. hidden/items-flex 토글도 renderKpiBreakdown과 동일한 패턴
  // (hidden과 flex 계열 클래스를 동시에 두지 않음 - Tailwind 캐스케이드 순서에 따라 hidden이 무시될 수 있음).
  const realEstateValueRow = document.getElementById('kpiRealEstateValueRow');
  realEstateValueRow.classList.toggle('hidden', Math.round(realEstateCur) === 0);
  realEstateValueRow.classList.toggle('flex', Math.round(realEstateCur) !== 0);
  const realEstateCostRow = document.getElementById('kpiRealEstateCostRow');
  realEstateCostRow.classList.toggle('hidden', Math.round(realEstateBuy) === 0);
  realEstateCostRow.classList.toggle('flex', Math.round(realEstateBuy) !== 0);
  renderKpiBreakdown('kpiTotalValueOwnerBreakdown', byOwner, o => o.cur, fmtKRWShort, false, 'text-xs text-slate-500 dark:text-slate-400', true);
  renderKpiBreakdown('kpiTotalValueBreakdown', byCategory, c => c.cur, fmtKRWShort, false);
  renderKpiBreakdown('kpiTotalCostBreakdown', byCategory, c => c.buy, fmtKRWShort, false);

  // [알림 배너] 직전 시세 갱신에서 실패한 종목이 1건이라도 있으면 총평가금액/총평가손익 카드 바로 위
  // 독립 배너(kpiFetchFailurePanel)에 실패 종목 안내 + [실패 종목 일괄 재조회] 버튼을 보여준다. 실패
  // 0건이면(전부 성공했거나 애초에 갱신을 한 번도 안 돌렸으면) 배너 자체를 숨긴다(hidden = display:none
  // 이라 공간을 차지하지 않는다). '총 투자금액' 카드는 이제 이 실패 상태와 무관하게 항상 정상 내용을 보여준다.
  const failedAssets = state.assets.filter((a) => state.priceFetchFailedIds.has(a.id));
  const hasFetchFailure = failedAssets.length > 0;
  document.getElementById('kpiFetchFailurePanel').classList.toggle('hidden', !hasFetchFailure);
  if (hasFetchFailure) {
    document.getElementById('kpiFetchFailureNames').textContent = failedAssets.map((a) => a.name || a.ticker).join(', ');
    // 매 렌더링마다 버튼을 기본 상태로 되돌린다 - 재조회 도중(disabled/"재조회 중...")이었더라도
    // 재조회가 끝나 이 패널이 다시 그려질 시점에는 항상 눌러줄 수 있는 상태여야 한다.
    document.getElementById('retryFailedPricesBtn').disabled = false;
    document.getElementById('retryFailedPricesBtnText').textContent = '실패 종목 일괄 재조회';
  }

  // [Phase 17 P1-1] 금융자산 평가금액 보조정보 - 이미 위에서 집계된 financialCur(부동산 제외)를
  // 그대로 재사용한다(새 계산 없음, 총자산현황 탭의 kpiFinancialValue와 동일한 값·동일한 범위).
  document.getElementById('kpiFinancialValueInline').textContent = fmtKRW(financialCur);

  const profitEl = document.getElementById('kpiTotalProfit');
  profitEl.textContent = fmtSigned(totalProfit);
  profitEl.className = 'text-lg font-bold ' + profitColor(totalProfit);
  const profitRateEl = document.getElementById('kpiTotalProfitRate');
  profitRateEl.textContent = fmtPct(totalProfitRate);
  profitRateEl.className = 'text-xs font-semibold mt-0.5 ' + profitColor(totalProfitRate);
  // 총 손익 바로 아래: 소유자(신랑/와이프/공동 등)별 금액+수익률(부동산 제외) - 다른 태그보다 눈에
  // 잘 띄도록 크게 표시
  renderKpiOwnerProfitBreakdown('kpiTotalProfitOwnerBreakdown', byOwnerFinancial);
  renderKpiBreakdown('kpiTotalProfitBreakdown', byCategoryFinancial, c => c.cur - c.buy, fmtSignedShort, true);
  // [총 실현손익 배지] 세부내용 버튼 밑 - 지금까지의 매도 건 전체 누적 실현손익(getTotalRealizedPnL,
  // 부동산 매매 실현손익도 포함 - 거래내역 기준이라 부동산 제외 여부와 무관하게 항상 전체를 본다).
  // 위 총금융자산평가손익 계산(totalProfit = financialCur - financialBuy, 미실현)과는 완전히 독립된
  // 별도 표시다.
  renderRealizedBadge('kpiTotalRealizedBadge', getTotalRealizedPnL(), '총 실현손익');

  // 일간 변동률(%)의 분모는 "전일 기준 금융자산" = 현재 금융자산에서 오늘 하루 손익만큼을 뺀 값
  // (부동산 제외).
  const prevTotal = financialCur - financialDailyProfit;
  const dailyProfitRate = prevTotal !== 0 ? (financialDailyProfit / prevTotal) * 100 : 0;

  const dailyEl = document.getElementById('kpiDailyProfit');
  dailyEl.textContent = fmtSigned(financialDailyProfit);
  dailyEl.className = 'text-lg font-bold ' + profitColor(financialDailyProfit);
  const dailyRateEl = document.getElementById('kpiDailyProfitRate');
  dailyRateEl.textContent = fmtPct(dailyProfitRate);
  dailyRateEl.className = 'text-xs font-semibold mt-0.5 ' + profitColor(dailyProfitRate);
  document.getElementById('kpiDailyHint').textContent = hasAnyFetchedChange ? '실시간 반영 + 수동 변동률' : '수동 변동률';
  // 총 손익 바로 아래: 소유자(신랑/와이프/공동 등) 기준 세부 손익(부동산 제외) - 다른 태그보다 눈에
  // 잘 띄도록 크게 표시
  renderKpiBreakdown('kpiDailyOwnerBreakdown', byOwnerFinancial, o => o.dailyPnL, fmtSignedShort, true, 'text-sm font-semibold', true);
  // 그 바로 아래: 거래 통화(원화/해외통화) 기준 일간손익(부동산 제외) - 소유자 태그와 동일한 글씨 크기로 표시
  renderKpiBreakdown('kpiDailyCurrencyBreakdown', byCurrency, c => c.dailyPnL, fmtSignedShort, true, 'text-sm font-semibold');
  // 카드 하단: 다른 KPI 카드와 동일하게 자산군 기준 세부 손익(부동산 제외)
  renderKpiBreakdown('kpiDailyProfitBreakdown', byCategoryFinancial, c => c.dailyPnL, fmtSignedShort, true);
  // [오늘 실현손익 배지] 세부내용 버튼 밑 - 오늘 매도해서 발생한 실현손익(getTodayRealizedPnL, 부동산
  // 매매 포함). 위 dailyProfit(미실현 평가손익) 계산은 전혀 건드리지 않고, 별도로 계산해 배지로만 덧붙인다.
  renderRealizedBadge('kpiTodayRealizedBadge', getTodayRealizedPnL(), '오늘 실현손익');

  // [4가지 구분값 표기] 총자산평가금액 카드의 달러자산 라인 - 예전엔 "(달러자산 ...)"처럼 메인 숫자
  // 옆에 괄호로 병기했으나, 이제 금융자산/부동산과 같은 줄 형식(라벨+금액)으로 통일했다.
  document.getElementById('kpiForeignValueInline').textContent = fmtKRW(foreignCur);

  // [달러자산 누적 환차손익] computeForeignFxPnL 참고 - 기존 손익 색상 규칙(양수=빨강/음수=파랑) 그대로 적용.
  const fxPnL = computeForeignFxPnL();
  const fxPnlEl = document.getElementById('kpiForeignFxPnl');
  fxPnlEl.textContent = fmtSigned(fxPnL);
  fxPnlEl.className = 'font-semibold truncate ' + profitColor(fxPnL);

  // [일별 손익 추이 팝업] 오늘 날짜 스냅샷을 항상 최신값으로 덮어쓴다 - 사용자 입력 없이 렌더링될
  // 때마다 자동으로 쌓이는 히스토리(recordDailySnapshot 참고).
  recordDailySnapshot(totalCur, dailyProfit, byOwner, byOwnerCategory);
}

// [주요 금융 자산 Top 5] 집계: 소유자/계좌가 달라도 같은 티커면 수량·평가금액·매입금액을 하나로
// 합산한다(예: 같은 ETF를 신랑 ISA와 와이프 ISA에 나눠 담은 경우). 티커가 없는 자산(채권/현금/부동산
// 직접보유)은 애초에 순위 대상이 아니므로 집계에서 제외한다. 필터와 무관하게 전체 포트폴리오 기준.
function getTopHoldings() {
  const groups = {}; // ticker -> { name, isDomestic, isForeign, curAmount(KRW), buyAmount(KRW), curAmountOriginal(자산통화), dailyPnL(KRW) }
  state.assets.forEach((a) => {
    const ticker = String(a.ticker ?? '').trim();
    if (!ticker) return;
    const r = calcRow(a);
    // [버그 수정 - 평가금액 0원인 유령 자산 제외] 예전엔 수량만 확인했으나, 채권처럼 수동 등록하는
    // 자산은 수량은 남아있어도 시세 미입력으로 평가금액만 0인 경우가 있다 - 실제 평가금액이 0인
    // 자산을 걸러야 전량 매도/미입력 두 경우 다 순위 후보에서 빠진다(포트폴리오 구성 탭 리밸런싱
    // 가이드·엑셀 다운로드와 동일한 기준).
    if (Math.round(r.curAmount) === 0) return;
    if (!groups[ticker]) {
      groups[ticker] = { ticker, name: a.name, isDomestic: a.isDomestic, isForeign: r.isForeign, curAmount: 0, buyAmount: 0, curAmountOriginal: 0, dailyPnL: 0, currentPrice: a.currentPrice };
    }
    const g = groups[ticker];
    g.curAmount += r.curAmount;
    g.buyAmount += r.buyAmount;
    g.curAmountOriginal += num(a.quantity) * num(a.currentPrice); // 원래 통화(원화 또는 달러) 기준 평가금액
    // [Top5 당일손익 컬럼] 소유자/계좌가 달라도 같은 티커면 당일손익도 합산한다(평가금액/평가손익과 동일한 규칙).
    g.dailyPnL += calcDailyPnL(a, r);
  });
  return Object.values(groups);
}

/* -------------------------------------------------------------------------
 * 11-A. [핵심종목 실시간] 헤더 버튼 팝업 - 보유 주식/ETF 중 평가금액 상위 5개(한국시각 기준 국내/해외
 *    자동 전환)의 실시간 시세를 그 자리에서 즉석 조회해 보여준다. 기존 목록/그래프와 달리 저장된 시세를
 *    쓰지 않고 팝업을 열 때마다 fetchPriceWithFallback()으로 매번 새로 받아온다.
 * ---------------------------------------------------------------------- */
// 07:00~21:00(KST)은 국내 장(+시간외 포함) 시간대라 국내 종목을, 그 외(밤 9시~다음날 아침 7시)는
// 미국 장 시간대라 해외 종목을 보여준다. hour12:false가 자정을 "24"로 반환하는 일부 브라우저 구현
// 차이를 %24로 방어한다.
// [시간대별 국내/해외 분기] 07:00~20:00(오전 7시~저녁 8시 미만)은 국내 정규장 시간대라 국내 핵심종목을,
// 20:00~07:00(저녁 8시~다음날 오전 7시 미만)은 미국 장 시간대라 해외 핵심종목을 보여준다.
function getCoreStocksRegion() {
  const kstHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit' }), 10) % 24;
  return (kstHour >= 7 && kstHour < 20) ? 'domestic' : 'foreign';
}

// 무티커 자산(현금/채권/부동산)과 주식/ETF가 아닌 자산, 전량 매도 포지션은 공통으로 제외한다 - RISK
// 카드가 쓰는 RISK_ELIGIBLE_CATEGORIES(['주식','ETF'])와 동일한 기준. 같은 티커를 소유자별로 나눠 든
// 경우 getTopHoldings()처럼 평가금액을 합산해 하나로 보여준다(신랑+와이프가 같이 든 SK하이닉스가 두
// 줄로 안 나뉘게). filterFn으로 지역(국내/해외)·통화 조건을 추가로 좁힌다.
function buildCoreStockGroups(filterFn) {
  const groups = {};
  state.assets.forEach((a) => {
    const ticker = String(a.ticker ?? '').trim();
    if (!ticker || !RISK_ELIGIBLE_CATEGORIES.includes(a.category)) return;
    if (num(a.quantity) <= 0) return; // 전량 매도 포지션은 핵심종목 후보에서 제외
    if (!filterFn(a)) return;
    // assetId: 이 티커를 대표하는 자산 하나의 id - 같은 티커는 통화/현재가가 항상 동일하므로, 아래
    // getCoreStockInfoFromState()가 여기서 굳이 다시 API를 부르지 않고 이미 갱신된 state.assets/
    // dayChangeMap/prevCloseMap 값을 그대로 읽어오는 데 쓴다.
    if (!groups[ticker]) groups[ticker] = { ticker, name: a.name, curAmount: 0, qty: 0, assetId: a.id };
    groups[ticker].curAmount += calcRow(a).curAmount;
    // [원화 환산 전 원래 통화 수량] 핵심종목 팝업이 자산관리 카드와 동일하게 당일 변동금액을 "해당
    // 종목의 원래 통화(달러 등)" 기준으로 보여주려면(coreStockRowHtml 참고) curAmount(원화 환산 합계)가
    // 아니라 원래 통화 단위의 총 보유수량이 필요하다 - 같은 티커는 통화가 항상 같으므로 그대로 합산.
    groups[ticker].qty += num(a.quantity);
  });
  return Object.values(groups).sort((a, b) => b.curAmount - a.curAmount);
}

// [야간(해외) 시간대 2단계 추출] 국내는 기존대로 isDomestic='국내' 상위 5개 그대로. 해외는 ⓐ해외
// 통화(USD 등) 종목을 평가금액 내림차순으로 먼저 채우고, ⓐ만으로 5개가 안 차면 ⓑ원화로 거래되는
// 해외자산군(국내 상장 해외지수 ETF 등)을 평가금액 내림차순으로 이어 붙여 5개를 채운다. ⓐ+ⓑ를 합쳐도
// 5개 미만이면(보유 해외 종목 자체가 적은 경우) 국내 종목으로 보충하지 않고 있는 만큼만 보여준다.
function getCoreStockCandidates(region) {
  if (region === 'domestic') {
    return buildCoreStockGroups((a) => a.isDomestic === '국내').slice(0, 5);
  }
  const foreignCurrency = buildCoreStockGroups((a) => a.isDomestic === '해외' && a.currency === 'USD');
  if (foreignCurrency.length >= 5) return foreignCurrency.slice(0, 5);
  const krwDenominated = buildCoreStockGroups((a) => a.isDomestic === '해외' && a.currency !== 'USD');
  return foreignCurrency.concat(krwDenominated).slice(0, 5);
}

// [중복 조회 제거] 이 팝업이 열리는 시점(부팅 직후는 항상, 수동 버튼도 대부분)은 refreshPricesAndRates()가
// 이미 모든 보유 자산의 현재가/등락률(state.dayChangeMap)/전일종가(state.prevCloseMap)를 최신으로
// 받아둔 뒤다 - 보유 상위 5개 종목은 전부 그 안에 포함된 자산이므로, fetchPriceWithFallback을 또
// 호출하면 방금 끝난 시세 갱신과 똑같은 API를 5번 더 부르는 순수 낭비다(그만큼 팝업이 늦게 뜨고
// 부팅 체감 로딩도 길어짐 - 실측 신고된 문제). 이미 state에 있는 값을 그대로 재사용한다. 지수(코스피
// 등)는 보유 자산이 아니라 이 갱신에 포함되지 않으므로 그건 계속 별도로 실시간 조회한다.
function getCoreStockInfoFromState(candidate) {
  const asset = state.assets.find((a) => a.id === candidate.assetId);
  if (!asset || !Number.isFinite(asset.currentPrice) || asset.currentPrice <= 0) return null;
  return {
    price: asset.currentPrice,
    changePercent: num(state.dayChangeMap[asset.id]),
    previousClose: state.prevCloseMap[asset.id],
    currency: asset.currency,
    session: state.sessionMap[asset.id], // 자산관리 카드와 동일한 세션 배지(프리/정규/애프터/장마감)에 쓰인다
    regularMarketPrice: asset.regularMarketPrice, // 정규장/장외 병행 표기(extendedHoursSublineHtml)용
    todayOpen: asset.todayOpen, todayHigh: asset.todayHigh, todayLow: asset.todayLow // 미니 당일 봉차트용
  };
}

// [종목명 클릭 시 상세 차트 연동] data-open-stock-detail을 붙여두면 문서 전역 위임 리스너(약
// 7550번째 줄 근처, openStockDetailModal 참고)가 그대로 처리한다 - 보유 중인 자산이면 실제 보유
// 정보까지 있는 상세 모달을, 아니면(이 팝업의 지수처럼 보유 자산이 아닌 경우) 차트만 보여주는
// 경량 버전을 자동으로 골라 연다. 새 리스너를 따로 달 필요가 없다.
// [자산관리 카드와 동일한 표기 포맷] 종목명 옆 등락률/변동금액(changeInlineHtml과 동일한 조합·색상
// 규칙), 가격 옆 시간외 세션 배지(SESSION_BADGE_META, derivePresentation과 동일한 테이블)를 그대로
// 재사용해 자산관리 탭의 종목 카드와 시각적으로 똑같이 보이게 한다. 변동금액은 dailyChangeAmountNative와
// 동일하게 "원래 통화(달러 등) 기준 총 보유수량 × 전일 대비 가격변화"로 계산한다 - c.curAmount는
// 이미 원화로 환산된 값이라(calcRow) 그대로 fmtSignedNative(isForeign=true)에 넣으면 달러 표시인데
// 실제로는 원화 액수가 찍히는 단위 불일치가 생기므로, 반드시 c.qty(원래 통화 수량 합계)를 써야 한다.
function coreStockRowHtml(c, info) {
  const isForeign = info.currency === 'USD';
  const unit = isForeign ? '$' : '';
  const changeColorClass = profitColor(info.changePercent);
  const changeText = fmtPct(info.changePercent);
  const dailyChangeAmount = (typeof info.previousClose === 'number' && info.previousClose > 0)
    ? c.qty * (info.price - info.previousClose)
    : c.qty * info.price * (info.changePercent / 100);
  // [등락률/금액 위치 변경] 종목명 옆(괄호)이 아니라, 원래 티커가 있던 두 번째 줄 자리에 표시한다 -
  // 티커 자체는 이제 화면에 안 보인다(data-ticker 속성에는 그대로 남아있어 클릭 시 상세 모달 연동은
  // 그대로 동작한다).
  const changeLine = `<span class="text-[11px] font-medium ${changeColorClass}">${changeText} / ${fmtSignedNative(dailyChangeAmount, isForeign)}</span>`;
  const sessionMeta = SESSION_BADGE_META[info.session];
  const sessionBadge = sessionMeta
    ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded ${sessionMeta.cls}" title="${sessionMeta.title}">${sessionMeta.label}</span>`
    : '';
  const extendedHoursSub = extendedHoursSublineHtml(info.session, info.regularMarketPrice, info.previousClose, isForeign);
  const candle = miniCandleSvg(info.todayOpen, info.todayHigh, info.todayLow, info.price);
  return `
  <div class="flex items-center justify-between gap-2 py-3 border-b border-slate-50 dark:border-slate-800/70 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-1.5 -mx-1.5"
    data-open-stock-detail data-ticker="${escapeHtml(c.ticker)}" data-name="${escapeHtml(c.name)}">
    <div class="min-w-0">
      <div class="font-medium text-sm truncate hover:underline">${escapeHtml(c.name)}</div>
      <div class="truncate">${changeLine}</div>
    </div>
    <div class="flex items-center gap-2 shrink-0 pl-2">
      <div class="text-right">
        <div class="text-sm font-semibold">${unit}${fmtNum(info.price, 2)}${sessionBadge}</div>
        ${extendedHoursSub}
      </div>
      ${candle}
    </div>
  </div>`;
}
function coreStockRowHtmlError(c) {
  return `
  <div class="flex items-center justify-between gap-2 py-3 border-b border-slate-50 dark:border-slate-800/70 last:border-0">
    <div class="min-w-0">
      <div class="font-medium text-sm truncate">${escapeHtml(c.name)}</div>
      <div class="text-[11px] text-slate-400 font-mono truncate">${escapeHtml(c.ticker)}</div>
    </div>
    <div class="text-right shrink-0 pl-2 text-[11px] font-medium text-amber-500 dark:text-amber-400">⚠️ 시세 조회 실패</div>
  </div>`;
}

// [주요 지수 요약] 국내/해외 시간대 구분 없이 항상 전부 보여준다(요청 사양) - INDEX_TICKERS(RISK
// 엔진 벤치마크용, 아래쪽에 선언됨)와 별개로 표시 순서/이름을 이 목록에서 직접 관리한다.
const MARKET_INDEX_LIST = [
  { ticker: '^KS11', name: '코스피' },
  { ticker: '^KQ11', name: '코스닥' },
  { ticker: '^GSPC', name: 'S&P 500' },
  { ticker: '^IXIC', name: '나스닥' }
];

function coreIndexCardHtml(c, info) {
  const isUp = info.changePercent >= 0;
  const colorClass = info.changePercent === 0 ? 'text-slate-400 dark:text-slate-500' : (isUp ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400');
  return `
  <div class="rounded-lg border border-slate-100 dark:border-slate-800 px-1.5 py-2 text-center cursor-pointer hover:border-brand-300 dark:hover:border-brand-700"
    data-open-stock-detail data-ticker="${escapeHtml(c.ticker)}" data-name="${escapeHtml(c.name)}">
    <div class="text-[10px] text-slate-400 truncate">${escapeHtml(c.name)}</div>
    <div class="text-[12px] font-semibold truncate">${fmtNum(info.price, 1)}</div>
    <div class="text-[10px] font-medium ${colorClass}">${isUp ? '+' : ''}${fmtNum(info.changePercent, 2)}%</div>
  </div>`;
}
function coreIndexCardHtmlError(c) {
  return `
  <div class="rounded-lg border border-slate-100 dark:border-slate-800 px-1.5 py-2 text-center">
    <div class="text-[10px] text-slate-400 truncate">${escapeHtml(c.name)}</div>
    <div class="text-[10px] text-amber-500 dark:text-amber-400 mt-1">조회 실패</div>
  </div>`;
}

// [중복 조회 제거 - 지수] refreshPricesAndRates()가 이 갱신 주기 안에서 지수도 함께 조회해
// state.marketIndexCache에 채워둔다(위 marketIndexCache 선언부 참고) - 보유 종목과 동일한 이유로,
// 팝업을 열 때마다 또 조회하지 않고 이 캐시를 먼저 읽는다.
function getMarketIndexInfoFromState(ticker) {
  const cached = state.marketIndexCache[ticker];
  if (!cached || !Number.isFinite(cached.price) || cached.price <= 0) return null;
  return cached;
}

// 팝업이 열려있는 동안 다시 열거나(리렌더) 닫힌 뒤에 늦게 도착하는 응답이 화면을 덮어쓰지 않도록
// 매 호출마다 토큰을 새로 발급해 마지막 호출의 응답만 반영한다(다른 비동기 모달들과 동일한 패턴).
let coreStocksRequestToken = 0;
async function openCoreStocksModal() {
  const region = getCoreStocksRegion();
  const regionLabel = region === 'domestic' ? '국내' : '해외';
  const timeRangeLabel = region === 'domestic' ? '07:00~20:00' : '20:00~07:00';
  document.getElementById('coreStocksModalTitle').textContent = `${regionLabel} 핵심 종목 실시간 시세 (${timeRangeLabel})`;
  document.getElementById('coreStocksModal').classList.remove('hidden');
  pushModalHistoryState();

  const listEl = document.getElementById('coreStocksList');
  const loadingEl = document.getElementById('coreStocksLoading');
  const emptyEl = document.getElementById('coreStocksEmptyMsg');
  const indexGridEl = document.getElementById('coreStocksIndexGrid');
  listEl.innerHTML = '';
  indexGridEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');

  const candidates = getCoreStockCandidates(region);
  const token = ++coreStocksRequestToken;

  // 보유 종목/지수 둘 다 이미 갱신된 state 값을 우선 재사용하고(getCoreStockInfoFromState/
  // getMarketIndexInfoFromState), 혹시 그 값이 아직 없는 예외적인 경우(예: 시세 갱신이 그 사이
  // 실패했을 때)에만 그 항목 하나만 개별적으로 실시간 조회로 보충한다 - 정상적인 경우 이 팝업은
  // 네트워크 요청을 전혀 새로 만들지 않는다.
  const indexInfoPromises = MARKET_INDEX_LIST.map((c) => {
    const cached = getMarketIndexInfoFromState(c.ticker);
    if (cached) return Promise.resolve({ status: 'fulfilled', value: cached });
    return fetchPriceWithFallback(c.ticker, c.name)
      .then((value) => ({ status: 'fulfilled', value }))
      .catch(() => ({ status: 'rejected' }));
  });
  const stockInfoPromises = candidates.map((c) => {
    const cached = getCoreStockInfoFromState(c);
    if (cached) return Promise.resolve({ status: 'fulfilled', value: cached });
    return fetchPriceWithFallback(c.ticker, c.name)
      .then((value) => ({ status: 'fulfilled', value }))
      .catch(() => ({ status: 'rejected' }));
  });

  const [indexResults, stockResults] = await Promise.all([
    Promise.all(indexInfoPromises),
    Promise.all(stockInfoPromises)
  ]);
  if (token !== coreStocksRequestToken) return; // 그 사이 팝업이 닫히거나 다시 열렸으면 이 응답은 버린다

  loadingEl.classList.add('hidden');
  indexGridEl.innerHTML = MARKET_INDEX_LIST.map((c, i) => {
    const res = indexResults[i];
    return res.status === 'fulfilled' ? coreIndexCardHtml(c, res.value) : coreIndexCardHtmlError(c);
  }).join('');

  if (candidates.length === 0) {
    emptyEl.textContent = `보유 중인 ${regionLabel} 주식/ETF 종목이 없습니다.`;
    emptyEl.classList.remove('hidden');
  } else {
    listEl.innerHTML = candidates.map((c, i) => {
      const res = stockResults[i];
      return res.status === 'fulfilled' ? coreStockRowHtml(c, res.value) : coreStockRowHtmlError(c);
    }).join('');
  }
  lucide.createIcons();
}
function closeCoreStocksModal(viaBackButton) {
  coreStocksRequestToken++; // 진행 중이던 조회가 있었다면 그 응답을 무시 처리
  document.getElementById('coreStocksModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('coreStocksLiveBtn').addEventListener('click', () => openCoreStocksModal());
// [타이틀 영역 터치 닫기] 헤더(타이틀+X버튼) 전체를 눌러도 닫히도록 - X버튼은 자체 핸들러에서
// stopPropagation해 이 리스너까지 중복으로 닫기 처리가 전파되지 않게 막는다.
document.getElementById('coreStocksModalHeader').addEventListener('click', () => closeCoreStocksModal());
document.getElementById('closeCoreStocksModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeCoreStocksModal();
});
document.getElementById('coreStocksModal').addEventListener('click', (e) => {
  if (e.target.id === 'coreStocksModal') closeCoreStocksModal();
});

// list: 이미 상위 5개로 잘라낸 한 지역(국내 또는 해외)의 합산 종목 배열.
// grandTotal: 예전엔 비중(%) 계산에 썼으나 [최종 5열 확정] Top5에서 비중 열을 제외하면서 더는 쓰이지
// 않는다 - 호출부(renderTopHoldings)와의 시그니처 호환을 위해 인자만 남겨둔다.
function renderTopHoldingsTable(containerId, list, grandTotal) {
  const tbody = document.getElementById(containerId);
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">보유 종목 없음</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((g) => {
    const profit = g.curAmount - g.buyAmount;
    // 당일손익률 분모는 renderKPIs()의 dailyProfitRate와 동일한 규칙(전일 기준 평가금액 = 오늘 평가금액
    // - 오늘 하루 손익)을 이 종목(합산 그룹) 단위로 그대로 적용한다. 이 값이 곧 "당일 실시간 주가등락율"
    // 열이다(보유수량은 하루 안에 안 바뀌므로 포지션 당일손익률 = 종목 당일 주가등락률과 동일).
    const prevDayAmount = g.curAmount - g.dailyPnL;
    const dailyRate = prevDayAmount !== 0 ? (g.dailyPnL / prevDayAmount) * 100 : 0;
    // [Top5 표시값 - 평가금액 대신 현재주가] 국내는 원화 표기("72,500원"), 해외는 달러 표기("$182.50")로
    // 보여준다 - 정렬 기준(Top5 선정 순서)은 그대로 평가금액(curAmount) 합산 기준을 유지하고, 화면에
    // 노출되는 숫자만 종목의 현재가로 바꾼다.
    const valueHtml = g.isForeign ? `$${fmtNum(g.currentPrice, 2)}` : `${krwFmt.format(Math.round(num(g.currentPrice)))}원`;
    // [최종 5열 확정] 상품명·평가금액·등락률·당일손익·총손익 5개의 독립된 열로 나란히 배치한다(비중은
    // 제외, 카드 상단 comment 참고) - 손익 금액 아래 수익률을 두 줄로 쌓지 않고 각 지표를 한 열의
    // 한 줄 값으로만 표시해야 세로 높이가 줄어 좁은 화면에도 가로 스크롤 없이 들어간다.
    return `
    <tr class="border-b border-slate-50 dark:border-slate-800/70 last:border-b-0">
      <td class="py-1.5 pr-1 font-medium truncate cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(g.ticker)}" data-name="${escapeHtml(g.name)}" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</td>
      <td class="py-1.5 px-1 text-right whitespace-nowrap">${valueHtml}</td>
      <td class="py-1.5 px-1 text-right whitespace-nowrap ${profitColor(g.dailyPnL)}">${fmtPct(dailyRate)}</td>
      <td class="py-1.5 px-1 text-right whitespace-nowrap ${profitColor(g.dailyPnL)}">${fmtSignedShort(g.dailyPnL)}</td>
      <td class="py-1.5 pl-1 text-right whitespace-nowrap ${profitColor(profit)}">${fmtSignedShort(profit)}</td>
    </tr>`;
  }).join('');
}

// [모바일 2단(두 줄) 카드 레이아웃] 640px 미만 전용 - 좁은 화면에서 5열 표(text-[10px])가 너무 작아
// 읽기 어렵다는 신고에 따라, 종목당 두 줄짜리 큼직한 카드로 대체한다(위 hidden sm:block 표와 데이터는
// 완전히 동일, 화면 폭에 따라 둘 중 하나만 보임 - index.html 참고). 1줄: 종목명 + 현재가/등락률,
// 2줄: 당일손익 + 총손익. 계산 로직(dailyRate/profit/valueHtml)은 renderTopHoldingsTable과 동일하게
// 맞춰 두 레이아웃의 숫자가 항상 일치하도록 한다.
function renderTopHoldingsMobileCards(containerId, list) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">보유 종목 없음</p>`;
    return;
  }
  container.innerHTML = list.map((g) => {
    const profit = g.curAmount - g.buyAmount;
    const prevDayAmount = g.curAmount - g.dailyPnL;
    const dailyRate = prevDayAmount !== 0 ? (g.dailyPnL / prevDayAmount) * 100 : 0;
    const valueHtml = g.isForeign ? `$${fmtNum(g.currentPrice, 2)}` : `${krwFmt.format(Math.round(num(g.currentPrice)))}원`;
    return `
    <div class="rounded-xl border border-slate-100 dark:border-slate-800 px-3.5 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
      data-open-stock-detail data-ticker="${escapeHtml(g.ticker)}" data-name="${escapeHtml(g.name)}">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-base font-semibold truncate min-w-0">${escapeHtml(g.name)}</span>
        <span class="flex items-baseline gap-1.5 shrink-0">
          <span class="text-base font-semibold">${valueHtml}</span>
          <span class="text-sm font-semibold ${profitColor(g.dailyPnL)}">${fmtPct(dailyRate)}</span>
        </span>
      </div>
      <div class="flex items-baseline justify-between gap-2 mt-2">
        <span class="text-sm"><span class="text-slate-400 dark:text-slate-500">당일손익</span> <span class="font-semibold ${profitColor(g.dailyPnL)}">${fmtSignedShort(g.dailyPnL)}</span></span>
        <span class="text-sm"><span class="text-slate-400 dark:text-slate-500">총손익</span> <span class="font-semibold ${profitColor(profit)}">${fmtSignedShort(profit)}</span></span>
      </div>
    </div>`;
  }).join('');
}

function renderTopHoldings() {
  const groups = getTopHoldings();
  // 비중(%)의 분모는 국내/해외를 합친 "티커가 존재하는 전체 상품"의 합계 평가금액 하나로 통일한다 -
  // 두 표(국내/해외 Top 5)가 서로 다른 기준으로 100%를 잡으면 두 표를 나란히 비교하기 어렵기 때문이다.
  const grandTotal = groups.reduce((s, g) => s + g.curAmount, 0);
  const domestic = groups.filter((g) => g.isDomestic === '국내').sort((a, b) => b.curAmount - a.curAmount).slice(0, 5);
  const foreign = groups.filter((g) => g.isDomestic === '해외').sort((a, b) => b.curAmount - a.curAmount).slice(0, 5);
  renderTopHoldingsTable('topHoldingsDomestic', domestic, grandTotal);
  renderTopHoldingsTable('topHoldingsForeign', foreign, grandTotal);
  renderTopHoldingsMobileCards('topHoldingsDomesticMobile', domestic);
  renderTopHoldingsMobileCards('topHoldingsForeignMobile', foreign);
  // 시세 갱신 등으로 표 내용(행 수)이 바뀌면 펼쳐진 상태의 max-height도 새 내용 높이에 맞게 갱신해야
  // 한다 - 거래 목록 아코디언의 setAccordionOpen 재적용과 동일한 이유.
  reapplyTopHoldingsAccordionHeights();
}

// [Top 5 드롭다운(아코디언)] 공간 절약을 위해 기본은 접힘 상태 - 헤더를 누르면 펼쳐진다.
let topHoldingsAccordionOpen = { domestic: false, foreign: false };
function reapplyTopHoldingsAccordionHeights() {
  const suffixMap = { domestic: 'Domestic', foreign: 'Foreign' };
  Object.keys(suffixMap).forEach((key) => {
    const suffix = suffixMap[key];
    const body = document.getElementById(`topHoldings${suffix}Body`);
    const chevron = document.getElementById(`topHoldings${suffix}Chevron`);
    if (body && chevron) setAccordionOpen(body, chevron, topHoldingsAccordionOpen[key]);
  });
}
document.getElementById('topHoldingsDomesticToggleBtn').addEventListener('click', () => {
  topHoldingsAccordionOpen.domestic = !topHoldingsAccordionOpen.domestic;
  reapplyTopHoldingsAccordionHeights();
});
document.getElementById('topHoldingsForeignToggleBtn').addEventListener('click', () => {
  topHoldingsAccordionOpen.foreign = !topHoldingsAccordionOpen.foreign;
  reapplyTopHoldingsAccordionHeights();
});

