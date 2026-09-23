// [PM 수정 지시 2026-09-23] 장기 수익률 기준 · 환헤지 입력 UX 정합성 회귀 고정
//
// 무엇을 고정하는가:
//   A-1 같은 값을 화면마다 다르게 부르지 않는다("장기 수익률 기준").
//   A-2 자동 추천 근거가 없을 때의 안내가 실제 동작과 같다(비워두면 0%).
//   B   환헤지 선택 UI는 **환노출이 있는 상품에만** 나타난다.
//   C   거래 추가에서 고른 환헤지가 자산으로 이어진다.
//   보존 UI가 숨겨져도 이미 저장된 값은 지우지 않는다.
//
// 실제 보유 수량 · 금액은 쓰지 않는다(티커 · 공개 종목코드만).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 공식 종목 마스터의 실제 레코드를 쓴다(v267 사실 계층이 동작해야 국내 · 미국이 갈린다).
const MASTER_TICKERS = ['042700.KS', '069500.KS', '360750.KS', '472170.KS', 'QQQM', '278530.KS'];
function sandbox() {
  const sb = loadAdapterSandbox();
  const master = JSON.parse(read('data/ticker-master.json'));
  const pick = {};
  MASTER_TICKERS.forEach((tk) => {
    const r = master.items.find((x) => x.yahooTicker === tk);
    if (r) pick[tk] = r;
  });
  sb.evalInSandbox(`tickerMasterByTicker = ${JSON.stringify(pick)};`);
  return sb;
}
const stateOf = (sb, a) => sb.evalInSandbox(`fxExposureStateOf(${JSON.stringify(a)})`);
const offers = (sb, a) => sb.evalInSandbox(`shouldOfferFxHedgeChoice(${JSON.stringify(a)})`);

/* ══ B. 환노출 판정 ══════════════════════════════════════════════════ */

