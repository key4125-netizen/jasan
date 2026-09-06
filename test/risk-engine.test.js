// [Phase 38] Risk Engine(js/09-price-fx-risk-engine.js) 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/risk-engine.test.js  (또는 npm test)
//
// 목적은 "Risk 기능을 발전시키는 것"이 아니라 "Risk 기능을 안전하게 변경할 수 있는 상태로 만드는 것"이다.
// Phase 40(benchmark 정비)·Phase 42(RSI/거래량 정책)에서 계산을 바꾸기 전에, 지금 계산이 무엇을
// 내놓는지를 Golden으로 못박아 둔다. 여기 적힌 숫자는 "이래야 옳다"가 아니라 "지금 이렇다"이며,
// 정책적으로 바꾸기로 한 값은 그 Phase에서 이 파일을 함께 고치면 된다.
//
// 외부 의존 없음: 네트워크/현재 시세/현재 환율/오늘 날짜에 의존하지 않는다(test/risk-sandbox.js 참고).

const assert = require('node:assert');
const { test } = require('node:test');
const H = require('./risk-sandbox.js');

const { loadRiskSandbox, makeTestAsset, flatCloses, zigzagCloses, volumes, datesFrom } = H;

// 테스트 전역에서 쓰는 고정 환율 - state.exchangeRate에 의존하는 calcRow()를 결정적으로 만든다.
const FIXED_FX = 1300;

function freshSandbox() {
  const s = loadRiskSandbox();
  s.state.exchangeRate = FIXED_FX;
  s.state.assets = [];
  return s;
}

// 표준 2종목 fixture - 여러 테스트가 공유한다.
//   삼성전자: 신랑 300만 + 와이프 200만(표기가 005930 / 005930.KS로 서로 다르다) → 가구 합산 500만
//   QQQM   : 신랑 연금저축 $1,000 × 1,300 = 130만
function buildStandardPortfolio(s) {
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930', owner: '신랑', quantity: 30, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', owner: '와이프', quantity: 20, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'QQQM', ticker: 'QQQM', owner: '신랑', accountType: '연금저축', category: 'ETF', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '현금', category: '현금', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 })
  ];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1.0) });
  s.setDailyCloses('QQQM', { closes: zigzagCloses(260, 100, 0.8, 0.7), volumes: volumes(260, 500, 1.0) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1.0, 0.9), volumes: volumes(260, 1, 1) });
  s.setDailyCloses('^NDX', { closes: zigzagCloses(260, 15000, 0.9, 0.8), volumes: volumes(260, 1, 1) });
  return s;
}

const round = (v, d) => (typeof v === 'number' ? Number(v.toFixed(d)) : v);
// vm 컨텍스트에서 만들어진 객체/배열은 프로토타입 realm이 달라 deepStrictEqual이 값이 같아도
// 실패한다. 비교 직전에 테스트 realm의 평범한 객체로 옮겨 담는다(값은 그대로다).
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ==========================================================================
 * 1. Risk Universe - 어떤 자산이 위험 진단 대상인가
 *    [Phase 36 확정] 이 모집단은 리밸런싱(계획) 모집단과 의도적으로 다르다. 이번 Phase에서
 *    둘을 통합하지 않는다 - 이 테스트는 "다르다"는 사실 자체를 고정한다.
 * ======================================================================= */

test('Universe - 주식/ETF만 대상이고 현금·채권·부동산은 제외된다', () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '주식', ticker: 'A.KS', category: '주식', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: 'ETF', ticker: 'B.KS', category: 'ETF', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '채권', ticker: 'C.KS', category: '채권', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '현금', ticker: 'D.KS', category: '현금', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '부동산', ticker: 'E.KS', category: '부동산', quantity: 1, buyPrice: 100, currentPrice: 100 })
  ];
  assert.deepStrictEqual(plain(s.riskEligibleAssets().map((a) => a.name)), ['주식', 'ETF']);
  assert.deepStrictEqual(plain(s.RISK_ELIGIBLE_CATEGORIES), ['주식', 'ETF']);
});

test('Universe - 티커가 없거나 수량이 0 이하인 자산은 제외된다', () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '정상', ticker: 'A.KS', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '티커없음', ticker: '', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '공백티커', ticker: '   ', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '전량매도', ticker: 'B.KS', quantity: 0, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: '음수수량', ticker: 'C.KS', quantity: -1, buyPrice: 100, currentPrice: 100 })
  ];
  assert.deepStrictEqual(plain(s.riskEligibleAssets().map((a) => a.name)), ['정상']);
});

test('Universe - 절세계좌(ISA/IRP/연금저축)도 위험 진단 대상에 포함된다', () => {
  const s = freshSandbox();
  s.state.assets = s.TAX_ADVANTAGED_ACCOUNT_TYPES
    .concat(['일반계좌'])
    .map((acct, i) => makeTestAsset({ name: acct, ticker: `T${i}.KS`, accountType: acct, quantity: 1, buyPrice: 100, currentPrice: 100 }));
  assert.strictEqual(s.riskEligibleAssets().length, 4);
  // 리밸런싱은 반대로 절세계좌를 제외한다 - 두 모집단이 다르다는 사실을 여기서 고정한다.
  assert.strictEqual(s.isRebalanceEligibleAccount({ accountType: '연금저축' }), false);
  assert.strictEqual(s.isRebalanceEligibleAccount({ accountType: '일반계좌' }), true);
});

test('Universe - owner 필터가 없다(진단은 항상 가구 전체 기준)', () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: 'A.KS', owner: '신랑', quantity: 1, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: 'B', ticker: 'B.KS', owner: '와이프', quantity: 1, buyPrice: 100, currentPrice: 100 })
  ];
  assert.deepStrictEqual(plain(s.riskEligibleAssets().map((a) => a.owner).sort()), ['신랑', '와이프']);
});

