// E2E-118 [PM 최종 통합 작업 지시문 2026-09-23] UI 개선 4건을 실제 화면에서 확인한다.
//
//   #1 거래 추가 - 자산군 = 채권이면 종목 검색 UI 자리에 표준코드(ISIN) 입력/조회 UI가 온다.
//   #2 주식/ETF/채권 모두 수동입력 기본 OFF, 자산군을 바꿔도 이전 상태를 승계하지 않는다.
//   #3 매크로 브리핑 세부 현황 - 제목 우측 [세부내용] 버튼 + 팝업(카드 높이가 변하지 않는다).
//   #4 신랑/와이프 목표비중 아코디언 - 비중조절 팝업을 열고 닫아도 저절로 열리지 않고,
//      버튼 줄 안쪽을 빗맞게 눌러도 아코디언이 열리지 않는다.
//
// 저장되는 값 · 계산은 이번 범위가 아니다(그 회귀는 기존 e2e가 본다). 여기서는 화면 동작만 본다.
/* global document, getComputedStyle, MouseEvent */
const { test, expect } = require('@playwright/test');
const { goToPortfolioSettingsTab } = require('./fixtures');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined'
    && typeof openTransactionModal === 'function'
    && typeof positionAnalysisAccordionOpen !== 'undefined');
}

const setDark = (page, dark) => page.locator('html').evaluate((el, d) => el.classList.toggle('dark', d), dark);

/* 거래 폼 상태를 한 번에 읽는다 - 보이는지(display:none 여부)를 기준으로 본다. */
const txSnapshot = (page) => page.evaluate(() => {
  const shown = (id) => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== 'none';
  };
  return {
    isin: shown('tx_bondIsinWrap'),
    isinInput: shown('tx_bondIsin'),
    lookupBtn: shown('txBondLookupBtn'),
    nameWrap: shown('tx_instrumentNameWrap'),
    nameLabel: document.getElementById('tx_nameLabelText').textContent.trim(),
    toggleWrap: shown('tx_manualEntryToggleWrap'),
    manual: document.getElementById('tx_manualEntryToggle').checked,
    manualDisabled: document.getElementById('tx_manualEntryToggle').disabled,
    nameReadOnly: document.getElementById('tx_name').readOnly,
    searchBtn: shown('txSearchStockBtn'),
    tickerHint: shown('tx_tickerHint'),
    bondDetails: shown('tx_bondFieldsWrap'),
    name: document.getElementById('tx_name').value
  };
});

const setAssetClass = (page, v) => page.evaluate((value) => {
  const el = document.getElementById('tx_assetClass');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, v);

/* ══════════════ #1 채권 ISIN 위치 ══════════════ */

test('#1-A. 자산군을 채권으로 바꾸면 종목 검색 UI 자리에 표준코드(ISIN) 칸이 나타난다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));

  let s = await txSnapshot(page);
  expect(s.isin, '처음에는 ISIN 칸이 없다').toBe(false);
  expect(s.searchBtn, '처음에는 종목 검색 버튼이 있다').toBe(true);

  await setAssetClass(page, '채권');
  s = await txSnapshot(page);
  expect(s.isin, '채권이면 ISIN 칸이 보인다').toBe(true);
  expect(s.isinInput && s.lookupBtn, '입력칸과 [조회] 버튼이 함께 온다').toBe(true);
  expect(s.searchBtn, '종목 검색 버튼은 사라진다').toBe(false);
  expect(s.tickerHint, '채권에는 티커 안내가 없다').toBe(false);
  expect(s.nameLabel, '이름칸은 채권명이 된다').toBe('채권명');
  expect(s.nameReadOnly, '채권명은 직접 적을 수 있다').toBe(false);
  expect(s.bondDetails, '발행조건 칸도 함께 나온다').toBe(true);

  // 화면에 보이는 순서: 자산군 -> ISIN -> 채권명 -> 장기 수익률 기준 -> 역할 -> 만기일
  const order = await page.evaluate(() => {
    const y = (id) => document.getElementById(id).getBoundingClientRect().top;
    return ['tx_assetClass', 'tx_bondIsin', 'tx_name', 'tx_rateMatchOverride', 'tx_role', 'tx_bondMaturityDate'].map(y);
  });
  for (let i = 1; i < order.length; i++) expect(order[i], `${i}번째가 앞 칸보다 아래에 있다`).toBeGreaterThan(order[i - 1]);
});

