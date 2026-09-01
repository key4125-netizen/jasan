/* =========================================================================
 * Smart Asset Manager
 * 순수 클라이언트 사이드(단일 HTML)로 동작하는 개인 자산관리 대시보드.
 * 사용자는 [ticker, 소유자, 계좌구분, 종목명, 국내/해외, 통화, 수량, 매수단가] 8개 항목을 입력하고,
 * 자산군·현재가·매입금액·평가지표는 모듈이 자동으로 판별/계산한다.
 * 원화(KRW) 환산 계산은 전부 '통화' 필드(KRW/USD)를 기준으로 수행한다 - '국내/해외'는 위치·분류용
 * 표시 항목일 뿐이며, 통화와 반드시 일치할 필요는 없다(예: 국내 계좌로 보유한 달러 예수금).
 * 데이터는 브라우저 localStorage 에만 저장되며, 외부 API는 환율/시세 조회에만 사용된다.
 * ========================================================================= */

/* -------------------------------------------------------------------------
 * 0. 상수 및 localStorage 키
 * ---------------------------------------------------------------------- */
const LS_ASSETS = 'sam_assets_v5';
const LS_RATE = 'sam_exchange_rate_v5';
const LS_DAILY_RATE = 'sam_daily_rate_v5';
const LS_DARKMODE = 'sam_dark_mode_v5';
const LS_REBALANCE = 'sam_rebalance_v1';
const LS_PROJECTION = 'sam_projection_v1';
const LS_TRANSACTIONS = 'sam_transactions_v1';
const LS_LEARNED_TICKER_NAMES = 'sam_learned_ticker_names_v1';
// 일간 손익 계산에 쓰이는 "오늘 하루의 기준 환율"(전일 종가 개념) 저장 키.
// FX는 24시간 거래되어 명확한 "전일 종가"가 없으므로, 달력 날짜가 바뀔 때 그 시점의 환율을
// 스냅샷해서 그날 하루 동안 고정 기준값으로 사용한다(당일 중 환율이 갱신되어도 기준값은 안 바뀜).
const LS_REF_RATE = 'sam_ref_rate_v1';
// [일별 손익 추이 팝업] 일자별 자동 스냅샷 저장 키 - state.dailySnapshots 참고.
const LS_DAILY_SNAPSHOTS = 'sam_daily_snapshot_v1';
// [데이터 초기화 후 샘플 데이터 재시딩 방지] loadState()는 state.assets가 비어있으면 "이 기기를 처음
// 켠 신규 사용자"로 보고 데모용 sampleAssets()를 자동으로 채워 넣는다(온보딩 목적) - 그런데 이
// "비어있음" 판정이 "정말 한 번도 안 켜본 기기"와 "사용자가 [데이터 초기화]를 눌러 의도적으로 비운
// 상태"를 구분하지 못해서, 초기화 후 앱을 완전히 종료했다가 다시 열면(=loadState 재실행) 매번 샘플
// 데이터가 되살아나는 버그가 있었다("초기화해도 옛날 데이터가 남아있는 것처럼 보인다"는 사용자 신고의
// 실제 원인). 이 플래그를 한 번이라도 켠 적 있는 기기에서는 다시는 샘플 데이터를 자동으로 채우지
// 않는다 - resetDataBtn의 'sam_' 접두사 와일드카드 삭제 목록에서도 반드시 제외해야 한다.
const LS_HAS_LAUNCHED = 'sam_has_launched_v1';
// [구글 드라이브 동기화 기능 완전 제거] 이 앱은 다시 기기 로컬 저장(localStorage) 전용으로 동작한다.
// 예전에 구글 드라이브 연동 기능을 썼던 기기에는 아래 키들이 여전히 남아있을 수 있어(연동 여부 표식,
// 캐시된 OAuth 토큰, 표시용 사용자 정보, 마지막 로컬 수정 시각) 앱 시작 시 한 번(cleanupLegacyGoogleSyncKeys,
// bootApp 참고) 정리한다. 기능 자체가 완전히 제거됐으므로 이 키들은 더 이상 어떤 로직에서도 쓰이지
// 않는다 - 순수하게 예전 기기에 남은 찌꺼기 데이터 청소용 목록이다.
const LEGACY_GOOGLE_LS_KEYS = ['sam_google_connected_v1', 'sam_google_token_v1', 'sam_google_user_info_v1', 'sam_last_local_update_v1'];
function cleanupLegacyGoogleSyncKeys() {
  LEGACY_GOOGLE_LS_KEYS.forEach((k) => localStorage.removeItem(k));
}

// [가족 동기화 - Cloudflare Worker+KV] 위 구글 드라이브 시도와 달리 OAuth 없이, 기기 로컬에만 저장되는
// "가족 공유 암호" 하나로 두 기기(부부) 간 암호화된 자동 동기화를 수행한다 - 상세 로직은 "가족 동기화"
// 섹션(§22-2) 참고. SYNC_WORKER_URL은 사용자가 Cloudflare에 cloudflare-worker-sync.js를 직접 배포한 뒤
// 발급받은 주소로 채워 넣는다(이 저장소 소스에는 어떤 비밀값도 없음 - 배포 주소 자체는 비밀이 아니다).
const SYNC_WORKER_URL = 'https://steep-haze-01f0.key4125.workers.dev';
const LS_SYNC_PASSWORD = 'sam_sync_password_v1';
const LS_SYNC_ENABLED = 'sam_sync_enabled_v1';
const LS_SYNC_LAST_VERSION = 'sam_sync_last_version_v1';
const LS_SYNC_LAST_SYNCED_AT = 'sam_sync_last_synced_at_v1';
// [스마트 머지 - 삭제 판정 기준선] 마지막으로 병합에 성공했을 때 이 기기가 알고 있던 자산/거래내역
// id 목록 - "한쪽에만 있는 id"가 "새로 생김"인지 "상대가 지움"인지 구분하는 데 쓰인다(js/12의
// mergeCollectionById 참고).
const LS_SYNC_MERGED_ASSET_IDS = 'sam_sync_merged_asset_ids_v1';
const LS_SYNC_MERGED_TX_IDS = 'sam_sync_merged_tx_ids_v1';
// [JSON 자동 백업] 토글 on/off 상태와 "오늘 이미 백업했는지" 판정 기준 날짜(로컬 타임존, todayDateStr()
// 형식) - js/12-import-export-sync.js의 downloadJsonBackup()/runAutoBackupIfDue() 참고.
const LS_AUTO_BACKUP_ENABLED = 'sam_auto_backup_enabled_v1';
const LS_LAST_AUTO_BACKUP_DATE = 'sam_last_auto_backup_date_v1';

const CATEGORY_COLORS = {
  '주식': '#6366f1', 'ETF': '#06b6d4', '채권': '#10b981',
  '현금': '#64748b', '부동산': '#ef4444', '원자재': '#a855f7', '암호화폐': '#ec4899'
};

// 이 자산군은 시세가 존재하지 않는 고정형 자산으로 간주해, 티커 입력 여부와 무관하게 항상
// 실시간 시세 조회 대상 및 일간 손익 계산에서 제외한다(사용자가 실수로 티커를 입력해 넣어도 예외).
const NON_TRADABLE_CATEGORIES = ['채권', '현금', '부동산'];
// [해외주식 환율 이력 - 기본값] 거래(매수/매도)에 적용 환율(appliedRate) 기록이 없는 경우(과거 거래,
// 엑셀 업로드 시 '적용환율' 컬럼 미기재 등) 쓰는 추정 환율. 실현손익이 조회 시점의 실시간 환율에 따라
// 계속 흔들리지 않도록, "현재 환율"이 아니라 고정된 값을 기본값으로 둔다.
const DEFAULT_LEGACY_FX_RATE = 1450;
// [절세 계좌 제외] 미래예측/리밸런싱 계산(일반계좌 미래예측 탭, 일반계좌 리밸런싱 탭)은 연금저축/IRP/ISA
// 같은 절세 계좌를 제외한 자산만을 대상으로 한다 - 절세 계좌는 세제 혜택 유지를 위해 자유롭게
// 매도/매수하기 어려운 경우가 많아, 실제로 리밸런싱을 실행할 수 있는 계좌만 계산에 포함시킨다.
// 대시보드("총투자현황")를 포함한 다른 화면은 계좌 구분과 무관하게 항상 전체 자산을 그대로 보여준다 -
// 이 필터는 아래 두 함수(getProjectionGroupStats, computeRegionTargetAmounts/computeIndividualRebalanceGuide가
// 공유하는 regionAssets 필터)에만 적용된다.
// [버그 수정] 원래 accountType이 정확히 '일반계좌' 문자열인 자산만 포함하는 방식이었는데, 계좌구분
// 입력칸이 자유 텍스트라(f_accountType, 데이터리스트는 힌트일 뿐) '토스'/'CMA'/'채권/현금'처럼 절세
// 계좌가 아닌데도 '일반계좌'라고 정확히 쓰지 않은 계좌가 전부 리밸런싱/미래예측 계산에서 빠지는
// 문제가 있었다. 의도(절세 계좌만 제외)에 맞게 절세 계좌 이름 목록에 대한 제외 방식으로 바꾼다.
const TAX_ADVANTAGED_ACCOUNT_TYPES = ['ISA', 'IRP', '연금저축'];
function isRebalanceEligibleAccount(a) { return !TAX_ADVANTAGED_ACCOUNT_TYPES.includes(a.accountType); }
const FALLBACK_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#64748b','#06b6d4','#a855f7','#ec4899','#84cc16','#0ea5e9'];
function colorFor(key, idx){ return CATEGORY_COLORS[key] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]; }

