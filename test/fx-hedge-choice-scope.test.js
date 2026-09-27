/* [PM 지시 2026-09-26 · ISSUE-B + 미결 2번] 환노출 판정과 환헤지 선택 제공 범위 - 순수 로직 고정.
 *
 * 이 파일이 지키는 것은 "두 축을 분리했다"는 사실 하나다.
 *   ① 환노출이 있는가            - fxExposureStateOf (①통화 ②원장 ③종목마스터 ③-2자산성격 ④사용자)
 *   ② 고를 수 있는 환헤지형이 있는가 - fxHedgeChoiceStateOf (표시 통화가 원화인가 · 채권 · 현금 예외)
 *
 * 왜 두 축인가: 1차 전수 테스트에서 서로 반대 방향의 문제가 동시에 나왔다.
 *   · ISSUE-B  - 국내상장 해외ETF가 원장 미등재이고 사용자가 '국내'로 저장하면 환노출이 없다고
 *                판정돼 선택 UI가 사라졌다. 그런데 같은 종목의 자산 성격 · Return Key는 이름 근거로
 *                이미 미국 주식이었다(한 종목에 서로 다른 두 판정 근거).
 *   · 미결 2번 - SCHD · AAPL 등 해외 거래소 직접 상장에는 환헤지형 상품이 없는데도 물었고,
 *                잘못 고르면 MC 자산군이 US_EQUITY_HEDGED로 바뀌어 σ가 실제로 달라졌다.
 *
 * 실제 js/01~10 · 28 · 29를 vm 샌드박스에 실어 돌린다(판정 규칙을 가짜로 만들지 않는다).
 * 공식 종목 마스터(data/ticker-master.json)도 브라우저와 같은 경로로 주입한다 -
 * 133690이 "원장에 없고 마스터는 EF까지만 말해 준다"는 실제 상태를 그대로 재현해야 한다.
 * 실행: node --test test/fx-hedge-choice-scope.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SB = loadAdapterSandbox();
SB.applyTickerMasterData(JSON.parse(read('data/ticker-master.json')));
const ev = (code) => SB.evalInSandbox(code);
const stateOf = (a) => ev(`fxExposureStateOf(${JSON.stringify(a)})`);
const offers = (a) => ev(`shouldOfferFxHedgeChoice(${JSON.stringify(a)})`);
const reasonOf = (a) => ev(`fxHedgeChoiceStateOf(${JSON.stringify(a)}).reason`);
const noticeOf = (a) => ev(`fxExposureNoticeFor(${JSON.stringify(a)})`);

const etf = (ticker, name, ccy, region) => ({ ticker, name, category: 'ETF', categorySource: 'user', currency: ccy, isDomestic: region });
const stock = (ticker, name, ccy, region) => ({ ticker, name, category: '주식', categorySource: 'user', currency: ccy, isDomestic: region });

/* ══════════════ 전제 - 원장 · 마스터의 실제 상태 ══════════════ */

test('전제. 133690은 원장에 없고, 공식 종목 마스터는 "KOSPI 상장 ETF(EF)"까지만 말해 준다', () => {
  // 이 전제가 깨지면 아래 ISSUE-B 테스트의 의미가 달라진다(원장에 등재되면 ②에서 끝난다).
  assert.strictEqual(ev("!!(lookupExposureRecord({ ticker: '133690.KS' }) || {}).entry"), false, '원장 미등재');
  const f = JSON.parse(ev("JSON.stringify(resolveInstrumentFacts('133690.KS'))"));
  assert.strictEqual(f.found, true);
  assert.strictEqual(f.market, 'KR');
  assert.strictEqual(f.securityGroup, 'EF');
  assert.strictEqual(f.currency, 'KRW');
  // 마스터에는 "기초자산이 어느 시장인가"가 없다 - 그래서 runtime 판정이 미확정을 돌려준다.
  assert.strictEqual(ev("resolveRuntimeMarketExposure({ ticker: '133690.KS', category: 'ETF' }).exposure"), null);
  assert.strictEqual(ev("resolveRuntimeMarketExposure({ ticker: '133690.KS', category: 'ETF' }).reason"), 'etfNeedsOfficialIndex');
  // 반대로 360750은 원장에 있다(이 종목은 이번 변경의 영향을 받지 않아야 한다).
  assert.strictEqual(ev("!!(lookupExposureRecord({ ticker: '360750.KS' }) || {}).entry"), true, '360750은 원장 등재');
});

