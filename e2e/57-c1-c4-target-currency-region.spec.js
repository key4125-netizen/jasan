// E2E-57 [C-1~C-4] Target Portfolio의 통화 분리와 국내/해외 표시.
//
// [왜 node --test가 아니라 e2e인가] js/04-rebalancing.js는 <script>로 로드되는 classic script라
// module.exports가 없고 state/DOM 전역에 직접 의존한다 - test/*.test.js가 검증하는 파일들(js/15·16·
// 20·21, mergeCollectionById)처럼 Node에서 독립적으로 require할 수 없다. 이 저장소는 그런 파일을
// 실브라우저 e2e로 검증해 왔고(e2e/10·23·27이 같은 함수군을 다룬다), 여기서도 같은 방식을 쓴다.
//
// 검증 대상은 PM 지시서의 테스트 A~E다.
//   A 기본 통화 분리      - 같은 지역·같은 이름이라도 원화와 달러는 별개 행이어야 한다(C-1, P0)
//   B 환율 변경 회귀      - 달러만 환율을 따라 변하고 원화는 변하지 않아야 한다
//   C 환차손익 회귀       - C-1 수정이 환차손익 계산을 건드리지 않았음을 고정한다
//   D Cross-region label  - 같은 이름이 양쪽 지역에 있어도 드릴다운이 섞이지 않아야 한다(C-2)
//   E 실행 가이드 표시    - 지역/통화가 화면에서 구분되고 375px에서 넘치지 않아야 한다(C-3)
//   + C-4 진단           - 목표가 저장된 지역과 실제 보유 지역이 다르면 한 줄로 알린다
//
// 이 spec은 외부 네트워크를 전혀 쓰지 않는다 - 시드 자산이 전부 현금/채권이라 시세 조회 대상이
// 아니고(NON_TRADABLE_CATEGORIES), playwright.config.js의 DNS 격리가 그대로 적용된다.
const { test, expect } = require('@playwright/test');

