// Inflation Transformation Layer(js/20-inflation-transform.js) 회귀 테스트.
// 실행: node --test test/inflation-transform.test.js
// DOM/state 의존이 전혀 없는 순수 함수라 merge.test.js의 가짜 DOM 스텁 없이 바로 require()한다.

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const mod = require(path.join(__dirname, '..', 'js', '20-inflation-transform.js'));
const { convertNominalToReal, convertRealToNominal, applyInflationToMilestone, applyInflationToResult } = mod;

test('Test A - inflation=0이면 real은 nominal과 정확히 일치해야 한다', () => {
  const real = convertNominalToReal(500000000, 0, 20);
  assert.strictEqual(real, 500000000);
});

test('Test B - 단순 계산 검증(500m, 2.5%, 20년)', () => {
  const real = convertNominalToReal(500000000, 0.025, 20);
  const expected = 500000000 / Math.pow(1.025, 20);
  assert.strictEqual(real, expected);
});

test('Test C - 10년(100m, 3%)', () => {
  const real = convertNominalToReal(100000000, 0.03, 10);
  const expected = 100000000 / Math.pow(1.03, 10);
  assert.strictEqual(real, expected);
});

test('Test D - Percentile 변환 후에도 순서가 유지되어야 한다', () => {
  const milestone = { year: 20, mean: 900000000, p10: 300000000, p25: 500000000, p50: 800000000, p75: 1200000000, p90: 1800000000 };
  const converted = applyInflationToMilestone(milestone, 0.025);
  const { p10, p25, p50, p75, p90 } = converted.real;
  assert.ok(p10 < p25 && p25 < p50 && p50 < p75 && p75 < p90, 'inflation 변환 후 percentile 순서가 깨졌다');
});

test('Test E - inflation=0이면 Monte Carlo 결과(milestones) 전체가 nominal과 exact match해야 한다', () => {
  const fakeResult = {
    mode: 'official', simulations: 1000, years: 20, assets: 2,
    milestones: [
      { year: 5, mean: 1e8, p10: 5e7, p25: 7e7, p50: 1e8, p75: 1.3e8, p90: 1.7e8 },
      { year: 20, mean: 5e8, p10: 2e8, p25: 3.5e8, p50: 5e8, p75: 7e8, p90: 1e9 }
    ]
  };
  const converted = applyInflationToResult(fakeResult, 0);
  converted.milestones.forEach((m, idx) => {
    const orig = fakeResult.milestones[idx];
    assert.strictEqual(m.real.p10, orig.p10);
    assert.strictEqual(m.real.p50, orig.p50);
    assert.strictEqual(m.real.p90, orig.p90);
  });
  // 원본 result 객체는 변경되지 않아야 한다(순수 함수 - 부작용 없음)
  assert.strictEqual(fakeResult.milestones[0].real, undefined, 'applyInflationToResult가 원본 객체를 변형(mutate)했다');
});

test('Real→Nominal 왕복 변환이 원래 값으로 정확히 돌아와야 한다', () => {
  const real = 300000000;
  const nominal = convertRealToNominal(real, 0.025, 20);
  const roundTrip = convertNominalToReal(nominal, 0.025, 20);
  assert.ok(Math.abs(roundTrip - real) < 1e-6, '왕복 변환 오차가 너무 크다');
});

/* [FUTURE-P1 Phase 2-C] 계좌 범위(general/taxAdvantaged/combined)도 같은 규칙으로 실질 환산된다.
 * 세 범위는 서로 독립적인 명목값 원본이므로, 각 milestone이 자기 year로 딱 한 번만 나뉜다
 * (한 범위의 결과를 다른 범위에 다시 적용하는 중복 할인이 일어나지 않는다). */
test('Test F - accountScopes의 세 범위가 각각 자기 year로 한 번씩만 실질 환산된다', () => {
  const scopeMilestones = (base) => [
    { year: 5, mean: base, p10: base * 0.5, p25: base * 0.7, p50: base, p75: base * 1.3, p90: base * 1.7 },
    { year: 20, mean: base * 5, p10: base * 2, p25: base * 3.5, p50: base * 5, p75: base * 7, p90: base * 10 }
  ];
  const result = {
    mode: 'official', simulations: 1000, years: 20, assets: 2,
    milestones: scopeMilestones(1e8),
    accountScopes: {
      general: scopeMilestones(1e8), taxAdvantaged: scopeMilestones(4e7), combined: scopeMilestones(1.4e8)
    }
  };
  const rate = 0.025;
  const converted = applyInflationToResult(result, rate);
  ['general', 'taxAdvantaged', 'combined'].forEach((scope) => {
    converted.accountScopes[scope].forEach((m, idx) => {
      const orig = result.accountScopes[scope][idx];
      // 할인은 정확히 (1+i)^year 한 번 - 두 번 적용되면 이 값보다 작아진다.
      assert.ok(Math.abs(m.real.p50 - orig.p50 / Math.pow(1 + rate, orig.year)) < 1e-6,
        `${scope} ${orig.year}년 실질 환산이 어긋났다(중복 적용 의심)`);
      assert.strictEqual(m.p50, orig.p50, '명목값이 변형되면 안 된다');
    });
  });
  assert.strictEqual(result.accountScopes.general[0].real, undefined, '원본 accountScopes를 mutate했다');
});

test('Test G - accountScopes가 없으면 반환 객체에도 그 필드가 생기지 않는다(기존 호출부 무영향)', () => {
  const result = { milestones: [{ year: 5, mean: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1 }] };
  const converted = applyInflationToResult(result, 0.02);
  assert.strictEqual(converted.accountScopes, undefined);
});
