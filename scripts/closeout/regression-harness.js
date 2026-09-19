// [전체 미결사항 종결 프로젝트 · PHASE 0 · 계획서 §16] Risk / MC / Master 회귀 하네스
//
// 목적:
//   이 프로젝트에서 코드 · 정책 · 데이터가 바뀔 때 "무엇이 얼마나 달라졌는지"를 기계가 읽을 수 있는
//   형태로 남긴다. 계획서 §15가 요구하는 대로 FROZEN(고정 데이터)과 CURRENT(현재 운영 데이터)를
//   완전히 분리해서 돌린다 - 그래야 결과 차이를 DATA / CODE / POLICY로 구분할 수 있다.
//
// 설계 원칙:
//   - 새 테스트 프레임워크를 도입하지 않는다. 기존 test/risk-sandbox.js · test/mc-adapter-sandbox.js를
//     그대로 재사용한다(브라우저와 같은 로드 순서로 실제 production 코드를 실행한다).
//   - 네트워크를 쓰지 않는다. 가격 이력은 결정적 생성기로 주입하고, 환율만 실제 H.10 값을 쓴다
//     (FROZEN = baseline/v262/data/usdkrw-h10.json 사본, CURRENT = data/fx/usdkrw-h10.json).
//   - 실제 보유 종목을 쓰지 않는다. 수량 · 금액은 합성값이고, 종목은 공개 원장(js/28)에 이미 등재된
//     공개 식별자만 쓴다 - 정책 경로(D-01 · D-05 · D-06 · MIXED · 원천 없음)를 모두 통과시키기 위함이다.
//   - 오늘 날짜에 의존하지 않는다. 샌드박스의 Date를 고정한다(아래 FROZEN_TODAY).
//
// 사용법:
//   node scripts/closeout/regression-harness.js run                  현재 코드 · FROZEN 데이터로 실행(요약 출력)
//   node scripts/closeout/regression-harness.js run --data=current   현재 운영 데이터로 실행
//   node scripts/closeout/regression-harness.js baseline             기준선 기록(baseline/v262/regression/)
//   node scripts/closeout/regression-harness.js compare              기준선과 비교(차이가 있으면 종료코드 1)
//   옵션: --suite=risk|mc|master (기본 전부)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'baseline', 'v262', 'regression');
const FROZEN_H10 = path.join(ROOT, 'baseline', 'v262', 'data', 'usdkrw-h10.json');
const CURRENT_H10 = path.join(ROOT, 'data', 'fx', 'usdkrw-h10.json');

const { loadRiskSandbox, makeTestAsset } = require(path.join(ROOT, 'test', 'risk-sandbox.js'));
const { loadAdapterSandbox } = require(path.join(ROOT, 'test', 'mc-adapter-sandbox.js'));
const EM = require(path.join(ROOT, 'js', '28-exposure-master.js'));

// 고정 기준일. FROZEN H.10의 마지막 관측일(2026-09-11) 바로 다음 날이다 - 이 날짜를 "오늘"로 두면
// 데이터 신선도 판정(RISK_STALE_MAX_GAP_DAYS = 10)이 실행일과 무관하게 항상 같은 결과를 낸다.
const FROZEN_TODAY = '2026-09-12';
const OBS_DAYS = 300;          // fixture 시계열 길이(1년 창 · 최소 관측 수 요건을 넉넉히 넘긴다)
const MC_SEED = 20260101;      // 기존 단위 테스트와 같은 고정 seed
const MC_ITERATIONS = 300;

/* ========================= 공통 도우미 ========================= */

// 실행마다 달라지는 값(측정 시각 · 소요시간)은 비교 대상에서 뺀다.
const VOLATILE_KEYS = new Set(['elapsedMs', 'durationMs', 'executionTime', 'ms', 'startedAt', 'finishedAt', 'generatedAt', 'fetchedAt', 'timestamp', 'now']);

// vm 컨텍스트에서 만들어진 객체는 realm이 달라 그대로 비교할 수 없다. 값만 평범한 객체로 옮기고
// 부동소수 잡음이 비교를 흔들지 않도록 유효숫자 10자리로 정규화한다(정책 변화는 이보다 훨씬 크다).
function digest(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(10)) : String(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(digest);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [k, digest(v)]));
  const out = {};
  Object.keys(value).sort().forEach((k) => { if (!VOLATILE_KEYS.has(k)) out[k] = digest(value[k]); });
  return out;
}

