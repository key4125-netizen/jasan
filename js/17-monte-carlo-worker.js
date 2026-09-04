/* -------------------------------------------------------------------------
 * 27. Monte Carlo Worker - Core Engine(js/15) 실행 전용 백그라운드 스레드
 *    - [역할 제한] 이 파일은 순수 orchestration이다 - μ/σ/상관관계/월별 처리 순서/리밸런싱 등
 *      수학적 계산은 전혀 건드리지 않는다(importScripts로 js/15를 그대로 불러와 실행할 뿐).
 *    - [DOM/state 접근 금지] Worker는 별도 전역 스코프라 document/state(앱 상태)에 접근할 수 없다 -
 *      메인 스레드(js/18)가 어댑터(js/16)로 이미 완성된 표준 입력(instruments/correlationMatrix 등)을
 *      만들어 postMessage로 넘겨준다. 이 파일은 그 입력을 받아 계산만 한다.
 *    - [Message Protocol]
 *      Main → Worker: { type:'START', requestId, mode, input }
 *                      { type:'CANCEL', requestId }
 *      Worker → Main: { type:'STARTED', requestId }
 *                      { type:'PROGRESS', requestId, completed, total, progress }
 *                      { type:'COMPLETED', requestId, result }
 *                      { type:'CANCELLED', requestId }
 *                      { type:'FAILED', requestId, error:{code,message} }
 * ---------------------------------------------------------------------- */
// [주의] 16-monte-carlo-adapter.js도 함께 불러오는 이유는 validateMonteCarloInput()을 여기서도
// 방어적으로 재확인하기 위해서일 뿐이다 - 그 파일의 buildMonteCarloInputFromState()(state/DOM 의존)는
// Worker 안에서 절대 호출하지 않는다(호출하면 state가 없어 즉시 에러가 난다 - 함수 선언 자체는
// 안전하게 로드되지만 실행하지 않는 한 문제되지 않는다).
importScripts('15-monte-carlo-engine.js', '16-monte-carlo-adapter.js');

// 이 Worker 인스턴스는 "요청 1개 전용"으로 쓴다(js/18이 요청마다 새 Worker를 만들고, 취소/완료 시
// terminate한다) - 그래도 postMessage는 비동기라 이론상 취소 직후에도 이미 큐에 있던 메시지가 도착할
// 수 있으므로, 이 변수로 "지금 이 Worker가 다루는 요청이 취소됐는지"를 자체적으로도 확인한다(js/18의
// requestId 필터링과 이중 방어).
let cancelledRequestId = null;

// [Progress batch 크기 - 실측 기반] 매 iteration마다 postMessage하면 오버헤드가 크다(Phase 2-2 벤치마크
// 참고) - 5천/1만회는 ~40회, 5만회는 ~60회 정도로 나눠 보낸다.
function chooseProgressBatchSize(iterations) {
  if (iterations <= 10000) return Math.max(100, Math.round(iterations / 40));
  return Math.max(500, Math.round(iterations / 60));
}

function classifyEngineError(err) {
  if (err && err.code === 'CANCELLED') return 'CANCELLED';
  const msg = String((err && err.message) || err || '');
  if (msg.indexOf('Cholesky') !== -1) return 'CORRELATION_ERROR';
  return 'SIMULATION_ERROR';
}

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type === 'CANCEL') {
    cancelledRequestId = msg.requestId;
    return;
  }
  if (msg.type !== 'START') return;

  const { requestId, mode, input } = msg;
  cancelledRequestId = null;
  self.postMessage({ type: 'STARTED', requestId });

  try {
    const validation = validateMonteCarloInput(input);
    if (!validation.valid) {
      self.postMessage({ type: 'FAILED', requestId, error: { code: 'INPUT_ERROR', message: validation.errors.join('; ') } });
      return;
    }

    const runner = mode === 'preview' ? runAnnualPreviewMC : runMonthlyPrecisionMC;
    const engineConfig = {
      pv0: input.initialPrincipal, instruments: input.instruments, correlationMatrix: input.correlationMatrix,
      monthlyContribution: input.monthlyContribution, contributionGrowthRate: input.contributionGrowthRate,
      years: input.years, iterations: input.simulations || input.iterations,
      seed: input.seed, goalAmounts: input.goalAmounts
    };
    const hooks = {
      progressBatchSize: chooseProgressBatchSize(engineConfig.iterations),
      onProgress: (completed, total) => {
        self.postMessage({ type: 'PROGRESS', requestId, completed, total, progress: Math.round((completed / total) * 100) });
      },
      shouldCancel: () => cancelledRequestId === requestId
    };

    const result = runner(engineConfig, hooks);
    self.postMessage({ type: 'COMPLETED', requestId, result });
  } catch (err) {
    const code = classifyEngineError(err);
    if (code === 'CANCELLED') { self.postMessage({ type: 'CANCELLED', requestId }); return; }
    self.postMessage({ type: 'FAILED', requestId, error: { code, message: String((err && err.message) || err) } });
  }
};

// [WORKER_ERROR] Worker 스레드 자체가 죽는 경우(importScripts 실패, 문법 오류 등)는 이 핸들러가 아니라
// 메인 스레드의 worker.onerror에서 잡힌다 - 이 파일 안에서 할 수 있는 처리는 여기까지다.
