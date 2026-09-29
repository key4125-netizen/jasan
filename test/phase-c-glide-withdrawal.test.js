/* [PHASE C] 기간별 목표비중(Glide Path)과 인출.
 *
 * 이 파일이 지키는 계약 셋.
 *
 * ① **설정이 없으면 기존 MC와 완전히 같다.** 필드 없음 · undefined · 잘못된 값 세 경우 모두
 *    4개 milestone × 6통계(mean · p10 · p25 · p50 · p75 · p90)가 strictEqual이어야 한다(L2).
 *    Glide · 인출은 난수를 쓰지 않으므로 RNG 소비량도 그대로다.
 *
 * ② **시간축은 상대 연차뿐이다.** 달력 연도를 쓰지 않는다 - MC 엔진은 달력을 모르고(m=1이 실행
 *    다음 달이라) 달력으로 저장하면 같은 설정이 실행일마다 다른 결과를 낸다.
 *    startYearNo는 1-based이고 yIdx = floor((m-1)/12)와 `startYearNo - 1`로 대응한다.
 *
 * ③ **잘못된 설정을 조용히 버리지 않는다.** 범위 위반 · 빈 종료 목표는 검증에서 BLOCK된다.
 *
 * 실행: node --test test/phase-c-glide-withdrawal.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const engine = require(path.join(ROOT, 'js', '15-monte-carlo-engine.js'));
const adapter = require(path.join(ROOT, 'js', '16-monte-carlo-adapter.js'));
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');
const { datesFrom, zigzagCloses } = require('./risk-sandbox.js');

const {
  buildWithdrawalByMonth, buildGlideWeightsByYear, runMonthlyPrecisionMC, computeMuGBM
} = engine;
const { validateMonteCarloInput } = adapter;

const arr = (a) => Array.from(a);
const STAT_KEYS = ['mean', 'p10', 'p25', 'p50', 'p75', 'p90'];

/* 4 milestone × 6통계를 전부 뽑는다 - L2 회귀 기준(PMC-2). */
function l2(result) {
  return result.milestones.map((m) => {
    const row = { year: m.year };
    STAT_KEYS.forEach((k) => { row[k] = m[k]; });
    return row;
  });
}

const BASE_CONFIG = {
  pv0: 3e8,
  instruments: [
    { key: 'A', weight: 0.6, muAnnual: 0.08, sigmaAnnual: 0.18 },
    { key: 'B', weight: 0.4, muAnnual: 0.04, sigmaAnnual: 0.09 }
  ],
  correlationMatrix: [[1, 0.25], [0.25, 1]],
  monthlyContribution: 2e6,
  years: 20,
  iterations: 400,
  seed: 20260101
};
const cfg = (over) => Object.assign({}, BASE_CONFIG, over || {});

/* ══════════════════════════════════ [17] L2 bit-identical ══════════════════════════════════ */

test('L2-1. Phase C 설정이 없으면 기존 결과와 4 milestone × 6통계가 모두 같다(필드 없음 · undefined · 무효값)', () => {
  const base = l2(runMonthlyPrecisionMC(cfg()));
  assert.strictEqual(base.length, 4, 'milestone 4개(5/10/15/20년)를 기준으로 비교한다');

  const undefinedFields = l2(runMonthlyPrecisionMC(cfg({ glide: undefined, withdrawal: undefined })));
  assert.deepStrictEqual(undefinedFields, base, 'undefined를 넘기기만 해도 결과가 달라졌다');

  /* 무효값 - 엔진은 스스로 안전한 쪽(비활성)으로만 동작한다. 사용자에게 알리는 일은 검증(js/16)이 한다. */
  const invalid = [
    { glide: { startYearNo: 5, endYearNo: 5, endWeights: [0.5, 0.5] } },      // start === end
    { glide: { startYearNo: 8, endYearNo: 3, endWeights: [0.5, 0.5] } },      // start > end
    { glide: { startYearNo: 0, endYearNo: 4, endWeights: [0.5, 0.5] } },      // start < 1
    { glide: { startYearNo: 2, endYearNo: 6, endWeights: [1] } },             // 길이 불일치
    { withdrawal: { startYearNo: 3, monthly: 0 } },                            // 금액 0
    { withdrawal: { startYearNo: 0, monthly: 1000 } },                         // 연차 0
    { withdrawal: { startYearNo: 21, monthly: 1000 } }                         // 기간 밖
  ];
  invalid.forEach((over, i) => {
    assert.deepStrictEqual(l2(runMonthlyPrecisionMC(cfg(over))), base, `무효 설정 #${i + 1}에서 기존 결과가 달라졌다`);
  });
});

test('L2-2. 비활성 경로는 Phase C 관련 출력 키를 만들지 않는다(기존 출력 계약 유지)', () => {
  const r = runMonthlyPrecisionMC(cfg());
  assert.strictEqual(Object.prototype.hasOwnProperty.call(r, 'phaseC'), false,
    'Phase C를 쓰지 않았는데 결과에 새 필드가 생기면 기존 호출부 계약이 바뀐 것이다');
  assert.strictEqual(r.accountScopes, undefined, '기존 taxScope 계약도 그대로다');
});

