// E2E-84 [기기 데이터 초기화 - 명칭 구분] "데이터 초기화"만으로는 클라우드 데이터까지 지우는지 알 수 없어,
// 사용자 노출 명칭을 "기기 데이터 초기화"로 바꾸고 확인창·토스트에 클라우드 데이터는 삭제하지 않는다고 적었다.
// 명칭만 바뀌고 실제 삭제 범위(이 기기의 sam_ 키, 다크모드·첫 실행 표시 제외)와 Cloud 무변경은 그대로인지 함께 고정한다.
// "클라우드 데이터 초기화"는 아직 기능이 없어 이 파일에서 다루지 않는다(체크리스트 §26-7).
// 전부 합성 데이터다. Cloud Worker는 route로 가로챈 가짜 KV만 쓴다.
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof pushToCloud === 'function' && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(500);
}

test('D1. 시스템관리 화면에 "기기 데이터 초기화"와 범위 설명이 보이고, 헤더 버튼 안내도 같은 명칭이다', async ({ page }) => {
  await open(page);
  await page.locator('#systemManagementBtn').click();
  const btn = page.locator('#resetDataBtn');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('기기 데이터 초기화');
  await expect(btn).toContainText('이 기기에 저장된 앱 데이터만 지웁니다');
  await expect(btn).toContainText('클라우드 데이터는 삭제하지 않습니다');
  expect(await page.locator('#systemManagementBtn').getAttribute('title')).toContain('기기 데이터 초기화');
});

test('D2. 앞에 "기기"나 "클라우드"가 없는 모호한 "데이터 초기화" 사용자 문구가 화면·안내 속성에 남아 있지 않다', async ({ page }) => {
  await open(page);
  const found = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    const texts = [];
    const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const tag = n.parentElement ? n.parentElement.tagName : '';
      if (tag !== 'SCRIPT' && tag !== 'STYLE') texts.push(n.nodeValue);
    }
    doc.querySelectorAll('[title],[aria-label],[placeholder]').forEach((e) => {
      ['title', 'aria-label', 'placeholder'].forEach((a) => { if (e.hasAttribute(a)) texts.push(e.getAttribute(a)); });
    });
    return texts
      .map((t) => t.replace(/기기 데이터 초기화|클라우드 데이터 초기화/g, ''))
      .filter((t) => t.includes('데이터 초기화'));
  });
  expect(found).toEqual([]);
});

test('D3. 확인창은 이 기기 데이터만 지우고 클라우드 데이터는 삭제하지 않는다고 적으며, 취소하면 아무것도 바뀌지 않는다', async ({ page }) => {
  await open(page);
  const before = await page.locator('body').evaluate(() => ({ assets: state.assets.length, keys: Object.keys(localStorage).sort() }));
  let message = '';
  page.once('dialog', async (dialog) => { message = dialog.message(); await dialog.dismiss(); });
  await page.locator('#systemManagementBtn').click();
  await page.locator('#resetDataBtn').click();
  await expect.poll(() => message).not.toBe('');
  const after = await page.locator('body').evaluate(() => ({ assets: state.assets.length, keys: Object.keys(localStorage).sort() }));
  expect(message).toContain('기기 데이터 초기화');
  expect(message).toContain('이 기기에 저장된 이 앱의 데이터를 모두 삭제합니다');
  expect(message).toContain('클라우드에 저장된 데이터는 삭제되지 않습니다');
  expect(message).toContain('화면 테마(다크모드) 설정만 유지됩니다');
  expect(message).not.toMatch(/클라우드[^\n]*(삭제합니다|초기화합니다|지웁니다)/);
  expect(after, '취소하면 state·localStorage 무변경').toEqual(before);
});

test('D4. 명칭이 바뀌어도 삭제 범위는 그대로이고, 클라우드에는 아무것도 올리거나 지우지 않는다', async ({ page, context }) => {
  const kv = { store: {}, posts: 0 };
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') { kv.store[k] = req.postData(); kv.posts++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: kv.store[k] });
  });
  await open(page);
  await page.locator('body').evaluate(async () => {
    localStorage.setItem('sam_dark_mode_v5', '1');
    state.assets = [{ id: 'e84-a', ticker: '', owner: '신랑', accountType: '일반계좌', category: '채권', categorySource: 'user', name: 'E84_채권', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, positionSource: 'manual', createdAt: 1, updatedAt: 1 }];
    state.transactions = [{ id: 'e84-t', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: 'E84_채권', type: 'buy', quantity: 1, price: 1000000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    persistAssets(true); persistTransactions();
    localStorage.setItem('sam_sync_password_v1', 'e84-pw');
    localStorage.setItem('sam_sync_enabled_v1', '1');
    loadSyncState();
    renderAll();
    await pushToCloud();
  });
  await page.waitForTimeout(4000);
  const cloudBefore = JSON.stringify(kv.store);
  const postsBefore = kv.posts;
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#systemManagementBtn').click();
  await page.locator('#resetDataBtn').click();
  await expect(page.locator('#toastContainer')).toContainText('이 기기의 데이터를 초기화했습니다');
  await expect(page.locator('#toastContainer')).toContainText('클라우드 데이터는 삭제하지 않았습니다');
  await page.waitForTimeout(4000);
  const after = await page.locator('body').evaluate(() => ({
    assets: state.assets.length, tx: state.transactions.length, snaps: Object.keys(state.dailySnapshots).length, syncEnabled: syncState.enabled,
    keys: Object.keys(localStorage).sort()
  }));
  expect(after.assets).toBe(0);
  expect(after.tx).toBe(0);
  expect(after.snaps).toBe(0);
  expect(after.syncEnabled).toBe(false);
  // 초기화 코드는 sam_ 키를 다크모드·첫 실행 표시만 남기고 지운 뒤, 비운 기본값만 다시 저장한다(범위 무변경)
  expect(after.keys).toEqual(['sam_assets_v5', 'sam_daily_rate_v5', 'sam_daily_snapshot_v1', 'sam_dark_mode_v5', 'sam_exchange_rate_v5',
    'sam_has_launched_v1', 'sam_projection_v1', 'sam_rebalance_v1', 'sam_transactions_v1']);
  expect(kv.posts - postsBefore, '기기 데이터 초기화는 클라우드에 올리지 않는다').toBe(0);
  expect(JSON.stringify(kv.store), '클라우드 데이터 무변경').toBe(cloudBefore);
});
