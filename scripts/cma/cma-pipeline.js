// CMA 자동 업데이트 Pipeline (체크리스트 §37 CMA-AUTO-01~06)
//   Source Registry → Check → Fetch → Parse → Validate → Diff → New Dataset Version → REVIEW(VERIFIED)
//   → PM Approval(approve) → ACTIVE(activate) → 이전 ACTIVE는 SUPERSEDED
//
// runCheck는 절대 active.json과 앱 런타임 파일(js/26-cma-data.js)을 건드리지 않는다 - 실패하든 새 자료를 찾든
// 앱 계산에 쓰는 세트는 PM 승인 → activate 명령으로만 바뀐다(자동 ACTIVE 금지).
'use strict';

const core = require('./cma-core.js');
const { createStore } = require('./cma-store.js');
const { fetchWithRetry, looksLikePdf, pdfToTextWithPdftotext } = require('./cma-fetch.js');
const { parseJpmLtcmaCsv } = require('./parsers/jpm-ltcma-csv.js');
const { parseAllianzgiCmaText } = require('./parsers/allianzgi-cma-text.js');

const { DATASET_STATUS, NUMBER_KIND, DATASET_ROLE, CHECK_RESULT, ERROR_CODE } = core;
const RUNTIME_FILE = 'js/26-cma-data.js';
const DAY_MS = 24 * 60 * 60 * 1000;

const toIso = (d) => new Date(d).toISOString();
const isoDay = (d) => toIso(d).slice(0, 10);
function httpDateToIsoDay(s) {
  const t = Date.parse(s || '');
  return Number.isNaN(t) ? null : isoDay(t);
}

// ----- 원문 → Dataset -------------------------------------------------------------------------------------------

function datasetsOfSource(store, sourceId) {
  return store.listDatasets().filter((d) => d.sourceId === sourceId);
}
function nextRevisionSuffix(existing, edition) {
  const same = existing.filter((d) => String(d.edition) === String(edition));
  return same.length === 0 ? '' : `-r${same.length + 1}`;
}

function buildAllianzDataset(source, parsed, fetched, nowIso, existing) {
  const rev = nextRevisionSuffix(existing, parsed.edition);
  return {
    datasetId: `AGI-LTCMA-${parsed.edition}-${parsed.currency}${rev}`,
    version: `AGI-${parsed.releaseYear}.${parsed.releaseQuarter}${rev}`,
    provider: source.provider,
    sourceId: source.sourceId,
    sourceTitle: `${source.sourceTitle} (Released in Q${parsed.releaseQuarter} ${parsed.releaseYear})`,
    sourceUrl: fetched.url,
    sourceType: source.sourceType,
    role: source.role,
    numberKind: numberKindFor(source),
    edition: parsed.edition,
    publishedAt: parsed.publishedAt,
    asOfDate: parsed.asOfDate,
    effectiveDate: parsed.asOfDate,
    horizonYears: parsed.horizonYears,
    currency: parsed.currency,
    returnDefinition: source.returnDefinition,
    volatilityDefinition: source.volatilityDefinition,
    methodologyUrl: source.methodologyUrl || fetched.url,
    retrievedAt: nowIso,
    verifiedAt: null,
    fileSha256: fetched.sha256,
    httpEtag: fetched.etag || null,
    httpLastModified: fetched.lastModified || null,
    assetClasses: parsed.assetClasses,
    expectedReturn: parsed.expectedReturn,
    volatility: parsed.volatility,
    correlationMatrix: parsed.correlationMatrix,
    sourceExtras: { hedgedToUsd: parsed.hedgedToUsd, changeVsPreviousQuarter: parsed.changeVsPreviousQuarter },
    evidence: {
      asOfDate: `원문 p.2 표 제목 "Assumptions as at … (in ${parsed.currency})" 및 출처 문구 "Data as at …"`,
      horizonYears: '원문 p.2 출처 문구 "The risk-return parameters assume an investment horizon of 10 years"',
      currency: '원문 p.2 "in USD terms" - 주식은 USD 비헤지, 채권 · 대체자산은 USD 또는 USD 헤지(* 표시)',
      publishedAt: '원문 마지막 쪽 발행 월 표기',
      expectedReturn: '원문 p.2 표 "10-year Expected Return p.a." 열',
      volatility: '원문 p.2 표 "10-year Expected Volatility p.a." 열',
      correlationMatrix: `원문 p.2 표 "CORRELATION Developed World Equities" 열 - 모든 값은 ${parsed.correlationMatrix.referenceClass}와의 상관이다`,
      assetClasses: '원문 p.5 "Asset Class Benchmarks" 표(자산군별 기준 지수)',
      returnDefinition: source.returnDefinitionEvidence || null
    }
  };
}

