// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v98'; // [달러 현금 거래내역화 + 환차 반영 + 차트축/카드UI 개편]
// 큰 묶음 업데이트: ① 달러(USD) 현금을 원화 현금과 분리해 거래내역(매수/매도) 기반으로 관리하도록
// 전환(findMatchingCashAsset/syncAssetsFromTransactions) - 매수 시 단가 1 고정+수량=금액, 적용환율
// 기록, 분할매수는 가중평균환율(avgRate)로 자동 누적, 매도 시 그 가중평균을 적용환율 기본값으로
// 자동채움(직접 알고 있는 실제 환전환율로 덮어쓰기 가능) - 기존 보유분은 부팅 시 1회 '최초' 매수
// 거래로 자동 전환(추정환율 1,450원). ② calcRow()가 매입원가 환산에 오늘 환율 대신 매수 시점
// 가중평균환율(a.buyRate)을 써서, 보유 중인 해외자산(주식+달러현금 전부)의 누적 평가손익에도 환차
// 손익이 실시간 환율 갱신마다 반영된다. ③ calcDailyPnL()에 '달러 현금 전용 환차만 반영' 분기를
// 추가해 일간금융평가손익의 "해외통화" 버킷에 달러 현금의 당일 환율 변동분도 잡히게 했다(주식은
// 원래도 정확했음을 재검증 완료). ④ 자산상세모달 삭제/수정 버튼 게이팅을 '티커 유무'에서 '거래내역
// 추적 여부'(isTransactionTracked)로 교체 - 달러 현금도 이제 거래내역 기반이라 버튼이 숨겨진다. ⑤
// 자산 상세 차트 Y축(원화 1만원 이상 '만' 단위 축약)/X축(M/d) 포맷 변경, 라벨이 짧아진 만큼 차트
// 영역도 자동으로 넓어짐(Chart.js 자동 폭 계산, 실측 57→38px). ⑥ KPI 카드 우측 상단의 원형 장식
// 아이콘 배지 4개를 전부 제거하고 세부내용 버튼이 카드 여백에 자연스럽게 정렬되도록 정리.
// 전부 실측 검증 완료(가중평균/실현손익 수식 정확히 일치, 원화현금 차단 유지, 콘솔 에러 없음).
// v97->v98: 이 값을 바꿔야 PWA가 캐시해 둔 예전 index.html을 버리고 새 index.html을 다시 받아온다 - 안
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
