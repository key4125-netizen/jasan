// E2E-94 [v248-1] 미래예측 화면 정비 · 적립계획 카드 재배치 · 탭 명칭 "포트폴리오 설정"(checklist §36) - 모바일 우선 회귀.
//
// 고정하는 계약:
//   TAB  서브탭 표시 이름은 [포트폴리오 설정] [미래 예측]. 내부 key(data-subtab="target"/"projection")는 그대로.
//   A    [적립금 설정]은 포트폴리오 설정 탭의 "일반계좌 적립계획" 카드에서 기존 팝업을 그대로 연다.
//   B    적립금을 바꾸면 미래예측 결과가 기존 계산(simulateRebalancedPreset) 그대로 바뀐다.
//   C/D  "절세계좌 적립계획" 카드의 신랑/와이프 계좌 세부가 각각 펼쳐진다(서로 섞이지 않음).
//   E    인플레이션율 · [가정 수정]은 MC 카드의 운용보수 설정 바로 아래에 있고 기존 팝업/저장을 그대로 쓴다.
//   G    성장률 3개는 "지금 계획대로면" 제목 아래에 "보수적/일반적/긍정적 N%"로, 기존 계산값 그대로 보인다.
//   H    20년 후 참고값 = 일반계좌 / 절세계좌 / 합계. [PM 결정 A] 합계 = 일반계좌 + 절세계좌(부동산 제외).
//        기존 totalScenarioData(공식 총자산 = 일반 + 절세 + 부동산) 계산은 그대로 남아 있어야 한다.
//   I    삭제된 UI(세부 항목 보기 · 나의 투자계획 · 목표비중 보기 · 성장률별 참고 결과)는 화면에 없다.
//
// 새 계산식은 없다 - 기대값은 전부 앱 자신의 기존 계산 함수를 page.evaluate로 호출해 얻는다.
// page.evaluate 콜백은 브라우저에서 실행된다 - 그 안에서만 쓰는 브라우저 전역을 ESLint(e2e = node 전역)에 알린다.
/* global document, getComputedStyle, window */
const { test, expect } = require('@playwright/test');
const { seedPriceHistory } = require('./fixtures');

const TOUCH_MIN = 43.9;

async function seed(page, { realEstate = false } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate((withRealEstate) => {
    state.assets = [
      makeAsset({ name: 'E94신랑채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW' }),
      makeAsset({ name: 'E94와이프채권', category: '채권', owner: '와이프', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 200000000, currentPrice: 200000000, currency: 'KRW' }),
      makeAsset({ name: 'E94신랑ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', isDomestic: '국내', quantity: 1, buyPrice: 50000000, currentPrice: 50000000, currency: 'KRW' }),
      makeAsset({ name: 'E94와이프IRP채권', category: '채권', owner: '와이프', accountType: 'IRP', isDomestic: '국내', quantity: 1, buyPrice: 30000000, currentPrice: 30000000, currency: 'KRW' })
    ];
    if (withRealEstate) {
      state.assets.push(makeAsset({ name: 'E94부동산', category: '부동산', owner: '공동', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 400000000, currentPrice: 400000000, currency: 'KRW' }));
    }
    persistAssets();
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: 'E94신랑채권', label: 'E94신랑채권', pct: 100, role: '수비수' }];
    state.rebalance['와이프'].targets['국내'] = [{ type: 'namedHolding', name: 'E94와이프채권', label: 'E94와이프채권', pct: 100, role: '수비수' }];
    persistRebalance();
    state.projection.inflationRate = 2.5;
    state.projection.contributionGrowthRate = 0;
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 2000000, years: null, allocation: [] },
      '와이프': { total: 1000000, years: null, allocation: [] }
    };
    state.projection.taxAdvantagedPlan.contributionByOwnerAccount = {
      '신랑': [{ accountType: 'ISA', frequency: 'monthly', amount: 500000, years: 15 }],
      '와이프': [{ accountType: 'IRP', frequency: 'yearly', amount: 6000000, years: 15 }]
    };
    state.projection.taxAdvantagedPlan.allocationByOwner = { '신랑': [], '와이프': [] };
    persistProjection();
  }, realEstate);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
}

const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
async function setTheme(page, dark) {
  if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
  expect(await isDark(page)).toBe(dark);
}
const toSettings = (page) => page.getByText('포트폴리오 설정', { exact: true }).click();
const toProjection = (page) => page.getByText('미래 예측', { exact: true }).click();
const docOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ------------------------------------------------------------------ 탭 명칭 ------------------------------------------------------------------ */

