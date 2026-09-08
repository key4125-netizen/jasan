// E2E-70 [V1.2-B BL-18] Cloud merge 후 ledger asset position 정합성 - PM 승인 Option A
// (mergeAssetsAndTransactionsWithRemote() 끝에서 syncAssetsFromTransactions({auto:true}) 호출)이
// 실제 앱에서 정확히 동작하는지 검증한다.
//
// 실제 앱(state/persistAssets/mergeAssetsAndTransactionsWithRemote)을 그대로 사용한다 - 등가 로직을
// 복제하지 않는다. 외부 네트워크(Cloud Worker)는 쓰지 않는다(기존 E2E 격리 정책 - Worker 호출 자체는
// pullFromCloud/pushToCloud의 fetch 부분이며, 이번 검증 대상인 병합/재동기화 로직은 그 두 함수가 항상
// 부르는 mergeAssetsAndTransactionsWithRemote() 자체이므로 이 함수를 직접 호출해도 실제 코드 경로를
// 그대로 통과한다 - test/bl18-cloud-merge-position-sync.test.js와 동일한 근거).
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof mergeAssetsAndTransactionsWithRemote === 'function');
  page.on('dialog', (d) => d.accept());
}

function seed(page, { assets, transactions }) {
  return page.locator('body').evaluate((el, { assets, transactions }) => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = assets;
    state.transactions = transactions;
    persistAssets(); persistTransactions();
  }, { assets, transactions });
}

function tx(overrides) {
  return {
    owner: '신랑', accountType: '일반계좌', ticker: 'AAA', name: '테스트종목',
    type: 'buy', quantity: 0, price: 0, currency: 'KRW', fee: 0,
    origin: 'period', createdAt: overrides.updatedAt || Date.now(), updatedAt: Date.now(),
    ...overrides
  };
}

/* ── CASE 1 핵심 재현 - 실제 페이지 새로고침까지 포함 ─────────────────────── */
test('CASE 1. Cloud merge 후 ledger asset.quantity가 병합된 거래 전체 기준으로 정정되고, 새로고침 후에도 유지된다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [{ id: 'e70-a1', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', name: '테스트종목', category: '주식', categorySource: 'system', currency: 'KRW', isDomestic: '국내', quantity: 7, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 500 }],
    transactions: [
      tx({ id: 'e70-t1', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 }),
      tx({ id: 'e70-t2', type: 'sell', quantity: 3, price: 1000, date: '2026-01-02', createdAt: 500, updatedAt: 500 })
    ]
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteAssets = [{ id: 'e70-a1', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', name: '테스트종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 15, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 900 }];
    const remoteTx = [
      { owner: '신랑', accountType: '일반계좌', ticker: 'AAA', name: '테스트종목', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-t1', date: '2026-01-01', createdAt: 100, updatedAt: 100 },
      { owner: '신랑', accountType: '일반계좌', ticker: 'AAA', name: '테스트종목', type: 'buy', quantity: 5, price: 1000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-t3', date: '2026-01-03', createdAt: 900, updatedAt: 900 }
    ];
    mergeAssetsAndTransactionsWithRemote({ assets: remoteAssets, transactions: remoteTx });
    persistAssets(); persistTransactions();
    return { quantity: state.assets.find((a) => a.id === 'e70-a1').quantity, txCount: state.transactions.length };
  });
  expect(result).toEqual({ quantity: 12, txCount: 3 });

  // 실제 새로고침 후에도 정정된 값이 그대로 유지되는지 확인(persistAssets 저장 경로 검증)
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.assets.some((a) => a.id === 'e70-a1'));
  const afterReload = await page.locator('body').evaluate(() => state.assets.find((a) => a.id === 'e70-a1').quantity);
  expect(afterReload).toBe(12);
});

