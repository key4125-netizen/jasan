/* [PM 지시 2026-09-24] 채권 국내/해외 · 환헤지 판정 - 순수 로직 고정.
 *
 *   D-5  과거 판정 버그로 '해외'가 된 원화 채권의 교정 대상 판정
 *   D-7  목표 · 배분 항목의 지역 판정에서 sanitizeTicker를 쓰지 않는다(ISIN을 해외로 보지 않는다)
 *   환헤지  자산 종류별로 환헤지를 물어야 하는지
 *
 * 실제 js/01~10을 vm 샌드박스에 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 실행: node --test test/v270-bond-region.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
const ev = (code) => SB.evalInSandbox(code);
const J = (code) => JSON.parse(ev('JSON.stringify(' + code + ')'));
const ISIN = 'KR103502G990';

/* 샌드박스의 localStorage 스텁은 늘 null을 돌려준다(공용 하네스) - 마커가 남아야
 * 멱등성을 잴 수 있으므로 이 테스트에서만 실제로 값을 들고 있는 것으로 바꾼다. */
ev("localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },"
  + " setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };");

const asset = (over) => Object.assign({
  id: 'ZZ1', name: '국고채권 23-5', ticker: ISIN, category: '채권', categorySource: 'system',
  owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '해외',
  quantity: 1000, buyPrice: 10000, currentPrice: 10100, positionSource: 'ledger'
}, over || {});

/* ══════════════ D-7 · 지역 판정 ══════════════ */

test('D-7. 목표 · 배분 항목의 지역 판정에서 sanitizeTicker를 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '05-future-projection.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/sanitizeTicker\([^)]*\)\.isDomestic/.test(src),
    'js/05에 sanitizeTicker(...).isDomestic 잔존 경로가 없다');
});

test('D-7. 두 판정기의 차이는 표준코드(ISIN) 하나뿐이다 - 나머지는 이전과 같다', () => {
  const pairs = [
    ['005930.KS', 'KRW', '국내', '국내'],
    ['069500.KS', 'KRW', '국내', '국내'],
    ['AAPL', 'USD', '해외', '해외'],
    ['AAPL', '', '해외', '해외'],
    ['', 'KRW', '국내', '국내'],
    [ISIN, 'KRW', '해외', '국내'],   // ← 여기만 달라진다
    [ISIN, '', '해외', '국내']
  ];
  pairs.forEach(([t, c, oldWay, newWay]) => {
    assert.equal(ev(`sanitizeTicker(${JSON.stringify(t)}).isDomestic`), oldWay, `옛 판정 ${t}`);
    assert.equal(ev(`classifyIsDomestic(${JSON.stringify(t)}, ${JSON.stringify(c)})`), newWay, `새 판정 ${t}/${c}`);
  });
});

test('D-7. 티커 없는 외화 자산은 여전히 해외다(기존 보호 규칙 유지)', () => {
  assert.equal(ev("classifyIsDomestic('', 'USD')"), '해외');
  assert.equal(ev("sanitizeTicker('').isDomestic"), '국내', '옛 함수는 여기서 틀렸다 - 그래서 바꾼 것이다');
});

/* ══════════════ D-5 · 교정 대상 판정 ══════════════ */

test('D-5. 교정 대상은 "지금 판정기가 국내라고 답하는 원화 ISIN 채권"뿐이다', () => {
  const kind = (over) => ev(`bondRegionMigrationCandidate(${JSON.stringify(asset(over))})`);
  assert.equal(kind({}), 'auto', '거래내역이 원천인 자산은 자동 교정');
  assert.equal(kind({ positionSource: 'manual' }), 'review', '사용자가 정했을 수 있으면 확인 대상');
  assert.equal(kind({ positionSource: undefined }), 'review', 'legacy도 확인 대상');
  // 대상이 아닌 것
  assert.equal(kind({ isDomestic: '국내' }), null, '이미 국내면 손대지 않는다');
  assert.equal(kind({ currency: 'USD' }), null, '외화 채권은 해외가 맞다');
  assert.equal(kind({ category: 'ETF' }), null, '채권이 아니면 대상이 아니다');
  assert.equal(kind({ ticker: '005930.KS' }), null, '표준코드가 아니면 대상이 아니다');
  assert.equal(kind({ ticker: '' }), null, '티커가 없으면 이 버그의 산물이 아니다');
});

test('D-5. 교정 근거는 "원화라서"가 아니라 승인된 판정기의 답이다', () => {
  // 판정기가 국내라고 답하지 않으면 후보가 되지 않는다.
  assert.equal(ev(`classifyIsDomestic(${JSON.stringify(ISIN)}, 'KRW')`), '국내');
  assert.equal(ev(`bondRegionMigrationCandidate(${JSON.stringify(asset({ currency: 'USD' }))})`), null);
});

test('D-5. isDomestic 외에는 아무것도 바꾸지 않는다', () => {
  const before = asset();
  ev(`state.assets = [makeAsset(${JSON.stringify(before)})];
      localStorage.removeItem('sam_bond_region_migrated_v1');`);
  const snapBefore = J('state.assets[0]');
  ev('runBondRegionMigrationOnce()');
  const after = J('state.assets[0]');
  assert.equal(after.isDomestic, '국내', '지역만 교정된다');
  ['id', 'ticker', 'name', 'category', 'owner', 'accountType', 'currency', 'quantity',
    'buyPrice', 'currentPrice', 'positionSource', 'updatedAt', 'createdAt',
    'rateMatchOverride', 'fxHedgeStatus', 'marketBetaIndexOverride'].forEach((k) => {
    assert.deepEqual(after[k], snapBefore[k], k + '은 그대로다');
  });
});

