/* -------------------------------------------------------------------------
 * 11-0. 종목 상세 정보 + 주가 차트 모달
 *    - 자산 관리 목록에서 종목을 클릭하면 열린다. 상단은 보유 정보 요약(읽기 전용), 중앙은 해당
 *      티커의 최근 일봉 시세를 Yahoo Finance 차트 API로 받아와 선 그래프로 그린다(국내/해외 티커
 *      변환은 기존 시세 조회와 동일하게 sanitizeTicker().yahooTicker를 그대로 재사용한다).
 * ---------------------------------------------------------------------- */
let assetDetailCurrentId = null; // 단일 자산 상세 보기 중인 자산 id (그룹/통합 보기 중에는 null)
let assetDetailCurrentGroupIds = null; // 통합(그룹) 상세 보기 중인 자산 id 배열 (단일 보기 중에는 null)
let assetDetailChartToken = 0; // 비동기 차트 응답이 모달이 닫히거나 다른 종목으로 바뀐 뒤 늦게 도착해 덮어쓰는 것을 방지

// [달러 현금 전용 상세 표기] 티커 없는 달러 현금은 buyPrice/currentPrice가 항상 1로 고정된 내부 표기
// 규약이라(updateTxCashPriceLock 참고) 그대로 보여주면 "$1.00 단가"처럼 의미 없는 숫자가 나온다.
// 대신 평균 매수환율/현재 환율/보유 달러 금액/환차손익으로 바꿔서 보여준다 - 평가금액·손익 자체의
// 계산(calcRow의 curAmount/profit/rateOfReturn)은 이미 매수 시점 가중평균 환율(buyRate)을 반영해
// 정확하므로 그대로 재사용하고 라벨과 단위만 바꾼다.
function isUsdCashAsset(a) {
  return !a.ticker && a.category === '현금' && a.currency === 'USD';
}
function usdCashInfoGridHtml(quantity, buyRate, curAmount, profit, rateOfReturn, quantityLabel, curAmountLabel, pnlLabel) {
  const effectiveBuyRate = Number.isFinite(buyRate) && buyRate > 0 ? buyRate : state.exchangeRate;
  return `
    <div><span class="text-slate-400 block mb-0.5">${quantityLabel}</span><span class="font-medium">$${fmtNum(quantity, 2)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">평균 매수환율</span><span class="font-medium">${fmtNum(effectiveBuyRate, 2)}원</span></div>
    <div><span class="text-slate-400 block mb-0.5">현재 환율</span><span class="font-medium">${fmtNum(state.exchangeRate, 2)}원</span></div>
    <div><span class="text-slate-400 block mb-0.5">${curAmountLabel}</span><span class="font-medium">${fmtKRW(curAmount)}</span></div>
    <div class="col-span-2 sm:col-span-4">
      <span class="text-slate-400 block mb-0.5">${pnlLabel}</span>
      <span class="font-medium ${profitColor(profit)}">${fmtSigned(profit)}</span>
      <span class="font-semibold ${profitColor(rateOfReturn)}">(${fmtPct(rateOfReturn)})</span>
    </div>`;
}

// [종목 분석 리포트 통합] 종목 상세 모달(단일/그룹/미보유 읽기전용 3가지 진입 경로 공용) 하단에
// 종목 분석 모달과 동일한 6섹션 리포트를 이어 붙인다 - analyzeTickerForModal()(js/09)로 데이터를
// 계산하고 renderStockAnalysisReportBody()(js/10)로 그린다(종목 분석 모달과 완전히 같은 함수라
// 로직이 두 곳으로 갈라지지 않는다). 티커가 없는 자산(부동산/현금 등)이면 애초에 분석할 대상이
// 없으므로 섹션 자체를 숨긴다. 포트폴리오 적합도 섹션(sim)은 이 모달엔 매수 검토 금액 입력창이
// 없어 항상 생략한다(null).
let assetDetailAnalysisToken = 0;
async function attachStockAnalysisReportToDetailModal(ticker) {
  const section = document.getElementById('assetDetailAnalysisSection');
  const body = document.getElementById('assetDetailAnalysisBody');
  const titleEl = document.getElementById('assetDetailAnalysisTitle');
  if (!section || !body) return;

  const trimmed = String(ticker || '').trim();
  if (!trimmed) { section.classList.add('hidden'); return; }

  // [지수/매크로 지표는 종목 리포트 대신 지표 설명을 보여준다] 코스피/코스닥/S&P500/나스닥/다우/VIX
  // 같은 시장 지표를 종목 상세 모달로 열면(핵심종목 실시간 팝업의 주요 지수 타일 등), 예전엔 여기가
  // "종목 분석 & 위험 관리" 6섹션 리포트를 그대로 보여줘서 "단기 벽/1차 버팀목", "숨고르기(조정) 구간"
  // 같은 개별 종목 매매 관점 문구가 지수에도 그대로 붙는 문제가 있었다(지수는 매수/매도 대상이 아님).
  // 지수 전용 콘텐츠(buildMacroDetailBodyHtml, js/10)를 이 자리에 그대로 재사용한다 - 새 문구를 따로
  // 만들지 않는다. 매크로 브리핑 카드의 8개 타일도 이제 이 종목 상세 모달을 그대로 여는 방식으로
  // 통일돼 있어(macroTileHtml, js/10), 어느 진입 경로로 지수를 열어도 이 콘텐츠 하나만 쓰인다.
  const macroKey = getMacroKeyForTicker(sanitizeTicker(trimmed).yahooTicker);
  if (macroKey) {
    section.classList.remove('hidden');
    if (titleEl) titleEl.textContent = '📊 지수/지표 정보';
    body.innerHTML = buildMacroDetailBodyHtml(macroKey) + macroIndexFooterCaptionHtml();
    lucide.createIcons();

    // [실제 5일/20일 추세 + 3개월 고/저점·MDD 온디맨드 반영] 2단계 패턴(먼저 캐시로 즉시 보여준 뒤
    // 1년치 종가로 정확히 다시 그림)이고, 3개월 고/저점·MDD는 종목/지수 공용 계산기인
    // analyzeTickerForModal()(js/09)을 그대로 재사용한다(별도 계산 로직을 새로 만들지 않음).
    // assetDetailAnalysisToken(이 모달 전용)으로 늦게 도착한 응답이 다른 지표로 전환된 뒤 화면을
    // 덮어쓰지 않게 막는다.
    const token = ++assetDetailAnalysisToken;
    const [trend, a] = await Promise.all([fetchMacroShortTermTrend(macroKey), analyzeTickerForModal(trimmed)]);
    if (token !== assetDetailAnalysisToken || document.getElementById('assetDetailModal').classList.contains('hidden')) return;
    const s = macroDetailSnapshot[macroKey];
    if (s) { s.change5d = trend ? trend.change5d : null; s.change20d = trend ? trend.change20d : null; }
    body.innerHTML = buildMacroDetailBodyHtml(macroKey) + buildIndexPriceLevelsHtml(a) + macroIndexFooterCaptionHtml();
    lucide.createIcons();
    return;
  }
  if (titleEl) titleEl.textContent = '🔍 종목 분석 & 위험 관리';

  section.classList.remove('hidden');
  body.innerHTML = `
    <div class="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
      <span class="text-xs">종목 분석 리포트를 불러오는 중...</span>
    </div>`;
  lucide.createIcons();

  const token = ++assetDetailAnalysisToken;
  const a = await analyzeTickerForModal(trimmed);
  // 그 사이 모달이 닫히거나 다른 종목으로 바뀌었으면(늦게 도착한 응답) 버린다.
  if (token !== assetDetailAnalysisToken || document.getElementById('assetDetailModal').classList.contains('hidden')) return;

  if (a.error) {
    body.innerHTML = `<p class="text-xs text-amber-600 dark:text-amber-400 py-2">${escapeHtml(a.error)}</p>`;
    return;
  }
  body.innerHTML = renderStockAnalysisReportBody(a, null);
  lucide.createIcons();
}

