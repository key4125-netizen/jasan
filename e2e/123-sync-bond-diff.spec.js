// E2E-123 [PM 결정 2026-09-24 · D-3 = B안] 채권 정보가 다르면 사용자가 고른다.
//
// 예전: 채권 레코드는 차이 검사 대상이 아니었는데 pull에서는 병합됐다. 상대 기기가 만기 · 쿠폰 ·
//       발행인 유형 · 환헤지만 고치면 §57의 "사용자 모르게 병합하지 않는다"가 적용되지 않았다.
//       또 [클라우드 데이터 받기]는 채권에 아예 손대지 않아, 클라우드를 골라도 이 기기 채권이 남았다.
// 지금: 채권도 차이 검사에 들어가고, 고른 쪽이 그대로 적용된다.
//
// 외부 Cloud Worker는 호출하지 않는다 - page.route로 가로채고 노드 메모리의 가짜 KV만 쓴다.
// 합성 데이터만 쓴다(E123 접두어 · 공개 표준코드 형식).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const PW = 'e123-shared-password';
const ISIN = 'KR103502G990';

function makeKv() { return { store: {} }; }
async function attachCloud(context, kv) {
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      kv.store[k] = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (!kv.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kv.store[k]) });
  });
}
async function openDevice(browser, kv) {
  const context = await browser.newContext();
  await attachCloud(context, kv);
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof onSyncPasswordSaved === 'function'
    && typeof makeBondPosition === 'function' && typeof pullFromCloud === 'function');
  return { context, page };
}

const BASE_ASSET = {
  id: 'e123-as', ticker: '', owner: '신랑', accountType: '일반계좌', category: '채권',
  categorySource: 'user', name: 'E123_국고채권', isDomestic: '국내', currency: 'KRW',
  quantity: 1000, buyPrice: 10000, currentPrice: 10100, positionSource: 'manual', createdAt: 1000, updatedAt: 1000
};
const BASE_BOND = {
  id: 'e123-bond', assetId: 'e123-as',
  identity: { isin: ISIN, instrumentName: 'E123_국고채권', issuer: 'E123발행인', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
  terms: { issueDate: '2023-06-10', maturityDate: '2033-06-10', couponRate: 3.25, couponType: 'COUPON', paymentFrequency: 2 },
  holding: { owner: '신랑', account: '일반계좌', purchaseDate: '2024-03-10', faceAmount: 10000000, purchaseAmount: 9800000 },
  updatedAt: 1000
};

const seed = (page) => page.locator('body').evaluate((el, { asset, bondRaw }) => {
  localStorage.clear();
  state.transactions = [];
  state.assets = [asset];
  state.bondPositions = [makeBondPosition(bondRaw)];
  state.projection.updatedAt = 1000; state.rebalance.updatedAt = 1000;
  persistAssets(true); persistTransactions(); persistBondPositions(); persistRebalance(true); persistProjection(true);
}, { asset: BASE_ASSET, bondRaw: BASE_BOND });

const wipe = (page) => page.locator('body').evaluate(() => { localStorage.clear(); });
const disableSync = (page) => page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('syncDisableBtn').click(); });
const pull = (page) => page.locator('body').evaluate(() => pullFromCloud({ silent: true }));

// 채권 한 항목만 이 기기에서 고친다(동기화가 꺼진 상태에서 부른다).
const editBond = (page, patch) => page.locator('body').evaluate((el, p) => {
  const cur = state.bondPositions[0];
  const next = JSON.parse(JSON.stringify(cur));
  Object.keys(p).forEach((group) => Object.assign(next[group], p[group]));
  next.updatedAt = Date.now();
  state.bondPositions = [makeBondPosition(next)];
  persistBondPositions();
}, patch);

const bondSnap = (page) => page.locator('body').evaluate(() => {
  const p = (state.bondPositions || [])[0];
  return p ? {
    count: state.bondPositions.length, id: p.id,
    couponRate: p.terms.couponRate, maturityDate: p.terms.maturityDate,
    bondType: p.identity.bondType, hedgeStatus: p.identity.hedgeStatus, isin: p.identity.isin
  } : { count: 0 };
});

