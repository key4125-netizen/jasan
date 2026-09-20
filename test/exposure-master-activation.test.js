/* Phase 1B - Exposure Master 실제 데이터 · 활성화 검증 (체크리스트 §44 제5·6·10·20·46조).
 *
 * 이 파일이 고정하려는 것은 두 가지다.
 *   ① 원장에 들어간 값이 전부 근거(evidence) 있는 사실이고 정책 규칙을 지킨다.
 *   ② 활성화해도 기존 Risk · MC · Return Key 결과가 달라지지 않는다
 *      (달라지는 유일한 항목은 진단용 source 라벨이며, 그 사유는 risk-engine.test.js에 적어 뒀다).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const EM = require('../js/28-exposure-master.js');
const { loadRiskSandbox, makeTestAsset, withDates, zigzagCloses, volumes } = require('./risk-sandbox.js');

const JS_DIR = path.join(__dirname, '..', 'js');
const readJs = (f) => fs.readFileSync(path.join(JS_DIR, f), 'utf8');
const entries = EM.EXPOSURE_MASTER_ENTRIES;
const verdicts = entries.map((e) => ({ e, v: EM.validateExposureEntry(e) }));
const byStatus = (s) => verdicts.filter((x) => x.v.status === s);
const find = (t) => entries.find((e) => e.ticker === t);

test('1. 앱 기본 자산이 원장에 등록돼 있다(js/09 SECTOR_MAP · ETF_HOLDINGS_MAP 기준)', () => {
  const risk = readJs('09-price-fx-risk-engine.js');
  // 선언 시작부터 그 선언을 닫는 첫 '};'까지만 읽는다(사이에 있는 다른 표를 끌어오지 않도록).
  const block = (decl) => {
    const start = risk.indexOf(decl);
    return risk.slice(start, risk.indexOf('\n};', start));
  };
  const sectorMapBlock = block('const SECTOR_MAP = {');
  const etfBlock = block('const ETF_HOLDINGS_MAP = {');
  const tickersIn = (block) => [...block.matchAll(/'([A-Z0-9.]{1,12})'\s*:/g)].map((m) => m[1]);
  const sectorTickers = tickersIn(sectorMapBlock);
  const etfTickers = tickersIn(etfBlock);
  assert.ok(sectorTickers.length >= 30, '섹터맵 종목을 읽어야 한다');
  assert.ok(etfTickers.length >= 10, 'ETF 구성표 종목을 읽어야 한다');
  // TSM은 의도적으로 제외했다(미국 상장 ADR - 기초 기업의 통화 · 자산군 근거가 저장소에 없다).
  const missing = sectorTickers.concat(etfTickers).filter((t) => t !== 'TSM' && !find(t));
  assert.deepStrictEqual(missing, [], `원장에 빠진 앱 기본 자산: ${missing.join(', ')}`);
});

test('2. 사용자 보유 정보(수량 · 금액 · 소유자 · 계좌)는 원장에 들어가지 않는다', () => {
  const src = readJs('28-exposure-master.js');
  entries.forEach((e) => {
    ['quantity', 'buyPrice', 'currentPrice', 'owner', 'accountType', 'amount'].forEach((k) => {
      assert.ok(!(k in e), `${e.ticker}에 보유 정보 ${k}가 들어가면 안 된다`);
    });
  });
  // 원장 값은 전부 문자열(사실 표기)이다 - 수량 · 금액 같은 수치가 들어올 자리가 없다.
  entries.forEach((e) => Object.entries(e).forEach(([k, v]) => {
    assert.strictEqual(typeof v, 'string', `${e.ticker}.${k}는 문자열이어야 한다`);
  }));
  assert.ok(src.includes('사용자 보유 수량 · 금액 · 거래내역은 담지 않는다'), '범위 선언이 파일에 남아 있어야 한다');
});

test('3. RESOLVED 항목은 전부 근거와 버전을 갖는다(추정값 없음)', () => {
  const resolved = byStatus('RESOLVED');
  assert.ok(resolved.length > 0);
  resolved.forEach(({ e }) => {
    assert.ok(String(e.evidence || '').length >= 20, `${e.ticker} evidence가 너무 짧다`);
    // [기대값 갱신 사유 · 1차 통합 구현 · §44 44-16 Evidence Grade] EM-2026.1은 저장소 안 근거만, EM-2026.2는
    // 운용사 공식 공개자료(근거 등급 A)를 쓴다. 어느 쪽도 외부 로그인 · API Key 없이 재확인할 수 있다.
    assert.ok(['EM-2026.1', 'EM-2026.2'].includes(e.version), `${e.ticker} 버전`);
    if (e.version === 'EM-2026.1') {
      assert.ok(/ticker-master\.json|ETF 구성표/.test(e.evidence), `${e.ticker} evidence 출처가 불명확하다`);
      // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] EM-2026.1은 원래 저장소 안 근거(종목 마스터 · ETF 구성표)만 갖고
      // 등급이 없었다. 미국 개별주 19건은 이번에 1차 자료(SEC EDGAR 설립지 · 10-K · 거래소 증권 종류)로 본국 보통주를
      // 확인해 equityListing과 A등급을 함께 채웠다 - 등급을 "소급해 만들어 넣은" 것이 아니라 새 근거가 생긴 것이다.
      // 규칙: 등급이 있으면 그 근거(판정 규칙 이름)가 evidence에 적혀 있어야 하고, 없으면 등급도 없어야 한다.
      if (e.evidenceGrade === undefined) {
        assert.strictEqual(e.equityListing, undefined, `${e.ticker}: 등급 없이 상장 형태만 적을 수 없다`);
      } else {
        assert.strictEqual(e.evidenceGrade, 'A', `${e.ticker}: 자동 연결 사실은 A등급만`);
        // 등급을 붙였으면 공식 자료 근거와 확인일이 evidence에 있어야 한다(판정 규칙 이름 또는 공식 출처 표기).
        assert.ok(/HOME_COMMON_RULE_V1|공식|공시|SEC/.test(e.evidence), `${e.ticker}: 등급의 근거가 evidence에 없다`);
        assert.ok(/20\d\d-\d\d-\d\d 확인|20\d\d-\d\d-\d\d 재확인|판정 20\d\d-\d\d-\d\d/.test(e.evidence), `${e.ticker}: 확인일이 없다`);
      }
    } else {
      assert.strictEqual(e.evidenceGrade, 'A', `${e.ticker}: 자동 연결 사실은 A등급만`);
      // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 확인일을 2026-09-19 한 날짜로 고정하지 않는다 -
      // 이번 조사에서 발행사 · 지수 제공기관 원문으로 다시 확인한 항목은 확인일이 2026-09-20이다.
      assert.ok(/공식|공시/.test(e.evidence) && /20\d\d-\d\d-\d\d (확인|재확인)/.test(e.evidence), `${e.ticker} 공식 근거 · 확인일이 없다`);
    }
  });
});

test('4. UNRESOLVED는 "앱에 대응 지수가 없다"는 사실 때문이며 사유가 기록돼 있다', () => {
  const unresolved = byStatus('UNRESOLVED');
  assert.ok(unresolved.length > 0);
  unresolved.forEach(({ e, v }) => {
    if (e.version === 'EM-2026.1') {
      // 이번 데이터에서 빠진 필수 항목은 benchmark 하나뿐이다(나머지 사실은 전부 채워져 있다).
      assert.deepStrictEqual(v.missing, ['benchmark'], `${e.ticker}의 미해결 사유가 benchmark 외에도 있다: ${v.missing}`);
      assert.ok(/지수 없음|대응 지수/.test(e.evidence), `${e.ticker} 사유가 evidence에 없다`);
      return;
    }
    // [1차 통합 구현] EM-2026.2의 미확정은 두 가지뿐이다 - 혼합 노출(MIXED) 또는 환헤지 A등급 미확인(HOLD).
    if (v.mixedExposure) {
      assert.strictEqual(e.exposureStructure, 'MIXED');
      assert.strictEqual(e.assetClass, undefined, `${e.ticker}: 혼합 상품에 단일 자산군을 적지 않는다`);
      assert.strictEqual(e.benchmark, undefined, `${e.ticker}: 혼합 상품에 단일 Benchmark를 적지 않는다`);
      return;
    }
    assert.deepStrictEqual(v.missing.slice().sort(), ['conversionMethod', 'fxExposure', 'hedgeStatus'], `${e.ticker}: ${v.missing}`);
    assert.ok(/연결 보류/.test(e.evidence), `${e.ticker} 보류 사유가 evidence에 없다`);
  });
});

test('5. BLOCKED · 중복 식별자는 없다', () => {
  assert.strictEqual(byStatus('BLOCKED').length, 0);
  assert.deepStrictEqual(EM.EXPOSURE_MASTER.duplicates, []);
  assert.deepStrictEqual(EM.EXPOSURE_MASTER.invalid, []);
  assert.strictEqual(EM.EXPOSURE_MASTER.size, entries.length);
});

test('6. Benchmark는 Index Master에 등록된 지수만 쓰고, 근사 대체가 없다', () => {
  // [기대값 갱신 사유 · 1차 통합 구현 · §44 44-16 Index Master] Benchmark 키는 이제 "앱이 가진 6개 지수"가 아니라
  // Index Master에 공식 정의와 함께 등록된 지수다. 가격 원천이 없는 지수(UNAVAILABLE)도 등록될 수 있으며,
  // 그 경우 Risk는 계산 가능으로 처리하지 않는다(test/integrated-benchmark-index.test.js).
  const APP_INDEXES = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SP500', 'NASDAQ100', 'DOW'];
  entries.forEach((e) => {
    if (!e.benchmark) return;
    assert.ok(EM.resolveIndexMasterEntry(e.benchmark), `${e.ticker}: Index Master에 없는 지수 ${e.benchmark}`);
    // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 069500 · 102110의 기초지수(코스피 200)를 운용사 · KRX 공식 자료로
    // 확인해 기재했다. 코스피 200은 Index Master에 등록됐지만 일별 시계열 원천이 없어 availability는 UNAVAILABLE이다 -
    // 즉 "Benchmark는 확인됨 · 가격 원천 없음"이며 KOSPI로 근사 대체하지 않는다.
    const ALLOWED_2026_1 = APP_INDEXES.concat(['KOSPI200_PR']);
    if (e.version === 'EM-2026.1') assert.ok(ALLOWED_2026_1.includes(e.benchmark), `${e.ticker}: 기존 항목의 Benchmark가 바뀌었다 ${e.benchmark}`);
  });
  // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 두 ETF의 기초지수는 코스피 200으로 확인됐다(공식 자료).
  // Index Master에 정의와 함께 등록하되 가격 원천은 없다 - 코스피(KOSPI)로 근사 대체하지 않는다는 원칙은 그대로다.
  ['069500.KS', '102110.KS'].forEach((t) => {
    assert.strictEqual(find(t).benchmark, 'KOSPI200_PR', `${t} 기초지수`);
    assert.strictEqual(EM.isIndexPriceSourceAvailable('KOSPI200_PR'), false, '코스피 200은 아직 가격 원천이 없다');
  });
  // 3배 레버리지 · 섹터 · 국채 ETF도 대응 지수가 없으면 비운다.
  ['TQQQ', 'SOXX', 'SMH', 'TLT', 'IEF'].forEach((t) => assert.strictEqual(find(t).benchmark, undefined, `${t}`));
  // SCHD는 공식 기초지수(DJ U.S. Dividend 100)를 적었지만 그 지수의 가격 원천이 없다 - 계산 가능으로 보지 않는다.
  assert.strictEqual(EM.isIndexPriceSourceAvailable(find('SCHD').benchmark), false);
  // NYSE · AMEX 상장 개별주는 앱에 종합지수가 없다(예전 DOW 근사를 되살리지 않는다).
  ['JPM', 'V', 'MA', 'JNJ', 'UNH', 'XOM', 'CVX', 'PG', 'KO'].forEach((t) => assert.strictEqual(find(t).benchmark, undefined, `${t}`));
  // 추종 지수가 앱 지수와 정확히 같은 ETF만 확정된다.
  assert.strictEqual(find('QQQ').benchmark, 'NASDAQ100');
  assert.strictEqual(find('VOO').benchmark, 'SP500');
});

test('7. FX 3필드(priceCcy · underlyingCcy · fxExposure)가 유형별로 분리돼 있다', () => {
  const kr = find('005930.KS');
  assert.strictEqual(kr.priceCcy, 'KRW');
  assert.strictEqual(kr.underlyingCcy, undefined, '국내주식에 기초통화를 억지로 넣지 않는다');
  assert.strictEqual(kr.fxExposure, undefined);
  const us = find('AAPL');
  assert.strictEqual(us.priceCcy, 'USD');
  assert.strictEqual(us.underlyingCcy, 'USD');
  assert.strictEqual(us.fxExposure, 'EXPOSED');
});

test('8. Hedge · Conversion: 이중 환산이 생길 수 있는 조합이 없다', () => {
  entries.forEach((e) => {
    if (e.priceCcy === 'KRW') {
      // 원화 가격계열에는 환산을 걸지 않는다(Risk 이중계상 방지 · §44 제6조 6-1).
      // [기대값 갱신 사유 · 1차 통합 구현] 국내 상장 해외 ETF(KR_LISTED_FOREIGN_ETF)는 §44 44-1 매트릭스상
      // fxExposure · hedgeStatus · conversionMethod가 필수다 - 이 값은 MC의 경제적 환노출(6-2)과 D-05의 "지수" 환산에
      // 쓰이며, 종목 자신의 원화 가격계열에는 곱하지 않는다(Risk priceCcy = KRW · 아래 단언).
      if (e.assetType === 'KR_LISTED_FOREIGN_ETF' && e.underlyingCcy && e.underlyingCcy !== 'KRW') {
        assert.ok(!e.conversionMethod || e.conversionMethod === 'FX_MULTIPLY', `${e.ticker}`);
      } else {
        assert.ok(!e.conversionMethod || e.conversionMethod === 'NONE', `${e.ticker}: 원화 가격인데 환산방법이 있다`);
        assert.ok(!e.fxExposure || e.fxExposure === 'NONE', `${e.ticker}: 원화 가격인데 환노출이 있다`);
      }
    }
    if (e.assetType === 'FOREIGN_LISTED_ETF') {
      assert.strictEqual(e.hedgeStatus, 'UNHEDGED', `${e.ticker}`);
      assert.strictEqual(e.fxExposure, 'EXPOSED');
      assert.strictEqual(e.conversionMethod, 'FX_MULTIPLY');
    }
  });
  // 원장 전체가 Phase 1A의 FX 규칙 검사를 통과한다(HEDGED↔NONE↔HEDGE_COST 등).
  verdicts.forEach(({ e, v }) => assert.deepStrictEqual(v.violations, [], `${e.ticker}: ${v.violations}`));
});

test('9. Return Key는 원장 대상이 아니며 서로 덮어쓰지 않는다', () => {
  // 수익률 기준 전용 키는 종목이 아니므로 등록하지 않는다(§44 제3조).
  ['NASDAQ', 'S&P500', 'DEV_EX_US', 'EMERGING'].forEach((k) => assert.strictEqual(find(k), undefined, `${k}`));
  // [기대값 갱신 사유 · 1차 통합 구현 · D-16] js/05는 이제 "자산 성격" 판정에서만 원장을 읽는다(resolveExposureCharacter).
  // Return Key 자동 판정 · 추천 · 상태 점검은 원장 단계를 명시적으로 건너뛴다(exposureMaster: false) - Return Key 의미 불변.
  const js05 = readJs('05-future-projection.js');
  const emRefs = js05.match(/resolveExposure\w*/g) || [];
  assert.deepStrictEqual([...new Set(emRefs)], ['resolveExposureCharacter'], 'js/05는 성격 판정용 함수 하나만 참조한다');
  assert.strictEqual((js05.match(/resolveAssetCharacter\([^)]*\{ exposureMaster: false \}\)/g) || []).length, 3, 'Return Key 계층 3곳은 원장을 보지 않는다');
  assert.ok(!readJs('16-monte-carlo-adapter.js').includes('resolveExposure'), 'MC 어댑터는 js/05 성격 판정을 거쳐서만 원장을 본다');
  assert.ok(!readJs('15-monte-carlo-engine.js').includes('resolveExposure'), 'MC 엔진은 그대로다');
});

