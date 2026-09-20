// ============================================================================
// Smart Asset Manager - 가족 동기화 전용 Cloudflare Worker (참고용 소스)
// ============================================================================
// 이 파일은 앱(index.html)이 직접 로드하지 않는다. Cloudflare 대시보드에 수동으로
// 배포해야 하는 참고 소스일 뿐이다 - 기존 시세/환율 프록시 Worker
// (asset-manager-proxy.key4125.workers.dev)의 소스는 이 저장소에 없어 손댈 수
// 없으므로, 동기화 전용의 완전히 새로운 Worker를 하나 더 만든다.
//
// [배포 절차]
// 1. Cloudflare 대시보드 -> Workers & Pages -> Create -> "Create Worker"
// 2. 편집기에 이 파일 내용을 그대로 붙여넣고 Deploy
// 3. 배포된 Worker의 Settings -> Variables -> "KV Namespace Bindings"에서
//    새 KV 네임스페이스를 하나 만들고, 바인딩 이름을 반드시 SYNC_KV로 지정
//    (아래 코드가 이 이름을 그대로 참조하므로 다르게 지으면 코드도 고쳐야 함)
// 4. 배포 후 발급되는 https://<임의이름>.<계정>.workers.dev 주소를
//    index.html의 SYNC_WORKER_URL 상수에 채워 넣는다.
//
// [설계 메모]
// - 인증은 별도로 두지 않는다. "누가 요청했는지"는 검증하지 않고, 대신 클라이언트가
//   가족 공유 암호에서 유도한 kvKey(예: sync:xxxxxxxx...)를 모르면 애초에 올바른
//   KV 슬롯을 찾을 수 없고, 설령 슬롯을 찾아도 내용은 AES로 암호화돼 있어 같은
//   암호 없이는 읽을 수 없다 - 즉 "암호를 아는 것"이 곧 인증이다. 가정용 2인
//   기능이라 이 이상의 인증/레이트리밋은 과설계로 보고 생략했다.
// - KV 무료 티어 한도: 읽기(GET) 하루 100,000건, 쓰기(PUT) 하루 단 1,000건.
//   읽기는 10초 폴링으로도 여유가 크지만(2대 기준 하루 약 7,200건), 쓰기는
//   훨씬 빠듯하다 - 클라이언트가 디바운스(3초) 후에만 push하므로 정상 사용
//   범위에서는 문제없지만, 만약 나중에 자동 push 트리거를 더 늘린다면 이
//   1,000건 한도가 먼저 걸릴 수 있다는 점을 기억해둘 것.

const KV_KEY_PATTERN = /^sync:[0-9a-f]{32}$/;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB - 이 앱의 JSON 백업은 보통 수십~수백 KB 수준이라 넉넉한 상한

/* [B-3 · B-4 · §47-8 · 2026-09-20] CORS 허용 목록 + 요청 수 제한
 * KIS Worker와 같은 이유다 - Access-Control-Allow-Origin: * 는 "브라우저에서 누구나 부를 수 있다"는
 * 뜻이고, 이 Worker들은 무료 티어 한도를 공유한다. 허용 Origin만 반사하고 IP별 상한을 둔다.
 * (CORS는 브라우저에서만 지켜지므로 curl 직접 호출까지 막지는 못한다 - 그래서 요청 수 제한을 함께 둔다.) */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://key4125-netizen.github.io',
  'http://localhost:8644',
  'http://127.0.0.1:8644',
  'http://localhost:8643'
];
function allowedOrigins(env) {
  const raw = String((env && env.ALLOWED_ORIGINS) || '').trim();
  return raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
}
function corsHeadersFor(request, env) {
  const origin = request.headers.get('Origin');
  const base = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && allowedOrigins(env).includes(origin)) base['Access-Control-Allow-Origin'] = origin;
  return base;
}

/* [B-4] 쓰기 상한이 특히 중요하다 - KV 무료 티어의 PUT 한도가 하루 1,000건이라, 남용이든 버그든
 * 쓰기가 몰리면 그날의 가족 동기화가 통째로 멈춘다. 읽기는 폴링 때문에 상한을 넉넉히 둔다.
 * KV 장애 시에는 제한을 적용하지 않는다(동기화 가용성 우선). */
const RATE_LIMIT_READ_PER_MINUTE = 60;
const RATE_LIMIT_WRITE_PER_DAY = 200;
async function checkSyncRateLimit(env, request, isWrite) {
  if (!env.SYNC_KV) return { ok: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = new Date();
  const key = isWrite ? `rl:w:${ip}:${now.toISOString().slice(0, 10)}` : `rl:r:${ip}:${now.toISOString().slice(0, 16)}`;
  const limit = isWrite ? RATE_LIMIT_WRITE_PER_DAY : RATE_LIMIT_READ_PER_MINUTE;
  try {
    const count = Number((await env.SYNC_KV.get(key)) || 0) + 1;
    if (count > limit) return { ok: false, retryAfter: isWrite ? 3600 : 60 };
    await env.SYNC_KV.put(key, String(count), { expirationTtl: isWrite ? 86400 : 120 });
  } catch (e) { /* KV 장애 시 제한 없음 */ }
  return { ok: true };
}

function jsonResponse(obj, status = 200, cors = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeadersFor(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const rate = await checkSyncRateLimit(env, request, request.method === 'POST');
    if (!rate.ok) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter), ...cors }
      });
    }

    const url = new URL(request.url);
    const kvKey = url.searchParams.get('k') || '';
    if (!KV_KEY_PATTERN.test(kvKey)) {
      return jsonResponse({ error: 'bad_key' }, 400, cors);
    }

    if (request.method === 'GET') {
      const stored = await env.SYNC_KV.get(kvKey, 'json');
      if (!stored) return jsonResponse({ error: 'not_found' }, 404, cors);
      return jsonResponse(stored, 200, cors);
    }

    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'too_large' }, 400, cors);
      }
      let body;
      try { body = JSON.parse(raw); } catch (e) { return jsonResponse({ error: 'bad_json' }, 400, cors); }

      const { ciphertext, iv, salt, version, updatedAt } = body || {};
      const fieldsOk = typeof ciphertext === 'string' && typeof iv === 'string' &&
        typeof salt === 'string' && typeof version === 'number' && typeof updatedAt === 'string';
      if (!fieldsOk) return jsonResponse({ error: 'bad_body' }, 400, cors);

      await env.SYNC_KV.put(kvKey, JSON.stringify({ ciphertext, iv, salt, version, updatedAt }));
      return jsonResponse({ ok: true, version }, 200, cors);
    }

    return jsonResponse({ error: 'method_not_allowed' }, 405, cors);
  }
};
