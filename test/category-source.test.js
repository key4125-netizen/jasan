// [V1.2-B BL-17] categorySource 정책 순수 로직 검증.
// 로딩 방식은 test/merge-preserve.test.js와 동일(가짜 DOM을 먼저 깔고 require) - 브라우저 전용
// top-level DOM 배선 코드가 있는 파일을 Node에서 그대로 실행하기 위함.
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

function makeFakeElement() {
  const store = { value: '', textContent: '', innerHTML: '', className: '', type: '' };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === 'style') return {};
      if (prop === 'dataset') return {};
      return () => makeFakeElement();
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}
global.document = {
  getElementById: () => makeFakeElement(),
  addEventListener: () => {},
  createElement: () => makeFakeElement(),
  documentElement: makeFakeElement(),
  body: makeFakeElement()
};
// [V1.2-B BL-17 Persistence Hotfix] persistAssets 왕복 검증에는 실제로 값을 기억하는 localStorage가
// 필요하다 - 기존 no-op 스텁(항상 getItem()===null)은 나머지 순수 로직 테스트에는 영향이 없으므로(그
// 테스트들은 localStorage를 읽거나 쓰지 않는다) 그대로 in-memory 버전으로 바꿔도 안전하다.
const fakeLocalStorageStore = {};
global.localStorage = {
  getItem: (k) => (k in fakeLocalStorageStore ? fakeLocalStorageStore[k] : null),
  setItem: (k, v) => { fakeLocalStorageStore[k] = String(v); },
  removeItem: (k) => { delete fakeLocalStorageStore[k]; }
};
global.window = global;
// makeAsset()이 getTickerRole()을 거쳐 부르는 buildCustomRateKey는 js/05(다른 파일)에 있다 - 브라우저는
// 모든 <script>가 전역을 공유해 문제없지만, 여기서는 js/01만 단독 require하므로 최소 스텁을 채운다.
// 이 스텁은 role(포지션) 조회만 영향을 주고 category/categorySource 판단과는 무관하다.
global.buildCustomRateKey = () => null;

const { sanitizeCategorySource, resolveImportedCategory, makeAsset, persistAssets, LS_ASSETS, state } = require(path.join(__dirname, '..', 'js', '01-core-state.js'));
const { carryOverCategorySource, buildCategorySourceIndex, mergeAssetsForAppend, mergeCollectionById } = require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

/* ── sanitizeCategorySource ─────────────────────────────────────────────── */
test('sanitizeCategorySource - user/system만 허용, 그 외와 없음은 undefined(legacy)', () => {
  assert.strictEqual(sanitizeCategorySource('user'), 'user');
  assert.strictEqual(sanitizeCategorySource('system'), 'system');
  assert.strictEqual(sanitizeCategorySource('UNCONFIRMED'), undefined);
  assert.strictEqual(sanitizeCategorySource(''), undefined);
  assert.strictEqual(sanitizeCategorySource(undefined), undefined);
  assert.strictEqual(sanitizeCategorySource(null), undefined);
});

/* ── makeAsset - Excel/신규 자산 생성 경로 (규칙 3/4) ──────────────────────── */
test('A. makeAsset - category 셀에 값이 있으면 categorySource=user', () => {
  const a = makeAsset({ ticker: '', name: '전세보증금', category: '현금' });
  assert.strictEqual(a.category, '현금');
  assert.strictEqual(a.categorySource, 'user');
});

test('B. makeAsset - category가 없으면 classifyCategory 추천값 + categorySource=system', () => {
  const a = makeAsset({ ticker: '005930.KS', name: '삼성전자' }); // category 생략
  assert.strictEqual(a.category, '주식'); // classifyCategory 최종 fallback
  assert.strictEqual(a.categorySource, 'system');
});