test('10. MC 연결점은 존재하되 값만 제공한다(엔진 미연결)', () => {
  assert.strictEqual(typeof EM.resolveExposureAssetClass, 'function');
  assert.strictEqual(EM.resolveExposureAssetClass({ ticker: 'AAPL' }), 'US_EQUITY');
  assert.strictEqual(EM.resolveExposureAssetClass({ ticker: '005930.KS' }), 'KR_EQUITY');
  // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 069500은 기초지수가 확인돼 RESOLVED가 됐으므로 자산군 값을 준다.
  // MC 결과는 바뀌지 않는다 - 기존 판정 경로도 같은 국내주식 자산군을 주고 있었다(회귀 하네스 mc 차이 0건으로 확인).
  assert.strictEqual(EM.resolveExposureAssetClass({ ticker: '069500.KS' }), 'KR_EQUITY');
  // 확정되지 않은 종목은 값을 주지 않는다 - 호출부가 기존 판정으로 넘어가게 한다.
  assert.strictEqual(EM.resolveExposureAssetClass({ ticker: 'UNKNOWN999' }), null);
});

test('11. Risk 벤치마크: 원장이 주는 값이 기존 판정과 같다(키 기준 무변경)', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({
    '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자' },
    'NVDA': { exchange: 'NASDAQ', nameEn: 'NVIDIA CORP' },
    'JPM': { exchange: 'NYSE', nameEn: 'JPMORGAN CHASE & CO.' }
  });
  const key = (o) => s.resolveRiskBenchmark(Object.assign({ category: '주식', name: '' }, o)).key;
  assert.strictEqual(key({ ticker: '005930.KS' }), 'KOSPI');
  // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] NVDA는 SEC EDGAR(설립지 DE · 10-K)와 거래소 종목 디렉터리(Common Stock)로
  // 본국 보통주가 확인돼 원장에 A등급 근거가 들어갔다 - 이제 원장의 NASDAQ을 쓴다(거래소 상장 사실만으로 준 것이 아니다).
  assert.strictEqual(key({ ticker: 'NVDA' }), 'NASDAQ');
  assert.strictEqual(key({ ticker: 'QQQ', category: 'ETF' }), 'NASDAQ100');
  assert.strictEqual(key({ ticker: 'SPY', category: 'ETF' }), 'SP500');
  // 원장이 비워 둔 종목은 기존 판정 그대로 UNRESOLVED다(임의 대체 없음).
  assert.strictEqual(key({ ticker: 'JPM' }), null);
  // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 기초지수(코스피 200)가 확인돼 키가 생겼다. 가격 원천은 없어 베타는 만들지 않는다.
  assert.strictEqual(key({ ticker: '069500.KS', category: 'ETF' }), 'KOSPI200_PR');
  assert.strictEqual(key({ ticker: 'TQQQ', category: 'ETF' }), null);
  // 원장에 없는 종목도 기존 경로가 그대로 판정한다.
  s.setTickerMaster({ '247540.KQ': { exchange: 'KOSDAQ', nameKr: '에코프로비엠' } });
  assert.strictEqual(key({ ticker: '247540.KQ' }), 'KOSDAQ');
});

