// [Phase 2-4 · T1~T4] Risk 정직성 · 진단 표시 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/risk-honesty.test.js
//
// T1 종목별 가격 기록 상태 표시 · T2 관측 수 / VaR 꼬리 표본 수 표시 · T3 환율 미포함 고지 ·
// T4 스트레스 대체 낙폭(fallback) 제거. 계산식은 바꾸지 않았다 - 기존 골든 테스트가 그대로 통과해야 한다.

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./risk-sandbox.js');

const { loadRiskSandbox, makeTestAsset, zigzagCloses, volumes, withDates } = H;

const LISTED = {
  '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자', market: 'KR' },
  'ZZZZ.KS': { exchange: 'KOSPI', nameKr: '테스트Z', market: 'KR' },
  'AAPL': { exchange: 'NASDAQ', nameEn: 'APPLE INC', market: 'US' }
};

function freshSandbox() {
  const s = loadRiskSandbox();
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  return s;
}
const series = (n, start, up, down) => withDates({ closes: zigzagCloses(n, start, up, down), volumes: volumes(n, 1000, 1.0) });

// 코스피 종목 + 나스닥 종합(벤치마크 NASDAQ) 종목 - NASDAQ은 스트레스 낙폭 표에 없는 지수다.
function nasdaqCompositePortfolio(s) {
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'APPLE', ticker: 'AAPL', category: '주식', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 })
  ];
  s.setDailyCloses('005930.KS', series(260, 100000, 1.2, 1.0));
  s.setDailyCloses('AAPL', series(260, 100, 1.1, 0.9));
  s.setDailyCloses('^KS11', series(260, 2500, 1.0, 0.9));
  s.setDailyCloses('^IXIC', series(260, 15000, 0.95, 0.85));
  // [D-2 기대값 갱신 · PM 최종 정책 2026-09-21] 미국 노출 개별주의 시장 지수는 S&P500이다(^IXIC와 같은 시계열 - 베타 값 유지).
  s.setDailyCloses('^GSPC', series(260, 15000, 0.95, 0.85));
  s.setTickerMaster(LISTED);
  // [2차 통합 보완 · PM 결정 ③] 해외 개별주에 기준 지수를 주려면 본국 보통주 근거가 필요하다(시험용).
  s.markHomeCommonListing(['AAPL']);
  return s;
}
function kospiOnlyPortfolio(s) {
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', series(260, 100000, 1.2, 1.0));
  s.setDailyCloses('^KS11', series(260, 2500, 1.0, 0.9));
  s.setTickerMaster(LISTED);
  return s;
}

/* ---------------------------------------------------------------- T4 */

/* [기대값 갱신 사유 · D-7 · PM 승인 2026-09-20] NASDAQ(종합)의 낙폭을 실제로 산출해 표에 넣었다
 * (2020 -30.12 · 2022 -35.49 · docs/closeout/research/index-drawdowns.json). 예전에는 표에 값이
 * 없어 이 지수를 쓰는 종목이 하나라도 있으면 스트레스 전체가 null이었다 - "자료가 없으면 만들지
 * 않는다"는 원칙은 그대로이고, 이제 자료가 생겼으므로 계산된다. */
test('T4 - NASDAQ 종합도 실측 낙폭이 있으므로 스트레스를 계산한다(자료 없는 경우의 거부 규칙은 그대로)', async () => {
  const s = nasdaqCompositePortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  // [D-2 기대값 갱신 · PM 최종 정책 2026-09-21] 미국 노출 → S&P500. 낙폭 상수는 SP500(2020 -33.92 · 2022 -25.43)을 쓴다.
  assert.strictEqual(m.holdings.find((h) => h.ticker === 'AAPL').benchmarkKey, 'SP500');
  assert.ok(m.holdings.every((h) => typeof h.beta === 'number'));
  assert.strictEqual(m.stressStatus.covid2020, null);
  assert.strictEqual(m.stressStatus.rateHike2022, null);
  assert.ok(typeof m.stressLossPct === 'number' && m.stressLossPct < 0);
  assert.ok(typeof m.stressLossPct2022 === 'number' && m.stressLossPct2022 < 0);
  // 표에 없는 지수를 쓰는 종목이 있으면 여전히 만들지 않는다(원칙 유지) - 아래 BENCHMARK_UNRESOLVED 테스트가 고정한다.
});

