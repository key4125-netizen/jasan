// CMA 자동 업데이트 CLI (체크리스트 §37)
//
//   node scripts/cma-update.js check [--force] [--source <sourceId>]
//       등록된 공식 Source를 확인한다 → 새 자료가 있으면 Dataset을 VERIFIED(검토 대기)로 저장한다.
//       ACTIVE 세트와 앱 파일(js/26-cma-data.js)은 절대 바꾸지 않는다. GitHub Actions가 매달 실행한다.
//   node scripts/cma-update.js status
//       Dataset 목록 · 상태 · ACTIVE 세트 · 마지막 확인 결과를 보여준다.
//   node scripts/cma-update.js approve <datasetId> --by "<승인자>" --note "<근거>" [--as-of YYYY-MM-DD --as-of-evidence "<원문 위치>"]
//       PM 승인 기록(VERIFIED → APPROVED). 기준일 확인이 필요한 Dataset(DISCOVERED)은 기준일과 원문 근거를 함께 적는다.
//   node scripts/cma-update.js activate --primary <datasetId> [--benchmark <datasetId> ...] --by "<승인자>" --note "<근거>"
//       APPROVED Dataset으로 새 CMA 세트를 만든다(이전 ACTIVE → SUPERSEDED) · js/26-cma-data.js를 다시 만든다.
//       활성화 뒤에는 sw.js · index.html 버전을 올려 릴리스해야 사용자에게 전달된다(과거 MC 결과는 바뀌지 않는다).
//   node scripts/cma-update.js build
//       active.json 기준으로 js/26-cma-data.js만 다시 만든다.
'use strict';

const path = require('node:path');
const pipeline = require('./cma/cma-pipeline.js');
const { createStore } = require('./cma/cma-store.js');

const ROOT = process.env.CMA_ROOT || path.join(__dirname, '..');

function parseArgs(argv) {
  const out = { _: [], benchmark: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'force') { out.force = true; continue; }
    const val = argv[i + 1];
    i += 1;
    if (key === 'benchmark') out.benchmark.push(val);
    else if (key === 'source') (out.source = out.source || []).push(val);
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'check') {
    const { entries, skipped } = await pipeline.runCheck({ root: ROOT, force: !!args.force, sourceIds: args.source });
    entries.forEach((e) => {
      const tail = [e.detectedVersion ? `version=${e.detectedVersion}` : '', e.changedFieldCount ? `changed=${e.changedFieldCount}` : '',
        e.errorCode ? `error=${e.errorCode}: ${e.errorMessage}` : '', e.note || ''].filter(Boolean).join(' ');
      console.log(`[${e.result}] ${e.sourceId} ${tail}`);
    });
    if (skipped.length) console.log(`(확인 주기 전이라 건너뜀: ${skipped.join(', ')})`);
    // 확인 실패도 정상 종료로 둔다 - 실패는 audit-log에 기록되고 ACTIVE 세트는 그대로다(다음 정기 확인에서 다시 시도).
    return;
  }
  if (cmd === 'status') {
    const store = createStore(ROOT);
    const active = store.readActive();
    console.log(`ACTIVE 세트: ${active ? `${active.setVersion} (primary=${active.primaryDatasetId}, benchmark=${(active.benchmarkDatasetIds || []).join(',') || '-'})` : '없음'}`);
    store.listDatasets().forEach((d) => console.log(`- ${d.datasetId}  ${d.version}  ${d.status}  as-of=${d.asOfDate || '미확인'}  role=${d.role}`));
    const reg = store.readRegistry();
    reg.sources.forEach((s) => console.log(`  source ${s.sourceId}: lastChecked=${s.lastCheckedAt || '-'} lastFetch=${s.lastSuccessfulFetchAt || '-'} lastVersion=${s.lastDatasetVersion || '-'}`));
    return;
  }
  if (cmd === 'approve') {
    const ds = pipeline.approveDataset({ root: ROOT, datasetId: args._[1], approvedBy: args.by, note: args.note, asOfDate: args.asOf, asOfEvidence: args.asOfEvidence });
    console.log(`${ds.datasetId} → ${ds.status}`);
    return;
  }
  if (cmd === 'activate') {
    const a = pipeline.activateSet({ root: ROOT, primaryDatasetId: args.primary, benchmarkDatasetIds: args.benchmark, activatedBy: args.by, note: args.note });
    console.log(`ACTIVE 세트 ${a.setVersion} (primary=${a.primaryDatasetId}, benchmark=${a.benchmarkDatasetIds.join(',') || '-'})`);
    console.log(`${pipeline.RUNTIME_FILE}을 다시 만들었습니다 - sw.js · index.html 버전을 올려 릴리스해야 사용자에게 전달됩니다.`);
    return;
  }
  if (cmd === 'build') {
    pipeline.buildRuntime({ root: ROOT });
    console.log(`${pipeline.RUNTIME_FILE} 생성 완료`);
    return;
  }
  console.error('사용법: node scripts/cma-update.js <check|status|approve|activate|build> ...');
  process.exitCode = 2;
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
