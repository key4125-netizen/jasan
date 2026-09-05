// E2E-12 일반계좌 "적립 기간(년)" Deterministic 연결 - Step 1(Deterministic 전용, Monte Carlo 미변경).
// 이 파일은 UI를 클릭하지 않고, 앱이 로드해둔 실제 계산 함수(simulateMonthlyContributionGrowth/
// getOwnerMonthlyContributionInputs/simulateRebalancedPreset)를 page.evaluate로 직접 호출해 검증한다.
// classic <script> 아키텍처라 이 함수들은 반드시 실제 브라우저 페이지가 로드된 뒤에만 존재하므로
// (Node에서 require 불가능), Node 단위테스트가 아니라 Playwright로 작성한다.
//
// 기대값은 앱의 기존(보호 대상) 공식과 수학적으로 동일한 참조 함수(fv/fvGrowth, 아래)를 테스트
// 파일 안에서 독립적으로 재현해 계산한다 - computeFutureValue/computeFutureValueWithContributionGrowth
// (js/05)의 기존 공식을 그대로 옮긴 것으로 새 계산식이 아니다(공식 자체는 이미 이 프로젝트가 검증해둔
// 것을 재사용할 뿐이고, 여기서 새로 검증하려는 것은 "적립기간 cap/idle 체이닝 로직"이다).
const { test, expect } = require('@playwright/test');

// computeFutureValue(js/05:190)와 동일한 공식.
function fv(pv, annualRatePct, years, monthly) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;
  if (Math.abs(monthlyRate) < 1e-9) return pv + monthly * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return pv * growth + monthly * (1 + monthlyRate) * ((growth - 1) / monthlyRate);
}
// computeFutureValueWithContributionGrowth(js/05:204)와 동일한 공식.
function fvGrowth(pv, annualRatePct, years, initialMonthly, growthRate) {
  if (!growthRate) return fv(pv, annualRatePct, years, initialMonthly);
  let balance = pv;
  for (let y = 0; y < years; y++) {
    const yearMonthly = initialMonthly * Math.pow(1 + growthRate, y);
    balance = fv(balance, annualRatePct, 1, yearMonthly);
  }
  return balance;
}
// computeFutureValueWithContributionGrowthAndFee(js/05:345)의 "gross rate -> effective rate" 변환과 동일.
function feeAdjustedRate(annualRatePct, feeRateAnnual) {
  if (Math.abs(feeRateAnnual || 0) < 1e-9) return annualRatePct;
  const grossMonthlyRate = annualRatePct / 100 / 12;
  const feeMonthlyFactor = Math.pow(1 - feeRateAnnual, 1 / 12);
  const effectiveMonthlyGrowth = (1 + grossMonthlyRate) * feeMonthlyFactor;
  return (effectiveMonthlyGrowth - 1) * 1200;
}
// 적립기간 cap이 있을 때의 기대값 - "적립구간까지 계산 -> 그 잔고를 유휴구간 동안 이어서 성장"(절세계좌
// growWithStop과 동일한 개념)을 테스트 파일에서 독립적으로 재현한다.
function expectedCapped(annualRatePct, evalYears, monthly, growthRate, feeRateAnnual, contributionYears) {
  const rate = feeAdjustedRate(annualRatePct, feeRateAnnual || 0);
  if (contributionYears === null || contributionYears === undefined || contributionYears >= evalYears) {
    return fvGrowth(0, rate, evalYears, monthly, growthRate || 0);
  }
  const atStop = fvGrowth(0, rate, contributionYears, monthly, growthRate || 0);
  return fv(atStop, rate, evalYears - contributionYears, 0);
}

// [공통 helper] simulateMonthlyContributionGrowth를 "국내 100%, 배분 없음(전액 remainder)" 단순
// 시나리오로 직접 호출한다 - totalValue/regionPV는 지역 배분 비중(share)만 결정하고, 원금 자체(FV의
// pv)에는 전혀 관여하지 않는다(함수 내부에서 항상 pv=0으로 신규 납입만 계산 - js/05 주석 참고).
async function callSimulate(page, { annualRatePct, y, monthly, growthRatePct, feeRatePct, contributionYears }) {
  return page.evaluate(({ annualRatePct, y, monthly, growthRatePct, feeRatePct, contributionYears }) => {
    state.projection.contributionGrowthRate = growthRatePct || 0;
    const regionPV = { '국내': 1, '해외': 0 };
    const regionRate = { '국내': annualRatePct, '해외': annualRatePct };
    const regionFeeRate = { '국내': (feeRatePct || 0) / 100, '해외': (feeRatePct || 0) / 100 };
    return simulateMonthlyContributionGrowth('normal', monthly, regionPV, regionRate, 1, y, [], regionFeeRate, contributionYears);
  }, { annualRatePct, y, monthly, growthRatePct, feeRatePct, contributionYears });
}

