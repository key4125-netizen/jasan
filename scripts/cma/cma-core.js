// CMA(Capital Market Assumptions) Dataset 공통 규칙 - 스키마 · 검증 · 비교(Diff) · 내용 해시.
// 체크리스트 §37(PM 승인 2026-09-16)의 CMA-SRC · CMA-VER · CMA-AUTO 규칙을 코드로 옮긴 것이다.
//
// [이 파일이 하지 않는 것]
//   - 숫자를 만들거나 고치지 않는다. 검증에 실패한 값을 보정하지 않고 실패 사유만 돌려준다.
//   - 기관 간 평균 · 혼합을 하지 않는다. Dataset 하나는 한 기관 · 한 원문 파일의 값만 담는다.
//   - 네트워크 · 파일을 직접 다루지 않는다(cma-fetch.js · cma-store.js 담당).
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

// PSD 검사는 앱 엔진(js/15)의 고유값 분해를 그대로 쓴다 - 검증 기준과 실제 MC가 같은 계산을 본다.
const engine = require(path.join(__dirname, '..', '..', 'js', '15-monte-carlo-engine.js'));

const DATASET_STATUS = Object.freeze({
  DISCOVERED: 'DISCOVERED', // 받아서 읽었지만 사람이 확인해야 할 항목이 남음(예: 기준일 미확인)
  VERIFIED: 'VERIFIED', // 자동 검증 통과 - PM 검토 대기
  APPROVED: 'APPROVED', // PM 승인 - 아직 계산에 쓰이지 않음
  ACTIVE: 'ACTIVE', // 앱 계산에 쓰는 세트에 포함
  SUPERSEDED: 'SUPERSEDED', // 예전에 ACTIVE였고 새 Dataset으로 교체됨(삭제하지 않음)
  FAILED: 'FAILED' // 검증 실패 기록(계산에 쓰지 않음)
});

// 숫자의 종류(CMA-SRC-02). 실제 저장소에는 SYNTHETIC_TEST_DATA를 넣지 않는다.
const NUMBER_KIND = Object.freeze({
  OFFICIAL_DATA: 'OFFICIAL_DATA',
  BENCHMARK_REFERENCE: 'BENCHMARK_REFERENCE',
  SYNTHETIC_TEST_DATA: 'SYNTHETIC_TEST_DATA'
});

// 세트 안에서 Dataset이 맡는 역할. PRIMARY = 수익률 · 변동성 · 직접 상관, BENCHMARK = 상관 대체 참고값.
const DATASET_ROLE = Object.freeze({ PRIMARY: 'PRIMARY', BENCHMARK: 'BENCHMARK' });

const CORRELATION_SOURCE_TYPE = Object.freeze({
  OFFICIAL_CMA_DIRECT: 'OFFICIAL_CMA_DIRECT',
  OFFICIAL_CMA_MAPPING: 'OFFICIAL_CMA_MAPPING',
  BENCHMARK_REFERENCE: 'BENCHMARK_REFERENCE'
});

// 상관 정보의 형태 - FULL(전체 행렬, 예: J.P. Morgan) / VERSUS_REFERENCE(한 기준 자산과의 상관만, 예: AllianzGI).
const CORRELATION_KIND = Object.freeze({ FULL: 'FULL', VERSUS_REFERENCE: 'VERSUS_REFERENCE' });

// 확인 1회의 결과(Audit Log의 result).
const CHECK_RESULT = Object.freeze({
  NEW_VERSION: 'NEW_VERSION', // 새 Dataset 생성(VERIFIED 또는 DISCOVERED)
  UNCHANGED: 'UNCHANGED', // 원문이 바뀌지 않음 - 새 Dataset 없음
  DUPLICATE: 'DUPLICATE', // 이미 저장된 Dataset과 같은 내용 - 새 Dataset 없음
  NO_NEW_SOURCE: 'NO_NEW_SOURCE', // 다음 발행 후보 주소에 새 자료 없음
  UPDATE_FAILED: 'UPDATE_FAILED', // 다운로드 · 해석 · 검증 실패 - ACTIVE 유지
  REVIEW_REQUIRED: 'REVIEW_REQUIRED', // 자료는 받았지만 버전 · 출처 식별 등 사람 확인 필요 - ACTIVE 유지
  REFERENCE_CHANGED: 'REFERENCE_CHANGED', // 방법론 참고 문서가 바뀜(Dataset 아님)
  REFERENCE_UNCHANGED: 'REFERENCE_UNCHANGED'
});

