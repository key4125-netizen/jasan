/* global window, document, getComputedStyle, Node */
// E2E-96 [v250] Monte Carlo 화면 정리(UI · 문구 · 위치만 - 계산 무변경, checklist §38) - 화면에서 확인하는 것:
//   A. 소유자 버튼 순서 가구 전체 | 신랑 | 와이프 (기본 가구 전체, data-scope 그대로)
//   B. 계좌 범위 버튼 순서 통합 | 일반계좌 | 절세계좌 (절세계좌가 있으면 기본 통합 - MCD-2 그대로)
//   C. 결과 순서: 참고금액 카드 → 목표 도달 가능성 → 분포표 → 한 줄 안내 → 장기 가정 출처 → ※ 문구.
//      범위 막대 · 카드 장문 해설 · 표 장문 해설 · 목표 부연 설명 · "보조 정보" 라벨 · 상세 토글 ·
//      [PM 수정 지시] 목표 아래 기술 정보 블록(월 적립금 · 총 납입원금 · 목표비중 기준 안내 · 인플레이션율 · 가중평균 보수)이 없다.
//   D. "주의사항 및 계산 방법"은 맨 위 ⓘ 팝업에서 보인다(실행 전에는 기존 설명만).
//   E. 375 / 1440 × Light / Dark - 버튼 한 줄 · 14px 이상 · 가로 넘침 없음 · 목표 박스가 참고금액 바로 아래.
const { test, expect } = require('@playwright/test');
const { goToProjectionTab } = require('./fixtures');

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'KODEX 200', ticker: '069500', category: 'ETF', owner: '신랑', accountType: '일반계좌', quantity: 1000, buyPrice: 40000, currentPrice: 40000 }),
      makeAsset({ name: '국고채A', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 20000000, currentPrice: 20000000 }),
      makeAsset({ name: 'KODEX 200', ticker: '069500', category: 'ETF', owner: '신랑', accountType: 'ISA', quantity: 300, buyPrice: 40000, currentPrice: 40000 })
    ];
    REBALANCE_OWNERS.forEach((o) => { state.rebalance[o].domestic = { '국내': 100, '해외': 0 }; state.rebalance[o].targets = { '국내': [], '해외': [] }; });
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 70 },
      { type: 'namedHolding', name: '국고채A', pct: 30 }
    ];
    persistAssets(); persistRebalance(); persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}
async function run(page, goal) {
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  if (goal) await page.locator('#mcGoalAmountInput').fill(String(goal));
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 30000 });
}
const labelsOf = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), scope: e.dataset.scope, pressed: e.getAttribute('aria-pressed') })));

test('A. 소유자 버튼 순서는 가구 전체 | 신랑 | 와이프이고, 기본 가구 전체 · 전환이 그대로 동작한다', async ({ page }) => {
  await seed(page);
  await goToProjectionTab(page);
  const owners = await labelsOf(page, '#mcOwnerScopeSegmented .mc-owner-scope-btn');
  expect(owners.map((o) => o.text)).toEqual(['가구 전체', '신랑', '와이프']);
  expect(owners.map((o) => o.scope)).toEqual(['household', '신랑', '와이프']);
  expect(owners.map((o) => o.pressed)).toEqual(['true', 'false', 'false']);
  expect(await page.evaluate(() => mcOwnerScope)).toBeNull();
  await page.locator('#mcOwnerScopeSegmented [data-scope="신랑"]').click();
  expect(await page.evaluate(() => mcOwnerScope)).toBe('신랑');
  await page.locator('#mcOwnerScopeSegmented [data-scope="와이프"]').click();
  expect((await labelsOf(page, '#mcOwnerScopeSegmented .mc-owner-scope-btn')).map((o) => o.pressed)).toEqual(['false', 'false', 'true']);
  await page.locator('#mcOwnerScopeSegmented [data-scope="household"]').click();
  expect(await page.evaluate(() => mcOwnerScope)).toBeNull();
});

test('B. 계좌 범위 버튼 순서는 통합 | 일반계좌 | 절세계좌이고, 절세계좌가 있으면 통합이 기본 선택이다', async ({ page }) => {
  await seed(page);
  await run(page);
  const scopes = await labelsOf(page, '#mcScopeSegmented .mc-scope-btn');
  expect(scopes.map((s) => s.text)).toEqual(['통합', '일반계좌', '절세계좌']);
  expect(scopes.map((s) => s.scope)).toEqual(['combined', 'general', 'taxAdvantaged']);
  expect(scopes.map((s) => s.pressed)).toEqual(['true', 'false', 'false']);
  await page.locator('#mcScopeSegmented [data-scope="taxAdvantaged"]').click();
  await expect(page.locator('#mcP50ScopeNote')).toContainText('절세계좌');
  // 표시 값은 엔진 결과의 그 범위 값 그대로다.
  const expected = await page.evaluate(() => fmtKRWShort(mcLastRender.withReal.accountScopes.taxAdvantaged[3].p50));
  await expect(page.locator('#mcP50Text')).toHaveText(expected);
});

