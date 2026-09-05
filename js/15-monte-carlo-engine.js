/* -------------------------------------------------------------------------
 * 25. 미래자산 예측 v2 - 자산별 상관관계 반영 Monte Carlo 엔진 (Phase 0 검증 기반)
 *    - [설계 배경] 기존 js/05의 runMonteCarloSimulation()은 포트폴리오 전체를 스칼라 μ/σ 하나로
 *      뭉개서 GBM 1회 폐쇄형 공식으로 계산했다 - 자산별 상관관계가 시뮬레이션 자체에 반영되지 않았고,
 *      원표본을 버려 목표달성확률도 낼 수 없었다. 이 파일은 그 문제를 해결하는 새 엔진이며, 기존 함수는
 *      건드리지 않고 병행 추가한다(하위호환 - 기존 화면은 그대로 동작).
 *    - [순수 계산 엔진] 이 파일은 DOM을 전혀 건드리지 않는다 - UI 연동은 별도 파일(향후 작업)에서
 *      이 파일이 내보내는 함수만 호출한다. test/monte-carlo-engine.test.js가 Node에서 이 파일 하나만
 *      독립적으로 require()해 검증할 수 있는 것도 이 때문이다(merge.test.js와 동일한 패턴).
 *    - [수학적 정의 - 절대 임의 변경 금지] 아래 네 가지는 Phase 0에서 실측 검증을 거쳐 확정됐다:
 *      ① μ_GBM = 12·ln(1+r/12) + σ²/2  (Phase 0의 σ=0 회귀테스트가 실제로 ln(1+r) 오류를 잡아냈다)
 *      ② 월별 흐름 순서: 신규납입 → 목표비중 배분 → correlated shock → 월별 GBM 수익률 적용
 *      ③ 리밸런싱은 연 1회(12개월마다)만, 목표비중×현재총액으로 재분배
 *      ④ 상관계수는 날짜 정렬(date-aligned) 방식만 사용 - 최근 N개 단순 자르기 금지(실측: 한/미 혼합
 *         자산에서 상관계수가 -0.01→+0.21로 부호까지 뒤집히고 P10이 약 10% 달라짐을 확인했다)
 *      수학적으로 동일한 결과를 내는 최적화(예: typed array화)는 허용하되, 위 네 정의 자체를 바꾸는
 *      변경은 반드시 "현재 모델 → 제안 모델 → 예상 영향 → 장단점"을 먼저 보고하고 승인받은 뒤에 한다.
 * ---------------------------------------------------------------------- */

// [모델 버전 - 하위호환] 향후 계산 방식이 바뀌면 과거 결과와 구분할 수 있도록 결과에 항상 함께 저장한다.
const MC_MODEL_VERSION = {
  MONTHLY_PRECISION: 'MC_MONTHLY_V1',
  ANNUAL_PREVIEW: 'MC_ANNUAL_MIDYEAR_V1'
};

/* -------------------------------------------------------------------------
 * 25-1. 기대수익률(μ) 변환 - Phase 0 확정 공식
 * ---------------------------------------------------------------------- */
// rAnnual/sigmaAnnual: 소수(예: 0.11, 0.20). 기존 결정론적 엔진(js/05 computeFutureValue)이
// "연간 시나리오 수익률 r을 월수익률 r/12로 나눠 월복리"하는 것과 정확히 같은 의미의 연율이 되도록,
// 그 월복리가 실제로 내포하는 연속복리 환산값(12·ln(1+r/12))에 median-match 보정(+σ²/2)을 더한다.
// median-match를 쓰는 이유: 이래야 σ가 얼마든 MC의 중앙값(P50) 경로가 결정론적 시나리오 카드의
// 숫자와 일치한다(Phase 0 실측: 오차 1~3% 이내, 나머지는 표본오차) - 산술평균(mean)과 일치시키면
// σ가 클수록 P50이 카드 숫자보다 크게 낮아 보여 사용자가 혼란스러워한다.
function computeMuGBM(rAnnual, sigmaAnnual) {
  return 12 * Math.log(1 + rAnnual / 12) + (sigmaAnnual * sigmaAnnual) / 2;
}

// 결정론적 월복리 미래가치 - js/05 computeFutureValue와 반드시 동일한 공식(기초급 연금 복리식).
// 회귀테스트(σ=0)가 이 함수와 MC 결과를 직접 대조하는 기준값으로 쓴다 - 이 함수 자체를 고치면 안 되고,
// js/05의 원본과 다르게 동작하면 그게 곧 버그다(두 파일이 갈라지지 않도록 테스트로 계속 감시한다).
function computeDeterministicMonthlyFV(pv, rAnnual, years, monthlyContribution) {
  const monthlyRate = rAnnual / 12;
  const months = years * 12;
  if (Math.abs(monthlyRate) < 1e-9) return pv + monthlyContribution * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return pv * growth + monthlyContribution * (1 + monthlyRate) * ((growth - 1) / monthlyRate);
}

