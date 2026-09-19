/* [1차 통합 구현] Risk Benchmark · Index Master · 비동기(D-05) · 개별주(D-06) · 혼합 노출 · 공유표 동결 통합 검증.
 *
 * 체크리스트 §40 P-4 · §44 제8조 · 제10조 · 44-15 · 44-16. 이 파일이 고정하는 것:
 *   ① 기존 Risk 결과 보호 - 원장 49건(EM-2026.1)의 Benchmark 키가 v261과 같다
 *   ② Index Master 해석 · PR/TR 정의 불일치 상태 · 가격 원천 없음 → UNRESOLVED
 *   ③ 환헤지 미확인 → HOLD · 혼합 노출 → UNRESOLVED(MIXED_EXPOSURE)
 *   ④ 비동기 쌍: 같은 날짜 정렬 금지 · Dimson(시차 0 + 1) · H.10 원화 환산 · 최소 관측 120 · 포트폴리오 베타 null
 *   ⑤ D-06: 원장에 없는 미국 상장 주식은 거래소 지수로 보내지 않는다
 * 테스트 데이터는 전부 가상의 종목(ZZ…)과 결정적 시계열이다 - 실제 사용자 보유 정보를 담지 않는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const EM = require('../js/28-exposure-master.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = require('./risk-sandbox.js');

const readJs = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

// 결정적 의사난수(LCG) - 같은 seed면 항상 같은 수열.
function lcg(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296 - 0.5; };
}
// 달력 날짜(연속) - 요일 판정용.
function calendar(n, start = '2025-01-01') {
  const out = [];
  const d = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push({ iso: d.toISOString().slice(0, 10), dow: d.getUTCDay() }); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// 가상의 원장 - 실제 원장(EXPOSURE_MASTER) 대신 끼워 넣는다(js/09 · js/05가 같은 조회 함수를 쓴다).
const SYN = {
  unhedged: { ticker: 'ZZ0001.KS', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', fxExposure: 'EXPOSED', hedgeStatus: 'UNHEDGED', conversionMethod: 'FX_MULTIPLY', evidence: 'SYNTHETIC_TEST_DATA 비헤지 국내 상장 해외 ETF', evidenceGrade: 'A', version: 'TEST' },
  hedgeUnknown: { ticker: 'ZZ0002.KS', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', evidence: 'SYNTHETIC_TEST_DATA 환헤지 미확인', evidenceGrade: 'A', version: 'TEST' },
  hedged: { ticker: 'ZZ0003.KS', assetType: 'KR_LISTED_FOREIGN_ETF', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'SP500', priceCcy: 'KRW', underlyingCcy: 'USD', fxExposure: 'NONE', hedgeStatus: 'HEDGED', conversionMethod: 'HEDGE_COST', evidence: 'SYNTHETIC_TEST_DATA 환헤지형', evidenceGrade: 'A', version: 'TEST' },
  mixed: { ticker: 'ZZ0004.KS', assetType: 'KR_LISTED_DOMESTIC_ETF', exposureStructure: 'MIXED', marketExposure: 'KR', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA 주식 30 + 채권 70', evidenceGrade: 'A', version: 'TEST' },
  trNoSource: { ticker: 'ZZ0005.KS', assetType: 'KR_LISTED_DOMESTIC_ETF', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSPI200_TR', underlyingReturnType: 'TR', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA TR 지수 추종', evidenceGrade: 'A', version: 'TEST' },
  trOnPr: { ticker: 'ZZ0006.KS', assetType: 'KR_LISTED_DOMESTIC_ETF', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSPI', underlyingReturnType: 'TR', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA TR 상품에 PR 지수를 적은 경우', evidenceGrade: 'A', version: 'TEST' },
  usStock: { ticker: 'ZZUS', assetType: 'FOREIGN_STOCK', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'NASDAQ', equityListing: 'HOME_COMMON', priceCcy: 'USD', underlyingCcy: 'USD', fxExposure: 'EXPOSED', conversionMethod: 'FX_MULTIPLY', evidence: 'SYNTHETIC_TEST_DATA 미국 본국 보통주', evidenceGrade: 'A', version: 'TEST' },
  usListingOnly: { ticker: 'ZZUL', assetType: 'FOREIGN_STOCK', assetClass: 'US_EQUITY', marketExposure: 'US', benchmark: 'NASDAQ', priceCcy: 'USD', underlyingCcy: 'USD', fxExposure: 'EXPOSED', conversionMethod: 'FX_MULTIPLY', evidence: 'SYNTHETIC_TEST_DATA 거래소 상장 근거만', version: 'TEST' },
  usAdr: { ticker: 'ZZADR', assetType: 'FOREIGN_STOCK', assetClass: 'EM_EQUITY', marketExposure: 'EM', benchmark: 'NASDAQ', equityListing: 'ADR', priceCcy: 'USD', underlyingCcy: 'USD', fxExposure: 'EXPOSED', conversionMethod: 'FX_MULTIPLY', evidence: 'SYNTHETIC_TEST_DATA 미국 상장 ADR', evidenceGrade: 'A', version: 'TEST' },
  krStock: { ticker: 'ZZKR.KS', assetType: 'KR_STOCK', assetClass: 'KR_EQUITY', marketExposure: 'KR', benchmark: 'KOSPI', priceCcy: 'KRW', evidence: 'SYNTHETIC_TEST_DATA 국내 보통주', evidenceGrade: 'A', version: 'TEST' }
};
function withSyntheticLedger(s) {
  const master = s.buildExposureMaster(Object.values(SYN));
  assert.deepStrictEqual(plain(master.invalid), [], '가상 원장이 규칙을 통과해야 한다');
  const original = s.lookupExposureRecord;
  s.lookupExposureRecord = (a) => original(a, master);
  return s;
}

/* 비동기 시장 시계열 - 미국 지수(평일 · 일부 미국 휴장) · H.10 · 국내 상장 ETF(평일 · 일부 국내 휴장).
 * ETF 원화 종가(d) = 원화 환산 지수(m(d)) × (1 + 동시 구간 반응) - m(d)는 d보다 먼저 마감한 마지막 미국 날짜. */
