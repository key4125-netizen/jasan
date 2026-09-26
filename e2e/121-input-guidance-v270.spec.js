// E2E-121 [PM 지시 2026-09-24] 입력 보존과 안내의 정확성 - 실제 화면에서 확인한다.
//
//   ISSUE-01  자산 폼에서 발행인 유형만 골라도 저장되고, 있던 레코드를 지우지 않는다
//   ISSUE-02  원화 채권 안내가 환헤지를 요구하지 않는다 / 외화 채권은 둘 다 말한다
//   ISSUE-03  보유 채권과 이어지지 않은 목표 행에 "채권 정보를 채우라"고 하지 않는다
//   ISSUE-04  비중조절 검색이 0건일 때 이유가 화면에 나온다
//
// 합성 데이터만 쓴다(ZZ 접두어 · 공개 표준코드 형식). 실제 보유 자산이 아니다.
/* global document */
const { test, expect } = require('@playwright/test');

const LS_ASSETS = 'sam_assets_v5';
const LS_BONDS = 'sam_bond_positions_v1';
const LS_LAUNCHED = 'sam_has_launched_v1';
const ISIN = 'KR103502G990';

const asset = (over) => Object.assign({
  id: 'ZZ-B1', name: 'ZZ국고채권 23-5', ticker: ISIN, category: '채권', categorySource: 'user',
  owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내',
  quantity: 1000, buyPrice: 10000, currentPrice: 10100, positionSource: 'manual', createdAt: 1, updatedAt: 1
}, over || {});

async function boot(page, assets, bondPositions) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(({ a, b, kA, kB, kL }) => {
    localStorage.clear();
    localStorage.setItem(kA, JSON.stringify(a));
    if (b) localStorage.setItem(kB, JSON.stringify(b));
    localStorage.setItem(kL, '1');
  }, { a: assets, b: bondPositions || null, kA: LS_ASSETS, kB: LS_BONDS, kL: LS_LAUNCHED });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistBondPositionForAsset === 'function');
}

/* ══════════════ ISSUE-01 · 입력이 사라지지 않는다 ══════════════ */

// 자산 폼을 열어 채권 칸 하나만 고르고 실제 저장 버튼을 누른다.
async function editAssetPickingBondField(page, fieldId, value) {
  await page.evaluate(() => { openModal('edit', 'ZZ-B1'); showModal(); });
  await page.waitForSelector('#assetForm', { state: 'visible' });
  await page.evaluate(({ id, v }) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id: fieldId, v: value });
  await page.click('#assetFormSubmitBtn');
  await page.waitForFunction(() => document.getElementById('assetModal').classList.contains('hidden'));
}

test('ISSUE-01-A. 발행인 유형만 골라도 채권 정보가 저장된다', async ({ page }) => {
  await boot(page, [asset()]);
  await editAssetPickingBondField(page, 'f_bondType', '국채');
  const saved = await page.evaluate(() => (state.bondPositions || []).map((p) => ({ assetId: p.assetId, bondType: p.identity.bondType })));
  expect(saved, '발행인 유형만 채운 입력이 사라졌다').toHaveLength(1);
  expect(saved[0].bondType).toBe('국채');
  expect(saved[0].assetId).toBe('ZZ-B1');
});

test('ISSUE-01-B. 새로고침 후에도 남아 있다(실제로 저장됐다)', async ({ page }) => {
  await boot(page, [asset()]);
  await editAssetPickingBondField(page, 'f_bondType', '회사채');
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  expect(await page.evaluate(() => (state.bondPositions || []).length)).toBe(1);
  expect(await page.evaluate(() => state.bondPositions[0].identity.bondType)).toBe('회사채');
});

test('ISSUE-01-C. 발행인 유형만 들어 있던 기존 레코드를 저장하면서 지우지 않는다', async ({ page }) => {
  // 예전 조건은 이 레코드를 "아무것도 없음"으로 보고 지웠다 - 데이터 손실이었다.
  const seed = [{
    id: 'ZZ-P1', assetId: 'ZZ-B1',
    identity: { isin: null, instrumentName: 'ZZ국고채권 23-5', issuer: null, currency: 'KRW', bondType: '국채', creditRating: null, hedgeStatus: null },
    terms: { issueDate: null, maturityDate: null, couponRate: null, couponType: null, paymentFrequency: null, paymentDates: [] },
    holding: { owner: '신랑', account: '일반계좌', purchaseDate: null, faceAmount: null, purchaseAmount: null, taxType: null },
    source: null, userOverride: {}
  }];
  await boot(page, [asset()], seed);
  expect(await page.evaluate(() => state.bondPositions.length), '심은 레코드를 앱이 읽지 못했다').toBe(1);
  await editAssetPickingBondField(page, 'f_bondRating', 'AA');
  const after = await page.evaluate(() => (state.bondPositions || []).map((p) => ({ bondType: p.identity.bondType, rating: p.identity.creditRating })));
  expect(after, '기존 레코드가 저장 중에 삭제됐다').toHaveLength(1);
  expect(after[0].bondType, '이미 있던 발행인 유형이 사라졌다').toBe('국채');
  expect(after[0].rating).toBe('AA');
});

