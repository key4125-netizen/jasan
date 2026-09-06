// E2E-31 Phase 25 - 입력 UI 모바일/다크모드 접근성 회귀.
//
// [기준] Phase 23-C에서 확립한 터치 타겟 44px과 프로젝트 원칙의 "중요한 텍스트 12px 미만 금지"를
// Phase 25에서 새로 만들거나 옮긴 입력 UI에도 그대로 적용한다. 가로 overflow는 0이어야 한다.
// [허용오차] 브라우저가 devicePixelRatio 반올림 때문에 min-height:44px 요소를 43.99997px로 보고하는
// 경우가 실측된다 - 기준을 낮춘 것이 아니라 부동소수 오차만 흡수한다.
//
// [ESLint 규약] 이 저장소의 e2e는 page.evaluate 안에서 raw 브라우저 전역(document/window/
// getComputedStyle)을 쓰지 않는다 - locator.evaluate로 요소를 받아 거기서 접근한다(no-undef 오탐 방지).
const { test, expect } = require('@playwright/test');

const TOUCH_MIN = 43.9;
const VIEWPORTS = [[375, 812], [390, 844], [412, 915], [768, 1024]];

const fontSizeOf = (locator) => locator.evaluate((el) => parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize));
const scrollWidthOf = (page) => page.locator('body').evaluate((el) => el.scrollWidth);
const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));

async function expectTouchOk(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box, selector).not.toBeNull();
  expect(box.height, selector).toBeGreaterThanOrEqual(TOUCH_MIN);
}

