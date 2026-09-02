/* -------------------------------------------------------------------------
 * 11. 테이블 렌더링 (정렬 + 필터 반영)
 * ---------------------------------------------------------------------- */
// 기본 정렬(테이블 헤더를 눌러 별도 정렬을 지정하지 않았을 때) 우선순위 규칙.
// 소유자: 신랑 -> 와이프 -> 그 외(공동 등) / 국내·해외: 해외 -> 국내 / 자산군: 주식 -> ETF -> 채권 -> 현금 -> 부동산.
// 목록 정렬과 그룹 보기(소유자별/국내외별/자산군별) 토글의 그룹 순서가 항상 같은 감각으로 보이도록
// renderGroupedRows()의 그룹 정렬에서도 이 랭크 함수들을 그대로 재사용한다.
const OWNER_RANK = { '신랑': 0, '와이프': 1 };
const DOMESTIC_RANK = { '해외': 0, '국내': 1 };
const CATEGORY_RANK = { '주식': 0, 'ETF': 1, '채권': 2, '현금': 3, '부동산': 4 };
function ownerRank(owner) { return OWNER_RANK[owner] ?? 2; }
function domesticRank(isDomestic) { return DOMESTIC_RANK[isDomestic] ?? 2; }
function categoryRank(category) { return CATEGORY_RANK[category] ?? 5; }

// 채권/현금/부동산(NON_TRADABLE_CATEGORIES)은 소유자·지역과 무관하게 항상 목록 맨 아래로 보낸다.
// 일반 거래 가능 자산(주식/ETF)은 기존처럼 소유자→국내/해외→자산군 순으로 정렬하지만, 이 묶음
// 안에서는 지역보다 자산군을 먼저 비교한다 - 그렇지 않으면 "국채"(국내)가 "달러"(해외로 분류되는
// 현금성 자산)보다 뒤로 밀려서 채권(CATEGORY_RANK상 현금보다 앞순위)인데도 화면엔 늦게 보이는
// 문제가 있었다.
// [금액순 정렬 추가] 사용자가 열 헤더를 클릭해 직접 정렬하지 않은 기본 상태에서의 정렬 순서.
// 기존 "채권/현금/부동산은 항상 맨 아래" 규칙(NON_TRADABLE_CATEGORIES 기반 aBottom 분리)은 그대로
// 유지하되, 그 안에서는 소유자/국내해외/자산군 순서 대신 평가금액이 큰 순(내림차순)으로 최종 정렬한다.
function defaultAssetOrder(a, b) {
  const aBottom = NON_TRADABLE_CATEGORIES.includes(a.category) ? 1 : 0;
  const bBottom = NON_TRADABLE_CATEGORIES.includes(b.category) ? 1 : 0;
  if (aBottom !== bBottom) return aBottom - bBottom;
  return num(b.curAmount) - num(a.curAmount);
}

function sortRows(rows) {
  const { key, dir } = state.sort;
  if (!key) return [...rows].sort(defaultAssetOrder);
  return [...rows].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); return va.localeCompare(vb) * dir; }
    return (num(va) - num(vb)) * dir;
  });
}

// 보기 방식(state.tableGroupBy)에 따라 행 하나가 속할 그룹의 키를 정한다.
function getTableGroupKey(mode, r) {
  if (mode === 'owner') return r.owner;
  if (mode === 'domestic') return r.isDomestic;
  if (mode === 'category') return r.category;
  return null;
}

// 그룹 헤더(소계) 한 줄 - 데스크톱 테이블용(<tr>, 전체 컬럼에 걸쳐 병합).
function groupHeaderRowHtml(label, count, subtotal, pct) {
  return `
  <tr class="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
    <td colspan="4" class="px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold text-xs">${escapeHtml(label)} <span class="text-slate-400 font-normal">(${count}건)</span></span>
        <span class="text-xs text-slate-500 dark:text-slate-400">${fmtKRW(subtotal)} · ${fmtNum(pct, 1)}%</span>
      </div>
    </td>
  </tr>`;
}
// 그룹 헤더(소계) - 모바일 카드 뷰용.
function groupHeaderCardHtml(label, count, subtotal, pct) {
  return `
  <div class="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2">
    <span class="font-semibold text-xs">${escapeHtml(label)} <span class="text-slate-400 font-normal">(${count}건)</span></span>
    <span class="text-xs text-slate-500 dark:text-slate-400">${fmtKRW(subtotal)} · ${fmtNum(pct, 1)}%</span>
  </div>`;
}

// rows(이미 검색/필터 적용 + 정렬된 상태)를 state.tableGroupBy 기준으로 묶어 "그룹헤더+행" HTML을
// 만든다. 그룹 순서는 국내/해외만 국내를 먼저 두고(기존 관례), 나머지는 그룹 평가금액이 큰 순.
// rowRenderer(r)/headerRenderer(label,count,subtotal,pct)로 데스크톱 테이블/모바일 카드를 공유한다.
function renderGroupedRows(rows, mode, rowRenderer, headerRenderer) {
  const grandTotal = rows.reduce((s, r) => s + r.curAmount, 0);
  const groupsMap = {};
  rows.forEach((r) => {
    const key = getTableGroupKey(mode, r) || '(미지정)';
    if (!groupsMap[key]) groupsMap[key] = [];
    groupsMap[key].push(r);
  });
  // 그룹 순서도 기본 정렬 우선순위(소유자: 신랑->와이프->기타 / 국내외: 해외->국내 / 자산군:
  // 주식->ETF->채권->현금->부동산)와 동일하게 맞춰, 그룹 보기 토글을 바꿔도 항상 같은 우선순위로
  // 배치되게 한다(정의되지 않은 그룹 모드가 생기면 기존처럼 소계 금액 큰 순으로 폴백).
  let groupKeys = Object.keys(groupsMap);
  const rankFn = mode === 'owner' ? ownerRank : mode === 'domestic' ? domesticRank : mode === 'category' ? categoryRank : null;
  if (rankFn) {
    groupKeys.sort((a, b) => rankFn(a) - rankFn(b));
  } else {
    groupKeys.sort((a, b) => {
      const sumA = groupsMap[a].reduce((s, r) => s + r.curAmount, 0);
      const sumB = groupsMap[b].reduce((s, r) => s + r.curAmount, 0);
      return sumB - sumA;
    });
  }
  return groupKeys.map((key) => {
    const groupRows = groupsMap[key];
    const subtotal = groupRows.reduce((s, r) => s + r.curAmount, 0);
    const pct = grandTotal !== 0 ? (subtotal / grandTotal * 100) : 0;
    return headerRenderer(key, groupRows.length, subtotal, pct) + groupRows.map(rowRenderer).join('');
  }).join('');
}

// [종목 통합 표시] 동일 티커(티커가 없으면 동일 종목명)를 그룹 키로 삼는다 - sanitizeTicker와 동일한
// 기준이라 다른 곳의 티커 매칭(리밸런싱 등)과 항상 일치한다.
function groupKeyFor(a) {
  const yahoo = sanitizeTicker(a.ticker).yahooTicker;
  return yahoo ? `T:${yahoo}` : `N:${String(a.name ?? '').trim().toUpperCase()}`;
}

