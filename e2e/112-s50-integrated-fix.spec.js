/* global document, window, getComputedStyle, XLSX */
// E2E-112 [§50 통합 수정 검증] ticker 의미 과적재 제거 · 통화 무결성 · 채권 평가 일원화 · Beta 분리
//
// 개별 Unit은 조각을 고정한다. 이 파일은 **실제 화면과 실제 저장 경로로** 끝에서 끝까지 본다:
//   종목 식별 → 거래 입력 → BUY → 추가 BUY → 부분매도 → 삭제/재계산 → Position → Asset →
//   Bond Risk → 시장가 평가 → Portfolio Risk → Market Beta → Tracking Beta → MC
//
// [실제 사용자 데이터 미사용] 전부 ZZ 합성이다. KIS · Yahoo를 실제로 부르지 않는다
// (window.fetch를 이 페이지 안에서만 감싼다 - playwright.config.js의 DNS 차단과 함께 이중 격리).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ISIN = 'KRZZ00000001';
const OWNER = '신랑';
const ACC = 'ZZ채권계좌';

const PRICE_OK = {
  rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.', fetchedAt: 1700000000000,
  output: { stnd_iscd: ISIN, hts_kor_isnm: 'ZZ합성국고', bond_prpr: '6785.00', bond_prdy_clpr: '6782.00', ernn_rate: '3.600' },
  output2: null
};

async function stubKisPrice(page) {
  await page.addInitScript((price) => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String((input && input.url) || input || '');
      if (url.includes('/api/kis/bond-price')) {
        return Promise.resolve(new Response(JSON.stringify(price), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/api/kis/')) {
        return Promise.resolve(new Response('{"error":"upstream_error"}', { status: 502, headers: { 'Content-Type': 'application/json' } }));
      }
      return real(input, init);
    };
  }, PRICE_OK);
}

