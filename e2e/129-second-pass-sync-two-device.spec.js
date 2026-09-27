// E2E-129 [PM 지시 2026-09-26 · 2차 전수 테스트 F] 두 기기 동기화 왕복.
//
//  ① Device A · Device B 두 기기를 같은 암호로 연결한다.
//  ② local == cloud - 아무것도 묻지 않는다.
//  ③ local != cloud - 앱이 고르지 않고 사용자에게 묻는다(보류 'held').
//  ④ [클라우드 데이터 받기] - 클라우드 기준이 된다.
//  ⑤ [이 기기 데이터 올리기] - 이 기기 기준으로 클라우드가 바뀌고 상대도 그 값을 받는다.
//  ⑥ [취소] - 두 곳 모두 그대로다.
//  ⑦ Asset · Bond · Return Key 변경이 각각의 차이로 잡힌다(D-3).
//
// 상대 기기가 바꾼 것을 이 기기가 발견하는 경로만 확인 화면을 띄운다 - 내 기기에서 내가 바꾼 것은
// 내 뜻이므로 그대로 올라간다. 그래서 아래 시나리오는 모두 "A가 바꿔 올린다 → B가 발견한다" 순서다.
//
// **실제 Cloudflare Worker는 호출하지 않는다.** e2e/119 · 122 · 123과 같은 방식으로 context.route로
// 가로챈 메모리 KV만 쓴다 - 합성 데이터조차 사용자의 실제 클라우드에 올리지 않기 위한 의도적 선택이다.
// 전부 합성 데이터(ZZ 접두어)다.
const { test, expect } = require('@playwright/test');

/* 이 파일의 시나리오 하나는 두 기기를 번갈아 조작하며 앱의 3초 자동 업로드를 여러 번 기다린다 -
 * 기본 30초로는 모자라서 대기 자체가 제한시간에 걸린다(실측). 기다림이 길 뿐 단정은 그대로다. */
test.describe.configure({ timeout: 120000 });

const WORKER = /steep-haze-01f0/;
const PW = 'e129-two-device-synthetic';

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
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof compareSyncData === 'function'
    && typeof pushToCloud === 'function' && typeof pullFromCloud === 'function');
  await page.evaluate(() => { localStorage.clear(); });
  return { context, page, gate };
}

const ASSET = {
  id: 'zz-129-a', ticker: 'ZZ0129.KS', owner: '신랑', accountType: '일반계좌', category: '주식',
  categorySource: 'user', name: 'ZZ합성주식129', isDomestic: '국내', currency: 'KRW',
  quantity: 100, buyPrice: 1000, currentPrice: 1200, positionSource: 'ledger', createdAt: 1000, updatedAt: 1000
};
const TX = {
  id: 'zz-129-tx', date: '2026-09-01', owner: '신랑', accountType: '일반계좌', ticker: 'ZZ0129.KS',
  name: 'ZZ합성주식129', type: 'buy', quantity: 100, price: 1000, currency: 'KRW', fee: 0,
  origin: 'period', createdAt: 1000, updatedAt: 1000
};
const BOND_ASSET = {
  id: 'zz-129-b', ticker: 'KR1035021DC0', owner: '와이프', accountType: '연금저축', category: '채권',
  categorySource: 'user', name: 'ZZ합성채권129', isDomestic: '국내', currency: 'KRW',
  quantity: 200, buyPrice: 10000, currentPrice: 10100, positionSource: 'manual', createdAt: 1000, updatedAt: 1000
};

