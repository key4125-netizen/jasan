/* -------------------------------------------------------------------------
 * 27. [Daily Valuation] 총자산 추이 역사평가 - 순수 계산 (PM 확정 D-1 · D-3 · D-4 · U-A · U-B)
 *    - 날짜 D의 자산값 = 원장을 D일까지만 재생한 수량 × 그 자산 시장의 현지 D일 가격 × (USD 자산이면) 런던 D일 USD/KRW.
 *    - 원화 현금 · 부동산 · 채권 · (원장으로 수량을 알 수 없는) 달러 현금은 D일 이전 가장 최근 스냅샷의
 *      소유자×카테고리 기록값을 이어서 쓴다(마지막 기록값 유지). 첫 기록 이전은 계산하지 않는다.
 *    - 계산할 수 없는 자산이 하나라도 있으면 그 소유자 값은 null이고, 소유자 중 하나라도 null이면 합계도 null이다.
 *      계산 가능한 자산만 골라 더하지 않는다. 계산 불가(null)와 실제 0원(0)은 섞지 않는다.
 *    - 이 파일은 네트워크 · 저장 · 화면을 쓰지 않는다. 시세 일봉은 js/24가 받아서 넘긴다.
 *    - currentPrice · state.exchangeRate · calcRow · 지금 수량을 과거 날짜 값으로 쓰지 않는다.
 *      dailySnapshots는 읽기만 하고 만들거나 고치지 않는다(과거 소급·재구성 함수는 쓰지 않는다).
 * ---------------------------------------------------------------------- */

// [D-4-U2] 평일 시세 결측을 직전 확정값으로 추정하는 최대 거래일 수(주말·확인된 휴장일은 세지 않는다).
const DV_K_MISSING_TRADING_DAYS = 3;
// 조회 창 시작일보다 이만큼 앞선 일봉까지 받는다 - 창 첫날이 주말·연휴·짧은 결측이어도 직전 확정값을 찾을 수 있게.
const DV_LOOKBACK_CALENDAR_DAYS = 21;
const DV_FX_SYMBOL = 'KRW=X';
// [D-4-U1] 시장 현지 날짜 기준. closeHHMM은 실제 정규장 종료 시각이고, yahooRegular*는 Yahoo가 평일 정상 거래일에
// currentTradingPeriod로 내려주는 값이다(실측: KRX는 종료를 15:00으로 내려주지만 실제 종가 체결은 15:30).
// Yahoo 값이 이 평소 형태와 다르면(개장 지연·조기 폐장 같은 특수 거래일일 수 있다) 그날 안에 확정하지 않는다.
const DV_MARKETS = Object.freeze({
  KR: Object.freeze({ tz: 'Asia/Seoul', indexSymbol: '^KS11', closeHHMM: 1530, yahooRegularStartHHMM: 900, yahooRegularEndHHMM: 1500 }),
  US: Object.freeze({ tz: 'America/New_York', indexSymbol: '^GSPC', closeHHMM: 1600, yahooRegularStartHHMM: 930, yahooRegularEndHHMM: 1600 }),
  FX: Object.freeze({ tz: 'Europe/London' })
});
// 스냅샷 byOwnerCategory에서 "마지막 기록값 유지"로 읽는 카테고리 키(js/02 categoryDisplayKey 기준).
const DV_MAINTAINED_KEYS = Object.freeze(['현금', '부동산', '채권']);
const DV_USD_CASH_KEY = '달러';
// [1단계 · KRW 현금 거래기반 전환] 원장이 관리하는 원화 현금을 가려내는 카테고리 키.
// DV_MAINTAINED_KEYS에도 들어 있다 - 원장이 관리하지 않는 원화 현금은 예전처럼 유지형이다.
const DV_KRW_CASH_KEY = '현금';
/* [2단계 · PM 결정 2026-10-01] 스냅샷 기록값이 없는 날에 취득원가로 평가할 수 있는 유지형 자산.
 * 현금('현금' · '달러')은 **대상이 아니다** - 원장이 관리하는 현금은 이미 ledger 분기가 계산하고,
 * 유지형으로 남은 현금은 0단계 · 1단계가 "기존 잔액 보호"로 판정한 것이라 원장 값을 꺼내 쓰면
 * 그 보호를 되돌리는 셈이 된다. 분류(DV_MAINTAINED_KEYS)는 바꾸지 않는다. */
const DV_COST_BASIS_KEYS = Object.freeze(['채권', '부동산']);
// 휴장 판정용 기준지수가 없는 시리즈(환율) 표시.
const DV_NO_HOLIDAY_REF = 'noHolidayRef';
// 소유자 · 합계로 전파하는 상태(확정은 표시하지 않는다). 순서는 화면 안내 순서다.
// [2단계] costBasis - 스냅샷 기록값이 없어 취득원가로 평가한 날. **시장가격이 아니다.**
const DV_STATE_FLAGS = Object.freeze(['provisional', 'estimated', 'maintained', 'closedCarry', 'costBasis']);
const DV_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// epoch초를 시장 타임존의 날짜와 시각(HHMM)으로 바꾼다. 타임존 변환을 못 하는 환경이면 null -
// toISOString(UTC) 날짜로 대신하지 않는다(런던 여름철에는 하루가 밀린다).
function dvZonedParts(epochSeconds, timeZone) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds) || !timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(epochSeconds * 1000));
    const get = (type) => (parts.find((p) => p.type === type) || {}).value;
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    if (!DV_DATE_RE.test(date) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { date, hhmm: hour * 100 + minute };
  } catch (e) {
    return null;
  }
}

