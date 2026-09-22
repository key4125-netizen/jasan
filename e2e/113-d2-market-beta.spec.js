/* global document, getComputedStyle */
// E2E-113 [D-2 · PM 최종 정책 2026-09-21] Market Beta 기준시장 표시 · 혼합구조 명시 · Market/Tracking 분리
//
// Unit(test/d2-market-beta-policy.test.js)이 판정 규칙을 고정한다면, 이 파일은 **실제 화면**이
// 그 규칙을 사용자에게 정직하게 설명하는지 본다:
//   ① 포트폴리오 베타가 "하나의 지수에 대한 통합 베타"로 보이지 않는다 - 기준시장 구성이 함께 나온다(STEP 13)
//   ② 종목별 값에도 무엇 대비 잰 값인지가 붙는다
//   ③ 혼합구조 상품(472170 · 237370)은 그 사실을 화면이 밝힌다(STEP 8 · STEP 10 J)
//   ④ 시장 민감도와 기초지수 추적 민감도가 서로 다른 줄로 분리돼 있다(N)
//   ⑤ 375px · 다크모드에서 14px 이상 · 가로 넘침 없음(W · X)
//
// [실제 사용자 데이터 미사용] 종목 식별자는 공개 원장의 공개 사실이고 수량 · 금액 · 베타는 전부 합성값이다.
// [외부 API 비의존] e2e/102와 같은 방식으로 실제 렌더 함수에 결과 객체를 직접 넣는다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof openRiskDetailModal === 'function');
}

/** 국내 기준 · 미국 기준 · 혼합구조가 한 화면에 섞인 상태를 만든다. */
async function setMixedMarketResult(page) {
  await page.evaluate(() => {
    const r = (n) => new Array(n).fill(0.001);
    const base = { hasData: true, dataStatus: 'OK', returns: r(250), sortino: 1, week52DrawdownPct: -10, riskContributionPct: 30, rsiState: '보통', trendLabel: '혼조' };
    const holdings = [
      Object.assign({}, base, { ticker: '005930.KS', name: 'ZZ 국내주', weight: 0.5, priceCcy: 'KRW', beta: 1.1,
        benchmarkKey: 'KOSPI', benchmarkStatus: 'RESOLVED', benchmarkSource: 'listingMarket',
        trackingBenchmarkKey: 'KOSPI', trackingBeta: 1.1, exposureMarket: 'KR', exposureStructure: null }),
      Object.assign({}, base, { ticker: 'AAPL', name: 'ZZ 미국주', weight: 0.3, priceCcy: 'USD', beta: 1.3,
        benchmarkKey: 'SP500', benchmarkStatus: 'RESOLVED', benchmarkSource: 'usExposure',
        trackingBenchmarkKey: 'NASDAQ', trackingBeta: 1.2, exposureMarket: 'US', exposureStructure: null }),
      Object.assign({}, base, { ticker: '472170.KS', name: 'ZZ 미국테크채권혼합', weight: 0.2, priceCcy: 'KRW', beta: 0.5,
        benchmarkKey: 'KOSPI', benchmarkStatus: 'RESOLVED', benchmarkSource: 'listingMarket',
        trackingBenchmarkKey: null, trackingBeta: null, exposureMarket: 'GLOBAL', exposureStructure: 'MIXED' })
    ];
    const subScores = { concentration: 60, volatility: 40, drawdown: 20, market: 55, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = {
      totalCur: 10000000, holdings, missingCount: 0,
      topWeight: 50, topHolding: { name: 'ZZ 국내주', ticker: '005930.KS', riskContributionPct: 40 },
      hhi: 0.38, portfolioBeta: 1.08, betaDefinition: 'MARKET',
      portfolioTrackingBeta: 1.14, trackingBetaCoveragePct: 80, trackingBetaMissingCount: 1,
      betaCoveragePct: 100, betaMissingCount: 0,
      portfolioVolatilityPct: 18, portfolioMDDPct: -15, portfolioVolatilityShortPct: 18, volatilitySpike: false,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, cvarKRW: -300000, sortino: 1,
      weightedAvgCorrelation: 0.5, topCorrelation: 0.5, topCorrelationPair: ['가', '나'],
      stressLossKRW: -3800000, stressLossPct: -38, stressLossKRW2022: -3000000, stressLossPct2022: -30,
      stressStatus: { covid2020: null, rateHike2022: null },
      sectorExposure: { topSector: '반도체', topSectorWeight: 40, unclassifiedWeightPct: 0, sectorTotals: {} },
      subScores, riskScore: computeCompositeRiskScore(subScores), excludedFactors: [],
      dataConfidence: { score: 90, reasons: [] },
      metricStatus: { var: { status: 'AVAILABLE', reason: null, observations: 247, required: 120, targetObservations: 750 } },
      varTailObservationCount: 12, fxBasis: null,
      dataSufficiency: { status: 'SUFFICIENT', commonReturnCount: 247, required: 120 }
    };
    renderRiskDiagnosisSummary();
  });
}

/* ══ ① · ④  포트폴리오 베타 - 기준시장 구성 · Market/Tracking 분리 ══════════ */

test('D2-1 위험 세부내용은 기준시장 구성을 밝히고, 시장 민감도와 기초지수 추적 민감도를 나눠 보여준다', async ({ page }) => {
  await boot(page);
  await setMixedMarketResult(page);
  await page.evaluate(() => openRiskDetailModal());
  const body = page.locator('#riskDetailModalBody');
  await expect(body).toBeVisible();
  const txt = (await body.innerText()).replace(/\s+/g, ' ');

  // 두 베타가 서로 다른 줄로 분리돼 있다(N).
  expect(txt).toContain('포트폴리오 시장 민감도(베타)');
  expect(txt).toContain('기초지수 추적 민감도');
  expect(txt).toContain('1.08배');
  expect(txt).toContain('1.14배');

  // 기준시장 구성이 보이고(STEP 13), 비중 큰 순서다 - 코스피 70%(0.5+0.2) · S&P500 30%.
  const mix = body.locator('[data-risk-benchmark-mix]');
  await expect(mix).toHaveCount(1);
  const mixTxt = (await mix.innerText()).replace(/\s+/g, ' ');
  expect(mixTxt).toContain('기준시장 구성');
  expect(mixTxt).toContain('코스피 70%');
  expect(mixTxt).toContain('S&P500 30%');
  // "하나의 지수에 대한 통합 베타"로 오해하지 않게 말한다.
  expect(mixTxt).toContain('하나의 지수에 대한 값이 아니라');
});

test('D2-2 기준시장이 하나뿐이면 구성 대신 그 시장 하나임을 말한다', async ({ page }) => {
  await boot(page);
  await setMixedMarketResult(page);
  await page.evaluate(() => {
    const m = state.advancedRiskMetrics;
    m.holdings = m.holdings.filter((h) => h.benchmarkKey === 'KOSPI');
    m.holdings.forEach((h, i) => { h.weight = i === 0 ? 0.7 : 0.3; });
    renderRiskDiagnosisSummary();
  });
  await page.evaluate(() => openRiskDetailModal());
  const mixTxt = (await page.locator('#riskDetailModalBody [data-risk-benchmark-mix]').innerText()).replace(/\s+/g, ' ');
  expect(mixTxt).toContain('기준시장: 코스피');
  expect(mixTxt).not.toContain('기준시장 구성');
});

/* ══ ② · ③  종목별 기준시장 · 혼합구조 명시 ═════════════════════════════ */

test('D2-3 종목 상세의 시장 민감도에 기준시장이 함께 적히고, 혼합구조 상품은 그 사실을 밝힌다', async ({ page }) => {
  await boot(page);
  await setMixedMarketResult(page);
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: '472170.KS', name: 'ZZ 미국테크채권혼합', owner: '신랑', accountType: '일반계좌',
        category: 'ETF', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 10000, currentPrice: 10000 }),
      makeAsset({ ticker: 'AAPL', name: 'ZZ 미국주', owner: '신랑', accountType: '일반계좌',
        category: '주식', currency: 'USD', isDomestic: '해외', quantity: 10, buyPrice: 100, currentPrice: 100 })
    ];
    attachRiskDiagnosisToDetailModal('472170.KS');
  });
  const mixedBody = page.locator('#assetDetailRiskBody');
  await expect(mixedBody.locator('[data-holding-mixed-note]')).toHaveCount(1);
  const mixedTxt = (await mixedBody.innerText()).replace(/\s+/g, ' ');
  expect(mixedTxt).toContain('한 시장만 담고 있지 않습니다');
  expect(mixedTxt).toContain('(코스피 기준)');

  // 미국 노출 종목은 S&P500 기준이라고 적히고, 혼합구조 안내는 붙지 않는다.
  await page.evaluate(() => attachRiskDiagnosisToDetailModal('AAPL'));
  const usTxt = (await mixedBody.innerText()).replace(/\s+/g, ' ');
  expect(usTxt).toContain('(S&P500 기준)');
  await expect(mixedBody.locator('[data-holding-mixed-note]')).toHaveCount(0);
});

