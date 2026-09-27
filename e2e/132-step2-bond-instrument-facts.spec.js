// E2E-132 [PM STEP 2] 채권 상품 기준정보 — ISIN 단위 해석 · 충돌 표시 · 순서 비의존성.
//
//  A. 같은 ISIN을 두 사람이 들고 있고 발행조건이 같으면, 거래 폼이 그 사실을 채워 준다.
//  B. 발행조건이 갈리면 **채우지 않고** 무엇이 다른지 말한다(자동 선택 금지).
//  C. 채권 위험 카드가 같은 충돌을 사용자 말로 알린다.
//  D. 배열 순서를 바꿔도 같은 답이 나온다(first-found 없음).
//  E. STEP 1 환헤지 구조는 그대로다(원화 채권 숨김 · 외화 채권 유지).
//
// 전부 합성(ZZ) 데이터이며 외부 네트워크를 쓰지 않는다.
/* global document */
const { test, expect } = require('@playwright/test');

const ISIN = 'KR103502GE95';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof makeBondPosition === 'function'
    && typeof resolveBondInstrumentFacts === 'function' && typeof bondInstrumentConflictNote === 'function');
  await page.evaluate(() => { state.assets = []; state.transactions = []; state.bondPositions = []; renderAll(); });
  await page.waitForTimeout(150);
}

// 같은 채권을 두 사람이 보유한 상태를 만든다. sameTerms=false면 만기 · 쿠폰이 갈린다.
const seedTwoHoldings = (page, sameTerms) => page.evaluate((v) => {
  const mk = (id, assetId, owner, account, terms) => makeBondPosition({
    id, assetId,
    identity: { isin: v.isin, instrumentName: 'ZZ 국고채권 23-5', issuer: '대한민국', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
    terms, holding: { owner, account, faceAmount: 10000000 }
  });
  const base = { issueDate: '2023-06-10', maturityDate: '2030-12-01', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 };
  const other = v.same ? base : Object.assign({}, base, { maturityDate: '2031-06-01', couponRate: 4.25 });
  state.assets = [
    makeAsset({ id: 'zz-a1', ticker: v.isin, name: 'ZZ 국고채권 23-5', category: '채권', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 1000, buyPrice: 10000, currentPrice: 10100 }),
    makeAsset({ id: 'zz-a2', ticker: v.isin, name: 'ZZ 국고채권 23-5', category: '채권', owner: '와이프', accountType: '연금저축', currency: 'KRW', isDomestic: '국내', quantity: 500, buyPrice: 10000, currentPrice: 10100 })
  ];
  state.bondPositions = [
    mk('zz-p1', 'zz-a1', '신랑', '일반계좌', base),
    mk('zz-p2', 'zz-a2', '와이프', '연금저축', other)
  ];
  persistAssets(true); persistBondPositions(); renderAll();
}, { isin: ISIN, same: sameTerms });

// 거래 폼을 채권 모드로 열고 ISIN을 넣어 자동 채움을 돌린다(사용자 입력과 같은 경로).
const fillIsinInTxForm = async (page) => {
  await page.evaluate((isin) => {
    openTransactionModal();
    const cls = document.getElementById('tx_assetClass');
    cls.value = '채권';
    cls.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tx_bondIsin').value = isin;
    applyKnownBondMasterToTxForm();
  }, ISIN);
  await page.waitForTimeout(200);
  return page.evaluate(() => ({
    note: (document.getElementById('tx_bondMasterNote') || {}).textContent || '',
    maturity: document.getElementById('tx_bondMaturityDate').value,
    coupon: document.getElementById('tx_bondCouponRate').value,
    bondType: document.getElementById('tx_bondType').value,
    rating: document.getElementById('tx_bondRating').value
  }));
};

test('A. 발행조건이 같으면 거래 폼이 그 사실을 채운다', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, true);
  const r = await fillIsinInTxForm(page);
  expect(r.maturity).toBe('2030-12-01');
  expect(r.coupon).toBe('3.5');
  expect(r.bondType).toBe('국채');
  expect(r.rating).toBe('AAA');
  expect(r.note).toContain('이미 등록된 채권입니다');
});