/* ==========================================================================
 * 2. Benchmark 매핑 - 현재 상태를 있는 그대로 고정한다
 *    [Phase 36 §5-4 / PM Q5] 채권·금 ETF가 주식 지수에 붙는 것은 알려진 문제이며 Phase 40에서
 *    정비하기로 결정됐다. 지금 고치지 않는다 - 대신 "지금 이렇게 매핑된다"를 못박아, Phase 40이
 *    무엇을 바꾸는지 diff로 정확히 드러나게 한다.
 * ======================================================================= */

test('Benchmark - 국내는 접미사로, 미국은 하드코딩 집합으로 결정된다', () => {
  const s = freshSandbox();
  assert.strictEqual(s.getBenchmarkKeyForTicker('005930.KS'), 'KOSPI');
  assert.strictEqual(s.getBenchmarkKeyForTicker('247540.KQ'), 'KOSDAQ');
  assert.strictEqual(s.getBenchmarkKeyForTicker('QQQM'), 'NASDAQ100');
  assert.strictEqual(s.getBenchmarkKeyForTicker('NVDA'), 'NASDAQ100');
  assert.strictEqual(s.getBenchmarkKeyForTicker('SCHD'), 'DOW');
  assert.strictEqual(s.getBenchmarkKeyForTicker('KO'), 'DOW');
  assert.strictEqual(s.getBenchmarkKeyForTicker('UNKNOWNX'), 'SP500');
});

test('Benchmark - [알려진 mismatch, Phase 40 정비 예정] 채권·금 ETF가 주식 지수에 매핑된다', () => {
  const s = freshSandbox();
  // 미국 장기국채 ETF가 S&P500 벤치마크를 받는다.
  assert.strictEqual(s.getBenchmarkKeyForTicker('TLT'), 'SP500');
  assert.strictEqual(s.getBenchmarkKeyForTicker('IEF'), 'SP500');
  // 금 ETF도 마찬가지.
  assert.strictEqual(s.getBenchmarkKeyForTicker('GLD'), 'SP500');
  // 국내 국고채 ETF는 .KS 접미사 때문에 코스피를 받는다.
  assert.strictEqual(s.getBenchmarkKeyForTicker('148070.KS'), 'KOSPI');
  // 지수 티커 상수도 함께 고정한다(Phase 40에서 항목이 늘어나는지 diff로 보인다).
  assert.deepStrictEqual(plain(Object.keys(s.INDEX_TICKERS).sort()), ['DOW', 'KOSDAQ', 'KOSPI', 'NASDAQ', 'NASDAQ100', 'SP500']);
});

/* ==========================================================================
 * 3. 6대 위험요인 subScore - 구간표 경계
 * ======================================================================= */

const sectorExp = (topSectorWeight, unclassifiedWeightPct = 0) =>
  ({ topSector: '반도체', topSectorWeight, unclassifiedWeightPct, sectorTotals: {} });

test('subScore ① 집중 - 단일비중40% + HHI30% + 섹터30% 가중합', () => {
  const s = freshSandbox();
  const c = (topWeight, hhi, sec) => s.computeConcentrationRiskScore({ topWeight, hhi, sectorExposure: sectorExp(sec) });
  assert.strictEqual(c(10, 0.15, 20), 13);
  assert.strictEqual(c(20, 0.25, 35), 33);
  assert.strictEqual(c(30, 0.35, 50), 55);
  assert.strictEqual(c(40, 0.50, 65), 75);
  assert.strictEqual(c(50, 0.60, 80), 91);
  assert.strictEqual(c(60, 0.90, 90), 100);
  // 가중치 검증: 단일비중만 최대(100), 나머지 최소일 때 = 100*0.4 + 20*0.3 + 10*0.3 = 49
  assert.strictEqual(c(60, 0.10, 10), 49);
});

test('subScore ① 집중 - [Phase 39-B] 결측 폴백이 0이 아니라 중립(50)이다', () => {
  const s = freshSandbox();
  // 현재 엔진 경로에서는 topWeight/hhi/섹터가 항상 숫자라 도달하지 않는 이론적 경로지만,
  // 예전엔 `?? 0`이라 결측이 "가장 안전"으로 계산됐다. 다른 요인과 원칙을 통일한다.
  const missing = s.computeConcentrationRiskScore({
    topWeight: null, hhi: null, sectorExposure: { topSectorWeight: null, unclassifiedWeightPct: 0 }
  });
  assert.strictEqual(missing, 50);
});

test('subScore ② 변동성 - 15/20/25/30 경계, 결측이면 50', () => {
  const s = freshSandbox();
  const v = (x) => s.computeVolatilityRiskScore({ portfolioVolatilityPct: x });
  assert.strictEqual(v(15), 20);
  assert.strictEqual(v(15.01), 40);
  assert.strictEqual(v(20), 40);
  assert.strictEqual(v(20.01), 60);
  assert.strictEqual(v(25), 60);
  assert.strictEqual(v(30), 80);
  assert.strictEqual(v(30.01), 100);
  assert.strictEqual(v(null), 50);
});

test('subScore ③ 손실 - MDD40% + VaR30% + CVaR30%', () => {
  const s = freshSandbox();
  const d = (mdd, var95, cvar) => s.computeDrawdownTailRiskScore({ portfolioMDDPct: mdd, var95Pct: var95, cvarPct: cvar });
  assert.strictEqual(d(-10, -1.5, -2.5), 20);
  assert.strictEqual(d(-20, -2.5, -4), 40);
  assert.strictEqual(d(-30, -3.5, -6), 60);
  assert.strictEqual(d(-40, -5, -8), 80);
  assert.strictEqual(d(-60, -9, -12), 100);
  // 부호는 절대값으로 처리되므로 양수/음수 입력이 같은 점수를 낸다.
  assert.strictEqual(d(30, 3.5, 6), d(-30, -3.5, -6));
});

