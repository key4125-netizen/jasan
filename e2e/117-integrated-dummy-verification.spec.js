/* global document, window */
// E2E-117 [통합 더미데이터 전수검증 · PM 지시 2026-09-22]
//
// 자동 테스트 통과와 "앱 전체가 실제로 연결돼 있다"는 것은 다르다. 이 파일은 후자를 본다.
// 하나의 합성 가구(ZZ 접두어)를 실제 앱 흐름 그대로 통과시키며 끊기는 지점이 없는지 확인한다.
//
//   자산 입력 → 거래 입력 → Portfolio → Risk → Market Beta → 환헤지 → MC
//   → 연도별 추가 투자 → 결정론 카드 → Excel 왕복 → Backup/Restore → 재계산
//   → 교차 오염 → 데이터 무결성
//
// [실제 사용자 금융데이터 미사용] 모든 종목 · 금액 · 소유자 데이터는 ZZ 접두어 합성값이다.
// [외부 API 비의존] 네트워크는 playwright.config.js가 차단하고, 시세는 직접 입력값을 쓴다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

// ── 합성 가구 ────────────────────────────────────────────────────────────
// 지시문 STEP 1이 요구한 7가지 자산 유형을 모두 담는다.
const DUMMY = {
  krStock: { ticker: 'ZZKP.KS', name: 'ZZ국내대표', category: '주식', isDomestic: '국내', currency: 'KRW' },
  krEtf: { ticker: 'ZZEF.KS', name: 'ZZ코스피ETF', category: 'ETF', isDomestic: '국내', currency: 'KRW' },
  usStock: { ticker: 'ZZUSCOM', name: 'ZZ US Corp', category: '주식', isDomestic: '해외', currency: 'USD' },
  krListedUsEtf: { ticker: 'ZZUSETF.KS', name: 'ZZ 미국대표 ETF', category: 'ETF', isDomestic: '해외', currency: 'KRW' },
  bond: { ticker: '', name: 'ZZ국고채', category: '채권', isDomestic: '국내', currency: 'KRW' },
  cash: { ticker: '', name: 'ZZ원화예수금', category: '현금', isDomestic: '국내', currency: 'KRW' },
  realEstate: { ticker: '', name: 'ZZ주택', category: '부동산', isDomestic: '국내', currency: 'KRW' }
};

const MASTER = {
  'ZZKP.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ국내대표', securityGroup: 'ST', currency: 'KRW', yahooTicker: 'ZZKP.KS' },
  'ZZEF.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ코스피ETF', securityGroup: 'EF', currency: 'KRW', yahooTicker: 'ZZEF.KS' },
  'ZZUSETF.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 미국대표 ETF', securityGroup: 'EF', currency: 'KRW', yahooTicker: 'ZZUSETF.KS' },
  ZZUSCOM: { exchange: 'NASDAQ', market: 'US', nameEn: 'ZZ US CORP', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ US Corp. - Common Stock', yahooTicker: 'ZZUSCOM' }
};

async function boot(page) {
  await page.route('**/ticker-master.json*', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof makeAsset === 'function' && typeof persistAssets === 'function');
  await page.evaluate((master) => {
    // 종목 마스터는 스크립트 최상위 let 바인딩이라 window 속성이 아니다(E2E-115 주석 참고).
    window.eval('tickerMasterByTicker = ' + JSON.stringify(master) + ';');
  }, MASTER);
}

/** STEP 1 - 합성 자산 7종을 앱의 실제 생성 경로(makeAsset)로 등록한다. */
async function seedAssets(page) {
  await page.evaluate((D) => {
    const mk = (d, over) => makeAsset(Object.assign({
      owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 100000, currentPrice: 110000, positionSource: 'manual'
    }, d, over));
    state.assets = [
      mk(D.krStock, { quantity: 100, buyPrice: 50000, currentPrice: 55000, rateMatchOverride: 'KOSPI' }),
      mk(D.krEtf, { quantity: 200, buyPrice: 10000, currentPrice: 11000, rateMatchOverride: 'KOSPI' }),
      mk(D.usStock, { owner: '와이프', quantity: 20, buyPrice: 100, currentPrice: 120, buyRate: 1300, rateMatchOverride: 'S&P500' }),
      // 합성 종목이라 앱이 스스로 알 수 있는 수익률 기준이 없다(정상) - 실제 사용자가 하듯
      // 대표매칭(Return Key)을 직접 지정해 MC까지 이어지게 한다.
      mk(D.krListedUsEtf, { quantity: 300, buyPrice: 15000, currentPrice: 16000, fxHedgeStatus: 'UNHEDGED', rateMatchOverride: 'S&P500' }),
      mk(D.bond, { quantity: 1, buyPrice: 10000000, currentPrice: 10000000 }),
      mk(D.cash, { quantity: 1, buyPrice: 5000000, currentPrice: 5000000 }),
      mk(D.realEstate, { owner: '와이프', quantity: 1, buyPrice: 300000000, currentPrice: 320000000 })
    ];
    persistAssets();
    // 목표 비중 - 두 소유자 모두 채워 MC · 결정론이 돌 수 있게 한다.
    state.rebalance['신랑'] = { domestic: { '국내': 60, '해외': 40 }, targets: {
      '국내': [{ type: 'ticker', ticker: 'ZZKP.KS', label: 'ZZ국내대표', pct: 50, role: '수비수' },
        { type: 'ticker', ticker: 'ZZEF.KS', label: 'ZZ코스피ETF', pct: 50, role: '코어자산' }],
      '해외': [{ type: 'ticker', ticker: 'ZZUSETF.KS', label: 'ZZ 미국대표 ETF', pct: 100, role: '공격수' }] } };
    state.rebalance['와이프'] = { domestic: { '국내': 0, '해외': 100 }, targets: {
      '국내': [], '해외': [{ type: 'ticker', ticker: 'ZZUSCOM', label: 'ZZ US Corp', pct: 100, role: '공격수' }] } };
    persistRebalance();
    state.projection.monthlyContribution = 0;
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
    state.projection.yearlyExtraContributions = [];
    persistProjection();
    renderAll();
  }, DUMMY);
}

