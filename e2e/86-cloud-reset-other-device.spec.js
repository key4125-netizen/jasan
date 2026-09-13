// E2E-86 [다른 기기의 클라우드 데이터 초기화 감지] (PM 작업지시 3/3)
//
// 문제: 클라우드 데이터 초기화(version 0) 뒤에도 같은 암호로 동기화가 켜진 기존 기기가 평소의 다음 push에서 자기 로컬
//       데이터를 다시 올려, 초기화한 클라우드가 곧바로 다시 채워졌다.
// 수정: 원격 version 0 + 이 기기가 이 슬롯의 version을 알고 있었음(lastVersion > 0) → 업로드·병합 없이 이 기기 동기화만 멈춘다.
//       로컬 데이터는 지우지도 받지도 않는다. 새로 연결하는 기기(lastVersion 0)의 [이 기기 데이터 업로드]는 그대로다.
// 전부 합성 데이터다. Cloud Worker는 route로 가로챈 가짜 KV만 쓴다(실제 Cloud 요청 0).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;

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
function makeCloud() { return { store: {}, log: [] }; }
async function openDevice(browser, cloud, label) {
  const context = await browser.newContext();
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      cloud.log.push({ label, method: 'POST', k, version: body.version });
      cloud.store[k] = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    cloud.log.push({ label, method: 'GET', k });
    if (!cloud.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloud.store[k]) });
  });
  const page = await context.newPage();
  const dev = { context, page, label, errors: [] };
  page.on('pageerror', (e) => dev.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await cleanOpen(page);
  return dev;
}
const postsBy = (cloud, label, since) => cloud.log.slice(since).filter((r) => r.label === label && r.method === 'POST');
async function seedLocal(dev, tag) {
  await dev.page.locator('body').evaluate((el, t) => {
    const now = Date.now();
    state.assets = [
      { id: t + '-bond', ticker: '', owner: '신랑', accountType: '일반계좌', category: '채권', categorySource: 'user', name: t + '_채권', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 2000000, currentPrice: 2000000, positionSource: 'manual', createdAt: 1, updatedAt: now },
      { id: t + '-stock', ticker: '005930', owner: '와이프', accountType: '일반계좌', category: '주식', categorySource: 'user', name: t + '_주식', isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 50000, currentPrice: 60000, positionSource: 'ledger', createdAt: 1, updatedAt: now }
    ];
    state.transactions = [{ id: t + '-tx', date: '2026-09-01', owner: '와이프', accountType: '일반계좌', ticker: '005930', name: t + '_주식', type: 'buy', quantity: 10, price: 50000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: now }];
    state.dailySnapshots = {};
    for (let n = 1; n <= 3; n++) { const d = new Date(); d.setDate(d.getDate() - n); state.dailySnapshots[dateKeyFromDate(d)] = { total: { cur: 2600000, dailyPnL: n }, byOwner: {}, byOwnerCategory: {} }; }
    persistAssets(true); persistTransactions(); persistDailySnapshots();
    renderAll();
  }, tag);
}
async function connectSynced(dev, pw, mode) {
  // mode 'push': 이 기기 데이터로 슬롯을 채운다 / 'adopt': 슬롯 데이터를 받아 온다 - 둘 다 동기화 켜짐 · lastVersion > 0
  await dev.page.locator('body').evaluate(async (el, [p, m]) => {
    localStorage.setItem('sam_sync_password_v1', p); localStorage.setItem('sam_sync_enabled_v1', '1'); loadSyncState();
    if (m === 'push') await pushToCloud(); else await pullFromCloud({ fullAdopt: true });
  }, [pw, mode]);
  await dev.page.waitForTimeout(3500);
}
const syncOf = (dev) => dev.page.locator('body').evaluate(() => ({ enabled: syncState.enabled, lastVersion: syncState.lastVersion, lsEnabled: localStorage.getItem('sam_sync_enabled_v1'),
  lsLastVersion: localStorage.getItem('sam_sync_last_version_v1'), baseline: localStorage.getItem('sam_sync_merged_asset_ids_v1') }));