for (const [label, w, dark] of [['375 Dark', 375, true], ['375 Light', 375, false], ['390 Dark', 390, true], ['412 Light', 412, false]]) {
  test(`TAB (${label}) - [포트폴리오 설정] [미래 예측]이 잘리지 않고, 내부 key 그대로 전환된다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await seed(page);
    await setTheme(page, dark);
    const settingsTab = page.locator('[data-subtab="target"]');
    const projectionTab = page.locator('[data-subtab="projection"]');
    await expect(settingsTab).toHaveText('포트폴리오 설정');
    await expect(projectionTab).toHaveText('미래 예측');
    for (const tab of [settingsTab, projectionTab]) {
      const m = await tab.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      expect(m.h).toBeGreaterThanOrEqual(TOUCH_MIN);
    }
    await expect(page.locator('body')).not.toContainText('일반계좌 포트폴리오');

    await toProjection(page);
    await expect(projectionTab).toHaveClass(/active/);
    await expect(page.locator('#tabPanelProjection')).toBeVisible();
    await expect(page.locator('#rebalanceSubTarget')).toBeHidden();
    expect(await page.evaluate(() => rebalanceSubTab)).toBe('projection');
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);

    await toSettings(page);
    await expect(settingsTab).toHaveClass(/active/);
    await expect(page.locator('#rebalanceSubTarget')).toBeVisible();
    await expect(page.locator('#tabPanelProjection')).toBeHidden();
    expect(await page.evaluate(() => rebalanceSubTab)).toBe('target');
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);
  });
}

/* ------------------------------------------------------- 포트폴리오 설정 탭 - 카드 순서 · 색 · 모바일 ------------------------------------------------------- */

for (const [label, dark] of [['375 Dark', true], ['375 Light', false]]) {
  test(`순서/색 (${label}) - 고급 → 일반계좌 적립계획 → 절세계좌 적립계획, 계획 카드는 분석/고급 카드와 구분된다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page);
    await setTheme(page, dark);
    await toSettings(page);

    const plan = page.locator('#generalContributionPlanCard');
    const tax = page.locator('#taxContributionPlanCard');
    await expect(plan).toBeVisible();
    await expect(tax).toBeVisible();
    // 두 카드 모두 포트폴리오 설정 컨테이너 안에 있고, 미래예측 패널에는 없다.
    expect(await plan.evaluate((el) => !!el.closest('#rebalanceSubTarget'))).toBe(true);
    expect(await tax.evaluate((el) => !!el.closest('#rebalanceSubTarget'))).toBe(true);
    await expect(page.locator('#tabPanelProjection #monthlyContributionSummary')).toHaveCount(0);
    await expect(page.locator('#tabPanelProjection #taxAdvantagedSummary')).toHaveCount(0);

    const order = await page.evaluate(() => {
      const top = (id) => document.getElementById(id).getBoundingClientRect().top;
      return { adv: top('openScenarioRateManagerBtn'), plan: top('generalContributionPlanCard'), tax: top('taxContributionPlanCard') };
    });
    expect(order.adv).toBeLessThan(order.plan);
    expect(order.plan).toBeLessThan(order.tax);

    await expect(plan.locator('h3')).toHaveText('💰 일반계좌 적립계획');
    await expect(tax.locator('h3')).toHaveText('🏦 절세계좌 적립계획');

    const colors = await page.evaluate(() => {
      const bg = (el) => getComputedStyle(el).backgroundColor;
      return {
        plan: bg(document.getElementById('generalContributionPlanCard')),
        tax: bg(document.getElementById('taxContributionPlanCard')),
        adv: bg(document.getElementById('openScenarioRateManagerBtn')),
        analysis: bg(document.getElementById('positionAnalysisCardAll').closest('section')),
        titleColor: getComputedStyle(document.querySelector('#generalContributionPlanCard h3')).color,
        titleBg: bg(document.body)
      };
    });
    expect(colors.plan).toBe(colors.tax); // 같은 "계획" 계열
    expect(colors.plan).not.toBe(colors.adv);
    expect(colors.plan).not.toBe(colors.analysis);
    expect(colors.titleColor).not.toBe(colors.titleBg);

    // 모바일: 가로 넘침 없음 · 버튼 44px · 글자 14px 이상 · 카드 텍스트 잘림 없음
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);
    for (const sel of ['#openMonthlyContributionAllocationBtn', '#taxAdvantagedPlanBtn']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    const tiny = await page.evaluate(() => [...document.querySelectorAll('#generalContributionPlanCard *, #taxContributionPlanCard *')]
      .filter((el) => el.children.length === 0 && el.textContent.trim() && el.offsetParent !== null)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 14 || el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim()));
    expect(tiny).toEqual([]);
  });
}