test('#1-B. 채권을 풀면 원래 종목 검색 UI로 돌아오고 빈 자리가 남지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  const formHeight = () => page.locator('#transactionForm').evaluate((el) => Math.round(el.getBoundingClientRect().height));

  const base = await formHeight();
  await setAssetClass(page, '채권');
  await setAssetClass(page, '주식');
  const s = await txSnapshot(page);
  expect(s.isin, 'ISIN 칸은 다시 사라진다').toBe(false);
  expect(s.searchBtn, '종목 검색 버튼이 돌아온다').toBe(true);
  expect(s.nameLabel).toBe('종목명/티커');
  expect(await formHeight(), '숨긴 자리가 빈 공간으로 남지 않는다(높이가 원래대로)').toBe(base);
});

test('#1-C. ISIN을 넣으면 기존 조회 흐름이 그대로 이어진다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  await setAssetClass(page, '채권');
  // 형식이 틀리면 형식 안내, 맞으면 "처음 보는 채권" 안내 - 둘 다 기존 applyKnownBondMasterToTxForm 경로다.
  await page.locator('#tx_bondIsin').fill('ZZ-NOT-ISIN');
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('12자리');
  await page.locator('#tx_bondIsin').fill('KR0000000ZZ1');
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('처음 보는 채권');
});

/* ══════════════ PM 결정 D-2 (2026-09-23) ══════════════
 * 「채권 조회」와 「채권명」을 나누고, 조회 영역을 채권명 바로 위에 둔다.
 * 조회가 되면 채권명이 자동으로 채워지고, 되지 않아도 직접 적어 저장할 수 있다. */

// 이 앱이 이미 아는 채권 하나를 원장에 넣는다(합성 데이터 - 실제 보유 채권이 아니다).
const ZZ_ISIN = 'KR0000000ZZ1';
const seedKnownBond = (page) => page.evaluate((isin) => {
  state.bondPositions = (state.bondPositions || []).filter((p) => (p.identity && p.identity.isin) !== isin);
  state.bondPositions.push({
    id: 'zz-e2e-bond', source: 'manual',
    identity: { isin, instrumentName: 'ZZ합성국고채 2030-06', bondType: 'GOVERNMENT', creditRating: 'AAA' },
    terms: { maturityDate: '2030-06-10', couponRate: 3.25, couponType: 'COUPON', paymentFrequency: 2 }
  });
}, ZZ_ISIN);

test('D-2-A. 채권 입력 순서가 자산군 → 채권 조회 → 채권명 → 장기 수익률 기준 → 역할 → 발행조건이다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  await setAssetClass(page, '채권');

  await expect(page.locator('#tx_bondLookupGroupLabel')).toHaveText('채권 조회');
  await expect(page.locator('#tx_nameLabelText')).toHaveText('채권명');
  // 조회에 쓰는 세 가지가 모두 「채권 조회」 묶음 안에 있다.
  for (const sel of ['#tx_bondIsin', '#txBondLookupBtn', '#tx_bondMasterNote']) {
    await expect(page.locator(`#tx_bondIsinWrap ${sel}`)).toHaveCount(1);
  }
  // 조회 결과가 채권명으로 간다는 것을 화면에서 말한다.
  await expect(page.locator('#tx_bondIsinWrap')).toContainText('채권명');

  const tops = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel).getBoundingClientRect().top;
    return {
      assetClass: y('#tx_assetClass'), lookup: y('#tx_bondLookupGroupLabel'), isin: y('#tx_bondIsin'),
      name: y('#tx_name'), rate: y('#tx_rateMatchOverride'), role: y('#tx_role'),
      maturity: y('#tx_bondMaturityDate'), coupon: y('#tx_bondCouponRate'), quantity: y('#tx_quantity')
    };
  });
  const order = ['assetClass', 'lookup', 'isin', 'name', 'rate', 'role', 'maturity'];
  for (let i = 1; i < order.length; i++) {
    expect(tops[order[i]], `${order[i]}가 ${order[i - 1]}보다 아래에 있다`).toBeGreaterThan(tops[order[i - 1]]);
  }
  // 만기일과 표면이율은 원래 같은 줄에 나란히 있는 2열이다 - 같은 높이를 허용한다.
  expect(tops.coupon, '표면이율은 만기일과 같은 줄이거나 그 아래다').toBeGreaterThanOrEqual(tops.maturity);
  expect(tops.quantity, '수량은 발행조건 다음이다').toBeGreaterThan(tops.coupon);
});

