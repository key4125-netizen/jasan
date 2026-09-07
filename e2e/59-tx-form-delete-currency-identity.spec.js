// E2E-59 [B-5 후속] 거래 폼·거래 삭제 경로의 자산 조회도 통화까지 본다.
//
// B-5에서 거래원장 동기화(syncAssetsFromTransactions)·포지션 계산·초과매도 검증의 매칭을 고쳤지만,
// 같은 인라인 규칙이 거래 폼과 삭제 경로 네 곳에 더 남아 있었다(감사에서 발견). 전부 "이 거래의
// 자산을 찾는다"는 같은 판정인데 통화를 보지 않아 같은 이름의 다른 통화 자산이 잡혔다.
//
//   findAssetForTxForm           추천 안내가 다른 통화 자산 기준으로 나옴
//   openTransactionModal         달러 거래를 열면 원화 자산의 대표매칭키/역할이 폼에 채워짐
//   transactionForm submit       달러 거래를 저장했는데 원화 자산에 대표매칭키/역할이 쓰임
//   deleteTransaction            ★ 달러 거래를 지우면 무관한 원화 자산의 수량이 0으로 지워짐(P0)
//
// 판정만 assetMatchesLedgerIdentity / transactionIdentityKey로 통일했고 정리 규칙·가드·순서는
// 그대로다. 외부 네트워크를 쓰지 않는다(무티커 채권 시드 + DNS 격리).
const { test, expect } = require('@playwright/test');

// 같은 계좌에 이름이 같은 원화 실물채권과 달러 실물채권을 둔다 - 원화 쪽에만 사용자가 대표매칭키와
// 역할을 지정해 둔 상태다(그 값이 달러 거래 때문에 흔들리면 안 된다).
async function seedTwoCurrencyBond(page, opts) {
  const { withUsdTx = true, withKrwTx = true } = opts || {};
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(({ withUsdTx, withKrwTx }) => {
    state.exchangeRate = 1450;
    persistRate(true);
    const bond = (currency, isDomestic, quantity, buyPrice, extra) => makeAsset(Object.assign({
      ticker: '', name: 'E59실물채권', category: '채권', currency, isDomestic,
      owner: '신랑', accountType: '일반계좌', quantity, buyPrice, currentPrice: buyPrice,
    }, extra || {}));
    state.assets = [
      bond('KRW', '국내', 100, 10000, { rateMatchOverride: 'KOSPI', role: 'defender' }),
      bond('USD', '해외', 50, 100, {}),
    ];
    const tx = (id, currency, quantity, price, createdAt) => ({
      id, date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E59실물채권',
      type: 'buy', quantity, price, currency, appliedRate: currency === 'USD' ? 1300 : undefined,
      fee: 0, origin: 'initial', createdAt, updatedAt: createdAt,
    });
    state.transactions = [];
    if (withKrwTx) state.transactions.push(tx('e59krw', 'KRW', 100, 10000, 1));
    if (withUsdTx) state.transactions.push(tx('e59usd', 'USD', 50, 100, 2));
    persistAssets();
    persistTransactions();
  }, { withUsdTx, withKrwTx });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

test('1. [P0] 달러 거래를 지워도 같은 이름의 원화 자산 수량이 지워지지 않는다', async ({ page }) => {
  // 원화 자산만 있고 달러 거래만 있는 상태 - 수정 전에는 여기서 원화 자산 수량이 100 -> 0이 됐다.
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ticker: '', name: 'E59실물채권', category: '채권', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 10000, currentPrice: 10000 })];
    state.transactions = [{ id: 'e59usd', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E59실물채권', type: 'buy', quantity: 50, price: 100, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    const before = state.assets.map((a) => `${a.currency}/${a.quantity}`);
    const realConfirm = win.confirm;
    win.confirm = () => true;   // 삭제 확인 대화상자만 통과시킨다
    try { deleteTransaction('e59usd'); } finally { win.confirm = realConfirm; }
    return { before, after: state.assets.map((a) => `${a.currency}/${a.quantity}`), txCount: state.transactions.length };
  });
  expect(r.before).toEqual(['KRW/100']);
  expect(r.txCount).toBe(0);
  // 수정 전에는 여기가 ['KRW/0'] 이었다 - 달러 거래 삭제가 원화 자산을 지웠다.
  expect(r.after).toEqual(['KRW/100']);
});

