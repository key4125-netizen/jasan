// E2E-131 [PM STEP 1] 상품 기준정보 — 환헤지 해석 · 원화 채권 차단 · 적용 범위 · 충돌 안내.
//
//  A. 원화 채권 - 자산 폼 · 거래 폼 · 자산 상세 **세 경로 모두** 환헤지를 묻지 않는다(§58-5).
//     지역(국내/해외) 값과 무관하다 - 거래 폼에는 그 칸 자체가 없다(§58-4).
//  B. 외화 채권 - 세 경로 모두 그대로 묻는다(D-2 · 분류의 유일한 입력 경로).
//  C. 적용 범위 - 어느 화면에서 고르든 **같은 소유자 · 계좌구분 · 통화 · 티커** 한 단위에만 적용된다.
//     소유자가 다른 보유분은 영향을 받지 않는다(PMD-02 / N-10).
//  D. 충돌 - 같은 종목을 보유분마다 다른 환헤지로 들고 있으면 그 사실을 알린다.
//     자동으로 고르거나 전파하거나 지우지 않는다.
//
// 전부 합성(ZZ) 데이터이며 외부 네트워크를 쓰지 않는다.
/* global document */
const { test, expect } = require('@playwright/test');

const ISIN_KRW = 'KR103502GE95';
const ISIN_USD = 'US912810TM03';
const ETF = '133690.KS';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof updateRiskConfirmFieldsUI === 'function' && typeof fxHedgeChoiceStateOf === 'function'
    && typeof resolveInstrumentFxHedge === 'function' && typeof fxHedgeConflictFor === 'function');
  await page.evaluate(() => { state.assets = []; state.transactions = []; state.bondPositions = []; renderAll(); });
  await page.waitForTimeout(200);
}

const hidden = (page, id) => page.evaluate((x) => document.getElementById(x).classList.contains('hidden'), id);

/* ══════════════ A · B. 세 경로의 환헤지 제공 여부 ══════════════ */

// 자산 폼의 채권 환헤지 칸은 채권 전용 필드(#f_bondHedge)다 - 주식·ETF용 #f_fxHedgeWrap과 다르다
// (js/29 주석: 채권 레코드의 identity.hedgeStatus는 자산 폼, 자산의 fxHedgeStatus는 거래 폼·자산 상세).
// 자산 폼은 예전부터 "원화 채권이면 고르지 못하게 둔다"를 지키고 있었다(js/07 updateBondFieldsUI).
async function assetFormBondHedgeUsable(page, v) {
  await page.locator('#systemManagementBtn').click();
  await page.locator('#addAssetBtn').click();
  await expect(page.locator('#assetModal')).toBeVisible();
  const usable = await page.evaluate((x) => {
    document.getElementById('f_ticker').value = x.ticker;
    document.getElementById('f_name').value = x.name;
    document.getElementById('f_category').value = '채권';
    document.getElementById('f_currency').value = x.currency;
    document.getElementById('f_isDomestic').value = x.isDomestic;
    if (typeof updateBondFieldsUI === 'function') updateBondFieldsUI();
    updateRiskConfirmFieldsUI();
    const el = document.getElementById('f_bondHedge');
    return !!el && !el.disabled;
  }, v);
  await page.evaluate(() => {
    document.getElementById('assetModal').classList.add('hidden');
    document.getElementById('systemManagementModal').classList.add('hidden');
  });
  return usable;
}

async function txFormHedgeVisible(page, v) {
  await page.evaluate((x) => {
    openTransactionModal();
    document.getElementById('tx_assetClass').value = '채권';
    document.getElementById('tx_assetClass').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tx_currency').value = x.currency;
    document.getElementById('tx_currency').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tx_ticker').value = x.ticker;
    document.getElementById('tx_name').value = x.name;
    refreshTxFxHedgeUI();
  }, v);
  await page.waitForTimeout(150);
  const shown = !(await hidden(page, 'tx_fxHedgeWrap'));
  await page.evaluate(() => { if (typeof closeTransactionModal === 'function') closeTransactionModal(false); });
  return shown;
}

test('A. 원화 채권 - 자산 폼 · 거래 폼 어디서도 환헤지를 묻지 않는다(지역 값 무관)', async ({ page }) => {
  await open(page);
  for (const region of ['국내', '해외']) {
    expect(await assetFormBondHedgeUsable(page, { ticker: ISIN_KRW, name: 'ZZ 국고채권', currency: 'KRW', isDomestic: region }),
      `자산 폼 · 지역=${region}`).toBe(false);
  }
  // 거래 폼에는 지역 칸이 아예 없다 - 통화만으로 같은 답이 나와야 한다.
  expect(await txFormHedgeVisible(page, { ticker: ISIN_KRW, name: 'ZZ 국고채권', currency: 'KRW' }), '거래 폼').toBe(false);
});

test('B. 외화 채권 - 자산 폼 · 거래 폼 모두 그대로 묻는다(분류의 유일한 입력 경로)', async ({ page }) => {
  await open(page);
  expect(await assetFormBondHedgeUsable(page, { ticker: ISIN_USD, name: 'ZZ 미국국채', currency: 'USD', isDomestic: '해외' }), '자산 폼').toBe(true);
  expect(await txFormHedgeVisible(page, { ticker: ISIN_USD, name: 'ZZ 미국국채', currency: 'USD' }), '거래 폼').toBe(true);
});

/* ══════════════ C. 적용 범위 - 소유자 경계를 넘지 않는다 ══════════════ */

