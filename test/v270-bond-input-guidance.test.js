/* [PM 지시 2026-09-24] v270 잔여사항 - 입력 보존과 안내의 정확성.
 *
 *   ISSUE-01  채권 입력 저장 조건 - 사용자가 채운 값을 버리지 않는다(그리고 기존 레코드를 지우지 않는다)
 *   ISSUE-02  원화 채권에 환헤지를 요구하지 않는다
 *   ISSUE-03  보유 채권과 이어지지 않은 목표 행에 "채권 정보를 채우라"고 하지 않는다
 *   ISSUE-04  비중조절 검색이 0건일 때 이유를 말한다
 *
 * 실제 js/01~10 · 16 · 21 · 29를 vm 샌드박스에 그대로 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 보유 종목은 전부 합성(ZZ)이다.
 * 실행: node --test test/v270-bond-input-guidance.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

/* ════════════════ ISSUE-01 · 채권 입력 저장 조건 ════════════════
 *
 * persistBondPositionForAsset은 폼을 document.getElementById로 읽는다.
 * 샌드박스의 기본 스텁은 모든 칸을 빈 값으로 돌려주므로, 이 블록에서만
 * "화면에 이 값이 들어 있다"를 흉내 내는 표로 바꿔 끼운다. */

// 폼 표를 샌드박스 안으로 넣고 저장을 돌린다.
// schedulePush는 동기화 모듈(js/12) 것이라 이 하네스에는 없다 - 저장 경로를 막지 않게 비워 둔다.
function saveBondForm(fields, seed) {
  const sb = loadAdapterSandbox();
  sb.schedulePush = () => {};
  sb.state.assets = [];
  sb.state.bondPositions = seed ? [sb.evalInSandbox('makeBondPosition')(seed)] : [];
  const table = Object.assign({
    f_owner: '신랑', f_accountType: '일반계좌', f_currency: 'KRW', f_name: 'ZZ 합성채권',
    f_quantity: '', f_buyPrice: ''
  }, fields || {});
  sb.evalInSandbox(`
    globalThis.__form = ${JSON.stringify(table)};
    document.getElementById = function (id) {
      if (Object.prototype.hasOwnProperty.call(globalThis.__form, id)) return { value: globalThis.__form[id] };
      return { value: '', textContent: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {} };
    };
    persistBondPositionForAsset('ZZ-A1', '채권');
  `);
  return sb.state.bondPositions;
}

test('ISSUE-01. 발행인 유형만 골라도 저장된다 - 예전에는 조용히 버려졌다', () => {
  const saved = saveBondForm({ f_bondType: '국채' });
  assert.strictEqual(saved.length, 1, '발행인 유형만 채운 입력이 사라졌다');
  assert.strictEqual(saved[0].identity.bondType, '국채');
  assert.strictEqual(saved[0].assetId, 'ZZ-A1');
});

test('ISSUE-01. 화면에 있는 칸은 무엇 하나만 채워도 저장된다', () => {
  const only = [
    ['f_bondType', '회사채'], ['f_bondHedge', 'HEDGED'], ['f_bondRating', 'AA'],
    ['f_bondIssueDate', '2024-03-10'], ['f_bondMaturityDate', '2030-03-10'],
    ['f_bondCouponType', 'COUPON'], ['f_bondPayFreq', '2'],
    ['f_bondPurchaseDate', '2024-04-01'], ['f_bondCouponRate', '3.25'],
    ['f_bondFaceAmount', '10000000'], ['f_bondIsin', 'KR103502G990']
  ];
  only.forEach(([id, v]) => {
    const saved = saveBondForm({ [id]: v });
    assert.strictEqual(saved.length, 1, `${id}만 채운 입력이 사라졌다`);
  });
});

test('ISSUE-01. 발행인 유형만 들어 있던 기존 레코드를 저장하면서 지우지 않는다', () => {
  /* 예전 조건은 이 레코드를 "아무것도 없음"으로 보고 splice로 지웠다 - 데이터 손실이었다.
   * 사용자는 발행인 유형을 고치려고 저장을 눌렀을 뿐인데 있던 정보까지 사라졌다. */
  const seed = {
    assetId: 'ZZ-A1',
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'KRW' },
    terms: {}, holding: { owner: '신랑', account: '일반계좌' }, source: 'manual'
  };
  const saved = saveBondForm({ f_bondType: '국채' }, seed);
  assert.strictEqual(saved.length, 1, '기존 레코드가 저장 중에 삭제됐다');
  assert.strictEqual(saved[0].identity.bondType, '국채');
});

test('ISSUE-01. 채권 칸을 하나도 채우지 않으면 여전히 빈 레코드를 만들지 않는다', () => {
  assert.strictEqual(saveBondForm({}).length, 0, '빈 레코드를 만들면 안 된다');
});

