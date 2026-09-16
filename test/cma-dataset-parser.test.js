// CMA Dataset 스키마 · 검증 · Diff · 원문 해석기 테스트 (체크리스트 §37). 실행: node --test test/cma-dataset-parser.test.js
// 숫자는 전부 SYNTHETIC_TEST_DATA(test/cma-fixtures.js) - 실제 원문 수치 확인은 test/cma-active-data.test.js가 맡는다.
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const core = require(path.join(__dirname, '..', 'scripts', 'cma', 'cma-core.js'));
const { parseJpmLtcmaCsv } = require(path.join(__dirname, '..', 'scripts', 'cma', 'parsers', 'jpm-ltcma-csv.js'));
const { parseAllianzgiCmaText } = require(path.join(__dirname, '..', 'scripts', 'cma', 'parsers', 'allianzgi-cma-text.js'));
const { createStore } = require(path.join(__dirname, '..', 'scripts', 'cma', 'cma-store.js'));
const fx = require('./cma-fixtures.js');

function synDataset(over = {}) {
  const p = parseJpmLtcmaCsv(fx.synJpmCsv());
  return Object.assign({
    datasetId: 'SYN-B-2031', version: 'SYN-B-2031.1', provider: 'Synthetic Provider B', sourceId: 'SYN_JPM',
    sourceTitle: 'Synthetic Matrix', sourceUrl: 'https://example.test/m.csv', sourceType: 'OFFICIAL_DATA_DOWNLOAD',
    role: 'BENCHMARK', numberKind: fx.SYN, edition: 2031, publishedAt: '2030-10-20', asOfDate: '2030-09-30', effectiveDate: '2030-09-30',
    horizonYears: { min: 10, max: 15 }, currency: 'KRW', returnDefinition: 'COMPOUND', volatilityDefinition: 'syn',
    retrievedAt: '2031-01-15T00:00:00.000Z', fileSha256: 'a'.repeat(64),
    assetClasses: p.assetClasses, expectedReturn: p.expectedReturn, arithmeticReturn: p.arithmeticReturn, volatility: p.volatility,
    correlationMatrix: p.correlationMatrix
  }, over);
}
const codes = (v) => v.issues.map((i) => i.code);

/* ── 해석기 ─────────────────────────────────────────────────────────────── */

test('P-1. J.P. Morgan 형식 CSV - edition · 자산군 · 복리/산술/변동성 · 하삼각을 대칭 행렬로 그대로 읽는다(NBSP 정리)', () => {
  const p = parseJpmLtcmaCsv(fx.synJpmCsv());
  assert.strictEqual(p.edition, 2031);
  assert.deepStrictEqual(p.assetClasses, ['Alpha Equity', 'Beta Equity', 'Gamma Bond']);
  assert.strictEqual(p.expectedReturn['Beta Equity'], 4);
  assert.strictEqual(p.arithmeticReturn['Alpha Equity'], 6);
  assert.strictEqual(p.volatility['Gamma Bond'], 5);
  assert.deepStrictEqual(p.correlationMatrix.matrix, [[1, 0.5, 0.1], [0.5, 1, 0.2], [0.1, 0.2, 1]]);
});

test('P-2. J.P. Morgan 형식 CSV - 머리글 · 열 개수 · 숫자 · 연도가 예상과 다르면 추측하지 않고 실패한다', () => {
  const good = fx.synJpmCsv();
  const bad = [
    good.replace('Annualized Volatility (%)', 'Volatility'),
    good.replace('Compound Return 2030 (%)', 'Compound Return 2029 (%)'),
    good.replace('0.5,1.0,Gamma Bond', '0.5,1.0,0.3,Gamma Bond'),
    good.replace('EQUITIES,Alpha Equity,5,', 'EQUITIES,Alpha Equity,abc,').replace('Alpha Equity,5,', 'Alpha Equity,x,'),
    good.split('\r\n').slice(0, 2).join('\r\n').replace('Beta Equity', 'Wrong Next'),
    ''
  ];
  bad.forEach((txt, i) => assert.throws(() => parseJpmLtcmaCsv(txt), (e) => e.code === 'PARSE_FAILED', `case ${i}`));
});

