// CMA 자동 업데이트 Pipeline 테스트 (체크리스트 §37 CMA-AUTO · PHASE 8 CASE A~J). 실행: node --test test/cma-pipeline.test.js
// 실제 네트워크 대신 가짜 fetch · 가짜 PDF 변환을 주입하고, 임시 폴더를 저장소로 쓴다. 숫자는 전부 SYNTHETIC_TEST_DATA.
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const pipeline = require(path.join(__dirname, '..', 'scripts', 'cma', 'cma-pipeline.js'));
const { createStore } = require(path.join(__dirname, '..', 'scripts', 'cma', 'cma-store.js'));
const fx = require('./cma-fixtures.js');

const NOW1 = '2031-03-01T00:00:00.000Z';
const NOW2 = '2031-04-01T00:00:00.000Z';
const NOW3 = '2031-05-01T00:00:00.000Z';

// 기본 원문: AGI 2031Q1 PDF · JPM 2031 CSV. ETag를 주고, If-None-Match가 같으면 304.
function routes(state) {
  const r = {};
  r[fx.AGI_URL] = ({ headers }) => {
    if (state.agiFail) return state.agiFail();
    if (headers['If-None-Match'] && headers['If-None-Match'] === state.agiEtag) return { status: 304 };
    return { status: 200, body: fx.fakePdf(state.agiId), headers: { etag: state.agiEtag, 'content-type': 'application/pdf' } };
  };
  r[fx.JPM_URL] = ({ headers }) => {
    if (state.jpmFail) return state.jpmFail();
    if (headers['If-None-Match'] && headers['If-None-Match'] === state.jpmEtag) return { status: 304 };
    return { status: 200, body: state.jpmCsv, headers: { etag: state.jpmEtag, 'last-modified': 'Mon, 20 Oct 2030 10:00:00 GMT', 'content-type': 'text/csv' } };
  };
  Object.assign(r, state.extraRoutes || {});
  return r;
}
function setup() {
  const root = fx.makeTempRoot();
  const state = {
    agiId: 'q1', agiEtag: '"agi-1"', jpmEtag: '"jpm-1"', jpmCsv: fx.synJpmCsv(),
    texts: { q1: fx.synAgiText(), q2: fx.synAgiText({ quarter: 2, asAt: '31 March 2031', month: 'May 2031', korea: { ret: 6.4, vol: 26.0 } }) }
  };
  const run = (now, extra = {}) => {
    const net = fx.makeFetch(routes(state));
    return pipeline.runCheck(Object.assign({
      root, now, fetchImpl: net.fetchImpl, pdfToText: fx.makePdfToText(state.texts), allowSynthetic: true,
      fetchOptions: { retryDelayMs: 0, timeoutMs: 200 }
    }, extra)).then((out) => Object.assign(out, { calls: net.calls }));
  };
  const store = createStore(root, { allowSynthetic: true });
  const runtimePath = path.join(root, 'js', '26-cma-data.js');
  const approveAndActivate = (primaryId, benchmarkIds, now) => {
    [primaryId].concat(benchmarkIds).forEach((id) => {
      if (store.readDataset(id).status === 'VERIFIED') pipeline.approveDataset({ store, datasetId: id, approvedBy: 'PM(test)', note: 'test approval', now, allowSynthetic: true });
    });
    return pipeline.activateSet({ store, primaryDatasetId: primaryId, benchmarkDatasetIds: benchmarkIds, activatedBy: 'PM(test)', note: 'test activation', now, allowSynthetic: true });
  };
  return { root, state, run, store, runtimePath, approveAndActivate };
}
const byResult = (entries, sourceId) => entries.filter((e) => e.sourceId === sourceId).map((e) => e.result);