// Yahoo Finance 차트 API 호출 시 사용하는 CORS 우회 프록시. 예전에는 순서대로 하나씩 시도했지만,
// 모바일(특히 APK로 패키징한 WebView) 환경은 프록시 자체가 느리거나 막혀 있는 경우가 잦아 순차 시도는
// 대기시간이 눈덩이처럼 불어난다(3개를 각 8~12초씩 순서대로 기다리면 최악의 경우 30초 이상). 그래서
// 아래 fetchPriceWithFallback/fetchExchangeRate는 이 프록시들을 전부 "동시에" 쏘고 가장 먼저 성공하는
// 응답만 채택한다(Promise.allSettled 경쟁) - 하나가 느리거나 죽어 있어도 다른 프록시가 살아있으면
// 그 응답 속도로 끝난다.
// 각 항목은 원본 응답을 그대로 돌려주는 'raw' 방식이 기본이며, 응답을 자체 포맷으로 감싸서 주는
// 프록시(allorigins-get은 {contents:"..."} JSON, r.jina.ai는 텍스트 프리앰블 뒤에 원본을 붙이는 방식)는
// 별도 parse(res)를 정의해 fetchYahooViaProxy/fetchFxFromSource가 동일하게 처리할 수 있게 한다.
// corsproxy.io는 2026년부터 localhost/개발환경 외 배포 도메인에서 무료 사용을 막아(HTTP 403,
// "Free usage is limited to localhost and development environments") 사실상 상시 실패 소스가 되었지만,
// 향후 정책이 바뀔 수 있고 실패해도 Promise.allSettled 경쟁 구조상 다른 소스가 이어받으므로 그대로 둔다.
// [개인 Cloudflare Worker 프록시] 사용자가 직접 배포한 전용 프록시(무료 티어 하루 10만 요청, 본인
// 소유 계정이라 공용 무료 프록시들처럼 예고 없이 막히거나 죽을 위험이 훨씬 낮다) - 실측으로 Yahoo/
// Naver/환율 API 전부 200 OK + 유효 데이터 확인 후 최우선 순위로 등록한다. 원본 응답을 그대로
// 돌려주는 'raw' 방식이라 별도 parse가 필요 없다.
const OWN_WORKER_PROXY_BASE = 'https://asset-manager-proxy.key4125.workers.dev/?url=';
const CORS_PROXIES = [
  { name: 'own-worker', build: (url) => OWN_WORKER_PROXY_BASE + encodeURIComponent(url) },
  { name: 'allorigins', build: (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) },
  { name: 'corsproxy.io', build: (url) => 'https://corsproxy.io/?url=' + encodeURIComponent(url) },
  { name: 'codetabs', build: (url) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url) },
  {
    name: 'allorigins-get',
    build: (url) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(url),
    parse: async (res) => {
      const wrapped = await safeParseJsonResponse(res);
      if (!wrapped || typeof wrapped.contents !== 'string') throw new Error('contents 필드 없음');
      return safeParseJsonText(wrapped.contents);
    }
  },
  {
    name: 'r.jina.ai',
    build: (url) => 'https://r.jina.ai/' + url,
    parse: async (res) => {
      const text = await res.text();
      const idx = text.indexOf('{');
      if (idx === -1) throw new Error('JSON 응답 없음');
      return safeParseJsonText(text.slice(idx));
    }
  }
];
const YAHOO_CHART_API = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// [한국투자증권(KIS) 시세/재무 프록시] 국내주식 전용 - 사용자가 직접 배포한 cloudflare-worker-kis-proxy.js
// Worker 주소다. KIS 앱키/앱시크릿은 이 Worker 안(서버 사이드)에만 있고 클라이언트 코드에는 전혀
// 노출되지 않는다. KIS_CLIENT_SHARED_SECRET은 이 Worker가 매 요청마다 X-App-Secret 헤더로 검증하는
// 공유 비밀키인데, 이 저장소는 공개(public) GitHub 저장소라 여기 적힌 값도 사실상 누구나 볼 수 있다 -
// 그래서 이건 "진짜 비밀"이 아니라 무작위 봇의 무차별 스캔을 막는 최소한의 문턱 정도로만 취급한다
// (실제 방어선은 이 Worker 코드에 주문/계좌 라우트를 아예 만들지 않은 것 - cloudflare-worker-kis-proxy.js
// 참고). 값이 새어나가 남용되면 Cloudflare 대시보드에서 이 값만 새로 바꾸면 된다.
const KIS_PROXY_URL = 'https://keymaster.key4125.workers.dev';
const KIS_CLIENT_SHARED_SECRET = 'KeymasterSecret2026!';

// [실시간성 문제 발견] open.er-api/exchangerate-api는 둘 다 하루 1회만 갱신되는 스냅샷 API였다
// (open.er-api 응답의 time_last_update_utc/time_next_update_utc 필드로 실측 확인 - 다음 갱신까지
// ~24시간 간격) - 그래서 장중 실제 환율이 계속 움직여도 이 앱은 그날 아침 스냅샷 값만 하루 종일
//보여주고 있었다(실사용자가 네이버 실시간 환율과 비교해 발견한 괴리, 최대 10원 이상 차이 남).
// [해결] Yahoo Finance의 KRW=X 티커(보유 종목 시세 조회와 완전히 같은 v8/finance/chart API)는 진짜
// 실시간이라(실측: 조회 시각과 거의 일치하는 regularMarketTime), 이걸 최우선 소스로 승격했다.
// 기존 하루-1회 소스들은 Yahoo가 전부 실패할 때만 쓰는 최종 폴백으로 남겨둔다.
const YAHOO_FX_TARGET_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1m&range=1d';
// Yahoo chart API 응답(meta.regularMarketPrice)을 나머지 소스들과 같은 { rates: { KRW } } 스키마로
// 맞춰주는 공용 변환 함수 - fetchFxFromSource()가 소스 종류와 무관하게 이 스키마 하나만 보고 처리한다.
function parseYahooFxChartJson(data) {
  const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  const price = meta && meta.regularMarketPrice;
  if (typeof price !== 'number' || price <= 0) throw new Error('KRW=X 가격 필드 없음');
  // [일간 손익 기준선 - 공식 전일 마감 환율] 주식 시세 조회(fetchPriceWithFallback)와 동일하게 meta의
  // previousClose(없으면 chartPreviousClose)를 함께 뽑아둔다 - 이 값이 기기와 무관한 "공식 전일 마감
  // 환율"이라 fetchExchangeRate()가 이걸로 state.refExchangeRate를 정한다(applyOfficialFxReference 참고).
  const previousCloseRaw = meta && (typeof meta.previousClose === 'number' ? meta.previousClose
    : (typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null));
  return { rates: { KRW: price }, previousClose: Number.isFinite(previousCloseRaw) ? previousCloseRaw : null };
}
// [버그 수정 - Promise.any는 순서가 아니라 속도로 뽑는다] 처음엔 Yahoo 소스를 배열 앞쪽에 두면
// 우선될 거라 생각했는데, 실측해보니 open.er-api류(가벼운 JSON, 직접호출·프록시 없음)가 Yahoo
// chart API(무거운 분봉 배열 payload + 항상 프록시 경유)보다 항상 더 빨리 끝나서 Promise.any가
// 매번 stale한 open.er-api 값을 채택해버렸다 - Yahoo가 성공해도 이미 늦어서 무시됨. 그래서 배열
// 하나로 다 같이 경쟁시키는 대신, "실시간 소스 우선 시도 → 전부 실패할 때만 스냅샷 소스로 폴백"
// 2단계 구조로 바꿨다(아래 fetchExchangeRate 참고) - 순서가 아니라 실제로 그 순서를 강제한다.
const FX_TARGET_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_SOURCES_REALTIME = [
  {
    name: 'Yahoo(KRW=X, own-worker)',
    url: OWN_WORKER_PROXY_BASE + encodeURIComponent(YAHOO_FX_TARGET_URL),
    parse: async (res) => parseYahooFxChartJson(await safeParseJsonResponse(res))
  },
  {
    name: 'Yahoo(KRW=X, r.jina.ai)',
    url: 'https://r.jina.ai/' + YAHOO_FX_TARGET_URL,
    parse: async (res) => {
      const text = await res.text();
      const idx = text.indexOf('{');
      if (idx === -1) throw new Error('JSON 응답 없음');
      return parseYahooFxChartJson(safeParseJsonText(text.slice(idx)));
    }
  },
  {
    name: 'Yahoo(KRW=X, allorigins)',
    url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(YAHOO_FX_TARGET_URL),
    parse: async (res) => parseYahooFxChartJson(await safeParseJsonResponse(res))
  }
];
// 하루 1회만 갱신되는 스냅샷 소스 - 위 실시간 소스가 전부(own-worker/r.jina.ai/allorigins 다) 실패할
// 때만 마지막 수단으로 쓰인다.
const FX_SOURCES_SNAPSHOT_FALLBACK = [
  { name: 'open.er-api(own-worker)', url: OWN_WORKER_PROXY_BASE + encodeURIComponent(FX_TARGET_URL) },
  { name: 'open.er-api', url: 'https://open.er-api.com/v6/latest/USD' },
  { name: 'exchangerate-api', url: 'https://api.exchangerate-api.com/v4/latest/USD' },
  { name: 'open.er-api(allorigins)', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(FX_TARGET_URL) },
  { name: 'open.er-api(corsproxy.io)', url: 'https://corsproxy.io/?url=' + encodeURIComponent(FX_TARGET_URL) },
  { name: 'open.er-api(codetabs)', url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(FX_TARGET_URL) },
  {
    name: 'open.er-api(allorigins-get)',
    url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(FX_TARGET_URL),
    parse: async (res) => {
      const wrapped = await safeParseJsonResponse(res);
      if (!wrapped || typeof wrapped.contents !== 'string') throw new Error('contents 필드 없음');
      return safeParseJsonText(wrapped.contents);
    }
  },
  {
    name: 'open.er-api(r.jina.ai)',
    url: 'https://r.jina.ai/' + FX_TARGET_URL,
    parse: async (res) => {
      const text = await res.text();
      const idx = text.indexOf('{');
      if (idx === -1) throw new Error('JSON 응답 없음');
      return safeParseJsonText(text.slice(idx));
    }
  }
];

