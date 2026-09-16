// AllianzGI "Long-Term Capital Market Assumptions - Highlights" PDF 해석기.
//
// PDF는 `pdftotext -raw`로 글자 순서 그대로 뽑은 텍스트를 받는다(-layout은 2단 배치 때문에 표의 열이 섞인다 -
// 2026 Q1 원문에서 실제로 확인). 표 한 행은 다음 형태다:
//   <자산군>[*] <10년 기대수익률>%  <전 분기 대비>% <10년 기대 변동성>%  <전 분기 대비>% <Developed World Equities와의 상관>
// '*'는 원문 범례 "Hedge to USD"다. 예상 형태와 다르면 추측하지 않고 오류를 던진다.
'use strict';

const { CmaParseError } = require('./jpm-ltcma-csv.js');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROW_RE = /^(.+?)(\*?)\s+(-?\d+\.\d)%\s+(-?\d+\.\d)%\s+(-?\d+\.\d)%\s+(-?\d+\.\d)%\s+(-?\d\.\d{2})$/;
// 원문 표의 머리글 - "CORRELATION / Developed World / Equities" 세 줄. 기준 자산군 이름은 여기서만 정한다.
const REFERENCE_CLASS = 'Developed World Equities';

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * @param {string} text pdftotext -raw 결과
 * @returns {{ releaseYear, releaseQuarter, edition, asOfDate, currency, horizonYears, publishedAt, assetClasses,
 *            expectedReturn, volatility, hedgedToUsd, changeVsPreviousQuarter, correlationMatrix }}
 */
function parseAllianzgiCmaText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new CmaParseError('PDF 텍스트가 비어 있습니다.');
  // 표의 "전 분기 대비" 칸 앞 화살표는 PDF 전용 기호 글꼴이라 UTF-8 추출 시 사용자 정의 영역(U+E000~F8FF) 문자로 나온다 -
  // 방향은 바로 뒤 숫자의 부호에 이미 있으므로 공백으로 바꾼다.
  const norm = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[\ue000-\uf8ff]/g, ' ');
  const lines = norm.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  const rel = /RELEASED IN Q([1-4]) (\d{4})/.exec(norm);
  if (!rel) throw new CmaParseError('발행 분기("RELEASED IN Qn YYYY")를 찾지 못했습니다.');
  const releaseQuarter = Number(rel[1]), releaseYear = Number(rel[2]);

  const asOf = /Assumptions as at (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4}) \(in ([A-Z]{3})\)/.exec(norm);
  if (!asOf) throw new CmaParseError('기준일("Assumptions as at …(in USD)")을 찾지 못했습니다.');
  const asOfDate = `${asOf[3]}-${pad2(MONTHS.indexOf(asOf[2]) + 1)}-${pad2(asOf[1])}`;
  const currency = asOf[4];
  const dataAsAt = /Data as at (\d{1,2}) (\w+) (\d{4}) and in ([A-Z]{3}) terms/.exec(norm);
  if (!dataAsAt || `${dataAsAt[3]}-${pad2(MONTHS.indexOf(dataAsAt[2]) + 1)}-${pad2(dataAsAt[1])}` !== asOfDate || dataAsAt[4] !== currency) {
    throw new CmaParseError('표 머리글과 출처 문구의 기준일 · 통화가 일치하지 않습니다.');
  }
  const hz = /investment horizon of (\d+) years/.exec(norm.replace(/\s+/g, ' '));
  if (!hz) throw new CmaParseError('투자기간("investment horizon of N years")을 찾지 못했습니다.');
  const horizonYears = Number(hz[1]);

  // 발행 월 - 면책 문구 끝의 단독 "Month YYYY" 줄(마지막 것).
  const monthLines = lines.filter((l) => new RegExp(`^(${MONTHS.join('|')}) \\d{4}$`).test(l));
  if (monthLines.length === 0) throw new CmaParseError('발행 월("Month YYYY")을 찾지 못했습니다.');
  const pm = monthLines[monthLines.length - 1].split(' ');
  const publishedAt = `${pm[1]}-${pad2(MONTHS.indexOf(pm[0]) + 1)}`;

  const headerOk = /CORRELATION\s+Developed World\s+Equities/.test(norm.replace(/\n/g, ' '));
  if (!headerOk) throw new CmaParseError('상관 열 머리글("CORRELATION Developed World Equities")을 찾지 못했습니다.');

  const assetClasses = [], expectedReturn = {}, volatility = {}, hedgedToUsd = {}, changeVsPreviousQuarter = {}, values = {};
  lines.forEach((l) => {
    const m = ROW_RE.exec(l);
    if (!m) return;
    const name = m[1].trim();
    if (assetClasses.includes(name)) throw new CmaParseError(`자산군 "${name}"이 두 번 나옵니다.`);
    assetClasses.push(name);
    hedgedToUsd[name] = m[2] === '*';
    expectedReturn[name] = Number(m[3]);
    volatility[name] = Number(m[5]);
    changeVsPreviousQuarter[name] = { expectedReturn: Number(m[4]), volatility: Number(m[6]) };
    values[name] = Number(m[7]);
  });
  if (assetClasses.length < 10) throw new CmaParseError(`표 행을 ${assetClasses.length}개만 찾았습니다.`);
  if (!assetClasses.includes(REFERENCE_CLASS)) throw new CmaParseError(`상관 기준 자산군 "${REFERENCE_CLASS}" 행이 없습니다.`);

  return {
    releaseYear, releaseQuarter, edition: `${releaseYear}Q${releaseQuarter}`,
    asOfDate, currency, horizonYears, publishedAt,
    assetClasses, expectedReturn, volatility, hedgedToUsd, changeVsPreviousQuarter,
    correlationMatrix: { kind: 'VERSUS_REFERENCE', referenceClass: REFERENCE_CLASS, values }
  };
}

module.exports = { parseAllianzgiCmaText, ALLIANZGI_REFERENCE_CLASS: REFERENCE_CLASS };
