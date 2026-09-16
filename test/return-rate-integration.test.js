// [통합 수정] Return Key → Return Rate → Deterministic → Monte Carlo 회귀 테스트.
// 실행: node --test test/return-rate-integration.test.js
//
// 여기서 고정하는 계약(checklist §32):
//   A. 사전: 키만 있거나 칸이 빈 항목은 0%가 되지 않는다 · 명시적 0은 0이다.
//   B. 자산군: 사용자 확정(legacy 포함)만 계산 근거 · 시스템 추천은 이름 · 성격으로 판정 · 가정 없음과 자동 연결 확인 필요는 경고.
//   C. 소유자: 같은 종목이라도 다른 소유자 · 다른 계좌의 대표매칭을 빌려 쓰지 않는다 · 기준이 다르면 instrument를 나누고 경고한다.
//   D. 결정론: 절세계좌 원금 · 연납 · 운용보수가 Monte Carlo(σ=0)와 같은 뜻으로 계산된다 · 영향 없는 포트폴리오는 값이 그대로다.
//   E. Monte Carlo: 비중 합계는 엔진 안에서만 정규화 · ρ=±1도 계산 · 수익률 관측치 10개 미만 경고 · 월 적립금 대상 미선택 경고.
//   F. 수익률 관리 목록은 계산과 같은 키를 보여 주고 'UNRESOLVED'를 키로 올리지 않는다.
//
// 외부 의존 없음: 네트워크 차단 · 가격 이력은 합성 fixture(test/mc-adapter-sandbox.js).
const assert = require('node:assert');
const { test } = require('node:test');

const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

function isoDate(i) { return new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10); }
function flatSeries(n = 260) { return { dates: Array.from({ length: n }, (_, i) => isoDate(i)), closes: Array.from({ length: n }, () => 100) }; }
function randomSeries(seed, n = 260, vol = 0.012) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let p = 100;
  const closes = [];
  for (let i = 0; i < n; i++) { p *= 1 + (rnd() - 0.5) * 2 * vol; closes.push(p); }
  return { dates: Array.from({ length: n }, (_, i) => isoDate(i)), closes };
}

function freshSandbox() {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {}; S.projection.customFeeRates = {};
  S.projection.monthlyContribution = 0; S.projection.monthlyContributionAllocation = [];
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.contributionGrowthRate = 0; S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => {
    S.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    S.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  const idx = sb.evalInSandbox('({ kospi: INDEX_TICKERS.KOSPI, sp500: INDEX_TICKERS.SP500 })');
  sb.setDailyCloses(idx.kospi, randomSeries(101));
  sb.setDailyCloses(idx.sp500, randomSeries(103));
  // categorySource: 'user'(명시 category) · 'system' · 'legacy'(필드 없음)
  sb.asset = (o) => {
    const a = sb.makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e8, currentPrice: 1e8, currency: 'KRW' }, o));
    if (o.categorySource === 'system') a.categorySource = 'system';
    if (o.categorySource === 'legacy') delete a.categorySource;
    return a;
  };
  return sb;
}

async function buildMc(sb, opts = {}) {
  const input = await sb.buildMonteCarloInputFromState({ presetKey: opts.preset || 'normal', ownerFilter: opts.owner, includeTaxAdvantaged: true, years: 20 });
  assert.deepStrictEqual(Array.from(input.errors), [], `어댑터 오류: ${Array.from(input.errors).join(' / ')}`);
  const codes = [].concat(input.safety.issues, input.safety.dataQuality.issues).map((i) => i.code);
  return { input, codes, byKey: Object.fromEntries(input.instruments.map((i) => [i.key, i])) };
}
// [§37] 변동성은 이제 장기 CMA 자산군에서 온다(평평한 가격 이력으로 σ=0을 만들 수 없다) - 이 도구는 이름 그대로
// "어댑터가 만든 μ · 보수 · 계좌 입력을 σ=0으로 돌려 결정론과 비교"하는 용도라 σ만 명시적으로 0으로 둔다.
function runSigma0(sb, input, opts = {}) {
  return sb.runMonthlyPrecisionMC({
    pv0: sb.computeHouseholdMonteCarloPV(opts.owner), instruments: input.instruments.map((i) => ({ ...i, sigmaAnnual: 0 })), correlationMatrix: input.correlationMatrix,
    monthlyContribution: 0, years: 20, iterations: 20, seed: 20260101, taxScope: input.taxScope
  });
}
const lastP50 = (ms) => ms[ms.length - 1].p50;

