// E2E-83 [신규 시작 안정화] 기기 데이터 초기화 → 다음 날 새 자산·거래 입력 → Day1 / Day2(거래 없음) / Day3(매수)에서
// 오늘 기록·과거 이력·그래프·동기화가 가짜 값을 만들지 않는다.
//
// PM 지시(2026-09-13 신규 시작 전 최종 안정화)에서 재현 후 고친 것:
//   - 자산이 하나도 없는 상태(초기화 직후·빈 기기)도 렌더링마다 오늘을 0원으로 기록했다 → 다음 날 자산을 입력하면
//     그래프가 전날 0원에서 실제 금액으로 튀었다. 이제 빈 포트폴리오는 오늘을 기록하지 않는다(js/11 recordDailySnapshot).
//   - 기기 데이터 초기화가 메모리의 티커 역할·학습 종목명을 남겨, 재실행 전에 자산을 추가하면 예전 역할이 다시 저장됐다(js/14).
// 나머지(거래 없는 날·기록 없는 날·진행 중 동기화와 초기화 경합·새 암호 슬롯 분리)는 현재 동작을 고정한다.
// 전부 합성 데이터다. Cloud Worker는 route로 가로챈 가짜 KV만 쓴다(실제 Cloud 요청 0).
const { test, expect } = require('@playwright/test');

const WORKER = /steep-haze-01f0/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ASSET_ROWS = [
  { ticker: '005930', '소유자': '신랑', '계좌구분': '일반계좌', '종목명': 'E83_국내주식', '국내/해외': '국내', '통화': 'KRW', '수량': 10, '매수단가': 50000, '현재가': 60000, '자산군(자동분류)': '주식' },
  { ticker: 'VOO', '소유자': '와이프', '계좌구분': '일반계좌', '종목명': 'E83_해외ETF', '국내/해외': '해외', '통화': 'USD', '수량': 2, '매수단가': 400, '현재가': 450, '자산군(자동분류)': 'ETF', '취득환율(매수시점)': 1300 },
  { ticker: '', '소유자': '신랑', '계좌구분': '일반계좌', '종목명': 'E83_원화현금', '국내/해외': '국내', '통화': 'KRW', '수량': 1, '매수단가': 2000000, '현재가': 2000000, '자산군(자동분류)': '현금' }
];
const TX_DAY1 = [
  { '일자': '2026-09-14', '소유자': '신랑', '계좌구분': '일반계좌', ticker: '005930', '종목명': 'E83_국내주식', '거래유형': '매수', '수량': 10, '매매단가': 50000, '통화': 'KRW', '수수료': 0, '구분': '최초보유' },
  { '일자': '2026-09-14', '소유자': '와이프', '계좌구분': '일반계좌', ticker: 'VOO', '종목명': 'E83_해외ETF', '거래유형': '매수', '수량': 2, '매매단가': 400, '통화': 'USD', '적용환율': 1300, '수수료': 0, '구분': '최초보유' }
];
const TX_DAY3 = [
  { '일자': '2026-09-16', '소유자': '신랑', '계좌구분': '일반계좌', ticker: '005930', '종목명': 'E83_국내주식', '거래유형': '매수', '수량': 5, '매매단가': 52000, '통화': 'KRW', '수수료': 0, '구분': '기간거래' }
];
// 합계 = 10×60,000 + 2×450×1,450(기본 환율, 검증환경은 시세·환율 조회가 막혀 있다) + 2,000,000
const DAY1_TOTAL = 600000 + 1305000 + 2000000;
const BOND = { id: 'e83-bond', ticker: '', owner: '신랑', accountType: '일반계좌', category: '채권', categorySource: 'user', name: 'E83_채권', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 3000000, currentPrice: 3000000, positionSource: 'manual', createdAt: 1, updatedAt: 1 };

