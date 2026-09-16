// 장기 CMA 해석(js/27) · 실제 ACTIVE 데이터(js/26 · data/cma) · MC 어댑터 연결 테스트 (체크리스트 §37).
// 실행: node --test test/cma-runtime.test.js
//   R-*: 합성 세트(SYNTHETIC_TEST_DATA)로 상관 출처 우선순위 · Benchmark 규칙을 고정한다.
//   O-*: 실제 ACTIVE 세트(OFFICIAL_DATA · BENCHMARK_REFERENCE)가 원문 값 · 근거와 같은지 고정한다.
//   M-*: MC 어댑터(js/16)가 가격 이력 없이 CMA 변동성 · 상관을 쓰는지 고정한다.
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const rt = require(path.join(__dirname, '..', 'js', '27-cma-runtime.js'));
const { CMA_ACTIVE_SET } = require(path.join(__dirname, '..', 'js', '26-cma-data.js'));
const engine = require(path.join(__dirname, '..', 'js', '15-monte-carlo-engine.js'));
const core = require(path.join(__dirname, '..', 'scripts', 'cma', 'cma-core.js'));
const fx = require('./cma-fixtures.js');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const DATA = path.join(__dirname, '..', 'data', 'cma');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ── R. 상관 출처 우선순위 (합성) ─────────────────────────────────────────── */

test('R-1. 자산 성격 → CMA 자산군 · 변동성, 연결 없는 성격은 UNMAPPED(이유 포함), 세트 없음은 NO_ACTIVE_SET', () => {
  const set = fx.synRuntimeSet();
  const kr = rt.resolveCmaRiskForAppClass('KR_EQUITY', set);
  assert.strictEqual(kr.status, 'MAPPED');
  assert.strictEqual(kr.cmaClass, 'KR Eq');
  assert.strictEqual(kr.volatilityPct, 25);
  assert.strictEqual(kr.dataset.datasetId, 'SYN-A');
  const dev = rt.resolveCmaRiskForAppClass('DEV_EX_US_EQUITY', set);
  assert.strictEqual(dev.status, 'UNMAPPED');
  assert.match(dev.reason, /연결 없음/);
  assert.strictEqual(rt.resolveCmaRiskForAppClass('KR_EQUITY', null).status, 'NO_ACTIVE_SET');
});

test('R-2. PRIMARY 원문에 값이 있으면 OFFICIAL_CMA_DIRECT(기준 자산군과의 상관), 같은 자산군은 1', () => {
  const set = fx.synRuntimeSet();
  const c = rt.resolveCmaCorrelation('KR_EQUITY', 'WORLD', set);
  assert.strictEqual(c.sourceType, 'OFFICIAL_CMA_DIRECT');
  assert.strictEqual(c.value, 0.8);
  assert.strictEqual(c.dataset.datasetId, 'SYN-A');
  const same = rt.resolveCmaCorrelation('US_EQUITY', 'US_EQUITY', set);
  assert.deepStrictEqual([same.value, same.sourceType], [1, 'OFFICIAL_CMA_DIRECT']);
});

test('R-3. 기준 자산군과의 상관(0.8)을 다른 쌍(국내 ↔ 미국)으로 옮기지 않는다 - Benchmark 값을 원문 그대로 쓰고 출처를 남긴다', () => {
  const set = fx.synRuntimeSet();
  const c = rt.resolveCmaCorrelation('KR_EQUITY', 'US_EQUITY', set);
  assert.strictEqual(c.sourceType, 'BENCHMARK_REFERENCE');
  assert.strictEqual(c.value, 0.4); // 합성 Benchmark 원문 값 - 0.8 · 0.97 · 두 기관 평균 어느 것도 아니다
  assert.deepStrictEqual([c.dataset.datasetId, c.dataset.provider, c.dataset.asOfDate, c.dataset.currency], ['SYN-B', 'Synthetic Provider B', '2030-09-30', 'KRW']);
  assert.deepStrictEqual([c.classA, c.classB], ['KRX', 'USX']);
  // 순서를 바꿔도 같은 값
  assert.strictEqual(rt.resolveCmaCorrelation('US_EQUITY', 'KR_EQUITY', set).value, 0.4);
});

