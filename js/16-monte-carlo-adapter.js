/* -------------------------------------------------------------------------
 * 26. Monte Carlo Engine v2 어댑터 - state(현재 앱 상태) → js/15 Core Engine 표준 입력 변환
 *    - [범위] 이 파일은 Phase 2-1(State → Engine Adapter) 전용이다 - Web Worker/UI 연동은 아직
 *      없다. 여기서 만드는 instruments/correlationMatrix는 그대로 js/15의 runMonthlyPrecisionMC/
 *      runAnnualPreviewMC에 넘길 수 있는 형태다.
 *    - [μ 데이터 출처] μ는 js/05의 기존 목표비중 확장 로직(expandRebalanceTargetsForComputation,
 *      resolveMcEntryRateDetail)을 그대로 재사용한다 - Return Key lineage(user override · Master · 자동 추천 ·
 *      unresolved)가 결정론과 같다.
 *    - [σ/상관 데이터 출처 · 2026-09-16 §37] 종목 가격 이력이 아니라 장기 CMA 자산군(js/26 CMA_ACTIVE_SET,
 *      js/27 buildCmaRiskInputs)에서 온다. 상관계수는 OFFICIAL_CMA_DIRECT → OFFICIAL_CMA_MAPPING → BENCHMARK_REFERENCE.
 *    - [잘못된 입력을 조용히 보정하지 않는다] 장기 CMA 자산군을 정할 수 없는 "위험자산"(채권/현금이
 *      아닌 종목)이 있으면, 그 종목을 임의로 빼거나 σ=0으로 채우지 않고 명확한 오류로 반환한다 -
 *      투자 판단에 쓰이는 시뮬레이션에서 데이터 누락을 조용히 넘기면 안 되기 때문이다.
 * ---------------------------------------------------------------------- */

// [자산 순서 불일치 방지] instruments 배열과 correlationMatrix가 항상 이 순서(canonical order)로
// 함께 만들어지고 함께 검증된다 - buildMonteCarloInputFromState()가 반환하는 assetOrder를 그대로
// 신뢰하면 되고, 이 순서를 벗어나 instruments/matrix를 따로 재조합하면 안 된다.
// [Phase 24-B - Owner MC] config.ownerFilter('신랑'|'와이프'|undefined)를 그대로 아래 3개 household
// 함수(js/05)에 전달만 한다 - 이 파일 자신의 로직(μ/σ/상관행렬 조립, Safety 집계)은 전혀 바뀌지 않았고,
// "어떤 owner의 목표비중/원금/월적립금을 기준으로 계산할지"만 upstream(js/05)에서 좁혀진다.
// ownerFilter 생략 시 기존과 완전히 동일(bit-identical).
// [§37 CMA-01] MC 항목 하나의 "앱 자산 성격" - 장기 CMA 자산군을 고르는 근거다.
//   1) 수익률 기준(Return Key)이 시스템 키면 그 키의 성격(RETURN_KEY_CHARACTER - 수익률 해석과 같은 표)
//   2) 사용자 정의 키 · 기준 없음이면 종목 자체의 성격 판정(자동 수익률 추천과 같은 근거 목록 + Exposure Master · D-16)
//   성격을 확인하지 못하면 UNRESOLVED - 지역만 보고 주식으로 단정하지 않는다(Phase 47-A 원칙 그대로).
/* [E-02 · §6] 사용자가 환헤지로 확정한 미국 주식형 상품은 같은 공식 원문(JPM LTCMA KRW)의
 * 환헤지 자산군으로 연결한다. 이 앱의 MC에는 별도의 FX 단계가 없고 환율 영향이 원화 기준 자산군의
 * μ/σ/상관 안에 들어 있으므로, "환율 영향을 뺀다"는 것은 곧 환헤지 행을 고른다는 뜻이다
 * (해외채권이 hedgeStatus로 이미 하고 있는 것과 같은 방식 - 새 환율 모형이 아니다).
 *   · 사용자가 고르지 않았으면(UNRESOLVED) 아무것도 하지 않는다 - 환노출로 간주하지 않는다.
 *     기존 US_EQUITY(원문 "U.S. Large Cap" = 원화 기준 · 환헤지 없음)가 그대로 쓰이며,
 *     이는 이번 변경 전 동작과 완전히 같다.
 *   · 국내 주식 · 신흥국 주식에는 원문에 환헤지 행이 없어 적용하지 않는다(가까운 자산군으로
 *     옮겨 쓰지 않는다 - data/cma/app-asset-class-map.json unmapped 참고). */