const localData = (dev) => dev.page.locator('body').evaluate(() => {
  const sortK = (x) => (Array.isArray(x) ? x.map(sortK) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((a, k) => { a[k] = sortK(x[k]); return a; }, {}) : x);
  const today = todayDateStr();
  return JSON.stringify(sortK({ assets: state.assets.map((a) => ({ id: a.id, name: a.name, quantity: a.quantity, buyPrice: a.buyPrice, positionSource: a.positionSource, categorySource: a.categorySource })),
    tx: state.transactions.map((t) => ({ id: t.id, quantity: t.quantity, price: t.price })), past: Object.fromEntries(Object.entries(state.dailySnapshots).filter(([k]) => k < today)) }));
});
const slotOf = (dev, cloud, pw) => dev.page.locator('body').evaluate(async (el, [store, p]) => {
  const k = await deriveKvKey(p);
  const b = store[k];
  if (!b) return null;
  const parsed = await decryptSyncBlob(b, p);
  return { version: b.version, assets: (parsed.assets || []).map((a) => a.name).sort(), tx: (parsed.transactions || []).length, snaps: Object.keys(parsed.dailySnapshots || {}).length };
}, [cloud.store, pw]);
const resetFrom = (dev) => dev.page.locator('body').evaluate((el) => new Promise((resolve) => { el.ownerDocument.defaultView.resetCloudData().then(resolve, (e) => resolve('rejected:' + e.message)); }));
const toastText = (dev) => dev.page.locator('#toastContainer').textContent();
const NOTICE = '클라우드 데이터가 초기화되어 이 기기의 동기화를 중지했습니다';

async function twoSyncedDevices(browser, cloud, pw) {
  const A = await openDevice(browser, cloud, 'A');
  await seedLocal(A, 'A');
  await connectSynced(A, pw, 'push');
  const B = await openDevice(browser, cloud, 'B');
  await connectSynced(B, pw, 'adopt');
  return { A, B };
}

test('CR-14. 동기화가 켜진 기존 기기 A는 다른 기기의 초기화 뒤 자동 push에서 예전 데이터를 올리지 않고 동기화만 멈춘다(로컬 보존)', async ({ browser }) => {
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-14');
  const aBefore = await localData(A);
  expect((await syncOf(A)).lastVersion).toBeGreaterThan(0);
  expect(await resetFrom(B)).toBe('reset');
  const since = cloud.log.length;
  const pushed = await A.page.locator('body').evaluate(async () => pushToCloud());
  await A.page.waitForTimeout(1000);
  expect([ 'cloud_reset', undefined ], 'push 선조회에서 감지(주기 pull이 먼저 감지했으면 push는 바로 끝난다)').toContain(pushed);
  expect(postsBy(cloud, 'A', since), 'A의 업로드 0').toEqual([]);
  expect(await slotOf(A, cloud, 'e86-14')).toEqual({ version: 0, assets: [], tx: 0, snaps: 0 });
  expect(await syncOf(A)).toEqual({ enabled: false, lastVersion: 0, lsEnabled: '0', lsLastVersion: '0', baseline: '[]' });
  expect(await localData(A), 'A의 로컬 데이터 보존').toBe(aBefore);
  expect(await toastText(A)).toContain(NOTICE);
  expect(await toastText(A)).toContain('이 기기의 데이터는 삭제되지 않았습니다');
  await A.context.close(); await B.context.close();
});

