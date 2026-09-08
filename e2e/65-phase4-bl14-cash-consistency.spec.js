// E2E-65 [V1.1 Phase 4 - BL-14] 거래 삭제의 고아 정리에서 현금 가드가 통화를 구분한다.
//
// syncAssetsFromTransactions의 원화 현금 가드는 "category==='현금' && currency!=='USD'"다 -
// 원화 현금만 거래원장에서 제외하고, 달러 현금은 "거래내역 기반으로 관리"한다고 findMatchingCashAsset
// 위 주석이 명시한다. 그런데 deleteTransaction의 고아 정리 분기는 "category!=='현금'"만 봐서 통화를
// 구분하지 않았다 - 그 결과 ledger/legacy 달러 현금 자산은 마지막 남은 거래를 지워도 수량이 그대로
// 남았다(실측: 10000 -> 10000, 같은 상황의 티커 자산이라면 0이 됐어야 한다). 정리 조건을 sync가
// 이미 쓰는 것과 같은 통화 인지 조건으로 맞춘다 - 새 정책이 아니라 이 파일에 이미 있는 조건을
// 이 분기에도 적용하는 것뿐이다.
//
// 원화 현금은 positionSource와 무관하게 항상 보호된다(정책 그대로, 변경 없음).
// manual 자산은 통화와 무관하게 항상 보호된다(BL-12, 변경 없음).
// 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof deleteTransaction === 'function');
}

// 현금 자산 1건 + 그 자산과 매칭되는 거래 1건을 심고, 거래를 지운 뒤의 상태를 돌려준다.
function seedAndDelete(page, opts) {
  return page.locator('body').evaluate((el, o) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({
      ticker: '', name: o.name, category: '현금', currency: o.currency,
      isDomestic: o.currency === 'USD' ? '해외' : '국내', owner: o.owner || '신랑', accountType: '일반계좌',
      quantity: o.quantity, buyPrice: 1, currentPrice: 1,
      buyRate: o.currency === 'USD' ? 1300 : undefined, positionSource: o.positionSource,
    })];
    state.transactions = [{
      id: 'e65tx', date: '2025-01-01', owner: o.owner || '신랑', accountType: '일반계좌', ticker: '',
      name: o.name, type: 'buy', quantity: o.txQuantity, price: 1, currency: o.currency,
      appliedRate: o.currency === 'USD' ? 1300 : undefined, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1,
    }];
    persistAssets(); persistTransactions();
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e65tx'); } finally { win.confirm = realConfirm; }
    return {
      quantity: state.assets[0].quantity,
      buyRate: state.assets[0].buyRate ?? null,
      positionSource: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource,
      txCount: state.transactions.length,
    };
  }, opts);
}

/* ══════════════════════════════════════════════════════════════════
 * A / B. 원화 현금 — 정책 그대로 항상 보호 (회귀 없음, 대조군)
 * ═════════════════════════════════════════════════════════════════ */
test('A. 원화 현금 + ledger — 거래 삭제 후에도 예전 그대로 보호된다', async ({ page }) => {
  await open(page);
  const r = await seedAndDelete(page, { name: 'E65원화예수금', currency: 'KRW', quantity: 10000000, txQuantity: 5000000, positionSource: 'ledger' });
  expect(r.quantity).toBe(10000000);
  expect(r.txCount).toBe(0);
});

test('B. 원화 현금 + legacy — 거래 삭제 후에도 예전 그대로 보호된다', async ({ page }) => {
  await open(page);
  const r = await seedAndDelete(page, { name: 'E65원화예수금2', currency: 'KRW', quantity: 10000000, txQuantity: 5000000, positionSource: undefined });
  expect(r.quantity).toBe(10000000);
  expect(r.positionSource).toBe('UNDEF');
});

/* ══════════════════════════════════════════════════════════════════
 * C / D. 달러 현금 — [핵심] ledger/legacy는 이제 정리된다
 * ═════════════════════════════════════════════════════════════════ */
test('C. [BL-14] 달러 현금 + ledger — 마지막 거래를 지우면 수량이 0으로 정리된다', async ({ page }) => {
  await open(page);
  const r = await seedAndDelete(page, { name: 'E65달러예수금', currency: 'USD', quantity: 10000, txQuantity: 5000, positionSource: 'ledger' });
  // 수정 전에는 여기가 10000이었다 - 같은 상황의 티커 자산이라면 이미 0이 됐어야 한다.
  expect(r.quantity).toBe(0);
  expect(r.txCount).toBe(0);
});