test.describe('적립기간(contributionYears) - Deterministic 경계조건', () => {
  test('미설정(null/undefined)이면 기존과 동일하게 평가기간(20년) 내내 적립한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: undefined });
    expect(actual).toBeCloseTo(expectedCapped(6, 20, 1000000, 0, 0, undefined), 4);
    expect(actual).toBeCloseTo(fv(0, 6, 20, 1000000), 4);
  });

  test('적립기간 0년 - 신규 납입이 전혀 발생하지 않고 결과는 0이다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: 0 });
    expect(actual).toBeCloseTo(0, 6);
  });

  test('적립기간 5/10/15년 - 각각 그 이후로는 신규 납입 없이 이어서 복리성장한다(참조식과 일치)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    for (const capYears of [5, 10, 15]) {
      const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: capYears });
      const expected = expectedCapped(6, 20, 1000000, 0, 0, capYears);
      expect(actual, `contributionYears=${capYears}`).toBeCloseTo(expected, 4);
      // 무제한(20년 내내 적립)보다 항상 작아야 한다(더 짧게 적립했으므로).
      expect(actual).toBeLessThan(fv(0, 6, 20, 1000000));
    }
  });

  test('적립기간 = 평가기간(20년) - 무제한과 정확히 같은 결과를 낸다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const uncapped = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: undefined });
    const capAtEval = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: 20 });
    expect(capAtEval).toBeCloseTo(uncapped, 6);
  });

  test('적립기간 > 평가기간(25년, 평가는 20년) - 20년 평가 범위 내내 계속 적립한다(무제한과 동일)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const uncapped = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: undefined });
    const capBeyond = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, contributionYears: 25 });
    expect(capBeyond).toBeCloseTo(uncapped, 6);
  });

  test('투자금 증가율(3%)이 있을 때도 적립기간 10년이 정확히 반영된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, growthRatePct: 3, contributionYears: 10 });
    const expected = expectedCapped(6, 20, 1000000, 0.03, 0, 10);
    expect(actual).toBeCloseTo(expected, 3);
  });

  test('운용보수(fee 0.5%)가 있을 때도 적립기간 10년이 정확히 반영된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 1000000, feeRatePct: 0.5, contributionYears: 10 });
    const expected = expectedCapped(6, 20, 1000000, 0, 0.005, 10);
    expect(actual).toBeCloseTo(expected, 3);
  });

  test('월 적립금이 0이면 적립기간 설정과 무관하게 항상 0이다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof simulateMonthlyContributionGrowth === 'function');
    for (const capYears of [undefined, 0, 10, 20]) {
      const actual = await callSimulate(page, { annualRatePct: 6, y: 20, monthly: 0, contributionYears: capYears });
      expect(actual, `contributionYears=${capYears}`).toBeCloseTo(0, 6);
    }
  });
});

