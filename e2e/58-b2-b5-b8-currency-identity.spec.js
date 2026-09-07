// E2E-58 [B-2 / B-5 / B-8] 무티커 자산의 통화·지역 identity.
//
// [무엇을 고정하는가] 티커가 없는 자산은 이름만으로는 같은 자산인지 알 수 없다. 같은 계좌 안에
// 이름이 같은 원화 예수금과 달러 예수금이 함께 있을 수 있고, 같은 이름의 달러를 국내 계좌와 해외
// 계좌에 나눠 들고 있을 수도 있다. 그 둘을 하나로 보면:
//   B-2  엑셀/JSON [추가하기]에서 자산이 실제로 사라지거나 복제된다(파일의 행 순서에 따라 결과가
//        뒤집혔다 - 실측 2,450만 -> 2,000만, 2,175만 -> 2,900만).
//   B-5  거래원장 동기화가 배열에서 먼저 나오는 자산을 잡고, 그게 원화 현금이면 원화현금 가드가
//        걸려 return 해버려 달러 거래가 아예 반영되지 않았다(buyRate까지 비어 환차손익 근거 소실).
//        같은 뿌리로 실현손익도 통화가 섞여 계산됐다(실측 -155,551,250원, 정상값 +2,200,000원).
//   B-8  id가 없는 구형 파일에서 원화 자산이 달러 자산의 positionSource를 이어받았다.
//
// [무엇을 바꾸지 않았는가] 티커가 있는 자산의 매칭 규칙, 원화현금 가드의 의미, positionSource 정책,
// 환율·환차손익 산식, Projection/MC/Risk/Safety 계산. 아래 대조군 테스트가 그것을 함께 고정한다.
//
// 외부 네트워크를 쓰지 않는다 - 시드가 전부 현금/채권/시세 불필요 자산이고 playwright.config.js의
// DNS 격리가 그대로 적용된다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof mergeAssetsForAppend === 'function');
  await page.evaluate(() => { state.exchangeRate = 1450; persistRate(true); });
}

// ─────────────────────────── B-2 : Excel / JSON [추가하기] ───────────────────────────

test('B-2 A. 파일 행 순서가 뒤집혀도 통화가 다른 자산이 사라지거나 복제되지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (name, currency, isDomestic, quantity) => makeAsset({ ticker: '', name, category: '현금', currency, isDomestic, owner: '신랑', accountType: '일반계좌', quantity, buyPrice: 1, currentPrice: 1 });
    const K = () => cash('예수금', 'KRW', '국내', 10000000);
    const U = () => cash('예수금', 'USD', '국내', 10000); // 1,450만원
    const sum = (arr) => Math.round(arr.reduce((s, a) => s + calcRow(a).curAmount, 0));
    const run = (existing, incoming) => {
      const out = mergeAssetsForAppend(existing, incoming);
      return { list: out.assets.map((a) => `${a.name}/${a.currency}/${a.quantity}`), total: sum(out.assets) };
    };
    return {
      정순: run([K(), U()], [K(), U()]),
      역순: run([K(), U()], [U(), K()]),
      한쪽만: run([K(), U()], [K()]),
      기준총액: sum([K(), U()]),
    };
  });

  expect(r.기준총액).toBe(24500000);
  // 수정 전에는 역순/한쪽만에서 2,000만이 되어 달러분이 통째로 사라졌다.
  for (const key of ['정순', '역순', '한쪽만']) {
    expect(r[key].total, `${key}에서 총액이 달라졌다`).toBe(24500000);
    expect(r[key].list).toHaveLength(2);
    expect(r[key].list).toContain('예수금/KRW/10000000');
    expect(r[key].list).toContain('예수금/USD/10000');
  }
});

test('B-2 B. 같은 이름·같은 통화의 달러를 국내/해외로 나눠 보유해도 섞이지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (name, currency, isDomestic, quantity) => makeAsset({ ticker: '', name, category: '현금', currency, isDomestic, owner: '신랑', accountType: '일반계좌', quantity, buyPrice: 1, currentPrice: 1 });
    const D = () => cash('달러', 'USD', '국내', 10000); // 1,450만
    const F = () => cash('달러', 'USD', '해외', 5000);  //   725만
    const out = mergeAssetsForAppend([D(), F()], [F(), D()]);
    return { list: out.assets.map((a) => `${a.name}/${a.isDomestic}/${a.quantity}`), total: Math.round(out.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)) };
  });
  // 수정 전에는 2,175만 -> 2,900만으로 부풀고 해외분이 사라졌다.
  expect(r.total).toBe(21750000);
  expect(r.list).toEqual(['달러/국내/10000', '달러/해외/5000']);
});

