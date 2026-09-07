// E2E-62 [V1.1 S-1b] legacy 자산의 값이 거래원장과 어긋나면 LEDGER_UNKNOWN으로 알린다.
//
// S-1 D-3이 부팅 자동 재계산으로부터 legacy 자산을 보호하면서, 부작용으로 사각지대가 생겼다.
// 예전에는 부팅이 (잘못된 방식으로나마) legacy 자산을 거래원장 값에 맞춰버려 불일치가 남지
// 않았는데, 이제는 불일치가 그대로 살아있고 아무도 알려주지 않는다. 그 사각지대만 메운다.
//
// 이 진단은 아무것도 고치지 않는다 - 값을 맞춰주지도, positionSource를 적어넣지도 않는다.
// "legacy라서" 경고하지도 않는다: 거래가 없거나 값이 맞으면 예전 그대로 조용하다.
//
// 비교는 manual(MANUAL_WITH_TX)과 완전히 같은 두 필드(quantity·buyPrice)만 한다. buyRate는
// 일부러 뺐다(테스트 D 참고). 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof assessPositionConsistency === 'function');
}

// 자산 1건 + 거래 N건을 심고 진단 결과를 돌려준다. positionSource는 넘긴 값 그대로 들어간다
// (undefined면 legacy).
function judge(page, opts) {
  return page.locator('body').evaluate((el, o) => {
    state.exchangeRate = 1450;
    persistRate(true);
    const isUsd = o.asset.currency === 'USD';
    state.assets = [makeAsset({
      ticker: o.asset.ticker === undefined ? '005930.KS' : o.asset.ticker,
      name: o.asset.name, category: o.asset.category || '주식',
      currency: o.asset.currency || 'KRW', isDomestic: isUsd ? '해외' : '국내',
      owner: '신랑', accountType: '일반계좌',
      quantity: o.asset.quantity, buyPrice: o.asset.buyPrice, currentPrice: 100000,
      buyRate: o.asset.buyRate, role: 'core', rateMatchOverride: 'KOSPI',
      positionSource: o.asset.positionSource,
    })];
    state.transactions = (o.transactions || []).map((t, i) => ({
      id: `e62_${i}`, date: `2025-01-0${i + 1}`, owner: '신랑', accountType: '일반계좌',
      ticker: o.asset.ticker === undefined ? '005930.KS' : o.asset.ticker, name: o.asset.name,
      type: 'buy', quantity: t.quantity, price: t.price,
      currency: o.asset.currency || 'KRW', appliedRate: isUsd ? t.rate : undefined,
      fee: 0, origin: 'initial', createdAt: i + 1, updatedAt: i + 1,
    }));
    persistAssets();
    persistTransactions();
    const r = assessPositionConsistency(state.assets[0]);
    return { status: r.status, message: r.message, ledgerQuantity: r.ledgerQuantity, ledgerBuyPrice: r.ledgerBuyPrice };
  }, opts);
}

const KRW = { name: 'E62삼성전자', currency: 'KRW' };
const USD = { ticker: 'AAPL', name: 'E62Apple', currency: 'USD' };

test('A. legacy + 거래 존재 + 값 일치 → OK (legacy라는 이유만으로 경고하지 않는다)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  expect(r.status).toBe('OK');
});

test('B. legacy + quantity 불일치 → LEDGER_UNKNOWN', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 80000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  // 수정 전에는 여기가 OK였다 - 값이 어긋났는데 아무 안내도 없었다.
  expect(r.status).toBe('LEDGER_UNKNOWN');
  expect(r.message).toContain('확인이 필요합니다');
  // 화면이 "거래원장은 얼마인지"를 함께 보여줄 수 있도록 manual과 같은 부가 정보를 싣는다.
  expect(r.ledgerQuantity).toBe(100);
  expect(r.ledgerBuyPrice).toBe(80000);
});

test('C. legacy + buyPrice 불일치 → LEDGER_UNKNOWN', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 100, buyPrice: 90000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  expect(r.status).toBe('LEDGER_UNKNOWN');
});

test('D. legacy USD + buyRate만 불일치 → OK (buyRate는 비교하지 않는다)', async ({ page }) => {
  await open(page);
  // 취득환율만 다르고 수량·취득가는 완전히 같다.
  const withRate = await judge(page, {
    asset: { ...USD, quantity: 100, buyPrice: 100, buyRate: 1200, positionSource: undefined },
    transactions: [{ quantity: 100, price: 100, rate: 1400 }],
  });
  expect(withRate.status).toBe('OK');
  // buyRate 자체가 없는 구형 legacy USD 자산(Phase 53 이전 데이터)도 조용해야 한다 - 이걸 비교에
  // 넣으면 값이 완벽히 맞는 자산까지 전부 경고가 뜬다.
  const withoutRate = await judge(page, {
    asset: { ...USD, quantity: 100, buyPrice: 100, buyRate: undefined, positionSource: undefined },
    transactions: [{ quantity: 100, price: 100, rate: 1400 }],
  });
  expect(withoutRate.status).toBe('OK');
});

