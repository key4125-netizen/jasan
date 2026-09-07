// E2E-52 Phase 50 - Hybrid Source of Truth를 실제 동기화 동작에 연결한다.
//
// [P0-1] 거래원장 동기화가 무엇을 덮어써도 되는가
//   - positionSource='ledger'  -> 수량/취득가/취득환율의 원천은 거래원장(기존 동작 유지)
//   - positionSource='manual'  -> 자산 마스터가 원천. 거래원장이 덮어쓰지 않는다(이번 Phase의 변경)
//   - positionSource 없음(legacy) -> 예전과 완전히 동일하게 흐른다. 추정해서 저장하지 않는다
//
// [P0-2] 어긋난 상태를 "탐지"만 한다
//   자동 삭제 / 수량 0 / 취득가 0 / positionSource 자동 변경 / 소유자·계좌·티커 자동 변경 전부 금지.
//   "거래내역이 없다 = 고아"라는 단순 규칙을 쓰지 않는다(부동산·현금·직접등록 자산이 정상적으로 그렇다).
//
// 이 파일이 깨지면 기대값을 완화하지 말고 SoT 규칙이 왜 바뀌었는지부터 확인할 것.
const { test, expect } = require('@playwright/test');
const { seedPriceHistory } = require('./fixtures');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof assessPositionConsistency === 'function'
    && typeof syncAssetsFromTransactions === 'function' && typeof mergeAssetsForAppend === 'function');
}

// state를 건드린 뒤 반드시 원복한다 - 테스트가 앱 상태를 남기지 않는다.
const withState = (page, body) => page.evaluate((b) => {
  const snap = {
    assets: JSON.parse(JSON.stringify(state.assets)),
    tx: JSON.parse(JSON.stringify(state.transactions))
  };
  try {
    return new Function(b)();
  } finally {
    state.assets = snap.assets;
    state.transactions = snap.tx;
  }
}, body);

// 테스트가 반복해서 쓰는 조립 도구. 실제 makeAsset / 실제 거래 레코드 모양을 그대로 쓴다.
const HELPERS = `
  const mkAsset = (over) => {
    const a = makeAsset(Object.assign({ ticker: 'ZZ52', owner: '신랑', accountType: '일반계좌',
      name: 'E2E52 종목', currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1000 }, over));
    if (over && over.positionSource === undefined && 'positionSource' in over) delete a.positionSource;
    return a;
  };
  const mkTx = (over) => Object.assign({ id: genId(), date: '2026-01-01', owner: '신랑',
    accountType: '일반계좌', ticker: 'ZZ52', name: 'E2E52 종목', type: 'buy', quantity: 40,
    price: 2500, currency: 'KRW', fee: 0, createdAt: Date.now() }, over || {});
  const snapshot = (a) => ({ quantity: a.quantity, buyPrice: a.buyPrice,
    buyRate: a.buyRate === undefined ? 'UNDEFINED' : a.buyRate,
    src: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource,
    owner: a.owner, accountType: a.accountType, ticker: a.ticker, name: a.name,
    category: a.category, currency: a.currency, id: a.id,
    role: a.role === undefined ? 'UNDEFINED' : a.role,
    rateMatchOverride: a.rateMatchOverride === undefined ? 'UNDEFINED' : a.rateMatchOverride });
`;

/* ════════ A. ledger asset — 기존 정상 동작 유지 ════════ */

