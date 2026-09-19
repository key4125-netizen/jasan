# PHASE 0 시작점 Snapshot · 통제 기록

> v262 → 전체 미결사항 종결 통합 프로젝트 · 실행 기준문서 `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md` §5 · §6 · §10 · §14
> 기록 시각: 2026-09-20 (UTC 2026-09-19T23:00Z 이후 · 한국시간 오전)

---

## 1. 저장소 시작점 (계획서 §5)

| 항목 | 값 |
| --- | --- |
| 시작 branch | `main` |
| 시작 HEAD | `d4459a7825a16c72705538793bdb8b45f04dbe3e` |
| origin/main | `d4459a7825a16c72705538793bdb8b45f04dbe3e` (fetch로 재확인 · 보고값과 일치) |
| 작업 브랜치 | `integration/v262-closeout` (base `d4459a7`) |
| Production 버전 | v262 |
| Release commit | `b9ff90e` |
| Service Worker | `sw.js` `CACHE_NAME = 'smart-asset-manager-v262'` |
| 버전 표식 | `index.html` `#appVersionLabel` = `v262` |
| GitHub Pages 원본 | `main` 브랜치 `/` (legacy build) — **integration branch push는 배포를 일으키지 않는다**(계획서 §4-5 확인 완료) |
| 작업트리 변경 | `.claude/launch.json`(사용자 로컬) · `CLAUDE.md` · `CLAUDE_HANDOVER.md` · `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md`(신규) |
| `.claude/launch.json` diff 해시 | `216cbb7b12fed0a2…` (시작 = 종료 확인 대상) |

### 코드 · 데이터 기준선과 문서 등록의 분리 (계획서 §4)

`git diff b9ff90e..d4459a7 -- data js sw.js index.html` = **변경 없음**.
즉 릴리스 이후의 커밋은 문서뿐이며, Frozen Baseline은 v262 Production 상태 그대로다.

### 게이트 시작 상태

| 게이트 | 결과 |
| --- | --- |
| Unit (`npm test`) | **566/566 PASS** (17.5s) |
| ESLint (`npm run lint`) | **0건** |
| Data Guard | **PASS** (stage 0건 · 추적 213건) |
| Release Guard | **PASS** (v262 일치 · APP_SHELL 18개 존재 · 변경 없음 · 참고: APP_SHELL 외 js 13개는 런타임 캐싱 → 대장 G-2) |
| E2E (`npx playwright test`) | **1032/1032 PASS** (11.7분 · 포트 8644 로컬 정적 서버) |

---

## 2. 기준문서 무결성 (계획서 §6)

| 항목 | 값 |
| --- | --- |
| 파일 | `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md` |
| 크기 | 34,439 bytes |
| SHA-256 | `10149b77e6a32f127ad96011fa564f20bb3b6a93745b3e700a3eb046ead0c040` |
| 절 구성 | `## 0.` ~ `## 55.` **56개 모두 존재**(누락 · 중복 없음) |
| 비교 대상 | PM이 이 세션에서 전달한 FINAL 원문(대화 입력) |
| 비교 방법 | 절 번호 전수 대조 + 각 절 본문 확인. 원문 파일이 별도로 존재하지 않으므로 파일 대 파일 해시 비교는 불가능하며, **등록본의 해시를 이후 기준값으로 삼는다** |
| 결과 | **일치** — 본문은 원문 그대로이고, 문서 머리말(등록 정보)만 메타데이터로 추가했다 |

> 이후 이 파일이 바뀌면 위 SHA-256과 달라진다. 계획서 본문 변경은 PM 승인 사항이다.

---

## 3. 문서 변경 범위 검증 (계획서 §7)

| 파일 | 변경 | 판정 |
| --- | --- | --- |
| `CLAUDE.md` | CURRENT PRIORITY 맨 앞에 기준문서 포인터 1문단 추가(+2줄) | 기존 정책 · PM Decision · 기존 문단 **변경 없음** |
| `CLAUDE_HANDOVER.md` | 최상단에 기준문서 등록 절 신설(+26줄 / −1줄) | v262 릴리스 기록 **본문 무변경**. 변경된 것은 그 절의 제목 꼬리표뿐(`가장 최신 — 다음 세션은 이 절부터 읽는다` → `직전 릴리스 기록`) — 새 절이 "먼저 읽는 절"이 되었기 때문이며, 릴리스 사실 · 수치 · OPEN 목록은 그대로다 |
| `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md` | 신규 | 위 2절 참조 |

불필요한 변경 · 의미 변경 없음.

---

## 4. Git (계획서 §8)

