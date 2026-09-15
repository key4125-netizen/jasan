// E2E-89 [P1-1 동기화 차이 확인 · v243] 자동 동기화가 받은 클라우드 데이터가 이 기기와 다르면 반영하지 않고,
// 실제 자산 · 거래 단위의 차이를 보여 준 뒤 사용자가 [클라우드 데이터 받기] / [이 기기 데이터 올리기] / [취소]를 고른다.
//
// 실제 앱 함수(pullFromCloud / pushToCloud / onSyncPasswordSaved / compareSyncData)와 실제 버튼을 그대로 태운다.
// 외부 Cloud Worker는 호출하지 않는다 - page.route로 가로채 노드 메모리의 가짜 KV(슬롯별)로만 주고받는다.
// 실제 사용자 데이터는 쓰지 않는다(전부 합성 fixture).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e89-shared-password';

function makeKv() {
  return { store: {} };
}

async function attachFakeCloud(context, kv, gate) {
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      if (gate) gate.posts++;
      kv.store[k] = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
}

async function openDevice(browser, kv, contextOptions) {
  const context = await browser.newContext(contextOptions || {});
  const gate = { posts: 0 };
  await attachFakeCloud(context, kv, gate);
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function'
    && typeof compareSyncData === 'function');
  return { context, page, gate };
}

const BASE_TX = {
  id: 'e89-tx-base', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'AAA',
  name: 'E89_종목', type: 'buy', quantity: 100, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};
const BASE_ASSET = {
  id: 'e89-as', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'E89_종목', isDomestic: '국내', currency: 'KRW',
  quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};
const MANUAL_ASSET = (id, o = {}) => ({
  id, ticker: '', owner: '와이프', accountType: '일반계좌', category: '부동산', name: `E89_${id}`, isDomestic: '국내',
  currency: 'KRW', quantity: 1, buyPrice: 500, currentPrice: 500, positionSource: 'manual', createdAt: 2000, updatedAt: 2000, ...o
});

function seed(page) {
  return page.locator('body').evaluate((el, { tx, asset }) => {
    localStorage.clear();
    state.transactions = [tx];
    state.assets = [asset];
    state.projection.monthlyContribution = 100000; state.projection.updatedAt = 1000;
    state.rebalance.updatedAt = 1000;
    persistAssets(true); persistTransactions(); persistRebalance(true); persistProjection(true);
  }, { tx: BASE_TX, asset: BASE_ASSET });
}

async function savePassword(page, pw) {
  if (await page.locator('#syncSettingsModal').isHidden()) await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill(pw);
  await page.locator('#syncPasswordSaveBtn').click();
}

// 이미 정상 동기화가 끝난 두 기기(휴대폰 = 먼저 올림, PC = 받기로 연결)
async function pairedDevices(browser, kv, pcOptions) {
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, kv, pcOptions);
  await pc.page.locator('body').evaluate(() => { localStorage.clear(); });
  await savePassword(pc.page, PW);
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  pc.gate.posts = 0;
  phone.gate.posts = 0;
  return { phone, pc };
}

const pull = (page, opts) => page.locator('body').evaluate((el, o) => pullFromCloud(o || { silent: true }), opts);
const push = (page, opts) => page.locator('body').evaluate((el, o) => pushToCloud(o), opts);
// 편집은 persist*(true) / 직접 push로 한다 - 테스트가 부르는 동기화 순서를 결정적으로 유지한다.
const edit = (page, fn, arg) => page.locator('body').evaluate(fn, arg);

