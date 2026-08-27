// ============================================================================
// Smart Asset Manager - 한국투자증권(KIS) 시세/재무 데이터 전용 Cloudflare Worker (참고용 소스)
// ============================================================================
// 이 파일은 앱(index.html)이 직접 로드하지 않는다. Cloudflare 대시보드에 수동으로
// 배포해야 하는 참고 소스일 뿐이다 - 기존 시세/환율 프록시 Worker(asset-manager-proxy)나
// 가족 동기화 Worker(steep-haze-01f0, cloudflare-worker-sync.js)와는 완전히 분리된 별도
// Worker다(보안 격리 - 이 Worker가 뚫려도 다른 두 Worker의 데이터/기능에는 영향이 없다).
//
// [읽기 전용 원칙 - 반드시 지킬 것] 이 Worker는 국내주식 시세/재무 정보 "조회" 라우트만 코드로
// 존재한다. KIS API가 제공하는 주문(매수/매도)/계좌잔고/입출금 같은 라우트는 이 사용자의 API 키
// 권한이 실전투자용이라 하더라도 이 Worker 코드에는 아예 만들지 않는다 - "권한이 있어도 코드가
// 없으면 실행될 수 없다"가 이 프로젝트의 보안 원칙이다.
//
// [배포 절차]
// 1. Cloudflare 대시보드 -> Workers & Pages -> Create -> "Create Worker"
// 2. 편집기에 이 파일 내용을 그대로 붙여넣고 Deploy
// 3. Settings -> Variables -> "KV Namespace Bindings"에서 새 KV 네임스페이스를 하나 만들고,
//    바인딩 이름을 반드시 KIS_KV로 지정(아래 코드가 이 이름을 그대로 참조한다) - KIS 접근토큰을
//    캐싱해 두는 용도로만 쓰인다(다른 데이터는 저장하지 않음).
// 4. Settings -> Variables -> "Secrets"(암호화 변수)에 아래 3개를 등록한다(절대 코드에 직접 쓰지
//    않는다 - 이 파일에는 어떤 키/시크릿 값도 없다):
//      - KIS_APP_KEY      : 한국투자증권 개발자센터에서 발급받은 앱키
//      - KIS_APP_SECRET   : 위와 함께 발급받은 앱시크릿
//      - CLIENT_SHARED_SECRET : 이 앱만 아는 임의의 긴 무작위 문자열(직접 정해서 등록) - 프론트
//        엔드가 매 요청마다 X-App-Secret 헤더로 이 값을 함께 보내야 응답을 받을 수 있다. CORS는
//        브라우저에서만 지켜지는 규칙이라 Worker 주소를 알아낸 제3자가 curl 등으로 직접 두드리는
//        것까지는 막지 못하는데, 이 공유 비밀키가 그 마지막 방어선 역할을 한다.
// 5. 배포 후 발급되는 https://<임의이름>.<계정>.workers.dev 주소와, 4번에서 정한
//    CLIENT_SHARED_SECRET 값을 프론트엔드 설정(다음 단계에서 안내)에 반영한다.
//
// [토큰 캐싱 이유] KIS 접근토큰(access_token)은 발급 API 자체에 호출 빈도 제한이 있고 유효기간이
// 길다(문서 기준 24시간) - 그래서 요청마다 새로 발급받지 않고 KV에 캐시해 두었다가 만료 10분 전까지는
// 재사용한다. 여러 사용자가 없는 가정용 개인 Worker라 토큰 하나를 그대로 재사용해도 충돌이 없다.

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const TOKEN_KV_KEY = 'kis_access_token';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret'
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

// 6자리 국내 종목코드만 허용한다(예: '005930') - 이 Worker는 국내주식 전용이라 그 외 형식은 애초에
// KIS 쪽에서도 정상 조회가 안 되므로 여기서 미리 걸러 불필요한 상위 API 호출을 막는다.
function isValidDomesticCode(code) {
  return /^\d{6}$/.test(code);
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
    week52High: o.w52_hgpr ?? null
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
    totalEquity: b0.total_cptl ?? null
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
  const sumOver = (n, key) => daily.slice(0, n).reduce((s, d) => s + (d[key] || 0), 0);

  return {
    daily: daily.slice(0, 20),
    foreignNet5d: sumOver(5, 'foreignNetQty'),
    foreignNet20d: sumOver(20, 'foreignNetQty'),
    institutionNet5d: sumOver(5, 'institutionNetQty'),
    institutionNet20d: sumOver(20, 'institutionNetQty')
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    // [공유 비밀키 검증] CLIENT_SHARED_SECRET을 등록하지 않은 상태(로컬 테스트 등)면 검사를
    // 건너뛴다 - 실제 배포 시에는 반드시 등록해서 이 분기가 항상 검증하도록 할 것.
    if (env.CLIENT_SHARED_SECRET && request.headers.get('X-App-Secret') !== env.CLIENT_SHARED_SECRET) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const code = (url.searchParams.get('ticker') || '').trim();
    if (!isValidDomesticCode(code)) {
      return jsonResponse({ error: 'bad_ticker' }, 400);
    }

    try {
      if (url.pathname === '/api/kis/price') {
        return jsonResponse(await handlePrice(env, code));
      }
      if (url.pathname === '/api/kis/fundamentals') {
        const divCode = url.searchParams.get('period') === 'quarter' ? '1' : '0';
        return jsonResponse(await handleFundamentals(env, code, divCode));
      }
      if (url.pathname === '/api/kis/investor-flow') {
        return jsonResponse(await handleInvestorFlow(env, code));
      }
      return jsonResponse({ error: 'not_found' }, 404);
    } catch (e) {
      return jsonResponse({ error: 'upstream_error', message: String((e && e.message) || e) }, 502);
    }
  }
};
