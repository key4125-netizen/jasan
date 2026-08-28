// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v158'; // [UI 일괄 개선 - 야간모드/모바일 정렬/종목분석/미래예측/Top5]
// 오늘 여러 소소한 UI 요청을 한 번에 모아 반영한다(v157까지의 시세갱신 안정화 작업과는 완전히 별개).
// 1) 야간 모드 시인성: profitColor() 등 상승/하락(빨강/파랑) 및 경고(주황)/신뢰도(초록) 색상 10여 곳에
//    dark: 400번대 변형을 추가해, 거의 검정에 가까운 배경(slate-950) 위에서 500번대 색상의 과한
//    채도로 인한 눈부심을 완화했다.
// 2) 모바일 "서버 동기화중지" 버튼 줄바뀜: "동기화중"(7자)과 "동기화중지"/"동기화오류"(8자)의 폭 차이로
//    상태 전환마다 줄바뀜 여부가 오락가락하던 것을, 세 상태 모두 동일한 고정폭(92px)으로 통일했다.
// 3) 핵심종목 실시간 팝업: 종목명 옆 괄호 등락률 표기를 티커가 있던 자리로 옮기고 티커는 숨겼다.
// 4) '종목 분석 & 투자 검토 보고서' 모달: 보유종목 상세 팝업과 동일한 섹션 순서(헤더→차트→핵심요약→
//    주가위치기술적참고→재무펀더멘털)로 재구성하고, 미보유 종목도 항상 인터랙티브 차트가 그려지도록
//    (assetDetailChart와 동일한 캔들+이동평균+기간버튼+줌 기능 신규 추가) 했다. 위험 관리 일반 원칙은
//    데이터 유무와 무관하게 항상 리포트 맨 마지막에 고정된다.
// 5) 매크로 브리핑("시장 종합 평가" 등) 타이틀 기준 정렬: 라벨+본문을 한 줄에 잇던 hangingIndentLine
//    대신 stackedTitleBody로 세로 분리해, 문장이 줄바꿈돼도 모든 줄이 타이틀의 왼쪽 여백에 맞춰지게 했다.
// 6) 시나리오별 예상 자산 스케줄: "4년후/9년후"처럼 불규칙하던 마일스톤을 현재/5/10/15/20/25/30년후
//    고정 5년 간격으로 바꾸고(30년 시야로 확장), 시뮬레이션 범위도 20년→30년으로 함께 늘렸다.
// 7) 국내/해외 자산 Top 5: 640px 미만에서 글자가 너무 작던 5열 표 대신, 종목당 두 줄(1줄: 종목명+
//    현재가/등락률, 2줄: 당일손익/총손익)짜리 큼직한 카드 레이아웃을 추가했다(sm 이상은 기존 표 유지).
// index.html·js/01·02·04·05·06·08·10이 바뀌었으므로 v157->v158로 올려 PWA가 캐시된 예전 버전을
// 버리고 새로 받아오게 한다.
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