// "전체" 목록 뷰 전용: 여러 소유자/계좌에 나뉘어 보유 중인 같은 종목을 한 행으로 합친다.
// - 총 보유 수량/총 평가금액은 단순 합산, 통합 평가손익·수익률은 전체 매수금액 대비 전체 평가금액으로
//   다시 계산한다(개별 손익률의 평균이 아니다 - 금액 가중이 자동으로 반영되게 하기 위함).
// - 현재가/통화/자산군 등 "대표값"은 시세 조회에 성공한 멤버를 우선 쓰고, 전부 실패했으면 첫 멤버를 쓴다.
// - 소유자별/국내해외별/자산군별 "보기 방식"은 그 자체가 소유자·지역·자산군 구분을 보여주는 화면이라
//   이 통합을 적용하지 않는다(renderTable에서 mode==='none'일 때만 호출).
function buildMergedRows(rows) {
  const order = [];
  const groups = new Map();
  rows.forEach((r) => {
    const key = groupKeyFor(r);
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(r);
  });

  return order.map((key) => {
    const members = groups.get(key);
    if (members.length === 1) return { ...members[0], _isGroup: false };

    const totalQuantity = members.reduce((s, m) => s + num(m.quantity), 0);
    const totalBuyAmount = members.reduce((s, m) => s + m.buyAmount, 0);
    const totalCurAmount = members.reduce((s, m) => s + m.curAmount, 0);
    const profit = totalCurAmount - totalBuyAmount;
    const rateOfReturn = totalBuyAmount !== 0 ? (profit / totalBuyAmount) * 100 : 0;
    const priced = members.find((m) => !state.priceFetchFailedIds.has(m.id)) || members[0];
    const owners = [...new Set(members.map((m) => m.owner))];

    return {
      ...priced,
      quantity: totalQuantity,
      buyAmount: totalBuyAmount,
      curAmount: totalCurAmount,
      profit,
      rateOfReturn,
      owner: owners.join('+'),
      _isGroup: true,
      _memberIds: members.map((m) => m.id),
      _memberCount: members.length
    };
  });
}

// [자산 관리 카드 - 계층별 독립 아코디언] 4개 보기 방식(전체/소유자별/국내해외별/자산군별)이 각자
// 독립적으로 접고 펼 수 있어, 이제 "현재 선택된 보기 방식 하나"라는 개념이 없다 - 4개 모두 기본 접힘.
const ASSET_GROUP_MODE_SUFFIX = { none: 'None', owner: 'Owner', domestic: 'Domestic', category: 'Category' };
let assetGroupAccordionOpen = { none: false, owner: false, domestic: false, category: false };

function reapplyAssetGroupAccordionHeights() {
  Object.keys(ASSET_GROUP_MODE_SUFFIX).forEach((mode) => {
    const suffix = ASSET_GROUP_MODE_SUFFIX[mode];
    const body = document.getElementById(`assetGroupAccordionBody${suffix}`);
    const chevron = document.getElementById(`assetGroupAccordionChevron${suffix}`);
    if (body && chevron) setAccordionOpen(body, chevron, assetGroupAccordionOpen[mode]);
  });
}

function renderTable() {
  // [PART B] 상단 필터 바와 완전히 분리된 tableAssets()를 쓴다 - 자산 관리 목록은 이제 항상 보유
  // 자산 전체를 보여주고, 부분집합 확인은 검색 팝업(runAssetSearch)으로만 한다.
  const rawRows = tableAssets().map(a => ({ ...a, ...calcRow(a) }));
  const emptyMsg = document.getElementById('emptyTableMsg');

  if (rawRows.length === 0) {
    Object.values(ASSET_GROUP_MODE_SUFFIX).forEach((suffix) => {
      document.getElementById(`assetTableBody${suffix}`).innerHTML = '';
      document.getElementById(`assetCardList${suffix}`).innerHTML = '';
    });
    emptyMsg.textContent = '등록된 자산이 없습니다. "최초등록" 버튼 또는 엑셀 업로드로 시작하세요.';
    emptyMsg.classList.remove('hidden');
    document.getElementById('tableCountLabel').textContent = '총 0건';
    Object.values(ASSET_GROUP_MODE_SUFFIX).forEach((suffix) => {
      document.getElementById(`assetGroupSummary${suffix}`).textContent = '0건';
    });
    renderTableFooter(rawRows);
    lucide.createIcons();
    reapplyAssetGroupAccordionHeights();
    return;
  }

  emptyMsg.classList.add('hidden');

  // ① 전체 - 같은 종목을 여러 소유자/계좌가 나눠 보유해도 한 행으로 합친다.
  const merged = sortRows(buildMergedRows(rawRows));
  document.getElementById('assetTableBodyNone').innerHTML = merged.map(r => rowHtml(r)).join('');
  document.getElementById('assetCardListNone').innerHTML = merged.map(r => cardHtml(r)).join('');

  // ② ③ ④ - 소유자별/국내해외별/자산군별은 그룹 헤더(소계)와 함께 나열한다.
  const sortedRows = sortRows(rawRows);
  ['owner', 'domestic', 'category'].forEach((mode) => {
    const suffix = ASSET_GROUP_MODE_SUFFIX[mode];
    document.getElementById(`assetTableBody${suffix}`).innerHTML = renderGroupedRows(sortedRows, mode, rowHtml, groupHeaderRowHtml);
    document.getElementById(`assetCardList${suffix}`).innerHTML = renderGroupedRows(sortedRows, mode, cardHtml, groupHeaderCardHtml);
  });

  // [건수 표기 형식 변경] "총 N건 중 M건 표시" -> "총 N건 (단일 X건, 중복 Y건)". 단일(X)=실제로 화면에
  // 표시되는 행 수(같은 종목을 여러 소유자/계좌가 나눠 보유해 buildMergedRows가 한 줄로 합친 경우도
  // 1건으로 센다), 중복(Y)=그렇게 합쳐지며 줄어든 건수(현재 필터 기준 원본 건수 - 표시 행 수). 필터가
  // '전체'일 때는 rawRows.length가 곧 state.assets.length와 같아 예시("총 28건...")와 정확히 일치한다.
  const displayedCount = merged.length;
  const duplicateCount = rawRows.length - displayedCount;
  document.getElementById('tableCountLabel').textContent = `총 ${rawRows.length}건 (단일 ${displayedCount}건, 중복 ${duplicateCount}건)`;
  // [4개 아코디언 헤더 공통 요약] 4개 섹션이 같은 필터 결과를 그룹핑만 다르게 보여줄 뿐이라 총 건수/총
  // 평가액은 어디서나 동일하다 - 접힌 상태에서도 핵심 정보를 바로 확인할 수 있게 헤더에 노출한다.
  const totalCur = rawRows.reduce((s, r) => s + r.curAmount, 0);
  const groupSummaryText = `${rawRows.length}건 · ${fmtKRW(totalCur)}`;
  Object.values(ASSET_GROUP_MODE_SUFFIX).forEach((suffix) => {
    document.getElementById(`assetGroupSummary${suffix}`).textContent = groupSummaryText;
  });
  renderTableFooter(rawRows);
  lucide.createIcons();
  // 방금 다시 그린 목록 기준으로 펼침 상태를 재적용한다 - 검색/필터로 목록 높이가 바뀌어도 max-height가
  // 새 높이에 맞게 갱신되고, 접힌 상태였다면 계속 접힌 채로 유지된다(txListAccordion과 동일).
  reapplyAssetGroupAccordionHeights();
}

