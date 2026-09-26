// E2E-120 [PM 지시 2026-09-24] 채권 국내/해외 · 환헤지 - 실제 화면에서 확인한다.
//
//   D-5  부팅 1회 교정: 과거 판정 버그로 '해외'가 된 원화 채권만 국내로 되돌린다(멱등 · 다른 값 불변)
//   D-8  거래로 관리돼 [수정]이 숨겨진 자산의 국내/해외를 자산 상세에서 고칠 수 있다
//   환헤지  국내 국채는 묻지 않고, 국내상장 해외 ETF · 해외 직접투자는 묻는다
//   연관   교정하면 지역 집계 · 비중조절 검색 · 환헤지 표시가 함께 맞춰진다
//
// 합성 데이터만 쓴다(ZZ 접두어 · 공개 표준코드 형식). 실제 보유 자산이 아니다.
const { test, expect } = require('@playwright/test');

const LS_ASSETS = 'sam_assets_v5';
const LS_LAUNCHED = 'sam_has_launched_v1';
const LS_MIGRATED = 'sam_bond_region_migrated_v1';
const ISIN = 'KR103502G990';

/* 과거 버그 상태를 그대로 심는다 - 원화 ISIN 채권이 '해외'로 저장돼 있던 상태. */
const LEGACY = [
  { id: 'ZZ-LEDGER', name: 'ZZ국고채권 23-5', ticker: ISIN, category: '채권', categorySource: 'system',
    owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '해외',
    quantity: 1000, buyPrice: 10000, currentPrice: 10100, positionSource: 'ledger', createdAt: 1, updatedAt: 1 },
  { id: 'ZZ-MANUAL', name: 'ZZ수동채권', ticker: 'KR0000000ZZ1', category: '채권', categorySource: 'user',
    owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '해외',
    quantity: 500, buyPrice: 10000, currentPrice: 10000, positionSource: 'manual', createdAt: 1, updatedAt: 1 },
  { id: 'ZZ-USDBOND', name: 'ZZ미국채', ticker: 'US0000000ZZ1', category: '채권', categorySource: 'user',
    owner: '신랑', accountType: '일반계좌', currency: 'USD', isDomestic: '해외',
    quantity: 10, buyPrice: 100, currentPrice: 100, positionSource: 'ledger', createdAt: 1, updatedAt: 1 },
  { id: 'ZZ-USETF', name: 'ZZ미국ETF', ticker: 'QQQM', category: 'ETF', categorySource: 'user',
    owner: '신랑', accountType: '일반계좌', currency: 'USD', isDomestic: '해외',
    quantity: 10, buyPrice: 100, currentPrice: 100, positionSource: 'ledger', createdAt: 1, updatedAt: 1 }
];

async function bootWithLegacy(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(({ assets, kAssets, kLaunched, kMigrated }) => {
    localStorage.clear();
    localStorage.setItem(kAssets, JSON.stringify(assets));
    localStorage.setItem(kLaunched, '1');
    localStorage.removeItem(kMigrated); // 아직 교정하지 않은 기기
  }, { assets: LEGACY, kAssets: LS_ASSETS, kLaunched: LS_LAUNCHED, kMigrated: LS_MIGRATED });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof runBondRegionMigrationOnce === 'function');
}

const regionOf = (page, id) => page.evaluate((x) => {
  const a = state.assets.find((y) => y.id === x);
  return a ? a.isDomestic : null;
}, id);

/* ══════════════ D-5 ══════════════ */

test('D-5-A. 부팅 1회 교정 - 원화 표준코드 채권만 국내로 되돌린다', async ({ page }) => {
  await bootWithLegacy(page);

  expect(await regionOf(page, 'ZZ-LEDGER'), '거래내역이 원천인 원화 채권은 자동 교정').toBe('국내');
  expect(await regionOf(page, 'ZZ-MANUAL'), '사용자가 정했을 수 있는 자산은 그대로 둔다').toBe('해외');
  expect(await regionOf(page, 'ZZ-USDBOND'), '외화 채권은 해외가 맞다').toBe('해외');
  expect(await regionOf(page, 'ZZ-USETF'), '채권이 아닌 자산은 대상이 아니다').toBe('해외');
  expect(await page.evaluate((k) => localStorage.getItem(k), LS_MIGRATED), '마커가 남는다').toBe('1');
});

test('D-5-B. isDomestic 외에는 아무것도 바뀌지 않는다', async ({ page }) => {
  await bootWithLegacy(page);
  const after = await page.evaluate((x) => {
    const a = state.assets.find((y) => y.id === x);
    return { ticker: a.ticker, name: a.name, category: a.category, owner: a.owner, accountType: a.accountType,
      currency: a.currency, quantity: a.quantity, buyPrice: a.buyPrice, positionSource: a.positionSource, updatedAt: a.updatedAt };
  }, 'ZZ-LEDGER');
  const src = LEGACY[0];
  expect(after).toEqual({
    ticker: src.ticker, name: src.name, category: src.category, owner: src.owner, accountType: src.accountType,
    currency: src.currency, quantity: src.quantity, buyPrice: src.buyPrice, positionSource: src.positionSource,
    updatedAt: src.updatedAt // 교정은 사용자 편집이 아니다 - 시각을 새로 찍지 않는다
  });
});

