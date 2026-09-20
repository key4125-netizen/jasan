// [종결 프로젝트 · 실행 묶음 B 4차] OpenDART 공시 원문에서 ETF 기준정보(환헤지 · 기초지수 · PR/TR) 확인
//
// 왜 이 경로인가:
//   DART robots는 웹 뷰어 · 다운로드 경로를 막는다. 공식 API(OpenDART)는 같은 자료를 정식으로 제공하므로
//   우회가 아니라 제공된 채널을 쓰는 것이다(계획서 §7).
//
// 무엇을 하는가:
//   ① 운용사별 공시검색(list.json)을 페이지 단위로 훑어 **보고서명에 펀드명이 들어간** 건을 찾는다.
//      (실측: report_nm이 "투자설명서(집합투자증권)(미래에셋TIGER미국S&P500증권상장지수투자신탁(주식))" 형태라 펀드 특정이 가능하다.)
//   ② 대상 ETF별로 가장 최근 투자설명서를 골라 document.xml(원본 ZIP)을 받는다.
//   ③ ZIP을 풀어 본문에서 환헤지 · 기초지수 · PR/TR 관련 문장만 뽑아 **짧게 인용**한다.
//
// 저장 정책(계획서 §8): 원문을 저장소에 저장하지 않는다. 접수번호 · 취득일 · 원문 해시 · 최소 인용만 남긴다.
// 비밀값(계획서 §9): 인증키는 환경변수 OPENDART_API_KEY로만 받고 출력 · 기록하지 않는다.
//
// 사용법: node scripts/closeout/research/opendart-fetch-facts.js [--ticker 360200] [--since 20240101]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'closeout', 'research', 'opendart-etf-facts.json');
const KEY_ENV = 'OPENDART_API_KEY';
const BASE = 'https://opendart.fss.or.kr/api';
const GAP_MS = 500;
const MAX_RETRY = 3;
const MAX_PAGES = 12;          // 운용사별 검색 페이지 상한(실행량 통제 · 계획서 §10)

// 대상 ETF - 보고서명에서 펀드를 찾기 위한 키워드(운용사 공식 펀드명 기준).
const TARGETS = [
  { ticker: '360200', name: 'ACE 미국S&P500', issuer: '한국투자신탁운용', corp: '00324548', match: /ACE\s*미국S&P500증권상장지수/i },
  { ticker: '360750', name: 'TIGER 미국S&P500', issuer: '미래에셋자산운용', corp: '00259776', match: /TIGER\s*미국S&P500증권상장지수/i },
  { ticker: '368590', name: 'RISE 미국나스닥100', issuer: 'KB자산운용', corp: '00104500', match: /(RISE|KBSTAR)\s*미국나스닥100증권상장지수/i },
  { ticker: '458730', name: 'TIGER 미국배당다우존스', issuer: '미래에셋자산운용', corp: '00259776', match: /TIGER\s*미국배당다우존스증권상장지수/i },
  { ticker: '0052D0', name: 'TIGER 코리아배당다우존스', issuer: '미래에셋자산운용', corp: '00259776', match: /TIGER\s*코리아배당다우존스증권상장지수/i },
  { ticker: '487230', name: 'KODEX 미국AI전력핵심인프라', issuer: '삼성자산운용', corp: '00260453', match: /KODEX\s*미국AI전력핵심인프라증권상장지수/i },
  { ticker: '069500', name: 'KODEX 200', issuer: '삼성자산운용', corp: '00260453', match: /KODEX\s*200증권상장지수투자신탁\[주식\]/i },
  { ticker: '102110', name: 'TIGER 200', issuer: '미래에셋자산운용', corp: '00259776', match: /TIGER\s*200증권상장지수투자신탁\(주식\)/i },
  { ticker: '278530', name: 'KODEX 200TR', issuer: '삼성자산운용', corp: '00260453', match: /KODEX\s*200TR증권상장지수/i },
  { ticker: '237370', name: 'KODEX 코리아배당성장채권혼합', issuer: '삼성자산운용', corp: '00260453', match: /코리아배당성장채권혼합/i },
  { ticker: '472170', name: 'TIGER 미국테크TOP10채권혼합', issuer: '미래에셋자산운용', corp: '00259776', match: /미국테크TOP10채권혼합/i }
];