/* -------------------------------------------------------------------------
 * 1. 자동 판별 로직 (자산군 / 국내·해외)
 *    - 티커·종목명 문자열을 분석해 사용자가 입력하지 않은 항목을 추론한다.
 *    - 추론 결과는 UI(모달의 자동판별 필드, 엑셀 업로드 결과)에서 언제든 덮어쓸 수 있다.
 * ---------------------------------------------------------------------- */
const BOND_KEYWORDS = ['채권', '국고채', '회사채', '국채', '통안채', 'BOND'];
const CASH_KEYWORDS = ['현금', '예수금', 'CASH', '달러', '외화', 'USD', 'USDT'];
const ETF_KEYWORDS = ['ETF', 'TIGER', 'KODEX', 'ACE', 'RISE', 'QQQ', 'SCHD', 'SPYM'];
const REAL_ESTATE_KEYWORDS = ['부동산', '아파트', '오피스텔', '상가', '토지', '건물'];

function classifyCategory(ticker, name) {
  const hay = ((ticker || '') + ' ' + (name || '')).toUpperCase();
  // 이름에 '채권/국채/국고채' 등이 들어가도 실제 거래소 티커가 있으면(예: KODEX 국고채3년, TIGER
  // 미국채10년선물 같은 채권형 ETF) 만기까지 들고 가는 개별 채권과 달리 매일 시세가 변하는 상장 상품이므로
  // '채권'(NON_TRADABLE_CATEGORIES에 포함되어 시세조회 대상에서 빠짐) 대신 ETF로 분류해 실시간 시세가
  // 계속 반영되게 한다. 티커가 없는 경우(직접 보유·만기보유 채권)만 원래대로 '채권'으로 분류한다.
  const hasTicker = String(ticker ?? '').trim() !== '';
  if (BOND_KEYWORDS.some(k => hay.includes(k.toUpperCase()))) return hasTicker ? 'ETF' : '채권';
  // '현금'도 채권과 동일한 이유로 보호한다: 이름에 '달러/USD/외화' 등이 들어가도 티커가 있으면
  // (예: TIGER 미국달러선물, KODEX 미국달러선물레버리지 같은 환율 연동 ETF) 매일 시세가 변하는 상장
  // 상품이므로 '현금'(시세조회 제외 대상) 대신 ETF로 분류한다. 티커 없는 순수 예수금/외화예금만
  // 원래대로 '현금'으로 분류한다.
  if (CASH_KEYWORDS.some(k => hay.includes(k.toUpperCase()))) return hasTicker ? 'ETF' : '현금';
  // ETF 브랜드명(TIGER/KODEX 등)이 붙은 상품은 이름에 '부동산'이 들어있어도(예: 리츠 ETF) 여기서
  // 먼저 ETF로 분류된다 - 실제 시장에서 거래되는 상품이므로 실시간 시세 조회 대상에서 빠지면 안 된다.
  // 순수하게 '부동산/아파트/...' 명칭뿐인, 티커 없이 직접 관리하는 실물 자산만 아래 규칙에 걸린다.
  if (ETF_KEYWORDS.some(k => hay.includes(k))) return 'ETF';
  if (REAL_ESTATE_KEYWORDS.some(k => hay.includes(k.toUpperCase()))) return '부동산';
  return '주식';
}

/* -------------------------------------------------------------------------
 * 1-1. 티커 정제(Sanitization) - 한국 금융 표준 종목코드 처리
 *    화면/저장에는 사용자가 입력한 원본 티커를 그대로 유지하고,
 *    Yahoo Finance 조회 시에만 표준 포맷(######.KS / .KQ)으로 변환해 사용한다.
 *    판별 우선순위: ① .KS/.KQ 명시 ② 'A'+숫자6자리 ③ 숫자6자리 ④ 그 외 해외 티커
 * ---------------------------------------------------------------------- */
function sanitizeTicker(rawTicker) {
  // 숫자 티커(예: 5930)나 null/undefined가 들어와도 안전하게 문자열로 강제 변환한다.
  const original = String(rawTicker ?? '').trim();
  if (!original) return { original: '', yahooTicker: '', isDomestic: '국내' }; // 티커 없는 채권/현금 등은 원화 자산으로 간주

  const upper = original.toUpperCase();

  // ⓪ [핵심종목 실시간 팝업] 지수 심볼(^로 시작, 예: ^KS11 코스피/^GSPC S&P500)은 보유 자산으로 등록될
  // 일이 없어 기존 규칙(6자리 숫자/.KS·.KQ 접미사)에 걸리지 않는다 - 코스피/코스닥만 원화(국내)로,
  // 나머지 해외 지수는 달러(해외)로 표시되도록 여기서 먼저 분기한다(openStockDetailModalReadOnly의
  // 통화 표시 추정용).
  if (upper.startsWith('^')) {
    const isDomesticIndex = upper === '^KS11' || upper === '^KQ11';
    return { original, yahooTicker: upper, isDomestic: isDomesticIndex ? '국내' : '해외' };
  }

  // ① 이미 .KS 또는 .KQ 접미사가 명시된 경우
  if (/\.(KS|KQ)$/.test(upper)) {
    return { original, yahooTicker: upper, isDomestic: '국내' };
  }
  // ② 'A' + 숫자 6자리 (예: A005930, A005380)
  const aPrefixMatch = upper.match(/^A(\d{6})$/);
  if (aPrefixMatch) {
    return { original, yahooTicker: aPrefixMatch[1] + '.KS', isDomestic: '국내' };
  }
  // ③ 순수 숫자 6자리 (예: 005930, 005380)
  if (/^\d{6}$/.test(upper)) {
    return { original, yahooTicker: upper + '.KS', isDomestic: '국내' };
  }
  // ④ 위 한국 종목코드 규격에 해당하지 않으면 해외 티커로 간주 (GOOGL, MSFT, QQQM 등)
  return { original, yahooTicker: upper, isDomestic: '해외' };
}

function classifyIsDomestic(ticker) {
  return sanitizeTicker(ticker).isDomestic;
}

function deriveDefaults(ticker, name) {
  return { category: classifyCategory(ticker, name), isDomestic: classifyIsDomestic(ticker) };
}

// 엑셀 업로드 시 사용자가 '국내/해외' 컬럼을 직접 기재하면 자동판별보다 우선 적용한다.
// '국내' 또는 '해외' 외의 값(공란, 오타 등)은 무시하고 자동판별 결과로 폴백한다.
function normalizeIsDomestic(raw, fallback) {
  const v = String(raw ?? '').trim();
  return (v === '국내' || v === '해외') ? v : fallback;
}

// 리밸런싱 목표: 지역(국내/해외)별로 "특정 티커 지정" 또는 "자산군 캐치올" 항목의 배열이다.
// pct는 그 지역 배분 "내에서"의 비중(%)이며, 지역별 합계가 100%가 되어야 한다(사용자가 자유롭게
// 수정 가능). 티커/카테고리 어느 항목에도 매칭되지 않는 자산(예: 부동산)은 실물자산이라 매수/매도로
// 조절할 수 없으므로 리밸런싱 계산 대상에서 자동으로 제외된다.
const DEFAULT_REBALANCE_TARGETS = {
  '국내': [
    { type: 'ticker', ticker: '278530', label: 'KODEX 200TR', pct: 15 },
    { type: 'ticker', ticker: '0052D0.KS', label: 'TIGER 코리아배당다우존스', pct: 15 },
    { type: 'category', category: '주식', label: '주식', pct: 20, selectedStocks: [] },
    { type: 'category', category: '채권', label: '채권', pct: 30 },
    { type: 'category', category: '현금', label: '현금', pct: 20 }
  ],
  // '주식'/'현금' 캐치올을 0%로 추가해 둔다 - QQQM/SPYM/SCHD 외의 해외 보유(개별 주식, 현금성 자산,
  // 그 외 ETF 등)가 "목표 항목 없음"으로 리밸런싱 계산에서 통째로 제외되지 않고, 최소한 이 캐치올에
  // 잡혀 "0% 목표 → 전액 매도 필요"로라도 눈에 보이게 한다(값은 사용자가 직접 조정 가능).
  '해외': [
    { type: 'ticker', ticker: 'QQQM', label: 'QQQM', pct: 50 },
    { type: 'ticker', ticker: 'SPYM', label: 'SPYM', pct: 20 },
    { type: 'ticker', ticker: 'SCHD', label: 'SCHD', pct: 30 },
    { type: 'category', category: '주식', label: '주식', pct: 0, selectedStocks: [] },
    { type: 'category', category: '현금', label: '현금', pct: 0 }
  ]
};
function cloneDefaultRebalanceTargets() {
  return {
    '국내': DEFAULT_REBALANCE_TARGETS['국내'].map((t) => ({ ...t })),
    '해외': DEFAULT_REBALANCE_TARGETS['해외'].map((t) => ({ ...t }))
  };
}

// 이미 localStorage/JSON 백업에 저장돼 있던 해외 세부 목표에는 '주식'/'현금' 캐치올이 없을 수 있다
// (이 캐치올을 나중에 추가했으므로). 기존에 저장된 티커별 비중은 그대로 두고, 없는 캐치올만 0%로
// 추가해 넣어 자산군 매칭 커버리지를 보강한다(합계는 0을 더하는 것이므로 100%가 깨지지 않는다).
function ensureForeignCategoryCatchalls(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  ['주식', '현금'].forEach((cat) => {
    const has = arr.some((t) => t && t.type === 'category' && t.category === cat);
    if (!has) arr.push({ type: 'category', category: cat, label: cat, pct: 0 });
  });
  return arr;
}

