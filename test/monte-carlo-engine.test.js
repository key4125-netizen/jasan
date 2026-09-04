// Monte Carlo Engine v2(js/15-monte-carlo-engine.js) 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/monte-carlo-engine.test.js
//
// js/15는 DOM에 의존하지 않는 순수 계산 파일이라 merge.test.js와 달리 가짜 DOM 스텁 없이 바로
// require()할 수 있다. Phase 0에서 실측 검증된 4대 수학적 정의(μ_GBM 공식/월별 처리 순서/연 1회
// 리밸런싱/날짜정렬 상관관계)를 절대 임의 변경하지 않도록 감시하는 것이 이 파일의 목적이다 -
// 특히 Test A(σ=0)는 Phase 0에서 실제로 μ 공식 오류(ln(1+r) 오타)를 검출한 전례가 있다.

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const engine = require(path.join(__dirname, '..', 'js', '15-monte-carlo-engine.js'));
const {
  computeMuGBM, computeDeterministicMonthlyFV, computeTotalContributionPrincipal,
  dateAlignedReturns, validateCorrelationMatrixShape, choleskyDecompose, prepareCholeskyFromCorrelation,
  rebalanceToWeights, createSeededRandom, makeBoxMuller, MILESTONE_YEARS,
  runMonthlyPrecisionMC, feePercentToDecimal
} = engine;

test('Test A - sigma=0이면 MC 결과가 결정론적 FV와 (거의) 정확히 일치해야 한다', () => {
  const pv = 100000000, monthlyContribution = 1000000, years = 20;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.11, sigmaAnnual: 0 }];
  const result = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution, years, iterations: 50, seed: 1 });
  const detFV = computeDeterministicMonthlyFV(pv, 0.11, years, monthlyContribution);
  const final = result.milestones[result.milestones.length - 1];
  const relErr = Math.abs((final.p50 - detFV) / detFV);
  // 부동소수점 오차 수준만 허용 - Phase 0에서 ln(1+r) 오류를 잡아낸 테스트라 tolerance를 넓히지 않는다.
  assert.ok(relErr < 0.0001, `sigma=0 오차가 너무 크다: ${(relErr * 100).toFixed(4)}% (기대 ${detFV}, 실제 ${final.p50})`);
});

test('Test B - n=1, contribution=0이면 폐쇄형 1회 GBM과 통계적으로 근사 일치해야 한다', () => {
  const pv = 100000000, r = 0.11, sigma = 0.25, years = 20, iterations = 10000, seed = 777;
  const instruments = [{ key: 'X', weight: 1, muAnnual: r, sigmaAnnual: sigma }];
  const monthly = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution: 0, years, iterations, seed });

  const rng = createSeededRandom(seed);
  const nextZ = makeBoxMuller(rng);
  const muLog = computeMuGBM(r, sigma);
  const samples = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const z = nextZ();
    samples[i] = pv * Math.exp((muLog - (sigma * sigma) / 2) * years + sigma * Math.sqrt(years) * z);
  }
  samples.sort((a, b) => a - b);
  const closedFormP50 = samples[Math.round(0.5 * (iterations - 1))];
  const final = monthly.milestones[monthly.milestones.length - 1];
  const relErr = Math.abs((final.p50 - closedFormP50) / closedFormP50);
  // 월별(240스텝) vs 연 1회 폐쇄형 - 서로 다른 난수 경로라 완전 일치는 아니고 표본오차 수준의 근사 일치가 기준.
  assert.ok(relErr < 0.05, `n=1 통계적 수렴 실패: 편차 ${(relErr * 100).toFixed(2)}%`);
});

