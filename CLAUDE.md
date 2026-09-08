# 작업 방식 (Claude Code 전용 지침)

## Git 커밋/Push 워크플로우

작업(코드 변경)을 완료하면, 다음 순서를 따른다:

1. 사용자에게 **커밋 메시지(초안)**와 **변경된 파일 목록**을 먼저 보여주고 커밋 여부를 물어본다.
2. 사용자가 승인하면, 그 승인 한 번으로 **커밋과 origin/master로의 push를 이어서 함께** 진행한다 — push 직전에 별도로 다시 "정말 push할까요?"라고 재확인하지 않는다.
3. 사용자가 거절하거나 수정을 요청하면 커밋하지 않고 반영한다.

**예외 - 아래는 이 지침과 무관하게 항상 사전 확인을 거친다** (파괴적/되돌리기 어려운 작업):
- `git push --force`, `git reset --hard`, `git checkout -- <file>` 등 기존 커밋/작업 내용을 덮어쓰거나 버리는 작업
- 커밋 자체를 되돌리거나(`git revert` 제외 - 이건 새 커밋이라 안전) 히스토리를 다시 쓰는 작업(`git rebase`, `--amend` 등)
- 이 파일에 명시되지 않은 다른 위험 작업(브랜치 삭제 등)

이 지침은 이 저장소(jasan)에서 작업할 때만 적용된다.

## 인계장(CLAUDE_HANDOVER.md) 워크플로우

이 프로젝트는 회사 PC와 개인 PC를 오가며 개발된다. 두 환경의 대화 세션은 서로 이어지지 않으므로,
저장소 루트의 `CLAUDE_HANDOVER.md`(git으로 공유됨)가 세션 간 유일한 연결고리다.

1. **First Read Rule** - 이 저장소에서 작업을 시작하면(대화 첫머리, 코드를 보기 전) 가장 먼저
   `CLAUDE_HANDOVER.md`를 읽고, 이전 세션(다른 PC일 수 있음)에서 완료한 작업·수정된 파일과 로직·
   남은 과제·주의사항을 파악한다.
2. **Handover Note Update Rule** - 이번 세션에서 코드 수정/로직 개편/설정 변경 등 유의미한 작업을
   완료하고 사용자가 커밋을 승인하면, 다음 순서를 반드시 지킨다:
   a. 승인받은 코드 변경을 먼저 커밋 + push한다(위 "Git 커밋/Push 워크플로우" 그대로).
   b. 그 커밋이 끝나면, 별도로 다시 승인을 묻지 않고 곧바로 `CLAUDE_HANDOVER.md`를 이번 세션
      작업 내용으로 갱신하고, 그것도 바로 커밋 + push한다(코드 커밋과 같은 승인 범위 안에 포함됨) -
      다음 세션(다른 PC일 수 있음)이 이 파일 하나만 읽어도 맥락을 100% 파악할 수 있게 하기 위함이다.
   c. 두 커밋이 모두 끝난 뒤에 사용자에게 결과를 보고한다.
   이 순서(코드 커밋 → 인계장 커밋 → 보고)는 이 저장소에서 작업하는 모든 PC/세션에 공통으로
   적용되는 표준 절차다.

---

# PM Governance — Master Policy & Requirements Checklist 연계 (2026-09-08 병합 추가)

> 아래 섹션은 프로젝트 공식 Governance 체계를 이 파일에 병합한 것이다. 위의 두 섹션
> ("Git 커밋/Push 워크플로우", "인계장(CLAUDE_HANDOVER.md) 워크플로우")은 이 병합으로
> 변경되지 않으며, 아래 내용과 우선순위가 겹치는 경우 **"누가 commit/push를 실행할 권한을
> 갖는가"는 위 두 섹션이, "무엇을 구현할지에 대한 PM 승인"은 아래 Governance가 각각 별도로
> 관장한다** (두 체계는 서로 다른 질문에 답하므로 충돌하지 않는다).

## MUST READ FIRST

Before **every** task, review:

`docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md`

