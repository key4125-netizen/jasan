// [v246 · PMD-12] Instrument Return Key Master 회귀 테스트.
// 실행: node --test test/instrument-return-key-master.test.js
//
// 여기서 고정하는 계약(checklist §33):
//   I. 해석: 종목 기준은 소유자 · 계좌 · 보유 여부와 무관하게 적용되고, 사용자 지정 대표매칭이 먼저다. 충돌이면 자동 판별 + 확인 필요,
//      연결된 키에 수익률이 없으면 0% + 가정 없음, 연결이 없으면 v245 해석 그대로다.
//   M. Monte Carlo 실제 입력(muAnnual)까지 종목 기준 수익률이 들어간다.
//   S. 저장 · 복원 · 동기화: 필드가 없는 원격/백업은 이 기기 연결을 지우지 않고, {}는 명시적 초기화다.
//
// 외부 의존 없음: 네트워크 차단 · 가격 이력은 합성 fixture. 실제 사용자 데이터 없음(공개 종목코드와 합성 수치만 쓴다).
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

function isoDate(i) { return new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10); }
function randomSeries(seed, n = 260, vol = 0.012) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let p = 100;
  const closes = [];
  for (let i = 0; i < n; i++) { p *= 1 + (rnd() - 0.5) * 2 * vol; closes.push(p); }
  return { dates: Array.from({ length: n }, (_, i) => isoDate(i)), closes };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const PRESETS = ['conservative', 'normal', 'optimistic'];
const TR = { ticker: '278530', name: 'KODEX 200TR' };

function freshSandbox() {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {}; S.projection.customFeeRates = {}; S.projection.instrumentReturnKeys = {};
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
  ['278530.KS', '069500.KS', '360750.KS', 'ZZETF'].forEach((t, i) => sb.setDailyCloses(t, randomSeries(200 + i)));
  sb.asset = (o) => sb.makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e8, currentPrice: 1e8, currency: 'KRW' }, o));
  sb.target = (o) => Object.assign({ type: 'ticker', ticker: TR.ticker, label: TR.name, pct: 100 }, o);
  return sb;
}
async function buildMc(sb, opts = {}) {
  const input = await sb.buildMonteCarloInputFromState({ presetKey: opts.preset || 'normal', ownerFilter: opts.owner, includeTaxAdvantaged: true, years: 20 });
  assert.deepStrictEqual(Array.from(input.errors || []), [], `어댑터 오류: ${Array.from(input.errors || []).join(' / ')}`);
  const issues = [].concat(input.safety.issues, input.safety.dataQuality.issues);
  return { input, issues, codes: issues.map((i) => i.code), byKey: Object.fromEntries(input.instruments.map((i) => [i.key, i])) };
}
const kospiRates = (sb) => PRESETS.map((p) => sb.resolveProjectionRateForKey('KOSPI', p, false));

/* ── I. 해석 ─────────────────────────────────────────────────────────────── */

