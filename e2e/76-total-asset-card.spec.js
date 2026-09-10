// E2E-76 [총자산평가금액 카드 - 계산 범위 정정 + 정보 구조] 카드가 보여주는 포함관계가 실제 계산과 같다.
//
// 고친 것: "달러자산 평가금액"이 isRealEstate 분기 밖에서 집계돼 USD 부동산까지 포함하고 있었다.
// 바로 윗줄인 "금융자산 총평가금액"은 부동산을 빼므로 두 줄의 모집합이 달랐고, USD 부동산을 가진
// 사용자에게는 달러자산이 금융자산보다 크게 표시됐다. 이제 두 줄 모두 금융자산 범위로 맞춰
//   총자산 = 금융자산(= 원화자산 + 달러자산) + 부동산
// 이 항상 성립한다.
//
// 함께: "달러자산 누적 환차손익" -> "달러자산 미실현 환차손익"(계산식 무변경 - computeForeignFxPnL은
// 지금 보유 중인 USD 주식/ETF/현금만 훑으므로 실현분이 들어있지 않다).
//
// fixture는 전부 합성 데이터다 - 실제 사용자 데이터/백업을 쓰지 않는다.
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof renderKPIs === 'function' && typeof computeForeignFxPnL === 'function');
}

// PM 지정 fixture: KRW 주식/ETF/채권/현금 + USD 주식/ETF/채권/현금 + KRW 부동산 + USD 부동산
// + owner가 비어 있는 legacy 자산 1건(기존 동작을 임의로 없애지 않았는지 확인용).
const SEED = () => {
  const mk = (o) => makeAsset(o);
  state.assets = [
    mk({ ticker: '005930.KS', name: 'E76_KRW주식', category: '주식', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 70000, currentPrice: 80000 }),
    mk({ ticker: '069500.KS', name: 'E76_KRW_ETF', category: 'ETF', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '일반계좌', quantity: 100, buyPrice: 30000, currentPrice: 31000 }),
    mk({ ticker: '', name: 'E76_KRW채권', category: '채권', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 9000000, currentPrice: 9300000 }),
    mk({ ticker: '', name: 'E76_KRW현금', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '와이프', accountType: '일반계좌', quantity: 9000000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: 'GOOGL', name: 'E76_USD주식', category: '주식', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 20, buyPrice: 300, currentPrice: 340 }),
    mk({ ticker: 'QQQM', name: 'E76_USD_ETF', category: 'ETF', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: '일반계좌', quantity: 50, buyPrice: 200, currentPrice: 210 }),
    mk({ ticker: '', name: 'E76_USD채권', category: '채권', currency: 'USD', isDomestic: '해외', owner: '신랑', accountType: '일반계좌', quantity: 3000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: 'E76_USD현금', category: '현금', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: '일반계좌', quantity: 11000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: 'E76_KRW부동산', category: '부동산', currency: 'KRW', isDomestic: '국내', owner: '신랑', accountType: '부동산', quantity: 1, buyPrice: 300000000, currentPrice: 500000000 }),
    mk({ ticker: '', name: 'E76_USD부동산', category: '부동산', currency: 'USD', isDomestic: '해외', owner: '와이프', accountType: '부동산', quantity: 200000, buyPrice: 1, currentPrice: 1 }),
    mk({ ticker: '', name: 'E76_소유자없음', category: '현금', currency: 'KRW', isDomestic: '국내', owner: '', accountType: '일반계좌', quantity: 1234567, buyPrice: 1, currentPrice: 1 }),
  ];
  state.assets.forEach((a) => { if (a.currency === 'USD') a.buyRate = 1300; });
  state.transactions = [];
  state.exchangeRate = 1400;
  state.refExchangeRate = 1350;
  state.prevCloseMap = {};
  state.dayChangeMap = {};
  state.noNewSessionMap = {};
  state.sessionMap = {};
  renderKPIs();
};