This checklist is the project's official governance Source of Truth.

## PM GOVERNANCE — NON-NEGOTIABLE

1. Do not implement anything that conflicts with the checklist.
2. Do not treat your own proposal as an approved requirement.
3. Do not expand scope without PM approval.
4. Preserve resolved items; do not silently remove or reinterpret them.
5. If a new policy or requirement is confirmed by the PM, it must be added to the checklist before or together with implementation.
6. If the checklist changes, the updated checklist must be reported to the PM.
7. Always check the current project phase and OPEN / RESOLVED / BACKLOG status before starting work.
8. When the task creates a model, SoT, security, data-loss, or cross-module decision, stop and request PM decision rather than guessing.
9. This Governance section decides **what may be implemented**. It does not change **who executes `git commit`/`git push` and under what approval** — that remains governed entirely by "Git 커밋/Push 워크플로우" above (this repository's existing rule).

## CURRENT PRIORITY

The current project phase is **V1.2-B**.

Primary scope:
1. BL-17 — category confirmation policy
2. BL-18 — asset/ledger consistency
3. BL-19 — correction-path UX

Do not jump to Bond-domain implementation, Tax MC implementation, Macro redesign, AI, CMA automation, or other backlog/out-of-scope work unless the PM explicitly authorizes it.

## WORKING MODE

For audit/review tasks:
- Prefer READ-ONLY inspection first.
- Do not modify code unless implementation is explicitly requested.
- Report exact files/functions/flows inspected.
- Distinguish facts, inference, risks, and recommendations.
- Do not invent missing requirements.

For implementation tasks:
- Implement only the approved scope.
- Keep the smallest safe change set.
- Reuse existing architecture before introducing new modules.
- Preserve backward compatibility.
- Add/update tests for affected behavior.
- Do not hardcode user-specific asset facts.

## SAFETY / CALCULATION GATES

Stop and ask PM if:
- Source of Truth is unclear.
- A proposed change could cause silent data loss.
- A calculation model/assumption changes.
- A user's input meaning changes.
- Security/privacy exposure is possible.
- Multiple major modules need redesign.
- The task appears to be scope expansion.

## RELEASE GATE

Do not claim release readiness without the applicable checks:
- Unit tests
- E2E tests
- ESLint
- Data Guard
- Release Guard
- Production smoke where applicable
- sensitive-file check
- Service Worker/version marker check
- network/security isolation where applicable

## USER EXPERIENCE

Primary acceptance order:
1. mobile daytime
2. mobile nighttime
3. tablet daytime
4. tablet nighttime
5. desktop

Never solve mobile density by simply shrinking fonts. Prefer collapse, simplification, and progressive disclosure.

## REQUIRED REPORTING FORMAT

At the end of every task, report:

### 1. Scope
What was inspected/changed.

### 2. Findings
Facts with exact file/function references.

### 3. Policy Check
Which checklist items were checked and whether any conflict exists.

### 4. Changes
Files and meaningful changes, if any.

### 5. Tests / Verification
Exact commands and results.

### 6. Risks / Open Issues
Anything unresolved.

### 7. PM Decision Required
Use `NONE` if no decision is required.

### 8. Recommended Next Step
One concrete next action, limited to the approved project scope.

If the task was READ-ONLY, explicitly state:
`NO CODE CHANGES`.

## IMPORTANT DOMAIN REMINDERS

### Tax MC
Tax MC is required to have three distinct scopes:
- General/taxable account MC
- Tax-advantaged account MC
- Combined MC

Combined MC must be derived from the same simulation path/sample; never simply add P50 values.

### Bond domain
Bond work is a separate backlog phase. Do not implement bond-domain changes during V1.2-B unless PM explicitly authorizes them.

### Macro/Risk
Do not create a quantitative Macro→Risk link or redesign Risk Score without PM approval.

### Security
Never place real user asset files, personal financial data, credentials, or secrets in source control.

## FINAL RULE

When uncertain, do not guess.

STOP → explain the uncertainty → show the policy impact → provide minimal options → wait for PM decision.
