// E2E-33 Phase 28 - Dashboard Header Utility "항상 한 줄" 정책 회귀.
//
// [PM 확정 정책] Header Utility 4요소(환율 숫자 / Dark-Light / 동기화 / 설정)는 320px를 포함한
// 모든 지원 폭에서 반드시 한 줄을 유지한다. Phase 23-C의 "1200px 미만 2행" 설계는 이 정책으로
// 대체됐다 - 이 파일이 그 되돌림(2행 회귀)을 막는다.
//
// [한 줄 판정] top 좌표 일치로 보지 않는다. 환율 뱃지와 버튼은 높이가 달라 세로 중앙정렬되면
// top이 서로 다르면서도 같은 줄이다 - 세로 구간이 서로 겹치는지로 판정한다.
//
// [동시에 지켜야 하는 것] 한 줄을 만들기 위해 가독성/접근성을 희생하지 않았는지 함께 검사한다:
// 터치 타겟 44px, 텍스트 14px 하한, 가로 overflow 0, 클리핑 없음.
const { test, expect } = require('@playwright/test');

const TOUCH_MIN = 43.9; // devicePixelRatio 반올림 흡수(44px 기준을 낮춘 것이 아니다)
const FONT_MIN = 14;
const VIEWPORTS = [320, 375, 390, 412, 768, 1024, 1150, 1200, 1440];

const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));
const scrollWidthOf = (page) => page.locator('body').evaluate((el) => el.scrollWidth);

// 4요소의 위치/크기/클리핑을 한 번에 읽는다.
const headerMetrics = (page) => page.locator('header').evaluate((header) => {
  const win = header.ownerDocument.defaultView;
  const input = header.querySelector('#exchangeRateInput');
  const fx = input.closest('div.flex.items-center');
  const pick = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
      clipped: el.scrollWidth > el.clientWidth + 1,
      fontSize: parseFloat(win.getComputedStyle(el).fontSize) };
  };
  return {
    fx: pick(fx),
    input: pick(input),
    dark: pick(header.querySelector('#darkModeBtn')),
    sync: pick(header.querySelector('#syncSettingsBtn')),
    settings: pick(header.querySelector('#systemManagementBtn')),
    syncLabel: header.querySelector('#syncSettingsBtn').getAttribute('aria-label'),
    headerRight: header.getBoundingClientRect().right
  };
});

// 두 요소의 세로 구간이 겹치면 같은 줄이다.
const sameRow = (a, b) => a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const w of VIEWPORTS) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - Header Utility 4요소가 한 줄이고 44px/14px/무오버플로를 지킨다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await page.goto('/');
      await page.waitForFunction(() => typeof state !== 'undefined');
      if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
      expect(await isDark(page)).toBe(dark);
      await page.waitForTimeout(200);

      const m = await headerMetrics(page);

      // 1) 한 줄 - 환율 뱃지를 기준으로 나머지 셋이 모두 같은 줄에 있어야 한다.
      expect(sameRow(m.fx, m.dark), `${w}px 환율/다크모드 같은 줄`).toBe(true);
      expect(sameRow(m.fx, m.sync), `${w}px 환율/동기화 같은 줄`).toBe(true);
      expect(sameRow(m.fx, m.settings), `${w}px 환율/설정 같은 줄`).toBe(true);

      // 2) 좌에서 우로 순서대로 놓이고 서로 겹치지 않는다(줄바꿈 대신 겹쳐 숨는 것도 막는다).
      expect(m.fx.right, `${w}px 환율 -> 다크모드 순서`).toBeLessThanOrEqual(m.dark.left + 1);
      expect(m.dark.right, `${w}px 다크모드 -> 동기화 순서`).toBeLessThanOrEqual(m.sync.left + 1);
      expect(m.sync.right, `${w}px 동기화 -> 설정 순서`).toBeLessThanOrEqual(m.settings.left + 1);

      // 3) 설정 버튼이 화면 밖으로 밀려나지 않는다.
      expect(m.settings.right, `${w}px 설정 버튼이 뷰포트 안`).toBeLessThanOrEqual(w);

      // 4) 클리핑 없음 - 환율 숫자가 잘리면 안 된다.
      expect(m.fx.clipped, `${w}px 환율 뱃지 클리핑`).toBe(false);
      expect(m.input.clipped, `${w}px 환율 입력칸 클리핑`).toBe(false);

      // 5) 터치 타겟 44px - 환율 입력칸도 편집 가능한 대상이라 포함한다.
      for (const [name, el] of [['다크모드', m.dark], ['동기화', m.sync], ['설정', m.settings], ['환율뱃지', m.fx]]) {
        expect(el.h, `${w}px ${name} 높이 44px`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }
      for (const [name, el] of [['다크모드', m.dark], ['동기화', m.sync], ['설정', m.settings]]) {
        expect(el.w, `${w}px ${name} 너비 44px`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }

      // 6) 14px 하한 - 한 줄을 만들려고 글자를 줄이지 않았는지 확인한다.
      expect(m.input.fontSize, `${w}px 환율 입력 글자크기`).toBeGreaterThanOrEqual(FONT_MIN);

      // 7) 가로 overflow 0
      expect(await scrollWidthOf(page), `${w}px 가로 overflow`).toBeLessThanOrEqual(w);

      // 8) 동기화 상태가 색이 아니라 글자(aria-label)로도 전달된다.
      expect(m.syncLabel, `${w}px 동기화 aria-label`).toMatch(/서버 동기화(중|중지|오류)/);
    });
  }
}

test('동기화 상태 3종이 서로 다른 아이콘 모양으로 구분된다(색상 단독 전달 금지)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForFunction(() => typeof updateSyncStatusUI === 'function');
  const read = () => page.locator('#syncSettingsBtn').evaluate((el) => ({ icon: el.dataset.syncIcon, label: el.getAttribute('aria-label') }));

  await page.evaluate(() => { syncState.enabled = false; syncState.hasError = false; updateSyncStatusUI(); });
  const off = await read();
  await page.evaluate(() => { syncState.enabled = true; syncState.hasError = false; updateSyncStatusUI(); });
  const on = await read();
  await page.evaluate(() => { syncState.enabled = true; syncState.hasError = true; updateSyncStatusUI(); });
  const err = await read();

  expect(off.label).toBe('서버 동기화중지');
  expect(on.label).toBe('서버 동기화중');
  expect(err.label).toBe('서버 동기화오류');
  // 아이콘 이름이 3종 모두 달라야 한다 - 같으면 색으로만 구분되는 상태가 된다.
  expect(new Set([off.icon, on.icon, err.icon]).size).toBe(3);
});

test('Header에 "환율보기" 진입점이 복구되지 않았다(제거 상태 유지)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('#kpiExchangeRateDetailBtn')).toHaveCount(0);
  await expect(page.locator('header').getByText('환율보기')).toHaveCount(0);
  // 환율 "숫자"는 유지된다.
  await expect(page.locator('#exchangeRateInput')).toBeVisible();
});