test('R-4. 공식 Mapping이 등록돼 있으면 Benchmark보다 먼저 쓴다(OFFICIAL_CMA_MAPPING)', () => {
  const set = fx.synRuntimeSet({ officialMappings: [{ pair: ['US_EQUITY', 'KR_EQUITY'], datasetId: 'SYN-A', value: 0.55, classes: ['KR Eq', 'US Eq'], evidence: 'synthetic mapping' }] });
  const c = rt.resolveCmaCorrelation('KR_EQUITY', 'US_EQUITY', set);
  assert.deepStrictEqual([c.sourceType, c.value, c.dataset.datasetId], ['OFFICIAL_CMA_MAPPING', 0.55, 'SYN-A']);
  // 세트에 없는 Dataset을 가리키는 Mapping은 쓰지 않는다
  const orphan = fx.synRuntimeSet({ officialMappings: [{ pair: ['US_EQUITY', 'KR_EQUITY'], datasetId: 'NOPE', value: 0.55 }] });
  assert.strictEqual(rt.resolveCmaCorrelation('KR_EQUITY', 'US_EQUITY', orphan).sourceType, 'BENCHMARK_REFERENCE');
});

test('R-5. Direct · Mapping · Benchmark 모두 없으면 값을 만들지 않고 오류(조용한 대체 · 기관 혼합 없음)', () => {
  const set = fx.synRuntimeSet();
  // EM은 Benchmark에 없다 - PRIMARY의 기준 상관(0.85 · 0.8)으로 계산하거나 0으로 채우지 않는다.
  assert.deepStrictEqual(rt.resolveCmaCorrelation('KR_EQUITY', 'EM_EQUITY', set), { error: 'CORRELATION_SOURCE_MISSING' });
  // Benchmark 기관에 한쪽 자산군만 있는 경우도 다른 기관 값과 섞지 않는다.
  const out = rt.buildCmaRiskInputs([
    { key: 'a', label: 'A', riskFree: false, appClass: 'KR_EQUITY' },
    { key: 'b', label: 'B', riskFree: false, appClass: 'EM_EQUITY' }
  ], set);
  assert.strictEqual(out.errors.length, 1);
  assert.strictEqual(out.errors[0].code, 'CORRELATION_SOURCE_MISSING');
  assert.strictEqual(out.pairs.length, 0);
});

test('R-6. buildCmaRiskInputs - 변동성 · 대칭 상관행렬 · 무위험 항목(σ=0, 상관 0) · 쌍별 출처 · 요약 개수', () => {
  const set = fx.synRuntimeSet();
  const entries = [
    { key: 'kr1', label: '국내1', riskFree: false, appClass: 'KR_EQUITY' },
    { key: 'cash', label: '현금', riskFree: true, appClass: 'CASH' },
    { key: 'us', label: '미국', riskFree: false, appClass: 'US_EQUITY' },
    { key: 'kr2', label: '국내2', riskFree: false, appClass: 'KR_EQUITY' },
    { key: 'w', label: '세계', riskFree: false, appClass: 'WORLD' }
  ];
  const out = rt.buildCmaRiskInputs(entries, set);
  assert.deepStrictEqual(out.errors, []);
  assert.deepStrictEqual(out.sigmaByKey, { kr1: 0.25, cash: 0, us: 0.16, kr2: 0.25, w: 0.17 });
  const m = out.matrix;
  assert.deepStrictEqual(m.map((r) => r.length), [5, 5, 5, 5, 5]);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) assert.strictEqual(m[i][j], m[j][i]);
  assert.deepStrictEqual(m[1], [0, 1, 0, 0, 0]);
  assert.strictEqual(m[0][3], 1); // 같은 자산군
  assert.strictEqual(m[0][2], 0.4); // Benchmark
  assert.strictEqual(m[0][4], 0.8); // Direct
  assert.strictEqual(m[2][4], 0.97); // Direct
  assert.ok(out.pairs.every((p) => p.keyA !== 'cash' && p.keyB !== 'cash'));
  const s = rt.summarizeCmaCorrelationPairs(out.pairs);
  assert.strictEqual(s.benchmarkUsed, true);
  assert.deepStrictEqual(s.counts, { OFFICIAL_CMA_DIRECT: 3, OFFICIAL_CMA_MAPPING: 0, BENCHMARK_REFERENCE: 1 });
  // 이 행렬은 엔진의 PSD · Cholesky를 그대로 통과한다(ρ=1 쌍은 기존 경계 안정화 경로).
  assert.ok(engine.prepareCholeskyFromCorrelation(m).choleskySucceeded);
});