// [🔍 리스크 진단 보기 통합] 메인 화면 RISK 관리 카드에서 리스크 감지 종목마다 있던 개별 펼침 카드
// (🔍 리스크 진단 보기)를 이 모달 하단으로 완전히 이관한다 - buildIndividualRiskDetailHtml()(js/10)이
// 이미 계산해 둔 진단 문구/신호등/지표를 그대로 그려서(computeAdvancedRiskMetrics()의 계산 결과 재사용,
// 로직 중복 없음) RISK 카드와 항상 같은 값을 보여준다. 예전엔 "리스크 감지" 태그가 붙은 종목에만 이
// 카드가 있었지만(안정 종목은 펼침 버튼 자체가 없었음), 모달로 옮긴 뒤로는 리스크 지표가 계산된
// 종목이면 안정/감지 여부와 무관하게 항상 보여준다 - 어차피 특정 종목을 결정한 이 상세 모달 안에서는
// "이 종목이 안전한지"도 똑같이 궁금한 정보이기 때문이다. computeAdvancedRiskMetrics()가 아직 안
// 돌았거나(부팅 직후), 티커가 없거나, 리스크 계산 대상이 아닌 자산(부동산/현금 등)이면 영역 자체를
// 숨긴다(신규 상장·데이터 부족 자체는 buildIndividualRiskDetailHtml이 알아서 "데이터 부족" 문구로 처리).
let riskFlowTileRequestToken = 0;
function attachRiskDiagnosisToDetailModal(ticker) {
  const section = document.getElementById('assetDetailRiskSection');
  const body = document.getElementById('assetDetailRiskBody');
  if (!section || !body) return;

  const yahoo = sanitizeTicker(ticker).yahooTicker;
  const m = state.advancedRiskMetrics;
  const holding = (yahoo && m && m.holdings) ? m.holdings.find((h) => h.ticker === yahoo) || null : null;
  if (!yahoo || !holding) { section.classList.add('hidden'); return; }

  // 이 종목을 신랑/와이프 등 여러 소유자가 나눠 보유해도 RISK 카드와 같은 방식으로 항상 전체 보유분을
  // 합산한 "가구 전체 기준" 비중을 보여준다(단일/그룹 어느 진입 경로로 열어도 값이 갈리지 않는다).
  const totalCur = state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
  const tickerCur = state.assets
    .filter((a) => sanitizeTicker(a.ticker).yahooTicker === yahoo)
    .reduce((s, a) => s + calcRow(a).curAmount, 0);
  const weightPct = totalCur !== 0 ? (tickerCur / totalCur) * 100 : 0;

  section.classList.remove('hidden');
  body.innerHTML = buildIndividualRiskDetailHtml(holding, weightPct);

  // [C - 수급 신호등 KIS 일원화] 국내 종목이면 거래량 기반 추정 대신 KIS 실제 외국인/기관 5일 순매수로
  // 수급 신호등을 갱신한다 - 카드 전체를 다시 그리기엔(비동기 대기) 이 카드만 유독 느려지므로, 먼저
  // 위에서 추정치로 즉시 그린 뒤 KIS 응답이 도착하면 수급 타일만 조용히 교체한다(다른 지표는 그대로).
  // getCachedKisData()(js/13)는 재무 펀더멘털 섹션(attachFundamentalSection)도 같은 종목에 대해 거의
  // 동시에 호출하는데, 그쪽과 진행 중인 요청을 공유해 KIS Worker를 중복 호출하지 않는다.
  const token = ++riskFlowTileRequestToken;
  getCachedKisData(yahoo).then((kis) => {
    if (token !== riskFlowTileRequestToken) return; // 그 사이 다른 종목으로 바뀜 - 버림
    const flow = kis && buildFlowLabelFromKis(kis.investorFlow);
    if (!flow) return;
    const labelEl = body.querySelector('[data-flow-tile-label]');
    const valueEl = body.querySelector('[data-flow-tile-value]');
    if (labelEl) labelEl.textContent = '수급(외국인·기관)';
    if (valueEl) valueEl.textContent = `${flow.emoji} ${flow.label}`;
  });
}

// [모바일 스크롤 위치 버그 수정] 이 모달은 닫아도 DOM에서 제거되지 않고 그냥 hidden 처리만 되므로,
// 예전에 스크롤을 내린 채로 닫았다가 다른 종목으로 다시 열면 스크롤이 그 위치(예: "폭락장 방어
// 성적표" 카드 근처)에 그대로 남아있는 채로 나타나는 문제가 있었다 - 3가지 진입 경로(단일/그룹/읽기
// 전용) 전부 이 함수를 맨 먼저 호출해 스크롤을 최상단으로 되돌린다. 닫기 버튼(이미 포커스 가능한
// 실제 button 요소)에 포커스를 옮겨서 모바일 스크린리더/키보드 사용자에게도 모달이 열렸음을 알리되,
// { preventScroll: true }로 포커스 이동 자체가 스크롤을 다시 끌어내리지 않게 막는다.
function resetAssetDetailModalScroll() {
  const body = document.getElementById('assetDetailModalBody');
  if (body) body.scrollTop = 0;
  const closeBtn = document.getElementById('closeAssetDetailModalBtn');
  if (closeBtn) closeBtn.focus({ preventScroll: true });
}

function openAssetDetailModal(id) {
  const a = state.assets.find((x) => x.id === id);
  if (!a) return;
  assetDetailCurrentId = id;
  assetDetailCurrentGroupIds = null;
  const r = calcRow(a);
  const priceUnit = r.isForeign ? '$' : '';

  document.getElementById('assetDetailName').textContent = a.name || a.ticker || '(이름 없음)';
  document.getElementById('assetDetailTicker').textContent = `${a.ticker || '티커 없음'} · ${a.owner} · ${a.accountType}`;
  document.getElementById('assetDetailInfoGrid').innerHTML = isUsdCashAsset(a)
    ? usdCashInfoGridHtml(a.quantity, a.buyRate, r.curAmount, r.profit, r.rateOfReturn, '보유 달러', '평가금액', '환차손익 (환차수익률)')
    : `
    <div><span class="text-slate-400 block mb-0.5">보유 수량</span><span class="font-medium">${fmtNum(a.quantity, 4)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">평균 매수단가</span><span class="font-medium">${priceUnit}${fmtNum(a.buyPrice, 2)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">현재가</span><span class="font-medium">${priceUnit}${fmtNum(a.currentPrice, 2)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">평가금액</span><span class="font-medium">${fmtKRW(r.curAmount)}</span></div>
    <div class="col-span-2 sm:col-span-4">
      <span class="text-slate-400 block mb-0.5">평가손익 (수익률)</span>
      <span class="font-medium ${profitColor(r.profit)}">${fmtSigned(r.profit)}</span>
      <span class="font-semibold ${profitColor(r.rateOfReturn)}">(${fmtPct(r.rateOfReturn)})</span>
    </div>`;

  document.getElementById('assetDetailOwnerBreakdown').classList.add('hidden');
  // [거래내역 추적 여부 기준] 예전엔 "티커 유무"로 근사했지만, 이제 달러 현금도 티커 없이 거래내역
  // 기반으로 관리될 수 있어 정확한 기준(실제로 매칭되는 거래가 있는지)으로 판단한다 - 거래내역이
  // 있으면 그게 잔고의 근거이므로 이 화면에서 직접 고치거나 지우지 못하게 숨긴다(지우려면 거래내역
  // 에서 매도/출금 처리해야 한다). 부동산/원화현금/아직 거래를 안 넣은 수동 자산만 노출된다.
  const tracked = isTransactionTracked(a);
  document.getElementById('assetDetailDeleteBtn').classList.toggle('hidden', tracked);
  document.getElementById('assetDetailEditBtn').classList.toggle('hidden', tracked);
  document.getElementById('assetDetailModal').classList.remove('hidden');
  resetAssetDetailModalScroll();
  pushModalHistoryState();
  renderAssetDetailChart(a);
  attachRiskDiagnosisToDetailModal(a.ticker);
  attachFundamentalSection(a.ticker, 'assetDetailFundamentalSection', 'assetDetailFundamentalBody');
  attachStockAnalysisReportToDetailModal(a.ticker);
}

// 소유자별 보유 세부 현황 한 줄 - 통합(그룹) 상세 모달 전용.
function assetDetailOwnerRowHtml(m, totalCurAmount) {
  const priceUnit = m.isForeign ? '$' : '';
  const pct = totalCurAmount !== 0 ? (m.curAmount / totalCurAmount * 100) : 0;
  // 거래내역으로 추적되는 보유분은 잔고가 거래내역 기반으로 자동 연동되므로 개별 휴지통 아이콘도
  // 숨긴다(상단 삭제 버튼과 동일한 규칙, isTransactionTracked 참고) - 그룹 모달은 이름이 같은 수동
  // 관리 자산(원화현금 등)도 묶일 수 있어 그 경우엔 계속 노출한다.
  const tracked = isTransactionTracked(m);
  const deleteBtnHtml = tracked ? '' : `
    <button type="button" data-delete-member="${m.id}" title="이 보유분 삭제"
      class="touch-target shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-400">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
    </button>`;
  return `
  <div class="flex items-center justify-between gap-2 text-xs border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
    <div class="min-w-0">
      <p class="font-medium">${escapeHtml(m.owner)} <span class="text-slate-400 font-normal">· ${escapeHtml(m.accountType)}</span></p>
      <p class="text-slate-400 mt-0.5">${isUsdCashAsset(m)
        ? `보유 $${fmtNum(m.quantity, 2)} · 매수환율 ${fmtNum(Number.isFinite(m.buyRate) && m.buyRate > 0 ? m.buyRate : state.exchangeRate, 2)}원`
        : `수량 ${fmtNum(m.quantity, 4)} · 매수단가 ${priceUnit}${fmtNum(m.buyPrice, 2)}`}</p>
    </div>
    <div class="text-right shrink-0">
      <p class="font-semibold">${fmtKRW(m.curAmount)}</p>
      <p class="text-slate-400">${fmtNum(pct, 1)}%</p>
    </div>
    ${deleteBtnHtml}
  </div>`;
}

