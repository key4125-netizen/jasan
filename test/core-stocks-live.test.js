// [핵심종목 실시간 · PM 결정 2026-10-08] 상장시장 기준 국내/해외 분리 · 평가금액 상위 5개 ·
// stale 10분 · 지수 session 표시 · 미국 DST 경계 검증.
//
// 왜 vm 샌드박스인가: test/mc-adapter-sandbox.js와 같은 이유다. js/02의 핵심종목 함수들은 state와
// js/01의 전역 함수를 그대로 쓰는 브라우저 스크립트라, production 코드에 export를 덧붙이지 않고
// 원본을 index.html과 같은 순서로 vm에 싣는다(새 의존성 0개).
//
// 외부 데이터 독립성: 네트워크·실제 시세·오늘 날짜에 의존하지 않는다. 시각은 전부 주입한다.
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();

// 자산 1건. 티커가 상장시장을 결정한다(getMarketKeyForTicker - .KS/.KQ면 KR, 그 밖은 US).
const A = (o) => Object.assign({
  accountType: '일반계좌', owner: 'ZZ소유자', category: '주식', currency: 'KRW',
  quantity: 1, buyPrice: 1, currentPrice: 1, categorySource: 'user', createdAt: 1, updatedAt: 1
}, o);

// 평가금액은 calcRow(a).curAmount = quantity × currentPrice × (USD면 환율)이다. 비교만 하면 되므로
// 원화 자산은 currentPrice에 평가금액을 그대로 넣고 quantity=1로 둔다.
const KRW = (id, ticker, name, amount, extra) => A(Object.assign({ id, ticker, name, quantity: 1, currentPrice: amount }, extra));
const USD = (id, ticker, name, amountUsd, extra) => A(Object.assign({
  id, ticker, name, currency: 'USD', isDomestic: '해외', quantity: 1, currentPrice: amountUsd
}, extra));

function seed(assets) {
  SB.state.assets = assets;
  SB.state.dayChangeMap = {};
  SB.state.prevCloseMap = {};
  SB.state.sessionMap = {};
  SB.state.marketIndexCache = {};
}
const names = (list) => list.map((c) => c.name);

/* =============================================================================
 * 1. 상장시장 기준 후보군 분리 (P-1 · P-2 · §7 CASE 1~5)
 * ========================================================================== */

test('CASE 1. 국내 후보군 = 국내 상장 주식 + 국내 상장 ETF + 국내 상장 해외 ETF (평가금액 상위 5)', () => {
  seed([
    KRW('d1', '000660.KS', 'ZZ국내주식A', 600000000),
    KRW('d2', '005930.KS', 'ZZ국내주식B', 150000000),
    KRW('d3', '360750.KS', 'ZZ국내상장 해외ETF', 40000000, { category: 'ETF' }),   // 기초자산 미국 · KRX 상장
    KRW('d4', '278530.KS', 'ZZ국내ETF', 18000000, { category: 'ETF' }),
    KRW('d5', '140860.KQ', 'ZZ코스닥주식', 9000000),
    KRW('d6', '005380.KS', 'ZZ국내주식C', 1000000),
    USD('f1', 'ZZQQQ', 'ZZ미국ETF', 49000000, { category: 'ETF' })
  ]);
  const top = SB.getCoreStockCandidates('domestic');
  assert.strictEqual(top.length, 5);
  assert.deepStrictEqual(names(top), ['ZZ국내주식A', 'ZZ국내주식B', 'ZZ국내상장 해외ETF', 'ZZ국내ETF', 'ZZ코스닥주식']);
  assert.ok(!names(top).includes('ZZ미국ETF'), '해외 상장 종목은 국내 후보군에 들어오지 않는다');
  assert.ok(!names(top).includes('ZZ국내주식C'), '6위는 잘린다');
});