test('2. 달러 거래를 지우면 달러 자산만 0으로 정리되고 원화 자산은 그대로다', async ({ page }) => {
  await seedTwoCurrencyBond(page);
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const before = state.assets.map((a) => `${a.currency}/${a.quantity}`);
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e59usd'); } finally { win.confirm = realConfirm; }
    return { before, after: state.assets.map((a) => `${a.currency}/${a.quantity}`) };
  });
  expect(r.before).toEqual(['KRW/100', 'USD/50']);
  // 달러 거래가 사라졌으므로 달러 자산만 0. 수정 전에는 남아 있는 원화 거래 때문에 stillHasTx가
  // true가 되어 달러 자산이 50인 채로 고아가 됐다.
  expect(r.after).toEqual(['KRW/100', 'USD/0']);
});

test('3. 거래 수정 모달이 그 거래와 같은 통화의 자산 값을 보여준다', async ({ page }) => {
  await seedTwoCurrencyBond(page);
  const r = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    openTransactionModal('e59usd');  // 달러 거래를 연다
    const shown = {
      rateMatch: doc.getElementById('tx_rateMatchOverride').value,
      role: doc.getElementById('tx_role').value,
      currency: doc.getElementById('tx_currency').value,
    };
    closeTransactionModal();
    return shown;
  });
  expect(r.currency).toBe('USD');
  // 달러 자산에는 아무 것도 지정돼 있지 않다. 수정 전에는 원화 자산의 값(KOSPI / defender)이 채워졌고,
  // 그대로 저장하면 그 값이 달러 자산으로 옮겨 붙었다.
  expect(r.rateMatch).toBe('');
  expect(r.role).toBe('');
});

test('4. 거래를 저장하면 그 거래와 같은 통화의 자산에만 대표매칭키·역할이 쓰인다', async ({ page }) => {
  await seedTwoCurrencyBond(page);
  await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    openTransactionModal('e59usd');
    // 이 달러 거래에 대표매칭키와 역할을 새로 지정한다.
    ensureRateMatchOption('CASH');
    doc.getElementById('tx_rateMatchOverride').value = 'CASH';
    doc.getElementById('tx_role').value = 'attacker';
    doc.getElementById('transactionForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  });
  // 저장이 끝나면 모달이 닫힌다 - 저장 핸들러가 실제로 끝까지 실행됐음을 확인한다.
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);

  const r = await page.locator('body').evaluate(() => state.assets.map((a) => `${a.currency}/${a.rateMatchOverride ?? '-'}/${a.role ?? '-'}`));
  // 수정 전에는 원화 자산이 잡혀 KRW 쪽이 CASH/attacker로 덮어써지고 달러 자산은 그대로였다.
  expect(r).toEqual(['KRW/KOSPI/defender', 'USD/CASH/attacker']);
});

test('5. [대조군] 티커가 있는 자산과 이름이 다른 자산은 예전과 똑같이 동작한다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [
      makeAsset({ ticker: 'AAPL', name: 'E59Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120 }),
      makeAsset({ ticker: '', name: 'E59원화채권', category: '채권', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 10000, currentPrice: 10000 }),
    ];
    state.transactions = [
      { id: 'e59aapl', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'AAPL', name: 'E59Apple', type: 'buy', quantity: 100, price: 100, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'e59krw', date: '2025-01-02', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E59원화채권', type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 2, updatedAt: 2 },
    ];
    persistAssets(); persistTransactions();
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e59aapl'); } finally { win.confirm = realConfirm; }
    return state.assets.map((a) => `${a.name}/${a.quantity}`);
  });
  // 티커 자산은 예전 규칙 그대로 - 거래를 지우면 그 자산만 0이 되고 다른 자산은 건드리지 않는다.
  expect(r).toEqual(['E59Apple/0', 'E59원화채권/100']);
});
