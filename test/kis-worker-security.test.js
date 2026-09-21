// [B-1 · §47-8] KIS 프록시 Worker 보안 계약 (PM EXECUTION DIRECTIVE 2026-09-20 §7)
//
// 이 Worker는 Cloudflare에 수동 배포하는 파일이라 앱 번들에 들어가지 않는다. 그래도 "설정을 잊으면
// 무인증으로 열리던" 결함이 실제로 있었으므로, 동작 자체를 여기서 고정한다. 소스를 읽어 모듈로 평가하고
// (Cloudflare 런타임 대신 Node의 fetch 표준 객체를 쓴다) 요청을 넣어 응답을 확인한다.
// 비밀값은 테스트에서도 만들지 않는다 - 임의의 더미 문자열만 쓰고 출력하지 않는다.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_PATH = path.join(__dirname, '..', 'cloudflare-worker-kis-proxy.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// ESM `export default {...}` 를 CommonJS로 바꿔 vm에서 평가한다(파일 자체는 손대지 않는다).
function loadWorker() {
  const sandbox = {
    Response, Request, Headers, URL, JSON, Date, Math, Number, String, Object, Array, Promise,
    console, fetch: async () => { throw new Error('테스트에서 상류 호출이 발생했다'); },
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC.replace('export default {', 'module.exports.worker = {'), sandbox, { filename: 'kis-worker' });
  return sandbox.module.exports.worker;
}

const DUMMY_SECRET = 'zz-test-shared-secret-not-a-real-value';
const ORIGIN_OK = 'https://key4125-netizen.github.io';
const ORIGIN_BAD = 'https://evil.example.com';

function kvStub() {
  const map = new Map();
  return {
    map,
    get: async (k) => (map.has(k) ? map.get(k) : null),
    put: async (k, v) => { map.set(k, v); }
  };
}
function req(url, headers) { return new Request(url, { method: 'GET', headers: headers || {} }); }
const URL_PRICE = 'https://worker.test/api/kis/price?ticker=005930';

test('fail-closed: 공유 비밀키가 등록돼 있지 않으면 인증을 건너뛰지 않고 503으로 거절한다', async () => {
  const w = loadWorker();
  const res = await w.fetch(req(URL_PRICE, { Origin: ORIGIN_OK }), { KIS_KV: kvStub() });
  assert.strictEqual(res.status, 503);
  assert.deepStrictEqual(await res.json(), { error: 'not_configured' });
});

test('인증 실패는 401이고, 내부 정보를 함께 내보내지 않는다', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const res = await w.fetch(req(URL_PRICE, { Origin: ORIGIN_OK }), env);
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ['error']);
  assert.strictEqual(body.error, 'unauthorized');
});

test('CORS: 허용 목록에 있는 Origin만 반사하고, 목록 밖 Origin에는 허용 헤더를 주지 않는다', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const ok = await w.fetch(new Request(URL_PRICE, { method: 'OPTIONS', headers: { Origin: ORIGIN_OK } }), env);
  assert.strictEqual(ok.status, 204);
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN_OK);
  assert.strictEqual(ok.headers.get('Vary'), 'Origin');

  const bad = await w.fetch(new Request(URL_PRICE, { method: 'OPTIONS', headers: { Origin: ORIGIN_BAD } }), env);
  assert.strictEqual(bad.headers.get('Access-Control-Allow-Origin'), null, '목록 밖 Origin에 허용 헤더를 주면 안 된다');
  // 와일드카드는 어떤 경우에도 쓰지 않는다.
  assert.ok(!SRC.includes("'Access-Control-Allow-Origin': '*'"));
});

test('CORS 허용 목록은 환경변수로 바꿀 수 있다(코드 수정 없이 운영 도메인 변경)', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET, ALLOWED_ORIGINS: 'https://zz.example.org' };
  const res = await w.fetch(new Request(URL_PRICE, { method: 'OPTIONS', headers: { Origin: 'https://zz.example.org' } }), env);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://zz.example.org');
  const old = await w.fetch(new Request(URL_PRICE, { method: 'OPTIONS', headers: { Origin: ORIGIN_OK } }), env);
  assert.strictEqual(old.headers.get('Access-Control-Allow-Origin'), null, '목록을 바꾸면 기본값은 더 이상 허용되지 않는다');
});