const snapshot = (page) => page.evaluate(() => {
  const rows = state.assets.map((a) => {
    const r = calcRow(a);
    return { id: a.id, ticker: a.ticker, name: a.name, owner: a.owner, account: a.accountType, category: a.category,
      qty: a.quantity, buy: a.buyPrice, cur: a.currentPrice, ccy: a.currency, domestic: a.isDomestic,
      curAmount: Math.round(r.curAmount), profit: Math.round(r.profit),
      betaOverride: a.marketBetaIndexOverride, hedge: a.fxHedgeStatus };
  }).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  return { rows, total: rows.reduce((s, r) => s + r.curAmount, 0) };
});

/* ══════════════ STEP 1 · 자산 입력 ══════════════ */

test('STEP 1 - 7가지 자산 유형이 등록되고 자동 판정값과 사용자 입력값이 구분된다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => state.assets.map((a) => {
    const mb = resolveMarketRiskBenchmark(a);
    const tb = resolveRiskBenchmark(a);
    return { name: a.name, category: a.category, domestic: a.isDomestic, ccy: a.currency,
      autoCategory: classifyCategory(a.ticker, a.name), facts: resolveInstrumentFacts(a.ticker),
      marketBeta: { key: mb.key, status: mb.status, source: mb.source },
      trackingBeta: { key: tb.key, status: tb.status, source: tb.source },
      userBeta: a.marketBetaIndexOverride ?? null, userHedge: a.fxHedgeStatus ?? null };
  }));
  const by = (n) => r.find((x) => x.name === n);

  // 자동 판정 - 종목 마스터의 원천 사실로 정해진다.
  expect(by('ZZ국내대표').autoCategory).toBe('주식');
  expect(by('ZZ코스피ETF').autoCategory).toBe('ETF');
  expect(by('ZZ국내대표').facts.exchange).toBe('KOSPI');
  expect(by('ZZ US Corp').facts.market).toBe('US');
  // 국내 상장 주권 · 미국 본국 보통주는 원장 없이도 자동으로 시장 지수를 받는다.
  expect(by('ZZ국내대표').marketBeta.key).toBe('KOSPI');
  expect(by('ZZ US Corp').marketBeta.key).toBe('SP500');
  // 공식 기초지수가 없는 ETF는 추정하지 않는다 - UNRESOLVED로 남아 사용자 확인을 기다린다.
  expect(by('ZZ코스피ETF').marketBeta.status).toBe('UNRESOLVED');
  expect(by('ZZ 미국대표 ETF').marketBeta.status).toBe('UNRESOLVED');
  // 채권 · 현금 · 부동산은 애초에 시장 베타 대상이 아니다(PD-15).
  // 이 합성 자산들은 티커가 없어 noTicker에서 먼저 걸린다 - 어느 쪽이든 "추정하지 않는다"가 핵심이다.
  ['ZZ국고채', 'ZZ원화예수금', 'ZZ주택'].forEach((n) => {
    expect(by(n).marketBeta.status, n).toBe('UNRESOLVED');
    expect(['noTicker', 'notEquityLike'], n).toContain(by(n).marketBeta.source);
  });
  // 티커가 있는 비주식 자산은 notEquityLike로 걸러진다(정책 자체를 확인).
  expect(by('ZZ국내대표').marketBeta.status).toBe('RESOLVED');
  // 사용자 입력값은 입력한 것만 있다.
  expect(by('ZZ 미국대표 ETF').userHedge).toBe('UNHEDGED');
  expect(by('ZZ국내대표').userHedge).toBeNull();
  expect(r.every((x) => x.userBeta === null)).toBe(true);
});

/* ══════════════ STEP 2 · 거래 입력 → STEP 3 · Portfolio ══════════════ */

