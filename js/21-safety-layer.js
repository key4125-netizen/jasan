/* -------------------------------------------------------------------------
 * 27. Safety Layer (Phase 3-5) - "계산할 수 있다"와 "믿고 사용할 수 있다"를 구분하는 계층.
 *    - [계산 엔진과 완전히 분리] 이 파일은 js/15(Monte Carlo 엔진)/js/05(결정론적 계산)의 계산 결과나
 *      가정을 단 한 줄도 수정하지 않는다. 오직 "이 입력/데이터/결과를 얼마나 신뢰할 수 있는가"만
 *      판정해 issue 배열로 반환한다 - 값을 고치는 함수는 이 파일에 하나도 없다.
 *    - [순수 함수] 이 파일의 모든 assess* 함수는 state/DOM에 의존하지 않고 이미 계산된 값(비중 합계,
 *      수익률 %, σ %, 관측치 수 등)을 인자로 받는다 - js/15와 동일하게 Node에서 DOM 스텁 없이
 *      require()할 수 있고, 어느 계산 경로(Future Projection/Monte Carlo/Goal Probability)에서
 *      호출하든 항상 같은 기준으로 판정한다(Phase 3-3에서 발견된 "경로마다 다른 가정" 버그를
 *      Safety 판정 자체에서도 반복하지 않기 위함 - 조건부승인 항목 14).
 *    - [threshold는 상수, 경제법칙 아님] 아래 SAFETY_THRESHOLDS는 전부 잠정치다 - "기대수익률 20%는
 *      항상 틀렸다" 같은 절대적 판단이 아니라, 실사용 피드백을 보며 조정될 수 있는 값이라는 뜻에서
 *      하드코딩된 매직넘버가 아니라 이름 붙은 상수로만 분리해둔다.
 *    - [BLOCK/WARNING/INFO 3단계] BLOCK = 계산 자체가 수학적으로 불가능하거나 무의미(입력 불가능한
 *      값) - 계산을 막는다. WARNING = 공격적이거나 데이터가 불안정하지만 계산은 가능(경제적으로
 *      비현실적이거나 이례적인 값) - 계산은 허용하고 경고만 동반한다. INFO = 참고 정보(정상 범위
 *      끝자락, 경미한 수치보정 등) - 계산에 영향 없음.
 * ---------------------------------------------------------------------- */

const SAFETY_LEVEL = { PASS: 'PASS', INFO: 'INFO', WARNING: 'WARNING', BLOCK: 'BLOCK' };
const SAFETY_LEVEL_RANK = { PASS: 0, INFO: 1, WARNING: 2, BLOCK: 3 };

