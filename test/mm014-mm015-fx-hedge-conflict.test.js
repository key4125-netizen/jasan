/* [MM-014 · MM-015 · PM 최종 결정 2026-09-28] 환헤지가 갈렸을 때 어느 쪽도 고르지 않는다.
 *
 * 이 파일이 고정하는 것 둘.
 *
 * ① MM-014 (결정 ⓑ) — 환헤지 CONFLICT는 MC 위험가정에서 제외한다.
 *    자산군 이름(appClass)은 기존 호환성을 위해 그대로 두지만, **HEDGED σ도 UNHEDGED σ도
 *    적용하지 않는다**. 원금 · 적립 · 리밸런싱은 예전과 똑같이 굴러가고, 빠진 사실을 화면에 말한다.
 *    예전에는 충돌이어도 환노출 자산군(σ 13.72%)으로 조용히 계산했다 - 그것이 곧 한쪽을 고른 것이었다.
 *
 * ② MM-015 (결정 ⓙ) — 채권의 환헤지 사실도 상품 단위 해석기 하나가 답한다.
 *    `bondPosition.identity.hedgeStatus`와 `asset.fxHedgeStatus`는 같은 사실의 입력원 둘이다.
 *    Bond · Risk · MC · 자산 상세가 같은 답을 본다. 어긋나면 CONFLICT다(§60-2 1순위 규칙 폐기).
 *
 * 실제 js/01~29를 index.html 순서로 싣는다(판정 규칙을 가짜로 만들지 않는다).
 * 보유 종목은 전부 합성(ZZ)이며 실제 사용자 데이터를 쓰지 않는다.
 * 실행: node --test test/mm014-mm015-fx-hedge-conflict.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const SB = loadAdapterSandbox();
SB.applyTickerMasterData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ticker-master.json'), 'utf8')));

const MASTER_UNHEDGED = '360750.KS'; // 원장 EM-2026.2 · hedgeStatus UNHEDGED · A등급
const MASTER_ABSENT = '133690.KS';   // 원장에 없음
const CMA = SB.getActiveCmaSet();
const SIGMA_UNHEDGED = SB.resolveCmaRiskForAppClass('US_EQUITY', CMA).volatilityPct;
const SIGMA_HEDGED = SB.resolveCmaRiskForAppClass('US_EQUITY_HEDGED', CMA).volatilityPct;

/* 전제 확인 - 두 자산군이 실제로 다른 값을 쓴다(연결이 없어 같아지는 상황이면 이 파일의 의미가 없다). */
test('전제. US_EQUITY와 US_EQUITY_HEDGED는 둘 다 연결돼 있고 σ가 서로 다르다', () => {
  assert.strictEqual(SB.resolveCmaRiskForAppClass('US_EQUITY', CMA).status, 'MAPPED');
  assert.strictEqual(SB.resolveCmaRiskForAppClass('US_EQUITY_HEDGED', CMA).status, 'MAPPED');
  assert.ok(Math.abs(SIGMA_HEDGED - SIGMA_UNHEDGED) > 1, `σ가 같으면 이 테스트가 무의미하다: ${SIGMA_UNHEDGED} / ${SIGMA_HEDGED}`);
});

/* ══════════════ 공통 도구 ══════════════ */

const NAME = 'ZZ 합성 미국주식형 ETF';
const etfHoldings = (ticker, statuses) => statuses.map((st, i) => SB.makeAsset({
  id: 'zz-e' + i, ticker, name: NAME, category: 'ETF',
  owner: i === 0 ? '신랑' : '와이프', accountType: i === 2 ? '연금저축' : '일반계좌',
  currency: 'KRW', isDomestic: '국내', rateMatchOverride: 'S&P500',
  quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
  fxHedgeStatus: st || undefined
}));

/* state를 이 목록으로 바꿔 fn을 돌리고 원래대로 되돌린다(테스트끼리 영향을 주지 않는다). */
const withAssets = (list, fn) => {
  const beforeAssets = SB.state.assets;
  const beforeBonds = SB.state.bondPositions;
  SB.state.assets = list;
  SB.state.bondPositions = [];
  try { return fn(); } finally { SB.state.assets = beforeAssets; SB.state.bondPositions = beforeBonds; }
};

// resolveMcAppAssetClass가 실제로 보는 것은 Return Key와 그 대상 자산 둘이다.
const mcClassOf = (asset) => SB.resolveMcAppAssetClass({ key: 'S&P500', source: 'override', subject: asset });