function localView(page) {
  return page.locator('body').evaluate((el) => ({
    assetIds: state.assets.map((a) => a.id).sort(),
    txIds: state.transactions.map((t) => t.id).sort(),
    qty: (state.assets.find((a) => a.id === 'e89-as') || {}).quantity ?? null,
    txQty: (state.transactions.find((t) => t.id === 'e89-tx-base') || {}).quantity ?? null,
    monthly: state.projection.monthlyContribution,
    domestic: state.rebalance['신랑'].domestic['국내'],
    lastVersion: syncState.lastVersion,
    held: !!syncDiffHold,
    mode: syncDirectionMode,
    modalOpen: !el.ownerDocument.getElementById('syncSettingsModal').classList.contains('hidden'),
    boxOpen: !el.ownerDocument.getElementById('syncDirectionBox').classList.contains('hidden'),
    roleKeys: Object.keys(state.tickerRoles).sort(),
    snapKeys: Object.keys(state.dailySnapshots).sort()
  }));
}

async function cloudView(page, kv) {
  const blob = Object.values(kv.store)[0];
  return page.locator('body').evaluate(async (el, { b, pw }) => {
    const p = await decryptSyncBlob(b, pw);
    return {
      version: b.version,
      assetIds: Array.isArray(p.assets) ? p.assets.map((a) => a.id).sort() : 'malformed',
      txIds: Array.isArray(p.transactions) ? p.transactions.map((t) => t.id).sort() : 'malformed',
      qty: Array.isArray(p.assets) ? ((p.assets.find((a) => a.id === 'e89-as') || {}).quantity ?? null) : null,
      monthly: p.projection ? p.projection.monthlyContribution : null
    };
  }, { b: blob, pw: PW });
}

const summaryText = (page) => page.locator('#syncDiffSummary').innerText();

/* ══ 차이 없음 ═══════════════════════════════════════════════════════ */

test('S-01 (T01/T10/T11/T17) 시세 · 환율 · 일별 기록 · 역할만 달라지면 확인 화면 없이 예전처럼 자동 동기화된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => {
    const a = state.assets.find((x) => x.id === 'e89-as');
    a.currentPrice = 9999; a.regularMarketPrice = 9999; persistAssets(true);
    state.exchangeRate = 1555; persistRate(true);
    state.tickerRoles = { ...state.tickerRoles, E89ROLE: 'core' }; persistTickerRoles();
    state.dailySnapshots = { ...state.dailySnapshots, '2026-01-01': { total: { cur: 1, dailyPnL: 0 } } }; persistDailySnapshots();
  });
  await push(phone.page);

  const result = await pull(pc.page);
  expect(result).toBe('applied');
  const v = await localView(pc.page);
  expect(v.held).toBe(false);
  expect(v.modalOpen).toBe(false);
  expect(v.roleKeys).toContain('E89ROLE');          // 합집합 3종은 예전처럼 합쳐진다
  expect(v.snapKeys).toContain('2026-01-01');
  expect(v.lastVersion).toBe((await cloudView(pc.page, kv)).version);
  expect(await pull(pc.page)).toBe('up_to_date');   // 이후 자동 동기화도 정상
  await phone.context.close(); await pc.context.close();
});

/* ══ 차이 있음 - 반영 보류 ════════════════════════════════════════════ */

test('S-02 (T02/T16) 이 기기에만 있는 자산이 있으면 병합 · 업로드를 멈추고, 주기 동기화가 다시 돌아도 화면을 겹쳐 띄우지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => { renderAll(); });
  await push(phone.page);                            // 상대가 새 버전을 올렸다(내용은 같음)
  const cloudBefore = await cloudView(pc.page, kv);
  await edit(pc.page, (el, a) => { state.assets.push(a); persistAssets(true); }, MANUAL_ASSET('pc-only'));
  const before = await localView(pc.page);

  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(pc.page.locator('#syncDirectionTitle')).toHaveText('클라우드와 이 기기의 데이터가 다릅니다');
  const s = await summaryText(pc.page);
  expect(s).toContain('자산 차이');
  expect(s).toContain('이 기기에만 있음: 1건');
  await expect(pc.page.locator('#syncDirectionPullEffect')).toContainText('이 기기에만 있는 자산 1건은 이 기기에서 사라집니다.');

  const held = await localView(pc.page);
  expect(held.assetIds).toEqual(before.assetIds);    // 이 기기 데이터 그대로
  expect(held.lastVersion).toBe(before.lastVersion); // 반영하지 않았다
  expect(held.held).toBe(true);

  // 주기 동기화 재진입 · 편집 후 업로드 시도 - 같은 화면 하나, 병합 · 업로드 없음
  expect(await pull(pc.page)).toBe('held');
  expect(await pull(pc.page)).toBe('held');
  expect(await push(pc.page)).toBe('held');
  expect(await pc.page.locator('#syncDiffSummary > section').count()).toBe(3);
  expect(await pc.page.locator('#syncDirectionBox').count()).toBe(1);
  expect(pc.gate.posts).toBe(0);
  expect(await cloudView(pc.page, kv)).toEqual(cloudBefore);
  expect((await localView(pc.page)).assetIds).toEqual(before.assetIds);
  await phone.context.close(); await pc.context.close();
});