// [상수로 분리 - 조건부승인 항목 8] "경제적으로 타당한 절대 기준"이 아니라 최초 잠정치다. 특히
// PSD_WARNING_THRESHOLD/MIN_OBSERVATIONS_*는 실제 사용자 포트폴리오 여러 개로 calibration한 뒤
// 조정하는 것을 전제로 이름 붙은 상수로만 관리한다(코드 곳곳에 매직넘버로 흩어놓지 않음).
const SAFETY_THRESHOLDS = Object.freeze({
  WEIGHT_SUM_TOLERANCE_PCT: 1,          // 목표 비중 합계 허용 오차(%p) - 이 이상 벗어나면 BLOCK
  MIN_OBSERVATIONS_BLOCK: 10,           // 관측치가 이 미만이면 σ/상관계수 계산 자체를 BLOCK
  MIN_OBSERVATIONS_LOW: 60,             // 10~59: 강한 WARNING
  MIN_OBSERVATIONS_OK: 200,             // 60~199: WARNING, 200+: PASS
  PSD_WARNING_THRESHOLD: -0.05,         // minEigenvalueBefore가 이 이하면 "큰 보정"(잠정치, 실측 후 조정)
  RETURN_WARNING_ABS: 20,               // |기대수익률| 이 값 초과 시 경미 WARNING
  RETURN_STRONG_WARNING_HIGH: 50,       // 초과 시 강한 WARNING
  RETURN_CONFIRM_HIGH: 100,             // 이상이면 강한 WARNING + 재확인 권장(BLOCK 아님)
  GROWTH_WARNING_LOW: 5,                // 0~5%: PASS, 5%~: 경미 WARNING
  GROWTH_WARNING_HIGH: 10,              // 10%~: 강한 WARNING
  GROWTH_WARNING_EXTREME: 20,           // 20%~: 매우 강한 WARNING(계산은 그대로 허용)
  INFLATION_WARNING_HIGH: 5,
  INFLATION_STRONG_WARNING_HIGH: 10,
  INFLATION_BLOCK_FLOOR: -100,          // 이 이하(포함)면 실질가치 변환 분모가 0 이하 - BLOCK
  FEE_WARNING_HIGH: 5,                  // 5%~: 경미 WARNING
  FEE_STRONG_WARNING_HIGH: 20,          // 20%~: 강한 WARNING + 재확인 권장(BLOCK 아님 - 100%는 별도 BLOCK)
  VOLATILITY_WARNING_HIGH: 50,
  VOLATILITY_STRONG_WARNING_HIGH: 100,
  SIM_LOW_ITERATION_FOR_GOAL_PROB: 10000,
  GOAL_PROB_EXTREME_LOW: 0.05,
  GOAL_PROB_EXTREME_HIGH: 0.95,
  // [조건부승인 항목 11] 실측(브라우저, 10-instrument/50,000회/20년) 약 10.3초 - 저사양 기기·향후
  // instrument 수 증가 여유를 감안해 6배 마진을 둔다. 임의로 60초를 고른 게 아니라 실측치 기반.
  WORKER_TIMEOUT_MS: 60000,
});

function makeIssue(code, severity, field, title, message, recommendation, extra) {
  return Object.assign({ code, severity, field, title, message, recommendation: recommendation || '' }, extra || {});
}

function combineSeverity(issues) {
  let worst = SAFETY_LEVEL.PASS;
  (issues || []).forEach((i) => { if (SAFETY_LEVEL_RANK[i.severity] > SAFETY_LEVEL_RANK[worst]) worst = i.severity; });
  return worst;
}

// [L. Safety Result Schema] status/computable은 issues+dataQuality+modelRisk 전체 중 가장 나쁜 등급
// 기준. dataQuality/modelRisk를 issues와 분리한 이유: 전자는 "당신의 입력이 문제"(고쳐주세요), 후자는
// "데이터/모델 자체의 한계"(참고해주세요)로 UI 톤을 다르게 가져가기 위함.
function buildSafetyResult(issues, dataQualityIssues, modelRiskIssues) {
  const status = combineSeverity([].concat(issues || [], dataQualityIssues || [], modelRiskIssues || []));
  return {
    status,
    computable: status !== SAFETY_LEVEL.BLOCK,
    issues: issues || [],
    dataQuality: { status: combineSeverity(dataQualityIssues), issues: dataQualityIssues || [] },
    modelRisk: { status: combineSeverity(modelRiskIssues), issues: modelRiskIssues || [] }
  };
}

/* ---- 1. Portfolio: 목표 비중 합계 (B3 수정 - 계산 시작 전 BLOCK으로 통일) --------------------------
 * regionSums: [{ owner, region, sumPct }] - 목표가 하나도 없는 owner/region은 호출부에서 걸러서
 * 넘긴다(목표 미설정은 "0개 자산"이라는 별개 상태이지 "비중 합계 오류"가 아니다). */
function assessWeightSums(regionSums) {
  const issues = [];
  (regionSums || []).forEach(({ owner, region, sumPct }) => {
    const diff = Math.abs(sumPct - 100);
    if (diff > SAFETY_THRESHOLDS.WEIGHT_SUM_TOLERANCE_PCT) {
      issues.push(makeIssue('SAFETY_WEIGHT_SUM', SAFETY_LEVEL.BLOCK, `rebalance.${owner}.${region}`,
        '목표 비중 합계 오류',
        `${owner}님의 ${region} 목표 비중 합계가 ${sumPct.toFixed(1)}%로, 100%에서 ${diff.toFixed(1)}%p 벗어났습니다.`,
        '포트폴리오 구성 화면에서 비중 합계를 100%로 맞춰주세요. (비중은 자동으로 재조정되지 않습니다.)'));
    }
  });
  return issues;
}