// [Phase 3-3 통합감사 - 단일 진실 공급원(Single Source of Truth)] 연간 납입액 증가율의 "배율" 계산은
// 이 함수 하나로 통일한다 - runMonthlyPrecisionMC/runAnnualPreviewMC/computeTotalContributionPrincipal
// (이 파일)과 js/05의 computeFutureValueWithContributionGrowth(결정론적 시나리오 카드)까지 전부 이
// 함수를 재사용해, "납입액이 연차별로 몇 배가 되는가"라는 계산식이 파일마다 따로 존재하지 않게 한다.
// yearIndex=0(1년차)은 항상 1.0배 - growthRate=0이면 모든 연차에서 정확히 1.0(기존 동작과 완전 동일).
function computeContributionYearMultiplier(contributionGrowthRate, yearIndex) {
  return Math.pow(1 + (contributionGrowthRate || 0), yearIndex);
}

// [Phase 3-4 - 단일 진실 공급원] 연 운용보수(fee, 소수 - 예: 0.002=0.20%)를 월별 배율로 환산하는
// 유일한 공식. js/05(결정론적 시나리오)와 이 파일의 Monte Carlo 엔진이 전부 이 함수 하나만 쓴다.
// [경제모델 근거] "연 운용보수 f"의 표준적 의미는 "시장 수익률이 0%인 채로 1년이 지나면 잔고가 정확히
// (1-f)배가 된다"는 것이다(펀드 순자산가치가 일별로 조금씩 깎이며 누적되는 실제 방식과 동일한 결과).
// 이를 월 단위로 정확히 재현하려면 매월 (1-f)^(1/12)배씩 줄어야 12개월 후 정확히 (1-f)가 된다 -
// 그래서 f/12(단순 선형 근사)가 아니라 (1-f)^(1/12)(기하학적으로 정확한 값)를 쓴다. f가 작을 때(보통
// 0.01~2% 수준) 두 방식의 차이는 무시할 만큼 작지만(연 0.20% 기준 백만분의 1 수준), 이 앱이 이미
// μ_GBM 공식에서 "선형 근사 대신 기하학적으로 정확한 변환"을 일관되게 선택해온 것과 같은 원칙이다.
// feeRateAnnual=0이면 정확히 1.0(Math.pow(1,1/12)===1 exact) - 곱해도 값이 안 바뀌어 기존과
// bit-identical하다.
function computeMonthlyFeeFactor(feeRateAnnual) {
  return Math.pow(1 - (feeRateAnnual || 0), 1 / 12);
}

// [Phase 3-4 조건부승인 #2] "UI %"(state.projection.customFeeRates에 저장되는 값, 예: 0.20 = 연
// 0.20%) -> "엔진이 실제로 곱하는 decimal"(feeRateAnnual, 예: 0.002) 변환을 이 함수 하나로 고정한다.
// 이전에는 이 "/100" 한 줄이 소비 지점 3곳(js/16 adapter, js/05 두 곳)에 각각 따로 인라인으로 있었다 -
// 세 곳 중 하나가 나중에 실수로 두 번 나누거나(이중변환) 아예 빠뜨리면(원본 % 그대로 엔진에 들어가
// 100배 부풀려짐) 조용히 틀린 값이 계산될 위험이 있었다. 이제 세 곳 모두 이 함수만 호출하도록
// 통일해 "값이 100% 동일한 채로 인라인 /100을 함수 호출로 옮긴 것"뿐인 무회귀 변경이다.
function feePercentToDecimal(feeRatePercent) {
  return (feeRatePercent === undefined || feeRatePercent === null || !Number.isFinite(feeRatePercent)) ? 0 : feeRatePercent / 100;
}

