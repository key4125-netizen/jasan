// E2E-36 Phase 29-B - Excel round-trip에서 "시스템 기본값"과 "사용자 override"의 구분이 보존되는지
// 검증하는 상시 회귀. 실제 앱의 [엑셀 내보내기]/[엑셀 업로드] 버튼과 실제 XLSX 파일(다운로드→재업로드)
// 을 그대로 사용한다(e2e/20 Excel 거래입력 검증과 동일한 방식) - export row-builder는 인라인 클릭
// 핸들러라 별도로 노출된 함수가 없으므로, 진짜 버튼을 눌러 진짜 파일을 만들고 그 파일을 진짜 import
// 경로에 그대로 먹인다.
//

// [핵심 계약, Phase 29-B] Export는 "최종 유효값(getReferenceRate)"이 아니라 "실제 저장된 원본
// override"만 적는다 - 시스템 기본값을 그냥 따르는 필드는 빈 칸으로 남는다. Import는 이미(Phase 29-B
// 이전부터) 빈 칸을 "오버라이드 없음"으로 정확히 처리하므로 이번엔 export 쪽만 고쳤다. 두 invariant를
// 모든 케이스에서 확인한다:
//   1) Export -> Import 전후 "effective scenario rate"(getReferenceRate 결과)가 동일하다.
//   2) Export -> Import 전후 "explicit user override의 존재 여부"(customScenarioRates[key]의 필드
//      존재 유무)가 동일하다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

const PRESET = 'normal';
const KEY = 'NASDAQ'; // US_EQUITY 앵커(Phase 29-A)에 매핑되는 시스템 기본 상품 키

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [makeAsset({
      ticker: 'QQQM', name: 'E2E36_QQQM', category: '주식', owner: '신랑', accountType: '일반계좌',
      isDomestic: '해외', quantity: 10, buyPrice: 50000, currentPrice: 55000, currency: 'USD'
    })];
    persistAssets();
  });
}

