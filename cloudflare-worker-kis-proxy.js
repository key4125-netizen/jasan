// ============================================================================
// Smart Asset Manager - 한국투자증권(KIS) 시세/재무 데이터 전용 Cloudflare Worker (참고용 소스)
// ============================================================================
// 이 파일은 앱(index.html)이 직접 로드하지 않는다. Cloudflare 대시보드에 수동으로
// 배포해야 하는 참고 소스일 뿐이다 - 기존 시세/환율 프록시 Worker(asset-manager-proxy)나
// 가족 동기화 Worker(steep-haze-01f0, cloudflare-worker-sync.js)와는 완전히 분리된 별도
// Worker다(보안 격리 - 이 Worker가 뚫려도 다른 두 Worker의 데이터/기능에는 영향이 없다).
//
// [읽기 전용 원칙 - 반드시 지킬 것] 이 Worker는 국내주식 · 국내채권 시세/기준정보 "조회" 라우트만
// 코드로 존재한다. KIS API가 제공하는 주문(매수/매도)/계좌잔고/입출금 같은 라우트는 이 사용자의 API 키
// 권한이 실전투자용이라 하더라도 이 Worker 코드에는 아예 만들지 않는다 - "권한이 있어도 코드가
// 없으면 실행될 수 없다"가 이 프로젝트의 보안 원칙이다.
//
// [Bond Stage 2 · 체크리스트 §49 BOND-34 · 2026-09-21] 국내채권 라우트 2개를 추가했다.
//   /api/kis/bond-info  (발행 기준정보) · /api/kis/bond-price (시세)
// 주식 라우트와 두 가지가 다르다. 둘 다 의도한 것이고 이유가 있다.
//   (1) 조회키가 6자리 종목코드가 아니라 12자리 표준코드(ISIN)다. 그래서 입력 검증을 라우트별로
//       나눴다 - 주식 라우트는 예전 그대로 6자리만, 채권 라우트는 ISIN만 받는다. 어느 쪽도
//       느슨해지지 않는다(한쪽 형식을 다른 쪽에 허용하지 않는다).
//   (2) 주식 라우트는 필요한 필드만 화이트리스트로 추려 내려주는데, 채권 라우트는 KIS의 output을
//       그대로 내려준다. 이 프로젝트는 아직 **KIS 채권 응답의 실제 필드 이름을 확인한 적이 없다**
//       (2026-08 구현 70c49b3은 실제 호출 없이 추정으로 만들었다가 되돌려졌다). 추정한 이름으로
//       화이트리스트를 만들면 그 추정이 그대로 굳는다. 실제 응답을 보고 앱 쪽에서 매핑하고,
//       필드명이 틀려도 Worker를 다시 배포하지 않게 한다.
//       ※ 이 두 라우트가 다루는 것은 채권 시세 · 발행조건(공개 시장정보)뿐이다. 계좌 · 잔고 ·
//         주문 정보를 돌려주는 엔드포인트가 아니므로 output 통과가 계정 정보 노출로 이어지지 않는다.
//   rt_cd · msg_cd · msg1을 함께 내려준다 - KIS는 없는 종목도 HTTP 200으로 답하고 rt_cd로만
//   실패를 알리기 때문에, 이 값이 없으면 앱이 "조회 실패"와 "빈 응답"을 구분할 수 없다.
//
// [배포 절차]
// 1. Cloudflare 대시보드 -> Workers & Pages -> Create -> "Create Worker"
// 2. 편집기에 이 파일 내용을 그대로 붙여넣고 Deploy
// 3. Settings -> Variables -> "KV Namespace Bindings"에서 새 KV 네임스페이스를 하나 만들고,
//    바인딩 이름을 반드시 KIS_KV로 지정(아래 코드가 이 이름을 그대로 참조한다) - KIS 접근토큰
//    캐싱과, 종목/라우트별 응답 캐싱(RESPONSE_CACHE_TTL_SECONDS 참고) 두 가지 용도로 쓰인다.
// 4. Settings -> Variables -> "Secrets"(암호화 변수)에 아래 3개를 등록한다(절대 코드에 직접 쓰지
//    않는다 - 이 파일에는 어떤 키/시크릿 값도 없다):
//      - KIS_APP_KEY      : 한국투자증권 개발자센터에서 발급받은 앱키
//      - KIS_APP_SECRET   : 위와 함께 발급받은 앱시크릿
//      - CLIENT_SHARED_SECRET : 이 앱만 아는 임의의 긴 무작위 문자열(직접 정해서 등록) - 프론트
//        엔드가 매 요청마다 X-App-Secret 헤더로 이 값을 함께 보내야 응답을 받을 수 있다. CORS는
//        브라우저에서만 지켜지는 규칙이라 Worker 주소를 알아낸 제3자가 curl 등으로 직접 두드리는
//        것까지는 막지 못하는데, 이 공유 비밀키가 그 마지막 방어선 역할을 한다.
// 4-1. [B-1 · 2026-09-20] CLIENT_SHARED_SECRET을 등록하지 않으면 이 Worker는 모든 요청에 503을
//    돌려준다(fail-closed) - 예전에는 등록하지 않으면 인증 없이 열려 있었다.
// 4-2. (선택) Variables에 ALLOWED_ORIGINS를 등록하면 코드 수정 없이 허용 Origin 목록을 바꿀 수 있다
//    (쉼표로 구분). 등록하지 않으면 DEFAULT_ALLOWED_ORIGINS(운영 GitHub Pages · localhost:8644)를 쓴다.
// 5. 배포 후 발급되는 https://<임의이름>.<계정>.workers.dev 주소와, 4번에서 정한
//    CLIENT_SHARED_SECRET 값을 프론트엔드에 반영한다.
//    [D안 · 2026-09-26] 프론트엔드에서 이 값의 이름은 KIS_PROXY_ACCESS_TOKEN이다
//    (기존 명칭 KIS_CLIENT_SHARED_SECRET → 정책 재정의 후 개명. js/01 참고).
//    이름이 다른 이유는 역할이 다르기 때문이다 - 여기(Worker 환경변수)는 대조 기준이고,
//    프론트엔드가 들고 있는 것은 **원리상 공개값인 접근 토큰**이다(아래 79~80줄 참고).
//    Worker 쪽 변수명(CLIENT_SHARED_SECRET)과 헤더명(X-App-Secret)은 이미 등록 · 배포된
//    계약이라 바꾸지 않는다 - 바꾸면 재등록 전까지 fail-closed로 전면 503이 된다.
//    앱은 소스의 기본값을 쓰되, 토큰을 교체하면 설정으로 덮어쓸 수 있다
//    (globalThis.JASAN_RUNTIME_CONFIG.kisProxyAccessToken 또는
//     localStorage 'sam_kis_proxy_access_token_v1'). 예외 근거는 체크리스트 §62.
//
// [토큰 캐싱 이유] KIS 접근토큰(access_token)은 발급 API 자체에 호출 빈도 제한이 있고 유효기간이
// 길다(문서 기준 24시간) - 그래서 요청마다 새로 발급받지 않고 KV에 캐시해 두었다가 만료 10분 전까지는
// 재사용한다. 여러 사용자가 없는 가정용 개인 Worker라 토큰 하나를 그대로 재사용해도 충돌이 없다.

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const TOKEN_KV_KEY = 'kis_access_token';
// [응답 캐싱 TTL] 같은 종목을 짧은 시간 안에 여러 번 조회해도(같은 종목 상세를 다시 여는 등) KIS를
// 매번 다시 때리지 않고 KV에 저장된 값을 그대로 돌려준다 - 재무제표/수급 동향은 하루 중 자주 바뀌는
// 데이터가 아니라 20분 정도 지연되어 보여도 실사용에 문제가 없다.
const RESPONSE_CACHE_TTL_SECONDS = 20 * 60; // 20분
/* [Bond Stage 2 · 호출량] 채권 발행조건(만기 · 표면이율 · 이자지급주기)은 발행된 뒤 바뀌지 않는다 -
 * 20분마다 다시 받을 이유가 없어 훨씬 길게 잡는다. 새 캐싱 장치를 만들지 않고 아래 getCachedOrFetch를
 * 그대로 쓰되 TTL만 라우트별로 다르게 준다(§12 - 최소한의 호출 제어). 시세는 20분 그대로다. */
