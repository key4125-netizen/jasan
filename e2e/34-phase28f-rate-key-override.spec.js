// E2E-34 Phase 28-F - 대표매칭키(rateMatchOverride) 전달 계층 통합 상시 회귀.
//
// [배경] 수익률 해석에는 두 경로가 있다: 경로 A(자산 기반 - getProjectionAssetGroupKey ->
// resolveProjectionRateForKey, asset.rateMatchOverride를 그대로 본다)와 경로 B(목표비중 기반 -
// getTargetProjectionRate, 입력이 state.rebalance의 target이라 rateMatchOverride를 몰랐다:
// 결정론 일반계좌 예측과 Monte Carlo 어댑터가 모두 경로 B를 쓴다). Phase 28-F는 target에 대응하는
// "지금 보유 중인 자산"을 동적으로 찾아(findRateMatchOverrideForTarget) 그 override를 경로 B에도
// 태우는 helper를 추가해 두 경로를 통일했다.
//
// [절대 원칙] 이 스펙은 사용자의 "수익률 관리 기준" 표에 실제로 있는 키(엑셀 golden reference의 18개
// 키 등)를 단 하나도 하드코딩하지 않는다 - 이 기능은 "사용자가 코드 수정 없이 임의의 키를 추가/수정/
// 삭제할 수 있어야 한다"는 계약이므로, 회귀도 그 계약을 지키는 임의의 테스트 전용 키만 사용한다.
//
// [해석 우선순위, PM 지시] 1) asset.rateMatchOverride 2) customScenarioRates[key] 3) 시스템 기본값
// (SCENARIO_RATE_PRESETS/getSystemDefaultRate) 4) 카테고리/지역 폴백.
const { test, expect } = require('@playwright/test');

const TEST_KEY = 'E2E34_TESTKEY_ALPHA';
const TEST_KEY_2 = 'E2E34_TESTKEY_BETA';
const PRESET = 'normal';

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
}

