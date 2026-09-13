// [FIX-2] 일별 이력만 복구 - planSnapshotRecovery / isValidSnapshotEntry 단위 검증.
// 실행: node --test test/snapshot-recovery.test.js
//
// 이 기능의 존재 이유는 "백업에 남아 있는 원본 과거 이력을, 지금 있는 것은 하나도 건드리지 않고
// 비어 있는 날짜에만 되메우는 것"이다. 그래서 검증도 그 두 가지에 집중한다.
//   ① 없는 날짜만 추가한다 - 있는 날짜는 값이 같든 다르든 절대 덮지 않는다
//   ② 계획 수립은 순수하다 - 입력 객체도, 현재 스냅샷도 바뀌지 않는다(미리보기가 안전한 근거)
//
// sync-payload.test.js와 같은 방식으로 가짜 DOM을 깔고 module.exports로 노출된 순수 함수만 쓴다.
// 실제 사용자 백업은 쓰지 않는다 - 아래 fixture는 전부 합성 데이터다.

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
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = global;
// 브라우저에서는 js/01이 먼저 로드돼 이 전역들이 이미 있다 - 노드에서 js/12만 떼어 쓰므로 같은 것을 깔아준다.
global.todayDateStr = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const { planSnapshotRecovery, isValidSnapshotEntry } =
  require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

// 실제 백업과 같은 모양의 하루치 스냅샷(합성 값).
function snap(cur, pnl) {
  return {
    total: { cur, dailyPnL: pnl },
    byOwner: { '신랑': { cur: cur * 0.6, dailyPnL: pnl * 0.6 }, '와이프': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } },
    byOwnerCategory: {
      '신랑': { '주식': { cur: cur * 0.6, dailyPnL: pnl * 0.6 } },
      '와이프': { 'ETF': { cur: cur * 0.4, dailyPnL: pnl * 0.4 } }
    }
  };
}
function days(spec) {
  const out = {};
  Object.keys(spec).forEach((d) => { out[d] = snap(spec[d][0], spec[d][1]); });
  return out;
}

/* ── ① 구조 검증 ─────────────────────────────────────────────────────── */

test('U-01. v234가 읽는 구조를 그대로 갖춘 스냅샷만 통과시킨다', () => {
  assert.strictEqual(isValidSnapshotEntry(snap(1000, 10)), true);
});