| 항목 | 값 |
| --- | --- |
| 브랜치 | `integration/v262-closeout` |
| base commit | `d4459a7` |
| 문서 등록 commit | `4ac65bd` (3 files · +1624 / −1) |
| origin push | 완료 (`origin/integration/v262-closeout` = `4ac65bd`) |
| main 변경 | **없음** (`origin/main` = `d4459a7` 그대로) |
| 금지 작업 | force push · reset · rebase · destructive checkout **없음** |
| `.claude/launch.json` | stage · commit **하지 않음**(작업트리 변경 그대로 보존) |

---

## 5. 자동 Workflow 통제 (계획서 §5 · §10)

### 현황 조사 결과

| workflow | 파일 | 일정 (UTC) | 다음 실행 | main 자동 commit | main 자동 push | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| Update USD/KRW (Fed H.10) | `.github/workflows/update-fx-h10.yml` | 매주 화 `0 0 * * 2` | **2026-09-22 00:00** | 있음(`data/fx/usdkrw-h10.json`) | 있음 | **disabled_manually** (2026-09-20 적용) |
| Update ticker master | `.github/workflows/update-ticker-master.yml` | 매월 1일 `0 0 1 * *` | 2026-10-01 00:00 | 있음(`data/ticker-master.json`) | 있음 | **disabled_manually** (2026-09-20 적용) |
| CMA update check | `.github/workflows/cma-update-check.yml` | 매월 3일 `0 1 3 * *` | 2026-10-03 01:00 | 있음(`data/cma/*`) | 있음 | **disabled_manually** (2026-09-20 적용) |
| pages-build-deployment | (GitHub 기본 · `dynamic/pages/pages-build-deployment`) | main push 시 | — | — | — | **active 유지**(최종 릴리스에 필요) |

workflow ID: H.10 `361810246` · 종목마스터 `343557860` · CMA `359962356` · pages `320103714`

> 계획서 §5는 종목마스터 기한을 2026-10-01로 적었지만, **실제로 가장 먼저 도는 것은 H.10(2026-09-22)**이다. 통제 기한은 그쪽이 먼저다.

### 통제 방법과 현재 상태

- 스케줄 workflow는 **기본 브랜치(main)에 있는 정의로 실행된다.** integration branch에서 파일을 고쳐도 스케줄 실행에는 영향이 없다.
- main 직접 커밋은 계획서 §4-10 · §24로 금지돼 있다. 따라서 **저장소 파일 수정으로는 통제할 수 없다.**
- 남은 수단은 GitHub 쪽에서 workflow를 비활성화하는 것이다(영구 삭제가 아니라 일시 중지이며 그대로 되돌릴 수 있다).

```
# 통제(비활성화)
gh workflow disable 361810246   # Update USD/KRW (Fed H.10)
gh workflow disable 343557860   # Update ticker master
gh workflow disable 359962356   # CMA update check

# 프로젝트 종료 후 복귀
gh workflow enable 361810246
gh workflow enable 343557860
gh workflow enable 359962356
gh workflow run 361810246       # 통제 기간 동안 건너뛴 갱신 수동 실행
gh workflow run 343557860
gh workflow run 359962356
```

- **현재 상태: 적용 완료(2026-09-20 · PM 결정).** 3종 모두 `disabled_manually`, `pages-build-deployment`는 `active`.
- 확인 방법 2가지로 재확인했다 — `gh workflow list --all`, 그리고 GitHub Actions API(`repos/key4125-netizen/jasan/actions/workflows`)의 `state` 필드.
- 저장소 파일(`.github/workflows/*.yml`)은 **한 줄도 고치지 않았다.** 비활성화는 저장소 설정 상태이므로 그대로 되돌릴 수 있다(영구 삭제 아님).
- 복구는 종결 대장 **P-2**(프로젝트 종료 후 자동화 복귀 · 건너뛴 갱신 수동 실행)에서 처리한다. 건너뛰게 되는 실행: H.10 2026-09-22부터 매주 화, 종목마스터 2026-10-01, CMA 2026-10-03(이후 매월).
- 참고: 회귀 기준선은 통제와 무관하게 이미 보호돼 있다 — Frozen Baseline이 H.10 · 종목마스터 · CMA 스냅샷과 해시를 별도로 갖고 있다(§6).

---

## 6. v262 Frozen Baseline (계획서 §14)

