// E2E-93 [v247] 일반계좌 포트폴리오 화면 UX 정비(checklist §34) - 모바일 우선 회귀.
//
// 고정하는 계약(REQ-01~09):
//   A/B 소유자 타이틀의 접기/펼치기 상태 하나가 "세부 종목 현황"과 "포지션 그래프"에 함께 적용된다.
//   C/D 신랑/와이프 상태는 서로 섞이지 않는다.
//   E   엑셀 다운로드는 타이틀 행으로 옮겨졌고 기존 파일(포트폴리오구성_실행가이드_*.xlsx)을 그대로 만든다.
//   F   비중조절은 기존 목표 비중 모달을 그대로 연다.
//   G   전체 포지션별 목표비중 분석 카드는 그대로 남는다.
//   H   수익률 직접 조정(고급)은 기능 그대로, 분석 카드와 색으로 구분된다.
//   I   종목별 실행 가이드 카드는 더 이상 없다.
//   J/K 375px Dark/Light에서 제목과 두 버튼이 겹치지 않고, 44px/14px과 무오버플로를 지킨다.
//
// 계산은 하나도 바꾸지 않았다 - 목표 비중/실행 금액 값도 함께 확인한다.
const { test, expect } = require('@playwright/test');

const TOUCH_MIN = 43.9;

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E93신랑채권', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 60000000, currentPrice: 60000000 }),
      makeAsset({ name: 'E93와이프채권', category: '채권', owner: '와이프', accountType: '일반계좌', quantity: 1, buyPrice: 20000000, currentPrice: 20000000 })
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: 'E93신랑채권', label: 'E93신랑채권', pct: 100, role: '수비수' }];
    state.rebalance['와이프'].targets['국내'] = [{ type: 'namedHolding', name: 'E93와이프채권', label: 'E93와이프채권', pct: 100, role: '수비수' }];
    persistAssets();
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 설정', { exact: true }).click();
}

// 조상 클리핑까지 반영한 "실제로 보이는 높이"(e2e/79 D와 같은 방식).
const visibleHeight = (page, id) => page.locator('body').evaluate((body, targetId) => {
  const doc = body.ownerDocument;
  const el = doc.getElementById(targetId);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  let top = r.top, bottom = r.bottom;
  for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
    if (doc.defaultView.getComputedStyle(p).overflowY === 'visible') continue;
    const pr = p.getBoundingClientRect();
    top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
  }
  return Math.max(0, Math.round(bottom - top));
}, id);

const ownerView = async (page, suffix) => ({
  summary: await visibleHeight(page, `portfolioTargetSummary${suffix}`),
  graph: await visibleHeight(page, `positionAnalysisCard${suffix}`)
});

/* ── A/B. 드롭다운 상태가 두 영역에 함께 적용된다 ─────────────────────── */

for (const [owner, suffix] of [['신랑', 'Husband'], ['와이프', 'Wife']]) {
  test(`${owner === '신랑' ? 'A' : 'B'}. ${owner} 목표비중 드롭다운이 세부 종목 현황과 포지션 그래프에 함께 적용된다`, async ({ page }) => {
    await seed(page);
    const closed = await ownerView(page, suffix);
    expect(closed.summary, '기본은 접힘 - 세부 종목 현황').toBe(0);
    expect(closed.graph, '기본은 접힘 - 포지션 그래프').toBe(0);

    await page.locator(`#positionAnalysisAccordion${suffix}Btn h3`).click();
    await page.waitForTimeout(400);
    const opened = await ownerView(page, suffix);
    expect(opened.summary, '펼치면 세부 종목 현황이 보인다').toBeGreaterThan(0);
    expect(opened.graph, '같은 상태로 포지션 그래프도 보인다').toBeGreaterThan(0);
    await expect(page.locator(`#portfolioTargetSummary${suffix}`)).toContainText(owner === '신랑' ? 'E93신랑채권' : 'E93와이프채권');

    // 안쪽 행(실행 상세)을 펼쳐도 부모가 잘라내지 않는다.
    await page.locator(`#portfolioTargetSummary${suffix} .portfolio-diag-row-toggle`).first().click();
    await page.waitForTimeout(400);
    await expect(page.locator(`#portfolioTargetSummary${suffix}`)).toContainText('현재 평가금액');
    expect((await ownerView(page, suffix)).graph, '행을 펼쳐도 그래프는 계속 보인다').toBeGreaterThan(0);

    await page.locator(`#positionAnalysisAccordion${suffix}Btn h3`).click();
    await page.waitForTimeout(400);
    const closedAgain = await ownerView(page, suffix);
    expect(closedAgain.summary, '다시 접으면 세부 종목 현황도 접힌다').toBe(0);
    expect(closedAgain.graph).toBe(0);
  });
}

