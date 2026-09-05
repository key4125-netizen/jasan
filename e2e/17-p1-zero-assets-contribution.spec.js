// E2E-17 Phase 9 후속 - P1 수정 검증: 기존 자산(totalValue)이 0인 상태에서 "배분되지 않은 나머지"
// 신규 적립금이 목표 국내/해외 비중(state.rebalance[owner].domestic - 이미 존재하는 구조)을 안전한
// fallback으로 사용해 정상 반영되는지 검증한다. totalValue!==0인 기존 정상 케이스는 이전과 완전히
// 동일한 계산식(regionPV[region]/totalValue)을 그대로 타므로 회귀가 없어야 한다(반드시 함께 확인).
// [주의 - Phase 9 후속 작업 중 발견한 기존(이번 범위 밖) 테스트 환경 특성] updateRebalanceResults()
// (js/04)가 renderProjection()이 아니라 updateProjection()을 직접 호출하는데, updateProjection()은
// "#contributionGrowthRateInput의 현재 DOM 값"을 state로 되읽어온다(js/05) - 사람이 실제로 앱을 쓸
// 때는 이 입력이 항상 renderProjection()으로 먼저 state와 동기화된 뒤라 문제가 없지만, 이 테스트처럼
// page.evaluate로 state를 "뒷문"으로 세팅한 뒤 리밸런싱 탭을 거치면, 아직 한 번도 렌더링되지 않아
// DOM 기본값("0")을 그대로 보여주는 입력값이 방금 세팅한 state.projection.contributionGrowthRate를
// 덮어써 버릴 수 있다(실제로 이 테스트를 작성하며 재현/확인함). 이 테스트들은 simulateRebalancedPreset을
// page.evaluate로 직접 호출하는 순수 계산 검증이라 애초에 어떤 탭이 화면에 보이는지와 무관하므로,
// goToProjectionTab()으로 탭을 이동하지 않고 순수 함수만 호출한다(이 사각지대를 완전히 피해간다).
const { test, expect } = require('@playwright/test');
const { seedPortfolio } = require('./fixtures');

async function seedZeroAsset(page, { owner = '신랑', domestic = 100, foreign = 0, monthlyContribution, contributionYears, contributionGrowthRate = 0, allocation = [] } = {}) {
  await seedPortfolio(page, {
    // targets는 여전히 필요 - 목표비중(domestic/해외)과 rate 산정에 쓰인다. asset은 별도로 0원으로 덮어쓴다.
    targets: [{ owner, region: '국내', name: 'E2E국내채권-P1', pct: 100 }],
    projection: {
      contributionGrowthRate,
      // [주의] 두 owner 모두 total===0이면 getOwnerMonthlyContributionInputs의 bothUnset 하위호환
      // 폴백이 켜져 옛 단일 monthlyContribution(기본값 300만원)을 대신 쓴다 - 이 테스트가 의도한
      // "월 적립금 0"과는 다른 값이 섞여 들어가지 않도록 명시적으로 0으로 고정한다.
      monthlyContribution: 0,
      monthlyContributionByOwner: {
        '신랑': owner === '신랑' ? { total: monthlyContribution, years: contributionYears, allocation } : { total: 0, years: null, allocation: [] },
        '와이프': owner === '와이프' ? { total: monthlyContribution, years: contributionYears, allocation } : { total: 0, years: null, allocation: [] }
      }
    }
  });
  // seedPortfolio는 기본적으로 자산가치(assetValueEach=1억)를 채워 넣으므로, "totalValue===0" 케이스는
  // 여기서 직접 0으로 덮어쓴다(0/0 사각지대를 실제로 재현하기 위함) - reload 없이 같은 페이지 컨텍스트
  // 안에서 바로 반영한다(reload를 한 번 더 하면 부트 시퀀스와의 타이밍 경합으로 다른 state 필드가
  // 아직 안 실린 시점에 읽힐 위험이 있다 - 이번 세션에서 실제로 겪은 문제).
  await page.evaluate(({ owner, domestic, foreign }) => {
    state.assets = [];
    state.rebalance[owner].domestic = { '국내': domestic, '해외': foreign };
    persistAssets();
    persistRebalance();
  }, { owner, domestic, foreign });
}