| 항목 | 값 |
| --- | --- |
| manifest | `baseline/v262/MANIFEST.json` (snapshotVersion `v262-frozen-1`) |
| 고정 파일 수 | 36건 (앱 실행 표면 31건 + 데이터 5건) |
| 사본 | `baseline/v262/data/usdkrw-h10.json` (회귀에서 직접 쓰는 유일한 데이터 파일) |
| H.10 | 148,197 B · `c3c318e394c652e2…` · 관측 2000-01-03 ~ **2026-09-11** · 6,965행 |
| 종목 마스터 | 2,847,857 B · `27d25408ed128db4…` · 생성 2026-09-19 · 16,731건 |
| CMA | `active.json` `4dfbe7e7…` (CMA-2026.1 · AGI-LTCMA-2026Q1-USD + JPM-LTCMA-2026-KRW) · registry · asset-class map |
| 앱 표면 | `sw.js` · `index.html` · `manifest.json` · `js/*.js` 28개 각각 SHA-256 · git blob 기록 |
| 검증 | `node scripts/closeout/freeze-baseline.js --verify` (현재 파일이 기준선과 같은지 확인) |

대용량 파일(종목 마스터)은 중복 저장하지 않고 해시 + git blob id로 동일성을 증명한다 — 원본은 커밋 `b9ff90e`에 불변으로 남아 있다.

---

## 7. 회귀 하네스 (계획서 §16)

`scripts/closeout/regression-harness.js` — 기존 `test/risk-sandbox.js` · `test/mc-adapter-sandbox.js`를 그대로 재사용한다(새 프레임워크 없음 · 네트워크 없음 · 오늘 날짜 의존 없음, 기준일 `2026-09-12` 고정).

| suite | 내용 |
| --- | --- |
| risk | 정책 경로 7종 fixture(국내 개별주 / 국내 ETF / 원천 없음 TR / 국내상장 비헤지 해외 ETF(비동기+환산) / 미국 개별주(D-06) / 미국 ETF(원천 없음) / 혼합)를 실제 엔진에 통과시켜 점수 · 변동성 · VaR · CVaR · MDD · Sortino · 상관 · 포트폴리오 베타 · 요인 점수 · 지표 상태 · 종목별 Benchmark 판정과 베타 진단을 기록 |
| mc | 원장 49건 포트폴리오 · 고정 seed 20260101 · 300회 · MC 입력(자산군 · μ · σ · 상관 · 순서)과 결과 전체 |
| master | Exposure Master 58건 · Index Master 10건 · 원장 전 종목의 자산 성격 / MC 자산군 / 추천 Return Key · 종목 마스터 집계 |

```
node scripts/closeout/regression-harness.js run                # 실행(요약)
node scripts/closeout/regression-harness.js baseline           # 기준선 기록
node scripts/closeout/regression-harness.js compare            # 기준선 대비 차이(종료코드 1 = 차이 있음)
node scripts/closeout/regression-harness.js run --data=current # 현재 운영 데이터로 실행(FROZEN과 분리)
```

기준선 파일: `baseline/v262/regression/{risk,mc,master}.frozen.json` + `risk.current.json`
차이가 나면 `*.diff.json`에 경로별 before / after / 절대차 / 상대차를 남긴다(계획서 §42 measurement log의 입력).

**PHASE 0 시점 기준값(FROZEN · 참고용 요약)**

| 항목 | 값 |
| --- | --- |
| 위험점수 | 45 |
| 변동성 | 14.83527456 % |
| VaR 95 | -1.075213608 % |
| CVaR | -1.211565192 % |
| MDD | -2.662509179 % |
| 가중 평균 상관 | 0.9022471287 |
| 포트폴리오 베타 | null (베타를 못 구하는 종목이 있음) |
| 종목별 판정 | 005930.KS KOSPI/RESOLVED β=1.157894735 · 360750.KS SP500/RESOLVED ASYNC_DIMSON β=-0.001153408318 · SCHD DJ_US_DIV100_PR RESOLVED + 원천 UNAVAILABLE · 278530.KS KOSPI200_TR RESOLVED + 원천 UNAVAILABLE · AAPL UNRESOLVED(D-06) · 237370.KS UNRESOLVED(혼합) · 069500.KS UNRESOLVED |

> 이 수치는 **합성 fixture**의 값이다. 사용자 포트폴리오의 값이 아니며, 정책 · 코드 변경을 감지하기 위한 기준일 뿐이다.

---

## 8. 종결 대장 · 조사표 (계획서 §15 · §17)

| 산출물 | 경로 |
| --- | --- |
| 종결 대장(원본 데이터) | `docs/closeout/issue-ledger.json` |
| 종결 대장(읽기용) | `docs/closeout/ISSUE_LEDGER.md` |
| 데이터 경로 조사 착수표(원본) | `docs/closeout/data-path-survey.json` |
| 조사 착수표(읽기용) | `docs/closeout/DATA_PATH_SURVEY.md` |
| 검증 · 생성기 | `scripts/closeout/ledger.js` (`check` / `render`) |