// 화면 표시값과, 라벨과 무관하게 직접 재계산한 원천값을 함께 돌려준다.
const READ = () => {
  const doc = globalThis.document;
  const txt = (id) => doc.getElementById(id).textContent;
  const tags = (id) => [...doc.getElementById(id).querySelectorAll('span')].map((s) => s.textContent.trim());
  let totalCur = 0, finCur = 0, reCur = 0, krwFin = 0, usdFin = 0;
  const byOwn = {}, byCat = {};
  state.assets.forEach((a) => {
    const r = calcRow(a);
    totalCur += r.curAmount;
    if (a.category === '부동산') reCur += r.curAmount;
    else {
      finCur += r.curAmount;
      if (a.currency === 'USD') usdFin += r.curAmount; else krwFin += r.curAmount;
    }
    byOwn[a.owner] = (byOwn[a.owner] || 0) + r.curAmount;
    const k = categoryDisplayKey(a);
    byCat[k] = (byCat[k] || 0) + r.curAmount;
  });
  const one = (name) => calcRow(state.assets.find((a) => a.name === name)).curAmount;
  return {
    dom: {
      total: txt('kpiTotalValue'), financial: txt('kpiFinancialValue'), krw: txt('kpiKrwFinancialValue'),
      usd: txt('kpiForeignValueInline'), fx: txt('kpiForeignFxPnl'), realEstate: txt('kpiRealEstateValue'),
      dailyProfit: txt('kpiDailyProfit'),
    },
    ownerTags: tags('kpiTotalValueOwnerBreakdown'),
    catTags: tags('kpiTotalValueBreakdown'),
    catLabel: doc.getElementById('kpiTotalValueBreakdownWrap').querySelector('span').textContent.trim(),
    calc: { totalCur, finCur, reCur, krwFin, usdFin, fxPnL: computeForeignFxPnL(),
            ownerSum: Object.values(byOwn).reduce((s, v) => s + v, 0),
            catSum: Object.values(byCat).reduce((s, v) => s + v, 0),
            usdCash: one('E76_USD현금'), usdBond: one('E76_USD채권'), usdRealEstate: one('E76_USD부동산') },
    usdCashCategoryKey: categoryDisplayKey(state.assets.find((a) => a.name === 'E76_USD현금')),
  };
};

async function seedAndRead(page) {
  return page.locator('body').evaluate((el, [seed, read]) => {
    new Function(`return (${seed})`)()();
    return new Function(`return (${read})`)()();
  }, [SEED.toString(), READ.toString()]);
}

test('A. 네 줄이 실제 계산값 그대로 표시된다', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  expect(r.dom.total).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.totalCur)) + '원');
  expect(r.dom.financial).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.finCur)) + '원');
  expect(r.dom.krw).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.krwFin)) + '원');
  expect(r.dom.usd).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.usdFin)) + '원');
  expect(r.dom.realEstate).toBe(new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.reCur)) + '원');
});

test('B. 총자산 = 금융자산 + 부동산', async ({ page }) => {
  await open(page);
  const { calc } = await seedAndRead(page);
  expect(Math.abs(calc.totalCur - (calc.finCur + calc.reCur))).toBeLessThan(1e-9);
});

test('C. 원화자산 + 달러자산 = 금융자산 총평가금액', async ({ page }) => {
  await open(page);
  const { calc } = await seedAndRead(page);
  // 수정 전에는 달러자산에 USD 부동산이 섞여 이 등식이 깨졌다.
  expect(Math.abs((calc.krwFin + calc.usdFin) - calc.finCur)).toBeLessThan(1e-9);
});

test('D. USD 부동산은 달러자산에서 제외되고 총자산에는 포함된다', async ({ page }) => {
  await open(page);
  const { calc } = await seedAndRead(page);
  expect(calc.usdRealEstate).toBeGreaterThan(0);
  // 달러자산이 USD 부동산을 포함했다면 최소한 그 금액 이상이어야 한다 - 그렇지 않음을 고정한다.
  expect(calc.usdFin).toBeLessThan(calc.usdRealEstate);
  expect(calc.reCur).toBeGreaterThanOrEqual(calc.usdRealEstate);
});

test('E. USD 채권은 달러자산에 포함되고, 환차손익 대상에는 들어가지 않는다', async ({ page }) => {
  await open(page);
  const { calc } = await seedAndRead(page);
  expect(calc.usdFin).toBeGreaterThanOrEqual(calc.usdBond + calc.usdCash);
  // computeForeignFxPnL은 {주식, ETF, 현금}만 본다 - 이번 작업에서 범위를 넓히지 않았다.
  const bondFx = 3000 * 1 * (1400 - 1300); // USD 채권이 포함됐다면 더해졌을 금액
  expect(calc.fxPnL).toBe(2700000);
  expect(calc.fxPnL).not.toBe(2700000 + bondFx);
});

test('F. 달러 현금 ⊂ 달러자산 이고, 저장 category key는 그대로 달러다', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  expect(r.calc.usdCash).toBeGreaterThan(0);
  expect(r.calc.usdCash).toBeLessThanOrEqual(r.calc.usdFin);
  // dailySnapshots에 저장되는 키는 예전 그대로 '달러'여야 한다(화면 표시만 '달러 현금').
  expect(r.usdCashCategoryKey).toBe('달러');
  expect(r.catTags.some((t) => t.startsWith('달러 현금 '))).toBe(true);
});

