// E2E-122 [PM 지시 2026-09-24] 업로드가 상대 기기의 업로드를 덮어쓰지 않는다.
//
// 무엇을 고정하는가 - "덮어쓰기 전 병합"(js/12 pushToCloud)은 클라우드를 한 번 확인한 뒤
// 암호화하고 쓴다. 확인과 쓰기 사이에 상대 기기가 올리면, 예전에는 그 내용이 통째로 사라졌다.
//
//   pc  GET  클라우드 v1 확인 → "내 것과 같다" → 암호화 …
//   phone                        그 사이에 새 거래를 v2로 업로드
//   pc  POST 뒤늦게 도착 → v2를 덮어씀. 거래가 사라지고 버전도 과거로 되돌아간다.
//   pc  pull → "받아올 새 내용이 없다"(up_to_date)
//
// 전체 E2E에서 두 번 관찰된 e2e/78 실패(pullAndAccept가 'up_to_date'를 받음)의 실제 원인이
// 이것이었다. 테스트 하네스 문제가 아니라 제품의 경쟁 상태다.
//
// 아래 테스트는 "낡은 정보를 들고 판단하는 기기"를 서버 응답 지연으로 확정적으로 만든다
// (부하에 기대지 않는다 - 언제 돌려도 같은 순서가 나온다).
//
// 외부 Cloud Worker는 호출하지 않는다 - page.route로 가로채고 노드 메모리의 가짜 KV만 쓴다.
// 합성 데이터만 쓴다(E122 접두어).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e122-shared-password';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE_TX = {
  id: 'e122-tx-base', date: '2026-01-02', owner: '신랑', accountType: '일반계좌', ticker: 'AAA',
  name: 'E122_종목', type: 'buy', quantity: 100, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};
const BASE_ASSET = {
  id: 'e122-as', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'E122_종목', isDomestic: '국내', currency: 'KRW',
  quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};

/* 가짜 클라우드. slow.delayGetFor에 기기 이름을 넣어 두면 그 기기의 다음 조회 한 번만
 * "지금 값을 읽어 두고 늦게 돌려준다" - 그 기기가 낡은 정보로 판단하는 상황을 만든다. */
function makeCloud() {
  return { store: {}, slow: { delayGetFor: null, getMs: 7000 }, writes: [] };
}
async function attachCloud(context, cloud, who) {
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      cloud.store[k] = body;
      cloud.writes.push({ who, version: body.version });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    const snapshot = cloud.store[k];
    if (cloud.slow.delayGetFor === who) { cloud.slow.delayGetFor = null; await sleep(cloud.slow.getMs); }
    if (!snapshot) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
  });
}
async function openDevice(browser, cloud, who) {
  const context = await browser.newContext();
  await attachCloud(context, cloud, who);
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function'
    && typeof pullFromCloud === 'function');
  return { context, page };
}

const seed = (page) => page.locator('body').evaluate((el, { tx, asset }) => {
  localStorage.clear();
  state.transactions = [tx]; state.assets = [asset];
  state.projection.monthlyContribution = 100000; state.projection.updatedAt = 1000;
  state.rebalance.updatedAt = 1000;
  persistAssets(true); persistTransactions(); persistRebalance(true); persistProjection(true);
}, { tx: BASE_TX, asset: BASE_ASSET });
const wipe = (page) => page.locator('body').evaluate(() => { localStorage.clear(); });
const addTx = (page, tx) => page.locator('body').evaluate((el, t) => {
  state.transactions.push(t); persistTransactions(); syncAssetsFromTransactions(); persistAssets();
}, tx);
const disableSync = (page) => page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('syncDisableBtn').click(); });
const txIds = (page) => page.locator('body').evaluate(() => state.transactions.map((t) => t.id).sort());
const lastVersion = (page) => page.evaluate(() => Number(localStorage.getItem('sam_sync_last_version_v1')) || 0);

async function savePassword(page, pw) {
  if (await page.locator('#syncSettingsModal').isHidden()) await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill(pw);
  await page.locator('#syncPasswordSaveBtn').click();
}