test('D-5-C. 다시 부팅해도 되풀이하지 않는다(멱등) · 사용자 선택을 되돌리지 않는다', async ({ page }) => {
  await bootWithLegacy(page);
  // 사용자가 일부러 다시 해외로 바꾼 상황을 만든다.
  await page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'ZZ-LEDGER');
    a.isDomestic = '해외';
    persistAssets(true);
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  expect(await regionOf(page, 'ZZ-LEDGER'), '두 번째 부팅은 사용자 선택을 덮지 않는다').toBe('해외');
});

/* ══════════════ D-8 ══════════════ */

test('D-8-A. 거래로 관리되는 자산은 [수정]이 숨겨지고, 국내/해외 교정 칸이 열린다', async ({ page }) => {
  await bootWithLegacy(page);
  // 이 자산을 거래로 관리되는 상태로 만든다(거래가 있으면 [수정]이 숨겨진다).
  await page.evaluate((isin) => {
    state.transactions = [{ id: 'ZZT1', date: '2026-01-05', owner: '신랑', accountType: '일반계좌',
      name: 'ZZ국고채권 23-5', ticker: isin, type: 'buy', quantity: 1000, price: 10000,
      currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
    persistTransactions();
    openAssetDetailModal('ZZ-LEDGER');
  }, ISIN);
  await expect(page.locator('#assetDetailModal')).toBeVisible();
  await expect(page.locator('#assetDetailEditBtn'), '[수정]은 여전히 숨겨진다(거래가 원천)').toBeHidden();
  await expect(page.locator('#assetDetailRegionFix'), '대신 국내/해외 교정 칸이 열린다').toBeVisible();
  await expect(page.locator('#assetDetailRegionSelect')).toHaveValue('국내');
});

test('D-8-B. 교정 칸에서 바꾸면 저장되고 화면이 함께 갱신된다', async ({ page }) => {
  await bootWithLegacy(page);
  await page.evaluate((isin) => {
    state.transactions = [{ id: 'ZZT1', date: '2026-01-05', owner: '신랑', accountType: '일반계좌',
      name: 'ZZ국고채권 23-5', ticker: isin, type: 'buy', quantity: 1000, price: 10000,
      currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
    persistTransactions();
    openAssetDetailModal('ZZ-LEDGER');
  }, ISIN);
  await page.locator('#assetDetailRegionSelect').selectOption('해외');
  expect(await regionOf(page, 'ZZ-LEDGER')).toBe('해외');
  // 저장까지 됐는지(새로고침해도 유지) 확인한다.
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  expect(await regionOf(page, 'ZZ-LEDGER'), '교정 값이 저장된다').toBe('해외');

  // 되돌리기도 같은 칸에서 된다.
  await page.evaluate(() => openAssetDetailModal('ZZ-LEDGER'));
  await page.locator('#assetDetailRegionSelect').selectOption('국내');
  expect(await regionOf(page, 'ZZ-LEDGER')).toBe('국내');
});

test('D-8-C. 자산 폼에서 고칠 수 있는 자산에는 교정 칸을 띄우지 않는다(경로를 둘로 만들지 않는다)', async ({ page }) => {
  await bootWithLegacy(page);
  await page.evaluate(() => { state.transactions = []; persistTransactions(); openAssetDetailModal('ZZ-MANUAL'); });
  await expect(page.locator('#assetDetailModal')).toBeVisible();
  await expect(page.locator('#assetDetailEditBtn'), '거래가 없으면 기존 [수정] 경로가 그대로 있다').toBeVisible();
  await expect(page.locator('#assetDetailRegionFix')).toBeHidden();
});

/* ══════════════ 환헤지 ══════════════ */

test('환헤지-A. 교정된 원화 국채는 환헤지를 묻지 않는다', async ({ page }) => {
  await bootWithLegacy(page);
  const r = await page.evaluate(() => {
    const bond = state.assets.find((x) => x.id === 'ZZ-LEDGER');
    const usd = state.assets.find((x) => x.id === 'ZZ-USDBOND');
    const etf = state.assets.find((x) => x.id === 'ZZ-USETF');
    return { krwBond: shouldOfferFxHedgeChoice(bond), usdBond: shouldOfferFxHedgeChoice(usd), usEtf: shouldOfferFxHedgeChoice(etf) };
  });
  expect(r.krwBond, '원화 국채 - 묻지 않는다').toBe(false);
  expect(r.usdBond, '외화 채권 - 묻는다').toBe(true);
  expect(r.usEtf, '해외 직접투자 - 묻는다').toBe(true);
});

test('환헤지-B. 국내/해외를 바꾸면 환헤지 표시도 함께 맞춰진다', async ({ page }) => {
  await bootWithLegacy(page);
  await page.evaluate((isin) => {
    state.transactions = [{ id: 'ZZT1', date: '2026-01-05', owner: '신랑', accountType: '일반계좌',
      name: 'ZZ국고채권 23-5', ticker: isin, type: 'buy', quantity: 1000, price: 10000,
      currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
    persistTransactions();
    openAssetDetailModal('ZZ-LEDGER');
  }, ISIN);
  const ask = () => page.evaluate(() => shouldOfferFxHedgeChoice(state.assets.find((x) => x.id === 'ZZ-LEDGER')));
  expect(await ask(), '국내면 묻지 않는다').toBe(false);
  await page.locator('#assetDetailRegionSelect').selectOption('해외');
  expect(await ask(), '해외로 바꾸면 묻는다').toBe(true);
  await page.locator('#assetDetailRegionSelect').selectOption('국내');
  expect(await ask()).toBe(false);
});

test('환헤지-C. 교정이 사용자가 고른 환헤지 값을 지우지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(({ assets, kAssets, kLaunched, kMigrated }) => {
    localStorage.clear();
    const withHedge = assets.map((a) => (a.id === 'ZZ-LEDGER' ? Object.assign({}, a, { fxHedgeStatus: 'HEDGED' }) : a));
    localStorage.setItem(kAssets, JSON.stringify(withHedge));
    localStorage.setItem(kLaunched, '1');
    localStorage.removeItem(kMigrated);
  }, { assets: LEGACY, kAssets: LS_ASSETS, kLaunched: LS_LAUNCHED, kMigrated: LS_MIGRATED });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  const a = await page.evaluate(() => {
    const x = state.assets.find((y) => y.id === 'ZZ-LEDGER');
    return { region: x.isDomestic, hedge: x.fxHedgeStatus || null };
  });
  expect(a.region, '지역은 교정된다').toBe('국내');
  expect(a.hedge, '사용자가 고른 환헤지는 그대로 남는다').toBe('HEDGED');
});

/* ══════════════ 연관: 지역 집계 · 비중조절 검색 ══════════════ */

test('연관-A. 교정되면 비중조절 국내 탭에서 검색된다(예전에는 해외에서만 나왔다)', async ({ page }) => {
  await bootWithLegacy(page);
  const found = await page.evaluate((isin) => {
    rebalanceModalOwner = '신랑';
    rebalanceModalDraft = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [], '해외': [] } };
    return {
      국내: searchRtmAddCandidates('국내', isin).length,
      해외: searchRtmAddCandidates('해외', isin).length
    };
  }, ISIN);
  expect(found.국내, '국내 탭에서 찾아진다').toBeGreaterThan(0);
  expect(found.해외, '더 이상 해외 탭에 있지 않다').toBe(0);
});

test('연관-B. 교정되면 지역별 집계가 국내로 잡힌다', async ({ page }) => {
  await bootWithLegacy(page);
  const r = await page.evaluate(() => {
    const sum = (region) => state.assets.filter((a) => a.isDomestic === region)
      .reduce((s, a) => s + calcRow(a).curAmount, 0);
    return { 국내: Math.round(sum('국내')), 해외: Math.round(sum('해외')) };
  });
  expect(r.국내, '교정된 원화 채권이 국내 집계에 들어간다').toBeGreaterThan(0);
});

/* ══════════════ 반응형 ══════════════ */

for (const w of [375, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`반응형. ${w}px ${dark ? 'Dark' : 'Light'} - 교정 칸이 잘리거나 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await bootWithLegacy(page);
      await page.locator('html').evaluate((el, d) => el.classList.toggle('dark', d), dark);
      await page.evaluate((isin) => {
        state.transactions = [{ id: 'ZZT1', date: '2026-01-05', owner: '신랑', accountType: '일반계좌',
          name: 'ZZ국고채권 23-5', ticker: isin, type: 'buy', quantity: 1000, price: 10000,
          currency: 'KRW', fee: 0, origin: 'period', createdAt: 1, updatedAt: 1 }];
        persistTransactions();
        openAssetDetailModal('ZZ-LEDGER');
      }, ISIN);
      await expect(page.locator('#assetDetailRegionFix')).toBeVisible();
      const m = await page.locator('#assetDetailRegionFix').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const sizes = [...el.querySelectorAll('h4,p,span,select,option')]
          .filter((n) => !n.children.length && n.textContent.trim())
          .map((n) => parseFloat(win.getComputedStyle(n).fontSize));
        const sel = el.querySelector('#assetDetailRegionSelect');
        return {
          minFont: sizes.length ? Math.min(...sizes) : null,
          selectH: Math.round(sel.getBoundingClientRect().height),
          clipped: el.scrollWidth - el.clientWidth,
          pageOverflowX: el.ownerDocument.documentElement.scrollWidth - el.ownerDocument.documentElement.clientWidth
        };
      });
      expect(m.minFont).toBeGreaterThanOrEqual(14);
      expect(m.selectH, '터치 높이 44px').toBeGreaterThanOrEqual(44);
      expect(m.clipped).toBeLessThanOrEqual(1);
      expect(m.pageOverflowX).toBeLessThanOrEqual(1);
    });
  }
}