/* ── C/D. 신랑/와이프 상태 독립 ────────────────────────────────────────── */

test('C·D. 한쪽을 펼쳐도 다른 쪽 표시는 바뀌지 않는다', async ({ page }) => {
  await seed(page);
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  await page.waitForTimeout(400);
  let husband = await ownerView(page, 'Husband');
  let wife = await ownerView(page, 'Wife');
  expect(husband.summary).toBeGreaterThan(0);
  expect(wife.summary, '신랑을 펼쳐도 와이프는 그대로 접힘').toBe(0);
  expect(wife.graph).toBe(0);

  await page.locator('#positionAnalysisAccordionWifeBtn h3').click();
  await page.waitForTimeout(400);
  wife = await ownerView(page, 'Wife');
  expect(wife.summary).toBeGreaterThan(0);
  await expect(page.locator('#portfolioTargetSummaryWife')).toContainText('E93와이프채권');
  await expect(page.locator('#portfolioTargetSummaryWife')).not.toContainText('E93신랑채권');

  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  await page.waitForTimeout(400);
  husband = await ownerView(page, 'Husband');
  wife = await ownerView(page, 'Wife');
  expect(husband.summary, '신랑만 접힌다').toBe(0);
  expect(wife.summary, '와이프는 펼친 상태 유지').toBeGreaterThan(0);
});

/* ── E/F. 타이틀 행의 두 버튼 ──────────────────────────────────────────── */

test('E. 엑셀 다운로드 버튼이 타이틀 행에 있고 기존 파일을 그대로 만든다', async ({ page }) => {
  await seed(page);
  const buttons = page.locator('[data-rebalance-export-btn]');
  await expect(buttons, '신랑/와이프 타이틀 행에 하나씩').toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent('download'), buttons.first().click()]);
  expect(download.suggestedFilename()).toMatch(/^포트폴리오구성_실행가이드_\d{8}\.xlsx$/);
  // 다운로드는 아코디언을 건드리지 않는다(타이틀 행 클릭과 분리).
  expect((await ownerView(page, 'Husband')).summary).toBe(0);
});

test('F. 비중조절 버튼이 기존 목표 비중 모달을 그대로 연다', async ({ page }) => {
  await seed(page);
  await page.locator('[data-rebalance-detail-btn][data-owner="신랑"]').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeVisible();
  await expect(page.locator('#rebalanceTargetModalTitle')).toContainText('목표 비중');
  await page.locator('#cancelRebalanceTargetModalBtn').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeHidden();
  // 모달을 열고 닫아도 아코디언 상태는 그대로다.
  expect((await ownerView(page, 'Husband')).summary).toBe(0);
});

/* ── G/H/I. 남는 카드 · 색 구분 · 삭제된 카드 ─────────────────────────── */

test('G. 전체 포지션별 목표비중 분석 카드가 그대로 있다', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('heading', { name: /전체 포지션별 목표비중 분석/ })).toHaveCount(1);
  const card = page.locator('#positionAnalysisCardAll');
  await expect(card).toBeVisible();
  await expect(card).toContainText('🇰🇷 국내');
  await expect(card).toContainText('🛡️ 수비수');
  // 클릭하면 기존 드릴다운 팝업이 열린다.
  await card.locator('[data-position-tab][data-kind="role"][data-key="defender"]').click();
  await expect(page.locator('#positionRoleBreakdownModal')).toBeVisible();
  await page.locator('#closePositionRoleBreakdownModalBtn').click();
});

