/* [PM 결정 2026-09-26 · D안] KIS_PROXY_ACCESS_TOKEN_PUBLIC_EXCEPTION
 *
 * 이 파일이 하는 일은 "검사를 눈감아 주는 것"이 아니다.
 * **예외가 성립하는 조건 7개를 매번 실제로 확인**하고, 조건이 하나라도 깨지면 실패한다.
 * 그래서 나중에 Worker에 계좌 · 잔고 · 주문 기능이 붙거나, 다른 이름의 값이 소스에
 * 새로 들어오면 여기서 먼저 걸린다.
 *
 * 예외 대상 : js/01-core-state.js 의 KIS_PROXY_ACCESS_TOKEN 단 하나
 *   (기존 명칭 KIS_CLIENT_SHARED_SECRET → 정책 재정의 후 개명)
 *
 * 예외 근거 : 이 값은 한국투자증권이 발급한 자격증명이 아니라 사용자가 직접 정한 문자열이고,
 *   정적 공개 페이지가 매 요청에 실어 보내므로 원리상 공개값이다. 할 수 있는 최대치는
 *   공개 시세 · 공시 재무 · 채권 발행정보 조회이며 Worker가 하루 300회로 끊는다.
 *   실제 비밀(KIS APP KEY · APP SECRET)은 Worker 서버 환경에만 있다.
 *
 * 이 파일은 실제 비밀값을 만들지도 출력하지도 않는다 - 더미 문자열만 쓴다.
 * 실행: node --test test/v270-kis-proxy-token-policy.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const WORKER_PATH = path.join(ROOT, 'cloudflare-worker-kis-proxy.js');
const WORKER_SRC = fs.readFileSync(WORKER_PATH, 'utf8');

const EXCEPTION_NAME = 'KIS_PROXY_ACCESS_TOKEN_PUBLIC_EXCEPTION';
/* 예외는 **이 한 줄로 한정**한다. 목록이 늘어나면 아래 "예외는 하나뿐" 테스트가 실패한다. */
const ALLOWED_EXCEPTIONS = Object.freeze([
  Object.freeze({ file: 'js/01-core-state.js', constant: 'KIS_PROXY_ACCESS_TOKEN' })
]);

const DUMMY = 'zz-dummy-not-a-real-value';
const ORIGIN_OK = 'https://key4125-netizen.github.io';
const ORIGIN_BAD = 'https://evil.example.com';

function clientFiles() {
  const out = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
  out.push('index.html', 'sw.js');
  return out.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]);
}

/* ══════════════ 예외 조건 1 · 7 — 이름과 범위 ══════════════ */

test('조건1. 예외 대상의 이름은 KIS_PROXY_ACCESS_TOKEN이다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', '01-core-state.js'), 'utf8');
  assert.ok(/const KIS_PROXY_ACCESS_TOKEN = '[^']+';/.test(src),
    'js/01에 KIS_PROXY_ACCESS_TOKEN 선언이 없다');
  // 옛 이름이 값과 함께 되살아나면 안 된다(주석의 역사 기록은 허용).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/KIS_CLIENT_SHARED_SECRET/.test(code), '옛 명칭이 코드에 남아 있다');
});

test('조건7. 예외는 하나뿐이다 - catch-all 예외를 만들지 않는다', () => {
  assert.strictEqual(ALLOWED_EXCEPTIONS.length, 1, '예외 목록이 늘어났다 - PM 결정 없이 넓히지 않는다');
  assert.strictEqual(ALLOWED_EXCEPTIONS[0].constant, 'KIS_PROXY_ACCESS_TOKEN');
  assert.strictEqual(ALLOWED_EXCEPTIONS[0].file, 'js/01-core-state.js');
  assert.ok(EXCEPTION_NAME.length > 0);
});

/* ══════════════ 소스 스캔 — 허용된 하나 외에는 전부 실패 ══════════════ */