- 대장 **61건** — OPEN 46 · PM 결정 필요 3 · 확인 완료(COMPLETED/RETAINED) 12.
- 조사 착수표 **16건**(DP-01 ~ DP-16).
- 검증기는 ID 중복 · 필수 항목 · 상태 값 · NOT_AVAILABLE 필수 근거 · 조사표↔대장 참조 · "예비 결과인데 ACTIVE로 승격" 위반을 자동으로 잡는다(계획서 §43의 기초).

---

## 9. 단계(PHASE) 표기 점검 (2026-09-20 · PM 지시)

**확인 결과: 잘못된 참조가 아니다. "PHASE 5"는 실행 기준문서가 정의한 단계다.**

실행 기준문서 `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md` **§50 프로젝트 실행 순서**는 **PHASE 0 ~ PHASE 12, 13개 단계**를 정의한다(본문 1401~1425행).

| 단계 | 정의(§50 원문) |
| --- | --- |
| PHASE 0 | 전체 OPEN 재감사 + integration branch + workflow 통제 + v262 frozen baseline + regression harness + 종결 대장 |
| PHASE 1 | 데이터 경로 전수 조사 + 결정 패키지 |
| PHASE 2 | Master / evidence / automation infrastructure |
| PHASE 3 | US individual stocks + NYSE Composite + ETF + Index + PR/TR + Hedge |
| PHASE 4 | Risk + Stress + Observation period + Beta diagnostics |
| **PHASE 5** | **CMA + MC FX + MC policy** |
| PHASE 6 | Bond + Mixed Product |
| PHASE 7 | Storage + UI + Code hygiene + CDN |
| PHASE 8 | Automatic revalidation |
| PHASE 9 | 전체 regression |
| PHASE 10 | 전체 issue ledger final audit |
| PHASE 11 | SoT / CLAUDE / documentation |
| PHASE 12 | Final Production Release |

- 대장 **C-1(CMA 2026 Q2)** 의 `PHASE 5` 표기는 §50의 "PHASE 5 = CMA + MC FX + MC policy"를 그대로 가리킨 것이다. **수정 대상이 아니며, 계획서 원문도 건드리지 않았다.**
- "PHASE 0~3 체계"는 이 프로젝트 어디에도 없다. 저장소 전체를 검색해도 PHASE 13 이상이나 다른 체계의 표기는 나오지 않는다.
- 대장이 실제로 쓰는 단계: PHASE 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 10 · 12 (모두 §50 정의 안에 있음. 9 · 11은 아직 배정된 항목이 없을 뿐이다).
- 다른 문서(`CLAUDE.md` · `CLAUDE_HANDOVER.md` · 조사표)의 단계 표기도 §50과 일치한다.
- **자동 검사로 고정했다** — `scripts/closeout/ledger.js`가 이제 계획서 §50에서 단계 정의를 직접 읽어, 대장의 모든 항목 단계가 그 안에 있는지 검사한다(없는 단계를 쓰면 검사 실패). 앞으로 단계 표기가 어긋나면 자동으로 잡힌다.

---

## 10. PHASE 0 완료조건 재확인 (2026-09-20 · 최종 게이트)

| 완료조건(계획서 §26) | 결과 |
| --- | --- |
| 시작점 Snapshot | 완료(§1) |
| 기준문서 무결성 | 완료 · SHA-256 `10149b77…` 변동 없음(§2) |
| Git: integration branch + origin push | `integration/v262-closeout` = `2b123b5` → 본 세션 추가 커밋 반영 |
| 문서: 기준문서 등록 변경 보존 | 완료(`4ac65bd`) |
| main 직접 commit/push 없음 | `origin/main` = `d4459a7` 유지 |
| Workflow 통제 | **적용 완료** — 3종 `disabled_manually` · pages `active`(§5) |
| Frozen Baseline + hash | `--verify` 36건 동일 PASS |
| Regression harness | `compare` 차이 0건(risk · mc · master) |
| Issue Ledger 전수 재감사 · 중복 통합 · 재판정 | 61건(§8) |
| Data Path 착수표 | 16건(§8) |
| Security(secret · PII · 이용조건) | 완료(§보고서 10항) |
| Handover 복구 가능 | integration branch + `CLAUDE_HANDOVER.md` 최상단 절 |
| `.claude/launch.json` 시작=종료 해시 | `216cbb7b12fed0a2` 동일 |
| 문서 diff 불필요 변경 없음 | 확인(§3) |

---

## 11. PHASE 0에서 하지 않은 것

- Risk · MC · Bond 정책 변경 없음
- 앱 코드(`js/*.js` · `index.html` · `sw.js`) 변경 없음 — 추가된 것은 `scripts/closeout/*` · `baseline/*` · `docs/closeout/*` 뿐
- 버전 변경 없음(v262 유지) · Production 배포 없음 · main 변경 없음
- 외부 데이터 대량 수집 없음(조사 경로만 정의)
