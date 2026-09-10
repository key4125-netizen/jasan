// E2E-74 [P1 데이터 보존 최소 수정 배치] 사용자가 입력·복원·가져온 데이터가 앱 내부의 다른 경로
// 때문에 조용히 사라지지 않는다.
//
//   FIX-1 (js/06) 거래를 저장하면서 자산의 role/rateMatchOverride를 바꿨는데 asset.updatedAt을 찍지
//                 않아, 두 기기가 영원히 갈라진 채 다음 편집 한 번에 상대 지정이 사라졌다.
//   FIX-2 (js/05) 절세계좌 적립계획을 저장하면 role이 비어 있는 배분 항목 때문에 tickerRoles 항목이
//                 삭제됐다(값을 하나도 바꾸지 않고 [저장]만 눌러도).
//   FIX-3 (js/12) 엑셀 전체 백업이 평가금액 0인 자산을 빼고 내보내, 왕복 한 번에 그 자산이 사라졌다.
//   FIX-5 (js/12) 엑셀의 대표매칭 칸이 비었거나 열이 없으면 기존 지정이 지워졌다.
//   FIX-6 (js/12) JSON [추가하기]가 updatedAt을 남기지 않아, 같은 세션 동기화에서 복원본이 졌다.
//   FIX-7 (js/12) JSON [덮어쓰기]에서 파일에 tickerRoles/learnedTickerNames 키가 없으면 통째로 비웠다.
//   J-1   (js/12) JSON [덮어쓰기] 후 rebalance/projection만 파일의 옛 시각을 유지해, 복원 직후
//                 동기화에서 그 둘만 다시 원격 값으로 되돌아갔다.
//   J-4   (js/12) 거래내역 키가 없는 구형 백업은 자산만 되돌리고 원장을 남긴다 - 그 사실을 알린다.
//
// 규칙을 테스트에 옮겨 적지 않는다. 실제 버튼/실제 파일 입력/실제 병합 함수를 그대로 태운다.
// 실제 사용자 백업 파일은 사용하지 않는다(전부 이 파일 안에서 만든 합성 fixture다).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof buildSyncBlob === 'function'
    && typeof mergeCollectionById === 'function');
}

async function importJson(page, blob, choice) {
  await page.setInputFiles('#jsonFileInput', {
    name: 'e74-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(blob), 'utf-8'),
  });
  await page.locator('#importChoiceModal').waitFor({ state: 'visible' });
  if (choice === 'overwrite') page.once('dialog', (d) => d.accept());
  await page.locator(choice === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
  await expect(page.locator('#importChoiceModal')).toHaveClass(/hidden/);
}

async function exportReal(page) {
  return page.locator('#exportExcelBtn').evaluate((btn) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const real = XL.writeFile;
    let captured = null;
    XL.writeFile = (wb) => { captured = wb; };
    try { btn.click(); } finally { XL.writeFile = real; }
    return {
      rows: XL.utils.sheet_to_json(captured.Sheets['자산목록'], { defval: '' }),
      base64: XL.write(captured, { type: 'base64', bookType: 'xlsx' })
    };
  });
}

async function dropColumns(page, base64, drop) {
  return page.locator('#exportExcelBtn').evaluate((btn, [b64, cols]) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => { const c = Object.assign({}, r); cols.forEach((k) => delete c[k]); return c; });
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, [base64, drop]);
}

