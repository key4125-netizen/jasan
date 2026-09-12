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
 * 그래서 아래 세 가지를 전부 만족할 때만 후보로 본다 - 하나씩으로는 절대 판정하지 않는다.
 *   ② 모든 축의 dailyPnL이 0   ③ cur 구성이 오늘과 완전히 동일   ④ 7일 이상 연속
 * 여기에 ⑤⑥(백업에 정상 스냅샷 존재)까지 더해야 비로소 교체 후보가 된다.
 * ══════════════════════════════════════════════════════════════════════ */

const { hasNoRecordedPnl, detectPlaceholderCandidates, PLACEHOLDER_MIN_RUN } =
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

test('U-17. [Test 2 / 13] 실제로 손익이 0이었던 정상 기록은 후보가 되지 않는다', () => {
  // 평가금액이 오늘과 다르면(= 진짜 그날의 값) dailyPnL이 0이어도 후보가 아니다.
  const cur = {};
  cur[TODAY_KEY] = placeholderLike(ANCHOR);
  const dates = [];
  for (let i = 1; i <= 20; i++) {
    const d = dayBefore(i);
    dates.push(d);
    cur[d] = placeholderLike(ANCHOR - i * 100000); // 손익 0이지만 평가금액은 날마다 다르다
  }
  const cands = detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY);
  assert.deepStrictEqual(cands, [], 'zero-PnL만으로 후보가 되면 안 된다');
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

test('U-22. 오늘 기록이 없으면 비교 기준이 없으므로 후보를 만들지 않는다', () => {
  const cur = {};
  const dates = [];
  for (let i = 1; i <= 20; i++) { const d = dayBefore(i); dates.push(d); cur[d] = placeholderLike(ANCHOR); }
  const cands = detectPlaceholderCandidates(cur, backupFor(dates), TODAY_KEY);
  assert.deepStrictEqual(cands, [], '기준이 없으면 추정하지 않는다');
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
