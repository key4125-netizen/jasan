// [T6 · §44 44-15] Risk 원화 기준 환율 반영 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/risk-fx-krw.test.js
//
// 가격통화 USD 종목의 "통계용" 조정주가만 H.10 USD/KRW로 원화 환산한다. 베타 · 기술 지표는 현지통화 그대로,
// 원화 가격 종목(국내 상장 해외 ETF 포함)은 환율을 곱하지 않는다. 환율이 없는 날은 채우지 않고 뺀다.
// 외부 의존 없음: 환율은 sandbox.setUsdKrwRates()로만 주입한다(test/risk-sandbox.js 참고).

const assert = require('node:assert');
const { test } = require('node:test');
const H = require('./risk-sandbox.js');

const { loadRiskSandbox, makeTestAsset, zigzagCloses, volumes, withDates, datesFrom } = H;

const LISTED = {
  '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자', market: 'KR' },
  'AAPL': { exchange: 'NASDAQ', nameEn: 'APPLE INC', market: 'US' }
};
const N = 260;
const DATES = datesFrom(N);

function freshSandbox() {
  const s = loadRiskSandbox();
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  return s;
}
const series = (n, start, up, down) => withDates({ closes: zigzagCloses(n, start, up, down), volumes: volumes(n, 1000, 1.0) });
// 날마다 달라지는 환율(결정적) - 1,300원 근처에서 오르내린다.
function fxResult(dates, { drop = [] } = {}) {
  const rates = new Map();
  dates.forEach((d, i) => { if (!drop.includes(d)) rates.set(d, 1300 * (1 + 0.004 * Math.sin(i / 3))); });
  const keys = [...rates.keys()].sort();
  return { status: 'OK', rates, endDate: keys[keys.length - 1] };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

// 원화 종목 1 + 달러 종목 1(나스닥 종합 벤치마크) + 국내 상장 해외 ETF 1(원화 가격).
function mixedPortfolio(s) {
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'APPLE', ticker: 'AAPL', category: '주식', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: 'TIGER 미국나스닥100', ticker: '133690', category: 'ETF', isDomestic: '해외', currency: 'KRW', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', series(N, 100000, 1.2, 1.0));
  s.setDailyCloses('AAPL', series(N, 100, 1.1, 0.9));
  s.setDailyCloses('133690.KS', series(N, 100000, 0.9, 0.8));
  s.setDailyCloses('^KS11', series(N, 2500, 1.0, 0.9));
  s.setDailyCloses('^IXIC', series(N, 15000, 0.95, 0.85));
  /* [D-2 기대값 갱신 · PM 최종 정책 2026-09-21] AAPL(미국 노출)의 시장 지수가 S&P500으로 바뀌었다. ^IXIC와 **같은 시계열**을 넣어
   * 베타 값을 유지한다 - 이 파일이 검사하는 것은 "베타가 환율에 영향받지 않는다"이지
   * 어느 지수를 쓰는가가 아니기 때문이다. (133690.KS는 원장에 없어 STEP 5대로 미확정이 된다.) */
  s.setDailyCloses('^GSPC', series(N, 15000, 0.95, 0.85));
  s.setTickerMaster(LISTED);
  // [2차 통합 보완 · PM 결정 ③] 달러 종목의 베타(현지통화) 경로를 검사하려면 Benchmark가 있어야 한다 - 본국 보통주 근거를 시험용으로 붙인다.
  s.markHomeCommonListing(['AAPL']);
  return s;
}
const byTicker = (m, t) => m.holdings.find((h) => h.ticker === t);

test('A - 원화 환산 수익률 = (1 + 달러 수익률) × (1 + 환율 수익률) - 1', async () => {
  const s = mixedPortfolio(freshSandbox());
  const fx = fxResult(DATES);
  s.setUsdKrwRates(fx);
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'AAPL');
  const local = h.datedClosesLocal;
  assert.strictEqual(h.returns.length, local.length - 1);
  for (let k = 1; k < local.length; k++) {
    const rUsd = local[k].close / local[k - 1].close - 1;
    const rFx = fx.rates.get(local[k].date) / fx.rates.get(local[k - 1].date) - 1;
    const expected = (1 + rUsd) * (1 + rFx) - 1;
    assert.ok(Math.abs(h.returns[k - 1] - expected) < 1e-12, `k=${k}`);
  }
});

test('B · D - 가격통화 USD(미국 주식)는 환율을 곱한다 - 원화 가격 = 달러 가격 × 달러당 원화', async () => {
  const s = mixedPortfolio(freshSandbox());
  const fx = fxResult(DATES);
  s.setUsdKrwRates(fx);
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'AAPL');
  assert.strictEqual(h.priceCcy, 'USD');
  h.datedCloses.forEach((d, i) => assert.strictEqual(d.close, h.datedClosesLocal[i].close * fx.rates.get(d.date)));
  assert.strictEqual(h.fxStatus, 'OK');
});

