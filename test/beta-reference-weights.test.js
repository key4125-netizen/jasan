// [checklist §46 REF-01~11] 베타 기준 참고 비중 - 1.0 대체 폐지 · 미확정 종목 현재 비중 유지 · 합계 보존 · 최대 잔여법.
// 실행: node --test test/beta-reference-weights.test.js
//
// js/04의 순수 계산 함수(computeBetaReferencePlan · computeBetaReferenceApplyAll · computeBetaReferenceApplyOne ·
// roundPctsByLargestRemainder)를 브라우저와 같은 로드 순서의 vm 샌드박스에서 그대로 부른다(risk-sandbox.js).
// 베타는 Risk 엔진 결과 모양({ holdings: [{ ticker, beta, betaStatus }] })으로 합성해 넣는다 - 실제 사용자 데이터 없음.

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./risk-sandbox.js');

const s = H.loadRiskSandbox({ extraFiles: ['04-rebalancing.js'] });
const plain = (v) => JSON.parse(JSON.stringify(v));
const M = (rows) => ({ holdings: rows.map(([ticker, beta, betaStatus]) => ({ ticker, beta, betaStatus: betaStatus || (typeof beta === 'number' ? 'OK' : 'INSUFFICIENT_COMMON_DATES') })) });
const S = (rows) => rows.map(([ticker, pct]) => ({ ticker, name: ticker, pct }));
const plan = (stocks, total, metrics) => plain(s.computeBetaReferencePlan(stocks, total, metrics));
const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 1e6) / 1e6;
const noInternalCode = (text) => !/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/.test(text || '');

test('1. 모든 종목 베타 정상 - 1/β 비례, 0.1% 최대 잔여법으로 합계 30.0', () => {
  const p = plan(S([['AAA', 10], ['BBB', 10], ['CCC', 10]]), 30, M([['AAA', 0.8], ['BBB', 1.2], ['CCC', 1.5]]));
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.exact.map((x) => Math.round(x * 1000) / 1000), [13.636, 9.091, 7.273]);
  assert.deepStrictEqual(p.rounded, [13.6, 9.1, 7.3]);
  assert.strictEqual(sum(p.rounded), 30);
});

test('2 · 13. 일부 베타 null - 미확정 종목은 현재 비중 유지, 남은 비중만 확인 종목끼리', () => {
  const stocks = S([['AAA', 10], ['BBB', 10], ['CCC', 10]]);
  const p = plan(stocks, 30, M([['AAA', 0.8], ['BBB', 1.2], ['CCC', null]]));
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.pool, 20);
  assert.deepStrictEqual(p.rounded, [12, 8, null], '미확정 종목에는 숫자를 만들지 않는다(1.0 대체 없음)');
  assert.deepStrictEqual(plain(s.computeBetaReferenceApplyAll(stocks, p)), [12, 8, 10]);
  // v260 동작(1.0 대체)이었다면 12.162 / 8.108 / 9.730이었다 - 그 값이 아니어야 한다.
  assert.notDeepStrictEqual(p.rounded, [12.2, 8.1, 9.7]);
});

test('3 · 4. 베타 0 · 음수는 계산 불가(0 이하) - 1.0으로 바꾸지 않는다', () => {
  const p = plan(S([['AAA', 10], ['BBB', 10], ['CCC', 10], ['DDD', 10]]), 40, M([['AAA', 0], ['BBB', -0.4], ['CCC', 0.5], ['DDD', 1.0]]));
  assert.deepStrictEqual(p.confirmed, [false, false, true, true]);
  assert.deepStrictEqual(p.rows.map((r) => r.reason), ['NON_POSITIVE', 'NON_POSITIVE', null, null]);
  assert.strictEqual(p.pool, 20);
  assert.deepStrictEqual(p.rounded, [null, null, 13.3, 6.7]);
});

test('5. 극소 양수 베타도 유효 - 임의 하한 없이 1/β 그대로(역비례 방식의 결과)', () => {
  const p = plan(S([['AAA', 15], ['BBB', 15]]), 30, M([['AAA', 0.05], ['BBB', 1.0]]));
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.rounded, [28.6, 1.4]);
});

