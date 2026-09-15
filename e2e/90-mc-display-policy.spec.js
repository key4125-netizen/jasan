// E2E-90 Monte Carlo 결과 표시 정책(PM 일괄 구현 지시 ①~⑤, checklist §31).
//
// 이 파일이 고정하는 것(계산은 한 줄도 바뀌지 않았다 - 표시·입력 경로만):
//   ① 운용보수 팝업이 MC가 실제로 쓰는 절세계좌 항목까지 나열한다(일반만/절세만/양쪽/명시 0/미설정).
//   ② 절세계좌 결과가 있으면 기본 계좌 범위는 통합, 없으면 일반계좌. 사용자 전환은 그대로.
//   ③ P50 + P25를 핵심 결과로 보여 주고, 목표 도달 가능성은 하나만 둔다(백분위별 확률 없음).
//   ④ P90은 결과 데이터에는 남고 화면에서만 빠진다.
//   ⑤ 일반계좌 기준인 표시(가중평균 보수·적립금 안내·결과 범위 판정)는 그 사실을 문구에 밝힌다.
//   + 375/768/1024 Light·Dark와 Desktop에서 14px 하한·가로 넘침·잘림·44px 터치 타겟.
//
// 네트워크 독립: 목표/자산은 채권(σ=0)이거나, 티커가 필요하면 seedPriceHistory로 합성 시계열을 넣는다.
// [ESLint 규약] page.evaluate 안에서 raw 브라우저 전역을 쓰지 않고 locator.evaluate로 요소를 받는다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab, seedPriceHistory } = require('./fixtures');

const TARGET = [{ owner: '신랑', region: '국내', name: 'E90국내채권', pct: 100 }];
const scopeBtn = (page, scope) => page.locator(`#mcScopeSegmented [data-scope="${scope}"]`);
const milestoneBtn = (page, idx) => page.locator(`#mcMilestoneSegmented [data-milestone-idx="${idx}"]`);

async function runMonteCarlo(page) {
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
}

