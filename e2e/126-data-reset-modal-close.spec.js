// E2E-126 [PM 결정 2026-09-26 · D-8 · A안] 「데이터 관리」 팝업 - 초기화 완료 후에만 닫는다.
//
//  A. 기기 데이터 초기화     - 취소하면 팝업 유지 · 성공하면 닫힘
//  B. 클라우드 데이터 초기화 - 데이터 관리 화면에서 실행해도 성공 시 닫힘(§57은 동기화 설정만 닫았다)
//  C. 동기화 설정 화면의 기존 동작(§57) 회귀
//  D. 실패 · 취소 · 미연결에서는 팝업을 닫지 않는다
//  E. 범위 밖(최초등록 · 엑셀 업로드 · JSON 불러오기 · 자동 백업 토글 · 엑셀 내보내기)은 그대로 유지한다
//
// 외부 Cloud Worker는 호출하지 않는다 - e2e/119와 같은 방식으로 context.route로 가로챈 메모리 KV만 쓴다
// (page.route는 이 앱의 Service Worker를 거치는 요청을 잡지 못한다 - 실측).
// 전부 합성 데이터(ZZ 접두어)이며 실제 사용자 데이터를 쓰지 않는다.
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e126-synthetic-password';

const ASSET = {
  id: 'zz-126-1', ticker: 'ZZ0126.KS', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'ZZ합성주식126', isDomestic: '국내', currency: 'KRW',
  quantity: 10, buyPrice: 1000, currentPrice: 1100, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};

/* 가짜 클라우드를 물린 기기 하나. gate.postFail을 켜면 업로드가 실패한다(실제 실패 경로를 탄다). */
async function openDevice(browser, kv) {
  const context = await browser.newContext();
  const gate = { postFail: false };
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      if (gate.postFail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      kv.store[k] = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof resetCloudData === 'function' && typeof closeSystemManagementModal === 'function');
  await page.evaluate((asset) => {
    localStorage.clear();
    state.assets = [asset];
    persistAssets(true);
    renderAll();
  }, ASSET);
  return { context, page, gate };
}

// 클라우드에 "지울 것이 있는" 상태를 만든다(version 0이면 already_empty로 끝나 초기화 경로를 못 탄다).
async function seedCloud(page) {
  await page.evaluate(async (pw) => {
    syncState.password = pw; syncState.enabled = true;
    localStorage.setItem('sam_sync_password', pw);
    localStorage.setItem('sam_sync_enabled', '1');
    await pushToCloud({ silent: true });
  }, PW);
  await page.waitForTimeout(600);
}

/* ══════════════ A. 기기 데이터 초기화 ══════════════ */

test('D8-A1. 확인창을 취소하면 팝업이 그대로 있고 데이터도 남는다', async ({ browser }) => {
  const { context, page } = await openDevice(browser, { store: {} });
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await expect(modal).toBeVisible();
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(300);
  await expect(modal, '취소하면 팝업을 그대로 둔다(바로 다시 시도할 수 있다)').toBeVisible();
  expect(await page.evaluate(() => state.assets.length), '데이터도 그대로다').toBe(1);
  await context.close();
});

test('D8-A2. 초기화가 끝나면 완료 토스트가 뜨고 데이터 관리 팝업이 닫힌다', async ({ browser }) => {
  const { context, page } = await openDevice(browser, { store: {} });
  page.once('dialog', (d) => d.accept());
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await expect(modal).toBeVisible();
  await page.locator('#resetDataBtn').click();
  await expect(page.getByText('이 기기의 데이터를 초기화했습니다.', { exact: false })).toBeVisible();
  await expect(modal, '되돌릴 수 없는 작업이 끝났으므로 팝업이 닫힌다').toBeHidden();
  expect(await page.evaluate(() => state.assets.length)).toBe(0);
  await context.close();
});

test('D8-A3. 팝업이 닫힌 뒤 뒤로가기가 방금 닫은 팝업을 되살리지 않는다', async ({ browser }) => {
  const { context, page } = await openDevice(browser, { store: {} });
  page.once('dialog', (d) => d.accept());
  await page.locator('#systemManagementBtn').click();
  await page.locator('#resetDataBtn').click();
  await expect(page.locator('#systemManagementModal')).toBeHidden();
  // 팝업이 스스로 닫을 때 자기 히스토리 기록을 소비했다 - 그래서 여기서 뒤로가기를 눌러도 되살아나지 않는다.
  await page.goBack();
  await page.waitForTimeout(500);
  await expect(page.locator('#systemManagementModal')).toBeHidden();
  expect(await page.evaluate(() => typeof state !== 'undefined'), '앱을 벗어나지 않았다').toBe(true);
  await context.close();
});

/* ══════════════ B. 클라우드 데이터 초기화 - 데이터 관리 화면 ══════════════ */

test('D8-B1. 데이터 관리 화면에서 실행해 성공하면 데이터 관리 팝업이 닫힌다', async ({ browser }) => {
  const kv = { store: {} };
  const { context, page } = await openDevice(browser, kv);
  await seedCloud(page);
  page.on('dialog', (d) => d.accept()); // 1차 · 2차 확인
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await expect(modal).toBeVisible();
  await page.locator('#resetCloudDataBtn').click();
  await expect(page.getByText('클라우드 데이터를 초기화했습니다.', { exact: false })).toBeVisible();
  await expect(modal, '실행한 화면의 팝업이 닫힌다').toBeHidden();
  expect(await page.evaluate(() => state.assets.length), '이 기기 데이터는 삭제되지 않는다').toBe(1);
  await context.close();
});

