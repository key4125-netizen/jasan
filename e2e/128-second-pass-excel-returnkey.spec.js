// E2E-128 [PM 지시 2026-09-26 · 2차 전수 테스트 D · E] Excel 왕복과 Return Key 사용자 지정.
//
//  D. Excel Import / roundtrip - 내보내기 → 파일 저장 → 셀 수정 → 올리기(취소 · 덮어쓰기) →
//     다시 내보내기 → 왕복 비교. 정상 · 빈값 · 잘못된 Return Key · 중복 ticker ·
//     없는 ticker · 국내/해외 · 환헤지 · 채권 · 수량 0 케이스를 한 파일에 담는다.
//  E. Return Key override - 자동 매칭 확인 → 사용자 지정 → 저장 → 재진입 → Risk/MC 영향 →
//     Excel export → override 제거 → 자동 매칭 복귀.
//
// 파일은 앱이 실제로 만든 것을 그대로 받아(download 이벤트) 디스크에서 읽고, 셀을 고친 뒤
// 실제 <input type=file>에 다시 올린다 - 가짜 파일을 만들어 올리는 것이 아니다.
// 셀 수정은 페이지 안의 XLSX(앱이 쓰는 그 라이브러리)로 하고, 새 의존성을 추가하지 않는다.
// 전부 합성 데이터(ZZ 접두어)이며 외부 네트워크를 쓰지 않는다.
/* global XLSX, document */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof XLSX !== 'undefined' && !!XLSX.utils);
  await page.evaluate(() => { localStorage.clear(); });
  await page.waitForTimeout(200);
}