async function importExcel(page, base64, mode) {
  const file = path.join(os.tmpdir(), `e2e74-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  try {
    page.once('dialog', (d) => d.accept()); // 엑셀 업로드는 alert로 결과를 알린다
    await page.setInputFiles('#excelFileInput', file);
    await page.locator(mode === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Array.isArray(state.assets) && state.assets.length > 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/* ══════════════════════════════════════════════════════════════════
 * FIX-1 — 거래 저장이 자산 메타데이터를 바꾸면 updatedAt도 따라간다
 * ═════════════════════════════════════════════════════════════════ */

// 거래 폼을 실제로 채워 저장한다 - 자산의 role/rateMatchOverride를 쓰는 경로가 이 폼 하나다.
async function saveTxForm(page, { role, rateMatch }) {
  await page.locator('body').evaluate((el, v) => {
    const doc = el.ownerDocument;
    const set = (id, val) => { doc.getElementById(id).value = val; };
    set('tx_id', '');
    set('tx_date', '2026-01-05');
    set('tx_owner', '신랑');
    set('tx_accountType', '일반계좌');
    set('tx_ticker', 'E74A');
    set('tx_name', 'E74자산');
    set('tx_type', 'buy');
    set('tx_quantity', '10');
    set('tx_price', '1000');
    set('tx_currency', 'KRW');
    set('tx_fee', '0');
    const roleSel = doc.getElementById('tx_role');
    const rateSel = doc.getElementById('tx_rateMatchOverride');
    // select에 없는 값이면 옵션을 만들어 붙인다(폼 자체의 후보 목록은 화면 상태에 따라 달라진다).
    const ensure = (sel, val) => {
      if (!val) { sel.value = ''; return; }
      if (![...sel.options].some((o) => o.value === val)) sel.add(new (doc.defaultView.Option)(val, val));
      sel.value = val;
    };
    ensure(roleSel, v.role);
    ensure(rateSel, v.rateMatch);
  }, { role: role || '', rateMatch: rateMatch || '' });
  await page.locator('#transactionForm').evaluate((f) => f.requestSubmit());
  await page.locator('#transactionModal').waitFor({ state: 'hidden' });
}

async function seedAssetForTx(page) {
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74a', ticker: 'E74A', name: 'E74자산', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'manual' })];
    state.transactions = [];
    state.assets[0].updatedAt = 111111; // 과거 시각으로 고정해 변화 여부를 명확히 본다
    persistAssets(); persistTransactions();
  });
}

test('FIX-1. role/rateMatchOverride가 실제로 바뀌면 asset.updatedAt이 갱신된다', async ({ page }) => {
  await open(page);
  await seedAssetForTx(page);
  await saveTxForm(page, { role: 'attacker', rateMatch: 'KOSPI' });
  const r = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E74자산');
    return { role: a.role, override: a.rateMatchOverride, ts: a.updatedAt };
  });
  expect(r.role).toBe('attacker');
  expect(r.override).toBe('KOSPI');
  // 수정 전에는 여기가 111111 그대로였다 - 그래서 두 기기가 영원히 갈라졌다.
  expect(r.ts, '값이 바뀌었으면 updatedAt도 바뀐다').toBeGreaterThan(111111);
});

test('FIX-1-2. 값이 그대로면 updatedAt을 찍지 않는다(무조건 Date.now 금지)', async ({ page }) => {
  await open(page);
  await seedAssetForTx(page);
  // 먼저 값을 넣어 자산을 그 상태로 만든다.
  await saveTxForm(page, { role: 'attacker', rateMatch: 'KOSPI' });
  const first = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E74자산');
    a.updatedAt = 222222; persistAssets(); // 비교 기준을 다시 과거로 내린다
    return a.updatedAt;
  });
  // 같은 값으로 한 번 더 저장 - 자산 메타데이터는 아무것도 바뀌지 않는다.
  await saveTxForm(page, { role: 'attacker', rateMatch: 'KOSPI' });
  const after = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E74자산');
    return { ts: a.updatedAt, role: a.role, override: a.rateMatchOverride, qty: a.quantity };
  });
  expect(after.role).toBe('attacker');
  expect(after.override).toBe('KOSPI');
  // 이 자산은 positionSource='manual'이라 거래원장이 수량을 덮지 않는다(js/06의 기존 가드) -
  // 그래서 이번 저장에서는 자산 레코드가 정말로 하나도 바뀌지 않았다.
  expect(after.qty, 'manual 자산 수량 보호는 그대로다').toBe(10);
  expect(first).toBe(222222);
  // 무조건 Date.now()를 찍었다면 여기서 222222가 아니게 된다.
  expect(after.ts, '바뀐 값이 없으면 updatedAt도 그대로다').toBe(222222);
});

test('FIX-1-3. manual 자산 보호와 거래원장 SoT는 그대로다', async ({ page }) => {
  await open(page);
  await seedAssetForTx(page);
  const r = await page.locator('body').evaluate(() => {
    // 부팅 안전망 재계산(auto)은 manual 자산의 수량을 건드리지 않는다.
    state.transactions = [{ id: 'e74tx', date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: 'E74A', name: 'E74자산', type: 'buy', quantity: 999, price: 1000, currency: 'KRW',
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    syncAssetsFromTransactions({ auto: true });
    return { qty: state.assets[0].quantity, src: state.assets[0].positionSource };
  });
  expect(r.src).toBe('manual');
  expect(r.qty, 'manual 자산은 거래원장이 수량을 덮지 않는다').toBe(10);
});

/* ══════════════════════════════════════════════════════════════════
 * FIX-2 — 절세계좌 계획 저장이 역할 레지스트리를 지우지 않는다
 * ═════════════════════════════════════════════════════════════════ */

test('FIX-2. role이 없는 절세계좌 배분 항목은 기존 tickerRoles를 지우지 않는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    setTickerRole('E74B.KS', 'core', 'E74절세종목');
    setTickerRole('E74C.KS', 'defender', 'E74절세종목2');
    const before = { b: getTickerRole('E74B.KS', ''), c: getTickerRole('E74C.KS', '') };
    // 팝업 드래프트를 그대로 만들어 실제 커밋 함수를 태운다 - role이 비어 있는 항목이 섞여 있다.
    taxAdvantagedPlanDraft = normalizeTaxAdvantagedPlan(state.projection.taxAdvantagedPlan);
    taxAdvantagedPlanDraft.allocationByOwner['신랑'] = [
      { accountType: 'IRP', ticker: 'E74B.KS', label: 'E74절세종목', pct: 60, role: null },
      { accountType: 'IRP', ticker: 'E74C.KS', label: 'E74절세종목2', pct: 40, role: 'defender' }
    ];
    commitTaxAdvantagedPlanDraft();
    return { before, after: { b: getTickerRole('E74B.KS', ''), c: getTickerRole('E74C.KS', '') } };
  });
  expect(r.before).toEqual({ b: 'core', c: 'defender' });
  // 수정 전에는 b가 사라졌다(role이 비어 있어 setTickerRole이 키를 지웠다).
  expect(r.after.b, 'role 없는 항목이 기존 지정을 지우지 않는다').toBe('core');
  expect(r.after.c, 'role이 있는 항목은 예전처럼 반영된다').toBe('defender');
});

test('FIX-2-2. 기존 지정이 없어도 유효한 role은 정상적으로 새로 만들어진다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    setTickerRole('E74D.KS', '', 'E74신규'); // 확실히 비워둔다
    taxAdvantagedPlanDraft = normalizeTaxAdvantagedPlan(state.projection.taxAdvantagedPlan);
    taxAdvantagedPlanDraft.allocationByOwner['신랑'] = [
      { accountType: 'IRP', ticker: 'E74D.KS', label: 'E74신규', pct: 100, role: 'midfielder' }
    ];
    commitTaxAdvantagedPlanDraft();
    return getTickerRole('E74D.KS', '');
  });
  expect(r).toBe('midfielder');
});

test('FIX-2-3. 다른 화면의 명시적 해제 경로는 그대로 살아 있다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    setTickerRole('E74E.KS', 'core', 'E74해제');
    const before = getTickerRole('E74E.KS', '');
    setTickerRole('E74E.KS', '', 'E74해제'); // 사용자가 선택칸을 비운 것과 같은 호출
    return { before, after: getTickerRole('E74E.KS', '') };
  });
  expect(r.before).toBe('core');
  expect(r.after, 'setTickerRole 자체의 삭제 동작은 바뀌지 않았다').toBeUndefined();
});

/* ══════════════════════════════════════════════════════════════════
 * FIX-3 / FIX-5 — 엑셀 전체 백업
 * ═════════════════════════════════════════════════════════════════ */

async function seedExcelAssets(page) {
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    const live = makeAsset({ id: 'e74live', ticker: 'E74L', name: 'E74보유', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currentPrice: 1000 });
    live.rateMatchOverride = 'KOSPI';
    // 평가금액이 0인 자산 - 화면에는 안 보이지만 사용자가 지운 적은 없는 레코드다.
    const zero = makeAsset({ id: 'e74zero', ticker: '', name: 'E74부동산', category: '부동산',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '부동산',
      quantity: 0, buyPrice: 350000000, currentPrice: 850000000 });
    state.assets = [live, zero];
    state.transactions = [];
    persistAssets(); persistTransactions();
  });
}

test('FIX-3. 평가금액 0인 자산도 엑셀 전체 백업에 포함되고 왕복에서 살아남는다', async ({ page }) => {
  await open(page);
  await seedExcelAssets(page);
  const exported = await exportReal(page);
  // 수정 전에는 이 행이 아예 없었고, [덮어쓰기] 한 번에 자산이 영구히 사라졌다.
  expect(exported.rows.map((r) => r['종목명']).sort()).toEqual(['E74보유', 'E74부동산']);

  await importExcel(page, exported.base64, 'overwrite');
  const afterOverwrite = await page.locator('body').evaluate(() => state.assets.map((a) => a.name).sort());
  expect(afterOverwrite, '덮어쓰기 왕복에서 사라지지 않는다').toEqual(['E74보유', 'E74부동산']);

  await importExcel(page, exported.base64, 'append');
  const afterAppend = await page.locator('body').evaluate(() => state.assets.map((a) => a.name).sort());
  expect(afterAppend, '추가하기에서도 복제되지 않고 그대로다').toEqual(['E74보유', 'E74부동산']);
});

test('FIX-3-2. 화면 표시 정책은 바뀌지 않는다(계속 숨겨진다)', async ({ page }) => {
  await open(page);
  await seedExcelAssets(page);
  const r = await page.locator('body').evaluate(() => ({
    table: tableAssets().map((a) => a.name),
    filtered: filteredAssets().map((a) => a.name),
    realEstate: hasRealEstateHoldings(),
    stateCount: state.assets.length
  }));
  expect(r.table, '자산 목록에는 계속 안 보인다').toEqual(['E74보유']);
  expect(r.filtered, '상단 차트 필터도 그대로다').toEqual(['E74보유']);
  expect(r.realEstate, '부동산 보유 판정도 그대로다').toBe(false);
  expect(r.stateCount, '레코드 자체는 그대로 남아 있다').toBe(2);
});

test('FIX-5. 대표매칭 열이 없는 구형 엑셀이 기존 지정을 지우지 않는다', async ({ page }) => {
  await open(page);
  await seedExcelAssets(page);
  const exported = await exportReal(page);
  const legacy = await dropColumns(page, exported.base64, ['대표매칭(수익률연동키)']);
  await importExcel(page, legacy, 'overwrite');
  const kept = await page.locator('body').evaluate(() =>
    (state.assets.find((a) => a.name === 'E74보유') || {}).rateMatchOverride);
  // 수정 전에는 여기가 undefined였다 - 열이 없다는 이유만으로 사용자 지정이 사라졌다.
  expect(kept, '열이 없으면 기존 지정을 이어받는다').toBe('KOSPI');
});

test('FIX-5-2. 지정이 없던 자산은 이어받을 것도 없다 - 값을 만들어내지 않는다', async ({ page }) => {
  await open(page);
  await seedExcelAssets(page);
  const exported = await exportReal(page);
  const legacy = await dropColumns(page, exported.base64, ['대표매칭(수익률연동키)']);
  await importExcel(page, legacy, 'overwrite');
  const r = await page.locator('body').evaluate(() => {
    const z = state.assets.find((a) => a.name === 'E74부동산') || {};
    return z.rateMatchOverride === undefined ? 'UNDEF' : z.rateMatchOverride;
  });
  expect(r).toBe('UNDEF');
});

test('FIX-5-3. 파일에 값이 있으면 파일 값이 이기고, positionSource/categorySource 이월도 그대로다', async ({ page }) => {
  await open(page);
  await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    const a = makeAsset({ id: 'e74p', ticker: 'E74P', name: 'E74정책', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 5, buyPrice: 100, currentPrice: 100 });
    a.rateMatchOverride = 'KOSPI';
    a.positionSource = 'manual';
    a.categorySource = 'user';
    state.assets = [a];
    state.transactions = [];
    persistAssets(); persistTransactions();
  });
  const exported = await exportReal(page);
  const edited = await page.locator('#exportExcelBtn').evaluate((btn, b64) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => Object.assign({}, r, { '대표매칭(수익률연동키)': 'NASDAQ' }));
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, exported.base64);
  await importExcel(page, edited, 'overwrite');
  const r = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E74정책');
    return { override: a.rateMatchOverride, ps: a.positionSource, cs: a.categorySource, cat: a.category };
  });
  expect(r.override, '파일 값이 이긴다').toBe('NASDAQ');
  expect(r.ps, 'positionSource 이월 회귀 없음').toBe('manual');
  expect(r.cs, 'categorySource 이월 회귀 없음').toBe('user');
  expect(r.cat).toBe('주식');
});

/* ══════════════════════════════════════════════════════════════════
 * FIX-6 / FIX-7 / J-1 / J-4 — JSON 복원
 * ═════════════════════════════════════════════════════════════════ */

test('FIX-6. JSON [추가하기]로 복원한 자산이 같은 세션 동기화에서 원격에 밀리지 않는다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j2', ticker: 'E74J', name: 'E74추가', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 300, buyPrice: 300, currentPrice: 300 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    // 파일은 정의상 과거다.
    b.assets[0].updatedAt = 111111;
    // 이 기기의 현재 값은 다르다.
    state.assets = [{ ...state.assets[0], quantity: 100, buyPrice: 100, updatedAt: 111111 }];
    persistAssets();
    return b;
  });
  await importJson(page, blob, 'append');
  const r = await page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E74추가');
    // 원격은 파일보다 나중에 저장된 값 - 예전에는 로컬 updatedAt이 undefined(=0)라 무조건 졌다.
    const remote = [normalizeImportedAsset({ ...a, quantity: 200, buyPrice: 200, updatedAt: 999999 })];
    const merged = mergeCollectionById(state.assets, remote, new Set());
    return {
      afterRestore: a.quantity,
      tsIsNow: Number(a.updatedAt) > 111111,
      tsDefined: a.updatedAt !== undefined,
      afterSync: merged.find((x) => x.id === a.id).quantity
    };
  });
  expect(r.afterRestore, '복원 직후 파일 값').toBe(300);
  expect(r.tsDefined, 'updatedAt이 비어 있지 않다').toBe(true);
  expect(r.tsIsNow, '복원 시각으로 찍혔다').toBe(true);
  expect(r.afterSync, '같은 세션 동기화에서 복원본이 유지된다').toBe(300);
});

test('FIX-7. 파일에 tickerRoles/learnedTickerNames 키가 없으면 기존 값을 유지한다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j3', ticker: 'E74K', name: 'E74키없음', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    delete b.tickerRoles;          // 이 키가 생기기 전 버전의 백업과 같은 모양
    delete b.learnedTickerNames;
    setTickerRole('E74KEEP.KS', 'core', 'E74유지');
    state.learnedTickerNames = { 'E74KEEP.KS': '유지되는이름' };
    persistLearnedTickerNames();
    return b;
  });
  await importJson(page, blob, 'overwrite');
  const r = await page.locator('body').evaluate(() => ({
    role: getTickerRole('E74KEEP.KS', ''),
    name: state.learnedTickerNames['E74KEEP.KS']
  }));
  // 수정 전에는 둘 다 {}로 초기화돼 사라졌다.
  expect(r.role, '키가 없으면 역할 레지스트리를 지우지 않는다').toBe('core');
  expect(r.name, '학습된 종목명도 마찬가지다').toBe('유지되는이름');
});

test('FIX-7-2. 키가 있고 값이 {}이면 명시적 초기화로 그대로 처리한다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j4', ticker: 'E74M', name: 'E74빈값', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    b.tickerRoles = {};            // "그 시점에 실제로 비어 있었다"는 사실
    b.learnedTickerNames = {};
    setTickerRole('E74RESET.KS', 'core', 'E74초기화');
    return b;
  });
  await importJson(page, blob, 'overwrite');
  const r = await page.locator('body').evaluate(() => ({
    role: getTickerRole('E74RESET.KS', ''),
    keys: Object.keys(state.tickerRoles).length
  }));
  expect(r.role === undefined, '명시적 빈 레지스트리는 예전처럼 그대로 반영된다').toBe(true);
  expect(r.keys).toBe(0);
});

test('FIX-7-3. 키가 있고 정상 object면 예전처럼 그 값으로 복원된다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j5', ticker: 'E74N', name: 'E74정상', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    b.tickerRoles = { 'E74FILE.KS': 'attacker' };
    return b;
  });
  await importJson(page, blob, 'overwrite');
  const r = await page.locator('body').evaluate(() => getTickerRole('E74FILE.KS', ''));
  expect(r).toBe('attacker');
});

test('J-1. 덮어쓰기로 복원한 rebalance/projection이 직후 동기화에서 되돌아가지 않는다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j1', ticker: 'E74R', name: 'E74복원', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    // 파일(= 사용자가 되돌리고 싶은 상태)은 정의상 과거다.
    b.rebalance = { ...b.rebalance, updatedAt: 111111 };
    b.rebalance['신랑'] = { ...b.rebalance['신랑'], domestic: { '국내': 70, '해외': 30 } };
    b.projection = { ...b.projection, updatedAt: 111111, monthlyContribution: 777777 };
    return b;
  });
  await importJson(page, blob, 'overwrite');

  const r = await page.locator('body').evaluate((el, file) => {
    const restored = {
      domestic: state.rebalance['신랑'].domestic['국내'],
      contribution: state.projection.monthlyContribution,
      rebalTsIsNow: Number(state.rebalance.updatedAt) > 111111,
      projTsIsNow: Number(state.projection.updatedAt) > 111111
    };
    // 복원 직후 클라우드 pull이 들어온다(배우자 기기가 파일보다는 나중에 고쳐 둔 상태).
    const remote = {
      rebalance: { ...file.rebalance, updatedAt: 999999, '신랑': { ...file.rebalance['신랑'], domestic: { '국내': 10, '해외': 90 } } },
      projection: { ...file.projection, updatedAt: 999999, monthlyContribution: 111 }
    };
    adoptRemoteRebalanceAndProjection(remote, { force: false });
    return {
      ...restored,
      afterPull: state.rebalance['신랑'].domestic['국내'],
      afterPullContribution: state.projection.monthlyContribution
    };
  }, blob);

  expect(r.domestic, '복원 직후 = 파일 값').toBe(70);
  expect(r.contribution).toBe(777777);
  expect(r.rebalTsIsNow, 'rebalance도 복원 시각으로 찍힌다').toBe(true);
  expect(r.projTsIsNow, 'projection도 복원 시각으로 찍힌다').toBe(true);
  // 수정 전에는 여기가 10 / 111이었다 - 복원 직후 pull 한 번에 이 둘만 되돌아갔다.
  expect(r.afterPull, '복원값이 유지된다').toBe(70);
  expect(r.afterPullContribution).toBe(777777);
});

test('J-1-2. 클라우드 동기화 경로(force:false)는 예전 그대로 원격 시각을 이어받는다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate(() => {
    state.rebalance.updatedAt = 100;
    const remote = { rebalance: { ...state.rebalance, updatedAt: 555 } };
    adoptRemoteRebalanceAndProjection(remote, { force: false });
    return state.rebalance.updatedAt;
  });
  expect(r, '동기화는 stampAt을 쓰지 않는다').toBe(555);
});

test('J-4. 거래내역 키가 없는 구형 백업은 원장을 지우지 않고 그 사실을 알린다', async ({ page }) => {
  await open(page);
  const blob = await page.locator('body').evaluate(() => {
    state.exchangeRate = 1450; persistRate(true);
    state.assets = [makeAsset({ id: 'e74j6', ticker: 'E74T', name: 'E74원장', category: '주식',
      currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1, currentPrice: 1, positionSource: 'manual' })];
    state.transactions = [{ id: 'e74keep', date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: 'E74T', name: 'E74원장', type: 'buy', quantity: 7, price: 100, currency: 'KRW',
      fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(); persistTransactions();
    const b = buildSyncBlob();
    delete b.transactions;  // 거래내역 필드가 생기기 전 버전의 정상 백업과 같은 모양
    return b;
  });
  await importJson(page, blob, 'overwrite');
  const r = await page.locator('body').evaluate((el) => ({
    txCount: state.transactions.length,
    txId: (state.transactions[0] || {}).id,
    toast: (el.ownerDocument.getElementById('toastContainer') || el).textContent
  }));
  expect(r.txCount, '모르는 데이터를 삭제하지 않는다').toBe(1);
  expect(r.txId).toBe('e74keep');
  expect(r.toast, '자산만 되돌아갔다는 사실을 조용히 넘기지 않는다').toContain('거래내역이 없어');
});