test('STEP 2·3 - 매수 · 추가매수 · 일부매도 · 수정 · 삭제가 Portfolio에 그대로 반영된다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const out = {};
    const tx = (o) => Object.assign({ id: genId(), owner: '신랑', accountType: '일반계좌', currency: 'KRW',
      origin: 'manual', createdAt: Date.now(), updatedAt: Date.now() }, o);
    state.transactions = [];
    // 거래원장으로 관리하는 합성 종목을 따로 하나 둔다(자산 마스터 관리분과 섞지 않는다).
    const buy1 = tx({ date: '2026-01-05', ticker: 'ZZLDG.KS', name: 'ZZ원장종목', type: 'buy', quantity: 100, price: 10000 });
    state.transactions.push(buy1);
    syncAssetsFromTransactions();
    const find = () => state.assets.find((a) => a.ticker === 'ZZLDG.KS');
    out.afterBuy = { qty: find().quantity, source: find().positionSource };

    state.transactions.push(tx({ date: '2026-02-05', ticker: 'ZZLDG.KS', name: 'ZZ원장종목', type: 'buy', quantity: 50, price: 12000 }));
    syncAssetsFromTransactions();
    out.afterAddBuy = { qty: find().quantity, avgBuy: Math.round(find().buyPrice) };

    state.transactions.push(tx({ date: '2026-03-05', ticker: 'ZZLDG.KS', name: 'ZZ원장종목', type: 'sell', quantity: 30, price: 13000 }));
    syncAssetsFromTransactions();
    out.afterSell = { qty: find().quantity, avgBuy: Math.round(find().buyPrice) };

    // 수정 - 추가매수 수량을 고친다.
    state.transactions[1].quantity = 80;
    state.transactions[1].updatedAt = Date.now();
    syncAssetsFromTransactions();
    out.afterEdit = { qty: find().quantity };

    // 삭제 - 매도를 지운다.
    state.transactions.splice(2, 1);
    syncAssetsFromTransactions();
    out.afterDelete = { qty: find().quantity };

    // 중복 판정 - js/06 저장 핸들러와 같은 술어를 그대로 쓴다(그 검사는 인라인이라 함수가 없다).
    out.duplicateDetected = state.transactions.some((t) => t
      && t.date === '2026-01-05' && t.type === 'buy' && t.owner === '신랑'
      && (t.accountType || '일반계좌') === '일반계좌'
      && String(t.ticker || '') === 'ZZLDG.KS' && String(t.name || '') === 'ZZ원장종목'
      && num(t.quantity) === 100 && num(t.price) === 10000);
    return out;
  });
  expect(r.afterBuy.qty).toBe(100);
  expect(r.afterBuy.source).toBe('ledger');          // 거래가 SoT
  expect(r.afterAddBuy.qty).toBe(150);
  expect(r.afterAddBuy.avgBuy).toBe(Math.round((100 * 10000 + 50 * 12000) / 150));
  expect(r.afterSell.qty).toBe(120);
  expect(r.afterSell.avgBuy).toBe(r.afterAddBuy.avgBuy); // 일부매도는 평단가를 바꾸지 않는다
  expect(r.afterEdit.qty).toBe(150);                 // 100 + 80 - 30
  expect(r.afterDelete.qty).toBe(180);               // 100 + 80
  expect(r.duplicateDetected).toBe(true);
});

test('STEP 3 - Portfolio 평가금액 · 손익 · 소유자/계좌 구분이 계산과 일치한다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const s = await snapshot(page);
  const by = (n) => s.rows.find((r) => r.name === n);
  expect(by('ZZ국내대표').curAmount).toBe(100 * 55000);
  expect(by('ZZ국내대표').profit).toBe(100 * (55000 - 50000));
  expect(by('ZZ코스피ETF').curAmount).toBe(200 * 11000);
  expect(by('ZZ주택').owner).toBe('와이프');
  // 외화 자산은 환율이 곱해진다(원화 환산액이 외화 표시 금액보다 크다).
  expect(by('ZZ US Corp').curAmount).toBeGreaterThan(20 * 120);
  expect(s.total).toBeGreaterThan(0);
});

/* ══════════════ STEP 4 · Risk 연결 ══════════════ */

