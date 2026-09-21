// [Bond Transaction Core · Stage 1 · 체크리스트 §49 BOND-01~40] 거래내역이 채권 보유의 원천이다.
// 실행: node --test test/bond-transaction-core.test.js
//
// 무엇을 고정하는가 - 이번 변경의 핵심 주장 그대로다.
//   ① 채권의 신분증은 ISIN이고, ISIN 형식 코드는 무조건 채권으로 분류된다(그렇지 않으면 부팅마다 ETF로 뒤집힌다).
//   ② 보유수량 · 매입원가는 거래내역에서 나온다. 채권 레코드의 holding은 거래가 없을 때만(legacy) 쓰인다.
//   ③ 수량 1 = 액면 1만원. 사용자가 액면을 따로 입력하지 않는다.
//   ④ 전량매도한 채권은 계산에서 빠지되 레코드는 남는다(이력 보존).
//   ⑤ 채권 레코드도 백업 · 기기 간 동기화를 탄다(id + updatedAt).
//
// 실제 보유 종목 · 실제 금융정보는 쓰지 않는다 - 전부 ZZ 접두어 합성 데이터다.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const B = require('../js/29-bond-domain.js');

/* ── 합성 채권 두 종목 ──────────────────────────────────────────────────
 * A: 반기 이표채 · 장기 만기(듀레이션이 계산되는 정상 케이스)
 * B: 다른 계좌 · 다른 등급(계좌별로 포지션이 갈라지는지 본다) */
const ISIN_A = 'KRZZ00000001';
const ISIN_B = 'KRZZ00000019';
const OWNER = '신랑';
const ACC_A = '일반계좌';
const ACC_B = 'ISA';
const ASOF = '2026-09-21';

