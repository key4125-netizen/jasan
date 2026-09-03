/* -------------------------------------------------------------------------
 * 19. [시세 & 환율 갱신] 통합 버튼
 * ---------------------------------------------------------------------- */
const refreshBtn = document.getElementById('refreshAllBtn');
const refreshBtnIcon = document.getElementById('refreshBtnIcon');
const refreshBtnText = document.getElementById('refreshBtnText');
const refreshStatusMsg = document.getElementById('refreshStatusMsg');

function setRefreshingUI(isRefreshing, statusText) {
  refreshBtn.disabled = isRefreshing;
  refreshBtnIcon.classList.toggle('animate-spin', isRefreshing);
  refreshBtnText.textContent = isRefreshing ? '갱신 중...' : '시세 & 환율 갱신';
  if (statusText) {
    refreshStatusMsg.textContent = statusText;
    refreshStatusMsg.classList.remove('hidden');
  }
}

// 보유 중인 모든 종목의 시세를 조회해 state에 반영한다(성공/실패 집계를 반환).
// 채권/현금/부동산 및 티커 없는 자산은 대상에서 제외한다 - 사용자가 실수로 티커를 넣어도 안전.
// 개별 종목 조회 실패는 Promise.allSettled로 흡수하므로 이 함수 자체가 reject되는 일은 없다
// (기존 currentPrice는 실패한 종목에 한해 그대로 유지된다).
// targets(자산 객체 배열)에 대해서만 시세를 동시 조회하고 state에 반영한다. 전체 새로고침(fetchAllPrices)과
// 실패 종목 일괄 재조회(retryFailedPrices) 양쪽이 이 함수 하나를 공유해, 프록시 경쟁/적용 로직이
// 두 곳에서 어긋나지 않게 한다.
// 각 자산의 fetchStatus('pending'|'success'|'failed')를 여기서 함께 갱신한다 - localStorage에는
// 저장되지 않는(persistAssets가 명시적으로 허용한 필드만 저장) 휘발성 런타임 상태다.
async function fetchPricesForTargets(targets) {
  targets.forEach((a) => { a.fetchStatus = 'pending'; });

  // [지연/신뢰성 문제 수정] 같은 종목을 여러 계좌/소유자가 나눠 보유하는 경우(가족 공유 자산관리 앱의
  // 흔한 패턴 - 신랑/와이프가 같은 종목을 각자 계좌에 나눠 담는 경우) 예전에는 자산 row 개수만큼
  // 완전히 독립된 fetchPriceWithFallback 호출이 나갔다 - 같은 티커에 대한 동시 중복 요청이 같은
  // 프록시 풀(특히 own-worker/r.jina.ai)에 몰려 서로 경쟁하며 자기 자신 때문에 rate limit(429)이
  // 걸리는 경우가 실측으로 확인됐다(동일 티커 2건 중 1건은 성공, 동시에 쏜 나머지 1건은 429로 실패).
  // 이제 티커별로 fetchPriceWithFallback을 딱 한 번만 호출하고, 같은 티커를 가진 모든 자산이 그
  // 결과(Promise)를 공유한다 - Promise는 여러 곳에서 await해도 실제 네트워크 요청은 한 번만 나간다.
  const fetchByTicker = new Map();
  targets.forEach((a) => {
    if (!fetchByTicker.has(a.ticker)) fetchByTicker.set(a.ticker, fetchPriceWithFallback(a.ticker, a.name));
  });

  const results = await Promise.allSettled(
    targets.map(a => fetchByTicker.get(a.ticker).then(r => ({ id: a.id, name: a.name, ticker: a.ticker, ...r })))
  );

  let successCount = 0, failCount = 0;
  const failedNames = [];
  results.forEach((r, i) => {
    const t = targets[i];
    if (r.status === 'fulfilled') {
      const asset = state.assets.find(x => x.id === r.value.id);
      if (asset) {
        asset.currentPrice = r.value.price;
        asset.fetchStatus = 'success';
        state.dayChangeMap[r.value.id] = r.value.changePercent;
        state.prevCloseMap[r.value.id] = r.value.previousClose; // 일간 손익 정밀 계산용 전일종가(없으면 null)
        // 'post'/'pre'/'regular' 어느 세션의 시세를 현재가로 채택했는지 표식 - 테이블 배지용.
        // session 정보 자체가 없는 소스(Stooq 등)만 배지를 아예 띄우지 않도록 sessionMap에서 지운다.
        if (r.value.session) state.sessionMap[r.value.id] = r.value.session;
        else delete state.sessionMap[r.value.id];
        // [버그 수정 - 기기 간 판정 불일치 제거] 예전엔 "직전 폴링" 대비 비교가 무료 프록시 캐싱/API
        // 갱신 지연으로 우연히 같은 값을 돌려줄 때(정규장 도중에도 흔함) 정상 거래일을 "휴장"으로
        // 오판하는 문제가 있어서(예: SK하이닉스 +12.73%인데 일간손익에 거의 반영 안 됨), 그 시장의
        // "오늘 날짜"가 바뀐 시점의 기준값(dailyRefTradeKey)을 기기별 localStorage에 스냅샷해 비교하는
        // 방식으로 고쳤었다 - 그런데 이 스냅샷 자체가 기기마다 "언제 처음 켰는지"에 따라 달라져,
        // 데스크탑/모바일 간 "해외통화" 일간손익이 어긋나는 새 문제를 낳았다(실사용자 리포트로 확인).
        // 이제 기기별 저장 없이, lastTradeKey(=regularMarketTime, API가 준 절대 체결 시각)가 그 시장
        // 기준 "오늘" 날짜에 속하는지를 매번 새로 계산해서만 판정한다 - 절대 시각 + 고정 타임존이라
        // 어느 기기에서 계산하든 항상 같은 결과가 나오고, 폴링 타이밍 노이즈에도 흔들리지 않는다.
        if (typeof r.value.lastTradeKey === 'string' && r.value.lastTradeKey) {
          const marketKey = getMarketKeyForTicker(asset.ticker);
          const todayMarketDateKey = getMarketDateKey(marketKey);
          // [버그 수정] lastTradeKey의 실제 형식이 소스마다 다르다 - Yahoo(raceFetchYahooStooq)는
          // regularMarketTime을 그대로 문자열화한 epoch초("1787320200")를 주지만, 네이버(국내 티커,
          // fetchNaverKrPrice)는 d.localTradedAt이라는 ISO 8601 문자열("2026-08-21T15:30:00+09:00")을
          // 준다. Number()만 믿으면 네이버 쪽은 항상 NaN이 되어 국내 종목 전체가 "새 체결 없음"으로
          // 잘못 판정되고 실제 등락(예: SK하이닉스 +2.3%)이 일간손익에서 0으로 사라지는 사고가 났다 -
          // Number()가 실패하면 Date 파서로도 시도한다.
          const asNumber = Number(r.value.lastTradeKey);
          const asDateMs = new Date(r.value.lastTradeKey).getTime();
          const tradeEpochSeconds = Number.isFinite(asNumber) ? asNumber : (Number.isFinite(asDateMs) ? asDateMs / 1000 : NaN);
          const tradeDateKey = Number.isFinite(tradeEpochSeconds) ? getMarketDateKeyForEpoch(marketKey, tradeEpochSeconds) : null;
          state.noNewSessionMap[r.value.id] = !(tradeDateKey && tradeDateKey === todayMarketDateKey);
        } else {
          delete state.noNewSessionMap[r.value.id];
        }
        if (typeof r.value.regularMarketPrice === 'number' && r.value.regularMarketPrice > 0) asset.regularMarketPrice = r.value.regularMarketPrice;
        // [미니 당일 봉차트] 소스가 OHLC를 제공하지 못하면(값이 숫자가 아니면) 이전 값을 지워 미니
        // 차트가 어제 값으로 잘못 그려지지 않고 조용히 숨겨지게 한다(miniCandleSvg 참고).
        asset.todayOpen = Number.isFinite(r.value.todayOpen) ? r.value.todayOpen : undefined;
        asset.todayHigh = Number.isFinite(r.value.todayHigh) ? r.value.todayHigh : undefined;
        asset.todayLow = Number.isFinite(r.value.todayLow) ? r.value.todayLow : undefined;
        state.priceFetchFailedIds.delete(t.id); // 이번 갱신에서 성공했으므로 과거 실패 표시를 지운다
        successCount++;
      }
    } else {
      failCount++; // 실패 시 asset.currentPrice는 손대지 않으므로 기존 값이 안전하게 유지된다.
      t.fetchStatus = 'failed';
      state.priceFetchFailedIds.add(t.id); // 테이블/KPI에서 강조 표시 + 일괄 재조회 대상 표식
      failedNames.push(t.name);
    }
  });

  return { targetCount: targets.length, successCount, failCount, failedNames };
}

async function fetchAllPrices() {
  const targets = state.assets.filter(a => String(a.ticker ?? '').trim() && !NON_TRADABLE_CATEGORIES.includes(a.category));
  return fetchPricesForTargets(targets);
}

// [실패 종목 일괄 재조회] - 이번에 조회조차 시도하지 않는 자산(시세 이미 성공/비거래 자산)은 완전히
// 건너뛰고, state.priceFetchFailedIds에 남아있는 종목만 골라 다시 시도한다.
async function retryFailedPrices() {
  const targets = state.assets.filter((a) => state.priceFetchFailedIds.has(a.id));
  if (targets.length === 0) return;

  const retryBtn = document.getElementById('retryFailedPricesBtn');
  const retryBtnText = document.getElementById('retryFailedPricesBtnText');
  retryBtn.disabled = true;
  retryBtnText.textContent = '재조회 중...';

  await fetchPricesForTargets(targets);
  persistAssets(true); // 배경 자동 갱신 - 동기화 push 안 함(persistRate skipPush 주석 참고)
  // 실패 0건이 되면 renderKPIs()가 '총 투자금액' 화면으로 자동 복귀시키고, 일부만 성공했다면
  // 남은 실패 종목 목록으로 패널을 다시 그리면서 버튼 상태도 함께 원상복구한다.
  renderAll();
}
document.getElementById('retryFailedPricesBtn').addEventListener('click', () => { retryFailedPrices(); });

