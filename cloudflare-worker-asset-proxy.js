// ============================================================================
// Smart Asset Manager - 일반 시세/환율 CORS 프록시 Cloudflare Worker (참고용 소스)
// ============================================================================
// 이 파일은 앱(index.html)이 직접 로드하지 않는다. Cloudflare 대시보드에 수동으로 배포해야 하는
// 참고 소스일 뿐이다 - KIS 전용 Worker(cloudflare-worker-kis-proxy.js)나 가족 동기화 Worker
// (steep-haze-01f0, cloudflare-worker-sync.js)와는 완전히 분리된 별도 Worker다.
//
// [2026-08 - 복구 경위, 반드시 읽을 것] 이 Worker(asset-manager-proxy.key4125.workers.dev)의 원본
// 소스는 이 git 저장소에 한 번도 커밋된 적이 없었다. 실사용 중 "시세 갱신이 매우 느리고 실패한다"는
// 신고를 조사하다가, Cloudflare 대시보드의 배포 이력(당시 보관되어 있던 최근 5건, 6일 전 것까지 포함
// 전부)을 확인해보니 이 Worker 자리에 cloudflare-worker-kis-proxy.js(국내주식 KIS 전용, 원래
// keymaster.key4125.workers.dev에 배포됐어야 할 코드)가 실수로 배포되어 있었다 - 그 결과 앱이 보내는
// "GET /?url=<대상 URL>" 형식 요청을 이 Worker가 전혀 이해하지 못해 매번 즉시 400을 반환했고, 그
// 여파로 모든 시세/환율 요청이 무료 공용 프록시(allorigins/corsproxy.io 등)로만 몰려 그쪽마저
// 과부하로 rate-limit에 걸리는 문제로 이어졌다.
// 이 파일은 프론트엔드(js/01-core-state.js의 OWN_WORKER_PROXY_BASE/CORS_PROXIES 'own-worker' 항목,
// FX_SOURCES_REALTIME)가 실제로 기대하는 호출 계약(요청 형식·응답 형식)을 프론트엔드 코드 전체를
// 역추적해 정확히 맞춰 새로 작성한 것이다.
//
// [2026-08 - User-Agent 헤더 복원, 반드시 읽을 것] 위 재작성판은 최초 배포 이후에도 own-worker가
// 단일 요청 하나에도 즉시 429(Yahoo 쪽 rate-limit)를 반환하는 문제가 계속됐다 - 사용자가 공유해준
// 이 프로젝트의 예전 설계 대화 기록(Gemini와 나눈 원본 개발 히스토리)을 다시 확인해보니, 진짜 원본
// 코드는 Yahoo/Naver에 요청을 보낼 때 실제 Chrome 브라우저처럼 보이는 User-Agent 헤더를 명시적으로
// 붙이고 있었다("Cloudflare 서버가 일반 PC 웹 브라우저인 척 하고 목표 서버에 접근" - 원본 설계
// 대화의 설명 그대로) - 이 재작성판은 그 헤더를 빠뜨려서, Cloudflare Worker의 기본(비브라우저)
// 요청 헤더로 Yahoo에 접근하고 있었다. 서버 간 요청은 브라우저 요청보다 봇으로 식별되기 훨씬 쉬워
// Yahoo의 비공식 API가 더 공격적으로 rate-limit을 걸었을 가능성이 높다 - 원본과 동일하게 이 헤더를
// 복원한다. 응답 쪽 Cache-Control: no-store도 원본에 있던 걸 그대로 되살렸다(중간에 응답이 어딘가
// 캐시되어 오래된 시세가 나가는 걸 막는 안전장치).
//
// [동작] "GET /?url=<encodeURIComponent된 대상 URL>"을 받아, 그 URL을 서버 쪽(Cloudflare 엣지)에서
// 대신 fetch해 응답을 그대로(raw) 돌려준다 - 브라우저가 Yahoo Finance/네이버/환율 API를 직접 부르면
// CORS 정책에 막히는 문제를 우회하기 위한 것뿐이고, KIS Worker와 달리 인증 헤더나 비밀키를 요구하지
// 않는다(원래도 그랬던 것으로 프론트엔드 호출 코드에서 확인됨 - X-App-Secret 같은 헤더를 전혀
// 보내지 않음).
//
// [보안 - 대상 호스트 화이트리스트] 대상 URL을 아무 제한 없이 그대로 받아 fetch하는 완전 오픈
// 프록시는 제3자가 이 Worker 주소를 알아내 무관한 사이트로의 우회 통로로 악용할 수 있다(무료 티어
// 요청 한도 소진, 악용이 심하면 계정 정지 위험) - 원본 코드가 이런 제한을 뒀었는지는 확인할 수
// 없었지만, 프론트엔드 전체(js/01, js/09)를 검색해 이 Worker로 실제 요청을 보내는 대상이 아래 3개
// 호스트뿐임을 확인했으므로, 안전하게 이 목록으로 제한한다 - 필요한 호스트가 늘어나면 이 배열에
// 추가하면 된다.
//
// [배포 절차] KIS Worker와 달리 KV 바인딩이나 Secrets 등록이 전혀 필요 없다 - 코드만 그대로
// 붙여넣고 Deploy하면 끝난다.