function buildJpmDataset(source, parsed, fetched, nowIso, existing) {
  const rev = nextRevisionSuffix(existing, parsed.edition);
  const verified = (source.verifiedEditions || {})[String(parsed.edition)] || null;
  const fileDay = httpDateToIsoDay(fetched.lastModified);
  return {
    datasetId: `JPM-LTCMA-${parsed.edition}-${source.currency}${rev}`,
    version: `JPM-${source.currency}-${parsed.edition}.1${rev}`,
    provider: source.provider,
    sourceId: source.sourceId,
    sourceTitle: verified ? verified.sourceTitle : `${source.sourceTitle} (edition ${parsed.edition} - 제목 · 기준일 확인 필요)`,
    sourceUrl: fetched.url,
    sourceType: source.sourceType,
    role: source.role,
    numberKind: numberKindFor(source),
    edition: parsed.edition,
    publishedAt: verified ? verified.publishedAt : (fileDay || null),
    // 이 데이터 파일에는 기준일이 없다 - PM이 원문 보고서로 확인한 edition만 기준일을 채운다(없으면 DISCOVERED로 남는다).
    asOfDate: verified ? verified.asOfDate : null,
    effectiveDate: verified ? verified.asOfDate : null,
    horizonYears: source.horizonYears,
    currency: source.currency,
    returnDefinition: source.returnDefinition,
    volatilityDefinition: source.volatilityDefinition,
    methodologyUrl: source.methodologyUrl,
    retrievedAt: nowIso,
    verifiedAt: null,
    fileSha256: fetched.sha256,
    httpEtag: fetched.etag || null,
    httpLastModified: fetched.lastModified || null,
    assetClasses: parsed.assetClasses,
    expectedReturn: parsed.expectedReturn,
    arithmeticReturn: parsed.arithmeticReturn,
    volatility: parsed.volatility,
    correlationMatrix: parsed.correlationMatrix,
    sourceExtras: { segments: parsed.segments, previousCompoundReturn: parsed.previousCompoundReturn, previousEdition: parsed.previousEdition },
    evidence: Object.assign({
      expectedReturn: `데이터 파일 머리글 "Compound Return ${parsed.edition} (%)" 열`,
      arithmeticReturn: `데이터 파일 머리글 "Arithmetic Return ${parsed.edition} (%)" 열`,
      volatility: '데이터 파일 머리글 "Annualized Volatility (%)" 열',
      correlationMatrix: '데이터 파일의 하삼각 상관행렬(대칭으로 펼쳐 저장, 값 변경 없음)',
      filePublisher: source.pageUrl ? `공식 페이지 ${source.pageUrl}의 interactive matrix가 이 파일을 불러온다` : null
    }, verified ? verified.evidence : { asOfDate: '데이터 파일에 기준일이 없고 이 edition은 아직 원문 보고서로 확인되지 않았다' })
  };
}

// 테스트 Source(testNumberKind)만 SYNTHETIC_TEST_DATA로 표시한다 - 실제 저장소는 이 값을 거부한다(validateDataset · saveNewDataset).
function numberKindFor(source) {
  if (source.testNumberKind === NUMBER_KIND.SYNTHETIC_TEST_DATA) return NUMBER_KIND.SYNTHETIC_TEST_DATA;
  return source.role === DATASET_ROLE.BENCHMARK ? NUMBER_KIND.BENCHMARK_REFERENCE : NUMBER_KIND.OFFICIAL_DATA;
}