test('S-03 (T03/T14) 클라우드에만 있는 자산은 실제 항목으로 보여 주고, [클라우드 데이터 받기]를 눌러야 반영된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, (el, a) => { state.assets.push(a); persistAssets(true); }, MANUAL_ASSET('phone-new', { name: 'E89_상가', quantity: 2 }));
  await push(phone.page);

  expect(await pull(pc.page)).toBe('held');
  expect((await localView(pc.page)).assetIds).toEqual(['e89-as']);
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
  await pc.page.locator('#syncDiffSummary summary', { hasText: '자산 상세 보기' }).click();
  const detail = pc.page.locator('[data-sync-diff-list="클라우드에만 있는 자산"]');
  await expect(detail).toContainText('E89_상가');
  await expect(detail).toContainText('와이프 · 일반계좌');
  await expect(detail).toContainText('수량 2');
  await expect(pc.page.locator('#syncDirectionPullEffect')).toContainText('클라우드에만 있는 자산 1건을 이 기기에 받아옵니다.');

  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  const after = await localView(pc.page);
  expect(after.assetIds).toEqual(['e89-as', 'phone-new']);
  expect(after.held).toBe(false);
  expect(after.lastVersion).toBe((await cloudView(pc.page, kv)).version);
  const baseline = await pc.page.locator('body').evaluate(() => JSON.parse(localStorage.getItem('sam_sync_merged_asset_ids_v1')).sort());
  expect(baseline).toEqual(['e89-as', 'phone-new']);   // 기존 fullAdopt 의미 그대로(기준선 = 받은 목록)
  await phone.context.close(); await pc.context.close();
});

test('S-04 (T04/T15) 같은 자산의 수량이 다르면 양쪽 수량을 보여 주고, [이 기기 데이터 올리기] 뒤 상대 기기도 확인을 기다린다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => { const a = state.assets.find((x) => x.id === 'e89-as'); a.quantity = 120; a.updatedAt = Date.now(); persistAssets(true); });
  await push(phone.page);

  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('내용이 다른 자산: 1건');
  await pc.page.locator('#syncDiffSummary summary', { hasText: '자산 상세 보기' }).click();
  const changed = pc.page.locator('[data-sync-diff-list="내용이 다른 자산"]');
  await expect(changed).toContainText('E89_종목 (AAA)');
  await expect(changed).toContainText('수량');
  await expect(changed).toContainText('이 기기: 100주');
  await expect(changed).toContainText('클라우드: 120주');

  pc.page.once('dialog', (d) => d.accept());
  await pc.page.locator('#syncDirectionPushBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  expect((await cloudView(pc.page, kv)).qty).toBe(100);   // 기존 localWins 의미 그대로
  expect((await localView(pc.page)).held).toBe(false);

  // 휴대폰은 자기 120을 조용히 잃지 않는다 - 차이를 보여 주고 기다린다.
  expect(await pull(phone.page)).toBe('held');
  expect((await localView(phone.page)).qty).toBe(120);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.context.close(); await pc.context.close();
});

