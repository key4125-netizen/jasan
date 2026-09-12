// E2E-79 [화면 단순화] 이미 화면의 숫자와 구조로 알 수 있는 것을 설명문/별도 카드/팝업으로
// 한 번 더 보여주던 부분을 걷어냈다. 걷어낸 것과 반드시 남아야 하는 것을 함께 고정한다.
//
//   ① 총금융자산평가손익 - [세부내용] 버튼과 그 팝업, 카드 안 설명문 두 줄을 없앴다.
//      핵심 숫자(평가손익/수익률/금융자산 평가금액/소유자별/자산군별 chip)는 그대로 남는다.
//   ② 국내·해외 자산 Top 5 두 카드를 없앴다. 국내/해외 비중 차트와 국내외 필터는 그대로 남는다.
//   ③ 시장 현황 & 매크로 브리핑 - 지수 타일은 대시보드 진입 직후부터 보이고(v234),
//      그 아래 해석(시장 종합 평가 등)만 한 번 더 접는다. 그 아래 RISK 관리 카드는 손대지 않았다.
//      "실제로 보이는가"는 조상 클리핑까지 반영해서 재야 한다 - e2e/80의 visibleHeight 참고.
//
// 계산은 하나도 바꾸지 않았다 - 값이 그대로인지도 함께 확인한다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function');
  page.on('dialog', (d) => d.accept());
}

const ASSET = (id, name, cat, owner, dom, cur) => ({
  id, ticker: 'E79' + id, owner, accountType: '일반계좌', category: cat, categorySource: 'user',
  name, isDomestic: dom, currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: cur,
  positionSource: 'manual', createdAt: 1000, updatedAt: 1000,
});

function seed(page) {
  return page.locator('body').evaluate((el, assets) => {
    state.assets = assets;
    state.transactions = [];
    state.exchangeRate = 1400;
    persistAssets(true); persistTransactions();
    renderAll();
  }, [
    ASSET('a1', 'E79_국내주식', '주식', '신랑', '국내', 1200),
    ASSET('a2', 'E79_해외ETF', 'ETF', '와이프', '해외', 1500),
    ASSET('a3', 'E79_채권', '채권', '신랑', '국내', 1100),
  ]);
}

/* ── ① 총금융자산평가손익 ─────────────────────────────────────────────── */

test('A. 세부내용 버튼과 그 팝업이 사라지고, 카드의 핵심 숫자는 그대로다', async ({ page }) => {
  await open(page);
  await seed(page);

  // 버튼도 팝업도 DOM에 존재하지 않는다 - 숨김이 아니라 제거다.
  await expect(page.locator('#kpiTotalProfitDetailBtn')).toHaveCount(0);
  await expect(page.locator('#totalProfitModal')).toHaveCount(0);

  // 핵심 정보는 전부 남아 있다.
  await expect(page.locator('#kpiTotalProfit')).toBeVisible();
  await expect(page.locator('#kpiTotalProfitRate')).toBeVisible();
  await expect(page.locator('#kpiFinancialValueInline')).toBeVisible();
  await expect(page.locator('#kpiTotalRealizedBadge')).toHaveCount(1);
  await expect(page.locator('#kpiTotalProfitOwnerBreakdown')).toHaveCount(1);
  await expect(page.locator('#kpiTotalProfitBreakdown')).toHaveCount(1);
  await expect(page.getByText('매입원가 기준')).toBeVisible();

  // 계산값 - 매입 30,000 / 평가 38,000 -> +8,000원 (+26.67%)
  const v = await page.locator('body').evaluate((body) => ({
    profit: body.ownerDocument.getElementById('kpiTotalProfit').textContent.trim(),
    rate: body.ownerDocument.getElementById('kpiTotalProfitRate').textContent.trim(),
    financial: body.ownerDocument.getElementById('kpiFinancialValueInline').textContent.trim(),
  }));
  expect(v.profit).toBe('+8,000원');
  expect(v.rate).toBe('+26.67%');
  expect(v.financial).toBe('38,000원');
});

test('B. 카드 안 설명문 두 줄이 사라졌다', async ({ page }) => {
  await open(page);
  await seed(page);
  const card = await page.locator('#kpiTotalProfit').evaluate((el) => el.closest('div').innerText);
  expect(card).not.toContain('팔아서 확정한 손익은');
  expect(card).not.toContain('부동산을 포함한 전체 자산은');
  // 대신 남아야 할 것
  expect(card).toContain('금융자산 평가금액');
});

/* ── ② 국내/해외 Top 5 ────────────────────────────────────────────────── */