/* ══════════════ MM-014 ══════════════ */

test('MM-014 Case A. UNHEDGED - 환노출 자산군 · 위험가정 적용(기존 동작 그대로)', () => {
  withAssets(etfHoldings(MASTER_ABSENT, ['UNHEDGED']), () => {
    const a = SB.state.assets[0];
    assert.strictEqual(SB.resolveInstrumentFxHedge(a).status, 'UNHEDGED');
    const r = mcClassOf(a);
    assert.strictEqual(r.appClass, 'US_EQUITY');
    assert.ok(!r.fxHedgeConflict, '충돌이 아니다');
    assert.strictEqual(SB.resolveCmaRiskForAppClass(r.appClass, CMA).volatilityPct, SIGMA_UNHEDGED);
  });
});

test('MM-014 Case B. HEDGED - 환헤지 자산군 · 위험가정 적용(기존 동작 그대로)', () => {
  withAssets(etfHoldings(MASTER_ABSENT, ['HEDGED']), () => {
    const a = SB.state.assets[0];
    assert.strictEqual(SB.resolveInstrumentFxHedge(a).status, 'HEDGED');
    const r = mcClassOf(a);
    assert.strictEqual(r.appClass, 'US_EQUITY_HEDGED');
    assert.ok(!r.fxHedgeConflict);
    assert.strictEqual(SB.resolveCmaRiskForAppClass(r.appClass, CMA).volatilityPct, SIGMA_HEDGED);
  });
});

test('MM-014 Case C. masterMismatch - 자산군 이름은 유지하되 위험가정을 확정하지 않는다', () => {
  // 원장이 비헤지라고 적어 둔 종목에 사용자가 환헤지를 골랐다.
  withAssets(etfHoldings(MASTER_UNHEDGED, ['HEDGED']), () => {
    const a = SB.state.assets[0];
    const f = SB.resolveInstrumentFxHedge(a);
    assert.strictEqual(f.conflict, true);
    assert.strictEqual(f.status, null, '어느 쪽도 채택하지 않는다');
    assert.strictEqual(f.instrument.reason, 'masterMismatch');

    const r = mcClassOf(a);
    // [PM 결정 ⓑ] 이름은 기존 호환성을 위해 유지한다 - 그러나 이것을 "UNHEDGED로 확정"으로 읽지 않는다.
    assert.strictEqual(r.appClass, 'US_EQUITY');
    assert.strictEqual(r.fxHedgeConflict, true, '위험가정을 확정할 수 없다는 표식이 있어야 한다');
    // 저장값은 그대로다(migration 없음).
    assert.strictEqual(a.fxHedgeStatus, 'HEDGED');
  });
});

test('MM-014 Case D. holdingConflict - 같은 상품의 확정값이 갈리면 위험가정을 확정하지 않는다', () => {
  withAssets(etfHoldings(MASTER_ABSENT, ['HEDGED', 'UNHEDGED']), () => {
    const f = SB.resolveInstrumentFxHedge(SB.state.assets[0]);
    assert.strictEqual(f.conflict, true);
    assert.strictEqual(f.instrument.reason, 'holdingConflict');
    SB.state.assets.forEach((a) => {
      const r = mcClassOf(a);
      assert.strictEqual(r.appClass, 'US_EQUITY');
      assert.strictEqual(r.fxHedgeConflict, true, '두 보유분 모두 같은 답이다');
    });
  });
});

test('MM-014 Case E. UNRESOLVED - 기존 정책 그대로(충돌과 구분한다)', () => {
  withAssets(etfHoldings(MASTER_ABSENT, [null]), () => {
    const a = SB.state.assets[0];
    const f = SB.resolveInstrumentFxHedge(a);
    assert.strictEqual(f.status, null);
    assert.strictEqual(f.conflict, false, '미확인은 충돌이 아니다');
    const r = mcClassOf(a);
    assert.strictEqual(r.appClass, 'US_EQUITY');
    assert.ok(!r.fxHedgeConflict, '미확인은 위험가정을 막지 않는다 - 기존 동작 그대로다');
    assert.strictEqual(SB.resolveCmaRiskForAppClass(r.appClass, CMA).volatilityPct, SIGMA_UNHEDGED);
  });
});

