// E2E-24 Phase 22 STEP 4 - JSON 백업 "추가하기" 오버셀 안전성(Phase 21 T-05 실제 수정).
// Phase 13에서 Excel 대량 거래입력에 적용한 "하나라도 초과매도면 전체 원자적 거부" 원칙을 JSON 백업
// append 경로에도 동일하게 적용했다(js/12, findExcelOversellViolations 재사용 - 새 계산 없음).
// computePositionsAndRealizedPnL()의 기존 Math.min() clamp는 이번에도 건드리지 않았다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function resetState(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    persistAssets();
    persistTransactions();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('거래내역', { exact: true }).click();
}

// JSON import 핸들러는 parsed.assets가 최소 1건 있어야(restored.length>0) 선택 모달까지 진행한다
// (비어있으면 "복원할 자산 데이터가 없습니다" alert 후 즉시 return) - 이번 테스트의 실제 대상은
// 거래내역 오버셀 검증이므로, 그 흐름을 방해하지 않는 무관한 더미 자산 하나를 항상 함께 넣는다.
function dummyAsset() {
  return { id: 'dummy-asset', name: '더미자산', category: '채권', owner: '공동', accountType: '일반계좌', quantity: 1, buyPrice: 1000, currentPrice: 1000 };
}

function tx(o) {
  return {
    id: o.id, date: o.date, owner: o.owner || '신랑', accountType: o.accountType || '일반계좌',
    ticker: '', name: o.name, type: o.type, quantity: o.quantity, price: o.price || 10000,
    currency: 'KRW', fee: 0, createdAt: o.createdAt || Date.now(),
  };
}

