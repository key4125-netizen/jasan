// [FUTURE-P1 Phase 2-C] Monte Carlo 어댑터(js/16) 계좌 범위 통합 테스트.
// 실행: node --test test/mc-adapter-account-scope.test.js
//
// 여기서 고정하는 계약:
//   1) instrument = 공유되는 시장 정체성, balance = 계좌별 금액.
//      같은 종목이 일반계좌 목표와 절세계좌 보유에 동시에 있으면 instrument는 하나로 합쳐지지만
//      (같은 시장 충격을 받아야 하므로), 금액은 각 계좌에 따로 남는다.
//   2) 절세계좌 전용 종목은 weight 0으로 universe에 들어간다 - 일반계좌 자산배분에는 참여하지
//      않지만 σ/상관행렬/시장 충격 생성에는 정상적으로 참여한다.
//   3) σ/데이터부족 정책은 일반계좌와 완전히 동일하다 - 데이터가 없다고 조용히 σ=0으로 만들지 않는다.
//   4) 어댑터는 state를 읽기만 한다(실행 전후 state가 한 글자도 바뀌지 않는다).
//
// 외부 의존 없음: 네트워크는 차단돼 있고 가격 이력은 fixture로만 주입한다(test/mc-adapter-sandbox.js).
const assert = require('node:assert');
const { test } = require('node:test');

const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');
const { datesFrom, zigzagCloses } = require('./risk-sandbox.js');

const OWNER = '신랑';
const FIXED_FX = 1300;

// ±0.8% 톱니 300일 - σ가 0이 아니면서도 결정적인 시계열(같은 인자면 항상 같은 값).
function priceSeries(startDate) {
  const n = 300;
  return { closes: zigzagCloses(n, 100, 0.8, 0.8), dates: datesFrom(n, startDate) };
}

function freshSandbox() {
  const s = loadAdapterSandbox();
  s.state.exchangeRate = FIXED_FX;
  s.state.assets = [];
  s.state.transactions = [];
  // 두 owner 모두 목표를 비워 두고, 각 테스트가 필요한 쪽만 채운다(ownerFilter로 한 명만 계산한다).
  ['신랑', '와이프'].forEach((o) => {
    s.state.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    s.state.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  s.state.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  // 지수 폴백(자산군 캐치올 목표)이 쓰는 시계열도 미리 넣어 둔다.
  const idx = s.evalInSandbox('({ kospi: INDEX_TICKERS.KOSPI, sp500: INDEX_TICKERS.SP500 })');
  s.setDailyCloses(idx.kospi, priceSeries('2025-01-01'));
  s.setDailyCloses(idx.sp500, priceSeries('2025-01-02'));
  return s;
}

// 일반계좌 목표: 국내 100% 안에서 종목 하나(=전체 비중 1.0).
function setSingleTickerTarget(s, ticker, label) {
  s.state.rebalance[OWNER].targets['국내'] = [{ type: 'ticker', ticker, label, pct: 100 }];
}

function taxAsset(o) {
  return {
    id: o.id || `tax-${o.name}`, name: o.name, ticker: o.ticker || '', owner: OWNER,
    accountType: o.accountType || 'ISA', category: o.category || '주식',
    isDomestic: o.isDomestic || '국내', currency: 'KRW',
    quantity: o.quantity, buyPrice: o.buyPrice || o.currentPrice, currentPrice: o.currentPrice
  };
}

// [realm 주의] vm 컨텍스트 안에서 만들어진 배열은 Node 쪽 Array와 prototype이 달라
// assert.deepStrictEqual이 "구조는 같은데 참조가 다르다"로 실패한다 - 값만 비교하도록 복사해서 쓴다.
function arr(a) { return Array.from(a); }
function assertNoErrors(r) {
  assert.deepStrictEqual(arr(r.errors), [], `어댑터가 오류를 반환했다: ${arr(r.errors).join(' / ')}`);
}

function build(s, over) {
  return s.buildMonteCarloInputFromState(Object.assign({
    presetKey: 'normal', ownerFilter: OWNER, includeTaxAdvantaged: true, years: 20
  }, over || {}));
}

// taxScope 배열에서 특정 key의 값을 꺼낸다 - 인덱스는 반드시 assetOrder 기준이어야 한다.
function taxInitialOf(r, key) {
  const i = r.assetOrder.indexOf(key);
  return i < 0 ? null : r.taxScope.initialBalances[i];
}

/* ── 1. General-only ────────────────────────────────────────────────────── */
test('1. 절세계좌 자산·납입이 전혀 없으면 taxScope가 생기지 않는다(기존 General-only 경로 그대로)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  const r = await build(s);
  assertNoErrors(r);
  assert.strictEqual(r.taxScope, undefined, 'taxScope가 생기면 엔진이 절세계좌 경로로 들어가 결과가 달라진다');
  assert.deepStrictEqual(arr(r.assetOrder), ['T:005930.KS']);
  assert.strictEqual(r.instruments[0].weight, 1);
});

test('1-b. includeTaxAdvantaged를 주지 않으면 절세계좌 자산이 있어도 기존 결과와 완전히 같다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 10, currentPrice: 1000000 })];
  const withFlag = await build(s);
  const withoutFlag = await build(s, { includeTaxAdvantaged: false });
  assert.strictEqual(withoutFlag.taxScope, undefined);
  assert.deepStrictEqual(arr(withoutFlag.assetOrder), ['T:005930.KS'], '플래그가 없으면 universe가 커지면 안 된다');
  assert.strictEqual(withFlag.assetOrder.length, 2, '플래그가 있으면 절세 전용 종목이 universe에 들어간다');
});

