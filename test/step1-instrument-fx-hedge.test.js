/* [PM STEP 1] 상품 기준정보 — 환헤지 해석 · 충돌 · 원화 채권 차단 고정.
 *
 * 이 파일이 지키는 것 셋.
 *   1-A  환헤지 사실을 한 곳에서 해석한다 - 사용자 Override → Exposure Master → UNRESOLVED.
 *        값을 복사하지 않는다(Master는 Master로, Override는 Override로 남는다).
 *   1-B  같은 종목을 보유분마다 다른 환헤지로 들고 있으면 사실만 알린다.
 *        고르지 않고 · 전파하지 않고 · 지우지 않는다(PMD-02 / N-10).
 *   1-C  원화 채권은 환헤지를 묻지 않는다(§58-5 · js/29 resolveBondHedgeStatusDetail 0순위).
 *        국내/해외 입력에 기대지 않는다 - 거래 폼에는 그 칸이 아예 없다(§58-4).
 *
 * 실제 js/01~10 · 28 · 29를 샌드박스에 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 실행: node --test test/step1-instrument-fx-hedge.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const SB = loadAdapterSandbox();
SB.applyTickerMasterData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ticker-master.json'), 'utf8')));

// 원장에 A등급 비헤지로 등재된 국내상장 해외 ETF(§51-4 · EM-2026.x)
const MASTER_UNHEDGED = '360750.KS';
// 원장에 없는 국내상장 해외 ETF - 사용자 확인 외에는 근거가 없다
const MASTER_ABSENT = '133690.KS';

const etf = (over) => Object.assign({
  id: 'zz-a', ticker: MASTER_UNHEDGED, name: 'ZZ 미국S&P500 ETF', category: 'ETF',
  currency: 'KRW', isDomestic: '국내', quantity: 100, buyPrice: 10000, currentPrice: 12000
}, over || {});

const bond = (over) => Object.assign({
  id: 'zz-b', ticker: 'KR103502GE95', name: 'ZZ 국고채권', category: '채권',
  currency: 'KRW', quantity: 100, buyPrice: 10000, currentPrice: 10100
}, over || {});

const hedgeOf = (a) => SB.resolveInstrumentFxHedge(a);
const offers = (a) => SB.fxHedgeChoiceStateOf(a);

/* ══ 1-A. 해석 순서 ═════════════════════════════════════════════════════ */

test('1-A-1. Master = UNHEDGED · 사용자 없음 → Master를 쓴다(값은 복사하지 않는다)', () => {
  const r = hedgeOf(etf());
  assert.strictEqual(r.status, 'UNHEDGED');
  assert.strictEqual(r.source, 'instrumentMaster');
  assert.strictEqual(r.master, 'UNHEDGED');
  assert.strictEqual(r.override, null, '자산에는 값을 쓰지 않는다');
  assert.strictEqual(r.conflict, false);
});

/* [PM 최종 지시] 예전에는 사용자 확정값이 원장을 이겼다. 그러면 사용자 값이 공식 자료를
 * 조용히 이기는 것과 같다 - 반대로 원장을 쓰면 사용자의 확인을 조용히 덮어쓰는 것이 된다.
 * 둘 다 임의 선택이므로 **어느 쪽도 쓰지 않고** 확인을 요청한다. 저장값은 그대로 남는다. */
test('1-A-2. Master = UNHEDGED · 사용자 = HEDGED → 어느 쪽도 쓰지 않고 확인을 요청한다', () => {
  const r = hedgeOf(etf({ fxHedgeStatus: 'HEDGED' }));
  assert.strictEqual(r.status, null, '임의의 한쪽을 계산에 쓰지 않는다');
  assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
  assert.strictEqual(r.override, 'HEDGED', '사용자가 확인한 값은 그대로 보인다');
  assert.strictEqual(r.master, 'UNHEDGED', '원장 값도 그대로 남는다');
  assert.strictEqual(r.conflict, true);
});

test('1-A-3. Master = UNHEDGED · 사용자도 UNHEDGED → 충돌이 아니다', () => {
  const r = hedgeOf(etf({ fxHedgeStatus: 'UNHEDGED' }));
  assert.strictEqual(r.status, 'UNHEDGED');
  assert.strictEqual(r.source, 'userOverride');
  assert.strictEqual(r.conflict, false);
});

