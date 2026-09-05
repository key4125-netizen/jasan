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
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
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

console.log('');
if (hasError) {
  console.error('Release Guard: FAIL');
  process.exit(1);
} else {
  console.log('Release Guard: PASS');
  process.exit(0);
}
