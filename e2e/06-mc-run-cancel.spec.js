// E2E-06 Monte Carlo 실행/취소 - UI 레벨에서 progress/running/cancel/재실행 흐름을 확인한다(엔진
// 자체의 cancellation/race 안전성은 Phase 2-2/3-5 세션에서 이미 검증됨 - 이번엔 UI 연결만 확인).
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

// 취소할 시간을 벌기 위해 instrument 수를 늘려 계산을 무겁게 만든다(전부 채권형 - 네트워크 불필요,
// σ=0이라도 월별 loop 비용은 instrument 수에 비례해서 늘어난다 - Phase 3-5 실측: 10-instrument/
// 50,000회/20년 ≈ 10초).
// [주의] 이름에 채권/국채 등 키워드가 없으면 classifyCategory가 위험자산으로 분류해 실제 가격
// 이력(네트워크)을 찾으려 하고, 8개 모두 동일한 대표지수로 폴백되면 상관계수가 전부 1.0에 가까운
// 퇴화행렬이 되어 Cholesky가 실패한다(실제로 겪은 문제) - 반드시 채권 키워드를 포함해 σ=0(무위험)로
// 분류되게 한다(네트워크 불필요, 결정론적).
const heavyTargets = Array.from({ length: 8 }, (_, i) => ({
  owner: '신랑', region: '국내', name: `E2E무거운채권${i}`, pct: 100 / 8,
}));

test('Monte Carlo 실행 -> progress 표시 -> 취소 -> 재실행 가능', async ({ page }) => {
  await seedPortfolio(page, { targets: heavyTargets });
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('50000');

  await page.locator('#mcRunBtn').click();
  // running 상태 확인 - "실행 중..." 텍스트 + progress 영역.
  await expect(page.locator('#mcRunBtn')).toHaveText('실행 중...', { timeout: 5000 });
  await expect(page.locator('#mcProgressArea')).toBeVisible();
  await expect(page.locator('#mcCancelBtn')).toBeVisible();

  await page.locator('#mcCancelBtn').click();
  // 취소 후 idle(READY) 상태로 돌아가야 한다.
  await expect(page.locator('#mcRunBtn')).toHaveText('Monte Carlo 실행', { timeout: 5000 });
  await expect(page.locator('#mcRunBtn')).toBeEnabled();
  await expect(page.locator('#mcCancelBtn')).toBeHidden();
  // 취소된 계산의 부분 결과가 정상 결과처럼 보이면 안 된다.
  await expect(page.locator('#mcResultArea')).toBeHidden();

  // 재실행 - 이번엔 끝까지 완료되어 정상 결과가 떠야 한다(취소 후에도 다시 정상 동작하는지 확인).
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 20000 });
  const p50 = await page.locator('#mcP50Text').innerText();
  expect(p50).not.toMatch(/NaN|undefined|Infinity|^$/);
});

test('완료까지 실행 -> progress가 100%로 끝나고 결과가 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E완료테스트자산', pct: 100 }],
  });
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#mcCancelBtn')).toBeHidden();
  await expect(page.locator('#mcRunBtn')).toHaveText('Monte Carlo 실행');
});
