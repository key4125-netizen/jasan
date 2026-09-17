// E2E-97 [Macro·Risk 용어 정비] 렌더된 Macro/Risk 화면(카드·세부 모달·알림 팝업·종목 상세·지표 상세·툴팁)에
// 정의와 어긋나거나 행동을 권하는 옛 표현이 다시 나오지 않는지 고정한다.
//
// - 계산은 건드리지 않는다: 앱의 실제 렌더 함수에 대표 입력을 넣어 그린 결과(HTML, data-info-tip 포함)만 검사한다.
// - e2e/39(행동 지시 금지 규칙)·e2e/40(Phase 39 표시 계약)과 겹치지 않게, 이 파일은 "용어"만 본다.
// - 외부 시세 비의존: e2e/40과 같은 방식으로 metrics/캐시를 직접 넣는다.
/* global document */
const { test, expect } = require('@playwright/test');

// 화면 어디에도 나오면 안 되는 표현(PM 승인 목록).
const BANNED_TERMS = [
  '변동성(베타)', '널뛰기', '금융위기급', '최대 손실', '공포·탐욕', '관망', '몰빵', '주범',
  '원클릭', '초직관적', '쉬어가기', '버팀목', '재현 시'
];
// PM 승인 문장 안의 부정 표현 - "최대 손실이 아닙니다"는 VaR가 최대 손실이 아니라는 설명이라 허용한다.
const ALLOWED_NEGATIONS = ['최대 손실이 아닙니다'];

function findBanned(html) {
  let text = html;
  ALLOWED_NEGATIONS.forEach((a) => { text = text.split(a).join(''); });
  return BANNED_TERMS.filter((w) => text.includes(w));
}

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function' && typeof buildMacroDetailBodyHtml === 'function');
}

// 모든 분기가 한 번씩 그려지도록 Risk 입력을 바꿔 가며 화면 HTML을 모은다.
async function collectRiskHtml(page) {
  return page.evaluate(() => {
    const out = [];
    const base = (maxKey, over) => {
      const subScores = { concentration: 20, volatility: 20, drawdown: 20, market: 20, correlation: 20, technical: 20, [maxKey]: 92 };
      return Object.assign({
        totalCur: 10000000, holdings: [], missingCount: 1,
        topWeight: 40, topHolding: { name: '테스트종목', ticker: 'TEST.KS', benchmarkKey: 'KOSPI', riskContributionPct: 45 },
        hhi: 0.3, portfolioBeta: 0.7, portfolioVolatilityPct: 18.5, portfolioMDDPct: -21,
        var95Pct: -2.8, cvarPct: -4.1, var95KRW: -280000, cvarKRW: -410000, sortino: 0.8,
        weightedAvgCorrelation: 0.74, topCorrelation: 0.8, topCorrelationPair: ['가종목', '나종목'],
        stressLossKRW: -3000000, stressLossPct: -30, stressLossKRW2022: -2500000, stressLossPct2022: -25,
        sectorExposure: { topSector: '반도체', topSectorWeight: 55, unclassifiedWeightPct: 0, sectorTotals: {} },
        portfolioVolatilityShortPct: 30, volatilitySpike: true,
        subScores, riskScore: computeCompositeRiskScore(subScores),
        dataConfidence: { score: 70, reasons: ['수급 지표는 실제 외국인/기관 매매 데이터가 아닌 거래량 기반 추정치'] }
      }, over);
    };
    const cases = [
      base('concentration', { topHolding: { name: '테스트종목', ticker: 'TEST.KS', riskContributionPct: null } }),
      base('concentration'), base('volatility'), base('drawdown'), base('drawdown', { var95Pct: null }),
      base('market', { portfolioBeta: 0.7 }), base('market', { portfolioBeta: 1.3 }), base('correlation'), base('technical')
    ];
    cases.forEach((m) => {
      state.advancedRiskMetrics = m;
      renderRiskDiagnosisSummary();
      out.push(document.getElementById('riskDiagnosisSummary').innerHTML);
      openRiskDetailModal();
      out.push(document.getElementById('riskDetailModalBody').innerHTML);
      closeRiskDetailModal();
      openRiskAlertModal();
      out.push(document.getElementById('riskAlertModal').innerHTML);
      closeRiskAlertModal();
    });
    // [Risk 정책 P-2 · P-5 · v252] 데이터 부족 안내와 스트레스 계산 불가 문구(요약 카드 · 세부 모달).
    // 알림 팝업은 연결되지 않은 기능(P-9)이라 이 두 결과로는 그리지 않는다.
    [
      base('concentration', {
        dataSufficiency: { status: 'INSUFFICIENT', commonReturnCount: 87, required: 120 },
        subScores: null, riskScore: null, dataConfidence: null
      }),
      base('market', { portfolioBeta: null, stressLossKRW: null, stressLossPct: null, stressLossKRW2022: null, stressLossPct2022: null })
    ].forEach((m) => {
      state.advancedRiskMetrics = m;
      renderRiskDiagnosisSummary();
      out.push(document.getElementById('riskDiagnosisSummary').innerHTML);
      openRiskDetailModal();
      out.push(document.getElementById('riskDetailModalBody').innerHTML);
      closeRiskDetailModal();
    });
    // 종목 상세 Risk 섹션 - RSI/추세/거래량 신호의 모든 상태
    const h = (over) => Object.assign({
      ticker: 'A.KS', name: 'A', hasData: true, beta: 0.9, sortino: 1.2, week52DrawdownPct: -12, riskContributionPct: 20,
      rsi14: 50, rsiState: '적정', trendLabel: '정배열(상승추세)', flowSignal: 'neutral', volumeSpike: false
    }, over);
    [
      h({}), h({ rsi14: 75, rsiState: '과열' }), h({ rsi14: 25, rsiState: '과매도', trendLabel: '역배열(하락추세)' }),
      h({ trendLabel: '혼조(추세 불분명)', flowSignal: 'outflow' }), h({ flowSignal: 'inflow' }), h({ flowSignal: 'quiet' }),
      h({ week52DrawdownPct: -40 }), h({ volumeSpike: true }), h({ hasData: false })
    ].forEach((x, i) => out.push(buildIndividualRiskDetailHtml(x, i === 1 ? 30 : 10)));
    // 종목 분석(보유 상세·종목 분석 모달 공용)
    const a = (over) => Object.assign({
      ticker: 'A.KS', name: 'A', currentPrice: 10000, changePercent: 1, recentHigh: 12000, recentLow: 9000, mdd: -18,
      rsiState: '적정', trendLabel: '정배열(상승추세)', week52DrawdownPct: -5, bollinger: { pctB: 0.5 }
    }, over);
    [
      a({}), a({ rsiState: '과열', bollinger: { pctB: 1.1 } }), a({ rsiState: '과매도', bollinger: { pctB: -0.1 } }),
      a({ trendLabel: '역배열(하락추세)', bollinger: { pctB: 0.85 } }), a({ trendLabel: '혼조(추세 불분명)', bollinger: { pctB: 0.1 } })
    ].forEach((x) => out.push(renderStockAnalysisReportBody(x, null)));
    return out;
  });
}

