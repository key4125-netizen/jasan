// E2E-11 미래자산 예측 화면 초보자 UX 개선 - 신규 "현재/매달/N년후" 히어로 요약 카드, 가정 아코디언,
// Monte Carlo percentile 재표현, Goal Probability 안내 문구를 검증한다. 이번 스펙은 특히 "계산 엔진
// 결과 == UI 표시값"을 직접 대조한다 - 기대값을 하드코딩하지 않고, 앱 자신의 계산 함수(simulateRebalancedPreset/
// getHouseholdMonthlyContributionTotal/fmtKRWShort)를 page.evaluate로 그대로 호출해 얻은 값과
// 렌더링된 텍스트를 비교한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab, goToPortfolioSettingsTab } = require('./fixtures');

test('히어로 요약 카드(현재 자산/매달 투자/20년 후 예상 자산)가 엔진 계산 결과와 정확히 일치한다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
    projection: { inflationRate: 2.5, contributionGrowthRate: 0, monthlyContribution: 3000000 },
  });
  await goToProjectionTab(page);

  const expected = await page.evaluate(() => {
    const result = simulateRebalancedPreset('normal', 20);
    const points = result.yearlyPoints;
    return {
      current: fmtKRWShort(points[0].total),
      future: fmtKRWShort(points[20].total),
      monthly: `${fmtKRWShort(getHouseholdMonthlyContributionTotal())}/월`,
    };
  });

  await expect(page.locator('#projectionHeroCurrent')).toHaveText(expected.current);
  await expect(page.locator('#projectionHeroFuture')).toHaveText(expected.future);
  await expect(page.locator('#projectionHeroMonthly')).toHaveText(expected.monthly);
  // [FUTURE-P1 Phase 3-2] "예상 자산"은 이 값을 미래 예측/보장으로 읽히게 한다 - 수익률이 매년
  // 일정하다고 가정한 단일 경로 계산값이라는 성격을 라벨에 그대로 드러낸다(금액 계산은 무변경).
  await expect(page.locator('#projectionHeroFutureLabel')).toHaveText('20년 후 자산 참고값 (일반적 수익률 적용)');

  // [장기 투자계획 UX 개선] 아코디언을 펼치지 않아도 "투자 기간"·"연도별 추가 투자"가 바로 보여야 한다.
  // [기대값 갱신 사유 · 통합 개선 배치 2026-09-22 · §54-4] "매년 투자금 증가율"이 사용자 입력에서
  // 제거되고 "연도별 추가 투자"로 바뀌었다(PM 지시문 §10-1). 아무것도 넣지 않았으므로 "없음"이다.
  await expect(page.locator('#projectionPlanYearsText')).toHaveText('20년');
  await expect(page.locator('#projectionPlanGrowthText')).toHaveText('없음');

  // 확정적 표현("~입니다")이 아니라 가정 기반 계산임을 알리는 문구가 있어야 한다.
  // [FUTURE-P1 Phase 3-2] 여기서 한 걸음 더 나아가, ① 이 값이 "수익률이 매년 일정하다"는 가정의
  // 단순 계산이라는 점 ② 대상 범위가 일반계좌라는 점 ③ 변동성은 Monte Carlo에서 봐야 한다는 점을
  // 히어로 안에서 직접 읽을 수 있어야 한다(참고값으로 격하한 근거를 화면에서 설명한다).
  const heroText = await page.locator('#projectionHeroSummary').innerText();
  expect(heroText).toContain('매년 일정하다고 가정한 단순 계산값');
  expect(heroText).toContain('일반계좌 기준');
  expect(heroText).toContain('Monte Carlo에서 확인');
});