/* ══════════════ ISSUE-B · 환노출 판정 ══════════════ */

test('ISSUE-B. 국내상장 해외ETF는 사용자가 "국내"로 저장해도 환노출이 있다', () => {
  const foreign = etf('133690', 'TIGER 미국나스닥100', 'KRW', '해외');
  const domestic = etf('133690', 'TIGER 미국나스닥100', 'KRW', '국내');
  // 사용자 입력이 무엇이든 판정이 같아야 한다 - 같은 종목에 두 결론이 나오면 안 된다.
  assert.strictEqual(stateOf(foreign), 'EXPOSED');
  assert.strictEqual(stateOf(domestic), 'EXPOSED', '사용자 입력으로 뒤집히지 않는다');
  assert.strictEqual(offers(domestic), true, '환헤지 선택이 사라지지 않는다');
  // 근거는 자산 성격 판정이다 - 새 키워드를 만든 것이 아니라 이미 MC가 쓰는 판정을 읽는다.
  assert.strictEqual(ev(`resolveAssetCharacter(${JSON.stringify(domestic)}).character`), 'US_EQUITY');
  assert.strictEqual(ev(`resolveAssetCharacter(${JSON.stringify(domestic)}).source`), 'indexNameKeyword');
});

test('ISSUE-B. 자산 성격과 환노출 판정이 같은 결론에 도달한다(근거 불일치 해소)', () => {
  const cases = [
    ['133690 미국나스닥100', etf('133690', 'TIGER 미국나스닥100', 'KRW', '국내'), 'US_EQUITY', 'EXPOSED'],
    ['360750 미국S&P500(원장)', etf('360750', 'TIGER 미국S&P500', 'KRW', '국내'), 'US_EQUITY', 'EXPOSED'],
    ['069500 KODEX 200', etf('069500', 'KODEX 200', 'KRW', '국내'), 'KR_EQUITY', 'NONE'],
    ['005930 삼성전자', stock('005930', '삼성전자', 'KRW', '국내'), 'KR_EQUITY', 'NONE']
  ];
  cases.forEach(([label, a, wantChar, wantFx]) => {
    assert.strictEqual(ev(`resolveAssetCharacter(${JSON.stringify(a)}).character`), wantChar, label + ' 성격');
    assert.strictEqual(stateOf(a), wantFx, label + ' 환노출');
  });
});

test('ISSUE-B. 성격이 확인되지 않으면 아무 말도 하지 않는다(추정 금지 유지)', () => {
  // 이름 · 티커 어디에도 근거가 없는 원화 ETF - 성격 UNRESOLVED이므로 ③-2가 개입하지 않고
  // 기존 ④ 사용자 입력이 그대로 판정한다(이 부분은 변경 전과 완전히 같다).
  const unknownKr = etf('', 'ZZ 알 수 없는 상품', 'KRW', '국내');
  assert.strictEqual(ev(`resolveAssetCharacter(${JSON.stringify(unknownKr)}).character`), 'UNRESOLVED');
  assert.strictEqual(stateOf(unknownKr), 'NONE');
  const unknownForeign = Object.assign({}, unknownKr, { isDomestic: '해외' });
  assert.strictEqual(stateOf(unknownForeign), 'EXPOSED');
  // 국내 혼합형(237370)도 성격이 UNRESOLVED라 사용자 입력을 그대로 따른다.
  assert.strictEqual(stateOf(etf('237370', 'KODEX 배당성장채권혼합', 'KRW', '국내')), 'NONE');
});

test('ISSUE-B. 이름에 "미국"이 있다는 이유만으로는 환노출로 판정하지 않는다', () => {
  // NAME_KEYWORD_RATE_MAP · 지수 브랜드에 걸리지 않는 이름은 성격이 확정되지 않으므로 ③-2가 개입하지 않는다.
  // (개별 주식은 상장 지역이 곧 성격이라 ④와 결론이 같다 - 새로 뒤집히는 자산이 없다.)
  const a = stock('', 'ZZ 미국처럼 보이는 원화자산', 'KRW', '국내');
  assert.strictEqual(stateOf(a), 'NONE');
});

