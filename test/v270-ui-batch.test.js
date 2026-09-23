/* [PM 최종 통합 작업 지시문 2026-09-23] UI 개선 4건의 "구조" 고정.
 *
 *   #1 거래 추가 - 자산군 = 채권이면 종목 검색 UI 자리에 표준코드(ISIN) 입력/조회 UI가 온다.
 *   #2 주식/ETF/채권 모두 수동입력 기본 OFF, 자산군을 바꿔도 이전 상태를 승계하지 않는다.
 *   #3 매크로 브리핑 세부 현황 - 아코디언이 아니라 제목 우측 [세부내용] 버튼 + 팝업.
 *   #4 목표비중 아코디언 - 버튼 줄(data-rebalance-actions) 안쪽 탭은 아코디언을 열지 않는다.
 *
 * 화면에서의 실제 동작은 e2e/118이 본다. 여기서는 되돌아가기 쉬운 구조(요소 위치 · 조건 · 필터
 * 범위)를 소스 기준으로 고정한다 - 나중에 누가 예전 자리로 되돌려 놓아도 바로 드러나게 하려는 것이다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const JS06 = read('js/06-transactions.js');
const JS10 = read('js/10-risk-translation-alerts.js');
const JS04 = read('js/04-rebalancing.js');
const JS03 = read('js/03-filters-charts-tabs.js');

// 주석에 적힌 예시 문자열이 "구현"으로 잘못 읽히지 않게, 판정 전에 주석을 걷어낸다.
const stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '');
const HTML_CODE = stripHtmlComments(HTML);
const JS06_CODE = stripJsComments(JS06);
const JS10_CODE = stripJsComments(JS10);
const JS04_CODE = stripJsComments(JS04);
const JS03_CODE = stripJsComments(JS03);
const indexOfId = (id) => HTML_CODE.indexOf(`id="${id}"`);

/* ══════════════ #1 채권 ISIN 위치 ══════════════ */

test('#1. 표준코드(ISIN) 칸이 자산군 바로 다음 · 종목명 칸 앞에 온다', () => {
  const at = {
    assetClass: indexOfId('tx_assetClass'),
    isinWrap: indexOfId('tx_bondIsinWrap'),
    isin: indexOfId('tx_bondIsin'),
    nameWrap: indexOfId('tx_instrumentNameWrap'),
    rateMatch: indexOfId('tx_rateMatchOverride'),
    role: indexOfId('tx_role'),
    bondDetails: indexOfId('tx_bondFieldsWrap'),
    maturity: indexOfId('tx_bondMaturityDate')
  };
  Object.entries(at).forEach(([k, v]) => assert.ok(v > 0, `${k} 없음`));
  assert.ok(at.assetClass < at.isinWrap, '자산군 다음에 ISIN');
  assert.ok(at.isinWrap < at.isin && at.isin < at.nameWrap, 'ISIN 입력칸은 ISIN 래퍼 안, 종목명 칸 앞');
  assert.ok(at.nameWrap < at.rateMatch, '종목명 다음에 장기 수익률 기준');
  assert.ok(at.rateMatch < at.role, '장기 수익률 기준 다음에 역할');
  assert.ok(at.role < at.bondDetails, '역할 다음에 채권 발행조건');
  assert.ok(at.bondDetails < at.maturity, '만기일은 발행조건 블록 안에 있다');
  // 조회 버튼과 안내문도 함께 옮겨졌다(기능을 쪼개지 않는다).
  assert.ok(indexOfId('txBondLookupBtn') > at.isinWrap && indexOfId('txBondLookupBtn') < at.nameWrap, '조회 버튼도 같은 자리');
  assert.ok(indexOfId('tx_bondMasterNote') > at.isinWrap && indexOfId('tx_bondMasterNote') < at.nameWrap, '안내문도 같은 자리');
});