test('B-2. makeAsset - 지원하지 않는 category 값은 없는 것과 동일하게 처리된다', () => {
  const a = makeAsset({ ticker: '', name: '전세보증금', category: '엉뚱한값' });
  assert.strictEqual(a.categorySource, 'system'); // 유효하지 않은 값은 explicit로 인정하지 않는다
});

test('B-3. makeAsset - 거래원장 자동생성(category 생략)도 system으로 표시된다', () => {
  // syncAssetsFromTransactions(js/06:263)가 category를 넘기지 않는 경로와 동일한 입력 형태.
  const a = makeAsset({ ticker: '005930.KS', owner: '신랑', accountType: '일반계좌', name: '삼성전자', quantity: 10, buyPrice: 1000, currency: 'KRW', positionSource: 'ledger' });
  assert.strictEqual(a.categorySource, 'system');
});

/* ── resolveImportedCategory - JSON append/overwrite/Cloud 공용 판단 ──────── */
test('C. resolveImportedCategory - category+categorySource 모두 있으면 그대로 보존', () => {
  const r = resolveImportedCategory({ category: '채권', categorySource: 'user', ticker: '', name: '회사채' });
  assert.deepStrictEqual(r, { category: '채권', categorySource: 'user' });
});

test('C-2. resolveImportedCategory - category는 있는데 categorySource가 없으면 legacy(undefined)로 남는다', () => {
  const r = resolveImportedCategory({ category: '주식', ticker: '005930.KS', name: '삼성전자' });
  assert.strictEqual(r.category, '주식');
  assert.strictEqual(r.categorySource, undefined); // user/system 어느 쪽으로도 소급 확정하지 않는다
});

test('C-3. resolveImportedCategory - category가 없으면 classifyCategory 추천 + system(예전처럼 무조건 주식 아님)', () => {
  const r = resolveImportedCategory({ ticker: '', name: '내집마련아파트' }); // 부동산 키워드
  assert.strictEqual(r.category, '부동산');
  assert.strictEqual(r.categorySource, 'system');
});

test('C-4. resolveImportedCategory - categorySource가 지원하지 않는 값이면 sanitize되어 undefined', () => {
  const r = resolveImportedCategory({ category: '주식', categorySource: 'UNCONFIRMED', ticker: 'X', name: 'X' });
  assert.strictEqual(r.categorySource, undefined);
});

/* ── Cloud sync - category/categorySource pair 전용 merge (PM Option A 확정) ──
 * 핵심 불변조건:
 *   A. categorySource==='user'  → category는 반드시 같은 논리적 pair에서 온 값이어야 한다.
 *   B. categorySource==='system'→ category 역시 같은 system-origin pair에서 온 값이어야 한다.
 *   C. legacy category에 user 표식이 새로 붙어서는 안 된다.
 *   D. local user + remote legacy에서 remote가 newer라는 이유만으로 local의 확정이 사라져선 안 된다.
 *   E. categorySource만 단독으로 다른 record에서 가져오는 경로가 없어야 한다(category와 항상 함께). */
test('T1. [핵심 재현] local user(ETF) + remote legacy(주식), remote newer → ETF/user로 pair 전체가 이월된다', () => {
  const local = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 100 }];
  const remote = [{ id: 'X', category: '주식', updatedAt: 200 }]; // categorySource 필드 자체가 없는 구버전
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF', 'Invariant A/E: category도 함께 이월되어야 한다(categorySource만 옮기면 원래 버그)');
  assert.strictEqual(merged[0].categorySource, 'user');
});