async function settle(page) {
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function'
    && typeof pullFromCloud === 'function' && typeof refreshBtn !== 'undefined' && !refreshBtn.disabled);
  await page.waitForTimeout(500);
}
// 초기화를 마치고 다시 연 기기와 같은 출발점: 앱 데이터 없음 + 첫 실행 표시만 남음(샘플 자산 재시딩 없음)
async function cleanOpen(page) {
  await page.goto('/manifest.json');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sam_has_launched_v1', '1'); });
  await page.goto('/');
  await settle(page);
}
async function fakeKv(context) {
  const kv = { store: {}, posts: [], holdGet: false, held: [] };
  await context.route(WORKER, async (route) => {
    const req = route.request();
    const k = new URL(req.url()).searchParams.get('k') || '_';
    if (req.method() === 'POST') {
      kv.store[k] = JSON.parse(req.postData());
      kv.posts.push(kv.store[k]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    const snapshot = kv.store[k];
    const answer = () => (snapshot
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) })
      : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    if (kv.holdGet) { kv.held.push(answer); return undefined; }
    return answer();
  });
  return kv;
}
async function xlsxFile(page, sheet, rows, name) {
  const b64 = await page.locator('body').evaluate((el, [s, rs]) => {
    const XL = el.ownerDocument.defaultView.XLSX;
    const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, XL.utils.json_to_sheet(rs), s);
    return XL.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, [sheet, rows]);
  return { name, mimeType: XLSX_MIME, buffer: Buffer.from(b64, 'base64') };
}
async function importXlsx(page, input, file, mode) {
  await page.setInputFiles(input, file);
  await page.locator(mode === 'append' ? '#importChoiceAppendBtn' : '#importChoiceOverwriteBtn').click();
  await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
  await page.waitForTimeout(800);
}
function info(page) {
  return page.locator('body').evaluate(() => {
    const keys = Object.keys(state.dailySnapshots).sort();
    const { positions, annotated } = computePositionsAndRealizedPnL();
    return {
      keys,
      curs: Object.fromEntries(keys.map((k) => [k, state.dailySnapshots[k].total.cur])),
      series: buildTotalValueSeries(3).map((x) => [x.date, x.recorded, x.total]),
      assets: state.assets.map((a) => ({ name: a.name, qty: a.quantity, buyPrice: a.buyPrice, buyRate: a.buyRate === undefined ? null : a.buyRate,
        categorySource: a.categorySource, positionSource: a.positionSource === undefined ? 'UNDEFINED' : a.positionSource })).sort((x, y) => (x.name < y.name ? -1 : 1)),
      positions: Object.values(positions).map((p) => ({ name: p.name, qty: p.quantity, avg: p.avgPrice })).sort((x, y) => (x.name < y.name ? -1 : 1)),
      realized: annotated.filter((t) => t.type === 'sell').reduce((s, t) => s + t.computedRealizedPnL, 0),
      tx: state.transactions.length,
      assetsTotal: state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)
    };
  });
}
function decryptPost(page, body, pw) {
  return page.locator('body').evaluate(async (el, [b, p]) => {
    const parsed = await decryptSyncBlob(b, p);
    return { assets: parsed.assets.length, tx: parsed.transactions.length, snapKeys: Object.keys(parsed.dailySnapshots || {}).sort(),
      roles: Object.keys(parsed.tickerRoles || {}), learned: Object.keys(parsed.learnedTickerNames || {}) };
  }, [body, pw]);
}
async function seedOldSynced(page, pw) {
  await page.locator('body').evaluate(async (el, [asset, p]) => {
    state.assets = [asset];
    state.transactions = [];
    state.dailySnapshots = {};
    for (let n = 1; n <= 20; n++) {
      const d = new Date(); d.setDate(d.getDate() - n);
      state.dailySnapshots[dateKeyFromDate(d)] = { total: { cur: 3000000, dailyPnL: 0 }, byOwner: { '신랑': { cur: 3000000, dailyPnL: 0 } }, byOwnerCategory: { '신랑': { '채권': { cur: 3000000, dailyPnL: 0 } } } };
    }
    state.tickerRoles = { E83OLDROLE: 'core' };
    state.learnedTickerNames = { E83OLD: 'E83_예전이름' };
    persistAssets(true); persistTransactions(); persistDailySnapshots(); persistTickerRoles(); persistLearnedTickerNames();
    localStorage.setItem('sam_sync_password_v1', p);
    localStorage.setItem('sam_sync_enabled_v1', '1');
    loadSyncState();
    renderAll();
    await pushToCloud();
  }, [{ ...BOND, name: 'E83_예전자산' }, pw]);
}
const clickReset = (page) => page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('resetDataBtn').click(); });
const localSummary = (page) => page.locator('body').evaluate(() => ({
  assets: state.assets.map((a) => a.name), tx: state.transactions.length, snapKeys: Object.keys(state.dailySnapshots).length,
  lsAssets: JSON.parse(localStorage.getItem('sam_assets_v5') || '[]').length, lsSnapKeys: Object.keys(JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}')).length,
  syncEnabled: syncState.enabled, lsSyncPassword: localStorage.getItem('sam_sync_password_v1'), lsSyncEnabled: localStorage.getItem('sam_sync_enabled_v1')
}));

