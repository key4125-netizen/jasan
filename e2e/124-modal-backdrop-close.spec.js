// E2E-124 [PM 지시 2026-09-26 · ISSUE-A] 팝업 배경(오버레이) 클릭으로 닫기.
//
// 1차 전수 테스트에서 팝업 28개 중 둘만 배경 클릭으로 닫히지 않았다
// (수익률 관리 scenarioRateManagerModal · CMA 추천 cmaRecommendationModal).
// 이 파일은 그 둘을 실제로 눌러 확인하고, 기존 닫기 경로(X · 취소 · 뒤로가기)와
// "내부를 눌렀을 때는 닫히지 않는다"까지 같이 고정한다.
//
// 전부 합성 데이터다. 외부 네트워크를 쓰지 않는다.
/* global document, MouseEvent */
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof closeScenarioRateManagerModal === 'function' && typeof closeCmaRecommendationModal === 'function');
  await page.waitForTimeout(300);
}

// 팝업의 배경 = 팝업 요소 자신. 자식 위가 아닌 여백을 눌러야 e.target이 팝업이 된다.
async function clickBackdrop(page, id) {
  await page.locator(`#${id}`).evaluate((el) => {
    el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  });
}

test('A-1. 수익률 관리 팝업이 배경 클릭으로 닫힌다', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="rebalance"]').click();
  await page.locator('#openScenarioRateManagerBtn').click();
  const modal = page.locator('#scenarioRateManagerModal');
  await expect(modal).toBeVisible();
  await clickBackdrop(page, 'scenarioRateManagerModal');
  await expect(modal, '배경을 누르면 닫힌다').toBeHidden();
});

test('A-2. 수익률 관리 팝업은 내부를 눌러도 닫히지 않는다', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="rebalance"]').click();
  await page.locator('#openScenarioRateManagerBtn').click();
  const modal = page.locator('#scenarioRateManagerModal');
  await expect(modal).toBeVisible();
  // 팝업 내부의 첫 자식(내용 상자)을 누른다 - e.target이 팝업 자신이 아니므로 닫히면 안 된다.
  await page.locator('#scenarioRateManagerModal > *').first().click({ position: { x: 5, y: 5 }, force: true });
  await expect(modal, '내부 클릭으로는 닫히지 않는다').toBeVisible();
  // 기존 경로는 그대로 동작한다.
  await page.locator('#closeScenarioRateManagerModalBtn').click();
  await expect(modal).toBeHidden();
});

test('A-3. 수익률 관리 팝업의 [취소]와 뒤로가기도 그대로 동작한다', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="rebalance"]').click();
  const modal = page.locator('#scenarioRateManagerModal');
  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(modal).toBeVisible();
  await page.locator('#cancelScenarioRateManagerModalBtn').click();
  await expect(modal, '[취소]로 닫힌다').toBeHidden();
  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(modal).toBeVisible();
  await page.goBack();
  await expect(modal, '뒤로가기로 닫힌다').toBeHidden();
});

test('A-4. CMA 추천 팝업이 배경 클릭으로 닫히고, "봤다"는 기록을 남기지 않는다', async ({ page }) => {
  await open(page);
  /* [사실 기록 2026-09-26] 이 팝업을 여는 배지는 CMA_SOURCE_METADATA[anchor].recommended가 있을 때만
   * 나타나는데, 현재 세트(CMA-2026.2)에서는 7개 anchor 전부 recommended가 null이다 - 즉 지금은
   * 사용자 조작으로 열 수 없고, 다음 CMA 갱신이 들어오면 열린다. 그래서 여는 경로를 흉내내지 않고
   * (없는 추천 데이터를 만들면 그건 다른 것을 재는 테스트가 된다) 닫기 경로만 실제 DOM에서 확인한다.
   * 여는 조건 자체는 getPendingCmaFields가 이미 단위 테스트로 고정돼 있다. */
  const inert = await page.evaluate(() => Object.keys(CMA_SOURCE_METADATA)
    .every((a) => !CMA_SOURCE_METADATA[a] || !CMA_SOURCE_METADATA[a].recommended));
  expect(inert, '현재 세트에는 추천 배지 대상이 없다(이 사실이 바뀌면 여는 경로도 확인해야 한다)').toBe(true);

  const modal = page.locator('#cmaRecommendationModal');
  await page.evaluate(() => document.getElementById('cmaRecommendationModal').classList.remove('hidden'));
  await expect(modal).toBeVisible();
  await clickBackdrop(page, 'cmaRecommendationModal');
  await expect(modal, '배경을 누르면 닫힌다').toBeHidden();
  // [나중에]와 달리 seenVersion을 남기지 않는다 - 다음에 같은 추천이 다시 뜬다.
  const status = await page.evaluate(() => JSON.stringify(state.projection.cmaRecommendationStatus || {}));
  expect(status, '배경 클릭은 "봤다"를 기록하지 않는다').toBe('{}');
});

test('A-5. 뒤로가기 대상 팝업 전부가 배경 클릭으로 닫힌다(전수)', async ({ page }) => {
  await open(page);
  // 열고 배경을 눌러 닫는 것을 실제 DOM에서 전수 확인한다. 여는 경로가 제각각이라
  // "hidden 제거 + 배경 클릭 + 다시 hidden 확인"으로 닫기 경로만 본다(여는 경로는 다른 스펙이 본다).
  const result = await page.evaluate(() => {
    const out = [];
    SWIPE_MODAL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) { out.push([id, 'NO_ELEMENT']); return; }
      const wasHidden = el.classList.contains('hidden');
      el.classList.remove('hidden');
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const closed = el.classList.contains('hidden');
      if (!closed) el.classList.add('hidden');
      else if (!wasHidden) el.classList.remove('hidden');
      out.push([id, closed ? 'CLOSED' : 'STAYED_OPEN']);
    });
    return out;
  });
  const stayed = result.filter(([, r]) => r !== 'CLOSED');
  expect(stayed, '배경 클릭으로 닫히지 않는 팝업: ' + JSON.stringify(stayed)).toEqual([]);
});

test('A-6. ESC · 재열기도 전 팝업에서 그대로 동작한다', async ({ page }) => {
  await open(page);
  /* ESC는 SWIPE_MODAL_IDS · MODAL_CLOSE_FNS 레지스트리를 재사용하므로 원래부터 전 팝업 공통이었다
   * (js/03 keydown 핸들러) - ISSUE-A로 바뀐 것은 배경 클릭뿐이라는 사실을 함께 고정한다. */
  await page.locator('.tab-btn[data-tab="rebalance"]').click();
  const modal = page.locator('#scenarioRateManagerModal');
  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal, 'ESC로 닫힌다').toBeHidden();

  // 다시 열어도 정상이고(상태 누수 없음), 그 다음 배경 클릭도 여전히 동작한다.
  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(modal).toBeVisible();
  await clickBackdrop(page, 'scenarioRateManagerModal');
  await expect(modal).toBeHidden();
  await page.locator('#openScenarioRateManagerBtn').click();
  await expect(modal, '연속으로 열고 닫아도 정상이다').toBeVisible();
  await page.locator('#closeScenarioRateManagerModalBtn').click();
  await expect(modal).toBeHidden();

  // CMA 추천 팝업도 ESC 레지스트리에 들어 있다.
  await page.evaluate(() => document.getElementById('cmaRecommendationModal').classList.remove('hidden'));
  await page.keyboard.press('Escape');
  await expect(page.locator('#cmaRecommendationModal'), 'ESC로 닫힌다').toBeHidden();
});
