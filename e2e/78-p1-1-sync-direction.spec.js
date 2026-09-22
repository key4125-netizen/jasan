// E2E-78 [P1-1 데이터 보존] 동기화를 다시 켤 때 앱이 데이터 방향을 추측하지 않는다.
//
// 예전: 암호를 저장하면 곧장 pullFromCloud({fullAdopt:true})가 돌아, 동기화를 껐다 켜는 사이에
//       입력한 거래·자산이 조용히 사라졌다(클라우드의 과거 상태로 통째 교체).
// 지금: 클라우드에 데이터가 있으면 [클라우드 데이터 받기] / [이 기기 데이터 올리기]를 사용자가 고른다.
//       404(빈 슬롯)에서는 예전 그대로 업로드 확인 흐름만 보여주고 방향을 묻지 않는다.
//
// 실제 앱 함수(onSyncPasswordSaved / pullFromCloud / pushToCloud / mergeCollectionById)를 그대로
// 태운다. 외부 Cloud Worker는 절대 호출하지 않는다 - 각 테스트 안에서 page.route로 가로채고
// 노드 메모리의 가짜 KV(슬롯별)로만 주고받는다. 실제 사용자 데이터는 쓰지 않는다(전부 합성 fixture).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e78-shared-password';

// 테스트 하나마다 새로 만드는 가짜 클라우드. key(=슬롯) -> blob
function makeKv() {
  return { store: {}, failPost: false };
}

async function attachFakeCloud(context, kv, gate) {
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      if (kv.failPost || (gate && gate.blockPost)) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
      kv.store[k] = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
}

async function openDevice(browser, kv) {
  const context = await browser.newContext();
  const gate = { blockPost: false };   // 이 기기만 업로드를 막을 때 쓴다
  await attachFakeCloud(context, kv, gate);
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function'
    && typeof pushToCloud === 'function' && typeof stampPayload === 'function');
  return { context, page, gate };
}

const BASE_TX = {
  id: 'e78-tx-base', date: '2026-01-02', owner: '신랑', accountType: '일반계좌', ticker: 'AAA',
  name: 'E78_종목', type: 'buy', quantity: 100, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};
const BASE_ASSET = {
  id: 'e78-as', ticker: 'AAA', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'E78_종목', isDomestic: '국내', currency: 'KRW',
  quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};

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

function wipe(page) {
  return page.locator('body').evaluate(() => { localStorage.clear(); });
}

// 실제 UI 버튼을 통해 암호를 저장한다(핸들러 경로 그대로).
async function savePassword(page, pw) {
  // 모달이 이미 열려 있으면 헤더 버튼이 모달에 가려 클릭되지 않는다 - 닫혀 있을 때만 연다.
  if (await page.locator('#syncSettingsModal').isHidden()) await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill(pw);
  await page.locator('#syncPasswordSaveBtn').click();
}

function snap(page) {
  return page.locator('body').evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    const p = Object.values(positions).find((x) => x.ticker === 'AAA');
    const a = state.assets.find((x) => x.id === 'e78-as');
    return {
      txIds: state.transactions.map((t) => t.id).sort(),
      ledgerQty: p ? p.quantity : 0,
      assetQty: a ? a.quantity : null,
      assetPrice: a ? a.currentPrice : null,
      assetCount: state.assets.length,
      monthly: state.projection.monthlyContribution,
      positionSource: a ? a.positionSource : null,
      categorySource: a ? a.categorySource : null,
      baselineTx: JSON.parse(localStorage.getItem('sam_sync_merged_tx_ids_v1') || '[]').sort(),
      lastVersion: Number(localStorage.getItem('sam_sync_last_version_v1')) || 0,
      lastSyncedAt: localStorage.getItem('sam_sync_last_synced_at_v1'),
    };
  });
}