// [Phase 3-3] 총 납입원금 - 수익률과 무관한 순수 현금흐름 합계라 Monte Carlo path(랜덤성)와 상관없이
// 항상 같은 값이다. 월별 loop(연차별 배율 적용)을 그대로 재현해 합산한다 - 실제 엔진(runMonthlyPrecisionMC
// Step 1)과 동일한 연차 산정(yearIndex=Math.floor((m-1)/12))을 쓰는지 반드시 확인할 것(회귀테스트 D).
function computeTotalContributionPrincipal(monthlyContribution, contributionGrowthRate, years) {
  const months = years * 12;
  let total = 0;
  for (let m = 1; m <= months; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    total += monthlyContribution * computeContributionYearMultiplier(contributionGrowthRate, yearIndex);
  }
  return total;
}
// [Step 2 - 적립기간 연결, 신규·추가 전용] 위 computeTotalContributionPrincipal은 그대로 두고(기존
// 호출부 무변경), owner별 적립기간이 다른 경우의 "총 납입원금"을 정확히 구하기 위한 합성 함수 -
// 각 스트림을 자신의 적립기간(min(stream.years, years); null/undefined면 years 그대로)만큼만 계산해
// 위 함수를 그대로(수정 없이) 재사용한 뒤 합산한다. 새 계산식이 아니라 기존 함수의 단순 합성이다.
function computeTotalContributionPrincipalMultiStream(streams, contributionGrowthRate, years) {
  return (streams || []).reduce((sum, stream) => {
    const streamYears = stream.years;
    const capYears = (streamYears === null || streamYears === undefined || !Number.isFinite(streamYears)) ? years : Math.min(streamYears, years);
    return sum + computeTotalContributionPrincipal(stream.monthly || 0, contributionGrowthRate, capYears);
  }, 0);
}

/* -------------------------------------------------------------------------
 * 25-2. 시드 고정 PRNG (js/05 createSeededRandom과 동일 알고리즘의 독립 사본)
 * ---------------------------------------------------------------------- */
function createSeededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeBoxMuller(rng) {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/* -------------------------------------------------------------------------
 * 25-3. 날짜 정렬 상관관계 (Phase 0 확정 - 최근 N개 단순 자르기 방식 금지)
 * ---------------------------------------------------------------------- */
// datedCloses: [{date:'YYYY-MM-DD', close:number}, ...] (정렬 여부 가정하지 않음).
// 두 자산 모두에 존재하는 날짜만 골라(교집합), 그 날짜 순서대로 수익률을 다시 계산한다 - 거래일이
// 다른 시장(한국/미국 등)을 섞어도 "실제 같은 날의 등락"끼리만 비교하게 된다.
function dateAlignedReturns(datedClosesA, datedClosesB) {
  const mapA = new Map(datedClosesA.map((d) => [d.date, d.close]));
  const mapB = new Map(datedClosesB.map((d) => [d.date, d.close]));
  const commonDates = [...mapA.keys()].filter((d) => mapB.has(d)).sort();
  const returnsA = [], returnsB = [];
  for (let i = 1; i < commonDates.length; i++) {
    const d0 = commonDates[i - 1], d1 = commonDates[i];
    returnsA.push(mapA.get(d1) / mapA.get(d0) - 1);
    returnsB.push(mapB.get(d1) / mapB.get(d0) - 1);
  }
  return {
    returnsA, returnsB,
    observationCount: commonDates.length,
    startDate: commonDates[0] || null,
    endDate: commonDates[commonDates.length - 1] || null
  };
}
function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return null;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(x), my = mean(y);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}
// instruments: [{key, datedCloses}] - 날짜정렬 상관행렬 + 페어별 진단정보(관측치 수/기간)를 함께 낸다.
// 향후 UI/디버그 화면에서 "이 상관계수가 몇 개의 공통 거래일로 계산됐는지"를 보여줄 수 있도록
// pairDiagnostics를 결과에 그대로 남긴다. 데이터가 부족한(공통 거래일 10개 미만) 페어는 무상관(0)으로
// 보수적으로 처리한다(값을 억지로 만들어내지 않음).
function computeDateAlignedCorrelationMatrix(instruments) {
  const n = instruments.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairDiagnostics = {};
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const { returnsA, returnsB, observationCount, startDate, endDate } = dateAlignedReturns(instruments[i].datedCloses, instruments[j].datedCloses);
      const corr = observationCount >= 10 ? pearsonCorrelation(returnsA, returnsB) : 0;
      matrix[i][j] = matrix[j][i] = (corr === null ? 0 : corr);
      pairDiagnostics[instruments[i].key + '|' + instruments[j].key] = { observationCount, startDate, endDate };
    }
  }
  return { matrix, pairDiagnostics };
}

/* -------------------------------------------------------------------------
 * 25-4. 상관행렬 유효성 검증 + PSD 보정 + Cholesky
 * ---------------------------------------------------------------------- */