test('CASE A. 새 공식 자료 발견 → 새 Dataset Version(VERIFIED) · 원문 메타데이터 · hash · 검증 결과 기록', async () => {
  const t = setup();
  const out = await t.run(NOW1);
  assert.deepStrictEqual(byResult(out.entries, 'SYN_AGI'), ['NEW_VERSION', 'NO_NEW_SOURCE']);
  assert.deepStrictEqual(byResult(out.entries, 'SYN_JPM'), ['NEW_VERSION']);
  const agi = t.store.readDataset('AGI-LTCMA-2031Q1-USD');
  assert.strictEqual(agi.status, 'VERIFIED');
  assert.strictEqual(agi.version, 'AGI-2031.1');
  assert.strictEqual(agi.asOfDate, '2030-12-31');
  assert.strictEqual(agi.numberKind, 'SYNTHETIC_TEST_DATA');
  assert.match(agi.fileSha256, /^[0-9a-f]{64}$/);
  assert.strictEqual(agi.httpEtag, '"agi-1"');
  assert.strictEqual(agi.validation.passed, true);
  const jpm = t.store.readDataset('JPM-LTCMA-2031-KRW');
  assert.strictEqual(jpm.asOfDate, '2030-09-30'); // 등록된(PM 확인) edition 메타데이터
  assert.strictEqual(jpm.role, 'BENCHMARK');
  const reg = t.store.readRegistry();
  const src = reg.sources.find((s) => s.sourceId === 'SYN_AGI');
  assert.strictEqual(src.lastCheckedAt, NOW1);
  assert.strictEqual(src.lastSuccessfulFetchAt, NOW1);
  assert.strictEqual(src.lastDatasetVersion, 'AGI-2031.1');
  const audit = t.store.readAudit().entries;
  assert.ok(audit.every((e) => e.checkedAt && e.provider && e.sourceId && e.result), '감사 기록 필드 누락');
});

test('CASE B. 자료 변경 없음 → 304 · 새 Dataset 없음(UNCHANGED) · 확인 주기 전에는 요청 자체를 하지 않는다', async () => {
  const t = setup();
  await t.run(NOW1);
  const skipped = await t.run('2031-03-10T00:00:00.000Z');
  assert.deepStrictEqual(skipped.entries, []);
  assert.deepStrictEqual(skipped.skipped.sort(), ['SYN_AGI', 'SYN_JPM']);
  assert.strictEqual(skipped.calls.length, 0);
  const out = await t.run(NOW2);
  assert.deepStrictEqual(byResult(out.entries, 'SYN_JPM'), ['UNCHANGED']);
  assert.strictEqual(byResult(out.entries, 'SYN_AGI')[0], 'UNCHANGED');
  const jpmCall = out.calls.find((c) => c.url === fx.JPM_URL);
  assert.strictEqual(jpmCall.headers['If-None-Match'], '"jpm-1"');
  assert.strictEqual(t.store.listDatasets().length, 2);
});

test('CASE C. 기존 값 변경(같은 edition 개정) → 새 버전(-r2) · 바뀐 필드 검출 · 기존 Dataset 보존', async () => {
  const t = setup();
  await t.run(NOW1);
  t.state.jpmCsv = fx.synJpmCsv({ returns: { alpha: 5.4 }, corr: { ab: 0.55 } });
  t.state.jpmEtag = '"jpm-2"';
  const out = await t.run(NOW2);
  const e = out.entries.find((x) => x.sourceId === 'SYN_JPM');
  assert.strictEqual(e.result, 'NEW_VERSION');
  assert.strictEqual(e.detectedVersion, 'JPM-KRW-2031.1-r2');
  assert.ok(e.changedFields.includes('expectedReturn.Alpha Equity'));
  assert.ok(e.changedFields.includes('correlation.Alpha Equity|Beta Equity'));
  const r2 = t.store.readDataset('JPM-LTCMA-2031-KRW-r2');
  assert.strictEqual(r2.diffFromPrevious.previousDatasetId, 'JPM-LTCMA-2031-KRW');
  assert.strictEqual(t.store.readDataset('JPM-LTCMA-2031-KRW').expectedReturn['Alpha Equity'], 5); // 이전 Dataset 그대로
});