const addTx = (page, tx) => page.locator('body').evaluate((el, t) => {
  state.transactions.push(t); persistTransactions(); syncAssetsFromTransactions(); persistAssets();
}, tx);
const push = (page) => page.locator('body').evaluate(() => pushToCloud());
const pull = (page) => page.locator('body').evaluate(() => pullFromCloud({ silent: true }));
const disableSync = (page) => page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('syncDisableBtn').click(); });
// [v243 P1-1 차이 확인] 받은 클라우드 데이터가 이 기기와 의미 있게 다르면 자동 동기화는 합치지 않고 확인을 기다린다.
// 상대 기기가 올린 내용은 그 기기에서 차이 화면의 [클라우드 데이터 받기]를 눌러야 반영된다(예전: pull이 곧바로 병합했다).
/* [기대값 갱신 · §53-9 · v267] 손실이 생길 수 없는 차이(상대가 새로 추가 · 한쪽만 변경)는
 * 이제 확인 없이 병합된다. 이 헬퍼의 목적은 "상대가 올린 내용을 이 기기에 반영한다"이므로
 * 두 경로를 모두 받아들인다 - 확인 화면이 뜨면 [받기]를 누르고, 이미 병합됐으면 그대로 넘어간다.
 * 확인 화면이 **반드시** 떠야 하는 경우(삭제 vs 수정 · 양쪽 변경)는 e2e/89가 따로 고정한다. */
async function pullAndAccept(page) {
  const res = await pull(page);
  expect(['held', 'applied']).toContain(res);
  if (res === 'held') {
    await expect(page.locator('#syncDirectionBox')).toBeVisible();
    await page.locator('#syncDirectionPullBtn').click();
    await expect(page.locator('#syncSettingsModal')).toBeHidden();
  }
}

// 이미 정상 동기화가 끝난 두 기기(휴대폰/PC)를 만든다.
async function pairedDevices(browser, kv) {
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible(); // 빈 슬롯 -> 업로드 확인
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  await savePassword(pc.page, PW);
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();       // 슬롯 존재 -> 방향 선택
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  return { phone, pc };
}

/* ══ Pairing ══════════════════════════════════════════════════════════ */

test('T-01/T-31. 클라우드에 데이터가 있으면 방향 선택과 양쪽 건수를 보여준다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  await pc.page.locator('body').evaluate(() => { state.assets = []; state.transactions = []; });
  await savePassword(pc.page, PW);

  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(pc.page.locator('#syncDirectionPullBtn')).toBeVisible();
  await expect(pc.page.locator('#syncDirectionPushBtn')).toBeVisible();
  // 건수는 양쪽 모두 실제 값이어야 한다 - 추측하거나 비워두지 않는다.
  await expect(pc.page.locator('#syncDirectionLocalCounts')).toHaveText('이 기기: 자산 0건 · 거래 0건');
  await expect(pc.page.locator('#syncDirectionRemoteCounts')).toHaveText('클라우드: 자산 1건 · 거래 1건');
  await phone.context.close(); await pc.context.close();
});

test('T-02. [클라우드 데이터 받기]는 예전 fullAdopt와 같은 결과를 낸다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  const before = await snap(pc.page);
  expect(before.assetCount).toBeGreaterThan(0); // 새 기기에는 샘플 자산이 들어 있다
  await savePassword(pc.page, PW);
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  const after = await snap(pc.page);
  // fullAdopt는 병합이 아니라 통째 채택이다 - 샘플이 섞이지 않고 원격 1건만 남아야 한다.
  expect(after.assetCount).toBe(1);
  expect(after.txIds).toEqual(['e78-tx-base']);
  await phone.context.close(); await pc.context.close();
});

test('T-03. [이 기기 데이터 올리기]를 고르면 이 기기 내용이 클라우드 기준이 된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-phone', quantity: 10, createdAt: 2000, updatedAt: 2000 });

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  await pullAndAccept(pc.page); // [v243] 상대 기기는 자동 병합 대신 차이 확인 뒤 받기
  const pcState = await snap(pc.page);
  expect(pcState.txIds).toEqual(['e78-tx-base', 'e78-tx-phone']);
  expect(pcState.ledgerQty).toBe(110);
  await phone.context.close(); await pc.context.close();
});

