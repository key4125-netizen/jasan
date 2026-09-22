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
  // [§37] 어댑터가 장기 CMA 가정을 정하지 못한 경우(자산군 미연결 · 상관 출처 없음) - 어떤 자산인지는 상태 문구로 함께 보여준다.
  DATA_ERROR: '장기 가정(CMA)을 정할 수 없는 자산이 있어 계산하지 못했습니다.',
  CORRELATION_ERROR: '자산 간 상관관계 행렬을 계산하지 못했습니다.',
  SIMULATION_ERROR: 'Monte Carlo 계산 중 오류가 발생했습니다.',
  WORKER_ERROR: '백그라운드 계산 프로세스 실행 중 오류가 발생했습니다.',
  // [조건부승인 항목 11] 무한 대기 대신 명확한 사유로 종료됨을 알린다.
  WORKER_TIMEOUT: '계산이 예상보다 오래 걸려 중단되었습니다. 시뮬레이션 횟수를 줄이거나 다시 시도해주세요.'
};

/* [UX-1 · PM 최종 승인 2026-09-22] 계산을 시작하지 못한 사유를 사용자 말로 옮긴다.
 *
 * 문제였던 것: 검증기(js/16 validateMonteCarloInput)와 어댑터는 사유를 정확히 만들어 전달하는데,
 * 화면은 code만 보고 message를 버려서 "입력값을 확인해주세요."만 남았다. 사용자는 무엇을
 * 고쳐야 하는지 알 수 없었다.
 *
 * 원칙 세 가지.
 *   ① 새 검증을 만들지 않는다 - 이미 만들어진 message만 번역한다.
 *   ② 개발 용어를 그대로 보여주지 않는다("instruments가 비어있습니다" 같은 문장).
 *   ③ 짝이 없는 사유는 **추측해서 지어내지 않는다** - null을 돌려주고 기본 안내만 쓴다.
 * 어댑터가 만든 사유(js/16 186~197행)는 이미 한국어 사용자 문구라 그대로 통과시킨다. */
const MC_USER_REASON_RULES = Object.freeze([
  { match: /instruments가 비어있습니다/, text: '미래 예측에 넣을 자산이 없습니다. 주식·ETF 자산을 등록하고 수익률 관리에서 기준을 정한 뒤 다시 실행해 주세요.' },
  { match: /weight 합계가 1이 아닙니다/, text: '자산 비중 합계가 100%가 되지 않아 계산하지 못했습니다. 보유 자산의 평가금액을 확인해 주세요.' },
  { match: /중복된 asset key/, text: '같은 자산이 두 번 잡혀 계산하지 못했습니다. 자산 목록에서 중복 등록이 있는지 확인해 주세요.' },
  { match: /유효한 (muAnnual|sigmaAnnual)이|sigmaAnnual이 음수/, text: '일부 자산의 장기 수익률·변동성 가정을 정하지 못했습니다. 수익률 관리에서 그 자산의 기준을 지정해 주세요.' },
  { match: /feeRateAnnual이 유효하지 않습니다/, text: '운용보수 값이 올바르지 않습니다(0% 이상 100% 미만). 운용보수 설정을 확인해 주세요.' },
  { match: /correlationMatrix|assetOrder가/, text: '자산 간 상관관계를 준비하지 못해 계산하지 못했습니다. 잠시 후 다시 실행해 주세요.' },
  { match: /최대 60년까지의 투자기간/, text: '투자 기간은 60년까지만 계산할 수 있습니다. 기간을 줄여 주세요.' },
  { match: /years 값이 유효하지 않습니다/, text: '투자 기간이 올바르지 않습니다. 1년 이상으로 입력해 주세요.' },
  { match: /monthlyContribution이 유효하지 않습니다|contributionStreams\[\d+\]\.monthly/, text: '매달 투자 금액이 올바르지 않습니다. 0원 이상의 숫자로 입력해 주세요.' },
  { match: /initialPrincipal이 유효하지 않습니다/, text: '현재 자산 금액이 올바르지 않습니다. 자산 등록 상태를 확인해 주세요.' },
  { match: /contributionGrowthRate가 유효하지 않습니다/, text: '투자금 증가율이 올바르지 않습니다. 적립 설정을 확인해 주세요.' },
  { match: /contributionStreams\[\d+\]\.years/, text: '적립 기간 설정이 올바르지 않습니다. 적립 설정을 확인해 주세요.' },
  { match: /taxScope\./, text: '절세계좌 자산·납입 설정을 준비하지 못해 계산하지 못했습니다. 절세계좌 적립 설정을 확인해 주세요.' }
]);
/* 어댑터가 만든 한국어 사유인지 - 개발 식별자가 섞이지 않은 문장만 그대로 보여준다. */
function mcLooksUserFacing(s) {
  return /[가-힣]/.test(s) && !/instruments|correlationMatrix|assetOrder|muAnnual|sigmaAnnual|feeRateAnnual|monthlyContribution|initialPrincipal|contributionStreams|contributionGrowthRate|taxScope|weight 합계|asset key|years 값/.test(s);
}
function monteCarloUserReason(message) {
  const raw = String(message == null ? '' : message).trim();
  if (!raw) return null;
  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean);
  const out = [];
  parts.forEach((p) => {
    const rule = MC_USER_REASON_RULES.find((r) => r.match.test(p));
    if (rule) { if (!out.includes(rule.text)) out.push(rule.text); return; }
    if (mcLooksUserFacing(p) && !out.includes(p)) out.push(p);
    // 짝이 없고 사용자 문장도 아니면 버린다 - 개발 용어를 화면에 내보내지 않는다.
  });
  return out.length ? out.join(' ') : null;
}

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
// [v248-1 REQ-10] "성장률별 참고 결과" 카드가 삭제되어, 같은 단일 경로 계산값이 남아 있는 "지금 계획대로면"으로
// 가리키는 이름만 바꿨다(나머지 설명 문장은 그대로).
// [v250] 결과 아래 "주의사항 및 계산 방법 자세히 보기" 토글을 없애고, 같은 내용(결과 해석에 직접 영향을 주지 않는 주의사항 +
// 항상-on 계산 방법 설명)을 이 ⓘ 팝업 끝에 붙인다. 마지막 실행의 카드 HTML은 화면에 붙지 않은 보관용 요소에 그려 둔다
// (js/22 renderMonteCarloSafetyTiers - 판정 · 분류 · 문구 무변경). 실행 전에는 기존 설명만 보인다.
const mcSafetyDetailStore = document.createElement('div');
// [v255 · 펼침 상태 통일] 결과 화면(critical 묶음)과 장기 가정 출처는 탭을 옮기면 접는다(resetAllAccordionsOnTabSwitch, js/03).
// 결과를 다시 그리지 않으므로 상태와 이미 그려진 화면을 함께 접는다.
function collapseMonteCarloResultAccordions() {
  if (typeof mcSafetyGroupOpen !== 'undefined') {
    document.querySelectorAll('.safety-group-body[data-safety-group-body]').forEach((body) => {
      const key = body.dataset.safetyGroupBody;
      mcSafetyGroupOpen[key] = false;
      const chevron = document.querySelector(`.safety-group-chevron[data-safety-group-chevron="${CSS.escape(key)}"]`);
      if (chevron && typeof setAccordionOpen === 'function') setAccordionOpen(body, chevron, false);
    });
  }
}

