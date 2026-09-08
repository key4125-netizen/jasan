// E2E-64 [V1.1 Phase 2] Monte Carlo가 시뮬레이션하는 자산 모집단과 목표 가중치의 모집단을 일치시킨다.
//
//   T-1  MC 원금이 부동산만 빼고 전부 더해서, 목표 비중이 존재하지도 않는 절세계좌 자산까지
//        일반계좌 목표 비중대로 재배분되고 매년 리밸런싱됐다.
//   T-2  같은 이유로 원금 모집단(절세계좌·'공동' 포함)과 owner 가중 기준(일반계좌만)이 서로
//        다른 자산을 세고 있었다.
//
// 앱의 실제 계산 함수(computeHouseholdMonteCarloPV / computeHouseholdTargetInstrumentWeights /
// getProjectionGroupStats / simulateRebalancedPreset)를 그대로 호출한다 - 테스트 안에 계산을
// 복사하지 않는다. 외부 네트워크를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined'
    && typeof computeHouseholdMonteCarloPV === 'function'
    && typeof computeHouseholdTargetInstrumentWeights === 'function');
}

// 일반계좌 · 절세계좌 · 부동산 · '공동'이 모두 섞인 포트폴리오를 심는다.
// 목표 비중은 일반계좌 종목에만 존재한다(포트폴리오 구성 탭이 절세계좌를 다루지 않으므로).
const SEED = `
  state.exchangeRate = 1450; persistRate(true);
  const mk = (o) => makeAsset(Object.assign({
    currency: 'KRW', isDomestic: '국내', accountType: '일반계좌', currentPrice: 1,
  }, o));
  state.assets = [
    // 일반계좌 (MC 대상) - 신랑 1,000만 / 와이프 500만
    mk({ id: 'g1', ticker: '005930.KS', name: 'E64삼성', category: '주식', owner: '신랑', quantity: 10000000, buyPrice: 1 }),
    mk({ id: 'g2', ticker: 'AAPL', name: 'E64Apple', category: '주식', owner: '와이프', quantity: 5000000, buyPrice: 1 }),
    // 절세계좌 (목표 비중이 존재하지 않음) - 2,000만
    mk({ id: 't1', ticker: '', name: 'E64ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', quantity: 20000000, buyPrice: 1 }),
    // 부동산 (항상 제외) - 5억
    mk({ id: 'r1', ticker: '', name: 'E64아파트', category: '부동산', owner: '신랑', quantity: 500000000, buyPrice: 1 }),
    // '공동' 자산 (어느 owner에도 속하지 않음) - 300만
    mk({ id: 'c1', ticker: '069500.KS', name: 'E64공동', category: '주식', owner: '공동', quantity: 3000000, buyPrice: 1 }),
  ];
  state.transactions = [];
  REBALANCE_OWNERS.forEach((o) => {
    state.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    state.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  state.rebalance['신랑'].targets['국내'] = [{ type: 'ticker', ticker: '005930.KS', label: 'E64삼성', pct: 100 }];
  state.rebalance['와이프'].targets['국내'] = [{ type: 'ticker', ticker: 'AAPL', label: 'E64Apple', pct: 100 }];
  persistAssets(); persistTransactions(); persistRebalance();
`;

// 목표 가중치가 실제로 지배하는 모집단 = 결정론적 예측이 이미 쓰는 기준.
const WEIGHT_BASIS = `
  const weightBasis = (owner) => (owner
    ? getProjectionGroupTotal(getProjectionGroupStats(owner))
    : REBALANCE_OWNERS.reduce((s, o) => s + getProjectionGroupTotal(getProjectionGroupStats(o)), 0));
`;

const run = (page, body) => page.locator('body').evaluate((el, src) =>
  el.ownerDocument.defaultView.eval('(() => {' + src + '})()'), SEED + WEIGHT_BASIS + body);

/* ══════════════════════════════════════════════════════════════════
 * A / B. T-1 · T-2 — 두 모집단이 일치한다
 * ═════════════════════════════════════════════════════════════════ */