test('L2-3. 소스 계약 - 비활성 경로는 기존 식을 그대로 쓰고 Glide는 난수를 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', '15-monte-carlo-engine.js'), 'utf8');
  assert.ok(src.includes('for (let i = 0; i < n; i++) balances[i] += contribShare[i] * contribMultiplier;'),
    '기존 납입 배분식(contribShare × 배율)이 그대로 남아 있어야 한다');
  assert.ok(src.includes('for (let i = 0; i < n; i++) balances[i] = total * weight[i];'),
    '기존 리밸런싱식(total × weight)이 그대로 남아 있어야 한다');
  /* Glide · 인출 블록 안에서 난수를 뽑으면 RNG 시퀀스가 어긋나 비활성 경로까지 깨진다. */
  const glideBlock = src.slice(src.indexOf('function buildGlideWeightsByYear'), src.indexOf('/* [MC-01] 총 납입원금'));
  assert.ok(!/nextZ|rng\(/.test(glideBlock), 'Glide 계산이 난수를 쓰면 안 된다');
  const wdBlock = src.slice(src.indexOf('function buildWithdrawalByMonth'), src.indexOf('function buildGlideWeightsByYear'));
  assert.ok(!/nextZ|rng\(/.test(wdBlock), '인출 계산이 난수를 쓰면 안 된다');
});

/* ══════════════════════════════════ [1][2] Glide 경계 · 선형 보간 ══════════════════════════════════ */

test('1. Glide 경계 - startYearNo=3 · endYearNo=8이면 1~3년차는 시작, 8년차 이후는 종료 weight다', () => {
  const s = [1, 0];
  const e = [0, 1];
  const w = buildGlideWeightsByYear(s, e, 3, 8, 10, 2);
  const at = (yearNo) => [w[(yearNo - 1) * 2], w[(yearNo - 1) * 2 + 1]];

  assert.deepStrictEqual(at(1), [1, 0], '1년차는 시작 weight');
  assert.deepStrictEqual(at(2), [1, 0], '2년차는 시작 weight');
  assert.deepStrictEqual(at(3), [1, 0], '시작 연차(3년차)는 아직 시작 weight다 - 불연속이 생기지 않는다');
  assert.deepStrictEqual(at(8), [0, 1], '마치는 연차(8년차)에 정확히 종료 weight에 도달한다');
  assert.deepStrictEqual(at(9), [0, 1], '종료 후에는 종료 weight가 고정된다');
  assert.deepStrictEqual(at(10), [0, 1], '종료 후에는 종료 weight가 고정된다');
  // 4~7년차는 그 사이를 움직인다.
  [4, 5, 6, 7].forEach((y) => {
    const [a, b] = at(y);
    assert.ok(a < 1 && a > 0 && b > 0 && b < 1, `${y}년차는 시작과 종료 사이여야 한다`);
  });
});

test('2. 선형 보간 수치 - p = (yIdx - startYIdx) / (endYIdx - startYIdx)', () => {
  const s = [1, 0];
  const e = [0, 1];
  const w = buildGlideWeightsByYear(s, e, 3, 8, 10, 2);
  const at = (yearNo) => [w[(yearNo - 1) * 2], w[(yearNo - 1) * 2 + 1]];
  // startYIdx=2 · endYIdx=7 · span=5
  [[4, 0.2], [5, 0.4], [6, 0.6], [7, 0.8]].forEach(([yearNo, p]) => {
    const [a, b] = at(yearNo);
    assert.ok(Math.abs(a - (1 - p)) < 1e-12, `${yearNo}년차 첫 종목 비중이 ${1 - p}이어야 한다(실제 ${a})`);
    assert.ok(Math.abs(b - p) < 1e-12, `${yearNo}년차 둘째 종목 비중이 ${p}이어야 한다(실제 ${b})`);
  });
});

test('2-b. 볼록결합이라 모든 연차에서 합계 1 · 음수 없음이 자동으로 보장된다', () => {
  const s = [0.55, 0.30, 0.15];
  const e = [0.10, 0.20, 0.70];
  const w = buildGlideWeightsByYear(s, e, 2, 15, 20, 3);
  for (let y = 0; y < 20; y++) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      const v = w[y * 3 + i];
      assert.ok(v >= 0, `${y + 1}년차에 음수 비중이 나왔다`);
      sum += v;
    }
    assert.ok(Math.abs(sum - 1) < 1e-12, `${y + 1}년차 합계가 1이 아니다(${sum})`);
  }
});

/* ══════════════════════════════════ [8][9][10][11] 인출 ══════════════════════════════════ */

test('8. 인출 시작 시점 - startYearNo=3이면 m=25부터다(달력이 아니라 상대 연차)', () => {
  const t = buildWithdrawalByMonth({ startYearNo: 3, monthly: 500000 }, 240);
  assert.strictEqual(t.length, 240);
  for (let m = 1; m <= 24; m++) assert.strictEqual(t[m - 1], 0, `m=${m}은 아직 인출 없음`);
  assert.strictEqual(t[24], 500000, 'm=25(3년차 첫 달)부터 인출이 시작된다');
  assert.strictEqual(t[239], 500000, '기간 끝까지 계속된다(별도 종료 조건을 만들지 않는다)');
});

