/* [PM 결정 2026-09-26 · D-8 · A안] 초기화가 실제로 끝났을 때만 관리 팝업을 닫는다.
 *
 * 문제: 되돌릴 수 없는 작업이 끝났는데도 같은 팝업이 그대로 떠 있어 완료 여부가 전달되지 않았고,
 *       바로 아래의 「클라우드 데이터 초기화」(빨간 버튼)를 잘못 누를 위험이 있었다.
 *       클라우드 초기화는 §57에서 동기화 설정 팝업만 닫도록 고쳐, 데이터 관리 화면에서는 누락돼 있었다.
 *
 * 범위: 기기 데이터 초기화 · 데이터 관리 화면의 클라우드 데이터 초기화, 이 둘뿐이다.
 *       최초등록 · 엑셀 업로드 · JSON 불러오기 · JSON 자동 백업 토글 · 엑셀 내보내기는 그대로 둔다
 *       (PM 결정 - 앞의 넷은 현재 구조가 정상이고, 엑셀 내보내기는 이번 범위 밖이다).
 *
 * 브라우저 이벤트 핸들러라 단위 테스트에서 실제로 누를 수 없다 - "성공했을 때만 닫는다"는 계약을
 * 소스 구조로 고정한다(E2E가 실제 클릭을 검증한다).
 * 실행: node --test test/data-reset-modal-close.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ══════════════ A. 기기 데이터 초기화 ══════════════ */

