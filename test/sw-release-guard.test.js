// [Phase 51] Release Guard가 "APP_SHELL을 고치고 SW 버전 올리는 걸 잊은 상태"를 실제로 잡는가.
//
// Phase 50에서 실제로 벌어진 일을 재발 방지하는 검사다: v213 이후 다섯 Phase가 index.html과
// js/01·05·06·07·08·12를 바꿨는데 CACHE_NAME이 v213에 멈춰 있었고, cache-first라 그 수정들이
// 기존 사용자에게 한 건도 전달되지 않았다. 예전 검사는 두 버전 문자열이 서로 "일치"하는지만 봐서
// 둘 다 v213으로 멈춰 있는 상태를 통과시켰다.
//
// 이 테스트는 규칙을 흉내 내지 않는다. 진짜 git 저장소를 임시로 만들어 진짜 커밋을 쌓고,
// scripts/verify-sw-release.js를 실제 프로세스로 실행해 종료코드와 출력으로 판정한다.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const GUARD = path.join(__dirname, '..', 'scripts', 'verify-sw-release.js');

const swSource = (version) => `const CACHE_NAME = 'smart-asset-manager-v${version}';
const APP_SHELL = [
  './',
  './index.html',
  './js/app.js'
];
self.addEventListener('install', () => {});
`;

const htmlSource = (version, extraMarkup = '', comment = '기본 주석') => `<!doctype html>
<html><body>
  <!-- ${comment} -->
  <p id="appVersionLabel" class="text-sm">v${version}</p>
  ${extraMarkup}
  <script>window.__boot = true;</script>
</body></html>
`;

const jsSource = (body, comment = '기본 주석') => `// ${comment}
function boot() {
  ${body}
}
`;

let seq = 0;
function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `swguard-${process.pid}-${seq++}-`));
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'e2e'), { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'guard@test.local');
  git('config', 'user.name', 'Guard Test');
  git('config', 'core.autocrlf', 'false');
  write(dir, files);
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  return { dir, git };
}

function write(dir, files) {
  Object.entries(files).forEach(([rel, content]) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  });
}

function runGuard(dir) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: 'utf8',
    env: { ...process.env, SW_RELEASE_GUARD_ROOT: dir }
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// 모든 케이스가 같은 출발점을 쓴다: v1으로 커밋된 정상 릴리스 상태.
const baseFiles = () => ({
  'sw.js': swSource(1),
  'index.html': htmlSource(1),
  'js/app.js': jsSource('return 1;'),
  'CLAUDE_HANDOVER.md': '# 인계장\n초기 내용\n',
  'e2e/sample.spec.js': "// e2e\nconst x = 1;\n"
});

/* ─────────── Case A / F. 정상 상태는 통과한다 ─────────── */

test('Case A·F. APP_SHELL 변경 없음 + 버전 일치 -> PASS', () => {
  const { dir } = makeRepo(baseFiles());
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Release Guard: PASS/);
  assert.match(r.out, /바뀐 APP_SHELL 파일 없음/);
});

/* ─────────── Case C. 이번 Phase가 막으려는 바로 그 상태 ─────────── */

test('Case C. APP_SHELL 변경 + CACHE_NAME 그대로 -> FAIL', () => {
  const { dir, git } = makeRepo(baseFiles());
  write(dir, { 'js/app.js': jsSource('return 2;') }); // 실제 코드가 바뀌었다
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: change behaviour without bumping');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /Release Guard: FAIL/);
  assert.match(r.out, /js\/app\.js/);
  assert.match(r.out, /기존 사용자에게 전달되지 않습니다/);
});

test('Case C-2. 커밋하지 않은 작업 트리 변경도 잡는다', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, { 'js/app.js': jsSource('return 3;') }); // 커밋 전 상태
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /js\/app\.js/);
});

test('Case C-3. index.html 마크업 변경도 잡는다', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, { 'index.html': htmlSource(1, '<div id="newThing"></div>') });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /index\.html/);
});

/* ─────────── Case B. 버전을 함께 올리면 통과한다 ─────────── */

test('Case B. APP_SHELL 변경 + CACHE_NAME·appVersionLabel 함께 bump -> PASS', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, {
    'js/app.js': jsSource('return 2;'),
    'sw.js': swSource(2),
    'index.html': htmlSource(2)
  });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Release Guard: PASS/);
  assert.match(r.out, /아직 커밋되지 않았습니다/);
});

