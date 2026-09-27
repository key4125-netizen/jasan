// E2E-125 [PM 지시 2026-09-26 · ISSUE-B + 미결 2번] 환헤지 선택 범위 · 환노출 표시.
//
//  ① 해외 거래소 직접 상장(SCHD · AAPL 등) - 환헤지 선택을 묻지 않고 「환노출」을 표시한다.
//  ② 국내 상장 해외 ETF - 계속 묻는다. 원장에 없고 사용자가 '국내'로 저장해도 묻는다(ISSUE-B).
//  ③ 이미 저장된 환헤지 값이 있으면 해외 직접 상장이라도 칸을 유지한다(되돌릴 수 있어야 한다).
//  ④ 채권 · 현금은 기존 정책 그대로다(D-2 · §55-3).
//
// 실제 화면(자산 입력 폼 · 자산 상세 팝업 · 거래 입력 폼)에서 확인한다.
// 전부 합성 데이터(ZZ 접두어 또는 공개 종목코드)이며 외부 네트워크를 쓰지 않는다.
/* global document */
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof updateRiskConfirmFieldsUI === 'function' && typeof fxHedgeChoiceStateOf === 'function');
  await page.waitForTimeout(300);
}

// 자산 입력 폼을 열고 칸을 직접 채운 뒤 판정 UI를 다시 그린다(사용자 입력과 같은 경로).
async function fillAssetForm(page, { ticker, name, category, currency, isDomestic, hedge }) {
  await page.evaluate((v) => {
    document.getElementById('f_ticker').value = v.ticker;
    document.getElementById('f_name').value = v.name;
    document.getElementById('f_category').value = v.category;
    document.getElementById('f_currency').value = v.currency;
    document.getElementById('f_isDomestic').value = v.isDomestic;
    document.getElementById('f_fxHedgeStatus').value = v.hedge || '';
    updateRiskConfirmFieldsUI();
  }, { ticker, name, category, currency, isDomestic, hedge });
}

async function openAssetForm(page) {
  await page.locator('#systemManagementBtn').click();
  await page.locator('#addAssetBtn').click();
  await expect(page.locator('#assetModal')).toBeVisible();
}

/* ══════════════ ① 해외 직접 상장 ══════════════ */

test('B-1. 해외 직접 상장 ETF · 주식은 환헤지를 묻지 않고 「환노출」을 표시한다', async ({ page }) => {
  await open(page);
  await openAssetForm(page);
  const wrap = page.locator('#f_fxHedgeWrap');
  const note = page.locator('#f_fxExposureNote');
  const cases = [
    { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', category: 'ETF', currency: 'USD', isDomestic: '해외' },
    { ticker: 'QQQM', name: 'Invesco NASDAQ 100 ETF', category: 'ETF', currency: 'USD', isDomestic: '해외' },
    { ticker: 'AAPL', name: 'Apple Inc', category: '주식', currency: 'USD', isDomestic: '해외' }
  ];
  for (const c of cases) {
    await fillAssetForm(page, c);
    await expect(wrap, c.ticker + ' - 환헤지 칸이 숨는다').toBeHidden();
    await expect(note, c.ticker + ' - 환노출 안내가 보인다').toBeVisible();
    await expect(note).toContainText('환노출');
    await expect(note).toContainText('환헤지형은 존재하지 않아');
  }
});

/* ══════════════ ② 국내 상장 해외 ETF(ISSUE-B) ══════════════ */

test('B-2. 국내 상장 해외 ETF는 사용자가 "국내"로 저장해도 환헤지를 묻는다', async ({ page }) => {
  await open(page);
  await openAssetForm(page);
  const wrap = page.locator('#f_fxHedgeWrap');
  const note = page.locator('#f_fxExposureNote');
  // 133690은 Exposure Master에 없고 공식 종목마스터도 "KOSPI 상장 ETF"까지만 말해 준다.
  for (const region of ['해외', '국내']) {
    await fillAssetForm(page, { ticker: '133690', name: 'TIGER 미국나스닥100', category: 'ETF', currency: 'KRW', isDomestic: region });
    await expect(wrap, '사용자 국내/해외 선택(' + region + ')으로 뒤집히지 않는다').toBeVisible();
    await expect(note, '칸을 보여 주므로 대신 표시할 안내가 없다').toBeHidden();
  }
  // 원장에 등재된 종목은 예전과 같다(이번 변경의 영향을 받지 않는다).
  await fillAssetForm(page, { ticker: '360750', name: 'TIGER 미국S&P500', category: 'ETF', currency: 'KRW', isDomestic: '국내' });
  await expect(wrap).toBeVisible();
});

test('B-3. 국내 원화 자산에는 여전히 묻지 않고, 안내도 띄우지 않는다', async ({ page }) => {
  await open(page);
  await openAssetForm(page);
  const wrap = page.locator('#f_fxHedgeWrap');
  const note = page.locator('#f_fxExposureNote');
  for (const c of [
    { ticker: '005930', name: '삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내' },
    { ticker: '069500', name: 'KODEX 200', category: 'ETF', currency: 'KRW', isDomestic: '국내' }
  ]) {
    await fillAssetForm(page, c);
    await expect(wrap, c.name).toBeHidden();
    await expect(note, c.name + ' - 환노출이 없으므로 안내도 없다').toBeHidden();
  }
});

/* ══════════════ ③ 이미 저장된 값 ══════════════ */

test('B-4. 해외 직접 상장에 환헤지 값이 저장돼 있으면 칸을 유지해 되돌릴 수 있게 한다', async ({ page }) => {
  await open(page);
  await openAssetForm(page);
  const wrap = page.locator('#f_fxHedgeWrap');
  const note = page.locator('#f_fxExposureNote');
  const base = { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', category: 'ETF', currency: 'USD', isDomestic: '해외' };
  await fillAssetForm(page, base);
  await expect(wrap, '저장값이 없으면 묻지 않는다').toBeHidden();
  await fillAssetForm(page, Object.assign({}, base, { hedge: 'HEDGED' }));
  await expect(wrap, '저장값이 있으면 칸을 유지한다').toBeVisible();
  await expect(note, '왜 보이는지도 함께 알린다').toBeVisible();
  await expect(note).toContainText('저장돼 있어');
});

test('B-5. 자산 상세 팝업에서도 같은 규칙이 적용된다', async ({ page }) => {
  await open(page);
  // 합성 자산 2건(해외 직접 상장 · 국내 상장 해외 ETF)만 남기고 상세 팝업을 연다.
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'ZZ SCHD', ticker: 'SCHD', category: 'ETF', owner: '신랑', accountType: '일반계좌',
        isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 110 }),
      makeAsset({ name: 'TIGER 미국나스닥100', ticker: '133690.KS', category: 'ETF', owner: '신랑', accountType: '일반계좌',
        isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 10000, currentPrice: 11000 })
    ];
    persistAssets(true);
    renderAll();
  });
  const box = page.locator('#assetDetailRiskConfirm');

  await page.evaluate(() => openAssetDetailModal(state.assets.find((a) => a.ticker === 'SCHD').id));
  await expect(page.locator('#assetDetailModal')).toBeVisible();
  await expect(box).toBeVisible();
  await expect(page.locator('#assetDetailFxHedgeSelect'), '해외 직접 상장 - 칸이 없다').toHaveCount(0);
  await expect(box, '대신 환노출을 표시한다').toContainText('환노출');
  await page.locator('#closeAssetDetailModalBtn').click();

  await page.evaluate(() => openAssetDetailModal(state.assets.find((a) => a.ticker === '133690.KS').id));
  await expect(box).toBeVisible();
  await expect(page.locator('#assetDetailFxHedgeSelect'), '국내 상장 해외 ETF - 칸이 있다').toHaveCount(1);
});