test('T4 - 낙폭 표에 있는 벤치마크만 있으면 기존 계산(베타 × 실측 낙폭)이 그대로다', async () => {
  const s = kospiOnlyPortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  assert.strictEqual(m.stressStatus.covid2020, null);
  assert.strictEqual(m.stressStatus.rateHike2022, null);
  // [기대값 갱신 사유 · D-7] KOSPI 상수를 실측값으로 맞췄다(-35.7 → -35.71 · -28.6 → -27.89). 계산식은 그대로다.
  assert.strictEqual(Number(m.stressLossPct.toFixed(9)), Number((h.beta * -35.71).toFixed(9)));
  assert.strictEqual(Number(m.stressLossPct2022.toFixed(9)), Number((h.beta * -27.89).toFixed(9)));
});

test('T4 - 기준 지수를 확인할 수 없으면 사유는 BENCHMARK_UNRESOLVED(기존 null 처리 유지)', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: '미등록', ticker: 'QQQQ9', category: '주식', isDomestic: '해외', currency: 'USD', quantity: 1, buyPrice: 100, currentPrice: 100 })];
  s.setDailyCloses('QQQQ9', series(260, 100, 1.1, 0.9));
  s.setTickerMaster(LISTED);
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.stressLossPct, null);
  assert.strictEqual(m.stressStatus.covid2020, 'BENCHMARK_UNRESOLVED');
  // 사유 없이 부르던 기존 문구는 그대로다.
  assert.strictEqual(s.stressLossValueText(null, null), '계산할 수 없음 (기준 지수나 시장 민감도를 확인할 수 없는 종목 포함)');
});

test('T4 - 엔진 소스에 대체 낙폭(-34 / -28 · fallbackDrop)이 남아 있지 않다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '09-price-fx-risk-engine.js'), 'utf8');
  assert.ok(!/computeStressScenario\([^)]*,\s*-\d/.test(src));
  assert.ok(!/\?\?\s*fallbackDrop/.test(src));
});

/* ---------------------------------------------------------------- T2 */

test('T2 - VaR 꼬리 관측 수는 실제 계산에 쓴 하위 5% 개수이고, 관측 수는 metricStatus 값 그대로다', async () => {
  const s = kospiOnlyPortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  const obs = m.metricStatus.var.observations;
  assert.strictEqual(obs, m.dataSufficiency.commonReturnCount);
  assert.strictEqual(m.varTailObservationCount, Math.max(1, Math.floor(obs * 0.05)));
  const note = s.riskObservationBasisNote(m);
  assert.ok(note.includes(`최근 ${obs}거래일`), note);
  assert.ok(note.includes(`${m.varTailObservationCount}일을 기준`), note);
});

test('T2 - 공통 거래일이 부족하면 꼬리 수는 null이고, 부족하다는 사실만 실제 관측 수로 알린다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '테스트Z', ticker: 'ZZZZ.KS', quantity: 10, buyPrice: 10000, currentPrice: 10000 })
  ];
  s.setDailyCloses('005930.KS', series(260, 100000, 1.2, 1.0));
  s.setDailyCloses('ZZZZ.KS', series(60, 10000, 1.2, 1.0));
  s.setDailyCloses('^KS11', series(260, 2500, 1.0, 0.9));
  s.setTickerMaster(LISTED);
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.var95Pct, null);
  assert.strictEqual(m.varTailObservationCount, null);
  const note = s.riskObservationBasisNote(m);
  assert.ok(note.includes(`${m.metricStatus.var.observations}거래일이라`), note);
  assert.ok(note.includes('120거래일보다 적어'), note);
  assert.ok(!note.includes('하락이 가장 컸던'), note);
});

