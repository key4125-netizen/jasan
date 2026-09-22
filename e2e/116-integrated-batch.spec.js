/* global document, window */
// E2E-116 [통합 개선 배치 · 2026-09-22] 실제 화면에서 이번 변경이 동작하는지 본다.
//
// Unit(test/v268-integrated-batch.test.js)이 규칙을 고정한다면, 이 파일은 **브라우저에서 실제로**
//   ① 자산 폼의 "위험 분석 확인" 두 칸이 주식 · ETF에서만 보이고, 고른 값이 저장 · 복원되는지
//   ② 고른 값이 Market Beta 판정에 실제로 쓰이는지
//   ③ [투자금 설정] 팝업에서 연도별 추가 투자를 넣고 [저장]하면 state에 남고, [취소]면 안 남는지
//   ④ 옛 "매년 투자금 증가율" 입력이 화면에서 사라졌는지
//   ⑤ 375px · 다크모드에서 깨지지 않는지
// 를 확인한다.
//
// [실제 사용자 데이터 미사용] 전부 ZZ 접두어 합성 종목이다.
// [외부 API 비의존] 종목 마스터는 테스트가 직접 주입한다(네트워크를 타지 않는다).
const { test, expect } = require('@playwright/test');

async function bootWithMaster(page) {
  // 부팅 시 CDN에서 받는 종목 마스터가 아래 주입을 덮어쓰지 않도록 막는다(E2E-115와 같은 이유).
  await page.route('**/ticker-master.json*', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => typeof resolveMarketRiskBenchmark === 'function' && typeof sanitizeFxHedgeStatus === 'function');
  await page.evaluate(() => {
    const MASTER = {
      'ZZEF.KQ': { exchange: 'KOSDAQ', market: 'KR', nameKr: 'ZZ 합성 ETF', securityGroup: 'EF', currency: 'KRW', yahooTicker: 'ZZEF.KQ' },
      'ZZKP.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 코스피주권', securityGroup: 'ST', currency: 'KRW', yahooTicker: 'ZZKP.KS' }
    };
    // tickerMasterByTicker는 스크립트 최상위 let 바인딩이라 window 속성이 아니다(E2E-115 주석 참고).
    window.eval('tickerMasterByTicker = ' + JSON.stringify(MASTER) + ';');
  });
}

/* ══════════════════ A. 위험 분석 확인 칸 ══════════════════ */

test('A - 위험 분석 확인 칸은 주식 · ETF에서만 보이고 채권 · 현금에서는 숨는다', async ({ page }) => {
  await bootWithMaster(page);
  const seen = await page.evaluate(() => {
    const wrap = document.getElementById('riskConfirmFieldsWrap');
    const out = {};
    ['주식', 'ETF', '채권', '현금', '부동산'].forEach((c) => {
      document.getElementById('f_category').value = c;
      updateRiskConfirmFieldsUI();
      out[c] = !wrap.classList.contains('hidden');
    });
    return out;
  });
  expect(seen).toEqual({ 주식: true, ETF: true, 채권: false, 현금: false, 부동산: false });
});

test('A-2 - 고를 수 있는 값은 앱이 지원하는 지수와 환헤지 2종뿐이다(기본값은 선택 안 함)', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => ({
    index: Array.from(document.getElementById('f_marketBetaIndexOverride').options).map((o) => o.value),
    hedge: Array.from(document.getElementById('f_fxHedgeStatus').options).map((o) => o.value)
  }));
  expect(r.index).toEqual(['', 'KOSPI', 'KOSDAQ', 'SP500']);
  expect(r.hedge).toEqual(['', 'UNHEDGED', 'HEDGED']);
});

