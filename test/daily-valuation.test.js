// [D-1~D-4 Daily Valuation] 순수 계산 함수 검증 - 시장 현지 날짜 · 오늘 잠정/확정 · 휴장 · 평일 결측 K=3 · 분할 ·
// 마지막 기록값 유지 · 계산 불가 전파(U-B). 합성 데이터만 쓴다. js/23은 top-level에서 DOM을 쓰지 않아 그대로 require한다.
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const dv = require(path.join(__dirname, '..', 'js', '23-daily-valuation.js'));

const ts = (iso) => Date.parse(iso) / 1000;
function chart(tz, bars, meta, splits) {
  return {
    meta: Object.assign({ exchangeTimezoneName: tz }, meta || {}),
    timestamp: bars.map((b) => ts(b[0])),
    indicators: { quote: [{ close: bars.map((b) => b[1]) }] },
    events: splits ? { splits } : undefined
  };
}
const norm = (result, marketKey, fetchedIso, start) => dv.dvNormalizeChart(result, {
  symbol: 'S', marketKey, fetchedAtMs: Date.parse(fetchedIso), requestedStartDate: start || '2026-09-01'
});
const krPeriod = (day) => ({ regular: { start: ts(`${day}T00:00:00Z`), end: ts(`${day}T06:00:00Z`) } });
const usPeriod = (day) => ({ regular: { start: ts(`${day}T13:30:00Z`), end: ts(`${day}T20:00:00Z`) } });

test('1. 시장 현지 날짜: KST · EDT · EST · BST · GMT와 UTC 경계', () => {
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-10-09T06:30:10Z'), 'Asia/Seoul'), { date: '2026-10-09', hhmm: 1530 });
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-10-09T15:30:00Z'), 'Asia/Seoul'), { date: '2026-10-10', hhmm: 30 });
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-10-09T13:30:00Z'), 'America/New_York'), { date: '2026-10-09', hhmm: 930 });
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-03-05T14:30:00Z'), 'America/New_York'), { date: '2026-03-05', hhmm: 930 });
  // KRW=X 여름철 일봉은 전날 23:00 UTC에 찍힌다 - UTC 문자열로 자르면 하루 앞 날짜가 된다.
  assert.strictEqual(new Date(ts('2026-03-29T23:00:00Z') * 1000).toISOString().slice(0, 10), '2026-03-29');
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-03-29T23:00:00Z'), 'Europe/London'), { date: '2026-03-30', hhmm: 0 });
  assert.deepStrictEqual(dv.dvZonedParts(ts('2026-01-02T00:00:00Z'), 'Europe/London'), { date: '2026-01-02', hhmm: 0 });
});

test('2. 타임존 변환을 못 하면 UTC 날짜로 대신하지 않고 계산 불가다', () => {
  assert.strictEqual(dv.dvZonedParts(ts('2026-10-09T00:00:00Z'), 'Not/AZone'), null);
  const s = norm(chart('Not/AZone', [['2026-10-09T00:00:00Z', 100]]), 'KR', '2026-10-09T08:00:00Z');
  assert.deepStrictEqual([s.ok, s.reason], [false, 'timezoneUnsupported']);
  assert.strictEqual(dv.dvPriceAt(s, '2026-10-09', null, 3).value, null);
});

