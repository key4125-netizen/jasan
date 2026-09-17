// E2E-98 [Risk 정책 P-2 · v252] 공통 거래일 수익률이 120개 미만이면 종합 위험점수를 만들지 않는다.
//
// [핵심 계약]
//  1) 요약 카드와 세부 모달은 점수 · 등급 · 진단 대신 "계산 불가(데이터 부족)" 안내만 보여준다.
//  2) What-If(편입 시뮬레이션)는 데이터 부족 결과로 계산하지 않는다.
//  3) dataSufficiency가 없는 예전 형태의 결과는 정상 결과로 그대로 그린다(명시적 INSUFFICIENT만 분기).
//  4) 스트레스 손실 추정이 없으면 0원이 아니라 "계산할 수 없음"으로 보인다.
//  5) 모바일/데스크톱 × 주간/야간에서 14px 이상, 가로 넘침 없음.
//
// [외부 API 비의존] e2e/40 · e2e/97과 같은 방식으로 실제 렌더 함수에 결과 객체를 직접 넣는다.
/* global window, document */
const { test, expect } = require('@playwright/test');

const TITLE = '종합 위험점수 계산 불가 (데이터 부족)';
const MESSAGE = '보유 주식·ETF의 가격 기록이 함께 있는 거래일이 87일이라, 계산에 필요한 120일보다 적습니다. 최근 상장했거나 가격 기록을 받지 못한 종목이 있으면 이렇게 표시됩니다.';

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof isRiskDataInsufficient === 'function');
}

// computeAdvancedRiskMetrics()가 데이터 부족일 때 돌려주는 형태 그대로(비중 정보만 남고 나머지는 null).
async function setInsufficient(page) {
  await page.evaluate(() => {
    state.advancedRiskMetrics = {
      totalCur: 10000000,
      holdings: [{ ticker: 'NEW.KS', name: '신규상장', weight: 0.6, hasData: true, riskContributionPct: null }],
      missingCount: 0, topWeight: 60, topHolding: { name: '신규상장', ticker: 'NEW.KS', riskContributionPct: null },
      top3Weight: 100, hhi: 0.52,
      sectorExposure: { topSector: '반도체', topSectorWeight: 60, unclassifiedWeightPct: 0, sectorTotals: {} },
      dataSufficiency: { status: 'INSUFFICIENT', commonReturnCount: 87, required: 120 },
      portfolioBeta: null, portfolioVolatilityPct: null, portfolioMDDPct: null, var95Pct: null, cvarPct: null,
      var95KRW: null, cvarKRW: null, sortino: null, weightedAvgCorrelation: null, correlationMatrix: null,
      topCorrelation: null, topCorrelationPair: null, stressLossKRW: null, stressLossPct: null,
      stressLossKRW2022: null, stressLossPct2022: null, portfolioVolatilityShortPct: null, volatilitySpike: false,
      subScores: null, riskScore: null, dataConfidence: null
    };
    renderRiskDiagnosisSummary();
  });
}

// 정상 결과(예전 형태 - dataSufficiency 없음).
async function setNormal(page, over) {
  await page.evaluate((over) => {
    const subScores = { concentration: 60, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = Object.assign({
      totalCur: 10000000, holdings: [], missingCount: 0,
      topWeight: 40, topHolding: { name: '테스트종목', ticker: 'TEST.KS', riskContributionPct: 45 },
      hhi: 0.3, portfolioBeta: 0.9, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, cvarKRW: -300000, sortino: 1,
      weightedAvgCorrelation: 0.5, topCorrelation: 0.5, topCorrelationPair: ['가', '나'],
      stressLossKRW: -3000000, stressLossPct: -30, stressLossKRW2022: -2500000, stressLossPct2022: -25,
      sectorExposure: { topSector: '반도체', topSectorWeight: 40, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores),
      dataConfidence: { score: 90, reasons: [] }
    }, over || {});
    renderRiskDiagnosisSummary();
  }, over);
}

test('1. 요약 카드는 점수 · 등급 · 진단 대신 데이터 부족 안내만 보여준다', async ({ page }) => {
  await boot(page);
  await setInsufficient(page);
  const card = page.locator('#riskDiagnosisSummary');
  await expect(card).toBeVisible();
  const txt = (await card.innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain(TITLE);
  expect(txt).toContain(MESSAGE);
  // 점수 · 등급 · 신뢰도 · 진단 요소가 없다(50점 대체값도 없다).
  ['양호', '주의', '위험 수준', '신뢰도', '/100', 'NaN', 'null', 'undefined'].forEach((w) => expect(txt, w).not.toContain(w));
  await expect(card.locator('#riskDetailBtn')).toHaveCount(0);
  await expect(card.locator('#riskPlanCheckBtn')).toHaveCount(0);
});

test('2. 세부 모달도 같은 안내만 보여주고 What-If 영역을 그리지 않는다', async ({ page }) => {
  await boot(page);
  await setInsufficient(page);
  await page.evaluate(() => openRiskDetailModal());
  const body = page.locator('#riskDetailModalBody');
  await expect(body).toBeVisible();
  const txt = (await body.innerText()).replace(/\s+/g, ' ');
  expect(txt).toContain(TITLE);
  expect(txt).toContain(MESSAGE);
  ['VaR', '베타', '2020년 초 급락', 'NaN', 'undefined'].forEach((w) => expect(txt, w).not.toContain(w));
  await expect(body.locator('#whatIfSimBox')).toHaveCount(0);
  await expect(body.locator('[data-scenario-preset]')).toHaveCount(0);
});

test('3. What-If 클릭 처리도 데이터 부족 결과로는 계산하지 않는다', async ({ page }) => {
  await boot(page);
  await setNormal(page);
  await page.evaluate(() => openRiskDetailModal());
  // [v253] 세부 모달은 What-If 영역을 그리지 않는다(e2e/99). 클릭 처리 코드는 남아 있으므로, 예전 렌더와 같은
  // 구조의 버튼을 직접 넣어 데이터 부족 결과에서 계산하지 않는지 확인한다.
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.id = 'whatIfSimBox';
    box.dataset.topTicker = 'TEST.KS';
    box.innerHTML = '<button type="button" data-scenario-preset="balanced" data-target-pct="20.0">균형 20%</button><div id="whatIfResultBox"></div>';
    document.getElementById('riskDetailModalBody').appendChild(box);
    state.advancedRiskMetrics = Object.assign({}, state.advancedRiskMetrics, {
      dataSufficiency: { status: 'INSUFFICIENT', commonReturnCount: 50, required: 120 }
    });
    window.__scenarioCalls = 0;
    const orig = computeScenarioRiskMetrics;
    window.computeScenarioRiskMetrics = (...a) => { window.__scenarioCalls++; return orig(...a); };
  });
  await page.locator('#whatIfSimBox [data-scenario-preset]').click();
  expect(await page.locator('#whatIfResultBox').innerHTML()).toBe('');
  expect(await page.evaluate(() => window.__scenarioCalls)).toBe(0);
  expect(await page.evaluate(() => computeScenarioRiskMetrics({ dataSufficiency: { status: 'INSUFFICIENT' }, holdings: [] }, {}))).toBeNull();
});

