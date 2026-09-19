/* [1차 통합 구현 · D-16] Exposure Master → 자산 성격 / MC 자산군 연결의 불변 검증.
 *
 * PM 결정(D-16): 원장 → 자산 성격 · MC 자산군은 허용, 원장 → 자동 Return Key(μ 변경)는 금지.
 * 현재 원장 49건(v261 시점)에 대해서는 다음이 모두 같아야 한다 - 자산군 · MC 입력(μ · σ · 상관 · 순서) · 같은 seed MC 결과.
 * "이전"은 같은 코드에서 원장 성격 단계만 끈 상태(resolveExposureCharacter = null)로 만든다 - v261의
 * resolveAssetCharacter와 같은 경로다(원장 단계 외 나머지 단계는 무변경).
 * 사용자 지정 수익률 키(rateMatchOverride → 사용자 키)를 걸어 MC가 실제로 "종목 성격" 경로를 타게 한다
 * (시스템 키면 Return Key 성격이 먼저라 원장이 쓰이지 않는다).
 */
const test = require('node:test');
const assert = require('node:assert');
const EM = require('../js/28-exposure-master.js');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const OWNER = '신랑';
// v261 시점 원장 49건 = EM-2026.1 48건 + SCHD(EM-2026.2로 갱신됐지만 자산군은 그대로).
const CURRENT_49 = EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.1' || e.ticker === 'SCHD');
const isStock = (e) => e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK';
const isForeign = (e) => ['FOREIGN_STOCK', 'FOREIGN_LISTED_ETF'].includes(e.assetType);
const bareTicker = (t) => t.replace(/\.KS$/, '');

function sandbox({ exposureMaster }) {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {}; S.projection.customFeeRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.contributionGrowthRate = 0; S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = { yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 }, allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] } };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 50, '해외': 50 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });
  sb.getCachedDailyCloses = async () => { throw new Error('장기 MC가 가격 이력을 조회했다'); };
  if (!exposureMaster) sb.resolveExposureCharacter = () => null; // v261 경로(원장 성격 단계 없음)
  return sb;
}
function assetOf(sb, e, over) {
  return sb.makeAsset(Object.assign({
    ticker: bareTicker(e.ticker), name: `ZZ ${bareTicker(e.ticker)}`, category: isStock(e) ? '주식' : 'ETF',
    owner: OWNER, accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
    currency: isForeign(e) ? 'USD' : 'KRW', isDomestic: isForeign(e) ? '해외' : '국내'
  }, over || {}));
}
// 49개 종목 전부를 목표 비중에 올린다(지역별 합 100). customKey면 사용자 키로 성격 경로를 강제한다.
function portfolio(sb, { customKey }) {
  if (customKey) sb.state.projection.customScenarioRates = { ZZKEY: { conservative: 4, normal: 6, optimistic: 8 } };
  sb.state.assets = CURRENT_49.map((e) => assetOf(sb, e, customKey ? { rateMatchOverride: 'ZZKEY' } : {}));
  const kr = CURRENT_49.filter((e) => !isForeign(e)); const us = CURRENT_49.filter(isForeign);
  const spread = (list) => list.map((e, i) => ({ type: 'ticker', ticker: bareTicker(e.ticker), label: `ZZ ${bareTicker(e.ticker)}`, pct: i === 0 ? 100 - Math.floor(100 / list.length) * (list.length - 1) : Math.floor(100 / list.length) }));
  sb.state.rebalance[OWNER].targets = { '국내': spread(kr), '해외': spread(us) };
}
async function build(sb) {
  return sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: OWNER, includeTaxAdvantaged: true, years: 20 });
}
// MC 입력 중 계산에 들어가는 값 전부(성격 판정 근거 라벨 appClassBasis만 뺀다 - 진단용 표기).
function mcInputSignature(r) {
  const cma = r.cma ? Array.from(r.cma.instruments, (i) => { const o = Object.assign({}, i); delete o.appClassBasis; return o; }) : null;
  return JSON.stringify({ errors: Array.from(r.errors || []), assetOrder: r.assetOrder, instruments: r.instruments, correlationMatrix: r.correlationMatrix, taxScope: r.taxScope, cma, pairs: r.cma ? r.cma.pairs : null });
}
function runEngine(sb, r) {
  return sb.runMonthlyPrecisionMC({
    pv0: 100000000, instruments: r.instruments, correlationMatrix: r.correlationMatrix,
    monthlyContribution: 1000000, years: 20, iterations: 300, seed: 20260101, taxScope: r.taxScope
  });
}

