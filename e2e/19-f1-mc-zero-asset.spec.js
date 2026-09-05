// E2E-19 Phase 10 후속 - F-1 수정 검증: 가구 전체(두 owner 모두) 현재 원금이 0원이면 Monte Carlo의
// instruments가 비어 실행 자체가 불가능하던 문제를 검증한다. computeHouseholdTargetInstrumentWeights
// (js/05)가 grandTotal(현재 원금 합계)<=0일 때만 owner별 "월 적립금 총액"으로 가중치를 대체하고,
// grandTotal>0인 기존 정상 케이스는 완전히 bit-identical해야 한다(반드시 함께 확인).
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

// [주의 - Phase 9 후속에서 이미 발견한 기존(이번 범위 밖) 테스트 환경 특성 재발 방지] updateRebalanceResults()
// (js/04)가 renderProjection()이 아니라 updateProjection()을 직접 호출해 "#contributionGrowthRateInput의
// 현재 DOM 값"을 state로 되읽어온다 - page.evaluate로 state를 세팅한 뒤 리밸런싱 탭을 거치면 아직 한
// 번도 렌더링되지 않은 DOM 기본값("0")이 방금 세팅한 값을 덮어쓸 수 있다(e2e/17에서 처음 발견). 이
// 헬퍼는 순수 계산 함수만 page.evaluate로 호출하므로 goToProjectionTab()을 호출하지 않는다 - 실제
// UI 클릭이 필요한 마지막 테스트에서만 별도로 호출한다.
async function seedZeroHouseholdAsset(page, { husbandMonthly = 0, husbandYears = null, wifeMonthly = 0, wifeYears = null, husbandDomestic = 100, wifeDomestic = 100, growthRate = 0, husbandName = 'E2E-F1-국내채권-A', wifeName = 'E2E-F1-국내채권-B' } = {}) {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: husbandName, pct: 100 },
      { owner: '와이프', region: '국내', name: wifeName, pct: 100 }
    ],
    projection: {
      contributionGrowthRate: growthRate,
      monthlyContribution: 0,
      monthlyContributionByOwner: {
        '신랑': { total: husbandMonthly, years: husbandYears, allocation: [] },
        '와이프': { total: wifeMonthly, years: wifeYears, allocation: [] }
      }
    }
  });
  await page.evaluate(({ husbandDomestic, wifeDomestic }) => {
    state.assets = [];
    state.rebalance['신랑'].domestic = { '국내': husbandDomestic, '해외': 100 - husbandDomestic };
    state.rebalance['와이프'].domestic = { '국내': wifeDomestic, '해외': 100 - wifeDomestic };
    persistAssets();
    persistRebalance();
  }, { husbandDomestic, wifeDomestic });
}

async function runMcAndGetP50(page) {
  return page.evaluate(async () => {
    const adapterResult = await buildMonteCarloInputFromState({ presetKey: 'normal' });
    if (adapterResult.errors && adapterResult.errors.length > 0) return { errors: adapterResult.errors };
    const years = Math.max(...getMilestoneYearOffsets());
    const initialPrincipal = computeHouseholdMonteCarloPV();
    const monthlyContribution = getHouseholdMonthlyContributionTotal();
    const contributionStreams = REBALANCE_OWNERS.map((owner) => {
      const inputs = getOwnerMonthlyContributionInputs(owner);
      return { monthly: inputs.monthlyContribution, years: inputs.years };
    });
    const input = {
      instruments: adapterResult.instruments, correlationMatrix: adapterResult.correlationMatrix, assetOrder: adapterResult.assetOrder,
      initialPrincipal, monthlyContribution, contributionGrowthRate: num(state.projection.contributionGrowthRate) / 100, years,
      contributionStreams, simulations: 20, seed: 20260101
    };
    const validation = validateMonteCarloInput(input);
    if (!validation.valid) return { errors: validation.errors };
    const engineConfig = { pv0: initialPrincipal, instruments: adapterResult.instruments, correlationMatrix: adapterResult.correlationMatrix, monthlyContribution, contributionGrowthRate: input.contributionGrowthRate, contributionStreams, years, iterations: 20, seed: 20260101 };
    return { p50: runMonthlyPrecisionMC(engineConfig).milestones.at(-1).p50, instrumentsCount: adapterResult.instruments.length };
  });
}

