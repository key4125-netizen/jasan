// E2E-99 [v253 UI 정리 · 표시만] PM 지시 4건을 고정한다.
//   A. Risk 세부 모달: 과거 하락장 가정 손실(2020 · 2022) 카드와 What-If 영역을 그리지 않는다(빈 자리도 남기지 않는다).
//      나머지 지표(소르티노 · 상관 · 최다 노출 섹터 등)는 그대로다. 계산 함수는 남아 있다.
//   B. 시장 현황 & 매크로 브리핑: 세부 현황 진입점. 「📌 세부 내용 보기」 → 「📄 상세 현황 보기」(v253)를
//      거쳐, PM 지시 2026-09-23 #3으로 제목 우측 [세부내용] 버튼 + 팝업이 되었다(내용·계산 무변경).
//   C. 포트폴리오 설정: 신랑/와이프 목표 비중 드롭다운은 서로의 열림 상태를 바꾸지 않는다.
//   D. 일반계좌 적립계획 버튼 = 「적립설정」(절세계좌 적립계획 버튼과 같은 이름).
//   E. 375 / 1440 × Light / Dark - 14px 이상 · 잘림 없음 · 가로 넘침 없음.
//   F. [v254 · v253 누락분] 메인 Risk 카드 하단의 계획 확인 안내를 그리지 않는다(빈 자리 없음) - 점수 · 진단 · 리스크 감지는 그대로.
/* global document, getComputedStyle */
const { test, expect } = require('@playwright/test');
const { goToPortfolioSettingsTab } = require('./fixtures');

/* [PM 지시 2026-09-23 · #3] 매크로 세부 현황이 아코디언(max-height 전환)에서 팝업으로 바뀌면서
 * 이 파일에서 전환을 기다릴 곳이 없어졌다 - 팝업은 toBeVisible/toBeHidden으로 직접 기다린다. */

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderRiskDetailModal === 'function'
    && typeof positionAnalysisAccordionOpen !== 'undefined');
}