const PARSERS = {
  'allianzgi-cma-text': { format: 'pdf', parse: parseAllianzgiCmaText, build: buildAllianzDataset },
  'jpm-ltcma-csv': { format: 'csv', parse: parseJpmLtcmaCsv, build: buildJpmDataset }
};

// ----- 확인(Check) --------------------------------------------------------------------------------------------

function activeDatasetIdSet(store) {
  const active = store.readActive();
  if (!active) return new Set();
  return new Set([active.primaryDatasetId].concat(active.benchmarkDatasetIds || []).filter(Boolean));
}
function baselineFor(store, sourceId) {
  const list = datasetsOfSource(store, sourceId);
  const activeIds = activeDatasetIdSet(store);
  return list.find((d) => activeIds.has(d.datasetId)) || list[list.length - 1] || null;
}

function editionRank(ed) {
  const m = /^(\d{4})Q([1-4])$/.exec(String(ed));
  if (m) return Number(m[1]) * 4 + Number(m[2]) - 1;
  return Number(ed) * 4;
}

async function toText(parserInfo, fetched, deps) {
  if (parserInfo.format === 'pdf') {
    if (!looksLikePdf(fetched.body)) {
      const e = new Error('받은 파일이 PDF가 아닙니다.');
      e.code = ERROR_CODE.SOURCE_AUTHENTICITY;
      throw e;
    }
    return (deps.pdfToText || pdfToTextWithPdftotext)(fetched.body);
  }
  return fetched.body.toString('utf8');
}

/**
 * 받은 원문 하나를 해석 · 검증 · 비교해 필요하면 새 Dataset으로 저장한다.
 * 반환: audit 항목에 들어갈 결과 필드
 */
async function processDocument(store, source, fetched, deps, nowIso) {
  const parserInfo = PARSERS[source.parser];
  if (!parserInfo) return { result: CHECK_RESULT.UPDATE_FAILED, errorCode: ERROR_CODE.PARSE_FAILED, errorMessage: `등록되지 않은 parser: ${source.parser}` };
  const existing = datasetsOfSource(store, source.sourceId);
  const baseline = baselineFor(store, source.sourceId);
  const previousVersion = baseline ? baseline.version : null;

  const sameFile = existing.find((d) => d.fileSha256 === fetched.sha256);
  if (sameFile) return { result: CHECK_RESULT.UNCHANGED, previousVersion, detectedVersion: sameFile.version, resultingStatus: sameFile.status };

  let parsed;
  try {
    const text = await toText(parserInfo, fetched, deps);
    parsed = parserInfo.parse(text);
  } catch (e) {
    return { result: CHECK_RESULT.UPDATE_FAILED, previousVersion, errorCode: e.code || ERROR_CODE.PARSE_FAILED, errorMessage: e.message, resultingStatus: 'ACTIVE_PRESERVED' };
  }
  const ds = parserInfo.build(source, parsed, fetched, nowIso, existing);
  const validation = core.validateDataset(ds, { requiredClasses: source.requiredClasses || [], allowSynthetic: !!deps.allowSynthetic });
  ds.contentHash = core.contentHash(ds);

  const dup = existing.find((d) => d.contentHash === ds.contentHash);
  if (dup) return { result: CHECK_RESULT.DUPLICATE, previousVersion, detectedVersion: dup.version, resultingStatus: dup.status };

  if (!validation.passed && !validation.reviewable) {
    const first = validation.issues[0];
    return {
      result: CHECK_RESULT.UPDATE_FAILED, previousVersion, detectedVersion: ds.version,
      errorCode: first.code, errorMessage: validation.issues.map((i) => i.message).slice(0, 5).join(' / '),
      resultingStatus: 'ACTIVE_PRESERVED'
    };
  }
  const diff = core.diffDatasets(baseline, ds);
  ds.validation = { passed: validation.passed, issues: validation.issues, minEigenvalue: ds.correlationMatrix.minEigenvalue === undefined ? null : ds.correlationMatrix.minEigenvalue };
  ds.diffFromPrevious = { previousDatasetId: baseline ? baseline.datasetId : null, changedFields: diff.changedFields };
  ds.status = validation.passed ? DATASET_STATUS.VERIFIED : DATASET_STATUS.DISCOVERED;
  ds.verifiedAt = validation.passed ? nowIso : null;
  ds.statusHistory = [{ status: ds.status, at: nowIso, by: 'cma-pipeline', note: validation.passed ? '자동 검증 통과 - PM 검토 대기' : '사람 확인 필요: ' + validation.issues.map((i) => i.code).join(', ') }];
  store.saveNewDataset(ds);
  return {
    result: validation.passed ? CHECK_RESULT.NEW_VERSION : CHECK_RESULT.REVIEW_REQUIRED,
    previousVersion, detectedVersion: ds.version, datasetId: ds.datasetId,
    changedFields: diff.changedFields.slice(0, 20).map((c) => c.field), changedFieldCount: diff.changedFields.length,
    errorCode: validation.passed ? null : validation.issues[0].code,
    errorMessage: validation.passed ? null : validation.issues.map((i) => i.message).join(' / '),
    resultingStatus: ds.status
  };
}

