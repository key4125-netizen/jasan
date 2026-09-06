// [Phase 38] 개별 종목 Risk Rule(js/10-risk-translation-alerts.js) 회귀 테스트.
// 실행: node --test test/risk-rules.test.js  (또는 npm test)
//
// js/09 테스트(test/risk-engine.test.js)가 "포트폴리오 점수가 어떻게 계산되는가"를 고정한다면,
// 이 파일은 "어떤 종목이 왜 리스크로 분류되는가"(4개 Rule의 경계값)를 고정한다.
//
// e2e/39와의 역할 분리:
//   e2e/39 = Phase 35 정책 검증(행동 지시 금지 문구 / 매크로 결측 표기 / 모바일 가독성) - 화면 담당
//   이 파일 = 그 화면에 왜 그런 판정이 뜨는가 - 계산/분류 담당
//   두 파일이 같은 것을 두 번 검사하지 않는다.
//
// PM 결정(Phase 36 Q2/Q3): RSI14와 거래량 급증은 향후 제거 예정이지만 이번 Phase에서는 바꾸지 않는다.
// 아래 값들은 "이래야 옳다"가 아니라 "지금 이렇다"이며, Phase 42가 무엇을 바꾸는지 diff로 드러내는 것이 목적이다.

const assert = require('node:assert');
const { test } = require('node:test');
const H = require('./risk-sandbox.js');

const { loadRiskSandbox, makeTestAsset, flatCloses, rsiCloses, volumes } = H;

function freshSandbox() {
  const s = loadRiskSandbox();
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  return s;
}

const plain = (v) => JSON.parse(JSON.stringify(v));

// buildIndividualRiskTags()가 실제로 읽는 필드만 담은 holding 스텁.
// 기본값은 "아무 신호도 없는 정상 종목"이라, 각 테스트는 검사하려는 필드 하나만 덮어쓴다.
function holding(over) {
  return Object.assign({
    ticker: 'A.KS', name: 'A', weight: 1, hasData: true,
    rsi14: 50, rsiState: '적정', trendLabel: '정배열(상승추세)',
    week52DrawdownPct: -5, volumeSpike: false, flowSignal: 'neutral'
  }, over);
}

/* ==========================================================================
 * Rule 1. RSI14 - 임계 70(과열) / 30(과매도)
 *   [Phase 36 §9-1 / PM Q2] 향후 위험점수에서 제거 예정. 지금은 고정만 한다.
 * ======================================================================= */

test('RSI - computeRSI14 계산과 15개 미만 데이터 처리', () => {
  const s = freshSandbox();
  // 최근 14봉 중 상승일 수 / 14 × 100 이 되는 결정적 입력(상승폭 = 하락폭).
  assert.strictEqual(s.computeRSI14(rsiCloses(14)), 100);            // 14일 내내 상승 → avgLoss 0
  assert.strictEqual(s.computeRSI14(rsiCloses(0)), 0);               // 14일 내내 하락
  assert.strictEqual(Number(s.computeRSI14(rsiCloses(7)).toFixed(6)), 50);
  assert.strictEqual(Number(s.computeRSI14(rsiCloses(10)).toFixed(6)), 71.428571);
  assert.strictEqual(Number(s.computeRSI14(rsiCloses(4)).toFixed(6)), 28.571429);
  // 가격 변동이 전혀 없으면 50으로 수렴한다(0/0 방어).
  assert.strictEqual(s.computeRSI14(flatCloses(30, 100)), 50);
  // 데이터가 15개 미만이면 계산하지 않는다.
  assert.strictEqual(s.computeRSI14(flatCloses(14, 100)), null);
  assert.strictEqual(s.computeRSI14(null), null);
});

test('RSI - rsiStateLabel 경계값(70 이상 과열 / 30 이하 과매도)', () => {
  const s = freshSandbox();
  assert.strictEqual(s.rsiStateLabel(69.99), '적정');
  assert.strictEqual(s.rsiStateLabel(70), '과열');
  assert.strictEqual(s.rsiStateLabel(70.01), '과열');
  assert.strictEqual(s.rsiStateLabel(30.01), '적정');
  assert.strictEqual(s.rsiStateLabel(30), '과매도');
  assert.strictEqual(s.rsiStateLabel(29.99), '과매도');
  assert.strictEqual(s.rsiStateLabel(null), null);
  assert.strictEqual(s.rsiStateLabel(undefined), null);
});