test('S-05 (T05) 같은 거래의 수량이 다르면 거래 차이로 필드를 보여 준다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => { const t = state.transactions.find((x) => x.id === 'e89-tx-base'); t.quantity = 117; t.updatedAt = Date.now(); persistTransactions(); });
  await push(phone.page);

  expect(await pull(pc.page)).toBe('held');
  expect((await localView(pc.page)).txQty).toBe(100);
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('내용이 다른 거래: 1건');
  await pc.page.locator('#syncDiffSummary summary', { hasText: '거래내역 상세 보기' }).click();
  const changed = pc.page.locator('[data-sync-diff-list="내용이 다른 거래"]');
  await expect(changed).toContainText('2026-09-01 · E89_종목 (AAA)');
  await expect(changed).toContainText('신랑 · 일반계좌 · 매수');
  await expect(changed).toContainText('이 기기: 100');
  await expect(changed).toContainText('클라우드: 117');
  await phone.context.close(); await pc.context.close();
});

test('S-06 (T06/T07) 삭제 vs 수정은 어느 방향이든 확인 전까지 이 기기 · 클라우드 데이터를 바꾸지 않는다', async ({ browser }) => {
  const kv = makeKv();
  // 이 기기 삭제 · 클라우드 수정
  {
    const { phone, pc } = await pairedDevices(browser, kv);
    await edit(pc.page, (el, a) => { state.assets.push(a); persistAssets(true); }, MANUAL_ASSET('shared'));
    pc.page.once('dialog', (d) => d.accept());
    await push(pc.page);
    expect(await pull(phone.page)).toBe('held'); // 휴대폰은 새 자산 확인 대기 - 받기로 맞춘다
    await phone.page.locator('#syncDirectionPullBtn').click();
    await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

    await edit(pc.page, () => { state.assets = state.assets.filter((a) => a.id !== 'shared'); persistAssets(true); });
    await edit(phone.page, () => { const a = state.assets.find((x) => x.id === 'shared'); a.quantity = 7; a.updatedAt = Date.now(); persistAssets(true); });
    await push(phone.page);
    const cloudBefore = await cloudView(pc.page, kv);
    expect(await pull(pc.page)).toBe('held');
    await expect(pc.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
    expect((await localView(pc.page)).assetIds).toEqual(['e89-as']);
    expect(await cloudView(pc.page, kv)).toEqual(cloudBefore);
    await phone.context.close(); await pc.context.close();
  }
  // 이 기기 수정 · 클라우드 삭제
  {
    const kv2 = makeKv();
    const { phone, pc } = await pairedDevices(browser, kv2);
    await edit(pc.page, () => { const t = state.transactions.find((x) => x.id === 'e89-tx-base'); t.quantity = 55; t.updatedAt = Date.now(); persistTransactions(); });
    await edit(phone.page, () => { state.transactions = []; persistTransactions(); });
    await push(phone.page);
    const cloudBefore = await cloudView(pc.page, kv2);
    expect(await pull(pc.page)).toBe('held');
    await expect(pc.page.locator('#syncDiffSummary')).toContainText('이 기기에만 있음: 1건');
    const v = await localView(pc.page);
    expect(v.txIds).toEqual(['e89-tx-base']);
    expect(v.txQty).toBe(55);
    expect(await push(pc.page)).toBe('held');
    expect(await cloudView(pc.page, kv2)).toEqual(cloudBefore);
    await phone.context.close(); await pc.context.close();
  }
});

test('S-07 (T08/T09) 목표비중 · 미래예측 설정이 다르면 기타 설정에 표시하고 반영하지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => {
    state.rebalance['신랑'].domestic = { '국내': 70, '해외': 30 }; persistRebalance();
    state.projection.monthlyContribution = 777777; persistProjection();
  });
  await push(phone.page);

  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('[data-sync-diff-group="settings"]')).toContainText('목표비중 설정: 서로 다름');
  await expect(pc.page.locator('[data-sync-diff-group="settings"]')).toContainText('미래예측 설정: 서로 다름');
  await expect(pc.page.locator('#syncDirectionPullEffect')).toContainText('목표비중·미래예측 설정은 클라우드 값으로 바뀝니다.');
  const v = await localView(pc.page);
  expect(v.monthly).toBe(100000);
  expect(v.domestic).toBe(40);

  // [받기]는 이 기기 설정 시각이 더 최근이어도 클라우드 설정으로 맞춘다(PM 결정) - 받은 뒤에는 같은 차이로 다시 보류되지 않는다.
  await edit(pc.page, () => { state.projection.updatedAt = Date.now() + 86400000; state.rebalance.updatedAt = Date.now() + 86400000; persistProjection(true); persistRebalance(true); });
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible(); // 보류 확인 화면이 그대로 떠 있다
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  const adopted = await localView(pc.page);
  expect(adopted.monthly).toBe(777777);
  expect(adopted.domestic).toBe(70);
  expect(adopted.held).toBe(false);
  await edit(phone.page, () => { renderAll(); });
  await push(phone.page);
  expect(await pull(pc.page)).toBe('applied');
  await phone.context.close(); await pc.context.close();
});