test('B-2 C. [대조군] 같은 통화·같은 지역·같은 이름은 예전처럼 하나로 병합된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (q) => makeAsset({ ticker: '', name: '예수금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: q, buyPrice: 1, currentPrice: 1 });
    const out = mergeAssetsForAppend([cash(10000000)], [cash(12000000)]);
    return { count: out.assets.length, qty: out.assets[0].quantity, newCount: out.newCount, updatedCount: out.updatedCount };
  });
  // identity를 좁혔다고 해서 정상 병합까지 갈라지면 안 된다 - 파일 값으로 갱신되어야 한다.
  expect(r.count).toBe(1);
  expect(r.qty).toBe(12000000);
  expect(r.newCount).toBe(0);
  expect(r.updatedCount).toBe(1);
});

test('B-2 D. [대조군] 티커가 있는 자산의 매칭 규칙은 그대로다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const kr = () => makeAsset({ ticker: '005930.KS', name: '삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000, currentPrice: 80000 });
    const us = () => makeAsset({ ticker: 'AAPL', name: 'Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120 });
    const out = mergeAssetsForAppend([kr(), us()], [us(), kr()]);
    return {
      list: out.assets.map((a) => `${a.ticker}/${a.quantity}`),
      total: Math.round(out.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
      키: [assetMergeKey(kr()), assetMergeKey(us())],
    };
  });
  expect(r.list).toEqual(['005930.KS/100', 'AAPL/100']);
  expect(r.total).toBe(25400000);
  // 티커 자산의 키는 예전 형식 그대로여야 한다(통화/지역이 붙지 않는다).
  expect(r.키).toEqual(['신랑|일반계좌|005930.KS', '신랑|일반계좌|AAPL']);
});

// ─────────────────────────── B-5 : 거래원장 동기화 ───────────────────────────

test('B-5 A. 자산 배열 순서와 무관하게 달러 거래가 달러 자산에 반영된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (name, currency, quantity) => makeAsset({ ticker: '', name, category: '현금', currency, isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity, buyPrice: 1, currentPrice: 1 });
    const tx = { id: 'b5tx', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '예수금', type: 'buy', quantity: 7000, price: 1, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 };
    const run = (assets) => {
      state.assets = assets; state.transactions = [tx];
      syncAssetsFromTransactions();
      return {
        list: state.assets.map((a) => `${a.name}/${a.currency}/${a.quantity}/${a.buyRate ?? '-'}`),
        total: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
      };
    };
    return {
      원화가앞: run([cash('예수금', 'KRW', 10000000), cash('예수금', 'USD', 10000)]),
      달러가앞: run([cash('예수금', 'USD', 10000), cash('예수금', 'KRW', 10000000)]),
    };
  });

  // 수정 전에는 "원화가앞"에서 달러 자산이 전혀 동기화되지 않아 총평가가 2,450만으로 남았다.
  expect(r.원화가앞.total).toBe(r.달러가앞.total);
  expect(r.원화가앞.total).toBe(20150000); // 원화 1,000만 + 달러 $7,000 × 1,450 = 1,015만
  expect(r.원화가앞.list).toContain('예수금/USD/7000/1300'); // 수량과 취득환율이 거래원장 기준으로 채워졌다
  expect(r.원화가앞.list).toContain('예수금/KRW/10000000/-'); // 원화 현금은 그대로(가드 유지)
  expect(r.달러가앞.list).toContain('예수금/USD/7000/1300');
});

test('B-5 B. [대조군] 원화현금 가드는 그대로 살아 있다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: '', name: '예수금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10000000, buyPrice: 1, currentPrice: 1 })];
    state.transactions = [{ id: 'k1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '예수금', type: 'buy', quantity: 500, price: 1, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    syncAssetsFromTransactions();
    return state.assets.map((a) => `${a.name}/${a.currency}/${a.quantity}`);
  });
  // 원화 현금은 자산관리 탭이 유일한 관리 창구다 - 거래가 남아 있어도 절대 덮어쓰지 않는다.
  expect(r).toEqual(['예수금/KRW/10000000']);
});

