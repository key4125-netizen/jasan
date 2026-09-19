// E2E-102 [Phase 2-4 · T1~T3] Risk 세부 모달의 계산 기준 · 한계 표시.
//
// [핵심 계약]
//  1) 관측 수와 VaR 꼬리 표본 수는 결과 객체의 값 그대로 보인다(하드코딩 없음).
//  2) 가격 기록에 문제가 있는 종목만 사용자 문구로 나열하고, 내부 상태 코드는 보이지 않는다.
//  3) 달러 가격 종목이 있을 때만 환율 안내가 보인다([T6] 문구는 "원화 환산 · 환율 기준일"로 바뀌었다 - e2e/103).
//  4) 모바일/데스크톱 × 주간/야간에서 14px 이상, 가로 넘침 없음.
//
// [외부 API 비의존] e2e/98과 같은 방식으로 실제 렌더 함수에 결과 객체를 직접 넣는다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof riskObservationBasisNote === 'function');
}

async function setResult(page, over) {
  await page.evaluate((over) => {
    const subScores = { concentration: 60, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    const r = (n) => new Array(n).fill(0.001);
    const holdings = [
      { ticker: '005930.KS', name: '삼성전자', weight: 0.5, hasData: true, dataStatus: 'OK', returns: r(250), priceCcy: 'KRW' },
      { ticker: 'AAPL', name: '애플', weight: 0.3, hasData: true, dataStatus: 'DATA_STALE', returns: r(250), dataQuality: { lastDate: '2026-08-01' }, priceCcy: 'USD' },
      { ticker: 'NEW.KS', name: '아주 긴 이름을 가진 신규 상장 종목 테스트', weight: 0.2, hasData: true, dataStatus: 'OK', returns: r(40), priceCcy: 'KRW' }
    ];
    state.advancedRiskMetrics = Object.assign({
      totalCur: 10000000, holdings, missingCount: 0,
      topWeight: 50, topHolding: { name: '삼성전자', ticker: '005930.KS', riskContributionPct: 45 },
      hhi: 0.38, portfolioBeta: 0.9, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, cvarKRW: -300000, sortino: 1,
      weightedAvgCorrelation: 0.5, topCorrelation: 0.5, topCorrelationPair: ['가', '나'],
      stressLossKRW: null, stressLossPct: null, stressLossKRW2022: null, stressLossPct2022: null,
      stressStatus: { covid2020: 'SOURCE_UNAVAILABLE', rateHike2022: 'SOURCE_UNAVAILABLE' },
      sectorExposure: { topSector: '반도체', topSectorWeight: 40, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores), excludedFactors: [],
      dataConfidence: { score: 90, reasons: [] },
      metricStatus: { var: { status: 'AVAILABLE', reason: null, observations: 247, required: 120, targetObservations: 750 } },
      varTailObservationCount: 12,
      fxBasis: { source: 'FRB_H10', usdHoldingCount: 1, status: 'OK', applied: true, fxEndDate: '2026-09-11', basisDate: '2026-09-11' },
      dataSufficiency: { status: 'SUFFICIENT', commonReturnCount: 247, required: 120 }
    }, over || {});
    renderRiskDiagnosisSummary();
  }, over);
}

test('1. 관측 수 · 꼬리 표본 수 · 종목 상태 · 환율 고지가 결과 값 그대로 보인다', async ({ page }) => {
  await boot(page);
  await setResult(page);
  await page.evaluate(() => openRiskDetailModal());
  const body = page.locator('#riskDetailModalBody');
  await expect(body).toBeVisible();
  const txt = (await body.innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain('최근 247거래일');
  expect(txt).toContain('하락이 가장 컸던 12일');
  expect(txt).toContain('가격 기록 확인이 필요한 종목 2개 (전체 3개 중)');
  expect(txt).toContain('기록 오래됨 (마지막 2026-08-01)');
  expect(txt).toContain('기록 짧음 (40거래일)');
  expect(txt).toContain('달러로 거래되는 종목 1개');
  expect(txt).toContain('환율 기준일: 2026-09-11');
  ['DATA_STALE', 'INSUFFICIENT_HISTORY', 'SOURCE_UNAVAILABLE', 'NaN', 'undefined', 'null'].forEach((w) => expect(txt, w).not.toContain(w));
  // 스트레스 카드는 v253부터 계속 숨겨져 있다.
  expect(txt).not.toContain('2020년 초 급락');
});

test('2. 원화 종목만 있고 모두 정상이면 환율 고지 없이 "모두 정상" 한 줄만 보인다', async ({ page }) => {
  await boot(page);
  await setResult(page, {
    holdings: [{ ticker: '005930.KS', name: '삼성전자', weight: 1, hasData: true, dataStatus: 'OK', returns: new Array(250).fill(0.001), priceCcy: 'KRW' }],
    fxBasis: null
  });
  await page.evaluate(() => openRiskDetailModal());
  const txt = (await page.locator('#riskDetailModalBody').innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain('보유 주식·ETF 1개 모두 가격 기록을 정상적으로 받았습니다');
  expect(txt).not.toContain('환율 변동');
  await expect(page.locator('#riskDetailModalBody [data-risk-fx-note]')).toHaveCount(0);
});

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 기준 · 한계 문단이 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await setResult(page);
      await page.evaluate(() => openRiskDetailModal());
      const notes = page.locator('#riskDetailModalBody [data-risk-basis-notes]');
      await expect(notes).toBeVisible();
      const m = await notes.evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const nodes = [...el.querySelectorAll('p, li, span')].filter((n) => n.textContent.trim());
        return {
          min: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))),
          clipped: el.scrollWidth - el.clientWidth
        };
      });
      expect(m.min).toBeGreaterThanOrEqual(14);
      expect(m.clipped).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}
