/* [PHASE B-1 · B-2] 계좌유형 분류 사전과 위험 배분(70:30) 정책의 책임 분리.
 *
 * 이 파일이 지키는 것 둘.
 *
 * ① B-1 (SoT §67-1 TAX-RISK-03 · TAX-RISK-04) — **세제혜택 분류와 위험 배분은 다른 정책이다.**
 *    예전에는 `TAX_ADVANTAGED_ACCOUNT_TYPES` 배열 하나가 두 질문에 동시에 답해서, 세제혜택
 *    목록에 계좌유형을 추가하면 그 계좌가 **자동으로** 70:30까지 받았다. 이제 세제혜택 분류는
 *    js/01의 사전이, 위험 배분은 js/05의 별도 정책이 각각 답한다.
 *
 * ② B-2 (SoT §67-2 ACCT-DICT-01~06) — **사전은 분류 보조정보다.** Account Master도 ID도 아니고,
 *    저장값을 바꾸지 않으며(자동 정규화 금지), 사전에 없는 값은 UNCLASSIFIED다.
 *    ⚠ PM 결정 DR-B2 — 이번 단계에서 UNCLASSIFIED는 **표시 · 안내 전용**이다.
 *    계산에서 빼지 않고, 70:30을 주지 않으며, 기존 계산 결과를 바꾸지 않는다.
 *
 * 실제 js/01~29를 index.html과 같은 순서로 싣는다. 보유 종목은 전부 합성(ZZ)이다.
 * 실행: node --test test/phase-b-account-type-risk-share.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');

function freshSandbox() {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.bondPositions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {}; S.projection.customFeeRates = {};
  S.projection.monthlyContributionByOwner = {
    '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] }
  };
  S.projection.contributionGrowthRate = 0; S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => {
    S.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    S.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  sb.getCachedDailyCloses = async () => null;
  sb.asset = (o) => sb.makeAsset(Object.assign({
    owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e8, currentPrice: 1e8, currency: 'KRW'
  }, o));
  return sb;
}
const SB = freshSandbox();

/* ══════════════ B-2 · Account Type Dictionary ══════════════ */

test('B2-1. 등재된 계좌유형은 사전이 분류한다 - 세제혜택 3종 + 기본값', () => {
  ['ISA', 'IRP', '연금저축'].forEach((t) => {
    assert.strictEqual(SB.classifyAccountType(t), 'TAX_ADVANTAGED', t);
    assert.strictEqual(SB.isAccountTypeRegistered(t), true, t);
    assert.strictEqual(SB.isTaxAdvantagedAccountType(t), true, t);
  });
  assert.strictEqual(SB.classifyAccountType('일반계좌'), 'GENERAL');
  assert.strictEqual(SB.isTaxAdvantagedAccountType('일반계좌'), false);
});

test('B2-2. 사전에 없는 계좌유형은 UNCLASSIFIED다 - 다른 유형으로 추정하지 않는다', () => {
  ['토스', 'CMA', '채권/현금', 'ZZ 증권사', ''].forEach((t) => {
    assert.strictEqual(SB.classifyAccountType(t), 'UNCLASSIFIED', JSON.stringify(t));
    assert.strictEqual(SB.isAccountTypeRegistered(t), false, JSON.stringify(t));
    assert.strictEqual(SB.isTaxAdvantagedAccountType(t), false, JSON.stringify(t));
  });
});

test('B2-3. 자동 정규화를 하지 않는다 - 입력한 문자열이 그대로 남는다', () => {
  // 대소문자 · 유사명을 알아서 바꿔 주지 않는다(ACCT-DICT-04 · BOND-10).
  ['isa', 'Isa', 'irp', 'IRP연금', '연금', '개인연금저축'].forEach((t) => {
    assert.strictEqual(SB.classifyAccountType(t), 'UNCLASSIFIED', t + ' - 유사명을 등재 유형으로 바꾸지 않는다');
  });
  // 저장 경로도 값을 바꾸지 않는다.
  const a = SB.makeAsset({ ticker: '005930', name: 'ZZ 보유', owner: '신랑', accountType: '토스', quantity: 1, buyPrice: 1, currentPrice: 1 });
  assert.strictEqual(a.accountType, '토스', '입력값 그대로 저장된다');
  assert.strictEqual(SB.classifyAccountType(a.accountType), 'UNCLASSIFIED');
  // 분류 함수는 읽기만 한다.
  SB.classifyAccountType(a.accountType);
  assert.strictEqual(a.accountType, '토스', '분류가 저장값을 바꾸지 않는다');
});

