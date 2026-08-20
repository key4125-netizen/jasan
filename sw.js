// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v94'; // [부팅 자동 팝업 개편 - 위험진단 중지, 핵심종목 상시노출]
// bootApp()의 자동 팝업 체이닝을 재조정했다. ① maybeShowRiskAlertPopup() 호출을 완전히 제거 - 위험
// 점수(주의/위험)나 시간대 조건과 무관하게 포트폴리오 위험 진단 팝업은 이제 부팅 시 절대 자동으로
// 뜨지 않는다(이 함수의 유일한 호출부였음 - RISK 관리 카드 자체는 대시보드에 그대로 남아있음). ②
// 핵심종목 실시간 팝업은 반대로 isPopupAllowedTimeWindow() 시간대 게이팅을 없애고 접속할 때마다
// 항상 자동으로 띄운다 - 이제 아무 데서도 안 쓰여 isPopupAllowedTimeWindow() 함수 자체를 삭제했다.
// 팝업 안에서 국내/해외를 가르는 시간대 판정과 후보 종목 추출(1순위 해외통화/2순위 원화ETF 보충 등)
// 로직은 이 자동 노출 시점 변경과 완전히 별개라 손대지 않았다 - 언제 자동으로 뜨는지만 바뀌었다.
// 헤더의 [핵심종목 실시간] 버튼은 원래도 이 로직을 거치지 않는 별도 경로라 변경 없음.
// v93->v94: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 index.html을 다시 받아온다 - 안
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