// [B3 후속수정 - 개별 비중 부호 검사] assessWeightSums는 "지역 합계"만 보므로 [-20,120](합=100)처럼
// 개별 항목에 음수가 섞여도 합계 tolerance를 통과해버린다 - 부호는 합계와 별개로 항목 하나하나
// 검사해야 한다(0%는 정상 허용, 음수만 BLOCK). items: [{owner, region, label, pct}].
function assessIndividualWeightSigns(items) {
  const issues = [];
  (items || []).forEach(({ owner, region, label, pct }) => {
    if (pct < 0) {
      const fieldSuffix = label ? `.${label}` : '';
      issues.push(makeIssue('SAFETY_NEGATIVE_WEIGHT', SAFETY_LEVEL.BLOCK, `rebalance.${owner}.${region}${fieldSuffix}`,
        '개별 비중 음수 오류',
        `${owner}님의 ${region}${label ? ' - ' + label : ''} 비중이 ${pct}%로, 음수는 허용되지 않습니다.`,
        '개별 자산/지역 비중은 0% 이상이어야 합니다.'));
    }
  });
  return issues;
}

/* ---- 2. Expected Return ------------------------------------------------------------------- */
function assessExpectedReturn(returnPct, fieldLabel) {
  if (returnPct === undefined || returnPct === null || !Number.isFinite(returnPct)) return null;
  const abs = Math.abs(returnPct);
  if (returnPct >= SAFETY_THRESHOLDS.RETURN_CONFIRM_HIGH) {
    return makeIssue('SAFETY_EXTREME_RETURN', SAFETY_LEVEL.WARNING, fieldLabel, '매우 높은 기대수익률',
      `${fieldLabel}의 기대수익률이 연 ${returnPct.toFixed(1)}%로 설정되어 있습니다.`,
      '이례적으로 높은 값입니다 - 입력 실수가 아닌지 다시 확인해주세요.', { requiresConfirmation: true });
  }
  if (abs > SAFETY_THRESHOLDS.RETURN_STRONG_WARNING_HIGH || returnPct < -SAFETY_THRESHOLDS.RETURN_WARNING_ABS) {
    return makeIssue('SAFETY_EXTREME_RETURN', SAFETY_LEVEL.WARNING, fieldLabel, '비현실적인 기대수익률',
      `${fieldLabel}의 기대수익률이 연 ${returnPct.toFixed(1)}%로 설정되어 있습니다.`,
      '장기 시장 평균 대비 매우 공격적이거나 비관적인 가정입니다.');
  }
  if (abs > SAFETY_THRESHOLDS.RETURN_WARNING_ABS) {
    return makeIssue('SAFETY_EXTREME_RETURN', SAFETY_LEVEL.WARNING, fieldLabel, '공격적인 기대수익률',
      `${fieldLabel}의 기대수익률이 연 ${returnPct.toFixed(1)}%로 설정되어 있습니다.`,
      '공격적인 가정입니다 - 참고해주세요.');
  }
  return null;
}

