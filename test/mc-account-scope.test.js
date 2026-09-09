// [FUTURE-P1] Monte Carlo 계좌 범위(General / Tax-Advantaged / Combined) 회귀 테스트.
// 실행: node --test test/mc-account-scope.test.js
//
// 검증 계약:
//  1) taxScope를 넘기지 않으면 엔진 동작이 기존과 완전히 같다(기존 골든값은 test/monte-carlo-engine.test.js가
//     이미 고정하고 있으므로, 여기서는 "출력 contract가 늘어나지 않는다"만 확인한다).
//  2) 절세계좌는 buy-and-hold다 - 연 1회 리밸런싱이 절세계좌 잔고를 재배분하지 않는다.
//  3) 일반계좌와 절세계좌가 같은 달에 같은 시장 충격(X)을 공유한다.
//  4) combined는 path 단위로 먼저 더한 뒤 그 분포에서 백분위를 뽑는다
//     (P50(일반)+P50(절세)로 만들지 않는다 - 분포가 비대칭이면 두 값이 실제로 달라진다).
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const engine = require(path.join(__dirname, '..', 'js', '15-monte-carlo-engine.js'));
const { runMonthlyPrecisionMC } = engine;

// σ=0으로 두면 결과가 결정론적이 되어 "구조"를 정확한 수로 검증할 수 있다(확률적 흔들림 제거).
function deterministicConfig(over) {
  return Object.assign({
    pv0: 1000000,
    instruments: [{ key: 'A', weight: 1, muAnnual: 0, sigmaAnnual: 0 }],
    correlationMatrix: [[1]],
    monthlyContribution: 0,
    years: 20, iterations: 50, seed: 7
  }, over || {});
}

/* ── A. taxScope 미제공 시 기존 출력 contract 유지 ─────────────────────────── */
test('A. taxScope를 넘기지 않으면 accountScopes 필드 자체가 생기지 않는다(기존 호출부 무영향)', () => {
  const r = runMonthlyPrecisionMC(deterministicConfig());
  assert.strictEqual(r.accountScopes, undefined, 'taxScope 없이도 새 필드가 생기면 기존 출력 contract가 바뀐 것이다');
  assert.ok(Array.isArray(r.milestones) && r.milestones.length === 4, 'milestones(5/10/15/20)는 그대로여야 한다');
});

/* ── B. 절세계좌 buy-and-hold - 리밸런싱이 절세계좌를 건드리지 않는다 ────────── */
test('B. 수익률이 다른 두 자산에서, 절세계좌는 리밸런싱되지 않아 일반계좌와 다른 결과가 된다', () => {
  // 같은 초기 배분(50:50)이지만 수익률이 다르다 - 일반계좌는 매년 50:50으로 되돌리고,
  // 절세계좌는 그대로 두므로 20년 뒤 총액이 서로 달라야 한다.
  const instruments = [
    { key: 'HIGH', weight: 0.5, muAnnual: 0.10, sigmaAnnual: 0 },
    { key: 'LOW', weight: 0.5, muAnnual: 0.02, sigmaAnnual: 0 }
  ];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 1000000, instruments, correlationMatrix: [[1, 0], [0, 1]],
    taxScope: { initialBalances: [500000, 500000] } // 일반계좌와 완전히 같은 금액/배분에서 출발
  }));
  const g = r.accountScopes.general.at(-1).p50;
  const t = r.accountScopes.taxAdvantaged.at(-1).p50;
  assert.ok(Math.abs(g - t) > 1, `리밸런싱 여부가 결과에 반영되지 않았다(general ${g}, tax ${t})`);
  // 수익률이 높은 쪽으로 계속 쏠리게 두는 buy-and-hold가, 매년 저수익 자산으로 되돌리는 일반계좌보다 크다.
  assert.ok(t > g, `buy-and-hold(절세)가 연 1회 리밸런싱(일반)보다 작게 나왔다(general ${g}, tax ${t})`);
});

/* ── C. 동일 시장 충격 공유 ──────────────────────────────────────────────── */
test('C. 같은 자산·같은 초기금액이면 일반계좌와 절세계좌 결과가 정확히 같다(같은 X를 공유한다는 증거)', () => {
  // 자산이 하나뿐이면 리밸런싱은 아무것도 바꾸지 않는다(비중 100% 그대로) - 따라서 두 계좌의 차이가
  // 사라지고, 같은 충격을 공유한다면 결과가 exact하게 같아야 한다. σ>0으로 두어 실제 난수를 태운다.
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.06, sigmaAnnual: 0.18 }];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 1000000, instruments, correlationMatrix: [[1]], iterations: 200,
    taxScope: { initialBalances: [1000000] }
  }));
  ['p10', 'p25', 'p50', 'p75', 'p90'].forEach((k) => {
    assert.strictEqual(r.accountScopes.general.at(-1)[k], r.accountScopes.taxAdvantaged.at(-1)[k],
      `${k}이 다르다 - 두 계좌가 같은 시장 경로를 공유하지 않았다는 뜻이다`);
  });
});