function applyUserHedgeToAppClass(appClass, subject) {
  if (appClass !== ASSET_CHARACTERS.US_EQUITY) return null;
  const hedge = (typeof sanitizeFxHedgeStatus === 'function') ? sanitizeFxHedgeStatus(subject && subject.fxHedgeStatus) : null;
  if (hedge !== 'HEDGED') return null;
  /* [2026-09-22 · PM 결정 대기] 활성 CMA 세트가 이 자산군을 실제로 연결하고 있을 때만 바꾼다.
   * 연결이 없으면 US_EQUITY 그대로 두어 계산이 이전과 완전히 같다 - 연결 없는 자산군을 돌려주면
   * 그 자산이 MC에서 통째로 빠져(UNMAPPED) 사용자가 환헤지를 골랐다는 이유만으로 자산이
   * 사라지는 일이 벌어진다. 연결하지 않는 이유는 data/cma/app-asset-class-map.json의
   * unmapped.US_EQUITY_HEDGED에 근거와 함께 적어 두었다(통화 기준이 다른 두 기관 숫자를 섞게 된다). */
  if (typeof resolveCmaRiskForAppClass !== 'function') return null;
  let mapped;
  try { mapped = resolveCmaRiskForAppClass(ASSET_CHARACTERS.US_EQUITY_HEDGED, getActiveCmaSet()); } catch (e) { mapped = null; }
  return (mapped && mapped.status === 'MAPPED') ? ASSET_CHARACTERS.US_EQUITY_HEDGED : null;
}

function resolveMcAppAssetClass(rateDetail) {
  const key = rateDetail ? canonicalRateKey(rateDetail.key) : null;
  // [BOND-4 · §47-3] 'BOND' Return Key는 "채권이다"까지만 말해 준다. 채권 레코드(js/29)가 발행인 유형 ·
  // 통화 · 환헤지를 알려 주면 그쪽이 자산군(σ · 상관)의 더 정확한 근거다. Return Key 자체는 'BOND' 그대로라
  // 수익률(μ) 경로는 전혀 바뀌지 않는다 - 자산군만 세분된다.
  if (key && RETURN_KEY_CHARACTER[key] === ASSET_CHARACTERS.BOND && rateDetail && rateDetail.subject) {
    const bondCh = resolveAssetCharacter(rateDetail.subject);
    if (bondCh && bondCh.source === 'bondLedger' && bondCh.character !== ASSET_CHARACTERS.BOND) {
      return { appClass: bondCh.character, basis: 'bondLedger' };
    }
  }
  if (key && RETURN_KEY_CHARACTER[key]) {
    const hedged = applyUserHedgeToAppClass(RETURN_KEY_CHARACTER[key], rateDetail && rateDetail.subject);
    return hedged ? { appClass: hedged, basis: 'userHedge' } : { appClass: RETURN_KEY_CHARACTER[key], basis: 'returnKey' };
  }
  if (key === '현금') return { appClass: ASSET_CHARACTERS.CASH, basis: 'returnKey' };
  if (key && /\.KQ$/i.test(key)) return { appClass: ASSET_CHARACTERS.KR_EQUITY, basis: 'returnKey' };
  const subject = rateDetail && rateDetail.subject;
  if (subject) {
    const ch = resolveAssetCharacter(subject);
    // 위험 자산군 판정에는 "확정 자산군 '주식' + 상장 지역"(individualStock)도 인정한다 - 사용자가 정한 수익률 키를 쓰는 개별 주식의
    // 변동성 근거다. 수익률 자동 추천(CHARACTER_SOURCES_FOR_AUTO_RATE_KEY)에는 여전히 쓰지 않는다.
    // [1차 통합 구현 · D-16] Exposure Master(근거 있는 상품 사실)가 준 자산군도 인정한다 - MC 자산군(σ · 상관)만의 근거이며
    // Return Key(μ)에는 쓰지 않는다(js/05 resolveRateKeyFromAssetCharacter는 원장을 보지 않는다).
    const trusted = CHARACTER_SOURCES_FOR_AUTO_RATE_KEY.includes(ch.source) || ch.source === 'individualStock' || ch.source === 'exposureMaster';
    if (trusted && ch.character !== ASSET_CHARACTERS.UNRESOLVED) {
      const basis = ch.source === 'individualStock' ? 'listedStock' : (ch.source === 'exposureMaster' ? 'exposureMaster' : 'instrumentCharacter');
      const hedged = applyUserHedgeToAppClass(ch.character, subject);
      return hedged ? { appClass: hedged, basis: 'userHedge' } : { appClass: ch.character, basis };
    }
  }
  return { appClass: ASSET_CHARACTERS.UNRESOLVED, basis: 'none' };
}
// 시스템 기본 수익률을 그대로 쓰는 항목인가 - 사용자가 정한 수익률(사전 키 · 키워드 · 시스템 키 값 변경)은 CMA 수익률로 바꾸지 않는다(RET-02-05).
function isSystemDefaultMcRate(rateDetail, presetKey) {
  if (!rateDetail || ['customKey', 'customKeyword'].includes(rateDetail.source)) return false;
  const key = canonicalRateKey(rateDetail.key);
  if (!RETURN_KEY_CHARACTER[key]) return false;
  return getCustomRate(key, presetKey) === undefined;
}