test('D - Exposure Master의 미국 상장 ETF(QQQM · priceCcy USD)도 환율을 곱한다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'QQQM', ticker: 'QQQM', category: 'ETF', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 })];
  s.setDailyCloses('QQQM', series(N, 100, 0.8, 0.7));
  s.setDailyCloses('^NDX', series(N, 15000, 0.9, 0.8));
  s.setTickerMaster(LISTED);
  const fx = fxResult(DATES);
  s.setUsdKrwRates(fx);
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'QQQM');
  assert.strictEqual(h.priceCcy, 'USD');
  assert.strictEqual(h.datedCloses[5].close, h.datedClosesLocal[5].close * fx.rates.get(h.datedCloses[5].date));
});

test('B · C · E - 원화 가격 종목(국내 주식 · 국내 상장 해외 ETF)에는 환율을 곱하지 않는다', async () => {
  const s = mixedPortfolio(freshSandbox());
  s.setUsdKrwRates(fxResult(DATES));
  const m = await s.computeAdvancedRiskMetrics();
  for (const t of ['005930.KS', '133690.KS']) {
    const h = byTicker(m, t);
    assert.strictEqual(h.priceCcy, 'KRW', t);
    assert.strictEqual(h.fxStatus, null, t);
    assert.deepStrictEqual(plain(h.datedCloses), plain(h.datedClosesLocal), t);
  }
});

test('E · F - 환율이 없는 날은 빼고, 채우거나 추정하지 않는다', async () => {
  const s = mixedPortfolio(freshSandbox());
  const drop = [DATES[10], DATES[11], DATES[100]];
  s.setUsdKrwRates(fxResult(DATES, { drop }));
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'AAPL');
  const dates = h.datedCloses.map((d) => d.date);
  drop.forEach((d) => assert.ok(!dates.includes(d), d));
  assert.strictEqual(h.datedCloses.length, h.datedClosesLocal.length - drop.length);
  // 포트폴리오 공통 거래일에서도 빠진다(원화 종목에는 그 날짜가 있어도).
  drop.forEach((d) => assert.ok(!m.commonDates.includes(d), d));
  // 빠진 날의 다음 수익률은 두 공통일 사이 변화다(0%로 만들지 않는다).
  const i = dates.indexOf(DATES[12]);
  const expected = h.datedCloses[i].close / h.datedCloses[i - 1].close - 1;
  assert.ok(Math.abs(h.returns[i - 1] - expected) < 1e-12);
});

test('G - 환율이 가격보다 먼저 끝나면 그 뒤 가격은 쓰지 않고, 환율 기준일 = 공통 마지막 날', async () => {
  const s = mixedPortfolio(freshSandbox());
  const lastFx = DATES[N - 6];
  s.setUsdKrwRates(fxResult(DATES, { drop: DATES.slice(N - 5) }));
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(byTicker(m, 'AAPL').fxLastDate, lastFx);
  assert.strictEqual(m.fxBasis.basisDate, lastFx);
  assert.strictEqual(m.fxBasis.fxEndDate, lastFx);
  assert.strictEqual(m.commonDates[m.commonDates.length - 1], lastFx);
  assert.strictEqual(m.metricStatus.var.observations, m.commonDates.length);
  assert.ok(s.riskFxBasisNote(m).includes(`환율 기준일: ${lastFx}`));
});

test('H · I - 베타와 기술 지표는 환율과 무관하다(현지통화 조정주가 · 원주가 그대로)', async () => {
  const flat = mixedPortfolio(freshSandbox());           // 기본 주입: 일정한 환율 → 환산해도 달러 수익률과 같다
  const moving = mixedPortfolio(freshSandbox());
  moving.setUsdKrwRates(fxResult(DATES));
  const a = byTicker(await flat.computeAdvancedRiskMetrics(), 'AAPL');
  const mMoving = await moving.computeAdvancedRiskMetrics();
  const b = byTicker(mMoving, 'AAPL');
  assert.strictEqual(typeof a.beta, 'number');
  assert.strictEqual(b.beta, a.beta);
  assert.strictEqual(b.betaObservationCount, a.betaObservationCount);
  for (const k of ['rsi14', 'ma20', 'ma60', 'ma120', 'week52High', 'week52DrawdownPct', 'trendLabel', 'volumeSpike']) {
    assert.strictEqual(b[k], a[k], k);
  }
  assert.deepStrictEqual(plain(b.closesRaw), plain(a.closesRaw));
  // 통계 지표는 실제로 원화 기준으로 바뀐다(환율이 움직이므로).
  assert.notStrictEqual(b.mdd, undefined);
  assert.ok(b.returns.some((r, i) => Math.abs(r - a.returns[i]) > 1e-9));
});