test('D-2-B. 조회되면 채권명과 발행조건이 자동으로 채워지고 저장된다', async ({ page }) => {
  await boot(page);
  await seedKnownBond(page);
  await page.evaluate(() => openTransactionModal(null));
  await setAssetClass(page, '채권');

  await page.locator('#tx_bondIsin').fill(ZZ_ISIN);
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_name')).toHaveValue('ZZ합성국고채 2030-06');
  await expect(page.locator('#tx_bondMaturityDate')).toHaveValue('2030-06-10');
  await expect(page.locator('#tx_bondCouponRate')).toHaveValue('3.25');
  await expect(page.locator('#tx_bondMasterNote')).toContainText('이미 등록된 채권');

  const before = await page.evaluate(() => state.transactions.length);
  await page.locator('#tx_accountType').fill('ZZ테스트계좌');
  await page.locator('#tx_quantity').fill('100');
  await page.locator('#tx_price').fill('10000');
  await page.locator('#txFormSubmitBtn').click();
  const saved = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
  expect(await page.evaluate(() => state.transactions.length)).toBe(before + 1);
  expect(saved.name, '조회된 채권명이 그대로 저장된다').toBe('ZZ합성국고채 2030-06');
  expect(saved.ticker, '표준코드가 거래의 ticker가 된다(BOND-05)').toBe(ZZ_ISIN);
});

test('D-2-C. 조회되지 않아도 채권명을 직접 적어 저장할 수 있다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  await setAssetClass(page, '채권');

  // 형식이 틀리면 형식 안내, 형식은 맞지만 모르는 코드면 "처음 보는 채권" 안내 - 둘 다 기존 문구다.
  await page.locator('#tx_bondIsin').fill('ZZ-BAD');
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('12자리');
  await page.locator('#tx_bondIsin').fill('KR0000000ZZ9');
  await page.locator('#tx_bondIsin').blur();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('처음 보는 채권');

  // 조회가 안 돼도 채권명은 직접 적을 수 있다(수동입력 토글과 무관하다).
  expect(await page.locator('#tx_manualEntryToggle').isChecked(), '수동입력은 OFF 그대로다').toBe(false);
  expect(await page.locator('#tx_name').evaluate((el) => el.readOnly)).toBe(false);

  const before = await page.evaluate(() => state.transactions.length);
  await page.locator('#tx_name').fill('ZZ장외사모채 직접입력');
  await page.locator('#tx_accountType').fill('ZZ테스트계좌');
  await page.locator('#tx_quantity').fill('100');
  await page.locator('#tx_price').fill('10000');
  await page.locator('#txFormSubmitBtn').click();
  const saved = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
  expect(await page.evaluate(() => state.transactions.length)).toBe(before + 1);
  expect(saved.name).toBe('ZZ장외사모채 직접입력');
  expect(saved.ticker).toBe('KR0000000ZZ9');
});

test('D-2-D. 채권명을 비우면 저장되지 않는다(기존 required 정책 유지)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  await setAssetClass(page, '채권');
  await page.locator('#tx_bondIsin').fill('KR0000000ZZ9');
  await page.locator('#tx_accountType').fill('ZZ테스트계좌');
  await page.locator('#tx_quantity').fill('100');
  await page.locator('#tx_price').fill('10000');
  const before = await page.evaluate(() => state.transactions.length);
  await page.locator('#txFormSubmitBtn').click();
  expect(await page.evaluate(() => state.transactions.length)).toBe(before);
});