async function collectMacroHtml(page) {
  return page.evaluate(() => {
    const out = [];
    const now = Date.now();
    const cache = (price, changePercent) => ({ price, changePercent, fetchedAt: now });
    const idx = (price, changePercent) => ({ price, changePercent, fetchedAt: now });
    const scenarios = [
      { VIX: cache(35, 5), UST10Y: cache(4.1, 0.2), GOLD: cache(2600, 0.1), USDX: cache(101, 0.1), DOW: cache(40000, 0.1), kospi: -1 },
      { VIX: cache(22, 5), UST10Y: cache(4.1, 0.2), GOLD: cache(2600, 2), USDX: cache(101, 0.1), DOW: cache(40000, 0.1), kospi: -1 },
      { VIX: cache(15, 1), UST10Y: cache(4.1, 0.2), GOLD: cache(2600, 0.1), USDX: cache(101, 0.8), DOW: cache(40000, 0.1), kospi: 0.5 },
      { VIX: cache(15, 1), UST10Y: cache(4.1, 0.2), GOLD: cache(2600, 0.1), USDX: cache(101, -0.8), DOW: cache(40000, 0.1), kospi: 0.5 },
      { VIX: cache(15, 1), UST10Y: cache(4.1, -0.2), GOLD: cache(2600, 0.1), USDX: cache(101, 0), DOW: cache(40000, 0.1), kospi: 0.5 },
      { VIX: cache(25, 1), UST10Y: cache(4.1, 0), GOLD: cache(2600, 0.1), USDX: cache(101, 0), DOW: cache(40000, 0.1), kospi: -1 }
    ];
    scenarios.forEach((sc) => {
      const { kospi, ...macro } = sc;
      state.macroIndicatorCache = macro;
      state.marketIndexCache = {
        [INDEX_TICKERS.KOSPI]: idx(2700, kospi), [INDEX_TICKERS.KOSDAQ]: idx(800, 0.1),
        [INDEX_TICKERS.SP500]: idx(5900, 0.1), [INDEX_TICKERS.NASDAQ]: idx(19000, 0.1)
      };
      renderMacroBriefing();
      out.push(document.getElementById('macroBriefingGrid').innerHTML);
      out.push(document.getElementById('macroBriefingDiagnosis').innerHTML);
    });
    Object.keys(MACRO_KEY_TICKERS).forEach((k) => out.push(buildMacroDetailBodyHtml(k)));
    return out;
  });
}

