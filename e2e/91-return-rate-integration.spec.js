// E2E-91 Return Key → Return Rate → Deterministic → Monte Carlo 통합 수정(checklist §32) - 화면 · 저장 경로 회귀.
//
// 계산 규칙 자체는 test/return-rate-integration.test.js가 고정하고, 이 파일은 실제 브라우저의 입력 · 저장 · 표시 경로를 고정한다.
//   D-1 수익률 관리 팝업: 손대지 않고 저장하면 키만 있는 항목 · 빈 칸 · 명시 0 · 보유하지 않은 시스템 키 · 사용자 값이 그대로다.
//       고친 칸만 바뀌고, 비운 칸은 0이 아니라 미입력으로 저장된다. 월복리 안내 · 종목코드 형식 안내가 보인다.
//   D-2 엑셀: 키만 적은 행이 사라지지 않고 내보내기 → 다시 가져오기에서도 남는다. 시스템 키의 빈 행은 사용자 항목을 만들지 않고,
//       'UNRESOLVED' 행은 저장하지 않는다.
//   M-1 Monte Carlo 결과 유효성: 시세만 바뀌거나 탭을 오가면 결과 그대로 · 실행 조건 · 운용보수 · 자산이 바뀌면 "다시 계산 필요".
//   M-2 실행 중 화면 갱신(renderAll · updateProjection · 탭 이동)이 진행 표시 · 취소 버튼을 지우지 않는다.
//   M-3 결과 안내: 수익률 가정 없음 · 월 적립금 대상 미선택 경고가 결과 바로 아래 보인다.
//   O-1 자산 상세: 같은 종목의 다른 보유분이 다른 수익률 기준을 쓰면 알리고, 설정은 바꾸지 않는다.
//   R   375 Dark · 375 Light · 768 Dark · 1440 Light - 새 안내 문구 14px 이상 · 가로 넘침 없음.
//
// 네트워크 독립: 목표 · 자산은 채권(σ=0)이거나, 티커가 필요하면 seedPriceHistory로 합성 시계열을 넣는다. 실제 사용자 데이터 없음.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab, seedPriceHistory } = require('./fixtures');

const BOND_TARGET = [{ owner: '신랑', region: '국내', name: 'E91국내채권', pct: 100 }];

async function boot(page, setup, arg) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  if (setup) await page.evaluate(setup, arg);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof openScenarioRateManagerModal === 'function');
}
const readRates = (page) => page.evaluate(() => JSON.parse(JSON.stringify(state.projection.customScenarioRates || {})));
const rateRow = (page, label) => page.locator('#scenarioRateManagerList > div').filter({ has: page.locator(`span[title="${label}"]`) });

async function runMonteCarlo(page) {
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 60000 });
}

/* ── D. 수익률 사전 저장 경로 ──────────────────────────────────────────── */

const RATES_D1 = {
  E91_KEY_ONLY: { label: 'E91 키만' },
  E91_PARTIAL: { label: 'E91 일부', normal: 6 },
  E91_ZERO: { label: 'E91 명시0', conservative: 0, normal: 0, optimistic: 0 },
  DEV_EX_US: { label: '선진국(미국 제외) 주식', normal: 5 },
  '000660.KS': { label: 'SK하이닉스', conservative: 8, normal: 12, optimistic: 15 },
  '005930': { label: '삼성전자(코드만)', normal: 10 }
};