test('RSI - 과열만 태그가 되고 과매도는 태그가 되지 않는다', () => {
  const s = freshSandbox();
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ rsiState: '과열' }))), ['단기 과열']);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ rsiState: '과매도' }))), []);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ rsiState: '적정' }))), []);
});

/* ==========================================================================
 * Rule 2. 이동평균 MA20/MA60/MA120 - 정배열 / 역배열 / 혼조
 *   [Phase 36 §9-2] 역배열의 +15 가산 근거는 코드에 없다. 이번 Phase에서 바꾸지 않는다.
 * ======================================================================= */

test('MA - maTrendLabel 3분류(정배열/역배열/혼조)', () => {
  const s = freshSandbox();
  assert.strictEqual(s.maTrendLabel(120, 110, 100), '정배열(상승추세)');
  assert.strictEqual(s.maTrendLabel(100, 110, 120), '역배열(하락추세)');
  assert.strictEqual(s.maTrendLabel(110, 120, 100), '혼조(추세 불분명)');  // 일부만 역배열
  assert.strictEqual(s.maTrendLabel(100, 120, 110), '혼조(추세 불분명)');
  assert.strictEqual(s.maTrendLabel(100, 100, 100), '혼조(추세 불분명)');  // 완전 동일 = 부등호 불성립
  // 셋 중 하나라도 없으면 판정하지 않는다(가격 이력 부족).
  assert.strictEqual(s.maTrendLabel(120, 110, null), null);
  assert.strictEqual(s.maTrendLabel(null, 110, 100), null);
});

test('MA - computeSMA는 기간보다 데이터가 적으면 null이다', () => {
  const s = freshSandbox();
  assert.strictEqual(s.computeSMA(flatCloses(20, 100), 20), 100);
  assert.strictEqual(s.computeSMA(flatCloses(19, 100), 20), null);
  assert.strictEqual(s.computeSMA(flatCloses(119, 100), 120), null);
  assert.strictEqual(s.computeSMA(null, 20), null);
  // 마지막 N개만 평균낸다.
  assert.strictEqual(s.computeSMA([1, 1, 1, 9, 9], 2), 9);
});

test('MA - 역배열만 태그가 되고 정배열/혼조는 태그가 되지 않는다', () => {
  const s = freshSandbox();
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ trendLabel: '역배열(하락추세)' }))), ['추세 이탈']);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ trendLabel: '혼조(추세 불분명)' }))), []);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ trendLabel: '정배열(상승추세)' }))), []);
});

/* ==========================================================================
 * Rule 3. 52주 고점 대비 -30%
 *   [Phase 36 §9-3] 자산군 차등 없이 단일 임계값이다. Phase 41에서 상대낙폭과 통합 검토.
 * ======================================================================= */

test('52주 - 임계값 -30% 경계(부동소수점 포함)', () => {
  const s = freshSandbox();
  const tagged = (dd) => s.buildIndividualRiskTags(holding({ week52DrawdownPct: dd })).length > 0;
  assert.strictEqual(tagged(-10), false);
  assert.strictEqual(tagged(-29.9), false);
  assert.strictEqual(tagged(-29.999999), false);
  assert.strictEqual(tagged(-30), true, '정확히 -30%는 감지된다(<= 비교)');
  assert.strictEqual(tagged(-30.000001), true);
  assert.strictEqual(tagged(-40), true);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ week52DrawdownPct: -30 }))), ['52주 고점대비 급락']);
});

test('52주 - 값이 숫자가 아니면(결측) 감지하지 않는다', () => {
  const s = freshSandbox();
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ week52DrawdownPct: null }))), []);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(holding({ week52DrawdownPct: undefined }))), []);
});