// 테이블 행(rowHtml)과 모바일 카드(cardHtml)가 공유하는 파생 표시값 계산.
// 두 뷰가 같은 로직에서 갈라져 나오도록 해서 표시 내용이 서로 어긋나지 않게 한다.
// [당일 손익변동 금액 표기] 종목명 옆 등락률(%) 바로 옆에 함께 보여줄 당일 손익 금액 - KPI 카드의
// calcDailyPnL()과 달리 원화 환산을 하지 않고 그 자산의 거래 통화(원화/달러) 그대로 계산한다("거래
// 통화 기준" 요구사항). r은 buildMergedRows()가 만든 병합 행일 수도 있는데, 같은 티커를 합친 행은
// quantity/currentPrice가 이미 올바르게 합산·공유돼 있어(같은 종목이면 시세는 항상 동일) 그대로 써도
// 정확한 합산 금액이 나온다. 전일종가(prevCloseMap)가 있으면 정확히 계산하고, 없으면 등락률(dayChangeMap)
// 로 근사한다 - hasChange 판정과 같은 소스를 쓰므로 등락률이 표기될 때는 항상 금액도 함께 나온다.
function dailyChangeAmountNative(r) {
  const qty = num(r.quantity);
  const prevClose = state.prevCloseMap[r.id];
  if (typeof prevClose === 'number' && prevClose > 0) {
    return qty * (num(r.currentPrice) - prevClose);
  }
  const fetchedPct = state.dayChangeMap[r.id];
  if (typeof fetchedPct === 'number') {
    return qty * num(r.currentPrice) * (fetchedPct / 100);
  }
  return null;
}

