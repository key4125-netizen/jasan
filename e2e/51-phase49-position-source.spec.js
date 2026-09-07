// E2E-51 Phase 49 - positionSource: Hybrid Source of Truth를 자산에 명시적으로 적는다.
//
// [이 파일이 고정하는 것]
//  1) 허용값은 정확히 'ledger' | 'manual' 둘뿐이고, 값 없음(legacy)은 세 번째 값이 아니다.
//  2) "사실이 만들어지는 순간"에만 적는다 - 거래원장이 자산을 만들면 'ledger', 자산 폼이 만들면 'manual'.
//  3) 다른 필드를 보고 추론하지 않는다. 기존 자산에 소급해서 찍지 않는다. 수정으로 뒤집히지 않는다.
//  4) 저장/백업/동기화 왕복에서 보존되고, legacy는 값 없이 그대로 남는다.
//  5) 이번 Phase는 표시만 한다 - 수량/취득가/취득환율 동기화 동작과 계산 결과는 전혀 바뀌지 않는다.
//
// 이 파일이 깨지면 기대값을 완화하지 말고 왜 표시 규칙이 바뀌었는지부터 확인할 것.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof sanitizePositionSource === 'function'
    && typeof syncAssetsFromTransactions === 'function' && typeof buildSyncBlob === 'function');
}

// state를 건드린 뒤 반드시 원복한다 - 테스트가 앱 상태를 남기지 않는다.
const withState = (page, body) => page.evaluate((b) => {
  const snap = {
    assets: JSON.parse(JSON.stringify(state.assets)),
    tx: JSON.parse(JSON.stringify(state.transactions)),
    csr: JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}))
  };
  try {
    return new Function(b)();
  } finally {
    state.assets = snap.assets;
    state.transactions = snap.tx;
    state.projection.customScenarioRates = snap.csr;
  }
}, body);

/* ─────────── 허용값 ─────────── */

test('0. 허용값은 ledger / manual 둘뿐이고 그 외에는 값 없음으로 떨어진다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    allowed: POSITION_SOURCES.slice(),
    ledger: sanitizePositionSource('ledger'),
    manual: sanitizePositionSource(' manual '),
    없음: sanitizePositionSource(undefined) === undefined,
    널: sanitizePositionSource(null) === undefined,
    빈문자: sanitizePositionSource('') === undefined,
    // 세 번째 값을 몰래 만들지 않는다 - 모르는 값은 저장하지 않고 "값 없음"으로 떨어뜨린다.
    legacy문자열: sanitizePositionSource('legacy') === undefined,
    대문자: sanitizePositionSource('LEDGER') === undefined,
    엑셀: sanitizePositionSource('excel') === undefined
  }));
  expect(got.allowed).toEqual(['ledger', 'manual']);
  expect(got.ledger).toBe('ledger');
  expect(got.manual).toBe('manual');
  for (const k of ['없음', '널', '빈문자', 'legacy문자열', '대문자', '엑셀']) {
    expect(got[k], k).toBe(true);
  }
});

/* ─────────── A. 거래원장 기반 생성/동기화 ─────────── */

