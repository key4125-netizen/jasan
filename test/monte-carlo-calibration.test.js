// Monte Carlo Calibration - 자동 Regression (Phase 4) - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/monte-carlo-calibration.test.js
//
// [범위 - Regression vs Research 분리, Phase 4 조건부승인 항목 9] 이 파일은 "엔진이 바뀌면 반드시
// 계속 확인해야 하는 수학적/논리적 invariant"만 코드화한다. Parameter Sensitivity(수익률/변동성/
// 인플레이션 등 경제적 가정의 영향 크기), seed×simulation count 안정성 실측치 자체는 "한 번 수행하는
// calibration 연구"로 분류되어 이 파일에 포함하지 않는다(대화 기록/세션 보고서에 결과만 남김) - 그
// 숫자들은 baseline 포트폴리오가 바뀌면 매번 달라지므로 자동 테스트로 고정할 대상이 아니다.
//
// 여기 포함된 것: (1) σ=0 invariant를 여러 seed × 5k/10k/50k에 걸쳐 확인(Phase 4 이전엔 1개 케이스만
// 검증됐었다), (2) Fee/Growth monotonicity, (3) percentile 계산의 내부 일관성(알고리즘 자체를 바꾸지
// 않는다 - Phase 4에서 nearest-rank vs linear interpolation 차이가 무의미할 정도로 작음을 실측 확인,
// 이 회귀는 그 결론이 아니라 "지금 방식이 의도대로 계속 동작하는지"만 감시한다), (4) Goal Probability
// 기본 계산 검증.

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const engine = require(path.join(__dirname, '..', 'js', '15-monte-carlo-engine.js'));
// [Node 검증 - TEST FAILURE #2 수정] percentile()은 js/15의 내부 구현 함수이고 의도적으로
// module.exports에 없다(공개 API로 승격하지 않음 - 사용자 지시) - 이 파일은 반드시 공개 API인
// extractMilestoneStats를 통해서만 percentile 경계값/단조성/nearest-rank 특성을 검증한다.
const {
  computeMuGBM, computeDeterministicMonthlyFV, extractMilestoneStats,
  runMonthlyPrecisionMC
} = engine;

/* -------------------------------------------------------------------------
 * 1. σ=0 Invariant - 여러 seed × 5k/10k/50k 전 조합에서 deterministic과 정확히 일치해야 한다.
 *    [구조적 근거] σ=0이면 엔진 내부에서 sm=0이라 balances[i] *= exp(muM - 0 + 0*X[i])가 되어 랜덤
 *    shock(X, 즉 seed) 자체가 결과에 전혀 곱해지지 않는다 - "우연히 안정적"이 아니라 코드 구조상
 *    RNG를 참조하지 않는 것이 수학적으로 보장된다(Phase 4 Calibration Audit 실측: 9개 조합 spread=0).
 * ---------------------------------------------------------------------- */
test('Calibration 1 - σ=0은 여러 seed × 5k/10k/50k 전 조합에서 deterministic과 정확히 일치(spread=0)해야 한다', () => {
  const pv = 100000000, monthlyContribution = 1000000, years = 20;
  const instruments = [{ key: 'X', weight: 1, muAnnual: 0.11, sigmaAnnual: 0 }];
  const detFV = computeDeterministicMonthlyFV(pv, 0.11, years, monthlyContribution);
  const seeds = [1001, 2002, 3003];
  const counts = [5000, 10000, 50000];
  const allP50 = [];
  seeds.forEach((seed) => {
    counts.forEach((iterations) => {
      const r = runMonthlyPrecisionMC({ pv0: pv, instruments, correlationMatrix: [[1]], monthlyContribution, years, iterations, seed });
      allP50.push(r.milestones.at(-1).p50);
    });
  });
  const spread = Math.max(...allP50) - Math.min(...allP50);
  assert.strictEqual(spread, 0, `σ=0인데 seed/count 조합 간 결과가 달라짐(spread=${spread}) - 랜덤 요소가 새어들었을 위험`);
  const relErr = Math.abs((allP50[0] - detFV) / detFV);
  assert.ok(relErr < 1e-9, `σ=0 결과가 deterministic과 불일치: relErr=${relErr}`);
});