test('A-3 - 고른 값이 실제 Market Beta 판정에 쓰이고, 안내 문구가 그 결과를 말한다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    const out = {};
    document.getElementById('f_category').value = 'ETF';
    document.getElementById('f_ticker').value = 'ZZEF.KQ';
    document.getElementById('f_marketBetaIndexOverride').value = '';
    document.getElementById('f_fxHedgeStatus').value = '';
    updateRiskConfirmFieldsUI();
    out.beforeHint = document.getElementById('f_marketBetaIndexHint').textContent;
    out.beforeKey = resolveMarketRiskBenchmark({ ticker: 'ZZEF.KQ', category: 'ETF', name: 'ZZ 합성 ETF' }).key;

    document.getElementById('f_marketBetaIndexOverride').value = 'KOSDAQ';
    updateRiskConfirmFieldsUI();
    out.afterHint = document.getElementById('f_marketBetaIndexHint').textContent;
    const after = resolveMarketRiskBenchmark({ ticker: 'ZZEF.KQ', category: 'ETF', name: 'ZZ 합성 ETF', marketBetaIndexOverride: 'KOSDAQ' });
    out.afterKey = after.key;
    out.afterSource = after.source;
    return out;
  });
  expect(r.beforeKey).toBeNull();
  expect(r.beforeHint).toContain('아직 확인되지 않았습니다');
  expect(r.afterKey).toBe('KOSDAQ');
  expect(r.afterSource).toBe('userConfirmedIndex');
  expect(r.afterHint).toContain('직접 확인함');
});

test('A-4 - 저장하면 자산에 남고 다시 열면 그 값이 보인다(자동 판정이 덮어쓰지 않는다)', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    // 폼을 직접 채워 저장 경로를 그대로 탄다(합성 종목 · 합성 수량).
    openModal('add');
    document.getElementById('f_manualEntryToggle').checked = true;
    document.getElementById('f_ticker').value = 'ZZEF.KQ';
    document.getElementById('f_name').value = 'ZZ 합성 ETF';
    document.getElementById('f_owner').value = '신랑';
    document.getElementById('f_accountType').value = '일반계좌';
    document.getElementById('f_category').value = 'ETF';
    document.getElementById('f_isDomestic').value = '국내';
    document.getElementById('f_currency').value = 'KRW';
    document.getElementById('f_quantity').value = '10';
    document.getElementById('f_buyPrice').value = '10000';
    document.getElementById('f_currentPrice').value = '10000';
    document.getElementById('f_marketBetaIndexOverride').value = 'KOSDAQ';
    document.getElementById('f_fxHedgeStatus').value = 'UNHEDGED';
    document.getElementById('assetForm').dispatchEvent(new window.Event('submit', { cancelable: true }));

    const saved = state.assets.find((a) => a.ticker === 'ZZEF.KQ');
    const out = { savedIndex: saved && saved.marketBetaIndexOverride, savedHedge: saved && saved.fxHedgeStatus };
    // 다시 열었을 때 그대로 보이는가.
    openModal('edit', saved.id);
    out.reopenIndex = document.getElementById('f_marketBetaIndexOverride').value;
    out.reopenHedge = document.getElementById('f_fxHedgeStatus').value;
    closeModal();
    // 백업 · 동기화 왕복에서도 살아남는가(실제 정규화 함수를 그대로 탄다).
    const roundTrip = normalizeImportedAsset(JSON.parse(JSON.stringify(saved)));
    out.roundTripIndex = roundTrip.marketBetaIndexOverride;
    out.roundTripHedge = roundTrip.fxHedgeStatus;
    return out;
  });
  expect(r.savedIndex).toBe('KOSDAQ');
  expect(r.savedHedge).toBe('UNHEDGED');
  expect(r.reopenIndex).toBe('KOSDAQ');
  expect(r.reopenHedge).toBe('UNHEDGED');
  expect(r.roundTripIndex).toBe('KOSDAQ');
  expect(r.roundTripHedge).toBe('UNHEDGED');
});

test('A-5 - 고르지 않으면 값이 생기지 않는다(시스템이 대신 채우지 않는다)', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    openModal('add');
    document.getElementById('f_manualEntryToggle').checked = true;
    document.getElementById('f_ticker').value = 'ZZKP.KS';
    document.getElementById('f_name').value = 'ZZ 코스피주권(H)'; // 이름에 (H)가 있어도 추정하지 않는다
    document.getElementById('f_owner').value = '신랑';
    document.getElementById('f_accountType').value = '일반계좌';
    document.getElementById('f_category').value = '주식';
    document.getElementById('f_quantity').value = '5';
    document.getElementById('f_buyPrice').value = '1000';
    document.getElementById('f_currentPrice').value = '1000';
    document.getElementById('assetForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
    const saved = state.assets.find((a) => a.ticker === 'ZZKP.KS');
    return { index: saved.marketBetaIndexOverride, hedge: saved.fxHedgeStatus };
  });
  expect(r.index).toBeUndefined();
  expect(r.hedge).toBeUndefined();
});