test('B. 환노출 판정 - 원화 국내 자산은 NONE, 외화 · 해외 노출은 EXPOSED', () => {
  const sb = sandbox();
  const cases = [
    // [Fixture 1] 국내주식 - 원장에 없어도(한미반도체) 있어도(삼성전자) 환노출이 없다.
    [{ ticker: '042700.KS', name: '한미반도체', category: '주식', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    [{ ticker: '005930.KS', name: '삼성전자', category: '주식', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    // [Fixture 2] 국내 ETF는 NONE, 한국 상장 해외 ETF는 EXPOSED - "국내 ETF라서"가 아니라 원장 유형으로 가른다.
    [{ ticker: '069500.KS', name: 'KODEX 200', category: 'ETF', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    [{ ticker: '278530.KS', name: 'KODEX 200TR', category: 'ETF', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    [{ ticker: '360750.KS', name: 'TIGER 미국S&P500', category: 'ETF', currency: 'KRW', isDomestic: '해외' }, 'EXPOSED'],
    // 혼합형(472170)은 fxExposure 필드가 비어 있지만 원장 유형이 해외 ETF다.
    [{ ticker: '472170.KS', name: 'TIGER 미국테크TOP10채권혼합', category: 'ETF', currency: 'KRW', isDomestic: '해외' }, 'EXPOSED'],
    // [Fixture 3] 외화 표시는 그 자체로 환노출이다.
    [{ ticker: 'QQQM', name: 'QQQM', category: 'ETF', currency: 'USD', isDomestic: '해외' }, 'EXPOSED'],
    [{ ticker: 'AAPL', name: 'Apple', category: '주식', currency: 'USD', isDomestic: '해외' }, 'EXPOSED'],
    // [Fixture 4] 채권 · 현금 - 채권 폼의 기존 규칙(원화면 불가)과 같은 결론이 나온다.
    [{ ticker: '', name: 'ZZ국고채', category: '채권', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    [{ ticker: '', name: 'ZZ미국채', category: '채권', currency: 'USD', isDomestic: '해외' }, 'EXPOSED'],
    [{ ticker: '', name: 'ZZ예수금', category: '현금', currency: 'KRW', isDomestic: '국내' }, 'NONE'],
    [{ ticker: '', name: 'ZZ달러예수금', category: '현금', currency: 'USD', isDomestic: '해외' }, 'EXPOSED']
  ];
  cases.forEach(([a, want]) => assert.strictEqual(stateOf(sb, a), want, a.name));
  // 표시 여부는 "NONE이 아니면 보여 준다"이다.
  cases.forEach(([a, want]) => assert.strictEqual(offers(sb, a), want !== 'NONE', a.name));
});

test('B-2. 확인되지 않은 상품은 숨기지 않는다(모른다고 "없다"로 단정하지 않는다)', () => {
  const sb = sandbox();
  // 거래 폼에는 국내/해외 칸이 없다(거래 스키마에 isDomestic이 없다) - 원장에도 마스터에도 없는
  // 새 종목은 UNKNOWN이며, 이때 숨기면 사용자가 알려 줄 방법 자체가 사라진다.
  const unknown = { ticker: 'ZZNEW.KS', name: 'ZZ 신규 ETF', category: 'ETF', currency: 'KRW' };
  assert.strictEqual(stateOf(sb, unknown), 'UNKNOWN');
  assert.strictEqual(offers(sb, unknown), true);
});

test('B-3. 판정은 승인된 사실만 본다 - 티커 문자열로 추정하지 않는다', () => {
  const sb = sandbox();
  // 이름에 "미국"이 들어 있어도, 원화 · 국내로 등록된 자산은 환노출로 보지 않는다.
  assert.strictEqual(stateOf(sb, { ticker: '', name: 'ZZ 미국처럼 보이는 원화자산', category: '주식', currency: 'KRW', isDomestic: '국내' }), 'NONE');
  // 반대로 이름이 한글이어도 통화가 달러면 환노출이다.
  assert.strictEqual(stateOf(sb, { ticker: '', name: 'ZZ 이름만 한글', category: '주식', currency: 'USD', isDomestic: '해외' }), 'EXPOSED');
});

/* ══ 계산 불변 ═══════════════════════════════════════════════════════ */

test('Fixture 1. 국내주식은 환헤지를 무엇으로 두든 계산이 달라지지 않는다', () => {
  const sb = sandbox();
  sb.evalInSandbox(`
    state.assets = [makeAsset({ name: '한미반도체', ticker: '042700.KS', category: '주식', owner: '신랑',
      accountType: '일반계좌', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 1, currentPrice: 1 })];
  `);
  const snap = () => sb.evalInSandbox(`JSON.stringify((function(){
    var a = state.assets[0], rk = resolveAssetGroupKeyDetail(a);
    return { mb: resolveMarketRiskBenchmark(a).key, tb: resolveRiskBenchmark(a).key, rk: rk.key,
      mc: resolveMcAppAssetClass({ key: rk.key, source: 'x', subject: a }).appClass };
  })())`);
  const base = snap();
  assert.deepStrictEqual(JSON.parse(base), { mb: 'KOSPI', tb: 'KOSPI', rk: 'UNRESOLVED', mc: 'KR_EQUITY' });
  ['UNHEDGED', 'HEDGED'].forEach((h) => {
    sb.evalInSandbox(`state.assets[0].fxHedgeStatus = ${JSON.stringify(h)};`);
    assert.strictEqual(snap(), base, h);
  });
});

test('Fixture 2. 한국 상장 미국 ETF는 환헤지가 MC 자산군에 그대로 연결된다(PM1 정책 유지)', () => {
  const sb = sandbox();
  sb.evalInSandbox(`
    state.assets = [makeAsset({ name: 'TIGER 미국S&P500', ticker: '360750.KS', category: 'ETF', owner: '신랑',
      accountType: '일반계좌', isDomestic: '해외', currency: 'KRW', quantity: 1, buyPrice: 1, currentPrice: 1,
      rateMatchOverride: 'S&P500' })];
  `);
  const cls = (h) => {
    sb.evalInSandbox(h ? `state.assets[0].fxHedgeStatus = ${JSON.stringify(h)};` : 'delete state.assets[0].fxHedgeStatus;');
    return JSON.parse(sb.evalInSandbox(`JSON.stringify(resolveMcAppAssetClass({ key: 'S&P500', source: 'override', subject: state.assets[0] }))`)).appClass;
  };
  assert.strictEqual(cls(null), 'US_EQUITY');
  assert.strictEqual(cls('UNHEDGED'), 'US_EQUITY');
  assert.strictEqual(cls('HEDGED'), 'US_EQUITY_HEDGED');
});

test('보존. UI를 숨겨도 이미 저장된 값은 지우지 않는다', () => {
  const sb = sandbox();
  sb.evalInSandbox(`
    state.assets = [makeAsset({ name: '한미반도체', ticker: '042700.KS', category: '주식', owner: '신랑',
      accountType: '일반계좌', isDomestic: '국내', currency: 'KRW', quantity: 1, buyPrice: 1, currentPrice: 1,
      fxHedgeStatus: 'HEDGED', marketBetaIndexOverride: 'KOSPI' })];
  `);
  assert.strictEqual(sb.evalInSandbox('fxExposureStateOf(state.assets[0])'), 'NONE'); // UI는 숨는다
  assert.strictEqual(sb.evalInSandbox('state.assets[0].fxHedgeStatus'), 'HEDGED');    // 값은 그대로다
  assert.strictEqual(sb.evalInSandbox('state.assets[0].marketBetaIndexOverride'), 'KOSPI');
  // 화면 코드 어디에도 "숨길 때 값을 지운다"가 없어야 한다.
  assert.ok(!/hidden[\s\S]{0,120}fxHedgeStatus\s*=\s*''/.test(read('js/07-table-render-modals.js')));
  assert.ok(!/delete\s+\w+\.fxHedgeStatus/.test(read('js/08-detail-modal-fx.js')));
});

/* ══ A. 명칭 · 안내 문구 ═════════════════════════════════════════════ */

test('A-1. 사용자에게 보이는 이름이 화면 간에 같다("장기 수익률 기준")', () => {
  // HTML 주석은 사용자에게 보이지 않는다 - "왜 바꿨는지"를 남긴 주석까지 금지하면 기록이 사라진다.
  const html = read('index.html');
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(visible.includes('장기 수익률 기준 (미래예측 · 장기 시뮬레이션에 쓰입니다)'), '거래 추가 폼 라벨');
  assert.ok(!visible.includes('대표 추종 수익률 종목'), '옛 명칭이 화면에 남아 있다');
  assert.ok(read('js/08-detail-modal-fx.js').includes('>장기 수익률 기준</h4>'), '자산 상세 제목');
  // 내부 필드명 · 엑셀 컬럼명은 호환성 때문에 그대로다.
  assert.ok(html.includes('id="tx_rateMatchOverride"'));
  assert.ok(read('js/12-import-export-sync.js').includes("'대표매칭(수익률연동키)'"));
});

test('A-2. 자동 추천이 없을 때의 안내가 실제 동작과 같다(비워두면 0%)', () => {
  const js06 = read('js/06-transactions.js');
  // 주석("예전 문구는 …였다")은 기록으로 남긴다 - 실제 화면에 나가는 문자열만 본다.
  const js06Code = js06.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!js06Code.includes('비워두면 계산할 때 시스템이 정하고'), '옛 문구가 남아 있다');
  assert.ok(!/시스템이 정한다|시스템이 정하고/.test(js06Code), '"시스템이 정한다" 표현이 화면 문구에 남아 있다');
  // 새 문구는 세 가지를 모두 말해야 한다.
  const m = js06.match(/text\.textContent = '([^']*장기 수익률 기준을 찾지 못했습니다[^']*)'/);
  assert.ok(m, '새 안내 문구를 찾지 못했다');
  assert.ok(m[1].includes('찾지 못했습니다'), '① 추천을 찾지 못했다');
  assert.ok(m[1].includes('0%'), '② 비워두면 0%로 계산된다');
  assert.ok(m[1].includes('직접 고를 수 있'), '③ 직접 고를 수 있다');

  // 그 문구가 말하는 대로 실제로 0%인지 확인한다(문구와 동작이 어긋나지 않게 함께 고정).
  const sb = sandbox();
  assert.strictEqual(sb.evalInSandbox(`JSON.stringify(recommendRateMatchKey({ ticker: '042700.KS', name: '한미반도체', currency: 'KRW' }))`), 'null');
  assert.strictEqual(JSON.parse(sb.evalInSandbox(`JSON.stringify(resolveAssetGroupKeyDetail({ ticker: '042700.KS', name: '한미반도체', category: '주식', isDomestic: '국내', currency: 'KRW' }))`)).key, 'UNRESOLVED');
  assert.strictEqual(sb.evalInSandbox(`getTargetProjectionRate({ type: 'ticker', ticker: '042700.KS', label: '한미반도체' }, 'normal', '국내', 'general')`), 0);
});

test('A-3. 자동 추천이 있으면 그 기준을 알려 주고, 사용자 확정값을 덮어쓰지 않는다', () => {
  const js06 = read('js/06-transactions.js');
  assert.ok(js06.includes('앱 추천: ${rec.label} 기준으로 계산합니다.'), '추천 안내');
  // 기존 사용자 지정이 있으면 그 값을 먼저 보여 주는 분기가 그대로 있어야 한다.
  assert.ok(js06.includes('existing && existing.rateMatchOverride'), '기존 확정값 우선 분기');
  // 우선순위(사용자 확정 → 자동 → UNRESOLVED)는 계산 쪽에서도 그대로다.
  const sb = sandbox();
  const d = JSON.parse(sb.evalInSandbox(`JSON.stringify(resolveAssetGroupKeyDetail({ ticker: '042700.KS', name: '한미반도체', category: '주식', isDomestic: '국내', currency: 'KRW', rateMatchOverride: 'KOSPI' }))`));
  assert.strictEqual(d.key, 'KOSPI');
  assert.strictEqual(d.source, 'override');
});

/* ══ C. 거래 추가 폼 배선 ════════════════════════════════════════════ */

test('C. 거래 추가 폼이 환헤지를 조건부로 보여 주고 자산으로 이어 준다', () => {
  const html = read('index.html');
  const js06 = read('js/06-transactions.js');
  assert.ok(html.includes('id="tx_fxHedgeWrap"') && html.includes('id="tx_fxHedgeStatus"'), '거래 폼 환헤지 칸');
  // 기본은 숨김이고, 판정 함수로만 열린다(카테고리 · 티커 유무로 열지 않는다).
  const wrapTag = html.match(/<label[^>]*id="tx_fxHedgeWrap"[^>]*>/);
  const wrapClasses = wrapTag ? ((wrapTag[0].match(/class="([^"]*)"/) || [])[1] || '').trim().split(/\s+/) : [];
  assert.ok(wrapClasses.includes('hidden'), '기본 숨김');
  assert.ok(js06.includes('shouldOfferFxHedgeChoice(probe)'), '판정 함수 사용');
  // 새 필드를 만들지 않고 기존 fxHedgeStatus로 저장한다. 규칙은 rateMatchOverride와 같다.
  assert.ok(js06.includes('matchedAsset.fxHedgeStatus = sanitizeFxHedgeStatus(hedgeRaw)'), '자산 반영');
  assert.ok(js06.includes('(hedgeRaw || isEditingExistingTx)'), '신규 거래의 빈칸은 기존 값을 지우지 않는다');
  assert.ok(js06.includes('matchedAsset.fxHedgeStatus !== beforeHedge'), '값이 바뀔 때만 updatedAt');
});

test('C-2. 채권 폼의 기존 환헤지 규칙은 그대로다(재설계하지 않았다)', () => {
  const js07 = read('js/07-table-render-modals.js');
  assert.ok(js07.includes("const foreign = (bondEl('f_currency') || {}).value !== 'KRW';"), '채권 통화 규칙');
  assert.ok(js07.includes('hedge.disabled = !foreign;'), '원화 채권은 선택 불가');
});
