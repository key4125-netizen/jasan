// E2E-30 Phase 25 - 입력 UI UX 표준화(draft → 취소/확인) 전용 회귀.
//
// [핵심 계약] 사용자의 자산·투자계획·미래예측에 영향을 주는 값은 입력 중 실제 state와
// localStorage를 건드리지 않고, [확인]을 눌러 validation을 통과한 뒤에만 반영된다. [취소]는
// 아무 것도 바꾸지 않는다. 이 파일은 그 계약이 실제로 지켜지는지를 "state 비교"와
// "localStorage 원문 비교" 두 축으로 확인한다 - 화면 표시만 보고 통과시키지 않는다.
//
// [시드] 외부 시세 API에 의존하지 않도록 티커 없는 자산만 쓴다(Phase 23-R에서 이 환경의 외부
// 조회가 막혀 있음이 규명됐다).
const { test, expect } = require('@playwright/test');

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E30일반채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW' }),
      makeAsset({ name: 'E2E30ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', isDomestic: '국내', quantity: 1, buyPrice: 50000000, currentPrice: 50000000, currency: 'KRW' })
    ];
    persistAssets();
    state.projection.inflationRate = 2.5;
    state.projection.contributionGrowthRate = 0;
    state.projection.taxAdvantagedPlan.contributionByOwnerAccount = { '신랑': [], '와이프': [] };
    state.projection.taxAdvantagedPlan.allocationByOwner = { '신랑': [], '와이프': [] };
    persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('미래 예측', { exact: true }).click();
}

const readProjectionLS = (page) => page.evaluate(() => localStorage.getItem('sam_projection_v1'));
const readTaxPlan = (page) => page.evaluate(() => JSON.stringify(state.projection.taxAdvantagedPlan));

