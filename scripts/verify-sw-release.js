// Phase 22 STEP 15 - Release/Service Worker Guard
// Service Worker 자체(install/activate/fetch 전략)는 재설계하지 않는다 - 이 스크립트는 오직 "다음
// 버전을 준비할 때 사람이 실수하기 쉬운 것"만 기계적으로 검사한다(Phase 21 Part Q에서 지적된
// "v210에서 파일이 추가/삭제되면 생기는 문제"의 재발 방지용 체크리스트를 스크립트로 옮긴 것).
//
// 사용법: node scripts/verify-sw-release.js
// 통과 시 종료코드 0, 하나라도 실패하면 1(CI/사전 배포 점검에 그대로 연결 가능하도록).
//
// 검사 항목:
//   1) sw.js의 CACHE_NAME 버전과 index.html의 appVersionLabel 표시 버전이 일치하는가
//   2) APP_SHELL에 나열된 모든 항목이 실제로 디스크에 존재하는가(없으면 install의 cache.addAll()이
//      원자적으로 통째 실패한다 - Phase 20에서 실측한 실패 모드)
//   3) js/ 폴더의 실제 파일 중 APP_SHELL에 없는 것이 있는가(정보성 안내 - 실패로 취급하지 않음,
//      "런타임 캐싱으로 커버되는 파일"이 있는 것은 기존부터 의도된 설계라 PM 판단 필요 항목일 뿐임)
//   4) [Phase 51] APP_SHELL 파일이 바뀌었는데 CACHE_NAME은 그대로인가
//      Phase 50에서 실제로 벌어진 일이다: v213 이후 다섯 Phase(47-E/47-F/48-A/49/50)가 index.html과
//      js/01·05·06·07·08·12를 바꿨는데 CACHE_NAME이 v213에 머물러, cache-first 전략상 그 수정들이
//      기존 사용자에게 한 건도 전달되지 않고 있었다(실제 브라우저로 확인). 1)번 검사는 두 버전
//      문자열이 서로 "일치"하는지만 보므로 둘 다 v213으로 멈춰 있는 이 상태를 통과시킨다.
//      사람의 기억 대신 이 검사가 막는다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 테스트가 실제 Release Guard 코드를 실제 저장소 상태에 대고 돌릴 수 있도록 루트를 주입 가능하게 둔다
// (test/sw-release-guard.test.js가 임시 git 저장소를 만들어 이 스크립트를 그대로 실행한다).
// 값을 주지 않으면 예전과 완전히 동일하게 이 저장소를 본다.
const ROOT = process.env.SW_RELEASE_GUARD_ROOT || path.join(__dirname, '..');
let hasError = false;

function fail(msg) {
  console.error(`✗ ${msg}`);
  hasError = true;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}
function info(msg) {
  console.log(`  ${msg}`);
}