function bondA(extra) {
  return B.makeBondPosition(Object.assign({
    assetId: 'ZZ-ASSET-A',
    identity: { isin: ISIN_A, instrumentName: 'ZZ국고채권10년(합성)', issuer: 'ZZ정부', currency: 'KRW', bondType: '국채', creditRating: 'AAA' },
    terms: { issueDate: '2024-03-10', maturityDate: '2034-03-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC_A }
  }, extra || {}));
}
function bondB(extra) {
  return B.makeBondPosition(Object.assign({
    assetId: 'ZZ-ASSET-B',
    identity: { isin: ISIN_B, instrumentName: 'ZZ회사채3년(합성)', issuer: 'ZZ기업', currency: 'KRW', bondType: '회사채', creditRating: 'AA-' },
    terms: { issueDate: '2025-01-15', maturityDate: '2028-01-15', couponRate: 4.2, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: OWNER, account: ACC_B }
  }, extra || {}));
}
// 거래원장(computePositionsAndRealizedPnL의 positions)과 같은 모양의 맵을 손으로 만든다.
function ledger(entries) {
  const out = {};
  entries.forEach((e) => { // [§50 · PD-02] 포지션 키에 통화가 포함된다(transactionIdentityKey · bondLedgerKey와 같은 규칙).
    out[`${e.owner}__${e.account}__${e.isin}__${e.currency || 'KRW'}`] = { quantity: e.quantity, avgPrice: e.avgPrice }; });
  return out;
}

/* ══ TEST 01~04 · 신분증(ISIN)과 단위 ═══════════════════════════════════ */

test('TEST 01 - ISIN 판정: 국가 2자 + 영숫자 9자 + 숫자 1자, 모두 12자리만 통과한다', () => {
  const { isBondIsin } = require('../js/01-core-state.js');
  assert.strictEqual(isBondIsin(ISIN_A), true);
  assert.strictEqual(isBondIsin('kr103502g990'), true, '소문자로 입력해도 같은 코드다');
  assert.strictEqual(isBondIsin('KRZZ0000000'), false, '11자리');
  assert.strictEqual(isBondIsin('KRZZ000000012'), false, '13자리');
  assert.strictEqual(isBondIsin('KRZZ0000000A'), false, '마지막 자리는 검사숫자라 숫자여야 한다');
  assert.strictEqual(isBondIsin('005930.KS'), false);
  assert.strictEqual(isBondIsin(''), false);
  assert.strictEqual(isBondIsin(null), false);
});

test('TEST 02 - 분류: ISIN 형식 티커는 무조건 채권이다(없으면 부팅마다 ETF로 뒤집힌다)', () => {
  const { classifyCategory } = require('../js/01-core-state.js');
  assert.strictEqual(classifyCategory(ISIN_A, 'ZZ국고채권10년(합성)'), '채권');
  assert.strictEqual(classifyCategory(ISIN_B, 'ZZ회사채(합성)'), '채권');
  // 기존 규칙은 그대로다 - 채권형 ETF는 티커가 있으므로 여전히 ETF다.
  assert.strictEqual(classifyCategory('148070.KS', 'KOSEF 국고채10년'), 'ETF');
  // 티커 없는 채권명도 예전 그대로 채권이다.
  assert.strictEqual(classifyCategory('', 'ZZ국고채권 10년'), '채권');
  // 일반 주식 · ETF 판정을 건드리지 않는다.
  assert.strictEqual(classifyCategory('005930.KS', 'ZZ전자'), '주식');
  assert.strictEqual(classifyCategory('SCHD', 'Schwab US Dividend Equity ETF'), 'ETF');
});

test('TEST 03 - 원장 키: 소유자 · 계좌 · ISIN 셋이 다 있어야 만들어진다', () => {
  // [§50 · PD-02 기대값 갱신] 통화가 identity에 포함된다 - 같은 종목이라도 통화가 다르면 다른 보유분이다.
  assert.strictEqual(B.bondLedgerKey(bondA()), `${OWNER}__${ACC_A}__${ISIN_A}__KRW`);
  assert.strictEqual(B.bondLedgerKey(bondB()), `${OWNER}__${ACC_B}__${ISIN_B}__KRW`);
  assert.strictEqual(B.bondLedgerKey(B.makeBondPosition({ identity: { isin: ISIN_A } })), null, '소유자 · 계좌가 없으면 원장과 이을 수 없다');
  assert.strictEqual(B.bondLedgerKey(B.makeBondPosition({ holding: { owner: OWNER, account: ACC_A } })), null, 'ISIN이 없으면 채권을 특정할 수 없다');
  assert.strictEqual(B.bondLedgerKey(null), null);
});

test('TEST 04 - 단위: 수량 1 = 액면 1만원(사용자가 액면을 따로 입력하지 않는다)', () => {
  assert.strictEqual(B.BOND_FACE_UNIT, 10000);
  assert.strictEqual(B.bondQuantityToFace(1000), 10000000);
  assert.strictEqual(B.bondFaceToQuantity(10000000), 1000);
  assert.strictEqual(B.bondQuantityToFace(0), 0);
  assert.strictEqual(B.bondFaceToQuantity(null), null, '값이 없으면 0이 아니라 없음이다');
  assert.strictEqual(B.bondQuantityToFace('abc'), null);
});

/* ══ TEST 05~10 · 거래가 보유를 정한다 ══════════════════════════════════ */

test('TEST 05 - 매수: 보유 · 액면 · 매입원가가 전부 거래에서 나온다', () => {
  const h = B.resolveBondHolding(bondA(), ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1000, avgPrice: 10000 }]));
  assert.strictEqual(h.source, 'LEDGER');
  assert.strictEqual(h.quantity, 1000);
  assert.strictEqual(h.faceAmount, 10000000);
  assert.strictEqual(h.purchaseUnitPrice, 10000);
  assert.strictEqual(h.purchaseAmount, 10000000);
  assert.strictEqual(h.closed, false);
});