test('J - 원화 종목만 있으면 환율 자료를 읽지 않고 결과도 그대로다', async () => {
  const build = () => {
    const s = freshSandbox();
    s.state.assets = [makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })];
    s.setDailyCloses('005930.KS', series(N, 100000, 1.2, 1.0));
    s.setDailyCloses('^KS11', series(N, 2500, 1.0, 0.9));
    s.setTickerMaster(LISTED);
    return s;
  };
  const s1 = build();
  let calls = 0;
  s1.getRiskUsdKrwRates = async () => { calls++; return { status: 'SOURCE_UNAVAILABLE', rates: null, endDate: null }; };
  const m1 = await s1.computeAdvancedRiskMetrics();
  const m2 = await build().computeAdvancedRiskMetrics();
  assert.strictEqual(calls, 0);
  assert.strictEqual(m1.fxBasis, null);
  for (const k of ['portfolioVolatilityPct', 'var95Pct', 'cvarPct', 'portfolioMDDPct', 'sortino', 'portfolioBeta', 'riskScore']) {
    assert.strictEqual(m1[k], m2[k], k);
  }
});

test('K - 환율 자료를 쓸 수 없으면 달러 수익률로 대신하지 않고 기존 데이터 품질 상태로 처리한다', async () => {
  for (const status of ['SOURCE_UNAVAILABLE', 'DATA_QUALITY_FAILED']) {
    const s = mixedPortfolio(freshSandbox());
    s.setUsdKrwRates({ status, rates: null, endDate: null });
    const m = await s.computeAdvancedRiskMetrics();
    const h = byTicker(m, 'AAPL');
    assert.strictEqual(h.returns, null, status);
    assert.strictEqual(h.datedCloses, null, status);
    assert.strictEqual(h.fxStatus, status);
    assert.strictEqual(h.dataStatus, status);
    assert.strictEqual(typeof h.beta, 'number', '베타는 환율이 필요 없다');
    assert.strictEqual(m.portfolioVolatilityPct, null);
    assert.strictEqual(m.metricStatus.volatility.status, 'UNAVAILABLE');
    assert.strictEqual(m.metricStatus.volatility.reason, status);
    assert.strictEqual(m.fxBasis.applied, false);
    assert.ok(s.riskFxBasisNote(m).includes('환율 자료를 불러오지 못해'));
  }
});

test('K - 정적 JSON 검사: 형식 · 중복 · 역순 · 미래 날짜 · 0 이하 · 끝일 불일치는 전부 거부', () => {
  const s = freshSandbox();
  const ok = { endDate: '2026-09-11', rates: [['2026-09-10', 1345.63], ['2026-09-11', 1340.3]] };
  const good = s.parseUsdKrwDataset(ok, '2026-09-19');
  assert.strictEqual(good.status, 'OK');
  assert.strictEqual(good.rates.get('2026-09-11'), 1340.3);
  const bads = [
    null, {}, { rates: [] },
    { rates: [['2026-09-11', 1340.3], ['2026-09-11', 1341]] },
    { rates: [['2026-09-11', 1340.3], ['2026-09-10', 1341]] },
    { rates: [['2026-09-20', 1340.3]] },
    { rates: [['2026-09-11', 0]] },
    { rates: [['2026-09-11', -5]] },
    { rates: [['2026-09-11', 'ND']] },
    { rates: [['11-SEP-26', 1340.3]] },
    { endDate: '2026-09-12', rates: [['2026-09-11', 1340.3]] }
  ];
  bads.forEach((b, i) => {
    const r = s.parseUsdKrwDataset(b, '2026-09-19');
    assert.strictEqual(r.status, 'DATA_QUALITY_FAILED', `case ${i}`);
    assert.strictEqual(r.rates, null, `case ${i}`);
  });
  // 게시가 여러 번 끊기면(OP-4, 21일 초과) 오래됨으로 진단하되 값은 쓴다.
  const stale = s.parseUsdKrwDataset(ok, '2026-10-05');
  assert.strictEqual(stale.status, 'DATA_STALE');
  assert.ok(stale.rates instanceof Map || stale.rates.size === 2);
});

test('K - 환율 자료가 오래됨(DATA_STALE)이면 값은 쓰고 종목 상태로 진단한다', async () => {
  const s = mixedPortfolio(freshSandbox());
  s.setUsdKrwRates(Object.assign(fxResult(DATES), { status: 'DATA_STALE' }));
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'AAPL');
  assert.ok(Array.isArray(h.returns));
  assert.strictEqual(h.fxStatus, 'DATA_STALE');
  assert.strictEqual(m.fxBasis.status, 'DATA_STALE');
  assert.strictEqual(m.fxBasis.applied, true);
});

