// [전체 미결사항 종결 프로젝트 · PHASE 0 · 계획서 §15 · §17 · §43] 종결 대장 · 데이터 경로 조사표
// 검증기 겸 문서 생성기.
//
// 왜 JSON을 원본으로 두는가:
//   계획서 §43은 최종 감사 전에 "Issue ID ↔ SoT ↔ 구현 ↔ 테스트 ↔ 근거 ↔ 최종 상태"가 서로 맞는지
//   자동으로 검사하라고 요구한다. 사람이 읽는 표만 있으면 그 검사를 할 수 없다. 그래서 사실은
//   docs/closeout/*.json에 두고, 사람이 읽는 .md는 여기서 생성한다(손으로 고치지 않는다).
//
// 사용법:
//   node scripts/closeout/ledger.js check     검증만(문제가 있으면 종료코드 1)
//   node scripts/closeout/ledger.js render    검증 + docs/closeout/*.md 생성

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'docs', 'closeout');
const LEDGER_JSON = path.join(DIR, 'issue-ledger.json');
const SURVEY_JSON = path.join(DIR, 'data-path-survey.json');
const LEDGER_MD = path.join(DIR, 'ISSUE_LEDGER.md');
const SURVEY_MD = path.join(DIR, 'DATA_PATH_SURVEY.md');

// [PM EXECUTION DIRECTIVE 2026-09-20 §8] 종결 어휘 확장.
// 모든 항목은 아래 종결 판정 중 하나로 끝나야 한다 - "추후 검토 · 백로그 · 추가 조사 필요"는 종결이 아니다.
// 옛 값(COMPLETED · RETAINED 등)은 기록으로 남아 있으므로 함께 허용한다.
const CLOSURE = ['SOLVED', 'SOLVED_WITH_CONSTRAINT', 'EXTERNAL_ACTION_REQUIRED', 'NOT_AVAILABLE', 'PM_DECISION_REQUIRED'];
const INTERIM = ['OPEN', 'COMPLETED', 'RETAINED', 'NOT_AVAILABLE_CANDIDATE'].concat(CLOSURE);
const FINAL = ['COMPLETED', 'RETAINED', 'PM_DECISION_RESOLVED'].concat(CLOSURE);
// NOT_AVAILABLE을 최종 상태로 쓰려면 계획서 §51이 요구하는 근거가 모두 있어야 한다.
const NOT_AVAILABLE_REQUIRED = ['investigationPaths', 'terms', 'quality', 'alternatives', 'evidence', 'resumeCondition'];

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// 단계 표기는 실행 기준문서 §50이 정의한 것만 쓴다(PHASE 0 ~ PHASE 12). 대장 · 문서가 서로 다른
// 단계 체계를 쓰기 시작하면 추적이 깨지므로, 계획서 본문에서 직접 읽어 대조한다.
function planPhases() {
  const planPath = path.join(ROOT, 'docs', 'PROJECT_V262_CLOSEOUT_FINAL_PLAN.md');
  const src = fs.readFileSync(planPath, 'utf8');
  const found = new Map();
  const re = /^\*\*PHASE (\d+)\*\*\s*(.*)$/gm;
  let m;
  while ((m = re.exec(src)) !== null) found.set(`PHASE ${m[1]}`, m[2].trim());
  return found;
}