/* ---- 3. Volatility ------------------------------------------------------------------------- */
function assessVolatility(sigmaPct, fieldLabel, isRiskFree) {
  if (sigmaPct === undefined || sigmaPct === null || !Number.isFinite(sigmaPct)) return null;
  if (sigmaPct < 0) {
    return makeIssue('SAFETY_INVALID_VOLATILITY', SAFETY_LEVEL.BLOCK, fieldLabel, '변동성 값 오류',
      `${fieldLabel}의 변동성이 ${sigmaPct}%로, 음수는 수학적으로 불가능합니다.`, '데이터를 다시 확인해주세요.');
  }
  if (sigmaPct === 0 && !isRiskFree) {
    return makeIssue('SAFETY_VOLATILITY_ZERO', SAFETY_LEVEL.WARNING, fieldLabel, '변동성 0%',
      `${fieldLabel}의 변동성이 0%로 계산되었습니다.`,
      '채권/현금이 아닌 자산인데 변동성이 0이라면 데이터 문제일 수 있습니다.');
  }
  if (sigmaPct >= SAFETY_THRESHOLDS.VOLATILITY_STRONG_WARNING_HIGH) {
    return makeIssue('SAFETY_EXTREME_VOLATILITY', SAFETY_LEVEL.WARNING, fieldLabel, '매우 높은 변동성',
      `${fieldLabel}의 변동성이 연 ${sigmaPct.toFixed(1)}%로 매우 높게 계산되었습니다.`,
      '가격이 크게 오르내릴 수 있어 미래 결과의 범위가 넓어질 수 있습니다.');
  }
  if (sigmaPct >= SAFETY_THRESHOLDS.VOLATILITY_WARNING_HIGH) {
    return makeIssue('SAFETY_EXTREME_VOLATILITY', SAFETY_LEVEL.WARNING, fieldLabel, '높은 변동성',
      `${fieldLabel}의 변동성이 연 ${sigmaPct.toFixed(1)}%로 계산되었습니다.`, '참고해주세요.');
  }
  return null;
}

/* ---- 4. 데이터 충분성 (B1 수정 핵심 - "데이터 부족"과 "σ=0"을 구조적으로 분리) -----------------
 * observationCount가 임계치 미만이면 BLOCK - 절대 σ=0으로 대체하지 않는다(호출부가 이 issue를 보고
 * "계산 불가"로 처리해야지, 조용히 0을 채워 넣으면 안 된다). */
function assessDataSufficiency(observationCount, fieldLabel) {
  const n = (observationCount === undefined || observationCount === null) ? 0 : observationCount;
  if (n < SAFETY_THRESHOLDS.MIN_OBSERVATIONS_BLOCK) {
    return makeIssue('SAFETY_DATA_INSUFFICIENT', SAFETY_LEVEL.BLOCK, fieldLabel, '데이터 부족',
      `${fieldLabel}의 사용 가능한 과거 가격 데이터가 ${n}개뿐이라 변동성을 계산할 수 없습니다.`,
      '가격 이력이 더 쌓인 뒤 다시 시도하거나, 해당 종목을 목표 비중에서 제외해주세요.');
  }
  if (n < SAFETY_THRESHOLDS.MIN_OBSERVATIONS_LOW) {
    return makeIssue('SAFETY_DATA_LOW', SAFETY_LEVEL.WARNING, fieldLabel, '데이터가 적음',
      `${fieldLabel}의 사용 가능한 과거 데이터가 ${n}개로 적어 변동성 추정의 불확실성이 높습니다.`,
      '결과를 보수적으로 해석해주세요.');
  }
  if (n < SAFETY_THRESHOLDS.MIN_OBSERVATIONS_OK) {
    return makeIssue('SAFETY_DATA_LOW', SAFETY_LEVEL.WARNING, fieldLabel, '데이터가 다소 적음',
      `${fieldLabel}의 사용 가능한 과거 데이터가 ${n}개입니다.`, '추정이 다소 불안정할 수 있습니다.');
  }
  return null; // >= 200: PASS
}

/* ---- 5. Correlation: 공통거래일 부족으로 0 대체된 경우 ------------------------------------- */
function assessCorrelationPair(observationCount, labelA, labelB) {
  if (observationCount === undefined || observationCount === null) return null;
  if (observationCount < SAFETY_THRESHOLDS.MIN_OBSERVATIONS_BLOCK) {
    return makeIssue('SAFETY_CORRELATION_INSUFFICIENT', SAFETY_LEVEL.WARNING, `correlation.${labelA}-${labelB}`,
      '상관관계 데이터 부족',
      `${labelA}과(와) ${labelB}의 공통 거래일이 ${observationCount}개로 적어 상관관계를 0으로 처리했습니다.`,
      '실제 상관관계가 0이라는 뜻이 아니라, 데이터가 부족해 추정하지 못했다는 의미입니다.');
  }
  return null;
}