/* ══════════════ 미결 2번 · 환헤지 선택 제공 범위 ══════════════ */

test('미결2. 해외 거래소 직접 상장에는 환헤지를 묻지 않는다 - 환노출은 그대로 표시한다', () => {
  const direct = [
    ['SCHD', etf('SCHD', 'Schwab US Dividend Equity ETF', 'USD', '해외')],
    ['QQQM', etf('QQQM', 'Invesco NASDAQ 100 ETF', 'USD', '해외')],
    ['SPY', etf('SPY', 'SPDR S&P 500 ETF Trust', 'USD', '해외')],
    ['VOO', etf('VOO', 'Vanguard S&P 500 ETF', 'USD', '해외')],
    ['IVV', etf('IVV', 'iShares Core S&P 500 ETF', 'USD', '해외')],
    ['VTI', etf('VTI', 'Vanguard Total Stock Market ETF', 'USD', '해외')],
    ['AAPL', stock('AAPL', 'Apple Inc', 'USD', '해외')],
    ['NVDA', stock('NVDA', 'NVIDIA Corp', 'USD', '해외')]
  ];
  direct.forEach(([label, a]) => {
    assert.strictEqual(stateOf(a), 'EXPOSED', label + ' 환노출은 있다');
    assert.strictEqual(offers(a), false, label + ' 그러나 묻지 않는다');
    assert.strictEqual(reasonOf(a), 'FOREIGN_DIRECT_LISTING', label + ' 사유');
    // 숨기고 끝내지 않는다 - 그 자리에 환노출 사실을 알린다("묻지 않는다"는 "없다"가 아니다).
    assert.match(noticeOf(a), /환노출/, label + ' 안내 문구');
  });
});

test('미결2. 원화 표시(국내 상장) 해외 ETF에는 계속 묻는다 - 실제로 환헤지형이 상장돼 있다', () => {
  [['360750', 'TIGER 미국S&P500'], ['133690', 'TIGER 미국나스닥100'], ['368590', 'RISE 미국나스닥100'],
    ['472170', 'TIGER 미국테크TOP10채권혼합']].forEach(([tk, name]) => {
    const a = etf(tk, name, 'KRW', '해외');
    assert.strictEqual(offers(a), true, name);
    assert.strictEqual(reasonOf(a), 'KR_LISTED_FX_EXPOSED', name);
    assert.strictEqual(noticeOf(a), '', name + ' - 칸을 보여 주므로 대신 표시할 문구가 없다');
  });
});

test('미결2. 채권 · 현금은 범위에서 빠진다(D-2 · §55-3 기존 정책 유지)', () => {
  const krwBond = { ticker: 'KR1035021DC0', name: 'ZZ국고채', category: '채권', currency: 'KRW', isDomestic: '국내' };
  const usdBond = { ticker: '', name: 'ZZ미국채', category: '채권', currency: 'USD', isDomestic: '해외' };
  const krwCash = { ticker: '', name: 'ZZ예수금', category: '현금', currency: 'KRW', isDomestic: '국내' };
  const usdCash = { ticker: '', name: 'ZZ달러예수금', category: '현금', currency: 'USD', isDomestic: '해외' };
  assert.strictEqual(offers(krwBond), false, '원화 채권 - 환노출 자체가 없다');
  assert.strictEqual(offers(usdBond), true, '외화 채권 - 환헤지는 분류의 근거다(D-2)');
  assert.strictEqual(reasonOf(usdBond), 'BOND_DOMAIN');
  assert.strictEqual(offers(krwCash), false);
  assert.strictEqual(offers(usdCash), true, '외화 현금 - 기존 정책 그대로');
  assert.strictEqual(reasonOf(usdCash), 'FX_CASH');
});

test('미결2. 자산군이 정해지지 않은 입력은 숨기지 않는다(모른다고 없다고 하지 않는다)', () => {
  // 거래 폼의 자산군 「자동」 - 외화 채권일 수도 있으므로 숨기면 입력 경로가 사라진다.
  const auto = { ticker: '', name: 'ZZ 새 상품', category: '', currency: 'USD' };
  assert.strictEqual(offers(auto), true);
  assert.strictEqual(reasonOf(auto), 'CATEGORY_UNDECIDED');
});

