# v262 Closeout — 릴리스 운영 계획 (P-2 · P-3 · P-4 · P-6 · P-8 · P-9)

> 2026-09-20 작성 · 대상 브랜치 `integration/v262-closeout` · **이 문서 시점에는 버전을 올리지 않았고 배포하지 않았다.**
> 최종 릴리스는 PM 승인 후 단 한 번이며, 그때 sw.js `CACHE_NAME`과 `#appVersionLabel`을 함께 올린다.

---

## 1. 사용자 영향 고지 (P-3)

이번 변경으로 **사용자가 보는 숫자가 실제로 달라진다.** 무엇이 왜 달라지는지 릴리스 노트와 앱 안내에 그대로 적는다.

| 달라지는 것 | 이유 | 방향 |
| --- | --- | --- |
| 몬테카를로 분포(P10 · P50 · P90) | 장기 전망(CMA)을 2026 Q1 → **2026 Q2**(기준일 2026-03-31)로 갱신 | 같은 seed·포트폴리오 기준 P10 −1.97% · P50 +1.52% · P90 +4.77% · **기대수익률(μ)은 그대로** |
| 채권이 있는 포트폴리오의 MC | 채권 변동성을 0으로 두던 정책을 폐지하고 공식 장기가정(J.P. Morgan LTCMA KRW)에 연결 | 국공채 σ 0 → 5.36% · 회사채 0 → 2.54%. 분류 근거가 없는 채권은 **위험 미반영**임을 화면이 밝힌다 |
| 포트폴리오 베타 | "한 종목이라도 베타가 없으면 전체 null"을 폐지하고 **설명 범위(coverage)** 표기로 전환 | 지금까지 비어 있던 베타가 값으로 표시될 수 있다. 시장위험 요인이 위험점수에 다시 참여한다 |
| GOOG의 기준지수 | 본국 발행 지분증권 판정 규칙 v2(명칭이 아니라 증권의 성격 기준) | UNRESOLVED → NASDAQ (해당 종목 1건) |
| 채권 화면 | 채권 정보 입력 · 만기보유 수익률(YTM) · 금리 민감도 · 채권 위험 카드 신설 | 기존 자산 데이터는 변경되지 않는다(마이그레이션 0건) |

**문구 원칙** — "정확해졌다"가 아니라 **"무엇을 근거로 무엇이 바뀌었다"** 로 쓴다. 과거 결과가 틀렸다고 말하지 않고, 기준 데이터가 갱신됐다는 사실을 적는다.

---

## 2. 롤백 계획 (P-4)

**버전 번호는 내리지 않는다.** 롤백은 "이전 상태를 담은 새 버전을 올리는 것"으로 한다.

| 단계 | 조치 | 확인 |
| --- | --- | --- |
| 0. 판단 | 릴리스 후 Production smoke 또는 사용자 신고로 결함 확인 | 어떤 화면 · 어떤 숫자인지 기록 |
| 1. 범위 축소 시도 | 데이터 파일만 되돌려 해결되는지 먼저 본다 — ① CMA: `node scripts/cma-update.js activate --primary AGI-LTCMA-2026Q1-USD --benchmark JPM-LTCMA-2026-KRW` ② 채권 자산군: `data/cma/app-asset-class-map.json`의 채권 5종을 `unmapped`로 이동 ③ 베타: `BETA_COVERAGE_MIN`을 1.01로 두면 사실상 기존 "전부 또는 무" | 셋 다 코드 변경 없이 되돌아간다 |
| 2. 전체 롤백 | `git revert <release-commit>` 로 **새 커밋**을 만들고 버전을 한 단계 **올려** 릴리스(예: v263 → v264가 v262 내용) | 버전 라벨 · `CACHE_NAME`이 함께 올라갔는지 |
| 3. 캐시 전파 | Service Worker는 cache-first다 — `CACHE_NAME`이 바뀌지 않으면 사용자에게 닿지 않는다 | 새 기기 · 기존 기기 각각 확인 |
| 4. 기록 | 종결 대장에 결함 · 원인 · 롤백 사실을 남긴다 | `docs/closeout/issue-ledger.json` |

**되돌리면 안 되는 것** — 사용자 데이터(localStorage · 클라우드 동기화 슬롯)는 롤백 대상이 아니다. 앱 버전을 되돌려도 사용자가 입력한 채권 레코드(`sam_bond_positions_v1`)는 그대로 남으며, 구버전은 그 키를 읽지 않을 뿐 지우지 않는다.

---

## 3. 자동화 복귀 (P-2)

PHASE 0에서 정지시킨 workflow 3종을 프로젝트 종료 후 되돌리고, 건너뛴 갱신을 한 번씩 수동 실행한다.

| workflow | id | 복귀 명령 | 건너뛴 갱신 수동 실행 |
| --- | --- | --- | --- |
| Update USD/KRW (Fed H.10) | 361810246 | `gh workflow enable 361810246` | `gh workflow run 361810246` |
| Update ticker master | 343557860 | `gh workflow enable 343557860` | `gh workflow run 343557860` |
| CMA update check | 359962356 | `gh workflow enable 359962356` | `gh workflow run 359962356` |

