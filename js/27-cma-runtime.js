/* -------------------------------------------------------------------------
 * 27. 장기 CMA 해석 - 앱 자산 성격 → CMA 자산군 → 변동성 · 상관계수 (체크리스트 §37)
 *    - 데이터는 js/26-cma-data.js(CMA_ACTIVE_SET, PM 승인된 세트만)에서만 읽는다. 여기서 숫자를 만들지 않는다.
 *    - 상관계수 우선순위: OFFICIAL_CMA_DIRECT → OFFICIAL_CMA_MAPPING → BENCHMARK_REFERENCE(등록된 Benchmark만).
 *      셋 다 없으면 값을 만들지 않고 오류를 돌려준다(최근 가격 상관 · 기관 평균 · 보간 대체 금지).
 *    - 순수 함수만 둔다(DOM · state 접근 없음) - Node 테스트가 set을 직접 넘겨 같은 코드를 검증한다.
 * ---------------------------------------------------------------------- */
const CMA_CORRELATION_SOURCE = Object.freeze({
  OFFICIAL_CMA_DIRECT: 'OFFICIAL_CMA_DIRECT',
  OFFICIAL_CMA_MAPPING: 'OFFICIAL_CMA_MAPPING',
  BENCHMARK_REFERENCE: 'BENCHMARK_REFERENCE'
});
// [§37-5 PM 확정 · 2026-09-17] 장기 MC 수익률 정책 - CMA 변동성 · 상관계수는 쓰고, CMA 기대수익률은 MC 직접 입력으로 쓰지 않는다
// (기존 Return Key 유지). Dataset의 수익률 정의가 확인되더라도 이 값은 별도 PM 정책 결정 없이 바꾸지 않는다.
const MC_CMA_RETURN_POLICY = Object.freeze({
  useCmaExpectedReturn: false,
  useCmaVolatility: true,
  useCmaCorrelation: true,
  returnSource: 'RETURN_KEY'
});
// 장기 MC 입력 방식의 버전 - 엔진 계산식(js/15 MC_MODEL_VERSION)과 별개로 "무엇을 입력으로 썼는가"를 결과에 남긴다.
const MC_INPUT_MODEL_VERSION = 'CMA-ASSET-CLASS-1';

function getActiveCmaSet(setOverride) {
  if (setOverride !== undefined) return setOverride;
  return (typeof CMA_ACTIVE_SET !== 'undefined') ? CMA_ACTIVE_SET : null;
}
function getActiveCmaSetVersion(setOverride) {
  const set = getActiveCmaSet(setOverride);
  return set ? set.setVersion : null;
}

function cmaDatasetMeta(ds) {
  if (!ds) return null;
  return {
    datasetId: ds.datasetId, version: ds.version, provider: ds.provider, sourceTitle: ds.sourceTitle, sourceUrl: ds.sourceUrl,
    asOfDate: ds.asOfDate, publishedAt: ds.publishedAt, horizonYears: ds.horizonYears, currency: ds.currency, role: ds.role,
    numberKind: ds.numberKind, returnDefinition: ds.returnDefinition, volatilityDefinition: ds.volatilityDefinition
  };
}
function cmaProviderClass(set, appClass, provider) {
  const ac = set && set.appClasses ? set.appClasses[appClass] : null;
  const p = ac && ac.providers ? ac.providers[provider] : null;
  return p || null;
}

/**
 * 앱 자산 성격 하나의 장기 CMA 위험 가정(ACTIVE 세트의 PRIMARY Dataset).
 * 반환: { status: 'MAPPED', appClass, cmaClass, volatilityPct, expectedReturnPct, returnUsableForMc, evidence, dataset }
 *     | { status: 'UNMAPPED', appClass, reason }
 *     | { status: 'NO_ACTIVE_SET' }
 */
