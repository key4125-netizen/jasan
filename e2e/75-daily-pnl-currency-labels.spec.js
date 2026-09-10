// E2E-75 [일간금융평가손익 용어 정비] 표시 이름만 바꾸고 숫자는 한 원도 바뀌지 않는다.
//
// 고친 것: 카드 하단 태그가 '원화'/'해외통화'/'달러'였는데, '해외통화'와 '달러'가 같은 것을 가리키는
// 것처럼 읽혔다 - 실제로는 '해외통화' 버킷에 해외주식·해외 ETF까지 전부 들어가고 달러 현금은 그
// 일부일 뿐이다. 이제 '원화자산'/'외화자산'/'달러 현금'으로 범위를 이름에 담는다.
//
// 이 테스트가 지키는 것은 두 가지다.
//   ① 새 라벨이 실제로 화면에 나오고, 옛 라벨이 이 카드에 남아 있지 않다.
//   ② 라벨만 바뀌었을 뿐 집계 키와 금액은 그대로다 - 특히 categoryDisplayKey()의 반환값('달러')은
//      recordDailySnapshot(js/11)이 state.dailySnapshots에 날짜별로 저장하는 값이라, 이게 바뀌면
//      과거 스냅샷과 앞으로의 스냅샷이 다른 항목으로 갈라진다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderKPIs === 'function' && typeof calcDailyPnL === 'function');
}

// 세 통화/자산군 버킷이 모두 0이 아니게 만드는 합성 시드(메모리 전용 - persist하지 않는다).
// 실제 사용자 데이터는 쓰지 않는다.
const SEED = () => {
  state.assets = [
    makeAsset({ ticker: '005930.KS', name: 'E75국내주식', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 70000, currentPrice: 80000 }),
    makeAsset({ ticker: 'QQQM', name: 'E75해외ETF', category: 'ETF', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: '일반계좌', quantity: 5, buyPrice: 200, currentPrice: 210 }),
    makeAsset({ ticker: '', name: 'E75달러예수금', category: '현금', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 1000, buyPrice: 1, currentPrice: 1 }),
    makeAsset({ ticker: '', name: 'E75원화예수금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '일반계좌', quantity: 5000000, buyPrice: 1, currentPrice: 1 }),
    makeAsset({ ticker: '', name: 'E75국고채', category: '채권', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 10000000, currentPrice: 10000000 }),
  ];
  state.transactions = [];
  state.exchangeRate = 1400;
  state.refExchangeRate = 1350; // 어제 대비 환율이 올라 외화자산에 환차가 잡힌다
  state.prevCloseMap = { [state.assets[0].id]: 78000, [state.assets[1].id]: 205 };
  state.dayChangeMap = {};
  // [테스트 결정성] noNewSessionMap을 비워 두면 calcDailyPnL이 시장별 "일간 리셋 창"
  // (isMarketInDailyResetWindow - 주말이거나 그 시장 기준 개장 전이면 true) 근사 로직으로 폴백해
  // 손익이 0이 된다. 그러면 이 테스트가 "지금이 몇 시인지"에 따라 통과/실패가 갈린다 - 두 종목 모두
  // "오늘 새 정규장 체결이 있었다"고 명시해 시계와 무관하게 같은 결과가 나오게 한다.
  state.noNewSessionMap = { [state.assets[0].id]: false, [state.assets[1].id]: false };
  state.sessionMap = {};
  renderKPIs();
};

test('A. 통화 태그가 원화자산/외화자산으로 표시된다', async ({ page }) => {
  await open(page);
  const got = await page.locator('body').evaluate((el, seed) => {
    new Function(`return (${seed})`)()();
    return [...el.ownerDocument.getElementById('kpiDailyCurrencyBreakdown').querySelectorAll('span')]
      .map((s) => s.textContent.trim());
  }, SEED.toString());
  expect(got.some((t) => t.startsWith('원화자산 '))).toBe(true);
  expect(got.some((t) => t.startsWith('외화자산 '))).toBe(true);
  // 옛 라벨이 이 카드에 남아 있으면 안 된다("원화자산"은 "원화"를 포함하므로 정확히 라벨 단위로 본다).
  expect(got.some((t) => t.startsWith('원화 ') || t.startsWith('해외통화 '))).toBe(false);
});

test('B. USD 현금 태그가 달러 현금으로 표시된다', async ({ page }) => {
  await open(page);
  const got = await page.locator('body').evaluate((el, seed) => {
    new Function(`return (${seed})`)()();
    return [...el.ownerDocument.getElementById('kpiDailyProfitBreakdown').querySelectorAll('span')]
      .map((s) => s.textContent.trim());
  }, SEED.toString());
  expect(got.some((t) => t.startsWith('달러 현금 '))).toBe(true);
  expect(got.some((t) => t.startsWith('달러 +') || t.startsWith('달러 -'))).toBe(false);
  // 주식/ETF 라벨은 바꾸지 않았다.
  expect(got.some((t) => t.startsWith('주식 '))).toBe(true);
  expect(got.some((t) => t.startsWith('ETF '))).toBe(true);
});

test('C. 집계 키는 그대로다 - 스냅샷에 저장되는 값이 바뀌지 않았다', async ({ page }) => {
  await open(page);
  const got = await page.locator('body').evaluate((el, seed) => {
    new Function(`return (${seed})`)()();
    const usdCash = state.assets.find((a) => a.name === 'E75달러예수금');
    const krwCash = state.assets.find((a) => a.name === 'E75원화예수금');
    return { usd: categoryDisplayKey(usdCash), krw: categoryDisplayKey(krwCash), label: kpiBreakdownLabel('달러') };
  }, SEED.toString());
  // 저장되는 키는 예전 그대로 '달러'여야 한다(js/11 recordDailySnapshot이 이 값을 날짜별로 남긴다).
  expect(got.usd, '집계 키는 바뀌지 않는다').toBe('달러');
  expect(got.krw).toBe('현금');
  // 화면에 찍는 이름만 달라진다.
  expect(got.label).toBe('달러 현금');
});

test('D. 숫자가 바뀌지 않았다 - 세 축 합계가 헤드라인과 정확히 일치한다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el, seed) => {
    new Function(`return (${seed})`)()();
    // 라벨과 무관하게 원천값을 직접 재계산해 비교한다.
    let fin = 0, krw = 0, fx = 0;
    const byCat = {}, byOwn = {};
    state.assets.forEach((a) => {
      const row = calcRow(a);
      const dp = calcDailyPnL(a, row);
      if (a.category === '부동산') return;
      fin += dp;
      if (a.currency === 'KRW') krw += dp; else fx += dp;
      const k = categoryDisplayKey(a);
      byCat[k] = (byCat[k] || 0) + dp;
      byOwn[a.owner] = (byOwn[a.owner] || 0) + dp;
    });
    const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
    return {
      headlineDOM: el.ownerDocument.getElementById('kpiDailyProfit').textContent,
      headlineCalc: fmtSigned(fin),
      currencySumOk: Math.abs((krw + fx) - fin) < 1e-9,
      categorySumOk: Math.abs(sum(byCat) - fin) < 1e-9,
      ownerSumOk: Math.abs(sum(byOwn) - fin) < 1e-9,
      // 채권/원화현금은 버킷에 0으로 존재한다(누락이 아니라 값이 0이라 태그가 숨겨질 뿐).
      bondBucketZero: byCat['채권'] === 0,
      krwCashBucketZero: byCat['현금'] === 0,
    };
  }, SEED.toString());
  expect(r.headlineDOM).toBe(r.headlineCalc);
  expect(r.currencySumOk, '원화자산 + 외화자산 = 전체').toBe(true);
  expect(r.categorySumOk, '자산군 합계 = 전체').toBe(true);
  expect(r.ownerSumOk, '소유자 합계 = 전체').toBe(true);
  expect(r.bondBucketZero).toBe(true);
  expect(r.krwCashBucketZero).toBe(true);
});

