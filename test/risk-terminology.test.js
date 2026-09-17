// [용어 정비] Macro·Risk 설명 문구가 계산 정의와 모순되지 않는지 고정한다.
// 실행: node --test test/risk-terminology.test.js  (또는 npm test)
//
// risk-engine/risk-rules가 "값과 판정"을 고정한다면, 이 파일은 그 값을 설명하는 "문장"이
// 정의를 벗어나지 않는지만 본다 - 계산 함수는 호출만 하고 바꾸지 않는다.
// 화면 전체(카드/팝업/툴팁)의 금지 표현 검사는 e2e/97이 맡는다.

const assert = require('node:assert');
const { test } = require('node:test');
const { loadRiskSandbox } = require('./risk-sandbox.js');

function sandbox() {
  const s = loadRiskSandbox();
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  return s;
}

// buildRiskDiagnosisLine()이 읽는 필드만 담은 metrics 스텁. maxKey 요인을 90점으로 올려 분기를 고른다.
function metrics(maxKey, over) {
  const subScores = { concentration: 10, volatility: 10, drawdown: 10, market: 10, correlation: 10, technical: 10, [maxKey]: 90 };
  return Object.assign({
    subScores, topWeight: 40, topHolding: { name: '테스트종목', riskContributionPct: null },
    portfolioVolatilityPct: 18.5, var95Pct: -2.8, var95KRW: -280000, portfolioMDDPct: -21,
    portfolioBeta: 1.08, topCorrelationPair: ['가', '나'], weightedAvgCorrelation: 0.74,
    sectorExposure: { topSector: '반도체', topSectorWeight: 30 }
  }, over);
}

test('베타가 1 미만이어도 시장 요인 진단이 "더 크게"라고 말하지 않는다', () => {
  const s = sandbox();
  for (const beta of [0.35, 0.6, 0.95, 1.0, 1.08, 1.6]) {
    const line = s.buildRiskDiagnosisLine(metrics('market', { portfolioBeta: beta }));
    assert.ok(!line.includes('더 크게'), `beta ${beta}: ${line}`);
    assert.ok(!line.includes('배 더'), `beta ${beta}: ${line}`);
    assert.ok(line.includes('시장 민감도'), `beta ${beta}: ${line}`);
    assert.ok(line.includes(`약 ${s.fmtNum(beta, 1)}%`), `beta ${beta}: 값이 그대로 인용돼야 한다 - ${line}`);
  }
});

test('하락 요인 진단은 VaR를 최대 손실로 표현하지 않고 부호를 그대로 보여준다', () => {
  const s = sandbox();
  const line = s.buildRiskDiagnosisLine(metrics('drawdown'));
  assert.ok(line.includes('하루 하락 기준선은 -2.8%'), line);
  assert.ok(line.includes('최대낙폭(MDD)은 -21%'), line);
  assert.ok(!/최대 손실|최악/.test(line), line);
  // 드물게 하위 5% 지점이 양수여도 "-"를 지어내지 않는다.
  const up = s.buildRiskDiagnosisLine(metrics('drawdown', { var95Pct: 0.3, var95KRW: 30000, portfolioMDDPct: 0 }));
  assert.ok(up.includes('기준선은 0.3%'), up);
  assert.ok(!up.includes('--'), up);
  // 결측이면 숫자를 만들지 않는다(Phase 39-B 유지).
  assert.strictEqual(s.buildRiskDiagnosisLine(metrics('drawdown', { var95Pct: null })),
    '가격 이력이 부족해 하락 지표(최대낙폭·하루 하락 기준선)를 계산할 수 없습니다.');
});

test('변동성 진단은 계산하지 않은 "시장 평균" 비교를 말하지 않는다', () => {
  const s = sandbox();
  const line = s.buildRiskDiagnosisLine(metrics('volatility'));
  assert.ok(line.includes('변동성(연환산)이 18.5%'), line);
  assert.ok(!line.includes('시장 평균'), line);
});

test('메인 카드의 진단과 점검 항목이 같은 문장을 반복하지 않는다(집중·시장·상관)', () => {
  const s = sandbox();
  const cases = [
    ['concentration', { topWeight: 40, portfolioBeta: 1.0, weightedAvgCorrelation: 0.2 }],
    ['market', { topWeight: 10, portfolioBeta: 1.3, weightedAvgCorrelation: 0.2 }],
    ['correlation', { topWeight: 10, portfolioBeta: 1.0, weightedAvgCorrelation: 0.8 }]
  ];
  for (const [key, over] of cases) {
    const m = metrics(key, over);
    const line = s.buildRiskDiagnosisLine(m);
    const items = [...s.buildRiskActionItems(m)];
    assert.ok(items.length >= 1, key);
    items.forEach((item) => {
      // 문장 단위로 쪼개 진단에 그대로 들어 있는 문장이 없는지 본다.
      item.split('. ').map((x) => x.trim()).filter((x) => x.length > 8)
        .forEach((sentence) => assert.ok(!line.includes(sentence.replace(/\.$/, '')), `${key}: "${sentence}"`));
    });
  }
});

