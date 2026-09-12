// E2E-77 [자산 현황 정보구조] 필터 → 통계 → 자산군 요약 → 필요한 자산군만 펼침.
//
// 고친 것 두 가지.
//   ① 필터 범위 통일 - 예전에는 상단 그래프만 filteredAssets()를 쓰고 자산 세부현황은 tableAssets()를
//      써서, 필터를 골라도 목록이 그대로였다("필터가 안 먹는다"로 읽혔다). 이제 둘 다 filteredAssets().
//   ② 자산 세부현황 아코디언 - 어떤 보기 방식이든 자산군(또는 소유자/국내외) 요약 행만 먼저 보여주고,
//      누른 그룹의 개별 자산만 펼친다. '전체'도 예외가 아니다.
//
// 계산은 건드리지 않았다 - 요약 행의 건수·금액·비중은 예전부터 renderGroupedRows(js/07)가 구하던 값
// 그대로다. fixture는 전부 합성 데이터이며 실제 사용자 데이터/백업을 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderTable === 'function' && typeof filteredAssets === 'function');
  // 자산 세부현황은 '총자산현황' 탭 안에 있고, renderAll()은 보이는 탭만 다시 그린다(js/07 renderAll) -
  // 탭을 먼저 열어야 목록이 실제로 렌더링된다(e2e/26과 같은 방식).
  await page.getByText('총자산현황', { exact: true }).click();
}

const SEED = () => {
  const mk = (o) => makeAsset(o);
  state.assets = [
    mk({ ticker: '005930.KS', name: 'E77국내주식', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 70000, currentPrice: 80000 }),
    mk({ ticker: 'GOOGL', name: 'E77해외주식', category: '주식', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: '일반계좌', quantity: 20, buyPrice: 300, currentPrice: 340 }),
    mk({ ticker: '069500.KS', name: 'E77국내ETF', category: 'ETF', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '연금저축', quantity: 100, buyPrice: 30000, currentPrice: 31000 }),
    mk({ ticker: 'QQQM', name: 'E77해외ETF', category: 'ETF', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: 'ISA', quantity: 50, buyPrice: 200, currentPrice: 210 }),
    mk({ ticker: '', name: 'E77원화채권', category: '채권', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 9000000, currentPrice: 9300000 }),
    mk({ ticker: '', name: 'E77달러현금', category: '현금', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 11000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: 'E77부동산', category: '부동산', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 500000000 }),
    mk({ ticker: '005380.KS', name: 'E77수량0', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 0, buyPrice: 250000, currentPrice: 260000 }),
  ];
  state.assets.forEach((a) => { if (a.currency === 'USD') a.buyRate = 1300; });
  state.transactions = [];
  state.exchangeRate = 1400;
  state.refExchangeRate = 1350;
  state.prevCloseMap = {};
  state.dayChangeMap = {};
  state.noNewSessionMap = {};
  state.sessionMap = {};
  state.filters = { owner: 'ALL', category: 'ALL', account: 'ALL' };
  populateFilterOptions();
  renderAll();
};

// 기본 뷰포트에서는 카드 뷰가 sm:hidden이고 테이블 뷰가 보인다 - 클릭은 항상 테이블 쪽에서 한다
// (클릭 위임 핸들러가 #assetManagementSection 하나라 어느 쪽을 눌러도 같은 그룹이 열린다).
const READ = () => {
  const doc = globalThis.document;
  const heads = [...doc.querySelectorAll('#assetTableBody [data-group-toggle]')];
  const rows = filteredAssets().map((a) => ({ ...a, ...calcRow(a) }));
  const chart = buildPieChartData('category', rows);
  return {
    groupKeys: heads.map((e) => e.dataset.groupKey),
    expandedKeys: heads.filter((e) => e.getAttribute('aria-expanded') === 'true').map((e) => e.dataset.groupKey),
    headTexts: heads.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    detailRows: doc.querySelectorAll('#assetTableBody [data-action="open-detail"]').length,
    listTotal: doc.getElementById('assetListTotalValue').textContent,
    countLabel: doc.getElementById('tableCountLabel').textContent,
    filteredCount: rows.length,
    filteredSum: rows.reduce((s, r) => s + r.curAmount, 0),
    chartLabels: chart.labels,
    chartTotal: chart.values.reduce((s, v) => s + v, 0),
  };
};

