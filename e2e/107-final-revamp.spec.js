// E2E-107 [최종 개편 · checklist §46] 베타 기준 참고 비중 · 매크로 티커 직접 검색 · 지표 단위 · 환율 실패 안내 · 화면 명칭.
//   A. 베타 기준 참고 비중(REF-01~11) - 실제 목표 비중 팝업 → '주식' 종목 선택 팝업에서 확인한다.
//      베타는 Risk 엔진 결과 모양으로 합성해 넣는다(네트워크 없음 · 실제 사용자 데이터 없음).
//   B. 매크로 티커 직접 검색(MAC-DS-01) - 종목 분석을 실행하지 않고 매크로 타일과 같은 지표 팝업을 연다.
//   C. 지표 팝업 단위(MAC-UNIT-01) - 금리 % · 원/달러 원 · 지수값 · 금 시세 $.
//   D. 환율 실패 안내(TXT-46-1) · 화면 명칭(TXT-46-2).
/* global document, window */
const { test, expect } = require('@playwright/test');

async function boot(page, w) {
  if (w) await page.setViewportSize({ width: w, height: 812 });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof computeBetaReferencePlan === 'function');
  // 부팅 시세 갱신(→ Risk 계산)이 끝난 뒤에 합성 베타를 넣어야 덮어써지지 않는다.
  await page.waitForFunction(() => lastRefreshAt > 0);
}

// 신랑 국내 목표 = '주식' 항목(선택 종목) + 나머지 현금. risk = Risk 엔진 결과 모양(null이면 결과 없음).
async function openStockAllocation(page, stocks, risk) {
  await page.evaluate(({ stocks, risk }) => {
    const stockPct = stocks.reduce((s, x) => s + x.pct, 0);
    state.rebalance['신랑'].domestic = { '국내': 100, '해외': 0 };
    state.rebalance['신랑'].targets = {
      '국내': [
        { type: 'category', category: '주식', pct: stockPct, selectedStocks: stocks.map((x) => ({ ticker: x.ticker, name: x.name || x.ticker, pct: x.pct })) },
        { type: 'category', category: '현금', pct: Math.round((100 - stockPct) * 10) / 10 }
      ],
      '해외': []
    };
    state.advancedRiskMetrics = risk;
    openRebalanceTargetModal('신랑');
    document.querySelector('#rebalanceTargetModal button[data-rtm-stock-search]').click();
  }, { stocks, risk });
  await expect(page.locator('#stockAllocationModal')).toBeVisible();
}
const H = (rows) => ({ holdings: rows.map(([ticker, beta, betaStatus]) => ({ ticker, beta, betaStatus: betaStatus || (typeof beta === 'number' ? 'OK' : 'INSUFFICIENT_COMMON_DATES') })) });
const draft = (page) => page.evaluate(() => { const t = getStockAllocationTarget(); return { pcts: t.selectedStocks.map((s) => s.pct), total: Math.round(t.pct * 1000) / 1000 }; });
const view = (page) => page.evaluate(() => ({
  badges: [...document.querySelectorAll('#stockAllocationSelectedList [data-beta-ref-badge]')].map((e) => e.textContent.trim()),
  unavailable: [...document.querySelectorAll('#stockAllocationSelectedList [data-beta-ref-unavailable]')].map((e) => e.textContent.trim()),
  note: document.getElementById('stockAllocationBetaNote').classList.contains('hidden') ? null : document.getElementById('stockAllocationBetaNote').textContent,
  allVisible: !document.getElementById('stockAllocationApplyAiAllBtn').classList.contains('hidden'),
  allDisabled: document.getElementById('stockAllocationApplyAiAllBtn').disabled,
  text: document.getElementById('stockAllocationModal').innerText
}));