test('ISSUE-01. 자산군이 채권이 아니면 기존 정책대로 레코드를 지운다', () => {
  const sb = loadAdapterSandbox();
  sb.schedulePush = () => {};
  sb.state.bondPositions = [sb.evalInSandbox('makeBondPosition')({
    assetId: 'ZZ-A1', identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'KRW' },
    terms: {}, holding: { owner: '신랑', account: '일반계좌' }, source: 'manual'
  })];
  sb.evalInSandbox("persistBondPositionForAsset('ZZ-A1', 'ETF');");
  assert.strictEqual(sb.state.bondPositions.length, 0, '채권이 아니게 되면 계산에 남는 유령을 만들지 않는다');
});

/* ════════════════ ISSUE-02 · ISSUE-03 · 위험 미반영 안내 ════════════════ */

function sandboxWithBondTarget(bondFields, targetOverride, assetOverride) {
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 100, '해외': 0 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });

  const equity = sb.makeAsset({ ticker: '005930', name: 'ZZ 국내주식', category: '주식', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내' });
  const bond = sb.makeAsset(Object.assign({ ticker: '', name: 'ZZ 합성채권', category: '채권', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내' }, assetOverride || {}));
  S.assets = [equity, bond];
  S.bondPositions = bondFields ? [sb.evalInSandbox('makeBondPosition')(Object.assign({ assetId: bond.id }, bondFields))] : [];
  S.rebalance['신랑'].targets['국내'] = [
    { type: 'ticker', ticker: '005930', label: 'ZZ 국내주식', pct: 50 },
    targetOverride || { type: 'namedHolding', label: 'ZZ 합성채권', name: 'ZZ 합성채권', pct: 50 }
  ];
  sb.getCachedDailyCloses = async () => null;
  return sb;
}

const run = (sb) => sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
const issueOf = (r, code) => r.safety.dataQuality.issues.find((i) => i.code === code);

test('ISSUE-02. 원화 채권 안내는 환헤지를 채우라고 하지 않는다', async () => {
  const sb = sandboxWithBondTarget({
    identity: { instrumentName: 'ZZ 합성채권', currency: 'KRW' }, // 발행인 유형만 비어 있다
    terms: { maturityDate: '2032-05-15', couponRate: 3.25 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  });
  const r = await run(sb);
  assert.deepStrictEqual(Array.from(r.errors), []);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].guidance, 'KRW_BOND_TYPE_MISSING');
  const issue = issueOf(r, 'BOND_RISK_ASSUMPTION_UNRESOLVED');
  assert.ok(issue, '안내가 없다');
  assert.match(issue.message, /원화 채권이라 발행인 유형/);
  assert.match(issue.message, /환헤지는 원화 채권에 적용되지 않습니다/);
  // 원금이 사라지지 않았다는 기존 문장은 그대로 남는다.
  assert.match(issue.message, /위험이 없다"는 뜻이 아니라/);
});

test('ISSUE-02. 외화 채권 안내는 발행인 유형과 환헤지를 둘 다 말한다', async () => {
  const sb = sandboxWithBondTarget({
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'USD' }, // 환헤지 없음
    terms: { maturityDate: '2032-05-15', couponRate: 4 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  });
  const r = await run(sb);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].guidance, 'FX_BOND_TYPE_OR_HEDGE_MISSING');
  const issue = issueOf(r, 'BOND_RISK_ASSUMPTION_UNRESOLVED');
  assert.match(issue.message, /외화 채권이라 발행인 유형과 환헤지 여부가 둘 다/);
});

test('ISSUE-02. 채권 정보가 아예 없으면 등록이 필요하다고 말한다', async () => {
  const r = await run(sandboxWithBondTarget(null));
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].guidance, 'NO_BOND_RECORD');
  assert.match(issueOf(r, 'BOND_RISK_ASSUMPTION_UNRESOLVED').message, /아직 채권 정보.*등록돼 있지 않아/);
});

test('ISSUE-03. 자산군 캐치올 행에는 "채권 정보를 채우라"고 하지 않는다', async () => {
  /* 「채권 20%」 같은 행은 어느 채권도 가리키지 않는다(subject가 null이다).
   * 채권 정보를 완벽히 채워도 이 행은 영원히 분류되지 않는다 - 예전 안내는 그 반대를 말했다. */
  const sb = sandboxWithBondTarget({
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2034-03-10', couponRate: 3.5 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  }, { type: 'category', category: '채권', label: '채권', pct: 50 });
  const r = await run(sb);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].guidance, 'CATEGORY_TARGET');
  const issue = issueOf(r, 'BOND_RISK_TARGET_NOT_LINKED');
  assert.ok(issue, '연결되지 않았다는 안내가 없다');
  assert.match(issue.message, /자산군 전체를 가리키는 목표 행/);
  assert.match(issue.message, /채권 정보를 채워도 이 행에는 반영되지 않습니다/);
  assert.match(issue.recommendation, /개별 종목으로 추가/);
  // 채울 것이 없는데 채우라고 하는 옛 안내는 더 이상 나오지 않는다.
  assert.strictEqual(issueOf(r, 'BOND_RISK_ASSUMPTION_UNRESOLVED'), undefined);
});

