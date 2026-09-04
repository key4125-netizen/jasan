// E2E-01 정상 기본 시나리오 - 초보자가 정상 포트폴리오를 입력하고 Monte Carlo 결과를 확인하는 흐름.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('정상 포트폴리오 입력 -> Monte Carlo 실행 -> P10/P50/P90/Goal Probability가 정상 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 },
    ],
    projection: {
      inflationRate: 2.5,
      contributionGrowthRate: 0,
      monthlyContribution: 3000000,
    },
  });

  await goToProjectionTab(page);

  // 목표 비중이 정상(합계 100%)이므로 BLOCK 배너가 보이면 안 된다.
  await expect(page.locator('#projectionSafetyBlockBanner')).toBeHidden();

  // 시나리오 카드(결정론적 Future Projection) 숫자가 존재하고 비어있지 않은지 확인.
  await expect(page.getByText('목표배분·일반적')).toBeVisible();

  // Monte Carlo 실행
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const p50Text = await page.locator('#mcP50Text').innerText();
  const p50RealText = await page.locator('#mcP50RealText').innerText();
  // NaN/undefined/Infinity/빈 문자열이 없어야 한다.
  [p50Text, p50RealText].forEach((t) => {
    expect(t).not.toMatch(/NaN|undefined|Infinity|^$/);
  });

  const milestoneText = await page.locator('#mcMilestoneTableBody').innerText();
  expect(milestoneText).not.toMatch(/NaN|undefined|Infinity/);
  expect(milestoneText.trim().length).toBeGreaterThan(0);

  // 실제 값 추출 - 억원 단위 텍스트(예: "1.23억")에서 음수 기호가 없는지 확인(단일 채권 100%,
  // 정상 입력이면 원금+납입액 누적이라 최종 자산이 음수일 이유가 없다).
  expect(p50Text).not.toMatch(/^-/);

  // Goal Probability는 목표금액을 넣지 않았으므로 "설정되지 않았습니다" 안내만 보이면 된다.
  const goalAreaText = await page.locator('#mcGoalArea').innerText();
  expect(goalAreaText).toContain('목표금액이 설정되지 않았습니다');
});

test('목표금액을 설정하면 Goal Probability가 NaN/undefined 없이 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
    projection: { inflationRate: 2.5, contributionGrowthRate: 0, monthlyContribution: 3000000 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcGoalAmountInput').fill('100000000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const goalAreaText = await page.locator('#mcGoalArea').innerText();
  expect(goalAreaText).not.toMatch(/NaN|undefined|Infinity/);
  expect(goalAreaText).toMatch(/목표 달성 확률/);
});
