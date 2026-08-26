/* -------------------------------------------------------------------------
 * 17. 실시간 환율 조회 - 다중 소스 "동시" 경쟁 (순차 폴백 아님)
 *    모바일/APK(WebView) 환경은 프록시 왕복 지연이 desktop보다 크고 특정 프록시가 아예 막혀 있는
 *    경우도 흔해서, 5개 소스를 순서대로 기다리면 최악의 경우 1분 가까이 걸릴 수 있다. 그래서 전부
 *    동시에 요청을 보내고 가장 먼저 성공하는 응답만 채택한다 - 느리거나 죽은 소스가 있어도 다른
 *    소스가 살아있으면 그 응답 속도로 끝난다.
 * ---------------------------------------------------------------------- */
async function fetchFxFromSource(src) {
  const res = await fetchWithTimeout(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = src.parse ? await src.parse(res) : await safeParseJsonResponse(res);
  const krw = data && data.rates && data.rates.KRW;
  if (!krw || !Number.isFinite(krw)) throw new Error('KRW 환율 필드 없음');
  // [일간 손익 기준선] previousClose는 Yahoo 소스(parseYahooFxChartJson)에만 있고, 하루-1회 스냅샷
  // 소스(open.er-api 등)는 애초에 "전일 마감" 개념 자체가 없어 항상 null이다 - 호출부가 null을
  // 받으면 오늘 날짜로 이미 캐시된 공식값을 대신 쓴다(applyOfficialFxReference 참고).
  const previousClose = (data && Number.isFinite(data.previousClose)) ? Math.round(data.previousClose * 100) / 100 : null;
  return { rate: Math.round(krw * 100) / 100, previousClose };
}

// 한 단계(소스 배열)를 Promise.any로 경쟁시킨다 - 가장 먼저 성공하는 소스를 채택하고, 전부 실패하면
// AggregateError.errors(입력 순서 보존)로 소스별 실패 사유를 모은 에러를 던진다.
async function raceFxSourceTier(sources) {
  try {
    return await Promise.any(sources.map((src) => fetchFxFromSource(src)));
  } catch (aggregateErr) {
    const reasons = aggregateErr.errors || [];
    const errors = reasons.map((e, i) => `${sources[i].name}: ${e && e.message}`);
    throw new Error(errors.join(' | '));
  }
}

// [일간 손익 기준선 - 기기 무관 통일] 예전엔 "이 기기가 오늘 처음 로드된 순간의 환율"을 그날의
// 기준선으로 삼아(ensureDailyReference가 그 순간의 state.exchangeRate를 그대로 저장) 기기마다
// 서로 다른 값이 굳어지는 문제가 있었다(데스크탑/모바일 접속 시각이 달라 "일간금융평가손익"이
// 크게 어긋남 - 실사용자 리포트로 확인). 이제 Yahoo KRW=X가 공식으로 제공하는 전일 마감 환율
// (previousClose/chartPreviousClose)을 그대로 기준선으로 쓴다 - 같은 날짜라면 어느 기기에서
// 조회하든 Yahoo가 돌려주는 값은 동일하므로 기기 간 "일간" 손익이 원 단위까지 일치하게 된다.
// previousClose를 못 받은 경우(하루-1회 스냅샷 소스로 폴백했거나 그 소스마저 실패)는, 오늘 날짜로
// 이미 캐시해 둔 공식값이 있으면 그 값을 그대로 재사용하고(day-keyed, LS_REF_RATE), 오늘 단 한
// 번도 공식값을 못 받았으면(예: 오늘 첫 실행부터 Yahoo가 전부 막혀 있음) 최후의 수단으로 지금
// 환율을 그대로 기준선으로 쓴다(이 경우에만 기기 간 값이 갈릴 수 있다 - 정말 예외적인 장애 상황).
function applyOfficialFxReference(previousClose) {
  const todayKey = todayDateStr();
  if (Number.isFinite(previousClose) && previousClose > 0) {
    state.refExchangeRate = previousClose;
    localStorage.setItem(LS_REF_RATE, JSON.stringify({ date: todayKey, rate: previousClose }));
    return;
  }
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(LS_REF_RATE) || 'null'); } catch (e) { /* 손상된 값이면 무시 */ }
  state.refExchangeRate = (cached && cached.date === todayKey && Number.isFinite(cached.rate)) ? cached.rate : state.exchangeRate;
}

async function fetchExchangeRate() {
  // [실시간 우선, 스냅샷은 최종 폴백] 두 단계를 같은 Promise.any 배열에 한꺼번에 넣지 않는다 - 넣으면
  // 가벼운 스냅샷 API가 Yahoo보다 항상 먼저 끝나서 매번 stale한 값이 채택되는 버그가 있었다(위 상수
  // 선언부 주석 참고). 그래서 1단계(실시간)를 먼저 끝까지 시도하고, 그게 전부 실패할 때만 2단계
  // (스냅샷)로 넘어가는 순차 폴백으로 구조를 바꿨다 - 이래야 "순위"가 실제로 순위대로 작동한다.
  try {
    const result = await raceFxSourceTier(FX_SOURCES_REALTIME);
    state.exchangeRate = result.rate;
    document.getElementById('exchangeRateInput').value = state.exchangeRate;
    persistRate(true); // 배경 자동 갱신 - 동기화 push 안 함(위 skipPush 주석 참고)
    applyOfficialFxReference(result.previousClose);
  } catch (realtimeErr) {
    try {
      const result = await raceFxSourceTier(FX_SOURCES_SNAPSHOT_FALLBACK);
      state.exchangeRate = result.rate;
      document.getElementById('exchangeRateInput').value = state.exchangeRate;
      persistRate(true); // 배경 자동 갱신 - 동기화 push 안 함
      applyOfficialFxReference(result.previousClose);
      console.warn(`[환율조회] 실시간 소스 전부 실패, 스냅샷 소스로 폴백함:\n${realtimeErr.message}`);
    } catch (fallbackErr) {
      console.error(`[환율조회 실패] 모든 소스 실패:\n[실시간]\n${realtimeErr.message}\n[스냅샷]\n${fallbackErr.message}`);
      throw new Error(`${realtimeErr.message} | ${fallbackErr.message}`);
    }
  }
}

/* -------------------------------------------------------------------------
 * 18. 실시간 시세 조회 - 다중 소스 폴백 체인
 *    - Yahoo Finance v8 × 5개 프록시(allorigins/corsproxy.io/codetabs/allorigins-get/r.jina.ai) + Stooq CSV,
 *      총 6개 소스를
 *      "동시에" 요청해서 가장 먼저 성공하는 응답만 채택한다(순차 폴백이 아니라 경쟁 방식).
 *    각 시도는 실패 사유를 개별적으로 콘솔에 남기고, 모든 시도가 실패하면 기존 currentPrice를
 *    그대로 유지한다(예외 안전) - 호출부에서 이 함수가 던진 에러를 잡아 UI에 반영한다.
 * ---------------------------------------------------------------------- */
// [2026-07 확인] Yahoo가 v8/finance/chart meta에서 preMarketPrice/postMarketPrice/marketState 필드를
// 완전히 제거했다(interval=1d든 includePrePost=true를 주든 더 이상 내려오지 않음 - v7/finance/quote를
// 인증 필수로 막은 것과 같은 흐름의 무료 API 잠금으로 보인다). 대신 분봉 단위(interval=2m)로 요청하면
// timestamp[]/indicators.quote[0].close[] 배열에 프리/애프터마켓 체결 틱이 그대로 남아있어서, 그 배열의
// "마지막 유효 틱"이 어느 세션(pre/regular/post) 시간대에 속하는지를 meta.currentTradingPeriod의 시간
// 경계와 비교해 판별하는 방식으로 시간외 시세를 채택한다. 국내(KRX)는 Yahoo가 애초에 시간외 데이터를
// 채워주지 않는 경우가 많아(meta.hasPrePostMarketData: false) 이 경로를 타도 정규장 종가로 자연 폴백된다.
// changePercent도 더 이상 meta에서 내려오지 않으므로 previousClose 대비 직접 계산한다.
function pickCurrentPriceFromChart(result, yahooTicker, name) {
  const meta = result.meta;
  const period = meta.currentTradingPeriod;
  const ts = result.timestamp || [];
  const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  const prevCloseRaw = (typeof meta.previousClose === 'number') ? meta.previousClose
    : (typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null);

  // [휴장일 이중 반영 방지 - 정규장 기준값] regularMarketTime/regularMarketPrice는 세션(post/pre/closed)
  // 판정과 무관하게 항상 meta에서 그대로 가져온다 - price가 시간외 틱으로 바뀌어도 이 둘은 오직 "가장
  // 최근에 완료된 정규장"만 가리키므로, 일간손익 계산의 안정적인 기준(정규장 종가)이자 새 정규장이
  // 열렸는지 판별하는 체결 시각으로 쓸 수 있다.
  const regularMarketTime = typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : null;
  const regularMarketPrice = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
  // [미니 당일 봉차트용 OHLC] range=1d 응답의 분봉 배열(open/high/low)에서 당일 시가·고가·저가를
  // 뽑아낸다 - open은 체결이 있었던 첫 봉의 시가, high/low는 체결이 있었던 봉들의 고가/저가 중
  // 최댓값/최솟값이다. 데이터가 아예 없으면(소스 실패 등) null로 남겨 미니 차트가 조용히 숨겨지게 한다
  // (miniCandleSvg 참고).
  const quote0 = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const opens = quote0.open || [];
  const highs = quote0.high || [];
  const lows = quote0.low || [];
  let todayOpen = null, todayHigh = null, todayLow = null;
  for (let i = 0; i < ts.length; i++) {
    if (typeof closes[i] !== 'number') continue;
    if (todayOpen === null && typeof opens[i] === 'number') todayOpen = opens[i];
    if (typeof highs[i] === 'number') todayHigh = (todayHigh === null) ? highs[i] : Math.max(todayHigh, highs[i]);
    if (typeof lows[i] === 'number') todayLow = (todayLow === null) ? lows[i] : Math.min(todayLow, lows[i]);
  }
  const withChangePercent = (price, session) => ({
    price,
    changePercent: (typeof prevCloseRaw === 'number' && prevCloseRaw > 0) ? ((price - prevCloseRaw) / prevCloseRaw * 100) : 0,
    session,
    previousClose: prevCloseRaw,
    regularMarketTime,
    regularMarketPrice,
    todayOpen, todayHigh, todayLow
  });

  // 배열 끝에서부터 null이 아닌 마지막 체결 틱을 찾는다(휴장/거래 없는 구간은 close가 null로 옴).
  let lastIdx = -1;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (typeof closes[i] === 'number') { lastIdx = i; break; }
  }

  const inWindow = (w, atTs) => w && typeof w.start === 'number' && typeof w.end === 'number' && atTs >= w.start && atTs < w.end;

  // [정규장 외 거래 적격성 사전 필터] 국내 티커(.KS/.KQ)에 한해 ETF/ETN·우선주는 시간외 틱이 실제로
  // 있어도 무시한다. Yahoo가 내려주는 meta.instrumentType==='ETF'도 추가 근거로 함께 본다(더 넓게
  // 잡히는 이름 키워드 기반 판정과 OR) - 미국(해외) 티커에는 적용하지 않는다(미국 ETF는 실제로 거래됨).
  const isDomesticTicker = /\.(KS|KQ)$/i.test(yahooTicker || '');
  const ineligible = isDomesticTicker && (isDomesticAfterHoursIneligible(yahooTicker, name) || meta.instrumentType === 'ETF');

  if (!ineligible && lastIdx !== -1 && period) {
    const lastTs = ts[lastIdx];
    const lastClose = closes[lastIdx];
    if (lastClose > 0 && inWindow(period.post, lastTs)) return withChangePercent(lastClose, 'post');
    if (lastClose > 0 && inWindow(period.pre, lastTs)) return withChangePercent(lastClose, 'pre');
  }

  // [버그 수정] 시간외 틱이 없으면 예전에는 무조건 '정규장'으로 표기했다 - 하지만 그건 "정규장 시세값"일
  // 뿐 "지금이 정규장 시간"이란 뜻은 아니다(장 마감 후 저녁/주말에도 regularMarketPrice 자체는 항상
  // 내려온다). marketState 필드가 API에서 제거된 지금은 currentTradingPeriod.regular의 실제 개장/마감
  // epoch 시각과 "지금"을 직접 비교해, 정규장이 실제로 진행 중일 때만 '정규장'으로, 그 외에는 마지막
  // 정규장 종가를 보여주는 것임을 명확히 하는 '장마감'으로 표기한다.
  const nowSec = Date.now() / 1000;
  const inRegularNow = period && inWindow(period.regular, nowSec);
  return withChangePercent(meta.regularMarketPrice, inRegularNow ? 'regular' : 'closed');
}