test('B2-4. 사전은 Account Master · Account ID가 아니다', () => {
  const dict = SB.evalInSandbox('ACCOUNT_TYPE_DICTIONARY');
  assert.ok(Object.isFrozen(dict), '사전은 동결돼 있다');
  Object.keys(dict).forEach((k) => {
    assert.deepStrictEqual(Object.keys(dict[k]).sort(), ['basis', 'taxClass'],
      k + ' - 분류와 근거만 있다(계좌 id · 레코드 · 잔고 없음)');
  });
  // 사전을 읽어도 계좌 레코드가 생기지 않는다.
  const before = Object.keys(SB.state).length;
  SB.classifyAccountType('토스');
  SB.lookupAccountTypeEntry('ISA');
  assert.strictEqual(Object.keys(SB.state).length, before, 'state에 새 컬렉션이 생기지 않는다');
  const src = fs.readFileSync(path.join(ROOT, 'js/01-core-state.js'), 'utf8');
  assert.ok(!/accountId\s*[:=]/.test(src), 'accountId를 만들지 않는다');
  assert.ok(!/ACCOUNT_MASTER/.test(src), 'Account Master를 만들지 않는다');
});

test('B2-5. 안내 문구는 사전에 없을 때만 나온다(표시 전용)', () => {
  assert.strictEqual(SB.accountTypeClassificationNote('ISA'), '');
  assert.strictEqual(SB.accountTypeClassificationNote('일반계좌'), '');
  assert.strictEqual(SB.accountTypeClassificationNote(''), '', '빈 값에는 말하지 않는다');
  const note = SB.accountTypeClassificationNote('토스');
  assert.match(note, /토스/);
  assert.match(note, /사전에 없는/);
  assert.match(note, /계산도 달라지지 않습니다/, '계산이 바뀌지 않는다는 사실을 함께 말한다');
});

/* ══════════════ B-1 · Tax Classification ↔ Risk Share 분리 ══════════════ */

test('B1-1. 두 판정은 서로 다른 정책 근거를 쓴다(같은 게이트가 아니다)', () => {
  // 같은 질문이 아니라는 것을 동작으로 보인다 - 세제혜택 계좌유형이 아닌데 위험 배분 대상인 범위가 있다.
  assert.strictEqual(SB.isTaxAdvantagedAccountType('tax'), false, "'tax'는 계좌유형이 아니다");
  assert.strictEqual(SB.resolveRemainderRiskShare('tax').registeredTarget, true,
    '절세계좌 단일 풀 범위는 위험 배분 등재 대상이다 - 세제혜택 "계좌유형" 판정과 다른 질문이다');

  // 반대 방향 - 위험 배분 목록은 세제혜택 사전에서 파생되지 않는다(각자 선언).
  const riskList = SB.evalInSandbox('RISK_SHARE_ELIGIBLE_ACCOUNT_TYPES');
  const taxList = SB.evalInSandbox('TAX_ADVANTAGED_ACCOUNT_TYPES');
  assert.notStrictEqual(riskList, taxList, '같은 배열 객체를 공유하지 않는다');
  assert.deepStrictEqual([...riskList].sort(), [...taxList].sort(), '지금은 대상이 같다(정책상 동일 · TAX-RISK-02)');

  // 위험 배분 결정 경로가 세제혜택 분류 · 범위 판정 함수를 호출하지 않는다.
  const src = fs.readFileSync(path.join(ROOT, 'js/05-future-projection.js'), 'utf8');
  const fn = src.slice(src.indexOf('function resolveRemainderRiskShare'), src.indexOf('function resolveRemainderRiskShare') + 700);
  assert.ok(!/isTaxAdvantagedAccountType|isRebalanceEligibleAccount|TAX_ADVANTAGED_ACCOUNT_TYPES/.test(fn),
    '위험 배분 판정이 세제혜택 분류 · 범위 판정에 종속되지 않는다: ' + fn.slice(0, 200));
});

test('B1-2. 등재된 세제혜택 계좌유형은 70:30을 받는다(기존 동작)', () => {
  ['ISA', 'IRP', '연금저축'].forEach((t) => {
    const r = SB.resolveRemainderRiskShare(t);
    assert.strictEqual(r.registeredTarget, true, t);
    assert.strictEqual(r.share, 0.7, t + ' - 위험자산 70%');
    assert.strictEqual(SB.evalInSandbox('TAX_ADVANTAGED_RISK_SHARE'), 0.7, '비율 자체는 그대로다');
  });
});