// 시세 & 환율을 함께 갱신하는 공용 로직 - [시세 & 환율 갱신] 버튼 클릭과 페이지 최초 로드/새로고침
// (모바일 pull-to-refresh 포함) 양쪽에서 호출한다. fetchExchangeRate/fetchAllPrices는 내부적으로
// 이미 실패를 안전하게 흡수하므로(catch), 네트워크 오류가 나도 이 함수가 예외를 던지는 일은 없고
// LocalStorage에 저장된 기존 시세/환율은 그대로 보존된다.
// [버그 수정 - 완료 토스트 중복 노출] 5분 자동갱신/탭 재진입 갱신은 호출 전에 refreshBtn.disabled를
// 직접 확인해 중복 호출을 막고 있었지만, pullFromCloud()(js/12, 원격에 새 데이터가 있으면 반영 직후
// 자동 호출)는 그 확인 없이 이 함수를 그대로 불렀다 - 그 결과 부팅 직후처럼 "부팅 시 최초 1회
// refreshPricesAndRates() 호출"과 "부팅 시 pullFromCloud() 호출이 마침 새 원격 데이터를 발견해 다시
// refreshPricesAndRates() 호출"이 겹치면 완료 갱신 주기 두 개가 동시에 돌아 완료 토스트도 두 번 떴다.
// 이 함수 자체에 재진입 가드를 둬서, 앞으로 어떤 호출부가 사전 확인을 빼먹어도 이미 진행 중인 갱신과
// 겹쳐 실행되는 일 자체가 없도록 근본적으로 막는다(완료 토스트만 감추는 게 아니라 중복 네트워크
// 호출 자체를 없앤다).
async function refreshPricesAndRates() {
  if (refreshBtn.disabled) return; // 이미 갱신이 진행 중이면 재진입 무시
  setRefreshingUI(true);
  refreshStatusMsg.classList.add('hidden');
  // 앱을 며칠간 새로고침 없이 켜둔 채 자정을 넘긴 경우까지 대응하기 위해, 갱신 직전에도 날짜 전환을 재확인한다.
  ensureDailyReference();

  const prevRate = state.exchangeRate;
  // 환율 갱신과 시세 갱신은 서로 의존관계가 없으므로 동시에 시작한다(둘 다 내부적으로 다중 소스를
  // 병렬 경쟁시키므로, 전체적으로 "가장 오래 걸리는 하나"의 시간만큼만 기다리면 된다 - 모바일에서
  // 순차 실행 시 최대 1분 가까이 걸리던 것을 대폭 단축한다).
  const ratePromise = fetchExchangeRate().then(() => true).catch(() => false);
  const pricesPromise = fetchAllPrices();
  // [초보자용 리스크 진단 + 개별 종목 정밀 주가 분석] pricesPromise가 끝나 현재가(a.currentPrice)가
  // 최신 상태로 반영된 뒤에 계산해야 종목별 비중/52주 낙폭이 정확하다 - pricesPromise에 체이닝해
  // 순서를 보장한다. 계산 자체는 내부에서 try/catch로 감싸 있어 실패해도 state.advancedRiskMetrics만
  // null이 될 뿐 나머지 갱신엔 영향 없다. (구 지수/20일선 개별 갱신 로직은 이 계산 하나로 흡수되어 제거됨)
  const riskMetricsPromise = pricesPromise.then(() => computeAdvancedRiskMetrics()).then((m) => {
    state.advancedRiskMetrics = m;
  }).catch(() => {});
  // [핵심종목 실시간 팝업 - 지수도 이 갱신 주기에 함께 조회] 보유 종목과 마찬가지로 코스피/코스닥/
  // S&P500/나스닥/다우존스도 여기서 한 번에 받아 state.marketIndexCache에 채워둔다 - 그래야 핵심종목
  // 팝업을 열 때 이 5개도 보유 종목처럼 캐시를 그대로 읽기만 하면 되고, 팝업이 열릴 때마다 따로 또
  // 조회하지 않는다(openCoreStocksModal 참고). 실패한 지수는 캐시를 갱신하지 않고 이전 값을 그대로
  // 남겨둔다(완전히 값이 없는 것보다 낫다).
  const indexPromise = Promise.allSettled(MARKET_INDEX_LIST.map((c) => fetchPriceWithFallback(c.ticker, c.name))).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') state.marketIndexCache[MARKET_INDEX_LIST[i].ticker] = r.value;
    });
  });
  // [시장 현황 & 매크로 브리핑] VIX/미 10년물 국채금리도 위 지수 조회와 완전히 같은 방식으로 같은
  // 갱신 주기에 함께 받아 state.macroIndicatorCache에 채운다 - 별도 폴링 루프를 만들지 않는다.
  const macroKeys = Object.keys(MACRO_TICKERS);
  const macroPromise = Promise.allSettled(macroKeys.map((key) => fetchPriceWithFallback(MACRO_TICKERS[key], key))).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') state.macroIndicatorCache[macroKeys[i]] = r.value;
    });
  });

  const [rateOk, priceResult] = await Promise.all([ratePromise, pricesPromise, riskMetricsPromise, indexPromise, macroPromise]);
  const { targetCount, successCount, failCount, failedNames } = priceResult;

  if (successCount > 0) persistAssets(true); // 배경 자동 갱신 - 동기화 push 안 함(persistRate skipPush 주석 참고)
  renderAll();
  lastRefreshAt = Date.now(); // 자동 폴링 타이머 및 "다음 자동 갱신까지" 표시의 기준 시각

  const parts = [];
  parts.push(rateOk ? '환율 갱신 완료' : '환율 갱신 실패(기존 값 유지)');
  if (targetCount > 0) {
    parts.push(`시세 ${successCount}건 갱신${failCount ? `, ${failCount}건 실패(기존 값 유지)` : ''}`);
  } else {
    parts.push('조회할 티커 없음');
  }
  setRefreshingUI(false, parts.join(' · ') + ` (${new Date().toLocaleTimeString('ko-KR')} 기준)`);

  // 토스트 안내: 환율+시세가 전부 성공했을 때만 통합 완료 메시지 하나로 요약하고,
  // 그 외에는 환율/시세 각각의 결과를 따로 안내해 어느 쪽이 실패했는지 명확히 전달한다.
  const priceAllOk = targetCount > 0 && failCount === 0;

  if (rateOk && priceAllOk) {
    showToast('모든 종목 시세 및 환율 갱신 완료!', 'success');
  } else {
    if (rateOk) {
      showToast(`최신 환율(${fmtNum(state.exchangeRate, 1)}원) 적용 완료`, 'success');
    } else {
      showToast(`환율 API 연결 실패 - 기존 환율(${fmtNum(prevRate, 1)}원) 유지. 상단 환율 입력란에서 직접 수정할 수 있습니다.`, 'warn', 8000);
    }

    if (targetCount > 0) {
      if (failCount === 0) {
        showToast('모든 종목 시세 조회 완료', 'success');
      } else {
        showToast(
          `총 ${targetCount}개 종목 중 [${failedNames.join(', ')}] ${failCount}개 종목 시세 조회 실패. 기존 단가를 유지하거나 직접 수정해주세요.`,
          'warn', 9000
        );
      }
    }
  }
}

refreshBtn.addEventListener('click', () => { refreshPricesAndRates(); });

/* -------------------------------------------------------------------------
 * 19-1. 자동 주기 갱신(Auto Polling) + 탭 재진입 시 갱신
 *    - 앱을 켜둔 상태에서 5분마다 자동으로 refreshPricesAndRates()를 호출해 일간 평가손익 등이
 *      계속 최신 시세를 반영하도록 한다.
 *    - 다른 탭/앱을 보다가 이 화면으로 다시 돌아왔을 때(visibilitychange)도 즉시 갱신하되,
 *      마지막 갱신 후 최소 1분이 지나지 않았으면 건너뛰어 API를 과도하게 호출하지 않는다.
 *    - refreshBtn.disabled(=setRefreshingUI가 관리하는 "갱신 중" 플래그)를 그대로 재사용해
 *      이미 진행 중인 갱신과 중복 호출되는 것을 막는다.
 * ---------------------------------------------------------------------- */
const AUTO_REFRESH_INTERVAL_MS = 300000; // 5분
const FOCUS_REFRESH_MIN_GAP_MS = 60000;  // 1분
let lastRefreshAt = 0; // refreshPricesAndRates()가 마지막으로 "완료"된 시각(ms) - 함수 내부에서 갱신
const autoRefreshStatusMsg = document.getElementById('autoRefreshStatusMsg');

function updateAutoRefreshStatusText() {
  if (!lastRefreshAt) return; // 아직 첫 갱신이 끝나지 않았으면 표시하지 않음
  const lastTimeStr = new Date(lastRefreshAt).toLocaleTimeString('ko-KR');
  if (refreshBtn.disabled) {
    autoRefreshStatusMsg.textContent = `마지막 갱신 ${lastTimeStr} · 갱신 중...`;
  } else {
    const remainSec = Math.max(0, Math.ceil((AUTO_REFRESH_INTERVAL_MS - (Date.now() - lastRefreshAt)) / 1000));
    const m = Math.floor(remainSec / 60);
    const s = remainSec % 60;
    autoRefreshStatusMsg.textContent = `마지막 갱신 ${lastTimeStr} · 다음 자동 갱신까지 ${m}분 ${s}초`;
  }
  autoRefreshStatusMsg.classList.remove('hidden');
}
setInterval(updateAutoRefreshStatusText, 1000);

setInterval(() => {
  if (refreshBtn.disabled) return; // 이미 갱신이 진행 중이면 중복 호출하지 않음
  refreshPricesAndRates();
}, AUTO_REFRESH_INTERVAL_MS);

