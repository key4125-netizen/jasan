/* global document, window, getComputedStyle */
// E2E-111 [v264 전체 통합검증] 채권 도입 · Risk · MC 개편 이후 앱 전체 데이터 흐름이 함께 작동하는가
//
// 개별 Unit/E2E는 각 조각을 고정한다. 이 파일은 **하나의 가상 포트폴리오로 끝에서 끝까지** 흐르는지만
// 본다: 거래내역 → Position → Asset Sync → Bond Position → Bond Risk → Portfolio Risk →
// Portfolio Beta → Return Key → MC Input → MC Result.
//
// [실제 사용자 데이터 미사용] 전부 ZZ 합성이다. 종목코드는 공개 식별자만 쓰고 수량 · 금액은 임의값이다.
// KIS는 호출하지 않는다(window.fetch를 이 페이지 안에서만 감싼다).
const { test, expect } = require('@playwright/test');

const BOND_ISIN = 'KRZZ00000001';

const INFO_OK = {
  rtCd: '0', msgCd: 'KIOK0530', msg1: '조회되었습니다', fetchedAt: 1700000000000,
  output: {
    pdno: BOND_ISIN, ksd_bond_item_name: 'ZZ합성국고채권 01125-3909', bond_clsf_kor_name: '국고채권',
    issu_dt: '20190910', rdpt_dt: '20390910', ksd_rcvg_bond_srfc_inrt: '1.125000000000',
    ksd_rcvg_bond_dsct_rt: '0.000000000000', int_caltm_mcnt: '6', iso_crcy_cd: 'KRW',
    tlg_rcvg_dtl_dtime: '20260901060518038', padf_plac_hdof_name: '한국', krx_issu_istt_cd: 'GB035'
  }, output2: null
};
const PRICE_OK = {
  rtCd: '0', msgCd: 'MCA00000', msg1: '정상처리 되었습니다.', fetchedAt: 1700000000000,
  output: { stnd_iscd: BOND_ISIN, hts_kor_isnm: 'ZZ합성국고', bond_prpr: '6785.00', bond_prdy_clpr: '6782.00', ernn_rate: '4.409' },
  output2: null
};

async function stubKis(page, { info = INFO_OK, price = PRICE_OK } = {}) {
  await page.addInitScript(({ info, price }) => {
    window.__kisCalls = { info: 0, price: 0 };
    const real = window.fetch.bind(window);
    const reply = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const fail = () => Promise.resolve(new Response('{"error":"upstream_error"}', { status: 502, headers: { 'Content-Type': 'application/json' } }));
    window.fetch = (input, init) => {
      const url = String((input && input.url) || input || '');
      if (url.includes('/api/kis/bond-info')) { window.__kisCalls.info += 1; return info === 'fail' ? fail() : reply(info); }
      if (url.includes('/api/kis/bond-price')) { window.__kisCalls.price += 1; return price === 'fail' ? fail() : reply(price); }
      return real(input, init);
    };
  }, { info, price });
}

/* ── 가상 포트폴리오 (§11) ─────────────────────────────────────────────────
 * 국내주식 2 · 해외주식 1 · 국내ETF 1 · 해외ETF 1 · 채권 1(거래기반) · 현금 KRW/USD · 부동산 1.
 * 새 자산 유형을 만들지 않는다 - 전부 앱이 이미 지원하는 유형이다. */