test('subScore ③ 손실 - [Phase 39-B] 결측은 어떤 표현이든 중립(50)으로 수렴한다', () => {
  const s = freshSandbox();
  const d = (mdd, v, c) => s.computeDrawdownTailRiskScore({ portfolioMDDPct: mdd, var95Pct: v, cvarPct: c });
  // 예전엔 Math.abs(null)=0 때문에 최저 위험(20)이 나왔다. 이제 null/undefined/NaN이 전부 같은
  // "모름"으로 취급되어 기존 `?? 50` 정책에 도달한다 - 결측이 표현 방식에 따라 20/38/50으로
  // 갈리던 문제도 함께 사라진다.
  assert.strictEqual(d(null, null, null), 50);
  assert.strictEqual(d(undefined, undefined, undefined), 50);
  assert.strictEqual(d(NaN, NaN, NaN), 50);
  // 일부만 결측이면 그 항목만 50으로 대체되고 나머지는 실제 값을 쓴다.
  assert.strictEqual(d(null, -2.5, -4), 50 * 0.4 + 40 * 0.3 + 40 * 0.3);      // 44
  assert.strictEqual(d(-20, null, -4), 40 * 0.4 + 50 * 0.3 + 40 * 0.3);      // 43
  assert.strictEqual(d(-20, -2.5, null), 40 * 0.4 + 40 * 0.3 + 50 * 0.3);    // 43
  // 정상 데이터는 예전과 완전히 같다.
  assert.strictEqual(d(-20, -2.5, -4), 40);
});

test('subScore ④ 시장(beta) - 0.8/1.0/1.2/1.4 경계, 결측이면 50', () => {
  const s = freshSandbox();
  const m = (b) => s.computeMarketRiskScore({ portfolioBeta: b });
  assert.strictEqual(m(0.8), 20);
  assert.strictEqual(m(0.81), 35);
  assert.strictEqual(m(1.0), 35);
  assert.strictEqual(m(1.01), 55);
  assert.strictEqual(m(1.2), 55);
  assert.strictEqual(m(1.4), 75);
  assert.strictEqual(m(1.41), 95);
  assert.strictEqual(m(null), 50);
});

test('subScore ⑤ 상관관계 - 0.3/0.5/0.7/0.85 경계, [Phase 39-B] 결측이면 50', () => {
  const s = freshSandbox();
  const c = (x) => s.computeCorrelationRiskScore({ weightedAvgCorrelation: x });
  assert.strictEqual(c(0.3), 20);
  assert.strictEqual(c(0.31), 40);
  assert.strictEqual(c(0.5), 40);
  assert.strictEqual(c(0.7), 60);
  assert.strictEqual(c(0.85), 80);
  assert.strictEqual(c(0.86), 100);
  // [Phase 39-B] 40은 "상관 0.3~0.5 = 어느 정도 분산됨"이라는 긍정 판정이었다 - 계산조차 못 한
  // 상태를 그렇게 읽으면 안 되므로 다른 요인과 같은 중립(50)으로 통일했다.
  assert.strictEqual(c(null), 50);
  assert.strictEqual(c(undefined), 50);
});

test('subScore ⑥ 기술/수급 - RSI 구간 + 역배열/수급 가산이 현재 값 그대로다', () => {
  const s = freshSandbox();
  const tf = (h) => s.computeTechnicalFlowRiskScore([Object.assign({ weight: 1 }, h)]);
  // RSI 기본 구간
  assert.strictEqual(tf({ rsi14: 70 }), 70);   // 70 이상: 70 + (rsi-70)*1.5
  assert.strictEqual(tf({ rsi14: 74 }), 76);
  assert.strictEqual(tf({ rsi14: 50 }), 30);   // 30~70 사이는 30점
  assert.strictEqual(tf({ rsi14: 30 }), 55);   // 30 이하는 55점(과매도)
  assert.strictEqual(tf({}), 50);              // RSI 없으면 기본 50
  // 가산/감산 (이번 Phase에서 수정하지 않는다 - Phase 42 검토 대상)
  assert.strictEqual(tf({ rsi14: 50, trendLabel: '역배열(하락추세)' }), 45);  // +15
  assert.strictEqual(tf({ rsi14: 50, flowSignal: 'outflow' }), 45);           // +15
  assert.strictEqual(tf({ rsi14: 50, flowSignal: 'inflow' }), 25);            // -5
  // 0~100 클램프
  assert.strictEqual(tf({ rsi14: 100, trendLabel: '역배열(하락추세)', flowSignal: 'outflow' }), 100);
  // 비중 합이 0이면 기본 50
  assert.strictEqual(s.computeTechnicalFlowRiskScore([]), 50);
});

/* ==========================================================================
 * 4. 종합 위험점수 + 신호등
 * ======================================================================= */

test('Composite - 가중치가 정확히 25/20/20/15/10/10이다', () => {
  const s = freshSandbox();
  const zero = { concentration: 0, volatility: 0, drawdown: 0, market: 0, correlation: 0, technical: 0 };
  // 한 요인만 80점일 때의 결과 = 80 × 가중치 (극단가산 임계 90 미만이라 가산 없음)
  const only = (k) => s.computeCompositeRiskScore(Object.assign({}, zero, { [k]: 80 }));
  assert.strictEqual(only('concentration'), 20); // 80 × 0.25
  assert.strictEqual(only('volatility'), 16);    // 80 × 0.20
  assert.strictEqual(only('drawdown'), 16);      // 80 × 0.20
  assert.strictEqual(only('market'), 12);        // 80 × 0.15
  assert.strictEqual(only('correlation'), 8);    // 80 × 0.10
  assert.strictEqual(only('technical'), 8);      // 80 × 0.10
  assert.strictEqual(s.computeCompositeRiskScore(zero), 0);
  assert.strictEqual(s.computeCompositeRiskScore({ concentration: 50, volatility: 50, drawdown: 50, market: 50, correlation: 50, technical: 50 }), 50);
});

test('Composite - 극단위험 가산 경계(90 → +5, 95 → +8)와 0~100 클램프', () => {
  const s = freshSandbox();
  const zero = { concentration: 0, volatility: 0, drawdown: 0, market: 0, correlation: 0, technical: 0 };
  const top = (v) => s.computeCompositeRiskScore(Object.assign({}, zero, { concentration: v }));
  assert.strictEqual(top(89), 22);        // 89×0.25 = 22.25 → 22, 가산 없음
  assert.strictEqual(top(90), 28);        // 22.5 + 5
  assert.strictEqual(top(94), 29);        // 23.5 + 5
  assert.strictEqual(top(95), 32);        // 23.75 + 8
  assert.strictEqual(s.computeCompositeRiskScore({ concentration: 100, volatility: 100, drawdown: 100, market: 100, correlation: 100, technical: 100 }), 100);
});

