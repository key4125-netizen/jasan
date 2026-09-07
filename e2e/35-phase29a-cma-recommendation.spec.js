// E2E-35 Phase 29-A - "새로운 장기 전망 확인" 추천 기능 상시 회귀.
//
// [핵심 계약] CMA_SOURCE_METADATA[anchor].recommended는 "사용자에게 제안할 후보값"일 뿐 계산값이
// 아니다(recommended != active rate) - 사용자가 [적용]을 눌러야만 customScenarioRates에 반영되고,
// 그 전까지는 배지/팝업을 열어보기만 해도 어떤 계산 결과도 바뀌지 않는다. 그리고 사용자가 이미
// customScenarioRates[key][preset]을 직접 확정한 필드는 새 추천이 있어도 절대 건드리지 않는다
// (필드 단위 override 보호).
//
// [절대 원칙] 실제 서비스에 출하되는 CMA_SOURCE_METADATA의 recommended는 전부 null이다(이번 phase에서
// PM이 검증한 신규 수치가 없음) - 이 스펙은 실제 재무 수치가 아닌, 명백히 가짜임을 알 수 있는 테스트
// 전용 값(예: version 9001+, source에 "E2E-TEST" 명시)을 실행 중에만 주입해 메커니즘을 검증한다.
// 페이지가 매 테스트마다 새로 로드되므로(page.goto) 이 런타임 전용 주입은 다음 테스트로 새지 않는다.
const { test, expect } = require('@playwright/test');
const { seedPriceHistory } = require('./fixtures');

const ANCHOR = 'US_EQUITY';
const KEY = 'NASDAQ'; // 시스템 기본 상품 키(SCENARIO_RATE_BASE_ROWS 소속) - US_EQUITY 앵커에 매핑됨
const PRESET = 'normal';

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistProjection === 'function');
}

function setRecommended(page, overrides) {
  return page.evaluate(({ ANCHOR, overrides }) => {
    CMA_SOURCE_METADATA[ANCHOR].recommended = {
      version: 9001, conservative: 1.1, normal: 2.2, optimistic: 3.3,
      source: 'E2E-TEST(가상값, 실제 데이터 아님)', asOfDate: '2099-01-01', forecastHorizonYears: 10,
      ...overrides
    };
  }, { ANCHOR, overrides: overrides || {} });
}

const getPending = (page, key) => page.evaluate((key) => getPendingCmaFields(key), key);
const getCustomEntry = (page, key) => page.evaluate((key) => (state.projection.customScenarioRates || {})[key], key);
const getStatus = (page, anchor) => page.evaluate((anchor) => (state.projection.cmaRecommendationStatus || {})[anchor], anchor);

test('1. recommendation이 없으면(null) 배지 후보가 없다', async ({ page }) => {
  await seed(page);
  const pending = await getPending(page, KEY);
  expect(pending.fields).toEqual([]);
});

test('2. recommendation이 있고 override가 없으면 3개 필드 전부 배지 후보다', async ({ page }) => {
  await seed(page);
  await setRecommended(page);
  const pending = await getPending(page, KEY);
  expect(pending.fields.sort()).toEqual(['conservative', 'normal', 'optimistic']);
});

test('3. 특정 필드에 사용자 override가 있으면 그 필드만 배지 후보에서 빠진다(필드 단위 보호)', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    state.projection.customScenarioRates[key] = { label: key, normal: 7.7 }; // normal만 사용자가 직접 확정
    persistProjection();
  }, KEY);
  await setRecommended(page);
  const pending = await getPending(page, KEY);
  expect(pending.fields.sort()).toEqual(['conservative', 'optimistic']); // normal은 제외
});

test('4. 모든 필드에 override가 있으면 배지 자체가 뜨지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    state.projection.customScenarioRates[key] = { label: key, conservative: 1, normal: 2, optimistic: 3 };
    persistProjection();
  }, KEY);
  await setRecommended(page);
  const pending = await getPending(page, KEY);
  expect(pending.fields).toEqual([]);
});

test('5. 배지/팝업을 열어보기만 한 상태에서는 결정론 rate가 전혀 바뀌지 않는다(recommended != active rate)', async ({ page }) => {
  await seed(page);
  const before = await page.evaluate((key) => getReferenceRate('normal', key), KEY);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  const afterOpen = await page.evaluate((key) => getReferenceRate('normal', key), KEY);
  expect(afterOpen).toBe(before);
  expect(afterOpen).not.toBeCloseTo(2.2, 6); // 추천값(2.2)으로 바뀌지 않았어야 함
});

test('6. [나중에] - customScenarioRates는 변하지 않고, seenVersion만 기록된다', async ({ page }) => {
  await seed(page);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationLaterBtn').click();
  const entry = await getCustomEntry(page, KEY);
  expect(entry).toBeUndefined();
  const status = await getStatus(page, ANCHOR);
  expect(status.seenVersion).toBe(9001);
});

