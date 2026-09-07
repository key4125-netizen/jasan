// E2E-53 Phase 53 - 엑셀로 내보냈다 다시 가져와도 앱이 사용자의 자산을 다른 자산으로 만들지 않는다.
//
// [고치는 것 - Phase 52 감사에서 실측한 V1.0 BLOCKER 3건]
//   1) category를 읽지 않아 티커 없는 자산이 왕복마다 '주식'이 됐다.
//      표시만의 문제가 아니었다 - 원화 현금 보호막이 category에 걸려 있어 잔고가 줄었고
//      (5,000,000 -> 100), assetMergeKey에도 category가 들어가 [추가하기]가 자산을 복제했다.
//   2) buyRate가 시트에 아예 없어 외화 원가가 오늘 환율로 바뀌었다(수익률 61% -> 33%).
//   3) id를 새로 발급해, 엑셀로 복원한 기기가 클라우드와 처음 페어링할 때 자산이 두 벌이 됐다.
//
// [검증 방식] 규칙을 테스트에 옮겨 적지 않는다. 실제 [엑셀 내보내기] 버튼이 만든 워크북을 실제
// #excelFileInput에 그대로 올려 왕복시킨다(e2e/50과 같은 방식).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof makeAsset === 'function'
    && typeof sanitizeAssetCategory === 'function' && typeof sanitizeBuyRate === 'function');
  page.on('dialog', (d) => d.accept()); // 엑셀 업로드는 alert로 결과를 알린다
}

// 실제 내보내기 버튼을 누르고, 만들어진 워크북을 그대로 돌려준다.
// XLSX.writeFile만 테스트에서 가로챈다(앱 코드는 건드리지 않는다).
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

// 내보낸 시트에서 특정 컬럼을 지워 "구형 엑셀 파일"을 만든다(하위호환 검증용).
async function makeLegacyBook(page, base64, dropColumns) {
  return page.locator('#exportExcelBtn').evaluate((btn, [b64, drop]) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => { const c = Object.assign({}, r); drop.forEach((k) => delete c[k]); return c; });
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, [base64, dropColumns]);
}

async function importReal(page, base64, mode) {
  const file = path.join(os.tmpdir(), `e2e53-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  try {
    await page.setInputFiles('#excelFileInput', file);
    await page.locator(mode === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Array.isArray(state.assets) && state.assets.length > 0);
    await page.waitForTimeout(300);
  } finally { try { fs.unlinkSync(file); } catch { /* 임시파일 정리 실패는 무시 */ } }
}

// 왕복 전후를 같은 기준으로 찍는다 - 사용자가 실제로 보는 값과 계산에 들어가는 값을 함께 본다.
const SNAPSHOT = `
  state.assets.map((a) => {
    const r = calcRow(a);
    const d = resolveAssetGroupKeyDetail(a);
    return { 종목: a.name, id: a.id, category: a.category, 수량: a.quantity, 매수단가: a.buyPrice,
      취득환율: a.buyRate === undefined ? 'UNDEFINED' : a.buyRate, 통화: a.currency,
      소유자: a.owner, 계좌: a.accountType, ticker: a.ticker,
      매입금액KRW: Math.round(r.buyAmount), 평가금액: Math.round(r.curAmount),
      평가손익: Math.round(r.profit), 수익률: Math.round(r.rateOfReturn * 100) / 100,
      적용ReturnKey: d.key, 적용수익률: getAssetProjectionRate(a, 'normal'),
      RiskUniverse: RISK_ELIGIBLE_CATEGORIES.includes(a.category),
      Projection포함: isRebalanceEligibleAccount(a) && a.category !== '부동산',
      override: a.rateMatchOverride === undefined ? 'UNDEFINED' : a.rateMatchOverride,
      positionSource: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource };
  }).sort((x, y) => x.종목.localeCompare(y.종목))
`;
const snapshot = (page) => page.evaluate((b) => new Function('return (' + b + ')')(), SNAPSHOT);

// Phase 52가 실제로 손상을 재현한 바로 그 자산들 + 대표 5종
const SEED = `
  const mk = (o) => makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌',
    currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200 }, o));
  state.transactions = [];
  state.assets = [
    mk({ ticker: '005930.KS', name: '삼성전자' }),
    mk({ ticker: '069500.KS', name: 'KODEX 200' }),
    mk({ ticker: '', name: '국고채 10년물', category: '채권' }),
    mk({ ticker: '', name: '생활비 통장', category: '현금', quantity: 5000000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: '청약통장', category: '현금', quantity: 3000000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: '전세보증금', category: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 300000000 }),
    mk({ ticker: '', name: '금 현물', category: '원자재' }),
    mk({ ticker: '', name: '비트코인', category: '암호화폐' })
  ];
  persistAssets();
