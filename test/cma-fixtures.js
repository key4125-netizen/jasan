// CMA 테스트 공통 fixture - 이 파일 자체는 테스트가 아니다(`npm test` glob은 test/*.test.js).
//
// [SYNTHETIC_TEST_DATA] 여기 있는 모든 숫자 · 자산군 이름 · 주소는 구조 검증을 위해 만든 합성 값이다.
// 실제 기관 수치가 아니며, 실제 CMA 저장소(data/cma)에 들어가지 않는다(테스트는 임시 폴더를 쓴다).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SYN = 'SYNTHETIC_TEST_DATA';

// J.P. Morgan 데이터 파일과 같은 구조의 합성 CSV(하삼각 상관 + 계단형 머리글).
function synJpmCsv(opts = {}) {
  const edition = opts.edition || 2031;
  const r = Object.assign({ alpha: 5.0, beta: 4.0, gamma: 3.0 }, opts.returns || {});
  const c = Object.assign({ ab: 0.5, ag: 0.1, bg: 0.2 }, opts.corr || {});
  return [
    `,,Compound Return ${edition} (%),Arithmetic Return ${edition} (%),Annualized Volatility (%),Compound Return ${edition - 1} (%),Alpha Equity,,,`,
    `EQUITIES,Alpha Equity,${r.alpha},${r.alpha + 1},20.0,4.9,1.0,Beta Equity,,`,
    `EQUITIES,Beta\u00a0Equity,${r.beta},${r.beta + 1},15.0,4.1,${c.ab},1.0,Gamma Bond,`,
    `FIXED INCOME,Gamma Bond,${r.gamma},3.1,5.0,2.9,${c.ag},${c.bg},1.0,`
  ].join('\r\n') + '\r\n';
}

// AllianzGI Highlights PDF를 `pdftotext -raw`로 뽑은 것과 같은 구조의 합성 텍스트.
function synAgiText(opts = {}) {
  const year = opts.year || 2031, q = opts.quarter || 1;
  const asAt = opts.asAt || '31 December 2030';
  const month = opts.month || 'February 2031';
  const korea = Object.assign({ ret: 6.0, vol: 25.0, corr: 0.80 }, opts.korea || {});
  const rows = [
    'Synthetic Bond One* 4.0%  0.1% 5.0% 0.0% 0.05',
    'Developed World Equities 6.0% \uf0ea -0.2% 17.0%  -0.2% 1.00',
    'North America Equities 5.5%  -0.2% 16.0%  -0.1% 0.99',
    `Korea Equities ${korea.ret.toFixed(1)}%  -0.3% ${korea.vol.toFixed(1)}% 0.0% ${korea.corr.toFixed(2)}`,
    'Emerging Markets Equities 6.5%  -0.4% 24.0%  -0.2% 0.90',
    'Synthetic Equity Six 6.1%  -0.3% 22.0%  -0.2% 0.70',
    'Synthetic Equity Seven 6.2%  -0.3% 23.0%  -0.2% 0.71',
    'Synthetic Equity Eight 6.3%  -0.3% 24.0%  -0.2% 0.72',
    'Synthetic Alt Nine 5.0%  -0.3% 12.0%  -0.2% 0.60',
    'Synthetic Alt Ten 5.1%  -0.3% 13.0%  -0.2% 0.61'
  ];
  if (opts.extraRow) rows.push(opts.extraRow);
  if (opts.dropRow) rows.splice(rows.findIndex((x) => x.startsWith(opts.dropRow)), 1);
  return [
    `RELEASED IN Q${q} ${year} | LONG-TERM CAPITAL MARKET ASSUMPTIONS - HIGHLIGHTS`,
    `Assumptions as at ${asAt} (in USD)`,
    `Source: Allianz Global Investors. Data as at ${asAt} and in USD terms. Please note that the table above covers the`,
    'alternative asset classes are either in USD terms or hedged to USD. The risk-return parameters assume an investment horizon of',
    '10 years. Past performance, or any prediction, projection or forecast, is not indicative of future performance.',
    'Segment Asset Class', 'CORRELATION', 'Developed World', 'Equities',
    ...rows,
    month,
    ''
  ].join('\n');
}

// PDF 바이트 흉내 - 첫 5바이트가 %PDF- 이고, 변환 함수가 내용을 찾는 표식을 담는다.
function fakePdf(id) { return Buffer.from(`%PDF-1.7 SYN:${id}`); }
function makePdfToText(texts) {
  return async (buf) => {
    const id = /SYN:(.+)$/.exec(buf.toString('latin1'));
    if (!id || texts[id[1]] === undefined) throw Object.assign(new Error('합성 PDF 변환 실패'), { code: 'PARSE_FAILED' });
    return texts[id[1]];
  };
}

/**
 * 가짜 네트워크. routes: { url: handler } - handler(req) → { status, body, headers } 또는 throw.
 * 기록: calls = [{ url, headers }]
 */
function makeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: (init && init.headers) || {} });
    const h = routes[url];
    if (!h) return new Response('<html>not a pdf</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const out = await h({ url, headers: (init && init.headers) || {} });
    return new Response(out.body === undefined ? null : out.body, { status: out.status || 200, headers: out.headers || {} });
  };
  return { fetchImpl, calls };
}

const AGI_URL = 'https://example.test/syn-cma-2031q1.pdf';
const JPM_URL = 'https://example.test/syn-matrix-krw.csv';

