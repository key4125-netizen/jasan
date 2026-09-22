// [통합 개선 배치 · 2026-09-22] E-01 · E-02 · MC-01 · B-01 · UX-01 회귀 고정
//
// 무엇을 고정하는가:
//   E-01 시장민감도 기준지수를 사용자가 확정할 수 있고, 그 값이 자동 판정보다 먼저 쓰인다.
//        고를 수 있는 값은 앱이 실제로 지원하는 지수로 제한되며, 그 밖의 값은 조용히 무시된다.
//   E-02 환헤지 여부는 사용자가 고른 값만 쓴다(미선택 = UNRESOLVED · 이름으로 추정하지 않는다).
//        고른 값은 엑셀 · 백업 · 동기화를 왕복해도 살아남는다.
//        MC 자산군 연결은 활성 CMA 세트가 그 자산군을 실제로 연결할 때만 열린다(지금은 닫혀 있다).
//   MC-01 "매년 투자금 증가율"이 아니라 "연도별 추가 투자"가 현금흐름에 들어간다.
//        추가 투자가 없으면 기존 결과와 비트 단위로 같다.
//   B-01 채권 자산등록이 KIS 경로를 쓰고, 응답하지 않는 공공데이터 경로는 남아 있지 않다.
//   UX-01 사용자에게 보이는 "적립금 설정" · "매년 투자금 증가율" 문구가 화면에서 사라졌다.
//
// 실제 보유 종목 · 금액은 쓰지 않는다(ZZ 합성 데이터).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadRiskSandbox } = require('./risk-sandbox.js');
const eng = require('../js/15-monte-carlo-engine.js');
const vm = require('node:vm');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');
// js/25는 js/01~10의 정규화 함수(resolveImportedCategory · sanitize*) 위에서 돈다 - 가짜로 만들지 않고
// 기존 test/sync-diff.test.js와 같은 방식으로 실제 파일을 샌드박스에 올려 쓴다.
const SYNC_SB = (() => {
  const sb = loadAdapterSandbox();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '25-sync-diff.js'), 'utf8'), sb, { filename: '25-sync-diff.js' });
  return sb;
})();
// vm 컨텍스트의 const는 샌드박스 프로퍼티가 되지 않는다(function 선언만 된다) - 필요한 것만 꺼내 온다.
const sync = {
  SYNC_DIFF_ASSET_FIELDS: vm.runInContext('SYNC_DIFF_ASSET_FIELDS', SYNC_SB),
  SYNC_DIFF_FIELD_LABELS: vm.runInContext('SYNC_DIFF_FIELD_LABELS', SYNC_SB),
  compareSyncData: SYNC_SB.compareSyncData
};
const rt = require('../js/27-cma-runtime.js');
const { CMA_ACTIVE_SET } = require('../js/26-cma-data.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

// 합성 ETF - 국내 상장(코스닥) · 원화 표시. 실제 상품이 아니다.
const SYNTH_MASTER = {
  'ZZETF.KQ': { yahooTicker: 'ZZETF.KQ', exchange: 'KOSDAQ', market: 'KR', currency: 'KRW', securityGroup: 'EF' }
};
function riskSandbox() {
  const sb = loadRiskSandbox();
  sb.setTickerMaster(SYNTH_MASTER);
  return sb;
}
const ETF = { ticker: 'ZZETF.KQ', category: 'ETF', name: 'ZZ 합성 ETF' };

/* ══ E-01 ══════════════════════════════════════════════════════════════ */

test('E-01 A. 사용자가 확정한 기준 지수가 자동 판정보다 먼저 쓰인다', () => {
  const sb = riskSandbox();
  // 확정 전: 공식 기초지수가 없는 국내 ETF라 자동으로는 정해지지 않는다(기존 동작).
  const before = plain(sb.resolveMarketRiskBenchmark(ETF));
  assert.strictEqual(before.status, 'UNRESOLVED');

  const after = plain(sb.resolveMarketRiskBenchmark({ ...ETF, marketBetaIndexOverride: 'KOSDAQ' }));
  assert.strictEqual(after.status, 'RESOLVED');
  assert.strictEqual(after.key, 'KOSDAQ');
  assert.strictEqual(after.source, 'userConfirmedIndex');
});

test('E-01 B. 고를 수 있는 값은 앱이 지원하는 지수뿐이고, 그 밖의 값은 자동 판정으로 돌아간다', () => {
  const sb = riskSandbox();
  // 목록에 없는 값을 넣어도 새 지수가 생기지 않는다 - 확정 자체가 없던 것처럼 동작한다.
  const bogus = plain(sb.resolveMarketRiskBenchmark({ ...ETF, marketBetaIndexOverride: 'NIKKEI225' }));
  assert.strictEqual(bogus.status, 'UNRESOLVED');
  assert.notStrictEqual(bogus.source, 'userConfirmedIndex');

  // 엑셀에서 사람이 적을 법한 표기 흔들림은 같은 값으로 받는다(새 지수를 만드는 것이 아니다).
  ['SP500', 's&p 500', 'S&P500', ' sp500 '].forEach((raw) => {
    assert.strictEqual(sb.evalInSandbox(`sanitizeMarketBetaIndexOverride(${JSON.stringify(raw)})`), 'SP500', raw);
  });
  ['', null, undefined, 'NIKKEI', 'KOSPI200'].forEach((raw) => {
    assert.strictEqual(sb.evalInSandbox(`sanitizeMarketBetaIndexOverride(${JSON.stringify(raw) === undefined ? 'undefined' : JSON.stringify(raw)})`), undefined, String(raw));
  });
});

test('E-01 C. 주식 · ETF가 아닌 자산은 확정값이 있어도 시장 베타 대상이 아니다(PD-15 유지)', () => {
  const sb = riskSandbox();
  ['채권', '현금', '부동산'].forEach((category) => {
    const r = plain(sb.resolveMarketRiskBenchmark({ ...ETF, category, marketBetaIndexOverride: 'KOSPI' }));
    assert.strictEqual(r.status, 'UNRESOLVED', category);
    assert.strictEqual(r.source, 'notEquityLike', category);
  });
});

/* ══ E-02 ══════════════════════════════════════════════════════════════ */

test('E-02 A. 환헤지는 고른 값만 쓴다 - 미선택은 UNRESOLVED로 남고 이름으로 추정하지 않는다', () => {
  const sb = riskSandbox();
  const ev = (raw) => sb.evalInSandbox(`sanitizeFxHedgeStatus(${raw === undefined ? 'undefined' : JSON.stringify(raw)})`);
  assert.strictEqual(ev('HEDGED'), 'HEDGED');
  assert.strictEqual(ev('UNHEDGED'), 'UNHEDGED');
  assert.strictEqual(ev('환헤지'), 'HEDGED');
  assert.strictEqual(ev('환노출'), 'UNHEDGED');
  // 미선택 · 알 수 없는 값은 전부 undefined(=UNRESOLVED)다 - 한쪽으로 기울지 않는다.
  ['', null, undefined, 'UNRESOLVED', 'H', '(H)', 'yes'].forEach((raw) => assert.strictEqual(ev(raw), undefined, String(raw)));

  // 이름에 (H)가 있어도 시스템이 채우지 않는다.
  const named = { ...ETF, name: 'ZZ 합성 ETF(H)' };
  assert.strictEqual(sb.evalInSandbox(`sanitizeFxHedgeStatus(${JSON.stringify(named.name)})`), undefined);
});

test('E-02 B. 비동기 쌍은 환헤지 사실이 있어야 열린다 - 사용자가 그 사실을 줄 수 있다', () => {
  const sb = riskSandbox();
  const at = (extra) => plain(sb.resolveMarketRiskBenchmark({ ...ETF, marketBetaIndexOverride: 'SP500', ...extra }));
  // 미선택이면 예전 정책 그대로 막힌다(비헤지로 간주하지 않는다 · D-05).
  assert.strictEqual(at({}).source, 'hedgeUnconfirmed');
  // 환노출을 고르면 기존 H.10 환산 경로가 열린다 - 새 환율 공급자를 쓰지 않는다.
  const unhedged = at({ fxHedgeStatus: 'UNHEDGED' });
  assert.strictEqual(unhedged.status, 'RESOLVED');
  assert.strictEqual(unhedged.alignment, 'ASYNC_DIMSON');
  assert.strictEqual(unhedged.benchmarkFx, 'USD_TO_KRW_H10');
  // 환헤지는 기존 정책 그대로 헤지비용을 몰라 막힌다(이번에 바꾸지 않았다).
  assert.strictEqual(at({ fxHedgeStatus: 'HEDGED' }).source, 'hedgeCostUnavailable');
});

// [기대값 갱신 사유 · PM 결정 1 · A안 · 2026-09-22] 보류였던 환헤지 → MC 연결이 승인됐다.
// 조건은 "동일 provider · 동일 자산군 · 동일 기준의 HEDGED/UNHEDGED pair"이며, 혼합(C안)은 금지다.
// 그래서 US_EQUITY도 함께 J.P. Morgan 원문으로 옮겨 짝을 맞췄다.
test('E-02 C. 환헤지/환노출이 같은 원문 · 같은 통화 기준의 짝으로 연결된다(혼합 금지)', () => {
  const JPM = 'J.P. Morgan Asset Management';
  const map = require(path.join(ROOT, 'data', 'cma', 'app-asset-class-map.json'));
  // 두 자산군 모두 같은 기관을 위험 출처로 지정한다 - 한쪽만 다른 기관이면 환율 효과와 기관 차이가 섞인다.
  ['US_EQUITY', 'US_EQUITY_HEDGED'].forEach((k) => {
    assert.ok(map.appClasses[k], k);
    assert.strictEqual(map.appClasses[k].riskProvider, JPM, k);
    assert.ok(map.appClasses[k].providers[JPM].evidence.length > 50, k + ' 근거');
  });
  assert.strictEqual(map.appClasses.US_EQUITY.providers[JPM].class, 'U.S. Large Cap');
  assert.strictEqual(map.appClasses.US_EQUITY_HEDGED.providers[JPM].class, 'U.S. Large Cap hedged');
  assert.ok(!map.unmapped.US_EQUITY_HEDGED, '연결됐으므로 unmapped에 남아 있으면 안 된다');
  // 국내 · 신흥국은 원문에 환헤지 행이 없어 연결하지 않는다(사유가 기록돼 있어야 한다).
  ['KR_EQUITY_HEDGED', 'EM_EQUITY_HEDGED'].forEach((k) => assert.ok(map.unmapped[k] && map.unmapped[k].length > 20, k));

  // 런타임 값 - 원문 그대로이며 두 행의 차이가 곧 환율 효과다.
  const us = rt.resolveCmaRiskForAppClass('US_EQUITY', CMA_ACTIVE_SET);
  const hedged = rt.resolveCmaRiskForAppClass('US_EQUITY_HEDGED', CMA_ACTIVE_SET);
  assert.strictEqual(us.status, 'MAPPED');
  assert.strictEqual(hedged.status, 'MAPPED');
  assert.strictEqual(us.riskProvider, JPM);
  assert.strictEqual(hedged.riskProvider, JPM);
  assert.strictEqual(us.cmaClass, 'U.S. Large Cap');
  assert.strictEqual(hedged.cmaClass, 'U.S. Large Cap hedged');
  assert.strictEqual(us.volatilityPct, 13.722309014388456);
  assert.strictEqual(hedged.volatilityPct, 16.63977109253169);
  // Benchmark Dataset이므로 여전히 MC 수익률 경로를 열지 않는다(μ는 Return Key 그대로 · §37-5).
  assert.strictEqual(us.returnUsableForMc, false);
  assert.strictEqual(hedged.returnUsableForMc, false);
  // 상관도 같은 원문에서 온다.
  const c = rt.resolveCmaCorrelation('US_EQUITY', 'US_EQUITY_HEDGED', CMA_ACTIVE_SET);
  assert.strictEqual(c.value, 0.7023437621998414);
});

/* ══ E-01 · E-02 저장 · 보존 ════════════════════════════════════════════ */

test('E-01 · E-02 D. 두 확정값이 엑셀 · 백업 · 동기화 어느 경로에서도 사라지지 않는다', () => {
  const js12 = read('js/12-import-export-sync.js');
  // 엑셀: 내보내기 칸 · 가져오기 칸 · 열이 없는 옛 파일 보호 세 가지가 모두 있어야 한다.
  assert.ok(js12.includes("'시장민감도 기준지수(사용자확인)': sanitizeMarketBetaIndexOverride"), '엑셀 내보내기 칸');
  assert.ok(js12.includes("'환헤지(사용자확인)': sanitizeFxHedgeStatus"), '엑셀 내보내기 칸');
  assert.ok(/marketBetaIndexOverride: pick\(row,/.test(js12), '엑셀 가져오기');
  assert.ok(/fxHedgeStatus: pick\(row,/.test(js12), '엑셀 가져오기');
  assert.ok(/IMPORT_CARRY_IF_ABSENT_FIELDS = \[[^\]]*'marketBetaIndexOverride'[^\]]*'fxHedgeStatus'/.test(js12), '옛 엑셀 파일 보호');
  // 백업 복원 · 동기화 수신(normalizeImportedAsset) · 업로드(buildSyncBlob) 세 곳.
  assert.ok(js12.includes('marketBetaIndexOverride: sanitizeMarketBetaIndexOverride(a.marketBetaIndexOverride)'), '복원 정규화');
  assert.ok(js12.includes('fxHedgeStatus: sanitizeFxHedgeStatus(a.fxHedgeStatus)'), '복원 정규화');
  assert.ok(js12.includes('marketBetaIndexOverride: a.marketBetaIndexOverride'), '업로드 payload');
  assert.ok(js12.includes('fxHedgeStatus: a.fxHedgeStatus'), '업로드 payload');
  // 백업/동기화가 projection의 연도별 추가 투자도 정규화해 받는다.
  assert.ok(js12.includes('yearlyExtraContributions: normalizeYearlyExtraContributions(parsed.projection.yearlyExtraContributions)'), 'projection 복원');
});

test('E-01 · E-02 E. 동기화 차이 확인이 두 확정값을 비교 대상으로 본다(조용한 덮어쓰기 금지)', () => {
  assert.ok(sync.SYNC_DIFF_ASSET_FIELDS.includes('marketBetaIndexOverride'));
  assert.ok(sync.SYNC_DIFF_ASSET_FIELDS.includes('fxHedgeStatus'));
  assert.ok(sync.SYNC_DIFF_FIELD_LABELS.marketBetaIndexOverride);
  assert.ok(sync.SYNC_DIFF_FIELD_LABELS.fxHedgeStatus);

  // 값이 다르면 실제로 "차이"로 잡힌다 - 표기만 다른 경우는 차이로 보지 않는다.
  const mk = (over) => ({
    assets: [Object.assign({ id: 'ZZ1', name: 'ZZ', ticker: 'ZZETF.KQ', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1 }, over)],
    transactions: []
  });
  const diff = sync.compareSyncData(mk({ fxHedgeStatus: 'HEDGED' }), mk({ fxHedgeStatus: 'UNHEDGED' }));
  assert.strictEqual(diff.assets.different.length, 1);
  const same = sync.compareSyncData(mk({ fxHedgeStatus: 'HEDGED' }), mk({ fxHedgeStatus: 'hedged' }));
  assert.strictEqual(same.assets.different.length, 0, '같은 뜻의 표기 차이는 차이가 아니다');
});

/* ══ MC-01 ═════════════════════════════════════════════════════════════ */

const MC_BASE = {
  pv0: 0,
  // μ=0 · σ=0 · 보수 0 → 현금흐름만 남아 금액을 정확히 검산할 수 있다(확률모형은 건드리지 않는다).
  instruments: [{ key: 'A', weight: 1, muAnnual: 0, sigmaAnnual: 0, feeRateAnnual: 0 }],
  correlationMatrix: [[1]], monthlyContribution: 1000000, years: 5, iterations: 1, seed: 20260101
};
const mcFinal = (config) => {
  const r = eng.runMonthlyPrecisionMC(config, {});
  return r.finalValue ? r.finalValue.p50 : r.milestones[r.milestones.length - 1].p50;
};

test('MC-01 A · D. 추가 투자가 없거나 0원이면 기존 결과와 완전히 같다', () => {
  const base = mcFinal(MC_BASE);
  assert.strictEqual(base, 1000000 * 12 * 5);
  assert.strictEqual(mcFinal({ ...MC_BASE, extraContributions: [] }), base);
  assert.strictEqual(mcFinal({ ...MC_BASE, extraContributions: [{ monthIndex: 13, amount: 0 }] }), base);
});

test('MC-01 B · C. 지정한 달에 지정한 금액이 그대로 들어간다(여러 해도 각각)', () => {
  const base = mcFinal(MC_BASE);
  assert.strictEqual(mcFinal({ ...MC_BASE, extraContributions: [{ monthIndex: 13, amount: 10000000 }] }) - base, 10000000);
  assert.strictEqual(
    mcFinal({ ...MC_BASE, extraContributions: [{ monthIndex: 13, amount: 10000000 }, { monthIndex: 25, amount: 5000000 }] }) - base,
    15000000
  );
});

test('MC-01 G. 예측 기간 밖 · 잘못된 값은 계산에 들어가지 않는다(엔진이 스스로 버린다)', () => {
  const base = mcFinal(MC_BASE);
  [[{ monthIndex: 999, amount: 10000000 }], [{ monthIndex: 0, amount: 10000000 }],
    [{ monthIndex: -1, amount: 10000000 }], [{ monthIndex: 13, amount: -5000000 }],
    [{ monthIndex: 13, amount: Number.NaN }]].forEach((extra) => {
    assert.strictEqual(mcFinal({ ...MC_BASE, extraContributions: extra }), base, JSON.stringify(extra));
  });
  assert.strictEqual(eng.buildExtraContributionByMonth([], 60), null);
  assert.strictEqual(eng.buildExtraContributionByMonth(null, 60), null);
  assert.strictEqual(eng.computeTotalExtraContributionPrincipal([{ monthIndex: 1, amount: 3 }, { monthIndex: 2, amount: 4 }], 60), 7);
});

test('MC-01 E. 기존 "매년 투자금 증가율"은 입력 · 계산 어디에도 남지 않는다(이중 반영 불가)', () => {
  // 화면 입력칸이 없다.
  // HTML 주석은 사용자에게 보이지 않는다 - "왜 없앴는지"를 적어 둔 주석까지 금지하면 기록이 사라진다.
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!html.includes('contributionGrowthRateInput'), '증가율 입력칸이 남아 있다');
  assert.ok(!html.includes('매년 투자금 증가율'), '증가율 문구가 화면에 남아 있다');
  // 계산 경로가 저장된 값을 읽지 않는다(js/05 결정론 · js/19 MC 양쪽).
  assert.ok(!/num\(state\.projection\.contributionGrowthRate\)/.test(read('js/05-future-projection.js')), 'js/05가 아직 읽는다');
  assert.ok(!/state\.projection\.contributionGrowthRate/.test(read('js/19-monte-carlo-ui.js')), 'js/19가 아직 읽는다');
  assert.ok(!/state\.projection\.contributionGrowthRate/.test(read('js/16-monte-carlo-adapter.js')), 'js/16이 아직 읽는다');
  // 저장 필드 자체는 남는다 - 기존 사용자 데이터를 지우지 않는다(§10-5).
  assert.ok(/contributionGrowthRate: num\(parsed\.contributionGrowthRate\)/.test(read('js/01-core-state.js'))
    || /contributionGrowthRate: \(parsed\.contributionGrowthRate/.test(read('js/01-core-state.js')), '저장된 값을 버리면 안 된다');
});

test('MC-01 F. 연도별 추가 투자 정규화 - 연도 오름차순 · 중복 제거 · 잘못된 항목 배제', () => {
  const sb = riskSandbox();
  const norm = (v) => sb.evalInSandbox(`JSON.stringify(normalizeYearlyExtraContributions(${JSON.stringify(v)}))`);
  assert.strictEqual(norm([{ year: 2029, amount: 3 }, { year: 2027, amount: 1 }]),
    JSON.stringify([{ year: 2027, amount: 1 }, { year: 2029, amount: 3 }]));
  // 같은 해가 두 번이면 마지막 값을 쓴다 - 합산하면 사용자가 보지 못한 금액이 생긴다.
  assert.strictEqual(norm([{ year: 2027, amount: 1 }, { year: 2027, amount: 9 }]), JSON.stringify([{ year: 2027, amount: 9 }]));
  // 모양이 깨진 항목 · 음수 · 범위 밖 연도는 버린다.
  assert.strictEqual(norm([null, {}, { year: 1800, amount: 1 }, { year: 2027, amount: -1 }, 'x']), '[]');
  assert.strictEqual(norm('배열이 아님'), '[]');
});

/* ══ B-01 ══════════════════════════════════════════════════════════════ */

test('B-01. 채권 자산등록이 KIS 경로를 쓰고, 응답하지 않는 공공데이터 경로는 남지 않는다', () => {
  const js07 = read('js/07-table-render-modals.js');
  assert.ok(js07.includes('fetchKisBondInfoRaw('), '거래등록과 같은 KIS 어댑터를 쓴다');
  assert.ok(js07.includes('mapKisBondInfo('), '거래등록과 같은 매핑을 쓴다');
  assert.ok(js07.includes('mergeKisBondInfoIntoPosition('), '사용자 입력 보호 규칙을 재사용한다');
  // 주석("예전에는 공공데이터포털을 썼다")은 기록으로 남긴다 - 실제 호출 경로만 없어야 한다.
  const js07Code = js07.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!js07Code.includes('apis.data.go.kr'), '공공데이터 endpoint 호출이 남아 있다');
  assert.ok(!js07Code.includes('GetBondIssuInfoService'), '공공데이터 경로가 코드에 남아 있다');
  assert.ok(!js07Code.includes('sam_data_go_kr_key'), '공공데이터 인증키 경로가 남아 있다');
  assert.ok(!js07Code.includes('mapBondSourceResponse('), '공공데이터 응답 파서를 아직 호출한다');
  // 조회 실패가 등록을 막지 않는다 - "직접 입력하면 그대로 저장된다"는 안내가 남아 있어야 한다.
  assert.ok(/직접 넣어 주세요 - 그대로 저장됩니다/.test(js07), '수동 입력 대체 경로 안내');
  // 화면 안내도 공공데이터를 말하지 않는다.
  assert.ok(!read('index.html').includes('이 화면의 [조회]는 공공데이터를 씁니다'));
});

/* ══ UX-01 ═════════════════════════════════════════════════════════════ */

test('UX-01. 일반계좌 화면에서 "적립금 설정" 문구가 사라지고 이번 개념에 맞는 이름을 쓴다', () => {
  const html = read('index.html');
  // 사용자에게 보이는 위치(모달 제목 · 버튼 라벨)에 옛 문구가 없다.
  assert.ok(!html.includes('<h3 class="text-sm font-semibold">적립금 설정</h3>'), '모달 제목');
  assert.ok(!/<i data-lucide="split" class="w-3 h-3"><\/i> 적립설정/.test(html), '버튼 라벨');
  assert.ok(html.includes('<h3 class="text-sm font-semibold">투자금 설정</h3>'), '새 제목이 없다');
  // 연도별 추가 투자 편집 UI가 실제로 있다.
  assert.ok(html.includes('id="yearlyExtraContributionList"'));
  assert.ok(html.includes('id="yearlyExtraContributionAddBtn"'));
  assert.ok(html.includes('연도별 추가 투자'));
  // 절세계좌의 "적립설정"은 이번 범위가 아니므로 그대로 둔다(기능 · 개념이 다르다).
  assert.ok(html.includes('🏦 절세계좌 적립계획'), '절세계좌 카드까지 건드리지 않는다');
});

/* ══ PM 결정 1 · 환헤지 → MC fixture ═══════════════════════════════════ */

// 같은 ETF · 같은 수량 · 같은 Return Key · 같은 노출에서 **환헤지 상태만** 바꿨을 때
// MC 입력(σ · 상관)이 정책대로 달라지고 그 밖에는 달라지지 않는지 고정한다.
function hedgeFixtureSandbox() {
  const sb = loadAdapterSandbox();
  sb.evalInSandbox(`
    state.assets = [makeAsset({ name: 'ZZ 미국대표 ETF', ticker: 'ZZUSETF.KS', category: 'ETF', owner: '신랑',
      accountType: '일반계좌', isDomestic: '해외', currency: 'KRW', quantity: 100, buyPrice: 1000000, currentPrice: 1000000 })];
    state.rebalance['신랑'] = { domestic: { '국내': 0, '해외': 100 },
      targets: { '국내': [], '해외': [{ type: 'namedHolding', name: 'ZZ 미국대표 ETF', label: 'ZZ 미국대표 ETF', pct: 100, role: '공격수' }] } };
    state.rebalance['와이프'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [], '해외': [] } };
  `);
  return sb;
}
const mcAppClassFor = (sb, hedge) => JSON.parse(sb.evalInSandbox(`JSON.stringify((function(){
  var a = { ticker: 'ZZUSETF.KS', name: 'ZZ 미국대표 ETF', category: 'ETF', isDomestic: '해외', currency: 'KRW'${hedge ? ", fxHedgeStatus: '" + hedge + "'" : ''} };
  return resolveMcAppAssetClass({ key: 'S&P500', source: 'override', subject: a });
})())`));

test('PM1 A·B·C. 환헤지 상태만 바꾸면 MC 자산군이 환노출 ↔ 환헤지 짝으로 전환된다', () => {
  const sb = hedgeFixtureSandbox();
  // A. UNHEDGED → 환노출 기준
  assert.deepStrictEqual(mcAppClassFor(sb, 'UNHEDGED'), { appClass: 'US_EQUITY', basis: 'returnKey' });
  // B. HEDGED → 환헤지 기준
  assert.deepStrictEqual(mcAppClassFor(sb, 'HEDGED'), { appClass: 'US_EQUITY_HEDGED', basis: 'userHedge' });
  // C. 미선택 → 추정하지 않는다. 환노출로 "간주"하는 것이 아니라 기존 판정(US_EQUITY)이 그대로 쓰인다.
  assert.deepStrictEqual(mcAppClassFor(sb, null), { appClass: 'US_EQUITY', basis: 'returnKey' });
});

test('PM1. 전환으로 달라지는 것은 σ · 상관뿐이고 μ · Risk · Return Key는 그대로다', () => {
  const sb = hedgeFixtureSandbox();
  // μ 경로(Return Key)는 환헤지 여부를 보지 않는다 - 후보 목록이 같아야 한다.
  const keys = (hedge) => sb.evalInSandbox(`JSON.stringify(returnKeyCandidatesForCharacter(${JSON.stringify(hedge)}))`);
  assert.strictEqual(keys('US_EQUITY'), keys('US_EQUITY_HEDGED'));
  // σ · 상관만 짝이 다르다.
  const un = rt.resolveCmaRiskForAppClass('US_EQUITY', CMA_ACTIVE_SET);
  const he = rt.resolveCmaRiskForAppClass('US_EQUITY_HEDGED', CMA_ACTIVE_SET);
  assert.notStrictEqual(un.volatilityPct, he.volatilityPct);
  assert.strictEqual(un.riskProvider, he.riskProvider); // 같은 기관 = 기관 차이가 섞이지 않는다
  // Risk(Market Beta) 경로는 환헤지 여부로 바뀌지 않는다 - 사용자가 지수를 확정한 경우에만 쓰인다.
  const rsb = riskSandbox();
  const base = plain(rsb.resolveMarketRiskBenchmark({ ...ETF, marketBetaIndexOverride: 'KOSDAQ' }));
  const withHedge = plain(rsb.resolveMarketRiskBenchmark({ ...ETF, marketBetaIndexOverride: 'KOSDAQ', fxHedgeStatus: 'HEDGED' }));
  assert.deepStrictEqual(withHedge, base, '같은 시장 쌍에서는 환헤지가 Market Beta를 바꾸지 않는다');
});

test('PM1. 환헤지 전환이 MC 결과를 실제로 바꾸고, 다른 입력은 동일하다', () => {
  // 같은 seed · 같은 μ · 같은 비중 · 같은 보수에서 σ와 상관만 자산군 짝을 따라 바뀐다.
  const un = rt.resolveCmaRiskForAppClass('US_EQUITY', CMA_ACTIVE_SET);
  const he = rt.resolveCmaRiskForAppClass('US_EQUITY_HEDGED', CMA_ACTIVE_SET);
  const corr = (k) => rt.resolveCmaCorrelation(k, 'KR_EQUITY', CMA_ACTIVE_SET).value;
  const cfg = (sigmaPct, rho) => ({
    pv0: 100000000,
    instruments: [
      { key: 'KR', weight: 0.5, muAnnual: 0.07, sigmaAnnual: 29.4 / 100, feeRateAnnual: 0.003 },
      { key: 'US', weight: 0.5, muAnnual: 0.051, sigmaAnnual: sigmaPct / 100, feeRateAnnual: 0.003 }
    ],
    correlationMatrix: [[1, rho], [rho, 1]],
    monthlyContribution: 1000000, years: 20, iterations: 1000, seed: 20260101
  });
  const a = eng.runMonthlyPrecisionMC(cfg(un.volatilityPct, corr('US_EQUITY')), {}).finalValue;
  const b = eng.runMonthlyPrecisionMC(cfg(he.volatilityPct, corr('US_EQUITY_HEDGED')), {}).finalValue;
  assert.notStrictEqual(Math.round(a.p50), Math.round(b.p50), '환헤지 전환이 결과를 바꿔야 한다');
  // 같은 σ · 같은 상관을 주면 두 경로가 완전히 같은 결과를 낸다 = 차이의 원인이 σ · 상관뿐임을 보인다.
  const sameInputs = eng.runMonthlyPrecisionMC(cfg(un.volatilityPct, corr('US_EQUITY')), {}).finalValue;
  assert.deepStrictEqual(sameInputs, a);
});

/* ══ PM 결정 2 · 연도별 추가 투자 → 결정론 fixture ═════════════════════ */

function deterministicSandbox() {
  const sb = loadAdapterSandbox();
  sb.evalInSandbox(`
    state.assets = [makeAsset({ name: 'ZZ국내대표', ticker: 'ZZKP.KS', category: '주식', owner: '신랑',
      accountType: '일반계좌', isDomestic: '국내', currency: 'KRW', quantity: 100, buyPrice: 1000000, currentPrice: 1000000 })];
    state.rebalance['신랑'] = { domestic: { '국내': 100, '해외': 0 },
      targets: { '국내': [{ type: 'namedHolding', name: 'ZZ국내대표', label: 'ZZ국내대표', pct: 100, role: '수비수' }], '해외': [] } };
    state.rebalance['와이프'] = { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [], '해외': [] } };
    state.projection.monthlyContribution = 0;
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 1000000, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
    state.projection.contributionGrowthRate = 0;
    state.projection.yearlyExtraContributions = [];
  `);
  return sb;
}

test('PM2 Case A~F. 연도별 추가 투자가 결정론 시나리오 카드에 반영된다(이중 반영 · 오염 없음)', () => {
  const sb = deterministicSandbox();
  const Y = sb.evalInSandbox('Math.max(...getMilestoneYearOffsets())');
  const nowYear = new Date().getFullYear();
  const setExtra = (arr) => sb.evalInSandbox(`state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions(${JSON.stringify(arr)});`);
  const det = (y) => sb.evalInSandbox(`simulateRebalancedPreset('normal', ${Y}).yearlyPoints[${y === undefined ? Y : y}].total`);

  setExtra([]);
  const A = det();
  assert.ok(A > 0);

  // Case B - 내년 +1,000만원 → 늘어난다.
  setExtra([{ year: nowYear + 1, amount: 10000000 }]);
  const B = det();
  assert.ok(B > A, 'Case B가 반영되지 않았다');
  // 원금 이상으로 불어나 있어야 한다(성장률이 붙는다) - 다만 무한정은 아니다.
  assert.ok(B - A > 10000000, 'Case B 증가분이 원금보다 작다');

  // Case C - 두 해를 넣으면 각각 반영되어 B보다 커진다.
  setExtra([{ year: nowYear + 1, amount: 10000000 }, { year: nowYear + 2, amount: 5000000 }]);
  const C = det();
  assert.ok(C > B, 'Case C가 반영되지 않았다');
  assert.ok(C - B > 5000000, 'Case C 추가분이 원금보다 작다');

  // Case D - 예측 기간 밖 · 지난 해는 결과에 영향이 없다.
  setExtra([{ year: nowYear + 50, amount: 90000000 }]);
  assert.strictEqual(det(), A, 'horizon 밖 금액이 반영됐다');
  setExtra([{ year: nowYear - 1, amount: 90000000 }]);
  assert.strictEqual(det(), A, '지난 해 금액이 반영됐다');

  // Case E - 저장된 옛 증가율은 다시 적용되지 않는다(이중 반영 금지).
  setExtra([]);
  sb.evalInSandbox('state.projection.contributionGrowthRate = 3;');
  assert.strictEqual(det(), A, '옛 증가율이 다시 적용됐다');
  assert.strictEqual(sb.evalInSandbox('state.projection.contributionGrowthRate'), 3, '저장값은 보존돼야 한다');
  sb.evalInSandbox('state.projection.contributionGrowthRate = 0;');

  // Case F - 추가 투자는 **현재 자산**에 더해지지 않는다(y=0 시점 불변).
  const pv0 = det(0);
  setExtra([{ year: nowYear + 1, amount: 10000000 }]);
  assert.strictEqual(det(0), pv0, '추가 투자가 현재 평가금액에 합산됐다');
});

test('PM2. MC와 결정론이 같은 시점 규칙 함수를 공유한다(두 화면이 갈라지지 않는다)', () => {
  const sb = deterministicSandbox();
  // 시점 규칙은 js/05에 하나만 있고 js/19가 그것을 부른다.
  assert.strictEqual(sb.evalInSandbox('typeof yearlyExtraContributionMonthIndex'), 'function');
  const js19 = read('js/19-monte-carlo-ui.js');
  assert.ok(js19.includes('yearlyExtraContributionMonthIndex(it.year)'), 'js/19가 공유 함수를 쓰지 않는다');
  assert.ok(!/12 \* d - month0 \+ 1/.test(js19), 'js/19에 규칙이 중복으로 남아 있다');
  const js05 = read('js/05-future-projection.js');
  assert.ok(js05.includes('const growthMonths = y * 12 - monthIndex + 1;'), '결정론이 같은 monthIndex를 쓰지 않는다');

  // 실제 값도 같은 규칙을 따른다 - 올해는 1번째 달, 내년 1월은 (13 - 이번달)번째 달.
  const nowYear = new Date().getFullYear();
  const month0 = new Date().getMonth() + 1;
  assert.strictEqual(sb.evalInSandbox(`yearlyExtraContributionMonthIndex(${nowYear})`), Math.max(1, 1 - month0 + 1));
  assert.strictEqual(sb.evalInSandbox(`yearlyExtraContributionMonthIndex(${nowYear + 1})`), Math.max(1, 12 - month0 + 1));
  assert.strictEqual(sb.evalInSandbox(`yearlyExtraContributionMonthIndex(${nowYear - 1})`), null);
});

test('PM2. 소유자별 관점에는 가구 단위 추가 투자를 넣지 않는다(임의 배분 금지)', () => {
  const sb = deterministicSandbox();
  const Y = sb.evalInSandbox('Math.max(...getMilestoneYearOffsets())');
  const nowYear = new Date().getFullYear();
  const owner = () => sb.evalInSandbox(`simulateRebalancedPreset('normal', ${Y}, '신랑').yearlyPoints[${Y}].total`);
  const before = owner();
  sb.evalInSandbox(`state.projection.yearlyExtraContributions = normalizeYearlyExtraContributions(${JSON.stringify([{ year: nowYear + 1, amount: 10000000 }])});`);
  assert.strictEqual(owner(), before, '소유자별 관점에 가구 금액이 들어갔다');
});

/* ══ 모델 보호 ═════════════════════════════════════════════════════════ */

test('보호. 이번 작업으로 Risk · MC 모델 상수와 구조가 바뀌지 않았다', () => {
  const sb = riskSandbox();
  // Risk Score 가중치 · 대상 자산군 · 최소 관측 · 커버리지 기준.
  assert.deepStrictEqual(plain(sb.evalInSandbox('RISK_FACTOR_WEIGHTS')),
    { concentration: 0.25, volatility: 0.20, drawdown: 0.20, market: 0.15, correlation: 0.10, technical: 0.10 });
  assert.deepStrictEqual(plain(sb.evalInSandbox('RISK_ELIGIBLE_CATEGORIES')), ['주식', 'ETF']);
  assert.strictEqual(sb.evalInSandbox('MIN_COMMON_RISK_RETURNS'), 120);
  assert.strictEqual(sb.evalInSandbox('BETA_COVERAGE_MIN'), 0.5);
  assert.strictEqual(sb.evalInSandbox('RISK_US_EXPOSURE_MARKET_INDEX'), 'SP500');
  assert.deepStrictEqual(plain(sb.evalInSandbox('RISK_MARKET_INDEX_BY_LISTING_EXCHANGE')), { KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ' });
  // 원장 규모(58행)와 CMA 자산군 목록은 그대로다.
  assert.strictEqual(require('../js/28-exposure-master.js').EXPOSURE_MASTER_ENTRIES.length, 58);
  // [기대값 갱신 사유 · PM 결정 1 · A안] US_EQUITY_HEDGED가 승인돼 자산군 목록에 추가됐다.
  // 그 밖의 자산군 구성은 그대로다(신규 자산군을 더 만들지 않았다).
  assert.deepStrictEqual(Object.keys(CMA_ACTIVE_SET.appClasses), [
    'KR_EQUITY', 'US_EQUITY', 'US_EQUITY_HEDGED', 'EM_EQUITY', 'KR_GOV_BOND', 'KR_CORP_BOND',
    'FOREIGN_GOV_BOND_HEDGED', 'FOREIGN_GOV_BOND_UNHEDGED', 'FOREIGN_CORP_BOND_HEDGED'
  ]);
});

test('보호. MC 엔진은 추가 투자를 넘기지 않으면 예전과 비트 단위로 같은 결과를 낸다', () => {
  const inv = {
    pv0: 100000000,
    instruments: [
      // σ는 앱과 같은 방식으로 만든다(CMA 원문 %값 / 100) - 소수 리터럴을 직접 적으면 자릿수가 잘린다.
      { key: 'K', weight: 0.5, muAnnual: 0.05, sigmaAnnual: 19.362401823368693 / 100, feeRateAnnual: 0.003 },
      { key: 'U', weight: 0.5, muAnnual: 0.07, sigmaAnnual: 13.722309014388456 / 100, feeRateAnnual: 0.001 }
    ],
    correlationMatrix: [[1, 0.4124456921608721], [0.4124456921608721, 1]],
    monthlyContribution: 3000000, years: 20, iterations: 500, seed: 20260101
  };
  const baseline = JSON.stringify(eng.runMonthlyPrecisionMC(inv, {}).finalValue);
  // 빈 배열 · 증가율 0 · 필드 자체 생략 - 셋 다 같은 결과여야 한다(하위호환).
  assert.strictEqual(JSON.stringify(eng.runMonthlyPrecisionMC({ ...inv, extraContributions: [] }, {}).finalValue), baseline);
  assert.strictEqual(JSON.stringify(eng.runMonthlyPrecisionMC({ ...inv, contributionGrowthRate: 0 }, {}).finalValue), baseline);
  // 연 근사 경로도 같은 규약을 지킨다.
  const prev = JSON.stringify(eng.runAnnualPreviewMC(inv, {}).finalValue);
  assert.strictEqual(JSON.stringify(eng.runAnnualPreviewMC({ ...inv, extraContributions: [] }, {}).finalValue), prev);
});
