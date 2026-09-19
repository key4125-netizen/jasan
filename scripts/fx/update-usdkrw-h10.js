// ============================================================================
// Smart Asset Manager - 연준 H.10 일별 USD/KRW → data/fx/usdkrw-h10.json (T6 · §44 44-15)
// ============================================================================
// GitHub Actions(.github/workflows/update-fx-h10.yml)가 주 1회 이 스크립트를 실행해 정적 JSON을 갱신한다.
// 브라우저(index.html/js/*)는 이 파일을 로드하지 않는다 - Node 전용 오프라인 배치 스크립트다.
// 앱(js/09 getRiskUsdKrwRates)은 여기서 만든 JSON만 읽고, H.10 원문을 실행 중에 조회하지 않는다.
//
// [출처 · 이용 조건] Board of Governors of the Federal Reserve System, H.10 Foreign Exchange Rates,
//   "Historical Rates for the South Korean Won"(달러당 원화, 뉴욕 정오 매입환율 · 뉴욕연준 인증).
//   연준 웹사이트 정책: 게시 정보는 public domain이며 허가 없이 복사 · 배포할 수 있고, 연준을 출처로
//   표기할 것. API 키 · 인증 불필요.
//
// [안전 원칙] 새 데이터가 검증을 통과한 뒤에만 기존 파일을 교체한다. 파싱 · 품질 검사에 실패하면
// 기존 known-good JSON을 그대로 두고 실패 코드(1)로 끝낸다 - 빈 파일 · 부분 데이터로 덮어쓰지 않는다.
// 새 결과가 기존 파일보다 짧아지거나(시작일이 늦어지거나 끝일이 앞당겨지거나 유효 행이 줄면) 거부한다.

const fs = require('node:fs');
const path = require('node:path');

const H10_URL = 'https://www.federalreserve.gov/releases/h10/hist/dat00_ko.htm';
const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'fx', 'usdkrw-h10.json');
// 명백한 단위 오류(예: 1/1000 스케일)만 걸러내는 넓은 범위다. 실제 환율 변동을 막지 않도록 좁히지 않는다.
const RATE_SANITY_MIN = 100;
const RATE_SANITY_MAX = 10000;
const MIN_VALID_ROWS = 5000; // 2000-01부터 약 6,700일 - 이보다 적으면 표를 제대로 읽지 못한 것이다

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

