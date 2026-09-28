/* [v275 · PMD-1 · PMD-2] 앱이 **추천하는 계좌유형**과 **사전에 등재된 계좌유형**을 일치시킨다.
 *
 * 무엇이 문제였나 - 계좌구분 칸의 기본 추천목록에는 `토스` · `CMA` · `채권/현금`이 있었는데
 * 이 셋은 계좌유형 사전(js/01 ACCOUNT_TYPE_DICTIONARY)에 없다. 그래서 **앱이 추천한 값을 고르면
 * 곧바로 "사전에 없는 값입니다"라는 안내가 떴다**(Phase B-2가 그 안내를 만든 뒤 드러난 불일치).
 *
 * PM 결정(PMD-2 2026-09-28) - **사전을 늘리지 않고 추천을 줄인다.**
 *   · 기본 추천값에서만 셋을 뺀다.
 *   · 사전 · taxClass · Risk Share · 세금 정책은 **무변경**이다.
 *   · **이미 그 값으로 저장해 둔 사용자 데이터는 그대로 둔다** - migration 없음.
 *     실제 데이터의 계좌명은 collectKnownAccountTypes()가 계속 모으므로 목록에서 사라지지 않는다.
 *
 * PMD-1 - 그 안내 문구가 12px(`text-xs`)로 들어가 있어 이 저장소의 최소 가독성 기준(14px)을
 * 어겼다. `e2e/32`는 **보이는** 텍스트만 재므로 평소 숨어 있는 이 요소를 잡지 못한다 - 그래서
 * 여기서 소스 수준으로 고정한다.
 *
 * 실행: node --test test/v275-account-type-suggestions.test.js
 */
'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const ROOT = path.join(__dirname, '..');
const REMOVED = ['토스', 'CMA', '채권/현금'];
const KEPT = ['일반계좌', 'ISA', 'IRP', '연금저축'];

const sandbox = () => {
  const sb = loadAdapterSandbox();
  sb.state.assets = [];
  sb.state.transactions = [];
  return sb;
};

test('PMD-2-1. 기본 추천목록은 사전에 등재된 4개뿐이다', () => {
  const list = sandbox().evalInSandbox('DEFAULT_ACCOUNT_TYPES');
  assert.deepStrictEqual(Array.from(list), KEPT, '기본 추천값은 일반계좌 · ISA · IRP · 연금저축이다');
  REMOVED.forEach((t) => assert.ok(!list.includes(t), t + '은(는) 기본 추천값이 아니다'));
});

test('PMD-2-2. 기본 추천값은 전부 계좌유형 사전에 등재돼 있다(불일치 금지 계약)', () => {
  const sb = sandbox();
  const list = sb.evalInSandbox('DEFAULT_ACCOUNT_TYPES');
  list.forEach((t) => {
    assert.strictEqual(sb.isAccountTypeRegistered(t), true, t + '은(는) 사전에 있어야 추천할 수 있다');
    assert.strictEqual(sb.accountTypeClassificationNote(t), '',
      t + ' - 앱이 추천한 값에 "사전에 없는 값" 안내가 뜨면 안 된다');
  });
});

test('PMD-2-3. 기존 데이터의 계좌유형은 그대로 목록에 남는다(보존 · migration 없음)', () => {
  const sb = sandbox();
  sb.state.assets = [sb.makeAsset({ ticker: '005930', name: 'ZZ 보유', owner: '신랑', accountType: '토스', quantity: 1, buyPrice: 1, currentPrice: 1 })];
  sb.state.transactions = [{ id: 'zz-1', date: '2026-01-02', owner: '신랑', accountType: 'CMA', ticker: '005930', name: 'ZZ 보유', type: 'buy', quantity: 1, price: 1, currency: 'KRW', fee: 0 }];
  const known = sb.collectKnownAccountTypes();
  assert.ok(known.includes('토스'), '자산에 쓰인 계좌유형은 목록에 남는다');
  assert.ok(known.includes('CMA'), '거래에 쓰인 계좌유형도 목록에 남는다');
  KEPT.forEach((t) => assert.ok(known.includes(t), t + ' - 기본값도 함께 있다'));
  assert.ok(!known.includes('채권/현금'), '아무도 쓰지 않는 값은 더 이상 나타나지 않는다');
  // 저장값을 바꾸지 않는다 - 표기를 그대로 둔다(BOND-10).
  assert.strictEqual(sb.state.assets[0].accountType, '토스', '저장값은 손대지 않는다');
});

test('PMD-2-4. 사전 · 세제혜택 · Risk Share 정책은 늘어나지 않았다', () => {
  const sb = sandbox();
  const dict = sb.evalInSandbox('Object.keys(ACCOUNT_TYPE_DICTIONARY)');
  assert.deepStrictEqual(Array.from(dict).sort(), KEPT.slice().sort(), '사전은 그대로 4개다');
  REMOVED.forEach((t) => {
    assert.strictEqual(sb.classifyAccountType(t), 'UNCLASSIFIED', t + ' - 여전히 미분류다');
    assert.strictEqual(sb.isTaxAdvantagedAccountType(t), false, t + ' - 세제혜택으로 올리지 않았다');
    assert.strictEqual(sb.isRiskShareEligibleAccountType(t), false, t + ' - 위험 배분 등재 대상이 아니다');
  });
  // DR-B3 - 저장된 계획의 계산 보존은 그대로다(추천목록 변경과 무관).
  REMOVED.forEach((t) => assert.strictEqual(sb.resolveRemainderRiskShare(t).share, 0.7, t));
});

test('PMD-2-5. index.html 기본 datalist도 사전과 같은 4개다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = html.slice(html.indexOf('<datalist id="accountTypeList">'), html.indexOf('</datalist>'));
  assert.ok(block.length > 0, 'datalist 블록을 찾았다');
  const values = Array.from(block.matchAll(/<option value="([^"]*)"/g)).map((m) => m[1]);
  assert.deepStrictEqual(values, KEPT, 'static 목록도 사전 등재값만 둔다');
  REMOVED.forEach((t) => assert.ok(!values.includes(t), t + '이(가) static 목록에 남아 있으면 안 된다'));
});

test('PMD-1. 계좌구분 안내 문구는 14px 기준을 지킨다(text-xs 금지)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('text-xs'), 'index.html에 text-xs(12px)가 있으면 안 된다 - 최소 가독성 14px');
  const note = html.match(/<p id="f_accountTypeClassNote"[^>]*>/);
  assert.ok(note, '안내 요소가 있다');
  assert.ok(note[0].includes('text-sm'), '안내 문구는 text-sm(14px)이다');
});

test('PMD-1-b. js/ 어디에도 text-xs를 다시 만들지 않았다', () => {
  const dir = path.join(ROOT, 'js');
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!s.includes('text-xs'), f + '에 text-xs가 있으면 안 된다');
  });
});
