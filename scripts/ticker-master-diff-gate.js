// [I-11 · PM 결정 D-1 · 2026-09-20] 종목 마스터 변경 감시(Diff Gate)
//
// 왜 필요한가:
//   data/ticker-master.json은 매달 자동으로 갱신되어 main에 커밋되고, 앱은 그 파일을 jsDelivr로 받아
//   **Risk Benchmark 판정**에 쓴다(js/09 resolveRiskBenchmark ③ - 상장 거래소 · 종목명). 즉 이 파일이
//   바뀌면 앱 버전을 올리지 않아도 사용자의 베타 · 위험등급 · 스트레스 손실이 달라질 수 있다.
//   기존 방어장치(MIN_SANE_TOTAL_COUNT)는 "파일이 비정상적으로 작은지"만 본다 - 건수가 그대로인 채
//   내용만 뒤집히는 변경은 잡지 못한다. 이 게이트가 그 빈 자리를 채운다.
//
// 무엇을 하는가:
//   기존 마스터 ↔ 새 마스터를 종목 단위로 비교해 신규 · 삭제 · 거래소 변경 · 이름 변경을 세고,
//   PM이 확정한 임계값(아래 THRESHOLDS)에 걸리면 **파일을 교체하지 않고 STOP**한다.
//   정상이면 새 파일을 제자리로 옮겨 커밋되게 한다. 어느 쪽이든 감사 기록을 남긴다.
//
// 무엇을 하지 않는가:
//   - 정상 변경과 공급자 오류를 의미론적으로 추측하지 않는다. 임계값만 본다(PM 결정 D-1 ⑥ · ⑭).
//   - 강제 통과 플래그를 만들지 않는다(D-1 ⑨). STOP은 사람이 확인한 뒤 재실행으로 푼다.
//   - 종목 마스터의 계산 영향 · Risk Benchmark 정책 · Exposure Master를 건드리지 않는다.
//   - 캐시 강제 무효화를 하지 않는다(D-1 ⑬ - 클라이언트 20일 캐시 제약은 그대로 남는다).
//
// 판정 기준(PM 확정 · 임의로 바꾸지 않는다):
//   절대 건수  신규 >= 1000 · 삭제 >= 500 · 거래소 변경 >= 10 · 이름 변경 >= 1000
//   비율       (신규 또는 삭제) >= 5% · 이름 변경 >= 10%   (기준 = 기존 마스터 건수)
//   무조건     국내 KOSPI ↔ KOSDAQ 이동 1건 이상
//   무조건     핵심 종목(Exposure Master 58건)의 Benchmark 판정에 영향을 주는 변경 1건 이상
//   무조건     종목명 변경으로 looksLikeFundName 판정이 뒤집힌 국내 종목 1건 이상
//
// 사용법:
//   node scripts/ticker-master-diff-gate.js --current <기존.json> --next <새.json>
//     [--apply-to <교체 경로>] [--audit <감사 파일>] [--run-url <Actions 실행 URL>]
//   종료 코드 0 = APPLY(정상 · 교체 완료) · 2 = STOP(교체하지 않음) · 1 = 실행 오류

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AUDIT = path.join(ROOT, 'docs', 'closeout', 'ticker-master-audit.json');

/* PM 확정 임계값(D-1 ①②). 이 숫자는 PM 결정이므로 코드에서 조정하지 않는다. */
const THRESHOLDS = Object.freeze({
  addedCount: 1000,
  removedCount: 500,
  exchangeChangedCount: 10,
  nameChangedCount: 1000,
  addedOrRemovedPct: 5,
  nameChangedPct: 10
});

/* 국내 거래소만 Benchmark로 이어진다(js/09 RISK_BENCHMARK_BY_LISTING_EXCHANGE). 미국 거래소 간
 * 이동(NASDAQ ↔ NYSE ↔ AMEX)은 D-06에 따라 어차피 UNRESOLVED라 계산에 영향이 없다 - 세어서 기록만 한다. */
const DOMESTIC_EXCHANGES = ['KOSPI', 'KOSDAQ'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  }
  return out;
}

function readMaster(p) {
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!json || !Array.isArray(json.items)) throw new Error(`items 배열이 없다: ${p}`);
  const byKey = new Map();
  json.items.forEach((it) => { if (it && it.yahooTicker) byKey.set(it.yahooTicker, it); });
  return { json, byKey, count: json.items.length, generatedAt: json.generatedAt || null };
}

