// E2E-54 V1.1 Phase 1 - 소유자 정책. 모든 자산은 신랑 또는 와이프 중 한 명이 소유한다.
//
// [왜 필요한가]
// 예전에는 '공동'도 고를 수 있었는데, 계산 경로마다 취급이 달랐다. 결정론적 미래예측은 소유자를
// 가리지 않아 공동 자산을 포함하는데, Monte Carlo의 자산배분 가중치는 REBALANCE_OWNERS(신랑/와이프)
// 만 돌기 때문에 공동 자산의 금액이 basis에서 빠진다. 같은 포트폴리오를 두 엔진이 다르게 본다.
// 공동을 위한 별도 계산체계를 만드는 대신 입력 단계에서 막는다.
//
// [이 파일이 고정하는 두 가지 서로 다른 규칙]
//   신규 입력(자산 폼 / 거래 폼) -> 유효하지 않은 소유자는 저장을 거부한다.
//   가져오기·복원(Excel / JSON / Cloud) -> 있는 그대로 보존한다. 조용히 바꾸는 것이 더 위험하다.
//
// 이 둘을 하나로 합치면 안 된다. 막아야 할 곳에서 보존하면 정책이 무의미해지고,
// 보존해야 할 곳에서 막으면 기존 사용자 데이터가 조용히 바뀐다.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof isValidOwner === 'function' && typeof makeAsset === 'function');
  page.on('dialog', (d) => d.accept());
}

// state를 건드린 뒤 반드시 원복한다.
const withState = (page, body) => page.evaluate((b) => {
  const snap = { assets: JSON.parse(JSON.stringify(state.assets)),
    tx: JSON.parse(JSON.stringify(state.transactions)) };
  try { return new Function(b)(); }
  finally { state.assets = snap.assets; state.transactions = snap.tx; }
}, body);

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
async function importReal(page, base64) {
  const f = path.join(os.tmpdir(), `e2e54-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(f, Buffer.from(base64, 'base64'));
  try {
    await page.setInputFiles('#excelFileInput', f);
    await page.locator('#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    await page.waitForTimeout(400);
  } finally { try { fs.unlinkSync(f); } catch { /* 무시 */ } }
}

/* ══════ 정책 정의 ══════ */

test('0. 허용 소유자는 신랑/와이프 둘뿐이다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    허용목록: VALID_ASSET_OWNERS.slice(),
    리밸런싱소유자와_동일: VALID_ASSET_OWNERS === REBALANCE_OWNERS
      || JSON.stringify(VALID_ASSET_OWNERS) === JSON.stringify(REBALANCE_OWNERS),
    신랑: isValidOwner('신랑'), 와이프: isValidOwner('와이프'),
    공백포함: isValidOwner(' 신랑 '),
    공동: isValidOwner('공동'), 빈값: isValidOwner(''),
    없음: isValidOwner(undefined), 널: isValidOwner(null),
    임의문자열: isValidOwner('오타난이름')
  }));
  expect(got.허용목록).toEqual(['신랑', '와이프']);
  expect(got.리밸런싱소유자와_동일, 'MC/리밸런싱이 도는 소유자와 같아야 한다').toBe(true);
  for (const k of ['신랑', '와이프', '공백포함']) expect(got[k], k).toBe(true);
  for (const k of ['공동', '빈값', '없음', '널', '임의문자열']) expect(got[k], k).toBe(false);
});

test('0-2. 자산/거래 폼의 소유자 선택지에 공동이 없다', async ({ page }) => {
  await boot(page);
  const got = await page.locator('#f_owner').evaluate((el) => {
    const doc = el.ownerDocument;
    const opts = (id) => [...doc.querySelectorAll(`#${id} option`)].map((o) => o.value);
    return { 자산폼: opts('f_owner'), 거래폼: opts('tx_owner') };
  });
  expect(got.자산폼).toEqual(['신랑', '와이프']);
  expect(got.거래폼).toEqual(['신랑', '와이프']);
});