test('A-1. 모든 베타 정상 - 배지 3개 · 전체 적용 후 주식 합계 30 그대로(부모 합계 100%)', async ({ page }) => {
  await boot(page);
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 10 }, { ticker: 'MSFT', pct: 10 }, { ticker: 'KO', pct: 10 }], H([['AAPL', 0.8], ['MSFT', 1.2], ['KO', 1.5]]));
  let v = await view(page);
  expect(v.badges.map((b) => b.match(/참고: ([\d.]+)%/)[1])).toEqual(['13.6', '9.1', '7.3']);
  expect(v.allVisible && !v.allDisabled).toBe(true);
  expect(v.note).toBeNull();
  await page.locator('#stockAllocationApplyAiAllBtn').click();
  expect(await draft(page)).toEqual({ pcts: [13.6, 9.1, 7.3], total: 30 });
  v = await view(page);
  expect(v.badges.every((b) => b.includes('현재와 같음'))).toBe(true);
  await page.locator('#closeStockAllocationModalBtn').click();
  await expect(page.locator('#rtmSumDomestic')).toHaveText('합계 100%');
});

test('A-2. 일부 미확정 - 미확정 종목은 "참고 비중 계산 불가"와 사유, 개별 적용해도 합계 · 미확정 비중 그대로', async ({ page }) => {
  await boot(page);
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 10 }, { ticker: 'MSFT', pct: 20 }, { ticker: 'ZZZZ', pct: 10 }],
    H([['AAPL', 0.5], ['MSFT', 1.5]]));
  const v = await view(page);
  expect(v.badges).toHaveLength(2);
  expect(v.unavailable).toHaveLength(1);
  expect(v.unavailable[0]).toContain('참고 비중 계산 불가');
  expect(v.unavailable[0]).toContain('보유하지 않은 종목');
  expect(v.note).toContain('1개 종목은 현재 비중을 그대로 두고, 나머지 30%만');
  // v260은 한 종목만 바꿔 합계가 달라졌다(40 → 다른 값). 이제 합계 40 · 미확정 10 그대로.
  await page.locator('button[data-stock-alloc-apply-ai][data-i="1"]').click();
  expect(await draft(page)).toEqual({ pcts: [22.5, 7.5, 10], total: 40 });
});

test('A-3. Risk 결과 없음 - 배지 없음 · 전체 적용 비활성 · 사유 문장(균등 배분을 베타 기준이라고 하지 않음)', async ({ page }) => {
  await boot(page);
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 20 }, { ticker: 'MSFT', pct: 10 }], null);
  const v = await view(page);
  expect(v.badges).toHaveLength(0);
  expect(v.allVisible).toBe(true);
  expect(v.allDisabled).toBe(true);
  expect(v.note).toContain('베타 기준 참고 비중을 계산할 수 없습니다');
  expect(v.note).toContain('시장 민감도 자료가 아직 준비되지 않았습니다');
  expect(v.text).not.toMatch(/베타 기준 참고: 15%/);
  expect(v.text).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/);
  await page.locator('#stockAllocationApplyAiAllBtn').click({ force: true });
  expect(await draft(page)).toEqual({ pcts: [20, 10], total: 30 });
});

test('A-4. 확인 종목 1개 · 나눌 비중 없음 - 계산 불가, 비중 변화 없음', async ({ page }) => {
  await boot(page);
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 20 }, { ticker: 'MSFT', pct: 10 }], H([['AAPL', 0.9], ['MSFT', null, 'BENCHMARK_UNRESOLVED']]));
  let v = await view(page);
  expect(v.allDisabled).toBe(true);
  expect(v.note).toContain('확인한 종목이 1개뿐이라');
  expect(v.unavailable.join(' ')).toContain('비교할 기준 지수가 정해지지 않아');
  await page.locator('#closeStockAllocationModalBtn').click();
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 0 }, { ticker: 'MSFT', pct: 0 }, { ticker: 'KO', pct: 30 }], H([['AAPL', 0.9], ['MSFT', 1.1], ['KO', -0.2]]));
  v = await view(page);
  expect(v.allDisabled).toBe(true);
  expect(v.note).toContain('나눌 비중이 없습니다');
  expect(v.unavailable.join(' ')).toContain('0 이하');
  expect(v.badges).toHaveLength(0);
});

