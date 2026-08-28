// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v151'; // [버그 수정 - 전 종목 성공해도 갱신이 20초 넘게 걸리던 문제]
// Cloudflare Worker 3개(asset-manager-proxy/keymaster/steep-haze-01f0) 전수 점검 결과 keymaster와
// steep-haze-01f0는 이상이 없었고, asset-manager-proxy는 직전 버전에서 이미 정상화됐다(엉뚱한 코드가
// 배포돼 있던 문제 + stooq.com 허용 목록 누락 수정). 그런데도 국내 종목 일부(예: 0052D0.KS)가 매번
// 20초 넘게 걸리는 문제가 남아있었다 - 원인은 raceFetchPrice()의 국내 티커 처리 구조였다: 네이버
// (직접+프록시 전부)가 완전히 실패해야만 그 "후에" Yahoo/Stooq 경쟁을 시작하는 순차 구조라, 네이버
// 쪽이 막혀있는 종목은 네이버 타임아웃(8초)을 다 채운 뒤에야 Yahoo 경쟁(기본 타임아웃 12초)이
// 시작돼 최악 20초가 그대로 더해졌다 - 전체 갱신은 가장 느린 종목 하나를 기다리는 구조(Promise.all)라
// 이 한 종목이 전체 갱신 시간을 그대로 끌어올렸다.
// [수정] js/09: (1) 네이버와 Yahoo/Stooq를 처음부터 동시에 시작해두고 네이버가 성공하면 그 값을
// 우선 채택하되, 네이버가 실패할 때만 이미 진행 중이던 Yahoo/Stooq 결과를 그대로 기다리는 구조로
// 변경(추가 대기 없이 상한이 두 경쟁 중 더 긴 쪽으로 줄어듦). (2) 정상 응답이 보통 1~2초 안에 오는
// 점을 감안해 타임아웃 자체도 낮춤: 네이버 8초->5초, Yahoo 기본 12초->7초, Stooq 12초->7초(직접+프록시
// 재시도 각각). 이제 국내 종목 최악 상한이 이론상 약 20초에서 약 7초로 줄어든다.
// js/09가 바뀌었으므로 v150->v151로 올려 PWA가 캐시된 예전 버전을 버리고 새로 받아오게 한다.
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