/* ══ malformed payload ═══════════════════════════════════════════════ */

test('S-08 (T12) 복호화는 되지만 모양이 잘못된 클라우드 데이터는 빈 목록으로 보지 않고 동기화를 멈춘다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  const slot = Object.keys(kv.store)[0];
  kv.store[slot] = await phone.page.locator('body').evaluate(async (el, pw) => ({
    ...(await encryptSyncBlob({ app: 'smart-asset-manager', assets: { broken: true }, transactions: [] }, pw)),
    version: Date.now() + 60000, updatedAt: new Date().toISOString()
  }), PW);
  const brokenBlob = JSON.stringify(kv.store[slot]);
  const before = await localView(pc.page);

  expect(await pull(pc.page, {})).toBe('invalid_payload');
  await expect(pc.page.getByText('클라우드 데이터 형식을 확인할 수 없어 동기화를 중단했습니다. 현재 기기의 데이터는 변경되지 않았습니다.').first()).toBeVisible();
  expect(await pull(pc.page, { fullAdopt: true })).toBe('invalid_payload');
  expect(await push(pc.page)).toBe('invalid_payload');
  const after = await localView(pc.page);
  expect(after.assetIds).toEqual(before.assetIds);
  expect(after.txIds).toEqual(before.txIds);
  expect(after.lastVersion).toBe(before.lastVersion);
  expect(pc.gate.posts).toBe(0);
  expect(JSON.stringify(kv.store[slot])).toBe(brokenBlob);

  // 다시 연결하는 기기도 방향을 고르게 하지 않는다
  const fresh = await openDevice(browser, kv);
  await fresh.page.locator('body').evaluate(() => { localStorage.clear(); });
  await savePassword(fresh.page, PW);
  await expect(fresh.page.getByText('클라우드 데이터 형식을 확인할 수 없어 동기화를 중단했습니다.', { exact: false }).first()).toBeVisible();
  await expect(fresh.page.locator('#syncDirectionBox')).toBeHidden();
  await fresh.context.close(); await phone.context.close(); await pc.context.close();
});

/* ══ 취소 · 재진입 ═══════════════════════════════════════════════════ */

