/* -------------------------------------------------------------------------
 * 29. Safety UI (Phase 3-5) - js/21의 issue 배열을 "무엇이 문제 -> 왜 중요 -> 무엇을 해야" 3단
 *    구조의 초보자용 카드로 렌더링한다. 이 파일은 오직 표시만 담당한다 - 판정(js/21)이나 계산(js/15/
 *    js/05)에는 관여하지 않는다(Engine=계산, Safety=판단, UI=전달 - 조건부승인 항목 13).
 * ---------------------------------------------------------------------- */

const SAFETY_UI_STYLE = {
  BLOCK: { badge: '차단', wrapClass: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300', badgeClass: 'bg-rose-600 text-white' },
  WARNING: { badge: '주의', wrapClass: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300', badgeClass: 'bg-amber-500 text-white' },
  INFO: { badge: '안내', wrapClass: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300', badgeClass: 'bg-slate-400 text-white' },
};

// [M. Beginner UX] "무엇이 문제(title/message) -> 왜 중요(message에 이미 이유 포함) -> 무엇을 해야
// (recommendation)" 3단 구조. σ/상관계수 같은 전문용어는 issue.message 작성 시점(js/21)에서 이미
// 일상어로 풀어썼으므로, 이 함수는 그 문장을 그대로 카드에 배치하기만 한다.
function renderSafetyIssueCard(issue) {
  const style = SAFETY_UI_STYLE[issue.severity] || SAFETY_UI_STYLE.INFO;
  return `<div class="p-2.5 rounded-lg border text-[11px] leading-relaxed space-y-1 ${style.wrapClass}">
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${style.badgeClass}">${style.badge}</span>
      <span class="font-semibold">${escapeHtml(issue.title)}</span>
    </div>
    <p>${escapeHtml(issue.message)}</p>
    ${issue.recommendation ? `<p class="opacity-80">${escapeHtml(issue.recommendation)}</p>` : ''}
  </div>`;
}

// 여러 issue를 하나의 컨테이너에 렌더링 - 비어있으면 컨테이너를 숨긴다.
function renderSafetyIssueList(containerEl, issues) {
  if (!containerEl) return;
  const list = (issues || []).filter(Boolean);
  if (list.length === 0) {
    containerEl.classList.add('hidden');
    containerEl.innerHTML = '';
    return;
  }
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `<div class="space-y-1.5">${list.map(renderSafetyIssueCard).join('')}</div>`;
}

// Future Projection(js/05 updateProjection)의 목표 비중 BLOCK 배너 전용 - "계산 시작 전 BLOCK"을
// 명확하게 보여주고, 왜 계산을 시작하지 않았는지 안내한다(자동 재정규화는 하지 않음을 함께 고지).
function renderSafetyBlockBanner(containerEl, issues) {
  if (!containerEl) return;
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `<p class="font-semibold">⚠ 목표 비중 오류로 계산을 진행할 수 없습니다</p>
    <div class="space-y-1.5 mt-1">${issues.map(renderSafetyIssueCard).join('')}</div>`;
}

// [13번 - Safety가 값을 바꾸지 않는다는 원칙과 UX의 접점] requiresConfirmation:true인 WARNING이 하나
// 이상 있으면, 계산을 막지는 않되(BLOCK이 아님) 사용자가 "그래도 실행"을 명시적으로 한 번 더 눌러야
// 진행되게 한다 - 네이티브 confirm()으로 최소 구현(커스텀 모달은 이번 Phase 범위 밖).
function confirmExtremeAssumptionsIfNeeded(issues) {
  const needsConfirm = (issues || []).filter((i) => i && i.requiresConfirmation);
  if (needsConfirm.length === 0) return true;
  const lines = needsConfirm.map((i) => `- ${i.title}: ${i.message}`).join('\n');
  return window.confirm(`다음 가정이 이례적으로 극단적입니다. 그래도 계산을 진행할까요?\n\n${lines}`);
}

// [Phase 4 - Goal Probability 표시 정책] Calibration Research 실측 근거: 목표금액이 P25~P75(분포
// 중심부)에 있으면 10,000회 이상에서 relSD(seed간 상대표준편차) 1% 미만으로 소수점 1자리 표시가
// 실제 안정성과 부합한다. 반면 목표금액이 분포의 꼬리(P10 미만/P90 초과 근처)에 있으면 5,000회에서
// relSD가 4%까지 치솟고 50,000회에서도 0.7%대로 남아, "10.2%"처럼 소수점까지 보여주는 것 자체가
// 실제보다 정밀한 것처럼 오해를 준다 - 그래서 꼬리 구간만 "약 N%"/구간 표기로 낮추고, 중심부는
// 기존 표시(소수점 1자리)를 그대로 유지한다(무조건 정수로 바꾸지 않음).
function formatGoalProbabilityDisplay(probabilityDecimal) {
  const pct = probabilityDecimal * 100;
  if (pct < 5) return { text: '5% 미만', isTail: true };
  if (pct > 95) return { text: '95% 초과', isTail: true };
  if (pct < 10 || pct > 90) return { text: `약 ${Math.round(pct)}%`, isTail: true };
  return { text: `${pct.toFixed(1)}%`, isTail: false };
}
const GOAL_PROBABILITY_TAIL_CAPTION = '이 확률은 분포의 극단에 가까워 시뮬레이션 표본에 따라 다소 달라질 수 있습니다.';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderSafetyIssueCard, renderSafetyIssueList, renderSafetyBlockBanner, confirmExtremeAssumptionsIfNeeded,
    formatGoalProbabilityDisplay, GOAL_PROBABILITY_TAIL_CAPTION
  };
}