test('Composite - subScore가 빠지면 그 요인은 50점으로 대체된다', () => {
  const s = freshSandbox();
  // technical 누락 → 50 × 0.10 = 5
  assert.strictEqual(s.computeCompositeRiskScore({ concentration: 0, volatility: 0, drawdown: 0, market: 0, correlation: 0 }), 5);
});

test('Risk Level - 0~40 양호 / 41~60 주의 / 61~100 위험', () => {
  const s = freshSandbox();
  const label = (v) => s.riskLevelFromScore(v).label;
  const level = (v) => s.riskLevelFromScore(v).level;
  assert.deepStrictEqual([0, 40].map(label), ['양호', '양호']);
  assert.deepStrictEqual([41, 60].map(label), ['주의', '주의']);
  assert.deepStrictEqual([61, 100].map(label), ['위험', '위험']);
  // level 문자열은 구 안전점수 체계와 호환되도록 safe/warn/danger를 유지한다.
  assert.deepStrictEqual([40, 41, 61].map(level), ['safe', 'warn', 'danger']);
  assert.deepStrictEqual([40, 41, 61].map((v) => s.riskLevelFromScore(v).emoji), ['🟢', '🟡', '🔴']);
});

/* ==========================================================================
 * 5. 순수 계산 헬퍼
 * ======================================================================= */

test('HHI / 섹터 노출 - 룩스루와 미분류 처리', () => {
  const s = freshSandbox();
  assert.strictEqual(round(s.computeHHI([{ weight: 1 }]), 6), 1);
  assert.strictEqual(round(s.computeHHI([{ weight: 0.5 }, { weight: 0.5 }]), 6), 0.5);
  assert.strictEqual(round(s.computeHHI([{ weight: 0.25 }, { weight: 0.25 }, { weight: 0.25 }, { weight: 0.25 }]), 6), 0.25);

  const known = s.computeSectorExposure([{ ticker: '005930.KS', weight: 1 }]);
  assert.strictEqual(known.topSector, '반도체');
  assert.strictEqual(round(known.topSectorWeight, 4), 100);
  assert.strictEqual(round(known.unclassifiedWeightPct, 4), 0);

  const unknown = s.computeSectorExposure([{ ticker: 'ZZZZ', weight: 1 }]);
  assert.strictEqual(unknown.topSector, '미분류');
  assert.strictEqual(round(unknown.unclassifiedWeightPct, 4), 100);
});

test('변동성/MDD - 무변동 시계열은 0, 데이터가 10개 미만이면 변동성은 null', () => {
  const s = freshSandbox();
  assert.strictEqual(s.computeAnnualizedVolatilityPct(new Array(50).fill(0)), 0);
  assert.strictEqual(s.computeAnnualizedVolatilityPct(new Array(9).fill(0.01)), null);
  assert.strictEqual(s.computeAnnualizedVolatilityPct(null), null);
  assert.strictEqual(s.computeMDDFromCloses(flatCloses(30, 100)), 0);
  assert.strictEqual(round(s.computeMDDFromCloses([100, 50]), 4), -50);
  assert.strictEqual(round(s.computeMDDFromCloses([100, 50, 200, 100]), 4), -50);
  assert.strictEqual(s.computeMDDFromCloses([100]), null);
});

test('수급 대체 지표(flowSignal) - 2배 거래량 × ±2% 조합', () => {
  const s = freshSandbox();
  const h = (lastVolume, prev, last) => ({ closes: [prev, last], volMA20: 1000, lastVolume });
  assert.strictEqual(s.computeFlowSignal(h(2000, 100, 97)), 'outflow');  // 2배 & -3%
  assert.strictEqual(s.computeFlowSignal(h(2000, 100, 103)), 'inflow');  // 2배 & +3%
  assert.strictEqual(s.computeFlowSignal(h(2000, 100, 100)), 'neutral'); // 2배지만 보합
  assert.strictEqual(s.computeFlowSignal(h(1999, 100, 97)), 'neutral');  // 2배 미달
  assert.strictEqual(s.computeFlowSignal(h(400, 100, 100)), 'quiet');    // 40% 이하
  assert.strictEqual(s.computeFlowSignal({ closes: null, volMA20: 1000, lastVolume: 1 }), null);
});

/* ==========================================================================
 * 6. 데이터 신뢰도 - 현재 계산식을 그대로 고정(이번 Phase에서 변경 금지)
 * ======================================================================= */

// beta까지 갖춘 "완전한" holding - Phase 39-B부터 신뢰도가 beta 유무도 보므로, 가격이력/섹터
// 감점만 격리해서 보려면 fixture에도 beta가 있어야 한다(실제 엔진의 holding은 항상 beta 필드를 갖는다).
const okHolding = (weight, over) => Object.assign({ weight, hasData: true, beta: 1.0 }, over);

test('DataConfidence - 완전한 데이터에서도 최대 92점이다(수급 추정치 고정 8점 감점)', () => {
  const s = freshSandbox();
  const conf = s.computeDataConfidence({ holdings: [okHolding(1)], sectorExposure: sectorExp(100, 0) });
  assert.strictEqual(conf.score, 92);
  assert.strictEqual(conf.reasons.length, 1);
  assert.match(conf.reasons[0], /거래량 기반 추정치/);
});

test('DataConfidence - 가격 이력 부족(최대 35점)과 섹터 미분류(최대 20점) 감점', () => {
  const s = freshSandbox();
  const half = s.computeDataConfidence({ holdings: [okHolding(0.5), { weight: 0.5, hasData: false }], sectorExposure: sectorExp(50, 0) });
  assert.strictEqual(half.score, 75);  // 100 - 17.5 - 0 - 8
  const unc = s.computeDataConfidence({ holdings: [okHolding(1)], sectorExposure: sectorExp(0, 100) });
  assert.strictEqual(unc.score, 72);   // 100 - 0 - 20 - 8
  const worst = s.computeDataConfidence({ holdings: [{ weight: 1, hasData: false }], sectorExposure: sectorExp(0, 100) });
  assert.strictEqual(worst.score, 37); // 100 - 35 - 20 - 8
  assert.strictEqual(worst.reasons.length, 3);
});