test('② 원장 49건: 자산 성격(= MC 자산군)이 v261과 같다 - 원장 경로 · v261 경로 · 원장 값 3자 일치', () => {
  const after = sandbox({ exposureMaster: true });
  const before = sandbox({ exposureMaster: false });
  assert.strictEqual(CURRENT_49.length, 49);
  CURRENT_49.forEach((e) => {
    const a = after.resolveAssetCharacter(assetOf(after, e));
    const b = before.resolveAssetCharacter(assetOf(before, e));
    assert.strictEqual(a.character, b.character, `${e.ticker}: ${b.character} → ${a.character}`);
    assert.strictEqual(a.character, e.assetClass, `${e.ticker}: 원장 자산군과 같아야 한다`);
    assert.strictEqual(a.source, 'exposureMaster', `${e.ticker}: 원장이 우선 근거여야 한다`);
    // MC 자산군(사용자 키 → 종목 성격 경로)도 같다.
    const ma = after.resolveMcAppAssetClass({ key: 'ZZKEY', subject: assetOf(after, e) });
    const mb = before.resolveMcAppAssetClass({ key: 'ZZKEY', subject: assetOf(before, e) });
    assert.strictEqual(ma.appClass, mb.appClass, `${e.ticker} MC 자산군`);
  });
});

test('③ MC 입력 불변: 사용자 키 · 시스템 키 두 경우 모두 μ · σ · 상관 · 순서 · 절세 범위가 v261 경로와 같다', async () => {
  for (const customKey of [true, false]) {
    const a = sandbox({ exposureMaster: true }); portfolio(a, { customKey });
    const b = sandbox({ exposureMaster: false }); portfolio(b, { customKey });
    const ra = await build(a); const rb = await build(b);
    assert.deepStrictEqual(Array.from(ra.errors), [], Array.from(ra.errors).join(' / '));
    assert.strictEqual(ra.assetOrder.length, 49);
    assert.strictEqual(mcInputSignature(ra), mcInputSignature(rb), `customKey=${customKey}`);
    if (customKey) {
      // 원장 경로가 실제로 쓰였다(근거 라벨만 다르다) - 불변이 "원장을 안 써서"가 아님을 확인한다.
      assert.ok(Array.from(ra.cma.instruments).some((i) => i.appClassBasis === 'exposureMaster'));
      assert.ok(Array.from(rb.cma.instruments).every((i) => i.appClassBasis !== 'exposureMaster'));
      assert.ok(Array.from(ra.instruments).every((i) => i.muAnnual === 0.06), 'μ는 사용자 키 그대로');
    }
  }
});

test('④ 같은 seed(20260101) MC 결과가 v261 경로와 완전히 같다', async () => {
  const a = sandbox({ exposureMaster: true }); portfolio(a, { customKey: true });
  const b = sandbox({ exposureMaster: false }); portfolio(b, { customKey: true });
  const outA = runEngine(a, await build(a));
  const outB = runEngine(b, await build(b));
  assert.strictEqual(JSON.stringify(outA), JSON.stringify(outB));
  assert.ok(outA.milestones && outA.milestones.length > 0);
});

test('⑯ Return Key 동작 보존: 원장 전체(58건)에서 Return Key · 추천 · 상태 점검이 원장 유무와 무관하다', () => {
  const a = sandbox({ exposureMaster: true });
  const b = sandbox({ exposureMaster: false });
  assert.ok(!Array.from(a.evalInSandbox('CHARACTER_SOURCES_FOR_AUTO_RATE_KEY')).includes('exposureMaster'), '원장은 자동 Return Key 근거가 아니다');
  EM.EXPOSURE_MASTER_ENTRIES.forEach((e) => {
    const ka = a.resolveAssetGroupKeyDetail(assetOf(a, e)); const kb = b.resolveAssetGroupKeyDetail(assetOf(b, e));
    assert.strictEqual(`${ka.key}|${ka.source}`, `${kb.key}|${kb.source}`, e.ticker);
    assert.strictEqual(a.resolveRateKeyFromAssetCharacter(assetOf(a, e)), b.resolveRateKeyFromAssetCharacter(assetOf(b, e)), e.ticker);
    const ra = a.recommendReturnAssumptionKey({ ticker: bareTicker(e.ticker), name: `ZZ ${bareTicker(e.ticker)}` });
    const rb = b.recommendReturnAssumptionKey({ ticker: bareTicker(e.ticker), name: `ZZ ${bareTicker(e.ticker)}` });
    assert.strictEqual(JSON.stringify(ra), JSON.stringify(rb), `${e.ticker} 추천`);
    assert.strictEqual(JSON.stringify(a.assessReturnAssumptionStatus(assetOf(a, e))), JSON.stringify(b.assessReturnAssumptionStatus(assetOf(b, e))), `${e.ticker} 상태`);
  });
});

