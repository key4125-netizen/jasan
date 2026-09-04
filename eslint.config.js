// ESLint 설정 (Node.js 검증환경 강화 - 기능 코드 아님) - flat config(ESLint v9+).
//
// [핵심 설계 결정] 이 앱은 22개 js/*.js 파일을 <script> 태그로 순서대로 로드하는 고전(non-module)
// 구조다 - 한 파일의 top-level function/const/let/var 선언은 실제로 다른 모든 파일에서 참조 가능한
// "공유 전역"이다(별개 <script> 태그들이 브라우저에서 하나의 top-level 렉시컬 스코프를 공유하기
// 때문). ESLint는 파일 단위로 분석하므로, 이 공유 전역 목록을 만들어주지 않으면 no-undef가 실제로는
// 정상 참조인 수백 개를 전부 "정의되지 않음"으로 오탐한다 - 그래서 아래 collectProjectGlobals()가
// js/ 전체를 스캔해 top-level 선언을 모아 전역으로 등록한다(실행 시점에 계산 - 파일이 바뀌면 자동으로
// 최신 상태 유지, 별도 생성 파일을 관리할 필요 없음).
//
// [최소 구성 원칙] 레거시 코드에 수백 개의 경고를 만들지 않기 위해 처음엔 실질적 오류 탐지 규칙만
// 켠다(eslint:recommended 그대로 - no-undef/no-dupe-keys/no-unreachable/no-cond-assign/
// no-const-assign 등, 전부 "진짜 버그일 가능성이 높은" 규칙들). no-unused-vars처럼 콜백 인자 등에서
// 대량 오탐을 내기 쉬운 규칙은 시작 단계에서 끈다.

const fs = require('node:fs');
const path = require('node:path');
const js = require('@eslint/js');
const globals = require('globals');

function collectProjectGlobals() {
  const jsDir = path.join(__dirname, 'js');
  const names = new Set();
  // 최상위(들여쓰기 없는) function/const/let/var 선언만 수집한다 - 중첩 스코프 변수는 이미 그
  // 파일 안에서만 유효하므로 전역으로 취급할 필요가 없다.
  const pattern = /^(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/;
  fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).forEach((file) => {
    const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
    src.split('\n').forEach((line) => {
      const m = pattern.exec(line);
      if (m) names.add(m[1] || m[2]);
    });
  });
  const out = {};
  names.forEach((n) => { out[n] = 'writable'; });
  return out;
}

// [외부 CDN 라이브러리 전역 - index.html에서 확인] Tailwind는 클래스명만 쓰므로 전역 불필요.
const externalLibraryGlobals = {
  Chart: 'readonly', // chart.js
  ChartDataLabels: 'readonly', // chartjs-plugin-datalabels
  lucide: 'readonly', // lucide 아이콘
  XLSX: 'readonly', // xlsx.full.min.js
  Hammer: 'readonly', // hammerjs(차트 줌/팬)
};

// [Node/Browser 겸용 export 가드] 모든 js/15~22 파일이 끝에서
// `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }` 패턴을 쓴다
// (merge.test.js부터 이어진 이 프로젝트의 표준 패턴) - 브라우저에서는 이 분기가 조용히 건너뛰어지고
// Node(test/*.test.js)에서만 실행된다. module/require/exports 자체는 브라우저 전역이 아니므로
// globals.browser에 없어 no-undef가 오탐한다.
const nodeExportGuardGlobals = {
  module: 'readonly',
  require: 'readonly',
  exports: 'writable',
};

const projectGlobals = collectProjectGlobals();

