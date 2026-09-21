/* global window */
// E2E-110 [Bond Stage 2 · §49 BOND-41~46] KIS 조회 연결 · 실패 시 직접 입력 · 평가 기준 표시
//
// [핵심 계약]
//   1) 채권 거래 화면에 [조회] 버튼이 있고, 누르면 발행조건이 채워진다.
//   2) **조회 실패가 거래 입력을 막지 않는다**(BOND-27) - 직접 넣어 그대로 저장된다.
//   3) 실패를 성공처럼 보여주지 않는다 - 무엇이 안 됐는지 화면에 적힌다.
//   4) 사용자가 이미 적은 값을 조회가 덮어쓰지 않는다.
//   5) 채권 위험 카드가 시장가로 쟀는지 매입원가로 쟀는지 밝힌다.
//
// KIS는 호출하지 않는다 - Worker 경로를 가로채 합성 응답을 돌려준다(실제 사용자 채권 · 실제 응답 미사용).
const { test, expect } = require('@playwright/test');

const ISIN = 'KRZZ00000001';

const INFO_OK = {
  rtCd: '0', msgCd: 'KIOK0530', msg1: '조회되었습니다', fetchedAt: 1700000000000,
  output: {
    pdno: ISIN, ksd_bond_item_name: 'ZZ합성국고채권 01125-3909', bond_clsf_kor_name: '국고채권',
    issu_dt: '20190910', rdpt_dt: '20390910', ksd_rcvg_bond_srfc_inrt: '1.125000000000',
    ksd_rcvg_bond_dsct_rt: '0.000000000000', int_caltm_mcnt: '6', iso_crcy_cd: 'KRW',
    tlg_rcvg_dtl_dtime: '20260901060518038', padf_plac_hdof_name: '한국', krx_issu_istt_cd: 'GB035'
  }, output2: null
};
const PRICE_OK = {
  rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.', fetchedAt: 1700000000000,
  output: {
    stnd_iscd: ISIN, hts_kor_isnm: 'ZZ합성국고', bond_prpr: '6785.00',
    bond_prdy_clpr: '6782.00', bond_prdy_vrss: '3.00', prdy_ctrt: '0.04', ernn_rate: '4.409'
  }, output2: null
};
// 실측 함정: 없는 채권인데 rt_cd "0"으로 답하고 stnd_iscd가 빠진다.
const PRICE_PHANTOM = {
  rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.', fetchedAt: 1700000000000,
  output: { bond_prpr: '0.00', bond_prdy_clpr: '0.00', ernn_rate: '0.000', acml_vol: '0' }, output2: null
};

/* [E2E 네트워크 격리] playwright.config.js가 브라우저 DNS를 localhost + CDN 3곳으로 묶어 두어
 * page.route가 닿지 않는다(그 격리는 의도된 것이라 풀지 않는다). 대신 페이지 안에서 window.fetch만
 * 감싸 KIS Worker 경로에만 합성 응답을 돌려준다 - kisProxyFetch의 URL 조립 · 타임아웃 · res.ok ·
 * JSON 파싱은 실제 앱 코드가 그대로 수행한다. 나머지 요청은 원래 fetch로 흘려보낸다. */
async function stubKis(page, { info = INFO_OK, price = PRICE_OK } = {}) {
  await page.addInitScript(({ info, price }) => {
    window.__kisCalls = { info: 0, price: 0 };
    const real = window.fetch.bind(window);
    const reply = (body) => Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));
    const fail = () => Promise.resolve(new Response('{"error":"upstream_error"}', {
      status: 502, headers: { 'Content-Type': 'application/json' }
    }));
    window.fetch = (input, init) => {
      const url = String((input && input.url) || input || '');
      if (url.includes('/api/kis/bond-info')) { window.__kisCalls.info += 1; return info === 'fail' ? fail() : reply(info); }
      if (url.includes('/api/kis/bond-price')) { window.__kisCalls.price += 1; return price === 'fail' ? fail() : reply(price); }
      return real(input, init);
    };
  }, { info, price });
}

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = []; state.transactions = []; state.bondPositions = [];
    persistAssets(); persistTransactions(); persistBondPositions();
  });
}

async function openBondTxForm(page) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_assetClass').selectOption('채권');
}

/* ─────────────────────────── A. 조회 성공 */