test('CASE 2. 해외 후보군 = 해외 상장 종목만 · 국내 상장 해외 ETF는 제외', () => {
  seed([
    USD('f1', 'ZZQQQ', 'ZZ미국ETF', 49000000, { category: 'ETF' }),
    USD('f2', 'ZZSCHD', 'ZZ미국ETF2', 28000000, { category: 'ETF' }),
    USD('f3', 'ZZGOOGL', 'ZZ미국주식', 9000000),
    KRW('d3', '360750.KS', 'ZZ국내상장 해외ETF', 40000000, { category: 'ETF' }),
    KRW('d1', '000660.KS', 'ZZ국내주식A', 600000000)
  ]);
  const top = SB.getCoreStockCandidates('foreign');
  assert.deepStrictEqual(names(top), ['ZZ미국ETF', 'ZZ미국ETF2', 'ZZ미국주식']);
  assert.ok(!names(top).includes('ZZ국내상장 해외ETF'), '국내 상장 해외 ETF는 해외 후보군에서 제외된다');
  assert.ok(!names(top).includes('ZZ국내주식A'));
});

test('CASE 3. 해외 상장 종목이 5개 미만이면 있는 만큼만 돌려준다(국내로 보충하지 않는다)', () => {
  seed([
    USD('f1', 'ZZQQQ', 'ZZ미국ETF', 49000000, { category: 'ETF' }),
    USD('f2', 'ZZSCHD', 'ZZ미국ETF2', 28000000, { category: 'ETF' }),
    KRW('d1', '000660.KS', 'ZZ국내주식A', 600000000),
    KRW('d3', '360750.KS', 'ZZ국내상장 해외ETF', 40000000, { category: 'ETF' })
  ]);
  const top = SB.getCoreStockCandidates('foreign');
  assert.strictEqual(top.length, 2, '2개뿐이면 2개만');
  assert.deepStrictEqual(names(top), ['ZZ미국ETF', 'ZZ미국ETF2']);
  // 해외 상장 종목이 아예 없으면 빈 배열이다(팝업이 기존 빈 안내문을 띄우는 경로).
  seed([KRW('d1', '000660.KS', 'ZZ국내주식A', 600000000)]);
  assert.deepStrictEqual(SB.getCoreStockCandidates('foreign'), []);
});

test('CASE 4. 국내 상장 해외 ETF가 해외 상장 종목보다 커도 국내 순위에만 들어간다', () => {
  seed([
    KRW('d3', '360750.KS', 'ZZ국내상장 해외ETF', 40000000, { category: 'ETF' }),
    USD('f3', 'ZZGOOGL', 'ZZ미국주식', 9000000)
  ]);
  assert.deepStrictEqual(names(SB.getCoreStockCandidates('domestic')), ['ZZ국내상장 해외ETF']);
  assert.deepStrictEqual(names(SB.getCoreStockCandidates('foreign')), ['ZZ미국주식']);
  // 예전 구현(통화 우선 2단계)은 이 ETF를 해외 5위로 넣어 998만원 종목 아래에 뒀다 - 그 회귀를 고정한다.
  assert.ok(!names(SB.getCoreStockCandidates('foreign')).includes('ZZ국내상장 해외ETF'));
});

test('CASE 5. 같은 종목이 국내/해외 후보군에 중복으로 나오지 않는다 · 같은 티커는 소유자끼리 합산된다', () => {
  seed([
    KRW('d1', '000660.KS', 'ZZ공동보유', 300000000, { owner: 'ZZ소유자' }),
    KRW('d2', '000660.KS', 'ZZ공동보유', 200000000, { owner: 'ZZ배우자' }),
    USD('f1', 'ZZQQQ', 'ZZ미국ETF', 10000000, { category: 'ETF' })
  ]);
  const dom = SB.getCoreStockCandidates('domestic');
  const frn = SB.getCoreStockCandidates('foreign');
  assert.strictEqual(dom.length, 1, '같은 티커는 한 줄로 합산된다');
  assert.strictEqual(dom[0].curAmount, 500000000, '300,000,000 + 200,000,000');
  const overlap = names(dom).filter((n) => names(frn).includes(n));
  assert.deepStrictEqual(overlap, [], '두 후보군이 겹치지 않는다');
});

test('후보 제외 규칙은 그대로다 - 티커 없음 · 주식/ETF 아님 · 수량 0', () => {
  seed([
    KRW('x1', '', 'ZZ현금', 900000000, { category: '현금' }),
    KRW('x2', '', 'ZZ국고채', 800000000, { category: '채권' }),
    KRW('x3', '000660.KS', 'ZZ전량매도', 700000000, { quantity: 0 }),
    KRW('d1', '005930.KS', 'ZZ국내주식B', 1000)
  ]);
  assert.deepStrictEqual(names(SB.getCoreStockCandidates('domestic')), ['ZZ국내주식B']);
});