function readH10(mode) {
  const file = mode === 'current' ? CURRENT_H10 : FROZEN_H10;
  if (!fs.existsSync(file)) throw new Error(`H.10 스냅샷이 없다: ${path.relative(ROOT, file)} (먼저 freeze-baseline.js 실행)`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rates = new Map();
  (json.rates || []).forEach(([date, rate]) => { if (typeof rate === 'number' && Number.isFinite(rate)) rates.set(date, rate); });
  return { file: path.relative(ROOT, file).replace(/\\/g, '/'), endDate: json.endDate, rows: rates.size, rates };
}

// 샌드박스의 "오늘"을 고정한다. vm 컨텍스트의 전역 Date를 바꾸면 이후 호출되는 production 코드가
// 모두 이 Date를 본다(함수 안에서 전역으로 조회하기 때문).
function freezeToday(sandbox, isoDate) {
  const Real = Date;
  const fixed = new Real(`${isoDate}T00:00:00Z`).getTime();
  function FrozenDate(...args) {
    if (!(this instanceof FrozenDate)) return new Real(fixed).toString();
    return args.length === 0 ? new Real(fixed) : new Real(...args);
  }
  FrozenDate.now = () => fixed;
  FrozenDate.parse = Real.parse;
  FrozenDate.UTC = Real.UTC;
  FrozenDate.prototype = Real.prototype;
  sandbox.Date = FrozenDate;
}

// 결정적 가격 시계열 - 난수를 쓰지 않는다. 같은 인자면 항상 같은 배열이다.
function zigzag(n, start, upPct, downPct) {
  const out = []; let p = start;
  for (let i = 0; i < n; i++) { out.push(Number(p.toFixed(6))); p *= (1 + (i % 2 === 0 ? upPct : -downPct) / 100); }
  return out;
}

/* ========================= ① Risk suite ========================= */

// fixture 구성 근거: 정책 경로를 하나씩 통과시킨다(실제 보유 종목이 아니다).
//   005930.KS  국내 개별주 → 상장시장 지수(KOSPI)
//   069500.KS  국내 ETF → 원장에 benchmark 없음(ETF 라벨 경로)
//   278530.KS  국내 ETF → KOSPI200_TR(Index Master UNAVAILABLE = 원천 없음)
//   360750.KS  국내 상장 비헤지 해외 ETF → SP500 · 비동기 Dimson · H.10 원화 환산(D-05)
//   AAPL       미국 개별주 → 본국 보통주 근거 없음(D-06 UNRESOLVED)
//   SCHD       미국 상장 ETF → DJ_US_DIV100_PR(원천 없음)
//   237370.KS  혼합(MIXED) → 단일 benchmark 강제 금지
const RISK_FIXTURE = [
  { ticker: '005930', category: '주식', isDomestic: '국내', currency: 'KRW', qty: 30, price: 100000, start: 100000, up: 1.2, down: 1.0 },
  { ticker: '069500', category: 'ETF', isDomestic: '국내', currency: 'KRW', qty: 40, price: 38000, start: 38000, up: 0.9, down: 0.8 },
  { ticker: '278530', category: 'ETF', isDomestic: '국내', currency: 'KRW', qty: 50, price: 15000, start: 15000, up: 0.8, down: 0.7 },
  { ticker: '360750', category: 'ETF', isDomestic: '국내', currency: 'KRW', qty: 60, price: 20000, start: 20000, up: 1.0, down: 0.9 },
  { ticker: 'AAPL', category: '주식', isDomestic: '해외', currency: 'USD', qty: 10, price: 200, start: 200, up: 1.1, down: 1.0 },
  { ticker: 'SCHD', category: 'ETF', isDomestic: '해외', currency: 'USD', qty: 20, price: 30, start: 30, up: 0.7, down: 0.6 },
  { ticker: '237370', category: 'ETF', isDomestic: '국내', currency: 'KRW', qty: 70, price: 12000, start: 12000, up: 0.6, down: 0.5 }
];

// 상장 거래소(종목 마스터) - 개별주 benchmark 판정에 쓰인다. 공개 상장 사실만 담는다.
const RISK_TICKER_MASTER = {
  '005930.KS': { exchange: 'KOSPI', nameKr: '삼성전자', market: 'KR' },
  AAPL: { exchange: 'NASDAQ', nameEn: 'APPLE INC', market: 'US' },
  SCHD: { exchange: 'NYSE', nameEn: 'SCHWAB US DIVIDEND EQUITY ETF', market: 'US' }
};

// 지수 시계열도 결정적으로 만든다(같은 달력 · 다른 진폭).
const RISK_INDEX_SERIES = {
  '^KS11': { start: 2500, up: 1.0, down: 0.9 },
  '^KQ11': { start: 800, up: 1.1, down: 1.0 },
  '^IXIC': { start: 15000, up: 0.9, down: 0.8 },
  '^GSPC': { start: 5000, up: 0.85, down: 0.75 },
  '^NDX': { start: 18000, up: 0.95, down: 0.85 },
  '^DJI': { start: 38000, up: 0.7, down: 0.6 }
};

async function runRiskSuite(h10) {
  const dates = [...h10.rates.keys()].sort().slice(-OBS_DAYS);
  const s = loadRiskSandbox();
  freezeToday(s, FROZEN_TODAY);
  s.state.exchangeRate = 1300;
  s.state.assets = RISK_FIXTURE.map((f) => makeTestAsset({
    name: `ZZ ${f.ticker}`, ticker: f.ticker, owner: '신랑', accountType: '일반계좌',
    category: f.category, isDomestic: f.isDomestic, currency: f.currency,
    quantity: f.qty, buyPrice: f.price, currentPrice: f.price
  }));
  RISK_FIXTURE.forEach((f) => {
    const yahoo = s.sanitizeTicker(f.ticker).yahooTicker;
    s.setDailyCloses(yahoo, { dates: dates.slice(), closes: zigzag(dates.length, f.start, f.up, f.down) });
  });
  Object.entries(RISK_INDEX_SERIES).forEach(([key, cfg]) => {
    s.setDailyCloses(key, { dates: dates.slice(), closes: zigzag(dates.length, cfg.start, cfg.up, cfg.down) });
  });
  s.setTickerMaster(RISK_TICKER_MASTER);
  // 환율은 실제 H.10 값을 그대로 쓴다(FROZEN 또는 CURRENT).
  s.setUsdKrwRates({ status: 'OK', rates: h10.rates, endDate: h10.endDate });

  const m = await s.computeAdvancedRiskMetrics();
  if (!m) throw new Error('Risk 지표 계산이 null을 돌려줬다');

  // 종목별로는 정책 판정과 진단 상태만 남긴다(가격 배열은 비교 대상이 아니다).
  const holdings = m.holdings.map((h) => digest({
    ticker: h.ticker, weight: h.weight, priceCcy: h.priceCcy,
    benchmarkKey: h.benchmarkKey, benchmarkStatus: h.benchmarkStatus, benchmarkSource: h.benchmarkSource,
    benchmarkPriceSource: h.benchmarkPriceSource, benchmarkAlignment: h.benchmarkAlignment,
    benchmarkFx: h.benchmarkFx, benchmarkMarket: h.benchmarkMarket, benchmarkDefinitionStatus: h.benchmarkDefinitionStatus,
    beta: h.beta, betaStatus: h.betaStatus, betaMethod: h.betaMethod, betaComponents: h.betaComponents,
    dataStatus: h.dataStatus, volatilityPct: h.volatilityPct, mddPct: h.mddPct, observationCount: h.observationCount
  }));

  return {
    fixture: { assets: RISK_FIXTURE.length, observationDays: dates.length, firstDate: dates[0], lastDate: dates[dates.length - 1], today: FROZEN_TODAY },
    fx: { file: h10.file, endDate: h10.endDate, rows: h10.rows },
    portfolio: digest({
      totalCur: m.totalCur, riskScore: m.riskScore, portfolioVolatilityPct: m.portfolioVolatilityPct,
      portfolioVolatilityShortPct: m.portfolioVolatilityShortPct, var95Pct: m.var95Pct, cvarPct: m.cvarPct,
      portfolioMDDPct: m.portfolioMDDPct, sortino: m.sortino, weightedAvgCorrelation: m.weightedAvgCorrelation,
      portfolioBeta: m.portfolioBeta, hhi: m.hhi, topWeight: m.topWeight, top3Weight: m.top3Weight,
      missingCount: m.missingCount, dataConfidence: m.dataConfidence,
      stressLossPct: m.stressLossPct, stressLossPct2022: m.stressLossPct2022, stressStatus: m.stressStatus,
      subScores: m.subScores, excludedFactors: m.excludedFactors, metricStatus: m.metricStatus,
      dataSufficiency: m.dataSufficiency, fxBasis: m.fxBasis, varTailObservationCount: m.varTailObservationCount
    }),
    holdings
  };
}

/* ========================= ② MC suite ========================= */

// v261 시점 원장 49건(EM-2026.1 + SCHD) - 기존 불변 테스트(test/mc-exposure-invariant.test.js)와 같은 모집단.
const MC_49 = EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.1' || e.ticker === 'SCHD');
const bare = (t) => t.replace(/\.KS$/, '');
const isForeign = (e) => ['FOREIGN_STOCK', 'FOREIGN_LISTED_ETF'].includes(e.assetType);
const isStock = (e) => e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK';

// 상관 쌍 진단 압축 - dataset 객체는 datasetId로 접고 나머지 값은 그대로 둔다.
function compactPairs(pairs) {
  if (!Array.isArray(pairs)) return pairs;
  return pairs.map((p) => {
    const out = {};
    Object.keys(p).forEach((k) => {
      if (k === 'dataset') out.datasetId = p.dataset && p.dataset.datasetId ? p.dataset.datasetId : null;
      else out[k] = p[k];
    });
    return out;
  });
}

async function runMcSuite() {
  const sb = loadAdapterSandbox();
  freezeToday(sb, FROZEN_TODAY);
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = { ZZKEY: { conservative: 4, normal: 6, optimistic: 8 } };
  S.projection.customFeeRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.contributionGrowthRate = 0; S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 50, '해외': 50 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });
  sb.getCachedDailyCloses = async () => { throw new Error('장기 MC가 가격 이력을 조회했다'); };

  S.assets = MC_49.map((e) => sb.makeAsset({
    ticker: bare(e.ticker), name: `ZZ ${bare(e.ticker)}`, category: isStock(e) ? '주식' : 'ETF',
    owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
    currency: isForeign(e) ? 'USD' : 'KRW', isDomestic: isForeign(e) ? '해외' : '국내',
    rateMatchOverride: 'ZZKEY'
  }));
  const spread = (list) => list.map((e, i) => ({
    type: 'ticker', ticker: bare(e.ticker), label: `ZZ ${bare(e.ticker)}`,
    pct: i === 0 ? 100 - Math.floor(100 / list.length) * (list.length - 1) : Math.floor(100 / list.length)
  }));
  S.rebalance['신랑'].targets = { '국내': spread(MC_49.filter((e) => !isForeign(e))), '해외': spread(MC_49.filter(isForeign)) };

  const input = await sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: 20 });
  const result = sb.runMonthlyPrecisionMC({
    pv0: 100000000, instruments: input.instruments, correlationMatrix: input.correlationMatrix,
    monthlyContribution: 1000000, years: 20, iterations: MC_ITERATIONS, seed: MC_SEED, taxScope: input.taxScope
  });

  return {
    config: { seed: MC_SEED, iterations: MC_ITERATIONS, years: 20, pv0: 100000000, monthlyContribution: 1000000, assets: MC_49.length },
    input: digest({
      errors: Array.from(input.errors || []), assetOrder: input.assetOrder, instruments: input.instruments,
      correlationMatrix: input.correlationMatrix, taxScope: input.taxScope,
      // 상관 쌍 진단은 쌍마다 데이터셋 메타데이터 전체를 다시 담고 있어(같은 내용 1,081회) 기준선이
      // 1MB를 넘는다. 비교에 필요한 값만 남기고 데이터셋은 식별자로만 참조한다 - 차이 탐지력은 같다.
      cma: input.cma ? { instruments: input.cma.instruments, pairs: compactPairs(input.cma.pairs) } : null
    }),
    result: digest(result)
  };
}