test('A. 거래원장이 자산을 새로 만들면 ledger로 표시된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    state.assets = [];
    state.transactions = [{ id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: 'ZZ51A', name: 'E2E51 원장종목', type: 'buy', quantity: 38, price: 1000,
      currency: 'KRW', fee: 0, createdAt: Date.now() }];
    syncAssetsFromTransactions();
    return { count: state.assets.length, src: state.assets[0].positionSource,
      quantity: state.assets[0].quantity, buyPrice: state.assets[0].buyPrice };
  `);
  expect(got.count).toBe(1);
  expect(got.src).toBe('ledger');
  // 이번 Phase는 표시만 한다 - 수량/취득가는 예전과 똑같이 거래원장에서 나온다.
  expect(got.quantity).toBe(38);
  expect(got.buyPrice).toBe(1000);
});

test('A-2. 이미 있던 자산에는 sync가 positionSource를 소급해서 찍지 않는다', async ({ page }) => {
  await boot(page);
  // PM 지시: 기존 자산에 ledger/manual을 대량 추정해 덮어쓰지 않는다.
  const got = await withState(page, `
    const legacy = makeAsset({ ticker: 'ZZ51A', owner: '신랑', accountType: '일반계좌',
      name: 'E2E51 원장종목', currency: 'KRW', quantity: 1, buyPrice: 1, currentPrice: 1 });
    delete legacy.positionSource; // 옛 버전이 저장해 둔 자산을 모사
    state.assets = [legacy];
    state.transactions = [{ id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: 'ZZ51A', name: 'E2E51 원장종목', type: 'buy', quantity: 38, price: 1000,
      currency: 'KRW', fee: 0, createdAt: Date.now() }];
    syncAssetsFromTransactions();
    const a = state.assets[0];
    return { src: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource, quantity: a.quantity };
  `);
  expect(got.src, 'legacy 자산은 값 없이 그대로 남는다').toBe('UNDEFINED');
  expect(got.quantity, 'sync의 수량 동작 자체는 예전 그대로다').toBe(38);
});

/* ─────────── B. manual 생성 / 수정 불변 ─────────── */

test('B. 자산 추가("최초등록") 폼으로 만든 자산은 manual로 표시된다', async ({ page }) => {
  await boot(page);
  // 실제 submit 핸들러(js/07)를 그대로 태운다 - 규칙을 테스트에 베껴 쓰지 않는다.
  await page.locator('#systemManagementBtn').click();
  await page.locator('#addAssetBtn').click();
  await page.locator('#assetForm').evaluate((form) => {
    const doc = form.ownerDocument;
    doc.getElementById('f_name').value = 'E2E51 수동자산'; // readonly - 검색 자동완성이 채우는 칸
    doc.getElementById('f_quantity').value = '7';
    doc.getElementById('f_buyPrice').value = '1000';
    form.requestSubmit();
  });
  await page.waitForFunction(() => state.assets.some((a) => a.name === 'E2E51 수동자산'));
  const created = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E51 수동자산');
    return { src: a.positionSource, quantity: a.quantity, buyPrice: a.buyPrice };
  });
  expect(created.src).toBe('manual');
  expect(created.quantity).toBe(7);
  expect(created.buyPrice).toBe(1000);
});

test('B-2. 거래원장에서 태어난 자산을 자산 폼에서 수정해도 ledger 그대로다', async ({ page }) => {
  await boot(page);
  // 자산 폼에서 "열고 저장"만 해도 manual로 뒤집히면 P0-1/P0-2의 판단 근거가 그 순간 오염된다.
  await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌',
      name: 'E2E51 원장자산', currency: 'KRW', quantity: 5, buyPrice: 100, currentPrice: 100,
      positionSource: 'ledger' })];
    persistAssets(true);
    renderAll();
  });
  const before = await page.evaluate(() => state.assets[0].positionSource);
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
  expect(before).toBe('ledger');
  expect(after.src, '수정이 표시를 뒤집지 않는다').toBe('ledger');
  expect(after.quantity).toBe(9);
});

/* ─────────── C. Excel import ─────────── */

test('C. Excel import는 positionSource를 만들어내지 않는다(컬럼 없음 → 값 없음)', async ({ page }) => {
  await boot(page);
  // Excel schema는 이번 Phase에서 바꾸지 않았다(PM §7: 컬럼 추가 금지).
  // 핵심은 "없는 값을 추측해 채우지 않는다"는 것이다.
  const got = await page.evaluate(() => {
    const fromExcel = normalizeImportedAsset({
      ticker: '069500.KS', owner: '신랑', accountType: '일반계좌', name: 'KODEX 200',
      isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200
    });
    return { src: fromExcel.positionSource === undefined ? 'UNDEFINED' : fromExcel.positionSource,
      hasKey: 'positionSource' in fromExcel, quantity: fromExcel.quantity, buyPrice: fromExcel.buyPrice };
  });
  expect(got.src).toBe('UNDEFINED');
  expect(got.hasKey, '필드 자리는 있고 값만 없다').toBe(true);
  expect(got.quantity).toBe(10);
  expect(got.buyPrice).toBe(1000);
});

/* ─────────── D~E. JSON restore / Cloud Sync ─────────── */

test('D/E. 백업·동기화 왕복에서 ledger / manual / 값없음이 각각 그대로 보존된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const mk = (name, src) => {
      const a = makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name,
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      if (src) a.positionSource = src; else delete a.positionSource;
      return a;
    };
    state.assets = [mk('E2E51-L', 'ledger'), mk('E2E51-M', 'manual'), mk('E2E51-LEGACY', null)];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const mine = blob.assets.filter((a) => a.name.indexOf('E2E51-') === 0);
    const restored = mine.map(normalizeImportedAsset);
    // 클라우드에서 원격 값이 채택되는 경로(updatedAt LWW)도 함께 본다.
    const remote = mine.map((a) => Object.assign({}, a, { updatedAt: 9999999999999 })).map(normalizeImportedAsset);
    const merged = mergeCollectionById(state.assets, remote, new Set())
      .filter((a) => String(a.name).indexOf('E2E51-') === 0)
      .sort((x, y) => x.name.localeCompare(y.name));
    const pairs = (list) => list.map((a) => [a.name, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource]);
    return { blob: pairs(mine), restored: pairs(restored), merged: pairs(merged) };
  `);
  const expected = [['E2E51-L', 'ledger'], ['E2E51-M', 'manual'], ['E2E51-LEGACY', 'UNDEFINED']];
  expect(got.blob, 'buildSyncBlob이 내보낸다').toEqual(expected);
  expect(got.restored, 'JSON 복원이 그대로 되살린다').toEqual(expected);
  expect(got.merged, '클라우드 병합에서도 보존된다')
    .toEqual([...expected].sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
});