test('TEST-A - [적립금 설정]이 기존 팝업을 열고, 저장값이 일반계좌 적립계획 요약에 반영된다', async ({ page }) => {
  await seed(page);
  await toSettings(page);
  await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,000,000원');
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
  await page.locator('#monthlyContributionTotalInputHusband').fill('2500000');
  await page.locator('#saveMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
  await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,500,000원');
  expect(await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑'].total)).toBe(2500000);
  // 저장/복원 - 새로고침 후에도 같은 값이다.
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
  await toSettings(page);
  await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,500,000원');
});

test('TEST-B - 적립금 변경이 미래예측 결과에 기존 계산 그대로 반영된다', async ({ page }) => {
  await seed(page);
  await toProjection(page);
  const before = await page.locator('#projectionHeroFuture').innerText();
  await toSettings(page);
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await page.locator('#monthlyContributionTotalInputWife').fill('3000000');
  await page.locator('#saveMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
  await toProjection(page);
  const expected = await page.evaluate(() => fmtKRWShort(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total));
  await expect(page.locator('#projectionHeroFuture')).toHaveText(expected);
  expect(expected).not.toBe(before);
  await expect(page.locator('#projectionHeroMonthly')).toHaveText(await page.evaluate(() => `${fmtKRWShort(getHouseholdMonthlyContributionTotal())}/월`));
});

test('TEST-C/D - 절세계좌 적립계획의 신랑/와이프 계좌 세부가 각각 펼쳐지고, 금액 라벨은 "현재 절세계좌 금액"이다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await toSettings(page);
  const card = page.locator('#taxContributionPlanCard');
  await expect(card).toContainText('현재 절세계좌 금액');
  await expect(card).not.toContainText('합계 평가금액');
  await expect(card).not.toContainText('Monte Carlo');
  await expect(card).not.toContainText('확인하세요');
  const holdings = await page.evaluate(() => {
    const h = getTaxAdvantagedHoldingsByOwner();
    return { total: fmtKRWShort(h['신랑'].total + h['와이프'].total), husband: fmtKRWShort(h['신랑'].total), wife: fmtKRWShort(h['와이프'].total) };
  });
  await expect(card.locator('#taxAdvantagedSummary')).toContainText(holdings.total);

  const hBody = page.locator('#taxAdvantagedHusbandAccordionBody');
  const wBody = page.locator('#taxAdvantagedWifeAccordionBody');
  await expect(hBody).toHaveCSS('max-height', '0px');
  await expect(wBody).toHaveCSS('max-height', '0px');
  await expect(page.locator('#taxAdvantagedHusbandAccordionBtn')).toContainText(holdings.husband);
  await expect(page.locator('#taxAdvantagedWifeAccordionBtn')).toContainText(holdings.wife);

  await page.locator('#taxAdvantagedHusbandAccordionBtn').click();
  await expect(hBody).not.toHaveCSS('max-height', '0px');
  await expect(hBody).toContainText('ISA');
  await expect(wBody).toHaveCSS('max-height', '0px'); // 서로 섞이지 않는다

  await page.locator('#taxAdvantagedWifeAccordionBtn').click();
  await expect(wBody).not.toHaveCSS('max-height', '0px');
  await expect(wBody).toContainText('IRP');
  await expect(hBody).not.toHaveCSS('max-height', '0px');
  expect(await docOverflow(page)).toBeLessThanOrEqual(0);

  // 탭을 옮기면 기존 규칙대로 다시 접힌다(resetAllAccordionsOnTabSwitch).
  await toProjection(page);
  await toSettings(page);
  await expect(hBody).toHaveCSS('max-height', '0px');
  await expect(wBody).toHaveCSS('max-height', '0px');

  // [적립설정] 팝업도 그대로 열린다.
  await page.locator('#taxAdvantagedPlanBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeVisible();
  await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).toBeHidden();
});

/* ------------------------------------------------------------------ 미래예측 탭 ------------------------------------------------------------------ */

test('TEST-E - 인플레이션율 · [가정 수정]이 MC 카드의 운용보수 설정 바로 아래에 있고 기존 팝업/저장이 동작한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await toProjection(page);
  const pos = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const mc = document.getElementById('mcRunBtn').closest('section');
    return {
      inMc: mc.contains(document.getElementById('openProjectionAssumptionsBtn')) && mc.contains(document.getElementById('projectionInflationSummary')),
      inHero: document.getElementById('projectionHeroSummary').contains(document.getElementById('projectionInflationSummary')),
      feeBottom: r('mcFeeRatesToggleBtn').bottom, btnTop: r('openProjectionAssumptionsBtn').top, btnBottom: r('openProjectionAssumptionsBtn').bottom, runTop: r('mcRunBtn').top,
      btnRight: r('openProjectionAssumptionsBtn').right
    };
  });
  expect(pos.inMc).toBe(true);
  expect(pos.inHero).toBe(false);
  expect(pos.feeBottom).toBeLessThanOrEqual(pos.btnTop);
  expect(pos.btnBottom).toBeLessThanOrEqual(pos.runTop);
  expect(pos.btnRight).toBeLessThanOrEqual(375);
  await expect(page.locator('#projectionInflationSummary')).toHaveText('2.5%');
  expect((await page.locator('#openProjectionAssumptionsBtn').boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);

  await page.locator('#openProjectionAssumptionsBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeVisible();
  await page.locator('#inflationRateInput').fill('3');
  await page.locator('#saveProjectionAssumptionsModalBtn').click();
  await expect(page.locator('#projectionAssumptionsModal')).toBeHidden();
  await expect(page.locator('#projectionInflationSummary')).toHaveText('3%');
  await expect(page.locator('#projectionPlanInflationText')).toHaveText('3%');
  expect(await page.evaluate(() => state.projection.inflationRate)).toBe(3);
  expect(await docOverflow(page)).toBeLessThanOrEqual(0);
});

test('TEST-G - 성장률 3개가 "지금 계획대로면" 제목 아래에 기존 값 그대로 "보수적/일반적/긍정적 N%"로 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await toProjection(page);
  const expected = await page.evaluate(() => ['conservative', 'normal', 'optimistic'].map((k) => `${fmtNum(simulateRebalancedPreset(k, 20).weightedAvgRate, 2)}%`));
  const chips = page.locator('#scenarioSummaryCardsGrid > div');
  await expect(chips).toHaveCount(3);
  const names = ['보수적', '일반적', '긍정적'];
  for (let i = 0; i < 3; i++) {
    await expect(chips.nth(i).locator('p').first()).toHaveText(names[i]);
    await expect(chips.nth(i).locator('p').nth(1)).toHaveText(expected[i]);
  }
  const hero = page.locator('#projectionHeroSummary');
  await expect(hero).not.toContainText('목표배분');
  await expect(hero).not.toContainText('기준 연간 성장률');
  const layout = await page.evaluate(() => {
    const title = [...document.querySelectorAll('#projectionHeroSummary p')].find((p) => p.textContent.trim() === '지금 계획대로면');
    const grid = document.getElementById('scenarioSummaryCardsGrid');
    const cur = document.getElementById('projectionHeroCurrent');
    const cells = [...grid.children].map((c) => ({ top: c.getBoundingClientRect().top, right: c.getBoundingClientRect().right, sw: c.scrollWidth, cw: c.clientWidth }));
    return {
      below: title.getBoundingClientRect().bottom <= grid.getBoundingClientRect().top,
      aboveCurrent: grid.getBoundingClientRect().bottom <= cur.getBoundingClientRect().top,
      oneRow: cells.every((c) => Math.abs(c.top - cells[0].top) < 1),
      clipped: cells.filter((c) => c.sw > c.cw + 1).length,
      maxRight: Math.max(...cells.map((c) => c.right)),
      minFont: Math.min(...[...grid.querySelectorAll('p')].map((p) => parseFloat(getComputedStyle(p).fontSize)))
    };
  });
  expect(layout.below).toBe(true);
  expect(layout.aboveCurrent).toBe(true);
  expect(layout.oneRow).toBe(true);
  expect(layout.clipped).toBe(0);
  expect(layout.maxRight).toBeLessThanOrEqual(375);
  expect(layout.minFont).toBeGreaterThanOrEqual(14);
});