test('D-1. 수익률 관리 팝업 - 손대지 않고 저장하면 그대로, 고친 칸만 바뀌고 비운 칸은 미입력(0 아님)으로 저장된다', async ({ page }) => {
  await boot(page, (rates) => {
    state.assets = [makeAsset({ ticker: '000660.KS', name: 'SK하이닉스', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 })];
    state.projection.customScenarioRates = rates;
    persistAssets(); persistProjection();
  }, RATES_D1);
  const before = await readRates(page);

  await page.evaluate(() => openScenarioRateManagerModal());
  await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
  // [PMD-06] 입력 수익률의 의미(월복리)
  await expect(page.locator('#scenarioRateCompoundingNote')).toContainText('월복리');
  await expect(page.locator('#scenarioRateCompoundingNote')).toContainText('10.47%');
  // [F-02] 빈 칸은 0이 아니라 빈 칸 + "미입력", 명시 0은 0
  const partial = rateRow(page, 'E91 일부');
  await expect(partial.locator('input[data-rate-field="conservative"]')).toHaveValue('');
  await expect(partial.locator('input[data-rate-field="conservative"]')).toHaveAttribute('placeholder', '미입력');
  await expect(partial.locator('input[data-rate-field="normal"]')).toHaveValue('6');
  await expect(partial).toContainText('0%로 바뀌지 않습니다');
  await expect(rateRow(page, 'E91 명시0').locator('input[data-rate-field="normal"]')).toHaveValue('0');
  await expect(rateRow(page, 'E91 키만')).toContainText('수익률 미입력');
  // [PMD-01] 형식이 다른 키는 바꾸지 않고 안내만
  await expect(rateRow(page, '삼성전자(코드만)')).toContainText('005930.KS');

  await page.locator('#saveScenarioRateManagerModalBtn').click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeHidden();
  expect(await readRates(page), '손대지 않은 저장은 사전을 한 글자도 바꾸지 않는다').toEqual(before);

  await page.evaluate(() => openScenarioRateManagerModal());
  await rateRow(page, 'E91 일부').locator('input[data-rate-field="conservative"]').fill('3');
  await rateRow(page, 'E91 일부').locator('input[data-rate-field="normal"]').fill('');
  await rateRow(page, 'E91 명시0').locator('input[data-rate-field="optimistic"]').fill('2');
  await page.locator('#saveScenarioRateManagerModalBtn').click();
  await expect(page.locator('#scenarioRateManagerModal')).toBeHidden();
  const after = await readRates(page);
  expect(after.E91_PARTIAL).toEqual({ label: 'E91 일부', conservative: 3 });
  expect(after.E91_ZERO).toEqual({ label: 'E91 명시0', conservative: 0, normal: 0, optimistic: 2 });
  expect(after.E91_KEY_ONLY).toEqual({ label: 'E91 키만' });
  expect(after.DEV_EX_US, '[F-03] 보유하지 않은 시스템 키가 세 값 사용자 설정으로 굳지 않는다').toEqual({ label: '선진국(미국 제외) 주식', normal: 5 });
  expect(after['000660.KS']).toEqual(before['000660.KS']);
  expect(after['005930'], '[PMD-01] 키를 자동으로 바꾸지 않는다').toEqual(before['005930']);
  // 자동 매칭 결과가 자산의 사용자 대표매칭으로 승격되지 않는다 · 사용자 값은 계산에 그대로 쓰인다
  const asset = await page.evaluate(() => ({ override: state.assets[0].rateMatchOverride, rate: getAssetProjectionRate(state.assets[0], 'normal') }));
  expect(asset.override).toBeUndefined();
  expect(asset.rate).toBe(12);
});