test('DataConfidence - [Phase 39-B] benchmark 결측이 비중만큼 감점된다(최대 15)', () => {
  const s = freshSandbox();
  const noBeta = (weight) => ({ weight, hasData: true, beta: null });
  // 전부 beta 불가 → 100 - 15 - 8 = 77
  const all = s.computeDataConfidence({ holdings: [noBeta(1)], sectorExposure: sectorExp(100, 0) });
  assert.strictEqual(all.score, 77);
  assert.ok(all.reasons.some((r) => /벤치마크\) 비교 불가/.test(r)), '사유에 벤치마크 비교 불가가 있어야 한다');
  // 절반만 불가 → 100 - 7.5 - 8 = 85 (반올림)
  const half = s.computeDataConfidence({ holdings: [okHolding(0.5), noBeta(0.5)], sectorExposure: sectorExp(100, 0) });
  assert.strictEqual(half.score, 85);
  // 가격 이력 자체가 없는 종목은 이미 missingPenalty가 반영하므로 중복 감점하지 않는다.
  const noHistory = s.computeDataConfidence({ holdings: [{ weight: 1, hasData: false }], sectorExposure: sectorExp(100, 0) });
  assert.strictEqual(noHistory.score, 57); // 100 - 35 - 8 (benchmark 감점 없음)
});

test('DataConfidence - [Phase 39-B] 상관관계 계산 불가만 감점하고 단일 자산은 감점하지 않는다', () => {
  const s = freshSandbox();
  const base = { holdings: [okHolding(0.5), okHolding(0.5)], sectorExposure: sectorExp(100, 0) };
  // 2종목 이상인데 유효 쌍이 하나도 없을 때만 고정 10점 감점.
  const unavailable = s.computeDataConfidence(Object.assign({}, base, { correlationUnavailable: true }));
  assert.strictEqual(unavailable.score, 82);   // 92 - 10
  assert.ok(unavailable.reasons.some((r) => /상관관계를 계산할 수 없어/.test(r)));
  // 플래그가 없으면(단일 자산 포함) 감점하지 않는다 - 자산 1개의 상관관계는 계산 실패가 아니라
  // 애초에 성립하지 않는 개념이다(PM 확정).
  const single = s.computeDataConfidence({ holdings: [okHolding(1)], sectorExposure: sectorExp(100, 0) });
  assert.strictEqual(single.score, 92);
});

/* ==========================================================================
 * 7. Household 합산 - 진단은 항상 가구 전체 기준
 * ======================================================================= */

test('Household - 소유자가 달라도 같은 야후 티커면 하나로 합산된다(표기 차이 포함)', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930', owner: '신랑', quantity: 30, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', owner: '와이프', quantity: 20, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });

  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings.length, 1, '표기가 달라도 한 종목으로 병합되어야 한다');
  assert.strictEqual(m.holdings[0].ticker, '005930.KS');
  assert.strictEqual(m.holdings[0].curAmount, 5000000, '300만 + 200만 = 500만');
  assert.strictEqual(m.totalCur, 5000000);
  assert.strictEqual(round(m.topWeight, 4), 100, '가구 합산 기준 집중도 100%');
});

test('Household - 개인별로는 30%/20%인 종목이 가구 기준 집중도로 잡힌다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', owner: '신랑', quantity: 30, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', owner: '와이프', quantity: 20, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '기타', ticker: 'ZZZZ.KS', owner: '신랑', quantity: 50, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('ZZZZ.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });

  const m = await s.computeAdvancedRiskMetrics();
  const samsung = m.holdings.find((h) => h.ticker === '005930.KS');
  assert.strictEqual(round(samsung.weight * 100, 4), 50, '신랑 300만 + 와이프 200만 = 가구 500만 / 1000만 = 50%');
});

/* ==========================================================================
 * 8. Edge case - "데이터가 부족한데 정상으로 계산되는가"
 * ======================================================================= */

test('Edge - 대상 자산이 없거나 평가액이 0이면 null을 반환한다(예외를 던지지 않는다)', async () => {
  const empty = freshSandbox();
  assert.strictEqual(await empty.computeAdvancedRiskMetrics(), null);

  const zero = freshSandbox();
  zero.state.assets = [makeTestAsset({ name: 'A', ticker: 'A.KS', quantity: 10, buyPrice: 100, currentPrice: 0 })];
  assert.strictEqual(await zero.computeAdvancedRiskMetrics(), null);
});

test('Edge - [Phase 39-B] 가격 이력이 전혀 없으면 손실위험도 중립(50)이 된다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.missingCount, 1);
  assert.strictEqual(m.holdings[0].hasData, false);
  assert.strictEqual(m.portfolioBeta, null);
  assert.strictEqual(m.portfolioVolatilityPct, null);
  assert.strictEqual(m.portfolioMDDPct, null);
  assert.strictEqual(m.weightedAvgCorrelation, null);
  assert.strictEqual(m.holdings[0].rsi14, null);
  assert.strictEqual(m.holdings[0].trendLabel, null);
  assert.strictEqual(m.holdings[0].volumeSpike, false);
  // 신뢰도는 떨어진다(100 - 35 - 0 - 8 = 57). 섹터는 매핑되어 있으므로 미분류 감점은 0이다.
  // 가격 이력이 없으면 benchmark 감점은 중복 적용하지 않는다(missingPenalty가 이미 반영).
  assert.strictEqual(m.dataConfidence.score, 57);
  // [Phase 39-B] VaR/CVaR가 리터럴 0이 아니라 null이 되어, 손실위험이 최저(20)가 아니라 중립(50)이다.
  assert.strictEqual(m.var95Pct, null);
  assert.strictEqual(m.cvarPct, null);
  assert.strictEqual(m.var95KRW, null, '금액도 0원이 아니라 null이어야 한다');
  assert.strictEqual(m.cvarKRW, null);
  assert.deepStrictEqual(plain(m.subScores), {
    concentration: 100, volatility: 50, drawdown: 50, market: 50, correlation: 50, technical: 50
  });
  // 데이터가 없다고 위험이 낮아 보이지 않는다(64 -> 71). 위험이 커진 게 아니라 "모름"이 중립으로 옮겨간 것이다.
  assert.strictEqual(m.riskScore, 71);
});

