// E2E-47 Phase 47-E - 자산 데이터 정합성(F-1) 회귀 고정.
//
// [무엇을 막는 테스트인가]
// buildSyncBlob()은 자산의 rateMatchOverride(사용자가 지정한 수익률연동키)를 정상적으로 내보내는데,
// 되받는 normalizeImportedAsset()이 그 필드를 읽지 않아 JSON 백업 복원·클라우드 동기화·최초 페어링
// 세 경로 모두에서 사용자 지정이 통째로 사라졌다. Phase 47-A로 지역 폴백이 없어진 뒤로는 그 결과가
// "다른 기준이 적용됨"이 아니라 "적용 수익률 7% → 0%"였다 - 자산이 갑자기 성장을 멈춘 것처럼 보인다.
//
// 이 파일의 기대값을 PM 승인 없이 고치지 말 것. 깨진다면 테스트가 낡은 것이 아니라 저장/복원 경로
// 어딘가가 다시 사용자 설정을 잃고 있다는 뜻이다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof buildSyncBlob === 'function'
    && typeof normalizeImportedAsset === 'function' && typeof sanitizeRateMatchOverride === 'function'
    && typeof getAssetProjectionRate === 'function');
}

const PRESETS = ['conservative', 'normal', 'optimistic'];

// 실제 state를 건드린 뒤 반드시 원복한다 - 테스트가 앱 상태를 남기지 않는다.
const withState = (page, fn, arg) => page.evaluate(([body, a]) => {
  const snap = {
    assets: JSON.parse(JSON.stringify(state.assets)),
    tx: JSON.parse(JSON.stringify(state.transactions)),
    csr: JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}))
  };
  try {
    return new Function('arg', body)(a);
  } finally {
    state.assets = snap.assets;
    state.transactions = snap.tx;
    state.projection.customScenarioRates = snap.csr;
  }
}, [fn, arg]);

/* ─────────── 1. 왕복 보존 (A~D) ─────────── */

test('A. JSON export → import에서 rateMatchOverride와 적용 수익률이 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    state.assets = [Object.assign(makeAsset({ ticker: '140860.KQ', owner: '신랑', accountType: '일반계좌',
      name: '파크시스템스', currency: 'KRW', quantity: 24, buyPrice: 272921, currentPrice: 262500 }),
      { rateMatchOverride: 'KOSDAQ', role: 'attacker' })];
    const before = { key: state.assets[0].rateMatchOverride, rate: getAssetProjectionRate(state.assets[0], 'normal') };
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const restored = normalizeImportedAsset(blob.assets[0]);
    return { before, blobKey: blob.assets[0].rateMatchOverride,
      after: { key: restored.rateMatchOverride, rate: getAssetProjectionRate(restored, 'normal'),
        role: restored.role, owner: restored.owner, accountType: restored.accountType,
        category: restored.category, currency: restored.currency, quantity: restored.quantity, buyPrice: restored.buyPrice } };
  `);
  expect(got.before).toEqual({ key: 'KOSDAQ', rate: 7 });
  expect(got.blobKey, 'buildSyncBlob은 원래도 정상이었다').toBe('KOSDAQ');
  expect(got.after.key, '복원 후에도 사용자 지정이 남아야 한다').toBe('KOSDAQ');
  expect(got.after.rate, '7%가 0%로 떨어지면 안 된다').toBe(7);
  // 나머지 사용자 데이터도 함께 보존된다.
  expect(got.after.role).toBe('attacker');
  expect(got.after.owner).toBe('신랑');
  expect(got.after.accountType).toBe('일반계좌');
  expect(got.after.category).toBe('주식');
  expect(got.after.currency).toBe('KRW');
  expect(got.after.quantity).toBe(24);
  expect(got.after.buyPrice).toBe(272921);
});

test('B. JSON 복원(자산 배열 통째 교체)에서 여러 자산의 지정이 모두 살아남는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const seed = [
      ['005930.KS', '삼성전자', 'KRW', '005930.KS'],
      ['0052D0.KS', 'TIGER 코리아배당다우존스', 'KRW', '0052D0.KS'],
      ['237370.KS', 'KODEX 코리아배당성장채권혼합', 'KRW', 'BOND.STOCK'],
      ['', '달러', 'USD', 'CASH.USD']
    ].map(([t, n, c, key]) => Object.assign(
      makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: c, quantity: 1, buyPrice: 1000 }),
      { rateMatchOverride: key }));
    state.assets = seed;
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    // js/12의 JSON 복원 경로가 하는 일과 동일: parsed.assets.map(normalizeImportedAsset)
    const restored = blob.assets.map(normalizeImportedAsset);
    return { before: seed.map((a) => a.rateMatchOverride), after: restored.map((a) => a.rateMatchOverride) };
  `);
  expect(got.after).toEqual(got.before);
  expect(got.after).toEqual(['005930.KS', '0052D0.KS', 'BOND.STOCK', 'CASH.USD']);
});