test('Calibration 1b - σ=0 invariant는 다자산 + fee + contribution growth가 섞여도 유지되어야 한다', () => {
  const instruments = [
    { key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0, feeRateAnnual: 0.005 },
    { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0, feeRateAnnual: 0.003 }
  ];
  const correlationMatrix = [[1, 0], [0, 1]];
  const seeds = [1001, 2002, 3003];
  const counts = [5000, 10000, 50000];
  const allP50 = [];
  seeds.forEach((seed) => {
    counts.forEach((iterations) => {
      const r = runMonthlyPrecisionMC({ pv0: 3e8, instruments, correlationMatrix, monthlyContribution: 3e6, contributionGrowthRate: 0.03, years: 20, iterations, seed });
      allP50.push(r.milestones.at(-1).p50);
    });
  });
  const spread = Math.max(...allP50) - Math.min(...allP50);
  assert.strictEqual(spread, 0, `다자산+fee+growth 조합에서도 σ=0이면 seed/count 무관하게 완전히 동일해야 한다(spread=${spread})`);
});

/* -------------------------------------------------------------------------
 * 2. Fee monotonicity - fee가 커질수록 P50이 작아져야 한다(여러 seed에서 재확인).
 * ---------------------------------------------------------------------- */
test('Calibration 2 - Fee monotonicity: fee 0% < 0.25%p < 0.50%p 순으로 P50이 감소해야 한다(3 seed)', () => {
  [111, 222, 333].forEach((seed) => {
    const config = (fee) => {
      const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20, feeRateAnnual: fee }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15, feeRateAnnual: fee }];
      return runMonthlyPrecisionMC({ pv0: 3e8, instruments, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, years: 20, iterations: 10000, seed }).milestones.at(-1).p50;
    };
    const p50_0 = config(0), p50_025 = config(0.0025), p50_050 = config(0.005);
    assert.ok(p50_0 > p50_025 && p50_025 > p50_050, `seed=${seed}에서 fee monotonicity 위반: ${p50_0} / ${p50_025} / ${p50_050}`);
  });
});

/* -------------------------------------------------------------------------
 * 3. Contribution Growth monotonicity - growth가 커질수록 P50이 커져야 한다(여러 seed에서 재확인).
 * ---------------------------------------------------------------------- */
test('Calibration 3 - Growth monotonicity: growth 0% < 2%p < 4%p 순으로 P50이 증가해야 한다(3 seed)', () => {
  [111, 222, 333].forEach((seed) => {
    const config = (growth) => {
      const instruments = [{ key: 'A', weight: 0.6, muAnnual: 0.10, sigmaAnnual: 0.20 }, { key: 'B', weight: 0.4, muAnnual: 0.08, sigmaAnnual: 0.15 }];
      return runMonthlyPrecisionMC({ pv0: 3e8, instruments, correlationMatrix: [[1, 0.3], [0.3, 1]], monthlyContribution: 3e6, contributionGrowthRate: growth, years: 20, iterations: 10000, seed }).milestones.at(-1).p50;
    };
    const p50_0 = config(0), p50_2 = config(0.02), p50_4 = config(0.04);
    assert.ok(p50_0 < p50_2 && p50_2 < p50_4, `seed=${seed}에서 growth monotonicity 위반: ${p50_0} / ${p50_2} / ${p50_4}`);
  });
});

/* -------------------------------------------------------------------------
 * 4. Percentile 계산 내부 일관성 - 알고리즘(nearest-rank) 자체는 바꾸지 않는다(Phase 4 정책 유지) -
 *    이 테스트는 "지금 방식이 의도대로 계속 동작하는지"만 감시한다.
 * ---------------------------------------------------------------------- */