test('B. 발행조건이 갈리면 채우지 않고 무엇이 다른지 말한다', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, false);
  const r = await fillIsinInTxForm(page);
  expect(r.maturity, '갈린 값은 채우지 않는다').toBe('');
  expect(r.coupon, '갈린 값은 채우지 않는다').toBe('');
  expect(r.bondType, '갈리지 않은 값은 그대로 채운다').toBe('국채');
  expect(r.note).toContain('확인 필요');
  expect(r.note).toContain('만기일');
  expect(r.note).toContain('앱이 임의로 고르지 않습니다');
  expect(r.note).toContain('서로 다른 값은 채우지 않았습니다');
});

test('C. 채권 위험 카드가 같은 충돌을 알린다', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, false);
  const html = await page.evaluate(() => (typeof bondRiskCardHtml === 'function' ? bondRiskCardHtml() : ''));
  expect(html).toContain('확인 필요');
  expect(html).toContain(ISIN);
  expect(html).toContain('만기일');
  // 충돌이 없으면 이 줄은 나오지 않는다.
  await seedTwoHoldings(page, true);
  const clean = await page.evaluate(() => (typeof bondRiskCardHtml === 'function' ? bondRiskCardHtml() : ''));
  expect(clean).not.toContain('확인 필요 - 같은 채권');
});

test('D. 배열 순서를 바꿔도 같은 답이 나온다(first-found 없음)', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, false);
  const r = await page.evaluate((isin) => {
    const asIs = resolveBondInstrumentFacts(isin, state.bondPositions);
    const reversed = resolveBondInstrumentFacts(isin, [...state.bondPositions].reverse());
    return { a: JSON.stringify(asIs), b: JSON.stringify(reversed) };
  }, ISIN);
  expect(r.a).toBe(r.b);
});

test('D-2. 저장된 레코드를 바꾸지 않는다(읽기만 한다)', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, false);
  const before = await page.evaluate(() => JSON.stringify(state.bondPositions));
  await page.evaluate((isin) => { resolveBondInstrumentFacts(isin, state.bondPositions); }, ISIN);
  const after = await page.evaluate(() => JSON.stringify(state.bondPositions));
  expect(after).toBe(before);
});

test('E. STEP 1 환헤지 구조는 그대로다(원화 채권 숨김 · 외화 채권 유지)', async ({ page }) => {
  await open(page);
  await seedTwoHoldings(page, true);
  const r = await page.evaluate((isin) => {
    const krw = state.assets.find((a) => a.id === 'zz-a1');
    const pos = state.bondPositions.find((p) => p.assetId === 'zz-a1');
    const usdPos = makeBondPosition({
      id: 'zz-u1', assetId: 'zz-u', identity: { isin: 'US912810TM03', bondType: '국채', currency: 'USD', hedgeStatus: 'HEDGED' },
      terms: { maturityDate: '2030-12-01', couponRate: 3, paymentFrequency: 2 }
    });
    const usdAsset = { id: 'zz-u', ticker: 'US912810TM03', category: '채권', currency: 'USD' };
    return {
      krwOffer: fxHedgeChoiceStateOf(krw).offer,
      krwSource: resolveBondHedgeStatusDetail(pos, krw).source,
      krwClass: String(resolveBondClass(pos, krw)),
      usdOffer: fxHedgeChoiceStateOf(usdAsset).offer,
      usdStatus: resolveBondHedgeStatusDetail(usdPos, usdAsset).status,
      isin
    };
  }, ISIN);
  expect(r.krwOffer, '원화 채권은 묻지 않는다').toBe(false);
  expect(r.krwSource).toBe('NOT_APPLICABLE');
  expect(r.krwClass).toBe('KR_GOV');
  expect(r.usdOffer, '외화 채권은 그대로 묻는다').toBe(true);
  expect(r.usdStatus).toBe('HEDGED');
});