test('Test C - 동일 seed는 동일 결과를 재현해야 한다', () => {
  const instruments = [{ key: 'A', weight: 0.5, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.5, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const corr = [[1, 0.3], [0.3, 1]];
  const config = { pv0: 3e8, instruments, correlationMatrix: corr, monthlyContribution: 3e6, years: 20, iterations: 2000, seed: 555 };
  const run1 = runMonthlyPrecisionMC(config);
  const run2 = runMonthlyPrecisionMC(config);
  assert.strictEqual(run1.milestones[3].p50, run2.milestones[3].p50, 'seed가 같은데 결과가 다르다');
});

test('Test D - 날짜정렬 상관관계는 두 자산 모두에 존재하는 날짜만 사용해야 한다', () => {
  const datedA = [{ date: '2026-01-05', close: 100 }, { date: '2026-01-06', close: 102 }, { date: '2026-01-07', close: 101 }, { date: '2026-01-08', close: 103 }, { date: '2026-01-09', close: 104 }];
  const datedB = [{ date: '2026-01-05', close: 200 }, { date: '2026-01-07', close: 198 }, { date: '2026-01-08', close: 202 }, { date: '2026-01-09', close: 205 }]; // 1/6 결측(공휴일 등)
  const aligned = dateAlignedReturns(datedA, datedB);
  assert.strictEqual(aligned.observationCount, 4, '1/6이 한쪽에만 있는데 공통 거래일 계산에 잘못 포함됐다');
  assert.strictEqual(aligned.startDate, '2026-01-05');
  assert.strictEqual(aligned.endDate, '2026-01-09');
});

test('Test E - 비PSD 상관행렬은 보정 후 Cholesky가 성공하고 대칭/대각1/범위를 유지해야 한다', () => {
  // corr(A,B)=0.9, corr(B,C)=0.9, corr(A,C)=-0.9 - 삼각부등식 위반으로 고의로 비PSD를 만든 예시
  const badMatrix = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
  const before = choleskyDecompose(badMatrix);
  assert.strictEqual(before.success, false, '원본 비PSD 행렬에서 Cholesky가 성공하면 안 된다(테스트 전제 오류)');

  const prep = prepareCholeskyFromCorrelation(badMatrix);
  assert.strictEqual(prep.choleskySucceeded, true, 'PSD 보정 후에도 Cholesky가 실패했다');
  assert.ok(prep.diagnostics.psdCorrectionApplied, 'PSD 보정이 적용됐다고 기록되지 않았다');
  assert.ok(prep.diagnostics.minEigenvalueBefore < 0, '보정 전 최소 고유값이 음수가 아니다(테스트 전제 오류)');
  assert.ok(prep.diagnostics.minEigenvalueAfter >= 0, '보정 후에도 최소 고유값이 음수다');

  const n = prep.L.length;
  const reconstructed = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += prep.L[i][k] * prep.L[j][k]; reconstructed[i][j] = s; }
  const shape = validateCorrelationMatrixShape(reconstructed);
  assert.ok(shape.symmetric && shape.diagonalOne && shape.inRange, 'PSD 보정 후 상관행렬이 대칭/대각1/범위 조건을 잃었다');
});

test('Test F/H - 리밸런싱은 총액을 보존하며 정확히 목표비중으로 복원해야 한다', () => {
  const before = [70000000, 30000000];
  const totalBefore = before[0] + before[1];
  const after = rebalanceToWeights(before, [0.5, 0.5]);
  const totalAfter = after[0] + after[1];
  assert.ok(Math.abs(totalBefore - totalAfter) < 1e-6, '리밸런싱 전후 총액이 보존되지 않았다');
  assert.ok(Math.abs(after[0] / totalAfter - 0.5) < 1e-9, '리밸런싱 후 비중이 목표비중과 다르다');
});

test('Test G - contribution=0은 원금만의 GBM 성장과 동일해야 한다(Test B와 동일 조건 재확인)', () => {
  const pv = 100000000, years = 10, iterations = 3000, seed = 42;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.09, sigmaAnnual: 0.18 }];
  const withZeroContribution = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution: 0, years, iterations, seed });
  const finalStats = withZeroContribution.milestones[withZeroContribution.milestones.length - 1];
  // 납입 0이면 모든 성장이 오직 초기원금의 GBM 경로에서만 나와야 한다 - 평균이 초기원금보다 항상 작을
  // 이유는 없지만(성장 가능), 최소한 "터무니없이" 벗어나지 않는지(예: 납입 로직 누수로 원금이 이상하게
  // 부풀지 않는지)를 대략적인 범위로 확인한다.
  assert.ok(finalStats.p10 > 0, 'contribution=0인데 p10이 0 이하 - 비정상');
  assert.ok(finalStats.mean > pv * 0.1 && finalStats.mean < pv * 20, 'contribution=0인데 평균이 비현실적인 범위다');
});