const BOND_INFO_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일

/* ============================================================================
 * [B-1 보안 보완 · 체크리스트 §47-8 · PM 승인 2026-09-20]
 *
 * 이 Worker에서 실제로 확인된 결함 세 가지를 고친다.
 *   (1) CORS가 Access-Control-Allow-Origin: * 로 전면 개방돼 있었다 → 허용 목록만 반사한다.
 *   (2) 공유 비밀키 검사가 "변수가 등록돼 있을 때만" 도는 형태라, 등록하지 않으면 검사 자체가
 *       건너뛰어졌다(fail-open) → 등록돼 있지 않으면 아예 서비스하지 않는다(fail-closed).
 *   (3) 요청 수 제한이 없었다 → KV 카운터로 분 · 일 상한을 둔다.
 * 그리고 상류(KIS) 오류 본문을 그대로 돌려주던 것을 상태 코드와 일반 메시지로 줄인다.
 *
 * [남는 제약을 분명히 해 둔다] 이 앱은 공개된 정적 페이지이므로 프론트엔드에 들어가는
 * X-App-Secret은 원리상 공개값이다. 즉 공유 비밀키만으로는 접근을 통제할 수 없다 -
 * 실질적인 방어선은 Origin 허용 목록 + 요청 수 제한이고, 공유 비밀키는 보조 수단이다.
 * ========================================================================= */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://key4125-netizen.github.io', // 운영(GitHub Pages)
  'http://localhost:8644',             // E2E(playwright.config.js baseURL)
  'http://127.0.0.1:8644',
  'http://localhost:8643'              // 로컬 개발 서버(.claude/launch.json 기본 포트) - 다른 두 Worker와 목록을 맞춘다
];
// 분 · 일 상한 - 개인 가정용 Worker라 정상 사용은 이 값에 한참 못 미친다(종목 상세 한 번에 3~4회).
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 300;

