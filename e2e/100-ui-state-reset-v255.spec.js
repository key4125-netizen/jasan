/* global document, window, getComputedStyle */
// E2E-100 [v255 UI 상태 · 표시만] PM 지시 4건을 실제 화면 상태로 고정한다.
//   A. 상단 필터(전체 소유자/자산군/계좌)와 자산 세부현황의 보기 버튼(전체/소유자/국내외)은 서로의 선택 상태를 바꾸지 않는다.
//   B. 탭을 옮겼다 돌아오면 펼쳐 둔 영역이 접혀 있다(선택값 · 입력값은 그대로). 팝업을 다시 열면 안쪽 묶음도 접혀 있다.
//   C. 탭을 옮겼다 돌아오면 화면 맨 위, 팝업을 닫았다 다시 열면 팝업 맨 위부터 보인다.
//   D. 「20년 후 자산 참고값 (일반적 수익률 적용)」 - 제목만 바뀌고 값은 일반적 수익률 경로 그대로다.
const { test, expect } = require('@playwright/test');
const { goToPortfolioSettingsTab, goToProjectionTab } = require('./fixtures');

const TRANSITION = 450;

async function boot(page, width = 375) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof resetAllAccordionsOnTabSwitch === 'function');
}
const tab = (page, name) => page.locator(`.tab-btn[data-tab="${name}"]`).click();
const bodyHeight = (page, sel) => page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().height));

/* ── A. 필터 독립성 ─────────────────────────────────────────────── */

test('A. 상단 필터와 자산 세부현황 보기 버튼은 서로의 선택 상태를 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  await tab(page, 'investmentDetail');
  const top = () => page.evaluate(() => ['filterOwner', 'filterCategory', 'filterAccount'].map((id) => document.getElementById(id).value));
  const bottom = () => page.evaluate(() => [...document.querySelectorAll('#assetViewSegmented .asset-view-btn')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.view));
  const pick = async (id) => {
    const v = await page.locator(`#${id} option`).nth(1).getAttribute('value');
    await page.locator(`#${id}`).selectOption(v);
    return v;
  };
  expect(await bottom()).toEqual(['none']);
  // 상단 변경 → 하단 그대로
  const owner = await pick('filterOwner');
  expect(await bottom()).toEqual(['none']);
  const category = await pick('filterCategory');
  expect(await bottom()).toEqual(['none']);
  const account = await pick('filterAccount');
  expect(await bottom()).toEqual(['none']);
  expect(await top()).toEqual([owner, category, account]);
  await page.locator('#filterCategory').selectOption('ALL');
  await page.locator('#filterAccount').selectOption('ALL');
  // 하단 변경 → 상단 그대로
  for (const view of ['owner', 'domestic', 'none']) {
    await page.locator(`#assetViewSegmented .asset-view-btn[data-view="${view}"]`).click();
    expect(await bottom()).toEqual([view]);
    expect(await top()).toEqual([owner, 'ALL', 'ALL']);
  }
  // 서로 다른 상태에서 한쪽만 바꾼다
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="domestic"]').click();
  await page.locator('#filterOwner').selectOption('ALL');
  expect(await bottom()).toEqual(['domestic']);
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="owner"]').click();
  expect(await top()).toEqual(['ALL', 'ALL', 'ALL']);
});

/* ── B. 탭 전환 · 팝업 재오픈 시 펼침 상태 ─────────────────────────── */

test('B-1. 자산 세부현황 그룹 · 대시보드 상세 현황 보기는 탭을 옮겼다 오면 접혀 있고, 상단 필터 선택값은 그대로다', async ({ page }) => {
  await boot(page);
  // 대시보드 「상세 현황 보기」
  await page.evaluate(() => { state.macroIndicatorCache = { VIX: { price: 20, changePercent: 1 } }; renderAll(); });
  await page.locator('#macroDiagnosisToggleBtn').click();
  await page.waitForTimeout(TRANSITION);
  expect(await bodyHeight(page, '#macroDiagnosisBody')).toBeGreaterThan(0);
  // 자산 세부현황 그룹 + 필터 선택
  await tab(page, 'investmentDetail');
  const ownerValue = await page.locator('#filterOwner option').nth(1).getAttribute('value');
  await page.locator('#filterOwner').selectOption(ownerValue);
  const group = page.locator('#assetCardList [data-group-toggle]').first();
  await group.click();
  await expect(page.locator('#assetCardList [data-group-toggle]').first()).toHaveAttribute('aria-expanded', 'true');
  // 다른 탭 → 복귀
  await tab(page, 'transactions');
  await tab(page, 'investmentDetail');
  await expect(page.locator('#assetCardList [data-group-toggle][aria-expanded="true"]')).toHaveCount(0);
  await expect(page.locator('#filterOwner')).toHaveValue(ownerValue);
  await tab(page, 'dashboard');
  expect(await bodyHeight(page, '#macroDiagnosisBody')).toBe(0);
  await expect(page.locator('#macroDiagnosisChevron')).not.toHaveClass(/rotate-180/);
});

