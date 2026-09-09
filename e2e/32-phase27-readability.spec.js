// E2E-32 Phase 27 - 전역 가독성(14px 하한) + 금액 천 단위 구분자 회귀.
//
// [기준] 「절세계좌 현황」 타이틀의 실측값(14px / weight 600 / line-height 20px, Tailwind text-sm)을
// 일반 사용자 노출 텍스트의 최소 가독성 기준으로 삼는다. 이 기준보다 작은 글자를 다시 만들지 않는다.
// 공간이 부족하다고 글자를 줄이는 회귀를 막는 것이 이 파일의 목적이다.
//
// [ESLint 규약] page.evaluate 안에서 raw 브라우저 전역을 쓰지 않고 locator.evaluate로 요소를 받는다.
const { test, expect } = require('@playwright/test');

const MIN_FONT_PX = 14;
const VIEWPORTS = [[375, 812], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900]];

const scrollWidthOf = (page) => page.locator('body').evaluate((el) => el.scrollWidth);
const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));

// 화면에 보이는 리프 텍스트 중 기준 미만인 것을 모은다.
const tinyTexts = (page) => page.locator('#app').evaluate((root, min) => {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  return [...root.querySelectorAll('*')].filter((el) => {
    if (el.children.length) return false;
    const t = (el.textContent || '').trim();
    if (!t) return false;
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (el.closest('canvas, svg')) return false; // 차트 내부는 정책 예외
    return parseFloat(s.fontSize) < min;
  }).map((el) => `${win.getComputedStyle(el).fontSize} | ${(el.textContent || '').trim().slice(0, 30)}`);
}, MIN_FONT_PX);

// 콤마 없는 4자리 이상 숫자 + 금액 단위 = 포매터를 우회한 금액 표시
const unformattedAmounts = (page) => page.locator('#app').evaluate((root) => {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const re = /(?<![\d,])\d{4,}(?=\s*(원|만원|억))/;
  const out = [];
  const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || el.closest('input, textarea, script, style')) continue;
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (re.test(t)) out.push(t.slice(0, 50));
  }
  return out;
});

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: '삼성전자', ticker: '005930.KS', category: '주식', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1000, buyPrice: 70000, currentPrice: 80000, currency: 'KRW' }),
      makeAsset({ name: '국고채', category: '채권', owner: '와이프', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 200000000, currentPrice: 200000000, currency: 'KRW' }),
      makeAsset({ name: 'ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', isDomestic: '국내', quantity: 1, buyPrice: 50000000, currentPrice: 50000000, currency: 'KRW' })
    ];
    persistAssets();
    state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'ticker', ticker: '005930.KS', label: '삼성전자', pct: 100, role: '공격수' }], '해외': [] } };
    persistRebalance();
    state.projection.monthlyContributionByOwner = { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 500000, years: null, allocation: [] } };
    persistProjection();
    renderAll();
  });
}

for (const [w, h] of VIEWPORTS) {
  for (const dark of [true, false]) {
    test(`${w}x${h} ${dark ? 'Dark' : 'Light'} - 14px 하한 유지 + 금액 포맷 + 무오버플로`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await seed(page);
      if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
      expect(await isDark(page)).toBe(dark);

      const tabs = ['dashboard', 'investmentDetail', 'transactions', 'rebalance'];
      for (const t of tabs) {
        await page.locator(`[data-tab="${t}"]`).click();
        await page.waitForTimeout(250);
        expect(await tinyTexts(page), `${t} 14px 미만 텍스트`).toEqual([]);
        expect(await unformattedAmounts(page), `${t} 천단위 미적용 금액`).toEqual([]);
        expect(await scrollWidthOf(page), `${t} 가로 overflow`).toBeLessThanOrEqual(w);
      }
      // 미래예측 서브탭까지 확인한다(금액/설명문이 가장 많은 화면)
      await page.locator('[data-subtab="projection"]').click();
      await page.waitForTimeout(400);
      expect(await tinyTexts(page), 'projection 14px 미만 텍스트').toEqual([]);
      expect(await unformattedAmounts(page), 'projection 천단위 미적용 금액').toEqual([]);
      expect(await scrollWidthOf(page), 'projection 가로 overflow').toBeLessThanOrEqual(w);
    });
  }
}