test('TEST 06 - 추가매수: 평균단가가 반영된 누적 매입원가가 나온다(합산 재입력 없음)', () => {
  // 1,000 @10,000 + 500 @11,000 -> 1,500 @10,333.33...
  const avg = (1000 * 10000 + 500 * 11000) / 1500;
  const h = B.resolveBondHolding(bondA(), ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1500, avgPrice: avg }]));
  assert.strictEqual(h.quantity, 1500);
  assert.strictEqual(h.faceAmount, 15000000);
  assert.ok(Math.abs(h.purchaseUnitPrice - 10333.333333) < 1e-4);
  assert.ok(Math.abs(h.purchaseAmount - 15500000) < 1e-6, `매입원가 ${h.purchaseAmount}`);
});

test('TEST 07 - 부분매도: 남은 수량 · 액면만 줄어든다(평단은 그대로)', () => {
  const avg = (1000 * 10000 + 500 * 11000) / 1500;
  const h = B.resolveBondHolding(bondA(), ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1200, avgPrice: avg }]));
  assert.strictEqual(h.quantity, 1200);
  assert.strictEqual(h.faceAmount, 12000000);
  assert.ok(Math.abs(h.purchaseAmount - 12400000) < 1e-6);
  assert.strictEqual(h.closed, false);
});

test('TEST 08 - 전량매도: 보유 0 · closed가 되고 레코드는 그대로 남는다', () => {
  const h = B.resolveBondHolding(bondA(), ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 0, avgPrice: 0 }]));
  assert.strictEqual(h.source, 'LEDGER');
  assert.strictEqual(h.quantity, 0);
  assert.strictEqual(h.faceAmount, 0);
  assert.strictEqual(h.closed, true);
});

test('TEST 09 - legacy 수동 채권: 거래가 없으면 예전대로 레코드의 액면 · 매입금액을 쓴다', () => {
  const legacy = bondA({ holding: { owner: OWNER, account: ACC_A, faceAmount: 5000000, purchaseAmount: 4900000, purchaseDate: '2025-02-02' } });
  const h = B.resolveBondHolding(legacy, ledger([])); // 이 채권에 대한 거래가 하나도 없다
  assert.strictEqual(h.source, 'MANUAL');
  assert.strictEqual(h.faceAmount, 5000000);
  assert.strictEqual(h.quantity, 500);
  assert.strictEqual(h.purchaseAmount, 4900000);
  assert.strictEqual(h.closed, false, 'legacy는 전량매도 개념 자체가 없다');
});

test('TEST 10 - 계좌가 다르면 다른 포지션이다 · 아무 근거도 없으면 0이 아니라 NONE이다', () => {
  const both = ledger([
    { owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1000, avgPrice: 10000 },
    { owner: OWNER, account: ACC_B, isin: ISIN_B, quantity: 300, avgPrice: 10200 }
  ]);
  assert.strictEqual(B.resolveBondHolding(bondA(), both).quantity, 1000);
  assert.strictEqual(B.resolveBondHolding(bondB(), both).quantity, 300);
  // 같은 ISIN이어도 계좌가 목록에 없으면 거래 기반이 아니다.
  const otherAcc = bondA({ holding: { owner: OWNER, account: '연금저축' } });
  const h = B.resolveBondHolding(otherAcc, both);
  assert.strictEqual(h.source, 'NONE');
  assert.strictEqual(h.quantity, null, '모르는 값을 0으로 채우지 않는다');
  assert.strictEqual(h.faceAmount, null);
});

/* ══ TEST 11~13 · 채권 위험 요약이 거래를 본다 ═════════════════════════ */

test('TEST 11 - 위험 요약 가중: PURCHASE 금액의 원천이 거래 누적 매입원가다(2단 규칙은 그대로)', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1500, avgPrice: (1000 * 10000 + 500 * 11000) / 1500 }]);
  const a = bondA();
  const s = B.computeBondRiskSummary([a], { asOf: ASOF, positions: led });
  assert.strictEqual(s.status, 'OK');
  assert.strictEqual(s.count, 1);
  assert.strictEqual(s.rows[0].holdingSource, 'LEDGER');
  assert.strictEqual(s.rows[0].weightBasis, 'PURCHASE');
  assert.ok(Math.abs(s.rows[0].amount - 15500000) < 1e-6);
  assert.strictEqual(s.rows[0].faceAmount, 15000000);
  // 시세가 주어지면 MARKET이 이긴다 - 2단 규칙 자체는 바뀌지 않았다.
  const withMarket = B.computeBondRiskSummary([a], { asOf: ASOF, positions: led, marketPrices: { [a.id]: 16000000 } });
  assert.strictEqual(withMarket.rows[0].weightBasis, 'MARKET');
});