test('U-02. 구조가 어긋난 스냅샷은 전부 거절한다(자동 보정하지 않는다)', () => {
  const bad = [
    null, undefined, 42, 'x', [],
    {},                                                   // total 없음
    { total: { cur: 1 }, byOwner: {}, byOwnerCategory: {} },        // dailyPnL 없음
    { total: { cur: 1, dailyPnL: 'x' }, byOwner: {}, byOwnerCategory: {} }, // 숫자가 아님
    { total: { cur: NaN, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} }, // NaN
    { total: { cur: Infinity, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: {} },
    { total: { cur: 1, dailyPnL: 0 }, byOwnerCategory: {} },         // byOwner 없음
    { total: { cur: 1, dailyPnL: 0 }, byOwner: {} },                 // byOwnerCategory 없음
    { total: { cur: 1, dailyPnL: 0 }, byOwner: [], byOwnerCategory: {} },   // 배열
    { total: { cur: 1, dailyPnL: 0 }, byOwner: { '신랑': { cur: 1 } }, byOwnerCategory: {} }, // owner 하위 결손
    { total: { cur: 1, dailyPnL: 0 }, byOwner: {}, byOwnerCategory: { '신랑': { '주식': { cur: 1 } } } }
  ];
  bad.forEach((b, i) => assert.strictEqual(isValidSnapshotEntry(b), false, `bad[${i}]가 통과되면 안 된다`));
});

/* ── ② ADD MISSING ONLY ─────────────────────────────────────────────── */

test('U-03. 백업에만 있는 날짜만 추가한다', () => {
  const cur = days({ '2026-03-03': [300, 3] });
  const backup = days({ '2026-03-01': [100, 1], '2026-03-02': [200, 2], '2026-03-03': [300, 3] });
  const plan = planSnapshotRecovery(backup, cur);

  assert.strictEqual(plan.ok, true);
  assert.deepStrictEqual(plan.added, ['2026-03-01', '2026-03-02']);
  assert.deepStrictEqual(Object.keys(plan.merged).sort(), ['2026-03-01', '2026-03-02', '2026-03-03']);
});

test('U-04. 지금만 있는 날짜는 백업에 없어도 그대로 남는다', () => {
  const cur = days({ '2026-03-09': [900, 9] });          // 백업보다 최신 - 백업엔 없다
  const backup = days({ '2026-03-01': [100, 1] });
  const plan = planSnapshotRecovery(backup, cur);

  assert.ok(Object.prototype.hasOwnProperty.call(plan.merged, '2026-03-09'), '기존 최신 날짜가 사라지면 안 된다');
  assert.deepStrictEqual(plan.merged['2026-03-09'], cur['2026-03-09']);
});

test('U-05. 같은 날짜에 값까지 같으면 아무 일도 일어나지 않는다', () => {
  const cur = days({ '2026-03-01': [100, 1] });
  const backup = days({ '2026-03-01': [100, 1] });
  const plan = planSnapshotRecovery(backup, cur);

  assert.deepStrictEqual(plan.added, []);
  assert.deepStrictEqual(plan.conflicts, [], '값이 같으면 충돌이 아니다');
  assert.deepStrictEqual(plan.merged, cur);
});

test('U-06. 키 순서만 다른 같은 값은 충돌로 잡지 않는다', () => {
  const cur = { '2026-03-01': { total: { cur: 100, dailyPnL: 1 }, byOwner: {}, byOwnerCategory: {} } };
  const backup = { '2026-03-01': { byOwnerCategory: {}, byOwner: {}, total: { dailyPnL: 1, cur: 100 } } };
  const plan = planSnapshotRecovery(backup, cur);
  assert.deepStrictEqual(plan.conflicts, []);
  assert.deepStrictEqual(plan.added, []);
});

/* ── ③ 충돌 ─────────────────────────────────────────────────────────── */

test('U-07. 같은 날짜인데 값이 다르면 현재 값을 유지하고 충돌로만 보고한다', () => {
  const cur = days({ '2026-03-01': [100, 1] });
  const backup = days({ '2026-03-01': [999, 9] });
  const plan = planSnapshotRecovery(backup, cur);

  assert.deepStrictEqual(plan.conflicts, ['2026-03-01']);
  assert.deepStrictEqual(plan.added, []);
  assert.deepStrictEqual(plan.merged['2026-03-01'], cur['2026-03-01'], '백업 값으로 덮이면 안 된다');
  assert.notDeepStrictEqual(plan.merged['2026-03-01'], backup['2026-03-01']);
});

/* ── ④ 형식 오류 차단 ───────────────────────────────────────────────── */

test('U-08. 형식이 깨진 날짜는 추가하지 않고 제외 목록에만 남긴다', () => {
  const cur = days({ '2026-03-05': [500, 5] });
  const backup = {
    '2026-03-01': snap(100, 1),
    '2026-03-02': { total: { cur: 1 } },        // 구조 불량
    'not-a-date': snap(300, 3),                 // 날짜 형식 불량
    '20260304': snap(400, 4)                    // 날짜 형식 불량
  };
  const plan = planSnapshotRecovery(backup, cur);

  assert.deepStrictEqual(plan.added, ['2026-03-01']);
  assert.deepStrictEqual(plan.invalid.sort(), ['2026-03-02', '20260304', 'not-a-date'].sort());
  assert.deepStrictEqual(Object.keys(plan.merged).sort(), ['2026-03-01', '2026-03-05']);
});

test('U-09. dailySnapshots 자체가 없거나 형태가 아니면 계획을 세우지 않는다', () => {
  const cur = days({ '2026-03-05': [500, 5] });
  [undefined, null, 42, 'x', []].forEach((bad) => {
    const plan = planSnapshotRecovery(bad, cur);
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(plan.reason, 'NO_SNAPSHOTS');
    assert.deepStrictEqual(plan.merged, cur, '실패해도 현재 값이 그대로여야 한다');
  });
});

/* ── ⑤ 멱등성 ───────────────────────────────────────────────────────── */

test('U-10. 같은 백업을 두 번 적용해도 결과가 변하지 않는다', () => {
  const cur = days({ '2026-03-03': [300, 3] });
  const backup = days({ '2026-03-01': [100, 1], '2026-03-02': [200, 2], '2026-03-03': [300, 3] });

  const first = planSnapshotRecovery(backup, cur);
  assert.strictEqual(first.added.length, 2);

  // 1회차 결과를 "현재 상태"로 삼아 같은 백업을 다시 적용한다.
  const second = planSnapshotRecovery(backup, first.merged);
  assert.deepStrictEqual(second.added, [], '2회차에는 추가가 없어야 한다');
  assert.deepStrictEqual(second.conflicts, [], '2회차에 충돌이 생기면 값이 달라졌다는 뜻이다');
  assert.deepStrictEqual(second.merged, first.merged);
});

test('U-11. 값을 더하지 않는다 - 스냅샷은 누적이 아니라 그대로 옮겨진다', () => {
  const backup = days({ '2026-03-01': [100, 7] });
  const once = planSnapshotRecovery(backup, {});
  const twice = planSnapshotRecovery(backup, once.merged);
  assert.strictEqual(twice.merged['2026-03-01'].total.dailyPnL, 7, 'dailyPnL이 누적되면 안 된다');
  assert.strictEqual(twice.merged['2026-03-01'].total.cur, 100);
});

/* ── ⑥ 순수성(미리보기 안전성) ──────────────────────────────────────── */

test('U-12. 계획 수립은 입력을 전혀 바꾸지 않는다(미리보기가 안전한 근거)', () => {
  const cur = days({ '2026-03-03': [300, 3] });
  const backup = days({ '2026-03-01': [100, 1], '2026-03-03': [999, 9] });
  const curBefore = JSON.parse(JSON.stringify(cur));
  const backupBefore = JSON.parse(JSON.stringify(backup));
  const curRef = cur['2026-03-03'];

  const plan = planSnapshotRecovery(backup, cur);

  assert.deepStrictEqual(cur, curBefore, '현재 스냅샷이 변경되면 안 된다');
  assert.deepStrictEqual(backup, backupBefore, '백업 객체가 변경되면 안 된다');
  assert.strictEqual(cur['2026-03-03'], curRef, '기존 날짜 객체의 참조까지 그대로여야 한다');
  assert.notStrictEqual(plan.merged, cur, '병합 결과는 새 객체여야 한다');
  assert.strictEqual(plan.conflicts.length, 1);
});

test('U-13. 현재 스냅샷이 비어 있어도(전부 소실) 백업 전체를 되메운다', () => {
  const backup = days({ '2026-03-01': [100, 1], '2026-03-02': [200, 2], '2026-03-03': [300, 3] });
  const plan = planSnapshotRecovery(backup, {});
  assert.strictEqual(plan.added.length, 3);
  assert.deepStrictEqual(plan.kept, []);
  assert.deepStrictEqual(plan.merged, backup);
});

/* ══════════════════════════════════════════════════════════════════════
 * [FIX-2a] 재구성 placeholder 후보 판정
 *
 * 판정은 보수적이어야 한다. 실제 시장에도 "손익이 0인 날"과 "평가금액이 어제와 같은 날"은
 * 흔히 있고, 그런 정상 기록을 후보로 잘못 집으면 복구라는 명분으로 진짜 데이터를 바꾸게 된다.
 * 그래서 [F2] 아래 조건을 전부 만족할 때만 후보로 본다 - 하나씩으로는 절대 판정하지 않는다.
 *   ① 오늘 이전 · 백업 최대 날짜 이하   ② 모든 축의 dailyPnL이 0   ③ ②인 날이 달력상 14일 이상 연속
 *   ④ 그 구간의 백업 날짜 중 25% 이상에 손익이 기록됨(현재에는 없는 기록이 백업에는 있다)
 * 여기에 ⑤⑥(백업에 정상 스냅샷 존재)까지 더해야 비로소 교체 후보가 된다. 과거 cur은 부팅마다 재구성되는
 * 파생값이라 판정에 쓰지 않는다.
 * ══════════════════════════════════════════════════════════════════════ */

const { hasNoRecordedPnl, detectPlaceholderCandidates, PLACEHOLDER_MIN_RUN, PLACEHOLDER_BACKUP_PNL_RATIO, describeRecoveryBackup } =
  require(path.join(__dirname, '..', 'js', '12-import-export-sync.js'));

// [로컬 날짜 기준] 앱의 todayDateStr()/dateKeyFromDate()와 같은 로컬 날짜로 키를 만든다. UTC(toISOString)를
// 쓰면 KST 00:00~08:59에 하루 어긋나 오늘/과거 판정이 틀어진다.
function localDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TODAY_KEY = localDateKey(new Date());
function dayBefore(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateKey(d);
}
// reconstructHistoricalCurValues가 남기는 모양: cur만 채우고 dailyPnL은 어느 축에도 쓰지 않는다.
function placeholderLike(cur) {
  return {
    total: { cur, dailyPnL: 0 },
    byOwner: { '신랑': { cur: cur * 0.6, dailyPnL: 0 }, '와이프': { cur: cur * 0.4, dailyPnL: 0 } },
    byOwnerCategory: {
      '신랑': { '주식': { cur: cur * 0.6, dailyPnL: 0 } },
      '와이프': { 'ETF': { cur: cur * 0.4, dailyPnL: 0 } }
    }
  };
}
const ANCHOR = 50000000;

// 피해 상태: 오늘 기록 + 과거 N일이 전부 오늘 값 복제 placeholder
function damagedState(runDays) {
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  for (let i = 1; i <= runDays; i++) cur[dayBefore(i)] = placeholderLike(ANCHOR);
  return cur;
}
function backupFor(dates) {
  const b = {};
  dates.forEach((d, i) => { b[d] = snap(1000 + i * 10, 5 + i); });
  return b;
}

test('U-14. dailyPnL이 한 축이라도 0이 아니면 "기록 없음"이 아니다', () => {
  assert.strictEqual(hasNoRecordedPnl(placeholderLike(ANCHOR)), true);
  const withTotal = placeholderLike(ANCHOR); withTotal.total.dailyPnL = 1;
  assert.strictEqual(hasNoRecordedPnl(withTotal), false);
  const withOwner = placeholderLike(ANCHOR); withOwner.byOwner['신랑'].dailyPnL = 1;
  assert.strictEqual(hasNoRecordedPnl(withOwner), false);
  const withCat = placeholderLike(ANCHOR); withCat.byOwnerCategory['신랑']['주식'].dailyPnL = 1;
  assert.strictEqual(hasNoRecordedPnl(withCat), false, '자산군 축의 손익도 놓치면 안 된다');
});

test('U-15. [Test 4] 연속 placeholder + 정상 백업 -> 후보로만 분류되고 자동 교체되지 않는다', () => {
  const cur = damagedState(20);
  const dates = Object.keys(cur).filter((k) => k !== TODAY_KEY);
  const backup = backupFor(dates);
  const cands = detectPlaceholderCandidates(cur, backup, TODAY_KEY);
  assert.strictEqual(cands.length, 20);

  // 승인 없이는 교체되지 않는다.
  const plan = planSnapshotRecovery(backup, cur);
  assert.deepStrictEqual(plan.replaced, [], '승인 없이 교체되면 안 된다');
  assert.deepStrictEqual(plan.added, [], '후보는 added에 섞이지 않는다');
  assert.deepStrictEqual(plan.conflicts, [], '후보는 conflict로도 세지 않는다');
  assert.strictEqual(plan.placeholderCandidates.length, 20);
  dates.forEach((d) => assert.deepStrictEqual(plan.merged[d], cur[d], '현재 값이 그대로여야 한다'));
});

test('U-16. 사용자가 승인하면 그때만 후보가 백업 값으로 교체된다', () => {
  const cur = damagedState(20);
  const dates = Object.keys(cur).filter((k) => k !== TODAY_KEY);
  const backup = backupFor(dates);
  const plan = planSnapshotRecovery(backup, cur, { includePlaceholders: true });
  assert.strictEqual(plan.replaced.length, 20);
  dates.forEach((d) => assert.deepStrictEqual(plan.merged[d], backup[d]));
  assert.deepStrictEqual(plan.merged[TODAY_KEY], cur[TODAY_KEY], '오늘 기록은 건드리지 않는다');
});

test('U-17. [F2] 손익 0인 날이 이어져도 백업에 그 기간 손익 기록이 없으면 후보가 아니다', () => {
  // 평가금액이 날마다 달라도 판정은 cur을 보지 않는다 - 근거는 백업에 손익 기록이 있느냐다.
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const dates = [];
  for (let i = 1; i <= 20; i++) {
    const d = dayBefore(i);
    dates.push(d);
    cur[d] = placeholderLike(ANCHOR - i * 100000);
  }
  const noPnlBackup = {};
  dates.forEach((d, i) => { noPnlBackup[d] = snap(1000 + i * 10, 0); });
  assert.deepStrictEqual(detectPlaceholderCandidates(cur, noPnlBackup, TODAY_KEY), [], '백업에도 손익이 없으면 정보 공백이 아니다');
  // 같은 현재 state라도 백업에 그 기간 손익이 기록돼 있으면 후보다 - 평가금액 차이는 이유가 되지 않는다.
  assert.strictEqual(detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY).length, 20);
});