test('C. 클라우드 병합(serialize → normalize → merge)에서도 지정이 보존된다', async ({ page }) => {
  await boot(page);
  // 원격 레코드가 updatedAt으로 이겨서 채택되는 경우가 가장 위험하다 - 그때 원격 쪽 정규화가
  // 필드를 잃으면 로컬에 살아 있던 사용자 지정이 통째로 교체되어 사라진다.
  const got = await withState(page, `
    const local = Object.assign(makeAsset({ ticker: '140860.KQ', owner: '신랑', accountType: '일반계좌',
      name: '파크시스템스', currency: 'KRW', quantity: 24, buyPrice: 100 }), { rateMatchOverride: 'KOSDAQ', updatedAt: 1000 });
    state.assets = [local];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const remoteRaw = blob.assets[0];
    remoteRaw.quantity = 30;
    remoteRaw.updatedAt = 2000; // 원격이 더 최신 - mergeCollectionById가 원격을 채택한다
    const remote = [normalizeImportedAsset(remoteRaw)];
    const merged = mergeCollectionById(state.assets, remote, new Set());
    return { 채택된수량: merged[0].quantity, key: merged[0].rateMatchOverride,
      rate: getAssetProjectionRate(merged[0], 'normal') };
  `);
  expect(got.채택된수량, '원격이 채택되었는지 확인').toBe(30);
  expect(got.key).toBe('KOSDAQ');
  expect(got.rate).toBe(7);
});

test('D. 최초 페어링(원격 통째 채택)에서도 지정이 보존된다', async ({ page }) => {
  await boot(page);
  // fullAdopt 경로(js/12)는 병합 없이 parsed.assets.map(normalizeImportedAsset)로 통째 교체한다.
  const got = await withState(page, `
    state.assets = [Object.assign(makeAsset({ ticker: 'TLT', owner: '신랑', accountType: '일반계좌',
      name: 'iShares 20+ Year Treasury Bond ETF', currency: 'USD', quantity: 1, buyPrice: 90 }),
      { rateMatchOverride: 'BOND' })];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const adopted = blob.assets.map(normalizeImportedAsset);
    return { key: adopted[0].rateMatchOverride, rate: getAssetProjectionRate(adopted[0], 'normal') };
  `);
  // 미국 채권 ETF는 성격만으로는 UNRESOLVED(0%)지만, 사용자가 BOND를 직접 지정했으면 그 값이 우선한다.
  expect(got.key).toBe('BOND');
  expect(got.rate).toBe(4);
});

/* ─────────── 2. 값의 형태별 정규화 (E~H) ─────────── */

test('E~H. 지정 없음/빈칸/정상값/내부상태값이 각각 올바르게 처리된다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    // sanitizeRateMatchOverride 자체의 규칙(makeAsset과 normalizeImportedAsset이 공유한다)
    없음: sanitizeRateMatchOverride(undefined) === undefined,
    널: sanitizeRateMatchOverride(null) === undefined,
    빈문자열: sanitizeRateMatchOverride('') === undefined,
    공백만: sanitizeRateMatchOverride('   ') === undefined,
    UNRESOLVED: sanitizeRateMatchOverride('UNRESOLVED') === undefined,
    정상값: sanitizeRateMatchOverride('  KOSPI  '),
    // 복원 경로에서도 같은 규칙이 적용되는가
    복원_없음: 'rateMatchOverride' in normalizeImportedAsset({ ticker: 'A', name: 'A' })
      ? normalizeImportedAsset({ ticker: 'A', name: 'A' }).rateMatchOverride : 'FIELD_MISSING',
    복원_빈문자: normalizeImportedAsset({ ticker: 'A', name: 'A', rateMatchOverride: '' }).rateMatchOverride,
    복원_UNRESOLVED: normalizeImportedAsset({ ticker: 'A', name: 'A', rateMatchOverride: 'UNRESOLVED' }).rateMatchOverride,
    복원_정상: normalizeImportedAsset({ ticker: 'A', name: 'A', rateMatchOverride: 'KOSPI' }).rateMatchOverride,
    // 엑셀 경로(makeAsset)도 같은 규칙을 쓴다 - 두 경로가 갈라지면 안 된다
    엑셀_UNRESOLVED: makeAsset({ ticker: 'A', name: 'A', rateMatchOverride: 'UNRESOLVED' }).rateMatchOverride,
    엑셀_정상: makeAsset({ ticker: 'A', name: 'A', rateMatchOverride: ' KOSPI ' }).rateMatchOverride
  }));
  expect(got.없음).toBe(true);
  expect(got.널).toBe(true);
  expect(got.빈문자열).toBe(true);
  expect(got.공백만).toBe(true);
  expect(got.UNRESOLVED, '내부 계산 상태를 사용자 지정으로 굳히지 않는다').toBe(true);
  expect(got.정상값).toBe('KOSPI');
  expect(got.복원_없음).toBeUndefined();
  expect(got.복원_빈문자).toBeUndefined();
  expect(got.복원_UNRESOLVED).toBeUndefined();
  expect(got.복원_정상).toBe('KOSPI');
  expect(got.엑셀_UNRESOLVED).toBeUndefined();
  expect(got.엑셀_정상).toBe('KOSPI');
});

