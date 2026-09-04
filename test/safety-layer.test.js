// Safety Layer(js/21-safety-layer.js) 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/safety-layer.test.js
//
// js/21은 js/15와 동일하게 DOM/state에 의존하지 않는 순수 판정 함수 모음이라 스텁 없이 바로
// require()할 수 있다. 이 파일의 목적은 (1) BLOCK/WARNING/INFO 분류가 사용자가 확정한 기준과
// 정확히 일치하는지, (2) Safety Layer가 절대 값을 변경하지 않는지(입력 그대로 메시지에만 반영되는지)
// 감시하는 것이다.

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const safety = require(path.join(__dirname, '..', 'js', '21-safety-layer.js'));
const {
  SAFETY_LEVEL, SAFETY_THRESHOLDS, combineSeverity, buildSafetyResult,
  assessWeightSums, assessIndividualWeightSigns, assessExpectedReturn, assessVolatility, assessDataSufficiency,
  assessCorrelationPair, assessPSDCorrection, assessContributionGrowth, assessInflation, assessFee,
  assessSimulationConfidence, assessResultSpread, explainResultAlwaysOn
} = safety;

// [B3 후속수정 검증용 헬퍼] js/05의 assessHouseholdWeightSums()가 실제로 하는 일(합계 검사 +
// 개별 부호 검사를 합쳐서 반환)을 pure 함수 조합만으로 그대로 재현한다 - assessHouseholdWeightSums
// 자체는 state/DOM에 의존해 이 파일에서 직접 require할 수 없으므로, 그 로직과 동일한 조합을 여기서
// 재현해 pure 레벨에서 회귀를 고정한다(실제 DOM 경로 회귀는 이 세션에서 브라우저로 별도 확인함).
function assessOneRegion(pcts) {
  const sumPct = pcts.reduce((a, b) => a + b, 0);
  const regionSums = [{ owner: '신랑', region: '국내', sumPct }];
  const individualItems = pcts.map((pct, i) => ({ owner: '신랑', region: '국내', label: 'item' + i, pct }));
  return assessWeightSums(regionSums).concat(assessIndividualWeightSigns(individualItems));
}

function severityOf(x) { return x === null ? 'PASS' : x.severity; }

/* ---------------- BLOCK ---------------- */

test('BLOCK - 목표 비중 합계가 명백히 어긋남(98%, 102%)', () => {
  const issues98 = assessWeightSums([{ owner: '신랑', region: '국내', sumPct: 98 }]);
  const issues102 = assessWeightSums([{ owner: '신랑', region: '국내', sumPct: 102 }]);
  assert.strictEqual(issues98[0].severity, SAFETY_LEVEL.BLOCK);
  assert.strictEqual(issues102[0].severity, SAFETY_LEVEL.BLOCK);
});

test('PASS - 목표 비중 합계가 tolerance(±1%p) 이내면 통과(99.5%)', () => {
  const issues = assessWeightSums([{ owner: '신랑', region: '국내', sumPct: 99.5 }]);
  assert.strictEqual(issues.length, 0);
});

test('BLOCK - 비중 합계 tolerance 경계값 확인(정확히 100+tolerance는 통과, 그 초과는 BLOCK)', () => {
  const atBoundary = assessWeightSums([{ owner: '신랑', region: '국내', sumPct: 100 + SAFETY_THRESHOLDS.WEIGHT_SUM_TOLERANCE_PCT }]);
  const overBoundary = assessWeightSums([{ owner: '신랑', region: '국내', sumPct: 100 + SAFETY_THRESHOLDS.WEIGHT_SUM_TOLERANCE_PCT + 0.01 }]);
  assert.strictEqual(atBoundary.length, 0, '경계값 자체는 tolerance 이내(diff===tolerance)라 통과해야 한다');
  assert.strictEqual(overBoundary[0].severity, SAFETY_LEVEL.BLOCK);
});