// 실제 [엑셀 내보내기] -> 실제 [엑셀 업로드](덮어쓰기)를 그대로 수행한다. 두 번째 시트("수익률 관리
// 기준")는 선택 여부와 무관하게 항상 처리되므로(js/12) 덮어쓰기로 고정해도 이 스펙의 검증 대상과
// 무관하다.
async function roundTrip(page) {
  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  const filePath = path.join(os.tmpdir(), `e2e36-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  await download.saveAs(filePath);
  await page.locator('#excelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  fs.unlinkSync(filePath);
}

const getEntry = (page, key) => page.evaluate((key) => (state.projection.customScenarioRates || {})[key], key);
const getEffective = (page, key) => page.evaluate(({ key, PRESET }) => getReferenceRate(PRESET, key), { key, PRESET });

test('1. [default-only] override가 전혀 없으면 round-trip 후에도 override가 생기지 않는다(시스템 기본값 유지)', async ({ page }) => {
  await seed(page);
  const before = await getEffective(page, KEY);
  await roundTrip(page);
  const entry = await getEntry(page, KEY);
  expect(entry === undefined || entry.normal === undefined).toBe(true);
  const after = await getEffective(page, KEY);
  expect(after).toBe(before);
});

test('2. [partial override] normal만 override면 round-trip 후에도 normal만 override로 남는다', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    state.projection.customScenarioRates[key] = { label: key, normal: 5.8 };
    persistProjection();
  }, KEY);
  const beforeConservative = await getEffective(page, KEY); // conservative는 아직 시스템 기본값 - 참고용 아님, normal 확인이 목적
  await roundTrip(page);
  const entry = await getEntry(page, KEY);
  expect(entry.normal).toBeCloseTo(5.8, 6);
  expect(entry.conservative).toBeUndefined();
  expect(entry.optimistic).toBeUndefined();
  const afterNormal = await page.evaluate((key) => getReferenceRate('normal', key), KEY);
  expect(afterNormal).toBeCloseTo(5.8, 6);
  void beforeConservative;
});

test('3. [full override] 3개 필드 전부 override면 round-trip 후에도 3개 전부 유지된다', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    state.projection.customScenarioRates[key] = { label: key, conservative: 1, normal: 2, optimistic: 3 };
    persistProjection();
  }, KEY);
  await roundTrip(page);
  const entry = await getEntry(page, KEY);
  expect(entry.conservative).toBeCloseTo(1, 6);
  expect(entry.normal).toBeCloseTo(2, 6);
  expect(entry.optimistic).toBeCloseTo(3, 6);
});

test('4. [Phase 29-A 추천 적용] 적용된 추천값도 일반 override와 동일하게 round-trip에서 보호된다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    CMA_SOURCE_METADATA.US_EQUITY.recommended = {
      version: 9101, conservative: 1.5, normal: 2.5, optimistic: 3.5,
      source: 'E2E-TEST(가상값)', asOfDate: '2099-01-01', forecastHorizonYears: 10
    };
  });
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationApplyBtn').click();
  const beforeEntry = await getEntry(page, KEY);
  expect(beforeEntry.normal).toBeCloseTo(2.5, 6); // 적용 확인
  await roundTrip(page);
  const afterEntry = await getEntry(page, KEY);
  expect(afterEntry.conservative).toBeCloseTo(1.5, 6);
  expect(afterEntry.normal).toBeCloseTo(2.5, 6);
  expect(afterEntry.optimistic).toBeCloseTo(3.5, 6);
});

test('5. [Phase 29-A 추천 미적용/나중에] round-trip이 대기 중인 추천을 override로 바꾸지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    CMA_SOURCE_METADATA.US_EQUITY.recommended = {
      version: 9102, conservative: 8.8, normal: 9.9, optimistic: 10.1,
      source: 'E2E-TEST(가상값)', asOfDate: '2099-01-01', forecastHorizonYears: 10
    };
  });
  await page.evaluate((key) => openCmaRecommendationModal(key), KEY);
  await page.locator('#cmaRecommendationLaterBtn').click(); // 적용 아님 - 나중에
  await roundTrip(page);
  const entry = await getEntry(page, KEY);
  expect(entry === undefined || entry.normal === undefined).toBe(true); // 추천값(9.9)이 override로 새지 않음
  const pending = await page.evaluate((key) => getPendingCmaFields(key), KEY);
  expect(pending.fields).toEqual([]); // seenVersion 그대로라 여전히 숨김 상태 - round-trip이 이 상태를 흔들지 않음
});

test('6. round-trip은 관련 없는 다른 custom key를 전혀 건드리지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates['E2E36_KEEP'] = { label: '보존 확인용', conservative: 11, normal: 12, optimistic: 13 };
    persistProjection();
  });
  await roundTrip(page);
  const kept = await getEntry(page, 'E2E36_KEEP');
  expect(kept).toEqual({ label: '보존 확인용', conservative: 11, normal: 12, optimistic: 13 });
});

test('7. round-trip 전후 deterministic rate/MC muAnnual이 동일하다(effective rate invariant)', async ({ page }) => {
  await seed(page);
  // [채권/namedHolding 사용 이유] 이 샌드박스는 외부 시세 API가 막혀 있어(Phase 23-R) 주식/ETF는 가격
  // 이력이 없어 MC가 σ 오류로 instruments:null을 반환한다 - 채권은 무위험자산이라 가격 이력이 필요
  // 없다(σ=0 고정, e2e/34·e2e/35의 MC 검증과 동일한 이유로 채권을 쓴다).
  await page.evaluate(() => {
    state.assets = [makeAsset({
      name: 'E2E36_채권', category: '채권', owner: '신랑', accountType: '일반계좌',
      isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW'
    })];
    persistAssets();
    state.projection.customScenarioRates.BOND = { label: 'BOND', normal: 6.6 }; // normal만 override
    persistProjection();
    state.rebalance = state.rebalance || {};
    state.rebalance['신랑'] = {
      updatedAt: Date.now(), domestic: { '국내': 100, '해외': 0 },
      targets: { '국내': [{ type: 'namedHolding', name: 'E2E36_채권', label: 'E2E36_채권', pct: 100, role: '수비수' }], '해외': [] }
    };
    persistRebalance();
  });
  const capture = () => page.evaluate(async ({ PRESET }) => {
    const target = { type: 'namedHolding', name: 'E2E36_채권', label: 'E2E36_채권' };
    const out = await buildMonteCarloInputFromState({ presetKey: PRESET, ownerFilter: '신랑' });
    const inst = (out.instruments || []).find((i) => i.key && i.key.includes('E2E36_채권'));
    return { errors: out.errors, rate: getTargetProjectionRate(target, PRESET, '국내'), muAnnual: inst ? inst.muAnnual : null };
  }, { PRESET });
  const before = await capture();
  expect(before.errors).toEqual([]);
  expect(before.rate).toBeCloseTo(6.6, 6);
  await roundTrip(page);
  const after = await capture();
  expect(after.errors).toEqual([]);
  expect(after.rate).toBeCloseTo(before.rate, 6);
  expect(after.muAnnual).toBeCloseTo(before.muAnnual, 6);
});

test('8. round-trip은 기존 자산 수량/평가금액과 거래내역을 바꾸지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.transactions = [{ id: 'e2e36-tx1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'QQQM', name: 'E2E36_QQQM', type: 'buy', quantity: 10, price: 50000, currency: 'USD', fee: 0 }];
    persistTransactions();
  });
  const beforeTxCount = await page.evaluate(() => state.transactions.length);
  const before = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E36_QQQM');
    return { quantity: a.quantity, buyPrice: a.buyPrice, currentPrice: a.currentPrice };
  });
  await roundTrip(page);
  const after = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E36_QQQM');
    return { quantity: a.quantity, buyPrice: a.buyPrice, currentPrice: a.currentPrice };
  });
  const afterTxCount = await page.evaluate(() => state.transactions.length);
  expect(after).toEqual(before);
  expect(afterTxCount).toBe(beforeTxCount); // 자산 엑셀 import는 거래내역 시트를 다루지 않음 - 완전히 무관
});

test('9. cloud sync 구조(buildSyncBlob)는 round-trip 이후에도 customScenarioRates를 그대로 포함한다', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    state.projection.customScenarioRates[key] = { label: key, normal: 5.8 };
    persistProjection();
  }, KEY);
  await roundTrip(page);
  const normalRate = await page.evaluate((key) => buildSyncBlob().projection.customScenarioRates[key].normal, KEY);
  expect(normalRate).toBeCloseTo(5.8, 6);
});
