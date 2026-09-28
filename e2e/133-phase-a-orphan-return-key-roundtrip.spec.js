// E2E-133 [PHASE A · A-1] 미연결(orphan) Return Key가 Excel 왕복에서 사라지지 않는다.
//
// 무엇을 고정하는가:
//   「수익률 관리」 목록(getScenarioRateDisplayRows, js/05)은 키를 세 갈래로 모은다 -
//   ① 사전에 등록된 사용자 키(customScenarioRates) ② **orphan 키** ③ 종목 기준 Master 키.
//   ①과 ③은 이미 e2e/36 #6과 e2e/92 X-1 · X-3이 왕복 보존을 고정하고 있는데,
//   ②만 전용 회귀가 없었다(Phase A READ-ONLY 감사 2026-09-28 · GAP-1-①).
//
//   orphan 키란 "계산에는 이미 쓰이고 있는데 사전에도 종목 기준에도 등록되지 않은 키"다.
//   대표적으로 사용자가 대표매칭 칸에 앱이 모르는 키를 직접 적은 경우다.
//   이 경로가 깨지면 그 키가 2시트에서 조용히 빠지고, 저장 · 왕복 한 번에 연결이 사라진다
//   (팝업 초안과 엑셀이 같은 목록을 쓰기 때문이다).
//
// 이 스펙은 **현재 구현된 보존 동작을 고정하는 회귀 테스트**다 - 새 동작을 요구하지 않는다.
// 실제 [엑셀 내보내기] · [엑셀 업로드] 버튼과 실제 XLSX 파일을 쓴다(e2e/36과 같은 방식) -
// export row-builder가 인라인 클릭 핸들러라 따로 부를 수 있는 함수가 없기 때문이다.
//
// 관련 정책: SoT §32-2 F-01(키만 적힌 행 보존) · §33-1 PMD-12 D-3(적용 종목) · §69(Phase A).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

// 앱이 모르는 키(사전 · 종목 기준 · 시스템 기준 어디에도 없다). ZZ 접두어 = 합성 데이터.
const ORPHAN_KEY = 'ZZ_ORPHAN_KEY';
const ASSET_NAME = 'E2E133_오펀검증';

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(({ ORPHAN_KEY, ASSET_NAME }) => {
    // 사전 · 종목 기준을 비워 두어야 orphan 경로(세 번째 갈래)를 실제로 지난다.
    state.projection.customScenarioRates = {};
    state.projection.instrumentReturnKeys = {};
    state.assets = [makeAsset({
      ticker: '005930', name: ASSET_NAME, category: '주식', owner: '신랑', accountType: '일반계좌',
      isDomestic: '국내', quantity: 10, buyPrice: 70000, currentPrice: 75000, currency: 'KRW',
      rateMatchOverride: ORPHAN_KEY
    })];
    persistAssets();
    persistProjection();
  }, { ORPHAN_KEY, ASSET_NAME });
}

// 실제 [엑셀 내보내기] → 실제 [엑셀 업로드](덮어쓰기). e2e/36 roundTrip과 같은 절차다.
async function roundTrip(page) {
  // 덮어쓰기는 confirm()을 한 번 더 받는다 - 핸들러가 없으면 Playwright가 자동 취소해
  // "아무 일도 일어나지 않은 상태"를 검증하는 거짓 통과가 된다(e2e/36 주석의 실측 경고).
  page.on('dialog', (d) => d.accept());
  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  const filePath = path.join(os.tmpdir(), `e2e133-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  await download.saveAs(filePath);
  await page.locator('#excelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  fs.unlinkSync(filePath);
}

const snapshot = (page, key) => page.evaluate((key) => {
  const rows = getScenarioRateDisplayRows();
  const row = rows.find((r) => r.key === key) || null;
  const asset = state.assets.find((a) => a.rateMatchOverride === key) || null;
  return {
    inDisplayRows: !!row,
    row,
    inCustomRates: Object.prototype.hasOwnProperty.call(state.projection.customScenarioRates || {}, key),
    customEntry: (state.projection.customScenarioRates || {})[key] || null,
    inInstrumentMaster: Object.values(getInstrumentReturnKeys()).some((v) => String(v).trim() === key),
    inActiveKeys: [...getActiveScenarioRateKeys()].includes(key),
    assetOverride: asset ? asset.rateMatchOverride : null,
    resolved: asset ? resolveAssetGroupKeyDetail(asset) : null,
    assetCount: state.assets.length
  };
}, key);

test('A-1. 사전에도 종목 기준에도 없는 orphan Return Key가 엑셀 왕복 후에도 사라지지 않는다', async ({ page }) => {
  await seed(page);

  // ── Step 1 · 2. 이 키가 계산에 실제로 쓰이고, orphan 조건(사전 · 종목 기준 미등록)을 만족한다.
  const before = await snapshot(page, ORPHAN_KEY);
  expect(before.assetOverride, '자산이 이 키를 대표매칭으로 쓴다').toBe(ORPHAN_KEY);
  expect(before.resolved.key, '해석 결과가 이 키다(계산에 쓰인다)').toBe(ORPHAN_KEY);
  expect(before.resolved.source).toBe('override');
  expect(before.inActiveKeys, '활성 키 집합에 들어 있다').toBe(true);
  expect(before.inCustomRates, 'orphan 조건 - 사전에 등록돼 있지 않다').toBe(false);
  expect(before.inInstrumentMaster, 'orphan 조건 - 종목 기준에 등록돼 있지 않다').toBe(false);

  // ── Step 3. 목록에 orphan으로 들어간다(구현 구조 그대로 고정한다).
  expect(before.inDisplayRows, 'orphan 경로가 목록에 채워 넣는다').toBe(true);
  expect(before.row.orphan, 'orphan 표식').toBe(true);
  expect(before.row.custom, '시스템 기본 행이 아니다').toBe(true);
  expect(before.row.key).toBe(ORPHAN_KEY);

  // ── Step 4 · 5. 실제 엑셀 왕복. 2시트에 실렸어야만 가져오기가 이 키를 알아볼 수 있다.
  await roundTrip(page);
  const after = await snapshot(page, ORPHAN_KEY);

  expect(after.inCustomRates,
    '왕복 후에도 이 키가 남아 있다 - 2시트에 실리지 않았다면 가져오기가 이 키를 알 수 없다').toBe(true);
  expect(after.inDisplayRows, '목록에서 사라지지 않는다').toBe(true);

  // 왕복이 없던 수익률을 만들어내지 않는다(빈 칸 ≠ 0 · A-2와 같은 원칙).
  expect(after.customEntry.conservative, '빈 칸을 0으로 굳히지 않는다').toBeUndefined();
  expect(after.customEntry.normal).toBeUndefined();
  expect(after.customEntry.optimistic).toBeUndefined();

  // 자산 쪽 사용자 지정과 해석 결과도 그대로다.
  expect(after.assetCount, '자산이 늘거나 사라지지 않는다').toBe(before.assetCount);
  expect(after.assetOverride, '사용자 지정 대표매칭이 보존된다').toBe(ORPHAN_KEY);
  expect(after.resolved.key, '왕복 후에도 같은 키로 계산한다').toBe(ORPHAN_KEY);
  expect(after.resolved.source).toBe('override');
});
