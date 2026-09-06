// E2E-28 Phase 23-C - Dashboard Header 반응형 레이아웃 전용 회귀.
//
// Phase 23-A에서 발견되고 Phase 23-B/C에서 두 번의 시행착오 끝에 확정된 Header 구조를 검증한다:
//   - 1200px 미만: 환율 뱃지 단독 줄 + (다크모드/서버동기화/설정) 묶음 줄 - 의도적인 2행.
//   - 1200px 이상: 4요소가 한 줄로 합쳐짐(기존 데스크탑 레이아웃과 동일).
// 어떤 폭에서도 body 레벨 가로 오버플로가 없어야 하고, 서버동기화 버튼이 부분적으로만 보이는(스크롤이
// 필요한) 상태가 되어서는 안 된다(PM이 Phase 23-B를 반려한 핵심 사유) - 이 파일은 그 반려 사유가
// 재발하지 않았음을 375~1440px 전 구간에서 직접 측정으로 증명한다. 계산/State/Safety 로직은 이번
// Header 작업과 무관해 별도로 건드리지 않았다(계산값 회귀는 e2e/22 등 기존 파일이 이미 커버함).
//
// [Phase 23-C Final] PM의 제품 결정으로 Header의 "환율보기" 진입점(#kpiExchangeRateDetailBtn)이
// 제거되고 현재 환율 숫자(#exchangeRateInput)만 남았다 - 상세 시장정보는 Dashboard 본문의 "시장 현황
// & 매크로 브리핑" 카드가 전담한다(정보 소유권 분리, 기능 삭제 아님). 아래 헬퍼는 모든 뷰포트에서
// 이 버튼이 더 이상 존재하지 않음을 함께 검증한다. #exchangeRateModal 자체는 PM 지침에 따라 삭제하지
// 않아 DOM에는 남아있다(현재는 도달 경로 없음) - 이 모달을 여는 e2e는 원래도 없었다.
const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1023, height: 900 },
  { width: 1024, height: 900 },
  { width: 1025, height: 900 },
  { width: 1050, height: 900 },
  { width: 1075, height: 900 },
  { width: 1100, height: 900 },
  { width: 1150, height: 900 },
  { width: 1200, height: 900 },
  { width: 1440, height: 900 },
];

// [헬퍼] 한 뷰포트에서 Header의 4개 utility 요소(환율/다크모드/서버동기화/설정)가 전부 보이고, 클릭
// 가능하고, body 레벨 가로 오버플로가 없는지 한 번에 검사한다. 375~1440px x Light/Dark 조합을 전부
// 개별 assertion으로 늘어놓으면 26개 테스트가 되어 중복이 커지므로, 이 함수 하나로 압축한다.
async function assertHeaderHealthyAt(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');

  const darkBtn = page.locator('#darkModeBtn');
  const syncBtn = page.locator('#syncSettingsBtn');
  const gearBtn = page.locator('#systemManagementBtn');
  const fxInput = page.locator('#exchangeRateInput');

  await expect(darkBtn).toBeVisible();
  await expect(syncBtn).toBeVisible();
  await expect(gearBtn).toBeVisible();
  await expect(fxInput).toBeVisible();

  // [Phase 23-C Final] Header "환율보기" 진입점은 제품 결정으로 제거됐다 - 모든 뷰포트에서 부재를
  // 확인한다(다른 요소로 대체되거나 되살아나지 않았는지).
  await expect(page.locator('#kpiExchangeRateDetailBtn')).toHaveCount(0);

  // 서버동기화 버튼이 실제로 완전히(잘리지 않고) 보이는지 - Phase 23-B에서 반려된 "부분 클리핑"
  // 재발을 막기 위한 핵심 검증. 부모(overflow-x-auto 컨테이너 또는 header) 기준 좌우 경계 안에
  // 완전히 들어와 있어야 한다.
  const syncBox = await syncBtn.boundingBox();
  const bodyScrollWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
  expect(syncBox).not.toBeNull();
  expect(syncBox.x).toBeGreaterThanOrEqual(0);
  expect(syncBox.x + syncBox.width).toBeLessThanOrEqual(width + 1); // +1은 서브픽셀 반올림 여유

  // body 레벨 가로 오버플로 없음(Phase 22의 1024~1099px 버그, Phase 23-B의 재발 모두 이 조건으로 검증됨).
  expect(bodyScrollWidth).toBeLessThanOrEqual(width);

  // 44x44 터치 타겟(다크모드/설정) - Phase 23-C STEP 2.
  const darkBox = await darkBtn.boundingBox();
  const gearBox = await gearBtn.boundingBox();
  expect(darkBox.width).toBeGreaterThanOrEqual(44);
  expect(darkBox.height).toBeGreaterThanOrEqual(44);
  expect(gearBox.width).toBeGreaterThanOrEqual(44);
  expect(gearBox.height).toBeGreaterThanOrEqual(44);

  // 클릭 가능 여부(실제 클릭까지 - 설정 모달이 열리는지로 검증).
  await gearBtn.click();
  await expect(page.locator('#systemManagementModal')).toBeVisible();
  await page.locator('#closeSystemManagementModalBtn').click();
  await expect(page.locator('#systemManagementModal')).toBeHidden();

  await darkBtn.click();
  const isDarkNow = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  expect(isDarkNow).toBe(true);
  // 다크모드로 전환한 뒤에도 오버플로/클리핑이 재발하지 않는지 동일 기준으로 재확인.
  const bodyScrollWidthDark = await page.locator('body').evaluate((el) => el.scrollWidth);
  expect(bodyScrollWidthDark).toBeLessThanOrEqual(width);
  const syncBoxDark = await syncBtn.boundingBox();
  expect(syncBoxDark.x + syncBoxDark.width).toBeLessThanOrEqual(width + 1);
  await darkBtn.click(); // 원상 복구(라이트로)
}