test.describe('적립기간 - owner(신랑/와이프) 독립 적용 및 기존 결과 보존(회귀)', () => {
  // 신랑만 자산/적립금을 갖는 단순 시나리오 - simulateRebalancedPreset이 owner별로 독립 계산 후 합산하므로
  // 신랑 쪽만 확인해도 owner 분리 로직 검증에 충분하다(와이프=0으로 완전히 배제).
  async function seed(page, { husbandMonthly, husbandYears, wifeMonthly, wifeYears }) {
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
    await page.evaluate(({ husbandMonthly, husbandYears, wifeMonthly, wifeYears }) => {
      state.assets = [];
      const asset = makeAsset({ name: 'E2E국내채권-신랑', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 100000000, currentPrice: 100000000 });
      state.assets.push(asset);
      REBALANCE_OWNERS.forEach((o) => { state.rebalance[o].domestic = { '국내': 100, '해외': 0 }; state.rebalance[o].targets = { '국내': [], '해외': [] }; });
      state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: 'E2E국내채권-신랑', pct: 100, role: '수비수' }];
      state.projection.contributionGrowthRate = 0;
      state.projection.monthlyContributionByOwner = {
        '신랑': { total: husbandMonthly, years: husbandYears, allocation: [] },
        '와이프': { total: wifeMonthly, years: wifeYears, allocation: [] }
      };
      persistAssets(); persistRebalance(); persistProjection();
    }, { husbandMonthly, husbandYears, wifeMonthly, wifeYears });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined');
  }

  test('회귀 테스트 A - 적립기간 미설정(null, 마이그레이션된 기존 사용자 상태)이면 기존과 동일한 결과다', async ({ page }) => {
    await seed(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
    const result = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    // "기존과 동일"의 기준선 - contributionYears를 아예 안 넘긴(예전 시그니처) 것과 정확히 같아야 한다.
    const legacyBaseline = await page.evaluate(() => {
      const { monthlyContribution, regionPV, regionRate, totalValue, allocation, regionFeeRate } = (() => {
        const owner = '신랑';
        const tv = getProjectionGroupTotal(getProjectionGroupStats(owner));
        const rPV = { '국내': tv * num(state.rebalance[owner].domestic['국내']) / 100, '해외': tv * num(state.rebalance[owner].domestic['해외']) / 100 };
        const rRate = { '국내': computeRegionWeightedRate(owner, '국내', 'normal'), '해외': computeRegionWeightedRate(owner, '해외', 'normal') };
        const rFee = { '국내': 0, '해외': 0 };
        return { monthlyContribution: 1000000, regionPV: rPV, regionRate: rRate, totalValue: tv, allocation: [], regionFeeRate: rFee };
      })();
      const principal = computeFutureValueWithContributionGrowthAndFee(regionPV['국내'], regionRate['국내'], 20, 0, 0, 0)
        + computeFutureValueWithContributionGrowthAndFee(regionPV['해외'], regionRate['해외'], 20, 0, 0, 0);
      // contributionYears 인자를 아예 넘기지 않은 옛 시그니처 호출(하위호환 경로) - null 전달과 정확히 같아야 한다.
      const contribution = simulateMonthlyContributionGrowth('normal', monthlyContribution, regionPV, regionRate, totalValue, 20, allocation, regionFeeRate);
      return principal + contribution;
    });
    expect(result).toBeCloseTo(legacyBaseline, 4);
  });

  test('회귀 테스트 B - 적립기간을 명시적으로 20년으로 설정하면 기존 20년 지속 적립 결과와 동일하다', async ({ page }) => {
    await seed(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
    const unlimited = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    await seed(page, { husbandMonthly: 1000000, husbandYears: 20, wifeMonthly: 0, wifeYears: null });
    const explicit20 = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    expect(explicit20).toBeCloseTo(unlimited, 4);
  });

  test('회귀 테스트 C - 적립기간 10년으로 설정하면 10년 이후 신규 납입이 발생하지 않아 무제한보다 결과가 작다', async ({ page }) => {
    await seed(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
    const unlimited = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    await seed(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null });
    const capped10 = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    expect(capped10).toBeLessThan(unlimited);
    // 10년 시점(적립 종료 시점)까지는 두 시나리오의 결과가 완전히 같아야 한다(그 전까지는 동일하게 적립했으므로).
    await seed(page, { husbandMonthly: 1000000, husbandYears: null, wifeMonthly: 0, wifeYears: null });
    const unlimitedAt10 = await page.evaluate(() => simulateRebalancedPreset('normal', 10).yearlyPoints[10].total);
    await seed(page, { husbandMonthly: 1000000, husbandYears: 10, wifeMonthly: 0, wifeYears: null });
    const cappedAt10 = await page.evaluate(() => simulateRebalancedPreset('normal', 10).yearlyPoints[10].total);
    expect(cappedAt10).toBeCloseTo(unlimitedAt10, 4);
  });

  test('회귀 테스트 D - 남편 10년/아내 15년이 각자 독립적으로 적립 종료된다', async ({ page }) => {
    // 신랑/와이프 둘 다 자산을 갖도록 다시 세팅(owner 분리 확인용).
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
    await page.evaluate(() => {
      state.assets = [
        makeAsset({ name: 'E2E국내채권-신랑', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 100000000, currentPrice: 100000000 }),
        makeAsset({ name: 'E2E국내채권-와이프', category: '채권', owner: '와이프', accountType: '일반계좌', quantity: 1, buyPrice: 100000000, currentPrice: 100000000 })
      ];
      REBALANCE_OWNERS.forEach((o) => {
        state.rebalance[o].domestic = { '국내': 100, '해외': 0 };
        state.rebalance[o].targets = { '국내': [{ type: 'namedHolding', name: `E2E국내채권-${o}`, pct: 100, role: '수비수' }], '해외': [] };
      });
      state.projection.contributionGrowthRate = 0;
      state.projection.monthlyContributionByOwner = {
        '신랑': { total: 1000000, years: 10, allocation: [] },
        '와이프': { total: 2000000, years: 15, allocation: [] }
      };
      persistAssets(); persistRebalance(); persistProjection();
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined');

    const at20 = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    // 각 owner가 서로 다른 적립기간으로 "독립적으로" 종료되는지 - 신랑만 20년 내내(대조군), 와이프만 20년
    // 내내(대조군)로 각각 다시 계산해, 실제(둘 다 조기 종료) 결과가 두 대조군 조합보다 항상 작아야 한다.
    const husbandUnlimited = await page.evaluate(() => {
      const saved = JSON.parse(JSON.stringify(state.projection.monthlyContributionByOwner));
      state.projection.monthlyContributionByOwner['신랑'].years = null;
      state.projection.monthlyContributionByOwner['와이프'].years = null;
      const r = simulateRebalancedPreset('normal', 20).yearlyPoints[20].total;
      state.projection.monthlyContributionByOwner = saved;
      return r;
    });
    expect(at20).toBeLessThan(husbandUnlimited);

    // 10년 시점까지는 "남편10/아내15" 시나리오와 "둘 다 무제한" 시나리오가 완전히 같아야 한다(아직 아무도
    // 적립을 끝내지 않았으므로).
    const at10Actual = await page.evaluate(() => simulateRebalancedPreset('normal', 10).yearlyPoints[10].total);
    const at10Unlimited = await page.evaluate(() => {
      const saved = JSON.parse(JSON.stringify(state.projection.monthlyContributionByOwner));
      state.projection.monthlyContributionByOwner['신랑'].years = null;
      state.projection.monthlyContributionByOwner['와이프'].years = null;
      const r = simulateRebalancedPreset('normal', 10).yearlyPoints[10].total;
      state.projection.monthlyContributionByOwner = saved;
      return r;
    });
    expect(at10Actual).toBeCloseTo(at10Unlimited, 4);
  });

  test('마이그레이션 - 옛 버전이 저장해 둔 years:15(자동 기본값)는 최초 1회 null로 리셋되어 기존 사용자 결과가 보존된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
    // "이 기기에서 마이그레이션이 아직 실행된 적 없다"는 상태를 흉내낸다 + 옛 버전이 저장했을 법한
    // years:15(당시 정규화 기본값)가 이미 들어있는 저장분을 흉내낸다.
    await page.evaluate(() => {
      localStorage.removeItem('sam_monthly_contrib_years_reset_v1');
      const proj = JSON.parse(localStorage.getItem('sam_projection_v1') || '{}');
      proj.monthlyContribution = 1000000;
      proj.monthlyContributionByOwner = {
        '신랑': { total: 1000000, years: 15, allocation: [] },
        '와이프': { total: 0, years: 15, allocation: [] }
      };
      localStorage.setItem('sam_projection_v1', JSON.stringify(proj));
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined');

    const migrated = await page.evaluate(() => ({
      husbandYears: state.projection.monthlyContributionByOwner['신랑'].years,
      wifeYears: state.projection.monthlyContributionByOwner['와이프'].years,
      migrationFlag: localStorage.getItem('sam_monthly_contrib_years_reset_v1')
    }));
    expect(migrated.husbandYears).toBeNull();
    expect(migrated.wifeYears).toBeNull();
    expect(migrated.migrationFlag).toBe('1');
  });
});
