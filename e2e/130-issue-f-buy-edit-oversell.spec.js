// E2E-130 [PM 지시 2026-09-27 · ISSUE-F] 매수 거래 수정이 기존 매도를 과매도로 만드는 경우.
//
// PM 지시 §4의 필수 시나리오 10가지를 실제 화면에서 그대로 실행한다.
//   1) 매수 10 / 매도 8 → 매수 10→5  → 차단 · 취소 시 원상 유지
//   2) 매수 10→8   → 정상 저장
//   3) 매수 10→9   → 정상 저장
//   4) 매수 10→15  → 정상 저장
//   5) 매도 8→10   → 기존 정책대로 정상 처리
//   6) 매도 8→11   → 기존 과매도 검증 작동
//   7) 매수 수정 취소 → 거래 · 자산 · 실현손익 모두 변경 없음
//   8) 검증 실패 후 재진입 → 기존 거래 상태가 깨지지 않음
//   9) 거래 수정 후 새로고침 → 저장된 정상 상태 유지
//  10) Asset ↔ Transaction ↔ 실현손익 연결 유지
//
// 전부 합성 데이터(ZZ 접두어)이며 외부 네트워크를 쓰지 않는다.
/* global document */
const { test, expect } = require('@playwright/test');

const BUY = {
  id: 'zz-f-buy', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0130.KS',
  name: 'ZZ합성주식130', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};
const SELL = {
  id: 'zz-f-sell', date: '2026-09-05', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0130.KS',
  name: 'ZZ합성주식130', type: 'sell', quantity: 8, price: 1200, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 2000, updatedAt: 2000
};

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof openTransactionModal === 'function' && typeof findOversellAfterTransactionEdit === 'function');
  await page.evaluate(({ buy, sell }) => {
    localStorage.clear();
    state.assets = []; state.bondPositions = [];
    state.transactions = [buy, sell];
    persistAssets(true); persistTransactions(); persistBondPositions();
    syncAssetsFromTransactions();
    renderAll();
  }, { buy: BUY, sell: SELL });
  await page.waitForTimeout(200);
}

// 이 포지션의 전부 - 거래 · 자산 · 실현손익을 한 번에 본다(부분 저장이 없는지 확인용).
const snapshot = (page) => page.evaluate(() => {
  const asset = state.assets.find((a) => a.ticker === 'ZZ0130.KS');
  return {
    buy: (state.transactions.find((t) => t.id === 'zz-f-buy') || {}).quantity,
    buyDate: (state.transactions.find((t) => t.id === 'zz-f-buy') || {}).date,
    sell: (state.transactions.find((t) => t.id === 'zz-f-sell') || {}).quantity,
    txCount: state.transactions.length,
    assetQty: asset ? num(asset.quantity) : null,
    assetBuyPrice: asset ? num(asset.buyPrice) : null,
    realized: Object.values(computePositionsAndRealizedPnL().positions)
      .reduce((sum, p) => sum + num(p.realizedPnL), 0)
  };
});

// 거래 수정 팝업을 열고 한 칸만 고친 뒤 저장을 누른다.
async function editAndSubmit(page, txId, field, value) {
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate((id) => openTransactionModal(id), txId);
  await expect(page.locator('#transactionModal')).toBeVisible();
  await page.locator(field).fill(String(value));
  await page.locator('#transactionForm button[type="submit"]').click();
}

/* ══════════════ 전제 ══════════════ */

test('F0. 시작 상태 - 매수 10 · 매도 8 · 보유 2 · 실현손익 1,600원', async ({ page }) => {
  await open(page);
  expect(await snapshot(page)).toEqual({
    buy: 10, buyDate: '2026-09-01', sell: 8, txCount: 2,
    assetQty: 2, assetBuyPrice: 1000,
    realized: 1600 // (1200 - 1000) * 8
  });
});

/* ══════════════ 1) 차단 ══════════════ */