document.getElementById('mcIntroInfoBtn').addEventListener('click', () => {
  // [v255 · 펼침 상태 통일] 이 팝업의 주의사항 묶음은 매번 접힌 상태(보관용 HTML)로 다시 그려진다 - 지난번에 팝업 안에서
  // 펼쳤던 기록이 남아 있으면 다음 클릭이 "닫기"로 처리돼 한 번 눌러도 안 열렸다. 이 묶음들의 펼침 기록만 지운다.
  if (typeof mcSafetyGroupOpen !== 'undefined') {
    mcSafetyDetailStore.querySelectorAll('[data-safety-group-body]').forEach((el) => { delete mcSafetyGroupOpen[el.dataset.safetyGroupBody]; });
  }
  openMcInfoModal('Monte Carlo란?', `
    <p>"지금 계획대로면"의 참고값은 기준 연간 성장률이 매년 그대로 반복되고 목표 투자비중이 항상 유지된다고 가정한 단순 계산(단일 경로)입니다 - 이 성장률은 평균이 아니라 "가장 전형적인(중앙값) 경로" 기준입니다. Monte Carlo는 자산군별 장기 변동성·상관관계(공식 기관 CMA)를 반영하고 연 1회 리밸런싱을 적용해 실제로 가능한 미래 경로들을 시뮬레이션한 확률 분포이므로, 두 결과는 같은 조건을 두 방식으로 검증한 것이 아니라 서로 다른 가정에 기반한 계산입니다.</p>
    <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
      <p class="font-semibold text-slate-700 dark:text-slate-200">공식 모델: Monthly Precision Monte Carlo</p>
      <p class="mt-1">월 단위 수익률을 적용하고 매년 리밸런싱하는 방식으로 미래자산의 가능한 범위를 시뮬레이션합니다.</p>
    </div>
    ${mcCmaSourceSectionHtml()}
    ${mcSafetyDetailStore.innerHTML ? `<div class="space-y-1.5"><p class="font-semibold text-slate-700 dark:text-slate-200">주의사항 및 계산 방법</p>${mcSafetyDetailStore.innerHTML}</div>` : ''}
  `);
  // [v250] 옮겨 온 주의사항 카드의 아이콘 · 접기 상태를 팝업 안에서 다시 그린다(카드 HTML · 판정 결과는 그대로).
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

document.getElementById('mcOwnerScopeSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('.mc-owner-scope-btn');
  if (!btn) return;
  mcOwnerScope = btn.dataset.scope === 'household' ? null : btn.dataset.scope;
  syncMcOwnerScopeButtonsUI();
  // [통합 수정 · PMD-09 · F-06a] 결과가 있으면 지우지 않고 "다시 계산 필요"로 표시한다(자동 재실행은 하지 않는 원칙 그대로).
  // 실행 중이면 진행 표시를 건드리지 않는다 - 완료되면 결과가 바뀐 관점과 비교돼 같은 표시가 붙는다.
  if (isMonteCarloRunInProgress()) return;
  if (hasDisplayedMonteCarloResult()) { refreshMonteCarloResultValidity(); return; }
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

// 실제 Monte Carlo 계산에 들어가는 항목만 나열한다(존재하지 않는 종목에 fee를 미리 등록해봐야 쓸 데가
// 없다) - 일반계좌는 computeHouseholdTargetInstrumentWeights, 절세계좌는 buildTaxAdvantagedMonteCarloInputs로,
// 둘 다 어댑터(js/16)가 includeTaxAdvantaged:true 실행에서 쓰는 것과 동일한 함수다.
/* -------------------------------------------------------------------------
 * [Phase 25 P1 - 운용보수 팝업] "미확인"과 "명시적 0%"를 화면에서 구분한다.
 *    - 데이터 모델은 그대로다: customFeeRates[key]가 undefined면 미확인, 숫자면 명시적 설정
 *      (isFeeExplicitlySet, js/05). Safety Layer의 미확인 경고 semantics도 그대로다.
 *    - 편집은 mcFeeRatesDraft에서만 이뤄지고 [확인]을 눌러야 state에 반영된다.
 *    - 상태를 색이 아니라 글자("미확인" / "0%" / "0.35%")로도 전달한다.
 * ---------------------------------------------------------------------- */
let mcFeeRatesDraft = null;

// [MC 표시 정책 ①] 예전엔 일반계좌 목표비중만 나열해, 절세계좌에만 있는 종목(보유분·적립 배분·미배분
// 잔여분)은 계산에서는 운용보수가 적용되는데도 사용자가 값을 넣을 방법이 없어 "미확인" 경고가 영구히
// 남았다. 이제 어댑터가 실제로 쓰는 절세계좌 항목도 함께 나열한다. 키 규칙(resolveFeeUIKey)과 계산은
// 그대로이고, 같은 키가 여러 항목에서 나오면(같은 종목이 두 계좌에 있거나, '주식형자산'처럼 지역 구분
// 없는 카테고리 키) 입력칸을 하나로 합친다 - 한 키에 입력칸이 둘이면 서로 다른 값을 넣은 것처럼 보인다.
function buildFeeRateRows() {
  const rows = [];
  const byKey = new Map();
  const add = (v, account) => {
    const key = resolveFeeUIKey(v);
    if (!key) return;
    const label = resolveFeeUILabel(v);
    let row = byKey.get(key);
    if (!row) {
      row = { key, label, labels: [label], accounts: [] };
      byKey.set(key, row);
      rows.push(row);
    } else if (!row.labels.includes(label)) {
      row.labels.push(label);
      row.label = row.labels.join(' · ');
    }
    if (!row.accounts.includes(account)) row.accounts.push(account);
  };
  computeHouseholdTargetInstrumentWeights().forEach((v) => add(v, '일반계좌'));
  if (typeof buildTaxAdvantagedMonteCarloInputs === 'function') {
    const years = Math.max(...getMilestoneYearOffsets());
    buildTaxAdvantagedMonteCarloInputs(null, 'normal', years).forEach((v) => add(v, '절세계좌'));
  }
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
      <p data-fee-accounts class="text-sm text-slate-400 mt-0.5">${escapeHtml(r.accounts.join(' · '))}</p>
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
  refreshMonteCarloResultValidity(); // [PMD-09] 운용보수는 결과에 영향을 준다 - 결과가 있으면 "다시 계산 필요"로 표시
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
  mcSafetyDetailStore.innerHTML = '';
  if (mcUiEl('mcStaleNotice')) mcUiEl('mcStaleNotice').classList.add('hidden');
  mcCmaSummaryHtml = '';
  mcCmaDetailHtml = '';
}

/* -------------------------------------------------------------------------
 * [통합 수정 · F-06a · PMD-09] Monte Carlo 결과의 유효성 상태
 *    - 실행 중(Worker WAITING/RUNNING)에는 화면을 READY로 되돌리지 않는다. 예전엔 자산 저장 · 시세 갱신 · 탭 이동이
 *      updateProjection()을 거치며 진행 표시와 취소 버튼을 지웠고, 계산은 계속 돌다가 결과가 갑자기 나타났다.
 *    - 결과가 떠 있으면 지우지 않는다. 결과를 계산한 입력의 서명과 지금 입력의 서명을 비교해, 다르면 "다시 계산이
 *      필요합니다"를 결과 맨 위와 중앙값 제목에 표시한다(값은 그대로 두고 오인만 막는다). 입력을 되돌리면 표시도 사라진다.
 *    - 서명에 넣는 것 = 실제로 Monte Carlo 입력을 만드는 값: 자산(수량 · 매입가 · 계좌 · 소유자 · 자산군과 확정 여부 ·
 *      대표매칭 · 시세가 없는 자산의 직접 입력 평가액), 목표 비중, 수익률 사전, 운용보수, 월 적립금 · 배분 · 증가율, 절세계좌
 *      계획, 물가상승률, 실행 조건(시나리오 · 반복 횟수 · 소유자 관점 · 목표금액 · 목표 기준).
 *    - 넣지 않는 것 = 시장 시세와 환율. 시세는 계속 움직이므로 시세 갱신만으로는 결과를 무효로 보지 않는다(PM 결정).
 * ---------------------------------------------------------------------- */
function isMonteCarloRunInProgress() {
  return typeof mcState !== 'undefined' && mcActiveRequestId !== null
    && (mcState === MC_WORKER_STATE.RUNNING || mcState === MC_WORKER_STATE.WAITING);
}
function hasDisplayedMonteCarloResult() {
  return !!mcLastRender && !mcUiEl('mcResultArea').classList.contains('hidden');
}
function computeMonteCarloInputSignature() {
  const priceFollowsMarket = (a) => String(a.ticker ?? '').trim() !== '' && !NON_TRADABLE_CATEGORIES.includes(a.category);
  const assets = (state.assets || []).map((a) => [a.id, a.ticker, a.name, a.owner, a.accountType, a.category, a.categorySource,
    a.isDomestic, a.currency, a.quantity, a.buyPrice, a.buyRate, a.rateMatchOverride, priceFollowsMarket(a) ? null : a.currentPrice])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const rebalance = {};
  REBALANCE_OWNERS.forEach((owner) => {
    const r = (state.rebalance && state.rebalance[owner]) || {};
    rebalance[owner] = { domestic: r.domestic, targets: r.targets };
  });
  const p = state.projection || {};
  const goalMode = (document.querySelector('input[name="mcGoalMode"]:checked') || {}).value || 'nominal';
  // 객체 키 순서는 비교하지 않는다 - 저장 · 동기화 과정에서 같은 내용의 필드 순서만 바뀌어도 "다시 계산 필요"가 뜨지 않게 한다.
  const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    return JSON.stringify(value === undefined ? null : value);
  };
  return stableStringify({
    assets, rebalance,
    rates: p.customScenarioRates, fees: p.customFeeRates, instruments: p.instrumentReturnKeys || {},
    monthly: p.monthlyContribution, allocation: p.monthlyContributionAllocation, byOwner: p.monthlyContributionByOwner,
    growth: p.contributionGrowthRate, inflation: p.inflationRate, tax: p.taxAdvantagedPlan,
    // [§37 CMA-VER-02] 장기 CMA 세트가 바뀌면 이전 결과를 조용히 현재 결과로 보이지 않게 한다.
    cma: getActiveCmaSetVersion(),
    run: { preset: mcUiEl('mcPresetSelect').value, iterations: mcUiEl('mcIterationsSelect').value, owner: mcOwnerScope,
      goal: mcUiEl('mcGoalAmountInput').value, goalMode }
  });
}
function applyMonteCarloStaleNotice() {
  const notice = mcUiEl('mcStaleNotice');
  if (notice) notice.classList.toggle('hidden', !(mcLastRender && mcLastRender.stale));
}
function refreshMonteCarloResultValidity() {
  if (!hasDisplayedMonteCarloResult()) return;
  const stale = mcLastRender.signature !== computeMonteCarloInputSignature();
  if (stale === !!mcLastRender.stale) return;
  mcLastRender.stale = stale;
  renderMonteCarloScopedResult();
  showMonteCarloStatus(stale ? '설정이 바뀌어 다시 계산이 필요합니다.' : MC_UI_STATUS_LABEL.COMPLETED);
}
// updateProjection()(js/05)이 입력 변경 · 탭 이동 · 시세 갱신 뒤마다 부른다.
function refreshMonteCarloAfterInputChange() {
  if (isMonteCarloRunInProgress()) return;
  if (hasDisplayedMonteCarloResult()) { refreshMonteCarloResultValidity(); return; }
  resetMonteCarloUiToReady();
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
  mcSafetyDetailStore.innerHTML = '';
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
 *    - 결과가 올 때의 기본값: 절세계좌 결과(accountScopes)가 있으면 combined, 없으면 general +
 *      마지막 milestone이다([MC 표시 정책 ②], renderMonteCarloResult). 절세계좌가 없는 사용자는
 *      accountScopes 자체가 없어 범위 선택 UI가 뜨지 않고 기존과 동일하게 동작한다.
 * ---------------------------------------------------------------------- */
const MC_SCOPE_META = {
  general: { label: '일반계좌', desc: '일반(과세) 계좌만. 해마다 한 번 목표 비중대로 다시 맞춘다고 가정합니다.' },
  taxAdvantaged: { label: '절세계좌', desc: 'ISA·IRP·연금저축. 지금 들고 있는 그대로 두고 사고팔지 않는다고 가정합니다.' },
  combined: { label: '통합', desc: '같은 시장 흐름 안에서 두 계좌를 합친 결과입니다. 각 계좌의 중앙값을 그냥 더한 값과는 다를 수 있습니다.' }
};
let mcSelectedScope = 'general';
let mcSelectedMilestoneIdx = null; // null = 가장 긴 기간(기존 동작)
// 마지막으로 렌더한 결과 - 범위/기간 버튼을 눌렀을 때 재계산 없이 다시 그리기 위해 보관한다.
let mcLastRender = null;

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

  // [PMD-09] 결과를 계산한 뒤 입력이 바뀌었으면 제목에도 "이전 설정 기준"을 붙여 현재 결과로 읽히지 않게 한다.
  const stalePrefix = mcLastRender.stale ? '이전 설정 기준 · ' : '';
  mcUiEl('mcP50ScopeNote').textContent = stalePrefix + (scopeLabel ? `${scopeLabel} · ${sel.year}년 후` : `${sel.year}년 후`);
  mcUiEl('mcP50Text').textContent = fmtKRWShort(sel.p50);
  mcUiEl('mcP50RealLabel').textContent = `현재가치 기준(물가상승률 ${fmtNum(inflationRatePct, 1)}% 가정)`;
  mcUiEl('mcP50RealText').textContent = fmtKRWShort(sel.real.p50);
  // [MC 표시 정책 ③] P25 - P50과 같은 범위·같은 기간의 값을 그대로 읽는다(새 계산 없음).
  // [v250] 라벨 문구는 PM 지정 문장이며, 기간 숫자는 선택한 기간을 따른다(기본 20년).
  mcUiEl('mcP25Label').textContent = `시뮬레이션 결과 ${sel.year}년 기준 보수적으로 볼 때의 참고금액`;
  mcUiEl('mcP25Text').textContent = fmtKRWShort(sel.p25);
  mcUiEl('mcP25RealText').textContent = `현재가치 기준 ${fmtKRWShort(sel.real.p25)}`;

  // [MC 표시 정책 ④] P90 열은 화면에서 뺀다 - 값(m.p90/m.real.p90)은 결과 데이터에 그대로 남아 있다.
  mcUiEl('mcMilestoneTableBody').innerHTML = milestones.map((m) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td class="pl-1 pr-1.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">${m.year}년후</td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p10)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p10)}</span></td>
      <td class="px-0.5 py-2 text-right font-bold whitespace-nowrap">${fmtKRWShort(m.p25)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p25)}</span></td>
      <td class="px-0.5 py-2 text-right font-bold whitespace-nowrap">${fmtKRWShort(m.p50)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p50)}</span></td>
      <td class="px-0.5 py-2 text-right whitespace-nowrap">${fmtKRWShort(m.p75)}<br><span class="text-slate-400 font-normal">${fmtKRWShort(m.real.p75)}</span></td>
    </tr>`).join('');


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
    // [v250] 확률 아래 짧은 부연 설명은 PM 지시로 뺐다 - 같은 의미의 설명(목표 달성 확률의 의미)은 맨 위 ⓘ 팝업의 항상-on 안내에 그대로 있다.
    const goalAmountLine = goalMeta.mode === 'real'
      ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200">${fmtKRWShort(goalMeta.rawAmount)} (현재 구매력 기준)</p>
         <p class="text-sm text-slate-400 mt-1">${goalMeta.targetYears}년 후 명목 환산 목표 ${fmtKRWShort(goalMeta.nominalGoalAmount)}</p>`
      : `<p class="text-sm font-bold text-slate-700 dark:text-slate-200">${fmtKRWShort(goalMeta.rawAmount)} (미래 명목금액)</p>`;
    // [MC 표시 정책 ③] 위쪽 P50/P25 금액은 선택한 기간을 따르지만 목표 도달 가능성은 목표 기간에 고정이다 -
    // 두 기간이 다를 때만 그 사실을 한 줄로 밝혀 5년 후 금액과 20년 후 확률을 같은 시점으로 읽지 않게 한다.
    const periodNoteHtml = sel.year !== goalMeta.targetYears
      ? `<p class="text-sm text-slate-400 mt-1 leading-relaxed break-keep">위쪽 금액은 ${sel.year}년 후 기준이고, 목표 도달 가능성은 ${goalMeta.targetYears}년 후 기준입니다.</p>`
      : '';
    goalArea.innerHTML = `
      <p class="text-sm text-slate-400">목표금액</p>
      ${goalAmountLine}
      <p class="text-sm text-slate-400 mt-1.5">${scopePrefix}${goalMeta.targetYears}년 후 목표에 도달할 가능성</p>
      <p class="text-base font-bold text-slate-700 dark:text-slate-200">${display.text}</p>
      ${periodNoteHtml}
      ${tailCaptionHtml}`;
  } else {
    goalArea.innerHTML = `<p class="text-sm text-slate-400">목표금액이 설정되지 않았습니다.</p>`;
  }
  applyMonteCarloStaleNotice();
}