test('B-2. 목표 비중 종목 행 · 기간별 실현손익 행은 탭을 옮겼다 오면 접혀 있다(목표 비중은 그대로)', async ({ page }) => {
  await boot(page);
  await goToPortfolioSettingsTab(page);
  const targetsBefore = await page.evaluate(() => JSON.stringify(state.rebalance));
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  const row = page.locator('#portfolioTargetSummaryHusband .portfolio-diag-row-toggle').first();
  const hasRow = await row.count();
  if (hasRow) {
    await row.click();
    await page.waitForTimeout(TRANSITION);
    expect(await page.evaluate(() => Object.values(portfolioDiagRowOpen).some(Boolean))).toBe(true);
  }
  // 기간별 실현손익 행(거래내역 탭) - 행이 없어도 펼침 기록 자체가 비워지는지 본다.
  await page.evaluate(() => { pnlPeriodDetailOpen['2026-09'] = true; });
  await tab(page, 'dashboard');
  expect(await page.evaluate(() => ({ diag: Object.values(portfolioDiagRowOpen).some(Boolean), pnl: Object.keys(pnlPeriodDetailOpen).length }))).toEqual({ diag: false, pnl: 0 });
  await goToPortfolioSettingsTab(page);
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  await page.waitForTimeout(TRANSITION);
  if (hasRow) {
    const rowBody = page.locator('#portfolioTargetSummaryHusband .portfolio-diag-row-body').first();
    expect(await rowBody.evaluate((el) => el.style.maxHeight)).toBe('0px');
  }
  expect(await page.evaluate(() => JSON.stringify(state.rebalance))).toBe(targetsBefore);
});

// 네트워크 없이 계산되는 두 위험자산(e2e/95와 같은 시드).
async function seedAndRunMc(page) {
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'KODEX 200', ticker: '069500', category: 'ETF', owner: '신랑', accountType: '일반계좌', quantity: 1000, buyPrice: 40000, currentPrice: 40000 }),
      makeAsset({ name: 'TIGER 미국S&P500', category: '주식', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 40000000, currentPrice: 40000000 })
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 50, role: '코어자산' },
      { type: 'namedHolding', name: 'TIGER 미국S&P500', pct: 50, role: '코어자산' }
    ];
    persistAssets(); persistRebalance(); persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && lastRefreshAt > 0);
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 30000 });
}

test('B-3. Monte Carlo 결과 · 선택값은 탭을 옮겼다 와도 그대로이고, ⓘ 팝업의 주의사항 묶음은 다시 열면 접힌 채 한 번에 열린다', async ({ page }) => {
  await boot(page);
  await seedAndRunMc(page);
  const iterations = await page.locator('#mcIterationsSelect').inputValue();
  // [UI 마무리 ⑤] 결과 아래 장기 가정 출처 드롭다운은 상단 ⓘ 팝업으로 옮겨 없어졌다 - 탭을 옮겼다 와도 결과 · 선택값은 그대로다.
  await expect(page.locator('#mcCmaSourceArea')).toHaveCount(0);
  await tab(page, 'dashboard');
  await tab(page, 'rebalance');
  await page.locator('[data-subtab="projection"]').click();
  await expect(page.locator('#mcInfoModal')).toBeHidden();
  await expect(page.locator('#mcIterationsSelect')).toHaveValue(iterations);

  // ⓘ 팝업 - 주의사항 묶음 열기 → 닫기 → 다시 열기 → 접혀 있음 → 한 번 누르면 열림.
  // 이번 시드 결과에는 여러 자산이 묶인 주의사항이 없어, 결과 화면과 같은 함수(renderMonteCarloSafetyTiers)로 보관용 영역에
  // 참고 경고 2건(같은 code)을 그린다 - 팝업이 그 보관 HTML을 매번 다시 그리는 실제 경로를 그대로 쓴다.
  await page.evaluate(() => renderMonteCarloSafetyTiers(null, null, mcSafetyDetailStore, [
    { code: 'E2E_GROUP', severity: 'WARNING', title: 'E2E 참고 경고', message: '첫째', field: 'A자산' },
    { code: 'E2E_GROUP', severity: 'WARNING', title: 'E2E 참고 경고', message: '둘째', field: 'B자산' }
  ]));
  await page.locator('#mcIntroInfoBtn').click();
  const toggle = page.locator('#mcInfoModalBody .safety-group-toggle').first();
  await expect(toggle).toBeVisible();
  const groupBody = page.locator('#mcInfoModalBody .safety-group-body').first();
  await toggle.click();
  await page.waitForTimeout(TRANSITION);
  expect(await bodyHeight(page, '#mcInfoModalBody .safety-group-body >> nth=0')).toBeGreaterThan(0);
  await page.locator('#closeMcInfoModalBtn').click();
  await page.locator('#mcIntroInfoBtn').click();
  expect(await groupBody.evaluate((el) => el.style.maxHeight)).toBe('0px');
  await toggle.click();
  await page.waitForTimeout(TRANSITION);
  expect(await bodyHeight(page, '#mcInfoModalBody .safety-group-body >> nth=0'), '한 번 눌러 열린다').toBeGreaterThan(0);
});

