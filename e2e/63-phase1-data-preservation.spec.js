// E2E-63 [V1.1 Phase 1] 사용자가 입력한 값이 복원·동기화 경로에서 사라지거나 뒤집히지 않는다.
//
//   BL-7a  JSON [추가하기]가 파일의 positionSource를 읽지 않아, 파일이 manual인데 로컬이 ledger면
//          복원 후 ledger가 됐다(백업에 없던 표식이 복원본에 붙었다).
//   BL-15  JSON [덮어쓰기]가 백업의 과거 updatedAt을 그대로 복원해, 복원 직후 동기화에서 원격이
//          무조건 이겨 방금 되돌린 값이 다시 뒤집혔다.
//   BL-13  구버전 원격 레코드가 더 최신이면 positionSource가 통째로 사라졌다(단위테스트에서 상세 검증).
//   BL-16  같은 이유로 buyRate도 함께 사라졌다.
//
// 여기서는 앱의 실제 복원/병합 함수를 그대로 태워 경로 전체를 검증한다. 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof buildSyncBlob === 'function');
}

// 실제 JSON 파일 입력 -> [추가하기]/[덮어쓰기] 경로를 그대로 태운다.
// 로직을 테스트에 복사하면 앱 코드가 되돌아가도 통과해버려 회귀를 못 잡는다.
async function importJson(page, blob, choice) {
  await page.setInputFiles('#jsonFileInput', {
    name: 'e63-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(blob), 'utf-8'),
  });
  await page.locator('#importChoiceModal').waitFor({ state: 'visible' });
  // [덮어쓰기]는 되돌릴 수 없는 삭제라 confirm이 한 번 더 뜬다(js/12) - 그 경로까지 그대로 탄다.
  if (choice === 'overwrite') page.once('dialog', (d) => d.accept());
  await page.locator(choice === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
  await expect(page.locator('#importChoiceModal')).toHaveClass(/hidden/);
}

/* ══════════════════════════════════════════════════════════════════
 * D / E. BL-7a — JSON [추가하기]
 * ═════════════════════════════════════════════════════════════════ */
test('D. [BL-7a] 파일의 positionSource=manual이 추가하기 후에도 manual로 남는다', async ({ page }) => {
  await open(page);
  // ① 백업 파일을 만든다: 이 자산은 사용자가 직접 등록한 manual 자산이다.
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e63a', ticker: 'E63A', name: 'E63자산', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 100, buyPrice: 70000, currentPrice: 80000, positionSource: 'manual' })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    return buildSyncBlob();
  });
  expect(blob.assets[0].positionSource).toBe('manual');   // 백업 파일에는 원래부터 들어 있다

  // ② 그 사이 이 기기에서는 같은 자산이 거래원장 기반(ledger)이 되어 있다.
  await page.locator('body').evaluate(() => {
    state.assets = [{ ...state.assets[0], positionSource: 'ledger' }];
    persistAssets();
  });

  // ③ 실제 [추가하기] 경로
  await importJson(page, blob, 'append');

  const r = await page.locator('body').evaluate(() => ({
    count: state.assets.length,
    positionSource: state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource,
    quantity: state.assets[0].quantity,
  }));
  expect(r.count).toBe(1);
  // 수정 전에는 'ledger'였다 - 매핑이 파일의 값을 읽지 않아 carryOver가 로컬 값으로 채웠다.
  expect(r.positionSource).toBe('manual');
  expect(r.quantity).toBe(100);
});

test('D-2. [BL-7a] 파일이 ledger면 ledger 그대로 복원된다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e63b', ticker: 'E63B', name: 'E63원장', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 70, buyPrice: 50000, currentPrice: 50000, positionSource: 'ledger' })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    return buildSyncBlob();
  });
  await page.locator('body').evaluate(() => {
    state.assets = [{ ...state.assets[0], positionSource: 'manual' }];
    persistAssets();
  });
  await importJson(page, blob, 'append');
  const v = await page.locator('body').evaluate(() => state.assets[0].positionSource);
  expect(v).toBe('ledger');
});

test('E. [BL-7a] 파일에 positionSource가 없으면 자동 승격하지 않는다 (legacy 정책 유지)', async ({ page }) => {
  await open(page);
  const base = {
    id: 'e63c', ticker: 'E63C', owner: '신랑', accountType: '일반계좌', category: '주식',
    name: 'E63레거시', isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 100,
    currentPrice: 100, updatedAt: 111111,
  };
  const blobNoPs = { assets: [base], transactions: [] };   // 표식이 아예 없는 백업(구버전 파일)

  // ① 기존 자산이 없을 때: 추론해서 채우지 않는다
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = []; state.transactions = [];
    persistAssets(); persistTransactions();
  });
  await importJson(page, blobNoPs, 'append');
  const alone = await page.locator('body').evaluate(() =>
    (state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource));
  expect(alone).toBe('UNDEF');

  // ② 기존 자산이 manual일 때: M4 carry-over 규칙(파일에 값이 없으면 로컬 값 승계)은 그대로
  await page.locator('body').evaluate((el, b) => {
    state.assets = [makeAsset({ ...b, positionSource: 'manual' })];
    persistAssets();
  }, base);
  await importJson(page, blobNoPs, 'append');
  const withLocal = await page.locator('body').evaluate(() =>
    (state.assets[0].positionSource === undefined ? 'UNDEF' : state.assets[0].positionSource));
  expect(withLocal).toBe('manual');
});