/* [기대값 변경 2026-09-28 · PM 결정 · SoT §67-5] 예전 기대값은 미등재 계좌유형에
 * `{ eligible: false, share: null }`이었다. 그 구현은 **이미 저장된 적립계획 행**의 잔여분까지
 * 계산에서 빼 버려 DR-B2("UNCLASSIFIED는 표시 · 안내 전용 · 기존 계산 결과 보존")와 충돌했다
 * (실측: 결정론 -57.74%). PM 결정으로 계산 게이트를 제거했고, TAX-RISK-04의 "등재 대상" 판정은
 * `registeredTarget`으로 남는다. 충돌 케이스 자체는 그대로 두고 기대값만 바꾼다. */
test('B1-3. 미등록 계좌유형은 Risk Share 등재 대상이 아니다(계산은 보존한다)', () => {
  ['토스', 'CMA', '일반계좌', 'ZZ 증권사', ''].forEach((t) => {
    const r = SB.resolveRemainderRiskShare(t);
    assert.strictEqual(r.registeredTarget, false, JSON.stringify(t) + ' - 자동 적용 등재 대상이 아니다');
    assert.strictEqual(r.reason, 'storedPlanUnregisteredType', JSON.stringify(t));
    assert.strictEqual(r.share, 0.7, JSON.stringify(t) + ' - 저장된 계획 행의 계산은 예전 그대로다');
  });
  // 등재 판정 자체는 여전히 독립 목록이 답한다(TAX-RISK-04의 근거).
  ['토스', 'CMA'].forEach((t) => assert.strictEqual(SB.isRiskShareEligibleAccountType(t), false, t));
});

/* ══════════════ 기존 계산 결과 보존 ══════════════ */

test('B1-4. ISA 미배분 잔여분 70:30 결정론 결과가 기존과 같다', () => {
  const sb = freshSandbox();
  sb.state.projection.taxAdvantagedPlan.contributionByOwnerAccount['신랑'] =
    [{ accountType: 'ISA', amount: 1000000, years: 20, frequency: 'monthly' }];
  const det = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  // 손계산 검증: 잔여분 100%가 국내지수 70% · BOND 30%로 나뉜다.
  const stock = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getEffectiveIndexRate('normal', 'domestic'), 20, 1000000 * 0.7, 0, 0);
  const bond = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getReferenceRate('normal', 'BOND'), 20, 1000000 * 0.3, 0, 0);
  assert.ok(Math.abs(det - (stock + bond)) < 1e-6, `${det} vs ${stock + bond}`);
  assert.ok(det > 0);
});

/* [기대값 변경 2026-09-28 · PM 결정 · SoT §67-5] 예전 기대값은 0(잔여분 없음)이었다.
 * 이미 저장된 계획 행의 계산을 바꾸지 않는다는 DR-B2에 따라, 미등재 유형이어도 예전(v274)과
 * 같은 결과를 낸다. 신규 미등재 유형에 70:30이 붙지 않는 이유는 게이트가 아니라 진입 경로다
 * (적립계획 행은 보유 중인 절세계좌 유형에만 자동 생성된다). */
test('B1-5. 미등재 계좌유형의 저장된 적립 계획도 예전과 같은 잔여분 계산을 유지한다', () => {
  const sb = freshSandbox();
  sb.state.projection.taxAdvantagedPlan.contributionByOwnerAccount['신랑'] =
    [{ accountType: '토스', amount: 1000000, years: 20, frequency: 'monthly' }];
  const det = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const stock = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getEffectiveIndexRate('normal', 'domestic'), 20, 1000000 * 0.7, 0, 0);
  const bond = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getReferenceRate('normal', 'BOND'), 20, 1000000 * 0.3, 0, 0);
  assert.ok(Math.abs(det - (stock + bond)) < 1e-6, `${det} vs ${stock + bond}`);
  assert.ok(det > 0, '기존 저장 계획의 계산이 사라지지 않는다(DR-B2)');
  // 그래도 등재 대상은 아니다 - 두 사실이 함께 성립한다.
  assert.strictEqual(sb.isRiskShareEligibleAccountType('토스'), false);
});

test('B1-6. 소유자 단일 풀(계좌별 설정 없음) 경로는 예전처럼 70:30이다', () => {
  const sb = freshSandbox();
  sb.state.projection.taxAdvantagedPlan.monthlyByOwner['신랑'] = 1000000;
  sb.state.projection.taxAdvantagedPlan.yearsByOwner['신랑'] = 20;
  const det = sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const stock = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getEffectiveIndexRate('normal', 'domestic'), 20, 1000000 * 0.7, 0, 0);
  const bond = sb.computeFutureValueWithContributionGrowthAndFee(0, sb.getReferenceRate('normal', 'BOND'), 20, 1000000 * 0.3, 0, 0);
  assert.ok(Math.abs(det - (stock + bond)) < 1e-6, `${det} vs ${stock + bond}`);
});