/* ── A. 사전 ─────────────────────────────────────────────────────────────── */

test('A-1. 사전에 키만 있는 항목은 매칭된 자산을 0%로 만들지 않는다(자산 · 목표 · 시나리오별 빈 칸)', () => {
  const sb = freshSandbox();
  const a = sb.asset({ ticker: '000660.KS', name: 'SK하이닉스', category: '주식' });
  sb.state.assets = [a];
  sb.state.projection.customScenarioRates = { '000660.KS': { label: 'SK하이닉스' } };
  assert.strictEqual(sb.getAssetProjectionRate(a, 'normal'), 7);
  assert.strictEqual(sb.getTargetProjectionRate({ type: 'ticker', ticker: '000660.KS', label: 'SK하이닉스', owner: '신랑' }, 'normal', '국내', 'general'), 7);
  // 일반적만 입력 - 입력한 칸은 그 값, 빈 칸(보수적)은 자동 판별(KOSPI 보수적 5)
  sb.state.projection.customScenarioRates = { '000660.KS': { label: 'SK하이닉스', normal: 9 } };
  assert.strictEqual(sb.getAssetProjectionRate(a, 'normal'), 9);
  assert.strictEqual(sb.getAssetProjectionRate(a, 'conservative'), 5);
});

test('A-2. 명시적 0은 빈 칸과 다르다 - 0으로 계산하고 가정 없음 경고도 붙이지 않는다', async () => {
  const sb = freshSandbox();
  sb.setDailyCloses('000660.KS', randomSeries(7));
  sb.state.assets = [sb.asset({ ticker: '000660.KS', name: 'SK하이닉스', category: '주식' })];
  sb.state.projection.customScenarioRates = { '000660.KS': { label: 'SK하이닉스', conservative: 0, normal: 0, optimistic: 0 } };
  sb.state.rebalance['신랑'].targets['국내'] = [{ type: 'ticker', ticker: '000660.KS', label: 'SK하이닉스', pct: 100 }];
  assert.strictEqual(sb.getAssetProjectionRate(sb.state.assets[0], 'normal'), 0);
  const { byKey, codes } = await buildMc(sb);
  assert.strictEqual(byKey['T:000660.KS'].muAnnual, 0);
  assert.ok(!codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
});

/* ── B. 자산군 확정 · 성격 ────────────────────────────────────────────────── */

test('B-1. 사용자 확정 · legacy 채권은 경로 A · 일반계좌 결정론 · Monte Carlo 모두 채권 수익률, 시스템 추천은 이름으로 판정', async () => {
  for (const [source, expectedRate] of [['user', 4], ['legacy', 4], ['system', 0]]) {
    const sb = freshSandbox();
    const a = sb.asset({ name: '안전자산A', category: '채권', categorySource: source });
    sb.state.assets = [a];
    sb.state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: '안전자산A', pct: 100 }];
    assert.strictEqual(sb.getAssetProjectionRate(a, 'normal'), expectedRate, `경로 A (${source})`);
    assert.strictEqual(sb.computeRegionWeightedRate('신랑', '국내', 'normal'), expectedRate, `일반계좌 결정론 (${source})`);
    const { byKey, codes } = await buildMc(sb);
    assert.strictEqual(byKey['N:국내:안전자산A'].muAnnual, expectedRate / 100, `MC μ (${source})`);
    // [N-06] 확정 채권은 σ=0. 시스템 추천(이름에 채권 키워드 없음)은 가정 없음(0%) + 경고 - [§37 · RET-03-00] 가격 이력 변동성을
    // 더 쓰지 않으므로, 가정이 없는 자산에는 성장과 마찬가지로 변동성 가정도 적용하지 않는다(σ=0, 경고로 알림).
    assert.strictEqual(byKey['N:국내:안전자산A'].sigmaAnnual, 0, `σ (${source})`);
    assert.strictEqual(codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'), source === 'system', `경고 (${source})`);
  }
});