test('D-5. 한 번만 돈다(멱등) - 마커가 있으면 다시 바꾸지 않는다', () => {
  ev(`state.assets = [makeAsset(${JSON.stringify(asset())})];
      localStorage.removeItem('sam_bond_region_migrated_v1');`);
  const first = J('runBondRegionMigrationOnce()');
  assert.deepEqual([first.skipped, first.fixed], [false, 1]);
  // 사용자가 일부러 다시 해외로 바꾼 상황 - 마이그레이션이 그것을 되돌리면 안 된다.
  ev("state.assets[0].isDomestic = '해외';");
  const second = J('runBondRegionMigrationOnce()');
  assert.equal(second.skipped, true, '두 번째 부팅에서는 돌지 않는다');
  assert.equal(ev('state.assets[0].isDomestic'), '해외', '사용자 선택을 되돌리지 않는다');
});

test('D-5. 확인 대상(REVIEW)은 자동으로 바꾸지 않는다', () => {
  ev(`state.assets = [makeAsset(${JSON.stringify(asset({ positionSource: 'manual' }))})];
      localStorage.removeItem('sam_bond_region_migrated_v1');`);
  const r = J('runBondRegionMigrationOnce()');
  assert.deepEqual([r.fixed, r.review], [0, 1]);
  assert.equal(ev('state.assets[0].isDomestic'), '해외', '사용자가 정했을 수 있는 값은 그대로 둔다');
});

/* ══════════════ 환헤지 표시 조건 ══════════════ */

test('환헤지. 자산 종류별 표시 조건', () => {
  const cases = [
    ['국내 주식(원화)', { ticker: '005930.KS', category: '주식', currency: 'KRW', isDomestic: '국내' }, false],
    ['국내 ETF(원화)', { ticker: '069500.KS', category: 'ETF', currency: 'KRW', isDomestic: '국내' }, false],
    ['국내상장 해외ETF', { ticker: '360750.KS', category: 'ETF', currency: 'KRW', isDomestic: '해외' }, true],
    ['해외 직접(USD)', { ticker: 'AAPL', category: '주식', currency: 'USD', isDomestic: '해외' }, true],
    ['원화 국채(교정 후)', { ticker: ISIN, category: '채권', currency: 'KRW', isDomestic: '국내' }, false],
    ['원화 국채(교정 전)', { ticker: ISIN, category: '채권', currency: 'KRW', isDomestic: '해외' }, true],
    ['외화 채권', { ticker: '', category: '채권', currency: 'USD', isDomestic: '해외' }, true],
    ['원화 현금', { ticker: '', category: '현금', currency: 'KRW', isDomestic: '국내' }, false],
    ['달러 현금', { ticker: '', category: '현금', currency: 'USD', isDomestic: '해외' }, true]
  ];
  cases.forEach(([label, a, want]) => {
    assert.equal(ev(`shouldOfferFxHedgeChoice(${JSON.stringify(a)})`), want, label);
  });
});

test('환헤지. 국내 국채는 교정되면 환헤지를 묻지 않는다(같은 원인 · 같은 해소)', () => {
  const before = { ticker: ISIN, category: '채권', currency: 'KRW', isDomestic: '해외' };
  const after = Object.assign({}, before, { isDomestic: '국내' });
  assert.equal(ev(`shouldOfferFxHedgeChoice(${JSON.stringify(before)})`), true, '교정 전에는 물었다');
  assert.equal(ev(`shouldOfferFxHedgeChoice(${JSON.stringify(after)})`), false, '교정 후에는 묻지 않는다');
});

test('환헤지. 저장된 hedgeStatus는 교정으로 지워지지 않는다', () => {
  ev(`state.assets = [makeAsset(${JSON.stringify(asset({ fxHedgeStatus: 'HEDGED' }))})];
      localStorage.removeItem('sam_bond_region_migrated_v1');`);
  ev('runBondRegionMigrationOnce()');
  assert.equal(ev('state.assets[0].isDomestic'), '국내');
  assert.equal(ev('state.assets[0].fxHedgeStatus'), 'HEDGED', '사용자가 고른 값을 조용히 지우지 않는다');
});

test('환헤지. 원화 채권은 hedgeStatus가 있어도 채권 분류에 쓰이지 않는다(기존 정책)', () => {
  const pos = (over) => `makeBondPosition(${JSON.stringify(Object.assign({
    assetId: 'ZZ1',
    identity: { isin: ISIN, instrumentName: '국고채권 23-5', bondType: '국채', currency: 'KRW' },
    terms: { maturityDate: '2030-06-10', couponRate: 3.25 },
    holding: { owner: '신랑', account: '일반계좌' }, source: 'manual'
  }, over || {}))})`;
  ev(`state.assets = [makeAsset(${JSON.stringify(asset({ isDomestic: '국내' }))})]; state.bondPositions = [${pos()}];`);
  const plain = ev('resolveBondClass(state.bondPositions[0])');
  ev(`state.bondPositions = [${pos({ identity: { isin: ISIN, instrumentName: '국고채권 23-5', bondType: '국채', currency: 'KRW', hedgeStatus: 'HEDGED' } })}];`);
  assert.equal(ev('resolveBondClass(state.bondPositions[0])'), plain, '원화 채권은 환헤지 값과 무관하게 같은 분류다');
  assert.equal(plain, 'KR_GOV');
});
