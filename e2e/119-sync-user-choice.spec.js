// E2E-119 [PM 지시 2026-09-23 · 동기화] 사용자 선택 방식 + 팝업 lifecycle.
//
//  ① 두 곳이 같으면 묻지 않고 그대로 동기화한다(Case A).
//  ② 두 곳이 다르면 앱이 고르지 않고 사용자가 [클라우드 데이터 받기] · [이 기기 데이터 올리기]를 고른다(Case B).
//     v267(PC-6)에서 자동 병합되던 "한쪽에만 있는 신규 항목"도 이제 확인을 거친다.
//  ③ 처리가 끝나면 팝업이 남지 않는다 - 특히 [동기화 끄기]와 [클라우드 데이터 초기화].
//
// 외부 Cloud Worker는 호출하지 않는다(page.route로 가로채 메모리 KV로만 주고받는다).
// 실제 사용자 데이터는 쓰지 않는다 - 전부 합성 fixture(ZZ 접두어).
/* global document, getComputedStyle */
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e119-shared-password';

function makeKv() { return { store: {} }; }

async function openDevice(browser, kv) {
  const context = await browser.newContext();
  const gate = { posts: 0 };
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      gate.posts++;
      kv.store[k] = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function'
    && typeof compareSyncData === 'function');
  return { context, page, gate };
}

const ASSET = {
  id: 'zz-as-1', ticker: 'ZZ0001.KS', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'ZZ합성주식', isDomestic: '국내', currency: 'KRW',
  quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};
const TX = {
  id: 'zz-tx-1', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0001.KS',
  name: 'ZZ합성주식', type: 'buy', quantity: 100, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};

const seed = (page) => page.locator('body').evaluate((el, { tx, asset }) => {
  localStorage.clear();
  state.transactions = [tx];
  state.assets = [asset];
  state.projection.monthlyContribution = 100000; state.projection.updatedAt = 1000;
  state.rebalance.updatedAt = 1000;
  persistAssets(true); persistTransactions(); persistRebalance(true); persistProjection(true);
}, { tx: TX, asset: ASSET });

async function savePassword(page, pw) {
  if (await page.locator('#syncSettingsModal').isHidden()) await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill(pw);
  await page.locator('#syncPasswordSaveBtn').click();
}