// 본문에서 찾을 사실 - 키워드가 나온 문장만 잘라 인용한다(원문 전체를 남기지 않는다).
const FACT_PATTERNS = [
  { field: 'hedgeStatus', re: /[^.。\n]{0,120}(환헤지|환위험\s*헤지|헤지를 하지|환노출)[^.。\n]{0,160}/g },
  { field: 'underlyingIndex', re: /[^.。\n]{0,120}기초지수[^.。\n]{0,200}/g },
  { field: 'returnType', re: /[^.。\n]{0,120}(Price Return|Total Return|총수익지수|가격지수|배당[^.。\n]{0,20}재투자)[^.。\n]{0,160}/g }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => (process.env[KEY_ENV] || '').trim();

async function req(op, params, asBuffer) {
  const q = new URLSearchParams(Object.assign({ crtfc_key: key() }, params));
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch(`${BASE}/${op}?${q.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.json();
    } catch (e) {
      if (i === MAX_RETRY) throw e;
      await sleep(GAP_MS * 2 ** i);
    }
  }
  return null;
}

// 운용사 공시 목록을 페이지 단위로 모은다(펀드 공시 G + 증권신고 C).
async function listDisclosures(corp, since, stats) {
  const rows = [];
  for (const ty of ['G', 'C']) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      stats.requests++;
      const res = await req('list.json', { corp_code: corp, bgn_de: since, end_de: '20261231', pblntf_ty: ty, page_no: String(page), page_count: '100' });
      if (!res || res.status !== '000' || !Array.isArray(res.list)) break;
      rows.push(...res.list);
      await sleep(GAP_MS);
      if (page >= Number(res.total_page || 1)) break;
    }
  }
  return rows;
}

// 원본 ZIP → 본문 문자열(인코딩은 EUC-KR 우선 시도 후 UTF-8).
function unzipToText(buf) {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (!entries.length) return null;
  const raw = entries.sort((a, b) => b.header.size - a.header.size)[0].getData();
  // 인코딩은 문서가 스스로 밝힌 값을 따른다(XML 선언). 밝히지 않으면 UTF-8로 본다.
  // (바이트만 보고 추측하면 UTF-8 문서를 EUC-KR로 잘못 읽어도 깨짐 문자가 생기지 않아 판별이 안 된다.)
  const head = raw.slice(0, 200).toString('latin1');
  const m = /encoding=["']([\w-]+)["']/i.exec(head);
  const enc = (m ? m[1] : 'utf-8').toLowerCase();
  return /euc-?kr|ks_c|cp949/.test(enc) ? iconv.decode(raw, 'euc-kr') : raw.toString('utf8');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
}

function extractFacts(text) {
  const out = {};
  FACT_PATTERNS.forEach(({ field, re }) => {
    const hits = [...text.matchAll(re)].map((m) => m[0].trim()).filter((s) => s.length > 15);
    const uniq = [...new Set(hits)].slice(0, 6);
    if (uniq.length) out[field] = uniq;
  });
  return out;
}

async function main() {
  if (!key()) { console.error(`✗ ${KEY_ENV} 미설정 - 실행하지 않는다.`); process.exit(1); }
  const argv = process.argv.slice(2);
  const only = (argv.find((a) => a === '--ticker') ? argv[argv.indexOf('--ticker') + 1] : null);
  const since = (argv.find((a) => a === '--since') ? argv[argv.indexOf('--since') + 1] : '20240101');
  const targets = only ? TARGETS.filter((t) => t.ticker === only) : TARGETS;

  const stats = { requests: 0, documents: 0, failures: 0, startedAt: new Date().toISOString() };
  const byCorp = new Map();
  const results = [];

  for (const t of targets) {
    if (!byCorp.has(t.corp)) {
      process.stdout.write(`· ${t.issuer} 공시 목록 조회…`);
      byCorp.set(t.corp, await listDisclosures(t.corp, since, stats));
      console.log(` ${byCorp.get(t.corp).length}건`);
    }
    const rows = byCorp.get(t.corp).filter((r) => t.match.test(String(r.report_nm || '')));
    // 정정신고서([기재정정]…)는 바뀐 부분만 담고 있어 본문 사실 확인에 쓸 수 없다.
    // 정정이 아닌 투자설명서 원본을 우선하고, 없으면 일괄신고서 · 증권신고서 원본을 쓴다.
    const byDateDesc = (a, b) => String(b.rcept_dt).localeCompare(String(a.rcept_dt));
    const isCorrection = (r) => /\[.*정정.*\]/.test(r.report_nm);
    const pick = (re) => rows.filter((r) => re.test(r.report_nm) && !isCorrection(r)).sort(byDateDesc)[0];
    const prospectus = pick(/^투자설명서/) || pick(/투자설명서/) || pick(/일괄신고서|증권신고서/) || rows.sort(byDateDesc)[0];

    const entry = {
      ticker: t.ticker, name: t.name, issuer: t.issuer,
      candidates: rows.slice(0, 8).map((r) => ({ report_nm: r.report_nm, rcept_no: r.rcept_no, rcept_dt: r.rcept_dt })),
      chosen: prospectus ? { report_nm: prospectus.report_nm, rcept_no: prospectus.rcept_no, rcept_dt: prospectus.rcept_dt } : null
    };

    if (prospectus) {
      try {
        stats.requests++; stats.documents++;
        const buf = await req('document.xml', { rcept_no: prospectus.rcept_no }, true);
        entry.documentSha256 = crypto.createHash('sha256').update(buf).digest('hex');
        entry.documentBytes = buf.length;
        const text = unzipToText(buf);
        if (!text) throw new Error('원본 ZIP에서 문서를 찾지 못했다');
        const plain = stripTags(text);
        entry.quotes = extractFacts(plain);
        entry.textLength = plain.length;
        // [실측 결론] OpenDART의 document.xml은 **주 문서 XML만** 준다. 집합투자증권 공시에서 그 주 문서는
        // 표지(및 정정 요약)뿐이고, 기초지수 · 환헤지가 적힌 본문은 첨부문서라 API로 오지 않는다.
        // 정정이 아닌 원본 투자설명서로도 같은 결과였다(텍스트 1,301자 · 기초지수/환헤지 없음).
        entry.bodyServed = plain.length > 4000 && (/기초지수/.test(plain) || /환헤지/.test(plain));
        entry.viewerUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${prospectus.rcept_no}`;
        entry.status = entry.bodyServed ? 'DOCUMENT_BODY_READ' : 'COVER_ONLY';
      } catch (e) {
        stats.failures++;
        entry.status = 'DOCUMENT_FAILED';
        entry.error = String(e && e.message ? e.message : e);
      }
      await sleep(GAP_MS);
    } else {
      entry.status = 'NO_MATCHING_DISCLOSURE';
    }
    results.push(entry);
    console.log(`  ${t.ticker} ${t.name}: ${entry.status}${entry.chosen ? ` (${entry.chosen.rcept_dt})` : ''}`);
  }

  stats.finishedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    title: 'OpenDART 공시 원문 기반 ETF 기준정보 확인 (실행 묶음 B 4차)',
    method: 'list.json(공시검색 · pblntf_ty=G·C) → 보고서명으로 펀드 특정 → document.xml(원본 ZIP) → 본문에서 해당 문장만 인용',
    storagePolicy: '원문 미보관 · 접수번호 · 취득일 · 원문 SHA-256 · 최소 인용만 기록(계획서 §8)',
    keyEnvName: KEY_ENV,
    since, execution: stats, results
  };
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n✓ 기록: ${path.relative(ROOT, OUT)} · 요청 ${stats.requests} · 문서 ${stats.documents} · 실패 ${stats.failures}`);
}

main().catch((e) => { console.error('✗ 실패:', e && e.message ? e.message : e); process.exit(1); });