test('ISSUE-01-D. 채권 칸을 하나도 채우지 않으면 빈 레코드를 만들지 않는다', async ({ page }) => {
  await boot(page, [asset()]);
  await page.evaluate(() => { openModal('edit', 'ZZ-B1'); showModal(); });
  await page.waitForSelector('#assetForm', { state: 'visible' });
  await page.click('#assetFormSubmitBtn');
  await page.waitForFunction(() => document.getElementById('assetModal').classList.contains('hidden'));
  expect(await page.evaluate(() => (state.bondPositions || []).length)).toBe(0);
});

/* ══════════════ ISSUE-02 · ISSUE-03 · 안내 문구 ══════════════ */

// 실제 페이지의 어댑터를 그대로 돌려 안내를 받는다(문구를 따로 만들지 않는다).
async function bondIssues(page, { currency, bondType, targetRow }) {
  return page.evaluate(({ ccy, bt, row }) => {
    const equity = makeAsset({ ticker: '005930', name: 'ZZ국내주식', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내' });
    const bond = makeAsset({ ticker: '', name: 'ZZ합성채권', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: ccy, isDomestic: ccy === 'KRW' ? '국내' : '해외' });
    state.assets = [equity, bond];
    state.bondPositions = [makeBondPosition({
      assetId: bond.id,
      identity: { instrumentName: 'ZZ합성채권', bondType: bt || null, currency: ccy },
      terms: { maturityDate: '2032-05-15', couponRate: 3.25 },
      holding: { owner: '신랑', account: '일반계좌', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
    })];
    state.rebalance['신랑'].domestic = { '국내': 100, '해외': 0 };
    state.rebalance['신랑'].targets = {
      '국내': [{ type: 'ticker', ticker: '005930', label: 'ZZ국내주식', pct: 50 },
        row || { type: 'namedHolding', label: 'ZZ합성채권', name: 'ZZ합성채권', pct: 50 }],
      '해외': []
    };
    return buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 })
      .then((r) => ({
        guidance: (r.bondsWithoutRiskAssumption[0] || {}).guidance || null,
        issues: r.safety.dataQuality.issues.map((i) => ({ code: i.code, message: i.message, recommendation: i.recommendation }))
      }));
  }, { ccy: currency, bt: bondType, row: targetRow });
}

test('ISSUE-02-A. 원화 채권 안내는 환헤지를 채우라고 하지 않는다', async ({ page }) => {
  await boot(page, [asset()]);
  const r = await bondIssues(page, { currency: 'KRW', bondType: null });
  expect(r.guidance).toBe('KRW_BOND_TYPE_MISSING');
  const issue = r.issues.find((i) => i.code === 'BOND_RISK_ASSUMPTION_UNRESOLVED');
  expect(issue, '안내가 없다').toBeTruthy();
  expect(issue.message).toContain('원화 채권이라 발행인 유형');
  expect(issue.message).toContain('환헤지는 원화 채권에 적용되지 않습니다');
});

test('ISSUE-02-B. 외화 채권 안내는 발행인 유형과 환헤지를 둘 다 말한다', async ({ page }) => {
  await boot(page, [asset()]);
  const r = await bondIssues(page, { currency: 'USD', bondType: '국채' }); // 환헤지 없음
  expect(r.guidance).toBe('FX_BOND_TYPE_OR_HEDGE_MISSING');
  const issue = r.issues.find((i) => i.code === 'BOND_RISK_ASSUMPTION_UNRESOLVED');
  expect(issue.message).toContain('외화 채권이라 발행인 유형과 환헤지 여부가 둘 다');
});

test('ISSUE-03-A. 자산군 캐치올 행에는 채권 정보를 채우라고 하지 않는다', async ({ page }) => {
  await boot(page, [asset()]);
  const r = await bondIssues(page, {
    currency: 'KRW', bondType: '국채',
    targetRow: { type: 'category', category: '채권', label: '채권', pct: 50 }
  });
  expect(r.guidance).toBe('CATEGORY_TARGET');
  const issue = r.issues.find((i) => i.code === 'BOND_RISK_TARGET_NOT_LINKED');
  expect(issue, '연결되지 않았다는 안내가 없다').toBeTruthy();
  expect(issue.message).toContain('채권 정보를 채워도 이 행에는 반영되지 않습니다');
  expect(issue.recommendation).toContain('개별 종목으로 추가');
  // 채울 것이 없는데 채우라고 하는 옛 안내는 더 이상 나오지 않는다.
  expect(r.issues.find((i) => i.code === 'BOND_RISK_ASSUMPTION_UNRESOLVED')).toBeUndefined();
});

test('ISSUE-03-B. 분류된 채권에는 어떤 안내도 나오지 않는다(기존 동작 유지)', async ({ page }) => {
  await boot(page, [asset()]);
  const r = await bondIssues(page, { currency: 'KRW', bondType: '국채' });
  expect(r.guidance).toBeNull();
  expect(r.issues.find((i) => i.code === 'BOND_RISK_ASSUMPTION_UNRESOLVED')).toBeUndefined();
  expect(r.issues.find((i) => i.code === 'BOND_RISK_TARGET_NOT_LINKED')).toBeUndefined();
});

/* ══════════════ ISSUE-04 · 검색 0건의 이유 ══════════════ */

async function searchReason(page, query, region) {
  const suffix = (region || '국내') === '국내' ? 'Domestic' : 'Foreign';
  await page.evaluate(() => openRebalanceTargetModal('신랑'));
  await page.waitForSelector('#rebalanceTargetModal:not(.hidden)');
  // 「+ 종목 추가」는 접힌 채로 열린다 - 사용자가 하는 그대로 버튼을 눌러 편다.
  await page.click(`#rtmAddToggleBtn${suffix}`);
  await page.waitForSelector(`#rtmAddForm${suffix}:not(.hidden)`);
  await page.fill(`#rtmAddSearchInput${suffix}`, query);
  const box = page.locator(`#rtmAddSearchResults${suffix} #rtmAddNoResultReason`);
  await expect(box).toBeVisible();
  return (await box.textContent()).trim();
}

test('ISSUE-04-A. 다른 지역 탭에 있으면 그 탭과 고치는 곳을 알려준다', async ({ page }) => {
  await boot(page, [asset({ isDomestic: '해외' })]);
  const msg = await searchReason(page, ISIN, '국내');
  expect(msg).toContain('해외');
  expect(msg).toContain('국내 / 해외를 고칠 수 있습니다');
});

test('ISSUE-04-B. 절세계좌라 빠진 것이면 그 사실과 계좌를 알려준다', async ({ page }) => {
  await boot(page, [asset({ accountType: 'ISA' })]);
  const msg = await searchReason(page, 'ZZ국고채권', '국내');
  expect(msg).toContain('ISA');
  expect(msg).toContain('목표 비중은 일반계좌만 다루므로');
});

test('ISSUE-04-C. 다른 사람 명의면 누구 것인지 알려준다', async ({ page }) => {
  await boot(page, [asset({ owner: '와이프' })]);
  const msg = await searchReason(page, 'ZZ국고채권', '국내');
  expect(msg).toContain('와이프 명의입니다');
  expect(msg).toContain('신랑 목표만 다룹니다');
});

test('ISSUE-04-D. 보유한 적 없는 이름이면 검색어를 다시 보라고 한다', async ({ page }) => {
  await boot(page, [asset()]);
  const msg = await searchReason(page, 'ZZ없는종목', '국내');
  expect(msg).toContain('맞는 것이 없습니다');
});

test('ISSUE-04-F. 지역이 맞으면 표준코드(ISIN)로도 보유 채권이 검색된다', async ({ page }) => {
  // 사용자가 처음 신고한 증상 - "거래내역으로 등록한 채권의 ISIN을 비중조절에서 입력해도 조회 안된다".
  // §58에서 지역 판정을 고친 뒤 실제로 찾아지는지를 화면에서 확인한다.
  await boot(page, [asset()]);
  await page.evaluate(() => openRebalanceTargetModal('신랑'));
  await page.waitForSelector('#rebalanceTargetModal:not(.hidden)');
  await page.click('#rtmAddToggleBtnDomestic');
  await page.fill('#rtmAddSearchInputDomestic', ISIN);
  const hit = page.locator('#rtmAddSearchResultsDomestic [data-rtm-add-candidate]');
  await expect(hit).toHaveCount(1);
  await expect(hit.first()).toContainText('ZZ국고채권 23-5');
  await expect(page.locator('#rtmAddNoResultReason')).toHaveCount(0);
});

test('ISSUE-04-E. 검색어를 지우면 안내도 사라진다', async ({ page }) => {
  await boot(page, [asset({ isDomestic: '해외' })]);
  await searchReason(page, ISIN, '국내');
  await page.fill('#rtmAddSearchInputDomestic', '');
  await expect(page.locator('#rtmAddSearchResultsDomestic #rtmAddNoResultReason')).toHaveCount(0);
});

/* ══════════════ 표시 품질 ══════════════ */

test('안내 문구가 좁은 화면에서도 잘리지 않는다(375 · 390)', async ({ page }) => {
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await boot(page, [asset({ accountType: 'IRP' })]);
    await searchReason(page, 'ZZ국고채권', '국내');
    const el = page.locator('#rtmAddNoResultReason');
    const box = await el.boundingBox();
    expect(box.width, `${width}px에서 안내가 화면을 넘는다`).toBeLessThanOrEqual(width);
    // 가로 스크롤이 생기지 않는다.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px에서 가로 스크롤이 생겼다`).toBeLessThanOrEqual(0);
  }
});