function validateCorrelationMatrixShape(matrix, tol) {
  tol = tol || 1e-9;
  const n = matrix.length;
  let symmetric = true, diagonalOne = true, inRange = true;
  for (let i = 0; i < n; i++) {
    if (Math.abs(matrix[i][i] - 1) > tol) diagonalOne = false;
    for (let j = 0; j < n; j++) {
      if (Math.abs(matrix[i][j] - matrix[j][i]) > tol) symmetric = false;
      if (matrix[i][j] < -1 - tol || matrix[i][j] > 1 + tol) inRange = false;
    }
  }
  return { symmetric, diagonalOne, inRange };
}
// 대칭행렬 전용 Jacobi 고유값분해(반복 회전법) - 라이브러리 없이 순수 JS로 구현. 자산 수가 수십 개
// 수준(개인 포트폴리오)이라 반복 회전이 성능 문제가 되지 않는다.
function jacobiEigenDecomposition(matrixIn, maxIter, tol) {
  maxIter = maxIter || 100; tol = tol || 1e-10;
  const n = matrixIn.length;
  let A = matrixIn.map((row) => row.slice());
  let V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let iter = 0; iter < maxIter; iter++) {
    let off = 0, p = 0, q = 1, maxVal = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      off += A[i][j] * A[i][j];
      if (Math.abs(A[i][j]) > maxVal) { maxVal = Math.abs(A[i][j]); p = i; q = j; }
    }
    if (Math.sqrt(off) < tol) break;
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let i = 0; i < n; i++) { const aip = A[i][p], aiq = A[i][q]; A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq; }
    for (let i = 0; i < n; i++) { const api = A[p][i], aqi = A[q][i]; A[p][i] = c * api - s * aqi; A[q][i] = s * api + c * aqi; }
    for (let i = 0; i < n; i++) { const vip = V[i][p], viq = V[i][q]; V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq; }
  }
  return { eigenvalues: A.map((row, i) => row[i]), eigenvectors: V };
}
// 비PSD 상관행렬을 "가장 가까운" 유효 상관행렬로 보정한다 - 음수 고유값을 아주 작은 양수로 클리핑한 뒤
// 재구성하고, 대각선을 정확히 1로 재정규화한다(재구성 자체가 대칭성은 자동 보존). before/after 최소
// 고유값을 함께 반환해 디버그 화면에서 "보정이 실제로 얼마나 일어났는지" 확인할 수 있게 한다.
function ensurePSD(matrix) {
  const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(matrix);
  const minEigenvalueBefore = Math.min(...eigenvalues);
  if (minEigenvalueBefore >= -1e-8) {
    return { matrix, correctionApplied: false, minEigenvalueBefore, minEigenvalueAfter: minEigenvalueBefore };
  }
  const n = matrix.length;
  const clipped = eigenvalues.map((e) => Math.max(e, 1e-8));
  const recon = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0; for (let k = 0; k < n; k++) s += eigenvectors[i][k] * clipped[k] * eigenvectors[j][k];
    recon[i][j] = s;
  }
  const d = recon.map((row, i) => Math.sqrt(row[i]));
  const normalized = recon.map((row, i) => row.map((v, j) => v / (d[i] * d[j])));
  const after = jacobiEigenDecomposition(normalized);
  return { matrix: normalized, correctionApplied: true, minEigenvalueBefore, minEigenvalueAfter: Math.min(...after.eigenvalues) };
}
function choleskyDecompose(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0; for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const val = matrix[i][i] - sum;
        if (val <= 0) return { success: false, L: null };
        L[i][j] = Math.sqrt(val);
      } else {
        if (L[j][j] === 0) return { success: false, L: null };
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return { success: true, L };
}
// 상관행렬 하나를 받아 "검증 → (필요시) PSD 보정 → 재검증 → Cholesky"까지 한 번에 처리하는 진입점.
// 요청된 순서(symmetry→diagonal→range→PSD→correction→symmetry재확인→diagonal재확인→Cholesky) 그대로.
function prepareCholeskyFromCorrelation(rawMatrix) {
  const shapeBefore = validateCorrelationMatrixShape(rawMatrix);
  const psd = ensurePSD(rawMatrix);
  const shapeAfter = validateCorrelationMatrixShape(psd.matrix);
  const chol = choleskyDecompose(psd.matrix);
  return {
    L: chol.L,
    choleskySucceeded: chol.success,
    diagnostics: {
      shapeBefore, shapeAfter,
      psdCorrectionApplied: psd.correctionApplied,
      minEigenvalueBefore: psd.minEigenvalueBefore,
      minEigenvalueAfter: psd.minEigenvalueAfter
    }
  };
}

/* -------------------------------------------------------------------------
 * 25-5. 목표비중 재배분(리밸런싱) - 순수 함수, 총액 보존이 규약(회귀테스트 Test H)
 * ---------------------------------------------------------------------- */
function rebalanceToWeights(balances, weights) {
  let total = 0; for (let i = 0; i < balances.length; i++) total += balances[i];
  return weights.map((w) => total * w);
}

