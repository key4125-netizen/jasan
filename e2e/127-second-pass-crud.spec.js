// E2E-127 [PM 지시 2026-09-26 · 2차 전수 테스트 A · B · C] 1차에서 실행하지 못한 CRUD 경로.
//
//  A. 자산 삭제      - 확인창 취소 · 확인 · 삭제 후 Asset · Portfolio · Risk · MC · 채권 레코드
//  B. 거래 수정      - 수량 · 가격 · 날짜를 바꿨을 때 원장 · 자산 · 평단 · 실현손익
//  C. 거래 삭제      - 취소 · 확인 둘 다, 그리고 삭제 후 자산 수량 되돌림
//
// 1차 전수 테스트에서 이 세 영역을 실행하지 못한 이유는 브라우저 패널이 confirm()을 자동 취소하기
// 때문이었다. Playwright는 dialog를 실제로 눌러 줄 수 있어 여기서 제대로 검증한다.
// 전부 합성 데이터(ZZ 접두어)이며 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof openAssetDetailModal === 'function' && typeof openTransactionModal === 'function');
  await page.evaluate(() => { localStorage.clear(); });
  await page.waitForTimeout(200);
}

/* 수동 관리 자산(positionSource manual) 2건 + 채권 레코드 1건.
 * 거래내역으로 추적되는 자산은 삭제 버튼이 숨으므로(정책) 삭제 테스트에는 manual을 쓴다. */
const seedManual = (page) => page.evaluate(() => {
  state.assets = [
    makeAsset({ id: 'zz-m1', name: 'ZZ수동주식', ticker: 'ZZ0001.KS', category: '주식', categorySource: 'user',
      owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
      quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'manual' }),
    makeAsset({ id: 'zz-m2', name: 'ZZ수동채권', ticker: 'KR1035021DC0', category: '채권', categorySource: 'user',
      owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
      quantity: 200, buyPrice: 10000, currentPrice: 10100, positionSource: 'manual' })
  ];
  state.bondPositions = [makeBondPosition({
    assetId: 'zz-m2', identity: { isin: 'KR1035021DC0', bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2029-12-01', couponRate: 3.5, paymentFrequency: 2 }
  })];
  state.transactions = [];
  persistAssets(true); persistBondPositions(); persistTransactions();
  renderAll();
});

// 거래 목록은 접힌 아코디언 안에 있다 - 실제 사용자처럼 먼저 펼친다.
async function openTxList(page) {
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.waitForTimeout(200);
  const open = await page.evaluate(() => typeof txListAccordionOpen === 'undefined' ? true : !!txListAccordionOpen);
  if (!open) {
    await page.locator('#txListAccordionBtn').click();
    await page.waitForTimeout(400);
  }
}

const snapshot = (page) => page.evaluate(() => ({
  assets: state.assets.length,
  bonds: (state.bondPositions || []).length,
  tx: state.transactions.length,
  totalValue: state.assets.reduce((s, a) => s + (num(a.quantity) * num(a.currentPrice)), 0)
}));

/* ══════════════ A. 자산 삭제 ══════════════ */

test('A-1. 삭제 확인창을 취소하면 아무것도 지워지지 않는다', async ({ page }) => {
  await open(page);
  await seedManual(page);
  const before = await snapshot(page);
  page.once('dialog', async (d) => {
    expect(d.message(), '무엇을 지우는지 이름으로 확인한다').toContain('ZZ수동주식');
    await d.dismiss();
  });
  await page.evaluate(() => openAssetDetailModal('zz-m1'));
  await expect(page.locator('#assetDetailModal')).toBeVisible();
  await page.locator('#assetDetailDeleteBtn').click();
  await page.waitForTimeout(300);
  expect(await snapshot(page), '취소 - 자산 · 채권 · 거래 전부 그대로다').toEqual(before);
  await expect(page.locator('#assetDetailModal'), '취소하면 팝업도 그대로다').toBeVisible();
});

test('A-2. 삭제를 확인하면 자산이 사라지고 팝업이 닫히며 총자산이 줄어든다', async ({ page }) => {
  await open(page);
  await seedManual(page);
  const before = await snapshot(page);
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => openAssetDetailModal('zz-m1'));
  await page.locator('#assetDetailDeleteBtn').click();
  await expect(page.locator('#assetDetailModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.assets, '자산 2건 → 1건').toBe(before.assets - 1);
  expect(after.totalValue, '총 평가금액이 지운 자산만큼 줄어든다').toBe(before.totalValue - 100 * 1200);
  expect(after.bonds, '다른 자산의 채권 레코드는 건드리지 않는다').toBe(before.bonds);
  expect(await page.evaluate(() => state.assets.some((a) => a.id === 'zz-m1'))).toBe(false);
});

test('A-3. 채권 자산을 지우면 연결된 채권 레코드도 함께 정리된다(거래원장이 없을 때만)', async ({ page }) => {
  await open(page);
  await seedManual(page);
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => openAssetDetailModal('zz-m2'));
  await page.locator('#assetDetailDeleteBtn').click();
  await expect(page.locator('#assetDetailModal')).toBeHidden();
  const after = await snapshot(page);
  expect(after.assets).toBe(1);
  expect(after.bonds, '고아가 된 채권 레코드는 남기지 않는다').toBe(0);
});

test('A-4. 삭제 후 Risk · MC가 지운 자산을 더 이상 쓰지 않는다', async ({ page }) => {
  await open(page);
  await seedManual(page);
  const beforeIds = await page.evaluate(() => state.assets.map((a) => a.id));
  expect(beforeIds).toContain('zz-m1');
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => openAssetDetailModal('zz-m1'));
  await page.locator('#assetDetailDeleteBtn').click();
  await expect(page.locator('#assetDetailModal')).toBeHidden();
  const gone = await page.evaluate(() => ({
    inAssets: state.assets.some((a) => a.id === 'zz-m1'),
    inDayChange: Object.prototype.hasOwnProperty.call(state.dayChangeMap, 'zz-m1'),
    inPrevClose: Object.prototype.hasOwnProperty.call(state.prevCloseMap, 'zz-m1'),
    inFailed: state.priceFetchFailedIds.has('zz-m1')
  }));
  expect(gone, '자산 목록과 부속 캐시 어디에도 남지 않는다')
    .toEqual({ inAssets: false, inDayChange: false, inPrevClose: false, inFailed: false });
  const mc = await page.evaluate(async () => {
    const input = await buildMonteCarloInputFromState({ presetKey: 'normal' });
    return (input.cma && input.cma.instruments ? input.cma.instruments : []).map((i) => i.label);
  });
  expect(mc.join('|'), 'MC 항목에도 없다').not.toContain('ZZ수동주식');
});

