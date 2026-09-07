// E2E-56 V1.1 M4 - 엑셀을 거쳐도 자산의 positionSource 의미가 사라지지 않는다.
//
// [무엇이 문제였나]
// 엑셀 시트에는 positionSource 칸이 없다(내부 데이터 출처 표식이라 일부러 넣지 않는다). 그래서
// 파일에서 돌아온 자산은 항상 값이 비어 있고, 덮어쓰기는 state.assets를 통째로 그것으로 갈아치웠다 -
// 엑셀 한 번에 ledger/manual 구분이 전부 legacy로 되돌아갔다. 그러면 다음 부팅의
// syncAssetsFromTransactions에서 manual 자산이 더 이상 보호받지 못해 수량/취득가가 거래원장 값으로
// 조용히 바뀔 수 있다 - Phase 50이 막아 둔 바로 그 문제가 되살아난다.
//
// [고친 방법 - 컬럼을 새로 만들지 않았다]
// Phase 53에서 id를 보존하게 되었으므로 같은 자산을 정확히 찾을 수 있고, id가 없는 구형 파일은
// append가 이미 쓰던 identity 규칙(assetMergeKey)으로 찾는다. 찾지 못하면 값 없이 그대로 둔다.
//
// [추측하지 않는다]
// 거래내역이 있는지 없는지로 ledger/manual을 새로 판단하지 않는다 - 그건 저장된 사실이 아니라
// 현재 상태일 뿐이다(상시 정책 5항). legacy는 legacy로 남는다.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof carryOverPositionSource === 'function'
    && typeof buildPositionSourceIndex === 'function');
  page.on('dialog', (d) => d.accept());
}