/* ══════════════ ④ 채권 · 현금 · 거래 폼 ══════════════ */

test('B-6. 거래 입력 폼 - 외화 ETF는 묻지 않고, 외화 채권은 그대로 묻는다(D-2 입력 경로 보존)', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.locator('#addTransactionBtn').click();
  await expect(page.locator('#transactionModal')).toBeVisible();
  const wrap = page.locator('#tx_fxHedgeWrap');
  const note = page.locator('#tx_fxExposureNote');

  await page.evaluate(() => {
    document.getElementById('tx_ticker').value = 'SCHD';
    document.getElementById('tx_name').value = 'ZZ SCHD';
    document.getElementById('tx_assetClass').value = 'ETF';
    document.getElementById('tx_currency').value = 'USD';
    document.getElementById('tx_fxHedgeStatus').value = '';
    refreshTxFxHedgeUI();
  });
  await expect(wrap, '해외 직접 상장 ETF - 묻지 않는다').toBeHidden();
  await expect(note, '환노출은 표시한다').toBeVisible();

  await page.evaluate(() => {
    document.getElementById('tx_assetClass').value = '채권';
    refreshTxFxHedgeUI();
  });
  await expect(wrap, '외화 채권 - 이 칸이 유일한 입력 경로이므로 유지한다(D-2)').toBeVisible();
  await expect(note).toBeHidden();
});

test('B-7. 판정은 한 곳에서만 한다 - 화면 세 곳의 결론이 서로 같다', async ({ page }) => {
  await open(page);
  const probes = [
    { ticker: 'SCHD', name: 'ZZ SCHD', category: 'ETF', currency: 'USD', isDomestic: '해외' },
    { ticker: '133690.KS', name: 'TIGER 미국나스닥100', category: 'ETF', currency: 'KRW', isDomestic: '국내' },
    { ticker: '005930.KS', name: '삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내' },
    { ticker: '', name: 'ZZ미국채', category: '채권', currency: 'USD', isDomestic: '해외' },
    { ticker: '', name: 'ZZ달러예수금', category: '현금', currency: 'USD', isDomestic: '해외' }
  ];
  const got = await page.evaluate((list) => list.map((a) => {
    const st = fxHedgeChoiceStateOf(a);
    return [a.name, st.exposure, st.offer, st.reason];
  }), probes);
  expect(got).toEqual([
    ['ZZ SCHD', 'EXPOSED', false, 'FOREIGN_DIRECT_LISTING'],
    ['TIGER 미국나스닥100', 'EXPOSED', true, 'KR_LISTED_FX_EXPOSED'],
    ['삼성전자', 'NONE', false, 'NO_FX_EXPOSURE'],
    ['ZZ미국채', 'EXPOSED', true, 'BOND_DOMAIN'],
    ['ZZ달러예수금', 'EXPOSED', true, 'FX_CASH']
  ]);
});