test('T2. local system(ETF) + remote legacy(주식), remote newer → ETF/system으로 pair가 함께 이월된다', () => {
  const local = [{ id: 'X', category: 'ETF', categorySource: 'system', updatedAt: 100 }];
  const remote = [{ id: 'X', category: '주식', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF', 'Invariant B: system provenance도 category와 함께 보존되어야 한다');
  assert.strictEqual(merged[0].categorySource, 'system');
});

test('T3. local legacy(주식) + remote user(ETF), remote newer → remote의 일관된 pair를 그대로 채택한다', () => {
  const local = [{ id: 'X', category: '주식', updatedAt: 100 }]; // categorySource 없음
  const remote = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF');
  assert.strictEqual(merged[0].categorySource, 'user'); // remote 자신의 실제 확정이 정상 전파된 것 - 임의 승격 아님
});

test('T4. local user(ETF) + remote system(주식), remote newer → 승자 record의 pair를 그대로 사용한다', () => {
  const local = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 100 }];
  const remote = [{ id: 'X', category: '주식', categorySource: 'system', updatedAt: 200 }]; // remote가 이미 명시적 값을 가짐
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  // remote가 categorySource를 이미 갖고 있으므로(undefined 아님) pair 이월 규칙 자체가 발동하지 않는다 -
  // 이는 "확정값이 사라짐"이 아니라 두 기기가 각자 다른 category를 실제로 갖고 있었던 통상적 최신승이다.
  assert.strictEqual(merged[0].category, '주식');
  assert.strictEqual(merged[0].categorySource, 'system');
});

test('T5. local user(ETF) + remote user(ETF2, 값이 다름), remote newer → 최신 record의 pair가 함께 유지된다', () => {
  const local = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 100 }];
  const remote = [{ id: 'X', category: 'ETF2', categorySource: 'user', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF2');
  assert.strictEqual(merged[0].categorySource, 'user'); // 두 확정 중 더 최신 쪽의 pair가 그대로, 뒤섞이지 않음
});

test('T6. legacy + legacy 양쪽 다 categorySource 없음 → 새로 생성/승격하지 않는다', () => {
  const local = [{ id: 'X', category: '주식', updatedAt: 100 }];
  const remote = [{ id: 'X', category: 'ETF', updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF'); // 최신승 그대로
  assert.strictEqual(merged[0].categorySource, undefined, 'Invariant C: legacy끼리는 categorySource가 새로 생기면 안 된다');
});

test('T7. local이 newer면 기존 local record가 그대로 유지된다(legacy가 승자여도 임의 승격 없음)', () => {
  const localUserNewer = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 300 }];
  const remoteLegacyOlder = [{ id: 'X', category: '주식', updatedAt: 100 }];
  assert.deepStrictEqual(mergeCollectionById(localUserNewer, remoteLegacyOlder, new Set(['X']))[0], localUserNewer[0]);

  // 반대 방향: local이 legacy인 채로 이겨도(newer), remote가 패자인 user pair를 훔쳐오지 않는다
  // - 이 규칙은 remoteWins일 때만 발동하도록 설계되어 있다(legacy→user 자동 승격 방지, e2e/52 I/J와 동일 철학).
  const localLegacyNewer = [{ id: 'X', category: '주식', updatedAt: 300 }];
  const remoteUserOlder = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 100 }];
  const merged = mergeCollectionById(localLegacyNewer, remoteUserOlder, new Set(['X']));
  assert.strictEqual(merged[0].category, '주식');
  assert.strictEqual(merged[0].categorySource, undefined, 'local이 이겼을 때는 패자의 확정을 끌어오지 않는다(legacy 유지)');
});

test('T8. malformed categorySource는 merge 이전 단계(resolveImportedCategory)에서 이미 undefined로 정규화되어 legacy처럼 처리된다', () => {
  // mergeCollectionById에 도달하는 자산은 항상 resolveImportedCategory/makeAsset을 먼저 거치므로,
  // 비정상 categorySource('아무말')는 merge 시점 이전에 이미 sanitizeCategorySource로 걸러진다.
  const r = resolveImportedCategory({ category: 'ETF', categorySource: '아무말', ticker: 'X', name: 'X' });
  assert.strictEqual(r.category, 'ETF');
  assert.strictEqual(r.categorySource, undefined); // 정규화 후 legacy와 동일하게 취급됨
  // 정규화된 형태 그대로 merge에 태우면 T1과 동일한 legacy 케이스로 환원된다.
  const local = [{ id: 'X', category: 'ETF', categorySource: 'user', updatedAt: 100 }];
  const remote = [{ id: 'X', ...r, updatedAt: 200 }];
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].category, 'ETF');
  assert.strictEqual(merged[0].categorySource, 'user');
});