for (const realEstate of [false, true]) {
  test(`TEST-H - 20년 후 일반계좌/절세계좌/합계가 기존 계산 결과와 같다(부동산 ${realEstate ? '있음' : '없음'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page, { realEstate });
    await toProjection(page);
    // 기존 계산 함수로 독립적으로 다시 구한 원시값 - updateProjection의 totalScenarioData와 같은 항 · 같은 순서.
    // 동시에 updateProjection이 히어로에 넘기는 totalScenarioData(normal)를 그대로 받아, 그 계산이 바뀌지 않았는지 대조한다.
    const exp = await page.evaluate(() => {
      const general = simulateRebalancedPreset('normal', 20).yearlyPoints[20].total;
      const tax = TAX_ADVANTAGED_OWNERS.map((o) => simulateTaxAdvantagedOwnerYearlyPoints(o, 'normal', 20)).reduce((s, pts) => s + pts[20].total, 0);
      const reValue = state.assets.filter((a) => a.category === '부동산').reduce((s, a) => s + calcRow(a).curAmount, 0);
      const re = computeFutureValue(reValue, getReferenceRate('normal', '부동산'), 20, 0);
      let captured = null;
      const original = window.renderProjectionHeroSummary;
      window.renderProjectionHeroSummary = (presetResults, offsets, totalNormal) => { captured = totalNormal.points[20]; return original(presetResults, offsets, totalNormal); };
      try { updateProjection(true); } finally { window.renderProjectionHeroSummary = original; }
      return {
        general: fmtKRWShort(general), tax: fmtKRWShort(tax),
        generalPlusTax: fmtKRWShort(general + tax), // 원시값을 더한 뒤 표시 형식만 적용
        withRealEstate: fmtKRWShort(general + tax + re),
        re, taxRaw: tax,
        scenario: captured && {
          generalSame: captured.general === general, taxSame: captured.taxAdvantaged === tax,
          reSame: captured.realEstate === re, totalSame: captured.total === general + tax + re
        }
      };
    });
    await expect(page.locator('#projectionHeroFutureLabel')).toHaveText('20년 후 자산 참고값');
    await expect(page.locator('#projectionHeroFuture')).toHaveText(exp.general);
    await expect(page.locator('#projectionHeroFutureTax')).toHaveText(exp.tax);
    await expect(page.locator('#projectionHeroFutureTotalLabel')).toHaveText('합계');
    await expect(page.locator('#projectionHeroFutureTotal')).toHaveText(exp.generalPlusTax); // 부동산 유무와 무관하게 일반 + 절세
    await expect(page.locator('#projectionHeroSummary')).not.toContainText('부동산 포함');
    expect(exp.taxRaw).toBeGreaterThan(0);
    // 기존 totalScenarioData(공식 총자산) 계산은 그대로다 - 일반 · 절세 · 부동산 항과 total이 한 자리도 다르지 않다.
    expect(exp.scenario).toEqual({ generalSame: true, taxSame: true, reSame: true, totalSame: true });
    if (realEstate) {
      expect(exp.re).toBeGreaterThan(0);
      expect(exp.withRealEstate).not.toBe(exp.generalPlusTax); // 부동산이 있어도 카드 합계에는 들어가지 않는다
      await expect(page.locator('#projectionHeroFutureTotal')).not.toHaveText(exp.withRealEstate);
    } else {
      expect(exp.re).toBe(0);
    }
    // 세 칸이 잘리지 않고 한 줄에 나란하며, 값 줄이 같은 높이에 정렬된다.
    const cells = await page.evaluate(() => ['projectionHeroFuture', 'projectionHeroFutureTax', 'projectionHeroFutureTotal'].map((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { bottom: Math.round(r.bottom), right: r.right, sw: el.scrollWidth, cw: el.clientWidth };
    }));
    expect(new Set(cells.map((c) => c.bottom)).size).toBe(1);
    cells.forEach((c) => { expect(c.sw).toBeLessThanOrEqual(c.cw + 1); expect(c.right).toBeLessThanOrEqual(375); });
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test('TEST-I - 삭제된 UI가 화면에 없고, 미래예측 탭의 카드 구성이 정리되어 있다', async ({ page }) => {
  await seed(page);
  await toProjection(page);
  for (const sel of ['#projectionAssumptionsAccordionBtn', '#projectionAssumptionsAccordionBody', '#projectionAssumptionsList',
    '#goToRebalanceTargetBtn', '#scenarioSectionAccordionBtn', '#scenarioViewToggle', '#scenarioCompareChart', '#totalAssetCompareChart',
    '#scenarioCompareScheduleBody', '#totalAssetCompareScheduleBody']) {
    await expect(page.locator(sel)).toHaveCount(0);
  }
  const panel = page.locator('#tabPanelProjection');
  for (const text of ['세부 항목 보기', '이 계산은 이런 가정을 사용했어요', '나의 투자계획', '목표비중 보기', '포트폴리오 구성 탭', '성장률별 참고 결과', '성장률별 결과 보기', '절세계좌 현황', '여기부터는 참고 계산입니다']) {
    await expect(panel).not.toContainText(text);
  }
  // 계산 데이터 자체는 남아 있다 - 기존 계산 함수가 그대로 호출 가능하다.
  expect(await page.evaluate(() => typeof simulateRebalancedPreset === 'function' && typeof simulateTaxAdvantagedOwnerYearlyPoints === 'function')).toBe(true);
  // 미래예측 탭에서도 MC 설명 팝업은 사라진 카드 이름 대신 "지금 계획대로면"을 가리킨다.
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModalBody')).toContainText('"지금 계획대로면"의 참고값은');
  await expect(page.locator('#mcInfoModalBody')).not.toContainText('성장률별 참고 결과');
  await page.locator('#closeMcInfoModalBtn').click();
});

for (const [label, dark] of [['375 Dark', true], ['375 Light', false]]) {
  test(`미래예측 (${label}) - 지금 계획대로면 · MC 카드가 넘치지 않고 14px/44px를 지킨다`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page);
    await setTheme(page, dark);
    await toProjection(page);
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);
    const issues = await page.evaluate(() => {
      const roots = [document.getElementById('projectionHeroSummary'), document.getElementById('mcRunBtn').closest('section')];
      const out = [];
      roots.forEach((root) => {
        const rr = root.getBoundingClientRect();
        root.querySelectorAll('*').forEach((el) => {
          if (el.offsetParent === null || el.closest('.hidden')) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0) return;
          if (r.right > rr.right + 1 || r.left < rr.left - 1) out.push(`overflow:${el.id || el.textContent.trim().slice(0, 20)}`);
          if (el.children.length === 0 && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 14) out.push(`tiny:${el.textContent.trim().slice(0, 20)}`);
        });
      });
      return out;
    });
    expect(issues).toEqual([]);
    for (const sel of ['#mcFeeRatesToggleBtn', '#openProjectionAssumptionsBtn', '#mcRunBtn']) {
      expect((await page.locator(sel).boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);
    }
    // 현재 자산 · 매달 투자 · 20년 후 참고값이 서로 다른 블록으로 구분된다.
    const blocks = await page.evaluate(() => {
      const box = (id) => document.getElementById(id).parentElement.getBoundingClientRect();
      const future = document.getElementById('projectionHeroFutureLabel').parentElement.getBoundingClientRect();
      return { current: box('projectionHeroCurrent').bottom, monthlyTop: box('projectionHeroMonthly').top, currentTop: box('projectionHeroCurrent').top, futureTop: future.top };
    });
    expect(Math.abs(blocks.currentTop - blocks.monthlyTop)).toBeLessThan(1);
    expect(blocks.current).toBeLessThanOrEqual(blocks.futureTop);
  });
}

/* ------------------------------------------------ PM 최종 감사 후속 F-01 · F-02 · F-05 ------------------------------------------------ */

// [F-01] 목표비중 합계 오류(BLOCK) 상태 - 신랑 국내 목표 합계 90%. 적립계획 카드는 저장값을 그대로 보여주고,
// BLOCK 정책(미래예측 배너 · 시나리오 미계산 · MC 차단)은 그대로여야 한다.
async function seedBlocked(page) {
  await seed(page);
  await page.evaluate(() => {
    state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: 'E94신랑채권', label: 'E94신랑채권', pct: 90, role: '수비수' }];
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  // e2e/02와 같은 조건 - 가격 이력이 없으면 MC가 차단 판정 전에 "시장 데이터 조회 실패"로 멈춘다(fixtures 설명).
  await seedPriceHistory(page);
  expect(await page.evaluate(() => assessHouseholdWeightSums().length)).toBeGreaterThan(0);
  await page.getByText('포트폴리오/자산예측').click();
}

for (const [label, w, h, dark] of [['375 Light', 375, 812, false], ['375 Dark', 375, 812, true], ['1440 Light', 1440, 900, false]]) {
  test(`F-01 (${label}) - 목표비중 BLOCK 상태에서도 적립계획 카드가 저장값을 표시하고, BLOCK 정책은 그대로다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seedBlocked(page);
    await setTheme(page, dark);
    await toSettings(page);

    const expected = await page.evaluate(() => {
      const h = getTaxAdvantagedHoldingsByOwner();
      return { total: fmtKRWShort(h['신랑'].total + h['와이프'].total), husband: fmtKRWShort(h['신랑'].total), wife: fmtKRWShort(h['와이프'].total) };
    });
    await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,000,000원');
    const tax = page.locator('#taxAdvantagedSummary');
    await expect(tax).toContainText('현재 절세계좌 금액');
    await expect(tax).toContainText(expected.total);
    await expect(page.locator('#taxAdvantagedHusbandAccordionBtn')).toContainText(expected.husband);
    await expect(page.locator('#taxAdvantagedWifeAccordionBtn')).toContainText(expected.wife);
    await page.locator('#taxAdvantagedHusbandAccordionBtn').click();
    await expect(page.locator('#taxAdvantagedHusbandAccordionBody')).not.toHaveCSS('max-height', '0px');
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);

    // 기존 BLOCK 정책 - 미래예측 배너 표시 · 시나리오 값 미계산 · MC 실행 차단.
    await toProjection(page);
    const banner = page.locator('#projectionSafetyBlockBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('목표 비중');
    await expect(banner).toContainText('포트폴리오 설정 화면에서 비중 합계를 100%로 맞춰주세요'); // [F-02]
    await expect(banner).not.toContainText('포트폴리오 구성');
    await expect(page.locator('#projectionHeroFuture')).toHaveText('-');
    await expect(page.locator('#projectionHeroFutureTotal')).toHaveText('-');
    await expect(page.locator('#scenarioSummaryCardsGrid')).toBeEmpty();
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcSafetyIssues')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#mcSafetyIssues')).toContainText('차단');
    await expect(page.locator('#mcResultArea')).toBeHidden();
    expect(await docOverflow(page)).toBeLessThanOrEqual(0);

    // 탭을 다시 옮겨도 저장값 표시가 유지된다.
    await toSettings(page);
    await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,000,000원');
    await expect(tax).toContainText(expected.total);
  });
}

