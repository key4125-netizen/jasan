/* -------------------------------------------------------------------------
 * 28. [Daily Valuation] 시세 일봉 레이어 + 메모리 캐시 + 총자산 추이 · 일별 손익 추이 행 조립(두 팝업이 같은 입력 · 같은 캐시)
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

// [두 팝업 공용 · 중복 조회 방지] 오늘 봉이 아직 확정되지 않은 시세도 이 시간 안에는 다시 쓴다 - 두 팝업을 번갈아 열거나
// 기간을 바꿀 때 같은 일봉을 곧바로 다시 받지 않기 위함이다. 시세 갱신이 끝난 뒤의 재계산(fresh)은 항상 새로 받는다(U-A).
const DV_PROVISIONAL_REUSE_MS = 60000;

// 캐시를 다시 쓸 수 있는가 - 시장 현지 날짜가 바뀌었거나 필요한 시작일보다 늦게 받은 경우는 다시 받는다.
// 오늘 봉이 확정돼 있으면 그대로 쓴다. 오늘 봉이 없거나 잠정이면(장 시작 전 · 장중 · 종가 확인 전) fresh가 아니고
// 받은 지 DV_PROVISIONAL_REUSE_MS 안일 때만 쓴다 - 예전엔 오늘 봉이 아직 없던 응답을 그날 내내 다시 써서, 장이 열린 뒤에도
// 전날 종가를 오늘 잠정값으로 보여줄 수 있었다. 분할·병합 이벤트가 있는 종목은 애초에 캐시하지 않는다(과거 종가가 다시 조정될 수 있다).
function dvCachedSeriesUsable(entry, startDate, nowMs, fresh) {
  if (!entry || !entry.ok) return false;
  if (!entry.requestedStartDate || entry.requestedStartDate > startDate) return false;
  const now = dvZonedParts(nowMs / 1000, entry.tz);
  if (!now || now.date !== entry.marketToday) return false;
  const todayBar = entry.bars[entry.marketToday];
  if (todayBar && !todayBar.provisional) return true;
  const age = nowMs - entry.fetchedAtMs;
  return !fresh && Number.isFinite(age) && age >= 0 && age < DV_PROVISIONAL_REUSE_MS;
}

async function dvEnsureSeries(requests, startDate, opts) {
  const nowMs = Date.now();
  const fresh = !!(opts && opts.fresh);
  const out = {};
  await Promise.all(requests.map(async ({ symbol, marketKey }) => {
    const cached = dvSeriesCache.get(symbol);
    if (dvCachedSeriesUsable(cached, startDate, nowMs, fresh)) { out[symbol] = cached; return; }
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

// [두 팝업 공용 입력] 총자산 추이와 일별 손익 추이가 같은 날짜 축 · 같은 자산 분류 · 같은 시세(같은 캐시)를 쓰도록 한 곳에서 모은다.
// 자산·거래는 읽기만 한다. 조회 시작은 창 첫날보다 21일 앞서므로 일별 손익이 쓰는 첫날의 전날(D−1) 시세도 이 범위 안에 있다.
async function dvLoadValuationInputs(days, opts) {
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
  const seriesBySymbol = await dvEnsureSeries([...requests].map(([symbol, marketKey]) => ({ symbol, marketKey })), startDate, opts);
  return {
    dates, classified, transactions, seriesBySymbol,
    // 거래내역으로 계산하는 자산이 있는지(현금 미연결 안내) · 시세가 없는 원화 현금/부동산/채권이 있는지(일별 손익 안내)
    hasLedger: classified.some(({ cls }) => cls.kind === 'ledgerMarket' || cls.kind === 'ledgerUsdCash'),
    hasMaintained: classified.some(({ cls }) => cls.kind === 'maintained' && cls.key !== DV_USD_CASH_KEY)
  };
}

// 총자산 추이 팝업의 행을 만든다. 스냅샷은 원화 현금 · 부동산 · 채권의 마지막 기록값 유지(D-3)에만 읽는다.
// 반환: { rows, hasLedger }
async function loadDailyValuationRows(days, opts) {
  const input = await dvLoadValuationInputs(days, opts);
  const rows = dvBuildRows({
    dates: input.dates, owners: getDailyPnlOwnerList(), classified: input.classified, transactions: input.transactions,
    snapshots: state.dailySnapshots, seriesBySymbol: input.seriesBySymbol, K: DV_K_MISSING_TRADING_DAYS
  });
  return { rows, hasLedger: input.hasLedger };
}

// 일별 손익 추이 팝업의 행을 만든다(U1=C). 스냅샷을 읽지 않는다 - 원장 자산의 가격 · 환율 변화와 당일 매매 체결가 차이만 손익이다.
// 반환: { rows, hasLedger, hasMaintained }
async function loadDailyPnlRows(days, opts) {
  const input = await dvLoadValuationInputs(days, opts);
  const rows = dvBuildDailyPnlRows({
    dates: input.dates, owners: getDailyPnlOwnerList(), classified: input.classified, transactions: input.transactions,
    seriesBySymbol: input.seriesBySymbol, K: DV_K_MISSING_TRADING_DAYS, defaultTradeRate: DEFAULT_LEGACY_FX_RATE
  });
  return { rows, hasLedger: input.hasLedger, hasMaintained: input.hasMaintained };
}