test('A-6 - 거래내역으로 관리되는 자산도 자산 상세에서 확인값을 고칠 수 있다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    // 거래원장이 SoT인 자산(positionSource 없음)은 상세 팝업의 [수정] 버튼이 숨겨질 수 있다 -
    // 그래서 확인 UI는 자산 입력 폼이 아니라 상세 팝업에도 있어야 한다.
    state.assets = [makeAsset({
      name: 'ZZ 합성 ETF', ticker: 'ZZEF.KQ', category: 'ETF', owner: '신랑', accountType: '일반계좌',
      isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 10000, currentPrice: 10000
    })];
    persistAssets();
    renderAll();
    openAssetDetailModal(state.assets[0].id);
    const box = document.getElementById('assetDetailRiskConfirm');
    const out = { visible: !box.classList.contains('hidden'), before: box.innerText.includes('확인하지 못했습니다') };

    const sel = document.getElementById('assetDetailMarketBetaSelect');
    sel.value = 'KOSDAQ';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    out.saved = state.assets[0].marketBetaIndexOverride;
    out.resolved = resolveMarketRiskBenchmark(state.assets[0]);
    out.afterText = document.getElementById('assetDetailRiskConfirm').innerText.includes('직접 확인함');

    // "선택 안 함"으로 되돌리면 값이 지워지고 자동 판정으로 돌아간다(사용자가 지울 수 있어야 한다).
    const sel2 = document.getElementById('assetDetailMarketBetaSelect');
    sel2.value = '';
    sel2.dispatchEvent(new window.Event('change', { bubbles: true }));
    out.clearedKeyPresent = Object.prototype.hasOwnProperty.call(state.assets[0], 'marketBetaIndexOverride');
    return out;
  });
  expect(r.visible).toBe(true);
  expect(r.before).toBe(true);
  expect(r.saved).toBe('KOSDAQ');
  expect(r.resolved.status).toBe('RESOLVED');
  expect(r.resolved.source).toBe('userConfirmedIndex');
  expect(r.afterText).toBe(true);
  expect(r.clearedKeyPresent).toBe(false);
});

test('A-7 - 채권 · 현금 자산의 상세에는 위험 분석 확인 칸이 없다', async ({ page }) => {
  await bootWithMaster(page);
  const visible = await page.evaluate(() => {
    state.assets = [makeAsset({
      name: 'ZZ 합성 채권', category: '채권', owner: '신랑', accountType: '일반계좌',
      isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 1000000, currentPrice: 1000000
    })];
    persistAssets();
    renderAll();
    openAssetDetailModal(state.assets[0].id);
    return !document.getElementById('assetDetailRiskConfirm').classList.contains('hidden');
  });
  expect(visible).toBe(false);
});

/* ══════════════════ B. 연도별 추가 투자 ══════════════════ */

test('B - [투자금 설정] 팝업에 연도별 추가 투자가 있고 옛 증가율 입력은 없다', async ({ page }) => {
  await bootWithMaster(page);
  await page.evaluate(() => openMonthlyContributionAllocationModal());
  await expect(page.locator('#monthlyContributionAllocationModal h3')).toHaveText('투자금 설정');
  await expect(page.locator('#yearlyExtraContributionList')).toBeVisible();
  await expect(page.locator('#yearlyExtraContributionAddBtn')).toBeVisible();
  expect(await page.locator('#contributionGrowthRateInput').count()).toBe(0);
  // 아직 아무것도 없으면 "없다"고 분명히 말한다(빈 화면으로 두지 않는다).
  await expect(page.locator('#yearlyExtraContributionList')).toContainText('추가로 넣을 목돈이 있는 해가 없습니다');
});

test('B-2 - 연도 추가 → 금액 입력 → [저장]하면 state에 남는다', async ({ page }) => {
  await bootWithMaster(page);
  await page.evaluate(() => openMonthlyContributionAllocationModal());
  await page.click('#yearlyExtraContributionAddBtn');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="0"]', '2027');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]', '10000000');
  await page.click('#yearlyExtraContributionAddBtn');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="1"]', '2028');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="1"]', '5000000');
  // [Global Readability Policy 9] 금액칸은 천 단위 구분자로 보인다 - 저장값은 숫자 그대로다.
  await expect(page.locator('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]')).toHaveValue('10,000,000');
  await expect(page.locator('#yearlyExtraContributionTotalHint')).toHaveText('합계 1,500만원');
  await page.click('#saveMonthlyContributionAllocationModalBtn');
  const saved = await page.evaluate(() => state.projection.yearlyExtraContributions);
  expect(saved).toEqual([{ year: 2027, amount: 10000000 }, { year: 2028, amount: 5000000 }]);
});