// result: js/15 원본(명목) 결과. inflationRatePct: state.projection.inflationRate(예: 2.5, %단위 그대로).
// goalMeta: { rawAmount, mode, nominalGoalAmount, targetYears } | null - mcRunBtn 클릭 시점에 결정된 값을
// 그대로 넘겨받는다(요청 시점과 표시 시점의 목표금액/모드가 어긋나지 않도록).
// contributionMeta: { ownerScope } - 해외자산 환율 안내 판정에 쓰는 관점(소유자).
// weightedFeePct: [v250] 화면에 표시하지 않는다(PM 수정 지시로 가중평균 보수 줄 삭제) - 기존 호출 순서를 지키기 위한 자리다.
// runSignature: [PMD-09] 실행 버튼을 누른 시점의 입력 서명(computeMonteCarloInputSignature). 생략하면 지금 입력 기준이다.
function renderMonteCarloResult(result, inflationRatePct, goalMeta, contributionMeta, weightedFeePct, runSignature) {
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
    // (참고성 WARNING + 항상-on INFO)는 [v250] 맨 위 ⓘ 팝업에서 보여준다(mcSafetyDetailStore, js/22
    // renderMonteCarloSafetyTiers). 판정 결과(issue 배열) 자체는 한 글자도 바뀌지 않았다.
    if (typeof renderMonteCarloSafetyTiers === 'function') {
      renderMonteCarloSafetyTiers(mcUiEl('mcSafetyCritical'), null, mcSafetyDetailStore, nonBlockIssues.concat(semanticIssues));
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
  // [v250 PM 수정 지시] 결과 아래의 인플레이션율 · 가중평균 운용보수 · 월 적립금/총 납입원금/목표비중 기준 안내 줄은 표시하지 않는다
  // (계산 · 데이터 무변경 - 인플레이션율은 현재가치 라벨에, 보수 · 적립금은 각 설정 팝업에 그대로 있다).
  renderMonteCarloCmaSource(result.cma, result.cmaDatasetVersion);

  // [FUTURE-P1 Phase 3-2] 새 결과가 오면 선택 상태를 기본값(가장 긴 기간)으로 되돌린다 - 이전 실행에서
  // 고른 범위가 남아 오해를 만들지 않게 한다.
  // [MC 표시 정책 ②] 기본 계좌 범위: 절세계좌 결과(accountScopes)가 있으면 통합, 없으면 일반계좌.
  // 엔진이 이미 같은 경로에서 합쳐 둔 combined 분포를 "처음에 무엇을 보여줄지"만 바꾼 것이다.
  mcSelectedScope = mcHasAccountScopes(withReal) ? 'combined' : 'general';
  mcSelectedMilestoneIdx = null;
  // [PMD-09] 실행 중에 입력이 바뀌었으면 결과가 오자마자 "다시 계산 필요"로 표시된다.
  const currentSignature = computeMonteCarloInputSignature();
  const signature = runSignature !== undefined ? runSignature : currentSignature;
  mcLastRender = { withReal, goalMeta, inflationRatePct, signature, stale: signature !== currentSignature };
  if (mcLastRender.stale) showMonteCarloStatus('설정이 바뀌어 다시 계산이 필요합니다.');
  renderMonteCarloScopedResult();
}

/* -------------------------------------------------------------------------
 * [§37 CMA-UI-01 · CMA-CORR-09] 장기 가정 출처 - 결과(result.cma)에 담긴 "그 실행 당시" 세트를 보여준다.
 *    [v250] 기본 접힘 드롭다운 = 요약(기관 · 기준일 · 기간 · 통화 · 세트 버전 · 상관 출처 유형 개수),
 *    옆 ⓘ = 상세(자산군 변동성, 자산군 쌍별 상관계수 · 출처 유형 · Benchmark 기관/자료/기준일/값)를 기존 mcInfoModal로.
 *    내용 · 문구는 v249와 같고 보이는 위치만 바뀌었다. 계산에는 쓰지 않는다.
 * ---------------------------------------------------------------------- */
const MC_CMA_SOURCE_TYPE_LABEL = Object.freeze({
  OFFICIAL_CMA_DIRECT: '공식 CMA 직접',
  OFFICIAL_CMA_MAPPING: '공식 CMA 연결',
  BENCHMARK_REFERENCE: 'Benchmark 참고값'
});
let mcCmaSummaryHtml = '';
let mcCmaDetailHtml = '';
function mcCmaHorizonText(h) {
  if (h && typeof h === 'object') return `${h.min}~${h.max}년 전망`;
  return h ? `${h}년 전망` : '기간 미표기';
}
function mcCmaCurrencyText(c) {
  if (c === 'USD') return '달러(USD) 기준';
  if (c === 'KRW') return '원화(KRW) 기준';
  return c ? `${c} 기준` : '';
}
function renderMonteCarloCmaSource(cma, setVersion) {
  if (!cma || !cma.primary) { mcCmaSummaryHtml = ''; mcCmaDetailHtml = ''; return; }
  const p = cma.primary;
  const summary = typeof summarizeCmaCorrelationPairs === 'function' ? summarizeCmaCorrelationPairs(cma.pairs) : { rows: [], counts: {}, benchmarkUsed: false };
  const usedBenchmarks = (cma.benchmarks || []).filter((b) => summary.rows.some((r) => r.sourceType === 'BENCHMARK_REFERENCE' && r.dataset && r.dataset.datasetId === b.datasetId));
  const lines = [
    `${p.provider} 장기 CMA · 기준일 ${p.asOfDate} · ${mcCmaHorizonText(p.horizonYears)} · ${mcCmaCurrencyText(p.currency)} · 세트 ${setVersion || cma.setVersion}`
  ];
  if (summary.rows.length > 0) {
    const parts = Object.keys(MC_CMA_SOURCE_TYPE_LABEL).filter((k) => summary.counts[k] > 0)
      .map((k) => `${MC_CMA_SOURCE_TYPE_LABEL[k]} ${summary.counts[k]}쌍`);
    let corrLine = `상관계수: ${parts.join(' · ')}`;
    if (usedBenchmarks.length) corrLine += ` - Benchmark는 ${usedBenchmarks.map((b) => `${b.provider}(기준일 ${b.asOfDate})`).join(', ')} 자료`;
    lines.push(corrLine);
  } else {
    lines.push('상관계수: 서로 다른 위험자산 조합이 없어 사용하지 않았습니다.');
  }
  // [§37-5] 수익률은 정책상 기존 수익률 기준(Return Key)이다 - CMA에서는 변동성 · 상관계수만 쓴다.
  const allReturnKey = (cma.instruments || []).every((i) => i.riskFree || i.returnSource !== 'CMA');
  if (allReturnKey) {
    lines.push('수익률: 기존 수익률 기준을 그대로 씁니다(장기 CMA에서는 변동성 · 상관계수만 사용합니다).');
  }
  mcCmaSummaryHtml = lines.map((l) => escapeHtml(l)).join('<br>');

  const labelOf = (c) => (typeof getAssetCharacterLabel === 'function' ? getAssetCharacterLabel(c) : c);
  const risky = (cma.instruments || []).filter((i) => !i.riskFree);
  const byClass = new Map();
  risky.forEach((i) => { if (!byClass.has(i.appClass)) byClass.set(i.appClass, i); });
  const volRows = Array.from(byClass.values()).map((i) =>
    `<li>${escapeHtml(labelOf(i.appClass))} → ${escapeHtml(i.cmaClass || '-')} · 변동성 ${escapeHtml(fmtNum(i.volatilityPct, 1))}%</li>`);
  if ((cma.instruments || []).some((i) => i.riskFree && !i.noAssumption)) volRows.push('<li>채권 · 현금성 → 변동성 0(기존 정책)</li>');
  const noAssumption = (cma.instruments || []).filter((i) => i.noAssumption);
  if (noAssumption.length) volRows.push(`<li>수익률 가정이 없는 자산(${noAssumption.map((i) => escapeHtml(i.label)).join(', ')}) → 성장 · 변동성 가정 없이 원금 그대로 계산</li>`);
  const pairRows = summary.rows.map((r) => {
    const d = r.dataset || {};
    return `<li>${escapeHtml(labelOf(r.appClassA))} ↔ ${escapeHtml(labelOf(r.appClassB))}: <span class="font-semibold text-slate-700 dark:text-slate-200">${escapeHtml(fmtNum(r.value, 2))}</span>`
      + `<br>${escapeHtml(MC_CMA_SOURCE_TYPE_LABEL[r.sourceType] || r.sourceType)} · ${escapeHtml(d.provider || '-')}`
      + ` · ${escapeHtml(d.sourceTitle || '-')} · 기준일 ${escapeHtml(d.asOfDate || '-')} · ${escapeHtml(mcCmaCurrencyText(d.currency))}`
      + `<br>${escapeHtml(r.classA || '-')} ↔ ${escapeHtml(r.classB || '-')}</li>`;
  });
  mcCmaDetailHtml =
    `<div><p class="font-semibold text-slate-600 dark:text-slate-300">자산군 변동성(${escapeHtml(p.provider)})</p><ul class="list-disc pl-5 space-y-1">${volRows.join('') || '<li>위험자산 없음</li>'}</ul></div>`
    + `<div><p class="font-semibold text-slate-600 dark:text-slate-300">상관계수 출처</p><ul class="list-disc pl-5 space-y-1">${pairRows.join('') || '<li>해당 없음</li>'}</ul></div>`
    + `<p>자료: ${escapeHtml(p.sourceTitle)} (${escapeHtml(p.version)})</p>`;
}
// [UI 마무리 ⑤ · §37 CMA-UI-01] 장기 가정 출처를 결과 아래 드롭다운 + 별도 ⓘ에서 상단 "실제 미래는 여러 경로로 달라질 수
// 있습니다" ⓘ 팝업 한 곳으로 모았다. 요약(기관 · 기준일 · 기간 · 통화 · 세트 · 상관 출처 유형 · Benchmark · 수익률 기준)과
// 상세(자산군 변동성 · 상관계수 쌍별 출처 · 자료)는 그 실행 당시 결과(result.cma)에서 만든 그대로다.
function mcCmaSourceSectionHtml() {
  const body = mcCmaSummaryHtml
    ? `<p class="break-keep" data-mc-cma-summary>${mcCmaSummaryHtml}</p><div class="space-y-2 break-keep" data-mc-cma-detail>${mcCmaDetailHtml}</div>`
    : '<p data-mc-cma-summary>Monte Carlo를 실행하면 이번 계산에 쓴 장기 가정 출처(기관 · 기준일 · 자산군 변동성 · 상관계수 출처)가 여기에 표시됩니다.</p>';
  return `<div class="space-y-1.5" data-mc-cma-source><p class="font-semibold text-slate-700 dark:text-slate-200">장기 가정 출처</p>${body}</div>`;
}

/* 계좌 범위 / 기간 / 장기 가정 출처 - 전부 이미 계산된 결과를 다시 그릴 뿐이라 Monte Carlo를 다시
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
  /* [§37 → UX-1 확장] 예전에는 DATA_ERROR만 사유를 덧붙였다. 사용자가 고칠 수 있는 사유는
   * INPUT_ERROR 쪽에도 있는데 그것을 버려서 "입력값을 확인해주세요."만 남았다.
   * 이제 어떤 코드든 **사용자 말로 옮길 수 있는 사유가 있으면** 함께 보여준다.
   * 옮길 짝이 없으면 아무것도 덧붙이지 않는다(개발 용어 노출 금지 · 추측 금지). */
  const reason = monteCarloUserReason(error && error.message);
  const shown = reason ? `${friendly} ${reason}` : friendly;
  showToast(shown, 'error');
  showMonteCarloStatus(shown);
}