/* ══════════════ 기존 저장값 · 데이터 보존 ══════════════ */

test('보존. 해외 직접 상장에 이미 저장된 환헤지 값이 있으면 칸을 그대로 보여 준다', () => {
  /* 숨기기만 하면, 이 규칙이 생기기 전에 잘못 저장된 HEDGED가 MC 자산군에 계속 적용되는데
   * 사용자가 그것을 되돌릴 화면이 사라진다. 앱이 데이터를 자동으로 고치지 않는 대신
   * 사용자가 직접 지울 수 있게 한다(데이터 migration 금지 원칙 유지). */
  const base = etf('SCHD', 'Schwab US Dividend Equity ETF', 'USD', '해외');
  assert.strictEqual(offers(base), false, '저장값이 없으면 묻지 않는다');
  ['HEDGED', 'UNHEDGED'].forEach((h) => {
    const stored = Object.assign({}, base, { fxHedgeStatus: h });
    assert.strictEqual(offers(stored), true, h + ' 저장값이 있으면 칸을 유지한다');
    assert.strictEqual(reasonOf(stored), 'FOREIGN_DIRECT_LISTING_STORED');
    assert.match(noticeOf(stored), /환노출/);
  });
  // 저장된 HEDGED는 여전히 MC 자산군에 적용된다 - 앱이 조용히 무효화하지 않는다.
  const hedged = Object.assign({}, base, { fxHedgeStatus: 'HEDGED' });
  assert.strictEqual(ev(`applyUserHedgeToAppClass('US_EQUITY', ${JSON.stringify(hedged)})`), 'US_EQUITY_HEDGED');
});

test('보존. 칸을 숨기는 코드가 저장된 값을 지우지 않는다', () => {
  assert.ok(!/delete\s+\w+\.fxHedgeStatus/.test(read('js/07-table-render-modals.js')));
  assert.ok(!/delete\s+\w+\.fxHedgeStatus/.test(read('js/08-detail-modal-fx.js')));
  assert.ok(!/delete\s+\w+\.fxHedgeStatus/.test(read('js/06-transactions.js')));
});

/* ══════════════ 판정 위치 · 계산 불변 ══════════════ */

test('구조. 판정은 js/01 한 곳뿐이다 - 화면은 문구만 옮긴다', () => {
  const ui = ['js/06-transactions.js', 'js/07-table-render-modals.js', 'js/08-detail-modal-fx.js'].map(read).join('\n');
  // 화면 파일에 통화 · 카테고리로 직접 가르는 제2의 판정이 생기지 않아야 한다.
  assert.ok(!/FOREIGN_DIRECT_LISTING/.test(ui), '사유 코드는 화면에서 다시 해석하지 않는다');
  assert.ok(/shouldOfferFxHedgeChoice/.test(ui) && /fxExposureNoticeFor/.test(ui));
  const core = read('js/01-core-state.js');
  assert.ok(/function fxHedgeChoiceStateOf/.test(core));
  assert.ok(/function fxExposureNoticeFor/.test(core));
});

test('계산 불변. 환헤지를 고르지 않은 자산의 Risk · MC 판정은 변하지 않는다', () => {
  /* 이 변경은 표시 조건만 건드린다 - fxExposureStateOf는 계산 경로에서 호출되지 않는다.
   * 그 사실을 소스로 고정한다(호출처가 늘어나면 이 테스트가 먼저 깨진다). */
  const callers = ['js/02-dashboard-kpi.js', 'js/04-rebalancing.js', 'js/05-future-projection.js',
    'js/09-price-fx-risk-engine.js', 'js/15-monte-carlo-engine.js', 'js/16-monte-carlo-adapter.js',
    'js/20-inflation-transform.js', 'js/21-safety-layer.js', 'js/26-cma-data.js', 'js/27-cma-runtime.js',
    'js/29-bond-domain.js'];
  callers.forEach((f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/fxExposureStateOf\s*\(/.test(src), f + ' 은 표시 판정을 계산에 쓰지 않는다');
    assert.ok(!/shouldOfferFxHedgeChoice\s*\(/.test(src), f + ' 은 표시 판정을 계산에 쓰지 않는다');
  });
});