// [개별주식 추가 기능 제거] 예전 버전에서 리밸런싱 탭 검색으로 추가했던 개별주식은 custom:true로
// 표시되어 저장돼 있다 - 그 기능이 통째로 제거되어 이제 화면에서 보이지도, 관리되지도 않으므로,
// 이미 localStorage/JSON 백업에 남아있는 custom 항목을 불러오는 시점에 걸러내 깔끔하게 정리한다
// (남겨두면 화면엔 안 보이는데 비중(%)만 계산에 계속 반영되는 유령 항목이 된다).
function stripCustomRebalanceTargets(list) {
  return (Array.isArray(list) ? list : []).filter((t) => !(t && t.custom));
}

// [개별주식 다중 설정] '주식' 캐치올 항목에 보유 종목(최대 3개) + 종목별 비중을 매달아 둘 수 있다
// (selectedStocks: [{ticker, name, pct}]). 이 필드가 하나라도 있으면 '주식' 항목의 pct는 그 합계로
// 자동 계산되고(자동 계산 중엔 직접 입력 불가), 없으면 예전처럼 직접 입력한다. 예전에 저장된 데이터에는
// 이 필드가 없을 수 있어(기능이 나중에 추가됨) 불러올 때마다 빈 배열로 보강해 넣어 undefined 참조
// 에러 없이 항상 배열로 다룰 수 있게 한다.
const MAX_SELECTED_STOCKS_PER_CATEGORY = 3;
function ensureSelectedStocksField(list) {
  return (Array.isArray(list) ? list : []).map((t) => {
    if (t && t.type === 'category' && t.category === '주식' && !Array.isArray(t.selectedStocks)) {
      return { ...t, selectedStocks: [] };
    }
    return t;
  });
}

// 엑셀 업로드 시 사용자가 '통화' 컬럼을 직접 기재하면 그 값을 그대로 사용한다.
// 'KRW'/'USD'(또는 '원화'/'달러') 외의 값(공란, 오타 등)은 무시하고 fallback(기본값)으로 폴백한다.
// 통화는 국내/해외 표시와는 독립적인 필드로, 실제 원화 환산 계산은 전부 이 값을 기준으로 한다.
function normalizeCurrency(raw, fallback) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'KRW' || v === '원화') return 'KRW';
  if (v === 'USD' || v === '달러') return 'USD';
  return fallback;
}

/* -------------------------------------------------------------------------
 * 2. 상태(State)
 * ---------------------------------------------------------------------- */
const state = {
  assets: [],
  exchangeRate: 1450,
  // 오늘 하루의 일간 손익 계산에 쓰는 기준 환율(어제 종가 개념). loadState()의 ensureDailyReference()가
  // 달력 날짜 전환 시점에 스냅샷하며, 당일 중에는 exchangeRate가 갱신되어도 이 값은 고정된다.
  refExchangeRate: 1450,
  dailyChangeRate: 0,
  // [PART B - 상단 필터/목록 상태 분리] filters는 이제 상단 도넛 차트 3개에만 쓰인다(자산 관리
  // 목록은 더 이상 이 값의 영향을 받지 않음 - tableAssets() 참고). 검색어는 목록 실시간 필터가 아니라
  // Enter/버튼으로만 트리거되는 별도 팝업 검색(runAssetSearch)이라 여기 보관할 필요가 없어졌다.
  filters: { owner: 'ALL', category: 'ALL', account: 'ALL' },
  sort: { key: null, dir: 1 },
  // 시세 자동조회로 얻은 종목별 당일 등락률(%). 새로고침마다 초기화되는 휘발성 데이터라
  // localStorage에는 저장하지 않고 자산 id -> 등락률(%) 맵으로만 메모리에 보관한다.
  dayChangeMap: {},
  // 시세 자동조회로 얻은 종목별 전일종가(자산 통화 기준, 예: USD/KRW 원본 그대로). 일간 손익을
  // "오늘 평가액 - 어제 종가 기준 평가액"으로 정확히 계산하기 위해 쓰이며, dayChangeMap과 마찬가지로
  // 휘발성 데이터라 localStorage에는 저장하지 않는다.
  prevCloseMap: {},
  // 직전 시세 조회에서 정규장 종가 대신 시간외(Pre/Post Market) 시세를 현재가로 채택한 자산 id -> 'post'|'pre'.
  // 테이블에 "시간외" 배지를 표시하는 용도로만 쓰이며, 휘발성 데이터라 localStorage에는 저장하지 않는다.
  sessionMap: {},
  // [휴장일 이중 반영 방지] 이번 시세 조회에서 받아온 마지막 체결 식별값(lastTradeKey=regularMarketTime)이
  // 그 시장 기준 "오늘" 날짜에 속하는지를 API의 절대 시각만으로 매번 새로 판정한다(getMarketDateKeyForEpoch
  // 참고, 기기별 저장 없음) - false면 새 정규장 체결이 전혀 없었다는 뜻(평일 공휴일 등)이라 calcDailyPnL이
  // 주가 변동분을 0으로 고정한다. 소스가 체결 식별값을 안 주면(Stooq 등) 키 자체가 없어 undefined로 남고,
  // 그 경우 calcDailyPnL이 기존의 주말/세션시각 근사 로직(isMarketInDailyResetWindow)으로 폴백한다. 매
  // 조회마다 새로 판정되는 휘발성 데이터라 localStorage에는 저장하지 않는다.
  noNewSessionMap: {},
  // 직전 [시세 & 환율 갱신]에서 시세 조회에 실패한 자산 id 집합. 테이블에 경고 표시용으로만 쓰이며
  // 휘발성 데이터이므로 localStorage에는 저장하지 않는다. 수동으로 현재가를 고치면 즉시 제거된다.
  priceFetchFailedIds: new Set(),
  // [초보자용 리스크 진단] 종목/지수별 최근 1년 일별 종가+거래량 캐시 - { yahooTicker: { date,
  // data: { closes[], volumes[] } } }. 하루 한 번만 갱신하면 충분해 날짜가 오늘과 다를 때만 다시
  // 조회한다. 휘발성 데이터라 localStorage에는 저장하지 않는다. [구 지수대비 과락/20일선 이탈 감지용
  // indexChangeMap/ma20Map은 이 캐시 하나로 완전히 대체되어 제거됨 - computeAdvancedRiskMetrics()의
  // holdings[].closes/volumes에서 RSI14/이동평균/52주 고점/거래량 급증까지 전부 계산한다.]
  riskHistoryCache: {},
  // [초보자용 리스크 진단] computeAdvancedRiskMetrics()가 계산한 포트폴리오 단위 결과(베타/VaR/CVaR/
  // Sortino/집중도/상관관계/위기 시뮬레이션 손실액 등) - refreshPricesAndRates() 안에서 시세 갱신과
  // 함께 새로 계산되고, renderRiskSection()/리스크 알림 팝업이 이 값을 그대로 읽어 렌더링한다.
  // 계산 실패(데이터 없음 등)면 null - 휘발성 데이터라 localStorage에는 저장하지 않는다.
  advancedRiskMetrics: null,
  // [핵심종목 실시간 팝업] 주요 지수(코스피/코스닥/S&P500/나스닥/다우존스) 시세 캐시 - { yahooTicker:
  // {price, changePercent, previousClose, currency} }. 보유 종목 시세와 마찬가지로
  // refreshPricesAndRates() 한 번의 갱신 주기 안에서 함께 조회되어 채워진다 - 핵심종목 팝업을 열 때마다
  // 따로 또 조회하지 않고 이 캐시를 그대로 읽는다(getMarketIndexInfoFromState 참고). 휘발성 데이터라
  // localStorage에는 저장하지 않는다.
  marketIndexCache: {},
  // [시장 현황 & 매크로 브리핑] VIX(공포지수)/미국 10년물 국채금리 시세 캐시 - marketIndexCache와
  // 완전히 동일한 구조·갱신 주기(refreshPricesAndRates 한 번에 함께 조회)를 쓴다. 휘발성 데이터라
  // localStorage에는 저장하지 않는다.
  macroIndicatorCache: {},
  // [한국투자증권(KIS) 재무/수급 데이터] 국내주식 전용 - { yahooTicker: { date, price, fundamentals,
  // investorFlow } }. riskHistoryCache/macroIndicatorCache와 완전히 같은 방식(하루 한 번만 갱신,
  // localStorage에는 저장하지 않는 휘발성 캐시)이다 - 이 데이터는 사용자가 입력한 값이 아니라 외부
  // API에서 언제든 다시 받아올 수 있는 값이라, 새 localStorage 키를 늘려 JSON 백업/가족 동기화 로직
  // (buildSyncBlob 등)의 손이 닿는 범위를 넓히지 않는다.
  fundamentalCache: {},
  // 현재 활성화된 최상위 탭 ('dashboard' | 'investmentDetail' | 'transactions' | 'rebalance') - 휘발성,
  // 새로고침 시 대시보드로 복귀. '리밸런싱/자산예측' 통합 탭 내부의 2단계 서브탭은 별도의 모듈 변수
  // rebalanceSubTab('target'|'projection')으로 관리한다(switchRebalanceSubTab 참고).
  activeTab: 'dashboard',
  // 리밸런싱 목표 비중.
  //   domestic: 리밸런싱 대상 자산 대비 국내/해외(미국) 배분 목표 { 국내, 해외 }
  //   targets: 각 지역 배분 "내에서"의 티커/자산군 혼합 세부 목표(지역별 합계 100%) - DEFAULT_REBALANCE_TARGETS 참고
  //   최종 목표금액 = 리밸런싱 대상 총액 × (domestic[지역]/100) × (targets[지역][i].pct/100)
  // - localStorage/JSON 백업에 저장됨.
  rebalance: { domestic: { '국내': 40, '해외': 60 }, targets: cloneDefaultRebalanceTargets() },
  // 미래 자산예측 설정. monthlyContribution(월 적립금, 기본값 300만원 - 사용자가 자유롭게 수정 가능)
  // + categoryReturns(카테고리별 수동 지정 예상 연수익률, 비어있으면 그룹별 기본값을 사용 - 주식형자산
  // 기본 8%/PROJECTION_GROUP_DEFAULT_RATES 참고)
  // + inflationRate(실질 구매력 가치 환산에 쓰는 평균 물가상승률, %) - localStorage/JSON 백업에 저장됨.
  // customScenarioRates: [수익률 관리] 모달에서 사용자가 등록/수정한 종목별 보수/일반/긍정 수익률
  // 오버라이드 - { [key]: { label, conservative, normal, optimistic } }, key는 sanitizeTicker().yahooTicker
  // 또는 'NAME:정규화이름'(findCustomRateKeyForAsset 참고). 비어있으면 SCENARIO_RATE_PRESETS 기본값을 쓴다.
  // taxAdvantagedPlan: [절세계좌 현황] 카드의 [적립 예상] 팝업 입력값 - yearsByOwner(소유자명 → 적립
  // 기간, 년)와 monthlyByOwner(소유자명 → 월 적립 예상액)를 각각 저장한다. owner 키는 자산의 a.owner
  // 필드와 동일한 문자열('신랑'/'와이프')을 그대로 쓴다. [개별 적립 기간 지원 - 요청 반영] 예전엔 두
  // 사람이 적립 기간(years, 단일 값)을 공유했으나, 각자 다른 시점을 목표로 할 수 있어 소유자별로
  // 분리했다(normalizeTaxAdvantagedPlan 참고 - 옛 단일 years 데이터의 하위호환 마이그레이션도 거기서 처리).
  // monthlyContributionAllocation: [월적립금 설정] 팝업에서 사용자가 직접 지정한 종목별 배분 -
  // [{ ticker, label, pct }, ...]. "포트폴리오 구성" 탭의 목표 비중(리밸런싱용)과는 완전히 별개다.
  // 빈 배열이면(기본값) 예전처럼 국내/해외 목표 비중 비례로만 계산된다(simulateMonthlyContributionGrowth,
  // js/05 참고).
  projection: { monthlyContribution: 3000000, categoryReturns: {}, inflationRate: 2.5, customScenarioRates: {}, taxAdvantagedPlan: { yearsByOwner: { '신랑': 15, '와이프': 15 }, monthlyByOwner: { '신랑': 0, '와이프': 0 } }, monthlyContributionAllocation: [] },
  // [종목 분석 모달 - 학습된 종목명 캐시] { yahooTicker: 한글/영문 종목명 } - 사용자가 티커/코드로
  // 검색해서 실제 종목명(API 응답 또는 종목 마스터)이 확인될 때마다 rememberTickerName()이 여기 채워
  // 넣는다. 매달 갱신되는 종목 마스터 데이터(js/09 tickerMasterRecords, data/ticker-master.json)와
  // 달리 이건 "한 번이라도 조회에 성공한 종목"을 기기가 스스로 계속 넓혀가는 캐시라서, 마스터에도 없는
  // 종목(신규상장 등 아직 마스터가 안 받아온 종목)도 두 번째 검색부터는 이름으로 찾고 드롭다운에도
  // 나온다. localStorage/JSON 백업/클라우드 동기화에 모두 저장됨(buildSyncBlob 참고).
  learnedTickerNames: {},
  // 매매 거래 내역 - localStorage/JSON 백업에 저장됨. 각 항목: {id, date, owner, accountType, ticker,
  // name, type('buy'|'sell'), quantity, price, currency, fee, realizedPnL(매도 건만, 이동평균법 계산값)}.
  transactions: [],
  // 거래내역 탭의 현재 조회 필터(세션 휘발성 - 새로고침 시 초기화).
  txFilters: { from: '', to: '', account: 'ALL', type: 'ALL', search: '' },
  // 기간별 실현손익 섹션의 현재 보기 단위/기준일(세션 휘발성) - 기본값 '일별'.
  pnlPeriod: { granularity: 'daily', refDate: todayDateStr() },
  // [일별 손익 추이 팝업] 일자별 자동 스냅샷 - { 'YYYY-MM-DD': { total:{cur,dailyPnL}, byOwner:{owner:{cur,dailyPnL}} } }.
  // 사용자 입력 없이 renderKPIs()가 매 렌더링마다 "오늘" 키를 최신값으로 덮어써 기록한다(하루 중 여러 번
  // 갱신해도 그날의 가장 최근 값만 남는다 - 앱을 열지 않은 날은 자연히 기록이 비어 있다).
  // localStorage/JSON 백업에 저장됨.
  dailySnapshots: {}
};