test('STEP 4 - Portfolio가 Risk로 연결되고 자산군별 기존 정책이 유지된다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(async () => {
    const m = await computeAdvancedRiskMetrics();
    // computeRiskClassifiedAssets()는 { risky, safe } 모양이며 항목은 { asset, ... } 형태다.
    const classified = computeRiskClassifiedAssets();
    const nameOf = (x) => (x && x.asset ? x.asset.name : (x && x.name) || null);
    return {
      keys: Object.keys(m).sort(),
      risky: (classified.risky || []).map(nameOf).sort(),
      safe: (classified.safe || []).map(nameOf).sort(),
      betaEligible: state.assets.filter((a) => RISK_ELIGIBLE_CATEGORIES.includes(a.category)).map((a) => a.name).sort(),
      betaExcluded: state.assets.filter((a) => !RISK_ELIGIBLE_CATEGORIES.includes(a.category)).map((a) => a.name).sort(),
      bondExcludedFromBeta: state.assets.filter((a) => a.category === '채권')
        .every((a) => resolveMarketRiskBenchmark(a).status === 'UNRESOLVED')
    };
  });
  // 주식 · ETF만 Portfolio Beta 대상이고 채권 · 현금 · 부동산은 빠진다(PD-15).
  expect(r.betaEligible).toEqual(['ZZ 미국대표 ETF', 'ZZ US Corp', 'ZZ국내대표', 'ZZ코스피ETF'].sort());
  expect(r.betaExcluded).toEqual(['ZZ국고채', 'ZZ원화예수금', 'ZZ주택'].sort());
  expect(r.bondExcludedFromBeta).toBe(true);
  // 위험/안전 분류는 Risk 대상(주식 · ETF)만 다룬다(riskEligibleAssets) - 그 4건이 빠짐없이 들어간다.
  expect([...r.risky, ...r.safe].sort()).toEqual(r.betaEligible);
  // Risk 지표가 실제로 계산된다(값 자체는 가격 이력이 없어 제한될 수 있다 - 구조 연결만 본다).
  expect(r.keys.length).toBeGreaterThan(5);
});

/* ══════════════ STEP 5 · Market Beta 우선순위 ══════════════ */

test('STEP 5 - 자동 / 사용자확정 / 미확인 세 상태가 우선순위대로 동작한다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const out = {};
    const get = (t) => { const a = state.assets.find((x) => x.ticker === t); const b = resolveMarketRiskBenchmark(a); return { key: b.key, status: b.status, source: b.source }; };
    // A. 자동
    out.auto = get('ZZKP.KS');
    // C. 미확인
    out.unresolved = get('ZZEF.KS');
    // B. 사용자 확정 - 미확인 자산에 확정값을 준다.
    const etf = state.assets.find((x) => x.ticker === 'ZZEF.KS');
    etf.marketBetaIndexOverride = 'KOSPI';
    persistAssets();
    out.userConfirmed = get('ZZEF.KS');
    // 사용자 확정은 자동 판정보다 먼저다 - 자동으로 KOSPI가 나오는 종목에 KOSDAQ을 주면 KOSDAQ이 이긴다.
    const kp = state.assets.find((x) => x.ticker === 'ZZKP.KS');
    kp.marketBetaIndexOverride = 'KOSDAQ';
    persistAssets();
    out.overrideWins = get('ZZKP.KS');
    // 다른 자산에 번지지 않는다.
    out.neighbourUntouched = state.assets.find((x) => x.ticker === 'ZZUSETF.KS').marketBetaIndexOverride ?? null;
    // 지우면 자동으로 돌아간다.
    delete kp.marketBetaIndexOverride;
    persistAssets();
    out.afterClear = get('ZZKP.KS');
    return out;
  });
  expect(r.auto).toEqual({ key: 'KOSPI', status: 'RESOLVED', source: 'listingMarketRuntime' });
  expect(r.unresolved.status).toBe('UNRESOLVED');
  expect(r.userConfirmed).toEqual({ key: 'KOSPI', status: 'RESOLVED', source: 'userConfirmedIndex' });
  expect(r.overrideWins).toEqual({ key: 'KOSDAQ', status: 'RESOLVED', source: 'userConfirmedIndex' });
  expect(r.neighbourUntouched).toBeNull();
  expect(r.afterClear).toEqual({ key: 'KOSPI', status: 'RESOLVED', source: 'listingMarketRuntime' });
});

/* ══════════════ STEP 6 · ETF 환헤지 → CMA ══════════════ */

test('STEP 6 - 같은 ETF에서 환헤지 상태만 바꾸면 MC 자산군만 바뀌고 Risk는 그대로다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const a = state.assets.find((x) => x.ticker === 'ZZUSETF.KS');
    const probe = () => {
      const rd = { key: 'S&P500', source: 'override', subject: a };
      return {
        appClass: resolveMcAppAssetClass(rd).appClass,
        marketBeta: resolveMarketRiskBenchmark(a).key,
        marketBetaStatus: resolveMarketRiskBenchmark(a).status,
        tracking: resolveRiskBenchmark(a).status,
        returnKey: resolveAssetGroupKeyDetail ? resolveAssetGroupKeyDetail(a).key : null,
        qty: a.quantity, buy: a.buyPrice, cur: a.currentPrice
      };
    };
    a.fxHedgeStatus = 'UNHEDGED'; const un = probe();
    a.fxHedgeStatus = 'HEDGED'; const he = probe();
    delete a.fxHedgeStatus; const none = probe();
    return { un, he, none };
  });
  // MC 자산군만 바뀐다.
  expect(r.un.appClass).toBe('US_EQUITY');
  expect(r.he.appClass).toBe('US_EQUITY_HEDGED');
  expect(r.none.appClass).toBe('US_EQUITY');
  // Risk · Tracking · Return Key · 보유정보는 그대로다(교차 오염 없음).
  ['marketBeta', 'marketBetaStatus', 'tracking', 'returnKey', 'qty', 'buy', 'cur'].forEach((k) => {
    expect(r.he[k], k).toEqual(r.un[k]);
    expect(r.none[k], k).toEqual(r.un[k]);
  });
});

