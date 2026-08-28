// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v153'; // [버그 수정 - 해외 종목 조회 실패/지연 재발]
// v151/v152에서 Yahoo/Stooq/fetchDailyCloses 개별 타임아웃을 12초->7초로 줄였는데, 실제로 프록시별
// 응답시간을 직접 재보니 이게 오히려 신뢰성을 깎아먹는 부작용이 있었다: allorigins-get 프록시는
// "고장"이 아니라 정상 작동하되 그냥 13초 가까이 걸리는 경우가 실제로 있었고, 빠른 소스(own-worker/
// r.jina.ai)가 하필 동시에 막힌(rate limit 등) 순간엔 이 느리지만 정상인 백업이 유일하게 살아있는
// 경로일 수 있는데 7초 컷오프가 그것까지 잘라내 완전 실패로 이어졌다(실측으로 GOOGL 조회가 7개 소스
// 전부 실패하는 것을 재현). 애초에 20초+ 지연의 핵심 원인은 개별 타임아웃 값이 아니라
// raceFetchPrice/fetchPriceWithFallback의 "순차 대기" 구조였고(v151/v152에서 이미 동시 경쟁으로
// 고침), 개별 타임아웃 자체는 Promise.any 경쟁에서 "전부 실패할 때만" 상한으로 작동하므로 원래
// 값(12초)으로 되돌려도 구조 수정의 이득은 그대로 유지된다.
// [수정 1] js/09: fetchYahooViaProxy/fetchStooqPrice/fetchDailyCloses의 타임아웃을 12초(기본값)로
// 되돌림. v151/v152의 구조 변경(동시 경쟁)은 그대로 유지. 네이버(fetchNaverKrPrice, 5초)는 별개의
// 안정적인 단일 소스라 그대로 둔다.
// [수정 2 - 별개의 발견, js/11] 같은 종목을 여러 계좌/소유자가 나눠 보유하는 경우(부부가 같은
// 종목을 각자 계좌에 나눠 담는 이 앱의 흔한 실사용 패턴) fetchPricesForTargets()가 자산 row
// 개수만큼 완전히 독립된 조회를 중복으로 쏘고 있었다 - 같은 티커에 대한 동시 중복 요청이 같은
// 프록시(특히 own-worker/r.jina.ai)에 몰려 서로 경쟁하며 자기 자신 때문에 rate limit(429)을
// 유발하는 것을 실측으로 재현했다. 이제 티커별로 딱 한 번만 조회하고 같은 티커를 가진 모든 자산이
// 그 결과를 공유한다.
// js/09·js/11이 바뀌었으므로 v152->v153으로 올려 PWA가 캐시된 예전 버전을 버리고 새로 받아오게 한다.
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