function quarterCandidates(source, fromEdition) {
  const d = source.discovery;
  if (!d || d.type !== 'QUARTERLY_URL_PATTERNS') return [];
  const m = /^(\d{4})Q([1-4])$/.exec(String(fromEdition));
  if (!m) return [];
  let y = Number(m[1]), q = Number(m[2]);
  const out = [];
  for (let i = 0; i < (d.lookAheadQuarters || 2); i++) {
    q += 1;
    if (q > 4) { q = 1; y += 1; }
    out.push({ edition: `${y}Q${q}`, urls: d.patterns.map((p) => p.replace('{yyyy}', String(y)).replace('{q}', String(q))) });
  }
  return out;
}

async function checkDatasetSource(store, source, deps, nowIso, registryHttp) {
  const entries = [];
  const base = { checkedAt: nowIso, provider: source.provider, sourceId: source.sourceId };
  let fetchedOk = false;
  // 1) 등록된 원문 주소 - 조건부 요청
  const validators = registryHttp[source.sourceUrl] || {};
  try {
    const f = await fetchWithRetry(source.sourceUrl, validators, deps.fetchOptions);
    fetchedOk = true;
    if (f.status === 'NOT_MODIFIED') {
      const b = baselineFor(store, source.sourceId);
      entries.push(Object.assign({}, base, { source: source.sourceUrl, result: CHECK_RESULT.UNCHANGED, previousVersion: b ? b.version : null, detectedVersion: b ? b.version : null, resultingStatus: b ? b.status : null, note: 'HTTP 304' }));
    } else {
      registryHttp[source.sourceUrl] = { etag: f.etag || null, lastModified: f.lastModified || null, sha256: f.sha256 };
      const out = await processDocument(store, source, Object.assign({ url: source.sourceUrl }, f), deps, nowIso);
      entries.push(Object.assign({}, base, { source: source.sourceUrl }, out));
    }
  } catch (e) {
    const b = baselineFor(store, source.sourceId);
    entries.push(Object.assign({}, base, { source: source.sourceUrl, result: CHECK_RESULT.UPDATE_FAILED, previousVersion: b ? b.version : null, errorCode: e.code || ERROR_CODE.DOWNLOAD_FAILED, errorMessage: e.message, attempts: e.attempts || null, resultingStatus: 'ACTIVE_PRESERVED' }));
  }
  // 2) 다음 발행 후보 주소(분기 CMA) - 가장 최근에 알고 있는 edition 다음 분기부터 확인한다.
  const known = datasetsOfSource(store, source.sourceId).map((d) => d.edition).filter(Boolean);
  if (source.discovery && known.length > 0) {
    const latest = known.sort((a, b) => editionRank(a) - editionRank(b))[known.length - 1];
    for (const cand of quarterCandidates(source, latest)) {
      let found = null;
      const attempts = [];
      for (const url of cand.urls) {
        try {
          const f = await fetchWithRetry(url, null, deps.fetchOptions);
          fetchedOk = true;
          if (f.status === 'OK' && looksLikePdf(f.body)) { found = Object.assign({ url }, f); break; }
          attempts.push(`${url} → PDF 아님`);
        } catch (e) {
          if (e.httpStatus === 404 || e.httpStatus === 410 || e.code === ERROR_CODE.SOURCE_UNAVAILABLE) { attempts.push(`${url} → HTTP ${e.httpStatus || '-'}`); continue; }
          attempts.push(`${url} → ${e.code}`);
          entries.push(Object.assign({}, base, { source: url, result: CHECK_RESULT.UPDATE_FAILED, errorCode: e.code || ERROR_CODE.DOWNLOAD_FAILED, errorMessage: e.message, resultingStatus: 'ACTIVE_PRESERVED' }));
        }
      }
      if (!found) {
        entries.push(Object.assign({}, base, { source: cand.urls.join(' | '), result: CHECK_RESULT.NO_NEW_SOURCE, detectedVersion: null, note: `${cand.edition} 발행 자료 없음` }));
        break; // 다음 분기가 없으면 그 뒤 분기도 없다
      }
      const out = await processDocument(store, source, found, deps, nowIso);
      entries.push(Object.assign({}, base, { source: found.url }, out));
      if (out.result === CHECK_RESULT.UPDATE_FAILED) break;
    }
  }
  return { entries, fetchedOk };
}

