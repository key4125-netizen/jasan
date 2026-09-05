// E2E-27 Phase 22 STEP 7 - Portfolio 진단 카드 드릴다운(Phase 17 P1-2) 전용 회귀. Phase 17에서 실제
// 브라우저로 검증했지만 전용 e2e가 없었다(Phase 21 발견). 목표비중 설정 -> 진단 카드 표시 -> 드릴다운
// 클릭 -> 실행 상세 표시 -> 올바른 종목 연결까지 확인한다. 계산(computeIndividualRebalanceGuide 등)은
// 전혀 건드리지 않는다 - 이미 Phase 22 STEP 3에서 label fallback만 보강했다(e2e 23에서 별도 검증).
const { test, expect } = require('@playwright/test');

async function seedTargets(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E27신랑보유', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 60000000, currentPrice: 60000000 }),
      makeAsset({ name: 'E2E27와이프보유', category: '채권', owner: '와이프', accountType: '일반계좌', quantity: 1, buyPrice: 20000000, currentPrice: 20000000 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'namedHolding', name: 'E2E27신랑보유', label: 'E2E27신랑보유', pct: 100, role: '수비수' },
    ];
    state.rebalance['와이프'].targets['국내'] = [
      { type: 'namedHolding', name: 'E2E27와이프보유', label: 'E2E27와이프보유', pct: 100, role: '수비수' },
    ];
    persistAssets();
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();
}

test('1-6. 목표비중 설정 -> 진단 카드 표시 -> 드릴다운 클릭 -> 실행 상세가 올바른 종목으로 연결된다', async ({ page }) => {
  await seedTargets(page);

  // 3. 진단 카드 표시
  const husbandCard = page.locator('#portfolioTargetSummaryHusband');
  await expect(husbandCard).toContainText('E2E27신랑보유');

  // 4-6. drilldown 클릭 -> execution detail 표시 -> 올바른 종목(60,000,000원) 연결
  await husbandCard.locator('.portfolio-diag-row-toggle').first().click();
  const drilldownText = await husbandCard.innerText();
  expect(drilldownText).toContain('현재 평가금액');
  expect(drilldownText).toContain('60,000,000원');
  expect(drilldownText).not.toContain('보유 중인 종목이 없어 실행 상세가 없습니다');
});

test('7. name-only(label 없음) target도 드릴다운이 정상 연결된다', async ({ page }) => {
  await seedTargets(page);
  await page.evaluate(() => {
    // label 필드를 아예 제거해 "name만 있는" 케이스를 재현한다(Phase 22 STEP 3 fallback 대상).
    delete state.rebalance['신랑'].targets['국내'][0].label;
    persistRebalance();
  });
  await page.reload();
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();

  const husbandCard = page.locator('#portfolioTargetSummaryHusband');
  await husbandCard.locator('.portfolio-diag-row-toggle').first().click();
  const drilldownText = await husbandCard.innerText();
  expect(drilldownText).not.toContain('보유 중인 종목이 없어 실행 상세가 없습니다');
  expect(drilldownText).toContain('60,000,000원');
});

test('8. 다른 소유자(와이프)의 데이터가 신랑 카드에 섞이지 않는다', async ({ page }) => {
  await seedTargets(page);

  const husbandText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  const wifeText = await page.locator('#portfolioTargetSummaryWife').innerText();

  expect(husbandText).toContain('E2E27신랑보유');
  expect(husbandText).not.toContain('E2E27와이프보유');
  expect(wifeText).toContain('E2E27와이프보유');
  expect(wifeText).not.toContain('E2E27신랑보유');

  // 각자 드릴다운을 펼쳐도 금액이 서로 섞이지 않는다.
  await page.locator('#portfolioTargetSummaryHusband .portfolio-diag-row-toggle').first().click();
  await page.locator('#portfolioTargetSummaryWife .portfolio-diag-row-toggle').first().click();
  expect(await page.locator('#portfolioTargetSummaryHusband').innerText()).toContain('60,000,000원');
  expect(await page.locator('#portfolioTargetSummaryWife').innerText()).toContain('20,000,000원');
});