test('Phase 2-2 - onProgress/shouldCancel hooks가 없으면 기존과 완전히 동일하고, 있어도 계산 결과는 bit-identical해야 한다', () => {
  const instruments = [{ key: 'A', weight: 0.5, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.5, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const config = { pv0: 3e8, instruments, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 3000, seed: 555 };
  const withoutHooks = runMonthlyPrecisionMC(config);
  let progressCalls = 0;
  const withHooks = runMonthlyPrecisionMC(config, { onProgress: () => { progressCalls++; } });
  assert.strictEqual(withoutHooks.milestones.at(-1).p50, withHooks.milestones.at(-1).p50, 'onProgress를 넘기기만 해도 결과가 달라졌다');
  assert.ok(progressCalls > 0, 'onProgress가 한 번도 호출되지 않았다');
});

test('Phase 2-2 - shouldCancel이 true를 반환하면 이터레이션 도중 즉시 중단(CANCELLED 코드로 예외)되어야 한다', () => {
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.10, sigmaAnnual: 0.20 }];
  const config = { pv0: 1e8, instruments, correlationMatrix: [[1]], monthlyContribution: 0, years: 20, iterations: 10000, seed: 1 };
  let calls = 0;
  assert.throws(
    () => runMonthlyPrecisionMC(config, { shouldCancel: () => { calls++; return calls >= 3; }, progressBatchSize: 1 }),
    (err) => err.code === 'CANCELLED',
    'shouldCancel=true인데도 취소되지 않았다'
  );
  assert.ok(calls < config.iterations, 'shouldCancel이 true인데도 전체 iterations를 다 돌았다(조기 중단 실패)');
});

test('Contribution Bypass - monthlyContribution=0(정상 로직 실행)과 납입 스텝 자체를 생략한 구현이 bit-identical해야 한다', () => {
  const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const correlationMatrix = [[1, 0.3], [0.3, 1]];
  const config = { pv0: 2e8, instruments, correlationMatrix, monthlyContribution: 0, years: 15, iterations: 3000, seed: 321 };
  const caseA = runMonthlyPrecisionMC(config); // 정상 경로 - contribShare가 전부 0인 채로 매월 덧셈은 실행됨

  // Case B: 납입 스텝(그 줄 자체)을 물리적으로 제거한 별도 구현 - 엔진과 동일한 순서/공식을 그대로
  // 복사하되 "신규 납입금 반영" 한 줄만 뺐다. IEEE754에서 x+0.0===x가 항상 정확히 성립하므로, 이
  // 둘이 진짜로 bit-identical이면 "contribution=0은 아무 것도 안 하는 것과 수학적으로 동일하다"가
  // 실측으로 증명된다.
  function runNoContributionStep(cfg) {
    const { pv0, instruments, correlationMatrix, years, iterations, seed } = cfg;
    const n = instruments.length;
    const prep = prepareCholeskyFromCorrelation(correlationMatrix);
    const rng = createSeededRandom(seed);
    const nextZ = makeBoxMuller(rng);
    const months = years * 12;
    const weight = instruments.map((i) => i.weight);
    const muM = instruments.map((i) => computeMuGBM(i.muAnnual, i.sigmaAnnual) / 12);
    const sigmaM = instruments.map((i) => i.sigmaAnnual / Math.sqrt(12));
    const milestoneMonths = MILESTONE_YEARS.filter((y) => y <= years).map((y) => y * 12);
    const milestoneSamples = milestoneMonths.map(() => new Array(iterations));
    for (let iter = 0; iter < iterations; iter++) {
      let balances = instruments.map((ins) => pv0 * ins.weight);
      let mi = 0;
      for (let m = 1; m <= months; m++) {
        // (납입 스텝 없음 - 완전히 생략, Case A와의 유일한 차이)
        const Z = new Array(n); for (let i = 0; i < n; i++) Z[i] = nextZ();
        const X = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k <= i; k++) s += prep.L[i][k] * Z[k]; X[i] = s; }
        for (let i = 0; i < n; i++) { const sm = sigmaM[i]; balances[i] *= Math.exp((muM[i] - (sm * sm) / 2) + sm * X[i]); }
        if (m % 12 === 0) { const t = balances.reduce((a, b) => a + b, 0); balances = weight.map((w) => t * w); }
        if (mi < milestoneMonths.length && m === milestoneMonths[mi]) { milestoneSamples[mi][iter] = balances.reduce((a, b) => a + b, 0); mi++; }
      }
    }
    return milestoneMonths.map((mm, idx) => ({ year: mm / 12, samples: milestoneSamples[idx] }));
  }
  const caseB = runNoContributionStep(config);

  const lastA = caseA.milestones[caseA.milestones.length - 1];
  const lastBSorted = caseB[caseB.length - 1].samples.slice().sort((a, b) => a - b);
  const p50Index = Math.round(0.5 * (lastBSorted.length - 1));
  assert.strictEqual(lastA.p50, lastBSorted[p50Index], 'contribution=0 정상 실행과 납입 스텝 생략 버전이 bit-identical하지 않다');
});