/* ---- 6. PSD Correction 규모 ----------------------------------------------------------------- */
function assessPSDCorrection(diagnostics) {
  if (!diagnostics || !diagnostics.psdCorrectionApplied) return null;
  const before = diagnostics.minEigenvalueBefore;
  if (typeof before === 'number' && before <= SAFETY_THRESHOLDS.PSD_WARNING_THRESHOLD) {
    return makeIssue('SAFETY_PSD_CORRECTION', SAFETY_LEVEL.WARNING, 'correlationMatrix', '상관관계 수치 보정(큰 폭)',
      '일부 자산 간 상관관계를 계산하는 과정에서 수치 보정이 적용되었습니다.',
      '결과의 불확실성이 다소 커질 수 있습니다.');
  }
  return makeIssue('SAFETY_PSD_CORRECTION', SAFETY_LEVEL.INFO, 'correlationMatrix', '상관관계 수치 보정(경미)',
    '일부 자산 간 상관관계 계산에 경미한 수치 보정이 적용되었습니다.', '특별한 조치는 필요 없습니다.');
}

/* ---- 7. Contribution Growth ------------------------------------------------------------------ */
function assessContributionGrowth(growthPct) {
  if (growthPct === undefined || growthPct === null || !Number.isFinite(growthPct)) return null;
  if (growthPct >= SAFETY_THRESHOLDS.GROWTH_WARNING_EXTREME) {
    return makeIssue('SAFETY_EXTREME_GROWTH', SAFETY_LEVEL.WARNING, 'contributionGrowthRate', '매우 공격적인 납입액 증가율',
      `연 납입액 증가율이 ${growthPct.toFixed(1)}%로 설정되어 있습니다.`,
      '이 정도 증가율을 장기간 유지하기는 매우 어렵습니다.');
  }
  if (growthPct >= SAFETY_THRESHOLDS.GROWTH_WARNING_HIGH) {
    return makeIssue('SAFETY_EXTREME_GROWTH', SAFETY_LEVEL.WARNING, 'contributionGrowthRate', '공격적인 납입액 증가율',
      `연 납입액 증가율이 ${growthPct.toFixed(1)}%로 설정되어 있습니다.`, '장기간 유지하기 쉽지 않은 수준입니다.');
  }
  if (growthPct >= SAFETY_THRESHOLDS.GROWTH_WARNING_LOW) {
    return makeIssue('SAFETY_EXTREME_GROWTH', SAFETY_LEVEL.WARNING, 'contributionGrowthRate', '다소 공격적인 납입액 증가율',
      `연 납입액 증가율이 ${growthPct.toFixed(1)}%로 설정되어 있습니다.`, '참고해주세요.');
  }
  return null;
}

/* ---- 8. Inflation (B2 수정과 함께 사용 - 저장/소비 규칙 통일 이후 이 함수가 유일한 판정 지점) ---- */
function assessInflation(inflationPct) {
  if (inflationPct === undefined || inflationPct === null || !Number.isFinite(inflationPct)) return null;
  if (inflationPct <= SAFETY_THRESHOLDS.INFLATION_BLOCK_FLOOR) {
    return makeIssue('SAFETY_INVALID_INFLATION', SAFETY_LEVEL.BLOCK, 'inflationRate', '물가상승률 값 오류',
      `물가상승률이 ${inflationPct}%로, 실질가치 환산이 수학적으로 불가능한 값입니다.`,
      '물가상승률을 -100%보다 큰 값으로 입력해주세요.');
  }
  if (inflationPct >= SAFETY_THRESHOLDS.INFLATION_STRONG_WARNING_HIGH) {
    return makeIssue('SAFETY_EXTREME_INFLATION', SAFETY_LEVEL.WARNING, 'inflationRate', '매우 높은 물가상승률',
      `물가상승률이 연 ${inflationPct.toFixed(1)}%로 설정되어 있습니다.`, '장기 가정으로는 이례적으로 높은 수준입니다.');
  }
  if (inflationPct >= SAFETY_THRESHOLDS.INFLATION_WARNING_HIGH) {
    return makeIssue('SAFETY_EXTREME_INFLATION', SAFETY_LEVEL.WARNING, 'inflationRate', '높은 물가상승률',
      `물가상승률이 연 ${inflationPct.toFixed(1)}%로 설정되어 있습니다.`, '다소 높은 수준입니다.');
  }
  if (inflationPct < 0) {
    return makeIssue('SAFETY_EXTREME_INFLATION', SAFETY_LEVEL.WARNING, 'inflationRate', '디플레이션 가정',
      `물가상승률이 연 ${inflationPct.toFixed(1)}%(음수)로 설정되어 있습니다.`,
      '수학적으로 가능한 시나리오이나, 이례적인 가정입니다.');
  }
  return null;
}

