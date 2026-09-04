// E2E-10 Phase 8 - "현재 vs 목표 한눈에 보기" 요약(renderPortfolioTargetSummary, js/04)이 실제
// 화면에서 부족/초과/적정 상태를 정확히 표시하는지 확인한다. 기존 seedPortfolio 픽스처는 목표 항목
// 이름과 실제 보유자산 이름이 일치하지 않아(제네릭 이름) 이 카드가 항상 "0원 보유"로만 뜨므로, 이
// 스펙은 계산 근거를 정확히 통제하기 위해 state를 직접 세팅한다(실제 자산 이름과 목표 항목 이름을
// 정확히 일치시켜 computeRegionTargetAmounts의 namedHolding 매칭이 의도한 금액을 잡게 한다).
const { test, expect } = require('@playwright/test');

async function seedPreciseTargets(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E채권부족', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 10000000, currentPrice: 10000000 }),
      makeAsset({ name: 'E2E채권초과', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 70000000, currentPrice: 70000000 }),
      makeAsset({ name: 'E2E채권적정', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 20000000, currentPrice: 20000000 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    // 부족(A): 보유 10%인데 목표 30% -> 부족. 초과(B): 보유 70%인데 목표 50% -> 초과. 적정(C): 보유
    // 20%=목표 20% -> 정확히 일치. 셋의 pct 합은 100(30+50+20)이라 목표 비중 합계도 정상(✓)이 되게 한다.
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'namedHolding', name: 'E2E채권부족', label: 'E2E채권부족', pct: 30, role: '수비수' },
      { type: 'namedHolding', name: 'E2E채권초과', label: 'E2E채권초과', pct: 50, role: '수비수' },
      { type: 'namedHolding', name: 'E2E채권적정', label: 'E2E채권적정', pct: 20, role: '수비수' },
    ];
    persistAssets();
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

async function goToPortfolioTab(page) {
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();
}

test('현재 vs 목표 요약 - 부족/초과/적정 상태와 현재·목표 비중이 정확히 표시된다', async ({ page }) => {
  await seedPreciseTargets(page);
  await goToPortfolioTab(page);

  const summaryText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  // 부족 자산: 현재 10% / 목표 30%
  expect(summaryText).toMatch(/E2E채권부족[\s\S]*?부족/);
  expect(summaryText).toContain('현재 10% · 목표 30%');
  // 초과 자산: 현재 70% / 목표 50%
  expect(summaryText).toMatch(/E2E채권초과[\s\S]*?초과/);
  expect(summaryText).toContain('현재 70% · 목표 50%');
  // 적정 자산: 현재 20% / 목표 20%
  expect(summaryText).toMatch(/E2E채권적정[\s\S]*?적정/);
  expect(summaryText).toContain('현재 20% · 목표 20%');
  // 목표 비중 합계(30+50+20=100)가 정상으로 표시되어야 한다.
  expect(summaryText).toContain('국내 목표 합계 100% ✓');
  // 매매를 직접 지시하는 문구가 없어야 한다(앱은 투자 판단을 대신하지 않는다).
  expect(summaryText).not.toMatch(/매도하세요|매수하세요/);
});

test('목표 비중 합계가 100%가 아니면 화면에서 명확하게 안내된다', async ({ page }) => {
  await seedPreciseTargets(page);
  await page.evaluate(() => {
    // pct 합을 90(30+40+20)으로 깨뜨린다.
    state.rebalance['신랑'].targets['국내'][1].pct = 40;
    persistRebalance();
  });
  await page.reload();
  await goToPortfolioTab(page);

  const summaryText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  expect(summaryText).toContain('국내 목표 합계 90%');
  expect(summaryText).toContain('100%가 되도록 조정해주세요');
});