async function checkReferenceSource(source, deps, nowIso, registryHttp) {
  const base = { checkedAt: nowIso, provider: source.provider, sourceId: source.sourceId, source: source.sourceUrl };
  const prev = registryHttp[source.sourceUrl] || {};
  try {
    const f = await fetchWithRetry(source.sourceUrl, prev, deps.fetchOptions);
    if (f.status === 'NOT_MODIFIED') return { entries: [Object.assign(base, { result: CHECK_RESULT.REFERENCE_UNCHANGED, note: 'HTTP 304' })], fetchedOk: true };
    // 동적 웹페이지는 내용 hash가 매번 달라질 수 있어 HTTP 검증값이 있을 때만 변경 여부를 판정한다(PDF는 파일 hash).
    const isPdf = looksLikePdf(f.body);
    const now = { etag: f.etag || null, lastModified: f.lastModified || null, sha256: isPdf ? f.sha256 : null };
    let result = CHECK_RESULT.REFERENCE_UNCHANGED, note = null;
    const hadAny = prev.etag || prev.lastModified || prev.sha256;
    if (!hadAny) note = '첫 확인 - 기준값 기록';
    else if ((isPdf && prev.sha256 && prev.sha256 !== now.sha256) || (prev.etag && now.etag && prev.etag !== now.etag)
      || (prev.lastModified && now.lastModified && prev.lastModified !== now.lastModified)) {
      result = CHECK_RESULT.REFERENCE_CHANGED;
      note = '방법론 참고 문서가 바뀌었다 - 사람이 내용을 확인한다(Dataset은 만들지 않는다)';
    } else if (!now.etag && !now.lastModified && !isPdf) note = 'HTTP 검증값이 없는 페이지 - 접근 가능 여부만 확인';
    registryHttp[source.sourceUrl] = now;
    return { entries: [Object.assign(base, { result, note })], fetchedOk: true };
  } catch (e) {
    return { entries: [Object.assign(base, { result: CHECK_RESULT.UPDATE_FAILED, errorCode: e.code || ERROR_CODE.DOWNLOAD_FAILED, errorMessage: e.message })], fetchedOk: false };
  }
}

/**
 * 등록된 Source를 확인한다. options: { root, now, force, sourceIds, fetchImpl, pdfToText, fetchOptions, allowSynthetic }
 * 반환: { entries: audit 항목들, skipped: [sourceId] }
 */
