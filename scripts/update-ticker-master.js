// ============================================================================
// Smart Asset Manager - KIS 종목 마스터(국내 코스피/코스닥 + 해외 나스닥/뉴욕/아멕스) 다운로드/파싱
// ============================================================================
// GitHub Actions(.github/workflows/update-ticker-master.yml)가 매달 1일 이 스크립트를 실행해
// data/ticker-master.json을 새로 만들고 커밋한다. 브라우저(index.html/js/*)는 이 파일을 전혀
// 로드/실행하지 않는다 - Node 전용 오프라인 배치 스크립트다.
//
// [인증 불필요] 여기서 받는 파일은 KIS의 REST API(cloudflare-worker-kis-proxy.js가 대신 호출하는,
// APP KEY/토큰이 필요한 그 API)와 완전히 다른 경로다 - HTS/MTS가 종목 마스터를 갱신할 때 쓰는
// 정적 다운로드 서버(new.real.download.dws.co.kr)에서 인증 없이 그냥 GET으로 받는 zip 파일이며,
// KIS 공식 GitHub 샘플(koreainvestment/open-trading-api, stocks_info 폴더의 kis_kospi_code_mst.py /
// kis_kosdaq_code_mst.py / overseas_stock_code.py)이 실제로 쓰는 방식과 URL을 그대로 옮긴 것이다.
// 종목코드-종목명 매핑은 그 자체로 단순 사실(Fact) 정보이자 인증 없이 공개 배포되는 정적 자료이므로
// 재배포 제약 이슈가 없다는 전제로 만들었다(2026-08 사용자 확인).
//
// [고정폭 파싱 - 경계 계산 근거] 이 스크립트를 작성한 개발 환경은 네트워크가 차단돼 있어 실제
// kospi_code.mst/kosdaq_code.mst를 직접 내려받아 바이트 단위로 검증하지는 못했다. 대신 KIS 공식
// 파서(kis_kospi_code_mst.py)의 코드를 그대로 옮겨와 계산으로 경계를 구했다:
//   파이썬은 "for row in f:"로 한 줄을 읽는데, 이 row에는 텍스트 모드 유니버설 뉴라인 변환을 거친
//   개행문자(\n) 1개가 항상 포함된다. 그 상태에서 "rf2 = row[-228:]"(코스피 기준 228)로 뒤쪽 고정폭을
//   자른다 - 즉 실제 파이썬이 쓰는 경계 위치는 len(row_including_newline) - 228.
//   이 스크립트는 파싱 전에 모든 줄바꿈을 제거한 순수 데이터 줄(line, 개행 없음)을 다루므로
//   len(row_including_newline) = len(line) + 1 이 되고, 파이썬과 정확히 같은 경계 위치를 얻으려면
//   len(line) - (228 - 1) = len(line) - 227 을 써야 한다 - 즉 "공식 스펙 폭 - 1"이 이 스크립트에서
//   써야 할 실제 경계 폭이다(코스닥은 222 - 1 = 221).
// 그래도 이 파일 형식을 실측하지 못한 채로 만들었다는 근본적 한계가 있어, parseDomesticMst()는
// 파싱 결과의 일부 표본에 대해 "한글 종목명이 정상적으로 끝나는지"를 검사해 로그로 경고를 남긴다
// (validateParsedNames) - 실제로 뭔가 어긋났다면 첫 실행의 GitHub Actions 로그에서 바로 드러난다.
// 해외(cod) 쪽은 탭 구분 파일이라 이런 바이트 오프셋 문제가 아예 없다(안전).

const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

const MASTER_BASE_URL = 'https://new.real.download.dws.co.kr/common/master';
// [I-11 · Diff Gate] 기본은 예전 그대로 data/ticker-master.json이다. TICKER_MASTER_OUT이 있으면 그 경로에 쓴다 -
// workflow가 새 마스터를 임시 파일로 먼저 만들고, scripts/ticker-master-diff-gate.js가 변경량을 본 뒤에만
// 운영 파일 자리로 옮기게 하기 위함이다(이상 변경이 저장소에 먼저 반영되는 것을 막는다). 파싱 · 검증 로직은 무변경.
const OUT_PATH = process.env.TICKER_MASTER_OUT
  ? path.resolve(process.env.TICKER_MASTER_OUT)
  : path.join(__dirname, '..', 'data', 'ticker-master.json');
