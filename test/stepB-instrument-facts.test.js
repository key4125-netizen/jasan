/* [PM STEP B~E] 상품 고유 사실은 소유자 · 계좌 · 거래가 달라도 하나다.
 *
 * PM 지시 §26의 사용자 시나리오를 그대로 고정한다.
 *   · 같은 상품이면 한 번 확인한 사실을 모든 보유분이 쓴다(다시 입력하지 않는다)
 *   · 확정값이 갈리면 어느 쪽도 고르지 않는다 - 상품을 둘로 쪼개지도 않는다
 *   · 한쪽만 입력하고 다른 쪽이 공식 자료를 따르는 경우도 실제 쓰이는 값으로 비교해 잡아낸다
 *   · 보유 사실(수량 · 매입가 · 소유자 · 계좌)은 절대 공유하지 않는다
 *   · 배열 순서가 답을 바꾸지 않는다
 *
 * 실제 js/01~10 · 16 · 28 · 29를 샌드박스에 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 실행: node --test test/stepB-instrument-facts.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const SB = loadAdapterSandbox();
SB.applyTickerMasterData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ticker-master.json'), 'utf8')));

// 원장에 A등급 비헤지로 등재된 상품 / 원장에 없는 상품
const WITH_MASTER = '360750.KS';
const NO_MASTER = '133690.KS';

const hold = (over) => SB.makeAsset(Object.assign({
  id: 'zz-1', ticker: NO_MASTER, name: 'ZZ 미국나스닥100 ETF', category: 'ETF',
  owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내',
  quantity: 100, buyPrice: 10000, currentPrice: 12000
}, over || {}));

// 같은 상품을 여러 보유분으로. over[i]가 각 보유분의 저장값이다.
const holdings = (overs, ticker) => overs.map((o, i) => hold(Object.assign({
  id: 'zz-' + i, ticker: ticker || NO_MASTER,
  owner: i === 0 ? '신랑' : '와이프', accountType: i === 2 ? '연금저축' : '일반계좌'
}, o || {})));

const withState = (list, fn) => {
  const before = SB.state.assets;
  SB.state.assets = list;
  try { return fn(); } finally { SB.state.assets = before; }
};

/* ══ CASE 1~4 · 7 — 같은 상품이면 사실은 하나 ═══════════════════════════ */

test('CASE 1. 같은 상품 · 같은 소유자 · 거래가 여러 건이어도 상품 사실은 하나다', () => {
  // 거래가 몇 건이든 값은 자산(보유분)에 저장된다 - 같은 보유분이면 애초에 하나다.
  const list = [hold({ id: 'zz-0', fxHedgeStatus: 'HEDGED' })];
  withState(list, () => {
    assert.strictEqual(SB.resolveInstrumentFxHedge(list[0]).status, 'HEDGED');
    assert.strictEqual(SB.resolveInstrumentFxHedge(list[0]).source, 'userOverride');
  });
});

test('CASE 2 · 3 · 4. 한 보유분에서 확인하면 다른 소유자 · 다른 계좌도 같은 사실을 쓴다', () => {
  const list = holdings([{ fxHedgeStatus: 'HEDGED' }, {}, {}]);
  withState(list, () => {
    list.forEach((a) => {
      assert.strictEqual(SB.resolveInstrumentFxHedge(a).status, 'HEDGED', a.id + ' 환헤지');
    });
    // 저장은 여전히 신랑 보유분에만 돼 있다 - 앱이 값을 퍼뜨려 저장하지 않는다.
    assert.deepStrictEqual(list.map((a) => a.fxHedgeStatus), ['HEDGED', undefined, undefined]);
  });
});

test('CASE 7. 공식 자료가 있고 사용자 입력이 없으면 모든 보유분이 그 자료를 쓴다', () => {
  const list = holdings([{}, {}], WITH_MASTER);
  withState(list, () => {
    list.forEach((a) => {
      const r = SB.resolveInstrumentFxHedge(a);
      assert.strictEqual(r.status, 'UNHEDGED');
      assert.strictEqual(r.source, 'instrumentMaster');
      assert.strictEqual(r.conflict, false);
    });
  });
});

/* ══ CASE 5 · 6 · 8 — 갈리면 고르지 않는다 ═════════════════════════════ */

test('CASE 5. 확정값이 서로 다르면 어느 쪽도 쓰지 않는다(상품을 둘로 쪼개지 않는다)', () => {
  const list = holdings([{ fxHedgeStatus: 'HEDGED' }, { fxHedgeStatus: 'UNHEDGED' }]);
  withState(list, () => {
    list.forEach((a) => {
      const r = SB.resolveInstrumentFxHedge(a);
      assert.strictEqual(r.status, null, '임의 선택 금지');
      assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
    });
    const c = SB.fxHedgeConflictFor(list[0], list);
    assert.strictEqual(c.conflict, true);
    assert.strictEqual(c.kind, 'holdingConflict');
    assert.strictEqual(c.resolved, null);
  });
});