test('8-b. 인출 설정이 없거나 쓸 수 없으면 테이블 자체를 만들지 않는다(null)', () => {
  assert.strictEqual(buildWithdrawalByMonth(null, 240), null);
  assert.strictEqual(buildWithdrawalByMonth({ startYearNo: 3 }, 240), null, '금액이 없으면 null');
  assert.strictEqual(buildWithdrawalByMonth({ startYearNo: 3, monthly: 0 }, 240), null, '0은 "꺼짐"이 아니라 쓸 수 없는 값이다');
  assert.strictEqual(buildWithdrawalByMonth({ startYearNo: 0, monthly: 100 }, 240), null);
  assert.strictEqual(buildWithdrawalByMonth({ startYearNo: 2.5, monthly: 100 }, 240), null, '정수가 아니면 쓰지 않는다');
  assert.strictEqual(buildWithdrawalByMonth({ startYearNo: 21, monthly: 100 }, 240), null, '기간 밖이면 테이블이 없다');
});

/* σ=0 · 수수료 0 기준선 - 엔진의 월 순서를 그대로 옮긴 참조 구현.
 * 인출이 "비례 차감"인지 검증하려면 종목별 수익률을 다르게 둬야 한다(전액을 한 종목에서 빼면
 * 이후 성장 경로가 달라져 최종 합계가 어긋난다). */
function referenceNoShock(config) {
  const n = config.instruments.length;
  const months = config.years * 12;
  const w = config.instruments.map((x) => x.weight);
  const muM = config.instruments.map((x) => computeMuGBM(x.muAnnual, 0) / 12);
  const bal = w.map((x) => config.pv0 * x);
  const wd = buildWithdrawalByMonth(config.withdrawal, months);
  for (let m = 1; m <= months; m++) {
    if (wd) {
      const requested = wd[m - 1];
      if (requested > 0) {
        let cash = 0; for (let i = 0; i < n; i++) cash += bal[i];
        if (cash > 0) {
          if (requested >= cash) { for (let i = 0; i < n; i++) bal[i] = 0; }
          else { for (let i = 0; i < n; i++) bal[i] -= requested * bal[i] / cash; }
        }
      }
    }
    for (let i = 0; i < n; i++) bal[i] *= Math.exp(muM[i]);
    if (m % 12 === 0) {
      let total = 0; for (let i = 0; i < n; i++) total += bal[i];
      for (let i = 0; i < n; i++) bal[i] = total * w[i];
    }
  }
  return bal.reduce((a, b) => a + b, 0);
}

const NO_SHOCK = {
  pv0: 1e9,
  instruments: [
    { key: 'A', weight: 0.5, muAnnual: 0.12, sigmaAnnual: 0 },
    { key: 'B', weight: 0.5, muAnnual: 0, sigmaAnnual: 0 }
  ],
  correlationMatrix: [[1, 0], [0, 1]],
  monthlyContribution: 0,
  years: 5,
  iterations: 1,
  seed: 7
};

test('10. 인출은 그 시점 종목별 잔고 비중대로 비례 차감된다(σ=0 기준선과 일치)', () => {
  const config = Object.assign({}, NO_SHOCK, { withdrawal: { startYearNo: 2, monthly: 3e6 } });
  const got = runMonthlyPrecisionMC(config).milestones.at(-1).p50;
  const expected = referenceNoShock(config);
  assert.ok(Math.abs(got - expected) / expected < 1e-12,
    `비례 차감 결과가 기준선과 다르다(엔진 ${got} / 기준 ${expected})`);
  /* 판별력 확인 - 한 종목에서만 빼는 구현이었다면 두 종목의 수익률이 달라 결과가 어긋난다. */
  const single = (() => {
    const n = 2; const months = config.years * 12;
    const w = config.instruments.map((x) => x.weight);
    const muM = config.instruments.map((x) => computeMuGBM(x.muAnnual, 0) / 12);
    const bal = w.map((x) => config.pv0 * x);
    const wd = buildWithdrawalByMonth(config.withdrawal, months);
    for (let m = 1; m <= months; m++) {
      const req = wd[m - 1];
      if (req > 0) bal[0] = Math.max(0, bal[0] - req);
      for (let i = 0; i < n; i++) bal[i] *= Math.exp(muM[i]);
      if (m % 12 === 0) { const t = bal[0] + bal[1]; for (let i = 0; i < n; i++) bal[i] = t * w[i]; }
    }
    return bal[0] + bal[1];
  })();
  assert.ok(Math.abs(single - expected) / expected > 1e-9, '이 테스트가 비례 차감과 단일 차감을 구분하지 못한다(테스트 설계 오류)');
});

test('9. 잔고보다 큰 인출은 잔고까지만 빼고 멈춘다(B-1 clamp · 음수 잔고 없음)', () => {
  const config = Object.assign({}, NO_SHOCK, {
    pv0: 1e6, years: 5, withdrawal: { startYearNo: 1, monthly: 1e9 }
  });
  const r = runMonthlyPrecisionMC(config);
  const last = r.milestones.at(-1);
  assert.strictEqual(last.p50, 0, '전액 인출 후에는 잔고가 정확히 0이어야 한다');
  STAT_KEYS.forEach((k) => {
    assert.ok(Number.isFinite(last[k]), `${k}가 유한값이 아니다`);
    assert.ok(last[k] >= 0, `${k}가 음수다(잔고가 음수로 내려갔다)`);
  });
});

