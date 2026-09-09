// [FUTURE-P1] Monte Carlo 계좌 범위(일반/절세/통합)가 실제 브라우저에서 화면까지 연결되는지 확인한다
// - 어댑터(js/16) → Worker(js/17) → Controller(js/18) → UI(js/19) 전 구간.
//
// 역할 분담: 계산의 정확성(경로 단위 합산, buy-and-hold, 납입 타이밍 등)은 단위 테스트가 고정한다
// (test/mc-account-scope.test.js, test/mc-adapter-account-scope.test.js). 이 파일은 계산을 다시
// 구현하지 않고 "그 결과가 화면까지 도달하고, 선택에 따라 올바르게 연결되는가"만 본다.
//
// 네트워크 독립: 목표/자산을 전부 채권(namedHolding, σ=0)으로 두어 가격 이력 조회가 필요 없다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

const TARGET = [{ owner: '신랑', region: '국내', name: 'E73국내채권', pct: 100 }];

async function runMonteCarlo(page) {
  await goToProjectionTab(page);
  await expect(page.locator('#projectionSafetyBlockBanner')).toBeHidden();
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
}

// 절세계좌 자산을 심고 다시 부팅한다(계산은 전부 앱의 실제 코드가 수행한다).
async function seedWithTaxAccount(page, { name, accountType, amount }) {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  // [주의] locator.evaluate(fn, arg)의 첫 인자는 엘리먼트다 - 두 번째 인자로 값을 받아야 한다.
  await page.locator('body').evaluate((el, { name, accountType, amount }) => {
    state.assets.push(makeAsset({
      name, category: '채권', owner: '신랑', accountType,
      quantity: 1, buyPrice: amount, currentPrice: amount,
    }));
    persistAssets();
  }, { name, accountType, amount });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
}

const scopeBtn = (page, scope) => page.locator(`#mcScopeSegmented [data-scope="${scope}"]`);
const milestoneBtn = (page, idx) => page.locator(`#mcMilestoneSegmented [data-milestone-idx="${idx}"]`);

test('A. 절세계좌 자산이 없으면 계좌 범위 선택이 아예 나타나지 않는다(기존 화면 그대로)', async ({ page }) => {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeHidden();
  // 결과 자체는 기존과 동일하게 나온다(범위 표기 없이 기간만).
  await expect(page.locator('#mcP50Text')).not.toHaveText('-');
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('20년 후');
});

test('B. 절세계좌 자산이 있으면 일반계좌/절세계좌/통합 세 범위를 고를 수 있다', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73연금채권', accountType: '연금저축', amount: 30000000 });
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeVisible();
  await expect(scopeBtn(page, 'general')).toBeVisible();
  await expect(scopeBtn(page, 'taxAdvantaged')).toBeVisible();
  await expect(scopeBtn(page, 'combined')).toBeVisible();
  // 기본 선택은 일반계좌 - 절세계좌가 생겼다고 해서 기본 화면의 기준이 바뀌지 않는다.
  await expect(scopeBtn(page, 'general')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('일반계좌 · 20년 후');
});

test('C. 범위를 바꾸면 중앙값·표·설명이 그 범위의 계산 결과로 함께 바뀐다', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73ISA채권', accountType: 'ISA', amount: 30000000 });
  await runMonteCarlo(page);

  const generalP50 = await page.locator('#mcP50Text').innerText();
  const generalRow = await page.locator('#mcMilestoneTableBody tr').last().innerText();

  await scopeBtn(page, 'taxAdvantaged').click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('절세계좌 · 20년 후');
  await expect(scopeBtn(page, 'taxAdvantaged')).toHaveAttribute('aria-pressed', 'true');
  const taxP50 = await page.locator('#mcP50Text').innerText();
  const taxRow = await page.locator('#mcMilestoneTableBody tr').last().innerText();
  // 일반계좌 1억 vs 절세계좌 3천만원이라 값이 반드시 달라야 한다(같으면 범위가 연결되지 않은 것이다).
  expect(taxP50).not.toBe(generalP50);
  expect(taxRow).not.toBe(generalRow);
  // 범위마다 성격 설명이 함께 바뀐다(매수 후 보유 = buy-and-hold 정책).
  await expect(page.locator('#mcScopeDesc')).toContainText('그대로 두고');

  await scopeBtn(page, 'combined').click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('통합 · 20년 후');
  const combinedP50 = await page.locator('#mcP50Text').innerText();
  expect(combinedP50).not.toBe(generalP50);
  expect(combinedP50).not.toBe(taxP50);
  // 통합은 "각 범위의 중앙값을 그냥 더한 값"이 아니라는 성격을 화면에서 밝힌다.
  await expect(page.locator('#mcScopeDesc')).toContainText('그냥 더한 값');

  // 표의 마지막 행 "중간 수준" 칸은 언제나 위 큰 숫자와 같은 값이어야 한다(같은 범위·같은 기간).
  const combinedRow = await page.locator('#mcMilestoneTableBody tr').last().innerText();
  expect(combinedRow).toContain(combinedP50);
});