function asyncMarket({ days = 300, fxVol = 0.004, concurrentWeight = 0, seed = 7 } = {}) {
  const rnd = lcg(seed);
  const cal = calendar(days);
  const usHolidays = new Set([cal[40].iso, cal[95].iso, cal[180].iso]);
  const krHolidays = new Set([cal[60].iso, cal[61].iso, cal[150].iso]);
  const us = []; const fx = new Map();
  let lvl = 5000; let rate = 1300;
  cal.forEach((c) => {
    if (c.dow === 0 || c.dow === 6 || usHolidays.has(c.iso)) return;
    lvl *= 1 + rnd() * 0.03;
    rate *= 1 + rnd() * fxVol * 2;
    us.push({ date: c.iso, close: lvl });
    fx.set(c.iso, rate);
  });
  const kr = [];
  let j = -1;
  cal.forEach((c) => {
    if (c.dow === 0 || c.dow === 6 || krHolidays.has(c.iso)) return;
    while (j + 1 < us.length && us[j + 1].date < c.iso) j++;
    if (j < 0) return;
    const krwLevel = us[j].close * fx.get(us[j].date);
    // 동시 구간(다음 미국 세션)의 일부를 선반영하는 상품을 흉내 낸다(선물 등) - 기본 0.
    const next = us[j + 1];
    const lead = next ? (next.close * fx.get(next.date)) / krwLevel - 1 : 0;
    kr.push({ date: c.iso, close: krwLevel / 10 * (1 + concurrentWeight * lead) });
  });
  return { us, kr, fx };
}
function toSeries(dated) {
  return { closes: dated.map((d) => d.close), closesAdj: dated.map((d) => d.close), volumes: dated.map(() => 1000), dates: dated.map((d) => d.date) };
}
function krEtfAsset(ticker, name) {
  return makeTestAsset({ name, ticker, category: 'ETF', quantity: 100, buyPrice: 10000, currentPrice: 10000 });
}

/* ── ① 기존 Risk 결과 보호 ─────────────────────────────────────────────── */

test('① 원장 49건(v261)의 Risk Benchmark 키가 그대로다', () => {
  // v261(HEAD 22b8219)에서 같은 입력으로 뽑은 값이다(종목 마스터의 실제 상장 거래소 사용).
  const V261 = {
    '005930.KS': 'KOSPI', '000660.KS': 'KOSPI', '035420.KS': 'KOSPI', '035720.KS': 'KOSPI', '051910.KS': 'KOSPI', '006400.KS': 'KOSPI',
    '373220.KS': 'KOSPI', '005380.KS': 'KOSPI', '000270.KS': 'KOSPI', '105560.KS': 'KOSPI', '055550.KS': 'KOSPI', '086790.KS': 'KOSPI',
    '207940.KS': 'KOSPI', '068270.KS': 'KOSPI', '028260.KS': 'KOSPI', '015760.KS': 'KOSPI',
    AAPL: 'NASDAQ', MSFT: 'NASDAQ', GOOGL: 'NASDAQ', GOOG: 'NASDAQ', AMZN: 'NASDAQ', NVDA: 'NASDAQ', AVGO: 'NASDAQ', AMD: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ', NFLX: 'NASDAQ',
    JPM: null, V: null, MA: null, JNJ: null, UNH: null, XOM: null, CVX: null, PG: null, KO: null,
    QQQM: 'NASDAQ100', QQQ: 'NASDAQ100', SPY: 'SP500', SPYM: 'SP500', VOO: 'SP500',
    SOXX: null, SMH: null, TQQQ: null, SCHD: null, TLT: null, IEF: null, '069500.KS': null, '102110.KS': null
  };
  assert.strictEqual(Object.keys(V261).length, 49);
  const s = loadRiskSandbox();
  const master = require('../data/ticker-master.json');
  const tm = {};
  master.items.forEach((r) => { if (V261[r.yahooTicker] !== undefined) tm[r.yahooTicker] = { exchange: r.exchange, nameKr: r.nameKr, nameEn: r.nameEn }; });
  s.setTickerMaster(tm);
  // [2차 통합 보완 · PM 결정 ③] 원장의 해외 개별주 중 본국 보통주 근거(equityListing HOME_COMMON · A등급)가 없는 항목은
  // 거래소 상장 근거만으로 Benchmark를 주지 않는다 - v261에서 NASDAQ이던 11종목이 UNRESOLVED로 바뀐다(EXPECTED CHANGE).
  // 그 외(국내 개별주 · ETF · 이미 null이던 항목) 38건은 v261과 같아야 한다.
  let changed = 0;
  Object.entries(V261).forEach(([t, v261Key]) => {
    const e = EM.EXPOSURE_MASTER_ENTRIES.find((x) => x.ticker === t);
    const category = e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK' ? '주식' : 'ETF';
    const rec = tm[t] || {};
    const bm = s.resolveRiskBenchmark({ ticker: t, category, name: rec.nameKr || rec.nameEn || t });
    const needsHomeEvidence = e.assetType === 'FOREIGN_STOCK' && e.equityListing !== 'HOME_COMMON';
    const key = needsHomeEvidence ? null : v261Key;
    if (key !== v261Key) changed++;
    // 베타 계산에 쓸 수 있는 Benchmark(= 원천 있음)만 비교한다. 원천 없는 공식 지수(SCHD)는 "확인됨 · 원천 없음"으로 따로 본다.
    const usable = bm.priceSource === 'UNAVAILABLE' ? null : bm.key;
    assert.strictEqual(usable, key, `${t}`);
    if (t === 'SCHD') assert.deepStrictEqual([bm.key, bm.status, bm.priceSource], ['DJ_US_DIV100_PR', 'RESOLVED', 'UNAVAILABLE']);
    // 기존 49건은 전부 같은 시장 지수다 - 비동기 정렬 · 환산이 붙지 않는다(계산 경로 무변경).
    assert.strictEqual(bm.alignment, undefined, `${t}`);
  });
  assert.strictEqual(changed, 11, 'PM 결정 ③으로 바뀌는 것은 거래소 근거만 있던 NASDAQ 상장 개별주 11종목뿐이다');
});

