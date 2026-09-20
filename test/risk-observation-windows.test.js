// [C-3 · §44 제7조 · PM 승인 2026-09-20] 지표별 관측 창 · [F-7] 음수 위험 기여도
//
// 무엇을 고정하는가:
//   ① 조회는 3년이지만 지표마다 쓰는 기간이 다르다 - 변동성 · 베타 · 상관 2년, VaR · CVaR · MDD 3년,
//      기술 신호 1년. 전 지표를 한 기간으로 묶지 않는다.
//   ② 꼬리 지표는 오래된 급락을 본다 - 2년 창 밖에 있는 낙폭이 MDD에 반영돼야 한다.
//   ③ 분포 지표는 2년 창 밖의 사건에 흔들리지 않는다.
//   ④ 음수 위험 기여도를 0으로 깎지 않는다.
// 실제 보유 종목은 쓰지 않는다(ZZ 합성 · 결정적 fixture).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = require('./risk-sandbox.js');

const LISTED = { '005930.KS': { exchange: 'KOSPI', nameKr: 'ZZ 국내주식' } };

// 800거래일 시계열: 앞쪽(오래 전)에 -40% 급락을 한 번 넣고 나머지는 잔잔한 톱니로 둔다.
// 급락 지점을 2년 창(500) 밖 · 3년 창(750) 안에 두어 "어느 지표가 그것을 보는가"를 가른다.
function seriesWithOldCrash(n, base, crashIndexFromEnd) {
  const closes = zigzagCloses(n, base, 0.2, 0.2);
  const crashAt = n - crashIndexFromEnd;
  for (let i = crashAt; i < n; i++) closes[i] *= 0.6; // 그 시점 이후 수준이 40% 내려앉는다
  return withDates({ closes, volumes: volumes(n, 1000, 1) }, '2023-01-02');
}
function calmSeries(n, base) {
  return withDates({ closes: zigzagCloses(n, base, 0.2, 0.2), volumes: volumes(n, 1000, 1) }, '2023-01-02');
}

function sandbox() {
  const s = loadRiskSandbox();
  s.setTickerMaster(LISTED);
  return s;
}

test('창 상수: §44 제7조의 목표 관측 수를 그대로 쓴다(기술 1년 · 분포 2년 · 꼬리 3년)', () => {
  const s = sandbox();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.RISK_OBSERVATION_WINDOWS)), {
    technical: 250, volatility: 500, beta: 500, correlation: 500, var: 750, cvar: 750, mdd: 750
  });
  // 자료가 창보다 짧으면 있는 만큼 쓴다 - 없는 값을 만들지 않는다.
  assert.deepStrictEqual(s.sliceRecentObservations([1, 2, 3], 10), [1, 2, 3]);
  assert.deepStrictEqual(s.sliceRecentObservations([1, 2, 3, 4], 2), [3, 4]);
});

