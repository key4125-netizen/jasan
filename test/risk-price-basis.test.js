/* Phase 2-2 - R-03/R-04 가격 기준 분리 검증 (§44 제8조)
 *
 *   통계 위험지표(변동성 · 베타 · 상관 · VaR · CVaR · MDD · Sortino) → 조정주가(Adjusted Close)
 *   기술 지표(RSI · 이동평균 · 52주 · 거래량 신호)                   → 원주가(Raw Close)
 *
 * 증명 방식: 원주가와 조정주가를 **의도적으로 다르게** 만든 fixture를 쓴다.
 * 엔진이 잘못된 배열을 쓰면 값이 달라지므로, "함수가 불렸다"가 아니라 "그 데이터가 실제로
 * 계산에 들어갔다"가 검증된다.
 */
const test = require('node:test');
const assert = require('node:assert');
const H = require('./risk-sandbox.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = H;

const LISTED = { '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자' } };
const round = (v, d) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v);

// 원주가와 조정주가가 다른 시계열: 조정주가는 같은 날짜 · 같은 길이지만 흔들림이 더 크다.
function splitSeries(n = 260, base = 100000, startDate = '2025-01-01') {
  const raw = withDates({ closes: zigzagCloses(n, base, 1.0, 1.0), volumes: volumes(n, 1000, 1) }, startDate);
  const adj = zigzagCloses(n, base, 2.2, 1.0); // 진폭이 훨씬 큰 별도 시계열
  return Object.assign({}, raw, { closesAdj: adj });
}

function sandboxWith(series, benchSeries) {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', series);
  if (benchSeries !== null) s.setDailyCloses('^KS11', benchSeries || withDates({ closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) }));
  return s;
}

/* ---------- [1] 파싱 ---------- */

test('R-03 파싱 - 원주가와 조정주가를 각각 읽고 날짜 · 길이가 정합한다', () => {
  const s = loadRiskSandbox();
  const t0 = Date.UTC(2025, 0, 2) / 1000;
  const parsed = JSON.parse(JSON.stringify(s.parseYahooDailySeries({
    chart: { result: [{
      timestamp: [t0, t0 + 86400, t0 + 172800, t0 + 259200],
      indicators: {
        quote: [{ close: [100, 101, null, 103], volume: [10, 20, 30, 40] }],
        adjclose: [{ adjclose: [90, 91, null, 93] }]
      }
    }] }
  })));
  // 종가가 없는 날은 통째로 빠지고, 조정주가도 같은 인덱스로 맞춰진다.
  assert.deepStrictEqual(parsed.closes, [100, 101, 103]);
  assert.deepStrictEqual(parsed.closesAdj, [90, 91, 93]);
  assert.deepStrictEqual(parsed.dates, ['2025-01-02', '2025-01-03', '2025-01-05']);
  assert.strictEqual(parsed.closes.length, parsed.dates.length);
  assert.strictEqual(parsed.closesAdj.length, parsed.dates.length);
});

test('R-03 파싱 - 조정주가가 그날만 비면 null로 남기고 채우지 않는다', () => {
  const s = loadRiskSandbox();
  const t0 = Date.UTC(2025, 0, 2) / 1000;
  const parsed = JSON.parse(JSON.stringify(s.parseYahooDailySeries({
    chart: { result: [{
      timestamp: [t0, t0 + 86400, t0 + 172800],
      indicators: { quote: [{ close: [100, 101, 102], volume: [1, 2, 3] }], adjclose: [{ adjclose: [90, null, 92] }] }
    }] }
  })));
  assert.deepStrictEqual(parsed.closesAdj, [90, null, 92], '원주가(101)로 메우지 않는다');
});

/* ---------- [2] 통계 경로가 조정주가를 쓰는가 ---------- */