const swPath = path.join(ROOT, 'sw.js');
const htmlPath = path.join(ROOT, 'index.html');
const swSource = fs.readFileSync(swPath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

// --- 1) CACHE_NAME 버전 <-> appVersionLabel 일치 ---
const cacheNameMatch = swSource.match(/const CACHE_NAME = ['"]([^'"]+)['"]/);
if (!cacheNameMatch) {
  fail('sw.js에서 CACHE_NAME 선언을 찾지 못했습니다.');
} else {
  const cacheName = cacheNameMatch[1];
  const cacheVersion = (cacheName.match(/-v(\d+)$/) || [])[1];
  const labelMatch = htmlSource.match(/id="appVersionLabel"[^>]*>v(\d+)</);
  const labelVersion = labelMatch ? labelMatch[1] : null;
  if (!cacheVersion) {
    fail(`CACHE_NAME("${cacheName}")에서 버전 번호(-vNN)를 추출하지 못했습니다.`);
  } else if (!labelVersion) {
    fail('index.html에서 appVersionLabel의 버전 표시(vNN)를 찾지 못했습니다.');
  } else if (cacheVersion !== labelVersion) {
    fail(`버전 불일치: sw.js CACHE_NAME은 v${cacheVersion}인데 index.html appVersionLabel은 v${labelVersion}입니다.`);
  } else {
    pass(`버전 일치 확인: CACHE_NAME/appVersionLabel 모두 v${cacheVersion}`);
  }
}

// --- 2) APP_SHELL 항목이 전부 실제로 존재하는가 ---
const appShellMatch = swSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!appShellMatch) {
  fail('sw.js에서 APP_SHELL 배열을 찾지 못했습니다.');
} else {
  const entries = [...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const missing = [];
  entries.forEach((entry) => {
    if (entry === './') return; // 루트(index.html과 동일 대상) - 별도 파일 없음
    const filePath = path.join(ROOT, entry.replace(/^\.\//, ''));
    if (!fs.existsSync(filePath)) missing.push(entry);
  });
  if (missing.length > 0) {
    fail(`APP_SHELL에 실제로 존재하지 않는 파일이 있습니다(install 시 cache.addAll() 전체 실패 위험): ${missing.join(', ')}`);
  } else {
    pass(`APP_SHELL ${entries.length}개 항목 전부 디스크에 존재함`);
  }
}

// --- 3) js/ 폴더 중 APP_SHELL에 없는 파일 안내(정보성, 실패 아님) ---
if (appShellMatch) {
  const entries = [...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const shellJsFiles = new Set(entries.filter((e) => e.startsWith('./js/')).map((e) => e.replace('./js/', '')));
  const actualJsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const notInShell = actualJsFiles.filter((f) => !shellJsFiles.has(f));
  if (notInShell.length > 0) {
    info(`참고(실패 아님): js/ 폴더에 있지만 APP_SHELL에는 없는 파일 ${notInShell.length}개 - 런타임 캐싱(첫 요청 시 network-then-cache)으로 커버됨, 완전 오프라인 최초 실행 시에만 영향: ${notInShell.join(', ')}`);
  } else {
    pass('js/ 폴더의 모든 파일이 APP_SHELL에 포함되어 있음');
  }
}

/* --- 4) [Phase 51] APP_SHELL이 바뀌었는데 CACHE_NAME은 그대로인가 ---
 *
 * 판단 방법: "지금 CACHE_NAME이 커밋된 시점" 이후로 APP_SHELL 파일의 내용이 바뀌었는가.
 * 커밋 메시지에 'release'가 들어갔는지 같은 취약한 방법을 쓰지 않는다 - 실제 파일 내용을 본다.
 *
 * 오탐 방지: 이 저장소는 주석 밀도가 높아서 "주석만 고친 커밋"이 흔하다. 주석/공백만 달라진 파일로
 * 릴리스를 막으면 검사가 곧 무시당하게 된다. 그래서 .js는 espree로 토큰 스트림을 뽑아 비교하고
 * (주석은 토큰이 아니므로 자연히 빠진다), .html은 script/style 바깥의 HTML 주석만 걷어낸 뒤 비교한다.
 * 토큰이 다르면 코드가 다른 것이고, 토큰이 같으면 주석/공백만 다른 것이다.
 * 테스트/문서/e2e/.claude 파일은 애초에 APP_SHELL에 없으므로 이 검사의 대상이 아니다.
 */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// 줄바꿈 방식(LF/CRLF)은 내용 차이가 아니다 - git에 저장된 것과 디스크에 체크아웃된 것이 다를 수 있다.
const normalizeEol = (s) => s.replace(/\r\n/g, '\n');

// script/style 블록 안쪽은 건드리지 않는다 - 그 안의 '<!--'는 HTML 주석이 아닐 수 있다.
function stripHtmlComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const lower = src.slice(i).toLowerCase();
    if (lower.startsWith('<script')) {
      const end = lower.indexOf('</script>');
      const stop = end === -1 ? src.length : i + end + '</script>'.length;
      out += src.slice(i, stop); i = stop; continue;
    }
    if (lower.startsWith('<style')) {
      const end = lower.indexOf('</style>');
      const stop = end === -1 ? src.length : i + end + '</style>'.length;
      out += src.slice(i, stop); i = stop; continue;
    }
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end === -1 ? src.length : end + 3; continue;
    }
    out += src[i]; i++;
  }
  return out;
}

function normalizeForCompare(file, source) {
  const src = normalizeEol(source);
  if (file.endsWith('.js')) {
    try {
      // eslint가 쓰는 파서다 - 이 저장소에 이미 설치되어 있다. 없으면 아래 catch로 원본 비교(보수적).
      const espree = require('espree');
      return espree.tokenize(src, { ecmaVersion: 2022, comment: false })
        .map((t) => `${t.type}\u0000${t.value}`).join('\u0001');
    } catch {
      return src.replace(/\s+/g, ' ').trim();
    }
  }
  if (file.endsWith('.html')) return stripHtmlComments(src).replace(/\s+/g, ' ').trim();
  return src.replace(/\s+/g, ' ').trim();
}

if (cacheNameMatch && appShellMatch) {
  const cacheName = cacheNameMatch[1];
  const shellFiles = [...new Set([...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    // './'는 index.html과 같은 대상이다(둘 다 나열되어 있어 중복을 없앤다).
    .map((e) => (e === './' ? 'index.html' : e.replace(/^\.\//, ''))))];

  let gitReady = true;
  try { git(['rev-parse', '--git-dir']); } catch { gitReady = false; }

  if (!gitReady) {
    info('참고(실패 아님): git 저장소가 아니어서 APP_SHELL 변경 감지 검사를 건너뜁니다.');
  } else {
    // 지금 CACHE_NAME 문자열이 sw.js에 "등장하게 된" 커밋 = 마지막 버전 bump 커밋.
    // 그 문자열이 지금도 남아 있으므로, 이 pickaxe(-S)의 최신 결과는 항상 "추가한 커밋"이다.
    let bumpCommit = '';
    try {
      bumpCommit = git(['log', '-1', '--format=%H', `-S${cacheName}`, '--', 'sw.js']).trim();
    } catch { bumpCommit = ''; }

    if (!bumpCommit) {
      // 이력에 없는 CACHE_NAME = 지금 막 올린 것이다. 그게 정확히 우리가 바라는 상태다.
      pass(`CACHE_NAME(${cacheName})이 아직 커밋되지 않았습니다 - 이번에 버전을 올리는 중으로 봅니다.`);
    } else {
      let changed;
      try {
        changed = git(['diff', '--name-only', bumpCommit, '--', ...shellFiles])
          .split('\n').map((s) => s.trim()).filter(Boolean);
      } catch { changed = []; }

      // 내용이 실제로 달라진 것만 남긴다(주석/공백만 바뀐 파일은 사용자에게 가는 동작이 같다).
      const real = changed.filter((file) => {
        let before;
        try { before = git(['show', `${bumpCommit}:${file}`]); } catch { return true; } // 새로 생긴 파일
        let after;
        try { after = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return true; } // 지워진 파일
        return normalizeForCompare(file, before) !== normalizeForCompare(file, after);
      });

      const commentOnly = changed.filter((f) => !real.includes(f));
      if (real.length > 0) {
        fail(`APP_SHELL 파일이 ${cacheName} 이후 바뀌었는데 CACHE_NAME이 그대로입니다 - cache-first라 이 변경은 `
          + `기존 사용자에게 전달되지 않습니다(Phase 50에서 실제로 다섯 Phase가 이렇게 묻혔습니다). `
          + `sw.js의 CACHE_NAME과 index.html의 appVersionLabel을 함께 올려주세요. `
          + `바뀐 파일: ${real.join(', ')}`);
      } else if (commentOnly.length > 0) {
        pass(`APP_SHELL 변경 감지: ${cacheName} 이후 주석/공백만 바뀐 파일 ${commentOnly.length}개 - 버전 유지 가능`);
      } else {
        pass(`APP_SHELL 변경 감지: ${cacheName} 이후 바뀐 APP_SHELL 파일 없음`);
      }
    }
  }
}

console.log('');
if (hasError) {
  console.error('Release Guard: FAIL');
  process.exit(1);
} else {
  console.log('Release Guard: PASS');
  process.exit(0);
}
