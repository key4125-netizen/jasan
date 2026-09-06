// [Phase 38] Risk 회귀 테스트용 로더 - 이 파일 자체는 테스트가 아니다(`npm test`의 glob은
// `test/*.test.js`라 여기에 걸리지 않는다).
//
// 왜 vm 샌드박스인가:
//   js/09(리스크 엔진)와 js/10(Risk Rule/문구)은 번들러 없이 <script> 태그로 로드되는 브라우저
//   스크립트라 js/15/20/21처럼 module.exports 블록이 없다. 테스트를 위해 소스에 export 블록을
//   덧붙이는 방법도 있지만, Phase 38의 원칙은 "Risk 코드를 한 줄도 건드리지 않고 현재 동작을
//   고정한다"이므로 원본을 그대로 읽어 Node 내장 vm 컨텍스트에서 실행한다(새 의존성 0개).
//   index.html과 동일한 순서(01 → 07 → 09 → 10)로 로드하므로 js/01의 실제 num/calcRow/sanitizeTicker/
//   fmtNum을 그대로 쓴다 - 헬퍼를 가짜로 다시 구현하지 않는다.
//
// 외부 데이터 독립성(PM 지시 §12):
//   fetch를 항상 거부하도록 스텁했고, 가격 이력은 loadRiskSandbox()가 돌려주는
//   setDailyCloses()로만 주입한다. 네트워크/현재 시세/현재 환율/오늘 날짜에 의존하지 않는다.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DOM 스텁 - js/10 최상단에 addEventListener 등록이 여러 개 있어 로드 자체가 DOM을 요구한다.
// 값을 반환할 필요가 있는 곳만 최소로 채운다(리스크 계산은 DOM을 전혀 읽지 않는다).
function stubEl() {
  const el = {
    value: '', textContent: '', innerHTML: '', outerHTML: '', dataset: {}, style: {},
    scrollWidth: 0, clientWidth: 0, offsetHeight: 0, scrollHeight: 0, checked: false, hidden: false,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, remove() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; }, closest() { return null; },
    scrollIntoView() {}, focus() {}, blur() {}, click() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  };
  return el;
}

const JS_DIR = path.join(__dirname, '..', 'js');
// js/07은 js/10의 computeRiskClassifiedAssets()가 소유자 정렬에 쓰는 ownerRank()를 정의한다.
// 실제 의존성이므로 스텁으로 흉내내지 않고 원본 파일을 그대로 로드한다(브라우저와 같은 순서).
// js/15는 js/09가 [Phase 39-B]에서 재사용하는 dateAlignedReturns()를 제공한다.
// index.html의 실제 로드 순서(09 → 10 → 15)를 그대로 따른다 - 함수 선언이라 호출 시점에는
// 이미 전역에 있으므로 브라우저와 동일하게 동작한다.
const LOAD_ORDER = [
  '01-core-state.js', '07-table-render-modals.js',
  '09-price-fx-risk-engine.js', '10-risk-translation-alerts.js',
  '15-monte-carlo-engine.js'
];

