// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v156'; // [동시요청 제한 + 국내 시세 KIS 최종 안전망]
// (1) [근본 원인 수정] v151~v154로도 20초+가 재현된 진짜 원인: 티커 하나당 raceFetchPrice()가
// 내부적으로 최대 12건의 HTTP 요청(네이버 직접+프록시5, Yahoo 프록시5+Stooq)을 동시에 쏘는데,
// 보유종목 20~30개가 한꺼번에 갱신되면 own-worker 하나에만 순간적으로 수십 건이 몰려 Yahoo 쪽 비공식
// API의 자체 rate-limit(429)을 유발하는 것을 실측으로 확인했다(own-worker 자체는 정상인데도 429
// 반환) - "동시에 너무 많이 쏴서 스스로 병목시키는" 문제. js/09: 티커 단위 동시 진행 개수를 5로
// 제한하는 세마포어(priceRequestLimiter)를 두고 fetchPriceWithFallback/fetchDailyCloses가 공유한다 -
// 이 앱에서 시세를 조회하는 모든 경로(일괄 갱신/지수/매크로/상세 모달/리스크 진단/신규 자산 검색)가
// 자동으로 적용받는다.
// (2) [국내 시세 KIS 최종 안전망] 네이버+Yahoo/Stooq가 전부 실패했을 때만(정상 상황에서는 거의 호출
// 안 됨) 이미 배포된 KIS Worker(/api/kis/price, 원래 종목 상세 재무 데이터용)를 3순위 폴백으로
// 재사용한다 - 병렬 분산이 아니라 순차 최종 시도라 KIS 쪽 엄격한 동시요청 제한(Worker 자체 실측
// 기록: 3~5건만으로도 500 에러 재현됨)에 걸릴 위험이 없다. 시간외 시세/당일 시가고가저가는 KIS
// 응답에 없어 못 주지만, 완전 실패보다는 정규장 기준가라도 보여주는 게 낫다. 겸사겸사 js/13
// kisProxyFetch()에 타임아웃(10초)도 추가했다 - 채권 기능 때 있었다가 되돌리기에 같이 딸려 사라진
// 것을, 이 안전망이 무한정 멈추지 않도록 다시 넣었다.
// js/09·js/13이 바뀌었으므로 v155->v156으로 올려 PWA가 캐시된 예전 버전을 버리고 새로 받아오게 한다.
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