test.describe('F-1 - 가구 전체 자산 0원 + Monte Carlo 기본 시나리오', () => {
  test('1. 자산 0 + 월 적립금 100만원 + 목표비중 존재 - MC가 정상 실행되고 결과 > 0', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: null });
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
    expect(result.instrumentsCount).toBeGreaterThan(0);
    expect(result.p50).toBeGreaterThan(0);
  });

  test('2. 자산 0 + 월 적립금 0 - 투입될 돈이 전혀 없으므로 instruments가 비어 기존 검증 오류가 그대로 발생한다(신규 규칙 없음)', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 0, wifeMonthly: 0 });
    const weightsMapSize = await page.evaluate(() => computeHouseholdTargetInstrumentWeights().size);
    expect(weightsMapSize).toBe(0);
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeDefined();
  });

  test('3. 자산 0 + 적립기간 20년(=평가기간) - MC 결과가 0이 아니다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: 20 });
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
    expect(result.p50).toBeGreaterThan(0);
  });

  test('4. 자산 0 + 적립기간 10년 - MC 결과가 0보다 크고, 무제한(20년)보다 작다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: 10 });
    const capped = await runMcAndGetP50(page);
    expect(capped.errors).toBeUndefined();
    expect(capped.p50).toBeGreaterThan(0);

    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: null });
    const unlimited = await runMcAndGetP50(page);
    expect(capped.p50).toBeLessThan(unlimited.p50);
  });

  test('5. 자산 0 + 적립기간 0년 - 신규 납입이 없으므로 MC 결과도 0이다(원금도 0이므로 전체 0)', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: 0 });
    const result = await runMcAndGetP50(page);
    // instruments는 목표비중이 있으므로 정상 구성되지만(에러 아님), 원금 0 + 신규납입 0이므로 결과도 0.
    expect(result.errors).toBeUndefined();
    expect(result.p50).toBeCloseTo(0, 6);
  });

  test('6. 자산 0 + 투자금 증가율(3%) - 반영되어 무증가 대비 결과가 더 크다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: null, growthRate: 0 });
    const noGrowth = await runMcAndGetP50(page);
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: null, growthRate: 3 });
    const withGrowth = await runMcAndGetP50(page);
    expect(withGrowth.errors).toBeUndefined();
    expect(withGrowth.p50).toBeGreaterThan(noGrowth.p50);
  });

  test('7. 자산 0 + fee 등록 - fee가 있으면 없을 때보다 결과가 작다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: null });
    const noFee = await runMcAndGetP50(page);
    await page.evaluate(() => {
      const key = buildCustomRateKey('', 'E2E-F1-국내채권-A');
      state.projection.customFeeRates[key] = 1.0;
      persistProjection();
    });
    const withFee = await runMcAndGetP50(page);
    expect(withFee.errors).toBeUndefined();
    expect(withFee.p50).toBeLessThan(noFee.p50);
  });
});

test.describe('F-1 - Owner 조합(Case A/B/C/D)', () => {
  test('Case A - 남편 자산 0 / 아내 자산 > 0: 기존 동작 유지(아내 자산 기준 가중치 그대로)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E-CaseA-신랑', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E-CaseA-와이프', pct: 100 }
      ],
      assetValueEach: 100000000, // seedPortfolio 기본값 - 두 owner 모두에 심어지므로 아래서 신랑만 0으로 덮어씀
      projection: { monthlyContributionByOwner: { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await page.evaluate(() => {
      state.assets = state.assets.filter((a) => a.owner !== '신랑'); // 신랑만 자산 0으로
      persistAssets();
    });
    await goToProjectionTab(page);
    const weightsMap = await page.evaluate(() => {
      const m = computeHouseholdTargetInstrumentWeights();
      return [...m.entries()].map(([k, v]) => ({ key: k, weight: v.weight }));
    });
    // 아내 자산만 있으므로 가중치 합이 1이고, 아내의 target(namedHolding 'E2E-CaseA-와이프')만 존재해야 한다.
    expect(weightsMap.length).toBe(1);
    expect(weightsMap[0].weight).toBeCloseTo(1, 6);
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
  });

  test('Case B - 남편 자산 > 0 / 아내 자산 0: 기존 동작 유지(남편 자산 기준 가중치 그대로)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E-CaseB-신랑', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E-CaseB-와이프', pct: 100 }
      ],
      assetValueEach: 100000000,
      projection: { monthlyContributionByOwner: { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await page.evaluate(() => {
      state.assets = state.assets.filter((a) => a.owner !== '와이프');
      persistAssets();
    });
    await goToProjectionTab(page);
    const weightsMap = await page.evaluate(() => [...computeHouseholdTargetInstrumentWeights().entries()].map(([k, v]) => ({ key: k, weight: v.weight })));
    expect(weightsMap.length).toBe(1);
    expect(weightsMap[0].weight).toBeCloseTo(1, 6);
  });

  test('Case C - 남편 0 / 아내 0(동일 목표비중, 동일 월적립금) - fallback으로 정상 구성되고 각 50%씩 반영된다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, wifeMonthly: 1000000 });
    const weightsMap = await page.evaluate(() => [...computeHouseholdTargetInstrumentWeights().values()].map((v) => v.weight));
    expect(weightsMap.length).toBe(2);
    weightsMap.forEach((w) => expect(w).toBeCloseTo(0.5, 6));
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
    expect(result.p50).toBeGreaterThan(0);
  });

  test('Case D - 남편 0 / 아내 0 + 서로 다른 목표비중 + 서로 다른 월적립금 - 월적립금 비율대로 정확히 가중된다', async ({ page }) => {
    // 신랑 월 100만원(국내 100%), 와이프 월 300만원(국내 100%, 다른 종목) - 자산 0원이므로 월적립금
    // 비율(1:3)로 가중되어야 한다(50:50도 아니고 임의값도 아님).
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, wifeMonthly: 3000000 });
    const weights = await page.evaluate(() => {
      const m = computeHouseholdTargetInstrumentWeights();
      const out = {};
      m.forEach((v, k) => { out[k] = v.weight; });
      return out;
    });
    const values = Object.values(weights);
    expect(values.length).toBe(2);
    // 1:3 비율 - 작은 쪽이 0.25, 큰 쪽이 0.75여야 한다(순서 무관하게 정렬해서 비교).
    const sorted = values.slice().sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(0.25, 6);
    expect(sorted[1]).toBeCloseTo(0.75, 6);
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
  });
});