/* ── ② Index Master ─────────────────────────────────────────────────────── */

test('② Index Master: 최소 필드 · 기존 6개 지수 원천 = INDEX_TICKERS · 원천 없는 지수는 계산 불가', () => {
  const s = loadRiskSandbox();
  const FIELDS = ['key', 'officialName', 'provider', 'sourceId', 'returnType', 'priceDefinition', 'currency', 'market', 'source', 'evidenceGrade', 'availability', 'unavailableReason'];
  EM.INDEX_MASTER_ENTRIES.forEach((e) => {
    assert.deepStrictEqual(Object.keys(e).sort(), FIELDS.slice().sort(), e.key);
    assert.strictEqual(e.priceDefinition, 'INDEX_LEVEL', 'D-01 ① 지수는 수준값을 통계 가격으로 쓴다');
    assert.ok(['PR', 'TR'].includes(e.returnType), `${e.key} 수익 정의`);
    assert.strictEqual(e.evidenceGrade, 'A');
    if (e.availability === 'AVAILABLE') {
      assert.strictEqual(e.source, 'YAHOO');
      assert.ok(e.sourceId && e.currency && e.market, e.key);
      assert.strictEqual(e.unavailableReason, null);
    } else {
      assert.strictEqual(e.availability, 'UNAVAILABLE');
      assert.ok(e.unavailableReason, `${e.key} 사유`);
      assert.strictEqual(EM.isIndexPriceSourceAvailable(e.key), false);
      assert.strictEqual(EM.indexPriceSourceTicker(e.key), null);
    }
  });
  const indexTickers = plain(s.INDEX_TICKERS);
  Object.entries(indexTickers).forEach(([k, sym]) => {
    assert.strictEqual(EM.indexPriceSourceTicker(k), sym, `${k}: Risk 원천 기호가 앱 지수 기호와 같아야 한다`);
  });
  // 공식 기초지수는 확인됐지만 원천이 없는 지수들(D-01 ④ · SCHD/458730 · 0052D0 · 487230).
  ['KOSPI200_TR', 'DJ_KOREA_DIV30_PR', 'ISELECT_US_AI_POWER_PR', 'DJ_US_DIV100_PR'].forEach((k) => {
    assert.ok(EM.resolveIndexMasterEntry(k), k);
    assert.strictEqual(EM.isIndexPriceSourceAvailable(k), false, `${k}는 계산 가능으로 처리하지 않는다`);
  });
  assert.strictEqual(EM.resolveIndexMasterEntry('KOSPI200_TR').returnType, 'TR');
  assert.strictEqual(EM.resolveIndexMasterEntry('UNKNOWN_INDEX'), null);
  // 원장의 Benchmark 키는 전부 Index Master에 있다.
  EM.EXPOSURE_MASTER_ENTRIES.forEach((e) => { if (e.benchmark) assert.ok(EM.resolveIndexMasterEntry(e.benchmark), `${e.ticker}`); });
});

test('② KIS 지수 API를 새로 연결하지 않는다(D-01 ⑤ · 약관 확인 전)', () => {
  EM.INDEX_MASTER_ENTRIES.forEach((e) => assert.ok(e.source === 'YAHOO' || e.source === null, e.key));
  ['09-price-fx-risk-engine.js', '28-exposure-master.js'].forEach((f) => {
    const src = readJs(f);
    ['inquire-daily-indexchartprice', 'FHKUP03500100', 'FHPUP02120000', 'inquire-index-daily-price'].forEach((w) => assert.ok(!src.includes(w), `${f}: ${w}`));
  });
});