test('기준 타이틀(「절세계좌 현황」)이 14px/600 그대로다 - 이 값이 정책의 기준점', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.locator('[data-tab="rebalance"]').click();
  await page.locator('[data-subtab="projection"]').click();
  const title = page.getByRole('heading', { name: /절세계좌 현황/ });
  const css = await title.evaluate((el) => {
    const s = el.ownerDocument.defaultView.getComputedStyle(el);
    return { fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight };
  });
  expect(css).toEqual({ fontSize: '14px', fontWeight: '600', lineHeight: '20px' });
});

test('주요 모달에서도 14px 하한과 금액 포맷이 유지된다(375px Dark)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  if (!(await isDark(page))) await page.locator('#darkModeBtn').click();
  await page.locator('[data-tab="rebalance"]').click();

  await page.locator('[data-rebalance-detail-btn][data-owner="신랑"]').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeVisible();
  expect(await tinyTexts(page), '목표비중 모달').toEqual([]);
  expect(await unformattedAmounts(page), '목표비중 모달 금액').toEqual([]);
  await page.locator('#cancelRebalanceTargetModalBtn').click();

  await page.locator('[data-subtab="projection"]').click();
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
  expect(await tinyTexts(page), '적립금 설정 모달').toEqual([]);
  await page.locator('#cancelMonthlyContributionAllocationModalBtn').click();

  await page.locator('#taxAdvantagedPlanBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeVisible();
  expect(await tinyTexts(page), '절세계좌 모달').toEqual([]);
  expect(await unformattedAmounts(page), '절세계좌 모달 금액').toEqual([]);
  await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [FUTURE-P1 Phase 3-2] Monte Carlo 결과 영역 가독성 가드 (375px Light / Dark)
 *
 * 왜 필요한가: 위 뷰포트 루프는 projection 탭을 열기만 하고 [Monte Carlo 실행]을 누르지 않는다.
 * 그래서 화면에서 가장 숫자가 많은 영역(결과 표/범위 막대/계좌 범위 선택)이 지금까지 이 가드의
 * 보호를 한 번도 받지 못했다.
 *
 * 왜 실제 실행 대신 렌더러에 주입하는가: 이 파일의 목적은 계산 검증이 아니라 레이아웃/타이포그래피
 * 검증이다. 10,000회 시뮬레이션을 뷰포트마다 돌리면 느리고, 시장 데이터에 의존해 flaky해진다.
 * 계산의 정확성은 test/monte-carlo-engine.test.js와 test/mc-*.test.js가 이미 고정한다.
 * ═══════════════════════════════════════════════════════════════════════════ */

// 엔진(js/15) 출력과 같은 모양의 합성 결과를 실제 렌더러에 그대로 통과시킨다 - 렌더러/DOM/CSS는
// 전부 앱의 실제 코드다. 값은 자릿수가 큰 쪽(억 단위)으로 잡아 숫자 잘림이 드러나게 한다.
const renderSyntheticMcResult = (page) => page.locator('body').evaluate((el) => {
  const win = el.ownerDocument.defaultView;
  const ms = (base) => [5, 10, 15, 20].map((y, i) => ({
    year: y, mean: base * (1 + i), p10: base * 0.6 * (1 + i), p25: base * 0.8 * (1 + i),
    p50: base * (1 + i), p75: base * 1.3 * (1 + i), p90: base * 1.8 * (1 + i),
    goalProbability: { 1000000000: 0.423 },
  }));
  win.renderMonteCarloResult(
    {
      mode: 'official', simulations: 10000, years: 20, assets: 3,
      milestones: ms(3e8),
      accountScopes: { general: ms(3e8), taxAdvantaged: ms(9e7), combined: ms(3.9e8) },
      safety: { status: 'OK', issues: [], dataQuality: { issues: [] }, modelRisk: { issues: [] } },
      diagnostics: {},
    },
    2.5,
    { rawAmount: 1000000000, mode: 'nominal', nominalGoalAmount: 1000000000, targetYears: 20 },
    { initialMonthly: 3000000, growthRatePct: 0, years: 20, streams: [{ monthly: 3000000, years: null }], ownerScope: null },
    0.15
  );
});

// 가로로 잘리는 요소를 찾는다 - 폰트를 줄이지 않고 정보를 밀어 넣으면 여기서 드러난다.
// (자기 자신이 overflow-x-auto인 컨테이너는 스크롤이 정상 동작이므로 제외한다.)
const clippedElements = (page) => page.locator('#mcResultArea').evaluate((root) => {
  const win = root.ownerDocument.defaultView;
  return [...root.querySelectorAll('*')].filter((el) => {
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') return false;
    return el.scrollWidth - el.clientWidth > 1;
  }).map((el) => `${el.id || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
});

for (const dark of [true, false]) {
  test(`375x812 ${dark ? 'Dark' : 'Light'} - Monte Carlo 결과 영역이 14px 하한/금액 포맷/무오버플로를 지킨다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page);
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);

    await page.locator('[data-tab="rebalance"]').click();
    await page.locator('[data-subtab="projection"]').click();
    await renderSyntheticMcResult(page);
    await expect(page.locator('#mcResultArea')).toBeVisible();

    // 결과의 핵심 구성요소가 전부 화면에 있어야 한다(하나라도 빠지면 가드가 헛돈다).
    await expect(page.locator('#mcAccountScopeArea')).toBeVisible();   // 계좌 범위
    await expect(page.locator('#mcMilestoneSegmented')).toBeVisible(); // 기간
    await expect(page.locator('#mcP50Text')).toBeVisible();            // P50
    await expect(page.locator('#mcMilestoneTableBody')).toBeVisible(); // P10~P90 × milestone
    await expect(page.locator('#mcGoalArea')).toBeVisible();           // 목표 도달 가능성
    await page.locator('#mcRangeBarsToggleBtn').click();               // 범위 막대(접힘 해제)
    await expect(page.locator('#mcRangeBarsArea')).toBeVisible();

    expect(await tinyTexts(page), 'MC 결과 14px 미만 텍스트').toEqual([]);
    expect(await unformattedAmounts(page), 'MC 결과 천단위 미적용 금액').toEqual([]);
    expect(await scrollWidthOf(page), 'MC 결과 가로 overflow').toBeLessThanOrEqual(375);
    expect(await clippedElements(page), 'MC 결과 잘린 요소').toEqual([]);

    // 명목/현재가치가 둘 다, 서로 구분되는 라벨로 보여야 한다.
    const p50Box = await page.locator('#mcP50Text').locator('..').innerText();
    expect(p50Box).toContain('명목가치');
    expect(p50Box).toContain('현재가치 기준');
    // 터치 기기에서도 P10~P90을 읽을 수 있어야 한다(title 속성 의존 금지).
    const headerText = await page.locator('table:has(#mcMilestoneTableBody) thead').innerText();
    ['P10', 'P25', 'P50', 'P75', 'P90'].forEach((code) => expect(headerText).toContain(code));

    // 44px 터치 타겟 - 새로 생긴 선택 컨트롤도 기존 기준을 지킨다.
    for (const sel of ['#mcScopeSegmented button', '#mcMilestoneSegmented button']) {
      const heights = await page.locator(sel).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThan(0);
      heights.forEach((h) => expect(h).toBeGreaterThanOrEqual(44));
    }
  });
}