async function seedPortfolio(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate((isin) => {
    state.assets = []; state.transactions = []; state.bondPositions = [];
    const tx = (o) => Object.assign({
      owner: '신랑', accountType: '일반계좌', currency: 'KRW', fee: 0, type: 'buy',
      origin: 'initial', createdAt: Date.now(), updatedAt: Date.now()
    }, o);
    state.transactions = [
      tx({ id: 'i-kr1', date: '2024-02-01', ticker: '005930.KS', name: 'ZZ국내주식A', quantity: 100, price: 70000 }),
      tx({ id: 'i-kr2', date: '2024-03-04', ticker: '000660.KS', name: 'ZZ국내주식B', quantity: 50, price: 150000 }),
      tx({ id: 'i-us1', date: '2024-04-05', ticker: 'AAPL', name: 'ZZ해외주식A', quantity: 20, price: 180, currency: 'USD', appliedRate: 1330 }),
      tx({ id: 'i-ke1', date: '2024-05-07', ticker: '069500.KS', name: 'ZZ국내ETF', quantity: 200, price: 35000 }),
      tx({ id: 'i-ue1', date: '2024-06-10', ticker: 'SCHD', name: 'ZZ해외ETF', quantity: 80, price: 27, currency: 'USD', appliedRate: 1350 })
    ];
    persistTransactions();
    syncAssetsFromTransactions();
    // 거래로 관리하지 않는 자산(기존 정책 그대로 자산 화면에서 직접 관리)
    state.assets.push(makeAsset({ ticker: '', name: 'ZZ원화예수금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 30000000, currentPrice: 30000000 }));
    state.assets.push(makeAsset({ ticker: '', name: 'ZZ달러예수금', category: '현금', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 5000, buyPrice: 1, currentPrice: 1, buyRate: 1340 }));
    state.assets.push(makeAsset({ ticker: '', name: 'ZZ부동산', category: '부동산', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '일반계좌', quantity: 1, buyPrice: 500000000, currentPrice: 500000000 }));
    persistAssets();
    return isin;
  }, BOND_ISIN);
}

// 채권 거래를 실제 거래 화면에서 넣는다.
async function addBondTx(page, { date, quantity, price, type = 'buy', lookup = false }) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_date').fill(date);
  await page.locator('#tx_type').selectOption(type);
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_assetClass').selectOption('채권');
  await page.locator('#tx_bondIsin').fill(BOND_ISIN);
  if (lookup) {
    await page.locator('#txBondLookupBtn').click();
    await expect(page.locator('#tx_bondMasterNote')).toContainText('조회했습니다');
  }
  if (!(await page.locator('#tx_name').inputValue())) await page.locator('#tx_name').fill('ZZ합성국고채권');
  await page.locator('#tx_quantity').fill(String(quantity));
  await page.locator('#tx_price').fill(String(price));
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);
}

const bondHolding = (page) => page.evaluate((isin) => {
  const rec = (state.bondPositions || []).find((p) => p.identity.isin === isin);
  const { positions } = computePositionsAndRealizedPnL();
  const h = resolveBondHolding(rec, positions);
  return { source: h.source, quantity: h.quantity, faceAmount: h.faceAmount, purchaseAmount: h.purchaseAmount, closed: h.closed };
}, BOND_ISIN);

/* ══════════ 1. 주식 · ETF 거래 흐름 (§12) ══════════ */

test('1. 주식/ETF - 신규매수 · 추가매수 · 부분매도 · 수정 · 삭제가 전부 거래 기준으로 재계산된다', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);
  const q = (t) => page.evaluate((tk) => {
    const a = state.assets.find((x) => x.ticker === tk);
    return a ? { quantity: a.quantity, buyPrice: a.buyPrice, positionSource: a.positionSource } : null;
  }, t);

  expect(await q('005930.KS')).toMatchObject({ quantity: 100, buyPrice: 70000, positionSource: 'ledger' });

  // 추가매수 → 가중평균
  await page.evaluate(() => {
    state.transactions.push({ id: 'i-kr1b', date: '2024-07-01', owner: '신랑', accountType: '일반계좌',
      ticker: '005930.KS', name: 'ZZ국내주식A', type: 'buy', quantity: 100, price: 80000, currency: 'KRW',
      fee: 0, origin: 'period', createdAt: 2, updatedAt: 2 });
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  expect(await q('005930.KS')).toMatchObject({ quantity: 200, buyPrice: 75000 });

  // 부분매도
  await page.evaluate(() => {
    state.transactions.push({ id: 'i-kr1s', date: '2024-08-01', owner: '신랑', accountType: '일반계좌',
      ticker: '005930.KS', name: 'ZZ국내주식A', type: 'sell', quantity: 50, price: 90000, currency: 'KRW',
      fee: 0, origin: 'period', createdAt: 3, updatedAt: 3 });
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  expect(await q('005930.KS')).toMatchObject({ quantity: 150, buyPrice: 75000 });

  // 거래 수정
  await page.evaluate(() => {
    const t = state.transactions.find((x) => x.id === 'i-kr1s');
    t.quantity = 100; t.updatedAt = Date.now();
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  expect(await q('005930.KS')).toMatchObject({ quantity: 100 });

  // 거래 삭제 → 복원
  await page.evaluate(() => {
    state.transactions = state.transactions.filter((x) => x.id !== 'i-kr1s');
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  expect(await q('005930.KS')).toMatchObject({ quantity: 200 });

  // 나머지 자산군도 거래에서 그대로 생성됐다
  expect(await q('AAPL')).toMatchObject({ quantity: 20, buyPrice: 180 });
  expect(await q('069500.KS')).toMatchObject({ quantity: 200 });
  expect(await q('SCHD')).toMatchObject({ quantity: 80 });
});

/* ══════════ 2. 채권 거래 흐름 + KIS (§12 · §13) ══════════ */

test('2. 채권 - 과거일 매수 · 추가매수 · 부분매도 · 삭제복원 · 전량매도까지 거래원장이 기준이다', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);

  // 과거 날짜 + KIS 조회로 발행조건 자동 입력
  await addBondTx(page, { date: '2024-01-15', quantity: 600, price: 9800, lookup: true });
  let h = await bondHolding(page);
  expect(h).toMatchObject({ source: 'LEDGER', quantity: 600, faceAmount: 6000000, purchaseAmount: 5880000 });

  // 같은 ISIN 추가매수(다른 과거일) → 합산 · 가중평균
  await addBondTx(page, { date: '2025-03-05', quantity: 400, price: 10300 });
  h = await bondHolding(page);
  expect(h.quantity).toBe(1000);
  expect(h.faceAmount).toBe(10000000);
  expect(Math.round(h.purchaseAmount)).toBe(600 * 9800 + 400 * 10300);
  expect(await page.evaluate(() => state.bondPositions.length)).toBe(1); // 중복 생성 없음

  // 부분매도
  await addBondTx(page, { date: '2026-09-01', quantity: 300, price: 10500, type: 'sell' });
  h = await bondHolding(page);
  expect(h.quantity).toBe(700);
  expect(h.faceAmount).toBe(7000000);

  // 거래 삭제 → Position 복원
  await page.evaluate(() => {
    const last = state.transactions[state.transactions.length - 1];
    state.transactions = state.transactions.filter((t) => t.id !== last.id);
    persistTransactions(); syncAssetsFromTransactions(); persistAssets();
  });
  h = await bondHolding(page);
  expect(h.quantity).toBe(1000);

  // 전량매도 → Risk 제외 · Master/history는 보존
  await addBondTx(page, { date: '2026-09-10', quantity: 1000, price: 10600, type: 'sell' });
  h = await bondHolding(page);
  expect(h).toMatchObject({ quantity: 0, closed: true });
  const after = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    return {
      bondRecords: state.bondPositions.length,
      maturity: state.bondPositions[0].terms.maturityDate,
      buyTxKept: state.transactions.filter((t) => t.ticker && t.type === 'buy' && t.name.includes('국고')).length,
      risk: computeBondRiskSummary(state.bondPositions, { positions }).status
    };
  });
  expect(after.bondRecords).toBe(1);
  expect(after.maturity).toBe('2039-09-10');   // 발행조건 보존
  expect(after.buyTxKept).toBe(2);             // 과거 매수 이력 보존
  expect(after.risk).toBe('EMPTY');            // Risk 대상 제외
});

test('3. 채권 - 자산 보유수량의 기준이 거래원장이고, KIS 현재가가 과거 매수가를 덮어쓰지 않는다', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);
  await addBondTx(page, { date: '2024-01-15', quantity: 1000, price: 9800, lookup: true });
  await page.evaluate((isin) => getBondQuote(isin), BOND_ISIN);

  const r = await page.evaluate((isin) => {
    const { positions } = computePositionsAndRealizedPnL();
    const s = computeBondRiskSummary(state.bondPositions, { positions, quotes: getCachedBondQuotes() });
    const asset = state.assets.find((a) => a.ticker === isin);
    return {
      거래가: state.transactions.filter((t) => t.ticker === isin).map((t) => t.price),
      자산수량: asset.quantity, 자산매입단가: asset.buyPrice, 자산군: asset.category,
      평가기준: s.valuationSource, 평가금액: s.rows[0].amount, 가격기준액면: s.rows[0].priceBasisFace,
      시장단가: s.rows[0].marketUnitPrice
    };
  }, BOND_ISIN);
  expect(r.거래가).toEqual([9800]);        // KIS 6785로 덮어쓰이지 않았다
  expect(r.자산매입단가).toBe(9800);
  expect(r.자산수량).toBe(1000);
  expect(r.자산군).toBe('채권');
  expect(r.평가기준).toBe('MARKET');
  expect(r.가격기준액면).toBe(10000);
  expect(r.시장단가).toBe(6785);
  expect(r.평가금액).toBe(6785000);
});

test('4. 채권 - 잘못된 ISIN · KIS 실패 시 수동입력으로 계속 진행되고 PURCHASE로 평가한다', async ({ page }) => {
  await stubKis(page, { info: 'fail', price: 'fail' });
  await seedPortfolio(page);
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_assetClass').selectOption('채권');
  // 잘못된 형식은 저장 자체가 막힌다
  await page.locator('#tx_bondIsin').fill('KR1035');
  await page.locator('#tx_name').fill('ZZ수동채권');
  await page.locator('#tx_quantity').fill('500');
  await page.locator('#tx_price').fill('9900');
  await page.locator('#transactionForm button[type="submit"]').click();
  expect(await page.evaluate(() => state.transactions.filter((t) => t.name === 'ZZ수동채권').length)).toBe(0);

  // 올바른 ISIN + 조회 실패 → 직접 입력 후 저장
  await page.locator('#tx_bondIsin').fill(BOND_ISIN);
  await page.locator('#txBondLookupBtn').click();
  await expect(page.locator('#tx_bondMasterNote')).toContainText('직접');
  await page.locator('#tx_bondMaturityDate').fill('2034-03-10');
  await page.locator('#tx_bondCouponRate').fill('3.5');
  await page.locator('#tx_bondCouponType').selectOption('COUPON');
  await page.locator('#tx_bondPayFreq').selectOption('2');
  await page.locator('#transactionForm button[type="submit"]').click();
  await expect(page.locator('#transactionModal')).toHaveClass(/hidden/);

  const r = await page.evaluate(() => {
    const { positions } = computePositionsAndRealizedPnL();
    const s = computeBondRiskSummary(state.bondPositions, { positions, quotes: getCachedBondQuotes() });
    return { 평가기준: s.valuationSource, 평가금액: s.rows[0].amount, 만기: state.bondPositions[0].terms.maturityDate };
  });
  expect(r.만기).toBe('2034-03-10');       // 직접 입력값이 그대로 저장됐다
  expect(r.평가기준).toBe('PURCHASE');      // 시세를 못 받으면 매입원가
  expect(r.평가금액).toBe(500 * 9900);      // 0원이 아니다
});

/* ══════════ 3. Portfolio Risk · Beta (§16 · §17) ══════════ */

test('5. Portfolio Risk - 6대 요인 · 점수가 나오고, 채권/현금/부동산은 Equity Risk 대상에서 빠진다', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);
  await addBondTx(page, { date: '2024-01-15', quantity: 1000, price: 9800, lookup: true });

  const r = await page.evaluate(() => {
    const eligible = riskEligibleAssets().map((a) => a.category);
    return {
      대상자산군: [...new Set(eligible)].sort(),
      대상건수: eligible.length,
      전체자산건수: state.assets.length,
      RISK_ELIGIBLE: typeof RISK_ELIGIBLE_CATEGORIES !== 'undefined' ? [...RISK_ELIGIBLE_CATEGORIES] : null
    };
  });
  expect(r.대상자산군).toEqual(['ETF', '주식']);
  expect(r.RISK_ELIGIBLE).toEqual(['주식', 'ETF']);
  expect(r.대상건수).toBe(5);              // 국내주식2 + 해외주식1 + ETF2
  expect(r.전체자산건수).toBe(9);          // + 채권1 + 현금2 + 부동산1
});