test('TEST 12 - 전량매도한 채권은 계산에서 빠진다(레코드 · 이력은 남는다)', () => {
  const led = ledger([
    { owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 0, avgPrice: 0 },       // 전량매도
    { owner: OWNER, account: ACC_B, isin: ISIN_B, quantity: 300, avgPrice: 10200 }
  ]);
  const s = B.computeBondRiskSummary([bondA(), bondB()], { asOf: ASOF, positions: led });
  assert.strictEqual(s.status, 'OK');
  assert.strictEqual(s.count, 1, '살아 있는 채권만 센다');
  assert.strictEqual(s.closedCount, 1);
  assert.strictEqual(s.rows.length, 1);
  assert.strictEqual(s.allRows.length, 2, '전량매도분도 레코드로는 남아 있다');
  assert.strictEqual(s.rows[0].name, 'ZZ회사채3년(합성)');
  assert.ok(!Object.prototype.hasOwnProperty.call(s.creditRatingDistribution, 'AAA'), '등급 분포에도 전량매도분이 섞이지 않는다');
});

test('TEST 13 - 전부 전량매도면 "채권 없음"이다(0원짜리 채권이 남아 있는 것처럼 보이지 않는다)', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 0, avgPrice: 0 }]);
  const s = B.computeBondRiskSummary([bondA()], { asOf: ASOF, positions: led });
  assert.strictEqual(s.status, 'EMPTY');
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.closedCount, 1);
});

/* ══ TEST 14~16 · 현금흐름도 같은 보유분을 본다 ═══════════════════════ */

test('TEST 14 - 현금흐름: 거래로 정해진 액면으로 이자 · 원금을 만든다', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1000, avgPrice: 10000 }]);
  const cf = B.buildBondCashFlows(bondA(), { asOf: ASOF, positions: led });
  assert.strictEqual(cf.status, 'OK');
  assert.ok(cf.flows.length > 0);
  const principal = cf.flows.find((f) => f.kind === 'PRINCIPAL');
  assert.strictEqual(principal.amount, 10000000, '만기 원금 = 액면 = 수량 × 10,000');
  // 반기 이표 = 액면 × 3.5% / 2
  const firstCoupon = cf.flows.find((f) => f.kind === 'COUPON');
  assert.ok(Math.abs(firstCoupon.amount - (10000000 * 0.035 / 2)) < 1e-6, `이표 ${firstCoupon.amount}`);
});

test('TEST 15 - 전량매도 후에는 이후 현금흐름을 만들지 않는다(받을 이자가 없다)', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 0, avgPrice: 0 }]);
  const cf = B.buildBondCashFlows(bondA(), { asOf: ASOF, positions: led });
  assert.strictEqual(cf.status, 'CLOSED');
  assert.deepStrictEqual(cf.flows, []);
  assert.match(cf.reason, /전량매도/);
});

test('TEST 16 - legacy 수동 채권의 현금흐름 경로는 그대로다(거래로 옮기라고 강요하지 않는다)', () => {
  const legacy = bondA({ holding: { owner: OWNER, account: ACC_A, faceAmount: 5000000, purchaseAmount: 4900000 } });
  const cf = B.buildBondCashFlows(legacy, { asOf: ASOF, positions: ledger([]) });
  assert.strictEqual(cf.status, 'OK');
  const principal = cf.flows.find((f) => f.kind === 'PRINCIPAL');
  assert.strictEqual(principal.amount, 5000000);
});

/* ══ TEST 17~18 · MC · 자산 성격 연계 ════════════════════════════════ */

