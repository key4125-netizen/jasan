/* -------------------------------------------------------------------------
 * 23. 데이터 초기화
 * ---------------------------------------------------------------------- */
document.getElementById('resetDataBtn').addEventListener('click', () => {
  if (!confirm('모든 자산 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  // [데이터 초기화 강화] 예전엔 state의 주요 필드만 비우고 그에 대응하는 persist*()만 다시 호출했다 -
  // 그 결과 이 앱이 만든 적 있는 다른 localStorage 키(특히 일별 손익 스냅샷 sam_daily_snapshot_v1,
  // 소급 백필 완료 표시 sam_daily_backfill_done_ids_v1 등)는 그대로 남아있어서, 초기화 후에도 [일별
  // 손익 추이] 그래프 등에 예전 데이터가 계속 보이는 문제가 있었다. 이제 이 앱이 쓰는 모든 키(sam_
  // 접두사)를 하드코딩된 목록 없이 통째로 지운다 - 새 기능이 새 키를 추가해도 자동으로 다 걸린다.
  // 다크모드(sam_dark_mode_v5)는 재무 데이터가 아니라 순수 화면 설정이라 예외로 남긴다. LS_HAS_LAUNCHED도
  // 반드시 함께 남겨야 한다 - 이 키까지 지워버리면 다음 실행 때 loadState()가 "진짜 첫 실행"으로 착각해
  // 방금 비운 자산을 다시 sampleAssets()로 채워버린다(LS_HAS_LAUNCHED 선언부 주석 참고).
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sam_') && k !== LS_DARKMODE && k !== LS_HAS_LAUNCHED)
    .forEach((k) => localStorage.removeItem(k));

  // [가족 동기화도 함께 초기화] 위 와일드카드 삭제에 sam_sync_* 키도 자동 포함되지만, 메모리상의
  // syncState는 별도로 리셋해야 한다 - 안 그러면 로컬 데이터를 방금 비웠는데도 이번 세션에서는 여전히
  // "동기화 켜짐" 상태로 남아, schedulePush()가 곧바로 방금 비운 빈 데이터를 클라우드에 올려 배우자
  // 기기의 데이터까지 통째로 지워버리는 사고로 이어질 수 있다.
  syncState = { enabled: false, password: '', lastVersion: 0 };
  updateSyncStatusUI();

  state.assets = [];
  state.dayChangeMap = {};
  state.prevCloseMap = {};
  state.sessionMap = {};
  state.priceFetchFailedIds = new Set();
  state.filters = { owner: 'ALL', category: 'ALL', account: 'ALL' };
  state.rebalance = { domestic: { '국내': 40, '해외': 60 }, targets: cloneDefaultRebalanceTargets() };
  state.projection = { monthlyContribution: 3000000, categoryReturns: {}, inflationRate: 2.5, customScenarioRates: {} };
  state.transactions = [];
  state.txFilters = { from: '', to: '', account: 'ALL', type: 'ALL', search: '' };
  // [일별 손익 그래프 완전 초기화] state.dailySnapshots는 위 자산/거래내역과 별개로 관리되는 이력이라
  // 명시적으로 함께 비워야 한다 - 안 그러면 자산은 0건인데 [일별 손익 추이] 그래프에는 지운 자산의
  // 과거 손익 막대가 계속 남아있는 상태가 된다.
  state.dailySnapshots = {};
  state.exchangeRate = 1450;
  state.refExchangeRate = 1450;
  state.dailyChangeRate = 0;
  // [버그 수정 - 초기화해도 RISK 카드가 이전 위험점수를 계속 보여줌] state.advancedRiskMetrics는
  // localStorage가 아니라 순전히 메모리 캐시(refreshPricesAndRates() 안에서만 갱신됨)라 위 필드들을
  // 아무리 비워도 이 값은 그대로 남는다 - renderRiskDiagnosisSummary()가 이 캐시를 그대로 읽어 자산이
  // 0건인데도 직전 포트폴리오의 종합 위험점수/스트레스 테스트를 계속 그려 보였다. 명시적으로 비운다
  // (자산이 없으니 재계산할 필요도 없이 null이 곧 정답이다).
  state.advancedRiskMetrics = null;

  persistAssets();
  persistRebalance();
  persistProjection();
  persistTransactions();
  persistDailySnapshots();
  persistRate();
  persistDaily();

  document.getElementById('exchangeRateInput').value = state.exchangeRate;
  document.getElementById('dailyChangeInput').value = state.dailyChangeRate;

  renderAll();
  // [버그 수정 - 초기화해도 팝업 그래프가 그대로 보임] renderAll()은 메인 화면만 다시 그릴 뿐 [일별
  // 손익 추이]/[총 평가금액 추이] 팝업은 건드리지 않는다 - 그 결과 초기화 당시 팝업이 이미 열려 있으면
  // state.dailySnapshots는 실제로 비워졌는데도 화면에 그려진 Chart.js 차트 객체는 그대로 남아 예전
  // 그래프를 계속 보여줬다. 열려 있는 팝업만 즉시 다시 그려 방금 지운 값을 반영한다(backfillAllHoldings
  // DailyPnlHistory에서 쓰는 것과 동일한 패턴).
  if (!document.getElementById('dailyPnlModal').classList.contains('hidden')) updateDailyPnlModal();
  if (!document.getElementById('totalValueModal').classList.contains('hidden')) updateTotalValueModal();
  if (!document.getElementById('totalProfitModal').classList.contains('hidden')) updateTotalProfitModal();
  showToast('모든 데이터가 초기화되었습니다.', 'success');
});

/* -------------------------------------------------------------------------
 * 24. 다크모드 토글
 * ---------------------------------------------------------------------- */
document.getElementById('darkModeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  // [깜박임 방지] 전환 직전에 모든 transition을 꺼서(index.html의 .theme-switching 규칙 참고) 색이
  // 한 프레임에 즉시 바뀌게 하고, 다음 프레임에 다시 켜서 이후 hover 등 다른 애니메이션은 그대로 둔다.
  html.classList.add('theme-switching');
  html.classList.toggle('dark');
  localStorage.setItem(LS_DARKMODE, html.classList.contains('dark') ? '1' : '0');
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('theme-switching')));
  renderCharts();
  // [버그 수정] 금융자산 미래예측(포트폴리오/자산예측 통합 탭의 "미래 예측" 서브탭)의 3개 차트(통합비교/
  // 시나리오1/시나리오2)는 renderCharts()에 포함돼 있지 않아, 그 서브탭을 보고 있는 상태에서 다크모드를
  // 전환하면 축/범례 텍스트가 이전 테마 색 그대로 남아 새 배경과 겹쳐 안 보이는 문제가 있었다(탭을
  // 나갔다 다시 들어오면 switchRebalanceSubTab()이 다시 그려줘서 우연히 정상으로 보였을 뿐). 이
  // 서브탭을 보고 있을 때만 다시 그린다 - 숨겨진 캔버스에 그리면 크기가 0이 되므로 호출하지 않는다.
  if (state.activeTab === 'rebalance' && rebalanceSubTab === 'projection') updateProjection();
});