test('T-04/T-05. 빈 슬롯(404)에서는 방향을 묻지 않고 기존 업로드 확인만 보여준다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await expect(phone.page.locator('#syncDirectionBox')).toBeHidden();

  // 새 비밀번호도 빈 슬롯이므로 같은 경로다(로컬 데이터는 그대로 유지된다).
  await savePassword(phone.page, PW + '-other');
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await expect(phone.page.locator('#syncDirectionBox')).toBeHidden();
  const s = await snap(phone.page);
  expect(s.txIds).toEqual(['e78-tx-base']);
  await phone.context.close();
});

/* ══ OFF 기간 ═════════════════════════════════════════════════════════ */

test('T-06~T-08. OFF 기간의 거래 추가·자산 수정·신규 자산이 [올리기]로 전부 보존된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-off', quantity: 10, createdAt: 2000, updatedAt: 2000 });
  await phone.page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.id === 'e78-as');
    a.currentPrice = 9999; a.updatedAt = Date.now();
    state.assets.push({ id: 'e78-as-new', ticker: '', owner: '신랑', accountType: '일반계좌', category: '부동산',
      name: 'E78_신규자산', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 500, currentPrice: 500,
      positionSource: 'manual', createdAt: Date.now(), updatedAt: Date.now() });
    persistAssets();
  });

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const after = await snap(phone.page);
  expect(after.txIds).toEqual(['e78-tx-base', 'e78-tx-off']);
  expect(after.ledgerQty).toBe(110);
  expect(after.assetPrice).toBe(9999);
  expect(after.assetCount).toBe(2);

  await pullAndAccept(pc.page); // [v243] 자동 병합 대신 차이 확인 뒤 받기
  const pcState = await snap(pc.page);
  expect(pcState.txIds).toEqual(['e78-tx-base', 'e78-tx-off']);
  expect(pcState.assetCount).toBe(2);
  expect(pcState.assetPrice).toBe(9999);
  await phone.context.close(); await pc.context.close();
});

test('T-09. OFF 기간에 지운 거래는 [올리기] 후 상대 기기에서도 삭제된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-del', quantity: 10, createdAt: 2000, updatedAt: 2000 });
  await push(phone.page);
  await pullAndAccept(pc.page); // [v243] 자동 병합 대신 차이 확인 뒤 받기
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base', 'e78-tx-del']);

  await disableSync(phone.page);
  phone.page.once('dialog', (d) => d.accept()); // deleteTransaction의 confirm
  await phone.page.locator('body').evaluate(() => { deleteTransaction('e78-tx-del'); });

  phone.page.once('dialog', (d) => d.accept()); // 올리기 확인
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  // [v243] 삭제도 상대 기기에서 차이(그 기기에만 있는 거래)로 보여 준 뒤 [받기]를 골라야 반영된다.
  await pullAndAccept(pc.page);
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base']);
  await phone.context.close(); await pc.context.close();
});

test('T-10/T-11. OFF 기간의 rebalance/projection 변경이 [올리기]로 상대 기기까지 수렴한다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  // 상대가 먼저 자기 설정을 바꿔 올려 둔다(= 이 기기보다 최신인 상태를 만든다).
  await pc.page.locator('body').evaluate(() => { state.projection.monthlyContribution = 222222; persistProjection(); });
  await push(pc.page);

  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(() => { state.projection.monthlyContribution = 111111; persistProjection(); });

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  await pullAndAccept(pc.page); // [v243] 설정 차이도 확인 뒤 받기 - 받기는 설정도 클라우드 값으로 맞춘다(PM 결정)
  expect((await snap(pc.page)).monthly).toBe(111111);
  expect((await snap(phone.page)).monthly).toBe(111111);
  await phone.context.close(); await pc.context.close();
});

