// E2E-21 Phase 14-B / N-1 - "데이터 초기화" 버튼이 신규 설치와 동일한 monthlyContributionByOwner
// 기본값(years: null = 제한없음)을 생성하는지 검증한다. 예전엔 이 리셋 핸들러가 years:15를 직접
// 하드코딩해, 신규 설치(js/01 기본값, years:null)와 조용히 어긋났었다(Phase 14-A N-1).
const { test, expect } = require('@playwright/test');

test('신규 설치 기본값 - monthlyContributionByOwner.years는 두 owner 모두 null(제한없음)이다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  const years = await page.evaluate(() => ({
    신랑: state.projection.monthlyContributionByOwner['신랑'].years,
    와이프: state.projection.monthlyContributionByOwner['와이프'].years,
  }));
  expect(years).toEqual({ 신랑: null, 와이프: null });
});

test('데이터 초기화 - 적립기간을 5년으로 바꾼 뒤 초기화하면 신규 설치와 동일하게 null(제한없음)로 되돌아간다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');

  // 신규 설치 상태에서 명시적으로 5년을 설정(정상 동작 확인 겸 - 초기화 전 "달라진 상태"를 만든다).
  await page.evaluate(() => {
    state.projection.monthlyContributionByOwner['신랑'].years = 5;
    state.projection.monthlyContributionByOwner['와이프'].years = 5;
    persistProjection();
  });
  const beforeReset = await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑'].years);
  expect(beforeReset).toBe(5);

  page.once('dialog', (dialog) => dialog.accept()); // "모든 자산 데이터를 삭제하시겠습니까?" 확인
  // [Phase 17 P1-1] 데이터 초기화 버튼이 헤더에서 시스템관리(⚙) 모달 안으로 이동했다 - 먼저 그
  // 진입점을 열어야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#systemManagementBtn').click();
  await page.locator('#resetDataBtn').click();
  await expect(page.locator('#toastContainer')).toContainText('초기화');

  const afterReset = await page.evaluate(() => ({
    신랑: state.projection.monthlyContributionByOwner['신랑'].years,
    와이프: state.projection.monthlyContributionByOwner['와이프'].years,
    total: state.projection.monthlyContributionByOwner['신랑'].total,
    allocation: state.projection.monthlyContributionByOwner['신랑'].allocation,
  }));
  expect(afterReset).toEqual({ 신랑: null, 와이프: null, total: 0, allocation: [] });
});

test('데이터 초기화 이후에도 사용자가 명시적으로 적립기간(0/10/20)을 설정하는 기존 동작은 그대로 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');

  page.once('dialog', (dialog) => dialog.accept());
  // [Phase 17 P1-1] 데이터 초기화 버튼이 헤더에서 시스템관리(⚙) 모달 안으로 이동했다 - 먼저 그
  // 진입점을 열어야 실제 버튼이 보인다(기능/id/핸들러는 전혀 바뀌지 않았다).
  await page.locator('#systemManagementBtn').click();
  await page.locator('#resetDataBtn').click();
  await expect(page.locator('#toastContainer')).toContainText('초기화');

  await page.evaluate(() => {
    state.projection.monthlyContributionByOwner['신랑'].years = 0;
    state.projection.monthlyContributionByOwner['와이프'].years = 20;
    persistProjection();
  });
  const values = await page.evaluate(() => ({
    신랑: state.projection.monthlyContributionByOwner['신랑'].years,
    와이프: state.projection.monthlyContributionByOwner['와이프'].years,
  }));
  expect(values).toEqual({ 신랑: 0, 와이프: 20 });
});