test('P-3. AllianzGI 형식 텍스트 - 분기 · 기준일 · 통화 · 기간 · 발행 월 · 행 · Developed World 기준 상관을 읽는다(화살표 기호 무시)', () => {
  const p = parseAllianzgiCmaText(fx.synAgiText());
  assert.strictEqual(p.edition, '2031Q1');
  assert.strictEqual(p.asOfDate, '2030-12-31');
  assert.strictEqual(p.currency, 'USD');
  assert.strictEqual(p.horizonYears, 10);
  assert.strictEqual(p.publishedAt, '2031-02');
  assert.strictEqual(p.assetClasses.length, 10);
  assert.strictEqual(p.expectedReturn['Korea Equities'], 6);
  assert.strictEqual(p.volatility['Korea Equities'], 25);
  assert.strictEqual(p.correlationMatrix.referenceClass, 'Developed World Equities');
  assert.strictEqual(p.correlationMatrix.values['Korea Equities'], 0.8);
  assert.strictEqual(p.correlationMatrix.values['Developed World Equities'], 1);
  assert.strictEqual(p.hedgedToUsd['Synthetic Bond One'], true);
  assert.strictEqual(p.changeVsPreviousQuarter['Developed World Equities'].expectedReturn, -0.2);
});

test('P-4. AllianzGI 형식 텍스트 - 기준일 불일치 · 기간 없음 · 표 없음 · 기준 행 없음 · 중복 행이면 실패한다', () => {
  const t = fx.synAgiText();
  const bad = [
    t.replace('Data as at 31 December 2030', 'Data as at 30 September 2030'),
    t.replace('investment horizon of', 'investment period of'),
    t.replace(/^.*%.*$/gm, ''),
    fx.synAgiText({ dropRow: 'Developed World Equities' }),
    fx.synAgiText({ extraRow: 'Korea Equities 6.0%  -0.3% 25.0% 0.0% 0.80' }),
    t.replace('RELEASED IN Q1 2031', 'RELEASED 2031'),
    'hello'
  ];
  bad.forEach((txt, i) => assert.throws(() => parseAllianzgiCmaText(txt), (e) => e.code === 'PARSE_FAILED', `case ${i}`));
});

/* ── Dataset 검증 ───────────────────────────────────────────────────────── */

test('D-1. 정상 Dataset은 통과하고, 전체 행렬의 최소 고유값을 기록한다(값은 바꾸지 않는다)', () => {
  const ds = synDataset();
  const before = JSON.stringify(ds.correlationMatrix.matrix);
  const v = core.validateDataset(ds, { requiredClasses: ['Alpha Equity'], allowSynthetic: true });
  assert.deepStrictEqual(v.issues, []);
  assert.strictEqual(v.passed, true);
  assert.ok(ds.correlationMatrix.minEigenvalue > 0);
  assert.strictEqual(JSON.stringify(ds.correlationMatrix.matrix), before);
});

test('D-2. 메타데이터 누락 · 잘못된 날짜 · 통화 · 기간 · https 아님은 실패', () => {
  assert.ok(codes(core.validateDataset(synDataset({ provider: '' }), { allowSynthetic: true })).includes('METADATA_MISSING'));
  assert.ok(codes(core.validateDataset(synDataset({ asOfDate: '2030-13-40' }), { allowSynthetic: true })).includes('INVALID_DATE'));
  assert.ok(codes(core.validateDataset(synDataset({ asOfDate: '2032-01-01' }), { allowSynthetic: true })).includes('INVALID_DATE'));
  assert.ok(codes(core.validateDataset(synDataset({ currency: 'won' }), { allowSynthetic: true })).includes('METADATA_MISSING'));
  assert.ok(codes(core.validateDataset(synDataset({ horizonYears: { min: 15, max: 10 } }), { allowSynthetic: true })).includes('INVALID_NUMBER'));
  assert.ok(codes(core.validateDataset(synDataset({ sourceUrl: 'http://example.test/x' }), { allowSynthetic: true })).includes('SOURCE_AUTHENTICITY'));
});