test('H-2. 지정이 없는 자산은 복원 후에도 자동판별 상태로 남는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    state.assets = [makeAsset({ ticker: '114260.KS', owner: '신랑', accountType: '일반계좌',
      name: 'KODEX 국고채3년', currency: 'KRW', quantity: 1, buyPrice: 100000 })];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const restored = normalizeImportedAsset(blob.assets[0]);
    return { key: restored.rateMatchOverride === undefined ? 'UNDEFINED' : restored.rateMatchOverride,
      source: resolveAssetGroupKeyDetail(restored).source,
      appliedKey: resolveAssetGroupKeyDetail(restored).key,
      rate: getAssetProjectionRate(restored, 'normal') };
  `);
  expect(got.key).toBe('UNDEFINED');
  expect(got.source, '자동판별이 그대로 살아 있어야 한다').toBe('assetCharacter');
  expect(got.appliedKey).toBe('BOND');
  expect(got.rate).toBe(4);
});

/* ─────────── 3. 다른 사용자 설정과의 동시 보존 (I, J) ─────────── */

test('I. customScenarioRates와 rateMatchOverride가 함께 보존된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 } };
    state.assets = [Object.assign(makeAsset({ ticker: '237370.KS', owner: '신랑', accountType: 'IRP',
      name: 'KODEX 코리아배당성장채권혼합', currency: 'KRW', quantity: 450, buyPrice: 14057 }),
      { rateMatchOverride: 'BOND.STOCK' })];
    const beforeRate = getAssetProjectionRate(state.assets[0], 'normal');
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const restored = normalizeImportedAsset(blob.assets[0]);
    return { beforeRate, afterRate: getAssetProjectionRate(restored, 'normal'),
      key: restored.rateMatchOverride,
      csrBlob: blob.projection && blob.projection.customScenarioRates && blob.projection.customScenarioRates['BOND.STOCK'],
      csrLive: state.projection.customScenarioRates['BOND.STOCK'] };
  `);
  expect(got.beforeRate).toBe(6);
  expect(got.afterRate, '사용자 등록 수익률이 그대로 적용되어야 한다').toBe(6);
  expect(got.key).toBe('BOND.STOCK');
  expect(got.csrBlob).toEqual({ label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 });
  expect(got.csrLive, '복원 과정이 사용자 등록값을 훼손하지 않는다').toEqual(got.csrBlob);
});

