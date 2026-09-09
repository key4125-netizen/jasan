// [FUTURE-P1 Phase 2-C] Monte Carlo 계좌 범위(일반/절세/합계)가 실제 브라우저에서 화면까지
// 연결되는지 확인한다 - 어댑터(js/16) → Worker(js/17) → Controller(js/18) → UI(js/19) 전 구간.
//
// 계산의 정확성(경로 단위 합산, buy-and-hold, 납입 타이밍 등)은 단위 테스트가 이미 고정한다
// (test/mc-account-scope.test.js, test/mc-adapter-account-scope.test.js) - 이 파일은 "그 결과가
// 사용자 화면까지 실제로 도달하는가"와 "일반계좌 숫자를 전체 자산인 것처럼 보여주지 않는가"만 본다.
//
// 네트워크 독립: 목표/자산을 전부 채권(namedHolding, σ=0)으로 두어 가격 이력 조회 자체가 필요 없다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

async function runMonteCarlo(page) {
  await goToProjectionTab(page);
  await expect(page.locator('#projectionSafetyBlockBanner')).toBeHidden();
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
}

test('A. 절세계좌 자산이 없으면 계좌 범위 영역이 아예 나타나지 않는다(기존 화면 그대로)', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E73국내채권', pct: 100 }],
    assetValueEach: 100000000,
  });
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeHidden();
  // 기존 결과(중간 수준 예상자산)는 그대로 나온다.
  await expect(page.locator('#mcP50Text')).not.toHaveText('-');
});

test('B. 절세계좌 자산이 있으면 일반/절세/합계 세 범위가 결과 화면에 함께 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E73국내채권', pct: 100 }],
    assetValueEach: 100000000,
  });
  await page.locator('body').evaluate(() => {
    state.assets.push(makeAsset({
      name: 'E73연금채권', category: '채권', owner: '신랑', accountType: '연금저축',
      quantity: 1, buyPrice: 30000000, currentPrice: 30000000,
    }));
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await runMonteCarlo(page);

  const scopeArea = page.locator('#mcAccountScopeArea');
  await expect(scopeArea).toBeVisible();
  const text = await scopeArea.innerText();
  expect(text).toContain('일반계좌');
  expect(text).toContain('절세계좌');
  expect(text).toContain('두 계좌 합계');
  // 각 범위가 명목/실질 두 값을 모두 갖는다(실질은 js/20 변환 결과다).
  expect(text.match(/현재 구매력/g).length).toBe(3);
});

test('C. 아래쪽 대표 숫자가 일반계좌 기준이라는 점과 합계의 의미를 화면에서 밝힌다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E73국내채권', pct: 100 }],
    assetValueEach: 100000000,
  });
  await page.locator('body').evaluate(() => {
    state.assets.push(makeAsset({
      name: 'E73IRP채권', category: '채권', owner: '신랑', accountType: 'IRP',
      quantity: 1, buyPrice: 50000000, currentPrice: 50000000,
    }));
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await runMonteCarlo(page);

  const text = await page.locator('#mcAccountScopeArea').innerText();
  // 합계를 "두 중앙값의 합"으로 오해하지 않도록 명시한다(실제로 두 값은 다를 수 있다).
  expect(text).toContain('그냥 더한 값과 다를 수 있습니다');
  expect(text).toContain('일반계좌 기준');
});
