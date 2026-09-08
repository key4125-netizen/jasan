// E2E-72 [V1.3 P1-1] 종합 위험점수의 계산 대상 범위 고지.
//
// 정책: RISK_ELIGIBLE_CATEGORIES = ['주식','ETF'] (js/09) - 계산 로직은 이번 작업에서 전혀 바꾸지
// 않는다. 사용자가 "종합 위험점수"를 전체 자산 기준으로 오해하지 않도록, 점수가 표시되는 자리마다
// 그 사실이 화면에 보이는지만 고정한다.
//
// [기존 구현과의 관계] 메인 RISK 카드는 이미 #riskScopeNote(index.html + updateRealEstateGuidanceText,
// js/03)로 헤드라인 바로 아래에 상시 고지하고 있었고 e2e/40 "5"가 그것을 고정한다. 이번 변경은
// 그 고지가 없던 위험 경고 팝업(riskAlertModal)에만 같은 사실을 한 줄 덧붙인 것이다.
// 이 파일은 "점수가 보이는 모든 자리에 범위 고지가 함께 보인다"는 계약을 두 자리 모두에서 검사한다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof openRiskAlertModal === 'function');
}

// e2e/40과 동일한 최소 metrics 스텁 - 실제 렌더 함수가 읽는 필드만 채운다(계산 함수는 앱 실제 코드).
async function seedMetrics(page) {
  await page.evaluate(() => {
    const subScores = { concentration: 30, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = {
      totalCur: 10000000, holdings: [], missingCount: 0,
      topWeight: 30, topHolding: { name: '테스트종목', benchmarkKey: 'KOSPI', riskContributionPct: 30 },
      hhi: 0.3, portfolioBeta: 1.0, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, weightedAvgCorrelation: 0.4,
      topCorrelation: null, topCorrelationPair: null,
      sectorExposure: { topSector: '반도체', topSectorWeight: 30, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores),
      dataConfidence: { score: 92, reasons: ['수급 지표는 추정치'] }
    };
  });
}

// 채권/현금/부동산 비중이 압도적인 포트폴리오(주식·ETF는 소수) - 오해 위험이 가장 큰 상황.
async function seedBondHeavyPortfolio(page) {
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: '', name: 'E72국고채', owner: '신랑', accountType: '일반계좌', category: '채권', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 500000000, currentPrice: 500000000 }),
      makeAsset({ ticker: '', name: 'E72아파트', owner: '신랑', accountType: '일반계좌', category: '부동산', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 800000000, currentPrice: 800000000 }),
      makeAsset({ ticker: '', name: 'E72예수금', owner: '신랑', accountType: '일반계좌', category: '현금', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 100000000, currentPrice: 100000000 }),
      makeAsset({ ticker: '005930.KS', name: 'E72삼성전자', owner: '신랑', accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 70000, currentPrice: 70000 })
    ];
    state.transactions = [];
    persistAssets(); persistTransactions();
    renderAll();
  });
}

/* ── A. 점수가 보이는 두 자리 모두에서 계산 대상 고지가 보인다 ───────────────── */

test('A-1. 메인 RISK 카드 - 점수 바로 위에 진단 대상(주식·ETF) 고지가 상시 보인다', async ({ page }) => {
  await boot(page);
  await seedMetrics(page);
  await page.evaluate(() => renderRiskDiagnosisSummary());
  await expect(page.locator('#riskDiagnosisSummary')).toBeVisible();

  const note = page.locator('#riskScopeNote');
  await expect(note, '고지는 숨김/툴팁이 아니라 화면에 상시 보여야 한다').toBeVisible();
  const noteText = await note.innerText();
  expect(noteText).toContain('주식·ETF');
  expect(noteText).toContain('채권');
  // 점수 헤드라인이 실제로 같은 화면에 함께 있다.
  expect(await page.locator('#riskDiagnosisSummary').innerText()).toContain('종합 위험점수');
});

test('A-2. 위험 경고 팝업 - 점수 바로 아래에 같은 고지가 보인다(이번 변경 지점)', async ({ page }) => {
  await boot(page);
  await seedMetrics(page);
  await page.evaluate(() => openRiskAlertModal());
  await expect(page.locator('#riskAlertModal')).toBeVisible();

  const box = await page.locator('#riskAlertScoreBox').innerText();
  expect(box).toContain('종합 위험점수');
  expect(box).toContain('주식·ETF');
  expect(box).toContain('제외');
});

/* ── B. 채권/현금/부동산 비중이 큰 포트폴리오에서도 고지가 유지된다 ─────────── */