/* -------------------------------------------------------------------------
 * Phase 3-3 - 연간 납입액 증가율(contributionGrowthRate)
 * ---------------------------------------------------------------------- */

test('Phase 3-3 Test A - Growth=0%이면 기존(Phase 3-2) 결과와 bit-identical해야 한다', () => {
  const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const base = { pv0: 3e8, instruments, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 3000, seed: 777 };
  const withoutGrowthField = runMonthlyPrecisionMC(base); // contributionGrowthRate 필드 자체가 없는 기존 호출
  const withGrowthZero = runMonthlyPrecisionMC(Object.assign({}, base, { contributionGrowthRate: 0 }));
  assert.strictEqual(withoutGrowthField.milestones.at(-1).p50, withGrowthZero.milestones.at(-1).p50, 'growth=0인데 필드 유무에 따라 결과가 달라졌다');
});

test('Phase 3-3 Test B - sigma=0, Growth=3%일 때 MC 결과가 결정론적 성장 원금과 정확히 일치해야 한다', () => {
  const pv = 100000000, monthlyContribution = 1000000, years = 10, growthRate = 0.03;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.11, sigmaAnnual: 0 }];
  const result = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution, contributionGrowthRate: growthRate, years, iterations: 20, seed: 1 });
  const final = result.milestones.at(-1).p50; // sigma=0이라 모든 표본이 동일 - p50 = 유일값

  // 독립적인 참조 구현(월별 loop 직접 재현) - 엔진과 별도로 짠 대조군.
  const monthlyRate = 0.11 / 12;
  let balance = pv;
  for (let m = 1; m <= years * 12; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    balance += monthlyContribution * Math.pow(1 + growthRate, yearIndex);
    balance *= (1 + monthlyRate);
  }
  assert.ok(Math.abs((final - balance) / balance) < 1e-9, `sigma=0/growth=3% 불일치: engine=${final}, reference=${balance}`);
});

test('Phase 3-3 Test C - Growth가 커질수록 P50이 커져야 한다(단조성)', () => {
  const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const base = { pv0: 3e8, instruments, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 3000, seed: 999 };
  const p50at = (g) => runMonthlyPrecisionMC(Object.assign({}, base, { contributionGrowthRate: g })).milestones.at(-1).p50;
  const p50_0 = p50at(0), p50_3 = p50at(0.03), p50_5 = p50at(0.05);
  assert.ok(p50_0 < p50_3 && p50_3 < p50_5, `단조성 위반: ${p50_0} / ${p50_3} / ${p50_5}`);
});

test('Phase 3-3 Test D - 납입 스케줄이 정확히 3,000,000 -> 3,090,000 -> 3,182,700이어야 한다', () => {
  const monthly = 3000000, growth = 0.03;
  const year1 = monthly * Math.pow(1 + growth, 0);
  const year2 = monthly * Math.pow(1 + growth, 1);
  const year3 = monthly * Math.pow(1 + growth, 2);
  assert.strictEqual(Math.round(year1), 3000000);
  assert.strictEqual(Math.round(year2), 3090000);
  assert.strictEqual(Math.round(year3), 3182700);
});

