/* -------------------------------------------------------------------------
 * 28. Monte Carlo Controller - 메인 스레드에서 Worker를 관리하는 orchestration layer
 *    - [요청 1개 = Worker 1개] 매 실행 요청마다 새 Worker를 만들고, 취소/완료 시 반드시 종료(terminate)
 *      한다 - Worker 재사용을 하지 않으면 "죽은 Worker가 새 메시지를 보낼 수 있는" 여지 자체가 없어져
 *      race condition의 근본 원인 하나가 구조적으로 사라진다.
 *    - [requestId 토큰 가드] 그래도 postMessage는 비동기라 이론상 늦게 도착하는 메시지가 있을 수
 *      있으므로, 메인 스레드는 "지금 활성 상태인 requestId"와 다른 메시지는 전부 무시한다 - 기존
 *      js/05의 monteCarloRequestToken 패턴과 동일한 발상이다.
 *    - [상태 머신] WAITING -> RUNNING -> (COMPLETED|CANCELLED|FAILED) 순서만 허용한다. COMPLETED/
 *      CANCELLED/FAILED에 도달한 뒤에는 그 requestId로 다시 상태가 바뀌는 일이 없다(새 요청은 항상
 *      새 requestId로 시작).
 * ---------------------------------------------------------------------- */
const MC_WORKER_STATE = { WAITING: 'WAITING', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', FAILED: 'FAILED' };

let mcActiveRequestId = null;
let mcActiveWorker = null;
let mcActiveCallbacks = null;
let mcState = MC_WORKER_STATE.WAITING;
let mcRequestSeq = 0;

function mcNextRequestId() {
  mcRequestSeq += 1;
  return 'mc-' + Date.now() + '-' + mcRequestSeq;
}

// input(엔진 표준 입력) 자체는 이미 만들어져 있다고 가정한다(어댑터 호출은 startMonteCarloRun에서
// 먼저 처리) - 이 함수는 그 input을 실제로 Worker에 태워 실행하는 부분만 담당한다.
// safetyContext: { preflightSafety, correlationDiagnostics } - COMPLETED 시점에 post-hoc(PSD 보정/
// 시뮬레이션 신뢰도) safety를 계산해 preflight safety와 합쳐 최종 safety를 만드는 데 쓴다.
function launchMonteCarloWorker(requestId, mode, input, callbacks, safetyContext) {
  const worker = new Worker('js/17-monte-carlo-worker.js');
  mcActiveWorker = worker;
  mcActiveCallbacks = callbacks;
  safetyContext = safetyContext || {};

  // [조건부승인 항목 11 - Worker Hang Timeout] 실측(10-instrument/50,000회/20년, 메인스레드 기준
  // 약 10.3초) 대비 6배 여유를 둔 SAFETY_THRESHOLDS.WORKER_TIMEOUT_MS(60초)까지 어떤 메시지도 오지
  // 않으면 무한 대기 대신 명확한 WORKER_TIMEOUT으로 종료한다.
  const timeoutMs = (typeof SAFETY_THRESHOLDS !== 'undefined' && SAFETY_THRESHOLDS.WORKER_TIMEOUT_MS) || 60000;
  const timeoutTimer = setTimeout(() => {
    if (requestId !== mcActiveRequestId) return;
    mcState = MC_WORKER_STATE.FAILED;
    callbacks.onFailed && callbacks.onFailed({ code: 'WORKER_TIMEOUT', message: `계산이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 중단되었습니다.` });
    worker.terminate();
  }, timeoutMs);
  function clearWorkerTimeout() { clearTimeout(timeoutTimer); }

  worker.onerror = (event) => {
    if (requestId !== mcActiveRequestId) return; // stale
    clearWorkerTimeout();
    mcState = MC_WORKER_STATE.FAILED;
    callbacks.onFailed && callbacks.onFailed({ code: 'WORKER_ERROR', message: event.message || 'Worker 내부 오류' });
    worker.terminate();
  };
  worker.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.requestId !== mcActiveRequestId) return; // [race guard] 취소되고 새 요청이 시작된 뒤 도착한 stale 메시지 무시
    if (msg.type === 'STARTED') {
      mcState = MC_WORKER_STATE.RUNNING;
      callbacks.onStarted && callbacks.onStarted();
    } else if (msg.type === 'PROGRESS') {
      if (mcState !== MC_WORKER_STATE.RUNNING) return; // COMPLETED 등 이후 도착한 진행률은 무시(요청 F/G)
      callbacks.onProgress && callbacks.onProgress(msg.completed, msg.total, msg.progress);
    } else if (msg.type === 'COMPLETED') {
      clearWorkerTimeout();
      mcState = MC_WORKER_STATE.COMPLETED;
      // [Phase 3-5 - Result Safety(post-hoc modelRisk)] PSD correction/시뮬레이션 신뢰도는 엔진이 실제로
      // 돌기 전까지는 알 수 없다 - 여기서 계산해 preflight safety(fee/return/weight-sum 등)와 합친다.
      // [값은 절대 바꾸지 않는다] msg.result 자체는 그대로 두고 safety 필드만 추가한다.
      const diagnostics = msg.result && msg.result.diagnostics;
      const modelRiskIssues = [];
      const psdIssue = (typeof assessPSDCorrection === 'function') ? assessPSDCorrection(diagnostics) : null;
      if (psdIssue) modelRiskIssues.push(psdIssue);
      const lastMilestone = msg.result && msg.result.milestones && msg.result.milestones[msg.result.milestones.length - 1];
      if (lastMilestone && lastMilestone.goalProbability && typeof assessSimulationConfidence === 'function') {
        const confIssue = assessSimulationConfidence(msg.result.simulations, lastMilestone.goalProbability);
        if (confIssue) modelRiskIssues.push(confIssue);
      }
      if (lastMilestone && typeof assessResultSpread === 'function') {
        const spreadIssue = assessResultSpread(lastMilestone.p10, lastMilestone.p50, lastMilestone.p90);
        if (spreadIssue) modelRiskIssues.push(spreadIssue);
      }
      if (typeof explainResultAlwaysOn === 'function') modelRiskIssues.push(explainResultAlwaysOn());
      // [Phase 4] 위 카드와 의도적으로 분리된 별도 카드 - "표본 안정성"과 "가정의 경제적 불확실성"을
      // 하나로 섞지 않는다(조건부승인 항목 5).
      if (typeof explainSimulationStabilityAlwaysOn === 'function') modelRiskIssues.push(explainSimulationStabilityAlwaysOn());

      const preflight = safetyContext.preflightSafety || { issues: [], dataQuality: { issues: [] }, modelRisk: { issues: [] } };
      const finalSafety = (typeof buildSafetyResult === 'function')
        ? buildSafetyResult(preflight.issues, preflight.dataQuality.issues, modelRiskIssues)
        : null;
      msg.result.safety = finalSafety;
      callbacks.onCompleted && callbacks.onCompleted(msg.result);
      worker.terminate();
    } else if (msg.type === 'CANCELLED') {
      clearWorkerTimeout();
      mcState = MC_WORKER_STATE.CANCELLED;
      callbacks.onCancelled && callbacks.onCancelled();
      worker.terminate();
    } else if (msg.type === 'FAILED') {
      clearWorkerTimeout();
      mcState = MC_WORKER_STATE.FAILED;
      callbacks.onFailed && callbacks.onFailed(msg.error);
      worker.terminate();
    }
  };

  mcState = MC_WORKER_STATE.WAITING;
  worker.postMessage({ type: 'START', requestId, mode, input });
  return worker;
}