test('A. ledger 자산의 수량/취득가/취득환율은 거래원장에서 온다(기존 동작 유지)', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    state.assets = [mkAsset({ ticker: 'ZZ52U', currency: 'USD', positionSource: 'ledger',
      quantity: 1, buyPrice: 1 })];
    state.transactions = [mkTx({ ticker: 'ZZ52U', currency: 'USD', quantity: 40, price: 2500, appliedRate: 1300 })];
    syncAssetsFromTransactions();
    return snapshot(state.assets[0]);
  `);
  expect(got.quantity, '수량은 거래원장 기준').toBe(40);
  expect(got.buyPrice, '취득가는 거래원장 기준').toBe(2500);
  expect(got.buyRate, '취득환율도 거래원장 기준').toBe(1300);
  expect(got.src, '표식은 그대로').toBe('ledger');
});

/* ════════ B. manual asset — 이번 Phase의 핵심 변경 ════════ */

test('B. manual 자산은 매칭되는 거래가 있어도 거래원장이 덮어쓰지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const a = mkAsset({ positionSource: 'manual', quantity: 10, buyPrice: 1000 });
    a.buyRate = 1100;
    state.assets = [a];
    // 같은 소유자·계좌·티커를 가진 거래가 존재한다 - 예전에는 이 순간부터 매 부팅마다
    // 사용자가 직접 입력한 10주/1000원이 조용히 40주/2500원으로 되돌아갔다.
    state.transactions = [mkTx({ currency: 'USD', appliedRate: 1300 })];
    const before = snapshot(state.assets[0]);
    syncAssetsFromTransactions();
    return { before, after: snapshot(state.assets[0]) };
  `);
  expect(got.after.quantity, '수량 보존').toBe(10);
  expect(got.after.buyPrice, '취득가 보존').toBe(1000);
  expect(got.after.buyRate, '취득환율 보존').toBe(1100);
  expect(got.after, '자산의 어떤 필드도 바뀌지 않는다').toEqual(got.before);
});

test('B-2. 전량 매도된 거래가 있어도 manual 자산의 수량을 0으로 만들지 않는다', async ({ page }) => {
  await boot(page);
  // 자동 0 처리는 P0-2에서 명시적으로 금지된 동작이다.
  const got = await withState(page, HELPERS + `
    state.assets = [mkAsset({ positionSource: 'manual', quantity: 10, buyPrice: 1000 })];
    state.transactions = [mkTx({ quantity: 40, price: 2500 }),
      mkTx({ type: 'sell', quantity: 40, price: 2600, date: '2026-02-01' })];
    syncAssetsFromTransactions();
    return snapshot(state.assets[0]);
  `);
  expect(got.quantity).toBe(10);
  expect(got.buyPrice).toBe(1000);
  expect(got.src).toBe('manual');
});

/* ════════ C / D. 수정 모달을 거쳐도 원천이 뒤집히지 않는다 ════════ */

for (const src of ['ledger', 'manual']) {
  test(`${src === 'ledger' ? 'C' : 'D'}. ${src} 자산을 수정 모달에서 저장해도 원천 의미가 유지된다`, async ({ page }) => {
    await boot(page);
    await page.evaluate((positionSource) => {
      state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌',
        name: 'E2E52 수정대상', currency: 'KRW', quantity: 5, buyPrice: 100, currentPrice: 100,
        positionSource })];
      state.transactions = [];
      persistAssets(true);
      renderAll();
    }, src);
    const id = await page.evaluate(() => state.assets[0].id);
    await page.locator('#assetForm').evaluate((form, assetId) => {
      form.ownerDocument.defaultView.openModal('edit', assetId); // [수정] 버튼이 여는 그 함수
    }, id);
    await page.locator('#assetForm').evaluate((form) => {
      form.ownerDocument.getElementById('f_quantity').value = '9';
      form.requestSubmit();
    });
    await page.waitForFunction(() => state.assets[0].quantity === 9);
    const after = await page.evaluate(() => ({
      src: state.assets[0].positionSource === undefined ? 'UNDEFINED' : state.assets[0].positionSource,
      quantity: state.assets[0].quantity
    }));
    expect(after.src).toBe(src);
    expect(after.quantity).toBe(9);
  });
}

/* ════════ E. legacy asset — 자동 migration 없음, 동작 변화 없음 ════════ */