async function exportReal(page) {
  return page.locator('#exportExcelBtn').evaluate((btn) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const real = XL.writeFile; let cap = null;
    XL.writeFile = (wb) => { cap = wb; };
    try { btn.click(); } finally { XL.writeFile = real; }
    return { rows: XL.utils.sheet_to_json(cap.Sheets['자산목록'], { defval: '' }),
      base64: XL.write(cap, { type: 'base64', bookType: 'xlsx' }) };
  });
}
async function importReal(page, base64, mode) {
  const f = path.join(os.tmpdir(), `e2e56-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(f, Buffer.from(base64, 'base64'));
  try {
    await page.setInputFiles('#excelFileInput', f);
    await page.locator(mode === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    await page.waitForTimeout(400);
  } finally { try { fs.unlinkSync(f); } catch { /* 무시 */ } }
}
// 엑셀에서 특정 컬럼을 지워 "구형 파일"을 만든다.
async function dropColumns(page, base64, cols) {
  return page.locator('#exportExcelBtn').evaluate((btn, [b64, drop]) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => { const c = Object.assign({}, r); drop.forEach((k) => delete c[k]); return c; });
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, [base64, cols]);
}

// 세 상태를 한 번에 깔아 두는 시드. 값이 있는 자산만 엑셀에 나가므로 전부 평가금액을 준다.
const seed = (page) => page.evaluate(() => {
  const mk = (name, ticker, src, over) => {
    const a = makeAsset(Object.assign({ ticker, owner: '신랑', accountType: '일반계좌', name,
      category: ticker ? undefined : '부동산', currency: 'KRW',
      quantity: 10, buyPrice: 1000, currentPrice: 1200 }, over || {}));
    if (src) a.positionSource = src; else delete a.positionSource;
    return a;
  };
  state.assets = [mk('원장자산', 'ZZL', 'ledger'), mk('수동자산', '', 'manual'),
    mk('레거시자산', 'ZZG', null)];
  state.transactions = [];
  persistAssets();
});
const read = (page) => page.evaluate(() => state.assets.map((a) => [a.name,
  a.positionSource === undefined ? 'UNDEFINED' : a.positionSource]));

const EXPECTED = [['원장자산', 'ledger'], ['수동자산', 'manual'], ['레거시자산', 'UNDEFINED']];

/* ══════ Case 1~3·5. 엑셀 덮어쓰기 / 추가하기 ══════ */

test('Case 1~3. 엑셀 덮어쓰기가 ledger/manual/legacy 의미를 그대로 남긴다', async ({ page }) => {
  await boot(page);
  await seed(page);
  const before = await read(page);
  const beforeIds = await page.evaluate(() => state.assets.map((a) => a.id));
  await importReal(page, (await exportReal(page)).base64, 'overwrite');
  const after = await read(page);
  expect(after, '덮어쓰기 전후 동일').toEqual(before);
  expect(after).toEqual(EXPECTED);
  expect(await page.evaluate(() => state.assets.map((a) => a.id)), 'id도 그대로').toEqual(beforeIds);
});

test('Case 5. 엑셀 추가하기도 그대로 남긴다', async ({ page }) => {
  await boot(page);
  await seed(page);
  await importReal(page, (await exportReal(page)).base64, 'append');
  expect(await read(page)).toEqual(EXPECTED);
  expect(await page.evaluate(() => state.assets.length), '자산이 늘지 않는다').toBe(3);
});

test('Case 1~3-2. id 칸이 없는 구형 엑셀도 identity로 찾아 남긴다', async ({ page }) => {
  await boot(page);
  await seed(page);
  const legacy = await dropColumns(page, (await exportReal(page)).base64, ['id']);
  await importReal(page, legacy, 'overwrite');
  // id는 새로 발급되지만(구형 파일이라 알 수 없다) positionSource는 identity로 찾아 이어받는다.
  expect(await read(page)).toEqual(EXPECTED);
});

/* ══════ Case 4. 신규 자산은 추측하지 않는다 ══════ */

test('Case 4. 엑셀에만 있는 신규 자산은 자동 추론하지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const snap = JSON.parse(JSON.stringify(state.assets));
    try {
      // 기존에 아무것도 없는 상태에서 들어온 자산
      const 신규 = makeAsset({ ticker: 'ZZNEW', owner: '신랑', accountType: '일반계좌', name: '엑셀신규',
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      const 빈인덱스 = buildPositionSourceIndex([]);
      const r1 = carryOverPositionSource(신규, 빈인덱스);
      // 거래내역이 있어도 그것만으로 ledger로 판단하지 않는다
      state.assets = [];
      state.transactions = [{ id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
        ticker: 'ZZNEW', name: '엑셀신규', type: 'buy', quantity: 1, price: 1000, currency: 'KRW',
        fee: 0, createdAt: 1 }];
      const r2 = carryOverPositionSource(makeAsset({ ticker: 'ZZNEW', owner: '신랑',
        accountType: '일반계좌', name: '엑셀신규', currency: 'KRW', quantity: 1, buyPrice: 1000 }),
      buildPositionSourceIndex([]));
      return { 기존없음: r1.positionSource === undefined ? 'UNDEFINED' : r1.positionSource,
        거래는있음: r2.positionSource === undefined ? 'UNDEFINED' : r2.positionSource };
    } finally { state.assets = snap; state.transactions = []; }
  });
  expect(got.기존없음).toBe('UNDEFINED');
  expect(got.거래는있음, '거래내역 유무로 추론하지 않는다').toBe('UNDEFINED');
});

test('파일이 값을 담고 있으면 파일이 이긴다(JSON/Cloud 규칙 유지)', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const mk = (src) => { const a = makeAsset({ ticker: 'ZZW', owner: '신랑', accountType: '일반계좌',
      name: 'W', currency: 'KRW', quantity: 1, buyPrice: 1000 });
      if (src) a.positionSource = src; else delete a.positionSource; return a; };
    const 기존 = mk('ledger');
    const idx = buildPositionSourceIndex([기존]);
    return {
      '값 있음(manual)': carryOverPositionSource(Object.assign(mk('manual'), { id: 기존.id }), idx).positionSource,
      '값 없음': carryOverPositionSource(Object.assign(mk(null), { id: 기존.id }), idx).positionSource
    };
  });
  expect(got['값 있음(manual)'], '명시된 값이 이긴다').toBe('manual');
  expect(got['값 없음'], '값이 없으면 기존을 이어받는다').toBe('ledger');
});

/* ══════ Case 6·7. JSON / Cloud ══════ */

test('Case 6·7. JSON 복원과 클라우드 병합이 그대로 남긴다', async ({ page }) => {
  await boot(page);
  await seed(page);
  const got = await page.evaluate(() => {
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const restored = blob.assets.map(normalizeImportedAsset)
      .map((a) => [a.name, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource]);
    const remote = blob.assets.map((a) => Object.assign({}, a, { updatedAt: 9999999999999 }))
      .map(normalizeImportedAsset);
    const merged = mergeCollectionById(state.assets, remote, new Set())
      .map((a) => [a.name, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource]);
    return { restored, merged };
  });
  expect(got.restored).toEqual(EXPECTED);
  expect(got.merged).toEqual(EXPECTED);
});

/* ══════ Case 8·9. 엑셀 이후 부팅 동기화 ══════ */

test('Case 8·9. 엑셀 복원 후 부팅 동기화에서 SoT가 정책대로 유지된다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mk = (name, src) => {
      const a = makeAsset({ ticker: name === '원장' ? 'ZZ8L' : 'ZZ8M', owner: '신랑',
        accountType: '일반계좌', name, currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200 });
      a.positionSource = src;
      return a;
    };
    state.assets = [mk('원장', 'ledger'), mk('수동', 'manual')];
    // 두 자산 모두 매칭되는 거래가 있다 - 거래원장은 40주/2500원이라고 말한다.
    state.transactions = ['ZZ8L', 'ZZ8M'].map((t, i) => ({ id: genId(), date: '2026-01-01',
      owner: '신랑', accountType: '일반계좌', ticker: t, name: i === 0 ? '원장' : '수동',
      type: 'buy', quantity: 40, price: 2500, currency: 'KRW', fee: 0, createdAt: 1 }));
    persistAssets(); persistTransactions();
  });
  await importReal(page, (await exportReal(page)).base64, 'overwrite');
  const got = await page.evaluate(() => {
    syncAssetsFromTransactions(); // 다음 부팅과 같은 일
    return state.assets.map((a) => ({ 종목: a.name,
      src: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource,
      수량: a.quantity, 매수단가: a.buyPrice }));
  });
  const by = Object.fromEntries(got.map((g) => [g.종목, g]));
  expect(by['원장'].src).toBe('ledger');
  expect(by['원장'].수량, 'ledger는 거래원장이 원천').toBe(40);
  expect(by['원장'].매수단가).toBe(2500);
  expect(by['수동'].src).toBe('manual');
  expect(by['수동'].수량, 'manual은 자산 마스터가 원천 - 거래원장에 끌려가지 않는다').toBe(10);
  expect(by['수동'].매수단가).toBe(1000);
});

/* ══════ Case 10 + 계산 불변 ══════ */

test('Case 10. 엑셀 왕복이 수익률 설정과 계산 입력을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mk = (name, ticker, src, over) => {
      const a = makeAsset({ ticker, owner: '신랑', accountType: '일반계좌', name,
        category: ticker ? undefined : '채권', currency: 'KRW',
        quantity: 10, buyPrice: 1000, currentPrice: 1200 });
      if (src) a.positionSource = src;
      if (over) a.rateMatchOverride = over;
      return a;
    };
    state.assets = [mk('삼성전자', '005930.KS', 'ledger'), mk('KODEX 200', '069500.KS', 'manual'),
      mk('파크시스템스', '140860.KQ', 'ledger', 'KOSDAQ'), mk('국고채', '', null)];
    state.transactions = [];
    state.projection.customScenarioRates = { KOSDAQ: { label: 'KOSDAQ', conservative: 4, normal: 8, optimistic: 12 } };
    persistAssets(); persistProjection();
  });
  const measure = () => page.evaluate(async () => ({
    적용키: state.assets.map((a) => [a.name, resolveAssetGroupKeyDetail(a).key]),
    수익률: state.assets.map((a) => [a.name, getAssetProjectionRate(a, 'normal')]),
    override: state.assets.map((a) => [a.name, a.rateMatchOverride === undefined ? 'UNDEFINED' : a.rateMatchOverride]),
    // 값(숫자)만 본다. label은 엑셀 2번 시트가 화면 표시용 이름으로 되돌려주는 기존 동작이라
    // 왕복 후 'KOSDAQ' -> 'KOSDAQ (코스닥 대표지수)'로 바뀐다 - M4가 만든 변화가 아니고
    // getCustomRate가 entry[presetKey]만 읽으므로 계산에는 영향이 없다(관찰사항으로 보고).
    customScenarioRates: Object.fromEntries(Object.entries(state.projection.customScenarioRates)
      .map(([k, v]) => [k, [v.conservative, v.normal, v.optimistic]])),
    결정론입력: (() => { const g = getProjectionGroupStats(null);
      return Object.keys(g).sort().map((k) => [k, Math.round(g[k].value)]); })(),
    MC입력: await (async () => {
      const r = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      return { order: r.assetOrder, errors: r.errors,
        instruments: (r.instruments || []).map((i) => [i.key, i.weight, i.muAnnual, i.sigmaAnnual]) };
    })(),
    positionSource: state.assets.map((a) => [a.name, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource])
  }));
  const before = await measure();
  await importReal(page, (await exportReal(page)).base64, 'overwrite');
  const after = await measure();

  expect(after.적용키).toEqual(before.적용키);
  expect(after.수익률).toEqual(before.수익률);
  expect(after.override, '사용자 지정 Return Key 불변').toEqual(before.override);
  expect(after.customScenarioRates, '수익률 관리 값 불변').toEqual(before.customScenarioRates);
  expect(after.customScenarioRates).toEqual({ KOSDAQ: [4, 8, 12] });
  expect(after.결정론입력, '결정론적 예측 입력 불변').toEqual(before.결정론입력);
  expect(after.MC입력, 'Monte Carlo 입력 불변').toEqual(before.MC입력);
  expect(after.positionSource, 'positionSource도 그대로').toEqual(before.positionSource);
  // 값 자체도 남겨 둔다 - 이번 변경이 계산을 건드리지 않았다는 근거다.
  expect(before.수익률).toEqual([['삼성전자', 7], ['KODEX 200', 7], ['파크시스템스', 8], ['국고채', 4]]);
});