test('F1. 매수 10 → 5 로 줄이면 저장을 막고, 아무것도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 5);

  await expect(page.getByText('저장하지 않았습니다', { exact: false })).toBeVisible();
  await expect(page.locator('#transactionModal'), '저장하지 않았으므로 팝업이 열려 있다').toBeVisible();
  // 안내가 무엇이 문제인지 구체적으로 말한다 - 어느 매도가, 그 시점 보유수량이 얼마인지.
  // (날짜만 찾으면 거래 목록의 같은 날짜에도 걸리므로 안내 문구 전체로 확인한다.)
  await expect(page.getByText('이렇게 고치면 2026-09-05 매도(8)가 그 시점 보유수량(5)을 넘어섭니다', { exact: false })).toBeVisible();

  expect(await snapshot(page), '거래 · 자산 · 실현손익 전부 그대로다').toEqual(before);
});

test('F1-b. 막힌 뒤 [취소]로 닫으면 역시 아무것도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 5);
  await expect(page.locator('#transactionModal')).toBeVisible();
  await page.locator('#closeTxModalBtn').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await snapshot(page)).toEqual(before);
});

/* ══════════════ 2~4) 정상 저장 ══════════════ */

test('F2. 매수 10 → 8 (매도와 같다)은 정상 저장된다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 8);
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.buy).toBe(8);
  expect(after.sell, '매도는 건드리지 않는다').toBe(8);
  expect(after.assetQty, '보유량 0').toBe(0);
  expect(after.realized, '매도 8 전부가 실현된다 - 잘리지 않았다').toBe(1600);
});

test('F3. 매수 10 → 9 는 정상 저장된다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 9);
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.buy).toBe(9);
  expect(after.assetQty).toBe(1);
  expect(after.realized).toBe(1600);
});

test('F4. 매수 10 → 15 (늘리는 수정)는 정상 저장된다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 15);
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.buy).toBe(15);
  expect(after.assetQty).toBe(7);
  expect(after.realized).toBe(1600);
});

/* ══════════════ 5~6) 매도 수정 - 기존 정책 그대로 ══════════════ */

test('F5. 매도 8 → 10 (보유수량 이내)은 기존 정책대로 정상 처리된다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-sell', '#tx_quantity', 10);
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.sell).toBe(10);
  expect(after.buy, '매수는 그대로다').toBe(10);
  expect(after.assetQty).toBe(0);
  expect(after.realized, '(1200 - 1000) * 10').toBe(2000);
});

test('F6. 매도 8 → 11 (보유수량 초과)은 기존 과매도 검증이 막는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await editAndSubmit(page, 'zz-f-sell', '#tx_quantity', 11);
  await expect(page.getByText('보다 많은 수량을 매도할 수 없습니다', { exact: false }),
    '기존 문구 그대로다(이번에 바꾸지 않았다)').toBeVisible();
  await expect(page.locator('#transactionModal')).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

/* ══════════════ 7) 수정 취소 ══════════════ */

test('F7. 매수 수정을 저장하지 않고 취소하면 아무것도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate(() => openTransactionModal('zz-f-buy'));
  await page.locator('#tx_quantity').fill('3');
  await page.locator('#tx_price').fill('7777');
  await page.locator('#closeTxModalBtn').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await snapshot(page), '입력만 하고 저장하지 않으면 그대로다').toEqual(before);
});

/* ══════════════ 8) 실패 후 재진입 ══════════════ */

test('F8. 막힌 뒤 다시 열면 기존 값이 그대로 보이고, 이어서 정상 저장할 수 있다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 5);
  await expect(page.locator('#transactionModal')).toBeVisible();
  await page.locator('#closeTxModalBtn').click();

  // 다시 열면 저장된 원래 값(10)이 보인다 - 실패한 입력이 남아 상태를 깨뜨리지 않는다.
  await page.evaluate(() => openTransactionModal('zz-f-buy'));
  await expect(page.locator('#transactionModal')).toBeVisible();
  expect(await page.locator('#tx_quantity').inputValue()).toBe('10');
  expect(await page.locator('#tx_price').inputValue()).toBe('1000');

  // 허용되는 값으로 고치면 정상 저장된다.
  await page.locator('#tx_quantity').fill('9');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.buy).toBe(9);
  expect(after.assetQty).toBe(1);
});

/* ══════════════ 9) 새로고침 후 유지 ══════════════ */

