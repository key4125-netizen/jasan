// E2E-25 Phase 22 STEP 5 - JSON Export/Import 전체 round-trip 커버리지(Phase 21 발견 - 전용 e2e
// 0건이었음). 실제 내보내기 버튼(다운로드 앵커 클릭)을 가로채는 대신, 그 버튼이 내부적으로 쓰는
// 실제 함수(buildSyncBlob)를 페이지 컨텍스트에서 그대로 호출해 "내보내기 결과물"을 얻는다 - 계산/
// 직렬화 로직은 100% 동일하고, Playwright의 파일 다운로드 가로채기라는 부차적인 문제만 피한 것이다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function seedFullState(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E25국내채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 30000000, currentPrice: 30000000 }),
    ];
    state.transactions = [{
      id: 'e25-tx-1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E2E25국내채권',
      type: 'buy', quantity: 1, price: 30000000, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now(),
    }];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [{ type: 'namedHolding', name: 'E2E25국내채권', label: 'E2E25국내채권', pct: 100, role: '수비수' }], '해외': [] };
    });
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 700000, years: 12, allocation: [] },
      '와이프': { total: 300000, years: null, allocation: [] },
    };
    state.projection.inflationRate = 3.1;
    persistAssets(); persistTransactions(); persistRebalance(); persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

async function exportToFile(page) {
  const json = await page.evaluate(() => JSON.stringify(buildSyncBlob()));
  const filePath = path.join(os.tmpdir(), `e2e25-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(filePath, json);
  return filePath;
}

async function importFile(page, filePath, choice) {
  await page.locator('#systemManagementBtn').click();
  await page.locator('#importJsonBtn').click();
  await page.locator('#jsonFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator(choice === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
  await page.keyboard.press('Escape');
}

test('Export -> Import(덮어쓰기) round trip - assets/transactions/rebalance/projection/적립기간이 전부 보존된다', async ({ page }) => {
  await seedFullState(page);
  const filePath = await exportToFile(page);

  // 완전히 비운 뒤 복원해서 "가져오기가 실제로 값을 만들어냈는지"를 명확히 확인한다.
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    REBALANCE_OWNERS.forEach((owner) => { state.rebalance[owner].targets = { '국내': [], '해외': [] }; });
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 0, years: null, allocation: [] },
      '와이프': { total: 0, years: null, allocation: [] },
    };
    persistAssets(); persistTransactions(); persistRebalance(); persistProjection();
  });
  await page.reload();

  page.on('dialog', async (dialog) => { await dialog.accept(); }); // 덮어쓰기 확인 confirm()
  await importFile(page, filePath, 'overwrite');
  await expect(page.locator('#toastContainer')).toContainText('복원');

  const restored = await page.evaluate(() => ({
    assetCount: state.assets.length,
    assetName: state.assets[0]?.name,
    txCount: state.transactions.length,
    targetLabel: state.rebalance['신랑'].targets['국내'][0]?.label,
    husbandTotal: state.projection.monthlyContributionByOwner['신랑'].total,
    husbandYears: state.projection.monthlyContributionByOwner['신랑'].years,
    wifeYears: state.projection.monthlyContributionByOwner['와이프'].years,
    inflationRate: state.projection.inflationRate,
  }));

  expect(restored.assetCount).toBe(1);
  expect(restored.assetName).toBe('E2E25국내채권');
  expect(restored.txCount).toBe(1);
  expect(restored.targetLabel).toBe('E2E25국내채권');
  expect(restored.husbandTotal).toBe(700000);
  expect(restored.husbandYears).toBe(12); // 0이 아니라 명시적 12가 그대로 보존되어야 한다(null과 구분)
  expect(restored.wifeYears).toBe(null); // null(제한없음)도 0으로 뭉개지지 않고 그대로 보존
  expect(restored.inflationRate).toBe(3.1);
  fs.unlinkSync(filePath);
});

test('Export -> Import(추가하기) - 이미 있는 백업을 다시 append해도 거래가 이중 계상되지 않는다', async ({ page }) => {
  await seedFullState(page);
  const filePath = await exportToFile(page);

  await importFile(page, filePath, 'append');
  await expect(page.locator('#toastContainer')).toContainText('추가');

  // 같은 백업(같은 거래 id)을 또 append해도 거래 건수가 늘어나지 않아야 한다(중복 방지 유지).
  await importFile(page, filePath, 'append');
  await expect(page.locator('#toastContainer')).toContainText('추가');

  const txCount = await page.evaluate(() => state.transactions.filter((t) => t.name === 'E2E25국내채권').length);
  expect(txCount).toBe(1); // 최초 1건 + 재현 시도 2회 모두 같은 id라 계속 1건
  fs.unlinkSync(filePath);
});