/* ── 2. Tax-only instrument ─────────────────────────────────────────────── */
test('2. 절세계좌에만 있는 종목은 weight 0으로 universe에 들어가고 잔고는 절세 쪽에만 잡힌다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 3, currentPrice: 10000000 })];
  const r = await build(s);
  assertNoErrors(r);
  const taxIdx = r.assetOrder.indexOf('T:QQQM');
  assert.ok(taxIdx >= 0, '절세 전용 종목이 universe에 없다');
  assert.strictEqual(r.instruments[taxIdx].weight, 0, '절세 전용 종목에 일반계좌 목표 비중이 생기면 안 된다');
  assert.ok(r.instruments[taxIdx].sigmaAnnual > 0, '절세 전용 종목의 σ가 0이면 데이터가 연결되지 않은 것이다');
  assert.strictEqual(taxInitialOf(r, 'T:QQQM'), 30000000);
  assert.strictEqual(taxInitialOf(r, 'T:005930.KS'), 0, '일반계좌 전용 종목에 절세 잔고가 잡히면 안 된다');
  // weight 합계는 여전히 1이어야 한다(절세 종목이 일반계좌 배분을 희석하지 않는다).
  const sum = arr(r.instruments).reduce((a, i) => a + i.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `weight 합계가 1이 아니다: ${sum}`);
});

/* ── 3/4. 같은 종목이 일반계좌와 절세계좌에 동시에 있을 때 (§20 핵심) ────────── */
test('3/4. 같은 종목은 instrument 하나로 합쳐지지만 잔고는 계좌별로 따로 유지된다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, 'QQQM', 'QQQM');
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [
    // 같은 종목을 일반계좌에도 들고 있다(일반계좌 잔고는 목표비중 기반이라 taxScope와 무관하다).
    { id: 'gen-1', name: 'QQQM', ticker: 'QQQM', owner: OWNER, accountType: '일반계좌', category: '주식', isDomestic: '해외', currency: 'KRW', quantity: 7, currentPrice: 10000000, buyPrice: 10000000 },
    taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 3, currentPrice: 10000000 })
  ];
  const r = await build(s);
  assertNoErrors(r);
  assert.deepStrictEqual(arr(r.assetOrder), ['T:QQQM'], 'instrument가 계좌별로 쪼개졌다 - 같은 종목은 하나여야 한다');
  assert.strictEqual(r.instruments.length, 1);
  assert.strictEqual(r.instruments[0].weight, 1, '일반계좌 목표 비중은 그대로 유지되어야 한다');
  assert.strictEqual(r.taxScope.initialBalances[0], 30000000, '절세계좌 잔고만 taxScope에 들어가야 한다(70M이 섞이면 안 된다)');
});