/* -------------------------------------------------------------------------
 * 25-6. Official - Monthly Precision Monte Carlo
 *    순서 고정: 신규납입 → 목표비중 배분 → correlated shock(Cholesky) → 월별 GBM 수익률 →
 *    포트폴리오 갱신 → (12개월마다) 연 1회 리밸런싱. 이 순서를 바꾸지 않는다.
 * ---------------------------------------------------------------------- */
const MILESTONE_YEARS = [5, 10, 15, 20];

function percentile(sortedArr, p) {
  return sortedArr[Math.min(sortedArr.length - 1, Math.max(0, Math.round((p / 100) * (sortedArr.length - 1))))];
}
// samples: 정렬 전 원표본 배열(하나의 milestone에 대한 iterations개 최종 포트폴리오 가치)
function extractMilestoneStats(samples, goalAmounts) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0; for (let i = 0; i < n; i++) sum += sorted[i];
  const stats = {
    mean: sum / n,
    p10: percentile(sorted, 10), p25: percentile(sorted, 25), p50: percentile(sorted, 50),
    p75: percentile(sorted, 75), p90: percentile(sorted, 90)
  };
  if (goalAmounts && goalAmounts.length) {
    stats.goalProbability = {};
    goalAmounts.forEach((goal) => {
      let count = 0; for (let i = 0; i < n; i++) if (sorted[i] >= goal) count++;
      stats.goalProbability[goal] = count / n;
    });
  }
  return stats;
}

