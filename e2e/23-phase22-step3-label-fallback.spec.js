// E2E-23 Phase 22 STEP 3 - Portfolio label fallback 보강(Phase 21 T-04) 회귀.
// state.rebalance[owner].targets의 목표 항목에 label이 없고 name만 있으면, Portfolio 진단 카드를
// 펼쳤을 때 실제로는 종목을 보유 중인데도 "보유 중인 종목이 없어 실행 상세가 없습니다"로 잘못
// 표시되던 문제가 있었다(computeIndividualRebalanceGuide가 targetLabel: t.label을 fallback 없이
// 그대로 써서, computePortfolioTargetSummaryRows의 label(t.label||t.name||...) fallback과 값이
// 어긋나 guideRowsByLabel[r.label] 조회가 실패했었다). js/04-rebalancing.js의 targetLabel 계산에
// 동일한 fallback(t.label||t.name||t.ticker||'(이름 없음)')을 적용해 고쳤다 - 계산값(금액/수량) 자체는
// 전혀 건드리지 않았다(표시 매칭 로직만 수정).
const { test, expect } = require('@playwright/test');

async function seedTarget(page, target) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate((target) => {
    state.assets = [
      makeAsset({ name: 'E2E라벨자산', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 50000000, currentPrice: 50000000 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [target];
    persistAssets();
    persistRebalance();
  }, target);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

async function goToPortfolioTab(page) {
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();
}

// 진단 카드의 첫 번째 행(토글 버튼)을 눌러 드릴다운을 펼친다.
async function openFirstDiagRow(page) {
  await page.locator('#portfolioTargetSummaryHusband .portfolio-diag-row-toggle').first().click();
}

test('Case A - label과 name이 모두 있으면 기존과 동일하게 드릴다운이 정상 표시된다', async ({ page }) => {
  await seedTarget(page, { type: 'namedHolding', name: 'E2E라벨자산', label: 'E2E라벨자산', pct: 100, role: '수비수' });
  await goToPortfolioTab(page);
  await openFirstDiagRow(page);

  const drilldownText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  expect(drilldownText).not.toContain('보유 중인 종목이 없어 실행 상세가 없습니다');
  expect(drilldownText).toContain('현재 평가금액');
  expect(drilldownText).toContain('50,000,000원');
});

test('Case B - label이 없고 name만 있어도 드릴다운이 올바르게 연결된다(수정 대상 버그)', async ({ page }) => {
  await seedTarget(page, { type: 'namedHolding', name: 'E2E라벨자산', pct: 100, role: '수비수' }); // label 필드 자체가 없음
  await goToPortfolioTab(page);
  await openFirstDiagRow(page);

  const drilldownText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  // 수정 전에는 이 케이스에서 아래 문구가 잘못 표시됐다(guideRowsByLabel 키 불일치).
  expect(drilldownText).not.toContain('보유 중인 종목이 없어 실행 상세가 없습니다');
  expect(drilldownText).toContain('현재 평가금액');
  expect(drilldownText).toContain('50,000,000원');
});

test('Case C - label과 name이 둘 다 없어도 에러 없이 안전한 기존 empty 동작을 유지한다', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await seedTarget(page, { type: 'namedHolding', pct: 100, role: '수비수' }); // label/name 둘 다 없음
  await goToPortfolioTab(page);

  // "(이름 없음)"으로 안전하게 표시되고, 클릭해도 죽지 않아야 한다.
  const summaryText = await page.locator('#portfolioTargetSummaryHusband').innerText();
  expect(summaryText).toContain('(이름 없음)');
  await openFirstDiagRow(page);

  expect(pageErrors).toEqual([]);
});
