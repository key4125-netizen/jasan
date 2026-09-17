/* global window, document, getComputedStyle */
// E2E-95 장기 MC CMA 체계(체크리스트 §37) - 화면에서 확인하는 것:
//   A. 가격 이력 없이(시세 캐시 주입 없음) Monte Carlo가 CMA 변동성 · 상관으로 끝까지 계산된다.
//   B. 결과 아래 "장기 가정 출처"(v250부터 기본 접힘 드롭다운)에 기관 · 기준일 · 기간 · 통화 · 세트 버전 · 상관 출처 유형 개수가 보이고,
//      옆 ⓘ 팝업에 자산군 변동성과 Benchmark 쌍(기관 · 자료 · 기준일 · 값 · 출처 유형)이 보인다.
//   C. MC 입력 서명에 CMA 세트 버전이 들어가고, 세트가 바뀌면 이전 결과는 "다시 계산 필요"로 표시되며
//      결과 자체의 세트 버전 표시는 계산 당시 값 그대로다(소급 변경 없음).
//   D. 수익률 가정은 있는데 CMA 자산군이 없는 위험자산은 실행 전에 어떤 자산인지 알려 준다.
//   E. 375px Dark/Light - 글자 14px 이상 · 버튼 44px 이상 · 가로 넘침 없음.
const { test, expect } = require('@playwright/test');
const { goToProjectionTab } = require('./fixtures');

// 네트워크 없이 계산되는 두 위험자산(국내 지수 ETF = KOSPI 기준, 이름으로 미국 지수 ETF = S&P500 기준).
async function seedCmaPortfolio(page, extraOverseas) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate((extra) => {
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
    if (extra) {
      state.assets.push(makeAsset({ name: extra, category: '주식', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 10000000, currentPrice: 10000000 }));
      state.rebalance['신랑'].targets['국내'] = [
        { type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 50, role: '코어자산' },
        { type: 'namedHolding', name: extra, pct: 50, role: '코어자산' }
      ];
    }
    persistAssets();
    persistRebalance();
    persistProjection();
  }, extraOverseas || null);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  // 부팅 때 자동으로 도는 시세 갱신(refreshPricesAndRates - 보유 종목 현재가 · 리스크 진단용 1년 시세 조회 포함)이
  // 끝날 때까지 기다린다. 이 갱신은 MC와 무관한 요청을 보내는데, 끝나기 전에 요청 수집을 시작하면 부팅 요청이
  // "MC 실행 중 요청"으로 섞여 A · B가 간헐적으로 실패했다. lastRefreshAt(js/11)은 갱신 주기가 모두 끝난 뒤에만 기록된다.
  await page.waitForFunction(() => lastRefreshAt > 0);
  // 시세 캐시를 주입하지 않는다 - 장기 MC는 가격 이력을 쓰지 않아야 한다.
  await page.evaluate(() => { state.riskHistoryCache = {}; });
}

async function runMc(page) {
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await page.locator('#mcRunBtn').click();
}

