// [종결 프로젝트 · 실행 묶음 B · DP-01 · 대장 D-1] 미국 개별주 본국 보통주(HOME_COMMON) 판정
//
// 판정 규칙: HOME_COMMON_RULE_V1
//   세 가지 사실이 모두 공식 자료로 확인될 때만 HOME_COMMON이다.
//     ① 발행인이 미국 주에 설립됐다            (SEC EDGAR 회사기록 또는 10-K 표지)
//     ② 연차보고서가 10-K다(국내 신고인)        (SEC EDGAR 제출 목록)
//     ③ 해당 종목이 그 발행인의 보통주다        (거래소 종목 디렉터리 또는 10-K 표지 12(b) 등록증권)
//   ADR · 예탁증권 표기가 있으면 NOT_HOME_COMMON.
//   ①~③ 중 하나라도 확인되지 않거나 자료가 서로 어긋나면 REVIEW(자동 확정 금지).
//   거래소 상장 사실만으로는 절대 판정하지 않는다(§44 44-16 D-06 · 계획서 §19).
//
// 자료:
//   - SEC 1차 자료: docs/closeout/research/sec-filer-facts.json (수집 기록 · 출처 URL 포함)
//   - 증권 종류: Nasdaq Trader 종목 디렉터리(nasdaqlisted.txt · otherlisted.txt) - 실행할 때마다 새로 받는다.
//
// SEC 재검증(운영 자동화):
//   SEC는 요청 User-Agent에 연락처를 요구한다. 그 값은 코드 · 커밋 · 로그 · 보고서에 남기지 않고
//   환경변수 SEC_CONTACT_EMAIL(또는 GitHub Actions Secret)으로만 주입한다.
//   --verify-sec 옵션은 값이 "설정돼 있는지"만 확인하고, 없으면 SEC 재조회를 건너뛴다(값 자체는 출력하지 않는다).
//
// 사용법:
//   node scripts/closeout/research/us-home-common.js               판정 실행(거래소 디렉터리 내려받음)
//   node scripts/closeout/research/us-home-common.js --verify-sec  SEC 연락처 설정 여부까지 확인

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FACTS = path.join(ROOT, 'docs', 'closeout', 'research', 'sec-filer-facts.json');
const OUT = path.join(ROOT, 'docs', 'closeout', 'research', 'us-home-common.json');

const DIRECTORIES = [
  { id: 'nasdaqlisted', url: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', symbolCol: 0, nameCol: 1, etfCol: 6 },
  { id: 'otherlisted', url: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', symbolCol: 0, nameCol: 1, etfCol: 4 }
];

// 미국 주 · 특별구 코드(설립 관할 판정용). 이 목록에 없는 값은 미국 설립으로 보지 않는다.
const US_STATES = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR']);
const STATE_NAME_TO_CODE = { DELAWARE: 'DE', CALIFORNIA: 'CA', WASHINGTON: 'WA', TEXAS: 'TX', 'NEW JERSEY': 'NJ', OHIO: 'OH', 'NEW YORK': 'NY' };

const RULE_VERSION = 'HOME_COMMON_RULE_V1';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'jasan-closeout-research/1.0 (personal portfolio app)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function loadDirectories() {
  const byTicker = new Map();
  const meta = [];
  for (const d of DIRECTORIES) {
    const text = await fetchText(d.url);
    const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('File Creation Time'));
    const header = lines.shift();
    lines.forEach((line) => {
      const c = line.split('|');
      const sym = (c[d.symbolCol] || '').trim();
      if (!sym) return;
      byTicker.set(sym, { symbol: sym, securityName: (c[d.nameCol] || '').trim(), etf: (c[d.etfCol] || '').trim(), directory: d.id });
    });
    meta.push({ id: d.id, url: d.url, header, rows: lines.length, retrievedAt: new Date().toISOString() });
  }
  return { byTicker, meta };
}

function normaliseState(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return null;
  if (US_STATES.has(v)) return v;
  if (STATE_NAME_TO_CODE[v]) return STATE_NAME_TO_CODE[v];
  return null;
}

// 증권 종류 판정 - 거래소 디렉터리 표기와 10-K 표지 등록증권을 함께 본다.
function classifySecurity(dirName, registeredSecurity) {
  const text = `${dirName || ''} ${registeredSecurity || ''}`.toLowerCase();
  if (/american depositary|depositary share|depositary receipt|\badr\b|\bads\b/.test(text)) return { kind: 'DEPOSITARY', common: false };
  if (/preferred|warrant|unit\b|right\b|note due|senior notes/.test(dirName || '')) return { kind: 'OTHER', common: false };
  if (/common stock|ordinary shares/.test(text)) return { kind: 'COMMON', common: true };
  if (/capital stock/.test(text)) return { kind: 'CAPITAL_STOCK', common: false, note: '보통주(common stock)로 표기되지 않은 주식 종류다. 의결권 없는 자본주식을 본국 보통주로 볼지는 정책 판단이 필요하다.' };
  return { kind: 'UNKNOWN', common: false };
}