test('꼬리 지표(MDD)는 2년 창 밖의 급락을 보고, 분포 지표(변동성)는 보지 않는다', async () => {
  // 급락을 "끝에서 600번째"에 둔다 - 2년 창(최근 500) 밖, 3년 창(최근 750) 안.
  const withCrash = sandbox();
  withCrash.state.assets = [makeTestAsset({ name: 'ZZ 국내주식', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  withCrash.setDailyCloses('005930.KS', seriesWithOldCrash(800, 100000, 600));
  withCrash.setDailyCloses('^KS11', calmSeries(800, 2500));
  const mCrash = await withCrash.computeAdvancedRiskMetrics();

  const noCrash = sandbox();
  noCrash.state.assets = [makeTestAsset({ name: 'ZZ 국내주식', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  noCrash.setDailyCloses('005930.KS', calmSeries(800, 100000));
  noCrash.setDailyCloses('^KS11', calmSeries(800, 2500));
  const mCalm = await noCrash.computeAdvancedRiskMetrics();

  // MDD(3년 창)는 그 급락을 반영한다 - 1년 · 2년 창만 봤다면 보이지 않았을 사건이다.
  assert.ok(mCrash.portfolioMDDPct < mCalm.portfolioMDDPct - 20,
    `MDD가 오래된 급락을 반영하지 못했다(급락 ${mCrash.portfolioMDDPct} vs 평온 ${mCalm.portfolioMDDPct})`);
  // 변동성(2년 창)은 급락이 창 밖이라 사실상 같다.
  assert.ok(Math.abs(mCrash.portfolioVolatilityPct - mCalm.portfolioVolatilityPct) < 0.5,
    `변동성이 2년 창 밖 사건에 흔들렸다(${mCrash.portfolioVolatilityPct} vs ${mCalm.portfolioVolatilityPct})`);
});

test('관측 수 표시: 분포 지표는 2년 창 · 꼬리 지표는 3년 창의 실제 개수를 보여 준다', async () => {
  const s = sandbox();
  s.state.assets = [makeTestAsset({ name: 'ZZ 국내주식', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', calmSeries(800, 100000));
  s.setDailyCloses('^KS11', calmSeries(800, 2500));
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.metricStatus.volatility.observations, 500);
  assert.strictEqual(m.metricStatus.correlation.observations, 500);
  assert.strictEqual(m.metricStatus.var.observations, 750);
  assert.strictEqual(m.metricStatus.mdd.observations, 750);
  // 목표 관측 수는 그대로이고, 이제 실제로 채워진다.
  assert.strictEqual(m.metricStatus.volatility.targetObservations, 500);
  assert.strictEqual(m.metricStatus.mdd.targetObservations, 750);
  assert.strictEqual(m.metricStatus.volatility.status, 'AVAILABLE');
  assert.strictEqual(m.metricStatus.mdd.status, 'AVAILABLE');
});

test('자료가 창보다 짧으면 있는 만큼 쓰고, 부족하면 개수를 그대로 알려 준다', async () => {
  const s = sandbox();
  s.state.assets = [makeTestAsset({ name: 'ZZ 국내주식', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', calmSeries(60, 100000));
  s.setDailyCloses('^KS11', calmSeries(60, 2500));
  const m = await s.computeAdvancedRiskMetrics();
  // 최소 관측(120) 미달이라 지표는 만들지 않되, "몇 개 있었는가"는 0이 아니라 실제 수로 남는다.
  assert.strictEqual(m.metricStatus.volatility.status, 'UNAVAILABLE');
  assert.strictEqual(m.metricStatus.volatility.observations, 59);
  assert.strictEqual(m.metricStatus.mdd.observations, 59);
});

test('F-7: 포트폴리오와 반대로 움직인 종목의 위험 기여도를 0으로 깎지 않는다', async () => {
  const s = sandbox();
  s.setTickerMaster({ '005930.KS': { exchange: 'KOSPI', nameKr: 'ZZ 상승형' }, '000660.KS': { exchange: 'KOSPI', nameKr: 'ZZ 역방향' } });
  s.state.assets = [
    makeTestAsset({ name: 'ZZ 상승형', ticker: '005930.KS', quantity: 8, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'ZZ 역방향', ticker: '000660.KS', quantity: 2, buyPrice: 100000, currentPrice: 100000 })
  ];
  // 같은 날짜에 정확히 반대로 움직이는 두 시계열 - 작은 쪽의 포트폴리오 베타가 음수가 된다.
  const up = withDates({ closes: zigzagCloses(600, 100000, 1.0, 0.8), volumes: volumes(600, 1000, 1) }, '2023-01-02');
  const down = withDates({ closes: zigzagCloses(600, 100000, -1.0, -0.8), volumes: volumes(600, 1000, 1) }, '2023-01-02');
  s.setDailyCloses('005930.KS', up);
  s.setDailyCloses('000660.KS', down);
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(600, 2500, 0.9, 0.7), volumes: volumes(600, 1, 1) }, '2023-01-02'));
  const m = await s.computeAdvancedRiskMetrics();

  const rev = m.holdings.find((h) => h.ticker === '000660.KS');
  assert.strictEqual(typeof rev.riskContributionPct, 'number');
  assert.ok(rev.riskContributionPct < 0, `역방향 종목의 기여도가 음수여야 한다(${rev.riskContributionPct})`);
  // 자르지 않으므로 기여도 합은 100%로 맞는다(정의상 포트폴리오 베타 = 1).
  const sum = m.holdings.reduce((acc, h) => acc + (h.riskContributionPct || 0), 0);
  assert.ok(Math.abs(sum - 100) < 1e-6, `기여도 합이 100%가 아니다(${sum})`);
});
