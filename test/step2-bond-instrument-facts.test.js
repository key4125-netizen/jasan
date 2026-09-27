/* [PM STEP 2] 채권 상품 기준정보 — ISIN 단위 해석 · 충돌 · 순서 비의존성 고정.
 *
 * 이 파일이 지키는 것 셋.
 *   ① 같은 ISIN이면 **하나의 상품 사실**을 본다 - owner · account · assetId · 배열 순서와 무관하다.
 *   ② 값이 갈리면 **고르지 않는다** - CONFLICT로 알리고 그 필드는 비워 둔다(first-found 금지).
 *   ③ 근거가 없으면 UNRESOLVED다 - 추정해서 채우지 않는다.
 *
 * 계산 경로(resolveBondClass · 현금흐름 · 듀레이션)는 각 보유분의 자기 레코드를 그대로 쓴다 -
 * 이 단계에서 계산을 바꾸지 않는다(충돌을 자동 해결하지 않기 때문이다).
 *
 * 실행: node --test test/step2-bond-instrument-facts.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
const ISIN = 'KR103502GE95';
const OTHER = 'KR6000011D38';

const pos = (over) => SB.makeBondPosition(Object.assign({
  id: 'zz-p1',
  assetId: 'zz-a1',
  identity: { isin: ISIN, instrumentName: 'ZZ 국고채권 23-5', issuer: '대한민국', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
  terms: { issueDate: '2023-06-10', maturityDate: '2030-12-01', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
  holding: { owner: '신랑', account: '일반계좌', faceAmount: 10000000 }
}, over || {}));

const facts = (list, isin) => SB.resolveBondInstrumentFacts(isin || ISIN, list);

/* ══ CASE 1 · 5 · 6 — 같은 사실은 하나로 읽힌다 ═════════════════════════ */

test('CASE 1. 동일 ISIN · 동일 terms · owner/account만 다름 → 하나의 상품 사실', () => {
  const list = [
    pos(),
    pos({ id: 'zz-p2', assetId: 'zz-a2', holding: { owner: '와이프', account: '연금저축', faceAmount: 5000000 } })
  ];
  const r = facts(list);
  assert.strictEqual(r.status, 'RESOLVED');
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.facts.maturityDate, '2030-12-01');
  assert.strictEqual(r.facts.couponRate, 3.5);
  assert.strictEqual(r.facts.bondType, '국채');
  assert.strictEqual(r.facts.currency, 'KRW');
});

test('CASE 5. owner/account를 바꿔도 상품 사실은 그대로다(보유 값만 다르다)', () => {
  const a = facts([pos()]);
  const b = facts([pos({ holding: { owner: '와이프', account: '연금저축', faceAmount: 1 } })]);
  assert.strictEqual(JSON.stringify(a.facts), JSON.stringify(b.facts));
});

test('CASE 6. 보유가 하나뿐이면 예전 동작 그대로 - 그 레코드의 사실이 곧 상품 사실', () => {
  const r = facts([pos()]);
  assert.strictEqual(r.status, 'RESOLVED');
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.facts.instrumentName, 'ZZ 국고채권 23-5');
});

/* ══ CASE 2 — 충돌은 고르지 않는다 ═════════════════════════════════════ */

test('CASE 2. 동일 ISIN · 서로 다른 terms → CONFLICT · 자동 선택 없음', () => {
  const list = [
    pos(),
    pos({ id: 'zz-p2', assetId: 'zz-a2', terms: { maturityDate: '2031-06-01', couponRate: 4.25, paymentFrequency: 2 } })
  ];
  const r = facts(list);
  assert.strictEqual(r.status, 'CONFLICT');
  assert.strictEqual(r.facts.maturityDate, null, '어느 쪽도 고르지 않는다');
  assert.strictEqual(r.facts.couponRate, null);
  const fields = r.conflicts.map((c) => c.field).sort();
  assert.ok(fields.includes('maturityDate') && fields.includes('couponRate'), JSON.stringify(fields));
  // 갈리지 않은 필드는 그대로 읽힌다 - 충돌 하나가 나머지 사실까지 지우지 않는다.
  assert.strictEqual(r.facts.bondType, '국채');
});

test('CASE 2-2. 충돌해도 원본 레코드를 바꾸지 않는다', () => {
  const a = pos();
  const b = pos({ id: 'zz-p2', assetId: 'zz-a2', terms: { maturityDate: '2031-06-01' } });
  const before = JSON.stringify([a.terms, b.terms]);
  facts([a, b]);
  assert.strictEqual(JSON.stringify([a.terms, b.terms]), before, '읽기만 한다');
});

test('CASE 2-3. 충돌 안내문이 어떤 필드가 왜 갈렸는지 말한다', () => {
  const r = facts([pos(), pos({ id: 'zz-p2', assetId: 'zz-a2', terms: { maturityDate: '2031-06-01' } })]);
  const note = SB.bondInstrumentConflictNote(r);
  assert.match(note, /확인 필요/);
  assert.match(note, /만기일/);
  assert.match(note, /2030-12-01/);
  assert.match(note, /2031-06-01/);
  assert.match(note, /앱이 임의로 고르지 않습니다/);
  assert.strictEqual(SB.bondInstrumentConflictNote(facts([pos()])), '', '충돌이 없으면 아무 말도 하지 않는다');
});

/* ══ CASE 3 · 4 — 순서 · assetId 비의존성 ══════════════════════════════ */

test('CASE 3. 배열 순서를 바꿔도 결과가 같다(first-found 없음)', () => {
  const list = [
    pos(),
    pos({ id: 'zz-p2', assetId: 'zz-a2', terms: { maturityDate: '2031-06-01' } }),
    pos({ id: 'zz-p3', assetId: 'zz-a3', identity: { isin: ISIN, issuer: '대한민국', currency: 'KRW', bondType: '국채' } })
  ];
  const base = JSON.stringify(facts(list));
  assert.strictEqual(JSON.stringify(facts([...list].reverse())), base);
  assert.strictEqual(JSON.stringify(facts([list[1], list[2], list[0]])), base);
});