// [기대값 갱신 사유 · PM 결정 2 확정 2026-09-22 · §54-4] 예전 이 테스트는 "증가율을 바꾸면 히어로
// 예상 자산이 함께 바뀐다"를 고정했다. 증가율 입력이 "연도별 추가 투자"로 바뀌었고, PM 결정 2로
// **결정론 시나리오 카드에도 반영**하기로 확정됐다(MC와 같은 입력원 · 같은 시점 규칙).
// 그래서 검증 내용은 원래 의도 그대로다 - "투자금 입력을 바꾸면 히어로 예상 자산이 함께 바뀐다".
test('연도별 추가 투자를 저장하면 요약 한 줄과 히어로 예상 자산이 함께 바뀐다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
    projection: { inflationRate: 2.5, monthlyContribution: 3000000 },
  });
  await goToProjectionTab(page);

  const futureBefore = await page.locator('#projectionHeroFuture').innerText();
  const currentBefore = await page.locator('#projectionHeroCurrent').innerText();
  await expect(page.locator('#projectionPlanGrowthText')).toHaveText('없음');

  // [v248-1 REQ-03] [투자금 설정]은 포트폴리오 설정 탭의 "일반계좌 적립계획" 카드에 있다.
  await goToPortfolioSettingsTab(page);
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
  await page.locator('#yearlyExtraContributionAddBtn').click();
  const nextYear = await page.evaluate(() => new Date().getFullYear() + 1);
  await page.locator('#yearlyExtraContributionList input[data-yearly-extra-year="0"]').fill(String(nextYear));
  await page.locator('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]').fill('10000000');
  await page.locator('#saveMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
  expect(await page.evaluate(() => state.projection.yearlyExtraContributions))
    .toEqual([{ year: nextYear, amount: 10000000 }]);
  await goToProjectionTab(page);

  // [v248-1 REQ-01] "이 계산은 이런 가정을 사용했어요" 목록은 삭제됐다 - 아래 한 줄 요약으로 확인한다.
  await expect(page.locator('#projectionAssumptionsList')).toHaveCount(0);
  await expect(page.locator('#projectionPlanGrowthText')).toHaveText('1개 연도 1,000만원');
  // [PM 결정 2] 히어로 예상 자산이 실제로 늘어나고, 그 값은 엔진 계산 결과와 정확히 같다.
  const expectedAfter = await page.evaluate(() => fmtKRWShort(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total));
  await expect(page.locator('#projectionHeroFuture')).toHaveText(expectedAfter);
  expect(await page.locator('#projectionHeroFuture').innerText()).not.toBe(futureBefore);
  // 현재 자산은 바뀌지 않는다(추가 투자가 지금 잔고에 합산되면 안 된다).
  await expect(page.locator('#projectionHeroCurrent')).toHaveText(currentBefore);
});

test('Monte Carlo 결과 - percentile이 초보자용 표현으로 바뀌고, 표시값은 엔진 결과와 동일하다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권2', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  // 전문용어(P10/P25/P50/P75)가 큰 표 헤더로 그대로 노출되지 않고, 초보자 표현으로 바뀌어야 한다.
  // (이 탭에는 표가 여러 개라 mcMilestoneTableBody를 담은 table로 범위를 좁힌다.)
  const headerText = await page.locator('table:has(#mcMilestoneTableBody) thead').innerText();
  // [v250] 표 명칭(PM 지정): 초약세 P10 · 약세 P25 · 보통 P50 · 강세 P75
  ['초약세', '약세', '보통', '강세'].forEach((word) => expect(headerText).toContain(word));
  // [FUTURE-P1 Phase 3-2] 원래 이름을 title 속성에만 두던 방식은 터치 기기에서 아예 전달되지 않았다 -
  // 쉬운 말을 주 라벨로 두되 원래 이름도 실제 화면 텍스트로 함께 적는다.
  expect(headerText).toMatch(/\bP10\b/);
  expect(headerText).toMatch(/\bP25\b/);
  expect(headerText).toMatch(/\bP50\b/);
  // [MC 표시 정책 ④ - PM 승인] P90은 계산에는 남기고 화면에서만 뺐다(옛 "높은 편" 열 제거).
  expect(headerText).not.toMatch(/\bP90\b/);
  expect(headerText).not.toContain('높은 편');

  // [v250] 표 아래 장문 해설은 PM 지시로 삭제하고 지정 문장 한 줄만 둔다. "최악의 경우" 같은 단정 표현도 없어야 한다.
  const bodyText = await page.locator('#mcResultArea').innerText();
  expect(bodyText).toContain('각 칸의 아래쪽 회색 숫자는 현재가치 기준 금액');
  expect(bodyText).not.toContain('최악의 경우');
  expect(bodyText).not.toContain('결과를 작은 금액부터 줄 세웠을 때');

  // 표의 마지막(20년후) 행 "중간 수준" 칸 값이 상단 큰 박스(P50, 명목가치)와 동일해야 한다(같은
  // last.p50 값을 두 곳에서 그대로 재사용한다는 것을 실측으로 확인).
  const lastRowText = await page.locator('#mcMilestoneTableBody tr').last().innerText();
  const p50BoxText = await page.locator('#mcP50Text').innerText();
  expect(lastRowText).toContain(p50BoxText);
});