/* ─────────── F~G. legacy state / 재부팅 보존 ─────────── */

test('F/G. 저장→재로드 후에도 값이 보존되고, legacy는 값 없이 남는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mk = (name, src) => {
      const a = makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name,
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      if (src) a.positionSource = src; else delete a.positionSource;
      return a;
    };
    state.assets = [mk('E2E51-L', 'ledger'), mk('E2E51-M', 'manual'), mk('E2E51-LEGACY', null)];
    persistAssets(true); // skipPush - 클라우드로 내보내지 않는다
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.assets.some((a) => a.name === 'E2E51-L'));
  const got = await page.evaluate(() => ['E2E51-L', 'E2E51-M', 'E2E51-LEGACY'].map((n) => {
    const a = state.assets.find((x) => x.name === n);
    return [n, a.positionSource === undefined ? 'UNDEFINED' : a.positionSource, a.quantity];
  }));
  expect(got).toEqual([
    ['E2E51-L', 'ledger', 1], ['E2E51-M', 'manual', 1], ['E2E51-LEGACY', 'UNDEFINED', 1]
  ]);
});

/* ─────────── H. Phase 48-A 회귀 ─────────── */

test('H. Phase 48-A 규칙(자동 Return Key를 Excel에 쓰지 않는다)이 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const mk = (ticker, name, override) => {
      const a = makeAsset({ ticker, owner: '신랑', accountType: '일반계좌', name,
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      if (override) a.rateMatchOverride = override;
      return a;
    };
    const auto = mk('069500.KS', 'KODEX 200', null);
    const user = mk('140860.KQ', '파크시스템스', 'KOSDAQ');
    const cell = (a) => sanitizeRateMatchOverride(a.rateMatchOverride) || ''; // js/12 export와 동일 규칙
    return { autoCell: cell(auto), autoAppliedKey: resolveAssetGroupKeyDetail(auto).key,
      autoSource: resolveAssetGroupKeyDetail(auto).source, userCell: cell(user) };
  `);
  expect(got.autoCell, '자동 판별값은 여전히 엑셀에 쓰지 않는다').toBe('');
  expect(got.autoSource).not.toBe('override');
  expect(got.autoAppliedKey, '계산에는 그대로 쓰인다').toBe('KOSPI');
  expect(got.userCell).toBe('KOSDAQ');
});

/* ─────────── I. 계산 불변 ─────────── */

test('I. positionSource 세 상태가 자산 수익률을 전혀 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const presets = ['conservative', 'normal', 'optimistic'];
    const SAMPLES = [
      ['069500.KS', 'KODEX 200', 'KRW'],
      ['114260.KS', 'KODEX 국고채3년', 'KRW'],
      ['005930.KS', '삼성전자', 'KRW'],
      ['ZZETF', 'Unknown Global ETF', 'USD']
    ];
    const run = (src) => SAMPLES.map(([t, n, c]) => {
      const a = makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n,
        currency: c, quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      if (src) a.positionSource = src; else delete a.positionSource;
      state.assets = [a];
      return [n, resolveAssetGroupKeyDetail(a).key].concat(presets.map((p) => getAssetProjectionRate(a, p)));
    });
    return { ledger: run('ledger'), manual: run('manual'), legacy: run(null),
      domestic: presets.map((p) => SCENARIO_RATE_PRESETS[p].indexRates.domestic),
      bond: presets.map((p) => SCENARIO_RATE_PRESETS[p].categories['채권']) };
  `);
  // 같은 자산을 표시만 다르게 해도 적용 키와 수익률이 완전히 동일해야 한다.
  expect(got.manual).toEqual(got.ledger);
  expect(got.legacy).toEqual(got.ledger);
  // 그리고 그 값은 Phase 47-A에서 확정된 규칙 그대로다(테스트에 베끼지 않고 프리셋에서 읽어 비교).
  const byName = Object.fromEntries(got.ledger.map((r) => [r[0], r]));
  expect(byName['KODEX 200'].slice(1)).toEqual(['KOSPI', ...got.domestic]);
  // Phase 47-A에서 삼성전자 전용 프리셋을 폐지했으므로 적용 키 자체가 KOSPI로 떨어진다
  // (개별 알파 없음 = 국내 지수 앵커 상속).
  expect(byName['삼성전자'].slice(1), '삼성전자는 KOSPI 앵커를 상속한다')
    .toEqual(['KOSPI', ...got.domestic]);
  expect(byName['KODEX 국고채3년'].slice(1)).toEqual(['BOND', ...got.bond]);
  expect(byName['Unknown Global ETF'].slice(1), '가정이 없으면 0 - 지역 폴백 부활 금지')
    .toEqual(['UNRESOLVED', 0, 0, 0]);
});

