// E2E-26 Phase 22 STEP 6 - Assets 관점 전환 세그먼트 컨트롤(Phase 18) 전용 회귀. Phase 18에서 실제
// 브라우저로는 검증했지만 전용 e2e가 없었다(Phase 21 발견). 4개 관점(전체/소유자/국내외/자산군)이
// 같은 원천 데이터를 그룹핑만 다르게 보여주는지, 총 건수/합계가 관점과 무관하게 항상 동일한지,
// 검색/정렬이 유지되는지, 375px에서 clipping이 없는지 확인한다. 계산(calcRow 등)은 전혀 건드리지
// 않는다 - assetListViewMode(js/07)가 어떤 그룹으로 보여줄지만 바꾼다.
const { test, expect } = require('@playwright/test');

async function seedMixedAssets(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E26신랑국내', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 100000000, currentPrice: 100000000, currency: 'KRW' }),
      makeAsset({ name: 'E2E26와이프국내', category: '채권', owner: '와이프', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 50000000, currentPrice: 50000000, currency: 'KRW' }),
      makeAsset({ name: 'E2E26신랑해외', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '해외', quantity: 1, buyPrice: 40000000, currentPrice: 40000000, currency: 'KRW' }),
    ];
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('총자산현황', { exact: true }).click();
}

test('4개 관점 전환 시 총자산/보유자산수는 항상 동일하고, 목록만 다르게 그룹핑된다', async ({ page }) => {
  await seedMixedAssets(page);

  const totalBefore = await page.locator('#assetListTotalValue').textContent();
  const countBefore = await page.locator('#tableCountLabel').textContent();
  expect(totalBefore).toBe('190,000,000원');
  expect(countBefore).toContain('총 3건');

  // 전체(기본값) - 그룹 헤더 없이 3건이 그대로 보인다.
  const noneText = await page.locator('#assetCardList').innerText();
  expect(noneText).toContain('E2E26신랑국내');
  expect(noneText).toContain('E2E26와이프국내');
  expect(noneText).toContain('E2E26신랑해외');

  // 소유자별 - 신랑(2건)/와이프(1건) 그룹 헤더가 보여야 한다.
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="owner"]').click();
  const ownerText = await page.locator('#assetCardList').innerText();
  expect(ownerText).toContain('신랑 (2건)');
  expect(ownerText).toContain('와이프 (1건)');
  // 관점이 바뀌어도 총액/건수 요약은 그대로다(같은 원천 데이터).
  expect(await page.locator('#assetListTotalValue').textContent()).toBe(totalBefore);
  expect(await page.locator('#tableCountLabel').textContent()).toBe(countBefore);

  // 국내/해외별 - 해외(1건)가 국내(2건)보다 먼저 나온다(기존 정렬 규칙).
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="domestic"]').click();
  const domesticText = await page.locator('#assetCardList').innerText();
  expect(domesticText.indexOf('해외 (1건)')).toBeLessThan(domesticText.indexOf('국내 (2건)'));

  // 자산군별 - 전부 채권이라 단일 그룹(채권 3건)으로 묶인다.
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="category"]').click();
  const categoryText = await page.locator('#assetCardList').innerText();
  expect(categoryText).toContain('채권 (3건)');

  // 전체로 되돌아가도 데이터가 그대로 유지된다(기존 데이터 보존).
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="none"]').click();
  expect(await page.locator('#assetCardList').innerText()).toContain('E2E26신랑국내');
});

test('세그먼트 전환 중에도 검색 결과는 팝업으로 독립적으로 유지된다(기존 검색 기능 회귀 없음)', async ({ page }) => {
  await seedMixedAssets(page);
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="owner"]').click();

  await page.locator('#assetSearchInput').fill('E2E26신랑국내');
  await page.locator('#assetSearchBtn').click();
  await expect(page.locator('#assetSearchResultModal')).toBeVisible();
  const resultText = await page.locator('#assetSearchResultModal').innerText();
  expect(resultText).toContain('E2E26신랑국내');
  expect(resultText).not.toContain('E2E26와이프국내');
});

test('375px에서 세그먼트 컨트롤이 2x2로 배치되고 가로 스크롤(clipping)이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedMixedAssets(page);

  const bodyScrollWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(375);

  // 2x2 배치 확인 - 1번째/2번째 버튼(전체/소유자)이 같은 y좌표, 3번째(국내외)는 다음 줄.
  const boxes = await page.locator('#assetViewSegmented .asset-view-btn').evaluateAll(
    (els) => els.map((el) => el.getBoundingClientRect().top)
  );
  expect(boxes[0]).toBe(boxes[1]); // 전체 · 소유자 - 같은 줄
  expect(boxes[2]).toBeGreaterThan(boxes[0]); // 국내외 - 다음 줄
});
