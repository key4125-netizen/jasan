// E2E-92 [v246 · PMD-12] Instrument Return Key Master(checklist §33) - 화면 · 저장 경로 회귀.
//
// 계산 규칙은 test/instrument-return-key-master.test.js가 고정하고, 이 파일은 실제 브라우저의 입력 · 저장 · 표시 경로를 고정한다.
//   T-1 거래 입력: 종목 기준이 있으면 안내만 보이고 선택칸은 빈값 - 저장해도 사용자 지정이 생기지 않고 계산은 종목 기준이다.
//   T-2 사용자가 다른 기준을 고르면 그 자산의 사용자 지정으로만 저장되고 종목 기준 · 사전은 그대로다.
//   T-3 거래 수정으로 지정을 비우면 종목 기준으로 돌아가고 종목 기준 · 사전은 그대로다 · 종목 포지션 미리 채움은 새 자산일 때만.
//   X-1 엑셀 내보내기: 2시트 적용 종목 · 1시트 수익률 기준 출처 · 대표매칭 = 사용자 지정 원본 → 다시 가져오면 종목 기준 복원.
//   X-2 옛 2시트(칸 없음) → 종목 기준 유지 · 칸이 있고 비었으면 그 키의 연결 해제 · 충돌은 반영하지 않고 알림.
//   X-3 전체 왕복: 종목 기준 · 사전 · 사용자 지정 · 역할 · 종목 포지션 보존 · 빈 역할은 종목 포지션을 지우지 않음 · 역할 충돌 알림.
//   P-1 수익률 관리 팝업: 무수정 저장 유지 · 추가 · 제거 · 중복 차단 · 기본값 초기화 후 유지 · 행 삭제 = 연결 해제.
//   M-2 종목 기준이 바뀌면 Monte Carlo "다시 계산 필요".
//   R   375 Dark · 375 Light · 768 Dark · 1440 Light - 새 입력칸 · 안내 14px 이상 · 가로 넘침 없음.
//
// 네트워크 독립 · 합성 데이터만 쓴다(공개 종목코드 · 합성 수량/가격). 실제 사용자 데이터 없음.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

async function boot(page, setup, arg) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  if (setup) await page.evaluate(setup, arg);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof openScenarioRateManagerModal === 'function');
}
const readJson = (page, expr) => page.evaluate((e) => JSON.parse(JSON.stringify(new Function(`return (${e});`)() ?? null)), expr);
const readMaster = (page) => readJson(page, 'state.projection.instrumentReturnKeys || {}');
const readRates = (page) => readJson(page, 'state.projection.customScenarioRates || {}');

// e2e/37과 같은 방식으로 거래 입력 폼을 "종목 선택까지 끝난 상태"로 만든다.
async function openTxFormWith(page, { owner = '신랑', accountType = '일반계좌', name, ticker = '', currency = 'KRW' }) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_owner').selectOption(owner);
  await page.locator('#tx_accountType').fill(accountType);
  if (!ticker) await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#transactionForm').evaluate((form, { name, ticker, currency }) => {
    const d = form.ownerDocument;
    d.getElementById('tx_name').value = name;
    d.getElementById('tx_ticker').value = ticker;
    d.getElementById('tx_currency').value = currency;
    d.defaultView.refreshTxRateMatchRecommendation({ allowPrefill: true });
  }, { name, ticker, currency });
  await page.locator('#tx_quantity').fill('10');
  await page.locator('#tx_price').fill('10000');
}
async function submitTx(page) {
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionForm')).toBeHidden();
}
const assetView = (page, predicate) => page.evaluate((src) => {
  const a = state.assets.find(new Function('a', `return ${src};`));
  if (!a) return null;
  const d = describeAppliedReturnAssumption(a);
  return { override: a.rateMatchOverride === undefined ? 'UNDEFINED' : a.rateMatchOverride, role: a.role === undefined ? 'UNDEFINED' : a.role,
    key: d.appliedKey, sourceLabel: d.sourceLabel, rate: getAssetProjectionRate(a, 'normal') };
}, predicate);

