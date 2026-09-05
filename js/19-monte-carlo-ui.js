/* -------------------------------------------------------------------------
 * 29. Monte Carlo UI (Phase 2-3) - js/18 Controller를 화면에 연결하는 View 레이어
 *    - [범위 제한] 이 파일은 오직 DOM 렌더링/이벤트 배선만 담당한다. 계산 로직(js/15)·어댑터(js/16)·
 *      Worker(js/17)·Controller(js/18)는 전혀 건드리지 않는다 - startMonteCarloRun/cancelMonteCarloRun을
 *      그대로 호출할 뿐이다.
 *    - [기존 State 재사용] 원금/월납입/투자기간/시나리오 프리셋 전부 기존 값을 그대로 읽는다 - 이
 *      화면 전용으로 새 state를 만들지 않는다(목표금액만 예외 - 기존에 없던 값이라 이 화면 전용
 *      입력창으로 새로 받되, 별도 영속 저장은 하지 않는다).
 * ---------------------------------------------------------------------- */

const MC_UI_STATUS_LABEL = {
  READY: '실행 가능',
  RUNNING: 'Monte Carlo 실행 중',
  COMPLETED: 'Monte Carlo 시뮬레이션 완료',
  CANCELLED: 'Monte Carlo 시뮬레이션이 취소되었습니다.',
  FAILED: 'Monte Carlo 시뮬레이션 실패'
};
const MC_UI_ERROR_MESSAGE = {
  INPUT_ERROR: '입력값을 확인해주세요.',
  DATA_ERROR: '시장 데이터 조회에 실패했습니다. 특정 자산의 가격 이력을 가져오지 못했습니다.',
  CORRELATION_ERROR: '자산 간 상관관계 행렬을 계산하지 못했습니다.',
  SIMULATION_ERROR: 'Monte Carlo 계산 중 오류가 발생했습니다.',
  WORKER_ERROR: '백그라운드 계산 프로세스 실행 중 오류가 발생했습니다.',
  // [조건부승인 항목 11] 무한 대기 대신 명확한 사유로 종료됨을 알린다.
  WORKER_TIMEOUT: '계산이 예상보다 오래 걸려 중단되었습니다. 시뮬레이션 횟수를 줄이거나 다시 시도해주세요.'
};

function mcUiEl(id) { return document.getElementById(id); }

// [Phase 6-C - Semantic Safety, 표시 전용] 해외자산 비중이 하나라도 있는지 - FX 안내 카드 표시 여부만
// 결정하는 순수 조회 함수다. 계산(js/15/16)에는 전혀 관여하지 않고, 계산에도 쓰이지 않는 값이다.
function hasHouseholdForeignAllocation() {
  return REBALANCE_OWNERS.some((owner) => num(state.rebalance[owner].domestic['해외']) > 0);
}

// [기존 State 재사용] '월적립금 설정' 요약(updateMonthlyContributionSummary, js/05)과 동일한 하위호환
// 판정 - 소유자별 값이 하나도 설정 안 됐으면 기존 단일 monthlyContribution으로 폴백한다.
function getHouseholdMonthlyContributionTotal() {
  const byOwner = state.projection.monthlyContributionByOwner;
  const ownerSum = REBALANCE_OWNERS.reduce((s, o) => s + num(byOwner[o] && byOwner[o].total), 0);
  return ownerSum > 0 ? ownerSum : num(state.projection.monthlyContribution);
}

// [Phase 3-4] "수익률 관리"의 findCustomRateKeyForAsset과 마찬가지로, 이 화면 전용의 운용보수 편집
// key도 js/05의 getTargetProjectionFeeRate와 반드시 같은 규칙으로 만들어야 한다(그래야 여기서 저장한
// 값을 실행 시점에 어댑터가 정확히 같은 키로 찾아 읽는다) - buildCustomRateKey/getProjectionGroupKey를
// 그대로 재사용한다(새 키 규칙을 따로 만들지 않음).
function resolveFeeUIKey(v) {
  if (v.kind === 'ticker') return buildCustomRateKey(v.ticker, v.label);
  if (v.kind === 'namedHolding') return buildCustomRateKey('', v.name);
  return getProjectionGroupKey(v.category);
}
function resolveFeeUILabel(v) {
  if (v.kind === 'ticker') return v.label || v.ticker;
  if (v.kind === 'namedHolding') return v.name;
  return `${v.region} ${v.category}`;
}