test('6. Portfolio Beta - 채권은 베타 집계에서 제외된다(기존 정책 유지)', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);
  await addBondTx(page, { date: '2024-01-15', quantity: 1000, price: 9800, lookup: true });
  const r = await page.evaluate(() => {
    const eligible = riskEligibleAssets();
    return { 베타대상에채권없음: eligible.every((a) => a.category !== '채권'),
      베타대상에현금없음: eligible.every((a) => a.category !== '현금'),
      베타대상에부동산없음: eligible.every((a) => a.category !== '부동산') };
  });
  expect(r).toEqual({ 베타대상에채권없음: true, 베타대상에현금없음: true, 베타대상에부동산없음: true });
});

/* ══════════ 4. Return Key · MC (§18) ══════════ */

test('7. MC - 통합 포트폴리오로 입력이 만들어지고 채권 원금 · 비중이 사라지지 않는다', async ({ page }) => {
  test.setTimeout(90000);
  await stubKis(page);
  await seedPortfolio(page);
  await addBondTx(page, { date: '2024-01-15', quantity: 1000, price: 9800, lookup: true });

  /* [MC 입력의 출처] MC는 보유가 아니라 목표비중에서 instrument를 만든다(실측 확인).
   * 그래서 통합검증도 목표비중에 채권을 포함한 상태로 본다 - 이 구조는 이번 범위가 아니라 기존 설계다.
   * 여기서 보는 것은 채권이 MC 입력에서 사라지거나 비중이 0이 되지 않는가다. */
  const r = await page.evaluate(async () => {
    REBALANCE_OWNERS.forEach((o) => {
      state.rebalance[o].domestic = { 국내: 100, 해외: 0 };
      state.rebalance[o].targets = { 국내: [], 해외: [] };
    });
    state.rebalance['신랑'].targets['국내'] = [
      { type: 'namedHolding', name: 'ZZ국내주식A', pct: 40, role: '공격수' },
      { type: 'namedHolding', name: 'ZZ국내ETF', pct: 30, role: '코어자산' },
      { type: 'namedHolding', name: 'ZZ합성국고채권', pct: 30, role: '수비수' }
    ];
    persistRebalance();
    const input = await buildMonteCarloInputFromState({});
    const inst = input.instruments || [];
    // instrument는 name이 아니라 key로 식별된다(실측) - assetOrder와 같은 순서다.
    const bond = inst.find((i) => /국고|채권/.test(String(i.key || '')));
    const bad = inst.filter((i) => ![i.weight, i.muAnnual, i.sigmaAnnual].every((v) => Number.isFinite(v)));
    return {
      instrumentCount: inst.length,
      errors: input.errors,
      keys: inst.map((i) => i.key),
      weightSum: +inst.reduce((s, i) => s + (i.weight || 0), 0).toFixed(6),
      bondIncluded: !!bond,
      bondWeight: bond ? +bond.weight.toFixed(6) : null,
      bondKey: bond ? bond.key : null,
      bondSigma: bond ? bond.sigmaAnnual : null,
      bondMu: bond ? bond.muAnnual : null,
      nanOrInfinity: bad.length,
      bondsWithoutRiskAssumption: (input.bondsWithoutRiskAssumption || []).length
    };
  });
  expect(r.errors).toEqual([]);
  expect(r.instrumentCount).toBe(3);
  expect(r.nanOrInfinity).toBe(0);
  expect(Math.abs(r.weightSum - 1)).toBeLessThan(0.01);   // 임의 재정규화로 왜곡되지 않는다
  expect(r.bondIncluded).toBe(true);                      // 채권이 MC 입력에서 사라지지 않는다
  expect(r.bondWeight).toBeCloseTo(0.3, 6);               // 보유비중이 0으로 지워지지 않는다
  expect(Number.isFinite(r.bondSigma)).toBe(true);        // σ가 NaN이 아니다(위험가정 없으면 0)
});