const seed = (page) => page.evaluate(({ asset, tx, bondAsset }) => {
  state.assets = [asset, bondAsset];
  state.transactions = [tx];
  state.bondPositions = [makeBondPosition({
    assetId: bondAsset.id,
    identity: { isin: 'KR1035021DC0', bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2029-12-01', couponRate: 3.5, paymentFrequency: 2 }
  })];
  state.projection.monthlyContribution = 100000; state.projection.updatedAt = 1000;
  state.rebalance.updatedAt = 1000;
  persistAssets(true); persistTransactions(); persistBondPositions();
  persistRebalance(true); persistProjection(true);
}, { asset: ASSET, tx: TX, bondAsset: BOND_ASSET });

const connect = (page) => page.evaluate((pw) => {
  syncState.password = pw; syncState.enabled = true;
  localStorage.setItem('sam_sync_password', pw);
  localStorage.setItem('sam_sync_enabled', '1');
}, PW);

const pull = (page) => page.evaluate(() => pullFromCloud({ silent: true }));

/* [2026-09-27] 앱은 로컬 변경 3초 뒤에 스스로 업로드한다(js/12 schedulePush 트레일링 디바운스).
 * 이 테스트는 두 기기를 사람보다 훨씬 빠르게 번갈아 조작하므로, 그 자동 업로드가 다음 단계 한가운데로
 * 끼어들어 실행할 때마다 순서가 달라진다(전체 실행에서 실측). 그래서 각 단계 뒤에 디바운스가 끝날
 * 시간을 준다 - 실제 사용자의 조작 간격에 가깝게 만드는 것이지, 기대값을 바꾸는 것이 아니다.
 * (e2e/123이 같은 이유로 같은 방식을 쓴다.) */
const SETTLE_MS = 4000; // 디바운스 3000 + 업로드 왕복 여유
const settle = (page) => page.waitForTimeout(SETTLE_MS);
const push = async (page) => { await page.evaluate(() => pushToCloud({ silent: true })); await settle(page); };

/* 확인 화면이 떠 있을 때 앱이 들고 있는 그 데이터로 차이를 계산한다(화면이 쓰는 것과 같은 경로). */
const heldDiff = (page) => page.evaluate(() => {
  if (!syncDiffHold) return { held: false };
  const d = compareSyncData(syncLocalDataForCompare(), syncDiffHold.remote);
  const size = (g) => (g ? g.localOnly.length + g.cloudOnly.length + g.different.length : 0);
  return {
    held: true,
    hasDiff: d.hasMeaningfulDifference,
    assets: size(d.assets),
    transactions: size(d.transactions),
    bondPositions: size(d.bondPositions),
    rebalance: !!d.rebalance.changed,
    projection: !!d.projection.changed,
    signature: syncDiffSignature(d)
  };
});

// 확인 화면에서 실제 버튼을 누른다. which: 'pull' | 'push' | 'cancel'
async function choose(page, which) {
  const id = which === 'pull' ? '#syncDirectionPullBtn' : which === 'push' ? '#syncDirectionPushBtn' : '#syncDirectionCancelBtn';
  await expect(page.locator('#syncDirectionBox')).toBeVisible();
  await page.locator(id).click();
  await expect(page.locator('#syncSettingsModal')).toBeHidden();
  // 고른 결과가 저장되면서 예약되는 자동 업로드까지 끝낸다.
  await page.waitForTimeout(SETTLE_MS);
}

const counts = (page) => page.evaluate(() => ({
  assets: state.assets.length,
  tx: state.transactions.length,
  bonds: (state.bondPositions || []).length,
  coupon: ((state.bondPositions || [])[0] || { terms: {} }).terms.couponRate,
  qty: (state.assets.find((a) => a.id === 'zz-129-a') || {}).quantity,
  override: (state.assets.find((a) => a.id === 'zz-129-a') || {}).rateMatchOverride || null
}));

/* A를 세우고 올린 뒤, B를 세워 받아 두 기기를 같은 상태로 맞춘다. */
async function pairedDevices(browser, kv) {
  const A = await openDevice(browser, kv);
  await seed(A.page);
  await connect(A.page);
  await push(A.page);

  const B = await openDevice(browser, kv);
  await connect(B.page);
  expect(await pull(B.page), 'B는 비어 있으므로 차이가 있고, 앱이 고르지 않고 묻는다').toBe('held');
  await choose(B.page, 'pull');   // choose가 자동 업로드까지 기다린다
  /* B가 받아들이면서 자기 상태를 한 번 더 올린다(앱의 자동 업로드). 그 결과 클라우드 버전이 올라가는데,
   * A가 그 사실을 모르면 A의 다음 업로드는 **업로드 대신 사용자 확인을 기다린다**(e2e/78 T-27의 정상
   * 동작 - "받은 클라우드 데이터와 차이가 있으면 병합 · 업로드 없이 확인을 기다린다").
   * 실제 사용자는 두 기기가 정합된 상태에서 다음 조작을 하므로, 여기서 A도 한 번 맞춰 둔다. */
  await pull(A.page);
  await settle(A.page);
  return { A, B };
}

/* ══════════════ ①② 최초 왕복 후 두 곳이 같다 ══════════════ */

test('F-1. A가 올리고 B가 받으면 두 기기가 같아지고, 그 뒤에는 묻지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  const a = await counts(A.page);
  const b = await counts(B.page);
  expect(b.assets, 'B가 자산 2건을 받았다').toBe(a.assets);
  expect(b.tx, 'B가 거래 1건을 받았다').toBe(a.tx);
  expect(b.bonds, 'B가 채권 레코드 1건을 받았다').toBe(a.bonds);
  expect(b.coupon, '채권 쿠폰까지 같다').toBe(a.coupon);
  expect(b.qty).toBe(a.qty);

  // 두 곳이 같으므로 다시 돌려도 확인 화면이 뜨지 않는다.
  const again = await pull(B.page);
  expect(String(again), '같으면 보류하지 않는다').not.toBe('held');
  await expect(B.page.locator('#syncDirectionBox')).toBeHidden();
  await A.context.close(); await B.context.close();
});