test('Calibration 4 - percentile(공개 API인 extractMilestoneStats 경유): P10/P50/P90이 nearest-rank 공식(round(p/100*(n-1)))이 가리키는 값과 정확히 일치해야 한다', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const stats = extractMilestoneStats(sorted, []);
  // 독립 참조식 - private percentile()을 호출하지 않고, 문서화된 nearest-rank 공식을 그대로 재현해
  // "공개 API의 결과값"과 대조한다(Phase 3-3/3-4에서 이미 써온 것과 동일한 독립 참조 구현 패턴).
  const nearestRank = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
  assert.strictEqual(stats.p10, nearestRank(10));
  assert.strictEqual(stats.p50, nearestRank(50));
  assert.strictEqual(stats.p90, nearestRank(90));
});

test('Calibration 4b - percentile(공개 API 경유): 여러 표본 크기에서 p10<=p25<=p50<=p75<=p90 단조성이 유지되어야 한다', () => {
  [10, 100, 1000, 5000].forEach((n) => {
    const samples = Array.from({ length: n }, (_, i) => i); // 이미 정렬된 배열이든 아니든 extractMilestoneStats가 내부에서 정렬함
    const stats = extractMilestoneStats(samples, []);
    assert.ok(stats.p10 <= stats.p25 && stats.p25 <= stats.p50 && stats.p50 <= stats.p75 && stats.p75 <= stats.p90,
      `n=${n}에서 단조성 위반: ${JSON.stringify(stats)}`);
  });
});

test('Calibration 4c - percentile(공개 API 경유): nearest-rank(P10/P50/P90)와 linear interpolation의 차이가 표본오차보다 훨씬 작아야 한다(정책 근거 재확인)', () => {
  // Phase 4 Calibration Research에서 실측된 결론(상대차이 <0.01%, n=5000 기준)을 이 회귀가 계속 지킨다.
  const n = 5000;
  const sorted = Array.from({ length: n }, () => Math.random() * 1e9).sort((a, b) => a - b);
  const stats = extractMilestoneStats(sorted, []);
  function linearInterp(arr, p) {
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }
  [[10, 'p10'], [50, 'p50'], [90, 'p90']].forEach(([p, key]) => {
    const nr = stats[key];
    const li = linearInterp(sorted, p);
    const relDiff = Math.abs((nr - li) / li);
    assert.ok(relDiff < 0.001, `p=${p}에서 nearest-rank/linear-interp 차이가 예상보다 큼: relDiff=${relDiff}`);
  });
});

/* -------------------------------------------------------------------------
 * 5. Goal Probability 기본 계산 검증
 * ---------------------------------------------------------------------- */
test('Calibration 5 - Goal Probability는 count(sample>=goal)/n과 정확히 일치해야 한다', () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const stats = extractMilestoneStats(samples, [55, 10, 1000, 100]);
  assert.strictEqual(stats.goalProbability[55], 5 / 10); // 60,70,80,90,100 >= 55
  assert.strictEqual(stats.goalProbability[10], 10 / 10); // 전부 >= 10
  assert.strictEqual(stats.goalProbability[1000], 0 / 10); // 전부 미달
  assert.strictEqual(stats.goalProbability[100], 1 / 10); // 100만 >= 100
});

test('Calibration 5b - Goal Probability는 목표금액이 낮을수록 단조 비감소해야 한다', () => {
  const samples = Array.from({ length: 2000 }, () => Math.random() * 1e9);
  const goals = [1e8, 3e8, 5e8, 7e8, 9e8];
  const stats = extractMilestoneStats(samples, goals);
  let prevProb = 1;
  goals.forEach((g) => {
    const p = stats.goalProbability[g];
    assert.ok(p <= prevProb, `목표금액 ${g}에서 확률이 이전보다 커짐(단조성 위반)`);
    prevProb = p;
  });
});
