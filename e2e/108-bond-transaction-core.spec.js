/* global document */
// E2E-108 [Bond Transaction Core · Stage 1 · 체크리스트 §49] 채권을 거래내역으로 관리한다.
//
// [핵심 계약] 화면에서 실제로 눌러서 확인한다 - 단위 테스트(test/bond-transaction-core.test.js)는
// 계산 규칙을, 이 파일은 "사용자가 거래 화면에서 채권을 넣을 수 있는가"를 고정한다.
//   1) 거래 화면에 자산군 칸이 있고, '채권'을 고르면 채권 전용 칸(ISIN · 만기 · 표면이율 등)이 펼쳐진다.
//   2) ISIN 없이 채권을 저장할 수 없고, 채권이 아닌데 ISIN을 넣어도 저장되지 않는다.
//   3) 매수 → 추가매수 → 부분매도 → 전량매도 → 거래삭제가 전부 거래내역 기준으로 다시 계산된다.
//   4) 채권 레코드(발행조건)는 거래 저장과 함께 만들어지고, 보유수량은 거기에 적히지 않는다.
//   5) 자산관리 화면에서 총액으로 직접 관리 중인 채권은 거래로 중복 등록되지 않는다.
//   6) 계좌 목록이 실제 데이터에서 만들어진다.
//   7) 채권 레코드가 백업 페이로드에 들어간다.
//
// [사용자 실데이터 미포함] 실제 보유 채권 · 실제 ISIN을 쓰지 않는다 - 전부 ZZ 합성 코드다.
const { test, expect } = require('@playwright/test');

const ISIN = 'KRZZ00000001';
const ISIN2 = 'KRZZ00000019';
const NAME = 'ZZ국고채권10년(E2E합성)';

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    state.bondPositions = [];
    persistAssets();
    persistTransactions();
    persistBondPositions();
  });
}

// 거래 추가 모달을 열고 채권 한 건을 채운다(저장은 호출부가 한다).
async function fillBondTx(page, { type = 'buy', quantity, price, isin = ISIN, name = NAME, account = '일반계좌', terms = false }) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_type').selectOption(type);
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill(account);
  await page.locator('#tx_assetClass').selectOption('채권');
  await page.locator('#tx_bondIsin').fill(isin);
  await page.locator('#tx_name').fill(name);
  if (terms) {
    await page.locator('#tx_bondMaturityDate').fill('2034-03-10');
    await page.locator('#tx_bondCouponRate').fill('3.5');
    await page.locator('#tx_bondCouponType').selectOption('COUPON');
    await page.locator('#tx_bondPayFreq').selectOption('2');
    await page.locator('#tx_bondType').selectOption('국채');
    await page.locator('#tx_bondRating').fill('AAA');
  }
  await page.locator('#tx_quantity').fill(String(quantity));
  await page.locator('#tx_price').fill(String(price));
}
const save = (page) => page.locator('#transactionForm button[type="submit"]').click();

const holding = (page) => page.evaluate((isin) => {
  const rec = (state.bondPositions || []).find((p) => p.identity.isin === isin);
  const { positions } = computePositionsAndRealizedPnL();
  const h = rec ? resolveBondHolding(rec, positions) : null;
  return h ? { source: h.source, quantity: h.quantity, faceAmount: h.faceAmount, purchaseAmount: h.purchaseAmount, closed: h.closed } : null;
}, ISIN);

/* ─────────────────────────────────────────── A. 화면이 채권을 말할 수 있다 */