function synRegistry() {
  return {
    schemaVersion: 1,
    sources: [
      {
        sourceId: 'SYN_AGI', kind: 'DATASET', provider: 'Synthetic Provider A', sourceTitle: 'Synthetic CMA Highlights',
        sourceUrl: AGI_URL, sourceType: 'OFFICIAL_PDF', expectedFormat: 'pdf', parser: 'allianzgi-cma-text', role: 'PRIMARY',
        testNumberKind: SYN, checkFrequencyDays: 25,
        discovery: { type: 'QUARTERLY_URL_PATTERNS', lookAheadQuarters: 2, patterns: ['https://example.test/syn-cma-{yyyy}q{q}.pdf', 'https://example.test/alt-{yyyy}q{q}.pdf'] },
        methodologyUrl: AGI_URL, requiredClasses: ['Korea Equities', 'North America Equities', 'Emerging Markets Equities', 'Developed World Equities'],
        returnDefinition: 'NOT_STATED_IN_SOURCE', volatilityDefinition: 'synthetic', active: true, lastCheckedAt: null
      },
      {
        sourceId: 'SYN_JPM', kind: 'DATASET', provider: 'Synthetic Provider B', sourceTitle: 'Synthetic Matrix KRW',
        sourceUrl: JPM_URL, sourceType: 'OFFICIAL_DATA_DOWNLOAD', expectedFormat: 'csv', parser: 'jpm-ltcma-csv', role: 'BENCHMARK',
        testNumberKind: SYN, checkFrequencyDays: 25, currency: 'KRW', horizonYears: { min: 10, max: 15 },
        methodologyUrl: 'https://example.test/method.pdf', requiredClasses: ['Alpha Equity', 'Beta Equity'],
        returnDefinition: 'COMPOUND', volatilityDefinition: 'synthetic',
        verifiedEditions: { 2031: { sourceTitle: 'Synthetic Matrix KRW 2031', asOfDate: '2030-09-30', publishedAt: '2030-10-20', evidence: { asOfDate: 'synthetic' } } },
        active: true, lastCheckedAt: null
      }
    ],
    http: {}
  };
}

// 임시 저장소 루트 - data/cma/registry.json · app-asset-class-map.json을 채운다.
const createdRoots = [];
process.on('exit', () => createdRoots.forEach((r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* 임시 폴더 정리 실패는 무시 */ } }));
function makeTempRoot(registry) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cma-test-'));
  createdRoots.push(root);
  const dir = path.join(root, 'data', 'cma');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(registry || synRegistry(), null, 2));
  fs.writeFileSync(path.join(dir, 'app-asset-class-map.json'), JSON.stringify({
    schemaVersion: 1,
    appClasses: {
      KR_EQUITY: { label: '국내 주식', providers: { 'Synthetic Provider A': { class: 'Korea Equities', evidence: 'syn' }, 'Synthetic Provider B': { class: 'Alpha Equity', evidence: 'syn' } } },
      US_EQUITY: { label: '미국 주식', providers: { 'Synthetic Provider A': { class: 'North America Equities', evidence: 'syn' }, 'Synthetic Provider B': { class: 'Beta Equity', evidence: 'syn' } } }
    },
    officialMappings: [],
    unmapped: {}
  }, null, 2));
  return root;
}

// 런타임(js/27) 테스트용 합성 ACTIVE 세트.
function synRuntimeSet(overrides = {}) {
  return Object.assign({
    setVersion: 'CMA-2031.1',
    primary: {
      datasetId: 'SYN-A', version: 'A-2031.1', provider: 'Synthetic Provider A', sourceTitle: 'Synthetic A', sourceUrl: 'https://example.test/a',
      asOfDate: '2030-12-31', horizonYears: 10, currency: 'USD', role: 'PRIMARY', numberKind: SYN, returnDefinition: 'NOT_STATED_IN_SOURCE',
      returnUsableForMc: false,
      classes: { 'World Eq': { expectedReturn: 6, volatility: 17 }, 'KR Eq': { expectedReturn: 6.5, volatility: 25 }, 'US Eq': { expectedReturn: 5.5, volatility: 16 }, 'EM Eq': { expectedReturn: 7, volatility: 23 } },
      correlation: { kind: 'VERSUS_REFERENCE', referenceClass: 'World Eq', values: { 'World Eq': 1, 'KR Eq': 0.8, 'US Eq': 0.97, 'EM Eq': 0.85 } }
    },
    benchmarks: [{
      datasetId: 'SYN-B', version: 'B-2031.1', provider: 'Synthetic Provider B', sourceTitle: 'Synthetic B', sourceUrl: 'https://example.test/b',
      asOfDate: '2030-09-30', horizonYears: { min: 10, max: 15 }, currency: 'KRW', role: 'BENCHMARK', numberKind: SYN,
      classes: { KRX: { expectedReturn: 5, volatility: 19 }, USX: { expectedReturn: 4.5, volatility: 14 } },
      correlation: { kind: 'FULL', classes: ['KRX', 'USX'], matrix: [[1, 0.4], [0.4, 1]] }
    }],
    appClasses: {
      KR_EQUITY: { providers: { 'Synthetic Provider A': { class: 'KR Eq' }, 'Synthetic Provider B': { class: 'KRX' } } },
      US_EQUITY: { providers: { 'Synthetic Provider A': { class: 'US Eq' }, 'Synthetic Provider B': { class: 'USX' } } },
      EM_EQUITY: { providers: { 'Synthetic Provider A': { class: 'EM Eq' } } },
      WORLD: { providers: { 'Synthetic Provider A': { class: 'World Eq' } } }
    },
    officialMappings: [],
    unmapped: { DEV_EX_US_EQUITY: 'synthetic: 연결 없음' }
  }, overrides);
}

module.exports = { SYN, synJpmCsv, synAgiText, fakePdf, makePdfToText, makeFetch, synRegistry, makeTempRoot, synRuntimeSet, AGI_URL, JPM_URL };