/* ══════════════ B. 거래 수정 ══════════════ */

// 거래 1건(매수)만 있는 상태. 자산은 거래에서 자동 생성된다(positionSource ledger).
const seedOneBuy = (page) => page.evaluate(() => {
  state.assets = [];
  state.bondPositions = [];
  state.transactions = [{
    id: 'zz-tx-1', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
    name: 'ZZ합성주식', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0,
    origin: 'period', createdAt: 1000, updatedAt: 1000
  }];
  persistAssets(true); persistTransactions(); persistBondPositions();
  syncAssetsFromTransactions();
  renderAll();
});

const ledgerOf = (page) => page.evaluate(() => {
  const a = state.assets.find((x) => x.ticker === 'ZZ0001.KS');
  return a ? { quantity: num(a.quantity), buyPrice: num(a.buyPrice), source: a.positionSource } : null;
});

test('B-1. 매수 거래의 수량을 바꾸면 자산 수량이 따라 바뀐다', async ({ page }) => {
  await open(page);
  await seedOneBuy(page);
  expect(await ledgerOf(page), '거래에서 만들어진 자산').toEqual({ quantity: 10, buyPrice: 1000, source: 'ledger' });

  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate(() => openTransactionModal('zz-tx-1'));
  await expect(page.locator('#transactionModal')).toBeVisible();
  expect(await page.locator('#tx_quantity').inputValue(), '기존 값이 폼에 채워져 있다').toBe('10');
  await page.locator('#tx_quantity').fill('25');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();

  expect(await ledgerOf(page), '수량만 바뀌고 단가는 그대로다').toEqual({ quantity: 25, buyPrice: 1000, source: 'ledger' });
  expect(await page.evaluate(() => state.transactions.length), '거래 건수는 늘지 않는다(수정이다)').toBe(1);
});

test('B-2. 매수 단가를 바꾸면 평단이 따라 바뀐다', async ({ page }) => {
  await open(page);
  await seedOneBuy(page);
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate(() => openTransactionModal('zz-tx-1'));
  await page.locator('#tx_price').fill('1500');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await ledgerOf(page)).toEqual({ quantity: 10, buyPrice: 1500, source: 'ledger' });
});

test('B-3. 거래 날짜를 바꾸면 그 날짜로 저장되고 수량 · 평단은 그대로다', async ({ page }) => {
  await open(page);
  await seedOneBuy(page);
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate(() => openTransactionModal('zz-tx-1'));
  await page.locator('#tx_date').fill('2026-08-15');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await page.evaluate(() => state.transactions[0].date)).toBe('2026-08-15');
  expect(await ledgerOf(page)).toEqual({ quantity: 10, buyPrice: 1000, source: 'ledger' });
});