/* 앱이 실제로 쓰는 판정 함수를 그대로 빌려 온다 - 키워드 목록이나 정규식을 여기에 복사하면
 * 언젠가 반드시 앱과 어긋난다. test/risk-sandbox.js가 js/01 · js/09를 같은 순서로 올려 준다. */
function loadAppJudgement() {
  const { loadRiskSandbox } = require(path.join(ROOT, 'test', 'risk-sandbox.js'));
  const sb = loadRiskSandbox();
  return {
    looksLikeFundName: sb.evalInSandbox('looksLikeFundName'),
    benchmarkByExchange: sb.RISK_BENCHMARK_BY_LISTING_EXCHANGE
  };
}

function loadCoreTickers() {
  const EM = require(path.join(ROOT, 'js', '28-exposure-master.js'));
  return new Set((EM.EXPOSURE_MASTER_ENTRIES || []).map((e) => e.ticker).filter(Boolean));
}

/* 순수 비교 - 파일 시스템을 건드리지 않는다(테스트가 이 함수만 직접 부른다). */
function computeDiff(current, next, app, coreTickers) {
  const added = [], removed = [], exchangeChanged = [], nameChanged = [];
  const domesticExchangeMoves = [], fundJudgementFlips = [], coreImpacts = [];

  next.byKey.forEach((n, key) => { if (!current.byKey.has(key)) added.push(key); });

  current.byKey.forEach((c, key) => {
    const n = next.byKey.get(key);
    if (!n) { removed.push(key); return; }

    if (c.exchange !== n.exchange) {
      const move = `${key} ${c.exchange}→${n.exchange}`;
      exchangeChanged.push(move);
      // 국내 두 시장 사이의 이동은 Benchmark 키 자체가 바뀐다(KOSPI ↔ KOSDAQ).
      const before = app.benchmarkByExchange[c.exchange] || null;
      const after = app.benchmarkByExchange[n.exchange] || null;
      if (before !== after && (DOMESTIC_EXCHANGES.includes(c.exchange) || DOMESTIC_EXCHANGES.includes(n.exchange))) {
        domesticExchangeMoves.push(`${move} (Benchmark ${before || 'UNRESOLVED'}→${after || 'UNRESOLVED'})`);
      }
    }

    const nameBefore = `${c.nameKr || ''} ${c.nameEn || ''}`;
    const nameAfter = `${n.nameKr || ''} ${n.nameEn || ''}`;
    if (nameBefore !== nameAfter) {
      nameChanged.push(`${key} "${c.nameKr || c.nameEn}"→"${n.nameKr || n.nameEn}"`);
      // js/09 resolveRiskBenchmark는 종목명이 펀드처럼 보이면 개별주 경로를 포기한다(fundLikeName).
      // 그 판정이 뒤집히면 이름만 바뀌어도 Benchmark가 사라지거나 생긴다.
      const isDomestic = DOMESTIC_EXCHANGES.includes(c.exchange) && DOMESTIC_EXCHANGES.includes(n.exchange);
      if (isDomestic && app.looksLikeFundName(nameBefore) !== app.looksLikeFundName(nameAfter)) {
        fundJudgementFlips.push(`${key} "${c.nameKr}"→"${n.nameKr}" (펀드형 판정 ${app.looksLikeFundName(nameBefore)}→${app.looksLikeFundName(nameAfter)})`);
      }
    }
  });

  // 핵심 종목(Exposure Master 58건) - 삭제 · 거래소 변경 · 펀드형 판정 변화만 계산에 닿는다.
  const flipKeys = new Set(fundJudgementFlips.map((s) => s.split(' ')[0]));
  const exchKeys = new Set(exchangeChanged.map((s) => s.split(' ')[0]));
  coreTickers.forEach((t) => {
    if (!current.byKey.has(t)) return; // 애초에 마스터에 없던 핵심 종목은 이번 변경과 무관하다
    if (!next.byKey.has(t)) { coreImpacts.push(`${t} 삭제됨`); return; }
    if (exchKeys.has(t)) coreImpacts.push(`${t} 거래소 변경`);
    if (flipKeys.has(t)) coreImpacts.push(`${t} 펀드형 판정 변화`);
  });

  const base = current.count || 1;
  const domesticNameChanged = nameChanged.filter((s) => {
    const k = s.split(' ')[0];
    const c = current.byKey.get(k), n = next.byKey.get(k);
    return c && n && DOMESTIC_EXCHANGES.includes(c.exchange) && DOMESTIC_EXCHANGES.includes(n.exchange);
  });

  return {
    currentCount: current.count,
    nextCount: next.count,
    addedCount: added.length,
    removedCount: removed.length,
    exchangeChangedCount: exchangeChanged.length,
    nameChangedCount: nameChanged.length,
    domesticNameChangedCount: domesticNameChanged.length,
    domesticExchangeMoveCount: domesticExchangeMoves.length,
    fundJudgementFlipCount: fundJudgementFlips.length,
    coreImpactCount: coreImpacts.length,
    addedPct: Number((added.length / base * 100).toFixed(4)),
    removedPct: Number((removed.length / base * 100).toFixed(4)),
    nameChangedPct: Number((nameChanged.length / base * 100).toFixed(4)),
    samples: {
      added: added.slice(0, 20),
      removed: removed.slice(0, 20),
      exchangeChanged: exchangeChanged.slice(0, 20),
      nameChanged: nameChanged.slice(0, 20),
      domesticExchangeMoves,
      fundJudgementFlips,
      coreImpacts
    }
  };
}