async function buildMonteCarloInputFromState(config) {
  config = config || {};
  const presetKey = config.presetKey || 'normal';
  const ownerFilter = config.ownerFilter;
  const errors = [];
  const warnings = [];
  // [Phase 3-5 Safety Layer] BLOCK 대상은 errors와 별개로도 safetyIssues에 함께 쌓는다(예: Fee<0/>=100%,
  // σ<0) - errors는 "계산 자체를 못 만드는" 치명적 상황 전용(즉시 return)이고, safetyIssues는 계산은
  // 만들어지되 "이 계산을 믿고 시작해도 되는가"를 판단하는 별도 채널이다. dataQualityIssues는 "데이터 자체의 한계"를 담는다.
  const safetyIssues = [];
  const dataQualityIssues = [];
  // [통합 수정 · F-08 · PMD-07 · PMD-08] 수익률 가정이 없어 0%로 계산되는 항목과, 자동으로 연결된 기준이 자산 성격과 맞지
  // 않는 항목을 알린다(계산 값은 그대로). 같은 이름은 한 번만 알린다.
  const seenReturnIssues = new Set();
  const pushReturnAssumptionIssues = (rateDetail, label) => {
    if (!rateDetail) return;
    if (rateDetail.assumptionMissing && !seenReturnIssues.has('missing|' + label)) {
      seenReturnIssues.add('missing|' + label);
      safetyIssues.push(assessReturnAssumptionMissing(label));
    }
    // [v246 · D-4] Instrument Master 충돌은 가정 없음 여부와 따로 알린다(자동 판별 결과가 UNRESOLVED여도 둘 다 보인다).
    if (rateDetail.instrumentConflict && !seenReturnIssues.has('review|' + label)) {
      seenReturnIssues.add('review|' + label);
      safetyIssues.push(assessReturnAssumptionNeedsReview(label, describeInstrumentReturnKeyConflict(rateDetail.instrumentConflictKeys)));
    }
    // [v246] 종목 기준(instrument)은 사용자가 정한 확정 기준이다 - 자동 연결 확인 필요 대상이 아니다.
    const autoMatched = rateDetail.subject && !['override', 'instrument', 'customKey', 'customKeyword'].includes(rateDetail.source);
    if (autoMatched && !rateDetail.assumptionMissing && !seenReturnIssues.has('review|' + label)) {
      const status = assessReturnAssumptionStatus(rateDetail.subject);
      if (status.status === RETURN_ASSUMPTION_STATUS.NEEDS_REVIEW) {
        seenReturnIssues.add('review|' + label);
        safetyIssues.push(assessReturnAssumptionNeedsReview(label, status.message));
      }
    }
  };

  const weightsMap = computeHouseholdTargetInstrumentWeights(ownerFilter);
  /* [FUTURE-P1] 절세계좌 입력 - config.includeTaxAdvantaged일 때만 구성한다(생략하면 아래 taxEntries가
   * 비어 있어 기존 경로와 완전히 같다). 절세계좌는 목표비중이 아니라 "지금 들고 있는 자산 + 이미 입력된
   * 적립 계획"이므로 weight를 만들지 않고, 일반계좌 목표와 같은 키 규칙으로만 맞춰 둔다 - 같은 종목이면
   * 하나의 instrument로 합쳐져 같은 시장 충격을 받고, 잔고만 계좌별로 따로 유지된다. */
  const taxMap = config.includeTaxAdvantaged
    ? buildTaxAdvantagedMonteCarloInputs(ownerFilter, presetKey, config.years || 20)
    : null;
  const taxOnlyEntries = [];
  if (taxMap) taxMap.forEach((entry, key) => { if (!weightsMap.has(key)) taxOnlyEntries.push({ key, entry }); });

  /* [§37 CMA-01~03] 변동성 · 상관계수는 장기 CMA 자산군에서 온다 - 종목의 최근 가격 이력을 쓰지 않는다.
   * 수익률(μ)은 기존 Return Key 해석(resolveMcEntryRateDetail - 결정론과 같은 함수 · 같은 인자)을 그대로 쓴다.
   * [§37-5 PM 확정] CMA 기대수익률은 MC 직접 입력으로 쓰지 않는다(MC_CMA_RETURN_POLICY.useCmaExpectedReturn = false).
   * 아래 CMA 수익률 분기는 그 정책이 PM 결정으로 바뀔 때만 동작하며, Dataset의 수익률 정의(returnUsableForMc)만으로는 켜지지 않는다. */
  const cmaEntries = []; // assetOrder 순서
  /* [BOND-4 · §47-3] 장기 자산군을 정할 근거가 없는 채권을 모은다.
   * "MC 대상에서 제외"가 무엇을 뜻하는지 분명히 해 둔다 - 제외되는 것은 **위험 시뮬레이션**이지
   * 사용자의 돈이 아니다. universe에서 아예 빼면 그 채권의 원금이 미래예측에서 사라져 결정론 경로와
   * 총액이 달라진다(절세계좌 채권 원금이 통째로 없어지는 것을 실측으로 확인했다). 그래서 잔고 · 납입 ·
   * 리밸런싱에는 그대로 참여시키되, 변동성 가정을 적용하지 않고 "위험을 반영하지 못했다"는 사실을
   * 결과와 화면에 명시한다. 예전처럼 조용히 σ=0으로 두고 아무 말도 하지 않는 것과 다른 점이 이것이다. */
  const bondsWithoutRiskAssumption = [];
  const addEntry = (key, weight, rateDetail, feeRatePctRaw, feeExplicit, label, riskFreeFlag) => {
    const { appClass, basis } = resolveMcAppAssetClass(rateDetail);
    // [§7 · Bond BACKLOG] 채권 · 현금은 기존 정책대로 σ=0이다 - 티커가 있는 채권형 · 현금성 상품도 가격 이력 대신 같은 정책을 쓴다.
    // [RET-03-00 · PMD-08] 수익률 가정이 없는 자산(0% + 가정 없음 경고)은 "시스템이 가정을 적용하지 않고 원금 그대로 둔다" -
    // 성장 가정과 마찬가지로 변동성 가정도 적용하지 않는다(MC는 경고와 함께 계속 실행된다). 수익률 가정이 있는데 CMA 자산군이
    // 없는 위험자산만 오류로 막는다(임의 변동성을 만들지 않는다).
    const noAssumption = !riskFreeFlag && rateDetail.assumptionMissing === true;
    // [BOND-4 · §47-3] 채권은 더 이상 무조건 σ=0이 아니다.
    //   · 분류된 채권(국공채 · 회사채 · 해외채 헤지/비헤지)은 CMA 자산군에서 변동성을 받는다.
    //   · 분류 근거가 없는 채권(성격 BOND)은 σ=0으로 두지 않고 MC에서 제외한다(아래 excludedFromMc).
    //   · 현금성(CASH)은 기존 §7 정책 그대로 σ=0이다 - 채권으로 취급하지 않는다.
    const bondish = typeof isBondCharacter === 'function' && isBondCharacter(appClass);
    const bondUnclassified = appClass === ASSET_CHARACTERS.BOND;
    if (bondUnclassified) bondsWithoutRiskAssumption.push({ key, label, weight, appClass, reason: 'BOND_CLASS_UNRESOLVED' });
    // 분류된 채권만 CMA에서 변동성을 받는다. 분류되지 않은 채권은 변동성을 만들지 않되(위 목록으로 알린다)
    // 원금은 그대로 굴러간다. 현금성은 기존 §7 정책 그대로다.
    const riskFree = appClass === ASSET_CHARACTERS.CASH || noAssumption || bondUnclassified || (riskFreeFlag && !bondish);
    let muAnnualPct = rateDetail.rate;
    let returnSource = 'RETURN_KEY';
    if (!riskFree) {
      const risk = resolveCmaRiskForAppClass(appClass);
      if (MC_CMA_RETURN_POLICY.useCmaExpectedReturn && risk.status === 'MAPPED' && risk.returnUsableForMc && isSystemDefaultMcRate(rateDetail, presetKey)) {
        muAnnualPct = cmaGeometricToAppRate(risk.expectedReturnPct);
        returnSource = 'CMA';
      }
    }
    safetyIssues.push(...assessFee(feeRatePctRaw, label, feeExplicit));
    const returnIssue = assessExpectedReturn(muAnnualPct, label);
    if (returnIssue) safetyIssues.push(returnIssue);
    pushReturnAssumptionIssues(rateDetail, label);
    cmaEntries.push({
      key, label, weight, riskFree, noAssumption, appClass, appClassBasis: basis, returnKey: rateDetail.key, returnSource,
      muAnnual: num(muAnnualPct) / 100, feeRateAnnual: feePercentToDecimal(feeRatePctRaw)
    });
  };

  weightsMap.forEach((v, key) => {
    // [Phase 28-F] owner를 넘겨 getTargetProjectionRate가 보유 자산의 rateMatchOverride(사용자 대표매칭키)를
    // 소유자 우선으로 조회하게 한다 - 결정론 경로(js/05 expandRebalanceTargetsForComputation)와 동일한 정보.
    const pseudoTarget = { type: v.kind, ticker: v.ticker, category: v.category, name: v.name, label: v.label, owner: v.owner };
    const label = v.label || v.name || key;
    // [통합 수정 · N-08 · N-10] 그 소유자의 일반계좌 보유 자산(없으면 같은 입력의 가상 자산)으로 해석한다 - 결정론 일반계좌
    // (computeRegionWeightedRate)와 같은 함수 · 같은 인자다. 다른 소유자 · 절세계좌의 대표매칭을 빌려 쓰지 않는다.
    const rateDetail = resolveMcEntryRateDetail(v, presetKey);
    // [N-06] 무위험(σ=0) 판정은 js/05가 보유 자산의 확정 자산군으로 정해 둔 값(v.riskFree)을 쓴다.
    const legacyCategory = v.kind === 'namedHolding' ? classifyCategory('', v.name) : v.category;
    const isRiskFree = v.riskFree !== undefined ? v.riskFree : (legacyCategory === '채권' || legacyCategory === '현금');
    addEntry(key, v.weight, rateDetail, getTargetProjectionFeeRate(pseudoTarget), isFeeExplicitlySet(pseudoTarget), label, isRiskFree);
  });

  /* [FUTURE-P1] 절세계좌 전용 instrument를 universe에 추가한다 - 일반계좌 목표에는 없는 종목이므로
   * weight는 0이다(일반계좌 잔고/납입 배분에 전혀 참여하지 않는다). weight가 0이어도 이 종목은
   * 상관행렬과 시장 충격 생성에는 정상적으로 참여해야 하므로 universe에서 빼지 않는다.
   * μ/σ 판정은 위 일반계좌와 완전히 같은 규칙을 쓴다 - 절세계좌라고 해서 자산군을 모르는 위험자산을 σ=0으로 덮지 않는다. */
  taxOnlyEntries.forEach(({ key, entry }) => {
    const pseudoTarget = { type: entry.kind, ticker: entry.ticker, category: entry.category, name: entry.name, label: entry.label, owner: undefined };
    // [통합 수정 · F-04] 절세계좌 보유분은 그 자산 자체, 적립 배분은 그 소유자 · 그 계좌 범위로 해석한다.
    const rateDetail = resolveMcEntryRateDetail(entry, presetKey);
    addEntry(key, 0, rateDetail, getTargetProjectionFeeRate(pseudoTarget), isFeeExplicitlySet(pseudoTarget), entry.label, !!entry.riskFree);
  });

  const cmaSet = getActiveCmaSet();
  if (!cmaSet) {
    errors.push('장기 자산군 전망(CMA)을 불러오지 못해 Monte Carlo를 실행할 수 없습니다.');
    return { instruments: null, correlationMatrix: null, assetOrder: null, errors, warnings };
  }
  const cmaRisk = buildCmaRiskInputs(cmaEntries);
  cmaRisk.errors.forEach((e) => {
    if (e.code === 'UNMAPPED') {
      const label = getAssetCharacterLabel(e.appClass || ASSET_CHARACTERS.UNRESOLVED);
      errors.push(`"${e.label}"(${label})에 연결된 장기 CMA 자산군이 없어 변동성을 정할 수 없습니다 - 수익률 관리에서 기준을 지정하거나 목표 비중에서 조정해 주세요.`);
    } else if (e.code === 'CORRELATION_SOURCE_MISSING') {
      errors.push(`"${e.label}" 사이의 장기 상관계수가 공식 장기 전망(CMA)과 참고 자료(Benchmark) 어디에도 없어 계산할 수 없습니다.`);
    } else {
      errors.push(`"${e.label}"의 장기 자산군 전망(CMA) 값을 찾지 못해 계산할 수 없습니다.`);
    }
  });
  if (errors.length > 0) return { instruments: null, correlationMatrix: null, assetOrder: null, errors, warnings };

  const assetOrder = cmaEntries.map((e) => e.key);
  const instruments = cmaEntries.map((e) => {
    const sigmaAnnual = cmaRisk.sigmaByKey[e.key];
    if (!e.riskFree) {
      const volIssue = assessVolatility(sigmaAnnual * 100, e.label, false);
      if (volIssue) safetyIssues.push(volIssue);
    }
    return { key: e.key, weight: e.weight, muAnnual: e.muAnnual, sigmaAnnual, feeRateAnnual: e.feeRateAnnual };
  });
  const correlationMatrix = cmaRisk.matrix;

  const totalWeight = instruments.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) warnings.push(`instrument weight 합계가 1이 아닙니다(${totalWeight.toFixed(4)}) - 목표비중 미설정 구간이 있을 수 있습니다.`);

  // [B3 + Safety Layer] 목표 비중 합계(household 전체 소스인 state.rebalance 자체를 검사 - Future
  // Projection과 완전히 같은 기준, 조건부승인 항목 14) + Contribution Growth/Inflation 경제적 가정 경고.
  safetyIssues.push(...assessHouseholdWeightSums(ownerFilter));
  // [통합 수정 · PMD-02 · N-10] 같은 종목에 소유자 · 계좌별로 서로 다른 수익률 기준 - 각자 기준으로 계산했다는 사실과 직접
  // 맞추는 방법을 알린다. [PMD-03] 월 적립금 대상 종목 미선택 · 원금이 없어 가구 목표 비중에서 빠진 소유자의 적립금.
  findMcReturnKeyConflicts(ownerFilter, !!taxMap).forEach((c) => safetyIssues.push(assessReturnKeyConflict(c.label, c.parts)));
  const contributionGaps = findMonteCarloContributionTargetGaps(ownerFilter);
  contributionGaps.unselected.forEach((g) => safetyIssues.push(assessContributionTargetUnselected(g.owner, g.sharePct, g.amount)));
  contributionGaps.ownersWithoutWeight.forEach((owner) => safetyIssues.push(assessContributionOwnerWithoutPrincipal(owner)));
  // [MC-01] "매년 투자금 증가율"은 사용자 입력에서 사라졌고 계산에도 쓰이지 않으므로
  // 그에 대한 경고도 더 이상 띄우지 않는다(고칠 수 없는 값을 지적하지 않는다).
  const inflationIssue = assessInflation(num(state.projection.inflationRate));
  if (inflationIssue) safetyIssues.push(inflationIssue);

  // [BOND-4 · §47-3] 위험을 반영하지 못한 채권을 명시한다 - 조용히 0으로 두지 않는다.
  if (bondsWithoutRiskAssumption.length) {
    const names = bondsWithoutRiskAssumption.map((e) => e.label).join(' · ');
    const pct = bondsWithoutRiskAssumption.reduce((sum, e) => sum + (e.weight || 0), 0) * 100;
    dataQualityIssues.push(makeIssue('BOND_RISK_ASSUMPTION_UNRESOLVED', SAFETY_LEVEL.WARNING, 'bondPositions',
      '이 채권은 위험 시뮬레이션에서 빠졌습니다(원금은 그대로 반영됩니다)',
      `${names}(합계 비중 약 ${pct.toFixed(1)}%)은 발행인 유형 · 통화 · 환헤지가 확인되지 않아 장기 자산군을 정할 수 없습니다. `
      + '원금과 적립은 그대로 계산하지만 이 자산의 가격 변동은 시뮬레이션에 들어가지 않았습니다 - '
      + '"이 채권에 위험이 없다"는 뜻이 아니라 "위험을 계산할 근거가 아직 없다"는 뜻입니다.',
      '채권 정보(발행인 유형 · 통화 · 환헤지)를 채우면 다음 계산부터 변동성까지 함께 반영됩니다.'));
  }

  const safety = buildSafetyResult(safetyIssues, dataQualityIssues, []);

  /* [FUTURE-P1] taxScope 조립 - 엔진이 쓰는 배열은 전부 assetOrder와 같은 순서여야 한다.
   * initialBalances[i]는 그 종목의 절세계좌 현재 평가액(calcRow 합계), monthlyContributions[i][m-1]은
   * 그 종목에 매달 들어가는 절세계좌 납입금이다(연납이면 각 연도 첫 달에만 값이 있다).
   * 같은 종목이 일반계좌 목표에도 있으면 instrument는 하나로 합쳐지지만 잔고는 여기서 절세계좌 몫만
   * 넣으므로 두 계좌의 돈이 섞이지 않는다. */
  let taxScope = null;
  if (taxMap && assetOrder.length > 0) {
    const months = (config.years || 20) * 12;
    const initialBalances = new Array(assetOrder.length).fill(0);
    const monthlyContributions = assetOrder.map(() => new Array(months).fill(0));
    let hasAnyTaxValue = false;
    assetOrder.forEach((key, idx) => {
      const entry = taxMap.get(key);
      if (!entry) return;
      initialBalances[idx] = entry.initial || 0;
      if (entry.initial > 0) hasAnyTaxValue = true;
      const src = entry.monthly || [];
      for (let m = 0; m < months; m++) {
        const v = src[m] || 0;
        monthlyContributions[idx][m] = v;
        if (v > 0) hasAnyTaxValue = true;
      }
    });
    // 절세계좌에 자산도 납입도 전혀 없으면 taxScope를 만들지 않는다 - 그래야 그런 사용자는
    // 기존 General-only 경로와 완전히 같은 출력(accountScopes 없음)을 그대로 받는다.
    if (hasAnyTaxValue) taxScope = { initialBalances, monthlyContributions };
  }

  // [§37 CMA-CORR-09 · CMA-VER-02] 결과 화면 · 결과 기록용 출처 정보 - 계산에는 쓰이지 않는다.
  const cma = {
    setVersion: cmaSet.setVersion,
    inputModelVersion: MC_INPUT_MODEL_VERSION,
    primary: cmaDatasetMetaForResult(cmaSet.primary),
    benchmarks: (cmaSet.benchmarks || []).map(cmaDatasetMetaForResult),
    instruments: cmaEntries.map((e) => ({
      key: e.key, label: e.label, riskFree: e.riskFree, noAssumption: e.noAssumption, appClass: e.appClass, appClassBasis: e.appClassBasis,
      cmaClass: e.riskFree ? null : (cmaRisk.risk[e.key] && cmaRisk.risk[e.key].cmaClass) || null,
      // [PM 결정 1 후속] 자산 성격마다 위험 출처 기관이 다를 수 있다(riskProvider · §47-3) -
      // 화면이 "PRIMARY 기관 하나"로 뭉뚱그리지 않도록 줄마다 실제 기관을 함께 넘긴다.
      riskProvider: e.riskFree ? null : (cmaRisk.risk[e.key] && cmaRisk.risk[e.key].riskProvider) || null,
      volatilityPct: e.riskFree ? 0 : cmaRisk.sigmaByKey[e.key] * 100, returnKey: e.returnKey, returnSource: e.returnSource
    })),
    pairs: cmaRisk.pairs
  };

  return { instruments, correlationMatrix, assetOrder, errors, warnings, safety, cma, bondsWithoutRiskAssumption, ...(taxScope ? { taxScope } : {}) };
}
function cmaDatasetMetaForResult(ds) {
  if (!ds) return null;
  return {
    datasetId: ds.datasetId, version: ds.version, provider: ds.provider, sourceTitle: ds.sourceTitle, sourceUrl: ds.sourceUrl,
    asOfDate: ds.asOfDate, horizonYears: ds.horizonYears, currency: ds.currency, role: ds.role, returnDefinition: ds.returnDefinition
  };
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
  /* [MC-01] extraContributions는 생략 가능(undefined/빈 배열 -> 엔진이 추가 투자 없음으로 처리).
   * 있다면 monthIndex는 1 이상의 정수, amount는 0 이상의 유한값이어야 한다. 시뮬레이션 기간을
   * 넘는 monthIndex는 오류가 아니라 "이 예측 기간 밖"이며, 엔진이 그 항목만 버린다(js/15). */
  if (input.extraContributions !== undefined && input.extraContributions !== null) {
    if (!Array.isArray(input.extraContributions)) {
      errors.push('extraContributions가 배열이 아닙니다.');
    } else {
      input.extraContributions.forEach((it, idx) => {
        const mi = it && it.monthIndex;
        if (!Number.isFinite(mi) || mi < 1 || Math.trunc(mi) !== mi) {
          errors.push(`extraContributions[${idx}].monthIndex가 유효하지 않습니다: ${mi}`);
        }
        const amt = it && it.amount;
        if (!Number.isFinite(amt) || amt < 0) {
          errors.push(`extraContributions[${idx}].amount가 유효하지 않습니다: ${amt}`);
        }
      });
    }
  }
  // [Step 2 - 적립기간 연결] contributionStreams는 생략 가능(undefined/빈 배열 -> 엔진이 기존
  // monthlyContribution 단일 흐름으로 폴백) - 있다면 각 스트림의 monthly는 0 이상의 유한값, years는
  // null/undefined(제한없음) 또는 0 이상의 유한값이어야 한다(js/01 normalizeMonthlyContributionByOwnerEntry
  // 규약과 동일).
  if (input.contributionStreams !== undefined && input.contributionStreams !== null) {
    if (!Array.isArray(input.contributionStreams)) {
      errors.push('contributionStreams가 배열이 아닙니다.');
    } else {
      input.contributionStreams.forEach((stream, idx) => {
        if (!stream || !Number.isFinite(stream.monthly) || stream.monthly < 0) {
          errors.push(`contributionStreams[${idx}].monthly가 유효하지 않습니다: ${stream && stream.monthly}`);
        }
        const sy = stream && stream.years;
        if (sy !== null && sy !== undefined && (!Number.isFinite(sy) || sy < 0)) {
          errors.push(`contributionStreams[${idx}].years가 유효하지 않습니다(null 또는 0 이상이어야 함): ${sy}`);
        }
      });
    }
  }

  // [FUTURE-P1] taxScope는 생략 가능(undefined -> 엔진이 기존 General-only 경로). 있다면 배열 길이가
  // instruments와 정확히 같아야 한다 - 길이가 어긋나면 "몇 번 종목의 절세계좌 잔고인지"가 통째로
  // 밀려버려(조용히 다른 종목의 돈이 되어) 결과가 틀린 줄도 모르고 나오기 때문이다.
  if (input.taxScope !== undefined && input.taxScope !== null) {
    const ts = input.taxScope;
    const isNumArray = (a) => Array.isArray(a) || ArrayBuffer.isView(a);
    if (!isNumArray(ts.initialBalances) || ts.initialBalances.length !== instruments.length) {
      errors.push(`taxScope.initialBalances 길이(${ts.initialBalances ? ts.initialBalances.length : 'null'})가 asset 수(${instruments.length})와 다릅니다.`);
    } else if (Array.prototype.some.call(ts.initialBalances, (v) => !Number.isFinite(v) || v < 0)) {
      errors.push('taxScope.initialBalances에 유효하지 않은 값(음수 또는 숫자 아님)이 있습니다.');
    }
    if (ts.monthlyContributions !== undefined && ts.monthlyContributions !== null) {
      if (!isNumArray(ts.monthlyContributions) || ts.monthlyContributions.length !== instruments.length) {
        errors.push(`taxScope.monthlyContributions 길이(${ts.monthlyContributions ? ts.monthlyContributions.length : 'null'})가 asset 수(${instruments.length})와 다릅니다.`);
      } else if (Array.prototype.some.call(ts.monthlyContributions, (row) => !isNumArray(row) || Array.prototype.some.call(row, (v) => !Number.isFinite(v) || v < 0))) {
        errors.push('taxScope.monthlyContributions에 유효하지 않은 값(음수 또는 숫자 아님)이 있습니다.');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildMonteCarloInputFromState, validateMonteCarloInput };
}