test('E. 375px에서 가장 긴 라벨도 한 줄에 들어가고 가로 overflow가 없다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const r = await page.locator('body').evaluate((el) => {
    const doc = el.ownerDocument;
    doc.documentElement.classList.add('dark');
    // 만원 단위 4자리(-9,999만원)가 붙은 최악의 길이로 강제로 그려 본다.
    renderKpiBreakdown('kpiDailyProfitBreakdown',
      { '달러': { v: -99990000 }, 'ETF': { v: -98760000 }, '주식': { v: 12340000 } },
      (o) => o.v, fmtSignedShort, true);
    renderKpiBreakdown('kpiDailyCurrencyBreakdown',
      { '외화자산': { v: -99990000 }, '원화자산': { v: -98760000 } },
      (o) => o.v, fmtSignedShort, true, 'text-sm font-semibold');
    const inspect = (id) => [...doc.getElementById(id).querySelectorAll('span')].map((s) => ({
      text: s.textContent.trim(),
      lines: s.getClientRects().length,
      fontSize: parseFloat(doc.defaultView.getComputedStyle(s).fontSize),
    }));
    return {
      tags: [...inspect('kpiDailyProfitBreakdown'), ...inspect('kpiDailyCurrencyBreakdown')],
      overflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
    };
  });
  expect(r.overflowX, '가로 스크롤이 생기지 않는다').toBe(false);
  for (const t of r.tags) {
    expect(t.lines, `${t.text} 는 한 줄이어야 한다`).toBe(1);
    expect(t.fontSize, `${t.text} 글자 크기 14px 유지`).toBeGreaterThanOrEqual(14);
  }
  expect(r.tags.some((t) => t.text.startsWith('달러 현금 '))).toBe(true);
});