module.exports = [
  js.configs.recommended,
  {
    // 메인 스레드 스크립트(js/17 Worker 전용 파일 제외) - window/document 등 브라우저 전역 + 위에서
    // 수집한 프로젝트 공유 전역 + CDN 라이브러리 전역.
    files: ['js/**/*.js'],
    ignores: ['js/17-monte-carlo-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...projectGlobals,
        ...externalLibraryGlobals,
        ...nodeExportGuardGlobals,
      },
    },
    rules: {
      // [최소 구성 - 1차] 콜백 인자/의도적 미사용 변수가 많은 기존 코드 스타일과 충돌해 대량 오탐을
      // 낼 수 있어 시작 단계에서는 끈다. 실질적 오류 탐지(no-undef 등)는 eslint:recommended 그대로 유지.
      'no-unused-vars': 'off',
      // [핵심 - 오탐 방지] "이 파일이 자기 자신의 top-level 선언을 하는 것"을 "이미 전역으로 등록된
      // 이름을 재선언했다"고 오해하지 않게 한다 - builtinGlobals:false는 진짜 파일 내부 중복 선언
      // (예: 한 파일 안에서 let x를 두 번)만 계속 잡아낸다(no-redeclare 자체를 끄지 않음).
      'no-redeclare': ['error', { builtinGlobals: false }],
      // [범위 밖 - 최소 구성 원칙] ESLint v10의 eslint:recommended에 새로 포함된 스타일 규칙 -
      // catch(e){ throw new Error(...) }처럼 원본 에러를 { cause } 없이 다시 던지는 패턴을 잡는다.
      // 이 코드베이스 전반의 기존 관례(예: js/09 fetchFx 계열)이고, 사용자가 이번 단계에서 요청한
      // 탐지 대상(undefined 변수/함수, 중복 선언, 도달불가 코드, 의심스러운 조건 등)에 해당하지
      // 않는 별개의 스타일 권고라 최소 구성 단계에서는 끈다(보고서 D 섹션에 근거 기록).
      'preserve-caught-error': 'off',
    },
  },
  {
    // [js/17 - Web Worker 전용 스코프] window/document가 없고 self/importScripts만 있다. importScripts로
    // js/15·js/16만 불러오므로 그 두 파일의 전역만 있으면 충분하지만, 프로젝트 전역 전체를 넣어도
    // "실제로 쓰이지 않는 전역이 등록되어 있다"는 무해한 상태일 뿐이라 안전하게 전체를 재사용한다.
    files: ['js/17-monte-carlo-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.worker,
        ...projectGlobals,
        ...nodeExportGuardGlobals,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-redeclare': ['error', { builtinGlobals: false }],
      // [범위 밖 - 최소 구성 원칙] ESLint v10의 eslint:recommended에 새로 포함된 스타일 규칙 -
      // catch(e){ throw new Error(...) }처럼 원본 에러를 { cause } 없이 다시 던지는 패턴을 잡는다.
      // 이 코드베이스 전반의 기존 관례(예: js/09 fetchFx 계열)이고, 사용자가 이번 단계에서 요청한
      // 탐지 대상(undefined 변수/함수, 중복 선언, 도달불가 코드, 의심스러운 조건 등)에 해당하지
      // 않는 별개의 스타일 권고라 최소 구성 단계에서는 끈다(보고서 D 섹션에 근거 기록).
      'preserve-caught-error': 'off',
    },
  },
  {
    // [Node 스크립트 - test/, scripts/, 설정파일 자신] CommonJS + Node 전역.
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // [Playwright E2E 파일 - Node + 브라우저 전역 혼재] 이 파일들은 Node에서 실행되는 테스트 러너
    // 코드와, `page.evaluate(() => {...})` 콜백처럼 실제로는 브라우저 페이지 안에서 실행되는 코드가
    // 한 파일에 섞여 있다(예: fixtures.js의 seedPortfolio가 state/makeAsset/persistAssets 등 앱의
    // 공유 전역을 evaluate 콜백 안에서 직접 참조) - 그래서 Node 전역과 프로젝트 공유 전역(js/**/*.js
    // 스캔 결과)을 모두 허용한다.
    files: ['e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...projectGlobals },
    },
  },
  {
    // [브라우저 Service Worker - sw.js] self/caches/fetch 등은 js/**/*.js(window/document 있는 메인
    // 스레드)와 다른 Service Worker 전용 전역이다. globals 패키지의 serviceworker 세트를 그대로 쓴다.
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: {
      'no-unused-vars': 'off',
      // [false positive 확인됨 - sw.js:477 isNetworkFirst] try{...} catch{return} 다음의
      // if(isNetworkFirst){...}(485행)에서 실제로 읽히는데도 no-useless-assignment가 이 제어흐름을
      // 추적하지 못해 "사용되지 않는 할당"으로 오탐한다(ESLint v10 신규 규칙의 한계) - 기능 코드는
      // 정상이라 고치지 않고, sw.js에 한정해서만 이 규칙을 끈다(다른 규칙/다른 파일에는 영향 없음).
      'no-useless-assignment': 'off',
    },
  },
  {
    // [Cloudflare Worker 배포 스크립트] Response/Request/URL/fetch/Headers 등 Workers 런타임 전역 -
    // Service Worker 전역 세트와 대부분 겹쳐 그대로 재사용한다. 이 앱의 계산 로직(js/)과는 무관한
    // 별도 배포용 프록시 스크립트다.
    files: ['cloudflare-worker-*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module', // export default {fetch(...)} 형식(Cloudflare Workers 모듈 문법) 사용
      globals: { ...globals.serviceworker },
    },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    // node_modules/생성물은 검사 대상에서 제외.
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
];