test('F9. 정상 저장한 수정은 새로고침 후에도 유지된다', async ({ page }) => {
  await open(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 9);
  await expect(page.locator('#transactionModal')).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.transactions.length > 0);
  await page.waitForTimeout(500);
  const after = await snapshot(page);
  expect(after.buy, '저장된 9가 남아 있다').toBe(9);
  expect(after.sell).toBe(8);
  expect(after.assetQty).toBe(1);
  expect(after.realized).toBe(1600);
});

test('F9-b. 막힌 수정은 새로고침 후에도 반영되지 않는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 5);
  await page.locator('#closeTxModalBtn').click();
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.transactions.length > 0);
  await page.waitForTimeout(500);
  expect(await snapshot(page)).toEqual(before);
});

/* ══════════════ 10) 연결 무결성 ══════════════ */

test('F10. Asset ↔ Transaction ↔ 실현손익 연결이 수정 전후로 끊기지 않는다', async ({ page }) => {
  await open(page);
  const check = () => page.evaluate(() => {
    const ledger = computePositionsAndRealizedPnL().positions;
    const asset = state.assets.find((a) => a.ticker === 'ZZ0130.KS');
    const key = Object.keys(ledger)[0];
    return {
      ledgerKeys: Object.keys(ledger).length,
      assetExists: !!asset,
      assetTracked: asset ? isTransactionTracked(asset) : null,
      // 자산 수량이 원장 수량과 같은가(동기화가 끊기지 않았는가)
      matches: asset ? num(asset.quantity) === num(ledger[key].quantity) : null,
      orphanTx: state.transactions.filter((t) => !state.assets.some((a) => assetMatchesLedgerIdentity(a, t))).length,
      dupAssetIds: state.assets.length - new Set(state.assets.map((a) => a.id)).size
    };
  });
  expect(await check(), '수정 전').toEqual({ ledgerKeys: 1, assetExists: true, assetTracked: true, matches: true, orphanTx: 0, dupAssetIds: 0 });

  // 막힌 수정 뒤에도 연결이 그대로여야 한다.
  await editAndSubmit(page, 'zz-f-buy', '#tx_quantity', 5);
  await page.locator('#closeTxModalBtn').click();
  expect(await check(), '막힌 수정 뒤').toEqual({ ledgerKeys: 1, assetExists: true, assetTracked: true, matches: true, orphanTx: 0, dupAssetIds: 0 });

  // 정상 수정 뒤에도 그대로여야 한다.
  await page.evaluate(() => openTransactionModal('zz-f-buy'));
  await page.locator('#tx_quantity').fill('12');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await check(), '정상 수정 뒤').toEqual({ ledgerKeys: 1, assetExists: true, assetTracked: true, matches: true, orphanTx: 0, dupAssetIds: 0 });
  expect((await snapshot(page)).assetQty).toBe(4);
});

/* ══════════════ 같은 규칙이 잡는 다른 모양 ══════════════ */

test('F11. 매수 날짜를 매도 뒤로 옮기는 수정도 같은 규칙이 막는다', async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await editAndSubmit(page, 'zz-f-buy', '#tx_date', '2026-09-10');
  await expect(page.getByText('저장하지 않았습니다', { exact: false })).toBeVisible();
  expect(await snapshot(page), '수량을 건드리지 않아도 같은 문제라 막는다').toEqual(before);
});

test('F12. 새 매수 거래 추가는 막지 않는다(보유수량을 줄이지 않는다)', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.locator('#addTransactionBtn').click();
  await expect(page.locator('#transactionModal')).toBeVisible();
  await page.evaluate(() => {
    document.getElementById('tx_date').value = '2026-09-20';
    document.getElementById('tx_type').value = 'buy';
    document.getElementById('tx_owner').value = '신랑';
    document.getElementById('tx_accountType').value = '일반계좌';
    document.getElementById('tx_ticker').value = 'ZZ0130.KS';
    document.getElementById('tx_name').value = 'ZZ합성주식130';
    document.getElementById('tx_currency').value = 'KRW';
    document.getElementById('tx_quantity').value = '4';
    document.getElementById('tx_price').value = '1300';
  });
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.txCount).toBe(3);
  expect(after.assetQty, '2 + 4').toBe(6);
});
