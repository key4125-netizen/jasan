// [I-11 · PM 결정 D-1] 종목 마스터 Diff Gate 판정 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/ticker-master-diff-gate.test.js
//
// 무엇을 고정하는가: PM이 확정한 임계값과 "1건이라도 STOP"인 세 가지 무조건 조건.
// 네트워크 · 파일 교체 없이 순수 함수(computeDiff · evaluateThresholds)만 부른다.

const assert = require('node:assert');
const { test } = require('node:test');
const G = require('../scripts/ticker-master-diff-gate.js');
const EM = require('../js/28-exposure-master.js');
const { loadRiskSandbox } = require('./risk-sandbox.js');

const sb = loadRiskSandbox();
const APP = {
  looksLikeFundName: sb.evalInSandbox('looksLikeFundName'),
  benchmarkByExchange: sb.RISK_BENCHMARK_BY_LISTING_EXCHANGE
};
const CORE = new Set((EM.EXPOSURE_MASTER_ENTRIES || []).map((e) => e.ticker).filter(Boolean));

// 합성 마스터 - 실제 보유 종목을 쓰지 않는다(ZZ 접두어 관례). 핵심 종목 시나리오에서만 원장 티커를 쓴다.
function master(items) {
  const byKey = new Map();
  items.forEach((it) => byKey.set(it.yahooTicker, it));
  return { json: { items }, byKey, count: items.length, generatedAt: '2026-09-20T00:00:00.000Z' };
}
function kr(ticker, nameKr, exchange) { return { code: ticker.replace(/\..*$/, ''), yahooTicker: ticker, nameKr, nameEn: '', market: 'KR', exchange: exchange || 'KOSPI' }; }
function us(ticker, nameEn, exchange) { return { code: ticker, yahooTicker: ticker, nameKr: '', nameEn, market: 'US', exchange: exchange || 'NASDAQ' }; }

function bulk(n, prefix, exchange) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(kr(`ZZ${prefix}${i}.KS`, `합성${prefix}${i}`, exchange));
  return out;
}
function decide(cur, nxt) {
  return G.evaluateThresholds(G.computeDiff(cur, nxt, APP, CORE)).decision;
}

test('변경이 없으면 APPLY', () => {
  const a = master([kr('ZZA.KS', '합성가', 'KOSPI'), us('ZZUS', 'SYNTH US')]);
  assert.strictEqual(decide(a, master([kr('ZZA.KS', '합성가', 'KOSPI'), us('ZZUS', 'SYNTH US')])), 'APPLY');
});

test('소규모 정상 변경(신규 30 · 삭제 33 · 미국 거래소 이동 1)은 APPLY', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, ...bulk(33, 'D'), us('ZZMOVE', 'SYNTH MOVE', 'NYSE')]);
  const nxt = master([...base, ...bulk(30, 'N'), us('ZZMOVE', 'SYNTH MOVE', 'NASDAQ')]);
  assert.strictEqual(decide(cur, nxt), 'APPLY');
});

test('국내 KOSPI→KOSDAQ 이동은 1건이라도 STOP', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, kr('ZZMV.KS', '합성이전', 'KOSPI')]);
  const nxt = master([...base, kr('ZZMV.KS', '합성이전', 'KOSDAQ')]);
  const d = G.computeDiff(cur, nxt, APP, CORE);
  const v = G.evaluateThresholds(d);
  assert.strictEqual(d.domesticExchangeMoveCount, 1);
  assert.strictEqual(v.decision, 'STOP');
  assert.ok(v.triggered.some((c) => c.id === 'DOMESTIC_EXCHANGE_MOVE'));
});

test('미국 거래소 간 이동은 국내 이동으로 세지 않는다(계산 영향 없음 · D-06)', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, us('ZZUSX', 'SYNTH X', 'NASDAQ')]);
  const nxt = master([...base, us('ZZUSX', 'SYNTH X', 'NYSE')]);
  const d = G.computeDiff(cur, nxt, APP, CORE);
  assert.strictEqual(d.exchangeChangedCount, 1);
  assert.strictEqual(d.domesticExchangeMoveCount, 0);
  assert.strictEqual(G.evaluateThresholds(d).decision, 'APPLY');
});

test('국내 종목 이름이 펀드형 판정을 뒤집으면 1건이라도 STOP', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, kr('ZZNM.KS', '합성전자', 'KOSPI')]);
  const nxt = master([...base, kr('ZZNM.KS', '합성전자 채권', 'KOSPI')]); // '채권' = BOND_KEYWORDS
  const d = G.computeDiff(cur, nxt, APP, CORE);
  const v = G.evaluateThresholds(d);
  assert.strictEqual(d.fundJudgementFlipCount, 1);
  assert.strictEqual(v.decision, 'STOP');
  assert.ok(v.triggered.some((c) => c.id === 'FUND_JUDGEMENT_FLIP'));
});