test('상장시장 판정은 종목명이 아니라 티커로 한다 - 이름에 "미국"이 있어도 .KS면 국내', () => {
  seed([
    KRW('d3', '360750.KS', 'TIGER 미국S&P500', 40000000, { category: 'ETF' }),
    KRW('d4', '368590.KS', 'RISE 미국나스닥100', 30000000, { category: 'ETF' }),
    USD('f1', 'ZZSPYM', 'ZZ미국상장ETF', 20000000, { category: 'ETF' })
  ]);
  assert.deepStrictEqual(names(SB.getCoreStockCandidates('domestic')), ['TIGER 미국S&P500', 'RISE 미국나스닥100']);
  assert.deepStrictEqual(names(SB.getCoreStockCandidates('foreign')), ['ZZ미국상장ETF']);
  assert.strictEqual(SB.getMarketKeyForTicker('360750.KS'), 'KR');
  assert.strictEqual(SB.getMarketKeyForTicker('ZZSPYM'), 'US');
});

/* =============================================================================
 * 2. stale 10분 (P-5 · §8 CASE 1~6)
 * ========================================================================== */

const MIN = 60 * 1000;
// 보유 종목 경로의 취득시각은 refreshPricesAndRates() 완료 시각(lastRefreshAt, js/11)이다.
// js/11은 이 샌드박스에 싣지 않으므로(DOM 렌더 전용) 식별자만 선언해 주입한다.
const setRefreshedAgo = (ms) => SB.evalInSandbox(`var lastRefreshAt = ${Date.now() - ms};`);
const setIndexCache = (agoMs, over) => {
  SB.state.marketIndexCache['^KS11'] = Object.assign({
    price: 2500, changePercent: 1.2, session: 'closed', fetchedAt: Date.now() - agoMs
  }, over || {});
};

test('stale CASE 1·2. 4분 전 · 9분 전 데이터는 정상으로 취급한다', () => {
  seed([KRW('d1', '000660.KS', 'ZZ국내주식A', 100)]);
  const candidate = SB.getCoreStockCandidates('domestic')[0];
  [4, 9].forEach((m) => {
    setRefreshedAgo(m * MIN);
    assert.ok(SB.getCoreStockInfoFromState(candidate), `보유 종목 ${m}분 전 = 정상`);
    setIndexCache(m * MIN);
    assert.ok(SB.getMarketIndexInfoFromState('^KS11'), `지수 ${m}분 전 = 정상`);
  });
});

test('stale CASE 3. 10분을 넘긴 데이터는 stale로 보고 캐시를 쓰지 않는다', () => {
  seed([KRW('d1', '000660.KS', 'ZZ국내주식A', 100)]);
  const candidate = SB.getCoreStockCandidates('domestic')[0];
  setRefreshedAgo(10 * MIN + 1000);
  assert.strictEqual(SB.getCoreStockInfoFromState(candidate), null, '보유 종목 10분 초과 = stale');
  setIndexCache(10 * MIN + 1000);
  assert.strictEqual(SB.getMarketIndexInfoFromState('^KS11'), null, '지수 10분 초과 = stale');
  // 경계: 정확히 10분은 아직 초과가 아니다(> 비교).
  setRefreshedAgo(10 * MIN);
  assert.ok(SB.getCoreStockInfoFromState(candidate), '정확히 10분은 정상');
});

test('stale CASE 4·5. 조회 실패로 남은 이전 캐시는 10분 이내면 쓰고, 넘기면 쓰지 않는다', () => {
  // js/11은 지수 조회가 실패하면 이전 값을 그대로 남긴다(fetchedAt도 그때 값 그대로).
  setIndexCache(5 * MIN);
  assert.ok(SB.getMarketIndexInfoFromState('^KS11'), '5분 전 값 - 기존 정책대로 사용');
  setIndexCache(30 * MIN);
  assert.strictEqual(SB.getMarketIndexInfoFromState('^KS11'), null,
    '30분 전 값을 최신 실시간 시세로 내보내지 않는다 - 호출부가 개별 재조회로 넘어간다');
});