test('I-1. 278530.KS → KOSPI Master: source instrument · 3시나리오 KOSPI 수익률 · 종목 기준 표시 · MC 확인 필요 경고 없음', async () => {
  const sb = freshSandbox();
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  const a = sb.asset(TR);
  sb.state.assets = [a];
  sb.state.rebalance['신랑'].targets['국내'] = [sb.target()];
  const detail = sb.resolveAssetGroupKeyDetail(a);
  assert.strictEqual(detail.key, 'KOSPI');
  assert.strictEqual(detail.source, 'instrument');
  assert.strictEqual(detail.instrumentConflict, undefined);
  assert.deepStrictEqual(PRESETS.map((p) => sb.getAssetProjectionRate(a, p)), kospiRates(sb));
  const shown = sb.describeAppliedReturnAssumption(a);
  assert.strictEqual(shown.sourceLabel, '종목 기준');
  assert.strictEqual(shown.isUserSet, false, 'Master는 자산 단위 사용자 지정이 아니다');
  const { byKey, codes } = await buildMc(sb);
  assert.strictEqual(byKey['T:278530.KS'].muAnnual, sb.resolveProjectionRateForKey('KOSPI', 'normal', false) / 100);
  assert.ok(!codes.includes('SAFETY_RETURN_KEY_NEEDS_REVIEW'));
  assert.ok(!codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
  // 성격과 다른 기준을 Master로 연결해도 "자동 연결 확인 필요"로 표시하지 않는다(사용자가 정한 종목 기준)
  sb.state.projection.instrumentReturnKeys = { '114260.KS': 'KOSPI' };
  sb.setDailyCloses('114260.KS', randomSeries(300));
  sb.state.assets = [sb.asset({ ticker: '114260', name: 'KODEX 국고채3년' })];
  sb.state.rebalance['신랑'].targets['국내'] = [sb.target({ ticker: '114260', label: 'KODEX 국고채3년' })];
  const bond = await buildMc(sb);
  assert.ok(!bond.codes.includes('SAFETY_RETURN_KEY_NEEDS_REVIEW'));
});

test('I-2. 같은 종목을 신랑 · 와이프가 보유 → 둘 다 같은 Master 키 · MC instrument 1개 · 불일치 경고 없음', async () => {
  const sb = freshSandbox();
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  sb.state.assets = [sb.asset(TR), sb.asset(Object.assign({ owner: '와이프', accountType: 'ISA' }, TR))];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [sb.target()]; });
  sb.state.assets.forEach((a) => assert.strictEqual(sb.resolveAssetGroupKeyDetail(a).key, 'KOSPI'));
  const kospi = sb.resolveProjectionRateForKey('KOSPI', 'normal', false);
  assert.strictEqual(sb.computeRegionWeightedRate('신랑', '국내', 'normal'), kospi);
  assert.strictEqual(sb.computeRegionWeightedRate('와이프', '국내', 'normal'), kospi);
  const { input, codes } = await buildMc(sb);
  assert.deepStrictEqual(Array.from(input.instruments, (i) => i.key), ['T:278530.KS']);
  assert.ok(!codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
});

test('I-3. 보유하지 않은 종목(일반 목표 · 월 적립 배분 · 절세 배분)도 Master 적용 - 연결이 없으면 v245처럼 0%', async () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ name: '국고채A', category: '채권', owner: '와이프' })];
  sb.state.rebalance['와이프'].targets['국내'] = [sb.target()];
  const item = { ticker: TR.ticker, label: TR.name, pct: 100 };
  sb.state.projection.taxAdvantagedPlan.contributionByOwnerAccount['와이프'] = [{ accountType: 'ISA', amount: 500000, years: 10, frequency: 'monthly' }];
  sb.state.projection.taxAdvantagedPlan.allocationByOwner['와이프'] = [{ accountType: 'ISA', ticker: TR.ticker, label: TR.name, pct: 100 }];
  const rates = () => [
    sb.getTargetProjectionRate(sb.target({ owner: '와이프' }), 'normal', '국내', 'general'),
    sb.getMonthlyAllocationItemRate(item, 'normal', '와이프', 'general'),
    sb.getMonthlyAllocationItemRate(item, 'normal', '와이프', 'ISA')
  ];
  assert.deepStrictEqual(rates(), [0, 0, 0], '연결 전: 자동 판별 근거가 없는 종목은 0%');
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  const kospi = sb.resolveProjectionRateForKey('KOSPI', 'normal', false);
  assert.deepStrictEqual(rates(), [kospi, kospi, kospi]);
  assert.strictEqual(sb.computeRegionWeightedRate('와이프', '국내', 'normal'), kospi);
  const { input, codes } = await buildMc(sb, { owner: '와이프' });
  const i = input.assetOrder.indexOf('T:278530.KS');
  assert.ok(i >= 0);
  assert.strictEqual(input.instruments[i].muAnnual, kospi / 100);
  assert.ok(input.taxScope.monthlyContributions.some((row) => row[i] > 0), '절세 적립 배분이 같은 instrument로 들어간다');
  assert.ok(!codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
});

test('I-4. USER override(NASDAQ)가 Master(KOSPI)보다 우선 · 기존 불일치 분리 · Master와 override 원본 불변', async () => {
  const sb = freshSandbox();
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  sb.state.assets = [sb.asset(Object.assign({ rateMatchOverride: 'NASDAQ' }, TR)), sb.asset(Object.assign({ owner: '와이프' }, TR))];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [sb.target()]; });
  assert.deepStrictEqual(sb.state.assets.map((a) => [sb.resolveAssetGroupKeyDetail(a).key, sb.resolveAssetGroupKeyDetail(a).source]), [['NASDAQ', 'override'], ['KOSPI', 'instrument']]);
  const { byKey, codes } = await buildMc(sb);
  assert.ok(byKey['T:278530.KS|NASDAQ'] && byKey['T:278530.KS|KOSPI'], 'N-10 기준별 instrument 분리');
  assert.ok(codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), { '278530.KS': 'KOSPI' });
  assert.deepStrictEqual(sb.state.assets.map((a) => a.rateMatchOverride), ['NASDAQ', undefined]);
});