test('BLOCK - Fee < 0 또는 Fee >= 100%', () => {
  const negative = assessFee(-1, 'QQQM', true);
  const hundred = assessFee(100, 'QQQM', true);
  assert.strictEqual(negative[0].severity, SAFETY_LEVEL.BLOCK);
  assert.strictEqual(hundred[0].severity, SAFETY_LEVEL.BLOCK);
});

test('PASS - Fee 20%(BLOCK 아님, 강한 WARNING이어야 함 - 조건부승인 4-4)', () => {
  const issues = assessFee(20, 'QQQM', true);
  assert.strictEqual(issues[0].severity, SAFETY_LEVEL.WARNING);
  assert.notStrictEqual(issues[0].severity, SAFETY_LEVEL.BLOCK);
});

test('BLOCK - 변동성 음수', () => {
  const issue = assessVolatility(-5, 'QQQM', false);
  assert.strictEqual(issue.severity, SAFETY_LEVEL.BLOCK);
});

test('BLOCK - 데이터 관측치 10개 미만(σ 계산 불가 - B1 핵심)', () => {
  const issue = assessDataSufficiency(5, 'QQQM');
  assert.strictEqual(issue.severity, SAFETY_LEVEL.BLOCK);
});

test('PASS - 데이터 관측치 정확히 10개는 BLOCK 경계 밖(>=10)', () => {
  const issue = assessDataSufficiency(10, 'QQQM');
  assert.notStrictEqual(severityOf(issue), SAFETY_LEVEL.BLOCK);
});

test('BLOCK - Inflation이 -100% 이하(실질가치 변환 분모 <= 0)', () => {
  const issueAt = assessInflation(-100);
  const issueBelow = assessInflation(-150);
  assert.strictEqual(issueAt.severity, SAFETY_LEVEL.BLOCK);
  assert.strictEqual(issueBelow.severity, SAFETY_LEVEL.BLOCK);
});

test('PASS(BLOCK 아님) - Inflation -1%는 디플레이션 시나리오로 수학적으로 가능(조건부승인 4-3)', () => {
  const issue = assessInflation(-1);
  assert.notStrictEqual(severityOf(issue), SAFETY_LEVEL.BLOCK);
  assert.strictEqual(issue.severity, SAFETY_LEVEL.WARNING); // 이례적이라 WARNING이나 BLOCK은 아님
});

/* ---------------- B3 후속수정 - 개별 음수 비중 (합계 tolerance를 우회하는 케이스) ---------------- */

test('B3후속 1 - [-20, 120](합=100, tolerance 통과)도 개별 음수 때문에 BLOCK되어야 한다', () => {
  const issues = assessOneRegion([-20, 120]);
  assert.ok(issues.some((i) => i.severity === SAFETY_LEVEL.BLOCK && i.code === 'SAFETY_NEGATIVE_WEIGHT'), JSON.stringify(issues));
});

test('B3후속 2 - [-1, 101](합=100)도 개별 음수 때문에 BLOCK되어야 한다', () => {
  const issues = assessOneRegion([-1, 101]);
  assert.ok(issues.some((i) => i.severity === SAFETY_LEVEL.BLOCK && i.code === 'SAFETY_NEGATIVE_WEIGHT'), JSON.stringify(issues));
});

test('B3후속 3 - [0, 100](0%는 정상 허용)은 PASS여야 한다', () => {
  const issues = assessOneRegion([0, 100]);
  assert.strictEqual(issues.length, 0, JSON.stringify(issues));
});

test('B3후속 4 - [50, 50]은 PASS여야 한다', () => {
  const issues = assessOneRegion([50, 50]);
  assert.strictEqual(issues.length, 0, JSON.stringify(issues));
});

test('B3후속 5 - [99, 1](합=100)은 PASS여야 한다', () => {
  const issues = assessOneRegion([99, 1]);
  assert.strictEqual(issues.length, 0, JSON.stringify(issues));
});