test('B1-7. 범위 판정(일반계좌 · 리밸런싱 대상)은 예전 그대로다', () => {
  const sb = freshSandbox();
  const eligible = (accountType) => sb.isRebalanceEligibleAccount({ accountType });
  ['ISA', 'IRP', '연금저축'].forEach((t) => assert.strictEqual(eligible(t), false, t + ' - 절세계좌는 일반 범위 밖'));
  ['일반계좌', '토스', 'CMA', '채권/현금', '', 'ZZ 증권사'].forEach((t) =>
    assert.strictEqual(eligible(t), true, JSON.stringify(t) + ' - 그 외는 일반 범위(UNCLASSIFIED도 제외하지 않는다)'));
});

test('B2-6. UNCLASSIFIED 자산은 계산에서 빠지지 않는다(DR-B2 · 표시 전용)', () => {
  const sb = freshSandbox();
  const tossAsset = sb.asset({ ticker: '005930', name: 'ZZ 국내주식', category: '주식', accountType: '토스' });
  const generalAsset = sb.asset({ ticker: '005930', name: 'ZZ 국내주식', category: '주식', accountType: '일반계좌' });

  sb.state.assets = [generalAsset];
  const withGeneral = sb.getProjectionGroupStats('신랑');
  sb.state.assets = [tossAsset];
  const withToss = sb.getProjectionGroupStats('신랑');

  assert.deepStrictEqual(withToss, withGeneral,
    'UNCLASSIFIED 계좌유형도 일반계좌와 똑같이 집계된다 - 사전에 없다는 이유로 빼지 않는다');
  assert.strictEqual(sb.classifyAccountType('토스'), 'UNCLASSIFIED', '분류는 UNCLASSIFIED다(표시용)');
});
/* ══════════════ v275 HOLD 해소 · 기존 저장 데이터 보존 (SoT §67-5) ══════════════
 *
 * Phase B가 계좌유형 등재 여부로 **이미 저장된 적립계획 행**의 잔여분까지 계산에서 빼 버려
 * DR-B2("UNCLASSIFIED는 표시 · 안내 전용 · 기존 계산 결과 보존")와 충돌했다.
 * 아래 골든값은 **v274 코드(commit a08b5c4)를 그대로 돌려 실측한 값**이다 -
 * 기존 사용자 계산이 이번 변경으로 달라지지 않는다는 것을 숫자로 고정한다.
 * ══════════════════════════════════════════════════════════════════════════ */

// 조건: 월 100만원 · 20년 · 직접 배분 40%(005930) · 미배분 잔여분 60%
const HOLD_CASE_V274_DETERMINISTIC = 495891124;   // v274 실측
const HOLD_CASE_V274_MC = [                        // v274 실측(절세 scope · key 정렬)
  { key: 'C:국내:주식', initial: 0, monthlySum: 100800000 },
  { key: 'C:국내:채권', initial: 0, monthlySum: 43200000 },
  { key: 'T:005930.KS', initial: 0, monthlySum: 96000000 }
];

function holdCaseSandbox(accountType) {
  const sb = freshSandbox();
  sb.state.projection.taxAdvantagedPlan.allocationByOwner['신랑'] =
    [{ accountType, ticker: '005930', label: 'ZZ 국내주식', pct: 40 }];
  sb.state.projection.taxAdvantagedPlan.contributionByOwnerAccount['신랑'] =
    [{ accountType, frequency: 'monthly', amount: 1000000, years: 20 }];
  return sb;
}
const holdCaseMc = (sb) => {
  const map = sb.buildTaxAdvantagedMonteCarloInputs('신랑', 'normal', 20);
  const out = [];
  map.forEach((v, k) => out.push({ key: k, initial: Math.round(v.initial || 0), monthlySum: Math.round((v.monthly || []).reduce((a, b) => a + b, 0)) }));
  return out.sort((a, b) => a.key.localeCompare(b.key));
};

test('TEST-01. 미등재 accountType 기존 적립계획의 결정론 결과가 v274와 같다', () => {
  ['미등재_TEST', '토스', 'CMA'].forEach((t) => {
    const det = holdCaseSandbox(t).simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
    assert.strictEqual(Math.round(det), HOLD_CASE_V274_DETERMINISTIC, t + ' - v274 실측값과 같아야 한다');
  });
});