/* ── CASE 2/3 legacy/manual 보호 ────────────────────────────────────────── */
test('CASE 2/3. legacy·manual 자산은 Cloud merge+resync 후에도 quantity/positionSource가 그대로다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [
      { id: 'e70-legacy', ticker: 'BBB', owner: '신랑', accountType: '일반계좌', name: '레거시', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 5000, currentPrice: 5000, updatedAt: 100 },
      { id: 'e70-manual', ticker: 'CCC', owner: '신랑', accountType: '일반계좌', name: '수동관리', category: 'ETF', currency: 'KRW', isDomestic: '국내', quantity: 50, buyPrice: 20000, currentPrice: 20000, positionSource: 'manual', updatedAt: 100 }
    ],
    transactions: [
      tx({ id: 'e70-lt1', ticker: 'BBB', type: 'buy', quantity: 100, price: 5000, date: '2026-01-01', createdAt: 100, updatedAt: 100 })
    ]
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteTx = [
      { owner: '신랑', accountType: '일반계좌', ticker: 'BBB', name: '레거시', type: 'buy', quantity: 999, price: 1, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-lt2', date: '2026-01-05', createdAt: 900, updatedAt: 900 },
      { owner: '신랑', accountType: '일반계좌', ticker: 'CCC', name: '수동관리', type: 'buy', quantity: 999, price: 1, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-mt1', date: '2026-01-05', createdAt: 900, updatedAt: 900 }
    ];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    persistAssets(); persistTransactions();
    const legacy = state.assets.find((a) => a.id === 'e70-legacy');
    const manual = state.assets.find((a) => a.id === 'e70-manual');
    return {
      legacy: { quantity: legacy.quantity, positionSource: legacy.positionSource },
      manual: { quantity: manual.quantity, buyPrice: manual.buyPrice, positionSource: manual.positionSource }
    };
  });
  expect(result.legacy).toEqual({ quantity: 100, positionSource: undefined });
  expect(result.manual).toEqual({ quantity: 50, buyPrice: 20000, positionSource: 'manual' });
});

/* ── CASE 5 BL-17 categorySource pair 보호 - Cloud merge+resync 결합 경로 ──── */
test('CASE 5. Cloud merge+resync 결합 경로에서도 category/categorySource pair가 훼손되지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [{ id: 'e70-cat', ticker: 'EEE', owner: '신랑', accountType: '일반계좌', name: 'ETF종목', category: 'ETF', categorySource: 'user', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000, currentPrice: 1000, updatedAt: 100 }],
    transactions: []
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteAssets = [{ id: 'e70-cat', ticker: 'EEE', owner: '신랑', accountType: '일반계좌', name: 'ETF종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000, currentPrice: 1000, updatedAt: 900 }];
    mergeAssetsAndTransactionsWithRemote({ assets: remoteAssets, transactions: [] });
    persistAssets(); persistTransactions();
    const a = state.assets.find((x) => x.id === 'e70-cat');
    return { category: a.category, categorySource: a.categorySource };
  });
  expect(result).toEqual({ category: 'ETF', categorySource: 'user' });

  // 새로고침 후에도(v224 persistence hotfix) categorySource가 살아있는지 함께 확인
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.assets.some((a) => a.id === 'e70-cat'));
  const afterReload = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.id === 'e70-cat');
    return { category: a.category, categorySource: a.categorySource };
  });
  expect(afterReload).toEqual({ category: 'ETF', categorySource: 'user' });
});

/* ── 계산 회귀 - resync로 정정된 asset을 계산엔진이 정상 소비한다 ──────────── */
test('계산 회귀. Cloud merge로 정정된 quantity가 대시보드 계산(calcRow)에 그대로 반영된다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [{ id: 'e70-calc', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', name: '테스트종목', category: '주식', categorySource: 'system', currency: 'KRW', isDomestic: '국내', quantity: 7, buyPrice: 1000, currentPrice: 2000, positionSource: 'ledger', updatedAt: 500 }],
    transactions: [tx({ id: 'e70-calct1', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 })]
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteTx = [{ owner: '신랑', accountType: '일반계좌', ticker: 'AAA', name: '테스트종목', type: 'buy', quantity: 5, price: 1000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-calct2', date: '2026-01-05', createdAt: 900, updatedAt: 900 }];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    persistAssets(); persistTransactions();
    const a = state.assets.find((x) => x.id === 'e70-calc');
    return { quantity: a.quantity, curAmount: calcRow(a).curAmount };
  });
  expect(result.quantity).toBe(15); // 10(기존)+5(신규 merge) - 매도 없음
  expect(result.curAmount).toBe(15 * 2000); // calcRow가 정정된 quantity를 그대로 소비
});