test('12. 기록이 원장과 어긋나면(펀드 이름 + 개별주 티커) 원장을 쓰지 않는다', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({ 'NVDA': { exchange: 'NASDAQ', nameEn: 'NVIDIA CORP' } });
  const r = s.resolveRiskBenchmark({ ticker: 'NVDA', category: '주식', name: 'KODEX 엔비디아' });
  assert.strictEqual(r.key, null, '이름이 펀드를 가리키면 개별주 지수를 물려주지 않는다');
});

test('13. Risk 계산 결과: 원장 등록 종목의 위험지표가 예전과 같다', async () => {
  // 같은 fixture로 두 번 계산해 값이 결정적인지 + 원장 경로에서도 정상 산출되는지 본다.
  const s = loadRiskSandbox();
  s.setTickerMaster({ '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자' } });
  s.setDailyCloses('005930.KS', withDates({ closes: zigzagCloses(260, 100000, 1.2, 1.0), volumes: volumes(260, 1000, 1.0) }));
  s.setDailyCloses('^KS11', withDates({ closes: zigzagCloses(260, 2500, 1.0, 1.0) }));
  s.state.assets = [makeTestAsset({ name: '삼성전자', ticker: '005930.KS', quantity: 30, buyPrice: 100000, currentPrice: 100000 })];
  const a = await s.computeAdvancedRiskMetrics();
  const b = await s.computeAdvancedRiskMetrics();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), '같은 입력에 같은 결과여야 한다');
  assert.strictEqual(a.dataSufficiency.status, 'SUFFICIENT');
  assert.ok(Number.isFinite(a.portfolioVolatilityPct), '변동성이 산출된다');
  // 원장이 준 benchmark(KOSPI)로 베타가 정상 계산된다 - 기존 경로와 같은 지수를 쓴다.
  assert.ok(Number.isFinite(a.portfolioBeta), '베타가 산출된다');
  assert.strictEqual(a.holdings[0].benchmarkKey, 'KOSPI');
  assert.strictEqual(a.holdings[0].benchmarkStatus, 'RESOLVED');
});