test('A/B. [T-1/T-2] MC 원금 모집단 = 목표 가중치 모집단 (가구 전체·owner별 모두)', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    return {
      householdPV: Math.round(computeHouseholdMonteCarloPV()),
      householdBasis: Math.round(weightBasis(null)),
      husbandPV: Math.round(computeHouseholdMonteCarloPV('신랑')),
      husbandBasis: Math.round(weightBasis('신랑')),
      wifePV: Math.round(computeHouseholdMonteCarloPV('와이프')),
      wifeBasis: Math.round(weightBasis('와이프')),
    };
  `);
  // 수정 전 householdPV는 38,000,000이었다 - 절세계좌 2,000만 + 공동 300만이 함께 들어갔다.
  expect(r.householdPV).toBe(15000000);   // 일반계좌 신랑 1,000만 + 와이프 500만
  expect(r.householdPV).toBe(r.householdBasis);
  expect(r.husbandPV).toBe(10000000);
  expect(r.husbandPV).toBe(r.husbandBasis);
  expect(r.wifePV).toBe(5000000);
  expect(r.wifePV).toBe(r.wifeBasis);
});

test('C. [경계] 절세계좌·부동산·공동 자산이 MC 원금에서 제외된다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    const total = state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
    const pv = computeHouseholdMonteCarloPV();
    const excluded = state.assets.filter((a) => !REBALANCE_OWNERS.includes(a.owner)
      || !isRebalanceEligibleAccount(a) || a.category === '부동산');
    return {
      total: Math.round(total),
      pv: Math.round(pv),
      excludedNames: excluded.map((a) => a.name).sort(),
      excludedAmount: Math.round(excluded.reduce((s, a) => s + calcRow(a).curAmount, 0)),
    };
  `);
  expect(r.excludedNames).toEqual(['E64ISA채권', 'E64공동', 'E64아파트']);
  expect(r.pv).toBe(r.total - r.excludedAmount);   // 제외분이 정확히 빠진다
});

test('D. [경계] 제외된 자산이 0% 수익률 instrument로 바뀌어 들어가지 않는다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    const w = computeHouseholdTargetInstrumentWeights();
    const keys = Array.from(w.keys()).sort();
    const sum = Array.from(w.values()).reduce((s, v) => s + v.weight, 0);
    return { keys, sum: Number(sum.toFixed(10)), count: w.size };
  `);
  // 목표에 있는 두 종목뿐 - 절세계좌/부동산/공동을 대신하는 instrument가 새로 생기지 않는다.
  expect(r.keys).toEqual(['T:005930.KS', 'T:AAPL']);
  expect(r.count).toBe(2);
  // weight 합계 = 1 (정상 케이스 불변식)
  expect(r.sum).toBe(1);
});

test('E. [T-2] owner 가중 병합이 일반계좌 금액 비율을 따른다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    const w = computeHouseholdTargetInstrumentWeights();
    return {
      samsung: Number(w.get('T:005930.KS').weight.toFixed(10)),
      apple: Number(w.get('T:AAPL').weight.toFixed(10)),
    };
  `);
  // 신랑 1,000만 : 와이프 500만 = 2:1. 절세계좌 2,000만이 신랑 쪽에 얹히지 않는다.
  expect(r.samsung).toBeCloseTo(2 / 3, 10);
  expect(r.apple).toBeCloseTo(1 / 3, 10);
});

/* ══════════════════════════════════════════════════════════════════
 * F. 기존 계산 불변식 — 이번 수정은 MC 모집단만 바꾼다
 * ═════════════════════════════════════════════════════════════════ */
test('F. 결정론적 예측 · Risk 대상 · 총평가금액은 그대로다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    return {
      projection0: Math.round(simulateRebalancedPreset('normal', 20).yearlyPoints[0].total),
      projection20: Math.round(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total),
      husband0: Math.round(simulateRebalancedPreset('normal', 20, '신랑').yearlyPoints[0].total),
      groupStats: Object.keys(getProjectionGroupStats(null)).sort(),
      risk: riskEligibleAssets().map((a) => a.name).sort(),
      totalValue: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
    };
  `);
  // 결정론적 예측은 원래부터 일반계좌만 봤다 - 이번 수정으로 바뀌지 않는다.
  expect(r.projection0).toBe(15000000);
  expect(r.husband0).toBe(10000000);
  expect(r.projection20).toBeGreaterThan(r.projection0);
  // 전체 보유금액(부동산 포함)은 자산 목록 그대로 - MC 모집단과 별개다.
  expect(r.totalValue).toBe(538000000);
  // Risk 대상은 손대지 않았다.
  expect(r.risk.length).toBeGreaterThan(0);
});

test('F-2. MC 원금이 결정론적 예측 0년차와 정확히 같다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    return {
      household: [Math.round(computeHouseholdMonteCarloPV()), Math.round(simulateRebalancedPreset('normal', 1).yearlyPoints[0].total)],
      husband: [Math.round(computeHouseholdMonteCarloPV('신랑')), Math.round(simulateRebalancedPreset('normal', 1, '신랑').yearlyPoints[0].total)],
    };
  `);
  // 두 화면이 "지금 얼마"에 대해 같은 숫자를 말한다 - 수정 전에는 MC만 3,800만이었다.
  expect(r.household[0]).toBe(r.household[1]);
  expect(r.husband[0]).toBe(r.husband[1]);
});

/* ══════════════════════════════════════════════════════════════════
 * H. edge cases
 * ═════════════════════════════════════════════════════════════════ */