// H.10 HTML → [{ date: 'YYYY-MM-DD', value: number|null(ND) }]. 형식이 다르면 예외를 던진다.
function parseH10Html(htmlText) {
  if (typeof htmlText !== 'string' || !htmlText) throw new Error('빈 응답');
  const text = htmlText.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  if (!/Historical Rates for the South Korean Won/i.test(text)) throw new Error('원화 환율 표 제목을 찾을 수 없음');
  if (!/South Korean won per U\.S\. dollar/i.test(text)) throw new Error('단위(달러당 원화) 표기를 찾을 수 없음');
  const rows = [];
  const re = /\b(\d{1,2})-([A-Z]{3})-(\d{2})\s+(ND|\d+(?:\.\d+)?)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const month = MONTHS[m[2]];
    if (!month) throw new Error(`월 표기를 읽을 수 없음: ${m[0]}`);
    const yy = Number(m[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    const date = `${year}-${month}-${String(m[1]).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`날짜를 읽을 수 없음: ${m[0]}`);
    rows.push({ date, value: m[4] === 'ND' ? null : Number(m[4]) });
  }
  return rows;
}

// 파싱 결과 품질 검사. 통과하면 JSON 객체를, 아니면 예외를 던진다.
function buildUsdKrwDataset(rows, { todayISO, fetchedAt, previous } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('파싱 결과가 비어 있음');
  const rates = [];
  let prev = null;
  let ndCount = 0;
  for (const r of rows) {
    if (prev !== null && r.date <= prev) throw new Error(`날짜 중복 또는 역순: ${prev} → ${r.date}`);
    if (todayISO && r.date > todayISO) throw new Error(`미래 날짜: ${r.date}`);
    prev = r.date;
    if (r.value === null) { ndCount++; continue; }
    if (typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value <= 0) throw new Error(`환율 값 오류: ${r.date}`);
    if (r.value < RATE_SANITY_MIN || r.value > RATE_SANITY_MAX) throw new Error(`비정상 환율: ${r.date} ${r.value}`);
    rates.push([r.date, r.value]);
  }
  if (rates.length < MIN_VALID_ROWS) throw new Error(`유효 행 ${rates.length}개 - 최소 ${MIN_VALID_ROWS}개보다 적음`);
  const dataset = {
    schemaVersion: 1,
    source: 'Board of Governors of the Federal Reserve System, H.10 Foreign Exchange Rates',
    series: 'Historical Rates for the South Korean Won (daily)',
    quote: 'KRW per USD',
    observation: 'Noon buying rates in New York for cable transfers, certified by the Federal Reserve Bank of New York',
    url: H10_URL,
    license: 'Public domain (federalreserve.gov website policy: may be copied and distributed without permission; cite the Board as the source)',
    usage: 'Risk 통계 전용 - 가격통화 USD 종목의 조정주가를 원화로 환산(§44 44-15). ND(휴일 · 미게시)는 행에서 제외하며 채우지 않는다.',
    fetchedAt: fetchedAt || new Date().toISOString(),
    startDate: rates[0][0],
    endDate: rates[rates.length - 1][0],
    rowCount: rows.length,
    validCount: rates.length,
    ndCount,
    rates
  };
  if (previous && Array.isArray(previous.rates) && previous.rates.length) {
    if (dataset.startDate !== previous.startDate) throw new Error(`시작일이 바뀜: ${previous.startDate} → ${dataset.startDate}`);
    if (dataset.endDate < previous.endDate) throw new Error(`끝일이 앞당겨짐: ${previous.endDate} → ${dataset.endDate}`);
    if (dataset.validCount < previous.validCount) throw new Error(`유효 행이 줄어듦: ${previous.validCount} → ${dataset.validCount}`);
  }
  return dataset;
}

// 임시 파일에 쓰고 다시 읽어 검증한 뒤 rename으로 교체한다(중간 상태의 파일이 남지 않게).
function writeDatasetAtomically(dataset, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(dataset));
  try {
    const back = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    if (!back || back.validCount !== dataset.validCount || back.endDate !== dataset.endDate) throw new Error('임시 파일 재검증 실패');
    fs.renameSync(tmp, outPath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* 임시 파일이 이미 없으면 무시 */ }
    throw e;
  }
}

function readPrevious(outPath) {
  try { return JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { return null; }
}

async function main() {
  const res = await fetch(H10_URL, { headers: { 'User-Agent': 'jasan-fx-updater (static data build)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const rows = parseH10Html(html);
  const dataset = buildUsdKrwDataset(rows, {
    todayISO: new Date().toISOString().slice(0, 10),
    previous: readPrevious(OUT_PATH)
  });
  writeDatasetAtomically(dataset, OUT_PATH);
  console.log(`[완료] ${dataset.startDate} ~ ${dataset.endDate} · 전체 ${dataset.rowCount}행 · 유효 ${dataset.validCount} · ND ${dataset.ndCount} -> ${path.relative(process.cwd(), OUT_PATH)}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[중단] ${e.message} - 기존 ${path.relative(process.cwd(), OUT_PATH)}를 그대로 둡니다.`);
    process.exit(1);
  });
}

// [테스트 전용 export] test/fx-h10-pipeline.test.js가 네트워크 없이 파싱 · 검증 함수만 검사한다.
module.exports = { parseH10Html, buildUsdKrwDataset, writeDatasetAtomically, H10_URL };