/* ══════════ 5. 전체 데이터 흐름 추적 (§19) ══════════ */

test('8. 거래내역 → Position → Asset → Bond Position → Bond Risk 전 구간이 같은 수를 가리킨다', async ({ page }) => {
  await stubKis(page);
  await seedPortfolio(page);
  await addBondTx(page, { date: '2024-01-15', quantity: 1000, price: 9800, lookup: true });
  await page.evaluate((isin) => getBondQuote(isin), BOND_ISIN);

  const trace = await page.evaluate((isin) => {
    const { positions } = computePositionsAndRealizedPnL();
    const pos = positions[`신랑__일반계좌__${isin}__KRW`]  /* [§50 · PD-02] 포지션 키에 통화 포함 */;
    const asset = state.assets.find((a) => a.ticker === isin);
    const rec = state.bondPositions.find((p) => p.identity.isin === isin);
    const held = resolveBondHolding(rec, positions);
    const s = computeBondRiskSummary(state.bondPositions, { positions, quotes: getCachedBondQuotes() });
    const row = s.rows[0];
    return {
      거래건수: state.transactions.filter((t) => t.ticker === isin).length,
      Position: { quantity: pos.quantity, avgPrice: pos.avgPrice },
      Asset: { quantity: asset.quantity, buyPrice: asset.buyPrice, category: asset.category, positionSource: asset.positionSource },
      BondPosition: { source: held.source, quantity: held.quantity, faceAmount: held.faceAmount, purchaseAmount: held.purchaseAmount },
      BondRisk: { valuationSource: row.valuationSource, amount: row.amount, priceBasisFace: row.priceBasisFace, durationOk: row.duration.status === 'OK' },
      RiskEligible: riskEligibleAssets().some((a) => a.ticker === isin),
      중복BondRecord: state.bondPositions.filter((p) => p.identity.isin === isin).length
    };
  }, BOND_ISIN);

  expect(trace.거래건수).toBe(1);
  expect(trace.Position).toEqual({ quantity: 1000, avgPrice: 9800 });
  expect(trace.Asset).toEqual({ quantity: 1000, buyPrice: 9800, category: '채권', positionSource: 'ledger' });
  expect(trace.BondPosition).toEqual({ source: 'LEDGER', quantity: 1000, faceAmount: 10000000, purchaseAmount: 9800000 });
  expect(trace.BondRisk).toEqual({ valuationSource: 'MARKET', amount: 6785000, priceBasisFace: 10000, durationOk: true });
  expect(trace.RiskEligible).toBe(false);   // 채권은 Equity Risk 대상이 아니다
  expect(trace.중복BondRecord).toBe(1);
});