test('실제 비밀이 소스에 없다 - KIS 앱키 · 앱시크릿 · 접근토큰 · 인증헤더 · 개인키', () => {
  const names = ['KIS_APP_KEY', 'KIS_APP_SECRET', 'CLIENT_SHARED_SECRET', 'KIS_CLIENT_SHARED_SECRET',
    'appsecret', 'appkey', 'access_token', 'Authorization'];
  clientFiles().concat([['cloudflare-worker-kis-proxy.js', WORKER_SRC]]).forEach(([label, src]) => {
    names.forEach((name) => {
      /* 이름이 통째로 일치할 때만 본다 - LS_KIS_PROXY_ACCESS_TOKEN처럼 더 긴 상수 이름의
       * 일부로 걸리면 저장소 키 이름을 비밀값으로 잘못 신고한다.
       * 값에 ${'${'}...} 가 들어 있으면 런타임에 만드는 문자열이라 하드코딩이 아니다
       * (Worker의 authorization: `Bearer ${'${'}token}` 이 그 경우다). */
      const assigned = new RegExp(`(?<![A-Za-z0-9_])${name}\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`, 'i');
      const hit = assigned.exec(src);
      const hardcoded = hit && !hit[1].includes('${');
      assert.ok(!hardcoded, `${label}에 ${name} 값이 적혀 있다`);
    });
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(src), `${label}에 개인키 블록이 있다`);
    assert.ok(!/Bearer\s+[A-Za-z0-9._-]{12,}/.test(src), `${label}에 Bearer 토큰 리터럴이 있다`);
  });
});

