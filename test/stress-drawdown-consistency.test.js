// [I-8 · 대장 D-7 · D-9] 스트레스 낙폭 상수와 조사 산출물의 정합성 테스트 - Node 내장 test 러너/assert만 사용.
// 실행: node --test test/stress-drawdown-consistency.test.js
//
// 왜 필요한가:
//   js/09의 스트레스 낙폭 상수 4표(현지통화 2표 · 원화 2표)는 scripts/closeout/research/index-drawdowns.js가
//   지수 일별 종가를 직접 받아 계산한 결과(docs/closeout/research/index-drawdowns.json)를 손으로 옮겨 적은
//   값이다. 두 곳이 따로 관리되는데 둘을 대조하는 장치가 없어서, 조사 결과를 갱신하고 상수를 못 고치거나
//   그 반대인 경우를 아무도 잡지 못했다. 이 테스트가 그 대조를 담당한다.
//
// 무엇을 하지 않는가:
//   계산식 · 상수 값 · 새 지수를 만들지 않는다. **지금 있는 값이 서로 같은지만** 본다.
//   조사 JSON에는 있지만 코드 표에 없는 지수(NYSE Composite 등 - 대장 D-2로 Benchmark가 없는 지수)는
//   "코드에 없어야 정상"이므로 불일치로 보지 않는다.

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadRiskSandbox } = require('./risk-sandbox.js');

const RESEARCH_PATH = path.join(__dirname, '..', 'docs', 'closeout', 'research', 'index-drawdowns.json');
const research = JSON.parse(fs.readFileSync(RESEARCH_PATH, 'utf8'));
const byKey = new Map(research.indexes.map((i) => [i.key, i]));

// 코드 상수는 소수 둘째 자리로 적혀 있고 조사 결과는 넷째 자리까지 있다 - 같은 자리로 맞춰 비교한다.
const round2 = (v) => Math.round(Number(v) * 100) / 100;

const sb = loadRiskSandbox();

// [표 ↔ 조사 경로] 코드의 네 표가 각각 조사 JSON의 어느 값을 옮겨 적은 것인지 한 곳에 적어 둔다.
const TABLES = [
  { name: 'COVID_CRASH_BENCHMARK_DROP_PCT', year: '2020', krw: false },
  { name: 'RATE_HIKE_2022_BENCHMARK_DROP_PCT', year: '2022', krw: false },
  { name: 'COVID_CRASH_BENCHMARK_DROP_PCT_KRW', year: '2020', krw: true },
  { name: 'RATE_HIKE_2022_BENCHMARK_DROP_PCT_KRW', year: '2022', krw: true }
];

function researchValue(indexKey, year, krw) {
  const entry = byKey.get(indexKey);
  if (!entry) return { ok: false, reason: '조사 결과에 이 지수가 없다' };
  const bucket = krw ? (entry.krw && entry.krw.drawdowns) : entry.drawdowns;
  if (!bucket) return { ok: false, reason: krw ? '조사 결과에 원화 환산 값이 없다' : '조사 결과에 낙폭이 없다' };
  const row = bucket[year];
  if (!row || typeof row.drawdownPct !== 'number') return { ok: false, reason: `조사 결과에 ${year} 값이 없다` };
  return { ok: true, value: row.drawdownPct };
}

TABLES.forEach(({ name, year, krw }) => {
  test(`${name} - 모든 값이 조사 결과(index-drawdowns.json ${year}${krw ? ' 원화' : ''})와 같다`, () => {
    const table = sb[name];
    assert.ok(table && typeof table === 'object', `${name}을 샌드박스에서 읽지 못했다(risk-sandbox BRIDGED 확인)`);
    const keys = Object.keys(table);
    assert.ok(keys.length > 0, `${name}이 비어 있다`);
    keys.forEach((indexKey) => {
      const found = researchValue(indexKey, year, krw);
      assert.ok(found.ok, `${name}.${indexKey}: ${found.reason} - 상수를 바꿨다면 조사도 다시 돌려야 한다`);
      assert.strictEqual(
        round2(table[indexKey]), round2(found.value),
        `${name}.${indexKey} 코드 ${table[indexKey]} vs 조사 ${found.value} - 두 곳 중 한쪽만 갱신됐다`
      );
    });
  });
});

test('원화 표는 미국 지수만 담는다 - 국내 지수는 애초에 원화라 환산 대상이 아니다', () => {
  ['COVID_CRASH_BENCHMARK_DROP_PCT_KRW', 'RATE_HIKE_2022_BENCHMARK_DROP_PCT_KRW'].forEach((name) => {
    Object.keys(sb[name]).forEach((indexKey) => {
      assert.ok(!['KOSPI', 'KOSDAQ'].includes(indexKey), `${name}에 국내 지수 ${indexKey}가 들어 있다`);
    });
  });
});

test('현지통화 표와 원화 표의 지수 목록이 서로 어긋나지 않는다', () => {
  [['COVID_CRASH_BENCHMARK_DROP_PCT', 'COVID_CRASH_BENCHMARK_DROP_PCT_KRW'],
    ['RATE_HIKE_2022_BENCHMARK_DROP_PCT', 'RATE_HIKE_2022_BENCHMARK_DROP_PCT_KRW']].forEach(([base, krw]) => {
    Object.keys(sb[krw]).forEach((indexKey) => {
      assert.ok(Object.prototype.hasOwnProperty.call(sb[base], indexKey),
        `${krw}에만 있는 지수 ${indexKey} - 원화 낙폭은 현지통화 낙폭과 짝을 이뤄야 한다`);
    });
  });
});

test('조사 결과의 기준 정의가 바뀌지 않았다(지수 수준값 · 보간 없음)', () => {
  assert.match(research.definition.priceBasis, /지수 수준값/, '가격 기준 정의가 바뀌었다');
  assert.match(research.definition.missing, /보간/, '결측 처리 정의가 바뀌었다');
});