/* ══ 충돌 ═════════════════════════════════════════════════════════════ */

test('T-12~T-14. 상대가 더 최근에 고친 레코드도 [올리기]로 수렴하고, 상대가 다시 올려도 되돌아가지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.id === 'e78-as'); a.currentPrice = 7777; a.updatedAt = Date.now(); persistAssets(true);
  });
  // 상대가 같은 자산을 "더 나중에" 고쳐 올린다.
  await pc.page.waitForTimeout(30);
  await pc.page.locator('body').evaluate(() => {
    const a = state.assets.find((x) => x.id === 'e78-as'); a.currentPrice = 8888; a.updatedAt = Date.now(); persistAssets(true);
  });
  await push(pc.page);
  await phone.page.waitForTimeout(30);

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  await pull(pc.page);
  expect((await snap(pc.page)).assetPrice).toBe(7777);
  // 상대가 그 뒤 자기 변경을 올려도 되돌아가지 않아야 한다.
  await push(pc.page);
  await pull(phone.page);
  expect((await snap(phone.page)).assetPrice).toBe(7777);
  await phone.context.close(); await pc.context.close();
});

test('T-15. 상대 기기가 아직 올리지 않은 신규 입력은 지워지지 않는다 - v243부터 자동으로 합치지 않고 차이를 보여 주며 확인을 기다린다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-phone', quantity: 10, createdAt: 2000, updatedAt: 2000 });
  // PC는 동기화가 켜져 있지만 업로드가 계속 실패하는 상태 - "아직 클라우드로 올라오지 않은 입력"이다.
  pc.gate.blockPost = true;
  await addTx(pc.page, { ...BASE_TX, id: 'e78-tx-pc-unsynced', quantity: 33, createdAt: 3000, updatedAt: 3000 });

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  // 상대 기기 사용자가 실제로 입력한 데이터다 - 지우지 않는 것이 데이터 보존 정책에 맞다.
  // [v243] 예전엔 곧바로 합쳤다. 이제는 합치지도 지우지도 않고, 각 기기에만 있는 거래를 보여 주며 사용자의 선택을 기다린다.
  expect(await pull(pc.page)).toBe('held');
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base', 'e78-tx-pc-unsynced']);
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('이 기기에만 있음: 1건');
  await expect(pc.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
  await phone.context.close(); await pc.context.close();
});

/* ══ 실패 / 취소 ══════════════════════════════════════════════════════ */

test('T-16/T-17. 업로드 실패 시 로컬·클라우드·metadata가 모두 그대로이고, 재시도하면 반영된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-fail', quantity: 10, createdAt: 2000, updatedAt: 2000 });
  const before = await snap(phone.page);

  kv.failPost = true;
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible(); // 실패하면 선택 화면을 닫지 않는다

  const after = await snap(phone.page);
  expect(after.txIds).toEqual(before.txIds);
  expect(after.assetQty).toBe(before.assetQty);
  expect(after.assetPrice).toBe(before.assetPrice);
  expect(after.monthly).toBe(before.monthly);
  expect(after.baselineTx).toEqual(before.baselineTx);
  expect(after.lastSyncedAt).toBe(before.lastSyncedAt);

  await pull(pc.page);
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base']); // 클라우드도 그대로

  kv.failPost = false;
  phone.page.once('dialog', (d) => d.accept());
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();
  await pullAndAccept(pc.page); // [v243] 자동 병합 대신 차이 확인 뒤 받기
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base', 'e78-tx-fail']);
  await phone.context.close(); await pc.context.close();
});

test('T-18. 확인창에서 취소하면 아무 일도 일어나지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-cancel', quantity: 10, createdAt: 2000, updatedAt: 2000 });

  phone.page.once('dialog', (d) => d.dismiss());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();   // 선택 화면 그대로
  await expect(phone.page.locator('#syncSettingsModal')).toBeVisible();

  await pull(pc.page);
  expect((await snap(pc.page)).txIds).toEqual(['e78-tx-base']);          // 클라우드 무변경
  await phone.context.close(); await pc.context.close();
});

