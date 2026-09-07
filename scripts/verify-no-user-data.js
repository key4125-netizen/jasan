// Data Guard - 실제 사용자 자산 파일이 저장소에 커밋되는 것을 막는다.
//
// [왜 있는가]
// 2026-07-28, 실제 자산 데이터가 담긴 엑셀 파일 하나가 이 저장소에 커밋됐고 GitHub Pages로
// 약 1시간 22분 공개 배포됐다. 53분 뒤 삭제 커밋이 있었지만 git 특성상 과거 커밋의 객체는 그대로
// 남는다. 계좌번호나 API 키가 아니라 "무엇을 얼마나 들고 있는가"였고, 그건 회전할 수도 무를 수도
// 없는 정보다. 그때 이 검사가 있었다면 커밋 자체가 막혔다.
//
// [Release Guard와 왜 분리했는가]
// Release Guard는 개발 중에 정상적으로 FAIL한다(APP_SHELL을 고치고 아직 버전을 안 올린 상태).
// 그 안에 데이터 유출 경고를 섞으면 "어차피 빨간색"이 되어 무시당한다 - 무시되는 경고는 방지
// 장치가 아니다. 그래서 두 검사는 목적도 실행 시점도 다르게 둔다.
//   Release Guard : 릴리스 직전 · FAIL = "버전을 올려라"
//   Data Guard    : 커밋 직전   · FAIL = "이 커밋을 하지 마라"
//
// [무엇을 하지 않는가]
// DLP 시스템이 아니다. 파일을 열지 않고, 내용을 분석하지 않고, 값을 출력하지 않는다.
// 파일명과 확장자만 본다 - 그것만으로 이번 사고는 막혔을 것이고, 그 이상은 오탐만 늘린다.
//
// 사용법: node scripts/verify-no-user-data.js   (또는 npm run data-guard)
// 통과 시 종료코드 0, 하나라도 걸리면 1.
const path = require('path');
const { execFileSync } = require('child_process');

// 테스트가 실제 코드를 실제 저장소 상태에 대고 돌릴 수 있도록 루트를 주입 가능하게 둔다
// (test/data-guard.test.js가 임시 git 저장소를 만들어 이 스크립트를 그대로 실행한다).
// 값을 주지 않으면 이 저장소를 본다 - Release Guard와 같은 방식이다.
const ROOT = process.env.DATA_GUARD_ROOT || path.join(__dirname, '..');

// 실제 사용자 데이터가 담겨 나오는 형식. 이 앱은 엑셀/CSV/JSON으로 백업을 만들고 그 파일이
// 저장소 루트에 떨어지기 쉽다.
const BLOCKED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.zip'];

// 파일명 패턴. 이 앱이 실제로 만들어 내려주는 파일 이름들이다 - js/04는 '포트폴리오구성_실행가이드_',
// js/06은 '거래내역_양식_', js/12는 자산 목록을 내보낸다. 사용자가 그걸 저장소 폴더에 두면 잡힌다.
const BLOCKED_NAME_PATTERNS = [
  /자산관리/i, /거래내역/i, /포트폴리오구성_/i, /백업/i, /backup/i
];

// [오탐 방지] 위 규칙에 걸리지만 저장소에 정상적으로 있어야 하는 파일. 새로 추가할 때는
// "이 파일에 실제 사용자 데이터가 없다"를 확인하고 넣는다.
const ALLOWLIST = [
  'package.json', 'package-lock.json', 'manifest.json',
  'data/ticker-master.json'
];