/* ── O. 실제 ACTIVE 세트 (원문 값) ─────────────────────────────────────────── */

test('O-1. ACTIVE 세트 CMA-2026.1 = AllianzGI 2026 Q1(PRIMARY) + J.P. Morgan 2026 LTCMA KRW(BENCHMARK), active.json · Dataset 상태와 일치', () => {
  const active = readJson(path.join(DATA, 'active.json'));
  assert.strictEqual(CMA_ACTIVE_SET.setVersion, active.setVersion);
  assert.strictEqual(CMA_ACTIVE_SET.setVersion, 'CMA-2026.1');
  assert.strictEqual(CMA_ACTIVE_SET.primary.datasetId, 'AGI-LTCMA-2026Q1-USD');
  assert.deepStrictEqual(CMA_ACTIVE_SET.benchmarks.map((b) => b.datasetId), ['JPM-LTCMA-2026-KRW']);
  const statuses = Object.fromEntries(fs.readdirSync(path.join(DATA, 'datasets')).map((f) => { const d = readJson(path.join(DATA, 'datasets', f)); return [d.datasetId, d.status]; }));
  assert.strictEqual(statuses['AGI-LTCMA-2026Q1-USD'], 'ACTIVE');
  assert.strictEqual(statuses['JPM-LTCMA-2026-KRW'], 'ACTIVE');
  assert.strictEqual(statuses['AGI-LTCMA-2026Q2-USD'], 'VERIFIED'); // 자동 발견 · PM 검토 대기 - 계산에 쓰이지 않는다
  assert.ok(Object.values(statuses).every((s) => ['VERIFIED', 'ACTIVE', 'APPROVED', 'SUPERSEDED', 'DISCOVERED', 'FAILED'].includes(s)));
});

test('O-2. AllianzGI 2026 Q1 원문 값 - Korea 6.8% · 27.9% · Developed World 상관 0.84, 기준일 2025-12-31 · USD · 10년 · 수익률 정의 미표기', () => {
  const p = CMA_ACTIVE_SET.primary;
  assert.deepStrictEqual([p.provider, p.asOfDate, p.currency, p.horizonYears, p.publishedAt, p.numberKind], ['Allianz Global Investors', '2025-12-31', 'USD', 10, '2026-02', 'OFFICIAL_DATA']);
  assert.deepStrictEqual(p.classes['Korea Equities'], { expectedReturn: 6.8, volatility: 27.9 });
  assert.deepStrictEqual(p.classes['North America Equities'], { expectedReturn: 6.1, volatility: 16.5 });
  assert.deepStrictEqual(p.classes['Emerging Markets Equities'], { expectedReturn: 6.7, volatility: 24.1 });
  assert.strictEqual(p.correlation.kind, 'VERSUS_REFERENCE');
  assert.strictEqual(p.correlation.referenceClass, 'Developed World Equities');
  assert.strictEqual(p.correlation.values['Korea Equities'], 0.84);
  assert.strictEqual(p.returnDefinition, 'NOT_STATED_IN_SOURCE');
  assert.strictEqual(p.returnUsableForMc, false);
  assert.strictEqual(p.fileSha256, '689512607c87830b3f1fd2b0e21ba1f4da45bb8a571ef93e8cc5adc6b0a96da0');
  assert.match(p.sourceUrl, /^https:\/\/ap\.allianzgi\.com\/.+2026q1.+\.pdf$/);
});