/* ── 5. universe 확장이 상관행렬/assetOrder와 항상 함께 간다 ────────────────── */
test('5. 절세 종목이 늘어나도 assetOrder·instruments·correlationMatrix 크기가 항상 일치한다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.setDailyCloses('SPLG', priceSeries('2025-01-04'));
  s.state.assets = [
    taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 1, currentPrice: 1000000 }),
    taxAsset({ id: 'tax-splg', name: 'SPLG', ticker: 'SPLG', isDomestic: '해외', quantity: 2, currentPrice: 1000000, accountType: 'IRP' })
  ];
  const r = await build(s);
  assertNoErrors(r);
  const n = r.assetOrder.length;
  assert.strictEqual(n, 3);
  assert.strictEqual(r.instruments.length, n);
  assert.strictEqual(r.correlationMatrix.length, n);
  arr(r.correlationMatrix).forEach((row, i) => {
    assert.strictEqual(row.length, n);
    assert.strictEqual(row[i], 1, '상관행렬 대각선이 1이 아니다');
  });
  assert.deepStrictEqual(arr(r.assetOrder), arr(r.instruments).map((i) => i.key), 'assetOrder와 instruments 순서가 어긋났다');
  assert.strictEqual(r.taxScope.initialBalances.length, n);
  assert.strictEqual(r.taxScope.monthlyContributions.length, n);
  // 어댑터 출력이 그대로 엔진 입력 검증을 통과해야 한다(길이 불일치는 여기서 잡힌다).
  const v = s.validateMonteCarloInput({
    instruments: r.instruments, correlationMatrix: r.correlationMatrix, assetOrder: r.assetOrder,
    initialPrincipal: 100000000, monthlyContribution: 1000000, years: 20, taxScope: r.taxScope
  });
  assert.deepStrictEqual(arr(v.errors), [], arr(v.errors).join(' / '));
});

/* ── 6/7. key 규칙 - ticker / NAME:x ────────────────────────────────────── */
test('6/7. 절세계좌 자산은 일반계좌와 같은 key 규칙(T: / N:지역:이름)으로 정규화된다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.state.assets = [
    taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 1, currentPrice: 1000000 }),
    // 티커 없는 보유분 - N:지역:이름 키가 되어야 한다.
    taxAsset({ id: 'tax-named', name: '사내우리사주', ticker: '', isDomestic: '국내', quantity: 1, currentPrice: 5000000 })
  ];
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  const r = await build(s);
  assertNoErrors(r);
  assert.ok(r.assetOrder.includes('T:QQQM'), `티커형 key가 없다: ${arr(r.assetOrder).join(',')}`);
  assert.ok(r.assetOrder.includes('N:국내:사내우리사주'), `이름형 key가 없다: ${arr(r.assetOrder).join(',')}`);
  assert.strictEqual(taxInitialOf(r, 'N:국내:사내우리사주'), 5000000);
});

/* ── 8/9. BOND / CASH ──────────────────────────────────────────────────── */
test('8/9. 절세계좌의 채권·현금은 가격 이력 없이도 오류가 아니라 σ=0으로 처리된다(기존 정책 동일)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.state.assets = [
    taxAsset({ id: 'tax-bond', name: '국고채', ticker: '', category: '채권', quantity: 1, currentPrice: 4000000 }),
    taxAsset({ id: 'tax-cash', name: '예수금', ticker: '', category: '현금', quantity: 1, currentPrice: 1000000 })
  ];
  const r = await build(s);
  assertNoErrors(r); // 무위험 자산에 가격 이력을 요구하면 안 된다
  ['N:국내:국고채', 'N:국내:예수금'].forEach((key) => {
    const i = r.assetOrder.indexOf(key);
    assert.ok(i >= 0, `${key}가 universe에 없다`);
    assert.strictEqual(r.instruments[i].sigmaAnnual, 0);
    assert.strictEqual(r.instruments[i].weight, 0);
  });
  assert.strictEqual(taxInitialOf(r, 'N:국내:국고채'), 4000000);
  assert.strictEqual(taxInitialOf(r, 'N:국내:예수금'), 1000000);
});

test('8-c. 이름에 채권 단어가 없어도 사용자가 채권으로 등록한 절세계좌 자산은 무위험으로 다룬다', async () => {
  // 실제로 겪은 문제: 이름만 보고 카테고리를 추정하면 'E64ISA'처럼 이름에 단서가 없는 채권 자산이
  // 위험자산으로 잘못 분류돼 가격 이력을 요구하고, 결국 MC 실행 자체가 오류로 막혔다.
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.state.assets = [taxAsset({ id: 'tax-x', name: 'E64ISA', ticker: '', category: '채권', quantity: 1, currentPrice: 20000000 })];
  const r = await build(s);
  assertNoErrors(r);
  const i = r.assetOrder.indexOf('N:국내:E64ISA');
  assert.ok(i >= 0);
  assert.strictEqual(r.instruments[i].sigmaAnnual, 0, '사용자가 지정한 채권 카테고리가 무시됐다');
  assert.strictEqual(taxInitialOf(r, 'N:국내:E64ISA'), 20000000);
});