test('D-3. 기준일만 확인되지 않은 Dataset은 "사람 확인 필요"(reviewable)로 구분한다', () => {
  const v = core.validateDataset(synDataset({ asOfDate: null, effectiveDate: null }), { allowSynthetic: true });
  assert.strictEqual(v.passed, false);
  assert.strictEqual(v.reviewable, true);
  assert.deepStrictEqual(codes(v), ['AS_OF_DATE_UNVERIFIED']);
});

test('D-4. 값 누락 · 숫자 아님 · 범위 밖 · 필수 자산군 없음 · 중복 자산군은 실패', () => {
  const miss = synDataset(); miss.volatility = Object.assign({}, miss.volatility); delete miss.volatility['Beta Equity'];
  assert.ok(codes(core.validateDataset(miss, { allowSynthetic: true })).includes('MISSING_VALUE'));
  const nan = synDataset(); nan.expectedReturn = Object.assign({}, nan.expectedReturn, { 'Beta Equity': NaN });
  assert.ok(codes(core.validateDataset(nan, { allowSynthetic: true })).includes('INVALID_NUMBER'));
  const big = synDataset(); big.expectedReturn = Object.assign({}, big.expectedReturn, { 'Beta Equity': 400 });
  assert.ok(codes(core.validateDataset(big, { allowSynthetic: true })).includes('INVALID_NUMBER'));
  assert.ok(codes(core.validateDataset(synDataset(), { requiredClasses: ['Korea Equities'], allowSynthetic: true })).includes('MAPPING_FAILURE'));
  const dup = synDataset({ assetClasses: ['Alpha Equity', 'Alpha Equity', 'Gamma Bond'] });
  assert.ok(codes(core.validateDataset(dup, { allowSynthetic: true })).includes('INVALID_ASSET_CLASS'));
});

test('D-5. 상관행렬 - 차원 · 대칭 · 대각 1 · 범위 · finite · PSD를 각각 잡는다', () => {
  const withMatrix = (m) => { const ds = synDataset(); ds.correlationMatrix = Object.assign({}, ds.correlationMatrix, { matrix: m }); return ds; };
  const c = (m) => codes(core.validateDataset(withMatrix(m), { allowSynthetic: true }));
  assert.ok(c([[1, 0.5], [0.5, 1]]).includes('MATRIX_DIMENSION'));
  assert.ok(c([[1, 0.5, 0.1], [0.4, 1, 0.2], [0.1, 0.2, 1]]).includes('MATRIX_NOT_SYMMETRIC'));
  assert.ok(c([[0.9, 0.5, 0.1], [0.5, 1, 0.2], [0.1, 0.2, 1]]).includes('MATRIX_DIAGONAL'));
  assert.ok(c([[1, 1.2, 0.1], [1.2, 1, 0.2], [0.1, 0.2, 1]]).includes('MATRIX_RANGE'));
  assert.ok(c([[1, NaN, 0.1], [NaN, 1, 0.2], [0.1, 0.2, 1]]).includes('INVALID_CORRELATION'));
  // 각 쌍은 [-1,1] 안이지만 함께 만족할 수 없는 조합(A≈B, A≈C, B≈-C) - PSD가 아니다.
  assert.ok(c([[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]]).includes('MATRIX_NOT_PSD'));
});

test('D-6. 기준 자산군 상관(VERSUS_REFERENCE) - 기준 자산군 없음 · 자기 상관 1 아님 · 값 누락을 잡는다', () => {
  const p = parseAllianzgiCmaText(fx.synAgiText());
  const base = synDataset({ assetClasses: p.assetClasses, expectedReturn: p.expectedReturn, volatility: p.volatility, correlationMatrix: p.correlationMatrix, currency: 'USD', horizonYears: 10 });
  assert.deepStrictEqual(core.validateDataset(base, { allowSynthetic: true }).issues, []);
  const noRef = JSON.parse(JSON.stringify(base)); noRef.correlationMatrix.referenceClass = 'Nope';
  assert.ok(codes(core.validateDataset(noRef, { allowSynthetic: true })).includes('INVALID_ASSET_CLASS'));
  const self = JSON.parse(JSON.stringify(base)); self.correlationMatrix.values['Developed World Equities'] = 0.9;
  assert.ok(codes(core.validateDataset(self, { allowSynthetic: true })).includes('MATRIX_DIAGONAL'));
  const miss = JSON.parse(JSON.stringify(base)); delete miss.correlationMatrix.values['Korea Equities'];
  assert.ok(codes(core.validateDataset(miss, { allowSynthetic: true })).includes('MISSING_VALUE'));
});