test('TEST 17 - MC 자산 성격: 거래 기반 채권도 채권 구분 그대로 이어진다(모델 · 수식 불변)', () => {
  const a = bondA();
  assert.strictEqual(B.resolveBondClass(a), B.BOND_CLASS.KR_GOV);
  assert.strictEqual(B.BOND_CLASS_TO_CHARACTER[B.resolveBondClass(a)], 'KR_GOV_BOND');
  const ch = B.resolveBondAssetCharacter({ id: 'ZZ-ASSET-A' }, [a]);
  assert.strictEqual(ch.character, 'KR_GOV_BOND');
  const chB = B.resolveBondAssetCharacter({ id: 'ZZ-ASSET-B' }, [bondB()]);
  assert.strictEqual(chB.character, 'KR_CORP_BOND');
});

test('TEST 18 - 근거가 없으면 채권 구분을 추정하지 않는다(UNCLASSIFIED 유지)', () => {
  const noType = B.makeBondPosition({ assetId: 'ZZ-ASSET-C', identity: { isin: 'KRZZ00000027', currency: 'KRW' }, holding: { owner: OWNER, account: ACC_A } });
  assert.strictEqual(B.resolveBondClass(noType), B.BOND_CLASS.UNCLASSIFIED);
  const ch = B.resolveBondAssetCharacter({ id: 'ZZ-ASSET-C' }, [noType]);
  assert.strictEqual(ch.character, null, '모르면 null - 아무 성격이나 붙이지 않는다');
});

/* ══ TEST 19~21 · 백업 · 기기 간 동기화 ═══════════════════════════════ */

// js/12는 브라우저 전용 top-level 코드가 있어 sync-payload.test.js와 같은 방식으로 가짜 DOM을 깐다.
function loadSyncModule() {
  function fakeEl() {
    const store = { value: '', textContent: '', innerHTML: '', className: '', type: '' };
    return new Proxy(store, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        if (p === 'style') return {};
        if (p === 'dataset') return {};
        return () => fakeEl();
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  }
  global.document = { getElementById: () => fakeEl(), addEventListener: () => {}, createElement: () => fakeEl(), documentElement: fakeEl(), body: fakeEl() };
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  global.window = global;
  return require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));
}

test('TEST 19 - 기기 간 병합: 채권 레코드도 id + updatedAt으로 더 최신인 쪽을 고른다', () => {
  const { mergeCollectionById } = loadSyncModule();
  const local = [B.makeBondPosition({ id: 'ZB-1', identity: { isin: ISIN_A, instrumentName: '로컬이름' }, terms: { maturityDate: '2034-03-10' }, holding: { owner: OWNER, account: ACC_A }, updatedAt: 1000 })];
  const remote = [B.makeBondPosition({ id: 'ZB-1', identity: { isin: ISIN_A, instrumentName: '원격이름' }, terms: { maturityDate: '2034-03-10', couponRate: 3.5 }, holding: { owner: OWNER, account: ACC_A }, updatedAt: 2000 })];
  const merged = mergeCollectionById(local, remote, new Set(['ZB-1']));
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].identity.instrumentName, '원격이름');
  assert.strictEqual(merged[0].terms.couponRate, 3.5);
  // 반대 방향도 같다 - 로컬이 더 최신이면 로컬이 남는다.
  const merged2 = mergeCollectionById(
    [Object.assign({}, local[0], { updatedAt: 3000 })], remote, new Set(['ZB-1']));
  assert.strictEqual(merged2[0].identity.instrumentName, '로컬이름');
});

test('TEST 20 - 한쪽에서 지운 채권이 병합으로 되살아나지 않는다(유령 방지)', () => {
  const { mergeCollectionById } = loadSyncModule();
  const remote = [B.makeBondPosition({ id: 'ZB-2', identity: { isin: ISIN_B }, holding: { owner: OWNER, account: ACC_B }, updatedAt: 1000 })];
  // 기준선에 있던 id가 로컬에 없다 = 이 기기가 지웠다 -> 되살리지 않는다.
  assert.strictEqual(mergeCollectionById([], remote, new Set(['ZB-2'])).length, 0);
  // 기준선에 없던 id = 상대가 새로 만들었다 -> 받아들인다.
  assert.strictEqual(mergeCollectionById([], remote, new Set()).length, 1);
});