test('T2 - 관측 정보가 없는 결과에는 문구를 만들지 않는다(추정하지 않음)', () => {
  const s = freshSandbox();
  assert.strictEqual(s.riskObservationBasisNote({}), '');
  assert.strictEqual(s.riskObservationBasisNote({ metricStatus: { var: { status: 'AVAILABLE', observations: null } } }), '');
});

/* ---------------------------------------------------------------- T1 */

test('T1 - 종목 상태 표시는 엔진의 dataStatus를 그대로 쓰고 내부 코드를 노출하지 않는다', () => {
  const s = freshSandbox();
  const r = (n) => new Array(n).fill(0.001);
  const ok = { name: '정상', dataStatus: 'OK', returns: r(250) };
  const stale = { name: '오래됨', dataStatus: 'DATA_STALE', returns: r(250), dataQuality: { lastDate: '2026-08-01' } };
  const failed = { name: '실패', dataStatus: 'FETCH_FAILED', returns: null };
  const noAdj = { name: '조정없음', dataStatus: 'SOURCE_UNAVAILABLE', returns: null };
  const short = { name: '짧음', dataStatus: 'OK', returns: r(59) };
  assert.strictEqual(s.holdingDataStatusShortText(ok), '정상');
  assert.strictEqual(s.holdingDataStatusShortText(stale), '기록 오래됨 (마지막 2026-08-01)');
  assert.strictEqual(s.holdingDataStatusShortText(failed), '시세 없음');
  assert.strictEqual(s.holdingDataStatusShortText(noAdj), '비교 자료 없음');
  assert.strictEqual(s.holdingDataStatusShortText(short), '기록 짧음 (59거래일)');
  // 엔진 상태는 바꾸지 않는다 - 표시용 판정만 한다.
  assert.strictEqual(short.dataStatus, 'OK');

  const allOk = s.riskHoldingStatusNoteHtml({ holdings: [ok, { ...ok, name: '정상2' }] });
  assert.ok(allOk.includes('2개 모두 가격 기록을 정상적으로'), allOk);
  const flagged = s.riskHoldingStatusNoteHtml({ holdings: [ok, stale, failed, noAdj, short] });
  assert.ok(flagged.includes('확인이 필요한 종목 4개 (전체 5개 중)'), flagged);
  assert.ok(!flagged.includes('>정상<'), flagged);
  for (const code of ['DATA_STALE', 'FETCH_FAILED', 'SOURCE_UNAVAILABLE', 'INSUFFICIENT_HISTORY']) {
    assert.ok(!flagged.includes(code), code);
  }
});

test('T1 - 실제 계산 결과의 종목에도 같은 표시가 붙는다(짧은 이력 종목)', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '테스트Z', ticker: 'ZZZZ.KS', quantity: 10, buyPrice: 10000, currentPrice: 10000 })
  ];
  s.setDailyCloses('005930.KS', series(260, 100000, 1.2, 1.0));
  s.setDailyCloses('ZZZZ.KS', series(60, 10000, 1.2, 1.0));
  s.setDailyCloses('^KS11', series(260, 2500, 1.0, 0.9));
  s.setTickerMaster(LISTED);
  const m = await s.computeAdvancedRiskMetrics();
  const z = m.holdings.find((h) => h.ticker === 'ZZZZ.KS');
  // fixture 날짜가 과거라 두 종목 모두 "오래됨"이 먼저 표시된다(엔진 우선순위 그대로).
  assert.strictEqual(s.holdingDataStatusForDisplay(z), z.dataStatus);
  const html = s.buildIndividualRiskDetailHtml(z, 10);
  assert.ok(html.includes('data-holding-data-status'), html);
});

/* ---------------------------------------------------------------- T3 */