test('B-4. 매수 수량을 줄여 이후 매도가 보유량을 넘게 되면 저장을 막는다(ISSUE-F)', async ({ page }) => {
  /* [PM 지시 2026-09-27 · ISSUE-F] 1차 전수 테스트에서 이 경로가 검증 없이 통과해 계산이 조용히
   * 잘라내던 것을 발견했고(보유 0 · 매도 기록 8 · 실현손익은 5 기준 · 안내 없음), 이번에 같은 규칙을
   * 매수 수정 경로에도 적용했다. 상세 시나리오는 e2e/130에 있고 여기서는 CRUD 흐름 안에서 확인한다. */
  await open(page);
  await page.evaluate(() => {
    state.assets = []; state.bondPositions = [];
    state.transactions = [
      { id: 'zz-tx-1', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
        name: 'ZZ합성주식', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1000, updatedAt: 1000 },
      { id: 'zz-tx-2', date: '2026-09-05', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
        name: 'ZZ합성주식', type: 'sell', quantity: 8, price: 1200, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1000, updatedAt: 1000 }
    ];
    persistAssets(true); persistTransactions(); syncAssetsFromTransactions(); renderAll();
  });
  expect((await ledgerOf(page)).quantity, '10 매수 - 8 매도 = 2').toBe(2);

  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.evaluate(() => openTransactionModal('zz-tx-1'));
  await page.locator('#tx_quantity').fill('5'); // 5 매수인데 8 매도가 뒤에 있다
  await page.locator('#transactionForm button[type="submit"]').click();

  await expect(page.getByText('저장하지 않았습니다', { exact: false }), '무엇이 문제인지 알린다').toBeVisible();
  await expect(page.locator('#transactionModal'), '저장하지 않았으므로 팝업이 그대로 열려 있다').toBeVisible();
  expect(await page.evaluate(() => state.transactions.find((t) => t.id === 'zz-tx-1').quantity),
    '매수 거래는 10 그대로다').toBe(10);
  expect(await page.evaluate(() => state.transactions.find((t) => t.id === 'zz-tx-2').quantity),
    '매도 거래도 8 그대로다').toBe(8);
  expect((await ledgerOf(page)).quantity, '보유량도 2 그대로다').toBe(2);
});

/* ══════════════ C. 거래 삭제 ══════════════ */

test('C-1. 거래 삭제를 취소하면 거래도 자산도 그대로다', async ({ page }) => {
  await open(page);
  await seedOneBuy(page);
  await openTxList(page);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('button[data-delete-tx="zz-tx-1"]').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => state.transactions.length)).toBe(1);
  expect((await ledgerOf(page)).quantity).toBe(10);
});

test('C-2. 거래 삭제를 확인하면 거래가 사라지고 자산 수량이 되돌아간다', async ({ page }) => {
  await open(page);
  await seedOneBuy(page);
  await openTxList(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('button[data-delete-tx="zz-tx-1"]').click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => state.transactions.length), '거래가 지워진다').toBe(0);
  const asset = await ledgerOf(page);
  // 거래가 원천이므로(BOND-01 · 원장 규칙) 남은 수량은 0이다. 자산 레코드 자체는 이력 보존을 위해 남는다.
  expect(asset === null || asset.quantity === 0, '남은 수량이 0이 된다').toBe(true);
});

test('C-3. 매도 거래를 지우면 실현손익도 함께 사라진다', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.assets = []; state.bondPositions = [];
    state.transactions = [
      { id: 'zz-tx-1', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
        name: 'ZZ합성주식', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1000, updatedAt: 1000 },
      { id: 'zz-tx-2', date: '2026-09-05', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
        name: 'ZZ합성주식', type: 'sell', quantity: 4, price: 1500, currency: 'KRW', fee: 0, origin: 'period', createdAt: 1000, updatedAt: 1000 }
    ];
    persistAssets(true); persistTransactions(); syncAssetsFromTransactions(); renderAll();
  });
  const pnl = () => page.evaluate(() => Object.values(computePositionsAndRealizedPnL().positions)
    .reduce((sum, p) => sum + num(p.realizedPnL), 0));
  expect(await pnl(), '(1500-1000)*4 = 2,000원').toBe(2000);

  await openTxList(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('button[data-delete-tx="zz-tx-2"]').click();
  await page.waitForTimeout(500);
  expect(await pnl(), '매도를 지우면 실현손익이 0이 된다').toBe(0);
  expect((await ledgerOf(page)).quantity, '수량은 매수분 10으로 돌아간다').toBe(10);
});