async function runCheck(options) {
  const store = options.store || createStore(options.root, { allowSynthetic: options.allowSynthetic });
  const registry = store.readRegistry();
  if (!registry) throw new Error('data/cma/registry.json이 없습니다.');
  const now = options.now ? new Date(options.now) : new Date();
  const nowIso = toIso(now);
  const deps = { pdfToText: options.pdfToText, allowSynthetic: !!options.allowSynthetic, fetchOptions: Object.assign({ fetchImpl: options.fetchImpl }, options.fetchOptions || {}) };
  const activeBefore = JSON.stringify(store.readActive());
  const allEntries = [], skipped = [];
  registry.http = registry.http || {};
  for (const source of registry.sources) {
    if (!source.active) continue;
    if (options.sourceIds && !options.sourceIds.includes(source.sourceId)) continue;
    if (!options.force && source.lastCheckedAt && (now - Date.parse(source.lastCheckedAt)) < (source.checkFrequencyDays || 30) * DAY_MS) {
      skipped.push(source.sourceId);
      continue;
    }
    const { entries, fetchedOk } = source.kind === 'REFERENCE'
      ? await checkReferenceSource(source, deps, nowIso, registry.http)
      : await checkDatasetSource(store, source, deps, nowIso, registry.http);
    source.lastCheckedAt = nowIso;
    if (fetchedOk) source.lastSuccessfulFetchAt = nowIso;
    if (source.kind !== 'REFERENCE') {
      const latest = datasetsOfSource(store, source.sourceId).sort((a, b) => editionRank(a.edition) - editionRank(b.edition)).pop();
      source.lastDatasetVersion = latest ? latest.version : null;
    }
    entries.forEach((e) => { store.appendAudit(e); allEntries.push(e); });
  }
  store.writeRegistry(registry);
  // [안전장치] 확인 과정은 ACTIVE 세트를 절대 바꾸지 않는다.
  if (JSON.stringify(store.readActive()) !== activeBefore) throw new Error('확인 과정에서 ACTIVE 세트가 바뀌었습니다 - 중단합니다.');
  return { entries: allEntries, skipped };
}

// ----- PM 승인 · 활성화 ------------------------------------------------------------------------------------------

function approveDataset(options) {
  const store = options.store || createStore(options.root, { allowSynthetic: options.allowSynthetic });
  const { datasetId, approvedBy, note } = options;
  if (!approvedBy) throw new Error('승인자(--by)를 적어야 합니다.');
  if (!note) throw new Error('승인 근거(--note)를 적어야 합니다.');
  const nowIso = toIso(options.now || Date.now());
  return store.updateDatasetStatus(datasetId, (ds) => {
    if (ds.status === DATASET_STATUS.DISCOVERED) {
      if (!options.asOfDate) throw new Error(`${datasetId}은 기준일 확인이 필요합니다(--as-of YYYY-MM-DD, 원문 근거는 --as-of-evidence).`);
      if (!options.asOfEvidence) throw new Error('기준일 원문 근거(--as-of-evidence)를 적어야 합니다.');
      ds.asOfDate = options.asOfDate;
      ds.effectiveDate = options.asOfDate;
      ds.evidence = Object.assign({}, ds.evidence, { asOfDate: options.asOfEvidence });
      const v = core.validateDataset(ds, { allowSynthetic: !!options.allowSynthetic });
      if (!v.passed) throw new Error(`검증 실패: ${v.issues.map((i) => i.message).join(' / ')}`);
      ds.verifiedAt = nowIso;
      ds.statusHistory.push({ status: DATASET_STATUS.VERIFIED, at: nowIso, by: approvedBy, note: `기준일 확인: ${options.asOfEvidence}` });
    } else if (ds.status !== DATASET_STATUS.VERIFIED) {
      throw new Error(`${datasetId}의 상태가 ${ds.status}라 승인할 수 없습니다(VERIFIED만 승인 가능).`);
    }
    ds.status = DATASET_STATUS.APPROVED;
    ds.approval = { approvedBy, approvedAt: nowIso, note };
    ds.statusHistory.push({ status: DATASET_STATUS.APPROVED, at: nowIso, by: approvedBy, note });
    return ds;
  });
}

