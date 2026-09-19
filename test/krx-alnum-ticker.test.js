/* [2차 통합 보완 · PM 결정 ⑤] 영문이 섞인 국내 단축 종목코드(예: 0052D0) 입력 · 정규화 · 연결 검증.
 *
 * 입력 → sanitizeTicker → 종목 마스터(파서) → Exposure Master → Risk Benchmark → 가격 조회 경로.
 * "원장 확인됨" ≠ "지수 가격 원천 있음" ≠ "베타 있음"을 따로 확인한다.
 * 기존 숫자 6자리 국내 코드 · 해외 티커 동작은 그대로여야 한다(회귀).
 */
const test = require('node:test');
const assert = require('node:assert');
const EM = require('../js/28-exposure-master.js');
const { parseDomesticMst } = require('../scripts/update-ticker-master.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = require('./risk-sandbox.js');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

test('정규화: 영문 혼합 국내 코드는 국내(.KS)로, 기존 숫자 코드 · 해외 티커 · 지수는 그대로', () => {
  const s = loadRiskSandbox();
  const t = (x) => plain(s.sanitizeTicker(x));
  // 신규 - 대소문자 · A 접두사 · 이미 붙은 접미사 모두 같은 국내 코드로 모인다.
  ['0052D0', '0052d0', ' 0052D0 ', 'A0052D0', '0052D0.KS'].forEach((x) => {
    assert.deepStrictEqual({ y: t(x).yahooTicker, d: t(x).isDomestic }, { y: '0052D0.KS', d: '국내' }, x);
  });
  assert.deepStrictEqual({ y: t('0052D0.KQ').yahooTicker, d: t('0052D0.KQ').isDomestic }, { y: '0052D0.KQ', d: '국내' }, '명시한 접미사는 바꾸지 않는다');
  // 회귀 - 기존 숫자 6자리 · A 접두사 · 접미사
  assert.deepStrictEqual(t('005930'), { original: '005930', yahooTicker: '005930.KS', isDomestic: '국내' });
  assert.strictEqual(t('A005930').yahooTicker, '005930.KS');
  assert.strictEqual(t('247540.KQ').yahooTicker, '247540.KQ');
  // 회귀 - 해외 티커 · 지수 · 규격에 맞지 않는 문자열은 해외 그대로(국내 코드로 끌어오지 않는다)
  [['AAPL', 'AAPL'], ['googl', 'GOOGL'], ['BRK-B', 'BRK-B'], ['QQQM', 'QQQM'], ['ZZ0001', 'ZZ0001'], ['1234AB', '1234AB'], ['0052DD', '0052DD'], ['00520D', '00520D'], ['12345', '12345']].forEach(([x, y]) => {
    assert.deepStrictEqual({ y: t(x).yahooTicker, d: t(x).isDomestic }, { y, d: '해외' }, x);
  });
  assert.deepStrictEqual(t('^KS11'), { original: '^KS11', yahooTicker: '^KS11', isDomestic: '국내' });
  assert.strictEqual(t('').isDomestic, '국내');
  assert.strictEqual(s.isKrxShortCode('0052D0'), true);
  assert.strictEqual(s.isKrxShortCode('005930'), true);
  assert.strictEqual(s.isKrxShortCode('AAPL'), false);
});

test('종목 마스터: 월간 생성 파서가 영문 혼합 코드를 버리지 않는다(숫자 코드 · 형식 이상 행 처리는 그대로)', () => {
  const line = (code, name) => code.padEnd(9, ' ') + 'KR7000000000'.slice(0, 12) + name + '0'.repeat(227);
  const items = parseDomesticMst([line('0052D0', 'ZZ 영문코드 ETF'), line('005930', 'ZZ 숫자코드'), line('ABCDEF', 'ZZ 형식 이상')].join('\n'), 'KOSPI');
  assert.deepStrictEqual(items.map((i) => [i.code, i.yahooTicker, i.naverTicker]), [['0052D0', '0052D0.KS', '0052D0'], ['005930', '005930.KS', '005930']]);
  // 생성된 마스터 항목은 앱의 정규화 결과와 같은 키를 쓴다(마스터 조회가 이어진다).
  const s = loadRiskSandbox();
  s.setTickerMaster({ [items[0].yahooTicker]: { exchange: 'KOSPI', nameKr: items[0].nameKr } });
  assert.strictEqual(s.evalInSandbox(`tickerMasterByTicker[sanitizeTicker('0052D0').yahooTicker].nameKr`), 'ZZ 영문코드 ETF');
});

test('원장 · Risk Benchmark: 접미사 없이 입력해도 원장 항목으로 연결되고, 원천 · 베타 상태는 따로 남는다', async () => {
  // 원장 연결(Exposure resolved) - 브라우저와 같은 로드 순서(js/01 정규화 → js/28)에서 확인한다.
  const s = loadRiskSandbox();
  assert.strictEqual(s.exposureIdentityOf({ ticker: '0052D0' }), '0052D0.KS');
  const r = plain(s.resolveExposure({ ticker: '0052D0' }));
  assert.strictEqual(r.status, 'RESOLVED');
  assert.strictEqual(r.entry.benchmark, 'DJ_KOREA_DIV30_PR');
  assert.strictEqual(EM.isIndexPriceSourceAvailable(r.entry.benchmark), false);
  // Benchmark 확인됨 · 원천 없음
  const bm = plain(s.resolveRiskBenchmark({ ticker: '0052D0', category: 'ETF', name: 'ZZ 배당 ETF' }));
  assert.deepStrictEqual(bm, { key: 'DJ_KOREA_DIV30_PR', status: 'RESOLVED', source: 'exposureMaster', priceSource: 'UNAVAILABLE', indexUnavailableReason: 'NO_PUBLIC_SOURCE' });
  // 베타 없음(가격 이력은 있어도 비교할 지수 원천이 없다) - 원화 가격이므로 환율도 곱하지 않는다.
  s.state.assets = [makeTestAsset({ name: 'ZZ 배당 ETF', ticker: '0052D0', category: 'ETF', quantity: 100, buyPrice: 15000, currentPrice: 15000 })];
  s.setDailyCloses('0052D0.KS', withDates({ closes: zigzagCloses(260, 15000, 0.8, 0.7), volumes: volumes(260, 1000, 1) }));
  const m = await s.computeAdvancedRiskMetrics();
  const h = m.holdings[0];
  assert.strictEqual(h.ticker, '0052D0.KS', '국내 가격 시계열로 조회한다');
  assert.strictEqual(h.priceCcy, 'KRW');
  assert.strictEqual(h.hasData, true, '종목 가격 이력은 있다(오래됨 진단은 fixture 날짜 때문 · 계산 제외 사유 아님)');
  assert.strictEqual(h.benchmarkStatus, 'RESOLVED');
  assert.strictEqual(h.benchmarkPriceSource, 'UNAVAILABLE');
  assert.strictEqual(h.beta, null);
  assert.strictEqual(h.betaStatus, 'SOURCE_UNAVAILABLE');
});

test('가격 조회 경로: 국내 코드는 네이버 대상이 되고, 접미사 없는 코드는 코스피/코스닥을 함께 시도한다(해외는 그대로)', async () => {
  const s = loadRiskSandbox();
  // 네이버 실시간 조회 - 영문 혼합 코드를 "국내 코드 형식이 아님"으로 거절하지 않는다.
  const urls = [];
  s.fetchWithTimeout = async (url) => { urls.push(url); return { ok: false, status: 599 }; };
  await assert.rejects(s.fetchNaverKrPrice('0052D0.KS'), /HTTP 599/);
  assert.ok(urls[0].endsWith('/api/realtime/domestic/stock/0052D0'), urls[0]);
  await assert.rejects(s.fetchNaverKrPrice('AAPL'), /국내 종목 코드 형식이 아님/);
  // 대표 조회 - 접미사 없는 국내 코드만 .KS/.KQ를 함께 시도한다.
  const seen = [];
  s.raceFetchPrice = async (y) => { seen.push(y); if (y.endsWith('.KS')) return { price: 1, changePercent: 0 }; throw new Error('x'); };
  const run = async (raw) => { seen.length = 0; await s.fetchPriceWithFallback(raw, raw).catch(() => {}); return seen.slice().sort(); };
  assert.deepStrictEqual(await run('0052D0'), ['0052D0.KQ', '0052D0.KS']);
  assert.deepStrictEqual(await run('0052d0'), ['0052D0.KQ', '0052D0.KS']);
  assert.deepStrictEqual(await run('005930'), ['005930.KQ', '005930.KS'], '기존 숫자 코드 동작 그대로');
  assert.deepStrictEqual(await run('0052D0.KS'), ['0052D0.KS']);
  assert.deepStrictEqual(await run('AAPL'), ['AAPL']);
});

test('기존 저장값 보존: 예전 정규화 키(접미사 없는 0052D0)로 저장된 포지션 · 수익률 · 운용보수를 그대로 읽고 쓴다', () => {
  const s = loadAdapterSandbox();
  s.state.tickerRoles = { '0052D0': 'defender' };
  s.state.projection.customScenarioRates = { '0052D0': { conservative: 3, normal: 5, optimistic: 7 } };
  s.state.projection.customFeeRates = { '0052D0': 0.2 };
  assert.strictEqual(s.buildCustomRateKey('0052D0', 'ZZ'), '0052D0', '예전 키를 계속 쓴다(저장값을 옮기지 않는다)');
  assert.strictEqual(s.getTickerRole('0052D0'), 'defender');
  assert.strictEqual(s.findCustomRateKeyForAsset('0052D0', 'ZZ'), '0052D0');
  assert.strictEqual(s.getTargetProjectionFeeRate({ type: 'ticker', ticker: '0052D0', label: 'ZZ' }), 0.2);
  // 저장값이 없으면 새 설정은 국내 형식 키를 쓴다. 숫자 코드 · 해외 티커 키는 예전과 같다.
  s.state.tickerRoles = {}; s.state.projection.customScenarioRates = {}; s.state.projection.customFeeRates = {};
  assert.strictEqual(s.buildCustomRateKey('0052D0', 'ZZ'), '0052D0.KS');
  assert.strictEqual(s.buildCustomRateKey('005930', 'ZZ'), '005930.KS');
  assert.strictEqual(s.buildCustomRateKey('AAPL', 'ZZ'), 'AAPL');
  // 사용자가 지정한 종목 기준(Instrument Return Key)은 식별자를 비교할 때 정규화하므로 예전 원문도 그대로 연결된다.
  s.state.projection.instrumentReturnKeys = { '0052D0': 'KOSPI' };
  assert.strictEqual(s.findInstrumentReturnKey('0052D0.KS', 'ZZ').key, 'KOSPI');
});
