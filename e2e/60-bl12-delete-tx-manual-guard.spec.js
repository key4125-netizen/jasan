// E2E-60 [BL-12] 거래 삭제의 고아 자산 정리가 manual 자산을 지우지 않는다.
//
// syncAssetsFromTransactions에는 positionSource === 'manual' 자산을 거래원장이 덮어쓰지 못하게 하는
// 가드가 있는데, deleteTransaction의 고아 정리 분기에만 그 가드가 빠져 있었다. 그래서 manual 자산
// 100주 + 연결된 거래 1건 상태에서 그 거래를 지우면(= 마지막 남은 거래라 positions에서 키가 사라져
// sync가 손대지 못하고 고아 정리 분기로 넘어간다) manual 자산 수량이 0으로 지워졌다.
//
// 이 파일은 그 한 가지 가드 누락만 고정한다. 정리 규칙 자체(ledger 자산 0 처리, 현금 제외, 통화까지
// 보는 매칭)는 그대로다. 외부 네트워크를 쓰지 않는다(무티커/시드 자산 + DNS 격리).
const { test, expect } = require('@playwright/test');

// 하나의 소유자·계좌에 자산 1건 + 그 자산과 매칭되는 거래 1건을 심는다.
// positionSource만 바꿔가며 같은 시나리오를 돌려 manual/ledger/legacy의 차이를 본다.
async function seedOne(page, opts) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  return page.locator('body').evaluate((el, o) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450;
    persistRate(true);
    state.assets = [makeAsset({
      ticker: o.ticker, name: o.name, category: o.category, currency: o.currency,
      isDomestic: o.currency === 'USD' ? '해외' : '국내', owner: '신랑', accountType: '일반계좌',
      quantity: o.quantity, buyPrice: o.buyPrice, currentPrice: o.buyPrice,
      buyRate: o.currency === 'USD' ? 1300 : undefined,
      rateMatchOverride: o.rateMatchOverride, role: o.role, positionSource: o.positionSource,
    })];
    state.transactions = [{
      id: 'e60tx', date: '2025-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: o.ticker, name: o.name, type: 'buy', quantity: o.txQuantity, price: o.txPrice,
      currency: o.currency, appliedRate: o.currency === 'USD' ? 1300 : undefined,
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1,
    }];
    persistAssets();
    persistTransactions();
    const snap = () => state.assets.map((a) => ({
      name: a.name, quantity: a.quantity, buyPrice: a.buyPrice, buyRate: a.buyRate ?? null,
      rateMatchOverride: a.rateMatchOverride ?? null, role: a.role ?? null,
      positionSource: a.positionSource ?? null,
    }));
    const before = snap();
    const realConfirm = win.confirm;
    win.confirm = () => true;   // 삭제 확인 대화상자만 통과시킨다
    try { deleteTransaction('e60tx'); } finally { win.confirm = realConfirm; }
    return { before, after: snap(), txCount: state.transactions.length };
  }, opts);
}

const BASE = {
  ticker: '005930.KS', name: 'E60삼성전자', category: '주식', currency: 'KRW',
  quantity: 100, buyPrice: 70000, txQuantity: 70, txPrice: 50000,
};

test('A. [BL-12] manual 자산은 연결된 거래를 지워도 삭제되거나 0이 되지 않는다', async ({ page }) => {
  const r = await seedOne(page, Object.assign({}, BASE, {
    positionSource: 'manual', rateMatchOverride: 'KOSPI', role: 'core',
  }));
  expect(r.before[0].quantity).toBe(100);
  expect(r.txCount).toBe(0);              // 거래만 정상적으로 삭제된다
  expect(r.after).toHaveLength(1);        // 자산이 사라지지 않는다
  // 수정 전에는 여기가 0이었다 - 고아 정리 분기에 manual 가드가 없어서 지워졌다.
  expect(r.after[0].quantity).toBe(100);
  // 보유정보도 그대로 유지된다(수량만 지켜지고 나머지가 흔들리면 안 된다).
  expect(r.after[0].buyPrice).toBe(70000);
  expect(r.after[0].rateMatchOverride).toBe('KOSPI');
  expect(r.after[0].role).toBe('core');
  expect(r.after[0].positionSource).toBe('manual');  // 표식을 자동으로 바꾸지 않는다
});

test('B. ledger 자산의 기존 고아 정리 동작은 그대로다', async ({ page }) => {
  const r = await seedOne(page, Object.assign({}, BASE, { positionSource: 'ledger' }));
  expect(r.before[0].quantity).toBe(100);
  expect(r.txCount).toBe(0);
  expect(r.after).toHaveLength(1);
  expect(r.after[0].quantity).toBe(0);               // 예전 그대로 - 거래가 사라졌으니 0
  expect(r.after[0].positionSource).toBe('ledger');
});

test('C. legacy 자산(표식 없음)의 기존 동작도 그대로다', async ({ page }) => {
  const r = await seedOne(page, Object.assign({}, BASE, { positionSource: undefined }));
  expect(r.before[0].positionSource).toBeNull();
  expect(r.after[0].quantity).toBe(0);               // 예전 그대로 - 표식이 없으면 추정하지 않는다
  expect(r.after[0].positionSource).toBeNull();      // legacy를 manual/ledger로 승격시키지 않는다
});

test('D. manual 달러 자산도 거래 삭제로 지워지지 않는다(환율정보 유지)', async ({ page }) => {
  const r = await seedOne(page, Object.assign({}, BASE, {
    ticker: 'AAPL', name: 'E60Apple', currency: 'USD',
    quantity: 100, buyPrice: 100, txQuantity: 70, txPrice: 90, positionSource: 'manual',
  }));
  expect(r.after[0].quantity).toBe(100);
  expect(r.after[0].buyPrice).toBe(100);
  expect(r.after[0].buyRate).toBe(1300);             // 매수시점 환율도 그대로
});

test('E. manual 달러 현금 자산도 거래 삭제로 지워지지 않는다', async ({ page }) => {
  // 달러 현금은 현금 가드(category !== "현금")로도 이미 보호되지만, manual 표식만으로도 보호돼야
  // 한다는 것을 함께 고정한다 - 두 가드가 서로 독립적이다.
  const r = await seedOne(page, Object.assign({}, BASE, {
    ticker: '', name: 'E60달러예수금', category: '현금', currency: 'USD',
    quantity: 10000, buyPrice: 1, txQuantity: 5000, txPrice: 1, positionSource: 'manual',
  }));
  expect(r.after[0].quantity).toBe(10000);
  expect(r.after[0].positionSource).toBe('manual');
});

test('F. [대조군] 거래가 하나 더 남아 있으면 어떤 표식이든 고아 정리 자체가 일어나지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ticker: '005930.KS', name: 'E60삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000, currentPrice: 80000, positionSource: 'ledger' })];
    const tx = (id, qty, price, createdAt) => ({ id, date: '2025-01-0' + createdAt, owner: '신랑', accountType: '일반계좌', ticker: '005930.KS', name: 'E60삼성전자', type: 'buy', quantity: qty, price, currency: 'KRW', fee: 0, origin: 'initial', createdAt, updatedAt: createdAt });
    state.transactions = [tx('e60a', 70, 50000, 1), tx('e60b', 30, 60000, 2)];
    persistAssets(); persistTransactions();
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e60b'); } finally { win.confirm = realConfirm; }
    return state.assets.map((a) => `${a.quantity}/${a.buyPrice}`);
  });
  // 남은 거래 1건(70주 @50,000) 기준으로 재계산된다 - 고아 정리가 아니라 sync가 처리하는 경로다.
  expect(r).toEqual(['70/50000']);
});