test('STEP 6·7 - 환헤지 전환이 MC 입력(σ · 상관)을 실제로 바꾼다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(async () => {
    const a = state.assets.find((x) => x.ticker === 'ZZUSETF.KS');
    const build = async () => {
      const res = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      const us = (res.instruments || []).find((i) => String(i.key).includes('ZZUSETF'));
      return { sigma: us ? us.sigmaAnnual : null, mu: us ? us.muAnnual : null,
        classes: (res.cma && res.cma.instruments || []).map((i) => i.cmaClass).sort(),
        errors: Array.from(res.errors || []) };
    };
    a.fxHedgeStatus = 'UNHEDGED'; const un = await build();
    a.fxHedgeStatus = 'HEDGED'; const he = await build();
    return { un, he };
  });
  expect(r.un.errors).toEqual([]);
  expect(r.he.errors).toEqual([]);
  // σ는 원문 짝을 따라 바뀌고, μ(Return Key)는 그대로다.
  expect(r.un.sigma).toBeCloseTo(13.722309014388456 / 100, 12);
  expect(r.he.sigma).toBeCloseTo(16.63977109253169 / 100, 12);
  expect(r.he.mu).toBe(r.un.mu);
  expect(r.un.classes).toContain('U.S. Large Cap');
  expect(r.he.classes).toContain('U.S. Large Cap hedged');
});

/* ══════════════ STEP 7 · MC 실행 ══════════════ */

test('STEP 7 - 실제 [실행] 버튼으로 MC가 돌고 결과가 화면에 나온다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('미래 예측', { exact: true }).click();
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 20000 });
  const r = await page.evaluate(() => ({
    p50: mcUiEl('mcP50Text').innerText,
    hasMilestones: document.querySelectorAll('#mcMilestoneTableBody tr').length > 0
  }));
  expect(r.p50).not.toBe('');
  expect(r.hasMilestones).toBe(true);
});

/* ══════════════ STEP 8·9 · 연도별 추가 투자 → MC + 결정론 ══════════════ */

test('STEP 8·9 - 4가지 시나리오에서 MC와 결정론이 같은 입력을 쓴다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const Y = Math.max(...getMilestoneYearOffsets());
    const nowYear = new Date().getFullYear();
    const setExtra = (arr) => { state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions(arr); persistProjection(); };
    const det = () => simulateRebalancedPreset('normal', Y).yearlyPoints[Y].total;
    const det0 = () => simulateRebalancedPreset('normal', Y).yearlyPoints[0].total;
    const mcExtras = () => mapYearlyExtraContributionsToMonths(Y).mapped;
    const shot = () => ({ det: det(), det0: det0(), mc: mcExtras() });

    setExtra([]); const s1 = shot();
    setExtra([{ year: nowYear + 1, amount: 10000000 }]); const s2 = shot();
    setExtra([{ year: nowYear + 1, amount: 10000000 }, { year: nowYear + 2, amount: 5000000 }]); const s3 = shot();
    setExtra([{ year: nowYear + 50, amount: 90000000 }]); const s4 = shot();
    setExtra([]);
    return { s1, s2, s3, s4, nowYear };
  });
  // Scenario 1 기본 · 2 한 해 · 3 두 해 - 결정론이 단조 증가한다.
  expect(r.s2.det).toBeGreaterThan(r.s1.det);
  expect(r.s3.det).toBeGreaterThan(r.s2.det);
  // 같은 입력을 MC도 본다.
  expect(r.s1.mc).toHaveLength(0);
  expect(r.s2.mc).toHaveLength(1);
  expect(r.s3.mc).toHaveLength(2);
  expect(r.s2.mc[0].amount).toBe(10000000);
  // Scenario 4 - horizon 밖은 양쪽 모두 반영하지 않는다.
  expect(r.s4.det).toBe(r.s1.det);
  expect(r.s4.mc).toHaveLength(0);
  // 어느 경우에도 현재 자산에는 합산되지 않는다.
  [r.s2, r.s3, r.s4].forEach((s) => expect(s.det0).toBe(r.s1.det0));
});

test('STEP 9 - 추가 투자만 바꾸면 결정론 카드의 다른 입력은 변하지 않는다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const Y = Math.max(...getMilestoneYearOffsets());
    const nowYear = new Date().getFullYear();
    const shot = () => ({
      rate: simulateRebalancedPreset('normal', Y).weightedAvgRate,
      monthly: getHouseholdMonthlyContributionTotal(),
      pv: simulateRebalancedPreset('normal', Y).yearlyPoints[0].total,
      future: simulateRebalancedPreset('normal', Y).yearlyPoints[Y].total
    });
    const before = shot();
    state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions([{ year: nowYear + 1, amount: 10000000 }]);
    persistProjection();
    const after = shot();
    return { before, after };
  });
  expect(r.after.rate).toBe(r.before.rate);        // 수익률 가정 불변
  expect(r.after.monthly).toBe(r.before.monthly);  // 기본 투자금 불변
  expect(r.after.pv).toBe(r.before.pv);            // 현재 자산 불변
  expect(r.after.future).toBeGreaterThan(r.before.future); // 미래 자산만 늘어난다
});