function allowedOrigins(env) {
  const raw = String((env && env.ALLOWED_ORIGINS) || '').trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

// 허용 목록에 있는 Origin만 그대로 반사한다. 목록 밖이면 CORS 헤더를 붙이지 않아 브라우저가 막는다.
function corsHeadersFor(request, env) {
  const origin = request.headers.get('Origin');
  const base = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
    'Access-Control-Max-Age': '86400',
    // 같은 URL이라도 Origin에 따라 응답 헤더가 달라진다는 사실을 캐시에 알린다.
    Vary: 'Origin'
  };
  if (origin && allowedOrigins(env).includes(origin)) base['Access-Control-Allow-Origin'] = origin;
  return base;
}

function jsonResponse(obj, status = 200, cors = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

/* [요청 수 제한] KV 카운터 두 개(분 · 일)를 쓴다. KV는 결과적 일관성이라 정확한 카운터는 아니지만,
 * 여기서 막으려는 것은 정밀한 과금 통제가 아니라 자동화된 남용이므로 이 정도로 충분하다.
 * KV가 실패하면 요청을 막지 않는다 - 가용성 우선이며, 이 경로는 비밀값을 다루지 않는다. */
/* [§50 · PD-12 · 감사 H-01] 읽기(판정)와 쓰기(기록)를 분리한다.
 *
 * 왜 나누는가: 예전에는 인증을 통과한 모든 GET이 라우팅 · 입력검증 · 캐시 확인보다 **먼저**
 * KV에 카운터 2건을 썼다. 그래서 캐시가 맞아떨어진 요청도, 형식이 틀려 400으로 거절될 요청도
 * 똑같이 put 2회를 소비했다. Cloudflare 무료 한도는 **계정 전체 하루 1,000 puts**이므로
 * 인증된 요청 약 500건이면 계정 전체(다른 Worker 포함)의 쓰기 한도가 소진된다 - 실제로 소진됐다.
 *
 * 무엇을 지키는가(제한을 약하게 만들지 않는다):
 *   · 인증은 여전히 맨 앞이다. 무인증 요청은 KV를 한 번도 건드리지 않는다(예전과 같다).
 *   · 분 30회 · 일 300회 **한도 값은 그대로다.**
 *   · 한도 판정은 모든 요청에서 한다(readRateLimit - 읽기 전용). 이미 한도를 넘었으면
 *     캐시 적중이라도 429다.
 *   · 카운터 **증가**는 상류(KIS)를 실제로 부르는 요청에서만 한다 - 보호하려는 대상이 상류 호출과
 *     상류 비용이기 때문이다. 캐시 적중은 상류를 부르지 않는다.
 * 결과: 캐시 적중 0 puts · 400/401 0 puts · 캐시 미스 3 puts(카운터 2 + 캐시 1).
 */
function rateLimitKeysFor(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = new Date();
  return {
    ip,
    minuteKey: 'rl:min:' + ip + ':' + now.toISOString().slice(0, 16),
    dayKey: 'rl:day:' + ip + ':' + now.toISOString().slice(0, 10)
  };
}
/** 한도 판정만 한다(KV 읽기 2회 · 쓰기 0회). KV 장애 시 막지 않는다(가용성 우선 - 기존 정책 유지). */
async function readRateLimit(env, request) {
  if (!env.KIS_KV) return { ok: true, skip: true };
  const keys = rateLimitKeysFor(request);
  try {
    const [m, d] = await Promise.all([env.KIS_KV.get(keys.minuteKey), env.KIS_KV.get(keys.dayKey)]);
    const mCount = Number(m || 0) + 1;
    const dCount = Number(d || 0) + 1;
    if (mCount > RATE_LIMIT_PER_MINUTE || dCount > RATE_LIMIT_PER_DAY) {
      return { ok: false, retryAfter: mCount > RATE_LIMIT_PER_MINUTE ? 60 : 3600 };
    }
    return { ok: true, keys, mCount, dCount };
  } catch (e) {
    return { ok: true, skip: true };
  }
}
/** 상류를 실제로 부를 때만 카운터를 올린다(KV 쓰기 2회). */
async function commitRateLimit(env, state) {
  if (!env.KIS_KV || !state || state.skip || !state.keys) return;
  try {
    await Promise.all([
      env.KIS_KV.put(state.keys.minuteKey, String(state.mCount), { expirationTtl: 120 }),
      env.KIS_KV.put(state.keys.dayKey, String(state.dCount), { expirationTtl: 86400 })
    ]);
  } catch (e) { /* KV 장애 시 기록만 건너뛴다 - 응답은 정상이다 */ }
}

// 6자리 숫자 국내 종목코드만 허용한다(예: '005930') - 이 Worker는 국내주식 전용이라 그 외 형식은 애초에
// KIS 쪽에서도 정상 조회가 안 되므로 여기서 미리 걸러 불필요한 상위 API 호출을 막는다.
function isValidDomesticCode(code) {
  return /^\d{6}$/.test(code);
}
/* [G-5 · 2026-09-20] KRX 영문 혼합 신규 코드(숫자4 + 영문1 + 숫자1, 예: 0052D0)는 앱에서는 정상
 * 식별되지만(js/01 KRX_SHORT_CODE_PATTERN · CL-03) 이 Worker는 받지 않는다. 그런데 응답이
 * 'bad_ticker'라서 화면에서는 "코드를 잘못 입력했다"로 읽힌다 - 실제로는 "이 코드 형식은 아직
 * 재무 조회를 지원하지 않는다"가 사실이다. 사실과 다른 안내를 하지 않도록 코드를 분리한다.
 * KIS API가 이 형식을 받는지는 확인되지 않았으므로 **허용 범위는 넓히지 않는다**(확인 전 개방 금지). */
function isKrxAlnumCode(code) {
  return /^\d{4}[A-Z]\d$/i.test(code);
}

/* [Bond Stage 2] 채권 표준코드(ISO 6166) - 국가코드 2자 + 영숫자 9자 + 검사숫자 1자 = 12자.
 * 앱의 isBondIsin(js/01)과 같은 판정이다. 두 곳이 어긋나면 앱에서는 보내고 Worker에서는 막는
 * 조합이 생기므로, 바꿀 때는 반드시 같이 바꾼다. */
function isValidBondIsin(code) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(code || '').toUpperCase());
}