test('B-3 - [취소]하면 남지 않는다(기존 draft 계약 그대로)', async ({ page }) => {
  await bootWithMaster(page);
  await page.evaluate(() => openMonthlyContributionAllocationModal());
  await page.click('#yearlyExtraContributionAddBtn');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="0"]', '2030');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]', '7000000');
  await page.click('#cancelMonthlyContributionAllocationModalBtn');
  expect(await page.evaluate(() => state.projection.yearlyExtraContributions)).toEqual([]);
});

test('B-4 - 같은 해를 두 번 적으면 저장하지 않고 이유를 말한다(임의로 합치지 않는다)', async ({ page }) => {
  await bootWithMaster(page);
  let alertText = null;
  page.on('dialog', async (d) => { alertText = d.message(); await d.dismiss(); });
  await page.evaluate(() => openMonthlyContributionAllocationModal());
  await page.click('#yearlyExtraContributionAddBtn');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="0"]', '2027');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]', '1000000');
  await page.click('#yearlyExtraContributionAddBtn');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="1"]', '2027');
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="1"]', '2000000');
  await page.click('#saveMonthlyContributionAllocationModalBtn');
  expect(alertText).toContain('2027년이 두 번');
  expect(await page.evaluate(() => state.projection.yearlyExtraContributions)).toEqual([]);
});

test('B-5 - 예측 기간 밖의 해는 반영되지 않는다고 화면이 알려 준다(조용히 버리지 않는다)', async ({ page }) => {
  await bootWithMaster(page);
  await page.evaluate(() => openMonthlyContributionAllocationModal());
  await page.click('#yearlyExtraContributionAddBtn');
  const farYear = await page.evaluate(() => new Date().getFullYear() + 50);
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-year="0"]', String(farYear));
  await page.fill('#yearlyExtraContributionList input[data-yearly-extra-amount="0"]', '9000000');
  // 다시 그려야 판정 문구가 붙는다(삭제 버튼을 쓰지 않고 목록을 새로 그린다).
  await page.evaluate(() => renderYearlyExtraContributionList());
  await expect(page.locator('#yearlyExtraContributionList')).toContainText('계산에 반영되지 않습니다');
});

test('B-6 - 저장한 추가 투자가 미래예측 요약 한 줄에 그대로 나온다', async ({ page }) => {
  await bootWithMaster(page);
  await page.evaluate(() => {
    state.projection.yearlyExtraContributions = [{ year: new Date().getFullYear() + 1, amount: 10000000 }];
    updateProjection();
  });
  await expect(page.locator('#projectionPlanGrowthText')).toContainText('1개 연도');
});

/* ══════════════════ C. 화면 품질 ══════════════════ */

test('C - 375px · 다크모드에서 [투자금 설정] 팝업이 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await bootWithMaster(page);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    openMonthlyContributionAllocationModal();
  });
  await page.click('#yearlyExtraContributionAddBtn');
  const overflow = await page.evaluate(() => {
    const el = document.getElementById('monthlyContributionAllocationModal');
    return { pageScroll: document.documentElement.scrollWidth > window.innerWidth + 1, modalVisible: !el.classList.contains('hidden') };
  });
  expect(overflow.modalVisible).toBe(true);
  expect(overflow.pageScroll).toBe(false);
  // 터치 대상이 충분히 크다(모바일 우선 원칙).
  const h = await page.locator('#yearlyExtraContributionAddBtn').evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
});

test('C-2 - 콘솔 오류 없이 부팅하고 팝업을 열고 닫을 수 있다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await bootWithMaster(page);
  await page.evaluate(() => { openMonthlyContributionAllocationModal(); closeMonthlyContributionAllocationModal(false); openModal('add'); closeModal(); });
  // 이 테스트 환경은 외부 네트워크를 차단한다(playwright.config.js) - 그래서 시세 · 지수 조회는
  // 반드시 실패하며 그 실패 로그는 이 테스트의 관심사가 아니다. 이번 변경이 만든 스크립트 오류만 본다.
  const real = errors.filter((e) => !/Failed to load resource|net::ERR|ticker-master|시세조회 실패|Failed to fetch/i.test(e));
  expect(real).toEqual([]);
});