test('H. 수익률 직접 조정(고급)은 기능 그대로이고 분석 카드와 색이 다르다', async ({ page }) => {
  await seed(page);
  const btn = page.locator('#openScenarioRateManagerBtn');
  await expect(btn).toContainText('수익률 직접 조정 (고급)');
  await expect(btn).toContainText('자산별 수익률 가정을 직접 설정할 수 있습니다.');

  const colors = await btn.evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const analysisCard = el.ownerDocument.getElementById('positionAnalysisCardAll').closest('section');
    const s = win.getComputedStyle(el);
    const a = win.getComputedStyle(analysisCard);
    return { bg: s.backgroundColor, border: s.borderTopColor, cardBg: a.backgroundColor, cardBorder: a.borderTopColor };
  });
  expect(colors.bg, '배경색이 분석 카드와 다르다').not.toBe(colors.cardBg);
  expect(colors.border, '테두리색이 분석 카드와 다르다').not.toBe(colors.cardBorder);

  await btn.click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
  await page.locator('#cancelScenarioRateManagerModalBtn').click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeHidden();
});

test('I. 종목별 실행 가이드 카드와 중복 안내 문구가 더 이상 없다', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#rebalanceGuideAccordionsContainer')).toHaveCount(0);
  await expect(page.locator('#rebalanceGuideExportBtn')).toHaveCount(0);
  await expect(page.locator('#guideScopeNote')).toHaveCount(0);
  await expect(page.locator('#rebalanceScopeNote'), '[REQ-09] 탭 이름과 중복되던 안내문 삭제').toHaveCount(0);
  await expect(page.getByText('📋 종목별 실행 가이드')).toHaveCount(0);
  await expect(page.locator('#rebalanceSubTarget')).not.toContainText('절세계좌(ISA/IRP/연금저축)');
  // 탭 이름이 범위를 직접 말한다.
  await expect(page.locator('[data-subtab="target"]')).toHaveText('포트폴리오 설정');
});

/* ── J/K. 모바일 · 다크모드 ────────────────────────────────────────────── */

