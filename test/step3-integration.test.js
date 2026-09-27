/* [PM STEP 3] 전체 통합검증에서 실제로 발견한 문제 3건을 고정한다.
 *
 *   BUG-1  Risk가 같은 티커를 합칠 때 **먼저 만난 보유분**으로 기준 지수를 정했다(배열 순서 의존).
 *   BUG-2  Return Key 추천이 같은 티커의 **먼저 만난** 사용자 지정을 그대로 추천했다(순서 의존).
 *   BUG-3  사용자가 확정한 `fxHedgeStatus` · `marketBetaIndexOverride`가 **저장되지 않아**
 *          새로고침 한 번에 사라졌다 - 그런데 두 값은 MC σ와 Risk 기준지수를 실제로 바꾼다.
 *
 * 셋 다 "에러 없이 잘못된 결과를 만드는" 종류라 테스트로 고정한다.
 * 실행: node --test test/step3-integration.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const SB = loadAdapterSandbox();
const ev = (code) => SB.evalInSandbox(code);

/* ══ BUG-3 — 사용자 확정값이 저장된다 ═══════════════════════════════════ */

/* 샌드박스의 localStorage는 동작하지 않는 껍데기라(실측), 저장 내용을 잡아 두는 최소 stub을 끼운다.
 * 앱 코드는 그대로 두고 저장소만 바꿔 끼우는 방식이라 실제 저장 경로(persistAssets)를 그대로 검증한다. */
const withCapturedStorage = (code) => SB.evalInSandbox(`(() => {
  const store = {};
  const real = localStorage;
  localStorage.setItem = (k, v) => { store[k] = String(v); };
  localStorage.getItem = (k) => (k in store ? store[k] : null);
  try { ${code} } finally { localStorage.setItem = real.setItem; localStorage.getItem = real.getItem; }
  return JSON.stringify(store);
})()`);

test('BUG-3. 사용자가 확정한 환헤지 · 시장민감도 기준지수가 실제로 저장된다', () => {
  const store = JSON.parse(withCapturedStorage(`
    state.assets = [makeAsset({ id: 'zz-p', ticker: '360750.KS', name: 'ZZ ETF', category: 'ETF',
      owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내',
      quantity: 10, buyPrice: 1000, currentPrice: 1200 })];
    state.assets[0].fxHedgeStatus = 'HEDGED';
    state.assets[0].marketBetaIndexOverride = 'KOSPI';
    persistAssets(true);`));
  const saved = JSON.parse(store[SB.evalInSandbox('LS_ASSETS')]);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].fxHedgeStatus, 'HEDGED', '새로고침해도 남아야 한다(MC σ를 바꾸는 값이다)');
  assert.strictEqual(saved[0].marketBetaIndexOverride, 'KOSPI', 'Risk 기준지수를 바꾸는 값이다');
});

test('BUG-3. 저장본을 다시 읽어도 같은 의미가 유지된다', () => {
  const store = JSON.parse(withCapturedStorage(`
    state.assets = [makeAsset({ id: 'zz-q', ticker: 'SCHD', name: 'ZZ 배당', category: 'ETF',
      owner: '와이프', accountType: '연금저축', currency: 'USD', isDomestic: '해외',
      quantity: 5, buyPrice: 100, currentPrice: 110 })];
    state.assets[0].fxHedgeStatus = 'UNHEDGED';
    persistAssets(true);`));
  const saved = JSON.parse(store[SB.evalInSandbox('LS_ASSETS')]);
  assert.strictEqual(saved[0].fxHedgeStatus, 'UNHEDGED');
  // 저장본을 그대로 makeAsset에 태워도 값이 살아남는다(재부팅 경로와 같은 모양).
  const revived = SB.evalInSandbox(`JSON.stringify(makeAsset(${JSON.stringify(saved[0])}).fxHedgeStatus)`);
  assert.strictEqual(JSON.parse(revived), 'UNHEDGED');
});

test('BUG-3. 사용자 확정값이 persistAssets 저장 목록에 빠져 있지 않다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/01-core-state.js'), 'utf8');
  const body = src.match(/function persistAssets\(skipPush\)[\s\S]*?setLocalStorageItemSafely\(LS_ASSETS/)[0];
  // 화면 · 엑셀 · 백업 · 동기화가 모두 다루는 "사용자가 직접 확정한 값"은 전부 저장돼야 한다.
  ['fxHedgeStatus', 'marketBetaIndexOverride', 'rateMatchOverride', 'categorySource', 'positionSource', 'role']
    .forEach((f) => assert.ok(new RegExp(`\\b${f}:`).test(body), `${f}가 저장 목록에 없다`));
});

/* ══ BUG-1 — Risk 티커 병합의 순서 의존성 ═══════════════════════════════ */

test('BUG-1. 같은 티커 보유분들이 다른 기준지수를 가리키면 고르지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/09-price-fx-risk-engine.js'), 'utf8');
  assert.ok(/resolveAcrossHoldings/.test(src), '보유분 전체를 보고 판정하는 경로가 있어야 한다');
  assert.ok(/holdingConflict/.test(src), '갈리면 고르지 않고 사유를 남겨야 한다');
  // 먼저 만난 보유분으로 기준 지수를 정하던 옛 구조가 되살아나면 실패한다.
  assert.ok(!/if \(!byTicker\.has\(yahoo\)\) \{[\s\S]{0,400}?const bm = resolveMarketRiskBenchmark\(a\);/.test(src),
    'first-seen 판정이 되살아났다');
});