test('52주 - 낙폭은 종가 최고점과 현재가로 계산된다(엔진 경로)', async () => {
  const s = freshSandbox();
  // 고점 200,000 → 현재가 140,000 = 정확히 -30%
  const closes = flatCloses(260, 150000);
  closes[0] = 200000;
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 140000 })];
  s.setDailyCloses('005930.KS', { closes, volumes: volumes(260, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: flatCloses(260, 2500), volumes: volumes(260, 1, 1) });

  const m = await s.computeAdvancedRiskMetrics();
  assert.strictEqual(m.holdings[0].week52High, 200000);
  assert.strictEqual(Number(m.holdings[0].week52DrawdownPct.toFixed(6)), -30);
  assert.ok(s.buildIndividualRiskTags(m.holdings[0]).includes('52주 고점대비 급락'));
});

/* ==========================================================================
 * Rule 4. 거래량 급증 - 20일 평균 거래량의 2배 이상
 *   [Phase 36 §9-4 / PM Q3] 향후 감지 태그에서 제거 예정. 지금은 고정만 한다.
 * ======================================================================= */

test('거래량 - 20일 평균 대비 2.0배 경계', async () => {
  const s0 = freshSandbox();
  // volMA20은 "급증한 당일 거래량 자신"까지 포함한 최근 20개 평균이다(risk-sandbox의 volumes() 주석 참고).
  const spikeAt = async (ratio) => {
    const s = freshSandbox();
    s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
    s.setDailyCloses('005930.KS', { closes: flatCloses(260, 100000), volumes: volumes(260, 1000, ratio) });
    s.setDailyCloses('^KS11', { closes: flatCloses(260, 2500), volumes: volumes(260, 1, 1) });
    const m = await s.computeAdvancedRiskMetrics();
    return m.holdings[0].volumeSpike;
  };
  assert.strictEqual(await spikeAt(1.0), false);
  assert.strictEqual(await spikeAt(1.5), false);
  assert.strictEqual(await spikeAt(1.99), false);
  assert.strictEqual(await spikeAt(2.0), true, '정확히 2.0배는 감지된다(>= 비교)');
  assert.strictEqual(await spikeAt(3.0), true);
  assert.deepStrictEqual(plain(s0.buildIndividualRiskTags(holding({ volumeSpike: true }))), ['거래량 급증']);
});

test('거래량 - 거래량 데이터가 없으면 급증으로 보지 않는다', async () => {
  const s = freshSandbox();
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  s.setDailyCloses('005930.KS', { closes: flatCloses(260, 100000), volumes: null });
  s.setDailyCloses('^KS11', { closes: flatCloses(260, 2500), volumes: volumes(260, 1, 1) });
  const m = await s.computeAdvancedRiskMetrics();

  assert.strictEqual(m.holdings[0].volMA20, null);
  assert.strictEqual(m.holdings[0].lastVolume, null);
  assert.strictEqual(m.holdings[0].volumeSpike, false);
  assert.strictEqual(m.holdings[0].flowSignal, null);
});

/* ==========================================================================
 * 4개 Rule의 조합 / 데이터 부족 처리
 * ======================================================================= */

test('Rule 조합 - OR 조건이라 해당하는 태그가 전부 붙는다', () => {
  const s = freshSandbox();
  const all = s.buildIndividualRiskTags(holding({
    rsiState: '과열', trendLabel: '역배열(하락추세)', week52DrawdownPct: -35, volumeSpike: true
  }));
  assert.deepStrictEqual(plain(all), ['단기 과열', '추세 이탈', '52주 고점대비 급락', '거래량 급증']);
});

test('Rule - 가격 이력이 없는 종목은 안전하게 태그 없음으로 처리된다', () => {
  const s = freshSandbox();
  // hasData=false면 다른 필드가 아무리 위험해 보여도 판정하지 않는다(오탐 방지).
  const risky = { hasData: false, rsiState: '과열', trendLabel: '역배열(하락추세)', week52DrawdownPct: -90, volumeSpike: true };
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(risky)), []);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(null)), []);
  assert.deepStrictEqual(plain(s.buildIndividualRiskTags(undefined)), []);
});

