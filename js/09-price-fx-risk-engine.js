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
    state.exchangeRateFetchedAt = Date.now(); // [V1.2-A C1] 실제 조회 성공 시각만 기록 - 실패 시엔 안 건드림
    document.getElementById('exchangeRateInput').value = state.exchangeRate;
    persistRate(true); // 배경 자동 갱신 - 동기화 push 안 함(위 skipPush 주석 참고)
    applyOfficialFxReference(result.previousClose);
  } catch (realtimeErr) {
    try {
      const result = await raceFxSourceTier(FX_SOURCES_SNAPSHOT_FALLBACK);
      state.exchangeRate = result.rate;
      state.exchangeRateFetchedAt = Date.now(); // [V1.2-A C1] 스냅샷 폴백도 실제 조회 성공이다
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
  // [v151->v152 수정 되돌림] 여기 타임아웃을 12초->7초로 줄였다가, 실측해보니 allorigins-get 프록시가
  // "정상 작동하지만 13초 넘게 걸리는" 경우가 실제로 있어(고장이 아니라 그냥 느림) 7초 컷오프에 걸려
  // 유효한 백업까지 잘라내는 부작용이 있었다 - 빠른 소스(own-worker/r.jina.ai)가 하필 동시에 막힌
  // 순간엔 이 백업이 유일하게 살아있는 경로일 수 있는데 조기 컷오프로 완전 실패가 됐다. 애초에
  // 20초+ 지연의 핵심 원인은 이 값 자체가 아니라 raceFetchPrice/fetchPriceWithFallback의 "순차 대기"
  // 구조였고(위 두 함수 참고, 이제 동시 경쟁으로 고쳐짐), 개별 타임아웃은 원래 값(12초)으로 되돌려도
  // 그 구조 수정만으로 최악 상한이 이미 크게 줄어든다.
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
    // [종목 분석 모달 - 해외 종목명] meta.longName/shortName이 있으면 실제 기업명을 그대로 쓴다 -
    // 없는 티커(신규상장 등)도 있어 필드 존재를 보장할 수 없으므로 둘 다 없으면 undefined로 남기고
    // analyzeTickerForModal()이 기존처럼 TICKER_NAME_FALLBACK_SEED/learnedTickerNames/티커로 안전하게 폴백한다.
    name: (typeof meta.longName === 'string' && meta.longName) || (typeof meta.shortName === 'string' && meta.shortName) || undefined,
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
    // [v151->v152 수정 되돌림] 여기도 7초로 줄였다가 fetchYahooViaProxy와 같은 이유로 되돌린다 - 이
    // 함수는 raceFetchYahooStooq 안에서 Promise.any로 다른 소스들과 경쟁하는 한 참가자일 뿐이라,
    // 다른 소스가 먼저 성공하면 이 타임아웃 값 자체는 전혀 대기시간에 영향을 주지 않는다(전부 실패할
    // 때만 상한으로 작동). 원래 값(12초)으로 되돌려 "정상이지만 느린" 응답도 살릴 여지를 남긴다.
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
  if (!isKrxShortCode(code)) throw new Error('국내 종목 코드 형식이 아님');
  const target = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
  // [지연 문제 수정] 8초 -> 5초. 정상 응답은 보통 1초 이내라 5초면 충분하고, 국내 티커는 이 함수가
  // 먼저 실패해야(구조 변경 후에는 Yahoo/Stooq와 동시에 시작하므로 "먼저"라는 의미는 약해졌지만) 값을
  // 넘기므로 타임아웃을 줄이는 게 곧 전체 지연 상한을 줄이는 것과 직결된다.
  const res = await fetchWithTimeout(proxy ? proxy.build(target) : target, 5000);
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
  // undefined로 남고, 호출부(analyzeTickerForModal)가 기존처럼 TICKER_NAME_FALLBACK_SEED/원본 입력값으로
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

// [국내 전용 최종 안전망 - KIS] 네이버/Yahoo/Stooq가 전부 실패했을 때만 raceFetchPrice()가 호출한다.
// 종목 상세 모달의 재무 데이터(js/13)용으로 이미 배포된 KIS Worker(/api/kis/price, cloudflare-worker-kis-proxy.js
// handlePrice)를 그대로 재사용한다 - 새 Worker 배포 불필요.
// [의도적 제약 - 절대 1·2순위와 병렬로 쏘지 않는다] Worker 코드 자체의 실측 기록(cloudflare-worker-kis-proxy.js
// callKis 주석)에 "동시 요청 3~5건만으로도 500 에러가 재현됨(KIS 초당 요청 제한이 예상보다 엄격)"이라고
// 남아있다 - 국내 보유종목 15~20개를 한꺼번에 KIS로도 보내면, 오늘 own-worker/r.jina.ai에서 겪은
// "동시 요청 폭주로 자기 자신을 rate limit시키는" 문제가 KIS 쪽에서 그대로 재현될 위험이 크다. 다른
// 소스가 전부 실패했을 때만(정상 상황에서는 거의 호출 안 됨) 쓰면 이 위험 없이 순수하게 신뢰성만
// 높일 수 있다.
// [알려진 한계] 이 Worker(handlePrice)는 시간외 시세 판별 필드와 당일 시가/고가/저가를 돌려주지
// 않는다(js/13 주석 참고, KIS 응답에서 확인 안 됨) - session/todayOpen 등은 비워두고(Stooq의 최소
// 정보 폴백과 동일한 패턴) 정규장 기준가 하나만 확보하는 최소한의 안전망으로 쓴다.
async function fetchKisPriceFallback(yahooTicker, name) {
  const code = extractKisDomesticCode(yahooTicker);
  if (!code) throw new Error('KIS: 국내 종목코드 아님');
  const snapshot = await fetchKisPriceSnapshot(code);
  const price = snapshot && Number(snapshot.price);
  if (!snapshot || !Number.isFinite(price) || price <= 0) throw new Error('KIS: 가격 필드 없음 또는 유효하지 않은 값');
  const changePercent = Number.isFinite(Number(snapshot.changePct)) ? Number(snapshot.changePct) : 0;
  // KIS는 전일종가를 직접 안 주고 등락률(prdy_ctrt)만 주므로, 현재가와 등락률로 역산한다.
  const previousClose = changePercent !== 0 ? price / (1 + changePercent / 100) : null;
  return {
    price, previousClose, changePercent,
    session: undefined, currency: 'KRW', regularMarketPrice: price,
    todayOpen: undefined, todayHigh: undefined, todayLow: undefined,
    name, source: 'KIS(최종안전망)'
  };
}

async function raceFetchPrice(yahooTicker, name) {
  const isKr = /\.(KS|KQ)$/i.test(yahooTicker);
  if (!isKr) return raceFetchYahooStooq(yahooTicker, name);

  // 국내 티커는 "가장 빠른 소스"가 아니라 네이버(직접+프록시 경쟁)를 우선 채택한다 - 시간외 시세를
  // 실제로 제공하는 유일한 소스라서, 순수 속도 경쟁에 맡기면 우연히 더 빨리 응답한 Yahoo(정규장가로만
  // 폴백됨)가 이겨 시간외 시세가 묻히는 경우가 생길 수 있다.
  // [지연 문제 수정] 예전에는 네이버가 "완전히 실패한 후에야" Yahoo/Stooq 경쟁을 시작했다 - 네이버 쪽
  // 프록시 전부가 막혀있는 종목(예: 실측으로 확인된 0052D0.KS)은 네이버 타임아웃(5초)을 다 채운 뒤에야
  // Yahoo 경쟁(최대 7초)이 시작돼, 최악의 경우 한 종목 때문에 12초 넘게 걸렸다 - 전체 갱신은
  // Promise.all로 가장 느린 종목 하나를 기다리는 구조라 이 한 종목이 전체 갱신 시간을 그대로 끌어올렸다.
  // 이제 네이버와 Yahoo/Stooq를 처음부터 동시에 시작해두고, 네이버가 성공하면 그 값을 우선 채택하되
  // (진행 중이던 Yahoo/Stooq 결과는 버림) 네이버가 실패할 때만 이미 진행 중이던 Yahoo/Stooq 결과를
  // 그대로 기다린다 - 추가 대기시간 없이 상한이 두 경쟁 중 더 긴 쪽(약 7초)으로 줄어든다.
  const naverPromise = raceFetchNaverKr(yahooTicker, name);
  const fallbackPromise = raceFetchYahooStooq(yahooTicker, name);
  fallbackPromise.catch(() => {}); // 네이버가 성공해 폴백을 안 기다리게 되는 경우 unhandledrejection 방지용
  try {
    return await naverPromise;
  } catch (naverErr) {
    try {
      return await fallbackPromise;
    } catch (restErr) {
      // [KIS 최종 안전망] 위 두 소스(네이버, Yahoo/Stooq)가 전부 실패했을 때만 마지막으로 시도한다 -
      // fetchKisPriceFallback() 주석 참고, 의도적으로 여기서만(순차) 호출하고 앞 두 소스와 병렬로
      // 쏘지 않는다.
      try {
        return await fetchKisPriceFallback(yahooTicker, name);
      } catch (kisErr) {
        throw new Error(`Naver: ${naverErr.message} | ${restErr.message} | ${kisErr.message}`);
      }
    }
  }
}

// [되돌림 - 동시요청 제한 세마포어] v155에서 "own-worker가 짧은 시간 동시 다발 요청에 429를 반환한다"는
// 실측을 근거로 티커당 동시 진행 개수를 5로 제한했었는데, 실사용에서 오히려 전체 갱신이 1분을 넘기고
// 미국(해외) 종목 실패가 늘어나는 역효과가 재현됐다 - 원인은 이 세마포어를 fetchDailyCloses(리스크
// 진단 단계, 시세 조회 "다음"에 체이닝됨)와도 공유해서다. 보유종목이 20~30개면 5개씩 "파도" 단위로
// 순서대로 처리되는데, 예전엔 "가장 느린 종목 하나"만 기다리면 됐던 게 이제 "여러 파도의 합"을
// 기다리는 구조가 됐다(시세조회 파도들 + 리스크진단 파도들이 순차로 더해짐) - 개별 조회가 최악
// 근처(수 초~12초)로 조금만 느려져도 파도 수만큼 곱해져 1분을 쉽게 넘긴다. 해외 종목은 네이버/KIS
// 안전망을 못 쓰고 Yahoo/Stooq 하나뿐인데 대기열 뒤쪽 파도에 몰리면서 실패가 특히 늘어난 것으로 보인다.
// v151~v154의 "동시 경쟁" 구조 자체(순차 대기 제거)는 그대로 유지하고, 동시요청 총량을 인위적으로
// 제한하는 이 계층만 되돌린다 - 티커 개수만큼 전부 병렬로 나가되, 그중 가장 느린 것 하나만 기다리는
// 원래 방식(사실상 이게 더 빠르고 안정적이었다).

// rawTicker: 사용자가 입력한 원본 티커(예: A005380, 005930, GOOGL). 순수 숫자 6자리만으로는 코스피
// (.KS)인지 코스닥(.KQ)인지 입력 자체에서 구분할 수 없으므로, sanitizeTicker는 일단 .KS로 간주한다.
// .KS 조회가 전부 실패하면(존재하지 않는 코스피 코드일 가능성) 같은 6자리를 .KQ로 자동 재시도한다 -
// 예를 들어 실제로는 코스닥 종목인데 사용자가 접미사 없이 6자리 코드만 입력한 경우를 구제한다.
// (.KS/.KQ를 이미 명시했거나 해외 티커인 경우는 애매하지 않으므로 재시도하지 않는다.)
async function fetchPriceWithFallback(rawTicker, name) {
  const yahooTicker = sanitizeTicker(rawTicker).yahooTicker;
  const trimmedRaw = String(rawTicker ?? '').trim();
  // [2차 통합 보완] 영문 혼합 신규 코드(예: 0052D0)도 접미사가 없으면 코스피/코스닥을 입력만으로 알 수 없다 - 숫자 코드와 같게 둘 다 시도한다.
  const isAmbiguousKrxCode = isKrxShortCode(trimmedRaw);

  if (!isAmbiguousKrxCode) {
    try {
      return await raceFetchPrice(yahooTicker, name);
    } catch (ksErr) {
      console.error(`[시세조회 실패] ticker="${rawTicker}" (조회용: "${yahooTicker}") - 모든 소스 실패:\n${ksErr.message}`);
      throw ksErr;
    }
  }

  // [지연 문제 수정] 예전에는 .KS 조회가 "완전히 실패한 후에야" .KQ를 순차로 재시도해서, 코드가
  // 애매한(접미사 없는 6자리) 종목 하나가 .KS에서 실패하면 그 종목 하나 때문에 raceFetchPrice() 한
  // 사이클(약 7초 상한)이 통째로 두 번 더해졌다 - 전체 갱신은 가장 느린 종목 하나를 기다리는 구조라
  // 이런 종목이 하나만 있어도 v151에서 줄여둔 지연 상한(약 7초)이 무색하게 다시 14초 이상으로
  // 늘어났다. .KS/.KQ를 처음부터 동시에 시작해두고, 결과 채택 우선순위(.KS 우선, 실패 시에만 .KQ +
  // 오매칭 검증)는 그대로 유지하되 추가 대기 없이 상한을 한 번의 raceFetchPrice 사이클로 되돌린다.
  const kqTicker = trimmedRaw.toUpperCase() + '.KQ';
  const ksPromise = raceFetchPrice(yahooTicker, name);
  const kqPromise = raceFetchPrice(kqTicker, name);
  ksPromise.catch(() => {}); // 아래서 각각 개별적으로 await하므로 unhandledrejection 방지용
  kqPromise.catch(() => {});

  const [ksSettled, kqSettled] = await Promise.allSettled([ksPromise, kqPromise]);

  if (ksSettled.status === 'fulfilled') return ksSettled.value;

  const ksErr = ksSettled.reason;
  if (kqSettled.status === 'rejected') {
    const kqErr = kqSettled.reason;
    console.error(`[시세조회 실패] ticker="${rawTicker}" - .KS/.KQ 모두 실패:\n  [.KS] ${ksErr.message}\n  [.KQ] ${kqErr.message}`);
    throw new Error(`${ksErr.message} | (.KQ 재시도도 실패: ${kqErr.message})`);
  }

  const result = kqSettled.value;
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
    const kqErr = new Error(`.KQ(${kqTicker}) 응답이 예상과 다른 종류의 상품(${result.instrumentType})으로 확인되어 폴백을 신뢰할 수 없음`);
    console.error(`[시세조회 실패] ticker="${rawTicker}" - .KS 실패 + .KQ 오매칭:\n  [.KS] ${ksErr.message}\n  [.KQ] ${kqErr.message}`);
    throw new Error(`${ksErr.message} | (.KQ 재시도도 실패: ${kqErr.message})`);
  }
  console.warn(`[코스닥 폴백 성공] ticker="${rawTicker}" - .KS(${yahooTicker}) 조회 실패 후 .KQ(${kqTicker})로 재시도해 성공했습니다.`);
  return result;
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
// [금 시세 추가] GC=F(COMEX 금 선물, 온스당 달러)도 동일한 방식으로 같이 받는다 - 새 API/프록시가
// 필요 없다.
// [달러인덱스 추가] DX-Y.NYB(ICE 달러인덱스 현물)도 동일한 방식으로 같이 받는다 - 주요 통화 바스켓
// 대비 달러 가치를 나타내는 지수값(포인트)이라 원/달러 환율과는 별개의 신호다.
const MACRO_TICKERS = { VIX: '^VIX', UST10Y: '^TNX', DOW: '^DJI', GOLD: 'GC=F', USDX: 'DX-Y.NYB' };
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
/* [G-1 · §44 제10조 · PM 승인 2026-09-20] 구형 근사 경로를 없앴다.
 *
 * 예전 getBenchmarkKeyForTicker()는 티커 접미사와 손으로 고른 종목 집합(NASDAQ100_STYLE_TICKERS ·
 * DOW_STYLE_TICKERS)으로 기준 지수를 정하고, 아무 데도 걸리지 않으면 S&P500으로 보냈다. 이것은
 * 제10조가 금지한 방식 그대로다("거래소 · 티커 접미사 · 섹터 유사성으로 Benchmark를 정하지 않는다").
 * 보유자산 경로는 이미 resolveRiskBenchmark로 통일돼 있었는데, 미보유 종목을 보는 종목 분석 모달만
 * 옛 규칙 위에 남아 같은 종목이 화면에 따라 다른 기준으로 비교되고 있었다.
 *
 * 이제 모달도 같은 함수를 쓴다. 근거가 없으면 기준 지수를 만들지 않고(UNRESOLVED) 베타도 만들지
 * 않는다 - 임의의 지수와 비교한 숫자를 보여 주느니 "확정되지 않았다"고 말하는 편이 정직하다. */
function resolveModalBenchmark(yahooTicker, displayName) {
  // 이 모달은 개별 종목(보유 여부 무관)만 다룬다 - 자산 객체가 없으므로 카테고리는 '주식'으로 넘긴다.
  // 원장에 등록된 종목이면 resolveRiskBenchmark가 원장 판정을 먼저 쓴다(보유 화면과 같은 순서).
  const bm = resolveRiskBenchmark({ ticker: yahooTicker, category: '주식', name: displayName || '' });
  return bm || { key: null, status: 'UNRESOLVED', source: null, priceSource: null };
}
// [Risk 정책 P-4 · v252 → 1차 통합 구현 · D-01 · D-05 · D-06 · §44 제10조] Risk 벤치마크 결정 순서.
//   ① Exposure Master(근거 있는 경제적 노출) - 원장에 등록된 종목은 원장 판정으로 끝낸다.
//      · 확정(RESOLVED) + benchmark → 그 지수가 Benchmark(RESOLVED). Index Master에 가격 원천이 없으면 원천만
//        UNAVAILABLE(priceSource)로 표시하고 베타는 만들지 않는다 - 수익 정의(PR/TR)가 다른 지수나 비슷한 지수로 대신하지 않는다.
//      · 혼합 노출(MIXED) → UNRESOLVED(mixedExposure). 단일 Benchmark를 강제하지 않는다.
//      · 등록됐지만 필수 사실이 비어 있음(환헤지 미확인 = HOLD 등) → UNRESOLVED. 아래 ②·③으로 넘기지 않는다.
//      · 개별주 원장 항목인데 앱에 적힌 이름이 펀드를 가리키면 원장을 쓰지 않는다(잘못 적힌 기록 방어 · 기존 유지).
//   ② ETF_HOLDINGS_MAP 라벨이 앱 지수와 정확히 같을 때(공유표 동결 - 현재 등록 ETF는 전부 ①에서 끝난다).
//   ③ 개별 주식(category '주식') → 종목 마스터(data/ticker-master.json)의 상장 거래소가 국내(KOSPI · KOSDAQ)일 때만
//      그 시장 지수. [D-06] 미국 상장 주식은 ADR 여부 · 본국 보통주 여부를 원장으로 확인하지 못하면 거래소 지수로
//      보내지 않는다(NASDAQ · NYSE · AMEX 공통 · 거래소 fallback 없음). 원장(①)에 본국 보통주(equityListing HOME_COMMON ·
//      근거 등급 A)로 명시된 해외 개별주만 확정된다(PM 결정 ③ - 거래소 상장 근거만 있는 원장 항목도 UNRESOLVED).
//   ④ 그 외 → UNRESOLVED(null). 티커 접미사 · ETF라는 사실 · 섹터 유사성 · 예전 근사 집합(NASDAQ100/DOW
//      스타일) · Return Key는 근거로 쓰지 않는다.
//   [D-05] 정해진 지수와 종목 가격 시계열의 거래 시장이 다르면(국내 상장 해외 ETF ↔ 미국 지수) 같은 날짜 정렬을
//   쓰지 않고 비동기 정렬(Dimson 시차 0 + 1 · computeAsyncDimsonBeta)로 계산한다. 이때 환헤지 사실이 원장에
//   있어야 하고(미확인 → HOLD), 비헤지 + 가격통화(KRW) ≠ 지수통화(USD)이면 지수를 H.10으로 원화 환산해 비교한다.
//   환헤지형은 헤지비용 자료가 없어 UNRESOLVED다(0으로 두지 않는다 · §44 제6조 6-3).
//   옛 근사 함수 getBenchmarkKeyForTicker는 G-1에서 완전히 삭제됐다 - 종목 분석 모달도
//   resolveModalBenchmark를 거쳐 이 함수를 쓴다(test/risk-engine.test.js:123이 그 함수의 부재를 강제한다).
const RISK_BENCHMARK_BY_ETF_INDEX_LABEL = Object.freeze({ '나스닥100': 'NASDAQ100', 'S&P500': 'SP500' });
// [D-06] 상장 거래소 지수를 그대로 쓰는 것은 국내 상장 개별주뿐이다(NASDAQ은 v252에 있었으나 D-06으로 뺐다).
const RISK_BENCHMARK_BY_LISTING_EXCHANGE = Object.freeze({ KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ' });
const RISK_US_LISTING_EXCHANGES = Object.freeze(['NASDAQ', 'NYSE', 'AMEX']);
// 개별 주식으로 보지 않을 이름 - js/01의 기존 목록(ETF · 채권 · 현금 키워드)만 쓴다. 억지 배정을 막는 방향으로만 작동한다.
const RISK_FUND_NAME_PATTERN = /\b(ETF|ETN)\b/i;
function looksLikeFundName(text) {
  const hay = String(text ?? '').toUpperCase();
  if (!hay.trim()) return false;
  if (RISK_FUND_NAME_PATTERN.test(hay)) return true;
  // 영문 키워드는 단어 단위로만 맞춘다('ENTERPRISE' 속 'RISE' 같은 오판정 방지). 한글은 포함 여부로 본다.
  return [...ETF_KEYWORDS, ...BOND_KEYWORDS, ...CASH_KEYWORDS].some((k) => {
    const kw = String(k).toUpperCase();
    if (/^[A-Z0-9]+$/.test(kw)) return new RegExp(`(^|[^A-Z0-9])${kw}([^A-Z0-9]|$)`).test(hay);
    return hay.includes(kw);
  });
}
// [Phase 2-4 · T3 · §44 제6조] Risk가 실제로 측정하는 가격계열의 통화(priceCcy).
// Exposure Master에 확정된 항목이 있으면 그 값을, 없으면 자산의 거래통화(a.currency - calcRow가
// 현재가를 원화로 환산할 때 쓰는 바로 그 값)를 쓴다. 국내 상장 해외 ETF는 priceCcy=KRW이다
// (기초자산 통화 underlyingCcy와 섞지 않는다). 표시용 사실 정보이며 계산에는 쓰지 않는다.
function resolveRiskPriceCcy(a) {
  if (typeof resolveExposure === 'function' && typeof isExposureMasterActive === 'function' && isExposureMasterActive()) {
    const em = resolveExposure(a);
    if (em && em.status === 'RESOLVED' && em.entry && em.entry.priceCcy) return em.entry.priceCcy;
  }
  return a && a.currency === 'USD' ? 'USD' : 'KRW';
}
// 가격 시계열이 찍힌 거래 시장(달력). 국내 거래소 Yahoo 기호(.KS/.KQ)는 국내, 접미사 없는 기호는 미국 거래소
// 시계열이다(앱의 종목 마스터는 KOSPI · KOSDAQ · NASDAQ · NYSE · AMEX만 담는다). 그 밖의 기호는 모른다(null).
// 이 값은 "어느 달력으로 정렬할지"에만 쓴다 - Benchmark를 고르는 근거로는 쓰지 않는다(P-4).
function riskSeriesMarketOf(yahooTicker) {
  const t = String(yahooTicker || '').toUpperCase();
  if (!t) return null;
  if (/\.(KS|KQ)$/.test(t)) return 'KR';
  if (/^[A-Z][A-Z0-9-]*$/.test(t)) return 'US';
  return null;
}
// 정해진 Benchmark 키를 Index Master · 거래 시장 · 환헤지 사실과 맞춰 최종 판정한다(D-01 · D-05).
// 같은 시장(동기) 결과의 모양은 예전과 같다({ key, status, source }) - 비동기 · 정의 불일치일 때만 필드가 붙는다.
function finalizeRiskBenchmark(yahoo, key, source, entry) {
  const unresolved = (why, extra) => Object.assign({ key: null, status: 'UNRESOLVED', source: why }, extra || {});
  if (!key) return unresolved('noBenchmark');
  const idx = typeof resolveIndexMasterEntry === 'function' ? resolveIndexMasterEntry(key) : null;
  if (!idx) return unresolved('indexNotInMaster', { indexKey: key });
  const out = { key, status: 'RESOLVED', source };
  // [D-01 ③] 수익 정의가 다른 지수를 쓰게 되면 같은 것으로 취급하지 않고 상태를 남긴다.
  if (resolveBenchmarkDefinitionStatus(entry, idx) === 'DEFINITION_MISMATCH') out.definitionStatus = 'DEFINITION_MISMATCH';
  // [2차 통합 보완 · 세 상태 분리] "Benchmark 확인됨" ≠ "지수 가격 원천 있음" ≠ "베타 계산됨". 기준 지수는 확인됐지만
  // 앱이 그 지수 가격을 받을 수 없으면 Benchmark는 RESOLVED로 두고 원천만 UNAVAILABLE로 표시한다 - 베타는 만들지 않는다
  // (지수를 조회하지 않고, 비슷한 지수로 대신하지 않는다). 같은 시장 · 원천 있음 결과의 모양은 예전 그대로다.
  if (!isIndexPriceSourceAvailable(key)) return Object.assign(out, { priceSource: 'UNAVAILABLE', indexUnavailableReason: idx.unavailableReason });
  const assetMarket = riskSeriesMarketOf(yahoo);
  if (!assetMarket || !idx.market) return unresolved('seriesMarketUnknown', { indexKey: key });
  if (assetMarket === idx.market) return out;
  // [D-05] 비동기 쌍 - 환헤지 사실이 원장에 있어야 한다(미확인을 비헤지로 간주하지 않는다).
  if (!entry || !entry.hedgeStatus) return unresolved('hedgeUnconfirmed', { indexKey: key });
  if (entry.hedgeStatus === 'HEDGED') return unresolved('hedgeCostUnavailable', { indexKey: key });
  const priceCcy = entry.priceCcy || null;
  const indexCcy = idx.currency || null;
  if (!priceCcy || !indexCcy) return unresolved('currencyUnconfirmed', { indexKey: key });
  let benchmarkFx = null;
  if (priceCcy !== indexCcy) {
    // 비헤지(환노출) 원화 상품 ↔ 달러 지수만 H.10으로 환산한다(새 환율 공급자 · 다른 통화쌍 없음).
    const krwFromUsd = priceCcy === 'KRW' && indexCcy === 'USD';
    if (!(krwFromUsd && entry.hedgeStatus === 'UNHEDGED' && entry.fxExposure === 'EXPOSED')) return unresolved('fxConversionUnsupported', { indexKey: key });
    benchmarkFx = 'USD_TO_KRW_H10';
  }
  return Object.assign(out, { alignment: 'ASYNC_DIMSON', benchmarkFx, assetMarket, benchmarkMarket: idx.market });
}
function resolveRiskBenchmark(a) {
  const yahoo = sanitizeTicker(a && a.ticker).yahooTicker;
  const unresolved = (source) => ({ key: null, status: 'UNRESOLVED', source });
  if (!yahoo) return unresolved('noTicker');
  // ① Exposure Master - 등록된 종목은 원장 판정으로 끝낸다(확정되지 않았으면 기존 경로로 넘기지 않는다).
  if (typeof lookupExposureRecord === 'function' && typeof isExposureMasterActive === 'function' && isExposureMasterActive()) {
    const rec = lookupExposureRecord(a);
    const entry = rec ? rec.entry : null;
    const stockLike = !!entry && (entry.assetType === 'KR_STOCK' || entry.assetType === 'FOREIGN_STOCK');
    const contradicted = stockLike && looksLikeFundName(String((a && a.name) || ''));
    if (rec && !contradicted) {
      if (rec.verdict.mixedExposure) return unresolved('mixedExposure');
      if (rec.verdict.status !== 'RESOLVED') {
        const hedgeMissing = (rec.verdict.missing || []).some((f) => f === 'hedgeStatus' || f === 'fxExposure' || f === 'conversionMethod');
        return unresolved(hedgeMissing ? 'hedgeUnconfirmed' : 'exposureIncomplete');
      }
      // [D-06 · PM 결정 ③] 해외 상장 개별주는 본국 보통주임이 원장에 A등급 근거로 명시된 경우에만 원장 Benchmark를 쓴다.
      // 거래소 상장 사실만으로 ADR 여부 · 본국 보통주 여부를 추정하지 않는다(거래소 지수 fallback도 없다).
      if (entry.assetType === 'FOREIGN_STOCK' && entry.equityListing !== 'HOME_COMMON') {
        return unresolved(entry.equityListing === 'ADR' ? 'adrListing' : 'listingDomicileUnconfirmed');
      }
      return finalizeRiskBenchmark(yahoo, entry.benchmark, 'exposureMaster', entry);
    }
  }
  // ② 동결된 ETF 구성표 라벨(앱 지수와 이름이 정확히 같을 때만).
  const etf = ETF_HOLDINGS_MAP[yahoo];
  if (etf) {
    const key = RISK_BENCHMARK_BY_ETF_INDEX_LABEL[etf.label] || null;
    return key ? finalizeRiskBenchmark(yahoo, key, 'etfIndex', null) : unresolved('etfIndexNotAvailable');
  }
  // ③ 개별 주식 - 국내 상장만 상장 시장 지수(D-06).
  if (a.category === '주식') {
    const rec = (typeof tickerMasterByTicker !== 'undefined' && tickerMasterByTicker) ? tickerMasterByTicker[yahoo] : null;
    if (!rec) return unresolved('noListingInfo');
    if (looksLikeFundName(`${a.name || ''} ${rec.nameKr || ''} ${rec.nameEn || ''}`)) return unresolved('fundLikeName');
    const key = RISK_BENCHMARK_BY_LISTING_EXCHANGE[rec.exchange] || null;
    if (key) return finalizeRiskBenchmark(yahoo, key, 'listingExchange', null);
    return unresolved(RISK_US_LISTING_EXCHANGES.includes(rec.exchange) ? 'listingDomicileUnconfirmed' : 'exchangeIndexNotAvailable');
  }
  return unresolved('noUnderlyingInfo');
}
function getBenchmarkKeyForAsset(a) {
  return resolveRiskBenchmark(a).key;
}

/* =========================================================================
 * [§50 · PD-15] Market Beta 기준 지수 — 시장위험 전용
 *
 * 두 베타는 **서로 다른 통계량**이다.
 *   Market Beta   : 그 종목이 **자기가 거래되는 시장**에 얼마나 민감한가 → 위험점수 · 포트폴리오 베타
 *   Tracking Beta : 그 종목이 **자기 공식 기초지수**를 얼마나 따라가는가 → 표시 전용
 * 지수추종 ETF의 Tracking Beta는 구조적으로 1.0 근방이라 시장위험 칸(밴드 <1.2 → 55점)에
 * 넣으면 방어적 ETF와 고베타 테마 ETF가 같은 점수를 받는다 - 요인이 종목을 구분하지 못한다.
 *
 * 기준 지수 매핑은 **원장 · 코드에 이미 있는 사실만** 쓴다(새 지수 · 임의 대체 없음 · §31).
 *   KOSPI 상장  → KOSPI(^KS11)   : 기존 RISK_BENCHMARK_BY_LISTING_EXCHANGE 그대로
 *   KOSDAQ 상장 → KOSDAQ(^KQ11)  : 동일
 *   NASDAQ 상장 → NASDAQ(^IXIC)  : Exposure Master가 미국 개별주에 이미 부여한 기준과 같다
 *   NYSE · AMEX → **매핑 없음(UNRESOLVED)** : 앱에 그 시장의 종합지수가 없다(§44 D-02 유지).
 *                 S&P500으로 대신하지 않는다 - 그것은 PM 결정 사항이다.
 * 해외 상장 개별주는 본국 보통주(HOME_COMMON) 근거가 있을 때만 쓴다(D-06 게이트 유지).
 * ====================================================================== */
const RISK_MARKET_INDEX_BY_LISTING_EXCHANGE = Object.freeze({ KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ', NASDAQ: 'NASDAQ' });
function resolveMarketRiskBenchmark(a) {
  const yahoo = sanitizeTicker(a && a.ticker).yahooTicker;
  const unresolved = (source) => ({ key: null, status: 'UNRESOLVED', source });
  if (!yahoo) return unresolved('noTicker');
  // 주식 · ETF만 대상이다 - 채권 · 현금 · 부동산은 포트폴리오 베타에서 제외한다는 기존 정책 그대로(PD-15).
  if (!RISK_ELIGIBLE_CATEGORIES.includes(a && a.category)) return unresolved('notEquityLike');
  const rec = (typeof tickerMasterByTicker !== 'undefined' && tickerMasterByTicker) ? tickerMasterByTicker[yahoo] : null;
  /* 종목 마스터에 없더라도 **접미사 자체가 상장 시장**인 경우가 있다 - `.KS`는 KOSPI, `.KQ`는
   * KOSDAQ이다(sanitizeTicker · riskSeriesMarketOf가 이미 쓰는 같은 사실). 새 판정 규칙이 아니라
   * 이미 코드에 있는 사실을 한 번 더 읽는 것이다. 접미사가 없는 해외 티커는 거래소를 알 수 없으므로
   * (NASDAQ인지 NYSE인지) 여기서 추측하지 않는다 - 마스터에 없으면 미확정이다. */
  const exchange = rec ? rec.exchange : (/\.KS$/.test(yahoo) ? 'KOSPI' : (/\.KQ$/.test(yahoo) ? 'KOSDAQ' : null));
  if (!exchange) return unresolved('noListingInfo');
  // [D-06] 해외 상장 개별주는 상장 사실만으로 본국 보통주라고 보지 않는다 - 원장 근거가 있어야 한다.
  if (typeof lookupExposureRecord === 'function' && typeof isExposureMasterActive === 'function' && isExposureMasterActive()) {
    const em = lookupExposureRecord(a);
    const entry = em ? em.entry : null;
    if (entry && entry.assetType === 'FOREIGN_STOCK' && entry.equityListing !== 'HOME_COMMON') {
      return unresolved(entry.equityListing === 'ADR' ? 'adrListing' : 'listingDomicileUnconfirmed');
    }
  }
  const key = RISK_MARKET_INDEX_BY_LISTING_EXCHANGE[exchange] || null;
  if (!key) return unresolved(RISK_US_LISTING_EXCHANGES.includes(exchange) ? 'marketIndexNotAvailable' : 'exchangeIndexNotAvailable');
  // 상장 시장과 지수 시장이 같으므로 같은 달력 · 같은 통화다(비동기 · 환산 경로를 타지 않는다).
  return finalizeRiskBenchmark(yahoo, key, 'listingMarket', null);
}

// [버그 수정 - 세제혜택계좌 종목 리스크 진단 누락] 원래 isRebalanceEligibleAccount(연금저축/IRP/ISA
// 제외)까지 걸려 있었다 - 리밸런싱 대상 선정 기준(자유롭게 매도하기 어려운 계좌는 제외)을 그대로
// 재사용한 것인데, 리스크 진단은 "이 종목이 얼마나 위험한가"를 보는 것이라 계좌의 세제 혜택 여부와
// 무관하다(당장 리밸런싱 실행은 못 해도 그 종목이 위험한지는 여전히 알고 싶은 정보다). 이 필터 때문에
// 연금저축 등에 담긴 주식/ETF가 "리스크 감지"에도 "안정적인 종목"에도 전혀 나타나지 않고 조용히
// 통째로 빠지는 문제가 있었다 - 이제 계좌 구분과 무관하게 주식/ETF 전부를 진단 대상으로 삼는다.
function riskEligibleAssets() {
  return state.assets.filter((a) => RISK_ELIGIBLE_CATEGORIES.includes(a.category) && String(a.ticker ?? '').trim() !== '' && num(a.quantity) > 0);
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
// [Phase 6-B/6-C 감사 - 데이터 기준 문서화] quote.close는 Yahoo Finance의 비수정(non-adjusted)
// 종가다 - 배당 재투자를 반영한 Adjusted Close가 아니라 순수 Price Return 기준이며, 이 값이 Monte
// Carlo 엔진(js/15/16)의 변동성·상관관계 계산의 유일한 원천이다.
// [C-3 · §44 제7조 · PM 승인 2026-09-20] 기본 range를 '1y' → '3y'로 바꿨다. 제7조가 정해 둔 지표별
// 목표 관측 수(기술 250 · 변동성/베타/상관 500 · VaR/CVaR/MDD 750)를 1년 조회로는 구조적으로 채울 수
// 없었기 때문이다. 실측(scripts/closeout/research/risk-observation-window.js): Yahoo는 range=3y에서도
// 일별 간격을 유지하며 국내 730행 · 미국 753행을 준다(range=max처럼 월별로 솎이지 않는다).
// 받아 온 3년치는 **지표마다 필요한 만큼만 잘라 쓴다**(RISK_OBSERVATION_WINDOWS) - 전 지표를 3년으로
// 일괄 변경하지 않는다. 가격 이력은 메모리 캐시(state.riskHistoryCache)에만 있어 저장소 사용량과 무관하다.
// [Risk 정책 P-3 · v252] Yahoo 일봉 응답 파싱을 순수 함수로 분리했다(동작은 예전과 같고 거래량 결측만 다르다).
// 거래량: 유한한 숫자면 그 값(실제 거래량 0은 0), 없거나 숫자가 아니면 null - 결측과 실제 0을 구분한다.
function parseYahooDailySeries(data) {
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  const quote = (result && result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const rawCloses = quote.close || [];
  const rawVolumes = quote.volume || [];
  const rawTimestamps = result && result.timestamp || [];
  // [R-03 · §44 제8조] 조정주가(배당 · 액면분할 반영)를 원주가와 **따로** 읽는다.
  //   · 통계 위험지표(변동성 · 베타 · 상관 · VaR · CVaR · MDD · Sortino) → 조정주가
  //   · 기술 지표(RSI · 이동평균 · 52주 · 거래량 신호)               → 원주가
  // 응답에 adjclose가 아예 없으면 closesAdj를 null로 둔다 - 원주가로 조용히 대신하지 않는다.
  const adjBlock = (result && result.indicators && result.indicators.adjclose && result.indicators.adjclose[0]) || null;
  const rawAdjCloses = adjBlock && Array.isArray(adjBlock.adjclose) ? adjBlock.adjclose : null;
  const closes = [], volumes = [], dates = [];
  const closesAdj = rawAdjCloses ? [] : null;
  // [Monte Carlo Engine v2 어댑터 지원 - 날짜 추가] 예전엔 종가/거래량만 남기고 날짜(timestamp)는
  // 버렸다 - 그 결과 한국/미국처럼 거래일이 다른 시장을 섞으면 상관계수 계산이 "실제 같은 날짜끼리"가
  // 아니라 "최근 N개를 그냥 나란히"로 계산돼(js/15 date-aligned correlation 도입 배경) 부정확했다.
  // dates를 함께 반환해도 기존 호출부(closes/volumes만 쓰는 곳)는 전혀 영향받지 않는다(필드 추가만).
  rawCloses.forEach((c, i) => {
    if (typeof c !== 'number') return; // 종가 없는 날(휴장 등)은 거래량/날짜도 함께 건너뛰어 인덱스를 맞춘다
    closes.push(c);
    const v = rawVolumes[i];
    volumes.push(typeof v === 'number' && Number.isFinite(v) ? v : null);
    dates.push(typeof rawTimestamps[i] === 'number' ? new Date(rawTimestamps[i] * 1000).toISOString().slice(0, 10) : null);
    if (closesAdj) {
      // 조정주가가 그날만 비어 있으면 null로 남긴다(거래량 결측과 같은 원칙 · §44 제10조).
      const a = rawAdjCloses[i];
      closesAdj.push(typeof a === 'number' && Number.isFinite(a) ? a : null);
    }
  });
  return { closes, closesAdj, volumes, dates };
}

async function fetchDailyClosesWithStatus(yahooTicker, range = '3y') {
  if (!yahooTicker) return { data: null, status: RISK_DATA_STATUS.TICKER_INVALID };
  const target = YAHOO_CHART_API + encodeURIComponent(yahooTicker) + '?interval=1d&range=' + range;
  // [v152 수정 되돌림] 여기도 7초로 줄였다가 fetchYahooViaProxy와 같은 이유로 되돌린다 - 이 함수 역시
  // Promise.any 경쟁이라 타임아웃 값은 "전부 실패할 때만" 상한으로 작동하고, allorigins-get처럼
  // 정상이지만 13초 가까이 걸리는 프록시를 조기에 잘라내는 부작용이 실측으로 확인됐다.
  // [R-06] 응답은 왔지만 종가가 없거나 너무 짧은 경우를 "조회 실패"와 구분하기 위해,
  // 파싱까지 성공한 마지막 결과를 따로 기억해 둔다(값을 쓰지는 않고 상태 판정에만 쓴다).
  let parsedButShort = null;
  const attempts = CORS_PROXIES.map((proxy) => async () => {
    const res = await fetchWithTimeout(proxy.build(target));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
    const parsed = parseYahooDailySeries(data);
    if (parsed.closes.length < 10) { parsedButShort = parsed; throw new Error('종가 데이터 부족'); }
    return parsed;
  });
  try {
    const parsed = await Promise.any(attempts.map((fn) => fn()));
    return { data: parsed, status: RISK_DATA_STATUS.OK };
  } catch (aggregateErr) {
    // 실패해도 예외를 던지지 않는다 - 호출부가 상태와 함께 안전하게 처리한다.
    if (parsedButShort) {
      return {
        data: null,
        status: parsedButShort.closes.length === 0 ? RISK_DATA_STATUS.NO_HISTORY : RISK_DATA_STATUS.INSUFFICIENT_HISTORY
      };
    }
    return { data: null, status: RISK_DATA_STATUS.FETCH_FAILED };
  }
}
// 기존 호출부(시세 배열만 쓰는 곳)를 그대로 두기 위한 얇은 래퍼 - 반환 형태 무변경.
async function fetchDailyCloses(yahooTicker, range = '3y') {
  return (await fetchDailyClosesWithStatus(yahooTicker, range)).data;
}

// ma20Map과 동일한 하루-한-번 캐시 정책 - 같은 티커를 여러 종목(같은 종목을 신랑/와이프가 나눠 보유)이
// 공유해도 실제 네트워크 조회는 한 번만 일어난다. { closes, volumes } 객체를 그대로 캐시/반환한다.
async function getCachedDailyClosesWithStatus(yahooTicker) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = state.riskHistoryCache[yahooTicker];
  if (cached && cached.date === today) return { data: cached.data, status: cached.status || RISK_DATA_STATUS.OK };
  const got = await fetchDailyClosesWithStatus(yahooTicker);
  // 성공한 조회만 캐시한다 - 실패 상태를 하루 동안 붙들고 있지 않는다(기존 동작 그대로).
  if (got.data) state.riskHistoryCache[yahooTicker] = { date: today, data: got.data, status: got.status };
  return got;
}
async function getCachedDailyCloses(yahooTicker) {
  return (await getCachedDailyClosesWithStatus(yahooTicker)).data;
}

/* [T6 · §44 44-15] Risk 원화 기준 환율 - 연준 H.10 일별 USD/KRW(달러당 원화, 뉴욕 정오 관측).
 * scripts/fx/update-usdkrw-h10.js가 빌드 단계에서 만든 정적 JSON(data/fx/usdkrw-h10.json)만 읽는다 -
 * H.10 원문이나 다른 환율 출처(ECB · Yahoo KRW=X)를 앱 실행 중에 조회하지 않는다.
 * 가격통화(priceCcy)가 USD인 종목의 "통계용" 조정주가에만 곱한다. 베타 · 기술 지표는 건드리지 않는다.
 */
const RISK_USDKRW_DATA_URL = 'data/fx/usdkrw-h10.json';
// H.10은 주 1회(보통 월요일) 전주 금요일까지 게시된다 - 정상 지연이 최대 약 10일이다. 게시가 두 번
// 이상 끊겨 마지막 환율이 이보다 오래되면 "오래된 데이터"로 진단한다(계산에서 빼지는 않는다 · OP-4).
const RISK_USDKRW_STALE_MAX_GAP_DAYS = 21;
let riskUsdKrwCache = null; // { date, result } - 성공한 조회만 하루 동안 기억한다
// 정적 JSON의 형식 · 값을 검사해 날짜→환율 Map으로 바꾼다. 하나라도 어긋나면 쓰지 않는다(부분 사용 없음).
function parseUsdKrwDataset(json, todayISO) {
  const bad = { status: RISK_DATA_STATUS.DATA_QUALITY_FAILED, rates: null, endDate: null };
  const rows = json && Array.isArray(json.rates) ? json.rates : null;
  if (!rows || rows.length === 0) return bad;
  const rates = new Map();
  let prev = null;
  for (const row of rows) {
    const date = Array.isArray(row) ? row[0] : null;
    const rate = Array.isArray(row) ? row[1] : null;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return bad;
    if (prev !== null && date <= prev) return bad; // 중복 · 역순
    if (todayISO && date > todayISO) return bad;    // 미래 날짜
    rates.set(date, rate);
    prev = date;
  }
  if (json.endDate && json.endDate !== prev) return bad;
  const gapDays = todayISO ? Math.round((Date.parse(todayISO) - Date.parse(prev)) / 86400000) : 0;
  return {
    status: gapDays > RISK_USDKRW_STALE_MAX_GAP_DAYS ? RISK_DATA_STATUS.DATA_STALE : RISK_DATA_STATUS.OK,
    rates, endDate: prev, source: json.source || null
  };
}
async function getRiskUsdKrwRates() {
  const today = new Date().toISOString().slice(0, 10);
  if (riskUsdKrwCache && riskUsdKrwCache.date === today) return riskUsdKrwCache.result;
  let json;
  try {
    const res = await fetchWithTimeout(RISK_USDKRW_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch {
    return { status: RISK_DATA_STATUS.SOURCE_UNAVAILABLE, rates: null, endDate: null };
  }
  const result = parseUsdKrwDataset(json, today);
  if (result.rates) riskUsdKrwCache = { date: today, result };
  return result;
}
// 날짜가 붙은 USD 가격 × 같은 날의 USD/KRW → 원화 가격. 환율이 없는 날은 뺀다 - 앞 값 채우기 ·
// 보간 · 가까운 날짜 대체를 하지 않는다. 그래서 마지막 날짜는 "가격과 환율이 함께 있는 마지막 날"이다.
function convertDatedClosesToKrw(datedCloses, rates) {
  if (!Array.isArray(datedCloses) || !rates) return null;
  const out = [];
  datedCloses.forEach((d) => {
    const rate = d && d.date ? rates.get(d.date) : undefined;
    if (typeof rate === 'number' && typeof d.close === 'number' && Number.isFinite(d.close)) out.push({ date: d.date, close: d.close * rate });
  });
  return out;
}

// [Phase 39-B - 날짜 정렬] fetchDailyCloses()는 이미 dates를 함께 돌려주는데(위 주석 참고 - js/15의
// date-aligned correlation을 위해 추가됐다) 정작 이 리스크 엔진은 그 날짜를 버리고 closes만 썼다.
// 그래서 beta/상관계수가 "같은 날짜끼리"가 아니라 "최근 N개를 그냥 나란히" 비교되고 있었다.
// 한국/미국처럼 거래일이 다른 시장을 섞거나 한쪽 이력이 짧으면 전혀 다른 날의 수익률이 짝지어진다.
// 새 데이터 공급이나 새 프레임워크를 만들지 않고, js/16이 이미 쓰는 변환 패턴과 js/15의
// dateAlignedReturns()를 그대로 재사용한다.
/* [Risk 데이터 품질 상태 · §44 제9조 · R-06] "데이터가 없다"를 한 덩어리로 뭉치지 않는다.
 * 조회 실패 · 티커 불량 · 이력 없음 · 이력 짧음 · 오래된 데이터 · 품질 불량을 각각 구분해
 * 진단에 남긴다. 상태는 §44 제9조가 정한 9개뿐이며 임의로 늘리지 않는다.
 *   FETCH_FAILED             조회 요청 자체가 실패(프록시 전부 실패)
 *   TICKER_INVALID           티커를 만들 수 없음
 *   NO_HISTORY               응답은 왔지만 종가가 하나도 없음
 *   INSUFFICIENT_HISTORY     이력은 있지만 그 지표에 필요한 관측 수보다 적음
 *   BENCHMARK_UNRESOLVED     기준 지수를 정책상 확정할 수 없음(§44 제10조)
 *   INSUFFICIENT_COMMON_DATES 종목·지수(또는 종목끼리) 공통 거래일이 부족
 *   DATA_STALE               마지막 거래일이 정책 기준보다 오래됨
 *   DATA_QUALITY_FAILED      값은 있으나 날짜 중복·역순 등 품질 검사 실패
 *   SOURCE_UNAVAILABLE       필요한 데이터 출처 자체를 쓸 수 없음(앱에 해당 지수가 없는 등)
 */
const RISK_DATA_STATUS = Object.freeze({
  OK: 'OK',
  FETCH_FAILED: 'FETCH_FAILED',
  TICKER_INVALID: 'TICKER_INVALID',
  NO_HISTORY: 'NO_HISTORY',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  BENCHMARK_UNRESOLVED: 'BENCHMARK_UNRESOLVED',
  INSUFFICIENT_COMMON_DATES: 'INSUFFICIENT_COMMON_DATES',
  DATA_STALE: 'DATA_STALE',
  DATA_QUALITY_FAILED: 'DATA_QUALITY_FAILED',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE'
});
// 마지막 거래일이 이만큼 지났으면 "오래된 데이터"로 본다 - 주말(2) + 최장 연휴(설·추석 전후)
// 까지 감안한 운영 파라미터다. 거래정지 · 상장폐지 종목을 정상 데이터처럼 쓰지 않기 위한
// 진단용이며, 이 상태만으로 계산에서 제외하지는 않는다(§44 제9조는 상태 구분을 요구한다).
const RISK_STALE_MAX_GAP_DAYS = 10;
// 지표별 목표 관측 수(§44 제7조 1Y/2Y/3Y). 지금 실제 조회는 1년뿐이라 대부분 미달이며,
// 이 표는 "무엇이 얼마나 모자란가"를 진단으로 보여주기 위한 기준이다(R-02에서 조회 기간을
// 늘릴 때 그대로 재사용한다). 거래일 기준 1년 ≒ 250, 2년 ≒ 500, 3년 ≒ 750.
const RISK_TARGET_OBSERVATIONS = Object.freeze({
  technical: 250, volatility: 500, beta: 500, correlation: 500, var: 750, cvar: 750, mdd: 750
});
/* [C-3 · §44 제7조 · PM 승인 2026-09-20] 지표별로 실제로 쓰는 관측 창(거래일).
 * 목표 관측 수(위)와 같은 값이다 - 이제 조회가 3년이라 "목표대로 자른다"가 그대로 구현된다.
 * 왜 지표마다 다른가:
 *   · 변동성 · 베타 · 상관(2년) - 1년 창은 직전 국면 하나에 과적합된다. 실측에서 같은 종목의 σ가
 *     1년 창과 3년 창 사이에서 중앙값 21%p 움직였다.
 *   · VaR · CVaR · MDD(3년) - 꼬리 위험은 드물게 일어난 일을 봐야 한다. 1년 창은 직전 1년에 큰 하락이
 *     없으면 최대 낙폭을 구조적으로 과소평가한다(실측: AAPL 1년 -13.8% vs 3년 -33.4%, SPYM -9.1% vs -19.0%).
 *   · 기술 신호(1년) - 이동평균 · 52주 고저는 정의상 1년이면 충분하다(늘리면 의미가 달라진다).
 * 자료가 창보다 짧으면 있는 만큼 쓴다(없는 값을 만들지 않는다). */
const RISK_OBSERVATION_WINDOWS = RISK_TARGET_OBSERVATIONS;
function sliceRecentObservations(arr, windowSize) {
  if (!Array.isArray(arr)) return arr;
  return arr.length > windowSize ? arr.slice(-windowSize) : arr;
}
// 시계열 품질 검사 - 날짜 중복 · 역순 · 결측을 찾아낸다. 값을 고치지 않고 사실만 돌려준다.
function assessSeriesQuality(series, todayISO) {
  const issues = [];
  if (!series || !Array.isArray(series.closes) || series.closes.length === 0) {
    return { issues, stale: false, lastDate: null, observationCount: 0 };
  }
  const dates = Array.isArray(series.dates) ? series.dates : [];
  const withDate = dates.filter((d) => !!d);
  if (withDate.length !== series.closes.length) issues.push('missingDates');
  const seen = new Set();
  let ascending = true;
  for (let i = 0; i < withDate.length; i++) {
    if (seen.has(withDate[i])) issues.push('duplicateDate');
    seen.add(withDate[i]);
    if (i > 0 && withDate[i] < withDate[i - 1]) ascending = false;
  }
  if (!ascending) issues.push('outOfOrderDates');
  const lastDate = withDate.length ? withDate[withDate.length - 1] : null;
  let stale = false;
  if (lastDate && todayISO) {
    const gapDays = Math.floor((Date.parse(todayISO + 'T00:00:00Z') - Date.parse(lastDate + 'T00:00:00Z')) / 86400000);
    stale = Number.isFinite(gapDays) && gapDays > RISK_STALE_MAX_GAP_DAYS;
  }
  return { issues: [...new Set(issues)], stale, lastDate, observationCount: series.closes.length };
}

/* [R-03/R-04] 어떤 가격으로 만든 시계열인지 호출부가 반드시 고르게 한다.
 *   basis 'adjusted' - 통계 위험지표용(조정주가). 조정주가가 없으면 null을 돌려준다(대체 금지).
 *   basis 'raw'      - 기술 지표 · 화면 표시용(원주가).
 * 기본값을 두지 않는 이유: "무엇을 쓰는지 모르고 쓰는" 호출부를 만들지 않기 위해서다.
 */
function datedClosesFromSeries(data, basis) {
  if (!data || !Array.isArray(data.dates)) return null;
  const source = basis === 'adjusted' ? data.closesAdj : data.closes;
  if (!Array.isArray(source)) return null;
  const out = data.dates
    .map((d, i) => ({ date: d, close: source[i] }))
    .filter((x) => x.date && typeof x.close === 'number' && Number.isFinite(x.close));
  return out.length ? out : null;
}
// 조정주가를 실제로 쓸 수 있는 시계열인가 - 통계 지표의 선행 조건이다.
function hasAdjustedCloses(data) {
  return !!(data && Array.isArray(data.closesAdj) && data.closesAdj.some((c) => typeof c === 'number' && Number.isFinite(c)));
}
// 두 시계열의 "공통 거래일" 수익률 쌍을 만든다. 양쪽 모두 날짜가 있을 때만 정렬하고, 하나라도 날짜가
// 없으면(구 캐시/테스트 fixture 등) 기존 방식 그대로 최근 구간을 맞춰 쓴다 - 날짜가 없다고 계산을
// 포기하면 오히려 결측이 늘어나므로, 정확도가 올라갈 수 있을 때만 올린다.
// [Risk 정책 P-1 · v252] 날짜가 없는 시계열은 더 이상 "최근 N개를 나란히" 놓는 방식으로 대체하지 않는다 -
// 비교할 수 없다는 사실을 빈 결과로 돌려준다(aReturns/bReturns 인자는 호출부 호환용으로만 남는다).
function alignedReturnPair(aDated, aReturns, bDated, bReturns) {
  if (aDated && bDated && typeof dateAlignedReturns === 'function') {
    const al = dateAlignedReturns(aDated, bDated);
    return { a: al.returnsA, b: al.returnsB, aligned: true, observationCount: al.observationCount };
  }
  return { a: [], b: [], aligned: false, observationCount: 0 };
}

/* [D-05 · 1차 통합 구현] 비동기 쌍 베타 - Dimson 방식(시차 0 + 시차 1). 특정 상품에 묶이지 않는 일반 엔진이다.
 * 서로 다른 시장(예: 국내 상장 해외 ETF ↔ 미국 지수)은 같은 날짜라도 마감 시각이 다르다. 같은 날짜끼리 짝지으면
 * (dateAlignedReturns) 실제로는 서로 다른 시간 구간의 수익률이 짝지어져 베타가 0 근처로 무너진다(실측 상관 0.03~0.08).
 * 그래서 "종목 종가 시각" 기준으로 지수 구간을 나눈다.
 *   m(d)     : 종목 날짜 d의 종가보다 먼저 마감한 마지막 지수 날짜(마감 순서표 RISK_MARKET_CLOSE_ORDER)
 *   시차 1   : 지수 m(d_{k-1}) → m(d_k) - 종목 구간 안에서 이미 마감한 지수 움직임
 *   시차 0   : 지수 m(d_k) → 그다음 지수 날짜 - 종목 거래시간과 겹쳐 진행 중인 지수 세션
 *   종목 수익률 r_k = close(d_k)/close(d_{k-1}) − 1 을 두 지수 수익률에 동시에 회귀(절편 포함)하고, 두 기울기의 합을 베타로 쓴다.
 * 지수가 쉬어 m(d_{k-1}) = m(d_k)인 구간과 다음 지수 날짜가 아직 없는 마지막 구간은 쓰지 않는다 - 0% 채움 · 보간 없음.
 * 관측 수(행 수) 기준 최소 요건은 호출부가 MIN_COMMON_RISK_RETURNS(120)로 판정한다.
 */
// 같은 날짜 안에서 거래 시장이 마감하는 순서(작을수록 먼저). 한국 정규장(15:30 KST = 06:30 UTC)은
// 같은 날짜의 미국 정규장(16:00 ET = 20:00~21:00 UTC)보다 먼저 끝난다.
const RISK_MARKET_CLOSE_ORDER = Object.freeze({ KR: 0, US: 1 });
function riskCloseBefore(benchDate, benchMarket, assetDate, assetMarket) {
  if (benchDate !== assetDate) return benchDate < assetDate;
  return RISK_MARKET_CLOSE_ORDER[benchMarket] < RISK_MARKET_CLOSE_ORDER[assetMarket];
}
function cleanDatedSeries(dated) {
  if (!Array.isArray(dated)) return [];
  const m = new Map();
  dated.forEach((d) => { if (d && d.date && typeof d.close === 'number' && Number.isFinite(d.close) && d.close > 0) m.set(d.date, d.close); });
  return [...m.keys()].sort().map((date) => ({ date, close: m.get(date) }));
}
function buildAsyncDimsonRows(assetDated, benchDated, assetMarket, benchMarket) {
  const A = cleanDatedSeries(assetDated);
  const B = cleanDatedSeries(benchDated);
  const rows = [];
  if (A.length < 2 || B.length < 2 || !(assetMarket in RISK_MARKET_CLOSE_ORDER) || !(benchMarket in RISK_MARKET_CLOSE_ORDER)) return rows;
  // 각 종목 날짜의 m(d) - 두 시계열 모두 날짜순이므로 한 번 훑는다.
  const mIdx = [];
  let j = -1;
  A.forEach((a) => {
    while (j + 1 < B.length && riskCloseBefore(B[j + 1].date, benchMarket, a.date, assetMarket)) j++;
    mIdx.push(j);
  });
  for (let k = 1; k < A.length; k++) {
    const i0 = mIdx[k - 1], i1 = mIdx[k];
    if (i0 < 0 || i1 <= i0) continue;      // 지수가 쉬었다 - 구간을 만들지 않는다
    if (i1 + 1 >= B.length) continue;      // 시차 0 구간이 아직 관측되지 않았다
    rows.push({
      date: A[k].date,
      asset: A[k].close / A[k - 1].close - 1,
      previous: B[i1].close / B[i0].close - 1,     // 시차 1
      concurrent: B[i1 + 1].close / B[i1].close - 1 // 시차 0
    });
  }
  return rows;
}
// 절편 + 두 설명변수 최소제곱(정규방정식 3×3). 설명변수가 서로 완전히 겹치거나 분산이 없으면 null.
function solveTwoFactorOls(y, x1, x2) {
  const n = y.length;
  if (n < 3) return null;
  const mean = (v) => v.reduce((s, x) => s + x, 0) / n;
  const my = mean(y), m1 = mean(x1), m2 = mean(x2);
  let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
  for (let i = 0; i < n; i++) {
    const d1 = x1[i] - m1, d2 = x2[i] - m2, dy = y[i] - my;
    s11 += d1 * d1; s22 += d2 * d2; s12 += d1 * d2; s1y += d1 * dy; s2y += d2 * dy;
  }
  const det = s11 * s22 - s12 * s12;
  if (!(Math.abs(det) > 1e-18)) return null;
  return { b1: (s1y * s22 - s2y * s12) / det, b2: (s2y * s11 - s1y * s12) / det };
}
function computeAsyncDimsonBeta(assetDated, benchDated, assetMarket, benchMarket) {
  const rows = buildAsyncDimsonRows(assetDated, benchDated, assetMarket, benchMarket);
  const fit = solveTwoFactorOls(rows.map((r) => r.asset), rows.map((r) => r.concurrent), rows.map((r) => r.previous));
  const ok = !!fit && Number.isFinite(fit.b1) && Number.isFinite(fit.b2);
  return {
    beta: ok ? fit.b1 + fit.b2 : null,
    betaConcurrent: ok ? fit.b1 : null,
    betaPrevious: ok ? fit.b2 : null,
    observationCount: rows.length,
    startDate: rows.length ? rows[0].date : null,
    endDate: rows.length ? rows[rows.length - 1].date : null
  };
}

// [Risk 정책 P-1 · P-2 · v252] 포트폴리오 위험 계산의 공통 거래일.
//   D = 대상 종목 모두의 (날짜, 유효 종가)에 들어 있는 날짜의 교집합(오름차순)
//   r_i(k) = close_i(D[k]) / close_i(D[k-1]) - 1
// 한쪽 시장만 쉰 날은 교집합에서 빠지므로 그다음 공통일의 수익률이 두 공통일 사이의 변화가 된다 -
// 휴장일을 0%로 만들거나, 가격을 앞 값으로 채우거나, 보간하지 않는다. 날짜가 없는 종목이 하나라도 있으면
// 공통 거래일을 만들 수 없다(그 종목을 빼고 계산하지 않는다).
const MIN_COMMON_RISK_RETURNS = 120;

/* [BOND-5 · §47-2 · PM 승인 2026-09-20] 포트폴리오 베타 집계
 *
 * 예전 규칙: 대상 종목 중 하나라도 베타가 없으면 포트폴리오 베타를 통째로 null로 뒀다("전부 또는 무").
 * 그 취지는 "모르는 것을 아는 척하지 않는다"였는데, 종목 하나가 빠졌다는 이유로 시장위험 지표 전체가
 * 사라져 버렸다. 채권까지 진단에 들어오면 이 상태가 상시화된다.
 *
 * 새 규칙: 베타를 구한 종목만으로 가중평균하되 **그 종목들이 주식 노출의 몇 %인지(coverage)를 함께**
 * 돌려준다. 값을 숨기는 대신 "어디까지를 설명한 값인지"를 밝히는 것이다. 설명 범위가 너무 좁으면
 * (BETA_COVERAGE_MIN 미만) 여전히 값을 내지 않는다 - 그때는 평균이 포트폴리오를 대표하지 못한다.
 * 채권은 애초에 이 집계의 대상이 아니다(분자에도 분모에도 넣지 않는다 - 0으로 대입하지 않는다).
 */
const BETA_COVERAGE_MIN = 0.5;
function computeBetaAggregate(holdings) {
  const list = Array.isArray(holdings) ? holdings : [];
  const totalWeight = list.reduce((sum, h) => sum + (Number.isFinite(h.weight) ? h.weight : 0), 0);
  const withBeta = list.filter((h) => typeof h.beta === 'number' && Number.isFinite(h.beta));
  const covered = withBeta.reduce((sum, h) => sum + (Number.isFinite(h.weight) ? h.weight : 0), 0);
  const coverage = totalWeight > 0 ? covered / totalWeight : 0;
  const missingCount = list.length - withBeta.length;
  if (!list.length || covered <= 0 || coverage < BETA_COVERAGE_MIN) {
    return { beta: null, coverage, missingCount, covered, totalWeight, enough: false };
  }
  // 구한 종목들 안에서의 비중으로 가중평균한다 - 빠진 종목 몫을 남은 종목에 얹어 총량을 부풀리지 않는다.
  const beta = withBeta.reduce((sum, h) => sum + h.beta * h.weight, 0) / covered;
  return { beta, coverage, missingCount, covered, totalWeight, enough: true };
}
function buildCommonDateReturns(seriesList) {
  const empty = { dates: [], returnsByKey: new Map(), commonReturnCount: 0, startDate: null, endDate: null };
  if (!Array.isArray(seriesList) || seriesList.length === 0) return empty;
  const maps = [];
  for (const s of seriesList) {
    if (!s || !Array.isArray(s.datedCloses) || s.datedCloses.length === 0) return empty;
    const m = new Map();
    s.datedCloses.forEach((d) => {
      if (d && d.date && typeof d.close === 'number' && Number.isFinite(d.close) && d.close > 0) m.set(d.date, d.close);
    });
    maps.push({ key: s.key, map: m });
  }
  let common = [...maps[0].map.keys()];
  for (let i = 1; i < maps.length; i++) common = common.filter((d) => maps[i].map.has(d));
  common.sort();
  if (common.length < 2) {
    return { ...empty, startDate: common[0] || null, endDate: common[0] || null };
  }
  const returnsByKey = new Map();
  maps.forEach(({ key, map }) => {
    const r = [];
    for (let k = 1; k < common.length; k++) r.push(map.get(common[k]) / map.get(common[k - 1]) - 1);
    returnsByKey.set(key, r);
  });
  return {
    dates: common.slice(1),
    returnsByKey,
    commonReturnCount: common.length - 1,
    startDate: common[0],
    endDate: common[common.length - 1]
  };
}
// 공통 거래일 수익률을 비중대로 합친다 - 비중은 그대로 쓰고(재정규화 없음), 모든 종목이 들어 있어야 한다.
function buildPortfolioCommonReturns(list, commonDates) {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (!list.every((h) => Array.isArray(h.commonReturns))) return [];
  // [R-11] 예전에는 가장 짧은 배열 길이에 맞춰 인덱스 0부터 더했다. 지금은 모든 종목이 같은
  // 교집합(buildCommonDateReturns) 한 번에서 나와 결과가 같지만, 지표별 관측기간(§44 제7조)이
  // 도입되면 길이가 서로 달라질 수 있고 그때는 "가장 오래된 구간끼리" 더하는 조용한 오류가 된다.
  // 그래서 길이가 아니라 날짜 축을 기준으로 맞추고, 어긋나면 값을 만들지 않는다.
  const dates = Array.isArray(commonDates) ? commonDates : null;
  const n = dates ? dates.length : list[0].commonReturns.length;
  if (!list.every((h) => h.commonReturns.length === n)) return [];
  const out = [];
  for (let k = 0; k < n; k++) {
    let sum = 0;
    list.forEach((h) => { sum += h.weight * h.commonReturns[k]; });
    out.push(sum);
  }
  return out;
}
// [Risk 정책 P-2 · v252] 거래량 20일 평균 - 결측(null)은 평균에서 빼고 실제 0은 포함한다.
// computeSMA는 종가 이동평균에도 쓰이므로 건드리지 않고 거래량 전용으로 따로 둔다.
function computeVolumeMA(volumes, period) {
  if (!Array.isArray(volumes) || volumes.length < period) return null;
  const valid = volumes.slice(-period).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
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
// [Phase 39-B] 아래 네 함수(beta/correlation/Sortino/연환산 변동성)가 각자 하드코딩하고 있던 최소
// 관측치 10을 한 곳으로 모은다. 값 자체는 바뀌지 않으며(전부 원래 10), hasData 판정도 같은 기준을 쓴다.
const MIN_RETURNS_FOR_STATS = 10;
function computeBetaFromReturns(assetReturns, benchmarkReturns) {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < MIN_RETURNS_FOR_STATS) return null;
  const a = assetReturns.slice(-n), b = benchmarkReturns.slice(-n);
  const ma = statMean(a), mb = statMean(b);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); varB += (b[i] - mb) * (b[i] - mb); }
  if (varB === 0) return null;
  return cov / varB;
}
function computeCorrelationFromReturns(x0, y0) {
  const n = Math.min(x0.length, y0.length);
  if (n < MIN_RETURNS_FOR_STATS) return null;
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
  if (!returns || returns.length < MIN_RETURNS_FOR_STATS) return null;
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
/* [D-7 · PM 승인 2026-09-20] 값을 실측으로 다시 맞췄다.
 * scripts/closeout/research/index-drawdowns.js가 지수 일별 종가를 직접 받아 연도 구간의 고점~저점
 * 낙폭을 계산했고(기록: docs/closeout/research/index-drawdowns.json), 기존 상수와 대조한 결과
 * 8개 중 6개는 실측과 0.2%p 이내로 일치했다(즉 §44 제11조대로 역사적 데이터에서 나온 값이었다).
 * 두 가지만 달랐다.
 *   · KOSDAQ 2020: -33.0 → 실측 -38.15 (5.15%p 과소) - 사용자가 보는 손실 추정이 그만큼 작았다.
 *   · NASDAQ(종합): 상수가 아예 없어, 이 지수를 기준으로 삼는 종목이 하나라도 있으면 스트레스
 *     시나리오 전체가 null이었다. 이제 실측값이 있다.
 * 나머지 차이(<1%p)는 구간 정의 차이라 실측값으로 통일했다. 스트레스는 6대 위험요인 점수에
 * 들어가지 않으므로(별도 표시) 위험점수는 이 변경으로 바뀌지 않는다. */
const COVID_CRASH_BENCHMARK_DROP_PCT = { KOSPI: -35.71, KOSDAQ: -38.15, SP500: -33.92, NASDAQ: -30.12, NASDAQ100: -28.03, DOW: -37.09 };
/* [D-9 · PM 승인 2026-09-20] 원화 기준 낙폭.
 * 국내 상장 비헤지 해외 ETF는 지수를 H.10으로 원화 환산해 베타를 구한다(§44 44-15 · D-05).
 * 그 베타에 현지통화 낙폭을 곱하면 정의가 섞이므로 예전에는 스트레스를 아예 만들지 않았다.
 * 이제 같은 조사에서 원화 환산 낙폭도 함께 산출했으므로(H.10 기준 · v262 고정 스냅샷),
 * 원화 베타에는 원화 낙폭을 곱한다 - 정의가 맞는 짝끼리만 곱한다는 원칙은 그대로다.
 * 국내 지수(KOSPI · KOSDAQ)는 애초에 원화라 환산 대상이 아니다. */
const COVID_CRASH_BENCHMARK_DROP_PCT_KRW = { SP500: -29.86, NASDAQ: -27.65, NASDAQ100: -25.69, DOW: -32.72 };
// [2022 고금리 기술주 폭락 재현] 2022년 한 해 동안(고점~저점) 실제 벤치마크 지수 낙폭(%, 공개된 역사적
// 수치) - 미 연준의 급격한 금리 인상으로 특히 기술/성장주가 크게 빠졌던 구간이다. 2020 코로나 폭락과
// 같은 방식(베타 × 실측 낙폭)으로 근사한다 - "급락"이 아니라 "장기간에 걸친 약세장"이라는 점에서 2020
// 시나리오와 성격이 달라, 두 시나리오를 함께 보여주면 "짧고 강한 충격" vs "길게 이어지는 하락"을
// 비교해서 감을 잡을 수 있다.
const RATE_HIKE_2022_BENCHMARK_DROP_PCT = { KOSPI: -27.89, KOSDAQ: -36.84, SP500: -25.43, NASDAQ: -35.49, NASDAQ100: -35.28, DOW: -21.94 };
const RATE_HIKE_2022_BENCHMARK_DROP_PCT_KRW = { SP500: -17.55, NASDAQ: -31.37, NASDAQ100: -31.15, DOW: -12.41 };

/* -------------------------------------------------------------------------
 * 18-1b. [정밀 포트폴리오 리스크 엔진] 섹터/ETF 룩스루 매핑 + 수급 대체 지표 + 6대 위험요인 계산
 *    - 실시간 API가 아닌 사전 정의 표(SECTOR_MAP/ETF_HOLDINGS_MAP)로 섹터 집중도·ETF 실질노출을
 *      근사 계산한다. 매핑에 없는 종목/ETF는 자동으로 "미분류"로 안전하게 빠진다(계산 오류 없음).
 *    - 수급(외국인·기관 매매동향)은 실제 수급 데이터 소스가 없어 거래량+가격변동 기반 대체 지표를
 *      쓴다 - 화면과 데이터 신뢰도 점수에 항상 "추정치"임을 명시한다.
 * ---------------------------------------------------------------------- */
// 국내 대형주/미국 대형주 섹터 매핑 - 보유 가능성이 높은 종목 위주로만 커버하며, 없는 종목은 "미분류".
// [1차 통합 구현 · 공유표 원칙 · §44 44-16] SECTOR_MAP · ETF_HOLDINGS_MAP은 신규 항목 추가를 동결한다(삭제하지 않는다).
//   역할 분리: ① 섹터 노출(sectorWeights · 섹터 집중도 · 룩스루) - 이 표의 고유 역할로 계속 쓴다.
//              ② 자산 성격 판정 - Exposure Master가 우선한다(js/05 resolveAssetCharacter 1-1단계). 이 표는
//                 원장에 없는 종목의 대체 근거, 그리고 Return Key 자동 판정 경로(원장을 보지 않는 기존 경로)에만 남는다.
//              ③ Risk Benchmark - Exposure Master · Index Master가 정한다(ETF 라벨 경로는 동결된 대체 경로).
//   새 상품의 성격 · Benchmark 사실은 이 표가 아니라 Exposure Master에 근거와 함께 넣는다.
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
// 않아, 국내 종목명은 별도 표/데이터로 관리한다 - findTickerByKoreanName()이 이 데이터와 보유 자산
// 이름을 함께 검색해 티커로 변환한다.
// [2026-08 - 전종목 마스터 도입] 예전엔 이 정적 표(당시 KR_STOCK_NAMES) 하나가 유일한 검색 소스라
// 코스피/코스닥 주요종목 약 90개 밖에 못 찾았다("대덕전자" 등 표에 없는 종목은 검색 자체가 안 됨).
// 이제는 GitHub Actions가 매달 KIS 공식 종목 마스터(코스피/코스닥 전종목 + 나스닥/뉴욕/아멕스 주요
// 종목)를 내려받아 data/ticker-master.json으로 커밋해두고, loadTickerMaster()(바로 아래)가 앱 부팅
// 시 이걸 jsDelivr CDN 경유로 받아와 tickerMasterRecords 등에 채워 넣는다 - 실질적인 검색은 이제
// 이 데이터가 1차로 담당한다.
// 이 상수(TICKER_NAME_FALLBACK_SEED)는 이름 그대로 "혹시 그 다운로드/캐시가 실패했을 때"의 최소
// 안전망으로만 남겨뒀다 - 오프라인 최초 실행, jsDelivr 장애, 아직 Actions가 한 번도 안 돌았을 때도
// 최소한 대형주 검색은 되게 한다. 정상적으로 마스터 데이터가 로드되면 이 표의 항목들은 마스터 데이터에
// 그대로 포함돼 있어 실질적으로 안 쓰인다(findTickerByKoreanName/searchStockAnalysisCandidates 참고).
const TICKER_NAME_FALLBACK_SEED = {
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
  '001040.KS': 'CJ', '097950.KS': 'CJ제일제당', '128940.KS': '한미약품', '042700.KS': '한미반도체',
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

/* -------------------------------------------------------------------------
 * [종목 마스터 데이터 로딩] data/ticker-master.json(scripts/update-ticker-master.js가 매달 생성,
 * .github/workflows/update-ticker-master.yml 참고)을 jsDelivr CDN 경유로 받아와 검색용 인덱스를
 * 만든다. localStorage에 캐싱해두고 20일 넘게 지났을 때만 다시 fetch한다(매달 1일에나 바뀌는
 * 데이터를 매번 새로 받을 필요는 없음 - 다른 day-cache 패턴들과 동일한 절약 철학).
 * ---------------------------------------------------------------------- */
const TICKER_MASTER_CDN_URL = 'https://cdn.jsdelivr.net/gh/key4125-netizen/jasan@main/data/ticker-master.json';
const LS_TICKER_MASTER_CACHE = 'sam_ticker_master_cache_v1';
const TICKER_MASTER_REFRESH_DAYS = 20;
const TICKER_MASTER_MIN_SANE_COUNT = 1000; // 이보다 적으면(다운로드 실패로 빈 placeholder만 받은 경우 등) 무시하고 폴백 시드만 쓴다

let tickerMasterRecords = []; // 부분일치 검색용 원본 배열(이름/티커 소문자 미리 계산해 둠)
let tickerMasterByTicker = {}; // yahooTicker -> record, 완전일치 O(1) 조회용
let tickerMasterByExactName = {}; // 한글명/영문명 완전일치 -> record
let tickerMasterLoaded = false;

function applyTickerMasterData(json) {
  const items = (json && Array.isArray(json.items)) ? json.items : [];
  if (items.length < TICKER_MASTER_MIN_SANE_COUNT) return; // 비정상적으로 적은 데이터는 아예 반영하지 않음(폴백 시드 유지)
  tickerMasterRecords = items.map((it) => ({
    ...it,
    _nameKrLower: (it.nameKr || '').toLowerCase(),
    _nameEnLower: (it.nameEn || '').toLowerCase(),
    _tickerLower: (it.yahooTicker || '').toLowerCase()
  }));
  tickerMasterByTicker = {};
  tickerMasterByExactName = {};
  tickerMasterRecords.forEach((r) => {
    tickerMasterByTicker[r.yahooTicker] = r;
    if (r.nameKr) tickerMasterByExactName[r.nameKr] = r;
    if (r.nameEn) tickerMasterByExactName[r.nameEn] = r;
  });
  tickerMasterLoaded = true;
}

// localStorage 캐시를 동기적으로 즉시 반영한다(있으면) - fetch 완료를 기다리지 않고도 앱을 켜자마자
// 검색이 되게 하기 위해서다. 반환값은 캐시가 저장된 시각(ms) - 없으면 null.
function loadTickerMasterFromCache() {
  try {
    const raw = localStorage.getItem(LS_TICKER_MASTER_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.fetchedAt) return null;
    applyTickerMasterData(parsed.data);
    return parsed.fetchedAt;
  } catch (e) {
    return null;
  }
}

// [부팅 시 1회 호출, await 없이 fire-and-forget] 이 함수 자체는 async지만, 첫 줄
// loadTickerMasterFromCache()가 동기 함수라 캐시가 있으면 이 호출이 반환되기 전에(=같은 동기 실행
// 구간 안에서) 이미 검색 가능한 상태가 된다 - refreshPricesAndRates() 등 기존 부팅 패턴과 동일하게
// 네트워크 갱신은 백그라운드에서 조용히 진행된다.
async function loadTickerMaster() {
  const fetchedAt = loadTickerMasterFromCache();
  const ageDays = fetchedAt ? (Date.now() - fetchedAt) / 86400000 : Infinity;
  if (fetchedAt && ageDays < TICKER_MASTER_REFRESH_DAYS) return; // 캐시가 충분히 최신이면 네트워크 요청 생략

  try {
    const res = await fetch(TICKER_MASTER_CDN_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch_failed_' + res.status);
    const data = await res.json();
    applyTickerMasterData(data);
    if (tickerMasterLoaded) localStorage.setItem(LS_TICKER_MASTER_CACHE, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch (e) {
    // 네트워크 실패/최초 실행 전(placeholder만 있는 상태)이어도 조용히 무시한다 - findTickerByKoreanName/
    // searchStockAnalysisCandidates가 자동으로 TICKER_NAME_FALLBACK_SEED + learnedTickerNames로
    // 계속 동작하므로 검색 기능 자체가 죽지는 않는다(대상 범위만 좁아질 뿐).
  }
}

// ETF는 "섹터 비중맵"(합계 약 1.0)으로 등록해 실질 룩스루 노출 계산에 쓴다 - 운용사 팩트시트 기준
// 대략적인 값이며 실시간 구성종목 API가 아니므로 실제 비중과 차이가 있을 수 있다(화면에 항상 명시).
// [1차 통합 구현] 신규 항목 추가 동결 · 역할 분리는 위 SECTOR_MAP 주석과 같다(test/integrated-benchmark-index.test.js가 키 목록을 고정).
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
  if (!returns || returns.length < MIN_RETURNS_FOR_STATS) return null;
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
  // [R-04] 수급 대체 지표도 기술 지표다 - 원주가 기준 당일 등락률을 쓴다.
  const closesRaw = h.closesRaw || h.closes;
  if (!closesRaw || closesRaw.length < 2 || !h.volMA20 || typeof h.lastVolume !== 'number') return null;
  const lastChangePct = ((closesRaw[closesRaw.length - 1] - closesRaw[closesRaw.length - 2]) / closesRaw[closesRaw.length - 2]) * 100;
  if (h.lastVolume >= h.volMA20 * 2 && lastChangePct <= -2) return 'outflow';
  if (h.lastVolume >= h.volMA20 * 2 && lastChangePct >= 2) return 'inflow';
  if (h.lastVolume <= h.volMA20 * 0.4) return 'quiet';
  return 'neutral';
}
// [용어 정비 S-31] 거래량+등락만 본 추정 신호라 매수·매도 주체를 단정하지 않는 이름으로 표시한다(판정은 그대로).
function flowSignalLabel(signal) {
  if (signal === 'outflow') return { label: '거래량 늘며 하락', emoji: '🔴' };
  if (signal === 'inflow') return { label: '거래량 늘며 상승', emoji: '🟢' };
  if (signal === 'quiet') return { label: '거래 한산', emoji: '🟡' };
  if (signal === 'neutral') return { label: '특이 신호 없음', emoji: '🟢' };
  return { label: '데이터 부족', emoji: '⚪' };
}

// 데이터가 있는 종목들 간 전체 상관계수 행렬 - { tickerA: { tickerB: 상관계수 } }.
// [Phase 39-B] 종목 쌍도 공통 거래일 기준으로 비교한다. 공통 거래일 수익률이 없으면 null이다 -
// 길이만 맞춰 세는 옛 폴백은 쓰지 않는다(조용한 근사보다 "계산 불가"가 정직하다).
// [Risk 정책 P-1 · v252] 포트폴리오와 같은 공통 거래일 수익률(commonReturns)로 계산한다.
function computeFullCorrelationMatrix(list) {
  const matrix = {};
  list.forEach((a) => {
    matrix[a.ticker] = {};
    list.forEach((b) => {
      if (a.ticker === b.ticker) { matrix[a.ticker][b.ticker] = 1; return; }
      matrix[a.ticker][b.ticker] = (Array.isArray(a.commonReturns) && Array.isArray(b.commonReturns))
        ? computeCorrelationFromReturns(a.commonReturns, b.commonReturns)
        : null;
    });
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
// [Risk 정책 P-1 · v252] 종목 수익률도 포트폴리오와 같은 공통 거래일(commonReturns)을 쓴다. 음수 0 처리는 그대로다.
function computeRiskContributions(withData, portfolioReturns) {
  // [R-01 · 조용한 대체 금지] 예전에는 종목-포트폴리오 베타를 구하지 못하면 1로 가정해 기여도를
  // 만들어 냈다(= 비중 그대로). 이제는 구하지 못한 종목의 기여도를 null로 두고 합계에서도 뺀다.
  const byTicker = {};
  if (!Array.isArray(portfolioReturns) || portfolioReturns.length === 0) {
    withData.forEach((h) => { byTicker[h.ticker] = null; });
    return byTicker;
  }
  /* [F-7 · §39-3 · PM 승인 2026-09-20] 음수 기여도를 0으로 깎지 않는다.
   * 포트폴리오와 반대로 움직인 종목의 기여도는 실제로 음수이고(분산 효과), 그것이 사실이다.
   * 예전에는 Math.max(0, …)로 눌러 "기여도 0%"로 보여 줬는데, 그러면 ① 실제로 위험을 낮춘
   * 종목이 아무것도 안 한 것처럼 보이고 ② 나머지 종목의 몫이 그만큼 부풀려졌다.
   * 기여도의 합은 정의상 포트폴리오 베타(=1)이므로, 자르지 않아야 합이 100%로 맞는다. */
  const raw = withData.map((h) => {
    const betaToPortfolio = Array.isArray(h.commonReturns) ? computeBetaFromReturns(h.commonReturns, portfolioReturns) : null;
    return {
      ticker: h.ticker,
      contribution: typeof betaToPortfolio === 'number' && Number.isFinite(betaToPortfolio)
        ? betaToPortfolio * h.weight : null
    };
  });
  const total = raw.reduce((s, r) => s + (r.contribution ?? 0), 0);
  // 합이 0 근처면 비율 자체가 의미를 잃는다(0으로 나누는 것과 같다) - 그때는 만들지 않는다.
  const totalUsable = Number.isFinite(total) && Math.abs(total) > 1e-9;
  raw.forEach((r) => { byTicker[r.ticker] = (r.contribution === null || !totalUsable) ? null : (r.contribution / total) * 100; });
  return byTicker;
}
// 임계 구간표를 이용해 실수값을 0~100 위험 점수로 변환하는 공용 헬퍼 - bands는 max 오름차순 배열이며
// 마지막 항목의 max는 Infinity여야 한다.
function scoreFromBands(value, bands) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  for (const b of bands) { if (value <= b.max) return b.score; }
  return bands[bands.length - 1].score;
}
// [Phase 39-B] 결측을 산술에 태우면 조용히 0이 되어(`Math.abs(null)`도 `null * 100`도 0) 유한값처럼
// 보이고, 그 결과 scoreFromBands가 "가장 안전한 구간"을 돌려준다. 아래 두 헬퍼로 결측을 null로
// 유지시켜 각 subScore의 `?? 50`(모르면 중립) 폴백이 실제로 작동하게 한다.
const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const absOrNull = (v) => (finiteOrNull(v) === null ? null : Math.abs(v));

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
  const hhiScore = scoreFromBands(finiteOrNull(m.hhi) === null ? null : m.hhi * 100, [
    { max: 15, score: 20 }, { max: 25, score: 40 }, { max: 35, score: 60 },
    { max: 50, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const sectorScore = scoreFromBands(m.sectorExposure.topSectorWeight, [
    { max: 20, score: 10 }, { max: 35, score: 30 }, { max: 50, score: 55 },
    { max: 65, score: 75 }, { max: 80, score: 90 }, { max: Infinity, score: 100 }
  ]);
  // [Phase 39-B] 세 구성요소의 결측 폴백이 `?? 0`(= 위험 없음)이었다. 다른 요인의 `?? 50`(중립)과
  // 어긋나 결측을 "가장 안전"으로 해석하는 구조였다. 현재 엔진 경로에서는 topWeight/hhi/섹터가 항상
  // 숫자라 실제로는 도달하지 않는 이론적 경로지만, 같은 함정이 다시 생기지 않도록 원칙을 통일한다.
  return Math.round((singleScore ?? 50) * 0.4 + (hhiScore ?? 50) * 0.3 + (sectorScore ?? 50) * 0.3);
}
// ② 변동성위험 - 포트폴리오 연환산 변동성.
function computeVolatilityRiskScore(m) {
  // [R-01 · §44 44-13] 결측을 50(중립)으로 바꾸지 않는다 - 계산할 수 없으면 null로 두고
  // 종합 점수에서 그 요인을 빼고 재정규화한다("모름"을 "보통"으로 표시하지 않는다).
  return scoreFromBands(m.portfolioVolatilityPct, [
    { max: 15, score: 20 }, { max: 20, score: 40 }, { max: 25, score: 60 },
    { max: 30, score: 80 }, { max: Infinity, score: 100 }
  ]);
}
// ③ 손실위험(Drawdown/Tail) - MDD(40%) + VaR95(30%) + CVaR(30%).
// [Phase 39-B] 예전엔 `Math.abs(m.portfolioMDDPct ?? 0)`이라 결측(null/undefined)이 0으로 바뀌었고,
// 0은 유한값이라 scoreFromBands가 최저 위험 구간(20점)을 돌려줬다 - 아래 `?? 50` 폴백에 도달조차
// 하지 못하는 구조였다. 이제 결측을 그대로 넘겨(Math.abs(null) 대신 null 유지) `?? 50`이 작동한다.
// 같은 이유로 var95Pct/cvarPct도 결측이면 Math.abs를 태우지 않는다 - Math.abs(null)은 0이라
// 똑같은 함정에 빠진다. "데이터 없음"은 "손실 없음"이 아니다.
function computeDrawdownTailRiskScore(m) {
  const mddScore = scoreFromBands(absOrNull(m.portfolioMDDPct), [
    { max: 10, score: 20 }, { max: 20, score: 40 }, { max: 30, score: 60 },
    { max: 40, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const varScore = scoreFromBands(absOrNull(m.var95Pct), [
    { max: 1.5, score: 20 }, { max: 2.5, score: 40 }, { max: 3.5, score: 60 },
    { max: 5, score: 80 }, { max: Infinity, score: 100 }
  ]);
  const cvarScore = scoreFromBands(absOrNull(m.cvarPct), [
    { max: 2.5, score: 20 }, { max: 4, score: 40 }, { max: 6, score: 60 },
    { max: 8, score: 80 }, { max: Infinity, score: 100 }
  ]);
  // [R-01] 요인 안에서도 결측을 50으로 채우지 않는다 - 구할 수 있는 구성요소만 가중 재정규화하고,
  // 셋 다 없으면 이 요인 자체를 null로 둔다(MDD · VaR · CVaR은 같은 수익률에서 나와 보통 함께 결정된다).
  const parts = [[mddScore, 0.4], [varScore, 0.3], [cvarScore, 0.3]].filter(([v]) => typeof v === 'number' && Number.isFinite(v));
  if (parts.length === 0) return null;
  const wSum = parts.reduce((t, [, w]) => t + w, 0);
  return Math.round(parts.reduce((t, [v, w]) => t + v * w, 0) / wSum);
}
// ④ 시장위험 - 포트폴리오 베타(시장 대비 널뛰기 위험).
function computeMarketRiskScore(m) {
  // [R-01] 베타를 구하지 못하면(기준 지수 미확인 등) null - 50으로 채우지 않는다.
  return scoreFromBands(m.portfolioBeta, [
    { max: 0.8, score: 20 }, { max: 1.0, score: 35 }, { max: 1.2, score: 55 },
    { max: 1.4, score: 75 }, { max: Infinity, score: 95 }
  ]);
}
// ⑤ 상관관계위험(운명 공동체) - 비중 가중 평균 상관계수.
// [Phase 39-B] 결측 폴백이 40이었다. 40은 밴드상 "상관 0.3~0.5 = 어느 정도 분산되고 있다"는 뜻이라,
// 계산조차 못 한 상태를 긍정적 판정으로 바꾸고 있었다(6개 요인 중 유일하게 50이 아닌 폴백이었고
// 근거도 코드에 없었다). 다른 요인과 같은 `missing → 50`(모르면 중립)으로 통일한다.
// 반대 방향의 오해도 만들지 않는다 - "상관계수 없음"이 "상관이 높다"는 뜻은 아니다.
function computeCorrelationRiskScore(m) {
  // [R-01] 상관계수를 계산할 수 없으면 null - "상관 없음"도 "중립"도 아니기 때문이다.
  return scoreFromBands(m.weightedAvgCorrelation, [
    { max: 0.3, score: 20 }, { max: 0.5, score: 40 }, { max: 0.7, score: 60 },
    { max: 0.85, score: 80 }, { max: Infinity, score: 100 }
  ]);
}
// ⑥ 기술/수급위험 - 종목별 [RSI 과열도 + 추세이탈 + 수급신호]를 비중가중 평균한다.
function computeTechnicalFlowRiskScore(holdings) {
  // [R-01] 기술 신호가 하나도 없는 종목까지 50점으로 세면 결측이 중립값으로 섞인다.
  // 신호가 있는 종목의 비중만 모아 평균하고, 그런 종목이 없으면 이 요인을 null로 둔다.
  const covered = holdings.filter((h) => typeof h.rsi14 === 'number' || !!h.trendLabel || !!h.flowSignal);
  const weightSum = covered.reduce((s, h) => s + h.weight, 0);
  if (weightSum === 0) return null;
  const weightedScore = covered.reduce((s, h) => {
    let score = 50;
    if (typeof h.rsi14 === 'number') {
      score = h.rsi14 >= 70 ? 70 + Math.min(30, (h.rsi14 - 70) * 1.5)
        : h.rsi14 <= 30 ? 55
        : 30;
    }
    if (h.trendLabel === '역배열(하락추세)') score += 15;
    if (h.flowSignal === 'outflow') score += 15;
    if (h.flowSignal === 'inflow') score -= 5;
    return s + Math.max(0, Math.min(100, score)) * h.weight;
  }, 0);
  return Math.round(weightedScore / weightSum);
}
// [종합 위험점수] 6대 요인 가중합 + 극단위험 가산(어느 한 요인이라도 90점 이상이면 +5, 95점 이상이면
// +8 - 다른 요인이 낮다고 평균으로 희석돼 실제로 위험한 포트폴리오가 저평가되는 것을 막는다).
/* [R-09 · §44 제12조] 지표별 산출 상태. 하나가 모자라다고 화면 전체를 숨기지 않기 위해,
 * 지표마다 "구했는가 / 못 구했다면 왜인가 / 관측이 몇 개이고 정책 목표는 몇 개인가"를 남긴다.
 * reason은 §44 제9조의 상태 코드를 그대로 쓰고, 사용자 문구로의 번역은 화면(js/10)이 맡는다.
 */
function riskMetricState(value, reason, observations, required, target) {
  const available = typeof value === 'number' && Number.isFinite(value);
  return {
    status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    reason: available ? null : reason,
    observations: typeof observations === 'number' ? observations : null,
    required: typeof required === 'number' ? required : null,
    // 정책 목표 관측 수(§44 제7조). 조회 기간은 C-3으로 3년(fetchDailyClosesWithStatus 기본 range='3y')이라
    // 상장 기간이 짧은 종목에서만 미달한다. 이 값은 "앞으로
    // 얼마나 더 필요한가"를 보여주는 참고치다 - 이것 때문에 지표를 막지는 않는다.
    targetObservations: typeof target === 'number' ? target : null
  };
}
const RISK_FACTOR_WEIGHTS = Object.freeze({
  concentration: 0.25, volatility: 0.20, drawdown: 0.20, market: 0.15, correlation: 0.10, technical: 0.10
});
// 화면에서 쓰는 요인 이름 - 내부 키를 그대로 노출하지 않는다.
const RISK_FACTOR_LABELS = Object.freeze({
  concentration: '집중도 위험', volatility: '변동성 위험', drawdown: '손실 위험',
  market: '시장 민감도(베타)', correlation: '분산 효과(상관관계)', technical: '기술·수급 신호'
});
/* [R-01 · §44 44-13 · 기존 P-8 대체] 예전에는 결측 요인을 50점(중립)으로 채워 넣었다.
 * 그러면 "기준 지수를 확인하지 못해 시장위험을 모른다"가 "시장위험이 보통이다"로 표시된다.
 * 이제 계산할 수 없는 요인은 가중합에서 제외하고, 남은 요인의 가중치를 다시 정규화한다.
 * 요인이 하나도 없으면 점수를 만들지 않는다(null) - 없는 것을 지어내지 않는다.
 * 점수의 방향(높을수록 위험) · 0~100 범위 · 등급 임계값(40/60) · 극단 가산은 그대로다.
 */
function computeCompositeRiskScore(subScores) {
  const available = Object.keys(RISK_FACTOR_WEIGHTS)
    .filter((key) => typeof subScores[key] === 'number' && Number.isFinite(subScores[key]));
  if (available.length === 0) return null;
  const weightSum = available.reduce((s, key) => s + RISK_FACTOR_WEIGHTS[key], 0);
  const base = available.reduce((s, key) => s + subScores[key] * RISK_FACTOR_WEIGHTS[key], 0) / weightSum;
  const maxSub = Math.max(...available.map((key) => subScores[key]));
  const extremePenalty = maxSub >= 95 ? 8 : maxSub >= 90 ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(base + extremePenalty)));
}
// 점수에 반영되지 못한 요인 목록 - 화면이 "무엇이 빠졌는지" 그대로 보여줄 수 있게 한다.
function excludedRiskFactors(subScores) {
  return Object.keys(RISK_FACTOR_WEIGHTS)
    .filter((key) => !(typeof subScores[key] === 'number' && Number.isFinite(subScores[key])))
    .map((key) => ({ key, label: RISK_FACTOR_LABELS[key], weight: RISK_FACTOR_WEIGHTS[key] }));
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
// [Phase 39-B] 감점 요소 2가지를 추가한다. 예전엔 벤치마크를 하나도 못 받아왔거나 상관관계를 전혀
// 계산하지 못한 상태에서도 신뢰도가 92(만점)로 찍혀 "데이터 충분"으로 보였다 - 정작 그 두 값이
// 위험점수의 시장위험(15%)과 상관관계위험(10%)을 결정하는데도 그랬다.
//   · benchmark 결측: 베타를 구하지 못한 종목의 비중만큼 감점(최대 15). 시장위험 가중치와 같은 크기다.
//   · correlation 계산 불가: 종목이 2개 이상인데도 유효한 쌍이 하나도 없을 때만 감점(10, 고정).
//     자산이 1개면 상관관계는 "계산 실패"가 아니라 애초에 성립하지 않는 개념이라 감점하지 않는다
//     (PM 확정 - 종목 1개의 문제는 집중도 위험이 이미 100점으로 잡고 있다).
// 최대 92라는 구조와 기존 세 감점(가격이력 35 / 섹터 20 / 수급 8)은 그대로다.
const CONFIDENCE_BENCHMARK_PENALTY_MAX = 15;
const CONFIDENCE_CORRELATION_PENALTY = 10;
/* [R-08] 관측기간 감점. 예전 신뢰도는 "몇 개의 거래일로 계산했는가"를 전혀 보지 않아서,
 * 겨우 기준선을 넘긴 121일짜리 결과와 1년치(약 250일) 결과가 같은 신뢰도로 보였다.
 * 기준선(120일)은 계산을 시작할 수 있는 최소선일 뿐이므로, 그 2배(240일) 이상을 확보했을 때
 * 감점 0으로 보고 그 사이는 비례해서 깎는다. 최대 10점으로 제한해 기존 감점 체계의 크기를
 * 흔들지 않는다(가격이력 35 · 섹터 20 · 수급 8 · 벤치마크 15 · 상관 10은 그대로).
 */
const CONFIDENCE_OBSERVATION_PENALTY_MAX = 10;
const CONFIDENCE_OBSERVATION_COMFORT_MULTIPLIER = 2;
function observationCoveragePenalty(commonReturnCount, requiredReturnCount) {
  const required = typeof requiredReturnCount === 'number' && requiredReturnCount > 0 ? requiredReturnCount : MIN_COMMON_RISK_RETURNS;
  if (typeof commonReturnCount !== 'number' || !Number.isFinite(commonReturnCount)) return 0;
  const comfort = required * CONFIDENCE_OBSERVATION_COMFORT_MULTIPLIER;
  if (commonReturnCount >= comfort) return 0;
  const shortfall = Math.max(0, comfort - commonReturnCount) / comfort;
  return CONFIDENCE_OBSERVATION_PENALTY_MAX * shortfall;
}
function computeDataConfidence(m) {
  const totalWeight = m.holdings.reduce((s, h) => s + h.weight, 0) || 1;
  const missingWeight = m.holdings.filter((h) => !h.hasData).reduce((s, h) => s + h.weight, 0);
  const missingPenalty = (missingWeight / totalWeight) * 35;
  const unclassifiedPenalty = (m.sectorExposure.unclassifiedWeightPct / 100) * 20;
  const flowProxyPenalty = 8;

  // 가격 이력은 있는데 베타만 못 구한 비중(= 벤치마크 쪽 문제). 가격 이력 자체가 없는 종목은 위
  // missingPenalty가 이미 반영했으므로 중복 감점하지 않는다.
  const withData = m.holdings.filter((h) => h.hasData);
  const noBetaWeight = withData.filter((h) => typeof h.beta !== 'number' || !Number.isFinite(h.beta))
    .reduce((s, h) => s + h.weight, 0);
  const benchmarkPenalty = (noBetaWeight / totalWeight) * CONFIDENCE_BENCHMARK_PENALTY_MAX;

  // m.correlationUnavailable은 호출부가 넘겨준다(자산 2개 이상 & 유효 쌍 0). 예전 호출 형태와의
  // 호환을 위해 값이 없으면 감점하지 않는다.
  const correlationPenalty = m.correlationUnavailable ? CONFIDENCE_CORRELATION_PENALTY : 0;
  // [R-08] 관측기간이 기준선을 겨우 넘긴 상태를 충분한 것처럼 보이지 않게 한다.
  const observationPenalty = observationCoveragePenalty(m.commonReturnCount, m.requiredReturnCount);

  const score = Math.max(0, Math.min(100, Math.round(
    100 - missingPenalty - unclassifiedPenalty - flowProxyPenalty - benchmarkPenalty - correlationPenalty - observationPenalty
  )));
  const reasons = [];
  if (missingWeight > 0) reasons.push(`${fmtNum(missingWeight / totalWeight * 100, 0)}% 비중 종목은 가격 이력 부족`);
  if (noBetaWeight > 0) reasons.push(`${fmtNum(noBetaWeight / totalWeight * 100, 0)}% 비중 종목은 시장(벤치마크) 비교 불가`);
  if (m.correlationUnavailable) reasons.push('종목 간 상관관계를 계산할 수 없어 분산 효과 판단이 제한적');
  if (observationPenalty > 0 && typeof m.commonReturnCount === 'number') {
    reasons.push(`가격 기록이 함께 있는 거래일이 ${fmtNum(m.commonReturnCount, 0)}일로 짧아 통계 지표가 흔들릴 수 있음`);
  }
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
// What-If를 계산할 수 있는 상태인가 - 엔진과 화면이 같은 기준을 보도록 한 곳에 둔다.
// "비중을 바꿔 비교한다"는 계산이므로 공통 거래일 수익률이 실제로 있어야 의미가 있다.
function canComputeScenarioRisk(m) {
  if (!m || !Array.isArray(m.holdings) || m.holdings.length === 0) return false;
  if (!Array.isArray(m.commonDates) || m.commonDates.length === 0) return false;
  return m.holdings.every((h) => Array.isArray(h.commonReturns) && h.commonReturns.length === m.commonDates.length);
}
function computeScenarioRiskMetrics(m, newWeightsOverride) {
  // [Risk 정책 P-2 · v252 → R-09] 공통 거래일 수익률이 없으면 비중을 바꿔 봐야 비교할 분포가 없다.
  // 상태 이름이 아니라 "포트폴리오 수익률을 만들 수 있는가"로 판정한다(지표별 부분 표시와 같은 기준) -
  // 판정 결과는 예전(dataSufficiency 기준)과 같고, 근거만 실제 데이터로 바뀐 것이다.
  if (!canComputeScenarioRisk(m)) return null;
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

  // [Risk 정책 P-1 · P-2 · v252] 본 엔진과 같은 규칙 - 공통 거래일 수익률을 새 비중 그대로 합치고(재정규화 없음),
  // 포트폴리오 베타는 모든 종목의 베타가 있을 때만 계산한다.
  // [BOND-5 · §47-2] 본 엔진과 같은 함수를 쓴다 - 비중을 바꿔 보는 화면과 실제 지표가 다른 규칙을 쓰면 안 된다.
  const portfolioBeta = computeBetaAggregate(newHoldings).beta;
  const portfolioReturns = buildPortfolioCommonReturns(newHoldings, m.commonDates);
  // [C-3] 본 엔진과 같은 창 규칙 - 비중만 바꿔 보는 화면이 다른 기간을 쓰면 비교가 성립하지 않는다.
  const tailWindowReturns = sliceRecentObservations(portfolioReturns, RISK_OBSERVATION_WINDOWS.var);
  const volWindowReturns = sliceRecentObservations(portfolioReturns, RISK_OBSERVATION_WINDOWS.volatility);
  const sorted = [...tailWindowReturns].sort((a, b) => a - b);
  const varIdx = Math.max(0, Math.floor(sorted.length * 0.05) - 1);
  // [Phase 39-B] 결측을 0(=손실 없음)으로 만들지 않는다 - 본 엔진과 동일.
  const var95Pct = sorted.length ? sorted[varIdx] * 100 : null;
  const tailReturns = sorted.slice(0, varIdx + 1);
  const cvarPct = tailReturns.length ? statMean(tailReturns) * 100 : var95Pct;
  const portfolioVolatilityPct = computeAnnualizedVolatilityPct(volWindowReturns);
  const portfolioMDDPct = computePortfolioMDDFromReturns(tailWindowReturns);

  const hhi = computeHHI(newHoldings);
  const sortedByWeight = [...newHoldings].sort((a, b) => b.weight - a.weight);
  const topWeight = sortedByWeight[0] ? sortedByWeight[0].weight * 100 : 0;
  const sectorExposure = computeSectorExposure(newHoldings);
  const correlationMatrix = computeFullCorrelationMatrix(newHoldings);
  const weightedAvgCorrelation = newHoldings.length >= 2 ? computeWeightedAvgCorrelation(newHoldings, correlationMatrix) : null;

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

// 포트폴리오 전체(가구 전체 기준, 소유자별 필터는 요청에 따라 제거됨)의 리스크 지표를 계산한다 -
// 실패해도(네트워크 전면 실패 등) null을 반환할 뿐 예외를 던지지 않아 refreshPricesAndRates()의
// 나머지 갱신을 막지 않는다.
async function computeAdvancedRiskMetrics() {
  try {
    const assets = riskEligibleAssets();
    if (assets.length === 0) return null;
    const totalCur = assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
    if (totalCur === 0) return null;

    // 종목(티커) 단위로 소유자/계좌 합산 - RISK 관리 카드의 병합 기준과 동일하다. currentPrice는 같은
    // 티커면 소유자가 달라도 동일한 시세이므로 처음 만난 값을 그대로 쓴다.
    // [Risk 정책 P-4 · v252] 벤치마크는 확인된 경우에만 정하고, 아니면 null(UNRESOLVED)로 둔다.
    const byTicker = new Map();
    assets.forEach((a) => {
      const yahoo = sanitizeTicker(a.ticker).yahooTicker;
      const r = calcRow(a);
      if (!byTicker.has(yahoo)) {
        /* [§50 · PD-15] 기준 지수를 두 벌 정한다.
         *   benchmark*        = **시장 지수**(상장 시장) → h.beta → 위험점수 · 포트폴리오 베타
         *   trackingBenchmark* = **공식 기초지수**(Exposure Master) → h.trackingBeta → 표시 전용
         * 필드 이름을 바꾸지 않고 의미만 나눈 이유: benchmark*에 달린 상태 · 사유 · FX · 정렬
         * 플러밍(기존 코드)이 그대로 "위험점수가 쓰는 베타"를 설명하게 하기 위해서다. */
        const bm = resolveMarketRiskBenchmark(a);
        const trk = resolveRiskBenchmark(a);
        byTicker.set(yahoo, {
          ticker: yahoo, name: a.name, curAmount: 0, benchmarkKey: bm.key, benchmarkStatus: bm.status, currentPrice: a.currentPrice, priceCcy: resolveRiskPriceCcy(a),
          // [1차 통합 구현] 판정 근거 · 정렬 방식 · 지수 환산(진단용). 같은 시장이면 SAME_DATE(기존 계산 그대로).
          benchmarkSource: bm.source, benchmarkIndexKey: bm.key || bm.indexKey || null,
          benchmarkPriceSource: bm.key ? (bm.priceSource || 'AVAILABLE') : null,
          benchmarkAlignment: bm.key ? (bm.alignment || 'SAME_DATE') : null, benchmarkFx: bm.benchmarkFx || null,
          benchmarkMarket: bm.benchmarkMarket || null, benchmarkDefinitionStatus: bm.definitionStatus || null,
          // 공식 기초지수(추적) - 기존 resolveRiskBenchmark 결과를 의미 그대로 보존한다.
          trackingBenchmarkKey: trk.key, trackingBenchmarkStatus: trk.status, trackingBenchmarkSource: trk.source,
          trackingBenchmarkIndexKey: trk.key || trk.indexKey || null,
          trackingBenchmarkPriceSource: trk.key ? (trk.priceSource || 'AVAILABLE') : null,
          trackingBenchmarkAlignment: trk.key ? (trk.alignment || 'SAME_DATE') : null,
          trackingBenchmarkFx: trk.benchmarkFx || null, trackingBenchmarkMarket: trk.benchmarkMarket || null,
          trackingBenchmarkDefinitionStatus: trk.definitionStatus || null
        });
      }
      byTicker.get(yahoo).curAmount += r.curAmount;
    });
    const holdings = [...byTicker.values()].map((h) => ({ ...h, weight: h.curAmount / totalCur }));

    // 필요한 벤치마크 지수만 모아서 한 번씩만 조회한다(확인되지 않은 벤치마크는 조회하지 않는다).
    // [1차 통합 구현] 지수 가격 원천은 Index Master가 정한다(AVAILABLE인 지수만 · 기존 6개 지수의 원천 기호는 INDEX_TICKERS와 같다).
    // [§50 · PD-15] 시장 지수와 공식 기초지수 두 벌이 필요하다 - 중복은 Set이 걸러내므로 조회 수는 최소다.
    const neededBenchmarks = [...new Set(
      holdings.flatMap((h) => [h.benchmarkKey, h.trackingBenchmarkKey]).filter((k) => k && isIndexPriceSourceAvailable(k))
    )];
    const benchmarkCloses = {};
    const benchmarkDated = {};   // [Phase 39-B] 지수 쪽 날짜도 보존한다(공통 거래일 정렬용).
    const benchmarkStatusByKey = {};
    await Promise.all(neededBenchmarks.map(async (key) => {
      const got = await getCachedDailyClosesWithStatus(indexPriceSourceTicker(key));
      const data = got.data;
      // [D-01 ① · §44 제8조 8-1 단서] 지수에는 ETF의 조정주가(배당 · 분할 조정) 개념을 적용하지 않는다 -
      // 지수 수준(Index Level/Close)을 통계용 가격으로 쓴다(Index Master priceDefinition = INDEX_LEVEL).
      // 수준값 자체가 없으면 "이 출처로는 통계 비교를 할 수 없다"(SOURCE_UNAVAILABLE)로 둔다.
      const level = data ? datedClosesFromSeries(data, 'raw') : null;
      benchmarkStatusByKey[key] = !data ? got.status : (level ? RISK_DATA_STATUS.OK : RISK_DATA_STATUS.SOURCE_UNAVAILABLE);
      benchmarkDated[key] = level;
      benchmarkCloses[key] = level ? level.map((d) => d.close) : null;
    }));
    const benchmarkReturns = {};
    neededBenchmarks.forEach((key) => { benchmarkReturns[key] = benchmarkCloses[key] ? dailyReturnsFromCloses(benchmarkCloses[key]) : null; });

    // [개별 종목 정밀 주가 분석 엔진] 포트폴리오 계산과 완전히 같은 1년 일별 종가/거래량 데이터에서
    // RSI14/이동평균/52주 고점 대비 낙폭/거래량 급증/개별 Sortino까지 한 번에 뽑아 각 holding에
    // 붙여둔다 - RISK 관리 카드(computeRiskClassifiedAssets)와 리스크 진단 보기 상세 카드가 재계산
    // 없이 이 값을 그대로 재사용한다(중복 계산 제거).
    const todayISO = new Date().toISOString().slice(0, 10);
    // [T6 · §44 44-15] 가격통화가 USD인 종목이 있을 때만 H.10 환율을 읽는다(원화 종목만 있으면 읽지 않는다).
    const usdHoldingCount = holdings.filter((h) => h.priceCcy === 'USD').length;
    // [D-05] 비헤지 국내 상장 해외 ETF의 지수 원화 환산도 같은 H.10만 쓴다(새 환율 공급자 없음).
    const needsBenchmarkFx = holdings.some((h) => h.benchmarkFx === 'USD_TO_KRW_H10' || h.trackingBenchmarkFx === 'USD_TO_KRW_H10');
    const usdKrw = (usdHoldingCount > 0 || needsBenchmarkFx) ? await getRiskUsdKrwRates() : null;
    await Promise.all(holdings.map(async (h) => {
      const got = await getCachedDailyClosesWithStatus(h.ticker);
      const data = got.data;
      // [R-06 · §44 제9조] 조회 실패 · 이력 없음 · 이력 짧음 · 오래된 데이터 · 품질 불량을 구분해 둔다.
      const quality = assessSeriesQuality(data, todayISO);
      h.dataQuality = quality;
      // 여러 문제가 겹치면 "계산을 막는 쪽"을 먼저 알린다: 품질 불량 → 조정주가 없음(통계 불가)
      // → 오래된 데이터(진단용) 순. 상태는 §44 제9조의 9종 안에서만 고른다.
      h.dataStatus = !data
        ? got.status
        : quality.issues.length ? RISK_DATA_STATUS.DATA_QUALITY_FAILED
          : !hasAdjustedCloses(data) ? RISK_DATA_STATUS.SOURCE_UNAVAILABLE
            : quality.stale ? RISK_DATA_STATUS.DATA_STALE
              : RISK_DATA_STATUS.OK;
      // [R-03/R-04 · §44 제8조] 가격을 두 갈래로 나눠 보관한다.
      //   closesRaw - 기술 지표(RSI · 이동평균 · 52주 · 거래량 신호)와 화면 표시
      //   datedCloses / returns - 통계 지표(변동성 · 베타 · 상관 · VaR · CVaR · MDD · Sortino)
      // 조정주가가 없으면 통계 쪽은 만들지 않는다 - 원주가로 조용히 대신하지 않는다.
      h.closesRaw = data ? data.closes : null;
      h.closes = h.closesRaw;            // 기존 호출부 호환(원주가라는 뜻은 그대로다)
      h.volumes = data ? data.volumes : null;
      h.adjustedAvailable = hasAdjustedCloses(data);
      // 날짜가 필요한 계산(공통 거래일 · 베타 · 상관)은 날짜가 붙은 조정주가 시계열을 쓰고,
      // 한 종목 안에서 끝나는 계산(수익률 · MDD · Sortino)은 조정주가 배열만 있으면 된다.
      // 그날만 조정주가가 비어 있으면 그 날을 빼고 쓴다(종가 결측과 같은 처리 · 채우지 않는다).
      h.datedCloses = h.adjustedAvailable ? datedClosesFromSeries(data, 'adjusted') : null;
      h.closesAdj = h.adjustedAvailable
        ? data.closesAdj.filter((c) => typeof c === 'number' && Number.isFinite(c))
        : null;
      h.returns = h.closesAdj ? dailyReturnsFromCloses(h.closesAdj) : null;
      /* [§50 · PD-15] 베타를 **두 번** 계산한다 - 기준 지수만 다르고 계산식 · 관측 창 · 최소 관측은
       * 완전히 같다(아래 본문은 기존 코드를 그대로 옮긴 것이다 · 공식 무변경).
       *   Market Beta   = 상장 시장 대표지수 대비 → h.beta        → 위험점수 · 포트폴리오 베타
       *   Tracking Beta = 공식 기초지수 대비      → h.trackingBeta → 표시 전용(추적 특성)
       * 두 값을 하나의 숫자로 섞지 않는다 - 서로 다른 통계량이기 때문이다. */
      const betaAgainst = (spec) => {
        const out = { beta: null, status: null, aligned: false, observationCount: null, method: null, components: null };
        const key = spec && spec.key;
        const bmReturns = key ? benchmarkReturns[key] : null;
        const bmDated = key ? benchmarkDated[key] : null;
        if (h.returns && bmReturns && spec.alignment === 'ASYNC_DIMSON') {
          // [D-05] 비동기 쌍 - 같은 날짜 정렬(alignedReturnPair)을 쓰지 않는다. 종목 쪽은 현지 가격(원화) 조정주가,
          // 지수 쪽은 지수 수준(비헤지 원화 상품이면 같은 날짜의 H.10으로 원화 환산한 수준 - USD 수익률 + 환율 수익률 + 교차항).
          let benchLevels = bmDated;
          let fxBlock = null;
          if (spec.fx === 'USD_TO_KRW_H10') {
            const fxUsable = usdKrw && usdKrw.rates;
            benchLevels = fxUsable ? convertDatedClosesToKrw(bmDated, usdKrw.rates) : null;
            if (!fxUsable) fxBlock = (usdKrw && usdKrw.status) || RISK_DATA_STATUS.SOURCE_UNAVAILABLE;
          }
          // [C-3] 베타 창은 2년이다 - 조회는 3년이지만 그중 최근 2년만 쓴다(§44 제7조).
          const dimAsset = sliceRecentObservations(h.datedCloses, RISK_OBSERVATION_WINDOWS.beta);
          const dimBench = sliceRecentObservations(benchLevels, RISK_OBSERVATION_WINDOWS.beta);
          const dim = benchLevels ? computeAsyncDimsonBeta(dimAsset, dimBench, riskSeriesMarketOf(h.ticker), spec.market) : null;
          // 최소 관측 120(행 수)은 같은 날짜 경로와 같다 - 부족하면 베타를 만들지 않는다.
          out.beta = dim && dim.observationCount >= MIN_COMMON_RISK_RETURNS && typeof dim.beta === 'number' && Number.isFinite(dim.beta) ? dim.beta : null;
          out.status = typeof out.beta === 'number' ? RISK_DATA_STATUS.OK : (fxBlock || RISK_DATA_STATUS.INSUFFICIENT_COMMON_DATES);
          out.aligned = !!dim;
          out.observationCount = dim ? dim.observationCount : null;
          out.method = 'DIMSON_LAG0_LAG1';
          out.components = dim && typeof out.beta === 'number' ? { concurrent: dim.betaConcurrent, previous: dim.betaPrevious } : null;
        } else if (h.returns && bmReturns) {
          out.method = 'SAME_DATE';
          // [C-3] 같은 날짜 정렬도 최근 2년만 본다(§44 제7조 · 조회는 3년).
          const pair = alignedReturnPair(
            sliceRecentObservations(h.datedCloses, RISK_OBSERVATION_WINDOWS.beta + 1),
            sliceRecentObservations(h.returns, RISK_OBSERVATION_WINDOWS.beta),
            sliceRecentObservations(bmDated, RISK_OBSERVATION_WINDOWS.beta + 1),
            sliceRecentObservations(bmReturns, RISK_OBSERVATION_WINDOWS.beta)
          );
          // [Risk 정책 P-2 · v252] 종목-벤치마크 공통 수익률이 120개 미만이면 베타를 만들지 않는다(공식은 그대로).
          out.beta = pair.a.length >= MIN_COMMON_RISK_RETURNS ? computeBetaFromReturns(pair.a, pair.b) : null;
          // [R-06] 베타를 못 구한 이유를 남긴다 - 공통 거래일 부족과 기준 지수 미확인은 원인이 다르다.
          out.status = typeof out.beta === 'number' ? RISK_DATA_STATUS.OK : RISK_DATA_STATUS.INSUFFICIENT_COMMON_DATES;
          // 이 beta가 실제로 며칠의 공통 거래일로 계산됐는지 남긴다(날짜 정렬이 적용된 경우에만).
          out.aligned = pair.aligned;
          out.observationCount = pair.aligned ? pair.observationCount : null;
        } else {
          // 기준 지수는 정해졌지만 그 지수의 가격 원천이 앱에 없으면(Index Master UNAVAILABLE) "비교할 자료 없음"이다.
          out.status = !key
            ? RISK_DATA_STATUS.BENCHMARK_UNRESOLVED
            : (!h.returns ? h.dataStatus : (benchmarkStatusByKey[key] || RISK_DATA_STATUS.SOURCE_UNAVAILABLE));
        }
        return out;
      };
      const mkt = betaAgainst({ key: h.benchmarkKey, alignment: h.benchmarkAlignment, fx: h.benchmarkFx, market: h.benchmarkMarket });
      h.beta = mkt.beta;
      h.betaStatus = mkt.status;
      h.betaAligned = mkt.aligned;
      h.betaObservationCount = mkt.observationCount;
      h.betaMethod = mkt.method;
      h.betaComponents = mkt.components;
      const trk = betaAgainst({ key: h.trackingBenchmarkKey, alignment: h.trackingBenchmarkAlignment, fx: h.trackingBenchmarkFx, market: h.trackingBenchmarkMarket });
      h.trackingBeta = trk.beta;
      h.trackingBetaStatus = trk.status;
      h.trackingBetaAligned = trk.aligned;
      h.trackingBetaObservationCount = trk.observationCount;
      h.trackingBetaMethod = trk.method;
      // [T6 · §44 44-15] 베타는 위에서 현지통화(환산 전) 조정주가로 이미 계산했다(의미 유지).
      // 여기서부터의 통계(종목 Sortino · MDD · 공통 거래일 → 변동성 · VaR · CVaR · 상관 · 포트폴리오)는
      // 가격통화가 USD이면 원화로 환산한 조정주가를 쓴다. 원화 가격 종목(국내 상장 해외 ETF 포함)은 그대로다.
      h.datedClosesLocal = h.datedCloses;
      h.fxStatus = null;
      h.fxLastDate = null;
      if (h.priceCcy === 'USD' && h.datedCloses) {
        const fxUsable = usdKrw && usdKrw.rates;
        h.fxStatus = fxUsable ? usdKrw.status : ((usdKrw && usdKrw.status) || RISK_DATA_STATUS.SOURCE_UNAVAILABLE);
        // 환율을 쓸 수 없으면 달러 수익률로 조용히 대신하지 않는다 - 통계용 시계열을 만들지 않는다.
        h.datedCloses = fxUsable ? convertDatedClosesToKrw(h.datedCloses, usdKrw.rates) : null;
        h.closesAdj = h.datedCloses ? h.datedCloses.map((d) => d.close) : null;
        h.returns = h.closesAdj && h.closesAdj.length ? dailyReturnsFromCloses(h.closesAdj) : null;
        h.fxLastDate = h.datedCloses && h.datedCloses.length ? h.datedCloses[h.datedCloses.length - 1].date : null;
        // 상태 우선순위는 기존과 같다 - 계산을 막는 쪽(환율 없음)이 진단용 "오래됨"보다 먼저다.
        if (!fxUsable && (h.dataStatus === RISK_DATA_STATUS.OK || h.dataStatus === RISK_DATA_STATUS.DATA_STALE)) h.dataStatus = h.fxStatus;
        else if (fxUsable && usdKrw.status === RISK_DATA_STATUS.DATA_STALE && h.dataStatus === RISK_DATA_STATUS.OK) h.dataStatus = RISK_DATA_STATUS.DATA_STALE;
      }
      // [Phase 39-B] 종목 단위 통계의 최소 관측치(10)는 그대로 둔다 - 종목 상세의 기술 지표용이다.
      h.hasData = !!h.returns && h.returns.length >= MIN_RETURNS_FOR_STATS;
      h.sortino = h.returns ? computeSortinoFromReturns(h.returns) : null;

      // [R-04] 아래 블록은 전부 기술 지표다 - 원주가(closesRaw)만 쓴다(§44 제8조 8-2).
      // 배당락 · 액면분할이 반영된 조정주가를 쓰면 사용자가 차트에서 보는 값과 어긋난다.
      if (h.closesRaw) {
        h.rsi14 = computeRSI14(h.closesRaw);
        h.rsiState = rsiStateLabel(h.rsi14);
        h.ma20 = computeSMA(h.closesRaw, 20);
        h.ma60 = computeSMA(h.closesRaw, 60);
        // [버그 수정 - 추세 판정 기준 통일] 리스크 카드와 종목 분석 리포트가 같은 maTrendLabel()을 쓴다.
        h.ma120 = computeSMA(h.closesRaw, 120);
        h.trendLabel = maTrendLabel(h.ma20, h.ma60, h.ma120);
        const latestPrice = typeof h.currentPrice === 'number' ? h.currentPrice : h.closesRaw[h.closesRaw.length - 1];
        h.week52High = Math.max(...h.closesRaw, latestPrice || 0);
        h.week52DrawdownPct = h.week52High > 0 ? ((latestPrice - h.week52High) / h.week52High) * 100 : null;
      } else {
        h.rsi14 = null; h.rsiState = null; h.ma20 = null; h.ma60 = null; h.ma120 = null; h.trendLabel = null;
        h.week52High = null; h.week52DrawdownPct = null;
      }
      if (h.volumes) {
        // [Risk 정책 P-3 · v252] 거래량 결측(null)은 평균에서 빼고, 마지막 거래량이 결측이면 신호를 만들지 않는다.
        h.volMA20 = computeVolumeMA(h.volumes, 20);
        const lastVolume = h.volumes[h.volumes.length - 1];
        h.lastVolume = typeof lastVolume === 'number' && Number.isFinite(lastVolume) ? lastVolume : null;
        h.volumeSpike = !!(h.volMA20 && typeof h.lastVolume === 'number' && h.lastVolume >= h.volMA20 * 2);
      } else {
        h.volMA20 = null; h.lastVolume = null; h.volumeSpike = false;
      }
      // [정밀 리스크 엔진] 종목 단위 MDD(최대낙폭) + 수급 대체 지표(거래량/가격 기반 추정).
      // [R-03] MDD는 통계 위험지표다 - 조정주가로 계산하고, 조정주가가 없으면 만들지 않는다.
      h.mdd = h.closesAdj ? computeMDDFromCloses(h.closesAdj) : null;
      h.flowSignal = computeFlowSignal(h);
    }));

    const withData = holdings.filter((h) => h.hasData);
    const missingCount = holdings.length - withData.length;

    // 집중도(몰빵위험도) · 섹터 · HHI - 가격 수익률과 무관한 비중 정보라 데이터가 부족해도 그대로 계산해 둔다
    // (종목 분석 모달의 편입 시뮬레이션이 이 값을 읽는다). 위험점수에는 아래 공통 거래일 판정을 통과할 때만 쓰인다.
    const sortedByWeight = [...holdings].sort((a, b) => b.weight - a.weight);
    const topHolding = sortedByWeight[0] || null;
    const topWeight = topHolding ? topHolding.weight * 100 : 0;
    const top3Weight = sortedByWeight.slice(0, 3).reduce((s, h) => s + h.weight, 0) * 100;
    const sectorExposure = computeSectorExposure(holdings);
    const hhi = computeHHI(holdings);

    // [Risk 정책 P-1 · v252] 모든 대상 종목의 공통 거래일 수익률.
    // [R-09 · §44 제12조] 예전에는 공통 거래일이 120개 미만이면 여기서 곧바로 빠져나가 위험점수 ·
    // 등급 · 모든 지표를 통째로 숨겼다. 이제는 "계산할 수 있는 것은 계산하고, 못 하는 것만 사유와 함께
    // 표시 불가로 둔다" - 집중도 · 섹터 · 기술 신호처럼 가격 이력이 부족해도 구할 수 있는 정보가 있기 때문이다.
    const common = buildCommonDateReturns(holdings.map((h) => ({ key: h.ticker, datedCloses: h.datedCloses })));
    const hasCommonReturns = common.commonReturnCount >= MIN_COMMON_RISK_RETURNS;
    holdings.forEach((h) => { h.commonReturns = hasCommonReturns ? common.returnsByKey.get(h.ticker) : null; });

    // 포트폴리오 베타 = 베타를 구한 주식 · ETF의 비중 가중평균 + 설명 범위(coverage).
    // [BOND-5 · §47-2] 예전의 "전부 또는 무"를 대체한다(computeBetaAggregate 주석 참고). 설명 범위가
    // 기준 미만이면 여전히 null이고, 그때 시장 요인은 점수에서 빠져 나머지 요인으로 재정규화된다(§44 44-13).
    const betaAggregate = computeBetaAggregate(holdings);
    const portfolioBeta = betaAggregate.beta;
    // [§50 · PD-15] 추적 베타는 같은 가중 규칙으로 따로 모은다 - 두 값을 한 숫자로 섞지 않는다.
    const trackingAggregate = computeBetaAggregate(holdings.map((h) => ({ weight: h.weight, beta: h.trackingBeta })));

    // 포트폴리오 일간 수익률 = 공통 거래일 수익률의 비중 가중합(모든 종목 포함, 비중 그대로).
    // [R-11] 날짜 축(common.dates)을 함께 넘겨 "같은 날짜끼리" 합쳐지는 것을 구조적으로 보장한다.
    const portfolioReturns = hasCommonReturns ? buildPortfolioCommonReturns(holdings, common.dates) : [];
    /* [C-3 · §44 제7조] 같은 수익률 배열을 지표마다 다른 길이로 잘라 쓴다.
     * 꼬리 지표(VaR · CVaR · MDD · Sortino)는 3년, 분포 지표(변동성 · 상관 · 위험기여도)는 2년이다. */
    const tailWindowReturns = sliceRecentObservations(portfolioReturns, RISK_OBSERVATION_WINDOWS.var);
    const volWindowReturns = sliceRecentObservations(portfolioReturns, RISK_OBSERVATION_WINDOWS.volatility);

    // VaR95/CVaR: 일간 수익률 분포의 하위 5% 지점(과거 실측 분포 기반 - parametric 가정 없음).
    const sorted = [...tailWindowReturns].sort((a, b) => a - b);
    const varIdx = Math.max(0, Math.floor(sorted.length * 0.05) - 1);
    const var95Pct = sorted.length ? sorted[varIdx] * 100 : null; // 퍼센트 단위, 음수
    const tailReturns = sorted.slice(0, varIdx + 1);
    const cvarPct = tailReturns.length ? statMean(tailReturns) * 100 : var95Pct;

    // Sortino: 연율화한 평균수익률을 연율화한 하방편차로 나눈다(개별 종목과 같은 함수 · 꼬리 창 3년).
    const sortino = computeSortinoFromReturns(tailWindowReturns);

    // 상관관계(운명 공동체): 비중 상위 2종목(화면 표시용) + 전체 종목 간 행렬과 비중가중 평균(위험점수용).
    // [Risk 정책 P-1 · v252] 둘 다 공통 거래일 수익률로 계산한다.
    let topCorrelation = null, topCorrelationPair = null;
    // [C-3] 상관은 2년 창이다 - 원본 holdings는 건드리지 않고 자른 사본으로만 계산한다.
    const corrHoldings = holdings.map((h) => (Array.isArray(h.commonReturns)
      ? Object.assign(Object.create(Object.getPrototypeOf(h) || Object.prototype), h, { commonReturns: sliceRecentObservations(h.commonReturns, RISK_OBSERVATION_WINDOWS.correlation) })
      : h));
    const corrByWeight = [...corrHoldings].sort((a, b) => b.weight - a.weight);
    if (corrByWeight.length >= 2) {
      topCorrelation = (Array.isArray(corrByWeight[0].commonReturns) && Array.isArray(corrByWeight[1].commonReturns))
        ? computeCorrelationFromReturns(corrByWeight[0].commonReturns, corrByWeight[1].commonReturns)
        : null;
      topCorrelationPair = [corrByWeight[0].name, corrByWeight[1].name];
    }
    const correlationMatrix = computeFullCorrelationMatrix(corrHoldings);
    const weightedAvgCorrelation = corrHoldings.length >= 2 ? computeWeightedAvgCorrelation(corrHoldings, correlationMatrix) : null;

    // [역사적 하락장 스트레스 테스트] 종목별 베타 × 그 종목 벤치마크의 실제 낙폭.
    // [Risk 정책 P-4 · P-5 · v252] 벤치마크가 확인되지 않았거나 베타를 계산하지 못한 종목이 하나라도 있으면
    // 그 시나리오의 손실 추정을 만들지 않는다(null) - 예전처럼 베타 1.0 · 주식시장 대체 낙폭을 가정해 채우지 않는다.
    // [Phase 2-4 · T4] 예전에는 확인된 벤치마크의 낙폭이 표에 없으면(예: 나스닥 종합) 대체 낙폭
    // (2020 -34 · 2022 -28)을 넣어 계산했다. 실측이 아닌 근사값이 실측처럼 보이므로 없앴다 -
    // 표에 없는 벤치마크가 하나라도 있으면 그 시나리오는 만들지 않고 사유(SOURCE_UNAVAILABLE)를 남긴다.
    // 시나리오 정의(상수표) · 계산식(베타 × 실측 낙폭)은 그대로다.
    /* [D-9] 종목마다 "그 베타가 어느 통화 기준인가"에 맞는 낙폭을 고른다.
     * 원화 환산 지수로 구한 베타(benchmarkFx)에는 원화 기준 낙폭을, 현지통화 베타에는 현지통화
     * 낙폭을 쓴다. 맞는 짝이 없으면 그 시나리오는 만들지 않는다(대체 낙폭을 쓰지 않는다). */
    function stressDropFor(h, dropPctMap, dropPctMapKrw) {
      const map = h.benchmarkFx ? dropPctMapKrw : dropPctMap;
      const v = map ? map[h.benchmarkKey] : undefined;
      return typeof v === 'number' ? v : null;
    }
    function computeStressScenario(dropPctMap, dropPctMapKrw) {
      const missingInput = holdings.find((h) => !h.benchmarkKey || typeof h.beta !== 'number' || !Number.isFinite(h.beta));
      if (missingInput) {
        return { lossKRW: null, lossPct: null, reason: !missingInput.benchmarkKey ? RISK_DATA_STATUS.BENCHMARK_UNRESOLVED : (missingInput.betaStatus || RISK_DATA_STATUS.INSUFFICIENT_COMMON_DATES) };
      }
      if (holdings.some((h) => stressDropFor(h, dropPctMap, dropPctMapKrw) === null)) {
        return { lossKRW: null, lossPct: null, reason: RISK_DATA_STATUS.SOURCE_UNAVAILABLE };
      }
      let lossKRW = 0;
      holdings.forEach((h) => {
        lossKRW += h.curAmount * (h.beta * stressDropFor(h, dropPctMap, dropPctMapKrw) / 100);
      });
      const lossPct = totalCur !== 0 ? (lossKRW / totalCur) * 100 : 0;
      return { lossKRW, lossPct, reason: null };
    }
    const covidStress = computeStressScenario(COVID_CRASH_BENCHMARK_DROP_PCT, COVID_CRASH_BENCHMARK_DROP_PCT_KRW);
    const rateHike2022Stress = computeStressScenario(RATE_HIKE_2022_BENCHMARK_DROP_PCT, RATE_HIKE_2022_BENCHMARK_DROP_PCT_KRW);

    // [정밀 포트폴리오 리스크 엔진] 연환산 변동성/MDD/위험기여도 → 6대 위험요인 → 종합 위험점수 → 데이터 신뢰도.
    // [C-3] 변동성은 2년 창 · 최대 낙폭은 3년 창 · 위험 기여도는 베타 성격이라 2년 창이다.
    const portfolioVolatilityPct = computeAnnualizedVolatilityPct(volWindowReturns);
    const portfolioMDDPct = computePortfolioMDDFromReturns(tailWindowReturns);
    const riskContributions = computeRiskContributions(corrHoldings, volWindowReturns);
    holdings.forEach((h) => { h.riskContributionPct = riskContributions[h.ticker] ?? null; });

    // [단기 vs 장기 변동성 이중 추적 - Risk Spike 감지] 최근 20개 공통 거래일 수익률의 연환산 변동성이
    // 전체 평균의 1.5배 이상이면 경고한다.
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
    const excludedFactors = excludedRiskFactors(subScores);
    // [Phase 39-B] correlationUnavailable: 종목이 2개 이상인데도 상관관계를 하나도 계산하지 못한 상태.
    const correlationUnavailable = holdings.length >= 2 && weightedAvgCorrelation === null;
    const dataConfidence = computeDataConfidence({
      holdings, sectorExposure, correlationUnavailable,
      commonReturnCount: common.commonReturnCount, requiredReturnCount: MIN_COMMON_RISK_RETURNS
    });

    // [R-09] 지표별 산출 상태. 공통 거래일이 모자라면 그 사유를, 기준 지수가 없으면 그 사유를 남긴다.
    // [R-03] 공통 거래일을 못 만든 이유가 "조정주가가 없어서"일 수도 있다 - 원인을 구분해 남긴다.
    const adjustedMissing = holdings.some((h) => h.closesRaw && !h.adjustedAvailable);
    // [T6] 환율 자료를 쓸 수 없어 원화 통계 시계열을 못 만든 달러 종목도 "출처 없음"으로 구분한다.
    const fxMissing = holdings.some((h) => h.priceCcy === 'USD' && h.closesRaw && h.adjustedAvailable && !h.datedCloses);
    const commonShortReason = hasCommonReturns
      ? null
      : (fxMissing ? (holdings.find((h) => h.priceCcy === 'USD' && h.adjustedAvailable && !h.datedCloses).fxStatus || RISK_DATA_STATUS.SOURCE_UNAVAILABLE)
        : adjustedMissing ? RISK_DATA_STATUS.SOURCE_UNAVAILABLE : RISK_DATA_STATUS.INSUFFICIENT_COMMON_DATES);
    const betaReason = holdings.some((h) => h.betaStatus && h.betaStatus !== RISK_DATA_STATUS.OK)
      ? (holdings.find((h) => h.betaStatus && h.betaStatus !== RISK_DATA_STATUS.OK) || {}).betaStatus
      : commonShortReason;
    const obs = common.commonReturnCount;
    // [C-3] "몇 개로 계산했는가"는 지표마다 다르다 - 그 창의 실제 관측 수를 그대로 보여 준다.
    // 계산이 아예 안 된 경우(공통 거래일 부족으로 배열이 비어 있음)에는 "몇 개가 있었는가"를
    // 그대로 보여 준다 - 0으로 적으면 "자료가 하나도 없다"는 다른 뜻이 된다.
    const obsVol = volWindowReturns.length || obs;
    const obsTail = tailWindowReturns.length || obs;
    const metricStatus = {
      volatility: riskMetricState(portfolioVolatilityPct, commonShortReason, obsVol, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.volatility),
      beta: riskMetricState(portfolioBeta, betaReason, obsVol, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.beta),
      correlation: riskMetricState(weightedAvgCorrelation, holdings.length < 2 ? RISK_DATA_STATUS.SOURCE_UNAVAILABLE : commonShortReason, obsVol, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.correlation),
      var: riskMetricState(var95Pct, commonShortReason, obsTail, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.var),
      cvar: riskMetricState(cvarPct, commonShortReason, obsTail, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.cvar),
      mdd: riskMetricState(portfolioMDDPct, commonShortReason, obsTail, MIN_COMMON_RISK_RETURNS, RISK_TARGET_OBSERVATIONS.mdd)
    };

    /* [BOND-5 · §47-2] 베타가 "무엇을 설명한 값인지"를 화면이 말할 수 있게 함께 돌려준다.
     * betaCoveragePct = 베타를 구한 주식 · ETF가 주식 노출에서 차지하는 비중.
     * bondWeightPct   = 전체 자산 중 채권 비중(베타 집계 대상이 아니라는 사실을 그대로 보여주기 위함).
     * 두 값은 표시 전용이다 - 위험점수 6요인 산식에는 들어가지 않는다. */
    /* [§50 · PD-09 · 감사 A-03] calcRow가 curKRW를 실제로 돌려주게 되어 이 합계가 비로소 동작한다.
     * 예전에는 calcRow에 curKRW 키가 없어 bondCur가 항상 0이었고, 그 결과 bondWeightPct가 늘 0이라
     * "채권 비중 N%는 베타 집계 대상이 아닙니다" 안내가 한 번도 나오지 않았다.
     * 포트폴리오 베타에서 채권을 제외하는 정책 자체는 그대로다(PD-09 단서). */
    const bondCur = (state.assets || [])
      .filter((a) => a.category === '채권')
      .reduce((sum, a) => sum + (calcRow(a).curKRW || 0), 0);
    const householdCur = totalCur + bondCur;
    return {
      totalCur, holdings: sortedByWeight, missingCount, portfolioBeta, var95Pct, cvarPct, sortino,
      betaCoveragePct: betaAggregate.enough || betaAggregate.coverage > 0 ? betaAggregate.coverage * 100 : 0,
      betaMissingCount: betaAggregate.missingCount,
      betaCoverageEnough: betaAggregate.enough,
      betaCoverageMinPct: BETA_COVERAGE_MIN * 100,
      /* [§50 · PD-15] 위험점수가 쓰는 베타가 무엇인지 화면이 말할 수 있게 명시한다.
       * portfolioBeta = Market Beta(상장 시장 지수 대비)의 비중 가중평균이다.
       * trackingBeta 집계는 **표시 전용**이며 위험점수 · portfolioBeta에 들어가지 않는다. */
      betaDefinition: 'MARKET',
      portfolioTrackingBeta: trackingAggregate.beta,
      trackingBetaCoveragePct: trackingAggregate.coverage * 100,
      trackingBetaMissingCount: trackingAggregate.missingCount,
      bondWeightPct: householdCur > 0 ? (bondCur / householdCur) * 100 : 0,
      // [Phase 39-B] var95Pct가 null이면 금액도 null이어야 한다.
      var95KRW: var95Pct === null ? null : totalCur * var95Pct / 100,
      cvarKRW: cvarPct === null ? null : totalCur * cvarPct / 100,
      topWeight, top3Weight, topHolding, topCorrelation, topCorrelationPair,
      stressLossKRW: covidStress.lossKRW, stressLossPct: covidStress.lossPct,
      stressLossKRW2022: rateHike2022Stress.lossKRW, stressLossPct2022: rateHike2022Stress.lossPct,
      // [Phase 2-4 · T4] 스트레스 추정을 만들지 못한 사유(만들었으면 null).
      stressStatus: { covid2020: covidStress.reason, rateHike2022: rateHike2022Stress.reason },
      // [Phase 2-4 · T2] VaR · CVaR가 실제로 쓴 꼬리(하위 5%) 관측 수 - 위 tailReturns 그대로다.
      varTailObservationCount: var95Pct === null ? null : tailReturns.length,
      hhi, sectorExposure, portfolioVolatilityPct, portfolioVolatilityShortPct, volatilitySpike, portfolioMDDPct,
      weightedAvgCorrelation, correlationMatrix, subScores, riskScore, dataConfidence,
      // [R-09] 지표별 상태와 "점수에 반영되지 못한 요인" - 화면이 숨기지 않고 사실대로 보여준다.
      metricStatus, excludedFactors, commonDates: common.dates,
      // [T6 · §44 44-15] 원화 기준 환율 반영 정보. basisDate = 달러 종목이 모두 환율과 함께 있는 마지막 날
      // (가격과 H.10이 함께 있는 마지막 날 · 이후 가격은 통계에 쓰지 않았다).
      fxBasis: usdHoldingCount > 0 ? {
        source: 'FRB_H10', usdHoldingCount,
        status: usdKrw ? usdKrw.status : RISK_DATA_STATUS.SOURCE_UNAVAILABLE,
        applied: !!(usdKrw && usdKrw.rates),
        fxEndDate: usdKrw ? usdKrw.endDate : null,
        basisDate: (() => {
          const lasts = holdings.filter((h) => h.priceCcy === 'USD' && h.fxLastDate).map((h) => h.fxLastDate).sort();
          return lasts.length ? lasts[0] : null;
        })()
      } : null,
      dataSufficiency: {
        // [R-09] status는 이제 "전부 숨김" 스위치가 아니라 공통 거래일 충족 여부 자체를 뜻한다.
        status: hasCommonReturns ? 'SUFFICIENT' : 'INSUFFICIENT',
        commonReturnCount: common.commonReturnCount, required: MIN_COMMON_RISK_RETURNS,
        startDate: common.startDate, endDate: common.endDate
      }
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
// [종목 분석 모달 - 한글 종목명 자동 매칭] 보유 자산 이름(전체 포트폴리오, 완전일치 우선) +
// tickerMasterRecords(매달 갱신되는 국내 전종목+미국 주요종목, 로드 안 됐으면 건너뜀) +
// TICKER_NAME_FALLBACK_SEED(최소 안전망)를 함께 검색해 야후 티커로 변환한다. 완전일치가 없고
// 부분일치가 여럿이면(예: '삼성'→삼성전자/삼성SDI/삼성바이오로직스/삼성물산...) 어느 것인지 특정할
// 수 없으므로 null을 반환해 호출부가 "검색창 추천 목록에서 선택하라"고 안내하게 한다 - 잘못된 종목을
// 임의로 골라 분석 결과를 보여주는 것보다 안전하다.
function findTickerByKoreanName(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const heldWithTicker = state.assets.filter((a) => String(a.ticker ?? '').trim() !== '');
  const learnedEntries = Object.entries(state.learnedTickerNames || {});

  const heldExact = heldWithTicker.find((a) => a.name === q);
  if (heldExact) return { ticker: sanitizeTicker(heldExact.ticker).yahooTicker, name: heldExact.name };
  const masterExact = tickerMasterByExactName[q];
  if (masterExact) return { ticker: masterExact.yahooTicker, name: masterExact.nameKr || masterExact.nameEn };
  const seedExactEntry = Object.entries(TICKER_NAME_FALLBACK_SEED).find(([, name]) => name === q);
  if (seedExactEntry) return { ticker: seedExactEntry[0], name: seedExactEntry[1] };
  const learnedExactEntry = learnedEntries.find(([, name]) => name === q);
  if (learnedExactEntry) return { ticker: learnedExactEntry[0], name: learnedExactEntry[1] };

  const heldPartial = heldWithTicker.filter((a) => a.name.includes(q));
  const masterPartial = tickerMasterRecords.filter((r) => r.nameKr && r.nameKr.includes(q));
  const seedPartial = Object.entries(TICKER_NAME_FALLBACK_SEED).filter(([, name]) => name.includes(q));
  const learnedPartial = learnedEntries.filter(([, name]) => name.includes(q));
  const candidates = [
    ...heldPartial.map((a) => ({ ticker: sanitizeTicker(a.ticker).yahooTicker, name: a.name })),
    ...masterPartial.map((r) => ({ ticker: r.yahooTicker, name: r.nameKr })),
    ...seedPartial.map(([ticker, name]) => ({ ticker, name })),
    ...learnedPartial.map(([ticker, name]) => ({ ticker, name }))
  ];
  const uniqueTickers = new Set(candidates.map((c) => c.ticker));
  if (uniqueTickers.size === 1) return candidates[0];
  return null;
}

// [종목 분석 모달 - 검색 추천 목록] 보유 자산 + tickerMasterRecords(국내 전종목+미국 주요종목,
// 이름/티커 소문자를 미리 계산해 둬서 키 입력마다 매번 toLowerCase()를 반복하지 않는다) +
// learnedTickerNames(이전에 검색해서 학습된 종목)를 대상으로 이름/티커 부분일치 후보를 모아 드롭다운에
// 보여준다. 원하는 개수(8개)를 채우면 나머지 수천 건은 순회하지 않고 즉시 멈춰서(early-break) 검색
// 목록이 커져도 체감 속도가 떨어지지 않게 한다. 마스터 데이터가 아직 로드되지 않았을 때만
// TICKER_NAME_FALLBACK_SEED로 보충한다(로드된 뒤에는 그 90여 개가 마스터 데이터에 이미 포함돼 있어
// 중복 표시를 막기 위함).
function searchStockAnalysisCandidates(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  const seen = new Set();
  const MAX_RESULTS = 8;
  state.assets.forEach((a) => {
    const ticker = String(a.ticker ?? '').trim();
    if (!ticker) return;
    const yahooTicker = sanitizeTicker(ticker).yahooTicker;
    if (seen.has(yahooTicker)) return;
    if (!`${a.name} ${ticker}`.toLowerCase().includes(q)) return;
    seen.add(yahooTicker);
    results.push({ ticker: yahooTicker, name: a.name, sub: '보유 중' });
  });
  for (const r of tickerMasterRecords) {
    if (results.length >= MAX_RESULTS) break;
    if (seen.has(r.yahooTicker)) continue;
    if (!(r._nameKrLower.includes(q) || r._nameEnLower.includes(q) || r._tickerLower.includes(q))) continue;
    seen.add(r.yahooTicker);
    results.push({ ticker: r.yahooTicker, name: r.nameKr || r.nameEn, sub: r.exchange });
  }
  if (!tickerMasterLoaded) {
    Object.entries(TICKER_NAME_FALLBACK_SEED).forEach(([ticker, name]) => {
      if (results.length >= MAX_RESULTS) return;
      if (seen.has(ticker)) return;
      if (!`${name} ${ticker}`.toLowerCase().includes(q)) return;
      seen.add(ticker);
      results.push({ ticker, name, sub: '주요 종목' });
    });
  }
  Object.entries(state.learnedTickerNames || {}).forEach(([ticker, name]) => {
    if (results.length >= MAX_RESULTS) return;
    if (seen.has(ticker)) return;
    if (!`${name} ${ticker}`.toLowerCase().includes(q)) return;
    seen.add(ticker);
    results.push({ ticker, name, sub: '최근 검색' });
  });
  return results.slice(0, MAX_RESULTS);
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

  let yahooTicker = sanitizeTicker(searchTicker).yahooTicker;

  // [중복 조회 제거] 이 티커를 이미 보유 중이면(자산관리 목록에서 종목을 클릭해 상세를 여는, 가장 흔한
  // 진입 경로) refreshPricesAndRates()가 이미 받아둔 현재가/등락률이 state.assets/dayChangeMap에 있다
  // - getCoreStockInfoFromState(js/02, 핵심종목 실시간 팝업)와 동일한 이유·동일한 패턴으로 그 값을
  // 그대로 재사용한다. 미보유 종목 검색(매도 완료/관심종목)이거나 currentPrice가 아직 없으면(최초
  // 조회 전 등) 그때만 새로 조회한다. 실패한 지난 갱신이라도 asset.currentPrice는 항상 "마지막으로
  // 성공한 값"이 그대로 남아있으므로(다른 곳과 동일한 원칙) fetchStatus는 따로 확인하지 않는다.
  const heldMatch = yahooTicker
    ? state.assets.find((a) => Number.isFinite(a.currentPrice) && a.currentPrice > 0 && sanitizeTicker(a.ticker).yahooTicker === yahooTicker)
    : null;
  // 현재가/등락률은 실패해도(예: 장중 프록시 일시 장애) 아래 기술적 분석은 계속 진행한다 - 표시용
  // 보조 정보일 뿐, 핵심 분석은 1년치 종가 이력(closes)만 있으면 가능하다.
  let priceInfo = null;
  if (heldMatch) {
    priceInfo = { price: heldMatch.currentPrice, changePercent: num(state.dayChangeMap[heldMatch.id]), name: heldMatch.name };
  } else {
    try { priceInfo = await fetchPriceWithFallback(searchTicker, resolvedName || searchTicker); } catch (e) { /* 무시 - 아래 폴백으로 계속 */ }
  }
  let data = await getCachedDailyCloses(yahooTicker);
  // [코스닥 구제] 접미사 없는 6자리 국내코드가 코스피(.KS) 조회로 실패하면 코스닥(.KQ)으로 한 번 더
  // 시도한다 - fetchPriceWithFallback의 동일한 구제 로직을 여기서도 재현.
  if ((!data || !data.closes || data.closes.length < 20) && isKrxShortCode(searchTicker)) {
    const kqTicker = String(searchTicker).toUpperCase() + '.KQ';
    const kqData = await getCachedDailyCloses(kqTicker);
    if (kqData && kqData.closes && kqData.closes.length >= 20) { yahooTicker = kqTicker; data = kqData; }
  }
  if (!data || !data.closes || data.closes.length < 20) {
    return { error: `'${trimmedRaw}'의 가격 이력을 찾을 수 없습니다 - 티커를 확인해 주세요 (예: 해외는 AAPL, 국내는 005930).` };
  }

  // [R-03/R-04] 이 화면도 같은 기준을 따른다 - 기술 지표는 원주가, 통계 지표는 조정주가.
  const closes = data.closes;                       // 원주가(RSI · 이동평균 · 52주 · 볼린저 · 최근 고저)
  const closesAdj = hasAdjustedCloses(data) ? (datedClosesFromSeries(data, 'adjusted') || []).map((d) => d.close) : null;
  const returns = closesAdj ? dailyReturnsFromCloses(closesAdj) : null;
  // [G-1] 보유 화면과 같은 규칙(§44 제10조)으로 기준 지수를 정한다 - 확정되지 않으면 비교하지 않는다.
  const modalBenchmark = resolveModalBenchmark(yahooTicker, resolvedName);
  const benchmarkKey = modalBenchmark.status === 'RESOLVED' && modalBenchmark.priceSource !== 'UNAVAILABLE'
    ? modalBenchmark.key : null;
  const benchmarkData = benchmarkKey ? await getCachedDailyCloses(INDEX_TICKERS[benchmarkKey]) : null;
  const benchmarkAdj = hasAdjustedCloses(benchmarkData) ? (datedClosesFromSeries(benchmarkData, 'adjusted') || []).map((d) => d.close) : null;
  const benchmarkReturns = benchmarkAdj ? dailyReturnsFromCloses(benchmarkAdj) : null;

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

  // [종목명 표시 개선] 한글 이름으로 안 찾고 티커를 직접 입력한 경우(예: '273130', 'a128940', 'spck')
  // 에도, 그 티커가 TICKER_NAME_FALLBACK_SEED/learnedTickerNames에 있거나 API가 실제 이름(국내는 Naver의
  // stockName, 해외는 Yahoo meta.longName/shortName)을 내려줬으면 원본 입력 그대로가 아니라 정식
  // 종목명을 보여준다. [대소문자 버그 수정] 정말 아무 이름도 못 찾은 최후의 폴백은 trimmedRaw(사용자가
  // 입력한 원본 대소문자, 예: 'spck')가 아니라 yahooTicker(항상 대문자로 정돈됨, 'SPCK')를 쓴다 -
  // 안 그러면 제목엔 'spck SPCK'처럼 이름과 티커의 대소문자가 서로 다르게 보이는 문제가 있었다.
  const masterRecord = tickerMasterByTicker[yahooTicker];
  const displayName = resolvedName || (masterRecord && (masterRecord.nameKr || masterRecord.nameEn)) || TICKER_NAME_FALLBACK_SEED[yahooTicker] || state.learnedTickerNames[yahooTicker] || (priceInfo && priceInfo.name) || yahooTicker || trimmedRaw;
  // [학습된 종목명 캐시에 기록] 지금 막 진짜 이름을 확인했으면(=trimmedRaw/티커를 그대로 되돌려준 게
  // 아니면) 다음부터는 이 기기에서 티커든 이름이든 바로 찾을 수 있도록 남겨둔다 - 이미 TICKER_NAME_FALLBACK_SEED에
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
    mdd: closesAdj ? computeMDDFromCloses(closesAdj) : null,
    beta: (returns && benchmarkReturns) ? computeBetaFromReturns(returns, benchmarkReturns) : null,
    benchmarkKey,
    // [G-1] 기준 지수를 정하지 못한 이유를 함께 넘긴다 - 화면이 "왜 비교값이 없는지"를 말할 수 있어야 한다.
    benchmarkStatus: modalBenchmark.status,
    benchmarkSource: modalBenchmark.source || null,
    week52High,
    week52DrawdownPct: week52High > 0 ? ((currentPrice - week52High) / week52High) * 100 : null,
    recentHigh, recentLow
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

