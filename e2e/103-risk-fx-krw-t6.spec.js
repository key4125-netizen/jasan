// E2E-103 [T6 · §44 44-15] Risk 원화 기준 환율 반영 - 화면 문구 · 환율 기준일 · 정적 JSON 로드.
//
// [핵심 계약]
//  1) 달러 가격 종목이 있으면 "달러 가격과 원/달러 환율을 함께 반영한 원화 가치 변동" 문구와
//     결과 객체의 환율 기준일이 그대로 보인다(날짜 하드코딩 없음). "환율 미포함" 문구는 없다.
//  2) 환율 자료를 못 읽었으면 계산하지 않았다는 사실만 말한다.
//  3) 앱은 같은 출처의 data/fx/usdkrw-h10.json만 읽고, 검사를 통과한다(H.10 원문을 직접 조회하지 않는다).
//  4) 모바일/데스크톱 × 주간/야간에서 14px 이상, 가로 넘침 없음.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof riskFxBasisNote === 'function');
}

async function setResult(page, fxBasis) {
  await page.evaluate((fxBasis) => {
    const subScores = { concentration: 60, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    const r = (n) => new Array(n).fill(0.001);
    state.advancedRiskMetrics = {
      totalCur: 10000000, missingCount: 0,
      holdings: [
        { ticker: '005930.KS', name: '삼성전자', weight: 0.6, hasData: true, dataStatus: 'OK', returns: r(250), priceCcy: 'KRW' },
        { ticker: 'AAPL', name: '애플', weight: 0.2, hasData: true, dataStatus: 'OK', returns: r(250), priceCcy: 'USD', fxStatus: 'OK', fxLastDate: fxBasis.basisDate },
        { ticker: 'QQQM', name: 'QQQM', weight: 0.2, hasData: true, dataStatus: 'OK', returns: r(250), priceCcy: 'USD', fxStatus: 'OK', fxLastDate: fxBasis.basisDate }
      ],
      topWeight: 60, topHolding: { name: '삼성전자', ticker: '005930.KS', riskContributionPct: 45 },
      hhi: 0.44, portfolioBeta: 0.9, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, cvarKRW: -300000, sortino: 1,
      weightedAvgCorrelation: 0.5, topCorrelation: 0.5, topCorrelationPair: ['가', '나'],
      stressLossKRW: null, stressLossPct: null, stressLossKRW2022: null, stressLossPct2022: null,
      sectorExposure: { topSector: '반도체', topSectorWeight: 40, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores), excludedFactors: [],
      dataConfidence: { score: 90, reasons: [] },
      metricStatus: { var: { status: 'AVAILABLE', reason: null, observations: 240, required: 120, targetObservations: 750 } },
      varTailObservationCount: 11,
      dataSufficiency: { status: 'SUFFICIENT', commonReturnCount: 240, required: 120 },
      fxBasis
    };
    renderRiskDiagnosisSummary();
  }, fxBasis);
}

test('1. 달러 종목이 있으면 원화 환산 정의와 결과의 환율 기준일이 보인다', async ({ page }) => {
  await boot(page);
  await setResult(page, { source: 'FRB_H10', usdHoldingCount: 2, status: 'OK', applied: true, fxEndDate: '2026-09-04', basisDate: '2026-09-04' });
  await page.evaluate(() => openRiskDetailModal());
  const txt = (await page.locator('#riskDetailModalBody').innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain('달러로 거래되는 종목 2개는 달러 가격과 원/달러 환율을 함께 반영한 원화 가치 변동으로 Risk를 계산했습니다');
  expect(txt).toContain('환율 기준일: 2026-09-04');
  ['포함되지 않습니다', '정확', 'undefined', 'null', 'NaN'].forEach((w) => expect(txt, w).not.toContain(w));
});

test('2. 환율 자료를 못 읽었으면 계산하지 않았다는 사실만 말한다', async ({ page }) => {
  await boot(page);
  await setResult(page, { source: 'FRB_H10', usdHoldingCount: 2, status: 'SOURCE_UNAVAILABLE', applied: false, fxEndDate: null, basisDate: null });
  await page.evaluate(() => openRiskDetailModal());
  const txt = (await page.locator('#riskDetailModalBody').innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain('원/달러 환율 자료를 불러오지 못해, 달러로 거래되는 종목 2개의 원화 기준 변동성·손실 지표를 계산하지 않았습니다');
  expect(txt).not.toContain('환율 기준일');
  expect(txt).not.toContain('SOURCE_UNAVAILABLE');
});

test('3. 앱은 같은 출처의 정적 H.10 JSON을 읽고 검사를 통과한다', async ({ page }) => {
  const requested = [];
  page.on('request', (req) => requested.push(req.url()));
  await boot(page);
  const r = await page.evaluate(async () => {
    const got = await getRiskUsdKrwRates();
    return { status: got.status, endDate: got.endDate, size: got.rates ? got.rates.size : 0 };
  });
  const file = require('../data/fx/usdkrw-h10.json');
  expect(r.size).toBe(file.validCount);
  expect(r.endDate).toBe(file.endDate);
  expect(['OK', 'DATA_STALE']).toContain(r.status);
  expect(requested.some((u) => u.includes('/data/fx/usdkrw-h10.json'))).toBe(true);
  expect(requested.some((u) => u.includes('federalreserve.gov'))).toBe(false);
});

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 환율 안내가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await setResult(page, { source: 'FRB_H10', usdHoldingCount: 2, status: 'OK', applied: true, fxEndDate: '2026-09-04', basisDate: '2026-09-04' });
      await page.evaluate(() => openRiskDetailModal());
      const note = page.locator('#riskDetailModalBody [data-risk-fx-note]');
      await expect(note).toBeVisible();
      const m = await note.evaluate((el) => ({
        size: parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize),
        clipped: el.scrollWidth - el.clientWidth
      }));
      expect(m.size).toBeGreaterThanOrEqual(14);
      expect(m.clipped).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}

// [T6 후속 · Issue 1 · 2] 환율만 오래된 종목은 환율 기준일로 표시하고, "환율 기준일: 날짜"는 한 줄 덩어리로 남는다.
for (const w of [375, 1440]) {
  test(`${w}px - 환율만 오래됨 표시 · 환율 기준일이 줄 끝에서 갈라지지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await boot(page);
    await page.locator('[data-tab="dashboard"]').click();
    await setResult(page, { source: 'FRB_H10', usdHoldingCount: 2, status: 'DATA_STALE', applied: true, fxEndDate: '2026-08-21', basisDate: '2026-08-21' });
    await page.evaluate(() => {
      const m = state.advancedRiskMetrics;
      m.holdings[1] = Object.assign({}, m.holdings[1], { dataStatus: 'DATA_STALE', fxStatus: 'DATA_STALE', fxLastDate: '2026-08-21', dataQuality: { stale: false, lastDate: '2026-09-18' } });
      openRiskDetailModal();
    });
    const body = page.locator('#riskDetailModalBody');
    const txt = (await body.innerText()).replace(/\s+/g, ' ');
    expect(txt).toContain('환율 자료 오래됨 (환율 기준일 2026-08-21)');
    expect(txt).not.toContain('마지막 2026-09-18');
    ['undefined', 'NaN', 'null'].forEach((x) => expect(txt, x).not.toContain(x));
    /* [UX-8② 기대값 갱신 · 2026-09-22] 같은 문단 안에 「시장 민감도(베타)」도 줄바꿈 금지 덩어리로
     * 묶였다(375px에서 여는 괄호에서 갈라지던 문제). 이 테스트가 고정하는 것은 **날짜 덩어리**이므로
     * 텍스트로 그 하나만 집어 검사한다 - 검사 의도는 그대로다. */
    const span = body.locator('[data-risk-fx-note] .whitespace-nowrap').filter({ hasText: '환율 기준일' });
    await expect(span).toHaveText('환율 기준일: 2026-08-21');
    // 한 덩어리로 그려졌으면 줄 상자(client rect)가 1개다.
    expect(await span.evaluate((el) => el.getClientRects().length)).toBe(1);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

// [T6 후속 · Issue 11-1] "가격 기록 확인이 필요한 종목" 줄 - 긴 상태 문구가 있어도 종목명을 말줄임하지 않는다.
// 375px에서는 상태가 다음 줄로 내려가고, 1440px에서는 예전처럼 한 줄이다.
for (const w of [375, 1440]) {
  test(`${w}px - 환율만 오래된 종목의 이름과 상태가 둘 다 읽힌다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await boot(page);
    await page.locator('[data-tab="dashboard"]').click();
    await setResult(page, { source: 'FRB_H10', usdHoldingCount: 2, status: 'DATA_STALE', applied: true, fxEndDate: '2026-08-21', basisDate: '2026-08-21' });
    await page.evaluate(() => {
      const m = state.advancedRiskMetrics;
      const stale = { dataStatus: 'DATA_STALE', fxStatus: 'DATA_STALE', fxLastDate: '2026-08-21', dataQuality: { stale: false, lastDate: '2026-09-18' } };
      m.holdings[1] = Object.assign({}, m.holdings[1], stale, { name: 'APPLE INC' });
      m.holdings[2] = Object.assign({}, m.holdings[2], stale, { name: 'TIGER 미국S&P500' });
      openRiskDetailModal();
    });
    const rows = page.locator('#riskDetailModalBody [data-holding-status-row]');
    await expect(rows).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const r = await rows.nth(i).evaluate((li) => {
        const [name, status] = li.querySelectorAll('span');
        const nb = name.getBoundingClientRect(), sb = status.getBoundingClientRect();
        return {
          name: name.innerText, status: status.innerText,
          nameClipped: name.scrollWidth - name.clientWidth, statusClipped: status.scrollWidth - status.clientWidth,
          rowClipped: li.scrollWidth - li.clientWidth, sameLine: Math.abs(nb.top - sb.top) < 2, statusBelow: sb.top >= nb.bottom - 1
        };
      });
      expect(['APPLE INC', 'TIGER 미국S&P500']).toContain(r.name);
      expect(r.status).toBe('환율 자료 오래됨 (환율 기준일 2026-08-21)');
      expect(r.nameClipped).toBeLessThanOrEqual(1);
      expect(r.statusClipped).toBeLessThanOrEqual(1);
      expect(r.rowClipped).toBeLessThanOrEqual(1);
      if (w === 375) expect(r.statusBelow).toBe(true);
      else expect(r.sameLine).toBe(true);
    }
    const txt = await page.locator('#riskDetailModalBody').innerText();
    ['undefined', 'NaN', 'null'].forEach((x) => expect(txt, x).not.toContain(x));
    expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}
