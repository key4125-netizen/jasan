// [FUTURE-P1] Monte Carlo 어댑터(js/16) 테스트용 로더 - 이 파일 자체는 테스트가 아니다
// (`npm test`의 glob은 `test/*.test.js`라 여기에 걸리지 않는다).
//
// 왜 vm 샌드박스인가:
//   test/risk-sandbox.js와 완전히 같은 이유다. js/16의 buildMonteCarloInputFromState()는 state와
//   js/01/04/05/09/15/21의 전역 함수를 그대로 쓰는 브라우저 스크립트라, 테스트를 위해 production
//   코드에 export를 덧붙이지 않고 원본을 index.html과 같은 순서로 vm 컨텍스트에 로드한다
//   (새 의존성 0개, production surface 증가 0).
//
// 외부 데이터 독립성:
//   fetch는 항상 거부하도록 스텁했고, 가격 이력은 setDailyCloses()로만 주입한다 - 네트워크/현재
//   시세/오늘 날짜에 의존하지 않는다.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { stubEl } = require('./risk-sandbox.js');

const JS_DIR = path.join(__dirname, '..', 'js');
// index.html의 실제 로드 순서 그대로. 어댑터가 실제로 의존하는 파일만 싣는다(11~14/17~19/22는
// Worker/DOM 렌더 전용이라 어댑터 경로와 무관하다).
const LOAD_ORDER = [
  '01-core-state.js', '02-dashboard-kpi.js', '03-filters-charts-tabs.js',
  '04-rebalancing.js', '05-future-projection.js', '06-transactions.js',
  '07-table-render-modals.js', '08-detail-modal-fx.js', '09-price-fx-risk-engine.js',
  '10-risk-translation-alerts.js', '15-monte-carlo-engine.js', '16-monte-carlo-adapter.js',
  '20-inflation-transform.js', '21-safety-layer.js'
];

function loadAdapterSandbox() {
  const sandbox = {
    console, Math, Date, JSON, Intl, Number, String, Boolean, Object, Array, Set, Map, WeakMap,
    Float64Array, Int32Array, Uint32Array, ArrayBuffer, DataView,
    RegExp, Error, TypeError, Promise, Symbol, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent,
    decodeURIComponent, AbortController: global.AbortController, structuredClone: global.structuredClone,
    performance: { now: () => 0 },
    document: {
      getElementById() { return stubEl(); }, querySelector() { return stubEl(); },
      querySelectorAll() { return []; }, addEventListener() {}, createElement() { return stubEl(); },
      body: stubEl(), documentElement: stubEl()
    },
    window: { addEventListener() {}, visualViewport: null, matchMedia() { return { matches: false, addEventListener() {} }; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { userAgent: 'node' },
    history: { pushState() {}, replaceState() {}, back() {}, go() {} },
    location: { href: 'http://localhost/', hash: '', search: '', pathname: '/' },
    lucide: { createIcons() {} },
    crypto: (() => { let n = 0; return { randomUUID: () => `test-asset-${String(++n).padStart(4, '0')}` }; })(),
    fetch() { return Promise.reject(new Error('[FUTURE-P1] 테스트에서 네트워크 호출이 발생했습니다')); },
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    XLSX: {}, Chart: function Chart() {}
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  LOAD_ORDER.forEach((file) => {
    const src = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInContext(src, sandbox, { filename: file });
  });

  // [const 브리지] risk-sandbox.js와 같은 이유 - vm 컨텍스트의 const/let은 sandbox 객체의
  // 프로퍼티가 되지 않으므로(function 선언만 프로퍼티가 된다) 필요한 것만 한 번 얹어 준다.
  const BRIDGED = [
    'state', 'REBALANCE_OWNERS', 'TAX_ADVANTAGED_ACCOUNT_TYPES', 'TAX_ADVANTAGED_RISK_SHARE',
    'MILESTONE_YEARS', 'SCENARIO_RATE_PRESETS'
  ];
  vm.runInContext(BRIDGED.map((n) => `try{globalThis[${JSON.stringify(n)}]=${n};}catch(e){}`).join('\n'), sandbox, { filename: 'bridge' });
  sandbox.evalInSandbox = (code) => vm.runInContext(code, sandbox, { filename: 'eval' });

  // 가격 이력 주입 - js/09의 getCachedDailyCloses()(하루 1회 캐시 + Yahoo 조회)를 fixture 조회로
  // 바꿔치기한다. 등록되지 않은 티커는 null을 돌려주므로 "가격 이력 없음" 경로도 그대로 재현된다.
  const closesByTicker = new Map();
  sandbox.getCachedDailyCloses = async (yahooTicker) => closesByTicker.get(yahooTicker) || null;
  sandbox.setDailyCloses = (yahooTicker, data) => { closesByTicker.set(yahooTicker, data); };
  sandbox.clearDailyCloses = () => { closesByTicker.clear(); };

  return sandbox;
}

module.exports = { loadAdapterSandbox };