test('8-b. 절세계좌 위험자산의 가격 이력이 없으면 조용히 σ=0으로 만들지 않고 오류로 알린다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  // NOPRICE는 fixture에 등록하지 않는다 - 가격 이력 없음 경로.
  s.state.assets = [taxAsset({ name: 'NOPRICE', ticker: 'NOPRICE', isDomestic: '해외', quantity: 1, currentPrice: 1000000 })];
  const r = await build(s);
  assert.ok(r.errors.length > 0, '데이터 부족이 조용히 통과했다');
  assert.ok(arr(r.errors).some((e) => e.indexOf('NOPRICE') !== -1), `오류 메시지에 종목이 없다: ${arr(r.errors).join(' / ')}`);
});

/* ── 15/16. 납입 타이밍과 잔여분 배분 규칙 ────────────────────────────────── */
test('15. 연 1회 납입은 각 연도 첫 달(m=1,13,25...)에만 잡힌다(deterministic "매년 초 1회"와 동일)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.projection.taxAdvantagedPlan.contributionByOwnerAccount[OWNER] = [
    { accountType: 'ISA', amount: 12000000, years: 3, frequency: 'yearly' }
  ];
  s.state.projection.taxAdvantagedPlan.allocationByOwner[OWNER] = [
    { accountType: 'ISA', ticker: 'QQQM', label: 'QQQM', pct: 100 }
  ];
  const r = await build(s);
  assertNoErrors(r);
  const row = r.taxScope.monthlyContributions[r.assetOrder.indexOf('T:QQQM')];
  assert.strictEqual(row.length, 240);
  const nonZero = [];
  arr(row).forEach((v, i) => { if (v > 0) nonZero.push(i + 1); });
  assert.deepStrictEqual(nonZero, [1, 13, 25], `연납이 잘못된 달에 들어갔다: ${nonZero.join(',')}`);
  nonZero.forEach((m) => assert.strictEqual(row[m - 1], 12000000));
});

test('16. 미배분 잔여분은 기존 TAX_ADVANTAGED_RISK_SHARE 규칙(국내주식/채권)으로만 나뉜다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.state.projection.taxAdvantagedPlan.contributionByOwnerAccount[OWNER] = [
    { accountType: 'IRP', amount: 1000000, years: 20, frequency: 'monthly' }
  ];
  // 배분 항목을 하나도 두지 않으면 전액이 잔여분이다.
  const r = await build(s);
  assertNoErrors(r);
  const share = s.evalInSandbox('TAX_ADVANTAGED_RISK_SHARE');
  const stock = r.taxScope.monthlyContributions[r.assetOrder.indexOf('C:국내:주식')];
  const bond = r.taxScope.monthlyContributions[r.assetOrder.indexOf('C:국내:채권')];
  assert.ok(stock && bond, '잔여분 폴백 항목이 universe에 없다');
  assert.strictEqual(stock[0], 1000000 * share);
  assert.strictEqual(bond[0], 1000000 * (1 - share));
  assert.strictEqual(stock[239], 1000000 * share, '20년 내내 납입이 유지되어야 한다');
});

/* ── 24/25. SoT 보호 / 범위 가드 ────────────────────────────────────────── */
test('24. 어댑터 실행 전후로 state가 전혀 바뀌지 않는다(읽기 전용)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 1, currentPrice: 1000000 })];
  s.state.projection.taxAdvantagedPlan.contributionByOwnerAccount[OWNER] = [
    { accountType: 'ISA', amount: 500000, years: 10, frequency: 'monthly' }
  ];
  const before = JSON.stringify({
    assets: s.state.assets, transactions: s.state.transactions,
    rebalance: s.state.rebalance, projection: s.state.projection
  });
  await build(s);
  const after = JSON.stringify({
    assets: s.state.assets, transactions: s.state.transactions,
    rebalance: s.state.rebalance, projection: s.state.projection
  });
  assert.strictEqual(after, before, '어댑터가 state를 수정했다');
});