test('② PR/TR 정의: 일치 · 불일치 · 미확인을 구분하고, PR을 TR로 표시하지 않는다', () => {
  const idx = (k) => EM.resolveIndexMasterEntry(k);
  assert.strictEqual(EM.resolveBenchmarkDefinitionStatus({ underlyingReturnType: 'TR' }, idx('KOSPI200_TR')), 'MATCH');
  assert.strictEqual(EM.resolveBenchmarkDefinitionStatus({ underlyingReturnType: 'TR' }, idx('KOSPI')), 'DEFINITION_MISMATCH');
  assert.strictEqual(EM.resolveBenchmarkDefinitionStatus({}, idx('SP500')), 'UNCONFIRMED');
  // 실제 원장: 정의가 적힌 항목은 전부 같은 정의의 지수를 가리킨다(불일치를 조용히 쓰지 않는다).
  EM.EXPOSURE_MASTER_ENTRIES.forEach((e) => {
    if (!e.underlyingReturnType || !e.benchmark) return;
    assert.strictEqual(EM.resolveBenchmarkDefinitionStatus(e, idx(e.benchmark)), 'MATCH', e.ticker);
  });
  // TR 상품의 TR 지수는 확인됐지만 원천이 없다 - Benchmark는 TR 그대로(RESOLVED) · 원천 UNAVAILABLE. PR 지수로 대신하지 않는다.
  const s = withSyntheticLedger(loadRiskSandbox());
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZ0005.KS', category: 'ETF', name: 'ZZ TR' })),
    { key: 'KOSPI200_TR', status: 'RESOLVED', source: 'exposureMaster', priceSource: 'UNAVAILABLE', indexUnavailableReason: 'NO_PERMITTED_SOURCE' });
  // 원장이 명시적으로 다른 정의의 지수를 적은 경우 - 쓰되 DEFINITION_MISMATCH를 결과와 종목에 남긴다.
  const mm = plain(s.resolveRiskBenchmark({ ticker: 'ZZ0006.KS', category: 'ETF', name: 'ZZ TR on PR' }));
  assert.deepStrictEqual(mm, { key: 'KOSPI', status: 'RESOLVED', source: 'exposureMaster', definitionStatus: 'DEFINITION_MISMATCH' });
});

test('② 세 상태 분리: Benchmark RESOLVED · 지수 가격 원천 UNAVAILABLE · 베타 null(SOURCE_UNAVAILABLE)', async () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  s.state.assets = [krEtfAsset('ZZ0005.KS', 'ZZ TR 추종')];
  s.setDailyCloses('ZZ0005.KS', withDates({ closes: zigzagCloses(260, 10000, 1.1, 1.0), volumes: volumes(260, 1000, 1) }));
  const fetched = [];
  const orig = s.getCachedDailyClosesWithStatus;
  s.getCachedDailyClosesWithStatus = async (t) => { fetched.push(t); return orig(t); };
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  assert.strictEqual(h.benchmarkStatus, 'RESOLVED', '기준 지수는 확인됐다');
  assert.strictEqual(h.benchmarkKey, 'KOSPI200_TR');
  assert.strictEqual(h.benchmarkPriceSource, 'UNAVAILABLE', '지수 가격 원천은 없다');
  assert.deepStrictEqual(fetched, ['ZZ0005.KS'], '원천 없는 지수는 조회하지 않는다(다른 지수로 대신하지 않는다)');
  assert.strictEqual(h.beta, null);
  assert.strictEqual(h.betaStatus, 'SOURCE_UNAVAILABLE');
  assert.strictEqual(m.portfolioBeta, null);
});

/* ── ③ 환헤지 미확인 · 혼합 노출 ─────────────────────────────────────────── */

test('③ 환헤지 미확인 → HOLD(UNRESOLVED), 환헤지형 → 헤지비용 자료 없음(UNRESOLVED) - 비헤지로 간주하지 않는다', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZ0002.KS', category: 'ETF', name: 'ZZ 헤지 미확인' })), { key: null, status: 'UNRESOLVED', source: 'hedgeUnconfirmed' });
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZ0003.KS', category: 'ETF', name: 'ZZ 헤지형' })), { key: null, status: 'UNRESOLVED', source: 'hedgeCostUnavailable', indexKey: 'SP500' });
  // 등록은 됐지만 확정되지 않은 항목은 기존 경로(ETF 라벨 · 상장 거래소)로 넘어가지 않는다 - 분류 '주식'이어도.
  s.setTickerMaster({ 'ZZ0002.KS': { exchange: 'KOSPI', nameKr: 'ZZ 이름에 ETF 표시 없음' } });
  assert.strictEqual(s.resolveRiskBenchmark({ ticker: 'ZZ0002.KS', category: '주식', name: 'ZZ 이름에 ETF 표시 없음' }).key, null);
  // 실제 원장: 국내 상장 해외 ETF 중 환헤지 사실이 없는 항목은 전부 HOLD다(티커를 적지 않고 성질로 검사).
  const real = loadRiskSandbox();
  EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.assetType === 'KR_LISTED_FOREIGN_ETF' && !e.exposureStructure && !e.hedgeStatus).forEach((e) => {
    assert.strictEqual(real.resolveRiskBenchmark({ ticker: e.ticker, category: 'ETF', name: '' }).source, 'hedgeUnconfirmed', e.ticker);
  });
});