test('14. feature flag: 꺼져 있으면 어떤 값도 주지 않는다(연결점 포함)', () => {
  assert.strictEqual(EM.isExposureMasterActive(), true, 'Phase 1B에서는 켜져 있다');
  // 비활성 동작은 resolveExposure의 분기로 고정돼 있다 - 원장을 넘겨도 값을 만들지 않는다.
  const src = readJs('28-exposure-master.js');
  assert.ok(src.includes("reason: 'MASTER_INACTIVE'"), '비활성 분기가 남아 있어야 한다');
  assert.ok(src.includes('if (!isExposureMasterActive())'), '조회 진입점에서 플래그를 먼저 본다');
  // js/09도 플래그를 확인한 뒤에만 원장을 본다.
  assert.ok(readJs('09-price-fx-risk-engine.js').includes('isExposureMasterActive()'), 'Risk 연결부가 플래그를 확인한다');
});

test('15. 조용한 대체가 없다: 미등록 · 미확정 종목은 null을 주고 끝난다', () => {
  assert.strictEqual(EM.resolveExposureBenchmark({ ticker: 'NOT_IN_MASTER' }), null);
  // [기대값 갱신 사유 · 1차 통합 구현] SCHD는 공식 기초지수가 확인돼 확정됐다(가격 원천 없음은 Index Master가 판정).
  // 미확정 예시는 대응 지수가 없는 TQQQ로 바꿔 같은 규칙을 검사한다.
  assert.strictEqual(EM.resolveExposureBenchmark({ ticker: 'TQQQ' }), null, '대응 지수가 없으면 비슷한 지수로 대신하지 않는다');
  const r = EM.resolveExposure({ ticker: 'TQQQ' });
  assert.strictEqual(r.status, 'UNRESOLVED');
  assert.strictEqual(r.reason, 'INCOMPLETE_ENTRY');
  assert.strictEqual(r.entry, null, '미확정 항목의 값은 밖으로 나가지 않는다');
});