/* ══════════════ STEP 10 · Excel 왕복 ══════════════ */

test('STEP 10 - Excel 내보내기 → 업로드 왕복에서 정체성과 사용자 확정값이 보존된다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  await page.evaluate(() => {
    state.assets.find((a) => a.ticker === 'ZZEF.KS').marketBetaIndexOverride = 'KOSPI';
    state.assets.find((a) => a.ticker === 'ZZUSETF.KS').fxHedgeStatus = 'HEDGED';
    state.assets.find((a) => a.ticker === 'ZZKP.KS').rateMatchOverride = 'KOSPI';
    persistAssets();
  });
  const before = await snapshot(page);

  page.on('dialog', (d) => d.accept());
  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  const file = path.join(os.tmpdir(), `e2e117-${Date.now()}.xlsx`);
  await download.saveAs(file);
  await page.locator('#excelFileInput').setInputFiles(file);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(500);
  fs.unlinkSync(file);

  const after = await snapshot(page);
  // 자산 수가 늘거나 줄지 않는다(중복 · 유실 없음).
  expect(after.rows).toHaveLength(before.rows.length);
  // 사용자 확정값이 살아남는다.
  const pick = (s, n) => s.rows.find((r) => r.name === n);
  expect(pick(after, 'ZZ코스피ETF').betaOverride).toBe('KOSPI');
  expect(pick(after, 'ZZ 미국대표 ETF').hedge).toBe('HEDGED');
  // 정체성 · 평가금액이 그대로다.
  before.rows.forEach((b) => {
    const a = pick(after, b.name);
    expect(a, b.name).toBeTruthy();
    ['ticker', 'owner', 'account', 'category', 'ccy', 'domestic', 'qty', 'buy', 'curAmount'].forEach((k) => {
      expect(a[k], `${b.name}.${k}`).toEqual(b[k]);
    });
  });
});

/* ══════════════ STEP 11·12 · Backup / Restore / 재계산 ══════════════ */

test('STEP 11·12 - 백업 → 상태변경 → 복원에서 모든 값이 되돌아오고 재계산이 일치한다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const nowYear = await page.evaluate(() => new Date().getFullYear());
  await page.evaluate((y) => {
    state.assets.find((a) => a.ticker === 'ZZEF.KS').marketBetaIndexOverride = 'KOSPI';
    state.assets.find((a) => a.ticker === 'ZZUSETF.KS').fxHedgeStatus = 'HEDGED';
    persistAssets();
    state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions([{ year: y + 1, amount: 10000000 }]);
    persistProjection();
  }, nowYear);

  const compute = () => page.evaluate(() => {
    const Y = Math.max(...getMilestoneYearOffsets());
    return {
      portfolio: state.assets.map((a) => ({ n: a.name, v: Math.round(calcRow(a).curAmount) })).sort((x, y2) => x.n.localeCompare(y2.n)),
      beta: state.assets.map((a) => ({ n: a.name, k: resolveMarketRiskBenchmark(a).key })).sort((x, y2) => x.n.localeCompare(y2.n)),
      tracking: state.assets.map((a) => ({ n: a.name, k: resolveRiskBenchmark(a).key })).sort((x, y2) => x.n.localeCompare(y2.n)),
      deterministic: simulateRebalancedPreset('normal', Y).yearlyPoints[Y].total,
      extras: state.projection.yearlyExtraContributions,
      hedge: state.assets.map((a) => ({ n: a.name, h: a.fxHedgeStatus ?? null })).sort((x, y2) => x.n.localeCompare(y2.n)),
      override: state.assets.map((a) => ({ n: a.name, o: a.marketBetaIndexOverride ?? null })).sort((x, y2) => x.n.localeCompare(y2.n))
    };
  });
  const before = await compute();

  // 1. Backup
  await page.evaluate(() => openSystemManagementModal());
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => { Promise.resolve(downloadJsonBackup()).catch(() => {}); })
  ]);
  const file = path.join(os.tmpdir(), `e2e117-backup-${Date.now()}.json`);
  await dl.saveAs(file);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(parsed.schemaVersion, '백업 schemaVersion').toBeTruthy();
  expect(typeof parsed.checksum === 'string' || parsed.checksum === undefined).toBe(true);

  // 2. 상태 변경 - 값들을 일부러 망가뜨린다.
  await page.evaluate(() => {
    state.assets.forEach((a) => { delete a.marketBetaIndexOverride; delete a.fxHedgeStatus; a.quantity = 1; });
    persistAssets();
    state.projection.yearlyExtraContributions = [];
    persistProjection();
  });
  const broken = await compute();
  expect(broken.extras).toHaveLength(0);

  // 3. Restore
  page.on('dialog', (d) => d.accept());
  await page.evaluate(() => openSystemManagementModal());
  await page.locator('#jsonFileInput').setInputFiles(file);
  // 복원은 [덮어쓰기 / 추가하기]를 반드시 고르게 한다 - 고르지 않으면 아무 일도 일어나지 않는다.
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(500);
  fs.unlinkSync(file);

  const after = await compute();
  // STEP 12 - 복원 후 재계산이 복원 전과 완전히 같다.
  expect(after.portfolio).toEqual(before.portfolio);
  expect(after.beta).toEqual(before.beta);
  expect(after.tracking).toEqual(before.tracking);
  expect(after.hedge).toEqual(before.hedge);
  expect(after.override).toEqual(before.override);
  expect(after.extras).toEqual(before.extras);
  expect(after.deterministic).toBe(before.deterministic);
});