test('11. 잔고가 0이면 인출은 0이고 NaN · Infinity가 생기지 않는다', () => {
  const config = Object.assign({}, NO_SHOCK, {
    pv0: 0, monthlyContribution: 0, years: 5, withdrawal: { startYearNo: 1, monthly: 1e6 }
  });
  const r = runMonthlyPrecisionMC(config);
  r.milestones.forEach((m) => {
    STAT_KEYS.forEach((k) => {
      assert.ok(Number.isFinite(m[k]), `${m.year}년 ${k}가 유한값이 아니다`);
      assert.strictEqual(m[k], 0, `${m.year}년 ${k}는 0이어야 한다`);
    });
  });
});

/* ══════════════════════════════════ [12] Glide + 인출 동시 ══════════════════════════════════ */

test('12. Glide와 인출이 같은 실행에서 함께 적용되고, 결과에 적용 사실이 남는다', () => {
  const config = cfg({
    glide: { startYearNo: 2, endYearNo: 10, endWeights: [0.2, 0.8] },
    withdrawal: { startYearNo: 12, monthly: 1e6 }
  });
  const r = runMonthlyPrecisionMC(config);
  assert.deepStrictEqual(r.phaseC, { glide: true, withdrawal: true }, '적용 사실이 결과에 남아야 한다');

  const onlyGlide = runMonthlyPrecisionMC(cfg({ glide: config.glide }));
  const onlyWithdrawal = runMonthlyPrecisionMC(cfg({ withdrawal: config.withdrawal }));
  assert.deepStrictEqual(onlyGlide.phaseC, { glide: true, withdrawal: false });
  assert.deepStrictEqual(onlyWithdrawal.phaseC, { glide: false, withdrawal: true });

  const base = l2(runMonthlyPrecisionMC(cfg()));
  assert.notDeepStrictEqual(l2(onlyGlide), base, 'Glide를 켰는데 결과가 그대로면 적용되지 않은 것이다');
  assert.notDeepStrictEqual(l2(onlyWithdrawal), base, '인출을 켰는데 결과가 그대로면 적용되지 않은 것이다');
  assert.ok(l2(r).at(-1).p50 < l2(onlyGlide).at(-1).p50, '인출이 더해지면 잔액이 줄어든다');
});

test('12-b. Glide 시작 전 구간은 기존 목표비중과 같은 결과를 낸다', () => {
  /* 5년차부터 움직이는 Glide는 5년 milestone까지의 결과가 기존과 같아야 한다
   * (5년차 = 시작 연차라 p=0 · 그 해 리밸런싱도 시작 weight로 마감한다). */
  const base = runMonthlyPrecisionMC(cfg());
  const glided = runMonthlyPrecisionMC(cfg({ glide: { startYearNo: 5, endYearNo: 12, endWeights: [0.1, 0.9] } }));
  STAT_KEYS.forEach((k) => {
    assert.strictEqual(glided.milestones[0][k], base.milestones[0][k],
      `5년 시점 ${k}가 달라졌다 - 시작 연차 이전에는 기존 weight를 그대로 써야 한다`);
  });
  assert.notStrictEqual(glided.milestones.at(-1).p50, base.milestones.at(-1).p50, '이후 구간은 달라져야 한다');
});

/* ══════════════════════════════════ [4][5] 검증 BLOCK ══════════════════════════════════ */

function validate(over) {
  return validateMonteCarloInput(Object.assign({
    instruments: [{ key: 'A', weight: 0.6, muAnnual: 0.08, sigmaAnnual: 0.18, feeRateAnnual: 0 },
      { key: 'B', weight: 0.4, muAnnual: 0.04, sigmaAnnual: 0.09, feeRateAnnual: 0 }],
    correlationMatrix: [[1, 0.25], [0.25, 1]],
    assetOrder: ['A', 'B'],
    initialPrincipal: 3e8, monthlyContribution: 2e6, years: 20, simulations: 1000, seed: 1
  }, over || {}));
}

test('5. 잘못된 Glide 범위는 전부 BLOCK된다(자동 교환 · 자동 무효화 없음)', () => {
  const ok = validate({ glide: { startYearNo: 3, endYearNo: 8, endWeights: [0.3, 0.7] } });
  assert.strictEqual(ok.valid, true, `정상 설정이 막혔다: ${arr(ok.errors).join(' / ')}`);

  const cases = [
    [{ startYearNo: 5, endYearNo: 5, endWeights: [0.3, 0.7] }, /앞서야 합니다/],
    [{ startYearNo: 9, endYearNo: 4, endWeights: [0.3, 0.7] }, /앞서야 합니다/],
    [{ startYearNo: 0, endYearNo: 4, endWeights: [0.3, 0.7] }, /시작할 연차가 올바르지 않습니다/],
    [{ startYearNo: 2, endYearNo: 21, endWeights: [0.3, 0.7] }, /예측 기간을 넘습니다/],
    [{ startYearNo: 2.5, endYearNo: 8, endWeights: [0.3, 0.7] }, /시작할 연차가 올바르지 않습니다/]
  ];
  cases.forEach(([glide, re], i) => {
    const r = validate({ glide });
    assert.strictEqual(r.valid, false, `#${i + 1} 잘못된 범위가 통과했다`);
    assert.ok(arr(r.errors).some((e) => re.test(e)), `#${i + 1} 기대한 사유가 없다: ${arr(r.errors).join(' / ')}`);
  });
});