test('목표 달성 가능성 - 문구가 확정적 표현 없이 가정 기반임을 알리고, 계산값 자체는 정상 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권3', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);
  await page.locator('#mcGoalAmountInput').fill('100000000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const goalText = await page.locator('#mcGoalArea').innerText();
  expect(goalText).not.toMatch(/NaN|undefined|Infinity/);
  expect(goalText).toContain('목표에 도달할 가능성');
  // [v250] 확률 아래 짧은 부연 설명은 PM 지시로 뺐다 - "가정 기반의 비율"이라는 설명은 맨 위 ⓘ 팝업의 항상-on 안내로 확인한다.
  expect(goalText).not.toContain('현재 설정을 기준으로 한 시뮬레이션 결과예요');
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModalBody')).toContainText('목표 달성 확률의 의미');
  await expect(page.locator('#mcInfoModalBody')).toContainText('목표금액 이상에 도달한 경로의 비율');
  await page.locator('#closeMcInfoModalBtn').click();
  // 금지 표현("확률로 벌 수 있다" 등 확정적 서술)이 없어야 한다.
  expect(goalText).not.toMatch(/확률로.*벌 수 있습니다|정확히 \d+%/);
});

test('명목가치/실질가치 구분 문구가 표시되고, 가정 아코디언이 정상적으로 열리고 닫힌다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권4', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const p50BoxText = await page.locator('.text-center.rounded-lg.bg-brand-50').innerText();
  expect(p50BoxText).toContain('명목가치(미래 시점 금액)');
  // [FUTURE-P1 Phase 3-2] "실질"이라고만 쓰지 않고 어떤 물가상승률을 가정했는지 함께 밝힌다
  // (값 자체는 js/20의 기존 변환 그대로 - 계산 무변경).
  expect(p50BoxText).toContain('현재가치 기준(물가상승률 2.5% 가정)');

  // [v248-1 REQ-01] 가정 아코디언("이 계산은 이런 가정을 사용했어요")은 PM 지시로 삭제됐다 - 접힘 UI가 없고,
  // 투자 기간 · 성장률 · 인플레이션은 히어로의 한 줄 요약에서, 인플레이션 수정은 MC 카드에서 계속 보인다.
  await expect(page.locator('#projectionAssumptionsAccordionBtn')).toHaveCount(0);
  await expect(page.locator('#projectionAssumptionsAccordionBody')).toHaveCount(0);
  await expect(page.locator('#projectionHeroSummary')).not.toContainText('세부 항목 보기');
  await expect(page.locator('#projectionPlanYearsText')).toHaveText('20년');
  await expect(page.locator('#projectionPlanRateText')).toHaveText(/%$/);
  await expect(page.locator('#projectionPlanInflationText')).toHaveText('2.5%');
  await expect(page.locator('#projectionInflationSummary')).toHaveText('2.5%');
});