test('6. 베타 데이터 없음 - null · NaN · Infinity · 기준 지수 미확인은 모두 계산 불가(사유 구분)', () => {
  const p = plan(S([['AAA', 5], ['BBB', 5], ['CCC', 5], ['DDD', 5], ['EEE', 5]]), 25,
    M([['AAA', null, 'BENCHMARK_UNRESOLVED'], ['BBB', NaN], ['CCC', Infinity], ['DDD', 0.9], ['EEE', 1.1]]));
  assert.deepStrictEqual(p.rows.map((r) => r.reason), ['BENCHMARK_UNRESOLVED', 'BETA_UNAVAILABLE', 'BETA_UNAVAILABLE', null, null]);
  assert.strictEqual(p.pool, 10);
  assert.strictEqual(sum(p.rounded.filter((x) => x !== null)), 10);
});

test('7. Risk 결과 없음 - 참고 비중을 만들지 않고(균등 배분 없음) 적용도 하지 않는다', () => {
  const stocks = S([['AAA', 20], ['BBB', 10]]);
  const p = plan(stocks, 30, null);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'NO_RISK_DATA');
  assert.deepStrictEqual(p.rounded, [null, null], 'v260의 15 / 15 균등 배분을 만들지 않는다');
  assert.strictEqual(s.computeBetaReferenceApplyAll(stocks, p), null);
  assert.strictEqual(s.computeBetaReferenceApplyOne(stocks, p, 0), null);
  const note = s.betaReferenceNoteText(p);
  assert.ok(note.includes('계산할 수 없습니다') && note.includes('시장 민감도 자료가 아직 준비되지 않았습니다'), note);
  assert.ok(noInternalCode(note));
});

test('8. 목표만 지정한(미보유) 종목 - 계산 대상이 아니고 현재 비중 유지', () => {
  const stocks = S([['AAA', 10], ['BBB', 10], ['ZZZ', 5]]);
  const p = plan(stocks, 25, M([['AAA', 0.8], ['BBB', 1.2]]));
  assert.deepStrictEqual(p.confirmed, [true, true, false]);
  assert.strictEqual(p.rows[2].reason, 'NOT_HELD');
  assert.strictEqual(plain(s.computeBetaReferenceApplyAll(stocks, p))[2], 5);
});

test('9 · 10. 확인 종목 0개 · 1개 - 계산 불가(비교할 수 없음), 숫자 없음', () => {
  const zero = plan(S([['AAA', 10], ['BBB', 10]]), 20, M([['AAA', null], ['BBB', 0]]));
  const one = plan(S([['AAA', 10], ['BBB', 10]]), 20, M([['AAA', 0.9], ['BBB', null]]));
  [zero, one].forEach((p) => {
    assert.strictEqual(p.ok, false);
    assert.strictEqual(p.reason, 'FEWER_THAN_TWO');
    assert.deepStrictEqual(p.rounded, [null, null]);
  });
  assert.strictEqual(zero.confirmedCount, 0);
  assert.strictEqual(one.confirmedCount, 1);
  assert.ok(s.betaReferenceNoteText(one).includes('확인한 종목이 1개뿐이라'));
  assert.ok(noInternalCode(s.betaReferenceNoteText(zero)));
});

test('11. 확인 종목 2개 - 개별 적용 결과가 전체 적용과 같다(정상)', () => {
  const stocks = S([['AAA', 20], ['BBB', 20]]);
  const p = s.computeBetaReferencePlan(stocks, 40, M([['AAA', 0.5], ['BBB', 1.5]]));
  const all = plain(s.computeBetaReferenceApplyAll(stocks, p));
  assert.deepStrictEqual(all, [30, 10]);
  assert.deepStrictEqual(plain(s.computeBetaReferenceApplyOne(stocks, p, 0)), all);
  assert.deepStrictEqual(plain(s.computeBetaReferenceApplyOne(stocks, p, 1)), all);
});

test('12. 미확정 비중이 주식 비중 전체와 같으면 나눌 비중이 없어 계산 불가(미확정 비중을 줄이지 않는다)', () => {
  const stocks = S([['AAA', 0], ['BBB', 0], ['CCC', 30]]);
  const p = plan(stocks, 30, M([['AAA', 0.8], ['BBB', 1.2], ['CCC', null]]));
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'NO_POOL');
  assert.strictEqual(s.computeBetaReferenceApplyAll(stocks, p), null);
  assert.ok(s.betaReferenceNoteText(p).includes('나눌 비중이 없습니다'));
});