/* ── D. combined = path 단위 합산 ───────────────────────────────────────── */
test('D. combined 표본이 path별 합(general[i]+tax[i])으로 만들어진다', () => {
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.05, sigmaAnnual: 0.15 }];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 1000000, instruments, correlationMatrix: [[1]], iterations: 300,
    taxScope: { initialBalances: [400000] }
  }));
  // 자산이 하나뿐이라 두 계좌가 같은 경로를 그대로 따라가고 잔고 비율이 항상 1000000:400000으로 고정된다.
  // 따라서 이 특수한 경우에는 combined 백분위 = general 백분위 × 1.4가 정확히 성립해야 한다.
  ['p10', 'p50', 'p90'].forEach((k) => {
    const g = r.accountScopes.general.at(-1)[k];
    const c = r.accountScopes.combined.at(-1)[k];
    assert.ok(Math.abs(c - g * 1.4) / c < 1e-9, `${k}: combined가 path 합산이 아니다(general ${g}, combined ${c})`);
  });
});

/* ── E. 비대칭 분포에서 P50 합산과 combined P50이 다르다 ────────────────────── */
test('E. [핵심] P50(general)+P50(tax) 방식이면 나올 수 없는 값이 combined P50으로 나온다', () => {
  // 두 자산의 수익률/변동성을 다르게 두고, 일반계좌는 A쪽, 절세계좌는 B쪽에 몰아 둔다 - 두 계좌의
  // 분포 모양이 서로 달라져 "각자의 중앙값을 더한 값"과 "합쳐서 구한 중앙값"이 일치하지 않게 된다.
  const instruments = [
    { key: 'A', weight: 1, muAnnual: 0.08, sigmaAnnual: 0.30 },
    { key: 'B', weight: 0, muAnnual: 0.02, sigmaAnnual: 0.05 }
  ];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 1000000, instruments, correlationMatrix: [[1, -0.5], [-0.5, 1]], iterations: 2000,
    taxScope: { initialBalances: [0, 1000000] }
  }));
  const gP50 = r.accountScopes.general.at(-1).p50;
  const tP50 = r.accountScopes.taxAdvantaged.at(-1).p50;
  const cP50 = r.accountScopes.combined.at(-1).p50;
  assert.notStrictEqual(cP50, gP50 + tP50, 'combined P50이 두 P50의 단순 합과 같다 - 잘못된 합산 구조일 수 있다');
  // 그러나 터무니없이 다르지도 않아야 한다(같은 경로를 공유하므로 근처 값이어야 정상).
  assert.ok(Math.abs(cP50 - (gP50 + tP50)) / cP50 < 0.5, 'combined P50이 비정상적으로 벗어났다');
});

/* ── F. 절세계좌 납입(월납/연납 매핑) ───────────────────────────────────── */
test('F. 절세계좌 납입은 월별 배열 그대로 반영된다 - 연납은 각 연도 첫 달에만 들어간다', () => {
  const months = 20 * 12;
  // 연납 100만원: deterministic computeFutureValueAnnual이 "매년 초 1회 납입"(기초급)이므로
  // 각 연도의 첫 달(m=1,13,25,...)에만 금액이 있는 배열로 매핑한다.
  const yearly = new Float64Array(months);
  for (let m = 1; m <= months; m++) if ((m - 1) % 12 === 0) yearly[m - 1] = 1000000;
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0, sigmaAnnual: 0 }];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 0, instruments, correlationMatrix: [[1]],
    taxScope: { initialBalances: [0], monthlyContributions: [yearly] }
  }));
  // μ=0이므로 20년간 납입 원금 그대로 = 100만 × 20회
  assert.strictEqual(Math.round(r.accountScopes.taxAdvantaged.at(-1).p50), 20000000);
  assert.strictEqual(Math.round(r.accountScopes.general.at(-1).p50), 0, '일반계좌에 절세 납입이 섞이면 안 된다');
});

/* ── I/J. 범위 조합과 milestone 완전성 ───────────────────────────────────── */
test('I/J. general/tax/combined 각각 5/10/15/20년 × P10~P90과 goalProbability를 갖는다', () => {
  const instruments = [{ key: 'A', weight: 1, muAnnual: 0.05, sigmaAnnual: 0.12 }];
  const r = runMonthlyPrecisionMC(deterministicConfig({
    pv0: 1000000, instruments, correlationMatrix: [[1]], iterations: 100,
    goalAmounts: [1500000],
    taxScope: { initialBalances: [500000] }
  }));
  ['general', 'taxAdvantaged', 'combined'].forEach((scope) => {
    const ms = r.accountScopes[scope];
    assert.deepStrictEqual(ms.map((x) => x.year), [5, 10, 15, 20], `${scope} milestone 연차가 다르다`);
    ms.forEach((mst) => {
      ['p10', 'p25', 'p50', 'p75', 'p90'].forEach((k) => assert.ok(Number.isFinite(mst[k]), `${scope} ${mst.year}년 ${k} 없음`));
      // goalProbability는 원표본에서 세는 것이므로 각 범위마다 자기 분포 기준으로 존재해야 한다.
      assert.ok(mst.goalProbability && Number.isFinite(mst.goalProbability[1500000]), `${scope} ${mst.year}년 goalProbability 없음`);
    });
  });
  // 같은 목표금액이라면 combined가 general보다 도달 확률이 높거나 같아야 한다(자산이 더 많으므로).
  const g = r.accountScopes.general.at(-1).goalProbability[1500000];
  const c = r.accountScopes.combined.at(-1).goalProbability[1500000];
  assert.ok(c >= g, `combined 목표달성 비율이 general보다 낮다(general ${g}, combined ${c})`);
});
