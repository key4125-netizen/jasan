/* -------------------------------------------------------------------------
 * 26. Monte Carlo Engine v2 어댑터 - state(현재 앱 상태) → js/15 Core Engine 표준 입력 변환
 *    - [범위] 이 파일은 Phase 2-1(State → Engine Adapter) 전용이다 - Web Worker/UI 연동은 아직
 *      없다. 여기서 만드는 instruments/correlationMatrix는 그대로 js/15의 runMonthlyPrecisionMC/
 *      runAnnualPreviewMC에 넘길 수 있는 형태다.
 *    - [μ/σ 데이터 출처] μ는 js/05의 기존 목표비중 확장 로직(expandRebalanceTargetsForComputation,
 *      getTargetProjectionRate)을 그대로 재사용한다 - 새로 만들지 않고 기존 검증된 함수를 그대로
 *      불러 쓰는 것이 핵심이다. σ/상관계수용 원시 시계열은 js/05의 buildHouseholdInstrumentReturnSeries()
 *      (이번에 computeTargetPortfolioVolatilityPct에서 추출)를 재사용한다 - 두 경로가 같은 키 체계
 *      (T:/N:/C:, computeHouseholdTargetInstrumentWeights 참고)를 쓰므로 key로 안전하게 조인된다.
 *    - [잘못된 입력을 조용히 보정하지 않는다] 가격 이력이 없어 σ를 알 수 없는 "위험자산"(채권/현금이
 *      아닌 종목)이 있으면, 그 종목을 임의로 빼거나 σ=0으로 채우지 않고 명확한 오류로 반환한다 -
 *      투자 판단에 쓰이는 시뮬레이션에서 데이터 누락을 조용히 넘기면 안 되기 때문이다.
 * ---------------------------------------------------------------------- */