test('D. 기간을 바꾸면 중앙값과 범위 막대가 그 기간 기준으로 바뀐다', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73IRP채권', accountType: 'IRP', amount: 50000000 });
  await runMonteCarlo(page);

  const at20 = await page.locator('#mcP50Text').innerText();
  await milestoneBtn(page, 0).click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('일반계좌 · 5년 후');
  const at5 = await page.locator('#mcP50Text').innerText();
  expect(at5).not.toBe(at20);
  await expect(milestoneBtn(page, 0)).toHaveAttribute('aria-pressed', 'true');

  // 막대는 기본 접힘 - 펼치면 선택한 기간의 라벨이 따라와야 한다.
  await expect(page.locator('#mcRangeBarsBody')).toHaveCSS('max-height', '0px');
  await page.locator('#mcRangeBarsToggleBtn').click();
  await expect(page.locator('#mcRangeBarsNominalLabel')).toHaveText('명목가치 범위(5년 후 기준)');
  await expect(page.locator('#mcRangeBarsRealLabel')).toHaveText('현재가치 기준 범위(5년 후 기준)');
});

test('E. P10~P90이 title 속성이 아니라 실제 화면 텍스트로 보인다(터치 기기 대응)', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73연금채권2', accountType: '연금저축', amount: 20000000 });
  await runMonteCarlo(page);
  const headerText = await page.locator('table:has(#mcMilestoneTableBody) thead').innerText();
  ['P10', 'P25', 'P50', 'P75', 'P90'].forEach((code) => expect(headerText).toContain(code));
  ['낮은 편', '약간 낮음', '중간 수준', '약간 높음', '높은 편'].forEach((word) => expect(headerText).toContain(word));

  // 막대 라벨도 표와 같은 어휘 + 같은 코드를 쓴다(같은 값이 다른 지표처럼 보이지 않도록).
  await page.locator('#mcRangeBarsToggleBtn').click();
  const barsText = await page.locator('#mcRangeBarsArea').innerText();
  ['P10', 'P25', 'P50', 'P75', 'P90'].forEach((code) => expect(barsText).toContain(code));
  expect(barsText).toContain('낮은 편');
  expect(barsText).toContain('중간 수준');
});

test('F. 계좌 범위 영역은 선택만 담당하고 금액을 중복 표시하지 않는다', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73ISA채권2', accountType: 'ISA', amount: 40000000 });
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeVisible();
  const scopeText = await page.locator('#mcAccountScopeArea').innerText();
  // 예전(Phase 2-C)엔 여기서 세 범위의 중앙값을 나열해 바로 아래 P50 카드와 같은 숫자가 두 번 나왔다.
  expect(scopeText).not.toMatch(/[0-9]+(\.[0-9]+)?\s*(억|만원)/);
  // 금액은 결과 영역에서 딱 한 곳(P50 카드)에만 크게 나온다.
  const p50 = await page.locator('#mcP50Text').innerText();
  expect(p50).not.toMatch(/^-$/);
});

test('G. 목표 도달 가능성이 선택한 계좌 범위와 함께 표시된다(핵심 금액과 구분된 보조 정보)', async ({ page }) => {
  await seedWithTaxAccount(page, { name: 'E73연금채권3', accountType: '연금저축', amount: 30000000 });
  await goToProjectionTab(page);
  await page.locator('#mcGoalAmountInput').fill('100000000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  await expect(page.locator('#mcGoalArea')).toContainText('일반계좌 기준');
  await scopeBtn(page, 'combined').click();
  await expect(page.locator('#mcGoalArea')).toContainText('통합 기준');
  const goalText = await page.locator('#mcGoalArea').innerText();
  expect(goalText).not.toMatch(/NaN|undefined|Infinity/);
  expect(goalText).toContain('목표에 도달할 가능성');
  // percentile(위치)과 목표 도달 가능성(비율)을 다른 개념으로 설명해야 한다.
  expect(goalText).toContain('경로가 전체 중 몇 %');
});

test('H. 실행 전에는 결과 대신 초보자 안내가 보이고, 실행 후에는 안내가 사라진다', async ({ page }) => {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  await goToProjectionTab(page);
  await expect(page.locator('#mcEmptyState')).toBeVisible();
  await expect(page.locator('#mcEmptyState')).toContainText('Monte Carlo 실행');
  await expect(page.locator('#mcResultArea')).toBeHidden();

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#mcEmptyState')).toBeHidden();
});