test.describe('P1 - totalValue===0 신규 적립금 반영(회귀 없이 수정)', () => {
  test('1. totalValue > 0(정상 케이스) - 기존 결과가 그대로 유지된다(회귀 없음)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      assetValueEach: 100000000,
      projection: { contributionGrowthRate: 0, monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      const principal = computeFutureValueWithContributionGrowthAndFee(100000000, rate, 20, 0, 0, 0);
      const contribution = computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0);
      return principal + contribution;
    });
    expect(actual).toBeCloseTo(expected, 4);
  });

  test('2. totalValue = 0 + monthlyContribution = 0 - 결과는 0이다', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 0, contributionYears: null });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    expect(actual).toBeCloseTo(0, 6);
  });

  test('3. totalValue = 0 + monthlyContribution > 0(배분 미지정) - 목표 비중(100/0)대로 신규 적립금이 정상 반영된다', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: null, domestic: 100, foreign: 0 });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      return computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0);
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 0);
  });

  test('4. totalValue = 0 + 목표 국내/해외 비중이 60/40인 경우 - 그 비율대로 정확히 배분된다(임의의 50:50 아님)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E국내채권-P1', pct: 100 },
        { owner: '신랑', region: '해외', name: 'E2E해외채권-P1', pct: 100 }
      ],
      projection: { contributionGrowthRate: 0, monthlyContribution: 0, monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await page.evaluate(() => {
      state.assets = [];
      state.rebalance['신랑'].domestic = { '국내': 60, '해외': 40 };
      persistAssets();
      persistRebalance();
    });

    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      const rateD = computeRegionWeightedRate('신랑', '국내', 'normal');
      const rateF = computeRegionWeightedRate('신랑', '해외', 'normal');
      const domesticContrib = computeFutureValueWithContributionGrowthAndFee(0, rateD, 20, 1000000 * 0.6, 0, 0);
      const foreignContrib = computeFutureValueWithContributionGrowthAndFee(0, rateF, 20, 1000000 * 0.4, 0, 0);
      return domesticContrib + foreignContrib;
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 0);
  });

  test('5. totalValue = 0 + 종목별 배분을 명시적으로 지정 - allocation 경로는 원래도 정상 동작(회귀 없음 재확인)', async ({ page }) => {
    // [주의] normalizeMonthlyContributionAllocation(js/01)은 ticker가 falsy(빈 문자열 포함)인 항목을
    // 걸러낸다 - 실제 [적립금 설정] 모달의 "종목 추가" 검색 결과도 항상 비어있지 않은 심볼을 ticker로
    // 채워 넣는다(js/05 triggerMonthlyAllocSearch 계열). 그래서 이 테스트도 실제 규약대로 ticker를
    // label과 같은 비어있지 않은 문자열로 지정한다(ticker=''는 이 스키마에서 "미배분"과 동일하게
    // 취급되어 seedPortfolio 내부 reload 시 필터링된다는 것을 이 테스트를 작성하며 확인했다).
    await seedZeroAsset(page, {
      monthlyContribution: 1000000, contributionYears: null,
      allocation: [{ ticker: 'E2E국내채권-P1', label: 'E2E국내채권-P1', pct: 100, role: '수비수' }]
    });
    const savedAllocation = await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑'].allocation);
    expect(savedAllocation.length).toBe(1); // 배분 항목이 실제로 살아있는지 먼저 확인(사각지대 재발 방지)
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      // getMonthlyAllocationItemRate(js/05)를 그대로 재사용 - 새로 계산식을 만들지 않는다.
      const rate = getMonthlyAllocationItemRate({ ticker: 'E2E국내채권-P1', label: 'E2E국내채권-P1' }, 'normal');
      return computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0);
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 0);
  });

  test('6. totalValue = 0 + 적립기간 0년 - 신규 납입 없음(결과 0)', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: 0 });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    expect(actual).toBeCloseTo(0, 6);
  });

  test('7. totalValue = 0 + 적립기간 10년 - 10년치만 반영되고 10년은 유휴 성장', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: 10 });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const { expected, unlimited } = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      const atStop = computeFutureValueWithContributionGrowthAndFee(0, rate, 10, 1000000, 0, 0);
      return {
        expected: computeFutureValueWithContributionGrowthAndFee(atStop, rate, 10, 0, 0, 0),
        unlimited: computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0)
      };
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 0);
    expect(actual).toBeLessThan(unlimited);
  });

  test('8. totalValue = 0 + 적립기간 20년(=평가기간) - 무제한과 동일', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: 20 });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const unlimited = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      return computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0);
    });
    expect(actual).toBeCloseTo(unlimited, 0);
  });

  test('9. totalValue = 0 + 투자금 증가율(3%) - 정확히 반영된다', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: null, contributionGrowthRate: 3 });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      let balance = 0;
      for (let y = 0; y < 20; y++) {
        const yearMonthly = 1000000 * Math.pow(1.03, y);
        balance = computeFutureValueWithContributionGrowthAndFee(balance, rate, 1, yearMonthly, 0, 0);
      }
      return balance;
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 0);
  });

  test('10. totalValue = 0 + fee(0.5%) - 정확히 반영된다', async ({ page }) => {
    await seedZeroAsset(page, { monthlyContribution: 1000000, contributionYears: null });
    await page.evaluate(() => {
      const key = buildCustomRateKey('', 'E2E국내채권-P1');
      state.projection.customFeeRates[key] = 0.5;
      persistProjection();
    });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const noFee = await page.evaluate(() => {
      const rate = computeRegionWeightedRate('신랑', '국내', 'normal');
      return computeFutureValueWithContributionGrowthAndFee(0, rate, 20, 1000000, 0, 0);
    });
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeLessThan(noFee); // fee가 있으면 항상 fee 없는 경우보다 작아야 한다
  });

  test('11. 기존 portfolio allocation 케이스(자산 있음 + 목표비중 60/40) - 기존 결과와 동일(회귀 없음)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 },
        { owner: '신랑', region: '해외', name: 'E2E해외채권', pct: 100 }
      ],
      assetValueEach: 100000000,
      projection: { contributionGrowthRate: 0, monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await page.evaluate(() => { state.rebalance['신랑'].domestic = { '국내': 60, '해외': 40 }; persistRebalance(); });
    const actual = await page.evaluate(() => simulateRebalancedPreset('normal', 20).yearlyPoints[20].total);
    const expected = await page.evaluate(() => {
      const totalValue = getProjectionGroupTotal(getProjectionGroupStats('신랑'));
      const regionPV = { '국내': totalValue * 0.6, '해외': totalValue * 0.4 };
      const rateD = computeRegionWeightedRate('신랑', '국내', 'normal');
      const rateF = computeRegionWeightedRate('신랑', '해외', 'normal');
      const principal = computeFutureValueWithContributionGrowthAndFee(regionPV['국내'], rateD, 20, 0, 0, 0)
        + computeFutureValueWithContributionGrowthAndFee(regionPV['해외'], rateF, 20, 0, 0, 0);
      const contribD = computeFutureValueWithContributionGrowthAndFee(0, rateD, 20, 1000000 * (regionPV['국내'] / totalValue), 0, 0);
      const contribF = computeFutureValueWithContributionGrowthAndFee(0, rateF, 20, 1000000 * (regionPV['해외'] / totalValue), 0, 0);
      return principal + contribD + contribF;
    });
    expect(actual).toBeCloseTo(expected, 4);
  });
});