test('CASE 4. assetId를 바꿔도 상품 사실이 달라지지 않는다', () => {
  const a = facts([pos({ assetId: 'zz-aaa' })]);
  const b = facts([pos({ assetId: 'zz-zzz' })]);
  assert.strictEqual(JSON.stringify(a.facts), JSON.stringify(b.facts));
});

/* ══ CASE 7 — 근거 없음 ════════════════════════════════════════════════ */

test('CASE 7. 해당 ISIN의 레코드가 없으면 UNRESOLVED - 추정하지 않는다', () => {
  const r = facts([pos()], OTHER);
  assert.strictEqual(r.status, 'UNRESOLVED');
  assert.strictEqual(r.count, 0);
  assert.strictEqual(Object.keys(r.facts).length, 0);
});

test('CASE 7-2. ISIN이 비어 있으면 아무 것도 답하지 않는다', () => {
  const r = SB.resolveBondInstrumentFacts('', [pos()]); // 헬퍼의 기본값을 타지 않게 직접 부른다
  assert.strictEqual(r.status, 'UNRESOLVED');
  assert.strictEqual(r.count, 0);
});

test('CASE 7-3. 값이 비어 있는 필드는 "모른다"이지 충돌이 아니다', () => {
  const list = [
    pos(),
    pos({ id: 'zz-p2', assetId: 'zz-a2', identity: { isin: ISIN, currency: 'KRW' }, terms: {} })
  ];
  const r = facts(list);
  assert.strictEqual(r.status, 'RESOLVED', '한쪽이 비어 있는 것은 다른 값이 아니다');
  assert.strictEqual(r.facts.maturityDate, '2030-12-01');
});

/* ══ 사용자 수정값 · 보유 값 경계 ══════════════════════════════════════ */

test('경계. 사용자가 고친 값이 그 레코드의 사실이다(userOverride를 지나온 값으로 비교한다)', () => {
  const list = [pos(), pos({ id: 'zz-p2', assetId: 'zz-a2', userOverride: { maturityDate: '2031-06-01' } })];
  const r = facts(list);
  assert.strictEqual(r.status, 'CONFLICT');
  assert.ok(r.conflicts.some((c) => c.field === 'maturityDate'));
});

test('경계. 보유 정보(holding) · 출처(source)는 상품 사실이 아니라 비교하지 않는다', () => {
  const list = [
    pos({ source: { provider: 'KIS', evidenceGrade: 'A' } }),
    pos({ id: 'zz-p2', assetId: 'zz-a2', holding: { owner: '와이프', account: '연금저축', faceAmount: 999 }, source: { provider: 'USER' } })
  ];
  const r = facts(list);
  assert.strictEqual(r.status, 'RESOLVED', '보유 · 출처가 달라도 상품 사실은 같다');
  assert.strictEqual(r.conflicts.length, 0);
});

/* ══ STEP 1 FX Hedge 구조와의 관계 ═════════════════════════════════════ */

test('STEP 1 유지. 환헤지 판정 경로는 그대로다 - 여기서 다시 정하지 않는다', () => {
  const a = { id: 'zz-a1', ticker: ISIN, category: '채권', currency: 'KRW', fxHedgeStatus: 'HEDGED' };
  const p = pos();
  // 원화 채권은 환헤지를 보지 않는다(STEP 1 · §58-5 · js/29 0순위) - STEP 2가 이것을 바꾸지 않았다.
  assert.strictEqual(SB.resolveBondHedgeStatusDetail(p, a).source, 'NOT_APPLICABLE');
  assert.strictEqual(String(SB.resolveBondClass(p, a)), 'KR_GOV');
  assert.strictEqual(SB.fxHedgeChoiceStateOf(a).offer, false);
});

test('STEP 1 유지. 외화 채권의 환헤지 우선순위(레코드 → 자산 → UNRESOLVED)도 그대로다', () => {
  const usd = SB.makeBondPosition({
    id: 'zz-u1', assetId: 'zz-u', identity: { isin: 'US912810TM03', bondType: '국채', currency: 'USD', hedgeStatus: 'HEDGED' },
    terms: { maturityDate: '2030-12-01', couponRate: 3, paymentFrequency: 2 }
  });
  const asset = { id: 'zz-u', ticker: 'US912810TM03', category: '채권', currency: 'USD', fxHedgeStatus: 'UNHEDGED' };
  const d = SB.resolveBondHedgeStatusDetail(usd, asset);
  assert.strictEqual(d.status, 'HEDGED', '레코드 값이 1순위');
  assert.strictEqual(d.source, 'bondPosition');
});

test('환헤지도 갈리면 충돌로 알린다(판정은 하지 않고 사실만 말한다)', () => {
  const list = [
    SB.makeBondPosition({ id: 'u1', assetId: 'a1', identity: { isin: 'US912810TM03', currency: 'USD', hedgeStatus: 'HEDGED' } }),
    SB.makeBondPosition({ id: 'u2', assetId: 'a2', identity: { isin: 'US912810TM03', currency: 'USD', hedgeStatus: 'UNHEDGED' } })
  ];
  const r = facts(list, 'US912810TM03');
  assert.strictEqual(r.status, 'CONFLICT');
  assert.ok(r.conflicts.some((c) => c.field === 'hedgeStatus'));
  assert.strictEqual(r.facts.hedgeStatus, null, '여기서 고르지 않는다 - 판정은 resolveBondHedgeStatusDetail이 한다');
});