// [종목 통합 표시] 동일 티커를 여러 소유자/계좌로 나눠 보유 중인 경우, 목록에서는 한 행으로 합쳐
// 보여주고(buildMergedRows) 이 모달에서 통합 총액 + 소유자별 세부 내역을 함께 보여준다.
// members: calcRow가 이미 병합된 자산 배열(각 원소는 실제 개별 자산 - 그룹 합계가 아니다).
function openAssetDetailModalGroup(members) {
  if (!members || members.length === 0) return;
  if (members.length === 1) { openAssetDetailModal(members[0].id); return; }

  assetDetailCurrentId = null;
  assetDetailCurrentGroupIds = members.map((m) => m.id);

  const first = members[0];
  const totalQuantity = members.reduce((s, m) => s + num(m.quantity), 0);
  const totalBuyNative = members.reduce((s, m) => s + m.buyAmountOriginal, 0);
  const totalBuyAmount = members.reduce((s, m) => s + m.buyAmount, 0);
  const totalCurAmount = members.reduce((s, m) => s + m.curAmount, 0);
  const profit = totalCurAmount - totalBuyAmount;
  const rateOfReturn = totalBuyAmount !== 0 ? (profit / totalBuyAmount) * 100 : 0;
  const priced = members.find((m) => !state.priceFetchFailedIds.has(m.id)) || first;
  const priceUnit = first.isForeign ? '$' : '';
  const avgBuyPriceNative = totalQuantity !== 0 ? totalBuyNative / totalQuantity : 0;
  const owners = [...new Set(members.map((m) => m.owner))];
  // [소유자별 평단가 병기] 소유자마다 이 종목의 보유 수량/매수금액을 따로 합산해 개별 평단가를 구한다.
  // 수량이 0이면(전량 매도 후에도 자산 행 자체는 남는 syncAssetsFromTransactions 정책 등으로 발생 가능)
  // 0/0=NaN이 되므로 null로 남겨 "보유없음"으로 표기한다(buildMaLegendHtml 참고).
  const byOwnerAvgPriceNative = {};
  owners.forEach((o) => {
    const ownerMembers = members.filter((m) => m.owner === o);
    const oQty = ownerMembers.reduce((s, m) => s + num(m.quantity), 0);
    const oBuyNative = ownerMembers.reduce((s, m) => s + m.buyAmountOriginal, 0);
    byOwnerAvgPriceNative[o] = oQty > 0 ? oBuyNative / oQty : null;
  });

  document.getElementById('assetDetailName').textContent = first.name || first.ticker || '(이름 없음)';
  document.getElementById('assetDetailTicker').textContent = `${first.ticker || '티커 없음'} · ${owners.join('+')} 통합 (${members.length}건)`;
  // [달러 현금 - 통합 평균 매수환율] buyAmountOriginal(=qty×1)로는 환율 가중평균을 낼 수 없으므로
  // (buyPrice가 항상 1이라 이 값은 그냥 수량과 같다) 멤버별 buyRate를 수량 가중으로 따로 평균낸다.
  const avgBuyRate = isUsdCashAsset(first) && totalQuantity !== 0
    ? members.reduce((s, m) => s + num(m.quantity) * (Number.isFinite(m.buyRate) && m.buyRate > 0 ? m.buyRate : state.exchangeRate), 0) / totalQuantity
    : undefined;
  document.getElementById('assetDetailInfoGrid').innerHTML = isUsdCashAsset(first)
    ? usdCashInfoGridHtml(totalQuantity, avgBuyRate, totalCurAmount, profit, rateOfReturn, '총 보유 달러', '총 평가금액', '통합 환차손익 (환차수익률)')
    : `
    <div><span class="text-slate-400 block mb-0.5">총 보유 수량</span><span class="font-medium">${fmtNum(totalQuantity, 4)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">평균 매수단가</span><span class="font-medium">${priceUnit}${fmtNum(avgBuyPriceNative, 2)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">현재가</span><span class="font-medium">${priceUnit}${fmtNum(priced.currentPrice, 2)}</span></div>
    <div><span class="text-slate-400 block mb-0.5">총 평가금액</span><span class="font-medium">${fmtKRW(totalCurAmount)}</span></div>
    <div class="col-span-2 sm:col-span-4">
      <span class="text-slate-400 block mb-0.5">통합 평가손익 (수익률)</span>
      <span class="font-medium ${profitColor(profit)}">${fmtSigned(profit)}</span>
      <span class="font-semibold ${profitColor(rateOfReturn)}">(${fmtPct(rateOfReturn)})</span>
    </div>`;

  document.getElementById('assetDetailOwnerBreakdownList').innerHTML = [...members]
    .sort((a, b) => b.curAmount - a.curAmount)
    .map((m) => assetDetailOwnerRowHtml(m, totalCurAmount))
    .join('');
  document.getElementById('assetDetailOwnerBreakdown').classList.remove('hidden');
  // 그룹 전체를 한 번에 지우는 건 어느 소유자 것을 지우는지 모호하므로, 상단 삭제 버튼은 숨기고
  // 소유자별 세부 목록의 개별 휴지통 아이콘으로만 삭제하게 한다. 수정 버튼도 그룹 보기에서는 항상 숨긴다.
  document.getElementById('assetDetailDeleteBtn').classList.add('hidden');
  document.getElementById('assetDetailEditBtn').classList.add('hidden');

  document.getElementById('assetDetailModal').classList.remove('hidden');
  resetAssetDetailModalScroll();
  pushModalHistoryState();
  lucide.createIcons();
  renderAssetDetailChart(priced, avgBuyPriceNative, byOwnerAvgPriceNative); // 차트는 대표(시세 정상 조회된) 멤버의 티커/통화 기준으로 그리되, 평단가선은 통합 평균 매수단가를 쓰고 범례에 소유자별 평단가를 병기한다
  attachRiskDiagnosisToDetailModal(first.ticker);
  attachFundamentalSection(first.ticker, 'assetDetailFundamentalSection', 'assetDetailFundamentalBody');
  attachStockAnalysisReportToDetailModal(first.ticker);
}

function closeAssetDetailModal(viaBackButton) {
  document.getElementById('assetDetailModal').classList.add('hidden');
  assetDetailCurrentId = null;
  assetDetailCurrentGroupIds = null;
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('closeAssetDetailModalBtn').addEventListener('click', () => closeAssetDetailModal());
document.getElementById('assetDetailCloseBtn').addEventListener('click', () => closeAssetDetailModal());
document.getElementById('assetDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'assetDetailModal') closeAssetDetailModal();
});
document.getElementById('assetDetailZoomInBtn').addEventListener('click', () => zoomAssetDetailChart(1.3));
document.getElementById('assetDetailZoomOutBtn').addEventListener('click', () => zoomAssetDetailChart(0.7));
document.getElementById('assetDetailEditBtn').addEventListener('click', () => {
  const id = assetDetailCurrentId;
  if (!id) return;
  closeAssetDetailModal();
  openModal('edit', id);
  showModal();
});
document.getElementById('assetDetailDeleteBtn').addEventListener('click', () => {
  const id = assetDetailCurrentId;
  const a = state.assets.find((x) => x.id === id);
  if (a && confirm(`"${a.name}" 자산을 삭제하시겠습니까?`)) {
    state.assets = state.assets.filter((x) => x.id !== id);
    delete state.dayChangeMap[id];
    delete state.prevCloseMap[id];
    delete state.sessionMap[id];
    state.priceFetchFailedIds.delete(id);
    persistAssets();
    closeAssetDetailModal();
    renderAll();
  }
});
// 통합(그룹) 상세 모달의 소유자별 세부 목록 - 각 행의 휴지통 아이콘으로 그 소유자의 보유분만 삭제한다.
// 삭제 후 남은 멤버 수에 따라 그룹 모달을 다시 그리거나(2건 이상), 단일 모드로 전환하거나(1건),
// 모달을 닫는다(0건).
document.getElementById('assetDetailOwnerBreakdownList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-delete-member]');
  if (!btn) return;
  const id = btn.dataset.deleteMember;
  const a = state.assets.find((x) => x.id === id);
  if (!a || !confirm(`"${a.name}" (${a.owner}) 보유분을 삭제하시겠습니까?`)) return;

  const remainingIds = (assetDetailCurrentGroupIds || []).filter((mid) => mid !== id);
  state.assets = state.assets.filter((x) => x.id !== id);
  delete state.dayChangeMap[id];
  delete state.prevCloseMap[id];
  delete state.sessionMap[id];
  state.priceFetchFailedIds.delete(id);
  persistAssets();
  renderAll();

  const remaining = remainingIds.map((mid) => state.assets.find((x) => x.id === mid)).filter(Boolean);
  if (remaining.length === 0) closeAssetDetailModal();
  else if (remaining.length === 1) openAssetDetailModal(remaining[0].id);
  else openAssetDetailModalGroup(remaining.map((x) => ({ ...x, ...calcRow(x) })));
});

/* -------------------------------------------------------------------------
 * 11-0-1. 자산관리 리스트 밖(거래내역/리밸런싱 실행가이드/자산예측 상품별 비중/대시보드 Top5/RISK 관리
 *    등)에서 종목명·티커를 클릭했을 때도 자산관리 리스트와 완전히 동일한 종목 상세+차트 팝업이 뜨도록
 *    하는 공통 진입점. 화면마다 렌더 함수가 제각각이라 매번 리스너를 따로 다는 대신, 종목명 요소에
 *    data-open-stock-detail(+data-ticker/data-name)만 붙여두면 아래 위임(delegated) 리스너 하나가
 *    재렌더링 여부와 무관하게 항상 처리한다.
 * ---------------------------------------------------------------------- */
