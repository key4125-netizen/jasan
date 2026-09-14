/* -------------------------------------------------------------------------
 * 28. [Daily Valuation] 시세 일봉 레이어 + 메모리 캐시 + 총자산 추이 행 조립
 *    - 네트워크는 이 파일에서만 쓴다(js/23 계산 함수는 네트워크를 모른다). 팝업을 열거나 기간을 바꾸거나,
 *      팝업이 열린 채 시세 갱신이 끝났을 때만 조회한다 - 부팅 · 백그라운드 자동 조회는 추가하지 않는다.
 *    - 캐시는 메모리에만 둔다(LocalStorage · IndexedDB · Cloud에 저장하지 않는다). Risk/MC가 쓰는
 *      riskHistoryCache와 섞지 않는다 - 그쪽은 UTC 날짜를 쓰고, 여기서는 시장 현지 날짜를 쓴다.
 *    - 오늘 값도 이 레이어가 방금 받은 일봉 응답(정규장 기준가가 반영된 오늘 봉)에서만 가져온다.
 *      저장소·동기화로 복원된 regularMarketPrice, 시간외가 섞일 수 있는 currentPrice, 수동 환율은 쓰지 않는다.
 * ---------------------------------------------------------------------- */
const dvSeriesCache = new Map(); // symbol -> dvNormalizeChart 결과

function resetDailyValuationCache() {
  dvSeriesCache.clear();
}

function dvChartUrl(symbol, startDate, nowMs) {
  const period1 = Math.floor(dvDateToUtcMs(startDate) / 1000) - 2 * 86400;
  const period2 = Math.floor(nowMs / 1000) + 86400;
  return `${YAHOO_CHART_API}${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}&events=split`;
}

// 종목 상세 일봉(fetchDailyHistory)과 같은 직접 호출 + CORS 프록시 경쟁. 각 시도가 응답 모양까지 확인해야
// 먼저 도착한 엉뚱한 응답(점검 페이지 등)이 채택되지 않는다.
async function dvFetchChartResult(url) {
  const pick = (data) => {
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result || !Array.isArray(result.timestamp)) throw new Error('일봉 데이터 없음');
    return result;
  };
  const attempts = [
    async () => {
      const res = await fetchWithTimeout(url, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return pick(await safeParseJsonResponse(res));
    },
    ...CORS_PROXIES.map((proxy) => async () => {
      const res = await fetchWithTimeout(proxy.build(url), 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return pick(proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res));
    })
  ];
  return Promise.any(attempts.map((fn) => fn()));
}

// 캐시를 다시 쓸 수 있는가 - 잠정 봉이 있거나, 시장 현지 날짜가 바뀌었거나, 필요한 시작일보다 늦게 받은 경우는
// 다시 받는다. 분할·병합 이벤트가 있는 종목은 애초에 캐시하지 않는다(과거 종가가 다시 조정될 수 있다).
function dvCachedSeriesUsable(entry, startDate, nowMs) {
  if (!entry || !entry.ok) return false;
  if (!entry.requestedStartDate || entry.requestedStartDate > startDate) return false;
  if (entry.dates.some((d) => entry.bars[d].provisional)) return false;
  const now = dvZonedParts(nowMs / 1000, entry.tz);
  return !!now && now.date === entry.marketToday;
}

async function dvEnsureSeries(requests, startDate) {
  const nowMs = Date.now();
  const out = {};
  await Promise.all(requests.map(async ({ symbol, marketKey }) => {
    const cached = dvSeriesCache.get(symbol);
    if (dvCachedSeriesUsable(cached, startDate, nowMs)) { out[symbol] = cached; return; }
    try {
      const result = await dvFetchChartResult(dvChartUrl(symbol, startDate, nowMs));
      const series = dvNormalizeChart(result, { symbol, marketKey, fetchedAtMs: nowMs, requestedStartDate: startDate });
      if (series.ok && series.splits.length === 0) dvSeriesCache.set(symbol, series);
      else dvSeriesCache.delete(symbol);
      out[symbol] = series;
    } catch (e) {
      dvSeriesCache.delete(symbol);
      out[symbol] = { ok: false, symbol, reason: 'fetchFailed' };
    }
  }));
  return out;
}

// 총자산 추이 팝업의 행을 만든다. 자산·거래·스냅샷은 읽기만 한다.
// 반환: { rows, hasLedger } - hasLedger는 거래내역으로 계산하는 자산이 있는지(현금 미연결 안내 여부).
async function loadDailyValuationRows(days) {
  const dates = dvDateList(todayDateStr(), days);
  const startDate = dvAddDays(dates[0], -DV_LOOKBACK_CALENDAR_DAYS);
  const transactions = state.transactions;
  const finalPositions = computePositionsAndRealizedPnL(transactions).positions;
  const classified = state.assets.map((asset) => ({ asset, cls: dvClassifyAsset(asset, finalPositions) }));
  const requests = new Map();
  let needsFx = false;
  classified.forEach(({ cls }) => {
    if (cls.kind === 'ledgerMarket') {
      requests.set(cls.symbol, cls.marketKey);
      requests.set(DV_MARKETS[cls.marketKey].indexSymbol, cls.marketKey);
      if (cls.needsFx) needsFx = true;
    }
    if (cls.kind === 'ledgerUsdCash') needsFx = true;
  });
  if (needsFx) requests.set(DV_FX_SYMBOL, 'FX');
  const seriesBySymbol = await dvEnsureSeries([...requests].map(([symbol, marketKey]) => ({ symbol, marketKey })), startDate);
  const rows = dvBuildRows({
    dates, owners: getDailyPnlOwnerList(), classified, transactions,
    snapshots: state.dailySnapshots, seriesBySymbol, K: DV_K_MISSING_TRADING_DAYS
  });
  return { rows, hasLedger: classified.some(({ cls }) => cls.kind === 'ledgerMarket' || cls.kind === 'ledgerUsdCash') };
}
