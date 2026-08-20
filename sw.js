// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v92'; // [긴급 버그 수정 - v90 휴장일감지가 정상 거래일도 오탐]
// v90에서 넣은 "체결 식별값이 직전 조회와 같으면 휴장"이라는 판정이 실서비스에서 다른 버그를 냈다 -
// SK하이닉스가 +12.73% 오른 정상 거래일인데도 일간손익이 거의 0으로 나온 사례가 실사용자에게서
// 확인됨. 원인: 무료 CORS 프록시/Yahoo·Naver API 캐싱 지연으로 몇 분 간격 재조회가 활발히 거래
// 중인 정규장에도 우연히 똑같은 체결값을 돌려주는 일이 흔한데, v90은 그걸 "직전 폴링" 대비로
// 비교해서 정상 거래일을 휴장으로 오판했다(소유자별로 자산 레코드가 따로 조회되다 보니 같은 종목도
// 신랑/와이프 중 한쪽만 오판되는 식으로 나타남). 이제는 "직전 폴링"이 아니라 그 시장의 "오늘 날짜"가
// 바뀐 시점에 딱 한 번 고정하는 기준값(asset.dailyRefTradeKey/Date, getMarketDateKey)과 비교한다 -
// 하루 안에서는 몇 번을 다시 조회해도 기준값 자체가 안 바뀌므로 폴링 타이밍 노이즈에 흔들리지 않고,
// 실제 휴장일(평일 공휴일 등, 최초 요청 시나리오)은 여전히 정확히 걸러낸다(재검증 완료).
// v91->v92: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 index.html을 다시 받아온다 - 안
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