test('B-2. 시스템 추천 자산군이라도 이름이 채권을 밝히면 채권 수익률을 쓴다(추천을 확정으로 쓰지 않을 뿐 판정은 한다)', () => {
  const sb = freshSandbox();
  const a = sb.asset({ name: '국고채펀드A', category: '채권', categorySource: 'system' });
  sb.state.assets = [a];
  assert.strictEqual(sb.getAssetProjectionRate(a, 'normal'), 4);
  assert.strictEqual(a.category, '채권'); // 추천 값 자체는 바꾸지 않는다
  assert.strictEqual(a.categorySource, 'system');
});

test('B-3. 사용자 확정 현금 이름형 목표는 σ=0 · 0%(정책값) · 가정 없음 경고 없음', async () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ name: '생활비통장', category: '현금' })];
  sb.state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: '생활비통장', pct: 100 }];
  const { byKey, codes } = await buildMc(sb);
  assert.strictEqual(byKey['N:국내:생활비통장'].sigmaAnnual, 0);
  assert.strictEqual(byKey['N:국내:생활비통장'].muAnnual, 0);
  assert.ok(!codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
});

test('B-4. 이름 키워드 자동 매칭이 자산 성격과 다르면 매칭은 그대로 두고 확인 필요 경고, 경로 A = 결정론 = MC', async () => {
  const sb = freshSandbox();
  const a = sb.asset({ name: '코리아 배당다우존스 펀드', category: '주식' });
  sb.state.assets = [a];
  sb.state.rebalance['신랑'].targets['국내'] = [{ type: 'namedHolding', name: '코리아 배당다우존스 펀드', pct: 100 }];
  const { byKey, codes } = await buildMc(sb);
  assert.strictEqual(sb.getAssetProjectionRate(a, 'normal'), 5.1);
  assert.strictEqual(sb.computeRegionWeightedRate('신랑', '국내', 'normal'), 5.1);
  assert.strictEqual(byKey['N:국내:코리아 배당다우존스 펀드'].muAnnual, 0.051);
  assert.ok(codes.includes('SAFETY_RETURN_KEY_NEEDS_REVIEW'));
  assert.strictEqual(a.rateMatchOverride, undefined); // 사용자 값으로 굳히지 않는다
});

test('B-5. 미등재 개별주(목표 전용)는 지역 대체 없이 0% + 가정 없음 경고', async () => {
  const sb = freshSandbox();
  sb.setDailyCloses('PLTR', randomSeries(41));
  sb.state.rebalance['신랑'].domestic = { '국내': 0, '해외': 100 };
  sb.state.rebalance['신랑'].targets['해외'] = [{ type: 'ticker', ticker: 'PLTR', label: 'Palantir', pct: 100 }];
  sb.state.assets = [sb.asset({ name: '예수금', category: '현금' })];
  const { byKey, codes, input } = await buildMc(sb);
  assert.strictEqual(byKey['T:PLTR'].muAnnual, 0);
  assert.ok(codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
  assert.ok(input.safety.issues.some((i) => i.code === 'SAFETY_RETURN_ASSUMPTION_MISSING' && i.message.includes('Palantir')));
});

/* ── C. 소유자 ───────────────────────────────────────────────────────────── */

function parkSystems(sb, husbandKey, wifeKey) {
  sb.setDailyCloses('140860.KQ', randomSeries(21));
  sb.state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 4.5, optimistic: 6 } };
  sb.state.assets = [
    sb.asset({ ticker: '140860.KQ', name: '파크시스템스', category: '주식', rateMatchOverride: husbandKey }),
    sb.asset({ owner: '와이프', ticker: '140860.KQ', name: '파크시스템스', category: '주식', rateMatchOverride: wifeKey }),
    sb.asset({ owner: '와이프', accountType: 'ISA', ticker: '140860.KQ', name: '파크시스템스', category: '주식', rateMatchOverride: wifeKey, buyPrice: 3e7, currentPrice: 3e7 })
  ];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [{ type: 'ticker', ticker: '140860.KQ', label: '파크시스템스', pct: 100 }]; });
}