test('③ 혼합 노출 → UNRESOLVED(MIXED_EXPOSURE) · 단일 자산군 · 단일 Benchmark 없음', async () => {
  const s = withSyntheticLedger(loadRiskSandbox({ extraFiles: ['04-rebalancing.js', '05-future-projection.js'] }));
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZ0004.KS', category: 'ETF', name: 'ZZ 배당 30 국채 70' })), { key: null, status: 'UNRESOLVED', source: 'mixedExposure' });
  // 이름에 '혼합'이 없어도 원장이 혼합이라고 하면 단일 성격으로 판정하지 않는다.
  const ch = plain(s.resolveAssetCharacter(s.makeAsset({ ticker: 'ZZ0004.KS', name: 'ZZ 배당 30 국채 70', category: 'ETF' })));
  assert.strictEqual(ch.character, 'UNRESOLVED');
  assert.strictEqual(ch.source, 'exposureMasterMixed');
  s.state.assets = [krEtfAsset('ZZ0004.KS', 'ZZ 배당 30 국채 70')];
  s.setDailyCloses('ZZ0004.KS', withDates({ closes: zigzagCloses(260, 10000, 0.4, 0.3), volumes: volumes(260, 1000, 1) }));
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].beta, null);
  assert.strictEqual(m.holdings[0].betaStatus, 'BENCHMARK_UNRESOLVED');
  // 실제 원장의 혼합 항목도 같은 결과다.
  const real = loadRiskSandbox();
  EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.exposureStructure === 'MIXED').forEach((e) => {
    assert.strictEqual(real.resolveRiskBenchmark({ ticker: e.ticker, category: 'ETF', name: '' }).source, 'mixedExposure', e.ticker);
    assert.deepStrictEqual(EM.resolveExposureCharacter({ ticker: e.ticker }), { assetClass: null, mixed: true });
  });
});

/* ── ④ 비동기 쌍(D-05) ──────────────────────────────────────────────────── */

test('④ 비동기 판정: 국내 상장 비헤지 해외 ETF ↔ 미국 지수는 Dimson 정렬 + H.10 원화 환산', () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZ0001.KS', category: 'ETF', name: 'ZZ 미국지수' })), {
    key: 'SP500', status: 'RESOLVED', source: 'exposureMaster', alignment: 'ASYNC_DIMSON', benchmarkFx: 'USD_TO_KRW_H10', assetMarket: 'KR', benchmarkMarket: 'US'
  });
  // 같은 시장(국내 주식 ↔ 코스피 · 미국 주식 ↔ 나스닥)은 기존 같은 날짜 정렬 그대로다(결과 모양도 같다).
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZKR.KS', category: '주식', name: 'ZZ 국내' })), { key: 'KOSPI', status: 'RESOLVED', source: 'exposureMaster' });
  assert.deepStrictEqual(plain(s.resolveRiskBenchmark({ ticker: 'ZZUS', category: '주식', name: 'ZZ US' })), { key: 'NASDAQ', status: 'RESOLVED', source: 'exposureMaster' });
});

test('④ 비동기 정렬 행 구성: 종목 종가보다 먼저 마감한 지수 구간 · 휴장 구간은 0으로 채우지 않고 뺀다', () => {
  const s = loadRiskSandbox();
  // 미국: 월(06) 화(07) 수(08 휴장) 목(09) 금(10) · 한국: 화(07) 수(08) 목(09) 금(10) 월(13)
  const us = [['2025-01-06', 100], ['2025-01-07', 101], ['2025-01-09', 103.02], ['2025-01-10', 102], ['2025-01-13', 104]].map(([date, close]) => ({ date, close }));
  const kr = [['2025-01-07', 10], ['2025-01-08', 10.1], ['2025-01-09', 10.2], ['2025-01-10', 10.3], ['2025-01-13', 10.2]].map(([date, close]) => ({ date, close }));
  const rows = plain(s.buildAsyncDimsonRows(kr, us, 'KR', 'US'));
  // m(07)=06 · m(08)=07 · m(09)=07(미국 08 휴장) · m(10)=09 · m(13)=10
  // 08행: 시차1 06→07, 시차0 07→09 · 09행: 미국 진행 없음 → 제외 · 10행: 시차1 07→09, 시차0 09→10 · 13행: 시차1 09→10, 시차0 10→13
  assert.deepStrictEqual(rows.map((r) => r.date), ['2025-01-08', '2025-01-10', '2025-01-13']);
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.ok(near(rows[0].previous, 101 / 100 - 1) && near(rows[0].concurrent, 103.02 / 101 - 1));
  assert.ok(near(rows[1].asset, 10.3 / 10.2 - 1), '종목 수익률은 바로 전 종목 거래일 대비다(제외된 날의 가격을 버리지 않는다)');
  assert.ok(near(rows[1].previous, 103.02 / 101 - 1) && near(rows[1].concurrent, 102 / 103.02 - 1));
  assert.ok(near(rows[2].previous, 102 / 103.02 - 1) && near(rows[2].concurrent, 104 / 102 - 1));
  // 같은 날짜 마감 순서: 한국이 먼저 끝난다 - 같은 날짜의 미국 종가는 m(d)에 들어가지 않는다.
  assert.strictEqual(s.riskCloseBefore('2025-01-07', 'US', '2025-01-07', 'KR'), false);
  assert.strictEqual(s.riskCloseBefore('2025-01-07', 'KR', '2025-01-07', 'US'), true);
});