test('C. 국내/해외 자산 Top 5 카드가 사라지고, 국내외 차트와 필터는 남는다', async ({ page }) => {
  await open(page);
  await seed(page);

  for (const id of ['topHoldingsDomesticToggleBtn', 'topHoldingsForeignToggleBtn',
    'topHoldingsDomestic', 'topHoldingsForeign', 'topHoldingsDomesticBody', 'topHoldingsForeignBody']) {
    await expect(page.locator(`#${id}`), id).toHaveCount(0);
  }
  await expect(page.getByText('국내 자산 Top 5')).toHaveCount(0);
  await expect(page.getByText('해외 자산 Top 5')).toHaveCount(0);

  // 국내/해외 비중 차트와 국내외 보기 방식은 그대로다.
  await page.locator('[data-tab="investmentDetail"]').click();
  await expect(page.locator('#domesticChart')).toHaveCount(1);
  await expect(page.locator('#assetViewSegmented .asset-view-btn[data-view="domestic"]')).toHaveCount(1);
  await page.locator('#assetViewSegmented .asset-view-btn[data-view="domestic"]').click();
  const groups = await page.locator('#assetTableBody [data-group-toggle]').evaluateAll((els) => els.map((e) => e.dataset.groupKey));
  expect(groups).toEqual(['해외', '국내']);
});

/* ── ③ 매크로 브리핑 ──────────────────────────────────────────────────── */

test('D. 지수는 진입 직후부터 보이고, 해석만 따로 접힌다', async ({ page }) => {
  await open(page);
  await seed(page);

  // [v234] 요소 자신의 높이가 아니라 "조상이 잘라낸 뒤 실제로 남는 높이"를 잰다 - 예전 vis()는
  // 자기 높이만 봐서, 부모가 통째로 잘라내 아무것도 안 보이는 상태를 통과시켰다.
  const read = () => page.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const visibleH = (id) => {
      const el = doc.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      let top = r.top, bottom = r.bottom;
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        if (doc.defaultView.getComputedStyle(p).overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
      }
      return Math.max(0, Math.round(bottom - top));
    };
    return {
      gridExists: !!doc.getElementById('macroBriefingGrid'),
      gridVisibleH: visibleH('macroBriefingGrid'),
      diagnosisVisibleH: visibleH('macroBriefingDiagnosis'),
      toggleExists: !!doc.getElementById('macroDiagnosisToggleBtn'),
    };
  });

  // 기본: 아무것도 누르지 않아도 지수 타일이 보이고, 해석만 접혀 있다.
  let r = await read();
  expect(r.gridExists).toBe(true);
  expect(r.gridVisibleH, '진입 직후부터 지수 타일이 보인다').toBeGreaterThan(0);
  expect(r.toggleExists, '해석 접기 버튼이 있다').toBe(true);
  expect(r.diagnosisVisibleH, '해석은 처음엔 접혀 있다').toBe(0);

  // 해석을 펼쳐도 지수는 계속 보인다.
  await page.locator('#macroDiagnosisToggleBtn').click();
  await page.waitForTimeout(900);
  r = await read();
  expect(r.gridVisibleH, '해석을 펼쳐도 지수는 계속 보인다').toBeGreaterThan(0);
  expect(r.diagnosisVisibleH, '해석이 실제로 펼쳐진다').toBeGreaterThan(0);
  await expect(page.locator('#macroBriefingDiagnosis')).toContainText('시장 종합 평가');

  // 다시 접어도 지수는 그대로다.
  await page.locator('#macroDiagnosisToggleBtn').click();
  await page.waitForTimeout(900);
  r = await read();
  expect(r.gridVisibleH).toBeGreaterThan(0);
  expect(r.diagnosisVisibleH).toBe(0);
});

test('E. 그 아래 RISK 관리 카드는 그대로 있다', async ({ page }) => {
  await open(page);
  await seed(page);
  await expect(page.locator('#macroBriefingSection')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'RISK 관리' })).toHaveCount(1);
});

/* ── 반응형 ───────────────────────────────────────────────────────────── */