test('D. [BL-14] 달러 현금 + legacy — 명시적 거래 삭제는 예전처럼 ledger 취급된다', async ({ page }) => {
  await open(page);
  const r = await seedAndDelete(page, { name: 'E65달러예수금2', currency: 'USD', quantity: 10000, txQuantity: 5000, positionSource: undefined });
  expect(r.quantity).toBe(0);
  expect(r.positionSource).toBe('UNDEF'); // 자동 승격 없음 - 값만 정리되고 표식은 그대로 legacy
});

/* ══════════════════════════════════════════════════════════════════
 * E. manual 현금 — 통화 무관 항상 보호 (BL-12, 변경 없음)
 * ═════════════════════════════════════════════════════════════════ */
test('E. manual 현금은 원화/달러 모두 거래 삭제로부터 보호된다', async ({ page }) => {
  await open(page);
  const krw = await seedAndDelete(page, { name: 'E65수동원화', currency: 'KRW', quantity: 10000000, txQuantity: 5000000, positionSource: 'manual' });
  const usd = await seedAndDelete(page, { name: 'E65수동달러', currency: 'USD', quantity: 10000, txQuantity: 5000, positionSource: 'manual' });
  expect(krw.quantity).toBe(10000000);
  expect(usd.quantity).toBe(10000);
  expect(usd.buyRate).toBe(1300); // 보유정보(환율)도 그대로
});

/* ══════════════════════════════════════════════════════════════════
 * F. owner 분리 — 신랑/와이프의 같은 이름 달러 현금이 서로 영향받지 않는다
 * ═════════════════════════════════════════════════════════════════ */
test('F. 신랑의 달러 현금 거래를 지워도 와이프의 동명 달러 현금은 그대로다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    const cash = (owner, qty) => makeAsset({ ticker: '', name: 'E65공용달러', category: '현금', currency: 'USD',
      isDomestic: '해외', owner, accountType: '일반계좌', quantity: qty, buyPrice: 1, currentPrice: 1,
      buyRate: 1300, positionSource: 'ledger' });
    state.assets = [cash('신랑', 10000), cash('와이프', 7000)];
    state.transactions = [
      { id: 'e65f1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E65공용달러', type: 'buy', quantity: 10000, price: 1, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'e65f2', date: '2025-01-01', owner: '와이프', accountType: '일반계좌', ticker: '', name: 'E65공용달러', type: 'buy', quantity: 7000, price: 1, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
    ];
    persistAssets(); persistTransactions();
    const realConfirm = win.confirm; win.confirm = () => true;
    try { deleteTransaction('e65f1'); } finally { win.confirm = realConfirm; }
    return state.assets.map((a) => `${a.owner}/${a.quantity}`).sort();
  });
  expect(r).toEqual(['신랑/0', '와이프/7000']);
});

/* ══════════════════════════════════════════════════════════════════
 * G. 거래 수정/추가 — 고아 정리 분기를 타지 않는 정상 경로는 그대로다
 * ═════════════════════════════════════════════════════════════════ */
test('G. 달러 현금 거래를 수정하면(삭제 아님) 예전처럼 재계산될 뿐 고아 정리는 개입하지 않는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ticker: '', name: 'E65달러수정', category: '현금', currency: 'USD',
      isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 10000, buyPrice: 1, currentPrice: 1,
      buyRate: 1300, positionSource: 'ledger' })];
    state.transactions = [{ id: 'e65g', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '',
      name: 'E65달러수정', type: 'buy', quantity: 10000, price: 1, currency: 'USD', appliedRate: 1300,
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    // 삭제가 아니라 수량을 고쳐서 재계산 - 정상 sync 경로(고아 정리 아님)
    state.transactions[0].quantity = 6000;
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
    return state.assets[0].quantity;
  });
  expect(r).toBe(6000);
});

test('H. 달러 현금에 거래를 추가하면 예전처럼 합산된다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ticker: '', name: 'E65달러추가', category: '현금', currency: 'USD',
      isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 5000, buyPrice: 1, currentPrice: 1,
      buyRate: 1300, positionSource: 'ledger' })];
    state.transactions = [{ id: 'e65h1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '',
      name: 'E65달러추가', type: 'buy', quantity: 5000, price: 1, currency: 'USD', appliedRate: 1300,
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    state.transactions.push({ id: 'e65h2', date: '2025-02-01', owner: '신랑', accountType: '일반계좌', ticker: '',
      name: 'E65달러추가', type: 'buy', quantity: 3000, price: 1, currency: 'USD', appliedRate: 1300,
      fee: 0, origin: 'initial', createdAt: 2, updatedAt: 2 });
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
    return state.assets[0].quantity;
  });
  expect(r).toBe(8000);
});