// [토큰 발급/캐시] KV에 캐시된 토큰이 있고 만료 10분 이상 남았으면 그대로 재사용, 아니면 새로 발급받아
// KV에 저장한다. expires_in은 초 단위(문서 기준 보통 86400=24시간)로 내려온다.
// [콜드스타트 동시발급 경쟁 방지] KV에 캐시된 토큰이 아직 없는 상태(배포 직후 첫 호출, KV 항목 만료
// 직후 등)에서 여러 요청이 거의 동시에 들어오면(예: /api/kis/fundamentals 하나만으로도 재무비율/
// 손익계산서/대차대조표 3개를 동시 호출해 getAccessToken이 3번 겹쳐 불린다) 각자 KIS 토큰 발급
// API를 동시에 두드리게 되는데, KIS 쪽에 발급 빈도 제한이 있어 일부가 실패할 수 있다(실제로 배포
// 직후 재무비율 라우트에서 이 현상이 재현됨 - 첫 호출은 일부 필드가 비어서 왔고, 토큰이 캐시된 다음
// 호출부터는 정상). 같은 Worker 인스턴스 안에서는 진행 중인 발급 Promise 하나를 공유해 중복 발급
// 자체를 막는다(Cloudflare Workers는 요청 사이에도 같은 인스턴스가 자주 재사용되므로 완벽하진
// 않아도 실전에서 경쟁을 크게 줄여준다).
let tokenPromise = null;
async function getAccessToken(env) {
  const cached = await env.KIS_KV.get(TOKEN_KV_KEY, 'json');
  if (cached && typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now() + 10 * 60 * 1000) {
    return cached.token;
  }
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ grant_type: 'client_credentials', appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET })
      });
      if (!res.ok) throw new Error(`token_issue_failed_${res.status}`);
      const data = await res.json();
      if (!data.access_token) throw new Error('token_issue_no_access_token');

      const expiresAt = Date.now() + Number(data.expires_in || 86400) * 1000;
      await env.KIS_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: data.access_token, expiresAt }));
      return data.access_token;
    } finally {
      tokenPromise = null;
    }
  })();
  return tokenPromise;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// [공통 KIS 호출] tr_id/파라미터만 바꿔서 4개 라우트가 전부 이 함수를 공유한다. 헤더 구성