// 보유 중인 자산과 매칭되면(같은 티커, 여러 소유자면 통합 그룹 모달) 기존 상세 모달을 그대로 재사용해
// 보유 정보(수량/매입가/평가손익 등)까지 보여주고, 매칭되지 않으면(매도 완료 종목, 자산군 캐치올 항목
// 등) 보유 정보 없이 차트만 보여주는 경량 버전(openStockDetailModalReadOnly)으로 연다.
function openStockDetailModal(ticker, name) {
  const sanitized = sanitizeTicker(ticker);
  if (sanitized.yahooTicker) {
    const matches = state.assets.filter((a) => sanitizeTicker(a.ticker).yahooTicker === sanitized.yahooTicker);
    if (matches.length === 1) { openAssetDetailModal(matches[0].id); return; }
    if (matches.length > 1) { openAssetDetailModalGroup(matches.map((a) => ({ ...a, ...calcRow(a) }))); return; }
  }
  openStockDetailModalReadOnly(ticker, name, sanitized);
}

function openStockDetailModalReadOnly(ticker, name, sanitized) {
  assetDetailCurrentId = null;
  assetDetailCurrentGroupIds = null;
  const s = sanitized || sanitizeTicker(ticker);
  document.getElementById('assetDetailName').textContent = name || ticker || '(이름 없음)';
  document.getElementById('assetDetailTicker').textContent = ticker || '티커 없음';
  // [지수/매크로 지표 안내 문구 구분 - 상단 스크롤 절약] 지수는 상단에 안내문을 따로 두지 않는다
  // (아래 attachStockAnalysisReportToDetailModal의 매크로 분기가 지표 콘텐츠 맨 끝에 작은 캡션으로
  // 옮겨 붙인다) - 차트 바로 아래에서 곧장 지표 설명이 시작되도록 상단 스크롤을 줄인다. "매도 완료
  // 등" 문구는 한때 보유했다가 판 개별 종목에는 맞지만, 코스피/코스닥 같은 시장 지표는 애초에
  // 매수/매도 대상이 아니라서 그대로 쓰면 어색해 지수는 이 문구 자체를 두지 않는다.
  const macroKey = getMacroKeyForTicker(s.yahooTicker);
  document.getElementById('assetDetailInfoGrid').innerHTML = macroKey
    ? ''
    : s.yahooTicker
      ? '<p class="col-span-2 sm:col-span-4 text-slate-400">현재 보유 중인 자산이 아닙니다(매도 완료 등). 아래에서 시세 차트만 확인할 수 있습니다.</p>'
      : '<p class="col-span-2 sm:col-span-4 text-slate-400">특정 종목이 아닌 자산군 항목이라 상세 정보/차트를 제공할 수 없습니다.</p>';
  document.getElementById('assetDetailOwnerBreakdown').classList.add('hidden');
  document.getElementById('assetDetailDeleteBtn').classList.add('hidden');
  document.getElementById('assetDetailEditBtn').classList.add('hidden');
  document.getElementById('assetDetailModal').classList.remove('hidden');
  resetAssetDetailModalScroll();
  pushModalHistoryState();
  lucide.createIcons();
  // [지수류 차트 단위 - '$' 오표기 방지] 매크로 브리핑의 8개 지표 중 환율(usdkrw)과 금시세(gold)만
  // 실제 통화/가격이고, 나머지(VIX/코스피/코스닥/S&P500/나스닥/다우/미10년물금리)는 포인트값이라
  // isIndexPoint를 true로 넘겨 차트 Y축/이동평균 범례에 $·₩ 어느 기호도 안 붙게 한다.
  const isIndexPoint = !!macroKey && macroKey !== 'usdkrw' && macroKey !== 'gold';
  renderAssetDetailChart({ ticker, name, currency: s.isDomestic === '해외' ? 'USD' : 'KRW', isIndexPoint });
  attachRiskDiagnosisToDetailModal(s.yahooTicker);
  attachFundamentalSection(s.yahooTicker, 'assetDetailFundamentalSection', 'assetDetailFundamentalBody');
  attachStockAnalysisReportToDetailModal(s.yahooTicker);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-open-stock-detail]');
  if (!el) return;
  openStockDetailModal(el.dataset.ticker, el.dataset.name);
});

// 이동평균선(MA) 설정 - 5/10/20/60/120일.
const MA_PERIODS = [5, 10, 20, 60, 120];
// [차트 선 색상 고대비 개선] 예전엔 라이트/다크 모드 구분 없이 고정 팔레트 하나만 썼다 - 그 결과
// MA5(검정)는 다크모드 배경(어두운 slate)에 거의 묻혀 안 보였고, 평단가/소유자별 평단가 선(연한
// 하늘색 계열)과 MA20(밝은 노랑)은 반대로 라이트모드 흰 배경에서 대비가 낮아 흐릿하게 보였다.
// chartTextColor()와 같은 방식으로 다크모드 여부에 따라 서로 다른(각 배경에서 고대비인) 팔레트를
// 쓰도록 분리한다 - 아래 get* 함수들을 호출부에서 그때그때 부르는 방식으로 바꿨다(상수 그대로 참조하던
// 곳은 전부 함수 호출로 변경).
const MA_COLORS_LIGHT = { 5: '#1C1C1E', 10: '#B22222', 20: '#B8860B', 60: '#1B8A3A', 120: '#8E44AD' };
const MA_COLORS_DARK = { 5: '#F2F2F7', 10: '#FF6B6B', 20: '#FFD60A', 60: '#32D74B', 120: '#BF5AF2' };
function getMaColors() {
  return document.documentElement.classList.contains('dark') ? MA_COLORS_DARK : MA_COLORS_LIGHT;
}
// 캔들스틱 색상 - 양봉/음봉과 시각적으로 뚜렷이 구분되도록 지정된 고대비 팔레트(다크모드는 더 밝은 톤).
const CANDLE_COLORS_LIGHT = { up: '#FF3B30', down: '#007AFF' };
const CANDLE_COLORS_DARK = { up: '#FF453A', down: '#0A84FF' };
function getCandleColors() {
  return document.documentElement.classList.contains('dark') ? CANDLE_COLORS_DARK : CANDLE_COLORS_LIGHT;
}
const AVG_PRICE_LINE_COLOR_LIGHT = '#0077B6';
const AVG_PRICE_LINE_COLOR_DARK = '#64D2FF';
function getAvgPriceLineColor() {
  return document.documentElement.classList.contains('dark') ? AVG_PRICE_LINE_COLOR_DARK : AVG_PRICE_LINE_COLOR_LIGHT;
}
// 소유자가 2명 이상일 때 평단가 기준선을 소유자별로 나눠 그릴 때 쓰는 색상 팔레트(ownerRank 순서로
// 할당 - 신랑이 첫번째, 와이프가 두번째). 캔들/MA 색상과 겹치지 않도록 골랐다.
const OWNER_AVG_LINE_COLORS_LIGHT = ['#0077B6', '#CC7A00', '#1B6FA8', '#D6295E'];
const OWNER_AVG_LINE_COLORS_DARK = ['#64D2FF', '#FF9F0A', '#32ADE6', '#FF375F'];
function getOwnerAvgLineColors() {
  return document.documentElement.classList.contains('dark') ? OWNER_AVG_LINE_COLORS_DARK : OWNER_AVG_LINE_COLORS_LIGHT;
}

// 기간 선택 버튼([1M][3M][6M][1Y][ALL]) - 달력 날짜가 아니라 "거래일 수"로 근사한다. 주말/휴장일이
// 껴 있어 달력일수와 거래일수가 달라지므로, 날짜로 필터링하는 것보다 이 방식이 항상 "최근 N개 봉"을
// 안정적으로 보여준다.
const PERIOD_LABELS = { '1m': '1M', '3m': '3M', '6m': '6M', '1y': '1Y', 'all': 'ALL' };
const PERIOD_TRADING_DAYS = { '1m': 21, '3m': 63, '6m': 126, '1y': 252, 'all': Infinity };

let assetDetailFullPoints = [];   // 캐시된 전체(최대 2년) 일봉 시세 - 기간 버튼/줌은 이걸 슬라이스만 한다
let assetDetailFullMA = {};       // 전체 시세 기준으로 미리 계산해 둔 이동평균(기간과 무관하게 항상 전체
                                  // 데이터로 계산 - 슬라이스 후 재계산하면 구간 첫머리에서 MA가 끊겨 보인다)
// byOwnerAvgPrice: 통합(그룹) 상세일 때만 채워지는 { 소유자명: 평단가|null } - null은 그 소유자가 이
// 종목을 보유하지 않음(수량 0)을 뜻한다. 단일 자산 상세에서는 undefined로 남아 범례가 병기 없이
// 단일 평단가만 보여준다.
let assetDetailChartMeta = { name: '', isForeign: false, isIndexPoint: false, avgPrice: 0, byOwnerAvgPrice: undefined };
let assetDetailActivePeriod = '6m';

