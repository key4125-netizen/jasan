/* Phase 2-1 - Risk 데이터 품질 · 지표별 부분 표시 · 결측 요인 처리 검증
 * 근거: §44 제9조(품질 상태) · 제12조(Metric-level Partial Display) · 44-13(기존 P-8 대체) · 44-14(운영 파라미터)
 *
 * 이 파일이 지키려는 한 문장:
 *   "계산할 수 있는 것은 계산하고, 계산할 수 없는 것은 그 사실을 사유와 함께 남긴다 -
 *    없는 값을 0 · 50 · 1.0 같은 그럴듯한 숫자로 채우지 않는다."
 */
const test = require('node:test');
const assert = require('node:assert');
const H = require('./risk-sandbox.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = H;

const LISTED = {
  '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자' },
  '000660.KS': { exchange: 'KOSPI', nameKr: 'SK하이닉스' }
};
// vm 컨텍스트에서 만들어진 배열/객체는 프로토타입이 달라 deepStrictEqual이 실패한다 - 평탄화해서 본다.
const plain = (v) => JSON.parse(JSON.stringify(v));
const long = (n = 260, base = 100000) => withDates({ closes: zigzagCloses(n, base, 1, 1), volumes: volumes(n, 1000, 1) });

function baseSandbox() {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  return s;
}

/* ---------- R-06 데이터 품질 상태 ---------- */

test('R-06 - 상태 코드는 §44 제9조의 9종뿐이고 임의로 늘리지 않았다', () => {
  const s = baseSandbox();
  assert.deepStrictEqual(Object.keys(plain(s.RISK_DATA_STATUS)).sort(), [
    'BENCHMARK_UNRESOLVED', 'DATA_QUALITY_FAILED', 'DATA_STALE', 'FETCH_FAILED',
    'INSUFFICIENT_COMMON_DATES', 'INSUFFICIENT_HISTORY', 'NO_HISTORY', 'OK',
    'SOURCE_UNAVAILABLE', 'TICKER_INVALID'
  ]);
});

test('R-06 - 조회 실패 · 이력 없음 · 이력 짧음을 같은 상태로 뭉치지 않는다', async () => {
  const fetchFailed = baseSandbox();
  fetchFailed.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  // 아무 데이터도 주입하지 않으면 조회 실패 경로다.
  let m = await fetchFailed.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].dataStatus, 'FETCH_FAILED');

  const noHistory = baseSandbox();
  noHistory.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  noHistory.setDataStatus('005930.KS', 'NO_HISTORY');
  m = await noHistory.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].dataStatus, 'NO_HISTORY', '응답은 왔지만 종가가 없는 상태');

  const shortHistory = baseSandbox();
  shortHistory.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  shortHistory.setDataStatus('005930.KS', 'INSUFFICIENT_HISTORY');
  m = await shortHistory.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].dataStatus, 'INSUFFICIENT_HISTORY');
});

test('R-06 - 마지막 거래일이 오래되면 DATA_STALE로 구분한다(계산은 막지 않는다)', async () => {
  const s = baseSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  // 2025년으로 끝나는 시계열 - 오늘과의 간격이 운영 파라미터(10일)를 훨씬 넘는다.
  s.setDailyCloses('005930.KS', long());
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) }));
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].dataStatus, 'DATA_STALE');
  assert.strictEqual(m.holdings[0].dataQuality.stale, true);
  // 상태를 남길 뿐, 이 때문에 지표를 지우지는 않는다.
  assert.strictEqual(typeof m.portfolioVolatilityPct, 'number');
});

test('R-06 - 날짜가 중복되거나 역순이면 품질 불량으로 표시한다', async () => {
  const s = baseSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  const good = long(30);
  const broken = { closes: good.closes.slice(), volumes: good.volumes.slice(), dates: good.dates.slice() };
  broken.dates[5] = broken.dates[4]; // 같은 날짜가 두 번
  s.setDailyCloses('005930.KS', broken);
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].dataStatus, 'DATA_QUALITY_FAILED');
  assert.ok(m.holdings[0].dataQuality.issues.includes('duplicateDate'));
});

test('R-06 - 베타를 못 구한 이유를 구분해 남긴다(기준 지수 미확인 vs 공통 거래일 부족)', async () => {
  // ① 기준 지수를 확인할 수 없는 종목 - 종목 마스터에도 Exposure Master에도 없는 티커를 쓴다
  //    (Phase 1B 이후 앱 기본 종목은 원장이 기준 지수를 확정해 주므로 UNRESOLVED가 되지 않는다).
  /* [§50 · PD-15 fixture 갱신] 티커를 `.KS` 없는 미지의 코드로 바꿨다.
   * Market Beta는 상장 시장으로 기준 지수를 정하는데, `.KS` 접미사는 그 자체가 "KOSPI 상장"이라는
   * 사실이라 종목 마스터가 비어 있어도 기준이 정해진다(의도된 동작). "기준 지수를 확인할 수 없는
   * 종목"을 만들려면 상장 시장을 알 수 없는 코드여야 한다 - 이 테스트의 주장은 그대로다. */
  const noBm = loadRiskSandbox();
  noBm.setTickerMaster({});
  noBm.state.assets = [makeTestAsset({ name: 'A', ticker: 'ZZZ9999', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  noBm.setDailyCloses('ZZZ9999', long());
  let m = await noBm.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].benchmarkStatus, 'UNRESOLVED');
  assert.strictEqual(m.holdings[0].betaStatus, 'BENCHMARK_UNRESOLVED');
  assert.strictEqual(m.metricStatus.beta.reason, 'BENCHMARK_UNRESOLVED');

  // ② 기준 지수는 있는데 겹치는 거래일이 모자란 경우
  const shortOverlap = baseSandbox();
  shortOverlap.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  shortOverlap.setDailyCloses('005930.KS', long());
  shortOverlap.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(30, 2500, 1, 1), volumes: volumes(30, 1, 1) }));
  m = await shortOverlap.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].beta, null);
  assert.strictEqual(m.holdings[0].betaStatus, 'INSUFFICIENT_COMMON_DATES');
});