function nextSetVersion(active, primary) {
  const year = String(primary.edition).slice(0, 4);
  const history = (active && active.history) || [];
  const sameYear = history.filter((h) => String(h.setVersion).startsWith(`CMA-${year}.`)).length;
  return `CMA-${year}.${sameYear + 1}`;
}

function activateSet(options) {
  const store = options.store || createStore(options.root);
  const { primaryDatasetId, activatedBy, note } = options;
  const benchmarkDatasetIds = options.benchmarkDatasetIds || [];
  if (!activatedBy || !note) throw new Error('활성화 승인자(--by)와 근거(--note)를 적어야 합니다.');
  const nowIso = toIso(options.now || Date.now());
  const active = store.readActive();
  const currentIds = activeDatasetIdSet(store);
  const primary = store.readDataset(primaryDatasetId);
  if (!primary) throw new Error(`Dataset ${primaryDatasetId}이 없습니다.`);
  if (primary.role !== DATASET_ROLE.PRIMARY) throw new Error(`${primaryDatasetId}은 PRIMARY 역할이 아닙니다.`);
  const benchmarks = benchmarkDatasetIds.map((id) => {
    const d = store.readDataset(id);
    if (!d) throw new Error(`Dataset ${id}이 없습니다.`);
    if (d.role !== DATASET_ROLE.BENCHMARK) throw new Error(`${id}은 BENCHMARK 역할이 아닙니다.`);
    return d;
  });
  [primary].concat(benchmarks).forEach((d) => {
    const ok = d.status === DATASET_STATUS.APPROVED || (d.status === DATASET_STATUS.ACTIVE && currentIds.has(d.datasetId));
    if (!ok) throw new Error(`${d.datasetId}의 상태가 ${d.status}입니다 - PM 승인(APPROVED)된 Dataset만 활성화할 수 있습니다.`);
    const v = core.validateDataset(d, { allowSynthetic: !!options.allowSynthetic });
    if (!v.passed) throw new Error(`${d.datasetId} 재검증 실패: ${v.issues.map((i) => i.message).join(' / ')}`);
  });
  const newIds = new Set([primaryDatasetId].concat(benchmarkDatasetIds));
  const setVersion = nextSetVersion(active, primary);
  // 새로 들어가는 Dataset → ACTIVE, 빠지는 Dataset → SUPERSEDED(삭제하지 않는다)
  newIds.forEach((id) => {
    if (currentIds.has(id)) return;
    store.updateDatasetStatus(id, (ds) => {
      ds.status = DATASET_STATUS.ACTIVE;
      ds.statusHistory.push({ status: DATASET_STATUS.ACTIVE, at: nowIso, by: activatedBy, note: `${setVersion} 활성화: ${note}` });
      return ds;
    });
  });
  currentIds.forEach((id) => {
    if (newIds.has(id)) return;
    store.updateDatasetStatus(id, (ds) => {
      ds.status = DATASET_STATUS.SUPERSEDED;
      ds.statusHistory.push({ status: DATASET_STATUS.SUPERSEDED, at: nowIso, by: activatedBy, note: `${setVersion}으로 교체됨` });
      return ds;
    });
  });
  const history = ((active && active.history) || []).map((h) => (h.supersededAt ? h : Object.assign({}, h, { supersededAt: nowIso })));
  const entry = { setVersion, primaryDatasetId, benchmarkDatasetIds, activatedAt: nowIso, activatedBy, note };
  history.push(entry);
  const next = Object.assign({ schemaVersion: 1 }, entry, { history });
  store.writeActive(next);
  store.appendAudit({ checkedAt: nowIso, provider: primary.provider, sourceId: primary.sourceId, source: 'activate', result: 'ACTIVATED',
    previousVersion: active ? active.setVersion : null, detectedVersion: setVersion, resultingStatus: DATASET_STATUS.ACTIVE, note });
  buildRuntime({ store });
  return next;
}