// [시간외 세션 배지 - 공용] 자산관리 카드(derivePresentation)와 핵심종목 실시간 팝업(coreStockRowHtml)이
// 동일한 배지 스타일을 쓰도록 공유한다. 시간외(프리/애프터)는 "왜 이 가격이 다른 곳의 정규장 종가와
// 다르지?"라는 혼란을 막기 위해 눈에 띄는 보라색으로, 정규장은 참고용으로만 보이면 되므로 차분한
// 회색으로 구분한다. [버그 수정] 'session'이 실제로 프리/애프터 시세가 아니면 무조건 '정규장'으로
// 표기했었는데, 그 경우 지금이 진짜 정규장 시간대인지는 전혀 확인하지 않아 장이 완전히 마감된 뒤에도
// (예: 저녁, 주말) 계속 '정규장'이라고 잘못 표시되는 문제가 있었다 - pickCurrentPriceFromChart/
// fetchNaverKrPrice가 실제 시간대를 직접 확인해 'closed'를 별도로 반환하므로, 그 상태를 위한 배지를 둔다.
const SESSION_BADGE_META = {
  pre: { label: '프리마켓', title: '프리마켓(장 시작 전) 시세가 반영된 현재가입니다', cls: 'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-300' },
  post: { label: '애프터마켓', title: '애프터마켓(장 마감 후) 시세가 반영된 현재가입니다', cls: 'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-300' },
  regular: { label: '정규장', title: '정규장 시세가 반영된 현재가입니다', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300' },
  closed: { label: '장마감', title: '장이 마감되어 가장 최근 정규장 종가가 반영된 현재가입니다', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500' }
};

function derivePresentation(r) {
  const priceUnit = r.isForeign ? '$' : '';
  // 당일 등락률(%) - 종목명 바로 옆에 표기한다. 국내 시간외/미국 프리·애프터마켓 시세를 현재가로
  // 채택했을 때도 그 세션의 등락률이 그대로 fetchedPct에 들어있으므로(fetchPriceWithFallback/
  // pickCurrentPriceFromChart 참고) 별도 처리 없이 항상 최신 값을 보여준다.
  const fetchedPct = state.dayChangeMap[r.id];
  const hasChange = typeof fetchedPct === 'number';
  const changeColorClass = hasChange ? profitColor(fetchedPct) : '';
  const changeText = hasChange ? fmtPct(fetchedPct) : '';
  const dailyChangeAmount = hasChange ? dailyChangeAmountNative(r) : null;

  // 지금 현재가가 프리/정규/애프터 중 어느 세션의 시세인지 작은 배지로 안내한다 - 시간외(프리/애프터)는
  // "왜 이 가격이 다른 곳의 정규장 종가와 다르지?"라는 혼란을 막기 위해 눈에 띄는 보라색으로,
  // 정규장은 참고용으로만 보이면 되므로 차분한 회색으로 구분한다.
  const session = state.sessionMap[r.id];
  const sessionMeta = SESSION_BADGE_META[session];
  const sessionBadge = sessionMeta
    ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded ${sessionMeta.cls}" title="${sessionMeta.title}">${sessionMeta.label}</span>`
    : '';

  // 화면에는 사용자가 입력한 원본 티커를 표시하고, 시세 조회용 정제 티커는 툴팁으로만 안내한다.
  const sanitized = sanitizeTicker(r.ticker);
  const yahooTickerHint = (sanitized.yahooTicker && sanitized.yahooTicker !== (r.ticker || '').toUpperCase()) ? sanitized.yahooTicker : '';

  // 직전 시세 갱신에서 조회가 실패한 종목은 현재가 영역을 강조하고 수동입력 뱃지를 띄운다.
  const priceFetchFailed = state.priceFetchFailedIds.has(r.id);
  const priceCellClass = priceFetchFailed
    ? 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50'
    : 'hover:bg-brand-50 dark:hover:bg-brand-900/30';
  const priceFailBadge = priceFetchFailed
    ? `<div class="text-[9px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">⚠️ 수동 입력 필요</div>`
    : '';

  const isDomesticBadgeClass = r.isDomestic === '해외'
    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300';
  const currencyBadgeClass = r.currency === 'USD'
    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300';

  // [정규장/장외 병행 표기] 지금 메인 가격이 실제 프리마켓/애프터마켓 시세일 때만(session 'pre'|'post')
  // 정규장 종가를 소형 보조 라인으로 병기한다 - 정규장 진행 중이거나 시간외 데이터 자체가 없는 완전
  // 장마감일 때는 굳이 같은 값을 두 번 보여줄 필요가 없어 숨긴다(extendedHoursSublineHtml 참고).
  const extendedHoursSub = extendedHoursSublineHtml(session, r.regularMarketPrice, state.prevCloseMap[r.id], r.isForeign);

  return { priceUnit, hasChange, changeColorClass, changeText, dailyChangeAmount, isForeign: r.isForeign, sessionBadge, yahooTickerHint, priceFetchFailed, priceCellClass, priceFailBadge, isDomesticBadgeClass, currencyBadgeClass, extendedHoursSub };
}

// [정규장/장외 병행 표기] session이 'pre'(프리마켓) 또는 'post'(애프터마켓)일 때만 정규장 종가와 그
// 자체 등락률을 "정규장 XXX.XX (X.XX%)" 형태의 소형 회색 라인으로 반환한다 - 그 외(정규장 진행 중,
// 시간외 데이터 없는 장마감)에는 빈 문자열을 반환해 보조 라인 자체를 숨긴다.
function extendedHoursSublineHtml(session, regularMarketPrice, previousClose, isForeign) {
  if (session !== 'pre' && session !== 'post') return '';
  if (!Number.isFinite(regularMarketPrice) || regularMarketPrice <= 0) return '';
  const unit = isForeign ? '$' : '';
  const pct = (Number.isFinite(previousClose) && previousClose > 0) ? ((regularMarketPrice - previousClose) / previousClose * 100) : null;
  const pctText = pct !== null ? ` (${fmtPct(pct)})` : '';
  return `<div class="text-[10px] text-slate-400 font-normal">정규장 ${unit}${fmtNum(regularMarketPrice, 2)}${pctText}</div>`;
}

// 당일 손익변동 금액을 거래 통화 그대로(원화 환산 없이) +/- 부호와 함께 표기한다 - fmtSigned()는 항상
// "원"을 붙이므로 외화 종목에는 쓸 수 없어 별도로 만들었다.
function fmtSignedNative(amount, isForeign) {
  if (isForeign) {
    const n = Math.round(amount * 100) / 100;
    return (n >= 0 ? '+$' : '-$') + fmtNum(Math.abs(n), 2);
  }
  const n = Math.round(amount);
  return (n >= 0 ? '+' : '') + fmtNum(n, 0) + '원';
}

// 종목명 바로 옆에 붙일 당일 등락률(%) + 손익변동 금액 텍스트 - 상승 빨강/하락 파랑/보합 기본색
// (profitColor와 동일 규칙). 예: "삼성전자 (+1.52% / +76,000원)".
function changeInlineHtml(p) {
  if (!p.hasChange) return '';
  const amountText = (typeof p.dailyChangeAmount === 'number') ? ` / ${fmtSignedNative(p.dailyChangeAmount, p.isForeign)}` : '';
  return ` <span class="text-[11px] font-medium ${p.changeColorClass}">(${p.changeText}${amountText})</span>`;
}

// [종목 상세 모달 전환] 요약 행/카드를 클릭하면 아코디언으로 펼치는 대신 openAssetDetailModal()이
// 종목 상세 정보 + 주가 차트 모달을 띄운다(기존 수정 폼으로 이어지던 아코디언·수정 버튼은 제거됨 -
// 수량/매입단가 수정은 이제 거래내역 탭에서 거래를 등록하는 방식으로 이뤄진다).
// [무티커 현금/채권/부동산 - 수량 대신 평가금액 표시] 달러/국채/현금/부동산처럼 티커 없는 자산은 "수량×
// 단가" 개념이 사용자에게 의미가 없다("금액 기반 입력" 관례상 단가는 늘 1로 고정) - 그래서 이 자산군만
// 수량 칸은 비우고, 현재가 칸에 평가금액을 대신 보여준다. 달러(해외통화)는 환율을 곱하지 않은 "보유 달러
// 총액"을 헤드라인으로, 그 아래 참고용으로 환율 적용된 원화 총액을 작게 덧붙인다(원화 현금/채권/부동산은
// 애초에 환율 변환이 없으므로 평가금액 하나만 보여주면 충분하다). 부동산도 동일하게 적용되며, 소유자
// 필터(전체/신랑/와이프)는 이 함수 호출 이전에 행 목록만 걸러낼 뿐이라 별도 분기 없이 모든 필터에
// 동일하게 적용된다.
function isCashOrBondNoTicker(r) {
  return !r.ticker && (r.category === '현금' || r.category === '채권' || r.category === '부동산');
}
function cashBondValueHtml(r) {
  if (r.isForeign) {
    const usdTotal = num(r.quantity) * num(r.currentPrice);
    return { headline: `$${fmtNum(usdTotal, 2)}`, sub: `<div class="text-[10px] text-slate-400 font-normal">${fmtKRWShort(r.curAmount)}</div>` };
  }
  return { headline: fmtNum(r.curAmount, 0), sub: '' };
}

// [미니 당일 봉차트] 종목 리스트 우측 끝(예전 차트 아이콘 자리)에 오늘 하루치 OHLC를 캔들 하나로
// 압축해서 보여준다 - 자산 상세의 큰 캔들 차트와 동일한 색상 규칙(getCandleColors, 양봉=빨강/음봉=파랑)을
// 그대로 쓴다. OHLC 중 하나라도 없거나(무티커 자산, 소스가 값을 못 준 경우 등) 유효하지 않으면 빈
// 문자열을 반환해 그 자리를 조용히 비운다 - 클릭 시 상세 모달을 여는 기존 동작(부모 요소의
// data-action="open-detail")에는 전혀 영향 없다.
function miniCandleSvg(open, high, low, price) {
  if (![open, high, low, price].every((v) => Number.isFinite(v) && v > 0)) return '';
  if (high < low) return '';
  const isUp = price >= open;
  const color = isUp ? getCandleColors().up : getCandleColors().down;
  const W = 14, H = 26, PAD = 2;
  const usableH = H - PAD * 2;
  const range = (high - low) || 1; // 고가=저가(변동 전무)일 때 0 나눗셈 방지
  const yFor = (v) => PAD + (1 - (v - low) / range) * usableH;
  const bodyTop = yFor(Math.max(open, price));
  const bodyBottomY = yFor(Math.min(open, price));
  const bodyHeight = Math.max(bodyBottomY - bodyTop, 1.5); // 시가=현재가일 때도 얇은 선으로는 보이게
  const cx = W / 2, bodyW = 8;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="inline-block align-middle" aria-hidden="true">
    <line x1="${cx}" y1="${yFor(high).toFixed(2)}" x2="${cx}" y2="${yFor(low).toFixed(2)}" stroke="${color}" stroke-width="1.4"></line>
    <rect x="${(cx - bodyW / 2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyW}" height="${bodyHeight.toFixed(2)}" fill="${color}" rx="1"></rect>
  </svg>`;
}

function rowHtml(r) {
  const p = derivePresentation(r);
  const isCashBond = isCashOrBondNoTicker(r);
  const cashBondValue = isCashBond ? cashBondValueHtml(r) : null;
  const priceUnit = isCashBond ? '' : p.priceUnit;
  const priceHeadline = isCashBond ? cashBondValue.headline : `${priceUnit}${fmtNum(r.currentPrice, 2)}`;
  const tickerTitle = p.yahooTickerHint ? ` title="시세조회: ${escapeHtml(p.yahooTickerHint)}"` : '';
  // 해외 자산은 "적용 통화(달러)"와 "환산 원화"를 요약에서 함께 보여준다.
  const priceKrwSub = isCashBond ? cashBondValue.sub : (r.isForeign ? `<div class="text-[10px] text-slate-400 font-normal">${fmtKRWShort(r.currentPrice * state.exchangeRate)}</div>` : '');
  // [종목 통합 표시] 여러 소유자/계좌를 합친 행은 "통합 N건(소유자1+소유자2)"로 구분해 보여주고,
  // 클릭 시 그룹 상세 모달로 라우팅할 수 있도록 data-member-ids를 함께 심어둔다.
  const subtitle = r._isGroup
    ? `${escapeHtml(r.ticker || '-')} · 통합 ${r._memberCount}건 (${escapeHtml(r.owner)})`
    : `${escapeHtml(r.ticker || '-')} · ${escapeHtml(r.owner)}`;
  const memberIdsAttr = r._isGroup ? ` data-member-ids="${r._memberIds.join(',')}"` : '';

  return `
  <tr class="border-b border-slate-50 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" data-action="open-detail" data-id="${r.id}"${memberIdsAttr}>
    <td class="px-3 py-2.5">
      <div class="font-medium">${escapeHtml(r.name)}${changeInlineHtml(p)}</div>
      <div class="font-mono text-[11px] text-slate-400"${tickerTitle}>${subtitle}</div>
    </td>
    <td class="px-3 py-2.5 text-right">${isCashBond ? '' : fmtNum(r.quantity, 4)}</td>
    <td class="px-3 py-2.5 text-right ${p.priceCellClass}">${priceHeadline}${p.sessionBadge}${priceKrwSub}${p.extendedHoursSub}${p.priceFailBadge}</td>
    <td class="px-3 py-2.5 text-center">${miniCandleSvg(r.todayOpen, r.todayHigh, r.todayLow, r.currentPrice)}</td>
  </tr>`;
}

// [모바일 3줄 레이아웃] 640px 미만 화면에서 테이블 대신 표시하는 종목별 카드. 요약을 탭하면
// openAssetDetailModal()이 뜬다. 왼쪽 텍스트 블록을 정확히 3줄로 구성한다:
//   1줄 종목명(15px/600, 말줄임표)+당일 실시간 등락률(색상 구분) - 2줄 티커+소유자 배지(13px, 보조색)
//   - 3줄 누적 수익률/평가손익(13.5px/500, 상승=빨강/하락=파랑 - profitColor()로 기존 전체 화면과
//   색상 규칙 통일).
// min-w-0(텍스트 블록)+flex-1과 shrink-0(우측 가격 블록)의 조합이 있어야 flex 레이아웃 안에서 종목명의
// truncate(=white-space:nowrap+overflow:hidden+text-overflow:ellipsis, Tailwind 유틸리티)가 실제로
// 우측 영역을 침범하지 않고 동작한다(min-w-0 없이는 flex 아이템이 콘텐츠 너비만큼 늘어나 버린다).
// [등락률 재배치] 1줄 안에서도 종목명은 truncate(min-w-0)로 줄어들고, 등락률은 shrink-0으로 항상
// 온전히 보이도록 별도 flex 컨테이너로 감싼다 - 그래야 이름이 길어도 등락률이 잘리지 않는다.
function cardHtml(r) {
  const p = derivePresentation(r);
  const isCashBond = isCashOrBondNoTicker(r);
  const cashBondValue = isCashBond ? cashBondValueHtml(r) : null;
  const priceKrwSub = isCashBond ? cashBondValue.sub : (r.isForeign ? `<div class="text-[10px] text-slate-400 font-normal">${fmtKRWShort(r.currentPrice * state.exchangeRate)}</div>` : '');
  const dailyRateInline = p.hasChange
    ? `<span class="shrink-0 text-[12px] font-semibold ${p.changeColorClass}">${p.changeText}</span>`
    : '';
  // [배지 폭 절약] "통합 N건" 접미사를 붙이면(예: "신랑+와이프 · 통합 2건") 좁은 모바일 폭에서 배지가
  // 너무 넓어져 옆의 티커가 도리어 심하게 잘린다 - 소유자 이름("신랑+와이프")만으로도 통합 여부는 알 수
  // 있으므로 배지는 소유자 이름만 표시하고, 상세 모달에서 정확한 통합 건수를 확인하게 한다.
  const ownerLabel = r.owner;
  const memberIdsAttr = r._isGroup ? ` data-member-ids="${r._memberIds.join(',')}"` : '';

  return `
  <div class="touch-target flex items-center gap-2 px-4 py-3.5 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40" data-action="open-detail" data-id="${r.id}"${memberIdsAttr}>
    <div class="min-w-0 flex-1">
      <p class="flex items-baseline gap-1.5 min-w-0">
        <span class="font-semibold text-[15px] leading-tight truncate min-w-0">${escapeHtml(r.name)}</span>
        ${dailyRateInline}
      </p>
      <p class="mt-1 text-[13px] leading-tight text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
        <span class="font-mono truncate">${escapeHtml(r.ticker || '-')}</span>
        <span class="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-300">${escapeHtml(ownerLabel)}</span>
      </p>
      <!-- [버그 수정 - 3줄 레이아웃 줄바꿈] 평가손익이 억대(예: +378,765,528원)로 커지면 전체 숫자를
           다 쓰는 fmtSigned가 좁은 모바일 폭에서 한 줄에 안 들어가 2줄로 줄바꿈되며 3줄 설계가 깨졌다
           - "억/만원" 축약 표기(fmtSignedShort, 예: +3억 7,877만원)로 바꿔 항상 한 줄에 들어가게 한다. -->
      <p class="mt-1 text-[13.5px] leading-tight font-medium whitespace-nowrap ${profitColor(r.profit)}">(${fmtPct(r.rateOfReturn)} / ${fmtSignedShort(r.profit)})</p>
    </div>
    <div class="text-right shrink-0 pl-2">
      <p class="text-[10px] text-slate-400">${isCashBond ? '&nbsp;' : `수량 ${fmtNum(r.quantity, 4)}`}</p>
      <p class="text-sm font-semibold">${isCashBond ? cashBondValue.headline : `${p.priceUnit}${fmtNum(r.currentPrice, 2)}`}${p.sessionBadge}</p>
      ${priceKrwSub}
      ${p.extendedHoursSub}
      ${p.priceFailBadge}
    </div>
    <span class="shrink-0">${miniCandleSvg(r.todayOpen, r.todayHigh, r.todayLow, r.currentPrice)}</span>
  </div>`;
}

// [PART B - 검색 팝업] 검색창(Enter/[검색] 버튼)이나 검색 결과 팝업 내부 재검색이 공통으로 호출한다.
// 매칭이 있으면 팝업을 열어 결과를 보여주고, 없으면 안내 알림을 띄운다(기존 앱 전반의 alert() 관례를
// 그대로 따른다).
function runAssetSearch(query) {
  const results = searchAssetsByQuery(query);
  if (results.length === 0) {
    alert('검색 결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.');
    return;
  }
  openAssetSearchResultModal(query, results);
}

// 매칭된 자산은 buildMergedRows로 합치지 않고 각 소유자/계좌 보유분을 개별 행 그대로 보여준다 -
// "소유자/계좌/수량/매수단가/현재가/평가금액/평가손익/수익률"을 항목별로 정확히 구분해 확인할 수 있게
// (rowHtml/cardHtml을 클릭하면 기존 상세 모달이 그 전체 항목을 보여준다).
function renderAssetSearchResultModalBody(results) {
  const rows = sortRows(results.map((a) => ({ ...a, ...calcRow(a) })));
  document.getElementById('assetSearchResultCountLabel').textContent = `(총 ${rows.length}건)`;
  document.getElementById('assetSearchResultTableBody').innerHTML = rows.map((r) => rowHtml(r)).join('');
  document.getElementById('assetSearchResultCardList').innerHTML = rows.map((r) => cardHtml(r)).join('');
  lucide.createIcons();
}
function openAssetSearchResultModal(query, results) {
  document.getElementById('assetSearchResultInput').value = query;
  renderAssetSearchResultModalBody(results);
  document.getElementById('assetSearchResultModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeAssetSearchResultModal(viaBackButton) {
  document.getElementById('assetSearchResultModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('assetSearchResultModalHeader').addEventListener('click', () => closeAssetSearchResultModal());
document.getElementById('closeAssetSearchResultModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeAssetSearchResultModal();
});
document.getElementById('assetSearchResultModal').addEventListener('click', (e) => {
  if (e.target.id === 'assetSearchResultModal') closeAssetSearchResultModal();
});
// [팝업 안 재검색] 매칭이 없으면 팝업을 닫지 않고 그 자리에서 바로 alert만 띄운다 - 사용자가 입력을
// 고쳐 바로 다시 시도할 수 있게(팝업이 닫혀버리면 처음부터 다시 열어야 해서 불편하다).
document.getElementById('assetSearchResultInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const results = searchAssetsByQuery(e.target.value);
  if (results.length === 0) { alert('검색 결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.'); return; }
  renderAssetSearchResultModalBody(results);
});
document.getElementById('assetSearchResultSearchBtn').addEventListener('click', () => {
  const results = searchAssetsByQuery(document.getElementById('assetSearchResultInput').value);
  if (results.length === 0) { alert('검색 결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.'); return; }
  renderAssetSearchResultModalBody(results);
});
// rowHtml/cardHtml이 자산 관리 목록과 동일한 data-action="open-detail" 규약을 쓰므로, 같은 위임
// 핸들러(handleAssetListClick)를 이 팝업 컨테이너에도 연결해 행을 누르면 기존 상세 모달이 뜨게 한다.
document.getElementById('assetSearchResultModal').addEventListener('click', handleAssetListClick);

function renderTableFooter(rows) {
  const totalBuy = rows.reduce((s, r) => s + r.buyAmount, 0);
  const totalCur = rows.reduce((s, r) => s + r.curAmount, 0);
  const totalProfit = totalCur - totalBuy;
  const totalRate = totalBuy !== 0 ? (totalProfit / totalBuy) * 100 : 0;

  // 요약 뷰가 종목명/수량/현재가 3열로 줄어든 만큼, 합계 행도 그에 맞춰 4열(종목명+수량 병합/현재가
  // 자리에 평가금액/마지막 열에 손익·수익률)로 압축한다.
  document.getElementById('tableFooterRow').innerHTML = `
    <td class="px-3 py-2" colspan="2">합계 (${rows.length}건, 현재 필터 기준) · 매입 ${fmtKRWShort(totalBuy)}</td>
    <td class="px-3 py-2 text-right">${fmtKRW(totalCur)}</td>
    <td class="px-3 py-2 text-right ${profitColor(totalProfit)}">${fmtSignedShort(totalProfit)}<br><span class="text-[10px]">${fmtPct(totalRate)}</span></td>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* -------------------------------------------------------------------------
 * 11-1. 토스트 알림
 *    - 시세/환율 갱신 실패처럼 "지금 막 벌어진 일"을 화면 하단 중앙에 잠깐 띄워 알린다(헤더 타이틀/
 *      버튼을 가리지 않도록 #toastContainer 위치를 하단으로 옮김 - CSS 쪽 참고).
 *    - 상세 원인은 console.error/warn에 남기고, 토스트에는 요약만 표시한다.
 * ---------------------------------------------------------------------- */
function showToast(message, type = 'info', duration = 6000) {
  const colors = {
    info: 'bg-slate-800 dark:bg-slate-700 text-white',
    warn: 'bg-amber-500 text-white',
    error: 'bg-red-600 text-white',
    success: 'bg-emerald-600 text-white'
  };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  // [클릭 가능 영역 복구] 컨테이너 자체는 pointer-events-none(빈 공간이 아래 화면 클릭을 막지 않게)
  // 이지만, 실제 토스트 알약 하나하나는 닫기(✕) 버튼을 눌러야 하니 pointer-events-auto로 되살린다.
  el.className = `modal-anim pointer-events-auto ${colors[type] || colors.info} text-xs font-medium px-4 py-3 rounded-xl shadow-lg max-w-sm flex items-start gap-3`;
  el.innerHTML = `<span class="flex-1 leading-relaxed">${escapeHtml(message)}</span><button class="opacity-70 hover:opacity-100 shrink-0" aria-label="닫기">✕</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  container.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, duration);
}

/* -------------------------------------------------------------------------
 * 11-2. [초보자용 (i) 툴팁] 어디서든 data-info-tip="설명문구"만 붙이면 이 위임 리스너 하나가 처리한다 -
 *    마우스오버가 없는 모바일에서도 탭으로 열고 닫을 수 있다(리스크 진단 화면의 전문용어 해설용으로
 *    도입했지만 범용 컴포넌트라 다른 화면에서도 그대로 재사용 가능).
 * ---------------------------------------------------------------------- */
const infoTipPopover = document.getElementById('infoTipPopover');
let infoTipOpenBtn = null;

function closeInfoTip() {
  infoTipPopover.classList.add('hidden');
  infoTipOpenBtn = null;
}

function openInfoTip(btn) {
  infoTipPopover.textContent = btn.dataset.infoTip;
  infoTipPopover.classList.remove('hidden');
  const rect = btn.getBoundingClientRect();
  // 팝오버를 일단 보이는 상태로 만든 뒤 실제 렌더링 폭을 재서 화면 밖으로 넘치지 않게 좌우를 보정한다.
  let left = rect.left;
  const maxLeft = window.innerWidth - infoTipPopover.offsetWidth - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  if (left < 8) left = 8;
  infoTipPopover.style.left = left + 'px';
  infoTipPopover.style.top = (rect.bottom + 6) + 'px';
  infoTipOpenBtn = btn;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-info-tip]');
  if (btn) {
    e.stopPropagation();
    if (infoTipOpenBtn === btn) { closeInfoTip(); return; }
    openInfoTip(btn);
    return;
  }
  if (!e.target.closest('#infoTipPopover')) closeInfoTip();
});
window.addEventListener('scroll', closeInfoTip, true);

/* -------------------------------------------------------------------------
 * 12. 전체 렌더 파이프라인
 * ---------------------------------------------------------------------- */
// 총자산현황 탭(구 "투자세부", 필터바 + 비중 차트 3종 + 자산 관리 목록)을 한 번에 다시 그린다.
// switchTab()이 이 탭에 진입할 때, 그리고 renderAll()이 이 탭이 이미 보이고 있을 때 호출한다.
function renderInvestmentDetailTab() {
  renderCharts();
  renderTable();
}

function renderAll() {
  populateFilterOptions();
  renderKPIs();
  renderRiskSection();
  // [탭 재배치] Top5는 금융투자현황 탭으로 옮겨왔다 - 캔버스가 아니라 일반 테이블이라 숨겨진 탭에서
  // 갱신해도 크기가 0이 되는 문제가 없으므로, 다른 KPI/RISK 렌더링과 함께 항상 갱신한다.
  renderTopHoldings();
  // 총자산현황/리밸런싱/미래예측 탭은 숨겨진 캔버스에 차트를 그리면 크기가 0이 되므로, 실제로 보이고
  // 있을 때만 갱신한다. (다른 탭으로 전환되는 순간에는 switchTab()이 별도로 해당 탭을 다시 그려준다.)
  if (state.activeTab === 'investmentDetail') renderInvestmentDetailTab();
  if (state.activeTab === 'transactions') renderTransactionsTab();
  // [포트폴리오/자산예측 통합] tabPanelProjection이 tabPanelRebalance 안에 중첩돼 있으므로, 어느 서브탭을
  // 보고 있는지(rebalanceSubTab)까지 함께 확인해야 숨겨진 캔버스를 건드리지 않는다.
  if (state.activeTab === 'rebalance' && rebalanceSubTab !== 'projection') renderRebalance();
  if (state.activeTab === 'rebalance' && rebalanceSubTab === 'projection') renderProjection();
}

/* -------------------------------------------------------------------------
 * 13. 모달(추가/수정) 로직
 * ---------------------------------------------------------------------- */
const modal = document.getElementById('assetModal');

// [자산 추가 팝업 개선] isManual=false(기본, "검색" 모드) - 티커/종목명/자산군/국내해외/통화/현재가는
// 검색 결과로만 채워지고 직접 수정할 수 없다(readonly input, disabled select). isManual=true("직접 입력"
// 모드) - 이 필드들을 기존처럼 손으로 채울 수 있다(티커 없는 채권/현금/부동산 등, 그리고 [수정] 진입 시).
// disabled된 select의 값도 .value로는 계속 읽고 쓸 수 있어(네이티브 폼 제출에만 영향) 제출 로직은
// 그대로 동작한다.
function setAssetFormSearchMode(isManual) {
  const readonlyFieldIds = ['f_ticker', 'f_name', 'f_category', 'f_currentPrice'];
  const disabledSelectIds = ['f_isDomestic', 'f_currency'];
  readonlyFieldIds.forEach((id) => {
    const el = document.getElementById(id);
    el.readOnly = !isManual;
    el.classList.toggle('bg-slate-100', !isManual);
    el.classList.toggle('dark:bg-slate-800/50', !isManual);
    el.classList.toggle('text-slate-400', !isManual);
    el.classList.toggle('bg-slate-50', isManual);
    el.classList.toggle('dark:bg-slate-800', isManual);
  });
  disabledSelectIds.forEach((id) => {
    const el = document.getElementById(id);
    el.disabled = !isManual;
    el.classList.toggle('bg-slate-100', !isManual);
    el.classList.toggle('dark:bg-slate-800/50', !isManual);
    el.classList.toggle('text-slate-400', !isManual);
    el.classList.toggle('bg-slate-50', isManual);
    el.classList.toggle('dark:bg-slate-800', isManual);
  });
  document.getElementById('assetSearchRow').classList.toggle('hidden', isManual);
  document.getElementById('f_currentPriceStatus').textContent = '';
  document.getElementById('f_amountModeWrap').classList.toggle('hidden', !isManual);
  updateAssetAmountModeUI();
}

// [금액 기반 입력] "직접 입력" 모드에서만 노출되는 하위 토글 - 켜면 수량 필드가 "총 보유금액"이 되고
// 매수단가/현재가는 화면에서 숨긴 채 1로 고정한다(원화든 외화든 "1단위=1원/1달러" 취급 - 통화 환산은
// calcRow가 이미 state.exchangeRate로 일괄 처리하므로 여기서 별도 환율을 곱하면 이중환산이 된다).
function updateAssetAmountModeUI() {
  const isManual = document.getElementById('f_manualEntryToggle').checked;
  const isAmount = isManual && document.getElementById('f_amountMode').checked;
  const isUSD = document.getElementById('f_currency').value === 'USD';
  const qtyLabel = document.getElementById('f_quantityLabel');
  const buyPriceWrap = document.getElementById('f_buyPriceFieldWrap');
  const curPriceWrap = document.getElementById('f_currentPriceFieldWrap');
  const qtyWrap = document.getElementById('f_quantityFieldWrap');
  if (!isAmount) {
    qtyLabel.textContent = '③ 수량/좌수';
    buyPriceWrap.classList.remove('hidden');
    curPriceWrap.classList.remove('hidden');
    qtyWrap.classList.remove('col-span-2');
    qtyWrap.classList.add('col-span-1');
    return;
  }
  qtyLabel.textContent = isUSD ? '③ 외화 금액($)' : '③ 금액(원화)';
  buyPriceWrap.classList.add('hidden');
  curPriceWrap.classList.add('hidden');
  qtyWrap.classList.remove('col-span-1');
  qtyWrap.classList.add('col-span-2');
  document.getElementById('f_buyPrice').value = 1;
  document.getElementById('f_currentPrice').value = 1;
}

function openModal(mode, id) {
  document.getElementById('assetForm').reset();
  document.getElementById('modalTitle').textContent = mode === 'edit' ? '자산 수정' : '최초등록';
  document.getElementById('assetFormSubmitBtn').textContent = mode === 'edit' ? '수정 완료' : '최초등록';
  document.getElementById('f_id').value = '';
  document.getElementById('assetSearchStockBtnLabel').textContent = '종목명 또는 티커로 검색...';
  document.getElementById('f_manualEntryToggle').checked = false;
  document.getElementById('f_amountMode').checked = false;

  if (mode === 'edit') {
    const a = state.assets.find(x => x.id === id);
    if (!a) return;
    // [수정] 버튼은 항상 티커 없는 자산(채권/현금/부동산 등)에서만 열린다 - 검색 결과가 애초에 있을 수
    // 없는 종류라 "직접 입력" 모드로 고정하고, 토글 자체를 숨겨 되돌아갈 수 없게 한다.
    document.getElementById('f_manualEntryToggle').checked = true;
    document.getElementById('f_manualEntryToggleWrap').classList.add('hidden');
    setAssetFormSearchMode(true);
    document.getElementById('f_id').value = a.id;
    document.getElementById('f_ticker').value = a.ticker || '';
    document.getElementById('f_owner').value = a.owner;
    document.getElementById('f_accountType').value = a.accountType;
    document.getElementById('f_category').value = a.category;
    document.getElementById('f_name').value = a.name;
    document.getElementById('f_isDomestic').value = a.isDomestic;
    document.getElementById('f_currency').value = a.currency;
    document.getElementById('f_quantity').value = a.quantity;
    document.getElementById('f_buyPrice').value = a.buyPrice;
    document.getElementById('f_currentPrice').value = a.currentPrice;
    document.getElementById('f_role').value = a.role || '';
  } else {
    document.getElementById('f_manualEntryToggleWrap').classList.remove('hidden');
    setAssetFormSearchMode(false); // 신규 추가는 항상 "검색" 모드로 시작한다.
    document.getElementById('f_owner').value = '신랑';
    document.getElementById('f_isDomestic').value = '국내';
    document.getElementById('f_currency').value = 'KRW';
    document.getElementById('f_category').value = '주식';
    document.getElementById('f_role').value = '';
  }
  updatePriceUnitLabels();
  updateAssetAmountModeUI();
}

function showModal() { modal.classList.remove('hidden'); pushModalHistoryState(); }
function closeModal(viaBackButton) { modal.classList.add('hidden'); if (!viaBackButton) popModalHistoryIfNeeded(); }

// 매수단가/현재가의 단위 표시는 '통화' 필드를 기준으로 한다 (국내/해외와는 독립적).
function updatePriceUnitLabels() {
  const isUSD = document.getElementById('f_currency').value === 'USD';
  const unit = isUSD ? '(USD)' : '(KRW)';
  document.getElementById('f_buyPriceUnit').textContent = unit;
  document.getElementById('f_curPriceUnit').textContent = unit;
}

// 티커 또는 종목명을 입력하는 동안 자산군/국내해외/통화를 실시간으로 자동 추론해 반영한다("직접 입력"
// 모드 전용 - 검색 모드에서는 이 두 필드가 readonly라 input 이벤트 자체가 발생하지 않는다).
function autoClassifyModal() {
  const ticker = document.getElementById('f_ticker').value;
  const name = document.getElementById('f_name').value;
  const { category, isDomestic } = deriveDefaults(ticker, name);
  document.getElementById('f_category').value = category;
  document.getElementById('f_isDomestic').value = isDomestic;
  document.getElementById('f_currency').value = isDomestic === '해외' ? 'USD' : 'KRW';
  updatePriceUnitLabels();
}

// 국내/해외를 수동으로 바꾸면 통화 기본값도 함께 맞춰준다 (필요하면 통화만 다시 바꿔 최종 override 가능).
function syncCurrencyWithDomestic() {
  document.getElementById('f_currency').value = document.getElementById('f_isDomestic').value === '해외' ? 'USD' : 'KRW';
  updatePriceUnitLabels();
}

// [자산 추가 팝업 개선] 검색 모달(stockSearchModal)을 'asset' 모드로 열었을 때 선택 결과를 여기 채운다.
// 1) 즉시 티커/종목명을 채우고 키워드 기반 자동판별(autoClassifyModal)로 1차 값을 보여준 뒤,
// 2) 이 프로젝트가 이미 쓰고 있는 실시간 시세 조회(fetchPriceWithFallback - Naver/Yahoo/Stooq 동일 경쟁
//    로직)를 그대로 재사용해 현재가와 실제 거래 통화를 받아와 덮어쓴다. 통화는 이 앱이 지원하는
//    KRW/USD 중 하나로 확인될 때만 반영한다(그 외 통화는 국내/해외 자동판별 결과를 그대로 유지 - 이
//    앱의 원화환산 계산은 KRW/USD 두 통화만 지원한다).
async function applyStockPickToAssetForm(ticker, name) {
  document.getElementById('f_ticker').value = ticker;
  document.getElementById('f_name').value = name;
  document.getElementById('assetSearchStockBtnLabel').textContent = `${name} (${ticker})`;
  autoClassifyModal();

  const statusEl = document.getElementById('f_currentPriceStatus');
  statusEl.textContent = '(실시간 시세 조회 중...)';
  try {
    const result = await fetchPriceWithFallback(ticker, name);
    document.getElementById('f_currentPrice').value = result.price;
    if (result.currency === 'KRW' || result.currency === 'USD') {
      document.getElementById('f_currency').value = result.currency;
      document.getElementById('f_isDomestic').value = result.currency === 'USD' ? '해외' : '국내';
    }
    updatePriceUnitLabels();
    statusEl.textContent = '(실시간 시세 반영됨)';
  } catch (e) {
    statusEl.textContent = '(시세 조회 실패 - 매수단가와 동일하게 직접 입력해 주세요)';
  }
}

document.getElementById('addAssetBtn').addEventListener('click', () => { openModal('add'); showModal(); });
document.getElementById('closeModalBtn').addEventListener('click', () => closeModal());
document.getElementById('cancelModalBtn').addEventListener('click', () => closeModal());
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.getElementById('f_isDomestic').addEventListener('change', syncCurrencyWithDomestic);
document.getElementById('f_currency').addEventListener('change', () => { updatePriceUnitLabels(); updateAssetAmountModeUI(); });
document.getElementById('f_ticker').addEventListener('input', autoClassifyModal);
document.getElementById('f_name').addEventListener('input', autoClassifyModal);
document.getElementById('f_manualEntryToggle').addEventListener('change', (e) => setAssetFormSearchMode(e.target.checked));
document.getElementById('f_amountMode').addEventListener('change', updateAssetAmountModeUI);
document.getElementById('assetSearchStockBtn').addEventListener('click', () => openStockSearchModal('asset'));

document.getElementById('assetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('f_id').value;
  const name = document.getElementById('f_name').value.trim();
  if (!name) { alert('종목명을 입력해주세요.'); return; }

  const isAmountMode = document.getElementById('f_manualEntryToggle').checked && document.getElementById('f_amountMode').checked;
  const buyPriceVal = isAmountMode ? 1 : num(document.getElementById('f_buyPrice').value);
  const currentPriceRaw = document.getElementById('f_currentPrice').value;
  // 현재가를 비워두면 매수단가로 자동 초기화 (요구사항 2-3)
  const currentPriceVal = isAmountMode ? 1 : (currentPriceRaw.trim() === '' ? buyPriceVal : num(currentPriceRaw));
  const quantityVal = num(document.getElementById('f_quantity').value);

  const payload = {
    ticker: document.getElementById('f_ticker').value.trim(),
    owner: document.getElementById('f_owner').value,
    accountType: document.getElementById('f_accountType').value.trim() || '일반계좌',
    category: document.getElementById('f_category').value.trim() || '주식',
    name,
    isDomestic: document.getElementById('f_isDomestic').value,
    currency: document.getElementById('f_currency').value,
    quantity: quantityVal,
    buyPrice: buyPriceVal,
    // 매입금액은 입력받지 않고 항상 수량×매수단가로 자동 산출된다 (calcRow 참고).
    currentPrice: currentPriceVal,
    // [자산별 역할(포지션) 분류] makeAsset()과 동일하게 parseAssetRoleInput으로 검증 - 미지정이면 undefined.
    role: parseAssetRoleInput(document.getElementById('f_role').value)
  };

  if (id) {
    const idx = state.assets.findIndex(x => x.id === id);
    if (idx < 0) return;
    const oldAsset = state.assets[idx];
    // [잔고조정 거래 자동생성 로직 제거] 예전엔 이 화면(자산 수정)에서 수량/금액을 고치면 차액만큼
    // origin:'adjust' 거래를 몰래 만들고 syncAssetsFromTransactions()로 다시 계산했다 - 거래내역 탭에
    // 사용자가 만들지 않은 거래가 쌓이고, 무티커 자산(특히 현금/외화)은 그 거래가 이후 재동기화 때마다
    // 수치를 다시 덮어써 버리는 문제가 있었다. 이제 자산 수정은 항상 화면에 입력한 값을 그대로
    // state.assets에 반영한다 - 거래내역은 건드리지 않는다(부동산/채권/주식은 거래내역 탭에서 매수/매도로
    // 별도 추적하고, 현금/외화는 거래내역 자체를 만들 수 없으므로 이 화면이 유일한 관리 창구다).
    state.assets[idx] = { ...oldAsset, ...payload, updatedAt: Date.now() }; // [가족 동기화 - 스마트 머지]
  } else {
    const newAsset = { id: genId(), ...payload, updatedAt: Date.now() }; // [가족 동기화 - 스마트 머지]
    state.assets.push(newAsset);
    // [최초 등록 소급 히스토리] "자산 추가"로 직접 만든 신규 자산도 대상 - 티커 없는 자산(채권/현금 등)은
    // backfillDailyPnlHistory 안에서 자연히 건너뛴다.
    backfillDailyPnlHistory(newAsset);
  }

  persistAssets();
  closeModal();
  renderAll();
});

// 테이블(PC/태블릿)과 카드 뷰(모바일)가 마크업만 다를 뿐 data-action 규약은 동일하므로
// 클릭 위임 핸들러 하나를 두 컨테이너에 공유해서 로직이 어긋나지 않게 한다.
function handleAssetListClick(e) {
  // 자산관리 리스트는 읽기 전용이다 - 금액/수량을 이 화면에서 직접 고치는 경로는 없고, 요약 행/카드를
  // 클릭하면 종목 상세+주가 차트 모달을 띄운다(기존 현재가 인라인 수정은 폐지 - 티커 없는 자산은
  // 상세 모달의 [수정] 버튼으로, 티커 있는 자산은 시세 자동 조회로만 갱신된다).
  // data-member-ids가 있으면(여러 소유자/계좌를 통합한 행) 그룹 상세 모달로, 없으면 단일 자산
  // 상세 모달로 연다.
  const detailEl = e.target.closest('[data-action="open-detail"]');
  if (detailEl) {
    const memberIdsAttr = detailEl.dataset.memberIds;
    if (memberIdsAttr) {
      const ids = memberIdsAttr.split(',').filter(Boolean);
      const members = ids.map((id) => state.assets.find((a) => a.id === id)).filter(Boolean).map((a) => ({ ...a, ...calcRow(a) }));
      openAssetDetailModalGroup(members);
    } else {
      openAssetDetailModal(detailEl.dataset.id);
    }
  }
}

// [계층별 독립 아코디언] 4개 섹션(전체/소유자별/국내해외별/자산군별)마다 별도의 tbody/카드리스트가
// 있으므로, 각각에 리스너를 붙이는 대신 카드 전체(assetManagementSection)에서 한 번만 위임 처리한다.
document.getElementById('assetManagementSection').addEventListener('click', handleAssetListClick);