test('A · B. 가격 이력 없이 계산되고, 장기 가정 출처(기관 · 기준일 · 세트 · Benchmark)가 결과 아래에 보인다', async ({ page }) => {
  await seedCmaPortfolio(page);
  // 부팅 시세 갱신이 끝난 뒤(seedCmaPortfolio)부터 수집한다 - 탭 이동 · MC 실행 · 결과 확인 구간의 요청만 담긴다.
  const priceRequests = [];
  page.on('request', (req) => { if (/finance\.yahoo|stooq|corsproxy|allorigins/.test(req.url())) priceRequests.push(req.url()); });
  await runMc(page);
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 30000 });
  expect(await page.locator('#mcP50Text').innerText()).not.toMatch(/NaN|undefined|Infinity|^$/);
  const area = page.locator('#mcCmaSourceArea');
  await expect(area).toBeVisible();
  const summary = page.locator('#mcCmaSourceSummary');
  await expect(summary).toContainText('Allianz Global Investors 장기 CMA');
  await expect(summary).toContainText('기준일 2025-12-31');
  await expect(summary).toContainText('10년 전망');
  await expect(summary).toContainText('달러(USD) 기준');
  await expect(summary).toContainText('세트 CMA-2026.1');
  await expect(summary).toContainText('Benchmark 참고값 1쌍');
  await expect(summary).toContainText('J.P. Morgan Asset Management(기준일 2025-09-30)');
  await expect(summary).toContainText('수익률: 기존 수익률 기준을 그대로 씁니다(장기 CMA에서는 변동성 · 상관계수만 사용합니다)');
  // [v250] 출처 요약은 기본 접힘 드롭다운 - 펼치면 보인다. 자산군 변동성 · Benchmark 쌍 상세는 옆 ⓘ 팝업(mcInfoModal).
  const body = page.locator('#mcCmaSourceBody');
  await expect(body).toHaveAttribute('style', /max-height:\s*0px/);
  await expect(page.locator('#mcCmaSourceToggleBtn')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#mcCmaSourceToggleBtn').click();
  await expect(page.locator('#mcCmaSourceToggleBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(summary).toBeVisible();
  await page.locator('#mcCmaInfoBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  const detail = page.locator('#mcInfoModalBody');
  await expect(detail).toContainText('국내 주식 → Korea Equities · 변동성 27.9%');
  await expect(detail).toContainText('미국 주식 → North America Equities · 변동성 16.5%');
  await expect(detail).toContainText('국내 주식 ↔ 미국 주식: 0.41');
  await expect(detail).toContainText('Benchmark 참고값(BENCHMARK_REFERENCE)');
  await expect(detail).toContainText('2026 Long-Term Capital Market Assumptions - Korean won (KRW) assumptions matrix');
  await expect(detail).toContainText('기준일 2025-09-30');
  await expect(detail).toContainText('Korean Equity ↔ U.S. Large Cap');
  await page.locator('#closeMcInfoModalBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeHidden();
  expect(priceRequests).toEqual([]);
});

test('C. 입력 서명에 CMA 세트 버전이 들어가고, 세트가 바뀌면 "다시 계산 필요" - 결과의 세트 표시는 계산 당시 그대로', async ({ page }) => {
  await seedCmaPortfolio(page);
  await runMc(page);
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 30000 });
  const sig = await page.evaluate(() => computeMonteCarloInputSignature());
  expect(sig).toContain('"cma":"CMA-2026.1"');
  await expect(page.locator('#mcStaleNotice')).toBeHidden();
  // 새 CMA 세트가 배포된 상황을 흉내 낸다(세트 버전만 바꾼다 - 계산은 다시 하지 않는다).
  await page.evaluate(() => { window.getActiveCmaSetVersion = () => 'CMA-2027.1'; refreshMonteCarloResultValidity(); });
  await expect(page.locator('#mcStaleNotice')).toBeVisible();
  await expect(page.locator('#mcP50ScopeNote')).toContainText('이전 설정 기준');
  await expect(page.locator('#mcCmaSourceSummary')).toContainText('세트 CMA-2026.1');
  await expect(page.locator('#mcCmaSourceSummary')).not.toContainText('CMA-2027.1');
});

test('D. 수익률 가정은 있는데 장기 CMA 자산군이 없는 위험자산이 있으면 실행하지 않고 어떤 자산인지 알려 준다', async ({ page }) => {
  await seedCmaPortfolio(page, 'E2E 선진국주식 인덱스');
  await runMc(page);
  await expect(page.locator('#mcStatusText')).toContainText('E2E 선진국주식 인덱스', { timeout: 15000 });
  await expect(page.locator('#mcStatusText')).toContainText('장기 CMA 자산군');
  await expect(page.locator('#mcResultArea')).toBeHidden();
  await expect(page.locator('#mcRunBtn')).toBeEnabled();
});

for (const scheme of ['dark', 'light']) {
  test(`E. 375px ${scheme} - 출처 영역 14px 이상 · 버튼 44px 이상 · 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: scheme });
    await seedCmaPortfolio(page);
    await page.evaluate((s) => { document.documentElement.classList.toggle('dark', s === 'dark'); }, scheme);
    await runMc(page);
    await expect(page.locator('#mcCmaSourceArea')).toBeVisible({ timeout: 30000 });
    await page.locator('#mcCmaSourceToggleBtn').click();
    await expect(page.locator('#mcCmaSourceSummary')).toBeVisible();
    const m = await page.evaluate(() => {
      const area = document.getElementById('mcCmaSourceArea');
      const texts = [...area.querySelectorAll('p, li, span, button')].filter((el) => el.offsetParent !== null && el.textContent.trim());
      const minFont = Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      const btn = document.getElementById('mcCmaSourceToggleBtn').getBoundingClientRect();
      const info = document.getElementById('mcCmaInfoBtn').getBoundingClientRect();
      const rect = area.getBoundingClientRect();
      return { minFont, btnH: btn.height, infoW: info.width, infoH: info.height, right: rect.right, scrollW: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    expect(m.minFont).toBeGreaterThanOrEqual(14);
    expect(m.btnH).toBeGreaterThanOrEqual(44);
    expect(m.infoW).toBeGreaterThanOrEqual(44);
    expect(m.infoH).toBeGreaterThanOrEqual(44);
    // ⓘ 팝업(상세)도 14px 이상 · 가로 넘침 없음
    await page.locator('#mcCmaInfoBtn').click();
    await expect(page.locator('#mcInfoModalBody')).toContainText('BENCHMARK_REFERENCE');
    const pm = await page.evaluate(() => {
      const body = document.getElementById('mcInfoModalBody');
      const texts = [...body.querySelectorAll('p, li, span')].filter((el) => el.offsetParent !== null && el.textContent.trim());
      return { minFont: Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize))), scrollW: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    expect(pm.minFont).toBeGreaterThanOrEqual(14);
    expect(pm.scrollW).toBeLessThanOrEqual(pm.vw);
    expect(m.right).toBeLessThanOrEqual(m.vw);
    expect(m.scrollW).toBeLessThanOrEqual(m.vw);
  });
}