// config = {
//   pv0,                    // 시작 시점 총 평가금액
//   instruments: [{ key, weight, muAnnual, sigmaAnnual }],  // weight 합계는 1이어야 함
//   correlationMatrix,      // n×n, computeDateAlignedCorrelationMatrix 결과 등
//   monthlyContribution,    // 월 총 납입액(자산별 배분은 weight 그대로 사용)
//   years, iterations, seed,
//   goalAmounts             // [선택] 목표금액 배열
// }
// hooks = { onProgress(completed,total), shouldCancel(), progressBatchSize } - [Phase 2-2, Web Worker
// 지원용, 순수 추가] 계산 자체(μ/σ/상관관계/월별 처리 순서/리밸런싱)는 단 한 줄도 바뀌지 않는다 -
// iteration 루프 맨 끝에서 진행률 콜백을 "부르기만" 하고, shouldCancel()이 true면 그 시점까지의 결과를
// 버리고 즉시 예외(err.code='CANCELLED')를 던져 계산을 실제로 중단한다(단순히 나중에 결과를 버리는 게
// 아니라 CPU 낭비 자체를 막는다). hooks를 안 넘기면(기존 모든 호출부) 이 분기들이 전부 조용히
// 건너뛰어져 기존과 완전히 동일하게 동작한다 - 회귀테스트(Worker Test A와 무관하게 엔진 자체 테스트)로
// hooks 유무에 따라 결과가 bit-identical함을 확인했다.
function runMonthlyPrecisionMC(config, hooks) {
  hooks = hooks || {};
  const onProgress = hooks.onProgress, shouldCancel = hooks.shouldCancel;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { pv0, instruments, monthlyContribution, years, iterations, seed, goalAmounts } = config;
  // contributionGrowthRate: [Phase 3-3] 연간 납입액 증가율(소수, 예: 0.03). 생략/undefined면 0 -
  // 이 경우 아래 yearlyContribMultiplier가 모든 연도에서 정확히 1.0이 되어(Math.pow(1,y)===1 exact),
  // contribShare[i]*1.0 === contribShare[i]가 IEEE754에서 항상 정확히 성립한다 - 그래서 growth=0이면
  // Phase 3-2 이전과 bit-identical하다(회귀테스트로 확인됨). 수익률(μ/σ/상관관계) 계산에는 전혀
  // 관여하지 않는다 - Step 1(납입) 배율만 바꾼다.
  const contributionGrowthRate = config.contributionGrowthRate || 0;
  const progressBatchSize = hooks.progressBatchSize || Math.max(1, Math.round(iterations / 40));
  const n = instruments.length;
  const { L, choleskySucceeded, diagnostics: choleskyDiagnostics } = prepareCholeskyFromCorrelation(config.correlationMatrix);
  if (!choleskySucceeded) throw new Error('Cholesky decomposition failed even after PSD correction');

  const months = years * 12;
  const rng = createSeededRandom(seed);
  const nextZ = makeBoxMuller(rng);

  const weight = new Float64Array(n), muM = new Float64Array(n), sigmaM = new Float64Array(n), contribShare = new Float64Array(n);
  // feeMonthlyFactor: [Phase 3-4] instrument별 월간 운용보수 배율 - Gross Return(Step 4)과는 완전히
  // 분리된 별도 곱셈(Step 4.5)이다. feeRateAnnual이 없거나 0이면 정확히 1.0(bit-identical 보장).
  const feeMonthlyFactor = new Float64Array(n);
  const Lflat = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) Lflat[i * n + j] = L[i][j];
  for (let i = 0; i < n; i++) {
    const ins = instruments[i];
    weight[i] = ins.weight;
    contribShare[i] = monthlyContribution * ins.weight;
    muM[i] = computeMuGBM(ins.muAnnual, ins.sigmaAnnual) / 12;
    sigmaM[i] = ins.sigmaAnnual / Math.sqrt(12);
    feeMonthlyFactor[i] = computeMonthlyFeeFactor(ins.feeRateAnnual);
  }
  // 연차별(yearIndex=0,1,2,...) 납입 배율 - 1년차(month 1~12)는 항상 1.0, 2년차부터 (1+g)^yearIndex.
  // 매월 Math.pow를 다시 계산하지 않도록 미리(연 단위, 최대 수십 개) 채워둔다.
  const numYears = Math.ceil(months / 12);
  const yearlyContribMultiplier = new Float64Array(numYears);
  for (let y = 0; y < numYears; y++) yearlyContribMultiplier[y] = computeContributionYearMultiplier(contributionGrowthRate, y);

  // [Step 2 - 적립기간(년) 연결, 신규·추가 전용] config.contributionStreams(예: owner별 [{monthly,years},...])가
  // 있으면, 각 스트림이 "자신의 적립기간(years - null/undefined/미제공이면 무제한)까지만" 기여하는
  // "가구 전체 월별 신규납입 총액"을 iteration 루프 밖에서 미리 한 번만 계산해둔다(이 현금흐름은
  // iteration의 랜덤성과 무관 - 위 yearlyContribMultiplier와 같은 이유로 미리 계산해도 안전하다).
  // 자산별 배분은 여전히 weight 그대로 곱한다(household pooled target-weight 구조를 그대로 유지 -
  // owner-aware 자산 배분으로 확장하지 않음, 요청 범위 제한). streams가 없으면(기존 모든 호출부) 아래
  // hasContributionStreams 분기가 항상 false라 이 블록 자체가 실행되지 않고, iteration 루프도 기존
  // contribShare 경로를 그대로 타 완전히 bit-identical하다.
  const contributionStreams = config.contributionStreams;
  const hasContributionStreams = Array.isArray(contributionStreams) && contributionStreams.length > 0;
  let monthlyContribTotal = null;
  if (hasContributionStreams) {
    monthlyContribTotal = new Float64Array(months);
    for (let m = 1; m <= months; m++) {
      const multiplier = yearlyContribMultiplier[Math.floor((m - 1) / 12)];
      let monthTotal = 0;
      for (let s = 0; s < contributionStreams.length; s++) {
        const stream = contributionStreams[s];
        const streamYears = stream.years;
        const capMonths = (streamYears === null || streamYears === undefined || !Number.isFinite(streamYears)) ? Infinity : streamYears * 12;
        if (m <= capMonths) monthTotal += (stream.monthly || 0) * multiplier;
      }
      monthlyContribTotal[m - 1] = monthTotal;
    }
  }

  // milestone(5/10/15/20년)에서만 iteration별 "포트폴리오 총액"을 저장한다 - 240개월 전체 경로는
  // 메모리에 남기지 않는다(요청사항). milestoneMonthSet으로 해당 월인지만 빠르게 확인한다.
  const milestoneMonths = MILESTONE_YEARS.filter((y) => y <= years).map((y) => y * 12);
  const milestoneSamples = milestoneMonths.map(() => new Float64Array(iterations));

  const balances = new Float64Array(n), Z = new Float64Array(n), X = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) balances[i] = pv0 * weight[i];
    let nextMilestoneIdx = 0;
    for (let m = 1; m <= months; m++) {
      // Step 1: 신규 월 납입금 반영(연차별 증가율 적용) + Step 2: 목표비중 배분(contribShare/weight가
      // 이미 배분됨) - 수익률 계산(Step 3/4)과는 완전히 분리된 현금흐름 전용 배율이다. streams가 있으면
      // (Step 2 - 적립기간 연결) 미리 계산해둔 월별 가구 전체 총액을 weight로 배분하고, 없으면(기존
      // 모든 호출부) 기존 contribShare 경로를 그대로 쓴다.
      if (hasContributionStreams) {
        const monthTotal = monthlyContribTotal[m - 1];
        for (let i = 0; i < n; i++) balances[i] += weight[i] * monthTotal;
      } else {
        const contribMultiplier = yearlyContribMultiplier[Math.floor((m - 1) / 12)];
        for (let i = 0; i < n; i++) balances[i] += contribShare[i] * contribMultiplier;
      }
      // Step 3: correlated shock 생성 (Z -> L*Z)
      for (let i = 0; i < n; i++) Z[i] = nextZ();
      for (let i = 0; i < n; i++) {
        let s = 0; const rowOff = i * n;
        for (let k = 0; k <= i; k++) s += Lflat[rowOff + k] * Z[k];
        X[i] = s;
      }
      // Step 4: 자산별 월간 GBM 수익률 적용(Gross Return - Fee와 완전히 분리된 계산)
      for (let i = 0; i < n; i++) {
        const sm = sigmaM[i];
        balances[i] *= Math.exp((muM[i] - (sm * sm) / 2) + sm * X[i]);
      }
      // Step 4.5: [Phase 3-4] instrument별 월간 운용보수 차감 - Gross Return(Step 4)과 별도의 곱셈으로
      // 적용한다(μ_GBM 공식 자체를 수정하지 않음). Rebalancing(Step 5)보다 반드시 먼저 적용해야 한다 -
      // 리밸런싱은 "그 시점의 실제 잔고"(이미 그 달까지의 보수가 빠진 금액)를 재분배하는 것이 맞다.
      for (let i = 0; i < n; i++) balances[i] *= feeMonthlyFactor[i];
      // Step 5: 12개월마다 연 1회 리밸런싱
      if (m % 12 === 0) {
        const rebalanced = rebalanceToWeights(Array.from(balances), Array.from(weight));
        for (let i = 0; i < n; i++) balances[i] = rebalanced[i];
      }
      if (nextMilestoneIdx < milestoneMonths.length && m === milestoneMonths[nextMilestoneIdx]) {
        let total = 0; for (let i = 0; i < n; i++) total += balances[i];
        milestoneSamples[nextMilestoneIdx][iter] = total;
        nextMilestoneIdx++;
      }
    }
    // [Phase 2-2, Worker 진행률/취소 - 계산 결과에 영향 없음] iteration 완료 시점(=한 회의 20년 경로가
    // 끝난 뒤)에서만 확인한다 - 월 단위 중간에는 확인하지 않아 오버헤드가 무시할 만하다.
    if (onProgress && ((iter + 1) % progressBatchSize === 0 || iter === iterations - 1)) onProgress(iter + 1, iterations);
    if (shouldCancel && shouldCancel()) {
      const cancelErr = new Error('Monte Carlo simulation cancelled');
      cancelErr.code = 'CANCELLED';
      throw cancelErr;
    }
  }

  const milestones = milestoneMonths.map((m, idx) => Object.assign(
    { year: m / 12 },
    extractMilestoneStats(Array.from(milestoneSamples[idx]), goalAmounts)
  ));

  return {
    mode: 'official',
    modelVersion: MC_MODEL_VERSION.MONTHLY_PRECISION,
    simulations: iterations,
    years,
    assets: n,
    milestones,
    finalValue: milestones.length ? milestones[milestones.length - 1] : null,
    executionTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    diagnostics: { seed, correlationMethod: 'date-aligned', psdCorrectionApplied: choleskyDiagnostics.psdCorrectionApplied,
      minEigenvalueBefore: choleskyDiagnostics.minEigenvalueBefore, minEigenvalueAfter: choleskyDiagnostics.minEigenvalueAfter }
  };
}