test('요청 수 제한: 분 상한을 넘으면 429와 Retry-After를 돌려준다', async () => {
  const w = loadWorker();
  const kv = kvStub();
  const env = { KIS_KV: kv, CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const headers = { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY_SECRET, 'CF-Connecting-IP': '203.0.113.7' };
  // 상한(30)까지는 인증 · 제한을 통과해 라우팅 단계로 간다(상류 호출은 stub이라 502).
  let last = null;
  for (let i = 0; i < 30; i++) last = await w.fetch(req(URL_PRICE, headers), env);
  assert.notStrictEqual(last.status, 429, '상한 안쪽 요청까지 막으면 안 된다');
  const over = await w.fetch(req(URL_PRICE, headers), env);
  assert.strictEqual(over.status, 429);
  assert.strictEqual(over.headers.get('Retry-After'), '60');
  assert.strictEqual(over.headers.get('Access-Control-Allow-Origin'), ORIGIN_OK);
});

test('상류 오류 본문을 그대로 전달하지 않는다(오류 노출 최소화)', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const headers = { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY_SECRET, 'CF-Connecting-IP': '203.0.113.8' };
  const res = await w.fetch(req(URL_PRICE, headers), env);
  assert.strictEqual(res.status, 502);
  const body = await res.json();
  assert.deepStrictEqual(body, { error: 'upstream_error' }, '상류 예외 메시지를 클라이언트에 넘기지 않는다');
});

test('잘못된 종목코드는 상류를 부르기 전에 400으로 막는다(기존 계약 유지)', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const headers = { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY_SECRET, 'CF-Connecting-IP': '203.0.113.9' };
  const res = await w.fetch(req('https://worker.test/api/kis/price?ticker=AAPL', headers), env);
  assert.strictEqual(res.status, 400);
});

test('소스에 비밀값이 하드코딩돼 있지 않다(이름만 존재)', () => {
  ['KIS_APP_KEY', 'KIS_APP_SECRET', 'CLIENT_SHARED_SECRET'].forEach((name) => {
    assert.ok(SRC.includes('env.' + name), `${name}은 환경변수로만 읽어야 한다`);
    // name = "값" 형태의 대입이 소스에 있으면 안 된다.
    assert.ok(!new RegExp(name + "\\s*[:=]\\s*['\"][^'\"]+['\"]").test(SRC), `${name} 값이 소스에 적혀 있다`);
  });
  // 읽기 전용 원칙도 함께 고정한다 - KIS의 주문 · 계좌 라우트는 /uapi/domestic-stock/v1/trading/ 아래에 있다
  // (재무제표의 balance-sheet는 조회 라우트라 여기 해당하지 않는다).
  const code = SRC.replace(/\/\/.*$/gm, '');
  assert.ok(!/v1\/trading\//i.test(code), '주문 · 계좌 라우트가 생기면 안 된다');
  assert.ok(!/order-cash|inquire-balance|inquire-psbl/i.test(code), '주문 · 잔고 조회 라우트가 생기면 안 된다');
});

test('G-5: 영문 혼합 국내 종목코드는 "잘못된 코드"가 아니라 "미지원 형식"으로 구분한다', async () => {
  const w = loadWorker();
  const env = { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET };
  const headers = { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY_SECRET, 'CF-Connecting-IP': '203.0.113.10' };
  // KRX 신규 코드 형식(숫자4+영문1+숫자1) - 앱은 식별하지만 이 Worker는 아직 지원하지 않는다.
  const unsupported = await w.fetch(req('https://worker.test/api/kis/price?ticker=0052D0', headers), env);
  assert.strictEqual(unsupported.status, 400);
  assert.deepStrictEqual(await unsupported.json(), { error: 'ticker_format_unsupported' });
  // 그냥 형식이 틀린 입력은 예전처럼 bad_ticker다.
  const bad = await w.fetch(req('https://worker.test/api/kis/price?ticker=ZZZZ', headers), env);
  assert.deepStrictEqual(await bad.json(), { error: 'bad_ticker' });
  // 허용 범위 자체는 넓히지 않았다 - KIS가 이 형식을 받는지 확인되지 않았기 때문이다(확인 전 개방 금지).
  assert.ok(SRC.includes(String.raw`/^\d{6}$/.test(code)`), 'isValidDomesticCode가 6자리 숫자 검사를 유지해야 한다');
});

/* ══ [Bond Stage 2 · §49 BOND-34] 채권 라우트의 입력 검증 · 인증 계약 ══════════
 * 상류는 부르지 않는다(위 loadWorker의 fetch 스텁이 던진다) - "검증을 통과했는가"만 본다.
 * 통과하면 상류 호출로 넘어가 502가 되고, 막히면 400이 된다. 그 차이로 판정한다. */

const ISIN_OK = 'KRZZ00000001';   // 합성 코드 - 실제 보유 채권이 아니다
const URL_BOND_INFO = `https://worker.test/api/kis/bond-info?ticker=${ISIN_OK}`;
const URL_BOND_PRICE = `https://worker.test/api/kis/bond-price?ticker=${ISIN_OK}`;

function bondEnv() { return { KIS_KV: kvStub(), CLIENT_SHARED_SECRET: DUMMY_SECRET }; }
function authHeaders() { return { Origin: ORIGIN_OK, 'X-App-Secret': DUMMY_SECRET }; }

test('채권 라우트: ISIN은 검증을 통과한다(주식 6자리 검사에 걸려 막히지 않는다)', async () => {
  const w = loadWorker();
  for (const url of [URL_BOND_INFO, URL_BOND_PRICE]) {
    const res = await w.fetch(req(url, authHeaders()), bondEnv());
    // 상류 스텁이 던지므로 502다 - 400이면 검증에서 막혔다는 뜻이다.
    assert.strictEqual(res.status, 502, `${url} 가 검증 단계에서 막혔다`);
    assert.deepStrictEqual(await res.json(), { error: 'upstream_error' });
  }
});

test('채권 라우트: 소문자로 들어온 ISIN도 같은 코드로 본다', async () => {
  const w = loadWorker();
  const res = await w.fetch(req(`https://worker.test/api/kis/bond-info?ticker=${ISIN_OK.toLowerCase()}`, authHeaders()), bondEnv());
  assert.strictEqual(res.status, 502);
});

test('채권 라우트: ISIN이 아니면 상류를 부르기 전에 400 bad_isin으로 막는다', async () => {
  const w = loadWorker();
  for (const bad of ['005930', 'KR1035', 'KRZZ0000000A', '', 'KRZZ000000012']) {
    const res = await w.fetch(req(`https://worker.test/api/kis/bond-info?ticker=${bad}`, authHeaders()), bondEnv());
    assert.strictEqual(res.status, 400, `"${bad}" 가 통과했다`);
    assert.deepStrictEqual(await res.json(), { error: 'bad_isin' });
  }
});

test('주식 라우트의 검증은 느슨해지지 않았다(ISIN을 주식 라우트에 넣으면 여전히 400)', async () => {
  const w = loadWorker();
  const res = await w.fetch(req(`https://worker.test/api/kis/price?ticker=${ISIN_OK}`, authHeaders()), bondEnv());
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: 'bad_ticker' });
});