test('B3후속 6 - [60, 60](합=120, 기존 합계 정책대로) BLOCK되어야 한다 - 이번 수정과 무관하게 유지', () => {
  const issues = assessOneRegion([60, 60]);
  assert.ok(issues.some((i) => i.severity === SAFETY_LEVEL.BLOCK && i.code === 'SAFETY_WEIGHT_SUM'), JSON.stringify(issues));
  assert.ok(!issues.some((i) => i.code === 'SAFETY_NEGATIVE_WEIGHT'), '음수가 없는데 SAFETY_NEGATIVE_WEIGHT가 잘못 발생함');
});

test('B3후속 7 - 정상 입력(음수 없음, 합계 정상)에서 기존 동작 무손상', () => {
  const issues = assessOneRegion([30, 30, 40]);
  assert.strictEqual(issues.length, 0, JSON.stringify(issues));
});

test('assessIndividualWeightSigns 단독 - 음수 하나만 있어도 그 항목만 BLOCK(합계 검사와 독립적으로 동작)', () => {
  const issues = assessIndividualWeightSigns([{ owner: '와이프', region: '해외', label: 'QQQM', pct: -5 }]);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, SAFETY_LEVEL.BLOCK);
  assert.strictEqual(issues[0].code, 'SAFETY_NEGATIVE_WEIGHT');
  assert.ok(issues[0].message.includes('-5'), '메시지에 원본 음수값이 그대로 인용되어야 한다(값 변경 없음)');
});

test('assessIndividualWeightSigns - pct=0은 절대 BLOCK하지 않는다(0%는 정상)', () => {
  assert.strictEqual(assessIndividualWeightSigns([{ owner: 'A', region: '국내', label: 'X', pct: 0 }]).length, 0);
});

/* ---------------- WARNING (BLOCK으로 격상되지 않아야 함 - 조건부승인 핵심 지적사항) ---------------- */

test('WARNING(BLOCK 아님) - 기대수익률 100%는 강한 WARNING + 재확인 권장일 뿐 BLOCK이 아니다', () => {
  const issue = assessExpectedReturn(100, 'QQQM');
  assert.strictEqual(issue.severity, SAFETY_LEVEL.WARNING);
  assert.strictEqual(issue.requiresConfirmation, true);
});

test('WARNING(BLOCK 아님) - Contribution Growth 50%는 계산 자체는 허용(조건부승인 4-2 - BLOCK 후보 취소됨)', () => {
  const issue = assessContributionGrowth(50);
  assert.strictEqual(issue.severity, SAFETY_LEVEL.WARNING);
  assert.notStrictEqual(issue.severity, SAFETY_LEVEL.BLOCK);
});

test('Contribution Growth 계층 분류 - 0~5 PASS, 5~10 WARNING, 10~20 WARNING(강), 20+ WARNING(매우 강)', () => {
  assert.strictEqual(assessContributionGrowth(3), null);
  assert.strictEqual(severityOf(assessContributionGrowth(7)), SAFETY_LEVEL.WARNING);
  assert.strictEqual(severityOf(assessContributionGrowth(15)), SAFETY_LEVEL.WARNING);
  assert.strictEqual(severityOf(assessContributionGrowth(25)), SAFETY_LEVEL.WARNING);
});

test('WARNING - Fee UNKNOWN(미설정) - isExplicitlySet=false', () => {
  const issues = assessFee(undefined, 'QQQM', false);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].code, 'SAFETY_FEE_UNKNOWN');
  assert.strictEqual(issues[0].severity, SAFETY_LEVEL.WARNING);
});

test('PASS - Fee 명시적으로 0% 설정 - UNKNOWN과 구분되어야 함(F. 핵심 요구사항)', () => {
  const issues = assessFee(0, 'QQQM', true);
  assert.strictEqual(issues.length, 0, '명시적 0%는 UNKNOWN 경고가 없어야 한다');
});

test('WARNING - 공통거래일 부족으로 상관계수 0 대체', () => {
  const issue = assessCorrelationPair(5, 'A', 'B');
  assert.strictEqual(issue.severity, SAFETY_LEVEL.WARNING);
});

