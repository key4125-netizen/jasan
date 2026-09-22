// E2E-85 [일별 이력 복구 제거 + 클라우드 데이터 초기화] (PM 작업지시 2/3)
//
// RR: 일별 이력 복구(Recovery) 기능은 화면·전역 함수·실행 경로 어디에도 남지 않는다. 일별 이력(dailySnapshots) 자체는 그대로다.
// CR: [클라우드 데이터 초기화]는 이 기기에 저장된 동기화 암호의 슬롯만 빈 데이터(version 0)로 덮어쓰고, 다시 조회해 확인한다.
//     이 기기의 데이터는 바꾸지 않고, 진행 중·예약된 push가 초기화 뒤에 예전 데이터를 다시 쓰지 못한다.
// PG: 암호를 저장한 뒤 방향([받기]/[올리기]/[업로드])을 고르기 전에는 자동 동기화가 클라우드 데이터를 합치지 않는다.
// 전부 합성 데이터다. Cloud Worker는 route로 가로챈 가짜 KV만 쓴다(실제 Cloud 요청 0).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const BOND = { id: 'e85-bond', ticker: '', owner: '신랑', accountType: '일반계좌', category: '채권', categorySource: 'user', name: 'E85_채권', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 3000000, currentPrice: 3000000, positionSource: 'manual', createdAt: 1, updatedAt: 1 };
const TX = { id: 'e85-tx', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E85_채권', type: 'buy', quantity: 1, price: 3000000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 };

async function settle(page) {
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof resetCloudData === 'function' && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(500);
}
async function cleanOpen(page) {
  await page.goto('/manifest.json');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sam_has_launched_v1', '1'); });
  await page.goto('/');
  await settle(page);
}
async function attachKv(context, shared) {
  const kv = shared || { store: {}, posts: [], gets: 0, holdGets: 0, held: [], failPost: false, dropPost: false };
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      kv.posts.push({ k, version: body.version });
      if (kv.failPost) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
      if (!kv.dropPost) kv.store[k] = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    kv.gets++;
    const snapshot = kv.store[k];
    const answer = () => (snapshot
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) })
      : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    if (kv.holdGets > 0) { kv.holdGets--; kv.held.push(answer); return undefined; }
    return answer();
  });
  return kv;
}
async function seedSynced(page, pw) {
  await page.locator('body').evaluate(async (el, [asset, tx, p]) => {
    state.assets = [asset];
    state.transactions = [tx];
    state.dailySnapshots = {};
    for (let n = 1; n <= 2; n++) {
      const d = new Date(); d.setDate(d.getDate() - n);
      state.dailySnapshots[dateKeyFromDate(d)] = { total: { cur: 3000000, dailyPnL: n * 10 }, byOwner: { '신랑': { cur: 3000000, dailyPnL: n * 10 } }, byOwnerCategory: { '신랑': { '채권': { cur: 3000000, dailyPnL: n * 10 } } } };
    }
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    localStorage.setItem('sam_sync_password_v1', p);
    localStorage.setItem('sam_sync_enabled_v1', '1');
    loadSyncState();
    renderAll();
    await pushToCloud();
  }, [BOND, TX, pw]);
  await page.waitForTimeout(3500); // renderAll이 건 예약 push(3초)를 흘려보낸다
}
const localData = (page) => page.locator('body').evaluate(() => {
  const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((acc, k) => { acc[k] = sortK(x[k]); return acc; }, {}) : x);
  return JSON.stringify(sortK({
    assets: state.assets, transactions: state.transactions, dailySnapshots: state.dailySnapshots, rebalance: state.rebalance, projection: state.projection,
    lsAssets: localStorage.getItem('sam_assets_v5'), lsTx: localStorage.getItem('sam_transactions_v1'), lsSnaps: localStorage.getItem('sam_daily_snapshot_v1'),
    lsRebalance: localStorage.getItem('sam_rebalance_v1'), lsProjection: localStorage.getItem('sam_projection_v1')
  }));
});
const syncInfo = (page) => page.locator('body').evaluate(() => ({ enabled: syncState.enabled, lsEnabled: localStorage.getItem('sam_sync_enabled_v1'), hasPassword: !!localStorage.getItem('sam_sync_password_v1'), resetting: cloudResetInProgress }));
const kvKeyOf = (page, pw) => page.locator('body').evaluate((el, p) => deriveKvKey(p), pw);
const slotContent = (page, body, pw) => page.locator('body').evaluate(async (el, [b, p]) => {
  if (!b) return null;
  try { const parsed = await decryptSyncBlob(b, p); return { version: b.version, assets: parsed.assets.length, tx: parsed.transactions.length, snaps: Object.keys(parsed.dailySnapshots || {}).length }; } catch { return { version: b.version, decrypt: false }; }
}, [body, pw]);
async function runReset(page, answers) {
  const messages = [];
  const queue = [...answers];
  const handler = async (dialog) => { messages.push(dialog.message()); if (queue.shift()) await dialog.accept(); else await dialog.dismiss(); };
  page.on('dialog', handler);
  // 앱 promise를 새 Promise로 감싸 붙잡는다 - 그대로 돌려주면 실패 경로에서 Playwright가 'promise was garbage collected'로 끊는 경우가 있다.
  const result = await page.locator('body').evaluate((el) => new Promise((resolve) => { el.ownerDocument.defaultView.resetCloudData().then(resolve, (e) => resolve('rejected:' + e.message)); }));
  page.off('dialog', handler);
  return { result, messages };
}