test('C-1. 같은 티커 · 같은 소유자 / 다른 소유자 · 같은 키는 하나의 instrument, 경고 없음', async () => {
  const sb = freshSandbox();
  parkSystems(sb, 'KOSDAQ', 'KOSDAQ');
  const { byKey, codes, input } = await buildMc(sb);
  assert.deepStrictEqual(Array.from(input.instruments, (i) => i.key), ['T:140860.KQ']);
  assert.strictEqual(byKey['T:140860.KQ'].muAnnual, 0.07);
  assert.ok(!codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
});

test('C-2. 같은 티커 · 다른 소유자 · 다른 키 - 결정론은 소유자별, MC는 기준별 instrument로 나뉘고 서로 빌려 쓰지 않는다 + 경고', async () => {
  const sb = freshSandbox();
  parkSystems(sb, 'BOND.STOCK', 'KOSDAQ');
  assert.strictEqual(sb.computeRegionWeightedRate('신랑', '국내', 'normal'), 4.5);
  assert.strictEqual(sb.computeRegionWeightedRate('와이프', '국내', 'normal'), 7);
  const { byKey, codes, input } = await buildMc(sb);
  assert.strictEqual(byKey['T:140860.KQ|BOND.STOCK'].muAnnual, 0.045);
  assert.strictEqual(byKey['T:140860.KQ|KOSDAQ'].muAnnual, 0.07);
  assert.ok(codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
  // 와이프 ISA 보유분은 와이프 키(KOSDAQ) instrument에 들어간다 - 신랑 4.5%가 번지지 않는다
  const kosdaqIdx = input.assetOrder.indexOf('T:140860.KQ|KOSDAQ');
  assert.strictEqual(input.taxScope.initialBalances[kosdaqIdx], 3e7);
  assert.strictEqual(input.taxScope.initialBalances[input.assetOrder.indexOf('T:140860.KQ|BOND.STOCK')], 0);
  // 소유자 설정 원본은 그대로
  assert.deepStrictEqual(sb.state.assets.map((a) => a.rateMatchOverride), ['BOND.STOCK', 'KOSDAQ', 'KOSDAQ']);
  // 두 instrument는 같은 가격 이력(ρ=1)이어도 계산된다(F-07)
  const res = runSigma0(sb, input);
  assert.ok(res.milestones.length === 4);
});

test('C-3. 목표 소유자가 보유하지 않은 종목은 다른 소유자의 대표매칭을 빌리지 않고 자동 판별로 계산한다', () => {
  const sb = freshSandbox();
  sb.state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', normal: 4.5 } };
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200', category: 'ETF', rateMatchOverride: 'BOND.STOCK' })];
  sb.state.rebalance['와이프'].targets['국내'] = [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }];
  assert.strictEqual(sb.computeRegionWeightedRate('와이프', '국내', 'normal'), 7);
  assert.strictEqual(sb.getTargetProjectionRate({ type: 'ticker', ticker: '069500', label: 'KODEX 200', owner: '신랑' }, 'normal', '국내', 'general'), 4.5);
  // 월 적립 배분도 소유자별
  const item = { ticker: '069500', label: 'KODEX 200', pct: 100 };
  assert.strictEqual(sb.getMonthlyAllocationItemRate(item, 'normal', '와이프', 'general'), 7);
  assert.strictEqual(sb.getMonthlyAllocationItemRate(item, 'normal', '신랑', 'general'), 4.5);
});

test('C-4. 두 소유자 목표가 같고 한 사람만 보유한 확정 채권은 같은 기준으로 합쳐진다(표기 채권/BOND 차이로 나누지 않음)', async () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ name: '국고채A', category: '채권', categorySource: 'legacy' })];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [{ type: 'namedHolding', name: '국고채A', pct: 100 }]; });
  const { input, codes } = await buildMc(sb);
  assert.deepStrictEqual(Array.from(input.instruments, (i) => i.key), ['N:국내:국고채A']);
  assert.ok(!codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
});