test('I-2. positionSource가 자산의 다른 필드를 하나도 건드리지 않는다', async ({ page }) => {
  await boot(page);
  // PM §6 데이터 불변성: 표식 하나를 더한 것 외에 자산 객체가 달라지면 안 된다.
  const got = await withState(page, `
    const base = { ticker: 'SCHD', owner: '신부', accountType: 'ISA', name: 'E2E51 불변자산',
      currency: 'USD', quantity: 12, buyPrice: 71, currentPrice: 82,
      isDomestic: '해외', category: 'ETF', role: 'core', rateMatchOverride: 'SCHD' };
    // buyRate는 makeAsset이 만드는 값이 아니라 거래원장 동기화가 채워 넣는 값이다 - 실제와 같은
    // 모양으로 얹어 두고, 백업/동기화 왕복(js/12)까지 통과시켜 정말 안 변하는지 본다.
    const mk = (src) => {
      const a = makeAsset(src ? Object.assign({}, base, { positionSource: src }) : base);
      a.buyRate = 1380;
      return a;
    };
    const strip = (a) => { const c = Object.assign({}, a); delete c.id; delete c.positionSource;
      delete c.createdAt; delete c.updatedAt; return c; };
    state.assets = [mk(null), mk('ledger'), mk('manual')];
    const round = JSON.parse(JSON.stringify(buildSyncBlob())).assets
      .filter((a) => a.name === 'E2E51 불변자산').map(normalizeImportedAsset);
    const [plain, ledger, manual] = round;
    return { same: JSON.stringify(strip(plain)) === JSON.stringify(strip(ledger))
        && JSON.stringify(strip(plain)) === JSON.stringify(strip(manual)),
      fields: strip(ledger),
      srcs: [plain.positionSource === undefined ? 'UNDEFINED' : plain.positionSource,
        ledger.positionSource, manual.positionSource] };
  `);
  expect(got.same, 'positionSource 외 모든 필드가 동일하다').toBe(true);
  expect(got.srcs).toEqual(['UNDEFINED', 'ledger', 'manual']);
  expect(got.fields.owner).toBe('신부');
  expect(got.fields.accountType).toBe('ISA');
  expect(got.fields.ticker).toBe('SCHD');
  expect(got.fields.quantity).toBe(12);
  expect(got.fields.buyPrice).toBe(71);
  expect(got.fields.buyRate, '취득환율은 손익의 근거다 - 한 자리도 변하면 안 된다').toBe(1380);
  expect(got.fields.currency).toBe('USD');
  expect(got.fields.category).toBe('ETF');
  expect(got.fields.role).toBe('core');
  expect(got.fields.rateMatchOverride).toBe('SCHD');
});