const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));
for (const [w, h, dark] of [[375, 812, true], [375, 812, false], [768, 1024, true], [1440, 900, false]]) {
  test(`J·K-${w} ${dark ? 'Dark' : 'Light'} - 제목과 두 버튼이 겹치지 않고 44px·14px·무오버플로를 지킨다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page);
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);
    await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
    await page.waitForTimeout(400);
    // [REQ-06 · REQ-07] 제목(펼치기)과 두 버튼은 같은 줄에 있어도 서로 분리돼 있다 - 제목을 눌러도 모달이 열리면 안 된다.
    await expect(page.locator('#rebalanceTargetModal')).toBeHidden();

    const header = await page.locator('#positionAnalysisAccordionHusbandBtn').evaluate((row) => {
      const win = row.ownerDocument.defaultView;
      const title = row.querySelector('h3');
      const exportBtn = row.querySelector('[data-rebalance-export-btn]');
      const weightBtn = row.querySelector('[data-rebalance-detail-btn]');
      const rect = (el) => el.getBoundingClientRect();
      const overlap = (a, b) => !(rect(a).right <= rect(b).left + 1 || rect(b).right <= rect(a).left + 1
        || rect(a).bottom <= rect(b).top + 1 || rect(b).bottom <= rect(a).top + 1);
      const style = (el) => win.getComputedStyle(el);
      const clipped = (el) => el.scrollWidth > el.clientWidth + 1;
      return {
        titleOverlapsExport: overlap(title, exportBtn),
        titleOverlapsWeight: overlap(title, weightBtn),
        buttonsOverlap: overlap(exportBtn, weightBtn),
        exportHeight: rect(exportBtn).height,
        weightHeight: rect(weightBtn).height,
        exportFont: parseFloat(style(exportBtn).fontSize),
        weightFont: parseFloat(style(weightBtn).fontSize),
        sameBackground: style(exportBtn).backgroundColor === style(weightBtn).backgroundColor,
        clippedTexts: [title, exportBtn, weightBtn].filter(clipped).length,
        rightInside: Math.max(rect(exportBtn).right, rect(weightBtn).right) <= row.ownerDocument.documentElement.clientWidth + 1
      };
    });
    expect(header.titleOverlapsExport, '제목 · 엑셀 버튼 겹침').toBe(false);
    expect(header.titleOverlapsWeight, '제목 · 비중조절 겹침').toBe(false);
    expect(header.buttonsOverlap, '두 버튼 겹침').toBe(false);
    expect(header.exportHeight).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(header.weightHeight).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(header.exportFont).toBeGreaterThanOrEqual(14);
    expect(header.weightFont).toBeGreaterThanOrEqual(14);
    expect(header.sameBackground, '[REQ-07] 두 버튼의 색이 서로 다르다').toBe(false);
    expect(header.clippedTexts, '텍스트 잘림').toBe(0);
    expect(header.rightInside, '버튼이 화면 밖으로 나가지 않는다').toBe(true);

    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '가로 넘침').toBeLessThanOrEqual(w);
  });
}

/* ── [v247-1] 후속 미세 수정(checklist §35) ───────────────────────────────
 *   L 신랑/와이프 헤더가 375px에서 모두 한 행이다(제목 잘림 · 가로 넘침 없이).
 *   M 두 버튼은 44px 터치를 유지하면서 한 행에 들어가고, 비중조절 색이 상단 브랜드 버튼과 다르다.
 *   N 수익률 관리 팝업: 상단 설명 문단 삭제 · 표시용 접두어 · 저장값에는 접두어가 들어가지 않는다. */

const headerMetrics = (page, suffix) => page.locator(`#positionAnalysisAccordion${suffix}Btn`).evaluate((row) => {
  const win = row.ownerDocument.defaultView;
  const rect = (el) => el.getBoundingClientRect();
  // 제목(20px)과 버튼(44px)은 높이가 달라 top으로 비교하면 같은 줄이어도 어긋난다 - 세로 중심으로 본다.
  const centerY = (el) => rect(el).top + rect(el).height / 2;
  const title = row.querySelector('h3');
  const exportBtn = row.querySelector('[data-rebalance-export-btn]');
  const weightBtn = row.querySelector('[data-rebalance-detail-btn]');
  const clipped = (el) => el.scrollWidth > el.clientWidth + 1;
  return {
    sameRow: Math.abs(centerY(title) - centerY(exportBtn)) <= 6 && Math.abs(centerY(exportBtn) - centerY(weightBtn)) <= 2,
    rowHeight: Math.round(rect(row).height),
    titleClipped: clipped(title),
    buttonsClipped: clipped(exportBtn) || clipped(weightBtn),
    exportHeight: rect(exportBtn).height,
    weightHeight: rect(weightBtn).height,
    exportWidth: Math.round(rect(exportBtn).width),
    weightWidth: Math.round(rect(weightBtn).width),
    rightInside: Math.max(rect(exportBtn).right, rect(weightBtn).right) <= row.ownerDocument.documentElement.clientWidth + 1,
    weightBg: win.getComputedStyle(weightBtn).backgroundColor,
    exportBg: win.getComputedStyle(exportBtn).backgroundColor,
    refreshBg: win.getComputedStyle(row.ownerDocument.getElementById('refreshAllBtn')).backgroundColor
  };
});