test('3. KRX 오늘 봉: Yahoo 종료(15:00)와 실제 종가(15:30) 사이에는 확정하지 않는다', () => {
  const bars = [['2026-10-08T00:00:00Z', 100], ['2026-10-09T00:00:00Z', 110]];
  const at1515 = norm(chart('Asia/Seoul', bars, { currentTradingPeriod: krPeriod('2026-10-09'), regularMarketTime: ts('2026-10-09T06:14:00Z') }), 'KR', '2026-10-09T06:15:00Z');
  assert.strictEqual(at1515.bars['2026-10-09'].provisional, true);
  assert.strictEqual(at1515.bars['2026-10-08'].provisional, false);
  const after = norm(chart('Asia/Seoul', bars, { currentTradingPeriod: krPeriod('2026-10-09'), regularMarketTime: ts('2026-10-09T06:30:21Z') }), 'KR', '2026-10-09T07:00:00Z');
  assert.strictEqual(after.bars['2026-10-09'].provisional, false);
  assert.strictEqual(dv.dvPriceAt(after, '2026-10-09', null, 3).state, 'confirmed');
  // 특수 거래일(개장이 평소와 다름)은 그날 안에 확정하지 않는다.
  const special = { regular: { start: ts('2026-10-09T01:00:00Z'), end: ts('2026-10-09T06:00:00Z') } };
  const late = norm(chart('Asia/Seoul', bars, { currentTradingPeriod: special, regularMarketTime: ts('2026-10-09T06:30:21Z') }), 'KR', '2026-10-09T07:00:00Z');
  assert.strictEqual(late.bars['2026-10-09'].provisional, true);
  // 다음 현지 날짜에 받은 응답에서는 과거 봉이라 확정이다.
  const nextDay = norm(chart('Asia/Seoul', bars, { currentTradingPeriod: krPeriod('2026-10-12'), regularMarketTime: ts('2026-10-09T06:30:21Z') }), 'KR', '2026-10-11T01:00:00Z');
  assert.strictEqual(nextDay.bars['2026-10-09'].provisional, false);
  // 종료 시각 정보가 없으면 확정하지 않는다.
  const noMeta = norm(chart('Asia/Seoul', bars, {}), 'KR', '2026-10-09T07:00:00Z');
  assert.strictEqual(noMeta.bars['2026-10-09'].provisional, true);
});

test('4. 미국 오늘 봉: 16:00 ET 이후 체결이 확인되면 확정, 장중이면 잠정 · 환율 오늘 봉은 항상 잠정', () => {
  const bars = [['2026-10-08T13:30:00Z', 100], ['2026-10-09T13:30:00Z', 104]];
  const inSession = norm(chart('America/New_York', bars, { currentTradingPeriod: usPeriod('2026-10-09'), regularMarketTime: ts('2026-10-09T14:29:00Z') }), 'US', '2026-10-09T14:30:00Z');
  assert.strictEqual(dv.dvPriceAt(inSession, '2026-10-09', null, 3).state, 'provisional');
  const closed = norm(chart('America/New_York', bars, { currentTradingPeriod: usPeriod('2026-10-09'), regularMarketTime: ts('2026-10-09T20:00:01Z') }), 'US', '2026-10-09T20:30:00Z');
  assert.strictEqual(dv.dvPriceAt(closed, '2026-10-09', null, 3).state, 'confirmed');
  const fx = norm(chart('Europe/London', [['2026-10-07T23:00:00Z', 1330], ['2026-10-09T14:29:00Z', 1340]]), 'FX', '2026-10-09T14:30:00Z');
  assert.deepStrictEqual([fx.bars['2026-10-08'].provisional, fx.bars['2026-10-09'].provisional], [false, true]);
});

// 월 10-05 봉만 있고 화~금 봉이 없는 종목. 기준지수는 평일 모두 봉이 있다(= 종목만 결측).
function missingWeek() {
  const stock = norm(chart('Asia/Seoul', [['2026-10-05T00:00:00Z', 1000], ['2026-10-12T00:00:00Z', 1100]], { firstTradeDate: ts('2026-01-02T00:00:00Z') }), 'KR', '2026-10-13T08:00:00Z');
  const idx = norm(chart('Asia/Seoul', ['05', '06', '07', '08', '09', '12', '13'].map((d) => [`2026-10-${d}T00:00:00Z`, 1])), 'KR', '2026-10-13T08:00:00Z');
  return { stock, idx };
}