const ERROR_CODE = Object.freeze({
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  TIMEOUT: 'TIMEOUT',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  PARSE_FAILED: 'PARSE_FAILED',
  PARSER_TOOL_UNAVAILABLE: 'PARSER_TOOL_UNAVAILABLE',
  MISSING_VALUE: 'MISSING_VALUE',
  INVALID_NUMBER: 'INVALID_NUMBER',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_ASSET_CLASS: 'INVALID_ASSET_CLASS',
  MAPPING_FAILURE: 'MAPPING_FAILURE',
  INVALID_CORRELATION: 'INVALID_CORRELATION',
  MATRIX_DIMENSION: 'MATRIX_DIMENSION',
  MATRIX_NOT_SYMMETRIC: 'MATRIX_NOT_SYMMETRIC',
  MATRIX_DIAGONAL: 'MATRIX_DIAGONAL',
  MATRIX_RANGE: 'MATRIX_RANGE',
  MATRIX_NOT_PSD: 'MATRIX_NOT_PSD',
  METADATA_MISSING: 'METADATA_MISSING',
  SOURCE_AUTHENTICITY: 'SOURCE_AUTHENTICITY',
  VERSION_UNIDENTIFIED: 'VERSION_UNIDENTIFIED',
  AS_OF_DATE_UNVERIFIED: 'AS_OF_DATE_UNVERIFIED',
  SYNTHETIC_NOT_ALLOWED: 'SYNTHETIC_NOT_ALLOWED'
});

// 사람이 확인하면 해소되는 문제(Dataset은 DISCOVERED로 남는다). 그 외 문제는 Dataset을 만들지 않는다.
const REVIEWABLE_ERROR_CODES = new Set([ERROR_CODE.AS_OF_DATE_UNVERIFIED]);

const REQUIRED_METADATA = [
  'datasetId', 'version', 'provider', 'sourceId', 'sourceTitle', 'sourceUrl', 'sourceType', 'role', 'numberKind',
  'publishedAt', 'asOfDate', 'effectiveDate', 'horizonYears', 'currency', 'returnDefinition', 'volatilityDefinition',
  'retrievedAt', 'fileSha256'
];

// 원문 수치의 허용 범위 - 해석 오류(열 밀림 · 단위 착오)를 잡기 위한 넓은 울타리이며, 경제적 판단 기준이 아니다.
const RANGE = Object.freeze({ RETURN_MIN: -20, RETURN_MAX: 40, VOL_MIN: 0, VOL_MAX: 150, HORIZON_MIN: 1, HORIZON_MAX: 50 });
const TOL = Object.freeze({ SYMMETRY: 1e-9, DIAGONAL: 1e-9, RANGE: 1e-12, PSD_MIN_EIGEN: -1e-8 });