/* ══════════ 6. Portfolio Risk UI (§5~§9) ══════════ */

async function seedMetrics(page) {
  await page.evaluate(() => {
    const subScores = { concentration: 30, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = {
      totalCur: 10000000, holdings: [], missingCount: 0,
      topWeight: 30, topHolding: { name: 'ZZ테스트', benchmarkKey: 'KOSPI', riskContributionPct: 30 },
      hhi: 0.3, portfolioBeta: 1.0, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, weightedAvgCorrelation: 0.4,
      topCorrelation: null, topCorrelationPair: null,
      sectorExposure: { topSector: '반도체', topSectorWeight: 30, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: 90, dataConfidence: { score: 92, reasons: ['수급 지표는 추정치'] }
    };
    renderRiskDiagnosisSummary();
  });
}

test('9. 점수 이름이 "포트폴리오 종합 위험점수"이고 (i)가 점수와 같은 줄에 있다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function');
  await seedMetrics(page);
  const card = page.locator('#riskDiagnosisSummary');
  await expect(card).toContainText('포트폴리오 종합 위험점수');
  await expect(page.locator('#portfolioRiskInfoBtn')).toBeVisible();
  const same = await page.evaluate(() => {
    const spans = document.querySelectorAll('#riskDiagnosisSummary span.whitespace-nowrap');
    const b = document.getElementById('portfolioRiskInfoBtn').getBoundingClientRect();
    const s = spans[1].getBoundingClientRect();
    return Math.abs(s.top - b.top) < 12;
  });
  expect(same).toBe(true);
  // 기존 세부내용 버튼과 역할이 분리돼 공존한다.
  await expect(page.locator('#riskDetailBtn')).toBeVisible();
});

