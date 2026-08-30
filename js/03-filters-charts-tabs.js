/* -------------------------------------------------------------------------
 * 9. 필터 옵션 채우기
 * ---------------------------------------------------------------------- */
function populateFilterOptions() {
  const owners = [...new Set(state.assets.map(a => a.owner))].filter(Boolean).sort((a, b) => ownerRank(a) - ownerRank(b));
  const categories = [...new Set(state.assets.map(a => a.category))].filter(Boolean);
  const accounts = [...new Set(state.assets.map(a => a.accountType))].filter(Boolean);

  fillSelect('filterOwner', owners, '전체 소유자', state.filters.owner);
  fillSelect('filterCategory', categories, '전체 자산군', state.filters.category);
  fillSelect('filterAccount', accounts, '전체 계좌', state.filters.account);
}

function fillSelect(id, values, allLabel, current) {
  const el = document.getElementById(id);
  const opts = ['<option value="ALL">' + allLabel + '</option>']
    .concat(values.sort().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  el.innerHTML = opts.join('');
  el.value = values.includes(current) ? current : 'ALL';
}

/* -------------------------------------------------------------------------
 * 10. 차트 렌더링 (필터가 적용된 데이터 기준)
 * ---------------------------------------------------------------------- */
function chartTextColor() {
  return document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#475569';
}
function chartBorderColor() {
  return document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff';
}

// 파이/도넛 차트 3종이 공유하는 legend + tooltip + datalabels 설정.
// - legend: PC/태블릿에서는 "카테고리: 45.0% (1,200만원)" 형태로 비중과 금액을 함께 표기하지만,
//   모바일 3열 가로 배치에서는 칸이 좁아 그대로 쓰면 줄바꿈/잘림이 심해서 카테고리 이름만 짧게 보여준다
//   (상세 비중·금액은 조각 위 datalabels와 툴팁으로 계속 확인 가능).
// - datalabels: 조각 위에 항상 %를 표시하되(호버 불필요), 작은 조각은 겹침 방지를 위해 숨기고 툴팁으로만 확인
//   (숨김 기준을 모바일에서는 더 널널하게 잡는다 - 좁은 도넛에서는 작은 글자가 더 쉽게 겹치므로).
function pieChartPlugins(textColor, isMobile) {
  return {
    legend: {
      position: 'bottom',
      labels: {
        color: textColor,
        boxWidth: isMobile ? 6 : 10,
        padding: isMobile ? 4 : 10,
        font: { size: isMobile ? 8 : 11 },
        generateLabels: (chart) => {
          const ds = chart.data.datasets[0];
          const total = ds.data.reduce((s, v) => s + v, 0);
          return chart.data.labels.map((label, i) => {
            const value = ds.data[i];
            const pct = total !== 0 ? (value / total * 100) : 0;
            return {
              text: isMobile ? `${label}` : `${label}: ${fmtNum(pct, 1)}% (${fmtKRW(value)})`,
              fillStyle: ds.backgroundColor[i],
              strokeStyle: ds.backgroundColor[i],
              fontColor: textColor,
              index: i
            };
          });
        }
      }
    },
    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtKRW(ctx.raw)} (${fmtNum(ctx.parsed / ctx.dataset.data.reduce((s, v) => s + v, 0) * 100, 1)}%)` } },
    datalabels: {
      color: '#ffffff',
      font: { size: isMobile ? 8 : 11, weight: 'bold' },
      textStrokeColor: 'rgba(0,0,0,0.35)',
      textStrokeWidth: isMobile ? 1 : 2,
      formatter: (value, ctx) => {
        const total = ctx.chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
        const pct = total !== 0 ? (value / total * 100) : 0;
        return pct < (isMobile ? 6 : 3) ? '' : fmtNum(pct, 1) + '%';
      }
    }
  };
}

const DOMESTIC_CHART_COLORS = { '국내': '#64748b', '해외': '#f59e0b' }; // 테이블의 국내/해외 뱃지 색상과 통일
const CHART_ZOOM_TITLES = { category: '자산군별 비중 상세', owner: '소유자별 비중 상세', domestic: '국내/해외 비중 상세' };

// 3개 비중 차트(자산군별/소유자별/국내해외별)의 라벨·값·색상 계산 로직을 한 곳에 모은다 - 작은
// 대시보드 차트와 확대 모달 차트가 이 함수 하나를 공유해서 두 화면의 숫자가 항상 일치한다.
function buildPieChartData(key, rows) {
  if (key === 'owner') {
    const byOwner = {};
    rows.forEach(r => { byOwner[r.owner] = (byOwner[r.owner] || 0) + r.curAmount; });
    const labels = Object.keys(byOwner).sort((a, b) => ownerRank(a) - ownerRank(b));
    return { type: 'pie', labels, values: labels.map(o => byOwner[o]), colors: labels.map((o, i) => colorFor(o, i + 3)) };
  }
  if (key === 'domestic') {
    const byDomestic = { '국내': 0, '해외': 0 };
    rows.forEach(r => { byDomestic[r.isDomestic] = (byDomestic[r.isDomestic] || 0) + r.curAmount; });
    const labels = Object.keys(byDomestic).filter(k => byDomestic[k] > 0);
    return { type: 'doughnut', labels, values: labels.map(k => byDomestic[k]), colors: labels.map(k => DOMESTIC_CHART_COLORS[k]) };
  }
  const byCategory = {};
  rows.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.curAmount; });
  const labels = Object.keys(byCategory);
  return { type: 'doughnut', labels, values: labels.map(c => byCategory[c]), colors: labels.map((c, i) => colorFor(c, i)) };
}

function renderCharts() {
  const rows = filteredAssets().map(a => ({ ...a, ...calcRow(a) }));
  const textColor = chartTextColor();
  const borderColor = chartBorderColor();
  // 3개 비중 차트가 모바일에서도 항상 가로 3열로 나란히 배치되므로(요청에 따름), 좁은 화면에서는
  // 범례/데이터라벨 글자를 더 작게·짧게 줄인다 - sm 브레이크포인트(640px)와 동일 기준.
  const isMobile = window.innerWidth < 640;

  // [차트 확대 모달 전환] 예전에는 이 작은 차트를 탭하면 Chart.js 기본 툴팁이 좁은 화면에 뜨는 게
  // 전부였다 - 이제는 탭/클릭하면 openChartZoomModal()이 같은 데이터를 큼직하게 다시 그려서 보여주므로,
  // 작은 차트 쪽 툴팁은 꺼서(tooltip.enabled=false) 서로 겹치지 않게 한다.
  ['category', 'owner', 'domestic'].forEach((key) => {
    const d = buildPieChartData(key, rows);
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(key + 'Chart'), {
      type: d.type,
      data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: d.colors, borderWidth: 2, borderColor }] },
      plugins: [ChartDataLabels],
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: () => openChartZoomModal(key),
        plugins: { ...pieChartPlugins(textColor, isMobile), tooltip: { enabled: false } }
      }
    });
  });
}

// 비중 차트 확대 모달 - 대시보드의 작은 차트와 똑같은 데이터(buildPieChartData)를 더 큰 캔버스에
// 다시 그리고, 여기서는 툴팁도 켜서 정확한 금액/비중을 확인할 수 있게 한다.
function openChartZoomModal(key) {
  document.getElementById('chartZoomModalTitle').textContent = CHART_ZOOM_TITLES[key] || '비중 상세';
  document.getElementById('chartZoomModal').classList.remove('hidden');
  pushModalHistoryState();

  const rows = filteredAssets().map(a => ({ ...a, ...calcRow(a) }));
  const textColor = chartTextColor();
  const borderColor = chartBorderColor();
  const d = buildPieChartData(key, rows);

  if (charts.chartZoom) charts.chartZoom.destroy();
  const chartZoomCanvas = document.getElementById('chartZoomCanvas');
  charts.chartZoom = new Chart(chartZoomCanvas, {
    type: d.type,
    data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: d.colors, borderWidth: 2, borderColor }] },
    plugins: [ChartDataLabels],
    options: { responsive: true, maintainAspectRatio: false, plugins: pieChartPlugins(textColor, false) }
  });
  // 모달이 hidden 상태(display:none)일 때는 캔버스 크기를 0으로 인식하므로, 보여준 직후 한 프레임
  // 기다렸다가 resize()를 강제로 한 번 더 호출해 올바른 크기로 다시 그리게 한다.
  requestAnimationFrame(() => { if (charts.chartZoom) charts.chartZoom.resize(); });
  // [버그 수정 - 터치 시 금액 툴팁이 안 사라짐] 다른 그래프 팝업과 동일하게 3초 뒤 자동으로 닫는다.
  chartZoomCanvas.onclick = () => scheduleDailyPnlTooltipHide(charts.chartZoom);
}

function closeChartZoomModal(viaBackButton) {
  document.getElementById('chartZoomModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('closeChartZoomModalBtn').addEventListener('click', () => closeChartZoomModal());
document.getElementById('chartZoomModal').addEventListener('click', (e) => {
  if (e.target.id === 'chartZoomModal') closeChartZoomModal();
});

/* -------------------------------------------------------------------------
 * 10-1. 탭 전환
 * ---------------------------------------------------------------------- */
// [버그 수정 - 탭 이동 후에도 아코디언이 펼쳐진 채로 남는 문제] 아코디언을 펼친 채로 다른 탭에
// 갔다가 돌아오면 그대로 펼쳐져 있던 문제 - 탭을 전환할 때마다 앱 안의 모든 드롭다운/아코디언을
// 기본(접힘) 상태로 되돌린다. investmentDetail/transactions/rebalance 탭의 아코디언은 상태 변수만
// 초기화해도 충분하다 - switchTab() 아래에서 그 탭의 render 함수가 곧바로 다시 호출되면서(이미 각
// render 함수 안에 setAccordionOpen(..., 그 상태 변수) 호출이 내장돼 있음) 자연히 접힌 채로 다시
// 그려진다. 반면 대시보드 탭(RISK 관리/Top5 보유종목)의 아코디언은 탭을 전환해도 renderAll()이 당장
// 다시 호출되지 않으므로, 이미 그려져 있는 DOM을 여기서 직접 접어준다.
function resetAllAccordionsOnTabSwitch() {
  riskyAccordionOpen = false;
  const riskyBody = document.getElementById('riskyAccordionBody');
  const riskyChevron = document.getElementById('riskyAccordionChevron');
  if (riskyBody && riskyChevron) setAccordionOpen(riskyBody, riskyChevron, false);

  topHoldingsAccordionOpen.domestic = false;
  topHoldingsAccordionOpen.foreign = false;
  reapplyTopHoldingsAccordionHeights();

  Object.keys(rebalanceGuideAccordionOpen).forEach((k) => { rebalanceGuideAccordionOpen[k] = false; });
  detailCardAccordionOpen.rate = false;
  detailCardAccordionOpen.allocation = false;
  txListAccordionOpen = false;
  Object.keys(assetGroupAccordionOpen).forEach((k) => { assetGroupAccordionOpen[k] = false; });
  // [버그 수정 - 목표비중설정 탭 리밸런싱 결과 아코디언] 국내/카테고리별 리밸런싱 결과 3개 아코디언도
  // 펼쳐둔 채로 다른 탭에 갔다가 돌아오면 그대로 펼쳐져 있었다 - 위와 동일한 패턴(상태만 초기화하면
  // renderRebalance() -> refreshRebalanceResultAccordionHeights()가 곧 다시 그리며 접어준다).
  Object.keys(rebalanceResultAccordionOpen).forEach((k) => { rebalanceResultAccordionOpen[k] = false; });
}

// [버그 수정 - 탭 전환 시 스크롤 위치 초기화] 목록/표를 한참 스크롤한 상태에서 다른 탭으로 이동하면
// 새 탭도 그 스크롤 위치 그대로 보여 콘텐츠 중간부터 시작하는 것처럼 보였다 - 상위 탭(switchTab)과
// 하위 탭(switchRebalanceSubTab) 전환 모두 항상 화면 맨 위로 되돌린다.
function scrollToTopOnTabSwitch() {
  window.scrollTo(0, 0);
}

function switchTab(tab) {
  resetAllAccordionsOnTabSwitch();
  scrollToTopOnTabSwitch();
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.getElementById('tabPanelDashboard').classList.toggle('hidden', tab !== 'dashboard');
  document.getElementById('tabPanelInvestmentDetail').classList.toggle('hidden', tab !== 'investmentDetail');
  document.getElementById('tabPanelTransactions').classList.toggle('hidden', tab !== 'transactions');
  document.getElementById('tabPanelRebalance').classList.toggle('hidden', tab !== 'rebalance');
  // 숨겨져 있던 탭의 캔버스는 크기가 0이었으므로, 보여줄 때 다시 렌더링해야 차트가 정상적으로 그려진다.
  if (tab === 'investmentDetail') renderInvestmentDetailTab();
  if (tab === 'transactions') renderTransactionsTab();
  // [리밸런싱/자산예측 통합] 이 탭에 들어올 때마다 마지막으로 보고 있던 서브탭(rebalanceSubTab)을
  // 그대로 다시 그린다 - tabPanelProjection이 물리적으로 tabPanelRebalance 안에 중첩돼 있으므로
  // (HTML 참고), 그 hidden 여부는 여기가 아니라 switchRebalanceSubTab()이 전담한다.
  if (tab === 'rebalance') switchRebalanceSubTab(rebalanceSubTab);
  lucide.createIcons();
}
document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// [리밸런싱/자산예측 통합] 2단계(서브) 탭 전환 - 최상위 탭 상태(state.activeTab)와는 별개로 관리한다.
// 'target'(목표 비중 설정 + 결과), 'guide'(종목별 실행 가이드), 'projection'(미래 예측) 3개.
let rebalanceSubTab = 'target';
function switchRebalanceSubTab(subTab) {
  // [버그 수정 - 하위 탭 전환] switchTab()과 별개로 이 하위 탭(목표비중설정/실행가이드/미래예측)끼리만
  // 오갈 때도(상위 탭은 그대로 'rebalance') 아코디언 초기화·스크롤 초기화가 똑같이 적용돼야 한다.
  resetAllAccordionsOnTabSwitch();
  scrollToTopOnTabSwitch();
  rebalanceSubTab = subTab;
  document.querySelectorAll('.rebalance-subtab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.subtab === subTab));
  document.getElementById('rebalanceSubTarget').classList.toggle('hidden', subTab !== 'target');
  document.getElementById('rebalanceSubGuide').classList.toggle('hidden', subTab !== 'guide');
  document.getElementById('tabPanelProjection').classList.toggle('hidden', subTab !== 'projection');
  if (subTab === 'target' || subTab === 'guide') renderRebalance();
  if (subTab === 'projection') renderProjection();
  lucide.createIcons();
}
document.querySelectorAll('.rebalance-subtab-btn').forEach((btn) => btn.addEventListener('click', () => switchRebalanceSubTab(btn.dataset.subtab)));

/* -------------------------------------------------------------------------
 * 10-1-1. 모바일 좌우 스와이프로 메인 탭 전환
 *    - X축 이동거리가 Y축보다 크고 최소 임계값(50px)을 넘을 때만 스와이프로 인정한다(세로 스크롤
 *      오인식 방지). 표/차트처럼 자체적으로 가로 스크롤이 있는 영역(.overflow-x-auto, 탭 바 자신도
 *      포함)에서 시작한 터치는 애초에 추적하지 않아 그 영역의 좌우 스크롤과 충돌하지 않는다. 모달이
 *      열려 있을 때도 배경 탭이 바뀌면 혼란스러우므로 추적하지 않는다. preventDefault를 전혀 호출하지
 *      않으므로(passive 리스너) 세로 스크롤 등 기존 터치 동작은 전혀 방해받지 않는다.
 * ---------------------------------------------------------------------- */
const SWIPE_TAB_ORDER = ['dashboard', 'investmentDetail', 'transactions', 'rebalance'];
const SWIPE_MIN_DISTANCE = 50; // px
// [중첩 모달 순서 주의] findOpenModalId()는 이 배열에서 "먼저 찾히는" id를 열려 있는 모달로 간주하므로,
// 다른 모달 위에 중첩되어 열리는 2차 모달(stockAllocationModal → rebalanceTargetModal 위,
// stockSearchModal → transactionModal 위)은 반드시 그 부모보다 앞쪽에 와야 뒤로가기 시 2차 모달부터
// 정확히 닫힌다.
// [자산 추가 팝업 개선] stockSearchModal이 이제 assetModal 위에도 뜰 수 있게 되어(기존엔 transactionModal
// 위에서만 떴다), assetModal보다 앞쪽에 와야 한다 - 배열에서 더 앞에 있는 항목이 뒤로가기 시 먼저
// 닫힌다(자식이 부모보다 앞에 와야 자식부터 닫힘, 위 주석 참고).
// [핵심종목 실시간 팝업이 위험진단 팝업보다 위에 뜸] coreStocksModal(z-[65])이 riskAlertModal(z-50)
// 보다 시각적으로 위에 있으므로, 뒤로가기도 그 순서(위에 있는 것부터)로 닫혀야 자연스럽다 - 배열에서
// coreStocksModal을 riskAlertModal보다 앞에 둔다(앞에 있는 항목이 먼저 닫힘, 위 주석 참고).
const SWIPE_MODAL_IDS = ['stockSearchModal', 'assetModal', 'transactionModal', 'assetDetailModal', 'chartZoomModal', 'stockAllocationModal', 'rebalanceTargetModal', 'dailyPnlModal', 'totalValueModal', 'totalProfitModal', 'importChoiceModal', 'exchangeRateModal', 'scenarioRateManagerModal', 'coreStocksModal', 'riskAlertModal', 'riskDetailModal', 'assetSearchResultModal', 'syncSettingsModal', 'stockAnalysisModal'];
let swipeStartX = 0, swipeStartY = 0, swipeTracking = false;

function isAnyModalOpen() {
  return SWIPE_MODAL_IDS.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

/* -------------------------------------------------------------------------
 * 10-1-2. 모바일 뒤로가기(popstate) 스마트 핸들링
 *    - 모달이 열릴 때마다 history.pushState로 히스토리 레이어를 하나 쌓아둔다. 물리 뒤로가기를
 *      누르면 popstate가 그 레이어만 소비하며, 이때 열려 있는 모달을 찾아 닫기만 하고 실제 페이지
 *      이동은 일으키지 않는다(모달 close 함수들이 모두 hidden 클래스만 토글하므로 popstate 핸들러가
 *      직접 hidden을 추가해도 안전 - 각 close 함수에 viaBackButton=true를 넘겨 popModalHistoryIfNeeded의
 *      추가 history.back() 호출을 막는다. 안 그러면 이 popstate 안에서 또 back()을 호출해 상태가 꼬인다).
 *    - 모달이 없는 메인 화면 상태에서 뒤로가기를 누르면 "한 번 더 누르면 종료" 토스트를 띄우고 히스토리
 *      가드 상태를 다시 쌓아 페이지에 머무른다. 2초 안에 다시 누르면 가드를 재적립하지 않고 그대로
 *      흘려보내 실제로 앱을 벗어나게 둔다(표준 더블백 종료 패턴).
 * ---------------------------------------------------------------------- */
// 모달 id -> "물리 뒤로가기로 닫을 때" 쓸 함수.
const MODAL_CLOSE_FNS = {
  assetModal: (viaBack) => closeModal(viaBack),
  stockSearchModal: (viaBack) => closeStockSearchModal(viaBack),
  transactionModal: (viaBack) => closeTransactionModal(viaBack),
  assetDetailModal: (viaBack) => closeAssetDetailModal(viaBack),
  chartZoomModal: (viaBack) => closeChartZoomModal(viaBack),
  rebalanceTargetModal: (viaBack) => closeRebalanceTargetModal(viaBack),
  dailyPnlModal: (viaBack) => closeDailyPnlModal(viaBack),
  stockAllocationModal: (viaBack) => closeStockAllocationModal(viaBack),
  totalValueModal: (viaBack) => closeTotalValueModal(viaBack),
  totalProfitModal: (viaBack) => closeTotalProfitModal(viaBack),
  importChoiceModal: (viaBack) => closeImportChoiceModal('cancel', viaBack),
  exchangeRateModal: (viaBack) => closeExchangeRateModal(viaBack),
  scenarioRateManagerModal: (viaBack) => closeScenarioRateManagerModal(viaBack),
  riskAlertModal: (viaBack) => closeRiskAlertModal(viaBack),
  coreStocksModal: (viaBack) => closeCoreStocksModal(viaBack),
  riskDetailModal: (viaBack) => closeRiskDetailModal(viaBack),
  assetSearchResultModal: (viaBack) => closeAssetSearchResultModal(viaBack),
  syncSettingsModal: (viaBack) => closeSyncSettingsModal(viaBack),
  stockAnalysisModal: (viaBack) => closeStockAnalysisModal(viaBack)
};

function findOpenModalId() {
  return SWIPE_MODAL_IDS.find((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  }) || null;
}

let suppressNextPopstate = false;

function pushModalHistoryState() {
  history.pushState({ smAppModal: true }, '');
}

// 모달을 UI(버튼/오버레이 클릭 등)로 닫을 때 호출한다 - 물리 뒤로가기로 닫을 때는(viaBackButton=true)
// 호출하지 않는다(이미 popstate가 그 히스토리 레이어를 소비한 뒤이므로 또 back()을 부르면 한 단계
// 더 넘어가 버린다).
function popModalHistoryIfNeeded() {
  if (history.state && history.state.smAppModal) {
    suppressNextPopstate = true;
    history.back();
  }
}

let lastMainBackPressAt = 0;
const MAIN_BACK_EXIT_WINDOW_MS = 2000;

window.addEventListener('popstate', () => {
  if (suppressNextPopstate) { suppressNextPopstate = false; return; }

  const openId = findOpenModalId();
  if (openId) {
    const fn = MODAL_CLOSE_FNS[openId];
    if (fn) fn(true); else document.getElementById(openId).classList.add('hidden');
    return;
  }

  // 모달이 없는 메인 화면 상태 - 더블백 종료 처리.
  const now = Date.now();
  if (now - lastMainBackPressAt < MAIN_BACK_EXIT_WINDOW_MS) {
    // 2초 안에 다시 눌렀다 - 가드 상태를 다시 쌓지 않고 그대로 흘려보내 실제로 이전 페이지로
    // 이동하거나(브라우저 탭) 앱이 종료되게(PWA/APK) 둔다.
    return;
  }
  lastMainBackPressAt = now;
  history.pushState({ smAppGuard: true }, ''); // 뒤로가기 1회분을 다시 흡수해 페이지에 머무른다
  showToast('뒤로 버튼을 한 번 더 누르면 종료됩니다.', 'info', 2000);
});

// [ESC 키로 모달 닫기] 열려 있는 모달이 있으면 SWIPE_MODAL_IDS/MODAL_CLOSE_FNS 레지스트리를 그대로
// 재사용해 닫는다(뒤로가기 처리와 동일한 대상 목록 - 새 모달을 추가할 때 여기를 또 고칠 필요가 없다).
// viaBackButton=false로 호출해 popModalHistoryIfNeeded()가 함께 실행되게 한다(사용자가 직접 UI로
// 닫은 것이므로, 물리 뒤로가기 때와 달리 쌓아둔 히스토리 레이어를 여기서 되돌려줘야 한다).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const openId = findOpenModalId();
  if (!openId) return;
  const fn = MODAL_CLOSE_FNS[openId];
  if (fn) fn(false); else document.getElementById(openId).classList.add('hidden');
});

// 최초 로드 시 더미 히스토리 항목을 하나 쌓아둔다 - 이게 없으면 첫 물리 뒤로가기가 곧바로 앱을
// 벗어나 버려(popstate가 아예 안 뜨거나 페이지를 떠남) 메인 화면에서의 더블백 종료 처리 자체가
// 성립하지 않는다.
history.pushState({ smAppGuard: true }, '');

// [Chrome 히스토리 조작 방지(History Manipulation Intervention) 대비] 사용자 제스처 없이(페이지 로드
// 스크립트 실행 중) 쌓은 pushState는 일부 최신 브라우저가 "제스처 없는 히스토리 조작"으로 간주해
// 실제 뒤로가기 시 건너뛰어 버릴 수 있다(그러면 첫 뒤로가기에 가드 없이 바로 앱을 벗어나 버린다).
// 사용자의 첫 실제 터치/클릭/키/스크롤 입력이 들어오는 즉시, 아직 가드가 없다면 제스처에 연결된
// 상태로 한 번 더 쌓아 재확인한다 - 이미 정상적으로 쌓여 있으면(현재 state가 가드/모달이면) 아무 것도
// 하지 않는다. touchstart/mousedown/keydown만으로는 마우스 휠·트랙패드 스크롤(터치 드래그가 아니라
// wheel 이벤트로만 들어오는 스크롤)을 못 잡아서(첫 동작이 스크롤뿐이면 가드가 안 쌓인 채로 남는 문제가
// 있었다) wheel/scroll도 함께 듣는다. scroll은 버블링하지 않으므로 캡처 단계에서 들어야 window까지
// 확실히 도달한다.
['touchstart', 'mousedown', 'keydown', 'wheel'].forEach((evt) => {
  window.addEventListener(evt, armHistoryGuardOnce, { once: true, passive: true });
});
window.addEventListener('scroll', armHistoryGuardOnce, { once: true, passive: true, capture: true });

function armHistoryGuardOnce() {
  if (!(history.state && (history.state.smAppGuard || history.state.smAppModal))) {
    history.pushState({ smAppGuard: true }, '');
  }
}

const swipeSurface = document.getElementById('app');
swipeSurface.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1 || isAnyModalOpen() || e.target.closest('.overflow-x-auto')) {
    swipeTracking = false;
    return;
  }
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeTracking = true;
}, { passive: true });

swipeSurface.addEventListener('touchend', (e) => {
  if (!swipeTracking) return;
  swipeTracking = false;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return;

  const idx = SWIPE_TAB_ORDER.indexOf(state.activeTab);
  if (idx === -1) return;
  const nextIdx = dx < 0 ? idx + 1 : idx - 1; // 왼쪽으로 스와이프 -> 다음 탭, 오른쪽으로 -> 이전 탭
  if (nextIdx < 0 || nextIdx >= SWIPE_TAB_ORDER.length) return; // 첫/마지막 탭 경계에서는 무반응
  switchTab(SWIPE_TAB_ORDER[nextIdx]);
}, { passive: true });

// [모바일 발견성 개선] 탭 내비게이션이 화면 폭보다 넓어 가로 스크롤이 필요한 경우에만 오른쪽 페이드
// 힌트(#tabScrollHint)를 보여준다 - 스크롤이 필요 없는 넓은 화면이나, 이미 끝까지 스크롤해 더 볼
// 탭이 없는 상태에서는 숨겨서 불필요한 시각적 잡음을 만들지 않는다.
function updateTabScrollHint() {
  const el = document.getElementById('tabScrollContainer');
  const hint = document.getElementById('tabScrollHint');
  if (!el || !hint) return;
  const hasMoreToScroll = (el.scrollWidth - el.clientWidth - el.scrollLeft) > 4;
  hint.classList.toggle('hidden', !hasMoreToScroll);
}
(() => {
  const el = document.getElementById('tabScrollContainer');
  if (!el) return;
  el.addEventListener('scroll', updateTabScrollHint);
  window.addEventListener('resize', updateTabScrollHint);
  updateTabScrollHint();
})();