test('5. 평일 결측 K=3: 1~3 거래일은 직전 확정값 추정, 4거래일째부터 계산 불가 · 미래 봉은 쓰지 않는다', () => {
  const { stock, idx } = missingWeek();
  const at = (d) => dv.dvPriceAt(stock, d, idx, dv.DV_K_MISSING_TRADING_DAYS);
  assert.deepStrictEqual(['06', '07', '08'].map((d) => [at(`2026-10-${d}`).state, at(`2026-10-${d}`).value]), [['estimated', 1000], ['estimated', 1000], ['estimated', 1000]]);
  assert.deepStrictEqual([at('2026-10-09').state, at('2026-10-09').value, at('2026-10-09').reason], ['unavailable', null, 'missingLong']);
  assert.strictEqual(at('2026-10-10').value, null, '주말도 결측 연속을 끊지 않는다(4거래일 결측 이후)');
  assert.deepStrictEqual([at('2026-10-12').state, at('2026-10-12').value], ['confirmed', 1100]);
});

test('6. 주말 · 확인된 휴장은 결측으로 세지 않고, 기준지수 조회 실패는 휴장으로 단정하지 않는다', () => {
  const stock = norm(chart('Asia/Seoul', [['2026-10-02T00:00:00Z', 900], ['2026-10-05T00:00:00Z', 1000], ['2026-10-07T00:00:00Z', 1050]]), 'KR', '2026-10-08T08:00:00Z');
  const idxHoliday = norm(chart('Asia/Seoul', [['2026-10-02T00:00:00Z', 1], ['2026-10-05T00:00:00Z', 1], ['2026-10-07T00:00:00Z', 1], ['2026-10-08T00:00:00Z', 1]]), 'KR', '2026-10-08T08:00:00Z');
  assert.deepStrictEqual([dv.dvPriceAt(stock, '2026-10-03', idxHoliday, 3).state, dv.dvPriceAt(stock, '2026-10-04', idxHoliday, 3).value], ['closedCarry', 900]);
  assert.deepStrictEqual([dv.dvPriceAt(stock, '2026-10-06', idxHoliday, 3).state, dv.dvPriceAt(stock, '2026-10-06', idxHoliday, 3).value], ['closedCarry', 1000]);
  assert.strictEqual(dv.dvPriceAt(stock, '2026-10-06', null, 3).state, 'estimated', '기준지수를 모르면 휴장이 아니라 결측');
  assert.strictEqual(dv.dvPriceAt(stock, '2026-10-06', { ok: false, reason: 'fetchFailed' }, 3).state, 'estimated');
});

test('7. 상장 전 · 조회 범위 밖 · 조회 실패 · 시장이 아직 그 날짜에 닿지 않음', () => {
  const s = norm(chart('America/New_York', [['2026-10-07T13:30:00Z', 50], ['2026-10-08T13:30:00Z', 51]], { firstTradeDate: ts('2026-10-07T13:30:00Z') }), 'US', '2026-10-09T01:00:00Z');
  assert.strictEqual(dv.dvPriceAt(s, '2026-10-06', null, 3).reason, 'beforeListing');
  const noListing = norm(chart('America/New_York', [['2026-10-07T13:30:00Z', 50]]), 'US', '2026-10-09T01:00:00Z');
  assert.strictEqual(dv.dvPriceAt(noListing, '2026-10-06', null, 3).reason, 'outOfRange');
  assert.strictEqual(dv.dvPriceAt({ ok: false, reason: 'fetchFailed' }, '2026-10-08', null, 3).reason, 'fetchFailed');
  // 뉴욕 현지로는 아직 10-08 밤이다 - 한국 날짜 10-09 점은 직전 가격으로 잠정.
  assert.deepStrictEqual([dv.dvPriceAt(s, '2026-10-09', null, 3).state, dv.dvPriceAt(s, '2026-10-09', null, 3).value], ['provisional', 51]);
  const fx = norm(chart('Europe/London', [['2026-10-05T23:00:00Z', 1300], ['2026-10-08T23:00:00Z', 1310]]), 'FX', '2026-10-12T08:00:00Z');
  assert.strictEqual(dv.dvPriceAt(fx, '2026-10-07', dv.DV_NO_HOLIDAY_REF, 3).state, 'estimated');
});

