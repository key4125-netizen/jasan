/* global document */
// E2E-109 [Bond Transaction Core · Stage 1 · PM 추가 확인 지시 2026-09-21]
//
// PM이 커밋 전에 실제 동작으로 확인하라고 지시한 두 가지만 다룬다 - 새 기능을 만들지 않는다.
//   1. 과거 날짜의 채권 매수 거래가 화면에서 그대로 저장되고, 여러 건이 하나의 채권 보유로 합산되는가.
//      (거래일이 과거라는 이유로 저장이 막히지 않아야 한다 - 채권은 대개 과거에 산 것을 나중에 입력한다.)
//   2. 거래 기반 채권이 만들어진 뒤, 자산관리 화면에서 보유량 · 총액을 직접 바꿔
//      거래내역과 다른 보유를 만들 수 있는 경로가 있는가(있으면 안 된다).
//
// [사용자 실데이터 미포함] 전부 ZZ 합성 코드다.
const { test, expect } = require('@playwright/test');

const ISIN = 'KRZZ00000035';
const NAME = 'ZZ과거매수채권(E2E합성)';

// PM이 기록을 요구한 세 건 - 전부 오늘보다 과거다.
const PAST_BUYS = [
  { date: '2024-01-15', quantity: 300, price: 9800 },
  { date: '2024-06-20', quantity: 500, price: 10100 },
  { date: '2025-03-05', quantity: 200, price: 10400 }
];
const EXPECT_QTY = 1000;                 // 300 + 500 + 200
const EXPECT_FACE = 10000000;            // 1,000 × 10,000
const EXPECT_PURCHASE = 300 * 9800 + 500 * 10100 + 200 * 10400; // 10,070,000

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    state.bondPositions = [];
    persistAssets(); persistTransactions(); persistBondPositions();
  });
}

// 실제 거래 추가 화면을 눌러서 채운다(코드로 state를 밀어 넣지 않는다).
async function addPastBondBuy(page, { date, quantity, price }, withTerms) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_date').fill(date);
  await page.locator('#tx_type').selectOption('buy');
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_assetClass').selectOption('채권');
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#tx_name').fill(NAME);
  if (withTerms) {
    await page.locator('#tx_bondMaturityDate').fill('2032-06-10');
    await page.locator('#tx_bondCouponRate').fill('4.0');
    await page.locator('#tx_bondCouponType').selectOption('COUPON');
    await page.locator('#tx_bondPayFreq').selectOption('2');
    await page.locator('#tx_bondType').selectOption('국채');
  }
  await page.locator('#tx_quantity').fill(String(quantity));
  await page.locator('#tx_price').fill(String(price));
  await page.locator('#transactionForm button[type="submit"]').click();
  // 저장되면 모달이 닫힌다 - 저장 핸들러가 끝까지 갔다는 뜻이다(차단되면 열린 채로 남는다).
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
}

const holdingOf = (page) => page.evaluate((isin) => {
  const rec = (state.bondPositions || []).find((p) => p.identity.isin === isin);
  const { positions } = computePositionsAndRealizedPnL();
  const h = resolveBondHolding(rec, positions);
  return { source: h.source, quantity: h.quantity, faceAmount: h.faceAmount, purchaseAmount: h.purchaseAmount, closed: h.closed };
}, ISIN);

/* ══════════════ 1. 과거 거래일 입력 ══════════════ */

test('1. 과거 날짜 채권 매수 3건이 그대로 저장되고 하나의 보유로 합산된다', async ({ page }) => {
  await seed(page);
  for (let i = 0; i < PAST_BUYS.length; i += 1) {
    await addPastBondBuy(page, PAST_BUYS[i], i === 0);
  }

  const saved = await page.evaluate(() => state.transactions.map((t) => ({ date: t.date, quantity: t.quantity, price: t.price, ticker: t.ticker })));
  expect(saved.length).toBe(3);
  // 입력한 날짜가 조용히 오늘로 바뀌지 않았다.
  expect(saved.map((t) => t.date).sort()).toEqual(PAST_BUYS.map((b) => b.date).sort());
  expect(new Set(saved.map((t) => t.ticker))).toEqual(new Set([ISIN]));

  const h = await holdingOf(page);
  expect(h).toEqual({
    source: 'LEDGER', quantity: EXPECT_QTY, faceAmount: EXPECT_FACE,
    purchaseAmount: EXPECT_PURCHASE, closed: false
  });
  // 채권 레코드는 하나뿐이다(같은 ISIN + 소유자 + 계좌 = 하나).
  expect(await page.evaluate(() => state.bondPositions.length)).toBe(1);
  // 자산도 하나뿐이고 수량이 원장과 같다.
  const assets = await page.evaluate((isin) => state.assets.filter((a) => a.ticker === isin)
    .map((a) => ({ quantity: a.quantity, category: a.category, positionSource: a.positionSource })), ISIN);
  expect(assets).toEqual([{ quantity: EXPECT_QTY, category: '채권', positionSource: 'ledger' }]);
});