// [자산 순서 불일치 방지] instruments 배열과 correlationMatrix가 항상 이 순서(canonical order)로
// 함께 만들어지고 함께 검증된다 - buildMonteCarloInputFromState()가 반환하는 assetOrder를 그대로
// 신뢰하면 되고, 이 순서를 벗어나 instruments/matrix를 따로 재조합하면 안 된다.
async function buildMonteCarloInputFromState(config) {
  config = config || {};
  const presetKey = config.presetKey || 'normal';
  const errors = [];
  const warnings = [];
  // [Phase 3-5 Safety Layer] BLOCK 대상은 errors와 별개로도 safetyIssues에 함께 쌓는다(예: Fee<0/>=100%,
  // σ<0) - errors는 "계산 자체를 못 만드는" 치명적 상황 전용(즉시 return)이고, safetyIssues는 계산은
  // 만들어지되 "이 계산을 믿고 시작해도 되는가"를 판단하는 별도 채널이다. dataQualityIssues는 관측치
  // 부족/상관계수 데이터부족처럼 "데이터 자체의 한계"를 담는다.
  const safetyIssues = [];
  const dataQualityIssues = [];

  const weightsMap = computeHouseholdTargetInstrumentWeights();
  const returnsList = await buildHouseholdInstrumentReturnSeries();
  const returnsByKey = new Map(returnsList.map((r) => [r.key, r]));

  const assetOrder = [];
  const instruments = [];
  const datedClosesForCorrelation = []; // 위험자산만(채권/현금 제외) - 상관행렬 계산용

  weightsMap.forEach((v, key) => {
    const pseudoTarget = { type: v.kind, ticker: v.ticker, category: v.category, name: v.name, label: v.label };
    const label = v.label || v.name || key;
    const muAnnualPct = getTargetProjectionRate(pseudoTarget, presetKey, v.region);
    const muAnnual = num(muAnnualPct) / 100;
    // [Phase 3-4] getTargetProjectionFeeRate(js/05)는 presetKey와 무관 - "수익률 관리"처럼 시나리오별로
    // 달라지지 않는다(운용보수는 시장 시나리오와 무관한 상품 고유 값). 미등록 종목은 0%.
    const feeRatePctRaw = getTargetProjectionFeeRate(pseudoTarget);
    const feeRateAnnual = feePercentToDecimal(feeRatePctRaw);
    const feeExplicit = isFeeExplicitlySet(pseudoTarget);

    const effectiveCategory = v.kind === 'namedHolding' ? classifyCategory('', v.name) : v.category;
    const isRiskFree = effectiveCategory === '채권' || effectiveCategory === '현금';

    safetyIssues.push(...assessFee(feeRatePctRaw, label, feeExplicit));
    const returnIssue = assessExpectedReturn(muAnnualPct, label);
    if (returnIssue) safetyIssues.push(returnIssue);

    if (isRiskFree) {
      assetOrder.push(key);
      instruments.push({ key, weight: v.weight, muAnnual, sigmaAnnual: 0, feeRateAnnual });
      return;
    }
    const series = returnsByKey.get(key);
    if (!series || !series.dates) {
      // [명확한 오류] 위험자산인데 가격 이력(σ 계산 재료)이 없다 - 조용히 σ=0으로 채우거나 이 종목을
      // 빼고 나머지 비중으로 재정규화하지 않는다(포트폴리오 구성을 몰래 바꾸는 셈이 되기 때문).
      errors.push(`instrument "${key}"(weight ${(v.weight * 100).toFixed(1)}%)의 가격 이력을 가져오지 못해 변동성을 계산할 수 없습니다.`);
      return;
    }
    // [Phase 3-5 B1 수정] 예전엔 여기서 computeAnnualizedVolatilityPct가 데이터 부족(null)을 반환해도
    // `|| 0`으로 조용히 "변동성 0%"(=무위험 자산)로 둔갑시켰다 - 이 파일 자신의 정책(위 11-13행 주석,
    // "가격 이력이 없으면 명확한 오류로 반환한다")과 정면으로 모순됐다. "데이터가 없어 모른다"와 "실제로
    // 변동성이 0이다"는 절대 같은 값(0)으로 합쳐지면 안 된다 - 전자는 계산을 막고(errors.push), 후자만
    // (채권/현금처럼 위 위쪽 분기에서 처리되는 경우) 진짜 0으로 취급한다.
    const observationCount = (series.returns || []).length;
    const dataIssue = assessDataSufficiency(observationCount, label);
    if (dataIssue) dataQualityIssues.push(dataIssue);
    const sigmaAnnualPct = computeAnnualizedVolatilityPct(series.returns);
    if (sigmaAnnualPct === null || sigmaAnnualPct === undefined) {
      errors.push(`instrument "${key}"(weight ${(v.weight * 100).toFixed(1)}%)의 가격 데이터가 부족해(${observationCount}개) 변동성을 계산할 수 없습니다.`);
      return;
    }
    const volIssue = assessVolatility(sigmaAnnualPct, label, false);
    if (volIssue) safetyIssues.push(volIssue);
    const sigmaAnnual = sigmaAnnualPct / 100;
    assetOrder.push(key);
    instruments.push({ key, weight: v.weight, muAnnual, sigmaAnnual, feeRateAnnual });
    datedClosesForCorrelation.push({ key, label, datedCloses: series.dates.map((d, i) => ({ date: d, close: series.closes[i] })).filter((x) => x.date) });
  });

  if (errors.length > 0) return { instruments: null, correlationMatrix: null, assetOrder: null, errors, warnings };

  // 상관행렬: 위험자산끼리는 날짜정렬 상관계수, 채권/현금은 σ=0이라 상관계수가 결과에 영향을 주지
  // 않으므로(GBM 식에서 σ_m*X 항이 0) 대각선 1 / 나머지 0으로 채워 넣는다.
  const n = assetOrder.length;
  const correlationMatrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) correlationMatrix[i][i] = 1;
  if (datedClosesForCorrelation.length > 1) {
    const { matrix: riskyMatrix, pairDiagnostics } = computeDateAlignedCorrelationMatrix(datedClosesForCorrelation);
    const riskyKeys = datedClosesForCorrelation.map((d) => d.key);
    const labelByKey = new Map(datedClosesForCorrelation.map((d) => [d.key, d.label]));
    riskyKeys.forEach((keyA, ai) => {
      riskyKeys.forEach((keyB, bi) => {
        const outerA = assetOrder.indexOf(keyA), outerB = assetOrder.indexOf(keyB);
        correlationMatrix[outerA][outerB] = riskyMatrix[ai][bi];
      });
    });
    // [H. Correlation Quality] 공통거래일 부족으로 0 대체된 페어를 데이터 품질 이슈로 등록 - "실제
    // 상관관계 0"과 "데이터 부족으로 0 대체"를 UI에서 구분할 수 있게 한다.
    Object.keys(pairDiagnostics).forEach((pairKey) => {
      const [keyA, keyB] = pairKey.split('|');
      const issue = assessCorrelationPair(pairDiagnostics[pairKey].observationCount, labelByKey.get(keyA) || keyA, labelByKey.get(keyB) || keyB);
      if (issue) dataQualityIssues.push(issue);
    });
    config.__lastPairDiagnostics = pairDiagnostics; // 디버그 확인용(선택 - 호출부가 필요하면 참조)
  }

  const totalWeight = instruments.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) warnings.push(`instrument weight 합계가 1이 아닙니다(${totalWeight.toFixed(4)}) - 목표비중 미설정 구간이 있을 수 있습니다.`);

  // [B3 + Safety Layer] 목표 비중 합계(household 전체 소스인 state.rebalance 자체를 검사 - Future
  // Projection과 완전히 같은 기준, 조건부승인 항목 14) + Contribution Growth/Inflation 경제적 가정 경고.
  safetyIssues.push(...assessHouseholdWeightSums());
  const growthIssue = assessContributionGrowth(num(state.projection.contributionGrowthRate));
  if (growthIssue) safetyIssues.push(growthIssue);
  const inflationIssue = assessInflation(num(state.projection.inflationRate));
  if (inflationIssue) safetyIssues.push(inflationIssue);

  const safety = buildSafetyResult(safetyIssues, dataQualityIssues, []);

  return { instruments, correlationMatrix, assetOrder, errors, warnings, safety, correlationDiagnostics: config.__lastPairDiagnostics || {} };
}