/* -------------------------------------------------------------------------
 * 26. PWA: 서비스 워커 등록 (있으면 오프라인 캐싱 활성화, 없으면 조용히 무시)
 *    - sw.js는 index.html과 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅된 경우에만
 *      브라우저가 등록을 허용한다. file:// 로컬 실행이나 sw.js가 없는 경우 catch로 조용히 넘어가고
 *      앱의 나머지 기능(자산관리, 시세조회 등)에는 전혀 영향이 없다.
 * ---------------------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.info('서비스 워커 미등록(정상): file:// 로컬 실행이거나 HTTPS 호스팅이 아니거나 sw.js가 없는 경우 발생합니다. -', err.message);
    });
  });
}

/* -------------------------------------------------------------------------
 * 27. APK(WebView) 패키징 진단 안내
 *    - 안드로이드 WebView + file:// 조합(APK 안에 html을 그대로 넣어 로컬 파일로 여는 방식)은
 *      브라우저 자체와 달리 file:// 문서에서 외부 https:// API로 나가는 fetch를 기본적으로 더 엄격하게
 *      막는 WebView 빌드/설정이 많다(setAllowUniversalAccessFromFileURLs 등). 이 조합에서는 CORS
 *      프록시를 아무리 늘려도 근본적으로 해결되지 않을 수 있어, 이 경우에만 한 번 안내 토스트를 띄운다.
 *      데스크톱 브라우저에서 파일을 직접 열 때는(파일:// + 비-Android) 정상적으로 잘 동작하므로 여기서
 *      걸리지 않는다.
 * ---------------------------------------------------------------------- */
function warnIfRestrictedWebView() {
  const isFileProtocol = location.protocol === 'file:';
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isFileProtocol && isAndroid) {
    console.warn('[진단] file:// + Android 환경에서 실행 중입니다. APK 안에 HTML을 로컬 파일로 번들링한 경우, WebView 설정에 따라 외부 API(Yahoo/환율) 호출 자체가 차단될 수 있습니다. 이 파일을 HTTPS로 호스팅한 뒤 그 주소를 여는 방식(TWA 등)으로 패키징하면 이 문제가 근본적으로 해결됩니다.');
    showToast('APK(WebView)에서 파일을 로컬로 여는 방식은 시세/환율 API 호출이 막힐 수 있습니다. 이 파일을 웹에 호스팅한 주소로 앱을 여는 방식을 권장합니다.', 'warn', 10000);
  }
}