test('stale CASE 6. 취득시각이 없거나 비정상이면 안전하게 stale로 본다', () => {
  seed([KRW('d1', '000660.KS', 'ZZ국내주식A', 100)]);
  const candidate = SB.getCoreStockCandidates('domestic')[0];
  [undefined, null, 0, -1, NaN, '방금'].forEach((v) => {
    assert.strictEqual(SB.isCoreQuoteStale(v), true, `fetchedAt=${String(v)} → stale`);
  });
  setIndexCache(1 * MIN, { fetchedAt: undefined });
  assert.strictEqual(SB.getMarketIndexInfoFromState('^KS11'), null, 'fetchedAt 없는 지수 캐시 = stale');
  SB.evalInSandbox('var lastRefreshAt = 0;');
  assert.strictEqual(SB.getCoreStockInfoFromState(candidate), null, '아직 한 번도 갱신되지 않았으면 stale');
});

test('stale 판정은 가격 유효성 검사를 대체하지 않는다 - 가격이 없으면 시각과 무관하게 null', () => {
  seed([KRW('d1', '000660.KS', 'ZZ국내주식A', 0)]);          // currentPrice 0
  setRefreshedAgo(1 * MIN);
  const candidate = { ticker: '000660.KS', name: 'ZZ국내주식A', assetId: 'd1', curAmount: 0, qty: 1 };
  assert.strictEqual(SB.getCoreStockInfoFromState(candidate), null);
  setIndexCache(1 * MIN, { price: 0 });
  assert.strictEqual(SB.getMarketIndexInfoFromState('^KS11'), null);
});

/* =============================================================================
 * 3. 지수 타일의 시장 상태 표시 (P-4 · §9)
 * ========================================================================== */

test('지수 타일은 종목 행과 같은 공용 세션 표(SESSION_BADGE_META) 문구를 쓴다', () => {
  const META = SB.evalInSandbox('SESSION_BADGE_META');
  assert.deepStrictEqual(Object.keys(META).sort(), ['closed', 'post', 'pre', 'regular']);
  const html = (session) => SB.coreIndexCardHtml({ ticker: '^KS11', name: '코스피' },
    { price: 2500, changePercent: -1.98, session });
  assert.ok(html('closed').includes(META.closed.label), '장마감 문구');
  assert.ok(html('regular').includes(META.regular.label), '정규장 문구');
  assert.ok(html('pre').includes(META.pre.label), '프리마켓 문구');
  assert.ok(html('post').includes(META.post.label), '애프터마켓 문구');
  // 전일 종가(closed)를 장중 실시간 가격으로 오인할 수 없어야 한다 - 가격과 같은 타일에 상태가 적힌다.
  assert.ok(html('closed').includes('2,500'), '가격은 그대로 보인다');
  assert.ok(html('closed').includes(META.closed.title), '설명(title)도 공용 표에서 온다');
  // session 정보가 없는 소스(Stooq 등)는 종목 행과 같이 아무것도 적지 않는다.
  assert.strictEqual(SB.coreIndexSessionHtml(undefined), '');
  assert.strictEqual(SB.coreIndexSessionHtml('unknown-state'), '');
});

test('지수 타일 문구는 14px 기준(text-sm)을 지키고 새 UI 요소를 만들지 않는다', () => {
  const html = SB.coreIndexCardHtml({ ticker: '^GSPC', name: 'S&P 500' },
    { price: 7801.77, changePercent: -0.22, session: 'post' });
  assert.ok(/text-sm/.test(html), 'text-sm(14px) 사용');
  assert.ok(!/text-xs|text-\[1[0-3]px\]/.test(html), '14px 미만 클래스 없음');
  assert.ok(!/<(button|input|select|svg)/.test(html), '새 컴포넌트를 넣지 않는다');
});

/* =============================================================================
 * 4. 지역 전환 창과 미국 DST 경계 (P-4 · §5)
 * ========================================================================== */

// getCoreStocksRegion()은 "지금"을 읽으므로 Date를 고정해 경계를 재현한다(기존 테스트와 같은 방식).
function withFixedNow(iso, fn) {
  const RealDate = SB.evalInSandbox('Date');
  const fixedMs = new Date(iso).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedMs])); }
    static now() { return fixedMs; }
  }
  SB.Date = FixedDate;
  SB.evalInSandbox('var Date = globalThis.Date;');
  try { return fn(); } finally {
    SB.Date = RealDate;
    SB.evalInSandbox('var Date = globalThis.Date;');
  }
}
const regionAt = (iso) => withFixedNow(iso, () => SB.getCoreStocksRegion());