test('D-8-A. 기기 데이터 초기화는 완료 토스트 뒤에 데이터 관리 팝업을 닫는다', () => {
  const src = read('js/14-settings-boot.js');
  const handler = /getElementById\('resetDataBtn'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/.exec(src);
  assert.ok(handler, 'resetDataBtn 핸들러를 찾았다');
  const body = handler[1];
  // 순서가 계약이다 - 삭제 → renderAll → 성공 토스트 → 닫기.
  const iToast = body.indexOf("showToast('이 기기의 데이터를 초기화했습니다");
  const iClose = body.indexOf('closeSystemManagementModal()');
  assert.ok(iToast > 0, '완료 토스트가 있다');
  assert.ok(iClose > iToast, '닫기는 완료 토스트 뒤에 온다');
  // 팝업이 실제로 열려 있을 때만 닫는다(§57과 같은 가드 - 뒤로가기 기록을 대신 소비하지 않는다).
  assert.match(body, /const sysModal = document\.getElementById\('systemManagementModal'\);/);
  assert.match(body, /if \(sysModal && !sysModal\.classList\.contains\('hidden'\)\) closeSystemManagementModal\(\);/);
});

test('D-8-A. 취소하면 아무것도 지우지 않고 팝업도 그대로 둔다', () => {
  const src = read('js/14-settings-boot.js');
  const handler = /getElementById\('resetDataBtn'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/.exec(src);
  const body = handler[1];
  // confirm 취소는 맨 앞에서 return한다 - 그 뒤 어떤 삭제 · 닫기 코드도 실행되지 않는다.
  const iGuard = body.indexOf('return;');
  assert.ok(iGuard > 0, 'confirm 취소 가드가 있다');
  assert.match(body.slice(0, iGuard + 'return;'.length), /if \(!confirm\(\[[\s\S]*?\]\.join\('\\n'\)\)\) return;/);
  assert.ok(body.indexOf('localStorage.removeItem') > iGuard, '삭제는 가드 뒤에 있다');
  assert.ok(body.indexOf('closeSystemManagementModal()') > iGuard, '닫기도 가드 뒤에 있다');
});

test('D-8-A. 초기화 로직 자체는 바뀌지 않았다(삭제 범위 · 확인 문구 · 예외 키)', () => {
  const src = read('js/14-settings-boot.js');
  // sam_ 전체 삭제 + 다크모드 · 첫 실행 표시 예외 - v270과 같아야 한다.
  assert.match(src, /\.filter\(\(k\) => k\.startsWith\('sam_'\) && k !== LS_DARKMODE && k !== LS_HAS_LAUNCHED\)/);
  assert.match(src, /이 작업은 되돌릴 수 없습니다\. 계속할까요\?/);
  assert.match(src, /syncState = \{ enabled: false, password: '', lastVersion: 0 \};/);
});

/* ══════════════ B. 클라우드 데이터 초기화 ══════════════ */

test('D-8-B. 실행한 화면의 관리 팝업을 닫는다 - 동기화 설정 · 데이터 관리 둘 다', () => {
  const src = read('js/12-import-export-sync.js');
  const handler = /\['resetCloudDataBtn', 'resetCloudDataSyncBtn'\]\.forEach\(\(id\) => \{([\s\S]*?)\n\}\);/.exec(src);
  assert.ok(handler, '두 버튼 공용 핸들러를 찾았다');
  const body = handler[1];
  assert.match(body, /if \(result !== 'reset'\) return;/, "성공('reset')이 아니면 아무 팝업도 닫지 않는다");
  assert.match(body, /if \(syncModal && !syncModal\.classList\.contains\('hidden'\)\) closeSyncSettingsModal\(\);/);
  assert.match(body, /if \(sysModal && !sysModal\.classList\.contains\('hidden'\)\) closeSystemManagementModal\(\);/);
  // 판정은 반환값 하나로만 한다 - 팝업이 열려 있다는 사실이 성공 판정을 대신하지 않는다.
  const iGuard = body.indexOf("if (result !== 'reset') return;");
  assert.ok(body.indexOf('closeSyncSettingsModal') > iGuard);
  assert.ok(body.indexOf('closeSystemManagementModal') > iGuard);
});

test('D-8-B. 취소 · 이미 비어 있음 · 실패 · 미연결 · 중복 실행은 전부 닫지 않는다', () => {
  const src = read('js/12-import-export-sync.js');
  const fn = /async function resetCloudData\(\) \{([\s\S]*?)\r?\n\}\r?\n/.exec(src);
  assert.ok(fn, 'resetCloudData 본문을 찾았다');
  const body = fn[1];
  // 성공만 'reset'이고 나머지는 서로 다른 값을 돌려준다 - 핸들러가 'reset'만 통과시킨다.
  ['not_connected', 'busy', 'already_empty', 'cancelled', 'error'].forEach((code) => {
    assert.ok(body.includes(`return '${code}'`), code + ' 반환 경로가 있다');
  });
  assert.ok(body.includes("return 'reset'"), '성공 반환값');
  // 성공 판정은 업로드 후 실제 재조회로 확인한다(§57 그대로 - 이번에 바꾸지 않았다).
  assert.match(body, /const verified = after\.exists && after\.version === 0/);
  assert.match(body, /if \(!verified\) throw new Error\('cloud_verify_failed'\);/);
});

/* ══════════════ C. 범위 밖(바꾸지 않은 것) ══════════════ */

test('D-8-C. 최초등록 · 엑셀 업로드 · JSON 불러오기 · 자동 백업 토글 · 엑셀 내보내기는 닫지 않는다', () => {
  /* 앞의 넷은 후속 팝업 · 파일 선택이 이어지므로 현재 구조가 정상이고, 엑셀 내보내기는
   * PM이 이번 D-8 범위에서 제외했다(A안). 이 버튼들의 핸들러가 관리 팝업을 닫지 않아야 한다. */
  const all = ['js/06-transactions.js', 'js/07-table-render-modals.js', 'js/11-refresh-history.js',
    'js/12-import-export-sync.js', 'js/14-settings-boot.js'].map(read).join('\n');
  const closes = (all.match(/closeSystemManagementModal\(\)/g) || []).length;
  /* 허용되는 호출 위치는 정확히 셋이다 - X 버튼 · 배경 클릭(js/14 상단) · 기기 초기화 완료(js/14) ·
   * 클라우드 초기화 완료(js/12). js/14의 X 버튼과 배경 클릭은 인자 없이 부르는 같은 표기라
   * 합쳐서 네 번이 나온다. 이 수가 늘면 어떤 버튼이 새로 닫기 시작한 것이므로 먼저 확인해야 한다. */
  assert.strictEqual(closes, 4, 'closeSystemManagementModal() 호출 지점이 예상과 같다(현재 ' + closes + ')');
  /* 엑셀 내보내기 핸들러에는 닫기 · 완료 토스트를 넣지 않았다(PM 결정 A안 - 이번 범위 밖).
   * 내보내기는 이름 있는 함수가 아니라 exportExcelBtn의 인라인 핸들러다(js/12 맨 위) -
   * 그 핸들러 본문을 직접 떠서 확인한다(정규식이 아무것도 못 잡고 조용히 통과하지 않게 한다). */
  const exportSrc = read('js/12-import-export-sync.js');
  const exp = /getElementById\('exportExcelBtn'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\r?\n\}\);/.exec(exportSrc);
  assert.ok(exp, '엑셀 내보내기 핸들러를 찾았다');
  assert.ok(!/closeSystemManagementModal/.test(exp[1]), '엑셀 내보내기는 팝업을 닫지 않는다');
  assert.ok(!/showToast/.test(exp[1]), '엑셀 내보내기는 완료 토스트를 띄우지 않는다(현행 유지)');
});