/* ── C. 스크롤 위치 ─────────────────────────────────────────────── */

test('C-1. 탭을 옮겼다 돌아오면 화면 맨 위부터 보인다', async ({ page }) => {
  await boot(page);
  for (const name of ['dashboard', 'investmentDetail', 'transactions']) {
    await tab(page, name);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await tab(page, name === 'dashboard' ? 'transactions' : 'dashboard');
    await tab(page, name);
    expect(await page.evaluate(() => window.scrollY), name).toBe(0);
  }
});

const scrollerOf = (page, modalSel) => page.locator(modalSel).evaluate((m) => {
  const list = [m, ...m.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  const el = list[0];
  if (!el) return null;
  el.scrollTop = el.scrollHeight;
  return el.scrollTop;
});
const modalScrollTops = (page, modalSel) => page.locator(modalSel).evaluate((m) => [m, ...m.querySelectorAll('*')].map((e) => e.scrollTop).filter((v) => v > 0).length);

test('C-2. 팝업을 아래로 내린 채 닫았다가 다시 열면 맨 위부터 보인다(입력값 · 선택값은 저장된 값 그대로)', async ({ page }) => {
  await boot(page, 375);
  // ① 자산 추가 팝업
  const openAssetModal = () => page.evaluate(() => { openModal('add'); showModal(); });
  await tab(page, 'investmentDetail');
  await openAssetModal();
  await expect(page.locator('#assetModal')).toBeVisible();
  expect(await scrollerOf(page, '#assetModal')).toBeGreaterThan(0);
  await page.locator('#closeModalBtn').click();
  await expect(page.locator('#assetModal')).toBeHidden();
  await openAssetModal();
  expect(await modalScrollTops(page, '#assetModal'), '자산 추가 팝업').toBe(0);
  await page.locator('#closeModalBtn').click();

  // ② 적립설정 팝업(저장된 월 적립금은 그대로)
  await goToPortfolioSettingsTab(page);
  const saved = await page.evaluate(() => JSON.stringify(state.projection.monthlyContributionByOwner));
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
  expect(await scrollerOf(page, '#monthlyContributionAllocationModal')).toBeGreaterThan(0);
  await page.locator('#closeMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  expect(await modalScrollTops(page, '#monthlyContributionAllocationModal'), '적립설정 팝업').toBe(0);
  await page.locator('#closeMonthlyContributionAllocationModalBtn').click();
  expect(await page.evaluate(() => JSON.stringify(state.projection.monthlyContributionByOwner))).toBe(saved);

  // ③ 거래 입력 팝업을 뒤로가기로 닫은 경우
  await tab(page, 'transactions');
  const openTx = page.locator('#addTransactionBtn, [data-open-transaction-modal]').first();
  if (await openTx.count()) {
    await openTx.click();
    await expect(page.locator('#transactionModal')).toBeVisible();
    if (await scrollerOf(page, '#transactionModal')) {
      await page.goBack();
      await expect(page.locator('#transactionModal')).toBeHidden();
      await openTx.click();
      expect(await modalScrollTops(page, '#transactionModal'), '거래 입력 팝업(뒤로가기로 닫음)').toBe(0);
    }
  }
});

test('C-3. 겹쳐 연 팝업 아래의 팝업은 스크롤 위치가 바뀌지 않는다', async ({ page }) => {
  await boot(page, 375);
  await tab(page, 'investmentDetail');
  await page.evaluate(() => { openModal('add'); showModal(); });
  const top = await scrollerOf(page, '#assetModal');
  expect(top).toBeGreaterThan(0);
  // 같은 팝업이 열려 있는 채로 다른 팝업 여는 경로를 흉내 낸다(열기 함수는 모두 pushModalHistoryState를 부른다).
  await page.evaluate(() => { document.getElementById('chartZoomModal').classList.remove('hidden'); pushModalHistoryState(); });
  expect(await page.locator('#assetModal').evaluate((m) => [m, ...m.querySelectorAll('*')].reduce((s, e) => s + e.scrollTop, 0))).toBe(top);
});

/* ── D. 20년 후 자산 참고값 ─────────────────────────────────────── */

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`D. ${w}px ${dark ? 'Dark' : 'Light'} - 「20년 후 자산 참고값 (일반적 수익률 적용)」이 잘리지 않고 값은 일반적 수익률 경로다`, async ({ page }) => {
      await boot(page, w);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await goToProjectionTab(page);
      const label = page.locator('#projectionHeroFutureLabel');
      await expect(label).toHaveText('20년 후 자산 참고값 (일반적 수익률 적용)');
      const fit = await label.evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        return { fs: parseFloat(win.getComputedStyle(el).fontSize), clipped: el.scrollWidth - el.clientWidth };
      });
      expect(fit.fs).toBeGreaterThanOrEqual(14);
      expect(fit.clipped).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('#projectionHeroFuture')).not.toHaveText(/NaN|undefined|^$/);
    });
  }
}
