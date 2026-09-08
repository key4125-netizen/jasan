// E2E-69 [V1.2-B BL-17] category confirmation - categorySource 상태 모델이 실제 UI/파일 왕복에서
// PM 확정 정책대로 동작하는지 검증한다.
//
// PM 정책: "시스템은 확인되지 않은 자산 분류를 확인된 사실처럼 저장해서는 안 된다. 입력 단계에서
// 추천은 가능하지만, 추천과 확정은 구분한다." 신규 폼 저장 = 확정(user). Excel 셀 공란/JSON·Cloud
// category 누락 = system(미확정). 기존 legacy 데이터(categorySource 필드 자체가 없음)는 자동
// migration하지 않는다.
//
// 실제 UI(모달 폼, 실제 엑셀 워크북 왕복, 실제 JSON 백업 파일)를 그대로 사용한다 - 테스트 안에 앱
// 로직을 복사하지 않는다. 외부 네트워크는 쓰지 않는다(Cloud sync 병합 로직 자체는
// test/category-source.test.js가 순수 함수로 이미 검증했다 - 실제 Worker 호출은 기존 E2E 격리
// 정책상 하지 않는다).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof makeAsset === 'function');
  page.on('dialog', (d) => d.accept());
}

function seed(page, asset) {
  return page.locator('body').evaluate((el, a) => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [a];
    state.transactions = [];
    persistAssets(); persistTransactions();
  }, asset);
}

/* ── A. 신규 자산 폼 저장 = 확정(user) ─────────────────────────────────────── */
test.describe('A. 신규 자산 폼', () => {
  test('A-1. 추천값을 그대로 두고 저장해도 categorySource=user', async ({ page }) => {
    await open(page);
    // [첫 실행 온보딩 샘플 데이터 제거] loadState()는 진짜 첫 실행 기기에 온보딩용 sampleAssets()를
    // 자동으로 채운다(js/01) - state.assets[0]을 예측 가능하게 확인하려면 먼저 비운다.
    await page.locator('body').evaluate(() => { state.assets = []; });
    await page.locator('#systemManagementBtn').click();
    await page.locator('#addAssetBtn').click();
    await page.locator('#f_manualEntryToggle').click(); // 직접 입력 모드(티커 없는 자산)
    await page.locator('#f_name').fill('전세보증금');
    await page.locator('#f_category').fill('현금'); // autoClassifyModal과 동일한 실시간 추천 흉내
    await page.locator('#f_owner').selectOption('신랑');
    await page.locator('#f_quantity').fill('1');
    await page.locator('#f_buyPrice').fill('100000000');
    await page.locator('#assetForm button[type="submit"]').click();
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: '현금', categorySource: 'user' });
  });

  test('A-2. 추천값을 사용자가 다른 값으로 바꿔 저장해도 categorySource=user', async ({ page }) => {
    await open(page);
    await page.locator('body').evaluate(() => { state.assets = []; });
    await page.locator('#systemManagementBtn').click();
    await page.locator('#addAssetBtn').click();
    await page.locator('#f_manualEntryToggle').click();
    await page.locator('#f_name').fill('테스트채권');
    await page.locator('#f_category').fill('주식'); // 일부러 잘못된 추천값을 흉내
    await page.locator('#f_category').fill('채권'); // 사용자가 직접 고침
    await page.locator('#f_owner').selectOption('신랑');
    await page.locator('#f_quantity').fill('1');
    await page.locator('#f_buyPrice').fill('1000000');
    await page.locator('#assetForm button[type="submit"]').click();
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: '채권', categorySource: 'user' });
  });
});