/* 기기 1대가 클라우드 슬롯을 만든다(이후 테스트의 "저쪽 기기" 역할). */
async function seedCloud(browser, kv, mutate) {
  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  if (mutate) await page.locator('body').evaluate(mutate);
  await savePassword(page, PW);
  await page.locator('#syncUploadConfirmBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  await context.close();
}

/* ══════════════ A. 동기화 켜기 / 끄기 ══════════════ */

test('A-1. [동기화 끄기]를 누르면 완료 메시지가 뜨고 팝업이 닫힌다', async ({ browser }) => {
  const kv = makeKv();
  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  await savePassword(page, PW);
  await page.locator('#syncUploadConfirmBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();

  await page.locator('#syncSettingsBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeVisible();
  await page.locator('#syncDisableBtn').click();
  // 완료 메시지와 팝업 종료가 함께 일어난다(예전에는 메시지만 뜨고 팝업이 남았다).
  await expect(page.getByText('동기화를 껐습니다.')).toBeVisible();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  expect(await page.evaluate(() => syncState.enabled)).toBe(false);

  // 재오픈하면 꺼진 상태가 그대로 보이고, 이전 화면 상태가 남지 않는다.
  await page.locator('#syncSettingsBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeVisible();
  await expect(page.locator('#syncStatusText')).toContainText('중지');
  await expect(page.locator('#syncDirectionBox')).toBeHidden();
  await expect(page.locator('#syncUploadConfirmBox')).toBeHidden();
  await context.close();
});

test('A-2. 팝업을 반복해서 열고 닫아도 상태가 새지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  for (let i = 0; i < 5; i++) {
    await page.locator('#syncSettingsBtn').click();
    await expect(page.locator('#syncSettingsModal')).toBeVisible();
    await page.locator('#closeSyncSettingsModalBtn').click();
    await expect(page.locator('#syncSettingsModal')).toBeHidden();
  }
  const s = await page.evaluate(() => ({
    direction: document.getElementById('syncDirectionBox').classList.contains('hidden'),
    upload: document.getElementById('syncUploadConfirmBox').classList.contains('hidden'),
    decrypt: document.getElementById('syncDecryptErrorBox').classList.contains('hidden'),
    bodyOverflow: getComputedStyle(document.body).overflow
  }));
  expect(s).toEqual({ direction: true, upload: true, decrypt: true, bodyOverflow: 'visible' });
  await context.close();
});

/* ══════════════ B. 이 기기 데이터 업로드 ══════════════ */

test('B. 최초 업로드는 확인을 거쳐 실행되고 팝업이 닫힌다', async ({ browser }) => {
  const kv = makeKv();
  const { context, page, gate } = await openDevice(browser, kv);
  await seed(page);
  await savePassword(page, PW);
  await expect(page.locator('#syncUploadConfirmBox')).toBeVisible();
  expect(gate.posts, '확인 전에는 올리지 않는다').toBe(0);
  await page.locator('#syncUploadConfirmBtn').click();
  await expect(page.getByText('이 기기의 데이터를 클라우드에 업로드했습니다.')).toBeVisible();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  expect(gate.posts).toBeGreaterThan(0);
  expect(Object.keys(kv.store).length, '클라우드에 반영됐다').toBe(1);
  await context.close();
});

/* ══════════════ C · D · E. 받기 · 같음 · 다름 ══════════════ */

test('D. 두 곳이 같으면 아무것도 묻지 않고 그대로 동기화된다', async ({ browser }) => {
  const kv = makeKv();
  await seedCloud(browser, kv);

  const { context, page } = await openDevice(browser, kv);
  await seed(page); // 같은 데이터
  const r = await page.evaluate(async () => {
    syncState.password = 'e119-shared-password';
    syncState.enabled = true;
    localStorage.setItem('sam_sync_password', 'e119-shared-password');
    localStorage.setItem('sam_sync_enabled', '1');
    return await pullFromCloud({ silent: true });
  });
  expect(r, '보류되지 않고 진행된다').not.toBe('held');
  await expect(page.locator('#syncDirectionBox')).toBeHidden();
  await context.close();
});

test('E-1. 클라우드에만 있는 신규 거래도 자동 병합하지 않고 사용자에게 묻는다', async ({ browser }) => {
  const kv = makeKv();
  // 저쪽 기기가 거래를 하나 더 올려 둔다(v267에서는 이 경우가 조용히 병합됐다).
  await seedCloud(browser, kv, () => {
    state.transactions.push({ ...state.transactions[0], id: 'zz-tx-2', date: '2026-09-10' });
    persistTransactions();
  });

  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  const before = await page.evaluate(() => state.transactions.length);
  const r = await page.evaluate(async () => {
    syncState.password = 'e119-shared-password';
    syncState.enabled = true;
    localStorage.setItem('sam_sync_password', 'e119-shared-password');
    localStorage.setItem('sam_sync_enabled', '1');
    return await pullFromCloud({ silent: true });
  });
  expect(r, '자동 병합하지 않고 보류한다').toBe('held');
  expect(await page.evaluate(() => state.transactions.length), '고르기 전에는 이 기기 데이터가 그대로다').toBe(before);
  await expect(page.locator('#syncSettingsModal')).toBeVisible();
  await expect(page.locator('#syncDirectionBox')).toBeVisible();
  await expect(page.locator('#syncDirectionPullBtn')).toBeVisible();
  await expect(page.locator('#syncDirectionPushBtn')).toBeVisible();

  // [클라우드 데이터 받기]를 고르면 그 기준으로 반영되고 팝업이 닫힌다.
  await page.locator('#syncDirectionPullBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  expect(await page.evaluate(() => state.transactions.length)).toBe(before + 1);
  await context.close();
});

test('E-2. [이 기기 데이터 올리기]를 고르면 이 기기 기준으로 클라우드가 바뀐다', async ({ browser }) => {
  const kv = makeKv();
  await seedCloud(browser, kv, () => {
    state.assets[0].quantity = 80;
    persistAssets(true);
  });

  const { context, page } = await openDevice(browser, kv);
  await seed(page); // 수량 100
  page.on('dialog', (d) => d.accept()); // [올리기] 2차 확인
  const r = await page.evaluate(async () => {
    syncState.password = 'e119-shared-password';
    syncState.enabled = true;
    localStorage.setItem('sam_sync_password', 'e119-shared-password');
    localStorage.setItem('sam_sync_enabled', '1');
    return await pullFromCloud({ silent: true });
  });
  expect(r).toBe('held');
  await expect(page.locator('#syncDirectionBox')).toBeVisible();

  await page.locator('#syncDirectionPushBtn').click();
  await expect(page.getByText('이 기기 데이터를 클라우드에 올렸습니다.')).toBeVisible();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  expect(await page.evaluate(() => state.assets[0].quantity), '이 기기 값이 그대로다').toBe(100);
  await context.close();
});

test('E-3. [취소]하면 두 곳 모두 그대로이고 팝업이 닫힌다', async ({ browser }) => {
  const kv = makeKv();
  await seedCloud(browser, kv, () => {
    state.assets[0].quantity = 80;
    persistAssets(true);
  });

  const { context, page, gate } = await openDevice(browser, kv);
  await seed(page);
  const postsBefore = gate.posts;
  await page.evaluate(async () => {
    syncState.password = 'e119-shared-password';
    syncState.enabled = true;
    localStorage.setItem('sam_sync_password', 'e119-shared-password');
    localStorage.setItem('sam_sync_enabled', '1');
    return await pullFromCloud({ silent: true });
  });
  await expect(page.locator('#syncDirectionBox')).toBeVisible();
  await page.locator('#syncDirectionCancelBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  expect(await page.evaluate(() => state.assets[0].quantity), '이 기기 무변경').toBe(100);
  expect(gate.posts, '클라우드 무변경(POST 없음)').toBe(postsBefore);
  await context.close();
});

/* ══════════════ F. 실패 ══════════════ */

test('F. 네트워크 실패 시 데이터가 바뀌지 않고 다시 시도할 수 있다', async ({ browser }) => {
  const kv = makeKv();
  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  // 이번 요청만 실패시킨다(라우트를 덮어쓴다).
  await context.route(WORKER, (route) => route.abort('failed'));
  await savePassword(page, PW);
  await expect(page.getByText('네트워크 오류로 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeVisible();
  await expect(page.locator('#syncSettingsModal'), '실패하면 팝업을 닫지 않는다(재시도)').toBeVisible();
  expect(await page.evaluate(() => state.assets.length), '데이터 손상 없음').toBe(1);

  // 복구 후 다시 시도하면 정상 흐름으로 이어진다.
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') { kv.store[k] = JSON.parse(req.postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
  await page.locator('#syncPasswordSaveBtn').click();
  await expect(page.locator('#syncUploadConfirmBox')).toBeVisible();
  await context.close();
});

/* ══════════════ 초기화 ══════════════ */

test('초기화. 클라우드 데이터 초기화가 끝나면 팝업이 닫히고 이 기기 데이터는 그대로다', async ({ browser }) => {
  const kv = makeKv();
  const { context, page } = await openDevice(browser, kv);
  await seed(page);
  await savePassword(page, PW);
  await page.locator('#syncUploadConfirmBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();

  page.on('dialog', (d) => d.accept()); // 1차 · 2차 확인
  await page.locator('#syncSettingsBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeVisible();
  await page.locator('#resetCloudDataSyncBtn').click();
  await expect(page.getByText('클라우드 데이터를 초기화했습니다.', { exact: false })).toBeVisible();
  await expect(page.locator('#syncSettingsModal'), '초기화가 끝나면 팝업이 닫힌다').toBeHidden();
  expect(await page.evaluate(() => state.assets.length), '이 기기 데이터는 삭제되지 않는다').toBe(1);
  expect(await page.evaluate(() => state.transactions.length)).toBe(1);
  expect(await page.evaluate(() => syncState.enabled), '이 기기의 동기화는 꺼진다').toBe(false);

  // 재진입해도 상태가 꼬이지 않는다.
  await page.locator('#syncSettingsBtn').click();
  await expect(page.locator('#syncSettingsModal')).toBeVisible();
  await expect(page.locator('#syncDirectionBox')).toBeHidden();
  await context.close();
});
