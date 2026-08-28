// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v160'; // [모바일 헤더 버튼 줄 - 환율보기 텍스트 복원 + 끝 정렬]
// v159까지는 공간 확보를 위해 "환율보기" 텍스트를 모바일에서 아예 숨겼는데, 실기기에서 봤을 때 남는
// 여백이 있는데도 글자가 안 보이고 서버동기화 버튼도 줄 오른쪽 끝에 딱 붙지 않아 어색해 보인다는 피드백을
// 받았다. 환율 입력칸 폭(48px->40px)·환율뱃지 내부 간격(4px->2px)·환율뱃지/서버동기화 버튼 좌우 여백을
// 줄이고 서버동기화 버튼 모바일 글자를 살짝 줄여(12px->11px) 확보한 공간으로 "환율보기" 텍스트를 다시
// 보이게 했고, 버튼 줄 전체에 justify-end를 줘서 늘 줄 오른쪽 끝에 맞춰지게 했다(375px/360px 모두 세
// 상태 전부 한 줄 유지 확인, 320px 같은 극단적으로 좁은 화면에서만 세 상태가 함께 다음 줄로 넘어간다).
// 1) 모바일 "서버 동기화" 버튼: v158의 고정폭(92px) 방식이 실제 기기에서는 오히려 "동기화중"까지
//    줄바뀜을 유발해, 대신 환율 배지의 연필 아이콘·"환율보기" 텍스트를 모바일에서 숨겨 공간을 확보하고
//    동기화 버튼은 원래 크기(고정폭 없음)로 되돌려 항상 환율/야간모드 버튼과 같은 줄에 위치하게 했다.
// 2) 지수 상세 팝업 통일: "시장 현황 & 매크로 브리핑"의 지수/지표 타일 클릭 시 뜨던 전용 #macroDetailModal을
//    완전히 제거하고, "핵심종목 실시간" 팝업이 쓰는 종목 상세 모달(#assetDetailModal)을 그대로 열도록
//    통일했다 - 목록에 없던 지표(VIX, 환율 등)도 동일한 크기/스타일로 동적 렌더링된다.
// 3) [다크모드 배경색 버그 수정 - 진짜 원인] '서버 동기화중' 버튼, 'JSON 자동 백업중' 버튼, '종목 분석
//    & 투자 검토 보고서' 버튼이 야간 모드에서 흰색/밝은 배경으로 보이던 문제의 실제 원인을 찾았다:
//    이 버튼들이 쓰는 dark:bg-brand-950 계열 클래스가 참조하는 'brand-950' 색상 자체가 tailwind.config의
//    brand 팔레트에 정의돼 있지 않아(900까지만 존재) Tailwind CDN JIT이 해당 CSS를 아예 생성하지 못했다
//    - 팔레트에 950 단계(#1e1b4b)를 추가해 근본 원인을 해결했다. 부수적으로 서버 동기화 상태 갱신 함수
//    (updateSyncStatusUI)가 상태가 안 바뀌어도 매번 색상 클래스를 지웠다 다시 붙이던 것도, 실제로 상태가
//    바뀔 때만 건드리도록 고쳐 배경색 전환 애니메이션이 불필요하게 재시작되지 않게 했다.
// index.html·js/03·08·10·12가 바뀌었으므로 v158->v159로 올려 PWA가 캐시된 예전 버전을 버리고 새로
// 받아오게 한다.
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
