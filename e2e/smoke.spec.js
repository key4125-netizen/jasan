// Playwright 최소 smoke test (검증환경 구축 전용 - 기능 검증 시나리오는 다음 단계에서 작성).
// 목적: 실제 브라우저(Chromium)를 실행해 (1) 페이지 정상 로드 (2) 주요 UI 렌더링 (3) JS runtime
// error 없음 (4) 핵심 입력 UI 존재 (5) Monte Carlo UI 로드까지만 확인한다. 기능 코드는 건드리지 않는다.

const { test, expect } = require('@playwright/test');

test('1. 애플리케이션 페이지가 정상적으로 로드된다', async ({ page }) => {
  const response = await page.goto('/');
  expect(response.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/Smart Asset Manager/);
});

test('2. 주요 UI(대시보드 핵심 카드)가 정상 렌더링된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Smart Asset Manager')).toBeVisible();
  await expect(page.getByText('일간금융평가손익')).toBeVisible();
  await expect(page.getByText('총금융자산평가손익')).toBeVisible();
});

test('3. 페이지 로드 중 JavaScript runtime error가 발생하지 않는다', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/');
  await page.waitForTimeout(1000); // 초기 렌더/자동 갱신 스케줄링이 끝날 시간을 준다
  expect(pageErrors, `runtime error 발생: ${pageErrors.join('; ')}`).toEqual([]);
});

test('4. 기본 화면에서 핵심 입력/탐색 UI가 존재한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('포트폴리오/자산예측')).toBeVisible();
  await expect(page.getByText('거래내역')).toBeVisible();
  await expect(page.getByText('총자산현황')).toBeVisible();
});

test('5. Monte Carlo 관련 UI가 정상적으로 로드된다', async ({ page }) => {
  await page.goto('/');
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('미래 예측', { exact: true }).click();
  await expect(page.getByText('Monte Carlo 미래자산 예측')).toBeVisible();
  await expect(page.getByText('Monte Carlo 실행', { exact: true })).toBeVisible();
});