test('⑰ 사용자 지정 우선순위 보존: 대표매칭 · 사용자 확정 자산군이 원장보다 먼저다', () => {
  const sb = sandbox({ exposureMaster: true });
  const aapl = EM.EXPOSURE_MASTER_ENTRIES.find((e) => e.ticker === 'AAPL');
  // 대표매칭(사용자 지정 키)은 Return Key 1순위 그대로다.
  const over = sb.resolveAssetGroupKeyDetail(assetOf(sb, aapl, { rateMatchOverride: 'KOSPI' }));
  assert.deepStrictEqual({ key: over.key, source: over.source }, { key: 'KOSPI', source: 'override' });
  // MC 자산군도 Return Key(시스템 키)의 성격이 먼저다 - 원장의 US_EQUITY가 사용자 선택을 덮지 않는다.
  assert.strictEqual(sb.resolveMcAppAssetClass({ key: 'KOSPI', subject: assetOf(sb, aapl) }).appClass, 'KR_EQUITY');
  // 사용자가 확정한 자산군(채권)은 원장보다 먼저다.
  const bond = sb.resolveAssetCharacter(assetOf(sb, aapl, { category: '채권', categorySource: 'user' }));
  assert.deepStrictEqual({ c: bond.character, s: bond.source }, { c: 'BOND', s: 'category' });
  // 이름이 혼합이라고 밝히면 원장 등록 종목이어도 단일 성격으로 판정하지 않는다(기존 0단계 유지).
  const mixedName = sb.resolveAssetCharacter(assetOf(sb, aapl, { name: 'ZZ 채권혼합' }));
  assert.strictEqual(mixedName.character, 'UNRESOLVED');
});

test('D-16 신규 원장 항목의 MC 영향 범위: 성격은 원장 값, Return Key는 v261과 같다(영향은 사용자 키를 쓴 경우의 자산군뿐)', () => {
  const a = sandbox({ exposureMaster: true });
  const b = sandbox({ exposureMaster: false });
  EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.2' && e.ticker !== 'SCHD').forEach((e) => {
    // 원장 식별자(야후 기호) 그대로 넣는다 - 영문이 섞인 새 국내 종목코드는 접미사 없이 입력하면 해외 기호로 해석된다(별도 과제).
    const ca = a.resolveAssetCharacter(assetOf(a, e, { ticker: e.ticker }));
    if (e.exposureStructure === 'MIXED') assert.strictEqual(ca.character, 'UNRESOLVED', e.ticker);
    else assert.strictEqual(ca.character, e.assetClass, e.ticker);
    const ka = a.resolveAssetGroupKeyDetail(assetOf(a, e)); const kb = b.resolveAssetGroupKeyDetail(assetOf(b, e));
    assert.strictEqual(`${ka.key}|${ka.source}`, `${kb.key}|${kb.source}`, `${e.ticker} Return Key`);
  });
});

/* [2차 통합 보완 · PM 결정 ①] 신규 원장 항목(EM-2026.2)의 MC 영향 - 허용된 변화([EXPECTED CHANGE])를 고정한다.
 * v261 경로(원장 성격 단계 없음)와 비교해 "무엇이 바뀌고 무엇이 그대로인지"를 명시한다. 기존 49건 불변은 위 ②③④가 지킨다. */