test('태그 → 안내 라벨 - 우선순위 하나만 고르며 Phase 35 문구를 유지한다', () => {
  const s = freshSandbox();
  // 우선순위: 단기 과열 > 52주 급락 > 추세 이탈 > 거래량 급증
  assert.strictEqual(s.buildAssetActionTag(['단기 과열', '52주 고점대비 급락', '추세 이탈', '거래량 급증']), '비중·가격 점검');
  assert.strictEqual(s.buildAssetActionTag(['52주 고점대비 급락', '추세 이탈', '거래량 급증']), '낙폭 점검');
  assert.strictEqual(s.buildAssetActionTag(['추세 이탈', '거래량 급증']), '단기 추세 주의');
  assert.strictEqual(s.buildAssetActionTag(['거래량 급증']), '변동성 확대 주의');
  assert.strictEqual(s.buildAssetActionTag([]), null);
});

/* ==========================================================================
 * 리스크 감지 목록(computeRiskClassifiedAssets) - 가구 병합 + 분류
 * ======================================================================= */

test('감지 목록 - 태그가 있으면 risky, 없으면 safe로 분류된다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    makeTestAsset({ name: '과열종목', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '평온종목', ticker: '000660.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })
  ];
  // 과열종목: 최근 14봉 전부 상승 → RSI 100 → 과열
  s.setDailyCloses('005930.KS', { closes: rsiCloses(14, 1, 100000, 200), volumes: volumes(214, 1000, 1) });
  // 평온종목: 완전 무변동 → RSI 50 → 적정
  s.setDailyCloses('000660.KS', { closes: flatCloses(214, 100000), volumes: volumes(214, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: flatCloses(214, 2500), volumes: volumes(214, 1, 1) });

  s.state.advancedRiskMetrics = await s.computeAdvancedRiskMetrics();
  const { risky, safe } = s.computeRiskClassifiedAssets();

  assert.deepStrictEqual(plain(risky.map((r) => r.asset.name)), ['과열종목']);
  assert.deepStrictEqual(plain(risky[0].tags), ['단기 과열']);
  assert.deepStrictEqual(plain(safe.map((r) => r.asset.name)), ['평온종목']);
});

test('감지 목록 - 신랑/와이프가 나눠 보유해도 한 줄로 병합되고 명의가 합쳐진다', async () => {
  const s = freshSandbox();
  s.state.assets = [
    // 티커 표기가 서로 다르지만(005930 / 005930.KS) 같은 종목이다.
    makeTestAsset({ name: '삼성전자', ticker: '005930', owner: '신랑', quantity: 30, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '삼성전자', ticker: '005930.KS', owner: '와이프', quantity: 20, buyPrice: 100000, currentPrice: 100000 })
  ];
  s.setDailyCloses('005930.KS', { closes: rsiCloses(14, 1, 100000, 200), volumes: volumes(214, 1000, 1) });
  s.setDailyCloses('^KS11', { closes: flatCloses(214, 2500), volumes: volumes(214, 1, 1) });

  s.state.advancedRiskMetrics = await s.computeAdvancedRiskMetrics();
  const { risky } = s.computeRiskClassifiedAssets();

  assert.strictEqual(risky.length, 1, '표기가 달라도 한 줄로 병합되어야 한다');
  assert.strictEqual(risky[0].key, '005930.KS');
  assert.deepStrictEqual(plain(risky[0].owners), ['신랑', '와이프']);
  assert.strictEqual(risky[0].curAmount, 5000000, '가구 합산 평가금액');
});

test('감지 목록 - 진단 결과가 아직 없으면(부팅 직후) 전부 안전으로 보인다', () => {
  const s = freshSandbox();
  s.state.advancedRiskMetrics = null;
  s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
  const { risky, safe } = s.computeRiskClassifiedAssets();
  assert.strictEqual(risky.length, 0);
  assert.strictEqual(safe.length, 1, '계산 전에는 판정하지 않고 다음 렌더링에서 정상 분류된다');
});

test('감지 목록 - 진단 대상이 아닌 자산(현금/부동산/티커없음)은 아예 나오지 않는다', () => {
  const s = freshSandbox();
  s.state.advancedRiskMetrics = null;
  s.state.assets = [
    makeTestAsset({ name: '주식', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 }),
    makeTestAsset({ name: '현금', category: '현금', ticker: 'C.KS', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 }),
    makeTestAsset({ name: '부동산', category: '부동산', ticker: 'R.KS', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 }),
    makeTestAsset({ name: '티커없음', ticker: '', quantity: 1, buyPrice: 1000000, currentPrice: 1000000 })
  ];
  const { risky, safe } = s.computeRiskClassifiedAssets();
  assert.deepStrictEqual(plain(risky.concat(safe).map((x) => x.asset.name)), ['주식']);
});