async function uploadWorkbook(page, base64, choice = 'append') {
  await page.locator('#excelFileInput').setInputFiles({ name: 'e92.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(base64, 'base64') });
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator(choice === 'overwrite' ? '#importChoiceOverwriteBtn' : '#importChoiceAppendBtn').click();
}
async function exportWorkbook(page) {
  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportExcelBtn').click()]);
  const filePath = path.join(os.tmpdir(), `e2e92-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  await download.saveAs(filePath);
  const base64 = fs.readFileSync(filePath).toString('base64');
  fs.unlinkSync(filePath);
  const sheets = await page.locator('body').evaluate((body, b64) => {
    const XLSX = body.ownerDocument.defaultView.XLSX;
    const wb = XLSX.read(b64, { type: 'base64' });
    return { assets: XLSX.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' }), rates: XLSX.utils.sheet_to_json(wb.Sheets['수익률 관리 기준'], { defval: '' }) };
  }, base64);
  await page.evaluate(() => { if (typeof closeSystemManagementModal === 'function') closeSystemManagementModal(); });
  return { base64, sheets };
}
const buildWorkbook = (page, assets, rates) => page.locator('body').evaluate((body, { assets, rates }) => {
  const XLSX = body.ownerDocument.defaultView.XLSX;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assets), '자산목록');
  if (rates) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rates), '수익률 관리 기준');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}, { assets, rates });
const ASSET_ROW = (o) => Object.assign({ ticker: '069500', '소유자': '신랑', '계좌구분': '일반계좌', '종목명': 'KODEX 200', '국내/해외': '국내', '통화': 'KRW', '수량': 10, '매수단가': 40000 }, o);
const collectDialogs = (page) => {
  const messages = [];
  page.on('dialog', (d) => { messages.push(d.message()); d.accept(); });
  return messages;
};

/* ── T. 거래 입력 ─────────────────────────────────────────────────────── */

test('T-1. 종목 기준이 있으면 안내만 표시 · 선택칸 빈값 · 저장 후 사용자 지정 없음 · 계산은 종목 기준', async ({ page }) => {
  await boot(page, () => {
    state.assets = []; state.transactions = [];
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
    persistAssets(); persistTransactions(); persistProjection();
  });
  await openTxFormWith(page, { name: 'KODEX 200TR', ticker: '278530.KS' });
  const help = page.locator('#txRateMatchHelpText');
  await expect(help).toContainText('종목 기준');
  await expect(help).toContainText('KOSPI');
  await expect(help).not.toContainText('찾지 못했어요');
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('');
  await expect(page.locator('#txRateMatchApplyBtn')).toBeHidden();
  await submitTx(page);
  const got = await assetView(page, "a.name === 'KODEX 200TR'");
  const kospi = await page.evaluate(() => resolveProjectionRateForKey('KOSPI', 'normal', false));
  expect(got.override, '저장해도 사용자 지정이 생기지 않는다').toBe('UNDEFINED');
  expect([got.key, got.sourceLabel, got.rate]).toEqual(['KOSPI', '종목 기준', kospi]);
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI' });
});

test('T-2. 다른 기준을 직접 고르면 그 자산의 사용자 지정으로만 저장 · 종목 기준과 사전은 그대로', async ({ page }) => {
  await boot(page, () => {
    state.assets = []; state.transactions = [];
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
    state.projection.customScenarioRates = { E92_KEY: { label: 'E92 기준', normal: 6 } };
    persistAssets(); persistTransactions(); persistProjection();
  });
  const rates = await readRates(page);
  await openTxFormWith(page, { name: 'KODEX 200TR', ticker: '278530.KS' });
  await page.locator('#tx_rateMatchOverride').evaluate((sel) => {
    const win = sel.ownerDocument.defaultView;
    win.ensureRateMatchOption('NASDAQ');
    sel.value = 'NASDAQ';
    win.refreshTxRateMatchRecommendation();
  });
  await expect(page.locator('#txRateMatchHelpText')).toContainText('사용자 지정으로 저장');
  await submitTx(page);
  const got = await assetView(page, "a.name === 'KODEX 200TR'");
  expect([got.override, got.key, got.sourceLabel]).toEqual(['NASDAQ', 'NASDAQ', '사용자 지정']);
  expect(got.rate).toBe(await page.evaluate(() => resolveProjectionRateForKey('NASDAQ', 'normal', false)));
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI' });
  expect(await readRates(page)).toEqual(rates);
});

test('T-3. 거래 수정으로 지정을 비우면 종목 기준으로 돌아가고 종목 기준 · 사전은 그대로 · 포지션 미리 채움은 새 자산일 때만', async ({ page }) => {
  await boot(page, () => {
    const roles = ASSET_ROLE_OPTIONS.map((o) => o.value);
    state.transactions = [{ id: 'e2e92-tx', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '278530.KS', name: 'KODEX 200TR',
      type: 'buy', quantity: 10, price: 10000, currency: 'KRW', fee: 0 }];
    state.assets = [makeAsset({ ticker: '278530.KS', name: 'KODEX 200TR', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 10000,
      currency: 'KRW', rateMatchOverride: 'NASDAQ', role: roles[0] }),
    makeAsset({ ticker: '278530.KS', name: 'KODEX 200TR', owner: '신랑', accountType: 'ISA', quantity: 1, buyPrice: 10000, currency: 'KRW' })];
    state.assets[1].role = undefined;
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
    state.projection.customScenarioRates = { E92_KEY: { label: 'E92 기준', normal: 6 } };
    state.tickerRoles = { '278530.KS': roles[1] };
    persistAssets(); persistTransactions(); persistProjection(); persistTickerRoles();
  });
  const roles = await page.evaluate(() => ASSET_ROLE_OPTIONS.map((o) => o.value));
  const rates = await readRates(page);

  // 수정 모드: 기존 지정이 보이고, 비우면 종목 기준으로 돌아간다는 안내 → 저장 후 종목 기준 적용
  await page.getByText('거래내역', { exact: true }).click();
  await page.evaluate(() => openTransactionModal('e2e92-tx'));
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('NASDAQ');
  await page.locator('#tx_rateMatchOverride').selectOption('');
  await expect(page.locator('#txRateMatchHelpText')).toContainText('종목 기준');
  await submitTx(page);
  const edited = await assetView(page, "a.accountType === '일반계좌' && a.name === 'KODEX 200TR'");
  expect([edited.override, edited.key, edited.sourceLabel]).toEqual(['UNDEFINED', 'KOSPI', '종목 기준']);
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI' });
  expect(await readRates(page)).toEqual(rates);

  // 신규 거래 · 새 자산(와이프) → 종목 포지션 미리 채움 → 새 자산의 역할
  // (방금 수정 저장이 기존 규칙대로 그 자산 역할을 종목 포지션에도 기록했으므로 지금 레지스트리 값을 기준으로 본다)
  const registryRole = (await readJson(page, 'state.tickerRoles'))['278530.KS'];
  expect(roles).toContain(registryRole);
  await openTxFormWith(page, { owner: '와이프', name: 'KODEX 200TR', ticker: '278530.KS' });
  await expect(page.locator('#tx_role')).toHaveValue(registryRole);
  await submitTx(page);
  expect((await assetView(page, "a.owner === '와이프' && a.name === 'KODEX 200TR'")).role).toBe(registryRole);

  // 신규 거래 · 이미 있는 자산(신랑 일반계좌 역할 있음 / 신랑 ISA 역할 없음) → 미리 채우지 않고 기존 역할에 새로 쓰지 않는다
  await openTxFormWith(page, { owner: '신랑', accountType: 'ISA', name: 'KODEX 200TR', ticker: '278530.KS' });
  await expect(page.locator('#tx_role')).toHaveValue('');
  await submitTx(page);
  expect((await assetView(page, "a.accountType === 'ISA' && a.name === 'KODEX 200TR'")).role).toBe('UNDEFINED');
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI' });
});

/* ── X. 엑셀 ──────────────────────────────────────────────────────────── */

test('X-1. 내보내기: 2시트 적용 종목 · 1시트 수익률 기준 출처 · 대표매칭은 사용자 지정 원본 → 다시 가져오면 종목 기준 복원', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await boot(page, () => {
    state.assets = [
      makeAsset({ ticker: '278530', name: 'KODEX 200TR', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 10000, currentPrice: 10000 }),
      makeAsset({ ticker: '069500', name: 'KODEX 200', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 40000, currentPrice: 40000, rateMatchOverride: 'KOSPI' }),
      makeAsset({ ticker: 'ZZETF', name: 'Unknown Global ETF', owner: '와이프', accountType: '일반계좌', currency: 'USD', isDomestic: '해외', quantity: 1, buyPrice: 100, currentPrice: 100 })
    ];
    state.projection.customScenarioRates = {};
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND' };
    persistAssets(); persistProjection();
  });
  const master = await readMaster(page);
  const { base64, sheets } = await exportWorkbook(page);
  const assetRow = (name) => sheets.assets.find((r) => r['종목명'] === name);
  expect([assetRow('KODEX 200TR')['대표매칭(수익률연동키)'], assetRow('KODEX 200TR')['수익률 기준 출처']]).toEqual(['', '종목 기준(KOSPI)']);
  expect([assetRow('KODEX 200')['대표매칭(수익률연동키)'], assetRow('KODEX 200')['수익률 기준 출처']]).toEqual(['KOSPI', '사용자 지정']);
  expect(assetRow('Unknown Global ETF')['수익률 기준 출처']).toBe('미확정(0%)');
  const rateRow = (key) => sheets.rates.find((r) => r['키(수익률연동키)'] === key);
  expect(rateRow('KOSPI')['적용 종목']).toBe('278530.KS');
  expect(rateRow('BOND')['적용 종목'], '포트폴리오에 없는 종목의 연결도 내보낸다').toBe('NAME:국고채A');

  await page.evaluate(() => { state.projection.instrumentReturnKeys = {}; persistProjection(); });
  await uploadWorkbook(page, base64);
  await expect.poll(() => dialogs.length).toBeGreaterThan(0);
  expect(await readMaster(page)).toEqual(master);
  const rates = await readRates(page);
  expect(rates.KOSPI, '적용 종목만 적힌 시스템 키 행은 사전 항목을 만들지 않는다').toBeUndefined();
  expect(rates.BOND).toBeUndefined();
  expect((await assetView(page, "a.name === 'KODEX 200TR'")).override, '출처 칸은 읽지 않는다').toBe('UNDEFINED');
  expect((await assetView(page, "a.name === 'KODEX 200'")).override).toBe('KOSPI');
});

test('X-2. 옛 2시트(적용 종목 칸 없음)는 종목 기준 유지 · 칸이 있고 비었으면 그 키만 해제 · 충돌은 반영하지 않고 알림', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await boot(page, () => {
    state.assets = [makeAsset({ ticker: '069500', name: 'KODEX 200', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 40000, currentPrice: 40000 })];
    state.projection.customScenarioRates = {};
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND' };
    persistAssets(); persistProjection();
  });
  const legacy = await buildWorkbook(page, [ASSET_ROW()], [
    { '키(수익률연동키)': 'KOSPI', '종목명': 'KOSPI (국내 대표지수)', '키워드(쉼표로 구분)': '', '보수적(%)': '', '일반적(%)': 8, '긍정적(%)': '' }
  ]);
  await uploadWorkbook(page, legacy);
  await expect.poll(() => dialogs.length).toBe(1);
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND' });
  expect((await readRates(page)).KOSPI).toEqual({ label: 'KOSPI (국내 대표지수)', normal: 8 });

  const blankColumn = await buildWorkbook(page, [ASSET_ROW()], [
    { '키(수익률연동키)': 'KOSPI', '종목명': 'KOSPI (국내 대표지수)', '키워드(쉼표로 구분)': '', '적용 종목': '', '보수적(%)': '', '일반적(%)': 8, '긍정적(%)': '' }
  ]);
  await uploadWorkbook(page, blankColumn);
  await expect.poll(() => dialogs.length).toBe(2);
  expect(await readMaster(page), 'KOSPI 연결만 해제 · 파일에 없는 BOND 연결은 유지').toEqual({ 'NAME:국고채A': 'BOND' });

  const conflict = await buildWorkbook(page, [ASSET_ROW()], [
    { '키(수익률연동키)': 'KOSPI', '종목명': 'KOSPI (국내 대표지수)', '적용 종목': '360750.KS' },
    { '키(수익률연동키)': 'NASDAQ', '종목명': 'NASDAQ', '적용 종목': '360750' }
  ]);
  await uploadWorkbook(page, conflict);
  await expect.poll(() => dialogs.length).toBe(3);
  expect(dialogs[2]).toContain('여러 기준');
  expect(await readMaster(page), '충돌 종목은 반영하지 않는다').toEqual({ 'NAME:국고채A': 'BOND' });
});

test('X-3. 전체 왕복: 종목 기준 · 사전 · 사용자 지정 · 역할 · 종목 포지션 보존 · 빈 역할은 종목 포지션을 지우지 않음 · 역할 충돌 알림', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await boot(page, () => {
    const roles = ASSET_ROLE_OPTIONS.map((o) => o.value);
    state.assets = [
      makeAsset({ ticker: '278530.KS', name: 'KODEX 200TR', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 10000, currentPrice: 10000, role: roles[0] }),
      makeAsset({ ticker: '069500.KS', name: 'KODEX 200', owner: '신랑', accountType: 'ISA', quantity: 10, buyPrice: 40000, currentPrice: 40000, rateMatchOverride: 'KOSPI', role: roles[1] }),
      makeAsset({ ticker: '360750.KS', name: 'TIGER 미국S&P500', owner: '와이프', accountType: '일반계좌', quantity: 10, buyPrice: 20000, currentPrice: 20000 })
    ];
    state.assets[2].role = undefined;
    state.projection.customScenarioRates = { E92_KEY: { label: 'E92 기준', conservative: 2, normal: 4, optimistic: 6, keywords: ['E92키워드'] } };
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI', '360750.KS': 'E92_KEY' };
    state.tickerRoles = { '360750.KS': roles[2] };
    persistAssets(); persistProjection(); persistTickerRoles();
  });
  const roles = await page.evaluate(() => ASSET_ROLE_OPTIONS.map((o) => o.value));
  const before = { master: await readMaster(page), rates: await readRates(page) };
  const { base64 } = await exportWorkbook(page);

  await page.evaluate((keepRole) => {
    state.projection.instrumentReturnKeys = {}; state.projection.customScenarioRates = {};
    state.tickerRoles = { '360750.KS': keepRole };
    persistProjection(); persistTickerRoles();
  }, roles[2]);
  await uploadWorkbook(page, base64, 'overwrite');
  await expect.poll(() => dialogs.filter((m) => m.includes('불러왔습니다')).length).toBe(1);
  expect(await readMaster(page)).toEqual(before.master);
  expect(await readRates(page)).toEqual(before.rates);
  expect((await assetView(page, "a.name === 'KODEX 200'")).override).toBe('KOSPI');
  expect((await assetView(page, "a.name === 'KODEX 200TR'")).role).toBe(roles[0]);
  expect((await assetView(page, "a.name === 'KODEX 200'")).role).toBe(roles[1]);
  const registry = await readJson(page, 'state.tickerRoles');
  expect(registry['278530.KS']).toBe(roles[0]);
  expect(registry['069500.KS']).toBe(roles[1]);
  expect(registry['360750.KS'], '빈 역할 칸은 종목 포지션을 지우지 않는다').toBe(roles[2]);

  const roleConflict = await buildWorkbook(page, [
    ASSET_ROW({ ticker: '005930', '종목명': '삼성전자', '역할(포지션)': roles[0] }),
    ASSET_ROW({ ticker: '005930', '종목명': '삼성전자', '계좌구분': 'ISA', '역할(포지션)': roles[1] })
  ], null);
  await uploadWorkbook(page, roleConflict);
  await expect.poll(() => dialogs.length).toBeGreaterThan(2);
  expect(dialogs[dialogs.length - 1]).toContain('역할이 서로 달라');
  expect((await readJson(page, 'state.tickerRoles'))['005930.KS']).toBeUndefined();
  expect(await readMaster(page), '2시트가 없는 파일은 종목 기준을 바꾸지 않는다').toEqual(before.master);
});

/* ── P. 수익률 관리 팝업 ──────────────────────────────────────────────── */

test('P-1. 수익률 관리 적용 종목: 무수정 저장 유지 · 추가 · 제거 · 중복 차단 · 기본값 초기화 후 유지 · 행 삭제 = 연결 해제', async ({ page }) => {
  const dialogs = collectDialogs(page);
  await boot(page, () => {
    state.assets = [makeAsset({ ticker: '069500', name: 'KODEX 200', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 40000, currentPrice: 40000 })];
    state.projection.customScenarioRates = { E92_KEY: { label: 'E92 기준', normal: 6 } };
    state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
    persistAssets(); persistProjection();
  });
  const open = async () => {
    await page.evaluate(() => openScenarioRateManagerModal());
    await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
  };
  const rowOf = async (key) => page.locator('#scenarioRateManagerList > div').nth(await page.evaluate((k) => scenarioRateManagerDraft.findIndex((r) => r.key === k), key));
  const instrumentInput = async (key) => (await rowOf(key)).locator('input[data-rate-field="instruments"]');
  const save = async () => {
    await page.locator('#saveScenarioRateManagerModalBtn').click();
    await expect(page.locator('#scenarioRateManagerModal')).toBeHidden();
  };
  const rates = await readRates(page);

  await open();
  await expect(await instrumentInput('KOSPI')).toHaveValue('278530.KS');
  await expect(await instrumentInput('E92_KEY')).toHaveValue('');
  await save();
  expect(await readMaster(page), '손대지 않은 저장은 연결을 바꾸지 않는다').toEqual({ '278530.KS': 'KOSPI' });
  expect(await readRates(page)).toEqual(rates);

  await open();
  await (await instrumentInput('E92_KEY')).fill('360750.KS');
  await save();
  expect(await readMaster(page)).toEqual({ '278530.KS': 'KOSPI', '360750.KS': 'E92_KEY' });

  await open();
  await (await instrumentInput('KOSPI')).fill('');
  await save();
  expect(await readMaster(page)).toEqual({ '360750.KS': 'E92_KEY' });

  await open();
  await (await instrumentInput('KOSPI')).fill('360750');
  await page.locator('#saveScenarioRateManagerModalBtn').click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('두 번 이상');
  await expect(page.locator('#scenarioRateManagerModal'), '중복이면 저장하지 않는다').toBeVisible();
  await page.locator('#cancelScenarioRateManagerModalBtn').click();
  expect(await readMaster(page)).toEqual({ '360750.KS': 'E92_KEY' });

  await page.evaluate(() => { state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI', '360750.KS': 'E92_KEY' }; persistProjection(); });
  await open();
  await page.locator('#scenarioRateResetDefaultsBtn').click();
  await save();
  expect(await readMaster(page), '기본값 초기화는 적용 종목을 지우지 않는다').toEqual({ '278530.KS': 'KOSPI', '360750.KS': 'E92_KEY' });

  await open();
  await (await rowOf('E92_KEY')).locator('.scenario-rate-remove-btn').click();
  await save();
  expect(await readMaster(page), '행 삭제는 그 기준의 연결을 해제한다').toEqual({ '278530.KS': 'KOSPI' });
});

/* ── M. Monte Carlo 결과 유효성 ───────────────────────────────────────── */

test('M-2. 종목 기준이 바뀌면 Monte Carlo 결과에 "다시 계산 필요"가 표시된다', async ({ page }) => {
  await seedPortfolio(page, { targets: [{ owner: '신랑', region: '국내', name: 'E92국내채권', pct: 100 }], assetValueEach: 100000000 });
  await goToProjectionTab(page);
  await page.locator('#mcIterationsSelect').selectOption('5000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 60000 });
  const notice = page.locator('#mcStaleNotice');
  await expect(notice).toBeHidden();
  await page.evaluate(() => {
    state.projection.instrumentReturnKeys = { 'NAME:E92국내채권': 'KOSPI' };
    persistProjection();
    updateProjection();
  });
  await expect(notice).toBeVisible();
  await page.evaluate(() => { state.projection.instrumentReturnKeys = {}; persistProjection(); updateProjection(); });
  await expect(notice).toBeHidden();
});

/* ── R. 모바일 우선 가독성 ─────────────────────────────────────────────── */

const isDark = (page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));
for (const [w, h, dark] of [[375, 812, true], [375, 812, false], [768, 1024, true], [1440, 900, false]]) {
  test(`R-${w} ${dark ? 'Dark' : 'Light'} - 적용 종목 입력 · 거래 종목 기준 안내 · 자산 상세 출처가 14px 이상이고 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page, () => {
      state.assets = [makeAsset({ ticker: '278530.KS', name: 'KODEX 200TR', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 10000, currentPrice: 10000 })];
      state.transactions = [];
      state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI', '360750.KS': 'KOSPI' };
      persistAssets(); persistTransactions(); persistProjection();
    });
    if ((await isDark(page)) !== dark) await page.locator('#darkModeBtn').click();
    expect(await isDark(page)).toBe(dark);

    await page.evaluate(() => openScenarioRateManagerModal());
    await expect(page.locator('#scenarioRateManagerModal')).toBeVisible();
    const modalCheck = await page.locator('#scenarioRateManagerModal').evaluate((modal) => {
      const win = modal.ownerDocument.defaultView;
      const els = [modal.querySelector('#scenarioRateInstrumentNote'), ...modal.querySelectorAll('input[data-rate-field="instruments"]')];
      return {
        count: modal.querySelectorAll('input[data-rate-field="instruments"]').length,
        smallFonts: els.filter((el) => el && parseFloat(win.getComputedStyle(el).fontSize) < 14).length,
        overflow: [...modal.querySelectorAll('*')].filter((el) => el.scrollWidth - el.clientWidth > 1 && win.getComputedStyle(el).overflowX === 'visible' && el.tagName !== 'INPUT').map((el) => el.id || el.tagName).slice(0, 5)
      };
    });
    expect(modalCheck.count).toBeGreaterThan(0);
    expect(modalCheck.smallFonts, '14px 미만').toBe(0);
    expect(modalCheck.overflow, '팝업 안 가로 넘침').toEqual([]);
    await page.locator('#cancelScenarioRateManagerModalBtn').click();

    await openTxFormWith(page, { owner: '와이프', name: 'TIGER 미국S&P500', ticker: '360750.KS' });
    const help = page.locator('#txRateMatchHelpText');
    await expect(help).toContainText('종목 기준');
    expect(await help.evaluate((el) => parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '거래 입력 가로 넘침').toBeLessThanOrEqual(w);
    await page.locator('#cancelTxModalBtn').click();

    const box = page.locator('#assetDetailReturnAssumption');
    const detail = await box.evaluate((el) => {
      openAssetDetailModal(state.assets[0].id);
      const win = el.ownerDocument.defaultView;
      return { text: el.innerText.replace(/\s+/g, ' '), small: [...el.querySelectorAll('p, span')].filter((x) => parseFloat(win.getComputedStyle(x).fontSize) < 14).length };
    });
    expect(detail.text).toContain('종목 기준');
    expect(detail.small).toBe(0);
    expect(await page.locator('body').evaluate((el) => el.scrollWidth), '자산 상세 가로 넘침').toBeLessThanOrEqual(w);
  });
}
