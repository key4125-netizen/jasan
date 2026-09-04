// E2E-02 Weight Sum BLOCK - 목표 비중 합계가 100%가 아니면(예: 60%+30%=90%) 계산 시작 전 BLOCK되어야
// 한다(Phase 3-5 Safety Layer). Deterministic(Future Projection)과 Monte Carlo 양쪽 모두 확인한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('비중 합계 90%(60%+30%) -> Deterministic 배너 BLOCK + Monte Carlo도 BLOCK', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: 'E2E자산A', pct: 60 },
      { owner: '신랑', region: '국내', name: 'E2E자산B', pct: 30 },
    ],
  });

  await goToProjectionTab(page);

  // Deterministic 경로 - updateProjection()이 계산을 시작하기 전에 배너만 보여줘야 한다.
  const banner = page.locator('#projectionSafetyBlockBanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('목표 비중');

  // Monte Carlo 경로 - 실행 버튼을 눌러도 계산이 시작되지 않고 동일한 종류의 BLOCK이 떠야 한다.
  await page.locator('#mcRunBtn').click();
  const safetyIssues = page.locator('#mcSafetyIssues');
  await expect(safetyIssues).toBeVisible({ timeout: 10000 });
  await expect(safetyIssues).toContainText('차단');

  // 잘못된 결과로 mcResultArea가 갱신되면 안 된다(계산 자체가 시작되지 않았으므로 여전히 숨김 상태).
  await expect(page.locator('#mcResultArea')).toBeHidden();
});