test('PASS - 공통거래일 충분(>=10)하면 상관계수 관련 issue 없음', () => {
  const issue = assessCorrelationPair(200, 'A', 'B');
  assert.strictEqual(issue, null);
});

test('WARNING/INFO - PSD correction 규모별 등급(큰 보정 vs 경미한 보정)', () => {
  const large = assessPSDCorrection({ psdCorrectionApplied: true, minEigenvalueBefore: -0.2 });
  const mild = assessPSDCorrection({ psdCorrectionApplied: true, minEigenvalueBefore: -0.001 });
  const none = assessPSDCorrection({ psdCorrectionApplied: false, minEigenvalueBefore: -0.2 });
  assert.strictEqual(large.severity, SAFETY_LEVEL.WARNING);
  assert.strictEqual(mild.severity, SAFETY_LEVEL.INFO);
  assert.strictEqual(none, null);
});

test('WARNING - 낮은 iteration + 극단 goalProbability', () => {
  const issue = assessSimulationConfidence(5000, { 1000000000: 0.99 });
  assert.strictEqual(issue.severity, SAFETY_LEVEL.WARNING);
});

test('PASS - 충분한 iteration이면 극단 goalProbability라도 경고 없음', () => {
  const issue = assessSimulationConfidence(50000, { 1000000000: 0.99 });
  assert.strictEqual(issue, null);
});

/* ---------------- INFO / Result Safety - 값 변경 없이 설명만 ---------------- */

test('INFO - P10/P90 스프레드가 매우 넓어도 severity는 BLOCK/WARNING이 아니라 INFO(계산오류로 판단 금지)', () => {
  const issue = assessResultSpread(1000000, 5000000, 50000000); // 50배 스프레드
  assert.strictEqual(issue.severity, SAFETY_LEVEL.INFO);
});

test('explainResultAlwaysOn은 입력과 무관하게 항상 INFO 설명을 반환한다(조건 없음)', () => {
  const issue = explainResultAlwaysOn();
  assert.strictEqual(issue.severity, SAFETY_LEVEL.INFO);
  assert.ok(issue.message.length > 0);
});

/* ---------------- Schema / combineSeverity ---------------- */

test('combineSeverity - BLOCK이 하나라도 있으면 전체 상태는 BLOCK', () => {
  const issues = [
    { severity: SAFETY_LEVEL.INFO }, { severity: SAFETY_LEVEL.WARNING }, { severity: SAFETY_LEVEL.BLOCK }
  ];
  assert.strictEqual(combineSeverity(issues), SAFETY_LEVEL.BLOCK);
});

test('buildSafetyResult - computable은 status===BLOCK일 때만 false', () => {
  const withBlock = buildSafetyResult([{ severity: SAFETY_LEVEL.BLOCK }], [], []);
  const withWarningOnly = buildSafetyResult([{ severity: SAFETY_LEVEL.WARNING }], [], []);
  assert.strictEqual(withBlock.computable, false);
  assert.strictEqual(withWarningOnly.computable, true);
});

test('buildSafetyResult - dataQuality/modelRisk가 top-level status에도 반영된다', () => {
  const result = buildSafetyResult([], [{ severity: SAFETY_LEVEL.BLOCK }], []);
  assert.strictEqual(result.status, SAFETY_LEVEL.BLOCK);
  assert.strictEqual(result.dataQuality.status, SAFETY_LEVEL.BLOCK);
});

/* ---------------- 값 불변성(Safety Layer가 절대 값을 바꾸지 않는다는 것의 실측 증거) ---------------- */

test('Safety Layer는 입력값을 절대 변경하지 않는다 - 메시지에 원본 값이 그대로 인용되는지 확인', () => {
  const returnPct = 137.5; // 임의의 극단값
  const issue = assessExpectedReturn(returnPct, 'TEST');
  assert.ok(issue.message.includes('137.5'), '메시지에 원본 입력값이 변형 없이 그대로 인용되어야 한다');
});