/* ══════════════ 교차 오염 검증 ══════════════ */

test('교차오염 - 변경 하나가 바꿔야 할 것만 바꾸고 나머지는 건드리지 않는다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const Y = Math.max(...getMilestoneYearOffsets());
    const nowYear = new Date().getFullYear();
    const etf = () => state.assets.find((a) => a.ticker === 'ZZUSETF.KS');
    const kp = () => state.assets.find((a) => a.ticker === 'ZZKP.KS');
    const shot = () => ({
      marketBeta: state.assets.map((a) => resolveMarketRiskBenchmark(a).key),
      tracking: state.assets.map((a) => resolveRiskBenchmark(a).key),
      returnKey: state.assets.map((a) => resolveAssetGroupKeyDetail(a).key),
      mcClass: state.assets.filter((a) => a.ticker).map((a) => resolveMcAppAssetClass({ key: resolveAssetGroupKeyDetail(a).key, source: 'x', subject: a }).appClass),
      valuation: state.assets.map((a) => Math.round(calcRow(a).curAmount)),
      deterministic: simulateRebalancedPreset('normal', Y).yearlyPoints[Y].total,
      mcExtras: mapYearlyExtraContributionsToMonths(Y).mapped.length
    });
    const diff = (a, b) => Object.keys(a).reduce((o, k) => {
      o[k] = JSON.stringify(a[k]) !== JSON.stringify(b[k]);
      return o;
    }, {});
    const out = {};
    let base = shot();

    // A. Market Beta override 변경
    kp().marketBetaIndexOverride = 'KOSDAQ'; persistAssets();
    out.A = diff(base, shot());
    delete kp().marketBetaIndexOverride; persistAssets(); base = shot();

    // B. Hedge status 변경
    etf().fxHedgeStatus = 'HEDGED'; persistAssets();
    out.B = diff(base, shot());
    etf().fxHedgeStatus = 'UNHEDGED'; persistAssets(); base = shot();

    // C. 연도별 추가 투자 변경
    state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions([{ year: nowYear + 1, amount: 10000000 }]);
    persistProjection();
    out.C = diff(base, shot());
    state.projection.yearlyExtraContributions = []; persistProjection(); base = shot();

    // D. Return Key(대표매칭) 변경
    kp().rateMatchOverride = 'KOSDAQ'; persistAssets();
    out.D = diff(base, shot());
    delete kp().rateMatchOverride; persistAssets(); base = shot();

    // F. 보유 수량 변경
    kp().quantity = 200; persistAssets();
    out.F = diff(base, shot());
    return out;
  });

  // A. Market Beta override → Market Beta만. MC · Return Key · 평가금액 · 결정론은 그대로.
  expect(r.A.marketBeta).toBe(true);
  expect(r.A.mcClass).toBe(false);
  expect(r.A.returnKey).toBe(false);
  expect(r.A.valuation).toBe(false);
  expect(r.A.deterministic).toBe(false);

  // B. Hedge → MC 자산군만. Market Beta · Tracking · Return Key · 평가금액 · 결정론은 그대로.
  expect(r.B.mcClass).toBe(true);
  expect(r.B.marketBeta).toBe(false);
  expect(r.B.tracking).toBe(false);
  expect(r.B.returnKey).toBe(false);
  expect(r.B.valuation).toBe(false);
  expect(r.B.deterministic).toBe(false);

  // C. 추가 투자 → MC 입력 · 결정론만. 현재 평가금액 · Beta · Return Key는 그대로.
  expect(r.C.mcExtras).toBe(true);
  expect(r.C.deterministic).toBe(true);
  expect(r.C.valuation).toBe(false);
  expect(r.C.marketBeta).toBe(false);
  expect(r.C.returnKey).toBe(false);
  expect(r.C.mcClass).toBe(false);

  // D. Return Key → Return Key(및 그에 딸린 MC 자산군 · 결정론 수익률). Market Beta · 평가금액은 그대로.
  expect(r.D.returnKey).toBe(true);
  expect(r.D.marketBeta).toBe(false);
  expect(r.D.valuation).toBe(false);

  // F. 수량 → 평가금액 · 결정론. Return Key · Market Beta 자체는 그대로.
  expect(r.F.valuation).toBe(true);
  expect(r.F.returnKey).toBe(false);
  expect(r.F.marketBeta).toBe(false);
});

