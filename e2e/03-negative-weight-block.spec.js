// E2E-03 Negative Weight BLOCK - Phase 3-5에서 발견된 실제 결함(합계는 100%인데 개별 비중이 음수인
// 경우 - 예: -20% + 120% = 100%)에 대한 회귀 테스트. 이 상태는 실제 UI 타이핑으로는 만들 수 없다
// (js/04의 change 핸들러가 즉시 0~100으로 clamp함) - JSON 복원/클라우드 동기화처럼 UI를 거치지 않는
// 경로로만 발생할 수 있으므로, fixtures.js의 state 직접 세팅으로 그 경로를 그대로 재현한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('개별 비중 음수(-20%+120%=100%) -> 합계는 맞아도 BLOCK되어야 한다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: 'E2E음수자산', pct: -20 },
      { owner: '신랑', region: '국내', name: 'E2E정상자산', pct: 120 },
    ],
  });

  await goToProjectionTab(page);

  const banner = page.locator('#projectionSafetyBlockBanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('음수');

  await page.locator('#mcRunBtn').click();
  const safetyIssues = page.locator('#mcSafetyIssues');
  await expect(safetyIssues).toBeVisible({ timeout: 10000 });
  await expect(safetyIssues).toContainText('음수');
  await expect(page.locator('#mcResultArea')).toBeHidden();
});