async function fetchYahooViaProxy(yahooTicker, proxy, name) {
  // interval=2m: meta의 preMarketPrice/postMarketPrice가 더 이상 내려오지 않아, 분봉 배열에서 직접
  // 시간외 틱을 찾아야 한다(위 pickCurrentPriceFromChart 참고). 1분봉 대신 2분봉을 써서 모바일 트래픽
  // 부담을 줄인다 - 시간외 거래 자체가 체결이 뜸해 2분 단위로도 최신 틱을 놓치지 않는다.
  const target = YAHOO_CHART_API + encodeURIComponent(yahooTicker) + '?interval=2m&range=1d&includePrePost=true';
  const res = await fetchWithTimeout(proxy.build(target));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  const meta = result && result.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('가격 필드 없음');
  const picked = pickCurrentPriceFromChart(result, yahooTicker, name);
  return {
    price: picked.price,
    previousClose: picked.previousClose,
    changePercent: picked.changePercent,
    session: picked.session, // 'post' | 'pre' | 'regular' | 'closed' - 테이블에 시간외/장마감 배지를 표시하는 데 쓰인다
    regularMarketPrice: picked.regularMarketPrice, // 시간외 틱과 무관한 정규장 기준가 - calcDailyPnL 전용
    // [휴장일 이중 반영 방지] regularMarketTime(정규장 마지막 체결 epoch초)을 문자열로 그대로 "체결
    // 식별값"으로 쓴다 - 다음 조회 때 이 값이 그대로면 새 정규장이 없었다는 뜻이다.
    lastTradeKey: typeof picked.regularMarketTime === 'number' ? String(picked.regularMarketTime) : undefined,
    instrumentType: meta.instrumentType, // 'EQUITY'|'ETF'|'MUTUALFUND' 등 - .KQ 자동 폴백의 오매칭 검증용
    currency: meta.currency, // [자산 추가 팝업 개선] 종목 검색 시 거래 통화 자동 감지용 - Yahoo가 실제 상장 통화를 그대로 내려준다(USD/KRW/JPY 등)
    // [미니 당일 봉차트] 당일 시가/고가/저가 - miniCandleSvg가 현재가(picked.price)와 함께 캔들 하나로 그린다.
    todayOpen: picked.todayOpen, todayHigh: picked.todayHigh, todayLow: picked.todayLow,
    source: `Yahoo(${proxy.name})`
  };
}

// Stooq는 심볼 표기가 Yahoo와 달라 최선의 노력으로 변환한다: 미국 종목은 '.us', 국내 종목(.KS/.KQ)은 '.kr'.
// KRX 전 종목이 Stooq에 커버되어 있지는 않으므로 실패하면 그냥 다음(없음) 단계로 넘어가 기존 값을 유지한다.
function toStooqSymbol(yahooTicker) {
  const t = yahooTicker.trim();
  if (/\.(KS|KQ)$/i.test(t)) return t.replace(/\.(KS|KQ)$/i, '').toLowerCase() + '.kr';
  if (t.includes('.')) return t.toLowerCase();
  return t.toLowerCase() + '.us';
}

