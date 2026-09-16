// J.P. Morgan Long-Term Capital Market Assumptions - 공식 interactive matrix 데이터 파일(CSV) 해석기.
//
// 원문: https://am.jpmorgan.com/.../ltcma/interactive-assumptions-matrices/ 페이지가 불러오는
//       https://cdn.jpmorganfunds.com/content/dam/jpm-am-aem/global/en/institutional/interactive-matrix/data/<통화>.csv
// 파일 구조(2026 edition에서 확인):
//   1행: ,,Compound Return YYYY (%),Arithmetic Return YYYY (%),Annualized Volatility (%),Compound Return YYYY-1 (%),<첫 자산군>,,,
//   i행: <구분>,<자산군>,<복리>,<산술>,<변동성>,<전년 복리>,<상관 0..i (하삼각, 마지막 = 1)>,<다음 자산군 이름>,,,
// 구조가 조금이라도 다르면 추측해서 읽지 않고 오류를 던진다(열 밀림을 정상값으로 받아들이지 않는다).
'use strict';

const HEADER_PATTERNS = [
  /^Compound Return (\d{4}) \(%\)$/,
  /^Arithmetic Return (\d{4}) \(%\)$/,
  /^Annualized Volatility \(%\)$/,
  /^Compound Return (\d{4}) \(%\)$/
];

class CmaParseError extends Error {
  constructor(message) { super(message); this.code = 'PARSE_FAILED'; }
}

// 따옴표를 포함한 최소 CSV 분리(이 파일은 따옴표를 쓰지 않지만, 쓰더라도 깨지지 않게 한다).
function splitCsvLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 자산군 이름 정리 - 원문 파일의 줄바꿈 없는 공백(NBSP)을 일반 공백으로 바꾸고 앞뒤 공백만 지운다(철자는 그대로).
function cleanName(s) {
  return String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toNumber(raw, where) {
  const t = String(raw ?? '').trim();
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t)) throw new CmaParseError(`${where}: 숫자가 아닙니다 ("${t}")`);
  return Number(t);
}

/**
 * @param {string} text CSV 원문(UTF-8로 디코딩한 문자열)
 * @returns {{ edition, previousEdition, assetClasses, segments, expectedReturn, arithmeticReturn, volatility, previousCompoundReturn, correlationMatrix }}
 */
function parseJpmLtcmaCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new CmaParseError('파일이 비어 있습니다.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 3) throw new CmaParseError('행이 너무 적습니다.');
  const header = splitCsvLine(lines[0]).map(cleanName);
  if (header[0] !== '' || header[1] !== '') throw new CmaParseError('1행 앞 두 칸이 비어 있지 않습니다.');
  const hm = HEADER_PATTERNS.map((re, i) => re.exec(header[2 + i]));
  if (hm.some((m) => !m)) throw new CmaParseError(`1행 머리글이 예상 형식과 다릅니다: ${header.slice(2, 6).join(' / ')}`);
  const edition = Number(hm[0][1]);
  if (Number(hm[1][1]) !== edition) throw new CmaParseError('복리 · 산술 수익률 머리글의 연도가 다릅니다.');
  const previousEdition = Number(hm[3][1]);
  if (previousEdition !== edition - 1) throw new CmaParseError('전년 복리 수익률 머리글의 연도가 예상과 다릅니다.');

  const rows = lines.slice(1).map(splitCsvLine);
  const n = rows.length;
  const assetClasses = [], segments = {}, expectedReturn = {}, arithmeticReturn = {}, volatility = {}, previousCompoundReturn = {};
  const matrix = Array.from({ length: n }, () => new Array(n).fill(null));
  const firstName = cleanName(header[6]);
  rows.forEach((r, i) => {
    const name = cleanName(r[1]);
    if (!name) throw new CmaParseError(`${i + 2}행: 자산군 이름이 없습니다.`);
    if (i === 0 && name !== firstName) throw new CmaParseError(`첫 자산군 이름이 1행 머리글("${firstName}")과 다릅니다("${name}").`);
    if (assetClasses.includes(name)) throw new CmaParseError(`${i + 2}행: 자산군 "${name}"이 중복됩니다.`);
    assetClasses.push(name);
    segments[name] = cleanName(r[0]);
    expectedReturn[name] = toNumber(r[2], `${name} 복리 수익률`);
    arithmeticReturn[name] = toNumber(r[3], `${name} 산술 수익률`);
    volatility[name] = toNumber(r[4], `${name} 변동성`);
    previousCompoundReturn[name] = String(r[5] ?? '').trim() === '' ? null : toNumber(r[5], `${name} 전년 복리 수익률`);
    for (let j = 0; j <= i; j++) {
      const v = toNumber(r[6 + j], `${name} 상관(${j + 1}번째)`);
      matrix[i][j] = v;
      matrix[j][i] = v;
    }
    // 하삼각 바로 다음 칸 = 다음 행 자산군 이름(계단형 머리글). 마지막 행은 비어 있어야 한다.
    const nextLabel = cleanName(r[6 + i + 1]);
    const expectedNext = i + 1 < n ? cleanName(rows[i + 1][1]) : '';
    if (nextLabel !== expectedNext) throw new CmaParseError(`${i + 2}행: 상관 칸 수가 예상과 다릅니다("${nextLabel}" ≠ "${expectedNext}").`);
    const trailing = r.slice(6 + i + 2).filter((c) => String(c).trim() !== '');
    if (trailing.length) throw new CmaParseError(`${i + 2}행: 상관 칸 뒤에 예상하지 못한 값이 있습니다.`);
  });
  return {
    edition, previousEdition, assetClasses, segments, expectedReturn, arithmeticReturn, volatility, previousCompoundReturn,
    correlationMatrix: { kind: 'FULL', classes: assetClasses.slice(), matrix }
  };
}

module.exports = { parseJpmLtcmaCsv, CmaParseError, cleanName };