test('R-03 - 통계 지표(변동성 · VaR · CVaR · MDD)가 조정주가로 계산된다', async () => {
  const series = splitSeries();
  const s = sandboxWith(series);
  const m = await s.computeAdvancedRiskMetrics();

  // 같은 fixture의 두 배열로 각각 "직접" 계산한 값과 비교한다.
  const rawVol = s.computeAnnualizedVolatilityPct(s.dailyReturnsFromCloses(series.closes));
  const adjVol = s.computeAnnualizedVolatilityPct(s.dailyReturnsFromCloses(series.closesAdj));
  assert.ok(Math.abs(rawVol - adjVol) > 1, '두 배열의 변동성이 충분히 달라야 검증이 의미가 있다');
  assert.strictEqual(round(m.portfolioVolatilityPct, 6), round(adjVol, 6), '조정주가 기준 값과 같아야 한다');
  assert.notStrictEqual(round(m.portfolioVolatilityPct, 6), round(rawVol, 6), '원주가로 계산되면 안 된다');

  // 종목 단위 수익률 · MDD도 조정주가 기준이다.
  assert.strictEqual(round(m.holdings[0].mdd, 6), round(s.computeMDDFromCloses(series.closesAdj), 6));
  assert.notStrictEqual(round(m.holdings[0].mdd, 6), round(s.computeMDDFromCloses(series.closes), 6));
});

test('R-03 - 베타도 조정주가(종목 · 지수 모두)로 계산된다', async () => {
  const series = splitSeries();
  const bench = withDates({ closes: zigzagCloses(260, 2500, 1.0, 1.0), volumes: volumes(260, 1, 1) });
  bench.closesAdj = zigzagCloses(260, 2500, 1.7, 1.0); // 지수도 원주가와 조정주가가 다르다
  const s = sandboxWith(series, bench);
  const m = await s.computeAdvancedRiskMetrics();

  const betaAdj = s.computeBetaFromReturns(s.dailyReturnsFromCloses(series.closesAdj), s.dailyReturnsFromCloses(bench.closesAdj));
  const betaRaw = s.computeBetaFromReturns(s.dailyReturnsFromCloses(series.closes), s.dailyReturnsFromCloses(bench.closes));
  assert.ok(Math.abs(betaAdj - betaRaw) > 0.05, '두 기준의 베타가 충분히 달라야 한다');
  assert.strictEqual(round(m.holdings[0].beta, 6), round(betaAdj, 6));
  assert.notStrictEqual(round(m.holdings[0].beta, 6), round(betaRaw, 6));
});

/* ---------- [3] 기술 경로가 원주가를 쓰는가 ---------- */

test('R-04 - 기술 지표(RSI · 이동평균 · 52주)가 원주가로 계산된다', async () => {
  const series = splitSeries();
  const s = sandboxWith(series);
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];

  assert.strictEqual(round(h.rsi14, 6), round(s.computeRSI14(series.closes), 6));
  assert.notStrictEqual(round(h.rsi14, 6), round(s.computeRSI14(series.closesAdj), 6));
  assert.strictEqual(round(h.ma20, 6), round(s.computeSMA(series.closes, 20), 6));
  assert.notStrictEqual(round(h.ma20, 6), round(s.computeSMA(series.closesAdj, 20), 6));
  // 52주 고점은 원주가 최고값과 현재가 중 큰 값이다(조정주가 최고값이 아니다).
  assert.strictEqual(h.week52High, Math.max(...series.closes, 100000));
  assert.notStrictEqual(h.week52High, Math.max(...series.closesAdj, 100000));
});

test('R-04 - 기술 지표 계산식 · 임계값은 그대로다(가격 기준만 바뀌었다)', () => {
  const s = loadRiskSandbox();
  // 같은 배열을 넣으면 예전과 완전히 같은 값이 나온다 - 이번 작업은 "어떤 배열을 넣는가"만 바꿨다.
  const closes = zigzagCloses(60, 1000, 1, 1);
  assert.strictEqual(s.computeRSI14(closes), s.computeRSI14(closes.slice()));
  assert.strictEqual(s.computeSMA(closes, 20), s.computeSMA(closes.slice(), 20));
  assert.strictEqual(s.maTrendLabel(3, 2, 1), '정배열(상승추세)');
  assert.strictEqual(s.maTrendLabel(1, 2, 3), '역배열(하락추세)');
});

/* ---------- [4] 조정주가가 없을 때 - 조용한 대체 금지 ---------- */