// 단순이동평균(SMA) - 종가 배열 기준으로 계산한다. 데이터가 기간(period)보다 짧으면(신규 상장 등)
// null을 반환해 호출부가 그 MA 자체를 그리지 않고 범례에 '-'로 표시하는 세이프가드로 삼는다.
// 데이터가 있어도 처음 (period-1)개 구간은 아직 평균을 낼 수 없으므로 null로 채워 선이 끊기게 한다.
function computeMA(points, period) {
  if (!points || points.length < period) return null;
  const closes = points.map((p) => p.close);
  const result = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

// 차트 상단 범례 - 이동평균선 색상 점 + 명칭 + 가장 최근 시점의 수치("-"는 데이터 부족) + 평단가.
// byOwnerAvgPrice가 있으면(통합/그룹 상세 - 2인 이상 소유) "전체 평단: X (신랑: Y / 와이프: Z)" 형태로
// 소유자별 평단가를 병기한다 - 보유 수량이 0인 소유자는 평단가가 0/0=NaN이 되므로 '보유없음'으로 표기.
// 단일 자산 상세(byOwnerAvgPrice 없음)는 기존처럼 "평단가: X" 한 줄만 보여준다.
// unitless: VIX/코스피/S&P500 등 지수류 - 가격이 아니라 포인트값이라 $/₩ 어느 통화 기호도 붙이지
// 않는다(macro 팝업 차트 전용, 종목 상세 팝업에서는 항상 false).
function buildMaLegendHtml(maByPeriod, isForeign, avgPrice, byOwnerAvgPrice, unitless) {
  const maColors = getMaColors();
  const maSpans = MA_PERIODS.map((period) => {
    const arr = maByPeriod[period];
    const latest = arr ? arr[arr.length - 1] : null;
    const valueText = (typeof latest !== 'number') ? '-' : (unitless ? fmtNum(latest, 1) : `${isForeign ? '$' : ''}${fmtNum(latest, isForeign ? 2 : 0)}`);
    return `<span style="color:${maColors[period]}">● MA${period}: ${valueText}</span>`;
  });
  const unit = unitless ? '' : (isForeign ? '$' : '₩');
  const fmtPrice = (v) => unitless ? fmtNum(v, 1) : `${unit}${fmtNum(v, isForeign ? 2 : 0)}`;
  let avgSpan = '';
  if (typeof avgPrice === 'number' && avgPrice > 0) {
    const ownerKeys = byOwnerAvgPrice ? Object.keys(byOwnerAvgPrice).sort((a, b) => ownerRank(a) - ownerRank(b)) : [];
    if (ownerKeys.length > 1) {
      // 소유자별 평단가는 실제 차트에 그려지는 점선(getOwnerAvgLineColors(), buildAssetDetailChart 참고)과
      // 같은 색으로 표기해, 범례만 보고도 어느 점선이 누구 것인지 바로 알 수 있게 한다.
      const ownerColors = getOwnerAvgLineColors();
      const detail = ownerKeys.map((o, idx) => {
        const v = byOwnerAvgPrice[o];
        const color = (typeof v === 'number' && v > 0) ? ownerColors[idx % ownerColors.length] : '#94a3b8';
        const text = (typeof v === 'number' && v > 0) ? fmtPrice(v) : '보유없음';
        return `<span style="color:${color}">${escapeHtml(o)}: ${text}</span>`;
      }).join(' / ');
      avgSpan = `<span class="text-slate-400 dark:text-slate-500">┅ 전체 평단: ${fmtPrice(avgPrice)} (${detail})</span>`;
    } else {
      avgSpan = `<span style="color:${getAvgPriceLineColor()}">┅ 평단가: ${fmtPrice(avgPrice)}</span>`;
    }
  }
  return maSpans.join('') + avgSpan;
}

// 종목 상세 모달 전용 일봉 시세 조회 - 실시간 현재가 조회(fetchPriceWithFallback)와 같은 CORS 프록시
// 경쟁 방식을 그대로 재사용하되, range를 2년으로 넓혀 받아온다 - MA120은 최소 120거래일치 과거 데이터가
// 필요하고, 기간 선택 버튼의 [ALL]이 [1Y]와 실질적으로 다른 범위를 보여주려면 애초에 1년보다 긴 원본
// 데이터를 캐시해 둬야 한다(버튼 클릭 시 재조회 없이 이 전체 데이터를 그때그때 필요한 만큼만 잘라
// 쓴다 - assetDetailFullPoints/assetDetailFullMA 참고).
async function fetchDailyHistory(yahooTicker) {
  const target = YAHOO_CHART_API + encodeURIComponent(yahooTicker) + '?interval=1d&range=2y';
  const attempts = [
    async () => {
      const res = await fetchWithTimeout(target, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return safeParseJsonResponse(res);
    },
    ...CORS_PROXIES.map((proxy) => async () => {
      const res = await fetchWithTimeout(proxy.build(target), 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
    })
  ];
  const data = await Promise.any(attempts.map((fn) => fn()));
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result) throw new Error('차트 데이터 없음');
  const timestamps = result.timestamp || [];
  const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const { open = [], high = [], low = [], close = [] } = quote;
  // 캔들스틱 렌더링에는 OHLC가 모두 필요하다 - 넷 중 하나라도 그 봉에서 null이면(휴장/데이터 결측)
  // 그 봉 자체를 건너뛴다(MA는 종가만 쓰므로 close만 있어도 되지만, 캔들과 같은 배열을 공유해야
  // 인덱스가 어긋나지 않는다).
  const points = timestamps
    .map((t, i) => ({ date: new Date(t * 1000), open: open[i], high: high[i], low: low[i], close: close[i] }))
    .filter((p) => [p.open, p.high, p.low, p.close].every((v) => typeof v === 'number'));
  if (points.length === 0) throw new Error('유효한 시세 데이터 없음');
  return points;
}

// 이동평균은 항상 "캐시된 전체 데이터" 기준으로 한 번만 다시 계산해 둔다 - 기간 버튼/줌은 이미 계산된
// 배열을 슬라이스만 하므로 구간 경계에서 MA선이 끊기지 않는다.
function rebuildAssetDetailFullMA() {
  assetDetailFullMA = {};
  MA_PERIODS.forEach((period) => { assetDetailFullMA[period] = computeMA(assetDetailFullPoints, period); });
}

// 기간 선택 버튼([1M][3M][6M][1Y][ALL]) 그룹을 그린다. 활성 버튼 강조는 updatePeriodButtonActiveUI()가 처리한다.
function renderAssetDetailPeriodButtons() {
  const wrap = document.getElementById('assetDetailPeriodButtons');
  wrap.innerHTML = Object.keys(PERIOD_LABELS).map((key) => `
    <button type="button" data-period-btn="${key}" class="period-btn text-[10px] font-semibold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">${PERIOD_LABELS[key]}</button>
  `).join('');
  wrap.querySelectorAll('button[data-period-btn]').forEach((btn) => {
    btn.addEventListener('click', () => buildAssetDetailChart(btn.dataset.periodBtn));
  });
}

function updatePeriodButtonActiveUI(activeKey) {
  document.querySelectorAll('#assetDetailPeriodButtons button[data-period-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.periodBtn === activeKey);
  });
}

// 돋보기 버튼/드래그로 X축(기간)이 바뀐 뒤, 지금 화면에 보이는 구간의 고가/저가만 기준으로 Y축
// 범위를 다시 맞춘다 - 그렇지 않으면 확대해도 Y축이 원래 전체 기간 스케일 그대로 남아 확대한 의미가
// 없어진다. 캔들스틱 데이터는 {x,o,h,l,c} 객체이므로 고가/저가(h/l)로 범위를 잡는다.
function rescaleAssetDetailYAxis(chart) {
  const xScale = chart.scales.x;
  const candleData = chart.data.datasets[0].data;
  let lo = Infinity, hi = -Infinity;
  for (const p of candleData) {
    if (!p || p.x < xScale.min || p.x > xScale.max) continue;
    if (typeof p.l === 'number' && p.l < lo) lo = p.l;
    if (typeof p.h === 'number' && p.h > hi) hi = p.h;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  chart.options.scales.y.min = lo - pad;
  chart.options.scales.y.max = hi + pad;
  chart.update('none'); // 애니메이션 없이 즉시 갱신 - 연속되는 제스처 도중 매번 애니메이션이 걸리면 버벅인다
}

// 돋보기 [+]/[-] 버튼 - chart.zoom()의 기본 동작(현재 보이는 구간의 중앙을 기준으로 확대/축소)을 쓰지
// 않는다. 그렇게 하면 확대할 때마다 최근(오른쪽 끝) 날짜가 화면 밖으로 밀려날 수 있기 때문이다.
// 대신 오른쪽 끝(가장 최근 날짜)은 항상 고정하고, 왼쪽(과거 방향) 경계만 늘리거나 줄여서 "최근 날짜가
// 항상 차트 오른쪽 끝에 정렬된 상태"를 유지한다. chart.zoomScale()은 chartjs-plugin-zoom이 제공하는
// 프로그래매틱 API로, 이 방식으로 범위를 바꿔도 이후의 드래그(pan) 등 다른 제스처와의 내부 상태가
// 계속 일관되게 유지된다(직접 chart.options.scales.x.min/max만 바꾸는 것과 달리 안전).
const ASSET_DETAIL_MIN_ZOOM_SPAN_MS = 3 * 24 * 60 * 60 * 1000; // 최소 3일치 - 지나치게 확대해 캔들이 안 보이는 상황 방지
function zoomAssetDetailChart(factor) {
  const chart = charts.assetDetail;
  if (!chart) return;
  const candleData = chart.data.datasets[0].data;
  if (!candleData || candleData.length === 0) return;
  const overallMin = candleData[0].x;
  const overallMax = candleData[candleData.length - 1].x; // 데이터상 가장 최근 날짜 - 항상 이 값에 고정한다
  const xScale = chart.scales.x;
  const currentMin = (typeof xScale.min === 'number') ? xScale.min : overallMin;
  const currentMax = (typeof xScale.max === 'number') ? xScale.max : overallMax;
  const currentSpan = Math.max(currentMax - currentMin, ASSET_DETAIL_MIN_ZOOM_SPAN_MS);
  const newSpan = Math.max(currentSpan / factor, ASSET_DETAIL_MIN_ZOOM_SPAN_MS);
  const newMin = Math.max(overallMax - newSpan, overallMin);
  chart.zoomScale('x', { min: newMin, max: overallMax }, 'none');
  rescaleAssetDetailYAxis(chart);
}

// 기간 버튼 클릭(또는 최초 표시) 시 호출 - 재조회 없이 캐시된 전체 시세(assetDetailFullPoints/
// assetDetailFullMA)를 해당 기간만큼만 잘라 차트를 새로 그린다. 매번 파괴 후 재생성해서 이전에
// 휠/드래그/핀치로 걸려 있던 줌 상태가 기간 전환 시 항상 깔끔하게 리셋되게 한다.
function buildAssetDetailChart(periodKey) {
  if (assetDetailFullPoints.length === 0) return;
  assetDetailActivePeriod = periodKey;
  updatePeriodButtonActiveUI(periodKey);

  const canvas = document.getElementById('assetDetailChart');
  if (charts.assetDetail) { charts.assetDetail.destroy(); charts.assetDetail = null; }

  const days = PERIOD_TRADING_DAYS[periodKey];
  const total = assetDetailFullPoints.length;
  const startIdx = Number.isFinite(days) ? Math.max(0, total - days) : 0;
  const points = assetDetailFullPoints.slice(startIdx);
  if (points.length === 0) return;

  const textColor = chartTextColor();
  const { name, isForeign, isIndexPoint, avgPrice, byOwnerAvgPrice } = assetDetailChartMeta;

  const maColors = getMaColors();
  const maByPeriod = {};
  MA_PERIODS.forEach((period) => {
    const full = assetDetailFullMA[period];
    maByPeriod[period] = full ? full.slice(startIdx) : null;
  });
  document.getElementById('assetDetailMaLegend').innerHTML = buildMaLegendHtml(maByPeriod, isForeign, avgPrice, byOwnerAvgPrice, isIndexPoint);

  const maDatasets = MA_PERIODS
    .filter((period) => maByPeriod[period])
    .map((period) => ({
      type: 'line',
      label: `MA${period}`,
      data: points.map((p, i) => ({ x: p.date.getTime(), y: maByPeriod[period][i] })),
      borderColor: maColors[period],
      backgroundColor: 'transparent',
      borderWidth: 1.2,
      pointRadius: 0,
      tension: 0.15,
      spanGaps: false, // 기간 초반(평균 낼 데이터가 아직 부족한 구간)은 선을 잇지 않고 끊어서 보여준다
      order: 1
    }));

  // 평균 매수단가 가로 기준선 - 소유자가 2명 이상이면(byOwnerAvgPrice) 전체 평균 한 줄 대신 소유자별로
  // 색이 다른 점선을 각각 그어(getOwnerAvgLineColors(), buildMaLegendHtml의 범례 색상과 동일하게 맞춤)
  // "신랑/와이프 단가가 차트상 두 줄로 표기"되어야 한다는 요구사항을 반영한다. 보유 수량이 0인
  // 소유자(byOwnerAvgPrice[owner]===null)는 선을 그리지 않는다. 소유자가 1명뿐이거나(같은 소유자가
  // 계좌만 나눠 보유) 단일 자산 상세일 때는(byOwnerAvgPrice 없음) 기존처럼 평단가 한 줄만 그린다.
  const ownerAvgKeysForChart = byOwnerAvgPrice ? Object.keys(byOwnerAvgPrice).sort((a, b) => ownerRank(a) - ownerRank(b)) : [];
  let avgPriceDataset = [];
  if (ownerAvgKeysForChart.length > 1) {
    const ownerColors = getOwnerAvgLineColors();
    avgPriceDataset = ownerAvgKeysForChart
      .filter((o) => typeof byOwnerAvgPrice[o] === 'number' && byOwnerAvgPrice[o] > 0)
      .map((o, idx) => ({
        type: 'line',
        label: `${o} 평단가`,
        data: [{ x: points[0].date.getTime(), y: byOwnerAvgPrice[o] }, { x: points[points.length - 1].date.getTime(), y: byOwnerAvgPrice[o] }],
        borderColor: ownerColors[idx % ownerColors.length],
        backgroundColor: 'transparent',
        borderWidth: 1.3,
        borderDash: [6, 4],
        pointRadius: 0,
        order: 0
      }));
  } else if (typeof avgPrice === 'number' && avgPrice > 0) {
    avgPriceDataset = [{
      type: 'line',
      label: '평단가',
      data: [{ x: points[0].date.getTime(), y: avgPrice }, { x: points[points.length - 1].date.getTime(), y: avgPrice }],
      borderColor: getAvgPriceLineColor(),
      backgroundColor: 'transparent',
      borderWidth: 1.3,
      borderDash: [6, 4],
      pointRadius: 0,
      order: 0
    }];
  }

  const candleColors = getCandleColors();
  charts.assetDetail = new Chart(canvas, {
    type: 'candlestick',
    data: {
      datasets: [
        {
          type: 'candlestick',
          label: name,
          data: points.map((p) => ({ x: p.date.getTime(), o: p.open, h: p.high, l: p.low, c: p.close })),
          color: { up: candleColors.up, down: candleColors.down, unchanged: candleColors.up },
          borderColor: { up: candleColors.up, down: candleColors.down, unchanged: candleColors.up },
          order: 2
        },
        ...maDatasets,
        ...avgPriceDataset
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      scales: {
        // [X축 M/D 표기] 기본 date-fns 포맷은 "Feb 13"처럼 영문 월로 나온다 - displayFormats로
        // 'M/d'(월/일, 앞자리 0 없음)를 지정해 "2/13" 형식으로 바꾼다.
        x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'M/d' } }, ticks: { color: textColor, maxTicksLimit: 6 }, grid: { display: false } },
        // [Y축 '만' 단위 축약 - 원화만] 달러(isForeign)는 기존 $ 표기 그대로 두고, 원화는 1만원 이상일
        // 때만 만 단위로 줄인다(예: 23,000 -> "2.3만", 28,500 -> "2.85만") - fmtNum이
        // maximumFractionDigits만 쓰므로 2.30처럼 불필요한 끝자리 0은 자동으로 안 붙는다. 1만원 미만은
        // 기존처럼 원 단위 정수로 그대로 표기한다.
        // [버그 수정 - 확대/축소 시 그래프 영역 크기 변형] Y축 폭은 기본적으로 그때그때 보이는 눈금
        // 레이블의 실제 글자 폭에 맞춰 Chart.js가 매번 다시 계산한다 - 확대/축소로 보이는 가격 구간이
        // 바뀌면 자릿수(예: "23.5만" vs "234,567")도 달라져 Y축 폭이 늘었다 줄었다 하면서 캔들 그리기
        // 영역(plot area) 자체가 실시간으로 좁아지거나 넓어지는 것처럼 보였다. afterFit에서 폭을
        // 고정값으로 강제해 확대/축소·드래그 중에도 그리기 영역 폭이 항상 그대로 유지되게 한다.
        // [버그 수정 - 지수류에 '$' 오표기] VIX/코스피/S&P500/나스닥/다우/미10년물금리는 가격이 아니라
        // 포인트(지수)값인데도 "해외" 티커라는 이유만으로 $ 기호가 붙어 있었다 - isIndexPoint(매크로
        // 브리핑/핵심종목 팝업에서 지수를 열었을 때만 true)면 통화 기호 없이 숫자만 표기한다.
        y: {
          ticks: { color: textColor, callback: (v) => isIndexPoint ? fmtNum(v, 1) : (isForeign ? ('$' + fmtNum(v, 2)) : (v >= 10000 ? fmtNum(v / 10000, 2) + '만' : fmtNum(v, 0))) },
          grid: { color: 'rgba(148,163,184,.15)' },
          afterFit: (scale) => { scale.width = 56; }
        }
      },
      plugins: {
        // 이동평균선/평단가 범례는 차트 위 커스텀 HTML(#assetDetailMaLegend)로 대체하므로 Chart.js 기본
        // 범례는 끈다 - 캔들 + MA 5개 + 평단가까지 합쳐 7개 범례가 뜨면 좁은 모달 폭에서 지저분해진다.
        legend: { display: false },
        // 터치/마우스 이동 시 뜨는 세부 금액 툴팁(크로스헤어)은 요구사항에 따라 완전히 끈다 -
        // 캔들스틱 + 이동평균선만 깔끔하게 보이게 한다.
        tooltip: { enabled: false },
        // [돋보기 버튼 확대/축소 + 드래그 이동] 휠/핀치 제스처는 의도적으로 끈다(요구사항) - 확대/축소는
        // #assetDetailZoomInBtn/#assetDetailZoomOutBtn 버튼(zoomAssetDetailChart)으로만 한다.
        // x축만 확대/이동하며(mode:'x'), 원본 범위(min/max:'original') 밖으로는 벗어나지 못한다.
        // 이동이 끝나면(Complete 콜백) 지금 보이는 구간 기준으로 Y축을 다시 스케일링한다.
        zoom: {
          pan: { enabled: true, mode: 'x', onPanComplete: ({ chart }) => rescaleAssetDetailYAxis(chart) },
          zoom: {
            wheel: { enabled: false },
            pinch: { enabled: false },
            mode: 'x'
          },
          limits: { x: { min: 'original', max: 'original' } }
        }
      }
    }
  });
  // 모달이 방금 열린 직후라 캔버스가 아직 최종 크기를 잡기 전일 수 있으므로, 한 프레임 뒤 resize()를
  // 한 번 더 호출해 모바일/가로세로 전환에서도 차트 비율이 깨지지 않게 한다.
  requestAnimationFrame(() => { if (charts.assetDetail) charts.assetDetail.resize(); });
}