test('저장소의 data/fx/usdkrw-h10.json은 앱 검사를 통과하고 게시 수치와 일치한다', () => {
  const s = freshSandbox();
  const json = require('../data/fx/usdkrw-h10.json');
  const r = s.parseUsdKrwDataset(json, '2026-09-19');
  assert.notStrictEqual(r.rates, null);
  assert.strictEqual(r.endDate, json.endDate);
  assert.strictEqual(json.startDate, '2000-01-03');
  assert.strictEqual(json.validCount, json.rates.length);
  assert.strictEqual(json.rowCount, json.validCount + json.ndCount);
  assert.strictEqual(json.quote, 'KRW per USD');
  assert.ok(/Federal Reserve/.test(json.source));
  assert.ok(/[Pp]ublic domain/.test(json.license));
});

test('[후속 Issue 1] 가격은 최신이고 환율 자료만 오래됐으면 환율 기준일을 보여준다(가격 날짜를 쓰지 않는다)', () => {
  const s = freshSandbox();
  const r = new Array(250).fill(0.001);
  const fxOnly = { name: 'APPLE', dataStatus: 'DATA_STALE', returns: r, priceCcy: 'USD', fxStatus: 'DATA_STALE', fxLastDate: '2026-08-21', dataQuality: { stale: false, lastDate: '2026-09-18' } };
  assert.strictEqual(s.holdingDataStatusShortText(fxOnly), '환율 자료 오래됨 (환율 기준일 2026-08-21)');
  assert.ok(!s.holdingDataStatusShortText(fxOnly).includes('2026-09-18'));
  // 가격 자체가 오래된 경우(원화 종목 · 달러 종목 모두)는 기존 표시 그대로 - 가격의 마지막 날짜.
  const priceStale = { name: '삼성전자', dataStatus: 'DATA_STALE', returns: r, priceCcy: 'KRW', fxStatus: null, dataQuality: { stale: true, lastDate: '2026-08-01' } };
  assert.strictEqual(s.holdingDataStatusShortText(priceStale), '기록 오래됨 (마지막 2026-08-01)');
  const both = Object.assign({}, fxOnly, { dataQuality: { stale: true, lastDate: '2026-08-01' } });
  assert.strictEqual(s.holdingDataStatusShortText(both), '기록 오래됨 (마지막 2026-08-01)');
});

test('[후속 Issue 1] 실제 계산 경로: 환율만 오래됨 → 종목 상태 표시가 환율 기준일을 쓴다(계산 값은 그대로)', async () => {
  const s = mixedPortfolio(freshSandbox());
  const fx = Object.assign(fxResult(DATES), { status: 'DATA_STALE' });
  s.setUsdKrwRates(fx);
  const m = await s.computeAdvancedRiskMetrics();
  const h = byTicker(m, 'AAPL');
  // fixture 가격 날짜가 과거라 가격도 오래됨으로 판정된다 - 이때는 기존대로 가격 날짜를 보여준다.
  assert.strictEqual(h.dataQuality.stale, true);
  assert.ok(s.holdingDataStatusShortText(h).startsWith('기록 오래됨 (마지막 '));
  // 가격이 최신인 상황을 재현(가격 품질 판정만 바꿈) - 환율 기준일이 보인다.
  const fresh = Object.assign({}, h, { dataQuality: Object.assign({}, h.dataQuality, { stale: false }) });
  assert.strictEqual(s.holdingDataStatusShortText(fresh), `환율 자료 오래됨 (환율 기준일 ${h.fxLastDate})`);
});

test('[후속 Issue 2] "환율 기준일: 날짜"는 줄바꿈되지 않는 한 덩어리로 출력된다', async () => {
  const s = mixedPortfolio(freshSandbox());
  s.setUsdKrwRates(fxResult(DATES));
  const m = await s.computeAdvancedRiskMetrics();
  const note = s.riskFxBasisNote(m);
  assert.ok(note.includes(`<span class="whitespace-nowrap">환율 기준일: ${m.fxBasis.basisDate}</span> (미국 연방준비제도 H.10)`), note);
  /* [UX-8② 기대값 갱신] 375px에서 「시장 민감도(베타)」가 여는 괄호에서 갈라지던 문제를
   * 앱의 기존 패턴(whitespace-nowrap)으로 묶었다 - 문구 자체는 그대로다. */
  assert.ok(note.includes('<span class="whitespace-nowrap">시장 민감도(베타)</span>는 달러 가격 기준'));
  assert.ok(note.replace(/<[^>]+>/g, '').includes('시장 민감도(베타)는 달러 가격 기준'));
  const detail = s.buildIndividualRiskDetailHtml(byTicker(m, 'AAPL'), 10);
  assert.ok(detail.includes(`<span class="whitespace-nowrap">환율 기준일: ${byTicker(m, 'AAPL').fxLastDate}</span>`), detail);
});