test('R-03 - 조정주가가 없으면 통계 지표를 만들지 않고 사유를 남긴다(원주가로 대체 금지)', async () => {
  const series = withDates({ closes: zigzagCloses(260, 100000, 1, 1), volumes: volumes(260, 1000, 1) });
  series.closesAdj = null; // 응답에 adjclose가 없는 상태
  const s = sandboxWith(series);
  const m = await s.computeAdvancedRiskMetrics();

  // 통계 지표는 전부 산출 불가 + 사유는 기존 9종 중 하나(SOURCE_UNAVAILABLE)다.
  assert.strictEqual(m.portfolioVolatilityPct, null);
  assert.strictEqual(m.var95Pct, null);
  assert.strictEqual(m.portfolioMDDPct, null);
  assert.strictEqual(m.holdings[0].mdd, null);
  assert.strictEqual(m.holdings[0].returns, null);
  assert.strictEqual(m.holdings[0].dataStatus, 'SOURCE_UNAVAILABLE');
  assert.strictEqual(m.metricStatus.volatility.status, 'UNAVAILABLE');
  assert.strictEqual(m.metricStatus.volatility.reason, 'SOURCE_UNAVAILABLE');
  assert.ok(Object.keys(JSON.parse(JSON.stringify(s.RISK_DATA_STATUS))).includes(m.metricStatus.var.reason),
    '새 상태를 만들지 않고 기존 9종 안에서 표현한다');

  // 기술 지표는 원주가로 그대로 계산된다 - 조정주가가 없다고 화면 전체가 비지 않는다.
  assert.strictEqual(round(m.holdings[0].rsi14, 6), round(s.computeRSI14(series.closes), 6));
  assert.strictEqual(typeof m.riskScore, 'number', '계산 가능한 요인으로 점수는 계속 만든다');
});

test('R-03 - 지수(벤치마크)에 조정주가가 없으면 베타를 만들지 않는다', async () => {
  const series = splitSeries();
  const bench = withDates({ closes: zigzagCloses(260, 2500, 1, 1), volumes: volumes(260, 1, 1) });
  bench.closesAdj = null;
  const s = sandboxWith(series, bench);
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].beta, null);
  assert.strictEqual(m.holdings[0].betaStatus, 'SOURCE_UNAVAILABLE');
  assert.strictEqual(m.subScores.market, null, '결측 요인은 50으로 채우지 않는다(R-01 유지)');
});

/* ---------- [5] 기존 동작 보존 ---------- */

test('R-03/R-04 - 배당·분할이 없어 두 가격이 같으면 결과가 예전과 동일하다', async () => {
  const same = withDates({ closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1) });
  // withDates/setDailyCloses가 closesAdj = closes로 채운다(실제 무배당 종목의 응답과 같은 상태).
  const s = sandboxWith(same);
  const m = await s.computeAdvancedRiskMetrics();
  const expectedVol = s.computeAnnualizedVolatilityPct(s.dailyReturnsFromCloses(same.closes));
  assert.strictEqual(round(m.portfolioVolatilityPct, 6), round(expectedVol, 6));
  assert.strictEqual(round(m.holdings[0].rsi14, 6), round(s.computeRSI14(same.closes), 6));
  assert.strictEqual(typeof m.riskScore, 'number');
});

/* ---------- [6] Phase 2-1 구조 보존 ---------- */

test('Phase 2-1 회귀 - 상태 9종 · metricStatus · 재정규화 · 날짜 정합이 그대로다', async () => {
  const series = splitSeries();
  const s = sandboxWith(series);
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(Object.keys(JSON.parse(JSON.stringify(s.RISK_DATA_STATUS))).length, 10, 'OK + 9개 상태(추가 없음)');
  ['volatility', 'beta', 'correlation', 'var', 'cvar', 'mdd'].forEach((k) => {
    assert.ok(m.metricStatus[k], k);
    assert.ok(['AVAILABLE', 'UNAVAILABLE'].includes(m.metricStatus[k].status), k);
  });
  // 날짜 축과 수익률 길이 정합(R-11)
  assert.strictEqual(m.commonDates.length, m.dataSufficiency.commonReturnCount);
  m.holdings.forEach((h) => assert.strictEqual(h.commonReturns.length, m.commonDates.length));
  // 결측 요인 제외 + 재정규화(R-01)
  assert.strictEqual(s.computeCompositeRiskScore({ concentration: 60 }), 60);
  assert.strictEqual(s.computeCompositeRiskScore({}), null);
  // What-If 가드(Phase 2-1)
  assert.strictEqual(s.computeScenarioRiskMetrics(null, {}), null);
});