/* ── D. 결정론 ───────────────────────────────────────────────────────────── */

test('D-1. 절세계좌 원금(사용자 확정 채권 이름형) - 결정론 = Monte Carlo(σ=0)', async () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ name: '안전자산A', category: '채권', accountType: 'ISA' })];
  const det = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const { input } = await buildMc(sb);
  const mc = lastP50(runSigma0(sb, input).accountScopes.taxAdvantaged);
  assert.strictEqual(Math.round(det), 222258209);
  assert.strictEqual(Math.round(mc), Math.round(det));
});

test('D-2. 절세계좌 연납은 월복리(APR) 의미 - 결정론 = Monte Carlo(σ=0), 월납 결과는 그대로', async () => {
  const sb = freshSandbox();
  sb.setDailyCloses('360750.KS', flatSeries());
  const plan = sb.state.projection.taxAdvantagedPlan;
  plan.allocationByOwner['신랑'] = [{ accountType: 'ISA', ticker: '360750', label: 'TIGER 미국S&P500', pct: 100 }];
  plan.contributionByOwnerAccount['신랑'] = [{ accountType: 'ISA', amount: 12000000, years: 20, frequency: 'yearly' }];
  const yearlyDet = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const yearlyMc = lastP50(runSigma0(sb, (await buildMc(sb)).input).accountScopes.taxAdvantaged);
  assert.strictEqual(Math.round(yearlyDet), 427389641); // 수정 전 결정론 421,462,521(연복리)
  assert.ok(Math.abs(yearlyMc - yearlyDet) < 1, `${yearlyMc} vs ${yearlyDet}`);
  plan.contributionByOwnerAccount['신랑'] = [{ accountType: 'ISA', amount: 1000000, years: 20, frequency: 'monthly' }];
  assert.strictEqual(Math.round(sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20)), 417580693); // 수정 전과 동일
});

test('D-3. 절세계좌 운용보수는 일반계좌와 같은 방식 - 결정론 = Monte Carlo(σ=0), 보수 미설정이면 기존 값', async () => {
  const sb = freshSandbox();
  sb.setDailyCloses('069500.KS', flatSeries());
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200', accountType: 'ISA' })];
  assert.strictEqual(Math.round(sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20)), 403873885);
  sb.state.projection.customFeeRates = { '069500.KS': 0.5 };
  const det = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const mc = lastP50(runSigma0(sb, (await buildMc(sb)).input).accountScopes.taxAdvantaged);
  assert.strictEqual(Math.round(det), 365348549);
  assert.strictEqual(Math.round(mc), Math.round(det));
});

test('D-4. 영향 없는 일반 포트폴리오의 결정론 값은 수정 전과 같다(티커 · legacy 채권 · 두 소유자 · 배분 · 보수)', () => {
  const sb = freshSandbox();
  sb.state.assets = [
    sb.asset({ ticker: '069500', name: 'KODEX 200', quantity: 1000, buyPrice: 40000, currentPrice: 42000 }),
    sb.asset({ ticker: 'QQQM', name: 'QQQM', quantity: 100, buyPrice: 200, currentPrice: 210, currency: 'USD' }),
    sb.asset({ name: '국고채A', category: '채권', categorySource: 'legacy', buyPrice: 3e7, currentPrice: 3e7 }),
    sb.asset({ owner: '와이프', ticker: 'QQQM', name: 'QQQM', quantity: 50, buyPrice: 200, currentPrice: 210, currency: 'USD' })
  ];
  ['신랑', '와이프'].forEach((o) => {
    sb.state.rebalance[o].domestic = { '국내': 70, '해외': 30 };
    sb.state.rebalance[o].targets = { '국내': [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 60 }, { type: 'namedHolding', name: '국고채A', pct: 40 }], '해외': [{ type: 'ticker', ticker: 'QQQM', label: 'QQQM', pct: 100 }] };
  });
  sb.state.projection.monthlyContributionByOwner = { '신랑': { total: 1000000, years: null, allocation: [{ ticker: 'QQQM', label: 'QQQM', pct: 100 }] }, '와이프': { total: 500000, years: null, allocation: [{ ticker: '069500', label: 'KODEX 200', pct: 100 }] } };
  sb.state.projection.customFeeRates = { '069500.KS': 0.15, QQQM: 0.15, '채권': 0 };
  // 기대값은 수정 전(HEAD 6599d0e) 코드로 같은 입력을 계산한 값이다.
  assert.strictEqual(Math.round(sb.simulateRebalancedPreset('conservative', 20).yearlyPoints[20].total), 837453120);
  assert.strictEqual(Math.round(sb.simulateRebalancedPreset('normal', 20).yearlyPoints[20].total), 1014959594);
  assert.strictEqual(Math.round(sb.simulateRebalancedPreset('optimistic', 20).yearlyPoints[20].total), 1457026860);
});