/* ---------- R-09 지표별 부분 표시 ---------- */

test('R-09 - 공통 거래일이 부족해도 화면 전체를 숨기지 않고 지표별로 판정한다', async () => {
  const s = baseSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', long(60));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(60, 2500, 1, 1), volumes: volumes(60, 1, 1) }));
  const m = await s.computeAdvancedRiskMetrics();

  // 가격이 필요한 지표는 사유와 함께 산출 불가
  ['volatility', 'var', 'cvar', 'mdd'].forEach((k) => {
    assert.strictEqual(m.metricStatus[k].status, 'UNAVAILABLE', k);
    assert.strictEqual(m.metricStatus[k].reason, 'INSUFFICIENT_COMMON_DATES', k);
    assert.strictEqual(m.metricStatus[k].observations, 59, k);
    assert.strictEqual(m.metricStatus[k].required, 120, k);
  });
  // 가격과 무관한 요인은 그대로 계산돼 점수에 들어간다
  assert.strictEqual(typeof m.subScores.concentration, 'number');
  assert.strictEqual(typeof m.riskScore, 'number');
  // 목표 관측 수(§44 제7조)는 진단에만 쓰고 지표를 막지 않는다
  assert.strictEqual(m.metricStatus.var.targetObservations, 750);
  assert.strictEqual(m.metricStatus.volatility.targetObservations, 500);
});

test('R-09 - 충분한 데이터에서는 모든 지표가 AVAILABLE이다', async () => {
  const s = baseSandbox();
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'B', ticker: '000660.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', long());
  s.setDailyCloses('000660.KS', withDates({ closes: zigzagCloses(260, 50000, 1.4, 0.9), volumes: volumes(260, 900, 1) }));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) }));
  const m = await s.computeAdvancedRiskMetrics();
  ['volatility', 'beta', 'correlation', 'var', 'cvar', 'mdd'].forEach((k) => {
    assert.strictEqual(m.metricStatus[k].status, 'AVAILABLE', k);
    assert.strictEqual(m.metricStatus[k].reason, null, k);
  });
  assert.deepStrictEqual(plain(m.excludedFactors), [], '빠진 요인이 없으면 안내도 없다');
});

/* ---------- R-01 결측 요인 처리 ---------- */

test('R-01 - 결측 요인을 50점으로 채우지 않고 점수에서 빼고 재정규화한다', async () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({}); // 기준 지수를 확인할 수 없게 만든다 → 시장위험(15%) 결측
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'B', ticker: '000660.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', long());
  s.setDailyCloses('000660.KS', withDates({ closes: zigzagCloses(260, 50000, 1.4, 0.9), volumes: volumes(260, 900, 1) }));
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.subScores.market, null, '모르는 요인을 중립(50)으로 바꾸지 않는다');
  assert.deepStrictEqual(plain(m.excludedFactors).map((f) => f.key), ['market']);
  assert.strictEqual(m.excludedFactors[0].label, '시장 민감도(베타)');
  assert.strictEqual(m.excludedFactors[0].weight, 0.15);

  // 남은 다섯 요인(합 0.85)으로 재정규화한 값과 정확히 같아야 한다.
  const sub = m.subScores;
  const w = { concentration: 0.25, volatility: 0.20, drawdown: 0.20, correlation: 0.10, technical: 0.10 };
  const wSum = Object.values(w).reduce((a, b) => a + b, 0);
  const base = Object.entries(w).reduce((acc, [k, weight]) => acc + sub[k] * weight, 0) / wSum;
  const maxSub = Math.max(...Object.keys(w).map((k) => sub[k]));
  const expected = Math.max(0, Math.min(100, Math.round(base + (maxSub >= 95 ? 8 : maxSub >= 90 ? 5 : 0))));
  assert.strictEqual(m.riskScore, expected);
});

test('R-01 - 결측이 하나도 없으면 점수는 예전 방식과 완전히 같다', () => {
  const s = loadRiskSandbox();
  const full = { concentration: 60, volatility: 40, drawdown: 50, market: 30, correlation: 70, technical: 20 };
  const legacy = Math.round(60 * 0.25 + 40 * 0.20 + 50 * 0.20 + 30 * 0.15 + 70 * 0.10 + 20 * 0.10);
  assert.strictEqual(s.computeCompositeRiskScore(full), legacy, '유효 가중치 합이 1.0이면 재정규화는 아무것도 바꾸지 않는다');
});

