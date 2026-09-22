// E2E-14 일반계좌 "적립 기간(년)" Monte Carlo 연결 - Step 2. 실제 [Monte Carlo 실행] 버튼을 눌러
// mcRunBtn -> js/18 startMonteCarloRun -> js/17 Worker -> js/15 엔진까지 전체 파이프라인이 owner별
// 적립기간(contributionStreams)을 실제로 반영하는지 확인한다. 엔진 자체의 수학적 정확성(sigma=0 참조식
// 대조 11건)은 test/monte-carlo-engine.test.js(Node)에서 이미 검증했으므로, 이 파일은 "실제 UI 흐름이
// state.projection.monthlyContributionByOwner를 빠짐없이 끝까지 전달하는가"에 집중한다 - 기대값은
// runMonthlyPrecisionMC를 같은 seed로 page.evaluate 안에서 직접 재호출해 구한다(하드코딩 금지).
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

const ASSET_VALUE = 100000000;

// [기대값 갱신 사유 · 통합 개선 배치 2026-09-22 · §54-4] "매년 투자금 증가율"이 사용자 입력에서
// 제거되고(PM 지시문 §10-1) 계산도 그 값을 읽지 않는다. 대신 "연도별 추가 투자"(yearlyExtra)가
// MC 현금흐름에 들어간다. legacyGrowthRate는 "저장된 옛 값이 남아 있어도 적용되지 않는다"를
// 확인하기 위해 남겨 둔다(§10-5 데이터는 보존하되 계산에는 쓰지 않는다).
async function seedAndRunMC(page, { husbandMonthly, husbandYears, wifeMonthly, wifeYears, legacyGrowthRate = 0, yearlyExtra = [] }) {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: 'E2E국내채권-MC', pct: 100 },
      { owner: '와이프', region: '국내', name: 'E2E국내채권-MC', pct: 100 }
    ],
    assetValueEach: ASSET_VALUE,
    projection: {
      monthlyContribution: 0,
      contributionGrowthRate: legacyGrowthRate,
      yearlyExtraContributions: yearlyExtra,
      monthlyContributionByOwner: {
        '신랑': { total: husbandMonthly, years: husbandYears, allocation: [] },
        '와이프': { total: wifeMonthly, years: wifeYears, allocation: [] }
      }
    }
  });
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
}

// 엔진을 실제 UI가 쓰는 것과 동일한 입력(instruments/correlationMatrix/seed 등)으로 다시 호출해
// "기대값"을 얻는다 - buildMonteCarloInputFromState(js/16)를 그대로 재사용해 실제 어댑터 출력과
// 완전히 같은 instruments를 쓴다(하드코딩 없음).
async function expectedP50(page, { contributionStreams }) {
  return page.evaluate(async ({ contributionStreams }) => {
    const adapterResult = await buildMonteCarloInputFromState({ presetKey: 'normal' });
    const years = Math.max(...getMilestoneYearOffsets());
    const monthlyContribution = getHouseholdMonthlyContributionTotal();
    const config = {
      pv0: computeHouseholdMonteCarloPV(), instruments: adapterResult.instruments, correlationMatrix: adapterResult.correlationMatrix,
      // [§54-4] 화면(js/19)이 실제로 넘기는 값과 같아야 한다 - 증가율은 0 고정이고, 연도별 추가
      // 투자는 같은 변환 함수로 월 번호를 만든다(여기서 규칙을 따로 만들면 화면과 어긋난다).
      monthlyContribution, contributionGrowthRate: 0, years,
      extraContributions: mapYearlyExtraContributionsToMonths(years).mapped.map((it) => ({ monthIndex: it.monthIndex, amount: it.amount })),
      contributionStreams, simulations: 30, iterations: 30, seed: 20260101
    };
    return runMonthlyPrecisionMC(config).milestones.at(-1).p50;
  }, { contributionStreams });
}