test('I-5. 같은 종목에 서로 다른 Master 키 → 자동 선택 없음 · 자동 판별 결과 · NEEDS_REVIEW · 자동 결과가 UNRESOLVED면 MISSING도 함께', async () => {
  const sb = freshSandbox();
  sb.state.projection.instrumentReturnKeys = { '278530': 'KOSPI', '278530.KS': 'NASDAQ' };
  const a = sb.asset(TR);
  sb.state.assets = [a];
  sb.state.rebalance['신랑'].targets['국내'] = [sb.target()];
  const detail = sb.resolveAssetGroupKeyDetail(a);
  assert.strictEqual(detail.key, 'UNRESOLVED');
  assert.strictEqual(detail.instrumentConflict, true);
  assert.deepStrictEqual(Array.from(detail.instrumentConflictKeys).sort(), ['KOSPI', 'NASDAQ']);
  const rateDetail = sb.resolveAssetRateDetail(a, 'normal');
  assert.strictEqual(rateDetail.rate, 0);
  assert.strictEqual(rateDetail.assumptionMissing, true);
  assert.strictEqual(rateDetail.instrumentConflict, true, '충돌 표식이 수익률 해석에서 버려지지 않는다');
  const status = sb.assessReturnAssumptionStatus(a);
  assert.strictEqual(status.status, 'NEEDS_REVIEW');
  assert.match(status.message, /0%/);
  const { codes } = await buildMc(sb);
  assert.ok(codes.includes('SAFETY_RETURN_KEY_NEEDS_REVIEW'));
  assert.ok(codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
  // 자동 판별 근거가 있는 종목(KODEX 200 → KOSPI)은 그 결과로 계산하고 확인 필요만 알린다
  sb.state.projection.instrumentReturnKeys = { '069500.KS': 'BOND', '069500': 'NASDAQ' };
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200' })];
  sb.state.rebalance['신랑'].targets['국내'] = [sb.target({ ticker: '069500', label: 'KODEX 200' })];
  const auto = sb.resolveAssetRateDetail(sb.state.assets[0], 'normal');
  assert.deepStrictEqual([auto.key, auto.source, auto.instrumentConflict], ['KOSPI', 'assetCharacter', true]);
  const second = await buildMc(sb);
  assert.ok(second.codes.includes('SAFETY_RETURN_KEY_NEEDS_REVIEW'));
  assert.ok(!second.codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), { '069500.KS': 'BOND', '069500': 'NASDAQ' }, '충돌 연결을 자동으로 고치지 않는다');
});

test('I-6. Master 키에 그 시나리오 수익률이 없으면 0% + MISSING · 다른 키 수익률로 대체하지 않는다', async () => {
  const sb = freshSandbox();
  sb.state.projection.customScenarioRates = { E_PART: { label: '일부만', normal: 6 }, E_ONLY: { label: '키만' } };
  const a = sb.asset(TR);
  sb.state.assets = [a];
  sb.state.rebalance['신랑'].targets['국내'] = [sb.target()];
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'E_PART' };
  const part = PRESETS.map((p) => sb.resolveAssetRateDetail(a, p));
  assert.deepStrictEqual(part.map((d) => [d.key, d.source, d.rate, d.assumptionMissing]),
    [['E_PART', 'instrument', 0, true], ['E_PART', 'instrument', 6, false], ['E_PART', 'instrument', 0, true]]);
  const conservative = await buildMc(sb, { preset: 'conservative' });
  assert.ok(conservative.codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
  assert.strictEqual(conservative.byKey['T:278530.KS'].muAnnual, 0);
  for (const key of ['E_ONLY', 'NOT_REGISTERED']) {
    sb.state.projection.instrumentReturnKeys = { '278530.KS': key };
    assert.deepStrictEqual(PRESETS.map((p) => sb.resolveAssetRateDetail(a, p)).map((d) => [d.key, d.rate, d.assumptionMissing]),
      PRESETS.map(() => [key, 0, true]), key);
  }
});

