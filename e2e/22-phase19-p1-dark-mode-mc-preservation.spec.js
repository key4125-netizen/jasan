// E2E-22 Phase 19-P1 회귀 - Monte Carlo 결과가 표시된 상태에서 Dark Mode를 전환해도 결과가 "실행 전"
// 상태로 리셋되지 않고 그대로 유지되어야 한다. Phase 19 통합 검증에서 발견된 P1: darkModeBtn 핸들러가
// 차트 재도색을 위해 호출하는 updateProjection()이 마지막에 항상 resetMonteCarloUiToReady()를 실행해
// 완료된 MC 결과까지 지워버렸다 - Phase 19-P1에서 updateProjection(preserveMcResult) 가드를 추가해
// 다크모드 토글 호출(darkModeBtn)만 이 리셋을 건너뛰도록 고쳤다(js/05, js/14). 이 테스트는 그 수정이
// 이후 세션에서 다시 깨지지 않는지 지키는 최소 회귀다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('Monte Carlo 실행 완료 후 Dark Mode를 전환해도 결과가 리셋되지 않고 P50이 그대로 유지된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E다크모드채권', pct: 100 }],
    projection: { inflationRate: 2.5, contributionGrowthRate: 0, monthlyContribution: 3000000 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const p50Before = await page.locator('#mcP50Text').innerText();
  expect(p50Before).not.toMatch(/NaN|undefined|Infinity|^$/);

  // Dark Mode 전환 - 결과가 리셋(및 재실행)되지 않고 그대로 유지되어야 한다.
  await page.locator('#darkModeBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible();
  // 재실행되었다면 반드시 거쳐가는 "실행 중" 진행률 영역이 계속 숨김 상태여야
  // "결과를 다시 계산하지 않고 그대로 보여준 것"임을 확인할 수 있다.
  await expect(page.locator('#mcProgressArea')).toBeHidden();
  expect(await page.locator('#mcP50Text').innerText()).toBe(p50Before);

  // Light Mode로 복귀해도 계속 유지되어야 한다.
  await page.locator('#darkModeBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible();
  await expect(page.locator('#mcProgressArea')).toBeHidden();
  expect(await page.locator('#mcP50Text').innerText()).toBe(p50Before);
});