test('7. [나중에] 이후 같은 버전은 재표시되지 않는다(동일 recommendation 재노출 방지)', async ({ page }) => {
  await seed(page);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationLaterBtn').click();
  const pendingAfter = await getPending(page, KEY);
  expect(pendingAfter.fields).toEqual([]);
});

test('8. [적용] - customScenarioRates에 추천값이 반영된다', async ({ page }) => {
  await seed(page);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationApplyBtn').click();
  const entry = await getCustomEntry(page, KEY);
  expect(entry.conservative).toBeCloseTo(1.1, 6);
  expect(entry.normal).toBeCloseTo(2.2, 6);
  expect(entry.optimistic).toBeCloseTo(3.3, 6);
  const status = await getStatus(page, ANCHOR);
  expect(status.seenVersion).toBe(9001);
});

test('9. [적용] 후 결정론 rate(getReferenceRate/getTargetProjectionRate)가 새 값으로 바뀐다', async ({ page }) => {
  await seed(page);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationApplyBtn').click();
  const result = await page.evaluate(({ key, PRESET }) => {
    const target = { type: 'ticker', ticker: 'QQQM', label: 'QQQM' }; // TICKER_RATE_KEY_ALIAS: QQQM -> NASDAQ
    return { viaKey: getReferenceRate(PRESET, key), viaTarget: getTargetProjectionRate(target, PRESET, '해외') };
  }, { key: KEY, PRESET });
  expect(result.viaKey).toBeCloseTo(2.2, 6);
  expect(result.viaTarget).toBeCloseTo(2.2, 6); // 경로 A/B 동일 - Phase 28-F 계약 유지
});

test('10. [적용] 후 Monte Carlo 어댑터 muAnnual도 새 값을 반영한다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({
      name: 'E2E35_MC자산', ticker: 'QQQM', category: '주식', owner: '신랑', accountType: '일반계좌',
      isDomestic: '해외', quantity: 1, buyPrice: 100000000, currentPrice: 100000000, currency: 'USD'
    })];
    persistAssets();
    state.rebalance = state.rebalance || {};
    state.rebalance['신랑'] = {
      updatedAt: Date.now(), domestic: { '국내': 0, '해외': 100 },
      targets: { '국내': [], '해외': [{ type: 'ticker', ticker: 'QQQM', label: 'QQQM', pct: 100, role: '공격수' }] }
    };
    persistRebalance();
  });
  // [Phase 47-G] 이 테스트의 목표는 ticker(QQQM)라 MC 어댑터가 그 종목의 가격 이력을 요구한다.
  // 테스트 브라우저는 외부 네트워크가 차단돼 있으므로 결정론적 합성 시계열을 당일 캐시에 넣어 준다
  // (fixtures.seedPriceHistory 주석 참고) - 실제 시세가 아니라 σ를 계산할 최소 재료일 뿐이고,
  // 이 테스트가 검증하는 muAnnual은 수익률 가정에서만 나오므로 값에 영향이 없다.
  await seedPriceHistory(page, ['QQQM']);
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationApplyBtn').click();
  const result = await page.evaluate(async ({ PRESET }) => {
    const out = await buildMonteCarloInputFromState({ presetKey: PRESET, ownerFilter: '신랑' });
    const inst = (out.instruments || []).find((i) => i.key && i.key.includes('QQQM'));
    return { errors: out.errors, muAnnual: inst ? inst.muAnnual : null };
  }, { PRESET });
  expect(result.errors).toEqual([]);
  expect(result.muAnnual).toBeCloseTo(0.022, 6); // normal 2.2% -> 0.022
});

test('11. version이 올라간 새 recommendation은 [나중에] 이후에도 다시 인식된다', async ({ page }) => {
  await seed(page);
  await setRecommended(page, { version: 9001 });
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationLaterBtn').click();
  expect((await getPending(page, KEY)).fields).toEqual([]); // 같은 버전은 아직 숨김
  await setRecommended(page, { version: 9002, conservative: 9, normal: 9, optimistic: 9 }); // 새 버전 도착
  const pending = await getPending(page, KEY);
  expect(pending.fields.sort()).toEqual(['conservative', 'normal', 'optimistic']);
});

test('12. [적용]은 관련 없는 기존 사용자 customScenarioRates 항목을 전혀 건드리지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates['E2E35_KEEP'] = { label: '보존 확인용', conservative: 11, normal: 12, optimistic: 13 };
    persistProjection();
  });
  await setRecommended(page);
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationApplyBtn').click();
  const kept = await getCustomEntry(page, 'E2E35_KEEP');
  expect(kept).toEqual({ label: '보존 확인용', conservative: 11, normal: 12, optimistic: 13 });
});

test('13. legacy_approximation 앵커(KR_EQUITY 등)는 recommended가 없어 배지가 뜨지 않는다', async ({ page }) => {
  await seed(page);
  const pendingKospi = await getPending(page, 'KOSPI');
  const pendingBond = await getPending(page, 'BOND');
  expect(pendingKospi.fields).toEqual([]);
  expect(pendingBond.fields).toEqual([]);
  expect(pendingKospi.recommended).toBeNull();
  expect(pendingBond.recommended).toBeNull();
});
