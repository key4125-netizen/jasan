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

/* -------------------------------------------------------------------------
 * [Phase 24-B STEP 6 - Owner MC 관점 선택] null(기본값)=가구 전체(기존 동작과 100% 동일),
 * '신랑'|'와이프'=그 owner 단독. 순수 화면 상태(다른 화면 전용 아코디언 열림상태와 동일하게
 * localStorage에 저장하지 않는다 - 새 state schema 아님, Assets 관점전환(assetListViewMode)과
 * 동일한 패턴 재사용).
 * ---------------------------------------------------------------------- */
let mcOwnerScope = null;
const MC_SCOPE_BTN_IDLE_CLASSES = ['border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400'];
const MC_SCOPE_BTN_ACTIVE_CLASSES = ['border-brand-600', 'dark:border-brand-400', 'bg-brand-50', 'dark:bg-brand-950', 'text-brand-700', 'dark:text-brand-200'];
function syncMcOwnerScopeButtonsUI() {
  document.querySelectorAll('#mcOwnerScopeSegmented .mc-owner-scope-btn').forEach((btn) => {
    const btnScope = btn.dataset.scope === 'household' ? null : btn.dataset.scope;
    const active = btnScope === mcOwnerScope;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.classList.remove(...MC_SCOPE_BTN_IDLE_CLASSES, ...MC_SCOPE_BTN_ACTIVE_CLASSES);
    btn.classList.add(...(active ? MC_SCOPE_BTN_ACTIVE_CLASSES : MC_SCOPE_BTN_IDLE_CLASSES));
  });
}
/* -------------------------------------------------------------------------
 * [Phase 24-B STEP 9 - 범용 MC 정보 모달] 제목/본문만 바꿔 끼우는 방식으로 여러 설명(MC란?/공식모델/
 * 성장률 의미/목표확률 의미/데이터 한계 등)을 팝업 하나로 재사용한다 - exchangeRateModal 등 기존
 * 모달과 동일한 open/close 패턴(pushModalHistoryState/popModalHistoryIfNeeded)을 그대로 따른다.
 * ---------------------------------------------------------------------- */
