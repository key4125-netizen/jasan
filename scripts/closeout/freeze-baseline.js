// [전체 미결사항 종결 프로젝트 · PHASE 0 · 계획서 §14] v262 Production Frozen Baseline 생성 · 검증
//
// 왜 필요한가:
//   이 프로젝트는 코드 · 정책 · 데이터를 여러 단계에 걸쳐 바꾼다. 그때 "결과가 달라졌다"의 원인이
//   코드인지 정책인지 데이터인지 구분하려면, 먼저 움직이지 않는 기준선이 있어야 한다.
//   특히 H.10 환율은 매주 자동 갱신되므로(운영 파일이 프로젝트 도중에 바뀐다) 운영 파일을 그대로
//   회귀 기준으로 쓸 수 없다 - 스냅샷을 따로 떠 둔다.
//
// 무엇을 고정하는가:
//   ① 앱 실행 표면(sw.js · index.html · js/*.js) - 해시만 기록한다(원본은 git 커밋에 불변으로 남아 있다).
//   ② 운영 데이터(H.10 · 종목 마스터 · CMA) - 해시를 기록하고, 회귀에 직접 쓰는 H.10은 사본까지 뜬다.
//   ③ 기준 커밋 · 버전 표식 · 생성 시각.
//
// 무엇을 하지 않는가:
//   - 앱 코드/데이터를 고치지 않는다. 읽기만 한다.
//   - 대용량 파일(종목 마스터 2.8MB)을 중복 저장하지 않는다 - 해시 + git blob id로 동일성을 증명한다.
//
// 사용법:
//   node scripts/closeout/freeze-baseline.js          기준선 생성(baseline/v262/MANIFEST.json)
//   node scripts/closeout/freeze-baseline.js --verify 현재 파일이 기준선과 같은지 확인(종료코드 1 = 다름)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const BASE_DIR = path.join(ROOT, 'baseline', 'v262');
const MANIFEST_PATH = path.join(BASE_DIR, 'MANIFEST.json');
const SNAPSHOT_DIR = path.join(BASE_DIR, 'data');

// 회귀에 직접 쓰는 파일만 사본을 뜬다. 나머지는 해시로 동일성을 확인한다.
const SNAPSHOT_COPIES = { 'data/fx/usdkrw-h10.json': 'data/usdkrw-h10.json' };

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function listJsFiles() {
  return fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort().map((f) => `js/${f}`);
}

// 파일 종류별 "데이터 기준일" - 숫자를 만들어내지 않고 파일이 스스로 밝힌 값만 읽는다.
function dataAsOf(rel, buf) {
  if (!rel.startsWith('data/')) return null;
  let json;
  try { json = JSON.parse(buf.toString('utf8')); } catch { return null; }
  if (rel === 'data/fx/usdkrw-h10.json') {
    return { endDate: json.endDate || null, startDate: json.startDate || null, rowCount: json.rowCount ?? null, fetchedAt: json.fetchedAt || null };
  }
  if (rel === 'data/ticker-master.json') {
    const counts = {};
    Object.keys(json).forEach((k) => { const v = json[k]; if (Array.isArray(v)) counts[k] = v.length; });
    return { generatedAt: json.generatedAt || json.updatedAt || null, counts };
  }
  if (rel === 'data/cma/active.json') {
    return { setVersion: json.setVersion || null, primaryDatasetId: json.primaryDatasetId || null, benchmarkDatasetIds: json.benchmarkDatasetIds || null, activatedAt: json.activatedAt || null };
  }
  if (rel.startsWith('data/cma/')) {
    const ids = Array.isArray(json.sources) ? json.sources.map((s) => s && s.id).filter(Boolean) : null;
    return { schemaVersion: json.schemaVersion ?? null, sourceIds: ids, keys: Object.keys(json).length };
  }
  return null;
}