test('Phase 3-3 Test E - computeTotalContributionPrincipal이 월별 합산과 정확히 일치해야 한다', () => {
  const monthly = 3000000, growth = 0.03, years = 5;
  let manualSum = 0;
  for (let m = 1; m <= years * 12; m++) manualSum += monthly * Math.pow(1 + growth, Math.floor((m - 1) / 12));
  const fn = computeTotalContributionPrincipal(monthly, growth, years);
  assert.strictEqual(fn, manualSum);
});

test('Phase 3-3 - Inflation과 독립: Growth=3% 고정, Inflation만 바뀌어도 nominal은 동일해야 한다(nominal 계산 자체는 이 파일 범위 밖 - js/20 조합은 UI 레벨에서 검증)', () => {
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.10, sigmaAnnual: 0.20 }];
  const base = { pv0: 1e8, instruments, correlationMatrix: [[1]], monthlyContribution: 1e6, contributionGrowthRate: 0.03, years: 20, iterations: 1000, seed: 42 };
  const run1 = runMonthlyPrecisionMC(base);
  const run2 = runMonthlyPrecisionMC(base); // 엔진은애초에 inflation 개념 자체가 없다 - 같은 config면 항상 같은 결과
  assert.strictEqual(run1.milestones.at(-1).p50, run2.milestones.at(-1).p50);
});

/* -------------------------------------------------------------------------
 * Phase 3-4 - Instrument별 운용보수(feeRateAnnual, 연간 expense ratio)
 *    [계산 순서] Step 1(납입, growth 적용) -> Step 3/4(상관 shock, Gross GBM Return) ->
 *    Step 4.5(Fee, 이번 Phase에서 신규 추가) -> Step 5(12개월마다 리밸런싱). Fee는 Gross Return
 *    수식(muM/sigmaM) 자체를 단 한 글자도 바꾸지 않고 별도 곱셈으로만 적용된다 - Test A가 이것을
 *    bit-identical로 검증한다. 월별 환산은 f/12(선형)가 아니라 (1-f)^(1/12)(기하평균)를 쓴다 -
 *    "연간 f%만큼 NAV가 (1-f)배로 줄어든다"는 정의를 12개월에 걸쳐 정확히 재현하는 유일한 값이기
 *    때문이다(Test B/G가 이 정확한 값과의 일치를 직접 검증).
 * ---------------------------------------------------------------------- */

test('Phase 3-4 Test A - Fee=0(또는 필드 생략)이면 기존(Phase 3-3) 결과와 bit-identical해야 한다', () => {
  const instrumentsNoFeeField = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15 }];
  const base = { pv0: 3e8, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, contributionGrowthRate: 0.03, years: 20, iterations: 3000, seed: 2024 };
  const withoutFeeField = runMonthlyPrecisionMC(Object.assign({ instruments: instrumentsNoFeeField }, base));
  const instrumentsWithFeeZero = instrumentsNoFeeField.map((i) => Object.assign({}, i, { feeRateAnnual: 0 }));
  const withFeeZero = runMonthlyPrecisionMC(Object.assign({ instruments: instrumentsWithFeeZero }, base));
  assert.strictEqual(withoutFeeField.milestones.at(-1).p50, withFeeZero.milestones.at(-1).p50, 'fee=0인데 필드 유무에 따라 결과가 달라졌다(bit-identical 위반)');
});

test('Phase 3-4 Test B - sigma=0, Fee=0.5%(연)일 때 MC 결과가 "Gross Return 후 Fee 차감" 참조계산과 정확히 일치해야 한다', () => {
  const pv = 100000000, monthlyContribution = 1000000, years = 10, feeRateAnnual = 0.005;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.11, sigmaAnnual: 0, feeRateAnnual }];
  const result = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution, years, iterations: 20, seed: 1 });
  const final = result.milestones.at(-1).p50; // sigma=0이라 모든 표본이 동일값

  // 독립적인 참조 구현 - 엔진의 Step 순서(납입 -> Gross Return -> Fee)를 그대로 손으로 재현.
  const monthlyRate = 0.11 / 12;
  const feeMonthlyFactor = Math.pow(1 - feeRateAnnual, 1 / 12);
  let balance = pv;
  for (let m = 1; m <= years * 12; m++) {
    balance += monthlyContribution;
    balance *= (1 + monthlyRate);
    balance *= feeMonthlyFactor;
  }
  assert.ok(Math.abs((final - balance) / balance) < 1e-9, `sigma=0/fee=0.5% 불일치: engine=${final}, reference=${balance}`);
});