test('N1. 자산이 없는 상태는 오늘을 0원으로 기록하지 않고, 자산이 생기면 기록하고, 모두 지우면 오늘 기록만 지운다', async ({ page }) => {
  await cleanOpen(page);
  const r = await page.locator('body').evaluate((el, bond) => {
    const today = todayDateStr();
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return dateKeyFromDate(d); })();
    const has = () => ({ mem: !!state.dailySnapshots[today], ls: !!JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}')[today] });
    renderAll();
    const empty = has();
    state.dailySnapshots[yesterday] = { total: { cur: 1000, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} };
    state.assets = [bond]; persistAssets(true); renderAll();
    const withAsset = { ...has(), cur: state.dailySnapshots[today].total.cur };
    state.assets = []; persistAssets(true); renderAll();
    return { empty, withAsset, emptied: has(), yesterdayKept: state.dailySnapshots[yesterday].total.cur };
  }, BOND);
  expect(r.empty, '빈 포트폴리오는 오늘 기록 없음').toEqual({ mem: false, ls: false });
  expect(r.withAsset).toEqual({ mem: true, ls: true, cur: 3000000 });
  expect(r.emptied, '자산을 모두 지우면 오늘 기록만 지운다').toEqual({ mem: false, ls: false });
  expect(r.yesterdayKept, '과거 날짜는 건드리지 않는다').toBe(1000);
});

test('N1-b. 자산은 있지만 평가금액이 0원인 날(수량 0)은 실제 기록이라 0원으로 남긴다', async ({ page }) => {
  await cleanOpen(page);
  const r = await page.locator('body').evaluate((el, bond) => {
    state.assets = [{ ...bond, quantity: 0 }]; persistAssets(true); renderAll();
    const t = state.dailySnapshots[todayDateStr()];
    return t ? t.total.cur : 'MISSING';
  }, BOND);
  expect(r).toBe(0);
});

test('N2. 오늘 비워 둔 기기에서 다음 날 자산 엑셀을 올리면 전날 0원 기록이 없어 그래프가 0원에서 급등하지 않는다', async ({ page, context }) => {
  await context.clock.setFixedTime(new Date('2026-09-13T21:00:00+09:00'));
  await cleanOpen(page);
  const day0 = await page.locator('body').evaluate(() => Object.keys(state.dailySnapshots));
  await context.clock.setFixedTime(new Date('2026-09-14T10:00:00+09:00'));
  await page.reload();
  await settle(page);
  page.on('dialog', (d) => d.accept());
  await importXlsx(page, '#excelFileInput', await xlsxFile(page, '자산목록', ASSET_ROWS, 'e83-assets.xlsx'), 'overwrite');
  const r = await info(page);
  expect(day0, '빈 기기로 연 날은 기록이 없다').toEqual([]);
  expect(r.keys).toEqual(['2026-09-14']);
  expect(r.series.slice(1)).toEqual([['2026-09-13', false, null], ['2026-09-14', true, DAY1_TOTAL]]);
});