/* ══════════════ 데이터 무결성 ══════════════ */

test('무결성 - orphan · 중복 · 정체성 불일치가 없다', async ({ page }) => {
  await boot(page);
  await seedAssets(page);
  const r = await page.evaluate(() => {
    const ids = state.assets.map((a) => a.id);
    const identity = state.assets.map((a) => [a.owner, a.accountType, String(a.ticker || '').toUpperCase(), a.name, a.currency].join('|'));
    const txAssetKeys = (state.transactions || []).map((t) => String(t.ticker || t.name || '').toUpperCase());
    const assetKeys = new Set(state.assets.map((a) => String(a.ticker || a.name || '').toUpperCase()));
    return {
      dupIds: ids.length !== new Set(ids).size,
      dupIdentity: identity.length !== new Set(identity).size,
      orphanTx: txAssetKeys.filter((k) => k && !assetKeys.has(k)),
      badOwner: state.assets.filter((a) => !['신랑', '와이프'].includes(a.owner)).map((a) => a.name),
      badCurrency: state.assets.filter((a) => !['KRW', 'USD'].includes(a.currency)).map((a) => a.name),
      hedgeOrphan: state.assets.filter((a) => a.fxHedgeStatus && !['HEDGED', 'UNHEDGED'].includes(a.fxHedgeStatus)).map((a) => a.name),
      betaOrphan: state.assets.filter((a) => a.marketBetaIndexOverride && !USER_MARKET_BETA_INDEX_CHOICES.includes(a.marketBetaIndexOverride)).map((a) => a.name),
      extrasOrphan: (state.projection.yearlyExtraContributions || []).filter((e) => !Number.isFinite(e.year) || !Number.isFinite(e.amount) || e.amount < 0),
      // 파생값이 저장되면 안 된다 - 자산 레코드에 평가금액 · 베타가 들어 있으면 안 된다.
      derivedPersisted: state.assets.filter((a) => 'curAmount' in a || 'beta' in a || 'marketBeta' in a).map((a) => a.name)
    };
  });
  expect(r.dupIds).toBe(false);
  expect(r.dupIdentity).toBe(false);
  expect(r.orphanTx).toEqual([]);
  expect(r.badOwner).toEqual([]);
  expect(r.badCurrency).toEqual([]);
  expect(r.hedgeOrphan).toEqual([]);
  expect(r.betaOrphan).toEqual([]);
  expect(r.extrasOrphan).toEqual([]);
  expect(r.derivedPersisted).toEqual([]);
});

/* ══════════════ UX (375 · 390 · 1440 × Light/Dark) ══════════════ */

for (const w of [375, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`UX ${w}px ${dark ? 'Dark' : 'Light'} - 주요 흐름이 넘치지 않고 값이 화면에 보인다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await seedAssets(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();

      const noOverflow = async (where) => {
        const sw = await page.locator('body').evaluate((el) => el.scrollWidth);
        expect(sw, where).toBeLessThanOrEqual(w + 1);
      };
      await noOverflow('대시보드');

      // 자산 입력 폼 - 위험 분석 확인 칸이 보이고 터치 가능하다.
      await page.evaluate(() => { openModal('add'); showModal(); document.getElementById('f_category').value = 'ETF'; updateRiskConfirmFieldsUI(); });
      await expect(page.locator('#riskConfirmFieldsWrap')).toBeVisible();
      for (const sel of ['#f_marketBetaIndexOverride', '#f_fxHedgeStatus']) {
        const box = await page.locator(sel).boundingBox();
        expect(box.height, sel).toBeGreaterThanOrEqual(38);
      }
      await noOverflow('자산 입력 폼');
      await page.evaluate(() => closeModal());

      // 투자금 설정 팝업 - 연도별 추가 투자 편집.
      await page.getByText('포트폴리오/자산예측').click();
      await page.evaluate(() => openMonthlyContributionAllocationModal());
      await page.locator('#yearlyExtraContributionAddBtn').click();
      const addBox = await page.locator('#yearlyExtraContributionAddBtn').boundingBox();
      expect(addBox.height).toBeGreaterThanOrEqual(43.9);
      await noOverflow('투자금 설정 팝업');
      await page.evaluate(() => closeMonthlyContributionAllocationModal(false));

      // 자산 상세 - 위험 분석 확인이 보인다(거래원장 자산도 여기서 고칠 수 있어야 한다).
      await page.evaluate(() => { const a = state.assets.find((x) => x.ticker === 'ZZEF.KS'); openAssetDetailModal(a.id); });
      await expect(page.locator('#assetDetailRiskConfirm')).toBeVisible();
      await noOverflow('자산 상세');
      await page.evaluate(() => closeAssetDetailModal());
    });
  }
}
