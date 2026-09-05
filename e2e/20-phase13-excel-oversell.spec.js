// E2E-20 Phase 13 - Excel 대량 거래입력 초과매도 검증. 단건 거래 입력(e2e/09에서 이미 검증됨)과
// 동일한 수준의 매도 초과 차단을 Excel 업로드 경로에도 적용했는지, 실제 파일 업로드(setInputFiles)로
// 검증한다. 앱이 이미 로드하는 SheetJS(XLSX, index.html에서 CDN으로 로드)를 브라우저 안에서 그대로
// 써서 테스트용 .xlsx 바이트를 만든다(별도 npm 의존성 추가 없음) - fs로 임시 파일에 쓴 뒤
// setInputFiles로 실제 <input type="file">에 주입한다.
/* global XLSX */
// XLSX는 page.evaluate() 콜백 안에서 브라우저 전역(index.html이 CDN으로 로드하는 SheetJS)으로만
// 쓰인다 - Node 쪽 eslint 스캔 대상이 아니라 위 directive로 명시한다(js/**/*.js 자동 globals 스캔은
// 이 프로젝트 자체 파일만 훑으므로 CDN 전역까지는 못 잡는다).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function resetTransactionsState(page) {
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

// rows: [{구분,일자,소유자,계좌구분,종목명,티커,거래유형,수량,매매단가,통화,적용환율,수수료}]
async function writeExcelFixture(page, rows) {
  const base64 = await page.evaluate((rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '거래내역');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, rows);
  const filePath = path.join(os.tmpdir(), `e2e20-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

function row(o) {
  return {
    '구분': o.origin || '기간', '일자': o.date, '소유자': o.owner || '신랑', '계좌구분': o.accountType || '일반계좌',
    '종목명': o.name, '티커': o.ticker || '', '거래유형': o.type === 'sell' ? '매도' : '매수',
    '수량': o.quantity, '매매단가': o.price, '통화': 'KRW', '적용환율': '', '수수료': 0
  };
}

test('Excel 업로드 - 정상 거래(매수 후 일부 매도)는 그대로 반영된다', async ({ page }) => {
  await resetTransactionsState(page);
  const filePath = await writeExcelFixture(page, [
    row({ origin: '최초', date: '2026-01-01', name: 'E2E20-정상', type: 'buy', quantity: 100, price: 70000 }),
    row({ date: '2026-01-02', name: 'E2E20-정상', type: 'sell', quantity: 30, price: 75000 }),
  ]);

  // [Phase 18 P2-3] 거래등록 버튼이 "Excel로 거래 관리" 아코디언 안으로 이동했다 - 먼저 그 아코디언을
  // 펼쳐야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#txExcelAccordionBtn').click();
  await page.locator('#importTxExcelBtn').click();
  await page.locator('#txExcelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceAppendBtn').click();

  await expect(page.locator('#txListContainer')).toContainText('E2E20-정상');
  const qty = await page.evaluate(() => state.assets.find((a) => a.name === 'E2E20-정상').quantity);
  expect(qty).toBe(70);
  const txCount = await page.evaluate(() => state.transactions.filter((t) => t.name === 'E2E20-정상').length);
  expect(txCount).toBe(2);

  fs.unlinkSync(filePath);
});

test('Excel 업로드 - 보유수량을 초과하는 매도가 있으면 전체 파일이 거부되고 오류가 표시된다(추가하기)', async ({ page }) => {
  await resetTransactionsState(page);
  // 기존 정상 데이터 하나를 미리 심어둔다 - 업로드 실패 후에도 이 데이터가 훼손되지 않는지 함께 확인.
  await page.evaluate(() => {
    state.transactions.push({
      id: 'pre-existing-1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: '', name: 'E2E20-기존정상', type: 'buy', quantity: 50, price: 60000, currency: 'KRW', fee: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
  });
  await page.reload();
  await page.getByText('거래내역', { exact: true }).click();

  const filePath = await writeExcelFixture(page, [
    row({ origin: '최초', date: '2026-01-01', name: 'E2E20-초과매도', type: 'buy', quantity: 100, price: 70000 }),
    // PM이 준 예시 그대로: 30(정상)/40(정상)/50(거부 - 잔여 30에서 50 매도 시도)
    row({ date: '2026-01-02', name: 'E2E20-초과매도', type: 'sell', quantity: 30, price: 75000 }),
    row({ date: '2026-01-03', name: 'E2E20-초과매도', type: 'sell', quantity: 40, price: 75000 }),
    row({ date: '2026-01-04', name: 'E2E20-초과매도', type: 'sell', quantity: 50, price: 75000 }),
  ]);

  let alertMessage = '';
  page.once('dialog', async (dialog) => { alertMessage = dialog.message(); await dialog.accept(); });

  // [Phase 18 P2-3] 거래등록 버튼이 "Excel로 거래 관리" 아코디언 안으로 이동했다 - 먼저 그 아코디언을
  // 펼쳐야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#txExcelAccordionBtn').click();
  await page.locator('#importTxExcelBtn').click();
  await page.locator('#txExcelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceAppendBtn').click();

  await expect.poll(() => alertMessage).toContain('초과 매도가 발견되어');
  expect(alertMessage).toContain('E2E20-초과매도');
  expect(alertMessage).toContain('매도');
  // 30 매도(정상)/40 매도(정상)에 대해서는 오류가 없어야 하고, 오직 세 번째(50) 행만 위반으로 지목돼야 한다.
  expect((alertMessage.match(/E2E20-초과매도/g) || []).length).toBe(1);

  // 파일 전체가 거부되었으므로 이 종목의 거래는 하나도 들어가지 않아야 한다(30/40은 정상이었지만 부분반영 금지).
  const newTxCount = await page.evaluate(() => state.transactions.filter((t) => t.name === 'E2E20-초과매도').length);
  expect(newTxCount).toBe(0);
  const assetExists = await page.evaluate(() => !!state.assets.find((a) => a.name === 'E2E20-초과매도'));
  expect(assetExists).toBe(false);

  // 기존 정상 데이터는 훼손되지 않아야 한다.
  const existingQty = await page.evaluate(() => state.assets.find((a) => a.name === 'E2E20-기존정상').quantity);
  expect(existingQty).toBe(50);
  const existingTxCount = await page.evaluate(() => state.transactions.filter((t) => t.name === 'E2E20-기존정상').length);
  expect(existingTxCount).toBe(1);

  fs.unlinkSync(filePath);
});

test('Excel 업로드 - 이미 보유 중인 자산에 대해 초과 매도가 있으면(덮어쓰기 모드) 파일 전체가 거부된다', async ({ page }) => {
  await resetTransactionsState(page);
  const filePath = await writeExcelFixture(page, [
    row({ origin: '최초', date: '2026-01-01', name: 'E2E20-덮어쓰기초과', type: 'buy', quantity: 10, price: 70000 }),
    row({ date: '2026-01-02', name: 'E2E20-덮어쓰기초과', type: 'sell', quantity: 15, price: 75000 }),
  ]);

  // [덮어쓰기 전 추가 경고] "정말 삭제하시겠습니까"라는 네이티브 confirm()이 먼저 뜨고(수락해야
  // choice='overwrite' 분기로 넘어감, js/12 openImportChoiceModal 참고), 그 다음에야 초과매도
  // alert()가 뜬다 - 순서대로 두 개의 서로 다른 dialog가 발생하므로 once가 아니라 지속 핸들러로
  // 타입별로 처리한다.
  let alertMessage = '';
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'confirm') { await dialog.accept(); return; }
    alertMessage = dialog.message();
    await dialog.accept();
  });

  // [Phase 18 P2-3] 거래등록 버튼이 "Excel로 거래 관리" 아코디언 안으로 이동했다 - 먼저 그 아코디언을
  // 펼쳐야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#txExcelAccordionBtn').click();
  await page.locator('#importTxExcelBtn').click();
  await page.locator('#txExcelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();

  await expect.poll(() => alertMessage).toContain('초과 매도가 발견되어');
  const txCount = await page.evaluate(() => state.transactions.length);
  expect(txCount).toBe(0); // 덮어쓰기 자체가 거부되어 기존(빈) 상태 그대로 유지

  fs.unlinkSync(filePath);
});

test('Excel 업로드 - 여러 종목이 섞인 파일에서 한 종목만 초과매도여도 전체가 거부된다', async ({ page }) => {
  await resetTransactionsState(page);
  const filePath = await writeExcelFixture(page, [
    row({ origin: '최초', date: '2026-01-01', name: 'E2E20-삼성', type: 'buy', quantity: 100, price: 70000 }),
    row({ origin: '최초', date: '2026-01-01', name: 'E2E20-하이닉스', type: 'buy', quantity: 50, price: 150000 }),
    row({ date: '2026-01-02', name: 'E2E20-삼성', type: 'sell', quantity: 30, price: 75000 }),
    row({ date: '2026-01-02', name: 'E2E20-하이닉스', type: 'sell', quantity: 60, price: 160000 }), // 60 > 50 초과
  ]);

  let alertMessage = '';
  page.once('dialog', async (dialog) => { alertMessage = dialog.message(); await dialog.accept(); });

  // [Phase 18 P2-3] 거래등록 버튼이 "Excel로 거래 관리" 아코디언 안으로 이동했다 - 먼저 그 아코디언을
  // 펼쳐야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#txExcelAccordionBtn').click();
  await page.locator('#importTxExcelBtn').click();
  await page.locator('#txExcelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceAppendBtn').click();

  await expect.poll(() => alertMessage).toContain('초과 매도가 발견되어');
  expect(alertMessage).toContain('E2E20-하이닉스');
  expect(alertMessage).not.toContain('E2E20-삼성'); // 삼성 매도(30<=100)는 정상이라 오류 목록에 없어야 한다

  // 정상 종목(삼성)도 함께 거부되어야 한다(atomic - 파일 전체 반영/전체 거부).
  const anyTx = await page.evaluate(() => state.transactions.length);
  expect(anyTx).toBe(0);

  fs.unlinkSync(filePath);
});