test('지역 전환 경계 - KST 07:00 이상 20:00 미만이 국내, 그 밖은 해외', () => {
  assert.strictEqual(regionAt('2026-10-07T06:59:00+09:00'), 'foreign');
  assert.strictEqual(regionAt('2026-10-07T07:00:00+09:00'), 'domestic');
  assert.strictEqual(regionAt('2026-10-07T19:59:00+09:00'), 'domestic');
  assert.strictEqual(regionAt('2026-10-07T20:00:00+09:00'), 'foreign');
  // 한국시간 자정 전후 - 둘 다 해외 창 안이라 날짜가 넘어가도 전환되지 않는다.
  assert.strictEqual(regionAt('2026-10-07T23:59:00+09:00'), 'foreign');
  assert.strictEqual(regionAt('2026-10-08T00:00:00+09:00'), 'foreign');
  assert.strictEqual(regionAt('2026-10-08T00:01:00+09:00'), 'foreign');
});

test('미국 정규장은 DST 두 국면 모두 해외 창(20:00~07:00) 안에 들어간다', () => {
  // 서머타임(EDT, UTC-4): ET 09:30~16:00 = KST 22:30~05:00
  assert.strictEqual(regionAt('2026-07-15T09:30:00-04:00'), 'foreign', '여름 개장');
  assert.strictEqual(regionAt('2026-07-15T15:59:00-04:00'), 'foreign', '여름 마감 직전');
  assert.strictEqual(regionAt('2026-07-15T16:00:00-04:00'), 'foreign', '여름 마감 직후');
  assert.strictEqual(regionAt('2026-07-15T08:00:00-04:00'), 'foreign', '여름 장전(프리마켓)');
  assert.strictEqual(regionAt('2026-07-15T17:00:00-04:00'), 'foreign', '여름 장후 이른 시간(KST 06:00)');
  // 표준시(EST, UTC-5): ET 09:30~16:00 = KST 23:30~06:00
  assert.strictEqual(regionAt('2026-12-15T09:30:00-05:00'), 'foreign', '겨울 개장');
  assert.strictEqual(regionAt('2026-12-15T15:59:00-05:00'), 'foreign', '겨울 마감 직전');
  assert.strictEqual(regionAt('2026-12-15T16:00:00-05:00'), 'foreign', '겨울 마감 직후(KST 06:00)');
  assert.strictEqual(regionAt('2026-12-15T08:00:00-05:00'), 'foreign', '겨울 장전(KST 22:00)');
  assert.strictEqual(regionAt('2026-12-15T16:30:00-05:00'), 'foreign', '겨울 장후 이른 시간(KST 06:30)');
  // DST 전환일 전후(2026-03-08 시작 · 2026-11-01 종료)의 개장 시각도 같다.
  assert.strictEqual(regionAt('2026-03-06T09:30:00-05:00'), 'foreign', 'DST 시작 직전 금요일');
  assert.strictEqual(regionAt('2026-03-09T09:30:00-04:00'), 'foreign', 'DST 시작 직후 월요일');
  assert.strictEqual(regionAt('2026-10-30T09:30:00-04:00'), 'foreign', 'DST 종료 직전 금요일');
  assert.strictEqual(regionAt('2026-11-02T09:30:00-05:00'), 'foreign', 'DST 종료 직후 월요일');
});

/* [기록된 특성 - 이번 범위에서 바꾸지 않는다] 미국 시간외는 ET 20:00까지 이어지는데 해외 창은
 * KST 07:00에 끝난다. 그래서 애프터마켓 후반에는 국내 목록이 보인다(여름 ET 18:00 = KST 07:00 ·
 * 겨울 ET 16:00 이후로 KST 06:00~07:00만 해외 창). 지역 창은 "어느 목록을 보여줄지"만 정하는
 * 고정 시각 규칙이고, 각 종목·지수의 실제 장 상태는 session 배지가 그대로 말해 준다. */
test('기록된 특성 - 미국 애프터마켓 후반은 해외 창을 벗어난다(판정식 고정)', () => {
  assert.strictEqual(regionAt('2026-07-15T18:00:00-04:00'), 'domestic', '여름 ET 18:00 = KST 07:00');
  assert.strictEqual(regionAt('2026-07-15T19:59:00-04:00'), 'domestic', '여름 애프터마켓 끝 무렵');
  assert.strictEqual(regionAt('2026-12-15T17:00:00-05:00'), 'domestic', '겨울 ET 17:00 = KST 07:00');
});