const seedTwoOwners = (page, hedgeA, hedgeB) => page.evaluate((v) => {
  const mk = (owner, acct, hedge) => makeAsset({
    ticker: v.etf, name: 'ZZ 미국나스닥100 ETF', category: 'ETF', owner, accountType: acct,
    currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 10000, currentPrice: 12000,
    fxHedgeStatus: hedge
  });
  state.assets = [mk('신랑', '일반계좌', v.a), mk('와이프', '연금저축', v.b)];
  persistAssets(true); renderAll();
}, { etf: ETF, a: hedgeA, b: hedgeB });

const hedgeOf = (page, owner) => page.evaluate((o) => {
  const a = state.assets.find((x) => x.owner === o);
  return a ? (a.fxHedgeStatus === undefined ? '(없음)' : a.fxHedgeStatus) : '(자산 없음)';
}, owner);

test('C. 통합 상세에서 고른 값은 그 소유자 · 계좌 보유분에만 적용된다', async ({ page }) => {
  await open(page);
  await seedTwoOwners(page, undefined, undefined);
  // 같은 티커의 모든 보유분을 묶어 여는 경로(전체 목록 통합 행 · 종목 상세와 같은 진입)
  await page.evaluate((tk) => openStockDetailModal(tk, 'ZZ 미국나스닥100 ETF'), ETF);
  await expect(page.locator('#assetDetailRiskConfirm')).toBeVisible();
  await expect(page.locator('#assetDetailFxHedgeSelect')).toBeVisible();
  await page.locator('#assetDetailFxHedgeSelect').selectOption('HEDGED');
  await page.waitForTimeout(300);

  expect(await hedgeOf(page, '신랑'), '고른 보유분').toBe('HEDGED');
  expect(await hedgeOf(page, '와이프'), '다른 소유자는 영향을 받지 않는다').toBe('(없음)');
  // 어디에 적용되는지 화면이 말해 준다.
  await expect(page.locator('#assetDetailRiskConfirm')).toContainText('보유분에만 적용됩니다');
});

test('C-2. 소유자별 보기에서 연 단일 상세도 같은 단위로 적용된다', async ({ page }) => {
  await open(page);
  await seedTwoOwners(page, undefined, undefined);
  const wifeId = await page.evaluate(() => state.assets.find((a) => a.owner === '와이프').id);
  await page.evaluate((id) => openAssetDetailModal(id), wifeId);
  await expect(page.locator('#assetDetailFxHedgeSelect')).toBeVisible();
  await page.locator('#assetDetailFxHedgeSelect').selectOption('UNHEDGED');
  await page.waitForTimeout(300);
  expect(await hedgeOf(page, '와이프')).toBe('UNHEDGED');
  expect(await hedgeOf(page, '신랑'), '다른 소유자는 그대로다').toBe('(없음)');
});

/* ══════════════ D. 충돌 안내 ══════════════ */

test('D. 같은 종목인데 보유분마다 값이 다르면 알린다 - 고치지는 않는다', async ({ page }) => {
  await open(page);
  await seedTwoOwners(page, 'HEDGED', 'UNHEDGED');
  await page.evaluate((tk) => openStockDetailModal(tk, 'ZZ 미국나스닥100 ETF'), ETF);
  await expect(page.locator('#assetDetailRiskConfirm')).toBeVisible();
  await expect(page.locator('#assetDetailRiskConfirm')).toContainText('보유분마다 환헤지가 다릅니다');
  await expect(page.locator('#assetDetailRiskConfirm')).toContainText('앱이 임의로 맞추지 않습니다');
  // 알리기만 하고 저장값은 그대로여야 한다.
  expect(await hedgeOf(page, '신랑')).toBe('HEDGED');
  expect(await hedgeOf(page, '와이프')).toBe('UNHEDGED');
});

test('D-2. 값이 하나뿐이면(나머지는 미확인) 충돌로 보지 않는다', async ({ page }) => {
  await open(page);
  await seedTwoOwners(page, 'HEDGED', undefined);
  await page.evaluate((tk) => openStockDetailModal(tk, 'ZZ 미국나스닥100 ETF'), ETF);
  await expect(page.locator('#assetDetailRiskConfirm')).toBeVisible();
  await expect(page.locator('#assetDetailRiskConfirm')).not.toContainText('보유분마다 환헤지가 다릅니다');
});

/* ══════════════ E. 상품 기준정보 해석(1-A) ══════════════ */

test('E. 원장에 비헤지로 등재된 종목은 사용자 입력이 없어도 그 사실을 쓴다', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => ({
    없음: resolveInstrumentFxHedge({ ticker: '360750.KS', category: 'ETF', currency: 'KRW' }),
    사용자헤지: resolveInstrumentFxHedge({ ticker: '360750.KS', category: 'ETF', currency: 'KRW', fxHedgeStatus: 'HEDGED' }),
    원장없음: resolveInstrumentFxHedge({ ticker: '133690.KS', category: 'ETF', currency: 'KRW' })
  }));
  expect(r.없음.status).toBe('UNHEDGED');
  expect(r.없음.source).toBe('instrumentMaster');
  expect(r.없음.override).toBeNull();          // 자산에 값을 복사하지 않는다
  expect(r.사용자헤지.status).toBe('HEDGED');  // 사용자 확정값이 먼저다
  expect(r.사용자헤지.conflict).toBe(true);    // 다르다는 사실은 알린다
  expect(r.원장없음.source).toBe('UNRESOLVED'); // 근거가 없으면 단정하지 않는다
});
