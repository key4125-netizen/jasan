// [앱 전체 문구 점검] 사용자에게 보이는 문구 회귀 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/wording-review.test.js
//
// 계산 · 정책은 바꾸지 않았다. 여기서는 "사실과 다르거나 근거 없이 안정을 단정하는 문구 · 내부 코드 · 영문 라벨"이
// 화면에 다시 나오지 않는지만 고정한다.

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./risk-sandbox.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('P0 - 위험 진단 한 줄 요약의 대체 문장은 안정하다고 단정하지 않는다', () => {
  const s = H.loadRiskSandbox();
  // 상관 점수가 가장 높지만 종목이 1개라 상관 쌍이 없는 경우 - 예전에는 "비교적 안정적으로 분산"이라고 했다.
  const line = s.buildRiskDiagnosisLine({
    subScores: { concentration: 10, volatility: 10, drawdown: 10, market: 10, correlation: 90, technical: 10 },
    topCorrelationPair: null, topHolding: null
  });
  assert.ok(!/안정/.test(line), line);
  assert.ok(line.includes('세부내용'), line);
});

test('P0 - 저장 안내는 클라우드 동기화 사실과 맞고 "외부로 전송되지 않습니다"라고 하지 않는다', () => {
  const html = read('index.html');
  assert.ok(!html.includes('localStorage에만 저장되며 외부로 전송되지 않습니다'));
  assert.ok(html.includes('가족 동기화를 켠 경우에만 암호화된 상태로 클라우드에도 보관됩니다'));
});

test('P0 - 역베타 가중 참고 배분을 "AI 최적 추천"이라고 부르지 않는다', () => {
  // 화면에 보이지 않는 HTML 주석(개발 메모)은 검사 대상이 아니다.
  assert.ok(!read('index.html').replace(/<!--[\s\S]*?-->/g, '').includes('AI 최적'));
  assert.ok(!/['"`][^'"`\n]*AI 최적[^'"`\n]*['"`]/.test(read('js/04-rebalancing.js')));
  assert.ok(read('index.html').includes('시장 민감도(베타) 기준 참고 비중 전체 적용'));
});

test('P1 - 화면 문구에 영문 라벨 · 내부 코드가 남지 않는다', () => {
  const html = read('index.html');
  ['Simulation 횟수', '(Fast)', '(Standard)', '(High Precision)', '복호화에 실패', '시스템 자동 매칭', 'RISK 상세 분석 &amp; 시뮬레이션', '상세 리스크 관리 이동']
    .forEach((w) => assert.ok(!html.includes(w), w));
  const adapter = read('js/16-monte-carlo-adapter.js');
  assert.ok(!adapter.includes('(ACTIVE 세트)'));
  assert.ok(!adapter.includes('불러오지 못했습니다(${e.code})'));
  assert.ok(!read('js/21-safety-layer.js').includes("'Fee 값 오류'"));
  assert.ok(!read('js/06-transactions.js').includes('등록되지 않은 키'));
  assert.ok(!read('js/05-future-projection.js').includes('위험:안전 70:30으로 계산'));
  assert.ok(!read('js/12-import-export-sync.js').includes('assets 배열 없음'));
  // 매크로 지표 팝업도 같은 차트를 쓰므로 실패 문구에 "주가"를 쓰지 않는다.
  assert.ok(read('js/08-detail-modal-fx.js').includes("msgEl.textContent = '차트를 불러오지 못했습니다. 잠시 후 다시 열어 보세요.'"));
});

test('P1 - 운용보수 값 오류는 한국어 제목으로 나온다(판정 코드 · 등급은 그대로)', () => {
  const safety = require('../js/21-safety-layer.js');
  const neg = safety.assessFee(-1, '테스트ETF', true);
  assert.strictEqual(neg.length, 1);
  assert.strictEqual(neg[0].title, '운용보수 값 오류');
  assert.strictEqual(neg[0].code, 'SAFETY_INVALID_FEE');
  assert.strictEqual(neg[0].severity, 'BLOCK');
  const over = safety.assessFee(100, '테스트ETF', true);
  assert.strictEqual(over[0].title, '운용보수 값 오류');
  assert.strictEqual(over[0].severity, 'BLOCK');
});