test('E. manual + 불일치 → MANUAL_WITH_TX (기존 그대로, 충돌 없음)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: 'manual' },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  expect(r.status).toBe('MANUAL_WITH_TX');
  expect(r.ledgerQuantity).toBe(100);
});

test('E-2. manual + 거래 없음 → OK (기존 그대로)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: 'manual' },
    transactions: [],
  });
  expect(r.status).toBe('OK');
});

test('F. ledger + 값 불일치 → OK (기존 동작 유지 - 값 비교를 확대하지 않는다)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: 'ledger' },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  expect(r.status).toBe('OK');
});

test('F-2. ledger + 거래 없음 → LEDGER_WITHOUT_TX (기존 그대로)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: 'ledger' },
    transactions: [],
  });
  expect(r.status).toBe('LEDGER_WITHOUT_TX');
});

test('G. [핵심] legacy + 불일치 → 부팅 후 자산 값 유지 + 진단만 LEDGER_UNKNOWN, state는 불변', async ({ page }) => {
  await open(page);
  await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  // 진짜 bootApp()을 태운다.
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets));

  const r = await page.locator('body').evaluate(() => {
    // 부팅 직후의 값을 그대로 스냅샷한 뒤 진단을 여러 번 돌려 state가 흔들리지 않는지 본다.
    const assetsBefore = JSON.stringify(state.assets);
    const txBefore = JSON.stringify(state.transactions);
    let status = null;
    for (let i = 0; i < 5; i++) status = assessPositionConsistency(state.assets[0]).status;
    return {
      quantity: state.assets[0].quantity,
      buyPrice: state.assets[0].buyPrice,
      positionSource: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource,
      txCount: state.transactions.length,
      status,
      assetsUnchanged: JSON.stringify(state.assets) === assetsBefore,
      txUnchanged: JSON.stringify(state.transactions) === txBefore,
    };
  });
  // D-3: 부팅이 자산 마스터 값을 그대로 둔다.
  expect(r.quantity).toBe(150);
  expect(r.buyPrice).toBe(90000);
  expect(r.positionSource).toBe('UNDEF');   // 자동 승격 없음
  expect(r.txCount).toBe(1);                // 거래를 만들지도 지우지도 않는다
  // S-1b: 그 사실을 이제 알린다.
  expect(r.status).toBe('LEDGER_UNKNOWN');
  // 진단은 순수 판정이다 - byte-level JSON이 그대로여야 한다.
  expect(r.assetsUnchanged).toBe(true);
  expect(r.txUnchanged).toBe(true);
});

test('H. legacy + 거래를 저장해 값이 맞춰지면 → OK로 돌아온다', async ({ page }) => {
  await open(page);
  await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 80000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  // 사용자가 누락된 50주를 거래로 입력한다 - 명시적 행동이므로 거래원장이 자산에 반영된다(D-3).
  await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    openTransactionModal();
    doc.getElementById('tx_date').value = '2025-06-01';
    doc.getElementById('tx_owner').value = '신랑';
    doc.getElementById('tx_accountType').value = '일반계좌';
    doc.getElementById('tx_ticker').value = '005930.KS';
    doc.getElementById('tx_name').value = 'E62삼성전자';
    doc.getElementById('tx_type').value = 'buy';
    doc.getElementById('tx_quantity').value = '50';
    doc.getElementById('tx_price').value = '80000';
    doc.getElementById('tx_currency').value = 'KRW';
    doc.getElementById('transactionForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  });
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
  const r = await page.locator('body').evaluate(() => ({
    quantity: state.assets[0].quantity,
    ps: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource,
    status: assessPositionConsistency(state.assets[0]).status,
  }));
  expect(r.quantity).toBe(150);      // 거래원장 재계산 결과와 일치
  expect(r.ps).toBe('UNDEF');        // 표식은 여전히 만들지 않는다
  expect(r.status).toBe('OK');       // 값이 맞으니 경고가 사라진다
});

test('I. legacy + 거래 삭제 → 기존 D-3/BL-12 정책이 그대로다', async ({ page }) => {
  await open(page);
  await judge(page, {
    asset: { ...KRW, quantity: 100, buyPrice: 80000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  const legacy = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e62_0'); } finally { win.confirm = realConfirm; }
    return {
      quantity: state.assets[0].quantity,
      ps: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource,
      status: assessPositionConsistency(state.assets[0]).status,
    };
  });
  // 거래 삭제는 사용자의 명시적 행동이므로 예전 그대로 0으로 정리된다.
  expect(legacy).toEqual({ quantity: 0, ps: 'UNDEF', status: 'OK' }); // 거래가 없어졌으니 진단도 OK

  // BL-12: manual 자산은 여전히 보호된다.
  await judge(page, {
    asset: { ...KRW, quantity: 100, buyPrice: 80000, positionSource: 'manual' },
    transactions: [{ quantity: 70, price: 50000 }],
  });
  const manual = await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const realConfirm = win.confirm;
    win.confirm = () => true;
    try { deleteTransaction('e62_0'); } finally { win.confirm = realConfirm; }
    return { quantity: state.assets[0].quantity, ps: state.assets[0].positionSource };
  });
  expect(manual).toEqual({ quantity: 100, ps: 'manual' });
});