test('U-18. [Test 3] 오늘과 평가금액이 같아도 손익이 기록돼 있으면 후보가 아니다', () => {
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const dates = [];
  for (let i = 1; i <= 20; i++) {
    const d = dayBefore(i);
    dates.push(d);
    const s = placeholderLike(ANCHOR);      // cur는 오늘과 완전히 동일
    s.total.dailyPnL = 1;                    // 그러나 손익이 기록돼 있다 = 실제 기록
    cur[d] = s;
  }
  const cands = detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY);
  assert.deepStrictEqual(cands, [], 'cur 일치만으로 후보가 되면 안 된다');
});

test('U-19. 주말·연휴처럼 짧게 멈춘 구간은 후보가 아니다(연속 길이 기준 미달)', () => {
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const dates = [];
  for (let i = 1; i <= PLACEHOLDER_MIN_RUN - 1; i++) { const d = dayBefore(i); dates.push(d); cur[d] = placeholderLike(ANCHOR); }
  const cands = detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY);
  assert.deepStrictEqual(cands, [], PLACEHOLDER_MIN_RUN + '일 미만 연속은 후보가 아니다');
});

test('U-20. [Test 6] 백업에 그 날짜가 없으면 후보가 아니다(교체할 원본이 없다)', () => {
  const cur = damagedState(20);
  const cands = detectPlaceholderCandidates(cur, {}, TODAY_KEY);
  assert.deepStrictEqual(cands, []);
});