/* ========================= ③ Master suite ========================= */

function runMasterSuite() {
  const sb = loadAdapterSandbox();
  freezeToday(sb, FROZEN_TODAY);
  sb.state.projection.customScenarioRates = { ZZKEY: { conservative: 4, normal: 6, optimistic: 8 } };

  const exposure = EM.EXPOSURE_MASTER_ENTRIES.map((e) => digest({
    ticker: e.ticker, version: e.version, assetType: e.assetType, assetClass: e.assetClass,
    marketExposure: e.marketExposure, benchmark: e.benchmark, priceCcy: e.priceCcy, underlyingCcy: e.underlyingCcy,
    fxExposure: e.fxExposure, hedgeStatus: e.hedgeStatus, conversionMethod: e.conversionMethod,
    evidenceGrade: e.evidenceGrade, exposureStructure: e.exposureStructure,
    underlyingReturnType: e.underlyingReturnType, equityListing: e.equityListing
  }));
  const index = EM.INDEX_MASTER_ENTRIES.map((i) => digest({
    key: i.key, officialName: i.officialName, provider: i.provider, sourceId: i.sourceId, returnType: i.returnType,
    priceDefinition: i.priceDefinition, currency: i.currency, market: i.market, source: i.source,
    evidenceGrade: i.evidenceGrade, availability: i.availability, unavailableReason: i.unavailableReason
  }));

  // 원장 전 종목에 대해 자산 성격 · MC 자산군 · Return Key를 판정한다(D-16 경계 검증용).
  const resolution = EM.EXPOSURE_MASTER_ENTRIES.map((e) => {
    const asset = sb.makeAsset({
      ticker: bare(e.ticker), name: `ZZ ${bare(e.ticker)}`, category: isStock(e) ? '주식' : 'ETF',
      owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
      currency: isForeign(e) ? 'USD' : 'KRW', isDomestic: isForeign(e) ? '해외' : '국내'
    });
    const ch = sb.resolveAssetCharacter(asset);
    const mc = sb.resolveMcAppAssetClass({ key: 'ZZKEY', subject: asset });
    const rateKey = sb.recommendReturnAssumptionKey ? sb.recommendReturnAssumptionKey(asset) : null;
    return digest({
      ticker: e.ticker, character: ch && ch.character, characterSource: ch && ch.source,
      mcAppClass: mc && mc.appClass, mcBasis: mc && mc.basis,
      recommendedRateKey: rateKey && (rateKey.key !== undefined ? rateKey.key : rateKey)
    });
  });

  const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ticker-master.json'), 'utf8'));
  const items = Array.isArray(tm.items) ? tm.items : [];
  const alnum = items.filter((r) => /^\d{4}[A-Z]\d$/.test(String(r.code || r.shortCode || ''))).length;

  return {
    exposureMaster: { count: exposure.length, entries: exposure },
    indexMaster: { count: index.length, entries: index },
    resolution: { count: resolution.length, entries: resolution },
    tickerMaster: { items: items.length, alphanumericKrCodes: alnum, generatedAt: tm.generatedAt || null }
  };
}

