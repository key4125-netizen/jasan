// [종결 프로젝트 · 실행 묶음 B 4차 · DP-08 · DP-09 · 대장 D-3 · D-4] OpenDART로 ETF 공시 원문 찾기
//
// 무엇을 하는가:
//   미확정 Fact(환헤지 · 기초지수 PR/TR · 기초지수 변경)를 확인하려면 운용사가 제출한
//   투자설명서 · 집합투자규약 · 증권신고서 원문이 필요하다. DART robots가 웹 뷰어 · 다운로드 경로를
//   막고 있으므로 **공식 채널인 OpenDART API만** 쓴다(우회하지 않는다).
//
// 인증키 취급(계획서 §9 · PM 지시):
//   - 키는 환경변수 OPENDART_API_KEY(또는 GitHub Actions Secret)로만 주입한다.
//   - 이 스크립트는 키의 **존재 여부만** 확인하고 값은 출력 · 기록하지 않는다.
//   - 키가 없으면 호출하지 않고, 어떤 호출을 하려 했는지(계획)만 보여 준다.
//
// 이용조건:
//   OpenDART는 무료이며 누구나 신청할 수 있다. 하루 호출 한도가 있다(가이드 기준 약 20,000건).
//   받은 원문을 저장소에 커밋하지 않는다(계획서 §8) - URL · 접수번호 · 취득일 · 최소 인용만 남긴다.
//
// 사용법:
//   node scripts/closeout/research/opendart-etf-docs.js            키 확인 + (키가 있으면) 조회
//   node scripts/closeout/research/opendart-etf-docs.js --plan     호출 계획만 출력(키 사용 안 함)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'closeout', 'research', 'opendart-etf-docs.json');
const KEY_ENV = 'OPENDART_API_KEY';
const BASE = 'https://opendart.fss.or.kr/api';
const GAP_MS = 400;          // 호출 간격(한도 20,000건/일 · 여유 있게)
const MAX_RETRY = 3;

// 조사 대상 - 운용사별로 묶는다(ETF 공시는 운용사가 제출한다).
const TARGETS = [
  { issuer: '삼성자산운용', tickers: ['069500', '278530', '487230', '237370'] },
  { issuer: '미래에셋자산운용', tickers: ['102110', '360750', '458730', '472170', '0052D0'] },
  { issuer: 'KB자산운용', tickers: ['368590'] },
  { issuer: '한국투자신탁운용', tickers: ['360200'] }
];

// 찾는 문서 유형(보고서명에 이 표현이 들어간다).
const WANTED = ['투자설명서', '집합투자규약', '증권신고서', '정정'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasKey = () => typeof process.env[KEY_ENV] === 'string' && process.env[KEY_ENV].trim().length > 0;

// 키를 URL에 넣되 로그 · 결과 어디에도 남기지 않는다.
function url(op, params) {
  const q = new URLSearchParams(Object.assign({ crtfc_key: process.env[KEY_ENV] }, params));
  return `${BASE}/${op}?${q.toString()}`;
}
const safeUrl = (op, params) => `${BASE}/${op}?crtfc_key=<secret>&${new URLSearchParams(params).toString()}`;

async function call(op, params) {
  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch(url(op, params), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === MAX_RETRY) throw e;
      await sleep(GAP_MS * 2 ** i);
    }
  }
  return null;
}

// 참고: 고유번호 파일(corpCode.xml)은 ZIP(바이너리)이라 압축 해제 의존성이 필요하다.
// 의존성을 늘리지 않기 위해, 운용사 고유번호는 공개된 DART 공시검색 결과에서 한 번 확인해
// 아래 KNOWN_CORP_CODES에 기록해 두고 쓴다(공개 정보 · 비밀값 아님).

// 운용사 고유번호(DART 고유번호 8자리) - 공개 정보이며 비밀값이 아니다.
// DART 공시검색 결과 페이지(robots 허용 경로)에서 확인했다(2026-09-20).
const KNOWN_CORP_CODES = {
  '삼성자산운용': '00260453',
  '미래에셋자산운용': '00259776',
  'KB자산운용': '00104500',
  '한국투자신탁운용': '00324548'
};