// [가족 동기화 - 10초 주기 자동 pull] 부부 두 기기 기준 하루 약 7,200건으로 Cloudflare 무료 티어
// (Workers 10만/일, KV 읽기 10만/일)에 여유가 큰 것을 확인하고 정한 주기다(§22-2 참고). silent:true라
// 변경사항이 없을 때(가장 흔한 경우)는 토스트 없이 조용히 지나가고, 실제로 원격 데이터를 반영했을
// 때만 pullFromCloud() 내부에서 토스트를 띄운다.
setInterval(() => pullFromCloud({ silent: true }), 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (refreshBtn.disabled) return;
  if (Date.now() - lastRefreshAt < FOCUS_REFRESH_MIN_GAP_MS) return; // 너무 빈번한 재호출 방지
  refreshPricesAndRates();
});

/* -------------------------------------------------------------------------
 * 20. 일별 손익 추이 / 총 평가금액 추이 팝업
 *    - 일별 평가손익: renderKPIs()가 매 렌더링마다 자동으로 남기는 오늘자 스냅샷(state.dailySnapshots,
 *      소유자별 평가금액+당일손익)을 그대로 모아서 보여준다. 사용자가 아무것도 입력하지 않아도 앱을
 *      켜서 렌더링될 때마다 자동으로 쌓인다(다만 앱을 켜지 않은 날은 그 날짜의 기록 자체가 없다 -
 *      "수동 입력 Zero"의 필연적인 한계).
 *    - 일별 실현손익: [거래내역] 탭의 실현손익 리포트와 같은 계산 결과(computePositionsAndRealizedPnL의
 *      annotated 배열, 매도 건마다 이동평균법으로 계산된 computedRealizedPnL)를 날짜별로 다시 집계한다.
 *    - [멀티 라인 통합] 예전엔 소유자 필터 탭으로 한 번에 한 시리즈만 보여줬는데, 이제 합계/신랑/와이프
 *      3개 라인을 한 차트에 동시에 그린다(renderMultiSeriesLineChart 공용 함수) - 개별 라인을 숨기려면
 *      Chart.js 기본 범례를 클릭하면 된다. 총 평가금액 추이 팝업도 같은 집계(buildSnapshotSeries)/
 *      렌더링 함수를 공유한다.
 * ---------------------------------------------------------------------- */
let dailyPnlPopupType = 'unrealized'; // 'unrealized' | 'realized'
let dailyPnlPopupOwner = 'all';       // 'all' | 실제 소유자명
// [월 단위 기간 기준 - 요청 반영] dailyPnlPopupDays는 더 이상 고정값(30/90/180/365)이 아니라
// daysSinceMonthsAgoStart(js/01)로 그때그때 계산되는 "해당 월 1일부터 오늘까지의 일수"다 - 날짜가
// 바뀌면 같은 개월 수 선택이어도 일수가 달라질 수 있어(예: 당월은 매일 커짐), 팝업을 열 때/기간 버튼을
// 누를 때마다 다시 계산한다.
let dailyPnlPopupDays = daysSinceMonthsAgoStart(1); // [기본 기간 당월] 팝업 최초 오픈 시 항상 당월부터

// 실제 보유 자산에 등장하는 소유자만 동적으로 뽑는다(신랑/와이프를 하드코딩하지 않아 다른 소유자
// 이름을 쓰는 경우에도 그대로 동작한다) - ownerRank로 신랑→와이프→그 외 순 정렬.
function getDailyPnlOwnerList() {
  return Array.from(new Set(state.assets.map((a) => a.owner).filter(Boolean)))
    .sort((a, b) => ownerRank(a) - ownerRank(b));
}

// 오늘 날짜 키를 항상 최신값으로 덮어쓴다 - 하루 중 여러 번 호출돼도(자동 5분 갱신 등) 그날의 가장
// 최근 값만 남는다.
function recordDailySnapshot(totalCur, dailyProfit, byOwner, byOwnerCategory) {
  const dateKey = todayDateStr();
  const byOwnerSnap = {};
  Object.keys(byOwner).forEach((owner) => {
    byOwnerSnap[owner] = { cur: byOwner[owner].cur, dailyPnL: byOwner[owner].dailyPnL };
  });
  // [자산군별 투자금액 추이 팝업] 소유자×자산군 교차 집계도 함께 기록한다 - byOwnerCategory 인자를
  // 안 넘기는 기존 호출부(없음, 하지만 방어적으로)나 옛 데이터 구조와의 호환을 위해 없으면 빈 객체로 둔다.
  const byOwnerCategorySnap = {};
  Object.keys(byOwnerCategory || {}).forEach((owner) => {
    byOwnerCategorySnap[owner] = {};
    Object.keys(byOwnerCategory[owner]).forEach((category) => {
      byOwnerCategorySnap[owner][category] = { cur: byOwnerCategory[owner][category].cur, dailyPnL: byOwnerCategory[owner][category].dailyPnL };
    });
  });
  state.dailySnapshots[dateKey] = { total: { cur: totalCur, dailyPnL: dailyProfit }, byOwner: byOwnerSnap, byOwnerCategory: byOwnerCategorySnap };
  persistDailySnapshots();
}