test('#1. 기본은 숨김이고, 숨길 때 빈 자리를 남기지 않는다(visibility가 아니라 hidden)', () => {
  const tag = HTML_CODE.match(/<div id="tx_bondIsinWrap"[^>]*>/);
  assert.ok(tag, 'tx_bondIsinWrap 없음');
  const classes = ((tag[0].match(/class="([^"]*)"/) || [])[1] || '').trim().split(/\s+/);
  assert.ok(classes.includes('hidden'), '기본 숨김(display:none)');
  assert.ok(!/visibility\s*:/.test(tag[0]), 'visibility로 감추지 않는다');
});

test('#1. 조회 로직은 그대로 재사용한다 - 새 조회 경로를 만들지 않았다', () => {
  ['applyKnownBondMasterToTxForm', 'lookupBondFromKis', 'fetchKisBondInfoRaw', 'mapKisBondInfo']
    .forEach((fn) => assert.ok(JS06_CODE.includes(fn), `${fn} 유지`));
  // ISIN 입력 -> 자동 조회 · blur -> 이미 아는 발행조건 채움. 두 연결 모두 남아 있다.
  assert.match(JS06_CODE, /getElementById\('tx_bondIsin'\)\.addEventListener\('input'/);
  assert.match(JS06_CODE, /getElementById\('tx_bondIsin'\)\.addEventListener\('blur', applyKnownBondMasterToTxForm\)/);
  assert.match(JS06_CODE, /getElementById\('txBondLookupBtn'\)\.addEventListener\('click'/);
});

test('#1. 채권이면 종목 검색은 열리지 않는다(검색할 마스터가 없다)', () => {
  assert.match(JS06_CODE, /addEventListener\('click', \(\) => \{\s*if \(isTxBondForm\(\)\) return;/,
    '이름칸 클릭으로 종목 검색이 열리지 않는다');
  assert.match(JS06_CODE, /const isBond = isTxBondForm\(\);\s*const manual = document\.getElementById\('tx_manualEntryToggle'\)\.checked \|\| isBond;/,
    '채권이면 토글과 무관하게 직접 입력 상태');
});

/* ── PM 결정 D-2 (2026-09-23) - 「채권 조회」와 「채권명」을 나눈다 ── */

test('D-2. 조회에 쓰는 것은 「채권 조회」 한 묶음이고, 그 결과가 바로 아래 채권명이다', () => {
  const wrap = HTML_CODE.slice(indexOfId('tx_bondIsinWrap'), indexOfId('tx_instrumentNameWrap'));
  assert.ok(wrap.includes('>채권 조회<'), '묶음 이름이 있다');
  assert.ok(indexOfId('tx_bondLookupGroupLabel') < indexOfId('tx_bondIsin'), '묶음 이름이 입력칸보다 먼저 온다');
  // 조회에 쓰는 세 가지가 모두 이 묶음 안에 있다.
  ['tx_bondIsin', 'txBondLookupBtn', 'tx_bondMasterNote'].forEach((id) => {
    assert.ok(wrap.includes(`id="${id}"`), `${id}는 채권 조회 묶음 안에 있다`);
  });
  // 조회 결과가 어디로 가는지 화면에서 말한다("조회 → 채권명"이 읽혀야 한다).
  assert.ok(wrap.includes('채권명'), '결과가 채권명으로 간다고 말한다');
  assert.ok(/직접 입력해 저장할 수 있습니다/.test(wrap), '조회되지 않아도 저장할 수 있다고 말한다');
});

test('D-2. 채권명 칸과 required 정책은 그대로다(조회 실패가 입력을 막지 않는다)', () => {
  assert.ok(indexOfId('tx_name') > 0, '채권명/종목명 입력칸이 남아 있다');
  const nameTag = HTML_CODE.match(/<input id="tx_name"[^>]*>/);
  assert.ok(nameTag && /\srequired/.test(nameTag[0]), 'required 정책 유지');
  assert.match(JS06_CODE, /nameLabel\.textContent = isBond \? '채권명' : '종목명\/티커'/);
  // 조회 성공 시 채권명을 채우는 경로가 두 곳 모두 살아 있다(이 앱이 아는 값 · KIS 조회).
  assert.equal(JS06_CODE.split("if (nameInput && !nameInput.value && eff.identity.instrumentName) nameInput.value = eff.identity.instrumentName;").length - 1, 2);
});

test('D-2. 채권 ↔ 다른 자산군 경계를 넘으면 이름 · 티커가 남지 않는다', () => {
  const handler = JS06_CODE.match(/getElementById\('tx_assetClass'\)\.addEventListener\('change'[\s\S]*?\n\}\);/)[0];
  assert.match(handler, /const bondBoundaryCrossed = \(prevClass === '채권'\) !== \(e\.target\.value === '채권'\);/);
  assert.match(handler, /if \(\(manualToggle && manualToggle\.checked\) \|\| bondBoundaryCrossed\)/);
  assert.match(handler, /getElementById\('tx_name'\)\.value = ''/);
  assert.match(handler, /getElementById\('tx_ticker'\)\.value = ''/);
  // 직전 자산군을 기억하는 곳은 한 군데이고, 팝업을 열 때 기준점이 맞춰진다.
  assert.match(JS06_CODE, /let txAssetClassBeforeChange = '';/);
  assert.match(JS06_CODE, /txAssetClassBeforeChange = document\.getElementById\('tx_assetClass'\)\.value;/);
});

/* ══════════════ #2 수동입력 기본 OFF · 미승계 ══════════════ */

test('#2. 채권이라고 수동입력을 강제로 켜거나 비활성화하지 않는다', () => {
  assert.ok(!/manualToggle\.checked = true/.test(JS06_CODE), '강제로 켜지 않는다');
  assert.ok(!/manualToggle\.disabled = isBond/.test(JS06_CODE), '채권이라고 비활성화하지 않는다');
  assert.match(JS06_CODE, /manualToggle\.disabled = false/, '항상 사용자가 다룰 수 있는 상태로 둔다');
  // 채권에서는 체크박스 자체를 화면에서 뺀다(있으나 마나 한 컨트롤을 남기지 않는다).
  assert.match(JS06_CODE, /manualToggleWrap\.classList\.toggle\('hidden', isBond\)/);
});

test('#2. 자산군을 바꾸면 수동입력 상태를 승계하지 않는다', () => {
  const handler = JS06_CODE.match(/getElementById\('tx_assetClass'\)\.addEventListener\('change'[\s\S]*?\n\}\);/);
  assert.ok(handler, '자산군 change 핸들러 없음');
  const body = handler[0];
  assert.match(body, /manualToggle\.checked = false/, 'OFF로 되돌린다');
  assert.match(body, /getElementById\('tx_name'\)\.value = ''/, '수동으로 적어 둔 이름을 남기지 않는다');
  assert.match(body, /getElementById\('tx_ticker'\)\.value = ''/, '티커도 남기지 않는다');
});

test('#2. 새 거래를 열 때 기본값은 OFF다', () => {
  assert.match(JS06_CODE, /getElementById\('tx_manualEntryToggle'\)\.checked = false;/);
});

/* ══════════════ #3 매크로 세부내용 팝업 ══════════════ */

test('#3. 아코디언(버튼 · 본문 · chevron)이 화면에서 사라졌다', () => {
  ['macroDiagnosisToggleBtn', 'macroDiagnosisBody', 'macroDiagnosisChevron']
    .forEach((id) => assert.equal(indexOfId(id), -1, `${id}는 남지 않는다`));
  assert.ok(!/macroDiagnosisOpen/.test(JS10_CODE), '펼침 상태 변수도 남기지 않는다');
  assert.ok(!/reapplyMacroDiagnosisAccordionHeight/.test(JS10_CODE + JS03_CODE), '높이 보정 함수도 남기지 않는다');
  assert.ok(!HTML_CODE.includes('상세 현황 보기'), '옛 문구가 화면에 남지 않는다');
});

test('#3. [세부내용] 버튼이 제목과 같은 줄, 제목 다음에 있다', () => {
  const h4 = HTML_CODE.indexOf('시장 현황 &amp; 매크로 브리핑');
  const btn = indexOfId('macroDetailBtn');
  const grid = indexOfId('macroBriefingGrid');
  assert.ok(h4 > 0 && btn > h4, '제목 다음에 버튼');
  assert.ok(btn < grid, '버튼은 지표 타일보다 위(제목 줄)에 있다');
  const tag = HTML_CODE.match(/<button[^>]*id="macroDetailBtn"[^>]*>/);
  assert.match(tag[0], /class="[^"]*detail-btn/, '다른 화면의 세부내용 버튼과 같은 스타일을 쓴다');
  assert.match(tag[0], /class="[^"]*ml-auto/, '줄 오른쪽 끝에 붙는다');
});

test('#3. 세부 내용은 팝업 안에 있고, 내용 컨테이너는 그대로다', () => {
  const modal = HTML_CODE.indexOf('id="macroDetailModal"');
  assert.ok(modal > 0, '팝업 없음');
  const diag = indexOfId('macroBriefingDiagnosis');
  assert.ok(diag > modal, '세부 내용 컨테이너가 팝업 안으로 옮겨졌다');
  assert.equal(HTML_CODE.split('id="macroBriefingDiagnosis"').length - 1, 1, '컨테이너는 하나뿐이다(복제 금지)');
  assert.ok(indexOfId('closeMacroDetailBtn') > modal, '닫기 버튼');
});

test('#3. 팝업은 앱의 기존 모달 규칙을 그대로 따른다(뒤로가기로 닫힌다)', () => {
  assert.match(JS10_CODE, /function openMacroDetailModal\(\)[\s\S]*?pushModalHistoryState\(\);/);
  assert.match(JS10_CODE, /function closeMacroDetailModal\(viaBackButton\)[\s\S]*?popModalHistoryIfNeeded\(\);/);
  assert.match(JS03_CODE, /macroDetailModal: \(viaBack\) => closeMacroDetailModal\(viaBack\)/);
  assert.match(JS03_CODE, /SWIPE_MODAL_IDS = \[[^\]]*'macroDetailModal'/);
});

/* ══════════════ #4 목표비중 아코디언 이벤트 독립성 ══════════════ */

test('#4. 버튼 줄 전체가 아코디언 트리거에서 제외된다(버튼 하나가 아니라 줄 전체)', () => {
  assert.match(JS04_CODE, /if \(e\.target\.closest\('\[data-rebalance-actions\]'\)\) return;/);
  assert.ok(!/closest\('\[data-rebalance-detail-btn\], \[data-rebalance-export-btn\]'\)/.test(JS04_CODE),
    '버튼 두 개만 거르던 옛 판정은 남기지 않는다');
  // 신랑 · 와이프 두 카드 모두 표시가 붙어 있어야 한다(한쪽만 고치면 다른 쪽이 그대로 남는다).
  assert.equal(HTML_CODE.split('data-rebalance-actions').length - 1, 2);
});

test('#4. 아코디언을 여는 경로는 사용자 클릭 하나뿐이다', () => {
  const writes = JS04_CODE.split('\n').filter((l) => /positionAnalysisAccordionOpen\[[^\]]+\]\s*=/.test(l));
  // 토글(사용자 클릭) 한 줄만 값을 바꾼다 - 팝업 닫기 · 재렌더 · focus 복원 어디에도 없다.
  assert.deepEqual(writes.map((l) => l.trim()), ['positionAnalysisAccordionOpen[key] = !positionAnalysisAccordionOpen[key];']);
  assert.ok(!/setTimeout[\s\S]{0,120}positionAnalysisAccordionOpen/.test(JS04_CODE), 'timeout 임시방편을 쓰지 않는다');
});