test('8. 분할 · 병합 이벤트: 그 날짜 이전은 계산하지 않는다(이벤트 이후 날짜는 영향 없음)', () => {
  const s = norm(chart('America/New_York', [['2026-10-05T13:30:00Z', 100], ['2026-10-08T13:30:00Z', 10]], {}, { x: { date: ts('2026-10-07T13:30:00Z'), numerator: 10, denominator: 1 } }), 'US', '2026-10-09T01:00:00Z');
  assert.deepStrictEqual(s.splits, [{ date: '2026-10-07', numerator: 10, denominator: 1 }]);
  assert.strictEqual(dv.dvCorporateActionAfter(s, '2026-10-06'), '2026-10-07');
  assert.strictEqual(dv.dvCorporateActionAfter(s, '2026-10-07'), null);
});

test('9. 마지막 기록값 유지: 첫 기록 이전 null · 기록된 날 키 없음 0 · 가장 최근 기록 사용 · 스냅샷은 바뀌지 않는다', () => {
  const snaps = {
    '2026-10-05': { byOwnerCategory: { '신랑': { '현금': { cur: 1000 }, '주식': { cur: 999 } } } },
    '2026-10-08': { byOwnerCategory: { '신랑': { '현금': { cur: 900 }, '부동산': { cur: 50 } }, '와이프': {} } },
    '2026-10-09': { total: { cur: 1 } }
  };
  const frozen = JSON.stringify(snaps);
  const dates = Object.keys(snaps).sort();
  const keys = ['현금', '부동산', '채권'];
  assert.deepStrictEqual(dv.dvMaintainedAt(snaps, dates, '2026-10-04', '신랑', keys).reason, 'beforeFirstRecord');
  assert.deepStrictEqual([dv.dvMaintainedAt(snaps, dates, '2026-10-07', '신랑', keys).value, dv.dvMaintainedAt(snaps, dates, '2026-10-07', '신랑', keys).state], [1000, 'maintained']);
  assert.deepStrictEqual([dv.dvMaintainedAt(snaps, dates, '2026-10-08', '신랑', keys).value], [950]);
  assert.deepStrictEqual([dv.dvMaintainedAt(snaps, dates, '2026-10-08', '와이프', keys).value, dv.dvMaintainedAt(snaps, dates, '2026-10-08', '와이프', keys).state], [0, 'confirmed']);
  assert.strictEqual(dv.dvMaintainedAt(snaps, dates, '2026-10-09', '신랑', keys).reason, 'snapshotWithoutCategory');
  assert.strictEqual(JSON.stringify(snaps), frozen);
});

test('10. 계산 불가 전파(U-B): 하나라도 null이면 null · 실제 0은 0 · 상태는 모두 보존', () => {
  assert.deepStrictEqual(dv.dvCombineParts([{ value: 100, state: 'confirmed' }, { value: null, state: 'unavailable', reason: 'noLedger' }]), { value: null, flags: [], reasons: ['noLedger'] });
  assert.deepStrictEqual(dv.dvCombineParts([{ value: 0, state: 'confirmed' }, { value: 0, state: 'confirmed' }]), { value: 0, flags: [], reasons: [] });
  assert.deepStrictEqual(dv.dvCombineParts([{ value: 1, state: 'maintained' }, { value: 2, state: 'provisional', flags: ['estimated', 'provisional'] }, { value: 3, state: 'closedCarry' }]),
    { value: 6, flags: ['provisional', 'estimated', 'maintained', 'closedCarry'], reasons: [] });
  assert.strictEqual(dv.dvWeakerState('confirmed', 'provisional'), 'provisional');
  assert.strictEqual(dv.dvWeakerState('estimated', 'closedCarry'), 'estimated');
});