test('④ Dimson 시차 0 + 1: 두 기울기의 합이 베타이고 구성요소를 따로 돌려준다', () => {
  const s = loadRiskSandbox();
  const rnd = lcg(11);
  const cal = calendar(260).filter((c) => c.dow !== 0 && c.dow !== 6);
  const bench = []; let lvl = 100;
  cal.forEach((c) => { lvl *= 1 + rnd() * 0.03; bench.push({ date: c.iso, close: lvl }); });
  // 종목 r_k = 0.6 × 시차0 + 0.35 × 시차1 (잡음 없음) - 정확히 복원돼야 한다.
  const r = (i0, i1) => bench[i1].close / bench[i0].close - 1;
  const asset = [{ date: cal[1].iso, close: 50 }];
  for (let k = 2; k < cal.length - 1; k++) {
    const prev = r(k - 2, k - 1); const conc = r(k - 1, k);
    asset.push({ date: cal[k].iso, close: asset[asset.length - 1].close * (1 + 0.6 * conc + 0.35 * prev) });
  }
  const d = plain(s.computeAsyncDimsonBeta(asset, bench, 'KR', 'US'));
  assert.ok(Math.abs(d.betaConcurrent - 0.6) < 1e-9, `${d.betaConcurrent}`);
  assert.ok(Math.abs(d.betaPrevious - 0.35) < 1e-9, `${d.betaPrevious}`);
  assert.ok(Math.abs(d.beta - 0.95) < 1e-9);
  assert.ok(d.observationCount > 120);
  // 설명변수가 없으면(관측 부족) 값을 만들지 않는다.
  assert.strictEqual(s.computeAsyncDimsonBeta(asset.slice(0, 2), bench, 'KR', 'US').beta, null);
});

test('④ 같은 날짜 정렬 금지: 비동기 쌍은 alignedReturnPair를 쓰지 않고, 같은 날짜 베타(≈0)와 달리 실제 민감도(≈1)를 낸다', async () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  const mk = asyncMarket({ fxVol: 0 });
  s.setDailyCloses('^GSPC', toSeries(mk.us));
  s.setDailyCloses('ZZ0001.KS', toSeries(mk.kr));
  s.setUsdKrwRates({ status: 'OK', rates: mk.fx, endDate: mk.us[mk.us.length - 1].date });
  s.state.assets = [krEtfAsset('ZZ0001.KS', 'ZZ 미국지수')];
  const calls = [];
  const original = s.alignedReturnPair;
  s.alignedReturnPair = (...args) => { calls.push(args); return original(...args); };
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  assert.strictEqual(calls.length, 0, '비동기 쌍에 같은 날짜 정렬이 쓰였다');
  assert.strictEqual(h.betaMethod, 'DIMSON_LAG0_LAG1');
  assert.ok(Math.abs(h.beta - 1) < 1e-9, `Dimson 베타 ${h.beta}`);
  // 참고: 같은 날짜끼리 짝지으면 실제로는 서로 다른 구간이 짝지어져 민감도가 사라진다(금지 사유).
  const krD = mk.kr; const usD = mk.us.map((d) => ({ date: d.date, close: d.close * mk.fx.get(d.date) }));
  const al = s.dateAlignedReturns(krD, usD);
  const sameDate = s.computeBetaFromReturns(al.returnsA, al.returnsB);
  assert.ok(Math.abs(sameDate) < 0.3, `같은 날짜 베타 ${sameDate}`);
});

test('④ H.10 원화 환산: 원화 지수 수익률 = 달러 수익률 + 환율 수익률 + 교차항, 환산 없는 베타와 다르다', async () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  const mk = asyncMarket({ fxVol: 0.006, seed: 21 });
  const krw = s.convertDatedClosesToKrw(mk.us, mk.fx);
  for (let i = 1; i < krw.length; i++) {
    const rUsd = mk.us[i].close / mk.us[i - 1].close - 1;
    const rFx = mk.fx.get(mk.us[i].date) / mk.fx.get(mk.us[i - 1].date) - 1;
    const rKrw = krw[i].close / krw[i - 1].close - 1;
    assert.ok(Math.abs(rKrw - (rUsd + rFx + rUsd * rFx)) < 1e-12, `${krw[i].date}`);
  }
  s.setDailyCloses('^GSPC', toSeries(mk.us));
  s.setDailyCloses('ZZ0001.KS', toSeries(mk.kr));
  s.setUsdKrwRates({ status: 'OK', rates: mk.fx, endDate: mk.us[mk.us.length - 1].date });
  s.state.assets = [krEtfAsset('ZZ0001.KS', 'ZZ 미국지수')];
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  assert.strictEqual(h.benchmarkFx, 'USD_TO_KRW_H10');
  assert.ok(Math.abs(h.beta - 1) < 1e-9, `원화 환산 Dimson 베타 ${h.beta}`);
  const noFx = s.computeAsyncDimsonBeta(mk.kr, mk.us, 'KR', 'US');
  // 환율을 빼고 달러 지수에 맞추면 정확히 1이 되지 않는다(환율 변동이 잡음으로 남는다) - 위의 정확한 1은 환산을 실제로 쓴 결과다.
  assert.ok(Math.abs(noFx.beta - 1) > 1e-6, String(noFx.beta));
  // 원화 가격 종목 자신에는 환율을 곱하지 않는다(§44 44-15 · 이중 반영 금지).
  assert.strictEqual(h.priceCcy, 'KRW');
  assert.strictEqual(h.fxStatus, null);
  // 스트레스(현지통화 지수 낙폭)와 원화 기준 베타를 섞지 않는다.
  assert.strictEqual(m.stressLossKRW, null);
});

test('④ H.10을 쓸 수 없으면 달러 지수로 대신하지 않고 베타를 만들지 않는다', async () => {
  const s = withSyntheticLedger(loadRiskSandbox());
  const mk = asyncMarket({ fxVol: 0.004, seed: 5 });
  s.setDailyCloses('^GSPC', toSeries(mk.us));
  s.setDailyCloses('ZZ0001.KS', toSeries(mk.kr));
  s.setUsdKrwRates({ status: 'SOURCE_UNAVAILABLE', rates: null, endDate: null });
  s.state.assets = [krEtfAsset('ZZ0001.KS', 'ZZ 미국지수')];
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].beta, null);
  assert.strictEqual(m.holdings[0].betaStatus, 'SOURCE_UNAVAILABLE');
});