let hasError = false;
const fail = (msg) => { console.error(`✗ ${msg}`); hasError = true; };
const pass = (msg) => console.log(`✓ ${msg}`);
const info = (msg) => console.log(`  ${msg}`);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// [중요] git은 기본 설정(core.quotepath=true)에서 한글 같은 비ASCII 경로를 따옴표로 감싸고 바이트를
// 8진 이스케이프로 바꿔서 준다. 그대로 받으면 확장자가 `.xlsx"`가 되어 검사를 그냥 통과해 버린다 -
// 이번 사고의 파일 이름이 정확히 한글이었으므로, 가장 중요한 경로에서만 조용히 뚫리는 형태다
// (test/data-guard.test.js가 이 구멍을 실제로 잡아냈다). -z는 NUL로 구분하고 이스케이프를 하지
// 않으므로 원본 경로가 그대로 온다.
function gitFileList(args) {
  try {
    return git([...args, '-z']).split('\0').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// 경로 구분자는 git이 항상 '/'로 준다. 폴더 안에 있어도 파일명만 보고 판단한다.
function violation(file) {
  const normalized = file.replace(/\\/g, '/');
  if (ALLOWLIST.includes(normalized)) return null;
  const base = normalized.split('/').pop();
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')).toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.includes(ext)) return `확장자 ${ext}`;
  const hit = BLOCKED_NAME_PATTERNS.find((re) => re.test(base));
  if (hit) return `파일명 패턴 ${hit}`;
  return null;
}

function report(label, files, hint) {
  const bad = files.map((f) => ({ file: f, why: violation(f) })).filter((x) => x.why);
  if (bad.length === 0) return false;
  fail(`${label} ${bad.length}건 - ${hint}`);
  bad.forEach((b) => info(`- ${b.file}  (${b.why})`));
  return true;
}

let gitReady = true;
try { git(['rev-parse', '--git-dir']); } catch { gitReady = false; }

if (!gitReady) {
  info('참고(실패 아님): git 저장소가 아니어서 Data Guard를 건너뜁니다.');
} else {
  // --- 1) 커밋하려고 stage한 파일 ---
  // 이번 커밋을 막는 것이 이 검사의 본래 목적이다.
  const staged = gitFileList(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  const stagedBad = report('stage된 파일에 실제 사용자 데이터로 보이는 것이 있습니다',
    staged, '커밋하지 말고 `git restore --staged <파일>`로 빼낸 뒤 .gitignore를 확인하세요');
  if (!stagedBad) pass(`stage된 파일 ${staged.length}개 - 사용자 데이터 파일 없음`);

  // --- 2) 이미 추적 중인 파일 ---
  // 1)을 우회해 이미 들어간 경우를 다음 실행 때 잡는다. 지금 저장소는 깨끗하지만,
  // 한 번 들어가면 삭제해도 히스토리에 남으므로 "들어간 사실" 자체를 계속 알려야 한다.
  const tracked = gitFileList(['ls-files']);
  const trackedBad = report('이미 추적 중인 파일에 실제 사용자 데이터로 보이는 것이 있습니다',
    tracked, 'HEAD에서 지워도 과거 커밋에는 남습니다 - 대응 방법을 먼저 정하세요');
  if (!trackedBad) pass(`추적 중인 파일 ${tracked.length}개 - 사용자 데이터 파일 없음`);

  // --- 3) 추적되지 않은 채 작업 폴더에 있는 파일(정보성) ---
  // .gitignore가 걸러주고 있다면 여기 나타나지 않는다. 나타난다면 실수로 add될 수 있다는 뜻이라
  // 알려주기만 하고 실패로 만들지는 않는다 - 로컬에 백업 파일을 두는 것 자체는 문제가 아니다.
  const untracked = gitFileList(['ls-files', '--others', '--exclude-standard']);
  const looseBad = untracked.filter((f) => violation(f));
  if (looseBad.length > 0) {
    info(`참고(실패 아님): .gitignore에 걸리지 않은 데이터 파일 ${looseBad.length}건이 작업 폴더에 있습니다 - 실수로 add되지 않도록 확인하세요.`);
    looseBad.forEach((f) => info(`- ${f}`));
  }
}

console.log('');
if (hasError) {
  console.error('Data Guard: FAIL');
  process.exit(1);
} else {
  console.log('Data Guard: PASS');
  process.exit(0);
}