test('허용되지 않은 임의 토큰 · 비밀번호가 소스에 새로 들어오면 실패한다', () => {
  /* 민감해 보이는 이름에 문자열 리터럴이 붙은 곳을 전부 찾아, 허용 목록에 있는 하나만 통과시킨다.
   * LS_ 로 시작하는 상수는 이 프로젝트에서 localStorage **키 이름**이라 값이 아니다
   * (LS_ASSETS · LS_SYNC_PASSWORD 등 - 규약이며 코드 전체에서 일관된다). */
  const SENSITIVE = /(SECRET|PASSWORD|PRIVATE_?KEY|ACCESS_?TOKEN|API_?KEY|APPKEY|APP_KEY|CREDENTIAL|BEARER)/i;
  const ASSIGN = /([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]\s*['"`]([^'"`\n]{1,300})['"`]/g;
  const unexpected = [];
  clientFiles().forEach(([label, src]) => {
    let m;
    while ((m = ASSIGN.exec(src)) !== null) {
      const ident = m[1];
      if (!SENSITIVE.test(ident)) continue;
      if (ident.startsWith('LS_')) continue; // 저장소 키 이름(값 아님)
      const allowed = ALLOWED_EXCEPTIONS.some((e) => e.file === label && e.constant === ident);
      if (!allowed) unexpected.push(`${label}:${ident}`);
    }
  });
  assert.deepStrictEqual(unexpected, [],
    `허용되지 않은 값이 소스에 있다(${EXCEPTION_NAME}은 KIS_PROXY_ACCESS_TOKEN 하나만 허용한다)`);
});

/* ══════════════ 예외 조건 2 — 실제 KIS 자격증명과 분리 ══════════════ */

test('조건2. 실제 KIS 자격증명은 Worker 환경변수에서만 읽는다', () => {
  ['KIS_APP_KEY', 'KIS_APP_SECRET', 'CLIENT_SHARED_SECRET'].forEach((name) => {
    assert.ok(WORKER_SRC.includes('env.' + name), `${name}을 환경변수로 읽지 않는다`);
  });
  // 클라이언트에는 이름조차 값으로 등장하지 않는다.
  clientFiles().forEach(([label, src]) => {
    assert.ok(!/env\.KIS_APP_(KEY|SECRET)/.test(src), `${label}이 Worker 환경변수를 직접 참조한다`);
  });
});

/* ══════════════ 예외 조건 3 · 6 — 공개정보 전용 라우트 ══════════════ */

test('조건3·6. Worker 라우트는 공개정보 조회 5개뿐이고 계좌 · 잔고 · 주문 라우트가 없다', () => {
  const expected = ['/api/kis/price', '/api/kis/fundamentals', '/api/kis/investor-flow',
    '/api/kis/bond-info', '/api/kis/bond-price'];
  expected.forEach((r) => assert.ok(WORKER_SRC.includes(`'${r}'`), `${r} 라우트가 없다`));
  const declared = Array.from(WORKER_SRC.matchAll(/'(\/api\/kis\/[a-z-]+)'/g)).map((m) => m[1]);
  assert.deepStrictEqual([...new Set(declared)].sort(), expected.slice().sort(),
    '선언된 라우트가 공개정보 5개와 다르다 - 예외 정책을 재검토해야 한다');

  // KIS 상류 경로 기준으로도 확인한다(주문 · 계좌는 /uapi/domestic-stock/v1/trading/ 아래다).
  const code = WORKER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/v1\/trading\//i.test(code), '주문 · 계좌 상류 경로가 생겼다');
  assert.ok(!/order-cash|inquire-balance|inquire-psbl|inquire-account/i.test(code),
    '주문 · 잔고 · 계좌 상류 경로가 생겼다');
});

/* ══════════════ 예외 조건 4 · 5 — Origin 제한과 요청 수 제한 ══════════════ */

function loadWorker() {
  const sandbox = {
    Response, Request, Headers, URL, JSON, Date, Math, Number, String, Object, Array, Promise,
    console, fetch: async () => { throw new Error('테스트에서 상류 호출이 발생했다'); },
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(WORKER_SRC.replace('export default {', 'module.exports.worker = {'), sandbox, { filename: 'kis-worker' });
  return sandbox.module.exports.worker;
}
function kvStub() {
  const map = new Map();
  return { map, get: async (k) => (map.has(k) ? map.get(k) : null), put: async (k, v) => { map.set(k, v); } };
}
const rq = (url, headers) => new Request(url, { method: 'GET', headers: headers || {} });
const URL_PRICE = 'https://worker.test/api/kis/price?ticker=005930';

test('조건4. Origin 허용 목록이 유지된다 - 목록 밖에는 CORS 허용 헤더를 주지 않는다', () => {
  assert.ok(WORKER_SRC.includes(`'${ORIGIN_OK}'`), '운영 Origin이 허용 목록에서 빠졌다');
  assert.ok(/allowedOrigins\(env\)\.includes\(origin\)/.test(WORKER_SRC), 'Origin 대조가 사라졌다');
});

test('조건4. 목록 밖 Origin에는 허용 헤더가 붙지 않는다(실측)', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY };
  const ok = await w.fetch(rq(URL_PRICE, { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY, 'CF-Connecting-IP': '203.0.113.21' }), env);
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN_OK);
  const bad = await w.fetch(rq(URL_PRICE, { Origin: ORIGIN_BAD, 'X-App-Secret': DUMMY, 'CF-Connecting-IP': '203.0.113.22' }), env);
  assert.strictEqual(bad.headers.get('Access-Control-Allow-Origin'), null, '목록 밖 Origin을 반사했다');
});

test('조건5. 요청 수 제한이 유지된다 - 분 상한을 넘으면 429', async () => {
  assert.ok(/RATE_LIMIT_PER_MINUTE = 30/.test(WORKER_SRC), '분 상한이 바뀌었다');
  assert.ok(/RATE_LIMIT_PER_DAY = 300/.test(WORKER_SRC), '일 상한이 바뀌었다');

  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY };
  const headers = { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY, 'CF-Connecting-IP': '203.0.113.31' };
  let last = null;
  for (let i = 0; i < 30; i += 1) last = await w.fetch(rq(URL_PRICE, headers), env);
  assert.notStrictEqual(last.status, 429, '상한 안쪽 요청을 막았다');
  const over = await w.fetch(rq(URL_PRICE, headers), env);
  assert.strictEqual(over.status, 429);
  assert.strictEqual(over.headers.get('Retry-After'), '60');
});

test('토큰 불일치는 401, 미등록은 503(fail-closed) - 토큰 검증이 유지된다', async () => {
  const w = loadWorker();
  const mismatch = await w.fetch(rq(URL_PRICE, { Origin: ORIGIN_OK, 'X-App-Secret': 'zz-wrong' }),
    { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY });
  assert.strictEqual(mismatch.status, 401);
  assert.deepStrictEqual(await mismatch.json(), { error: 'unauthorized' });

  const notConfigured = await w.fetch(rq(URL_PRICE, { Origin: ORIGIN_OK }), { KIS_KV: kvStub() });
  assert.strictEqual(notConfigured.status, 503);
  assert.deepStrictEqual(await notConfigured.json(), { error: 'not_configured' });
});

/* ══════════════ 클라이언트 사용 경로 ══════════════ */

function sandboxWithKis() {
  const sb = loadAdapterSandbox();
  sb.URL = URL; // 공용 하네스에는 js/13이 안 실려 있어 URL이 없다 - 이 테스트에서만 얹는다
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', '13-fundamental-data.js'), 'utf8'), sb, { filename: '13-fundamental-data.js' });
  sb.evalInSandbox(`
    globalThis.JASAN_RUNTIME_CONFIG = undefined;
    localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
      setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  `);
  return sb;
}
function recordFetch(sb) {
  const calls = [];
  sb.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: (init && init.headers) || {} });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  return calls;
}

test('토큰은 정책상 지정된 위치에서만 쓰인다 - 선언 1곳 · 헤더 1곳', () => {
  const declared = fs.readFileSync(path.join(ROOT, 'js', '01-core-state.js'), 'utf8');
  assert.ok(/const KIS_PROXY_ACCESS_TOKEN = /.test(declared));
  const users = clientFiles().filter(([label, src]) => label !== 'js/01-core-state.js'
    && /KIS_PROXY_ACCESS_TOKEN/.test(src.replace(/LS_KIS_PROXY_ACCESS_TOKEN/g, '')));
  assert.deepStrictEqual(users.map(([l]) => l), [], '선언부 밖에서 토큰 상수를 직접 참조한다');

  const kis = fs.readFileSync(path.join(ROOT, 'js', '13-fundamental-data.js'), 'utf8');
  assert.ok(/resolveKisProxyAccessToken\(\)/.test(kis), 'js/13이 해석 함수를 쓰지 않는다');
  assert.ok(/'X-App-Secret': proxyToken/.test(kis), '헤더로 싣지 않는다');
});

test('기본값으로 정상 호출된다 - 설정이 없어도 KIS를 부른다(D-4의 중단 분기 복원 확인)', async () => {
  const sb = sandboxWithKis();
  const calls = recordFetch(sb);
  const r = await sb.evalInSandbox("fetchKisPriceSnapshot('005930')");
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(calls.length, 1, '설정이 없으면 호출하지 않던 D-4 분기가 남아 있다');
  assert.ok(String(calls[0].headers['X-App-Secret'] || '').length > 0, '토큰 없이 호출했다');
});

test('설정이 있으면 그 값이 소스 기본값보다 앞선다(토큰 교체 경로)', async () => {
  const sb = sandboxWithKis();
  sb.evalInSandbox(`globalThis.JASAN_RUNTIME_CONFIG = { kisProxyAccessToken: ${JSON.stringify(DUMMY)} };`);
  const calls = recordFetch(sb);
  await sb.evalInSandbox("fetchKisPriceSnapshot('005930')");
  assert.strictEqual(calls[0].headers['X-App-Secret'], DUMMY);

  const sb2 = sandboxWithKis();
  sb2.evalInSandbox(`localStorage.setItem('sam_kis_proxy_access_token_v1', ${JSON.stringify(DUMMY)});`);
  const calls2 = recordFetch(sb2);
  await sb2.evalInSandbox("fetchKisBondInfoRaw('KR103502G990')");
  assert.strictEqual(calls2[0].headers['X-App-Secret'], DUMMY);
});

test('토큰은 주소 · 쿼리에 실리지 않고 앱 데이터에도 저장되지 않는다', async () => {
  const sb = sandboxWithKis();
  sb.evalInSandbox(`globalThis.JASAN_RUNTIME_CONFIG = { kisProxyAccessToken: ${JSON.stringify(DUMMY)} };`);
  const calls = recordFetch(sb);
  await sb.evalInSandbox("fetchKisPriceSnapshot('005930')");
  assert.ok(!calls[0].url.includes(DUMMY), '주소에 실으면 서버 로그 · 브라우저 기록에 남는다');
  assert.ok(calls[0].url.includes('ticker=005930'));

  const stateJson = JSON.stringify(sb.state);
  assert.ok(!stateJson.includes(DUMMY), 'state에 들어가면 백업 · 동기화로 퍼진다');
  assert.ok(!stateJson.includes('kisProxyAccessToken'));
});