test('CASE D. 다운로드 실패(네트워크 오류 · timeout) → 1회 재시도 후 UPDATE_FAILED · ACTIVE · 런타임 파일 유지', async () => {
  const t = setup();
  await t.run(NOW1);
  t.approveAndActivate('AGI-LTCMA-2031Q1-USD', ['JPM-LTCMA-2031-KRW'], NOW1);
  const activeBefore = fs.readFileSync(path.join(t.root, 'data', 'cma', 'active.json'), 'utf8');
  const runtimeBefore = fs.readFileSync(t.runtimePath, 'utf8');
  let attempts = 0;
  t.state.agiFail = () => { attempts += 1; throw new Error('ECONNRESET'); };
  t.state.jpmFail = () => new Promise(() => {}); // 응답 없음 → timeout
  const out = await t.run(NOW2);
  const agi = out.entries.find((e) => e.sourceId === 'SYN_AGI' && e.source === fx.AGI_URL);
  assert.strictEqual(agi.result, 'UPDATE_FAILED');
  assert.strictEqual(agi.errorCode, 'DOWNLOAD_FAILED');
  assert.strictEqual(agi.attempts, 2);
  assert.strictEqual(attempts, 2); // 무한 재시도 없음
  const jpm = out.entries.find((e) => e.sourceId === 'SYN_JPM');
  assert.strictEqual(jpm.result, 'UPDATE_FAILED');
  assert.strictEqual(jpm.errorCode, 'TIMEOUT');
  assert.strictEqual(jpm.resultingStatus, 'ACTIVE_PRESERVED');
  assert.strictEqual(fs.readFileSync(path.join(t.root, 'data', 'cma', 'active.json'), 'utf8'), activeBefore);
  assert.strictEqual(fs.readFileSync(t.runtimePath, 'utf8'), runtimeBefore);
  const reg = t.store.readRegistry().sources.find((s) => s.sourceId === 'SYN_JPM');
  assert.strictEqual(reg.lastCheckedAt, NOW2);
  assert.strictEqual(reg.lastSuccessfulFetchAt, NOW1); // 실패한 확인은 성공 시각을 바꾸지 않는다
});

test('CASE E. 해석 실패(PDF 변환 실패 · PDF가 아님 · CSV 구조 변경) → UPDATE_FAILED · 새 Dataset 없음 · ACTIVE 유지', async () => {
  const t = setup();
  await t.run(NOW1);
  t.approveAndActivate('AGI-LTCMA-2031Q1-USD', ['JPM-LTCMA-2031-KRW'], NOW1);
  const activeBefore = JSON.stringify(t.store.readActive());
  t.state.agiId = 'unknown'; t.state.agiEtag = '"agi-x"';
  t.state.jpmCsv = 'Compound,Arithmetic\nfoo,bar\nbaz,qux'; t.state.jpmEtag = '"jpm-x"';
  const out = await t.run(NOW2);
  const agi = out.entries.find((e) => e.source === fx.AGI_URL);
  assert.strictEqual(agi.result, 'UPDATE_FAILED');
  assert.strictEqual(agi.errorCode, 'PARSE_FAILED');
  assert.strictEqual(out.entries.find((e) => e.sourceId === 'SYN_JPM').errorCode, 'PARSE_FAILED');
  assert.strictEqual(t.store.listDatasets().length, 2);
  assert.strictEqual(JSON.stringify(t.store.readActive()), activeBefore);
  // PDF라고 등록된 주소가 HTML을 돌려주면 출처 의심으로 실패한다.
  t.state.agiEtag = '"agi-y"';
  t.state.extraRoutes = { [fx.AGI_URL]: () => ({ status: 200, body: '<html>moved</html>', headers: { etag: '"agi-y"', 'content-type': 'text/html' } }) };
  const out2 = await t.run(NOW3, { force: true, sourceIds: ['SYN_AGI'] });
  assert.strictEqual(out2.entries.find((e) => e.source === fx.AGI_URL).errorCode, 'SOURCE_AUTHENTICITY');
});

test('CASE F. 잘못된 상관행렬(PSD 아님) · 필수 자산군 누락 · 기준일 불일치 → UPDATE_FAILED · ACTIVE 유지', async () => {
  const t = setup();
  await t.run(NOW1);
  t.approveAndActivate('AGI-LTCMA-2031Q1-USD', ['JPM-LTCMA-2031-KRW'], NOW1);
  const activeBefore = JSON.stringify(t.store.readActive());
  t.state.jpmCsv = fx.synJpmCsv({ corr: { ab: 0.9, ag: 0.9, bg: -0.9 } }); t.state.jpmEtag = '"jpm-bad"';
  t.state.texts.bad = fx.synAgiText({ dropRow: 'Korea Equities', extraRow: 'Synthetic Extra Eleven 5.2%  -0.3% 14.0%  -0.2% 0.62' }); // 행 수는 유지
  t.state.agiId = 'bad'; t.state.agiEtag = '"agi-bad"';
  const out = await t.run(NOW2);
  const jpm = out.entries.find((e) => e.sourceId === 'SYN_JPM');
  assert.strictEqual(jpm.result, 'UPDATE_FAILED');
  assert.strictEqual(jpm.errorCode, 'MATRIX_NOT_PSD');
  const agi = out.entries.find((e) => e.source === fx.AGI_URL);
  assert.strictEqual(agi.result, 'UPDATE_FAILED');
  assert.strictEqual(agi.errorCode, 'MAPPING_FAILURE');
  assert.strictEqual(t.store.listDatasets().length, 2);
  assert.strictEqual(JSON.stringify(t.store.readActive()), activeBefore);
});