test('0-3. makeAsset이 빈 소유자를 공동으로 채우지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const mk = (owner) => makeAsset({ ticker: '', name: 'X', owner, currency: 'KRW',
      quantity: 1, buyPrice: 1000, currentPrice: 1000 }).owner;
    return { 빈값: mk(''), 없음: mk(undefined), 공동유지: mk('공동'), 신랑: mk('신랑') };
  });
  expect(got.빈값, '빈 값은 빈 값으로 남는다(신랑/공동으로 몰래 채우지 않는다)').toBe('');
  expect(got.없음).toBe('');
  expect(got.공동유지, '기존 공동 값은 그대로 보존된다').toBe('공동');
  expect(got.신랑).toBe('신랑');
});

/* ══════ A. 신규 자산 입력 ══════ */

test('A. 자산 폼은 신랑/와이프만 저장하고 나머지는 거부한다', async ({ page }) => {
  await boot(page);
  const submit = async (label, owner) => page.locator('#assetForm').evaluate((form, [name, own]) => {
    const doc = form.ownerDocument;
    const win = doc.defaultView;
    state.assets = [];
    openModal('add');
    doc.getElementById('f_manualEntryToggle').checked = true;
    setAssetFormSearchMode(true);
    doc.getElementById('f_name').value = name;
    doc.getElementById('f_quantity').value = '10';
    doc.getElementById('f_buyPrice').value = '1000';
    // select에 없는 값도 강제로 넣어 검증이 UI 선택지에만 의존하지 않는지 본다.
    const sel = doc.getElementById('f_owner');
    if (![...sel.options].some((o) => o.value === own)) sel.add(new win.Option(own, own));
    sel.value = own;
    form.requestSubmit();
    const a = state.assets.find((x) => x.name === name);
    return { 저장됨: !!a, owner: a ? a.owner : null };
  }, [label, owner]);

  expect((await submit('OW-신랑', '신랑')).저장됨, '신랑 PASS').toBe(true);
  expect((await submit('OW-와이프', '와이프')).저장됨, '와이프 PASS').toBe(true);
  expect((await submit('OW-공동', '공동')).저장됨, '공동 BLOCK').toBe(false);
  expect((await submit('OW-빈값', '')).저장됨, '빈 값 BLOCK').toBe(false);
  expect((await submit('OW-임의', '오타난이름')).저장됨, '임의 문자열 BLOCK').toBe(false);
});

/* ══════ B. 신규 거래 입력 ══════ */

test('B. 거래 폼은 신랑/와이프만 저장하고 나머지는 거부한다', async ({ page }) => {
  await boot(page);
  const submit = async (label, owner) => page.locator('#transactionForm').evaluate((form, [name, own]) => {
    const doc = form.ownerDocument;
    const win = doc.defaultView;
    state.transactions = [];
    state.assets = [];
    doc.getElementById('tx_id').value = '';
    doc.getElementById('tx_name').value = name;
    doc.getElementById('tx_ticker').value = 'ZZ54';
    doc.getElementById('tx_date').value = '2026-01-01';
    doc.getElementById('tx_quantity').value = '10';
    doc.getElementById('tx_price').value = '1000';
    doc.getElementById('tx_type').value = 'buy';
    const sel = doc.getElementById('tx_owner');
    if (![...sel.options].some((o) => o.value === own)) sel.add(new win.Option(own, own));
    sel.value = own;
    form.requestSubmit();
    const t = state.transactions.find((x) => x.name === name);
    return { 저장됨: !!t, owner: t ? t.owner : null };
  }, [label, owner]);

  expect((await submit('TX-신랑', '신랑')).저장됨, '신랑 PASS').toBe(true);
  expect((await submit('TX-와이프', '와이프')).저장됨, '와이프 PASS').toBe(true);
  expect((await submit('TX-공동', '공동')).저장됨, '공동 BLOCK').toBe(false);
  expect((await submit('TX-빈값', '')).저장됨, '빈 값 BLOCK').toBe(false);
  expect((await submit('TX-임의', '오타난이름')).저장됨, '임의 문자열 BLOCK').toBe(false);
});