test('N3. 기기 데이터 초기화는 오늘 0원 기록을 남기지 않고, 메모리의 티커 역할·학습 종목명도 비워 재실행 전 입력에 섞이지 않는다', async ({ page }) => {
  await cleanOpen(page);
  page.on('dialog', (d) => d.accept());
  await page.locator('body').evaluate((el, bond) => {
    state.assets = [bond];
    state.tickerRoles = { E83OLDROLE: 'core' };
    state.learnedTickerNames = { E83OLD: 'E83_예전이름' };
    persistAssets(true); persistTickerRoles(); persistLearnedTickerNames(); renderAll();
  }, BOND);
  await clickReset(page);
  const afterReset = await page.locator('body').evaluate(() => ({
    assets: state.assets.length, snapMem: Object.keys(state.dailySnapshots).length, snapLs: Object.keys(JSON.parse(localStorage.getItem('sam_daily_snapshot_v1') || '{}')).length,
    roles: Object.keys(state.tickerRoles), learned: Object.keys(state.learnedTickerNames)
  }));
  // 앱을 다시 열기 전에 자산을 추가한다(역할 레지스트리를 저장하는 경로)
  await page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('systemManagementBtn').click(); el.ownerDocument.getElementById('addAssetBtn').click(); });
  await page.locator('#assetForm').evaluate((form) => {
    const doc = form.ownerDocument;
    doc.getElementById('f_name').value = 'E83_새자산';
    doc.getElementById('f_quantity').value = '1';
    doc.getElementById('f_buyPrice').value = '1000';
    form.requestSubmit();
  });
  await page.waitForFunction(() => state.assets.some((a) => a.name === 'E83_새자산'));
  const afterAdd = await page.locator('body').evaluate(() => ({
    lsRoles: Object.keys(JSON.parse(localStorage.getItem('sam_ticker_roles_v1') || '{}')),
    lsLearned: Object.keys(JSON.parse(localStorage.getItem('sam_learned_ticker_names_v1') || '{}'))
  }));
  await page.reload();
  await settle(page);
  const afterReload = await page.locator('body').evaluate(() => ({ assets: state.assets.map((a) => a.name), roles: Object.keys(state.tickerRoles), learned: Object.keys(state.learnedTickerNames) }));
  expect(afterReset).toEqual({ assets: 0, snapMem: 0, snapLs: 0, roles: [], learned: [] });
  expect(afterAdd.lsRoles).not.toContain('E83OLDROLE');
  expect(afterAdd.lsLearned).not.toContain('E83OLD');
  expect(afterReload.assets).toEqual(['E83_새자산']);
  expect(afterReload.roles).not.toContain('E83OLDROLE');
  expect(afterReload.learned).not.toContain('E83OLD');
});