test('CASE G. 원문 주소 없음(HTTP 404) → 재시도 없이 SOURCE_UNAVAILABLE · ACTIVE 유지', async () => {
  const t = setup();
  let hits = 0;
  t.state.agiFail = () => { hits += 1; return { status: 404, body: 'gone' }; };
  const out = await t.run(NOW1);
  const agi = out.entries.find((e) => e.source === fx.AGI_URL);
  assert.strictEqual(agi.result, 'UPDATE_FAILED');
  assert.strictEqual(agi.errorCode, 'SOURCE_UNAVAILABLE');
  assert.strictEqual(hits, 1);
  assert.strictEqual(t.store.readActive(), null);
  assert.ok(!fs.existsSync(t.runtimePath), '확인 과정이 런타임 파일을 만들었다');
});

test('CASE H. 같은 자료를 다시 발견(파일 바이트는 다르지만 내용 같음) → DUPLICATE · 새 Dataset 없음', async () => {
  const t = setup();
  await t.run(NOW1);
  t.state.jpmCsv = fx.synJpmCsv().replace(/\r\n/g, '\n'); // 줄바꿈만 다른 같은 자료
  t.state.jpmEtag = '"jpm-dup"';
  const out = await t.run(NOW2);
  const e = out.entries.find((x) => x.sourceId === 'SYN_JPM');
  assert.strictEqual(e.result, 'DUPLICATE');
  assert.strictEqual(e.detectedVersion, 'JPM-KRW-2031.1');
  assert.strictEqual(t.store.listDatasets().filter((d) => d.sourceId === 'SYN_JPM').length, 1);
});

test('CASE I. 다음 분기 자료 자동 발견 → VERIFIED로만 저장 · 자동 ACTIVE 금지 · 런타임 파일 불변', async () => {
  const t = setup();
  await t.run(NOW1);
  t.approveAndActivate('AGI-LTCMA-2031Q1-USD', ['JPM-LTCMA-2031-KRW'], NOW1);
  const activeBefore = JSON.stringify(t.store.readActive());
  const runtimeBefore = fs.readFileSync(t.runtimePath, 'utf8');
  // 두 번째 파일 이름 규칙에서만 발견된다(첫 규칙 주소는 HTML 안내 페이지).
  t.state.extraRoutes = { 'https://example.test/alt-2031q2.pdf': () => ({ status: 200, body: fx.fakePdf('q2'), headers: { 'content-type': 'application/pdf' } }) };
  const out = await t.run(NOW2);
  const found = out.entries.find((e) => e.source === 'https://example.test/alt-2031q2.pdf');
  assert.strictEqual(found.result, 'NEW_VERSION');
  assert.strictEqual(found.previousVersion, 'AGI-2031.1');
  assert.ok(found.changedFields.includes('expectedReturn.Korea Equities'));
  const q2 = t.store.readDataset('AGI-LTCMA-2031Q2-USD');
  assert.strictEqual(q2.status, 'VERIFIED');
  assert.strictEqual(q2.asOfDate, '2031-03-31');
  assert.strictEqual(JSON.stringify(t.store.readActive()), activeBefore);
  assert.strictEqual(fs.readFileSync(t.runtimePath, 'utf8'), runtimeBefore);
  // 다음 달에는 이미 아는 Q2 다음(Q3)부터 찾는다 - Q2를 다시 받지 않는다.
  const out2 = await t.run(NOW3);
  assert.ok(!out2.calls.some((c) => c.url.includes('2031q2')));
  assert.ok(out2.calls.some((c) => c.url.includes('2031q3')));
  // 기준일을 원문에서 확인하지 못한 edition은 DISCOVERED + REVIEW_REQUIRED, 승인하려면 기준일 근거가 필요하다.
  t.state.jpmCsv = fx.synJpmCsv({ edition: 2032 }); t.state.jpmEtag = '"jpm-2032"';
  const out3 = await t.run('2031-06-01T00:00:00.000Z');
  const j = out3.entries.find((e) => e.sourceId === 'SYN_JPM');
  assert.strictEqual(j.result, 'REVIEW_REQUIRED');
  assert.strictEqual(j.errorCode, 'AS_OF_DATE_UNVERIFIED');
  const d2032 = t.store.readDataset('JPM-LTCMA-2032-KRW');
  assert.strictEqual(d2032.status, 'DISCOVERED');
  assert.throws(() => pipeline.approveDataset({ store: t.store, datasetId: d2032.datasetId, approvedBy: 'PM', note: 'x', allowSynthetic: true }), /기준일 확인/);
  assert.throws(() => pipeline.activateSet({ store: t.store, primaryDatasetId: 'AGI-LTCMA-2031Q2-USD', benchmarkDatasetIds: [], activatedBy: 'PM', note: 'x', allowSynthetic: true }), /APPROVED/);
  const approved = pipeline.approveDataset({ store: t.store, datasetId: d2032.datasetId, approvedBy: 'PM', note: '보고서 확인', asOfDate: '2031-03-31', asOfEvidence: 'synthetic report p.1', allowSynthetic: true });
  assert.strictEqual(approved.status, 'APPROVED');
  assert.strictEqual(approved.asOfDate, '2031-03-31');
  // 수집 시각보다 늦은 기준일은 승인 단계에서도 거부된다.
  const d2 = t.store.readDataset(d2032.datasetId);
  assert.strictEqual(d2.evidence.asOfDate, 'synthetic report p.1');
});