test('B-5 C. 같은 이름의 원화/달러 거래가 하나의 포지션으로 합쳐지지 않는다(실현손익)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [];
    state.transactions = [
      { id: 'p1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '실물채권', type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'p2', date: '2025-02-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '실물채권', type: 'buy', quantity: 100, price: 100, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'period', createdAt: 2, updatedAt: 2 },
      { id: 'p3', date: '2025-03-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '실물채권', type: 'sell', quantity: 50, price: 120, currency: 'USD', appliedRate: 1450, fee: 0, origin: 'period', createdAt: 3, updatedAt: 3 },
    ];
    const { positions, annotated } = computePositionsAndRealizedPnL();
    return {
      count: Object.keys(positions).length,
      positions: Object.values(positions).map((p) => ({ currency: p.currency, qty: p.quantity, avgPrice: p.avgPrice, avgRate: p.avgRate })),
      realized: annotated.filter((t) => t.type === 'sell').map((t) => Math.round(t.computedRealizedPnL)),
    };
  });

  // 수정 전에는 포지션이 1개로 합쳐져 평단가 5,050 / 가중평균환율 650.5 / 실현손익 -155,551,250원이었다.
  expect(r.count).toBe(2);
  const krw = r.positions.find((p) => p.currency === 'KRW');
  const usd = r.positions.find((p) => p.currency === 'USD');
  expect(krw).toMatchObject({ qty: 100, avgPrice: 10000, avgRate: 1 });
  expect(usd).toMatchObject({ qty: 50, avgPrice: 100, avgRate: 1300 });
  // ($120 × 50 × 1,450) − ($100 × 50 × 1,300) = 8,700,000 − 6,500,000 = 2,200,000
  expect(r.realized).toEqual([2200000]);
});

test('B-5 D. 초과매도 검증도 같은 통화의 포지션만 본다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [];
    state.transactions = [
      { id: 'q1', date: '2025-01-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '실물채권', type: 'buy', quantity: 100, price: 10000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 },
      { id: 'q2', date: '2025-02-01', owner: '신랑', accountType: '일반계좌', ticker: '', name: '실물채권', type: 'buy', quantity: 30, price: 100, currency: 'USD', appliedRate: 1300, fee: 0, origin: 'period', createdAt: 2, updatedAt: 2 },
    ];
    return {
      krw: computeCurrentHoldingQuantity('신랑', '일반계좌', '', '실물채권', 'KRW'),
      usd: computeCurrentHoldingQuantity('신랑', '일반계좌', '', '실물채권', 'USD'),
    };
  });
  // 수정 전에는 둘 다 130이 나와, 달러 30주만 있는데 100주 매도가 통과할 수 있었다.
  expect(r.krw).toBe(100);
  expect(r.usd).toBe(30);
});

// ─────────────────────────── B-8 : positionSource carry-over ───────────────────────────

test('B-8 A. id가 없는 구형 파일에서도 positionSource가 통화·지역을 넘어 교차되지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (name, currency, isDomestic, quantity, positionSource) => makeAsset({ ticker: '', name, category: '현금', currency, isDomestic, owner: '신랑', accountType: '일반계좌', quantity, buyPrice: 1, currentPrice: 1, positionSource });
    // (1) 같은 지역, 통화만 다름
    const kept1 = [cash('예수금', 'KRW', '국내', 10000000, 'manual'), cash('예수금', 'USD', '국내', 10000, 'ledger')];
    const idx1 = buildPositionSourceIndex(kept1);
    const old1 = [cash('예수금', 'KRW', '국내', 10000000), cash('예수금', 'USD', '국내', 10000)]; // id 새로 발급됨 = 구형 파일
    // (2) 같은 통화, 지역만 다름
    const kept2 = [cash('달러', 'USD', '국내', 10000, 'manual'), cash('달러', 'USD', '해외', 5000, 'ledger')];
    const idx2 = buildPositionSourceIndex(kept2);
    const old2 = [cash('달러', 'USD', '국내', 10000), cash('달러', 'USD', '해외', 5000)];
    return {
      byKey1: idx1.byKey.size,
      결과1: old1.map((a) => carryOverPositionSource(a, idx1).positionSource ?? 'UNDEF'),
      byKey2: idx2.byKey.size,
      결과2: old2.map((a) => carryOverPositionSource(a, idx2).positionSource ?? 'UNDEF'),
    };
  });
  // 수정 전에는 byKey 크기가 1이라 두 자산 모두 'ledger'를 이어받았다.
  expect(r.byKey1).toBe(2);
  expect(r.결과1).toEqual(['manual', 'ledger']);
  expect(r.byKey2).toBe(2);
  expect(r.결과2).toEqual(['manual', 'ledger']);
});

