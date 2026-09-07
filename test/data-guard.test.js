// Data Guard가 "실제 사용자 자산 파일을 실수로 커밋하는 것"을 실제로 막는가.
//
// 2026-07-28에 실제 자산 데이터가 담긴 엑셀 하나가 커밋되어 GitHub Pages로 약 1시간 22분
// 공개 배포됐다. 삭제 커밋을 해도 과거 커밋의 객체는 남고, 그 정보는 자격증명과 달리 회전할
// 수도 무를 수도 없다. 이 검사가 그때 있었다면 커밋 자체가 막혔다.
//
// 이 테스트는 규칙을 옮겨 적지 않는다. 진짜 git 저장소를 임시로 만들어 실제로 파일을 stage하고,
// scripts/verify-no-user-data.js를 실제 프로세스로 실행해 종료코드로 판정한다.
//
// 오탐 케이스를 막는 쪽이 절반이다 - 정상 파일을 막는 검사는 곧 무시당하고, 무시당하는 검사는
// 방지 장치가 아니다.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const GUARD = path.join(__dirname, '..', 'scripts', 'verify-no-user-data.js');

let seq = 0;
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dataguard-${process.pid}-${seq++}-`));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'guard@test.local');
  git('config', 'user.name', 'Data Guard Test');
  git('config', 'core.autocrlf', 'false');
  return { dir, git };
}

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function runGuard(dir) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: 'utf8', env: { ...process.env, DATA_GUARD_ROOT: dir }
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// 정상 프로젝트 파일 한 벌 - 어떤 경우에도 막히면 안 되는 것들.
function seedNormalFiles(dir) {
  write(dir, 'package.json', '{"name":"x"}\n');
  write(dir, 'manifest.json', '{"name":"y"}\n');
  write(dir, 'index.html', '<!doctype html><html></html>\n');
  write(dir, 'sw.js', "const CACHE_NAME = 'x-v1';\n");
  write(dir, 'js/01-core-state.js', 'const a = 1;\n');
  write(dir, 'data/ticker-master.json', '{"items":[]}\n');
  write(dir, 'test/merge.test.js', '// test\n');
  write(dir, 'e2e/50-excel.spec.js', '// e2e - 임시 xlsx는 os.tmpdir()에 만든다\n');
  write(dir, 'CLAUDE_HANDOVER.md', '# 인계장\n자산관리 엑셀 이야기가 본문에 나온다\n');
}

/* ═══════ 막아야 하는 것 ═══════ */

test('stage된 xlsx를 막는다 - 이번 사고와 같은 상황', () => {
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  write(dir, '자산관리_표준템플릿.xlsx', 'PK fake');
  git('add', '-A');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /Data Guard: FAIL/);
  assert.match(r.out, /자산관리_표준템플릿\.xlsx/);
  assert.match(r.out, /커밋하지 말고/);
});

test('xls / csv / zip도 막는다', () => {
  for (const name of ['보유내역.xls', 'export.csv', 'dump.zip']) {
    const { dir, git } = makeRepo();
    seedNormalFiles(dir);
    write(dir, name, 'x');
    git('add', '-A');
    const r = runGuard(dir);
    assert.strictEqual(r.code, 1, `${name}\n${r.out}`);
    assert.ok(r.out.includes(name), `${name} 이 목록에 나와야 한다\n${r.out}`);
  }
});

test('확장자가 안전해도 파일명이 사용자 백업이면 막는다', () => {
  // 엑셀이 아니어도 JSON 백업은 자산 전체를 담는다 - 확장자만으로는 못 잡는 구멍이다.
  for (const name of ['거래내역_백업_20260903.json', '자산관리_2026-09-06_v-1.json',
    'portfolio_backup.txt', '자산백업.dat', '포트폴리오구성_실행가이드_20260907.json']) {
    const { dir, git } = makeRepo();
    seedNormalFiles(dir);
    write(dir, name, '{}');
    git('add', '-A');
    const r = runGuard(dir);
    assert.strictEqual(r.code, 1, `${name}\n${r.out}`);
  }
});

test('하위 폴더에 숨겨도 막는다', () => {
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  write(dir, 'docs/archive/자산관리_구버전.xlsx', 'x');
  git('add', '-A');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /docs\/archive/);
});

test('이미 커밋되어 추적 중인 파일도 계속 알려준다', () => {
  // stage 검사를 우회해 들어간 경우. HEAD에서 지워도 히스토리에는 남으므로 계속 보여야 한다.
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  write(dir, '자산관리_표준템플릿.xlsx', 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'oops');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /이미 추적 중인 파일/);
  assert.match(r.out, /과거 커밋에는 남습니다/);
});

/* ═══════ 막으면 안 되는 것 ═══════ */

test('정상 프로젝트 파일만 stage하면 통과한다', () => {
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  git('add', '-A');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Data Guard: PASS/);
});

test('package.json / manifest.json / data\\/ticker-master.json은 절대 막지 않는다', () => {
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  // 정상 파일만 고쳐서 다시 stage
  write(dir, 'package.json', '{"name":"x","version":"2"}\n');
  write(dir, 'manifest.json', '{"name":"y","short_name":"z"}\n');
  write(dir, 'data/ticker-master.json', '{"items":[1,2,3]}\n');
  git('add', '-A');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
});

test('인계장처럼 본문에 자산관리/백업이라는 말이 들어간 파일은 막지 않는다', () => {
  // 파일 내용을 열지 않는다는 설계가 여기서 확인된다 - 파일명만 본다.
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  write(dir, 'CLAUDE_HANDOVER.md', '# 인계장\n자산관리_표준템플릿.xlsx 사고 기록\n거래내역 백업 정책\n');
  write(dir, 'docs/security.md', '실제 사용자 backup 파일은 커밋하지 않는다\n');
  git('add', '-A');
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
});

test('e2e가 임시 폴더에 만드는 xlsx는 저장소에 없으므로 영향이 없다', () => {
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  // 실제 e2e는 os.tmpdir()에 쓴다 - 저장소 안에 만들지 않는다는 사실을 고정한다.
  const tmpXlsx = path.join(os.tmpdir(), `e2e-fake-${process.pid}.xlsx`);
  fs.writeFileSync(tmpXlsx, 'x');
  try {
    git('add', '-A');
    const r = runGuard(dir);
    assert.strictEqual(r.code, 0, r.out);
  } finally { fs.unlinkSync(tmpXlsx); }
});

/* ═══════ 환경 방어 ═══════ */

test('추적되지 않은 데이터 파일은 알려주되 실패시키지 않는다', () => {
  // 로컬 폴더에 백업을 두는 것 자체는 문제가 아니다. add되지만 않으면 된다.
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  write(dir, '자산관리_내백업.xlsx', 'x'); // stage하지 않음
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /참고\(실패 아님\)/);
  assert.match(r.out, /자산관리_내백업\.xlsx/);
});

test('git 저장소가 아니면 건너뛴다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dataguard-nogit-${process.pid}-`));
  seedNormalFiles(dir);
  const r = runGuard(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /git 저장소가 아니어서/);
});

test('삭제만 stage한 경우는 막지 않는다', () => {
  // 사고 대응으로 데이터 파일을 지우는 커밋 자체는 통과해야 한다.
  const { dir, git } = makeRepo();
  seedNormalFiles(dir);
  write(dir, '자산관리_표준템플릿.xlsx', 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'oops');
  git('rm', '-q', '자산관리_표준템플릿.xlsx');
  const r = runGuard(dir);
  // 삭제는 --diff-filter=ACMR에 걸리지 않아 stage 검사는 통과하고,
  // 추적 목록에서도 빠졌으므로 전체가 통과한다.
  assert.strictEqual(r.code, 0, r.out);
});