test('BUG-1. 보유분 판정이 모두 같으면 그 답을 쓴다(정상 데이터는 예전과 같다)', () => {
  // 순수 함수로 같은 규칙을 재현해 고정한다(엔진은 네트워크가 필요해 E2E가 실제 경로를 본다).
  const pick = (results) => {
    const confirmed = results.filter((r) => r && r.key);
    if (!confirmed.length) return { key: null, status: 'UNRESOLVED' };
    const sig = (r) => [r.key, r.status, r.alignment || ''].join('|');
    return [...new Set(confirmed.map(sig))].length > 1
      ? { key: null, status: 'UNRESOLVED', source: 'holdingConflict' }
      : confirmed[0];
  };
  const same = [{ key: 'SP500', status: 'RESOLVED' }, { key: 'SP500', status: 'RESOLVED' }];
  assert.strictEqual(pick(same).key, 'SP500');
  assert.strictEqual(pick(same.slice().reverse()).key, 'SP500', '순서와 무관하다');
  const diff = [{ key: 'SP500', status: 'RESOLVED' }, { key: 'KOSPI', status: 'RESOLVED' }];
  assert.strictEqual(pick(diff).key, null);
  assert.strictEqual(pick(diff).source, 'holdingConflict');
  assert.strictEqual(JSON.stringify(pick(diff)), JSON.stringify(pick(diff.slice().reverse())));
});

/* ══ BUG-2 — Return Key 추천의 순서 의존성 ══════════════════════════════ */

test('BUG-2. 같은 종목에 서로 다른 사용자 지정이 있으면 추천하지 않는다', () => {
  const mk = (id, owner, key) => `{ id: '${id}', ticker: '005930.KS', name: 'ZZ 국내주', category: '주식',
    owner: '${owner}', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내',
    quantity: 1, buyPrice: 1, currentPrice: 1, rateMatchOverride: ${key ? `'${key}'` : 'undefined'} }`;

  // ① 두 보유분이 같은 기준을 쓰면 그 기준을 추천한다(순서와 무관).
  ev(`state.assets = [makeAsset(${mk('a1', '신랑', 'KOSPI')}), makeAsset(${mk('a2', '와이프', 'KOSPI')})];
      state.assets[0].rateMatchOverride = 'KOSPI'; state.assets[1].rateMatchOverride = 'KOSPI';`);
  const agreed = JSON.parse(ev(`JSON.stringify((recommendReturnAssumptionKey({ ticker: '005930.KS', name: 'ZZ 국내주', currency: 'KRW' }) || {}).evidence || [])`));
  assert.ok(agreed.includes('동일 종목 기존 설정'), '같은 기준이면 그대로 추천한다');

  // ② 갈리면 그 근거로 추천하지 않는다(먼저/나중 우선순위 금지 · PMD-02).
  ev(`state.assets[1].rateMatchOverride = 'SP500';`);
  const conflicted = JSON.parse(ev(`JSON.stringify((recommendReturnAssumptionKey({ ticker: '005930.KS', name: 'ZZ 국내주', currency: 'KRW' }) || {}).evidence || [])`));
  assert.ok(!conflicted.includes('동일 종목 기존 설정'), '갈리면 임의로 하나를 고르지 않는다');

  // ③ 순서를 뒤집어도 같은 답이다.
  ev(`state.assets = state.assets.slice().reverse();`);
  const reversed = JSON.parse(ev(`JSON.stringify((recommendReturnAssumptionKey({ ticker: '005930.KS', name: 'ZZ 국내주', currency: 'KRW' }) || {}).evidence || [])`));
  assert.strictEqual(JSON.stringify(conflicted), JSON.stringify(reversed));
});

/* ══ Risk ↔ MC 교차 일관성 ═════════════════════════════════════════════ */

test('교차. 같은 상품을 Risk와 MC가 같은 환헤지 사실로 해석한다', () => {
  SB.applyTickerMasterData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ticker-master.json'), 'utf8')));
  const cases = [
    { ticker: '360750.KS', fxHedgeStatus: undefined, want: 'UNHEDGED' },   // 원장 A등급
    // [PM 최종 지시] 원장(UNHEDGED)과 사용자 확정(HEDGED)이 다르면 어느 쪽도 쓰지 않는다.
    { ticker: '360750.KS', fxHedgeStatus: 'HEDGED', want: null },
    { ticker: '133690.KS', fxHedgeStatus: undefined, want: null }          // 원장 없음 → 단정 않음
  ];
  cases.forEach((c) => {
    const a = { id: 'x', ticker: c.ticker, name: 'ZZ', category: 'ETF', currency: 'KRW', isDomestic: '국내', fxHedgeStatus: c.fxHedgeStatus };
    // MC가 쓰는 해석
    const mc = SB.resolveInstrumentFxHedge(a);
    // Risk가 쓰는 해석(사용자 확정 → 원장) - js/09 userConfirmedRiskEntry · finalizeRiskBenchmark와 같은 근거
    const rec = SB.isExposureMasterActive() ? SB.lookupExposureRecord(a) : null;
    const master = (rec && rec.entry && ['HEDGED', 'UNHEDGED'].includes(rec.entry.hedgeStatus)) ? rec.entry.hedgeStatus : null;
    const own = SB.sanitizeFxHedgeStatus(a.fxHedgeStatus) || null;
    // Risk도 같은 규칙을 쓴다 - 둘이 어긋나면 확정하지 않는다(js/09 userConfirmedRiskEntry).
    const risk = (own && master && own !== master) ? null : (own || master);
    assert.strictEqual(mc.status, c.want, `${c.ticker} MC`);
    assert.strictEqual(risk, c.want, `${c.ticker} Risk`);
    assert.strictEqual(mc.status, risk, `${c.ticker} - Risk와 MC가 같은 답을 내야 한다`);
  });
});