test('C. 결과 순서 · 지정 문구 · 삭제된 요소', async ({ page }) => {
  await seed(page);
  await run(page, 300000000);
  // 참고금액 라벨(PM 지정 문장)
  await expect(page.locator('#mcP25Label')).toHaveText('시뮬레이션 결과 20년 기준 보수적으로 볼 때의 참고금액');
  // DOM 순서: 참고금액 카드 → 목표 박스 → 분포표 → 한 줄 안내 → 장기 가정 출처 → ※ 문구
  const order = await page.evaluate(() => {
    const ids = ['mcP25Text', 'mcGoalBox', 'mcMilestoneTableBody', 'mcCmaSourceArea'];
    const els = ids.map((id) => document.getElementById(id));
    const ps = [...document.querySelectorAll('#mcResultArea p')];
    const note = ps.find((p) => p.textContent.trim() === '각 칸의 아래쪽 회색 숫자는 현재가치 기준 금액');
    const star = ps.find((p) => p.textContent.trim().startsWith('※ 일반계좌는'));
    const seq = [els[0], els[1], els[2], note, els[3], star];
    return { found: seq.every(Boolean), ordered: seq.every((el, i) => i === 0 || (seq[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) };
  });
  expect(order).toEqual({ found: true, ordered: true });
  // 목표 박스 = 참고금액 카드 바로 다음 형제
  expect(await page.evaluate(() => document.getElementById('mcP25Text').closest('.text-center').nextElementSibling.id)).toBe('mcGoalBox');
  const goal = await page.locator('#mcGoalBox').innerText();
  expect(goal).toContain('목표금액');
  expect(goal).toContain('목표에 도달할 가능성');
  expect(goal).not.toContain('보조 정보');
  expect(goal).not.toContain('현재 설정을 기준으로 한 시뮬레이션 결과예요');
  // 표 명칭
  const header = await page.locator('table:has(#mcMilestoneTableBody) thead').innerText();
  ['초약세', 'P10', '약세', 'P25', '보통', 'P50', '강세', 'P75'].forEach((w) => expect(header).toContain(w));
  // 삭제된 요소 · 문구
  for (const sel of ['#mcRangeBarsToggleBtn', '#mcRangeBarsBody', '#mcRangeBarsArea', '#mcRangeBarsRealArea', '#mcSafetyDetailToggleBtn', '#mcSafetyDetailBody', '#mcCmaDetailToggleBtn', '#mcCmaDetailBody']) {
    await expect(page.locator(sel)).toHaveCount(0);
  }
  const text = await page.locator('#mcResultArea').innerText();
  ['선택한 기간의 범위를 막대로 보기', '주의사항 및 계산 방법 자세히 보기', '결과를 작은 금액부터 줄 세웠을 때', '시뮬레이션 결과를 작은 금액부터 줄 세웠을 때', '보조 정보'].forEach((w) => expect(text).not.toContain(w));
  // [PM 수정 지시] 목표 아래 기술 정보 블록 삭제 - 요소 · 문구가 다른 곳으로 옮겨지지도 않았다.
  for (const sel of ['#mcContributionScheduleArea', '#mcInflationNote', '#mcWeightedFeeNote']) await expect(page.locator(sel)).toHaveCount(0);
  const goalBoxNext = await page.evaluate(() => document.getElementById('mcGoalBox').nextElementSibling.id);
  expect(goalBoxNext).toBe('mcSafetyCritical');
  // ("일반계좌 월 적립금 중 …% 미선택"은 결과 영역에 남는 주요 주의사항(PMD-03) 문장이라 여기서 검사하지 않는다)
  ['총 납입원금', '적립금은 가구 전체 목표비중을 기준으로', '인플레이션율:', '예상 연간 운용보수', '가중평균'].forEach((w) => expect(text).not.toContain(w));
  // 남아야 하는 것: 핵심 금액 · 현재가치(물가상승률 표시 포함) · 주요 주의사항 컨테이너
  await expect(page.locator('#mcP50RealText')).not.toHaveText('-');
  await expect(page.locator('#mcP50RealLabel')).toContainText('물가상승률');
  await expect(page.locator('#mcP25RealText')).toContainText('현재가치 기준');
  await expect(page.locator('#mcSafetyCritical')).toHaveCount(1);
  // 장기 가정 출처는 기본 접힘
  await expect(page.locator('#mcCmaSourceBody')).toHaveAttribute('style', /max-height:\s*0px/);
});

test('D. 주의사항 및 계산 방법은 맨 위 ⓘ 팝업에서 보인다 - 실행 전에는 기존 설명만', async ({ page }) => {
  await seed(page);
  await goToProjectionTab(page);
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModalBody')).toContainText('공식 모델: Monthly Precision Monte Carlo');
  await expect(page.locator('#mcInfoModalBody')).not.toContainText('주의사항 및 계산 방법');
  await page.locator('#closeMcInfoModalBtn').click();
  await run(page, 300000000);
  await page.locator('#mcIntroInfoBtn').click();
  const body = page.locator('#mcInfoModalBody');
  await expect(body).toContainText('Monte Carlo는 자산군별 장기 변동성');
  await expect(body).toContainText('주의사항 및 계산 방법');
  for (const title of ['기준 연간 성장률의 의미', '목표 달성 확률의 의미', '변동성·상관관계 데이터 기간 안내', '이 시뮬레이션의 범위 안내']) {
    await expect(body).toContainText(title);
  }
  await page.locator('#closeMcInfoModalBtn').click();
  // 옮겨 온 그룹 카드(같은 원인 2개 이상)의 접기/펼치기가 팝업 안에서 동작한다 - 이번 시드에는 그룹이 없어,
  // 같은 렌더 함수에 합성 경고 2개를 넣어 보관 영역을 채운 뒤 팝업을 다시 연다(판정 로직과 무관한 표시 검증).
  await page.evaluate(() => {
    const a = makeIssue('SAFETY_E2E96_GROUP', SAFETY_LEVEL.WARNING, 'E2E자산A', 'E2E 그룹 확인', '메시지 A', '권고');
    const b = makeIssue('SAFETY_E2E96_GROUP', SAFETY_LEVEL.WARNING, 'E2E자산B', 'E2E 그룹 확인', '메시지 B', '권고');
    renderMonteCarloSafetyTiers(null, null, mcSafetyDetailStore, [a, b]);
  });
  await page.locator('#mcIntroInfoBtn').click();
  await expect(body).toContainText('E2E 그룹 확인 - 자산 2개');
  const toggle = body.locator('.safety-group-toggle').first();
  const key = await toggle.getAttribute('data-safety-group-key');
  const groupBody = body.locator(`.safety-group-body[data-safety-group-body="${key}"]`);
  const before = await groupBody.evaluate((el) => el.style.maxHeight);
  await toggle.click();
  await expect.poll(() => groupBody.evaluate((el) => el.style.maxHeight)).not.toBe(before);
  await page.locator('#closeMcInfoModalBtn').click();
});

for (const [w, h] of [[375, 812], [1440, 900]]) {
  for (const dark of [false, true]) {
    test(`E. ${w}px ${dark ? 'Dark' : 'Light'} - 버튼 한 줄 · 14px 이상 · 넘침 없음 · 목표 박스 위치`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await seed(page);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await run(page, 300000000);
      await page.locator('#mcCmaSourceToggleBtn').click();
      const m = await page.evaluate(() => {
        const tops = (sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().top));
        const heights = (sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().height));
        const root = document.getElementById('mcResultArea');
        const tiny = [...root.querySelectorAll('*')].filter((el) => !el.children.length && el.textContent.trim() && el.getClientRects().length
          && getComputedStyle(el).visibility !== 'hidden' && parseFloat(getComputedStyle(el).fontSize) < 14).map((el) => el.textContent.trim().slice(0, 20));
        const card = document.getElementById('mcP25Text').closest('.text-center').getBoundingClientRect();
        const goal = document.getElementById('mcGoalBox').getBoundingClientRect();
        const table = document.getElementById('mcMilestoneTableBody').getBoundingClientRect();
        return {
          ownerTops: tops('#mcOwnerScopeSegmented button'), scopeTops: tops('#mcScopeSegmented button'),
          ownerH: heights('#mcOwnerScopeSegmented button'), scopeH: heights('#mcScopeSegmented button'),
          tiny, scrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
          goalAfterCard: goal.top >= card.bottom - 1 && goal.top - card.bottom < 24, goalBeforeTable: goal.bottom <= table.top,
          grayRows: [...document.querySelectorAll('#mcMilestoneTableBody tr')].every((tr) => tr.querySelectorAll('td span.text-slate-400').length === 4)
        };
      });
      expect(new Set(m.ownerTops).size).toBe(1);
      expect(new Set(m.scopeTops).size).toBe(1);
      [...m.ownerH, ...m.scopeH].forEach((x) => expect(x).toBeGreaterThanOrEqual(44));
      expect(m.tiny).toEqual([]);
      expect(m.scrollW).toBeLessThanOrEqual(m.vw);
      expect(m.goalAfterCard).toBe(true);
      expect(m.goalBeforeTable).toBe(true);
      expect(m.grayRows).toBe(true);
    });
  }
}