test('U-21. [Test 5] 백업 스냅샷 구조가 깨져 있으면 후보가 아니다', () => {
  const cur = damagedState(20);
  const dates = Object.keys(cur).filter((k) => k !== TODAY_KEY);
  const broken = {};
  dates.forEach((d) => { broken[d] = { total: { cur: 1 } }; }); // 구조 불량
  const cands = detectPlaceholderCandidates(cur, broken, TODAY_KEY);
  assert.deepStrictEqual(cands, []);
});

test('U-22. [F2] 오늘 기록이 없어도 판정은 오늘 값을 쓰지 않는다 - 과거 구간과 백업 증거만 본다', () => {
  const cur = {};
  const dates = [];
  for (let i = 1; i <= 20; i++) { const d = dayBefore(i); dates.push(d); cur[d] = placeholderLike(ANCHOR); }
  const cands = detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY);
  assert.strictEqual(cands.length, 20, '오늘 기록 유무가 판정을 바꾸지 않는다');
});

test('U-23. [Test 1] 정상 historical 기록은 값이 달라도 후보가 아니라 충돌이다', () => {
  const d = dayBefore(3);
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  cur[d] = snap(111, 11);
  const backup = {};
  backup[d] = snap(222, 22);
  const plan = planSnapshotRecovery(backup, cur);
  assert.deepStrictEqual(plan.placeholderCandidates, []);
  assert.deepStrictEqual(plan.conflicts, [d]);
  assert.deepStrictEqual(plan.merged[d], cur[d], '정상 기록은 유지된다');
});

test('U-24. [Test 7] 키가 아예 없는 날짜는 예전처럼 ADD MISSING ONLY로 추가된다', () => {
  const missing = dayBefore(3);
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const backup = {};
  backup[missing] = snap(111, 11);
  const plan = planSnapshotRecovery(backup, cur);
  assert.deepStrictEqual(plan.added, [missing]);
  assert.deepStrictEqual(plan.placeholderCandidates, []);
  assert.deepStrictEqual(plan.merged[missing], backup[missing]);
});

test('U-25. 후보 구간과 정상 구간이 섞여 있어도 정상 구간은 건드리지 않는다', () => {
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const phDates = [], normalDates = [];
  for (let i = 1; i <= 16; i++) { const d = dayBefore(i); phDates.push(d); cur[d] = placeholderLike(ANCHOR); }
  for (let i = 17; i <= 26; i++) { const d = dayBefore(i); normalDates.push(d); cur[d] = snap(7000 + i, i); }
  const backup = {};
  phDates.concat(normalDates).forEach((d, i) => { backup[d] = snap(90000 + i, 900 + i); });

  const plan = planSnapshotRecovery(backup, cur, { includePlaceholders: true });
  assert.strictEqual(plan.replaced.length, 16, '후보 구간만 교체된다');
  normalDates.forEach((d) => {
    assert.deepStrictEqual(plan.merged[d], cur[d], '정상 구간은 그대로 유지된다');
    assert.ok(plan.conflicts.indexOf(d) >= 0, '정상 구간의 값 차이는 충돌로 보고된다');
  });
});