test('1-A-4. 원장에 없고 사용자도 없으면 UNRESOLVED - 비헤지로 단정하지 않는다', () => {
  const r = hedgeOf(etf({ ticker: MASTER_ABSENT }));
  assert.strictEqual(r.status, null);
  assert.strictEqual(r.source, 'UNRESOLVED');
  assert.strictEqual(r.master, null);
});

test('1-A-5. MC 자산군이 같은 해석을 쓴다 - Risk와 갈라지지 않는다', () => {
  const cma = SB.getActiveCmaSet();
  const cls = (a) => SB.resolveMcAppAssetClass({ key: null, subject: a }).appClass;
  const sigma = (a) => SB.resolveCmaRiskForAppClass(cls(a), cma).volatilityPct;

  // 원장이 비헤지라고 말하는 종목은 환노출 자산군 그대로다(기존 계산과 같다).
  assert.strictEqual(cls(etf()), 'US_EQUITY');
  assert.strictEqual(cls(etf({ fxHedgeStatus: 'UNHEDGED' })), 'US_EQUITY');
  /* [PM 최종 지시] 이 종목은 원장이 비헤지라고 적어 둔 상품이다 - 사용자가 환헤지로 적어도
   * 둘이 어긋나므로 확정하지 않는다. 확정되지 않은 환헤지는 자산군을 바꾸지 않는다
   * (미확인일 때와 같은 취급 - 1-A-4 참고). 원장이 없는 종목은 사용자 확정이 그대로 쓰인다. */
  assert.strictEqual(cls(etf({ fxHedgeStatus: 'HEDGED' })), 'US_EQUITY');
  const noMaster = etf({ ticker: MASTER_ABSENT, fxHedgeStatus: 'HEDGED' });
  assert.strictEqual(cls(noMaster), 'US_EQUITY_HEDGED', '원장이 없으면 확인한 값을 그대로 쓴다');
  assert.ok(sigma(noMaster) > sigma(etf()), 'σ가 실제로 달라진다');
});

test('1-A-6. 원장에 HEDGED 항목이 없다 - 이 연결로 기존 계산이 달라지지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/28-exposure-master.js'), 'utf8');
  const body = src.match(/const EXPOSURE_MASTER_ENTRIES = Object\.freeze\(\[([\s\S]*?)\n\]\);/)[1];
  const hedged = [...body.matchAll(/hedgeStatus:\s*"([A-Z]+)"/g)].map((m) => m[1]);
  assert.ok(hedged.length > 0, '원장에 환헤지 사실이 실제로 있다');
  assert.strictEqual(hedged.filter((h) => h === 'HEDGED').length, 0,
    'HEDGED가 생기면 MC 자산군이 바뀐다 - 그때는 기준선을 다시 재야 한다');
});

/* ══ 1-B. 같은 종목 · 보유분 간 충돌 ════════════════════════════════════ */

const pool = (statuses) => statuses.map((st, i) => ({
  id: 'zz-' + i, ticker: MASTER_ABSENT, name: 'ZZ 미국나스닥100 ETF', category: 'ETF',
  currency: 'KRW', owner: i === 0 ? '신랑' : '와이프', accountType: i === 2 ? '연금저축' : '일반계좌',
  fxHedgeStatus: st
}));

test('1-B-1. 같은 종목에 HEDGED와 없음만 있으면 충돌이 아니다(미확인은 다른 값이 아니다)', () => {
  const list = pool(['HEDGED', undefined]);
  const c = SB.fxHedgeConflictFor(list[0], list);
  assert.strictEqual(c.conflict, false);
  assert.strictEqual(c.values.join(','), 'HEDGED');
});

test('1-B-2. 같은 종목에 HEDGED와 UNHEDGED가 함께 있으면 충돌이다', () => {
  const list = pool(['HEDGED', 'UNHEDGED']);
  const c = SB.fxHedgeConflictFor(list[0], list);
  assert.strictEqual(c.conflict, true);
  assert.strictEqual([...c.values].sort().join(','), 'HEDGED,UNHEDGED');
  assert.strictEqual(c.units.length, 2);
  assert.ok(c.units.every((u) => u.owner && u.accountType), '어느 보유분인지 말할 수 있어야 한다');
});