async function savePassword(page, pw) {
  if (await page.locator('#syncSettingsModal').isHidden()) await page.locator('#syncSettingsBtn').click();
  await page.locator('#syncPasswordInput').fill(pw);
  await page.locator('#syncPasswordSaveBtn').click();
}

// 두 기기가 같은 채권을 들고 정상 동기화된 상태.
async function pairedDevices(browser, kv) {
  const phone = await openDevice(browser, kv);
  await seed(phone.page);
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  await savePassword(pc.page, PW);
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  /* 방금 받은 내용을 pc가 3초 뒤 자동으로 되올린다(schedulePush 디바운스). 그것이 끝나기를
   * 기다린 다음에 상대 기기를 움직인다 - 아래 테스트들이 보려는 것은 "채권 차이를 어떻게
   * 다루는가"인데, 그 자동 업로드가 상대의 업로드와 겹치면 다른 문제(두 기기가 거의 동시에
   * 올릴 때의 쓰기 순서)가 섞여 들어와 결과가 흔들린다.
   * 그 경쟁 상태 자체는 e2e/122가 서버 응답 지연으로 확정적으로 고정한다 - 여기서 겸해 보지 않는다. */
  await pc.page.waitForTimeout(4500);
  return { phone, pc };
}

// phone이 동기화를 끈 채 채권을 고치고, [이 기기 데이터 올리기]로 클라우드를 자기 기준으로 만든다.
async function phoneEditsAndUploads(phone, patch) {
  await disableSync(phone.page);
  await editBond(phone.page, patch);
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();
}

/* ══════════════ 7 · 11. 차이가 있으면 멈추고 보여 준다 ══════════════ */

test('D-3-7/11. 채권만 달라도 자동으로 합치지 않고 사용자에게 보여 준다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  const before = await bondSnap(pc.page);
  expect(before.couponRate).toBe(3.25);

  await phoneEditsAndUploads(phone, { terms: { couponRate: 4.5 } });

  const res = await pull(pc.page);
  expect(res, '채권 차이를 놓치면 사용자 모르게 병합된다').toBe('held');
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();

  // 이 시점에 이 기기 채권은 한 글자도 바뀌지 않았다.
  expect(await bondSnap(pc.page)).toEqual(before);

  // 무엇이 다른지 화면에 사람이 읽는 말로 나온다.
  const bondGroup = pc.page.locator('[data-sync-diff-group="bond"]');
  await expect(bondGroup).toBeVisible();
  await expect(bondGroup).toContainText('내용이 다른 채권: 1건');
  await bondGroup.locator('summary').click();
  await expect(bondGroup).toContainText('표면이율');
  await expect(bondGroup).toContainText('E123_국고채권');

  await phone.context.close(); await pc.context.close();
});