test('J. Golden 사용자의 13개 대표매칭 키가 백업 왕복 후에도 같은 값을 낸다', async ({ page }) => {
  await boot(page);
  const GOLDEN = {
    'BOND': [3, 4, 5], 'KOSPI': [4, 6, 9], 'KOSDAQ': [4, 8, 12], '005930.KS': [6, 8, 11],
    'S&P500': [6, 9, 11], 'SCHD': [6.5, 9.5, 11.5], 'NASDAQ': [8, 11, 14], 'GOOGL': [7.5, 11, 15],
    'BOND.STOCK': [3, 6, 9], '0052D0.KS': [5, 7, 11], '000660.KS': [5, 10, 15],
    'CASH': [2, 3, 4], 'CASH.USD': [2, 3, 4]
  };
  const got = await page.evaluate(([golden, presets]) => {
    const snap = {
      assets: JSON.parse(JSON.stringify(state.assets)),
      csr: JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}))
    };
    try {
      const custom = {};
      Object.keys(golden).forEach((k) => {
        custom[k] = { label: k, conservative: golden[k][0], normal: golden[k][1], optimistic: golden[k][2] };
      });
      state.projection.customScenarioRates = custom;
      state.assets = Object.keys(golden).map((k) => Object.assign(
        makeAsset({ ticker: 'ZZG', owner: '신랑', accountType: '일반계좌', name: 'GOLDEN-' + k, currency: 'KRW', quantity: 1, buyPrice: 1 }),
        { rateMatchOverride: k }));
      const before = {};
      state.assets.forEach((a, i) => { before[Object.keys(golden)[i]] = presets.map((p) => getAssetProjectionRate(a, p)); });
      const restored = JSON.parse(JSON.stringify(buildSyncBlob())).assets.map(normalizeImportedAsset);
      const after = {};
      restored.forEach((a, i) => { after[Object.keys(golden)[i]] = presets.map((p) => getAssetProjectionRate(a, p)); });
      const keys = restored.map((a) => a.rateMatchOverride);
      return { before, after, keys };
    } finally {
      state.assets = snap.assets;
      state.projection.customScenarioRates = snap.csr;
    }
  }, [GOLDEN, PRESETS]);
  expect(got.keys).toEqual(Object.keys(GOLDEN));   // 13개 키 전부 살아남았다
  expect(got.before).toEqual(GOLDEN);              // 복원 전 = 등록값
  expect(got.after).toEqual(GOLDEN);               // 복원 후 = 등록값 (이 줄이 F-1 회귀를 막는다)
});

/* ─────────── 4. 계산 결과가 달라지지 않았다 ─────────── */

test('K. Deterministic 경로와 MC adapter 경로가 복원 전후로 동일하다', async ({ page }) => {
  await boot(page);
  const mismatches = await page.evaluate((presets) => {
    const snap = { assets: JSON.parse(JSON.stringify(state.assets)) };
    try {
      const cases = [
        ['140860.KQ', '파크시스템스', 'KRW', 'KOSDAQ', '국내'],
        ['114260.KS', 'KODEX 국고채3년', 'KRW', undefined, '국내'],
        ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD', 'BOND', '해외'],
        ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', undefined, '해외']
      ];
      const bad = [];
      cases.forEach(([t, n, c, key, region]) => {
        const a = Object.assign(makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: c, quantity: 1, buyPrice: 100 }),
          key ? { rateMatchOverride: key } : {});
        state.assets = [a];
        const restored = normalizeImportedAsset(JSON.parse(JSON.stringify(buildSyncBlob())).assets[0]);
        presets.forEach((p) => {
          const detBefore = getAssetProjectionRate(a, p);
          const detAfter = getAssetProjectionRate(restored, p);
          const mcAfter = getTargetProjectionRate(
            { type: 'ticker', ticker: t, label: n, category: restored.category, rateMatchOverride: restored.rateMatchOverride }, p, region);
          if (detBefore !== detAfter || detAfter !== mcAfter) bad.push({ n, p, detBefore, detAfter, mcAfter });
        });
      });
      return bad;
    } finally { state.assets = snap.assets; }
  }, PRESETS);
  expect(mismatches).toEqual([]);
});

test('L. UNRESOLVED 처리 정책이 훼손되지 않았다', async ({ page }) => {
  await boot(page);
  // 지정이 없고 성격도 확인되지 않는 자산은 복원 후에도 여전히 "가정 없음"이어야 한다 -
  // 이번 수정이 UNRESOLVED를 우회하는 뒷문을 만들지 않았음을 확인한다.
  const got = await withState(page, `
    state.assets = [makeAsset({ ticker: 'ZZETF', owner: '신랑', accountType: '일반계좌',
      name: 'Unknown Global ETF', currency: 'USD', quantity: 1, buyPrice: 10 })];
    const restored = normalizeImportedAsset(JSON.parse(JSON.stringify(buildSyncBlob())).assets[0]);
    const d = resolveAssetGroupKeyDetail(restored);
    return { key: d.key, source: d.source, rate: getAssetProjectionRate(restored, 'normal'),
      override: restored.rateMatchOverride === undefined ? 'UNDEFINED' : restored.rateMatchOverride };
  `);
  expect(got.key).toBe('UNRESOLVED');
  expect(got.source).toBe('unresolved');
  expect(got.rate).toBe(0);
  expect(got.override, 'UNRESOLVED가 사용자 지정으로 굳지 않는다').toBe('UNDEFINED');
});