test('U-26. 후보 교체도 멱등하다 - 두 번 적용해도 결과가 같다', () => {
  const cur = damagedState(20);
  const dates = Object.keys(cur).filter((k) => k !== TODAY_KEY);
  const backup = backupFor(dates);

  const first = planSnapshotRecovery(backup, cur, { includePlaceholders: true });
  assert.strictEqual(first.replaced.length, 20);

  // 1회차 결과를 현재 상태로 삼아 다시 적용한다 - 이제 후보가 아니므로 교체도 추가도 없어야 한다.
  const second = planSnapshotRecovery(backup, first.merged, { includePlaceholders: true });
  assert.deepStrictEqual(second.added, []);
  assert.deepStrictEqual(second.replaced, [], '이미 원본으로 바뀐 날짜를 또 교체하면 안 된다');
  assert.deepStrictEqual(second.placeholderCandidates, []);
  assert.deepStrictEqual(second.merged, first.merged);
});

test('U-27. 후보 판정은 입력을 바꾸지 않는다', () => {
  const cur = damagedState(20);
  const dates = Object.keys(cur).filter((k) => k !== TODAY_KEY);
  const backup = backupFor(dates);
  const curBefore = JSON.parse(JSON.stringify(cur));
  const backupBefore = JSON.parse(JSON.stringify(backup));
  detectPlaceholderCandidates(cur, backup, TODAY_KEY);
  planSnapshotRecovery(backup, cur, { includePlaceholders: true });
  assert.deepStrictEqual(cur, curBefore);
  assert.deepStrictEqual(backup, backupBefore);
});

/* ══════════════════════════════════════════════════════════════════════
 * [v236 P1-B · F2] placeholder 후보 판정 - 손익 0 연속 구간 + 백업 손익 증거
 *
 * 과거 cur은 부팅마다 재구성되는 파생값이라 판정에 쓰지 않는다. 날짜 d는
 *   ① d < 오늘, d <= 백업 최대 날짜   ② 현재 모든 축 dailyPnL === 0
 *   ③ ②인 날의 달력상 연속 구간 R이 14일 이상
 *   ④ R 중 백업 유효 날짜 n개 가운데 손익 기록일이 max(1, ceil(n x 25%)) 이상   ⑤⑥ 백업에 d의 정상 스냅샷
 * 을 전부 만족할 때만 후보다. P0~P11은 설계 감사 보고서의 합성 상태 번호와 같다.
 * 아래 fixture는 전부 합성 데이터다(실제 기기 state나 실제 백업을 반입하지 않는다).
 * ══════════════════════════════════════════════════════════════════════ */

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const F2_TODAY_CUR = 50000000;
const range = (a, b) => { const r = []; for (let n = a; n <= b; n++) r.push(n); return r; };
const isWeekendLike = (n) => n % 7 === 0 || n % 7 === 6; // 7일 중 2일은 손익 0(주말·휴장)

// 오늘 기록(recordDailySnapshot) 모양. usd면 USD 현금이 '달러' 키로 따로 있다.
function f2Today(usd, curValue) {
  const c = curValue || F2_TODAY_CUR;
  const cats = { '주식': { cur: c * 0.6, dailyPnL: 1234 }, '현금': { cur: c * 0.3, dailyPnL: 0 } };
  if (usd) { cats['현금'].cur = c * 0.2; cats['달러'] = { cur: c * 0.1, dailyPnL: -56 }; }
  return {
    total: { cur: c, dailyPnL: 1178 },
    byOwner: { '신랑': { cur: c * 0.9, dailyPnL: 1178 }, '와이프': { cur: c * 0.1, dailyPnL: 0 } },
    byOwnerCategory: { '신랑': cats, '와이프': { 'ETF': { cur: c * 0.1, dailyPnL: 0 } } }
  };
}
// 재구성이 남긴 placeholder 모양 - 손익은 모든 축 0, USD 현금은 '현금' 칸에 합쳐져 있다.
function f2Zero(c) {
  return {
    total: { cur: c, dailyPnL: 0 },
    byOwner: { '신랑': { cur: c * 0.9, dailyPnL: 0 }, '와이프': { cur: c * 0.1, dailyPnL: 0 } },
    byOwnerCategory: { '신랑': { '주식': { cur: c * 0.6, dailyPnL: 0 }, '현금': { cur: c * 0.3, dailyPnL: 0 } }, '와이프': { 'ETF': { cur: c * 0.1, dailyPnL: 0 } } }
  };
}
// 백업: 날짜 n마다 정상 스냅샷. 기본은 7일 중 5일에 손익 기록.
function f2Backup(fromN, toN, pnlOf) {
  const b = {};
  range(fromN, toN).forEach((n) => { b[dayBefore(n)] = snap(60000000 + n * 1000, pnlOf ? pnlOf(n) : (isWeekendLike(n) ? 0 : 1000 + n)); });
  return b;
}
// 합성 피해 state(오늘 + 과거 lastN일). 백업은 dk4~dk398 = 겹치는 구간 + 더 과거 날짜.
//   usd       : 오늘 기록에 '달러' 키가 따로 있다(placeholder는 '현금'에 합쳐짐)
//   phFrom/To : placeholder 구간(그 밖은 주말만 손익 0인 정상 기록, 최근 3일은 기본 placeholder)
//   phCur     : placeholder의 cur(재구성이 오늘 값에서 이동시킨 값 등 - F2는 쓰지 않는다)
//   recentPnl : 최근 3일(백업에 없음)에 실제 손익이 기록됨
//   todayCur  : 오늘 기록의 cur
function f2State(o) {
  const phFrom = o.phFrom || 4, phTo = o.phTo || 365, lastN = o.lastN || 365;
  const cur = {};
  cur[TODAY_KEY] = f2Today(!!o.usd, o.todayCur);
  range(1, lastN).forEach((n) => {
    const d = dayBefore(n);
    if (n <= 3 && o.recentPnl) cur[d] = snap(70000000 + n * 111, 1000 * n);
    else if (n <= 3 || (n >= phFrom && n <= phTo)) cur[d] = f2Zero(o.phCur ? o.phCur(n) : F2_TODAY_CUR);
    else cur[d] = snap(50000000 + n * 77, isWeekendLike(n) ? 0 : 500 + n);
  });
  return { cur, backup: f2Backup(4, 398), lastN, truth: range(Math.max(phFrom, 4), phTo).map(dayBefore).sort() };
}