test('N4. Day1 자산·거래 엑셀 + 최초 동기화 → Day2 거래 없음(0원 없음·과거 불변) → Day3 매수(보유·평균단가·그래프·Cloud 반영)', async ({ page, context }) => {
  test.setTimeout(90000);
  const kv = await fakeKv(context);
  await context.clock.setFixedTime(new Date('2026-09-14T10:00:00+09:00'));
  await cleanOpen(page);
  page.on('dialog', (d) => d.accept());
  await importXlsx(page, '#excelFileInput', await xlsxFile(page, '자산목록', ASSET_ROWS, 'e83-assets.xlsx'), 'overwrite');
  await importXlsx(page, '#txExcelFileInput', await xlsxFile(page, '거래내역', TX_DAY1, 'e83-tx1.xlsx'), 'overwrite');
  const day1 = await info(page);

  // 최초 동기화 - 새 암호의 빈 슬롯이라 방향을 묻지 않고 업로드 확인만 보인다
  await page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('syncSettingsBtn').click(); });
  await page.locator('#syncPasswordInput').fill('e83-new-start');
  await page.locator('#syncPasswordSaveBtn').click();
  await expect(page.locator('#syncUploadConfirmBox')).toBeVisible();
  await expect(page.locator('#syncDirectionBox')).toBeHidden();
  await page.locator('#syncUploadConfirmBtn').click();
  await expect.poll(() => kv.posts.length).toBeGreaterThan(0);
  const cloud1 = await decryptPost(page, kv.posts[kv.posts.length - 1], 'e83-new-start');

  // Day2 - 거래 없음, 앱만 연다
  await context.clock.setFixedTime(new Date('2026-09-15T10:00:00+09:00'));
  await page.reload();
  await settle(page);
  const day2 = await info(page);

  // Day3 - 매수 1건(거래 엑셀 추가하기)
  await context.clock.setFixedTime(new Date('2026-09-16T10:00:00+09:00'));
  await page.reload();
  await settle(page);
  await importXlsx(page, '#txExcelFileInput', await xlsxFile(page, '거래내역', TX_DAY3, 'e83-tx3.xlsx'), 'append');
  const day3 = await info(page);
  await page.waitForTimeout(4000);
  const cloud3 = await decryptPost(page, kv.posts[kv.posts.length - 1], 'e83-new-start');

  expect(day1.keys).toEqual(['2026-09-14']);
  expect(day1.curs['2026-09-14']).toBe(DAY1_TOTAL);
  expect(day1.assetsTotal).toBe(DAY1_TOTAL);
  expect(day1.assets.map((a) => [a.name, a.qty, a.buyPrice, a.categorySource])).toEqual([
    ['E83_국내주식', 10, 50000, 'user'], ['E83_원화현금', 1, 2000000, 'user'], ['E83_해외ETF', 2, 400, 'user']]);
  expect(day1.assets.find((a) => a.name === 'E83_해외ETF').buyRate).toBe(1300);
  expect(day1.positions).toEqual([{ name: 'E83_국내주식', qty: 10, avg: 50000 }, { name: 'E83_해외ETF', qty: 2, avg: 400 }]);
  expect(day1.tx).toBe(2);
  expect(day1.realized).toBe(0);
  expect(cloud1).toMatchObject({ assets: 3, tx: 2, snapKeys: ['2026-09-14'] });

  expect(day2.keys, 'Day2: 새 날짜 1개만 추가, 과거 생성 없음').toEqual(['2026-09-14', '2026-09-15']);
  expect(day2.curs, 'Day2: 거래가 없어도 평가금액은 0원이 아니고 Day1 기록은 그대로다').toEqual({ '2026-09-14': DAY1_TOTAL, '2026-09-15': DAY1_TOTAL });
  expect(day2.series).toEqual([['2026-09-13', false, null], ['2026-09-14', true, DAY1_TOTAL], ['2026-09-15', true, DAY1_TOTAL]]);
  expect(day2.assets).toEqual(day1.assets);

  expect(day3.keys).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  expect(day3.curs['2026-09-14']).toBe(DAY1_TOTAL);
  expect(day3.curs['2026-09-15']).toBe(DAY1_TOTAL);
  expect(day3.curs['2026-09-16'], 'Day3: 매수 5주 × 현재가 60,000 반영').toBe(DAY1_TOTAL + 5 * 60000);
  const stock = day3.assets.find((a) => a.name === 'E83_국내주식');
  expect(stock.qty).toBe(15);
  expect(stock.buyPrice).toBeCloseTo((10 * 50000 + 5 * 52000) / 15, 6);
  expect(day3.positions.find((p) => p.name === 'E83_국내주식').qty).toBe(15);
  expect(day3.tx).toBe(3);
  expect(day3.realized).toBe(0);
  expect(cloud3).toMatchObject({ assets: 3, tx: 3, snapKeys: ['2026-09-14', '2026-09-15', '2026-09-16'] });
});

test('N5. 앱을 열지 않은 날(Day2)은 그래프에서 공백이고 0원이 아니다', async ({ page, context }) => {
  await context.clock.setFixedTime(new Date('2026-09-14T10:00:00+09:00'));
  await cleanOpen(page);
  await page.locator('body').evaluate((el, bond) => { state.assets = [bond]; persistAssets(true); renderAll(); }, BOND);
  await context.clock.setFixedTime(new Date('2026-09-16T10:00:00+09:00'));
  await page.reload();
  await settle(page);
  const r = await page.locator('body').evaluate(() => ({
    keys: Object.keys(state.dailySnapshots).sort(),
    series: buildTotalValueSeries(3).map((x) => [x.date, x.recorded, x.total]),
    pnl: buildDailyPnlSeries(3).map((x) => x.total)
  }));
  expect(r.keys).toEqual(['2026-09-14', '2026-09-16']);
  expect(r.series).toEqual([['2026-09-14', true, 3000000], ['2026-09-15', false, null], ['2026-09-16', true, 3000000]]);
  expect(r.pnl).toEqual([0, null, 0]);
});