for (const vp of VIEWPORTS) {
  test(`${vp.width}x${vp.height} - Header utility(환율/다크모드/서버동기화/설정) 전부 보이고 클릭 가능, 오버플로/클리핑 없음(Light/Dark)`, async ({ page }) => {
    await assertHeaderHealthyAt(page, vp.width, vp.height);
  });
}

test('1024px에서 서버동기화 버튼이 100% 보인다(Phase 23-B에서 0%로 반려됐던 정확한 지점)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/');
  const syncBtn = page.locator('#syncSettingsBtn');
  const box = await syncBtn.boundingBox();
  // Phase 23-B 반려 사유: 1024px에서 서버동기화가 0% 보였다(전체가 화면/부모 밖). 이제는 전체가
  // 뷰포트 안에 완전히 들어와야 한다.
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
});

test('1200px 이상에서는 환율/다크모드/서버동기화/설정이 한 줄로 합쳐진다(기존 데스크탑 레이아웃 유지)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const fxBox = await page.locator('#exchangeRateInput').boundingBox();
  const gearBox = await page.locator('#systemManagementBtn').boundingBox();
  // 같은 행에 있어야 한다 - 두 요소의 높이가 달라(환율 입력칸 35px vs 버튼 44px) items-center 정렬 시
  // 중심선 기준 최대 ~11px 정도 y좌표 차이가 생길 수 있어 20px을 오차 허용으로 둔다(별도 행이라면
  // 아래 2행 구조 테스트처럼 40px 이상 차이가 남 - 실측 확인).
  expect(Math.abs(fxBox.y - gearBox.y)).toBeLessThan(20);
});

test('375px 미만~1150px 구간에서는 환율 뱃지가 단독 줄, 설정이 다크모드/서버동기화와 같은 줄에 있는 의도적 2행 구조다', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  const fxBox = await page.locator('#exchangeRateInput').boundingBox();
  const darkBox = await page.locator('#darkModeBtn').boundingBox();
  const gearBox = await page.locator('#systemManagementBtn').boundingBox();
  // 환율은 다크모드/설정과 다른 행(y 좌표가 유의미하게 다름).
  expect(Math.abs(fxBox.y - darkBox.y)).toBeGreaterThan(10);
  // 다크모드와 설정은 같은 행.
  expect(Math.abs(darkBox.y - gearBox.y)).toBeLessThan(10);
});