/* ==========================================================================
 * Rule과 위험점수의 연결 - RSI/거래량이 실제로 종합점수에 영향을 준다
 *   Phase 42가 "참고정보로 강등"할 때 정확히 무엇이 달라지는지 여기서 드러난다.
 * ======================================================================= */

test('Rule → 점수 연결 - RSI 과열이 기술요인을 통해 종합 위험점수를 실제로 올린다', async () => {
  async function scoreWith(closes) {
    const s = freshSandbox();
    s.state.assets = [makeTestAsset({ name: 'A', ticker: '005930.KS', quantity: 10, buyPrice: 100000, currentPrice: 100000 })];
    s.setDailyCloses('005930.KS', { closes, volumes: volumes(closes.length, 1000, 1) });
    s.setDailyCloses('^KS11', { closes: flatCloses(closes.length, 2500), volumes: volumes(closes.length, 1, 1) });
    const m = await s.computeAdvancedRiskMetrics();
    return { technical: m.subScores.technical, riskScore: m.riskScore, rsi: m.holdings[0].rsi14 };
  }
  const hot = await scoreWith(rsiCloses(14, 1, 100000, 200));   // RSI 100 → 과열
  const calm = await scoreWith(rsiCloses(7, 1, 100000, 200));   // RSI 50 → 적정

  assert.strictEqual(hot.rsi, 100);
  assert.strictEqual(calm.rsi, 50);
  assert.strictEqual(hot.technical, 100, 'RSI 100 → 70 + (100-70)*1.5 = 115 → 100으로 클램프');
  assert.strictEqual(calm.technical, 30, 'RSI 30~70 구간은 30점');
  assert.strictEqual(hot.riskScore - calm.riskScore, 7, '기술요인 가중치 10% × (100-30) = 7점 차이');
});

test('Rule → 점수 연결 - 거래량 급증 자체는 종합 점수를 바꾸지 않는다(flowSignal만 반영된다)', () => {
  const s = freshSandbox();
  // computeTechnicalFlowRiskScore는 volumeSpike를 직접 읽지 않고 flowSignal(outflow/inflow)만 본다.
  // 즉 "거래량 급증" 태그는 화면 분류에만 쓰이고, 가격이 함께 ±2% 이상 움직여야 점수에 반영된다.
  const base = { weight: 1, rsi14: 50 };
  assert.strictEqual(s.computeTechnicalFlowRiskScore([Object.assign({}, base, { volumeSpike: true })]), 30);
  assert.strictEqual(s.computeTechnicalFlowRiskScore([Object.assign({}, base, { volumeSpike: false })]), 30);
  assert.strictEqual(s.computeTechnicalFlowRiskScore([Object.assign({}, base, { flowSignal: 'outflow' })]), 45);
});

/* ==========================================================================
 * 외부 데이터 독립성 - 이 테스트 전체가 네트워크 없이 돈다는 사실 자체를 검사한다
 * ======================================================================= */

test('독립성 - 샌드박스에서 네트워크 호출이 발생하면 즉시 실패한다', async () => {
  const s = freshSandbox();
  await assert.rejects(() => s.fetch('https://example.com'), /네트워크 호출이 발생했습니다/);
});

test('독립성 - 가격 이력을 주입하지 않으면 조회 결과가 없다(캐시/API에 기대지 않는다)', async () => {
  const s = freshSandbox();
  assert.strictEqual(await s.getCachedDailyCloses('005930.KS'), null);
  s.setDailyCloses('005930.KS', { closes: flatCloses(30, 100), volumes: volumes(30, 1, 1) });
  assert.strictEqual((await s.getCachedDailyCloses('005930.KS')).closes.length, 30);
  s.clearDailyCloses();
  assert.strictEqual(await s.getCachedDailyCloses('005930.KS'), null);
});