test('CASE 6. 한쪽만 입력하고 다른 쪽이 공식 자료를 따르면 - 실제 쓰이는 값으로 비교해 잡아낸다', () => {
  // 이 상품은 공식 자료가 UNHEDGED라고 적어 둔 상품이다.
  const list = holdings([{ fxHedgeStatus: 'HEDGED' }, {}], WITH_MASTER);
  withState(list, () => {
    const c = SB.fxHedgeConflictFor(list[0], list);
    assert.strictEqual(c.conflict, true, '입력값끼리만 보면 놓치는 경우다');
    assert.strictEqual(c.kind, 'masterMismatch');
    assert.strictEqual(c.resolved, null, '어느 쪽도 쓰지 않는다 - 공식 자료도 사용자 값도 임의 채택 금지');
  });
});

test('CASE 8. 공식 자료와 사용자 확정이 다르면 조용히 덮어쓰지 않고 알린다', () => {
  const list = holdings([{ fxHedgeStatus: 'HEDGED' }], WITH_MASTER);
  withState(list, () => {
    const r = SB.resolveInstrumentFxHedge(list[0]);
    assert.strictEqual(r.status, null, '확정을 보류한다');
    assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
    assert.strictEqual(r.override, 'HEDGED', '사용자 값은 지워지지 않는다');
    assert.strictEqual(r.master, 'UNHEDGED', '공식 값도 그대로다');
    assert.strictEqual(r.conflict, true);
    assert.strictEqual(list[0].fxHedgeStatus, 'HEDGED', '저장값을 건드리지 않는다');
  });
});

/* ══ CASE 9 — 배열 순서 ════════════════════════════════════════════════ */

test('CASE 9. 배열 순서를 바꿔도 모든 상품 사실의 답이 같다', () => {
  const build = () => holdings([
    { fxHedgeStatus: 'HEDGED', marketBetaIndexOverride: 'KOSPI', rateMatchOverride: 'NASDAQ' },
    {}, {}
  ]);
  const snap = (arr) => arr.map((a) => [
    a.id,
    SB.resolveInstrumentFxHedge(a, arr).status,
    (SB.resolveInstrumentMarketBetaIndex(a, arr) || {}).value,
    (SB.resolveInstrumentRateMatch(a, arr) || {}).value
  ].join('/')).sort().join('|');
  const asIs = build();
  const rev = build().reverse();
  const shuffled = build();
  shuffled.push(shuffled.shift());
  assert.strictEqual(snap(asIs), snap(rev));
  assert.strictEqual(snap(asIs), snap(shuffled));
});

/* ══ 보유 사실은 공유하지 않는다 ═══════════════════════════════════════ */

test('경계. 보유 사실(수량 · 매입가 · 소유자 · 계좌)은 절대 공유하지 않는다', () => {
  const list = holdings([{ fxHedgeStatus: 'HEDGED', quantity: 100, buyPrice: 10000 },
    { quantity: 7, buyPrice: 555 }]);
  withState(list, () => {
    SB.resolveInstrumentFxHedge(list[1]);
    assert.strictEqual(list[1].quantity, 7);
    assert.strictEqual(list[1].buyPrice, 555);
    assert.strictEqual(list[1].owner, '와이프');
    assert.strictEqual(list[0].owner, '신랑');
  });
});

test('경계. 상품 사실을 읽어도 저장값을 바꾸지 않는다(읽기 전용)', () => {
  const list = holdings([{ fxHedgeStatus: 'HEDGED', marketBetaIndexOverride: 'KOSPI' }, {}]);
  const before = JSON.stringify(list);
  withState(list, () => {
    SB.resolveInstrumentFxHedge(list[1]);
    SB.resolveInstrumentMarketBetaIndex(list[1]);
    SB.resolveInstrumentRateMatch(list[1]);
    SB.resolveInstrumentCategory(list[1]);
    SB.resolveInstrumentName(list[1]);
  });
  assert.strictEqual(JSON.stringify(list), before);
});

/* ══ 다른 상품 사실들도 같은 규칙을 쓴다 ═══════════════════════════════ */

