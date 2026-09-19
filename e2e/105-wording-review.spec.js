// E2E-105 [앱 전체 문구 점검] 화면에 실제로 그려지는 바뀐 문구 - 계산 · 정책 무변경.
//
// [핵심 계약]
//  1) 리스크 감지 목록이 비어도 "(포트폴리오 안정)"이라고 하지 않는다. 계산 전이면 계산 전이라고,
//     가격 기록이 부족한 종목이 있으면 판단하지 않았다고 말한다.
//  2) 저장 안내 · 시뮬레이션 횟수 · RISK 세부내용 제목이 새 문구로 보이고, 영문 라벨이 남지 않는다.
//  3) 375px · 1440px에서 14px 이상, 가로 넘침 없음.
/* global document */
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskSection === 'function' && typeof state !== 'undefined');
}

// 위험 진단 대상(주식) 2개를 메모리에만 넣고 목록을 다시 그린다. 저장은 하지 않는다.
async function renderEmptyRiskList(page, metrics) {
  return page.evaluate((metrics) => {
    state.assets = [
      { id: 'w1', name: '테스트주식A', ticker: 'AAA.KS', owner: '신랑', accountType: '일반계좌', category: '주식', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 100, currentPrice: 100 },
      { id: 'w2', name: '테스트주식B', ticker: 'BBB.KS', owner: '신랑', accountType: '일반계좌', category: '주식', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 100, currentPrice: 100 }
    ];
    state.advancedRiskMetrics = metrics;
    renderRiskSection();
    return document.getElementById('riskListContainer').innerText.replace(/\s+/g, ' ').trim();
  }, metrics);
}

test('1. 리스크 감지 목록이 비었을 때 - 계산 전 · 판단 불가 종목 · 모두 판단됨', async ({ page }) => {
  await boot(page);
  const before = await renderEmptyRiskList(page, null);
  expect(before).toContain('종목별 위험 신호를 아직 계산하지 않았습니다');
  expect(before).not.toContain('안정');

  const partial = await renderEmptyRiskList(page, {
    holdings: [{ ticker: 'AAA.KS', hasData: true }, { ticker: 'BBB.KS', hasData: false }]
  });
  expect(partial).toContain('해당하는 종목이 없습니다');
  expect(partial).toContain('가격 기록이 부족한 1개 종목은 판단하지 않았습니다');
  expect(partial).not.toContain('포트폴리오 안정');

  const full = await renderEmptyRiskList(page, {
    holdings: [{ ticker: 'AAA.KS', hasData: true }, { ticker: 'BBB.KS', hasData: true }]
  });
  expect(full).toContain('단기 과열 · 이동평균 하락 배열 · 52주 고점 대비 30% 이상 하락');
  expect(full).not.toContain('판단하지 않았습니다');
  expect(full).not.toContain('안정');
});

test('2. 저장 안내 · 시뮬레이션 횟수 · RISK 세부내용 제목이 새 문구로 보인다', async ({ page }) => {
  await boot(page);
  const html = await page.content();
  expect(html).toContain('가족 동기화를 켠 경우에만 암호화된 상태로 클라우드에도 보관됩니다');
  expect(html).not.toContain('외부로 전송되지 않습니다');
  const opts = await page.locator('#mcIterationsSelect option').allInnerTexts();
  expect(opts).toEqual(['5,000회(빠름)', '10,000회(보통)', '50,000회(정밀)']);
  expect(await page.locator('#mcIterationsSelect').inputValue()).toBe('10000');
  // 화면에 보이지 않는 HTML 주석(개발 메모)은 제외하고, 요소 안의 실제 문구(숨김 요소 포함)만 본다.
  const shown = await page.evaluate(() => document.body.textContent + ' ' + document.head.textContent);
  for (const w of ['Simulation 횟수', 'AI 최적', 'RISK 상세 분석', '상세 리스크 관리 이동', '복호화에 실패']) expect(shown, w).not.toContain(w);
});

for (const w of [375, 1440]) {
  test(`${w}px - 빈 리스크 목록 문구가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await boot(page);
    await page.locator('[data-tab="dashboard"]').click();
    await renderEmptyRiskList(page, { holdings: [{ ticker: 'AAA.KS', hasData: true }, { ticker: 'BBB.KS', hasData: false }] });
    await page.evaluate(() => { document.getElementById('riskyAccordionBtn').click(); });
    const p = page.locator('#riskListContainer p');
    const m = await p.evaluate((el) => ({ size: parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize), clipped: el.scrollWidth - el.clientWidth }));
    expect(m.size).toBeGreaterThanOrEqual(14);
    expect(m.clipped).toBeLessThanOrEqual(1);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}
