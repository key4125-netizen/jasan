// E2E-61 [V1.1 S-1 D-3] 부팅 자동 재계산은 legacy 자산을 거래원장 값으로 덮어쓰지 않는다.
//
// positionSource가 없는(legacy) 자산은 "수량을 자산 마스터와 거래원장 중 무엇이 관리하는지 앱이
// 모르는" 상태다. 지금까지는 그것을 ledger로 취급해 부팅마다 거래원장 값으로 덮어썼고, 그래서
// 사용자가 자산관리 엑셀로 현재 보유 수량을 정정해도(거래 누락을 바로잡는 공식 창구다) 다음 부팅에
// 조용히 되돌아갔다.
//
// D-3은 그 판단을 호출 맥락으로 가른다.
//   bootApp()                → 자동 재계산     → legacy를 건드리지 않는다  ★ 이번 변경
//   거래 폼 저장 / 거래 삭제  → 사용자의 명시적 행동 → 예전 그대로 거래원장 반영
//   거래 엑셀 업로드          → 사용자의 명시적 행동 → 예전 그대로 거래원장 반영
//
// legacy를 manual/ledger로 승격시키지 않는다 - 표식은 끝까지 없는 채로 남는다.
// 이 파일의 "부팅"은 전부 page.reload()로 진짜 bootApp()을 태운다. 외부 네트워크는 쓰지 않는다.
const { test, expect } = require('@playwright/test');

const TICKER = '005930.KS';
const NAME = 'E61삼성전자';

// 자산 1건 + 거래 N건을 localStorage에 심는다. positionSource는 넘긴 값 그대로 저장된다
// (undefined면 키 자체가 저장되지 않아 legacy로 남는다).
async function seed(page, opts) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.locator('body').evaluate((el, o) => {
    state.exchangeRate = 1450;
    persistRate(true);
    state.assets = [makeAsset({
      ticker: o.asset.ticker === undefined ? '005930.KS' : o.asset.ticker,
      name: o.asset.name, category: o.asset.category || '주식',
      currency: o.asset.currency || 'KRW', isDomestic: o.asset.currency === 'USD' ? '해외' : '국내',
      owner: '신랑', accountType: '일반계좌',
      quantity: o.asset.quantity, buyPrice: o.asset.buyPrice, currentPrice: 100000,
      role: 'core', rateMatchOverride: 'KOSPI', positionSource: o.asset.positionSource,
    })];
    state.transactions = o.transactions.map((t, i) => ({
      id: t.id, date: t.date || `2025-01-0${i + 1}`, owner: '신랑', accountType: '일반계좌',
      ticker: o.asset.ticker === undefined ? '005930.KS' : o.asset.ticker, name: o.asset.name,
      type: t.type || 'buy', quantity: t.quantity, price: t.price,
      currency: o.asset.currency || 'KRW',
      appliedRate: o.asset.currency === 'USD' ? 1300 : undefined,
      fee: 0, origin: 'initial', createdAt: i + 1, updatedAt: i + 1,
    }));
    persistAssets();
    persistTransactions();
  }, opts);
}

// 자산 1건의 관측값. positionSource는 없으면 'UNDEF'로 표기해 "승격되지 않았음"을 명시적으로 본다.
function readAsset(page) {
  return page.locator('body').evaluate(() => {
    const a = state.assets[0];
    return {
      quantity: a.quantity, buyPrice: a.buyPrice, buyRate: a.buyRate === undefined ? null : a.buyRate,
      currentPrice: a.currentPrice, category: a.category, role: a.role || null,
      rateMatchOverride: a.rateMatchOverride || null, owner: a.owner, accountType: a.accountType,
      currency: a.currency, isDomestic: a.isDomestic,
      positionSource: a.positionSource === undefined ? 'UNDEF' : a.positionSource,
      txCount: state.transactions.length,
    };
  });
}

// 진짜 bootApp()을 태운다.
async function reboot(page) {
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets));
}