/* 합성 Household - Excel 왕복이 건드릴 모든 성질을 한 벌에 담는다. */
const seed = (page) => page.evaluate(() => {
  state.assets = [
    makeAsset({ id: 'zz-x1', name: 'ZZ국내주식', ticker: 'ZZ0001.KS', category: '주식', categorySource: 'user',
      owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
      quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'manual' }),
    makeAsset({ id: 'zz-x2', name: 'ZZ해외ETF', ticker: 'ZZ0002', category: 'ETF', categorySource: 'user',
      owner: '신랑', accountType: 'ISA', isDomestic: '해외', currency: 'USD',
      quantity: 5, buyPrice: 100, buyRate: 1300, currentPrice: 110, positionSource: 'manual' }),
    makeAsset({ id: 'zz-x3', name: 'ZZ원화채권', ticker: 'KR1035021DC0', category: '채권', categorySource: 'user',
      owner: '와이프', accountType: '연금저축', isDomestic: '국내', currency: 'KRW',
      quantity: 200, buyPrice: 10000, currentPrice: 10100, positionSource: 'manual' }),
    makeAsset({ id: 'zz-x4', name: 'ZZ수량0자산', ticker: 'ZZ0004.KS', category: '주식', categorySource: 'user',
      owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
      quantity: 0, buyPrice: 5000, currentPrice: 5500, positionSource: 'manual' })
  ];
  state.bondPositions = [makeBondPosition({
    assetId: 'zz-x3', identity: { isin: 'KR1035021DC0', bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2029-12-01', couponRate: 3.5, paymentFrequency: 2 }
  })];
  state.transactions = [];
  persistAssets(true); persistBondPositions(); persistTransactions();
  renderAll();
});

// 앱의 [엑셀 내보내기]를 실제로 눌러 파일을 받는다. 반환: 디스크 경로.
async function exportExcel(page, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jasan-e128-'));
  // 내보내기 버튼은 「데이터 관리」 팝업 안에 있다 - 실제 사용자 경로로 누른다.
  if (await page.locator('#systemManagementModal').isHidden()) await page.locator('#systemManagementBtn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  await page.locator('#closeSystemManagementModalBtn').click();
  const file = path.join(dir, `${tag}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  return file;
}

// 디스크의 xlsx를 페이지 안 XLSX로 읽어 자산목록 시트를 행 배열로 돌려준다.
async function readSheet(page, file, sheetName) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(({ b64, sheetName }) => {
    const wb = XLSX.read(b64, { type: 'base64' });
    const name = wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
    return { sheets: wb.SheetNames, rows: XLSX.utils.sheet_to_json(wb.Sheets[name]) };
  }, { b64, sheetName });
}

/* 디스크의 xlsx를 읽어 자산목록 시트를 mutate 함수로 고친 뒤, 올릴 버퍼(base64)를 돌려준다.
 * mutate는 페이지 안에서 실행되는 순수 함수 본문 문자열이다(rows를 받아 rows를 돌려준다). */
async function editExcel(page, file, mutateBody) {
  const b64 = fs.readFileSync(file).toString('base64');
  const out = await page.evaluate(({ b64, mutateBody }) => {
    const wb = XLSX.read(b64, { type: 'base64' });
    const assetSheet = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[assetSheet]);

    const mutate = new Function('rows', mutateBody);
    const next = mutate(rows) || rows;
    wb.Sheets[assetSheet] = XLSX.utils.json_to_sheet(next);
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, { b64, mutateBody });
  return Buffer.from(out, 'base64');
}

async function uploadExcel(page, buffer) {
  await page.locator('#excelFileInput').setInputFiles({
    name: 'zz-edited.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  });
}

const assetSnapshot = (page) => page.evaluate(() => state.assets
  .slice()
  .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  .map((a) => ({
    id: a.id, name: a.name, ticker: a.ticker, owner: a.owner, accountType: a.accountType,
    category: a.category, isDomestic: a.isDomestic, currency: a.currency,
    quantity: num(a.quantity), buyPrice: num(a.buyPrice), currentPrice: num(a.currentPrice),
    buyRate: a.buyRate === undefined ? null : num(a.buyRate),
    rateMatchOverride: a.rateMatchOverride || null,
    fxHedgeStatus: a.fxHedgeStatus || null,
    marketBetaIndexOverride: a.marketBetaIndexOverride || null
  })));

/* ══════════════ D. Excel 왕복 ══════════════ */

test('D-1. 내보낸 파일에 두 시트와 필요한 칸이 모두 있고, 수량 0 자산도 포함된다', async ({ page }) => {
  await open(page);
  await seed(page);
  const file = await exportExcel(page, 'base');
  const { sheets, rows } = await readSheet(page, file, '자산목록');
  expect(sheets, '자산목록 · 수익률 관리 기준 두 시트').toEqual(expect.arrayContaining(['자산목록', '수익률 관리 기준']));
  expect(rows.length, '자산 4건이 모두 나온다(수량 0 포함 - 백업 목적)').toBe(4);
  const header = Object.keys(rows[0]);
  ['id', '대표매칭(수익률연동키)', '환헤지(사용자확인)', '시장민감도 기준지수(사용자확인)', '수익률 기준 출처']
    .forEach((h) => expect(header.concat(Object.keys(rows[1]), Object.keys(rows[2])), h).toContain(h));
  expect(rows.some((r) => String(r['종목명']) === 'ZZ수량0자산'), '수량 0 자산이 빠지지 않는다').toBe(true);
});

test('D-2. 아무것도 고치지 않고 왕복하면 자산이 그대로다(roundtrip 무손실)', async ({ page }) => {
  await open(page);
  await seed(page);
  const before = await assetSnapshot(page);
  const file = await exportExcel(page, 'rt');
  const buf = await editExcel(page, file, 'return rows;'); // 고치지 않는다
  page.once('dialog', (d) => d.accept()); // 덮어쓰기 경로의 확인
  await uploadExcel(page, buf);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const after = await assetSnapshot(page);
  expect(after, '한 건도 늘거나 줄지 않고 값도 같다').toEqual(before);
});

test('D-3. 올리기를 취소하면 기존 데이터가 하나도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  await seed(page);
  const before = await assetSnapshot(page);
  const file = await exportExcel(page, 'cancel');
  const buf = await editExcel(page, file, "rows.forEach((r) => { r['수량'] = 999; }); return rows;");
  await uploadExcel(page, buf);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceCancelBtn').click();
  await expect(page.locator('#importChoiceModal')).toBeHidden();
  await page.waitForTimeout(300);
  expect(await assetSnapshot(page), '취소 - 수량 999가 반영되지 않는다').toEqual(before);
});

test('D-4. 수량 · 국내/해외 · 환헤지 · 대표매칭을 고쳐 올리면 그대로 반영된다', async ({ page }) => {
  await open(page);
  await seed(page);
  const file = await exportExcel(page, 'edit');
  const buf = await editExcel(page, file, `
    rows.forEach((r) => {
      if (r['종목명'] === 'ZZ국내주식') { r['수량'] = 150; r['대표매칭(수익률연동키)'] = 'KOSPI'; }
      if (r['종목명'] === 'ZZ해외ETF') { r['국내/해외'] = '해외'; r['환헤지(사용자확인)'] = 'UNHEDGED'; r['시장민감도 기준지수(사용자확인)'] = 'SP500'; }
    });
    return rows;`);
  page.once('dialog', (d) => d.accept());
  await uploadExcel(page, buf);
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const after = await assetSnapshot(page);
  const kr = after.find((a) => a.name === 'ZZ국내주식');
  const us = after.find((a) => a.name === 'ZZ해외ETF');
  expect(kr.quantity, '수량 변경 반영').toBe(150);
  expect(kr.rateMatchOverride, '대표매칭 사용자 지정 반영').toBe('KOSPI');
  expect(us.isDomestic).toBe('해외');
  expect(us.fxHedgeStatus, '환헤지 사용자 확정 반영').toBe('UNHEDGED');
  expect(us.marketBetaIndexOverride).toBe('SP500');
  expect(after.length, '자산 건수는 그대로다').toBe(4);
});

test('D-5. 알아볼 수 없는 Return Key · 빈 칸 · 없는 ticker를 넣어도 조용히 다른 값으로 바뀌지 않는다', async ({ page }) => {
  await open(page);
  await seed(page);
  const file = await exportExcel(page, 'invalid');
  const buf = await editExcel(page, file, `
    rows.forEach((r) => {
      if (r['종목명'] === 'ZZ국내주식') r['대표매칭(수익률연동키)'] = 'ZZ존재하지않는키';
      if (r['종목명'] === 'ZZ해외ETF') { r['대표매칭(수익률연동키)'] = ''; r['환헤지(사용자확인)'] = 'ZZ아무값'; }
      if (r['종목명'] === 'ZZ원화채권') r['ticker'] = 'ZZ존재하지않는티커';
    });
    return rows;`);
  page.once('dialog', (d) => d.accept());
  await uploadExcel(page, buf);
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const after = await assetSnapshot(page);
  const kr = after.find((a) => a.name === 'ZZ국내주식');
  const us = after.find((a) => a.name === 'ZZ해외ETF');
  // 알아볼 수 없는 키는 그대로 저장되지만 계산에서는 "가정 없음"으로 다뤄진다(지역 폴백 폐지 · Phase 47-A).
  const applied = await page.evaluate((id) => {
    const a = state.assets.find((x) => x.id === id);
    const d = resolveAssetGroupKeyDetail(a);
    return { key: d.key, source: d.source, rate: resolveProjectionRateForKey(d.key, 'normal', false) };
  }, kr.id);
  expect(applied.source, '사용자가 적은 값은 존중한다').toBe('override');
  expect(applied.rate, '그러나 알아볼 수 없는 키에는 수익률을 만들어 주지 않는다').toBe(0);
  expect(us.rateMatchOverride, '빈 칸은 "지정 안 함"이다').toBeNull();
  expect(us.fxHedgeStatus, '지원하지 않는 환헤지 값은 저장하지 않는다').toBeNull();
  const bond = after.find((a) => a.name === 'ZZ원화채권');
  expect(bond.ticker, '사용자가 적은 티커는 그대로 저장된다').toBe('ZZ존재하지않는티커');
  expect(await page.evaluate(() => state.assets.length)).toBe(4);
});

test('D-6. 같은 id가 두 번 나오면 뒤 행에 새 id를 주어 서로 덮어쓰지 않게 한다', async ({ page }) => {
  await open(page);
  await seed(page);
  const file = await exportExcel(page, 'dup');
  const buf = await editExcel(page, file, `
    const first = rows.find((r) => r['종목명'] === 'ZZ국내주식');
    const clone = Object.assign({}, first, { '종목명': 'ZZ국내주식복사', '수량': 7 });
    rows.push(clone);
    return rows;`);
  page.once('dialog', (d) => d.accept());
  await uploadExcel(page, buf);
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const ids = await page.evaluate(() => state.assets.map((a) => a.id));
  expect(ids.length, '5건이 되고').toBe(5);
  expect(new Set(ids).size, 'id가 서로 겹치지 않는다').toBe(5);
  const copy = await page.evaluate(() => state.assets.find((a) => a.name === 'ZZ국내주식복사'));
  expect(copy && copy.quantity).toBe(7);
});

test('D-7. 채권 자산을 왕복해도 채권 레코드(만기 · 쿠폰)가 살아 있다', async ({ page }) => {
  await open(page);
  await seed(page);
  const file = await exportExcel(page, 'bond');
  const buf = await editExcel(page, file, 'return rows;');
  page.once('dialog', (d) => d.accept());
  await uploadExcel(page, buf);
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const bonds = await page.evaluate(() => (state.bondPositions || []).map((p) => ({
    assetId: p.assetId, isin: p.identity.isin, bondType: p.identity.bondType,
    maturity: p.terms.maturityDate, coupon: p.terms.couponRate
  })));
  expect(bonds.length, '엑셀은 채권 레코드를 담지 않지만 기존 레코드를 지우지도 않는다').toBe(1);
  expect(bonds[0]).toEqual({ assetId: 'zz-x3', isin: 'KR1035021DC0', bondType: '국채', maturity: '2029-12-01', coupon: 3.5 });
});

/* ══════════════ E. Return Key 사용자 지정 ══════════════ */

const keyDetail = (page, id) => page.evaluate((assetId) => {
  const a = state.assets.find((x) => x.id === assetId);
  const d = resolveAssetGroupKeyDetail(a);
  return { key: d.key, source: d.source, mc: resolveMcAppAssetClass({ key: d.key, source: d.source, subject: a }).appClass };
}, id);

test('E-1. 자동 매칭 → 사용자 지정 → 저장 → 재진입 → 제거 → 자동 복귀', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ id: 'zz-e1', name: 'KODEX 200', ticker: '069500.KS', category: 'ETF',
      categorySource: 'user', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
      quantity: 10, buyPrice: 10000, currentPrice: 11000, positionSource: 'manual' })];
    state.transactions = []; state.bondPositions = [];
    persistAssets(true); persistTransactions(); persistBondPositions(); renderAll();
  });
  // ① 자동 매칭 - 지정한 것이 없어도 자산 성격으로 KOSPI가 붙는다.
  expect(await keyDetail(page, 'zz-e1')).toEqual({ key: 'KOSPI', source: 'assetCharacter', mc: 'KR_EQUITY' });

  // ② 사용자 지정 - 거래 입력 폼의 「장기 수익률 기준」이 실제 입력 경로다.
  await page.locator('.tab-btn[data-tab="transactions"]').click();
  await page.locator('#addTransactionBtn').click();
  await page.evaluate(() => {
    document.getElementById('tx_date').value = '2026-09-10';
    document.getElementById('tx_type').value = 'buy';
    document.getElementById('tx_owner').value = '신랑';
    document.getElementById('tx_accountType').value = '일반계좌';
    document.getElementById('tx_ticker').value = '069500.KS';
    document.getElementById('tx_name').value = 'KODEX 200';
    document.getElementById('tx_assetClass').value = 'ETF';
    document.getElementById('tx_currency').value = 'KRW';
    document.getElementById('tx_quantity').value = '1';
    document.getElementById('tx_price').value = '10000';
    ensureRateMatchOption('S&P500');
    document.getElementById('tx_rateMatchOverride').value = 'S&P500';
  });
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toBeHidden();

  // ③ 저장 확인 - 사용자 지정이 자동 매칭을 이긴다.
  const afterSet = await page.evaluate(() => {
    const a = state.assets.find((x) => x.ticker === '069500.KS');
    const d = resolveAssetGroupKeyDetail(a);
    return { override: a.rateMatchOverride || null, key: d.key, source: d.source,
      mc: resolveMcAppAssetClass({ key: d.key, source: d.source, subject: a }).appClass };
  });
  expect(afterSet.override).toBe('S&P500');
  expect(afterSet.source, '사용자 지정이 1순위다').toBe('override');
  expect(afterSet.key).toBe('S&P500');
  expect(afterSet.mc, 'MC 자산군도 그 기준의 성격을 따른다').toBe('US_EQUITY');

  // ④ 화면 재진입 후에도 유지된다(새로고침 = localStorage에서 다시 읽는다).
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.assets.length > 0);
  const reloaded = await page.evaluate(() => (state.assets.find((x) => x.ticker === '069500.KS') || {}).rateMatchOverride || null);
  expect(reloaded, '재진입 후에도 사용자 지정이 남아 있다').toBe('S&P500');

  // ⑤ Excel 내보내기 - 사용자 지정 원본만 찍힌다(자동 판별 결과를 찍어 굳히지 않는다).
  const file = await exportExcel(page, 'override');
  const { rows } = await readSheet(page, file, '자산목록');
  const row = rows.find((r) => String(r['종목명']) === 'KODEX 200');
  expect(String(row['대표매칭(수익률연동키)'])).toBe('S&P500');
  expect(String(row['수익률 기준 출처']), '출처도 사용자 지정으로 적힌다').toContain('사용자 지정');

  // ⑥ 제거 → 자동 매칭 복귀.
  await page.evaluate(() => {
    const a = state.assets.find((x) => x.ticker === '069500.KS');
    delete a.rateMatchOverride;
    a.updatedAt = Date.now();
    persistAssets();
    renderAll();
  });
  const back = await page.evaluate(() => {
    const a = state.assets.find((x) => x.ticker === '069500.KS');
    const d = resolveAssetGroupKeyDetail(a);
    return { key: d.key, source: d.source };
  });
  expect(back, '지우면 자동 판별로 돌아간다').toEqual({ key: 'KOSPI', source: 'assetCharacter' });
});

test('E-2. 사용자 지정은 Excel 왕복에서도 살아남고, 자동 판별은 지정으로 굳지 않는다', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ id: 'zz-e2a', name: 'KODEX 200', ticker: '069500.KS', category: 'ETF', categorySource: 'user',
        owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
        quantity: 10, buyPrice: 10000, currentPrice: 11000, positionSource: 'manual' }),
      makeAsset({ id: 'zz-e2b', name: 'ZZ지정자산', ticker: 'ZZ0009.KS', category: 'ETF', categorySource: 'user',
        owner: '신랑', accountType: '일반계좌', isDomestic: '국내', currency: 'KRW',
        quantity: 10, buyPrice: 1000, currentPrice: 1100, positionSource: 'manual', rateMatchOverride: 'KOSPI' })
    ];
    state.transactions = []; state.bondPositions = [];
    persistAssets(true); persistTransactions(); persistBondPositions(); renderAll();
  });
  const file = await exportExcel(page, 'freeze');
  const buf = await editExcel(page, file, 'return rows;');
  page.once('dialog', (d) => d.accept());
  await uploadExcel(page, buf);
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => state.assets.map((a) => ({
    name: a.name, override: a.rateMatchOverride || null,
    source: resolveAssetGroupKeyDetail(a).source
  })).sort((x, y) => x.name.localeCompare(y.name)));
  expect(after).toEqual([
    { name: 'KODEX 200', override: null, source: 'assetCharacter' },
    { name: 'ZZ지정자산', override: 'KOSPI', source: 'override' }
  ]);
});