test('A. 자산군 칸이 있고, 채권을 고르면 채권 전용 칸이 펼쳐진다', async ({ page }) => {
  await seed(page);
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await expect(page.locator('#tx_assetClass')).toBeVisible();
  await expect(page.locator('#tx_bondFieldsWrap')).toBeHidden();
  await page.locator('#tx_assetClass').selectOption('채권');
  await expect(page.locator('#tx_bondFieldsWrap')).toBeVisible();
  await expect(page.locator('#tx_bondIsin')).toBeVisible();
  /* [기대값 갱신 사유 · PM 지시 2026-09-23 · #1 · #2] 표준코드(ISIN) 칸이 종목 검색 UI 자리로 올라왔고,
   * 수동입력 체크박스는 채권에서 숨긴다. 예전에는 체크박스를 강제로 켜고 비활성화했는데, 그 ON 상태가
   * 자산군을 바꿔도 따라가 다음 자산군에서 검색이 막혔다(#2가 고친 문제다).
   * 지키려는 것은 그대로다 - 채권에서는 종목 검색이 아니라 직접 입력/ISIN 조회가 정상 경로다. */
  await expect(page.locator('#tx_bondIsinWrap')).toBeVisible();
  await expect(page.locator('#txSearchStockBtn'), '채권에는 종목 검색 버튼이 없다').toBeHidden();
  await expect(page.locator('#tx_manualEntryToggleWrap'), '수동입력 체크박스는 숨긴다').toBeHidden();
  await expect(page.locator('#tx_manualEntryToggle')).not.toBeChecked();
  await expect(page.locator('#tx_manualEntryToggle'), '비활성화로 잠그지 않는다').toBeEnabled();
  await expect(page.locator('#tx_nameLabelText')).toHaveText('채권명');
  expect(await page.locator('#tx_name').evaluate((el) => el.readOnly), '채권명은 직접 적을 수 있다').toBe(false);
  // 수량 라벨이 액면 단위임을 말한다.
  await expect(page.locator('#tx_quantityLabel')).toContainText('액면 1만원 단위');
  // 자산군을 되돌리면 채권 칸이 접히고 비워진다.
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#tx_assetClass').selectOption('주식');
  await expect(page.locator('#tx_bondFieldsWrap')).toBeHidden();
  await expect(page.locator('#tx_bondIsinWrap')).toBeHidden();
  expect(await page.locator('#tx_bondIsin').inputValue()).toBe('');
  // [PM 지시 2026-09-23 · #2] 채권을 거쳤다고 다음 자산군의 수동입력이 켜지거나 잠기지 않는다.
  await expect(page.locator('#tx_manualEntryToggle')).not.toBeChecked();
  await expect(page.locator('#tx_manualEntryToggle')).toBeEnabled();
  await expect(page.locator('#txSearchStockBtn')).toBeVisible();
});

test('B. 수량을 넣으면 액면총액으로 환산해 보여준다(액면을 따로 입력하지 않는다)', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 1000, price: 10000 });
  await expect(page.locator('#tx_bondFaceHint')).toContainText('10,000,000');
  await expect(page.locator('#tx_bondFaceHint')).toContainText('액면총액');
});

/* ─────────────────────────────────────────── C. 잘못된 조합은 저장되지 않는다 */

test('C. ISIN 없이 채권을 저장할 수 없다 · 채권이 아닌데 ISIN이 남아 있어도 저장되지 않는다', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 100, price: 10000, isin: '' });
  await save(page);
  expect(await page.evaluate(() => state.transactions.length)).toBe(0);
  // 형식이 틀린 코드도 막는다.
  await page.locator('#tx_bondIsin').fill('KR1035');
  await save(page);
  expect(await page.evaluate(() => state.transactions.length)).toBe(0);
  // 올바른 코드를 넣으면 저장된다.
  await page.locator('#tx_bondIsin').fill(ISIN);
  await save(page);
  expect(await page.evaluate(() => state.transactions.length)).toBe(1);
});

/* ─────────────────────────────────────────── D. 거래가 보유를 정한다 */

test('D. 매수 → 추가매수 → 부분매도 → 전량매도 → 거래삭제가 전부 거래 기준으로 다시 계산된다', async ({ page }) => {
  await seed(page);

  await fillBondTx(page, { quantity: 1000, price: 10000, terms: true });
  await save(page);
  expect(await holding(page)).toEqual({ source: 'LEDGER', quantity: 1000, faceAmount: 10000000, purchaseAmount: 10000000, closed: false });

  await fillBondTx(page, { quantity: 500, price: 11000 });
  await save(page);
  let h = await holding(page);
  expect(h.quantity).toBe(1500);
  expect(h.faceAmount).toBe(15000000);
  expect(Math.round(h.purchaseAmount)).toBe(15500000);

  await fillBondTx(page, { type: 'sell', quantity: 300, price: 10500 });
  await save(page);
  h = await holding(page);
  expect(h.quantity).toBe(1200);
  expect(h.faceAmount).toBe(12000000);
  expect(h.closed).toBe(false);

  await fillBondTx(page, { type: 'sell', quantity: 1200, price: 10600 });
  await save(page);
  h = await holding(page);
  expect(h.quantity).toBe(0);
  expect(h.closed).toBe(true);
  // 전량매도한 채권은 위험 카드 계산에서 빠지지만 레코드는 남는다.
  const risk = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    return computeBondRiskSummary(state.bondPositions, { positions });
  });
  expect(risk.status).toBe('EMPTY');
  expect(risk.closedCount).toBe(1);
  expect(await page.evaluate(() => state.bondPositions.length)).toBe(1);

  // 전량매도 거래를 지우면 직전 상태로 돌아간다.
  await page.evaluate(() => {
    const last = state.transactions[state.transactions.length - 1];
    state.transactions = state.transactions.filter((t) => t.id !== last.id);
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
  });
  h = await holding(page);
  expect(h.quantity).toBe(1200);
  expect(h.closed).toBe(false);
});