test('ISSUE-03. 이어지는 보유분이 없는 행도 사실대로 알린다', async () => {
  const sb = sandboxWithBondTarget(null, { type: 'namedHolding', label: 'ZZ 미보유채권', name: 'ZZ 미보유채권', pct: 50 });
  const r = await run(sb);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].guidance, 'NO_LINKED_HOLDING');
  assert.match(issueOf(r, 'BOND_RISK_TARGET_NOT_LINKED').message, /이어지는 보유 채권을.*찾지 못했습니다/);
});

test('ISSUE-02 · 03. 분류된 채권에는 어떤 안내도 나오지 않는다(기존 동작 유지)', async () => {
  const sb = sandboxWithBondTarget({
    identity: { instrumentName: 'ZZ 합성채권', bondType: '국채', currency: 'KRW' },
    terms: { issueDate: '2024-03-10', maturityDate: '2034-03-10', couponRate: 3.5, couponType: 'COUPON', paymentFrequency: 2 },
    holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
  });
  const r = await run(sb);
  assert.strictEqual(r.bondsWithoutRiskAssumption.length, 0);
  assert.strictEqual(issueOf(r, 'BOND_RISK_ASSUMPTION_UNRESOLVED'), undefined);
  assert.strictEqual(issueOf(r, 'BOND_RISK_TARGET_NOT_LINKED'), undefined);
});

test('ISSUE-02 · 03. 안내가 달라져도 계산은 그대로다 - σ · 비중 · 원금', async () => {
  const sb = sandboxWithBondTarget(null);
  const r = await run(sb);
  const idx = r.assetOrder.findIndex((k) => k.includes('ZZ 합성채권'));
  assert.ok(idx >= 0, 'universe에서 빼면 채권 원금이 미래예측에서 사라진다');
  assert.strictEqual(r.instruments[idx].sigmaAnnual, 0);
  assert.ok(r.instruments[idx].weight > 0);
  assert.strictEqual(r.bondsWithoutRiskAssumption[0].reason, 'BOND_CLASS_UNRESOLVED');
});

/* ════════════════ ISSUE-04 · 검색 0건의 이유 ════════════════ */

function searchSandbox(assets) {
  const sb = loadAdapterSandbox();
  sb.state.assets = assets.map((a) => sb.makeAsset(a));
  sb.evalInSandbox("rebalanceModalOwner = '신랑';");
  return (q, region) => sb.evalInSandbox(`diagnoseRtmAddNoResult(${JSON.stringify(region || '국내')}, ${JSON.stringify(q)})`);
}

const BOND = { ticker: 'KR103502G990', name: 'ZZ 국고채권 23-5', category: '채권', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 1000, buyPrice: 10000, currentPrice: 10100 };

test('ISSUE-04. 보유한 적 없는 이름이면 검색어를 다시 보라고 한다', () => {
  const ask = searchSandbox([BOND]);
  assert.match(ask('ZZ 없는종목'), /맞는 것이 없습니다/);
});

test('ISSUE-04. 다른 지역 탭에 있으면 그 탭을 알려주고 고치는 곳도 알려준다', () => {
  const ask = searchSandbox([Object.assign({}, BOND, { isDomestic: '해외' })]);
  const msg = ask('KR103502G990', '국내');
  assert.match(msg, /해외으?로 저장돼 있어/);
  assert.match(msg, /자산관리에서.*국내 \/ 해외를 고칠 수 있습니다/);
});

test('ISSUE-04. 절세계좌라 빠진 것이면 그 사실과 계좌를 알려준다', () => {
  const ask = searchSandbox([Object.assign({}, BOND, { accountType: 'ISA' })]);
  const msg = ask('ZZ 국고채권');
  assert.match(msg, /ISA/);
  assert.match(msg, /목표 비중은 일반계좌만 다루므로/);
});

test('ISSUE-04. 다른 사람 명의면 누구 것인지 알려준다', () => {
  const ask = searchSandbox([Object.assign({}, BOND, { owner: '와이프' })]);
  const msg = ask('ZZ 국고채권');
  assert.match(msg, /와이프 명의입니다/);
  assert.match(msg, /신랑 목표만 다룹니다/);
});

test('ISSUE-04. 조건을 다 통과했다면 이미 목표에 있다는 뜻이다', () => {
  const ask = searchSandbox([BOND]);
  assert.match(ask('ZZ 국고채권'), /이미 목표에 추가돼 있습니다/);
});

test('ISSUE-04. 검색어가 비어 있으면 아무 말도 하지 않는다', () => {
  const ask = searchSandbox([BOND]);
  assert.strictEqual(ask('   '), '');
});

test('ISSUE-04. 표준코드(ISIN)로도 보유 자산을 찾는다', () => {
  const ask = searchSandbox([BOND]);
  assert.match(ask('kr103502g990'), /이미 목표에 추가돼 있습니다/, '대소문자와 무관하게 ISIN이 매칭돼야 한다');
});