/* ── CASE 4/6 ledger 재계산 - buyPrice/buyRate가 병합된 거래 기준 실제 값과 정확히 일치 ──── */
test('CASE 4/6. ledger 자산(USD) - quantity/buyPrice/buyRate가 병합된 전체 거래 기준 실제 계산값과 정확히 일치한다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [{ id: 'e70-ledger', ticker: 'FFF', owner: '신랑', accountType: '일반계좌', name: '해외종목', category: '주식', currency: 'USD', isDomestic: '해외', quantity: 10, buyPrice: 100, buyRate: 1300, currentPrice: 100, positionSource: 'ledger', updatedAt: 100 }],
    transactions: [tx({ id: 'e70-lt1', ticker: 'FFF', type: 'buy', quantity: 10, price: 100, currency: 'USD', appliedRate: 1300, date: '2026-01-01', createdAt: 100, updatedAt: 100 })]
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteTx = [{ owner: '신랑', accountType: '일반계좌', ticker: 'FFF', name: '해외종목', type: 'buy', quantity: 10, price: 100, currency: 'USD', appliedRate: 1500, fee: 0, origin: 'period', id: 'e70-lt2', date: '2026-01-05', createdAt: 900, updatedAt: 900 }];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    persistAssets(); persistTransactions();
    const { positions } = computePositionsAndRealizedPnL();
    const pos = positions['신랑__일반계좌__FFF'];
    const a = state.assets.find((x) => x.id === 'e70-ledger');
    return { quantity: a.quantity, buyPrice: a.buyPrice, buyRate: a.buyRate, posQuantity: pos.quantity, posAvgPrice: pos.avgPrice, posAvgRate: pos.avgRate };
  });
  expect(result.quantity).toBe(result.posQuantity);
  expect(result.buyPrice).toBe(result.posAvgPrice);
  expect(result.buyRate).toBe(result.posAvgRate); // 단순 존재 확인이 아니라 실제 가중평균환율 값과 비교
  expect(result.buyRate).toBeGreaterThan(1300);
  expect(result.buyRate).toBeLessThan(1500);
});