/* 임계값 판정 - 걸린 이유를 전부 모은다(첫 번째에서 멈추지 않는다 · 사람이 한 번에 보게). */
function evaluateThresholds(d) {
  const checks = [
    { id: 'ADDED_COUNT', hit: d.addedCount >= THRESHOLDS.addedCount, detail: `신규 ${d.addedCount} >= ${THRESHOLDS.addedCount}` },
    { id: 'REMOVED_COUNT', hit: d.removedCount >= THRESHOLDS.removedCount, detail: `삭제 ${d.removedCount} >= ${THRESHOLDS.removedCount}` },
    { id: 'EXCHANGE_COUNT', hit: d.exchangeChangedCount >= THRESHOLDS.exchangeChangedCount, detail: `거래소 변경 ${d.exchangeChangedCount} >= ${THRESHOLDS.exchangeChangedCount}` },
    { id: 'NAME_COUNT', hit: d.nameChangedCount >= THRESHOLDS.nameChangedCount, detail: `이름 변경 ${d.nameChangedCount} >= ${THRESHOLDS.nameChangedCount}` },
    { id: 'ADDED_PCT', hit: d.addedPct >= THRESHOLDS.addedOrRemovedPct, detail: `신규 ${d.addedPct}% >= ${THRESHOLDS.addedOrRemovedPct}%` },
    { id: 'REMOVED_PCT', hit: d.removedPct >= THRESHOLDS.addedOrRemovedPct, detail: `삭제 ${d.removedPct}% >= ${THRESHOLDS.addedOrRemovedPct}%` },
    { id: 'NAME_PCT', hit: d.nameChangedPct >= THRESHOLDS.nameChangedPct, detail: `이름 변경 ${d.nameChangedPct}% >= ${THRESHOLDS.nameChangedPct}%` },
    { id: 'DOMESTIC_EXCHANGE_MOVE', hit: d.domesticExchangeMoveCount > 0, detail: `국내 시장 이동 ${d.domesticExchangeMoveCount}건(1건이라도 STOP)` },
    { id: 'CORE_IMPACT', hit: d.coreImpactCount > 0, detail: `핵심 종목 영향 ${d.coreImpactCount}건(1건이라도 STOP)` },
    { id: 'FUND_JUDGEMENT_FLIP', hit: d.fundJudgementFlipCount > 0, detail: `펀드형 판정 변화 ${d.fundJudgementFlipCount}건(1건이라도 STOP)` }
  ];
  const triggered = checks.filter((c) => c.hit);
  return { checks, triggered, decision: triggered.length > 0 ? 'STOP' : 'APPLY' };
}