async function renderAssetDetailChart(asset, avgPriceOverride, byOwnerAvgPriceOverride) {
  const canvas = document.getElementById('assetDetailChart');
  const msgEl = document.getElementById('assetDetailChartMsg');
  const legendEl = document.getElementById('assetDetailMaLegend');
  const myToken = ++assetDetailChartToken;
  if (charts.assetDetail) { charts.assetDetail.destroy(); charts.assetDetail = null; }
  legendEl.innerHTML = '';
  document.getElementById('assetDetailPeriodButtons').innerHTML = '';

  const sanitized = sanitizeTicker(asset.ticker);
  if (!sanitized.yahooTicker) {
    canvas.classList.add('hidden');
    msgEl.textContent = '티커가 없는 자산은 주가 차트를 제공할 수 없습니다.';
    msgEl.classList.remove('hidden');
    return;
  }

  canvas.classList.add('hidden');
  msgEl.textContent = '차트 불러오는 중...';
  msgEl.classList.remove('hidden');

  let points;
  try {
    points = await fetchDailyHistory(sanitized.yahooTicker);
  } catch (e) {
    // 모달이 그 사이 닫혔거나 다른 종목으로 다시 열렸으면 이 실패 메시지는 무시한다.
    if (myToken === assetDetailChartToken) msgEl.textContent = '주가 차트를 불러오지 못했습니다.';
    return;
  }
  if (myToken !== assetDetailChartToken) return; // 응답 도착 전 모달이 닫혔거나 다른 종목으로 전환됨

  assetDetailFullPoints = points;
  rebuildAssetDetailFullMA();
  const avgPrice = (typeof avgPriceOverride === 'number') ? avgPriceOverride : num(asset.buyPrice);
  assetDetailChartMeta = { name: asset.name, isForeign: asset.currency === 'USD', isIndexPoint: !!asset.isIndexPoint, avgPrice, byOwnerAvgPrice: byOwnerAvgPriceOverride };

  msgEl.classList.add('hidden');
  canvas.classList.remove('hidden');
  renderAssetDetailPeriodButtons();
  buildAssetDetailChart('6m');
}