test('16. 원장 규모와 상태 분포가 기록한 것과 같다', () => {
  // [기대값 갱신 사유 · 1차 통합 구현] 기존 49건은 그대로 있고(그중 SCHD 1건은 공식 기초지수가 확인돼 EM-2026.2로 갱신 ·
  // UNRESOLVED → RESOLVED · 자산군 무변경), PM 확정 공식 매핑 9건(EM-2026.2)이 추가됐다.
  assert.strictEqual(entries.length, 58);
  assert.strictEqual(entries.filter((e) => e.version === 'EM-2026.1').length, 48);
  assert.strictEqual(entries.filter((e) => e.version === 'EM-2026.2').length, 10);
  // [기대값 갱신 사유 · 실행 묶음 B · 2026-09-20] 공식 자료로 세 건이 추가 확정됐다 -
  // 069500 · 102110(기초지수 코스피 200) · 368590(환노출 확정으로 환헤지 사실 완비).
  assert.strictEqual(byStatus('RESOLVED').length, 41);
  assert.strictEqual(byStatus('UNRESOLVED').length, 17);
  const types = {};
  entries.forEach((e) => { types[e.assetType] = (types[e.assetType] || 0) + 1; });
  assert.deepStrictEqual(types, { KR_STOCK: 16, FOREIGN_STOCK: 20, FOREIGN_LISTED_ETF: 11, KR_LISTED_DOMESTIC_ETF: 5, KR_LISTED_FOREIGN_ETF: 6 });
});