/* ══════ C. Excel - 보존하되 바꾸지 않는다 ══════ */

test('C. 엑셀 왕복이 소유자를 바꾸지 않는다(기존 공동 데이터 포함)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mk = (name, owner) => makeAsset({ ticker: '', owner, accountType: '일반계좌', name,
      category: '부동산', currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200 });
    state.assets = [mk('OW-신랑', '신랑'), mk('OW-와이프', '와이프'),
      mk('OW-공동', '공동'), mk('OW-빈값', ''), mk('OW-임의', '오타난이름')];
    state.transactions = [];
    persistAssets();
  });
  const before = await page.evaluate(() => state.assets.map((a) => [a.name, a.owner]));
  const exported = await exportReal(page);
  await importReal(page, exported.base64);
  const after = await page.evaluate(() => state.assets.map((a) => [a.name, a.owner]));

  expect(after, '가져오기가 소유자를 한 건도 바꾸지 않는다').toEqual(before);
  const owners = Object.fromEntries(after);
  expect(owners['OW-공동'], '공동은 공동인 채로 보존').toBe('공동');
  expect(owners['OW-임의'], '임의 문자열도 신랑/와이프로 바뀌지 않는다').toBe('오타난이름');
  expect(['신랑', '와이프']).not.toContain(owners['OW-빈값']);
});

/* ══════ D. JSON / Cloud - 보존 ══════ */