const F2_TRUE_CASES = [
  ['P0 USD 현금 없음 · 최근 손익 없음', {}],
  ['P1 USD 현금 · 최근 손익 없음', { usd: true }],
  ['P1f USD 현금 · 1원 미만 계산오차', { usd: true, phCur: () => F2_TODAY_CUR + 1.862645149230957e-9 }],
  ['P2 USD 현금 · placeholder 뒤 실제 손익 3일로 cur 이동', { usd: true, recentPnl: true, phCur: () => F2_TODAY_CUR - 6000 }],
  ['P2f P2 + 1원 미만 계산오차', { usd: true, recentPnl: true, phCur: () => F2_TODAY_CUR - 6000 + 9.313225746154785e-10 }],
  ['P6 일부 기간(140일)만 placeholder', { usd: true, phFrom: 61, phTo: 200 }],
  ['P6n P6 · USD 현금 없음', { phFrom: 61, phTo: 200 }],
  ['P10 366일 재구성 창 밖으로 밀려난 오래된 조각', { usd: true, lastN: 375, phTo: 375, phCur: (n) => (n > 365 ? F2_TODAY_CUR * 0.95 : F2_TODAY_CUR) }],
  ['P11 부팅 뒤 시세 변화로 오늘 기록만 바뀜', { usd: true, todayCur: F2_TODAY_CUR * 1.01 }]
];

F2_TRUE_CASES.forEach(([name, o], i) => {
  test(`U-${28 + i}. [F2] 진짜 placeholder - ${name} -> 14일·25%에서 후보 정상 검출`, () => {
    const s = f2State(o);
    const plan = planSnapshotRecovery(s.backup, s.cur);
    assert.deepStrictEqual(plan.placeholderCandidates, s.truth, '후보 = 진짜 placeholder(FP 0 · FN 0)');
    const overlap = s.lastN - 3; // 현재와 백업이 겹치는 날짜 수(dk4 ~ dk lastN)
    assert.strictEqual(plan.added.length, 398 - s.lastN, '새로 추가되는 이력');
    assert.strictEqual(plan.conflicts.length, overlap - s.truth.length, '후보가 아닌 겹치는 정상 기록만 충돌');
    assert.strictEqual(plan.invalid.length, 0);
    assert.strictEqual(plan.kept.length - plan.placeholderCandidates.length, s.lastN + 1 - s.truth.length, '기존 유지');
  });
});

// 정상 이력: 주말만 손익 0. zeroRun이면 그 기간은 현재와 백업 모두 실제로 손익이 없던 날이다.
function f2Normal(zeroRun) {
  const inRun = (n) => !!zeroRun && n >= zeroRun[0] && n <= zeroRun[1];
  const cur = {};
  cur[TODAY_KEY] = f2Today(true);
  range(1, 365).forEach((n) => { cur[dayBefore(n)] = inRun(n) ? f2Zero(F2_TODAY_CUR - n) : snap(50000000 + n * 77, isWeekendLike(n) ? 0 : 500 + n); });
  return { cur, backup: f2Backup(4, 398, (n) => (inRun(n) || isWeekendLike(n) ? 0 : 900 + n)) };
}

test('U-37. [F2] 정상 zero-PnL 기록은 후보가 되지 않는다(P4 주말 zero · P3 실제 20일 zero 구간)', () => {
  const p4 = f2Normal(null);
  assert.deepStrictEqual(planSnapshotRecovery(p4.backup, p4.cur).placeholderCandidates, [], '주말처럼 짧은 zero 구간');
  const p3 = f2Normal([100, 119]);
  assert.deepStrictEqual(planSnapshotRecovery(p3.backup, p3.cur).placeholderCandidates, [],
    '14일을 넘는 zero 구간이어도 백업에도 손익이 없으면 후보가 아니다');
});