function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// [최초 등록 소급 히스토리] 새로 등록된 티커 보유 자산의 최근 1년(영업일 기준 252일 - PERIOD_TRADING_DAYS.1y와
// 동일 기준)치 일별 종가(fetchDailyHistory, 종목 상세 차트와 같은 소스를 재사용)를 가져와 그 구간의
// "일간 평가손익"(하루 대비 변동분)을 역산해 state.dailySnapshots에 채워 넣는다. 자산을 막 등록한 첫날에도
// [일별 손익 추이] 그래프가 텅 비어 있지 않고 바로 최근 1년 추세로 보이게 하기 위함이다(일별 손익
// 추이/총 평가금액 추이 팝업의 [1년] 탭 데이터도 이 백필 결과를 그대로 재사용한다).
//   - 값의 "단위"를 실시간 기록(recordDailySnapshot)과 반드시 맞춘다 - 하루 대비 변동분(누적 매수 대비
//     손익이 아니다). 그래야 소급된 과거 구간과 오늘부터 실시간으로 쌓이는 구간이 그래프 상에서 자연스럽게
//     이어지고, 큰 폭(누적)에서 작은 폭(하루치)으로 뚝 떨어지는 단절이 생기지 않는다.
//   - 구간 첫째 날만 예외적으로 "그날 종가 - 매수단가"를 전일 대비 변동분으로 간주한다(그 이전 체결
//     종가를 알 수 없으므로 매수단가를 사실상의 "전일 종가"로 취급). 이후 날짜는 전날 종가 대비 종가
//     변동분 × 수량이다.
//   - 해외 자산은 과거 일자별 환율까지는 조회하지 않고(무료 API 호출 부담이 커지고, 이 기능의 목적이
//     정밀 회계가 아니라 "빈 그래프 대신 바로 추세를 보여주는 것"이므로) 현재 환율을 구간 전체에
//     동일하게 적용하는 근사치를 쓴다.
//   - 오늘 날짜는 건드리지 않는다 - renderKPIs()가 매 렌더링마다 실시간 값으로 그 날짜를 새로 계산해
//     덮어쓰므로, 여기서 과거치 방식으로 채워봐야 곧바로 실제 값으로 대체된다.
//   - 이미 그 날짜에 스냅샷이 있으면(다른 자산의 실시간 기록 등) 새로 만들지 않고 더해 넣는다 - 이후
//     이 함수가 다른 신규 자산에도 반복 호출될 수 있으므로 항상 "누적"이 맞다.
async function backfillDailyPnlHistory(asset) {
  const sanitized = sanitizeTicker(asset.ticker);
  if (!sanitized.yahooTicker) return; // 티커 없는 자산(채권/현금 등)은 시세 자체가 없어 대상 아님
  const qty = num(asset.quantity);
  if (qty <= 0) return;

  let points;
  try {
    points = await fetchDailyHistory(sanitized.yahooTicker);
  } catch (e) {
    console.warn(`[소급 히스토리] ${asset.name || asset.ticker}(${asset.owner}) 과거 시세 조회 실패 - 건너뜀: ${e.message}`);
    return;
  }
  // [버그 수정 - 일간손익 그래프 이상 스파이크] 예전엔 "구간의 첫째 날"은 그 전날 종가를 알 수 없다는
  // 이유로 매수단가(취득 시점 가격 - 몇 달~몇 년 전일 수 있음)를 그날의 "전일 종가" 대용으로 썼다.
  // 그 결과 (그날 종가 - 매수단가)라는, 사실은 "취득 이후 누적 손익"에 가까운 큰 값이 "하루치 손익"으로
  // 잘못 기록되어 그래프에 비정상적으로 큰 스파이크가 찍혔다(신고된 버그의 원인 - 환율 이중 곱셈이나
  // 누적 합산 오류는 아니었고, 이 한 지점의 잘못된 "전일 종가" 대입이 원인이었다).
  // fetchDailyHistory가 range=2y로 2년치를 받아오므로, 1년치보다 하루 더 앞선 봉까지 가져오면 1년
  // 구간의 첫째 날에도 진짜 전일 종가를 쓸 수 있다 - 매수단가는 더 이상 전일 종가 대용으로 쓰지 않는다.
  // [기간 확장: 6개월→1년] 일별 손익 추이/총 평가금액 추이 팝업에 [1년] 기간 탭이 생겼는데, 소급
  // 히스토리는 여전히 6개월치만 채워서 "1년" 탭을 눌러도 앞쪽 6개월은 빈 데이터(0원)로 보이는 문제가
  // 있었다 - 이미 2년치를 받아오고 있으므로 API 호출 추가 없이 슬라이싱 구간만 1년으로 늘렸다.
  const rawWindow = points.slice(-(PERIOD_TRADING_DAYS['1y'] + 1));
  const windowPoints = [];
  let lastValidClose = null;
  rawWindow.forEach((p) => {
    if (typeof p.close === 'number' && p.close > 0) {
      lastValidClose = p.close;
      windowPoints.push(p);
    } else if (lastValidClose !== null) {
      windowPoints.push({ ...p, close: lastValidClose }); // 이월
    }
    // lastValidClose가 아직 없는데(구간 맨 앞부터 비정상) close도 없으면 그 봉은 아예 버린다.
  });
  // 기준이 될 "전일 종가" 봉 하나 + 실제로 기록할 최소 하루가 있어야 한다(상장 초기라 데이터가
  // 그만큼도 없으면 매수단가로 근사조차 하지 않고 소급 자체를 건너뛴다 - 틀린 값보다 빈 값이 낫다).
  if (windowPoints.length < 2) return;

  const fxRate = asset.currency === 'USD' ? state.exchangeRate : 1;
  const today = todayDateStr();
  console.log(`[소급 히스토리] ${asset.name}(${asset.owner}) ticker=${sanitized.yahooTicker} qty=${qty} - 조회된 봉 ${points.length}개 중 최근 ${windowPoints.length}개 사용(첫 번째는 전일종가 기준봉, 실제 반영은 그 다음날부터) (${dateKeyFromDate(windowPoints[0].date)} ~ ${dateKeyFromDate(windowPoints[windowPoints.length - 1].date)}), 종가 흐름:`,
    windowPoints.map((p) => `${dateKeyFromDate(p.date)}=${p.close}`).join(', '));

  let appliedDays = 0;
  let sumDailyPnLKRW = 0;
  // i=0은 전일 종가 기준봉일 뿐 그 자체는 기록하지 않는다 - i=1부터가 실제로 반영할 구간이다.
  for (let i = 1; i < windowPoints.length; i++) {
    const p = windowPoints[i];
    const dateKey = dateKeyFromDate(p.date);
    if (dateKey >= today) continue; // 오늘/미래 날짜는 실시간 기록에 맡긴다

    const prevClose = windowPoints[i - 1].close;
    const dailyPnLKRW = (p.close - prevClose) * qty * fxRate;
    sumDailyPnLKRW += dailyPnLKRW;
    appliedDays++;

    if (!state.dailySnapshots[dateKey]) state.dailySnapshots[dateKey] = { total: { cur: 0, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
    const snap = state.dailySnapshots[dateKey];
    if (!snap.byOwnerCategory) snap.byOwnerCategory = {}; // 이 기능 이전에 만들어진 스냅샷 방어
    snap.total.dailyPnL += dailyPnLKRW;
    if (!snap.byOwner[asset.owner]) snap.byOwner[asset.owner] = { cur: 0, dailyPnL: 0 };
    snap.byOwner[asset.owner].dailyPnL += dailyPnLKRW;
    // [자산군별 투자금액 추이 팝업] 소유자×자산군 교차 집계에도 같은 변동액을 반영한다.
    if (!snap.byOwnerCategory[asset.owner]) snap.byOwnerCategory[asset.owner] = {};
    if (!snap.byOwnerCategory[asset.owner][asset.category]) snap.byOwnerCategory[asset.owner][asset.category] = { cur: 0, dailyPnL: 0 };
    snap.byOwnerCategory[asset.owner][asset.category].dailyPnL += dailyPnLKRW;
  }
  console.log(`[소급 히스토리] ${asset.name}(${asset.owner}) - ${appliedDays}일 반영 완료, 구간 합산 손익 ${Math.round(sumDailyPnLKRW).toLocaleString()}원`);
  persistDailySnapshots();
}

// [기존 보유 자산 소급 히스토리 일괄 실행] backfillDailyPnlHistory는 "새로 등록되는 자산"에만 걸려 있어,
// 이 기능이 추가되기 전부터 있던 기존 보유 자산(예: 이미 몇 달 전부터 들고 있던 SK하이닉스)에는 한 번도
// 실행된 적이 없었다 - 그 결과 실제로는 최근 주가가 하락했어도 [일별 손익 추이] 그래프/리스트에는 전혀
// 반영되지 않는 문제가 있었다.
// [버그 수정 - 자산 ID 단위 추적] 예전엔 "앱 생애주기에 딱 한 번"만 실행되는 전역 플래그로 막았는데,
// 실사용 테스트(엑셀 표준템플릿 업로드) 도중 이 설계의 구멍이 실제로 재현됐다: 처음 앱을 켜면 샘플
// 데이터 6건에 대해 이 마이그레이션이 먼저 실행되어 전역 플래그가 소모되고, 그 직후 사용자가 진짜
// 보유 자산 28건을 엑셀로 업로드해도(엑셀/JSON 일괄 업로드는 신규 자산 개별 등록 경로를 타지 않아
// backfillDailyPnlHistory가 걸리지 않는다) 전역 플래그가 이미 소모된 뒤라 새로 들어온 22개 종목은
// 영원히 소급 이력 없이 남는다. 이제 "언제 한 번 실행했는가"가 아니라 "이 자산이 이미 채워졌는가"를
// 기준으로 판단해, 샘플 데이터를 실제 자산으로 교체하거나 엑셀/JSON을 일괄 업로드해도 아직 한 번도
// 채워지지 않은 자산은 다음 로드 때 자동으로 채워진다.
// [버그 수정 - 엑셀 "덮어쓰기" 재업로드 시 일간손익 이중 누적] "이 자산이 이미 채워졌는가"를 처음엔
// asset.id로 판단했는데, 엑셀 업로드는 매번 makeAsset()이 새 id를 발급한다(엑셀 시트에 id 컬럼 자체가
// 없음) - 그래서 같은 포트폴리오를 엑셀로 재업로드할 때마다 모든 종목이 "새 자산"으로 오인되어 소급
// 채우기가 매번 다시 실행됐고, backfillDailyPnlHistory는 dailySnapshots에 값을 "합산(+=)"하므로 재업로드
// 할 때마다 최근 1년 구간의 일간손익이 그대로 한 번씩 더 쌓여 2배·3배로 부풀려졌다(사용자 실측 신고로
// 확인 - 엑셀을 2번 재업로드해 정확히 2배가 됨). 휘발성 id 대신 "소유자+계좌구분+티커"라는 안정적인
// 지문으로 바꿔, 재업로드로 id가 바뀌어도 같은 보유 종목은 "이미 채운 것"으로 정확히 인식한다.
function getBackfillFingerprint(asset) {
  return `${asset.owner}|${asset.accountType}|${sanitizeTicker(asset.ticker).yahooTicker}`;
}
const LS_DAILY_BACKFILL_DONE_FINGERPRINTS = 'sam_daily_backfill_done_fingerprints_v2';
function getBackfillDoneFingerprints() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_DAILY_BACKFILL_DONE_FINGERPRINTS) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch (e) { return new Set(); }
}
// [버그 수정] 원래 Promise.allSettled로 보유 자산 전체(티커마다 직접호출+프록시 5개 경쟁)를 한꺼번에
// 쐈더니, 페이지 로드 직후 실시간 시세 갱신(refreshPricesAndRates)과 같은 CORS 프록시 풀을 두고
// 동시에 자원 경합이 벌어져(이번 세션 내내 관찰된 429/타임아웃과 동일 현상) 실기기 환경에서 완료까지
// 지나치게 오래 걸리거나 일부만 반영된 채 남는 문제가 있었다. (1) 실시간 시세 갱신이 끝난 뒤에
// 시작하고, (2) 자산을 한 번에 하나씩 순차 처리해서 동시 요청 폭주를 줄인다.
async function backfillAllHoldingsDailyPnlHistory() {
  const doneFingerprints = getBackfillDoneFingerprints();
  const targets = state.assets.filter((a) => sanitizeTicker(a.ticker).yahooTicker && num(a.quantity) > 0 && !doneFingerprints.has(getBackfillFingerprint(a)));
  if (targets.length > 0) {
    console.log(`[소급 히스토리 일괄 실행] 대상 ${targets.length}건 (순차 처리 시작):`, targets.map((a) => `${a.name}(${a.owner})`).join(', '));
    for (const a of targets) {
      try {
        await backfillDailyPnlHistory(a);
        doneFingerprints.add(getBackfillFingerprint(a));
        localStorage.setItem(LS_DAILY_BACKFILL_DONE_FINGERPRINTS, JSON.stringify(Array.from(doneFingerprints)));
      } catch (e) {
        console.warn(`[소급 히스토리 일괄 실행 실패] ${a.name}(${a.owner}):`, e);
      }
    }
    console.log('[소급 히스토리 일괄 실행] 전체 완료');
  }
  // [버그 수정 - 총 평가금액 추이 과거 0원 표시] 위 backfillDailyPnlHistory는 자산별 종가만 보고 그날의
  // "변동액(dailyPnL)"만 채울 수 있을 뿐 그날의 "절대 평가금액(cur)"은 알 수 없다(포트폴리오 전체를
  // 봐야 하는 값이라 자산 단위 함수에서는 계산 불가) - 그래서 이미 채워진 종목이라 위 for문을 건너뛰는
  // 날에도(targets.length === 0) 매번 다시 실행해 오늘 날짜를 기준(anchor)으로 재계산해야 한다.
  reconstructHistoricalCurValues();
  // 팝업이 이미 열려 있었다면(드문 경우) 바로 다시 그려서 방금 채운/보정한 값을 즉시 보여준다.
  if (!document.getElementById('dailyPnlModal').classList.contains('hidden')) updateDailyPnlModal();
  if (!document.getElementById('totalValueModal').classList.contains('hidden')) updateTotalValueModal();
  if (!document.getElementById('totalProfitModal').classList.contains('hidden')) updateTotalProfitModal();
}