/** 거래원장 기반 합성 채권 하나를 화면 밖에서 심는다(폼 입력은 아래 별도 테스트가 다룬다). */
async function seedBond(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof syncAssetsFromTransactions === 'function');
  await page.evaluate(({ isin, owner, acc }) => {
    state.assets = []; state.transactions = []; state.bondPositions = [];
    const a = makeAsset({
      ticker: isin, name: 'ZZ국고채권(합성)', owner, accountType: acc, category: '채권',
      currency: 'KRW', quantity: 0, buyPrice: 0, currentPrice: 0, positionSource: 'ledger'
    });
    state.assets.push(a);
    state.bondPositions.push(makeBondPosition({
      assetId: a.id,
      identity: { isin, instrumentName: 'ZZ국고채권(합성)', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
      terms: { issueDate: '2024-01-10', maturityDate: '2034-01-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
      holding: { owner, account: acc }
    }));
    persistAssets(); persistTransactions(); persistBondPositions();
  }, { isin: ISIN, owner: OWNER, acc: ACC });
}

/* ══ 1. 전체 흐름: 매수 → 추가매수 → 부분매도 → 삭제/재계산 ═══════════════ */

test('§50-1 거래 전 구간에서 채권 평가가 거래원장을 따라간다(첫 거래가 고정 없음)', async ({ page }) => {
  await seedBond(page);
  const steps = await page.evaluate(({ isin, owner, acc }) => {
    const tx = (o) => Object.assign({ owner, accountType: acc, ticker: isin, name: 'ZZ국고채권(합성)', currency: 'KRW', fee: 0, type: 'buy', createdAt: Date.now(), updatedAt: Date.now() }, o);
    const snap = (label) => {
      const a = state.assets[0]; const r = calcRow(a);
      return { label, 수량: a.quantity, 평단: +a.buyPrice.toFixed(4), 저장현재가: +Number(a.currentPrice).toFixed(4),
        런타임단가: +r.unitPrice.toFixed(4), 평가금액: Math.round(r.curAmount), source: r.valuationSource };
    };
    const out = [];
    state.transactions.push(tx({ id: 'b1', date: '2025-03-10', quantity: 3000, price: 6808 }));
    syncAssetsFromTransactions(); out.push(snap('① 최초 매수'));
    state.transactions.push(tx({ id: 'b2', date: '2025-06-11', quantity: 2000, price: 6900 }));
    syncAssetsFromTransactions(); out.push(snap('② 추가 매수'));
    state.transactions.push(tx({ id: 's1', date: '2025-08-01', type: 'sell', quantity: 1000, price: 6950 }));
    syncAssetsFromTransactions(); out.push(snap('③ 부분 매도'));
    state.transactions = state.transactions.filter((t) => t.id !== 'b2');
    syncAssetsFromTransactions(); out.push(snap('④ 거래 삭제'));
    syncAssetsFromTransactions({ auto: true }); out.push(snap('⑤ 부팅 재계산'));
    return out;
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  // 저장값과 런타임 단가가 항상 같고(둘 다 거래원장 가중평균), 첫 거래가(6808)에 굳지 않는다.
  expect(steps[0].런타임단가).toBe(6808);
  expect(steps[1].런타임단가).toBe(6844.8);
  expect(steps[1].저장현재가).toBe(6844.8);
  expect(steps[2].수량).toBe(4000);
  expect(steps[2].런타임단가).toBe(6844.8); // 매도는 평단을 바꾸지 않는다(이동평균법 · 기존 정책)
  expect(steps[3].런타임단가).toBe(6808);   // b2를 지우면 남은 거래 기준으로 되돌아간다
  expect(steps[4].런타임단가).toBe(6808);   // 부팅 재계산이 옛 값을 되살리지 않는다
  steps.forEach((s) => expect(s.source).toBe('PURCHASE'));
});

/* ══ 2. 자산 화면 ↔ Bond Risk 평가 일치 (감사 A-02) ═════════════════════ */

test('§50-2 시장가가 들어오면 자산 화면과 「채권 위험」이 같은 금액을 쓴다 · 시세는 저장하지 않는다', async ({ page }) => {
  await stubKisPrice(page);
  await seedBond(page);
  const r = await page.evaluate(async ({ isin, owner, acc }) => {
    state.transactions.push({ id: 'b1', date: '2025-03-10', type: 'buy', owner, accountType: acc, ticker: isin,
      name: 'ZZ국고채권(합성)', quantity: 7066, price: 6861.0859, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now() });
    syncAssetsFromTransactions();
    const before = calcRow(state.assets[0]);
    await getBondQuote(isin);                 // KIS(스텁) 시세를 메모리에 올린다
    const quotes = getCachedBondQuotes();
    const ledger = computePositionsAndRealizedPnL().positions;
    const after = calcRow(state.assets[0]);
    const summary = computeBondRiskSummary(state.bondPositions, { positions: ledger, quotes });
    return {
      before: { 금액: Math.round(before.curAmount), source: before.valuationSource },
      after: { 단가: after.unitPrice, 금액: Math.round(after.curAmount), source: after.valuationSource },
      bondRisk: { 금액: Math.round(summary.rows[0].amount), source: summary.rows[0].valuationSource, 기준액면: summary.rows[0].priceBasisFace },
      저장된현재가: state.assets[0].currentPrice,
      // 시세가 어떤 저장소에도 들어가지 않았는지 확인한다(PD-08).
      로컬저장소에시세: JSON.stringify(state.assets).includes('6785') || JSON.stringify(state.bondPositions).includes('6785')
    };
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  expect(r.before.source).toBe('PURCHASE');
  expect(r.after.source).toBe('MARKET');
  expect(r.after.단가).toBe(6785);
  expect(r.bondRisk.source).toBe('MARKET');
  expect(r.bondRisk.기준액면).toBe(10000);
  expect(r.after.금액).toBe(r.bondRisk.금액);      // 두 화면이 같은 숫자를 쓴다
  expect(r.after.금액).toBe(47942810);
  expect(Math.round(r.저장된현재가)).toBe(6861);    // 저장값은 매입원가 그대로
  expect(r.로컬저장소에시세).toBe(false);
});

/* ══ 3. 통화 무결성 - 실제 거래 폼 저장 경로 (감사 D-01) ══════════════════ */

test('§50-3 기존 채권을 검색으로 골라도 통화가 USD로 바뀌지 않고, USD 저장은 차단된다', async ({ page }) => {
  await seedBond(page);
  const r = await page.evaluate(({ owner }) => {
    const toasts = [];
    const orig = window.showToast;
    window.showToast = (m) => toasts.push(String(m));
    const fire = () => document.getElementById('transactionForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const setV = (o) => Object.entries(o).forEach(([k, v]) => { const e = document.getElementById(k); if (e) e.value = v; });
    const reset = () => {
      document.getElementById('tx_id').value = ''; document.getElementById('tx_ticker').value = '';
      document.getElementById('tx_bondIsin').value = '';
      const c = document.getElementById('tx_assetClass'); c.value = ''; delete c.dataset.autofilled;
      document.getElementById('tx_currency').value = 'KRW'; updateTxBondFieldsUI();
    };
    const out = {};

    // ① 자산군 '자동' + 종목 검색으로 기존 ISIN 채권 선택
    reset();
    const hit = searchLocalHoldings('ZZ국고', true)[0];
    out.검색결과 = { symbol: hit.symbol, currency: hit.currency, category: hit.category, accountType: hit.accountType };
    applyStockPickToTransactionForm(hit.symbol, hit.name, hit.owner, hit.accountType, hit.currency, { category: hit.category });
    out.선택직후 = {
      통화: document.getElementById('tx_currency').value,
      계좌구분: document.getElementById('tx_accountType').value,
      자산군: document.getElementById('tx_assetClass').value,
      ISIN: document.getElementById('tx_bondIsin').value,
      환율칸보임: !document.getElementById('tx_appliedRateWrap').classList.contains('hidden')
    };

    // ② 그대로 KRW 저장 → 성공
    setV({ tx_date: '2026-02-01', tx_type: 'buy', tx_owner: owner, tx_quantity: '100', tx_price: '6800', tx_fee: '0' });
    toasts.length = 0; fire();
    out.KRW저장 = { 거래수: state.transactions.length, toast: toasts.slice(), 통화: (state.transactions[0] || {}).currency };

    // ③ 통화만 USD로 바꿔 저장 시도 → 차단
    document.getElementById('tx_id').value = '';
    document.getElementById('tx_currency').value = 'USD';
    setV({ tx_date: '2026-02-02', tx_quantity: '50', tx_price: '6800' });
    toasts.length = 0; fire();
    out.USD차단 = { 거래수: state.transactions.length, toast: toasts.slice() };

    // ④ 저장된 자산 상태
    const a = state.assets[0];
    out.자산 = { currency: a.currency, isDomestic: a.isDomestic, category: a.category, quantity: a.quantity };
    window.showToast = orig;
    return out;
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  expect(r.검색결과.currency).toBe('KRW');          // 보유 자산의 확정 통화가 검색 결과에 실려 온다
  expect(r.검색결과.accountType).toBe(ACC);
  expect(r.선택직후.통화).toBe('KRW');               // ticker 문자열로 재추론하지 않는다
  expect(r.선택직후.계좌구분).toBe(ACC);             // 기존 보유분의 계좌를 이어받는다
  expect(r.선택직후.자산군).toBe('채권');
  expect(r.선택직후.ISIN).toBe(ISIN);
  expect(r.선택직후.환율칸보임).toBe(false);
  expect(r.KRW저장.거래수).toBe(1);
  expect(r.KRW저장.통화).toBe('KRW');
  expect(r.USD차단.거래수).toBe(1);                  // 저장되지 않았다
  expect(r.USD차단.toast.join(' ')).toContain('통화가 맞지 않아 저장하지 않았습니다');
  expect(r.자산).toEqual({ currency: 'KRW', isDomestic: '국내', category: '채권', quantity: 100 });
});

test('§50-4 통화가 섞인 거래는 포지션이 갈라지고, 화면이 그 사실을 알린다(자동 변환 없음)', async ({ page }) => {
  await seedBond(page);
  const r = await page.evaluate(({ isin, owner, acc }) => {
    const tx = (o) => Object.assign({ owner, accountType: acc, ticker: isin, name: 'ZZ국고채권(합성)', fee: 0, type: 'buy', createdAt: Date.now(), updatedAt: Date.now() }, o);
    state.transactions.push(tx({ id: 'k1', date: '2025-03-10', quantity: 3000, price: 6808, currency: 'KRW' }));
    state.transactions.push(tx({ id: 'u1', date: '2026-01-10', quantity: 2000, price: 6900, currency: 'USD', appliedRate: 1372.23 }));
    syncAssetsFromTransactions();
    const keys = Object.keys(computePositionsAndRealizedPnL().positions).sort();
    const krwAsset = state.assets.find((a) => a.currency === 'KRW');
    return {
      keys,
      탐지: detectInstrumentIntegrityIssues(krwAsset).map((i) => ({ code: i.code, grade: i.grade })),
      채권레코드수: state.bondPositions.length,
      원장통화: state.transactions.map((t) => t.currency).sort()
    };
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  expect(r.keys).toEqual([`${OWNER}__${ACC}__${ISIN}__KRW`, `${OWNER}__${ACC}__${ISIN}__USD`]);
  expect(r.탐지.map((x) => x.code)).toContain('LEDGER_CURRENCY_CONFLICT');
  expect(r.탐지.every((x) => x.grade === 'REVIEW')).toBe(true);
  expect(r.원장통화).toEqual(['KRW', 'USD']);        // 값을 자동으로 고치지 않았다
  expect(r.채권레코드수).toBe(1);
});

/* ══ 4. 채권 상세에 주식 전용 기능이 붙지 않는다 (감사 B-03) ═══════════════ */

test('§50-5 채권 상세에 주식 분석 · 재무 · 리스크 진단 섹션이 붙지 않는다', async ({ page }) => {
  await seedBond(page);
  await page.evaluate(({ isin, owner, acc }) => {
    state.transactions.push({ id: 'b1', date: '2025-03-10', type: 'buy', owner, accountType: acc, ticker: isin,
      name: 'ZZ국고채권(합성)', quantity: 1000, price: 6800, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now() });
    syncAssetsFromTransactions();
    openAssetDetailModal(state.assets[0].id);
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  await expect(page.locator('#assetDetailModal')).toBeVisible();
  // 세 섹션 모두 숨김이다("티커를 확인해 주세요" 같은 잘못된 안내가 나올 자리 자체를 없앴다).
  for (const id of ['assetDetailAnalysisSection', 'assetDetailFundamentalSection', 'assetDetailRiskSection']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await expect(page.locator('#assetDetailModal')).not.toContainText('티커를 확인해 주세요');
  await expect(page.locator('#assetDetailModal')).not.toContainText('잠시 후 다시 열어 보세요');
  // 차트 자리에는 채권에 맞는 설명이 나온다.
  await expect(page.locator('#assetDetailChartMsg')).toContainText('채권은 주가 차트 대상이 아닙니다');
  // 평가 기준을 화면이 그대로 말한다.
  await expect(page.locator('#assetDetailInfoGrid')).toContainText('매입원가');
  await expect(page.locator('#assetDetailPositionNotice')).toContainText('매입원가로 계산');
  await expect(page.locator('#assetDetailPositionNotice')).not.toContainText('직접 입력한 값');
});

/* ══ 5. Market Beta / Tracking Beta 분리 (PD-15) ═══════════════════════ */

test('§50-6 위험점수는 Market Beta를 쓰고, 기초지수 추적 베타는 따로 표시된다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof computeAdvancedRiskMetrics === 'function');
  const r = await page.evaluate(async () => {
    state.assets = []; state.transactions = []; state.bondPositions = [];
    state.assets.push(makeAsset({ ticker: '069500.KS', name: 'ZZ국내ETF', owner: '신랑', accountType: '일반계좌',
      category: 'ETF', currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 35000, currentPrice: 35000 }));
    const m = await computeAdvancedRiskMetrics();
    if (!m) return { none: true };
    const h = m.holdings[0];
    return {
      betaDefinition: m.betaDefinition,
      market: { key: h.benchmarkKey, source: h.benchmarkSource },
      tracking: { key: h.trackingBenchmarkKey, priceSource: h.trackingBenchmarkPriceSource },
      hasTrackingAggregate: Object.prototype.hasOwnProperty.call(m, 'portfolioTrackingBeta')
    };
  });
  expect(r.none).toBeFalsy();
  expect(r.betaDefinition).toBe('MARKET');
  expect(r.market.key).toBe('KOSPI');                 // 상장 시장 지수
  expect(r.market.source).toBe('listingMarket');
  expect(r.tracking.key).toBe('KOSPI200_PR');         // 공식 기초지수는 그대로 보존
  expect(r.tracking.priceSource).toBe('UNAVAILABLE'); // 그 지수의 가격 원천은 없다(임의 대체 없음)
  expect(r.hasTrackingAggregate).toBe(true);
});

/* ══ 6. MC · 총자산까지의 downstream ════════════════════════════════════ */

test('§50-7 채권 평가가 총자산 · MC 초기자본까지 같은 값으로 흐른다', async ({ page }) => {
  await seedBond(page);
  const r = await page.evaluate(({ isin, owner, acc }) => {
    state.transactions.push({ id: 'b1', date: '2025-03-10', type: 'buy', owner, accountType: acc, ticker: isin,
      name: 'ZZ국고채권(합성)', quantity: 7066, price: 6861.0859, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now() });
    syncAssetsFromTransactions();
    const row = calcRow(state.assets[0]);
    return {
      자산평가: Math.round(row.curAmount),
      curKRW: Math.round(row.curKRW),
      총자산: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
      MC초기자본: Math.round(computeHouseholdMonteCarloPV())
    };
  }, { isin: ISIN, owner: OWNER, acc: ACC });
  expect(r.curKRW).toBe(r.자산평가);      // [감사 A-03] curKRW가 실제로 존재한다
  expect(r.총자산).toBe(r.자산평가);
  expect(r.MC초기자본).toBe(r.자산평가);  // 같은 평가가 MC 입력까지 그대로 간다
});

/* ══ 7. 화면 - 375px · 다크모드 ════════════════════════════════════════ */

test('§50-8 375px · 다크모드에서 채권 상세가 가로 스크롤 없이 읽힌다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seedBond(page);
  await page.evaluate(({ isin, owner, acc }) => {
    document.documentElement.classList.add('dark');
    state.transactions.push({ id: 'b1', date: '2025-03-10', type: 'buy', owner, accountType: acc, ticker: isin,
      name: 'ZZ국고채권(합성)', quantity: 1000, price: 6800, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now() });
    syncAssetsFromTransactions();
    openAssetDetailModal(state.assets[0].id);
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  await expect(page.locator('#assetDetailModal')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // 다크모드에서 안내 문구가 배경에 묻히지 않는다(색이 실제로 적용됐는지만 확인).
  const noticeColor = await page.evaluate(() => {
    const el = document.querySelector('#assetDetailPositionNotice p');
    return el ? getComputedStyle(el).color : null;
  });
  expect(noticeColor).toBeTruthy();
  await expect(page.locator('#assetDetailInfoGrid')).toContainText('현재가');
});

/* ══ 8. 엑셀 왕복에서 채권 identity 보존 (PD-11 · 감사 J-02) ═══════════════ */

test('§50-9 엑셀 가져오기로 자산 id가 새로 발급돼도 채권 발행조건이 ISIN으로 다시 이어진다', async ({ page }) => {
  await seedBond(page);
  await page.evaluate(({ isin, owner, acc }) => {
    state.transactions.push({ id: 'b1', date: '2025-03-10', type: 'buy', owner, accountType: acc, ticker: isin,
      name: 'ZZ국고채권(합성)', quantity: 1000, price: 6800, currency: 'KRW', fee: 0, createdAt: Date.now(), updatedAt: Date.now() });
    syncAssetsFromTransactions(); persistAssets(); persistTransactions();
  }, { isin: ISIN, owner: OWNER, acc: ACC });

  const before = await page.evaluate(() => ({
    assetId: state.assets[0].id, linked: state.bondPositions[0].assetId, bondCount: state.bondPositions.length
  }));
  expect(before.linked).toBe(before.assetId);

  /* 사용자가 내려받은 자산 엑셀에서 **id 칸을 비운 채** 다시 올리는 상황을 그대로 만든다 -
   * 채권 identity가 왕복에서 살아남는지 보는 것이 목적이다(PD-11).
   * 현재가를 6,900으로 바꿔 두면 "가져오기가 실제로 실행됐다"를 결과로 확인할 수 있다. */
  const base64 = await page.evaluate((isin) => {
    const rows = [{
      ticker: isin, 소유자: '신랑', 계좌구분: 'ZZ채권계좌', 종목명: 'ZZ국고채권(합성)',
      '국내/해외': '국내', 통화: 'KRW', 수량: 1000, 매수단가: 6800,
      '자산군(자동분류)': '채권', 현재가: 6900, '대표매칭(수익률연동키)': 'BOND', id: ''   // ← id를 비운다
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '자산목록');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, ISIN);
  const filePath = path.join(os.tmpdir(), `e2e112-${Date.now()}.xlsx`);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

  // 파일 입력은 "데이터 관리" 모달 안에 있고 숨김이다 - 모달을 여는 것은 이 테스트의 관심사가
  // 아니므로 change 이벤트를 그대로 일으키는 setInputFiles만 쓴다(핸들러는 동일하다).
  await page.locator('#excelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  // [덮어쓰기]는 되돌릴 수 없어 confirm()을 한 번 더 띄운다 - Playwright 기본은 자동 취소이므로 받아준다.
  page.once('dialog', (d) => d.accept());
  await page.locator('#importChoiceOverwriteBtn').click();
  await expect(page.locator('#importChoiceModal')).toBeHidden();
  // 가져오기 핸들러는 비동기다 - 반영이 끝난 것을 값으로 확인한 뒤 읽는다.
  await page.waitForFunction(() => state.assets.length === 1 && state.assets[0].rateMatchOverride === 'BOND', null, { timeout: 10000 });

  const after = await page.evaluate(() => {
    const a = state.assets[0]; const p = state.bondPositions[0];
    return {
      assetId: a.id, ticker: a.ticker, currency: a.currency, category: a.category, isDomestic: a.isDomestic,
      currentPrice: Number(a.currentPrice), rateMatchOverride: a.rateMatchOverride || null,
      bondCount: state.bondPositions.length, linked: p.assetId,
      isin: p.identity.isin, bondType: p.identity.bondType, maturity: p.terms.maturityDate, bondCcy: p.identity.currency,
      orphan: state.bondPositions.filter((x) => !state.assets.some((y) => y.id === x.assetId)).length
    };
  });
  expect(after.rateMatchOverride).toBe('BOND');     // 가져오기가 실제로 실행됐다(원장 재계산이 건드리지 않는 칸으로 확인)
  expect(after.bondCount).toBe(1);                 // 발행조건이 사라지지 않았다
  expect(after.orphan).toBe(0);                    // 고아가 생기지 않았다(PD-11의 요구)
  expect(after.linked).toBe(after.assetId);        // 자산과 정확히 이어져 있다
  expect(after.isin).toBe(ISIN);
  expect(after.bondType).toBe('국채');
  expect(after.maturity).toBe('2034-01-10');
  expect(after.bondCcy).toBe('KRW');
  expect(after.currency).toBe('KRW');
  expect(after.isDomestic).toBe('국내');           // ISIN이 '해외'로 뒤집히지 않는다
  expect(after.category).toBe('채권');

  fs.unlinkSync(filePath);
});