test('기준 지수. 한 번 확인하면 같은 상품 전체가 쓴다 · 갈리면 고르지 않는다', () => {
  const one = holdings([{ marketBetaIndexOverride: 'KOSPI' }, {}]);
  withState(one, () => {
    one.forEach((a) => assert.strictEqual(SB.resolveInstrumentMarketBetaIndex(a).value, 'KOSPI', a.id));
    // Risk가 실제로 그 값을 쓴다.
    assert.strictEqual(SB.resolveMarketRiskBenchmark(one[1]).key, 'KOSPI');
  });
  const two = holdings([{ marketBetaIndexOverride: 'KOSPI' }, { marketBetaIndexOverride: 'SP500' }]);
  withState(two, () => {
    assert.strictEqual(SB.resolveInstrumentMarketBetaIndex(two[0]).status, 'CONFLICT');
    const bm = SB.resolveMarketRiskBenchmark(two[0]);
    assert.strictEqual(bm.key, null, '갈리면 베타를 만들지 않는다');
    assert.strictEqual(bm.source, 'instrumentIndexConflict');
  });
});

test('자산 분류. 사용자가 확정한 분류는 같은 상품 전체가 쓴다(자동 추천값은 막지 않는다)', () => {
  const list = holdings([{ category: '채권' }, { category: 'ETF' }]);
  // makeAsset이 명시 category를 받으면 categorySource='user'가 된다.
  assert.strictEqual(list[0].categorySource, 'user');
  withState(list, () => {
    const f = SB.resolveInstrumentCategory(list[0]);
    assert.strictEqual(f.status, 'CONFLICT', '확정값이 갈리면 고르지 않는다');
    // 화면 · 합계가 멈추지 않도록 각자의 저장값으로 폴백한다(값을 지우지 않는다).
    assert.strictEqual(SB.effectiveInstrumentCategory(list[0]), '채권');
    assert.strictEqual(SB.effectiveInstrumentCategory(list[1]), 'ETF');
  });
});

test('상품명. 티커가 없는 자산은 이름이 곧 식별자라 통합 대상이 아니다', () => {
  const cash = SB.makeAsset({ id: 'zz-c', ticker: '', name: 'ZZ 예금', category: '현금', owner: '신랑', accountType: '일반계좌', currency: 'KRW', quantity: 1, buyPrice: 1 });
  withState([cash], () => {
    const f = SB.resolveInstrumentName(cash);
    assert.strictEqual(f.reason, 'nameIsIdentity');
    assert.strictEqual(f.value, 'ZZ 예금');
  });
});

test('상품명. 티커가 같은데 이름이 다르면 이름 키워드를 근거로 쓰지 않는다', () => {
  const list = holdings([{ name: 'ZZ 미국나스닥100 ETF' }, { name: 'ZZ 미국S&P500 ETF' }]);
  withState(list, () => {
    assert.strictEqual(SB.resolveInstrumentName(list[0]).status, 'CONFLICT');
    const d = SB.resolveAssetGroupKeyDetail(list[0]);
    assert.strictEqual(d.nameConflict, true, '어느 이름을 믿을지 앱이 정하지 않는다');
    assert.strictEqual(d.source, 'unresolved');
  });
});

test('역할(포지션). 같은 상품이면 하나이고, 갈리면 고르지 않는다', () => {
  const roles = Object.keys(SB.evalInSandbox('ASSET_ROLE_LABELS') ? JSON.parse(SB.evalInSandbox('JSON.stringify(ASSET_ROLE_LABELS)')) : {});
  const list = holdings([{ role: roles[0] }, {}]);
  withState(list, () => {
    assert.strictEqual(SB.resolveInstrumentRole(list[1]).value, roles[0], '한 번 정하면 같은 상품 전체가 쓴다');
  });
  const split = holdings([{ role: roles[0] }, { role: roles[1] }]);
  withState(split, () => {
    assert.strictEqual(SB.resolveInstrumentRole(split[0]).status, 'CONFLICT');
  });
});

/* ══ 결함 1 — 사용자 안내 ══════════════════════════════════════════════ */

test('결함 1. 기준 지수가 갈려 베타를 못 구하면 그 사유를 사람 말로 말한다', () => {
  const text = SB.evalInSandbox("JSON.stringify([betaUnresolvedSourceText('instrumentIndexConflict'), betaUnresolvedSourceText('holdingConflict')])");
  const [a, b] = JSON.parse(text);
  [a, b].forEach((msg) => {
    assert.ok(msg, '일반 문구로 떨어지면 무엇을 고쳐야 할지 알 수 없다');
    assert.match(msg, /같은 종목/);
    assert.match(msg, /맞춰 주세요/, '무엇을 해야 하는지 말해야 한다');
  });
});

/* ══ [PM 최종 지시] 판정 6가지 경우를 그대로 고정한다 ══════════ */