test('A. [조회] 버튼으로 발행조건이 자동으로 채워진다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await openBondTxForm(page);
  await expect(page.locator('#txBondLookupBtn')).toBeVisible();

  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#txBondLookupBtn').click();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('조회했습니다');

  expect(await page.locator('#tx_bondMaturityDate').inputValue()).toBe('2039-09-10');
  expect(await page.locator('#tx_bondCouponRate').inputValue()).toBe('1.125');
  expect(await page.locator('#tx_bondPayFreq').inputValue()).toBe('2');
  expect(await page.locator('#tx_bondCouponType').inputValue()).toBe('COUPON');
  expect(await page.locator('#tx_bondType').inputValue()).toBe('국채');
  expect(await page.locator('#tx_name').inputValue()).toBe('ZZ합성국고채권 01125-3909');
  // 발행인은 자동 입력하지 않는다 - 신용등급도 KIS가 주지 않으므로 비어 있다.
  expect(await page.locator('#tx_bondRating').inputValue()).toBe('');
});

test('B. 사용자가 이미 적어 둔 값은 조회가 덮어쓰지 않는다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await openBondTxForm(page);
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#tx_name').fill('내가 적은 채권 이름');
  await page.locator('#tx_bondCouponRate').fill('9.99');
  await page.locator('#txBondLookupBtn').click();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('조회했습니다');
  expect(await page.locator('#tx_name').inputValue()).toBe('내가 적은 채권 이름');
  expect(await page.locator('#tx_bondCouponRate').inputValue()).toBe('9.99');
  expect(await page.locator('#tx_bondMaturityDate').inputValue()).toBe('2039-09-10'); // 비어 있던 칸만 채운다
});

/* ─────────────────────────── C. 조회 실패가 거래를 막지 않는다 (BOND-27) */

test('C. 조회에 실패해도 직접 입력해 거래를 저장할 수 있다', async ({ page }) => {
  await stubKis(page, { info: 'fail' });
  await seed(page);
  await openBondTxForm(page);
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#txBondLookupBtn').click();
  // 실패를 성공처럼 보여주지 않는다.
  await expect(page.locator('#tx_bondMasterNote')).toContainText('직접');
  expect(await page.locator('#tx_bondMaturityDate').inputValue()).toBe('');

  // 직접 넣고 저장 - 그대로 저장된다.
  await page.locator('#tx_name').fill('ZZ직접입력채권');
  await page.locator('#tx_bondMaturityDate').fill('2034-03-10');
  await page.locator('#tx_bondCouponRate').fill('3.5');
  await page.locator('#tx_quantity').fill('1000');
  await page.locator('#tx_price').fill('9800');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);

  const saved = await page.evaluate((isin) => {
    const rec = state.bondPositions.find((p) => p.identity.isin === isin);
    return { txCount: state.transactions.length, maturity: rec.terms.maturityDate, coupon: rec.terms.couponRate };
  }, ISIN);
  expect(saved).toEqual({ txCount: 1, maturity: '2034-03-10', coupon: 3.5 });
});

test('D. 없는 채권은 "조회되지 않았다"고 알린다(빈 값을 성공처럼 채우지 않는다)', async ({ page }) => {
  await stubKis(page, { info: { rtCd: '7', msgCd: 'APBN0024', msg1: '조회된 데이터가 없습니다.', output: null } });
  await seed(page);
  await openBondTxForm(page);
  await page.locator('#tx_bondIsin').fill(ISIN);
  await page.locator('#txBondLookupBtn').click();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('조회되지 않았습니다');
  expect(await page.locator('#tx_bondMaturityDate').inputValue()).toBe('');
});

/* ─────────────────────────── E. 평가 기준 표시 */

async function seedBondHolding(page) {
  await page.evaluate((isin) => {
    state.assets = []; state.bondPositions = [];
    state.transactions = [{
      id: 'e110tx', date: '2024-01-15', owner: '신랑', accountType: '일반계좌', ticker: isin,
      name: 'ZZ합성국고채권', type: 'buy', quantity: 1000, price: 9800, currency: 'KRW',
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1
    }];
    persistTransactions();
    syncAssetsFromTransactions();
    const asset = state.assets.find((a) => a.ticker === isin);
    state.bondPositions = [makeBondPosition({
      assetId: asset.id,
      identity: { isin, instrumentName: 'ZZ합성국고채권', currency: 'KRW', bondType: '국채' },
      terms: { maturityDate: '2039-09-10', couponRate: 1.125, couponType: 'COUPON', paymentFrequency: 2 },
      holding: { owner: '신랑', account: '일반계좌', purchaseDate: '2024-01-15' }
    })];
    persistAssets(); persistBondPositions();
  }, ISIN);
}

test('E. 시세를 받기 전에는 매입원가로 평가했다고 밝힌다', async ({ page }) => {
  await stubKis(page, { price: 'fail' });
  await seed(page);
  await seedBondHolding(page);
  const html = await page.evaluate(() => bondRiskCardHtml());
  expect(html).toContain('평가 기준');
  expect(html).toContain('매입원가');
});