test('O-3. 런타임 파일의 모든 값은 저장된 Dataset 원문 값과 같다(변형 없음) · 근거 필드가 있다', () => {
  [CMA_ACTIVE_SET.primary].concat(CMA_ACTIVE_SET.benchmarks).forEach((r) => {
    const ds = readJson(path.join(DATA, 'datasets', `${r.datasetId}.json`));
    assert.strictEqual(r.fileSha256, ds.fileSha256);
    assert.strictEqual(r.asOfDate, ds.asOfDate);
    Object.entries(r.classes).forEach(([c, v]) => {
      assert.strictEqual(v.expectedReturn, ds.expectedReturn[c], `${r.datasetId} ${c}`);
      assert.strictEqual(v.volatility, ds.volatility[c], `${r.datasetId} ${c}`);
    });
    if (r.correlation.kind === 'FULL') {
      r.correlation.classes.forEach((a, i) => r.correlation.classes.forEach((b, j) => {
        const oi = ds.correlationMatrix.classes.indexOf(a), oj = ds.correlationMatrix.classes.indexOf(b);
        assert.strictEqual(r.correlation.matrix[i][j], ds.correlationMatrix.matrix[oi][oj]);
      }));
    } else {
      Object.entries(r.correlation.values).forEach(([c, v]) => assert.strictEqual(v, ds.correlationMatrix.values[c]));
    }
    ['asOfDate', 'horizonYears', 'currency', 'expectedReturn', 'volatility', 'correlationMatrix'].forEach((k) => assert.ok(ds.evidence[k], `${r.datasetId} 근거 없음: ${k}`));
    assert.ok(ds.approval && ds.approval.approvedBy && ds.approval.note, `${r.datasetId} 승인 기록 없음`);
    assert.deepStrictEqual(core.validateDataset(ds).issues, [], `${r.datasetId} 재검증 실패`);
  });
});

test('O-4. 실제 Dataset에는 SYNTHETIC_TEST_DATA가 없고, Benchmark는 BENCHMARK_REFERENCE로 표시된다', () => {
  fs.readdirSync(path.join(DATA, 'datasets')).forEach((f) => {
    const d = readJson(path.join(DATA, 'datasets', f));
    assert.notStrictEqual(d.numberKind, 'SYNTHETIC_TEST_DATA', f);
    assert.strictEqual(d.numberKind, d.role === 'BENCHMARK' ? 'BENCHMARK_REFERENCE' : 'OFFICIAL_DATA', f);
  });
});

test('O-5. 실제 세트의 상관 출처 - 국내↔미국 · 국내↔신흥국 · 미국↔신흥국은 J.P. Morgan KRW 행렬 원문 값(BENCHMARK_REFERENCE), 0.84를 옮겨 쓰지 않는다', () => {
  const jpm = readJson(path.join(DATA, 'datasets', 'JPM-LTCMA-2026-KRW.json'));
  const raw = (a, b) => jpm.correlationMatrix.matrix[jpm.correlationMatrix.classes.indexOf(a)][jpm.correlationMatrix.classes.indexOf(b)];
  const cases = [
    ['KR_EQUITY', 'US_EQUITY', 'Korean Equity', 'U.S. Large Cap'],
    ['KR_EQUITY', 'EM_EQUITY', 'Korean Equity', 'Emerging Markets Equity'],
    ['US_EQUITY', 'EM_EQUITY', 'U.S. Large Cap', 'Emerging Markets Equity']
  ];
  cases.forEach(([a, b, ca, cb]) => {
    const c = rt.resolveCmaCorrelation(a, b, CMA_ACTIVE_SET);
    assert.strictEqual(c.sourceType, 'BENCHMARK_REFERENCE', `${a}-${b}`);
    assert.strictEqual(c.value, raw(ca, cb), `${a}-${b}`);
    assert.strictEqual(c.dataset.provider, 'J.P. Morgan Asset Management');
    assert.strictEqual(c.dataset.asOfDate, '2025-09-30');
  });
  assert.notStrictEqual(rt.resolveCmaCorrelation('KR_EQUITY', 'US_EQUITY', CMA_ACTIVE_SET).value, 0.84);
  assert.strictEqual(rt.resolveCmaRiskForAppClass('DEV_EX_US_EQUITY', CMA_ACTIVE_SET).status, 'UNMAPPED');
});

/* ── M. MC 어댑터 연결 (실제 ACTIVE 세트) ──────────────────────────────────── */

