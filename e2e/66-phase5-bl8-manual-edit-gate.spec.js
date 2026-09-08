// E2E-66 [V1.1 Phase 5 - BL-8] manual 자산은 거래 매칭 여부와 무관하게 항상 편집/삭제할 수 있다.
//
// PM 확정 정책: "positionSource='manual'인 자산은 매칭되는 거래내역의 존재 여부와 관계없이
// 사용자가 자산 자체를 수정하거나 삭제할 수 있다. 거래내역은 manual 자산의 SoT가 아니다."
//
// isTransactionTracked(a)는 "매칭되는 거래가 있는가"만 보고 positionSource를 보지 않아, manual
// 자산에 거래가 하나라도 매칭되면 [수정]/[삭제] 버튼이 영구히 숨겨졌다 - 값은 완전히 안전한데
// (Phase 1이 이미 보호) 사용자가 그 값을 화면에서 고칠 방법만 없었다. 두 호출부(단일 자산 모달·
// 그룹 모달의 개별 삭제 아이콘)의 게이팅 조건에 positionSource!=='manual' 검사만 추가한다.
//
// ledger/legacy 자산의 기존 게이팅은 손대지 않는다. 실제 UI(모달 버튼 클릭·자산 폼 제출)를 그대로
// 사용한다 - 테스트 안에 앱 로직을 복사하지 않는다. 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof openAssetDetailModal === 'function');
}

// 자산 1건(positionSource 지정) + 거래 N건(수량 균등 분배)을 심는다.
function seed(page, positionSource, txCount) {
  return page.locator('body').evaluate((el, o) => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ ticker: '005930.KS', name: 'E66삼성', category: '주식', currency: 'KRW',
      isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000,
      currentPrice: 80000, role: 'core', rateMatchOverride: 'KOSPI', positionSource: o.positionSource })];
    state.transactions = [];
    for (let i = 0; i < o.txCount; i++) {
      state.transactions.push({ id: `e66tx${i}`, date: '2025-01-01', owner: '신랑', accountType: '일반계좌',
        ticker: '005930.KS', name: 'E66삼성', type: 'buy', quantity: 70 / o.txCount, price: 50000,
        currency: 'KRW', fee: 0, origin: 'initial', createdAt: i + 1, updatedAt: i + 1 });
    }
    persistAssets(); persistTransactions();
  }, { positionSource, txCount });
}

async function buttonVisibility(page) {
  return {
    delete: await page.locator('#assetDetailDeleteBtn').isVisible(),
    edit: await page.locator('#assetDetailEditBtn').isVisible(),
  };
}

/* ══════════════════════════════════════════════════════════════════
 * 1~5. manual — 거래 0/1/여러 건, 전부 편집·삭제 가능해야 한다
 * ═════════════════════════════════════════════════════════════════ */
test('1. manual only(거래 없음) → 편집/삭제 버튼 노출 (기존 그대로)', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 0);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  expect(await buttonVisibility(page)).toEqual({ delete: true, edit: true });
});

test('2. manual + 거래 1건 → [핵심] 편집 버튼이 노출된다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  // 수정 전에는 여기가 { delete:false, edit:false }였다.
  expect(await buttonVisibility(page)).toEqual({ delete: true, edit: true });
});

test('3. manual + 거래 1건 → [핵심] 삭제 버튼으로 실제 삭제가 가능하다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  page.once('dialog', (d) => d.accept());
  await page.locator('#assetDetailDeleteBtn').click();
  const r = await page.locator('body').evaluate(() => ({ assetCount: state.assets.length, txCount: state.transactions.length }));
  expect(r.assetCount).toBe(0);
  expect(r.txCount).toBe(1); // 거래는 그대로 - 이번 Phase는 거래 삭제 정책을 새로 만들지 않는다
});

test('4. manual + 거래 여러 건 → 편집 버튼이 노출된다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 3);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  expect(await buttonVisibility(page)).toEqual({ delete: true, edit: true });
});

test('5. manual + 거래 여러 건 → 삭제가 가능하고 모든 거래가 그대로 남는다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 3);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  page.once('dialog', (d) => d.accept());
  await page.locator('#assetDetailDeleteBtn').click();
  const r = await page.locator('body').evaluate(() => ({ assetCount: state.assets.length, txCount: state.transactions.length }));
  expect(r.assetCount).toBe(0);
  expect(r.txCount).toBe(3);
});