test('4. 빈 종료 목표는 지정된 문구로 BLOCK된다(전부 매도 · 기존 목표 유지로 해석하지 않는다)', () => {
  const r = validate({ glide: { startYearNo: 3, endYearNo: 8, endWeights: [0, 0] } });
  assert.strictEqual(r.valid, false);
  assert.ok(arr(r.errors).includes('나중에 가져갈 목표 포트폴리오가 비어 있습니다. 종목과 비중을 입력해 주세요.'),
    `지정된 문구가 없다: ${arr(r.errors).join(' / ')}`);
});

test('5-b. 인출 설정도 같은 방식으로 BLOCK된다', () => {
  assert.strictEqual(validate({ withdrawal: { startYearNo: 3, monthly: 1e6 } }).valid, true);
  const bad = [
    [{ startYearNo: 0, monthly: 1e6 }, /시작할 연차가 올바르지 않습니다/],
    [{ startYearNo: 21, monthly: 1e6 }, /예측 기간을 넘습니다/],
    [{ startYearNo: 3, monthly: 0 }, /찾아 쓸 금액이 올바르지 않습니다/],
    [{ startYearNo: 3, monthly: -1 }, /찾아 쓸 금액이 올바르지 않습니다/]
  ];
  bad.forEach(([withdrawal, re], i) => {
    const r = validate({ withdrawal });
    assert.strictEqual(r.valid, false, `#${i + 1}이 통과했다`);
    assert.ok(arr(r.errors).some((e) => re.test(e)), `#${i + 1} 사유 불일치: ${arr(r.errors).join(' / ')}`);
  });
});

test('4-b. 검증 문구에는 개발 식별자가 섞이지 않는다(그대로 화면에 나갈 수 있어야 한다)', () => {
  const r = validate({ glide: { startYearNo: 9, endYearNo: 4, endWeights: [0, 0] }, withdrawal: { startYearNo: 0, monthly: 0 } });
  assert.strictEqual(r.valid, false);
  const DEV = /instruments|correlationMatrix|assetOrder|muAnnual|sigmaAnnual|feeRateAnnual|monthlyContribution|initialPrincipal|contributionStreams|contributionGrowthRate|taxScope|glide|withdrawal/;
  arr(r.errors).forEach((e) => {
    assert.ok(/[가-힣]/.test(e), `한국어 문장이 아니다: ${e}`);
    assert.ok(!DEV.test(e), `개발 식별자가 들어 있다: ${e}`);
  });
});

/* ══════════════════════════════════ 어댑터(state) ══════════════════════════════════ */