test('T9. [회귀] categorySource를 배열에서 분리해도 positionSource/buyRate의 기존 preserve-if-absent 동작은 그대로다', () => {
  const local = [{ id: 'X', quantity: 100, positionSource: 'manual', buyRate: 1300, updatedAt: 100 }];
  const remote = [{ id: 'X', quantity: 70, updatedAt: 200 }]; // 구버전 - 두 필드 다 모름
  const merged = mergeCollectionById(local, remote, new Set(['X']));
  assert.strictEqual(merged[0].positionSource, 'manual');
  assert.strictEqual(merged[0].buyRate, 1300);
  assert.strictEqual(merged[0].quantity, 70); // 최신승 값 자체는 그대로(필드 단위 병합 아님)
});

/* ── Excel/JSON append - carryOverCategorySource (PM 재확정 정책) ─────────────
 * 판단 기준은 오직 "이번 파일이 이 행의 category 칸에 뭐라도 적어 뒀는가"(categoryCellRaw) 하나뿐이다.
 * 칸이 비었으면(categoryCellRaw==='') 기존 값을 종류(user/system/legacy) 불문 그대로 이어받고,
 * 칸에 뭐라도 있으면(유효/오염 불문) 이번 파일 자체의 판단을 그대로 채택한다. */
test('E. buildCategorySourceIndex - user/system/legacy 구분 없이 존재하는 기존 자산 전부가 색인된다', () => {
  const idx = buildCategorySourceIndex([
    { id: 'A', category: '채권', categorySource: 'user' },
    { id: 'B', category: '주식', categorySource: 'system' },
    { id: 'C', category: '부동산' }, // legacy - categorySource 필드 자체가 없음
  ]);
  assert.ok(idx.byId.has('A'));
  assert.ok(idx.byId.has('B')); // system도 이제 색인 대상이다(더 이상 user만 거르지 않는다)
  assert.ok(idx.byId.has('C')); // legacy도 색인 대상이다
});

test('PM-1. 기존 user + Excel 칸 공백 → 기존 category/user 유지', () => {
  const kept = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '채권', categorySource: 'user' };
  const index = buildCategorySourceIndex([kept]);
  const incoming = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '주식', categorySource: 'system', categoryCellRaw: '' };
  const result = carryOverCategorySource(incoming, index);
  assert.strictEqual(result.category, '채권');
  assert.strictEqual(result.categorySource, 'user');
  assert.ok(!('categoryCellRaw' in result), 'categoryCellRaw 표식은 최종 결과에 남으면 안 된다');
});

test('PM-2. 기존 system + Excel 칸 공백 → 기존 category/system 유지', () => {
  const kept = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '주식', categorySource: 'system' };
  const index = buildCategorySourceIndex([kept]);
  const incoming = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '채권', categorySource: 'system', categoryCellRaw: '' };
  const result = carryOverCategorySource(incoming, index);
  assert.strictEqual(result.category, '주식');
  assert.strictEqual(result.categorySource, 'system');
});

test('PM-3. 기존 legacy(categorySource 없음) + Excel 칸 공백 → 기존 category/legacy 유지', () => {
  const kept = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '부동산' }; // categorySource 필드 자체 없음
  const index = buildCategorySourceIndex([kept]);
  const incoming = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '주식', categorySource: 'system', categoryCellRaw: '' };
  const result = carryOverCategorySource(incoming, index);
  assert.strictEqual(result.category, '부동산');
  assert.strictEqual(result.categorySource, undefined); // user/system으로 소급 확정하지 않는다
});