test('1. 절세계좌 팝업을 열기만 하고 취소하면 state도 localStorage도 전혀 바뀌지 않는다', async ({ page }) => {
  await seed(page);
  const lsBefore = await readProjectionLS(page);
  const planBefore = await readTaxPlan(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeVisible();
  // 예전엔 "열기만 해도" 계좌 기본값이 시드되며 persistProjection()이 실행됐다.
  await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeHidden();
  expect(await readTaxPlan(page)).toBe(planBefore);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('2. 절세계좌 적립금액을 바꾼 뒤 취소하면 기존값이 그대로 복원된다', async ({ page }) => {
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  const amount = page.locator('#taxAdvantagedPlanModal input[data-contrib-field="amount"]').first();
  await expect(amount).toBeVisible();
  const lsBefore = await readProjectionLS(page);
  const planBefore = await readTaxPlan(page);
  await amount.fill('777000');
  await page.waitForTimeout(200);
  // 입력 중에는 실제 state/localStorage가 절대 바뀌지 않아야 한다.
  expect(await readTaxPlan(page)).toBe(planBefore);
  expect(await readProjectionLS(page)).toBe(lsBefore);
  await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();
  expect(await readTaxPlan(page)).toBe(planBefore);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('3. 절세계좌 - 배분 합계 100% 초과는 [확인]이 차단하고 state를 바꾸지 않는다', async ({ page }) => {
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  const alloc = page.locator('#taxAdvantagedPlanModal input.tax-alloc-input').first();
  await expect(alloc).toBeVisible();
  const planBefore = await readTaxPlan(page);
  const lsBefore = await readProjectionLS(page);
  page.once('dialog', (d) => d.accept()); // validation alert
  await alloc.fill('150');
  await page.locator('#saveTaxAdvantagedPlanModalBtn').click();
  await page.waitForTimeout(300);
  // 저장이 막혔으므로 팝업은 열린 채, state/localStorage는 그대로여야 한다.
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeVisible();
  expect(await readTaxPlan(page)).toBe(planBefore);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('4. 절세계좌 - 정상값으로 [확인]하면 state 반영 + persist + 미래예측 갱신', async ({ page }) => {
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  const amount = page.locator('#taxAdvantagedPlanModal input[data-contrib-field="amount"]').first();
  await amount.fill('500000');
  await page.locator('#saveTaxAdvantagedPlanModalBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeHidden();
  const saved = await page.evaluate(() => {
    const l = state.projection.taxAdvantagedPlan.contributionByOwnerAccount['신랑'] || [];
    const isa = l.find((c) => c.accountType === 'ISA');
    return { amount: isa && isa.amount, persisted: (localStorage.getItem('sam_projection_v1') || '').includes('500000') };
  });
  expect(saved.amount).toBe(500000);
  expect(saved.persisted).toBe(true);
});

test('5. 절세계좌 - 음수 적립기간은 [확인]이 차단하고 state를 바꾸지 않는다', async ({ page }) => {
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  // 금액 칸은 입력 포매터가 마이너스를 제거해 음수 자체가 들어가지 않는다(별도 방어) - 실제로 음수를
  // 넣을 수 있는 경로는 number 타입인 적립기간이므로 여기서 차단을 확인한다.
  const years = page.locator('#taxAdvantagedPlanModal input[data-contrib-field="years"]').first();
  const planBefore = await readTaxPlan(page);
  const lsBefore = await readProjectionLS(page);
  page.once('dialog', (d) => d.accept());
  await years.fill('-1');
  await page.locator('#saveTaxAdvantagedPlanModalBtn').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeVisible();
  expect(await readTaxPlan(page)).toBe(planBefore);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('6. 절세계좌 - 팝업 안 결과표는 draft 기준으로 실시간 갱신된다(미리보기 기능 유지)', async ({ page }) => {
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  const results = page.locator('#taxAdvantagedPlanResults');
  const before = (await results.innerText()).trim();
  await page.locator('#taxAdvantagedPlanModal input[data-contrib-field="amount"]').first().fill('1000000');
  await page.waitForTimeout(300);
  const after = (await results.innerText()).trim();
  expect(after).not.toBe(before); // 저장하지 않아도 예상 적립금액이 바뀌어 보여야 한다
});

test('7. 절세계좌 - 취소/확인 버튼이 44px 터치 타겟을 만족한다(375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.locator('#taxAdvantagedPlanBtn').click();
  for (const id of ['#cancelTaxAdvantagedPlanModalBtn', '#saveTaxAdvantagedPlanModalBtn']) {
    const box = await page.locator(id).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

/* ---------------------------------------------------------------------------
 * P1 - 미래예측 가정(인플레이션율) / 투자금 증가율 / MC 운용보수
 * ------------------------------------------------------------------------ */
async function openAssumptions(page) {
  await page.locator('#projectionAssumptionsAccordionBtn').click();
  await page.locator('#openProjectionAssumptionsBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeVisible();
}

test('8. 인플레이션율 - 변경 후 취소하면 state와 localStorage가 그대로다', async ({ page }) => {
  await seed(page);
  await openAssumptions(page);
  const lsBefore = await readProjectionLS(page);
  await page.locator('#inflationRateInput').fill('9.9');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => state.projection.inflationRate)).toBe(2.5);
  await page.locator('#cancelProjectionAssumptionsModalBtn').click();
  expect(await page.evaluate(() => state.projection.inflationRate)).toBe(2.5);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('9. 인플레이션율 - 확인하면 state 반영 + persist + 요약 텍스트 갱신', async ({ page }) => {
  await seed(page);
  await openAssumptions(page);
  await page.locator('#inflationRateInput').fill('3.5');
  await page.locator('#saveProjectionAssumptionsModalBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeHidden();
  expect(await page.evaluate(() => state.projection.inflationRate)).toBe(3.5);
  expect(await readProjectionLS(page)).toContain('"inflationRate":3.5');
  await expect(page.locator('#projectionInflationSummary')).toHaveText('3.5%');
});

test('10. 투자금 증가율 - 적립금 설정 팝업에서 취소하면 반영되지 않는다', async ({ page }) => {
  await seed(page);
  const lsBefore = await readProjectionLS(page);
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await page.locator('#contributionGrowthRateInput').fill('7');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => state.projection.contributionGrowthRate)).toBe(0);
  await page.locator('#cancelMonthlyContributionAllocationModalBtn').click();
  expect(await page.evaluate(() => state.projection.contributionGrowthRate)).toBe(0);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('11. 투자금 증가율 - 저장하면 반영되고 미래예측 결과가 갱신된다', async ({ page }) => {
  await seed(page);
  const before = await page.locator('#projectionHeroFuture').innerText();
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await page.locator('#monthlyContributionTotalInputHusband').fill('500000');
  await page.locator('#contributionGrowthRateInput').fill('5');
  await page.locator('#saveMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
  expect(await page.evaluate(() => state.projection.contributionGrowthRate)).toBe(5);
  await expect(page.locator('#projectionHeroFuture')).not.toHaveText(before);
});

test('12. MC 운용보수 - "미확인"과 "명시적 0%"가 화면에서 구분된다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'E2E30일반채권', label: 'E2E30일반채권', pct: 100, role: '수비수' }], '해외': [] } };
    persistRebalance(); renderAll();
  });
  await page.locator('#mcFeeRatesToggleBtn').click();
  await expect(page.locator('#mcFeeRatesModal')).toBeVisible();
  const status = page.locator('#mcFeeRatesList [data-fee-status]').first();
  // 값을 넣은 적이 없으면 "미확인" - 0%로 뭉개지지 않는다(색이 아니라 글자로도 구분한다).
  await expect(status).toHaveText('미확인');
  await page.locator('#mcFeeRatesList input[data-fee-key]').first().fill('0');
  await expect(status).toHaveText('0%'); // 명시적 0%는 "미확인"과 다른 표시
  await page.locator('#saveMcFeeRatesModalBtn').click();
  await expect(page.locator('#mcFeeRatesModal')).toBeHidden();
  // 데이터 모델에서도 구분된다: 키가 존재하면 명시적 설정.
  expect(await page.evaluate(() => Object.values(state.projection.customFeeRates)[0])).toBe(0);
  await expect(page.locator('#mcFeeSummary')).toHaveText('전부 확인됨');
});

test('13. MC 운용보수 - 취소하면 state가 바뀌지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'E2E30일반채권', label: 'E2E30일반채권', pct: 100, role: '수비수' }], '해외': [] } };
    persistRebalance(); renderAll();
  });
  const lsBefore = await readProjectionLS(page);
  await page.locator('#mcFeeRatesToggleBtn').click();
  await page.locator('#mcFeeRatesList input[data-fee-key]').first().fill('1.5');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => Object.keys(state.projection.customFeeRates).length)).toBe(0);
  await page.locator('#cancelMcFeeRatesModalBtn').click();
  expect(await page.evaluate(() => Object.keys(state.projection.customFeeRates).length)).toBe(0);
  expect(await readProjectionLS(page)).toBe(lsBefore);
});

test('14. 새 팝업 2개가 물리 뒤로가기로 닫힌다(레지스트리 양쪽 등록 확인)', async ({ page }) => {
  await seed(page);
  await openAssumptions(page);
  await page.goBack();
  await expect(page.locator('#projectionAssumptionsModal')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('한 번 더 누르면 종료');

  await page.evaluate(() => {
    state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'E2E30일반채권', label: 'E2E30일반채권', pct: 100, role: '수비수' }], '해외': [] } };
    persistRebalance(); renderAll();
  });
  await page.locator('#mcFeeRatesToggleBtn').click();
  await expect(page.locator('#mcFeeRatesModal')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#mcFeeRatesModal')).toBeHidden();
});

test('15. 미래예측 화면에서 목표비중 보기 링크로 포트폴리오 구성 탭으로 이동한다', async ({ page }) => {
  await seed(page);
  await page.locator('#goToRebalanceTargetBtn').click();
  await expect(page.locator('#rebalanceSubTarget')).toBeVisible();
});