/* ══════════════════════════════════════════════════════════════════
 * F. BL-15 — JSON [덮어쓰기] 후 동기화
 * ═════════════════════════════════════════════════════════════════ */
test('F. [BL-15] 덮어쓰기로 복원한 값이 직후 동기화에서 되돌아가지 않는다', async ({ page }) => {
  await open(page);
  const ID = 'e63f';
  const base = {
    id: ID, ticker: 'E63F', owner: '신랑', accountType: '일반계좌', category: '주식',
    name: 'E63복원', isDomestic: '국내', currency: 'KRW', currentPrice: 100, positionSource: 'manual',
  };
  // 값 C = 백업 파일(과거 시점). updatedAt이 정의상 항상 과거인 것이 이 문제의 핵심이었다.
  const fileBlob = {
    assets: [{ ...base, quantity: 300, buyPrice: 300, updatedAt: 111111 }],
    transactions: [],
  };

  // 값 A = 현재 로컬
  await page.locator('body').evaluate((el, b) => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ...b, quantity: 100, buyPrice: 100 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
  }, base);

  // ① 실제 [덮어쓰기] 경로 (applyRemoteState를 그대로 탄다)
  await importJson(page, fileBlob, 'overwrite');

  // ② 복원 직후 동기화. 값 B = 원격(백업보다 나중에 저장됨)
  const r = await page.locator('body').evaluate((el, b) => {
    const afterRestore = state.assets[0].quantity;
    const restoredTs = state.assets[0].updatedAt;
    const remote = [normalizeImportedAsset({ ...b, quantity: 200, buyPrice: 200, updatedAt: 999999 })];
    // applyRemoteState가 병합 기준선을 비우므로 baseline은 빈 집합이다.
    const merged = mergeCollectionById(state.assets, remote, new Set());
    return {
      afterRestore, restoredTsIsNow: restoredTs > 111111,
      afterSync: merged[0].quantity,
      positionSource: merged[0].positionSource,
    };
  }, base);

  expect(r.afterRestore).toBe(300);        // 복원 직후 = 값 C
  expect(r.restoredTsIsNow).toBe(true);    // 복원 시각이 "지금"으로 찍혔다
  // 수정 전에는 여기가 200이었다 - 복원본의 과거 시각 때문에 원격이 무조건 이겼다.
  expect(r.afterSync).toBe(300);
  expect(r.positionSource).toBe('manual');
});

test('F-2. [BL-15] 거래내역도 같은 규칙으로 보호된다', async ({ page }) => {
  await open(page);
  const tx = (qty, ts) => ({
    id: 'e63ftx', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'E63F',
    name: 'E63복원', type: 'buy', quantity: qty, price: 100, currency: 'KRW', fee: 0,
    origin: 'initial', createdAt: 1, updatedAt: ts,
  });
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = []; state.transactions = [];
    persistAssets(); persistTransactions();
  });
  // 자산이 0건이면 핸들러가 "복원할 자산 데이터가 없습니다"로 먼저 끝난다(js/12) - 자산 1건을 함께 넣는다.
  const asset = { id: 'e63fa', ticker: 'E63F', owner: '신랑', accountType: '일반계좌', category: '주식',
    name: 'E63복원', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 1, currentPrice: 1,
    updatedAt: 111111 };
  await importJson(page, { assets: [asset], transactions: [tx(300, 111111)] }, 'overwrite');
  const r = await page.locator('body').evaluate((el, t) => {
    const remote = [normalizeImportedTransaction(t)];
    return {
      restoredTsIsNow: state.transactions[0].updatedAt > 111111,
      afterSync: mergeCollectionById(state.transactions, remote, new Set())[0].quantity,
    };
  }, tx(200, 999999));
  expect(r.restoredTsIsNow).toBe(true);
  expect(r.afterSync).toBe(300);
});

/* ══════════════════════════════════════════════════════════════════
 * BL-13 / BL-16 — 실제 원격 병합 경로에서
 * ═════════════════════════════════════════════════════════════════ */