test('D. 백업·동기화 왕복이 소유자를 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const mk = (name, owner) => makeAsset({ ticker: '', owner, accountType: '일반계좌', name,
      currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
    state.assets = [mk('J-신랑', '신랑'), mk('J-와이프', '와이프'), mk('J-공동', '공동'), mk('J-빈값', '')];
    state.transactions = [{ id: genId(), date: '2026-01-01', owner: '공동', accountType: '일반계좌',
      ticker: 'ZZ54', name: 'J-거래', type: 'buy', quantity: 1, price: 1000, currency: 'KRW', fee: 0, createdAt: 1 }];
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const mine = blob.assets.filter((a) => String(a.name).indexOf('J-') === 0);
    const restoredA = mine.map(normalizeImportedAsset).map((a) => [a.name, a.owner]);
    const restoredT = blob.transactions.filter((t) => t.name === 'J-거래')
      .map(normalizeImportedTransaction).map((t) => [t.name, t.owner]);
    return { 자산: restoredA, 거래: restoredT };
  `);
  expect(got.자산).toEqual([['J-신랑', '신랑'], ['J-와이프', '와이프'], ['J-공동', '공동'], ['J-빈값', '']]);
  expect(got.거래, '거래의 공동 소유자도 보존된다').toEqual([['J-거래', '공동']]);
});

/* ══════ E. 기존 공동자산 - 자동 변경 없음 + 화면에서 식별 ══════ */

test('E. 기존 공동자산은 부팅/동기화로 자동 변경되지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, `
    const a = makeAsset({ ticker: 'ZZ54', owner: '공동', accountType: '일반계좌', name: '공동자산',
      currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger' });
    state.assets = [a];
    state.transactions = [{ id: genId(), date: '2026-01-01', owner: '공동', accountType: '일반계좌',
      ticker: 'ZZ54', name: '공동자산', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, createdAt: 1 }];
    const before = { owner: state.assets[0].owner, 수량: state.assets[0].quantity };
    syncAssetsFromTransactions(); // 부팅마다 도는 그 함수
    return { before, after: { owner: state.assets[0].owner, 수량: state.assets[0].quantity },
      자산수: state.assets.length };
  `);
  expect(got.after.owner, '동기화가 소유자를 추정해 바꾸지 않는다').toBe('공동');
  expect(got.after).toEqual(got.before);
  expect(got.자산수, '공동 자산을 지우거나 나누지 않는다').toBe(1);
});

test('E-2. 자산 상세가 소유자 미지정을 알린다(새 카드 없이 기존 안내 영역 재사용)', async ({ page }) => {
  await boot(page);
  const read = () => page.locator('#assetDetailPositionNotice').evaluate((el) => {
    const p = el.querySelector('p');
    return { hidden: el.classList.contains('hidden'), text: el.textContent.trim(),
      fontPx: p ? Math.round(parseFloat(el.ownerDocument.defaultView.getComputedStyle(p).fontSize)) : null,
      버튼수: el.querySelectorAll('button, a').length };
  });

  // 정상 소유자 - 아무 안내도 뜨지 않는다
  await page.evaluate(() => {
    state.transactions = [];
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '정상자산',
      category: '부동산', currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000, positionSource: 'manual' })];
    renderAll(); openAssetDetailModal(state.assets[0].id);
  });
  expect((await read()).hidden, '정상 자산에는 안내가 없다').toBe(true);

  // 공동 자산 - 안내가 뜬다
  await page.evaluate(() => {
    state.transactions = [];
    state.assets = [makeAsset({ ticker: '', owner: '공동', accountType: '일반계좌', name: '공동자산',
      category: '부동산', currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000, positionSource: 'manual' })];
    renderAll(); openAssetDetailModal(state.assets[0].id);
  });
  const shown = await read();
  expect(shown.hidden).toBe(false);
  expect(shown.text).toContain('소유자가 지정되지 않았습니다');
  expect(shown.text, '왜 문제인지도 알려준다').toContain('몬테카를로');
  expect(shown.fontPx, '가독성 정책 - 14px 미만 금지').toBeGreaterThanOrEqual(14);
  expect(shown.버튼수, '자동 지정 버튼을 두지 않는다').toBe(0);
});

/* ══════ F. Golden invariant - 신랑/와이프 자산은 아무것도 달라지지 않는다 ══════ */

test('F. 신랑/와이프 자산의 데이터와 계산이 전혀 바뀌지 않는다', async ({ page }) => {
  await boot(page);
  const measure = () => page.evaluate(async () => ({
    자산수: state.assets.length,
    소유자수: new Set(state.assets.map((a) => a.owner)).size,
    소유자별평가액: ['신랑', '와이프'].map((o) => [o,
      Math.round(state.assets.filter((a) => a.owner === o).reduce((s, a) => s + calcRow(a).curAmount, 0))]),
    소유자별수량: ['신랑', '와이프'].map((o) => [o,
      state.assets.filter((a) => a.owner === o).reduce((s, a) => s + num(a.quantity), 0)]),
    적용키: state.assets.map((a) => [a.name, resolveAssetGroupKeyDetail(a).key]),
    수익률: state.assets.map((a) => [a.name, getAssetProjectionRate(a, 'normal')]),
    결정론입력: (() => { const g = getProjectionGroupStats(null);
      return Object.keys(g).sort().map((k) => [k, Math.round(g[k].value)]); })(),
    MC입력: await (async () => {
      const r = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      return { order: r.assetOrder, errors: r.errors,
        instruments: (r.instruments || []).map((i) => [i.key, i.weight, i.muAnnual, i.sigmaAnnual]) };
    })()
  }));

  await page.evaluate(() => {
    const mk = (name, owner, ticker, cat) => makeAsset({ ticker, owner, accountType: '일반계좌', name,
      category: cat, currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200 });
    state.assets = [mk('삼성전자', '신랑', '005930.KS'), mk('KODEX 200', '신랑', '069500.KS'),
      mk('국고채', '와이프', '', '채권'), mk('아파트', '와이프', '', '부동산')];
    state.transactions = [];
    persistAssets();
  });
  const before = await measure();
  // 부팅과 동기화를 태워도(소유자 정책 추가 이후에도) 아무것도 달라지지 않아야 한다.
  await page.evaluate(() => { syncAssetsFromTransactions(); renderAll(); });
  const after = await measure();

  expect(after).toEqual(before);
  expect(before.소유자수, '신랑/와이프 둘뿐이다').toBe(2);
  expect(before.적용키).toEqual([['삼성전자', 'KOSPI'], ['KODEX 200', 'KOSPI'],
    ['국고채', '채권'], ['아파트', '부동산']]);
});