test('판정표. Master · 사용자 확정값 조합 6가지', () => {
  const fact = (list) => withState(list, () => SB.resolveInstrumentFxHedge(list[0], list));

  // 1. Master와 사용자 확정값이 같다 → RESOLVED
  let r = fact(holdings([{ fxHedgeStatus: 'UNHEDGED' }, {}], WITH_MASTER));
  assert.strictEqual(r.status, 'UNHEDGED');
  assert.strictEqual(r.conflict, false);

  // 2. Master만 있다 → Master로 RESOLVED
  r = fact(holdings([{}, {}], WITH_MASTER));
  assert.strictEqual(r.status, 'UNHEDGED');
  assert.strictEqual(r.source, 'instrumentMaster');

  // 3. 사용자 확정값만 있다 → 그 값으로 RESOLVED
  r = fact(holdings([{ fxHedgeStatus: 'HEDGED' }, {}], NO_MASTER));
  assert.strictEqual(r.status, 'HEDGED');
  assert.strictEqual(r.source, 'userOverride');

  // 4. 사용자 확정값끼리 다르다 → CONFLICT
  r = fact(holdings([{ fxHedgeStatus: 'HEDGED' }, { fxHedgeStatus: 'UNHEDGED' }], NO_MASTER));
  assert.strictEqual(r.status, null);
  assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
  assert.strictEqual(r.instrument.reason, 'holdingConflict');

  // 5. Master와 사용자 확정값이 다르다 → CONFLICT (임의 선택 금지)
  r = fact(holdings([{ fxHedgeStatus: 'HEDGED' }, {}], WITH_MASTER));
  assert.strictEqual(r.status, null, 'Master도 사용자 값도 계산에 쓰지 않는다');
  assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
  assert.strictEqual(r.instrument.reason, 'masterMismatch');
  assert.strictEqual(r.override, 'HEDGED', '사용자 값은 보존된다');
  assert.strictEqual(r.master, 'UNHEDGED', '공식 값도 보존된다');

  // 6. 아무것도 없다 → UNRESOLVED
  r = fact(holdings([{}, {}], NO_MASTER));
  assert.strictEqual(r.status, null);
  assert.strictEqual(r.source, 'UNRESOLVED');
  assert.strictEqual(r.conflict, false, '근거가 없는 것과 충돌은 다르다');
});

test('판정표. 임의 선택 금지가 모든 상품 사실에 같이 적용된다', () => {
  // 수익률 기준 - 보유분 확정값과 「수익률 관리」 종목 기준이 어긋나면 어느 쪽도 쓰지 않는다.
  const list = holdings([{ rateMatchOverride: 'NASDAQ' }, {}], NO_MASTER);
  withState(list, () => {
    const before = SB.state.projection.instrumentReturnKeys;
    SB.state.projection.instrumentReturnKeys = { [NO_MASTER]: 'KOSPI' };
    try {
      const f = SB.resolveInstrumentRateMatch(list[0]);
      assert.strictEqual(f.status, 'CONFLICT');
      assert.strictEqual(f.reason, 'masterMismatch');
      assert.strictEqual(f.value, null, '임의의 한쪽을 계산에 쓰지 않는다');
      const d = SB.resolveAssetGroupKeyDetail(list[0]);
      assert.notStrictEqual(d.source, 'override');
      assert.strictEqual(d.masterMismatch, true);
    } finally { SB.state.projection.instrumentReturnKeys = before; }
  });
});

test('임의 선택 금지. 환헤지가 충돌하면 Risk도 공식 자료로 계산하지 않는다', () => {
  // 사용자 HEDGED · 원장 UNHEDGED - 기준지수를 따로 고르지 않았으므로 원장 경로로 간다.
  const list = holdings([{ fxHedgeStatus: 'HEDGED' }, {}], WITH_MASTER);
  withState(list, () => {
    const bm = SB.resolveMarketRiskBenchmark(list[0]);
    assert.strictEqual(bm.key, null, '원장 값으로 조용히 계산하지 않는다');
    assert.strictEqual(bm.source, 'instrumentHedgeConflict');
  });
  // 둘이 같아지면 예전처럼 계산된다(회귀 보호).
  const ok = holdings([{ fxHedgeStatus: 'UNHEDGED' }, {}], WITH_MASTER);
  withState(ok, () => {
    assert.strictEqual(SB.resolveMarketRiskBenchmark(ok[0]).status, 'RESOLVED');
  });
});

test('임의 선택 금지. 모든 사유 코드가 사람 말로 설명된다', () => {
  const codes = ['instrumentHedgeConflict', 'instrumentIndexConflict', 'holdingConflict'];
  codes.forEach((c) => {
    const msg = JSON.parse(SB.evalInSandbox('JSON.stringify(betaUnresolvedSourceText(' + JSON.stringify(c) + '))'));
    assert.ok(msg, c + ' 사유가 일반 문구로 떨어지면 안 된다');
    assert.match(msg, /맞춰 주세요/);
  });
});