test('14. 개별 적용 - 그 종목은 배지 값, 차이는 다른 확인 종목이 현재 비중 비례로 흡수, 합계 보존', () => {
  // v260: 20/20/0에서 한 종목만 바꿔 '주식' 합계가 달라졌다. 이제 합계 40 그대로.
  const stocks = S([['AAA', 20], ['BBB', 20], ['CCC', 0]]);
  const p = s.computeBetaReferencePlan(stocks, 40, M([['AAA', 0.5], ['BBB', 1.5], ['CCC', 1.0]]));
  assert.deepStrictEqual(plain(p.rounded), [21.8, 7.3, 10.9]);
  const next = plain(s.computeBetaReferenceApplyOne(stocks, p, 0));
  assert.deepStrictEqual(next, [21.8, 18.2, 0], 'CCC는 현재 0%라 현재 비중 비례 몫이 0');
  assert.strictEqual(sum(next), 40);
});

test('15. 전체 적용 - 합계 보존', () => {
  const stocks = S([['AAA', 20], ['BBB', 20], ['CCC', 0]]);
  const p = s.computeBetaReferencePlan(stocks, 40, M([['AAA', 0.5], ['BBB', 1.5], ['CCC', 1.0]]));
  const next = plain(s.computeBetaReferenceApplyAll(stocks, p));
  assert.deepStrictEqual(next, [21.8, 7.3, 10.9]);
  assert.strictEqual(sum(next), 40);
});

test('16. 다른 확인 종목의 현재 비중 합이 0이면 참고 비중 비례로 나눈다', () => {
  const stocks = S([['AAA', 40], ['BBB', 0], ['CCC', 0]]);
  const p = s.computeBetaReferencePlan(stocks, 40, M([['AAA', 0.5], ['BBB', 1.5], ['CCC', 1.0]]));
  const next = plain(s.computeBetaReferenceApplyOne(stocks, p, 0));
  assert.deepStrictEqual(next, [21.8, 7.3, 10.9]);
  assert.strictEqual(sum(next), 40);
});

test('17. 반올림 잔여 - 10%를 셋으로 나누면 3.4 + 3.3 + 3.3 = 10.0(9.9가 아님)', () => {
  const stocks = S([['AAA', 4], ['BBB', 3], ['CCC', 3]]);
  const p = s.computeBetaReferencePlan(stocks, 10, M([['AAA', 1], ['BBB', 1], ['CCC', 1]]));
  const next = plain(s.computeBetaReferenceApplyAll(stocks, p));
  assert.deepStrictEqual(next, [3.4, 3.3, 3.3]);
  assert.strictEqual(sum(next), 10);
  // 동률이면 참고 비중이 큰 종목이 먼저 보정된다.
  assert.deepStrictEqual(plain(s.roundPctsByLargestRemainder([1 / 3, 1 / 3 + 1e-15, 1 / 3], 1, [1, 2, 1])), [0.3, 0.4, 0.3]);
});

test('18 · 19 · 20. 여러 조합에서 합계 보존 · 음수 없음 · 미확정 종목 불변(개별 · 전체 적용)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let checked = 0;
  for (let n = 0; n < 300; n += 1) {
    const count = 2 + Math.floor(rnd() * 2);                       // 2~3개(모달 최대 3개)
    const rows = [];
    const stocks = [];
    for (let i = 0; i < count; i += 1) {
      const t = 'T' + i;
      const r = rnd();
      const beta = r < 0.2 ? null : r < 0.25 ? -0.3 : r < 0.3 ? 0 : 0.05 + rnd() * 2.5;
      rows.push([t, beta]);
      stocks.push([t, Math.round(rnd() * 400) / 10]);             // 0.0~40.0%
    }
    const st = S(stocks);
    const total = sum(st.map((x) => x.pct));
    const p = s.computeBetaReferencePlan(st, total, M(rows));
    if (!p.ok) { assert.strictEqual(s.computeBetaReferenceApplyAll(st, p), null); continue; }
    const variants = [plain(s.computeBetaReferenceApplyAll(st, p))];
    p.confirmed.forEach((c, i) => { if (c) variants.push(plain(s.computeBetaReferenceApplyOne(st, p, i))); });
    variants.forEach((next) => {
      assert.ok(Math.abs(sum(next) - total) < 1e-9, `합계 ${sum(next)} ≠ ${total}`);
      next.forEach((v) => assert.ok(v >= 0, `음수 ${v}`));
      p.confirmed.forEach((c, i) => { if (!c) assert.strictEqual(next[i], st[i].pct, '미확정 종목 불변'); });
      checked += 1;
    });
  }
  assert.ok(checked > 200, String(checked));
});

test('1.0 대체 코드가 남아 있지 않다(js/04)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '04-rebalancing.js'), 'utf8');
  assert.ok(!src.includes("h.beta > 0) ? h.beta : 1.0"));
  assert.ok(!src.includes('computeAiOptimalStockWeights'));
});