test('1-B-3. 충돌을 찾아도 어느 값도 고르지 않고 자산을 바꾸지 않는다', () => {
  const list = pool(['HEDGED', 'UNHEDGED', undefined]);
  const before = list.map((a) => a.fxHedgeStatus);
  const c = SB.fxHedgeConflictFor(list[0], list);
  assert.strictEqual(c.conflict, true);
  assert.strictEqual(list.map((a) => String(a.fxHedgeStatus)).join('|'), before.map(String).join('|'), '자동 전파 · 자동 삭제 없음');
  /* [PM STEP B] 예전에는 "resolved라는 키 자체가 없다"로 검사했다. 이제는 어느 쪽도 고르지
   * 않았다는 사실을 null로 명시한다 - 키가 없는 것보다 강한 단언이다. */
  assert.strictEqual(c.resolved, null, '정답을 만들어내지 않는다');
  assert.strictEqual(c.kind, 'holdingConflict');
  assert.ok(!('winner' in c), '승자를 만들지 않는다');
});

test('1-B-4. 다른 종목은 서로 영향을 주지 않는다', () => {
  const list = pool(['HEDGED', 'UNHEDGED']);
  const other = { id: 'zz-x', ticker: MASTER_UNHEDGED, category: 'ETF', currency: 'KRW', owner: '신랑', accountType: '일반계좌' };
  const c = SB.fxHedgeConflictFor(other, list.concat(other));
  assert.strictEqual(c.conflict, false, '티커가 다르면 다른 상품이다');
});

test('1-B-5. 티커가 없는 자산은 충돌 판정 대상이 아니다', () => {
  const c = SB.fxHedgeConflictFor({ id: 'n', ticker: '', name: '예금' }, pool(['HEDGED', 'UNHEDGED']));
  assert.strictEqual(c.conflict, false);
});

/* ══ 1-C. 원화 채권 ═════════════════════════════════════════════════════ */

test('1-C-1. 원화 채권은 국내/해외 입력과 무관하게 환헤지를 묻지 않는다', () => {
  ['국내', '해외', undefined].forEach((region) => {
    const st = offers(bond({ isDomestic: region }));
    assert.strictEqual(st.offer, false, `isDomestic=${region}`);
  });
  // 국내/해외를 고르지 않은 경우(거래 폼 형태)의 사유가 통화 기준임을 고정한다.
  assert.strictEqual(offers(bond()).reason, 'BOND_KRW_NOT_APPLICABLE');
});

test('1-C-2. 자산군 칸이 비어 있어도 표준코드(ISIN)면 채권으로 본다', () => {
  const st = offers(bond({ category: '' }));
  assert.strictEqual(st.offer, false);
  assert.strictEqual(st.reason, 'BOND_KRW_NOT_APPLICABLE');
});

test('1-C-3. 외화 채권은 그대로 묻는다 - 분류의 근거라 유일한 입력 경로다(D-2)', () => {
  ['해외', '국내', undefined].forEach((region) => {
    const st = offers(bond({ ticker: 'US912810TM03', name: 'ZZ 미국국채', currency: 'USD', isDomestic: region }));
    assert.strictEqual(st.offer, true, `isDomestic=${region}`);
    assert.strictEqual(st.reason, 'BOND_DOMAIN');
  });
});