function collect() {
  const rels = ['sw.js', 'index.html', 'manifest.json']
    .concat(listJsFiles())
    .concat(['data/fx/usdkrw-h10.json', 'data/ticker-master.json',
      'data/cma/active.json', 'data/cma/registry.json', 'data/cma/app-asset-class-map.json']);
  return rels.map((rel) => {
    const abs = path.join(ROOT, rel);
    const buf = fs.readFileSync(abs);
    return {
      path: rel,
      role: rel.startsWith('data/') ? 'data' : 'app',
      bytes: buf.length,
      sha256: sha256(buf),
      gitBlob: git(['hash-object', rel]),
      dataAsOf: dataAsOf(rel, buf),
      snapshotCopy: SNAPSHOT_COPIES[rel] || null
    };
  });
}

function appVersion() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cache = /const CACHE_NAME = '([^']+)'/.exec(sw);
  const label = /id="appVersionLabel"[^>]*>([^<]+)</.exec(html);
  return { cacheName: cache ? cache[1] : null, versionLabel: label ? label[1].trim() : null };
}

function build() {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const files = collect();
  files.forEach((f) => {
    if (!f.snapshotCopy) return;
    const dest = path.join(BASE_DIR, f.snapshotCopy);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f.path), dest);
  });
  const manifest = {
    schemaVersion: 1,
    snapshotVersion: 'v262-frozen-1',
    project: 'v262 → 전체 미결사항 종결 통합 프로젝트',
    plan: 'docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md',
    purpose: '코드 · 정책 변경의 효과를 데이터 변화와 분리해 측정하기 위한 고정 기준선(계획서 §14 · §15)',
    createdAt: new Date().toISOString(),
    releaseCommit: git(['rev-list', '-1', 'b9ff90e']),
    baselineCommit: git(['rev-parse', 'HEAD']),
    note: '기준선은 v262 Production 상태다. PHASE 0의 문서 등록 커밋은 앱 코드 · 데이터를 바꾸지 않았다(b9ff90e..HEAD 의 코드 · 데이터 diff 없음).',
    version: appVersion(),
    files
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`✓ 기준선 생성: ${path.relative(ROOT, MANIFEST_PATH)}`);
  console.log(`  파일 ${files.length}건 · 사본 ${files.filter((f) => f.snapshotCopy).length}건`);
  files.filter((f) => f.role === 'data').forEach((f) => {
    console.log(`  ${f.path}  ${f.bytes}B  ${f.sha256.slice(0, 16)}…  ${JSON.stringify(f.dataAsOf)}`);
  });
  console.log(`  version: ${JSON.stringify(manifest.version)}`);
  return manifest;
}

function verify() {
  if (!fs.existsSync(MANIFEST_PATH)) { console.error('✗ MANIFEST.json이 없다 - 먼저 기준선을 생성한다.'); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const now = new Map(collect().map((f) => [f.path, f]));
  let diff = 0;
  manifest.files.forEach((f) => {
    const cur = now.get(f.path);
    if (!cur) { console.log(`✗ MISSING  ${f.path}`); diff++; return; }
    if (cur.sha256 !== f.sha256) { console.log(`✗ CHANGED  ${f.path}  ${f.sha256.slice(0, 12)} → ${cur.sha256.slice(0, 12)}`); diff++; }
  });
  manifest.files.filter((f) => f.snapshotCopy).forEach((f) => {
    const copy = path.join(BASE_DIR, f.snapshotCopy);
    const ok = fs.existsSync(copy) && sha256(fs.readFileSync(copy)) === f.sha256;
    console.log(`${ok ? '✓' : '✗'} 스냅샷 사본 ${f.snapshotCopy}`);
    if (!ok) diff++;
  });
  console.log(diff === 0 ? `✓ 현재 파일 ${manifest.files.length}건이 v262 기준선과 동일하다.` : `✗ 기준선과 다른 항목 ${diff}건.`);
  process.exit(diff === 0 ? 0 : 1);
}

if (process.argv.includes('--verify')) verify(); else build();