test('E. legacy 자산은 거래 유무와 무관하게 표식이 생기지 않고 동작도 예전 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    // ① 매칭 거래가 있는 legacy - 예전처럼 거래원장 값으로 갱신된다(동작 변화 없음).
    state.assets = [mkAsset({ positionSource: undefined, quantity: 10, buyPrice: 1000 })];
    state.transactions = [mkTx()];
    syncAssetsFromTransactions();
    const withTx = snapshot(state.assets[0]);

    // ② 매칭 거래가 없는 legacy - 동기화 루프가 애초에 닿지 않으므로 완전히 그대로다.
    state.assets = [mkAsset({ ticker: '', name: 'E2E52 부동산', category: '부동산',
      positionSource: undefined, quantity: 1, buyPrice: 500000000 })];
    state.transactions = [];
    const beforeNoTx = snapshot(state.assets[0]);
    syncAssetsFromTransactions();
    return { withTx, beforeNoTx, afterNoTx: snapshot(state.assets[0]) };
  `);
  expect(got.withTx.src, '거래가 있어도 ledger로 저장하지 않는다').toBe('UNDEFINED');
  expect(got.withTx.quantity, '기존 동작 그대로 거래원장 값이 반영된다').toBe(40);
  expect(got.afterNoTx.src, '거래가 없어도 manual로 저장하지 않는다').toBe('UNDEFINED');
  expect(got.afterNoTx, '거래가 없는 legacy 자산은 한 필드도 바뀌지 않는다').toEqual(got.beforeNoTx);
});

/* ════════ F. ledger orphan — 탐지하되 아무것도 고치지 않는다 ════════ */

test('F. 거래가 사라진 ledger 자산은 삭제·0 처리·manual 전환 없이 탐지만 된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const a = mkAsset({ positionSource: 'ledger', quantity: 40, buyPrice: 2500 });
    state.assets = [a];
    state.transactions = [mkTx()];
    syncAssetsFromTransactions();
    const before = snapshot(state.assets[0]);

    state.transactions = []; // 거래내역을 지웠거나 파일로 덮어쓴 상황
    syncAssetsFromTransactions();
    const verdict = assessPositionConsistency(state.assets[0]);
    return { before, after: snapshot(state.assets[0]), count: state.assets.length,
      status: verdict.status, message: verdict.message };
  `);
  expect(got.count, '자산을 자동으로 지우지 않는다').toBe(1);
  expect(got.after, '한 필드도 자동으로 바꾸지 않는다').toEqual(got.before);
  expect(got.after.quantity).toBe(40);
  expect(got.after.src).toBe('ledger');
  expect(got.status).toBe('LEDGER_WITHOUT_TX');
  expect(got.message).toContain('확인해 주세요');
});

test('F-2. 정상 상태는 문제로 표시하지 않는다 - "거래가 없다 = 고아"가 아니다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const cases = {};
    const judge = (label, asset, txs) => {
      state.assets = [asset]; state.transactions = txs || [];
      cases[label] = assessPositionConsistency(asset).status;
    };
    // 거래가 없는 것이 정상인 자산들 - 부동산, 원화현금, 직접등록 종목
    judge('부동산(manual)', mkAsset({ ticker: '', name: 'E2E52 아파트', category: '부동산', positionSource: 'manual' }));
    judge('원화현금(manual)', mkAsset({ ticker: '', name: 'E2E52 원화현금', category: '현금', positionSource: 'manual' }));
    judge('직접등록(manual)', mkAsset({ positionSource: 'manual' }));
    // legacy는 원천을 모르므로 아예 판정하지 않는다 - 거래가 있든 없든
    judge('legacy(거래없음)', mkAsset({ positionSource: undefined }));
    judge('legacy(거래있음)', mkAsset({ positionSource: undefined, quantity: 1 }), [mkTx()]);
    // 원화 현금은 시스템 정책상 거래원장이 관리하지 않는다 - 옛 거래가 남아 있어도 문제가 아니다
    judge('원화현금+옛거래', mkAsset({ ticker: '', name: 'E2E52 원화현금', category: '현금',
      positionSource: 'manual', quantity: 1 }), [mkTx({ ticker: '', name: 'E2E52 원화현금' })]);
    // 거래와 값이 정확히 일치하는 manual 자산도 조치할 것이 없다
    judge('manual+일치거래', mkAsset({ positionSource: 'manual', quantity: 40, buyPrice: 2500 }), [mkTx()]);
    // ledger 자산에 거래가 있으면 정상
    judge('ledger+거래', mkAsset({ positionSource: 'ledger', quantity: 40, buyPrice: 2500 }), [mkTx()]);
    return cases;
  `);
  for (const [label, status] of Object.entries(got)) {
    expect(status, `${label}은 문제로 표시하지 않는다`).toBe('OK');
  }
});

test('F-3. 값이 어긋난 manual 자산은 탐지되지만 값은 보존된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const a = mkAsset({ positionSource: 'manual', quantity: 10, buyPrice: 1000 });
    state.assets = [a]; state.transactions = [mkTx()]; // 거래원장은 40주 / 2500원
    const before = snapshot(a);
    const verdict = assessPositionConsistency(a);
    syncAssetsFromTransactions();
    return { before, after: snapshot(state.assets[0]), status: verdict.status,
      message: verdict.message, ledgerQuantity: verdict.ledgerQuantity, ledgerBuyPrice: verdict.ledgerBuyPrice };
  `);
  expect(got.status).toBe('MANUAL_WITH_TX');
  expect(got.message).toContain('일치하지 않습니다');
  expect(got.ledgerQuantity, '거래원장 쪽 값은 참고용으로 알려준다').toBe(40);
  expect(got.ledgerBuyPrice).toBe(2500);
  expect(got.after, '탐지가 데이터를 바꾸지 않는다').toEqual(got.before);
});