const OWNER = '신랑';
function priceSeries(startDate) {
  const n = 300;
  return { closes: zigzagCloses(n, 100, 0.8, 0.8), dates: datesFrom(n, startDate) };
}
function freshSandbox() {
  const s = loadAdapterSandbox();
  s.state.exchangeRate = 1300;
  s.state.assets = [];
  s.state.transactions = [];
  ['신랑', '와이프'].forEach((o) => {
    s.state.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    s.state.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  s.state.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  delete s.state.projection.glidePlan;
  delete s.state.projection.withdrawalPlan;
  const idx = s.evalInSandbox('({ kospi: INDEX_TICKERS.KOSPI, sp500: INDEX_TICKERS.SP500 })');
  s.setDailyCloses(idx.kospi, priceSeries('2025-01-01'));
  s.setDailyCloses(idx.sp500, priceSeries('2025-01-02'));
  s.setDailyCloses('005930.KS', priceSeries('2025-01-03'));
  s.setDailyCloses('000660.KS', priceSeries('2025-01-04'));
  return s;
}
const build = (s, over) => s.buildMonteCarloInputFromState(Object.assign({
  presetKey: 'normal', ownerFilter: OWNER, includeTaxAdvantaged: true, years: 20
}, over || {}));
const glideTargets = (rows) => ({ domestic: { '국내': 100, '해외': 0 }, targets: { '국내': rows, '해외': [] } });

test('A-1. glidePlan이 없으면 어댑터 출력에 Phase C 필드가 생기지 않는다', async () => {
  const s = freshSandbox();
  s.state.rebalance[OWNER].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
  const r = await build(s);
  assert.deepStrictEqual(arr(r.errors), []);
  assert.strictEqual(r.glide, undefined, 'glide 필드가 생기면 기존 호출부 계약이 바뀐 것이다');
  assert.strictEqual(r.withdrawal, undefined);
});

test('3. 종료 목표에 없는 종목은 종료 weight 0이다(그때는 보유하지 않는다는 뜻)', async () => {
  const s = freshSandbox();
  s.state.rebalance[OWNER].targets['국내'] = [
    { type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 60 },
    { type: 'ticker', ticker: '000660', label: 'ZZ 국내주식2', pct: 40 }
  ];
  s.state.projection.glidePlan = Object.assign({ startYearNo: 3, endYearNo: 8 },
    glideTargets([{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }]));
  const r = await build(s);
  assert.deepStrictEqual(arr(r.errors), []);
  const order = arr(r.assetOrder);
  const end = arr(r.glide.endWeights);
  assert.strictEqual(end.length, order.length, 'endWeights는 assetOrder와 길이가 같아야 한다');
  const i1 = order.indexOf('T:005930.KS');
  const i2 = order.indexOf('T:000660.KS');
  assert.ok(i1 >= 0 && i2 >= 0, `두 종목이 universe에 있어야 한다: ${order.join(', ')}`);
  assert.ok(Math.abs(end[i1] - 1) < 1e-12, '종료 목표에 남은 종목은 비중 1');
  assert.strictEqual(end[i2], 0, '종료 목표에서 빠진 종목은 0이어야 한다');
  assert.strictEqual(r.glide.startYearNo, 3);
  assert.strictEqual(r.glide.endYearNo, 8);
});

test('3-b. 종료 목표에만 있는 종목도 universe에 들어간다(시작 weight 0)', async () => {
  const s = freshSandbox();
  s.state.rebalance[OWNER].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
  s.state.projection.glidePlan = Object.assign({ startYearNo: 2, endYearNo: 6 },
    glideTargets([{ type: 'ticker', ticker: '000660', label: 'ZZ 국내주식2', pct: 100 }]));
  const r = await build(s);
  assert.deepStrictEqual(arr(r.errors), []);
  const order = arr(r.assetOrder);
  const idx = order.indexOf('T:000660.KS');
  assert.ok(idx >= 0, `종료 전용 종목이 universe에 없다: ${order.join(', ')}`);
  assert.strictEqual(arr(r.instruments)[idx].weight, 0, '시작 시점에는 배분이 없어야 한다');
  assert.ok(Math.abs(arr(r.glide.endWeights)[idx] - 1) < 1e-12, '종료 시점에는 전부 이 종목이어야 한다');
});

test('6. ownerFilter가 있어도 시작 · 종료가 같은 key 체계를 쓴다(가구 전체도 마찬가지)', async () => {
  const mk = () => {
    const s = freshSandbox();
    ['신랑', '와이프'].forEach((o) => {
      s.state.rebalance[o].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
    });
    s.state.assets = [s.makeAsset({ ticker: '005930', name: 'ZZ 국내주식', owner: '신랑', accountType: '일반계좌', category: '주식', quantity: 10, buyPrice: 1000, currentPrice: 1000 })];
    s.state.projection.glidePlan = Object.assign({ startYearNo: 2, endYearNo: 6 },
      glideTargets([{ type: 'ticker', ticker: '000660', label: 'ZZ 국내주식2', pct: 100 }]));
    return s;
  };
  for (const ownerFilter of [null, '신랑', '와이프']) {
    const r = await build(mk(), { ownerFilter });
    assert.deepStrictEqual(arr(r.errors), [], `ownerFilter=${ownerFilter}에서 오류가 났다`);
    const order = arr(r.assetOrder);
    const end = arr(r.glide.endWeights);
    assert.strictEqual(end.length, order.length, `ownerFilter=${ownerFilter} 길이 불일치`);
    /* 종료 목표의 종목이 시작 universe와 **같은 key 공간**에 들어갔는지 - 별도 key가 생기면 여기서 걸린다. */
    const endKeys = order.filter((k, i) => end[i] > 0);
    assert.deepStrictEqual(endKeys, ['T:000660.KS'], `ownerFilter=${ownerFilter}에서 종료 key가 갈렸다: ${order.join(', ')}`);
  }
});

test('7. 소유자별 수익률 기준이 갈리는 종목도 시작 · 종료가 같은 instrument key를 쓴다', async () => {
  const s = freshSandbox();
  /* 같은 종목을 두 소유자가 서로 다른 대표매칭 기준으로 들고 있으면 key에 기준 접미사가 붙는다(N-10).
   * 종료 목표를 owner 없이 계산했다면 접미사가 달라져 별개 instrument로 갈린다. */
  ['신랑', '와이프'].forEach((o) => {
    s.state.rebalance[o].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
  });
  s.state.assets = [
    s.makeAsset({ ticker: '005930', name: 'ZZ 국내주식', owner: '신랑', accountType: '일반계좌', category: '주식', quantity: 10, buyPrice: 1000, currentPrice: 1000, rateMatchOverride: 'KOSPI' }),
    s.makeAsset({ ticker: '005930', name: 'ZZ 국내주식', owner: '와이프', accountType: '일반계좌', category: '주식', quantity: 10, buyPrice: 1000, currentPrice: 1000, rateMatchOverride: 'NASDAQ' })
  ];
  s.state.projection.glidePlan = Object.assign({ startYearNo: 2, endYearNo: 6 },
    glideTargets([{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }]));
  const r = await build(s, { ownerFilter: null });
  assert.deepStrictEqual(arr(r.errors), []);
  const order = arr(r.assetOrder);
  const end = arr(r.glide.endWeights);
  /* 시작 universe에 이미 있는 key들만 종료 비중을 받아야 한다 - 새 key가 생기면 weight 0짜리
   * 유령 instrument가 남아 여기서 걸린다. */
  const startKeys = arr(r.instruments).filter((x) => x.weight > 0).map((x) => x.key);
  const endKeys = order.filter((k, i) => end[i] > 0);
  assert.ok(endKeys.length > 0, '종료 비중이 전부 0이면 테스트가 성립하지 않는다');
  endKeys.forEach((k) => {
    assert.ok(startKeys.includes(k), `종료 목표가 새 instrument key를 만들었다: ${k} (시작: ${startKeys.join(', ')})`);
  });
  const zeroBoth = order.filter((k, i) => arr(r.instruments)[i].weight === 0 && end[i] === 0);
  assert.deepStrictEqual(zeroBoth, [], `시작 · 종료 어디에도 쓰이지 않는 instrument가 생겼다: ${zeroBoth.join(', ')}`);
});

/* ══════════════════════════════════ [15][16] state · 복원 ══════════════════════════════════ */

test('15. normalize는 모양만 정리한다 - 범위 보정 · 자동 교환 · 빈 목표 자동 채우기를 하지 않는다', () => {
  const s = freshSandbox();
  const plan = s.normalizeGlidePlan({ startYearNo: 9, endYearNo: 4, domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [], '해외': [] } });
  assert.strictEqual(plan.startYearNo, 9, '잘못된 범위를 그대로 남겨 검증이 막게 한다');
  assert.strictEqual(plan.endYearNo, 4, '자동으로 교환하지 않는다');
  assert.deepStrictEqual(arr(plan.targets['국내']), [], '빈 목표를 기본 목표로 채우지 않는다');
  assert.strictEqual(s.normalizeGlidePlan(undefined), null, '필드가 없으면 비활성(null)이다');
  assert.strictEqual(s.normalizeGlidePlan(null), null);
  assert.strictEqual(s.normalizeWithdrawalPlan(undefined), null);
  const wd = s.normalizeWithdrawalPlan({ startYearNo: 0, monthly: -5 });
  assert.strictEqual(wd.startYearNo, 0, '값을 고치지 않는다');
  assert.strictEqual(wd.monthly, -5);
});

test('15-b. loadState - 저장값에 필드가 없으면 키를 만들지 않고, 있으면 그대로 살린다', () => {
  const s = freshSandbox();
  s.schedulePush = () => {}; // js/12 미탑재 샌드박스
  const LS_PROJECTION = s.evalInSandbox('LS_PROJECTION');
  const saved = JSON.parse(JSON.stringify(s.state.projection));
  const load = (projection) => {
    s.localStorage.getItem = (k) => (k === LS_PROJECTION ? JSON.stringify(projection) : null);
    s.loadState();
    return s.state.projection;
  };
  const legacy = Object.assign({}, saved);
  delete legacy.glidePlan; delete legacy.withdrawalPlan;
  let p = load(legacy);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(p, 'glidePlan'), false, '빈 객체를 만들면 안 된다');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(p, 'withdrawalPlan'), false);

  p = load(Object.assign({}, legacy, {
    glidePlan: { startYearNo: 3, endYearNo: 8, domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'ticker', ticker: '005930', label: 'ZZ', pct: 100 }], '해외': [] } },
    withdrawalPlan: { startYearNo: 12, monthly: 2000000 }
  }));
  assert.strictEqual(p.glidePlan.startYearNo, 3);
  assert.strictEqual(p.glidePlan.endYearNo, 8);
  assert.strictEqual(arr(p.glidePlan.targets['국내']).length, 1);
  assert.deepStrictEqual({ startYearNo: p.withdrawalPlan.startYearNo, monthly: p.withdrawalPlan.monthly }, { startYearNo: 12, monthly: 2000000 });
});