// 'YYYY-MM-DD' 달력 날짜끼리의 계산 - 시각이 없는 날짜 문자열이라 UTC 자정으로만 다룬다(타임존 변환이 아니다).
function dvDateToUtcMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function dvAddDays(dateStr, n) {
  return new Date(dvDateToUtcMs(dateStr) + n * 86400000).toISOString().slice(0, 10);
}
function dvIsWeekend(dateStr) {
  const w = new Date(dvDateToUtcMs(dateStr)).getUTCDay();
  return w === 0 || w === 6;
}
// endDate를 포함해 거꾸로 days일 - buildSnapshotSeries와 같은 달력일 축.
function dvDateList(endDate, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(dvAddDays(endDate, -i));
  return out;
}

// [U-A · M2] 오늘 봉을 그날 안에 확정해도 되는가. 셋 다 만족해야 한다.
//   ① Yahoo가 준 오늘 정규장 시간이 그 시장의 평소 형태다(특수 거래일이면 그날은 확정하지 않는다).
//   ② 마지막 정규장 체결 시각(regularMarketTime)이 실제 종료 시각 이후다.
//   ③ 이 응답을 받기 시작한 시각도 실제 종료 시각 이후다.
// 하나라도 불확실하면 false(잠정 유지) - 다음 현지 날짜가 되면 그 봉은 과거 봉으로 확정된다.
function dvIsSameDayCloseConfirmed(meta, marketKey, tz, nowParts) {
  const mk = DV_MARKETS[marketKey];
  if (!mk || !mk.closeHHMM || !meta || !nowParts) return false;
  const regular = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  if (!regular) return false;
  const start = dvZonedParts(regular.start, tz);
  const end = dvZonedParts(regular.end, tz);
  if (!start || !end || start.date !== nowParts.date || end.date !== nowParts.date) return false;
  if (start.hhmm !== mk.yahooRegularStartHHMM || end.hhmm !== mk.yahooRegularEndHHMM) return false;
  const lastTrade = dvZonedParts(meta.regularMarketTime, tz);
  if (!lastTrade || lastTrade.date !== nowParts.date || lastTrade.hhmm < mk.closeHHMM) return false;
  return nowParts.hhmm >= mk.closeHHMM;
}

// Yahoo chart(interval=1d) 응답 하나를 날짜별 종가로 정리한다.
//   opts: { symbol, marketKey: 'KR'|'US'|'FX', fetchedAtMs, requestedStartDate }
// 반환: { ok: true, bars: { 'YYYY-MM-DD': { close, provisional } }, dates, marketToday, firstTradeDate, splits, ... }
//       또는 { ok: false, reason }
function dvNormalizeChart(result, opts) {
  const o = opts || {};
  const fail = (reason) => ({ ok: false, symbol: o.symbol, reason });
  const mk = DV_MARKETS[o.marketKey];
  const meta = (result && result.meta) || {};
  const tz = (typeof meta.exchangeTimezoneName === 'string' && meta.exchangeTimezoneName) || (mk && mk.tz);
  if (!tz) return fail('noTimezone');
  const nowParts = dvZonedParts(o.fetchedAtMs / 1000, tz);
  if (!nowParts) return fail('timezoneUnsupported');
  const timestamps = Array.isArray(result && result.timestamp) ? result.timestamp : [];
  const quote = (result && result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const bars = {};
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
    const parts = dvZonedParts(timestamps[i], tz);
    if (!parts) return fail('timezoneUnsupported');
    if (parts.date > nowParts.date) continue;
    bars[parts.date] = { close, provisional: false };
  }
  const dates = Object.keys(bars).sort();
  if (dates.length === 0) return fail('noBars');
  const last = dates[dates.length - 1];
  if (last === nowParts.date) {
    // 환율은 평일 내내 움직여 "그날 종가"가 런던 날짜가 바뀌어야 정해진다.
    bars[last].provisional = o.marketKey === 'FX' ? true : !dvIsSameDayCloseConfirmed(meta, o.marketKey, tz, nowParts);
  }
  const firstTrade = dvZonedParts(meta.firstTradeDate, tz);
  const splitEvents = (result && result.events && result.events.splits) ? Object.values(result.events.splits) : [];
  const splits = splitEvents
    .map((s) => ({ parts: dvZonedParts(s && s.date, tz), numerator: Number(s && s.numerator), denominator: Number(s && s.denominator) }))
    .filter((s) => s.parts && Number.isFinite(s.numerator) && Number.isFinite(s.denominator) && s.numerator > 0 && s.denominator > 0 && s.numerator !== s.denominator)
    .map((s) => ({ date: s.parts.date, numerator: s.numerator, denominator: s.denominator }));
  return {
    ok: true, symbol: o.symbol, marketKey: o.marketKey, tz, bars, dates,
    marketToday: nowParts.date, firstTradeDate: firstTrade ? firstTrade.date : null,
    requestedStartDate: o.requestedStartDate || null, splits, fetchedAtMs: o.fetchedAtMs
  };
}

