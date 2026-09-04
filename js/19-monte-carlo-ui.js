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
  WORKER_ERROR: '백그라운드 계산 프로세스 실행 중 오류가 발생했습니다.'
};

function mcUiEl(id) { return document.getElementById(id); }

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

function renderBarsInto(elId, last, colorSet) {
  const maxV = last.p90 || 1;
  const bars = [
    { label: 'P10', value: last.p10, color: colorSet.p10 },
    { label: 'P25', value: last.p25, color: colorSet.p25 },
    { label: 'P50', value: last.p50, color: colorSet.p50 },
    { label: 'P75', value: last.p75, color: colorSet.p75 },
    { label: 'P90', value: last.p90, color: colorSet.p90 }
  ];
  mcUiEl(elId).innerHTML = bars.map((b) => `
    <div class="flex items-center gap-2 text-[10px]">
      <span class="w-7 shrink-0 text-slate-400">${b.label}</span>
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

  // [js/20 재사용 - 계산 반복 구현 금지] 명목 결과(result)는 그대로 두고, 실질가치는 이 변환 레이어의
  // 결과(withReal)에서만 읽는다 - result 자체를 mutate하지 않으므로 엔진 회귀에 영향 없음.
  const inflationRate = Math.max(0, num(inflationRatePct)) / 100;
  const withReal = applyInflationToResult(result, inflationRate);
  mcUiEl('mcInflationNote').textContent = `인플레이션율: ${fmtNum(inflationRatePct, 1)}%`;
  mcUiEl('mcWeightedFeeNote').textContent = `예상 연간 운용보수(포트폴리오 가중평균): ${fmtNum(weightedFeePct || 0, 2)}%`;

  // [Phase 3-3] 총 납입원금은 Monte Carlo path와 무관한 순수 현금흐름 합계라 js/15의 계산 반복 없이
  // computeTotalContributionPrincipal(js/15, 회귀테스트 D로 검증된 동일 공식)을 그대로 재사용한다.
  if (contributionMeta) {
    const { initialMonthly, growthRatePct, years } = contributionMeta;
    const growthRate = growthRatePct / 100;
    const finalYearMonthly = initialMonthly * Math.pow(1 + growthRate, years - 1);
    const totalPrincipal = computeTotalContributionPrincipal(initialMonthly, growthRate, years);
    mcUiEl('mcContributionScheduleArea').innerHTML = growthRatePct > 0
      ? `초기 월 적립금 ${fmtKRWShort(initialMonthly)} · 연간 증가율 ${fmtNum(growthRatePct, 1)}% · ${years}년차 월 적립금 약 ${fmtKRWShort(finalYearMonthly)}<br>총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`
      : `월 적립금 ${fmtKRWShort(initialMonthly)}(매월 동일) · 총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`;
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
    const prob = last.goalProbability[goalMeta.nominalGoalAmount] * 100;
    if (goalMeta.mode === 'real') {
      goalArea.innerHTML = `
        <p class="text-[10px] text-slate-400">목표금액</p>
        <p class="text-sm font-bold">${fmtKRWShort(goalMeta.rawAmount)} (현재 구매력 기준)</p>
        <p class="text-[10px] text-slate-400 mt-1">${goalMeta.targetYears}년 후 명목 환산 목표</p>
        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">${fmtKRWShort(goalMeta.nominalGoalAmount)}</p>
        <p class="text-[10px] text-slate-400 mt-1.5">현재 구매력 기준 목표 달성 확률</p>
        <p class="text-lg font-bold text-brand-600 dark:text-brand-300">${fmtNum(prob, 1)}%</p>`;
    } else {
      goalArea.innerHTML = `
        <p class="text-[10px] text-slate-400">목표금액</p>
        <p class="text-sm font-bold">${fmtKRWShort(goalMeta.rawAmount)} (미래 명목금액)</p>
        <p class="text-[10px] text-slate-400 mt-1.5">목표 달성 확률(${goalMeta.targetYears}년 후)</p>
        <p class="text-lg font-bold text-brand-600 dark:text-brand-300">${fmtNum(prob, 1)}%</p>`;
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
    const nominalGoalAmount = goalMode === 'real'
      ? convertRealToNominal(goalAmount, Math.max(0, inflationRatePct) / 100, years)
      : goalAmount;
    goalMeta = { rawAmount: goalAmount, mode: goalMode, nominalGoalAmount, targetYears: years };
  }

  const contributionMeta = { initialMonthly: monthlyContribution, growthRatePct: contributionGrowthRatePct, years };

  // [Phase 3-4 - 표시 전용] 포트폴리오 가중평균 운용보수를 보여주기 위해, js/18(Worker orchestration -
  // 이번 Phase에서 변경 금지)을 건드리지 않고 어댑터를 한 번 더(캐시된 데이터라 저렴함) 직접 호출한다.
  // 이 결과는 화면 표시에만 쓰고, 실제 시뮬레이션 입력은 여전히 startMonteCarloRun 내부에서 독립적으로
  // 다시 만들어진다(계산 경로 자체는 그대로 유지).
  const feeDisplayResult = await buildMonteCarloInputFromState({ presetKey });
  const weightedFeePct = (feeDisplayResult.instruments || []).reduce((s, i) => s + i.weight * i.feeRateAnnual, 0) * 100;

  setMonteCarloUiRunning();
  startMonteCarloRun({
    presetKey, mode: 'official',
    initialPrincipal, monthlyContribution, contributionGrowthRate: contributionGrowthRatePct / 100, years,
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