/* ── CASE 7 - local 직접입력 경로와 Cloud merge 경로의 최종 position이 같다(추가/삭제) ──── */
test('CASE 7. transaction 추가/삭제 - local 직접입력 경로와 Cloud merge 경로의 최종 position이 동일하다', async ({ page }) => {
  await open(page);

  // 추가: local 경로 - 사용자가 직접 거래를 추가하면 기존 js/06 경로가 syncAssetsFromTransactions()를 그 즉시 호출한다
  await seed(page, {
    assets: [{ id: 'e70-cmp', ticker: 'GGG', owner: '신랑', accountType: '일반계좌', name: '비교종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 100 }],
    transactions: [tx({ id: 'e70-cmpt1', ticker: 'GGG', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 })]
  });
  const localAddResult = await page.locator('body').evaluate(() => {
    state.transactions.push({ owner: '신랑', accountType: '일반계좌', ticker: 'GGG', name: '비교종목', type: 'buy', quantity: 5, price: 2000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-cmpt2', date: '2026-01-05', createdAt: 900, updatedAt: 900 });
    syncAssetsFromTransactions();
    const a = state.assets.find((x) => x.id === 'e70-cmp');
    return { quantity: a.quantity, buyPrice: a.buyPrice };
  });

  // 추가: Cloud merge 경로 - 같은 거래가 원격에서 병합되어 들어온다
  await seed(page, {
    assets: [{ id: 'e70-cmp', ticker: 'GGG', owner: '신랑', accountType: '일반계좌', name: '비교종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 100 }],
    transactions: [tx({ id: 'e70-cmpt1', ticker: 'GGG', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 })]
  });
  const mergeAddResult = await page.locator('body').evaluate(() => {
    const remoteTx = [{ owner: '신랑', accountType: '일반계좌', ticker: 'GGG', name: '비교종목', type: 'buy', quantity: 5, price: 2000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-cmpt2', date: '2026-01-05', createdAt: 900, updatedAt: 900 }];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    const a = state.assets.find((x) => x.id === 'e70-cmp');
    return { quantity: a.quantity, buyPrice: a.buyPrice };
  });
  expect(mergeAddResult).toEqual(localAddResult);

  // 삭제: 원격이 거래를 지운 뒤(lastSyncedIds에 반영) 병합 - 남은 거래 기준으로 재계산되는지
  await seed(page, {
    assets: [{ id: 'e70-del', ticker: 'HHH', owner: '신랑', accountType: '일반계좌', name: '삭제비교종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 15, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 500 }],
    transactions: [
      tx({ id: 'e70-dt1', ticker: 'HHH', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 }),
      tx({ id: 'e70-dt2', ticker: 'HHH', type: 'buy', quantity: 5, price: 1000, date: '2026-01-02', createdAt: 500, updatedAt: 500 })
    ]
  });
  const deleteResult = await page.locator('body').evaluate(() => {
    localStorage.setItem('sam_sync_merged_tx_ids_v1', JSON.stringify(['e70-dt1', 'e70-dt2']));
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: [{ owner: '신랑', accountType: '일반계좌', ticker: 'HHH', name: '삭제비교종목', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-dt1', date: '2026-01-01', createdAt: 100, updatedAt: 100 }] });
    return { txCount: state.transactions.length, quantity: state.assets.find((x) => x.id === 'e70-del').quantity };
  });
  expect(deleteResult).toEqual({ txCount: 1, quantity: 10 });
});

/* ── multi-owner - 소유자별 거래가 섞이지 않는다 ─────────────────────────── */
test('multi-owner. 같은 티커라도 소유자가 다르면 Cloud merge+resync가 서로 섞이지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, {
    assets: [
      { id: 'e70-ow1', ticker: 'III', owner: '신랑', accountType: '일반계좌', name: '공용종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 100 },
      { id: 'e70-ow2', ticker: 'III', owner: '아내', accountType: '일반계좌', name: '공용종목', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 20, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger', updatedAt: 100 }
    ],
    transactions: [
      tx({ id: 'e70-owt1', ticker: 'III', owner: '신랑', type: 'buy', quantity: 10, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 }),
      tx({ id: 'e70-owt2', ticker: 'III', owner: '아내', type: 'buy', quantity: 20, price: 1000, date: '2026-01-01', createdAt: 100, updatedAt: 100 })
    ]
  });

  const result = await page.locator('body').evaluate(() => {
    const remoteTx = [{ owner: '신랑', accountType: '일반계좌', ticker: 'III', name: '공용종목', type: 'buy', quantity: 5, price: 1000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-owt3', date: '2026-01-05', createdAt: 900, updatedAt: 900 }];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    return {
      husband: state.assets.find((x) => x.id === 'e70-ow1').quantity,
      wife: state.assets.find((x) => x.id === 'e70-ow2').quantity
    };
  });
  expect(result).toEqual({ husband: 15, wife: 20 });
});

/* ── 신규 자산 생성 - category/categorySource 기존 정책대로(system) ─────────── */
test('신규 자산 생성. Cloud merge로 이 기기에 없던 거래가 들어와 새 ledger 자산이 생기면 categorySource=system(기존 정책 그대로)', async ({ page }) => {
  await open(page);
  await page.locator('body').evaluate(() => { state.assets = []; state.transactions = []; persistAssets(); persistTransactions(); });

  const result = await page.locator('body').evaluate(() => {
    const remoteTx = [{ owner: '신랑', accountType: '일반계좌', ticker: '005930.KS', name: '삼성전자', type: 'buy', quantity: 10, price: 70000, currency: 'KRW', fee: 0, origin: 'period', id: 'e70-nt1', date: '2026-01-01', createdAt: 100, updatedAt: 100 }];
    mergeAssetsAndTransactionsWithRemote({ assets: [], transactions: remoteTx });
    const created = state.assets.find((a) => a.ticker === '005930.KS');
    return created ? { positionSource: created.positionSource, categorySource: created.categorySource } : null;
  });
  expect(result).toEqual({ positionSource: 'ledger', categorySource: 'system' });
});