/* ══ 데이터 범위 ══════════════════════════════════════════════════════ */

test('T-19~T-25. 자산/거래/설정은 반영되고, 합집합 3종은 예전 구조 그대로다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await pc.page.locator('body').evaluate(() => {
    state.tickerRoles = { PCONLY: 'core' }; persistTickerRoles();
    state.learnedTickerNames = { PCONLY: 'PC가 배운 이름' }; persistLearnedTickerNames();
    state.dailySnapshots = { '2026-01-01': { pcOnly: true } }; persistDailySnapshots();
  });
  await push(pc.page);

  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(() => {
    state.tickerRoles = { PHONEONLY: 'core' }; persistTickerRoles();
    state.learnedTickerNames = { PHONEONLY: '휴대폰이 배운 이름' }; persistLearnedTickerNames();
    state.dailySnapshots = { '2026-02-02': { phoneOnly: true } }; persistDailySnapshots();
    state.rebalance.targets = { PHONE: 1 }; persistRebalance();
    state.projection.monthlyContribution = 333333; persistProjection();
  });

  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  await pullAndAccept(pc.page); // [v243] 자동 병합 대신 차이 확인 뒤 받기(합집합 3종은 받기에서도 합쳐진다)
  const merged = await pc.page.locator('body').evaluate(() => ({
    monthly: state.projection.monthlyContribution,
    roleKeys: Object.keys(state.tickerRoles).sort(),
    nameKeys: Object.keys(state.learnedTickerNames).sort(),
    snapKeys: Object.keys(state.dailySnapshots).sort(),
    positionSource: state.assets.find((a) => a.id === 'e78-as').positionSource,
    categorySource: state.assets.find((a) => a.id === 'e78-as').categorySource,
  }));
  expect(merged.monthly).toBe(333333);                                   // projection 반영
  expect(merged.roleKeys).toEqual(['PCONLY', 'PHONEONLY']);              // 합집합 유지
  expect(merged.nameKeys).toEqual(['PCONLY', 'PHONEONLY']);              // 합집합 유지
  expect(merged.snapKeys).toContain('2026-01-01');                       // 상대 기기 날짜 보존
  expect(merged.snapKeys).toContain('2026-02-02');                       // 이 기기 날짜 보존(합집합)
  expect(merged.positionSource).toBe('ledger');                          // 보존 필드 무변경
  expect(merged.categorySource).toBe('user');
  await phone.context.close(); await pc.context.close();
});

/* ══ 기존 경로 회귀 ═══════════════════════════════════════════════════ */

test('T-26. JSON 복원 뒤 동기화를 다시 켜도 방향을 직접 고를 수 있다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(async () => {
    await applyRemoteState({
      app: 'smart-asset-manager', exportedAt: new Date().toISOString(),
      exchangeRate: state.exchangeRate, dailyChangeRate: state.dailyChangeRate,
      rebalance: state.rebalance, projection: state.projection,
      assets: state.assets, transactions: state.transactions,
      dailySnapshots: {}, learnedTickerNames: {}, tickerRoles: {}
    });
  });
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.context.close(); await pc.context.close();
});