test('Edge - [Phase 39-B] benchmark만 없으면 beta는 null이 되고 신뢰도가 떨어진다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  // ^KS11을 일부러 주지 않는다.
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.missingCount, 0, '종목 자체 이력은 있으므로 결측으로 세지 않는다');
  assert.strictEqual(m.holdings[0].beta, null, '종목 beta는 계산 불가');
  // [Phase 39-B] 예전엔 1.0으로 채워 넣어 시장위험이 35점(중립보다 안전)으로 찍혔다.
  assert.strictEqual(m.portfolioBeta, null, '관측된 beta가 하나도 없으면 null이다');
  assert.strictEqual(m.subScores.market, 50, '기존 missing -> 50 정책이 작동한다');
  assert.strictEqual(m.dataConfidence.score, 77, 'benchmark 결측 100% -> 100 - 15 - 8');
  assert.ok(m.dataConfidence.reasons.some((r) => r.includes('벤치마크')), '사유가 사용자에게 노출된다');
});

test('Edge - [Phase 39-B] 일부 종목만 beta가 있으면 그 종목들로만 재정규화한다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '국내', ticker: '005930.KS', quantity: 13, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '해외', ticker: 'QQQM', isDomestic: '해외', currency: 'USD', category: 'ETF', quantity: 10, buyPrice: 100, currentPrice: 100 })
  ];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('QQQM', { closes: zigzagCloses(260, 100, 0.8, 0.7), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1.0, 0.9), volumes: volumes(260, 1, 1) });
  // ^NDX를 주지 않아 QQQM만 beta 계산 불가 (50:50 비중)
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(round(m.holdings.find((h) => h.ticker === '005930.KS').beta, 4), 1.1579);
  assert.strictEqual(m.holdings.find((h) => h.ticker === 'QQQM').beta, null);
  // 예전엔 (1.1579 + 1.0)/2 로 희석됐다. 이제 관측된 beta만 100%로 재정규화한다.
  assert.strictEqual(round(m.portfolioBeta, 6), 1.157895);
  assert.strictEqual(m.dataConfidence.score, 85, '결측 비중 50% -> 100 - 7.5 - 8');
});

test('Edge - 종목이 1개면 상관관계는 null이 되고 [Phase 39-B] 중립(50)이 된다', async () => {
  const s = freshSandbox();
  // 섹터가 매핑된 티커를 써서 미분류 감점(-20)이 섞이지 않게 한다 - 여기서 보려는 건 상관관계뿐이다.
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.weightedAvgCorrelation, null);
  assert.strictEqual(m.topCorrelation, null);
  assert.strictEqual(m.topCorrelationPair, null);
  assert.strictEqual(m.subScores.correlation, 50);
  // 자산이 1개면 상관관계는 "계산 실패"가 아니라 성립하지 않는 개념이므로 신뢰도는 깎지 않는다(PM 확정).
  assert.strictEqual(m.dataConfidence.score, 92);
});