function issue(code, message, field) {
  return { code, message, field: field || null };
}
const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))
  && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const isIsoMonthOrDate = (v) => isIsoDate(v) || (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function validateHorizon(h) {
  if (isFiniteNumber(h)) return h >= RANGE.HORIZON_MIN && h <= RANGE.HORIZON_MAX;
  if (h && typeof h === 'object') {
    return isFiniteNumber(h.min) && isFiniteNumber(h.max) && h.min >= RANGE.HORIZON_MIN && h.max <= RANGE.HORIZON_MAX && h.min <= h.max;
  }
  return false;
}

// 대칭 행렬의 최소 고유값. 앱 엔진의 Jacobi(최대 원소 회전)를 수렴할 만큼 넉넉한 반복 횟수로 부른다.
function minEigenvalue(matrix) {
  const n = matrix.length;
  const { eigenvalues } = engine.jacobiEigenDecomposition(matrix, Math.max(100, n * n * 30), 1e-12);
  return Math.min(...eigenvalues);
}

function validateFullMatrix(corr, classes, issues) {
  const m = corr.matrix;
  if (!Array.isArray(corr.classes) || corr.classes.length !== classes.length || corr.classes.some((c, i) => c !== classes[i])) {
    issues.push(issue(ERROR_CODE.MATRIX_DIMENSION, '상관행렬의 자산군 순서가 Dataset 자산군 순서와 다릅니다.', 'correlationMatrix.classes'));
    return;
  }
  const n = classes.length;
  if (!Array.isArray(m) || m.length !== n || m.some((row) => !Array.isArray(row) || row.length !== n)) {
    issues.push(issue(ERROR_CODE.MATRIX_DIMENSION, `상관행렬 크기가 ${n}×${n}이 아닙니다.`, 'correlationMatrix.matrix'));
    return;
  }
  let finite = true, symmetric = true, diagonal = true, inRange = true;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = m[i][j];
      if (!isFiniteNumber(v)) { finite = false; continue; }
      if (v < -1 - TOL.RANGE || v > 1 + TOL.RANGE) inRange = false;
      if (isFiniteNumber(m[j][i]) && Math.abs(v - m[j][i]) > TOL.SYMMETRY) symmetric = false;
    }
    if (isFiniteNumber(m[i][i]) && Math.abs(m[i][i] - 1) > TOL.DIAGONAL) diagonal = false;
  }
  if (!finite) issues.push(issue(ERROR_CODE.INVALID_CORRELATION, '상관행렬에 숫자가 아닌 값이 있습니다.', 'correlationMatrix.matrix'));
  if (!symmetric) issues.push(issue(ERROR_CODE.MATRIX_NOT_SYMMETRIC, '상관행렬이 대칭이 아닙니다.', 'correlationMatrix.matrix'));
  if (!diagonal) issues.push(issue(ERROR_CODE.MATRIX_DIAGONAL, '상관행렬 대각 원소가 1이 아닙니다.', 'correlationMatrix.matrix'));
  if (!inRange) issues.push(issue(ERROR_CODE.MATRIX_RANGE, '상관계수가 [-1, 1] 범위를 벗어났습니다.', 'correlationMatrix.matrix'));
  if (finite && symmetric && diagonal && inRange) {
    const minEig = minEigenvalue(m);
    corr.minEigenvalue = minEig;
    if (!(minEig >= TOL.PSD_MIN_EIGEN)) {
      issues.push(issue(ERROR_CODE.MATRIX_NOT_PSD, `상관행렬이 양의 준정부호(PSD)가 아닙니다(최소 고유값 ${minEig}).`, 'correlationMatrix.matrix'));
    }
  }
}

function validateVersusReference(corr, classes, issues) {
  if (!classes.includes(corr.referenceClass)) {
    issues.push(issue(ERROR_CODE.INVALID_ASSET_CLASS, `상관 기준 자산군 "${corr.referenceClass}"이 Dataset에 없습니다.`, 'correlationMatrix.referenceClass'));
    return;
  }
  const values = corr.values || {};
  const extra = Object.keys(values).filter((k) => !classes.includes(k));
  if (extra.length) issues.push(issue(ERROR_CODE.MATRIX_DIMENSION, `자산군 목록에 없는 상관값: ${extra.join(', ')}`, 'correlationMatrix.values'));
  classes.forEach((c) => {
    const v = values[c];
    if (v === undefined || v === null) issues.push(issue(ERROR_CODE.MISSING_VALUE, `"${c}"의 상관값이 없습니다.`, `correlationMatrix.values.${c}`));
    else if (!isFiniteNumber(v)) issues.push(issue(ERROR_CODE.INVALID_CORRELATION, `"${c}"의 상관값이 숫자가 아닙니다.`, `correlationMatrix.values.${c}`));
    else if (v < -1 - TOL.RANGE || v > 1 + TOL.RANGE) issues.push(issue(ERROR_CODE.MATRIX_RANGE, `"${c}"의 상관값 ${v}가 [-1, 1] 범위를 벗어났습니다.`, `correlationMatrix.values.${c}`));
  });
  const self = values[corr.referenceClass];
  if (isFiniteNumber(self) && Math.abs(self - 1) > TOL.DIAGONAL) {
    issues.push(issue(ERROR_CODE.MATRIX_DIAGONAL, `기준 자산군 자신과의 상관값이 1이 아닙니다(${self}).`, 'correlationMatrix.values'));
  }
}