test('G. 신랑 + 와이프 + 나머지 = 총자산 (owner 없는 자산도 기존대로 남는다)', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  expect(Math.abs(r.calc.ownerSum - r.calc.totalCur)).toBeLessThan(1e-9);
  expect(r.ownerTags.some((t) => t.startsWith('신랑 '))).toBe(true);
  expect(r.ownerTags.some((t) => t.startsWith('와이프 '))).toBe(true);
  // owner가 비어 있는 legacy 자산의 버킷을 임의로 없애지 않았다(태그 개수 3개).
  expect(r.ownerTags.length).toBe(3);
});

test('H. 자산군 태그는 예전 그대로 총자산 기준이며, 기준이 다르다는 라벨이 붙는다', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  expect(Math.abs(r.calc.catSum - r.calc.totalCur)).toBeLessThan(1e-9);
  expect(r.catTags.some((t) => t.startsWith('부동산 '))).toBe(true); // 부동산을 삭제하지 않았다
  expect(r.catLabel).toBe('전체 자산군 구성');
});

test('I. 환차손익 라벨이 미실현으로 바뀌었고 값은 computeForeignFxPnL 그대로다', async ({ page }) => {
  await open(page);
  const r = await seedAndRead(page);
  const label = await page.locator('#kpiForeignFxPnl').evaluate((el) => el.previousElementSibling.textContent.trim());
  expect(label).toBe('달러자산 미실현 환차손익');
  expect(r.dom.fx).toBe('+' + new Intl.NumberFormat('ko-KR').format(Math.round(r.calc.fxPnL)) + '원');
});

test('J. 일간금융평가손익 계산은 바뀌지 않았다', async ({ page }) => {
  await open(page);
  const r = await page.locator('body').evaluate((el, [seed, read]) => {
    new Function(`return (${seed})`)()();
    const base = new Function(`return (${read})`)()();
    let fin = 0;
    state.assets.forEach((a) => { if (a.category !== '부동산') fin += calcDailyPnL(a, calcRow(a)); });
    return { dom: base.dom.dailyProfit, calc: fmtSigned(fin) };
  }, [SEED.toString(), READ.toString()]);
  expect(r.dom).toBe(r.calc);
});

test('K. 375px Light/Dark에서 잘림·overflow 없이 14px가 유지된다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  for (const dark of [false, true]) {
    const r = await page.locator('body').evaluate((el, [seed, isDark]) => {
      const doc = el.ownerDocument;
      doc.documentElement.classList.toggle('dark', isDark);
      new Function(`return (${seed})`)()();
      const win = doc.defaultView;
      const clipped = (e) => e.scrollWidth > e.clientWidth + 1;
      const ids = ['kpiFinancialValue', 'kpiKrwFinancialValue', 'kpiForeignValueInline', 'kpiForeignFxPnl', 'kpiRealEstateValue'];
      const rows = ids.map((id) => {
        const v = doc.getElementById(id);
        const l = v.previousElementSibling;
        return { clip: clipped(v) || clipped(l),
                 fs: Math.min(parseFloat(win.getComputedStyle(v).fontSize), parseFloat(win.getComputedStyle(l).fontSize)) };
      });
      const totalEl = doc.getElementById('kpiTotalValue');
      const card = totalEl.closest('.kpi-card');
      return {
        rows,
        totalClip: clipped(totalEl),
        totalFs: parseFloat(win.getComputedStyle(totalEl).fontSize),
        cardOverflowX: card.scrollWidth > card.clientWidth + 1,
        pageOverflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
      };
    }, [SEED.toString(), dark]);
    const mode = dark ? 'Dark' : 'Light';
    expect(r.totalClip, `${mode} 총액 잘림 없음`).toBe(false);
    expect(r.totalFs, `${mode} 총액 글자 크기`).toBeGreaterThanOrEqual(14);
    expect(r.cardOverflowX, `${mode} 카드 가로 overflow 없음`).toBe(false);
    expect(r.pageOverflowX, `${mode} 페이지 가로 overflow 없음`).toBe(false);
    for (const row of r.rows) {
      expect(row.clip, `${mode} 상세 줄 잘림 없음`).toBe(false);
      expect(row.fs, `${mode} 상세 줄 14px 유지`).toBeGreaterThanOrEqual(14);
    }
  }
});