test('A-5. 반올림 잔여 - 10%를 셋으로 나누면 3.4 · 3.3 · 3.3(합계 10.0, 부모 합계 100%)', async ({ page }) => {
  await boot(page);
  await openStockAllocation(page, [{ ticker: 'AAPL', pct: 4 }, { ticker: 'MSFT', pct: 3 }, { ticker: 'KO', pct: 3 }], H([['AAPL', 1], ['MSFT', 1], ['KO', 1]]));
  await page.locator('#stockAllocationApplyAiAllBtn').click();
  expect(await draft(page)).toEqual({ pcts: [3.4, 3.3, 3.3], total: 10 });
  await page.locator('#closeStockAllocationModalBtn').click();
  await expect(page.locator('#rtmSumDomestic')).toHaveText('합계 100%');
});

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`A-6. ${w}px ${dark ? 'Dark' : 'Light'} - 배지 · 계산 불가 문구 14px 이상 · 넘침 없음`, async ({ page }) => {
      await boot(page, w);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await openStockAllocation(page, [{ ticker: 'AAPL', pct: 10, name: '애플' }, { ticker: 'MSFT', pct: 20, name: '마이크로소프트' }, { ticker: 'ZZZZ', pct: 10, name: '목표만 지정한 종목' }], H([['AAPL', 0.5], ['MSFT', 1.5]]));
      const r = await page.evaluate(() => {
        const els = [...document.querySelectorAll('#stockAllocationSelectedList [data-beta-ref-badge], #stockAllocationSelectedList [data-beta-ref-unavailable], #stockAllocationBetaNote')];
        const win = document.defaultView;
        const card = document.querySelector('#stockAllocationModal .modal-anim');
        return { sizes: els.map((e) => parseFloat(win.getComputedStyle(e).fontSize)), clipped: els.map((e) => e.scrollWidth - e.clientWidth), cardOverflow: card.scrollWidth - card.clientWidth, count: els.length };
      });
      expect(r.count).toBe(4);
      r.sizes.forEach((x) => expect(x).toBeGreaterThanOrEqual(14));
      r.clipped.forEach((x) => expect(x).toBeLessThanOrEqual(1));
      expect(r.cardOverflow).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}

// ── B · C. 매크로 티커 직접 검색 · 단위 ───────────────────────────────────────────
const MACROS = [
  { ticker: '^TNX', name: '美 10년물 금리', must: /MA5: 4\.2\d?%/, not: /\$|원/ },
  { ticker: 'KRW=X', name: '원/달러', must: /MA5: 1,3\d\d(\.\d)?원/, not: /\$/ },
  { ticker: '^KS11', name: '코스피', must: /MA5: [\d,]+(\.\d)?(?!\d)/, not: /\$|원|%/ },
  { ticker: '^VIX', name: 'VIX(변동성)', must: /MA5: [\d,]+(\.\d)?(?!\d)/, not: /\$|원|%/ },
  { ticker: 'GC=F', name: '금 시세', must: /MA5: \$[\d,]+(\.\d{1,2})?/, not: /원/ },
  { ticker: 'DX-Y.NYB', name: '달러인덱스', must: /MA5: [\d,]+(\.\d)?(?!\d)/, not: /\$|원|%/ }
];
const BASE = { '^TNX': 4.2, 'KRW=X': 1350, '^KS11': 2600, '^VIX': 15, 'GC=F': 2400, 'DX-Y.NYB': 104 };