test('1-C-4. 원화 채권에 이미 저장된 값은 지우지 않는다(숨기는 것과 삭제는 다르다)', () => {
  const a = bond({ fxHedgeStatus: 'HEDGED' });
  assert.strictEqual(offers(a).offer, false, '묻지는 않는다');
  assert.strictEqual(a.fxHedgeStatus, 'HEDGED', '저장값은 그대로다');
  // 계산에서도 쓰이지 않는다 - js/29가 통화 KRW면 환헤지를 보지 않는다.
  const pos = SB.makeBondPosition({
    assetId: a.id,
    identity: { isin: a.ticker, bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2030-12-01', couponRate: 3.5, paymentFrequency: 2 }
  });
  assert.strictEqual(SB.resolveBondHedgeStatusDetail(pos, a).source, 'NOT_APPLICABLE');
  assert.strictEqual(String(SB.resolveBondClass(pos, a)), 'KR_GOV');
});

/* ══ 회귀 - 이번 변경으로 다른 자산군의 기존 동작이 바뀌지 않았다 ══════ */

test('1-회귀. 주식 · ETF · 현금의 기존 제공 규칙은 그대로다', () => {
  const s = (a) => offers(a);
  assert.strictEqual(s(etf({ ticker: MASTER_ABSENT })).offer, true, '국내상장 해외 ETF는 그대로 묻는다');
  assert.strictEqual(s({ ticker: 'SCHD', name: 'ZZ 배당 ETF', category: 'ETF', currency: 'USD' }).offer, false);
  assert.strictEqual(s({ ticker: '005930.KS', name: 'ZZ 국내주', category: '주식', currency: 'KRW', isDomestic: '국내' }).offer, false);
  assert.strictEqual(s({ ticker: '', name: '달러예금', category: '현금', currency: 'USD' }).reason, 'FX_CASH');
  assert.strictEqual(s({ ticker: '', name: '예금', category: '현금', currency: 'KRW' }).offer, false);
});

/* ══ 1-I. [PM STEP B] 상품 고유 사실은 소유자 · 계좌가 달라도 하나다 ═══════ */

test('1-I-1. 원장 없는 상품 - 한 사람이 확인하면 다른 보유분도 같은 사실을 쓴다', () => {
  const list = pool(['HEDGED', undefined, undefined]);
  // 저장은 신랑 보유분에만 돼 있다.
  assert.strictEqual(list[1].fxHedgeStatus, undefined);
  // 그래도 와이프 · 연금저축 보유분이 같은 상품 사실을 쓴다(PM 지시 §6 "한 번 확인하면 끝").
  list.forEach((a) => assert.strictEqual(SB.resolveInstrumentFxHedge(a, list).status, 'HEDGED', a.id));
  assert.strictEqual(SB.resolveInstrumentFxHedge(list[2], list).source, 'userOverride');
});

test('1-I-2. 확정값이 갈리면 어느 쪽도 쓰지 않는다 - 상품을 둘로 나누지 않는다', () => {
  const list = pool(['HEDGED', 'UNHEDGED']);
  list.forEach((a) => {
    const r = SB.resolveInstrumentFxHedge(a, list);
    assert.strictEqual(r.status, null, '임의 선택 금지');
    assert.strictEqual(r.source, 'INSTRUMENT_CONFLICT');
    assert.strictEqual(r.conflict, true);
  });
});

test('1-I-3. 배열 순서를 바꿔도 같은 답이다', () => {
  const list = pool(['HEDGED', undefined, undefined]);
  const pick = (arr) => arr.map((a) => {
    const r = SB.resolveInstrumentFxHedge(a, arr);
    return [a.id, r.status, r.source].join('/');
  }).sort().join('|');
  assert.strictEqual(pick(list), pick(list.slice().reverse()));
  const conf = pool(['HEDGED', 'UNHEDGED']);
  assert.strictEqual(pick(conf), pick(conf.slice().reverse()));
});

test('1-I-4. 원장과 사용자 확정이 다르면 알린다(한쪽만 입력해도 감지한다 - 결함 2)', () => {
  // 이 티커는 원장이 A등급으로 UNHEDGED라고 적어 둔 상품이다.
  const list = [
    etf({ id: 'zz-h', owner: '신랑', accountType: '일반계좌', fxHedgeStatus: 'HEDGED' }),
    etf({ id: 'zz-w', owner: '와이프', accountType: '연금저축' })
  ];
  const c = SB.fxHedgeConflictFor(list[0], list);
  assert.strictEqual(c.conflict, true, '한쪽만 입력했어도 원장과 다르면 알린다');
  assert.strictEqual(c.kind, 'masterMismatch');
  // [PM 최종 지시] 확인될 때까지 어느 값도 쓰지 않는다.
  assert.strictEqual(c.resolved, null);
  list.forEach((a) => assert.strictEqual(SB.resolveInstrumentFxHedge(a, list).status, null, a.id));
});

test('1-I-5. 상품 사실을 읽어도 저장값을 바꾸지 않는다', () => {
  const list = pool(['HEDGED', undefined]);
  const before = JSON.stringify(list);
  SB.resolveInstrumentFxHedge(list[1], list);
  SB.fxHedgeConflictFor(list[0], list);
  assert.strictEqual(JSON.stringify(list), before, '읽기만 한다 - 자동 전파 저장 없음');
});