// 현재 목표비중에 실제로 들어있는 항목만 나열한다(존재하지 않는 종목에 fee를 미리 등록해봐야 쓸 데가
// 없다) - computeHouseholdTargetInstrumentWeights는 어댑터(js/16)가 쓰는 것과 동일한 함수다.
function renderFeeRatesEditor() {
  const listEl = mcUiEl('mcFeeRatesList');
  const weightsMap = computeHouseholdTargetInstrumentWeights();
  const feeRates = state.projection.customFeeRates || {};
  const rows = [];
  weightsMap.forEach((v) => {
    const key = resolveFeeUIKey(v);
    if (!key) return;
    rows.push({ key, label: resolveFeeUILabel(v) });
  });
  if (rows.length === 0) {
    listEl.innerHTML = `<p class="text-[11px] text-slate-400">목표 비중에 종목이 설정되지 않았습니다.</p>`;
    return;
  }
  listEl.innerHTML = rows.map((r, idx) => `
    <div class="flex items-center gap-1.5">
      <span class="flex-1 text-[11px] text-slate-600 dark:text-slate-300 truncate">${escapeHtml(r.label)}</span>
      <input type="number" step="0.01" min="0" data-fee-key="${escapeHtml(r.key)}" value="${feeRates[r.key] !== undefined ? feeRates[r.key] : ''}" placeholder="0" class="w-16 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
      <span class="text-[10px] text-slate-400">%</span>
    </div>`).join('');
  listEl.querySelectorAll('input[data-fee-key]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const key = e.target.dataset.feeKey;
      const v = e.target.value;
      if (v === '') delete state.projection.customFeeRates[key];
      else state.projection.customFeeRates[key] = num(v);
      persistProjection();
    });
  });
}
mcUiEl('mcFeeRatesToggleBtn').addEventListener('click', () => {
  const area = mcUiEl('mcFeeRatesArea');
  const willShow = area.classList.contains('hidden');
  area.classList.toggle('hidden');
  if (willShow) renderFeeRatesEditor();
});

function resetMonteCarloUiToReady() {
  mcUiEl('mcRunBtn').classList.remove('hidden');
  mcUiEl('mcRunBtn').disabled = false;
  mcUiEl('mcRunBtn').textContent = 'Monte Carlo 실행';
  mcUiEl('mcCancelBtn').classList.add('hidden');
  mcUiEl('mcProgressArea').classList.add('hidden');
  mcUiEl('mcResultArea').classList.add('hidden');
  mcUiEl('mcStatusText').classList.add('hidden');
  mcUiEl('mcPresetSelect').disabled = false;
  mcUiEl('mcIterationsSelect').disabled = false;
  if (mcUiEl('mcSafetyIssues')) mcUiEl('mcSafetyIssues').classList.add('hidden');
  // [Phase 17 P1-4] 새 2단 Safety 컨테이너도 함께 리셋한다(재실행 시 이전 결과의 카드가 잠깐 남아있지 않도록).
  if (mcUiEl('mcSafetyCritical')) { mcUiEl('mcSafetyCritical').classList.add('hidden'); mcUiEl('mcSafetyCritical').innerHTML = ''; }
  if (mcUiEl('mcSafetyDetailToggleBtn')) mcUiEl('mcSafetyDetailToggleBtn').classList.add('hidden');
}

function setMonteCarloUiRunning() {
  mcUiEl('mcRunBtn').disabled = true;
  mcUiEl('mcRunBtn').textContent = '실행 중...';
  mcUiEl('mcCancelBtn').classList.remove('hidden');
  mcUiEl('mcProgressArea').classList.remove('hidden');
  mcUiEl('mcResultArea').classList.add('hidden');
  mcUiEl('mcStatusText').classList.add('hidden');
  mcUiEl('mcProgressBar').style.width = '0%';
  mcUiEl('mcProgressText').textContent = '0 / 0회 (0%)';
  mcUiEl('mcPresetSelect').disabled = true;
  mcUiEl('mcIterationsSelect').disabled = true;
  if (mcUiEl('mcSafetyIssues')) mcUiEl('mcSafetyIssues').classList.add('hidden');
  if (mcUiEl('mcSafetyCritical')) { mcUiEl('mcSafetyCritical').classList.add('hidden'); mcUiEl('mcSafetyCritical').innerHTML = ''; }
  if (mcUiEl('mcSafetyDetailToggleBtn')) mcUiEl('mcSafetyDetailToggleBtn').classList.add('hidden');
}