test('PM-4. 기존 user + Excel 유효 category 명시 → Excel category/user 적용(새 입력이 우선)', () => {
  const kept = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '채권', categorySource: 'user' };
  const index = buildCategorySourceIndex([kept]);
  const incoming = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '주식', categorySource: 'user', categoryCellRaw: '주식' };
  const result = carryOverCategorySource(incoming, index);
  assert.strictEqual(result.category, '주식');
  assert.strictEqual(result.categorySource, 'user');
});

test('PM-5. 기존 user + Excel 오염/미지원 category → classifyCategory 결과/system 적용(기존 user를 무조건 보호하지 않음)', () => {
  const kept = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'X', category: '원자재', categorySource: 'user' };
  const index = buildCategorySourceIndex([kept]);
  // makeAsset이 이미 '내맘대로분류'를 걸러 classifyCategory 결과(ETF 키워드 매칭)로 만들어 둔 상태를 흉내낸다.
  const incoming = { id: 'A', ticker: 'X', owner: '신랑', accountType: '일반계좌', name: 'KODEX 200', category: 'ETF', categorySource: 'system', categoryCellRaw: '내맘대로분류' };
  const result = carryOverCategorySource(incoming, index);
  assert.strictEqual(result.category, 'ETF'); // 기존 '원자재'(user)를 무조건 보호하지 않는다
  assert.strictEqual(result.categorySource, 'system');
});

test('F. mergeAssetsForAppend 통합 - 칸이 빈 재업로드는 기존 확정값을 보존하고, 값이 있는 재업로드는 새 값을 채택한다', () => {
  const existing = [{ id: 'A', ticker: 'BOND1', owner: '신랑', accountType: '일반계좌', name: '회사채', category: '채권', categorySource: 'user', quantity: 1, buyPrice: 1000000 }];
  // 칸이 빈 재업로드 - 보존되어야 한다.
  const blankIncoming = [{ id: 'A', ticker: 'BOND1', owner: '신랑', accountType: '일반계좌', name: '회사채', category: '주식', categorySource: 'system', categoryCellRaw: '', quantity: 1, buyPrice: 1000000 }];
  const blankResult = mergeAssetsForAppend(existing, blankIncoming);
  assert.strictEqual(blankResult.assets[0].category, '채권');
  assert.strictEqual(blankResult.assets[0].categorySource, 'user');
  assert.ok(!('categoryCellRaw' in blankResult.assets[0]));

  // 칸에 새 값이 명시된 재업로드 - 새 값이 우선한다.
  const filledIncoming = [{ id: 'A', ticker: 'BOND1', owner: '신랑', accountType: '일반계좌', name: '회사채', category: '주식', categorySource: 'user', categoryCellRaw: '주식', quantity: 1, buyPrice: 1000000 }];
  const filledResult = mergeAssetsForAppend(existing, filledIncoming);
  assert.strictEqual(filledResult.assets[0].category, '주식');
  assert.strictEqual(filledResult.assets[0].categorySource, 'user');
});

test('F-2. mergeAssetsForAppend - 이어받을 기존 자산이 없는 신규 행은 categoryCellRaw 표식만 정리되고 그대로 저장된다', () => {
  const incoming = [{ id: 'NEW', ticker: 'NEWX', owner: '신랑', accountType: '일반계좌', name: '신규자산', category: '주식', categorySource: 'system', categoryCellRaw: '', quantity: 1, buyPrice: 1000 }];
  const { assets, newCount } = mergeAssetsForAppend([], incoming);
  assert.strictEqual(newCount, 1);
  assert.strictEqual(assets[0].category, '주식');
  assert.ok(!('categoryCellRaw' in assets[0]), '신규 자산 브랜치에서도 임시 표식이 남으면 안 된다');
});