test('MM-014 경계. 환헤지가 자산군을 바꾸지 않는 자산군은 충돌이 있어도 막지 않는다', () => {
  // 국내 주식형은 원문에 환헤지 짝이 없다 - 환헤지 값이 갈려도 위험가정은 예전대로 적용된다.
  withAssets(etfHoldings(MASTER_ABSENT, ['HEDGED', 'UNHEDGED']), () => {
    const a = SB.state.assets[0];
    assert.strictEqual(SB.resolveInstrumentFxHedge(a).conflict, true);
    const r = SB.resolveMcAppAssetClass({ key: 'KOSPI', source: 'override', subject: a });
    assert.strictEqual(r.appClass, 'KR_EQUITY');
    assert.ok(!r.fxHedgeConflict, '환헤지가 자산군에 영향을 주지 않으면 막지 않는다');
  });
});

/* MC까지 실제로 흘려 본다 - σ가 어느 쪽도 아니고, 원금은 사라지지 않으며, 사실을 알린다. */
function mcSandboxFor(ticker, statuses) {
  const sb = loadAdapterSandbox();
  sb.applyTickerMasterData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ticker-master.json'), 'utf8')));
  const S = sb.state;
  S.assets = []; S.transactions = []; S.bondPositions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = {};
  S.projection.monthlyContributionByOwner = {
    '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] }
  };
  S.projection.contributionGrowthRate = 0;
  S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => {
    S.rebalance[o].domestic = { '국내': 100, '해외': 0 };
    S.rebalance[o].targets = { '국내': [], '해외': [] };
  });
  sb.getCachedDailyCloses = async () => null;
  S.assets = statuses.map((st, i) => sb.makeAsset({
    id: 'zz-m' + i, ticker, name: NAME, category: 'ETF', owner: '신랑',
    accountType: i === 0 ? '일반계좌' : '토스', currency: 'KRW', isDomestic: '국내',
    rateMatchOverride: 'S&P500', quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
    fxHedgeStatus: st || undefined
  }));
  S.rebalance['신랑'].targets['국내'] = [{ type: 'ticker', ticker, label: NAME, pct: 100 }];
  return sb;
}
const runMc = (sb) => sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: false, years: 20 });
const only = (r) => r.cma.instruments[0];

test('MM-014 MC 통합. 충돌이면 σ를 어느 쪽에서도 받지 않고 그 사실을 알린다(원금은 그대로)', async () => {
  const conflict = await runMc(mcSandboxFor(MASTER_UNHEDGED, ['HEDGED']));
  assert.deepStrictEqual(Array.from(conflict.errors), [], 'MC 전체를 막지 않는다 - 이 자산만 위험가정에서 빠진다');
  const e = only(conflict);
  assert.strictEqual(e.riskFree, true, '위험가정을 적용하지 않는다');
  assert.strictEqual(e.volatilityPct ?? 0, 0);
  assert.notStrictEqual(e.volatilityPct, SIGMA_UNHEDGED, 'UNHEDGED σ를 쓰지 않았다');
  assert.notStrictEqual(e.volatilityPct, SIGMA_HEDGED, 'HEDGED σ를 쓰지 않았다');
  // 원금 · 비중은 그대로다 - 위험가정만 빠지고 자산이 universe에서 사라지지 않는다.
  assert.strictEqual(conflict.instruments.length, 1);
  assert.strictEqual(conflict.instruments[0].weight, 1);
  assert.strictEqual(conflict.instruments[0].sigmaAnnual, 0);
  assert.strictEqual(conflict.instruments[0].muAnnual, 0.051, 'μ(Return Key)는 건드리지 않는다');
  assert.strictEqual(conflict.fxHedgeConflictAssets.length, 1);
  assert.strictEqual(conflict.fxHedgeConflictAssets[0].reason, 'FX_HEDGE_CONFLICT');
  const codes = ((conflict.safety.dataQuality || {}).issues || []).map((i) => i.code);
  assert.ok(codes.includes('MC_FX_HEDGE_CONFLICT'), '무엇이 왜 빠졌는지 말한다: ' + codes.join(','));
});