/* ════════ F-UI. 상세 모달의 최소 안내 ════════ */

test('F-UI. 어긋난 경우에만 상세 모달에 한 줄 안내가 뜬다(새 카드/버튼 없음)', async ({ page }) => {
  await boot(page);
  const read = () => page.locator('#assetDetailPositionNotice').evaluate((el) => ({
    hidden: el.classList.contains('hidden'),
    text: el.textContent.trim(),
    fontPx: Math.round(parseFloat(el.ownerDocument.defaultView.getComputedStyle(
      el.querySelector('p') || el).fontSize)),
    hasButton: el.querySelectorAll('button, a').length
  }));

  // ① 정상 manual 자산 - 아무 안내도 뜨지 않는다
  await page.evaluate(() => {
    state.transactions = [];
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌',
      name: 'E2E52 아파트', category: '부동산', currency: 'KRW', quantity: 1,
      buyPrice: 500000000, currentPrice: 500000000, positionSource: 'manual' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  expect((await read()).hidden, '정상 자산에는 안내가 없다').toBe(true);

  // ② 거래가 사라진 ledger 자산 - 안내가 뜬다
  await page.evaluate(() => {
    state.transactions = [];
    state.assets = [makeAsset({ ticker: 'ZZ52', owner: '신랑', accountType: '일반계좌',
      name: 'E2E52 종목', currency: 'KRW', quantity: 40, buyPrice: 2500, currentPrice: 2500,
      positionSource: 'ledger' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  const shown = await read();
  expect(shown.hidden).toBe(false);
  expect(shown.text).toContain('거래내역이 확인되지 않는');
  expect(shown.fontPx, '가독성 정책 - 14px 미만 금지').toBeGreaterThanOrEqual(14);
  expect(shown.hasButton, '자동 해결 버튼을 두지 않는다').toBe(0);
});

/* ════════ G. manual asset + 무관한 거래 ════════ */

test('G. 다른 종목의 거래가 들어와도 manual 자산은 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const a = mkAsset({ ticker: '', name: 'E2E52 아파트', category: '부동산',
      positionSource: 'manual', quantity: 1, buyPrice: 500000000 });
    state.assets = [a];
    const before = snapshot(a);
    state.transactions = [mkTx({ ticker: 'ZZ52X', name: 'E2E52 다른종목' })];
    syncAssetsFromTransactions();
    const mine = state.assets.find((x) => x.name === 'E2E52 아파트');
    return { before, after: snapshot(mine), total: state.assets.length,
      createdSrc: state.assets.find((x) => x.name === 'E2E52 다른종목').positionSource };
  `);
  expect(got.after, 'manual 자산 불변').toEqual(got.before);
  expect(got.total, '무관한 거래는 자기 자산만 새로 만든다').toBe(2);
  expect(got.createdSrc, '거래원장이 만든 자산은 ledger').toBe('ledger');
});

/* ════════ H. Excel 추가 병합 ════════ */

test('H. Excel 추가 병합이 기존 positionSource를 지우지 않는다', async ({ page }) => {
  await boot(page);
  // 엑셀 시트에는 positionSource 칸이 없다(컬럼 추가 금지) - 그래서 "파일에 값이 없다"를
  // "manual이다"로 읽으면 안 된다. Phase 49에서 보고한 알려진 한계를 이번에 막는다.
  const got = await withState(page, HELPERS + `
    const existing = [mkAsset({ name: 'E2E52 원장', positionSource: 'ledger' }),
      mkAsset({ name: 'E2E52 수동', ticker: 'ZZ52M', positionSource: 'manual' }),
      mkAsset({ name: 'E2E52 레거시', ticker: 'ZZ52L', positionSource: undefined })];
    // 엑셀에서 올라온 것처럼 positionSource가 아예 없는 데이터(normalizeImportedAsset 경유)
    const incoming = existing.map((a) => normalizeImportedAsset({
      ticker: a.ticker, owner: a.owner, accountType: a.accountType, name: a.name,
      currency: a.currency, quantity: 99, buyPrice: 9900, currentPrice: 9900 }));
    const merged = mergeAssetsForAppend(existing, incoming).assets;
    const read = (n) => {
      const m = merged.find((x) => x.name === n);
      return [m.positionSource === undefined ? 'UNDEFINED' : m.positionSource, m.quantity, m.id];
    };
    return { rows: ['E2E52 원장', 'E2E52 수동', 'E2E52 레거시'].map(read),
      ids: existing.map((a) => a.id), count: merged.length };
  `);
  expect(got.count, '자산이 늘어나거나 줄지 않는다').toBe(3);
  expect(got.rows[0][0], 'ledger 보존').toBe('ledger');
  expect(got.rows[1][0], 'manual 보존').toBe('manual');
  expect(got.rows[2][0], '없던 것은 없는 채로').toBe('UNDEFINED');
  // 나머지 필드는 예전 규칙 그대로 "파일이 이긴다" - 이 부분을 바꾸지 않았다는 것도 함께 고정한다.
  expect(got.rows.map((r) => r[1])).toEqual([99, 99, 99]);
  expect(got.rows.map((r) => r[2]), 'id는 기존 것을 유지한다').toEqual(got.ids);
});

test('H-2. 엑셀 파일이 값을 담고 있으면 파일 값이 이긴다(다른 필드와 같은 규칙)', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const existing = [mkAsset({ name: 'E2E52 원장', positionSource: 'ledger' })];
    const incoming = [Object.assign(normalizeImportedAsset({ ticker: 'ZZ52', owner: '신랑',
      accountType: '일반계좌', name: 'E2E52 원장', currency: 'KRW', quantity: 99, buyPrice: 9900 }),
      { positionSource: 'manual' })];
    return mergeAssetsForAppend(existing, incoming).assets[0].positionSource;
  `);
  expect(got).toBe('manual');
});

/* ════════ I / J. JSON 복원 · Cloud Sync ════════ */

test('I/J. 백업·동기화 왕복에서 세 상태가 보존되고 LWW 규칙도 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const mk = (name, src) => mkAsset({ ticker: '', name, positionSource: src === null ? undefined : src });
    state.assets = [mk('E2E52-L', 'ledger'), mk('E2E52-M', 'manual'), mk('E2E52-LEGACY', null)];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const mine = blob.assets.filter((a) => String(a.name).indexOf('E2E52-') === 0);
    const pairs = (list) => list.map((a) => [a.name, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource]);

    // 원격이 더 최신 -> 원격 채택. 원격이 더 오래됨 -> 로컬 유지. (기존 LWW 규칙)
    const remoteNewer = mine.map((a) => Object.assign({}, a, { positionSource: 'manual', updatedAt: 9999999999999 })).map(normalizeImportedAsset);
    const remoteOlder = mine.map((a) => Object.assign({}, a, { positionSource: 'manual', updatedAt: 1 })).map(normalizeImportedAsset);
    const sortByName = (l) => l.slice().sort((x, y) => String(x.name).localeCompare(String(y.name)));
    return {
      blob: pairs(sortByName(mine)),
      restored: pairs(sortByName(mine.map(normalizeImportedAsset))),
      newer: pairs(sortByName(mergeCollectionById(state.assets, remoteNewer, new Set()))),
      older: pairs(sortByName(mergeCollectionById(state.assets, remoteOlder, new Set())))
    };
  `);
  const expected = [['E2E52-L', 'ledger'], ['E2E52-LEGACY', 'UNDEFINED'], ['E2E52-M', 'manual']];
  expect(got.blob, 'Cloud/JSON 페이로드에 실린다').toEqual(expected);
  expect(got.restored, '복원이 그대로 되살린다').toEqual(expected);
  expect(got.newer, '원격이 더 최신이면 원격 값이 이긴다(기존 LWW)')
    .toEqual([['E2E52-L', 'manual'], ['E2E52-LEGACY', 'manual'], ['E2E52-M', 'manual']]);
  expect(got.older, '원격이 더 오래됐으면 로컬이 이긴다(기존 LWW)').toEqual(expected);
});

/* ════════ K. Phase 48-A 회귀 ════════ */

test('K. Phase 48-A Return Key 규칙과 사용자 설정이 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const cell = (a) => sanitizeRateMatchOverride(a.rateMatchOverride) || ''; // js/12 export와 동일 규칙
    const auto = mkAsset({ ticker: '069500.KS', name: 'KODEX 200', positionSource: 'manual' });
    const user = mkAsset({ ticker: '140860.KQ', name: '파크시스템스', positionSource: 'ledger' });
    user.rateMatchOverride = 'KOSDAQ';
    state.assets = [auto, user];
    state.transactions = [mkTx({ ticker: '069500.KS', name: 'KODEX 200' }),
      mkTx({ ticker: '140860.KQ', name: '파크시스템스' })];
    syncAssetsFromTransactions(); // 동기화를 태워도 수익률 설정은 건드리지 않아야 한다
    return { autoCell: cell(auto), autoKey: resolveAssetGroupKeyDetail(auto).key,
      userCell: cell(user), userKey: resolveAssetGroupKeyDetail(user).key,
      autoSource: resolveAssetGroupKeyDetail(auto).source };
  `);
  expect(got.autoCell, '자동 판별 키는 엑셀에 쓰지 않는다').toBe('');
  expect(got.autoSource).not.toBe('override');
  expect(got.autoKey).toBe('KOSPI');
  expect(got.userCell, '사용자 지정은 그대로 나간다').toBe('KOSDAQ');
  expect(got.userKey).toBe('KOSDAQ');
});

/* ════════ L. 계산 불변 ════════ */

test('L. 적용 Return Key와 시나리오별 수익률은 원천 표식에 영향받지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, HELPERS + `
    const presets = ['conservative', 'normal', 'optimistic'];
    const SAMPLES = [['069500.KS', 'KODEX 200', 'KRW'], ['114260.KS', 'KODEX 국고채3년', 'KRW'],
      ['005930.KS', '삼성전자', 'KRW'], ['ZZETF', 'Unknown Global ETF', 'USD']];
    const run = (src) => SAMPLES.map(([t, n, c]) => {
      const a = mkAsset({ ticker: t, name: n, currency: c, positionSource: src === null ? undefined : src });
      state.assets = [a];
      return [n, resolveAssetGroupKeyDetail(a).key].concat(presets.map((p) => getAssetProjectionRate(a, p)));
    });
    return { ledger: run('ledger'), manual: run('manual'), legacy: run(null),
      domestic: presets.map((p) => SCENARIO_RATE_PRESETS[p].indexRates.domestic),
      bond: presets.map((p) => SCENARIO_RATE_PRESETS[p].categories['채권']) };
  `);
  expect(got.manual).toEqual(got.ledger);
  expect(got.legacy).toEqual(got.ledger);
  // 값 자체도 Phase 47-A 규칙 그대로다(숫자를 테스트에 베끼지 않고 프리셋에서 읽어 비교).
  const byName = Object.fromEntries(got.ledger.map((r) => [r[0], r]));
  expect(byName['KODEX 200'].slice(1)).toEqual(['KOSPI', ...got.domestic]);
  expect(byName['삼성전자'].slice(1)).toEqual(['KOSPI', ...got.domestic]);
  expect(byName['KODEX 국고채3년'].slice(1)).toEqual(['BOND', ...got.bond]);
  expect(byName['Unknown Global ETF'].slice(1), '가정이 없으면 0').toEqual(['UNRESOLVED', 0, 0, 0]);
});

test('L-2. 결정론적 예측과 Monte Carlo 입력이 동기화 전후로 동일하다', async ({ page }) => {
  await boot(page);
  await seedPriceHistory(page);
  // manual 자산이 섞인 포트폴리오에서 동기화를 태워도 계산에 들어가는 값이 흔들리면 안 된다.
  // Monte Carlo는 시뮬레이션 대신 "엔진에 들어가는 입력"을 비교한다 - 입력이 같으면 결과도 같고,
  // 1만 회 시뮬레이션을 테스트에서 돌리는 것보다 원인 지점을 정확히 짚는다.
  const got = await page.evaluate(async () => {
    const snap = { assets: JSON.parse(JSON.stringify(state.assets)),
      tx: JSON.parse(JSON.stringify(state.transactions)) };
    try {
      const mk = (name, ticker, src, qty, price) => {
        const a = makeAsset({ ticker, owner: '신랑', accountType: '일반계좌', name, currency: 'KRW',
          quantity: qty, buyPrice: price, currentPrice: price });
        if (src) a.positionSource = src;
        return a;
      };
      state.assets = [
        mk('E2E52 원장주', '069500.KS', 'ledger', 40, 2500),
        mk('E2E52 수동주', '114260.KS', 'manual', 10, 1000),
        mk('E2E52 레거시', '005930.KS', null, 5, 70000)
      ];
      state.transactions = [
        { id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '069500.KS',
          name: 'E2E52 원장주', type: 'buy', quantity: 40, price: 2500, currency: 'KRW', fee: 0, createdAt: 1 },
        { id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: '114260.KS',
          name: 'E2E52 수동주', type: 'buy', quantity: 77, price: 7700, currency: 'KRW', fee: 0, createdAt: 1 }
      ];
      const deterministic = () => {
        const byGroup = getProjectionGroupStats(null);
        return Object.keys(byGroup).sort().map((k) => [k, Math.round(byGroup[k].value)]);
      };
      const mcInput = async () => {
        const r = await buildMonteCarloInputFromState({ presetKey: 'normal' });
        return { order: r.assetOrder, errors: r.errors,
          instruments: (r.instruments || []).map((i) => [i.key, i.weight, i.muAnnual, i.sigmaAnnual]) };
      };
      const before = { det: deterministic(), mc: await mcInput() };
      syncAssetsFromTransactions();
      const after = { det: deterministic(), mc: await mcInput() };
      const q = (n) => { const a = state.assets.find((x) => x.name === n); return [a.quantity, a.buyPrice]; };
      return { before, after, 원장주: q('E2E52 원장주'), 수동주: q('E2E52 수동주'), 레거시: q('E2E52 레거시') };
    } finally { state.assets = snap.assets; state.transactions = snap.tx; }
  });
  expect(got.after.det, '결정론적 예측 입력 불변').toEqual(got.before.det);
  expect(got.after.mc, 'Monte Carlo 입력 불변').toEqual(got.before.mc);
  // 그 이유를 값으로도 남긴다 - manual 자산이 거래원장(77주/7700원)에 끌려가지 않았다.
  expect(got.수동주).toEqual([10, 1000]);
  expect(got.원장주).toEqual([40, 2500]);
  expect(got.레거시, '거래가 없는 legacy는 애초에 동기화가 닿지 않는다').toEqual([5, 70000]);
});