function appendAudit(auditPath, record) {
  let doc = { schemaVersion: 1, description: '종목 마스터 Diff Gate 실행 기록(PM 결정 D-1). 최신 항목이 배열 끝에 붙는다.', entries: [] };
  if (fs.existsSync(auditPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      if (prev && Array.isArray(prev.entries)) doc = prev;
    } catch { /* 손상된 기록은 덮어쓰지 않고 새로 시작한다 - 아래 write가 남긴다 */ }
  }
  doc.entries.push(record);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentPath = args.current || path.join(ROOT, 'data', 'ticker-master.json');
  const nextPath = args.next;
  if (!nextPath) throw new Error('--next <새 마스터 경로>가 필요하다');
  const applyTo = args['apply-to'] || currentPath;
  const auditPath = args.audit || DEFAULT_AUDIT;

  const next = readMaster(nextPath);

  // 기존 마스터가 없으면 비교할 대상이 없다 - 최초 생성으로 보고 그대로 적용한다(기존 동작 유지).
  if (!fs.existsSync(currentPath)) {
    fs.mkdirSync(path.dirname(applyTo), { recursive: true });
    fs.copyFileSync(nextPath, applyTo);
    console.log('[APPLY] 기존 마스터가 없어 최초 생성으로 적용했다.');
    return 0;
  }

  const current = readMaster(currentPath);
  const app = loadAppJudgement();
  const coreTickers = loadCoreTickers();
  const diff = computeDiff(current, next, app, coreTickers);
  const verdict = evaluateThresholds(diff);

  // 감사 ID - 대장 · 커밋 메시지와 연결하는 열쇠다(D-1 ⑫). 같은 초에 두 번 돌아도 겹치지 않도록
  // 새 마스터의 생성 시각 · 건수에서 뽑은 짧은 지문을 뒤에 붙인다.
  const fingerprint = require('node:crypto')
    .createHash('sha256').update(`${next.generatedAt}|${next.count}|${diff.addedCount}|${diff.removedCount}|${diff.nameChangedCount}`)
    .digest('hex').slice(0, 6);
  const auditId = `TMG-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')}-${fingerprint}`;
  const record = {
    auditId,
    ranAt: new Date().toISOString(),
    runUrl: typeof args['run-url'] === 'string' ? args['run-url'] : null,
    current: { generatedAt: current.generatedAt, count: current.count },
    next: { generatedAt: next.generatedAt, count: next.count },
    coreTickerCount: coreTickers.size,
    thresholds: THRESHOLDS,
    diff: {
      added: diff.addedCount, removed: diff.removedCount,
      exchangeChanged: diff.exchangeChangedCount, nameChanged: diff.nameChangedCount,
      domesticNameChanged: diff.domesticNameChangedCount,
      domesticExchangeMoves: diff.domesticExchangeMoveCount,
      fundJudgementFlips: diff.fundJudgementFlipCount,
      coreImpacts: diff.coreImpactCount,
      addedPct: diff.addedPct, removedPct: diff.removedPct, nameChangedPct: diff.nameChangedPct
    },
    thresholdResults: verdict.checks.map((c) => ({ id: c.id, hit: c.hit, detail: c.detail })),
    decision: verdict.decision,
    triggered: verdict.triggered.map((c) => c.id),
    samples: diff.samples
  };

  console.log(`[Diff Gate] ${current.count} → ${next.count}건 · 신규 ${diff.addedCount} · 삭제 ${diff.removedCount} · 거래소 ${diff.exchangeChangedCount} · 이름 ${diff.nameChangedCount}`);
  console.log(`            국내 시장 이동 ${diff.domesticExchangeMoveCount} · 펀드형 판정 변화 ${diff.fundJudgementFlipCount} · 핵심 종목 영향 ${diff.coreImpactCount}`);

  if (verdict.decision === 'APPLY') {
    fs.copyFileSync(nextPath, applyTo);
    record.applied = true;
    appendAudit(auditPath, record);
    console.log(`[APPLY] 임계값에 걸린 항목이 없어 적용했다. auditId=${auditId}`);
    return 0;
  }

  record.applied = false;
  appendAudit(auditPath, record);
  console.error(`[STOP] 임계값에 걸렸다 - 마스터를 교체하지 않았다. auditId=${auditId}`);
  verdict.triggered.forEach((c) => console.error(`  · ${c.id}: ${c.detail}`));
  console.error('  사람이 감사 기록을 확인한 뒤 원인이 해소되면 workflow_dispatch로 다시 실행한다(강제 통과 플래그는 없다).');
  return 2;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (e) {
    console.error('[치명적 오류]', e && e.message ? e.message : e);
    process.exit(1);
  }
}

module.exports = { THRESHOLDS, computeDiff, evaluateThresholds, readMaster };