`;

/* ═════════ P0-1. category 보존 ═════════ */

test('P0-1. 엑셀 왕복이 자산군을 바꾸지 않는다(원자재·암호화폐 포함)', async ({ page }) => {
  await boot(page);
  await page.evaluate((s) => new Function(s)(), SEED);
  const before = await snapshot(page);

  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'overwrite');
  const after = await snapshot(page);

  // 자동판별이 애초에 만들 수 없는 분류(원자재·암호화폐)까지 살아남아야 한다.
  expect(after.map((a) => [a.종목, a.category]))
    .toEqual(before.map((a) => [a.종목, a.category]));
  expect(before.find((a) => a.종목 === '금 현물').category).toBe('원자재');
  expect(before.find((a) => a.종목 === '비트코인').category).toBe('암호화폐');

  // category가 좌우하던 나머지도 함께 유지되는지 본다(표시만의 문제가 아니었다).
  for (const b of before) {
    const a = after.find((x) => x.종목 === b.종목);
    expect(a.적용ReturnKey, `${b.종목} 적용 Return Key`).toBe(b.적용ReturnKey);
    expect(a.적용수익률, `${b.종목} 적용 수익률`).toBe(b.적용수익률);
    expect(a.RiskUniverse, `${b.종목} Risk Universe`).toBe(b.RiskUniverse);
    expect(a.Projection포함, `${b.종목} Projection 포함`).toBe(b.Projection포함);
    expect(a.수량, `${b.종목} 수량`).toBe(b.수량);
    expect(a.매수단가, `${b.종목} 매수단가`).toBe(b.매수단가);
    expect(a.평가금액, `${b.종목} 평가금액`).toBe(b.평가금액);
  }
});

test('P0-1-2. 시트에 앱이 모르는 자산군이 적혀 있으면 예전처럼 자동분류로 되돌아간다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    허용목록: ASSET_CATEGORIES.slice(),
    정상: sanitizeAssetCategory('원자재'),
    공백포함: sanitizeAssetCategory(' 현금 '),
    모르는값: sanitizeAssetCategory('내맘대로분류') === undefined,
    빈칸: sanitizeAssetCategory('') === undefined,
    없음: sanitizeAssetCategory(undefined) === undefined
  }));
  expect(got.허용목록).toEqual(['주식', 'ETF', '채권', '현금', '부동산', '원자재', '암호화폐']);
  expect(got.정상).toBe('원자재');
  expect(got.공백포함).toBe('현금');
  for (const k of ['모르는값', '빈칸', '없음']) expect(got[k], k).toBe(true);

  // 검증은 실제 가져오기 경로로 한다. makeAsset 자체는 호출부가 준 값을 그대로 믿는다(자산 폼이
  // 직접 입력한 분류를 앱이 임의로 고쳐서는 안 되기 때문) - 시트에서 온 값만 걸러낸다.
  await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: 'KODEX 200',
      category: '원자재', currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 })];
    state.transactions = [];
    persistAssets();
  });
  const exported = await exportReal(page);
  const 오염된파일 = await page.locator('#exportExcelBtn').evaluate((btn, b64) => {
    const XL = btn.ownerDocument.defaultView.XLSX;
    const wb = XL.read(b64, { type: 'base64' });
    const rows = XL.utils.sheet_to_json(wb.Sheets['자산목록'], { defval: '' })
      .map((r) => Object.assign({}, r, { '자산군(자동분류)': '내맘대로분류' }));
    const out = XL.utils.book_new();
    XL.utils.book_append_sheet(out, XL.utils.json_to_sheet(rows), '자산목록');
    return XL.write(out, { type: 'base64', bookType: 'xlsx' });
  }, exported.base64);
  await importReal(page, 오염된파일, 'overwrite');

  const after = await page.evaluate(() => state.assets.map((a) => a.category));
  expect(after, '새 분류를 만들어내지 않고 자동분류로 되돌아간다').toEqual(['ETF']);
});

test('P0-1-3. Case 1 - 원화 현금 잔고가 왕복 후에도 거래원장에 덮어써지지 않는다', async ({ page }) => {
  await boot(page);
  // 보호막이 asset.category === '현금'에 걸려 있다. 재분류되면 그 순간 보호가 사라졌다.
  await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '생활비 통장',
      category: '현금', currency: 'KRW', quantity: 5000000, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [{ id: genId(), date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: '', name: '생활비 통장', type: 'buy', quantity: 100, price: 1, currency: 'KRW', fee: 0, createdAt: 1 }];
    persistAssets(); persistTransactions();
  });
  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'overwrite');
  const got = await page.evaluate(() => {
    syncAssetsFromTransactions(); // 다음 부팅과 같은 일이 벌어진다
    const a = state.assets[0];
    return { category: a.category, 수량: a.quantity };
  });
  expect(got.category).toBe('현금');
  expect(got.수량, '거래원장(100)에 끌려가지 않는다').toBe(5000000);
});

test('P0-1-4. 엑셀 [추가하기]가 같은 자산을 복제하지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate((s) => new Function(s)(), SEED);
  const beforeCount = await page.evaluate(() => state.assets.length);
  const beforeTotal = await page.evaluate(() => Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)));

  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'append');

  const after = await page.evaluate(() => ({
    count: state.assets.length,
    total: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0))
  }));
  expect(after.count, '자산 수가 늘지 않는다').toBe(beforeCount);
  expect(after.total, '총액이 두 배가 되지 않는다').toBe(beforeTotal);
});

/* ═════════ P0-2. buyRate 보존 ═════════ */

test('P0-2. Case 5 - 외화 취득환율이 오늘 환율로 바뀌지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const usd = makeAsset({ ticker: 'GOOGL', owner: '신랑', accountType: '일반계좌', name: 'Alphabet',
      isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 150, currentPrice: 200 });
    usd.buyRate = 1200;
    // 거래내역이 없는 외화 자산 - 사라지면 복구할 경로가 아예 없다
    const cash = makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '달러 예금',
      category: '현금', isDomestic: '해외', currency: 'USD', quantity: 1000, buyPrice: 1, currentPrice: 1 });
    cash.buyRate = 1150;
    const krw = makeAsset({ ticker: '005930.KS', owner: '신랑', accountType: '일반계좌', name: '삼성전자',
      currency: 'KRW', quantity: 10, buyPrice: 70000, currentPrice: 80000 });
    state.assets = [usd, cash, krw];
    state.transactions = [];
    state.exchangeRate = 1450; // 오늘 환율은 취득환율과 다르다
    persistAssets();
  });
  const before = await snapshot(page);

  const exported = await exportReal(page);
  // 시트에 실제로 값이 실려 나가는지부터 확인한다(원화는 빈 칸이어야 한다).
  const cells = exported.rows.map((r) => [r['종목명'], r['취득환율(매수시점)']]);
  expect(cells).toEqual(expect.arrayContaining([['Alphabet', 1200], ['달러 예금', 1150], ['삼성전자', '']]));

  await importReal(page, exported.base64, 'overwrite');
  // 오늘 환율을 한 번 더 바꿔도 취득환율은 흔들리지 않아야 한다.
  await page.evaluate(() => { state.exchangeRate = 1450; renderAll(); });
  const after = await snapshot(page);

  for (const b of before) {
    const a = after.find((x) => x.종목 === b.종목);
    expect(a.취득환율, `${b.종목} 취득환율`).toBe(b.취득환율);
    expect(a.매입금액KRW, `${b.종목} 매입금액(KRW)`).toBe(b.매입금액KRW);
    expect(a.평가금액, `${b.종목} 평가금액`).toBe(b.평가금액);
    expect(a.평가손익, `${b.종목} 평가손익`).toBe(b.평가손익);
    expect(a.수익률, `${b.종목} 수익률`).toBe(b.수익률);
  }
  // 환차손익이 살아 있다는 것을 값으로도 남긴다(오늘 환율을 썼다면 0%가 된다).
  expect(after.find((x) => x.종목 === '달러 예금').수익률).toBeGreaterThan(0);
});

test('P0-2-2. 취득환율 정규화 규칙', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    숫자: sanitizeBuyRate(1200), 문자열: sanitizeBuyRate('1,200'),
    빈칸: sanitizeBuyRate('') === undefined, 없음: sanitizeBuyRate(undefined) === undefined,
    // 0이면 매입원가가 0이 되어 수익률이 무한대가 된다 - 저장하지 않고 기존 폴백에 맡긴다
    영: sanitizeBuyRate(0) === undefined, 음수: sanitizeBuyRate(-100) === undefined,
    글자: sanitizeBuyRate('없음') === undefined
  }));
  expect(got.숫자).toBe(1200);
  expect(got.문자열).toBe(1200);
  for (const k of ['빈칸', '없음', '영', '음수', '글자']) expect(got[k], k).toBe(true);
});

/* ═════════ P0-3. id 보존 ═════════ */

test('P0-3. Scenario A - 왕복 후 자산 id가 그대로다', async ({ page }) => {
  await boot(page);
  await page.evaluate((s) => new Function(s)(), SEED);
  const before = await snapshot(page);
  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'overwrite');
  const after = await snapshot(page);
  expect(after.map((a) => [a.종목, a.id])).toEqual(before.map((a) => [a.종목, a.id]));
});

test('P0-3-2. Scenario B - 엑셀로 복원한 기기가 클라우드와 처음 페어링해도 중복되지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: '005930.KS', owner: '신랑', accountType: '일반계좌', name: '삼성전자',
        currency: 'KRW', quantity: 10, buyPrice: 70000, currentPrice: 80000 }),
      makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '서울 아파트',
        category: '부동산', currency: 'KRW', quantity: 1, buyPrice: 500000000, currentPrice: 500000000 })
    ];
    state.transactions = [];
    persistAssets();
  });
  // 클라우드에 이미 올라가 있는 원본(= 이 자산들 그대로)
  const remote = await page.evaluate(() => JSON.parse(JSON.stringify(buildSyncBlob().assets)));

  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'overwrite'); // 새 기기에서 엑셀로 복원한 상황

  const merged = await page.evaluate((remoteAssets) => {
    // 처음 페어링하는 기기 = baseline이 비어 있다(Phase 52에서 중복이 났던 바로 그 조건)
    const out = mergeCollectionById(state.assets, remoteAssets.map(normalizeImportedAsset), new Set());
    return { 자산수: out.length, 이름들: out.map((a) => a.name).sort() };
  }, remote);
  expect(merged.자산수, '같은 자산이 두 벌로 남지 않는다').toBe(2);
  expect(merged.이름들).toEqual(['삼성전자', '서울 아파트']);
});

test('P0-3-3. 한 파일 안에 같은 id가 두 번 있으면 뒤쪽에 새 id를 준다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const rows = [{ id: 'DUP-1', name: 'A' }, { id: 'DUP-1', name: 'B' }, { id: '', name: 'C' }];
    const seen = new Set();
    const made = rows.map((row) => makeAsset({
      id: (() => { const id = sanitizeAssetId(row.id); if (!id || seen.has(id)) return undefined; seen.add(id); return id; })(),
      ticker: '', name: row.name, owner: '신랑', accountType: '일반계좌', currency: 'KRW', quantity: 1, buyPrice: 1
    }));
    return { ids: made.map((a) => a.id), 고유: new Set(made.map((a) => a.id)).size };
  });
  expect(got.ids[0]).toBe('DUP-1');
  expect(got.ids[1]).not.toBe('DUP-1');
  expect(got.고유, 'id가 겹치지 않는다').toBe(3);
});

/* ═════════ 하위호환 - 구형 엑셀 파일 ═════════ */

test('구형 엑셀(컬럼 없음)도 그대로 열리고 예전 동작을 유지한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const usd = makeAsset({ ticker: 'GOOGL', owner: '신랑', accountType: '일반계좌', name: 'Alphabet',
      isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 150, currentPrice: 200 });
    usd.buyRate = 1200;
    state.assets = [usd, makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '전세보증금',
      category: '부동산', currency: 'KRW', quantity: 1, buyPrice: 300000000, currentPrice: 300000000 })];
    state.transactions = [];
    state.exchangeRate = 1450;
    persistAssets();
  });
  const beforeIds = await page.evaluate(() => state.assets.map((a) => a.id));
  const exported = await exportReal(page);
  // Phase 53 이전 파일 = id / 취득환율 칸이 아예 없다(자산군 칸은 예전에도 있었다)
  const legacyBook = await makeLegacyBook(page, exported.base64, ['id', '취득환율(매수시점)']);
  await importReal(page, legacyBook, 'overwrite');

  const got = await page.evaluate(() => state.assets.map((a) => ({
    종목: a.name, id: a.id, category: a.category,
    취득환율: a.buyRate === undefined ? 'UNDEFINED' : a.buyRate, 수량: a.quantity
  })));
  expect(got.length, '가져오기가 실패하지 않는다').toBe(2);
  // id 칸이 없으면 예전처럼 새로 발급된다.
  expect(got.every((a) => a.id && !beforeIds.includes(a.id)), '새 id 발급').toBe(true);
  // 취득환율 칸이 없으면 예전 폴백(오늘 환율) 그대로 - 없던 값을 추정해 만들지 않는다.
  expect(got.find((a) => a.종목 === 'Alphabet').취득환율).toBe('UNDEFINED');
  // 자산군 칸은 예전에도 있었으므로 이제 정상 복원된다.
  expect(got.find((a) => a.종목 === '전세보증금').category).toBe('부동산');
});

/* ═════════ 다른 정책이 다치지 않았는가 ═════════ */

test('Phase 48-A Return Key 규칙과 positionSource 정책이 그대로다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mk = (name, ticker, src, override) => {
      const a = makeAsset({ ticker, owner: '신랑', accountType: '일반계좌', name, category: '부동산',
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      if (src) a.positionSource = src; else delete a.positionSource;
      if (override) a.rateMatchOverride = override;
      return a;
    };
    state.assets = [mk('자동판별자산', '069500.KS', 'ledger', null),
      mk('사용자지정자산', '140860.KQ', 'manual', 'KOSDAQ'),
      mk('레거시자산', '', null, null)];
    state.transactions = [];
    persistAssets();
  });
  const exported = await exportReal(page);
  const cell = (n) => (exported.rows.find((r) => r['종목명'] === n) || {})['대표매칭(수익률연동키)'];
  expect(cell('자동판별자산'), '자동 판별 키는 엑셀에 쓰지 않는다').toBe('');
  expect(cell('사용자지정자산'), '사용자 지정만 나간다').toBe('KOSDAQ');

  await importReal(page, exported.base64, 'overwrite');
  const after = await page.evaluate(() => state.assets.map((a) => ({
    종목: a.name, override: a.rateMatchOverride === undefined ? 'UNDEFINED' : a.rateMatchOverride,
    적용키: resolveAssetGroupKeyDetail(a).key, source: resolveAssetGroupKeyDetail(a).source,
    positionSource: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource })));
  const find = (n) => after.find((x) => x.종목 === n);
  expect(find('자동판별자산').override, '자동 판별이 사용자 지정으로 굳지 않는다').toBe('UNDEFINED');
  expect(find('자동판별자산').source).not.toBe('override');
  expect(find('사용자지정자산').override).toBe('KOSDAQ');
  expect(find('사용자지정자산').적용키).toBe('KOSDAQ');
  // [V1.1 M4로 해결됨] 이 줄은 원래 "덮어쓰기에서는 positionSource가 사라진다"는 당시의 한계를
  // 사실 그대로 고정하고 있었다. M4가 그 한계를 없앴다 - 엑셀 컬럼을 만들지 않고, Phase 53이
  // 보존하게 된 id(없으면 identity)로 기존 자산을 찾아 이어받는다. 자세한 규칙은 e2e/56 참고.
  expect(after.map((a) => a.positionSource)).toEqual(['ledger', 'manual', 'UNDEFINED']);
});

test('왕복이 대시보드 합계와 Monte Carlo 입력을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate((s) => new Function(s)(), SEED);
  const measure = () => page.evaluate(async () => ({
    총평가액: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
    소유자별: ['신랑', '신부'].map((o) => [o, Math.round(state.assets.filter((a) => a.owner === o)
      .reduce((s, a) => s + calcRow(a).curAmount, 0))]),
    결정론적그룹: (() => { const g = getProjectionGroupStats(null);
      return Object.keys(g).sort().map((k) => [k, Math.round(g[k].value)]); })(),
    MC입력: await (async () => {
      const r = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      return { order: r.assetOrder, errors: r.errors,
        instruments: (r.instruments || []).map((i) => [i.key, i.weight, i.muAnnual, i.sigmaAnnual]) };
    })()
  }));
  const before = await measure();
  const exported = await exportReal(page);
  await importReal(page, exported.base64, 'overwrite');
  const after = await measure();
  expect(after.총평가액).toBe(before.총평가액);
  expect(after.소유자별).toEqual(before.소유자별);
  expect(after.결정론적그룹).toEqual(before.결정론적그룹);
  expect(after.MC입력).toEqual(before.MC입력);
});