async function writeJsonFixture(payload) {
  const filePath = path.join(os.tmpdir(), `e2e24-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload));
  return filePath;
}

async function doImport(page, filePath, choice) {
  // [Phase 17 P1-1] JSON 불러오기 버튼이 헤더에서 ⚙ 시스템관리 모달 안으로 이동했다 - 먼저 그 진입점을
  // 열어야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다). closeImportChoiceModal()은
  // systemManagementModal까지 닫아주지 않으므로(서로 독립된 모달), 한 테스트에서 doImport를 두 번
  // 이상 호출할 때를 대비해 끝에서 항상 Escape로 닫아 다음 호출이 깨끗한 상태에서 시작하게 한다.
  await page.locator('#systemManagementBtn').click();
  await page.locator('#importJsonBtn').click();
  await page.locator('#jsonFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator(choice === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemManagementModal')).toBeHidden();
}

test('A. buy100 -> sell30 append는 정상 반영된다(PASS)', async ({ page }) => {
  await resetState(page);
  const filePath = await writeJsonFixture({
    assets: [dummyAsset()], // 자산은 거래로부터 동기화되므로 비워도 된다(테스트 대상은 거래 검증 로직).
    transactions: [
      tx({ id: 'a1', date: '2026-01-01', name: 'E2E24-A', type: 'buy', quantity: 100 }),
      tx({ id: 'a2', date: '2026-01-02', name: 'E2E24-A', type: 'sell', quantity: 30 }),
    ],
  });
  await doImport(page, filePath, 'append');
  await expect(page.locator('#toastContainer')).toContainText('추가');
  // [주의] JSON append는 거래내역을 그대로 이어붙일 뿐 state.assets를 거래로부터 재동기화하지 않는다
  // (state.assets는 백업 파일의 assets 배열을 그대로 병합 - mergeAssetsForAppend). 이 테스트의 실제
  // 대상은 오버셀 검증이므로 거래내역이 정확히 반영됐는지로 확인한다.
  const txs = await page.evaluate(() => state.transactions.filter((t) => t.name === 'E2E24-A').map((t) => ({ type: t.type, quantity: t.quantity })));
  expect(txs).toEqual([{ type: 'buy', quantity: 100 }, { type: 'sell', quantity: 30 }]);
  fs.unlinkSync(filePath);
});

test('B. 기존 보유100 + append(sell30, sell80) - 전체 거부된다', async ({ page }) => {
  await resetState(page);
  await page.evaluate(() => {
    state.transactions = [{
      id: 'pre-1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E2E24-B',
      type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, createdAt: Date.now(),
    }];
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  await page.reload();
  await page.getByText('거래내역', { exact: true }).click();

  const filePath = await writeJsonFixture({
    assets: [dummyAsset()],
    transactions: [
      tx({ id: 'b1', date: '2026-01-02', name: 'E2E24-B', type: 'sell', quantity: 30 }),
      tx({ id: 'b2', date: '2026-01-03', name: 'E2E24-B', type: 'sell', quantity: 80 }), // 누적 110 > 100
    ],
  });

  let alertMessage = '';
  page.once('dialog', async (dialog) => { alertMessage = dialog.message(); await dialog.accept(); });
  await doImport(page, filePath, 'append');

  await expect.poll(() => alertMessage).toContain('초과 매도가 발견되어');
  const txCount = await page.evaluate(() => state.transactions.length);
  expect(txCount).toBe(1); // 기존 1건 그대로, 새 거래는 하나도 반영되지 않음
  const qty = await page.evaluate(() => state.assets.find((a) => a.name === 'E2E24-B')?.quantity);
  expect(qty).toBe(100); // 기존 보유수량도 그대로
  fs.unlinkSync(filePath);
});

test('C. 여러 종목 중 하나만 오버셀이어도 전체가 거부된다', async ({ page }) => {
  await resetState(page);
  const filePath = await writeJsonFixture({
    assets: [dummyAsset()],
    transactions: [
      tx({ id: 'c1', date: '2026-01-01', name: 'E2E24-정상', type: 'buy', quantity: 100 }),
      tx({ id: 'c2', date: '2026-01-02', name: 'E2E24-정상', type: 'sell', quantity: 30 }),
      tx({ id: 'c3', date: '2026-01-01', name: 'E2E24-초과', type: 'buy', quantity: 50 }),
      tx({ id: 'c4', date: '2026-01-02', name: 'E2E24-초과', type: 'sell', quantity: 60 }), // 60 > 50
    ],
  });
  let alertMessage = '';
  page.once('dialog', async (dialog) => { alertMessage = dialog.message(); await dialog.accept(); });
  await doImport(page, filePath, 'append');

  await expect.poll(() => alertMessage).toContain('초과 매도가 발견되어');
  const txCount = await page.evaluate(() => state.transactions.length);
  expect(txCount).toBe(0); // 정상 종목(E2E24-정상)도 함께 거부되어야 한다(atomic)
  fs.unlinkSync(filePath);
});

test('D. 덮어쓰기(overwrite) 모드는 기존 정책 그대로 동작한다(오버셀 검증 대상 아님)', async ({ page }) => {
  await resetState(page);
  const filePath = await writeJsonFixture({
    assets: [dummyAsset()],
    transactions: [
      tx({ id: 'd1', date: '2026-01-01', name: 'E2E24-D', type: 'buy', quantity: 10 }),
      tx({ id: 'd2', date: '2026-01-02', name: 'E2E24-D', type: 'sell', quantity: 50 }), // overwrite는 통째 교체라 검증 대상 아님(기존 정책)
    ],
  });
  page.on('dialog', async (dialog) => { await dialog.accept(); }); // overwrite 확인 confirm()
  await doImport(page, filePath, 'overwrite');
  await expect(page.locator('#toastContainer')).toContainText('복원');
  const txCount = await page.evaluate(() => state.transactions.length);
  expect(txCount).toBe(2); // 덮어쓰기는 그대로 통째 반영(기존 동작 무변경 확인)
  fs.unlinkSync(filePath);
});

test('E. append 중 id 중복은 기존처럼 건너뛴다(오버셀 검증이 이 정책을 바꾸지 않음)', async ({ page }) => {
  await resetState(page);
  await page.evaluate(() => {
    state.transactions = [{
      id: 'dup-1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E2E24-E',
      type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, createdAt: Date.now(),
    }];
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  await page.reload();
  await page.getByText('거래내역', { exact: true }).click();

  const filePath = await writeJsonFixture({
    assets: [dummyAsset()],
    transactions: [
      tx({ id: 'dup-1', date: '2026-01-01', name: 'E2E24-E', type: 'buy', quantity: 100 }), // 이미 존재 - 건너뜀
      tx({ id: 'e2', date: '2026-01-02', name: 'E2E24-E', type: 'sell', quantity: 30 }), // 신규, 정상
    ],
  });
  await doImport(page, filePath, 'append');
  await expect(page.locator('#toastContainer')).toContainText('추가');
  const txCount = await page.evaluate(() => state.transactions.length);
  expect(txCount).toBe(2); // 중복 1건 스킵 + 신규 1건만 추가(이중계상 없음)
  fs.unlinkSync(filePath);
});

test('F/G. 거부 후 기존 데이터가 완전히 동일하고, 정상 append 후 실현손익이 올바르게 반영된다', async ({ page }) => {
  await resetState(page);
  await page.evaluate(() => {
    state.transactions = [{
      id: 'fg-1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E2E24-FG',
      type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, createdAt: Date.now(),
    }];
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  await page.reload();
  await page.getByText('거래내역', { exact: true }).click();
  const beforeSnapshot = await page.evaluate(() => JSON.stringify(state.transactions));

  // F: 거부 케이스
  const badFile = await writeJsonFixture({
    assets: [dummyAsset()], transactions: [tx({ id: 'fg-2', date: '2026-01-02', name: 'E2E24-FG', type: 'sell', quantity: 999 })],
  });
  page.once('dialog', async (dialog) => { await dialog.accept(); });
  await doImport(page, badFile, 'append');
  const afterRejectSnapshot = await page.evaluate(() => JSON.stringify(state.transactions));
  expect(afterRejectSnapshot).toBe(beforeSnapshot); // 완전히 동일(바이트 단위 비교)
  fs.unlinkSync(badFile);

  // G: 정상 append 후 실현손익 반영 확인
  const goodFile = await writeJsonFixture({
    assets: [dummyAsset()], transactions: [tx({ id: 'fg-3', date: '2026-01-03', name: 'E2E24-FG', type: 'sell', quantity: 40, price: 15000 })],
  });
  await doImport(page, goodFile, 'append');
  await expect(page.locator('#toastContainer')).toContainText('추가');
  // [G] positions/realized P&L은 항상 state.transactions로부터 다시 계산되므로(state.assets 동기화
  // 여부와 무관), 방금 append된 거래(매도 40)가 정확히 반영됐는지 여기서 직접 확인한다.
  const { qty, realized } = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    const pos = Object.values(positions).find((p) => p.name === 'E2E24-FG');
    return { qty: pos ? pos.quantity : null, realized: pos ? pos.realizedPnL : null };
  });
  expect(qty).toBe(60); // 100 - 40
  expect(realized).toBe(40 * (15000 - 10000)); // (매도가-평단가)*수량 = 200,000
  fs.unlinkSync(goodFile);
});