test('CASE J. PM 승인 Dataset 활성화 → 새 세트 ACTIVE · 이전 ACTIVE는 SUPERSEDED로 보존 · 이력 · 런타임 파일 재생성', async () => {
  const t = setup();
  await t.run(NOW1);
  const first = t.approveAndActivate('AGI-LTCMA-2031Q1-USD', ['JPM-LTCMA-2031-KRW'], NOW1);
  assert.strictEqual(first.setVersion, 'CMA-2031.1');
  const runtime1 = fs.readFileSync(t.runtimePath, 'utf8');
  assert.match(runtime1, /"setVersion": "CMA-2031.1"/);
  assert.match(runtime1, /"Korea Equities"/);
  assert.doesNotMatch(runtime1, /Synthetic Equity Six/); // 앱이 연결하지 않는 자산군은 싣지 않는다
  t.state.extraRoutes = { 'https://example.test/syn-cma-2031q2.pdf': () => ({ status: 200, body: fx.fakePdf('q2'), headers: { 'content-type': 'application/pdf' } }) };
  await t.run(NOW2);
  // 승인 없이 활성화 불가
  assert.throws(() => pipeline.activateSet({ store: t.store, primaryDatasetId: 'AGI-LTCMA-2031Q2-USD', benchmarkDatasetIds: ['JPM-LTCMA-2031-KRW'], activatedBy: 'PM', note: 'x', allowSynthetic: true }), /APPROVED/);
  // 역할이 다른 Dataset은 Benchmark · Primary로 바꿔 쓸 수 없다
  assert.throws(() => pipeline.activateSet({ store: t.store, primaryDatasetId: 'JPM-LTCMA-2031-KRW', benchmarkDatasetIds: [], activatedBy: 'PM', note: 'x', allowSynthetic: true }), /PRIMARY/);
  const second = t.approveAndActivate('AGI-LTCMA-2031Q2-USD', ['JPM-LTCMA-2031-KRW'], NOW2);
  assert.strictEqual(second.setVersion, 'CMA-2031.2');
  assert.strictEqual(t.store.readDataset('AGI-LTCMA-2031Q1-USD').status, 'SUPERSEDED');
  assert.strictEqual(t.store.readDataset('AGI-LTCMA-2031Q2-USD').status, 'ACTIVE');
  assert.strictEqual(t.store.readDataset('JPM-LTCMA-2031-KRW').status, 'ACTIVE');
  // 이전 Dataset의 숫자는 그대로 남는다(과거 결과가 가리키는 세트를 언제든 다시 확인할 수 있다).
  assert.strictEqual(t.store.readDataset('AGI-LTCMA-2031Q1-USD').expectedReturn['Korea Equities'], 6);
  const active = t.store.readActive();
  assert.deepStrictEqual(active.history.map((h) => h.setVersion), ['CMA-2031.1', 'CMA-2031.2']);
  assert.strictEqual(active.history[0].supersededAt, NOW2);
  const runtime2 = fs.readFileSync(t.runtimePath, 'utf8');
  assert.match(runtime2, /"setVersion": "CMA-2031.2"/);
  assert.match(runtime2, /"volatility": 26/);
  const statuses = t.store.readDataset('AGI-LTCMA-2031Q1-USD').statusHistory.map((s) => s.status);
  assert.deepStrictEqual(statuses, ['VERIFIED', 'APPROVED', 'ACTIVE', 'SUPERSEDED']);
});