test('15-c. 백업 · 동기화 복원 경로에 두 필드가 등록돼 있다(등록이 빠지면 조용히 사라진다)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', '12-import-export-sync.js'), 'utf8');
  const block = src.slice(src.indexOf('state.projection = {'), src.indexOf('persistProjection(true); // skipStamp - 위와 동일한 이유'));
  ['glidePlan', 'withdrawalPlan'].forEach((key) => {
    assert.ok(block.includes(`hasOwn(parsed.projection, '${key}')`), `${key}가 applySyncBlob 화이트리스트에 없다`);
    assert.ok(block.includes(`{ ${key}:`), `${key}를 복원 객체에 넣는 코드가 없다`);
  });
  assert.ok(src.includes('projection: state.projection'), '백업 payload에 projection이 통째로 들어간다(기존 구조)');
});

test('16. Phase C 필드가 없는 기존 state는 그대로 동작하고 Phase C는 비활성이다', async () => {
  const s = freshSandbox();
  s.state.rebalance[OWNER].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
  assert.strictEqual(s.getGlidePlan(), null);
  assert.strictEqual(s.getWithdrawalPlan(), null);
  const r = await build(s);
  assert.deepStrictEqual(arr(r.errors), []);
  assert.strictEqual(r.glide, undefined);
  assert.strictEqual(r.withdrawal, undefined);
});

/* ══════════════════════════════════ [13][14] preview · deterministic ══════════════════════════════════ */