// ----- 앱 런타임 파일 생성 ---------------------------------------------------------------------------------------

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}
const META_KEYS = ['datasetId', 'version', 'provider', 'sourceTitle', 'sourceUrl', 'sourceType', 'role', 'numberKind', 'edition',
  'publishedAt', 'asOfDate', 'effectiveDate', 'horizonYears', 'currency', 'returnDefinition', 'volatilityDefinition',
  'methodologyUrl', 'retrievedAt', 'verifiedAt', 'fileSha256'];

function runtimeDataset(ds, classes) {
  const out = pick(ds, META_KEYS);
  const used = ds.assetClasses.filter((c) => classes.has(c));
  out.returnUsableForMc = ds.role === DATASET_ROLE.PRIMARY && ['COMPOUND', 'GEOMETRIC'].includes(ds.returnDefinition);
  out.classes = {};
  used.forEach((c) => { out.classes[c] = { expectedReturn: ds.expectedReturn[c], volatility: ds.volatility[c] }; });
  const corr = ds.correlationMatrix;
  if (corr.kind === core.CORRELATION_KIND.FULL) {
    const idx = used.map((c) => corr.classes.indexOf(c));
    out.correlation = { kind: corr.kind, classes: used, matrix: idx.map((i) => idx.map((j) => corr.matrix[i][j])) };
  } else {
    const values = {};
    used.forEach((c) => { values[c] = corr.values[c]; });
    out.correlation = { kind: corr.kind, referenceClass: corr.referenceClass, values };
  }
  return out;
}

function buildRuntime(options) {
  const store = options.store || createStore(options.root);
  const active = store.readActive();
  const map = store.readAssetClassMap();
  let payload = null;
  if (active) {
    const primary = store.readDataset(active.primaryDatasetId);
    const benchmarks = (active.benchmarkDatasetIds || []).map((id) => store.readDataset(id));
    const classesFor = (provider, extra) => {
      const s = new Set(extra || []);
      Object.values(map.appClasses).forEach((ac) => { const p = ac.providers[provider]; if (p) s.add(p.class); });
      return s;
    };
    const primaryExtra = primary.correlationMatrix.kind === core.CORRELATION_KIND.VERSUS_REFERENCE ? [primary.correlationMatrix.referenceClass] : [];
    payload = {
      setVersion: active.setVersion,
      activatedAt: active.activatedAt,
      activatedBy: active.activatedBy,
      activationNote: active.note,
      primary: runtimeDataset(primary, classesFor(primary.provider, primaryExtra)),
      benchmarks: benchmarks.map((b) => runtimeDataset(b, classesFor(b.provider))),
      appClasses: map.appClasses,
      officialMappings: map.officialMappings || [],
      unmapped: map.unmapped || {}
    };
  }
  const header = [
    '/* -------------------------------------------------------------------------',
    ' * 26. 장기 CMA 데이터 (자동 생성 파일 - 직접 고치지 않는다)',
    ' *    - 생성: node scripts/cma-update.js activate … (PM 승인된 Dataset만) / build',
    ' *    - 원본: data/cma/active.json · data/cma/datasets/*.json · data/cma/app-asset-class-map.json',
    ' *    - 숫자는 원문 값 그대로이며, 앱이 연결하는 자산군만 담는다(체크리스트 §37).',
    ' * ---------------------------------------------------------------------- */'
  ].join('\n');
  const body = `const CMA_ACTIVE_SET = ${payload ? JSON.stringify(payload, null, 2) : 'null'};\n`;
  const exportGuard = "\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = { CMA_ACTIVE_SET };\n}\n";
  store.writeText(RUNTIME_FILE, `${header}\n${body}${exportGuard}`);
  return payload;
}

module.exports = { runCheck, approveDataset, activateSet, buildRuntime, processDocument, quarterCandidates, RUNTIME_FILE };