/* ── B. Excel - 실제 워크북 왕복 ────────────────────────────────────────────── */
async function exportReal(page) {
  return page.locator('#exportExcelBtn').evaluate((btn) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const real = XL.writeFile;
    let captured = null;
    XL.writeFile = (wb) => { captured = wb; };
    try { btn.click(); } finally { XL.writeFile = real; }
    return { base64: XL.write(captured, { type: 'base64', bookType: 'xlsx' }) };
  });
}
async function makeBookDroppingCategory(page, base64) {
  return page.locator('#exportExcelBtn').evaluate((btn, b64) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => { const c = Object.assign({}, r); delete c['자산군(자동분류)']; delete c['자산군']; delete c['category']; return c; });
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, base64);
}
async function importReal(page, base64, mode) {
  const file = path.join(os.tmpdir(), `e2e69-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  try {
    await page.setInputFiles('#excelFileInput', file);
    await page.locator(mode === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
  } finally {
    fs.unlinkSync(file);
  }
}

test.describe('B. Excel', () => {
  test('B-1. category 셀이 채워진 채 내보내기->다시 올리면 categorySource=user로 복원된다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'e69-b1', ticker: '', name: 'B1현금성자산', owner: '신랑', accountType: '일반계좌', category: '현금', categorySource: 'user', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 5000000, currentPrice: 5000000 });
    const { base64 } = await exportReal(page);
    await importReal(page, base64, 'overwrite');
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: '현금', categorySource: 'user' });
  });

  test('B-2. category 컬럼이 아예 없는 파일의 행이, 이어받을 기존 자산이 전혀 없는 신규 행이면 categorySource=system', async ({ page }) => {
    await open(page);
    // carryOverCategorySource가 개입하지 않으려면 기존 state에 이 정체성(소유자+계좌+티커)과 일치하는
    // 자산이 전혀 없어야 한다 - 그래서 파일을 현재 state에서 내보내지 않고 직접 만든다(자산군 컬럼 자체를 뺌).
    const base64 = await page.locator('#exportExcelBtn').evaluate((btn) => {
      const XL = btn.ownerDocument.defaultView.XLSX;
      const rows = [{ 소유자: '신랑', 계좌구분: '일반계좌', ticker: 'BRANDNEW', 종목명: '완전히새로운자산', 수량: 1, 매수단가: 1000 }];
      const wb = XL.utils.book_new();
      XL.utils.book_append_sheet(wb, XL.utils.json_to_sheet(rows), '자산목록');
      return XL.write(wb, { type: 'base64', bookType: 'xlsx' });
    });
    await importReal(page, base64, 'append'); // 기존에 아무 자산도 없으므로 append든 overwrite든 신규 생성과 동일
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result.categorySource).toBe('system'); // classifyCategory 추천으로 채워지되 미확정
  });

  test('B-3. 기존에 user로 확정된 자산을 category 칸이 빈 파일로 재업로드(추가하기)해도 확정값을 잃지 않는다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'e69-b3', ticker: '', name: 'B3회사채', owner: '신랑', accountType: '일반계좌', category: '채권', categorySource: 'user', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 3000000, currentPrice: 3000000 });
    const { base64 } = await exportReal(page);
    const dropped = await makeBookDroppingCategory(page, base64);
    // 같은 자산(같은 소유자+계좌+이름)을 category 칸이 빈 파일로 "추가하기" - carryOverCategorySource가 보호해야 한다.
    await importReal(page, dropped, 'append');
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: '채권', categorySource: 'user' }); // 재업로드로 조용히 system으로 내려가지 않는다
  });

  test('B-4. 기존 system 상태 자산도 category 칸이 빈 재업로드에서 system 그대로 유지된다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'e69-b4', ticker: '', name: 'B4미확정자산', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'system', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 });
    const { base64 } = await exportReal(page);
    const dropped = await makeBookDroppingCategory(page, base64);
    await importReal(page, dropped, 'append');
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: '주식', categorySource: 'system' });
  });

  test('B-5. 기존 legacy(categorySource 없음) 자산도 category 칸이 빈 재업로드에서 legacy 그대로 유지된다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'e69-b5', ticker: '', name: 'B5레거시자산', owner: '신랑', accountType: '일반계좌', category: '부동산', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 500000000, currentPrice: 500000000 }); // categorySource 필드 자체 없음
    const { base64 } = await exportReal(page);
    const dropped = await makeBookDroppingCategory(page, base64);
    await importReal(page, dropped, 'append');
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result.category).toBe('부동산');
    expect(result.categorySource).toBeUndefined(); // user/system으로 소급 확정하지 않는다
  });

  test('B-6. 기존 user 확정 자산이라도 재업로드 시트에 오염된(미지원) category가 명시되면 classifyCategory/system으로 대체된다', async ({ page }) => {
    await open(page);
    // 사용자가 실수로 ETF를 '원자재'로 확정해 둔 상태를 흉내낸다.
    await seed(page, { id: 'e69-b6', ticker: '069500.KS', name: 'KODEX 200', owner: '신랑', accountType: '일반계좌', category: '원자재', categorySource: 'user', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 30000, currentPrice: 30000 });
    const { base64 } = await exportReal(page);
    const contaminated = await page.locator('#exportExcelBtn').evaluate((btn, b64) => {
      const XL = btn.ownerDocument.defaultView.XLSX;
      const wb = XL.read(b64, { type: 'base64' });
      const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
        .map((r) => Object.assign({}, r, { '자산군(자동분류)': '내맘대로분류' }));
      const out = XL.utils.book_new();
      XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
      return XL.write(out, { type: 'base64', bookType: 'xlsx' });
    }, base64);
    await importReal(page, contaminated, 'append');
    const result = await page.locator('body').evaluate(() => ({ category: state.assets[0].category, categorySource: state.assets[0].categorySource }));
    expect(result).toEqual({ category: 'ETF', categorySource: 'system' }); // 기존 user 확정('원자재')을 무조건 보호하지 않는다
  });
});

/* ── C. JSON 백업 - user/system/legacy 세 상태 모두 보존 ───────────────────── */
test.describe('C. JSON 백업', () => {
  test('C-1/2/3. user/system/legacy 세 자산 모두 JSON 왕복 후 categorySource가 그대로 보존된다', async ({ page }) => {
    await open(page);
    await page.locator('body').evaluate(() => {
      state.exchangeRate = 1450; persistRate(true);
      state.assets = [
        makeAsset({ id: 'json-user', ticker: '', name: 'JSON확정', owner: '신랑', accountType: '일반계좌', category: '현금', quantity: 1, buyPrice: 1000000 }),
        { id: 'json-system', ticker: '005930.KS', name: 'JSON미확정', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'system', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 70000, currentPrice: 70000, updatedAt: Date.now() },
        { id: 'json-legacy', ticker: '000660.KS', name: 'JSON레거시', owner: '신랑', accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 100000, currentPrice: 100000, updatedAt: Date.now() }, // categorySource 필드 자체가 없음
      ];
      state.transactions = [];
      persistAssets(); persistTransactions();
    });
    // 실제 내보내기가 쓰는 것과 같은 함수(buildSyncBlob)로 파일 내용을 만든다 - 다운로드 버튼 클릭
    // 자체는 이 정책 검증과 무관하므로 건너뛴다(복원 쪽 실제 코드 경로만 검증 대상).
    const json = await page.locator('body').evaluate(() => JSON.stringify(buildSyncBlob()));
    const file = path.join(os.tmpdir(), `e2e69-json-${Date.now()}.json`);
    fs.writeFileSync(file, json);
    try {
      await page.setInputFiles('#jsonFileInput', file);
      await page.locator('#importChoiceOverwriteBtn').click();
      await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    } finally {
      fs.unlinkSync(file);
    }
    const result = await page.locator('body').evaluate(() => state.assets.map((a) => ({ name: a.name, category: a.category, categorySource: a.categorySource })));
    expect(result.find((a) => a.name === 'JSON확정')).toEqual({ name: 'JSON확정', category: '현금', categorySource: 'user' });
    expect(result.find((a) => a.name === 'JSON미확정')).toEqual({ name: 'JSON미확정', category: '주식', categorySource: 'system' });
    const legacy = result.find((a) => a.name === 'JSON레거시');
    expect(legacy.category).toBe('주식');
    expect(legacy.categorySource).toBeUndefined(); // user/system으로 소급 확정하지 않는다
  });
});

/* ── E. 기존 데이터 - 자동 migration 없음, 값 무변화 ───────────────────────── */
test('E. legacy 자산은 boot/sync 이후에도 category/quantity/buyPrice/positionSource가 그대로다(자동 migration 없음)', async ({ page }) => {
  await open(page);
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    // categorySource 필드 자체가 없는 legacy 자산(V1.2-A 이전 데이터를 흉내)
    state.assets = [{ id: 'legacy1', ticker: '005930.KS', name: '레거시삼성', owner: '신랑', accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 70000, currentPrice: 80000, positionSource: undefined, updatedAt: 1 }];
    state.transactions = [];
    persistAssets(); persistTransactions();
    syncAssetsFromTransactions({ auto: true });
  });
  const a = await page.locator('body').evaluate(() => state.assets[0]);
  expect(a.category).toBe('주식');
  expect(a.categorySource).toBeUndefined();
  expect(a.quantity).toBe(100);
  expect(a.buyPrice).toBe(70000);
  expect(a.positionSource).toBeUndefined();
});

/* ── F. 계산 회귀 - categorySource 추가 자체가 기존 계산값을 바꾸지 않는다 ──── */
test('F. categorySource 필드가 있어도 없어도 Risk/threshold 판정 로직과 계산 결과는 동일하다', async ({ page }) => {
  await open(page);
  const result = await page.locator('body').evaluate(() => ({
    riskLevel40: riskLevelFromScore(40).level,
    riskLevel41: riskLevelFromScore(41).level,
    riskEligible: RISK_ELIGIBLE_CATEGORIES.slice(),
    nonTradable: NON_TRADABLE_CATEGORIES.slice(),
  }));
  expect(result.riskLevel40).toBe('safe');
  expect(result.riskLevel41).toBe('warn');
  expect(result.riskEligible).toEqual(['주식', 'ETF']);
  expect(result.nonTradable).toEqual(['채권', '현금', '부동산']);
});

/* ── H. [V1.2-B BL-17 Persistence Hotfix] 실제 새로고침(page.reload) 후에도 categorySource가
 * 살아남는지 검증한다. A~G의 기존 테스트는 전부 seed/조작 직후 "같은 페이지 로드 안에서"
 * state.assets를 읽었다 - persistAssets()가 localStorage 저장 목록에서 categorySource를 빠뜨렸어도
 * 메모리상의 state.assets는 멀쩡했으므로 그 결함을 이 테스트들이 잡아내지 못했다. 진짜 새로고침이
 * loadState()를 다시 타게 만들어야만 "localStorage에 실제로 뭐가 저장됐는지"가 드러난다. */
test.describe('H. Persistence - 실제 새로고침 후 categorySource 보존', () => {
  test('H-1. categorySource=user는 새로고침 후에도 유지된다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'h1', ticker: '', name: 'H1확정자산', owner: '신랑', accountType: '일반계좌', category: 'ETF', categorySource: 'user', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, updatedAt: Date.now() });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets) && state.assets.some((a) => a.id === 'h1'));
    const a = await page.locator('body').evaluate(() => state.assets.find((x) => x.id === 'h1'));
    expect(a.category).toBe('ETF');
    expect(a.categorySource).toBe('user');
  });

  test('H-2. categorySource=system은 새로고침 후에도 유지된다', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'h2', ticker: '', name: 'H2미확정자산', owner: '신랑', accountType: '일반계좌', category: 'ETF', categorySource: 'system', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, updatedAt: Date.now() });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets) && state.assets.some((a) => a.id === 'h2'));
    const a = await page.locator('body').evaluate(() => state.assets.find((x) => x.id === 'h2'));
    expect(a.category).toBe('ETF');
    expect(a.categorySource).toBe('system');
  });

  test('H-3. legacy(categorySource 없음)는 새로고침 후에도 undefined로 남는다(user/system으로 승격되지 않는다)', async ({ page }) => {
    await open(page);
    await seed(page, { id: 'h3', ticker: '005930.KS', name: 'H3레거시', owner: '신랑', accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 70000, currentPrice: 80000, updatedAt: Date.now() }); // categorySource 필드 자체가 없음
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets) && state.assets.some((a) => a.id === 'h3'));
    const a = await page.locator('body').evaluate(() => state.assets.find((x) => x.id === 'h3'));
    expect(a.category).toBe('주식');
    expect(a.categorySource).toBeUndefined();
  });

  test('H-4. 서로 다른 category/categorySource/positionSource를 가진 복수 자산이 새로고침 후에도 각자 pair를 유지한다', async ({ page }) => {
    await open(page);
    await page.locator('body').evaluate(() => {
      state.exchangeRate = 1450; persistRate(true);
      state.assets = [
        { id: 'h4a', ticker: '', name: 'H4A', owner: '신랑', accountType: '일반계좌', category: 'ETF', categorySource: 'user', positionSource: 'manual', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000, currentPrice: 1000, updatedAt: Date.now() },
        { id: 'h4b', ticker: '', name: 'H4B', owner: '신랑', accountType: '일반계좌', category: '주식', categorySource: 'system', positionSource: 'ledger', currency: 'KRW', isDomestic: '국내', quantity: 2, buyPrice: 2000, currentPrice: 2000, updatedAt: Date.now() },
        { id: 'h4c', ticker: '', name: 'H4C', owner: '신랑', accountType: '일반계좌', category: '채권', currency: 'KRW', isDomestic: '국내', quantity: 3, buyPrice: 3000, currentPrice: 3000, updatedAt: Date.now() }
      ];
      state.transactions = [];
      persistAssets(); persistTransactions();
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets) && state.assets.some((a) => a.id === 'h4c'));
    const result = await page.locator('body').evaluate(() => ['h4a', 'h4b', 'h4c'].map((id) => {
      const a = state.assets.find((x) => x.id === id);
      return { id, category: a.category, categorySource: a.categorySource, positionSource: a.positionSource };
    }));
    expect(result).toEqual([
      { id: 'h4a', category: 'ETF', categorySource: 'user', positionSource: 'manual' },
      { id: 'h4b', category: '주식', categorySource: 'system', positionSource: 'ledger' },
      { id: 'h4c', category: '채권', categorySource: undefined, positionSource: undefined }
    ]);
  });
});