/* ========================= 실행 · 비교 ========================= */

const SUITES = {
  risk: async (mode) => runRiskSuite(readH10(mode)),
  mc: async () => runMcSuite(),
  master: async () => runMasterSuite()
};

function outFile(name, mode) { return path.join(OUT_DIR, `${name}.${mode}.json`); }

// 차이 목록 - 어떤 경로의 값이 어떻게 바뀌었는지 전부 남긴다(계획서 §42 measurement log의 입력).
function diffValues(a, b, prefix, out) {
  const pa = a === undefined ? null : a;
  const pb = b === undefined ? null : b;
  if (JSON.stringify(pa) === JSON.stringify(pb)) return out;
  const isObj = (v) => v && typeof v === 'object';
  if (isObj(pa) && isObj(pb) && Array.isArray(pa) === Array.isArray(pb)) {
    const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
    keys.forEach((k) => diffValues(pa[k], pb[k], prefix ? `${prefix}.${k}` : k, out));
    return out;
  }
  const delta = (typeof pa === 'number' && typeof pb === 'number') ? pb - pa : null;
  out.push({ path: prefix, before: pa, after: pb, absoluteDifference: delta, relativeDifference: (delta !== null && pa !== 0) ? delta / Math.abs(pa) : null });
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'run';
  const mode = (argv.find((a) => a.startsWith('--data=')) || '--data=frozen').split('=')[1];
  const only = (argv.find((a) => a.startsWith('--suite=')) || '').split('=')[1];
  const names = only ? [only] : Object.keys(SUITES);
  if (!['frozen', 'current'].includes(mode)) throw new Error(`--data는 frozen 또는 current다: ${mode}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = {};
  for (const name of names) {
    const started = Date.now();
    results[name] = await SUITES[name](mode);
    console.log(`  ▸ ${name} suite 실행 완료 (${Date.now() - started}ms)`);
  }

  if (cmd === 'baseline') {
    names.forEach((name) => {
      const payload = { suite: name, dataMode: mode, harnessVersion: 1, recordedAt: new Date().toISOString(), results: results[name] };
      // 기준선은 사람이 눈으로 비교하는 파일이 아니라 하네스가 읽는 파일이다(비교는 compare가 한다).
      // 들여쓰기를 넣으면 파일이 3배로 커져서 저장소만 무거워진다 - 차이 내용은 *.diff.json이 보여 준다.
      fs.writeFileSync(outFile(name, mode), `${JSON.stringify(payload)}\n`, 'utf8');
      console.log(`✓ 기준선 기록: ${path.relative(ROOT, outFile(name, mode))}`);
    });
    return 0;
  }

  if (cmd === 'compare') {
    let total = 0;
    names.forEach((name) => {
      const file = outFile(name, mode);
      if (!fs.existsSync(file)) { console.log(`✗ ${name}: 기준선 파일 없음 (${path.relative(ROOT, file)})`); total++; return; }
      const base = JSON.parse(fs.readFileSync(file, 'utf8'));
      const diffs = diffValues(base.results, JSON.parse(JSON.stringify(results[name])), '', []);
      total += diffs.length;
      if (diffs.length === 0) { console.log(`✓ ${name}: 기준선과 동일`); return; }
      console.log(`✗ ${name}: 차이 ${diffs.length}건`);
      diffs.slice(0, 40).forEach((d) => console.log(`    ${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`));
      if (diffs.length > 40) console.log(`    … 외 ${diffs.length - 40}건`);
      const dumpPath = path.join(OUT_DIR, `${name}.${mode}.diff.json`);
      fs.writeFileSync(dumpPath, `${JSON.stringify({ suite: name, dataMode: mode, comparedAt: new Date().toISOString(), diffs }, null, 2)}\n`, 'utf8');
      console.log(`    차이 전문: ${path.relative(ROOT, dumpPath)}`);
    });
    console.log(total === 0 ? '✓ 회귀 차이 없음' : `✗ 회귀 차이 합계 ${total}건 - 원인을 DATA / CODE / POLICY로 분류해 measurement log에 기록한다.`);
    return total === 0 ? 0 : 1;
  }

  // run - 사람이 읽는 요약만 출력한다.
  if (results.risk) {
    const p = results.risk.portfolio;
    console.log(`  Risk  score=${p.riskScore} vol=${p.portfolioVolatilityPct} VaR=${p.var95Pct} CVaR=${p.cvarPct} MDD=${p.portfolioMDDPct} corr=${p.weightedAvgCorrelation} beta=${JSON.stringify(p.portfolioBeta)}`);
    results.risk.holdings.forEach((h) => console.log(`        ${h.ticker}: bm=${h.benchmarkKey}/${h.benchmarkStatus} src=${h.benchmarkPriceSource} align=${h.benchmarkAlignment} beta=${JSON.stringify(h.beta)}/${h.betaStatus}`));
  }
  if (results.mc) {
    const r = results.mc.result || {};
    console.log(`  MC    errors=${JSON.stringify(results.mc.input.errors)} keys=${Object.keys(r).join(',')}`);
  }
  if (results.master) {
    console.log(`  Master EM=${results.master.exposureMaster.count} Index=${results.master.indexMaster.count} resolution=${results.master.resolution.count} tickerMaster=${results.master.tickerMaster.items}`);
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('✗ 하네스 실행 실패:', e && e.stack ? e.stack : e); process.exit(2); });
