// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v90'; // [버그 수정 - 평일 휴장일 일간손익 이중 반영]
// 시세 API(Yahoo meta.regularMarketTime, Naver localTradedAt)에서 종목별 "마지막 정규장 체결
// 식별값"을 받아와 자산에 저장(lastTradeKey, persistAssets로 영속화 - 재부팅해도 비교 기준 유지)해
// 두고, 다음 조회 때 이 값이 그대로면(=새 정규장이 없었음, 평일 공휴일 등) state.noNewSessionMap을
// true로 표시한다. calcDailyPnL()이 이 플래그가 true인 종목은 주가 변동분을 0으로 고정하되, 해외
// 자산은 그날의 환율 변동분(환차손익)만은 그대로 반영한다 - 예전엔 주말만 걸러내고 평일 공휴일은
// 걸러내지 못해, 직전 거래일의 상승분이 휴장일에 그대로 다시 계산돼 일간손익/누적 평가손익 그래프에
// 중복 반영되는 버그가 있었다(실사용자가 실제로 겪은 사례로 확인). 부수적으로 이제 일간손익 계산에는
// 시간외(애프터마켓 등) 틱이 섞일 수 있는 현재가 대신 정규장 기준가(regularMarketPrice)를 우선
// 쓴다 - 시간외 변동으로 그날의 확정 평가손익/스냅샷이 흔들리지 않는다. 체결 식별값을 안 주는 소스
// (Stooq 등)는 기존 주말/세션시각 근사 로직(isMarketInDailyResetWindow)으로 그대로 폴백한다.
// v89->v90: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 index.html을 다시 받아온다 - 안
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
  'polling.finance.naver.com'
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