async function seedAndRead(page) {
  return page.locator('body').evaluate((el, [seed, read]) => {
    new Function(`return (${seed})`)()();
    return new Function(`return (${read})`)()();
  }, [SEED.toString(), READ.toString()]);
}
async function read(page) {
  return page.locator('body').evaluate((el, r) => new Function(`return (${r})`)()(), READ.toString());
}

test('A. 전체 선택 시 자산군 요약만 보이고 개별 자산은 접혀 있다', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  expect(r.groupKeys).toEqual(['주식', 'ETF', '채권', '현금', '부동산']);
  expect(r.detailRows, '개별 자산 상세가 자동으로 펼쳐지지 않는다').toBe(0);
  expect(r.expandedKeys).toEqual([]);
  // 요약 행에 자산군명·건수·금액·비중·접힘 표시가 함께 있다.
  expect(r.headTexts[0]).toMatch(/^▶주식 \(2건\) [\d,]+원 · [\d.]+%$/);
});

test('B. 자산군 행을 누르면 그 자산군만 펼쳐지고, 다시 누르면 접힌다', async ({ page }) => {
  await open(page);
  await seedAndRead(page);
  await page.locator('#assetTableBody [data-group-key="주식"]').click();
  const opened = await read(page);
  expect(opened.expandedKeys).toEqual(['주식']);
  expect(opened.detailRows, '펼친 자산군의 자산만 보인다').toBe(2);

  await page.locator('#assetTableBody [data-group-key="ETF"]').click();
  const two = await read(page);
  expect(two.expandedKeys.sort()).toEqual(['ETF', '주식']);
  expect(two.detailRows).toBe(4);

  await page.locator('#assetTableBody [data-group-key="주식"]').click();
  const closed = await read(page);
  expect(closed.expandedKeys).toEqual(['ETF']);
  expect(closed.detailRows).toBe(2);
});

test('C. 보기 방식을 바꾸면 그 방식의 그룹으로 다시 접힌 상태가 된다', async ({ page }) => {
  await open(page);
  await seedAndRead(page);
  await page.locator('#assetTableBody [data-group-key="주식"]').click();
  // 'category' 보기 방식은 상단 버튼에서 제거됐다 - '전체'가 같은 자산군 그룹을 보여주므로
  // 마지막에 '전체'로 돌아와 그 그룹 키가 그대로인지까지 확인한다.
  for (const [view, keys] of [['owner', ['신랑', '와이프']], ['domestic', ['해외', '국내']], ['none', ['주식', 'ETF', '채권', '현금', '부동산']]]) {
    await page.locator(`#assetViewSegmented .asset-view-btn[data-view="${view}"]`).click();
    const r = await read(page);
    expect(r.groupKeys, `${view} 그룹 키`).toEqual(keys);
    expect(r.detailRows, `${view} 전환 직후에는 접혀 있다`).toBe(0);
    expect(r.expandedKeys, `${view} 열림 상태 초기화`).toEqual([]);
  }
});

test('D. 필터를 고르면 상단 그래프와 자산 세부현황이 같은 범위로 함께 바뀐다', async ({ page }) => {
  await open(page);
  const all = await seedAndRead(page);
  expect(all.chartTotal).toBe(all.filteredSum);
  expect(all.listTotal).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(all.filteredSum)) + '원');

  // 소유자 필터
  await page.selectOption('#filterOwner', '신랑');
  const byOwner = await read(page);
  expect(byOwner.filteredCount, '필터가 실제로 걸린다').toBeLessThan(all.filteredCount);
  expect(byOwner.chartTotal, '그래프 분모 = 필터 결과 합계').toBe(byOwner.filteredSum);
  expect(byOwner.listTotal, '목록 총액 = 필터 결과 합계')
    .toBe(new Intl.NumberFormat('ko-KR').format(Math.round(byOwner.filteredSum)) + '원');
  expect(byOwner.countLabel).toContain(`총 ${byOwner.filteredCount}건`);

  // 자산군 필터 - 그래프도 목록도 그 자산군 하나만 남는다
  await page.selectOption('#filterOwner', 'ALL');
  await page.selectOption('#filterCategory', 'ETF');
  const byCat = await read(page);
  expect(byCat.chartLabels).toEqual(['ETF']);
  expect(byCat.groupKeys).toEqual(['ETF']);
  expect(byCat.chartTotal).toBe(byCat.filteredSum);

  // 해제하면 원래대로
  await page.selectOption('#filterCategory', 'ALL');
  const back = await read(page);
  expect(back.filteredCount).toBe(all.filteredCount);
  expect(back.listTotal).toBe(all.listTotal);
});