/* ══ ⑤  375px · 다크모드 ═══════════════════════════════════════════════ */

for (const theme of ['Light', 'Dark']) {
  test(`D2-4 (375 ${theme}) 기준시장 표시가 14px 이상이고 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await boot(page);
    await page.evaluate((t) => { document.documentElement.classList.toggle('dark', t === 'Dark'); }, theme);
    await setMixedMarketResult(page);
    await page.evaluate(() => openRiskDetailModal());
    await expect(page.locator('#riskDetailModalBody [data-risk-benchmark-mix]')).toBeVisible();

    const probe = await page.evaluate(() => {
      const el = document.querySelector('#riskDetailModalBody [data-risk-benchmark-mix]');
      const cs = getComputedStyle(el);
      return {
        fontSize: parseFloat(cs.fontSize),
        color: cs.color,
        elOverflow: el.scrollWidth - el.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(probe.fontSize).toBeGreaterThanOrEqual(14);
    expect(probe.color).toBeTruthy();
    expect(probe.elOverflow).toBeLessThanOrEqual(1);
    expect(probe.pageOverflow).toBeLessThanOrEqual(1);

    // 종목 상세의 혼합구조 안내도 같은 기준을 지킨다.
    await page.evaluate(() => {
      state.assets = [makeAsset({ ticker: '472170.KS', name: 'ZZ 미국테크채권혼합', owner: '신랑', accountType: '일반계좌',
        category: 'ETF', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 10000, currentPrice: 10000 })];
      attachRiskDiagnosisToDetailModal('472170.KS');
    });
    const note = await page.evaluate(() => {
      const el = document.querySelector('#assetDetailRiskBody [data-holding-mixed-note]');
      if (!el) return null;
      return { fontSize: parseFloat(getComputedStyle(el).fontSize), overflow: el.scrollWidth - el.clientWidth };
    });
    expect(note).not.toBeNull();
    expect(note.fontSize).toBeGreaterThanOrEqual(14);
    expect(note.overflow).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