/* ══ RR: 일별 이력 복구 제거 ══════════════════════════════════════════ */

test('RR-1/RR-2. 복구 버튼·파일 입력·문구·안내 속성·전역 함수가 어디에도 없다', async ({ page }) => {
  await cleanOpen(page);
  await page.locator('#systemManagementBtn').click();
  const r = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const texts = [];
    const walker = doc.createTreeWalker(doc.body, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const tag = n.parentElement ? n.parentElement.tagName : '';
      if (tag !== 'SCRIPT' && tag !== 'STYLE') texts.push(n.nodeValue);
    }
    doc.querySelectorAll('[title],[aria-label],[placeholder]').forEach((e) => ['title', 'aria-label', 'placeholder'].forEach((a) => { if (e.hasAttribute(a)) texts.push(e.getAttribute(a)); }));
    return {
      elements: ['recoverSnapshotsBtn', 'snapshotRecoveryFileInput'].filter((id) => doc.getElementById(id)),
      recoveryTexts: texts.filter((t) => /복구|recover/i.test(t)),
      globals: ['planSnapshotRecovery', 'applySnapshotRecovery', 'detectPlaceholderCandidates', 'describeRecoveryBackup', 'hasNoRecordedPnl', 'isValidSnapshotEntry', 'stableSnapshotJson']
        .filter((g) => typeof win[g] !== 'undefined')
    };
  });
  expect(r.elements).toEqual([]);
  expect(r.recoveryTexts).toEqual([]);
  expect(r.globals).toEqual([]);
});