- `pages-build-deployment`(320103714)는 정지시키지 않았다 — 최종 릴리스에 필요하다.
- `.github/workflows/*.yml` 파일은 이 프로젝트에서 **무변경**이다(정지는 GitHub 설정 수준이었다).
- 복귀 후 첫 실행 결과(H.10 기준일 · 종목 마스터 건수 · CMA 발견 여부)를 대장 P-2에 기록한다.

---

## 4. 최종 기준선 재생성 (P-9)

1. 릴리스 직전 현재 데이터로 새 기준선을 만든다 — `node scripts/closeout/freeze-baseline.js`(새 디렉터리 `baseline/<새 버전>/`).
2. **`baseline/v262/`는 지우지 않는다.** 이번 프로젝트의 출발점이자, 이후 "무엇이 언제 바뀌었는가"를 말할 수 있는 유일한 고정점이다.
3. 회귀 기준선도 함께 만든다 — `node scripts/closeout/regression-harness.js baseline`.
4. MC 측정 3단계(`docs/closeout/measurements/mc-*.json`)는 계산 근거 기록이므로 그대로 보존한다.

---

## 5. 외부 원천 이용조건 기록 구조 (P-6)

새 외부 원천을 쓰기 전에 **반드시** `docs/closeout/research/source-terms.json`에 아래 항목을 먼저 기록한다. 기록이 없으면 그 원천은 쓰지 않는다.

`sourceId · 제공기관 · 문서 URL · 확인일 · 라이선스 유형(공공누리 유형 등) · 상업적 이용 · 변경(2차 가공) · 재배포 · robots.txt 상태 · 속도 제한 · 인증키 필요 여부 · CORS 실측 결과 · 저장 가능 여부`

**판단 규칙** — ① 문서에 없는 권리는 있다고 보지 않는다 ② robots가 막는 경로는 우회하지 않는다 ③ "변경금지"가 파생 계산에 미치는 범위가 불명확하면 저장하지 않고 화면 표시로만 쓴다.

---

## 6. 자동 조사 실행량 예산 (P-8)

자동 재검증은 대상을 정하지 않으면 종목 마스터 16,731건으로 번진다. 상한을 고정한다.

| 항목 | 상한 | 근거 |
| --- | --- | --- |
| 자동 재검증 대상 | **원장(Exposure Master)에 등록된 종목만**(현재 58건) | 원장 밖 종목은 앱 계산에 쓰이지 않는다 |
| 1회 실행 외부 호출 | 200건 이하 | 공공 API 일일 한도 · 예의 |
| 실행 주기 | 월 1회 | 상품 사실은 분기 단위로 바뀐다 |
| 자동 ACTIVE 전환 | **하지 않는다**(SEC HOME_COMMON 등 규칙이 명시된 경우만 조건부) | 정책을 조용히 바꾸지 않는다 |
| 중단 조건 | 연속 실패 3회 또는 상한 초과 시 즉시 중단하고 기록 | 남용 방지 |

---

## 7. Security Final Gate (릴리스 전 12항목 · CRITICAL/HIGH 잔존 시 STOP)

| # | 항목 | 통과 기준 | 이번 프로젝트 상태 |
| --- | --- | --- | --- |
| 1 | OpenDART 키 | 번들 · 저장소 · 로그에 값 없음 | PASS(이름만 존재) |
| 2 | 공공데이터 서비스키 | 소스 상수로 넣지 않음 · 사용자 키는 브라우저 보관 | PASS(js/07 `sam_data_go_kr_key`만 읽고, 없으면 조회하지 않음) |
| 3 | KIS secret | Worker 환경변수에만 존재 | PASS(코드) / **회전은 EXTERNAL** |
| 4 | Worker 인증 | fail-closed | PASS(테스트 고정) |
| 5 | CORS | 허용 목록 외 차단 | PASS(3개 Worker 모두) |
| 6 | Rate limit | 초과 시 429 | PASS(KIS · 동기화) |
| 7 | 오류 노출 | 상류 본문 미전달 | PASS |
| 8 | localStorage · IndexedDB | 키 · 비밀값 미저장 | PASS(채권 레코드에 키 없음) |
| 9 | 스냅샷 · 내보내기 | 비밀값 미포함 | PASS(Data Guard) |
| 10 | Service Worker · CDN | 캐시에 비밀 응답 미포함 | PASS |
| 11 | source map · debug/test route | 운영 배포에 미포함 | PASS(번들러 없음 · 테스트는 `test/`) |
| 12 | Data Guard | PASS | PASS |

**EXTERNAL ACTION REQUIRED** — 3번(KIS 키 회전)과 Worker 3종 재배포는 Cloudflare 대시보드 작업이다. 절차는 `docs/closeout/research/PM_SOLUTION_CLOSURE.md` §9.