test('D-3-5/11. 환헤지만 달라도 차이로 잡힌다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await phoneEditsAndUploads(phone, { identity: { currency: 'USD', hedgeStatus: 'HEDGED' } });

  expect(await pull(pc.page)).toBe('held');
  const bondGroup = pc.page.locator('[data-sync-diff-group="bond"]');
  await bondGroup.locator('summary').click();
  await expect(bondGroup).toContainText('환헤지');
  expect((await bondSnap(pc.page)).hedgeStatus, '고르기 전에는 바뀌지 않는다').toBeNull();

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ 9. 클라우드 선택 ══════════════ */

test('D-3-9. [클라우드 데이터 받기]를 고르면 클라우드 채권이 그대로 적용된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await phoneEditsAndUploads(phone, { terms: { couponRate: 4.5, maturityDate: '2035-06-10' }, identity: { bondType: '회사채' } });

  expect(await pull(pc.page)).toBe('held');
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  const after = await bondSnap(pc.page);
  expect(after.count, '채권이 중복되거나 사라지면 안 된다').toBe(1);
  expect(after.couponRate).toBe(4.5);
  expect(after.maturityDate).toBe('2035-06-10');
  expect(after.bondType).toBe('회사채');

  // 새로고침해도 그대로다(실제로 저장됐다).
  await pc.page.reload();
  await pc.page.waitForFunction(() => typeof state !== 'undefined');
  expect((await bondSnap(pc.page)).couponRate).toBe(4.5);

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ 8. 이 기기 선택 ══════════════ */

test('D-3-8. [이 기기 데이터 올리기]를 고르면 이 기기 채권이 유지되고 클라우드 기준이 된다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  await phoneEditsAndUploads(phone, { terms: { couponRate: 4.5 } });

  expect(await pull(pc.page)).toBe('held');
  pc.page.once('dialog', (d) => d.accept());
  await pc.page.locator('#syncDirectionPushBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  // 이 기기 채권은 그대로다.
  expect((await bondSnap(pc.page)).couponRate).toBe(3.25);

  // 클라우드도 이 기기 기준이 됐다 - 다시 받아도 더 가져올 것이 없다.
  const again = await pull(pc.page);
  expect(['up_to_date', 'applied'], `재조회 결과가 ${again}`).toContain(again);
  expect((await bondSnap(pc.page)).couponRate).toBe(3.25);

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ 12. 같으면 묻지 않는다 ══════════════ */

test('D-3-12. 채권이 같으면 확인 화면 없이 예전처럼 자동으로 끝난다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);

  // phone이 채권을 고치지 않고 그대로 다시 올린다(버전만 새로워진다).
  await disableSync(phone.page);
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const res = await pull(pc.page);
  expect(['applied', 'up_to_date'], `같은 데이터인데 ${res}`).toContain(res);
  await expect(pc.page.locator('#syncDirectionBox')).toBeHidden();
  expect((await bondSnap(pc.page)).couponRate).toBe(3.25);

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ 한쪽에만 있는 채권 ══════════════ */

test('D-3-11-b. 상대 기기가 채권을 지웠으면 그 사실을 보여 주고, 고른 뒤에만 반영한다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);

  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(() => { state.bondPositions = []; persistBondPositions(); });
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  expect(await pull(pc.page)).toBe('held');
  const bondGroup = pc.page.locator('[data-sync-diff-group="bond"]');
  await expect(bondGroup).toContainText('이 기기에만 있음: 1건');
  expect((await bondSnap(pc.page)).count, '고르기 전에는 지워지지 않는다').toBe(1);

  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();
  expect((await bondSnap(pc.page)).count, '클라우드를 골랐으면 그대로 적용된다').toBe(0);

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ 다른 데이터에 영향 없음 ══════════════ */

test('D-3-10. 채권 차이를 받아도 자산 · 목표비중 · 미래예측은 기존 동작 그대로다', async ({ browser }) => {
  const kv = makeKv();
  const { phone, pc } = await pairedDevices(browser, kv);
  const assetsBefore = await pc.page.evaluate(() => state.assets.map((a) => [a.id, a.name, a.quantity, a.buyPrice]));
  const monthlyBefore = await pc.page.evaluate(() => state.projection.monthlyContribution);

  await phoneEditsAndUploads(phone, { terms: { couponRate: 4.5 } });
  expect(await pull(pc.page)).toBe('held');
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  expect(await pc.page.evaluate(() => state.assets.map((a) => [a.id, a.name, a.quantity, a.buyPrice])))
    .toEqual(assetsBefore);
  expect(await pc.page.evaluate(() => state.projection.monthlyContribution)).toBe(monthlyBefore);
  expect((await bondSnap(pc.page)).couponRate).toBe(4.5);

  await phone.context.close(); await pc.context.close();
});

/* ══════════════ D-2 × D-3 교차 확인 ══════════════ */

// 외화 채권 - 환헤지가 자산 쪽에만 있는 상태(거래내역으로 등록한 채권의 실제 모습).
const FX_ASSET = Object.assign({}, BASE_ASSET, {
  id: 'e123-fx-as', name: 'E123_외화채권', currency: 'USD', isDomestic: '해외',
  positionSource: 'ledger', fxHedgeStatus: 'HEDGED'
});
const FX_BOND = {
  id: 'e123-fx-bond', assetId: 'e123-fx-as',
  identity: { isin: 'US0000000ZZ1', instrumentName: 'E123_외화채권', currency: 'USD', bondType: '국채' },
  terms: { maturityDate: '2032-05-15', couponRate: 4, couponType: 'COUPON', paymentFrequency: 2 },
  holding: { owner: '신랑', account: '일반계좌', purchaseDate: '2024-03-10', faceAmount: 10000000 },
  updatedAt: 1000
};

const hedgeSnap = (page) => page.locator('body').evaluate(() => {
  const p = state.bondPositions.find((x) => x.id === 'e123-fx-bond');
  const a = state.assets.find((x) => x.id === 'e123-fx-as');
  const d = resolveBondHedgeStatusDetail(p);
  return {
    bondHedge: p.identity.hedgeStatus, assetHedge: a ? a.fxHedgeStatus : null,
    status: d.status, source: d.source, bondClass: resolveBondClass(p)
  };
});

test('교차. 동기화 뒤에도 환헤지 두 값이 각각 보존되고 D-2 우선순위 결과가 같다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await phone.page.locator('body').evaluate((el, { asset, bondRaw }) => {
    localStorage.clear();
    state.transactions = []; state.assets = [asset];
    state.bondPositions = [makeBondPosition(bondRaw)];
    persistAssets(true); persistTransactions(); persistBondPositions();
  }, { asset: FX_ASSET, bondRaw: FX_BOND });
  const before = await hedgeSnap(phone.page);
  // 채권 레코드에는 환헤지가 없고 자산 쪽 값이 쓰인다(D-2 폴백).
  expect(before).toMatchObject({ bondHedge: null, assetHedge: 'HEDGED', status: 'HEDGED', source: 'asset', bondClass: 'FOREIGN_GOV_HEDGED' });

  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  await savePassword(pc.page, PW);
  await expect(pc.page.locator('#syncDirectionBox')).toBeVisible();
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  // 받은 기기에서도 두 값이 각각 그대로이고, 판정 결과 · 근거 · 자산군이 완전히 같다.
  expect(await hedgeSnap(pc.page)).toEqual(before);

  await phone.context.close(); await pc.context.close();
});

test('교차. 채권 레코드의 환헤지가 동기화로 들어오면 그 값이 자산 값보다 앞선다', async ({ browser }) => {
  const kv = makeKv();
  const phone = await openDevice(browser, kv);
  await phone.page.locator('body').evaluate((el, { asset, bondRaw }) => {
    localStorage.clear();
    state.transactions = []; state.assets = [asset];
    state.bondPositions = [makeBondPosition(bondRaw)];
    persistAssets(true); persistTransactions(); persistBondPositions();
  }, { asset: FX_ASSET, bondRaw: FX_BOND });
  await savePassword(phone.page, PW);
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  const pc = await openDevice(browser, kv);
  await wipe(pc.page);
  await savePassword(pc.page, PW);
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  // phone에서 채권 레코드에 환헤지를 직접 적고(자산 값과 반대로) 올린다.
  await disableSync(phone.page);
  await phone.page.locator('body').evaluate(() => {
    const next = JSON.parse(JSON.stringify(state.bondPositions[0]));
    next.identity.hedgeStatus = 'UNHEDGED';
    next.updatedAt = Date.now();
    state.bondPositions = [makeBondPosition(next)];
    persistBondPositions();
  });
  phone.page.once('dialog', (d) => d.accept());
  await savePassword(phone.page, PW);
  await expect(phone.page.locator('#syncDirectionBox')).toBeVisible();
  await phone.page.locator('#syncDirectionPushBtn').click();
  await expect(phone.page.locator('#syncSettingsModal')).toBeHidden();

  // 환헤지 차이는 확인 대상이다(조용히 넘어가지 않는다).
  expect(await pull(pc.page)).toBe('held');
  await pc.page.locator('#syncDirectionPullBtn').click();
  await expect(pc.page.locator('#syncSettingsModal')).toBeHidden();

  const after = await hedgeSnap(pc.page);
  expect(after.bondHedge).toBe('UNHEDGED');
  expect(after.assetHedge, '자산 쪽 값은 지워지지 않는다').toBe('HEDGED');
  expect(after.source, '채권 레코드 값이 1순위다').toBe('bondPosition');
  expect(after.bondClass).toBe('FOREIGN_GOV_UNHEDGED');

  await phone.context.close(); await pc.context.close();
});