test('MM-014 MC 통합. 정상 HEDGED · UNHEDGED는 예전 σ를 그대로 받는다', async () => {
  const unhedged = await runMc(mcSandboxFor(MASTER_ABSENT, ['UNHEDGED']));
  const hedged = await runMc(mcSandboxFor(MASTER_ABSENT, ['HEDGED']));
  assert.strictEqual(only(unhedged).riskFree, false);
  assert.strictEqual(only(hedged).riskFree, false);
  assert.ok(Math.abs(only(unhedged).volatilityPct - SIGMA_UNHEDGED) < 1e-9);
  assert.ok(Math.abs(only(hedged).volatilityPct - SIGMA_HEDGED) < 1e-9);
  assert.strictEqual(unhedged.fxHedgeConflictAssets.length, 0);
  assert.strictEqual(hedged.fxHedgeConflictAssets.length, 0);
});

/* ══════════════ MM-015 ══════════════ */

const ISIN = 'US0000000ZZ9';
const BOND_NAME = 'ZZ 미국국채 2032(합성)';

/* specs[i] = { bond: 레코드의 hedgeStatus, asset: 자산의 fxHedgeStatus } · 같은 ISIN을 두 사람이 보유 */
function bondState(specs, currency) {
  const ccy = currency || 'USD';
  const assets = [];
  const positions = [];
  specs.forEach((sp, i) => {
    const asset = SB.makeAsset({
      id: 'zz-b' + i, ticker: ISIN, name: BOND_NAME, category: '채권',
      owner: i === 0 ? '신랑' : '와이프', accountType: '일반계좌',
      currency: ccy, isDomestic: ccy === 'KRW' ? '국내' : '해외',
      quantity: 1000, buyPrice: 10000, currentPrice: 10000,
      fxHedgeStatus: sp.asset || undefined
    });
    assets.push(asset);
    positions.push(SB.evalInSandbox('makeBondPosition')({
      id: 'zz-bp' + i, assetId: asset.id,
      identity: { isin: ISIN, instrumentName: BOND_NAME, bondType: '국채', currency: ccy, hedgeStatus: sp.bond || undefined },
      terms: { issueDate: '2022-05-15', maturityDate: '2032-05-15', couponRate: 4, couponType: 'COUPON', paymentFrequency: 2 },
      holding: { owner: i === 0 ? '신랑' : '와이프', faceAmount: 1e7, purchaseDate: '2022-05-15', purchaseAmount: 1e7 }
    }));
  });
  return { assets, positions };
}

/* 한 보유분에 대해 네 경로가 무엇을 답하는지 모은다. */
function pathsOf(idx) {
  const a = SB.state.assets[idx];
  const p = SB.state.bondPositions[idx];
  const inst = SB.resolveInstrumentFxHedge(a);
  const bond = SB.resolveBondHedgeStatusDetail(p, a);
  const ch = SB.resolveAssetCharacter(a);
  const mc = SB.resolveMcAppAssetClass({ key: 'BOND', source: 'override', subject: a });
  return {
    instrument: inst.status, instrumentConflict: !!inst.conflict,
    bond: bond.status, bondSource: bond.source,
    bondClass: SB.resolveBondClass(p, a),
    character: ch.character, mcClass: mc.appClass,
    guidance: SB.bondRiskGuidanceFor({ key: 'BOND', source: 'override', subject: a })
  };
}
const withBonds = (specs, fn, currency) => {
  const st = bondState(specs, currency);
  const beforeAssets = SB.state.assets;
  const beforeBonds = SB.state.bondPositions;
  SB.state.assets = st.assets;
  SB.state.bondPositions = st.positions;
  try { return fn(st); } finally { SB.state.assets = beforeAssets; SB.state.bondPositions = beforeBonds; }
};

test('MM-015 Case A. 모든 보유분이 같은 HEDGED - 네 경로가 같은 답을 낸다', () => {
  withBonds([{ asset: 'HEDGED' }, { asset: 'HEDGED' }], () => {
    [0, 1].forEach((i) => {
      const r = pathsOf(i);
      assert.strictEqual(r.instrument, 'HEDGED', '보유분 ' + i);
      assert.strictEqual(r.bond, 'HEDGED', '보유분 ' + i);
      assert.strictEqual(r.bondClass, 'FOREIGN_GOV_HEDGED', '보유분 ' + i);
      assert.strictEqual(r.character, 'FOREIGN_GOV_BOND_HEDGED', '보유분 ' + i);
      assert.strictEqual(r.mcClass, 'FOREIGN_GOV_BOND_HEDGED', '보유분 ' + i);
    });
  });
});