for (const op of ['pull', 'push']) {
  test(`N6-${op}. 동기화 ${op === 'pull' ? '받기' : '올리기'}가 진행 중일 때 기기 데이터 초기화를 눌러도 예전 데이터가 되살아나거나 Cloud에 올라가지 않는다`, async ({ page, context }) => {
    const kv = await fakeKv(context);
    await cleanOpen(page);
    page.on('dialog', (d) => d.accept());
    await seedOldSynced(page, 'e83-race-' + op);
    const key = Object.keys(kv.store)[0];
    kv.store[key] = { ...kv.store[key], version: kv.store[key].version + 5000 }; // 다른 기기가 더 최신을 올려 둔 상황
    const postsBefore = kv.posts.length;
    kv.holdGet = true;
    await page.locator('body').evaluate((el, o) => {
      const win = el.ownerDocument.defaultView;
      win.__e83op = (o === 'pull' ? pullFromCloud({ silent: true }) : pushToCloud()).then((v) => String(v), () => 'rejected');
    }, op);
    await expect.poll(() => kv.held.length).toBeGreaterThan(0);
    await clickReset(page);
    kv.holdGet = false;
    kv.held.splice(0).forEach((answer) => answer());
    await page.locator('body').evaluate((el) => el.ownerDocument.defaultView.__e83op);
    await page.waitForTimeout(4000);
    const afterOp = await localSummary(page);
    await page.reload();
    await settle(page);
    const afterReload = await localSummary(page);
    const empty = { assets: [], tx: 0, snapKeys: 0, lsAssets: 0, lsSnapKeys: 0, syncEnabled: false, lsSyncPassword: null, lsSyncEnabled: null };
    expect(afterOp).toEqual(empty);
    expect(afterReload).toEqual(empty);
    expect(kv.posts.length - postsBefore, '초기화 뒤 Cloud 업로드 0').toBe(0);
  });
}

test('N7. 새 암호로 연결한 초기화 기기는, 초기화하지 않은 다른 기기가 예전 슬롯에 올린 데이터를 받지 않는다', async ({ browser }) => {
  test.setTimeout(90000);
  const kvShared = { store: {}, posts: [] };
  const openDevice = async () => {
    const context = await browser.newContext();
    await context.route(WORKER, async (route) => {
      const req = route.request();
      const k = new URL(req.url()).searchParams.get('k') || '_';
      if (req.method() === 'POST') { kvShared.store[k] = JSON.parse(req.postData()); kvShared.posts.push(k); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      if (!kvShared.store[k]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kvShared.store[k]) });
    });
    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await cleanOpen(page);
    return { context, page };
  };
  const phone = await openDevice();
  await seedOldSynced(phone.page, 'e83-old-pw');
  const pc = await openDevice();
  await seedOldSynced(pc.page, 'e83-old-pw'); // 초기화하지 않고 남겨 둔 기기

  await clickReset(phone.page);
  await phone.page.reload();
  await settle(phone.page);
  await phone.page.locator('body').evaluate((el) => { el.ownerDocument.getElementById('syncSettingsBtn').click(); });
  await phone.page.locator('#syncPasswordInput').fill('e83-new-pw');
  await phone.page.locator('#syncPasswordSaveBtn').click();
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeVisible();
  await phone.page.locator('#syncUploadConfirmBtn').click();
  await expect(phone.page.locator('#syncUploadConfirmBox')).toBeHidden();

  await pc.page.locator('body').evaluate(async () => { renderAll(); await pushToCloud(); }); // 예전 기기의 평소 업로드(예전 슬롯)
  const pulled = await phone.page.locator('body').evaluate(async () => pullFromCloud({ silent: true }));
  const phoneState = await localSummary(phone.page);
  const phoneCaches = await phone.page.locator('body').evaluate(() => ({ roles: Object.keys(state.tickerRoles), learned: Object.keys(state.learnedTickerNames) }));
  expect(pulled).toBe('up_to_date');
  expect(phoneState.assets).toEqual([]);
  expect(phoneState.snapKeys).toBe(0);
  expect(phoneCaches.roles).not.toContain('E83OLDROLE');
  expect(phoneCaches.learned).not.toContain('E83OLD');
  await phone.context.close();
  await pc.context.close();
});