/* ══════════════ ③⑦ 상대 기기의 변경이 종류별로 잡힌다 ══════════════ */

test('F-2. A가 자산 수량을 바꿔 올리면 B에서 자산 차이로 잡힌다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 150; a.updatedAt = Date.now();
    persistAssets(true);
  });
  await push(A.page);

  expect(await pull(B.page), '차이가 있으면 보류한다').toBe('held');
  const d = await heldDiff(B.page);
  expect(d.hasDiff).toBe(true);
  expect(d.assets, '자산 차이로 분류된다').toBe(1);
  expect(d.bondPositions, '채권은 건드리지 않았으므로 채권 차이는 없다').toBe(0);
  await A.context.close(); await B.context.close();
});

test('F-3. A가 채권 쿠폰을 바꿔 올리면 B에서 채권 차이로 잡힌다(D-3)', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  await A.page.evaluate(() => {
    state.bondPositions[0].terms.couponRate = 4.25;
    state.bondPositions[0].updatedAt = Date.now();
    persistBondPositions();
  });
  await push(A.page);

  expect(await pull(B.page), '채권만 달라도 보류한다(D-3)').toBe('held');
  const d = await heldDiff(B.page);
  expect(d.hasDiff, '채권만 달라도 사용자가 고르게 된다').toBe(true);
  expect(d.bondPositions, '채권 차이 1건').toBe(1);
  expect(d.assets, '자산은 건드리지 않았으므로 자산 차이는 없다').toBe(0);
  await A.context.close(); await B.context.close();
});

test('F-4. A가 Return Key(대표매칭)를 바꿔 올리면 B에서 자산 차이로 잡힌다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.rateMatchOverride = 'KOSPI'; a.updatedAt = Date.now();
    persistAssets(true);
  });
  await push(A.page);

  expect(await pull(B.page)).toBe('held');
  const d = await heldDiff(B.page);
  expect(d.hasDiff).toBe(true);
  expect(d.assets, '수익률 기준 변경도 자산 차이다').toBe(1);
  expect(d.bondPositions, '채권 차이는 없다').toBe(0);
  await choose(B.page, 'pull');
  expect((await counts(B.page)).override, '받으면 그 기준이 들어온다').toBe('KOSPI');
  await A.context.close(); await B.context.close();
});

/* ══════════════ ④⑤⑥ 사용자가 고른 쪽이 이긴다 ══════════════ */

test('F-5. [클라우드 데이터 받기]를 고르면 클라우드 기준이 된다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  // A가 바꿔 올리고, B도 로컬을 따로 바꿔 둔다(양쪽이 다른 상태).
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 150; a.updatedAt = Date.now();
    state.bondPositions[0].terms.couponRate = 4.25;
    state.bondPositions[0].updatedAt = Date.now();
    persistAssets(true); persistBondPositions();
  });
  await push(A.page);
  await B.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 999; a.updatedAt = 1000; // 오래된 수정시각 - 클라우드 쪽이 더 최신이다
    state.bondPositions[0].terms.couponRate = 9.99;
    state.bondPositions[0].updatedAt = 1000;
    persistAssets(true); persistBondPositions();
  });

  expect(await pull(B.page), '차이가 있으므로 묻는다').toBe('held');
  await choose(B.page, 'pull'); // [클라우드 데이터 받기]
  const b = await counts(B.page);
  expect(b.qty, '클라우드의 수량 150이 반영된다').toBe(150);
  expect(b.coupon, '클라우드의 쿠폰 4.25가 반영된다').toBe(4.25);
  await A.context.close(); await B.context.close();
});