test('R-01 - 위험기여도도 베타 1.0 가정으로 채우지 않는다', async () => {
  const s = baseSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', long(60));       // 공통 거래일 부족 → 포트폴리오 수익률 없음
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].riskContributionPct, null, '기여도를 비중으로 대신 채우지 않는다');
});

/* ---------- R-08 신뢰도에 관측기간 반영 ---------- */

test('R-08 - 관측기간이 짧으면 신뢰도가 더 낮다(같은 구성이어도)', async () => {
  const build = async (n) => {
    const s = baseSandbox();
    s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
    s.setDailyCloses('005930.KS', long(n));
    s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(n, 2500, 1, 1), volumes: volumes(n, 1, 1) }));
    return s.computeAdvancedRiskMetrics();
  };
  const short = await build(130);   // 129 관측 - 기준선(120)을 겨우 넘김
  const long1y = await build(260);  // 259 관측 - 1년치
  assert.ok(short.dataConfidence.score < long1y.dataConfidence.score,
    `짧은 표본의 신뢰도가 더 낮아야 한다(${short.dataConfidence.score} < ${long1y.dataConfidence.score})`);
  assert.ok(short.dataConfidence.reasons.some((r) => r.includes('거래일')), '사유에 관측기간이 적힌다');
  // 감점 상한은 10점이다(운영 파라미터 OP-2).
  assert.ok(long1y.dataConfidence.score - short.dataConfidence.score <= 10);
});

test('R-08 - 240일 이상이면 관측기간 감점이 없다(기존 신뢰도와 동일)', () => {
  const s = loadRiskSandbox();
  assert.strictEqual(s.observationCoveragePenalty(240, 120), 0);
  assert.strictEqual(s.observationCoveragePenalty(1000, 120), 0);
  assert.ok(s.observationCoveragePenalty(120, 120) > 0);
  // 관측 수를 모르면 감점하지 않는다(예전 호출 형태 호환).
  assert.strictEqual(s.observationCoveragePenalty(null, 120), 0);
});

/* ---------- R-11 날짜 인지 합성 ---------- */

test('R-11 - 길이가 다른 수익률 벡터는 합치지 않는다(조용한 날짜 밀림 방지)', () => {
  const s = loadRiskSandbox();
  const dates = ['2025-01-02', '2025-01-03', '2025-01-06'];
  const ok = s.buildPortfolioCommonReturns([
    { weight: 0.5, commonReturns: [0.01, 0.02, 0.03] },
    { weight: 0.5, commonReturns: [0.03, 0.02, 0.01] }
  ], dates);
  assert.deepStrictEqual(plain(ok).map((v) => Math.round(v * 1000) / 1000), [0.02, 0.02, 0.02]);

  // 한쪽이 짧으면 예전에는 앞에서부터 잘라 더했다 - 이제는 만들지 않는다.
  const mismatched = s.buildPortfolioCommonReturns([
    { weight: 0.5, commonReturns: [0.01, 0.02, 0.03] },
    { weight: 0.5, commonReturns: [0.03, 0.02] }
  ], dates);
  assert.deepStrictEqual(plain(mismatched), []);
});

test('R-11 - 실제 엔진 결과는 날짜 축과 길이가 정확히 일치한다', async () => {
  const s = baseSandbox();
  s.state.assets = [
    makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'B', ticker: '000660.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', long());
  s.setDailyCloses('000660.KS', withDates({ closes: zigzagCloses(260, 50000, 1.4, 0.9), volumes: volumes(260, 900, 1) }));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) }));
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.commonDates.length, m.dataSufficiency.commonReturnCount);
  m.holdings.forEach((h) => assert.strictEqual(h.commonReturns.length, m.commonDates.length, h.ticker));
});

/* ---------- 조용한 대체 금지(통합) ---------- */

test('조용한 대체 금지 - 데이터가 없을 때 0 · 50 · 1.0 어느 것으로도 채우지 않는다', async () => {
  const s = baseSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  const m = await s.computeAdvancedRiskMetrics();   // 가격 이력 자체가 없다
  ['portfolioVolatilityPct', 'portfolioMDDPct', 'var95Pct', 'cvarPct', 'portfolioBeta', 'weightedAvgCorrelation',
    'stressLossKRW', 'stressLossPct'].forEach((k) => assert.strictEqual(m[k], null, k));
  ['volatility', 'drawdown', 'market', 'correlation', 'technical'].forEach((k) => assert.strictEqual(m.subScores[k], null, k));
  assert.strictEqual(m.holdings[0].riskContributionPct, null);
  // 그래도 비중 기반 정보는 남아 점수를 만든다 - "아무것도 못 보여주는" 상태로 되돌아가지 않는다.
  assert.strictEqual(typeof m.riskScore, 'number');
  assert.strictEqual(m.riskScore, m.subScores.concentration);
});