test('RR-3~RR-5. 부팅·Cloud pull·JSON 가져오기가 복구 코드 없이 오류 없이 끝나고, 받은 일별 이력은 그대로다', async ({ browser }) => {
  const shared = { store: {}, posts: [], gets: 0, holdGets: 0, held: [], failPost: false, dropPost: false };
  const openDevice = async () => {
    const context = await browser.newContext();
    await attachKv(context, shared);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await cleanOpen(page);
    return { context, page, errors };
  };
  const phone = await openDevice();
  await seedSynced(phone.page, 'e85-rr');
  const pc = await openDevice();
  // Cloud pull - [v243 P1-1 차이 확인] 빈 기기와 클라우드 데이터가 달라 자동 동기화는 합치지 않고 확인을 기다린다.
  // 차이 화면에서 [클라우드 데이터 받기]를 눌러 받는다(받기 경로도 일별 이력은 날짜 합집합으로 받는다).
  const res = await pc.page.locator('body').evaluate(async () => {
    localStorage.setItem('sam_sync_password_v1', 'e85-rr'); localStorage.setItem('sam_sync_enabled_v1', '1'); loadSyncState();
    return pullFromCloud({ silent: true });
  });
  /* [기대값 갱신 · §53-9 · v267] 빈 기기가 클라우드 데이터를 처음 받는 것은 손실이 없는 차이라
   * 이제 확인 없이 병합된다. 확인 화면이 뜬 경우에만 [받기]를 누른다(두 경로 모두 결과는 같다). */
  if (await pc.page.locator('#syncDirectionBox').isVisible()) {
    await pc.page.locator('#syncDirectionPullBtn').click();
    await pc.page.locator('#syncSettingsModal').waitFor({ state: 'hidden' });
  }
  const pulled = await pc.page.locator('body').evaluate((el, r) => ({ res: r, assets: state.assets.map((a) => a.name), snaps: Object.keys(state.dailySnapshots).length }), res);
  // JSON 가져오기(덮어쓰기 = 복원)
  const file = await pc.page.locator('body').evaluate(() => {
    const blob = JSON.parse(JSON.stringify(buildSyncBlob()));
    const d = new Date(); d.setDate(d.getDate() - 30);
    blob.dailySnapshots = { [dateKeyFromDate(d)]: { total: { cur: 123, dailyPnL: 4 }, byOwner: {}, byOwnerCategory: {} } };
    return blob;
  });
  await pc.page.setInputFiles('#jsonFileInput', { name: 'e85.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await pc.page.locator('#importChoiceOverwriteBtn').click();
  await pc.page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
  await pc.page.waitForTimeout(1000);
  const restored = await pc.page.locator('body').evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    const k = dateKeyFromDate(d);
    return { value: state.dailySnapshots[k] && state.dailySnapshots[k].total.cur, pastKeys: Object.keys(state.dailySnapshots).filter((x) => x < todayDateStr()).length };
  });
  await pc.page.reload();
  await settle(pc.page);
  /* [기대값 갱신 · §53-9 · v267] 빈 기기가 클라우드 데이터를 처음 받는 것은 손실이 생길 수 없는
   * 차이라 이제 확인 없이 병합된다. 이 테스트가 보는 것(복구 코드 없이 오류 없이 끝나고
   * 일별 이력이 그대로인지)은 두 경로 모두에서 같아야 한다. */
  expect(['held', 'applied']).toContain(pulled.res);
  expect(pulled.assets).toEqual(['E85_채권']);
  expect(pulled.snaps).toBeGreaterThanOrEqual(3);
  expect(restored).toEqual({ value: 123, pastKeys: 1 });
  expect(phone.errors, '부팅·push 오류 0').toEqual([]);
  expect(pc.errors, '부팅·pull·JSON 가져오기·재부팅 오류 0').toEqual([]);
  await phone.context.close();
  await pc.context.close();
});

test('RR-6~RR-8. 오늘 일별 이력은 계속 기록되고, 부팅해도 과거 이력이 생기거나 다시 계산되지 않는다', async ({ page }) => {
  await cleanOpen(page);
  const seeded = await page.locator('body').evaluate((el, asset) => {
    state.assets = [asset];
    const snaps = {};
    for (let n = 2; n <= 30; n += 2) { const d = new Date(); d.setDate(d.getDate() - n); snaps[dateKeyFromDate(d)] = { total: { cur: 1000 + n, dailyPnL: n }, byOwner: { '신랑': { cur: 1000 + n, dailyPnL: n } }, byOwnerCategory: {} }; }
    state.dailySnapshots = snaps;
    persistAssets(true); persistDailySnapshots(); renderAll();
    const today = todayDateStr();
    return { todayCur: state.dailySnapshots[today] && state.dailySnapshots[today].total.cur, past: JSON.stringify(Object.fromEntries(Object.entries(state.dailySnapshots).filter(([k]) => k < today).sort())) };
  }, BOND);
  await page.reload();
  await settle(page);
  await page.waitForTimeout(1500);
  const after = await page.locator('body').evaluate(async () => {
    const today = todayDateStr();
    return { past: JSON.stringify(Object.fromEntries(Object.entries(state.dailySnapshots).filter(([k]) => k < today).sort())), noop: [await backfillAllHoldingsDailyPnlHistory(), reconstructHistoricalCurValues()] };
  });
  expect(seeded.todayCur, '오늘 기록 = 보유 평가금액').toBe(3000000);
  expect(after.past, '부팅 뒤 과거 이력 불변(생성·재계산 0)').toBe(seeded.past);
  expect(after.noop).toEqual([{ targets: 0, disabled: true }, { changedDates: 0, disabled: true }]);
});