test('D-2-E. 자산군을 오가도 이전 채권 상태가 다음 자산군으로 새어 나가지 않는다', async ({ page }) => {
  await boot(page);
  await seedKnownBond(page);
  await page.evaluate(() => openTransactionModal(null));

  for (const other of ['주식', 'ETF', '현금']) {
    await setAssetClass(page, '채권');
    await page.locator('#tx_bondIsin').fill(ZZ_ISIN);
    await page.locator('#tx_bondIsin').blur();
    await expect(page.locator('#tx_name')).toHaveValue('ZZ합성국고채 2030-06');

    await setAssetClass(page, other);
    const left = await txSnapshot(page);
    expect(left.isin, `${other} - ISIN UI 누출 없음`).toBe(false);
    expect(left.bondDetails, `${other} - 발행조건 누출 없음`).toBe(false);
    expect(left.name, `${other} - 이전 채권명 누출 없음`).toBe('');
    expect(left.manual, `${other} - 수동입력 상태 누출 없음`).toBe(false);
    expect(left.manualDisabled, `${other} - disabled 누출 없음`).toBe(false);
    expect(left.searchBtn, `${other} - 검색 UI 정상 복귀`).toBe(true);
    const leftValues = await page.evaluate(() => ({
      ticker: document.getElementById('tx_ticker').value,
      isin: document.getElementById('tx_bondIsin').value,
      maturity: document.getElementById('tx_bondMaturityDate').value,
      note: document.getElementById('tx_bondMasterNote').textContent.trim()
    }));
    expect(leftValues, `${other} - 이전 ISIN · 발행조건 · 안내문 누출 없음`).toEqual({ ticker: '', isin: '', maturity: '', note: '' });

    await setAssetClass(page, '채권');
    const back = await txSnapshot(page);
    expect(back.name, `${other} → 채권 재진입 - 빈 채권명에서 시작한다`).toBe('');
    expect(await page.locator('#tx_bondIsin').inputValue()).toBe('');
  }

  // 반대 방향도 본다 - 직접 입력한 종목명이 채권명으로 남지 않는다.
  await setAssetClass(page, '주식');
  await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#tx_name').fill('ZZ직접입력주식');
  await setAssetClass(page, '채권');
  const toBond = await txSnapshot(page);
  expect(toBond.name, '주식 → 채권 - 이전 종목명 누출 없음').toBe('');
  expect(toBond.manual, '주식 → 채권 - 수동입력 상태 누출 없음').toBe(false);
});

/* ══════════════ #2 수동입력 기본 OFF · 미승계 ══════════════ */

test('#2-A. 주식 · ETF · 채권 모두 수동입력은 기본 OFF다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  expect((await txSnapshot(page)).manual, '열자마자 OFF').toBe(false);
  for (const cls of ['주식', 'ETF', '채권']) {
    await setAssetClass(page, cls);
    const s = await txSnapshot(page);
    expect(s.manual, `${cls} - 기본 OFF`).toBe(false);
    expect(s.manualDisabled, `${cls} - 비활성화하지 않는다`).toBe(false);
  }
});

test('#2-B. 자산군을 오갈 때 이전 수동입력 상태를 승계하지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  const turnManualOn = async (name) => {
    await page.locator('#tx_manualEntryToggle').check();
    await page.locator('#tx_name').fill(name);
  };

  await setAssetClass(page, '주식');
  await turnManualOn('ZZ직접입력-주식');
  expect((await txSnapshot(page)).manual).toBe(true);

  await setAssetClass(page, 'ETF');
  let s = await txSnapshot(page);
  expect(s.manual, '주식에서 켠 상태가 ETF로 따라오지 않는다').toBe(false);
  expect(s.name, '수동으로 적어 둔 이름도 남지 않는다').toBe('');

  await turnManualOn('ZZ직접입력-ETF');
  await setAssetClass(page, '채권');
  s = await txSnapshot(page);
  expect(s.manual, 'ETF에서 켠 상태가 채권으로 따라오지 않는다').toBe(false);
  expect(s.toggleWrap, '채권에서는 체크박스 자체를 보여주지 않는다').toBe(false);
  expect(s.nameReadOnly, '그래도 채권명은 직접 적을 수 있다').toBe(false);

  await setAssetClass(page, '주식');
  s = await txSnapshot(page);
  expect(s.manual, '채권 다음 주식도 OFF에서 시작한다').toBe(false);
  expect(s.manualDisabled, '채권을 거쳤다고 잠기지 않는다').toBe(false);
  expect(s.toggleWrap, '체크박스가 다시 보인다').toBe(true);
  expect(s.nameReadOnly, '검색 모드로 돌아온다').toBe(true);
});