function updateMonteCarloProgress(completed, total, progress) {
  // [진행률은 Worker 값을 그대로 신뢰 - 가짜 애니메이션 없음] progress는 항상 0~100 범위로 오고
  // 감소하지 않는다(js/15 hooks가 순차 증가만 하도록 보장) - 여기서는 받은 값을 그대로 표시만 한다.
  mcUiEl('mcProgressBar').style.width = progress + '%';
  mcUiEl('mcProgressText').textContent = `${fmtNum(completed, 0)} / ${fmtNum(total, 0)}회 (${progress}%)`;
}

function showMonteCarloStatus(text) {
  const el = mcUiEl('mcStatusText');
  el.textContent = text;
  el.classList.remove('hidden');
}

// [초보자용 표현] 막대 라벨도 표(mcMilestoneTableBody)와 동일한 원칙 - P10/P50/P90을 그대로 크게
// 보여주지 않고, 값을 왜곡하지 않는 쉬운 말로 바꾼다. 기술 용어(P10 등)는 title 툴팁에만 남긴다.
function renderBarsInto(elId, last, colorSet) {
  const maxV = last.p90 || 1;
  const bars = [
    { label: '낮음', title: 'P10', value: last.p10, color: colorSet.p10 },
    { label: '약간낮음', title: 'P25', value: last.p25, color: colorSet.p25 },
    { label: '중간', title: 'P50', value: last.p50, color: colorSet.p50 },
    { label: '약간높음', title: 'P75', value: last.p75, color: colorSet.p75 },
    { label: '높음', title: 'P90', value: last.p90, color: colorSet.p90 }
  ];
  mcUiEl(elId).innerHTML = bars.map((b) => `
    <div class="flex items-center gap-2 text-[10px]">
      <span class="w-11 shrink-0 text-slate-400" title="${b.title}">${b.label}</span>
      <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div class="h-full rounded-full ${b.color}" style="width:${Math.max(2, (b.value / maxV) * 100)}%"></div>
      </div>
      <span class="w-16 shrink-0 text-right text-slate-500 dark:text-slate-400">${fmtKRWShort(b.value)}</span>
    </div>`).join('');
}