test('T3 - priceCcy: 원화 종목 KRW · 달러 종목 USD · 국내 상장 ETF는 기초자산과 무관하게 KRW', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 50, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: 'APPLE', ticker: 'AAPL', category: '주식', isDomestic: '해외', currency: 'USD', quantity: 10, buyPrice: 100, currentPrice: 100 }),
    makeTestAsset({ name: 'TIGER 미국나스닥100', ticker: '133690', category: 'ETF', isDomestic: '해외', currency: 'KRW', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  // [T6] 달러 종목의 원화 기준 환산 여부를 보려면 가격 이력이 있어야 한다.
  s.setDailyCloses('AAPL', series(260, 100, 1.1, 0.9));
  s.setTickerMaster(LISTED);
  const m = await s.computeAdvancedRiskMetrics();
  const ccy = Object.fromEntries(m.holdings.map((h) => [h.ticker, h.priceCcy]));
  assert.strictEqual(ccy['005930.KS'], 'KRW');
  assert.strictEqual(ccy.AAPL, 'USD');
  assert.strictEqual(ccy['133690.KS'], 'KRW');
  // [T6 · §44 44-15] Phase 2-4의 "환율 미포함" 고지는 실제 계산 정의(원화 환산) 문구로 바뀌었다.
  const note = s.riskFxBasisNote(m);
  assert.ok(note.includes('달러로 거래되는 종목 1개'), note);
  assert.ok(note.includes('달러 가격과 원/달러 환율을 함께 반영한 원화 가치 변동'), note);
  assert.ok(note.includes(`환율 기준일: ${m.fxBasis.basisDate}`), note);
  for (const bad of ['환율 위험이 없', '환율 위험이 낮', '포함되지 않습니다', '정확', '개선']) assert.ok(!note.includes(bad), bad);
  // 종목 상세: 달러 종목에만 붙는다.
  assert.ok(s.buildIndividualRiskDetailHtml(m.holdings.find((h) => h.ticker === 'AAPL'), 10).includes('data-holding-fx-note'));
  assert.ok(!s.buildIndividualRiskDetailHtml(m.holdings.find((h) => h.ticker === '133690.KS'), 10).includes('data-holding-fx-note'));
});

test('T3 - Exposure Master에 확정된 종목은 원장의 priceCcy를 쓴다(QQQM · USD)', () => {
  const s = freshSandbox();
  s.setTickerMaster(LISTED);
  assert.strictEqual(s.resolveRiskPriceCcy({ ticker: 'QQQM', name: 'QQQM', category: 'ETF', currency: 'USD' }), 'USD');
  assert.strictEqual(s.resolveRiskPriceCcy({ ticker: '005930', name: '삼성전자', category: '주식', currency: 'KRW' }), 'KRW');
});

test('T3 - 원화 종목만 있으면 환율 고지를 만들지 않는다', async () => {
  const s = kospiOnlyPortfolio(freshSandbox());
  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(s.riskFxBasisNote(m), '');
  assert.strictEqual(m.fxBasis, null);
});

test('[T6 후속 · Issue 11-1] 상태 목록 줄은 종목명을 말줄임하지 않고, 공간이 모자라면 상태를 다음 줄로 내린다', () => {
  const s = freshSandbox();
  const html = s.riskHoldingStatusNoteHtml({ holdings: [{ name: 'APPLE INC', dataStatus: 'DATA_STALE', returns: new Array(250).fill(0.001), priceCcy: 'USD', fxStatus: 'DATA_STALE', fxLastDate: '2026-08-21', dataQuality: { stale: false } }] });
  assert.ok(html.includes('<li class="flex flex-wrap justify-between gap-x-2" data-holding-status-row>'), html);
  assert.ok(!html.includes('truncate'), html);
  assert.ok(html.includes('>APPLE INC</span>'), html);
  assert.ok(html.includes('환율 자료 오래됨 (환율 기준일 2026-08-21)'), html);
});