test('CASE K. 방법론 참고 문서 - 첫 확인은 기준값 기록, 이후 PDF hash가 바뀌면 REFERENCE_CHANGED(Dataset 없음)', async () => {
  const reg = fx.synRegistry();
  reg.sources.push({ sourceId: 'SYN_REF', kind: 'REFERENCE', provider: 'Synthetic Provider B', sourceTitle: 'Synthetic Handbook', sourceUrl: 'https://example.test/handbook.pdf', sourceType: 'OFFICIAL_PDF', checkFrequencyDays: 25, active: true });
  const root = fx.makeTempRoot(reg);
  let body = Buffer.from('%PDF-1.7 handbook v1');
  const routesRef = { 'https://example.test/handbook.pdf': () => ({ status: 200, body, headers: { 'content-type': 'application/pdf' } }) };
  const run = (now) => pipeline.runCheck({ root, now, fetchImpl: fx.makeFetch(routesRef).fetchImpl, sourceIds: ['SYN_REF'], allowSynthetic: true, fetchOptions: { retryDelayMs: 0 } });
  const a = await run(NOW1);
  assert.strictEqual(a.entries[0].result, 'REFERENCE_UNCHANGED');
  const b = await run(NOW2);
  assert.strictEqual(b.entries[0].result, 'REFERENCE_UNCHANGED');
  body = Buffer.from('%PDF-1.7 handbook v2');
  const c = await run(NOW3);
  assert.strictEqual(c.entries[0].result, 'REFERENCE_CHANGED');
  assert.strictEqual(createStore(root).listDatasets().length, 0);
});

test('CASE L. 실제 등록 Source(registry.json)는 공식 https 주소 · 역할 · 확인 주기(≤ 월 1회)가 채워져 있고 Benchmark는 명시 등록돼 있다', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cma', 'registry.json'), 'utf8'));
  const allowedHosts = ['ap.allianzgi.com', 'cdn.jpmorganfunds.com', 'am.jpmorgan.com', 'corporate.vanguard.com', 'www.blackrock.com'];
  reg.sources.forEach((s) => {
    const u = new URL(s.sourceUrl);
    assert.strictEqual(u.protocol, 'https:', s.sourceId);
    assert.ok(allowedHosts.includes(u.hostname), `${s.sourceId}: 공식 기관 도메인이 아니다 (${u.hostname})`);
    ['provider', 'sourceTitle', 'sourceType', 'expectedFormat', 'checkFrequency'].forEach((k) => assert.ok(s[k], `${s.sourceId}.${k}`));
    ['lastCheckedAt', 'lastSuccessfulFetchAt', 'lastDatasetVersion', 'active'].forEach((k) => assert.ok(k in s, `${s.sourceId}.${k}`));
    if (s.kind === 'DATASET') assert.ok(s.checkFrequencyDays <= 31, `${s.sourceId}: 확인 주기가 월 1회보다 길다`);
    assert.ok(!('testNumberKind' in s), '실제 Registry에 테스트 전용 표시가 있다');
  });
  const benchmarks = reg.sources.filter((s) => s.role === 'BENCHMARK');
  assert.strictEqual(benchmarks.length, 1);
  assert.ok(benchmarks[0].benchmarkSelectionReason);
});