test.describe('F-1 - 회귀(기존 자산 > 0 케이스는 완전히 동일해야 한다)', () => {
  test('12/13. 기존 자산 > 0 + 기존 포트폴리오 - 수정 전후 MC 결과가 완전히 동일하다(bit-identical)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E-Regression-국내채권-신랑', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E-Regression-국내채권-와이프', pct: 100 }
      ],
      assetValueEach: 100000000,
      projection: { contributionGrowthRate: 0, monthlyContributionByOwner: { '신랑': { total: 1000000, years: 10, allocation: [] }, '와이프': { total: 2000000, years: 15, allocation: [] } } }
    });
    await goToProjectionTab(page);
    // 새 코드 경로(grandTotal>0이므로 기존 ownerTotal 가중치 그대로)로 계산한 weight를, "만약 옛날
    // 코드 그대로였다면"과 동일한 수식으로 독립 재구성해 대조한다.
    const check = await page.evaluate(() => {
      const actualMap = computeHouseholdTargetInstrumentWeights();
      const husbandTotal = getProjectionGroupTotal(getProjectionGroupStats('신랑'));
      const wifeTotal = getProjectionGroupTotal(getProjectionGroupStats('와이프'));
      const grandTotal = husbandTotal + wifeTotal;
      const husbandMap = computeOwnerTargetInstrumentWeights('신랑');
      const wifeMap = computeOwnerTargetInstrumentWeights('와이프');
      const expectedMap = new Map();
      husbandMap.forEach((v, k) => { const p = expectedMap.get(k) || { ...v, weight: 0 }; p.weight += v.weight * husbandTotal; expectedMap.set(k, p); });
      wifeMap.forEach((v, k) => { const p = expectedMap.get(k) || { ...v, weight: 0 }; p.weight += v.weight * wifeTotal; expectedMap.set(k, p); });
      expectedMap.forEach((v) => { v.weight = v.weight / grandTotal; });
      const actual = {}; actualMap.forEach((v, k) => { actual[k] = v.weight; });
      const expected = {}; expectedMap.forEach((v, k) => { expected[k] = v.weight; });
      return { actual, expected };
    });
    expect(check.actual).toEqual(check.expected);
    const result = await runMcAndGetP50(page);
    expect(result.errors).toBeUndefined();
    expect(result.p50).toBeGreaterThan(0);
  });

  test('14. 동일 state + 동일 seed - 두 번 실행해도 완전히 동일한 결과가 나온다(재현성)', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 2000000, wifeYears: 15 });
    const r1 = await runMcAndGetP50(page);
    const r2 = await runMcAndGetP50(page);
    expect(r1.errors).toBeUndefined();
    expect(r1.p50).toBe(r2.p50);
  });
});

test.describe('F-1 - 실제 UI(mcRunBtn) 흐름으로 재현', () => {
  test('Phase 10에서 실패했던 시나리오를 실제 버튼 클릭으로 재현 - 이제 정상 동작한다', async ({ page }) => {
    await seedZeroHouseholdAsset(page, { husbandMonthly: 1000000, husbandYears: 20 });
    await goToProjectionTab(page);
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    const p50Text = await page.locator('#mcP50Text').innerText();
    expect(p50Text).not.toMatch(/NaN|undefined|Infinity|^0원$|^$/);
    const scheduleText = await page.locator('#mcContributionScheduleArea').innerText();
    expect(scheduleText).toContain('총 납입원금');
    expect(scheduleText).toContain('가구 전체 목표비중을 기준으로 계산합니다');
    const milestoneText = await page.locator('#mcMilestoneTableBody').innerText();
    expect(milestoneText).not.toMatch(/NaN|undefined|Infinity/);
    const goalAreaText = await page.locator('#mcGoalArea').innerText();
    expect(goalAreaText).not.toMatch(/NaN|undefined|Infinity/);

    // 새로고침 후에도 동일한 입력이 유지되고 다시 MC를 정상 실행할 수 있어야 한다.
    await page.reload();
    await goToProjectionTab(page);
    await expect(page.locator('#projectionHeroFuture')).toHaveText(/[0-9]/);
    await page.locator('#mcRunBtn').click();
    await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
    const p50AfterReload = await page.locator('#mcP50Text').innerText();
    expect(p50AfterReload).not.toMatch(/NaN|undefined|Infinity|^0원$|^$/);
  });
});