test('1. Risk 카드·세부 모달·알림 팝업·종목 상세에 금지 표현이 없다(툴팁 포함)', async ({ page }) => {
  await boot(page);
  const html = (await collectRiskHtml(page)).join('\n');
  expect(findBanned(html)).toEqual([]);
  // 시장 민감도 진단은 베타가 1 미만일 때도 "더 크게"라고 말하지 않는다.
  expect(html).not.toContain('배 더 크게');
});

test('2. Macro 타일·세부 내용·지표 상세에 금지 표현이 없다', async ({ page }) => {
  await boot(page);
  const html = (await collectMacroHtml(page)).join('\n');
  expect(findBanned(html)).toEqual([]);
  ['강달러 국면', '약달러 국면', '공포심리', '관전 포인트', '대응 팁'].forEach((w) => expect(html).not.toContain(w));
});

test('3. 통일된 이름이 실제 화면에 나온다', async ({ page }) => {
  await boot(page);
  const risk = (await collectRiskHtml(page)).join('\n');
  [
    '하루 하락 기준선 (VaR 95%)', '하락이 컸던 날 평균 (CVaR 95%)', '포트폴리오 시장 민감도(베타)', '⚡ 시장 민감도(베타)',
    '보유 종목 간 동조성 (상관)', '하락 변동 대비 수익 (소르티노)', '52주 고점 대비 현재 하락률', '위험 기여도',
    '🎯 집중도', '🔥 단기 과열·거래량(추정)',
    '거래량 신호(추정)', '단기 과열(RSI)', '이동평균 추세', '💡 함께 확인할 점', '최근 3개월 최고가', '최근 3개월 최저가',
    '최대낙폭(MDD, 1년)', '🎯 참고: 한 종목·한 자산군의 비중이 크면',
    '종합 위험점수 계산 불가 (데이터 부족)'
  ].forEach((label) => expect(risk, label).toContain(label));
  // [v253] 세부 모달의 과거 하락장 가정 손실 카드는 화면에 그리지 않는다(e2e/99). 문구 기준은 표시 문구 함수로 확인한다.
  expect(await page.evaluate(() => stressLossValueText(null, null))).toBe('계산할 수 없음 (기준 지수나 시장 민감도를 확인할 수 없는 종목 포함)');
  const macro = (await collectMacroHtml(page)).join('\n');
  ['VIX(변동성)', '🧭 함께 볼 점', '흔히 &#39;공포지수&#39;라고 불려요'].forEach((label) => expect(macro, label).toContain(label));
  // 지표 정보 표의 VIX 이름(팝업 문장 등에서 쓰는 값)도 변동성 지수다.
  expect(await page.evaluate(() => MACRO_INDICATOR_INFO.vix.label)).toBe('VIX (변동성 지수)');
});

test('4. 알림 팝업 버튼은 이름만 바뀌고 같은 곳(포트폴리오 설정)으로 이동한다', async ({ page }) => {
  await boot(page);
  const btn = page.locator('#riskAlertRebalanceBtn');
  await expect(btn).toHaveText('⚙ 포트폴리오 설정으로 이동');
  await page.evaluate(() => {
    const subScores = { concentration: 80, volatility: 60, drawdown: 60, market: 60, correlation: 60, technical: 60 };
    state.advancedRiskMetrics = {
      totalCur: 1, holdings: [], missingCount: 0, topWeight: 40, topHolding: { name: 'T', ticker: 'T.KS', riskContributionPct: 40 },
      portfolioBeta: 1, portfolioVolatilityPct: 20, portfolioMDDPct: -20, var95Pct: -2, cvarPct: -3, var95KRW: -1, cvarKRW: -1,
      weightedAvgCorrelation: 0.5, topCorrelationPair: null, sectorExposure: { topSector: null, topSectorWeight: 0, unclassifiedWeightPct: 0 },
      subScores, riskScore: computeCompositeRiskScore(subScores), dataConfidence: { score: 90, reasons: [] }
    };
    openRiskAlertModal();
  });
  await btn.click();
  await expect(page.locator('#riskAlertModal')).toBeHidden();
  // 기존 동작(switchTab('rebalance') + 목표 비중 서브탭)이 그대로인지 - 탭 패널 표시로 확인한다.
  await expect(page.locator('#tabPanelRebalance')).toBeVisible();
});