for (const [w, h] of VIEWPORTS) {
  for (const dark of [true, false]) {
    test(`${w}x${h} ${dark ? 'Dark' : 'Light'} - Phase 25 입력 UI가 44px/12px/무오버플로 기준을 지킨다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForFunction(() => typeof state !== 'undefined');
      await page.evaluate(() => {
        state.assets = [
          makeAsset({ name: 'MOB채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW' }),
          makeAsset({ name: 'MOBISA', category: '채권', owner: '신랑', accountType: 'ISA', isDomestic: '국내', quantity: 1, buyPrice: 50000000, currentPrice: 50000000, currency: 'KRW' })
        ];
        persistAssets();
        state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'MOB채권', label: 'MOB채권', pct: 100, role: '수비수' }], '해외': [] } };
        persistRebalance();
        renderAll();
      });
      if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
      expect(await isDark(page)).toBe(dark);

      await page.getByText('포트폴리오/자산예측').click();
      await page.getByText('미래 예측', { exact: true }).click();
      expect(await scrollWidthOf(page)).toBeLessThanOrEqual(w);

      // 투자계획/가정으로 들어가는 진입 버튼 4종
      for (const sel of ['#goToRebalanceTargetBtn', '#mcFeeRatesToggleBtn', '#taxAdvantagedPlanBtn', '#openMonthlyContributionAllocationBtn']) {
        await expectTouchOk(page, sel);
      }

      // 절세계좌 팝업 - 취소/확인
      await page.locator('#taxAdvantagedPlanBtn').click();
      await expectTouchOk(page, '#cancelTaxAdvantagedPlanModalBtn');
      await expectTouchOk(page, '#saveTaxAdvantagedPlanModalBtn');
      await page.locator('#cancelTaxAdvantagedPlanModalBtn').click();

      // 운용보수 팝업 - 입력칸 크기/글자크기 + 취소/확인
      await page.locator('#mcFeeRatesToggleBtn').click();
      await expectTouchOk(page, '#cancelMcFeeRatesModalBtn');
      await expectTouchOk(page, '#saveMcFeeRatesModalBtn');
      const feeInput = page.locator('#mcFeeRatesList input[data-fee-key]').first();
      expect((await feeInput.boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(await fontSizeOf(feeInput)).toBeGreaterThanOrEqual(12);
      await page.locator('#cancelMcFeeRatesModalBtn').click();

      // 미래예측 가정 팝업 - 인플레이션율 입력
      await page.locator('#projectionAssumptionsAccordionBtn').click();
      await page.locator('#openProjectionAssumptionsBtn').click();
      const inflation = page.locator('#inflationRateInput');
      expect((await inflation.boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(await fontSizeOf(inflation)).toBeGreaterThanOrEqual(12);
      await page.locator('#cancelProjectionAssumptionsModalBtn').click();

      // 적립금 설정 팝업 - 증가율 입력이 여기로 옮겨왔다
      await page.locator('#openMonthlyContributionAllocationBtn').click();
      const growth = page.locator('#contributionGrowthRateInput');
      expect((await growth.boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(await fontSizeOf(growth)).toBeGreaterThanOrEqual(12);
      await page.locator('#cancelMonthlyContributionAllocationModalBtn').click();

      expect(await scrollWidthOf(page)).toBeLessThanOrEqual(w);
    });
  }
}

/* ---------------------------------------------------------------------------
 * [Phase 25 M-1] Portfolio 목표비중 모달 접근성 보완 회귀.
 * 예전 실측: role select 10px/25px, 비중 % 입력 34px, [종목 추가] 34px - 프로젝트의 확정 기준
 * (44px 터치 / 12px 최소 텍스트)에 미달했다. 표시 크기만 바꾸고 draft/계산/validation은 그대로다.
 * ------------------------------------------------------------------------ */
for (const [w, h] of VIEWPORTS) {
  for (const dark of [true, false]) {
    test(`${w}x${h} ${dark ? 'Dark' : 'Light'} - 목표비중 모달 컨트롤이 44px/12px 기준을 지킨다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForFunction(() => typeof state !== 'undefined');
      await page.evaluate(() => {
        state.assets = [makeAsset({ name: 'M1채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 100000000, currentPrice: 100000000, currency: 'KRW' })];
        persistAssets();
        state.rebalance['신랑'] = { domestic: { '국내': 60, '해외': 40 }, targets: { '국내': [{ type: 'namedHolding', name: 'M1채권', label: 'M1채권', pct: 100, role: '수비수' }], '해외': [] } };
        persistRebalance(); renderAll();
      });
      if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();

      await page.getByText('포트폴리오/자산예측').click();
      await page.locator('[data-rebalance-detail-btn][data-owner="신랑"]').click();
      await expect(page.locator('#rebalanceTargetModal')).toBeVisible();

      // 1) role select - 44px 이상 + 12px 이상
      const roleSelect = page.locator('#rebalanceTargetModal select[data-rtm-role]').first();
      expect((await roleSelect.boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(await fontSizeOf(roleSelect)).toBeGreaterThanOrEqual(12);

      // 2) 목표비중 % 입력 - 44px 이상
      const pct = page.locator('#rebalanceTargetModal input[data-rtm-pct]').first();
      expect((await pct.boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);

      // 3) 국내/해외 split 입력 - 44px 이상
      expect((await page.locator('#rtm_domesticKR').boundingBox()).height).toBeGreaterThanOrEqual(TOUCH_MIN);

      // 4) [종목 추가] 버튼 - 44px 이상
      for (const sel of ['#rtmAddToggleBtnDomestic', '#rtmAddToggleBtnForeign']) {
        await expectTouchOk(page, sel);
      }

      // 5) 취소/확인 - 44px 이상 + 가로 overflow 없음
      await expectTouchOk(page, '#cancelRebalanceTargetModalBtn');
      await expectTouchOk(page, '#confirmRebalanceTargetModalBtn');
      expect(await scrollWidthOf(page)).toBeLessThanOrEqual(w);
    });
  }
}

test('M-1 - 목표비중 draft 계약이 그대로다(취소=원복, 확인=반영)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'M1채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 100000000, currentPrice: 100000000, currency: 'KRW' })];
    persistAssets();
    state.rebalance['신랑'] = { domestic: { '국내': 60, '해외': 40 }, targets: { '국내': [{ type: 'namedHolding', name: 'M1채권', label: 'M1채권', pct: 100, role: '수비수' }], '해외': [] } };
    persistRebalance(); renderAll();
  });
  await page.getByText('포트폴리오/자산예측').click();
  const readRebalance = () => page.evaluate(() => JSON.stringify(state.rebalance['신랑']));
  const readLS = () => page.evaluate(() => localStorage.getItem('sam_rebalance_v1'));

  // 취소 - state/localStorage 불변
  await page.locator('[data-rebalance-detail-btn][data-owner="신랑"]').click();
  const before = await readRebalance();
  const lsBefore = await readLS();
  await page.locator('#rtm_domesticKR').fill('20');
  await page.locator('input[data-rtm-pct]').first().fill('55');
  await page.locator('select[data-rtm-role]').first().selectOption('공격수');
  await page.waitForTimeout(150);
  expect(await readRebalance()).toBe(before);
  await page.locator('#cancelRebalanceTargetModalBtn').click();
  expect(await readRebalance()).toBe(before);
  expect(await readLS()).toBe(lsBefore);

  // 확인 - 반영된다
  await page.locator('[data-rebalance-detail-btn][data-owner="신랑"]').click();
  await page.locator('#rtm_domesticKR').fill('20');
  await page.locator('#confirmRebalanceTargetModalBtn').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeHidden();
  expect(await page.evaluate(() => state.rebalance['신랑'].domestic['국내'])).toBe(20);
  expect(await page.evaluate(() => state.rebalance['신랑'].domestic['해외'])).toBe(80);
});
