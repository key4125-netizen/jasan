// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v157'; // [버그 수정 - 동시요청 제한이 오히려 1분+ 역효과를 낸 문제]
// v156의 동시요청 제한 세마포어(priceRequestLimiter, 티커당 동시 진행 5개)가 실사용에서 전체 갱신이
// 1분을 넘기고 해외(미국) 종목 실패가 늘어나는 역효과를 냈다 - 원인은 이 세마포어를
// fetchDailyCloses(리스크 진단 단계, 시세 조회 "다음"에 체이닝됨)와도 공유한 것이었다. 보유종목이
// 20~30개면 5개씩 "파도" 단위로 순서대로 처리되는데, 예전엔 "가장 느린 종목 하나"만 기다리면 됐던
// 게 "여러 파도의 합"(시세조회 파도들 + 리스크진단 파도들이 순차로 더해짐)을 기다리는 구조가 됐다 -
// 개별 조회가 최악 근처(수 초~12초)로 조금만 느려져도 파도 수만큼 곱해져 1분을 쉽게 넘긴다. 해외
// 종목은 네이버/KIS 안전망을 못 쓰고 Yahoo/Stooq 하나뿐인데 대기열 뒤쪽 파도에 몰리면서 실패가 특히
// 늘어났다.
// [수정] js/09: priceRequestLimiter를 완전히 제거하고 fetchPriceWithFallback/fetchDailyCloses를
// v151~v154 때처럼 제한 없이 병렬 호출하는 방식으로 되돌렸다 - v151~v154의 "동시 경쟁" 구조(순차
// 대기 제거)와 v156의 KIS 국내 최종 안전망은 그대로 유지, 인위적으로 동시요청 총량을 제한하던
// 계층만 되돌린다.
// [실측 - 참고용] 되돌린 뒤 확인해보니 own-worker가 단일 요청 하나만 보내도 즉시 429를 반환하고
// (동시요청 개수와 무관), 공용 백업 프록시 6개 중 5개(allorigins/codetabs/allorigins-get/
// corsproxy.io)가 무응답/고장 상태였다 - 오늘 여러 시간에 걸친 반복 테스트로 own-worker의 Yahoo
// 쪽 접근이 일시적으로 rate-limit 걸렸을 가능성이 높다. 이건 코드 문제가 아니라 외부 상태이므로
// 시간이 지나면(수십 분 내) 자연 해소될 것으로 예상된다.
// js/09가 바뀌었으므로 v156->v157로 올려 PWA가 캐시된 예전 버전을 버리고 새로 받아오게 한다.
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