test('F. 유효한 KIS 시세를 받으면 시장가로 평가하고 그 사실을 밝힌다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await seedBondHolding(page);
  // 시세를 받아 둔 뒤 다시 그린다(화면 렌더링이 네트워크를 기다리지 않는 구조).
  await page.evaluate((isin) => getBondQuote(isin), ISIN);
  const r = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    const s = computeBondRiskSummary(state.bondPositions, { positions, quotes: getCachedBondQuotes() });
    return { html: bondRiskCardHtml(), source: s.valuationSource, amount: s.rows[0].amount, basis: s.rows[0].priceBasisFace };
  });
  expect(r.source).toBe('MARKET');
  expect(r.amount).toBe(6785000);      // 액면 10,000,000 × 6,785 / 10,000
  expect(r.basis).toBe(10000);
  expect(r.html).toContain('시장가');
});

test('G. 없는 채권의 rt_cd 0 · 0원 응답을 시장가로 쓰지 않는다(매입원가로 되돌아간다)', async ({ page }) => {
  await stubKis(page, { price: PRICE_PHANTOM });
  await seed(page);
  await seedBondHolding(page);
  await page.evaluate((isin) => getBondQuote(isin), ISIN);
  const r = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    const s = computeBondRiskSummary(state.bondPositions, { positions, quotes: getCachedBondQuotes() });
    return { source: s.valuationSource, amount: s.rows[0].amount, cached: Object.keys(getCachedBondQuotes()).length };
  });
  expect(r.cached).toBe(0);            // 시세로 채택되지 않았다
  expect(r.source).toBe('PURCHASE');
  expect(r.amount).toBe(9800000);      // 0원이 아니라 거래 기반 매입원가
});

test('H. 같은 채권을 여러 번 그려도 KIS를 반복 호출하지 않는다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await seedBondHolding(page);
  const calls = await page.evaluate(async (isin) => {
    for (let i = 0; i < 5; i += 1) await getBondQuote(isin);
    bondRiskCardHtml(); bondRiskCardHtml(); bondRiskCardHtml();
    return window.__kisCalls.price;
  }, ISIN);
  expect(calls).toBe(1);
});

test('I. 전량매도한 채권은 시세를 조회하지도, 평가하지도 않는다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await seedBondHolding(page);
  await page.evaluate(() => {
    state.transactions.push({
      id: 'e110sell', date: '2026-09-01', owner: '신랑', accountType: '일반계좌',
      ticker: state.transactions[0].ticker, name: 'ZZ합성국고채권', type: 'sell',
      quantity: 1000, price: 10000, currency: 'KRW', fee: 0, origin: 'period', createdAt: 2, updatedAt: 2
    });
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  const r = await page.evaluate(async () => {
    await refreshBondQuotes();
    return { calls: window.__kisCalls.price, html: bondRiskCardHtml() };
  });
  expect(r.calls).toBe(0);
  expect(r.html).toBe('');   // 평가 대상이 없으면 카드를 그리지 않는다
});

/* ─────────────────────────── J. 저장하지 않는다 */

test('J. 조회한 시세는 백업 · 동기화 어디에도 저장되지 않는다', async ({ page }) => {
  await stubKis(page);
  await seed(page);
  await seedBondHolding(page);
  await page.evaluate((isin) => getBondQuote(isin), ISIN);
  const r = await page.evaluate(() => {
    const blob = JSON.stringify(buildSyncBlob());
    const ls = Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k)).join('|');
    // 'yieldPct'는 시세 객체에만 있는 필드명이다 - 어딘가에 저장됐다면 이 이름이 따라 들어간다.
    return {
      quoteCount: Object.keys(getCachedBondQuotes()).length,
      blobHasQuoteField: blob.includes('yieldPct'), storageHasQuoteField: ls.includes('yieldPct'),
      blobBond: JSON.stringify(JSON.parse(blob).bondPositions[0]),
      stateHasQuote: JSON.stringify(state).includes('yieldPct')
    };
  });
  expect(r.quoteCount).toBe(1);            // 메모리에는 있다
  expect(r.blobHasQuoteField).toBe(false); // 백업/동기화 페이로드에는 없다
  expect(r.storageHasQuoteField).toBe(false); // localStorage에도 없다
  expect(r.stateHasQuote).toBe(false);     // state에도 붙지 않는다
  expect(r.blobBond).not.toContain('6785'); // 채권 레코드에 시세가 섞여 들어가지 않는다
});