test('13. 빠른 미리보기 경로는 Phase C 설정을 조용히 무시하지 않고 거부한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', '17-monte-carlo-worker.js'), 'utf8');
  const reject = src.indexOf("mode === 'preview' && (input.glide || input.withdrawal)");
  const runner = src.indexOf("const runner = mode === 'preview'");
  assert.ok(reject > 0, 'preview 거부 분기가 없다');
  assert.ok(reject < runner, '거부는 엔진을 고르기 **전에** 있어야 한다');
  assert.ok(/code: 'INPUT_ERROR'/.test(src.slice(reject, runner)), '기존 INPUT_ERROR를 써야 한다(새 코드 체계 금지)');
  assert.ok(src.includes('빠른 미리보기 방식으로는 인출·목표비중 변화 설정을 계산할 수 없습니다. 정밀 계산으로 실행해 주세요.'),
    '지정된 사용자 문구가 없다');
  const ui = fs.readFileSync(path.join(ROOT, 'js', '19-monte-carlo-ui.js'), 'utf8');
  assert.ok(ui.includes('빠른 미리보기 방식으로는'), 'js/19 문구 매핑이 없다');
});

test('14. 결정론 계산에는 Phase C가 적용되지 않는다', () => {
  const s = freshSandbox();
  s.state.rebalance[OWNER].targets['국내'] = [{ type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 100 }];
  s.state.projection.taxAdvantagedPlan.contributionByOwnerAccount[OWNER] =
    [{ accountType: 'ISA', frequency: 'monthly', amount: 1000000, years: 20 }];
  const before = s.simulateTaxAdvantagedOwnerGrowth(OWNER, 'normal', 20);
  s.state.projection.glidePlan = Object.assign({ startYearNo: 2, endYearNo: 6 },
    glideTargets([{ type: 'ticker', ticker: '000660', label: 'ZZ 국내주식2', pct: 100 }]));
  s.state.projection.withdrawalPlan = { startYearNo: 3, monthly: 1000000 };
  const after = s.simulateTaxAdvantagedOwnerGrowth(OWNER, 'normal', 20);
  assert.strictEqual(after, before, '결정론 결과가 Phase C 설정에 반응하면 안 된다');
});

test('14-b. 안내 문구는 Phase C가 적용된 실행에서만 바뀐다', () => {
  const s = freshSandbox();
  const off = s.explainAccumulationScopeAlwaysOn();
  assert.ok(off.message.includes('은퇴 후 인출 단계에서 발생하는 위험은 이 모델에 포함되어 있지 않습니다'),
    'Phase C를 쓰지 않으면 기존 문구가 그대로여야 한다');
  assert.ok(!off.message.includes('Monte Carlo 시뮬레이션에만 반영되며'), '비활성 사용자에게 새 문장이 보이면 안 된다');
  assert.strictEqual(s.explainAccumulationScopeAlwaysOn({ glide: false, withdrawal: false }).message, off.message,
    '둘 다 꺼진 실행도 기존 문구 그대로다');

  const on = s.explainAccumulationScopeAlwaysOn({ glide: false, withdrawal: true });
  assert.ok(!on.message.includes('은퇴 후 인출 단계에서 발생하는 위험은 이 모델에 포함되어 있지 않습니다'),
    '인출을 계산했는데 "다루지 않는다"고 말하면 사실과 다르다');
  assert.ok(on.message.includes('설정한 인출은 계산에 반영되지만, 인출 시점의 시장 상황에 따른 고갈 위험은 따로 계산하지 않습니다'),
    '지정된 대체 문장이 없다');
  assert.ok(on.message.includes('여기서 정한 인출과 목표비중 변화는 Monte Carlo 시뮬레이션에만 반영되며, 결정론 계산에는 반영되지 않습니다.'),
    '지정된 추가 문장이 없다');
});

/* ══════════════════════════════════ 월 순서 · 계좌 범위 ══════════════════════════════════ */

test('W-순서. 인출은 일반계좌 잔고에서만 빠지고 절세계좌(buy-and-hold)는 건드리지 않는다', () => {
  /* ⚠ 소스에서 인출 블록은 절세 납입(Step 1-T)보다 **앞**에 놓여 있다. 두 블록이 서로 다른 배열을
   * 만지므로(인출 = balances · 절세 납입 = taxBalances) 순서를 바꿔도 결과가 같고, 인출이 성장(Step 4)
   * 이전이라는 W-1의 요구는 그대로 지켜진다. 그 사실을 여기서 값으로 고정한다. */
  const n = 2;
  const months = 5 * 12;
  const taxScope = {
    initialBalances: [5e7, 5e7],
    monthlyContributions: [new Array(months).fill(1e5), new Array(months).fill(1e5)]
  };
  const base = Object.assign({}, NO_SHOCK, { taxScope });
  const withWd = Object.assign({}, base, { withdrawal: { startYearNo: 1, monthly: 2e6 } });

  const a = runMonthlyPrecisionMC(base);
  const b = runMonthlyPrecisionMC(withWd);
  assert.ok(a.accountScopes && b.accountScopes, '절세계좌 범위 결과가 있어야 한다');
  STAT_KEYS.forEach((k) => {
    assert.strictEqual(b.accountScopes.taxAdvantaged.at(-1)[k], a.accountScopes.taxAdvantaged.at(-1)[k],
      '인출이 절세계좌 결과를 바꿨다 - buy-and-hold 의미가 깨졌다(' + k + ')');
  });
  assert.ok(b.accountScopes.general.at(-1).p50 < a.accountScopes.general.at(-1).p50,
    '인출은 일반계좌 잔고를 줄여야 한다');
  assert.ok(Math.abs(n - taxScope.initialBalances.length) < 1e-9, 'taxScope 길이는 instrument 수와 같다');
});
