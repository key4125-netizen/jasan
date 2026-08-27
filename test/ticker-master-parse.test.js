// scripts/update-ticker-master.js의 순수 파싱 함수 검증 - 네트워크/실제 KIS 파일 없이, 문서화된
// 포맷 규칙(파이썬 공식 파서 기준 필드 폭/컬럼 순서)을 그대로 흉내 낸 합성 데이터로 확인한다.
// 실행: node --test test/ticker-master-parse.test.js
const assert = require('node:assert');
const { test } = require('node:test');
const { parseDomesticMst, parseOverseasCod, looksLikeCleanName } = require('../scripts/update-ticker-master.js');

// [코스피 합성 라인 생성] 파이썬 공식 파서 기준 실제 파일의 한 줄은 "코드(9)+표준코드(12)+한글명" +
// 고정폭 227자(=공식 스펙 228 - 개행 1바이트, 파일 상단 주석 근거) 순서다. 이 헬퍼는 그 실제 구조를
// 그대로 재현해 만든다(임의의 오프셋을 가정하지 않고, parseDomesticMst가 실제로 기대하는 바이트
// 배치를 정확히 흉내냄으로써 파싱 로직 자체를 검증한다).
function makeKospiLine(code, nameKr) {
  const codeField = code.padEnd(9, ' ');
  const stdCodeField = 'KR7005930003'.padEnd(12, ' ').slice(0, 12);
  const tail = '0'.repeat(227); // 실제 필드 내용은 이 테스트에서 중요하지 않음(코드/이름만 검증 대상)
  return codeField + stdCodeField + nameKr + tail;
}

test('parseDomesticMst - 코스피 정상 라인에서 코드/한글명을 정확히 추출한다', () => {
  const line = makeKospiLine('005930', '삼성전자');
  const items = parseDomesticMst(line, 'KOSPI');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].code, '005930');
  assert.strictEqual(items[0].nameKr, '삼성전자');
  assert.strictEqual(items[0].yahooTicker, '005930.KS');
  assert.strictEqual(items[0].market, 'KR');
  assert.strictEqual(items[0].nameEn, null);
});

test('parseDomesticMst - 코스닥은 .KQ 접미사를 쓰고 고정폭 221을 기준으로 자른다', () => {
  const codeField = '247540'.padEnd(9, ' ');
  const stdCodeField = 'KR7247540008'.padEnd(12, ' ').slice(0, 12);
  const tail = '9'.repeat(221); // 코스닥 공식 스펙 222 - 1
  const line = codeField + stdCodeField + '에코프로비엠' + tail;
  const items = parseDomesticMst(line, 'KOSDAQ');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].yahooTicker, '247540.KQ');
  assert.strictEqual(items[0].nameKr, '에코프로비엠');
});

test('parseDomesticMst - 여러 줄과 형식이 깨진 줄이 섞여도 정상 줄만 살아남는다', () => {
  const good1 = makeKospiLine('005930', '삼성전자');
  const good2 = makeKospiLine('000660', 'SK하이닉스');
  const badCode = 'ABCDEFG  ' + 'x'.repeat(12) + '이상한코드' + '0'.repeat(227); // 코드가 6자리 숫자가 아님
  const text = [good1, good2, badCode].join('\n');
  const items = parseDomesticMst(text, 'KOSPI');
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items.map((i) => i.code).sort(), ['000660', '005930']);
});

test('looksLikeCleanName - 완성형 한글/영숫자로 끝나면 정상, 제어문자로 끝나면 비정상으로 본다', () => {
  assert.strictEqual(looksLikeCleanName('삼성전자'), true);
  assert.strictEqual(looksLikeCleanName('TIGER 미국S&P500'), true);
  assert.strictEqual(looksLikeCleanName('이상한이름\x01'), false);
  assert.strictEqual(looksLikeCleanName(''), false);
});

// [해외 합성 라인] overseas_stock_code.py가 실제로 쓰는 24개 컬럼 탭 구분 순서를 그대로 재현한다
// (Symbol=index4, Korea name=index6, English name=index7, Security type=index8).
function makeOverseasLine(symbol, nameKr, nameEn, securityType) {
  const cols = new Array(24).fill('');
  cols[0] = 'US'; cols[1] = '1'; cols[2] = 'NAS'; cols[3] = 'NASDAQ';
  cols[4] = symbol; cols[5] = symbol; cols[6] = nameKr; cols[7] = nameEn; cols[8] = securityType;
  return cols.join('\t');
}

test('parseOverseasCod - 헤더 줄을 건너뛰고 Stock/ETF만 남긴다', () => {
  const header = makeOverseasLine('SYM', 'HDR_KR', 'HDR_EN', '9'); // 첫 줄(헤더)은 무조건 스킵
  const apple = makeOverseasLine('AAPL', '애플', 'Apple Inc', '2');
  const qqq = makeOverseasLine('QQQ', '', 'Invesco QQQ Trust', '3');
  const nasdaqIndex = makeOverseasLine('.IXIC', '나스닥종합지수', 'NASDAQ Composite', '1'); // 지수 - 제외 대상
  const warrant = makeOverseasLine('WARR', '', 'Some Warrant', '4'); // 워런트 - 제외 대상
  const text = [header, apple, qqq, nasdaqIndex, warrant].join('\n');

  const items = parseOverseasCod(text, 'NASDAQ');
  assert.strictEqual(items.length, 2);
  const aapl = items.find((i) => i.code === 'AAPL');
  assert.ok(aapl);
  assert.strictEqual(aapl.nameEn, 'Apple Inc');
  assert.strictEqual(aapl.nameKr, '애플');
  assert.strictEqual(aapl.yahooTicker, 'AAPL');
  assert.strictEqual(aapl.market, 'US');
  const qqqItem = items.find((i) => i.code === 'QQQ');
  assert.strictEqual(qqqItem.nameKr, null); // 빈 한글명은 null로 정규화
});

test('parseOverseasCod - 심볼이 없는 줄은 건너뛴다', () => {
  const blank = makeOverseasLine('', '', '', '2');
  const items = parseOverseasCod(['header', blank].join('\n'), 'NYSE');
  assert.strictEqual(items.length, 0);
});