function sandbox() {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {}; S.projection.customFeeRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.contributionGrowthRate = 0; S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = { yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 }, allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] } };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 50, '해외': 50 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });
  // 가격 이력은 한 건도 주입하지 않는다 - 장기 MC는 가격 이력 없이 계산돼야 한다.
  sb.getCachedDailyCloses = async () => { throw new Error('장기 MC가 가격 이력을 조회했다'); };
  sb.asset = (o) => sb.makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e8, currentPrice: 1e8, currency: 'KRW' }, o));
  return sb;
}
async function build(sb, preset = 'normal') {
  return sb.buildMonteCarloInputFromState({ presetKey: preset, ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
}

test('M-1. 국내 지수 ETF + 미국 지수 ETF - σ는 CMA 자산군(27.9% · 16.5%), 상관은 Benchmark 원문 값, μ는 기존 Return Key(7.0% · 5.1%)', async () => {
  const sb = sandbox();
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200' }), sb.asset({ ticker: 'QQQM', name: 'QQQM', currency: 'USD', isDomestic: '해외', currentPrice: 200, buyPrice: 200 })];
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }], '해외': [{ type: 'ticker', ticker: 'QQQM', label: 'QQQM', pct: 100 }] };
  const r = await build(sb);
  assert.deepStrictEqual(Array.from(r.errors), []);
  const kr = r.instruments[r.assetOrder.indexOf('T:069500.KS')], us = r.instruments[r.assetOrder.indexOf('T:QQQM')];
  assert.strictEqual(kr.sigmaAnnual, 27.9 / 100); // 원문 % 값을 100으로 나눈 값 그대로
  assert.strictEqual(us.sigmaAnnual, 16.5 / 100);
  assert.strictEqual(kr.muAnnual, 0.07);
  assert.strictEqual(us.muAnnual, 0.051);
  const rho = r.correlationMatrix[r.assetOrder.indexOf('T:069500.KS')][r.assetOrder.indexOf('T:QQQM')];
  assert.strictEqual(rho, rt.resolveCmaCorrelation('KR_EQUITY', 'US_EQUITY', CMA_ACTIVE_SET).value);
  assert.strictEqual(r.cma.setVersion, 'CMA-2026.1');
  assert.strictEqual(r.cma.inputModelVersion, 'CMA-ASSET-CLASS-1');
  assert.strictEqual(r.cma.pairs.length, 1);
  assert.strictEqual(r.cma.pairs[0].sourceType, 'BENCHMARK_REFERENCE');
  assert.ok(r.cma.instruments.every((i) => i.returnSource === 'RETURN_KEY'));
  assert.deepStrictEqual(Array.from(r.cma.instruments, (i) => i.cmaClass).sort(), ['Korea Equities', 'North America Equities']);
});

test('M-2. 채권 · 가정 없는 자산은 σ=0(기존 정책 · 경고), 수익률 가정은 있지만 CMA 자산군이 없는 위험자산(미국 외 선진국)은 오류', async () => {
  const sb = sandbox();
  sb.state.assets = [
    sb.asset({ name: '국고채A', category: '채권' }),
    sb.asset({ ticker: 'ZZUNK', name: 'Unknown Thing', isDomestic: '해외', category: 'ETF' })
  ];
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'namedHolding', name: '국고채A', pct: 100 }], '해외': [{ type: 'ticker', ticker: 'ZZUNK', label: 'Unknown Thing', pct: 100 }] };
  const ok = await build(sb);
  assert.deepStrictEqual(Array.from(ok.errors), []);
  assert.deepStrictEqual(Array.from(ok.instruments, (i) => i.sigmaAnnual), [0, 0]);
  assert.ok(ok.safety.issues.some((i) => i.code === 'SAFETY_RETURN_ASSUMPTION_MISSING'));
  assert.strictEqual(ok.cma.pairs.length, 0);
  sb.state.assets.push(sb.asset({ ticker: 'ZZDEV', name: 'ZZ 선진국 주식 ETF', isDomestic: '해외', category: 'ETF' }));
  sb.state.rebalance['신랑'].targets['해외'] = [{ type: 'ticker', ticker: 'ZZDEV', label: 'ZZ 선진국 주식 ETF', pct: 100 }];
  const bad = await build(sb);
  assert.ok(Array.from(bad.errors).some((e) => e.includes('ZZ 선진국 주식 ETF') && e.includes('장기 CMA 자산군')), Array.from(bad.errors).join(' / '));
  assert.strictEqual(bad.instruments, null);
});