test('I-7. Master 없음 → v245 해석 · 추천 · 결정론 · MC 입력 그대로(필드 없음 = {})', async () => {
  const build = async (withField) => {
    const sb = freshSandbox();
    if (!withField) delete sb.state.projection.instrumentReturnKeys;
    sb.state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', normal: 4.5 } };
    sb.state.assets = [
      sb.asset({ ticker: '069500', name: 'KODEX 200' }), sb.asset(TR),
      sb.asset({ ticker: '360750', name: 'TIGER 미국S&P500', owner: '와이프', rateMatchOverride: 'BOND.STOCK' }),
      sb.asset({ name: '국고채A', category: '채권', owner: '와이프', accountType: 'IRP' })
    ];
    sb.state.rebalance['신랑'].targets['국내'] = [sb.target({ ticker: '069500', label: 'KODEX 200', pct: 60 }), sb.target({ pct: 40 })];
    sb.state.rebalance['와이프'].targets['국내'] = [sb.target({ ticker: '360750', label: 'TIGER 미국S&P500' })];
    const keys = sb.state.assets.map((a) => { const d = sb.resolveAssetGroupKeyDetail(a); return [d.key, d.source, d.instrumentConflict]; });
    const rec = ['RISE 미국나스닥100', 'KODEX 200TR'].map((n) => { const r = sb.recommendRateMatchKey({ name: n, ticker: '', currency: 'KRW' }); return r && r.key; });
    const det = ['신랑', '와이프'].map((o) => sb.computeRegionWeightedRate(o, '국내', 'normal'));
    const { input, codes } = await buildMc(sb);
    return clone({ keys, rec, det, instruments: input.instruments, codes });
  };
  const legacy = await build(false);
  const empty = await build(true);
  assert.deepStrictEqual(empty, legacy);
  assert.deepStrictEqual(legacy.keys, [['KOSPI', 'assetCharacter', null], ['UNRESOLVED', 'unresolved', null], ['BOND.STOCK', 'override', null], ['채권', 'category', null]]);
});

test('I-8. Master 없음 + 자동 판별 근거 없음 → UNRESOLVED 0% + MISSING', async () => {
  const sb = freshSandbox();
  sb.state.assets = [sb.asset({ ticker: 'ZZETF', name: 'Unknown Global ETF', currency: 'USD', isDomestic: '해외' })];
  sb.state.rebalance['신랑'].domestic = { '국내': 0, '해외': 100 };
  sb.state.rebalance['신랑'].targets['해외'] = [sb.target({ ticker: 'ZZETF', label: 'Unknown Global ETF' })];
  const d = sb.resolveAssetRateDetail(sb.state.assets[0], 'normal');
  assert.deepStrictEqual([d.key, d.source, d.rate, d.assumptionMissing], ['UNRESOLVED', 'unresolved', 0, true]);
  const { byKey, codes } = await buildMc(sb);
  assert.strictEqual(byKey['T:ZZETF'].muAnnual, 0);
  assert.ok(codes.includes('SAFETY_RETURN_ASSUMPTION_MISSING'));
});

test('I-9. Master와 사전 티커 키 행(customKey)이 함께 있으면 Master 우선 · 충돌 아님', () => {
  const sb = freshSandbox();
  sb.state.projection.customScenarioRates = { '278530.KS': { label: 'KODEX 200TR', conservative: 1, normal: 9, optimistic: 12 } };
  const a = sb.asset(TR);
  assert.deepStrictEqual([sb.resolveAssetGroupKeyDetail(a).key, sb.resolveAssetGroupKeyDetail(a).source], ['278530.KS', 'customKey'], '연결 전 기존 customKey');
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  const d = sb.resolveAssetRateDetail(a, 'normal');
  assert.deepStrictEqual([d.key, d.source, d.instrumentConflict], ['KOSPI', 'instrument', undefined]);
  assert.strictEqual(d.rate, sb.resolveProjectionRateForKey('KOSPI', 'normal', false));
  // [D-6] customKey로 매칭된 다른 종목은 계산 의미 그대로(사용자 지정으로 판정) · 표시만 종목 기준
  sb.state.projection.customScenarioRates['000660.KS'] = { label: 'SK하이닉스', conservative: 8, normal: 12, optimistic: 15 };
  const hynix = sb.describeAppliedReturnAssumption(sb.asset({ ticker: '000660', name: 'SK하이닉스' }));
  assert.deepStrictEqual([hynix.appliedKey, hynix.sourceLabel, hynix.isUserSet], ['000660.KS', '종목 기준', true]);
});