test('B. 채권·현금·부동산이 대부분인 포트폴리오에서도 두 자리 모두 고지가 유지된다', async ({ page }) => {
  await boot(page);
  await seedBondHeavyPortfolio(page);
  await seedMetrics(page);
  await page.evaluate(() => { renderRiskDiagnosisSummary(); openRiskAlertModal(); });

  await expect(page.locator('#riskScopeNote')).toBeVisible();
  expect(await page.locator('#riskScopeNote').innerText()).toContain('주식·ETF');
  expect(await page.locator('#riskAlertScoreBox').innerText()).toContain('주식·ETF');

  // 보유 부동산이 있으면 기존 정책대로 문구에 '부동산'까지 명시된다(updateRealEstateGuidanceText).
  expect(await page.locator('#riskScopeNote').innerText()).toContain('부동산');
});

/* ── C. 기존 Risk 계산값이 변하지 않는다 ──────────────────────────────────── */

test('C. 고지 추가가 위험점수/등급/6대 요인/진단 대상 집합을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  await seedBondHeavyPortfolio(page);
  const r = await page.evaluate(() => {
    const subScores = { concentration: 30, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    return {
      score: computeCompositeRiskScore(subScores),
      level: riskLevelFromScore(computeCompositeRiskScore(subScores)).level,
      eligibleCategories: RISK_ELIGIBLE_CATEGORIES.slice(),
      // 채권/현금/부동산은 진단 대상에서 빠지고 주식만 남는다(기존 정책 그대로).
      eligibleNames: riskEligibleAssets().map((a) => a.name),
      subScoreKeys: Object.keys(subScores)
    };
  });
  expect(r.eligibleCategories).toEqual(['주식', 'ETF']);
  expect(r.eligibleNames).toEqual(['E72삼성전자']);
  expect(r.subScoreKeys).toEqual(['concentration', 'volatility', 'drawdown', 'market', 'correlation', 'technical']);
  expect(typeof r.score).toBe('number');
  expect(typeof r.level).toBe('string');
});

/* ── G. 기존 "가격 변동 위험" 안내와 의미가 충돌하지 않는다 ──────────────────── */

test('G. 범위 고지(어떤 자산이 대상인가)와 기존 성격 고지(어떤 위험을 보는가)가 함께, 충돌 없이 존재한다', async ({ page }) => {
  await boot(page);
  await seedMetrics(page);
  await page.evaluate(() => renderRiskDiagnosisSummary());
  const summary = await page.locator('#riskDiagnosisSummary').innerText();
  const scope = await page.locator('#riskScopeNote').innerText();

  // 서로 다른 축이다: 범위(자산 종류) vs 성격(가격 변동 위험만 본다).
  expect(scope).toContain('주식·ETF');
  expect(summary).toContain('가격 변동 위험');
  // 범위 고지가 기존 계획-확인 안내를 대체하거나 지우지 않았다.
  await expect(page.locator('#riskPlanCheckBtn')).toBeVisible();
  // 범위 고지에 행동 지시/위험 표현을 얹지 않는다(기존 e2e/40 "8"과 같은 원칙).
  ['매도', '매수', '손절', '줄이', '늘리', '위험합니다'].forEach((w) => {
    expect(scope, `범위 고지에 행동/위험 표현 발견: ${w}`).not.toContain(w);
  });
});

/* ── E/F. 375px 모바일 + 다크모드 ─────────────────────────────────────────── */

test('E/F. 375px 모바일 다크모드에서 두 고지 모두 가로 오버플로 없이 14px 이상으로 읽힌다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  await page.locator('html').evaluate((el) => el.classList.add('dark'));
  await seedBondHeavyPortfolio(page);
  await seedMetrics(page);
  await page.evaluate(() => { renderRiskDiagnosisSummary(); openRiskAlertModal(); });

  const readable = async (selector) => page.locator(selector).evaluate((el) => {
    const view = el.ownerDocument.defaultView;
    const target = el.id === 'riskAlertScoreBox' ? el.querySelectorAll('p')[1] : el; // 팝업은 두 번째 <p>가 고지
    const cs = view.getComputedStyle(target);
    return { fontPx: Math.round(parseFloat(cs.fontSize)), text: target.innerText.trim() };
  });

  const cardNote = await readable('#riskScopeNote');
  const popupNote = await readable('#riskAlertScoreBox');
  expect(cardNote.fontPx, '폰트를 줄여 해결하지 않는다').toBeGreaterThanOrEqual(14);
  expect(popupNote.fontPx).toBeGreaterThanOrEqual(14);
  expect(popupNote.text).toContain('주식·ETF');

  const scrollWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
  const clientWidth = await page.locator('body').evaluate((el) => el.clientWidth);
  expect(scrollWidth, '긴 고지 문구로 가로 오버플로가 생기면 안 된다').toBeLessThanOrEqual(clientWidth + 1);
});
