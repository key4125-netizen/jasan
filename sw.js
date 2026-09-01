// Smart Asset Manager - 기본 오프라인 캐싱 서비스 워커
// index.html(자산관리.html)과 반드시 같은 폴더에 있어야 하며, HTTPS(또는 localhost)로 호스팅되어야
// 브라우저가 등록을 허용한다(file:// 로컬 실행에서는 등록 자체가 불가능 - 웹 표준 보안 정책).

const CACHE_NAME = 'smart-asset-manager-v165'; // [미래예측 탭 정리 + 유령 자산/모바일 팝업 버그 수정]
// 1) 포트폴리오 구성 탭에서 "목표 항목에 해당하지 않는 자산" 안내문(부동산 등 제외 안내)을 삭제했다.
// 2) 전량 매도됐거나(수량 0) 가격 미입력으로 평가금액이 0원인 "유령 자산"이 리밸런싱 실행 가이드/엑셀
//    다운로드에 계속 나타나던 버그를 고쳤다 - 수량이 아니라 실제 평가금액(calcRow().curAmount)이 0인
//    자산을 걸러야 두 경우(전량매도/미보유 수동종목) 다 잡힌다.
// 3) 탭을 전환했다 돌아오면 모든 아코디언이 접힌 상태로 초기화돼야 하는데, 새로 추가된 "시나리오별
//    일반계좌/총자산 금액 비교" 아코디언 키가 초기화 목록에서 빠져 있던 버그를 고쳤다(키를 일일이
//    나열하지 않고 전체 순회하도록 일반화해 앞으로 키가 늘어도 다시 고칠 필요가 없다).
// 4) 절세계좌 "적립 예상" 버튼/소유자 드롭다운에 44px 최소 터치 영역(touch-target)을 적용했다 -
//    모바일 실측 폭에서 30px 안팎으로 렌더링돼 손가락으로 누르면 옆 요소와 자꾸 오탭되던 문제 수정.
// 5) 미래예측 탭 카드 문구에서 "리밸런싱" 표현을 걷어내고("목표배분·보수적/일반적/긍정적" 등 자연스러운
//    용어로 정리), "시나리오별 적용 수익률 요약" 카드를 삭제했다(세부 수익률은 [수익률 관리] 팝업에서
//    확인). 카드 상단에 "일반계좌 현황" 섹션 타이틀을 추가했다.
// 6) 미래예측 시뮬레이션 기간을 30년→20년으로 단축했다(5/10/15/20년 마일스톤만 표시).
// 1) '리밸런싱 설정' 탭을 '포트폴리오 구성'으로 개명하고, 이 탭 + 미래예측 탭 모두 절세계좌(ISA/IRP/
//    연금저축) 및 부동산을 완전히 제외한 순수 일반계좌 자산만 대상으로 계산하도록 통일했다(이전엔
//    미래예측만 절세계좌+부동산까지 포함했었음 - 다시 되돌림).
// 2) 새 "절세계좌 현황" 카드: 신랑/와이프 드롭다운으로 절세계좌 합산 현황을 보고, [적립 예상] 팝업에서
//    월 적립액+기간을 입력하면 위험자산70%/안전자산30% 고정 비율로 복리 성장한 보수/일반/긍정 3개
//    시나리오 예상액을 계산한다.
// 3) '리밸런싱 후(일반적)-상품비중' 카드를 '시나리오별 적용 수익률 요약'보다 위로 재배치.
// 4) '3가지 시나리오 미래 자산 통합 비교'→'시나리오별 일반계좌 그래프', '시나리오별 예상 자산 스케줄
//    비교'→'시나리오별 일반계좌 금액 비교'(아코디언 접기/펼치기로 전환)로 개명.
// 5) 신규 "시나리오별 총 자산 그래프"/"시나리오별 총자산 금액 비교" 카드 추가 - 일반계좌 시나리오에
//    절세계좌 적립 계획과 부동산(현재가치 복리 성장)까지 더한 가구 전체 총자산 기준.
// 1) VIX/코스피/코스닥/S&P500/나스닥/다우/美10년물 지수 상세 팝업 차트가 "해외 티커"라는 이유만으로
//    가격도 아닌 지수(포인트)값에 "$"를 붙이고 있던 버그를 고쳤다(isIndexPoint 플래그 도입).
// 2) "시장현황 & 매크로 브리핑"에 금 시세(Gold, Yahoo GC=F)를 새로 추가하고 1행 4개(VIX/원달러/
//    美10년물/금시세)·2행 5개(코스피/코스닥/S&P500/나스닥/다우) 레이아웃으로 재구성했다. "시장 종합
//    평가"에도 "금 급등+VIX 높음=안전자산 선호" 규칙을 추가해 금시세 변동이 코멘트에 반영되게 했다.
// 3) '일간금융평가손익'·'총금융자산평가손익'·'총자산평가금액'·'총자산투자금액' 카드 타이틀의 글자
//    크기/굵기를 '기간별 실현 손익' 카드와 동일한 text-sm font-semibold로 통일했다.
// '목표비중 설정'과 '실행 가이드' 서브탭을 "리밸런싱 설정" 하나로 합쳤다. 상단 "리밸런싱 효과 요약"
// 카드와 하단 "국내/해외 리밸런싱 결과"·"국내/해외 세부 리밸런싱 결과" 아코디언 카드 3개를 완전히
// 삭제하고, 그 자리에 기존 '실행 가이드'의 "종목별 리밸런싱 실행 가이드"를 그대로 옮겨왔다(목표비중
// 미달 자산 안내문도 함께 이동). 이 카드들만 채우던 JS 렌더 함수·아코디언 상태 코드·미래예측의
// "현재 구성 유지" 시뮬레이션 계산까지 전부 정리해 죽은 코드가 남지 않게 했다.
// 1) 상단 컨트롤 바(환율뱃지·다크모드·서버동기화): 이 셋만 별도 flex-nowrap 그룹으로 묶어 justify-between
//    + w-full로 어떤 모바일 화면 폭에서도 절대 줄바꿈 없이 한 줄에 균등 분산 배치되게 했다(내용이 화면
//    보다 넓어지는 극단적으로 좁은 기기에서는 그 줄 안에서만 가로 스크롤). 바깥 컨테이너는 그대로
//    flex-wrap을 유지해 아래 6버튼 그리드는 예전처럼 정상적으로 다음 줄로 넘어간다.
// 2) 야간/주간 모드 전환 깜박임 제거: 토글 순간 html에 .theme-switching을 붙여 모든 transition을 꺼서
//    색이 한 프레임에 즉시 바뀌게 하고, 다음 프레임에 다시 켜서 테마가 여러 요소에 걸쳐 각자 다른
//    타이밍으로 교차 페이드되며 생기던 깜박임을 없앴다.
// 3) 핵심종목 실시간 팝업 부팅 자동 오픈 완전 제거 - 이제 헤더의 [핵심종목 실시간] 버튼을 직접 눌렀을
//    때만 열린다.
// 4) '수익율 관리' 버튼을 '월 적립금' 옆으로 옮기고 브랜드 색으로 시인성을 높였다.
// 5) 미래자산 비교를 '현재 구성 유지' 포함 4가지에서 리밸런싱 후 보수적/일반적/긍정적 3가지로 개편
//    (요약 카드·통합 비교 차트·스케줄 표 전부) - '리밸런싱 효과 요약' 카드(현재유지 vs 일반적 차액)는
//    별개 영역이라 그대로 유지된다.
// 6) 탭 전환 시 펼쳐둔 아코디언/드롭다운을 상위·하위 탭 어디서든 항상 접힌 상태로 초기화하고, 스크롤
//    위치도 항상 맨 위로 되돌리도록 switchTab()/switchRebalanceSubTab()을 고쳤다.
// 1) 모바일 "서버 동기화" 버튼: v158의 고정폭(92px) 방식이 실제 기기에서는 오히려 "동기화중"까지
//    줄바뀜을 유발해, 대신 환율 배지의 연필 아이콘·"환율보기" 텍스트를 모바일에서 숨겨 공간을 확보하고
//    동기화 버튼은 원래 크기(고정폭 없음)로 되돌려 항상 환율/야간모드 버튼과 같은 줄에 위치하게 했다.
// 2) 지수 상세 팝업 통일: "시장 현황 & 매크로 브리핑"의 지수/지표 타일 클릭 시 뜨던 전용 #macroDetailModal을
//    완전히 제거하고, "핵심종목 실시간" 팝업이 쓰는 종목 상세 모달(#assetDetailModal)을 그대로 열도록
//    통일했다 - 목록에 없던 지표(VIX, 환율 등)도 동일한 크기/스타일로 동적 렌더링된다.
// 3) [다크모드 배경색 버그 수정 - 진짜 원인] '서버 동기화중' 버튼, 'JSON 자동 백업중' 버튼, '종목 분석
//    & 투자 검토 보고서' 버튼이 야간 모드에서 흰색/밝은 배경으로 보이던 문제의 실제 원인을 찾았다:
//    이 버튼들이 쓰는 dark:bg-brand-950 계열 클래스가 참조하는 'brand-950' 색상 자체가 tailwind.config의
//    brand 팔레트에 정의돼 있지 않아(900까지만 존재) Tailwind CDN JIT이 해당 CSS를 아예 생성하지 못했다
//    - 팔레트에 950 단계(#1e1b4b)를 추가해 근본 원인을 해결했다. 부수적으로 서버 동기화 상태 갱신 함수
//    (updateSyncStatusUI)가 상태가 안 바뀌어도 매번 색상 클래스를 지웠다 다시 붙이던 것도, 실제로 상태가
//    바뀔 때만 건드리도록 고쳐 배경색 전환 애니메이션이 불필요하게 재시작되지 않게 했다.
// index.html·js/03·08·10·12가 바뀌었으므로 v158->v159로 올려 PWA가 캐시된 예전 버전을 버리고 새로
// 받아오게 한다.
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