test('D8-B2. 2차 확인을 취소하면 팝업이 그대로 있다', async ({ browser }) => {
  const kv = { store: {} };
  const { context, page } = await openDevice(browser, kv);
  await seedCloud(page);
  let seen = 0;
  page.on('dialog', (d) => { seen += 1; return seen === 1 ? d.accept() : d.dismiss(); });
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await page.locator('#resetCloudDataBtn').click();
  await expect(page.getByText('클라우드 데이터 초기화를 취소했습니다.', { exact: false })).toBeVisible();
  await expect(modal, '취소하면 팝업을 그대로 둔다').toBeVisible();
  await context.close();
});

test('D8-B3. 업로드가 실패하면 팝업을 닫지 않는다', async ({ browser }) => {
  const kv = { store: {} };
  const { context, page, gate } = await openDevice(browser, kv);
  await seedCloud(page);
  gate.postFail = true; // 여기서부터 업로드가 실패한다
  page.on('dialog', (d) => d.accept());
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await page.locator('#resetCloudDataBtn').click();
  await expect(page.getByText('클라우드 데이터를 초기화하지 못했습니다.', { exact: false })).toBeVisible();
  await expect(modal, '실패하면 팝업을 그대로 두어 다시 시도할 수 있게 한다').toBeVisible();
  expect(await page.evaluate(() => state.assets.length), '이 기기 데이터는 그대로다').toBe(1);
  await context.close();
});

test('D8-B4. 동기화 암호가 없으면(미연결) 팝업을 닫지 않는다', async ({ browser }) => {
  const { context, page } = await openDevice(browser, { store: {} });
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');
  await page.locator('#resetCloudDataBtn').click();
  await expect(page.getByText('이 기기에 연결된 동기화 암호가 없습니다.', { exact: false })).toBeVisible();
  await expect(modal, '아무것도 하지 않았으므로 팝업을 그대로 둔다').toBeVisible();
  await context.close();
});

/* ══════════════ C. §57 회귀 - 동기화 설정 화면 ══════════════ */

test('D8-C1. 동기화 설정 화면의 기존 동작이 그대로다(§57 회귀)', async ({ browser }) => {
  const kv = { store: {} };
  const { context, page } = await openDevice(browser, kv);
  await seedCloud(page);
  page.on('dialog', (d) => d.accept());
  await page.locator('#syncSettingsBtn').click();
  const syncModal = page.locator('#syncSettingsModal');
  await expect(syncModal).toBeVisible();
  await page.locator('#resetCloudDataSyncBtn').click();
  await expect(page.getByText('클라우드 데이터를 초기화했습니다.', { exact: false })).toBeVisible();
  await expect(syncModal, '§57 그대로 - 동기화 설정 팝업이 닫힌다').toBeHidden();
  // 열려 있지 않던 데이터 관리 팝업을 대신 닫지 않는다(히스토리 기록을 가로채지 않는다).
  await expect(page.locator('#systemManagementModal')).toBeHidden();
  await context.close();
});

/* ══════════════ E. 범위 밖 - 바꾸지 않은 버튼 ══════════════ */

test('D8-E1. 최초등록 · 자동 백업 토글 · 파일 선택 버튼은 팝업을 유지한다', async ({ browser }) => {
  const { context, page } = await openDevice(browser, { store: {} });
  await page.locator('#systemManagementBtn').click();
  const modal = page.locator('#systemManagementModal');

  // 최초등록 - 자산 팝업이 위에 겹쳐 뜨므로 아래 팝업이 남아 있는 것이 정상이다.
  await page.locator('#addAssetBtn').click();
  await expect(page.locator('#assetModal')).toBeVisible();
  await expect(modal, '후속 팝업이 덮으므로 유지한다').toBeVisible();
  await page.locator('#closeModalBtn').click();
  await expect(modal).toBeVisible();

  // JSON 자동 백업 토글 - 글자만 바뀌므로 닫히면 안 된다.
  const before = (await page.locator('#autoBackupToggleBtn').textContent()).trim();
  await page.locator('#autoBackupToggleBtn').click();
  await page.waitForTimeout(250);
  const after = (await page.locator('#autoBackupToggleBtn').textContent()).trim();
  expect(after, '토글은 표시가 바뀐다').not.toBe(before);
  await expect(modal, '토글은 팝업을 닫지 않는다').toBeVisible();
  await page.locator('#autoBackupToggleBtn').click(); // 원상 복구
  await page.waitForTimeout(250);
  await expect(modal).toBeVisible();

  // 파일 선택 버튼(엑셀 업로드 · JSON 불러오기)과 엑셀 내보내기는 이번 범위가 아니다 - 그대로 있어야 한다.
  for (const id of ['exportExcelBtn', 'importExcelBtn', 'importJsonBtn']) {
    await expect(page.locator('#' + id), id).toBeVisible();
  }
  await expect(modal).toBeVisible();
  await context.close();
});