test.describe('적립기간(년) - Monte Carlo 연결(Step 2)', () => {
  test('years:null(레거시/미설정) - 기존(단일 monthlyContribution) 흐름과 동일한 결과다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: undefined });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
  });

  test('명시적 20년(평가기간과 동일) - 무제한과 동일한 결과다', async ({ page }) => {
    const unlimitedExpected = await (async () => {
      await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
      return expectedP50(page, { contributionStreams: undefined });
    })();
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 20, wifeMonthly: 0, wifeYears: null });
    const explicit20Expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 20 }, { monthly: 0, years: null }] });
    expect(explicit20Expected).toBeCloseTo(unlimitedExpected, 4);
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), explicit20Expected));
  });

  test('명시적 10년 - 실제 화면 표시값이 엔진의 10년 컷오프 결과와 정확히 일치한다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 10 }, { monthly: 0, years: null }] });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
    // 10년 컷오프 결과가 무제한보다 작아야 한다(조기 종료했으므로).
    const unlimited = await expectedP50(page, { contributionStreams: undefined });
    expect(expected).toBeLessThan(unlimited);
  });

  test('남편 10년 / 아내 15년 - 각자 독립적으로 적용되고 화면 표시값과 일치한다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 2000000, wifeYears: 15 });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 10 }, { monthly: 2000000, years: 15 }] });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
  });

  test('적립기간 0년 - 신규 납입 없이 원금만으로 시뮬레이션되어 화면 표시값과 일치한다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 0, wifeMonthly: 0, wifeYears: null });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 0 }, { monthly: 0, years: null }] });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
  });

  // [기대값 갱신 사유 · 통합 개선 배치 2026-09-22 · §54-4] 증가율 자리를 연도별 추가 투자가 대신한다.
  // 관심사는 그대로다 - "적립기간과 병행해도 화면 표시값이 엔진 결과와 일치하는가".
  test('연도별 추가 투자 + 적립기간 10년 병행 - 화면 표시값이 엔진 결과와 일치한다', async ({ page }) => {
    const nextYear = new Date().getFullYear() + 1;
    await seedAndRunMC(page, {
      husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null,
      yearlyExtra: [{ year: nextYear, amount: 10000000 }]
    });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 10 }, { monthly: 0, years: null }] });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
  });

  // 저장된 옛 증가율이 남아 있어도 MC 결과가 달라지지 않는다(§10-5 이중 반영 금지).
  test('저장된 옛 "투자금 증가율"(3%)은 MC 결과를 바꾸지 않는다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null });
    const withoutLegacy = await page.locator('#mcP50Text').innerText();
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null, legacyGrowthRate: 3 });
    expect(await page.locator('#mcP50Text').innerText()).toBe(withoutLegacy);
    expect(await page.evaluate(() => state.projection.contributionGrowthRate)).toBe(3);
  });

  test('운용보수(fee) 설정 + 적립기간 10년 병행 - 화면 표시값이 엔진 결과와 일치한다', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null });
    await page.evaluate(() => {
      const key = buildCustomRateKey('', 'E2E국내채권-MC');
      state.projection.customFeeRates[key] = 1.0;
      persistProjection();
    });
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    const displayedP50 = await page.locator('#mcP50Text').innerText();
    const expected = await expectedP50(page, { contributionStreams: [{ monthly: 1000000, years: 10 }, { monthly: 0, years: null }] });
    expect(displayedP50).toBe(await page.evaluate((v) => fmtKRWShort(v), expected));
  });

  // [v250 PM 수정 지시] 결과 화면의 월 적립금 · 총 납입원금 안내 줄은 삭제됐다(§38). 적립기간이 반영된 총 납입원금 계산
  // (computeTotalContributionPrincipalMultiStream)은 그대로이므로, 계산 자체와 화면에서 줄이 빠졌다는 사실을 함께 확인한다.
  test('총 납입원금 계산 - owner별 적립기간이 반영되어 무제한 기준보다 작다(결과 화면 안내 줄은 v250에서 삭제)', async ({ page }) => {
    await seedAndRunMC(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 2000000, wifeYears: 15 });
    await expect(page.locator('#mcContributionScheduleArea')).toHaveCount(0);
    await expect(page.locator('#mcResultArea')).not.toContainText('총 납입원금');
    const shownTotal = await page.evaluate(() => {
      const streams = [{ monthly: 1000000, years: 10 }, { monthly: 2000000, years: 15 }];
      return computeTotalContributionPrincipalMultiStream(streams, 0, 20);
    });
    const unlimitedTotal = await page.evaluate(() => computeTotalContributionPrincipal(3000000, 0, 20));
    expect(shownTotal).toBeLessThan(unlimitedTotal);
  });
});