test('④ 최소 관측 120: Dimson 행 119개면 베타 없음, 120개면 계산', async () => {
  const run = async (n) => {
    const s = withSyntheticLedger(loadRiskSandbox());
    // 두 시장이 같은 날짜 달력으로 매일 열리면 행 수 = 종목 날짜 수 − 2(첫 날 · 마지막 날 제외).
    const rnd = lcg(3);
    const dates = calendar(n).map((c) => c.iso);
    const us = []; let lvl = 5000;
    dates.forEach((d) => { lvl *= 1 + rnd() * 0.02; us.push({ date: d, close: lvl }); });
    const fx = new Map(dates.map((d) => [d, 1300]));
    const kr = dates.map((d, i) => ({ date: d, close: i === 0 ? 100 : us[i - 1].close / 50 }));
    s.setDailyCloses('^GSPC', toSeries(us));
    s.setDailyCloses('ZZ0001.KS', toSeries(kr));
    s.setUsdKrwRates({ status: 'OK', rates: fx, endDate: dates[dates.length - 1] });
    s.state.assets = [krEtfAsset('ZZ0001.KS', 'ZZ 미국지수')];
    return (await s.computeAdvancedRiskMetrics()).holdings[0];
  };
  const h119 = await run(121);
  assert.strictEqual(h119.betaObservationCount, 119);
  assert.strictEqual(h119.beta, null);
  assert.strictEqual(h119.betaStatus, 'INSUFFICIENT_COMMON_DATES');
  const h120 = await run(122);
  assert.strictEqual(h120.betaObservationCount, 120);
  assert.strictEqual(typeof h120.beta, 'number');
});

test('④ 포트폴리오 베타: 하나라도 베타가 없으면(HOLD 종목 포함) null, 모두 있으면 비중 가중합', async () => {
  const build = async (withHold) => {
    const s = withSyntheticLedger(loadRiskSandbox());
    const mk = asyncMarket({ fxVol: 0.003, seed: 9 });
    s.setDailyCloses('^GSPC', toSeries(mk.us));
    s.setDailyCloses('ZZ0001.KS', toSeries(mk.kr));
    s.setDailyCloses('ZZ0002.KS', toSeries(mk.kr));
    s.setUsdKrwRates({ status: 'OK', rates: mk.fx, endDate: mk.us[mk.us.length - 1].date });
    s.state.assets = [krEtfAsset('ZZ0001.KS', 'ZZ 미국지수')].concat(withHold ? [krEtfAsset('ZZ0002.KS', 'ZZ 헤지 미확인')] : []);
    return s.computeAdvancedRiskMetrics();
  };
  const withHold = await build(true);
  assert.strictEqual(withHold.holdings.find((h) => h.ticker === 'ZZ0002.KS').betaStatus, 'BENCHMARK_UNRESOLVED');
  assert.strictEqual(withHold.portfolioBeta, null, '베타 없는 종목을 빼고 다시 나누지 않는다');
  const only = await build(false);
  assert.ok(Math.abs(only.portfolioBeta - only.holdings[0].beta) < 1e-12);
});

/* ── ⑤ D-06 개별주 ─────────────────────────────────────────────────────── */

test('⑤ D-06: 국내 상장 개별주만 상장 시장 지수, 원장에 없는 미국 상장주는 거래소 지수로 보내지 않는다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({
    'ZZK1.KS': { exchange: 'KOSPI', nameKr: 'ZZ전자' }, 'ZZK2.KQ': { exchange: 'KOSDAQ', nameKr: 'ZZ바이오' },
    ZZN: { exchange: 'NASDAQ', nameEn: 'ZZ NASDAQ CORP' }, ZZY: { exchange: 'NYSE', nameEn: 'ZZ NYSE CORP' }, ZZA: { exchange: 'AMEX', nameEn: 'ZZ AMEX CORP' }
  });
  const bm = (t) => plain(s.resolveRiskBenchmark({ ticker: t, category: '주식', name: '' }));
  assert.deepStrictEqual(bm('ZZK1.KS'), { key: 'KOSPI', status: 'RESOLVED', source: 'listingExchange' });
  assert.deepStrictEqual(bm('ZZK2.KQ'), { key: 'KOSDAQ', status: 'RESOLVED', source: 'listingExchange' });
  ['ZZN', 'ZZY', 'ZZA'].forEach((t) => assert.deepStrictEqual(bm(t), { key: null, status: 'UNRESOLVED', source: 'listingDomicileUnconfirmed' }, t));
  assert.deepStrictEqual(plain(s.RISK_BENCHMARK_BY_LISTING_EXCHANGE), { KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ' });
  // [2차 통합 보완 · PM 결정 ③] 원장 항목이어도 근거가 거래소 상장뿐이면 본국 보통주로 추정하지 않는다.
  assert.deepStrictEqual(bm('AAPL'), { key: null, status: 'UNRESOLVED', source: 'listingDomicileUnconfirmed' });
  // 원장에 본국 보통주(A등급)로 명시된 경우만 원장 Benchmark · ADR은 거래소 지수로 보내지 않는다 · 근거 부족도 UNRESOLVED.
  const syn = withSyntheticLedger(loadRiskSandbox());
  const sb = (t) => plain(syn.resolveRiskBenchmark({ ticker: t, category: '주식', name: '' }));
  assert.deepStrictEqual(sb('ZZUS'), { key: 'NASDAQ', status: 'RESOLVED', source: 'exposureMaster' });
  assert.deepStrictEqual(sb('ZZUL'), { key: null, status: 'UNRESOLVED', source: 'listingDomicileUnconfirmed' });
  assert.deepStrictEqual(sb('ZZADR'), { key: null, status: 'UNRESOLVED', source: 'adrListing' });
  // 상장 형태는 A등급 근거로만 적을 수 있고 해외 개별주에만 쓴다.
  assert.ok(EM.validateExposureEntry(Object.assign({}, SYN.usStock, { evidenceGrade: 'B' })).violations.includes('equityListing:notGradeA'));
  assert.ok(EM.validateExposureEntry(Object.assign({}, SYN.krStock, { equityListing: 'HOME_COMMON' })).violations.includes('equityListing:notForeignStock'));
});