test('B · C. 매크로 티커 6종 직접 입력 - 종목 분석 없이 지표 팝업, 지표별 단위($는 금 시세만)', async ({ page }) => {
  await boot(page);
  await page.evaluate((BASE) => {
    // 차트 시세는 합성(네트워크 없음) - 값 · 단위 표기만 본다.
    // 종목 분석 리포트를 그렸는지 센다(지표 팝업도 3개월 고저 카드용으로 analyzeTickerForModal을 부르므로 그건 세지 않는다).
    window.__analyzeCalls = 0;
    const orig = renderStockAnalysisReportMain;
    window.renderStockAnalysisReportMain = (...a) => { window.__analyzeCalls += 1; return orig(...a); };
    window.fetchDailyHistory = async (ticker) => {
      const base = BASE[ticker] || 100;
      const start = Date.UTC(2026, 0, 1);
      return Array.from({ length: 150 }, (_, i) => {
        const c = base * (1 + 0.001 * Math.sin(i / 5));
        return { date: new Date(start + i * 86400000), open: c, high: c * 1.001, low: c * 0.999, close: c };
      });
    };
  }, BASE);
  for (const m of MACROS) {
    await page.evaluate(() => openStockAnalysisModal());
    await page.locator('#stockAnalysisTickerInput').fill(m.ticker);
    await page.locator('#stockAnalysisSearchBtn').click();
    await expect(page.locator('#assetDetailModal'), m.ticker).toBeVisible();
    await expect(page.locator('#assetDetailName')).toHaveText(m.name);
    await expect(page.locator('#assetDetailMaLegend')).toContainText('MA5');
    const legend = await page.locator('#assetDetailMaLegend').innerText();
    expect(legend, m.ticker).toMatch(m.must);
    expect(legend, m.ticker).not.toMatch(m.not);
    expect(await page.locator('#stockAnalysisResult').isHidden(), '종목 분석 결과를 만들지 않는다').toBe(true);
    // 지표 팝업을 닫으면 검색 팝업으로 돌아온다.
    await page.locator('#closeAssetDetailModalBtn').click();
    await expect(page.locator('#assetDetailModal')).toBeHidden();
    await expect(page.locator('#stockAnalysisModal')).toBeVisible();
    await page.evaluate(() => closeStockAnalysisModal());
  }
  expect(await page.evaluate(() => window.__analyzeCalls)).toBe(0);
  // 종목 티커는 예전처럼 종목 분석 경로로 간다(E2E는 외부 시세가 막혀 있어 "가격 이력을 찾을 수 없습니다" 안내로 끝난다).
  await page.evaluate(() => openStockAnalysisModal());
  await page.locator('#stockAnalysisTickerInput').fill('AAPL');
  await page.locator('#stockAnalysisSearchBtn').click();
  await expect(page.locator('#stockAnalysisErrorMsg')).toContainText('가격 이력', { timeout: 20000 });
  await expect(page.locator('#assetDetailModal')).toBeHidden();
});

test('C-2. 매크로 타일 이름 · 값 표기는 그대로(이름 표를 한 곳으로 모았을 뿐)', async ({ page }) => {
  await boot(page);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#macroBriefingSection [data-open-stock-detail]')].map((e) => [e.dataset.ticker, e.dataset.name]));
  expect(labels).toEqual([
    ['^VIX', 'VIX(변동성)'], ['KRW=X', '원/달러'], ['^TNX', '美 10년물 금리'], ['GC=F', '금 시세'], ['DX-Y.NYB', '달러인덱스'],
    ['^KS11', '코스피'], ['^KQ11', '코스닥'], ['^GSPC', 'S&P 500'], ['^IXIC', '나스닥'], ['^DJI', '다우']
  ]);
});

test('D. 환율 실패 안내는 쉬운 말 · 화면 명칭 4개', async ({ page }) => {
  await page.goto('/');
  // E2E는 외부 호출이 막혀 있어 부팅 때 환율 조회가 실패한다(Phase 47-G).
  await expect(page.getByText(/환율을 불러오지 못해 기존 환율\([\d,.]+원\)을 그대로 사용합니다\. 상단 환율 입력란에서 직접 수정할 수 있습니다\./).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('환율 API 연결 실패')).toHaveCount(0);
  await expect(page.getByText('금융자산 오늘 평가손익', { exact: true })).toBeVisible();
  await expect(page.getByText('금융자산 전체 평가손익', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '위험 관리', exact: true })).toHaveCount(1);
  expect(await page.locator('#riskDetailModal h3').first().textContent()).toContain('📊 위험 세부내용');
});