/* ══ CR: 클라우드 데이터 초기화 ════════════════════════════════════════ */

test('CR-1. 동기화 연결 상태에서 두 화면(데이터 관리·가족 동기화 설정)에서 진입할 수 있고, 1차 확인창이 범위를 구분해 적는다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-cr1');
  await page.locator('#systemManagementBtn').click();
  await expect(page.locator('#resetDataBtn')).toContainText('기기 데이터 초기화');
  await expect(page.locator('#resetCloudDataBtn')).toContainText('클라우드 데이터 초기화');
  await expect(page.locator('#resetCloudDataBtn')).toContainText('이 기기의 데이터는 삭제되지 않습니다');
  const messages = [];
  page.once('dialog', async (dialog) => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#resetCloudDataBtn').click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain('클라우드 데이터 초기화');
  expect(messages[0]).toContain('자산 1건 · 거래 1건 · 일별 이력 3일');
  expect(messages[0]).toContain('이 기기의 동기화: 켜짐');
  expect(messages[0]).toContain('이 기기의 데이터는 삭제되지 않습니다');
  expect(messages[0]).not.toMatch(/이 기기의 데이터를 (삭제|초기화)/);
  await page.locator('#closeSystemManagementModalBtn').click();
  await page.locator('#syncSettingsBtn').click();
  await expect(page.locator('#resetCloudDataSyncBtn')).toContainText('클라우드 데이터 초기화');
  expect(kv.posts.filter((p) => p.version === 0)).toEqual([]);
});

for (const [label, answers] of [['CR-2. 1차 확인에서 취소', [false]], ['CR-3. 2차 확인에서 취소', [true, false]]]) {
  test(`${label}하면 클라우드·이 기기·동기화 상태가 모두 그대로다`, async ({ page, context }) => {
    const kv = await attachKv(context);
    await cleanOpen(page);
    await seedSynced(page, 'e85-cancel');
    const cloudBefore = JSON.stringify(kv.store);
    const postsBefore = kv.posts.length;
    const localBefore = await localData(page);
    const { result, messages } = await runReset(page, answers);
    await page.waitForTimeout(1000);
    expect(result).toBe('cancelled');
    expect(messages.length).toBe(answers.length);
    if (answers.length === 2) {
      expect(messages[1]).toContain('클라우드 데이터만 초기화합니다');
      expect(messages[1]).toContain('이 기기의 데이터는 삭제되지 않습니다');
      expect(messages[1]).toContain('같은 암호로 동기화가 켜진 다른 기기가 있으면');
    }
    await expect(page.locator('#toastContainer')).toContainText('클라우드 데이터 초기화를 취소했습니다');
    expect(JSON.stringify(kv.store)).toBe(cloudBefore);
    expect(kv.posts.length).toBe(postsBefore);
    expect(await localData(page)).toBe(localBefore);
    expect(await syncInfo(page)).toEqual({ enabled: true, lsEnabled: '1', hasPassword: true, resetting: false });
  });
}