function check() {
  const problems = [];
  const ledger = read(LEDGER_JSON);
  const survey = read(SURVEY_JSON);
  const ids = new Set();
  const phases = planPhases();
  if (phases.size === 0) problems.push('실행 기준문서 §50에서 단계 정의를 읽지 못했다');

  ledger.items.forEach((it, i) => {
    const where = it.id || `#${i}`;
    if (!it.id) problems.push(`${where}: id 없음`);
    if (ids.has(it.id)) problems.push(`${where}: 중복 ID`);
    ids.add(it.id);
    ['title', 'category', 'phase', 'currentStatus', 'sot', 'currentImpl'].forEach((k) => {
      if (!it[k]) problems.push(`${where}: 필수 항목 누락(${k})`);
    });
    if (it.phase && phases.size > 0 && !phases.has(it.phase)) problems.push(`${where}: 계획서 §50에 없는 단계(${it.phase})`);
    if (it.currentStatus && !INTERIM.includes(it.currentStatus)) problems.push(`${where}: 현재 판정 값이 규칙 밖(${it.currentStatus})`);
    if (it.finalStatus && !FINAL.includes(it.finalStatus)) problems.push(`${where}: 최종 상태 값이 규칙 밖(${it.finalStatus})`);
    if (it.finalStatus && !it.verification && !it.evidence) problems.push(`${where}: 최종 상태를 적었으면 검증 · 근거가 있어야 한다`);
    if (it.finalStatus === 'NOT_AVAILABLE') {
      NOT_AVAILABLE_REQUIRED.forEach((k) => { if (!it[k]) problems.push(`${where}: NOT_AVAILABLE 필수 근거 누락(${k})`); });
    }
    if (it.currentStatus === 'OPEN' && it.finalStatus) problems.push(`${where}: OPEN인데 최종 상태가 채워져 있다`);
  });

  survey.targets.forEach((t, i) => {
    const where = t.id || `#${i}`;
    if (!Array.isArray(t.issueIds) || t.issueIds.length === 0) problems.push(`${where}: 연결된 미결 ID 없음`);
    (t.issueIds || []).forEach((id) => { if (!ids.has(id)) problems.push(`${where}: 대장에 없는 미결 ID 참조(${id})`); });
    if (!survey.stateEnum.includes(t.state)) problems.push(`${where}: 상태 값이 규칙 밖(${t.state})`);
    if (t.preliminary && t.state === 'ACTIVE') problems.push(`${where}: 예비 결과가 있는데 ACTIVE로 승격돼 있다(§18 위반)`);
  });

  // 최종 종료 조건(계획서 §53) - 프로젝트 종료 시에만 0이어야 한다. 지금은 남은 수를 보고만 한다.
  const open = ledger.items.filter((it) => it.currentStatus === 'OPEN').length;
  const pm = ledger.items.filter((it) => it.currentStatus === 'PM_DECISION_REQUIRED').length;
  const done = ledger.items.filter((it) => ['COMPLETED', 'RETAINED'].includes(it.currentStatus)).length;

  const usedPhases = [...new Set(ledger.items.map((it) => it.phase))]
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  problems.forEach((p) => console.log(`✗ ${p}`));
  console.log(problems.length === 0 ? '✓ 대장 · 조사표 정합성 검사 통과' : `✗ 문제 ${problems.length}건`);
  console.log(`  단계 정의(계획서 §50) ${phases.size}개 · 대장이 쓰는 단계: ${usedPhases.join(', ')}`);
  console.log(`  항목 ${ledger.items.length}건 - OPEN ${open} · PM 결정 필요 ${pm} · 확인 완료 ${done} · 조사 대상 ${survey.targets.length}건`);
  return problems.length;
}

