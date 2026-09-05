// E2E-04 Fee UNKNOWN WARNING - 운용보수 미설정 상태에서는 계산은 허용하되 WARNING이 표시되어야 하고,
// 사용자가 명시적으로 0%를 입력하면 그 경고가 사라져야 한다("미확인"과 "명시적 0%"의 구분, Phase 3-4/3-5).
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('Fee 미설정 -> 계산 허용 + WARNING 표시, Fee=0% 명시 입력 -> WARNING 해소', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2EFee테스트자산', pct: 100 }],
  });
  await goToProjectionTab(page);

  // 1) Fee 미설정 상태로 실행 - 계산은 성공하고 WARNING이 함께 떠야 한다.
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  // [Phase 17 P1-4] "운용보수 미확인"은 결과 해석에 직접 영향을 주는 critical tier로 분류되어 이제
  // mcSafetyCritical(결과 바로 아래, 항상 펼침)에 표시된다 - mcSafetyIssues는 더 이상 정상 완료
  // 경로에서 쓰이지 않는다(BLOCK 전용). 판정 자체(assessFee)는 무변경.
  const safetyIssuesText = await page.locator('#mcSafetyCritical').innerText();
  expect(safetyIssuesText).toContain('운용보수 미확인');
  // 결과 자체는 정상 계산되어야 한다(BLOCK이 아니라 WARNING이므로).
  const p50Before = await page.locator('#mcP50Text').innerText();
  expect(p50Before).not.toMatch(/NaN|undefined|Infinity|^$/);

  // 2) 운용보수를 명시적으로 0%로 입력 - "미확인"과 "명시적 0%"가 구분되어 경고가 사라져야 한다.
  await page.locator('#mcFeeRatesToggleBtn').click();
  const feeRow = page.locator('#mcFeeRatesList').locator('div', { hasText: 'E2EFee테스트자산' }).first();
  await feeRow.locator('input[data-fee-key]').fill('0');
  // blur를 유도해 input 이벤트가 확실히 커밋되도록 한다.
  await page.locator('#mcFeeRatesToggleBtn').click();

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const safetyIssuesTextAfter = await page.locator('#mcSafetyCritical').innerText().catch(() => '');
  expect(safetyIssuesTextAfter).not.toContain('운용보수 미확인');
});