function plan() {
  const calls = [];
  TARGETS.forEach((t) => {
    const code = KNOWN_CORP_CODES[t.issuer];
    calls.push({
      purpose: `${t.issuer} 공시 목록(최근 1년 · 펀드 공시)`,
      endpoint: safeUrl('list.json', { corp_code: code || '<고유번호 필요>', bgn_de: '20250101', end_de: '20261231', pblntf_ty: 'G', page_count: '100' }),
      note: 'pblntf_ty=G(펀드공시). 고유번호가 없으면 corpCode.xml(ZIP)에서 운용사 고유번호를 먼저 찾아야 한다.'
    });
    calls.push({
      purpose: `${t.issuer} 문서 원문(각 접수번호별)`,
      endpoint: safeUrl('document.xml', { rcept_no: '<공시검색 응답의 rcept_no>' }),
      note: '응답은 원본파일(ZIP). 원문은 저장하지 않고 필요한 문장만 인용한다.'
    });
  });
  return calls;
}

async function main() {
  const planOnly = process.argv.includes('--plan');
  const keyPresent = hasKey();
  console.log(keyPresent
    ? `✓ ${KEY_ENV} 설정됨(값은 출력하지 않는다)`
    : `✗ ${KEY_ENV} 미설정 - OpenDART 호출을 건너뛴다(키 값을 요구하지 않는다)`);

  const result = {
    schemaVersion: 1,
    title: 'OpenDART ETF 공시 조회 (실행 묶음 B 4차)',
    checkedAt: new Date().toISOString().slice(0, 10),
    keyEnvName: KEY_ENV,
    keyPresent,
    targets: TARGETS,
    wantedDocumentTypes: WANTED,
    plannedCalls: plan(),
    results: [],
    limits: { dailyCalls: '약 20,000건(가이드 유의사항)', perPage: 100, gapMs: GAP_MS, maxRetry: MAX_RETRY },
    storagePolicy: '원문 미보관 · URL/접수번호/취득일/최소 인용만 기록(계획서 §8)'
  };

  if (keyPresent && !planOnly) {
    for (const t of TARGETS) {
      const code = KNOWN_CORP_CODES[t.issuer];
      if (!code) {
        result.results.push({ issuer: t.issuer, status: 'CORP_CODE_UNKNOWN', note: 'corpCode.xml(ZIP)에서 고유번호 확인 필요' });
        continue;
      }
      try {
        const res = await call('list.json', { corp_code: code, bgn_de: '20250101', end_de: '20261231', pblntf_ty: 'G', page_count: '100' });
        const list = (res && res.list) || [];
        result.results.push({
          issuer: t.issuer, status: res ? res.status : null, message: res ? res.message : null, total: list.length,
          matched: list.filter((r) => WANTED.some((w) => String(r.report_nm || '').includes(w)))
            .map((r) => ({ report_nm: r.report_nm, rcept_no: r.rcept_no, rcept_dt: r.rcept_dt, flr_nm: r.flr_nm, corp_name: r.corp_name }))
            .slice(0, 50)
        });
      } catch (e) {
        result.results.push({ issuer: t.issuer, status: 'CALL_FAILED', error: String(e && e.message ? e.message : e) });
      }
      await sleep(GAP_MS);
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`✓ 기록: ${path.relative(ROOT, OUT)}`);
  if (!keyPresent) {
    console.log('  호출 계획:');
    result.plannedCalls.slice(0, 2).forEach((c) => console.log(`   - ${c.purpose}\n     ${c.endpoint}`));
    console.log(`  키를 쓰려면: 로컬은 환경변수 ${KEY_ENV}, 자동화는 같은 이름의 GitHub Actions Secret에 넣는다(값은 어디에도 기록하지 않는다).`);
  }
}

main().catch((e) => { console.error('✗ 실패:', e && e.message ? e.message : e); process.exit(1); });