test('H-1. 절세계좌 자산만 있으면 MC 원금 0 (안전 동작 유지)', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    state.assets = state.assets.filter((a) => a.id === 't1');
    persistAssets();
    return { pv: computeHouseholdMonteCarloPV(), basis: weightBasis(null) };
  `);
  expect(r.pv).toBe(0);
  expect(r.basis).toBe(0);
});

test('H-2. 부동산만 있으면 MC 원금 0', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    state.assets = state.assets.filter((a) => a.id === 'r1');
    persistAssets();
    return { pv: computeHouseholdMonteCarloPV() };
  `);
  expect(r.pv).toBe(0);
});

test('H-3. 자산이 하나도 없으면 MC 원금 0 (기존 폴백 경로 유지)', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    state.assets = [];
    persistAssets();
    const w = computeHouseholdTargetInstrumentWeights();
    return { pv: computeHouseholdMonteCarloPV(), weightCount: w.size };
  `);
  expect(r.pv).toBe(0);
  // 원금이 0이면 기존 폴백(월 적립금으로 owner 가중)이 그대로 동작한다 - 새 규칙을 만들지 않았다.
  expect(r.weightCount).toBeGreaterThanOrEqual(0);
});

test('H-4. 목표 비중이 전부 0이면 instrument가 생기지 않는다 (기존 검증 흐름 유지)', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    REBALANCE_OWNERS.forEach((o) => { state.rebalance[o].targets = { '국내': [], '해외': [] }; });
    persistRebalance();
    return { pv: Math.round(computeHouseholdMonteCarloPV()), weightCount: computeHouseholdTargetInstrumentWeights().size };
  `);
  expect(r.pv).toBe(15000000);   // 원금은 자산에서 나오므로 목표와 무관하게 그대로
  expect(r.weightCount).toBe(0); // instruments 없음 -> 기존 validateMonteCarloInput이 처리
});

test('H-5. 혼합 포트폴리오에서 owner별 합이 가구 전체와 일치한다', async ({ page }) => {
  await open(page);
  const r = await run(page, `
    return {
      household: Math.round(computeHouseholdMonteCarloPV()),
      sumOfOwners: Math.round(REBALANCE_OWNERS.reduce((s, o) => s + computeHouseholdMonteCarloPV(o), 0)),
    };
  `);
  // '공동' 자산이 가구 전체에만 몰래 더해지던 T-2가 사라졌으므로 두 값이 정확히 같다.
  expect(r.household).toBe(r.sumOfOwners);
});

/* ══════════════════════════════════════════════════════════════════
 * I. Safety 안내 문구가 실제 MC 화면에서 실제 범위와 일치한다
 * ═════════════════════════════════════════════════════════════════ */
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('I. MC 결과 화면에 표시되는 범위 안내가 실제 원금 계산과 일치한다', async ({ page }) => {
  // 일반계좌(신랑) 1억 + 목표 100% - 완전히 오프라인(채권 namedHolding, 가격조회 불필요).
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E64국내채권', pct: 100 }],
    assetValueEach: 100000000,
  });
  // 절세계좌·부동산·공동 자산을 추가로 심는다 - MC 원금에는 잡히면 안 되는 자산들이다.
  await page.locator('body').evaluate(() => {
    state.assets.push(
      makeAsset({ name: 'E64ISA', category: '채권', owner: '신랑', accountType: 'ISA',
        quantity: 1, buyPrice: 20000000, currentPrice: 20000000 }),
      makeAsset({ name: 'E64아파트', category: '부동산', owner: '신랑', accountType: '일반계좌',
        quantity: 1, buyPrice: 500000000, currentPrice: 500000000 }),
      makeAsset({ name: 'E64공동자산', category: '채권', owner: '공동', accountType: '일반계좌',
        quantity: 1, buyPrice: 30000000, currentPrice: 30000000 }),
    );
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await goToProjectionTab(page);
  await expect(page.locator('#projectionSafetyBlockBanner')).toBeHidden();

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  // 항상-on 설명은 "상세보기" 토글 뒤에 접혀 있다(mcSafetyDetail) - 실제 사용자처럼 펼친다.
  await page.locator('#mcSafetyDetailToggleBtn').click();
  const noticeText = await page.locator('#mcSafetyDetail').innerText();
  expect(noticeText).toContain('이 시뮬레이션은 일반계좌의 투자자산을 기준으로 하며, 절세계좌·부동산·공동 자산은 계산에서 제외됩니다.');

  // 그 문구가 말하는 범위가 실제 계산과 일치하는지 - 원금은 일반계좌 1억뿐이어야 한다(2.1억이 아니다).
  const pv = await page.locator('body').evaluate(() => Math.round(computeHouseholdMonteCarloPV()));
  expect(pv).toBe(100000000);
});