const NEW_ENTRIES = EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.2' && e.ticker !== 'SCHD');
function singleTarget(sb, e, over) {
  // 원장 식별자(야후 기호) 그대로 쓴다 - 국내 상장 상품은 원화 · 국내 목표로 둔다.
  sb.state.assets = [assetOf(sb, e, Object.assign({ ticker: e.ticker, currency: 'KRW', isDomestic: '국내' }, over || {}))];
  sb.state.rebalance[OWNER].domestic = { '국내': 100, '해외': 0 };
  sb.state.rebalance[OWNER].targets = { '국내': [{ type: 'ticker', ticker: e.ticker, label: `ZZ ${e.ticker}`, pct: 100 }], '해외': [] };
}

test('B-1. 신규 원장 자산 · Return Key 없음(가정 없음): 원장 경로와 v261 경로의 MC 입력이 같다(σ = 0 정책 유지)', async () => {
  for (const e of NEW_ENTRIES) {
    const a = sandbox({ exposureMaster: true }); singleTarget(a, e);
    const b = sandbox({ exposureMaster: false }); singleTarget(b, e);
    const ra = await build(a); const rb = await build(b);
    // 계산 입력(μ · σ · 상관 · 순서)은 같다. 진단용 자산군 라벨만 원장 값으로 채워질 수 있다(가정 없음 → σ = 0은 그대로).
    const numeric = (r) => JSON.stringify({ errors: Array.from(r.errors || []), assetOrder: r.assetOrder, instruments: r.instruments, correlationMatrix: r.correlationMatrix });
    assert.strictEqual(numeric(ra), numeric(rb), e.ticker);
    if (ra.instruments && ra.instruments.length) {
      const inst = ra.instruments[0];
      if (ra.cma && ra.cma.instruments[0].noAssumption) assert.strictEqual(inst.sigmaAnnual, 0, `${e.ticker}: 가정 없는 자산은 σ = 0`);
    }
  }
});

test('B-2. [EXPECTED CHANGE] 신규 원장 자산 · 사용자 정의 Return Key: 원장 자산군으로 MC가 실행된다(μ는 사용자 값 그대로)', async () => {
  const changed = [];
  for (const e of NEW_ENTRIES) {
    const custom = (sb) => { sb.state.projection.customScenarioRates = { ZZKEY: { conservative: 4, normal: 6, optimistic: 8 } }; singleTarget(sb, e, { rateMatchOverride: 'ZZKEY' }); };
    const a = sandbox({ exposureMaster: true }); custom(a);
    const b = sandbox({ exposureMaster: false }); custom(b);
    const ra = await build(a); const rb = await build(b);
    if (e.exposureStructure === 'MIXED') {
      // 혼합 노출은 단일 자산군이 없다 - 두 경로 모두 같은 결과(자산군을 정할 수 없는 위험자산 → 차단)다.
      assert.strictEqual(mcInputSignature(ra), mcInputSignature(rb), e.ticker);
      continue;
    }
    assert.deepStrictEqual(Array.from(ra.errors), [], `${e.ticker}: ${Array.from(ra.errors).join(' / ')}`);
    assert.strictEqual(ra.cma.instruments[0].appClass, e.assetClass, e.ticker);
    assert.strictEqual(ra.instruments[0].muAnnual, 0.06, `${e.ticker}: μ는 사용자 키 그대로(원장이 μ를 바꾸지 않는다)`);
    assert.ok(ra.instruments[0].sigmaAnnual > 0, `${e.ticker}: 원장 자산군의 CMA 변동성`);
    if (mcInputSignature(ra) !== mcInputSignature(rb)) changed.push([e.ticker, Array.from(rb.errors).length ? 'v261: 차단(자산군 없음)' : `v261: ${rb.cma.instruments[0].appClass}`]);
    else assert.strictEqual(rb.cma.instruments[0].appClass, e.assetClass, `${e.ticker}: 바뀌지 않았다면 v261도 같은 자산군이어야 한다`);
  }
  // 바뀌는 경우는 v261이 이름 · 공유표로 성격을 알 수 없어 MC를 차단하던 경우뿐이다 - 다른 자산군으로 바뀌는 경우는 없다.
  // (어느 종목이 해당하는지는 사용자가 적은 이름에 달려 있다. 이 테스트는 이름을 가상값으로 둬 전부 해당한다.)
  assert.ok(changed.length > 0);
  changed.forEach((c) => assert.strictEqual(c[1], 'v261: 차단(자산군 없음)', c[0]));
});