/* ── 기존 데이터 무변화(자동 migration 없음) ───────────────────────────────── */
test('G. legacy 자산(categorySource 필드 자체가 없음)은 그대로 undefined로 남는다 - user/system 어느 쪽으로도 소급하지 않는다', () => {
  const legacy = { id: 'L1', category: '주식', quantity: 10, buyPrice: 1000 }; // categorySource 키 자체가 없음
  const r = resolveImportedCategory(legacy);
  assert.strictEqual(r.category, '주식'); // 기존 값 그대로
  assert.strictEqual(r.categorySource, undefined); // 자동 확정하지 않음
});

/* ── [V1.2-B BL-17 Persistence Hotfix] persistAssets -> localStorage -> (loadState가 그대로
 * JSON.parse해 읽는 것과 동일한) 재파싱 왕복에서 categorySource가 살아남는지 직접 검증한다.
 * persistAssets()의 저장 whitelist에 categorySource가 빠져 있던 것이 실제 원인이었다 - 새로고침 전
 * state.assets(메모리)에는 값이 멀쩡했으므로 같은 세션 안에서 값을 읽기만 하는 위 테스트들은 이
 * 결함을 잡지 못했다. loadState()는 localStorage에서 읽은 JSON을 그대로 state.assets에 대입할 뿐
 * 별도 재해석을 하지 않으므로, "persistAssets가 쓴 JSON을 다시 파싱한 결과"가 곧 loadState 왕복
 * 결과와 동일하다 - 이 테스트가 그 재파싱을 직접 수행한다. */
function roundTrip(assets) {
  state.assets = assets;
  persistAssets(true); // skipPush - schedulePush()는 js/12 없이 이 파일만 require해서는 정의돼 있지 않다
  return JSON.parse(localStorage.getItem(LS_ASSETS));
}

test('H-1. Persistence round-trip - categorySource=user는 새로고침(재파싱) 후에도 유지된다', () => {
  const restored = roundTrip([{ id: 'p1', category: 'ETF', categorySource: 'user', quantity: 1, buyPrice: 1000, positionSource: 'manual' }]);
  assert.strictEqual(restored[0].category, 'ETF');
  assert.strictEqual(restored[0].categorySource, 'user');
});

test('H-2. Persistence round-trip - categorySource=system은 새로고침(재파싱) 후에도 유지된다', () => {
  const restored = roundTrip([{ id: 'p2', category: 'ETF', categorySource: 'system', quantity: 1, buyPrice: 1000 }]);
  assert.strictEqual(restored[0].category, 'ETF');
  assert.strictEqual(restored[0].categorySource, 'system');
});

test('H-3. Persistence round-trip - legacy(categorySource 없음)는 새로고침 후에도 undefined로 남는다(user/system으로 승격되지 않는다)', () => {
  const restored = roundTrip([{ id: 'p3', category: '주식', quantity: 1, buyPrice: 1000 }]); // categorySource 키 자체가 없음
  assert.strictEqual(restored[0].category, '주식');
  assert.strictEqual(restored[0].categorySource, undefined);
});

test('H-4. Persistence round-trip - 서로 다른 category/categorySource/positionSource를 가진 복수 자산이 각자 pair를 유지한다', () => {
  const restored = roundTrip([
    { id: 'm1', category: 'ETF', categorySource: 'user', positionSource: 'manual', quantity: 1, buyPrice: 1000 },
    { id: 'm2', category: '주식', categorySource: 'system', positionSource: 'ledger', quantity: 2, buyPrice: 2000 },
    { id: 'm3', category: '채권', quantity: 3, buyPrice: 3000 } // legacy, positionSource도 없음
  ]);
  assert.deepStrictEqual(
    restored.map((a) => ({ id: a.id, category: a.category, categorySource: a.categorySource, positionSource: a.positionSource })),
    [
      { id: 'm1', category: 'ETF', categorySource: 'user', positionSource: 'manual' },
      { id: 'm2', category: '주식', categorySource: 'system', positionSource: 'ledger' },
      { id: 'm3', category: '채권', categorySource: undefined, positionSource: undefined }
    ]
  );
});