test('S-09 (T13) [취소] · 닫기는 아무것도 바꾸지 않고, 같은 차이로 다시 띄우지 않으며, 동기화 설정에서 다시 볼 수 있다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => { const a = state.assets.find((x) => x.id === 'e89-as'); a.quantity = 130; a.updatedAt = Date.now(); persistAssets(true); });
  await push(phone.page);
  const cloudBefore = await cloudView(pc.page, kv);

  expect(await pull(pc.page)).toBe('held');
  await pc.page.locator('#syncDirectionCancelBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  let v = await localView(pc.page);
  expect(v.qty).toBe(100);
  expect(v.held).toBe(true);
  await expect(pc.page.locator('#syncSettingsBtn')).toHaveAttribute('aria-label', '서버 동기화 확인 필요');

  expect(await pull(pc.page)).toBe('held');
  await edit(phone.page, () => { renderAll(); });
  await push(phone.page);                               // 상대가 내용 변화 없이 새 버전만 올려도
  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden(); // 다시 띄우지 않는다
  expect(pc.gate.posts).toBe(0);
  expect((await cloudView(pc.page, kv)).qty).toBe(cloudBefore.qty);

  // 동기화 설정을 열면 같은 차이를 다시 본다
  await pc.page.locator('#syncSettingsBtn').click();
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(pc.page.locator('#syncStatusText')).toContainText('동기화 보류');
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('내용이 다른 자산: 1건');
  // ESC로 닫아도 취소와 같다
  await pc.page.keyboard.press('Escape');
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  v = await localView(pc.page);
  expect(v.qty).toBe(100);

  // 상대가 실제로 다른 내용을 새로 올리면 다시 알린다
  await edit(phone.page, (el, t) => { state.transactions.push(t); persistTransactions(); }, { ...BASE_TX, id: 'e89-tx-new', quantity: 1, createdAt: 3000, updatedAt: 3000 });
  await push(phone.page);
  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('거래내역 차이');
  await phone.context.close(); await pc.context.close();
});

test('S-10 확인하는 사이 차이가 달라지면 반영하지 않고 다시 보여 주며, 시세 · 일별 기록만 올라온 경우는 그대로 받는다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, () => { const a = state.assets.find((x) => x.id === 'e89-as'); a.quantity = 140; a.updatedAt = Date.now(); persistAssets(true); });
  await push(phone.page);
  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();

  // 내용 변화 없는 새 버전 → 받기 그대로 진행
  await edit(phone.page, () => { renderAll(); });
  await push(phone.page);
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  expect((await localView(pc.page)).qty).toBe(140);

  // 실제 내용이 바뀐 새 버전 → 받지 않고 새 차이를 다시 보여 준다
  await edit(phone.page, () => { const a = state.assets.find((x) => x.id === 'e89-as'); a.quantity = 150; a.updatedAt = Date.now(); persistAssets(true); });
  await push(phone.page);
  expect(await pull(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await edit(phone.page, (el, t) => { state.transactions.push(t); persistTransactions(); }, { ...BASE_TX, id: 'e89-tx-late', quantity: 2, createdAt: 4000, updatedAt: 4000 });
  await push(phone.page);
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.getByText('확인하는 사이 데이터가 바뀌었습니다. 달라진 내용을 다시 확인해 주세요.').first()).toBeVisible();
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('거래내역 차이');
  const v = await localView(pc.page);
  expect(v.qty).toBe(140);
  expect(v.txIds).toEqual(['e89-tx-base']);
  await phone.context.close(); await pc.context.close();
});

/* ══ 재개 · 복원 ═════════════════════════════════════════════════════ */