/* -------------------------------------------------------------------------
 * 13-1. [종목 분석 & 투자 검토 보고서 모달 전용 차트] 위 assetDetail 차트와 완전히 같은 캔들+이동평균+
 *    기간버튼+확대축소 기능을 제공하되, 이 모달은 미보유 종목(관심종목/검색)도 열 수 있어 평단가
 *    기준선(avgPrice)만 뺀 버전이다 - buildMaLegendHtml에 avgPrice=0을 넘기면 그 부분만 조용히
 *    비어서(기존 함수 그대로 재사용) 별도 분기 없이 처리된다. assetDetail과 별개의 상태(캐시된 전체
 *    시세/이동평균/활성 기간/토큰)를 쓰는 이유는 두 모달이 서로 다른 종목을 독립적으로 보여줄 수
 *    있어야 하기 때문이다 - 여기서 개발 게시 안 되고 있는 사이 다시 assetDetail을 열어도 서로의
 *    차트 상태를 덮어쓰지 않는다.
 * ---------------------------------------------------------------------- */
let stockAnalysisFullPoints = [];
let stockAnalysisFullMA = {};
let stockAnalysisChartMeta = { name: '', isForeign: false };
let stockAnalysisActivePeriod = '6m';
let stockAnalysisChartToken = 0;

function rebuildStockAnalysisFullMA() {
  stockAnalysisFullMA = {};
  MA_PERIODS.forEach((period) => { stockAnalysisFullMA[period] = computeMA(stockAnalysisFullPoints, period); });
}

function renderStockAnalysisPeriodButtons() {
  const wrap = document.getElementById('stockAnalysisPeriodButtons');
  wrap.innerHTML = Object.keys(PERIOD_LABELS).map((key) => `
    <button type="button" data-period-btn="${key}" class="period-btn text-[10px] font-semibold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">${PERIOD_LABELS[key]}</button>
  `).join('');
  wrap.querySelectorAll('button[data-period-btn]').forEach((btn) => {
    btn.addEventListener('click', () => buildStockAnalysisChart(btn.dataset.periodBtn));
  });
}
function updateStockAnalysisPeriodButtonActiveUI(activeKey) {
  document.querySelectorAll('#stockAnalysisPeriodButtons button[data-period-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.periodBtn === activeKey);
  });
}

function rescaleStockAnalysisYAxis(chart) {
  const xScale = chart.scales.x;
  const candleData = chart.data.datasets[0].data;
  let lo = Infinity, hi = -Infinity;
  for (const p of candleData) {
    if (!p || p.x < xScale.min || p.x > xScale.max) continue;
    if (typeof p.l === 'number' && p.l < lo) lo = p.l;
    if (typeof p.h === 'number' && p.h > hi) hi = p.h;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  chart.options.scales.y.min = lo - pad;
  chart.options.scales.y.max = hi + pad;
  chart.update('none');
}

const STOCK_ANALYSIS_MIN_ZOOM_SPAN_MS = 3 * 24 * 60 * 60 * 1000;
function zoomStockAnalysisChart(factor) {
  const chart = charts.stockAnalysis;
  if (!chart) return;
  const candleData = chart.data.datasets[0].data;
  if (!candleData || candleData.length === 0) return;
  const overallMin = candleData[0].x;
  const overallMax = candleData[candleData.length - 1].x;
  const xScale = chart.scales.x;
  const currentMin = (typeof xScale.min === 'number') ? xScale.min : overallMin;
  const currentMax = (typeof xScale.max === 'number') ? xScale.max : overallMax;
  const currentSpan = Math.max(currentMax - currentMin, STOCK_ANALYSIS_MIN_ZOOM_SPAN_MS);
  const newSpan = Math.max(currentSpan / factor, STOCK_ANALYSIS_MIN_ZOOM_SPAN_MS);
  const newMin = Math.max(overallMax - newSpan, overallMin);
  chart.zoomScale('x', { min: newMin, max: overallMax }, 'none');
  rescaleStockAnalysisYAxis(chart);
}

function buildStockAnalysisChart(periodKey) {
  if (stockAnalysisFullPoints.length === 0) return;
  stockAnalysisActivePeriod = periodKey;
  updateStockAnalysisPeriodButtonActiveUI(periodKey);

  const canvas = document.getElementById('stockAnalysisChart');
  if (charts.stockAnalysis) { charts.stockAnalysis.destroy(); charts.stockAnalysis = null; }

  const days = PERIOD_TRADING_DAYS[periodKey];
  const total = stockAnalysisFullPoints.length;
  const startIdx = Number.isFinite(days) ? Math.max(0, total - days) : 0;
  const points = stockAnalysisFullPoints.slice(startIdx);
  if (points.length === 0) return;

  const textColor = chartTextColor();
  const { name, isForeign } = stockAnalysisChartMeta;

  const maColors = getMaColors();
  const maByPeriod = {};
  MA_PERIODS.forEach((period) => {
    const full = stockAnalysisFullMA[period];
    maByPeriod[period] = full ? full.slice(startIdx) : null;
  });
  document.getElementById('stockAnalysisMaLegend').innerHTML = buildMaLegendHtml(maByPeriod, isForeign, 0, undefined);

  const maDatasets = MA_PERIODS
    .filter((period) => maByPeriod[period])
    .map((period) => ({
      type: 'line',
      label: `MA${period}`,
      data: points.map((p, i) => ({ x: p.date.getTime(), y: maByPeriod[period][i] })),
      borderColor: maColors[period],
      backgroundColor: 'transparent',
      borderWidth: 1.2,
      pointRadius: 0,
      tension: 0.15,
      spanGaps: false,
      order: 1
    }));

  const candleColors = getCandleColors();
  charts.stockAnalysis = new Chart(canvas, {
    type: 'candlestick',
    data: {
      datasets: [
        {
          type: 'candlestick',
          label: name,
          data: points.map((p) => ({ x: p.date.getTime(), o: p.open, h: p.high, l: p.low, c: p.close })),
          color: { up: candleColors.up, down: candleColors.down, unchanged: candleColors.up },
          borderColor: { up: candleColors.up, down: candleColors.down, unchanged: candleColors.up },
          order: 2
        },
        ...maDatasets
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'M/d' } }, ticks: { color: textColor, maxTicksLimit: 6 }, grid: { display: false } },
        y: {
          ticks: { color: textColor, callback: (v) => isForeign ? ('$' + fmtNum(v, 2)) : (v >= 10000 ? fmtNum(v / 10000, 2) + '만' : fmtNum(v, 0)) },
          grid: { color: 'rgba(148,163,184,.15)' },
          afterFit: (scale) => { scale.width = 56; }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        zoom: {
          pan: { enabled: true, mode: 'x', onPanComplete: ({ chart }) => rescaleStockAnalysisYAxis(chart) },
          zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: 'x' },
          limits: { x: { min: 'original', max: 'original' } }
        }
      }
    }
  });
  requestAnimationFrame(() => { if (charts.stockAnalysis) charts.stockAnalysis.resize(); });
}