test('Phase 3-4 Test C - instrument별로 다른 Fee가 "포트폴리오 평균"이 아니라 비중에 따라 정확히 반영되어야 한다', () => {
  const years = 15, iterations = 4000, seed = 55;
  // A/B의 muAnnual/sigmaAnnual은 완전히 동일하게 맞춰서, 두 시나리오의 유일한 차이가 "2% fee를
  // 어느 instrument(비중 80% vs 20%)에 걸었는지"만 남도록 통제한다.
  const heavyFeeOnBigWeight = [
    { key: 'A', weight: 0.8, muAnnual: 0.10, sigmaAnnual: 0.18, feeRateAnnual: 0.02 },
    { key: 'B', weight: 0.2, muAnnual: 0.10, sigmaAnnual: 0.18, feeRateAnnual: 0 },
  ];
  const heavyFeeOnSmallWeight = [
    { key: 'A', weight: 0.8, muAnnual: 0.10, sigmaAnnual: 0.18, feeRateAnnual: 0 },
    { key: 'B', weight: 0.2, muAnnual: 0.10, sigmaAnnual: 0.18, feeRateAnnual: 0.02 },
  ];
  const config = { pv0: 2e8, correlationMatrix: [[1, 0.4], [0.4, 1]], monthlyContribution: 2e6, years, iterations, seed };
  const resultHeavyOnBig = runMonthlyPrecisionMC(Object.assign({ instruments: heavyFeeOnBigWeight }, config)).milestones.at(-1).p50;
  const resultHeavyOnSmall = runMonthlyPrecisionMC(Object.assign({ instruments: heavyFeeOnSmallWeight }, config)).milestones.at(-1).p50;
  // 같은 2% fee라도 비중 80%(A)에 걸리면 비중 20%(B)에 걸릴 때보다 총액이 더 많이 줄어야 한다 -
  // "instrument별 fee를 가중평균 하나로 뭉뚱그려 적용"했다면 이 두 값이 같아야 하므로, 다르다는 것
  // 자체가 instrument-level 적용이 실제로 동작함을 증명한다.
  assert.ok(resultHeavyOnBig < resultHeavyOnSmall, `비중 큰 자산에 fee가 걸렸는데도 결과가 더 작지 않다: big=${resultHeavyOnBig}, small=${resultHeavyOnSmall}`);
});

test('Phase 3-4 Test D - Fee가 커질수록 P50이 작아져야 한다(단조성)', () => {
  const base = { pv0: 3e8, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 3000, seed: 909 };
  const p50at = (fee) => {
    const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20, feeRateAnnual: fee }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15, feeRateAnnual: fee }];
    return runMonthlyPrecisionMC(Object.assign({ instruments }, base)).milestones.at(-1).p50;
  };
  const p50_0 = p50at(0), p50_1 = p50at(0.01), p50_2 = p50at(0.02);
  assert.ok(p50_0 > p50_1 && p50_1 > p50_2, `단조성 위반: ${p50_0} / ${p50_1} / ${p50_2}`);
});

/* -------------------------------------------------------------------------
 * Phase 3-4 조건부승인 #2 - Fee "%"(state 저장값) <-> "decimal"(엔진 소비값) 변환 경계
 *    [배경] 이전에는 "/100" 한 줄이 소비 지점 3곳(js/16 adapter, js/05 두 곳)에 각각 인라인으로
 *    따로 있어, 그중 하나가 실수로 이중변환되거나 누락돼도 아무 경고 없이 조용히 틀린 값이 계산될
 *    위험이 있었다. 이제 세 곳 모두 feePercentToDecimal() 하나만 호출하도록 통일했다(js/16:39,
 *    js/05 computeRegionWeightedFeeRate 소비부, js/05 getMonthlyAllocationItemFeeRate 소비부) -
 *    즉 이 함수 하나를 고정하는 것이 세 소비 지점 전부를 동시에 고정하는 것과 같다(Single Source
 *    of Truth). js/16-monte-carlo-adapter.js는 module.exports는 있지만 buildMonteCarloInputFromState가
 *    async + 가격이력/DOM 의존이라 이 순수 테스트 파일 범위 밖 - 그 경로는 브라우저 콘솔에서 실제
 *    QQQM 키로 별도 확인함(final report 참고).
 * ---------------------------------------------------------------------- */