/* ---- 9. Fee (F. Fee UNKNOWN 처리 - isFeeExplicitlySet과 함께 사용) --------------------------- */
function assessFee(feePct, fieldLabel, isExplicitlySet) {
  if (isExplicitlySet === false) {
    return [makeIssue('SAFETY_FEE_UNKNOWN', SAFETY_LEVEL.WARNING, fieldLabel, '운용보수 미확인',
      `${fieldLabel}의 운용보수 정보가 없어 0%로 계산되었습니다.`,
      '실제로는 보수가 있을 수 있어 미래자산이 실제보다 크게 보일 수 있습니다. 종목의 연간 총보수비용(운용보수)을 확인해 입력해주세요.')];
  }
  if (feePct === undefined || feePct === null || !Number.isFinite(feePct)) return [];
  if (feePct < 0) {
    return [makeIssue('SAFETY_INVALID_FEE', SAFETY_LEVEL.BLOCK, fieldLabel, 'Fee 값 오류',
      `${fieldLabel}의 운용보수가 ${feePct}%로, 음수는 허용되지 않습니다.`, '0 이상의 값으로 입력해주세요.')];
  }
  if (feePct >= 100) {
    return [makeIssue('SAFETY_INVALID_FEE', SAFETY_LEVEL.BLOCK, fieldLabel, 'Fee 값 오류',
      `${fieldLabel}의 운용보수가 ${feePct}%로, 100% 이상은 허용되지 않습니다.`, '100% 미만의 값으로 입력해주세요.')];
  }
  if (feePct >= SAFETY_THRESHOLDS.FEE_STRONG_WARNING_HIGH) {
    return [makeIssue('SAFETY_EXTREME_FEE', SAFETY_LEVEL.WARNING, fieldLabel, '매우 높은 운용보수',
      `${fieldLabel}의 운용보수가 연 ${feePct}%로 설정되어 있습니다.`,
      '이례적으로 높은 수준입니다 - 입력 실수가 아닌지 확인해주세요.', { requiresConfirmation: true })];
  }
  if (feePct >= SAFETY_THRESHOLDS.FEE_WARNING_HIGH) {
    return [makeIssue('SAFETY_EXTREME_FEE', SAFETY_LEVEL.WARNING, fieldLabel, '높은 운용보수',
      `${fieldLabel}의 운용보수가 연 ${feePct}%로 설정되어 있습니다.`, '일반적인 ETF 대비 높은 수준입니다.')];
  }
  return [];
}

/* ---- 10. Simulation 신뢰도(iteration count vs 극단 확률) - K 섹션, 캘리브레이션 제외 버전 ------ */
function assessSimulationConfidence(iterations, goalProbabilityByAmount) {
  if (!goalProbabilityByAmount || !Number.isFinite(iterations)) return null;
  const values = Object.values(goalProbabilityByAmount);
  const extreme = values.some((p) => p <= SAFETY_THRESHOLDS.GOAL_PROB_EXTREME_LOW || p >= SAFETY_THRESHOLDS.GOAL_PROB_EXTREME_HIGH);
  if (iterations < SAFETY_THRESHOLDS.SIM_LOW_ITERATION_FOR_GOAL_PROB && extreme) {
    return makeIssue('SAFETY_LOW_SIMULATION_CONFIDENCE', SAFETY_LEVEL.WARNING, 'simulation', '목표달성확률 정밀도 낮음',
      '낮은 시뮬레이션 횟수에서는 0%/100%에 가까운 목표달성확률의 정밀도가 낮을 수 있습니다.',
      '더 높은 시뮬레이션 횟수를 선택하면 더 안정적인 추정을 얻을 수 있습니다.');
  }
  return null;
}