function openMcInfoModal(title, bodyHtml) {
  mcUiEl('mcInfoModalTitle').textContent = title;
  mcUiEl('mcInfoModalBody').innerHTML = bodyHtml;
  mcUiEl('mcInfoModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeMcInfoModal(viaBackButton) {
  mcUiEl('mcInfoModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('closeMcInfoModalBtn').addEventListener('click', () => closeMcInfoModal());
document.getElementById('closeMcInfoModalBtnBottom').addEventListener('click', () => closeMcInfoModal());
document.getElementById('mcInfoModal').addEventListener('click', (e) => { if (e.target.id === 'mcInfoModal') closeMcInfoModal(); });

// [Phase 24-B STEP 9] 기존 설명 문단 + "공식 모델: Monthly Precision Monte Carlo" 박스 내용을
// 한 글자도 지우지 않고 그대로 팝업 본문으로 옮겼다(문구 재배치일 뿐).
// [FUTURE-P1 Phase 3-2 후속] Phase 3-2에서 deterministic 시나리오 영역이 Monte Carlo "아래"로
// 내려가면서 이 문단 첫머리의 "위"라는 위치 지시어가 실제 화면과 어긋나게 됐다 - 위치 지시어를
// 없애고, 화면에 실제로 적혀 있는 이름("성장률별 참고 결과")으로 가리킨다. 설명의 의미·계산·구조는
// 그대로이며 문구만 고쳤다.
document.getElementById('mcIntroInfoBtn').addEventListener('click', () => {
  openMcInfoModal('Monte Carlo란?', `
    <p>"성장률별 참고 결과"는 선택한 기준 연간 성장률이 매년 그대로 반복되고 목표 투자비중이 항상 유지된다고 가정한 단순 계산(단일 경로)입니다 - 이 성장률은 평균이 아니라 "가장 전형적인(중앙값) 경로" 기준입니다. Monte Carlo는 종목별 변동성·상관관계를 반영하고 연 1회 리밸런싱을 적용해 실제로 가능한 미래 경로들을 시뮬레이션한 확률 분포이므로, 두 결과는 같은 조건을 두 방식으로 검증한 것이 아니라 서로 다른 가정에 기반한 계산입니다.</p>
    <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
      <p class="font-semibold text-slate-700 dark:text-slate-200">공식 모델: Monthly Precision Monte Carlo</p>
      <p class="mt-1">월 단위 수익률을 적용하고 매년 리밸런싱하는 방식으로 미래자산의 가능한 범위를 시뮬레이션합니다.</p>
    </div>
  `);
});

document.getElementById('mcOwnerScopeSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('.mc-owner-scope-btn');
  if (!btn) return;
  mcOwnerScope = btn.dataset.scope === 'household' ? null : btn.dataset.scope;
  syncMcOwnerScopeButtonsUI();
  // [기존 결과 오해 방지] 이전 관점(예: 가구 전체)으로 실행한 결과가 새 관점 선택 후에도 화면에 남아있으면
  // "이 결과가 방금 고른 관점 기준"이라고 오해할 수 있다 - 관점을 바꾸면 이전 결과를 숨기고 다시
  // [Monte Carlo 실행]을 눌러야 하게 한다(계산을 자동 재실행하지 않음 - 기존 "실행 버튼을 직접 눌러야
  // 시작" 원칙 유지).
  mcUiEl('mcResultArea').classList.add('hidden');
  if (mcUiEl('mcEmptyState')) mcUiEl('mcEmptyState').classList.remove('hidden');
  mcUiEl('mcSafetyIssues').classList.add('hidden');
  showMonteCarloStatus('');
  mcUiEl('mcStatusText').classList.add('hidden');
});

// [Phase 6-C - Semantic Safety, 표시 전용] 해외자산 비중이 하나라도 있는지 - FX 안내 카드 표시 여부만
// 결정하는 순수 조회 함수다. 계산(js/15/16)에는 전혀 관여하지 않고, 계산에도 쓰이지 않는 값이다.
// [Phase 24-B - Owner MC] ownerFilter를 주면 그 owner만 검사한다 - "신랑만" MC를 볼 때 와이프의 해외
// 비중 때문에 신랑에게는 해당하지 않는 환율 안내가 뜨지 않도록 한다. 생략 시 기존과 동일(두 owner 중 하나라도).
function hasHouseholdForeignAllocation(ownerFilter) {
  const owners = ownerFilter ? [ownerFilter] : REBALANCE_OWNERS;
  return owners.some((owner) => num(state.rebalance[owner].domestic['해외']) > 0);
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
/* -------------------------------------------------------------------------
 * [Phase 25 P1 - 운용보수 팝업] "미확인"과 "명시적 0%"를 화면에서 구분한다.
 *    - 데이터 모델은 그대로다: customFeeRates[key]가 undefined면 미확인, 숫자면 명시적 설정
 *      (isFeeExplicitlySet, js/05). Safety Layer의 미확인 경고 semantics도 그대로다.
 *    - 편집은 mcFeeRatesDraft에서만 이뤄지고 [확인]을 눌러야 state에 반영된다.
 *    - 상태를 색이 아니라 글자("미확인" / "0%" / "0.35%")로도 전달한다.
 * ---------------------------------------------------------------------- */
let mcFeeRatesDraft = null;

function buildFeeRateRows() {
  const weightsMap = computeHouseholdTargetInstrumentWeights();
  const rows = [];
  weightsMap.forEach((v) => {
    const key = resolveFeeUIKey(v);
    if (!key) return;
    rows.push({ key, label: resolveFeeUILabel(v) });
  });
  return rows;
}

// 메인 화면 버튼에 현재 상태를 요약해 둔다 - 팝업을 열지 않아도 미확인 종목이 있는지 알 수 있다.
function updateMcFeeSummary() {
  const el = mcUiEl('mcFeeSummary');
  if (!el) return;
  const rows = buildFeeRateRows();
  const feeRates = state.projection.customFeeRates || {};
  if (rows.length === 0) { el.textContent = '종목 없음'; return; }
  const unknown = rows.filter((r) => feeRates[r.key] === undefined).length;
  if (unknown === 0) el.textContent = '전부 확인됨';
  else if (unknown === rows.length) el.textContent = '전부 미확인';
  else el.textContent = `미확인 ${unknown}개`;
}

function renderFeeRatesEditor() {
  const listEl = mcUiEl('mcFeeRatesList');
  const rows = buildFeeRateRows();
  if (rows.length === 0) {
    listEl.innerHTML = `<p class="text-sm text-slate-400">목표 비중에 종목이 설정되지 않았습니다.</p>`;
    return;
  }
  listEl.innerHTML = rows.map((r) => {
    const v = mcFeeRatesDraft[r.key];
    const isUnknown = v === undefined;
    return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5" data-fee-row="${escapeHtml(r.key)}">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">${escapeHtml(r.label)}</span>
        <span data-fee-status class="shrink-0 text-sm font-semibold ${isUnknown ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}">${isUnknown ? '미확인' : escapeHtml(fmtNum(v, 2)) + '%'}</span>
      </div>
      <div class="flex items-center gap-1.5 mt-2">
        <button type="button" data-fee-unknown="${escapeHtml(r.key)}" class="touch-target min-h-[44px] px-3 rounded-lg border text-sm font-semibold ${isUnknown ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}">미확인</button>
        <input type="number" step="0.01" min="0" data-fee-key="${escapeHtml(r.key)}" value="${isUnknown ? '' : v}" placeholder="직접 입력"
          class="flex-1 min-w-0 min-h-[44px] text-sm text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 outline-none focus:border-brand-500">
        <span class="text-sm text-slate-400">%</span>
      </div>
    </div>`;
  }).join('');
}

function openMcFeeRatesModal() {
  // 얕은 복사면 충분하다 - 값이 전부 원시 숫자다(키가 없으면 "미확인").
  mcFeeRatesDraft = { ...(state.projection.customFeeRates || {}) };
  renderFeeRatesEditor();
  mcUiEl('mcFeeRatesModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}
function closeMcFeeRatesModal(viaBackButton) {
  mcFeeRatesDraft = null; // [취소 계약] state/localStorage 모두 그대로다.
  mcUiEl('mcFeeRatesModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}

// [Phase 27] 목표금액은 자릿수가 커서(예: 1000000000) 콤마 없이는 10억인지 100억인지 읽기 어렵다 -
// 이미 [적립금 설정]/[매수 검토 금액]에서 쓰고 있는 기존 유틸을 그대로 재사용한다(새 input 구조를
// 만들지 않는다). 소비 지점(num(mcGoalAmountInput.value))이 이미 콤마를 제거하므로 계산 semantics는
// 전혀 바뀌지 않는다.
attachThousandsInputFormatting(mcUiEl('mcGoalAmountInput'));

mcUiEl('mcFeeRatesToggleBtn').addEventListener('click', openMcFeeRatesModal);
mcUiEl('closeMcFeeRatesModalBtn').addEventListener('click', () => closeMcFeeRatesModal(false));
mcUiEl('cancelMcFeeRatesModalBtn').addEventListener('click', () => closeMcFeeRatesModal(false));
mcUiEl('mcFeeRatesModal').addEventListener('click', (e) => {
  if (e.target.id === 'mcFeeRatesModal') closeMcFeeRatesModal(false);
});
// 값을 입력하면 "명시적으로 설정한 것", 비우면 다시 "미확인"으로 돌아간다.
mcUiEl('mcFeeRatesModal').addEventListener('input', (e) => {
  const input = e.target.closest('input[data-fee-key]');
  if (!input || !mcFeeRatesDraft) return;
  const key = input.dataset.feeKey;
  if (input.value === '') delete mcFeeRatesDraft[key];
  else mcFeeRatesDraft[key] = num(input.value);
  syncFeeRowStatus(key);
});
mcUiEl('mcFeeRatesModal').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fee-unknown]');
  if (!btn || !mcFeeRatesDraft) return;
  const key = btn.dataset.feeUnknown;
  delete mcFeeRatesDraft[key];
  const input = mcUiEl('mcFeeRatesModal').querySelector(`input[data-fee-key="${CSS.escape(key)}"]`);
  if (input) input.value = '';
  syncFeeRowStatus(key);
});
// 한 행의 상태 글자/버튼 강조만 갱신한다 - 목록 전체를 다시 그리면 타이핑 중 포커스가 끊긴다.
function syncFeeRowStatus(key) {
  const row = mcUiEl('mcFeeRatesModal').querySelector(`[data-fee-row="${CSS.escape(key)}"]`);
  if (!row) return;
  const v = mcFeeRatesDraft[key];
  const isUnknown = v === undefined;
  const status = row.querySelector('[data-fee-status]');
  status.textContent = isUnknown ? '미확인' : fmtNum(v, 2) + '%';
  status.classList.toggle('text-amber-600', isUnknown);
  status.classList.toggle('dark:text-amber-400', isUnknown);
  status.classList.toggle('text-slate-500', !isUnknown);
  status.classList.toggle('dark:text-slate-400', !isUnknown);
  const unknownBtn = row.querySelector('[data-fee-unknown]');
  ['border-amber-400', 'bg-amber-50', 'dark:bg-amber-950/40', 'text-amber-700', 'dark:text-amber-300'].forEach((c) => unknownBtn.classList.toggle(c, isUnknown));
  ['border-slate-200', 'dark:border-slate-700', 'text-slate-500', 'dark:text-slate-400'].forEach((c) => unknownBtn.classList.toggle(c, !isUnknown));
}
mcUiEl('saveMcFeeRatesModalBtn').addEventListener('click', () => {
  if (!mcFeeRatesDraft) return;
  // [validation] 음수/100% 이상은 Safety Layer가 BLOCK으로 잡는 값이다 - 저장 단계에서 먼저 막아
  // 사용자가 실행 후에야 알게 되는 일이 없도록 한다(계산 정책 자체는 그대로).
  const bad = Object.keys(mcFeeRatesDraft).filter((k) => !(num(mcFeeRatesDraft[k]) >= 0 && num(mcFeeRatesDraft[k]) < 100));
  if (bad.length > 0) { alert('운용보수는 0% 이상 100% 미만이어야 합니다.'); return; }
  state.projection.customFeeRates = mcFeeRatesDraft;
  mcFeeRatesDraft = null;
  persistProjection();
  closeMcFeeRatesModal(false);
  updateMcFeeSummary();
  showToast('운용보수 설정을 저장했습니다.', 'success');
});

function resetMonteCarloUiToReady() {
  mcUiEl('mcRunBtn').classList.remove('hidden');
  mcUiEl('mcRunBtn').disabled = false;
  mcUiEl('mcRunBtn').textContent = 'Monte Carlo 실행';
  mcUiEl('mcCancelBtn').classList.add('hidden');
  mcUiEl('mcProgressArea').classList.add('hidden');
  mcUiEl('mcResultArea').classList.add('hidden');
  // [FUTURE-P1 Phase 3-2] 결과가 없는 상태로 돌아왔으므로 "왜 실행 버튼을 눌러야 하는지" 안내를 다시 띄운다.
  if (mcUiEl('mcEmptyState')) mcUiEl('mcEmptyState').classList.remove('hidden');
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
  // [FUTURE-P1 Phase 3-2] 실행 중에는 진행률이 안내를 대신한다.
  if (mcUiEl('mcEmptyState')) mcUiEl('mcEmptyState').classList.add('hidden');
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

/* -------------------------------------------------------------------------
 * [FUTURE-P1 Phase 3-2] Monte Carlo 결과 표시 상태
 *    - 계좌 범위(scope)와 기간(milestone)은 순수 화면 상태다(localStorage에 저장하지 않는다 -
 *      mcOwnerScope와 동일한 패턴). 값을 다시 계산하지 않고, 엔진이 이미 만들어 둔
 *      accountScopes/milestones 중 "어느 것을 보여줄지"만 고른다.
 *    - 기본값은 general + 마지막 milestone(=기존 화면과 완전히 같은 숫자)이다. 절세계좌가 없는
 *      사용자는 accountScopes 자체가 없어 범위 선택 UI가 뜨지 않고 기존과 동일하게 동작한다.
 * ---------------------------------------------------------------------- */
const MC_SCOPE_META = {
  general: { label: '일반계좌', desc: '일반(과세) 계좌만. 해마다 한 번 목표 비중대로 다시 맞춘다고 가정합니다.' },
  taxAdvantaged: { label: '절세계좌', desc: 'ISA·IRP·연금저축. 지금 들고 있는 그대로 두고 사고팔지 않는다고 가정합니다.' },
  combined: { label: '통합', desc: '같은 시장 흐름 안에서 두 계좌를 합친 결과입니다. 각 계좌의 중앙값을 그냥 더한 값과는 다를 수 있습니다.' }
};
let mcSelectedScope = 'general';
let mcSelectedMilestoneIdx = null; // null = 가장 긴 기간(기존 동작)
let mcRangeBarsOpen = false;
// 마지막으로 렌더한 결과 - 범위/기간 버튼을 눌렀을 때 재계산 없이 다시 그리기 위해 보관한다.
let mcLastRender = null;

// [초보자용 표현] 막대 라벨은 표(mcMilestoneTableBody)와 **같은 어휘**를 쓴다 - 예전엔 표가
// "낮은 편/약간 낮음/…", 막대가 "낮음/약간낮음/…"으로 서로 달라 같은 값이 다른 지표처럼 보였다.
// [FUTURE-P1 Phase 3-2] P10~P90을 title 속성에만 두지 않는다 - title은 터치 기기에서 뜨지 않아
// 모바일 사용자에게는 없는 정보와 같았다. 쉬운 말과 원래 이름을 함께 화면에 적는다.
function renderBarsInto(elId, point, colorSet) {
  const maxV = point.p90 || 1;
  const bars = [
    { label: '낮은 편', code: 'P10', value: point.p10, color: colorSet.p10 },
    { label: '약간 낮음', code: 'P25', value: point.p25, color: colorSet.p25 },
    { label: '중간 수준', code: 'P50', value: point.p50, color: colorSet.p50 },
    { label: '약간 높음', code: 'P75', value: point.p75, color: colorSet.p75 },
    { label: '높은 편', code: 'P90', value: point.p90, color: colorSet.p90 }
  ];
  mcUiEl(elId).innerHTML = bars.map((b) => `
    <div class="flex items-center gap-2 text-sm">
      <span class="w-20 shrink-0 text-slate-400 leading-tight">${b.label}<br><span class="text-slate-500 dark:text-slate-500">${b.code}</span></span>
      <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div class="h-full rounded-full ${b.color}" style="width:${Math.max(2, (b.value / maxV) * 100)}%"></div>
      </div>
      <span class="w-16 shrink-0 text-right text-slate-500 dark:text-slate-400">${fmtKRWShort(b.value)}</span>
    </div>`).join('');
}

const MC_SEG_BTN_IDLE = ['border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400'];
const MC_SEG_BTN_ACTIVE = ['border-brand-600', 'dark:border-brand-400', 'bg-brand-50', 'dark:bg-brand-950', 'text-brand-700', 'dark:text-brand-200'];
function paintSegmentedButton(btn, active) {
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.classList.remove(...MC_SEG_BTN_IDLE, ...MC_SEG_BTN_ACTIVE);
  btn.classList.add(...(active ? MC_SEG_BTN_ACTIVE : MC_SEG_BTN_IDLE));
}

// 이 결과에서 실제로 고를 수 있는 milestone 배열(선택된 계좌 범위 기준)을 돌려준다.
// accountScopes가 없으면(절세계좌 없는 사용자) 기존 milestones를 그대로 쓴다 - 숫자가 전혀 달라지지 않는다.
function mcScopedMilestones(withReal, scope) {
  const scopes = withReal.accountScopes;
  if (!scopes) return withReal.milestones;
  return scopes[scope] || withReal.milestones;
}
function mcHasAccountScopes(withReal) {
  const s = withReal && withReal.accountScopes;
  return !!(s && s.general && s.taxAdvantaged && s.combined);
}

/* [FUTURE-P1 Phase 3-2] 계좌 범위 선택 - 절세계좌 자산/납입이 실제로 있을 때만 나타난다.
 * 예전(Phase 2-C)엔 세 범위의 중앙값을 한꺼번에 나열했는데, 바로 아래 P50 카드가 같은 일반계좌
 * 값을 다시 보여줘 같은 숫자가 400px 안에서 두 번 나왔다 - 이제 여기서는 "무엇을 볼지"만 고르고
 * 금액은 아래 결과 영역 한 곳에서만 보여준다. */
function renderMonteCarloScopeSelector(withReal) {
  const el = mcUiEl('mcAccountScopeArea');
  if (!mcHasAccountScopes(withReal)) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.querySelectorAll('.mc-scope-btn').forEach((btn) => paintSegmentedButton(btn, btn.dataset.scope === mcSelectedScope));
  mcUiEl('mcScopeDesc').textContent = MC_SCOPE_META[mcSelectedScope].desc;
}

// 기간 선택 - milestone 배열(5/10/15/20년)에서 그대로 만든다. 새 기간을 만들지 않는다.
function renderMonteCarloMilestoneSelector(milestones) {
  const el = mcUiEl('mcMilestoneSegmented');
  const activeIdx = mcSelectedMilestoneIdx === null ? milestones.length - 1 : mcSelectedMilestoneIdx;
  el.innerHTML = milestones.map((m, i) => `
    <button type="button" data-milestone-idx="${i}" aria-pressed="${i === activeIdx ? 'true' : 'false'}"
      class="mc-milestone-btn flex items-center justify-center min-h-[44px] px-1 py-2 rounded-xl border-2 text-sm font-semibold transition-colors">${m.year}년</button>`).join('');
  el.querySelectorAll('.mc-milestone-btn').forEach((btn) => paintSegmentedButton(btn, Number(btn.dataset.milestoneIdx) === activeIdx));
}

/* 선택된 계좌 범위/기간에 해당하는 결과를 그린다. 값은 전부 엔진(js/15)이 만들고 js/20이 실질로
 * 환산해 둔 것을 읽기만 한다 - 이 함수 안에 어떤 산술 계산도 새로 만들지 않는다. */
function renderMonteCarloScopedResult() {
  if (!mcLastRender) return;
  const { withReal, goalMeta, inflationRatePct } = mcLastRender;
  const milestones = mcScopedMilestones(withReal, mcSelectedScope);
  const idx = mcSelectedMilestoneIdx === null ? milestones.length - 1 : Math.min(mcSelectedMilestoneIdx, milestones.length - 1);
  const sel = milestones[idx];
  const last = milestones[milestones.length - 1];
  const scopeLabel = mcHasAccountScopes(withReal) ? MC_SCOPE_META[mcSelectedScope].label : null;

  renderMonteCarloScopeSelector(withReal);
  renderMonteCarloMilestoneSelector(milestones);

  mcUiEl('mcP50ScopeNote').textContent = scopeLabel ? `${scopeLabel} · ${sel.year}년 후` : `${sel.year}년 후`;
  mcUiEl('mcP50Text').textContent = fmtKRWShort(sel.p50);
  mcUiEl('mcP50RealLabel').textContent = `현재가치 기준(물가상승률 ${fmtNum(inflationRatePct, 1)}% 가정)`;
  mcUiEl('mcP50RealText').textContent = fmtKRWShort(sel.real.p50);

  mcUiEl('mcMilestoneTableBody').innerHTML = milestones.map((m) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${m.year}년후</td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p10)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p10)}</span></td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p25)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p25)}</span></td>
      <td class="px-0.5 py-2 text-right font-bold whitespace-nowrap">${fmtKRWShort(m.p50)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p50)}</span></td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p75)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p75)}</span></td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p90)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p90)}</span></td>
    </tr>`).join('');

  // [범위 시각화 - 단순 막대] 선택한 기간 하나만 그린다. 새 chart library를 추가하지 않는다.
  mcUiEl('mcRangeBarsNominalLabel').textContent = `명목가치 범위(${sel.year}년 후 기준)`;
  mcUiEl('mcRangeBarsRealLabel').textContent = `현재가치 기준 범위(${sel.year}년 후 기준)`;
  renderBarsInto('mcRangeBarsArea', sel, { p10: 'bg-red-400', p25: 'bg-amber-400', p50: 'bg-brand-500', p75: 'bg-emerald-400', p90: 'bg-emerald-600' });
  renderBarsInto('mcRangeBarsRealArea', sel.real, { p10: 'bg-red-200', p25: 'bg-amber-200', p50: 'bg-brand-300', p75: 'bg-emerald-200', p90: 'bg-emerald-300' });
  if (typeof setAccordionOpen === 'function') {
    setAccordionOpen(mcUiEl('mcRangeBarsBody'), mcUiEl('mcRangeBarsChevron'), mcRangeBarsOpen);
  }

  /* 목표 도달 가능성 - 계좌 범위는 따라가되 기간은 목표금액을 만들 때 쓴 기간(goalMeta.targetYears)에
   * 고정한다. "현재 구매력 기준" 목표는 실행 시점에 그 기간으로 명목 환산해 엔진에 넘긴 값이라,
   * 다른 기간의 확률에 같은 목표금액을 갖다 붙이면 의미가 달라지기 때문이다(새 확률을 만들지 않는다). */
  const goalArea = mcUiEl('mcGoalArea');
  if (goalMeta && last.goalProbability && last.goalProbability[goalMeta.nominalGoalAmount] !== undefined) {
    const probDecimal = last.goalProbability[goalMeta.nominalGoalAmount];
    // [Phase 4 - Goal Probability 표시 정책] js/22 참고 - 꼬리 확률(<10% 또는 >90%)만 정밀도를
    // 낮추고("약 N%"), 중심부는 기존 소수점 1자리 표시를 그대로 유지한다.
    const display = (typeof formatGoalProbabilityDisplay === 'function') ? formatGoalProbabilityDisplay(probDecimal) : { text: `${fmtNum(probDecimal * 100, 1)}%`, isTail: false };
    const tailCaptionHtml = display.isTail ? `<p class="text-sm text-amber-600 dark:text-amber-400 mt-1">${GOAL_PROBABILITY_TAIL_CAPTION}</p>` : '';
    const scopePrefix = scopeLabel ? `${scopeLabel} 기준 · ` : '';
    // [초보자용 짧은 안내] 확률 숫자 바로 밑에 한 줄로 "실제 미래 확률이 아니라 지금 가정 기준
    // 시뮬레이션 결과"임을 덧붙인다(자세한 설명은 아래 상세 영역의 항상-on INFO 카드에 그대로 있다).
    const goalShortCaption = '<p class="text-sm text-slate-400 mt-1 leading-relaxed break-keep">현재 설정을 기준으로 한 시뮬레이션 결과예요. 목표금액 이상으로 끝난 경로가 전체 중 몇 %였는지를 뜻하며, 실제로 그 확률로 목표를 달성한다는 뜻은 아닙니다.</p>';
    const goalAmountLine = goalMeta.mode === 'real'
      ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200">${fmtKRWShort(goalMeta.rawAmount)} (현재 구매력 기준)</p>
         <p class="text-sm text-slate-400 mt-1">${goalMeta.targetYears}년 후 명목 환산 목표 ${fmtKRWShort(goalMeta.nominalGoalAmount)}</p>`
      : `<p class="text-sm font-bold text-slate-700 dark:text-slate-200">${fmtKRWShort(goalMeta.rawAmount)} (미래 명목금액)</p>`;
    goalArea.innerHTML = `
      <p class="text-sm text-slate-400">목표금액</p>
      ${goalAmountLine}
      <p class="text-sm text-slate-400 mt-1.5">${scopePrefix}${goalMeta.targetYears}년 후 목표에 도달할 가능성</p>
      <p class="text-base font-bold text-slate-700 dark:text-slate-200">${display.text}</p>
      ${goalShortCaption}
      ${tailCaptionHtml}`;
  } else {
    goalArea.innerHTML = `<p class="text-sm text-slate-400">목표금액이 설정되지 않았습니다.</p>`;
  }
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
  if (mcUiEl('mcEmptyState')) mcUiEl('mcEmptyState').classList.add('hidden');
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
      (typeof explainFxRiskIfForeign === 'function') ? explainFxRiskIfForeign(hasHouseholdForeignAllocation(contributionMeta && contributionMeta.ownerScope)) : null,
      (typeof explainAccumulationScopeAlwaysOn === 'function') ? explainAccumulationScopeAlwaysOn() : null,
    ].filter(Boolean);
    // [Phase 17 P1-4] "결과 해석에 직접 영향(critical)"만 결과 바로 아래 펼쳐서 보여주고, 나머지
    // (참고성 WARNING + 항상-on INFO 6종)는 결과 아래 "상세보기"로 옮긴다(js/22
    // renderMonteCarloSafetyTiers). 판정 결과(issue 배열) 자체는 한 글자도 바뀌지 않았다.
    if (typeof renderMonteCarloSafetyTiers === 'function') {
      renderMonteCarloSafetyTiers(mcUiEl('mcSafetyCritical'), mcUiEl('mcSafetyDetailToggleBtn'), mcUiEl('mcSafetyDetail'), nonBlockIssues.concat(semanticIssues));
    } else {
      renderSafetyIssueList(mcUiEl('mcSafetyIssues'), nonBlockIssues.concat(semanticIssues));
    }
  }

  // [js/20 재사용 - 계산 반복 구현 금지] 명목 결과(result)는 그대로 두고, 실질가치는 이 변환 레이어의
  // 결과(withReal)에서만 읽는다 - result 자체를 mutate하지 않으므로 엔진 회귀에 영향 없음.
  // [Phase 3-5 B2 수정] 저장된 inflationRate를 그대로 쓴다(소비 지점에서 몰래 바닥 처리하지 않는다) -
  // 디플레이션(-1% 등)도 수학적으로 유효한 시나리오이며, BLOCK은 assessInflation이 별도로 건다.
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
    // [Step 2 - 적립기간 연결] owner 중 누구라도 실제로 적립기간을 설정했으면, "총 납입원금" 표시도
    // 그 owner의 적립기간만큼만 계산해야 정확하다 - 그렇지 않으면 실제로는 조기 종료된 적립인데
    // 화면은 20년 내내 적립한 것처럼 과대 표시된다.
    const hasExplicitYears = (streams || []).some((s) => s.years !== null && s.years !== undefined);
    const totalPrincipal = hasExplicitYears
      ? computeTotalContributionPrincipalMultiStream(streams, growthRate, years)
      : computeTotalContributionPrincipal(initialMonthly, growthRate, years);
    // [P5 - Phase 9 감사 후속] Monte Carlo는 owner별 종목 배분이 아니라 가구 전체 목표비중을 기준으로
    // 신규 적립금을 배분한다 - 두 결과를 비교하는 초보자가 "왜 다르지?"라고 오해하지 않도록 짧게 고지한다.
    const scopeLabel = contributionMeta.ownerScope ? `${contributionMeta.ownerScope}님의` : '가구 전체';
    const allocationNote = `참고: Monte Carlo는 ${scopeLabel} 목표비중을 기준으로 계산합니다.`;
    mcUiEl('mcContributionScheduleArea').innerHTML = (growthRatePct > 0
      ? `초기 월 적립금 ${fmtKRWShort(initialMonthly)} · 연간 증가율 ${fmtNum(growthRatePct, 1)}% · ${years}년차 월 적립금 약 ${fmtKRWShort(finalYearMonthly)}<br>총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`
      : `월 적립금 ${fmtKRWShort(initialMonthly)}(매월 동일) · 총 납입원금(${years}년) ${fmtKRWShort(totalPrincipal)}`)
      + `<br>${escapeHtml(allocationNote)}`;
  }

  // [FUTURE-P1 Phase 3-2] 새 결과가 오면 선택 상태를 기본값(일반계좌 · 가장 긴 기간)으로 되돌린다 -
  // 기존 화면과 완전히 같은 숫자에서 시작하고, 이전 실행에서 고른 범위가 남아 오해를 만들지 않게 한다.
  mcSelectedScope = 'general';
  mcSelectedMilestoneIdx = null;
  mcRangeBarsOpen = false;
  mcLastRender = { withReal, goalMeta, inflationRatePct };
  renderMonteCarloScopedResult();
}

/* 계좌 범위 / 기간 / 범위 막대 토글 - 전부 이미 계산된 결과를 다시 그릴 뿐이라 Monte Carlo를 다시
 * 실행하지 않는다(Worker를 새로 띄우지 않는다). 결과가 없을 때(mcLastRender null)는 아무 일도 없다. */
document.addEventListener('click', (e) => {
  const scopeBtn = e.target.closest('#mcScopeSegmented .mc-scope-btn');
  if (scopeBtn) {
    mcSelectedScope = scopeBtn.dataset.scope;
    renderMonteCarloScopedResult();
    return;
  }
  const msBtn = e.target.closest('#mcMilestoneSegmented .mc-milestone-btn');
  if (msBtn) {
    mcSelectedMilestoneIdx = Number(msBtn.dataset.milestoneIdx);
    renderMonteCarloScopedResult();
    return;
  }
  if (e.target.closest('#mcRangeBarsToggleBtn')) {
    mcRangeBarsOpen = !mcRangeBarsOpen;
    if (typeof setAccordionOpen === 'function') {
      setAccordionOpen(mcUiEl('mcRangeBarsBody'), mcUiEl('mcRangeBarsChevron'), mcRangeBarsOpen);
    }
  }
});

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
  if (mcUiEl('mcEmptyState')) mcUiEl('mcEmptyState').classList.remove('hidden');
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
  // [Phase 24-B STEP 6 - Owner MC] mcOwnerScope가 설정돼 있으면(신랑/와이프 단독 선택) 그 owner의
  // 원금/월적립금만 쓴다 - getOwnerMonthlyContributionInputs는 Deterministic이 이미 쓰는 것과 동일한
  // 함수(하위호환 폴백 포함)를 그대로 재사용한다. mcOwnerScope가 null(가구 전체)이면 기존 함수를
  // 그대로 호출해 완전히 동일한 값을 낸다(bit-identical).
  const initialPrincipal = computeHouseholdMonteCarloPV(mcOwnerScope);
  const monthlyContribution = mcOwnerScope
    ? num(getOwnerMonthlyContributionInputs(mcOwnerScope).monthlyContribution)
    : getHouseholdMonthlyContributionTotal();
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
  // [Phase 24-B STEP 6 - Owner MC] mcOwnerScope가 설정돼 있으면 그 owner 스트림 하나만 만든다(다른
  // owner의 적립기간/월적립금이 이 실행에 전혀 영향을 주지 않도록) - 가구 전체(null)는 기존과 완전히
  // 동일하게 두 owner 모두의 스트림 배열을 만든다.
  const ownerContributionStreams = (mcOwnerScope ? [mcOwnerScope] : REBALANCE_OWNERS).map((owner) => {
    const inputs = getOwnerMonthlyContributionInputs(owner);
    return { monthly: inputs.monthlyContribution, years: inputs.years };
  });
  // [기존 사용자 보호] 어떤 owner도 적립기간을 명시적으로 설정하지 않았으면(전부 null=제한없음) 아예
  // contributionStreams 필드를 넘기지 않는다 - 그래야 엔진이 예전과 완전히 같은 monthlyContribution
  // 단일 스칼라 경로(bit-identical 보장 경로)를 그대로 탄다. 실제로 어떤 owner라도 유효한 적립기간을
  // 설정했을 때만(따라서 결과가 어차피 달라져야 할 때만) 새 경로를 쓴다.
  const hasAnyExplicitContributionYears = ownerContributionStreams.some((s) => s.years !== null && s.years !== undefined);
  const contributionStreams = hasAnyExplicitContributionYears ? ownerContributionStreams : undefined;

  const contributionMeta = { initialMonthly: monthlyContribution, growthRatePct: contributionGrowthRatePct, years, streams: ownerContributionStreams, ownerScope: mcOwnerScope };

  // [Phase 3-4 - 표시 전용] 포트폴리오 가중평균 운용보수를 보여주기 위해, js/18(Worker orchestration -
  // 이번 Phase에서 변경 금지)을 건드리지 않고 어댑터를 한 번 더(캐시된 데이터라 저렴함) 직접 호출한다.
  // 이 결과는 화면 표시에만 쓰고, 실제 시뮬레이션 입력은 여전히 startMonteCarloRun 내부에서 독립적으로
  // 다시 만들어진다(계산 경로 자체는 그대로 유지).
  // [FUTURE-P1] 아래 startMonteCarloRun이 내부에서 어댑터를 다시 부르므로, 이 표시용 호출도 반드시
  // 같은 config로 불러야 한다 - 그러지 않으면 여기서 본 preflight safety(절세계좌 종목의 운용보수/
  // 데이터 부족 issue 포함)와 실제 실행 경로가 서로 다른 것을 보게 된다.
  const feeDisplayResult = await buildMonteCarloInputFromState({ presetKey, ownerFilter: mcOwnerScope, includeTaxAdvantaged: true, years });
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
    presetKey, mode: 'official', ownerFilter: mcOwnerScope, // [Phase 24-B STEP 6] js/18 -> js/16 어댑터로 그대로 전달만 됨
    // [FUTURE-P1] 절세계좌 자산/납입계획이 하나도 없는 사용자는 어댑터가 taxScope를 만들지 않으므로
    // 이 값이 true여도 엔진 입력·결과가 기존과 완전히 동일하다(General-only 경로 그대로).
    includeTaxAdvantaged: true,
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
