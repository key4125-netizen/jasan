// E2E-09 Phase 7-G - 자산 등록/거래 입력 UX 개선 검증. 기존 스펙들과 달리 실제 자산 등록 모달과
// 거래 입력 모달을 UI로 직접 조작한다(seedPortfolio 픽스처는 state를 직접 세팅해 이 두 폼 자체를
// 한 번도 거치지 않으므로, 이번에 추가한 입력검증 로직은 오직 이 스펙에서만 실제로 실행된다).
const { test, expect } = require('@playwright/test');
const { seedPortfolio } = require('./fixtures');

test('자산 등록 - 수량 0 이하는 저장되지 않고 안내 후 정상값으로 고치면 저장된다', async ({ page }) => {
  await seedPortfolio(page, { targets: [] });
  expect(await page.evaluate(() => state.assets.length)).toBe(0);

  // [Phase 17 P1-1] 최초등록 버튼이 헤더에서 시스템관리(⚙) 모달 안으로 이동했다 - 먼저 그 진입점을
  // 열어야 실제 버튼이 보인다(기능/id/폼 로직은 전혀 바뀌지 않았다).
  await page.locator('#systemManagementBtn').click();
  await page.locator('#addAssetBtn').click();
  await page.locator('#f_manualEntryToggle').check();
  await page.locator('#f_name').fill('E2E테스트채권');
  await page.locator('#f_quantity').fill('0');
  await page.locator('#f_buyPrice').fill('10000');
  await page.locator('#assetFormSubmitBtn').click();

  // 저장되지 않고 경고 토스트가 뜨며 모달은 열린 채로 남아야 한다.
  await expect(page.locator('#toastContainer')).toContainText('수량은 0보다 커야 합니다');
  await expect(page.locator('#assetModal')).toBeVisible();
  expect(await page.evaluate(() => state.assets.length)).toBe(0);

  // 정상값으로 고치면 저장되고 모달이 닫힌다.
  await page.locator('#f_quantity').fill('10');
  await page.locator('#assetFormSubmitBtn').click();
  await expect(page.locator('#assetModal')).toBeHidden();
  const assets = await page.evaluate(() => state.assets.map((a) => ({ name: a.name, quantity: a.quantity, buyPrice: a.buyPrice })));
  expect(assets).toEqual([{ name: 'E2E테스트채권', quantity: 10, buyPrice: 10000 }]);
});

test('자산 등록 - 매수단가 0 이하는 저장되지 않는다', async ({ page }) => {
  await seedPortfolio(page, { targets: [] });
  // [Phase 17 P1-1] 최초등록 버튼이 헤더에서 시스템관리(⚙) 모달 안으로 이동했다 - 먼저 그 진입점을
  // 열어야 실제 버튼이 보인다(기능/id/폼 로직은 전혀 바뀌지 않았다).
  await page.locator('#systemManagementBtn').click();
  await page.locator('#addAssetBtn').click();
  await page.locator('#f_manualEntryToggle').check();
  await page.locator('#f_name').fill('E2E테스트채권2');
  await page.locator('#f_quantity').fill('5');
  await page.locator('#f_buyPrice').fill('0');
  await page.locator('#assetFormSubmitBtn').click();

  await expect(page.locator('#toastContainer')).toContainText('매수단가는 0보다 커야 합니다');
  expect(await page.evaluate(() => state.assets.length)).toBe(0);
});

test('거래 입력 - 보유수량보다 많은 매도는 차단되고, 보유수량 이하 매도는 저장되어 자산에 반영된다', async ({ page }) => {
  await seedPortfolio(page, { targets: [] });
  // 매수 거래 1건을 직접 세팅해 "보유수량 10"인 상태를 만든다(이 스펙의 목적은 매도 폼 검증이지
  // 매수 폼까지 다시 검증하는 것이 아니므로, 기존 세션에서 이미 검증된 패턴대로 state를 직접 세팅).
  await page.evaluate(() => {
    state.transactions.push({
      id: 'e2e-buy-1', date: '2026-01-02', owner: '신랑', accountType: '일반계좌',
      ticker: '', name: 'E2E테스트주식', type: 'buy', quantity: 10, price: 50000, currency: 'KRW', fee: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
  });
  await page.getByText('거래내역', { exact: true }).click();
  expect(await page.evaluate(() => state.assets.find((a) => a.name === 'E2E테스트주식').quantity)).toBe(10);

  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#tx_name').fill('E2E테스트주식');
  await page.locator('#tx_type').selectOption('sell');
  await page.locator('#tx_quantity').fill('20');
  await page.locator('#tx_price').fill('60000');
  await page.locator('button[type="submit"]', { hasText: '저장' }).click();

  await expect(page.locator('#toastContainer')).toContainText('현재 보유수량');
  await expect(page.locator('#transactionModal')).toBeVisible();
  expect(await page.evaluate(() => state.assets.find((a) => a.name === 'E2E테스트주식').quantity)).toBe(10);

  // 보유수량 이하로 고치면 정상 저장되고, 자산 수량이 즉시 줄어든다(보유자산 반영 확인).
  await page.locator('#tx_quantity').fill('4');
  await page.locator('button[type="submit"]', { hasText: '저장' }).click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await page.evaluate(() => state.assets.find((a) => a.name === 'E2E테스트주식').quantity)).toBe(6);
});