test('S-11 (T18/T19) 빈 슬롯은 업로드 확인만, 데이터가 있는 슬롯은 방향 선택에 차이(또는 같음)를 보여 준다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await expect(phone.page.locator('#syncDirectionBox')).toBeHidden();
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  // 같은 데이터를 가진 기기(휴대폰 자신의 JSON 사본)
  const same = await openDevice(browser, kv);
  await seed(same.page);
  await savePassword(same.page, PW);
  await expect(same.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(same.page.locator('#syncDirectionTitle')).toHaveText('클라우드에 이미 저장된 데이터가 있습니다. 어떻게 맞출까요?');
  await expect(same.page.locator('#syncDirectionIntro')).toHaveText('자산 · 거래내역 · 목표비중 · 미래예측 설정이 클라우드와 같습니다.');
  await expect(same.page.locator('#syncDiffSummary > section')).toHaveCount(0);

  // 빈 기기 - 차이를 보여 준다. 취소하면 동기화를 켜지 않는다.
  const empty = await openDevice(browser, kv);
  await empty.page.locator('body').evaluate(() => { localStorage.clear(); state.assets = []; state.transactions = []; });
  await savePassword(empty.page, PW);
  await expect(empty.page.locator('#syncDirectionTitle')).toHaveText('클라우드와 이 기기의 데이터가 다릅니다');
  await expect(empty.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
  await expect(empty.page.locator('#syncDirectionPushEffect')).toContainText('클라우드에만 있는 자산 1건 · 거래내역 1건은 클라우드에서 빠집니다.');
  await empty.page.locator('#syncDirectionCancelBtn').click();
  await expect(empty.page.locator('#syncSettingsModal')).toBeHidden();
  const e = await localView(empty.page);
  expect(e.assetIds).toEqual([]);
  expect(await empty.page.locator('body').evaluate(() => syncState.enabled)).toBe(false);
  expect(empty.gate.posts).toBe(0);
  await empty.context.close(); await same.context.close(); await phone.context.close();
});

test('S-12 (T20) 동기화가 켜진 채 JSON을 복원해도 복원 데이터를 클라우드로 덮거나 클라우드 데이터로 덮지 않고 확인을 기다린다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await edit(phone.page, (el, t) => { state.transactions.push(t); persistTransactions(); }, { ...BASE_TX, id: 'e89-tx-after-backup', quantity: 5, createdAt: 3000, updatedAt: 3000 });
  await push(phone.page);
  expect(await pull(pc.page)).toBe('held');
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  const cloudBefore = await cloudView(pc.page, kv);
  pc.gate.posts = 0;

  // PC에서 백업 시점(거래 1건) JSON으로 복원
  await pc.page.locator('body').evaluate(async (el, tx) => {
    await applyRemoteState({
      app: 'smart-asset-manager', exportedAt: new Date().toISOString(),
      exchangeRate: state.exchangeRate, dailyChangeRate: state.dailyChangeRate,
      rebalance: state.rebalance, projection: state.projection,
      assets: state.assets, transactions: [tx], dailySnapshots: {}, learnedTickerNames: {}, tickerRoles: {}
    });
  }, BASE_TX);
  expect((await localView(pc.page)).txIds).toEqual(['e89-tx-base']);
  expect(await pull(pc.page)).toBe('held');
  expect(await push(pc.page)).toBe('held');
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
  expect((await localView(pc.page)).txIds).toEqual(['e89-tx-base']);   // 복원 데이터 그대로
  expect(await cloudView(pc.page, kv)).toEqual(cloudBefore);           // 클라우드도 그대로
  expect(pc.gate.posts).toBe(0);
  await phone.context.close(); await pc.context.close();
});

/* ══ UX - 375px 우선 · 다크 우선 ═════════════════════════════════════ */