test('M-3. 사용자 키 개별주는 사용자 수익률을 그대로 쓰고, 변동성은 상장 시장 자산군(확정 주식 + 지역)에서 온다', async () => {
  const sb = sandbox();
  sb.state.projection.customScenarioRates = { MYSTOCK: { conservative: 9, normal: 12, optimistic: 15 } };
  sb.state.assets = [sb.asset({ ticker: '999990', name: '가나다전자', category: '주식', rateMatchOverride: 'MYSTOCK' })];
  sb.state.rebalance['신랑'].domestic = { '국내': 100, '해외': 0 };
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'ticker', ticker: '999990', label: '가나다전자', pct: 100 }], '해외': [] };
  const r = await build(sb);
  assert.deepStrictEqual(Array.from(r.errors), []);
  assert.strictEqual(r.instruments[0].muAnnual, 0.12);
  assert.strictEqual(r.instruments[0].sigmaAnnual, 27.9 / 100);
  assert.strictEqual(r.cma.instruments[0].appClassBasis, 'listedStock');
});

test('M-4. [§37-5 PM 확정] 수익률 정의가 확인된 세트여도 CMA 기대수익률은 MC에 쓰지 않는다 - 시스템 · 사용자 수익률 모두 Return Key 그대로', async () => {
  const sb = sandbox();
  const confirmed = JSON.parse(JSON.stringify(CMA_ACTIVE_SET));
  confirmed.primary.returnUsableForMc = true; // SYNTHETIC_TEST_DATA - 정의 확인 가정(실제 세트는 false)
  sb.getActiveCmaSet = (o) => (o !== undefined ? o : confirmed);
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200' }), sb.asset({ ticker: 'QQQM', name: 'QQQM', currency: 'USD', isDomestic: '해외', currentPrice: 200, buyPrice: 200 })];
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }], '해외': [{ type: 'ticker', ticker: 'QQQM', label: 'QQQM', pct: 100 }] };
  sb.state.projection.customScenarioRates = { NASDAQ: { normal: 9 } };
  const r = await build(sb);
  const kr = r.instruments[r.assetOrder.indexOf('T:069500.KS')], us = r.instruments[r.assetOrder.indexOf('T:QQQM')];
  assert.strictEqual(kr.muAnnual, 0.07); // KOSPI Return Key(일반적) - CMA 6.8%가 아니다
  assert.strictEqual(us.muAnnual, 0.09); // 사용자 값 보호(RET-02-05)
  assert.strictEqual(kr.sigmaAnnual, 27.9 / 100); // 변동성은 CMA
  assert.deepStrictEqual(Array.from(r.cma.instruments, (i) => i.returnSource), ['RETURN_KEY', 'RETURN_KEY']);
});

test('M-6. [§37-5] 장기 MC 수익률 정책 상수 - CMA 기대수익률 미사용 · CMA 변동성 · 상관 사용 · 수익률 출처 RETURN_KEY', () => {
  assert.deepStrictEqual({ ...rt.MC_CMA_RETURN_POLICY }, { useCmaExpectedReturn: false, useCmaVolatility: true, useCmaCorrelation: true, returnSource: 'RETURN_KEY' });
  assert.ok(Object.isFrozen(rt.MC_CMA_RETURN_POLICY));
  // 실제 ACTIVE 세트의 수익률 정의도 미표기 상태로 기록돼 있다(정책과 별개로 원문 사실).
  assert.strictEqual(CMA_ACTIVE_SET.primary.returnUsableForMc, false);
});

test('M-5. 같은 입력이면 어댑터 출력이 같고(결정적), 어댑터는 state를 바꾸지 않는다', async () => {
  const sb = sandbox();
  sb.state.assets = [sb.asset({ ticker: '069500', name: 'KODEX 200' })];
  sb.state.rebalance['신랑'].domestic = { '국내': 100, '해외': 0 };
  sb.state.rebalance['신랑'].targets = { '국내': [{ type: 'ticker', ticker: '069500', label: 'KODEX 200', pct: 100 }], '해외': [] };
  const before = JSON.stringify(sb.state);
  const a = await build(sb), b = await build(sb);
  assert.strictEqual(JSON.stringify(a.instruments), JSON.stringify(b.instruments));
  assert.strictEqual(JSON.stringify(a.correlationMatrix), JSON.stringify(b.correlationMatrix));
  assert.strictEqual(JSON.stringify(sb.state), before);
});