test('TEST-02. 미등재 accountType 기존 적립계획의 MC 구성 · 납입액이 v274와 같다', () => {
  ['미등재_TEST', '토스', 'CMA'].forEach((t) => {
    assert.deepStrictEqual(holdCaseMc(holdCaseSandbox(t)), HOLD_CASE_V274_MC,
      t + ' - instrument 구성과 납입 반영액이 v274와 같아야 한다(잔여분이 사라지지 않는다)');
  });
});

test('TEST-03. ISA · IRP · 연금저축은 기존과 동일하게 70:30이 적용된다', () => {
  ['ISA', 'IRP', '연금저축'].forEach((t) => {
    const sb = holdCaseSandbox(t);
    assert.strictEqual(Math.round(sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20)), HOLD_CASE_V274_DETERMINISTIC, t);
    assert.deepStrictEqual(holdCaseMc(sb), HOLD_CASE_V274_MC, t);
    assert.strictEqual(sb.resolveRemainderRiskShare(t).share, 0.7, t);
  });
});

test('TEST-04. 미등재 accountType은 Risk Share 자동 적용 등재 대상이 아니다(TAX-RISK-04)', () => {
  const sb = freshSandbox();
  ['미등재_TEST', '토스', 'CMA', '일반계좌'].forEach((t) => {
    assert.strictEqual(sb.isRiskShareEligibleAccountType(t), false, t);
    assert.strictEqual(sb.resolveRemainderRiskShare(t).registeredTarget, false, t);
  });
  // 등재 목록은 세제혜택 사전에서 파생되지 않는다 - 한쪽에 유형을 더해도 다른 쪽이 따라가지 않는다.
  const riskList = sb.evalInSandbox('RISK_SHARE_ELIGIBLE_ACCOUNT_TYPES');
  const taxList = sb.evalInSandbox('TAX_ADVANTAGED_ACCOUNT_TYPES');
  assert.notStrictEqual(riskList, taxList, '같은 배열 객체가 아니다');
  assert.ok(Object.isFrozen(riskList), '위험 배분 등재 목록은 동결돼 있다');
});

test('TEST-05. UNCLASSIFIED 판정 자체가 기존 계산을 제외하지 않는다', () => {
  const sb = holdCaseSandbox('토스');
  assert.strictEqual(sb.classifyAccountType('토스'), 'UNCLASSIFIED', '분류는 UNCLASSIFIED다');
  assert.strictEqual(Math.round(sb.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20)), HOLD_CASE_V274_DETERMINISTIC,
    'UNCLASSIFIED여도 계산이 빠지지 않는다(DR-B2 · 표시 · 안내 전용)');
  // 계산 지점이 등재 여부로 분기하지 않는다는 것을 소스에서도 고정한다.
  const src = fs.readFileSync(path.join(ROOT, 'js/05-future-projection.js'), 'utf8');
  assert.ok(!/remainderShare\.eligible/.test(src), '잔여분 계산에 등재 여부 게이트가 남아 있으면 안 된다');
  assert.ok(!/\.eligible\s*\)\s*return;/.test(src), 'MC 잔여분에도 등재 여부 조기 반환이 없어야 한다');
});

test('TEST-06. 소유자 단일 풀 · 일반계좌 등 기존 경로의 결과가 변하지 않는다', () => {
  // 단일 풀(계좌별 설정 없음) 경로
  const pool = freshSandbox();
  pool.state.projection.taxAdvantagedPlan.monthlyByOwner['신랑'] = 1000000;
  pool.state.projection.taxAdvantagedPlan.yearsByOwner['신랑'] = 20;
  const det = pool.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20);
  const stock = pool.computeFutureValueWithContributionGrowthAndFee(0, pool.getEffectiveIndexRate('normal', 'domestic'), 20, 700000, 0, 0);
  const bond = pool.computeFutureValueWithContributionGrowthAndFee(0, pool.getReferenceRate('normal', 'BOND'), 20, 300000, 0, 0);
  assert.ok(Math.abs(det - (stock + bond)) < 1e-6, `${det} vs ${stock + bond}`);

  // 일반계좌 자산은 절세 경로에 들어가지 않는다(범위 판정 불변)
  const gen = freshSandbox();
  gen.state.assets = [gen.asset({ ticker: '005930', name: 'ZZ 국내주식', category: '주식', accountType: '일반계좌' })];
  assert.strictEqual(gen.simulateTaxAdvantagedOwnerGrowth('신랑', 'normal', 20), 0, '일반계좌는 절세 적립 계산 대상이 아니다');
  assert.strictEqual(gen.isRebalanceEligibleAccount({ accountType: '일반계좌' }), true);
  assert.strictEqual(gen.isRebalanceEligibleAccount({ accountType: '토스' }), true, 'UNCLASSIFIED도 일반 범위 그대로다');
});