// 거래 폼으로 매수 1건을 추가한다(사용자의 명시적 행동 경로).
async function addBuyViaForm(page, { quantity, price }) {
  await page.locator('body').evaluate((el, o) => {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    openTransactionModal();
    doc.getElementById('tx_date').value = '2025-06-01';
    doc.getElementById('tx_owner').value = '신랑';
    doc.getElementById('tx_accountType').value = '일반계좌';
    doc.getElementById('tx_ticker').value = o.ticker;
    doc.getElementById('tx_name').value = o.name;
    doc.getElementById('tx_type').value = 'buy';
    doc.getElementById('tx_quantity').value = String(o.quantity);
    doc.getElementById('tx_price').value = String(o.price);
    doc.getElementById('tx_currency').value = 'KRW';
    doc.getElementById('transactionForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  }, { ticker: TICKER, name: NAME, quantity, price });
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
}

/* ══════════════════════════════════════════════════════════════════════
 * A. legacy + 부팅 → 자산 마스터가 이긴다 (이번 변경의 본체)
 * ═════════════════════════════════════════════════════════════════════ */
test('A. legacy 자산은 부팅 자동 재계산으로 거래원장 값에 덮어써지지 않는다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 150, buyPrice: 90000, positionSource: undefined },
    transactions: [{ id: 'e61a', quantity: 100, price: 80000 }],
  });
  await reboot(page);
  const a = await readAsset(page);
  // 수정 전에는 여기가 100/80000이었다 - 엑셀로 정정한 현재 보유 수량이 매 부팅 되돌아갔다.
  expect(a.quantity).toBe(150);
  expect(a.buyPrice).toBe(90000);
  // legacy는 끝까지 UNKNOWN으로 남는다 - manual/ledger로 승격시키지 않는다.
  expect(a.positionSource).toBe('UNDEF');
  // 거래내역은 과거 사실이므로 손대지 않는다.
  expect(a.txCount).toBe(1);
  // 자산 마스터 단독 소유 필드도 그대로다.
  expect(a.category).toBe('주식');
  expect(a.role).toBe('core');
  expect(a.rateMatchOverride).toBe('KOSPI');
  expect(a.currentPrice).toBe(100000);
});

/* ══════════════════════════════════════════════════════════════════════
 * B/C/D. legacy + 사용자의 명시적 거래 행동 → 거래원장이 이긴다 (기존 동작 유지)
 * ═════════════════════════════════════════════════════════════════════ */
test('B. legacy 자산도 거래 UI로 매수를 추가하면 거래원장 기준으로 갱신된다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ id: 'e61b', quantity: 100, price: 80000 }],
  });
  await addBuyViaForm(page, { quantity: 50, price: 80000 });
  const a = await readAsset(page);
  // 이번 수정 때문에 사용자 거래 입력이 막히면 안 된다.
  expect(a.quantity).toBe(150);
  expect(a.txCount).toBe(2);
  expect(a.positionSource).toBe('UNDEF');   // 반영은 하되 표식은 만들지 않는다
});

test('C. legacy 자산은 거래를 수정하면 그 결과가 반영된다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ id: 'e61c', quantity: 100, price: 80000 }],
  });
  await page.locator('body').evaluate((el, o) => {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    openTransactionModal('e61c');                 // 기존 거래를 연다
    doc.getElementById('tx_quantity').value = '200';
    doc.getElementById('tx_price').value = String(o.price);
    doc.getElementById('transactionForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  }, { price: 70000 });
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
  const a = await readAsset(page);
  expect(a.quantity).toBe(200);
  expect(a.buyPrice).toBe(70000);
  expect(a.positionSource).toBe('UNDEF');
});

test('D. legacy 자산은 거래를 지우면 예전 그대로 정리된다 (BL-12 manual 보호는 유지)', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ id: 'e61d', quantity: 100, price: 80000 }],
  });
  const legacy = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e61d'); } finally { win.confirm = realConfirm; }
    return { quantity: state.assets[0].quantity, ps: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource };
  });
  expect(legacy).toEqual({ quantity: 0, ps: 'UNDEF' });   // 예전 그대로

  // 같은 조작을 manual 자산에서 하면 BL-12 가드가 그대로 지켜준다.
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: 'manual' },
    transactions: [{ id: 'e61d2', quantity: 70, price: 50000 }],
  });
  const manual = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e61d2'); } finally { win.confirm = realConfirm; }
    return { quantity: state.assets[0].quantity, ps: state.assets[0].positionSource };
  });
  expect(manual).toEqual({ quantity: 100, ps: 'manual' });
});