// 국내 전체(코스피+코스닥)만 정상 파싱되어도 수천 건이 나온다 - 이보다 훨씬 적으면 다운로드/파싱이
// 조용히 실패했을 가능성이 높다고 보고 커밋을 막는다(잘못된 소량 데이터로 기존 ticker-master.json을
// 덮어써서 검색 기능이 오히려 후퇴하는 사고를 예방).
const MIN_SANE_TOTAL_COUNT = 1500;

function download(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        download(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download_failed_status_${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// zip 안 첫 번째(=유일한) 엔트리를 cp949 텍스트로 디코딩한다. 원본 줄바꿈이 \r\n이든 \n이든 여기서
// \n 하나로 통일해(파이썬 텍스트 모드의 유니버설 뉴라인과 동일 효과) 이후 파싱에서 줄 끝에 남는
// 지저분한 \r을 걱정하지 않아도 되게 만든다.
function unzipSingleEntryAsText(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (!entries.length) throw new Error('empty_zip');
  const raw = entries[0].getData();
  return iconv.decode(raw, 'cp949').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// 문자열이 "정상적으로 끝난 종목명"처럼 보이는지 대략 판정한다 - 완성형 한글(가-힣), 영숫자, 괄호류로
// 끝나면 정상, 그 외 제어문자/사설영역 등 비정상 바이트로 끝나면 의심스러운 것으로 본다.
function looksLikeCleanName(name) {
  if (!name) return false;
  const lastChar = name[name.length - 1];
  const code = name.charCodeAt(name.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return true; // 완성형 한글
  return /[A-Za-z0-9)%&.·]/.test(lastChar);
}

// 파싱된 이름 표본(최대 200건) 중 "정상적으로 끝나 보이는" 비율을 계산해 경고 로그를 남긴다 -
// 파싱 자체를 막지는 않는다(문서 상단 주석 참고: 경계 계산은 실측이 아니라 수식 유도 기반이라
// 사람이 로그로 다시 확인할 수 있게 하는 안전장치일 뿐).
function validateParsedNames(exchange, items) {
  const sample = items.slice(0, 200);
  if (!sample.length) return;
  const cleanCount = sample.filter((i) => looksLikeCleanName(i.nameKr)).length;
  const ratio = cleanCount / sample.length;
  console.log(`  [${exchange}] 이름 형식 점검: 표본 ${sample.length}건 중 ${cleanCount}건 정상 종료(${(ratio * 100).toFixed(1)}%)`);
  if (ratio < 0.9) {
    console.error(`  [경고] [${exchange}] 정상 종료 비율이 낮습니다 - 고정폭 경계 계산이 틀렸을 가능성이 있으니 data/ticker-master.json의 이 시장 항목을 사람이 직접 확인해 주세요.`);
  }
}

/* [국내 코스피/코스닥 mst 파싱]
 * 뒤쪽 고정폭 70/62개 필드 중 **첫 필드(증권그룹구분코드, 2바이트)만** 읽는다.
 * [v267 · PC-3] 이 값이 "이 종목이 주권인가 ETF인가 리츠인가 예탁증서인가"라는 원천 사실이다.
 *   ST 주권 · EF ETF · RT 부동산투자회사 · DR 주식예탁증서 · FS 외국주권 ·
 *   MF 증권투자회사 · IF 사회간접자본투융자회사 · PF 선박투자회사 · SC 등
 * 실측(2026-09-22): KOSPI ST 892 · EF 1,176 · RT 23 / KOSDAQ ST 1,803 · FS 11 · DR 9.
 * 예전에는 이 사실이 없어 앱이 종목명 키워드로 자산군을 **추측**했다(js/01 classifyCategory).
 * 첫 필드만 읽는 이유: 위치가 경계에서 0부터 시작이라 나머지 필드의 오프셋 계산과 무관하다
 * (조사 단계에서 공개 field_specs 합계가 스펙 폭과 맞지 않아 그 뒤 필드는 위치를 확정하지 못했다 -
 *  확정하지 못한 것을 추측해 쓰지 않는다).
 * width 계산 근거는 파일 상단의 "[고정폭 파싱 - 경계 계산 근거]" 주석 참고. */
function parseDomesticMst(text, exchange) {
  const suffix = exchange === 'KOSPI' ? '.KS' : '.KQ';
  const specWidth = exchange === 'KOSPI' ? 228 : 222;
  const width = specWidth - 1;
  const lines = text.split('\n').filter((l) => l.length > 21);

  const items = [];
  for (const line of lines) {
    if (line.length <= width) continue;
    const front = line.slice(0, line.length - width);
    const back = line.slice(line.length - width);
    const code = front.slice(0, 9).trim();
    const nameKr = front.slice(21).trim();
    const securityGroup = back.slice(0, 2).trim().toUpperCase() || null;
    // [2차 통합 보완] KRX 영문 혼합 신규 코드(예: 0052D0)도 받는다 - js/01 KRX_SHORT_CODE_PATTERN과 같은 형식.
    if (!/^(?:\d{6}|\d{4}[A-Z]\d)$/.test(code) || !nameKr) continue; // 헤더/빈 줄/형식 이상 행은 조용히 건너뜀
    items.push({
      code,
      nameKr,
      nameEn: null, // KIS 국내 마스터에는 영문명 필드가 없다 - 임의로 지어내지 않고 null로 둔다
      market: 'KR',
      exchange,
      naverTicker: code,
      yahooTicker: code + suffix,
      // [v267] 원천 사실. 판정하지 않고 적힌 값을 그대로 옮긴다.
      securityGroup,
      currency: 'KRW' // 국내 상장 종목의 호가 통화는 예외 없이 원화다(거래소 규정).
    });
  }
  if (items.length) console.log(`  [${exchange}] 샘플: ${items.slice(0, 5).map((i) => `${i.nameKr}(${i.yahooTicker})`).join(', ')}`);
  validateParsedNames(exchange, items);
  return items;
}

// [해외 cod 파싱] 24개 컬럼 탭 구분(overseas_stock_code.py 기준), 첫 줄은 헤더라 건너뛴다.
// Security type이 2(Stock)/3(ETP·ETF)인 것만 남긴다(1=지수, 4=워런트는 "종목 검색" 취지와 안 맞음).
/* [v267 · PC-3] SECURITY_TYPE은 예전에도 읽었지만 **필터에만 쓰고 버렸다**. 이제 저장한다.
 * CURRENCY(호가 통화) · DR_FLAG(예탁증서 여부) · DR_COUNTRY(원 발행국)도 함께 담는다.
 * ⚠ DR_FLAG는 단독으로 신뢰할 수 없다 - 실측(2026-09-22) 널리 알려진 ADR 20건 중 8건만 'Y'였고
 *   ASML · JD · BABA 같은 명백한 예탁증서가 'N'이었다. 그래서 이 값은 **배제 신호 하나**로만 쓰고,
 *   판정은 거래소 공식 디렉터리의 증권 클래스와 교차검증한다(js/01 resolveUsListingClass). */
const OVERSEAS_COL = { SYMBOL: 4, KOREA_NAME: 6, ENGLISH_NAME: 7, SECURITY_TYPE: 8, CURRENCY: 9, DR_FLAG: 17, DR_COUNTRY: 18 };
function parseOverseasCod(text, exchangeLabel) {
  const lines = text.split('\n');
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length <= OVERSEAS_COL.SECURITY_TYPE) continue;
    const symbol = (cols[OVERSEAS_COL.SYMBOL] || '').trim();
    const secType = (cols[OVERSEAS_COL.SECURITY_TYPE] || '').trim();
    if (!symbol || (secType !== '2' && secType !== '3')) continue;
    const nameKr = (cols[OVERSEAS_COL.KOREA_NAME] || '').trim();
    const nameEn = (cols[OVERSEAS_COL.ENGLISH_NAME] || '').trim();
    items.push({
      code: symbol,
      nameKr: nameKr || null,
      nameEn: nameEn || symbol,
      market: 'US',
      exchange: exchangeLabel,
      naverTicker: symbol,
      yahooTicker: symbol.toUpperCase(),
      // [v267] 원천 사실. 2 = Stock · 3 = ETP(ETF).
      securityType: secType,
      currency: (cols[OVERSEAS_COL.CURRENCY] || '').trim().toUpperCase() || null,
      drFlag: (cols[OVERSEAS_COL.DR_FLAG] || '').trim().toUpperCase() || null,
      drCountry: (cols[OVERSEAS_COL.DR_COUNTRY] || '').trim().toUpperCase() || null
    });
  }
  if (items.length) console.log(`  [${exchangeLabel}] 샘플: ${items.slice(0, 5).map((i) => `${i.nameEn}(${i.yahooTicker})`).join(', ')}`);
  return items;
}

/* [v267 · PC-8] 거래소 공식 종목 디렉터리.
 * Nasdaq Trader가 배포하는 상장 종목 파일로, 인증 없이 받을 수 있는 공개 자료다
 * (KIS 마스터와 같은 성격의 1차 자료 - EG 규칙의 "거래소" A등급).
 * 여기서만 얻을 수 있는 두 가지 사실을 가져온다.
 *   1) ETF 플래그 - 거래소가 직접 표시한 값(실측 13,261 심볼 중 Y 5,712)
 *   2) 증권 클래스 - 종목명 끝에 붙는 거래소 표기
 *      "Common Stock"(미국 보통주) · "Ordinary Shares"(외국 발행인) ·
 *      "American Depositary Shares" · "New York Registry Shares" ·
 *      "Class A Subordinate Voting Shares" · "Closed End Fund" 등
 * KIS 마스터가 놓치는 것을 이쪽이 잡고(예: AZN은 KIS에 ADR 표기가 없지만 여기서는 Ordinary Shares),
 * 이쪽이 놓치는 것을 KIS가 잡는다(예: BP · TM은 여기서 Common Stock이지만 KIS 한글명이 (ADR)).
 * 그래서 둘을 **교차검증**해야 하며, 어느 한쪽만으로 판정하지 않는다. */
const EXCHANGE_DIRECTORIES = [
  { url: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', symbolCol: 0, nameCol: 1, etfCol: 6 },
  { url: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', symbolCol: 0, nameCol: 1, etfCol: 4 }
];
async function fetchExchangeDirectory() {
  const bySymbol = new Map();
  for (const spec of EXCHANGE_DIRECTORIES) {
    console.log('[다운로드] 거래소 종목 디렉터리 ' + spec.url.split('/').pop() + ' ...');
    const buf = await download(spec.url);
    const lines = buf.toString('latin1').split('\n').filter((l) => l.trim());
    for (const line of lines.slice(1)) {
      // 파일 마지막 줄은 "File Creation Time: ..." 안내라 컬럼 수가 맞지 않는다.
      const cols = line.split('|');
      if (cols.length < 4 || /^File Creation/i.test(cols[0])) continue;
      const symbol = (cols[spec.symbolCol] || '').trim().toUpperCase();
      if (!symbol) continue;
      bySymbol.set(symbol, {
        isEtf: (cols[spec.etfCol] || '').trim().toUpperCase() === 'Y',
        securityName: (cols[spec.nameCol] || '').trim()
      });
    }
  }
  console.log('[파싱 완료] 거래소 종목 디렉터리: ' + bySymbol.size + '건');
  return bySymbol;
}

async function fetchAndParse(fileBase, parseFn, label) {
  console.log(`[다운로드] ${label} (${fileBase}.zip) ...`);
  const zipBuf = await download(`${MASTER_BASE_URL}/${fileBase}.zip`);
  const text = unzipSingleEntryAsText(zipBuf);
  const items = parseFn(text, label);
  console.log(`[파싱 완료] ${label}: ${items.length}건`);
  return items;
}

async function main() {
  const targets = [
    ['kospi_code.mst', parseDomesticMst, 'KOSPI'],
    ['kosdaq_code.mst', parseDomesticMst, 'KOSDAQ'],
    ['nasmst.cod', parseOverseasCod, 'NASDAQ'],
    ['nysmst.cod', parseOverseasCod, 'NYSE'],
    ['amsmst.cod', parseOverseasCod, 'AMEX']
  ];

  const all = [];
  const failedMarkets = [];
  for (const [fileBase, parseFn, label] of targets) {
    try {
      const items = await fetchAndParse(fileBase, parseFn, label);
      all.push(...items);
    } catch (e) {
      // 시장 하나가 실패해도(일시적 다운로드 오류 등) 나머지 시장은 계속 진행한다 - 부분 성공도
      // 아예 안 하는 것보다는 낫다. 다만 실패 목록을 모아 마지막에 명확히 보고한다.
      console.error(`[실패] ${label}: ${e.message}`);
      failedMarkets.push(label);
    }
  }

  /* [v267] 미국 종목에 거래소 공식 디렉터리 사실을 덧붙인다.
   * 이 단계가 실패해도 종목 마스터 생성 자체는 계속한다 - 기존 필드는 그대로이고,
   * 새 필드가 없으면 앱이 그 사실을 "모름"으로 처리하도록 되어 있다(추측하지 않는다). */
  let directory = null;
  try {
    directory = await fetchExchangeDirectory();
  } catch (e) {
    console.error('[실패] 거래소 종목 디렉터리: ' + e.message + ' - 미국 종목의 ETF 플래그 · 증권 클래스 없이 진행합니다.');
    failedMarkets.push('EXCHANGE_DIRECTORY');
  }
  if (directory) {
    let matched = 0;
    for (const item of all) {
      if (item.market !== 'US') continue;
      const hit = directory.get(item.yahooTicker);
      if (!hit) continue;
      matched++;
      item.isEtf = hit.isEtf;
      item.securityName = hit.securityName;
    }
    console.log('[병합] 거래소 디렉터리와 일치한 미국 종목: ' + matched + '건');
  }

  // 같은 야후 티커가 여러 소스에 중복 등장하면(이론상 없어야 하지만 방어적으로) 먼저 나온 것만 남긴다.
  const seen = new Set();
  const deduped = all.filter((item) => {
    if (seen.has(item.yahooTicker)) return false;
    seen.add(item.yahooTicker);
    return true;
  });

  const counts = deduped.reduce((acc, item) => {
    acc[item.exchange] = (acc[item.exchange] || 0) + 1;
    return acc;
  }, {});
  console.log('[집계]', JSON.stringify(counts));

  if (deduped.length < MIN_SANE_TOTAL_COUNT) {
    console.error(`[중단] 총 ${deduped.length}건은 비정상적으로 적습니다(최소 기준 ${MIN_SANE_TOTAL_COUNT}건) - 다운로드/파싱이 실제로는 실패했을 가능성이 높아 기존 data/ticker-master.json을 덮어쓰지 않고 종료합니다.`);
    process.exit(1);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'KIS 공식 종목 마스터(new.real.download.dws.co.kr, 인증 불필요 정적 다운로드) + 거래소 공식 종목 디렉터리(Nasdaq Trader, 미국분) 기반, 매달 1일 GitHub Actions가 자동 생성',
    schemaVersion: 2, // [v267] securityGroup · securityType · currency · drFlag · drCountry · isEtf · securityName 추가
    failedMarkets,
    counts,
    items: deduped
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output));
  console.log(`[완료] 총 ${deduped.length}건 -> ${path.relative(process.cwd(), OUT_PATH)}`);
  if (failedMarkets.length) console.error(`[경고] 일부 시장 다운로드 실패: ${failedMarkets.join(', ')} - 해당 시장은 이번 결과에서 빠졌습니다.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[치명적 오류]', e);
    process.exit(1);
  });
}

// [테스트 전용 export] test/ticker-master-parse.test.js가 네트워크 호출(main) 없이 순수 파싱 함수만
// 검증할 수 있도록 노출한다 - 브라우저에서는 이 파일 자체를 로드하지 않으므로 영향 없음.
module.exports = { parseDomesticMst, parseOverseasCod, looksLikeCleanName };