test('D-2. 엑셀 - 키만 적은 행이 남고 왕복해도 유지, 시스템 키 빈 행 · UNRESOLVED 행은 사전에 만들지 않는다', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await boot(page, () => {
    state.assets = [makeAsset({ ticker: '069500', name: 'KODEX 200', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 40000, currentPrice: 40000 })];
    state.projection.customScenarioRates = {};
    persistAssets(); persistProjection();
  });
  const workbook = await page.locator('body').evaluate((body) => {
    const XLSX = body.ownerDocument.defaultView.XLSX;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { ticker: '069500', '소유자': '신랑', '계좌구분': '일반계좌', '종목명': 'KODEX 200', '국내/해외': '국내', '통화': 'KRW', '수량': 10, '매수단가': 40000 }
    ]), '자산목록');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { '키(수익률연동키)': 'E91_KEY_ONLY', '종목명': 'E91 키만', '키워드(쉼표로 구분)': '', '보수적(%)': '', '일반적(%)': '', '긍정적(%)': '' },
      { '키(수익률연동키)': 'E91_PARTIAL', '종목명': 'E91 일부', '키워드(쉼표로 구분)': '', '보수적(%)': '', '일반적(%)': 6, '긍정적(%)': '' },
      { '키(수익률연동키)': 'KOSPI', '종목명': 'KOSPI (국내 대표지수)', '키워드(쉼표로 구분)': '', '보수적(%)': '', '일반적(%)': '', '긍정적(%)': '' },
      { '키(수익률연동키)': 'UNRESOLVED', '종목명': '미확인', '키워드(쉼표로 구분)': '', '보수적(%)': 0, '일반적(%)': 0, '긍정적(%)': 0 }
    ]), '수익률 관리 기준');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  });
  const upload = async (base64) => {
    await page.locator('#excelFileInput').setInputFiles({ name: 'e91.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(base64, 'base64') });
    await expect(page.locator('#importChoiceModal')).toBeVisible();
    await page.locator('#importChoiceAppendBtn').click();
  };

  await upload(workbook);
  await expect.poll(() => page.evaluate(() => !!(state.projection.customScenarioRates || {}).E91_PARTIAL)).toBe(true);
  const imported = await readRates(page);
  expect(imported.E91_KEY_ONLY, '[F-01] 키만 적은 행이 사라지지 않는다').toEqual({ label: 'E91 키만' });
  expect(imported.E91_PARTIAL, '[F-02] 빈 칸은 0으로 저장하지 않는다').toEqual({ label: 'E91 일부', normal: 6 });
  expect(imported.KOSPI, '시스템 키 빈 행은 사용자 항목이 아니다').toBeUndefined();
  expect(imported.UNRESOLVED, '[N-01] 상태값은 키로 저장하지 않는다').toBeUndefined();
  expect(await page.evaluate(() => getAssetProjectionRate(state.assets.find((a) => a.ticker === '069500'), 'normal'))).toBe(7);

  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportExcelBtn').click()]);
  const filePath = path.join(os.tmpdir(), `e2e91-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  await download.saveAs(filePath);
  const exported = fs.readFileSync(filePath).toString('base64');
  fs.unlinkSync(filePath);
  const rateRows = await page.locator('body').evaluate((body, b64) => {
    const XLSX = body.ownerDocument.defaultView.XLSX;
    return XLSX.utils.sheet_to_json(XLSX.read(b64, { type: 'base64' }).Sheets['수익률 관리 기준'], { defval: '' });
  }, exported);
  const keyOnlyRow = rateRows.find((r) => r['키(수익률연동키)'] === 'E91_KEY_ONLY');
  expect(keyOnlyRow, '키만 있는 항목도 내보낸다').toBeTruthy();
  expect([keyOnlyRow['보수적(%)'], keyOnlyRow['일반적(%)'], keyOnlyRow['긍정적(%)']]).toEqual(['', '', '']);
  expect(rateRows.some((r) => r['키(수익률연동키)'] === 'UNRESOLVED')).toBe(false);

  await page.evaluate(() => { state.projection.customScenarioRates = {}; persistProjection(); });
  await upload(exported);
  await expect.poll(() => page.evaluate(() => !!(state.projection.customScenarioRates || {}).E91_KEY_ONLY)).toBe(true);
  const roundTrip = await readRates(page);
  expect(roundTrip.E91_KEY_ONLY).toEqual({ label: 'E91 키만' });
  expect(roundTrip.E91_PARTIAL).toEqual({ label: 'E91 일부', normal: 6 });
  expect(Object.keys(roundTrip).sort()).toEqual(['E91_KEY_ONLY', 'E91_PARTIAL']);
});

/* ── M. Monte Carlo 결과 유효성 · 실행 상태 ─────────────────────────────── */

test('M-1. 시세 갱신 · 탭 이동은 결과를 지우지 않고, 실행 조건 · 운용보수 · 자산이 바뀌면 "다시 계산 필요"를 표시한다', async ({ page }) => {
  await seedPortfolio(page, { targets: BOND_TARGET, assetValueEach: 100000000 });
  await page.locator('body').evaluate(() => {
    state.assets.push(makeAsset({ name: 'E91 시세자산', ticker: 'QQQM', category: 'ETF', owner: '신랑', accountType: '일반계좌', isDomestic: '해외', currency: 'USD', quantity: 1, buyPrice: 200, currentPrice: 200 }));
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await runMonteCarlo(page);
  const notice = page.locator('#mcStaleNotice');
  const result = page.locator('#mcResultArea');
  await expect(notice).toBeHidden();
  const p50 = await page.locator('#mcP50Text').textContent();

  // 시세 · 환율만 바뀐 화면 갱신 → 결과 유지(PMD-09)
  await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.ticker === 'QQQM');
    a.currentPrice = 260;
    state.exchangeRate = (state.exchangeRate || 1400) + 25;
    renderAll();
  });
  await expect(result).toBeVisible();
  await expect(notice).toBeHidden();
  // 서브탭 이동 후 복귀 → 결과 유지(N-03)
  await page.locator('body').evaluate(() => { switchRebalanceSubTab('target'); switchRebalanceSubTab('projection'); });
  await expect(result).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(page.locator('#mcP50Text')).toHaveText(p50);

  // 시나리오 변경 → 다시 계산 필요(값은 지우지 않음) → 되돌리면 사라짐
  await page.locator('#mcPresetSelect').selectOption('optimistic');
  await expect(notice).toBeVisible();
  await expect(page.locator('#mcP50ScopeNote')).toContainText('이전 설정 기준');
  await expect(page.locator('#mcP50Text')).toHaveText(p50);
  await page.locator('#mcPresetSelect').selectOption('normal');
  await expect(notice).toBeHidden();

  // 목표금액 변경 → 표시, 원래 값으로 → 사라짐
  const goalInput = page.locator('#mcGoalAmountInput');
  const originalGoal = await goalInput.inputValue();
  await goalInput.fill('700000000');
  await expect(notice).toBeVisible();
  await goalInput.fill(originalGoal);
  await expect(notice).toBeHidden();

  // 운용보수 저장 → 표시
  await page.locator('#mcFeeRatesToggleBtn').click();
  await page.locator('#mcFeeRatesList input[data-fee-key]').first().fill('0.3');
  await page.locator('#saveMcFeeRatesModalBtn').click();
  await expect(notice).toBeVisible();

  // 다시 실행 → 사라짐
  await page.locator('#mcRunBtn').click();
  await expect(notice).toBeHidden({ timeout: 60000 });
  await expect(result).toBeVisible({ timeout: 60000 });

  // 자산 수량 변경(자산 · 거래 저장 경로와 같은 renderAll) → 표시
  await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.ticker === 'QQQM');
    a.quantity = 3;
    persistAssets();
    renderAll();
  });
  await expect(result).toBeVisible();
  await expect(notice).toBeVisible();
});

test('M-2. 실행 중에 화면 갱신(renderAll · updateProjection · 탭 이동)이 일어나도 진행 표시와 취소 버튼이 유지되고 결과는 한 번 표시된다', async ({ page }) => {
  await seedPortfolio(page, { targets: BOND_TARGET, assetValueEach: 100000000 });
  await page.locator('body').evaluate(() => {
    state.rebalance['신랑'].domestic = { '국내': 50, '해외': 50 };
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 50 }, { type: 'ticker', ticker: '005930', label: '삼성전자', pct: 50 }];
    state.rebalance['신랑'].targets['해외'] = [
      { type: 'ticker', ticker: 'QQQM', label: 'NASDAQ 100', pct: 34 }, { type: 'ticker', ticker: 'SPY', label: 'SPY', pct: 33 }, { type: 'ticker', ticker: 'SCHD', label: 'SCHD', pct: 33 }];
    persistRebalance();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await seedPriceHistory(page, ['069500.KS', '005930.KS', 'QQQM', 'SPY', 'SCHD']);
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('50000');
  await page.locator('#mcRunBtn').click();
  await page.waitForFunction(() => mcState === 'RUNNING', null, { timeout: 30000 });

  const during = await page.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    renderAll();
    updateProjection();
    switchRebalanceSubTab('target');
    switchRebalanceSubTab('projection');
    const hidden = (id) => doc.getElementById(id).classList.contains('hidden');
    return { workerState: mcState, progressVisible: !hidden('mcProgressArea'), cancelVisible: !hidden('mcCancelBtn'),
      runDisabled: doc.getElementById('mcRunBtn').disabled, resultVisible: !hidden('mcResultArea') };
  });
  expect(during.workerState, '이 검증은 계산이 아직 도는 중에 수행되어야 한다').toBe('RUNNING');
  expect(during.progressVisible, '[F-06a] 진행 표시 유지').toBe(true);
  expect(during.cancelVisible, '[F-06a] 취소 버튼 유지').toBe(true);
  expect(during.runDisabled, '[F-06a] 실행 버튼은 계속 비활성').toBe(true);
  expect(during.resultVisible).toBe(false);

  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#mcProgressArea')).toBeHidden();
  await expect(page.locator('#mcCancelBtn')).toBeHidden();
  await expect(page.locator('#mcRunBtn')).toBeEnabled();
  await expect(page.locator('#mcStaleNotice'), '입력은 바뀌지 않았으므로 다시 계산 필요 표시가 없다').toBeHidden();
});

test('M-3. 수익률 가정이 없는 종목 · 대상 종목을 고르지 않은 월 적립금은 결과 바로 아래 경고로 보인다', async ({ page }) => {
  await seedPortfolio(page, { targets: BOND_TARGET, assetValueEach: 100000000 });
  await page.locator('body').evaluate(() => {
    state.rebalance['신랑'].domestic = { '국내': 50, '해외': 50 };
    state.rebalance['신랑'].targets['해외'] = [{ type: 'ticker', ticker: 'PLTR', label: 'E91 Palantir', pct: 100 }];
    state.projection.monthlyContributionByOwner = { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
    persistRebalance(); persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await seedPriceHistory(page, ['PLTR']);
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await runMonteCarlo(page);
  const critical = page.locator('#mcSafetyCritical');
  await expect(critical).toBeVisible();
  await expect(critical).toContainText('수익률 가정 없음');
  await expect(critical).toContainText('E91 Palantir');
  await expect(critical).toContainText('월 적립금 대상 종목 미선택');
});

/* ── O. 소유자별 기준 불일치 안내 ──────────────────────────────────────── */

test('O-1. 같은 종목의 다른 보유분이 다른 수익률 기준을 쓰면 자산 상세에서 알리고, 어느 쪽 설정도 바꾸지 않는다', async ({ page }) => {
  await boot(page, () => {
    state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 4.5, optimistic: 6 } };
    state.assets = [
      makeAsset({ ticker: '140860.KQ', name: '파크시스템스', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, rateMatchOverride: 'BOND.STOCK' }),
      makeAsset({ ticker: '140860.KQ', name: '파크시스템스', category: '주식', owner: '와이프', accountType: 'ISA', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, rateMatchOverride: 'KOSDAQ' })
    ];
    persistAssets(); persistProjection();
  });
  const text = await page.locator('#assetDetailReturnAssumption').evaluate((box) => {
    openAssetDetailModal(state.assets[0].id);
    return box.innerText.replace(/\s+/g, ' ');
  });
  expect(text).toContain('같은 종목의 다른 보유분');
  expect(text).toContain('와이프 ISA → KOSDAQ');
  expect(await page.evaluate(() => state.assets.map((a) => a.rateMatchOverride))).toEqual(['BOND.STOCK', 'KOSDAQ']);
  // 결정론 절세계좌(와이프 ISA)는 와이프 기준(KOSDAQ 7%)으로 계산된다 - 신랑 4.5%가 번지지 않는다
  expect(await page.evaluate(() => getAssetProjectionRate(state.assets[1], 'normal'))).toBe(7);
});

/* ── R. 모바일 우선 가독성 ─────────────────────────────────────────────── */

const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));
for (const [w, h, dark] of [[375, 812, true], [375, 812, false], [768, 1024, true], [1440, 900, false]]) {
  test(`R-${w} ${dark ? 'Dark' : 'Light'} - 월복리 안내 · 사전 안내 · 다시 계산 필요 표시가 14px 이상이고 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seedPortfolio(page, { targets: BOND_TARGET, assetValueEach: 100000000 });
    await page.locator('body').evaluate(() => {
      state.projection.customScenarioRates = { E91_PARTIAL: { label: 'E91 일부', normal: 6 }, '005930': { label: '삼성전자(코드만)', normal: 10 } };
      persistProjection();
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof openScenarioRateManagerModal === 'function');
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);

    await page.evaluate(() => openScenarioRateManagerModal());
    await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
    const modalCheck = await page.locator('#scenarioRateManagerModal').evaluate((modal) => {
      const win = modal.ownerDocument.defaultView;
      const texts = [modal.querySelector('#scenarioRateCompoundingNote'), ...modal.querySelectorAll('#scenarioRateManagerList p')];
      return {
        smallFonts: texts.filter((el) => el && parseFloat(win.getComputedStyle(el).fontSize) < 14).map((el) => el.textContent.trim().slice(0, 30)),
        // 말줄임(truncate · overflow hidden)으로 의도적으로 자른 종목명은 넘침이 아니다 - 내용이 밖으로 새는(visible) 요소만 본다.
        overflow: [...modal.querySelectorAll('*')].filter((el) => el.scrollWidth - el.clientWidth > 1 && win.getComputedStyle(el).overflowX === 'visible').map((el) => el.id || el.tagName).slice(0, 5),
        hintCount: modal.querySelectorAll('#scenarioRateManagerList p').length
      };
    });
    expect(modalCheck.smallFonts, '14px 미만').toEqual([]);
    expect(modalCheck.overflow, '팝업 안 가로 넘침').toEqual([]);
    expect(modalCheck.hintCount).toBeGreaterThan(0);
    await page.locator('#cancelScenarioRateManagerModalBtn').click();

    await goToProjectionTab(page);
    await page.locator('#mcIterationsSelect').selectOption('5000');
    await runMonteCarlo(page);
    await page.locator('#mcPresetSelect').selectOption('optimistic');
    const notice = page.locator('#mcStaleNotice');
    await expect(notice).toBeVisible();
    const noticeCheck = await notice.evaluate((el) => {
      const win = el.ownerDocument.defaultView;
      const r = el.getBoundingClientRect();
      return {
        smallFonts: [...el.querySelectorAll('p')].filter((p) => parseFloat(win.getComputedStyle(p).fontSize) < 14).length,
        right: r.right, docWidth: el.ownerDocument.documentElement.clientWidth
      };
    });
    expect(noticeCheck.smallFonts).toBe(0);
    expect(noticeCheck.right).toBeLessThanOrEqual(noticeCheck.docWidth + 1);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '가로 넘침').toBeLessThanOrEqual(w);
  });
}