test.describe('Phase 28-F: 대표매칭키 override가 경로 A/B 모두에 동일하게 반영된다', () => {
  test('1. override가 키워드 매칭보다 우선한다(경로 A) - 이름은 나스닥이지만 override는 테스트 전용 키', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ TEST_KEY, PRESET }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY] = { conservative: 1.11, normal: 2.22, optimistic: 3.33 };
      const asset = makeAsset({
        name: 'E2E34나스닥이름이지만실제로는테스트자산', category: '주식', owner: '신랑', accountType: '일반계좌',
        isDomestic: '해외', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'USD',
        rateMatchOverride: TEST_KEY
      });
      const keyA = getProjectionAssetGroupKey(asset);
      const rateA = resolveProjectionRateForKey(keyA, PRESET, true);
      return { keyA, rateA };
    }, { TEST_KEY, PRESET });
    expect(result.keyA).toBe(TEST_KEY);
    expect(result.rateA).toBeCloseTo(2.22, 6);
  });

  test('2. 같은 override가 목표비중(경로 B, namedHolding target)에서도 동일 값을 낸다 - 경로 A/B 동등성', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ TEST_KEY, PRESET }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY] = { conservative: 4.44, normal: 5.55, optimistic: 6.66 };
      state.assets = [makeAsset({
        name: 'E2E34보유자산비교', category: '주식', owner: '신랑', accountType: '일반계좌',
        isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW',
        rateMatchOverride: TEST_KEY
      })];
      persistAssets();
      const keyA = getProjectionAssetGroupKey(state.assets[0]);
      const rateA = resolveProjectionRateForKey(keyA, PRESET, false);
      const target = { type: 'namedHolding', name: 'E2E34보유자산비교', label: 'E2E34보유자산비교', owner: '신랑' };
      const rateB = getTargetProjectionRate(target, PRESET, '국내');
      return { keyA, rateA, rateB };
    }, { TEST_KEY, PRESET });
    expect(result.rateA).toBeCloseTo(5.55, 6);
    expect(result.rateB).toBeCloseTo(result.rateA, 6);
  });

  test('3. 신규 커스텀 키를 추가하면 코드 수정 없이 두 경로 모두 즉시 반영된다', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ TEST_KEY_2, PRESET }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY_2] = { conservative: 3, normal: 7, optimistic: 12 };
      state.assets = [makeAsset({
        name: 'E2E34신규키자산', category: '채권', owner: '와이프', accountType: '일반계좌',
        isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW',
        rateMatchOverride: TEST_KEY_2
      })];
      persistAssets();
      const rateA = resolveProjectionRateForKey(TEST_KEY_2, PRESET, false);
      const target = { type: 'namedHolding', name: 'E2E34신규키자산', label: 'E2E34신규키자산', owner: '와이프' };
      const rateB = getTargetProjectionRate(target, PRESET, '국내');
      return { rateA, rateB };
    }, { TEST_KEY_2, PRESET });
    expect(result.rateA).toBeCloseTo(7, 6);
    expect(result.rateB).toBeCloseTo(7, 6);
  });

  test('4. 커스텀 키 값을 수정하면 두 경로 모두 새 값을 즉시 반영한다', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ TEST_KEY_2, PRESET }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY_2] = { conservative: 3, normal: 7, optimistic: 12 };
      state.assets = [makeAsset({
        name: 'E2E34수정테스트자산', category: '채권', owner: '신랑', accountType: '일반계좌',
        isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW',
        rateMatchOverride: TEST_KEY_2
      })];
      persistAssets();
      const target = { type: 'namedHolding', name: 'E2E34수정테스트자산', label: 'E2E34수정테스트자산', owner: '신랑' };
      const before = { A: resolveProjectionRateForKey(TEST_KEY_2, PRESET, false), B: getTargetProjectionRate(target, PRESET, '국내') };
      state.projection.customScenarioRates[TEST_KEY_2] = { conservative: 1, normal: 2, optimistic: 3 };
      const after = { A: resolveProjectionRateForKey(TEST_KEY_2, PRESET, false), B: getTargetProjectionRate(target, PRESET, '국내') };
      return { before, after };
    }, { TEST_KEY_2, PRESET });
    expect(result.before.A).toBeCloseTo(7, 6);
    expect(result.before.B).toBeCloseTo(7, 6);
    expect(result.after.A).toBeCloseTo(2, 6);
    expect(result.after.B).toBeCloseTo(2, 6);
  });

  test('5. 커스텀 키를 삭제하면 두 경로 모두 폴백으로 떨어지고, 삭제된 키가 되살아나지 않는다', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ TEST_KEY_2, PRESET }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY_2] = { conservative: 3, normal: 7, optimistic: 12 };
      state.assets = [makeAsset({
        name: 'E2E34삭제테스트자산', category: '채권', owner: '신랑', accountType: '일반계좌',
        isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW',
        rateMatchOverride: TEST_KEY_2
      })];
      persistAssets();
      delete state.projection.customScenarioRates[TEST_KEY_2];
      const target = { type: 'namedHolding', name: 'E2E34삭제테스트자산', label: 'E2E34삭제테스트자산', owner: '신랑' };
      const rateA = resolveProjectionRateForKey(TEST_KEY_2, PRESET, false);
      const rateB = getTargetProjectionRate(target, PRESET, '국내');
      const keyStillPresent = Object.prototype.hasOwnProperty.call(state.projection.customScenarioRates, TEST_KEY_2);
      return { rateA, rateB, keyStillPresent };
    }, { TEST_KEY_2, PRESET });
    expect(result.keyStillPresent).toBe(false);
    expect(result.rateA).toBeCloseTo(result.rateB, 6);
  });

  test('6. customScenarioRates는 localStorage에 영속되어 새로고침 후에도 유지된다', async ({ page }) => {
    await seed(page);
    await page.evaluate(({ TEST_KEY }) => {
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[TEST_KEY] = { conservative: 9, normal: 10, optimistic: 11 };
      persistProjection();
    }, { TEST_KEY });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined');
    const after = await page.evaluate(({ TEST_KEY, PRESET }) => resolveProjectionRateForKey(TEST_KEY, PRESET, false), { TEST_KEY, PRESET });
    expect(after).toBeCloseTo(10, 6);
  });

  test('7. 같은 이름의 종목을 두 소유자가 각자 다른 override로 보유하면, target.owner가 있는 쪽의 override를 우선한다', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(({ PRESET }) => {
      const KEY_HUSBAND = 'E2E34_OWNER_HUSBAND';
      const KEY_WIFE = 'E2E34_OWNER_WIFE';
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[KEY_HUSBAND] = { conservative: 1, normal: 2, optimistic: 3 };
      state.projection.customScenarioRates[KEY_WIFE] = { conservative: 10, normal: 20, optimistic: 30 };
      state.assets = [
        makeAsset({ name: 'E2E34공동보유자산', category: '주식', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW', rateMatchOverride: KEY_HUSBAND }),
        makeAsset({ name: 'E2E34공동보유자산', category: '주식', owner: '와이프', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW', rateMatchOverride: KEY_WIFE })
      ];
      persistAssets();
      const targetHusband = { type: 'namedHolding', name: 'E2E34공동보유자산', label: 'E2E34공동보유자산', owner: '신랑' };
      const targetWife = { type: 'namedHolding', name: 'E2E34공동보유자산', label: 'E2E34공동보유자산', owner: '와이프' };
      return {
        husband: getTargetProjectionRate(targetHusband, PRESET, '국내'),
        wife: getTargetProjectionRate(targetWife, PRESET, '국내')
      };
    }, { PRESET });
    expect(result.husband).toBeCloseTo(2, 6);
    expect(result.wife).toBeCloseTo(20, 6);
  });

  test('8. Monte Carlo 어댑터(buildMonteCarloInputFromState)의 instrument muAnnual도 override를 그대로 반영한다', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(async ({ PRESET }) => {
      const KEY = 'E2E34_MC_ADAPTER_KEY';
      state.projection.customScenarioRates = state.projection.customScenarioRates || {};
      state.projection.customScenarioRates[KEY] = { conservative: 20, normal: 25, optimistic: 30 };
      state.assets = [makeAsset({
        name: 'E2E34_MC자산', category: '채권', owner: '신랑', accountType: '일반계좌',
        isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW',
        rateMatchOverride: KEY
      })];
      persistAssets();
      state.rebalance = state.rebalance || {};
      state.rebalance['신랑'] = {
        updatedAt: Date.now(),
        domestic: { '국내': 100, '해외': 0 },
        targets: { '국내': [{ type: 'namedHolding', name: 'E2E34_MC자산', label: 'E2E34_MC자산', pct: 100, role: '수비수' }], '해외': [] }
      };
      persistRebalance();
      const out = await buildMonteCarloInputFromState({ presetKey: PRESET, ownerFilter: '신랑' });
      const inst = (out.instruments || []).find((i) => i.key && i.key.includes('E2E34_MC자산'));
      return { errors: out.errors, muAnnual: inst ? inst.muAnnual : null };
    }, { PRESET });
    expect(result.errors).toEqual([]);
    expect(result.muAnnual).not.toBeNull();
    expect(result.muAnnual).toBeCloseTo(0.25, 6); // normal=25% -> 0.25
  });
});