// date보다 앞선 마지막 봉 날짜(미래 봉은 절대 쓰지 않는다).
function dvLastBarDateBefore(series, date) {
  const dates = series.dates;
  let lo = 0, hi = dates.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < date) { found = dates[mid]; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

// [D-4] 날짜 D의 가격(또는 환율) 판정.
//   holidayRef: 같은 시장 기준지수 시리즈(휴장 판정) · null(판정 불가) · DV_NO_HOLIDAY_REF(환율 - 휴장 개념 없음)
// 반환: { value: number|null, state: 'confirmed'|'closedCarry'|'estimated'|'provisional'|'unavailable', reason, fromDate }
function dvPriceAt(series, date, holidayRef, K) {
  const unavailable = (reason) => ({ value: null, state: 'unavailable', reason, fromDate: null });
  if (!series || !series.ok) return unavailable((series && series.reason) || 'fetchFailed');
  if (series.firstTradeDate && date < series.firstTradeDate) return unavailable('beforeListing');
  const bar = series.bars[date];
  if (bar) return { value: bar.close, state: bar.provisional ? 'provisional' : 'confirmed', reason: null, fromDate: date };
  const prevDate = dvLastBarDateBefore(series, date);
  if (!prevDate) return unavailable('outOfRange');
  const prev = series.bars[prevDate];
  if (date >= series.marketToday) {
    // 시장 현지로는 아직 그 날짜의 봉이 없다(장 시작 전 · 장중 데이터 없음 · 시장이 아직 그 날짜에 닿지 않음).
    if (dvIsWeekend(date)) return { value: prev.close, state: prev.provisional ? 'provisional' : 'closedCarry', reason: 'weekend', fromDate: prevDate };
    return { value: prev.close, state: 'provisional', reason: 'awaitingSession', fromDate: prevDate };
  }
  let missing = 0;
  for (let d = dvAddDays(prevDate, 1); d <= date; d = dvAddDays(d, 1)) {
    if (dvIsWeekend(d)) continue;
    if (holidayRef === DV_NO_HOLIDAY_REF) { missing++; continue; }
    const refKnows = holidayRef && holidayRef.ok && holidayRef.dates.length > 0
      && d >= holidayRef.dates[0] && d < holidayRef.marketToday;
    if (refKnows && !holidayRef.bars[d]) continue; // 기준지수도 봉이 없다 = 확인된 휴장
    missing++; // 기준지수는 열렸거나(종목만 결측) 기준지수로 확인할 수 없다(휴장으로 단정하지 않는다)
  }
  if (missing === 0) return { value: prev.close, state: 'closedCarry', reason: 'marketClosed', fromDate: prevDate };
  if (missing <= K) return { value: prev.close, state: 'estimated', reason: 'missingShort', fromDate: prevDate };
  return unavailable('missingLong');
}

// [M4] D일보다 뒤(오늘까지)에 분할·병합 이벤트가 있으면 그 날짜 - 조정된 과거 종가와 원장 수량의 기준이 다를 수 있다.
function dvCorporateActionAfter(series, date) {
  if (!series || !series.ok || !Array.isArray(series.splits)) return null;
  const hits = series.splits.filter((s) => s.date > date && s.date <= series.marketToday).map((s) => s.date).sort();
  return hits.length ? hits[hits.length - 1] : null;
}

// [D-3] 스냅샷 날짜 목록(정렬)에서 date 이하 가장 최근 날짜.
function dvLatestSnapshotDate(snapshotDates, date) {
  let lo = 0, hi = snapshotDates.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshotDates[mid] <= date) { found = snapshotDates[mid]; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

/* [PM 결정 2026-09-30 · 최초 거래일 이전 = 0] 거래원장의 가장 이른 거래일. 거래가 없으면 null.
 * 전체 기간 시작일(js/01 daysSinceLedgerStart)과 같은 규칙이다 - YYYY-MM-DD 형식만 세고 origin으로 거르지 않는다.
 * 이 날짜 이전에는 자산이 아직 존재하지 않으므로 총자산이 "계산 불가"가 아니라 실제 0이다. */
function dvLedgerStartDate(transactions) {
  let min = null;
  (transactions || []).forEach((t) => {
    const d = String((t && t.date) || '');
    if (!DV_DATE_RE.test(d)) return;
    if (min === null || d < min) min = d;
  });
  return min;
}

// [D-3] 소유자 한 명의 "마지막 기록값 유지" 합계. 스냅샷은 읽기만 한다.
// 기록이 있는 날인데 그 카테고리 키가 없으면 그날 그 카테고리 자산이 없었다는 기록이라 0이다.
// 기록 자체가 없으면(첫 기록 이전) 계산하지 않는다(null).
function dvMaintainedAt(snapshots, snapshotDates, date, owner, keys) {
  const snapDate = dvLatestSnapshotDate(snapshotDates, date);
  if (!snapDate) return { value: null, state: 'unavailable', reason: 'beforeFirstRecord' };
  const snap = snapshots[snapDate];
  const byOwnerCategory = snap && snap.byOwnerCategory;
  if (!byOwnerCategory || typeof byOwnerCategory !== 'object' || Array.isArray(byOwnerCategory)) {
    return { value: null, state: 'unavailable', reason: 'snapshotWithoutCategory' };
  }
  const cats = byOwnerCategory[owner] || {};
  let value = 0, present = false;
  keys.forEach((k) => {
    const entry = cats[k];
    if (entry && typeof entry === 'object') {
      const cur = Number(entry.cur);
      if (!Number.isFinite(cur)) { present = null; return; }
      if (present !== null) present = true;
      value += cur;
    }
  });
  if (present === null) return { value: null, state: 'unavailable', reason: 'snapshotValueInvalid' };
  return { value, state: present ? 'maintained' : 'confirmed', reason: null };
}

// [U-B] 부분 값들을 하나로 합친다 - 하나라도 null이면 결과는 null(계산 가능한 것만 더하지 않는다).
//   parts: [{ value: number|null, state, reason }]
function dvCombineParts(parts) {
  const flags = new Set();
  const reasons = new Set();
  let total = 0, available = true;
  parts.forEach((p) => {
    if (p.state === 'unavailable' || p.value === null || p.value === undefined) {
      available = false;
      if (p.reason) reasons.add(p.reason);
      return;
    }
    if (DV_STATE_FLAGS.includes(p.state)) flags.add(p.state);
    if (Array.isArray(p.flags)) p.flags.forEach((f) => flags.add(f));
    total += p.value;
  });
  return {
    value: available ? total : null,
    flags: DV_STATE_FLAGS.filter((f) => flags.has(f)),
    reasons: [...reasons].sort()
  };
}

// 두 판정 중 약한 상태를 고른다(가격 × 환율처럼 둘 다 필요한 값).
function dvWeakerState(a, b) {
  const rank = { unavailable: 5, provisional: 4, estimated: 3, maintained: 2, closedCarry: 1, confirmed: 0 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

// [자산 분류] 과거 수량과 가격의 근거가 무엇인지 정한다. 지금 자산 목록(assets master)이 기준이다 -
// 거래만 남아 있는 삭제된 자산은 여기로 들어오지 않으므로 복원되지 않는다.
//   ledgerMarket  : 티커 있음 · 시세 대상 카테고리 · manual 아님 · 원장 최종 수량 = 자산 수량
//   ledgerUsdCash : 달러 현금 · manual 아님 · 원장 최종 수량 = 자산 수량
//   maintained    : 원화 현금 · 부동산 · 채권 · 원장으로 수량을 알 수 없는 달러 현금(마지막 기록값 유지)
//   unavailable   : 시세 대상인데 manual · 원장 없음 · 원장 불일치 · 티커 없음
function dvClassifyAsset(asset, finalPositions) {
  const ticker = String(asset.ticker ?? '').trim();
  const key = categoryDisplayKey(asset);
  if (key === DV_USD_CASH_KEY) {
    if (ticker || asset.positionSource === 'manual') return { kind: 'maintained', key };
    const pos = findLedgerPositionForAsset(asset, finalPositions);
    if (!pos) return { kind: 'maintained', key };
    if (positionValuesDiffer(asset.quantity, pos.quantity)) return { kind: 'unavailable', reason: 'ledgerMismatch' };
    return { kind: 'ledgerUsdCash' };
  }
  /* [1단계 · KRW 현금 거래기반 전환] 원화 현금은 달러 현금과 **같은 4단 판정**을 받는다 - 원장이
   * 관리하는 현금만 ledgerKrwCash가 되고 그 밖에는 예전처럼 스냅샷 유지값(maintained)이다.
   * 달러와 다른 점 한 가지: 수량이 어긋나면 달러는 unavailable(ledgerMismatch)로 그 소유자를
   * 계산 불가로 만들지만, 원화 현금은 **유지형으로 되돌린다** - 0단계 BALANCE_MISMATCH 정책이
   * "기존 자산 잔액을 보호한다"이므로, 사용자가 적어 둔 잔액이 들어 있는 스냅샷 값을 그대로 쓴다.
   * 부동산 · 채권은 이 분기에 들어오지 않는다(이번 단계 범위 밖 - 다음 단계에서 다룬다). */
  if (key === DV_KRW_CASH_KEY) {
    if (ticker || asset.positionSource === 'manual') return { kind: 'maintained', key };
    const cashPos = findLedgerPositionForAsset(asset, finalPositions);
    if (!cashPos) return { kind: 'maintained', key };
    if (positionValuesDiffer(asset.quantity, cashPos.quantity)) return { kind: 'maintained', key };
    return { kind: 'ledgerKrwCash' };
  }
  if (DV_MAINTAINED_KEYS.includes(key)) return { kind: 'maintained', key };
  if (!ticker) return { kind: 'unavailable', reason: 'tickerlessMarketAsset' };
  if (asset.positionSource === 'manual') return { kind: 'unavailable', reason: 'manualMarketAsset' };
  const pos = findLedgerPositionForAsset(asset, finalPositions);
  if (!pos) return { kind: 'unavailable', reason: 'noLedger' };
  if (positionValuesDiffer(asset.quantity, pos.quantity)) return { kind: 'unavailable', reason: 'ledgerMismatch' };
  return {
    kind: 'ledgerMarket',
    symbol: sanitizeTicker(ticker).yahooTicker,
    marketKey: getMarketKeyForTicker(ticker),
    needsFx: asset.currency === 'USD'
  };
}

// [positionsAsOf] D일 이하 거래만 기존 원장 함수에 넘긴다 - 이동평균 · 매도 clamp · 같은 날짜 createdAt 순서는
// 그 함수의 원래 규칙 그대로다. 거래 입력일(createdAt)은 포함 여부를 바꾸지 않는다.
// 원래 배열 순서를 그대로 필터링해 넘긴다(정렬 동률일 때 결과가 전체 계산과 같게).
function dvPositionsAsOfFactory(transactions) {
  const dateList = transactions.map((t) => String(t.date)).sort();
  const cache = new Map();
  return (date) => {
    let lo = 0, hi = dateList.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (dateList[mid] <= date) lo = mid + 1; else hi = mid; }
    if (!cache.has(lo)) cache.set(lo, computePositionsAndRealizedPnL(transactions.filter((t) => String(t.date) <= date)).positions);
    return cache.get(lo);
  };
}

// 총자산 추이 행을 만든다.
//   input: { dates, owners, classified: [{ asset, cls }], transactions, snapshots, seriesBySymbol, K }
// 행: { date, recorded, total, owners: { 소유자: 값|null }, byOwnerAmounts(=owners), flags, ownerFlags, reasons, ownerReasons }
function dvBuildRows(input) {
  const { dates, owners, classified, transactions, snapshots, seriesBySymbol, K } = input;
  const positionsAsOf = dvPositionsAsOfFactory(transactions);
  const snapshotDates = Object.keys(snapshots || {}).filter((d) => DV_DATE_RE.test(d)).sort();
  const ledgerStart = dvLedgerStartDate(transactions);
  const fxSeries = seriesBySymbol[DV_FX_SYMBOL];
  const ownerPlans = owners.map((owner) => {
    const mine = classified.filter((c) => c.asset.owner === owner);
    const hasLedgerUsd = mine.some((c) => c.cls.kind === 'ledgerUsdCash');
    const hasMaintainedUsd = mine.some((c) => c.cls.kind === 'maintained' && c.cls.key === DV_USD_CASH_KEY);
    /* [1단계] 원장이 관리하는 원화 현금이 있으면 스냅샷의 '현금' 합계를 다시 더하지 않는다 -
     * 달러에서 '달러' 키를 빼는 것과 **같은 이유 · 같은 방식**(이중 계상 방지)이다. 원장형과
     * 유지형 원화 현금이 함께 있으면 어느 쪽이 스냅샷에 들어갔는지 가를 수 없어 계산하지 않는다
     * (usdCashMixed와 같은 판단). 원장 원화 현금이 없는 소유자는 예전과 완전히 같다. */
    const hasLedgerKrwCash = mine.some((c) => c.cls.kind === 'ledgerKrwCash');
    const hasMaintainedKrwCash = mine.some((c) => c.cls.kind === 'maintained' && c.cls.key === DV_KRW_CASH_KEY);
    const baseKeys = DV_MAINTAINED_KEYS.filter((k) => !(hasLedgerKrwCash && k === DV_KRW_CASH_KEY));
    return {
      owner, mine, usdMixed: hasLedgerUsd && hasMaintainedUsd,
      krwCashMixed: hasLedgerKrwCash && hasMaintainedKrwCash,
      /* [2단계 · K-1 일반화 · PM 결정 2026-10-01] 1단계에서는 "원장 원화 현금이 있을 때"로만 한정했던
       * 조건을 일반화한다 - 그 소유자에게 **스냅샷에서 읽을 유지형 자산이 하나도 없으면** 스냅샷
       * 조각을 아예 넣지 않는다. 스냅샷이 없다는 이유만으로(beforeFirstRecord) 거래원장 + 역사적
       * 시세로 계산할 수 있는 자산까지 전부 null로 만들지 않기 위함이다. 주식만 가진 소유자가 여기
       * 해당한다. 유지형 자산이 있으면 예전 그대로 스냅샷을 읽는다. maintainedKeys에서 빠진 키
       * (원장 달러 · 원장 원화 현금)는 스냅샷에서 읽지 않으므로 "읽을 자산"에서도 제외한다.
       * DV_MAINTAINED_KEYS 정의는 바꾸지 않는다. */
      hasSnapshotBackedAsset: mine.some((c) => c.cls.kind === 'maintained'
        && (hasLedgerUsd ? [...baseKeys] : [...baseKeys, DV_USD_CASH_KEY]).includes(c.cls.key)),
      maintainedKeys: hasLedgerUsd ? [...baseKeys] : [...baseKeys, DV_USD_CASH_KEY]
    };
  });
  return dates.map((date) => {
    const positions = positionsAsOf(date);
    /* [PM 결정 2026-09-30] 최초 거래일 이전 = 자산이 아직 존재하지 않는 날 = 실제 0.
     * 예전엔 첫 스냅샷 이전이라는 이유로 dvMaintainedAt이 beforeFirstRecord(null)를 내고 U-B가 그것을 합계까지
     * 전파해 "계산할 수 없는 날"이 됐다. 원장에 거래가 하나라도 있으면 그 최초 거래일 이전은 보유 자산이 없던 날이
     * 확실하므로 0으로 본다. 거래가 하나도 없으면(원장 자체가 없으면) 최초 거래일을 알 수 없어 기존 판정을 그대로 쓴다.
     * 최초 거래일 당일부터는 기존 계산(스냅샷 유지 · 시세 · U-B)을 한 줄도 바꾸지 않는다. */
    const beforeLedger = ledgerStart !== null && date < ledgerStart;
    const ownerValues = {}, ownerFlags = {}, ownerReasons = {};
    const ownerParts = [];
    ownerPlans.forEach((plan) => {
      // 최초 거래일 이전이면 스냅샷 · 시세를 보지 않고 0 하나로 끝낸다(아래 기존 계산은 그대로 둔다).
      /* [2단계] 스냅샷 조각을 넣을지 세 갈래로 가른다.
       *   · 읽을 유지형 자산이 없다 → 넣지 않는다(K-1 일반화).
       *   · 스냅샷 기록값이 있다 → 그 값을 쓴다(**1순위**. 취득원가로 덮어쓰지 않는다 - PM 지시 8).
       *   · 그 날짜 이하 스냅샷이 아예 없다(beforeFirstRecord) → 조각을 빼고, 아래에서 유지형 자산마다
       *     취득원가 fallback을 따로 넣는다. 스냅샷이 있는데 형식 · 값이 깨진 경우
       *     (snapshotWithoutCategory · snapshotValueInvalid)는 예전 그대로 null을 전파한다 -
       *     "기록이 없다"와 "기록이 깨졌다"는 다른 상태다. */
      const maintainedPart = (beforeLedger || !plan.hasSnapshotBackedAsset) ? null
        : dvMaintainedAt(snapshots, snapshotDates, date, plan.owner, plan.maintainedKeys);
      const costBasisFallback = !!maintainedPart && maintainedPart.value === null
        && maintainedPart.reason === 'beforeFirstRecord';
      const parts = beforeLedger ? [{ value: 0, state: 'confirmed' }]
        : ((maintainedPart && !costBasisFallback) ? [maintainedPart] : []);
      if (!beforeLedger && plan.usdMixed) parts.push({ value: null, state: 'unavailable', reason: 'usdCashMixed' });
      if (!beforeLedger && plan.krwCashMixed) parts.push({ value: null, state: 'unavailable', reason: 'krwCashMixed' });
      if (!beforeLedger) plan.mine.forEach(({ asset, cls }) => {
        if (cls.kind === 'maintained') {
          /* [2단계] 스냅샷 기록값이 있으면 그 합계에 이미 들어 있으므로 아무것도 더하지 않는다.
           * 기록이 없는 날만 취득원가로 채운다 - 채권 · 부동산만 대상이다(DV_COST_BASIS_KEYS).
           * 현금은 대상이 아니라 예전처럼 스냅샷이 없으면 계산하지 않는다. */
          if (!costBasisFallback) return;
          if (!DV_COST_BASIS_KEYS.includes(cls.key)) {
            parts.push({ value: null, state: 'unavailable', reason: 'beforeFirstRecord' });
            return;
          }
          const cb = dvCostBasisAt(asset, cls, positions, date);
          if (cb.value === null) { parts.push({ value: null, state: 'unavailable', reason: cb.reason }); return; }
          // 취득원가는 시장가격이 아니다 - costBasis 상태로 구분해 화면이 그대로 말할 수 있게 한다.
          parts.push(cb.value === 0 ? { value: 0, state: 'confirmed' } : { value: cb.value, state: 'costBasis' });
          return;
        }
        if (cls.kind === 'unavailable') { parts.push({ value: null, state: 'unavailable', reason: cls.reason }); return; }
        const pos = findLedgerPositionForAsset(asset, positions);
        const qty = pos ? pos.quantity : 0;
        if (!(qty > 0)) { parts.push({ value: 0, state: 'confirmed' }); return; } // 그날 보유하지 않았다 = 실제 0
        // 달러 현금은 가격이 1(수량 = 달러 금액)이라 환율만 필요하다.
        let price = 1, state = 'confirmed';
        if (cls.kind === 'ledgerMarket') {
          const series = seriesBySymbol[cls.symbol];
          const blockedBy = dvCorporateActionAfter(series, date);
          if (blockedBy) { parts.push({ value: null, state: 'unavailable', reason: 'corporateActionUnverified' }); return; }
          const indexSeries = seriesBySymbol[DV_MARKETS[cls.marketKey].indexSymbol];
          const p = dvPriceAt(series, date, indexSeries && indexSeries.ok ? indexSeries : null, K);
          if (p.value === null) { parts.push({ value: null, state: 'unavailable', reason: p.reason }); return; }
          price = p.value; state = p.state;
        }
        if (cls.kind === 'ledgerUsdCash' || cls.needsFx) {
          const fx = dvPriceAt(fxSeries, date, DV_NO_HOLIDAY_REF, K);
          if (fx.value === null) { parts.push({ value: null, state: 'unavailable', reason: 'fx:' + fx.reason }); return; }
          const flags = [state, fx.state].filter((s) => DV_STATE_FLAGS.includes(s));
          parts.push({ value: qty * price * fx.value, state: dvWeakerState(state, fx.state), flags });
          return;
        }
        parts.push({ value: qty * price, state });
      });
      const combined = dvCombineParts(parts);
      ownerValues[plan.owner] = combined.value;
      ownerFlags[plan.owner] = combined.flags;
      ownerReasons[plan.owner] = combined.reasons;
      ownerParts.push({ value: combined.value, state: combined.value === null ? 'unavailable' : 'confirmed', flags: combined.flags, reason: combined.reasons[0] || null });
    });
    const total = ownerParts.length ? dvCombineParts(ownerParts) : { value: null, flags: [], reasons: ['noOwners'] };
    const reasons = new Set(total.reasons);
    Object.values(ownerReasons).forEach((list) => list.forEach((r) => reasons.add(r)));
    return {
      date,
      recorded: Object.values(ownerValues).some((v) => v !== null) || total.value !== null,
      total: total.value,
      owners: ownerValues,
      byOwnerAmounts: ownerValues,
      flags: total.flags,
      ownerFlags,
      reasons: [...reasons].sort(),
      ownerReasons
    };
  });
}

// [일별 손익 · PM 확정 U1=C · U2] 거래 한 건의 원화 환산 환율 - 원장 함수(computePositionsAndRealizedPnL)와 같은 규칙이다
// (달러 거래는 적용 환율, 비어 있으면 원장과 같은 기본값 · 원화 거래는 1).
function dvTradeRate(tx, defaultTradeRate) {
  if (tx.currency !== 'USD') return 1;
  return num(tx.appliedRate) || defaultTradeRate;
}

// [일별 손익 · U1=C · U2] 포지션 하나의 D일 손익(원화). 매수 · 매도 대금 자체는 손익이 아니다.
//   손익 = D일 수량 × D일 단위평가(가격 × 환율) − D−1일 수량 × D−1일 단위평가 − 당일 매수대금 + 당일 매도대금
//   매매대금 = 수량 × 체결가 × 적용환율. 수수료는 빼지 않는다(U2). 당일 거래는 원장과 같은 순서로 다시 재생해 매도 수량을
//   원장과 똑같이 그 시점 보유수량으로 제한한다 - 끝 수량(endQty)이 원장의 D일 수량과 같은지는 호출부가 확인한다.
//   input: { qtyPrev, unitPrev, qtyCur, unitCur, trades: [{ type: 'buy'|'sell', quantity, price, rate }] }
function dvPositionDailyPnl(input) {
  const { qtyPrev, unitPrev, qtyCur, unitCur, trades } = input;
  let running = qtyPrev > 0 ? qtyPrev : 0;
  let flow = 0;
  (trades || []).forEach((t) => {
    if (t.type === 'buy') {
      running += t.quantity;
      flow -= t.quantity * t.price * t.rate;
    } else {
      const sold = Math.min(t.quantity, running);
      running = Math.max(0, running - sold);
      flow += sold * t.price * t.rate;
    }
  });
  const endValue = qtyCur > 0 ? qtyCur * unitCur : 0;
  const startValue = qtyPrev > 0 ? qtyPrev * unitPrev : 0;
  return { value: endValue - startValue + flow, endQty: running };
}

/* [2단계 · PM 결정 2026-10-01] 기준일 D의 취득원가. 값을 만들지 않고 **기존 두 원천 중 하나를 고를 뿐**이다.
 *   ① 기준일 원장 포지션이 있으면 pos.totalCost - 매입 수수료 포함 · 매도 반영 · 잔존 포지션 기준이며
 *      dvPositionsAsOfFactory가 "D 이하 거래"만 재생하므로 그 자체로 기준일 값이다(재계산하지 않는다).
 *   ② 포지션이 없고 채권이면 resolveBondHolding(...)의 MANUAL purchaseAmount(사용자가 확정한 매입금액).
 *      매입일(holding.purchaseDate)이 있을 때만, 그리고 D가 그 날 이후일 때만 쓴다 - 매입 전 날짜에
 *      금액을 만들어내지 않는다. 매입일이 없으면 날짜를 가를 수 없어 쓰지 않는다.
 *   ③ 그 밖에는 null. **asset.quantity × asset.buyPrice는 쓰지 않는다** - 금액 모드에서는 buyPrice가 1,
 *      채권 수량 모드에서는 액면 1만원당 가격, 미입력이면 0이라 의미가 갈린다(PM 지시 4-3).
 * 반환: { value: number|null, reason: string|null } */
function dvCostBasisAt(asset, cls, positions, date) {
  const pos = findLedgerPositionForAsset(asset, positions);
  if (pos) {
    if (!(pos.quantity > 0)) return { value: 0, reason: null }; // 그날 보유하지 않았다 = 실제 0
    const cost = num(pos.totalCost);
    if (Number.isFinite(cost) && cost > 0) return { value: cost, reason: null };
    return { value: null, reason: 'costBasisUnavailable' };
  }
  if (cls.key === '채권' && typeof lookupBondMasterFacts === 'function' && typeof resolveBondHolding === 'function') {
    const facts = lookupBondMasterFacts(asset.ticker, asset.id);
    const record = facts && facts.record;
    const held = record ? resolveBondHolding(record, positions) : null;
    if (held && held.source === 'MANUAL' && Number.isFinite(num(held.purchaseAmount)) && num(held.purchaseAmount) > 0) {
      const bought = String((record.holding && record.holding.purchaseDate) || '');
      if (DV_DATE_RE.test(bought)) {
        if (date < bought) return { value: 0, reason: null }; // 매입 전 날짜는 보유하지 않았다 = 실제 0
        return { value: num(held.purchaseAmount), reason: null };
      }
    }
  }
  return { value: null, reason: 'costBasisUnavailable' };
}

// 원장 포지션 맵에서 자산과 같은 대상의 { key, pos } - findLedgerPositionForAsset(js/06)와 같은 판정 · 같은 순서다.
function dvFindLedgerEntry(asset, positions) {
  const hit = Object.entries(positions || {}).find(([, p]) => assetMatchesLedgerIdentity(asset, p));
  return hit ? { key: hit[0], pos: hit[1] } : null;
}

// [일별 손익 추이 · U1=C · U2 · U3 · U4] 날짜별 일별 손익 행을 만든다. 총자산 행(dvBuildRows)과 같은 모양이라 같은 렌더러 규칙을 쓴다.
//   input: { dates, owners, classified, transactions, seriesBySymbol, K, defaultTradeRate }
//   - 원장 자산(시세 종목 · 원장 달러 현금)만 손익을 만든다. 원화 현금 · 부동산 · 채권은 시세가 없어 0이다(기존 앱과 같다).
//     이 값들의 기록값을 쓰지 않으므로 일별 손익은 dailySnapshots를 읽지 않는다.
//   - 원장으로 수량을 알 수 없는 달러 현금은 과거 환율 손익을 정확히 계산할 수 없어 계산 불가다(U3). 스냅샷에는 원화 금액만
//     있고 그때 적용된 환율이 없어 달러 수량을 되돌릴 수 없다 - 추정 환율로 나눠 만들지 않는다.
//   - 계산 불가 자산이 하나라도 있는 소유자는 null, 소유자 중 하나라도 null이면 합계도 null이다(U4 = U-B).
//   - D−1은 달력 전날이다. 주말 · 휴장일은 직전 종가 유지라 가격 손익이 0이고, 다음 거래일 손익이 직전 거래일 종가 대비가 된다.
function dvBuildDailyPnlRows(input) {
  const { dates, owners, classified, transactions, seriesBySymbol, K, defaultTradeRate } = input;
  const positionsAsOf = dvPositionsAsOfFactory(transactions);
  const fxSeries = seriesBySymbol[DV_FX_SYMBOL];
  const txByDate = new Map();
  transactions.forEach((t) => {
    const d = String(t.date);
    if (!txByDate.has(d)) txByDate.set(d, []);
    txByDate.get(d).push(t);
  });
  // 원장 함수는 날짜 → 입력 시각(createdAt) 순으로 안정 정렬한다 - 같은 날짜 안의 순서도 똑같이 맞춘다.
  txByDate.forEach((list) => list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  const ownerAssets = owners.map((owner) => ({ owner, mine: classified.filter((c) => c.asset.owner === owner) }));

  // 그날 단위평가(가격 × 환율)와 그 판정 상태들. 하나라도 계산 불가면 사유를 돌려준다.
  const unitAt = (cls, date) => {
    let unit = 1;
    const states = [];
    if (cls.kind === 'ledgerMarket') {
      const indexSeries = seriesBySymbol[DV_MARKETS[cls.marketKey].indexSymbol];
      const p = dvPriceAt(seriesBySymbol[cls.symbol], date, indexSeries && indexSeries.ok ? indexSeries : null, K);
      if (p.value === null) return { unit: null, reason: p.reason };
      unit = p.value;
      states.push(p.state);
    }
    if (cls.kind === 'ledgerUsdCash' || cls.needsFx) {
      const fx = dvPriceAt(fxSeries, date, DV_NO_HOLIDAY_REF, K);
      if (fx.value === null) return { unit: null, reason: 'fx:' + fx.reason };
      unit *= fx.value;
      states.push(fx.state);
    }
    return { unit, states };
  };

  return dates.map((date) => {
    const prevDate = dvAddDays(date, -1);
    const posCur = positionsAsOf(date);
    const posPrev = positionsAsOf(prevDate);
    const dayTrades = txByDate.get(date) || [];
    const ownerValues = {}, ownerFlags = {}, ownerReasons = {};
    const ownerParts = [];
    ownerAssets.forEach(({ owner, mine }) => {
      const parts = [];
      mine.forEach(({ asset, cls }) => {
        if (cls.kind === 'maintained') {
          if (cls.key === DV_USD_CASH_KEY) parts.push({ value: null, state: 'unavailable', reason: 'usdCashNoLedger' });
          else parts.push({ value: 0, state: 'confirmed' }); // 원화 현금 · 부동산 · 채권 - 시세가 없어 손익 0
          return;
        }
        if (cls.kind === 'unavailable') { parts.push({ value: null, state: 'unavailable', reason: cls.reason }); return; }
        const cur = dvFindLedgerEntry(asset, posCur);
        const prev = dvFindLedgerEntry(asset, posPrev);
        const qtyCur = cur ? cur.pos.quantity : 0;
        const qtyPrev = prev ? prev.pos.quantity : 0;
        const trades = cur ? dayTrades.filter((t) => transactionIdentityKey(t) === cur.key) : [];
        // 전날도 그날도 보유하지 않았고 그날 거래도 없다 = 실제 손익 0
        if (!(qtyCur > 0) && !(qtyPrev > 0) && trades.length === 0) { parts.push({ value: 0, state: 'confirmed' }); return; }
        // [M4] 전날 이후 분할 · 병합이 있으면 전날 종가와 원장 수량의 기준이 다를 수 있다 - 그날 손익을 계산하지 않는다.
        if (cls.kind === 'ledgerMarket' && dvCorporateActionAfter(seriesBySymbol[cls.symbol], prevDate)) {
          parts.push({ value: null, state: 'unavailable', reason: 'corporateActionUnverified' });
          return;
        }
        const states = [];
        let unitCur = null, unitPrev = null;
        if (qtyCur > 0) {
          const u = unitAt(cls, date);
          if (u.unit === null) { parts.push({ value: null, state: 'unavailable', reason: u.reason }); return; }
          unitCur = u.unit;
          states.push(...u.states);
        }
        if (qtyPrev > 0) {
          const u = unitAt(cls, prevDate);
          if (u.unit === null) { parts.push({ value: null, state: 'unavailable', reason: u.reason }); return; }
          unitPrev = u.unit;
          states.push(...u.states);
        }
        const r = dvPositionDailyPnl({
          qtyPrev, unitPrev, qtyCur, unitCur,
          trades: trades.map((t) => ({ type: t.type, quantity: t.quantity, price: t.price, rate: dvTradeRate(t, defaultTradeRate) }))
        });
        // 다시 재생한 끝 수량이 원장의 그날 수량과 다르면 어느 쪽이 맞는지 알 수 없다 - 계산하지 않는다.
        if (positionValuesDiffer(r.endQty, qtyCur)) { parts.push({ value: null, state: 'unavailable', reason: 'ledgerReplayMismatch' }); return; }
        parts.push({
          value: r.value,
          state: states.reduce((acc, s) => dvWeakerState(acc, s), 'confirmed'),
          flags: states.filter((s) => DV_STATE_FLAGS.includes(s))
        });
      });
      const combined = dvCombineParts(parts);
      ownerValues[owner] = combined.value;
      ownerFlags[owner] = combined.flags;
      ownerReasons[owner] = combined.reasons;
      ownerParts.push({ value: combined.value, state: combined.value === null ? 'unavailable' : 'confirmed', flags: combined.flags, reason: combined.reasons[0] || null });
    });
    const total = ownerParts.length ? dvCombineParts(ownerParts) : { value: null, flags: [], reasons: ['noOwners'] };
    const reasons = new Set(total.reasons);
    Object.values(ownerReasons).forEach((list) => list.forEach((r) => reasons.add(r)));
    return {
      date,
      recorded: Object.values(ownerValues).some((v) => v !== null) || total.value !== null,
      total: total.value,
      owners: ownerValues,
      byOwnerAmounts: ownerValues,
      flags: total.flags,
      ownerFlags,
      reasons: [...reasons].sort(),
      ownerReasons
    };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DV_K_MISSING_TRADING_DAYS, DV_LOOKBACK_CALENDAR_DAYS, DV_FX_SYMBOL, DV_MARKETS, DV_MAINTAINED_KEYS, DV_NO_HOLIDAY_REF,
    dvZonedParts, dvAddDays, dvIsWeekend, dvDateList, dvIsSameDayCloseConfirmed, dvNormalizeChart,
    dvLastBarDateBefore, dvPriceAt, dvCorporateActionAfter, dvLatestSnapshotDate, dvMaintainedAt, dvCombineParts, dvWeakerState,
    dvPositionDailyPnl
  };
}