test('F-01 - 정상 상태(BLOCK 아님)에서는 적립계획 카드와 미래예측 계산이 예전과 같다', async ({ page }) => {
  await seed(page);
  expect(await page.evaluate(() => assessHouseholdWeightSums().length)).toBe(0);
  await toSettings(page);
  await expect(page.locator('#monthlyContributionSummary')).toHaveText('3,000,000원');
  await expect(page.locator('#taxAdvantagedSummary')).toContainText('현재 절세계좌 금액');
  await toProjection(page);
  await expect(page.locator('#projectionSafetyBlockBanner')).toBeHidden();
  const general = await page.evaluate(() => fmtKRWShort(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total));
  await expect(page.locator('#projectionHeroFuture')).toHaveText(general);
  await expect(page.locator('#scenarioSummaryCardsGrid > div')).toHaveCount(3);
});

test('F-05 - 절세계좌 카드와 적립설정 팝업에 "계좈" 오탈자가 없다', async ({ page }) => {
  await seed(page);
  await toSettings(page);
  const card = page.locator('#taxContributionPlanCard');
  await expect(card).toContainText('포지션별 비중(부부합산 · 절세계좌 실제 보유 기준)');
  await expect(card).not.toContainText('계좈');
  // 빈 계좌 안내 문구(보유 절세계좌 종목이 없는 소유자) - 저장 없이 렌더 함수만 호출해 확인한다.
  const emptyText = await page.evaluate(() => {
    const div = document.createElement('div');
    div.id = 'e94EmptyTaxEditor';
    document.body.appendChild(div);
    renderTaxAdvantagedAllocationEditor('없는소유자', 'e94EmptyTaxEditor');
    const text = div.textContent;
    div.remove();
    return text;
  });
  expect(emptyText).toContain('보유 중인 절세계좌 종목이 없습니다');
  expect(emptyText).not.toContain('계좈');
  await page.locator('#taxAdvantagedPlanBtn').click();
  await expect(page.locator('#taxAdvantagedPlanModal')).not.toContainText('계좈');
  await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();
});
