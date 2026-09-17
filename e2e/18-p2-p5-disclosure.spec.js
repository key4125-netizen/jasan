// E2E-18 Phase 9 후속 - P2(적립기간 노출 - v248-1부터 [적립금 설정] 팝업) + P5(Monte Carlo allocation 차이 고지) 검증.
// UI/문구 변경만 확인한다 - 계산값 자체는 Step 1/2/4 및 e2e/17에서 이미 검증했으므로 여기서는 "표시"만.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab, goToPortfolioSettingsTab } = require('./fixtures');

// [v248-1 REQ-01] 예전엔 적립 기간이 미래예측 결과 화면의 "이 계산은 이런 가정을 사용했어요" 목록에 노출됐다(Phase 9 P2).
// PM 지시로 그 접힘 영역이 삭제되어, 적립 기간은 이제 [적립금 설정] 팝업(포트폴리오 설정 탭 · 일반계좌 적립계획)의
// 입력칸에서 확인한다. 저장값의 의미(null=제한없음 · 0 · 숫자)가 화면에서 그대로 구분되는지를 같은 시드로 검증한다.
test.describe('P2 - 적립기간이 [적립금 설정] 팝업에 저장값 그대로 보인다(v248-1)', () => {
  async function readYears(page) {
    await goToPortfolioSettingsTab(page);
    await page.locator('#openMonthlyContributionAllocationBtn').click();
    await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
    const years = {
      husband: await page.locator('#monthlyContributionYearsInputHusband').inputValue(),
      wife: await page.locator('#monthlyContributionYearsInputWife').inputValue(),
    };
    await page.locator('#cancelMonthlyContributionAllocationModalBtn').click();
    return years;
  }
  const seedYears = (husband, wife, wifeTotal = 0) => ({
    targets: [
      { owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 },
      { owner: '와이프', region: '국내', name: 'E2E국내채권2', pct: 100 }
    ],
    projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: husband, allocation: [] }, '와이프': { total: wifeTotal, years: wife, allocation: [] } } }
  });

  test('null(제한없음) - 입력칸이 비어 있다(placeholder가 안내)', async ({ page }) => {
    await seedPortfolio(page, seedYears(null, null));
    expect(await readYears(page)).toEqual({ husband: '', wife: '' });
  });

  test('0 - "0"으로 보인다(제한없음과 구분)', async ({ page }) => {
    await seedPortfolio(page, seedYears(0, 0));
    expect((await readYears(page)).husband).toBe('0');
  });

  test('10 / 20 - 저장한 숫자 그대로 보인다', async ({ page }) => {
    await seedPortfolio(page, seedYears(10, 20));
    expect((await readYears(page)).husband).toBe('10');
  });

  test('남편 10년 / 아내 15년 - 서로 다르면 각자 보인다', async ({ page }) => {
    await seedPortfolio(page, seedYears(10, 15, 2000000));
    expect(await readYears(page)).toEqual({ husband: '10', wife: '15' });
  });

  test('새로고침해도 표시가 유지된다', async ({ page }) => {
    await seedPortfolio(page, seedYears(10, 10));
    expect((await readYears(page)).husband).toBe('10');
    await page.reload();
    expect((await readYears(page)).husband).toBe('10');
  });

  test('미래예측 화면의 "투자 기간"(미래예측 기간)은 적립 기간과 무관하게 20년으로 보인다', async ({ page }) => {
    await seedPortfolio(page, seedYears(10, 10));
    await goToProjectionTab(page);
    await expect(page.locator('#projectionPlanYearsText')).toHaveText('20년');
    await expect(page.locator('#projectionAssumptionsList')).toHaveCount(0);
  });
});

// [v250 PM 수정 지시 · §38] P5 고지 문구("일반계좌 적립금은 가구 전체 목표비중을 기준으로 계산합니다")를 포함한 결과 아래
// 기술 정보 블록은 PM 지시로 삭제됐다. 계산(가구 전체 목표비중 기준 배분)은 그대로이며, 아래 두 번째 테스트가 값 일치를 계속 지킨다.
test.describe('P5 - Monte Carlo 적립금 배분 고지(v250에서 결과 화면 문구 삭제)', () => {
  test('MC 결과 화면에 적립금 배분 안내 블록이 더 이상 없다(PM 지시)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 0, years: 10, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#mcContributionScheduleArea')).toHaveCount(0);
    await expect(page.locator('#mcResultArea')).not.toContainText('가구 전체 목표비중을 기준으로 계산합니다');
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