test('판정이 뒤집히지 않는 이름 변경(음차 등)은 STOP하지 않는다', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, kr('ZZNM2.KS', '합성전자', 'KOSPI')]);
  const nxt = master([...base, kr('ZZNM2.KS', '합성일렉트로닉스', 'KOSPI')]);
  const d = G.computeDiff(cur, nxt, APP, CORE);
  assert.strictEqual(d.nameChangedCount, 1);
  assert.strictEqual(d.fundJudgementFlipCount, 0);
  assert.strictEqual(G.evaluateThresholds(d).decision, 'APPLY');
});

test('핵심 종목(Exposure Master)이 삭제되면 1건이라도 STOP', () => {
  const core = [...CORE][0];
  assert.ok(core, '원장에 핵심 종목이 있어야 한다');
  const base = bulk(1000, 'B');
  const cur = master([...base, kr(core, '핵심종목', 'KOSPI')]);
  const nxt = master([...base]);
  const d = G.computeDiff(cur, nxt, APP, CORE);
  const v = G.evaluateThresholds(d);
  assert.strictEqual(d.coreImpactCount, 1);
  assert.strictEqual(v.decision, 'STOP');
  assert.ok(v.triggered.some((c) => c.id === 'CORE_IMPACT'));
});

test('절대 건수 임계값 - 신규 1000 · 삭제 500 · 거래소 10 · 이름 1000', () => {
  const big = bulk(30000, 'B'); // 비율 임계값에 먼저 걸리지 않도록 기준을 크게 둔다
  // 신규 1000
  assert.strictEqual(decide(master(big), master([...big, ...bulk(1000, 'N')])), 'STOP');
  assert.strictEqual(decide(master(big), master([...big, ...bulk(999, 'N')])), 'APPLY');
  // 삭제 500
  assert.strictEqual(decide(master([...big, ...bulk(500, 'D')]), master(big)), 'STOP');
  assert.strictEqual(decide(master([...big, ...bulk(499, 'D')]), master(big)), 'APPLY');
  // 거래소 변경 10(미국 간 이동이라 무조건 조건에는 안 걸리고 절대 건수로만 걸린다)
  const usCur = [], usNxt = [];
  for (let i = 0; i < 10; i += 1) { usCur.push(us(`ZZE${i}`, `SYNTH E${i}`, 'NASDAQ')); usNxt.push(us(`ZZE${i}`, `SYNTH E${i}`, 'NYSE')); }
  assert.strictEqual(decide(master([...big, ...usCur]), master([...big, ...usNxt])), 'STOP');
  assert.strictEqual(decide(master([...big, ...usCur.slice(0, 9)]), master([...big, ...usNxt.slice(0, 9)])), 'APPLY');
  // 이름 변경 1000(미국 종목 - 국내 판정 변화와 분리해서 절대 건수만 본다)
  const nCur = [], nNxt = [];
  for (let i = 0; i < 1000; i += 1) { nCur.push(us(`ZZN${i}`, `OLD ${i}`)); nNxt.push(us(`ZZN${i}`, `NEW ${i}`)); }
  assert.strictEqual(decide(master([...big, ...nCur]), master([...big, ...nNxt])), 'STOP');
  assert.strictEqual(decide(master([...big, ...nCur.slice(0, 999)]), master([...big, ...nNxt.slice(0, 999)])), 'APPLY');
});

test('비율 임계값 - 신규/삭제 5% · 이름 변경 10%', () => {
  const base = bulk(1000, 'B'); // 기준 1000건 -> 5% = 50건, 10% = 100건
  assert.strictEqual(decide(master(base), master([...base, ...bulk(50, 'N')])), 'STOP');
  assert.strictEqual(decide(master(base), master([...base, ...bulk(49, 'N')])), 'APPLY');
  assert.strictEqual(decide(master([...base, ...bulk(50, 'D')]), master(base)), 'APPLY'); // 삭제 50/1050 = 4.76%
  const nCur = [], nNxt = [];
  for (let i = 0; i < 100; i += 1) { nCur.push(us(`ZZP${i}`, `OLD ${i}`)); nNxt.push(us(`ZZP${i}`, `NEW ${i}`)); }
  assert.strictEqual(decide(master([...bulk(900, 'B'), ...nCur]), master([...bulk(900, 'B'), ...nNxt])), 'STOP');
});

test('임계값은 PM 확정값 그대로다(코드에서 조정하지 않는다)', () => {
  assert.deepStrictEqual({ ...G.THRESHOLDS }, {
    addedCount: 1000, removedCount: 500, exchangeChangedCount: 10, nameChangedCount: 1000,
    addedOrRemovedPct: 5, nameChangedPct: 10
  });
});

test('여러 조건에 동시에 걸리면 전부 기록한다(첫 조건에서 멈추지 않는다)', () => {
  const base = bulk(1000, 'B');
  const cur = master([...base, kr('ZZMV.KS', '합성이전', 'KOSPI'), ...bulk(60, 'D')]);
  const nxt = master([...base, kr('ZZMV.KS', '합성이전', 'KOSDAQ')]);
  const v = G.evaluateThresholds(G.computeDiff(cur, nxt, APP, CORE));
  assert.strictEqual(v.decision, 'STOP');
  assert.ok(v.triggered.length >= 2, `여러 조건이 잡혀야 한다: ${v.triggered.map((c) => c.id).join(',')}`);
});