test('B-8 B. id가 있는 최신 파일도 그대로 정확하다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const cash = (name, currency, quantity, positionSource) => makeAsset({ ticker: '', name, category: '현금', currency, isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity, buyPrice: 1, currentPrice: 1, positionSource });
    const kept = [cash('예수금', 'KRW', 10000000, 'manual'), cash('예수금', 'USD', 10000, 'ledger')];
    const idx = buildPositionSourceIndex(kept);
    const newFile = kept.map((a) => ({ ...cash(a.name, a.currency, a.quantity), id: a.id }));
    // append 경로(파일 값으로 갱신하되 id와 positionSource는 이어받는다)
    const appended = mergeAssetsForAppend(kept, [cash('예수금', 'KRW', 11000000), cash('예수금', 'USD', 11000)]);
    return {
      overwrite: newFile.map((a) => carryOverPositionSource(a, idx).positionSource ?? 'UNDEF'),
      append: appended.assets.map((a) => `${a.currency}/${a.quantity}/${a.positionSource ?? 'UNDEF'}`),
    };
  });
  expect(r.overwrite).toEqual(['manual', 'ledger']);
  expect(r.append).toEqual(['KRW/11000000/manual', 'USD/11000/ledger']);
});

// ─────────────────────────── 회귀 : 환율 / 환차손익 / 계산 엔진 ───────────────────────────

test('회귀 A. 환율·환차손익 산식이 그대로다 (총손익 = 투자손익 + 환차손익)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: 'AAPL', name: 'Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120, buyRate: 1300 })];
    state.transactions = [];
    const at = (rate) => {
      state.exchangeRate = rate;
      const row = calcRow(state.assets[0]);
      const fx = computeForeignFxPnL();
      return { 매입원가: Math.round(row.buyAmount), 평가금액: Math.round(row.curAmount), 총손익: Math.round(row.profit), FX손익: Math.round(fx), 투자손익: Math.round(row.profit - fx) };
    };
    return { r1300: at(1300), r1450: at(1450), r1600: at(1600) };
  });
  expect(r.r1300).toEqual({ 매입원가: 13000000, 평가금액: 15600000, 총손익: 2600000, FX손익: 0, 투자손익: 2600000 });
  expect(r.r1450).toEqual({ 매입원가: 13000000, 평가금액: 17400000, 총손익: 4400000, FX손익: 1500000, 투자손익: 2900000 });
  expect(r.r1600).toEqual({ 매입원가: 13000000, 평가금액: 19200000, 총손익: 6200000, FX손익: 3000000, 투자손익: 3200000 });
});

test('회귀 B. Projection / MC / Risk 입력이 이 수정으로 바뀌지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.transactions = [];
    state.assets = [
      makeAsset({ ticker: '005930.KS', name: '삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 70000, currentPrice: 80000 }),
      makeAsset({ ticker: 'AAPL', name: 'Apple', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 100, buyPrice: 100, currentPrice: 120 }),
      makeAsset({ ticker: '', name: '원화현금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 5000000, buyPrice: 1, currentPrice: 1 }),
    ];
    REBALANCE_OWNERS.forEach((o) => {
      state.rebalance[o].domestic = { '국내': 50, '해외': 50 };
      state.rebalance[o].targets = {
        '국내': [{ type: 'ticker', ticker: '005930.KS', label: '삼성전자', pct: 60 }, { type: 'namedHolding', name: '원화현금', label: '원화현금', pct: 40 }],
        '해외': [{ type: 'ticker', ticker: 'AAPL', label: 'Apple', pct: 100 }],
      };
    });
    persistAssets(); persistRebalance();
    return {
      리밸런싱총액: Math.round(getRebalanceTotals('신랑').total),
      Projection원금: Math.round(getProjectionGroupTotal(getProjectionGroupStats('신랑'))),
      Projection20년: Math.round(simulateRebalancedPreset('normal', 20).yearlyPoints[20].total),
      MC원금: Math.round(computeHouseholdMonteCarloPV()),
      MC가중치: Array.from(computeHouseholdTargetInstrumentWeights().entries()).map(([k, v]) => [k, +v.weight.toFixed(4)]),
      Risk대상: riskEligibleAssets().map((a) => a.ticker),
    };
  });
  expect(r.리밸런싱총액).toBe(30400000);
  expect(r.Projection원금).toBe(30400000);
  expect(r.Projection20년).toBe(1268261656);
  expect(r.MC원금).toBe(30400000);
  expect(r.MC가중치).toEqual([['T:005930.KS', 0.3], ['N:국내:원화현금', 0.2], ['T:AAPL', 0.5]]);
  expect(r.Risk대상).toEqual(['005930.KS', 'AAPL']);
});