const ALLOWED_TARGET_HOSTS = [
  'query1.finance.yahoo.com', // 보유 종목 시세, KRW=X 환율 차트
  'query2.finance.yahoo.com', // [원본 설계 대화에서 복원] 현재 프론트엔드는 안 쓰지만, Yahoo가 query1/
  // query2로 부하분산하는 경우를 대비해 원본에 있던 그대로 남겨둔다 - 비워둬서 아낄 이유가 없다.
  'polling.finance.naver.com', // 국내 종목 실시간(장전/장후 시간외 포함) 시세
  'open.er-api.com', // 환율 스냅샷(하루 1회 갱신, 최종 폴백 소스)
  'api.exchangerate-api.com', // [원본 설계 대화에서 복원] 지금은 FX_SOURCES_SNAPSHOT_FALLBACK에서
  // 프록시 없이 직접 호출되고 있어 당장 이 Worker로 오는 요청은 없지만, 원본에 있던 호스트라 그대로 둔다.
  'stooq.com' // [배포 후 실측으로 발견 - 처음에 빠뜨림] fetchStooqPrice(js/09)가 직접 호출이 CORS로
  // 막히면 CORS_PROXIES[0](=own-worker, 바로 이 Worker)으로 재시도한다 - 이 호스트가 빠져있으면
  // Stooq 폴백 경로 전체가 항상 403으로 죽는다(실제로 배포 직후 Cloudflare 대시보드 Subrequests에서
  // stooq.com 5천여 건이 전부 4xx로 잡히는 것으로 확인됨).
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function errorResponse(errorCode, status) {
  return new Response(JSON.stringify({ error: errorCode }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return errorResponse('method_not_allowed', 405);
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) return errorResponse('missing_url_param', 400);

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return errorResponse('invalid_url', 400);
    }
    if (targetUrl.protocol !== 'https:' || !ALLOWED_TARGET_HOSTS.includes(targetUrl.hostname)) {
      return errorResponse('host_not_allowed', 403);
    }

    try {
      // [원본 그대로 전달] 이 프록시를 쓰는 모든 호출부(fetchYahooViaProxy/fetchNaverKrPrice/FX 소스)가
      // "raw" 방식(별도 parse 없이 그대로 JSON 파싱)을 기대하므로, 응답 바디와 Content-Type을 그대로
      // 넘긴다 - allorigins-get처럼 {contents:"..."}로 감싸면 프론트엔드 파싱이 깨진다.
      // [User-Agent] 실제 Chrome 브라우저처럼 보이게 해 Yahoo/Naver 쪽 봇 탐지·rate-limit을 피한다 -
      // 위 changelog 참고, 원본 설계에 있었다가 재작성 과정에서 누락됐던 걸 복원한 것.
      const upstream = await fetch(targetUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const body = await upstream.arrayBuffer();
      const headers = new Headers(CORS_HEADERS);
      const contentType = upstream.headers.get('Content-Type');
      if (contentType) headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'no-store'); // 원본에 있던 헤더 - 중간 캐시로 오래된 시세가 나가는 것 방지
      return new Response(body, { status: upstream.status, headers });
    } catch (e) {
      return errorResponse('upstream_fetch_failed', 502);
    }
  }
};