/* ── 공유표 동결 ────────────────────────────────────────────────────────── */

test('공유표(ETF_HOLDINGS_MAP · SECTOR_MAP) 신규 항목 동결 · 섹터 정보는 유지', () => {
  const s = loadRiskSandbox();
  assert.deepStrictEqual(Object.keys(plain(s.ETF_HOLDINGS_MAP)).sort(), ['069500.KS', '102110.KS', 'IEF', 'QQQ', 'QQQM', 'SCHD', 'SMH', 'SOXX', 'SPY', 'SPYM', 'TLT', 'TQQQ', 'VOO']);
  assert.deepStrictEqual(Object.keys(plain(s.SECTOR_MAP)).sort(), [
    '000270.KS', '000660.KS', '005380.KS', '005930.KS', '006400.KS', '015760.KS', '028260.KS', '035420.KS', '035720.KS', '051910.KS',
    '055550.KS', '068270.KS', '086790.KS', '105560.KS', '207940.KS', '373220.KS', 'AAPL', 'AMD', 'AMZN', 'AVGO', 'CVX', 'GOOG', 'GOOGL',
    'JNJ', 'JPM', 'KO', 'MA', 'META', 'MSFT', 'NFLX', 'NVDA', 'PG', 'TSLA', 'TSM', 'UNH', 'V', 'XOM'
  ]);
  Object.values(plain(s.ETF_HOLDINGS_MAP)).forEach((v) => assert.ok(v.sectorWeights, '섹터 노출 정보는 그대로 남는다'));
  // 새 상품의 사실은 공유표가 아니라 원장(EM-2026.2)에만 들어갔다.
  EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.2' && e.ticker !== 'SCHD').forEach((e) => {
    assert.strictEqual(plain(s.ETF_HOLDINGS_MAP)[e.ticker], undefined, e.ticker);
    assert.strictEqual(plain(s.SECTOR_MAP)[e.ticker], undefined, e.ticker);
  });
});

test('상태 표(실제 원장): 확인·원천있음 / 확인·원천없음 / 헤지 미확인 / 혼합 / 미해결이 서로 섞이지 않는다', () => {
  const s = loadRiskSandbox();
  const buckets = { RESOLVED: 0, SOURCE_UNAVAILABLE: 0, hedgeUnconfirmed: 0, mixedExposure: 0, UNRESOLVED: 0 };
  EM.EXPOSURE_MASTER_ENTRIES.forEach((e) => {
    const category = e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK' ? '주식' : 'ETF';
    const bm = plain(s.resolveRiskBenchmark({ ticker: e.ticker, category, name: '' }));
    let bucket;
    if (bm.status === 'RESOLVED' && bm.priceSource === 'UNAVAILABLE') bucket = 'SOURCE_UNAVAILABLE';
    else if (bm.status === 'RESOLVED') bucket = 'RESOLVED';
    else if (bm.source === 'hedgeUnconfirmed' || bm.source === 'mixedExposure') bucket = bm.source;
    else bucket = 'UNRESOLVED';
    buckets[bucket]++;
    // 각 상태의 정의 - 확인됐으면 키가 있고, 미확인이면 키가 없다. 원천 없음은 "확인됨"의 하위 상태다.
    if (bm.status === 'RESOLVED') {
      assert.ok(EM.resolveIndexMasterEntry(bm.key), e.ticker);
      assert.strictEqual(EM.isIndexPriceSourceAvailable(bm.key), bm.priceSource !== 'UNAVAILABLE', e.ticker);
    } else {
      assert.strictEqual(bm.key, null, e.ticker);
    }
    if (e.exposureStructure === 'MIXED') assert.strictEqual(bucket, 'mixedExposure', e.ticker);
    if (e.assetType === 'KR_LISTED_FOREIGN_ETF' && !e.exposureStructure && !e.hedgeStatus) assert.strictEqual(bucket, 'hedgeUnconfirmed', e.ticker);
  });
  // 원장 58건 분포: 확인·원천있음 22(국내 개별주 16 + 미국 지수 ETF 5 + 비동기 비헤지 ETF 1) · 확인·원천없음 5 · 헤지 미확인 2 ·
  // 혼합 2 · 미해결 27(본국 보통주 근거 없는 미국 개별주 20 + 대응 지수 없는 ETF 7).
  assert.deepStrictEqual(buckets, { RESOLVED: 22, SOURCE_UNAVAILABLE: 5, hedgeUnconfirmed: 2, mixedExposure: 2, UNRESOLVED: 27 });
});