test('E. 과매도는 채권에서도 막힌다(ISIN 기준 보유수량을 본다)', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 100, price: 10000 });
  await save(page);
  await fillBondTx(page, { type: 'sell', quantity: 101, price: 10000 });
  await save(page);
  expect(await page.evaluate(() => state.transactions.length)).toBe(1);
  expect((await holding(page)).quantity).toBe(100);
});

/* ─────────────────────────────────────────── F. 채권 레코드 · 자산 */

test('F. 거래 저장이 채권 레코드와 자산을 함께 만든다 - 보유수량은 레코드에 적지 않는다', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 1000, price: 10000, terms: true });
  await save(page);
  const result = await page.evaluate((isin) => {
    const rec = state.bondPositions.find((p) => p.identity.isin === isin);
    const asset = state.assets.find((a) => a.ticker === isin);
    return {
      rec: rec && {
        isin: rec.identity.isin, bondType: rec.identity.bondType, rating: rec.identity.creditRating,
        maturity: rec.terms.maturityDate, coupon: rec.terms.couponRate, freq: rec.terms.paymentFrequency,
        owner: rec.holding.owner, account: rec.holding.account,
        faceAmount: rec.holding.faceAmount, purchaseAmount: rec.holding.purchaseAmount,
        linkedToAsset: !!(asset && rec.assetId === asset.id)
      },
      asset: asset && { category: asset.category, categorySource: asset.categorySource, quantity: asset.quantity, positionSource: asset.positionSource }
    };
  }, ISIN);
  expect(result.rec).toMatchObject({
    isin: ISIN, bondType: '국채', rating: 'AAA', maturity: '2034-03-10', coupon: 3.5, freq: 2,
    owner: '신랑', account: '일반계좌', linkedToAsset: true
  });
  // [BOND-08] 보유수량 · 매입원가는 거래내역이 원천이라 레코드에 적히지 않는다.
  expect(result.rec.faceAmount).toBeNull();
  expect(result.rec.purchaseAmount).toBeNull();
  // 자산은 ISIN 예외 덕분에 ETF가 아니라 채권으로 분류된다.
  expect(result.asset).toMatchObject({ category: '채권', categorySource: 'user', quantity: 1000, positionSource: 'ledger' });
});

test('G. 같은 ISIN을 두 번째로 넣으면 이미 아는 발행조건을 채워 준다', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 1000, price: 10000, terms: true });
  await save(page);
  // 다른 계좌에서 같은 채권을 산다 - 발행조건은 같은 채권이면 같다.
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_accountType').fill('ISA');
  await page.locator('#tx_assetClass').selectOption('채권');
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('이미 등록된 채권');
  expect(await page.locator('#tx_bondMaturityDate').inputValue()).toBe('2034-03-10');
  expect(await page.locator('#tx_bondCouponRate').inputValue()).toBe('3.5');
  expect(await page.locator('#tx_name').inputValue()).toBe(NAME);
});

/* ─────────────────────────────────────────── H. legacy 수동 채권 보호 */

test('H. 자산관리 화면에서 직접 관리 중인 채권은 거래로 중복 등록되지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(({ isin, name }) => {
    const asset = makeAsset({ name, category: '채권', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 4900000, currentPrice: 5000000, positionSource: 'manual' });
    state.assets = [asset];
    state.bondPositions = [makeBondPosition({
      assetId: asset.id,
      identity: { isin, instrumentName: name, currency: 'KRW', bondType: '국채' },
      terms: { maturityDate: '2034-03-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
      holding: { owner: '신랑', account: '일반계좌', faceAmount: 5000000, purchaseAmount: 4900000 }
    })];
    persistAssets();
    persistBondPositions();
  }, { isin: ISIN2, name: 'ZZ수동채권(E2E합성)' });

  await fillBondTx(page, { quantity: 100, price: 10000, isin: ISIN2, name: 'ZZ수동채권(E2E합성)' });
  await save(page);
  expect(await page.evaluate(() => state.transactions.length)).toBe(0);
  // 수동 보유분은 그대로 살아 있다(강제 전환하지 않는다).
  const kept = await page.evaluate((isin) => {
    const rec = state.bondPositions.find((p) => p.identity.isin === isin);
    return { face: rec.holding.faceAmount, purchase: rec.holding.purchaseAmount };
  }, ISIN2);
  expect(kept).toEqual({ face: 5000000, purchase: 4900000 });
});