/* ══════════════════════════════════════════════════════════════════
 * 6~7. 편집 후 값 보존 (Phase 1 불변식)
 * ═════════════════════════════════════════════════════════════════ */
test('6/7. 편집 후 quantity·buyPrice·positionSource·role·rateMatchOverride가 보존된다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  await page.locator('#assetDetailEditBtn').click();
  await page.locator('#f_quantity').fill('500');
  await page.locator('#f_buyPrice').fill('99999');
  await page.locator('#assetForm').evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  const r = await page.locator('body').evaluate(() => ({
    qty: state.assets[0].quantity, buy: state.assets[0].buyPrice,
    ps: state.assets[0].positionSource, role: state.assets[0].role, rmo: state.assets[0].rateMatchOverride,
  }));
  expect(r.qty).toBe(500);
  expect(r.buy).toBe(99999);
  expect(r.ps).toBe('manual'); // 편집해도 표식은 그대로 - 승격/강등 없음
  expect(r.role).toBe('core');
  expect(r.rmo).toBe('KOSPI');
});

/* ══════════════════════════════════════════════════════════════════
 * 8~10. 거래 추가/수정/삭제 후에도 manual 자산 값은 불변 (Phase 1 재확인)
 * ═════════════════════════════════════════════════════════════════ */
test('8. 거래 추가 후에도 manual 자산 값은 불변이다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => {
    state.transactions.push({ id: 'e66add', date: '2025-02-01', owner: '신랑', accountType: '일반계좌',
      ticker: '005930.KS', name: 'E66삼성', type: 'buy', quantity: 30, price: 75000, currency: 'KRW',
      fee: 0, origin: 'initial', createdAt: 2, updatedAt: 2 });
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
  });
  const r = await page.locator('body').evaluate(() => `${state.assets[0].quantity}/${state.assets[0].buyPrice}/${state.assets[0].positionSource}`);
  expect(r).toBe('100/70000/manual');
});

test('9. 거래 수정 후에도 manual 자산 값은 불변이다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => {
    state.transactions[0].quantity = 999;
    persistTransactions();
    syncAssetsFromTransactions();
    persistAssets();
  });
  const r = await page.locator('body').evaluate(() => `${state.assets[0].quantity}/${state.assets[0].buyPrice}/${state.assets[0].positionSource}`);
  expect(r).toBe('100/70000/manual');
});

test('10. 거래 삭제 후에도 manual 자산 값은 불변이다 (BL-12 유지)', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const realConfirm = win.confirm; win.confirm = () => true;
    try { deleteTransaction('e66tx0'); } finally { win.confirm = realConfirm; }
  });
  const r = await page.locator('body').evaluate(() => `${state.assets[0].quantity}/${state.assets[0].buyPrice}/${state.assets[0].positionSource}`);
  expect(r).toBe('100/70000/manual');
});

/* ══════════════════════════════════════════════════════════════════
 * 11. boot sync 후에도 manual 자산 값은 불변
 * ═════════════════════════════════════════════════════════════════ */
test('11. 편집 후 boot(자동 sync)에도 값이 유지된다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  await page.locator('#assetDetailEditBtn').click();
  await page.locator('#f_quantity').fill('500');
  await page.locator('#assetForm').evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets));
  const r = await page.locator('body').evaluate(() => `${state.assets[0].quantity}/${state.assets[0].positionSource}`);
  expect(r).toBe('500/manual');
});

/* ══════════════════════════════════════════════════════════════════
 * 12~13. legacy/ledger 게이팅은 기존 그대로 (회귀 없음, 대조군)
 * ═════════════════════════════════════════════════════════════════ */
