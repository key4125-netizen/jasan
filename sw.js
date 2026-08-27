// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v145'; // [본문 글자 크기 통일 + 줄바꿈 정돈 + 지수 모달 마무리 + 모바일 키보드 대응 + 종목 검색 전종목 마스터 도입]
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