test('TEST 21 - [이 기기 데이터 올리기]는 채권 레코드에도 시각을 찍는다(원본은 건드리지 않는다)', () => {
  const { stampPayload } = loadSyncModule();
  const rec = B.makeBondPosition({ id: 'ZB-3', identity: { isin: ISIN_A }, holding: { owner: OWNER, account: ACC_A }, updatedAt: 111 });
  const blob = { assets: [], transactions: [], bondPositions: [rec] };
  const out = stampPayload(blob, 999);
  assert.strictEqual(out.bondPositions[0].updatedAt, 999);
  assert.strictEqual(out.bondPositions[0].identity.isin, ISIN_A, '나머지 내용은 그대로 복사된다');
  assert.strictEqual(rec.updatedAt, 111, '원본(state의 레코드)은 바뀌지 않는다 - 업로드가 실패해도 로컬이 멀쩡해야 한다');
  // 채권 키가 없는 옛 페이로드에서도 터지지 않는다.
  assert.deepStrictEqual(stampPayload({ assets: [], transactions: [] }, 999).bondPositions, []);
});

/* ══ TEST 22 · 금리 민감도(듀레이션)도 거래 기반 채권에서 계산된다 ════════ */

test('TEST 22 - 듀레이션: 거래 기반 채권도 계산된다(원장을 안 넘기면 통째로 "계산 불가"가 된다)', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1000, avgPrice: 10000 }]);
  const a = bondA();
  // 레코드에는 액면 · 매입금액이 없다 - 거래가 원천이기 때문이다(BOND-08).
  assert.strictEqual(a.holding.faceAmount, null);
  const d = B.computeBondDuration(a, { asOf: ASOF, positions: led });
  assert.strictEqual(d.status, 'OK', d.reason);
  assert.ok(d.modifiedDuration > 0 && d.modifiedDuration < 10, `수정듀레이션 ${d.modifiedDuration}`);
  // 위험 요약에서도 같은 값이 쓰여 커버리지가 100%가 된다.
  const s = B.computeBondRiskSummary([a], { asOf: ASOF, positions: led });
  assert.strictEqual(s.durationCoveragePct, 100);
  assert.ok(Number.isFinite(s.weightedModifiedDuration));
  assert.ok(Number.isFinite(s.primaryImpactPct));
  // 원장을 넘기지 않으면(legacy 경로) 이 채권은 액면 근거가 없어 계산 불가다 - 0이라고 하지 않는다.
  const none = B.computeBondDuration(a, { asOf: ASOF });
  assert.strictEqual(none.status, 'UNAVAILABLE');
  assert.match(none.reason, /액면/);
});

test('TEST 23 - 수익률 계층: 매입원가 · 만기손익도 거래 기반 매입원가를 쓴다', () => {
  const led = ledger([{ owner: OWNER, account: ACC_A, isin: ISIN_A, quantity: 1000, avgPrice: 9800 }]);
  const a = bondA({ holding: { owner: OWNER, account: ACC_A, purchaseDate: '2024-03-10' } });
  const y = B.computeBondYields(a, { asOf: ASOF, positions: led });
  assert.strictEqual(y.layer.confirmed.purchaseAmount.status, 'OK');
  assert.strictEqual(y.layer.confirmed.purchaseAmount.value, 9800000, '1000 × 9,800');
  assert.strictEqual(y.layer.confirmed.maturityRepayment.value, 10000000, '만기 상환 = 액면');
  assert.strictEqual(y.layer.confirmed.purchaseYtm.status, 'OK', '매입일 + 거래 매입원가로 매입 시 YTM이 나온다');
  // 시세는 저장하지 않으므로 평가 계층은 여전히 "없음"이다(0으로 채우지 않는다).
  assert.strictEqual(y.layer.valuation.marketValue.status, 'UNAVAILABLE');
});