test('10. (i)를 누르면 「포트폴리오 위험 안내」가 열리고 6대 요인 · 대상 범위가 전부 들어 있다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function');
  await seedMetrics(page);
  await page.locator('#portfolioRiskInfoBtn').click();
  const modal = page.locator('#portfolioRiskInfoModal');
  await expect(modal).toBeVisible();
  const txt = await modal.innerText();
  ['집중도', '변동성', '손실위험', '시장위험', '상관관계', '기술/수급',
    '가구 전체', '주식 · ETF', '현금 · 채권 · 부동산', '채권 위험'].forEach((k) => expect(txt).toContain(k));
  // 새 조언 · 새 지표를 넣지 않았다.
  expect(txt).not.toContain('추천');
  expect(txt).not.toContain('매수');
  await page.locator('#closePortfolioRiskInfoBtn').click();
  await expect(modal).toBeHidden();
});

/* [기대값 갱신 · PM 지시 2026-09-22] V1.3 P1-1의 "메인 카드 상시 노출"은 이 지시로 개정됐다 -
 * 「⚠️ 위험 관리」 제목과 진단 대상 고지(#riskScopeNote)를 점수 옆 ⓘ 「포트폴리오 위험 안내」
 * 팝업 하나로 합쳤다(SoT §52-13). 계약은 유지한다 - 고지가 사라지지 않고 팝업에서 읽힌다. */