/**
 * Dataset 하나를 검증한다. 값은 바꾸지 않는다(PSD 검사에서 얻은 최소 고유값만 correlationMatrix.minEigenvalue에 기록).
 * options.requiredClasses: 앱이 연결에 쓰는 자산군 이름 - 원문에 없으면 MAPPING_FAILURE.
 * options.allowSynthetic: 테스트 저장소에서만 true.
 * 반환: { passed, issues, reviewable } - reviewable은 "사람이 확인하면 해소되는 문제만 남았다"는 뜻.
 */
function validateDataset(ds, options) {
  options = options || {};
  const issues = [];
  if (!ds || typeof ds !== 'object') return { passed: false, reviewable: false, issues: [issue(ERROR_CODE.PARSE_FAILED, 'Dataset이 비어 있습니다.')] };

  REQUIRED_METADATA.forEach((k) => {
    const v = ds[k];
    // 기준일을 원문에서 확인하지 못한 경우는 아래 AS_OF_DATE_UNVERIFIED 하나로만 알린다(적용 시작일은 기준일에서 정해진다).
    if ((k === 'asOfDate' || k === 'effectiveDate') && (ds.asOfDate === null || ds.asOfDate === undefined) && (v === null || v === undefined)) return;
    if (v === undefined || v === null || v === '') issues.push(issue(ERROR_CODE.METADATA_MISSING, `메타데이터 "${k}"가 없습니다.`, k));
  });
  if (ds.numberKind === NUMBER_KIND.SYNTHETIC_TEST_DATA && !options.allowSynthetic) {
    issues.push(issue(ERROR_CODE.SYNTHETIC_NOT_ALLOWED, 'SYNTHETIC_TEST_DATA는 실제 CMA Dataset에 넣을 수 없습니다.', 'numberKind'));
  }
  if (ds.numberKind && !Object.values(NUMBER_KIND).includes(ds.numberKind)) issues.push(issue(ERROR_CODE.METADATA_MISSING, `알 수 없는 numberKind: ${ds.numberKind}`, 'numberKind'));
  if (ds.role && !Object.values(DATASET_ROLE).includes(ds.role)) issues.push(issue(ERROR_CODE.METADATA_MISSING, `알 수 없는 role: ${ds.role}`, 'role'));
  if (ds.sourceUrl && !/^https:\/\//.test(ds.sourceUrl)) issues.push(issue(ERROR_CODE.SOURCE_AUTHENTICITY, '원문 주소가 https가 아닙니다.', 'sourceUrl'));
  if (ds.asOfDate === null || ds.asOfDate === undefined) {
    issues.push(issue(ERROR_CODE.AS_OF_DATE_UNVERIFIED, '원문에서 기준일을 확인하지 못했습니다 - 사람이 원문을 확인해 기준일을 기록해야 합니다.', 'asOfDate'));
  } else if (!isIsoDate(ds.asOfDate)) {
    issues.push(issue(ERROR_CODE.INVALID_DATE, `기준일 형식이 올바르지 않습니다: ${ds.asOfDate}`, 'asOfDate'));
  }
  if (ds.publishedAt && !isIsoMonthOrDate(ds.publishedAt)) issues.push(issue(ERROR_CODE.INVALID_DATE, `발행일 형식이 올바르지 않습니다: ${ds.publishedAt}`, 'publishedAt'));
  if (ds.effectiveDate && !isIsoDate(ds.effectiveDate)) issues.push(issue(ERROR_CODE.INVALID_DATE, `적용 시작일 형식이 올바르지 않습니다: ${ds.effectiveDate}`, 'effectiveDate'));
  if (ds.retrievedAt && Number.isNaN(Date.parse(ds.retrievedAt))) issues.push(issue(ERROR_CODE.INVALID_DATE, `수집 시각 형식이 올바르지 않습니다: ${ds.retrievedAt}`, 'retrievedAt'));
  if (isIsoDate(ds.asOfDate) && ds.retrievedAt && !Number.isNaN(Date.parse(ds.retrievedAt))
      && Date.parse(ds.asOfDate + 'T00:00:00Z') > Date.parse(ds.retrievedAt)) {
    issues.push(issue(ERROR_CODE.INVALID_DATE, '기준일이 수집 시각보다 늦습니다.', 'asOfDate'));
  }
  if (ds.horizonYears !== undefined && !validateHorizon(ds.horizonYears)) issues.push(issue(ERROR_CODE.INVALID_NUMBER, `투자기간(horizonYears) 값이 올바르지 않습니다.`, 'horizonYears'));
  if (ds.currency && !/^[A-Z]{3}$/.test(ds.currency)) issues.push(issue(ERROR_CODE.METADATA_MISSING, `통화 코드가 올바르지 않습니다: ${ds.currency}`, 'currency'));
  if (ds.fileSha256 && !/^[0-9a-f]{64}$/.test(ds.fileSha256)) issues.push(issue(ERROR_CODE.METADATA_MISSING, '원문 파일 hash 형식이 올바르지 않습니다.', 'fileSha256'));

  const classes = Array.isArray(ds.assetClasses) ? ds.assetClasses : null;
  if (!classes || classes.length === 0) {
    issues.push(issue(ERROR_CODE.INVALID_ASSET_CLASS, '자산군 목록이 비어 있습니다.', 'assetClasses'));
  } else {
    const seen = new Set();
    classes.forEach((c) => {
      if (typeof c !== 'string' || !c.trim()) issues.push(issue(ERROR_CODE.INVALID_ASSET_CLASS, '이름이 없는 자산군이 있습니다.', 'assetClasses'));
      else if (seen.has(c)) issues.push(issue(ERROR_CODE.INVALID_ASSET_CLASS, `자산군 "${c}"이 중복됩니다.`, 'assetClasses'));
      seen.add(c);
    });
    const checkValue = (map, field, min, max, label) => {
      classes.forEach((c) => {
        const v = map ? map[c] : undefined;
        if (v === undefined || v === null) issues.push(issue(ERROR_CODE.MISSING_VALUE, `"${c}"의 ${label}이(가) 없습니다.`, `${field}.${c}`));
        else if (!isFiniteNumber(v)) issues.push(issue(ERROR_CODE.INVALID_NUMBER, `"${c}"의 ${label}이(가) 숫자가 아닙니다.`, `${field}.${c}`));
        else if (v < min || v > max) issues.push(issue(ERROR_CODE.INVALID_NUMBER, `"${c}"의 ${label} ${v}%가 허용 범위(${min}~${max})를 벗어났습니다.`, `${field}.${c}`));
      });
    };
    checkValue(ds.expectedReturn, 'expectedReturn', RANGE.RETURN_MIN, RANGE.RETURN_MAX, '기대수익률');
    checkValue(ds.volatility, 'volatility', RANGE.VOL_MIN, RANGE.VOL_MAX, '변동성');
    (options.requiredClasses || []).forEach((c) => {
      if (!classes.includes(c)) issues.push(issue(ERROR_CODE.MAPPING_FAILURE, `앱이 연결하는 자산군 "${c}"이 원문에 없습니다.`, 'assetClasses'));
    });
    const corr = ds.correlationMatrix;
    if (!corr || typeof corr !== 'object') issues.push(issue(ERROR_CODE.INVALID_CORRELATION, '상관 정보가 없습니다.', 'correlationMatrix'));
    else if (corr.kind === CORRELATION_KIND.FULL) validateFullMatrix(corr, classes, issues);
    else if (corr.kind === CORRELATION_KIND.VERSUS_REFERENCE) validateVersusReference(corr, classes, issues);
    else issues.push(issue(ERROR_CODE.INVALID_CORRELATION, `알 수 없는 상관 형태: ${corr.kind}`, 'correlationMatrix.kind'));
  }
  const reviewable = issues.length > 0 && issues.every((i) => REVIEWABLE_ERROR_CODES.has(i.code));
  return { passed: issues.length === 0, reviewable, issues };
}

// 내용 해시 - 수집 시각 · 상태처럼 "같은 자료인데 달라질 수 있는 값"은 빼고, 원문에서 온 값과 식별 정보만 넣는다.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}
const CONTENT_FIELDS = ['provider', 'sourceId', 'edition', 'asOfDate', 'horizonYears', 'currency', 'returnDefinition',
  'assetClasses', 'expectedReturn', 'arithmeticReturn', 'volatility', 'correlationMatrix'];
function contentOf(ds) {
  const out = {};
  CONTENT_FIELDS.forEach((k) => {
    if (k === 'correlationMatrix' && ds.correlationMatrix) {
      const rest = Object.assign({}, ds.correlationMatrix);
      delete rest.minEigenvalue; // 검증 부산물은 내용이 아니다
      out[k] = rest;
    } else out[k] = ds[k];
  });
  return out;
}
function contentHash(ds) {
  return crypto.createHash('sha256').update(stableStringify(contentOf(ds))).digest('hex');
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 두 Dataset(이전 → 새)의 차이. 반환: { changed, changedFields: [{ field, before, after }] }
 * 필드 이름 예: asOfDate · expectedReturn.Korea Equities · volatility.… · correlation.A|B · assetClasses(+X/-Y)
 */
function diffDatasets(prev, next) {
  const changedFields = [];
  if (!prev) return { changed: true, changedFields: [{ field: '*', before: null, after: 'NEW' }] };
  ['provider', 'sourceTitle', 'sourceUrl', 'edition', 'publishedAt', 'asOfDate', 'horizonYears', 'currency', 'returnDefinition', 'volatilityDefinition'].forEach((k) => {
    if (stableStringify(prev[k]) !== stableStringify(next[k])) changedFields.push({ field: k, before: prev[k] === undefined ? null : prev[k], after: next[k] === undefined ? null : next[k] });
  });
  const pc = prev.assetClasses || [], nc = next.assetClasses || [];
  const added = nc.filter((c) => !pc.includes(c)), removed = pc.filter((c) => !nc.includes(c));
  if (added.length || removed.length) changedFields.push({ field: 'assetClasses', before: removed, after: added });
  const common = nc.filter((c) => pc.includes(c));
  ['expectedReturn', 'arithmeticReturn', 'volatility'].forEach((f) => {
    common.forEach((c) => {
      const b = prev[f] ? prev[f][c] : undefined, a = next[f] ? next[f][c] : undefined;
      if (b !== a) changedFields.push({ field: `${f}.${c}`, before: b === undefined ? null : b, after: a === undefined ? null : a });
    });
  });
  const pairs = (ds) => {
    const out = new Map();
    const corr = ds.correlationMatrix;
    if (!corr) return out;
    if (corr.kind === CORRELATION_KIND.FULL) {
      corr.classes.forEach((a, i) => corr.classes.forEach((b, j) => { if (j < i) out.set(`${b}|${a}`, corr.matrix[i][j]); }));
    } else if (corr.kind === CORRELATION_KIND.VERSUS_REFERENCE) {
      Object.keys(corr.values || {}).forEach((c) => { if (c !== corr.referenceClass) out.set(`${c}|${corr.referenceClass}`, corr.values[c]); });
    }
    return out;
  };
  const pp = pairs(prev), np = pairs(next);
  np.forEach((v, k) => {
    const [a, b] = k.split('|');
    const before = pp.has(k) ? pp.get(k) : pp.get(`${b}|${a}`);
    if (before !== undefined && before !== v) changedFields.push({ field: `correlation.${k}`, before, after: v });
  });
  if ((prev.correlationMatrix || {}).kind !== (next.correlationMatrix || {}).kind) {
    changedFields.push({ field: 'correlationMatrix.kind', before: (prev.correlationMatrix || {}).kind || null, after: (next.correlationMatrix || {}).kind || null });
  }
  return { changed: changedFields.length > 0, changedFields };
}

module.exports = {
  DATASET_STATUS, NUMBER_KIND, DATASET_ROLE, CORRELATION_SOURCE_TYPE, CORRELATION_KIND, CHECK_RESULT, ERROR_CODE,
  REQUIRED_METADATA, RANGE, validateDataset, contentHash, sha256, diffDatasets, stableStringify, isIsoDate, minEigenvalue
};