// [버그 수정 - 총 평가금액 추이 과거 데이터 0원 표시] backfillDailyPnlHistory가 채우는 건 자산별 종가
// 이력에서 뽑아낸 "그날의 변동액(dailyPnL)"뿐이다 - 그 결과 [총 평가금액 추이] 차트(metricKey='cur')는
// 실제로 앱이 켜져 recordDailySnapshot()이 실행된 날짜에만 값이 있고, 그 외 소급 채운 과거 날짜는
// snap.total.cur 기본값 0 그대로 남아 그래프가 뚝뚝 끊겨 보였다([일별 손익 추이]는 dailyPnL만 쓰므로
// 이 문제와 무관했다).
// 해결: 오늘의 실제 총/소유자별 평가금액(현재 state.assets 기준 - 방금 끝난 시세 갱신을 확실히 반영하기
// 위해 매번 새로 계산)을 기준(anchor)으로, 최신 날짜부터 거꾸로 하루씩 훑으며
//   cur[D] = cur[D+1] - dailyPnL[D+1]
// 을 반복 적용해 과거 각 날짜의 절대 평가금액을 재구성한다. 스냅샷 자체가 없던 날(주말/휴장일)도 이
// 재구성 과정에서 dailyPnL 0(변동 없음)인 새 스냅샷을 만들어 cur를 이어붙인다 - 그래야 총 평가금액
// 그래프가 주말마다 0원으로 끊기지 않고 직전 값을 그대로 이어간다(일별 손익 추이 쪽은 0원 표시가
// 원래도 옳으므로 영향 없음). 오늘 날짜 자체는 renderKPIs()가 실시간으로 관리하므로 건드리지 않는다.
const CUR_RECONSTRUCTION_DAYS = 366; // 팝업 최대 기간 탭([1년]=365일)을 여유 있게 덮는다.
// [자산군별 투자금액 추이 팝업] 소유자 단독 역산에서 "소유자×자산군" 역산으로 한 단계 더 세분화했다.
// 가장 세밀한 단위(소유자×자산군)에서 먼저 역산+0원 바닥 처리를 하고, 소유자 합계·전체 합계는 그
// 세분화된 값들을 그대로 더해서 "재계산"한다(따로 역산하지 않음) - 그래야 전체=Σ소유자=Σ(소유자×자산군)
// 3단 계층이 항상 정확히 일치한다(합계 ≠ 신랑+와이프 불일치 버그와 같은 원리를 한 단계 더 확장).
function reconstructHistoricalCurValues() {
  const owners = getDailyPnlOwnerList();
  // anchor: 오늘 시점의 실제 소유자×자산군 평가금액(방금 끝난 시세 갱신을 확실히 반영하기 위해 매번 새로 계산)
  const ownerCategoryCur = {}; // { owner: { category: cur } }
  owners.forEach((o) => { ownerCategoryCur[o] = {}; });
  state.assets.forEach((a) => {
    const curAmount = calcRow(a).curAmount;
    if (!ownerCategoryCur[a.owner]) ownerCategoryCur[a.owner] = {};
    ownerCategoryCur[a.owner][a.category] = (ownerCategoryCur[a.owner][a.category] || 0) + curAmount;
  });

  const todayKey = todayDateStr();
  const cursor = new Date();
  const dateKeys = [];
  for (let i = 0; i < CUR_RECONSTRUCTION_DAYS; i++) {
    dateKeys.push(dateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  // dateKeys[0] === todayKey이고, 뒤로 갈수록 하루씩 과거로 간다(최신 -> 과거 순).

  const runningOC = {}; // { owner: { category: 클램프 전 역산값 } }
  owners.forEach((o) => { runningOC[o] = { ...ownerCategoryCur[o] }; });

  dateKeys.forEach((dateKey, i) => {
    if (i > 0) {
      // 하루 더 과거로 넘어가기 전에, 방금 처리한(하루 더 최신인) 날짜의 변동액만큼을 빼서 이 날짜의
      // 값을 구한다 - runningOC는 이 시점까지 "dateKeys[i-1]의 cur"를 들고 있다.
      const prevSnap = state.dailySnapshots[dateKeys[i - 1]];
      owners.forEach((o) => {
        const ownerCatSnap = prevSnap && prevSnap.byOwnerCategory && prevSnap.byOwnerCategory[o];
        Object.keys(runningOC[o]).forEach((cat) => {
          const catSnap = ownerCatSnap && ownerCatSnap[cat];
          runningOC[o][cat] -= num(catSnap && catSnap.dailyPnL);
        });
      });
    }

    if (dateKey === todayKey) return; // 오늘은 renderKPIs()의 실시간 기록을 그대로 둔다.

    if (!state.dailySnapshots[dateKey]) state.dailySnapshots[dateKey] = { total: { cur: 0, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
    const snap = state.dailySnapshots[dateKey];
    if (!snap.byOwnerCategory) snap.byOwnerCategory = {};
    // [버그 수정 - 1년 전 구간 음수(-) 평가금액] "현재 수량이 과거에도 그대로 있었다"는 근사이다 보니
    // 구간이 길어질수록(특히 1년) 역산 누적값이 실제로는 있을 수 없는 음수까지 내려가는 경우가
    // 있었다 - 평가금액은 개념상 0원 미만이 될 수 없으므로 저장 시점에(가장 세밀한 소유자×자산군
    // 단위에서) 0원 바닥을 씌운다. runningOC 자체는 클램프하지 않고 그대로 다음(더 과거) 날짜 역산의
    // 기준으로 계속 쓴다 - 그래야 화면에 보여줄 값만 보정되고, 재귀 계산 자체는 매일의 실제 dailyPnL
    // 누적을 그대로 반영해 왜곡되지 않는다.
    // [버그 수정 - 합계 ≠ 신랑+와이프 불일치] 상위 단계(소유자 합계/전체 합계)를 각각 따로 역산해
    // 클램프하면 서로 어긋날 수 있다 - 그래서 가장 세밀한 단위만 역산+클램프하고, 그 위 단계는 전부
    // "재계산"(합산)한다. 이러면 전체=Σ소유자=Σ(소유자×자산군)이 항상 정확히 일치한다.
    owners.forEach((o) => {
      if (!snap.byOwner[o]) snap.byOwner[o] = { cur: 0, dailyPnL: 0 };
      if (!snap.byOwnerCategory[o]) snap.byOwnerCategory[o] = {};
      let ownerTotal = 0;
      Object.keys(runningOC[o]).forEach((cat) => {
        const floored = Math.max(0, runningOC[o][cat]);
        if (!snap.byOwnerCategory[o][cat]) snap.byOwnerCategory[o][cat] = { cur: 0, dailyPnL: 0 };
        snap.byOwnerCategory[o][cat].cur = floored;
        ownerTotal += floored;
      });
      snap.byOwner[o].cur = ownerTotal;
    });
    snap.total.cur = owners.reduce((sum, o) => sum + snap.byOwner[o].cur, 0);
  });

  persistDailySnapshots();
}

// [공용 스냅샷 시리즈 빌더] metricKey: 'cur'(평가금액) | 'dailyPnL'(일간손익) - 일별 손익 추이(평가손익
// 모드)와 총 평가금액 추이 팝업이 이 함수를 공유한다. 최근 days일 "전체 달력 날짜"를 하루도 빠짐없이
// 순회하며, 스냅샷이 있는 날은 그 값을, 없는 날(앱을 그날 안 열었거나 아직 기록 전인 경우)은 0으로
// 채운 항목을 명시적으로 만든다.
// [버그 수정 - 최신 날짜 누락] 예전엔 state.dailySnapshots에 실제로 키가 있는 날짜만 나열했다 - 그
// 결과 특정 날짜에 키 자체가 없으면 그 날짜가 X축에서 통째로 빠져(끼어 있어야 할 날짜가 건너뛰어짐)
// "그 날짜 데이터가 안 보인다"는 문제로 이어졌다. 달력 채우기로 X축이 항상 최신 날짜(오늘)까지
// 끊기지 않고 이어지게 한다(막대/라인 어느 쪽으로 그리든 Chart.js의 spanGaps에 기댈 필요 없이, 이
// 달력 채우기 자체가 "끊김 없이 이어서 그리기"의 실질적인 구현이다).
function buildSnapshotSeries(days, metricKey) {
  const todayKey = todayDateStr();
  const result = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (days - 1));
  while (dateKeyFromDate(cursor) <= todayKey) {
    const dateKey = dateKeyFromDate(cursor);
    const snap = state.dailySnapshots[dateKey];
    const byOwnerAmounts = {};
    if (snap) {
      Object.keys(snap.byOwner || {}).forEach((o) => { byOwnerAmounts[o] = snap.byOwner[o][metricKey]; });
    }
    result.push({ date: dateKey, total: snap ? snap.total[metricKey] : 0, byOwnerAmounts });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
function buildUnrealizedPnlSeries(days) { return buildSnapshotSeries(days, 'dailyPnL'); }
// 평가금액(총 평가금액 추이)은 개념상 음수가 될 수 없다 - reconstructHistoricalCurValues가 저장 시점에
// 이미 0원 바닥을 씌우지만, 차트 렌더링 직전에도 한 번 더 방어적으로 클램프해 둔다(일별 손익 추이는
// 하루치 손실이 음수인 게 정상이라 공용 buildSnapshotSeries가 아닌 'cur' 전용 래퍼인 여기서만 처리한다).
// [버그 수정 - 합계 ≠ 신랑+와이프 불일치] 합계(row.total)를 소유자별 값과 따로 클램프하면 두 값이
// 어긋날 수 있다 - 소유자별 값을 먼저 바닥 처리한 뒤, 합계는 그 값들의 합으로 다시 계산해 항상
// "합계 = 신랑 + 와이프"가 성립하도록 한다.
function buildTotalValueSeries(days) {
  const series = buildSnapshotSeries(days, 'cur');
  series.forEach((row) => {
    Object.keys(row.byOwnerAmounts).forEach((o) => { row.byOwnerAmounts[o] = Math.max(0, row.byOwnerAmounts[o]); });
    row.total = Object.values(row.byOwnerAmounts).reduce((sum, v) => sum + v, 0);
  });
  return series;
}

// [총 평가손익 카드 - 누적 평가손익 추이 팝업] 일자별 "절대 평가금액(cur)"이 아니라 "그날의 시세
// 변동분(dailyPnL)"을 선택 기간 시작일부터 누적으로 더해 나간다 - 이미 검증된 buildUnrealizedPnlSeries
// (일별 손익 추이 팝업과 동일 소스)를 그대로 재사용하므로 새로운 이력 추적 없이 바로 만들 수 있다.
// 매입금액(원금) 자체의 과거 이력은 저장하지 않으므로 "그 기간 동안 순수 시세 변동으로 쌓인 손익"만
// 보여준다(중간에 추가 매수/매도로 원금이 바뀌어도 왜곡되지 않는, 증권사 앱의 "기간 수익률" 그래프와
// 같은 개념) - 선택한 기간의 첫날은 항상 0에서 시작해 오늘까지 누적된다.
function buildCumulativeProfitSeries(days) {
  const dailySeries = buildUnrealizedPnlSeries(days);
  const runningByOwner = {};
  let runningTotal = 0;
  return dailySeries.map((row) => {
    runningTotal += row.total;
    const byOwnerAmounts = {};
    Object.keys(row.byOwnerAmounts).forEach((o) => {
      runningByOwner[o] = (runningByOwner[o] || 0) + row.byOwnerAmounts[o];
      byOwnerAmounts[o] = runningByOwner[o];
    });
    return { date: row.date, total: runningTotal, byOwnerAmounts };
  });
}

// 실현손익 시리즈 - 거래내역의 매도 건을 날짜별/소유자별로 집계한다(기간별 실현손익 리포트와 같은
// computePositionsAndRealizedPnL 결과를 재사용). 매도가 없는 날은 자연스럽게 빈 날짜라 달력 채우기를
// 적용하지 않는다(평가손익/평가금액과 달리 "매도 없음=0"이 아니라 "그 날은 집계 대상이 아님"에 가깝다).
function buildRealizedPnlSeries(days) {
  const cutoffKey = daysAgoDateStr(days - 1);
  const { annotated } = computePositionsAndRealizedPnL();
  const sells = annotated.filter((tx) => tx.type === 'sell' && tx.date >= cutoffKey);
  const byDate = {};
  sells.forEach((tx) => {
    if (!byDate[tx.date]) byDate[tx.date] = { date: tx.date, total: 0, byOwnerAmounts: {} };
    const bucket = byDate[tx.date];
    bucket.total += tx.computedRealizedPnL;
    bucket.byOwnerAmounts[tx.owner] = (bucket.byOwnerAmounts[tx.owner] || 0) + tx.computedRealizedPnL;
  });
  return Object.keys(byDate).sort().map((k) => byDate[k]);
}

// [일간평가손익/총평가손익 카드 - 실현손익 배지] buildRealizedPnlSeries와 동일한 소스
// (computePositionsAndRealizedPnL의 annotated 매도 건)를 재사용해 두 카드에 필요한 합계만 뽑아낸다.
// 오늘 실현손익: 매도일이 정확히 오늘인 건만 합산(일간평가손익 카드 - 미실현 계산과는 완전히 별개).
function getTodayRealizedPnL() {
  const today = todayDateStr();
  const { annotated } = computePositionsAndRealizedPnL();
  return annotated
    .filter((tx) => tx.type === 'sell' && tx.date === today)
    .reduce((sum, tx) => sum + tx.computedRealizedPnL, 0);
}
// 총 실현손익: 기간 제한 없이 지금까지의 매도 건 전체를 합산(총평가손익 카드 - 미실현 누적과는 별개).
function getTotalRealizedPnL() {
  const { annotated } = computePositionsAndRealizedPnL();
  return annotated
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + tx.computedRealizedPnL, 0);
}

// [일별 실현손익 항목 제거] 팝업의 [일별 평가손익]/[일별 실현손익] 전환 토글을 없애면서, 이 팝업은
// 항상 일별 평가손익(buildUnrealizedPnlSeries)만 보여준다 - buildRealizedPnlSeries는 더 이상 호출되지
// 않지만, 계산 로직 자체는 그대로 남겨둔다(다른 화면에서 재사용될 가능성을 열어둠).
function buildDailyPnlSeries(days) {
  return buildUnrealizedPnlSeries(days);
}

// [차트 선 색상 고대비 개선과 동일한 방식] 합계/소유자별 라인 색상을 라이트/다크 모드별로 분리한다 -
// 합계=브랜드 보라, 첫 번째 소유자(ownerRank 기준 신랑)=파랑 계열, 두 번째(와이프)=분홍 계열. 다크
// 모드에서는 어두운 배경에서도 또렷하도록 더 밝은 톤을 쓴다.
const SERIES_COLORS_LIGHT = { total: '#4f46e5', owners: ['#0077B6', '#EC4899', '#B8860B', '#1B8A3A'] };
const SERIES_COLORS_DARK = { total: '#818cf8', owners: ['#64D2FF', '#F472B6', '#FFD60A', '#32D74B'] };
function getSeriesColors() {
  return document.documentElement.classList.contains('dark') ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
}

// 자산군 영역 위에서 가장 돋보여야 하는 "총 합계" 라인 색 - 요청하신 대로 흰색/크림색 계열을 쓰되,
// 라이트 모드에서는 카드 배경 자체가 흰색이라 크림색 단독으로는 거의 안 보인다. 그래서 진한 테두리
// 색을 먼저 굵게 깔아 "헤일로"를 만들고 그 위에 밝은 선을 얹는 2겹 방식으로
// 어떤 배경에서도(밝은 카드/어두운 카드) 고대비를 유지한다.
function getTotalLineColor() {
  return document.documentElement.classList.contains('dark') ? '#FFFBEB' : '#FFFDF5';
}
function getTotalLineHaloColor() {
  return document.documentElement.classList.contains('dark') ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.45)';
}

// [일별 손익 추이 Y축 전용 축약 포맷] 기존 fmtKRWShort("1억 2,000만원" 형태)는 다른 화면(KPI 카드 등)
// 여러 곳에서 이미 쓰이고 있어 그대로 두고, 이 차트 Y축에만 더 짧은 "1.2억"/"3천만원"/"5백만원"/"80만원"
// 표기를 쓴다 - 세로로 좁은 축 라벨 공간에 두 자리 단위(억+만)까지 다 넣으면 겹쳐 보인다.
function fmtKRWAxisShort(v) {
  const n = Math.round(num(v));
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs === 0) return '0원';
  if (abs >= 1e8) {
    const eok = Math.round((abs / 1e8) * 10) / 10;
    return `${sign}${Number.isInteger(eok) ? eok : eok.toFixed(1)}억`;
  }
  if (abs >= 1e7) return `${sign}${Math.round(abs / 1e7)}천만원`;
  if (abs >= 1e6) return `${sign}${Math.round(abs / 1e6)}백만원`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4)}만원`;
  return `${sign}${krwFmt.format(abs)}원`;
}

// [툴팁 3초 자동 숨김] Chart.js는 툴팁을 "숨기는 타이머"를 내장하고 있지 않아, 터치/클릭으로 뜬 툴팁이
// 다른 곳을 다시 누르기 전까지 화면에 계속 남아 있었다. setActiveElements([])로 활성 요소를 비우고
// update()하면 프로그램적으로 툴팁을 닫을 수 있다는 점을 이용해, 클릭할 때마다 3초 타이머를 새로
// 걸고(연속 터치 시 자연히 리셋됨) 그 시간이 지나면 자동으로 닫는다.
let dailyPnlTooltipHideTimer = null;
function scheduleDailyPnlTooltipHide(chart) {
  clearTimeout(dailyPnlTooltipHideTimer);
  dailyPnlTooltipHideTimer = setTimeout(() => {
    if (!chart || chart.destroyed) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  }, 3000);
}

// [공용 멀티 라인 차트 렌더러] 합계 + 소유자별 라인을 한 차트에 동시에 그린다 - 일별 손익 추이(평가/
// 실현손익)와 총 평가금액 추이 팝업이 공유한다. chartKey는 charts 레지스트리의 키('dailyPnl'|'totalValue'),
// valueLabelFn(v)은 툴팁/범례에 쓸 금액 포맷터(손익은 부호 있는 fmtSigned, 평가금액은 fmtKRW 등 호출부가
// 넘겨준다).
function renderMultiSeriesLineChart(chartKey, canvasId, msgElId, series, emptyMessage, valueLabelFn) {
  const canvas = document.getElementById(canvasId);
  const msgEl = document.getElementById(msgElId);
  clearTimeout(dailyPnlTooltipHideTimer);
  if (charts[chartKey]) { charts[chartKey].destroy(); charts[chartKey] = null; }

  if (series.length === 0) {
    canvas.classList.add('hidden');
    msgEl.textContent = emptyMessage;
    msgEl.classList.remove('hidden');
    return;
  }
  msgEl.classList.add('hidden');
  canvas.classList.remove('hidden');

  const textColor = chartTextColor();
  const seriesColors = getSeriesColors();
  const owners = getDailyPnlOwnerList();
  const labels = series.map((s) => `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))}`);

  const datasets = [
    {
      label: '합계',
      data: series.map((s) => s.total),
      borderColor: seriesColors.total,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.15,
      order: 0
    },
    ...owners.map((o, idx) => ({
      label: o,
      data: series.map((s) => s.byOwnerAmounts[o] ?? 0),
      borderColor: seriesColors.owners[idx % seriesColors.owners.length],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.15,
      order: idx + 1
    }))
  ];

  charts[chartKey] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false }, // 세 라인이 겹쳐 있어도 같은 날짜의 세 값을 한 번에 툴팁으로 보여준다
      plugins: {
        // 기본 범례를 그대로 쓴다 - 항목을 클릭하면 그 라인만 숨기고 보일 수 있어(Chart.js 내장 동작),
        // 예전의 소유자 필터 탭을 대신한다.
        legend: { display: true, position: 'top', labels: { color: textColor, boxWidth: 10, font: { size: 10 }, padding: 10 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${valueLabelFn(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
        // 0원 기준선을 또렷하게: 손익류 차트는 beginAtZero를 쓰지 않아야(위/아래로 다 있으면 자동으로
        // 0을 지난다) grid 색만 살짝 진하게 유지해서 자연스럽게 강조된다.
        y: { ticks: { color: textColor, font: { size: 10 }, callback: (v) => fmtKRWAxisShort(v) }, grid: { color: 'rgba(148,163,184,0.25)' } }
      }
    }
  });

  // DOM0 스타일(onclick=) 할당은 재렌더링마다 이전 핸들러를 자동으로 덮어써서, addEventListener처럼
  // 모달을 여러 번 열고 닫을 때 리스너가 계속 쌓이는(leak) 문제가 없다.
  canvas.onclick = () => scheduleDailyPnlTooltipHide(charts[chartKey]);
}

function seriesAmountForOwner(entry, owner) {
  return owner === 'all' ? entry.total : (entry.byOwnerAmounts[owner] || 0);
}

function dailyPnlLineColor(v) {
  return v > 0 ? '#ef4444' : (v < 0 ? '#3b82f6' : '#94a3b8');
}

// [사용자 요청: 기존 형태 유지] 소유자 필터(전체(합계)/신랑/와이프) 탭으로 한 번에 한 시리즈만
// 막대그래프로 보여준다(총 평가금액 추이 팝업의 멀티 라인 방식과는 별개로, 이 팝업은 원래 방식 그대로).
function renderDailyPnlChart(series, owner) {
  const canvas = document.getElementById('dailyPnlChart');
  const msgEl = document.getElementById('dailyPnlChartMsg');
  clearTimeout(dailyPnlTooltipHideTimer);
  if (charts.dailyPnl) { charts.dailyPnl.destroy(); charts.dailyPnl = null; }

  if (series.length === 0) {
    canvas.classList.add('hidden');
    msgEl.textContent = dailyPnlPopupType === 'unrealized'
      ? '아직 기록된 일별 평가손익 데이터가 없습니다. 앱을 열 때마다 자동으로 쌓입니다.'
      : '해당 기간에 매도 거래 내역이 없습니다.';
    msgEl.classList.remove('hidden');
    return;
  }
  msgEl.classList.add('hidden');
  canvas.classList.remove('hidden');

  const textColor = chartTextColor();
  const labels = series.map((s) => `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))}`);
  const data = series.map((s) => seriesAmountForOwner(s, owner));
  const colors = data.map((v) => dailyPnlLineColor(v));

  charts.dailyPnl = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => fmtSigned(c.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        // 0원 기준선을 또렷하게: y=0 근처에 grid가 항상 지나가도록 beginAtZero는 쓰지 않고(막대가 위/
        // 아래로 다 있으면 자동으로 0을 지난다) grid 색만 살짝 진하게 유지한다.
        y: { ticks: { color: textColor, font: { size: 10 }, callback: (v) => fmtKRWAxisShort(v) }, grid: { color: 'rgba(148,163,184,0.25)' } }
      }
    }
  });

  // DOM0 스타일(onclick=) 할당은 재렌더링마다 이전 핸들러를 자동으로 덮어써서, addEventListener처럼
  // 모달을 여러 번 열고 닫을 때 리스너가 계속 쌓이는(leak) 문제가 없다.
  canvas.onclick = () => scheduleDailyPnlTooltipHide(charts.dailyPnl);
}

// 차트 하단 요약 - 선택된 기간/소유자 필터 조건에 맞는 "합계"만 보여준다. 전체(합계) 선택 시에는
// 소유자별 합계 + 총 합계를, 특정 소유자 선택 시에는 그 소유자의 합계만 표시한다.
function renderDailyPnlSummary(series) {
  const container = document.getElementById('dailyPnlList');
  if (series.length === 0) { container.innerHTML = ''; return; }

  const owners = getDailyPnlOwnerList();
  const totalSum = series.reduce((acc, s) => acc + s.total, 0);
  const ownerSums = {};
  owners.forEach((o) => { ownerSums[o] = series.reduce((acc, s) => acc + (s.byOwnerAmounts[o] || 0), 0); });

  // ["당월"은 "최근" 접두어가 어색해 그 경우만 문구를 다르게 조합한다 - 다른 기간(3/6/12개월)은
  // 기존처럼 "최근 N개월 기준 합계".]
  const periodBtn = document.querySelector('#dailyPnlModal .daily-pnl-period-btn.active');
  const periodLabel = periodBtn ? periodBtn.textContent.trim() : '';
  const periodSummaryPrefix = periodLabel === '당월' ? '당월 기준 합계' : `최근 ${periodLabel} 기준 합계`;

  const rows = [];
  if (dailyPnlPopupOwner === 'all') {
    owners.forEach((o) => rows.push({ label: `${o} 손익 합계`, amount: ownerSums[o] || 0 }));
    rows.push({ label: '총 손익 합계', amount: totalSum, emphasize: true });
  } else {
    rows.push({ label: `${dailyPnlPopupOwner} 손익 합계`, amount: ownerSums[dailyPnlPopupOwner] || 0, emphasize: true });
  }

  container.innerHTML = `
    <p class="text-[11px] text-slate-400 mb-2">${escapeHtml(periodSummaryPrefix)}</p>
    <div class="space-y-1.5">
      ${rows.map((r) => `
        <div class="flex items-center justify-between text-sm ${r.emphasize ? 'pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 font-semibold' : ''}">
          <span class="text-slate-500 dark:text-slate-400">${escapeHtml(r.label)}</span>
          <span class="${profitColor(r.amount)}">${fmtSigned(r.amount)}</span>
        </div>`).join('')}
    </div>`;
}

function updateDailyPnlModal() {
  const series = buildDailyPnlSeries(dailyPnlPopupDays);
  renderDailyPnlChart(series, dailyPnlPopupOwner);
  renderDailyPnlSummary(series);
}

function renderDailyPnlOwnerTabs() {
  const wrap = document.getElementById('dailyPnlOwnerTabs');
  const tabs = [{ key: 'all', label: '전체(합계)' }, ...getDailyPnlOwnerList().map((o) => ({ key: o, label: o }))];
  wrap.innerHTML = tabs.map((t) => `
    <button type="button" data-pnl-owner="${escapeHtml(t.key)}" class="daily-pnl-owner-btn ${t.key === dailyPnlPopupOwner ? 'active' : ''} text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">${escapeHtml(t.label)}</button>
  `).join('');
  wrap.querySelectorAll('button[data-pnl-owner]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dailyPnlPopupOwner = btn.dataset.pnlOwner;
      renderDailyPnlOwnerTabs();
      updateDailyPnlModal();
    });
  });
}

document.querySelectorAll('#dailyPnlModal .daily-pnl-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    dailyPnlPopupDays = daysSinceMonthsAgoStart(Number(btn.dataset.pnlMonths));
    document.querySelectorAll('#dailyPnlModal .daily-pnl-period-btn').forEach((b) => b.classList.toggle('active', b === btn));
    updateDailyPnlModal();
  });
});

function openDailyPnlModal() {
  dailyPnlPopupType = 'unrealized';
  dailyPnlPopupOwner = 'all';
  dailyPnlPopupDays = daysSinceMonthsAgoStart(1); // [기본 기간 당월] 팝업을 열 때마다 항상 당월부터 보여준다
  document.querySelectorAll('#dailyPnlModal .daily-pnl-period-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.pnlMonths) === 1));
  renderDailyPnlOwnerTabs();
  document.getElementById('dailyPnlModal').classList.remove('hidden');
  pushModalHistoryState();
  updateDailyPnlModal();
}
function closeDailyPnlModal(viaBackButton) {
  document.getElementById('dailyPnlModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('kpiDailyProfitDetailBtn').addEventListener('click', openDailyPnlModal);
document.getElementById('closeDailyPnlModalBtn').addEventListener('click', () => closeDailyPnlModal());

/* ---- 20-1. 총 평가금액 추이 팝업 (총 평가금액 KPI 카드 터치 시) ---- */
let totalValuePopupDays = 180; // 30 | 90 | 180 | 365

function renderTotalValueChart(series) {
  const emptyMessage = '아직 기록된 평가금액 데이터가 없습니다. 앱을 열 때마다 자동으로 쌓입니다.';
  renderMultiSeriesLineChart('totalValue', 'totalValueChart', 'totalValueChartMsg', series, emptyMessage, (v) => fmtKRW(v));
}

// 차트 하단 요약 - 현재(기간 마지막 날) 평가금액과, 기간 시작일 대비 증감을 합계/소유자별로 보여준다.
function renderTotalValueSummary(series) {
  const container = document.getElementById('totalValueList');
  if (series.length === 0) { container.innerHTML = ''; return; }

  const owners = getDailyPnlOwnerList();
  const first = series[0];
  const last = series[series.length - 1];
  const periodBtn = document.querySelector('#totalValueModal .total-value-period-btn.active');
  const periodLabel = periodBtn ? periodBtn.textContent.trim() : '';

  const rows = owners.map((o) => {
    const startAmt = first.byOwnerAmounts[o] || 0;
    const endAmt = last.byOwnerAmounts[o] || 0;
    return { label: o, current: endAmt, diff: endAmt - startAmt };
  });
  rows.push({ label: '합계', current: last.total, diff: last.total - first.total, emphasize: true });

  container.innerHTML = `
    <p class="text-[11px] text-slate-400 mb-2">최근 ${escapeHtml(periodLabel)} 기준 (기간 시작 대비 증감)</p>
    <div class="space-y-1.5">
      ${rows.map((r) => `
        <div class="flex items-center justify-between text-sm ${r.emphasize ? 'pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 font-semibold' : ''}">
          <span class="text-slate-500 dark:text-slate-400">${escapeHtml(r.label)}</span>
          <span class="text-right">
            <span class="font-medium">${fmtKRW(r.current)}</span>
            <span class="ml-1.5 text-xs ${profitColor(r.diff)}">${fmtSigned(r.diff)}</span>
          </span>
        </div>`).join('')}
    </div>`;
}

function updateTotalValueModal() {
  const series = buildTotalValueSeries(totalValuePopupDays);
  renderTotalValueChart(series);
  renderTotalValueSummary(series);
}

document.querySelectorAll('#totalValueModal .total-value-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    totalValuePopupDays = Number(btn.dataset.tvDays);
    document.querySelectorAll('#totalValueModal .total-value-period-btn').forEach((b) => b.classList.toggle('active', b === btn));
    updateTotalValueModal();
  });
});

function openTotalValueModal() {
  totalValuePopupDays = 180;
  document.querySelectorAll('#totalValueModal .total-value-period-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tvDays) === 180));
  document.getElementById('totalValueModal').classList.remove('hidden');
  pushModalHistoryState();
  updateTotalValueModal();
}
function closeTotalValueModal(viaBackButton) {
  document.getElementById('totalValueModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('kpiTotalValueDetailBtn').addEventListener('click', openTotalValueModal);
document.getElementById('closeTotalValueModalBtn').addEventListener('click', () => closeTotalValueModal());
document.getElementById('totalValueModal').addEventListener('click', (e) => {
  if (e.target.id === 'totalValueModal') closeTotalValueModal();
});
document.getElementById('dailyPnlModal').addEventListener('click', (e) => {
  if (e.target.id === 'dailyPnlModal') closeDailyPnlModal();
});

/* ---- 20-1-1. 누적 평가손익 추이 팝업 (총 평가손익 KPI 카드 [세부내용] 터치) ----
 *    총 평가금액 추이 팝업(20-1)과 완전히 같은 패턴(기간 탭 4개, renderMultiSeriesLineChart 공용 렌더러,
 *    3초 툴팁 자동숨김)을 그대로 따르되, 시리즈만 buildCumulativeProfitSeries로 교체했다. -------- */
let totalProfitPopupDays = 180; // 30 | 90 | 180 | 365

function renderTotalProfitChart(series) {
  const emptyMessage = '아직 기록된 평가손익 데이터가 없습니다. 앱을 열 때마다 자동으로 쌓입니다.';
  renderMultiSeriesLineChart('totalProfit', 'totalProfitChart', 'totalProfitChartMsg', series, emptyMessage, (v) => fmtSigned(v));
}

// 차트 하단 요약 - 시리즈 자체가 이미 "선택 기간 첫날=0"부터의 누적값이므로, 마지막(오늘) 값이 곧 그
// 기간 동안의 누적 평가손익이다(일별 손익 추이 팝업의 합계 요약과 같은 스타일로 통일).
function renderTotalProfitSummary(series) {
  const container = document.getElementById('totalProfitList');
  if (series.length === 0) { container.innerHTML = ''; return; }

  const owners = getDailyPnlOwnerList();
  const last = series[series.length - 1];
  const periodBtn = document.querySelector('#totalProfitModal .total-profit-period-btn.active');
  const periodLabel = periodBtn ? periodBtn.textContent.trim() : '';

  const rows = owners.map((o) => ({ label: `${o} 누적 평가손익`, amount: last.byOwnerAmounts[o] || 0 }));
  rows.push({ label: '총 누적 평가손익', amount: last.total, emphasize: true });

  container.innerHTML = `
    <p class="text-[11px] text-slate-400 mb-2">최근 ${escapeHtml(periodLabel)} 기준 누적 합계</p>
    <div class="space-y-1.5">
      ${rows.map((r) => `
        <div class="flex items-center justify-between text-sm ${r.emphasize ? 'pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 font-semibold' : ''}">
          <span class="text-slate-500 dark:text-slate-400">${escapeHtml(r.label)}</span>
          <span class="${profitColor(r.amount)}">${fmtSigned(r.amount)}</span>
        </div>`).join('')}
    </div>`;
}

function updateTotalProfitModal() {
  const series = buildCumulativeProfitSeries(totalProfitPopupDays);
  renderTotalProfitChart(series);
  renderTotalProfitSummary(series);
}

document.querySelectorAll('#totalProfitModal .total-profit-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    totalProfitPopupDays = Number(btn.dataset.tpDays);
    document.querySelectorAll('#totalProfitModal .total-profit-period-btn').forEach((b) => b.classList.toggle('active', b === btn));
    updateTotalProfitModal();
  });
});

function openTotalProfitModal() {
  totalProfitPopupDays = 180;
  document.querySelectorAll('#totalProfitModal .total-profit-period-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tpDays) === 180));
  document.getElementById('totalProfitModal').classList.remove('hidden');
  pushModalHistoryState();
  updateTotalProfitModal();
}
function closeTotalProfitModal(viaBackButton) {
  document.getElementById('totalProfitModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('kpiTotalProfitDetailBtn').addEventListener('click', openTotalProfitModal);
document.getElementById('closeTotalProfitModalBtn').addEventListener('click', () => closeTotalProfitModal());
document.getElementById('totalProfitModal').addEventListener('click', (e) => {
  if (e.target.id === 'totalProfitModal') closeTotalProfitModal();
});

/* ---- 20-2. 환율 추이 모달 (달러자산 총액/적용환율 KPI 카드 터치 시) ----
 *    Yahoo Finance의 USD/KRW 티커(KRW=X)를 종목 상세 차트와 동일한 fetchDailyHistory()로 조회한다.
 *    이 함수는 이미 최대 2년치 일봉을 받아오므로, 기간 버튼은 이 캐시된 배열을 PERIOD_TRADING_DAYS
 *    기준으로 슬라이스만 한다(달력 날짜를 채우는 buildSnapshotSeries 계열과 달리, 원본이 거래일만
 *    있는 배열이라 그 방식을 그대로 재사용할 수 없다 - 종목 상세 차트와 같은 슬라이싱 방식을 쓴다). */
let fxRatePopupPeriod = '6m';   // '1m' | '3m' | '6m' | '1y'
let fxRateFullPoints = [];      // 캐시된 전체(최대 2년) 일별 USD/KRW 종가
let fxRateLoaded = false;       // 모달을 열 때마다 새로 fetch하지 않도록 - 한 번 불러오면 세션 동안 재사용

function renderExchangeRateChart(points) {
  const canvas = document.getElementById('exchangeRateChart');
  const msgEl = document.getElementById('exchangeRateChartMsg');
  if (charts.exchangeRate) { charts.exchangeRate.destroy(); charts.exchangeRate = null; }

  if (points.length === 0) {
    canvas.classList.add('hidden');
    msgEl.textContent = '환율 데이터를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 열어보세요.';
    msgEl.classList.remove('hidden');
    return;
  }
  msgEl.classList.add('hidden');
  canvas.classList.remove('hidden');

  const textColor = chartTextColor();
  const lineColor = getAvgPriceLineColor(); // 종목 상세 차트의 평단가 선과 같은 파란 계열 - 단일 라인에 적당한 대비
  const labels = points.map((p) => `${p.date.getMonth() + 1}/${p.date.getDate()}`);

  charts.exchangeRate = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'USD/KRW',
        data: points.map((p) => p.close),
        borderColor: lineColor,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${fmtNum(ctx.parsed.y, 1)}원` } },
        datalabels: { display: false }
      },
      scales: {
        x: { ticks: { color: textColor, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: textColor, callback: (v) => fmtNum(v, 0) + '원' }, grid: { color: 'rgba(148,163,184,.15)' } }
      }
    }
  });

  // [버그 수정 - 터치 시 금액 툴팁이 안 사라짐] 다른 그래프 팝업(일별 손익 추이/총 평가금액 추이/
  // 자산군별 투자금액 추이)과 동일하게 3초 뒤 자동으로 닫는다 - onclick= 할당이라 재렌더링마다 이전
  // 핸들러를 덮어써서 리스너가 쌓이지 않는다.
  canvas.onclick = () => scheduleDailyPnlTooltipHide(charts.exchangeRate);
}

