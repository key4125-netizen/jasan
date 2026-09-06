// E2E-05 Inflation nominal/real - Phase 3-5 B2에서 고친 핵심 불변식을 UI 레벨에서 재확인한다.
// nominal Monte Carlo 결과는 inflation 변경에 영향받지 않아야 하고(엔진에 inflation 개념 자체가
// 없음), real(실질가치) 결과만 inflation이 높을수록 낮아져야 한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

// [Phase 25 P1] 인플레이션율 입력은 draft 팝업 안에 있다 - 열기 → 입력 → [확인]이 실제 사용자 경로다.
async function setInflationViaModal(page, value) {
  await page.locator('#projectionAssumptionsAccordionBtn').click();
  await page.locator('#openProjectionAssumptionsBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeVisible();
  await page.locator('#inflationRateInput').fill(value);
  await page.locator('#saveProjectionAssumptionsModalBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeHidden();
}

test('Inflation 2.5% -> 3.5% 변경: nominal P50은 불변, real P50은 감소해야 한다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2EInflation자산', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const nominalAt25 = await page.locator('#mcP50Text').innerText();
  const realAt25 = await page.locator('#mcP50RealText').innerText();

  // 인플레이션만 변경 - 동일 seed(js/19가 고정 seed 사용)이므로 nominal은 완전히 동일해야 한다.
  // [Phase 25 P1] 인플레이션율은 이제 "이 계산은 이런 가정을 사용했어요" > [가정 수정] 팝업 안에서
  // [확인]을 눌러야 반영된다(입력 중 즉시 저장하지 않는다) - 검증 내용은 그대로다.
  await setInflationViaModal(page, '3.5');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const nominalAt35 = await page.locator('#mcP50Text').innerText();
  const realAt35 = await page.locator('#mcP50RealText').innerText();

  expect(nominalAt35).toBe(nominalAt25); // exact invariant - nominal은 inflation과 무관해야 한다.
  // 실질가치는 반드시 텍스트가 달라야 하며(2.5%보다 낮은 값), "억" 단위 숫자를 파싱해 방향까지 확인한다.
  expect(realAt35).not.toBe(realAt25);
  const parseEok = (s) => parseFloat(s.replace(/[^0-9.]/g, ''));
  expect(parseEok(realAt35)).toBeLessThan(parseEok(realAt25));
});

test('목표금액을 실질(현재 구매력 기준) 모드로 설정하면 inflation 변경 시 명목환산 목표가 달라진다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2ERealGoal자산', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcGoalAmountInput').fill('100000000');
  await page.getByRole('radio', { name: '현재 구매력 기준' }).check();
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const goalTextAt25 = await page.locator('#mcGoalArea').innerText();
  expect(goalTextAt25).not.toMatch(/NaN|undefined|Infinity/);
  expect(goalTextAt25).toContain('명목 환산 목표');

  await setInflationViaModal(page, '5');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const goalTextAt5 = await page.locator('#mcGoalArea').innerText();

  // 실질 목표금액(1억, 현재 구매력 기준)은 그대로지만, inflation이 올라가면 그 목표를 만족하는
  // "명목 환산 목표"는 더 커져야 한다(같은 구매력을 미래 화폐가치로 표현하려면 더 큰 금액이 필요).
  expect(goalTextAt5).not.toBe(goalTextAt25);
});