// state(신랑/와이프 목표비중 등)에서 표준 입력을 만들고(js/16), 검증까지 통과하면 Worker를 띄운다.
// 이미 실행 중인 요청이 있으면 먼저 자동으로 취소한다(동시에 두 시뮬레이션이 도는 것을 막는다).
// callbacks: { onStarted, onProgress(completed,total,progress), onCompleted(result), onCancelled, onFailed(error) }
async function startMonteCarloRun(params, callbacks) {
  callbacks = callbacks || {};
  if (mcActiveRequestId !== null && mcState === MC_WORKER_STATE.RUNNING) cancelMonteCarloRun();

  const requestId = mcNextRequestId();
  mcActiveRequestId = requestId;
  mcState = MC_WORKER_STATE.WAITING;

  const adapterResult = await buildMonteCarloInputFromState({ presetKey: params.presetKey || 'normal' });
  if (requestId !== mcActiveRequestId) return; // 어댑터가 비동기로 데이터를 가져오는 동안 취소/재시작됐으면 중단
  if (adapterResult.errors && adapterResult.errors.length > 0) {
    mcState = MC_WORKER_STATE.FAILED;
    callbacks.onFailed && callbacks.onFailed({ code: 'DATA_ERROR', message: adapterResult.errors.join('; ') });
    return;
  }

  // [Phase 3-5 Safety Layer - 계산 시작 전 BLOCK] 목표 비중 오류/Fee 범위 오류/변동성 음수 등 BLOCK
  // 등급 issue가 하나라도 있으면 Worker를 아예 띄우지 않는다("계산 시작 전" - Step 5). errors(위)와
  // 달리 safety.issues는 코드별로 세분화된 code를 그대로 넘겨 UI가 "무엇이 문제인지" 구체적으로 보여줄
  // 수 있게 한다(예전엔 전부 DATA_ERROR 하나로 뭉개졌음 - 조건부승인 항목 12).
  if (adapterResult.safety && adapterResult.safety.status === 'BLOCK') {
    mcState = MC_WORKER_STATE.FAILED;
    const blockIssues = adapterResult.safety.issues.filter((i) => i.severity === 'BLOCK')
      .concat(adapterResult.safety.dataQuality.issues.filter((i) => i.severity === 'BLOCK'));
    callbacks.onFailed && callbacks.onFailed({
      code: blockIssues[0] ? blockIssues[0].code : 'SAFETY_BLOCK',
      message: blockIssues.map((i) => i.message).join('; '),
      safetyIssues: blockIssues
    });
    return;
  }

  const input = {
    instruments: adapterResult.instruments,
    correlationMatrix: adapterResult.correlationMatrix,
    assetOrder: adapterResult.assetOrder,
    initialPrincipal: params.initialPrincipal,
    monthlyContribution: params.monthlyContribution,
    contributionGrowthRate: params.contributionGrowthRate, // [Phase 3-3] 생략 시 엔진에서 0으로 처리(하위호환)
    years: params.years,
    simulations: params.simulations,
    seed: params.seed,
    goalAmounts: params.goalAmounts
  };
  const validation = validateMonteCarloInput(input);
  if (!validation.valid) {
    mcState = MC_WORKER_STATE.FAILED;
    callbacks.onFailed && callbacks.onFailed({ code: 'INPUT_ERROR', message: validation.errors.join('; ') });
    return;
  }

  launchMonteCarloWorker(requestId, params.mode || 'official', input, callbacks, { preflightSafety: adapterResult.safety });
  return requestId;
}

// [취소] worker.terminate()는 즉시·동기적으로 스레드를 죽인다 - Worker 쪽이 스스로 CANCELLED를 보낼
// 기회조차 없을 수 있으므로, CANCELLED 통지는 여기(메인 스레드)에서 직접 만들어 보낸다(요청한 흐름:
// CANCEL REQUEST -> worker.terminate() -> request invalidation -> CANCELLED와 동일).
function cancelMonteCarloRun() {
  if (!mcActiveWorker || mcState !== MC_WORKER_STATE.RUNNING && mcState !== MC_WORKER_STATE.WAITING) return;
  const cancelledId = mcActiveRequestId;
  const callbacks = mcActiveCallbacks;
  mcActiveWorker.terminate();
  mcActiveWorker = null;
  mcActiveRequestId = null; // 이후 도착 가능한 모든 stale 메시지를 즉시 무효화
  mcActiveCallbacks = null;
  mcState = MC_WORKER_STATE.CANCELLED;
  callbacks && callbacks.onCancelled && callbacks.onCancelled();
  return cancelledId;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MC_WORKER_STATE, startMonteCarloRun, cancelMonteCarloRun };
}