function resolveCmaRiskForAppClass(appClass, setOverride) {
  const set = getActiveCmaSet(setOverride);
  if (!set || !set.primary) return { status: 'NO_ACTIVE_SET', appClass };
  const primary = set.primary;
  // [BOND-4 · §47-3] 자산 성격이 riskProvider를 지정하면 그 기관 Dataset에서 변동성을 읽는다.
  // PRIMARY(AllianzGI)에 한국 채권 자산군이 아예 없기 때문이며, 같은 ACTIVE 세트 안에 등록된
  // 공식 Dataset(J.P. Morgan LTCMA KRW)만 대상이다 - 세트 밖의 숫자를 끌어오지 않는다.
  const acDef = (set.appClasses && appClass) ? set.appClasses[appClass] : null;
  const riskProvider = (acDef && acDef.riskProvider) || primary.provider;
  const dataset = riskProvider === primary.provider
    ? primary
    : (set.benchmarks || []).find((b) => b.provider === riskProvider) || null;
  if (!dataset) {
    return { status: 'UNMAPPED', appClass, reason: `이 자산 성격이 지정한 기관("${riskProvider}")의 Dataset이 ACTIVE 세트에 없습니다.` };
  }
  const link = appClass ? cmaProviderClass(set, appClass, dataset.provider) : null;
  if (!link) {
    const reason = (set.unmapped && set.unmapped[appClass]) || '이 자산 성격에 연결된 장기 CMA 자산군이 없습니다.';
    return { status: 'UNMAPPED', appClass, reason };
  }
  const row = dataset.classes ? dataset.classes[link.class] : null;
  if (!row || typeof row.volatility !== 'number' || !Number.isFinite(row.volatility)) {
    return { status: 'UNMAPPED', appClass, reason: `ACTIVE Dataset에 "${link.class}" 값이 없습니다.` };
  }
  return {
    status: 'MAPPED', appClass, cmaClass: link.class,
    volatilityPct: row.volatility, expectedReturnPct: row.expectedReturn,
    // 기대수익률을 MC에 쓸 수 있는가는 PRIMARY Dataset에만 해당한다(§37-5) - Benchmark 숫자는
    // 상관 · 변동성 참조용이고, 여기서 수익률 경로를 열지 않는다.
    returnUsableForMc: dataset.role === 'PRIMARY' && dataset.returnUsableForMc === true,
    riskProvider: dataset.provider,
    evidence: link.evidence, dataset: cmaDatasetMeta(dataset)
  };
}

function directCorrelation(ds, classA, classB) {
  const c = ds && ds.correlation;
  if (!c) return undefined;
  if (c.kind === 'FULL') {
    const i = c.classes.indexOf(classA), j = c.classes.indexOf(classB);
    return (i >= 0 && j >= 0) ? c.matrix[i][j] : undefined;
  }
  if (c.kind === 'VERSUS_REFERENCE') {
    // 기준 자산군과 다른 자산군 사이의 값만 원문에 있다 - 두 자산군이 모두 기준이 아니면 원문 값이 없다.
    if (classA === c.referenceClass) return c.values[classB];
    if (classB === c.referenceClass) return c.values[classA];
  }
  return undefined;
}

/**
 * 두 앱 자산 성격 사이의 장기 상관계수와 그 출처.
 * 반환: { value, sourceType, dataset, classA, classB, evidence } | { error }
 */
function resolveCmaCorrelation(appClassA, appClassB, setOverride) {
  const set = getActiveCmaSet(setOverride);
  if (!set || !set.primary) return { error: 'NO_ACTIVE_SET' };
  const primary = set.primary;
  const pa = cmaProviderClass(set, appClassA, primary.provider);
  const pb = cmaProviderClass(set, appClassB, primary.provider);
  // 같은 성격 = 같은 CMA 자산군 - 자산군 자신과의 상관(대각 원소 1)이다.
  // [BOND-4 · §47-3] PRIMARY에 없고 Benchmark에만 있는 성격(채권)도 같은 규칙을 탄다. 원문 행렬의
  // 대각 원소는 부동소수점 때문에 1.0000000000000002처럼 나올 수 있는데, 그 값을 그대로 쓰면 상관행렬이
  // 양의 준정부호를 벗어나 분해가 깨진다 - 같은 자산군끼리는 정의상 1이므로 여기서 확정한다.
  if (appClassA === appClassB) {
    const self = pa || (set.benchmarks || []).map((b2) => cmaProviderClass(set, appClassA, b2.provider)).find(Boolean);
    if (self) {
      const ds = pa ? primary : ((set.benchmarks || []).find((b2) => cmaProviderClass(set, appClassA, b2.provider)) || primary);
      return { value: 1, sourceType: CMA_CORRELATION_SOURCE.OFFICIAL_CMA_DIRECT, dataset: cmaDatasetMeta(ds), classA: self.class, classB: self.class,
        evidence: '같은 CMA 자산군(상관행렬 대각 원소)' };
    }
  }
  // 1) PRIMARY 원문에 이 쌍의 값이 있다.
  if (pa && pb) {
    const v = directCorrelation(primary, pa.class, pb.class);
    if (typeof v === 'number' && Number.isFinite(v)) {
      return { value: v, sourceType: CMA_CORRELATION_SOURCE.OFFICIAL_CMA_DIRECT, dataset: cmaDatasetMeta(primary), classA: pa.class, classB: pb.class,
        evidence: `${primary.provider} 원문의 "${pa.class}"–"${pb.class}" 상관` };
    }
  }
  // 2) 기관 원문이 명시한 Mapping(등록된 것만).
  const mapping = (set.officialMappings || []).find((m) => m && Array.isArray(m.pair)
    && ((m.pair[0] === appClassA && m.pair[1] === appClassB) || (m.pair[0] === appClassB && m.pair[1] === appClassA))
    && typeof m.value === 'number' && Number.isFinite(m.value));
  if (mapping) {
    const ds = [primary].concat(set.benchmarks || []).find((d) => d.datasetId === mapping.datasetId) || null;
    if (ds) {
      return { value: mapping.value, sourceType: CMA_CORRELATION_SOURCE.OFFICIAL_CMA_MAPPING, dataset: cmaDatasetMeta(ds),
        classA: mapping.classes ? mapping.classes[0] : null, classB: mapping.classes ? mapping.classes[1] : null, evidence: mapping.evidence || null };
    }
  }
  // 3) 명시 등록된 Benchmark - 등록 순서대로, 원문 값을 그대로 쓴다.
  for (const b of (set.benchmarks || [])) {
    const ba = cmaProviderClass(set, appClassA, b.provider);
    const bb = cmaProviderClass(set, appClassB, b.provider);
    if (!ba || !bb) continue;
    const v = directCorrelation(b, ba.class, bb.class);
    if (typeof v === 'number' && Number.isFinite(v)) {
      return { value: v, sourceType: CMA_CORRELATION_SOURCE.BENCHMARK_REFERENCE, dataset: cmaDatasetMeta(b), classA: ba.class, classB: bb.class,
        evidence: `${b.provider} ${b.version} 원문의 "${ba.class}"–"${bb.class}" 상관(Benchmark)` };
    }
  }
  return { error: 'CORRELATION_SOURCE_MISSING' };
}