let charts = { category: null, owner: null, domestic: null, scenarioCompare: null, totalAssetCompare: null, pnl: null, chartZoom: null, assetDetail: null, stockAnalysis: null, dailyPnl: null, totalValue: null, totalProfit: null, exchangeRate: null };

/* -------------------------------------------------------------------------
 * 3. 숫자/통화 안전 포맷 유틸
 * ---------------------------------------------------------------------- */
function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
const krwFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const numFmt2 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

function fmtKRW(v) { return krwFmt.format(Math.round(num(v))) + '원'; }
function fmtNum(v, digits = 2) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(num(v)); }
function fmtPct(v) { const n = num(v); return (n >= 0 ? '+' : '') + numFmt2.format(n) + '%'; }
function fmtSigned(v) { const n = Math.round(num(v)); return (n >= 0 ? '+' : '') + krwFmt.format(n) + '원'; }
// [야간 모드 시인성 개선] 500 굵기 색상은 채도가 높아 거의 검정에 가까운 배경(dark:bg-slate-950)
// 위에서 대비가 지나치게 강해 눈부심처럼 느껴진다 - Tailwind 다크모드 관례대로 한 단계 연한 400
// 굵기를 다크모드 전용으로 함께 써서, 밝은 화면에서의 색감은 그대로 유지하면서 어두운 화면에서만
// 더 부드럽게 보이게 한다.
function profitColor(v) { const n = num(v); return n > 0 ? 'text-red-500 dark:text-red-400' : (n < 0 ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400'); }
// 국내 주식시장 관례상 상승=빨강, 하락=파랑 컬러 사용

// KPI 카드 하단의 자산군별 세부 집계 태그처럼 좁은 공간에 큰 금액을 표기할 때 쓰는 축약 표기
// (예: 1,250,000,000 -> "12억5,000만원", 500,000,000 -> "5억원"). 1만원 미만은 그냥 원 단위로 표기.
// [전체 통일] "억"과 "만원" 사이는 띄어쓰기 없이 붙여 쓴다(예: 4억1,488만원) - 이 앱의 모든 원단위
// 축약 표기(Top5 리스트 포함)가 이 함수/포맷을 공유한다.
function fmtKRWShort(v) {
  const n = Math.round(num(v));
  const abs = Math.abs(n);
  const eok = Math.floor(abs / 1e8);
  const man = Math.round((abs % 1e8) / 1e4);
  let body;
  if (eok === 0 && man === 0) body = krwFmt.format(abs) + '원';
  else if (eok > 0 && man > 0) body = `${krwFmt.format(eok)}억${krwFmt.format(man)}만원`;
  else if (eok > 0) body = `${krwFmt.format(eok)}억원`;
  else body = `${krwFmt.format(man)}만원`;
  return (n < 0 ? '-' : '') + body;
}
function fmtSignedShort(v) { const n = Math.round(num(v)); return (n >= 0 ? '+' : '') + fmtKRWShort(v); }

/* -------------------------------------------------------------------------
 * 4. 자산 객체 생성 헬퍼
 *    - 필수 입력값(raw)을 받아 파생 필드(category/현재가)를 자동 채우고,
 *      isDomestic/currency는 명시값이 있으면 그대로, 없으면 ticker 기준 자동판별로 채운다.
 *    - 샘플 데이터, 엑셀 업로드, (신규 추가 시) 모달 저장 로직이 공통으로 재사용한다.
 * ---------------------------------------------------------------------- */
function genId() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function makeAsset(raw) {
  // 엑셀 셀은 숫자만 있으면 문자열이 아닌 number 타입으로 읽히고 앞자리 0도 사라진다(예: '005930' -> 5930).
  // 원본이 number 타입이었던 경우에만 6자리로 0-패딩해 한국 종목코드 판별 규칙이 깨지지 않도록 복원한다.
  // (사용자가 문자열로 '5930'처럼 직접 입력한 경우까지 임의로 패딩하면 원본을 왜곡하므로 대상에서 제외한다.)
  let tickerStr = String(raw.ticker ?? '').trim();
  if (typeof raw.ticker === 'number' && /^\d+$/.test(tickerStr) && tickerStr.length < 6) {
    tickerStr = tickerStr.padStart(6, '0');
  }
  const ticker = tickerStr;
  const name = String(raw.name ?? '').trim() || '이름없음';
  const { category, isDomestic: autoIsDomestic } = deriveDefaults(ticker, name);
  const isDomestic = normalizeIsDomestic(raw.isDomestic, autoIsDomestic);
  // 통화 기본값은 국내/해외 판별 결과를 따르되(국내→KRW, 해외→USD), '통화' 컬럼이 명시되어 있으면 그 값이 최종 우선한다.
  const defaultCurrency = isDomestic === '해외' ? 'USD' : 'KRW';
  const currency = normalizeCurrency(raw.currency, defaultCurrency);
  const buyPrice = num(raw.buyPrice);
  return {
    id: genId(),
    ticker,
    owner: String(raw.owner ?? '').trim() || '공동',
    accountType: String(raw.accountType ?? '').trim() || '일반계좌',
    category: raw.category || category,
    name,
    isDomestic,
    currency,
    quantity: num(raw.quantity),
    buyPrice,
    // 매입금액은 더 이상 별도 입력을 받지 않고 항상 수량×매수단가로 자동 산출한다(calcRow에서 계산, 통화 기준).
    // 현재가는 업로드/생성 직후 기본적으로 매수단가로 초기화되며, [시세 갱신] 버튼으로 최신화된다.
    currentPrice: (raw.currentPrice !== undefined && raw.currentPrice !== '' && raw.currentPrice !== null) ? num(raw.currentPrice) : buyPrice,
    // [가족 동기화 - 스마트 머지] 이 자산 레코드가 마지막으로 실제 변경된 시각 - mergeCollectionById()가
    // 같은 id가 로컬/원격 양쪽에 있을 때 어느 쪽을 채택할지 이 값으로 판단한다(js/12 참고). 시세 자동
    // 갱신(fetchPricesForTargets)처럼 "진짜 편집"이 아닌 배경 갱신은 절대 이 값을 건드리지 않는다.
    updatedAt: Date.now()
  };
}

/* -------------------------------------------------------------------------
 * 5. 초기 샘플 데이터
 *    - 자산군/국내해외는 실제 자동판별 함수를 그대로 통과시켜 생성한다.
 * ---------------------------------------------------------------------- */
function sampleAssets() {
  const rows = [
    { ticker: 'GOOGL', owner: '신랑', accountType: '일반계좌', name: '알파벳A', quantity: 21, buyPrice: 323.4, currentPrice: 342 },
    { ticker: 'MSFT', owner: '신랑', accountType: '일반계좌', name: '마이크로소프트', quantity: 8, buyPrice: 418.34, currentPrice: 390 },
    { ticker: 'QQQM', owner: '신랑', accountType: '일반계좌', name: 'QQQM', quantity: 112, buyPrice: 265.19, currentPrice: 290.4 },
    { ticker: '000660.KS', owner: '신랑', accountType: '일반계좌', name: 'SK하이닉스', quantity: 38, buyPrice: 1279833, currentPrice: 1906000 },
    { ticker: '000660.KS', owner: '와이프', accountType: '일반계좌', name: 'SK하이닉스', quantity: 273, buyPrice: 228666, currentPrice: 1906000 },
    { ticker: '', owner: '신랑', accountType: '채권/현금', name: '국고채', quantity: 1, buyPrice: 100000000, currentPrice: 100758724 }
  ];
  return rows.map(makeAsset);
}

/* -------------------------------------------------------------------------
 * 6. localStorage 로드 / 저장
 * ---------------------------------------------------------------------- */
// 로컬 타임존 기준 'YYYY-MM-DD'. toISOString()은 UTC 기준이라 자정 근처에서 날짜가 하루 어긋날 수 있어
// getFullYear/getMonth/getDate로 직접 조합한다.
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 로컬 타임존 기준 "n일 전"의 'YYYY-MM-DD' (n=0이면 오늘). 일별 손익 추이 팝업의 기간 필터(7일/1개월/
// 3개월) 컷오프 계산과 아래 yesterdayDateStr가 공유해서 쓴다.
function daysAgoDateStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 기존 보유 자산을 거래내역 기초 데이터로 일괄 등록할 때 쓰는 날짜(어제) - seedTransactionsFromAssets 참고.
function yesterdayDateStr() { return daysAgoDateStr(1); }

// [버그 수정 - 기기 간 일간 손익 기준선 불일치] 예전엔 이 함수가 "달력 날짜가 바뀐 뒤 이 기기가 처음
// 실행된 순간의 환율"을 그날의 기준값으로 직접 스냅샷해 저장했다 - 그 결과 데스크탑/모바일처럼 서로
// 다른 시각에 앱을 켜는 기기마다 기준선이 달라져 "일간금융평가손익"이 크게 어긋났다(실사용자 리포트로
// 확인). 이제 기준선을 이 함수가 임의로 정하지 않는다 - 오늘 날짜로 이미 캐시된 값(직전 fetchExchangeRate
// 성공 시 applyOfficialFxReference가 Yahoo의 공식 전일 마감 환율로 저장해둔 것)이 있으면 그 값을 읽어
// 올 뿐이고, 실제 기준값 확정은 항상 applyOfficialFxReference(공식 데이터 기반)가 담당한다. 이 함수는
// fetchExchangeRate()가 비동기로 끝나기 전까지 화면에 보여줄 즉시 사용 가능한 임시값을 마련하는
// 역할만 한다(loadState()·[시세 & 환율 갱신] 양쪽에서 호출).
function ensureDailyReference() {
  const todayKey = todayDateStr();
  let refRaw = null;
  try { refRaw = JSON.parse(localStorage.getItem(LS_REF_RATE) || 'null'); } catch (e) { /* 손상된 값이면 무시 */ }
  state.refExchangeRate = (refRaw && refRaw.date === todayKey && Number.isFinite(refRaw.rate)) ? refRaw.rate : state.exchangeRate;
}

// [해외주식 환율 이력 보완 - 1회성 마이그레이션] 거래 등록 UI에 '적용 환율' 입력란이 생기기 전에
// 저장된 과거 USD 거래는 appliedRate가 비어 있다 - 이 값이 없으면 computePositionsAndRealizedPnL이
// 매도할 때마다 DEFAULT_LEGACY_FX_RATE로 임시 대체하기만 할 뿐 저장은 안 해서, 사용자가 [거래 수정]
// 화면에서 그 거래의 실제 적용 환율을 확인/조정할 수 없다. 부팅 시 한 번 훑어서 빈 값을 1,450원으로
// 실제로 채워 넣어 둔다(이후엔 정상적으로 각 거래를 열어 직접 고칠 수 있음). 되돌릴 필요가 없는
// 단순 채움이라 버전 플래그 없이 매번 훑어도 안전하다(이미 채워진 거래는 건드리지 않음).
function migrateLegacyForeignExchangeRates() {
  let changed = false;
  state.transactions.forEach((tx) => {
    if (tx.currency === 'USD' && !(num(tx.appliedRate) > 0)) {
      tx.appliedRate = DEFAULT_LEGACY_FX_RATE;
      tx.updatedAt = Date.now(); // 실제 값 교정이므로 스마트 머지 기준으로도 "진짜 수정"으로 취급
      changed = true;
    }
  });
  if (changed) persistTransactions();
}

// [달러 현금 - 거래내역 기반 전환 마이그레이션] 이 기능이 생기기 전부터 자산관리 탭에서 직접 관리해온
// 달러 현금 보유분은 거래내역이 하나도 없다 - computePositionsAndRealizedPnL/syncAssetsFromTransactions가
// 가중평균 매입환율(avgRate)을 계산하려면 최소 "최초" 매수 거래 1건이 있어야 하므로, 아직 매칭되는
// 거래가 없는 달러 현금 자산마다 그 시점 수량 그대로 '최초' 매수 거래를 하나 만들어 준다. 실제 매수
// 시점 환율을 알 수 없으므로 추정 기본값(DEFAULT_LEGACY_FX_RATE)을 적용한다 - 사용자가 [거래 수정]
// 화면에서 실제 환율을 알면 언제든 고칠 수 있다. 이미 매칭되는 거래가 있으면(재실행이든 이미
// 전환됐든) 건드리지 않아 자연히 멱등적이다.
// [버그 수정 - 예전 방식 데이터 오해석] "금액 기반 입력"(수량=달러 금액, 매수단가=1 고정) 규칙이
// 생기기 이전에는 일부 달러 현금이 주식과 같은 방식(수량=1 등 임의 단위, 매수단가=실제 달러 금액)으로
// 입력돼 있었다 - 이 함수가 무조건 a.quantity를 "달러 금액"으로 가정해 거래를 만들다 보니, 예전 방식
// 자산(예: 수량=1, 매수단가=32)을 만나면 실제로는 $32였던 보유분이 수량=1짜리 거래로 잘못 전환되고,
// 뒤이어 syncAssetsFromTransactions()가 asset.quantity/buyPrice를 그 거래 기준(1, 1)으로 덮어써
// 이 자산의 원래 매수단가(32)만 그대로 남긴 currentPrice(자산 자체는 여기서 안 건드리므로 그대로
// 32)와 뒤섞여 환차손익이 터무니없이 부풀려졌다(실측: +2,953%). "금액 기반 입력" 규칙상 매수단가는
// 항상 정확히 1로 고정되므로, 매수단가가 1이 아니면 예전 방식으로 판단해 실제 달러 금액을
// a.buyPrice에서 가져오고, 자산 자체도 새 규칙(수량=달러 금액/매수단가=1/현재가=1)으로 맞춰
// 정규화한다 - sync가 quantity/buyPrice는 거래 기준으로 다시 채워주지만 currentPrice는 건드리지
// 않으므로, 여기서 미리 1로 맞춰두지 않으면 위와 같은 이중 오염이 재발한다.
function migrateUsdCashAssetsToTransactions() {
  let changed = false;
  state.assets.forEach((a) => {
    if (a.ticker || a.category !== '현금' || a.currency !== 'USD') return;
    if (num(a.quantity) <= 0) return;
    const hasTx = state.transactions.some((t) => !t.ticker && t.owner === a.owner && t.accountType === a.accountType && t.name === a.name);
    if (hasTx) return;
    const isLegacyShape = num(a.buyPrice) !== 1; // 금액 기반 입력 규칙상 신규 방식은 매수단가가 항상 1
    const dollarAmount = isLegacyShape ? num(a.buyPrice) : num(a.quantity);
    if (isLegacyShape) {
      a.quantity = dollarAmount;
      a.buyPrice = 1;
      a.currentPrice = 1;
      a.updatedAt = Date.now(); // 실제 값 교정이므로 스마트 머지 기준으로도 "진짜 수정"으로 취급
    }
    state.transactions.push({
      id: genId(),
      date: yesterdayDateStr(),
      owner: a.owner, accountType: a.accountType, ticker: '', name: a.name,
      type: 'buy', quantity: dollarAmount, price: 1, currency: 'USD', fee: 0,
      appliedRate: DEFAULT_LEGACY_FX_RATE, origin: 'initial', createdAt: Date.now(), updatedAt: Date.now()
    });
    changed = true;
  });
  if (changed) { persistTransactions(); persistAssets(); }
}

// [절세계좌 적립 예상 - 값 정규화] localStorage 로드(loadState)/JSON 백업 복원/가족 동기화 pull
// (applyRemoteScalarFields, js/12) 세 곳에서 똑같은 하위호환 로직이 필요해 공용 함수로 뽑았다. 예전
// 버전엔 이 필드 자체가 없었거나(전부 기본값 15년/0원), 신랑/와이프가 적립 기간을 공유하는 구조(단일
// years 필드)였다 - 새 구조(yearsByOwner)로 옮기되, 옛 공유 years 값이 있으면 두 사람 모두의 초기값으로
// 그대로 이어받는다(둘 다 없으면 15년 기본값).
function normalizeTaxAdvantagedPlan(raw) {
  const legacyYears = (raw && Number.isFinite(num(raw.years)) && num(raw.years) > 0) ? num(raw.years) : 15;
  const yearsFor = (owner) => {
    const v = raw && raw.yearsByOwner && num(raw.yearsByOwner[owner]);
    return (Number.isFinite(v) && v > 0) ? v : legacyYears;
  };
  return {
    yearsByOwner: { '신랑': yearsFor('신랑'), '와이프': yearsFor('와이프') },
    monthlyByOwner: {
      '신랑': num(raw && raw.monthlyByOwner && raw.monthlyByOwner['신랑']),
      '와이프': num(raw && raw.monthlyByOwner && raw.monthlyByOwner['와이프'])
    }
  };
}

// [월적립금 설정 - 값 정규화] loadState/JSON 백업 복원/가족 동기화 pull 세 곳에서 재사용한다(위
// normalizeTaxAdvantagedPlan과 동일한 이유). 배열이 아니거나 항목에 ticker/pct가 없으면 안전하게
// 걸러낸다 - 손상된 값이 하나라도 있으면 시뮬레이션 계산(reduce 등)이 NaN으로 오염될 수 있어서다.
function normalizeMonthlyContributionAllocation(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === 'object' && it.ticker && Number.isFinite(num(it.pct)))
    .map((it) => ({ ticker: String(it.ticker), label: it.label ? String(it.label) : String(it.ticker), pct: num(it.pct) }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_ASSETS);
    state.assets = raw ? JSON.parse(raw) : null;
  } catch (e) { state.assets = null; }

  // [데이터 초기화 후 샘플 재시딩 방지] LS_HAS_LAUNCHED 상단 주석 참고 - 이 기기에서 앱을 이미 한 번이라도
  // 켜본 적이 있으면(플래그가 남아있으면), 자산이 0건이어도 사용자가 의도적으로 비운 상태로 보고 데모
  // 데이터를 채우지 않는다. 플래그가 아예 없는 "진짜 첫 실행"일 때만 샘플 데이터로 온보딩한다.
  const isFirstEverLaunch = localStorage.getItem(LS_HAS_LAUNCHED) !== '1';
  if (isFirstEverLaunch && (!state.assets || !Array.isArray(state.assets) || state.assets.length === 0)) {
    state.assets = sampleAssets();
    persistAssets();
  }
  if (!Array.isArray(state.assets)) state.assets = [];
  // [가족 동기화 - 스마트 머지 마이그레이션] 이 필드가 생기기 전부터 있던 자산은 updatedAt이 없다 -
  // 최초 1회 "지금"으로 채워 넣는다(이후로는 실제 수정 시각이 정확히 기록됨). 되돌릴 필요 없는 단순
  // 채움이라 매번 훑어도 안전하다(이미 값이 있으면 건드리지 않음).
  state.assets.forEach((a) => { if (!a.updatedAt) a.updatedAt = Date.now(); });
  localStorage.setItem(LS_HAS_LAUNCHED, '1');

  state.exchangeRate = num(localStorage.getItem(LS_RATE)) || 1450;
  state.dailyChangeRate = num(localStorage.getItem(LS_DAILY_RATE)) || 0;
  ensureDailyReference();

  document.getElementById('exchangeRateInput').value = state.exchangeRate;
  document.getElementById('dailyChangeInput').value = state.dailyChangeRate;

  try {
    const rebalRaw = localStorage.getItem(LS_REBALANCE);
    if (rebalRaw) {
      const parsed = JSON.parse(rebalRaw);
      // 이전 버전(자산군 자동분류 기반 categoryByRegion)이 저장되어 있으면 새 구조(티커+자산군 혼합
      // 목표)로 마이그레이션하지 않고 깨끗한 기본값으로 초기화한다 - 기존에도 써온 정책과 동일하다.
      if (parsed && typeof parsed === 'object' && parsed.targets && typeof parsed.targets === 'object') {
        const defaults = cloneDefaultRebalanceTargets();
        state.rebalance = {
          domestic: parsed.domestic || state.rebalance.domestic,
          targets: {
            '국내': ensureSelectedStocksField(stripCustomRebalanceTargets(Array.isArray(parsed.targets['국내']) ? parsed.targets['국내'] : defaults['국내'])),
            '해외': ensureSelectedStocksField(stripCustomRebalanceTargets(ensureForeignCategoryCatchalls(Array.isArray(parsed.targets['해외']) ? parsed.targets['해외'] : defaults['해외'])))
          }
        };
      }
    }
  } catch (e) { /* 손상된 값이면 기본값 유지 */ }

  try {
    const projRaw = localStorage.getItem(LS_PROJECTION);
    if (projRaw) {
      const parsed = JSON.parse(projRaw);
      if (parsed && typeof parsed === 'object') state.projection = {
        monthlyContribution: num(parsed.monthlyContribution),
        categoryReturns: parsed.categoryReturns || {},
        inflationRate: (parsed.inflationRate !== undefined && parsed.inflationRate !== null && parsed.inflationRate !== '') ? num(parsed.inflationRate) : 2.5,
        // [하위호환 마이그레이션] 예전 scenario2TickerRates(QQQM/SPYM/SCHD 3종목 한정 수동 오버라이드)에
        // 값이 남아있는 기기라면, 새 customScenarioRates 체계로 1회 자동 이전한다(이미 새 키가 있으면
        // 덮어쓰지 않음 - 사용자가 새 모달에서 이미 수정했을 수 있으므로).
        customScenarioRates: (() => {
          const migrated = { ...(parsed.customScenarioRates || {}) };
          const legacy = parsed.scenario2TickerRates || {};
          Object.keys(legacy).forEach((yahooTicker) => {
            const v = legacy[yahooTicker];
            if (migrated[yahooTicker] || v === undefined || v === '' || !Number.isFinite(num(v))) return;
            migrated[yahooTicker] = { label: yahooTicker, normal: num(v) };
          });
          return migrated;
        })(),
        // [절세계좌 적립 예상 - 하위호환] normalizeTaxAdvantagedPlan이 필드 부재/구버전 단일 years 구조를
        // 모두 안전하게 새 yearsByOwner 구조로 채워준다.
        taxAdvantagedPlan: normalizeTaxAdvantagedPlan(parsed.taxAdvantagedPlan),
        monthlyContributionAllocation: normalizeMonthlyContributionAllocation(parsed.monthlyContributionAllocation)
      };
    }
  } catch (e) { /* 손상된 값이면 기본값 유지 */ }

  try {
    const txRaw = localStorage.getItem(LS_TRANSACTIONS);
    state.transactions = txRaw ? JSON.parse(txRaw) : [];
    if (!Array.isArray(state.transactions)) state.transactions = [];
  } catch (e) { state.transactions = []; }
  // [가족 동기화 - 스마트 머지 마이그레이션] 자산과 동일한 이유 - updatedAt이 없는 기존 거래는
  // createdAt(그마저 없으면 지금)으로 채운다.
  state.transactions.forEach((t) => { if (!t.updatedAt) t.updatedAt = t.createdAt || Date.now(); });
  migrateLegacyForeignExchangeRates();
  migrateUsdCashAssetsToTransactions();

  try {
    const snapRaw = localStorage.getItem(LS_DAILY_SNAPSHOTS);
    const parsedSnap = snapRaw ? JSON.parse(snapRaw) : null;
    state.dailySnapshots = (parsedSnap && typeof parsedSnap === 'object' && !Array.isArray(parsedSnap)) ? parsedSnap : {};
  } catch (e) { state.dailySnapshots = {}; }

  try {
    const learnedRaw = localStorage.getItem(LS_LEARNED_TICKER_NAMES);
    const parsedLearned = learnedRaw ? JSON.parse(learnedRaw) : null;
    state.learnedTickerNames = (parsedLearned && typeof parsedLearned === 'object' && !Array.isArray(parsedLearned)) ? parsedLearned : {};
  } catch (e) { state.learnedTickerNames = {}; }

  if (localStorage.getItem(LS_DARKMODE) === '1') {
    document.documentElement.classList.add('dark');
  }
}

// 자산 스키마에 정의된 필드만 저장 (dayChangeMap 등 휘발성 데이터는 제외)
function persistAssets(skipPush) {
  const clean = state.assets.map(a => ({
    id: a.id, ticker: String(a.ticker ?? '').trim(), owner: a.owner, accountType: a.accountType,
    category: a.category, name: a.name, isDomestic: a.isDomestic, currency: a.currency,
    quantity: a.quantity, buyPrice: a.buyPrice, currentPrice: a.currentPrice,
    // [버그 수정 - 기기 간 판정 불일치 제거] lastTradeKey/dailyRefTradeKey/dailyRefTradeKeyDate를 기기별
    // localStorage에 스냅샷해 비교하던 방식은 완전히 없앴다 - 이제 "오늘 새 정규장 체결이 있었는지"는
    // API가 준 절대 시각(regularMarketTime)만으로 매번 새로 판정하므로 저장할 필요 자체가 없어졌다
    // (getMarketDateKeyForEpoch/fetchPricesForTargets 참고). regularMarketPrice는 시간외 틱을 배제한
    // 정규장 기준가로, calcDailyPnL이 일간손익 계산 시 a.currentPrice 대신 우선 사용하므로 계속 저장한다.
    regularMarketPrice: a.regularMarketPrice,
    // [미니 당일 봉차트] 당일 시가/고가/저가 - miniCandleSvg가 현재가와 함께 캔들 하나로 그린다. 매
    // 조회마다 최신값으로 덮어쓰이므로(fetchPricesForTargets) 재부팅 직후 다음 조회 전까지의 표시용으로만
    // 영속 저장한다.
    todayOpen: a.todayOpen, todayHigh: a.todayHigh, todayLow: a.todayLow,
    // [미실현 평가손익 환차 반영] 거래내역에서 계산된 매수 시점 가중평균 환율 - calcRow()가 매입원가
    // 환산에 쓴다(syncAssetsFromTransactions 참고). 반드시 영속 저장해야 재부팅 후에도 유지된다.
    buyRate: a.buyRate,
    // [가족 동기화 - 스마트 머지] makeAsset() 주석 참고 - 저장 안 하면 새로고침할 때마다 사라져서
    // 병합 시 항상 "값 없음"으로 취급돼(0으로 폴백) 병합이 무의미해진다.
    updatedAt: a.updatedAt
  }));
  localStorage.setItem(LS_ASSETS, JSON.stringify(clean));
  if (!skipPush) schedulePush();
}
// [가족 동기화 - 자동 push 훅] 이 7개 persist*() 함수가 LS_ASSETS 등 각 localStorage 키를 쓰는 유일한
// 경로임을 확인했다 - 여기 한 줄씩만 추가하면 23곳+ 되는 모든 호출부를 일일이 건드리지 않고도 "로컬
// 데이터가 바뀔 때마다"를 빠짐없이 잡아낼 수 있다. schedulePush()는 동기화를 켜지 않은 사용자에게는
// 완전한 no-op이라 기존 동작에 영향이 없다(§22-2 참고).
// [가족 동기화 - 배경 시세갱신은 push를 건너뛴다] skipPush=true는 fetchExchangeRate()/refreshPricesAndRates()
// 등 "사용자 편집이 아니라 백그라운드에서 시세/환율만 갱신"하는 호출부 전용이다(§22-2 참고) - 두 기기가
// 동시에 켜져 있으면 이 배경 갱신이 서로의 진짜 편집(자산 추가 등)을 last-write-wins로 덮어써버리는
// 경쟁 상태가 생길 수 있어, 시세/환율 자체는 애초에 각 기기가 같은 공개 API에서 독립적으로 받아오므로
// 굳이 동기화할 필요가 없다는 점에 착안해 이 경로만 push 트리거에서 제외했다.
function persistRate(skipPush) { localStorage.setItem(LS_RATE, String(state.exchangeRate)); if (!skipPush) schedulePush(); }
function persistDaily() { localStorage.setItem(LS_DAILY_RATE, String(state.dailyChangeRate)); schedulePush(); }
function persistRebalance() { localStorage.setItem(LS_REBALANCE, JSON.stringify(state.rebalance)); schedulePush(); }
function persistProjection() { localStorage.setItem(LS_PROJECTION, JSON.stringify(state.projection)); schedulePush(); }
function persistTransactions() { localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(state.transactions)); schedulePush(); }
function persistDailySnapshots() { localStorage.setItem(LS_DAILY_SNAPSHOTS, JSON.stringify(state.dailySnapshots)); schedulePush(); }
function persistLearnedTickerNames() { localStorage.setItem(LS_LEARNED_TICKER_NAMES, JSON.stringify(state.learnedTickerNames)); schedulePush(); }
// [종목 분석 모달] 조회에 성공해 실제 종목명을 확인한 티커를 캐시에 기록한다 - trimmedRaw(사용자가
// 입력한 원문 그대로)와 다를 때만 저장한다(같으면 "이름을 못 찾아서 입력값을 그대로 돌려준 것"뿐이라
// 저장할 가치가 없다). 이미 같은 이름으로 저장돼 있으면 조용히 건너뛴다(불필요한 매 검색마다 push
// 유발 방지).
function rememberTickerName(yahooTicker, name) {
  if (!yahooTicker || !name) return;
  if (state.learnedTickerNames[yahooTicker] === name) return;
  state.learnedTickerNames[yahooTicker] = name;
  persistLearnedTickerNames();
}

/* -------------------------------------------------------------------------
 * 7. 파생 계산 (매입금액/평가금액/손익/수익률 - 전부 KRW 환산)
 *    - 매입금액은 더 이상 별도 저장하지 않고 항상 수량×매수단가로 자동 산출한다.
 *    - 원화 환산 여부는 '국내/해외'가 아니라 '통화'(currency) 필드를 기준으로 판단한다.
 *      (국내 계좌로 보유한 달러 예수금처럼 국내/해외 표시와 통화가 다를 수 있기 때문)
 *    - 통화가 USD인 자산은 자산통화(USD) 매입금액과 KRW 환산 매입금액을 함께 반환해 테이블에서 병기한다.
 * ---------------------------------------------------------------------- */
function calcRow(a) {
  const isForeign = a.currency === 'USD';
  const rate = isForeign ? state.exchangeRate : 1;
  // [미실현 평가손익 - 환차 반영] 매입원가는 오늘 환율이 아니라 매수 시점 가중평균 환율(a.buyRate,
  // syncAssetsFromTransactions가 거래내역에서 채워둠)로 환산한다 - 평가금액(curAmount)은 계속 오늘
  // 실시간 환율을 쓰므로, 갱신될 때마다 그 차이만큼이 자연스럽게 평가손익에 환차손익으로 반영된다.
  // buyRate가 아직 없으면(거래내역 없이 수동 등록된 자산 등) 예전처럼 오늘 환율로 폴백한다.
  const buyRate = isForeign ? (num(a.buyRate) || rate) : 1;
  const qty = num(a.quantity);
  const buyAmountOriginal = qty * num(a.buyPrice);       // 자산통화 기준 매입금액 (KRW 또는 USD)
  const buyAmountKRW = buyAmountOriginal * buyRate;       // 원화 환산 매입금액(매수 시점 환율 기준)
  const curAmount = qty * num(a.currentPrice) * rate;
  const profit = curAmount - buyAmountKRW;
  const rateOfReturn = buyAmountKRW !== 0 ? (profit / buyAmountKRW) * 100 : 0;
  return { isForeign, buyAmountOriginal, buyAmount: buyAmountKRW, curAmount, profit, rateOfReturn };
}

// [PART B - 상단 필터 독립화] 상단 FILTER BAR(전체 소유자/자산군/계좌)는 이제 상단 도넛 차트 3개
// (renderCharts/openChartZoomModal)에만 쓰인다 - 자산 관리 목록은 tableAssets()를 따로 써서 이 필터의
// 영향을 전혀 받지 않는다.
function filteredAssets() {
  return state.assets.filter(a => {
    // 전량 매도(수량 0 이하)된 포지션은 레코드는 남겨두되(syncAssetsFromTransactions 정책) 목록에는
    // 더 이상 노출하지 않는다 - 사용자가 명시적으로 요청한 화면 표시 규칙.
    if (num(a.quantity) <= 0) return false;
    if (state.filters.owner !== 'ALL' && a.owner !== state.filters.owner) return false;
    if (state.filters.category !== 'ALL' && a.category !== state.filters.category) return false;
    if (state.filters.account !== 'ALL' && a.accountType !== state.filters.account) return false;
    return true;
  });
}

// [PART B - 자산 관리 목록 전용] 상단 필터/검색어와 완전히 무관하게 항상 보유 중인(수량>0) 자산 전체를
// 반환한다 - 목록 화면은 이제 검색 팝업(runAssetSearch)을 통해서만 부분집합을 별도로 보여줄 뿐, 화면에
// 상시 노출되는 목록 자체는 필터링되지 않는다.
function tableAssets() {
  return state.assets.filter(a => num(a.quantity) > 0);
}

// 검색어(종목명/티커/계좌구분/소유자)에 매칭되는 보유 자산을 찾는다 - 자산 관리 목록의 검색창(Enter
// 또는 [검색] 버튼)과 검색 결과 팝업 내부 재검색이 공유한다. 상단 필터/목록 필터와 무관한 별도 경로.
function searchAssetsByQuery(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  return state.assets.filter(a => {
    if (num(a.quantity) <= 0) return false;
    const hay = [a.name, a.ticker, a.accountType, a.owner].map(v => String(v ?? '').toLowerCase()).join(' ');
    return hay.includes(q);
  });
}