/* ══════════════════════════════════════════════════════════════════════
 * E/F/G/H. 나머지 세 상태는 하나도 바뀌지 않는다 (대조군)
 * ═════════════════════════════════════════════════════════════════════ */
test('E. manual 자산의 부팅 동작은 그대로다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 150, buyPrice: 90000, positionSource: 'manual' },
    transactions: [{ id: 'e61e', quantity: 100, price: 80000 }],
  });
  await reboot(page);
  const a = await readAsset(page);
  expect(a.quantity).toBe(150);
  expect(a.buyPrice).toBe(90000);
  expect(a.positionSource).toBe('manual');
});

test('F. ledger 자산의 부팅 동작은 그대로다 - 거래원장이 이긴다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 150, buyPrice: 90000, positionSource: 'ledger' },
    transactions: [{ id: 'e61f', quantity: 100, price: 80000 }],
  });
  await reboot(page);
  const a = await readAsset(page);
  // ledger 자산은 스스로 "거래원장이 관리한다"고 적어 두었으므로 예전 그대로 덮어써진다.
  expect(a.quantity).toBe(100);
  expect(a.buyPrice).toBe(80000);
  expect(a.positionSource).toBe('ledger');
});

test('G. ledger 자산은 사용자가 거래를 추가해도 예전 그대로 동작한다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: 'ledger' },
    transactions: [{ id: 'e61g', quantity: 100, price: 80000 }],
  });
  await addBuyViaForm(page, { quantity: 50, price: 80000 });
  const a = await readAsset(page);
  expect(a.quantity).toBe(150);
  expect(a.positionSource).toBe('ledger');
});

test('H. 원화 현금 가드는 그대로다 - legacy든 아니든 부팅이 건드리지 않는다', async ({ page }) => {
  await seed(page, {
    asset: { ticker: '', name: 'E61원화예수금', category: '현금', currency: 'KRW', quantity: 10000000, buyPrice: 1, positionSource: undefined },
    transactions: [{ id: 'e61h', quantity: 5000000, price: 1 }],
  });
  await reboot(page);
  const a = await readAsset(page);
  expect(a.quantity).toBe(10000000);
  expect(a.positionSource).toBe('UNDEF');

  // 달러 현금은 예전 그대로 거래원장이 관리한다(원화 현금 가드에서 제외돼 있다) - 단, legacy이므로
  // 이번 D-3 가드가 부팅에서 먼저 잡는다. 표식이 ledger면 예전 그대로 덮어써진다.
  await seed(page, {
    asset: { ticker: '', name: 'E61달러예수금', category: '현금', currency: 'USD', quantity: 10000, buyPrice: 1, positionSource: 'ledger' },
    transactions: [{ id: 'e61h2', quantity: 5000, price: 1 }],
  });
  await reboot(page);
  const usd = await readAsset(page);
  expect(usd.quantity).toBe(5000);
  expect(usd.positionSource).toBe('ledger');
});

/* ══════════════════════════════════════════════════════════════════════
 * I/J. 핵심 시나리오 - 엑셀로 현재 상태를 정정하고, 그 뒤 거래를 입력한다
 * ═════════════════════════════════════════════════════════════════════ */