/* ── M. Monte Carlo 실제 입력 ────────────────────────────────────────────── */

test('M-1. 신랑 override KOSPI + 와이프 Master KOSPI → instrument 1개 · muAnnual = 시나리오 수익률/100 · 사전 값 변경 반영', async () => {
  const sb = freshSandbox();
  sb.state.projection.instrumentReturnKeys = { '278530.KS': 'KOSPI' };
  sb.state.assets = [sb.asset(Object.assign({ rateMatchOverride: 'KOSPI' }, TR)), sb.asset({ name: '국고채A', category: '채권', owner: '와이프' })];
  ['신랑', '와이프'].forEach((o) => { sb.state.rebalance[o].targets['국내'] = [sb.target()]; });
  const first = await buildMc(sb);
  assert.deepStrictEqual(Array.from(first.input.instruments, (i) => i.key), ['T:278530.KS']);
  assert.strictEqual(first.byKey['T:278530.KS'].muAnnual, sb.resolveProjectionRateForKey('KOSPI', 'normal', false) / 100);
  assert.ok(!first.codes.includes('SAFETY_RETURN_KEY_CONFLICT'));
  sb.state.projection.customScenarioRates = { KOSPI: { label: 'KOSPI', conservative: 4, normal: 8, optimistic: 12 } };
  for (const [preset, mu] of [['normal', 0.08], ['conservative', 0.04], ['optimistic', 0.12]]) {
    const run = await buildMc(sb, { preset });
    assert.strictEqual(run.byKey['T:278530.KS'].muAnnual, mu, preset);
  }
});

/* ── S. 저장 · 복원 · 동기화 ─────────────────────────────────────────────── */

function loadSyncSandbox() {
  const sb = freshSandbox();
  sb.XLSX = {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '12-import-export-sync.js'), 'utf8'), sb, { filename: '12-import-export-sync.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '25-sync-diff.js'), 'utf8'), sb, { filename: '25-sync-diff.js' });
  return sb;
}

test('S-1. adopt(JSON 복원 · Cloud): 필드 없음 = 로컬 유지 · {} = 초기화 · object = 채택 · 동기화 차이 비교가 같은 규칙', () => {
  const sb = loadSyncSandbox();
  const local = { '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND' };
  const remoteProjection = (extra) => Object.assign(clone(sb.state.projection), { updatedAt: Date.now() + 100000 }, extra);
  const reset = () => { sb.state.projection.instrumentReturnKeys = clone(local); sb.state.projection.updatedAt = 1; };

  reset();
  const absent = remoteProjection({ customScenarioRates: { E: { label: 'E', normal: 3 } } });
  delete absent.instrumentReturnKeys;
  sb.adoptRemoteRebalanceAndProjection({ projection: absent }, { force: true });
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), local, '필드가 없는 백업 · 원격은 이 기기 연결을 지우지 않는다');
  assert.deepStrictEqual(clone(sb.state.projection.customScenarioRates), { E: { label: 'E', normal: 3 } }, '다른 projection 필드는 기존 규칙대로 채택');

  reset();
  sb.adoptRemoteRebalanceAndProjection({ projection: remoteProjection({ instrumentReturnKeys: {} }) }, { force: false });
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), {}, '{}는 명시적 초기화');

  reset();
  sb.adoptRemoteRebalanceAndProjection({ projection: remoteProjection({ instrumentReturnKeys: { '360750': 'S&P500' } }) }, { force: false });
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), { '360750': 'S&P500' }, '원문 식별자를 그대로 채택');

  reset();
  const stale = remoteProjection({ instrumentReturnKeys: {} });
  stale.updatedAt = 0;
  sb.adoptRemoteRebalanceAndProjection({ projection: stale }, { force: false });
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), local, '원격이 더 오래됐으면 기존 LWW대로 무시');

  // JSON 복원 경로(applyRemoteScalarFields → force adopt)도 같은 규칙
  reset();
  const backup = { projection: remoteProjection({}) };
  delete backup.projection.instrumentReturnKeys;
  sb.applyRemoteScalarFields(backup, { stampAt: Date.now() });
  assert.deepStrictEqual(clone(sb.state.projection.instrumentReturnKeys), local);

  // 동기화 차이: 필드 없음 = 차이 아님 · 다른 값 · {} = 차이
  reset();
  const base = { assets: [], transactions: [], rebalance: clone(sb.state.rebalance), projection: clone(sb.state.projection) };
  const cloud = (p) => Object.assign(clone(base), { projection: p });
  const withoutField = clone(base.projection);
  delete withoutField.instrumentReturnKeys;
  assert.strictEqual(sb.compareSyncData(base, cloud(withoutField)).projection.changed, false);
  assert.strictEqual(sb.compareSyncData(base, cloud(Object.assign(clone(base.projection), { instrumentReturnKeys: {} }))).projection.changed, true);
  assert.strictEqual(sb.compareSyncData(base, cloud(Object.assign(clone(base.projection), { instrumentReturnKeys: { '278530.KS': 'NASDAQ' } }))).projection.changed, true);
  assert.strictEqual(sb.compareSyncData(base, cloud(clone(base.projection))).projection.changed, false);
});