/* -------------------------------------------------------------------------
 * 25. 초기 구동
 *    [구글 드라이브 동기화 기능 제거] 이제 기기 로컬 저장(localStorage) 전용으로 동작한다 - 네트워크
 *    동기화를 기다리지 않고 loadState()로 로컬 데이터를 읽는 즉시 렌더링을 시작한다.
 * ---------------------------------------------------------------------- */
async function bootApp() {
  cleanupLegacyGoogleSyncKeys(); // 예전 구글 드라이브 연동 기능이 남긴 localStorage 키를 1회 정리
  loadState();
  // [종목 마스터 데이터 - localStorage 캐시만 여기서 동기 반영] 캐시가 있으면 이 시점에 즉시 반영돼
  // 렌더링 전부터 검색이 된다. 네트워크로 새로 받아야 하는 경우(최초 실행/캐시 만료 등, 파일이
  // 16,000여 종목·2.7MB로 꽤 큼)는 뒤로 미룬다(아래 refreshPricesAndRates() 이후) - 그 이유는 그
  // 호출부 주석 참고.
  loadTickerMasterFromCache();
  loadSyncState();
  // [동기화 상태 버튼 초기 표시] pullFromCloud()는 아래에서 await 없이 비동기로 실행되므로, 그 결과가
  // 나오기 전까지 버튼이 잠깐 정적 기본값("동기화중지")으로 보이는 걸 막기 위해 loadSyncState() 직후
  // 한 번 더 갱신해 최소한 켜짐/꺼짐 여부는 즉시 정확하게 보이게 한다(오류 여부는 pull 결과가 나온
  // 뒤 반영됨).
  updateSyncStatusUI();
  // [JSON 자동 백업] 토글 상태 표시 + 오늘 아직 안 했으면 1회 자동 다운로드(꺼져 있으면 no-op).
  updateAutoBackupToggleUI();
  runAutoBackupIfDue();
  // 거래내역이 있으면 자산 목록을 항상 최신 계산값으로 맞춰둔 뒤 첫 렌더링을 시작한다(구조 변경/수동
  // localStorage 편집 등으로 어긋나 있었을 가능성에 대비한 안전장치).
  if (state.transactions.length > 0) {
    syncAssetsFromTransactions();
    persistAssets();
  }

  renderAll();
  // [버그 수정 - 초기 진입 시 탭 버튼 active 스타일 누락] state.activeTab 기본값('dashboard')과
  // 실제로 보이는 탭 패널(총투자현황)은 처음부터 일치했지만, 탭 버튼에 .active 클래스를 붙이는 건
  // switchTab()이 클릭/스와이프로 호출될 때뿐이었다 - 그 결과 첫 진입 시엔 내용은 정상인데 상단
  // 탭 버튼만 활성 색상이 안 입혀진 채로 보였다(다른 탭을 눌렀다 돌아오면 그때 switchTab()이 실행돼
  // 정상으로 보였을 뿐). 부팅 시 한 번 명시적으로 호출해 버튼 스타일을 내용과 맞춘다.
  // [버그 수정 - 특정 기기에서 최초 접속 시 자동 시세갱신이 아예 시작되지 않던 문제] switchTab/
  // lucide.createIcons/warnIfRestrictedWebView 중 하나가 특정 브라우저/기기 환경에서 예외를 던지면,
  // 자바스크립트 특성상 같은 함수(bootApp) 안에서 그 아래에 있는 모든 코드(바로 다음의
  // refreshPricesAndRates() 자동 호출 포함)가 통째로 실행되지 않는다 - 화면은 renderAll()까지는
  // 이미 정상적으로 그려진 뒤라 사용자 눈에는 "그냥 자동 갱신만 안 되는" 것처럼 보인다(실제 신고 사례:
  // [시세 & 환율 갱신] 버튼이 "갱신 중" 상태로 바뀌지도 않음 = 그 호출까지 도달하지 못했다는 뜻). 이
  // 셋 각각을 독립적으로 try/catch로 감싸, 어느 하나가 실패해도 나머지와 그 아래 자동 갱신 호출은
  // 항상 실행되게 한다 - 5분 주기 자동 갱신(js/11의 별도 setInterval, bootApp()과 무관하게 등록됨)은
  // 이 문제와 상관없이 항상 정상 작동했던 것도 이 진단과 일치한다.
  try { switchTab(state.activeTab); } catch (e) { console.error('[부팅] switchTab 실패 - 자동 갱신은 계속 진행:', e); }
  try { lucide.createIcons(); } catch (e) { console.error('[부팅] lucide.createIcons 실패 - 자동 갱신은 계속 진행:', e); }
  try { warnIfRestrictedWebView(); } catch (e) { console.error('[부팅] warnIfRestrictedWebView 실패 - 자동 갱신은 계속 진행:', e); }
  // 최신 시세/환율은 비동기로 갱신한다(awaited하지 않으므로 초기 렌더링을 지연시키지 않는다) - 일간
  // 평가손익 등이 오늘자 실제 가격을 반영하려면 페이지를 열 때마다(또는 버튼 클릭 시) 이 호출이
  // 반드시 필요하다.
  // [기존 보유 자산 소급 히스토리] 이 기능이 추가되기 전부터 있던 보유 자산은 한 번도 소급 계산이
  // 실행된 적이 없으므로, 앱을 켤 때 딱 한 번(플래그로 재실행 방지) 지금 보유 중인 자산 전체에 대해
  // 일괄 실행한다. refreshPricesAndRates()의 실시간 시세 갱신이 끝난 뒤에 시작해서(then), 두 배치가
  // 같은 CORS 프록시 풀을 동시에 두고 경합하지 않게 한다 - 사용자가 지금 당장 보는 현재가 갱신이
  // 우선이고, 이 소급 백필은 화면에 없어도 티 안 나는 백그라운드 작업이라 늦게 끝나도 무방하다.
  // [포트폴리오 위험 진단 팝업 - 부팅 자동 노출 비활성화] 요청에 따라 maybeShowRiskAlertPopup() 호출을
  // 완전히 제거했다 - 위험 점수/시간대 조건과 무관하게 이제 앱 부팅 시 이 팝업은 절대 자동으로 뜨지
  // 않는다(이 함수를 호출하던 곳이 여기 한 곳뿐이라 다른 진입 경로도 없다). RISK 관리 카드 자체는
  // 대시보드 탭에 그대로 남아있어 원할 때 확인할 수 있다.
  // [핵심종목 실시간 팝업 - 부팅 자동 노출 완전 제거] 한때는 시간대 제한 없이 접속할 때마다 항상
  // 자동으로 띄웠으나, 요청에 따라 그 자동 노출 자체를 완전히 없앴다 - 이제 이 팝업은 오직 헤더의
  // [핵심종목 실시간] 버튼(coreStocksLiveBtn, js/02의 클릭 리스너)을 사용자가 직접 눌렀을 때만 열린다.
  // [버그 수정 - 모바일에서 최초 접속 시 시세조회가 느려지고 실패하던 문제] loadTickerMaster()가
  // 부팅 초반부터 refreshPricesAndRates()와 동시에 네트워크를 타면, 종목 마스터 파일이 16,000여
  // 종목·약 2.7MB로 꽤 커서 모바일 회선에서 가격 조회 요청들과 대역폭을 다투게 된다 - 실사용 중
  // "최초 접속 시 시세조회가 매우 오래 걸리고 결과도 제대로 못 받아온다"는 신고로 확인됐다(재조회를
  // 눌러도 느린 건, 이 최초 경합으로 프록시 쪽에서 일시적으로 rate-limit이 걸렸을 가능성이 있음).
  // 캐시가 있으면 위에서 이미 즉시 반영됐으니(loadTickerMasterFromCache), 네트워크로 새로 받아야
  // 하는 경우만 가격 조회가 끝난 뒤로 미룬다 - backfillAllHoldingsDailyPnlHistory와 똑같은 이유로
  // 똑같은 자리에 둔다(주석 참고).
  refreshPricesAndRates().catch(() => {}).finally(() => {
    backfillAllHoldingsDailyPnlHistory();
    loadTickerMaster().catch(() => {});
  });
  // [가족 동기화 - 부팅 시 1회 pull] 위 시세 갱신과 마찬가지로 await하지 않는다 - 로컬 데이터로 먼저
  // 즉시 렌더링한 뒤 클라우드에 더 최신 데이터가 있으면 잠시 후 반영되는 방식으로, "네트워크를 기다리지
  // 않고 즉시 그린다"는 이 앱의 기존 철학을 그대로 따른다. 동기화를 켜지 않은 사용자는 pullFromCloud()
  // 내부에서 바로 'disabled'로 반환되어 사실상 아무 일도 일어나지 않는다.
  pullFromCloud();
}
bootApp();