test('MM-015 Case B. 한 보유분만 확인해도 같은 상품의 다른 보유분이 그 사실을 쓴다', () => {
  withBonds([{ asset: 'HEDGED' }, {}], () => {
    const first = pathsOf(0), second = pathsOf(1);
    assert.strictEqual(second.instrument, 'HEDGED', '상품 사실이 공유된다');
    assert.strictEqual(second.bond, 'HEDGED', '채권 분류도 같은 사실을 쓴다');
    assert.strictEqual(second.bondClass, 'FOREIGN_GOV_HEDGED');
    assert.strictEqual(second.mcClass, 'FOREIGN_GOV_BOND_HEDGED');
    assert.deepStrictEqual(
      { i: second.instrument, b: second.bond, c: second.bondClass, m: second.mcClass },
      { i: first.instrument, b: first.bond, c: first.bondClass, m: first.mcClass },
      '두 보유분이 같은 답이다');
  });
});

test('MM-015 Case B-2. 채권 레코드에만 적어 둔 값도 같은 상품 전체가 쓴다', () => {
  withBonds([{ bond: 'HEDGED' }, {}], () => {
    [0, 1].forEach((i) => {
      const r = pathsOf(i);
      assert.strictEqual(r.instrument, 'HEDGED', '보유분 ' + i + ' - 레코드 값이 상품 사실의 입력원이다');
      assert.strictEqual(r.bondClass, 'FOREIGN_GOV_HEDGED', '보유분 ' + i);
    });
  });
});

test('MM-015 Case C. 보유분끼리 HEDGED/UNHEDGED로 갈리면 어느 쪽도 채택하지 않는다', () => {
  withBonds([{ asset: 'HEDGED' }, { asset: 'UNHEDGED' }], (st) => {
    [0, 1].forEach((i) => {
      const r = pathsOf(i);
      assert.strictEqual(r.instrumentConflict, true, '보유분 ' + i);
      assert.strictEqual(r.instrument, null, '보유분 ' + i);
      assert.strictEqual(r.bond, null, '보유분 ' + i + ' - 채권 분류도 확정하지 않는다');
      assert.strictEqual(r.bondSource, 'INSTRUMENT_CONFLICT', '보유분 ' + i);
      assert.strictEqual(r.bondClass, 'UNCLASSIFIED', '보유분 ' + i);
      assert.strictEqual(r.mcClass, 'BOND', '보유분 ' + i + ' - 미분류 채권 처리구조를 그대로 쓴다');
      assert.strictEqual(r.guidance, 'FX_BOND_HEDGE_CONFLICT', '보유분 ' + i + ' - 왜 못 정했는지 말한다');
    });
    // 저장값은 어느 쪽도 바뀌지 않는다(migration 없음).
    assert.strictEqual(st.assets[0].fxHedgeStatus, 'HEDGED');
    assert.strictEqual(st.assets[1].fxHedgeStatus, 'UNHEDGED');
  });
});

test('MM-015 Case D. 채권 레코드와 자산 값이 서로 다르면 일관되게 CONFLICT다', () => {
  withBonds([{ bond: 'UNHEDGED', asset: 'HEDGED' }, {}], (st) => {
    [0, 1].forEach((i) => {
      const r = pathsOf(i);
      assert.strictEqual(r.instrumentConflict, true, '보유분 ' + i);
      assert.strictEqual(r.bond, null, '보유분 ' + i);
      assert.strictEqual(r.bondClass, 'UNCLASSIFIED', '보유분 ' + i);
    });
    assert.strictEqual(st.positions[0].identity.hedgeStatus, 'UNHEDGED', '레코드 저장값 보존');
    assert.strictEqual(st.assets[0].fxHedgeStatus, 'HEDGED', '자산 저장값 보존');
  });
});

test('MM-015 Case D-2. 레코드와 자산이 같은 값이면 충돌이 아니다(정상 경로가 막히지 않는다)', () => {
  withBonds([{ bond: 'HEDGED', asset: 'HEDGED' }, {}], () => {
    const r = pathsOf(0);
    assert.strictEqual(r.instrumentConflict, false);
    assert.strictEqual(r.bond, 'HEDGED');
    assert.strictEqual(r.bondClass, 'FOREIGN_GOV_HEDGED');
  });
});