test('#2-C. 팝업을 닫았다 다시 열어도 OFF에서 시작한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openTransactionModal(null));
  await page.locator('#tx_manualEntryToggle').check();
  await page.evaluate(() => closeTransactionModal());
  await page.evaluate(() => openTransactionModal(null));
  expect((await txSnapshot(page)).manual).toBe(false);
});

/* ══════════════ #3 매크로 세부내용 팝업 ══════════════ */

const seedMacro = (page) => page.evaluate(() => {
  state.macroIndicatorCache = {
    VIX: { price: 22.3, changePercent: 4.1 }, UST10Y: { price: 4.25, changePercent: 1.2 },
    GOLD: { price: 2400, changePercent: 0.8 }, USDX: { price: 104.2, changePercent: 0.3 }
  };
  renderAll();
});

test('#3-A. 제목 우측 [세부내용] 버튼이 팝업을 열고, 카드 높이는 그대로다', async ({ page }) => {
  await boot(page);
  await seedMacro(page);
  const cardH = () => page.locator('#macroBriefingSection').evaluate((el) => Math.round(el.getBoundingClientRect().height));
  /* 위험 점수가 밀려났는지는 화면 좌표가 아니라 **카드와의 거리**로 본다 - 버튼을 누르면 브라우저가
   * 그 버튼을 보이게 스크롤하므로 화면 좌표는 팝업과 무관하게도 달라진다. */
  const riskGap = () => page.locator('#riskDiagnosisSummary').evaluate((el) => {
    const card = el.ownerDocument.getElementById('macroBriefingSection');
    return Math.round(el.getBoundingClientRect().top - card.getBoundingClientRect().top);
  });

  const h0 = await cardH();
  const gap0 = await riskGap();
  await expect(page.locator('#macroDetailModal')).toBeHidden();

  await page.locator('#macroDetailBtn').click();
  await expect(page.locator('#macroDetailModal')).toBeVisible();
  await expect(page.locator('#macroBriefingDiagnosis')).toContainText('시장 종합 평가');
  expect(await cardH(), '팝업은 카드 높이를 바꾸지 않는다').toBe(h0);
  expect(await riskGap(), '아래 위험 점수가 밀려나지 않는다').toBe(gap0);

  await page.locator('#closeMacroDetailBtn').click();
  await expect(page.locator('#macroDetailModal')).toBeHidden();
  expect(await cardH()).toBe(h0);
});

test('#3-B. 배경 탭 · 뒤로가기로도 닫히고, 다시 열 수 있다', async ({ page }) => {
  await boot(page);
  await seedMacro(page);
  const modal = page.locator('#macroDetailModal');

  await page.locator('#macroDetailBtn').click();
  await expect(modal).toBeVisible();
  await modal.click({ position: { x: 5, y: 5 } }); // 배경(오버레이) 탭
  await expect(modal).toBeHidden();

  await page.locator('#macroDetailBtn').click();
  await expect(modal).toBeVisible();
  await page.goBack();
  await expect(modal).toBeHidden();
  await expect(page.locator('#macroBriefingGrid'), '뒤로가기로 앱을 벗어나지 않는다').toBeVisible();

  await page.locator('#macroDetailBtn').click();
  await expect(modal).toBeVisible();
});

test('#3-C. 지표 10개는 팝업과 무관하게 항상 보인다', async ({ page }) => {
  await boot(page);
  await seedMacro(page);
  const tiles = () => page.locator('#macroBriefingGrid .macro-card').count();
  expect(await tiles()).toBe(10);
  await page.locator('#macroDetailBtn').click();
  await expect(page.locator('#macroDetailModal')).toBeVisible();
  expect(await tiles(), '팝업을 열어도 지표는 그대로 보인다').toBe(10);
  await expect(page.locator('#macroBriefingGrid')).toBeVisible();
});