test('4. dataSufficiency가 없는 예전 결과와 SUFFICIENT 결과는 정상 카드로 그린다', async ({ page }) => {
  await boot(page);
  await setNormal(page);
  let txt = await page.locator('#riskDiagnosisSummary').innerText();
  expect(txt).not.toContain(TITLE);
  await expect(page.locator('#riskDiagnosisSummary #riskDetailBtn')).toHaveCount(1);
  await setNormal(page, { dataSufficiency: { status: 'SUFFICIENT', commonReturnCount: 240, required: 120 } });
  txt = await page.locator('#riskDiagnosisSummary').innerText();
  expect(txt).not.toContain(TITLE);
  expect(await page.evaluate(() => isRiskDataInsufficient(null))).toBe(false);
});

test('5. 스트레스 손실 추정이 없으면 0원이 아니라 계산할 수 없음 문구를 쓴다(세부 모달에는 v253부터 미표시)', async ({ page }) => {
  await boot(page);
  // 표시 문구 함수 - 값이 없으면 "계산할 수 없음", 있으면 기존 문구 그대로.
  const texts = await page.evaluate(() => [stressLossValueText(null, null), stressLossValueText(-3000000, -30)]);
  expect(texts[0]).toBe('계산할 수 없음 (기준 지수나 시장 민감도를 확인할 수 없는 종목 포함)');
  expect(texts[1]).toContain('(-30%) 손실 예상');
  // [v253] 세부 모달에는 과거 하락장 가정 손실 카드 자체가 없다 - 값이 없어도 0원 · NaN이 보이지 않는다.
  await setNormal(page, { stressLossKRW: null, stressLossPct: null, stressLossKRW2022: null, stressLossPct2022: null, portfolioBeta: null });
  await page.evaluate(() => openRiskDetailModal());
  const txt = await page.locator('#riskDetailModalBody').innerText();
  ['계산할 수 없음 (기준 지수', '2020년 초 급락', 'NaN', '약 0원'].forEach((w) => expect(txt, w).not.toContain(w));
});

/* ─────────────────────── 모바일 / 데스크톱 × 주간 / 야간 ─────────────────────── */

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 데이터 부족 안내가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await setInsufficient(page);

      const measure = (sel) => page.locator(sel).evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const nodes = [...el.querySelectorAll('p')].filter((n) => n.textContent.trim());
        return {
          count: nodes.length,
          min: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))),
          clipped: Math.max(el.scrollWidth - el.clientWidth, ...nodes.map((n) => n.scrollWidth - n.clientWidth)),
          colors: nodes.map((n) => win.getComputedStyle(n).color)
        };
      });

      const card = await measure('#riskDiagnosisSummary');
      expect(card.count).toBe(2);
      expect(card.min, '요약 카드 최소 글꼴').toBeGreaterThanOrEqual(14);
      expect(card.clipped, '요약 카드 가로 넘침').toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

      await page.evaluate(() => openRiskDetailModal());
      await expect(page.locator('#riskDetailModalBody')).toBeVisible();
      const modal = await measure('#riskDetailModalBody');
      expect(modal.count).toBe(2);
      expect(modal.min, '세부 모달 최소 글꼴').toBeGreaterThanOrEqual(14);
      expect(modal.clipped, '세부 모달 가로 넘침').toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

      // 야간에는 밝은 글자, 주간에는 어두운 글자(배경과 같은 색으로 묻히지 않는다).
      const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
      for (const c of [...card.colors, ...modal.colors]) {
        if (dark) expect(lum(c), c).toBeGreaterThan(150);
        else expect(lum(c), c).toBeLessThan(110);
      }
    });
  }
}