test('#4. 신랑 · 와이프는 서로 독립된 상태를 쓴다', () => {
  assert.match(JS04_CODE, /positionAnalysisAccordionOpen = \{ '신랑': false, '와이프': false \}/);
  assert.match(JS04_CODE, /POSITION_ANALYSIS_ACCORDION_SUFFIX = \{ '신랑': 'Husband', '와이프': 'Wife' \}/);
});

/* ══════════════ 보호 - 이번 작업으로 바뀌면 안 되는 것 ══════════════ */

test('보호. 계산·저장 구조는 건드리지 않았다', () => {
  // 거래 스키마 · 채권 identity 규칙
  assert.match(JS06_CODE, /const txBondIsinVal = String\(document\.getElementById\('tx_bondIsin'\)\.value \|\| ''\)\.trim\(\)\.toUpperCase\(\);/);
  assert.ok(!/isDomestic/.test(JS06_CODE.split('transactionForm')[1] || ''), '거래에 isDomestic을 새로 만들지 않는다');
  // 매크로 브리핑의 지표 · 진단 계산 진입점
  assert.match(JS10_CODE, /function renderMacroBriefing\(\)/);
  assert.match(JS10_CODE, /const diagnosisEl = document\.getElementById\('macroBriefingDiagnosis'\);/);
  // 목표비중 값 자체를 바꾸는 코드가 아코디언 쪽에 섞이지 않았다
  const toggle = JS04_CODE.match(/btn\.addEventListener\('click', \(e\) => \{[\s\S]*?\n {2}\}\);/);
  assert.ok(toggle, '아코디언 토글 핸들러 없음');
  assert.ok(!/state\.rebalance/.test(toggle[0]), '아코디언 토글은 목표비중 값을 건드리지 않는다');
});