test('MM-015 경계. 원화 채권은 환헤지를 보지 않는다(§58-5 - 값이 갈려도 영향 없다)', () => {
  withBonds([{ bond: 'HEDGED' }, { asset: 'UNHEDGED' }], () => {
    [0, 1].forEach((i) => {
      const p = SB.state.bondPositions[i];
      const a = SB.state.assets[i];
      const d = SB.resolveBondHedgeStatusDetail(p, a);
      assert.strictEqual(d.source, 'NOT_APPLICABLE', '보유분 ' + i);
      assert.strictEqual(SB.resolveBondClass(p, a), 'KR_GOV', '보유분 ' + i + ' - 발행인 유형으로 분류된다');
      assert.strictEqual(SB.resolveInstrumentFxHedge(a).conflict, false,
        '보유분 ' + i + ' - 원화 채권의 레코드 값은 상품 사실로 세지 않는다');
    });
  }, 'KRW');
});

/* ══════════════ 순서 비의존성 · 결정성 ══════════════ */

test('순서 비의존성. 보유분 배열 순서를 바꿔도 모든 답이 같다', () => {
  const read = (specs, reversed) => {
    const st = bondState(specs);
    const assets = reversed ? st.assets.slice().reverse() : st.assets;
    const positions = reversed ? st.positions.slice().reverse() : st.positions;
    const beforeA = SB.state.assets, beforeB = SB.state.bondPositions;
    SB.state.assets = assets; SB.state.bondPositions = positions;
    try {
      // 원래 순서 기준의 보유분 id로 정렬해 비교한다(배열 위치가 아니라 같은 보유분끼리 비교한다).
      return st.assets.map((a) => {
        const idx = assets.indexOf(a);
        return Object.assign({ id: a.id }, pathsOf(idx));
      });
    } finally { SB.state.assets = beforeA; SB.state.bondPositions = beforeB; }
  };
  [
    [{ asset: 'HEDGED' }, {}],
    [{ asset: 'HEDGED' }, { asset: 'UNHEDGED' }],
    [{ bond: 'UNHEDGED', asset: 'HEDGED' }, {}],
    [{ bond: 'HEDGED' }, { bond: 'UNHEDGED' }]
  ].forEach((specs, n) => {
    assert.deepStrictEqual(read(specs, true), read(specs, false), '케이스 ' + n);
  });

  // 주식형도 같다 - 보유분 순서가 환헤지 판정과 MC 자산군을 바꾸지 않는다.
  const equity = (reversed) => {
    const list = etfHoldings(MASTER_ABSENT, ['HEDGED', null]);
    const arr = reversed ? list.slice().reverse() : list;
    return withAssets(arr, () => list.map((a) => [SB.resolveInstrumentFxHedge(a).status, mcClassOf(a).appClass]));
  };
  assert.deepStrictEqual(equity(true), equity(false));
});

test('결정성. 같은 입력을 여러 번 읽어도 답이 같다(호출 횟수에 흔들리지 않는다)', () => {
  withBonds([{ bond: 'UNHEDGED', asset: 'HEDGED' }, {}], () => {
    const first = JSON.stringify([pathsOf(0), pathsOf(1)]);
    for (let i = 0; i < 5; i += 1) {
      assert.strictEqual(JSON.stringify([pathsOf(0), pathsOf(1)]), first, '반복 ' + i);
    }
  });
  withAssets(etfHoldings(MASTER_UNHEDGED, ['HEDGED']), () => {
    const a = SB.state.assets[0];
    const first = JSON.stringify([SB.resolveInstrumentFxHedge(a).status, mcClassOf(a)]);
    for (let i = 0; i < 5; i += 1) {
      assert.strictEqual(JSON.stringify([SB.resolveInstrumentFxHedge(a).status, mcClassOf(a)]), first, '반복 ' + i);
    }
  });
});

test('결정성. 같은 seed · 같은 입력이면 MC 결과가 같다', async () => {
  const run = async () => {
    const sb = mcSandboxFor(MASTER_UNHEDGED, ['HEDGED']);
    const input = await runMc(sb);
    const res = sb.runMonthlyPrecisionMC({
      pv0: 1e8, instruments: input.instruments, correlationMatrix: input.correlationMatrix,
      monthlyContribution: 0, years: 20, iterations: 500, seed: 20260101, taxScope: input.taxScope
    });
    const fv = res.finalValue || {};
    return [fv.p10, fv.p50, fv.p90, fv.mean];
  };
  assert.deepStrictEqual(await run(), await run());
});