// (authorization/appkey/appsecret/tr_id/custtype)은 KIS Open API 전반에 걸쳐 공통으로 쓰이는
// 관례를 따른다 - 공식 GitHub 샘플 저장소(koreainvestment/open-trading-api)에서 엔드포인트
// 경로/tr_id/응답 필드명 자체는 1차 소스로 확인했지만, 이 헤더 구성 자체는 공통 헬퍼(kis_auth.py)
// 안에 있어 파일 하나로 직접 확인하지는 못했다.
//
// [KIS 동시 호출 제한 재시도] 실제 배포 후 테스트에서 확인된 사실: /fundamentals 내부 3건을 순차
// 호출로 바꿔도, price/fundamentals/investor-flow 세 라우트를 프론트엔드가 동시에 요청하면(종목
// 상세 모달을 열 때마다 이렇게 호출됨) 그중 일부가 500으로 실패하는 게 재현됐다 - KIS 쪽 동시 호출/
// 초당 요청 제한이 예상보다 엄격한 것으로 보인다(정확한 제한치는 문서로 확인되지 않음). 실패해도
// 잠깐 쉬었다가 다시 시도하면 대부분 성공하므로, 매 호출마다 최대 2번까지 짧은 지연 후 재시도한다.
async function callKis(env, path, trId, params) {
  const token = await getAccessToken(env);
  const url = new URL(KIS_BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const maxAttempts = 3;
  let lastStatus = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: env.KIS_APP_KEY,
        appsecret: env.KIS_APP_SECRET,
        tr_id: trId,
        custtype: 'P'
      }
    });
    if (res.ok) return res.json();
    lastStatus = res.status;
    if (attempt < maxAttempts) await sleep(300 * attempt); // 300ms, 600ms 순서로 점점 늘려가며 대기
  }
  throw new Error(`kis_call_failed_${lastStatus}`);
}

// [현재가 스냅샷] PER/PBR/EPS/BPS/시가총액은 이 API(현재가 시세) 하나에 다 들어있다(연/분기 재무제표
// API와 달리 output이 배열이 아니라 객체 하나). 필요한 필드만 화이트리스트로 추려 반환한다(원본
// 응답을 그대로 넘기지 않음 - 불필요한 필드 노출 최소화).
// [기준 시각 안내] KIS 응답 자체에 "이 시세가 정규장/시간외 중 언제 것인지"를 명확히 알려주는 필드가
// 확인되지 않아(1차 소스로 검증 못함), 장 상태를 추측해서 라벨을 붙이는 대신 이 값을 실제로 조회한
// 서버 시각(fetchedAt)을 그대로 내려준다 - 프론트엔드가 "OO:OO 기준" 배지로 보여주면 최소한 사용자가
// "이 숫자가 언제 것인지"는 오인하지 않는다(KV 캐시로 응답이 재사용돼도 이 값은 최초 조회 시각 그대로
// 유지되므로 정확하다).
async function handlePrice(env, code) {
  const data = await callKis(env, '/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', {
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code
  });
  const o = data.output || {};
  return {
    price: o.stck_prpr ?? null,
    changePct: o.prdy_ctrt ?? null,
    per: o.per ?? null,
    pbr: o.pbr ?? null,
    eps: o.eps ?? null,
    bps: o.bps ?? null,
    marketCapEok: o.hts_avls ?? null, // 억원 단위(KIS 관례)
    week52High: o.w52_hgpr ?? null,
    fetchedAt: Date.now()
  };
}

