// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v97'; // [버그 수정 - 환율 실시간 소스가 항상 stale값에 밀림]
// 어제 Yahoo KRW=X를 FX_SOURCES 배열 맨 앞에 추가했는데, 다 같이 Promise.any로 경쟁시키다 보니
// 가벼운 open.er-api류(직접호출, 작은 payload)가 무거운 Yahoo chart API(분봉 배열 포함, 항상 프록시
// 경유)보다 항상 먼저 끝나버려서 배열 순서와 무관하게 매번 하루-1회 스냅샷 값이 채택되고 있었다
// (실사용자가 실측: 앱은 1394.71원인데 네이버 실시간은 1386.3원 - 최대 24시간 묵은 값이었음). 이제
// FX_SOURCES를 FX_SOURCES_REALTIME(Yahoo 3개 프록시 경쟁)과 FX_SOURCES_SNAPSHOT_FALLBACK(기존
// open.er-api류)으로 분리해서, 실시간 소스를 먼저 끝까지 시도하고 그게 전부 실패할 때만 스냅샷
// 소스로 순차 폴백하도록 fetchExchangeRate()를 다시 짰다 - 이래야 배열 순서가 실제 우선순위로
// 작동한다. 실측: 새 구조로 1385원대(네이버와 거의 일치) 실시간 값이 200~300ms 안에 반영됨 확인,
// 강제로 실시간 소스를 전부 실패시켜도 스냅샷 폴백이 정상 작동함도 확인.
// v96->v97: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 index.html을 다시 받아온다 - 안
// 바꾸면 GitHub에 새 index.html을 올려도 이미 설치된 모바일 PWA는 계속 캐시된 예전 버전만 보여준다
// (activate 핸들러가 CACHE_NAME이 다른 캐시만 지우기 때문).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
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
  'asset-manager-proxy.key4125.workers.dev'
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