test('E. 필터 결과가 없으면 그 사실을 알리고, 자산이 없는 경우와 구분한다', async ({ page }) => {
  await open(page);
  await seedAndRead(page);
  const msg = await page.locator('body').evaluate((el) => {
    state.filters = { owner: '신랑', category: '부동산', account: 'ALL' };
    renderTable();
    const m = el.ownerDocument.getElementById('emptyTableMsg');
    return { text: m.textContent, hidden: m.classList.contains('hidden') };
  });
  expect(msg.hidden).toBe(false);
  expect(msg.text).toContain('필터');
});

test('F. 검색은 예전 그대로 팝업이며, 목록을 자동으로 펼치지 않는다', async ({ page }) => {
  await open(page);
  await seedAndRead(page);
  await page.fill('#assetSearchInput', 'E77');
  await page.locator('#assetSearchBtn').click();
  await expect(page.locator('#assetSearchResultModal')).not.toHaveClass(/hidden/);
  const after = await read(page);
  expect(after.detailRows, '검색해도 목록은 접힌 상태 그대로다').toBe(0);
});

test('G. 필터 초기화 버튼은 화면에 없지만 초기화 로직은 그대로 살아 있다', async ({ page }) => {
  await open(page);
  await seedAndRead(page);
  await expect(page.locator('#filterResetBtn')).toBeHidden();
  const r = await page.locator('body').evaluate((el) => {
    state.filters = { owner: '신랑', category: 'ETF', account: 'ALL' };
    el.ownerDocument.getElementById('filterResetBtn').click(); // 숨겨져 있어도 핸들러는 살아 있다
    return { filters: JSON.stringify(state.filters), count: filteredAssets().length };
  });
  expect(r.filters).toBe(JSON.stringify({ owner: 'ALL', category: 'ALL', account: 'ALL' }));
  expect(r.count).toBe(7); // 수량 0 자산 1건은 filteredAssets가 예전 그대로 제외한다
});

test('H. 375px에서 요약 행이 44px 터치 영역과 14px를 지키고 잘리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await seedAndRead(page);
  for (const dark of [false, true]) {
    const r = await page.locator('body').evaluate((el, [seed, isDark]) => {
      const doc = el.ownerDocument;
      const win = doc.defaultView;
      doc.documentElement.classList.toggle('dark', isDark);
      new Function(`return (${seed})`)()();
      const heads = [...doc.querySelectorAll('#assetCardList [data-group-toggle]')];
      return {
        count: heads.length,
        minH: Math.min(...heads.map((e) => e.getBoundingClientRect().height)),
        minFs: Math.min(...heads.flatMap((e) => [...e.querySelectorAll('span')].map((s) => parseFloat(win.getComputedStyle(s).fontSize)))),
        anyClip: heads.some((e) => e.scrollWidth > e.clientWidth + 1),
        pageOverflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
      };
    }, [SEED.toString(), dark]);
    const mode = dark ? 'Dark' : 'Light';
    expect(r.count, `${mode} 요약 행 개수`).toBe(5);
    expect(r.minH, `${mode} 터치 영역 44px`).toBeGreaterThanOrEqual(44);
    expect(r.minFs, `${mode} 글자 14px`).toBeGreaterThanOrEqual(14);
    expect(r.anyClip, `${mode} 요약 행 잘림 없음`).toBe(false);
    expect(r.pageOverflowX, `${mode} 가로 overflow 없음`).toBe(false);
  }
});