for (const [w, h, dark] of [[375, 812, true], [375, 812, false], [390, 844, true], [412, 915, false]]) {
  test(`L·M-${w} ${dark ? 'Dark' : 'Light'} - 신랑/와이프 헤더가 한 행이고 버튼이 44px·구분되는 색을 지킨다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page);
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);

    for (const [owner, suffix] of [['신랑', 'Husband'], ['와이프', 'Wife']]) {
      const m = await headerMetrics(page, suffix);
      expect(m.sameRow, `${owner} 제목과 두 버튼이 한 행`).toBe(true);
      expect(m.rowHeight, `${owner} 헤더 행 높이(두 행이면 60px를 넘는다)`).toBeLessThanOrEqual(60);
      expect(m.titleClipped, `${owner} 제목 잘림`).toBe(false);
      expect(m.buttonsClipped, `${owner} 버튼 텍스트 잘림`).toBe(false);
      expect(m.exportHeight, `${owner} 엑셀 버튼 터치 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(m.weightHeight, `${owner} 비중조절 터치 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(m.rightInside, `${owner} 버튼이 화면 안`).toBe(true);
      // [REQ-02] 축소 후에도 한 행에 들어가는 폭인지 - 두 버튼 합이 컨테이너의 절반 이하
      expect(m.exportWidth + m.weightWidth, `${owner} 두 버튼 합계 폭`).toBeLessThanOrEqual(190);
      // [REQ-03] 비중조절 색은 상단 [시세 & 환율 갱신](브랜드)과도, 엑셀 버튼과도 다르다
      expect(m.weightBg, `${owner} 비중조절 ↔ 상단 브랜드 버튼 색`).not.toBe(m.refreshBg);
      expect(m.weightBg, `${owner} 비중조절 ↔ 엑셀 버튼 색`).not.toBe(m.exportBg);
    }
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '가로 넘침').toBeLessThanOrEqual(w);
  });
}

test('N. 수익률 관리 팝업 - 상단 설명 삭제 · 표시 접두어 · 저장값에는 접두어가 들어가지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates = { BOND: { label: '국채/채권형', conservative: 3, normal: 4, optimistic: 5, keywords: ['국채', '채권', '채권혼합'] } };
    state.projection.instrumentReturnKeys = { '472170.KS': 'BOND', '237370.KS': 'BOND' };
    persistProjection();
    openScenarioRateManagerModal();
  });
  const modal = page.locator('#scenarioRateManagerModal');
  await expect(modal).toBeVisible();

  // [REQ-04] 상단 설명 문단 전체 삭제 · 제목은 유지
  await expect(page.locator('#scenarioRateCompoundingNote')).toHaveCount(0);
  await expect(page.locator('#scenarioRateInstrumentNote')).toHaveCount(0);
  await expect(modal).toContainText('수익률 관리');
  await expect(modal).not.toContainText('월복리');
  await expect(modal).not.toContainText('전형적 경로 기준');

  // [REQ-05 · REQ-06] 표시 접두어
  const row = page.locator('#scenarioRateManagerList > div').filter({ has: page.locator('span[title="국채/채권형"]') });
  await expect(row).toContainText('키워드 :');
  await expect(row).toContainText('적용종목 :');
  await expect(row.locator('input[data-rate-field="keywords"]')).toHaveValue('국채, 채권, 채권혼합');
  await expect(row.locator('input[data-rate-field="instruments"]')).toHaveValue('472170.KS, 237370.KS');

  // [REQ-07] 팝업 안 가로 넘침 없음
  const overflow = await modal.evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    return [...el.querySelectorAll('*')].filter((n) => n.scrollWidth - n.clientWidth > 1
      && win.getComputedStyle(n).overflowX === 'visible' && n.tagName !== 'INPUT').length;
  });
  expect(overflow, '팝업 내부 가로 넘침').toBe(0);
  expect(await page.locator('body').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(375);

  // [TEST-K] 저장 후에도 데이터에는 접두어가 들어가지 않는다
  await page.locator('#saveScenarioRateManagerModalBtn').click();
  await expect(modal).toBeHidden();
  const saved = await page.evaluate(() => ({
    keywords: (state.projection.customScenarioRates.BOND || {}).keywords,
    master: JSON.parse(JSON.stringify(state.projection.instrumentReturnKeys || {}))
  }));
  expect(saved.keywords).toEqual(['국채', '채권', '채권혼합']);
  expect(saved.master).toEqual({ '472170.KS': 'BOND', '237370.KS': 'BOND' });
  expect(JSON.stringify(saved)).not.toContain('키워드 :');
  expect(JSON.stringify(saved)).not.toContain('적용종목 :');
});