test('G. [BL-13/BL-16] 구버전 원격이 더 최신이어도 positionSource·buyRate가 살아남는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    const ID = 'e63g';
    state.assets = [makeAsset({ id: ID, ticker: 'AAPL', name: 'E63Apple', category: '주식', currency: 'USD',
      isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100,
      currentPrice: 120, buyRate: 1300, role: 'core', rateMatchOverride: 'NASDAQ',
      positionSource: 'manual' })];
    state.assets[0].updatedAt = 100;
    // 이 필드들을 몰랐던 구버전 기기가 더 나중에 저장한 레코드
    const remote = [normalizeImportedAsset({ id: ID, ticker: 'AAPL', owner: '신랑', accountType: '일반계좌',
      category: '주식', name: 'E63Apple', isDomestic: '해외', currency: 'USD',
      quantity: 70, buyPrice: 90, currentPrice: 120, updatedAt: 200 })];
    const m = mergeCollectionById(state.assets, remote, new Set([ID]))[0];
    return {
      ps: m.positionSource === undefined ? 'UNDEF' : m.positionSource,
      buyRate: m.buyRate === undefined ? 'UNDEF' : m.buyRate,
      quantity: m.quantity,
      role: m.role === undefined ? 'UNDEF' : m.role,
      rmo: m.rateMatchOverride === undefined ? 'UNDEF' : m.rateMatchOverride,
    };
  });
  expect(r.ps).toBe('manual');      // 수정 전 UNDEF
  expect(r.buyRate).toBe(1300);     // 수정 전 UNDEF
  expect(r.quantity).toBe(70);      // 최신승 규칙은 그대로
  // role/rateMatchOverride는 의도적으로 보호하지 않는다(사용자가 지울 수 있는 값이라서).
  expect(r.role).toBe('UNDEF');
  expect(r.rmo).toBe('UNDEF');
});

/* ══════════════════════════════════════════════════════════════════
 * H. 계산 불변식 — 이번 수정은 데이터 보존이지 계산 변경이 아니다
 * ═════════════════════════════════════════════════════════════════ */
test('H. 데이터 보존 수정이 Projection / Monte Carlo / Risk 입력을 바꾸지 않는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    const seed = () => {
      state.assets = [
        makeAsset({ id: 'h1', ticker: '005930.KS', name: 'E63삼성', category: '주식', currency: 'KRW',
          isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000,
          currentPrice: 80000, role: 'core', rateMatchOverride: 'KOSPI', positionSource: 'manual' }),
        makeAsset({ id: 'h2', ticker: 'AAPL', name: 'E63Apple', category: '주식', currency: 'USD',
          isDomestic: '해외', owner: '와이프', accountType: '일반계좌', quantity: 50, buyPrice: 100,
          currentPrice: 120, buyRate: 1300, role: 'attacker', positionSource: 'ledger' }),
      ];
      state.transactions = [];
      REBALANCE_OWNERS.forEach((o) => {
        state.rebalance[o].domestic = { '국내': 60, '해외': 40 };
        state.rebalance[o].targets = {
          '국내': [{ type: 'ticker', ticker: '005930.KS', label: 'E63삼성', pct: 100, role: 'core' }],
          '해외': [{ type: 'ticker', ticker: 'AAPL', label: 'E63Apple', pct: 100, role: 'attacker' }],
        };
      });
      persistAssets(); persistTransactions(); persistRebalance();
    };
    const snapshot = () => ({
      projection20: Math.round(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total),
      mcPrincipal: Math.round(computeHouseholdMonteCarloPV()),
      // MC는 시뮬레이션 대신 "엔진에 들어가는 입력"을 비교한다 - 시세 이력이 필요한
      // buildMonteCarloInputFromState는 네트워크 격리 환경에서 만들 수 없으므로, 그 앞단의
      // 순수 계산(원금 모집단 + 목표 instrument 가중치)을 본다. 이 둘이 같으면 MC 입력도 같다.
      mcWeights: Array.from(computeHouseholdTargetInstrumentWeights().entries())
        .map(([k, v]) => `${k}|${v.weight.toFixed(6)}`).sort(),
      risk: riskEligibleAssets().map((a) => a.ticker).sort(),
      totalValue: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
      fxPnL: Math.round(computeForeignFxPnL()),
    });

    seed();
    const before = snapshot();

    // 이번 Phase가 건드린 세 경로를 전부 통과시킨다.
    const blob = buildSyncBlob();
    const restoredAt = Date.now();
    state.assets = blob.assets.map((a) => ({ ...normalizeImportedAsset(a), updatedAt: restoredAt })); // 덮어쓰기 복원
    state.assets = mergeCollectionById(state.assets,
      blob.assets.map((a) => normalizeImportedAsset({ ...a, updatedAt: 1 })), new Set());             // 동기화 병합
    persistAssets();

    const after = snapshot();
    return { before, after, same: JSON.stringify(before) === JSON.stringify(after) };
  });

  expect(r.after.projection20).toBe(r.before.projection20);
  expect(r.after.mcPrincipal).toBe(r.before.mcPrincipal);
  expect(r.after.mcWeights).toEqual(r.before.mcWeights);
  expect(r.after.risk).toEqual(r.before.risk);
  expect(r.after.totalValue).toBe(r.before.totalValue);
  expect(r.after.fxPnL).toBe(r.before.fxPnL);
  expect(r.same).toBe(true);
});
