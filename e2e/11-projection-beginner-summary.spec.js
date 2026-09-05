// E2E-11 미래자산 예측 화면 초보자 UX 개선 - 신규 "현재/매달/N년후" 히어로 요약 카드, 가정 아코디언,
// Monte Carlo percentile 재표현, Goal Probability 안내 문구를 검증한다. 이번 스펙은 특히 "계산 엔진
// 결과 == UI 표시값"을 직접 대조한다 - 기대값을 하드코딩하지 않고, 앱 자신의 계산 함수(simulateRebalancedPreset/
// getHouseholdMonthlyContributionTotal/fmtKRWShort)를 page.evaluate로 그대로 호출해 얻은 값과
// 렌더링된 텍스트를 비교한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

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
  await expect(page.locator('#projectionHeroFutureLabel')).toHaveText('20년 후 예상 자산');

  // [장기 투자계획 UX 개선] 아코디언을 펼치지 않아도 "투자 기간"·"투자금 증가"가 바로 보여야 한다
  // (contributionGrowthRate: 0으로 시딩했으므로 "증가 없음"으로 표시되어야 한다).
  await expect(page.locator('#projectionPlanYearsText')).toHaveText('20년');
  await expect(page.locator('#projectionPlanGrowthText')).toHaveText('증가 없음(매월 동일)');

  // 확정적 표현("~입니다")이 아니라 가정 기반 계산임을 알리는 문구가 있어야 한다.
  const heroText = await page.locator('#projectionHeroSummary').innerText();
  expect(heroText).toContain('설정한 가정');
  expect(heroText).toContain('실제 투자 결과는 매년 달라질 수 있습니다');
});

test('연간 납입액 증가율 입력을 바꾸면 히어로 요약의 20년 후 예상 자산도 기존 계산 흐름을 통해 함께 바뀐다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
    projection: { inflationRate: 2.5, contributionGrowthRate: 0, monthlyContribution: 3000000 },
  });
  await goToProjectionTab(page);

  const futureBefore = await page.locator('#projectionHeroFuture').innerText();

  await page.locator('#contributionGrowthRateInput').fill('5');
  await page.locator('#contributionGrowthRateInput').dispatchEvent('input');

  const expectedAfter = await page.evaluate(() => fmtKRWShort(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total));
  await expect(page.locator('#projectionHeroFuture')).toHaveText(expectedAfter);
  const futureAfter = await page.locator('#projectionHeroFuture').innerText();
  expect(futureAfter).not.toBe(futureBefore);

  // 가정 목록에도 새 증가율이 반영되어야 한다(같은 state를 읽어 그리므로 항상 동기화됨).
  const assumptionsText = await page.locator('#projectionAssumptionsList').innerText();
  expect(assumptionsText).toContain('5%씩 증가');

  // 아코디언 밖의 "투자 기간·투자금 증가" 한 줄 요약도 같은 state를 읽으므로 함께 바뀌어야 한다.
  await expect(page.locator('#projectionPlanGrowthText')).toHaveText('매년 5%씩');
});

test('Monte Carlo 결과 - percentile이 초보자용 표현으로 바뀌고, 표시값은 엔진 결과와 동일하다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권2', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  // 전문용어(P10/P50/P90)가 큰 표 헤더로 그대로 노출되지 않고, 초보자 표현으로 바뀌어야 한다.
  // (이 탭에는 표가 여러 개라 mcMilestoneTableBody를 담은 table로 범위를 좁힌다.)
  const headerText = await page.locator('table:has(#mcMilestoneTableBody) thead').innerText();
  expect(headerText).toContain('낮은 편');
  expect(headerText).toContain('중간 수준');
  expect(headerText).toContain('높은 편');
  expect(headerText).not.toMatch(/\bP10\b|\bP90\b/);

  // "낮은 편=최악의 경우"처럼 단정하는 표현은 없어야 한다 - 오히려 "그렇지 않다"는 명시적 해명 문구가
  // 있어야 한다(단순 "최악의 경우" 문자열 포함 여부만 보면, 그 표현을 부정하는 정상적인 해명 문장까지
  // 걸러지므로 부적절하다 - 실제로 이 문구가 "~아니며"로 부정되고 있는지까지 함께 확인한다).
  const bodyText = await page.locator('#mcResultArea').innerText();
  expect(bodyText).toMatch(/최악의 경우.{0,20}아니/);

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
  expect(goalText).toContain('현재 설정을 기준으로 한 시뮬레이션 결과예요');
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
  expect(p50BoxText).toContain('현재 구매력 기준(실질가치)');

  // 가정 아코디언: 기본은 접힘(0px) -> 클릭하면 펼쳐짐(내용이 보임) -> 다시 클릭하면 접힘.
  const body = page.locator('#projectionAssumptionsAccordionBody');
  await expect(body).toHaveCSS('max-height', '0px');
  await page.locator('#projectionAssumptionsAccordionBtn').click();
  const openedHeight = await body.evaluate((el) => el.style.maxHeight);
  expect(openedHeight).not.toBe('0px');
  const listText = await page.locator('#projectionAssumptionsList').innerText();
  // [P2 - Phase 9 감사 후속] "투자 기간(미래예측이 몇 년 후를 계산하는가)"과 "적립 기간(신규 월
  // 적립을 몇 년 동안 하는가)"이 서로 다른 개념임을 라벨로 명확히 구분했다 - 둘 다 화면에 보여야 한다.
  expect(listText).toContain('투자 기간(미래예측 기간): 20년');
  expect(listText).toContain('적립 기간(신규 납입 기간)');
  expect(listText).toContain('기준 연간 성장률');
  expect(listText).toContain('물가상승률');
  expect(listText).toContain('Monte Carlo를 실행하면');

  await page.locator('#projectionAssumptionsAccordionBtn').click();
  await expect(body).toHaveCSS('max-height', '0px');
});
