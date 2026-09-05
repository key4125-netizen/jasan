// E2E-18 Phase 9 후속 - P2(적립기간 결과 화면 노출) + P5(Monte Carlo allocation 차이 고지) 검증.
// UI/문구 변경만 확인한다 - 계산값 자체는 Step 1/2/4 및 e2e/17에서 이미 검증했으므로 여기서는 "표시"만.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test.describe('P2 - 적립기간이 결과 화면(가정 요약)에 노출된다', () => {
  async function getAssumptionsText(page) {
    await page.locator('#projectionAssumptionsAccordionBtn').click();
    const text = await page.locator('#projectionAssumptionsList').innerText();
    await page.locator('#projectionAssumptionsAccordionBtn').click(); // 되돌려서 다음 assertion에 영향 없게
    return text;
  }

  test('null(제한없음) - "제한 없음"으로 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('적립 기간(신규 납입 기간): 제한 없음');
  });

  test('0 - "0년(신규 납입 없음)"으로 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 0, allocation: [] }, '와이프': { total: 0, years: 0, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('적립 기간(신규 납입 기간): 0년(신규 납입 없음)');
  });

  test('10 - "10년"으로 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 0, years: 10, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('적립 기간(신규 납입 기간): 10년');
  });

  test('20 - "20년"으로 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 20, allocation: [] }, '와이프': { total: 0, years: 20, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('적립 기간(신규 납입 기간): 20년');
  });

  test('남편 10년 / 아내 15년 - 서로 다르면 각자 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E국내채권2', pct: 100 }
      ],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 2000000, years: 15, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('적립 기간(신규 납입 기간): 신랑 10년 · 와이프 15년');
  });

  test('저장 후 재진입/새로고침해도 표시가 유지된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 0, years: 10, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const before = await getAssumptionsText(page);
    expect(before).toContain('적립 기간(신규 납입 기간): 10년');

    await page.reload();
    await goToProjectionTab(page);
    const after = await getAssumptionsText(page);
    expect(after).toContain('적립 기간(신규 납입 기간): 10년');
  });

  test('"투자 기간"(미래예측 기간)과 "적립 기간"(신규 납입 기간)이 서로 다른 라벨로 함께 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 0, years: 10, allocation: [] } } }
    });
    await goToProjectionTab(page);
    const text = await getAssumptionsText(page);
    expect(text).toContain('투자 기간(미래예측 기간): 20년');
    expect(text).toContain('적립 기간(신규 납입 기간): 10년');
  });
});

test.describe('P5 - Monte Carlo가 가구 전체 목표비중 기준임을 고지한다', () => {
  test('MC 결과 화면에 안내 문구가 표시된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 0, years: 10, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    const scheduleText = await page.locator('#mcContributionScheduleArea').innerText();
    expect(scheduleText).toContain('가구 전체 목표비중을 기준으로 계산합니다');
  });

  test('안내 문구가 추가되어도 기존 MC 계산값(P50) 자체는 엔진 결과와 정확히 일치한다(계산 변경 없음)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E국내채권-A', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E국내채권-B', pct: 100 }
      ],
      assetValueEach: 100000000,
      projection: { contributionGrowthRate: 0, monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 2000000, years: 15, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await page.evaluate(async () => {
      const adapterResult = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      const years = Math.max(...getMilestoneYearOffsets());
      const config = {
        pv0: computeHouseholdMonteCarloPV(), instruments: adapterResult.instruments, correlationMatrix: adapterResult.correlationMatrix,
        monthlyContribution: getHouseholdMonthlyContributionTotal(), contributionGrowthRate: 0, years,
        contributionStreams: [{ monthly: 1000000, years: 10 }, { monthly: 2000000, years: 15 }],
        simulations: 30, iterations: 30, seed: 20260101
      };
      return fmtKRWShort(runMonthlyPrecisionMC(config).milestones.at(-1).p50);
    });
    expect(displayedP50).toBe(expected);
  });
});