async function fetchStooqPrice(yahooTicker) {
  const symbol = toStooqSymbol(yahooTicker);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;

  let text;
  try {
    const res = await fetchWithTimeout(url, 12000, 'text/csv, text/plain, */*');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (directErr) {
    // stooq.com이 CORS를 막아둔 경우 프록시로 재시도
    const res = await fetchWithTimeout(CORS_PROXIES[0].build(url), 12000, 'text/csv, text/plain, */*');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  }

  // 필드 순서에 의존하지 않도록 헤더 행에서 'Close' 컬럼 위치를 직접 찾아 파싱한다.
  const rows = text.trim().split('\n').map(line => line.split(','));
  if (rows.length < 2) throw new Error('CSV 응답 형식 오류');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const closeIdx = header.indexOf('close');
  if (closeIdx === -1) throw new Error('Close 컬럼 없음');
  const closeRaw = (rows[1][closeIdx] || '').trim();
  if (!closeRaw || closeRaw.toUpperCase() === 'N/D') throw new Error('시세 없음(N/D)');
  const price = parseFloat(closeRaw);
  if (!Number.isFinite(price) || price <= 0) throw new Error('유효하지 않은 가격 값');
  // [미니 당일 봉차트용 OHLC] 요청 URL의 f=sd2t2ohlcv가 이미 시가/고가/저가 컬럼을 포함하고 있어
  // 그대로 재사용한다 - Close와 마찬가지로 값이 없거나 N/D면 null로 남겨 미니 차트를 숨긴다.
  const readCsvNum = (colName) => {
    const idx = header.indexOf(colName);
    if (idx === -1) return null;
    const raw = (rows[1][idx] || '').trim();
    if (!raw || raw.toUpperCase() === 'N/D') return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };
  const todayOpen = readCsvNum('open');
  const todayHigh = readCsvNum('high');
  const todayLow = readCsvNum('low');
  // Stooq 무료 CSV는 등락률/전일종가/시간외 시세를 별도 제공하지 않는다 - 일간 손익 계산은 수동
  // 변동률로 폴백된다. [버그 수정] 라벨은 예전엔 항상 '정규장'이었는데, 이 값은 그냥 마지막 종가일
  // 뿐이라 장이 마감된 뒤에도 '정규장'으로 잘못 표기됐다. Stooq엔 프리/애프터 시세가 없으므로, 지금이
  // 실제 정규장 시간대일 때만 '정규장'으로 표기하고 그 외에는 '장마감'으로 표기한다.
  const timeWindow = /\.(KS|KQ)$/i.test(yahooTicker) ? resolveDomesticTimeWindow() : resolveForeignTimeWindow();
  // [자산 추가 팝업 개선] Stooq는 통화 필드를 안 주므로 티커 형태로만 추정한다(국내면 KRW, 그 외 USD).
  const currency = /\.(KS|KQ)$/i.test(yahooTicker) ? 'KRW' : 'USD';
  // [휴장일 이중 반영 방지] Stooq는 체결 시각을 안 주므로 lastTradeKey는 생략한다(undefined) -
  // calcDailyPnL이 이 경우 기존 주말/세션시각 근사 로직으로 자동 폴백한다. regularMarketPrice는
  // Stooq가 시간외 구분 없이 항상 종가만 주므로 price와 동일하게 채운다.
  return { price, previousClose: null, changePercent: 0, session: timeWindow === 'regular' ? 'regular' : 'closed', currency, regularMarketPrice: price, todayOpen, todayHigh, todayLow, source: 'Stooq' };
}

// 국내(KRX) 티커 전용 - 네이버 금융의 비공식 실시간 API. Yahoo는 meta.preMarketPrice/postMarketPrice
// 필드를 더 이상 제공하지 않고 국내 종목은 애초에 hasPrePostMarketData:false로 시간외 데이터 자체가
// 없는 경우가 많은데, 이 API는 overMarketPriceInfo에 장전/장후 시간외 시세를 명확히 담아준다.
// CORS를 직접 허용해 프록시 없이도 호출 가능하다(확인됨). 국내 티커에 한해 raceFetchPrice의 경쟁
// 소스 목록에 추가되고, 실패하면 자연스럽게 Yahoo/Stooq 결과로 폴백된다.
function parseNaverNum(s) {
  const n = typeof s === 'string' ? parseFloat(s.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
}

// proxy를 생략하면 직접 호출(file://나 CORS 허용 환경에서 잘 동작), proxy를 넘기면 Yahoo와 동일한
// CORS_PROXIES 경유로 재시도한다 - 실서비스 배포 도메인에서 네이버 직접 fetch가 (CORS 정책/통신사·기업
// 방화벽 등 이유로) 실패하는 경우를 대비한 폴백. 직접 호출만 있던 이전 구조는 실패 시 조용히
// Yahoo/Stooq(국내 종목은 시간외 데이터 자체가 없음)로 넘어가 "갱신 완료" 배너는 뜨지만 실제로는 전일
// 종가만 표시되는 문제가 있었다.
async function fetchNaverKrPrice(yahooTicker, proxy, name) {
  const code = yahooTicker.replace(/\.(KS|KQ)$/i, '');
  if (!/^\d{6}$/.test(code)) throw new Error('국내 종목 코드 형식이 아님');
  const target = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
  const res = await fetchWithTimeout(proxy ? proxy.build(target) : target, 8000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = proxy && proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
  const d = json && json.datas && json.datas[0];
  if (!d) throw new Error('종목 데이터 없음');

  const closeRaw = parseNaverNum(d.closePriceRaw);
  const diffRaw = parseNaverNum(d.compareToPreviousClosePriceRaw);
  // [미니 당일 봉차트용 OHLC] 종가(closePriceRaw)와 동일한 명명 규칙의 시가/고가/저가 필드 - 값이
  // 없거나 형식이 다르면 parseNaverNum이 null을 반환해 미니 차트가 조용히 숨겨진다(miniCandleSvg 참고).
  const todayOpen = parseNaverNum(d.openPriceRaw);
  const todayHigh = parseNaverNum(d.highPriceRaw);
  const todayLow = parseNaverNum(d.lowPriceRaw);
  // [0원/깡통 데이터 방지 세이프가드] null뿐 아니라 0 이하도 무효로 본다 - 0원이 그대로 현재가로
  // 반영되면 평가금액이 순간적으로 0원이 되는 사고로 이어진다. 이 경우도 실패로 던져 호출부가
  // 기존 값을 그대로 유지하게 한다(다른 소스들과 동일한 방어 방식 - fetchStooqPrice 참고).
  if (closeRaw === null || closeRaw <= 0) throw new Error('가격 필드 없음 또는 0 이하의 유효하지 않은 값');
  // previousClose(전일 종가)는 "오늘 종가 - 오늘 등락폭"으로 역산한다(네이버가 전일종가 자체는
  // 별도 필드로 안 주고 등락폭만 제공).
  const previousClose = (diffRaw !== null) ? (closeRaw - diffRaw) : null;

  // [장 상태(Market State) 라벨 정비] 예전에는 "시간외 데이터가 있으면 그걸로 pre/post를 정하고,
  // 없으면 무조건 regular"였다 - 그래서 장이 완전히 마감된 저녁/주말에도 실제로는 그냥 당일 종가일
  // 뿐인데 '정규장' 시세인 것처럼 라벨이 붙는 오류가 있었다. 이제는 지금이 물리적으로 몇 시인지
  // (resolveDomesticTimeWindow - KST 08:00/08:50/15:30/20:00 경계)를 먼저 확정하고, 그 시간대에
  // 맞는 실제 시간외 데이터가 있을 때만 프리/애프터로 표기한다. 시간대는 프리/애프터인데 이 종목에
  // 시간외 데이터가 없으면(비유동 종목 등) '장마감'으로 표기한다 - 데이터는 그대로 두되(가격은
  // pre 구간이면 사실상 전일종가, post/장마감 구간이면 당일 정규장 종가) 라벨만 정확히 맞춘다.
  const timeWindow = resolveDomesticTimeWindow();
  const over = d.overMarketPriceInfo;
  const overPrice = over ? parseNaverNum(over.overPrice) : null;
  const hasValidOverPrice = !!(over && over.tradingSessionType && over.tradingSessionType !== 'REGULAR_MARKET' && overPrice !== null && overPrice > 0);
  // [정규장 외 거래 적격성 사전 필터] ETF/ETN·우선주는 API가 어쩌다 시간외 데이터를 흘려보내더라도
  // 무조건 부적격 처리한다 - isDomesticAfterHoursIneligible 참고.
  const ineligible = isDomesticAfterHoursIneligible(yahooTicker, name);

  let price = closeRaw;
  let session = 'closed';
  if (timeWindow === 'regular') {
    session = 'regular';
    price = closeRaw;
  } else if (timeWindow === 'pre' && hasValidOverPrice && !ineligible) {
    session = 'pre';
    price = overPrice;
  } else if (timeWindow === 'post' && hasValidOverPrice && !ineligible) {
    session = 'post';
    price = overPrice;
  }
  // 그 외(장마감/주말, 프리·애프터 시간대인데 시간외 데이터 없음, 또는 ETF/ETN·우선주라 애초에
  // 부적격)는 session='closed' 그대로, price=closeRaw(프리 구간이면 전일 종가, 그 외엔 당일 정규장
  // 종가 - 네이버 API가 그 시점에 실제로 반환하는 값 그대로다).

  const changePercent = (typeof previousClose === 'number' && previousClose > 0) ? ((price - previousClose) / previousClose * 100) : 0;
  // [자산 추가 팝업 개선] 국내(KRX) 종목은 사실상 항상 KRW지만, currencyType.code를 그대로 써서 실제
  // 응답 기준으로 판단한다(하드코딩 방지).
  const currency = (d.currencyType && d.currencyType.code) || 'KRW';
  // [휴장일 이중 반영 방지] localTradedAt(ISO8601, 예: "2026-08-18T08:37:30.43+09:00")은 이 종목의
  // 마지막 실제 체결 시각이다 - 다음 조회 때 이 문자열이 그대로면(새 체결이 없으면) 새 정규장이 없었단
  // 뜻이다. closeRaw는 세션 판정과 무관하게 "가장 최근에 완료된 정규장 종가"만 가리키므로(위 주석
  // 참고, 시간외 틱으로 덮이지 않음) calcDailyPnL의 정규장 기준가로 그대로 쓸 수 있다.
  const lastTradeKey = (typeof d.localTradedAt === 'string' && d.localTradedAt) ? d.localTradedAt : undefined;
  // [종목 분석 모달 - 실제 종목명 확보] 이 API가 실제로 정식 한글 종목명을 어느 필드로 내려주는지
  // 공식 문서가 없어(비공개 API) 알려진 후보 필드명들을 순서대로 시도한다 - 전부 없으면 name은 그냥
  // undefined로 남고, 호출부(analyzeTickerForModal)가 기존처럼 KR_STOCK_NAMES/원본 입력값으로
  // 안전하게 폴백한다(필드명을 잘못 짚어도 동작에 영향 없음).
  const stockName = (typeof d.stockName === 'string' && d.stockName)
    || (typeof d.itemName === 'string' && d.itemName)
    || (typeof d.name === 'string' && d.name)
    || undefined;
  return {
    price, previousClose, changePercent, session, currency,
    regularMarketPrice: closeRaw, lastTradeKey,
    todayOpen, todayHigh, todayLow,
    name: stockName,
    source: proxy ? `Naver(${proxy.name})` : 'Naver(직접)'
  };
}

// 네이버 직접 호출 + CORS_PROXIES 경유 재시도를 Promise.any로 동시 경쟁시킨다 - 직접 호출이 배포
// 환경에서 막혀도(방화벽/CORS 등) 프록시 중 하나가 성공하면 그 값을 채택한다.
async function raceFetchNaverKr(yahooTicker, name) {
  const sourceNames = ['Naver(직접)', ...CORS_PROXIES.map((p) => `Naver(${p.name})`)];
  const attempts = [
    () => fetchNaverKrPrice(yahooTicker, undefined, name),
    ...CORS_PROXIES.map((proxy) => () => fetchNaverKrPrice(yahooTicker, proxy, name))
  ];
  try {
    return await Promise.any(attempts.map((fn) => fn()));
  } catch (aggregateErr) {
    const reasons = aggregateErr.errors || [];
    const errors = reasons.map((e, i) => `${sourceNames[i]}: ${e && e.message}`);
    throw new Error(errors.join(' | '));
  }
}

// yahooTicker 하나를 놓고 CORS_PROXIES 전체 + Stooq(+국내 티커면 네이버)를 동시에 경쟁시킨다
// (Promise.allSettled) - 가장 먼저 성공한 응답을 채택하고, 전부 실패하면 소스별 실패 사유를 담아
// reject한다. CORS_PROXIES 배열 순서/개수가 바뀌어도 자동으로 따라가도록 인덱스 하드코딩 없이 매핑한다.
// Yahoo 프록시 5개 + Stooq를 Promise.any로 경쟁시킨다 - allSettled와 달리 "전부 끝날 때까지"
// 기다리지 않고 가장 먼저 fulfill되는 소스가 나오는 즉시 그 값을 채택한다(진짜 속도 기준 경쟁).
async function raceFetchYahooStooq(yahooTicker, name) {
  const sourceNames = [...CORS_PROXIES.map((p) => `Yahoo(${p.name})`), 'Stooq'];
  const attempts = [
    ...CORS_PROXIES.map((proxy) => () => fetchYahooViaProxy(yahooTicker, proxy, name)),
    () => fetchStooqPrice(yahooTicker)
  ];
  try {
    return await Promise.any(attempts.map((fn) => fn()));
  } catch (aggregateErr) {
    const reasons = aggregateErr.errors || [];
    const errors = reasons.map((e, i) => `${sourceNames[i]}: ${e && e.message}`);
    throw new Error(errors.join(' | '));
  }
}

async function raceFetchPrice(yahooTicker, name) {
  const isKr = /\.(KS|KQ)$/i.test(yahooTicker);
  if (!isKr) return raceFetchYahooStooq(yahooTicker, name);

  // 국내 티커는 "가장 빠른 소스"가 아니라 네이버(직접+프록시 경쟁)를 항상 먼저 시도한다 - 시간외
  // 시세를 실제로 제공하는 유일한 소스라서, 순수 속도 경쟁에 맡기면 우연히 더 빨리 응답한 Yahoo
  // (정규장가로만 폴백됨)가 이겨 시간외 시세가 묻히는 경우가 생길 수 있다. 네이버 쪽(직접+프록시 전부)이
  // 실패할 때만 Yahoo/Stooq 경쟁으로 폴백한다.
  try {
    return await raceFetchNaverKr(yahooTicker, name);
  } catch (naverErr) {
    try {
      return await raceFetchYahooStooq(yahooTicker, name);
    } catch (restErr) {
      throw new Error(`Naver: ${naverErr.message} | ${restErr.message}`);
    }
  }
}

// rawTicker: 사용자가 입력한 원본 티커(예: A005380, 005930, GOOGL). 순수 숫자 6자리만으로는 코스피
// (.KS)인지 코스닥(.KQ)인지 입력 자체에서 구분할 수 없으므로, sanitizeTicker는 일단 .KS로 간주한다.
// .KS 조회가 전부 실패하면(존재하지 않는 코스피 코드일 가능성) 같은 6자리를 .KQ로 자동 재시도한다 -
// 예를 들어 실제로는 코스닥 종목인데 사용자가 접미사 없이 6자리 코드만 입력한 경우를 구제한다.
// (.KS/.KQ를 이미 명시했거나 해외 티커인 경우는 애매하지 않으므로 재시도하지 않는다.)
async function fetchPriceWithFallback(rawTicker, name) {
  const yahooTicker = sanitizeTicker(rawTicker).yahooTicker;
  const trimmedRaw = String(rawTicker ?? '').trim();
  const isAmbiguousKrxCode = /^\d{6}$/.test(trimmedRaw);

  try {
    return await raceFetchPrice(yahooTicker, name);
  } catch (ksErr) {
    if (!isAmbiguousKrxCode) {
      console.error(`[시세조회 실패] ticker="${rawTicker}" (조회용: "${yahooTicker}") - 모든 소스 실패:\n${ksErr.message}`);
      throw ksErr;
    }
    const kqTicker = trimmedRaw + '.KQ';
    try {
      const result = await raceFetchPrice(kqTicker, name);
      // [오매칭 안전장치] 실제로 확인된 사례: 같은 6자리 코드가 KOSDAQ 쪽 전혀 다른 상품(예: 뮤추얼펀드)과
      // 우연히 겹쳐서, 코스피 종목(예: 삼성전자 005930)의 .KS 조회가 일시적으로 실패했을 때 .KQ 쪽이
      // "성공"처럼 보이지만 실제로는 완전히 무관한 상품의 가격을 돌려주는 경우가 있었다(005930.KQ가
      // 삼성전자와 무관한 뮤추얼펀드를 가리킴 - 가격이 전혀 다르게 나옴). Yahoo에서 온 결과는
      // instrumentType이 EQUITY/ETF일 때만 정상적인 폴백으로 인정하고, 그 외는 오매칭으로 간주해
      // 실패 처리한다(엉뚱한 가격을 자산에 잘못 반영하는 것보다 실패로 남기고 기존 값을 유지하는 편이
      // 안전하다). Stooq 등 instrumentType이 없는 소스는 이 검증을 건너뛴다.
      const isYahooResult = typeof result.source === 'string' && result.source.startsWith('Yahoo(');
      const looksLikeWrongInstrument = isYahooResult && result.instrumentType && !['EQUITY', 'ETF'].includes(result.instrumentType);
      if (looksLikeWrongInstrument) {
        throw new Error(`.KQ(${kqTicker}) 응답이 예상과 다른 종류의 상품(${result.instrumentType})으로 확인되어 폴백을 신뢰할 수 없음`);
      }
      console.warn(`[코스닥 폴백 성공] ticker="${rawTicker}" - .KS(${yahooTicker}) 조회 실패 후 .KQ(${kqTicker})로 재시도해 성공했습니다.`);
      return result;
    } catch (kqErr) {
      console.error(`[시세조회 실패] ticker="${rawTicker}" - .KS/.KQ 모두 실패:\n  [.KS] ${ksErr.message}\n  [.KQ] ${kqErr.message}`);
      throw new Error(`${ksErr.message} | (.KQ 재시도도 실패: ${kqErr.message})`);
    }
  }
}

/* -------------------------------------------------------------------------
 * 18-1. [RISK 관리] 개별 종목 정밀 주가 분석 감지 로직
 *    - RSI14 과열(70이상)/추세 이탈(20일선 아래)/52주 고점대비 급락(-30% 이하)/거래량 급증(20일
 *      평균의 2배 이상) 중 하나라도 해당하면 RISK - buildIndividualRiskTags() 참고.
 *    - 대상은 일반계좌 보유 주식/ETF만(REBALANCE_ACCOUNT_TYPE과 동일 범위 - 사용자 확인됨).
 * ---------------------------------------------------------------------- */
// 지수 심볼은 raceFetchPrice()를 그대로 재사용한다(개별 종목과 동일한 Yahoo chart 엔드포인트라
// pickCurrentPriceFromChart가 지수/선물에도 그대로 적용됨). 실측 결과 나스닥/S&P500 지수(^IXIC/^GSPC)
// 자체가 애프터마켓에도 계속 갱신되는 것을 확인해(구성종목이 시간외 거래되는 걸 반영), 별도 선물
// 심볼(NQ=F 등) 없이 지수만으로 정규장+연장장을 모두 커버한다. 국내 지수(코스피/코스닥)는 실제로
// 시간외 데이터가 없어(KRX가 지수 자체는 정규장에만 산출) 시간외 시간대엔 raceFetchPrice가 자동으로
// 직전 정규장 등락률을 그대로 반환한다(사용자 확인된 처리 방식과 일치, 별도 분기 코드 불필요).
const INDEX_TICKERS = { KOSPI: '^KS11', KOSDAQ: '^KQ11', NASDAQ: '^IXIC', SP500: '^GSPC', NASDAQ100: '^NDX', DOW: '^DJI' };
// [시장 현황 & 매크로 브리핑] 보유종목과 무관한 시장 전체 심리/금리 지표 - 위 INDEX_TICKERS와 동일한
// Yahoo chart 엔드포인트(raceFetchPrice/fetchPriceWithFallback)로 그대로 조회되므로 새 API 연동이
// 필요 없다. [확인됨] v8/finance/chart 응답의 ^TNX(미 10년물) price는 실제 수익률(%) 값 그대로 내려온다
// (예: 4.7 → 4.7%, 별도 스케일링 불필요 - 실측으로 확인, renderMacroBriefing() 참고).
// DOW는 MARKET_INDEX_LIST(핵심종목 팝업용, js/02)에는 없어서 이 루프에 얹어 함께 받는다 - 다른
// 화면에는 영향 없이 매크로 브리핑에서만 쓰인다.
const MACRO_TICKERS = { VIX: '^VIX', UST10Y: '^TNX', DOW: '^DJI' };
const RISK_ELIGIBLE_CATEGORIES = ['주식', 'ETF'];

// [벤치마크 다변화] 예전엔 미국 종목을 전부 S&P500 하나로만 비교했다 - 이제 종목 성격별로 더 맞는
// 벤치마크를 골라 베타(시장 민감도) 정밀도를 높인다: 기술/성장주·성장형 ETF는 나스닥100, 대표적인
// 배당/가치주·ETF는 다우존스, 그 외 미국 종목은 기존처럼 S&P500(광범위 시장 평균)에 맡긴다. 실제
// 팩터 모델(Fama-French 스타일)까지는 아니고, 잘 알려진 대형 종목/ETF만 손으로 분류한 근사치다 -
// 매핑에 없는 종목은 안전하게 S&P500 기본값으로 빠진다.
const NASDAQ100_STYLE_TICKERS = new Set([
  'QQQ', 'QQQM', 'TQQQ', 'SOXX', 'SMH', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA',
  'AVGO', 'AMD', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'NOW', 'INTU', 'ASML', 'TSM'
]);
const DOW_STYLE_TICKERS = new Set([
  'DIA', 'SCHD', 'VYM', 'HDV', 'VIG', 'NOBL', 'DVY', 'SPYD', 'SDY', 'JPM', 'V', 'MA', 'JNJ', 'UNH', 'XOM',
  'CVX', 'PG', 'KO'
]);
// [종목 분석 모달 재사용] 보유자산(a) 대신 야후 티커 문자열만으로도 벤치마크를 고를 수 있도록 분리했다
// - 미보유 관심종목(analyzeTickerForModal)은 애초에 자산 객체가 없어 이 함수가 필요하다.
function getBenchmarkKeyForTicker(yahooTicker) {
  if (/\.KQ$/i.test(yahooTicker)) return 'KOSDAQ';
  if (/\.KS$/i.test(yahooTicker)) return 'KOSPI';
  const upper = (yahooTicker || '').toUpperCase();
  if (NASDAQ100_STYLE_TICKERS.has(upper)) return 'NASDAQ100';
  if (DOW_STYLE_TICKERS.has(upper)) return 'DOW';
  return 'SP500';
}
function getBenchmarkKeyForAsset(a) {
  return getBenchmarkKeyForTicker(sanitizeTicker(a.ticker).yahooTicker);
}

function riskEligibleAssets() {
  return state.assets.filter((a) => isRebalanceEligibleAccount(a) && RISK_ELIGIBLE_CATEGORIES.includes(a.category) && String(a.ticker ?? '').trim() !== '' && num(a.quantity) > 0);
}

/* -------------------------------------------------------------------------
 * 18-2. [초보자용 리스크 진단 + 개별 종목 정밀 주가 분석] Beta/VaR/CVaR/Sortino/상관관계/집중도 +
 *    RSI14/이동평균/52주 고점/거래량 계산 엔진
 *    - 화면에는 쉬운 한글 용어로만 보이지만, 내부 계산은 실제 금융공학 지표를 그대로 쓴다: 최근 1년
 *      일별 종가+거래량으로 일간 수익률을 구하고, 그 수익률 시계열로 베타(시장 민감도)/VaR·CVaR(하락 시
 *      예상손실)/Sortino(하방위험 대비 성과)/상관관계를 계산한다. 같은 1년 데이터에서 종목별 RSI14/
 *      20·60일 이동평균/52주 고점 대비 낙폭/거래량 급증까지 함께 뽑아 개별 종목 정밀 분석과 포트폴리오
 *      진단이 하나의 데이터(holdings)를 공유한다(중복 계산 없음).
 *    - 가격 이력이 없는 자산(부동산, 상장 직후라 데이터가 부족한 신규 종목, API 실패 등)은 자동으로
 *      "데이터 부족" 취급되어 계산에서 안전하게 제외되고(0으로 기여), 화면엔 몇 종목이 제외됐는지만
 *      안내한다 - 에러를 던지거나 전체 계산을 막지 않는다.
 * ---------------------------------------------------------------------- */
// 최근 N개월 일별 종가+거래량 - fetchMa20()과 동일한 다중 프록시 경쟁 패턴이며, range만 다르다(기본
// 1년 - 52주 최고가/거래량 이동평균까지 한 번의 조회로 함께 커버하기 위해 6개월에서 1년으로 늘렸다).
async function fetchDailyCloses(yahooTicker, range = '1y') {
  const target = YAHOO_CHART_API + encodeURIComponent(yahooTicker) + '?interval=1d&range=' + range;
  const attempts = CORS_PROXIES.map((proxy) => async () => {
    const res = await fetchWithTimeout(proxy.build(target));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    const quote = (result && result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const rawCloses = quote.close || [];
    const rawVolumes = quote.volume || [];
    const closes = [], volumes = [];
    rawCloses.forEach((c, i) => {
      if (typeof c !== 'number') return; // 종가 없는 날(휴장 등)은 거래량도 함께 건너뛰어 인덱스를 맞춘다
      closes.push(c);
      volumes.push(typeof rawVolumes[i] === 'number' ? rawVolumes[i] : 0);
    });
    if (closes.length < 10) throw new Error('종가 데이터 부족');
    return { closes, volumes };
  });
  try {
    return await Promise.any(attempts.map((fn) => fn()));
  } catch (aggregateErr) {
    return null; // 실패해도 예외를 던지지 않는다 - 호출부가 "데이터 부족"으로 안전하게 처리
  }
}

// ma20Map과 동일한 하루-한-번 캐시 정책 - 같은 티커를 여러 종목(같은 종목을 신랑/와이프가 나눠 보유)이
// 공유해도 실제 네트워크 조회는 한 번만 일어난다. { closes, volumes } 객체를 그대로 캐시/반환한다.
async function getCachedDailyCloses(yahooTicker) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = state.riskHistoryCache[yahooTicker];
  if (cached && cached.date === today) return cached.data;
  const data = await fetchDailyCloses(yahooTicker);
  if (data) state.riskHistoryCache[yahooTicker] = { date: today, data };
  return data;
}

function dailyReturnsFromCloses(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}
function statMean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
// 베타 = Cov(종목 수익률, 벤치마크 수익률) / Var(벤치마크 수익률) - 두 시계열의 최신 구간을 같은
// 길이로 맞춰서 계산한다(거래일이 완벽히 일치하진 않지만 참고용 근사치로 충분하다).
function computeBetaFromReturns(assetReturns, benchmarkReturns) {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < 10) return null;
  const a = assetReturns.slice(-n), b = benchmarkReturns.slice(-n);
  const ma = statMean(a), mb = statMean(b);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); varB += (b[i] - mb) * (b[i] - mb); }
  if (varB === 0) return null;
  return cov / varB;
}
function computeCorrelationFromReturns(x0, y0) {
  const n = Math.min(x0.length, y0.length);
  if (n < 10) return null;
  const x = x0.slice(-n), y = y0.slice(-n);
  const mx = statMean(x), my = statMean(y);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}