/* ─────────────────────────────────────────── I. 계좌 목록 · 백업 */

test('I. 계좌 목록이 실제 데이터에서 만들어진다(대소문자 · 표기를 바꾸지 않는다)', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E108_계좌원본', owner: '신랑', accountType: 'ZZ증권 연금', quantity: 1, buyPrice: 1000 })];
    persistAssets();
  });
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  const options = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#accountTypeList option')).map((o) => o.value));
  expect(options).toContain('ZZ증권 연금');   // 실제로 쓰는 계좌가 목록에 있다
  expect(options).toContain('일반계좌');       // 기본 목록도 남아 있다
  expect(options).not.toContain('ZZ증권연금'); // 공백을 지우는 등 표기를 고치지 않는다
});

test('J. 채권 레코드가 백업 · 동기화 페이로드에 들어간다', async ({ page }) => {
  await seed(page);
  await fillBondTx(page, { quantity: 1000, price: 10000, terms: true });
  await save(page);
  const blob = await page.evaluate(() => buildSyncBlob());
  expect(Array.isArray(blob.bondPositions)).toBe(true);
  expect(blob.bondPositions.length).toBe(1);
  expect(blob.bondPositions[0].identity.isin).toBe(ISIN);
  expect(blob.bondPositions[0].terms.maturityDate).toBe('2034-03-10');
  expect(typeof blob.bondPositions[0].updatedAt).toBe('number');
});

/* ─────────────────────────────────────────── K. 표준코드 없던 시절의 채권 보호 */

test('K. 표준코드가 없는 옛 채권 거래는 수정할 때 ISIN을 요구하지 않는다', async ({ page }) => {
  await seed(page);
  // 티커 없이 이름으로만 관리되던 실물채권 - 자산군은 이미 '채권'이다.
  await page.evaluate(() => {
    const legacy = makeAsset({ ticker: '', name: 'ZZ무티커실물채권(E2E합성)', category: '채권', currency: 'KRW',
      isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 10000, currentPrice: 10000 });
    delete legacy.categorySource; // 이 표식이 없던 시절의 자산 - 거래를 고쳤다고 소급 확정되면 안 된다
    state.assets = [legacy];
    state.transactions = [{ id: 'e108legacy', date: '2025-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: '', name: 'ZZ무티커실물채권(E2E합성)', type: 'buy', quantity: 100, price: 10000, currency: 'KRW',
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
  });
  await page.getByText('거래내역', { exact: true }).click();
  await page.evaluate(() => openTransactionModal('e108legacy'));
  // 기존 자산군이 화면에 보이지만, 그것만으로 표준코드를 요구하지는 않는다.
  expect(await page.locator('#tx_assetClass').inputValue()).toBe('채권');
  await page.locator('#tx_quantity').fill('120');
  await save(page);
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
  const after = await page.evaluate(() => ({
    quantity: state.transactions[0].quantity,
    ticker: state.transactions[0].ticker,
    bondRecords: state.bondPositions.length,
    categorySource: state.assets[0].categorySource
  }));
  expect(after.quantity).toBe(120);
  expect(after.ticker).toBe('');
  expect(after.bondRecords).toBe(0);            // 빈 채권 레코드를 만들지 않는다
  expect(after.categorySource).toBeUndefined(); // 거래를 고쳤다고 분류가 '사용자 확정'으로 승격되지 않는다
});

test('L. 채권에서는 매매단가 라벨이 "액면 1만원당 가격"으로 바뀐다(주당 가격과 헷갈리지 않게)', async ({ page }) => {
  await seed(page);
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await expect(page.locator('#tx_priceLabel')).toContainText('1개(주)당');
  await page.locator('#tx_assetClass').selectOption('채권');
  await expect(page.locator('#tx_priceLabel')).toContainText('액면 1만원당');
  await page.locator('#tx_assetClass').selectOption('ETF');
  await expect(page.locator('#tx_priceLabel')).toContainText('1개(주)당');
});