/* ── E. Monte Carlo 엔진 · 경고 ──────────────────────────────────────────── */

test('E-1. 비중 합계 99.5% · 100.5%는 엔진 안에서만 정규화되어 100%와 같은 결과, 입력 비중은 그대로', () => {
  const sb = freshSandbox();
  const run = (w) => {
    const instruments = [{ key: 'X', weight: w, muAnnual: 0.04, sigmaAnnual: 0, feeRateAnnual: 0 }];
    const r = sb.runMonthlyPrecisionMC({ pv0: 1e8, instruments, correlationMatrix: [[1]], monthlyContribution: 1e6, years: 20, iterations: 5, seed: 20260101 });
    return { p50: r.milestones[3].p50, normalized: r.diagnostics.weightsNormalized, inputWeight: instruments[0].weight };
  };
  const base = run(1);
  assert.strictEqual(base.normalized, false);
  for (const w of [0.995, 1.005]) {
    const r = run(w);
    assert.strictEqual(r.normalized, true);
    assert.ok(Math.abs(r.p50 - base.p50) < 1e-3, `${w}: ${r.p50} vs ${base.p50}`);
    assert.strictEqual(r.inputWeight, w);
  }
});

test('E-2. 상관계수 ρ=+1 · ρ=-1 · 고유값 0인 3자산도 계산되고, ρ=0 · 기존 성공 행렬 · 음수 고유값 보정은 그대로다', () => {
  const sb = freshSandbox();
  const prep = (m) => sb.prepareCholeskyFromCorrelation(m);
  for (const m of [[[1, 1], [1, 1]], [[1, -1], [-1, 1]], [[1, 1, 0.5], [1, 1, 0.5], [0.5, 0.5, 1]]]) {
    const p = prep(m);
    assert.strictEqual(p.choleskySucceeded, true);
    assert.strictEqual(p.diagnostics.boundaryStabilized, true);
  }
  const zero = prep([[1, 0], [0, 1]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(zero.L)), [[1, 0], [0, 1]]);
  assert.strictEqual(zero.diagnostics.boundaryStabilized, false);
  const near = prep([[1, 0.999999], [0.999999, 1]]);
  assert.strictEqual(near.diagnostics.boundaryStabilized, false);
  assert.strictEqual(near.L[1][1], 0.0014142132088478148); // 수정 전과 같은 값
  const negative = prep([[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]]);
  assert.strictEqual(negative.choleskySucceeded, true);
  assert.strictEqual(negative.diagnostics.psdCorrectionApplied, true);
  assert.strictEqual(negative.diagnostics.boundaryStabilized, false);
});

