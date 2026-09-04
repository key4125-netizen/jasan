/* -------------------------------------------------------------------------
 * 30. Inflation Transformation Layer (Phase 3-1) - 명목(nominal) → 실질(real) 순수 변환
 *    - [범위] 이 파일은 Monte Carlo 결과(js/15)나 결정론적 미래가치 계산(js/05)을 전혀 건드리지
 *      않는다 - 이미 계산된 명목(nominal) 금액을 사후에 실질가치로 "변환"만 하는 별도 레이어다.
 *      DOM/state 접근 없음, Worker 의존 없음 - 순수 함수만 있다.
 *    - [적용 순서 확정] 명목 수익률 → Monte Carlo → 명목 미래자산 → (이 레이어) → 실질 미래자산.
 *      수익률 자체에서 인플레이션을 차감해 Monte Carlo를 다시 돌리는 방식은 쓰지 않는다 - Phase 0~2에서
 *      검증된 확률모형(μ_GBM, σ, 상관관계, Cholesky, 월별 처리, 연 1회 리밸런싱)은 그대로 유지된다.
 *    - [Method A vs B 검토 결과] js/15는애초에 "월별 전체 경로"를 저장하지 않고 milestone(5/10/15/20년)
 *      스냅샷만 보존한다(메모리 절약 설계, Phase 1). 그래서 "경로 전체를 변환"과 "각 milestone을 각자의
 *      연차로 독립 변환"은 이 엔진 구조에서 사실상 같은 것이다 - milestone이 유일하게 존재하는 시점
 *      데이터이기 때문이다. 따라서 이 레이어는 각 milestone을 자신의 year 값으로 독립적으로 변환한다
 *      (Method B를 milestone 단위로 적용한 것과 동일 - "최종 시점 하나만 변환"하는 Method A보다 더
 *      일반적이고, 5/10/15/20년 전부 실질가치를 볼 수 있어 사용자에게 더 유용하다).
 * ---------------------------------------------------------------------- */

// Real = Nominal / (1+i)^t. i=0이면 항상 nominal과 exact 동일(회귀 테스트 A).
function convertNominalToReal(nominalValue, annualInflationRate, years) {
  return nominalValue / Math.pow(1 + annualInflationRate, years);
}
// 역변환 - "실질(오늘 구매력) 목표금액"을 시뮬레이션이 요구하는 "명목 목표금액"으로 미리 환산할 때 쓴다
// (아래 목표금액 처리 설명 참고). Engine의 goalAmounts는 항상 명목 기준으로만 해석된다 - 이 함수로
// 호출 전에 미리 변환해서 넘기면 Engine을 전혀 손대지 않고도 "실질 목표 달성확률"을 얻을 수 있다.
function convertRealToNominal(realValue, annualInflationRate, years) {
  return realValue * Math.pow(1 + annualInflationRate, years);
}

// 퍼센타일 변환은 같은 양수 상수로 전부 나누는 것뿐이라 순서가 항상 보존된다(회귀 테스트 D) -
// p10<p25<p50<p75<p90 이면 real도 그대로 real_p10<real_p25<...<real_p90.
// [goalProbability는 여기서 다루지 않는다] milestone.goalProbability는 이미 "명목 목표금액 하나"
// 기준으로 계산이 끝난 확률값이라, 사후에 실질로 재해석할 수 있는 정보(원표본)가 남아있지 않다.
// "실질 목표금액 기준 달성확률"이 필요하면, 시뮬레이션을 실행하기 "전에" convertRealToNominal로
// 목표금액 자체를 명목으로 환산해 goalAmounts에 넣어야 한다(Phase 3-2 UI/어댑터에서 처리 - Engine
// 계산 자체는 그대로 둔 채 입력만 미리 바꾸는 방식이라 이 레이어와 완전히 독립적이다).
function applyInflationToMilestone(milestone, annualInflationRate) {
  const t = milestone.year;
  const real = {
    mean: convertNominalToReal(milestone.mean, annualInflationRate, t),
    p10: convertNominalToReal(milestone.p10, annualInflationRate, t),
    p25: convertNominalToReal(milestone.p25, annualInflationRate, t),
    p50: convertNominalToReal(milestone.p50, annualInflationRate, t),
    p75: convertNominalToReal(milestone.p75, annualInflationRate, t),
    p90: convertNominalToReal(milestone.p90, annualInflationRate, t)
  };
  // [기존 필드 보존] milestone을 그대로 복사하고 real만 추가한다 - 기존 p10~p90/goalProbability는
  // 손대지 않는다(호환성 유지, 요청 반영).
  return Object.assign({}, milestone, { real });
}

// result: js/15 runMonthlyPrecisionMC/runAnnualPreviewMC의 반환 객체. 원본을 변경하지 않고 milestones만
// 교체한 새 객체를 반환한다(순수 함수 - 같은 입력엔 항상 같은 출력, 부작용 없음).
function applyInflationToResult(result, annualInflationRate) {
  return Object.assign({}, result, {
    milestones: result.milestones.map((m) => applyInflationToMilestone(m, annualInflationRate))
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { convertNominalToReal, convertRealToNominal, applyInflationToMilestone, applyInflationToResult };
}