/* ══════════════ #4 목표비중 아코디언 이벤트 독립성 ══════════════ */

const accordion = (page) => page.evaluate(() => ({
  husband: positionAnalysisAccordionOpen['신랑'],
  wife: positionAnalysisAccordionOpen['와이프']
}));
const closed = { husband: false, wife: false };

for (const owner of ['신랑', '와이프']) {
  test(`#4-A. ${owner} 비중조절 팝업을 열고 어떤 방법으로 닫아도 목표비중이 저절로 열리지 않는다`, async ({ page }) => {
    await boot(page);
    await goToPortfolioSettingsTab(page);
    const modal = page.locator('#rebalanceTargetModal');
    const open = () => page.locator(`[data-rebalance-detail-btn][data-owner="${owner}"]`).click();

    for (const closer of ['#closeRebalanceTargetModalBtn', '#cancelRebalanceTargetModalBtn', '#confirmRebalanceTargetModalBtn']) {
      await page.evaluate(() => { positionAnalysisAccordionOpen['신랑'] = false; positionAnalysisAccordionOpen['와이프'] = false; });
      await open();
      await expect(modal).toBeVisible();
      expect(await accordion(page), `${closer} - 팝업을 여는 것만으로 열리지 않는다`).toEqual(closed);
      await page.locator(closer).click();
      await expect(modal).toBeHidden();
      expect(await accordion(page), `${closer} 로 닫은 뒤에도 닫힌 채다`).toEqual(closed);
    }

    // 배경 탭 · 뒤로가기
    await page.evaluate(() => { positionAnalysisAccordionOpen['신랑'] = false; positionAnalysisAccordionOpen['와이프'] = false; });
    await open();
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).toBeHidden();
    expect(await accordion(page), '배경 탭으로 닫아도 닫힌 채다').toEqual(closed);

    await open();
    await expect(modal).toBeVisible();
    await page.goBack();
    await expect(modal).toBeHidden();
    expect(await accordion(page), '뒤로가기로 닫아도 닫힌 채다').toEqual(closed);
  });
}

test('#4-B. 버튼 줄 안쪽을 빗맞게 눌러도 아코디언이 열리지 않는다(빗맞은 탭이 진짜 원인이었다)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  await goToPortfolioSettingsTab(page);

  const probe = (dx) => page.evaluate((offset) => {
    positionAnalysisAccordionOpen['신랑'] = false;
    const row = document.getElementById('positionAnalysisAccordionHusbandBtn');
    const btn = row.querySelector('[data-rebalance-detail-btn]');
    const r = btn.getBoundingClientRect();
    const x = r.left + offset, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    return { opened: positionAnalysisAccordionOpen['신랑'] === true, inActions: !!el.closest('[data-rebalance-actions]') };
  }, dx);

  // 375px에서 [엑셀]과 [비중조절] 사이는 6px뿐이다 - 그 좁은 틈과 버튼 주변을 눌러 본다.
  for (const dx of [-2, -4, -6, -10, -20]) {
    const r = await probe(dx);
    expect(r.inActions, `버튼 줄 안쪽(${dx}px)이다`).toBe(true);
    expect(r.opened, `빗맞은 탭(${dx}px)이 아코디언을 열지 않는다`).toBe(false);
  }
});

test('#4-C. 제목을 직접 누르면 여전히 열린다(정상 경로는 그대로)', async ({ page }) => {
  await boot(page);
  await goToPortfolioSettingsTab(page);
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  expect(await accordion(page)).toEqual({ husband: true, wife: false });
  await page.locator('#positionAnalysisAccordionWifeBtn h3').click();
  expect(await accordion(page), '서로의 상태를 바꾸지 않는다').toEqual({ husband: true, wife: true });
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  expect(await accordion(page)).toEqual({ husband: false, wife: true });
});

