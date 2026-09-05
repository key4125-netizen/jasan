// E2E-15 일반계좌 "적립 기간(년)" UI/UX (Step 3) - "적립금 설정" 모달의 입력 필드/도움말 문구와,
// null(제한없음)/0/명시값 저장·재진입·새로고침 유지 여부를 검증한다. 계산 로직은 Step 1/2에서 이미
// 검증했으므로 이 파일은 UI 동작(값 표시/저장/유지, 회귀 없음)에 집중한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

async function openModal(page) {
  await page.locator('#openMonthlyContributionAllocationBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeVisible();
}
async function saveModal(page) {
  await page.locator('#saveMonthlyContributionAllocationModalBtn').click();
  await expect(page.locator('#monthlyContributionAllocationModal')).toBeHidden();
}

test.describe('적립 기간(년) UI/UX(Step 3)', () => {
  test('기존 데이터(null/미설정) 로딩 - 입력칸이 비어있고 "제한없음" placeholder와 설명 문구가 보인다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await openModal(page);
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveValue('');
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveAttribute('placeholder', '제한없음');
    const modalText = await page.locator('#monthlyContributionAllocationModal').innerText();
    expect(modalText).toContain('적립 기간');
    expect(modalText).toContain('미래예측 기간(20년)과는 다른 개념');
    expect(modalText).toContain('비워두면');
    expect(modalText).toContain('추가로 투자할지');
  });

  test('0 입력 후 저장 -> 재진입 시 0이 그대로 유지된다(null로 되돌아가지 않음)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await openModal(page);
    await page.locator('#monthlyContributionYearsInputHusband').fill('0');
    await saveModal(page);
    await openModal(page);
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveValue('0');
    const saved = await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑'].years);
    expect(saved).toBe(0);
  });

  test('10/20 입력 후 저장 -> 재진입 및 새로고침 후에도 값이 유지된다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [
        { owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 },
        { owner: '와이프', region: '국내', name: 'E2E국내채권2', pct: 100 }
      ],
      projection: { monthlyContributionByOwner: { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 2000000, years: null, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await openModal(page);
    await page.locator('#monthlyContributionYearsInputHusband').fill('10');
    await page.locator('#monthlyContributionYearsInputWife').fill('20');
    await saveModal(page);

    // 재진입 시 유지
    await openModal(page);
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveValue('10');
    await expect(page.locator('#monthlyContributionYearsInputWife')).toHaveValue('20');
    await page.locator('#closeMonthlyContributionAllocationModalBtn').click();

    // 새로고침 후에도 유지
    await page.reload();
    await goToProjectionTab(page);
    await openModal(page);
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveValue('10');
    await expect(page.locator('#monthlyContributionYearsInputWife')).toHaveValue('20');
    const saved = await page.evaluate(() => ({
      husband: state.projection.monthlyContributionByOwner['신랑'].years,
      wife: state.projection.monthlyContributionByOwner['와이프'].years
    }));
    expect(saved.husband).toBe(10);
    expect(saved.wife).toBe(20);
  });

  test('적립 기간 칸을 건드리지 않고 저장하면 null(제한없음)로 남아있는다("|| 15" 재발 방지 회귀)', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: { monthlyContributionByOwner: { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } } }
    });
    await goToProjectionTab(page);
    await openModal(page);
    // 금액만 입력하고 적립 기간 칸은 전혀 건드리지 않는다.
    await page.locator('#monthlyContributionTotalInputHusband').fill('1500000');
    await saveModal(page);
    const saved = await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑']);
    expect(saved.total).toBe(1500000);
    expect(saved.years).toBeNull();
    // 재진입해도 입력칸은 여전히 비어있어야 한다(15 등으로 자동 채워지지 않음).
    await openModal(page);
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toHaveValue('');
  });

  test('모바일 화면에서도 "매달 투자할 금액"/"적립 기간(년, 선택)" 입력칸이 정상적으로 보인다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: {}
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await goToProjectionTab(page);
    await openModal(page);
    await expect(page.locator('#monthlyContributionTotalInputHusband')).toBeVisible();
    await expect(page.locator('#monthlyContributionYearsInputHusband')).toBeVisible();
    const totalBox = await page.locator('#monthlyContributionTotalInputHusband').boundingBox();
    const yearsBox = await page.locator('#monthlyContributionYearsInputHusband').boundingBox();
    // 375px 폭 안에 두 입력칸이 겹치지 않고 폭을 벗어나지 않아야 한다.
    expect(totalBox.x + totalBox.width).toBeLessThanOrEqual(375);
    expect(yearsBox.x + yearsBox.width).toBeLessThanOrEqual(375);
    expect(yearsBox.x).toBeGreaterThanOrEqual(totalBox.x + totalBox.width - 1);
  });

  test('기존 적립금 설정 기능 회귀 - 금액 입력/종목 배분 UI가 정상 동작한다', async ({ page }) => {
    await seedPortfolio(page, {
      targets: [{ owner: '신랑', region: '국내', name: 'E2E국내채권', pct: 100 }],
      projection: {}
    });
    await goToProjectionTab(page);
    await openModal(page);
    await page.locator('#monthlyContributionTotalInputHusband').fill('3000000');
    await saveModal(page);
    const summary = await page.locator('#monthlyContributionSummary').innerText();
    expect(summary).toMatch(/300만|3\.0백만|300|3,000,000/);
    const saved = await page.evaluate(() => state.projection.monthlyContributionByOwner['신랑'].total);
    expect(saved).toBe(3000000);
  });
});