test('국내 정규장 · 장마감 · 주말 · 휴장일에도 지역 창은 시각만 본다(장 상태는 session 배지가 말한다)', () => {
  assert.strictEqual(regionAt('2026-10-07T09:00:00+09:00'), 'domestic', '국내 개장');
  assert.strictEqual(regionAt('2026-10-07T15:30:00+09:00'), 'domestic', '국내 마감 직후');
  assert.strictEqual(regionAt('2026-10-07T18:00:00+09:00'), 'domestic', '국내 장마감 후 저녁');
  assert.strictEqual(regionAt('2026-10-10T11:00:00+09:00'), 'domestic', '토요일 낮');
  assert.strictEqual(regionAt('2026-10-11T11:00:00+09:00'), 'domestic', '일요일 낮');
  assert.strictEqual(regionAt('2026-10-03T11:00:00+09:00'), 'domestic', '개천절');
  // 이 창은 "어느 목록을 보여줄지"만 정한다 - 장이 닫혔다는 사실은 공용 session 값이 전달한다.
  const META = SB.evalInSandbox('SESSION_BADGE_META');
  assert.ok(SB.coreIndexCardHtml({ ticker: '^KS11', name: '코스피' },
    { price: 2500, changePercent: 0, session: 'closed' }).includes(META.closed.label));
});

/* =============================================================================
 * 5. 자동 1회 표시 (추가 요구사항 · CASE 1~4)
 * ========================================================================== */

test('자동 표시는 버튼과 같은 함수를 쓰고 한 페이지 로드에서 한 번만 호출된다', () => {
  // vm 스코프의 let/function은 재선언할 수 없으니 값만 바꿔 끼운다(새 페이지 로드 상태 재현).
  const restore = SB.evalInSandbox('(() => { const real = openCoreStocksModal; return () => { openCoreStocksModal = real; }; })()');
  SB.evalInSandbox('coreStocksAutoShown = false; globalThis.__coreOpenCalls = 0;');
  SB.evalInSandbox('openCoreStocksModal = () => { globalThis.__coreOpenCalls++; return Promise.resolve(); };');
  const calls = () => SB.evalInSandbox('globalThis.__coreOpenCalls');
  try {
    SB.maybeAutoShowCoreStocksModal();
    assert.strictEqual(calls(), 1, '첫 호출에서 1회 표시');
    // 재렌더 · 5분 자동 갱신 · visibilitychange · SW 갱신으로 또 불려도 다시 뜨지 않는다.
    SB.maybeAutoShowCoreStocksModal();
    SB.maybeAutoShowCoreStocksModal();
    SB.maybeAutoShowCoreStocksModal();
    assert.strictEqual(calls(), 1, '중복 자동 표시 없음');
    // 사용자가 닫은 뒤 버튼으로 다시 여는 경로는 플래그와 무관하다 - 직접 호출은 항상 열린다.
    SB.evalInSandbox('openCoreStocksModal();');
    assert.strictEqual(calls(), 2, '버튼 경로는 자동 표시 1회 제한에 막히지 않는다');
  } finally {
    restore();
  }
});

test('자동 표시는 별도 조회 · 분류 로직을 두지 않는다 - 소스에 openCoreStocksModal 호출만 있다', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '02-dashboard-kpi.js'), 'utf8');
  const body = src.slice(src.indexOf('function maybeAutoShowCoreStocksModal'));
  const fn = body.slice(0, body.indexOf('\n}') + 2);
  assert.ok(/openCoreStocksModal\(\)/.test(fn), '기존 팝업 함수를 그대로 호출한다');
  ['getCoreStockCandidates', 'buildCoreStockGroups', 'fetchPriceWithFallback', 'innerHTML', 'coreStockRowHtml']
    .forEach((n) => assert.ok(!fn.includes(n), `자동 표시가 ${n}을 다시 구현하지 않는다`));
  // 버튼 클릭 리스너는 그대로 남아 있어야 한다(제거 · 비활성화 금지).
  assert.ok(/getElementById\('coreStocksLiveBtn'\)\.addEventListener\('click', \(\) => openCoreStocksModal\(\)\)/.test(src),
    '버튼 클릭 경로 무변경');
});