test('#4-D. 신랑을 펼쳐 둔 채 와이프 비중조절을 열고 닫아도 서로 영향이 없다', async ({ page }) => {
  await boot(page);
  await goToPortfolioSettingsTab(page);
  await page.locator('#positionAnalysisAccordionHusbandBtn h3').click();
  expect(await accordion(page)).toEqual({ husband: true, wife: false });
  await page.locator('[data-rebalance-detail-btn][data-owner="와이프"]').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeVisible();
  await page.locator('#cancelRebalanceTargetModalBtn').click();
  await expect(page.locator('#rebalanceTargetModal')).toBeHidden();
  expect(await accordion(page), '신랑은 펼친 그대로, 와이프는 닫힌 그대로').toEqual({ husband: true, wife: false });
});

/* ══════════════ 반응형 · 라이트/다크 ══════════════ */

for (const w of [375, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`반응형. ${w}px ${dark ? 'Dark' : 'Light'} - 네 화면이 잘리거나 넘치지 않고 44px · 14px을 지킨다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await setDark(page, dark);
      await seedMacro(page);

      // #3 제목 줄 - 한 줄에 들어가고, 버튼은 14px · 44px 터치다.
      const macro = await page.locator('#macroDetailBtn').evaluate((btn) => {
        const win = btn.ownerDocument.defaultView;
        const span = btn.querySelector('span');
        const h4 = btn.parentElement.querySelector('h4');
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(win.getComputedStyle(el).lineHeight));
        return {
          font: parseFloat(win.getComputedStyle(span).fontSize),
          tap: Math.max(btn.getBoundingClientRect().height, parseFloat(win.getComputedStyle(btn, '::after').height) || 0),
          titleLines: lines(h4), labelLines: lines(span)
        };
      });
      expect(macro.font).toBeGreaterThanOrEqual(14);
      expect(macro.tap).toBeGreaterThanOrEqual(44);
      expect(macro, '제목과 [세부내용]이 한 줄에 들어간다').toMatchObject({ titleLines: 1, labelLines: 1 });

      // #3 팝업 - 가로 넘침 없음, 안쪽 글자 14px 이상.
      await page.locator('#macroDetailBtn').click();
      await expect(page.locator('#macroDetailModal')).toBeVisible();
      const modal = await page.locator('#macroBriefingDiagnosis').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const sizes = [...el.querySelectorAll('div,p,span,li')]
          .filter((n) => !n.children.length && n.textContent.trim())
          .map((n) => parseFloat(win.getComputedStyle(n).fontSize));
        const box = el.parentElement;
        return {
          minFont: sizes.length ? Math.min(...sizes) : null,
          reachable: box.scrollHeight >= Math.round(el.getBoundingClientRect().height) - 1,
          pageOverflowX: el.ownerDocument.documentElement.scrollWidth > el.ownerDocument.documentElement.clientWidth
        };
      });
      expect(modal.minFont).toBeGreaterThanOrEqual(14);
      expect(modal.reachable, '긴 내용도 팝업 안에서 전부 닿는다').toBe(true);
      expect(modal.pageOverflowX).toBe(false);
      await page.locator('#closeMacroDetailBtn').click();

      // #1 채권 ISIN 칸 - 터치 높이와 가로 넘침.
      await page.evaluate(() => openTransactionModal(null));
      await setAssetClass(page, '채권');
      const isin = await page.locator('#tx_bondIsin').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        return {
          h: Math.round(el.getBoundingClientRect().height),
          font: parseFloat(win.getComputedStyle(el).fontSize),
          rowOverflow: el.parentElement.scrollWidth - el.parentElement.clientWidth
        };
      });
      expect(isin.font).toBeGreaterThanOrEqual(14);
      expect(isin.h).toBeGreaterThanOrEqual(36);
      expect(isin.rowOverflow).toBeLessThanOrEqual(1);
      const lookupTap = await page.locator('#txBondLookupBtn').evaluate((el) => Math.round(el.getBoundingClientRect().height));
      expect(lookupTap).toBeGreaterThanOrEqual(36);
      await page.evaluate(() => closeTransactionModal());

      const bodyOverflow = await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(bodyOverflow).toBeLessThanOrEqual(1);
    });
  }
}