/* -------------------------------------------------------------------------
 * 25-7. Preview - Annual Approximation (Mid-Year 납입 컨벤션 고정)
 *    [Phase 0 실측] Beginning-of-Year 대비 Mid-Year가 Monthly Precision과의 편차를 2~4%에서
 *    1% 미만으로 줄인다 - Beginning-of-Year는 쓰지 않는다.
 * ---------------------------------------------------------------------- */
function runAnnualPreviewMC(config, hooks) {
  hooks = hooks || {};
  const onProgress = hooks.onProgress, shouldCancel = hooks.shouldCancel;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { pv0, instruments, monthlyContribution, years, iterations, seed, goalAmounts } = config;
  const contributionGrowthRate = config.contributionGrowthRate || 0; // [Phase 3-3] runMonthlyPrecisionMC와 동일 의미
  const progressBatchSize = hooks.progressBatchSize || Math.max(1, Math.round(iterations / 40));
  const n = instruments.length;
  const { L, choleskySucceeded, diagnostics: choleskyDiagnostics } = prepareCholeskyFromCorrelation(config.correlationMatrix);
  if (!choleskySucceeded) throw new Error('Cholesky decomposition failed even after PSD correction');

  const rng = createSeededRandom(seed);
  const nextZ = makeBoxMuller(rng);
  const annualContribution = monthlyContribution * 12;
  const weight = instruments.map((ins) => ins.weight);
  const annualParams = instruments.map((ins) => ({
    muLogAnnual: computeMuGBM(ins.muAnnual, ins.sigmaAnnual), sigmaAnnual: ins.sigmaAnnual
  }));
  // [Phase 3-4] 연 단위 루프라 월 환산(computeMonthlyFeeFactor) 없이 "1-fee"를 그대로 연간 배율로
  // 쓴다(이 루프의 1스텝=1년이므로 computeMonthlyFeeFactor(f)^12 === (1-f)와 정확히 같다).
  const feeAnnualFactor = instruments.map((ins) => 1 - (ins.feeRateAnnual || 0));

  const milestoneSet = new Set(MILESTONE_YEARS.filter((y) => y <= years));
  const milestoneSamples = {};
  MILESTONE_YEARS.filter((y) => y <= years).forEach((y) => { milestoneSamples[y] = new Float64Array(iterations); });

  for (let iter = 0; iter < iterations; iter++) {
    let balances = instruments.map((ins) => pv0 * ins.weight);
    for (let y = 1; y <= years; y++) {
      const Z = new Array(n); for (let i = 0; i < n; i++) Z[i] = nextZ();
      const X = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k <= i; k++) s += L[i][k] * Z[k]; X[i] = s; }
      const growth = annualParams.map((p, i) => Math.exp((p.muLogAnnual - (p.sigmaAnnual * p.sigmaAnnual) / 2) + p.sigmaAnnual * X[i]));
      // [Phase 3-3] 연차별 납입액 증가율 - y=1(1년차)은 항상 배율 1.0(growth=0이면 모든 연도 1.0,
      // 기존과 bit-identical). 수익률(growth)과는 완전히 분리된 현금흐름 배율이다.
      const contribMultiplier = computeContributionYearMultiplier(contributionGrowthRate, y - 1);
      // Mid-Year 컨벤션: 연간 납입금이 그 해 성장의 절반만 노출된다고 근사(sqrt(growth))
      for (let i = 0; i < n; i++) {
        const contrib = annualContribution * weight[i] * contribMultiplier;
        balances[i] = (balances[i] * growth[i] + contrib * Math.sqrt(growth[i])) * feeAnnualFactor[i];
      }
      balances = rebalanceToWeights(balances, weight);
      if (milestoneSet.has(y)) {
        milestoneSamples[y][iter] = balances.reduce((a, b) => a + b, 0);
      }
    }
    if (onProgress && ((iter + 1) % progressBatchSize === 0 || iter === iterations - 1)) onProgress(iter + 1, iterations);
    if (shouldCancel && shouldCancel()) {
      const cancelErr = new Error('Annual preview simulation cancelled');
      cancelErr.code = 'CANCELLED';
      throw cancelErr;
    }
  }

  const milestones = Object.keys(milestoneSamples).map(Number).sort((a, b) => a - b).map((year) => Object.assign(
    { year }, extractMilestoneStats(Array.from(milestoneSamples[year]), goalAmounts)
  ));

  return {
    mode: 'preview',
    modelVersion: MC_MODEL_VERSION.ANNUAL_PREVIEW,
    simulations: iterations,
    years,
    assets: n,
    milestones,
    finalValue: milestones.length ? milestones[milestones.length - 1] : null,
    executionTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    diagnostics: { seed, correlationMethod: 'date-aligned', psdCorrectionApplied: choleskyDiagnostics.psdCorrectionApplied,
      minEigenvalueBefore: choleskyDiagnostics.minEigenvalueBefore, minEigenvalueAfter: choleskyDiagnostics.minEigenvalueAfter }
  };
}

// [Node 테스트 전용] 브라우저(<script> 태그 로드)에서는 module이 없어 이 블록이 조용히 건너뛰어진다 -
// js/12-import-export-sync.js의 기존 export 패턴과 동일.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MC_MODEL_VERSION, computeMuGBM, computeDeterministicMonthlyFV, computeTotalContributionPrincipal, computeTotalContributionPrincipalMultiStream, computeContributionYearMultiplier, computeMonthlyFeeFactor, feePercentToDecimal,
    createSeededRandom, makeBoxMuller,
    dateAlignedReturns, pearsonCorrelation, computeDateAlignedCorrelationMatrix,
    validateCorrelationMatrixShape, jacobiEigenDecomposition, ensurePSD, choleskyDecompose, prepareCholeskyFromCorrelation,
    rebalanceToWeights, extractMilestoneStats, MILESTONE_YEARS,
    runMonthlyPrecisionMC, runAnnualPreviewMC
  };
}