for (const scheme of ['light', 'dark']) {
  test(`F. 375px ${scheme}에서 해석 토글이 44px·14px을 지키고 가로 overflow가 없다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await seed(page);
    await page.locator('body').evaluate((el, dark) => {
      el.ownerDocument.documentElement.classList.toggle('dark', dark);
    }, scheme === 'dark');
    // [v234] 브리핑은 기본 펼침이라 해석만 연다.
    await page.locator('#macroDiagnosisToggleBtn').click();
    await page.waitForTimeout(900);

    const m = await page.locator('#macroDiagnosisToggleBtn').evaluate((btn) => {
      const win = btn.ownerDocument.defaultView;
      const span = btn.querySelector('span');
      return {
        height: Math.round(btn.getBoundingClientRect().height),
        font: parseFloat(win.getComputedStyle(span).fontSize),
        clipped: span.scrollWidth > span.clientWidth + 1,
        pageOverflow: btn.ownerDocument.documentElement.scrollWidth > btn.ownerDocument.documentElement.clientWidth,
      };
    });
    expect(m.height).toBeGreaterThanOrEqual(44);
    expect(m.font).toBeGreaterThanOrEqual(14);
    expect(m.clipped).toBe(false);
    expect(m.pageOverflow).toBe(false);
  });
}

/* ── ④ 「수익률 직접 조정(고급)」 진입 위치 이동 ──────────────────────────
 * 미래예측 탭의 시나리오 안내문 아래 작은 회색 링크였던 것을, 포트폴리오 탭의
 * "전체 포지션별 목표비중 분석"과 "종목별 실행 가이드" 사이로 옮겼다.
 * 기능이 아니라 진입 위치만 바뀌었다 - 같은 id, 같은 핸들러, 같은 팝업이다. */

async function openRebalanceTab(page) {
  await page.locator('[data-tab="rebalance"]').click();
  await expect(page.locator('#rebalanceSubTarget')).toBeVisible();
}

test('G. 새 버튼이 포지션별 비중 카드와 종목별 실행 가이드 카드 사이에 딱 하나 있다', async ({ page }) => {
  await open(page);
  await seed(page);
  await openRebalanceTab(page);

  // 진입점은 화면 전체에서 정확히 하나다(옛 자리에 남아 있지 않다).
  await expect(page.locator('#openScenarioRateManagerBtn')).toHaveCount(1);

  const order = await page.locator('#openScenarioRateManagerBtn').evaluate((btn) => {
    const doc = btn.ownerDocument;
    const positionCard = doc.getElementById('positionAnalysisCardAll').closest('section');
    const guideCard = doc.getElementById('rebalanceGuideExportBtn').closest('section');
    const top = (el) => el.getBoundingClientRect().top;
    return {
      insidePositionCard: positionCard.contains(btn),
      insideGuideCard: guideCard.contains(btn),
      afterPosition: top(btn) > top(positionCard),
      beforeGuide: top(btn) < top(guideCard),
      parentIsPanel: btn.parentElement.id === 'rebalanceSubTarget',
      fullWidth: Math.round(btn.getBoundingClientRect().width) === Math.round(positionCard.getBoundingClientRect().width),
    };
  });
  expect(order.insidePositionCard, '포지션 카드 내부가 아니다').toBe(false);
  expect(order.insideGuideCard, '실행 가이드 카드 내부가 아니다').toBe(false);
  expect(order.afterPosition, '포지션 카드보다 아래').toBe(true);
  expect(order.beforeGuide, '실행 가이드 카드보다 위').toBe(true);
  expect(order.parentIsPanel, '카드와 카드 사이의 독립 요소').toBe(true);
  expect(order.fullWidth, '카드와 같은 폭의 긴 버튼').toBe(true);
});

test('H. 새 버튼의 제목과 설명문구가 표시된다', async ({ page }) => {
  await open(page);
  await seed(page);
  await openRebalanceTab(page);
  const btn = page.locator('#openScenarioRateManagerBtn');
  await expect(btn).toContainText('수익률 직접 조정 (고급)');
  await expect(btn).toContainText('자산별 수익률 가정을 직접 설정할 수 있습니다.');
});

test('I. 새 버튼을 누르면 기존 수익률 관리 팝업이 그대로 열리고, 닫아도 값이 변하지 않는다', async ({ page }) => {
  await open(page);
  await seed(page);
  await openRebalanceTab(page);

  const snapshot = () => page.locator('body').evaluate(() => JSON.stringify({
    rates: state.projection.customScenarioRates,
    monthly: state.projection.monthlyContribution,
    ls: localStorage.getItem('sam_projection_v1'),
  }));
  const before = await snapshot();

  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
  await expect(page.locator('#scenarioRateManagerModal')).toContainText('수익률 관리');
  await expect(page.locator('#scenarioRateManagerList')).toHaveCount(1);

  // 취소/닫기로 빠져나온다 - 저장하지 않았으므로 값이 그대로여야 한다.
  await page.locator('#closeScenarioRateManagerModalBtn').click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeHidden();

  const after = await snapshot();
  expect(after).toBe(before);
});

for (const scheme of ['light', 'dark']) {
  test(`J. 375px ${scheme}에서 새 버튼이 44px·14px을 지키고 제목이 한 줄로 들어간다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await seed(page);
    await page.locator('body').evaluate((el, dark) => {
      el.ownerDocument.documentElement.classList.toggle('dark', dark);
    }, scheme === 'dark');
    await openRebalanceTab(page);

    const m = await page.locator('#openScenarioRateManagerBtn').evaluate((btn) => {
      const win = btn.ownerDocument.defaultView;
      const spans = Array.prototype.slice.call(btn.querySelectorAll('span'));
      const titleRect = spans[0].getBoundingClientRect();
      return {
        height: Math.round(btn.getBoundingClientRect().height),
        minFont: Math.min.apply(null, spans.map((s) => parseFloat(win.getComputedStyle(s).fontSize))),
        clipped: spans.some((s) => s.scrollWidth > s.clientWidth + 1),
        titleOneLine: titleRect.height < parseFloat(win.getComputedStyle(spans[0]).lineHeight) * 1.5,
        pageOverflow: btn.ownerDocument.documentElement.scrollWidth > btn.ownerDocument.documentElement.clientWidth,
      };
    });
    expect(m.height).toBeGreaterThanOrEqual(44);
    expect(m.minFont).toBeGreaterThanOrEqual(14);
    expect(m.clipped).toBe(false);
    expect(m.titleOneLine, '제목은 375px에서도 한 줄').toBe(true);
    expect(m.pageOverflow).toBe(false);
  });
}
