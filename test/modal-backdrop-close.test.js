/* [PM 지시 2026-09-26 · ISSUE-A] 모달 배경(오버레이) 클릭으로 닫기 - 전 팝업 일관성 고정.
 *
 * 1차 전수 테스트에서 팝업 28개 중 26개는 배경 클릭으로 닫혔고 둘만 닫히지 않았다
 * (scenarioRateManagerModal · cmaRecommendationModal). 그렇게 둔 이유를 적은 주석도 없었고,
 * 편집 폼인 자산 · 거래 팝업도 배경 클릭으로 닫히므로 "편집 중이라 막았다"도 성립하지 않았다.
 *
 * 이 파일은 개별 팝업 두 개를 확인하는 데서 멈추지 않고, **뒤로가기 대상으로 등록된 모든 팝업**에
 * 배경 클릭 경로가 있는지 소스에서 전수 확인한다 - 팝업이 새로 생겨도 같은 규칙이 지켜지게 하려는
 * 것이 목적이다(다음에 하나를 빠뜨리면 이 테스트가 먼저 깨진다).
 * 실행: node --test test/modal-backdrop-close.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '..', 'js');
const FILES = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
const ALL_JS = FILES.map((f) => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');

function swipeModalIds() {
  const src = fs.readFileSync(path.join(JS_DIR, '03-filters-charts-tabs.js'), 'utf8');
  const m = /const SWIPE_MODAL_IDS = \[([^\]]+)\]/.exec(src);
  assert.ok(m, 'SWIPE_MODAL_IDS 선언을 찾았다');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/* 배경 클릭으로 닫히는 경로가 있는가. 앱에는 세 가지 표기가 실제로 쓰이고 있다.
 *   ① e.target.id === 'xModal'    - 대부분
 *   ② e.target === modal          - assetModal(js/07 지역 변수 modal)
 *   ③ 모달 전체 클릭 → 닫기        - riskAlertModal(안내 전용이라 어디를 눌러도 닫힌다) */
function hasBackdropClose(id) {
  if (new RegExp(`e\\.target\\.id === '${id}'`).test(ALL_JS)) return 'targetId';
  if (id === 'assetModal' && /modal\.addEventListener\('click', \(e\) => \{ if \(e\.target === modal\) closeModal\(\); \}\)/.test(ALL_JS)) return 'targetElement';
  if (new RegExp(`getElementById\\('${id}'\\)\\.addEventListener\\('click', \\(\\) =>`).test(ALL_JS)) return 'wholeModal';
  return null;
}

test('ISSUE-A. 뒤로가기 대상으로 등록된 모든 팝업에 배경 클릭 경로가 있다', () => {
  const ids = swipeModalIds();
  assert.ok(ids.length >= 27, '팝업 목록이 비어 있지 않다(현재 ' + ids.length + '개)');
  const missing = ids.filter((id) => !hasBackdropClose(id));
  assert.deepStrictEqual(missing, [], '배경 클릭이 없는 팝업: ' + missing.join(', '));
});

test('ISSUE-A. 수익률 관리 · CMA 추천 팝업이 다른 팝업과 같은 방식으로 등록됐다', () => {
  ['scenarioRateManagerModal', 'cmaRecommendationModal'].forEach((id) => {
    assert.strictEqual(hasBackdropClose(id), 'targetId', id);
  });
  const src = fs.readFileSync(path.join(JS_DIR, '05-future-projection.js'), 'utf8');
  // 내부 클릭으로는 닫히지 않는다 - e.target이 팝업 자신일 때만 닫는다(다른 24개와 같은 조건).
  assert.match(src, /if \(e\.target\.id === 'scenarioRateManagerModal'\) closeScenarioRateManagerModal\(false\);/);
  assert.match(src, /if \(e\.target\.id === 'cmaRecommendationModal'\) closeCmaRecommendationModal\(false\);/);
});

test('ISSUE-A. 기존 닫기 경로(X · 취소 · 뒤로가기)를 건드리지 않았다', () => {
  const src = fs.readFileSync(path.join(JS_DIR, '05-future-projection.js'), 'utf8');
  assert.match(src, /getElementById\('closeScenarioRateManagerModalBtn'\)\.addEventListener\('click', \(\) => closeScenarioRateManagerModal\(false\)\)/);
  assert.match(src, /getElementById\('cancelScenarioRateManagerModalBtn'\)\.addEventListener\('click', \(\) => closeScenarioRateManagerModal\(false\)\)/);
  assert.match(src, /getElementById\('closeCmaRecommendationModalBtn'\)\.addEventListener\('click', \(\) => closeCmaRecommendationModal\(false\)\)/);
  // 뒤로가기 표(MODAL_CLOSE_FNS)에는 원래부터 둘 다 들어 있었다 - 그대로 남아 있어야 한다.
  const nav = fs.readFileSync(path.join(JS_DIR, '03-filters-charts-tabs.js'), 'utf8');
  assert.match(nav, /scenarioRateManagerModal: \(viaBack\) => closeScenarioRateManagerModal\(viaBack\)/);
  assert.match(nav, /cmaRecommendationModal: \(viaBack\) => closeCmaRecommendationModal\(viaBack\)/);
});

test('ISSUE-A. 배경 클릭은 [나중에]와 다르다 - "봤다"는 기록을 남기지 않는다', () => {
  /* cmaRecommendationModal의 [나중에]는 seenVersion을 기록해 같은 추천을 다시 띄우지 않는다.
   * 배경 클릭은 X 버튼과 같아야 한다 - 기록하지 않으므로 다음에 다시 뜬다. */
  const src = fs.readFileSync(path.join(JS_DIR, '05-future-projection.js'), 'utf8');
  const close = /function closeCmaRecommendationModal\(viaBackButton\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(close, 'closeCmaRecommendationModal 본문을 찾았다');
  assert.ok(!/seenVersion/.test(close[1]), '닫기 함수는 seenVersion을 쓰지 않는다');
});