function mdEscape(v) { return String(v === undefined || v === null ? '-' : v).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
const list = (v) => (Array.isArray(v) && v.length ? v.join(' · ') : '-');

function renderLedger() {
  const l = read(LEDGER_JSON);
  const byCategory = new Map();
  l.items.forEach((it) => { if (!byCategory.has(it.category)) byCategory.set(it.category, []); byCategory.get(it.category).push(it); });

  const out = [];
  out.push(`# ${l.title}`, '');
  out.push('> **이 파일은 `docs/closeout/issue-ledger.json`에서 생성된다. 직접 고치지 않는다**(`node scripts/closeout/ledger.js render`).', '');
  out.push(`- 실행 기준문서: \`${l.plan}\``);
  out.push(`- 정책 원문 SoT: \`${l.sot}\``);
  out.push(`- 기준선: ${l.baseline.version} (release \`${l.baseline.releaseCommit}\` · 시작 main \`${l.baseline.mainAtStart}\` · 작업 브랜치 \`${l.baseline.integrationBranch}\`)`);
  out.push(`- 판: ${l.edition}`, '');
  out.push(`> ${l.note}`, '');

  const count = (s) => l.items.filter((it) => it.currentStatus === s).length;
  out.push('## 현황', '');
  out.push('| 현재 판정 | 건수 |', '| --- | ---: |');
  INTERIM.forEach((s) => out.push(`| ${s} | ${count(s)} |`));
  out.push(`| **합계** | **${l.items.length}** |`, '');

  out.push('## 전체 목록', '');
  out.push('| ID | 항목 | 분류 | 단계 | 현재 판정 | 최종 상태 |', '| --- | --- | --- | --- | --- | --- |');
  l.items.forEach((it) => out.push(`| ${it.id} | ${mdEscape(it.title)} | ${mdEscape(it.category)} | ${mdEscape(it.phase)} | ${it.currentStatus} | ${it.finalStatus || '-'} |`));
  out.push('');

  out.push('## 항목 상세', '');
  [...byCategory.entries()].forEach(([cat, items]) => {
    out.push(`### ${cat}`, '');
    items.forEach((it) => {
      out.push(`#### ${it.id} — ${it.title}`, '');
      out.push(`- **현재 판정**: ${it.currentStatus}${it.finalStatus ? ` → **최종 ${it.finalStatus}**` : ''} · **단계**: ${it.phase}`);
      out.push(`- **SoT**: ${mdEscape(it.sot)}`);
      out.push(`- **현재 구현**: ${mdEscape(it.currentImpl)}`);
      if (it.problem) out.push(`- **문제**: ${mdEscape(it.problem)}`);
      if (it.neededFact) out.push(`- **필요한 사실**: ${mdEscape(it.neededFact)}`);
      if (it.investigationPaths) out.push(`- **조사 경로**: ${list(it.investigationPaths)}`);
      if (it.preliminary) out.push(`- **예비 결과(사실 아님)**: ${mdEscape(it.preliminary)}`);
      if (it.subItems) out.push(`- **세부 항목**: ${list(it.subItems)}`);
      if (it.options) out.push(`- **선택지**: ${list(it.options)}`);
      if (it.alternatives) out.push(`- **대체 경로**: ${list(it.alternatives)}`);
      if (it.impact) out.push(`- **영향**: 정책 ${mdEscape(it.impact.policy)} / Risk ${mdEscape(it.impact.risk)} / MC ${mdEscape(it.impact.mc)} / UI ${mdEscape(it.impact.ui)}`);
      if (it.implementationNeeded) out.push(`- **구현 필요**: ${mdEscape(it.implementationNeeded)}`);
      if (it.test) out.push(`- **테스트**: ${mdEscape(it.test)}`);
      if (it.verification) out.push(`- **검증**: ${mdEscape(it.verification)}`);
      if (it.evidence) out.push(`- **근거**: ${mdEscape(it.evidence)}`);
      if (it.ruleVersion) out.push(`- **ruleVersion**: ${mdEscape(it.ruleVersion)}`);
      if (it.resumeCondition) out.push(`- **재개 조건**: ${mdEscape(it.resumeCondition)}`);
      out.push(`- **마지막 확인일**: ${it.lastCheckedAt}`, '');
    });
  });
  fs.writeFileSync(LEDGER_MD, `${out.join('\n')}\n`, 'utf8');
  console.log(`✓ 생성: ${path.relative(ROOT, LEDGER_MD)}`);
}

function renderSurvey() {
  const s = read(SURVEY_JSON);
  const out = [];
  out.push(`# ${s.title}`, '');
  out.push('> **이 파일은 `docs/closeout/data-path-survey.json`에서 생성된다. 직접 고치지 않는다.**', '');
  out.push(`> ${s.rule}`, '');
  out.push(`> ${s.phase0Note}`, '');
  out.push('| ID | 미결 | 필요 데이터 | 현재 원천 | 공식 원천 후보 | 우선순위 | 상태 |', '| --- | --- | --- | --- | --- | ---: | --- |');
  s.targets.forEach((t) => out.push(`| ${t.id} | ${list(t.issueIds)} | ${mdEscape(t.neededData)} | ${mdEscape(t.currentSource)} | ${mdEscape(t.officialSource)} | ${t.priority} | ${t.state} |`));
  out.push('', '## 상세', '');
  s.targets.forEach((t) => {
    out.push(`### ${t.id} — ${mdEscape(t.neededData)}`, '');
    out.push(`- **연결 미결**: ${list(t.issueIds)} · **우선순위**: ${t.priority} · **상태**: ${t.state}`);
    out.push(`- **현재 원천**: ${mdEscape(t.currentSource)}`);
    out.push(`- **후보 원천**: ${list(t.candidateSources)}`);
    out.push(`- **공식 원천**: ${mdEscape(t.officialSource)}`);
    out.push(`- **실제 접근 확인**: ${t.accessVerified ? '확인됨' : '미확인'}`);
    if (t.preliminary) out.push(`- **예비 결과(사실 아님 · 재검증 대상)**: ${mdEscape(t.preliminary)}`);
    out.push(`- **정의 일치**: ${mdEscape(t.definitionMatch)}`);
    out.push(`- **이용조건**: ${mdEscape(t.terms)}`);
    out.push(`- **품질**: ${mdEscape(t.quality)}`);
    out.push(`- **대체 경로**: ${list(t.alternatives)}`);
    out.push(`- **직접 계산 가능**: ${t.directComputable ? '가능' : '불가/미확인'}`);
    out.push(`- **다음 행동**: ${mdEscape(t.nextAction)}`, '');
  });
  fs.writeFileSync(SURVEY_MD, `${out.join('\n')}\n`, 'utf8');
  console.log(`✓ 생성: ${path.relative(ROOT, SURVEY_MD)}`);
}

const cmd = process.argv[2] || 'check';
const problems = check();
if (cmd === 'render') { renderLedger(); renderSurvey(); }
process.exit(problems === 0 ? 0 : 1);