test('CR-4/CR-6/CR-7/CR-8/CR-11. 초기화는 이 암호의 슬롯만 빈 데이터로 덮고 다시 조회해 확인하며, 다른 암호 슬롯·이 기기 데이터는 그대로다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-a');
  // 다른 암호의 슬롯(다른 가족)
  await page.locator('body').evaluate(async () => {
    const enc = await encryptSyncBlob({ app: 'smart-asset-manager', assets: [{ id: 'other' }], transactions: [], dailySnapshots: {} }, 'e85-b');
    const k = await deriveKvKey('e85-b');
    await fetch(`${SYNC_WORKER_URL}/?k=${encodeURIComponent(k)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...enc, version: 12345, updatedAt: new Date().toISOString() }) });
  });
  const keyA = await kvKeyOf(page, 'e85-a');
  const keyB = await kvKeyOf(page, 'e85-b');
  const slotB = JSON.stringify(kv.store[keyB]);
  const localBefore = await localData(page);
  const postsBefore = kv.posts.length;
  const getsBefore = kv.gets;

  const { result } = await runReset(page, [true, true]);
  expect(result).toBe('reset');
  const newPosts = kv.posts.slice(postsBefore);
  expect(newPosts, '초기화 POST는 이 암호 슬롯 1건뿐').toEqual([{ k: keyA, version: 0 }]);
  expect(kv.gets - getsBefore, '초기화 전 조회 + 초기화 후 확인 조회').toBeGreaterThanOrEqual(2);
  expect(await slotContent(page, kv.store[keyA], 'e85-a')).toEqual({ version: 0, assets: 0, tx: 0, snaps: 0 });
  expect(JSON.stringify(kv.store[keyB]), '다른 암호 슬롯 무변경').toBe(slotB);
  expect(await localData(page), '이 기기의 자산·거래·일별 이력·목표비중·미래예측 무변경').toBe(localBefore);
  expect(await syncInfo(page), '이 기기 동기화만 꺼지고 암호는 남는다').toEqual({ enabled: false, lsEnabled: '0', hasPassword: true, resetting: false });
  await expect(page.locator('#toastContainer')).toContainText('클라우드 데이터를 초기화했습니다');
  await expect(page.locator('#toastContainer')).toContainText('이 기기의 데이터는 그대로');
  await page.waitForTimeout(4000);
  expect(kv.posts.length - postsBefore, '초기화 뒤 추가 업로드 0').toBe(1);
});

test('CR-5. 진행 중인 push와 예약된 push가 있어도 초기화 뒤 클라우드에 예전 데이터가 다시 쓰이지 않는다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-race');
  const key = await kvKeyOf(page, 'e85-race');
  page.on('dialog', (dialog) => dialog.accept());
  kv.holdGets = 1;
  await page.locator('body').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    win.__e85push = pushToCloud().then(() => 'ok', () => 'rejected');     // 진행 중(선조회 GET이 붙잡힘)
    state.assets[0].quantity = 2; persistAssets();                          // 예약된 push(3초 디바운스)
  });
  await expect.poll(() => kv.held.length).toBe(1);
  const resetPromise = page.locator('body').evaluate((el) => new Promise((resolve) => { el.ownerDocument.defaultView.resetCloudData().then(resolve, (e) => resolve('rejected:' + e.message)); }));
  await page.waitForTimeout(1500);
  const lockedDuringWait = await page.locator('body').evaluate(() => cloudResetInProgress);
  kv.held.splice(0).forEach((answer) => answer());
  const result = await resetPromise;
  await page.locator('body').evaluate((el) => el.ownerDocument.defaultView.__e85push);
  await page.waitForTimeout(5000);
  const content = await slotContent(page, kv.store[key], 'e85-race');
  expect(lockedDuringWait, '진행 중 push가 끝날 때까지 초기화가 잠금 상태로 기다린다').toBe(true);
  expect(result).toBe('reset');
  expect(kv.posts[kv.posts.length - 1], '마지막 업로드는 초기화(version 0)').toEqual({ k: key, version: 0 });
  expect(content).toEqual({ version: 0, assets: 0, tx: 0, snaps: 0 });
});

test('CR-6-b. 저장이 반영되지 않으면(다시 조회해 비어 있지 않으면) 실패로 보고하고 이 기기 데이터·동기화 상태는 그대로다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-verify');
  const key = await kvKeyOf(page, 'e85-verify');
  const slotBefore = JSON.stringify(kv.store[key]);
  const localBefore = await localData(page);
  kv.dropPost = true; // Worker가 200을 돌려주지만 저장하지 않는 상황
  const { result } = await runReset(page, [true, true]);
  expect(result).toBe('error');
  await expect(page.locator('#toastContainer')).toContainText('클라우드 데이터를 초기화하지 못했습니다');
  await expect(page.locator('#toastContainer')).toContainText('이 기기의 데이터는 그대로입니다');
  expect(JSON.stringify(kv.store[key])).toBe(slotBefore);
  expect(await localData(page)).toBe(localBefore);
  expect(await syncInfo(page)).toEqual({ enabled: true, lsEnabled: '1', hasPassword: true, resetting: false });
});

test('CR-10. 업로드 오류가 나면 이 기기·클라우드는 그대로이고 잠금이 풀려 일반 동기화가 계속 된다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-fail');
  const key = await kvKeyOf(page, 'e85-fail');
  const slotBefore = JSON.stringify(kv.store[key]);
  const localBefore = await localData(page);
  kv.failPost = true;
  const { result } = await runReset(page, [true, true]);
  expect(result).toBe('error');
  expect(JSON.stringify(kv.store[key])).toBe(slotBefore);
  expect(await localData(page)).toBe(localBefore);
  expect(await syncInfo(page)).toEqual({ enabled: true, lsEnabled: '1', hasPassword: true, resetting: false });
  kv.failPost = false;
  const postsBefore = kv.posts.length;
  await page.locator('body').evaluate(() => { state.assets[0].quantity = 3; persistAssets(); });
  await expect.poll(() => kv.posts.length, { timeout: 10000 }).toBeGreaterThan(postsBefore);
  expect((await slotContent(page, kv.store[key], 'e85-fail')).assets).toBe(1);
});

test('CR-9. 초기화 뒤 다시 연결하면 빈 슬롯처럼 [업로드] 확인만 뜨고, 업로드 후 일반 동기화가 다시 동작한다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  await seedSynced(page, 'e85-again');
  const key = await kvKeyOf(page, 'e85-again');
  expect((await runReset(page, [true, true])).result).toBe('reset');
  await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill('e85-again');
  await page.locator('#syncPasswordSaveBtn').click();
  await expect(page.locator('#syncUploadConfirmBox')).toBeVisible();
  await expect(page.locator('#syncDirectionBox')).toBeHidden();
  await page.locator('#syncUploadConfirmBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  const uploaded = await slotContent(page, kv.store[key], 'e85-again');
  expect(uploaded.version).toBeGreaterThan(0);
  expect(uploaded.assets).toBe(1);
  expect((await syncInfo(page)).enabled).toBe(true);
  const postsBefore = kv.posts.length;
  await page.locator('body').evaluate(() => { state.assets[0].quantity = 4; persistAssets(); });
  await expect.poll(() => kv.posts.length, { timeout: 10000 }).toBeGreaterThan(postsBefore);
});

test('CR-11-b. 동기화 암호가 없는 기기에서는 초기화하지 않고 안내만 한다', async ({ page, context }) => {
  const kv = await attachKv(context);
  await cleanOpen(page);
  const { result, messages } = await runReset(page, [true, true]);
  expect(result).toBe('not_connected');
  expect(messages).toEqual([]);
  await expect(page.locator('#toastContainer')).toContainText('동기화 암호가 없습니다');
  expect(kv.posts).toEqual([]);
});

// [PM 지시 3/3] 예전 기대값은 "동기화가 켜진 다른 기기가 다음 업로드 때 자기 데이터를 다시 올린다"(당시 한계 고정)였다.
// 그 재충전을 코드로 막았으므로 같은 시나리오에서 감지·업로드 0·동기화 중지·로컬 보존을 확인한다(세부 경로는 e2e/86).
test('CR-13. 같은 암호의 다른 기기는 초기화를 감지해 로컬 데이터를 지우지 않고, 다시 올리지도 않고, 동기화만 멈춘다', async ({ browser }) => {
  const shared = { store: {}, posts: [], gets: 0, holdGets: 0, held: [], failPost: false, dropPost: false };
  const openDevice = async () => {
    const context = await browser.newContext();
    await attachKv(context, shared);
    const page = await context.newPage();
    await cleanOpen(page);
    return { context, page };
  };
  const phone = await openDevice();
  await seedSynced(phone.page, 'e85-multi');
  const pc = await openDevice();
  await pc.page.locator('body').evaluate(async () => {
    localStorage.setItem('sam_sync_password_v1', 'e85-multi'); localStorage.setItem('sam_sync_enabled_v1', '1'); loadSyncState();
    await pullFromCloud({ fullAdopt: true });
  });
  expect((await runReset(phone.page, [true, true])).result).toBe('reset');
  const key = await kvKeyOf(phone.page, 'e85-multi');
  const pulled = await pc.page.locator('body').evaluate(async () => pullFromCloud({ silent: true }));
  const pcAssets = await pc.page.locator('body').evaluate(() => state.assets.map((a) => a.name));
  expect(pulled, '다른 기기는 초기화를 감지하고 받거나 병합하지 않는다(주기 pull이 먼저 감지했으면 disabled)').toMatch(/^(cloud_reset|disabled)$/);
  expect(pcAssets, '다른 기기의 로컬 자산은 지워지지 않는다').toEqual(['E85_채권']);
  const pcSync = await pc.page.locator('body').evaluate(async () => { await pushToCloud(); return { enabled: syncState.enabled, lastVersion: syncState.lastVersion }; });
  const slotAfter = await slotContent(pc.page, shared.store[key], 'e85-multi');
  expect(pcSync, '다른 기기의 동기화는 멈추고 버전 기준은 비운다').toEqual({ enabled: false, lastVersion: 0 });
  expect(slotAfter, '다른 기기가 예전 데이터를 다시 올리지 않는다').toEqual({ version: 0, assets: 0, tx: 0, snaps: 0 });
  await phone.context.close();
  await pc.context.close();
});

test('PG-1. 암호 저장 뒤 방향을 고르기 전에는 자동 동기화가 클라우드 데이터를 이 기기에 합치지 않는다', async ({ browser }) => {
  test.setTimeout(60000);
  const shared = { store: {}, posts: [], gets: 0, holdGets: 0, held: [], failPost: false, dropPost: false };
  const openDevice = async () => {
    const context = await browser.newContext();
    await attachKv(context, shared);
    const page = await context.newPage();
    await cleanOpen(page);
    return { context, page };
  };
  const phone = await openDevice();
  await seedSynced(phone.page, 'e85-gate');
  const pc = await openDevice();
  await pc.page.locator('#syncSettingsBtn').click();
  await pc.page.locator('#syncPasswordInput').fill('e85-gate');
  await pc.page.locator('#syncPasswordSaveBtn').click();
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await pc.page.waitForTimeout(12000); // 10초 주기 pull 1회 이상
  const waiting = await pc.page.locator('body').evaluate(() => ({ assets: state.assets.length, tx: state.transactions.length, snaps: Object.keys(state.dailySnapshots).length, enabled: syncState.enabled }));
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  const chosen = await pc.page.locator('body').evaluate(() => ({ assets: state.assets.map((a) => a.name), enabled: syncState.enabled }));
  expect(waiting, '고르기 전: 합쳐진 데이터 0 · 동기화 꺼짐').toEqual({ assets: 0, tx: 0, snaps: 0, enabled: false });
  expect(chosen).toEqual({ assets: ['E85_채권'], enabled: true });
  await phone.context.close();
  await pc.context.close();
});

for (const scheme of ['light', 'dark']) {
  test(`CR-12. 375px ${scheme}에서 두 초기화 버튼이 44px 이상·14px 이상이고 잘리지 않는다`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    await context.route(WORKER, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    const page = await context.newPage();
    await cleanOpen(page);
    await page.locator('body').evaluate((el, dark) => {
      el.ownerDocument.documentElement.classList.toggle('dark', dark);
      const tc = el.ownerDocument.getElementById('toastContainer'); if (tc) tc.style.display = 'none';
    }, scheme === 'dark');
    const measure = (sel) => page.locator(sel).evaluate((btn) => {
      const doc = btn.ownerDocument;
      const win = doc.defaultView;
      const r = btn.getBoundingClientRect();
      return { h: Math.round(r.height), minFont: Math.min(...[...btn.querySelectorAll('span')].map((s) => parseFloat(win.getComputedStyle(s).fontSize))),
        clipped: [...btn.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth + 1), overflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth };
    });
    await page.locator('#systemManagementBtn').click();
    await page.locator('#resetCloudDataBtn').scrollIntoViewIfNeeded();
    const sys = { device: await measure('#resetDataBtn'), cloud: await measure('#resetCloudDataBtn') };
    await page.locator('#closeSystemManagementModalBtn').click();
    await page.locator('#syncSettingsBtn').click();
    const sync = await measure('#resetCloudDataSyncBtn');
    for (const m of [sys.device, sys.cloud, sync]) {
      expect(m.h).toBeGreaterThanOrEqual(44);
      expect(m.minFont).toBeGreaterThanOrEqual(14);
      expect(m.clipped).toBe(false);
      expect(m.overflowX).toBe(false);
    }
    await context.close();
  });
}