test('F-6. [이 기기 데이터 올리기]를 고르면 그 기기 기준으로 클라우드가 바뀌고 상대도 그 값을 받는다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  // A가 먼저 바꿔 올려 B에게 확인 화면이 뜨게 만든다.
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 150; a.updatedAt = Date.now();
    persistAssets(true);
  });
  await push(A.page);
  // B는 자기 값을 고집한다.
  await B.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 250; a.updatedAt = Date.now();
    state.bondPositions[0].terms.couponRate = 4.75;
    state.bondPositions[0].updatedAt = Date.now();
    persistAssets(true); persistBondPositions();
  });
  await settle(B.page);
  B.page.on('dialog', (d) => d.accept()); // [올리기] 2차 확인
  expect(await pull(B.page), '차이가 있으므로 묻는다').toBe('held');
  await choose(B.page, 'push'); // [이 기기 데이터 올리기]
  expect((await counts(B.page)).qty, 'B는 자기 값을 유지한다').toBe(250);

  // A가 받으면 B의 값이 들어온다.
  expect(await pull(A.page), 'A 쪽에서도 차이를 보고 묻는다').toBe('held');
  await choose(A.page, 'pull');
  const a = await counts(A.page);
  expect(a.qty, 'A가 B의 수량 250을 받았다').toBe(250);
  expect(a.coupon, 'A가 B의 쿠폰 4.75를 받았다').toBe(4.75);
  await A.context.close(); await B.context.close();
});

test('F-7. [취소]하면 두 기기와 클라우드 모두 그대로다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 150; a.updatedAt = Date.now();
    persistAssets(true);
  });
  await push(A.page);
  const beforeB = await counts(B.page);
  const postsBefore = B.gate.posts;

  expect(await pull(B.page)).toBe('held');
  await choose(B.page, 'cancel');
  expect(await counts(B.page), 'B는 그대로다').toEqual(beforeB);
  expect(B.gate.posts, 'B는 클라우드에 아무것도 올리지 않았다').toBe(postsBefore);
  await A.context.close(); await B.context.close();
});

/* ══════════════ 연결 무결성 ══════════════ */

test('F-8. 왕복을 마친 두 기기의 내용이 같고 Asset ↔ BondPosition 연결이 끊기지 않는다', async ({ browser }) => {
  const kv = makeKv();
  const { A, B } = await pairedDevices(browser, kv);
  await A.page.evaluate(() => {
    const a = state.assets.find((x) => x.id === 'zz-129-a');
    a.quantity = 111; a.updatedAt = Date.now();
    persistAssets(true);
  });
  await push(A.page);
  await B.page.evaluate(() => {
    state.bondPositions[0].terms.couponRate = 2.25;
    state.bondPositions[0].updatedAt = Date.now();
    persistBondPositions();
  });
  await settle(B.page);
  B.page.on('dialog', (d) => d.accept());
  expect(await pull(B.page)).toBe('held');
  await choose(B.page, 'push');
  expect(await pull(A.page)).toBe('held');
  await choose(A.page, 'pull');

  const cA = await counts(A.page);
  const cB = await counts(B.page);
  expect(cA, '두 기기의 내용이 같다').toEqual(cB);

  const linked = (page) => page.evaluate(() => ({
    orphanBonds: (state.bondPositions || []).filter((p) => !state.assets.some((a) => a.id === p.assetId)).length,
    dupIds: state.assets.length - new Set(state.assets.map((a) => a.id)).size
  }));
  expect(await linked(A.page), 'A - 끊긴 채권 레코드 · 중복 id 없음').toEqual({ orphanBonds: 0, dupIds: 0 });
  expect(await linked(B.page), 'B - 끊긴 채권 레코드 · 중복 id 없음').toEqual({ orphanBonds: 0, dupIds: 0 });
  await A.context.close(); await B.context.close();
});