function handleMonteCarloCancelled(info) {
  // [F-06a] 새 실행이 이 실행을 대신한 취소면 화면은 이미 새 실행의 진행 상태다 - READY로 되돌리지 않는다.
  if (info && info.superseded) return;
  resetMonteCarloUiToReady();
  showToast(MC_UI_STATUS_LABEL.CANCELLED, 'info');
}

// [통합 수정 · F-06a] 실행 버튼 처리 본문 - 아래 클릭 리스너가 중복 실행을 막고 호출한다.
async function runMonteCarloFromUi() {
  // [PMD-09] 이 실행이 어떤 입력으로 계산됐는지 기억해 두었다가, 결과가 온 뒤 입력이 바뀌면 "다시 계산 필요"로 표시한다.
  const runSignature = computeMonteCarloInputSignature();
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
    // 실질→명목 환산에 쓰이는 inflationRate는 저장된 값을 그대로 써야 현재가치 라벨/결과
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

  // [v250] 결과 화면의 적립금 안내 줄이 삭제되어, 결과 렌더에는 관점(소유자)만 넘긴다(환율 안내 판정용).
  const contributionMeta = { ownerScope: mcOwnerScope };

  // [Phase 3-4 - 표시 전용] 포트폴리오 가중평균 운용보수를 보여주기 위해, js/18(Worker orchestration -
  // 이번 Phase에서 변경 금지)을 건드리지 않고 어댑터를 한 번 더(캐시된 데이터라 저렴함) 직접 호출한다.
  // 이 결과는 화면 표시에만 쓰고, 실제 시뮬레이션 입력은 여전히 startMonteCarloRun 내부에서 독립적으로
  // 다시 만들어진다(계산 경로 자체는 그대로 유지).
  // [FUTURE-P1] 아래 startMonteCarloRun이 내부에서 어댑터를 다시 부르므로, 이 표시용 호출도 반드시
  // 같은 config로 불러야 한다 - 그러지 않으면 여기서 본 preflight safety(절세계좌 종목의 운용보수/
  // 데이터 부족 issue 포함)와 실제 실행 경로가 서로 다른 것을 보게 된다.
  const feeDisplayResult = await buildMonteCarloInputFromState({ presetKey, ownerFilter: mcOwnerScope, includeTaxAdvantaged: true, years });
  // [v250] 가중평균 보수 줄은 화면에서 삭제됐다 - 이 호출은 아래 실행 전 BLOCK 확인(preflightSafety)에 그대로 쓴다.

  // [Phase 3-5 Safety Layer - 계산 시작 전 BLOCK] startMonteCarloRun 내부(js/18)에서도 동일하게 다시
  // 검사하지만(어댑터를 이 화면에서 한 번 더 부르므로 결과가 항상 같음), 여기서 먼저 걸러야 진행바가
  // 잠깐이라도 뜨는 것을 막고 즉시 issue 카드를 보여줄 수 있다.
  /* [UX-1] 계산에 넣을 자산이 하나도 없으면 진행바를 띄우지 않고 그 사실을 바로 말한다.
   * 어댑터가 사유를 남겼으면(장기 가정 미연결 등) 그 한국어 사유를 그대로 함께 보여준다. */
  if (!Array.isArray(feeDisplayResult.instruments) || feeDisplayResult.instruments.length === 0) {
    const why = monteCarloUserReason((feeDisplayResult.errors || []).join('; '))
      || '미래 예측에 넣을 자산이 없습니다. 주식·ETF 자산을 등록하고 수익률 관리에서 기준을 정한 뒤 다시 실행해 주세요.';
    showToast(why, 'error');
    showMonteCarloStatus(why);
    return;
  }
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
    onCompleted: (result) => renderMonteCarloResult(result, inflationRatePct, goalMeta, contributionMeta, null, runSignature),
    onCancelled: (info) => handleMonteCarloCancelled(info),
    onFailed: (error) => handleMonteCarloError(error)
  });
}
// [F-06a] 입력 준비(어댑터 호출) 중에 두 번 누르거나 실행 중에 다시 누르면, 앞선 실행을 취소하며 화면이 READY로 되돌아가는
// 경합이 생길 수 있었다 - 준비 중 · 실행 중에는 새 실행을 시작하지 않는다(실행 중 버튼은 이미 비활성).
let mcRunClickPending = false;
document.getElementById('mcRunBtn').addEventListener('click', async () => {
  if (mcRunClickPending || isMonteCarloRunInProgress()) return;
  mcRunClickPending = true;
  try { await runMonteCarloFromUi(); } finally { mcRunClickPending = false; }
});
// [PMD-09] 실행 조건(시나리오 · 반복 횟수 · 목표금액 · 목표 기준)을 바꾸면 결과를 지우지 않고 "다시 계산 필요"로 표시한다.
mcUiEl('mcPresetSelect').addEventListener('change', () => refreshMonteCarloResultValidity());
mcUiEl('mcIterationsSelect').addEventListener('change', () => refreshMonteCarloResultValidity());
mcUiEl('mcGoalAmountInput').addEventListener('input', () => refreshMonteCarloResultValidity());
document.querySelectorAll('input[name="mcGoalMode"]').forEach((el) => el.addEventListener('change', () => refreshMonteCarloResultValidity()));

document.getElementById('mcCancelBtn').addEventListener('click', () => {
  cancelMonteCarloRun();
});