function loadRiskSandbox() {
  const sandbox = {
    console, Math, Date, JSON, Intl, Number, String, Boolean, Object, Array, Set, Map, WeakMap,
    RegExp, Error, TypeError, Promise, Symbol, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent,
    decodeURIComponent, AbortController: global.AbortController, structuredClone: global.structuredClone,
    document: {
      getElementById() { return stubEl(); }, querySelector() { return stubEl(); },
      querySelectorAll() { return []; }, addEventListener() {}, createElement() { return stubEl(); },
      body: stubEl(), documentElement: stubEl()
    },
    window: { addEventListener() {}, visualViewport: null, matchMedia() { return { matches: false, addEventListener() {} }; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { userAgent: 'node' },
    lucide: { createIcons() {} },
    // makeAsset()의 genId()가 쓴다. 실제 randomUUID를 쓰면 테스트마다 값이 달라지므로 결정적
    // 카운터로 대체한다(자산 id는 리스크 계산에 전혀 쓰이지 않는다 - 병합 키는 야후 티커다).
    crypto: (() => { let n = 0; return { randomUUID: () => `test-asset-${String(++n).padStart(4, '0')}` }; })(),
    // 네트워크 완전 차단 - 테스트가 외부 시세에 의존하면 즉시 실패해서 드러나게 한다.
    fetch() { return Promise.reject(new Error('[Phase 38] 테스트에서 네트워크 호출이 발생했습니다')); },
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

  // [const 브리지] vm 컨텍스트에서 `const`/`let` 선언은 전역 렉시컬 스코프에 들어가고 sandbox
  // 객체의 프로퍼티가 되지 않는다(`function` 선언만 프로퍼티가 된다). 테스트가 state와 임계값
  // 상수를 읽어야 하므로, 컨텍스트 안에서 한 번 globalThis에 얹어 준다 - 값을 복사하는 게 아니라
  // 같은 객체 참조를 그대로 노출하므로 state를 수정하면 js/09/10이 즉시 그 값을 본다.
  const BRIDGED = [
    'state', 'INDEX_TICKERS', 'MACRO_TICKERS', 'RISK_ELIGIBLE_CATEGORIES',
    'NASDAQ100_STYLE_TICKERS', 'DOW_STYLE_TICKERS', 'SECTOR_MAP', 'ETF_HOLDINGS_MAP',
    'COVID_CRASH_BENCHMARK_DROP_PCT', 'RATE_HIKE_2022_BENCHMARK_DROP_PCT',
    'CORE_MACRO_LABELS', 'MACRO_TREND_THRESHOLDS', 'TAX_ADVANTAGED_ACCOUNT_TYPES',
    'NON_TRADABLE_CATEGORIES', 'REBALANCE_OWNERS'
  ];
  vm.runInContext(BRIDGED.map((n) => `try{globalThis[${JSON.stringify(n)}]=${n};}catch(e){}`).join('\n'), sandbox, { filename: 'bridge' });
  // 임의 표현식 평가 - 브리지 목록에 없는 값을 테스트에서 직접 꺼내야 할 때 쓴다.
  sandbox.evalInSandbox = (code) => vm.runInContext(code, sandbox, { filename: 'eval' });

  // 가격 이력 주입 - js/09의 getCachedDailyCloses()를 fixture 조회로 바꿔치기한다(원본 함수는
  // 하루 1회 캐시 + Yahoo 조회라 테스트에서 쓸 수 없다). 등록되지 않은 티커는 null을 돌려주므로
  // "가격 이력 없음" 경로도 그대로 재현된다.
  const closesByTicker = new Map();
  sandbox.getCachedDailyCloses = async (yahooTicker) => closesByTicker.get(yahooTicker) || null;
  sandbox.setDailyCloses = (yahooTicker, data) => { closesByTicker.set(yahooTicker, data); };
  sandbox.clearDailyCloses = () => { closesByTicker.clear(); };

  return sandbox;
}

// [자산 fixture] js/01의 makeAsset()을 쓰지 않는 이유: makeAsset → getTickerRole →
// buildTickerRoleKey → buildCustomRateKey(js/05)로 이어지는데, js/05는 js/04를 요구해서 리스크
// 스택만 로드하는 이 샌드박스에서는 체인이 끊긴다. 리스크 엔진은 makeAsset을 전혀 호출하지 않고
// 아래 필드만 읽으므로(calcRow는 실제 js/01 구현을 그대로 쓴다), 평범한 객체로 충분하다.
function makeTestAsset(o) {
  return {
    id: o.id || `fx-${o.name}-${o.owner || ''}`,
    name: o.name, ticker: o.ticker || '', owner: o.owner || '신랑',
    accountType: o.accountType || '일반계좌', category: o.category || '주식',
    isDomestic: o.isDomestic || '국내', currency: o.currency || 'KRW',
    quantity: o.quantity, buyPrice: o.buyPrice, currentPrice: o.currentPrice,
    buyRate: o.buyRate, role: o.role, rateMatchOverride: o.rateMatchOverride
  };
}

/* ------------------------- 결정적 가격 시계열 생성기 -------------------------
 * 어떤 것도 난수/현재 날짜/외부 시세를 쓰지 않는다. 같은 인자를 넣으면 항상 같은 배열이 나온다.
 * ------------------------------------------------------------------------- */

// 등비수열 종가: 시작가에서 매일 dailyPct% 씩 변하는 n일치.
function trendCloses(n, start, dailyPct) {
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) { out.push(p); p *= (1 + dailyPct / 100); }
  return out;
}

// [Phase 39-B] 날짜 배열 생성기 - 거래일을 하루씩 뒤로 붙인다(주말/휴장 개념 없이 연속 날짜).
// startDate를 다르게 주면 "서로 다른 거래일을 가진 두 시계열"을 결정적으로 만들 수 있다.
function datesFrom(n, startDate = '2025-01-01') {
  const out = [];
  const d = new Date(startDate + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// 완전 평탄한 종가(수익률 전부 0) - 변동성/MDD/VaR가 0이 되는 기준선.
function flatCloses(n, price) { return new Array(n).fill(price); }

// +up% / -down% 를 번갈아 반복하는 톱니 종가 - 변동성을 결정적으로 만들 때 쓴다.
function zigzagCloses(n, start, upPct, downPct) {
  const out = [start];
  for (let i = 1; i < n; i++) {
    const pct = (i % 2 === 1) ? upPct : -downPct;
    out.push(out[i - 1] * (1 + pct / 100));
  }
  return out;
}

// RSI14를 원하는 구간에 떨어뜨리는 종가 - Wilder가 아닌 js/09의 단순평균 RSI14 구현에 맞춘
// 결정적 입력이다. gain/loss를 고정 비율로 번갈아 넣어 목표 RSI를 만든다.
// upDays: 최근 14봉 중 상승일 수. 상승폭/하락폭을 같게 두면 RSI ≈ upDays/14*100 이 된다.
function rsiCloses(upDays, step = 1, base = 100, pad = 40) {
  const out = flatCloses(pad, base).slice();
  let p = base;
  const pattern = [];
  for (let i = 0; i < 14; i++) pattern.push(i < upDays ? step : -step);
  pattern.forEach((d) => { p += d; out.push(p); });
  return out;
}

// 거래량 배열 - 마지막 값 / volMA20 비율이 정확히 targetRatio가 되도록 만든다.
// js/09의 volMA20 = computeSMA(volumes, 20)은 "마지막 20개의 평균"이라 급증한 당일 거래량 자신도
// 평균에 들어간다. 따라서 마지막 값 L은 단순히 base×ratio가 아니다:
//   volMA20 = (19·base + L)/20,  L/volMA20 = r  →  L = 19·r·base / (20 − r)
// 이 식을 그대로 써야 "정확히 2.00배" 같은 경계 테스트가 성립한다(r < 20 이어야 한다).
function volumes(n, baseVol, targetRatio) {
  const out = new Array(n).fill(baseVol);
  out[out.length - 1] = (19 * targetRatio * baseVol) / (20 - targetRatio);
  return out;
}

// 52주 낙폭이 정확히 targetPct(-값)가 되도록 만드는 종가: 고점을 먼저 찍고 내려온다.
function drawdownCloses(n, high, targetPct) {
  const last = high * (1 + targetPct / 100);
  const out = new Array(n).fill(high * 0.9);
  out[0] = high;                 // 52주 고점
  out[out.length - 1] = last;    // 현재가
  return out;
}

module.exports = {
  loadRiskSandbox, stubEl, makeTestAsset, datesFrom,
  trendCloses, flatCloses, zigzagCloses, rsiCloses, volumes, drawdownCloses
};