test('11. 진단 대상 고지는 점수 옆 ⓘ 팝업으로 합쳐졌다(정보는 사라지지 않았다)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function');
  await seedMetrics(page);
  // 메인 카드의 상시 노출 줄과 제목은 없어졌다.
  await expect(page.locator('#riskScopeNote')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '위험 관리', exact: true })).toHaveCount(0);
  // 같은 고지를 ⓘ 팝업에서 읽을 수 있다.
  await page.locator('#portfolioRiskInfoBtn').click();
  await expect(page.locator('#portfolioRiskInfoModal')).toBeVisible();
  const t = await page.locator('#portfolioRiskInfoModal').innerText();
  expect(t).toContain('주식 · ETF');
  expect(t).toContain('채권');
  expect(t).toContain('가구 전체');
});

[375, 390, 1440].forEach((w) => {
  test(`12. ${w}px - 점수가 잘리지 않고 카드가 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function');
    await seedMetrics(page);
    const r = await page.evaluate(() => {
      const card = document.getElementById('riskDiagnosisSummary');
      const spans = card.querySelectorAll('span.whitespace-nowrap');
      const btn = document.getElementById('portfolioRiskInfoBtn');
      return {
        카드넘침: card.scrollWidth > card.clientWidth + 1,
        글자잘림: [...spans].some((s) => s.scrollWidth > s.clientWidth + 1),
        페이지가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        점수와info같은줄: Math.abs(spans[1].getBoundingClientRect().top - btn.getBoundingClientRect().top) < 12,
        글자크기: parseFloat(getComputedStyle(spans[1]).fontSize)
      };
    });
    expect(r.카드넘침).toBe(false);
    expect(r.글자잘림).toBe(false);
    expect(r.페이지가로스크롤).toBe(false);
    expect(r.점수와info같은줄).toBe(true);
    expect(r.글자크기).toBeGreaterThanOrEqual(14);   // 가독성 기준
  });

  test(`13. ${w}px - 안내 팝업이 화면 밖으로 나가지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => typeof renderRiskDiagnosisSummary === 'function');
    await seedMetrics(page);
    await page.locator('#portfolioRiskInfoBtn').click();
    const r = await page.evaluate(() => {
      const box = document.querySelector('#portfolioRiskInfoModal > div').getBoundingClientRect();
      return { 좌: box.left >= 0, 우: box.right <= window.innerWidth + 1, 상: box.top >= 0, 하: box.bottom <= window.innerHeight + 1 };
    });
    expect(r).toEqual({ 좌: true, 우: true, 상: true, 하: true });
  });
});