/* -------------------------------------------------------------------------
 * 26-1. 입력 검증 - 9개 항목. 문제가 있으면 조용히 고치지 않고 오류 목록을 그대로 반환한다.
 *    [Worker에서도 재사용 - 의존성 없는 순수 함수] js/17이 importScripts로 이 파일을 불러와 Worker
 *    안에서도 이 함수를 방어적으로 다시 호출한다 - js/01의 전역 num()은 Worker 스코프에 없으므로
 *    (importScripts로 무거운 DOM 의존 파일을 끌어오고 싶지 않다) 이 파일 전용의 아주 작은 로컬
 *    숫자변환만 쓴다(merge.test.js가 mergeCollectionById를 순수 함수로 독립시킨 것과 같은 이유).
 * ---------------------------------------------------------------------- */
function toFiniteNumber(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function validateMonteCarloInput(input) {
  const errors = [];
  const { instruments, correlationMatrix, assetOrder, initialPrincipal, monthlyContribution, years } = input;

  if (!Array.isArray(instruments) || instruments.length === 0) {
    errors.push('instruments가 비어있습니다.');
    return { valid: false, errors };
  }

  const weightSum = instruments.reduce((s, i) => s + toFiniteNumber(i.weight), 0);
  if (Math.abs(weightSum - 1) > 0.01) errors.push(`weight 합계가 1이 아닙니다: ${weightSum.toFixed(4)}`);

  const seenKeys = new Set();
  instruments.forEach((ins, idx) => {
    if (seenKeys.has(ins.key)) errors.push(`중복된 asset key: "${ins.key}"`);
    seenKeys.add(ins.key);
    if (ins.muAnnual === undefined || ins.muAnnual === null || !Number.isFinite(ins.muAnnual)) errors.push(`instruments[${idx}]("${ins.key}")에 유효한 muAnnual이 없습니다.`);
    if (ins.sigmaAnnual === undefined || ins.sigmaAnnual === null || !Number.isFinite(ins.sigmaAnnual)) errors.push(`instruments[${idx}]("${ins.key}")에 유효한 sigmaAnnual이 없습니다.`);
    else if (ins.sigmaAnnual < 0) errors.push(`instruments[${idx}]("${ins.key}")의 sigmaAnnual이 음수입니다: ${ins.sigmaAnnual}`);
    // [Phase 3-4] feeRateAnnual은 생략 가능(undefined -> 엔진이 0으로 처리) - 있다면 [0,1) 범위의
    // 유한값이어야 한다(1 이상이면 "연간 100%+ 보수"라는 뜻이라 사실상 입력 실수로 간주).
    if (ins.feeRateAnnual !== undefined && ins.feeRateAnnual !== null) {
      if (!Number.isFinite(ins.feeRateAnnual) || ins.feeRateAnnual < 0 || ins.feeRateAnnual >= 1) {
        errors.push(`instruments[${idx}]("${ins.key}")의 feeRateAnnual이 유효하지 않습니다(0 이상 1 미만이어야 함): ${ins.feeRateAnnual}`);
      }
    }
  });

  if (!Array.isArray(correlationMatrix) || correlationMatrix.length !== instruments.length) {
    errors.push(`correlationMatrix 크기(${correlationMatrix ? correlationMatrix.length : 'null'})가 asset 수(${instruments.length})와 다릅니다.`);
  } else if (correlationMatrix.some((row) => !Array.isArray(row) || row.length !== instruments.length)) {
    errors.push('correlationMatrix가 정방행렬이 아닙니다.');
  }

  if (Array.isArray(assetOrder)) {
    const instrumentKeys = instruments.map((i) => i.key);
    if (assetOrder.length !== instrumentKeys.length || assetOrder.some((k, i) => k !== instrumentKeys[i])) {
      errors.push('assetOrder가 instruments의 실제 순서와 일치하지 않습니다 - correlationMatrix와 instruments의 자산 순서가 어긋났을 위험이 있습니다.');
    }
  }

  // [조건부승인 항목 5] "60년 초과는 경제적으로 무의미하다"처럼 단정하지 않는다 - 이 앱이 현재
  // 지원하는 계산 범위의 한계일 뿐, 수학적으로 불가능한 값은 아니다.
  if (!Number.isFinite(years) || years <= 0) errors.push(`years 값이 유효하지 않습니다: ${years}`);
  else if (years > 60) errors.push(`현재 모델은 최대 60년까지의 투자기간을 지원합니다(입력값: ${years}년).`);
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) errors.push(`monthlyContribution이 유효하지 않습니다: ${monthlyContribution}`);
  if (!Number.isFinite(initialPrincipal) || initialPrincipal < 0) errors.push(`initialPrincipal이 유효하지 않습니다: ${initialPrincipal}`);
  // [Phase 3-3] 생략 가능(undefined -> 엔진이 0으로 처리) - 값이 있다면 0 이상의 유한값이어야 한다.
  const growth = input.contributionGrowthRate;
  if (growth !== undefined && growth !== null && (!Number.isFinite(growth) || growth < 0)) {
    errors.push(`contributionGrowthRate가 유효하지 않습니다: ${growth}`);
  }

  return { valid: errors.length === 0, errors };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildMonteCarloInputFromState, validateMonteCarloInput };
}