test('Case B-2. bump를 커밋한 뒤에도 통과 상태가 유지된다', () => {
  const { dir, git } = makeRepo(baseFiles());
  write(dir, {
    'js/app.js': jsSource('return 2;'),
    'sw.js': swSource(2),
    'index.html': htmlSource(2)
  });
  git('add', '-A');
  git('commit', '-q', '-m', 'release: bump to v2');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /바뀐 APP_SHELL 파일 없음/);
});

/* ─────────── Case D. appVersionLabel만 올리는 것으로는 부족하다 ─────────── */

test('Case D. APP_SHELL 변경 + appVersionLabel만 bump(CACHE_NAME 그대로) -> FAIL', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, { 'js/app.js': jsSource('return 2;'), 'index.html': htmlSource(2) });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  // 화면 표시만 올리고 캐시 이름을 안 올리면 사용자는 여전히 옛 코드를 받는다.
  assert.match(r.out, /버전 불일치/);
  assert.match(r.out, /CACHE_NAME이 그대로입니다/);
});

/* ─────────── Case E. 두 버전 표기가 어긋나면 실패한다(기존 검사) ─────────── */

test('Case E. CACHE_NAME만 bump하고 appVersionLabel 불일치 -> FAIL', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, { 'sw.js': swSource(2) }); // index.html은 v1 그대로
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /버전 불일치: sw\.js CACHE_NAME은 v2인데 index\.html appVersionLabel은 v1/);
});

/* ─────────── 오탐 방지 ─────────── */

test('오탐 방지. 문서·e2e·테스트 파일만 바뀌면 PASS', () => {
  const { dir, git } = makeRepo(baseFiles());
  write(dir, {
    'CLAUDE_HANDOVER.md': '# 인계장\n한참 늘어난 내용\n',
    'e2e/sample.spec.js': "// e2e가 크게 바뀌었다\nconst x = 42;\nconst y = 7;\n",
    'test/new.test.js': "// 새 테스트\n"
  });
  git('add', '-A');
  git('commit', '-q', '-m', 'docs+test only');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /바뀐 APP_SHELL 파일 없음/);
});

test('오탐 방지. APP_SHELL 파일의 주석/공백만 바뀌면 PASS', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, {
    // 코드는 그대로, 주석만 완전히 다르게 + 들여쓰기 변경
    'js/app.js': '// 완전히 다른 설명을 길게 적었다\n/* 블록 주석도 추가 */\nfunction boot() {\n      return 1;\n}\n',
    'index.html': htmlSource(1, '', '주석 내용을 통째로 바꿨다')
  });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /주석\/공백만 바뀐 파일 2개/);
});

test('오탐 방지. 문자열 안의 주석 기호는 코드로 취급한다', () => {
  const { dir } = makeRepo(baseFiles());
  // 주석 제거를 문자열까지 건드리는 방식으로 구현했다면 이 변경을 놓친다(거짓 통과).
  write(dir, { 'js/app.js': jsSource('return "// 이건 주석이 아니라 값이다";') });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /js\/app\.js/);
});

test('오탐 방지. script 블록 안의 <!-- 는 HTML 주석이 아니다', () => {
  const { dir } = makeRepo(baseFiles());
  const html = `<!doctype html>
<html><body>
  <p id="appVersionLabel" class="text-sm">v1</p>
  <script>window.__boot = true; const s = "<!-- 문자열 -->"; window.__x = s;</script>
</body></html>
`;
  write(dir, { 'index.html': html });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /index\.html/);
});

/* ─────────── 환경 방어 ─────────── */

test('git 저장소가 아니면 검사를 건너뛰되 나머지 검사는 그대로 한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `swguard-nogit-${process.pid}-`));
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  write(dir, baseFiles());
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /git 저장소가 아니어서/);
  assert.match(r.out, /버전 일치 확인/); // 기존 검사는 계속 동작한다
});

test('APP_SHELL에 없는 파일이 바뀌어도 무시한다(런타임 캐싱 대상)', () => {
  const { dir } = makeRepo(baseFiles());
  write(dir, { 'js/lazy.js': '// APP_SHELL에 없는 파일\nconst z = 1;\n' });
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /바뀐 APP_SHELL 파일 없음/);
});
