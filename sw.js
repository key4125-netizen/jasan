// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v147'; // [개별 채권(ISIN) 관리 - 시세 연동 + 채권 현황 모달]
// 채권을 "티커 없는 뭉뚱그린 자산군"에서 "ISIN(12자리 채권 표준코드) 기반 개별 종목"으로 전면 개편했다.
// 1) ISIN이 이제 진짜 티커다(sanitizeTicker/isBondTicker, js/01) - classifyCategory가 ISIN을 최우선
// 신호로 '채권'을 판정하고, NON_TRADABLE_CATEGORIES에 '채권'이 있어도 ISIN 티커가 있으면 시세갱신
// 대상에 포함된다(js/02 calcDailyPnL, js/11 fetchAllPrices - isBondTicker 예외).
// 2) KIS 채권 API 2개를 새로 연동했다(cloudflare-worker-kis-proxy.js: /api/kis/bond-price 실시간
// 매매단가·수익비율, /api/kis/bond-info 만기일·표면금리·이자지급일 등 발행정보 - 훨씬 긴 30일 캐시
// TTL). 이 두 라우트는 KIS 응답을 실제로 받아본 적 없는 상태(개발 환경 네트워크 차단)에서 공식 GitHub
// 샘플의 한글 필드 라벨만 보고 만든 추정 필드명이라, 실배포 후 첫 호출 결과로 검증/보정이 필요하다
// (raw 필드로 원본을 항상 함께 내려주므로 문제가 있으면 그 필드명만 고치면 됨).
// 3) 거래 등록 모달: 채권 ISIN을 티커로 선택하면 수량/단가 라벨이 "액면가(원)"/"매매단가(10,000원당)"로
// 바뀌고, 총 거래금액 = 액면가×(매매단가/10,000) 미리보기가 뜬다(js/06 updateTxQuantityPriceUI). 저장은
// 내부적으로 수량=액면가÷10,000으로 변환해(js/02·04 등 앱 전체의 "수량×현재가" 계산 관례를 그대로
// 재사용하기 위함) 앱 곳곳에 채권 전용 분기를 추가하지 않아도 되게 했다.
// 4) 종목 검색 팝업에 ISIN 직접 입력 모드를 추가했다(js/04) - 결정사항: 채권 전종목 마스터는 아직
// 없어(KIS 공개 일괄 다운로드 미확인) 12자리 ISIN을 직접 입력받아 KIS 발행정보로 실시간 확인 후
// 선택하는 방식으로 시작한다.
// 5) 신규 [채권 현황] 모달(js/15-bond-management.js, 신규 파일) - KPI 카드의 '채권' 태그를 누르면
// 열리며, 총평가액/총손익률/연간 예상 이자수입 요약, 보유 채권 리스트, 선택 종목의 만기일/이표주기/
// YTM/표면금리 지표 카드, 향후 12개월 이자수입 + 다가오는 이자 지급일 타임라인을 보여준다. 이자
// 스케줄은 KIS가 미래 전체 일정을 안 주므로 "차기이자지급일 + 이표주기" 기준으로 앱이 직접 등간격
// 계산한다(콜옵션 등 예외는 반영 안 됨 - 참고용).
// 6) 미래자산예측(js/05)은 이번 스코프에서 제외 - 채권은 여전히 기존 블렌디드 수익률(4%)을 쓴다.
// index.html/js/01/02/03/04/06/09/11/13/15와 cloudflare-worker-kis-proxy.js가 바뀌었으므로
// v146->v147로 올려 PWA가 캐시된 예전 버전을 버리고 새로 받아오게 한다.
// 거래 추가/수정 모달의 "종목명/티커" 입력칸 옆에 [수동입력] 체크박스를 추가했다. 기본(OFF, 검색
// 모드)은 입력칸이 readonly로 잠기고 클릭하거나 돋보기 버튼을 누르면 기존 [개별주식 검색 추가]
// 팝업이 뜬다 - ON(수동입력)으로 켜면 돋보기가 숨겨지고 입력칸이 자유 텍스트가 되어 현금·부동산·
// 예적금처럼 티커 없는 자산명을 직접 입력할 수 있다(js/06). 티커 없는 거래를 수정할 때는 자동으로
// 수동입력 모드로 열린다.
// 검색 팝업 자체도 개선했다(js/04) - 예전엔 보유 자산 + Yahoo 검색(한글 미지원, 8~12초까지 걸릴 수
// 있음)만 썼는데, 이제 v145에서 도입한 종목 마스터(tickerMasterRecords)도 함께 검색해 "대덕전자"
// 같은 비보유 국내 종목도 이름으로 즉시 찾을 수 있다. 로컬 데이터(보유 자산+마스터)는 네트워크 없이
// 바로 결과가 나오므로 Yahoo 응답을 기다리지 않고 먼저 보여준 뒤, Yahoo 결과가 도착하면 추가로
// 이어붙인다(체감 속도 개선).
// index.html/js/04/06이 바뀌었으므로 v145->v146으로 올려 PWA가 캐시된 예전 버전을 버리고 새로
// 받아오게 한다.
// [이전 버전(v145) 변경 이력 - 참고용]
// 1) 폰트 크기 체계 통일: 종목 상세 모달의 "20/60/120일 이동평균이..." 문장을 기준(text-sm~base)
// 삼아, 매크로 브리핑/RISK 관리/국내·해외 자산 TOP5 카드의 본문·안내문과 각 모달 내부 설명·리스크
// 요인 목록을 이 기준에 맞췄다. 카드 제목(h3/h4)은 본문보다 한 단계 크게(text-base font-bold),
// 보조 캡션은 한 단계 작게(text-xs) 재정렬했다 - 기존의 굵기/색상 대비는 그대로 유지.
// 2) 이모지·번호 목록 줄바꿈 정돈: "🧭 대응 가이드", "RISK 관리 권장 지침" 등에서 줄이 길어져
// 두 번째 줄로 넘어갈 때 아이콘/번호 밑으로 밀려 들어가던 것을 hangingIndentLine() 헬퍼(flex +
// items-start)로 고쳐 텍스트 시작 위치에 맞춰지게 했고, break-keep/break-words로 한글 조사나
// "(TLT)" 같은 괄호 용어가 단어 중간에서 어색하게 끊기지 않도록 했다.
// 3) 지수 모달 마무리: "개별 매수/보유 대상이 아닌 시장 지표(지수)입니다" 안내문을 상단에서 맨
// 아래 옅은 캡션으로 옮겨 불필요한 스크롤을 없앴고, 차트+지수 해설 아래에 "3개월 최고가/최저가"
// (종목용 "단기 벽/1차 버팀목" 표현 대신)와 "최대낙폭(MDD)" 카드를 새로 추가했다
// (analyzeTickerForModal()을 그대로 재사용, 계산 로직 중복 없음).
// 4) 모바일 키보드 대응: 종목 검색 모달(stockAnalysisModal)에서 검색창에 포커스가 가 온스크린
// 키보드가 뜨면 window.visualViewport로 실제 보이는 영역을 추적해 모달을 그 영역 상단에 붙이고
// 카드 높이도 동적으로 줄여, 입력창과 검색 결과 일부가 항상 함께 보이도록 했다(부드러운 전환
// transition 포함).
// 5) 종목 검색 - 전종목 마스터 도입: 예전엔 이름 검색이 코스피/코스닥 주요종목 약 90개짜리 고정 표
// (TICKER_NAME_FALLBACK_SEED, 예전 이름 KR_STOCK_NAMES)에만 의존해 "대덕전자"처럼 그 표에 없는
// 종목은 검색이 안 됐다. 이제 GitHub Actions(.github/workflows/update-ticker-master.yml)가 매달
// 1일 KIS 공식 종목 마스터(인증 불필요 정적 다운로드)를 내려받아 국내 코스피/코스닥 전종목 + 미국
// 나스닥/뉴욕/아멕스 주요종목을 data/ticker-master.json으로 커밋해두고, 앱이 부팅 시 jsDelivr CDN
// 경유로 받아(js/09 loadTickerMaster(), localStorage 20일 캐시) 검색/자동완성에 쓴다. 검색 추천
// 목록을 클릭했을 때 입력창에 채우는 값도 "이름"에서 "티커"로 바꿨다(js/10) - 미국 종목 영문명이
// 채워지면 자동 티커 변환이 안 되던 문제를 근본적으로 없앤 것. 기존 90개 표는 다운로드 실패 시의
// 최소 안전망으로만 남겨뒀다.
// index.html/js/08/09/10/14가 바뀌었으므로 v144->v145로 올려 PWA가 캐시된 예전 버전을 버리고
// 새로 받아오게 한다.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/01-core-state.js',
  './js/02-dashboard-kpi.js',
  './js/03-filters-charts-tabs.js',
  './js/04-rebalancing.js',
  './js/05-future-projection.js',
  './js/06-transactions.js',
  './js/07-table-render-modals.js',
  './js/08-detail-modal-fx.js',
  './js/09-price-fx-risk-engine.js',
  './js/10-risk-translation-alerts.js',
  './js/11-refresh-history.js',
  './js/12-import-export-sync.js',
  './js/13-fundamental-data.js',
  './js/15-bond-management.js',
  './js/14-settings-boot.js'
];