// [종목 분석 모달 전용] 보유 여부와 무관하게 항상 호출된다 - 티커가 없으면(이론상 analyzeTickerForModal이
// 이미 에러로 걸러내지만 방어적으로) 안내 문구만 보여준다.
async function renderStockAnalysisChart(yahooTicker, name, isForeign) {
  const canvas = document.getElementById('stockAnalysisChart');
  const msgEl = document.getElementById('stockAnalysisChartMsg');
  const legendEl = document.getElementById('stockAnalysisMaLegend');
  const myToken = ++stockAnalysisChartToken;
  if (charts.stockAnalysis) { charts.stockAnalysis.destroy(); charts.stockAnalysis = null; }
  legendEl.innerHTML = '';
  document.getElementById('stockAnalysisPeriodButtons').innerHTML = '';

  if (!yahooTicker) {
    canvas.classList.add('hidden');
    msgEl.textContent = '티커가 없는 항목은 주가 차트를 제공할 수 없습니다.';
    msgEl.classList.remove('hidden');
    return;
  }

  canvas.classList.add('hidden');
  msgEl.textContent = '차트 불러오는 중...';
  msgEl.classList.remove('hidden');

  let points;
  try {
    points = await fetchDailyHistory(yahooTicker);
  } catch (e) {
    if (myToken === stockAnalysisChartToken) msgEl.textContent = '주가 차트를 불러오지 못했습니다.';
    return;
  }
  if (myToken !== stockAnalysisChartToken) return;

  stockAnalysisFullPoints = points;
  rebuildStockAnalysisFullMA();
  stockAnalysisChartMeta = { name, isForeign };

  msgEl.classList.add('hidden');
  canvas.classList.remove('hidden');
  renderStockAnalysisPeriodButtons();
  buildStockAnalysisChart('6m');
}
document.getElementById('stockAnalysisZoomInBtn').addEventListener('click', () => zoomStockAnalysisChart(1.3));
document.getElementById('stockAnalysisZoomOutBtn').addEventListener('click', () => zoomStockAnalysisChart(0.7));

/* -------------------------------------------------------------------------
 * 14. 정렬 (테이블 헤더 클릭)
 * ---------------------------------------------------------------------- */
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.sort.key === key) { state.sort.dir *= -1; }
    else { state.sort.key = key; state.sort.dir = 1; }
    renderTable();
  });
});

/* -------------------------------------------------------------------------
 * 15. 필터 이벤트
 * [PART B - 상단 필터 독립화] 이 3개 필터(소유자/자산군/계좌)는 이제 상단 도넛 차트 3개(renderCharts)
 * 에만 영향을 준다 - 아래 자산 관리 목록(renderTable)은 tableAssets()를 써서 항상 전체를 보여주므로
 * 여기서 더 이상 renderTable()을 호출하지 않는다(상태 간섭 완전 차단).
 * ---------------------------------------------------------------------- */
document.getElementById('filterOwner').addEventListener('change', (e) => { state.filters.owner = e.target.value; renderCharts(); });
document.getElementById('filterCategory').addEventListener('change', (e) => { state.filters.category = e.target.value; renderCharts(); });
document.getElementById('filterAccount').addEventListener('change', (e) => { state.filters.account = e.target.value; renderCharts(); });
document.getElementById('filterResetBtn').addEventListener('click', () => {
  state.filters = { owner: 'ALL', category: 'ALL', account: 'ALL' };
  populateFilterOptions();
  renderCharts();
});

// [자산 관리 카드 - 계층별 독립 아코디언] 4개 섹션(전체/소유자별/국내해외별/자산군별) 각각의 헤더를
// 탭하면 그 섹션만 접히거나 펼쳐진다 - 서로 배타적이지 않고 동시에 여러 개를 펼쳐 둘 수 있다.
Object.keys(ASSET_GROUP_MODE_SUFFIX).forEach((mode) => {
  const suffix = ASSET_GROUP_MODE_SUFFIX[mode];
  document.getElementById(`assetGroupAccordionBtn${suffix}`).addEventListener('click', () => {
    assetGroupAccordionOpen[mode] = !assetGroupAccordionOpen[mode];
    setAccordionOpen(document.getElementById(`assetGroupAccordionBody${suffix}`), document.getElementById(`assetGroupAccordionChevron${suffix}`), assetGroupAccordionOpen[mode]);
  });
});

// [PART B - 검색 팝업화] 자산 관리 목록 상단의 검색창은 더 이상 입력할 때마다 목록을 실시간으로
// 필터링하지 않는다(tableAssets()가 항상 전체를 그린다) - Enter 또는 [검색] 버튼을 눌렀을 때만
// searchAssetsByQuery()로 검색해 결과를 팝업(assetSearchResultModal)으로 보여주거나, 매칭이 없으면
// 안내 알림을 띄운다.
document.getElementById('assetSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runAssetSearch(e.target.value);
});
document.getElementById('assetSearchBtn').addEventListener('click', () => {
  runAssetSearch(document.getElementById('assetSearchInput').value);
});


/* -------------------------------------------------------------------------
 * 16. 환율 수동 입력
 * ---------------------------------------------------------------------- */
document.getElementById('exchangeRateInput').addEventListener('input', (e) => {
  state.exchangeRate = num(e.target.value) || state.exchangeRate;
  persistRate();
  renderAll();
});

document.getElementById('dailyChangeInput').addEventListener('input', (e) => {
  state.dailyChangeRate = num(e.target.value);
  persistDaily();
  renderKPIs();
});

// 공용 무료 API/프록시는 응답 자체가 없이 무한 대기(hang)하는 경우가 있어, 반드시 타임아웃을 걸어
// 일정 시간 내 응답이 없으면 실패로 간주하고 즉시 다음 폴백 단계로 넘어가게 한다.
// accept 헤더는 일부 API/프록시가 콘텐츠 협상에 사용하므로 명시해준다 - 단, User-Agent는 브라우저가
// fetch()에서 덮어쓰기를 금지한 forbidden header라 여기서 설정해도 무시된다(웹 표준 보안 정책,
// Android WebView/Chrome 동일). CORS 차단의 실질적인 해결책은 프록시 우회뿐이라 위 다중 폴백으로 대응한다.
async function fetchWithTimeout(url, timeoutMs = 12000, acceptHeader = 'application/json, text/plain, */*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: acceptHeader } });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`시간 초과(${timeoutMs / 1000}초)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 프록시 서버가 HTTP 200 OK와 함께 JSON이 아닌 응답(레이트리밋/점검 안내 HTML 페이지, 빈 문자열 등)을
// 돌려주는 경우가 실제로 있다. res.json()/JSON.parse를 그대로 쓰면 이해하기 어려운 네이티브
// SyntaxError("Unexpected token '<'..." 등)를 던지는데, 어느 지점에서 왜 실패했는지 알기 어렵고
// 프록시별 parse 구현마다 이 처리를 각자 반복하면 빠뜨리기 쉽다. 이 두 헬퍼로 항상 안전하게 감싸서
// 실패 시 명확한 에러 메시지로 변환하고(호출부는 이미 Promise.allSettled로 실패를 흡수하므로) 다음
// 소스로 자연스럽게 넘어가게 한다.
function safeParseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('응답 파싱 실패(JSON 형식이 아님 - HTML 에러 페이지 등)');
  }
}
async function safeParseJsonResponse(res) {
  const text = await res.text();
  return safeParseJsonText(text);
}