function judge(filer, dir) {
  const reasons = [];
  const state = normaliseState(filer.stateOfIncorporation);
  const usIncorporated = !!state;
  if (!usIncorporated) reasons.push('설립 관할이 미국 주로 확인되지 않음');

  const form = String(filer.annualReportForm || '').toUpperCase();
  const domesticFiler = form === '10-K';
  if (form === '20-F' || form === '40-F') reasons.push(`연차보고서가 ${form}(외국 신고인)`);
  else if (!domesticFiler) reasons.push('연차보고서 서식이 확인되지 않음');

  const sec = classifySecurity(dir && dir.securityName, filer.registeredSecurity);
  if (sec.kind === 'DEPOSITARY') reasons.push('예탁증권(ADR/ADS) 표기');
  else if (!sec.common) reasons.push(`증권 종류가 보통주로 확인되지 않음(${sec.kind})${sec.note ? ' - ' + sec.note : ''}`);
  if (dir && dir.etf === 'Y') reasons.push('거래소 디렉터리에서 ETF로 표기됨');
  if (!dir) reasons.push('거래소 종목 디렉터리에 없음');

  let verdict;
  if (sec.kind === 'DEPOSITARY' || form === '20-F' || form === '40-F') verdict = 'NOT_HOME_COMMON';
  else if (usIncorporated && domesticFiler && sec.common && dir && dir.etf === 'N') verdict = 'HOME_COMMON';
  else if (!filer.stateOfIncorporation && !form) verdict = 'UNRESOLVED';
  else verdict = 'REVIEW';

  return {
    ticker: filer.ticker,
    issuer: filer.name,
    cik: filer.cik,
    stateOfIncorporation: filer.stateOfIncorporation || null,
    stateNormalised: state,
    stateSource: filer.stateSource || null,
    annualReportForm: filer.annualReportForm || null,
    latestAnnualReport: filer.latestAnnualReport || null,
    exchangeDirectory: dir ? { securityName: dir.securityName, etf: dir.etf, directory: dir.directory } : null,
    registeredSecurity: filer.registeredSecurity || null,
    securityKind: sec.kind,
    verdict,
    reasons,
    evidenceGrade: verdict === 'HOME_COMMON' ? 'A' : null,
    ruleVersion: RULE_VERSION,
    note: filer.note || null
  };
}

async function main() {
  const verifySec = process.argv.includes('--verify-sec');
  if (verifySec) {
    const present = typeof process.env.SEC_CONTACT_EMAIL === 'string' && process.env.SEC_CONTACT_EMAIL.trim() !== '';
    console.log(present
      ? '✓ SEC_CONTACT_EMAIL 설정됨(값은 출력하지 않는다) - SEC 직접 재검증을 실행할 수 있다.'
      : '✗ SEC_CONTACT_EMAIL 미설정 - SEC 직접 재조회를 건너뛴다. 기록된 1차 자료(sec-filer-facts.json)로만 판정한다.');
  }

  const factsDoc = JSON.parse(fs.readFileSync(FACTS, 'utf8'));
  const { byTicker, meta } = await loadDirectories();
  const results = factsDoc.filers.map((f) => judge(f, byTicker.get(f.ticker)));

  const summary = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
  const payload = {
    schemaVersion: 1,
    title: '미국 개별주 본국 보통주 판정 (DP-01 · 대장 D-1)',
    ruleVersion: RULE_VERSION,
    rule: {
      homeCommon: ['① 미국 주 설립(SEC 회사기록 또는 10-K 표지)', '② 연차보고서 10-K', '③ 보통주(거래소 디렉터리 또는 10-K 표지 12(b))', '④ ETF 아님'],
      notHomeCommon: ['예탁증권(ADR/ADS) 표기', '연차보고서가 20-F 또는 40-F'],
      review: ['위 사실 중 확인되지 않은 것이 있음', '자료 간 표기가 어긋남', '보통주로 표기되지 않은 주식 종류(예: 무의결권 capital stock)'],
      forbidden: ['거래소 상장 사실만으로 판정', '이름 규칙으로 추정']
    },
    generatedAt: new Date().toISOString(),
    secFactsSource: path.relative(ROOT, FACTS).replace(/\\/g, '/'),
    directories: meta,
    summary,
    results
  };
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  results.forEach((r) => console.log(`${r.verdict.padEnd(16)} ${r.ticker.padEnd(6)} ${r.stateNormalised || '-'} ${String(r.annualReportForm || '-').padEnd(5)} ${r.securityKind.padEnd(14)} ${r.reasons.join(' · ')}`));
  console.log(`\n요약: ${JSON.stringify(summary)}`);
  console.log(`✓ 기록: ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.error('✗ 실패:', e); process.exit(1); });