// 정상 동기화가 끝난 두 기기.
async function pairedDevices(browser, cloud) {
  const phone = await openDevice(browser, cloud, 'phone');
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, cloud, 'pc');
  await wipe(pc.page);
  await savePassword(pc.page, PW);
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  return { phone, pc };
}

test('R-1. 낡은 정보로 판단한 자동 업로드는 상대 기기가 방금 올린 내용을 덮어쓰지 않는다', async ({ browser }) => {
  const cloud = makeCloud();
  const { phone, pc } = await pairedDevices(browser, cloud);

  // pc는 방금 받은 내용을 3초 뒤 자동으로 올린다(schedulePush 디바운스).
  // 그 판단에 쓰는 조회를 늦춰, pc가 "클라우드는 예전 그대로"라고 믿는 동안 phone이 올리게 한다.
  cloud.slow.delayGetFor = 'pc';

  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e122-tx-phone', quantity: 10, createdAt: 2000, updatedAt: 2000 });
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const phoneWrite = cloud.writes[cloud.writes.length - 1];
  expect(phoneWrite.who, 'phone의 업로드가 기록되지 않았다').toBe('phone');

  await pc.page.waitForTimeout(9000); // pc의 늦은 판단이 끝날 시간을 준다

  // 핵심: pc는 낡은 정보를 받아 들고도 덮어쓰지 않았다.
  const after = cloud.writes[cloud.writes.length - 1];
  expect(after.who, 'pc가 phone의 업로드를 덮어썼다 - 상대 기기의 거래가 클라우드에서 사라진다').toBe('phone');
  expect(after.version, '클라우드 버전이 과거로 되돌아갔다').toBe(phoneWrite.version);

  // 그래서 pc는 아직 받을 것이 남아 있다고 정상 판단한다(예전에는 'up_to_date'였다).
  const res = await pc.page.locator('body').evaluate(() => pullFromCloud({ silent: true }));
  expect(['held', 'applied'], `pc pull이 ${res}`).toContain(res);
  if (res === 'held') {
    await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
    await pc.page.locator('#syncDirectionPullBtn').click();
    await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  }
  expect(await txIds(pc.page), 'phone이 올린 거래가 pc에 도착하지 않았다').toEqual(['e122-tx-base', 'e122-tx-phone']);

  await phone.context.close(); await pc.context.close();
});

test('R-2. 클라우드가 그대로면 예전처럼 정상 업로드한다(재확인이 정상 경로를 막지 않는다)', async ({ browser }) => {
  const cloud = makeCloud();
  const { phone, pc } = await pairedDevices(browser, cloud);
  const before = cloud.writes.length;

  await addTx(pc.page, { ...BASE_TX, id: 'e122-tx-pc', quantity: 5, createdAt: 3000, updatedAt: 3000 });
  await pc.page.waitForTimeout(5000); // 디바운스 3초 + 여유

  const writes = cloud.writes.slice(before);
  expect(writes.length, 'pc의 자동 업로드가 일어나지 않았다').toBeGreaterThan(0);
  expect(writes[writes.length - 1].who).toBe('pc');
  expect(await lastVersion(pc.page), '업로드한 버전을 이 기기가 기억해야 한다')
    .toBe(writes[writes.length - 1].version);

  await phone.context.close(); await pc.context.close();
});

test('R-3. 클라우드에 기록된 버전은 쓰기 순서대로 커진다(과거로 되돌아가지 않는다)', async ({ browser }) => {
  const cloud = makeCloud();
  const { phone, pc } = await pairedDevices(browser, cloud);

  await addTx(pc.page, { ...BASE_TX, id: 'e122-tx-pc', quantity: 5, createdAt: 3000, updatedAt: 3000 });
  await pc.page.waitForTimeout(5000);

  const versions = cloud.writes.map((w) => w.version);
  const sorted = versions.slice().sort((a, b) => a - b);
  expect(versions, `쓰기 순서와 버전 순서가 다르다: ${JSON.stringify(cloud.writes)}`).toEqual(sorted);

  await phone.context.close(); await pc.context.close();
});