test('T-27. 옵션 없는 pushToCloud - 받은 클라우드 데이터와 내용 차이가 없으면 예전처럼 선병합 후 올리고, 차이가 있으면(v243) 병합 · 업로드 없이 확인을 기다린다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  // 내용 차이 없음(상대가 시세만 바꿔 올림) - 예전 선병합 경로 그대로 올라간다.
  await pc.page.locator('body').evaluate(() => { const a = state.assets.find((x) => x.id === 'e78-as'); a.currentPrice = 4321; persistAssets(true); });
  await push(pc.page);
  expect(await push(phone.page)).toBeUndefined();
  expect(await pull(pc.page)).toBe('applied');

  // 양쪽이 각자 다른 거래를 추가 - 상대 거래가 올라온 뒤의 옵션 없는 push는 합치지도 덮어쓰지도 않고 멈춘다.
  await addTx(pc.page, { ...BASE_TX, id: 'e78-tx-pc', quantity: 20, createdAt: 3000, updatedAt: 3000 });
  await push(pc.page);
  await addTx(phone.page, { ...BASE_TX, id: 'e78-tx-phone', quantity: 10, createdAt: 4000, updatedAt: 4000 });

  expect(await push(phone.page)).toBe('held');
  const after = await snap(phone.page);
  expect(after.txIds).toEqual(['e78-tx-base', 'e78-tx-phone']);   // 이 기기 데이터 그대로
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await expect(phone.page.locator('#syncDiffSummary')).toContainText('이 기기에만 있음: 1건');
  await expect(phone.page.locator('#syncDiffSummary')).toContainText('클라우드에만 있음: 1건');
  const cloud = await phone.page.locator('body').evaluate(async (el, { b, pw }) => (await decryptSyncBlob(b, pw)).transactions.map((t) => t.id).sort(), { b: Object.values(kv.store)[0], pw: PW });
  expect(cloud).toEqual(['e78-tx-base', 'e78-tx-pc']);             // 클라우드도 PC가 올린 그대로(휴대폰이 덮지 않았다)
  await phone.context.close(); await pc.context.close();
});

/* ══ UX ═══════════════════════════════════════════════════════════════ */

for (const scheme of ['light', 'dark']) {
  test(`T-28~T-33. 375px ${scheme}에서 방향 선택이 44px·14px을 지키고 잘리지 않는다`, async ({ browser }) => {
    const kv = makeKv();
    const phone = await openDevice(browser, kv);
    await seed(phone.page);
    await savePassword(phone.page, PW);
    await phone.page.locator('#syncUploadConfirmBtn').click();

    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    await attachFakeCloud(context, kv);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function');
    await page.locator('body').evaluate((el, dark) => {
      localStorage.clear();
      el.ownerDocument.documentElement.classList.toggle('dark', dark);
    }, scheme === 'dark');
    await savePassword(page, PW);
    await expect(page.locator('#syncDirectionBox')).toBeVisible();

    const ux = await page.locator('#syncDirectionBox').evaluate((box) => {
      const win = box.ownerDocument.defaultView;
      const texts = Array.prototype.slice.call(box.querySelectorAll('*'))
        .filter((e) => e.children.length === 0 && e.textContent.trim());
      return {
        pullH: Math.round(box.querySelector('#syncDirectionPullBtn').getBoundingClientRect().height),
        pushH: Math.round(box.querySelector('#syncDirectionPushBtn').getBoundingClientRect().height),
        minFont: Math.min.apply(null, texts.map((e) => parseFloat(win.getComputedStyle(e).fontSize))),
        clipped: texts.some((e) => e.scrollWidth > e.clientWidth + 1),
        boxOverflow: box.scrollWidth > box.clientWidth + 1,
      };
    });
    expect(ux.pullH).toBeGreaterThanOrEqual(44);
    expect(ux.pushH).toBeGreaterThanOrEqual(44);
    expect(ux.minFont).toBeGreaterThanOrEqual(14);
    expect(ux.clipped).toBe(false);
    expect(ux.boxOverflow).toBe(false);
    // 방향이 헷갈리지 않도록 두 버튼의 문구가 서로 반대임을 고정한다.
    await expect(page.locator('#syncDirectionPullBtn')).toHaveText('클라우드 데이터 받기');
    await expect(page.locator('#syncDirectionPushBtn')).toHaveText('이 기기 데이터 올리기');
    // 가로 스크롤이 생기지 않아야 한다.
    const pageOverflow = await page.locator('body').evaluate((el) => el.ownerDocument.documentElement.scrollWidth > el.ownerDocument.documentElement.clientWidth);
    expect(pageOverflow).toBe(false);

    await context.close(); await phone.context.close();
  });
}
