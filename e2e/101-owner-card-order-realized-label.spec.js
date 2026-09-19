/* global document, Node, window */
// E2E-101 [v256 표시만] PM 지시 2건.
//   A. 신랑 · 와이프 목표 비중 카드에서 포지션 목표비중 그래프가 종목 목록보다 먼저 나온다(두 소유자 모두 · 데이터는 각자 그대로).
//   B. 총 실현손익 배지 문구가 「총 실현손익 : 금액」이다(계산 · 범위 무변경).
//   C. [PM 결정] 상단 필터는 상단 도넛 그래프에만 적용되고, 총자산 카드의 금액 · 보유 자산 수 · 목록은 항상 전체 기준이다.
//   D. RISK 관리 제목 옆 ⓘ 버튼은 화면에 없다(제목과 나머지 RISK 영역은 그대로).
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToPortfolioSettingsTab } = require('./fixtures');

test('A. 두 소유자 모두 포지션 목표비중 그래프가 종목 목록보다 먼저 표시되고, 소유자별 내용은 섞이지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: '신랑국내채권', pct: 100 },
      { owner: '와이프', region: '국내', name: '와이프국내채권', pct: 100 }
    ]
  });
  await goToPortfolioSettingsTab(page);
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  await page.locator('#positionAnalysisAccordionWifeBtn h3').click();

  for (const [owner, suffix] of [['신랑', 'Husband'], ['와이프', 'Wife']]) {
    const order = await page.evaluate((s) => {
      const graph = document.getElementById('positionAnalysisCard' + s);
      const list = document.getElementById('portfolioTargetSummary' + s);
      // DOCUMENT_POSITION_FOLLOWING(4)이면 graph가 list보다 앞에 있다는 뜻이다.
      return {
        graphBeforeList: !!(graph.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING),
        graphTop: Math.round(graph.getBoundingClientRect().top),
        listTop: Math.round(list.getBoundingClientRect().top),
        graphText: graph.innerText.replace(/\s+/g, ' ').slice(0, 60),
        listText: list.innerText.replace(/\s+/g, ' ').slice(0, 80)
      };
    }, suffix);
    expect(order.graphBeforeList, `${owner} 그래프가 목록보다 앞`).toBe(true);
    expect(order.graphTop, `${owner} 그래프가 화면에서도 위`).toBeLessThan(order.listTop);
    // 그래프 영역은 자기 내용을 그대로 그리고(이 시드에서는 집계 대상이 없다는 안내), 목록에는 종목 진단 행이 있다.
    expect(order.graphText.length).toBeGreaterThan(0);
    expect(order.listText).toContain(owner === '신랑' ? '신랑국내채권' : '와이프국내채권');
    expect(order.listText).not.toContain(owner === '신랑' ? '와이프국내채권' : '신랑국내채권');
  }
});

test('B. 총 실현손익 배지가 「총 실현손익 : 금액」으로 표시된다(금액은 기존 계산값)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderKPIs === 'function');
  const r = await page.evaluate(() => {
    // 실제 호출부(renderKPIs)의 라벨을 그대로 확인하기 위해, 금액만 고정하고 화면을 다시 그린다.
    const original = getTotalRealizedPnL;
    const before = original();
    window.getTotalRealizedPnL = () => -750128;
    renderKPIs();
    const text = document.getElementById('kpiTotalRealizedBadge').textContent;
    window.getTotalRealizedPnL = original;
    renderKPIs();
    return { text, unchangedAmount: original() === before };
  });
  expect(r.text).toBe('총 실현손익 : -750,128원');
  expect(r.text).not.toContain('전체 자산');
  expect(r.unchangedAmount).toBe(true);
  // 오늘 실현손익 배지의 기존 문구는 그대로다.
  const today = await page.evaluate(() => {
    const original = getTodayRealizedPnL;
    window.getTodayRealizedPnL = () => 12345;
    renderKPIs();
    const text = document.getElementById('kpiTodayRealizedBadge').textContent;
    window.getTodayRealizedPnL = original;
    renderKPIs();
    return text;
  });
  expect(today).toBe('오늘 실현손익: +12,345원');
});

test('C. 상단 필터를 바꿔도 총자산 카드의 금액 · 보유 자산 수 · 목록은 전체 기준 그대로다(그래프만 바뀐다)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E101신랑주식', ticker: 'A.KS', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 1000, currentPrice: 1000 }),
      makeAsset({ name: 'E101와이프주식', ticker: 'B.KS', category: '주식', owner: '와이프', accountType: '일반계좌', quantity: 10, buyPrice: 1000, currentPrice: 1000 }),
      makeAsset({ name: 'E101신랑채권', category: '채권', owner: '신랑', accountType: 'ISA', quantity: 1, buyPrice: 5000, currentPrice: 5000 })
    ];
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.locator('.tab-btn[data-tab="investmentDetail"]').click();

  const read = () => page.evaluate(() => ({
    listTotal: document.getElementById('assetListTotalValue').textContent,
    countLabel: document.getElementById('tableCountLabel').textContent,
    groups: [...document.querySelectorAll('#assetCardList [data-group-toggle]')].map((e) => e.dataset.groupKey),
    chartLabels: buildPieChartData('category', filteredAssets().map((a) => ({ ...a, ...calcRow(a) }))).labels
  }));
  const all = await read();
  expect(all.countLabel).toContain('총 3건');
  expect(all.groups).toEqual(['주식', '채권']);

  await page.locator('#filterOwner').selectOption('신랑');
  const byOwner = await read();
  expect(byOwner.listTotal, '총자산 금액 그대로').toBe(all.listTotal);
  expect(byOwner.countLabel, '보유 자산 수 그대로').toBe(all.countLabel);
  expect(byOwner.groups, '목록 그룹 그대로').toEqual(all.groups);

  await page.locator('#filterCategory').selectOption('주식');
  const byCat = await read();
  expect(byCat.listTotal).toBe(all.listTotal);
  expect(byCat.countLabel).toBe(all.countLabel);
  expect(byCat.groups).toEqual(all.groups);
  expect(byCat.chartLabels, '그래프는 필터를 따른다').toEqual(['주식']);
});

test('D. 위험 관리 제목 옆 ⓘ 버튼이 없고 제목과 주변 안내는 그대로다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  const r = await page.evaluate(() => {
    const section = document.getElementById('riskManagementSection');
    const title = [...section.querySelectorAll('h3')].find((h) => h.textContent.includes('위험 관리'));
    const row = title.parentElement;
    return {
      titleText: title.textContent.trim(),
      buttonsInTitleRow: row.querySelectorAll('button').length,
      infoTitleButtons: [...document.querySelectorAll('button[title]')].filter((b) => b.title.indexOf('HHI') >= 0).length,
      scopeNote: document.getElementById('riskScopeNote').textContent.slice(0, 10),
      hasSummary: !!document.getElementById('riskDiagnosisSummary'),
      hasRiskyAccordion: !!document.getElementById('riskyAccordionBtn')
    };
  });
  expect(r.infoTitleButtons, 'ⓘ 버튼 없음').toBe(0);
  expect(r.buttonsInTitleRow, '제목 줄에 버튼 없음').toBe(0);
  // [§46 TXT-46-2] 제목 「RISK 관리」 → 「위험 관리」(기능 · id 무변경).
  expect(r.titleText).toBe('위험 관리');
  expect(r.scopeNote).toContain('진단 대상');
  expect(r.hasSummary).toBe(true);
  expect(r.hasRiskyAccordion).toBe(true);
});