test('U-38. [F2] 장기 zero-PnL 정상 데이터(P5 티커 없는 자산만) - 백업 손익 증거가 없으면 후보가 아니다', () => {
  const cur = {};
  cur[TODAY_KEY] = f2Zero(F2_TODAY_CUR);
  range(1, 365).forEach((n) => { cur[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });
  const plan = planSnapshotRecovery(f2Backup(4, 398, () => 0), cur);
  assert.deepStrictEqual(plan.placeholderCandidates, []);
  assert.deepStrictEqual(plan.replaced, []);
});

test('U-39. [F2] P8 다른 계보 백업 - 판정만으로는 구분할 수 없다(정책상 확인창 메타데이터로 사용자가 확인)', () => {
  // 현재는 실제 zero-PnL 이력인데 사용자가 손익 기록이 있는 다른 계보의 백업을 고른 경우다. F2는 이를
  // 후보로 올린다 - 오류가 아니라 알려진 한계이며, 그래서 2차 확인창에 백업의 내보낸 시각·이력 기간·소유자를
  // 보여준다. 이 테스트는 그 한계와 승인 전 무변경이 조용히 바뀌지 않도록 고정한다.
  const cur = {};
  cur[TODAY_KEY] = f2Zero(F2_TODAY_CUR);
  range(1, 365).forEach((n) => { cur[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });
  const other = f2Backup(4, 398);
  const plan = planSnapshotRecovery(other, cur);
  assert.strictEqual(plan.placeholderCandidates.length, 362);
  assert.deepStrictEqual(plan.replaced, [], '승인 전에는 교체되지 않는다');
  const info = describeRecoveryBackup({ exportedAt: '2026-01-01T00:00:00.000Z', dailySnapshots: other });
  assert.strictEqual(info.start, dayBefore(398));
  assert.strictEqual(info.end, dayBefore(4));
  assert.deepStrictEqual(info.owners, ['신랑', '와이프']);
});

test('U-40. [F2] 백업 손익 비율 경계 - 24% 불통과 / 25% 통과(구간의 백업 날짜 수 기준 올림)', () => {
  assert.strictEqual(PLACEHOLDER_BACKUP_PNL_RATIO, 0.25);
  const cur = {};
  cur[TODAY_KEY] = f2Today(false);
  range(1, 100).forEach((n) => { cur[dayBefore(n)] = f2Zero(F2_TODAY_CUR - n); });
  const bk = (k) => f2Backup(1, 100, (n) => (n <= k ? 700 + n : 0));
  assert.deepStrictEqual(detectPlaceholderCandidates(cur, bk(24), TODAY_KEY), [], '100일 중 24일(24%)');
  assert.strictEqual(detectPlaceholderCandidates(cur, bk(25), TODAY_KEY).length, 100, '100일 중 25일(25%)');
  // 짧은 구간은 올림한다: 14일 x 25% = 3.5 -> 4일 필요
  const cur14 = {};
  cur14[TODAY_KEY] = f2Today(false);
  range(1, 14).forEach((n) => { cur14[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });
  assert.deepStrictEqual(detectPlaceholderCandidates(cur14, f2Backup(1, 14, (n) => (n <= 3 ? 1 : 0)), TODAY_KEY), []);
  assert.strictEqual(detectPlaceholderCandidates(cur14, f2Backup(1, 14, (n) => (n <= 4 ? 1 : 0)), TODAY_KEY).length, 14);
});

test('U-41. [F2] 최소 연속 길이 경계 - 13일 불통과 / 14일 통과, 빠진 날짜가 있으면 구간이 끊긴다', () => {
  assert.strictEqual(PLACEHOLDER_MIN_RUN, 14);
  const make = (days) => {
    const c = {};
    c[TODAY_KEY] = f2Today(true);
    range(1, days).forEach((n) => { c[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });
    return c;
  };
  assert.deepStrictEqual(detectPlaceholderCandidates(make(13), f2Backup(1, 13, () => 500), TODAY_KEY), []);
  assert.strictEqual(detectPlaceholderCandidates(make(14), f2Backup(1, 14, () => 500), TODAY_KEY).length, 14);
  const gap = make(15);
  delete gap[dayBefore(8)]; // 7일 + 7일로 끊긴다
  assert.deepStrictEqual(detectPlaceholderCandidates(gap, f2Backup(1, 15, () => 500), TODAY_KEY), []);
});

test('U-42. [F2] 최신 날짜 보호 - 오늘 이후 날짜와 백업보다 최신인 날짜는 구간에 속해도 후보가 아니다', () => {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const tomorrow = localDateKey(t);
  const cur = {};
  cur[tomorrow] = f2Zero(F2_TODAY_CUR);
  cur[TODAY_KEY] = f2Zero(F2_TODAY_CUR);
  range(1, 30).forEach((n) => { cur[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });

  // (a) d >= 오늘: 백업에 오늘·내일이 형식상 정상으로 있어도 제외된다.
  //     백업 dk4~dk30 27일 중 7일에만 손익 -> ceil(27 x 25%) = 7로 통과. 최근 3일까지 분모에 넣었다면 8일이 필요했다.
  const backupA = f2Backup(4, 30, (n) => (n <= 10 ? 800 + n : 0));
  backupA[TODAY_KEY] = snap(1, 1);
  backupA[tomorrow] = snap(1, 1);
  const a = detectPlaceholderCandidates(cur, backupA, TODAY_KEY);
  assert.strictEqual(a.length, 27);
  assert.ok(a.every((d) => d < TODAY_KEY), '오늘과 그 이후는 후보가 아니다');

  // (b) d > 백업 최대 날짜: 백업이 dk4에서 끝나면 dk1~dk3은 손익 0 구간에 속해도 후보가 아니다.
  const b = detectPlaceholderCandidates(cur, f2Backup(4, 30, () => 800), TODAY_KEY);
  assert.strictEqual(b.length, 27);
  [1, 2, 3].forEach((n) => assert.ok(b.indexOf(dayBefore(n)) < 0, '백업보다 최신인 날짜는 후보가 아니다'));
  assert.ok(b.every((d) => d <= dayBefore(4)));
});

test('U-43. [F2] 백업 스냅샷이 없거나 형식이 깨진 날짜는 후보에서 빠진다', () => {
  const cur = {};
  cur[TODAY_KEY] = f2Today(false);
  range(1, 30).forEach((n) => { cur[dayBefore(n)] = f2Zero(F2_TODAY_CUR); });
  const backup = f2Backup(1, 20, () => 900);
  range(21, 25).forEach((n) => { backup[dayBefore(n)] = { total: { cur: 1 } }; }); // 형식 불량
  // dk26~dk30은 백업에 아예 없다
  assert.deepStrictEqual(detectPlaceholderCandidates(cur, backup, TODAY_KEY), range(1, 20).map(dayBefore).sort());
  const plan = planSnapshotRecovery(backup, cur, { includePlaceholders: true });
  assert.strictEqual(plan.invalid.length, 5, '깨진 날짜는 형식 오류로만 보고된다');
  assert.strictEqual(plan.replaced.length, 20);
  range(21, 30).forEach((n) => assert.deepStrictEqual(plan.merged[dayBefore(n)], cur[dayBefore(n)]));
});

test('U-44. [F2] 33일 added와 placeholder 후보는 섞이지 않는다(분류 순서 유지)', () => {
  const s = f2State({ usd: true, recentPnl: true, phCur: () => F2_TODAY_CUR - 6000 });
  const plan = planSnapshotRecovery(s.backup, s.cur);
  const cand = new Set(plan.placeholderCandidates);
  assert.strictEqual(plan.added.length, 33);
  assert.strictEqual(plan.placeholderCandidates.length, 362);
  assert.deepStrictEqual(plan.added, range(366, 398).map(dayBefore).sort());
  assert.ok(plan.added.every((d) => !cand.has(d) && !hasOwn(s.cur, d)), 'added는 현재에 없는 날짜뿐이다');
  assert.ok(plan.placeholderCandidates.every((d) => hasOwn(s.cur, d)), '후보는 현재에 있는 날짜뿐이다');

  const approved = planSnapshotRecovery(s.backup, s.cur, { includePlaceholders: true });
  assert.deepStrictEqual(approved.added, plan.added, '후보 승인 여부와 무관하게 추가 목록은 같다');
  assert.strictEqual(approved.replaced.length, 362);
  plan.added.forEach((d) => assert.deepStrictEqual(approved.merged[d], s.backup[d]));
  [TODAY_KEY, dayBefore(1), dayBefore(2), dayBefore(3)].forEach((d) =>
    assert.deepStrictEqual(approved.merged[d], s.cur[d], '오늘과 백업보다 최신인 기록은 승인해도 그대로다'));
});

test('U-45. [F2] 최근 실제 손익으로 cur이 오늘 값에서 벗어나도 정상 placeholder가 탈락하지 않는다', () => {
  const s = f2State({ usd: true, recentPnl: true, phCur: () => F2_TODAY_CUR - 6000 });
  const ph = s.cur[dayBefore(10)];
  assert.notStrictEqual(ph.total.cur, s.cur[TODAY_KEY].total.cur, '전제: placeholder cur이 오늘 값과 다르다');
  assert.ok(hasOwn(s.cur[TODAY_KEY].byOwnerCategory['신랑'], '달러') && !hasOwn(ph.byOwnerCategory['신랑'], '달러'),
    '전제: USD 현금 키 구성도 다르다');
  [1, 2, 3].forEach((n) => assert.strictEqual(hasNoRecordedPnl(s.cur[dayBefore(n)]), false, '전제: 최근 3일은 실제 손익 기록'));
  assert.strictEqual(detectPlaceholderCandidates(s.cur, s.backup, TODAY_KEY).length, 362);
});

test('U-46. [F2] 2차 확인창 메타데이터 - 내보낸 시각(KST) · 이력 기간 · 소유자는 파싱한 백업 값만 쓴다', () => {
  const parsed = {
    exportedAt: '2026-09-09T15:30:00.000Z',
    dailySnapshots: { '2026-03-02': snap(1, 1), '2026-03-01': snap(1, 0), 'bad-key': snap(1, 1), '2026-02-28': { total: { cur: 1 } } }
  };
  assert.deepStrictEqual(describeRecoveryBackup(parsed),
    { exportedAtKst: '2026-09-10 00:30 (KST)', start: '2026-03-01', end: '2026-03-02', owners: ['신랑', '와이프'] },
    'UTC 자정 전후라도 한국 시간으로 바꿔 보여주고, 형식이 깨진 날짜·키는 기간에 넣지 않는다');
  assert.strictEqual(describeRecoveryBackup({ dailySnapshots: {} }).exportedAtKst, '알 수 없음');
  assert.strictEqual(describeRecoveryBackup({ exportedAt: 'not-a-date', dailySnapshots: {} }).exportedAtKst, '알 수 없음');
  assert.deepStrictEqual(describeRecoveryBackup(null), { exportedAtKst: '알 수 없음', start: null, end: null, owners: [] });
});

test('U-47. [F2] 판정과 메타데이터 계산은 입력을 바꾸지 않는다', () => {
  const s = f2State({ usd: true, recentPnl: true, phCur: () => F2_TODAY_CUR - 6000 });
  const curBefore = JSON.parse(JSON.stringify(s.cur));
  const backupBefore = JSON.parse(JSON.stringify(s.backup));
  detectPlaceholderCandidates(s.cur, s.backup, TODAY_KEY);
  planSnapshotRecovery(s.backup, s.cur, { includePlaceholders: true });
  describeRecoveryBackup({ exportedAt: '2026-09-09T15:30:00.000Z', dailySnapshots: s.backup });
  assert.deepStrictEqual(s.cur, curBefore);
  assert.deepStrictEqual(s.backup, backupBefore);
});