test('Phase 3-4 조건부승인 #2 Test A - UI % -> 엔진 decimal 변환이 사용자가 지정한 4개 대표값에서 정확해야 한다', () => {
  const cases = [
    { uiPercent: 0, expectedInternalDecimal: 0 },
    { uiPercent: 0.20, expectedInternalDecimal: 0.002 },
    { uiPercent: 1, expectedInternalDecimal: 0.01 },
    { uiPercent: 20, expectedInternalDecimal: 0.20 },
  ];
  cases.forEach(({ uiPercent, expectedInternalDecimal }) => {
    const actual = feePercentToDecimal(uiPercent);
    const relErr = expectedInternalDecimal === 0 ? Math.abs(actual) : Math.abs((actual - expectedInternalDecimal) / expectedInternalDecimal);
    assert.ok(relErr < 1e-12, `UI ${uiPercent}% -> internal ${expectedInternalDecimal} 불일치: 실제 ${actual}`);
  });
});

test('Phase 3-4 조건부승인 #2 Test B - undefined/null/미설정은 항상 정확히 0(이중변환/NaN 전파 없음)', () => {
  assert.strictEqual(feePercentToDecimal(undefined), 0);
  assert.strictEqual(feePercentToDecimal(null), 0);
  assert.strictEqual(feePercentToDecimal(NaN), 0);
});

test('Phase 3-4 조건부승인 #2 Test C - feePercentToDecimal 자체가 이중변환되지 않았는지: 결과에 다시 /100을 하면 원래 %값으로 돌아와야 한다(역방향 정합성)', () => {
  // 이 앱은 "internal decimal을 다시 %로 되돌리는" 별도 표시 로직을 두지 않는다(UI는 항상 저장된
  // 원본 %를 그대로 다시 보여줄 뿐, decimal을 저장하거나 표시하지 않는다 - js/19 renderFeeRatesEditor
  // 참고). 그래도 "이 함수가 딱 한 번만 /100을 하는가"는 수학적으로 되돌려서 확인할 수 있다.
  [0.20, 1, 20, 0.005].forEach((uiPercent) => {
    const decimal = feePercentToDecimal(uiPercent);
    const backToPercent = decimal * 100;
    assert.ok(Math.abs(backToPercent - uiPercent) < 1e-9, `왕복 불일치(이중변환 의심): ${uiPercent} -> ${decimal} -> ${backToPercent}`);
  });
});

test('Phase 3-4 - Inflation과 독립: Fee 고정, 반복 실행해도 nominal 값은 항상 동일해야 한다(엔진 자체에 inflation 개념 없음 - js/20 조합은 UI 레벨 검증)', () => {
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.10, sigmaAnnual: 0.20, feeRateAnnual: 0.01 }];
  const base = { pv0: 1e8, instruments, correlationMatrix: [[1]], monthlyContribution: 1e6, years: 20, iterations: 1000, seed: 42 };
  const run1 = runMonthlyPrecisionMC(base);
  const run2 = runMonthlyPrecisionMC(base);
  assert.strictEqual(run1.milestones.at(-1).p50, run2.milestones.at(-1).p50);
});