test('2. 과거 매수 뒤 오늘 부분매도해도 과거 거래가 그대로 남고 잔량만 줄어든다', async ({ page }) => {
  await seed(page);
  for (let i = 0; i < PAST_BUYS.length; i += 1) await addPastBondBuy(page, PAST_BUYS[i], i === 0);

  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_type').selectOption('sell');
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_assetClass').selectOption('채권');
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#tx_name').fill(NAME);
  await page.locator('#tx_quantity').fill('400');
  await page.locator('#tx_price').fill('10500');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);

  const h = await holdingOf(page);
  expect(h.quantity).toBe(600);
  expect(h.faceAmount).toBe(6000000);
  expect(await page.evaluate(() => state.transactions.filter((t) => t.type === 'buy').length)).toBe(3);
});

/* ══════════════ 2. 자산 화면 직접 수정 방지 ══════════════ */

test('3. 거래 기반 채권은 자산 상세 화면에서 [수정] · [삭제]가 아예 나오지 않는다', async ({ page }) => {
  await seed(page);
  await addPastBondBuy(page, PAST_BUYS[0], true);

  const assetId = await page.evaluate((isin) => (state.assets.find((a) => a.ticker === isin) || {}).id, ISIN);
  expect(assetId).toBeTruthy();
  await page.evaluate((id) => openAssetDetailModal(id), assetId);
  await expect(page.locator('#assetDetailModal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#assetDetailEditBtn')).toBeHidden();
  await expect(page.locator('#assetDetailDeleteBtn')).toBeHidden();
});

test('4. 자산관리 목록에 수량 · 금액을 직접 고치는 입력칸이 없다(읽기 전용)', async ({ page }) => {
  await seed(page);
  await addPastBondBuy(page, PAST_BUYS[0], true);
  await page.locator('[data-tab="investmentDetail"]').click();
  const editable = await page.evaluate(() => {
    const roots = ['#assetTableBody', '#assetCardList'].map((s) => document.querySelector(s)).filter(Boolean);
    return roots.flatMap((r) => [...r.querySelectorAll('input,textarea,[contenteditable="true"]')]
      .map((e) => e.id || e.tagName));
  });
  expect(editable).toEqual([]);
});

test('5. 자산 폼(최초등록)으로 같은 채권을 만들어도 거래내역 보유량은 바뀌지 않는다', async ({ page }) => {
  await seed(page);
  await addPastBondBuy(page, PAST_BUYS[0], true); // 300좌
  const before = await holdingOf(page);

  // 자산 폼을 열어 같은 소유자 · 계좌 · 같은 ISIN으로 "보유 액면 9,999만원"을 직접 적어 저장한다.
  await page.evaluate(({ name, isin }) => {
    openModal('add');
    document.getElementById('f_manualEntryToggle').checked = true;
    document.getElementById('f_manualEntryToggle').dispatchEvent(new Event('change'));
    document.getElementById('f_name').value = name;
    document.getElementById('f_owner').value = '신랑';
    document.getElementById('f_accountType').value = '일반계좌';
    document.getElementById('f_category').value = '채권';
    document.getElementById('f_category').dispatchEvent(new Event('change'));
    document.getElementById('f_currency').value = 'KRW';
    document.getElementById('f_quantity').value = '9999';
    document.getElementById('f_buyPrice').value = '10000';
    document.getElementById('f_bondIsin').value = isin;
    document.getElementById('f_bondFaceAmount').value = '99990000';
    document.getElementById('assetForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, { name: NAME, isin: ISIN });

  // 저장 자체가 막힌다 - 한 채권은 한 가지 방식으로만 관리한다(BOND-02 · BOND-09 반대 방향).
  // (openModal은 폼만 채우고 모달을 띄우지 않으므로 "자산이 늘지 않았다"로 확인한다.)
  expect(await page.evaluate(() => state.assets.length)).toBe(1);
  // 거래내역이 정한 보유는 한 글자도 바뀌지 않는다 - 원장이 유일한 원천이기 때문이다(BOND-01).
  const after = await holdingOf(page);
  expect(after).toEqual(before);
  expect(after.quantity).toBe(300);
  expect(after.faceAmount).toBe(3000000);
  // 거래내역도 그대로다(자산 폼이 거래를 만들지 않는다).
  expect(await page.evaluate(() => state.transactions.length)).toBe(1);
  expect(await page.evaluate(() => state.bondPositions.length)).toBe(1); // 채권 레코드가 둘로 갈라지지 않는다
  // 직접 적은 액면이 채권 계산에 들어오지 않는다 - 위험 요약이 원장 기준 한 건만 센다.
  const risk = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    return computeBondRiskSummary(state.bondPositions, { positions });
  });
  expect(risk.status).toBe('OK');
  expect(risk.count).toBe(1);
  expect(risk.rows[0].faceAmount).toBe(3000000);
  expect(risk.rows[0].holdingSource).toBe('LEDGER');
});

test('6. 부팅 재계산이 돌아도 거래 기반 채권 수량은 원장 값으로 유지된다', async ({ page }) => {
  await seed(page);
  await addPastBondBuy(page, PAST_BUYS[0], true);
  // 자산 레코드를 강제로 흐트러뜨린 뒤(어떤 경로로든 어긋났다고 가정) 부팅과 같은 재계산을 돌린다.
  const r = await page.evaluate((isin) => {
    const a = state.assets.find((x) => x.ticker === isin);
    a.quantity = 9999;
    persistAssets();
    syncAssetsFromTransactions({ auto: true }); // 부팅 경로와 같은 조건
    return state.assets.find((x) => x.ticker === isin).quantity;
  }, ISIN);
  expect(r).toBe(300);
});