/* ══════════════════════════════════════════════════════════════════
 * J. 계산 불변식 — 총평가금액만 정확히 반영되고, 현금은 여전히 Risk/MC 대상이 아니다
 * ═════════════════════════════════════════════════════════════════ */
test('J. 달러 현금 정리 후 총평가금액은 그만큼 줄고, 현금은 Risk/MC 대상에 들어가지 않는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [
      makeAsset({ ticker: '005930.KS', name: 'E65삼성', category: '주식', currency: 'KRW', isDomestic: '국내',
        owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 70000, currentPrice: 70000 }),
      makeAsset({ ticker: '', name: 'E65달러현금J', category: '현금', currency: 'USD', isDomestic: '해외',
        owner: '신랑', accountType: '일반계좌', quantity: 10000, buyPrice: 1, currentPrice: 1,
        buyRate: 1450, positionSource: 'ledger' }),
    ];
    state.transactions = [{ id: 'e65j', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '',
      name: 'E65달러현금J', type: 'buy', quantity: 10000, price: 1, currency: 'USD', appliedRate: 1450,
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    const before = Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0));
    const riskBefore = riskEligibleAssets().map((a) => a.name);
    const realConfirm = win.confirm; win.confirm = () => true;
    try { deleteTransaction('e65j'); } finally { win.confirm = realConfirm; }
    const after = Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0));
    const riskAfter = riskEligibleAssets().map((a) => a.name);
    return { before, after, diff: before - after, riskBefore, riskAfter };
  });
  expect(r.diff).toBe(10000 * 1450); // 달러현금(1만 달러 * 1450원)만큼 정확히 줄어든다
  expect(r.riskBefore).not.toContain('E65달러현금J'); // 현금은 애초에 Risk 대상이 아니다(NON_TRADABLE_CATEGORIES)
  expect(r.riskAfter).not.toContain('E65달러현금J');
});

/* ══════════════════════════════════════════════════════════════════
 * K. edge case — KRW+USD, manual+ledger, 두 owner가 한 포트폴리오에 섞여도 서로 침범하지 않는다
 * ═════════════════════════════════════════════════════════════════ */
test('K. 혼합 포트폴리오(원화/달러 · manual/ledger · 두 owner)에서 각자 정확히 분리 처리된다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [
      makeAsset({ ticker: '', name: 'E65K원화', category: '현금', currency: 'KRW', isDomestic: '국내',
        owner: '신랑', accountType: '일반계좌', quantity: 1000000, buyPrice: 1, currentPrice: 1, positionSource: 'ledger' }),
      makeAsset({ ticker: '', name: 'E65K달러ledger', category: '현금', currency: 'USD', isDomestic: '해외',
        owner: '신랑', accountType: '일반계좌', quantity: 5000, buyPrice: 1, currentPrice: 1, buyRate: 1300, positionSource: 'ledger' }),
      makeAsset({ ticker: '', name: 'E65K달러manual', category: '현금', currency: 'USD', isDomestic: '해외',
        owner: '와이프', accountType: '일반계좌', quantity: 3000, buyPrice: 1, currentPrice: 1, buyRate: 1300, positionSource: 'manual' }),
    ];
    state.transactions = [
      { id: 'e65k1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E65K원화', type: 'buy', quantity: 1000000, price: 1, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'e65k2', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E65K달러ledger', type: 'buy', quantity: 5000, price: 1, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'e65k3', date: '2025-01-01', owner: '와이프', accountType: '일반계좌', ticker: '', name: 'E65K달러manual', type: 'buy', quantity: 3000, price: 1, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
    ];
    persistAssets(); persistTransactions();
    const realConfirm = win.confirm; win.confirm = () => true;
    try {
      deleteTransaction('e65k1'); // 원화 - 보호되어야 함
      deleteTransaction('e65k2'); // 달러 ledger - 정리되어야 함(BL-14 fix)
      deleteTransaction('e65k3'); // 달러 manual - 보호되어야 함(BL-12)
    } finally { win.confirm = realConfirm; }
    return state.assets.map((a) => `${a.name}/${a.owner}/${a.quantity}`).sort();
  });
  expect(r).toEqual([
    'E65K달러ledger/신랑/0',
    'E65K달러manual/와이프/3000',
    'E65K원화/신랑/1000000',
  ]);
});