function renderExchangeRateSummary(points) {
  const container = document.getElementById('exchangeRateSummary');
  if (points.length === 0) { container.innerHTML = ''; return; }
  const closes = points.map((p) => p.close);
  const max = Math.max(...closes);
  const min = Math.min(...closes);
  const avg = closes.reduce((s, v) => s + v, 0) / closes.length;
  const tile = (label, value, colorClass) => `
    <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 text-center">
      <p class="text-[10px] text-slate-400">${label}</p>
      <p class="text-sm font-bold ${colorClass}">${fmtNum(value, 1)}원</p>
    </div>`;
  container.innerHTML = tile('최고', max, 'text-red-500') + tile('최저', min, 'text-blue-500') + tile('평균', avg, 'text-slate-700 dark:text-slate-200');
}

function updateExchangeRateModal() {
  const slice = fxRateFullPoints.slice(-PERIOD_TRADING_DAYS[fxRatePopupPeriod]);
  renderExchangeRateChart(slice);
  renderExchangeRateSummary(slice);
}

async function openExchangeRateModal() {
  document.getElementById('exchangeRateModalCurrent').textContent = `현재 $1 = ${fmtNum(state.exchangeRate, 1)}원`;
  fxRatePopupPeriod = '6m';
  document.querySelectorAll('#exchangeRateModal .fx-rate-period-btn').forEach((b) => b.classList.toggle('active', b.dataset.fxPeriod === '6m'));
  document.getElementById('exchangeRateModal').classList.remove('hidden');
  pushModalHistoryState();

  if (fxRateLoaded) { updateExchangeRateModal(); return; }
  document.getElementById('exchangeRateChart').classList.add('hidden');
  const msgEl = document.getElementById('exchangeRateChartMsg');
  msgEl.textContent = '환율 추이를 불러오는 중...';
  msgEl.classList.remove('hidden');
  document.getElementById('exchangeRateSummary').innerHTML = '';
  try {
    fxRateFullPoints = await fetchDailyHistory('KRW=X');
    fxRateLoaded = true;
  } catch (err) {
    console.warn('[환율 추이] 조회 실패:', err);
    fxRateFullPoints = [];
  }
  // 모달이 로딩 중 닫혔다면(드문 경우) 굳이 다시 그리지 않는다.
  if (!document.getElementById('exchangeRateModal').classList.contains('hidden')) updateExchangeRateModal();
}
function closeExchangeRateModal(viaBackButton) {
  document.getElementById('exchangeRateModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('kpiExchangeRateDetailBtn').addEventListener('click', openExchangeRateModal);
document.getElementById('closeExchangeRateModalBtn').addEventListener('click', () => closeExchangeRateModal());
document.getElementById('exchangeRateModal').addEventListener('click', (e) => {
  if (e.target.id === 'exchangeRateModal') closeExchangeRateModal();
});
document.querySelectorAll('#exchangeRateModal .fx-rate-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    fxRatePopupPeriod = btn.dataset.fxPeriod;
    document.querySelectorAll('#exchangeRateModal .fx-rate-period-btn').forEach((b) => b.classList.toggle('active', b === btn));
    updateExchangeRateModal();
  });
});