// 국내에 원화 현금과 달러 현금을 같은 이름('C57현금')으로 함께 두는 시드 - C-1이 재현되던 바로 그 구성이다.
async function seedSameNameTwoCurrencies(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.exchangeRate = 1450;
    persistRate(true);
    state.assets = [
      makeAsset({ ticker: '', name: 'C57현금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10000000, buyPrice: 1, currentPrice: 1 }),
      makeAsset({ ticker: '', name: 'C57현금', category: '현금', currency: 'USD', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10000, buyPrice: 1, currentPrice: 1, buyRate: 1300 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'namedHolding', name: 'C57현금', label: 'C57현금', pct: 100, role: '수비수' },
    ];
    persistAssets();
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

// 같은 이름('C57달러')을 국내와 해외 양쪽에 두고, 목표도 양쪽에 두는 시드 - C-2/C-4가 재현되던 구성이다.
async function seedCrossRegionSameLabel(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.exchangeRate = 1450;
    persistRate(true);
    state.assets = [
      makeAsset({ ticker: '', name: 'C57원화', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10000000, buyPrice: 1, currentPrice: 1 }),
      makeAsset({ ticker: '', name: 'C57달러', category: '현금', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 10000, buyPrice: 1, currentPrice: 1 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 50, '해외': 50 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    // 같은 두 이름을 국내와 해외 양쪽에 저장한다 - 실제 사용자 데이터에서도 자산의 국내/해외 표기가
    // 바뀌면 이런 상태가 남는다(목표는 자동으로 따라 이동하지 않는 것이 확정 정책).
    ['국내', '해외'].forEach((region) => {
      state.rebalance['신랑'].targets[region] = [
        { type: 'namedHolding', name: 'C57원화', label: 'C57원화', pct: 50, role: '수비수' },
        { type: 'namedHolding', name: 'C57달러', label: 'C57달러', pct: 50, role: '수비수' },
      ];
    });
    persistAssets();
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

test('A. [C-1] 같은 지역·같은 이름이라도 원화 현금과 달러 현금은 별개 행으로 계산된다', async ({ page }) => {
  await seedSameNameTwoCurrencies(page);
  const rows = await page.locator('body').evaluate(() =>
    computeIndividualRebalanceGuide('신랑').rows.map((r) => ({
      region: r.region, name: r.name, cur: Math.round(r.curAmount),
      tgt: Math.round(r.targetAmount), diff: Math.round(r.diff), isForeign: r.isForeign,
    })));

  // 수정 전에는 여기가 24,500,000원짜리 한 줄이었고 isForeign이 true 하나로 덮여 있었다.
  expect(rows).toHaveLength(2);
  const krw = rows.find((r) => !r.isForeign);
  const usd = rows.find((r) => r.isForeign);
  expect(krw).toBeTruthy();
  expect(usd).toBeTruthy();
  // 현재금액 - 각자 자기 금액만 갖는다(원화 1,000만 / 달러 $10,000 × 1,450 = 1,450만).
  expect(krw.cur).toBe(10000000);
  expect(usd.cur).toBe(14500000);
  // 목표금액 - 현재 금액 비중대로 각자 배분된다(합계는 목표 총액 2,450만 그대로).
  expect(krw.tgt + usd.tgt).toBe(24500000);
  expect(krw.tgt).toBe(10000000);
  expect(usd.tgt).toBe(14500000);
  // 차이도 독립적으로 계산된다.
  expect(krw.diff).toBe(0);
  expect(usd.diff).toBe(0);
  // 지역별 목표 매칭 총액과 리밸런싱 대상 총액은 예전과 완전히 같아야 한다(목표 매칭 규칙 무변경).
  const totals = await page.locator('body').evaluate(() => ({
    matched: Math.round(computeRegionTargetAmounts('국내', undefined, '신랑').amounts[0]),
    total: Math.round(getRebalanceTotals('신랑').total),
  }));
  expect(totals.matched).toBe(24500000);
  expect(totals.total).toBe(24500000);
});

test('A-2. [C-1] 원화 자산의 예상 수량 계산에 환율이 섞이지 않는다', async ({ page }) => {
  await seedSameNameTwoCurrencies(page);
  // 목표를 한쪽으로 기울여 diff가 0이 아니게 만든 뒤, 수량 계산에 쓰이는 통화 기준을 확인한다.
  const qty = await page.locator('body').evaluate(() => {
    // 원화 현금만 남기면 그 행은 반드시 원화 기준(isForeign=false)이어야 한다.
    state.assets = state.assets.filter((a) => a.currency === 'KRW');
    persistAssets();
    const r = computeIndividualRebalanceGuide('신랑').rows[0];
    return { isForeign: r.isForeign, qtyText: qtyRebalanceGuideText(r.qtyDelta, r.isForeign) };
  });
  // 수정 전에는 마지막 자산(달러)이 버킷 전체를 대표해 원화 자산까지 isForeign=true가 됐다.
  expect(qty.isForeign).toBe(false);
  expect(qty.qtyText).not.toContain('.'); // 원화는 소수점 없이 반올림한다(qtyRebalanceGuideText)
});

test('B. [환율 회귀] 달러만 환율을 따라 변하고 원화는 변하지 않는다', async ({ page }) => {
  await seedSameNameTwoCurrencies(page);
  // [주의] state는 classic script의 top-level const라 window의 프로퍼티가 아니다 - 반드시 bare
  // 참조로 써야 한다(e2e/fixtures.js 상단 주석과 동일한 제약).
  const at = (rate) => page.evaluate((r) => {
    state.exchangeRate = r;
    persistRate(true);
    const rows = computeIndividualRebalanceGuide('신랑').rows;
    return {
      krw: Math.round(rows.find((x) => !x.isForeign).curAmount),
      usd: Math.round(rows.find((x) => x.isForeign).curAmount),
      total: Math.round(getRebalanceTotals('신랑').total),
    };
  }, rate);

  const a = await at(1450);
  const b = await at(1600);
  expect(a.krw).toBe(10000000);
  expect(b.krw).toBe(10000000); // 원화는 환율에 전혀 영향받지 않는다
  expect(a.usd).toBe(14500000);
  expect(b.usd).toBe(16000000); // 달러는 기존 환산 규칙 그대로 따라간다
  expect(a.total).toBe(24500000);
  expect(b.total).toBe(26000000);
});

test('C. [환차손익 회귀] 통화 분리가 환차손익 계산을 바꾸지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  const fx = await page.locator('body').evaluate(() => {
    state.assets = [
      makeAsset({ ticker: 'AAPL', name: 'C57Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120, buyRate: 1300 }),
      makeAsset({ ticker: '', name: 'C57달러', category: '현금', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 10000, buyPrice: 1, currentPrice: 1, buyRate: 1300 }),
      makeAsset({ ticker: '', name: 'C57원화', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10000000, buyPrice: 1, currentPrice: 1 }),
    ];
    persistAssets();
    const snap = (rate) => {
      state.exchangeRate = rate;
      const pick = (n) => { const r = calcRow(state.assets.find((a) => a.name === n)); return [Math.round(r.buyAmount), Math.round(r.curAmount), Math.round(r.profit)]; };
      return { apple: pick('C57Apple'), usdCash: pick('C57달러'), krwCash: pick('C57원화'), fxPnL: Math.round(computeForeignFxPnL()) };
    };
    return { r1450: snap(1450), r1600: snap(1600) };
  });

  // 매입원가는 취득환율(1,300) 기준, 평가금액은 오늘 환율 기준 - 기존 산식 그대로다.
  expect(fx.r1450.apple).toEqual([13000000, 17400000, 4400000]);
  expect(fx.r1600.apple).toEqual([13000000, 19200000, 6200000]);
  expect(fx.r1450.usdCash).toEqual([13000000, 14500000, 1500000]);
  expect(fx.r1600.usdCash).toEqual([13000000, 16000000, 3000000]);
  // 원화 자산은 환율이 바뀌어도 그대로다(환차손익이 생기지 않는다).
  expect(fx.r1450.krwCash).toEqual([10000000, 10000000, 0]);
  expect(fx.r1600.krwCash).toEqual([10000000, 10000000, 0]);
  // 환차손익 총액 - 환율 상승분 × 외화 매입금액. 중복 계상되거나 사라지지 않는다.
  expect(fx.r1450.fxPnL).toBe(3000000);
  expect(fx.r1600.fxPnL).toBe(6000000);
});

test('D. [C-2] 같은 이름이 양쪽 지역에 있어도 드릴다운이 서로 섞이지 않는다', async ({ page }) => {
  await seedCrossRegionSameLabel(page);
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();

  const card = page.locator('#portfolioTargetSummaryHusband');
  await expect(card).toContainText('국내 · C57달러');
  await expect(card).toContainText('해외 · C57달러');

  // "국내 · C57달러" 행의 드릴다운 안에 해외 보유금액(14,500,000)이 들어 있으면 안 된다.
  // 수정 전에는 label만으로 조회해서 이 행에 해외 달러 1,450만이 첫 줄로 나왔다.
  const bodies = await card.evaluate((el) => {
    const out = {};
    el.querySelectorAll('.portfolio-diag-row-body').forEach((body) => {
      out[body.dataset.diagBodyKey] = body.textContent.replace(/\s+/g, ' ').trim();
    });
    return out;
  });
  const domesticUsdKey = Object.keys(bodies).find((k) => k.includes('국내') && k.includes('C57달러'));
  const foreignUsdKey = Object.keys(bodies).find((k) => k.includes('해외') && k.includes('C57달러'));
  expect(domesticUsdKey).toBeTruthy();
  expect(foreignUsdKey).toBeTruthy();
  // 국내 항목에는 보유가 없으므로 해외 금액이 절대 나오면 안 된다.
  expect(bodies[domesticUsdKey]).not.toContain('14,500,000');
  // 해외 항목에는 실제 보유 금액이 나온다.
  expect(bodies[foreignUsdKey]).toContain('14,500,000');
});

test('D-2. [C-4] 목표가 저장된 지역과 실제 보유 지역이 다르면 한 줄로 알린다', async ({ page }) => {
  await seedCrossRegionSameLabel(page);
  const flags = await page.locator('body').evaluate(() =>
    computePortfolioTargetSummaryRows('신랑').rows.map((r) => [`${r.region}|${r.label}`, r.mismatchRegion || null]));

  // 국내에 저장된 'C57달러' 목표는 실제 보유분이 해외에 있다 - 그 사실만 알린다(자동 이동 없음).
  expect(flags).toContainEqual(['국내|C57달러', '해외']);
  expect(flags).toContainEqual(['해외|C57원화', '국내']);
  // 실제로 보유분이 잡히는 항목에는 경고가 붙지 않는다.
  expect(flags).toContainEqual(['국내|C57원화', null]);
  expect(flags).toContainEqual(['해외|C57달러', null]);

  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();
  await expect(page.locator('#portfolioTargetSummaryHusband')).toContainText('같은 이름의 보유분이 해외에 있습니다');

  // [자동 수정 금지] 목표는 저장된 그대로 남아 있어야 한다.
  const stillThere = await page.locator('body').evaluate(() => ({
    국내: state.rebalance['신랑'].targets['국내'].map((t) => t.name),
    해외: state.rebalance['신랑'].targets['해외'].map((t) => t.name),
  }));
  expect(stillThere['국내']).toEqual(['C57원화', 'C57달러']);
  expect(stillThere['해외']).toEqual(['C57원화', 'C57달러']);
});

test('E. [C-3] 실행 가이드 카드가 국내/해외와 통화를 구분해 보여주고 375px에서 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedCrossRegionSameLabel(page);
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('포트폴리오 구성', { exact: true }).click();

  // 신랑 실행 가이드 아코디언을 펼친다.
  const guide = page.locator('#rebalanceGuideAccordionsContainer');
  await guide.getByRole('button', { name: /신랑 실행 가이드/ }).click();
  const body = guide.locator('[data-guide-body-key="신랑"]');
  await expect(body).toContainText('국내');
  await expect(body).toContainText('해외');
  await expect(body).toContainText('USD'); // 달러 자산에만 붙는 통화 칩

  // 색이 아니라 글자로 구분한다 - 지역 칩이 실제 텍스트 노드로 존재하는지 확인한다.
  const chipTexts = await body.evaluate((el) =>
    Array.from(el.querySelectorAll('span')).map((s) => s.textContent.trim()).filter((t) => t === '국내' || t === '해외' || t === 'USD'));
  expect(chipTexts).toContain('국내');
  expect(chipTexts).toContain('해외');
  expect(chipTexts).toContain('USD');

  // 14px 미만 텍스트가 생기지 않아야 한다(Global Readability Policy 3~5항).
  const tooSmall = await body.evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    return Array.from(el.querySelectorAll('*'))
      .filter((n) => n.children.length === 0 && n.textContent.trim() !== '')
      .filter((n) => parseFloat(win.getComputedStyle(n).fontSize) < 14).length;
  });
  expect(tooSmall).toBe(0);

  // 가로 스크롤이 생기면 안 된다. (e2e 스코프에는 browser 전역이 없어 ownerDocument로 접근한다)
  const overflow = await page.locator('body').evaluate((el) => {
    const root = el.ownerDocument.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('F. [회귀] 티커가 있는 자산의 기존 매칭·수량 계산은 그대로다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  const out = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450;
    persistRate(true);
    state.assets = [
      makeAsset({ ticker: '005930.KS', name: 'C57삼성', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000, currentPrice: 80000 }),
      makeAsset({ ticker: '005930.KS', name: 'C57삼성', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '일반계좌', quantity: 50, buyPrice: 70000, currentPrice: 80000 }),
      makeAsset({ ticker: 'AAPL', name: 'C57Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120 }),
    ];
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 50, '해외': 50 };
      state.rebalance[owner].targets = {
        '국내': [{ type: 'ticker', ticker: '005930.KS', label: 'C57삼성', pct: 100 }],
        '해외': [{ type: 'ticker', ticker: 'AAPL', label: 'C57Apple', pct: 100 }],
      };
    });
    persistAssets();
    persistRebalance();
    return {
      rows: computeIndividualRebalanceGuide('신랑').rows.map((r) => [r.region, r.name, r.ticker, r.owners.join('+'), Math.round(r.curAmount), r.isForeign]),
      total: Math.round(getRebalanceTotals('신랑').total),
      projGroup: Object.fromEntries(Object.entries(getProjectionGroupStats('신랑')).map(([k, v]) => [k, Math.round(v.value)])),
      det20y: Math.round(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total),
    };
  });

  // 티커 자산은 예전과 동일하게 티커 하나로 묶인다(소유자만 합산 - 통화는 티커가 이미 결정한다).
  expect(out.rows).toEqual([
    ['해외', 'C57Apple', 'AAPL', '신랑', 17400000, true],
    ['국내', 'C57삼성', '005930.KS', '신랑', 8000000, false],
  ]);
  expect(out.total).toBe(25400000);
  // 미래예측 입력(원금 그룹)과 결과가 이 수정으로 바뀌지 않았음을 함께 고정한다.
  expect(out.projGroup).toEqual({ KOSPI: 8000000, AAPL: 17400000 });
  expect(out.det20y).toBe(1512366546);
});