test('채권 라우트도 인증 · fail-closed 규칙을 똑같이 지킨다', async () => {
  const w = loadWorker();
  // 공유 비밀키 미등록 -> 503
  const noCfg = await w.fetch(req(URL_BOND_INFO, { Origin: ORIGIN_OK }), { KIS_KV: kvStub() });
  assert.strictEqual(noCfg.status, 503);
  // 비밀키 불일치 -> 401
  const bad = await w.fetch(req(URL_BOND_INFO, { Origin: ORIGIN_OK, 'X-App-Secret': 'wrong' }), bondEnv());
  assert.strictEqual(bad.status, 401);
  // 허용 목록 밖 Origin에는 CORS 허용 헤더를 주지 않는다
  const evil = await w.fetch(req(URL_BOND_INFO, { Origin: ORIGIN_BAD, 'X-App-Secret': DUMMY_SECRET }), bondEnv());
  assert.strictEqual(evil.headers.get('Access-Control-Allow-Origin'), null);
});

test('채권 발행정보는 시세보다 훨씬 긴 캐시를 쓴다(발행 후 바뀌지 않는 값이라 반복 조회하지 않는다)', () => {
  assert.match(SRC, /BOND_INFO_CACHE_TTL_SECONDS\s*=\s*30 \* 24 \* 60 \* 60/);
  assert.match(SRC, /kis_cache:bond-info:\$\{isin\}`,\s*\n\s*\(\) => handleBondInfo\(env, isin\), BOND_INFO_CACHE_TTL_SECONDS\)/);
});

test('주문 · 계좌 · 잔고 라우트는 채권 추가 후에도 코드에 존재하지 않는다(읽기 전용 원칙)', () => {
  // 경로만 본다 - 'balance-sheet'(재무제표)는 계좌 잔고가 아니다.
  const paths = SRC.match(/'\/uapi\/[^']+'/g) || [];
  assert.ok(paths.length > 0, 'KIS 경로를 하나도 찾지 못했다 - 이 검사가 무력해졌다');
  paths.forEach((p) => {
    assert.ok(!/(trading|order|inquire-balance|inquire-psbl|inquire-account)/i.test(p),
      `주문 · 계좌 경로가 코드에 들어왔다: ${p}`);
  });
});
