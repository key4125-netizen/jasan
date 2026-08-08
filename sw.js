// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v53'; // [티커 없는 자산 검색 지원 + 부동산 복리 누락 버그 수정]
// ①searchLocalHoldings()가 티커 없는 자산(부동산/채권)을 검색 결과에서 통째로 빼던 걸 고쳤다 - 이제
// 거래추가 팝업의 [종목 검색]으로 부동산도 찾아 고를 수 있고, 선택 시 소유자/계좌구분/통화까지 자동
// 완성되어(applyStockPickToTransactionForm) 매도 시 이름 불일치로 기존 포지션과 안 이어지던 사고를
// 막는다. ②[긴급 버그 수정] "리밸런싱 후" 3개 시나리오(보수/일반/긍정) 계산에서 부동산 원금이 재배분
// 대상에서 빠지는 것까지는 의도한 설계였는데, 그 후 어느 계산에도 다시 더해지지 않고 완전히 누락되고
// 있었다 - simulateRebalancedPreset()에 부동산 전용 복리 성장(보수3.0/일반5.5/긍정8.0%)을 별도로 계산해
// 최종 총자산에 합산하도록 고쳤고, 가중평균 기대수익률도 부동산 비중만큼 섞이도록 계산식을 보완했다.
// v52->v53: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 파일을 다시 받아온다 - 안 바꾸면
// GitHub에 새 index.html을 올려도 이미 설치된 모바일 PWA는 계속 캐시된 예전 버전만 보여준다(activate
// 핸들러가 CACHE_NAME이 다른 캐시만 지우기 때문).
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