test('12. legacy 자산 + 거래 → 기존 게이팅 그대로 편집/삭제 버튼이 숨겨진다', async ({ page }) => {
  await open(page);
  await seed(page, undefined, 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  expect(await buttonVisibility(page)).toEqual({ delete: false, edit: false });
});

test('13. ledger 자산 + 거래 → 기존 게이팅 그대로 편집/삭제 버튼이 숨겨진다', async ({ page }) => {
  await open(page);
  await seed(page, 'ledger', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  expect(await buttonVisibility(page)).toEqual({ delete: false, edit: false });
});

test('13-2. ledger 자산 + 거래 없음 → 노출 (거래가 없으니 원래도 추적 대상이 아니다)', async ({ page }) => {
  await open(page);
  await seed(page, 'ledger', 0);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  expect(await buttonVisibility(page)).toEqual({ delete: true, edit: true });
});

/* ══════════════════════════════════════════════════════════════════
 * 14. owner 분리 - 그룹(통합) 모달의 개별 삭제 아이콘도 같은 규칙을 따른다
 * ═════════════════════════════════════════════════════════════════ */
test('14. 그룹 모달에서 같은 종목이라도 owner별 positionSource에 따라 개별 삭제 아이콘이 갈린다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [
      makeAsset({ ticker: '005930.KS', name: 'E66그룹', category: '주식', currency: 'KRW', isDomestic: '국내',
        owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000, currentPrice: 80000, positionSource: 'ledger' }),
      makeAsset({ ticker: '005930.KS', name: 'E66그룹', category: '주식', currency: 'KRW', isDomestic: '국내',
        owner: '와이프', accountType: '일반계좌', quantity: 50, buyPrice: 70000, currentPrice: 80000, positionSource: 'manual' }),
    ];
    state.transactions = [{ id: 'e66g1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '005930.KS',
      name: 'E66그룹', type: 'buy', quantity: 100, price: 70000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    openAssetDetailModalGroup(state.assets.map((a) => ({ ...a, ...calcRow(a) })));
    const html = doc.getElementById('assetDetailOwnerBreakdownList').innerHTML;
    return { hasHusbandDeleteIcon: html.includes(state.assets[0].id), hasWifeDeleteIcon: html.includes(state.assets[1].id) };
  });
  expect(r.hasHusbandDeleteIcon).toBe(false); // ledger(신랑) - 개별 삭제 아이콘 없음
  expect(r.hasWifeDeleteIcon).toBe(true);     // manual(와이프) - 개별 삭제 아이콘 있음
});

/* ══════════════════════════════════════════════════════════════════
 * 15~17. 계산 불변식 - 편집 게이팅 변경이 계산에 영향을 주지 않는다
 * ═════════════════════════════════════════════════════════════════ */
test('15/16/17. 게이팅 변경이 deterministic/MC/Risk 계산에 영향을 주지 않는다', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  const r = await page.locator('body').evaluate(() => ({
    groupStats: Object.keys(getProjectionGroupStats(null)).length,
    mcPV: Math.round(computeHouseholdMonteCarloPV()),
    riskIncluded: riskEligibleAssets().some((a) => a.name === 'E66삼성'),
  }));
  expect(r.groupStats).toBeGreaterThan(0);
  expect(r.mcPV).toBe(8000000); // 100주 * 80000
  expect(r.riskIncluded).toBe(true);
});

/* ══════════════════════════════════════════════════════════════════
 * 참고 사실 (§4 요청) — manual 자산 삭제 후 남은 거래로 인해 다음 부팅에 ledger로 재생성된다.
 * 이것은 이번 Phase가 새로 만든 동작이 아니라, 자산 없는 포지션은 항상 새로 만드는 기존 안전망
 * (D-3, BL-12)이 그대로 적용된 결과다. 이 테스트는 그 사실을 고정해 PM이 인지한 상태로 남긴다 -
 * 삭제 시 연결된 거래를 함께 지우는 새 정책은 만들지 않는다(§4 지시).
 * ═════════════════════════════════════════════════════════════════ */
test('참고. manual 자산 삭제 후에도 거래가 남아있으면 다음 부팅에 ledger로 재생성된다 (기존 안전망, 변경 없음)', async ({ page }) => {
  await open(page);
  await seed(page, 'manual', 1);
  await page.locator('body').evaluate(() => openAssetDetailModal(state.assets[0].id));
  page.once('dialog', (d) => d.accept());
  await page.locator('#assetDetailDeleteBtn').click();
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets));
  const r = await page.locator('body').evaluate(() => ({
    assetCount: state.assets.length,
    ps: state.assets[0] ? state.assets[0].positionSource : null,
    qty: state.assets[0] ? state.assets[0].quantity : null,
  }));
  expect(r.assetCount).toBe(1);
  expect(r.ps).toBe('ledger');
  expect(r.qty).toBe(70); // 남은 거래(70주)만큼 ledger 자산으로 재생성 - 기존 동작 그대로
});