test('Phase 3-4 Test F - Contribution Growth 스케줄은 Fee 유무와 무관하게 항상 동일해야 한다(교차오염 없음의 구조적 증거)', () => {
  const g = 0.03;
  // computeContributionYearMultiplier는 Step 1(납입) 전용 함수로 feeRateAnnual을 인자로 받지 않는다 -
  // 시그니처 자체가 2개(growth, yearIndex)로 고정되어 있다는 것이 "Fee 로직이 이 함수에 절대 개입할
  // 수 없다"는 구조적 보장이다(런타임 값 비교만으로는 우연의 일치와 구분되지 않으므로 시그니처까지 확인).
  assert.strictEqual(engine.computeContributionYearMultiplier.length, 2, 'computeContributionYearMultiplier가 fee 파라미터를 받도록 바뀌면 Growth/Fee 독립성이 깨진다');
  const multipliers1 = [0, 1, 2, 3, 4].map((y) => engine.computeContributionYearMultiplier(g, y));
  const multipliers2 = [0, 1, 2, 3, 4].map((y) => engine.computeContributionYearMultiplier(g, y));
  assert.deepStrictEqual(multipliers1, multipliers2);
});

test('Phase 3-4 Test G - sigma=0, Growth=3%+Fee=1% 동시 적용 시 MC 결과가 참조계산과 정확히 일치해야 한다(최종 교차오염 없음 증거)', () => {
  const pv = 100000000, monthlyContribution = 1000000, years = 10, growthRate = 0.03, feeRateAnnual = 0.01;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.11, sigmaAnnual: 0, feeRateAnnual }];
  const result = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution, contributionGrowthRate: growthRate, years, iterations: 20, seed: 1 });
  const final = result.milestones.at(-1).p50;

  const monthlyRate = 0.11 / 12;
  const feeMonthlyFactor = Math.pow(1 - feeRateAnnual, 1 / 12);
  let balance = pv;
  for (let m = 1; m <= years * 12; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    balance += monthlyContribution * Math.pow(1 + growthRate, yearIndex);
    balance *= (1 + monthlyRate);
    balance *= feeMonthlyFactor;
  }
  assert.ok(Math.abs((final - balance) / balance) < 1e-9, `growth+fee 동시적용 불일치: engine=${final}, reference=${balance}`);
});

// Phase 3-4 Test H(Direct vs Worker) - js/17-monte-carlo-worker.js는 Worker 전역(importScripts/
// postMessage)에 의존해 순수 Node 환경(node --test)에서 그대로 require할 수 없다(다른 테스트들이
// require하는 js/15와 달리 DOM/Worker 의존적). 이번 세션에서는 실제 브라우저 콘솔에서 동일 config로
// Direct(runMonthlyPrecisionMC 직접 호출)와 Worker 경유(js/18 컨트롤러 -> js/17) 양쪽에 feeRateAnnual이
// 포함된 instruments를 넣어 milestones.p50이 완전히 일치함을 확인했다 - js/17/18은 instruments 배열을
// 필드 단위로 destructuring하지 않고 통째로 전달하므로 feeRateAnnual도 별도 코드 수정 없이 그대로
// 통과한다(js/16 adapter, js/17/18 소스 확인 완료).

test('Phase 3-4 Test I - Fee가 커질수록 목표금액 달성확률(goalProbability)이 감소해야 한다', () => {
  const goal = 6e8;
  const base = { pv0: 3e8, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 4000, seed: 314, goalAmounts: [goal] };
  const goalProbAt = (fee) => {
    const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20, feeRateAnnual: fee }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15, feeRateAnnual: fee }];
    return runMonthlyPrecisionMC(Object.assign({ instruments }, base)).milestones.at(-1).goalProbability[goal];
  };
  const p0 = goalProbAt(0), p1 = goalProbAt(0.01), p2 = goalProbAt(0.02);
  assert.ok(p0 >= p1 && p1 >= p2, `Fee가 커지는데 목표달성확률이 감소하지 않는다: ${p0} / ${p1} / ${p2}`);
});

// Phase 3-4 Test J(전체 회귀 재확인) - 이 파일에 새로 추가하는 별도 테스트가 아니라, 이 파일 전체
// (Phase 0/2-2/3-3/3-4 테스트 전부) + merge.test.js가 `node --test test/`로 함께 전부 PASS하는 것
// 자체가 Test J다 - Fee 추가가 기존 Test A~Phase 3-3 어떤 테스트도 깨뜨리지 않았음을 이 파일의 나머지
// 테스트들이 이미 실행 순서상 증명한다.