test('CR-15. 감지 뒤 15초 대기·부팅·렌더·시세 갱신·포커스 복귀·입력 저장을 해도 클라우드가 다시 채워지지 않는다', async ({ browser }) => {
  test.setTimeout(90000);
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-15');
  expect(await resetFrom(B)).toBe('reset');
  const since = cloud.log.length;
  // A는 아무 조작 없이 기다린다(10초 주기 pull이 먼저 감지할 수 있다)
  await A.page.waitForTimeout(15000);
  await A.page.reload();
  await settle(A.page);
  await A.page.locator('body').evaluate((el) => {
    renderAll();
    refreshPricesAndRates();
    el.ownerDocument.dispatchEvent(new Event('visibilitychange'));
    state.assets[0].quantity = 2; persistAssets();
    state.projection.inflationRate = 2.7; persistProjection();
  });
  await A.page.waitForTimeout(12000);
  expect(postsBy(cloud, 'A', since), 'A의 업로드 0').toEqual([]);
  expect(await slotOf(A, cloud, 'e86-15')).toEqual({ version: 0, assets: [], tx: 0, snaps: 0 });
  expect((await syncOf(A)).enabled).toBe(false);
  const aNames = await A.page.locator('body').evaluate(() => ({ names: state.assets.map((a) => a.name).sort(), qty: state.assets[0].quantity }));
  expect(aNames, 'A의 로컬 데이터는 그대로이고 방금 입력도 로컬에 남는다').toEqual({ names: ['A_주식', 'A_채권'], qty: 2 });
  expect(A.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('CR-16. 동기화가 멈춘 A가 다시 암호를 입력해도 자동으로 올리지 않고, 명시적 확인 단계로만 진입한다', async ({ browser }) => {
  test.setTimeout(60000);
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-16');
  expect(await resetFrom(B)).toBe('reset');
  await A.page.locator('body').evaluate(async () => pullFromCloud({ silent: true }));
  const since = cloud.log.length;
  await A.page.locator('#syncSettingsBtn').click();
  await A.page.locator('#syncPasswordInput').fill('e86-16');
  await A.page.locator('#syncPasswordSaveBtn').click();
  await expect(A.page.locator('#syncUploadConfirmBox'), '빈 슬롯이라 [이 기기 데이터 업로드] 확인 단계').toBeVisible();
  await expect(A.page.locator('#syncDirectionBox')).toBeHidden();
  await A.page.waitForTimeout(12000);
  expect(postsBy(cloud, 'A', since), '확인 전 업로드 0').toEqual([]);
  expect((await slotOf(A, cloud, 'e86-16')).version).toBe(0);
  expect((await syncOf(A)).enabled).toBe(false);
  await A.context.close(); await B.context.close();
});

test('CR-17. 새 기기(로컬 데이터 있음 · lastVersion 0)는 version 0 슬롯에 [이 기기 데이터 업로드]로 정상 최초 업로드한다', async ({ browser }) => {
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-17');
  expect(await resetFrom(B)).toBe('reset');
  const N = await openDevice(browser, cloud, 'N');
  await seedLocal(N, 'N');
  const nBefore = await localData(N);
  expect((await syncOf(N)).lastVersion).toBe(0);
  await N.page.locator('#syncSettingsBtn').click();
  await N.page.locator('#syncPasswordInput').fill('e86-17');
  await N.page.locator('#syncPasswordSaveBtn').click();
  await expect(N.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await N.page.locator('#syncUploadConfirmBtn').click();
  await expect(N.page.locator('#syncSettingsModal')).toBeHidden();
  const slot = await slotOf(N, cloud, 'e86-17');
  expect(slot.version).toBeGreaterThan(0);
  expect(slot.assets).toEqual(['N_주식', 'N_채권']);
  expect(await localData(N), '업로드한 기기의 로컬 데이터 유지').toBe(nBefore);
  expect((await syncOf(N)).enabled).toBe(true);
  await A.context.close(); await B.context.close(); await N.context.close();
});

test('CR-18. version 0 슬롯 + lastVersion > 0 기기의 pull은 로컬을 지우지 않고 원격을 받지 않으며 동기화를 멈춘다', async ({ browser }) => {
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-18');
  const bBefore = await localData(B);
  expect(await resetFrom(A)).toBe('reset'); // 이번에는 A가 초기화하고 B의 pull을 본다
  const since = cloud.log.length;
  const pulled = await B.page.locator('body').evaluate(async () => pullFromCloud({ silent: true }));
  await B.page.waitForTimeout(4000);
  expect(pulled, '명시 pull에서 감지(주기 pull이 먼저 감지했으면 disabled)').toMatch(/^(cloud_reset|disabled)$/);
  expect(await localData(B), 'B의 로컬 데이터 보존(삭제·유입 없음)').toBe(bBefore);
  expect(await syncOf(B)).toEqual({ enabled: false, lastVersion: 0, lsEnabled: '0', lsLastVersion: '0', baseline: '[]' });
  expect(postsBy(cloud, 'B', since)).toEqual([]);
  expect((await slotOf(B, cloud, 'e86-18')).version).toBe(0);
  expect(await toastText(B)).toContain(NOTICE);
  await A.context.close(); await B.context.close();
});

test('CR-19. 다른 동기화 암호의 슬롯과 그 암호를 쓰는 기기는 영향을 받지 않는다', async ({ browser }) => {
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-19x');
  const Y = await openDevice(browser, cloud, 'Y');
  await seedLocal(Y, 'Y');
  await connectSynced(Y, 'e86-19y', 'push');
  const ySlotBefore = await slotOf(Y, cloud, 'e86-19y');
  expect(await resetFrom(B)).toBe('reset');
  const since = cloud.log.length;
  await Y.page.locator('body').evaluate(() => { state.assets[0].quantity = 3; persistAssets(); });
  await Y.page.waitForTimeout(5000);
  const ySlotAfter = await slotOf(Y, cloud, 'e86-19y');
  expect((await syncOf(Y)).enabled, 'Y 동기화는 계속 켜짐').toBe(true);
  expect(postsBy(cloud, 'Y', since).length, 'Y의 일반 업로드는 계속 된다').toBeGreaterThanOrEqual(1);
  expect(ySlotAfter.version).toBeGreaterThan(ySlotBefore.version);
  expect(ySlotAfter.assets).toEqual(['Y_주식', 'Y_채권']);
  expect((await slotOf(A, cloud, 'e86-19x')).version, '초기화한 슬롯은 version 0').toBe(0);
  await A.context.close(); await B.context.close(); await Y.context.close();
});

test('CR-20. 초기화 직전에 A에 예약된 push가 초기화 뒤에 실행돼도 예전 데이터를 다시 쓰지 않는다', async ({ browser }) => {
  const cloud = makeCloud();
  const { A, B } = await twoSyncedDevices(browser, cloud, 'e86-20');
  const since = cloud.log.length;
  await A.page.locator('body').evaluate(() => { state.assets[0].quantity = 5; persistAssets(); }); // 3초 뒤 실행될 예약 push
  expect(await resetFrom(B)).toBe('reset');
  await A.page.waitForTimeout(6000);
  expect(postsBy(cloud, 'A', since), '예약 push가 실행돼도 업로드 0').toEqual([]);
  expect(await slotOf(A, cloud, 'e86-20')).toEqual({ version: 0, assets: [], tx: 0, snaps: 0 });
  expect((await syncOf(A)).enabled).toBe(false);
  expect(await A.page.locator('body').evaluate(() => state.assets[0].quantity), '로컬 입력은 남는다').toBe(5);
  await A.context.close(); await B.context.close();
});

test('NS-1. 신규 시작 전체 절차 - 초기화를 빠뜨린 기기가 동기화 켜진 채 남아 있어도 클라우드는 비어 있고, 새 데이터가 최초 기준이 된다', async ({ browser }) => {
  test.setTimeout(180000);
  const cloud = makeCloud();
  const PW = 'e86-ns';
  const OLD1 = await openDevice(browser, cloud, 'OLD1');
  await seedLocal(OLD1, 'OLD');
  await connectSynced(OLD1, PW, 'push');
  const OLD2 = await openDevice(browser, cloud, 'OLD2');
  await connectSynced(OLD2, PW, 'adopt');
  const OLD3 = await openDevice(browser, cloud, 'OLD3'); // 초기화를 빠뜨린 기기(동기화 켜짐 · 예전 데이터)
  await connectSynced(OLD3, PW, 'adopt');
  const old3Before = await localData(OLD3);

  // 모든(빠뜨린 OLD3 제외) 기존 기기: 기기 데이터 초기화 → 재실행(v240)
  for (const d of [OLD2, OLD1]) {
    await d.page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('resetDataBtn').click(); });
    await d.page.reload();
    await settle(d.page);
    const s = await d.page.locator('body').evaluate((el) => ({ assets: state.assets.length, enabled: syncState.enabled, version: el.ownerDocument.getElementById('appVersionLabel').textContent }));
    expect(s).toEqual({ assets: 0, enabled: false, version: 'v240' });
  }
  // OLD1: 기존 암호 입력 → 방향 선택 전 자동 유입 없음
  await OLD1.page.locator('#syncSettingsBtn').click();
  await OLD1.page.locator('#syncPasswordInput').fill(PW);
  await OLD1.page.locator('#syncPasswordSaveBtn').click();
  await expect(OLD1.page.locator('#syncDirectionBox')).toBeVisible();
  await OLD1.page.waitForTimeout(12000);
  expect(await OLD1.page.locator('body').evaluate(() => ({ assets: state.assets.length, snaps: Object.keys(state.dailySnapshots).length, enabled: syncState.enabled })))
    .toEqual({ assets: 0, snaps: 0, enabled: false });
  // [클라우드 데이터 초기화](가족 동기화 설정 화면) → GET 재검증
  await OLD1.page.locator('#resetCloudDataSyncBtn').click();
  await expect(OLD1.page.locator('#toastContainer')).toContainText('클라우드 데이터를 초기화했습니다', { timeout: 15000 });
  expect(await slotOf(OLD1, cloud, PW)).toEqual({ version: 0, assets: [], tx: 0, snaps: 0 });
  expect((await syncOf(OLD1)).enabled).toBe(false);

  // 빠뜨린 OLD3: 대기 → 부팅 → 렌더 → 갱신 → 포커스 복귀 → 입력 저장
  const since = cloud.log.length;
  await OLD3.page.waitForTimeout(12000);
  await OLD3.page.reload();
  await settle(OLD3.page);
  await OLD3.page.locator('body').evaluate((el) => {
    renderAll(); refreshPricesAndRates(); el.ownerDocument.dispatchEvent(new Event('visibilitychange'));
    state.projection.inflationRate = 2.8; persistProjection();
  });
  await OLD3.page.waitForTimeout(8000);
  expect(postsBy(cloud, 'OLD3', since), '빠뜨린 기기의 재업로드 0').toEqual([]);
  expect(await slotOf(OLD3, cloud, PW), '클라우드 version 0 유지').toEqual({ version: 0, assets: [], tx: 0, snaps: 0 });
  expect(await localData(OLD3), '빠뜨린 기기의 로컬 데이터 보존').toBe(old3Before);
  expect((await syncOf(OLD3)).enabled, '빠뜨린 기기 동기화 중지').toBe(false);

  // 새 데이터 입력 → 명시적 [이 기기 데이터 업로드] → 다른 기기 [클라우드 데이터 받기]
  await seedLocal(OLD1, 'NEW');
  await OLD1.page.locator('body').evaluate((el) => { const m = el.ownerDocument.getElementById('syncSettingsModal'); if (m.classList.contains('hidden')) el.ownerDocument.getElementById('syncSettingsBtn').click(); });
  await OLD1.page.locator('#syncPasswordInput').fill(PW);
  await OLD1.page.locator('#syncPasswordSaveBtn').click();
  await expect(OLD1.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await OLD1.page.locator('#syncUploadConfirmBtn').click();
  await expect(OLD1.page.locator('#syncSettingsModal')).toBeHidden();
  const uploaded = await slotOf(OLD1, cloud, PW);
  expect(uploaded.version).toBeGreaterThan(0);
  expect(uploaded.assets).toEqual(['NEW_주식', 'NEW_채권']);

  await OLD2.page.locator('#syncSettingsBtn').click();
  await OLD2.page.locator('#syncPasswordInput').fill(PW);
  await OLD2.page.locator('#syncPasswordSaveBtn').click();
  await expect(OLD2.page.locator('#syncDirectionBox')).toBeVisible();
  await OLD2.page.locator('#syncDirectionPullBtn').click();
  await expect(OLD2.page.locator('#syncSettingsModal')).toBeHidden();
  expect(await localData(OLD2), '다른 기기가 받은 데이터 = 새 데이터').toBe(await localData(OLD1));
  expect([...OLD1.errors, ...OLD2.errors, ...OLD3.errors]).toEqual([]);
  await OLD1.context.close(); await OLD2.context.close(); await OLD3.context.close();
});