async function seedWithTaxBond(page) {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  await page.locator('body').evaluate(() => {
    state.assets.push(makeAsset({ name: 'E90ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', quantity: 1, buyPrice: 30000000, currentPrice: 30000000 }));
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await goToProjectionTab(page);
}

/* ── ① 운용보수 입력 경로 ─────────────────────────────────────────────── */

// 일반계좌 전용(E90일반채권) · 절세 전용 보유(E90ISA채권) · 양쪽(QQQM) · 절세 적립 배분(379800) ·
// 절세 미배분 잔여분(주식형자산/채권 카테고리 키)을 한 번에 만든다. QQQM에는 기존 사용자 값 0.15%를 둔다.
async function seedFeeScenario(page) {
  await seedPortfolio(page, { targets: [{ owner: '신랑', region: '국내', name: 'E90일반채권', pct: 50 }], assetValueEach: 100000000 });
  await page.locator('body').evaluate(() => {
    state.rebalance['신랑'].domestic = { '국내': 50, '해외': 50 };
    state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: 'E90일반채권', pct: 100, role: '수비수' }];
    state.rebalance['신랑'].targets['해외'] = [{ type: 'ticker', ticker: 'QQQM', label: 'NASDAQ 100', pct: 100, role: '공격수' }];
    state.assets.push(
      makeAsset({ name: 'E90ISA채권', category: '채권', owner: '신랑', accountType: 'ISA', quantity: 1, buyPrice: 30000000, currentPrice: 30000000 }),
      makeAsset({ name: 'NASDAQ 100', ticker: 'QQQM', category: 'ETF', owner: '신랑', accountType: 'ISA', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 200, currentPrice: 200 })
    );
    state.projection.taxAdvantagedPlan.contributionByOwnerAccount = { '신랑': [{ accountType: 'ISA', amount: 1000000, years: 20, frequency: 'monthly' }], '와이프': [] };
    state.projection.taxAdvantagedPlan.allocationByOwner = { '신랑': [{ accountType: 'ISA', ticker: '379800', label: 'KODEX 미국S&P500', pct: 50 }], '와이프': [] };
    state.projection.customFeeRates = { QQQM: 0.15 };
    persistAssets(); persistRebalance(); persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await seedPriceHistory(page, ['QQQM', '379800.KS']);
  await goToProjectionTab(page);
}

const readFeeRows = (page) => page.locator('#mcFeeRatesList [data-fee-row]').evaluateAll((rows) => rows.map((r) => ({
  key: r.dataset.feeRow,
  accounts: r.querySelector('[data-fee-accounts]').textContent.trim(),
  status: r.querySelector('[data-fee-status]').textContent.trim(),
  inputs: r.querySelectorAll('input[data-fee-key]').length,
})));

test('F-1. 운용보수 팝업이 일반계좌 전용 · 절세계좌 전용 · 양쪽 종목을 모두 한 행씩 나열한다', async ({ page }) => {
  await seedFeeScenario(page);
  await page.locator('#mcFeeRatesToggleBtn').click();
  await expect(page.locator('#mcFeeRatesModal')).toBeVisible();
  const rows = await readFeeRows(page);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

  // 같은 키는 한 행(입력칸 하나)뿐이다.
  expect(rows.length).toBe(new Set(rows.map((r) => r.key)).size);
  rows.forEach((r) => expect(r.inputs).toBe(1));

  expect(byKey['NAME:E90일반채권'].accounts).toBe('일반계좌');                 // 1) 일반계좌 전용
  expect(byKey['NAME:E90ISA채권'].accounts).toBe('절세계좌');                  // 2) 절세계좌 전용 보유
  expect(byKey.QQQM.accounts).toBe('일반계좌 · 절세계좌');                     // 3) 양쪽 - 한 행
  expect(byKey['379800.KS'].accounts).toBe('절세계좌');                        //    절세 적립 배분 종목
  expect(byKey['주식형자산'].accounts).toBe('절세계좌');                       //    절세 미배분 잔여분(주식)
  expect(byKey['채권'].accounts).toBe('절세계좌');                             //    절세 미배분 잔여분(채권)
  // 기존 사용자 값은 그대로 보인다(덮어쓰지 않음), 나머지는 미확인.
  expect(byKey.QQQM.status).toBe('0.15%');
  expect(byKey['NAME:E90ISA채권'].status).toBe('미확인');
  await page.locator('#cancelMcFeeRatesModalBtn').click();
  await expect(page.locator('#mcFeeSummary')).toHaveText(`미확인 ${rows.length - 1}개`);
});

test('F-2. 절세계좌 전용 종목에 명시 0%를 넣으면 실제 MC 입력에서 그 종목만 "확인됨"이 되고 나머지는 미확인으로 남는다', async ({ page }) => {
  await seedFeeScenario(page);
  await page.locator('#mcFeeRatesToggleBtn').click();
  const taxRow = page.locator('#mcFeeRatesList [data-fee-row="NAME:E90ISA채권"]');
  await taxRow.locator('input[data-fee-key]').fill('0');
  await expect(taxRow.locator('[data-fee-status]')).toHaveText('0%'); // 4) 명시적 0 ≠ 미확인
  await page.locator('#saveMcFeeRatesModalBtn').click();
  await expect(page.locator('#mcFeeRatesModal')).toBeHidden();

  const saved = await page.evaluate(() => JSON.parse(JSON.stringify(state.projection.customFeeRates)));
  expect(saved).toEqual({ QQQM: 0.15, 'NAME:E90ISA채권': 0 }); // 기존 값 보존 · 미설정 키는 만들지 않음(5)

  // 팝업의 키가 어댑터(js/16)가 절세계좌 instrument에 쓰는 키와 같은지 - 실제 MC 입력으로 확인한다.
  const input = await page.evaluate(async () => {
    const r = await buildMonteCarloInputFromState({ presetKey: 'normal', includeTaxAdvantaged: true, years: 20 });
    return {
      errors: r.errors,
      fees: Object.fromEntries(r.instruments.map((i) => [i.key, i.feeRateAnnual])),
      unknownLabels: r.safety.issues.filter((i) => i.code === 'SAFETY_FEE_UNKNOWN').map((i) => i.message),
      hasTaxScope: !!r.taxScope,
    };
  });
  expect(input.errors).toEqual([]);
  expect(input.hasTaxScope).toBe(true);
  expect(input.fees['N:국내:E90ISA채권']).toBe(0);
  expect(input.fees['T:QQQM']).toBeCloseTo(0.0015, 10);
  expect(input.unknownLabels.some((m) => m.includes('E90ISA채권'))).toBe(false);
  expect(input.unknownLabels.some((m) => m.includes('KODEX 미국S&P500'))).toBe(true);
});

/* ── ② 기본 계좌 범위 ─────────────────────────────────────────────────── */

test('S-1. 절세계좌가 있으면 실행 후 통합이 기본 선택되고, 표시값은 엔진의 combined 분포 그대로다', async ({ page }) => {
  await seedWithTaxBond(page);
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeVisible();
  await expect(scopeBtn(page, 'combined')).toHaveAttribute('aria-pressed', 'true');
  await expect(scopeBtn(page, 'general')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('통합 · 20년 후');
  await expect(page.locator('#mcScopeDesc')).toContainText('그냥 더한 값');

  const expected = await page.evaluate(() => {
    const s = mcLastRender.withReal.accountScopes;
    const last = (a) => a[a.length - 1];
    return { p50: fmtKRWShort(last(s.combined).p50), p25: fmtKRWShort(last(s.combined).p25), general: fmtKRWShort(last(s.general).p50) };
  });
  await expect(page.locator('#mcP50Text')).toHaveText(expected.p50);
  await expect(page.locator('#mcP25Text')).toHaveText(expected.p25);

  // 사용자가 직접 전환할 수 있다.
  await scopeBtn(page, 'general').click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('일반계좌 · 20년 후');
  await expect(page.locator('#mcP50Text')).toHaveText(expected.general);
  await scopeBtn(page, 'taxAdvantaged').click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('절세계좌 · 20년 후');

  // 기간을 바꿔도 범위는 유지되고, 다시 실행하면 기본(통합)으로 돌아간다.
  await milestoneBtn(page, 1).click();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('절세계좌 · 10년 후');
  await runMonteCarlo(page);
  await expect(scopeBtn(page, 'combined')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('통합 · 20년 후');
});

test('S-2. 절세계좌가 없으면 일반계좌가 기본이고 범위 선택은 나타나지 않는다(기존 화면 그대로)', async ({ page }) => {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  await goToProjectionTab(page);
  await runMonteCarlo(page);
  await expect(page.locator('#mcAccountScopeArea')).toBeHidden();
  expect(await page.evaluate(() => mcSelectedScope)).toBe('general');
  expect(await page.evaluate(() => mcLastRender.withReal.accountScopes)).toBeFalsy();
  await expect(page.locator('#mcP50ScopeNote')).toHaveText('20년 후');
  await expect(page.locator('#mcP25Text')).not.toHaveText('-');
});

/* ── ③ P25/P50 · ④ P90 · ⑤ 문구 - 값이 서로 다른 합성 결과를 실제 렌더러에 통과시킨다 ─── */

const renderSyntheticMcResult = (page) => page.locator('body').evaluate((el) => {
  const win = el.ownerDocument.defaultView;
  const ms = (base) => [5, 10, 15, 20].map((y, i) => ({
    year: y, mean: base * (1 + i), p10: base * 0.6 * (1 + i), p25: base * 0.8 * (1 + i),
    p50: base * (1 + i), p75: base * 1.3 * (1 + i), p90: base * 1.8 * (1 + i),
    goalProbability: { 1000000000: 0.423 },
  }));
  win.renderMonteCarloResult(
    {
      mode: 'official', simulations: 10000, years: 20, assets: 3,
      milestones: ms(3e8),
      accountScopes: { general: ms(3e8), taxAdvantaged: ms(9e7), combined: ms(3.9e8) },
      safety: { status: 'OK', issues: [], dataQuality: { issues: [] }, modelRisk: { issues: [] } },
      diagnostics: {},
    },
    2.5,
    { rawAmount: 1000000000, mode: 'nominal', nominalGoalAmount: 1000000000, targetYears: 20 },
    { initialMonthly: 3000000, growthRatePct: 0, years: 20, streams: [{ monthly: 3000000, years: null }], ownerScope: null },
    0.15
  );
});

async function openSynthetic(page) {
  await seedPortfolio(page, { targets: TARGET, assetValueEach: 100000000 });
  await goToProjectionTab(page);
  await renderSyntheticMcResult(page);
  await expect(page.locator('#mcResultArea')).toBeVisible();
}

test('P-1. P50과 P25가 핵심 결과로 보이고, 표·막대·결과 영역 어디에도 P90 코드나 P90 금액이 없다', async ({ page }) => {
  await openSynthetic(page);
  await page.locator('#mcRangeBarsToggleBtn').click();
  const vals = await page.evaluate(() => {
    const combined = mcLastRender.withReal.accountScopes.combined;
    const last = combined[combined.length - 1];
    const shown = new Set();
    combined.forEach((m) => ['p10', 'p25', 'p50', 'p75'].forEach((k) => { shown.add(fmtKRWShort(m[k])); shown.add(fmtKRWShort(m.real[k])); }));
    const p90s = combined.flatMap((m) => [fmtKRWShort(m.p90), fmtKRWShort(m.real.p90)]).filter((t) => !shown.has(t));
    return { p50: fmtKRWShort(last.p50), p25: fmtKRWShort(last.p25), p25Real: fmtKRWShort(last.real.p25), p90s, dataHasP90: combined.every((m) => Number.isFinite(m.p90)) };
  });
  await expect(page.locator('#mcP50Text')).toHaveText(vals.p50);
  await expect(page.locator('#mcP25Text')).toHaveText(vals.p25);
  await expect(page.locator('#mcP25RealText')).toHaveText(`현재가치 기준 ${vals.p25Real}`);
  await expect(page.locator('#mcP25Text').locator('..')).toContainText('보수적으로 볼 때의 참고 금액(P25)');

  // 표의 20년 행에서 P25·P50 칸이 위 카드와 같은 값이다.
  const lastRow = await page.locator('#mcMilestoneTableBody tr').last().locator('td').allInnerTexts();
  expect(lastRow.length).toBe(5); // 시점 + P10/P25/P50/P75
  expect(lastRow[2]).toContain(vals.p25);
  expect(lastRow[3]).toContain(vals.p50);

  const resultText = await page.locator('#mcResultArea').innerText();
  expect(resultText).not.toMatch(/P90|P10~P90|높은 편/);
  expect(vals.p90s.length).toBeGreaterThan(0);
  vals.p90s.forEach((t) => expect(resultText).not.toContain(t));
  expect(vals.dataHasP90).toBe(true);
  // 막대 4개 · 가장 긴 막대(P75)가 끝까지 찬다(숨긴 P90을 기준으로 두지 않는다).
  const widths = await page.locator('#mcRangeBarsArea .rounded-full > div').evaluateAll((els) => els.map((e) => e.style.width));
  expect(widths.length).toBe(4);
  expect(widths[3]).toBe('100%');
});

test('G-1. 목표 도달 가능성은 하나뿐이고, 백분위를 확률로 부르는 표현이 없으며, 기간이 다르면 그 사실을 밝힌다', async ({ page }) => {
  await openSynthetic(page);
  const resultText = await page.locator('#mcResultArea').innerText();
  ['P25 달성확률', 'P50 달성확률', 'P25 확률', 'P50 확률', 'P25 목표달성률', 'P50 목표달성률'].forEach((w) => expect(resultText).not.toContain(w));
  expect(resultText.split('42.3%').length - 1).toBe(1);
  expect(resultText.split('목표에 도달할 가능성').length - 1).toBe(1);
  await expect(page.locator('#mcGoalArea')).toContainText('통합 기준 · 20년 후 목표에 도달할 가능성');
  await expect(page.locator('#mcP25Text').locator('..').locator('..')).toContainText('확률을 뜻하지 않고');
  await expect(page.locator('#mcGoalArea')).not.toContainText('위쪽 금액은');

  await milestoneBtn(page, 0).click();
  await expect(page.locator('#mcGoalArea')).toContainText('위쪽 금액은 5년 후 기준이고, 목표 도달 가능성은 20년 후 기준입니다.');
  expect((await page.locator('#mcResultArea').innerText()).split('42.3%').length - 1).toBe(1);
});

test('W-1. 일반계좌 기준인 표시는 그 사실을 밝힌다(가중평균 보수 · 적립금 안내 · 결과 범위 판정 · 범위 안내)', async ({ page }) => {
  await openSynthetic(page);
  await expect(page.locator('#mcWeightedFeeNote')).toHaveText('예상 연간 운용보수(일반계좌 목표비중 가중평균): 0.15%');
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('일반계좌 월 적립금');
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('일반계좌 적립금은 가구 전체 목표비중을 기준으로 계산합니다');
  const resultText = await page.locator('#mcResultArea').innerText();
  expect(resultText).not.toContain('일반계좌의 투자자산을 기준으로');
  const spread = await page.evaluate(() => assessResultSpread(1, 50, 30).message);
  expect(spread).toContain('일반계좌 결과 기준');
  expect(spread).not.toContain('P90');
  // 목표확률 정밀도 WARNING도 일반계좌 결과로 판정하므로 같은 표현으로 기준을 밝힌다(판정 조건은 그대로).
  const confidence = await page.evaluate(() => ({
    warn: assessSimulationConfidence(5000, { 1: 0.99 }),
    noWarnAt10k: assessSimulationConfidence(10000, { 1: 0.99 }),
    noWarnMid: assessSimulationConfidence(5000, { 1: 0.5 }),
  }));
  expect(confidence.warn.code).toBe('SAFETY_LOW_SIMULATION_CONFIDENCE');
  expect(confidence.warn.message).toContain('일반계좌 결과 기준으로');
  expect(confidence.noWarnAt10k).toBeNull();
  expect(confidence.noWarnMid).toBeNull();
  const scopeNotice = await page.evaluate(() => explainAccumulationScopeAlwaysOn().message);
  expect(scopeNotice).toContain('위에서 고른 계좌 범위(일반계좌·절세계좌·통합)를 따릅니다');
});

/* ── 반응형 · 다크 모드 게이트 ────────────────────────────────────────── */

const MIN_FONT_PX = 14;
const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));
const tinyTexts = (page, sel) => page.locator(sel).evaluate((root, min) => {
  const win = root.ownerDocument.defaultView;
  return [...root.querySelectorAll('*')].filter((el) => {
    if (el.children.length) return false;
    if (!(el.textContent || '').trim()) return false;
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.getClientRects().length === 0) return false;
    return parseFloat(s.fontSize) < min;
  }).map((el) => `${win.getComputedStyle(el).fontSize} | ${(el.textContent || '').trim().slice(0, 30)}`);
}, MIN_FONT_PX);
const clippedElements = (page, sel) => page.locator(sel).evaluate((root) => {
  const win = root.ownerDocument.defaultView;
  return [...root.querySelectorAll('*')].filter((el) => {
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') return false;
    return el.scrollWidth - el.clientWidth > 1;
  }).map((el) => `${el.id || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
});
const heightsOf = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));

const VIEWS = [
  [375, 812, true], [375, 812, false], [768, 1024, true], [768, 1024, false],
  [1024, 768, true], [1024, 768, false], [1440, 900, false],
];
for (const [w, h, dark] of VIEWS) {
  test(`R-${w} ${dark ? 'Dark' : 'Light'} - 결과 영역·운용보수 팝업이 14px · 무넘침 · 무잘림 · 44px을 지키고 통합 선택이 보인다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seedFeeScenario(page);
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);

    await renderSyntheticMcResult(page);
    await expect(page.locator('#mcResultArea')).toBeVisible();
    await page.locator('#mcRangeBarsToggleBtn').click();
    await expect(scopeBtn(page, 'combined')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#mcP50Text')).toBeVisible();
    await expect(page.locator('#mcP25Text')).toBeVisible();
    await expect(page.locator('#mcGoalArea')).toBeVisible();

    expect(await tinyTexts(page, '#mcResultArea'), '결과 영역 14px 미만').toEqual([]);
    expect(await clippedElements(page, '#mcResultArea'), '결과 영역 잘림').toEqual([]);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '가로 넘침').toBeLessThanOrEqual(w);
    for (const sel of ['#mcScopeSegmented button', '#mcMilestoneSegmented button']) {
      const hs = await heightsOf(page, sel);
      expect(hs.length).toBeGreaterThan(0);
      hs.forEach((x) => expect(x).toBeGreaterThanOrEqual(44));
    }
    // 핵심 결과 위계: P50 금액 글자가 P25 금액보다 크고, 둘은 겹치지 않는다.
    const box = await page.locator('#mcP50Text').evaluate((p50) => {
      const doc = p50.ownerDocument;
      const win = doc.defaultView;
      const p25 = doc.getElementById('mcP25Text');
      const a = p50.getBoundingClientRect();
      const b = p25.getBoundingClientRect();
      return { p50Font: parseFloat(win.getComputedStyle(p50).fontSize), p25Font: parseFloat(win.getComputedStyle(p25).fontSize), overlap: !(a.bottom <= b.top || b.bottom <= a.top) };
    });
    expect(box.p50Font).toBeGreaterThan(box.p25Font);
    expect(box.overlap).toBe(false);

    await page.locator('#mcFeeRatesToggleBtn').click();
    await expect(page.locator('#mcFeeRatesModal')).toBeVisible();
    expect(await tinyTexts(page, '#mcFeeRatesModal'), '운용보수 팝업 14px 미만').toEqual([]);
    expect(await clippedElements(page, '#mcFeeRatesList'), '운용보수 팝업 잘림').toEqual([]);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '팝업 가로 넘침').toBeLessThanOrEqual(w);
    (await heightsOf(page, '#mcFeeRatesList input[data-fee-key], #mcFeeRatesList [data-fee-unknown]')).forEach((x) => expect(x).toBeGreaterThanOrEqual(44));
  });
}