test('I. [핵심] 자산관리 엑셀로 정정한 현재 보유 수량이 부팅 후에도 유지된다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ id: 'e61i', quantity: 70, price: 50000 }],
  });
  // 엑셀 가져오기 [덮어쓰기]가 하는 일을 그대로 재현한다(js/12) - 엑셀 시트에는 positionSource
  // 칸이 없으므로 파일에서 온 자산은 항상 값이 비어 있고, carryOverPositionSource가 기존 자산에서
  // 표식만 이어받는다(legacy는 이어받을 값이 없어 그대로 legacy로 남는다).
  await page.locator('body').evaluate((el, o) => {
    const imported = [makeAsset({
      id: state.assets[0].id, ticker: o.ticker, owner: '신랑', accountType: '일반계좌', name: o.name,
      category: '주식', isDomestic: '국내', currency: 'KRW',
      quantity: 150, buyPrice: 90000, currentPrice: 100000, role: 'core', rateMatchOverride: 'KOSPI',
    })];
    const keptSources = buildPositionSourceIndex(state.assets);
    state.assets = imported.map((a) => carryOverPositionSource(a, keptSources));
    persistAssets();
  }, { ticker: TICKER, name: NAME });

  const afterImport = await readAsset(page);
  expect(afterImport.quantity).toBe(150);
  expect(afterImport.positionSource).toBe('UNDEF');

  await reboot(page);
  const a = await readAsset(page);
  // 수정 전에는 여기가 70/50000이었다 - 엑셀 정정이 부팅 한 번에 통째로 되돌아갔다.
  expect(a.quantity).toBe(150);
  expect(a.buyPrice).toBe(90000);
  expect(a.positionSource).toBe('UNDEF');   // 자동 승격 없음
  expect(a.txCount).toBe(1);               // 거래를 만들지도 지우지도 않는다
});

test('J. 엑셀로 정정한 뒤 거래를 입력하면 그때는 거래원장 기준으로 갱신된다', async ({ page }) => {
  await seed(page, {
    asset: { name: NAME, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ id: 'e61j', quantity: 70, price: 50000 }],
  });
  await page.locator('body').evaluate((el, o) => {
    const imported = [makeAsset({
      id: state.assets[0].id, ticker: o.ticker, owner: '신랑', accountType: '일반계좌', name: o.name,
      category: '주식', isDomestic: '국내', currency: 'KRW',
      quantity: 150, buyPrice: 90000, currentPrice: 100000, role: 'core', rateMatchOverride: 'KOSPI',
    })];
    const keptSources = buildPositionSourceIndex(state.assets);
    state.assets = imported.map((a) => carryOverPositionSource(a, keptSources));
    persistAssets();
  }, { ticker: TICKER, name: NAME });
  await reboot(page);
  expect((await readAsset(page)).quantity).toBe(150);   // 엑셀 정정이 유지된 상태

  // 여기서 사용자가 누락됐던 매수를 거래로 입력한다 - 명시적 행동이므로 거래원장이 이긴다.
  await addBuyViaForm(page, { quantity: 30, price: 50000 });
  const a = await readAsset(page);
  expect(a.quantity).toBe(100);            // 70 + 30, 거래원장 재계산 결과
  expect(a.txCount).toBe(2);
  expect(a.positionSource).toBe('UNDEF');  // 반영은 하되 표식은 끝까지 만들지 않는다
});

/* ══════════════════════════════════════════════════════════════════════
 * 대조군 - 자산이 아예 없는 포지션은 부팅에서도 예전처럼 새로 만들어진다
 * ═════════════════════════════════════════════════════════════════════ */
test('K. 자산이 없는 거래는 부팅에서 예전 그대로 ledger 자산으로 생성된다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.locator('body').evaluate((el, o) => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [];
    state.transactions = [{
      id: 'e61k', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: o.ticker,
      name: o.name, type: 'buy', quantity: 40, price: 60000, currency: 'KRW', fee: 0,
      origin: 'initial', createdAt: 1, updatedAt: 1,
    }];
    persistAssets(); persistTransactions();
  }, { ticker: TICKER, name: NAME });
  await reboot(page);
  const a = await readAsset(page);
  // D-3 가드는 "기존 값을 덮어쓰는" 경우에만 적용된다 - 자산을 처음 만드는 안전망은 그대로 살아있다.
  expect(a.quantity).toBe(40);
  expect(a.buyPrice).toBe(60000);
  expect(a.positionSource).toBe('ledger');
});