// Sortino = 연율화 평균수익률 / 연율화 하방편차(음수 수익률만의 표준편차 성격) - 포트폴리오 전체와
// 개별 종목 양쪽에서 재사용한다(코드 중복 제거).
function computeSortinoFromReturns(returns) {
  if (!returns || returns.length < 10) return null;
  const downside = returns.filter((r) => r < 0);
  const downsideDevDaily = downside.length ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) : 0;
  const annualizedReturn = statMean(returns) * 252;
  const annualizedDownsideDev = downsideDevDaily * Math.sqrt(252);
  return annualizedDownsideDev !== 0 ? annualizedReturn / annualizedDownsideDev : null;
}
// 단순 이동평균(SMA) - 종가/거래량 공통으로 쓴다(마지막 period개 평균).
function computeSMA(arr, period) {
  if (!arr || arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
// RSI(14) - Wilder 전체 평활 대신 최근 14개 등락폭의 단순평균을 쓰는 근사식이다(초보자용 참고 지표라
// 실전 트레이딩 툴 수준의 정밀도까지는 필요 없다는 판단). avgLoss가 0이면(14일 내내 상승만) 100에
// 수렴시킨다.
function computeRSI14(closes) {
  if (!closes || closes.length < 15) return null;
  const period = 14;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff; else losses += -diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
// RSI14 값을 초보자용 상태 라벨로 변환 - 70 이상 과열(과매수), 30 이하 바닥권(과매도), 그 사이는 적정.
function rsiStateLabel(rsi14) {
  if (typeof rsi14 !== 'number') return null;
  if (rsi14 >= 70) return '과열';
  if (rsi14 <= 30) return '과매도';
  return '적정';
}

// [종목 분석 모달] 볼린저 밴드(20일, ±2표준편차) - 중심선(SMA20)과 상/하단, 그리고 현재가가 그 밴드
// 안 어디쯤 있는지(%b, 0=하단 1=상단 0.5=중심선)까지 함께 반환한다.
function computeBollingerBands(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const recent = closes.slice(-period);
  const mid = statMean(recent);
  const variance = recent.reduce((s, c) => s + (c - mid) ** 2, 0) / recent.length;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[closes.length - 1];
  const pctB = (upper - lower) > 0 ? (last - lower) / (upper - lower) : null;
  return { mid, upper, lower, pctB };
}

// [종목 분석 모달] 이동평균 정배열(20>60>120, 상승추세)/역배열(20<60<120, 하락추세)/혼조 판정 - 셋 중
// 하나라도 값이 없으면(가격 이력 부족) null로 안전하게 빠진다.
function maTrendLabel(ma20, ma60, ma120) {
  if (typeof ma20 !== 'number' || typeof ma60 !== 'number' || typeof ma120 !== 'number') return null;
  if (ma20 > ma60 && ma60 > ma120) return '정배열(상승추세)';
  if (ma20 < ma60 && ma60 < ma120) return '역배열(하락추세)';
  return '혼조(추세 불분명)';
}

// [2020 코로나 폭락 재현] 2020-02-19~2020-03-23 실제 벤치마크 지수 낙폭(%, 공개된 역사적 수치) - 종목별
// 실제 2020년 당시 가격을 개별 재조회하는 대신(당시 미상장 종목이 많아 무의미), 지금 계산한 베타를 이
// 실측 낙폭에 곱해 "시장이 그때처럼 다시 급락하면 내 포트폴리오는 베타만큼 상대적으로 더/덜 흔들린다"는
// 근사치를 추정한다 - 화면에 항상 "추정치"임을 명시한다.
const COVID_CRASH_BENCHMARK_DROP_PCT = { KOSPI: -35.7, KOSDAQ: -33.0, SP500: -33.9, NASDAQ100: -28.0, DOW: -37.1 };
// [2022 고금리 기술주 폭락 재현] 2022년 한 해 동안(고점~저점) 실제 벤치마크 지수 낙폭(%, 공개된 역사적
// 수치) - 미 연준의 급격한 금리 인상으로 특히 기술/성장주가 크게 빠졌던 구간이다. 2020 코로나 폭락과
// 같은 방식(베타 × 실측 낙폭)으로 근사한다 - "급락"이 아니라 "장기간에 걸친 약세장"이라는 점에서 2020
// 시나리오와 성격이 달라, 두 시나리오를 함께 보여주면 "짧고 강한 충격" vs "길게 이어지는 하락"을
// 비교해서 감을 잡을 수 있다.
const RATE_HIKE_2022_BENCHMARK_DROP_PCT = { KOSPI: -28.6, KOSDAQ: -35.3, SP500: -25.4, NASDAQ100: -35.1, DOW: -21.2 };

/* -------------------------------------------------------------------------
 * 18-1b. [정밀 포트폴리오 리스크 엔진] 섹터/ETF 룩스루 매핑 + 수급 대체 지표 + 6대 위험요인 계산
 *    - 실시간 API가 아닌 사전 정의 표(SECTOR_MAP/ETF_HOLDINGS_MAP)로 섹터 집중도·ETF 실질노출을
 *      근사 계산한다. 매핑에 없는 종목/ETF는 자동으로 "미분류"로 안전하게 빠진다(계산 오류 없음).
 *    - 수급(외국인·기관 매매동향)은 실제 수급 데이터 소스가 없어 거래량+가격변동 기반 대체 지표를
 *      쓴다 - 화면과 데이터 신뢰도 점수에 항상 "추정치"임을 명시한다.
 * ---------------------------------------------------------------------- */
// 국내 대형주/미국 대형주 섹터 매핑 - 보유 가능성이 높은 종목 위주로만 커버하며, 없는 종목은 "미분류".
const SECTOR_MAP = {
  '005930.KS': '반도체', '000660.KS': '반도체', '035420.KS': 'IT/인터넷', '035720.KS': 'IT/인터넷',
  '051910.KS': '화학/배터리', '006400.KS': '배터리', '373220.KS': '배터리', '005380.KS': '자동차',
  '000270.KS': '자동차', '105560.KS': '금융', '055550.KS': '금융', '086790.KS': '금융',
  '207940.KS': '바이오', '068270.KS': '바이오', '028260.KS': '유통/상사', '015760.KS': '유틸리티',
  'AAPL': 'IT/하드웨어', 'MSFT': 'IT/소프트웨어', 'GOOGL': 'IT/인터넷', 'GOOG': 'IT/인터넷',
  'AMZN': '유통/인터넷', 'NVDA': '반도체', 'AVGO': '반도체', 'TSM': '반도체', 'AMD': '반도체',
  'META': 'IT/인터넷', 'TSLA': '자동차', 'NFLX': '미디어', 'JPM': '금융', 'V': '금융', 'MA': '금융',
  'JNJ': '헬스케어', 'UNH': '헬스케어', 'XOM': '에너지', 'CVX': '에너지', 'PG': '필수소비재', 'KO': '필수소비재'
};
// [종목 분석 모달 - 한글 종목명 매칭] Yahoo Finance 검색 API(searchYahooStocks, js/04)가 한글을 지원하지
// 않아, 국내 대형주는 위 SECTOR_MAP과 동일한 티커 목록에 한글 종목명을 붙인 별도 표로 관리한다 -
// findTickerByKoreanName()이 이 표와 보유 자산 이름을 함께 검색해 티커로 변환한다.
// [2026-08 확장] 18개 대형주만으로는 채권/배당 ETF 등이 검색되지 않는다는 신고를 받아 코스피/코스닥
// 주요종목과 국내 상장 ETF를 대폭 늘렸다. 진짜 KRX 전종목(코스피+코스닥 약 2,800개 이상)을 실시간
// 검색하려면 비공개 자동완성 API(예: 네이버 증권)를 붙여야 하는데, 이 프로젝트를 진행하는 개발 환경
// 에서는 그 API가 실제로 어떤 응답을 주는지 확인할 방법이 없어(네트워크 접근 차단) 검증되지 않은
// 파싱 코드를 넣는 대신 이렇게 직접 검증 가능한 정적 표를 큐레이션하는 방식을 택했다. 티커를 확신할
// 수 없는 종목(합병/개명 이력이 있거나 시리즈가 여러 개인 ETF 등)은 잘못된 종목을 보여주는 사고를
// 막기 위해 일부러 빼뒀다 - 그래서 "전종목"이 아니라 "자주 찾을 만한 주요 종목"까지가 이 표의 범위다.
const KR_STOCK_NAMES = {
  // 코스피 대형주
  '005930.KS': '삼성전자', '000660.KS': 'SK하이닉스', '373220.KS': 'LG에너지솔루션', '207940.KS': '삼성바이오로직스',
  '005380.KS': '현대차', '000270.KS': '기아', '068270.KS': '셀트리온', '005490.KS': 'POSCO홀딩스',
  '035420.KS': 'NAVER', '105560.KS': 'KB금융', '055550.KS': '신한지주', '006400.KS': '삼성SDI',
  '051910.KS': 'LG화학', '035720.KS': '카카오', '028260.KS': '삼성물산', '012330.KS': '현대모비스',
  '066570.KS': 'LG전자', '032830.KS': '삼성생명', '015760.KS': '한국전력', '086790.KS': '하나금융지주',
  '096770.KS': 'SK이노베이션', '018260.KS': '삼성에스디에스', '034730.KS': 'SK', '010130.KS': '고려아연',
  '011200.KS': 'HMM', '009150.KS': '삼성전기', '024110.KS': '기업은행', '323410.KS': '카카오뱅크',
  '000810.KS': '삼성화재', '011170.KS': '롯데케미칼', '010950.KS': 'S-Oil', '090430.KS': '아모레퍼시픽',
  '036570.KS': '엔씨소프트', '352820.KS': '하이브', '138040.KS': '메리츠금융지주', '030200.KS': 'KT',
  '017670.KS': 'SK텔레콤', '033780.KS': 'KT&G', '005940.KS': 'NH투자증권', '016360.KS': '삼성증권',
  '039490.KS': '키움증권', '012450.KS': '한화에어로스페이스', '042660.KS': '한화오션', '004020.KS': '현대제철',
  '001040.KS': 'CJ', '097950.KS': 'CJ제일제당', '128940.KS': '한미약품',
  // 코스닥 주요종목
  '247540.KQ': '에코프로비엠', '086520.KQ': '에코프로', '196170.KQ': '알테오젠', '328130.KQ': '루닛',
  '263750.KQ': '펄어비스', '293490.KQ': '카카오게임즈', '041510.KQ': '에스엠', '035900.KQ': 'JYP Ent.',
  '122870.KQ': '와이지엔터테인먼트', '214150.KQ': '클래시스',
  // 국내 상장 ETF - 지수/시장
  '069500.KS': 'KODEX 200', '102110.KS': 'TIGER 200', '229200.KS': 'KODEX 코스닥150', '091160.KS': 'KODEX 반도체',
  '360750.KS': 'TIGER 미국S&P500', '448290.KS': 'TIGER 미국S&P500TR(H)', '133690.KS': 'TIGER 미국나스닥100', '448300.KS': 'TIGER 미국나스닥100TR(H)',
  // 국내 상장 ETF - 채권형
  '273130.KS': 'KODEX 종합채권(AA-이상)액티브', '363570.KS': 'KODEX 장기종합채권(AA-이상)액티브',
  '451540.KS': 'TIGER 종합채권(AA-이상)액티브', '329750.KS': 'TIGER 미국달러단기채권액티브', '435420.KS': 'TIGER 미국나스닥100채권혼합50'
};
// ETF는 "섹터 비중맵"(합계 약 1.0)으로 등록해 실질 룩스루 노출 계산에 쓴다 - 운용사 팩트시트 기준
// 대략적인 값이며 실시간 구성종목 API가 아니므로 실제 비중과 차이가 있을 수 있다(화면에 항상 명시).
const ETF_HOLDINGS_MAP = {
  'QQQM': { label: '나스닥100', sectorWeights: { 'IT/소프트웨어': 0.30, '반도체': 0.25, 'IT/인터넷': 0.20, '유통/인터넷': 0.10, '헬스케어': 0.05, '기타': 0.10 } },
  'QQQ': { label: '나스닥100', sectorWeights: { 'IT/소프트웨어': 0.30, '반도체': 0.25, 'IT/인터넷': 0.20, '유통/인터넷': 0.10, '헬스케어': 0.05, '기타': 0.10 } },
  'SOXX': { label: '반도체 ETF', sectorWeights: { '반도체': 0.95, '기타': 0.05 } },
  'SMH': { label: '반도체 ETF', sectorWeights: { '반도체': 0.95, '기타': 0.05 } },
  'TQQQ': { label: '나스닥100 3배 레버리지', sectorWeights: { 'IT/소프트웨어': 0.30, '반도체': 0.25, 'IT/인터넷': 0.20, '유통/인터넷': 0.10, '헬스케어': 0.05, '기타': 0.10 } },
  'SCHD': { label: '미국 배당 ETF', sectorWeights: { '금융': 0.20, '필수소비재': 0.15, '헬스케어': 0.15, '에너지': 0.10, 'IT/소프트웨어': 0.10, '기타': 0.30 } },
  'SPY': { label: 'S&P500', sectorWeights: { 'IT/소프트웨어': 0.18, '반도체': 0.10, '금융': 0.13, '헬스케어': 0.12, '유통/인터넷': 0.10, '기타': 0.37 } },
  'SPYM': { label: 'S&P500', sectorWeights: { 'IT/소프트웨어': 0.18, '반도체': 0.10, '금융': 0.13, '헬스케어': 0.12, '유통/인터넷': 0.10, '기타': 0.37 } },
  'VOO': { label: 'S&P500', sectorWeights: { 'IT/소프트웨어': 0.18, '반도체': 0.10, '금융': 0.13, '헬스케어': 0.12, '유통/인터넷': 0.10, '기타': 0.37 } },
  '069500.KS': { label: 'KODEX 200', sectorWeights: { '반도체': 0.30, '금융': 0.15, '자동차': 0.10, '배터리': 0.10, '기타': 0.35 } },
  '102110.KS': { label: 'TIGER 200', sectorWeights: { '반도체': 0.30, '금융': 0.15, '자동차': 0.10, '배터리': 0.10, '기타': 0.35 } },
  'TLT': { label: '미국 장기국채', sectorWeights: { '채권': 1.0 } },
  'IEF': { label: '미국 중기국채', sectorWeights: { '채권': 1.0 } }
};

// 종목의 섹터 비중맵 - 직접 보유는 SECTOR_MAP에서 그 섹터 100%, ETF는 ETF_HOLDINGS_MAP의 룩스루
// 비중맵, 둘 다 없으면 "미분류" 100%(계산은 항상 안전하게 진행되고 화면엔 미분류 비중만 안내한다).
function resolveSectorWeights(ticker) {
  if (ETF_HOLDINGS_MAP[ticker]) return ETF_HOLDINGS_MAP[ticker].sectorWeights;
  if (SECTOR_MAP[ticker]) return { [SECTOR_MAP[ticker]]: 1.0 };
  return { '미분류': 1.0 };
}

// 포트폴리오 전체의 섹터 노출도(ETF 룩스루 포함) - 종목별 비중 × 그 종목의 섹터비중맵을 전부 합산한다.
function computeSectorExposure(holdings) {
  const sectorTotals = {};
  holdings.forEach((h) => {
    const weights = resolveSectorWeights(h.ticker);
    Object.entries(weights).forEach(([sector, frac]) => {
      sectorTotals[sector] = (sectorTotals[sector] || 0) + h.weight * frac;
    });
  });
  const entries = Object.entries(sectorTotals).sort((a, b) => b[1] - a[1]);
  return {
    sectorTotals,
    topSector: entries[0] ? entries[0][0] : null,
    topSectorWeight: entries[0] ? entries[0][1] * 100 : 0,
    unclassifiedWeightPct: (sectorTotals['미분류'] || 0) * 100
  };
}

// HHI(허핀달-허쉬만 지수) = Σ(비중²) - 0(완전분산)~1(단일종목 100%) 사이 값. 단일종목 비중만 볼 때보다
// 포트폴리오 "전체"가 얼마나 몰려있는지 더 정확히 잡아낸다.
function computeHHI(holdings) {
  return holdings.reduce((s, h) => s + h.weight * h.weight, 0);
}

// 연환산 변동성(%) - 일간 수익률 표준편차 × √252.
function computeAnnualizedVolatilityPct(returns) {
  if (!returns || returns.length < 10) return null;
  const mean = statMean(returns);
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// 최대낙폭(MDD, %, 음수) - 종가/지수 시계열에서 그 시점까지의 최고점 대비 최대 하락폭.
function computeMDDFromCloses(closes) {
  if (!closes || closes.length < 2) return null;
  let peak = closes[0], maxDrawdown = 0;
  closes.forEach((c) => {
    if (c > peak) peak = c;
    const drawdown = peak > 0 ? (c - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  });
  return maxDrawdown * 100;
}

// 포트폴리오 단위 MDD - 이미 계산해 둔 포트폴리오 일간 수익률 시계열을 누적곱해 가상의 "포트폴리오
// 지수"를 만든 뒤, 종목 MDD와 동일한 함수로 그 지수의 MDD를 구한다(코드 재사용).
function computePortfolioMDDFromReturns(portfolioReturns) {
  if (!portfolioReturns || portfolioReturns.length < 2) return null;
  const indexSeries = [1];
  portfolioReturns.forEach((r) => indexSeries.push(indexSeries[indexSeries.length - 1] * (1 + r)));
  return computeMDDFromCloses(indexSeries);
}

// [수급 대체 지표] 실제 외국인/기관 매매 데이터가 없어 거래량+가격변동으로 근사 추정한다 - 어디까지나
// 대체 지표이며 데이터 신뢰도 점수에도 항상 이 한계가 반영된다.
// 음봉 대량거래(20일 평균 거래량의 2배 이상 & 당일 -2% 이상 하락) → 매물 압박(outflow)
// 양봉 대량거래(2배 이상 & +2% 이상 상승) → 매수 유입(inflow)
// 거래량이 20일 평균의 40% 이하로 급감 → 관망세 지속(quiet), 그 외에는 안정(neutral).
function computeFlowSignal(h) {
  if (!h.closes || h.closes.length < 2 || !h.volMA20 || typeof h.lastVolume !== 'number') return null;
  const lastChangePct = ((h.closes[h.closes.length - 1] - h.closes[h.closes.length - 2]) / h.closes[h.closes.length - 2]) * 100;
  if (h.lastVolume >= h.volMA20 * 2 && lastChangePct <= -2) return 'outflow';
  if (h.lastVolume >= h.volMA20 * 2 && lastChangePct >= 2) return 'inflow';
  if (h.lastVolume <= h.volMA20 * 0.4) return 'quiet';
  return 'neutral';
}
function flowSignalLabel(signal) {
  if (signal === 'outflow') return { label: '매물 압박', emoji: '🔴' };
  if (signal === 'inflow') return { label: '매수 유입', emoji: '🟢' };
  if (signal === 'quiet') return { label: '관망세 지속', emoji: '🟡' };
  if (signal === 'neutral') return { label: '수급 안정', emoji: '🟢' };
  return { label: '데이터 부족', emoji: '⚪' };
}

// 데이터가 있는 종목들 간 전체 상관계수 행렬 - { tickerA: { tickerB: 상관계수 } }.
function computeFullCorrelationMatrix(withData) {
  const matrix = {};
  withData.forEach((a) => {
    matrix[a.ticker] = {};
    withData.forEach((b) => { matrix[a.ticker][b.ticker] = a.ticker === b.ticker ? 1 : computeCorrelationFromReturns(a.returns, b.returns); });
  });
  return matrix;
}
// 비중 가중 평균 상관관계 - 두 종목의 비중 곱을 가중치로 상관계수를 평균한다. 값이 클수록 "종목 수는
// 많지만 실제로는 같이 움직여 분산 효과가 약하다"는 뜻(운명 공동체 위험).
function computeWeightedAvgCorrelation(withData, matrix) {
  let weightedSum = 0, weightSum = 0;
  for (let i = 0; i < withData.length; i++) {
    for (let j = i + 1; j < withData.length; j++) {
      const corr = matrix[withData[i].ticker][withData[j].ticker];
      if (typeof corr !== 'number') continue;
      const w = withData[i].weight * withData[j].weight;
      weightedSum += corr * w; weightSum += w;
    }
  }
  return weightSum > 0 ? weightedSum / weightSum : null;
}
// [실제 위험 지분 - Risk Contribution] 종목이 "포트폴리오 자체"와 얼마나 같이 움직이는지(포트폴리오를
// 벤치마크로 삼은 베타)를 구해 비중을 곱한다 - 이론상 Σ(비중×베타)=1이라 그대로 위험 기여 비율로 쓸 수
// 있다(반올림/데이터 누락 오차 보정을 위해 마지막에 정규화).
function computeRiskContributions(withData, portfolioReturns) {
  const raw = withData.map((h) => {
    const betaToPortfolio = computeBetaFromReturns(h.returns, portfolioReturns);
    return { ticker: h.ticker, contribution: Math.max(0, (typeof betaToPortfolio === 'number' ? betaToPortfolio : 1) * h.weight) };
  });
  const total = raw.reduce((s, r) => s + r.contribution, 0);
  const byTicker = {};
  raw.forEach((r) => { byTicker[r.ticker] = total > 0 ? (r.contribution / total) * 100 : null; });
  return byTicker;
}
// 임계 구간표를 이용해 실수값을 0~100 위험 점수로 변환하는 공용 헬퍼 - bands는 max 오름차순 배열이며
// 마지막 항목의 max는 Infinity여야 한다.
function scoreFromBands(value, bands) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  for (const b of bands) { if (value <= b.max) return b.score; }
  return bands[bands.length - 1].score;
}

/* -------------------------------------------------------------------------
 * 18-1c. [6대 위험요인 → 0~100 위험점수] 점수가 높을수록 위험하다(챗GPT 제안 구조 채용) - 집중25% +
 *    변동성20% + 손실20% + 시장15% + 상관관계10% + 기술/수급10% 가중합 + 극단위험 가산.
 * ---------------------------------------------------------------------- */
// ① 집중위험 - 단일종목 비중(40%) + HHI(30%) + 섹터 집중도(ETF 룩스루 포함, 30%).
function computeConcentrationRiskScore(m) {
  const singleScore = scoreFromBands(m.topWeight, [
    { max: 10, score: 10 }, { max: 20, score: 30 }, { max: 30, score: 50 },
    { max: 40, score: 70 }, { max: 50, score: 85 }, { max: Infinity, score: 100 }
  ]);
  const hhiScore = scoreFromBands(m.hhi * 100, [
    { max: 15, score: 20 }, { max: 25, score: 40 }, { max: 35, score: 60 },
    { max: 50, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const sectorScore = scoreFromBands(m.sectorExposure.topSectorWeight, [
    { max: 20, score: 10 }, { max: 35, score: 30 }, { max: 50, score: 55 },
    { max: 65, score: 75 }, { max: 80, score: 90 }, { max: Infinity, score: 100 }
  ]);
  return Math.round((singleScore ?? 0) * 0.4 + (hhiScore ?? 0) * 0.3 + (sectorScore ?? 0) * 0.3);
}
// ② 변동성위험 - 포트폴리오 연환산 변동성.
function computeVolatilityRiskScore(m) {
  return scoreFromBands(m.portfolioVolatilityPct, [
    { max: 15, score: 20 }, { max: 20, score: 40 }, { max: 25, score: 60 },
    { max: 30, score: 80 }, { max: Infinity, score: 100 }
  ]) ?? 50;
}
// ③ 손실위험(Drawdown/Tail) - MDD(40%) + VaR95(30%) + CVaR(30%).
function computeDrawdownTailRiskScore(m) {
  const mddScore = scoreFromBands(Math.abs(m.portfolioMDDPct ?? 0), [
    { max: 10, score: 20 }, { max: 20, score: 40 }, { max: 30, score: 60 },
    { max: 40, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const varScore = scoreFromBands(Math.abs(m.var95Pct), [
    { max: 1.5, score: 20 }, { max: 2.5, score: 40 }, { max: 3.5, score: 60 },
    { max: 5, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const cvarScore = scoreFromBands(Math.abs(m.cvarPct), [
    { max: 2.5, score: 20 }, { max: 4, score: 40 }, { max: 6, score: 60 },
    { max: 8, score: 80 }, { max: Infinity, score: 100 }
  ]);
  return Math.round((mddScore ?? 50) * 0.4 + (varScore ?? 50) * 0.3 + (cvarScore ?? 50) * 0.3);
}
// ④ 시장위험 - 포트폴리오 베타(시장 대비 널뛰기 위험).
function computeMarketRiskScore(m) {
  return scoreFromBands(m.portfolioBeta, [
    { max: 0.8, score: 20 }, { max: 1.0, score: 35 }, { max: 1.2, score: 55 },
    { max: 1.4, score: 75 }, { max: Infinity, score: 95 }
  ]) ?? 50;
}
// ⑤ 상관관계위험(운명 공동체) - 비중 가중 평균 상관계수.
function computeCorrelationRiskScore(m) {
  return scoreFromBands(m.weightedAvgCorrelation, [
    { max: 0.3, score: 20 }, { max: 0.5, score: 40 }, { max: 0.7, score: 60 },
    { max: 0.85, score: 80 }, { max: Infinity, score: 100 }
  ]) ?? 40;
}
// ⑥ 기술/수급위험 - 종목별 [RSI 과열도 + 추세이탈 + 수급신호]를 비중가중 평균한다.
function computeTechnicalFlowRiskScore(holdings) {
  const weightSum = holdings.reduce((s, h) => s + h.weight, 0);
  if (weightSum === 0) return 50;
  const weightedScore = holdings.reduce((s, h) => {
    let score = 50;
    if (typeof h.rsi14 === 'number') {
      score = h.rsi14 >= 70 ? 70 + Math.min(30, (h.rsi14 - 70) * 1.5)
        : h.rsi14 <= 30 ? 55
        : 30;
    }
    if (h.trendBroken) score += 15;
    if (h.flowSignal === 'outflow') score += 15;
    if (h.flowSignal === 'inflow') score -= 5;
    return s + Math.max(0, Math.min(100, score)) * h.weight;
  }, 0);
  return Math.round(weightedScore / weightSum);
}
// [종합 위험점수] 6대 요인 가중합 + 극단위험 가산(어느 한 요인이라도 90점 이상이면 +5, 95점 이상이면
// +8 - 다른 요인이 낮다고 평균으로 희석돼 실제로 위험한 포트폴리오가 저평가되는 것을 막는다).
function computeCompositeRiskScore(subScores) {
  const weights = { concentration: 0.25, volatility: 0.20, drawdown: 0.20, market: 0.15, correlation: 0.10, technical: 0.10 };
  const base = Object.entries(weights).reduce((s, [key, w]) => s + (subScores[key] ?? 50) * w, 0);
  const maxSub = Math.max(...Object.values(subScores).map((v) => v ?? 0));
  const extremePenalty = maxSub >= 95 ? 8 : maxSub >= 90 ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(base + extremePenalty)));
}
// [위험점수 신호등] 0~40 🟢양호 / 41~60 🟡주의 / 61~100 🔴위험 - 점수가 높을수록 위험(챗GPT 제안 및
// 요청 사양 그대로). 'safe'/level 명칭은 구 안전점수 체계와 호환되도록 그대로 유지한다.
function riskLevelFromScore(score) {
  if (score <= 40) return { level: 'safe', label: '양호', emoji: '🟢', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50', barClass: 'bg-emerald-500' };
  if (score <= 60) return { level: 'warn', label: '주의', emoji: '🟡', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50', barClass: 'bg-amber-500' };
  return { level: 'danger', label: '위험', emoji: '🔴', colorClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50', barClass: 'bg-red-500' };
}
// [데이터 신뢰도] 위험점수와 별개로 "이 진단이 얼마나 실데이터에 기반했는가"를 보여준다 - 가격 이력이
// 없는 종목 비중 / 섹터·ETF 룩스루 미분류 비중 / 수급이 실제 데이터가 아닌 거래량 기반 추정치라는
// 구조적 한계를 반영한다(최대 92%로 제한 - 100%라고 표시하면 추정치를 실측치처럼 오해할 수 있음).
function computeDataConfidence(m) {
  const totalWeight = m.holdings.reduce((s, h) => s + h.weight, 0) || 1;
  const missingWeight = m.holdings.filter((h) => !h.hasData).reduce((s, h) => s + h.weight, 0);
  const missingPenalty = (missingWeight / totalWeight) * 35;
  const unclassifiedPenalty = (m.sectorExposure.unclassifiedWeightPct / 100) * 20;
  const flowProxyPenalty = 8;
  const score = Math.max(0, Math.min(100, Math.round(100 - missingPenalty - unclassifiedPenalty - flowProxyPenalty)));
  const reasons = [];
  if (missingWeight > 0) reasons.push(`${fmtNum(missingWeight / totalWeight * 100, 0)}% 비중 종목은 가격 이력 부족`);
  if (m.sectorExposure.unclassifiedWeightPct > 0) reasons.push(`${fmtNum(m.sectorExposure.unclassifiedWeightPct, 0)}% 비중 종목은 섹터 미분류`);
  reasons.push('수급 지표는 실제 외국인/기관 매매 데이터가 아닌 거래량 기반 추정치');
  return { score, reasons };
}

/* -------------------------------------------------------------------------
 * 18-1d. [What-If 리밸런싱 시뮬레이션 - Scenario Engine]
 *    - 실제 시세를 다시 받아오지 않고, 이미 계산해 둔 종목별 수익률/베타 시계열에 "새 비중"만 대입해
 *      위험점수가 어떻게 바뀌는지 추정한다(과거 변동성·상관관계 구조가 리밸런싱 후에도 유지된다고
 *      가정하는, 이런 시뮬레이터에서 흔히 쓰는 단순화 - 화면에 "추정치"임을 명시한다).
 * ---------------------------------------------------------------------- */
// newWeightsOverride = { ticker: 새 비중(0~1) } - 언급되지 않은 종목들은 원래 비중 "비율"을 유지한 채
// 남은 비중을 나눠 갖는다(예: SK하이닉스만 59%→35%로 지정하면 나머지 종목들이 비율대로 65%를 채운다).
function computeScenarioRiskMetrics(m, newWeightsOverride) {
  const overrideTickers = Object.keys(newWeightsOverride);
  const overrideWeightSum = overrideTickers.reduce((s, t) => s + newWeightsOverride[t], 0);
  const remainingWeight = Math.max(0, 1 - overrideWeightSum);
  const others = m.holdings.filter((h) => !overrideTickers.includes(h.ticker));
  const othersWeightSum = others.reduce((s, h) => s + h.weight, 0);

  const newHoldings = m.holdings.map((h) => {
    if (overrideTickers.includes(h.ticker)) return { ...h, weight: newWeightsOverride[h.ticker] };
    const scaledWeight = othersWeightSum > 0 ? (h.weight / othersWeightSum) * remainingWeight : 0;
    return { ...h, weight: scaledWeight };
  });

  const withData = newHoldings.filter((h) => h.hasData);
  const withDataWeightSum = withData.reduce((s, h) => s + h.weight, 0);

  const portfolioBeta = withDataWeightSum > 0
    ? withData.reduce((s, h) => s + (typeof h.beta === 'number' ? h.beta : 1) * (h.weight / withDataWeightSum), 0)
    : null;

  const minLen = withData.length ? Math.min(...withData.map((h) => h.returns.length)) : 0;
  const portfolioReturns = [];
  for (let i = 1; i <= minLen; i++) {
    let sum = 0;
    withData.forEach((h) => { sum += h.returns[h.returns.length - i] * (h.weight / withDataWeightSum); });
    portfolioReturns.unshift(sum);
  }
  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const varIdx = Math.max(0, Math.floor(sorted.length * 0.05) - 1);
  const var95Pct = sorted.length ? sorted[varIdx] * 100 : 0;
  const tailReturns = sorted.slice(0, varIdx + 1);
  const cvarPct = tailReturns.length ? statMean(tailReturns) * 100 : var95Pct;
  const portfolioVolatilityPct = computeAnnualizedVolatilityPct(portfolioReturns);
  const portfolioMDDPct = computePortfolioMDDFromReturns(portfolioReturns);

  const hhi = computeHHI(newHoldings);
  const sortedByWeight = [...newHoldings].sort((a, b) => b.weight - a.weight);
  const topWeight = sortedByWeight[0] ? sortedByWeight[0].weight * 100 : 0;
  const sectorExposure = computeSectorExposure(newHoldings);
  const correlationMatrix = computeFullCorrelationMatrix(withData);
  const weightedAvgCorrelation = withData.length >= 2 ? computeWeightedAvgCorrelation(withData, correlationMatrix) : null;

  const scoreInputs = { topWeight, hhi, sectorExposure, portfolioVolatilityPct, portfolioMDDPct, var95Pct, cvarPct, portfolioBeta, weightedAvgCorrelation };
  const subScores = {
    concentration: computeConcentrationRiskScore(scoreInputs),
    volatility: computeVolatilityRiskScore(scoreInputs),
    drawdown: computeDrawdownTailRiskScore(scoreInputs),
    market: computeMarketRiskScore(scoreInputs),
    correlation: computeCorrelationRiskScore(scoreInputs),
    technical: computeTechnicalFlowRiskScore(newHoldings)
  };
  const riskScore = computeCompositeRiskScore(subScores);
  return { topWeight, portfolioVolatilityPct, portfolioMDDPct, var95Pct, cvarPct, portfolioBeta, subScores, riskScore };
}

// 포트폴리오 전체의 리스크 지표를 계산한다 - 실패해도(네트워크 전면 실패 등) null을 반환할 뿐 예외를
// 던지지 않아 refreshPricesAndRates()의 나머지 갱신을 막지 않는다.
// [RISK 카드 - 소유자별 필터] ownerFilter를 생략하거나 'all'이면 지금까지처럼 가구 전체 기준이고,
// 특정 소유자명을 넘기면 그 소유자 보유분(riskEligibleAssets 기준)만으로 같은 계산을 전부 다시 돈다 -
// 종목 단위 1년 시세 이력은 getCachedDailyCloses가 이미 캐시해 둔 값을 재사용하므로 네트워크 재조회가
// 없다(같은 날 안에서는 사실상 즉시 계산된다).
async function computeAdvancedRiskMetrics(ownerFilter) {
  try {
    let assets = riskEligibleAssets();
    if (ownerFilter && ownerFilter !== 'all') assets = assets.filter((a) => a.owner === ownerFilter);
    if (assets.length === 0) return null;
    const totalCur = assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
    if (totalCur === 0) return null;

    // 종목(티커) 단위로 소유자/계좌 합산 - RISK 관리 카드의 병합 기준과 동일하다. currentPrice는 같은
    // 티커면 소유자가 달라도 동일한 시세이므로 처음 만난 값을 그대로 쓴다.
    const byTicker = new Map();
    assets.forEach((a) => {
      const yahoo = sanitizeTicker(a.ticker).yahooTicker;
      const r = calcRow(a);
      if (!byTicker.has(yahoo)) byTicker.set(yahoo, { ticker: yahoo, name: a.name, curAmount: 0, benchmarkKey: getBenchmarkKeyForAsset(a), currentPrice: a.currentPrice });
      byTicker.get(yahoo).curAmount += r.curAmount;
    });
    const holdings = [...byTicker.values()].map((h) => ({ ...h, weight: h.curAmount / totalCur }));

    // 필요한 벤치마크 지수만 모아서 한 번씩만 조회한다.
    const neededBenchmarks = [...new Set(holdings.map((h) => h.benchmarkKey))];
    const benchmarkCloses = {};
    await Promise.all(neededBenchmarks.map(async (key) => {
      const data = await getCachedDailyCloses(INDEX_TICKERS[key]);
      benchmarkCloses[key] = data ? data.closes : null;
    }));
    const benchmarkReturns = {};
    neededBenchmarks.forEach((key) => { benchmarkReturns[key] = benchmarkCloses[key] ? dailyReturnsFromCloses(benchmarkCloses[key]) : null; });

    // [개별 종목 정밀 주가 분석 엔진] 포트폴리오 계산과 완전히 같은 1년 일별 종가/거래량 데이터에서
    // RSI14/이동평균/52주 고점 대비 낙폭/거래량 급증/개별 Sortino까지 한 번에 뽑아 각 holding에
    // 붙여둔다 - RISK 관리 카드(computeRiskClassifiedAssets)와 리스크 진단 보기 상세 카드가 재계산
    // 없이 이 값을 그대로 재사용한다(중복 계산 제거).
    await Promise.all(holdings.map(async (h) => {
      const data = await getCachedDailyCloses(h.ticker);
      h.closes = data ? data.closes : null;
      h.volumes = data ? data.volumes : null;
      h.returns = h.closes ? dailyReturnsFromCloses(h.closes) : null;
      const bmReturns = benchmarkReturns[h.benchmarkKey];
      h.beta = (h.returns && bmReturns) ? computeBetaFromReturns(h.returns, bmReturns) : null;
      h.hasData = !!h.returns;
      h.sortino = h.returns ? computeSortinoFromReturns(h.returns) : null;

      if (h.closes) {
        h.rsi14 = computeRSI14(h.closes);
        h.rsiState = rsiStateLabel(h.rsi14);
        h.ma20 = computeSMA(h.closes, 20);
        h.ma60 = computeSMA(h.closes, 60);
        const latestPrice = typeof h.currentPrice === 'number' ? h.currentPrice : h.closes[h.closes.length - 1];
        h.week52High = Math.max(...h.closes, latestPrice || 0);
        h.week52DrawdownPct = h.week52High > 0 ? ((latestPrice - h.week52High) / h.week52High) * 100 : null;
        h.trendBroken = typeof h.ma20 === 'number' && typeof latestPrice === 'number' ? latestPrice < h.ma20 : false;
      } else {
        h.rsi14 = null; h.rsiState = null; h.ma20 = null; h.ma60 = null;
        h.week52High = null; h.week52DrawdownPct = null; h.trendBroken = false;
      }
      if (h.volumes) {
        h.volMA20 = computeSMA(h.volumes, 20);
        h.lastVolume = h.volumes[h.volumes.length - 1];
        h.volumeSpike = !!(h.volMA20 && typeof h.lastVolume === 'number' && h.lastVolume >= h.volMA20 * 2);
      } else {
        h.volMA20 = null; h.lastVolume = null; h.volumeSpike = false;
      }
      // [정밀 리스크 엔진] 종목 단위 MDD(최대낙폭) + 수급 대체 지표(거래량/가격 기반 추정) - 둘 다 위의
      // closes/volumes/volMA20/lastVolume이 이미 계산된 뒤에 구해야 해서 이 블록 마지막에 둔다.
      h.mdd = h.closes ? computeMDDFromCloses(h.closes) : null;
      h.flowSignal = computeFlowSignal(h);
    }));

    const withData = holdings.filter((h) => h.hasData);
    const missingCount = holdings.length - withData.length;
    const withDataWeightSum = withData.reduce((s, h) => s + h.weight, 0);

    // 포트폴리오 베타 = 데이터 있는 종목들의 비중(그 안에서 재정규화) 가중평균.
    const portfolioBeta = withDataWeightSum > 0
      ? withData.reduce((s, h) => s + (typeof h.beta === 'number' ? h.beta : 1) * (h.weight / withDataWeightSum), 0)
      : null;

    // 포트폴리오 일간 수익률 시계열 = 종목별 수익률의 비중 가중합(공통 길이만큼, 최신 날짜 기준으로
    // 뒤에서부터 정렬) - 완벽한 날짜 매칭은 아니지만 참고용 근사치로 충분하다.
    const minLen = withData.length ? Math.min(...withData.map((h) => h.returns.length)) : 0;
    const portfolioReturns = [];
    for (let i = 1; i <= minLen; i++) {
      let sum = 0;
      withData.forEach((h) => { sum += h.returns[h.returns.length - i] * (h.weight / withDataWeightSum); });
      portfolioReturns.unshift(sum);
    }

    // VaR95/CVaR: 일간 수익률 분포의 하위 5% 지점(과거 실측 분포 기반 - parametric 가정 없음).
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const varIdx = Math.max(0, Math.floor(sorted.length * 0.05) - 1);
    const var95Pct = sorted.length ? sorted[varIdx] * 100 : 0; // 퍼센트 단위, 음수
    const tailReturns = sorted.slice(0, varIdx + 1);
    const cvarPct = tailReturns.length ? statMean(tailReturns) * 100 : var95Pct;

    // Sortino: 연율화한 평균수익률을 연율화한 하방편차(음수 수익률만의 표준편차 성격)로 나눈다(개별
    // 종목과 동일한 computeSortinoFromReturns()를 재사용 - 코드 중복 제거).
    const sortino = computeSortinoFromReturns(portfolioReturns);

    // 집중도(몰빵위험도): 최대 비중 1종목, 상위 3종목 합산 비중.
    const sortedByWeight = [...holdings].sort((a, b) => b.weight - a.weight);
    const topHolding = sortedByWeight[0] || null;
    const topWeight = topHolding ? topHolding.weight * 100 : 0;
    const top3Weight = sortedByWeight.slice(0, 3).reduce((s, h) => s + h.weight, 0) * 100;

    // 상관관계(운명 공동체): 비중 상위 2종목의 일간 수익률 상관계수(화면 표시용) + 전체 종목 간 상관계수
    // 행렬과 비중가중 평균 상관관계(위험점수 계산용, 2종목 이상일 때만 의미가 있다).
    let topCorrelation = null, topCorrelationPair = null;
    const withDataByWeight = withData.slice().sort((a, b) => b.weight - a.weight);
    if (withDataByWeight.length >= 2) {
      topCorrelation = computeCorrelationFromReturns(withDataByWeight[0].returns, withDataByWeight[1].returns);
      topCorrelationPair = [withDataByWeight[0].name, withDataByWeight[1].name];
    }
    const correlationMatrix = computeFullCorrelationMatrix(withData);
    const weightedAvgCorrelation = withData.length >= 2 ? computeWeightedAvgCorrelation(withData, correlationMatrix) : null;

    // [역사적 하락장 스트레스 테스트 - 공용 함수] 종목별 베타 × 그 종목 벤치마크의 실제 낙폭(데이터
    // 없는 종목은 시장과 동일하게 움직인다고 가정해 베타 1.0으로 근사, 안전한 기본값) - 2020 코로나
    // 폭락(급락형)과 2022 고금리 기술주 폭락(장기 약세장형) 두 시나리오를 같은 방식으로 계산한다.
    function computeStressScenario(dropPctMap, fallbackDrop) {
      let lossKRW = 0;
      holdings.forEach((h) => {
        const beta = typeof h.beta === 'number' ? h.beta : 1.0;
        const benchmarkDrop = dropPctMap[h.benchmarkKey] ?? fallbackDrop;
        lossKRW += h.curAmount * (beta * benchmarkDrop / 100);
      });
      const lossPct = totalCur !== 0 ? (lossKRW / totalCur) * 100 : 0;
      return { lossKRW, lossPct };
    }
    const covidStress = computeStressScenario(COVID_CRASH_BENCHMARK_DROP_PCT, -34);
    const rateHike2022Stress = computeStressScenario(RATE_HIKE_2022_BENCHMARK_DROP_PCT, -28);

    // [정밀 포트폴리오 리스크 엔진] 섹터 노출(ETF 룩스루 포함)/HHI/연환산 변동성/MDD/위험기여도를 구하고,
    // 6대 위험요인 → 종합 위험점수(0~100, 높을수록 위험) → 데이터 신뢰도까지 전부 계산해 둔다. 화면은
    // 이 값을 그대로 표시만 하면 되도록, 여기서 최종 형태까지 만들어 반환한다.
    const sectorExposure = computeSectorExposure(holdings);
    const hhi = computeHHI(holdings);
    const portfolioVolatilityPct = computeAnnualizedVolatilityPct(portfolioReturns);
    const portfolioMDDPct = computePortfolioMDDFromReturns(portfolioReturns);
    const riskContributions = computeRiskContributions(withData, portfolioReturns);
    holdings.forEach((h) => { h.riskContributionPct = riskContributions[h.ticker] ?? null; });

    // [단기 vs 장기 변동성 이중 추적 - Risk Spike 감지] 위 portfolioVolatilityPct(최근 1년 연환산)에
    // 더해, 최근 20거래일(약 1개월)만 떼어 같은 방식으로 연환산한 "단기 변동성"을 함께 구한다. 단기가
    // 장기 평균의 1.5배 이상으로 튀면 "최근 들어 갑자기 흔들림이 커졌다"는 신호로 보고 경고를 띄운다
    // (장기 변동성 자체가 0에 가까우면 배수 비교가 무의미해지므로 그 경우는 감지하지 않는다).
    const portfolioVolatilityShortPct = computeAnnualizedVolatilityPct(portfolioReturns.slice(-20));
    const volatilitySpike = typeof portfolioVolatilityShortPct === 'number' && typeof portfolioVolatilityPct === 'number'
      && portfolioVolatilityPct > 0 && portfolioVolatilityShortPct >= portfolioVolatilityPct * 1.5;

    const scoreInputs = { topWeight, hhi, sectorExposure, portfolioVolatilityPct, portfolioMDDPct, var95Pct, cvarPct, portfolioBeta, weightedAvgCorrelation };
    const subScores = {
      concentration: computeConcentrationRiskScore(scoreInputs),
      volatility: computeVolatilityRiskScore(scoreInputs),
      drawdown: computeDrawdownTailRiskScore(scoreInputs),
      market: computeMarketRiskScore(scoreInputs),
      correlation: computeCorrelationRiskScore(scoreInputs),
      technical: computeTechnicalFlowRiskScore(holdings)
    };
    const riskScore = computeCompositeRiskScore(subScores);
    const dataConfidence = computeDataConfidence({ holdings, sectorExposure });

    return {
      totalCur, holdings: sortedByWeight, missingCount, portfolioBeta, var95Pct, cvarPct, sortino,
      var95KRW: totalCur * var95Pct / 100, cvarKRW: totalCur * cvarPct / 100,
      topWeight, top3Weight, topHolding, topCorrelation, topCorrelationPair,
      stressLossKRW: covidStress.lossKRW, stressLossPct: covidStress.lossPct,
      stressLossKRW2022: rateHike2022Stress.lossKRW, stressLossPct2022: rateHike2022Stress.lossPct,
      hhi, sectorExposure, portfolioVolatilityPct, portfolioVolatilityShortPct, volatilitySpike, portfolioMDDPct,
      weightedAvgCorrelation, correlationMatrix, subScores, riskScore, dataConfidence
    };
  } catch (e) {
    console.warn('[리스크 진단] 계산 실패 - 다음 갱신에서 재시도합니다:', e.message);
    return null;
  }
}

/* -------------------------------------------------------------------------
 * 18-4. [종목 분석 & 투자 검토 보고서] 신규 관심종목(미보유 포함) 정밀 분석 엔진
 *    - 보유종목 전용이던 위 엔진(getCachedDailyCloses/computeRSI14/computeSMA/computeBollingerBands/
 *      computeMDDFromCloses/computeBetaFromReturns)이 애초에 "야후 티커 문자열" 하나만 있으면 동작
 *      하도록 범용으로 짜여 있어, 어떤 티커를 넣어도(보유 중이 아니어도) 새 API 연동 없이 그대로
 *      재사용할 수 있다. RISK 관리 카드와 달리 1년치 데이터가 없으면(신규상장 등) 에러 메시지만
 *      반환하고 조용히 실패한다(호출부가 그대로 화면에 안내문으로 보여줌).
 * ---------------------------------------------------------------------- */
// [종목 분석 모달 - 한글 종목명 자동 매칭] 보유 자산 이름(전체 포트폴리오, 완전일치 우선)과
// KR_STOCK_NAMES(주요 대형주 표)를 함께 검색해 야후 티커로 변환한다. 완전일치가 없고 부분일치가
// 여럿이면(예: '삼성'→삼성전자/삼성SDI/삼성바이오로직스/삼성물산) 어느 것인지 특정할 수 없으므로
// null을 반환해 호출부가 "검색창 추천 목록에서 선택하라"고 안내하게 한다 - 잘못된 종목을 임의로
// 골라 분석 결과를 보여주는 것보다 안전하다.
function findTickerByKoreanName(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const heldWithTicker = state.assets.filter((a) => String(a.ticker ?? '').trim() !== '');
  const learnedEntries = Object.entries(state.learnedTickerNames || {});

  const heldExact = heldWithTicker.find((a) => a.name === q);
  if (heldExact) return { ticker: sanitizeTicker(heldExact.ticker).yahooTicker, name: heldExact.name };
  const mapExactEntry = Object.entries(KR_STOCK_NAMES).find(([, name]) => name === q);
  if (mapExactEntry) return { ticker: mapExactEntry[0], name: mapExactEntry[1] };
  const learnedExactEntry = learnedEntries.find(([, name]) => name === q);
  if (learnedExactEntry) return { ticker: learnedExactEntry[0], name: learnedExactEntry[1] };

  const heldPartial = heldWithTicker.filter((a) => a.name.includes(q));
  const mapPartial = Object.entries(KR_STOCK_NAMES).filter(([, name]) => name.includes(q));
  const learnedPartial = learnedEntries.filter(([, name]) => name.includes(q));
  const candidates = [
    ...heldPartial.map((a) => ({ ticker: sanitizeTicker(a.ticker).yahooTicker, name: a.name })),
    ...mapPartial.map(([ticker, name]) => ({ ticker, name })),
    ...learnedPartial.map(([ticker, name]) => ({ ticker, name }))
  ];
  const uniqueTickers = new Set(candidates.map((c) => c.ticker));
  if (uniqueTickers.size === 1) return candidates[0];
  return null;
}

// [종목 분석 모달 - 검색 추천 목록] 보유 자산 + KR_STOCK_NAMES 주요 종목 + learnedTickerNames(이전에
// 검색해서 학습된 종목)를 대상으로 이름/티커 부분일치 후보를 모아 드롭다운에 보여준다. 한글이 아닌
// 입력(영문 티커 등)도 그대로 지원한다.
function searchStockAnalysisCandidates(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  const seen = new Set();
  state.assets.forEach((a) => {
    const ticker = String(a.ticker ?? '').trim();
    if (!ticker) return;
    const yahooTicker = sanitizeTicker(ticker).yahooTicker;
    if (seen.has(yahooTicker)) return;
    if (!`${a.name} ${ticker}`.toLowerCase().includes(q)) return;
    seen.add(yahooTicker);
    results.push({ ticker: yahooTicker, name: a.name, sub: '보유 중' });
  });
  Object.entries(KR_STOCK_NAMES).forEach(([ticker, name]) => {
    if (seen.has(ticker)) return;
    if (!`${name} ${ticker}`.toLowerCase().includes(q)) return;
    seen.add(ticker);
    results.push({ ticker, name, sub: '주요 종목' });
  });
  Object.entries(state.learnedTickerNames || {}).forEach(([ticker, name]) => {
    if (seen.has(ticker)) return;
    if (!`${name} ${ticker}`.toLowerCase().includes(q)) return;
    seen.add(ticker);
    results.push({ ticker, name, sub: '최근 검색' });
  });
  return results.slice(0, 8);
}

async function analyzeTickerForModal(rawInput) {
  const trimmedRaw = String(rawInput || '').trim();
  if (!trimmedRaw) return { error: '티커를 입력해 주세요.' };

  // [한글 종목명 자동 매칭] 한글이 섞인 입력은 티커가 아니라 종목명으로 간주하고 먼저 변환을 시도한다
  // - 순수 티커/코드(영문·숫자)는 이 분기를 타지 않고 기존 로직 그대로 진행된다.
  let searchTicker = trimmedRaw;
  let resolvedName = null;
  if (/[가-힣]/.test(trimmedRaw)) {
    const krMatch = findTickerByKoreanName(trimmedRaw);
    if (!krMatch) {
      return { error: `'${trimmedRaw}' 이름으로 종목을 특정할 수 없습니다 - 검색창에 두 글자 이상 입력하면 뜨는 추천 목록에서 선택해 주세요.` };
    }
    searchTicker = krMatch.ticker;
    resolvedName = krMatch.name;
  }

  // 현재가/등락률은 실패해도(예: 장중 프록시 일시 장애) 아래 기술적 분석은 계속 진행한다 - 표시용
  // 보조 정보일 뿐, 핵심 분석은 1년치 종가 이력(closes)만 있으면 가능하다.
  let priceInfo = null;
  try { priceInfo = await fetchPriceWithFallback(searchTicker, resolvedName || searchTicker); } catch (e) { /* 무시 - 아래 폴백으로 계속 */ }

  let yahooTicker = sanitizeTicker(searchTicker).yahooTicker;
  let data = await getCachedDailyCloses(yahooTicker);
  // [코스닥 구제] 접미사 없는 6자리 국내코드가 코스피(.KS) 조회로 실패하면 코스닥(.KQ)으로 한 번 더
  // 시도한다 - fetchPriceWithFallback의 동일한 구제 로직을 여기서도 재현.
  if ((!data || !data.closes || data.closes.length < 20) && /^\d{6}$/.test(searchTicker)) {
    const kqTicker = searchTicker + '.KQ';
    const kqData = await getCachedDailyCloses(kqTicker);
    if (kqData && kqData.closes && kqData.closes.length >= 20) { yahooTicker = kqTicker; data = kqData; }
  }
  if (!data || !data.closes || data.closes.length < 20) {
    return { error: `'${trimmedRaw}'의 가격 이력을 찾을 수 없습니다 - 티커를 확인해 주세요 (예: 해외는 AAPL, 국내는 005930).` };
  }

  const closes = data.closes;
  const returns = dailyReturnsFromCloses(closes);
  const benchmarkKey = getBenchmarkKeyForTicker(yahooTicker);
  const benchmarkData = await getCachedDailyCloses(INDEX_TICKERS[benchmarkKey]);
  const benchmarkReturns = benchmarkData ? dailyReturnsFromCloses(benchmarkData.closes) : null;

  const currentPrice = (priceInfo && Number.isFinite(priceInfo.price)) ? priceInfo.price : closes[closes.length - 1];
  const ma20 = computeSMA(closes, 20);
  const ma60 = computeSMA(closes, 60);
  const ma120 = computeSMA(closes, 120);
  const week52High = Math.max(...closes, currentPrice || 0);
  const rsi14 = computeRSI14(closes);

  // [주가 위치 참고선 - 액션 지시 아님] "최근 3개월(약 60거래일) 동안 가장 높았던/낮았던 가격"을
  // 순수 참고 정보로만 계산한다. "이 가격에 사라/팔라"는 구간 카드는 만들지 않는다 - 투자자문 경계.
  const recentWindow = closes.slice(-60);
  const recentHigh = recentWindow.length ? Math.max(...recentWindow) : null;
  const recentLow = recentWindow.length ? Math.min(...recentWindow) : null;

  // [거래량 & 시장 관심도] 최근 5거래일 평균 거래량을 그 이전 15거래일 평균과 비교해 "관심이 늘고
  // 있는지/줄고 있는지"를 판정한다 - RISK 관리 카드의 20일 평균 거래량 급증 판정과는 별개로, 여기서는
  // "최근으로 갈수록 관심이 느는 추세인지"를 보고 싶어서 최근-이전 두 구간을 직접 비교한다.
  const volumes = data.volumes;
  let volumeTrend = null;
  if (Array.isArray(volumes) && volumes.length >= 20) {
    const recent5 = volumes.slice(-5);
    const prior15 = volumes.slice(-20, -5);
    const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
    const priorAvg = prior15.reduce((a, b) => a + b, 0) / prior15.length;
    const ratio = priorAvg > 0 ? recentAvg / priorAvg : 1;
    volumeTrend = { recentAvg, priorAvg, direction: ratio >= 1.3 ? 'up' : (ratio <= 0.7 ? 'down' : 'flat') };
  }

  // [종목명 표시 개선] 한글 이름으로 안 찾고 티커를 직접 입력한 경우(예: '273130', 'a128940')에도,
  // 그 티커가 KR_STOCK_NAMES/learnedTickerNames에 있거나 이번에 API가 실제 이름을 내려줬으면 원본
  // 입력 그대로가 아니라 정식 종목명을 보여준다.
  const displayName = resolvedName || KR_STOCK_NAMES[yahooTicker] || state.learnedTickerNames[yahooTicker] || (priceInfo && priceInfo.name) || trimmedRaw;
  // [학습된 종목명 캐시에 기록] 지금 막 진짜 이름을 확인했으면(=trimmedRaw/티커를 그대로 되돌려준 게
  // 아니면) 다음부터는 이 기기에서 티커든 이름이든 바로 찾을 수 있도록 남겨둔다 - 이미 KR_STOCK_NAMES에
  // 있던 값이어도 다시 저장은 되지만 rememberTickerName이 값이 같으면 조용히 건너뛴다.
  if (displayName !== trimmedRaw && displayName !== yahooTicker && displayName !== searchTicker) {
    rememberTickerName(yahooTicker, displayName);
  }
  return {
    ticker: yahooTicker,
    name: displayName,
    currentPrice,
    changePercent: priceInfo ? priceInfo.changePercent : null,
    ma20, ma60, ma120, trendLabel: maTrendLabel(ma20, ma60, ma120),
    rsi14, rsiState: rsiStateLabel(rsi14),
    bollinger: computeBollingerBands(closes, 20, 2),
    mdd: computeMDDFromCloses(closes),
    beta: (returns && benchmarkReturns) ? computeBetaFromReturns(returns, benchmarkReturns) : null,
    benchmarkKey,
    week52High,
    week52DrawdownPct: week52High > 0 ? ((currentPrice - week52High) / week52High) * 100 : null,
    recentHigh, recentLow, volumeTrend
  };
}

// [포트폴리오 적합도 시뮬레이션] 관심종목을 지정한 금액(원)만큼 가상으로 추가 매수했다고 가정하고,
// 이미 계산되어 있는 state.advancedRiskMetrics(RISK 관리 카드와 동일한 데이터, 재계산 없음)의 섹터
// 노출/HHI/최대비중을 "추가 전 vs 추가 후"로 비교한다. RISK 관리 카드를 한 번도 갱신하지 않아
// advancedRiskMetrics가 아직 없으면(null) 시뮬레이션을 건너뛰고 null을 반환 - 호출부가 이 경우 해당
// 섹션을 조용히 숨긴다.
function simulatePortfolioAddition(candidateTicker, addAmountKRW) {
  const m = state.advancedRiskMetrics;
  if (!m || !m.holdings || m.holdings.length === 0) return null;
  if (!(addAmountKRW > 0)) return null;
  const totalCur = m.totalCur;
  if (!(totalCur > 0)) return null;
  const newTotal = totalCur + addAmountKRW;

  const yahooTicker = sanitizeTicker(candidateTicker).yahooTicker;
  const rescaled = m.holdings.map((h) => ({ ...h, weight: h.curAmount / newTotal }));
  const existing = rescaled.find((h) => h.ticker === yahooTicker);
  const addedWeight = addAmountKRW / newTotal;
  if (existing) {
    existing.weight += addedWeight;
  } else {
    rescaled.push({ ticker: yahooTicker, name: candidateTicker, weight: addedWeight, curAmount: addAmountKRW });
  }

  const afterSector = computeSectorExposure(rescaled);
  const afterHHI = computeHHI(rescaled);
  const afterTop = [...rescaled].sort((a, b) => b.weight - a.weight)[0];

  return {
    before: {
      topSector: m.sectorExposure.topSector, topSectorWeight: m.sectorExposure.topSectorWeight,
      hhi: m.hhi, topWeightPct: m.topWeight, topHoldingName: m.topHolding ? m.topHolding.name : null
    },
    after: {
      topSector: afterSector.topSector, topSectorWeight: afterSector.topSectorWeight,
      hhi: afterHHI, topWeightPct: afterTop.weight * 100, topHoldingName: afterTop.name
    },
    addedWeightPct: addedWeight * 100
  };
}