test('S-2. loadState: 필드가 없는 저장값은 {}로 시작 · 저장된 연결은 원문 그대로 · 잘못된 형식은 버린다', () => {
  const sb = freshSandbox();
  sb.schedulePush = () => {}; // js/12(동기화) 미탑재 샌드박스 - loadState의 저장 경로가 부르는 push 예약만 무해하게 막는다
  const LS_PROJECTION = sb.evalInSandbox('LS_PROJECTION');
  const legacy = clone(sb.state.projection);
  delete legacy.instrumentReturnKeys;
  const load = (projection) => {
    sb.localStorage.getItem = (k) => (k === LS_PROJECTION ? JSON.stringify(projection) : null);
    sb.state.projection.instrumentReturnKeys = { SHOULD: 'BE_REPLACED' };
    sb.loadState();
    return clone(sb.state.projection.instrumentReturnKeys);
  };
  assert.deepStrictEqual(load(legacy), {});
  assert.deepStrictEqual(load(Object.assign(clone(legacy), { instrumentReturnKeys: { '278530': 'KOSPI', 'NAME:국고채 A': 'BOND', '': 'X', BAD: 3 } })), { '278530': 'KOSPI', 'NAME:국고채 A': 'BOND' });
  assert.deepStrictEqual(load(Object.assign(clone(legacy), { instrumentReturnKeys: ['x'] })), {});
});

test('S-3. 엑셀 2시트 적용 종목 병합: 파일에 있는 키만 교체 · 빈 칸 해제 · 충돌은 기존 유지 · 표기 원문 보존', () => {
  const sb = freshSandbox();
  const current = { '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND', '360750.KS': 'S&P500' };
  const merge = (rows) => clone(sb.mergeInstrumentReturnKeysFromImport(current, rows));
  const replaced = merge([{ key: 'KOSPI', cell: '278530, 069500.KS' }, { key: 'BOND', cell: '' }]);
  assert.deepStrictEqual(replaced.next, { '360750.KS': 'S&P500', '278530': 'KOSPI', '069500.KS': 'KOSPI' });
  assert.strictEqual(replaced.changed, true);
  const conflict = merge([{ key: 'KOSPI', cell: '278530.KS' }, { key: 'NASDAQ', cell: '278530' }]);
  assert.deepStrictEqual(conflict.next, { '278530.KS': 'KOSPI', 'NAME:국고채A': 'BOND', '360750.KS': 'S&P500' });
  assert.deepStrictEqual(conflict.conflicts, ['278530.KS']);
  const againstKept = merge([{ key: 'KOSPI', cell: '278530.KS, 360750' }]);
  assert.strictEqual(againstKept.next['360750.KS'], 'S&P500', '파일에 없는 키(S&P500)의 연결과 부딪히면 반영하지 않는다');
  assert.ok(!('360750' in againstKept.next));
  const same = merge([{ key: 'KOSPI', cell: '278530.KS' }, { key: 'BOND', cell: 'NAME:국고채A' }, { key: 'S&P500', cell: '360750.KS' }]);
  assert.strictEqual(same.changed, false);
});