test('J. legacy + 거래 없음 → OK (부동산·직접등록 자산은 거래가 없는 게 정상이다)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ticker: '', name: 'E62아파트', category: '부동산', currency: 'KRW', quantity: 1, buyPrice: 500000000, positionSource: undefined },
    transactions: [],
  });
  expect(r.status).toBe('OK');
});

test('K. legacy 원화현금 + 옛 거래 → OK (원화 현금 가드가 그대로다)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ticker: '', name: 'E62예수금', category: '현금', currency: 'KRW', quantity: 10000000, buyPrice: 1, positionSource: undefined },
    transactions: [{ quantity: 5000000, price: 1 }],
  });
  expect(r.status).toBe('OK');
});

test('L. legacy USD + quantity/buyPrice 불일치 → LEDGER_UNKNOWN', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...USD, quantity: 100, buyPrice: 100, buyRate: 1300, positionSource: undefined },
    transactions: [{ quantity: 70, price: 90, rate: 1300 }],
  });
  expect(r.status).toBe('LEDGER_UNKNOWN');

  // 달러 현금도 같은 규칙을 받는다(원화 현금 가드에서 제외돼 있다).
  const cash = await judge(page, {
    asset: { ticker: '', name: 'E62달러예수금', category: '현금', currency: 'USD', quantity: 10000, buyPrice: 1, buyRate: 1300, positionSource: undefined },
    transactions: [{ quantity: 5000, price: 1, rate: 1300 }],
  });
  expect(cash.status).toBe('LEDGER_UNKNOWN');
});

test('M. 부동소수 오차만 다르면 → OK (기존 허용오차 함수를 그대로 쓴다)', async ({ page }) => {
  await open(page);
  const r = await judge(page, {
    asset: { ...KRW, quantity: 100, buyPrice: 80000.0000000001, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  expect(r.status).toBe('OK');
});

test('N. legacy 자산 6건이 전부 값 일치 → 경고 0건 (경고 과다가 생기지 않는다)', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    const mk = (o) => makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌', currentPrice: 100000 }, o));
    // v217 이전 사용자를 흉내낸다 - 자산 6건 전부 legacy, 거래는 값이 정확히 맞는다.
    state.assets = [
      mk({ ticker: '005930.KS', name: 'E62N삼성', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 80000 }),
      mk({ ticker: 'AAPL', name: 'E62NApple', category: '주식', currency: 'USD', isDomestic: '해외', quantity: 50, buyPrice: 100, buyRate: 1300 }),
      mk({ ticker: '', name: 'E62N아파트', category: '부동산', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 500000000 }),
      mk({ ticker: '', name: 'E62N예수금', category: '현금', currency: 'KRW', isDomestic: '국내', quantity: 10000000, buyPrice: 1 }),
      mk({ ticker: '', name: 'E62N국고채', category: '채권', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 100000000 }),
      mk({ ticker: 'QQQM', name: 'E62NQQQM', category: '주식', currency: 'USD', isDomestic: '해외', quantity: 10, buyPrice: 200, buyRate: 1300 }),
    ];
    const tx = (id, ticker, name, qty, price, cur, rate) => ({
      id, date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker, name, type: 'buy',
      quantity: qty, price, currency: cur, appliedRate: rate, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1,
    });
    state.transactions = [
      tx('n1', '005930.KS', 'E62N삼성', 100, 80000, 'KRW'),
      tx('n2', 'AAPL', 'E62NApple', 50, 100, 'USD', 1300),
      tx('n3', 'QQQM', 'E62NQQQM', 10, 200, 'USD', 1300),
    ];
    const all = state.assets.map((a) => assessPositionConsistency(a).status);
    return { all, warnings: all.filter((s) => s !== 'OK').length };
  });
  expect(r.all).toEqual(['OK', 'OK', 'OK', 'OK', 'OK', 'OK']);
  expect(r.warnings).toBe(0);
});

test('O. 기존 경고 슬롯이 새 status를 그대로 렌더한다 (새 UI 없음)', async ({ page }) => {
  await open(page);
  await judge(page, {
    asset: { ...KRW, quantity: 150, buyPrice: 90000, positionSource: undefined },
    transactions: [{ quantity: 100, price: 80000 }],
  });
  await page.locator('body').evaluate(() => { openAssetDetailModal(state.assets[0].id); });
  const notice = page.locator('#assetDetailPositionNotice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('어느 쪽 값이 맞는지 확인이 필요합니다');
  // 자동 해결 버튼을 두지 않는다 - 어느 쪽이 맞는지는 사용자만 안다.
  expect(await notice.locator('button').count()).toBe(0);
  await page.locator('body').evaluate(() => { closeAssetDetailModal(); });
});