/**
 * MC instrument 목록의 변동성 · 상관행렬을 CMA로 만든다.
 * entries: [{ key, label, riskFree, appClass }] (assetOrder 순서)
 * 반환: { sigmaByKey, matrix, pairs, risk, errors }
 *   - riskFree 항목은 기존 §7 정책대로 σ=0 · 상관 0(결과에 영향 없음)이며 pairs에 넣지 않는다.
 */
function buildCmaRiskInputs(entries, setOverride) {
  const set = getActiveCmaSet(setOverride);
  const n = entries.length;
  const matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const sigmaByKey = {}, risk = {}, errors = [], pairs = [];
  entries.forEach((e) => {
    if (e.riskFree) { sigmaByKey[e.key] = 0; return; }
    const r = resolveCmaRiskForAppClass(e.appClass, set);
    risk[e.key] = r;
    if (r.status === 'MAPPED') sigmaByKey[e.key] = r.volatilityPct / 100;
    else errors.push({ key: e.key, label: e.label, code: r.status, appClass: e.appClass || null, reason: r.reason || null });
  });
  if (errors.length) return { sigmaByKey, matrix, pairs, risk, errors };
  const pairCache = new Map();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = entries[i], b = entries[j];
      if (a.riskFree || b.riskFree) continue;
      const cacheKey = [a.appClass, b.appClass].sort().join('|');
      let c = pairCache.get(cacheKey);
      if (!c) { c = resolveCmaCorrelation(a.appClass, b.appClass, set); pairCache.set(cacheKey, c); }
      if (c.error) {
        errors.push({ key: `${a.key}|${b.key}`, label: `${a.label} · ${b.label}`, code: c.error, appClass: cacheKey });
        continue;
      }
      matrix[i][j] = c.value;
      matrix[j][i] = c.value;
      pairs.push({ keyA: a.key, keyB: b.key, labelA: a.label, labelB: b.label, appClassA: a.appClass, appClassB: b.appClass,
        classA: c.classA, classB: c.classB, value: c.value, sourceType: c.sourceType, dataset: c.dataset, evidence: c.evidence });
    }
  }
  return { sigmaByKey, matrix, pairs, risk, errors };
}

// 화면 요약용 - 자산군 쌍 단위로 합친다(같은 자산군 쌍은 한 줄).
function summarizeCmaCorrelationPairs(pairs) {
  const byClass = new Map();
  (pairs || []).forEach((p) => {
    const k = [p.appClassA, p.appClassB].sort().join('|');
    if (!byClass.has(k)) byClass.set(k, Object.assign({ count: 0 }, p));
    byClass.get(k).count += 1;
  });
  const rows = Array.from(byClass.values());
  const counts = {};
  Object.values(CMA_CORRELATION_SOURCE).forEach((t) => { counts[t] = rows.filter((r) => r.sourceType === t).length; });
  return { rows, counts, benchmarkUsed: counts.BENCHMARK_REFERENCE > 0 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CMA_CORRELATION_SOURCE, MC_INPUT_MODEL_VERSION, MC_CMA_RETURN_POLICY, getActiveCmaSet, getActiveCmaSetVersion, resolveCmaRiskForAppClass,
    resolveCmaCorrelation, buildCmaRiskInputs, summarizeCmaCorrelationPairs
  };
}