// [재무비율+손익계산서+대차대조표] 세 TR을 동시에 호출해 하나의 응답으로 합친다 - 프론트엔드가 매번
// 3번 왕복하지 않도록. output은 최근 여러 분기/연도가 배열로 내려오는 것으로 보이며(공식 샘플의
// chk_ 스크립트가 DataFrame으로 변환하는 방식 기준), 정렬 순서(최신이 0번인지)는 실제 응답으로
// 확인 전이라 [0]을 "가장 최근 기간"으로 가정한다 - 실제 배포 후 stac_yymm(결산년월) 값으로 검증
// 필요.
// [KIS 동시 호출 제한 대응] 처음엔 3개 TR을 Promise.all로 동시 호출했는데, 실제 배포 후 이 라우트
// 하나만으로도(내부에서 3건) 다른 라우트(price/investor-flow)와 겹쳐 총 5건이 거의 동시에 KIS에
// 들어가면 일부가 500으로 실패하는 것을 재현했다(토큰 발급 경쟁과는 별개 문제 - 토큰은 이미 캐시된
// 상태에서도 재현됨). 이 라우트 내부 3건만이라도 순차 호출로 바꿔 동시 호출 건수를 줄인다.
async function handleFundamentals(env, code, divCode) {
  const params = { fid_cond_mrkt_div_code: 'J', fid_input_iscd: code, FID_DIV_CLS_CODE: divCode };
  const ratio = await callKis(env, '/uapi/domestic-stock/v1/finance/financial-ratio', 'FHKST66430300', params);
  const income = await callKis(env, '/uapi/domestic-stock/v1/finance/income-statement', 'FHKST66430200', params);
  const balance = await callKis(env, '/uapi/domestic-stock/v1/finance/balance-sheet', 'FHKST66430100', params);
  const r0 = (Array.isArray(ratio.output) && ratio.output[0]) || {};
  const i0 = (Array.isArray(income.output) && income.output[0]) || {};
  const b0 = (Array.isArray(balance.output) && balance.output[0]) || {};

  return {
    period: r0.stac_yymm || i0.stac_yymm || b0.stac_yymm || null,
    roePct: r0.roe_val ?? null,
    eps: r0.eps ?? null,
    bps: r0.bps ?? null,
    revenueGrowthPct: r0.grs ?? null,
    operatingIncomeGrowthPct: r0.bsop_prfi_inrt ?? null,
    netIncomeGrowthPct: r0.ntin_inrt ?? null,
    debtRatioPct: r0.lblt_rate ?? null,
    revenue: i0.sale_account ?? null,
    operatingIncome: i0.bsop_prti ?? null,
    netIncome: i0.thtr_ntin ?? null,
    totalAssets: b0.total_aset ?? null,
    totalLiabilities: b0.total_lblt ?? null,
    totalEquity: b0.total_cptl ?? null,
    fetchedAt: Date.now()
  };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// [외국인/기관 수급 동향] 일자별 순매수 수량 배열을 받아 최근 5일/20일 누적치를 서버 쪽에서 미리
// 더해서 내려준다 - 프론트엔드는 "최근 5일간 외국인 +12,400주 순매수" 같은 사실만 표시하고 매수/매도
// 판단은 붙이지 않는다(이 프로젝트의 투자자문 배제 원칙). 응답 배열의 가장 최근 거래일이 맨 앞
// (index 0)이라고 가정한다 - 실제 배포 후 첫 응답의 stck_bsop_date 값으로 검증 필요.
async function handleInvestorFlow(env, code) {
  const data = await callKis(env, '/uapi/domestic-stock/v1/quotations/inquire-investor', 'FHKST01010900', {
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code
  });
  const rows = Array.isArray(data.output) ? data.output : [];
  const daily = rows.map((r) => ({
    date: r.stck_bsop_date ?? null,
    foreignNetQty: numOrNull(r.frgn_ntby_qty),
    institutionNetQty: numOrNull(r.orgn_ntby_qty),
    individualNetQty: numOrNull(r.prsn_ntby_qty)
  }));

  // [당일 미마감 데이터 제외] 실제 배포 후 장중에 호출해 확인한 사실 - 배열 맨 앞(가장 최근 날짜) 행이
  // 그날 거래가 아직 마감 집계되지 않은 상태면 외국인/기관/개인 순매수가 전부 0으로 온다. 이 상태로
  // "최근 5일 합계"를 구하면 완결된 4일치만 반영돼 실제보다 적게 보인다 - 맨 앞 행의 세 값이 전부
  // 0이면 미마감으로 보고 건너뛰고, 그 다음 행부터 완결된 거래일 기준으로 5일/20일을 합산한다.
  const isUnsettledToday = daily.length > 0 &&
    daily[0].foreignNetQty === 0 && daily[0].institutionNetQty === 0 && daily[0].individualNetQty === 0;
  const settledStart = isUnsettledToday ? 1 : 0;
  const sumOver = (n, key) => daily.slice(settledStart, settledStart + n).reduce((s, d) => s + (d[key] || 0), 0);

  return {
    daily: daily.slice(0, 20),
    foreignNet5d: sumOver(5, 'foreignNetQty'),
    foreignNet20d: sumOver(20, 'foreignNetQty'),
    institutionNet5d: sumOver(5, 'institutionNetQty'),
    institutionNet20d: sumOver(20, 'institutionNetQty'),
    fetchedAt: Date.now()
  };
}

/* [Bond Stage 2 · bond-info] 채권 발행 기준정보.
 * 경로 · tr_id · 파라미터는 KIS 공식 문서/샘플에서 확인된 값이다(PDNO=ISIN, PRDT_TYPE_CD=302=채권).
 * **응답 필드 이름은 이 프로젝트에서 아직 실제로 확인한 적이 없다** - 그래서 추려내지 않고 그대로
 * 내려준다. 앱이 실제 응답을 보고 매핑한다(머리말 (2) 참고). */
async function handleBondInfo(env, isin) {
  const data = await callKis(env, '/uapi/domestic-bond/v1/quotations/search-bond-info', 'CTPF1114R', {
    PDNO: isin,
    PRDT_TYPE_CD: '302'
  });
  return {
    rtCd: data.rt_cd ?? null,
    msgCd: data.msg_cd ?? null,
    msg1: data.msg1 ?? null,
    output: data.output ?? data.output1 ?? null,
    output2: data.output2 ?? null,
    fetchedAt: Date.now()
  };
}

/* [Bond Stage 2 · bond-price] 채권 시세. 시장구분코드는 'B'(채권)이고 ISIN을 FID_INPUT_ISCD에 넣는다.
 * **가격 단위는 앱에서 추측하지 않는다** - 실제 응답을 보고 확정한다(§7 - 임의 배수 보정 금지). */
async function handleBondPrice(env, isin) {
  const data = await callKis(env, '/uapi/domestic-bond/v1/quotations/inquire-price', 'FHKBJ773400C0', {
    FID_COND_MRKT_DIV_CODE: 'B',
    FID_INPUT_ISCD: isin
  });
  return {
    rtCd: data.rt_cd ?? null,
    msgCd: data.msg_cd ?? null,
    msg1: data.msg1 ?? null,
    output: data.output ?? data.output1 ?? null,
    output2: data.output2 ?? null,
    fetchedAt: Date.now()
  };
}

// [응답 KV 캐싱] 같은 종목/라우트를 짧은 시간 안에 다시 요청하면(같은 종목 상세를 재방문하는 등) KIS를
// 다시 호출하지 않고 KV에 저장된 값을 그대로 돌려준다. KV 조회/저장이 실패해도(일시적 KV 장애 등)
// 캐시는 어디까지나 최적화일 뿐이므로 무시하고 정상적으로 KIS를 호출해 응답한다 - 캐시 문제로 기능
// 자체가 죽으면 안 된다.
/* [§50 · PD-12] 캐시 조회와 저장을 나눈다 - 호출부가 "캐시 적중이면 카운터를 올리지 않는다"를
 * 판단할 수 있어야 하기 때문이다. 동작(TTL · 키 · 실패 시 무시)은 예전과 같다. */
async function cacheGet(env, cacheKey) {
  try { return (await env.KIS_KV.get(cacheKey, 'json')) || null; } catch (e) { return null; }
}
async function cachePut(env, cacheKey, value, ttlSeconds) {
  try {
    await env.KIS_KV.put(cacheKey, JSON.stringify(value), { expirationTtl: ttlSeconds || RESPONSE_CACHE_TTL_SECONDS });
  } catch (e) { /* KV 저장 실패해도 응답 자체는 정상 반환 */ }
}
async function getCachedOrFetch(env, cacheKey, fetchFn, ttlSeconds) {
  const cached = await cacheGet(env, cacheKey);
  if (cached) return cached;
  const fresh = await fetchFn();
  await cachePut(env, cacheKey, fresh, ttlSeconds);
  return fresh;
}

export default {
  async fetch(request, env) {
    const cors = corsHeadersFor(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, cors);
    }

    // [B-1 (2)] fail-closed. 공유 비밀키가 등록돼 있지 않으면 "검사를 건너뛴다"가 아니라
    // "서비스하지 않는다"로 동작한다 - 설정을 잊은 배포가 곧 무인증 공개 프록시가 되는 것을
    // 구조적으로 막는다.
    if (!env.CLIENT_SHARED_SECRET) {
      return jsonResponse({ error: 'not_configured' }, 503, cors);
    }
    if (request.headers.get('X-App-Secret') !== env.CLIENT_SHARED_SECRET) {
      return jsonResponse({ error: 'unauthorized' }, 401, cors);
    }

    const url = new URL(request.url);
    const code = (url.searchParams.get('ticker') || '').trim();
    /* [Bond Stage 2] 입력 검증을 라우트별로 나눈다. 예전에는 라우팅 전에 6자리 종목코드 검사를 한 번
     * 했기 때문에, 채권 라우트를 추가해도 ISIN이 그 검사에 먼저 걸려 400으로 막혔다(실측).
     * 나눈다고 느슨해지지 않는다 - 주식 라우트는 예전 그대로 6자리만 받고, 채권 라우트는 ISIN만 받는다. */
    const isBondRoute = url.pathname === '/api/kis/bond-info' || url.pathname === '/api/kis/bond-price';
    if (isBondRoute) {
      if (!isValidBondIsin(code)) return jsonResponse({ error: 'bad_isin' }, 400, cors);
    } else if (!isValidDomesticCode(code)) {
      // 형식이 "틀린" 것과 "아직 지원하지 않는" 것을 구분해서 알린다.
      return jsonResponse({ error: isKrxAlnumCode(code) ? 'ticker_format_unsupported' : 'bad_ticker' }, 400, cors);
    }

    /* [§50 · PD-12] 라우트 → 캐시키 → (캐시 적중이면 그대로 응답) → 한도 기록 → 상류.
     * 라우팅과 입력 검증이 끝난 뒤에야 KV를 만진다. 없는 경로(404)도 KV를 쓰지 않는다. */
    const isin = code.toUpperCase();
    const ROUTES = {
      '/api/kis/price': { key: `kis_cache:price:${code}`, run: () => handlePrice(env, code) },
      '/api/kis/fundamentals': null, // 아래에서 period 파라미터를 반영해 만든다
      '/api/kis/investor-flow': { key: `kis_cache:investor-flow:${code}`, run: () => handleInvestorFlow(env, code) },
      '/api/kis/bond-info': { key: `kis_cache:bond-info:${isin}`, run: () => handleBondInfo(env, isin), ttl: BOND_INFO_CACHE_TTL_SECONDS },
      '/api/kis/bond-price': { key: `kis_cache:bond-price:${isin}`, run: () => handleBondPrice(env, isin) }
    };
    let route = ROUTES[url.pathname];
    if (url.pathname === '/api/kis/fundamentals') {
      const divCode = url.searchParams.get('period') === 'quarter' ? '1' : '0';
      route = { key: `kis_cache:fundamentals:${code}:${divCode}`, run: () => handleFundamentals(env, code, divCode) };
    }
    if (!route) return jsonResponse({ error: 'not_found' }, 404, cors);

    try {
      // ① 캐시 적중 - 상류를 부르지 않으므로 카운터도 올리지 않는다(KV 쓰기 0회).
      //    단, 이미 한도를 넘긴 IP는 캐시 적중이어도 막는다(제한의 의미를 유지한다).
      const rate = await readRateLimit(env, request);
      if (!rate.ok) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter), ...cors }
        });
      }
      const cached = await cacheGet(env, route.key);
      if (cached) return jsonResponse(cached, 200, cors);
      // ② 캐시 미스 - 여기서만 상류를 부르고, 그때 카운터를 올린다.
      await commitRateLimit(env, rate);
      const fresh = await route.run();
      await cachePut(env, route.key, fresh, route.ttl);
      return jsonResponse(fresh, 200, cors);
    } catch (e) {
      // [B-1 (4)] 상류 오류 본문 · 헤더를 그대로 전달하지 않는다 - 내부 경로 · 토큰 상태 · 계정
      // 정보가 오류 메시지에 섞여 나갈 수 있다. 클라이언트에는 "상류 조회 실패"만 알린다.
      return jsonResponse({ error: 'upstream_error' }, 502, cors);
    }
  }
};