test('D-7. SYNTHETIC_TEST_DATA는 실제 저장소 검증 · 저장에서 거부된다', () => {
  assert.ok(codes(core.validateDataset(synDataset())).includes('SYNTHETIC_NOT_ALLOWED'));
  const root = fx.makeTempRoot();
  const store = createStore(root); // allowSynthetic 없음 = 실제 저장소와 같은 설정
  assert.throws(() => store.saveNewDataset(synDataset()), /SYNTHETIC_TEST_DATA/);
});

/* ── 저장소 · 버전 · Diff ─────────────────────────────────────────────────── */

test('S-1. 저장한 Dataset은 같은 id로 덮어쓸 수 없고, 상태 변경 때 숫자 · 출처는 바꿀 수 없다', () => {
  const root = fx.makeTempRoot();
  const store = createStore(root, { allowSynthetic: true });
  const ds = synDataset({ status: 'VERIFIED', statusHistory: [] });
  ds.contentHash = core.contentHash(ds);
  store.saveNewDataset(ds);
  assert.throws(() => store.saveNewDataset(ds), /덮어쓰지 않습니다/);
  assert.throws(() => store.updateDatasetStatus(ds.datasetId, (d) => { d.expectedReturn['Alpha Equity'] = 9; return d; }), /바꿀 수 없습니다/);
  assert.throws(() => store.updateDatasetStatus(ds.datasetId, (d) => { d.sourceUrl = 'https://other.test'; return d; }), /바꿀 수 없습니다/);
  const after = store.updateDatasetStatus(ds.datasetId, (d) => { d.status = 'APPROVED'; return d; });
  assert.strictEqual(after.status, 'APPROVED');
  assert.strictEqual(store.readDataset(ds.datasetId).expectedReturn['Alpha Equity'], 5);
});

test('S-2. contentHash는 수집 시각 · 상태 · 검증 부산물과 무관하고, 원문 값이 바뀌면 달라진다', () => {
  const a = synDataset();
  const b = synDataset({ retrievedAt: '2031-02-01T00:00:00.000Z', status: 'ACTIVE' });
  b.correlationMatrix = Object.assign({}, b.correlationMatrix, { minEigenvalue: 0.5 });
  assert.strictEqual(core.contentHash(a), core.contentHash(b));
  const c = synDataset();
  c.expectedReturn = Object.assign({}, c.expectedReturn, { 'Alpha Equity': 5.1 });
  assert.notStrictEqual(core.contentHash(a), core.contentHash(c));
});

test('S-3. Diff - 기준일 · 수익률 · 변동성 · 상관 · 자산군 변경을 필드 단위로 기록하고, 같으면 변경 없음', () => {
  const a = synDataset();
  assert.deepStrictEqual(core.diffDatasets(a, synDataset()).changedFields, []);
  const p = parseJpmLtcmaCsv(fx.synJpmCsv({ returns: { alpha: 5.5 }, corr: { ab: 0.6 } }));
  const b = synDataset({ asOfDate: '2031-09-30', expectedReturn: p.expectedReturn, arithmeticReturn: p.arithmeticReturn, correlationMatrix: p.correlationMatrix });
  const fields = core.diffDatasets(a, b).changedFields.map((f) => f.field);
  assert.ok(fields.includes('asOfDate'));
  assert.ok(fields.includes('expectedReturn.Alpha Equity'));
  assert.ok(fields.includes('arithmeticReturn.Alpha Equity'));
  assert.ok(fields.includes('correlation.Alpha Equity|Beta Equity'));
  const c = synDataset({ assetClasses: ['Alpha Equity', 'Beta Equity'] });
  assert.ok(core.diffDatasets(a, c).changedFields.some((f) => f.field === 'assetClasses'));
  assert.deepStrictEqual(core.diffDatasets(null, a).changedFields, [{ field: '*', before: null, after: 'NEW' }]);
});