// 세부 모달을 정상 결과로 연다(e2e/98과 같은 방식 - 외부 시세 없이 실제 렌더 함수를 쓴다).
async function openNormalRiskDetail(page) {
  await page.evaluate(() => {
    const subScores = { concentration: 60, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = {
      totalCur: 10000000, holdings: [], missingCount: 0,
      topWeight: 57, topHolding: { name: '테스트종목', ticker: 'TEST.KS', riskContributionPct: 45 },
      hhi: 0.3, portfolioBeta: 0.9, portfolioVolatilityPct: 65.6, portfolioMDDPct: -42,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, cvarKRW: -300000, sortino: 1,
      weightedAvgCorrelation: 0.4, topCorrelation: 0.4, topCorrelationPair: ['가', '나'],
      stressLossKRW: -3000000, stressLossPct: -30, stressLossKRW2022: -2500000, stressLossPct2022: -25,
      sectorExposure: { topSector: '반도체', topSectorWeight: 73, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 60, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores),
      dataConfidence: { score: 90, reasons: [] }
    };
    renderRiskDiagnosisSummary();
    openRiskDetailModal();
  });
  await expect(page.locator('#riskDetailModalBody')).toBeVisible();
}

function seedMacro(page) {
  return page.evaluate(() => {
    state.macroIndicatorCache = {
      VIX: { price: 22.3, changePercent: 4.1 }, UST10Y: { price: 4.25, changePercent: 1.2 },
      GOLD: { price: 2400, changePercent: 0.8 }, USDX: { price: 104.2, changePercent: 0.3 }
    };
    renderAll();
  });
}

const accordionState = (page) => page.evaluate(() => ({
  husband: positionAnalysisAccordionOpen['신랑'],
  wife: positionAnalysisAccordionOpen['와이프'],
  husbandBody: document.getElementById('positionAnalysisAccordionHusbandBody').style.maxHeight !== '0px',
  wifeBody: document.getElementById('positionAnalysisAccordionWifeBody').style.maxHeight !== '0px'
}));
const state4 = (husband, wife) => ({ husband, wife, husbandBody: husband, wifeBody: wife });

test('A. Risk 세부 모달에 과거 하락장 가정 손실 · What-If 영역이 없고 나머지 지표는 그대로다', async ({ page }) => {
  await boot(page);
  await openNormalRiskDetail(page);
  const body = page.locator('#riskDetailModalBody');
  const txt = await body.innerText();
  ['2020년 초 급락 가정 시', '2022년 금리 인상기 하락 가정 시', '손실 예상', '계산할 수 없음 (기준 지수',
    '위험관리 시뮬레이션', '비중을 조절하면', '공격적', '보수적', '조정 시', '추정 시뮬레이션'].forEach((w) => expect(txt, w).not.toContain(w));
  await expect(body.locator('#whatIfSimBox')).toHaveCount(0);
  await expect(body.locator('#whatIfResultBox')).toHaveCount(0);
  await expect(body.locator('[data-scenario-preset]')).toHaveCount(0);
  // 유지되는 내용
  ['포트폴리오 시장 민감도(베타)', '하루 하락 기준선 (VaR 95%)', '하락 변동 대비 수익 (소르티노)', '보유 종목 간 동조성 (상관)',
    '최다 노출 섹터'].forEach((w) => expect(txt, w).toContain(w));
  // 빈 자리 없음: 마지막 요소가 최다 노출 섹터 문장이고, 그 뒤로 높이를 차지하는 요소가 없다.
  const tail = await body.evaluate((el) => {
    const last = el.lastElementChild;
    const r = el.getBoundingClientRect();
    const lr = last.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    return { lastText: last.textContent.trim().slice(0, 30), gapBelowLast: Math.round(r.bottom - pad - lr.bottom), emptyBlocks: [...el.querySelectorAll('div')].filter((d) => !d.textContent.trim() && d.getBoundingClientRect().height > 0).length };
  });
  expect(tail.lastText).toContain('최다 노출 섹터');
  expect(tail.gapBelowLast).toBeLessThanOrEqual(1);
  expect(tail.emptyBlocks).toBe(0);
  // 계산 함수는 남아 있다(화면에서만 숨김).
  expect(await page.evaluate(() => typeof computeScenarioRiskMetrics === 'function' && typeof stressLossValueText === 'function')).toBe(true);
});

/* [기대값 갱신 사유 · PM 지시 2026-09-23 · #3] 「📄 상세 현황 보기」 아코디언이 제목 우측
 * [세부내용] 버튼 + 팝업이 되었다. 확인하는 것은 그대로다 - 이름이 맞고, 열고 닫는 것이 실제로
 * 동작하며, 옛 이름(「세부 내용 보기」)이 되살아나지 않는다. */
test('B. 매크로 브리핑 세부 현황은 제목 우측 [세부내용] 버튼 + 팝업으로 열고 닫는다', async ({ page }) => {
  await boot(page);
  await seedMacro(page);
  const btn = page.locator('#macroDetailBtn');
  await expect(btn).toHaveText('세부내용');
  const sectionText = await page.locator('#macroBriefingSection').innerText();
  expect(sectionText).not.toContain('세부 내용 보기');
  expect(sectionText, '아코디언 문구는 남지 않는다').not.toContain('상세 현황 보기');
  await expect(page.locator('#macroDetailModal')).toBeHidden();
  await btn.click();
  await expect(page.locator('#macroDetailModal')).toBeVisible();
  await expect(page.locator('#macroBriefingDiagnosis')).toContainText('시장 종합 평가');
  await page.locator('#closeMacroDetailBtn').click();
  await expect(page.locator('#macroDetailModal')).toBeHidden();
  // 다시 열어도 그대로 동작한다(리스너 소실 없음).
  await btn.click();
  await expect(page.locator('#macroDetailModal')).toBeVisible();
  await page.locator('#closeMacroDetailBtn').click();
  await expect(page.locator('#macroDetailModal')).toBeHidden();
});

test('C. 신랑/와이프 목표 비중 드롭다운은 서로의 열림 상태를 바꾸지 않는다(4가지 상태)', async ({ page }) => {
  await boot(page);
  await goToPortfolioSettingsTab(page);
  const husband = page.locator('#positionAnalysisAccordionHusbandBtn h3');
  const wife = page.locator('#positionAnalysisAccordionWifeBtn h3');
  expect(await accordionState(page), '① 둘 다 닫힘').toEqual(state4(false, false));
  await husband.click();
  expect(await accordionState(page), '② 신랑만 열림').toEqual(state4(true, false));
  await wife.click();
  expect(await accordionState(page), '④ 둘 다 열림 - 신랑은 그대로').toEqual(state4(true, true));
  await husband.click();
  expect(await accordionState(page), '③ 와이프만 열림 - 와이프는 그대로').toEqual(state4(false, true));
  await wife.click();
  expect(await accordionState(page), '① 둘 다 닫힘').toEqual(state4(false, false));
  await wife.click();
  expect(await accordionState(page), '와이프만 열림 - 신랑은 닫힌 그대로').toEqual(state4(false, true));
});

// [기대값 갱신 사유 · 통합 개선 배치 2026-09-22 · §54-4 · UX-01] 일반계좌 팝업은 이제 "매달 넣을
// 금액 + 연도별 추가 투자"를 함께 다루므로 「투자금 설정」으로 바꿨다(PM 지시문 §11). 절세계좌는
// 이번 변경 범위가 아니고 개념도 달라 「적립설정」 그대로다.
test('D. 일반계좌는 「투자금 설정」 · 절세계좌는 「적립설정」이다', async ({ page }) => {
  await boot(page);
  await goToPortfolioSettingsTab(page);
  await expect(page.locator('#openMonthlyContributionAllocationBtn')).toHaveText('투자금 설정');
  await expect(page.locator('#taxAdvantagedPlanBtn')).toHaveText('적립설정');
  // 기능은 그대로 - 같은 팝업이 열린다(이름만 바뀌었다).
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
});

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`E. ${w}px ${dark ? 'Dark' : 'Light'} - 바뀐 표시가 14px 이상이고 잘리거나 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await seedMacro(page);

      const fit = (loc) => loc.evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        return { fs: parseFloat(win.getComputedStyle(el).fontSize), clipped: el.scrollWidth - el.clientWidth, h: el.getBoundingClientRect().height };
      });
      const macroLabel = await fit(page.locator('#macroDetailBtn span'));
      expect(macroLabel.fs).toBeGreaterThanOrEqual(14);
      expect(macroLabel.clipped).toBeLessThanOrEqual(1);
      /* [PM 지시 2026-09-23 · #3] 이 버튼의 보이는 테두리는 작지만 눌리는 범위는 .detail-btn::after가
       * 44px로 넓힌다(앱의 다른 세부내용 버튼과 같은 방식) - 보이는 높이가 아니라 그 값을 확인한다. */
      const macroTap = await page.locator('#macroDetailBtn').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        return Math.max(el.getBoundingClientRect().height, parseFloat(win.getComputedStyle(el, '::after').height) || 0);
      });
      expect(macroTap).toBeGreaterThanOrEqual(44);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

      await openNormalRiskDetail(page);
      const modal = await page.locator('#riskDetailModalBody').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const nodes = [...el.querySelectorAll('p, span')].filter((n) => n.textContent.trim());
        return { min: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))), clipped: el.scrollWidth - el.clientWidth };
      });
      expect(modal.min).toBeGreaterThanOrEqual(14);
      expect(modal.clipped).toBeLessThanOrEqual(1);
      await page.evaluate(() => closeRiskDetailModal());

      await goToPortfolioSettingsTab(page);
      const plan = await fit(page.locator('#openMonthlyContributionAllocationBtn'));
      expect(plan.fs).toBeGreaterThanOrEqual(14);
      expect(plan.clipped).toBeLessThanOrEqual(1);
      expect(plan.h).toBeGreaterThanOrEqual(44);
      await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
      await page.locator('#positionAnalysisAccordionWifeBtn h3').click();
      expect(await accordionState(page)).toEqual(state4(true, true));
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`F. ${w}px ${dark ? 'Dark' : 'Light'} - 메인 Risk 카드에 계획 확인 안내가 없고 빈 자리 없이 리스크 감지가 이어진다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await openNormalRiskDetail(page);
      await page.evaluate(() => closeRiskDetailModal());
      const card = page.locator('#riskDiagnosisSummary');
      const txt = await card.innerText();
      ['가격 변동 위험', '목표 자산배분과 지금 비중', '포트폴리오 설정에서 보기'].forEach((s) => expect(txt, s).not.toContain(s));
      await expect(card.locator('#riskPlanCheckBtn')).toHaveCount(0);
      // 유지되는 내용: 점수 · 데이터 상태 · 세부내용 버튼 · 진단 문장 · 확인 항목 1~2
      expect(txt).toContain('종합 위험점수');
      expect(txt).toContain('💡 1.');
      await expect(card.locator('#riskDetailBtn')).toBeVisible();
      await expect(page.locator('#riskyAccordionBtn')).toBeVisible();
      await expect(page.locator('#riskyAccordionBtn')).toContainText('리스크 감지');
      // 빈 자리 없음: 카드 안 마지막 요소 아래 여백이 카드 안쪽 여백(padding)과 같고, 구분선만 남은 빈 블록이 없다.
      const tail = await card.evaluate((el) => {
        const box = el.firstElementChild;
        const win = el.ownerDocument.defaultView;
        const last = box.lastElementChild;
        const pad = parseFloat(win.getComputedStyle(box).paddingBottom) || 0;
        return {
          gap: Math.round(box.getBoundingClientRect().bottom - pad - last.getBoundingClientRect().bottom),
          emptyBlocks: [...box.querySelectorAll('div')].filter((d) => !d.textContent.trim() && d.getBoundingClientRect().height > 0).length,
          clipped: el.scrollWidth - el.clientWidth
        };
      });
      expect(tail.gap).toBeLessThanOrEqual(1);
      expect(tail.emptyBlocks).toBe(0);
      expect(tail.clipped).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}