// 외부 시세/환율 API 및 CORS 프록시는 항상 최신 데이터가 우선이므로 네트워크를 먼저 시도하고,
// 오프라인일 때만 마지막으로 캐시된 응답을 폴백으로 사용한다.
// [버그 수정] polling.finance.naver.com(국내 장전/장후 시간외 시세의 핵심 소스)과 프록시 2개
// (api.codetabs.com, r.jina.ai)가 이 목록에 빠져 있었다 - 그 결과 PWA로 설치된 모바일에서는
// 서비스워커가 이 요청들을 "캐시 우선"으로 처리해, 최초 1회 조회 이후로는 계속 그때 캐시된 옛
// 시세만 반환되고 실제 새 시간외 시세가 전혀 반영되지 않는 문제가 있었다(file:// 로컬 실행에서는
// 서비스워커 자체가 등록되지 않아 이 버그가 재현되지 않았던 것도 원인 파악이 늦어진 이유다).
const NETWORK_FIRST_HOSTS = [
  'query1.finance.yahoo.com',
  'open.er-api.com',
  'api.exchangerate-api.com',
  'stooq.com',
  'api.allorigins.win',
  'corsproxy.io',
  'api.codetabs.com',
  'r.jina.ai',
  'polling.finance.naver.com',
  'asset-manager-proxy.key4125.workers.dev',
  // [가족 동기화] 동기화 데이터는 항상 최신이어야 하므로 캐시에 절대 의존하면 안 된다.
  'steep-haze-01f0.key4125.workers.dev',
  // [한국투자증권(KIS) 재무/수급 프록시] 시세/재무 데이터도 항상 최신이어야 하므로 동일하게 취급한다.
  'keymaster.key4125.workers.dev',
  // [종목 마스터 데이터] data/ticker-master.json은 js/09 loadTickerMaster()가 이미 localStorage에
  // 자체적인 20일 캐시/TTL을 두고 있으므로, 서비스워커까지 이중으로 오래 캐싱해두면 그 로직이 최신
  // 데이터를 원해도 계속 옛 응답만 받게 될 수 있다 - 항상 네트워크를 먼저 시도하게 한다.
  'cdn.jsdelivr.net'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // 앱 셸 캐싱 실패해도 설치 자체는 계속 진행
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let isNetworkFirst = false;
  try {
    const host = new URL(req.url).hostname;
    isNetworkFirst = NETWORK_FIRST_HOSTS.some((h) => host.includes(h));
  } catch (e) {
    return; // chrome-extension:// 등 파싱 불가한 요청은 그대로 통과
  }

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 앱 셸/정적 리소스(Tailwind, Chart.js 등 CDN 포함): 캐시 우선, 없으면 네트워크 후 캐시에 저장
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