test('E-3. 공통 날짜 10개(수익률 9개)는 상관 0 + 경고, 11개(수익률 10개)는 상관 계산 · 경고 없음', () => {
  const sb = freshSandbox();
  const pair = (n) => {
    const a = randomSeries(3, n), b = randomSeries(5, n);
    const out = sb.computeDateAlignedCorrelationMatrix([
      { key: 'A', datedCloses: a.dates.map((d, i) => ({ date: d, close: a.closes[i] })) },
      { key: 'B', datedCloses: b.dates.map((d, i) => ({ date: d, close: b.closes[i] })) }]);
    const diag = out.pairDiagnostics['A|B'];
    return { corr: out.matrix[0][1], diag, warning: sb.assessCorrelationPair(diag.returnObservationCount, 'A', 'B') };
  };
  const ten = pair(10);
  assert.strictEqual(ten.diag.observationCount, 10);
  assert.strictEqual(ten.diag.returnObservationCount, 9);
  assert.strictEqual(ten.corr, 0);
  assert.ok(ten.warning && ten.warning.code === 'SAFETY_CORRELATION_INSUFFICIENT');
  const eleven = pair(11);
  assert.strictEqual(eleven.diag.returnObservationCount, 10);
  assert.notStrictEqual(eleven.corr, 0);
  assert.strictEqual(eleven.warning, null);
});

test('E-4. 월 적립금 대상 종목 미선택 · 원금 없는 소유자 경고, 사용자가 고른 배분은 바뀌지 않는다', async () => {
  const sb = freshSandbox();
  sb.setDailyCloses('069500.KS', randomSeries(43));
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200' })];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }]; });
  const wifeAllocation = [{ ticker: '069500', label: 'KODEX 200', pct: 40 }];
  sb.state.projection.monthlyContributionByOwner = { '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 2000000, years: null, allocation: wifeAllocation } };
  const { input, codes } = await buildMc(sb);
  const unselected = input.safety.issues.filter((i) => i.code === 'SAFETY_CONTRIBUTION_TARGET_UNSELECTED').map((i) => i.message);
  assert.strictEqual(unselected.length, 2);
  assert.ok(unselected.some((m) => m.includes('신랑') && m.includes('100%')));
  assert.ok(unselected.some((m) => m.includes('와이프') && m.includes('60%')));
  assert.ok(codes.includes('SAFETY_CONTRIBUTION_OWNER_NOT_WEIGHTED'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sb.state.projection.monthlyContributionByOwner['와이프'].allocation)), [{ ticker: '069500', label: 'KODEX 200', pct: 40 }]);
  // 대상 종목을 모두 고르면(100%) 미선택 경고가 사라진다
  sb.state.projection.monthlyContributionByOwner['신랑'].allocation = [{ ticker: '069500', label: 'KODEX 200', pct: 100 }];
  sb.state.projection.monthlyContributionByOwner['와이프'].allocation = [{ ticker: '069500', label: 'KODEX 200', pct: 100 }];
  const after = await buildMc(sb);
  assert.ok(!after.codes.includes('SAFETY_CONTRIBUTION_TARGET_UNSELECTED'));
});

/* ── F. 수익률 관리 목록 ─────────────────────────────────────────────────── */

test('F-1. 목표 종목에 대표매칭이 있으면 목록에 그 키가 올라오고, 미확인 목표는 UNRESOLVED 행을 만들지 않는다', () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200', category: 'ETF', rateMatchOverride: 'BOND.STOCK' })];
  sb.state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', normal: 4.5 } };
  sb.state.rebalance['신랑'].domestic = { '국내': 50, '해외': 50 };
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }], '해외': [{ type: 'ticker', ticker: 'PLTR', label: 'Palantir', pct: 100 }] };
  const keys = Array.from(sb.getActiveScenarioRateKeys());
  assert.ok(keys.includes('BOND.STOCK'));
  assert.ok(!keys.includes('KOSPI'));
  assert.ok(!keys.includes('UNRESOLVED'));
  assert.ok(!sb.getScenarioRateDisplayRows().some((r) => r.key === 'UNRESOLVED'));
});

test('F-2. [PMD-01] 접미사 없는 종목코드 키는 바꾸지 않고 안내만 한다', () => {
  const sb = freshSandbox();
  sb.state.projection.customScenarioRates = { '005930': { label: '삼성전자', normal: 10 } };
  assert.ok(sb.getRateKeyFormatHint('005930').includes('005930.KS'));
  assert.strictEqual(sb.getRateKeyFormatHint('005930.KS'), null);
  assert.strictEqual(sb.getRateKeyFormatHint('BOND.STOCK'), null);
  assert.ok(Object.prototype.hasOwnProperty.call(sb.state.projection.customScenarioRates, '005930'));
});