// result: js/15 원본(명목) 결과. inflationRatePct: state.projection.inflationRate(예: 2.5, %단위 그대로).
// goalMeta: { rawAmount, mode, nominalGoalAmount, targetYears } | null - mcRunBtn 클릭 시점에 결정된 값을
// 그대로 넘겨받는다(요청 시점과 표시 시점의 목표금액/모드가 어긋나지 않도록).
// contributionMeta: { initialMonthly, growthRatePct, years } - [Phase 3-3] 납입 스케줄 표시용.
// weightedFeePct: [Phase 3-4] 포트폴리오 가중평균 운용보수(%) - 표시 전용, 계산에는 이미 instrument별로
// 반영된 뒤라(js/15) 여기서 다시 쓰지 않는다.
function renderMonteCarloResult(result, inflationRatePct, goalMeta, contributionMeta, weightedFeePct) {
  mcUiEl('mcProgressArea').classList.add('hidden');
  mcUiEl('mcCancelBtn').classList.add('hidden');
  mcUiEl('mcRunBtn').disabled = false;
  mcUiEl('mcRunBtn').textContent = 'Monte Carlo 실행';
  mcUiEl('mcPresetSelect').disabled = false;
  mcUiEl('mcIterationsSelect').disabled = false;
  mcUiEl('mcResultArea').classList.remove('hidden');
  showMonteCarloStatus(MC_UI_STATUS_LABEL.COMPLETED);

  // [Phase 3-5 Result Safety] result.safety는 js/18이 COMPLETED 시점에 preflight(fee/return/weight-sum
  // 등) + post-hoc(PSD correction/시뮬레이션 신뢰도/결과 스프레드) issue를 합쳐 붙여준 것이다 - 값은
  // 전혀 건드리지 않고 issue만 카드로 보여준다(BLOCK은 여기 도달하지 않음 - 이미 실행 전에 막혔음).
  if (result.safety && typeof renderSafetyIssueList === 'function') {
    const nonBlockIssues = [].concat(result.safety.issues, result.safety.dataQuality.issues, result.safety.modelRisk.issues)
      .filter((i) => i.severity !== 'BLOCK');
    // [Phase 6-C - Semantic Safety] 계산 판정과 무관한 순수 해석 안내 카드 - Phase 6-B 감사에서 지적된
    // "기대수익률/Goal Probability의 실제 의미, 데이터 기간, 해외자산 환율, 모델링 범위"를 사용자에게
    // 명시적으로 전달한다. js/21의 explain*() 함수는 값을 전혀 바꾸지 않고 issue만 반환한다.
    const semanticIssues = [
      (typeof explainExpectedReturnSemanticAlwaysOn === 'function') ? explainExpectedReturnSemanticAlwaysOn() : null,
      (goalMeta && typeof explainGoalProbabilitySemanticAlwaysOn === 'function') ? explainGoalProbabilitySemanticAlwaysOn() : null,
      (typeof explainHistoricalDataPeriodAlwaysOn === 'function') ? explainHistoricalDataPeriodAlwaysOn() : null,
      (typeof explainFxRiskIfForeign === 'function') ? explainFxRiskIfForeign(hasHouseholdForeignAllocation()) : null,
      (typeof explainAccumulationScopeAlwaysOn === 'function') ? explainAccumulationScopeAlwaysOn() : null,
    ].filter(Boolean);
    // [Phase 17 P1-4] 예전엔 이 issue 전부(WARNING+INFO)를 결과보다 먼저 나오는 mcSafetyIssues
    // 하나에 몰아서 보여줬다 - 이제 "결과 해석에 직접 영향(critical)"만 결과 바로 아래 펼쳐서 보여주고,
    // 나머지(참고성 WARNING + 항상-on INFO 6종)는 결과 아래 "상세보기"로 옮긴다(js/22
    // renderMonteCarloSafetyTiers). 판정 결과(issue 배열) 자체는 한 글자도 바뀌지 않았다 - 어디에
    // 그릴지만 바뀜.
    if (typeof renderMonteCarloSafetyTiers === 'function') {
      renderMonteCarloSafetyTiers(mcUiEl('mcSafetyCritical'), mcUiEl('mcSafetyDetailToggleBtn'), mcUiEl('mcSafetyDetail'), nonBlockIssues.concat(semanticIssues));
    } else {
      renderSafetyIssueList(mcUiEl('mcSafetyIssues'), nonBlockIssues.concat(semanticIssues));
    }
  }

  // [js/20 재사용 - 계산 반복 구현 금지] 명목 결과(result)는 그대로 두고, 실질가치는 이 변환 레이어의
  // 결과(withReal)에서만 읽는다 - result 자체를 mutate하지 않으므로 엔진 회귀에 영향 없음.
  // [Phase 3-5 B2 수정] 예전엔 여기서만 Math.max(0, ...)로 음수를 0으로 바닥 처리했다 - 그 결과
  // "-1% 입력 -> 화면 라벨은 -1% 그대로 표시(바로 아래 mcInflationNote)하면서 실제 계산은 0%로
  // 수행"되는 표시값≠계산값 불일치가 있었다. 저장(state.projection.inflationRate)도 애초에 음수를
  // 그대로 허용하므로(js/05 inflationRateInput 리스너), 소비 지점에서만 몰래 바닥 처리하지 않고 저장된
  // 값을 그대로 쓴다 - 디플레이션(-1% 등) 자체는 수학적으로 유효한 시나리오라 막을 이유가 없다(BLOCK은
  // assessInflation이 -100% 이하일 때만 별도로 건다).
  const inflationRate = num(inflationRatePct) / 100;
  const withReal = applyInflationToResult(result, inflationRate);
  mcUiEl('mcInflationNote').textContent = `인플레이션율: ${fmtNum(inflationRatePct, 1)}%`;
  mcUiEl('mcWeightedFeeNote').textContent = `예상 연간 운용보수(포트폴리오 가중평균): ${fmtNum(weightedFeePct || 0, 2)}%`;

  // [Phase 3-3] 총 납입원금은 Monte Carlo path와 무관한 순수 현금흐름 합계라 js/15의 계산 반복 없이
  // computeTotalContributionPrincipal(js/15, 회귀테스트 D로 검증된 동일 공식)을 그대로 재사용한다.
  if (contributionMeta) {
    const { initialMonthly, growthRatePct, years, streams } = contributionMeta;
    const growthRate = growthRatePct / 100;
    const finalYearMonthly = initialMonthly * Math.pow(1 + growthRate, years - 1);
    // [Step 2 - 적립기간 연결] owner 중 누구라도 실제로 적립기간을 설정했으면(streams에 null이 아닌
    // years가 하나라도 있으면), "총 납입원금" 표시도 그 owner의 적립기간만큼만 계산해야 정확하다 -
    // 그렇지 않으면 실제로는 조기 종료된 적립인데 화면은 20년 내내 적립한 것처럼 과대 표시된다.
    // computeTotalContributionPrincipal(단일 스트림, 기존 무변경) 자체는 그대로 재사용하고,
    // computeTotalContributionPrincipalMultiStream(신규·추가)이 각 스트림을 그 함수로 위임만 한다.
    const hasExplicitYears = (streams || []).some((s) => s.years !== null && s.years !== undefined);
    const totalPrincipal = hasExplicitYears
      ? computeTotalContributionPrincipalMultiStream(streams, growthRate, years)
      : computeTotalContributionPrincipal(initialMonthly, growthRate, years);
    // [P5 - Phase 9 감사 후속] Monte Carlo는 owner별 종목 배분(Deterministic처럼)이 아니라 가구 전체
    // 목표비중을 기준으로 신규 적립금을 배분한다(household pooled target-weight, js/16
    // buildMonteCarloInputFromState - 이번 작업에서 구조 자체는 바꾸지 않음). 두 결과를 비교하는
    // 초보자가 "왜 다르지?"라고 오해하지 않도록 짧게 고지만 한다(복잡한 기술 설명 없이).
    const allocationNote = '참고: Monte Carlo는 가구 전체 목표비중을 기준으로 계산합니다.';
    mcUiEl('mcContributionScheduleArea').innerHTML = (growthRatePct > 0
      ? `초기 월 적립금 ${fmtKRWShort(initialMonthly)} · 연간 증가율 ${fmtNum(growthRatePct, 1)}% · ${years}년차 월 적립금 약 ${fmtKRWShort(finalYearMonthly)}<br>총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`
      : `월 적립금 ${fmtKRWShort(initialMonthly)}(매월 동일) · 총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`)
      + `<br>${escapeHtml(allocationNote)}`;
  }

  const last = withReal.milestones[withReal.milestones.length - 1];
  mcUiEl('mcP50Text').textContent = fmtKRWShort(last.p50);
  mcUiEl('mcP50RealText').textContent = fmtKRWShort(last.real.p50);

  mcUiEl('mcMilestoneTableBody').innerHTML = withReal.milestones.map((m) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${m.year}년후</td>
      <td class="px-1 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p10)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p10)}</span></td>
      <td class="px-1 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p25)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p25)}</span></td>
      <td class="px-1 py-2 text-right font-bold whitespace-nowrap">${fmtKRWShort(m.p50)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p50)}</span></td>
      <td class="px-1 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p75)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p75)}</span></td>
      <td class="px-1 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p90)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p90)}</span></td>
    </tr>`).join('');

  // [범위 시각화 - 단순 막대, 명목/실질 구분] 화려한 차트 대신 P10~P90을 가로 막대로 표시(마지막
  // milestone 기준) - 숫자의 명확성을 우선한다(요청 반영). 새 chart library를 추가하지 않는다.
  renderBarsInto('mcRangeBarsArea', last, { p10: 'bg-red-400', p25: 'bg-amber-400', p50: 'bg-brand-500', p75: 'bg-emerald-400', p90: 'bg-emerald-600' });
  renderBarsInto('mcRangeBarsRealArea', last.real, { p10: 'bg-red-200', p25: 'bg-amber-200', p50: 'bg-brand-300', p75: 'bg-emerald-200', p90: 'bg-emerald-300' });

  const goalArea = mcUiEl('mcGoalArea');
  if (goalMeta && last.goalProbability && last.goalProbability[goalMeta.nominalGoalAmount] !== undefined) {
    const probDecimal = last.goalProbability[goalMeta.nominalGoalAmount];
    // [Phase 4 - Goal Probability 표시 정책] js/22 참고 - 꼬리 확률(<10% 또는 >90%)만 정밀도를
    // 낮추고("약 N%"), 중심부는 기존 소수점 1자리 표시를 그대로 유지한다.
    const display = (typeof formatGoalProbabilityDisplay === 'function') ? formatGoalProbabilityDisplay(probDecimal) : { text: `${fmtNum(probDecimal * 100, 1)}%`, isTail: false };
    const tailCaptionHtml = display.isTail ? `<p class="text-[10px] text-amber-600 dark:text-amber-400 mt-1">${GOAL_PROBABILITY_TAIL_CAPTION}</p>` : '';
    // [초보자용 짧은 안내] 별도의 Safety INFO 카드(explainGoalProbabilitySemanticAlwaysOn, js/21)가
    // 더 자세히 설명하지만, 그 카드는 아래쪽 mcSafetyIssues 영역에 따로 있어 놓치기 쉽다 - 확률 숫자
    // 바로 밑에 한 줄로도 "실제 미래 확률이 아니라 지금 가정 기준 시뮬레이션 결과"임을 짧게 덧붙인다.
    const goalShortCaption = '<p class="text-[10px] text-slate-400 mt-1">현재 설정을 기준으로 한 시뮬레이션 결과예요.</p>';
    if (goalMeta.mode === 'real') {
      goalArea.innerHTML = `
        <p class="text-[10px] text-slate-400">목표금액</p>
        <p class="text-sm font-bold">${fmtKRWShort(goalMeta.rawAmount)} (현재 구매력 기준)</p>
        <p class="text-[10px] text-slate-400 mt-1">${goalMeta.targetYears}년 후 명목 환산 목표</p>
        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">${fmtKRWShort(goalMeta.nominalGoalAmount)}</p>
        <p class="text-[10px] text-slate-400 mt-1.5">현재 구매력 기준으로 목표에 도달할 가능성</p>
        <p class="text-lg font-bold text-brand-600 dark:text-brand-300">${display.text}</p>
        ${goalShortCaption}
        ${tailCaptionHtml}`;
    } else {
      goalArea.innerHTML = `
        <p class="text-[10px] text-slate-400">목표금액</p>
        <p class="text-sm font-bold">${fmtKRWShort(goalMeta.rawAmount)} (미래 명목금액)</p>
        <p class="text-[10px] text-slate-400 mt-1.5">${goalMeta.targetYears}년 후 목표에 도달할 가능성</p>
        <p class="text-lg font-bold text-brand-600 dark:text-brand-300">${display.text}</p>
        ${goalShortCaption}
        ${tailCaptionHtml}`;
    }
  } else {
    goalArea.innerHTML = `<p class="text-[11px] text-slate-400">목표금액이 설정되지 않았습니다.</p>`;
  }
}

function handleMonteCarloError(error) {
  mcUiEl('mcProgressArea').classList.add('hidden');
  mcUiEl('mcCancelBtn').classList.add('hidden');
  mcUiEl('mcRunBtn').disabled = false;
  mcUiEl('mcRunBtn').textContent = 'Monte Carlo 실행';
  mcUiEl('mcPresetSelect').disabled = false;
  mcUiEl('mcIterationsSelect').disabled = false;
  // [개발자용 상세 메시지는 console에] 사용자 화면에는 error.code에 매핑된 이해 가능한 문구만 보여준다 -
  // "Unknown error"로 뭉개지 않는다.
  console.error('[Monte Carlo]', error && error.code, error && error.message);
  // [조건부승인 항목 12 - Error Code 세분화] Safety Layer가 만든 BLOCK(SAFETY_* code, safetyIssues
  // 동반)은 기존 5개짜리 고정 문구 맵으로 뭉개지 않고, 각 issue를 3단 구조 카드로 그대로 보여준다 -
  // "비중 합계 오류"와 "가격 데이터 조회 실패"가 이제 서로 다른 문구로 사용자에게 전달된다.
  if (error && Array.isArray(error.safetyIssues) && error.safetyIssues.length > 0 && typeof renderSafetyIssueList === 'function') {
    mcUiEl('mcResultArea').classList.add('hidden');
    renderSafetyIssueList(mcUiEl('mcSafetyIssues'), error.safetyIssues);
    showMonteCarloStatus('입력값을 다시 확인해주세요.');
    return;
  }
  const friendly = MC_UI_ERROR_MESSAGE[error && error.code] || 'Monte Carlo 계산 중 알 수 없는 오류가 발생했습니다.';
  showToast(friendly, 'error');
  showMonteCarloStatus(friendly);
}

function handleMonteCarloCancelled() {
  resetMonteCarloUiToReady();
  showToast(MC_UI_STATUS_LABEL.CANCELLED, 'info');
}

document.getElementById('mcRunBtn').addEventListener('click', async () => {
  const presetKey = mcUiEl('mcPresetSelect').value;
  const iterations = parseInt(mcUiEl('mcIterationsSelect').value, 10);
  const years = Math.max(...getMilestoneYearOffsets());
  const initialPrincipal = computeHouseholdMonteCarloPV();
  const monthlyContribution = getHouseholdMonthlyContributionTotal();
  const goalAmount = num(mcUiEl('mcGoalAmountInput').value);
  const goalMode = (document.querySelector('input[name="mcGoalMode"]:checked') || {}).value || 'nominal';
  // [기존 State 재사용] state.projection.inflationRate/contributionGrowthRate는 js/05가 이미
  // input/저장을 처리한다 - 여기서는 읽기만 한다.
  const inflationRatePct = num(state.projection.inflationRate);
  const contributionGrowthRatePct = Math.max(0, num(state.projection.contributionGrowthRate));

  // [실질 목표금액 → 명목 환산] Engine의 goalAmounts는 항상 명목 기준으로만 해석된다(js/20 설계) -
  // "현재 구매력 기준" 목표를 선택했으면 시뮬레이션에 넘기기 "전에" 여기서 미리 명목으로 바꾼다.
  // targetYears는 이 실행에 실제로 쓰이는 investmentYears(years)와 반드시 같아야 한다(하드코딩 금지).
  let goalMeta = null;
  if (goalAmount > 0) {
    // [Phase 3-5 B2 수정] 위쪽 renderMonteCarloResult와 동일한 이유로 여기서도 바닥 처리를 없앤다 -
    // 실질→명목 환산에 쓰이는 inflationRate는 저장된 값을 그대로 써야 mcInflationNote 라벨/결과
    // 계산이 항상 같은 숫자를 본다.
    const nominalGoalAmount = goalMode === 'real'
      ? convertRealToNominal(goalAmount, inflationRatePct / 100, years)
      : goalAmount;
    goalMeta = { rawAmount: goalAmount, mode: goalMode, nominalGoalAmount, targetYears: years };
  }

  // [Step 2 - 적립기간 연결] Deterministic(js/05 simulateRebalancedPreset)과 정확히 같은 함수
  // (getOwnerMonthlyContributionInputs)를 그대로 재사용해 owner별 {monthly, years}를 뽑는다 - 이렇게
  // 하면 "적립기간"의 의미(null=제한없음, 0을 포함한 숫자=사용자가 실제로 설정한 값, bothUnset 하위호환
  // 폴백)가 Deterministic/Monte Carlo 양쪽에서 완전히 동일해진다(따로 만들지 않음). household pooled
  // target-weight 구조(js/16 buildMonteCarloInputFromState)는 그대로 유지 - owner-aware 자산배분으로
  // 확장하지 않는다(요청 범위 제한). 엔진은 이 스트림들의 monthly 총합만큼만 매월 자산에 배분한다.
  const ownerContributionStreams = REBALANCE_OWNERS.map((owner) => {
    const inputs = getOwnerMonthlyContributionInputs(owner);
    return { monthly: inputs.monthlyContribution, years: inputs.years };
  });
  // [기존 사용자 보호] 어떤 owner도 적립기간을 명시적으로 설정하지 않았으면(전부 null=제한없음) 아예
  // contributionStreams 필드를 넘기지 않는다 - 그래야 엔진이 예전과 완전히 같은 monthlyContribution
  // 단일 스칼라 경로(bit-identical 보장 경로)를 그대로 탄다. 실제로 어떤 owner라도 유효한 적립기간을
  // 설정했을 때만(따라서 결과가 어차피 달라져야 할 때만) 새 경로를 쓴다.
  const hasAnyExplicitContributionYears = ownerContributionStreams.some((s) => s.years !== null && s.years !== undefined);
  const contributionStreams = hasAnyExplicitContributionYears ? ownerContributionStreams : undefined;

  const contributionMeta = { initialMonthly: monthlyContribution, growthRatePct: contributionGrowthRatePct, years, streams: ownerContributionStreams };

  // [Phase 3-4 - 표시 전용] 포트폴리오 가중평균 운용보수를 보여주기 위해, js/18(Worker orchestration -
  // 이번 Phase에서 변경 금지)을 건드리지 않고 어댑터를 한 번 더(캐시된 데이터라 저렴함) 직접 호출한다.
  // 이 결과는 화면 표시에만 쓰고, 실제 시뮬레이션 입력은 여전히 startMonteCarloRun 내부에서 독립적으로
  // 다시 만들어진다(계산 경로 자체는 그대로 유지).
  const feeDisplayResult = await buildMonteCarloInputFromState({ presetKey });
  const weightedFeePct = (feeDisplayResult.instruments || []).reduce((s, i) => s + i.weight * i.feeRateAnnual, 0) * 100;

  // [Phase 3-5 Safety Layer - 계산 시작 전 BLOCK] startMonteCarloRun 내부(js/18)에서도 동일하게 다시
  // 검사하지만(어댑터를 이 화면에서 한 번 더 부르므로 결과가 항상 같음), 여기서 먼저 걸러야 진행바가
  // 잠깐이라도 뜨는 것을 막고 즉시 issue 카드를 보여줄 수 있다.
  const preflightSafety = feeDisplayResult.safety;
  if (preflightSafety && preflightSafety.status === 'BLOCK') {
    const blockIssues = preflightSafety.issues.filter((i) => i.severity === 'BLOCK')
      .concat(preflightSafety.dataQuality.issues.filter((i) => i.severity === 'BLOCK'));
    handleMonteCarloError({ code: blockIssues[0] ? blockIssues[0].code : 'SAFETY_BLOCK', message: blockIssues.map((i) => i.message).join('; '), safetyIssues: blockIssues });
    return;
  }
  // [조건부승인 항목 4-1/4-4 - requiresConfirmation] BLOCK은 아니지만 이례적으로 극단적인 가정(예: 기대
  // 수익률 100%+, Fee 20%+)은 값은 그대로 두되 한 번 더 확인을 요구한다 - Safety Layer는 값을 고치지
  // 않으므로 사용자가 "그래도 진행"을 직접 선택해야 한다.
  if (typeof confirmExtremeAssumptionsIfNeeded === 'function' && preflightSafety) {
    const proceed = confirmExtremeAssumptionsIfNeeded(preflightSafety.issues);
    if (!proceed) { showMonteCarloStatus('실행이 취소되었습니다.'); return; }
  }

  setMonteCarloUiRunning();
  startMonteCarloRun({
    presetKey, mode: 'official',
    initialPrincipal, monthlyContribution, contributionGrowthRate: contributionGrowthRatePct / 100, years,
    contributionStreams, // [Step 2] 모든 owner가 years:null(제한없음)이면 엔진이 기존 monthlyContribution 경로로 폴백 - bit-identical
    simulations: iterations, seed: 20260101,
    goalAmounts: goalMeta ? [goalMeta.nominalGoalAmount] : undefined
  }, {
    onStarted: () => showMonteCarloStatus(MC_UI_STATUS_LABEL.RUNNING),
    onProgress: (completed, total, progress) => updateMonteCarloProgress(completed, total, progress),
    onCompleted: (result) => renderMonteCarloResult(result, inflationRatePct, goalMeta, contributionMeta, weightedFeePct),
    onCancelled: () => handleMonteCarloCancelled(),
    onFailed: (error) => handleMonteCarloError(error)
  });
});

document.getElementById('mcCancelBtn').addEventListener('click', () => {
  cancelMonteCarloRun();
});