test('25. 절세계좌의 부동산은 Monte Carlo universe에 들어가지 않는다(기존 MC 범위 유지)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.state.assets = [taxAsset({ id: 'tax-re', name: '오피스텔', ticker: '', category: '부동산', quantity: 1, currentPrice: 300000000 })];
  const r = await build(s);
  assertNoErrors(r);
  assert.deepStrictEqual(arr(r.assetOrder), ['T:005930.KS'], '부동산이 universe에 들어갔다');
  assert.strictEqual(r.taxScope, undefined, '부동산만 있는 절세계좌는 MC 대상 잔고가 0이어야 한다');
});

/* ── §5 RNG Case A/B + §20 통합 경로(어댑터 → 엔진) ────────────────────────── */
// 어댑터 출력을 그대로 엔진에 넣어, 실제 실행 경로에서 세 범위가 나오는지 확인한다.
function runEngine(s, r, over) {
  return s.runMonthlyPrecisionMC(Object.assign({
    pv0: 100000000, instruments: r.instruments, correlationMatrix: r.correlationMatrix,
    monthlyContribution: 1000000, years: 20, iterations: 200, seed: 20260101,
    taxScope: r.taxScope
  }, over || {}));
}

test('Case A. 절세계좌가 없는 사용자는 accountScopes 없이 기존과 같은 결과만 받는다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  const r = await build(s);
  const out = runEngine(s, r);
  assert.strictEqual(out.accountScopes, undefined);
  assert.strictEqual(out.milestones.length, 4);
});

test('Case B. 절세 전용 종목이 생기면 universe(n)가 커져 일반계좌 결과도 달라진다(PM 승인 사항)', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, '005930', '삼성전자');
  s.setDailyCloses('005930.KS', priceSeries('2025-01-01'));
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 3, currentPrice: 10000000 })];
  const withTax = await build(s);
  const withoutTax = await build(s, { includeTaxAdvantaged: false });
  const outWith = runEngine(s, withTax);
  const outWithout = runEngine(s, withoutTax);
  // 엔진은 월마다 n개의 Z를 소비하므로 n이 달라지면 난수 경로 자체가 달라진다 - "weight 0이니
  // 영향 없다"가 성립하지 않는다는 것을 실제 값으로 못박아 둔다.
  assert.notStrictEqual(outWith.accountScopes.general.at(-1).p50, outWithout.milestones.at(-1).p50);
  assert.strictEqual(outWithout.accountScopes, undefined);
});

test('§20. 어댑터 → 엔진 경로에서 general/taxAdvantaged/combined 세 범위가 모두 정상 산출된다', async () => {
  const s = freshSandbox();
  setSingleTickerTarget(s, 'QQQM', 'QQQM');
  s.setDailyCloses('QQQM', priceSeries('2025-01-03'));
  s.state.assets = [
    { id: 'gen-1', name: 'QQQM', ticker: 'QQQM', owner: OWNER, accountType: '일반계좌', category: '주식', isDomestic: '해외', currency: 'KRW', quantity: 7, currentPrice: 10000000, buyPrice: 10000000 },
    taxAsset({ name: 'QQQM', ticker: 'QQQM', isDomestic: '해외', quantity: 3, currentPrice: 10000000 })
  ];
  const r = await build(s);
  const out = runEngine(s, r, { goalAmounts: [500000000] });
  ['general', 'taxAdvantaged', 'combined'].forEach((scope) => {
    const ms = arr(out.accountScopes[scope]);
    assert.deepStrictEqual(ms.map((m) => m.year), [5, 10, 15, 20], `${scope} milestone 연차가 다르다`);
    ms.forEach((m) => {
      ['p10', 'p25', 'p50', 'p75', 'p90'].forEach((k) => assert.ok(Number.isFinite(m[k]), `${scope} ${m.year}년 ${k} 없음`));
      assert.ok(Number.isFinite(m.goalProbability[500000000]), `${scope} ${m.year}년 goalProbability 없음`);
    });
  });
  const g = out.accountScopes.general.at(-1).p50;
  const t = out.accountScopes.taxAdvantaged.at(-1).p50;
  const c = out.accountScopes.combined.at(-1).p50;
  assert.ok(t > 0, '절세계좌 잔고(3천만원)가 반영되지 않았다');
  assert.ok(c > g && c > t, 'combined가 각 계좌보다 작다');
});