test('Edge - [Phase 39-B] 2종목인데 상관관계를 못 구하면 신뢰도가 깎인다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 25, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'B', ticker: '000660.KS', quantity: 25, buyPrice: 100000, currentPrice: 100000 })
  ];
  // 완전 무변동 -> 분산 0 -> computeCorrelationFromReturns가 null을 반환한다.
  s.setDailyCloses('005930.KS', { closes: flatCloses(260, 100000), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('000660.KS', { closes: flatCloses(260, 50000), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.weightedAvgCorrelation, null);
  assert.strictEqual(m.subScores.correlation, 50);
  assert.strictEqual(m.dataConfidence.score, 82, '92 - 10(상관 계산 불가)');
  assert.ok(m.dataConfidence.reasons.some((r) => r.includes('상관관계를 계산할 수 없어')));
});

test('Edge - [Phase 39-B] 수익률 10개 미만이면 hasData=false로 결측 처리된다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', { closes: zigzagCloses(10, 100000, 1, 1), volumes: volumes(10, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(10, 2500, 1, 1), volumes: volumes(10, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  // 종가 10개 -> 수익률 9개 -> 통계 최소치(10) 미달이므로 결측으로 센다.
  assert.strictEqual(m.holdings[0].returns.length, 9);
  assert.strictEqual(m.holdings[0].hasData, false);
  assert.strictEqual(m.missingCount, 1);
  assert.strictEqual(m.dataConfidence.score, 57, '더 이상 "데이터 충분"이 아니다');
  assert.strictEqual(m.subScores.volatility, 50);
  assert.strictEqual(m.subScores.drawdown, 50);
});

test('Edge - [Phase 39-B] hasData 경계는 수익률 10개(= 종가 11개)다', async () => {
  const at = async (closeCount) => {
    const s = freshSandbox();
    s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
    s.setDailyCloses('005930.KS', { closes: zigzagCloses(closeCount, 100000, 1, 1), volumes: volumes(closeCount, 1000, 1) });
    s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
    const m = await s.computeAdvancedRiskMetrics();
    return { returns: m.holdings[0].returns.length, hasData: m.holdings[0].hasData, missing: m.missingCount };
  };
  // 종가 1개는 수익률 0개 - 예전엔 이것도 hasData=true였다.
  assert.deepStrictEqual(plain(await at(1)), { returns: 0, hasData: false, missing: 1 });
  assert.deepStrictEqual(plain(await at(2)), { returns: 1, hasData: false, missing: 1 });
  assert.deepStrictEqual(plain(await at(10)), { returns: 9, hasData: false, missing: 1 });
  assert.deepStrictEqual(plain(await at(11)), { returns: 10, hasData: true, missing: 0 });
  assert.deepStrictEqual(plain(await at(260)), { returns: 259, hasData: true, missing: 0 });
});

test('Edge - 무변동(가격이 전혀 안 움직임)이면 변동성·MDD·VaR가 모두 0이다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: 'A.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('A.KS', { closes: flatCloses(260, 100000), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: flatCloses(260, 2500), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.portfolioVolatilityPct, 0);
  assert.strictEqual(m.portfolioMDDPct, 0);
  assert.strictEqual(m.var95Pct, 0);
  assert.strictEqual(m.cvarPct, 0);
  assert.strictEqual(m.subScores.volatility, 20);
  // 무변동이면 RSI14는 50(gain=loss=0)으로 수렴한다.
  assert.strictEqual(m.holdings[0].rsi14, 50);
});

test('Edge - 섹터 매핑에 없는 티커는 미분류로 안전하게 빠지고 신뢰도만 낮아진다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: '미지의종목', ticker: 'ZZZZ.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('ZZZZ.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.sectorExposure.topSector, '미분류');
  assert.strictEqual(round(m.sectorExposure.unclassifiedWeightPct, 4), 100);
  assert.strictEqual(m.dataConfidence.score, 72);
});

test('Edge - 해외자산은 state.exchangeRate로 원화 환산되어 비중에 반영된다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '국내', ticker: 'A.KS', quantity: 13, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '해외', ticker: 'AAPL', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 })
  ];
  s.setDailyCloses('A.KS', { closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('AAPL', { closes: zigzagCloses(260, 100, 1, 1), volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
  s.setDailyCloses('^NDX', { closes: zigzagCloses(260, 15000, 1, 1), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  // $1,000 × 1,300 = 130만, 국내 130만 → 정확히 50:50
  assert.strictEqual(m.totalCur, 2600000);
  assert.deepStrictEqual(plain(m.holdings.map((h) => round(h.weight * 100, 4)).sort()), [50, 50]);
  assert.strictEqual(m.holdings.find((h) => h.ticker === 'AAPL').benchmarkKey, 'NASDAQ100');
});

test('Edge - 계산 중 예외가 나면 null을 반환하고 앱을 멈추지 않는다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: 'A.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.getCachedDailyCloses = async () => { throw new Error('강제 실패'); };
  assert.strictEqual(await s.computeAdvancedRiskMetrics(), null);
});

/* ==========================================================================
 * 8-B. [Phase 39-B] benchmark/상관계수 날짜 정렬
 *   예전엔 두 시계열의 "최근 N개"를 그냥 나란히 놓고 비교했다(slice(-n)). 거래일이 다른 시장을 섞거나
 *   한쪽 이력이 짧으면 전혀 다른 날의 수익률이 짝지어져, 결측보다 더 위험한 "그럴듯한 오답"이 나왔다.
 *   fetchDailyCloses()가 이미 dates를 돌려주고 js/15에 dateAlignedReturns()가 있었는데 리스크 엔진만
 *   그걸 쓰지 않고 있었다 - 새 데이터/새 유틸을 만들지 않고 그 둘을 연결했다.
 * ======================================================================= */

// 날짜까지 포함한 시계열 fixture. 시작일을 다르게 주면 거래일이 어긋난 두 시계열이 만들어진다.
function datedSeries(n, start, price, up, down, startDate) {
  return { closes: zigzagCloses(n, price, up, down), volumes: volumes(n, 1000, 1), dates: datesFrom(n, startDate) };
}

async function betaWith(assetDates, benchDates, benchLen) {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  const asset = assetDates
    ? datedSeries(260, 0, 100000, 1.2, 1.0, assetDates)
    : { closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1) };
  const bench = benchDates
    ? datedSeries(benchLen, 0, 2500, 1.0, 0.9, benchDates)
    : { closes: zigzagCloses(benchLen, 2500, 1.0, 0.9), volumes: volumes(benchLen, 1, 1) };
  s.setDailyCloses('005930.KS', asset);
  s.setDailyCloses('^KS11', bench);
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  return { beta: round(h.beta, 4), aligned: h.betaAligned, obs: h.betaObservationCount, market: m.subScores.market };
}

test('날짜 정렬 - 양쪽에 날짜가 있으면 공통 거래일로만 beta를 계산한다', async () => {
  const same = await betaWith('2025-01-01', '2025-01-01', 260);
  assert.strictEqual(same.aligned, true);
  assert.strictEqual(same.obs, 260, '완전히 겹치면 260 거래일 전부 쓴다');
  assert.strictEqual(same.beta, 1.1579);

  // 지수 이력이 짧으면 실제로 겹치는 30일만 쓴다(예전엔 260개 중 최근 30개를 잘라 붙였다).
  const shortBench = await betaWith('2025-01-01', '2025-01-01', 30);
  assert.strictEqual(shortBench.aligned, true);
  assert.strictEqual(shortBench.obs, 30);
});

test('날짜 정렬 - 기간이 겹치지 않으면 beta를 만들어내지 않는다', async () => {
  // [핵심] 예전엔 서로 다른 해의 수익률을 나란히 놓고 beta 1.1579라는 "그럴듯한 오답"을 냈다.
  const noOverlap = await betaWith('2025-01-01', '2026-06-01', 260);
  assert.strictEqual(noOverlap.aligned, true);
  assert.strictEqual(noOverlap.obs, 0);
  assert.strictEqual(noOverlap.beta, null, '겹치는 날이 없으면 beta는 null이어야 한다');
  assert.strictEqual(noOverlap.market, 50, '모르면 중립(50) - 35(안전)가 아니다');
});

test('날짜 정렬 - 부분적으로 겹치면 겹친 만큼만 관측치로 센다', async () => {
  const p30 = await betaWith('2025-01-01', '2025-08-19', 260);
  assert.strictEqual(p30.obs, 30);
  const p60 = await betaWith('2025-01-01', '2025-07-20', 260);
  assert.strictEqual(p60.obs, 60);
});

test('날짜 정렬 - 날짜가 없는 시계열은 기존 방식으로 안전하게 폴백한다', async () => {
  // 구 캐시나 날짜를 못 받은 응답에서도 계산을 포기하지 않는다 - 정확도가 올라갈 수 있을 때만 올린다.
  const noDates = await betaWith(null, null, 260);
  assert.strictEqual(noDates.aligned, false);
  assert.strictEqual(noDates.obs, null);
  assert.strictEqual(noDates.beta, 1.1579, '폴백 경로의 결과는 예전과 동일하다');
});

test('날짜 정렬 - 종목 간 상관계수도 공통 거래일 기준으로 계산된다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 25, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'B', ticker: '000660.KS', quantity: 25, buyPrice: 100000, currentPrice: 100000 })
  ];
  // 두 종목의 거래일이 전혀 겹치지 않는다.
  s.setDailyCloses('005930.KS', datedSeries(260, 0, 100000, 1.2, 1.0, '2025-01-01'));
  s.setDailyCloses('000660.KS', datedSeries(260, 0, 50000, 1.2, 1.0, '2026-06-01'));
  s.setDailyCloses('^KS11', { closes: zigzagCloses(600, 2500, 1.0, 0.9), volumes: volumes(600, 1, 1), dates: datesFrom(600, '2025-01-01') });
  const m = await s.computeAdvancedRiskMetrics();

  // 예전엔 최근 259개를 나란히 놓아 상관계수 1.0(운명공동체)이 나왔다.
  assert.strictEqual(m.weightedAvgCorrelation, null);
  assert.strictEqual(m.subScores.correlation, 50, '모르면 중립');
  assert.strictEqual(m.dataConfidence.score, 82, '상관 계산 불가가 신뢰도에 반영된다');
});

/* ==========================================================================
 * 9. Golden - 표준 포트폴리오의 전체 결과
 *    이 하나가 바뀌면 "Risk Score가 왜 바뀌었지?"를 즉시 알 수 있다.
 * ======================================================================= */

test('Golden - 표준 2종목 포트폴리오의 전체 지표', async () => {
  const s = buildStandardPortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();

  // 모집단/금액 (현금은 제외, 절세계좌 QQQM은 포함)
  assert.strictEqual(m.totalCur, 6300000);
  assert.deepStrictEqual(plain(m.holdings.map((h) => h.ticker)), ['005930.KS', 'QQQM']);
  assert.deepStrictEqual(plain(m.holdings.map((h) => h.curAmount)), [5000000, 1300000]);
  assert.deepStrictEqual(plain(m.holdings.map((h) => h.benchmarkKey)), ['KOSPI', 'NASDAQ100']);
  assert.strictEqual(m.missingCount, 0);

  // 집중도/상관/섹터
  assert.strictEqual(round(m.topWeight, 4), 79.3651);
  assert.strictEqual(round(m.hhi, 6), 0.672462);
  assert.strictEqual(round(m.weightedAvgCorrelation, 6), 1);
  assert.strictEqual(m.sectorExposure.topSector, '반도체');
  assert.strictEqual(round(m.sectorExposure.topSectorWeight, 4), 84.5238);

  // 위험 지표
  assert.strictEqual(round(m.portfolioBeta, 6), 1.101037);
  assert.strictEqual(round(m.portfolioVolatilityPct, 6), 16.315345);
  assert.strictEqual(round(m.portfolioMDDPct, 6), -0.938095);
  assert.strictEqual(round(m.var95Pct, 6), -0.938095);
  assert.strictEqual(round(m.cvarPct, 6), -0.938095);
  assert.strictEqual(m.volatilitySpike, false);

  // 6대 요인 + 종합 + 신뢰도 (Phase 40/42가 바꾸려는 값이 정확히 이것들이다)
  assert.deepStrictEqual(plain(m.subScores), {
    concentration: 100, volatility: 40, drawdown: 20, market: 55, correlation: 100, technical: 30
  });
  assert.strictEqual(m.riskScore, 66);
  assert.strictEqual(s.riskLevelFromScore(m.riskScore).label, '위험');
  assert.strictEqual(m.dataConfidence.score, 92);
});

test('Golden - 같은 입력을 두 번 계산하면 완전히 같은 결과가 나온다(외부 데이터 비의존)', async () => {
  const a = await buildStandardPortfolio(freshSandbox()).computeAdvancedRiskMetrics();
  const b = await buildStandardPortfolio(freshSandbox()).computeAdvancedRiskMetrics();
  assert.deepStrictEqual(plain(a.subScores), plain(b.subScores));
  assert.strictEqual(a.riskScore, b.riskScore);
  assert.strictEqual(a.portfolioBeta, b.portfolioBeta);
  assert.strictEqual(a.dataConfidence.score, b.dataConfidence.score);
});

test('Golden - 스트레스 시나리오 상수와 손실 추정(beta × 실측 낙폭)', async () => {
  const s = buildStandardPortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();

  // 하드코딩된 역사적 낙폭 상수 자체를 고정한다(Phase 36 미결 #8 - 출처 문서화는 backlog).
  assert.deepStrictEqual(plain(s.COVID_CRASH_BENCHMARK_DROP_PCT), { KOSPI: -35.7, KOSDAQ: -33.0, SP500: -33.9, NASDAQ100: -28.0, DOW: -37.1 });
  assert.deepStrictEqual(plain(s.RATE_HIKE_2022_BENCHMARK_DROP_PCT), { KOSPI: -28.6, KOSDAQ: -35.3, SP500: -25.4, NASDAQ100: -35.1, DOW: -21.2 });

  // 손실률 = Σ(비중 × beta × 그 종목 벤치마크의 실측 낙폭)
  //   2020: 0.793651×1.157895×(-35.7) + 0.206349×0.882353×(-28.0) = -37.905057
  //   2022: 0.793651×1.157895×(-28.6) + 0.206349×0.882353×(-35.1) = -32.673129
  assert.strictEqual(round(m.stressLossPct, 6), -37.905057);
  assert.strictEqual(round(m.stressLossPct2022, 6), -32.673129);
  assert.strictEqual(Math.round(m.stressLossKRW), Math.round(m.totalCur * m.stressLossPct / 100));
});