/* ---- 11. Result Safety - 값은 그대로 두고 "설명"만 추가 (J 섹션) ------------------------------
 * [중요] 아래 두 함수는 절대 결과값을 변경하지 않는다 - 오직 issue(설명/정보)만 반환한다. "결과가
 * 크다"는 이유만으로 BLOCK/WARNING을 만들지 않는다(사용자 지시 - "계산 오류"와 "공격적 가정의 결과"를
 * 구분해야 함). */
function assessResultSpread(p10, p50, p90) {
  if (!(p50 > 0) || !(p10 > 0) || !(p90 > 0)) return null;
  const spreadRatio = p90 / p10;
  if (spreadRatio > 20) {
    return makeIssue('SAFETY_EXTREME_SPREAD', SAFETY_LEVEL.INFO, 'result', '결과 범위가 매우 넓음',
      `상위 10%(P90)가 하위 10%(P10)의 ${spreadRatio.toFixed(1)}배로, 결과의 범위가 매우 넓게 나타났습니다.`,
      '계산 오류가 아니라, 입력한 변동성 가정이 큰 데서 비롯된 결과일 수 있습니다.');
  }
  return null;
}
// 매 결과에 고정으로 동반하는 해석 안내(조건 없이 항상 반환) - "결과가 크다=오류"로 오해하지 않도록.
function explainResultAlwaysOn() {
  return makeIssue('SAFETY_RESULT_EXPLANATION', SAFETY_LEVEL.INFO, 'result', '결과 해석 안내',
    '이 결과는 입력한 기대수익률과 납입금이 장기간 복리로 누적된 시뮬레이션 결과입니다. 실제 결과는 이보다 크게 다를 수 있습니다.',
    '');
}

// [Phase 4 - Numerical Stability vs Economic Certainty, 조건부승인 항목 5] 위 explainResultAlwaysOn과는
// 의도적으로 별개의 카드로 분리한다("두 내용을 하나의 개념으로 섞지 않는다") - 하나는 "가정이 복리로
// 누적된 결과"라는 경제적 해석, 이것은 "시뮬레이션 횟수"라는 계산 방법 자체에 대한 안내다. Calibration
// Research(Phase 4)에서 실측한 두 가지 사실을 정확히 반영한다: (1) 시뮬레이션 횟수가 늘수록 seed간
// 표본 변동(P50 relSD 0.55%→0.18%, 5k→50k)은 줄어든다 (2) 그러나 같은 조건에서 기대수익률 ±1%p가
// P50을 13~16% 움직이는 것과 비교하면, "표본이 안정적인 것"과 "미래 예측이 정확한 것"은 전혀 다른
// 차원의 문제다 - 이 두 문장을 반드시 함께, 그러나 위 카드와는 분리해서 전달한다.
function explainSimulationStabilityAlwaysOn() {
  return makeIssue('SAFETY_SIMULATION_STABILITY_NOTE', SAFETY_LEVEL.INFO, 'simulation', '시뮬레이션 안정성 안내',
    '시뮬레이션 횟수가 많을수록 계산 결과의 표본 변동은 줄어듭니다.',
    '다만 이는 계산이 안정적이라는 뜻일 뿐 실제 미래 투자수익률을 예측할 수 있다는 뜻은 아닙니다 - 입력한 기대수익률·물가상승률 등의 가정이 달라지면 결과 자체가 크게 달라질 수 있습니다.');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAFETY_LEVEL, SAFETY_LEVEL_RANK, SAFETY_THRESHOLDS,
    makeIssue, combineSeverity, buildSafetyResult,
    assessWeightSums, assessIndividualWeightSigns, assessExpectedReturn, assessVolatility, assessDataSufficiency,
    assessCorrelationPair, assessPSDCorrection, assessContributionGrowth, assessInflation, assessFee,
    assessSimulationConfidence, assessResultSpread, explainResultAlwaysOn, explainSimulationStabilityAlwaysOn
  };
}