test('거래량 신호 라벨은 매수·매도 주체를 단정하지 않는다(판정 코드와 색은 그대로)', () => {
  const s = sandbox();
  const got = ['outflow', 'inflow', 'quiet', 'neutral', null].map((k) => ({ ...s.flowSignalLabel(k) }));
  assert.deepStrictEqual(got, [
    { label: '거래량 늘며 하락', emoji: '🔴' },
    { label: '거래량 늘며 상승', emoji: '🟢' },
    { label: '거래 한산', emoji: '🟡' },
    { label: '특이 신호 없음', emoji: '🟢' },
    { label: '데이터 부족', emoji: '⚪' }
  ]);
});

test('종목 요약은 판정(색·이모지)은 그대로 두고 행동을 권하지 않는 문장만 쓴다', () => {
  const s = sandbox();
  const cases = [
    [{ rsiState: '과열', trendLabel: '정배열(상승추세)' }, '🟡', 'amber', '확인 필요', '20·60·120일 이동평균이 상승 배열입니다. 최근 짧은 기간에 빠르게 오른 상태입니다.'],
    [{ rsiState: '과매도', trendLabel: '혼조(추세 불분명)' }, '🔵', 'blue', '단기 하락 큼', '이동평균의 방향이 섞여 있습니다. 최근 짧은 기간에 많이 내린 상태입니다.'],
    [{ rsiState: '적정', trendLabel: '역배열(하락추세)' }, '🟡', 'amber', '확인 필요', '20·60·120일 이동평균이 하락 배열입니다.'],
    [{ rsiState: '적정', trendLabel: '정배열(상승추세)' }, '🟢', 'green', '특이 신호 없음', '20·60·120일 이동평균이 상승 배열입니다.']
  ];
  for (const [a, emoji, color, label, text] of cases) {
    const r = s.buildStockStatusSummary(a);
    assert.deepStrictEqual({ ...r.tag }, { emoji, label, color });
    assert.strictEqual(r.summaryText, text);
  }
});

test('매크로 해설 문장은 하루 등락을 "국면"으로 단정하지 않는다(규칙 선택은 그대로)', () => {
  const s = sandbox();
  const inputs = [
    { vix: 35 }, { vix: 22, goldChangePct: 2 }, { vix: 15, usdxChangePct: 0.8 }, { vix: 15, usdxChangePct: -0.8 },
    { vix: 15, ust10yChangePct: 0.2, fxChangePct: 0.2, foreignWeightPct: 40 },
    { vix: 15, ust10yChangePct: -0.2, kospiChangePct: 0.5, fxChangePct: 0 },
    { vix: 15, fxChangePct: -0.3, kospiChangePct: 0.5, ust10yChangePct: 0 },
    { vix: 25, kospiChangePct: -1, fxChangePct: 0, ust10yChangePct: 0 }
  ];
  const causes = inputs.map((i) => s.buildMacroCommentary(i).cause);
  assert.ok(causes[0].startsWith('VIX가 35로 30 이상인 구간입니다.'), causes[0]);
  assert.ok(causes[1].includes('하루 움직임만으로 단정할 수는 없습니다'), causes[1]);
  assert.ok(causes[2].includes('달러 강세 방향'), causes[2]);
  assert.ok(causes[3].includes('달러 약세 방향'), causes[3]);
  assert.ok(s.buildMacroCommentary(inputs[4]).impact.includes('전체의 40%'));
  assert.strictEqual(causes[5], '오늘 미국 금리가 내리고 코스피가 올랐습니다.');
  assert.strictEqual(causes[6], '오늘 원화가 강세 방향으로 움직이고 코스피가 올랐습니다.');
  inputs.forEach((i) => {
    const c = s.buildMacroCommentary(i);
    const all = `${c.cause} ${c.impact} ${c.note}`;
    ['강달러 국면', '약달러 국면', '공포심리', '호재', '우호적인 환경', '유의할 필요', '뚜렷합니다'].forEach((w) =>
      assert.ok(!all.includes(w), `${JSON.stringify(i)}: "${w}"`));
  });
});

test('지표 상세의 꼬리 문장은 함께 볼 점과 겹치는 4개 지표에서 빠지고 지수는 유지된다', () => {
  const s = sandbox();
  ['usdkrw', 'us10y', 'gold', 'usdx', 'vix'].forEach((k) => assert.strictEqual(s.macroMeaningTail(k), null, k));
  ['kospi', 'kosdaq', 'sp500', 'nasdaq', 'dow'].forEach((k) => assert.ok(s.macroMeaningTail(k), k));
});