const VIEWPORTS = [
  { name: '375 Dark', viewport: { width: 375, height: 812 }, dark: true },
  { name: '375 Light', viewport: { width: 375, height: 812 }, dark: false },
  { name: 'Tablet 768 Light', viewport: { width: 768, height: 1024 }, dark: false },
  { name: 'Desktop 1280 Dark', viewport: { width: 1280, height: 800 }, dark: true }
];
for (const vp of VIEWPORTS) {
  test(`S-13 ${vp.name}: 여러 건의 차이를 펼쳐도 44px · 14px · 잘림 · 가로 넘침 없이 버튼까지 닿는다`, async ({ browser }) => {
    const kv = makeKv();
    const { phone, pc } = await pairedDevices(browser, kv, { viewport: vp.viewport, colorScheme: vp.dark ? 'dark' : 'light' });
    await pc.page.locator('body').evaluate((el, dark) => { el.ownerDocument.documentElement.classList.toggle('dark', dark); }, vp.dark);
    await edit(phone.page, () => {
      for (let i = 0; i < 12; i++) {
        state.assets.push({ id: `vp-a${i}`, ticker: '', owner: '와이프', accountType: '연금저축(IRP 포함) 장기 보유 계좌', category: '부동산',
          name: `E89_아주_긴_이름을_가진_수동평가_자산_${i}_줄바꿈_확인용`, isDomestic: '국내', currency: 'KRW', quantity: 1234567.89,
          buyPrice: 500, currentPrice: 500, positionSource: 'manual', createdAt: 2000 + i, updatedAt: 2000 + i });
      }
      const a = state.assets.find((x) => x.id === 'e89-as'); a.quantity = 527; a.buyPrice = 1234.5678; a.updatedAt = Date.now();
      persistAssets(true);
      state.projection.monthlyContribution = 1; persistProjection();
    });
    await push(phone.page);
    await edit(pc.page, (el, t) => { state.transactions.push(t); persistTransactions(); }, { ...BASE_TX, id: 'vp-tx-local', ticker: 'VERYLONGTICKER.KS', name: 'E89_이_기기에만_있는_아주_긴_거래_이름', createdAt: 5000, updatedAt: 5000 });

    expect(await pull(pc.page)).toBe('held');
    await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
    const summaries = pc.page.locator('#syncDiffSummary summary');
    for (let i = 0; i < await summaries.count(); i++) await summaries.nth(i).click();

    const ux = await pc.page.locator('#syncDirectionBox').evaluate((box) => {
      const doc = box.ownerDocument;
      const win = doc.defaultView;
      const panel = doc.querySelector('#syncSettingsModal > div');
      const leaves = Array.prototype.slice.call(box.querySelectorAll('*')).filter((e) => e.children.length === 0 && e.textContent.trim());
      const h = (sel) => Math.round(box.querySelector(sel).getBoundingClientRect().height);
      return {
        pullH: h('#syncDirectionPullBtn'), pushH: h('#syncDirectionPushBtn'), cancelH: h('#syncDirectionCancelBtn'),
        summaryMinH: Math.min.apply(null, Array.prototype.map.call(box.querySelectorAll('summary'), (s) => Math.round(s.getBoundingClientRect().height))),
        minFont: Math.min.apply(null, leaves.map((e) => parseFloat(win.getComputedStyle(e).fontSize))),
        clipped: leaves.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 40)),
        nowrap: leaves.filter((e) => win.getComputedStyle(e).whiteSpace === 'nowrap').length,
        boxOverflow: box.scrollWidth > box.clientWidth + 1,
        panelOverflowX: panel.scrollWidth > panel.clientWidth + 1,
        panelScrollable: win.getComputedStyle(panel).overflowY === 'auto',
        pageOverflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
        darkClass: doc.documentElement.classList.contains('dark')
      };
    });
    expect(ux.darkClass).toBe(vp.dark);
    expect(ux.pullH).toBeGreaterThanOrEqual(44);
    expect(ux.pushH).toBeGreaterThanOrEqual(44);
    expect(ux.cancelH).toBeGreaterThanOrEqual(44);
    expect(ux.summaryMinH).toBeGreaterThanOrEqual(44);
    expect(ux.minFont).toBeGreaterThanOrEqual(14);
    expect(ux.clipped).toEqual([]);
    expect(ux.nowrap).toBe(0);
    expect(ux.boxOverflow).toBe(false);
    expect(ux.panelOverflowX).toBe(false);
    expect(ux.panelScrollable).toBe(true);
    expect(ux.pageOverflowX).toBe(false);

    // 목록이 길어도 [취소]까지 스크롤로 닿아 화면 안에서 누를 수 있다
    const cancel = pc.page.locator('#syncDirectionCancelBtn');
    await cancel.scrollIntoViewIfNeeded();
    const box = await cancel.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.viewport.height);
    await cancel.click();
    await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
    await phone.context.close(); await pc.context.close();
  });
}
