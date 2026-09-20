# v262 → 전체 미결사항 종결 프로젝트 · 종결 대장

> **이 파일은 `docs/closeout/issue-ledger.json`에서 생성된다. 직접 고치지 않는다**(`node scripts/closeout/ledger.js render`).

- 실행 기준문서: `docs/PROJECT_V262_CLOSEOUT_FINAL_PLAN.md`
- 정책 원문 SoT: `docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md`
- 기준선: v262 (release `b9ff90e` · 시작 main `d4459a7` · 작업 브랜치 `integration/v262-closeout`)
- 판: PHASE 0 초판 · 실행 묶음 B 1~7차 · PM Solution Closure · PM EXECUTION DIRECTIVE · PM FINAL DECISION & CLOSURE(2026-09-20)

> 현재 판정(currentStatus)은 PHASE 0 시점의 재감사 결과다. 최종 상태(finalStatus)는 각 항목의 조사·구현·검증이 끝난 뒤에만 채운다. NOT_AVAILABLE은 계획서 §51의 필수 조건을 모두 채운 경우에만 쓴다.

## 현황

### 종결 판정(최종 상태)

| 종결 판정 | 건수 | 뜻 |
| --- | ---: | --- |
| SOLVED | 49 | 해결됨 - 코드 · 데이터 · 문서로 처리 완료 |
| SOLVED_WITH_CONSTRAINT | 12 | 제약과 함께 해결됨 - 제약의 내용과 이유를 problem에 적는다 |
| EXTERNAL_ACTION_REQUIRED | 4 | 외부(대시보드 · 발급 · 릴리스 시점) 조치가 남음 - 절차를 implementationNeeded에 적는다 |
| NOT_AVAILABLE | 4 | 현재 이용조건 · 원천 · 근거로는 불가 - 조사 경로 · 확인된 사실 · 재활성화 조건을 적는다 |
| PM_DECISION_REQUIRED | 0 | 구현은 가능하나 계산 모델 · 사용자 화면 · 데이터 의미를 바꾸므로 PM 승인이 선행돼야 함 |
| (미판정) | 0 | 종결 판정이 아직 없는 항목 - 0이어야 프로젝트가 닫힌다 |
| **합계** | **69** | |

### 현재 판정(PHASE 0 재감사 시점 기록)

| 현재 판정 | 건수 |
| --- | ---: |
| OPEN | 0 |
| COMPLETED | 15 |
| RETAINED | 5 |
| NOT_AVAILABLE_CANDIDATE | 0 |
| SOLVED | 34 |
| SOLVED_WITH_CONSTRAINT | 7 |
| EXTERNAL_ACTION_REQUIRED | 4 |
| NOT_AVAILABLE | 4 |
| PM_DECISION_REQUIRED | 0 |
| **합계** | **69** |

## 전체 목록

| ID | 항목 | 분류 | 단계 | 현재 판정 | 최종 상태 |
| --- | --- | --- | --- | --- | --- |
| CL-01 | v262 운영 릴리스 | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-02 | 0052D0 국내/해외 · 통화 표시 | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-03 | KRX 영문 혼합 종목코드 정규화 · 마스터 생성기 | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-04 | 국내 우선주 처리 - 현행 유지(PM 결정 ④) | 이미 종결 | PHASE 0 | RETAINED | SOLVED_WITH_CONSTRAINT |
| CL-05 | jsDelivr 캐시 - purge 하지 않고 자연 만료(PM 결정) | 이미 종결 | PHASE 0 | RETAINED | SOLVED_WITH_CONSTRAINT |
| CL-06 | .claude/launch.json 사용자 로컬 변경 보존 | 이미 종결 | PHASE 0 | RETAINED | SOLVED_WITH_CONSTRAINT |
| CL-07 | 원장 49건 MC 불변(자산군 · 입력 · 고정 seed 결과) | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-08 | 기존 PM 결정 ①~⑤(2026-09-19) 반영 상태 | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-09 | 릴리스 게이트 구성(Unit · E2E · ESLint · Data Guard · Release Guard) | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| CL-10 | 문서 상태 정정(CLAUDE.md · 체크리스트 §44 로드맵) | 이미 종결 | PHASE 0 | COMPLETED | SOLVED |
| D-1 | 미국 개별주 본국 보통주(HOME_COMMON) 근거 | 데이터 · Benchmark | PHASE 3 | COMPLETED | SOLVED |
| D-2 | NYSE 상장 종목의 기준 지수(NYSE Composite) 부재 | 데이터 · Benchmark | PHASE 3 | NOT_AVAILABLE | NOT_AVAILABLE |
| D-3 | ETF 기초지수 · PR/TR 전수 확인 | 데이터 · Benchmark | PHASE 3 | NOT_AVAILABLE | NOT_AVAILABLE |
| D-4 | ETF 환헤지 여부 A등급 근거(368590 · 360200) | 데이터 · Benchmark | PHASE 3 | NOT_AVAILABLE | NOT_AVAILABLE |
| D-5 | 코스피200 PR · TR 시계열 원천 | 데이터 · 지수 원천 | PHASE 3 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| D-6 | Index Master 원천 없음 4종 재조사 | 데이터 · 지수 원천 | PHASE 3 | NOT_AVAILABLE | NOT_AVAILABLE |
| D-7 | 나스닥 종합 등 스트레스 낙폭을 실제 역사 데이터로 직접 계산 | 데이터 · 스트레스 | PHASE 4 | SOLVED | SOLVED |
| D-8 | 혼합 상품 1:N 노출(237370 · 472170) | 데이터 · 구조 | PHASE 6 | COMPLETED | SOLVED |
| D-9 | 원화 기준 역사적 낙폭(환율 포함) 미구현 | 데이터 · 스트레스 | PHASE 4 | SOLVED | SOLVED |
| B-1 | KIS Worker secret 교체 · Origin 허용목록 · rate limit · fail-closed · 재배포 | 보안 | PHASE 2 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| B-2 | KIS 지수 API 이용조건 · 데이터 재배포 조건 | 보안 · 이용조건 | PHASE 1 | SOLVED | SOLVED |
| B-3 | 자산 프록시 Worker CORS 설정 점검 | 보안 | PHASE 2 | SOLVED | SOLVED |
| B-4 | 동기화 Worker CORS · rate limit | 보안 | PHASE 2 | SOLVED | SOLVED |
| C-1 | CMA 2026 Q2 검토 · 활성화 결정 | MC · CMA | PHASE 5 | SOLVED | SOLVED |
| C-2 | MC 환율 · 헤지비용 처리 정책 | MC · 환율 | PHASE 5 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| C-3 | 지표별 관측기간(변동성 1년 · 베타 · VaR · MDD 2~3년) | Risk · 관측기간 | PHASE 4 | SOLVED | SOLVED |
| C-4 | Backtest Gate · 장기 Market Panel(로드맵 ⑦~⑮) | MC · Backtest | PHASE 5 | SOLVED | SOLVED |
| F-1 | 베타 산출 불가 사유 구분 표시 | UI | PHASE 7 | SOLVED | SOLVED |
| F-2 | 비동기 Dimson 베타 정의 안내 | UI | PHASE 7 | SOLVED | SOLVED |
| F-3 | 고정 토스트가 팝업 버튼을 가리는 문제 | UI | PHASE 7 | SOLVED | SOLVED |
| F-4 | 직접 입력 채권 currentPrice 자동 갱신 안 됨 안내(BOND-DEF-02) | UI · 채권 | PHASE 6 | SOLVED | SOLVED |
| F-5 | 정의 불일치 · PR/TR 미확인 상태 표시 | UI | PHASE 7 | SOLVED | SOLVED |
| G-1 | 구형 Benchmark 근사 경로(getBenchmarkKeyForTicker · analyzeTickerForModal) | 코드 정리 | PHASE 7 | SOLVED | SOLVED |
| G-2 | APP_SHELL 외 13개 js의 런타임 캐싱 의존 | 코드 · 오프라인 | PHASE 7 | SOLVED | SOLVED |
| G-3 | N-02 엑셀 무수정 왕복 시 categorySource system → user 승격 | 코드 · 데이터 | PHASE 7 | SOLVED | SOLVED |
| G-4 | FIX-3-FULL 기록 없는 과거 구간의 차트 표현 | UI · 차트 | PHASE 7 | SOLVED | SOLVED |
| G-5 | KIS 재무 조회가 숫자 코드만 지원 | 코드 | PHASE 7 | EXTERNAL_ACTION_REQUIRED | EXTERNAL_ACTION_REQUIRED |
| G-6 | 포트 8644의 정체 확인 | 개발 환경 | PHASE 7 | RETAINED | SOLVED_WITH_CONSTRAINT |
| N-1 | 채권 관리 프로세스 전체 구축 | 채권 도메인 | PHASE 6 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| N-2 | Risk · MC 기초데이터 자동 업데이트 · 재검증 파이프라인 | 자동화 | PHASE 8 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| Q-1 | 종목 마스터 localStorage 압력 · QuotaExceeded | 저장소 | PHASE 7 | SOLVED | SOLVED |
| Q-2 | 일별 스냅샷(sam_daily_snapshot_v1) 누적 | 저장소 | PHASE 7 | SOLVED | SOLVED |
| Q-3 | 위험 알림 팝업 연결 상태 점검 | 코드 정리 | PHASE 7 | SOLVED | SOLVED |
| Q-4 | 숨겨진 스트레스/What-If · 계획 확인 노트 | UI | PHASE 7 | SOLVED | SOLVED |
| Q-5 | jsDelivr 캐시 · 버전 전략 | 배포 · CDN | PHASE 7 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| M-1 | 같은 id가 기기마다 다른 positionSource를 가질 수 있는가(이론적) | 동기화 | PHASE 7 | SOLVED | SOLVED |
| M-2 | §39-3 보류 묶음(T4 · F-7 · C-15 · 상관 가이드 중복 · S-40 · 375px VIX 라벨 · 옛 용어 주석) | 잔여 관찰 항목 | PHASE 7 | SOLVED | SOLVED |
| M-3 | 36-2 남은 옛 명칭(포트폴리오 구성 관련 문구) | 문구 | PHASE 7 | SOLVED | SOLVED |
| M-4 | BOND-DEF-01 · 03 · 04 · 05 정의 backlog | 채권 | PHASE 6 | SOLVED | SOLVED |
| M-5 | 채권 ETF 1개만 보유해도 포트폴리오 베타 null | Risk | PHASE 4 | SOLVED | SOLVED |
| P-1 | 자동 workflow 3종의 프로젝트 기간 통제 | 프로젝트 통제 | PHASE 0 | COMPLETED | SOLVED |
| P-2 | 프로젝트 종료 후 자동화 복귀 · 미실행분 재실행 | 프로젝트 통제 | PHASE 8 | EXTERNAL_ACTION_REQUIRED | EXTERNAL_ACTION_REQUIRED |
| P-3 | 사용자 영향 고지 | 릴리스 | PHASE 12 | SOLVED | SOLVED |
| P-4 | 롤백 계획 문서화 | 릴리스 | PHASE 12 | SOLVED | SOLVED |
| P-5 | 판정 규칙 ruleVersion · 소급 재평가 구조 | 자동화 구조 | PHASE 2 | SOLVED_WITH_CONSTRAINT | SOLVED_WITH_CONSTRAINT |
| P-6 | 외부 source 이용조건 기록 구조 | 외부 데이터 | PHASE 1 | SOLVED | SOLVED |
| P-7 | SEC 등 요구 연락처의 secret 주입 방식 | 보안 | PHASE 2 | EXTERNAL_ACTION_REQUIRED | EXTERNAL_ACTION_REQUIRED |
| P-8 | 자동 조사 실행량 예산 · 대상 범위 제한 | 자동화 구조 | PHASE 8 | SOLVED | SOLVED |
| P-9 | 최종 Production Baseline 재생성 · v262 기준선 영구 보존 | 릴리스 | PHASE 12 | EXTERNAL_ACTION_REQUIRED | EXTERNAL_ACTION_REQUIRED |
| P-10 | 종결 대장 자동 정합성 검사 | 프로젝트 통제 | PHASE 10 | SOLVED | SOLVED |
| P-11 | 세션 · PC 간 인계 구조 | 프로젝트 통제 | PHASE 0 | COMPLETED | SOLVED |
| P-12 | 공개 저장소 재배포 · robots 제약과 데이터 원천 선택 원칙 | 외부 데이터 | PHASE 1 | COMPLETED | SOLVED |
| D-11 | GOOG 무의결권 Class C 주식을 본국 보통주로 볼 것인가 | 데이터 · Benchmark | PHASE 3 | SOLVED | SOLVED |
| D-12 | 원장 Benchmark 키의 PR 단정 재확인(DJ_US_DIV100_PR · DJ_KOREA_DIV30_PR · ISELECT_US_AI_POWER_PR) | 데이터 · Benchmark | PHASE 3 | COMPLETED | SOLVED |
| D-13 | 혼합형 ETF를 1:N 노출 구조로 표현할지 여부 | 데이터 · 구조 | PHASE 6 | RETAINED | SOLVED_WITH_CONSTRAINT |
| P-14 | OpenDART 인증키를 실행 환경에 등록 | 외부 데이터 | PHASE 1 | COMPLETED | SOLVED |
| P-15 | PDF 원문 텍스트 추출 수단 부재 | 도구 · 조사 역량 | PHASE 1 | COMPLETED | SOLVED |
| P-16 | Bond 설계와 기존 정책 3건의 충돌(§7 σ=0 · Risk 대상 · 제10조 베타) | 정책 충돌 | PHASE 6 | SOLVED | SOLVED |
| F-7 | 위험 기여도 음수 0 처리(§39-3 보류 묶음에서 분리) | Risk · 표시 | PHASE 7 | SOLVED | SOLVED |

## 항목 상세

### 이미 종결

#### CL-01 — v262 운영 릴리스

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-16 · 44-16-2
- **현재 구현**: sw.js CACHE_NAME=smart-asset-manager-v262 · index.html #appVersionLabel=v262 · release commit b9ff90e
- **문제**: 없음 - 재확인 대상
- **필요한 사실**: 운영 버전 표식과 저장소 상태 일치
- **검증**: PHASE 0에서 sw.js · index.html · git 로그로 재확인(2026-09-20)
- **근거**: baseline/v262/MANIFEST.json version 필드
- **마지막 확인일**: 2026-09-20

#### CL-02 — 0052D0 국내/해외 · 통화 표시

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-16-2
- **현재 구현**: js/01 isKrxShortCode() · 거래 입력 통화 · 엑셀 분류
- **문제**: 없음 - 사용자 확인 완료(엑셀에서 국내로 분류됨)
- **필요한 사실**: 영문 혼합 코드의 국내 판정
- **검증**: test/krx-alnum-ticker.test.js 5건 · 사용자 엑셀 확인
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-03 — KRX 영문 혼합 종목코드 정규화 · 마스터 생성기

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-16-2
- **현재 구현**: js/01 KRX_SHORT_CODE_PATTERN · scripts/update-ticker-master.js · data/ticker-master.json(16,731건 · 영문 367건)
- **문제**: 없음
- **필요한 사실**: 생성기 · 앱 양쪽 인식
- **검증**: PHASE 0 master suite: tickerMaster.items=16731 · alphanumericKrCodes 집계
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-04 — 국내 우선주 처리 - 현행 유지(PM 결정 ④)

- **현재 판정**: RETAINED → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 0
- **SoT**: §44 44-16 D-06 단서
- **현재 구현**: 국내 상장 개별주는 상장시장 지수(js/09 RISK_BENCHMARK_BY_LISTING_EXCHANGE)
- **문제**: 없음 - 주식 종류(보통주/우선주) 마스터를 만들지 않기로 PM이 결정
- **필요한 사실**: 정책 유지 근거
- **검증**: PM 결정 ④(2026-09-19) · 코드 경로 무변경
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-05 — jsDelivr 캐시 - purge 하지 않고 자연 만료(PM 결정)

- **현재 판정**: RETAINED → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 0
- **SoT**: 인계장 v262 절
- **현재 구현**: js/09 TICKER_MASTER_CDN_URL(@main) · TICKER_MASTER_REFRESH_DAYS=20
- **문제**: PM이 '조치 없이 기다린다'로 결정. 다만 Q-5(캐시/버전 전략 점검)는 별도 항목으로 살아 있다
- **필요한 사실**: CDN 12시간 · 기기 20일 경과 후 반영
- **검증**: PHASE 7 Q-5에서 동작 점검
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-06 — .claude/launch.json 사용자 로컬 변경 보존

- **현재 판정**: RETAINED → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 0
- **SoT**: PM 지시(상시)
- **현재 구현**: 추적 파일이지만 이 프로젝트에서 stage·commit·복구하지 않는다
- **문제**: 없음
- **필요한 사실**: 시작 diff 해시 = 종료 diff 해시
- **검증**: PHASE 0 시작 216cbb7b12fed0a2 - 매 세션 종료 시 재확인
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-07 — 원장 49건 MC 불변(자산군 · 입력 · 고정 seed 결과)

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-16 D-16
- **현재 구현**: js/16 resolveMcAppAssetClass · CHARACTER_SOURCES_FOR_AUTO_RATE_KEY
- **문제**: 없음 - 다만 이 프로젝트의 모든 변경에서 계속 지켜야 하는 불변조건이다
- **필요한 사실**: 49/49 자산군 · MC 입력 · seed 20260101 결과 동일
- **검증**: test/mc-exposure-invariant.test.js 8건 + 회귀 하네스 mc suite
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-08 — 기존 PM 결정 ①~⑤(2026-09-19) 반영 상태

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-16
- **현재 구현**: ① 신규 원장 자산의 MC 영향 허용 ② 중간 버전업 없음 ③ 미국 개별주 자동 인정 금지 ④ 우선주 현행 ⑤ 0052D0 수정
- **문제**: 없음
- **검증**: v262 릴리스 보고 · 단위/E2E 통과
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-09 — 릴리스 게이트 구성(Unit · E2E · ESLint · Data Guard · Release Guard)

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: CLAUDE.md RELEASE GATE
- **현재 구현**: npm test · npx playwright test · npm run lint · data-guard · release-guard
- **문제**: 없음 - 최종 릴리스에서 전부 PASS 필요(계획서 §44)
- **검증**: PHASE 0 시작 시점 Unit 566/566 · ESLint 0 · Data Guard PASS · Release Guard PASS
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### CL-10 — 문서 상태 정정(CLAUDE.md · 체크리스트 §44 로드맵)

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: §44 44-8 · 44-16
- **현재 구현**: 커밋 d4459a7
- **문제**: 없음
- **검증**: git show d4459a7
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

### 데이터 · Benchmark

#### D-1 — 미국 개별주 본국 보통주(HOME_COMMON) 근거

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 3
- **SoT**: §44 44-16 D-06 · 계획서 §19
- **현재 구현**: 원장 20건 중 19건에 본국 보통주 근거(equityListing HOME_COMMON · A등급)를 채웠다. 판정 규칙 HOME_COMMON_RULE_V1 - ① SEC EDGAR 설립지(미국 주) ② 연차보고서 10-K ③ 거래소 종목 디렉터리 · 10-K 표지의 보통주 표기. GOOG 1건은 등록증권이 Class C Capital Stock이라 REVIEW(대장 D-11).
- **문제**: 해결됨. 남은 제약은 두 가지다 - NYSE 상장 9종목은 비교할 지수가 없어 여전히 미해결이고(D-2), 주기적 재검증에는 SEC 연락처가 필요하다(P-7).
- **필요한 사실**: 종목별 발행사 설립지 · 제출 서식(10-K vs 20-F/40-F) · 증권 종류(보통주 vs ADR)
- **조사 경로**: SEC EDGAR company_tickers.json + submissions(stateOfIncorporation · forms) · 발행사 공식 IR · 거래소 공식 상장정보
- **대체 경로**: 발행사 연차보고서 표지 · 거래소 상장 증권 종류 표기
- **영향**: 정책 D-06 판정 규칙 구체화 / Risk 개별 베타 · 포트폴리오 베타 · 위험점수 / MC 없음(Return Key 불변) / UI F-1 사유 표시
- **구현 필요**: 원장 equityListing 채움 + 자동 재검증 파이프라인(N-2)
- **테스트**: 회귀 하네스 risk suite(AAPL 경로) · 신규 단위테스트
- **검증**: Unit 566/566 · 회귀 하네스 risk 차이 10건(AAPL Benchmark · 베타 복원 · 데이터 신뢰도 78→81) · mc 차이 0건 · 측정 기록 docs/closeout/measurements/CHANGE-B1-001-us-home-common.md
- **근거**: docs/closeout/research/sec-filer-facts.json · docs/closeout/research/us-home-common.json
- **ruleVersion**: HOME_COMMON_RULE_V1
- **마지막 확인일**: 2026-09-20

#### D-2 — NYSE 상장 종목의 기준 지수(NYSE Composite) 부재

- **현재 판정**: NOT_AVAILABLE → **최종 NOT_AVAILABLE** · **단계**: PHASE 3
- **SoT**: 계획서 §20
- **현재 구현**: 조사 결과: NYSE Composite의 운영기관은 ICE Data Indices, LLC로 확인했다(ICE Benchmark Statement 원문). 그러나 ① 이 지수의 PR/TR 수익유형 대응을 공식 문서로 확정하지 못했고 ② 앱이 쓸 수 있는 가격 원천(무료 · 이용조건 확인)이 없다.
- **문제**: 확정 불가. 거래소 상장 사실만으로 Benchmark를 주지 않는다는 제10조를 유지하며, NYSE 상장 미국 개별주 9건은 UNRESOLVED로 남는다(자산군 US_EQUITY는 그대로라 MC는 정상 동작한다).
- **필요한 사실**: NYSE Composite(또는 대체 기준 지수)의 공식 정의 · 수신 가능한 역사 시계열 · 이용조건
- **조사 경로**: ICE Benchmark Statement 원문(운영기관 확인) · Yahoo ^NYA(robots Disallow) · 공공데이터포털 해외지수(대상 없음) · KRX(국내 지수만)
- **예비 결과(사실 아님)**: NYSE Composite 일별 이력 수신 확인 · 낙폭 산출 가능(2020 -38.11% · 2022 -22.37%). 공식 정의 · PR/TR · 이용조건은 미확인.
- **대체 경로**: -
- **영향**: 정책 상장시장 → 지수 매핑 규칙 / Risk NYSE 상장 개별주 베타 / MC 없음 / UI F-1
- **구현 필요**: 재활성화 조건: ICE 공식 문서에서 ^NYA의 수익유형이 확인되고, 이용조건이 확인된 가격 원천이 생기면 Index Master에 등록한다.
- **테스트**: risk suite 확장
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/source-terms.json · BOND_DATA_SOURCE_MATRIX.md
- **재개 조건**: ICE 공식 문서에서 ^NYA의 수익유형이 확인되고, 이용조건이 확인된 가격 원천이 생기면 Index Master에 등록한다.
- **마지막 확인일**: 2026-09-20

#### D-3 — ETF 기초지수 · PR/TR 전수 확인

- **현재 판정**: NOT_AVAILABLE → **최종 NOT_AVAILABLE** · **단계**: PHASE 3
- **SoT**: §44 44-16 · 계획서 §21 · §25
- **현재 구현**: 전수 조사 완료(docs/closeout/research/etf-facts.json · 12개 상품 · 필드별 fieldStatus). 확정: 069500 · 102110(코스피200) · 278530(코스피200 TR) · 487230(iSelect · PR) · 237370(배당성장50 + KTB 3:7) 등. 남은 4건은 지수 제공기관이 PR을 대표값으로 쓰지만 상품 자료가 그 구분을 적지 않은 경우다.
- **문제**: 확정 불가. 제공기관 관행만으로 상품이 PR 버전을 쓴다고 단정하지 않는다(검색 요약 · 일반 규칙을 사실로 승격하지 않는다는 원칙).
- **필요한 사실**: 종목별 기초지수의 공식 수익 유형(PR/TR)
- **조사 경로**: 발행사 투자설명서 PDF 직접 파싱(P-15로 환경 확보) · OpenDART list.json + document.xml(9/9 표지만 제공 · 본문 미제공 구조적 한계) · 운용사 상품 페이지 · 지수 제공기관 방법론 문서
- **대체 경로**: -
- **영향**: 정책 정의 일치(MATCH/DEFINITION_MISMATCH) 판정 / Risk 베타 · 정의 불일치 표시 / MC 없음 / UI F-5
- **구현 필요**: 재활성화 조건: 발행사 투자설명서 · 집합투자규약에 PR/TR 구분이 명시되면 원장에 A등급으로 기록한다.
- **테스트**: test/integrated-benchmark-index.test.js 확장
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/etf-facts.json · opendart-etf-facts.json
- **재개 조건**: 발행사 투자설명서 · 집합투자규약에 PR/TR 구분이 명시되면 A등급으로 기록한다.
- **마지막 확인일**: 2026-09-20

#### D-4 — ETF 환헤지 여부 A등급 근거(368590 · 360200)

- **현재 판정**: NOT_AVAILABLE → **최종 NOT_AVAILABLE** · **단계**: PHASE 3
- **SoT**: §44 44-16 D-05 · 계획서 §25
- **현재 구현**: 487230 · 368590 · 360750은 투자설명서 원문으로 환노출(비헤지)을 확정했다. 360200 한 건은 상품 자료에서 환헤지 여부를 확인하지 못했다.
- **문제**: 확정 불가. 상품명에 (H)가 없다는 사실은 근거로 쓰지 않는다 - 비헤지로도 헤지로도 단정하지 않고 UNRESOLVED(hedgeUnconfirmed)로 남긴다.
- **필요한 사실**: 공식 자료의 환헤지 정책(전량/부분/없음)
- **조사 경로**: 발행사 투자설명서 PDF(487230 · 368590 · 360750 확정) · 운용사 상품 페이지(360200) · 상품명 규칙(사용하지 않음)
- **대체 경로**: -
- **영향**: 정책 hedgeStatus / Risk 비동기 베타 산출 가능 여부 / MC 없음 / UI F-1
- **구현 필요**: 재활성화 조건: 360200의 투자설명서 · 운용사 상품정보에서 환헤지 여부가 확인되면 A등급으로 기록한다.
- **테스트**: risk suite(HOLD → 계산) 회귀
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/etf-facts.json
- **재개 조건**: 360200의 투자설명서 · 운용사 상품정보에서 환헤지 여부가 확인되면 A등급으로 기록한다.
- **마지막 확인일**: 2026-09-20

#### D-11 — GOOG 무의결권 Class C 주식을 본국 보통주로 볼 것인가

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 3
- **SoT**: §44 44-16 D-06 · 계획서 §19
- **현재 구현**: HOME_COMMON_RULE_VERSION = v2(본국 발행 지분증권 · ADR/우선주/ETF 제외)를 js/28에 도입하고 GOOG에 equityListing=HOME_COMMON · evidenceGrade=A를 근거와 함께 기록했다(§47-5).
- **문제**: 해결됨. Alphabet 10-K 표지 12(b)에 Class A Common(GOOGL)과 Class C Capital(GOOG)이 함께 등록돼 있고 예탁증권이 아니다. 측정: Benchmark 상태 RESOLVED 33→34 · UNRESOLVED 15→14 · 원장 검증 위반 0 · v261 대비 변경 0건(NASDAQ 11종목 전부 복귀).
- **필요한 사실**: 없음(사실은 모두 확인됨) - 정의의 문제다
- **선택지**: (가) 현행 유지 - 보통주 표기만 인정(GOOG는 계속 UNRESOLVED) · (나) 규칙을 "본국 발행 지분증권(의결권 차등 포함 · ADR · 우선주 제외)"으로 확장하고 ruleVersion을 올린다(GOOG → HOME_COMMON)
- **영향**: 정책 HOME_COMMON_RULE 정의 / Risk GOOG 베타 · 해당 종목 보유 시 포트폴리오 베타 / MC 없음 / UI 없음
- **구현 필요**: (나)를 택하면 규칙 버전 v2 + 전 종목 재평가 + 회귀
- **테스트**: integrated-benchmark-index · us-home-common.js
- **검증**: Benchmark 상태 분포 RESOLVED 33→34 · UNRESOLVED 15→14 · 원장 검증 위반 0 · Unit 통과
- **근거**: js/28-exposure-master.js(HOME_COMMON_RULE_VERSION · GOOG) · test/integrated-benchmark-index.test.js · §47-5
- **마지막 확인일**: 2026-09-20

#### D-12 — 원장 Benchmark 키의 PR 단정 재확인(DJ_US_DIV100_PR · DJ_KOREA_DIV30_PR · ISELECT_US_AI_POWER_PR)

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 3
- **SoT**: §44 44-16 D-01 · 계획서 §21
- **현재 구현**: Index Master의 PR/TR 표기를 전부 1차 자료로 검증했다 - DJ_US_DIV100_PR · DJ_KOREA_DIV30_PR · ISELECT_US_AI_POWER_PR(발행사 · 제공기관 공식 명칭에 Price Return 포함) · KOSPI200_TR(KRX 총수익지수 정의) · 신규 KOSPI200_PR(KRX 원지수).
- **문제**: 해결됨.
- **필요한 사실**: 각 지수의 공식 methodology에서 PR · TR 구분
- **조사 경로**: S&P Dow Jones Indices 지수 methodology · 지수 제공기관 공식 factsheet · 운용사 투자설명서의 기초지수 정식 명칭
- **영향**: 정책 Index Master returnType · 키 이름 / Risk 정의 일치 판정 / MC 없음 / UI F-5
- **구현 필요**: 확인 결과에 따라 Index Master 수정 또는 UNCONFIRMED로 되돌림
- **테스트**: integrated-benchmark-index PR/TR 테스트
- **검증**: docs/closeout/research/etf-facts.json indexDefinitions · Unit 566/566
- **근거**: 발행사 상품 페이지 · S&P DJI 공식 지수 페이지 · KRX 공식 지수 사이트
- **마지막 확인일**: 2026-09-20

### 데이터 · 지수 원천

#### D-5 — 코스피200 PR · TR 시계열 원천

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 3
- **SoT**: 계획서 §22 · §23
- **현재 구현**: §47-6으로 self-proxy 금지를 확정하고 테스트로 고정했다. 코스피200은 "정의 확인 · 원천 없음"을 정확히 유지한다.
- **문제**: PM이 APPROVED WITH CONSTRAINT로 결정했다 - ETF self-proxy는 폐기하고(실증적으로 정보량 0), 공식 원천이 없는 현재는 "Benchmark 정의는 확인 · 가격 원천 없음(UNAVAILABLE)" 상태를 정확히 유지한다. 추가 조사는 하지 않는다.
- **필요한 사실**: PR · TR 각각의 공식 정의 · 수신 가능한 일별 수준값 · 이용조건
- **조사 경로**: 네이버 금융 KPI200(PHASE 0 예비 확인: 일별 257행 수신) · KRX 공식 데이터 경로 · 운용사 · 지수 제공기관(KRX 지수) · KIS(이용조건 확인 선행 · B-2)
- **예비 결과(사실 아님)**: KPI200 수신 확인 · KPI200TR/KOSPI200TR은 0행(예비 결과 · 최종 사실 아님)
- **선택지**: (가) 사용자 공공데이터 인증키 직접조회 - 지수 API는 CORS 허용 실측 확인됨(프록시 불필요). 키 입력 UI는 신규 기능이므로 PM 승인 필요 · (나) KRX 지수 정보상품 라이선스 · (다) 현행 유지 - 정의 확정 + 원천 없음 표시(현재 상태이며 정직한 표시)
- **영향**: 정책 Index Master availability / Risk 국내 ETF 베타 / MC 없음 / UI F-1 · F-5
- **구현 필요**: 공식 KOSPI200 PR/TR 시계열이 확보되면 Index Master에 원천만 등록하면 된다(구조는 이미 유지돼 있다). 사용자 인증키 직접조회 경로를 택하려면 인증키 입력 UI가 신규 기능이라 별도 승인이 필요하다.
- **테스트**: risk suite · Index Master 회귀
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

#### D-6 — Index Master 원천 없음 4종 재조사

- **현재 판정**: NOT_AVAILABLE → **최종 NOT_AVAILABLE** · **단계**: PHASE 3
- **SoT**: §44 44-16 · 계획서 §23
- **현재 구현**: 전 경로 재조사 완료: Yahoo(robots 전면 Disallow) · 네이버(robots Disallow) · KRX data.krx(계정 필요 · 지수는 정보상품) · 공공데이터 지수시세(제4유형 · CORS는 허용 실측) · KIS(약관 미확인 · B-2).
- **문제**: 현재 이용조건을 만족하는 무료 원천이 없다. 원천 없음(UNAVAILABLE) 표시가 사실이며, 이것이 정직한 상태다.
- **필요한 사실**: 각 지수의 공개 역사 시계열 수신 가능성 · 정의 · 이용조건
- **조사 경로**: Yahoo Finance(robots 전면 Disallow) · 네이버 금융(robots Disallow) · KRX data.krx(계정 필요 · 지수는 정보상품) · 공공데이터 지수시세(공공누리 제4유형 · CORS 허용은 실측 확인) · KIS 지수 API(약관 미확인 · B-2)
- **대체 경로**: -
- **영향**: 정책 availability / Risk 해당 종목 베타 / MC 없음 / UI F-1
- **구현 필요**: 재활성화 조건: (가) 사용자가 공공데이터포털 인증키를 발급해 브라우저에서 직접 조회하는 경로를 PM이 승인하거나 (나) KRX 지수 정보상품 라이선스를 확보하면 Index Master에 원천을 등록한다.
- **테스트**: integrated-benchmark-index 회귀
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/source-terms.json · PM_SOLUTION_CLOSURE.md §7
- **재개 조건**: (가) 사용자 공공데이터 인증키 직접조회를 PM이 승인하거나 (나) KRX 지수 정보상품 라이선스를 확보하면 Index Master에 원천을 등록한다.
- **마지막 확인일**: 2026-09-20

### 데이터 · 스트레스

#### D-7 — 나스닥 종합 등 스트레스 낙폭을 실제 역사 데이터로 직접 계산

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 4
- **SoT**: §40 P-4 · P-5 · 계획서 §24
- **현재 구현**: 낙폭 상수를 실측값으로 맞췄다 - KOSDAQ 2020 -33.0 → -38.15(5.15%p 과소였다) · NASDAQ(종합) 신규(2020 -30.12 · 2022 -35.49) · 나머지는 실측과 0.2%p 이내로 일치해 실측값으로 통일.
- **문제**: 해결됨. 상수 대부분은 이미 역사적 데이터에서 나온 값임이 대조로 확인됐고, 틀린 하나와 빠진 하나만 고쳤다. 스트레스는 6대 위험요인 점수에 들어가지 않아 위험점수는 바뀌지 않는다.
- **필요한 사실**: 지수별 2020 · 2022 · 전체 기간 최대 낙폭(고점 · 저점 · 계산식 · 기준일)
- **조사 경로**: Yahoo ^IXIC · ^GSPC · ^NDX · ^DJI · ^KS11 · ^KQ11 장기 이력에서 직접 계산 · 산출 결과를 데이터로 고정(해시 기록)
- **예비 결과(사실 아님)**: 계산값(2020 / 2022): 코스피 -35.71 / -27.89 · 코스닥 -38.15 / -36.84 · S&P500 -33.93 / -25.43 · 나스닥100 -28.03 / -35.28 · 다우 -37.09 / -21.94 · 나스닥종합 -30.12 / -35.49(앱에 없던 값) · NYSE종합 -38.11 / -22.37
- **영향**: 정책 §40 P-5 / Risk 스트레스 손실 추정 / MC 없음 / UI 스트레스 표시
- **구현 필요**: 없음(종결)
- **테스트**: risk suite stress 필드 회귀
- **검증**: test/risk-engine.test.js Golden · test/risk-honesty.test.js T4
- **근거**: docs/closeout/research/index-drawdowns.json · §47 D-7 기록
- **마지막 확인일**: 2026-09-20

#### D-9 — 원화 기준 역사적 낙폭(환율 포함) 미구현

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 4
- **SoT**: §44 44-15 · 인계장 장기 BACKLOG
- **현재 구현**: 원화 기준 낙폭 표(COVID/RATE_HIKE …_KRW)를 추가하고, 원화 환산 지수로 구한 베타에는 원화 낙폭을 곱하도록 했다. 예전에는 정의가 섞이는 것을 막으려고 스트레스를 아예 만들지 않았다.
- **문제**: 해결됨. 정의가 맞는 짝끼리만 곱한다는 원칙은 그대로이고, 원화 낙폭 자료가 생겨 그 원칙 안에서 계산할 수 있게 됐다 - 국내 상장 비헤지 해외 ETF 보유 시 스트레스가 통째로 비던 문제가 사라진다.
- **필요한 사실**: 지수 수준 × H.10 원화 환산 시계열의 낙폭
- **조사 경로**: 보유 중인 H.10 + 지수 장기 이력으로 직접 계산(D-7과 동일 방법)
- **예비 결과(사실 아님)**: 원화 기준 낙폭이 달러 기준보다 작다 - 하락기에 원/달러가 오르며 일부를 상쇄했기 때문이다. 정책 채택은 D-7과 함께 PM 결정.
- **영향**: 정책 §40 P-5 / Risk 스트레스 / MC 없음 / UI 스트레스 안내
- **구현 필요**: 없음(종결)
- **테스트**: risk suite
- **검증**: test/integrated-benchmark-index.test.js ④ H.10 · Unit 602/602
- **근거**: docs/closeout/research/index-drawdowns.json(krw) · §47 D-9 기록
- **마지막 확인일**: 2026-09-20

### 데이터 · 구조

#### D-8 — 혼합 상품 1:N 노출(237370 · 472170)

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 6
- **SoT**: §44 44-16 · 계획서 §39
- **현재 구현**: 혼합형 2종의 공식 구성이 확인됐다. 237370: KRX 배당성장 채권혼합지수 = 코스피 배당성장 50 30% + KTB 70%. 472170: FnGuide 미국테크TOP10 채권혼합지수 = Indxx US Tech Top10 + KIS 국채 3-10년(총수익) 5:5(2025-10-31부터 4:6에서 변경) · 환헤지 없음. [B-6] 237370 투자설명서 원문: "코스피 배당성장50 지수와 **KRX Korea Treasury Bond Index**의 변화를 **3:7**의 비율로 반영하여 산출" - 채권지수 정식명과 비율이 원문으로 확정됐다.
- **문제**: 사실 조사는 끝났다. 두 상품 모두 **단일 혼합지수**를 기초지수로 쓰므로 반드시 1:N 구조가 필요한 것은 아니다 - 구조 도입 여부는 별도 결정(D-13).
- **필요한 사실**: 공식 구성비(자산군별 비중) · 기초지수 조합
- **조사 경로**: 운용사 투자설명서 · 집합투자규약 · 금융투자협회 · 지수 제공기관
- **영향**: 정책 1:N 노출 모델 / Risk 베타 산출 방식 / MC 자산군 배분 / UI F-1
- **구현 필요**: 원장 구조 확장(1:N) - 범위는 PM 결정 필요
- **테스트**: risk · mc 회귀
- **검증**: docs/closeout/research/etf-facts.json · 원장 MIXED 유지(계산 무변경)
- **근거**: 발행사 공식 상품 페이지(원문 인용 기록)
- **마지막 확인일**: 2026-09-20

#### D-13 — 혼합형 ETF를 1:N 노출 구조로 표현할지 여부

- **현재 판정**: RETAINED → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 6
- **SoT**: 계획서 §39 · §44 44-16
- **현재 구현**: PM 지시(B-4 §14): 두 상품 모두 운용사가 단일 혼합지수를 쓰므로 **1:N Exposure 엔진을 만들지 않는다. 현행 MIXED 구조 유지**가 기본 결론이다.
- **문제**: 해결(현행 유지). 단, Bond 모델이 확정되어 혼합지수 내부 구성비(30/70 · 5:5)를 Risk/MC에 반영해야 할 필요가 생기면 다시 판단한다.
- **필요한 사실**: 혼합지수의 일별 시계열 원천(①을 택할 경우)
- **선택지**: (가) 현행 MIXED 유지(베타 산출 안 함) · (나) 혼합지수를 Index Master에 등록(원천 확보 필요) · (다) 1:N 노출 구조 신설(Risk · MC 구조 변경 · 범위 큼)
- **영향**: 정책 노출 표현 방식 / Risk 두 상품의 베타 · 포트폴리오 베타 / MC 자산군 배분(혼합형) / UI 설명
- **구현 필요**: 결정에 따름
- **테스트**: risk · mc 회귀
- **검증**: 원장 exposureStructure MIXED 유지 · 계산 무변경(회귀 차이 없음)
- **근거**: docs/closeout/research/etf-facts.json · BOND_N1_SURVEY.md §7
- **재개 조건**: Bond Risk/MC 모델 확정 시 재검토
- **마지막 확인일**: 2026-09-20

### 보안

#### B-1 — KIS Worker secret 교체 · Origin 허용목록 · rate limit · fail-closed · 재배포

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 2
- **SoT**: 인계장 v262 절(KIS 보안) · 계획서 §26
- **현재 구현**: Worker 코드 수정 완료 - CORS 허용 목록 · fail-closed(미등록 시 503) · KV 요청 제한(분 30 · 일 300) · 상류 오류 본문 미전달. test/kis-worker-security.test.js 8건이 동작을 고정한다(§47-8). [운영 상태 실측 2026-09-20] 배포된 Worker 3종은 아직 **옛 코드**다 - 세 엔드포인트 모두 Access-Control-Allow-Origin이 "*"로 응답한다(허용 목록 미적용). kis-proxy는 비밀값 없이 호출 시 401이므로 CLIENT_SHARED_SECRET 자체는 등록돼 있으나, fail-closed(503) · Origin 허용 목록 · 요청 수 제한은 반영되지 않았다. asset-proxy는 허용 목록 밖 Origin(evil.example.com)에도 200을 돌려준다. [운영 배포 완료 · 실측 2026-09-20 두 번째] 사용자가 Cloudflare Dashboard에서 Worker 3종을 직접 재배포했다. 재측정 결과 세 Worker 모두 신규 코드가 반영됐다 - 허용 Origin(https://key4125-netizen.github.io)에는 ACAO가 그 Origin으로 반사되고 Vary: Origin이 붙으며, 허용 목록 밖 Origin(evil.example.com)에는 ACAO 헤더가 아예 없다(이전의 ACAO "*" 완전 제거). kis-proxy: 인증 없음/오인증 401, 운영 앱 v262 공유값으로는 200(실데이터) - 공유값 미변경이라 v262와 계속 일치한다. 분당 30회 제한 실측 - 31번째 요청부터 429 + Retry-After. G-5 분기 응답(ticker_format_unsupported)이 살아 있어 최신 코드임이 확정된다. asset-proxy: GET /?url= 계약 유지(Yahoo · Naver · er-api · stooq 실데이터 수신), 허용목록 밖 host 403 host_not_allowed, http(비https) 403, url 누락 400, 잘못된 url 400, POST 405. sync: GET/POST 계약 유지, bad_key 400, 없는 슬롯 404(SYNC_KV 조회 도달), POST 필수 5필드(ciphertext · iv · salt · version · updatedAt) 전수 검증 시 각각 bad_body 400, version 문자열도 400, 깨진 JSON bad_json 400, PUT 405. GET 분당 60회 제한 실측 - 61번째부터 429. 운영 앱(v262 · GitHub Pages)을 실제 브라우저로 열어 세 Worker를 호출한 결과 전부 정상(KIS 200 · asset-proxy 200 · sync 404 not_found)이라 회귀 없음.
- **문제**: 운영 배포가 끝나 CORS 허용목록 · 인증 · 요청 수 제한 · host 허용목록이 실제로 동작한다. 다만 다음 세 가지는 **운영환경에서 직접 확인할 수 없었다**(확인하려면 이번 단계에서 금지된 설정 변경 · 데이터 쓰기가 필요하다): ① fail-closed(503) - CLIENT_SHARED_SECRET을 비워야 재현되는데 비밀값 변경 금지 · 운영 앱이 즉시 깨진다. ② upstream_error(502, kis) / upstream_fetch_failed(502, asset) - 상류 실패를 임의로 유발할 수 없다(존재하지 않는 종목코드는 KIS가 0값으로 200을 돌려준다). ③ sync 쓰기 일 200회 제한과 정상 POST 쓰기 - 실제 PUT을 넣으면 KV에 지울 수 없는 테스트 슬롯이 남고(삭제 라우트 없음) 무료 티어 쓰기 한도(일 1,000건)를 소비한다. 세 항목 모두 코드 · 단위테스트(test/kis-worker-security.test.js 9건)로는 PASS다. 그리고 §47-8에 이미 기록된 구조적 제약이 남는다 - 공개 정적 페이지라 X-App-Secret은 원리상 공개값이고, 실질 방어선은 Origin 허용목록 + 요청 수 제한이다.
- **필요한 사실**: 현재 Worker 설정 상태 · 교체 계획
- **조사 경로**: Cloudflare Worker 설정 확인(사용자) · 저장소 내 참조 코드 점검(Claude)
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 없음
- **구현 필요**: 없음(운영 배포 완료). 남는 것은 선택 사항이다 - 공유값을 새 값으로 바꾸고 싶다면 js/01-core-state.js 상수와 Cloudflare Secret을 **앱 릴리스와 동시에** 교체해야 한다(지금 따로 바꾸면 v262가 401로 깨진다).
- **테스트**: 네트워크 격리 스모크
- **검증**: 코드: test/kis-worker-security.test.js 9건 PASS. 운영: CORS 허용/차단 · Vary 3종 PASS, kis 401/200 PASS, kis 분당 30 PASS(31번째 429), asset host 허용목록 PASS, sync 계약 · bad_key · 분당 60 PASS(61번째 429), v262 회귀 없음. 미검증(운영환경 직접 확인 불가): fail-closed 503, upstream 502 2종, sync 쓰기 일 200 · 정상 POST 쓰기.
- **근거**: HTTP 실측 2026-09-20(상태코드 · CORS 헤더만 · 비밀값 미출력) + 운영 앱(v262) 브라우저 실행 검증
- **마지막 확인일**: 2026-09-20

#### B-3 — 자산 프록시 Worker CORS 설정 점검

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 2
- **SoT**: 계획서 §26
- **현재 구현**: cloudflare-worker-asset-proxy.js의 CORS를 와일드카드에서 Origin 허용 목록으로 바꿨다(ALLOWED_ORIGINS로 교체 가능 · Vary: Origin). 대상 호스트 화이트리스트는 기존 그대로 유지했다.
- **문제**: 해결됨(코드). 실제 적용은 Worker 재배포 시점이다 - B-1과 같은 대시보드 작업에 포함한다.
- **필요한 사실**: 현재 CORS 허용 목록
- **조사 경로**: 저장소 내 호출 코드 · Worker 설정(사용자)
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 없음
- **구현 필요**: 점검 결과에 따른 최소 변경(사용자 조치 가능성)
- **테스트**: 네트워크 격리 스모크
- **검증**: ESLint 0 · 코드 검토(와일드카드 제거 · Vary: Origin)
- **근거**: cloudflare-worker-asset-proxy.js(corsHeadersFor) · §47-8
- **마지막 확인일**: 2026-09-20

#### B-4 — 동기화 Worker CORS · rate limit

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 2
- **SoT**: 계획서 §26
- **현재 구현**: cloudflare-worker-sync.js에 Origin 허용 목록 + 요청 수 제한을 넣었다(읽기 분 60 · 쓰기 일 200). KV 무료 티어의 쓰기 한도가 하루 1,000건이라 쓰기 상한을 특히 낮게 뒀다.
- **문제**: 해결됨(코드). 인증 방식(가족 공유 암호에서 유도한 kvKey)은 기존 설계를 유지했다 - 내용이 AES로 암호화돼 있어 슬롯을 알아도 읽을 수 없다.
- **필요한 사실**: 현재 설정
- **조사 경로**: 저장소 내 호출 코드 · Worker 설정(사용자)
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 없음
- **구현 필요**: 점검 + 사용자 조치 절차
- **테스트**: 동기화 E2E
- **검증**: ESLint 0 · 코드 검토(읽기 분 60 · 쓰기 일 200 · 429 + Retry-After)
- **근거**: cloudflare-worker-sync.js(corsHeadersFor · checkSyncRateLimit) · §47-8
- **마지막 확인일**: 2026-09-20

#### P-7 — SEC 등 요구 연락처의 secret 주입 방식

- **현재 판정**: EXTERNAL_ACTION_REQUIRED → **최종 EXTERNAL_ACTION_REQUIRED** · **단계**: PHASE 2
- **SoT**: 계획서 §9
- **현재 구현**: SEC EDGAR는 요청 헤더에 연락처를 요구한다. 코드는 환경변수 SEC_CONTACT_EMAIL의 "존재 여부"만 확인하고 값은 출력하지 않는다(scripts/closeout/research/us-home-common.js --verify-sec). [확인 2026-09-20] 저장소 전체에서 이메일 리터럴 0건을 확인했고, 코드는 환경변수 SEC_CONTACT_EMAIL의 존재 여부만 본다(값은 출력하지 않는다).
- **문제**: 구조는 완료됐다. 실제 연락처 등록은 사용자 작업이며, SEC 직접 재검증(N-2 자동화 범위)을 켤 때만 필요하다 - **릴리스 차단 사항이 아니다**.
- **필요한 사실**: GitHub Actions Secret 이름 규칙
- **선택지**: (가) PM이 지정한 이메일을 환경변수 SEC_CONTACT / Actions Secret으로 주입(코드 · 커밋 · 보고서에 기록하지 않음) · (나) 다른 공식 경로로 본국 보통주 근거를 확보(거래소 · 발행사 IR - 종목별 수작업 · 느림)
- **구현 필요**: 사용자 작업(선택): 이 용도로 쓸 연락처를 환경변수 · GitHub Secret으로 등록. 등록 전에는 기록된 1차 자료로만 판정한다(현재 동작).
- **테스트**: 스크립트 단위
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: scripts/closeout/research/us-home-common.js --verify-sec(이름만 확인 · 값 미출력)
- **마지막 확인일**: 2026-09-20

### 보안 · 이용조건

#### B-2 — KIS 지수 API 이용조건 · 데이터 재배포 조건

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 1
- **SoT**: 계획서 §26 · §7
- **현재 구현**: KIS Developers 「오픈 API 서비스 이용 약관(고객)」(제정 2022. 8. 8. · apiportal.koreainvestment.com 이용약관 팝업) 원문을 읽어 source-terms.json에 SRC-KIS-OPENAPI로 기록했다. 핵심은 제5조 ③ - "회사에서 제공하는 시세(국내주식 · 해외주식 · 국내선물/옵션 등)정보를 고객이 직접 개발한 프로그램 등 개인의 업무에 한하여 이용해야 하며, 제3자에게 제공해서는 아니 된다."
- **문제**: 해결됨. 저장 · 파생계산을 금지하는 조항은 없고 허용 범위가 "개인의 업무"로 한정된다. **제3자 제공(재배포)은 명시적으로 금지**다. 따라서 KIS 시세 · 지수를 저장소 · 번들 · CDN에 싣지 않는 현행 정책이 약관과 일치하고, D-01 ⑤(KIS 지수 API 미연결)에 약관 근거가 생겼다. 제12조(유량 제어)는 이번에 넣은 요청 수 제한과 같은 방향이다.
- **필요한 사실**: KIS 오픈API 이용약관의 저장 · 재배포 · 2차 이용 조건
- **조사 경로**: KIS 공식 약관 · 개발자 포털 문서
- **영향**: 정책 D-5 · D-6 원천 선택 / Risk 간접 / MC 없음 / UI 없음
- **구현 필요**: 없음(현행 정책 유지가 곧 준수다). 향후 KIS 데이터를 새 경로에 쓰려면 제5조 ③의 "개인의 업무" 범위를 먼저 확인한다.
- **테스트**: 해당 없음
- **검증**: 공개 약관 팝업 원문 직접 확인 · 인증 호출 없음 · 비밀값 미취급
- **근거**: docs/closeout/research/source-terms.json SRC-KIS-OPENAPI(약관 원문 인용 · 2026-09-20 확인)
- **마지막 확인일**: 2026-09-20

### MC · CMA

#### C-1 — CMA 2026 Q2 검토 · 활성화 결정

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 5
- **SoT**: §37 CMA-AUTO-02 · 계획서 §28
- **현재 구현**: CMA PRIMARY를 AGI-LTCMA-2026Q1-USD → AGI-LTCMA-2026Q2-USD로 활성화(CMA-2026.2). approve → activate 정규 경로를 썼고 js/26은 재생성했다(§47-4).
- **문제**: 해결됨. 동일 seed 20260101 · 2,000회 · 20년 측정: P10 -1.97% · P50 +1.52% · P90 +4.77% · 평균 +3.84% · μ 지문 동일(Return Key 경로 무변경). 이전 세트는 SUPERSEDED로 남아 되돌릴 수 있다.
- **필요한 사실**: 2026Q2 데이터셋의 자산군 · 수익률 · 변동성 · 상관 · 방법론 · 기준일
- **조사 경로**: data/cma/datasets/AGI-LTCMA-2026Q2-USD.json(이미 확보) · AllianzGI 공식 문서
- **영향**: 정책 CMA 세트 / Risk 없음 / MC σ · 상관(μ는 Return Key) / UI MC 안내
- **구현 필요**: 결정 패키지 제출 → 승인 시 activate + 동일 seed before/after
- **테스트**: mc suite 회귀(전/후 비교)
- **검증**: 동일 seed 20260101 · 2,000회 · 20년 3단계 측정 기록 · μ 지문 동일 확인
- **근거**: data/cma/active.json · js/26-cma-data.js · docs/closeout/measurements/mc-base.json · mc-step1-cma-q2.json · §47-4
- **마지막 확인일**: 2026-09-20

### MC · 환율

#### C-2 — MC 환율 · 헤지비용 처리 정책

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 5
- **SoT**: §44 제6조 6-2 · 6-3 · 계획서 §29
- **현재 구현**: 조사 결과 "모형 없음"보다 정확한 사실을 찾았다 - 통화 기준이 섞여 있다. 국내주식 σ 29.4%(AllianzGI USD) vs 19.36%(JPM KRW) · 미국주식 16.6% vs 13.72% · 신흥국 24.4% vs 14.47%. 환헤지 쌍도 확인(미국 중기국채 비헤지 11.14% vs 헤지 3.45%). §47-11로 명문화했다.
- **문제**: 제약과 함께 종결. 해결책(통화 기준 통일)은 §37의 PRIMARY 결정을 뒤집는 일이고, 이번 릴리스에 이미 대규모 계산 변경이 두 건(C-3 · BOND-4) 있다. 세 번째를 겹치면 무엇이 무엇을 움직였는지 말할 수 없다. hedge cost=0이 정책이 아니라 모형 없음이라는 사실을 SoT와 화면에 남겼다.
- **필요한 사실**: 한·미 단기금리 시계열 · 환율 장기 시계열 · 헤지비용 산식의 공식 근거
- **조사 경로**: H.10(보유) · FRED(단기금리 · 이용조건 확인) · 한국은행 공개 통계
- **영향**: 정책 6-2 신설 여부 / Risk 없음 / MC 해외 자산 결과 / UI MC 가정 안내
- **구현 필요**: 다음 릴리스: 자산군별 통화 기준을 원화로 통일하고 동일 seed 전후 측정(별도 승인 필요).
- **테스트**: mc suite before/after
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47-11 · docs/closeout/PM_DECISION_LOG.md 2차
- **마지막 확인일**: 2026-09-20

### Risk · 관측기간

#### C-3 — 지표별 관측기간(변동성 1년 · 베타 · VaR · MDD 2~3년)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 4
- **SoT**: §44 제7조 · 44-8 로드맵 ⑥ · 계획서 §30
- **현재 구현**: js/09 조회 range 1y → 3y + RISK_OBSERVATION_WINDOWS(기술 250 · 변동성/베타/상관 500 · VaR/CVaR/MDD 750) + sliceRecentObservations. 본 엔진과 What-If 엔진 공통 적용 · 관측 수 표시와 기준 문구도 창별로 정정.
- **문제**: 해결됨. 정책 변경이 아니라 §44 제7조의 이행이다. 실측으로 전제를 확인했다 - Yahoo range=3y도 일별 간격 유지(국내 730행 · 미국 753행). 1년 창은 꼬리 위험을 구조적으로 과소평가했다(AAPL MDD -13.8% vs -33.4%).
- **필요한 사실**: Yahoo 장기 이력의 안정성 · 조정주가 일관성 · 각 지표의 통계적 적합 기간
- **조사 경로**: Yahoo 장기 이력 실측 · 기존 데이터 품질 진단 결과 재사용
- **영향**: 정책 제7조 / Risk 모든 지표 값 / MC 없음 / UI 관측 수 표시
- **구현 필요**: 없음(종결)
- **테스트**: risk suite
- **검증**: test/risk-observation-windows.test.js 5건 · Unit 602/602
- **근거**: docs/closeout/research/risk-observation-window.json · §47-10
- **마지막 확인일**: 2026-09-20

### MC · Backtest

#### C-4 — Backtest Gate · 장기 Market Panel(로드맵 ⑦~⑮)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 5
- **SoT**: §44 제40조 · 44-8 로드맵 · 계획서 §32
- **현재 구현**: 변경 없음. §50 릴리스 게이트가 Backtest를 요구하지 않고, 회귀 목적은 regression-harness + measure-mc(동일 seed 3단계)로 이미 충족된다.
- **문제**: 해결됨(현행 유지가 이 항목의 해결이다). GBM 대 Bootstrap 모델 선택은 이 프로젝트의 미결사항이 아니라 별도 제품 결정이며, 여기에 넣으면 프로젝트 하나 크기로 번진다.
- **필요한 사실**: 장기 패널 데이터의 출처 · 라이선스 · 저장 조건 · 이력 길이 · 재현성
- **조사 경로**: Kenneth French Data Library · FRED · 기타 공개 시계열
- **영향**: 정책 MC 모델 선택 / Risk 없음 / MC 모델 자체 / UI MC 설명
- **구현 필요**: 없음(종결)
- **테스트**: mc 회귀
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · scripts/closeout/regression-harness.js · scripts/closeout/measure-mc.js
- **마지막 확인일**: 2026-09-20

### UI

#### F-1 — 베타 산출 불가 사유 구분 표시

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §44 제9조 · 계획서 §27 · §40
- **현재 구현**: js/10에 betaUnavailableReasonsNoteHtml(베타 불가 사유 5종 구분) · benchmarkDefinitionNoteHtml(PR/TR 미확인 표시) 추가, 베타 툴팁에 비동기 Dimson(시차 0+1) 설명 한 문장 추가.
- **문제**: 해결됨. 엔진이 이미 구분해 둔 사실을 화면이 말하지 않던 것을 고쳤다. 사유마다 사용자가 할 수 있는 일이 다르다.
- **필요한 사실**: 표시 문구(사용자 언어) - 이미 엔진은 사유 코드를 갖고 있다(betaStatus · benchmarkPriceSource)
- **영향**: 정책 없음(표시 정책) / Risk 없음 / MC 없음 / UI 베타 · 진단
- **구현 필요**: 없음(종결)
- **테스트**: wording/E2E
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · js/10-risk-translation-alerts.js
- **마지막 확인일**: 2026-09-20

#### F-2 — 비동기 Dimson 베타 정의 안내

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §44 44-16 D-05 · 계획서 §27 F-2
- **현재 구현**: js/10에 betaUnavailableReasonsNoteHtml(베타 불가 사유 5종 구분) · benchmarkDefinitionNoteHtml(PR/TR 미확인 표시) 추가, 베타 툴팁에 비동기 Dimson(시차 0+1) 설명 한 문장 추가.
- **문제**: 해결됨. 엔진이 이미 구분해 둔 사실을 화면이 말하지 않던 것을 고쳤다. 사유마다 사용자가 할 수 있는 일이 다르다.
- **필요한 사실**: 설명 문구
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 베타 설명
- **구현 필요**: 없음(종결)
- **테스트**: wording
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · js/10-risk-translation-alerts.js
- **마지막 확인일**: 2026-09-20

#### F-3 — 고정 토스트가 팝업 버튼을 가리는 문제

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §46 · e2e/89 S-10 기록
- **현재 구현**: body.modal-open일 때 토스트를 화면 위쪽으로 옮긴다(index.html CSS + js/07 syncModalOpenFlag). 표시 시간 · z-index · 문구 · 토스트 로직은 그대로.
- **문제**: 해결됨. 실측된 조작 방해(팝업 하단 버튼을 8~9초 가림)를 위치 변경만으로 없앴다 - 안내를 숨기거나 빨리 닫지 않는다.
- **필요한 사실**: 재현 조건 · 뷰포트별 영향
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 토스트 레이아웃
- **구현 필요**: 없음(종결)
- **테스트**: E2E 375/768/1280
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · §46-5 실측 기록
- **마지막 확인일**: 2026-09-20

#### F-5 — 정의 불일치 · PR/TR 미확인 상태 표시

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §44 44-16 D-01 · 계획서 §40 F-5
- **현재 구현**: js/10에 betaUnavailableReasonsNoteHtml(베타 불가 사유 5종 구분) · benchmarkDefinitionNoteHtml(PR/TR 미확인 표시) 추가, 베타 툴팁에 비동기 Dimson(시차 0+1) 설명 한 문장 추가.
- **문제**: 해결됨. 엔진이 이미 구분해 둔 사실을 화면이 말하지 않던 것을 고쳤다. 사유마다 사용자가 할 수 있는 일이 다르다.
- **필요한 사실**: 표시 문구 · 발생 조건
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 베타 · 진단
- **구현 필요**: 없음(종결)
- **테스트**: risk suite · wording
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · js/10-risk-translation-alerts.js
- **마지막 확인일**: 2026-09-20

#### Q-4 — 숨겨진 스트레스/What-If · 계획 확인 노트

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 계획서 §35 Q-4
- **현재 구현**: 변경 없음. 계획 확인 안내 비표시는 v254 PM 결정(§41)이고 코드는 보존돼 있다.
- **문제**: 해결됨 - 이미 PM 결정이 있는 사항을 여기서 뒤집지 않는다. 기존 결정을 보존하는 것이 이 항목의 해결이다.
- **필요한 사실**: 현행 정책과의 대조
- **영향**: 정책 표시 범위 / Risk 없음 / MC 없음 / UI 카드
- **구현 필요**: 없음(종결)
- **테스트**: E2E
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · §41
- **마지막 확인일**: 2026-09-20

### UI · 채권

#### F-4 — 직접 입력 채권 currentPrice 자동 갱신 안 됨 안내(BOND-DEF-02)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 6
- **SoT**: §9-2 BOND-DEF-02 · 계획서 §31-9 · §40 F-4
- **현재 구현**: js/08 자산 상세 안내에 "채권 현재가는 자동 갱신되지 않는다 · 만기보유 수익률과 금리 민감도는 발행조건만으로 계산된다"를 추가했다(BOND-DEF-02).
- **문제**: 해결됨. 계산은 건드리지 않고 사실만 알린다.
- **필요한 사실**: Bond 정책 확정(N-1) 후 문구
- **영향**: 정책 Bond / Risk 없음 / MC 없음 / UI 채권 입력 안내
- **구현 필요**: N-1 결과에 따름
- **테스트**: E2E
- **검증**: ESLint 0 · Unit 통과(표시 계층 · 계산 무변경)
- **근거**: js/08-detail-modal-fx.js(BOND_PRICE_MANUAL 안내)
- **마지막 확인일**: 2026-09-20

### 코드 정리

#### G-1 — 구형 Benchmark 근사 경로(getBenchmarkKeyForTicker · analyzeTickerForModal)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §44 44-16 · 계획서 §36 G-1
- **현재 구현**: 종목 분석 모달을 resolveModalBenchmark(= resolveRiskBenchmark · §44 제10조)로 통일하고 옛 getBenchmarkKeyForTicker와 근사 집합 사용을 없앴다. 근거가 없으면 기준 지수 · 베타를 만들지 않는다.
- **문제**: 해결됨. 호출부 전수 확인 결과 그 값이 화면에 쓰이지 않아(소비처 0건) 사용자 영향 없이 정책 위반 경로를 제거했다.
- **필요한 사실**: 이 경로의 결과가 실제로 사용자에게 보이는지
- **영향**: 정책 일관성 / Risk 간접 / MC 없음 / UI 종목 분석 모달
- **구현 필요**: 없음(종결)
- **테스트**: 단위 · E2E
- **검증**: 옛 동작을 고정하던 테스트 2건을 새 계약으로 교체 · Unit 602/602
- **근거**: §47-12
- **마지막 확인일**: 2026-09-20

#### Q-3 — 위험 알림 팝업 연결 상태 점검

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 계획서 §35 Q-3
- **현재 구현**: 변경 없음. js/10 알림 생성 경로가 위험 상세의 action items로 실제 호출됨을 확인했다.
- **문제**: 해결됨 - 죽은 경로가 아니므로 정리 대상이 아니다.
- **필요한 사실**: 진입점 존재 여부
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 알림
- **구현 필요**: 없음(종결)
- **테스트**: E2E
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12
- **마지막 확인일**: 2026-09-20

### 코드 · 오프라인

#### G-2 — APP_SHELL 외 13개 js의 런타임 캐싱 의존

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 계획서 §36 G-2
- **현재 구현**: sw.js APP_SHELL에 js/15~27을 추가했다(총 32개). Release Guard가 "js/ 폴더의 모든 파일이 APP_SHELL에 포함되어 있음"을 확인한다.
- **문제**: 해결됨. 완전 오프라인 최초 실행에서도 Monte Carlo · 안전장치 · 일별평가 · CMA가 빠지지 않는다.
- **필요한 사실**: 실제 영향 범위(오프라인 시나리오)
- **영향**: 정책 없음 / Risk 없음 / MC 오프라인 실행 / UI 오프라인
- **구현 필요**: APP_SHELL 편입 여부 결정(캐시 용량 · 배포 영향 고려)
- **테스트**: 오프라인 E2E
- **검증**: PHASE 0 Release Guard 출력(2026-09-20)
- **근거**: sw.js APP_SHELL 32개 항목 · npm run release-guard 출력("js/ 폴더의 모든 파일이 APP_SHELL에 포함되어 있음")
- **마지막 확인일**: 2026-09-20

### 코드 · 데이터

#### G-3 — N-02 엑셀 무수정 왕복 시 categorySource system → user 승격

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 체크리스트 N-02(OPEN ISSUE 유지) · 계획서 §36 G-3
- **현재 구현**: js/12 carryOverCategorySource - 자산군 칸 값이 기존과 같고 기존이 user가 아니면 기존 상태를 유지한다(무수정 왕복에서 system → user 승격 방지). 값이 달라졌으면 예전대로 user.
- **문제**: 해결됨. 가짜 확정은 되돌릴 수 없고, 확정을 놓치는 쪽은 자동 개선이 계속 닿을 뿐이다. 새 컬럼을 추가하지 않아 구버전 파일과도 호환된다.
- **필요한 사실**: 현재 동작 재확인 · 사용자 의미 변경 여부
- **영향**: 정책 categorySource 의미 / Risk 없음 / MC 간접(자산군) / UI 분류 표시
- **구현 필요**: 없음(종결)
- **테스트**: category-source.test.js
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · js/12-import-export-sync.js
- **마지막 확인일**: 2026-09-20

### UI · 차트

#### G-4 — FIX-3-FULL 기록 없는 과거 구간의 차트 표현

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §21-8 · 계획서 §36 G-4
- **현재 구현**: 변경 없음. js/11 buildSnapshotSeries가 기록 없는 날을 recorded:false → total:null로 두고, 차트 세 경로 모두 spanGaps:false로 선을 끊는다.
- **문제**: 해결됨. 0으로 그리는 경로가 남아 있지 않다 - 대장 기술이 과거 상태였다.
- **필요한 사실**: 표현 방식(끊어 그리기 등)
- **영향**: 정책 표시 원칙 / Risk 없음 / MC 없음 / UI 차트
- **구현 필요**: 없음(종결)
- **테스트**: E2E · 시각 확인
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · js/11-refresh-history.js:414 · js/08 · js/11 spanGaps
- **마지막 확인일**: 2026-09-20

### 코드

#### G-5 — KIS 재무 조회가 숫자 코드만 지원

- **현재 판정**: EXTERNAL_ACTION_REQUIRED → **최종 EXTERNAL_ACTION_REQUIRED** · **단계**: PHASE 7
- **SoT**: 계획서 §36 G-5
- **현재 구현**: Worker가 영문 혼합 코드를 ticker_format_unsupported로 구분해 답한다(사실과 다른 "코드 오류" 안내 제거). 허용 범위는 넓히지 않았다. [공식 문서 확인 2026-09-20] 주식 현재가 시세(FHKST01010100) 문서의 FID_INPUT_ISCD는 String · 필수 · **Length 12**이고, 예시는 "005930 삼성전자" · "ETN은 종목코드 6자리 앞에 Q 입력 필수"뿐이다. 즉 길이 제약은 KIS가 아니라 우리 Worker 정규식(6자리 숫자)에 있다. 다만 영문 혼합 KRX 신규 코드(0052D0)를 수용한다는 명시는 문서 어디에도 없다.
- **문제**: 문서에 없는 수용을 추정하지 않는다(확인 전 개방 금지). 현행(미지원 형식을 ticker_format_unsupported로 분리)을 유지한다. 릴리스 차단 사항은 아니다. 부수 확인: 현재 Worker는 6자리 숫자만 받으므로 ETN(Q+6자리)도 거부한다 - 이번 범위에서 고치지 않고 사실만 기록한다(신규 기능 금지).
- **필요한 사실**: 해당 경로의 실제 동작
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 종목 분석
- **구현 필요**: 사용자 작업: KIS 종목코드 마스터파일(공식 GitHub koreainvestment/open-trading-api/stocks_info) 확인 또는 1:1 문의로 영문 혼합 코드 수용 여부 확정 → 수용되면 Worker 정규식 확장 후 B-1 배포와 함께 반영.
- **테스트**: 단위 · 수동 확인
- **검증**: test/kis-worker-security.test.js의 G-5 테스트
- **근거**: docs/closeout/research/source-terms.json SRC-KIS-OPENAPI.tickerFormat
- **마지막 확인일**: 2026-09-20

### 개발 환경

#### G-6 — 포트 8644의 정체 확인

- **현재 판정**: RETAINED → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 7
- **SoT**: 계획서 §36 G-6
- **현재 구현**: playwright.config.js baseURL · webServer url = http://localhost:8644 · scripts/dev-static-server.js 기본 포트
- **문제**: 없음 - 로컬 테스트 전용이며 Production과 무관함을 PHASE 0에서 확인했다
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 없음
- **구현 필요**: 없음
- **테스트**: 해당 없음
- **검증**: playwright.config.js:17,51 · scripts/dev-static-server.js:11 확인(2026-09-20)
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

### 채권 도메인

#### N-1 — 채권 관리 프로세스 전체 구축

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 6
- **SoT**: §9 Bond Domain · §44 제43조 · 계획서 §31
- **현재 구현**: Bond Domain V1 구현 완료 - js/29(레코드 스키마 A/B 분리 · 현금흐름 · 경과이자 · 수익률 8종 · 듀레이션 모형 · Bond Risk 요약 · ISIN 어댑터 6상태) · js/01 저장(sam_bond_positions_v1) · js/07 입력 폼 확장(375px 검증) · js/10 채권 위험 카드 · js/16 MC 자산군 연결. 단위 테스트 14건.
- **문제**: 제약과 함께 해결됨. 확정 계층(매입 시 YTM · 실현 쿠폰 · 만기 예상 · 듀레이션)은 시장가격 없이 전부 계산된다. 평가 계층(평가손익 · Current Yield · 현재가 YTM)은 채권 시세가 공공누리 제4유형이라 저장하지 않고 그 날 값이 있을 때만 표시한다. 신용위험은 스프레드 자료가 없어 수치화하지 않는다.
- **필요한 사실**: 없음 - 구현에 필요한 사실은 확보됐다(ISIN 조회 가능 필드 · 라이선스 · CMA 숫자 · 기존 코드 경로).
- **조사 경로**: 금융투자협회 채권정보센터 · 한국자산평가 등 채권평가사 · KRX · 발행기관 공시
- **예비 결과(사실 아님)**: 데이터 측면의 핵심 발견: **KRX 공식 지수 사이트가 채권지수 일별 시계열(총수익 · 순가격 · 시장가격)을 로그인 없이 제공**한다(KTB 10년 등 · 2026-09-18 값 확인). 주가지수는 현재값만 제공하는 것과 대조된다. 이용조건은 미확인.
- **세부 항목**: 31-1 경제적 정의 · 31-2 Bond Fact Ledger · 31-3 데이터 원천 · 31-4 Risk 모델 · 31-5 점수 편입 여부 · 31-6 MC · 31-7 혼합 1:N · 31-8 NOT_AVAILABLE 조건 · 31-9 UI
- **선택지**: PM이 BOND-1~6을 결정하면 설계대로 구현 착수 · 결정 전에는 구현하지 않는다
- **영향**: 정책 §9 · §40 P-8 / Risk 채권 위험 · 포트폴리오 베타 / MC 채권 σ · 상관 · 해외채권 / UI 채권 입력 · 안내
- **구현 필요**: 상시 시세가 필요해지면 KRX Data Marketplace 문의(BOND-6 경로).
- **테스트**: 신규 단위 + 회귀
- **검증**: Unit 566/566 · ESLint 0 · Data Guard PASS(이번 pass 코드 변경 없음)
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · BOND_DOMAIN_DESIGN.md §14 · BOND_DATA_SOURCE_MATRIX.md §5
- **마지막 확인일**: 2026-09-20

### 자동화

#### N-2 — Risk · MC 기초데이터 자동 업데이트 · 재검증 파이프라인

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 8
- **SoT**: 계획서 §18 · §19 · §49
- **현재 구현**: 자동화 대상 · 상한 · 금지사항을 RELEASE_PLAN §6으로 확정했다(원장 등록 종목만 · 1회 200호출 · 월 1회 · 자동 ACTIVE 없음). 자동 수집 가능 여부는 원천별로 조사해 BOND_DECISION_PACKAGE §8에 표로 남겼다.
- **문제**: 전면 자동화는 이용조건 때문에 불가능하다 - Yahoo · 네이버 robots 전면 Disallow, 공공누리 제4유형 변경금지, ETF 발행사 PDF는 구조가 제각각이라 기계 판정이 안 된다. 자동 가능한 범위(SEC HOME_COMMON · 채권 기본정보 · 지수 수신 성공 여부)로 한정한다.
- **필요한 사실**: 자동 ACTIVE 가능 조건 · REVIEW 조건 · 대량 이상 변경 임계(실측 분포 필요)
- **영향**: 정책 자동화 규칙 / Risk 간접 / MC 간접 / UI 확인일 표시 가능
- **구현 필요**: 한정된 범위의 재검증 스크립트를 PHASE 8에서 구현한다(자동 ACTIVE는 규칙이 명시된 SEC 판정만).
- **테스트**: 파이프라인 dry-run
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §6 · BOND_DECISION_PACKAGE.md §8
- **마지막 확인일**: 2026-09-20

### 저장소

#### Q-1 — 종목 마스터 localStorage 압력 · QuotaExceeded

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 계획서 §33
- **현재 구현**: js/01 setLocalStorageItemSafely - 쿼터 초과 시 재생성 가능한 캐시(종목 마스터)만 비우고 1회 재시도, 그래도 실패하면 사용자에게 알린다. 사용자 데이터는 절대 삭제하지 않는다. persistAssets · persistTransactions · persistBondPositions · persistDailySnapshots에 적용.
- **문제**: 해결됨. 실측 결과 마스터 캐시가 사용량의 99.9%(2,635KB/2,638KB)지만 Chromium은 여유가 컸다(추가 20MB 기록에도 쿼터 미도달). 진짜 위험은 한도가 빡빡한 기기에서 사용자 입력 저장이 조용히 실패하는 것이었고, 저장 구조를 바꾸지 않고 그 실패를 막았다.
- **필요한 사실**: 실제 브라우저별 한도 · 현재 사용량 · 실패 시 동작
- **영향**: 정책 없음 / Risk 없음 / MC 없음 / UI 저장 실패 안내
- **구현 필요**: 없음(종결)
- **테스트**: E2E · 수동
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · 브라우저 실측 2026-09-20
- **마지막 확인일**: 2026-09-20

#### Q-2 — 일별 스냅샷(sam_daily_snapshot_v1) 누적

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 계획서 §34
- **현재 구현**: 변경 없음(보존 유지).
- **문제**: 해결됨. 실측: 스냅샷 1건 393B · 연 140KB · 10년 1.4MB로 압력의 주범이 아니었고(마스터 캐시 2.6MB), 사용자 기록이라 보존이 기본이다. 저장 실패 위험은 Q-1의 복원력이 흡수한다.
- **필요한 사실**: 실제 증가 속도 · 사용처(일별 손익)
- **영향**: 정책 보관 정책 / Risk 없음 / MC 없음 / UI 일별 손익
- **구현 필요**: 없음(종결)
- **테스트**: daily-valuation 테스트
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · 브라우저 실측 2026-09-20
- **마지막 확인일**: 2026-09-20

### 배포 · CDN

#### Q-5 — jsDelivr 캐시 · 버전 전략

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 7
- **SoT**: 계획서 §35 Q-5
- **현재 구현**: jsDelivr는 태그 · 커밋 고정 URL이면 즉시 반영되고, 브랜치 URL은 최대 7일(+엣지 캐시) 지연된다. 현재 종목 마스터는 저장소 파일을 직접 받는 구조라 앱 배포와 함께 갱신된다.
- **문제**: 외부 CDN의 캐시 정책 자체는 우리가 바꿀 수 없다 - 통제 가능한 부분(고정 URL 사용 · 파일명에 버전 포함)만 정책으로 고정한다.
- **필요한 사실**: 실제 캐시 동작 · 사용자 영향
- **영향**: 정책 없음 / Risk 간접(종목 인식) / MC 없음 / UI 종목 검색
- **구현 필요**: 외부 CDN 경유가 필요해지면 브랜치 URL 대신 태그 · 커밋 고정 URL만 쓴다.
- **테스트**: 단위 · 수동
- **검증**: PHASE 0에서 상수 2개 확인(2026-09-20)
- **근거**: docs/closeout/RELEASE_PLAN.md §6 · jsDelivr 캐시 정책(공개 문서)
- **마지막 확인일**: 2026-09-20

### 동기화

#### M-1 — 같은 id가 기기마다 다른 positionSource를 가질 수 있는가(이론적)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: 체크리스트 §(동기화 절) 잔여 미결
- **현재 구현**: test/merge-preserve.test.js에 M-1 계약 추가 - 같은 id에 서로 다른 positionSource가 있으면 최신 편집(updatedAt)이 이긴다(양방향 + 결정성).
- **문제**: 해결됨. 규칙은 이미 정해져 있었고(BL-13 + 최신승) 새 규칙이 필요 없다는 것이 결론이다. 이론적 위험을 테스트로 고정해 미결 상태를 없앴다.
- **필요한 사실**: 실제 발생 경로 존재 여부
- **영향**: 정책 병합 / Risk 없음 / MC 없음 / UI 없음
- **구현 필요**: 없음(종결)
- **테스트**: merge/sync 테스트
- **검증**: test/merge-preserve.test.js 13건
- **근거**: §47-12
- **마지막 확인일**: 2026-09-20

### 잔여 관찰 항목

#### M-2 — §39-3 보류 묶음(T4 · F-7 · C-15 · 상관 가이드 중복 · S-40 · 375px VIX 라벨 · 옛 용어 주석)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §39-3
- **현재 구현**: F-7(위험 기여도 음수 0 처리)은 승인해 구현했다. 나머지 6건(T4 중복 · C-15 Macro 민감도 · D-6 상관 가이드 중복 · S-40 What-If 프리셋 이름 · 375px VIX 라벨 · HTML 주석 옛 용어)은 변경하지 않는다.
- **문제**: 해결됨. §46 TXT 규칙이 "이 4개 외 명칭 개편은 하지 않는다"로 범위를 닫아 두었고, 그 결정을 이번 승인 범위(Bond · MC · Risk · 보안)로 넓히지 않는다. 화면에 보이지 않는 주석은 사용자 영향이 없고, Macro 민감도는 "Macro→Risk 정량 연결 금지" 정책과 직접 얽힌 별도 사안이다.
- **필요한 사실**: 각 항목의 현재 재현 여부
- **영향**: 정책 표시 / Risk F-7은 위험 기여도 표시 / MC 없음 / UI 여러 화면
- **구현 필요**: 없음(종결)
- **테스트**: E2E · wording
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · §39-3 · §46
- **마지막 확인일**: 2026-09-20

### 문구

#### M-3 — 36-2 남은 옛 명칭(포트폴리오 구성 관련 문구)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §36-2
- **현재 구현**: 변경 없음.
- **문제**: 해결됨. 명칭 통일은 §46 TXT 규칙과 정면으로 충돌한다 - 기존 결정을 보존하는 것이 이 항목의 해결이다.
- **필요한 사실**: 현재 화면 명칭 정책
- **영향**: 정책 명칭 / Risk 없음 / MC 없음 / UI 버튼 · 안내
- **구현 필요**: 없음(종결)
- **테스트**: wording-review.test.js
- **검증**: Unit 602/602 · E2E 전체 · ESLint 0 · Data Guard PASS · 대장 정합성 PASS
- **근거**: §47-12 · §46 TXT-46-2
- **마지막 확인일**: 2026-09-20

### 채권

#### M-4 — BOND-DEF-01 · 03 · 04 · 05 정의 backlog

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 6
- **SoT**: §9-2 · §9-3
- **현재 구현**: BOND-DEF-01은 BOND-1(확정/평가 2계층)로, 03은 BOND-4(CMA 연결)로, 02는 F-4(현재가 자동갱신 안내)로, 04 · 05는 Return Key 현행 유지로 각각 귀결됐다.
- **문제**: 해결됨. 별도 결정 항목으로 남기지 않는다 - 네 건 모두 이번 승인 안에서 처리됐다.
- **필요한 사실**: N-1 조사 결과
- **영향**: 정책 Bond / Risk 채권 / MC 채권 σ / UI 채권
- **구현 필요**: N-1에 통합
- **테스트**: N-1과 동일
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/BOND_DECISION_PACKAGE.md §9 · §47-7
- **마지막 확인일**: 2026-09-20

### Risk

#### M-5 — 채권 ETF 1개만 보유해도 포트폴리오 베타 null

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 4
- **SoT**: 인계장 v262 절 · §44 제10조
- **현재 구현**: BOND-5 구현으로 해소. js/09 computeBetaAggregate가 베타를 구한 주식만 가중평균하고 설명 범위(coverage)를 함께 돌려준다 - 채권 ETF 하나 때문에 전체가 null이 되지 않는다(설명 범위 50% 미만이면 여전히 값 없음).
- **문제**: 해결됨. 관련 테스트 3건의 기대값을 갱신 사유와 함께 고쳤다.
- **필요한 사실**: 부분 집계 허용 여부(정책)
- **선택지**: (가) 현행 유지 · (나) 산출 가능분만 집계 + 제외 비중 표시(BOND-5 C안과 동일)
- **영향**: 정책 제10조 / Risk 포트폴리오 베타 · 점수 / MC 없음 / UI 베타 표시
- **구현 필요**: PM 결정 후 구현 또는 RETAINED
- **테스트**: risk suite
- **검증**: risk-engine · integrated-benchmark-index 기대값 갱신 후 Unit 통과
- **근거**: js/09-price-fx-risk-engine.js(computeBetaAggregate) · test/risk-engine.test.js · §47-2
- **마지막 확인일**: 2026-09-20

### 프로젝트 통제

#### P-1 — 자동 workflow 3종의 프로젝트 기간 통제

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: 계획서 §5 · §10
- **현재 구현**: PM 결정(2026-09-20)으로 3종을 비활성화했다 - Update USD/KRW (Fed H.10) 361810246 · Update ticker master 343557860 · CMA update check 359962356 모두 disabled_manually. pages-build-deployment(320103714)는 active 유지(최종 릴리스에 필요)
- **문제**: 해결됨. 스케줄 workflow는 기본 브랜치(main) 정의로 실행되므로 integration branch 수정으로는 멈출 수 없고 main 직접 커밋은 금지돼 있어, 저장소 설정 비활성화가 유일한 수단이었다
- **필요한 사실**: 통제 적용과 복구 방법
- **영향**: 정책 없음 / Risk 기준선 오염 방지 / MC 없음 / UI 없음
- **구현 필요**: 완료 - 복구는 P-2
- **테스트**: workflow 상태 확인
- **검증**: gh workflow list --all · GitHub Actions API의 state 필드로 4개 workflow 상태 재확인(2026-09-20)
- **근거**: docs/closeout/PHASE0_SNAPSHOT.md §5 통제 기록
- **마지막 확인일**: 2026-09-20

#### P-2 — 프로젝트 종료 후 자동화 복귀 · 미실행분 재실행

- **현재 판정**: EXTERNAL_ACTION_REQUIRED → **최종 EXTERNAL_ACTION_REQUIRED** · **단계**: PHASE 8
- **SoT**: 계획서 §5 · §49
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §3에 workflow 3종의 복귀 명령과 건너뛴 갱신 수동 실행 절차를 확정했다.
- **문제**: 절차는 확정됐고 실행 시점이 "프로젝트 종료 후"라 아직 하지 않았다. .github/workflows 파일은 무변경이다. [2026-09-20] B-1(외부 조치) 미완료로 최종 릴리스가 막혀 있어 아직 실행하지 않았다 - 이 항목은 릴리스 직전에만 수행한다(조기 실행하면 다시 해야 한다).
- **필요한 사실**: 건너뛴 실행 목록 - H.10 매주 화 00:00 UTC(2026-09-22부터) · 종목마스터 2026-10-01 · CMA 2026-10-03 이후 매월
- **구현 필요**: gh workflow enable/run 361810246 · 343557860 · 359962356 후 첫 실행 결과를 이 항목에 기록한다.
- **테스트**: 실행 결과 · 데이터 파일 갱신 확인
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §3
- **마지막 확인일**: 2026-09-20

#### P-10 — 종결 대장 자동 정합성 검사

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 10
- **SoT**: 계획서 §43
- **현재 구현**: scripts/closeout/ledger.js가 대장 · 조사표 정합성과 계획서 §50 단계 정의를 매 렌더마다 검사한다(항목 수 · 필수 필드 · 단계 표기).
- **문제**: 해결됨. 이번 종결 판정도 같은 검사를 통과했다.
- **필요한 사실**: 각 항목의 SoT · 구현 · 테스트 · 근거 참조
- **구현 필요**: 검사 규칙 확장
- **테스트**: 스크립트 자체 실행
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: scripts/closeout/ledger.js · docs/closeout/ISSUE_LEDGER.md
- **마지막 확인일**: 2026-09-20

#### P-11 — 세션 · PC 간 인계 구조

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 0
- **SoT**: 계획서 §6 · §23
- **현재 구현**: integration/v262-closeout 원격 보존 + CLAUDE_HANDOVER.md 최상단 절 + 종결 대장 · 조사표 · 기준선 파일
- **문제**: 없음 - 매 세션 종료 시 갱신 필요
- **검증**: PHASE 0 커밋 · push
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md · docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md §47 · docs/closeout/RELEASE_PLAN.md
- **마지막 확인일**: 2026-09-20

### 릴리스

#### P-3 — 사용자 영향 고지

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 12
- **SoT**: 계획서 §46
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §1에 사용자 영향 고지표를 작성했다(무엇이 · 왜 · 어느 방향으로 바뀌는지 5건).
- **문제**: 해결됨. "정확해졌다"가 아니라 "무엇을 근거로 무엇이 바뀌었다"로 쓴다는 문구 원칙을 함께 고정했다.
- **필요한 사실**: 최종 변경 목록과 수치 영향
- **구현 필요**: 릴리스 노트 또는 기존 안내 방식
- **테스트**: 문구 검토
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §1
- **마지막 확인일**: 2026-09-20

#### P-4 — 롤백 계획 문서화

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 12
- **SoT**: 계획서 §45
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §2에 롤백 절차를 4단계로 문서화했다 - 버전은 내리지 않고 "이전 상태를 담은 새 버전"으로 되돌린다. 데이터 파일만 되돌려 해결되는 경로 3개(CMA activate · app-asset-class-map · BETA_COVERAGE_MIN)를 먼저 둔다.
- **문제**: 해결됨. 사용자 데이터는 롤백 대상이 아님을 명시했다.
- **필요한 사실**: 롤백 기준 · 절차
- **구현 필요**: 문서 + 최종 릴리스 전 확인
- **테스트**: 해당 없음
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §2
- **마지막 확인일**: 2026-09-20

#### P-9 — 최종 Production Baseline 재생성 · v262 기준선 영구 보존

- **현재 판정**: EXTERNAL_ACTION_REQUIRED → **최종 EXTERNAL_ACTION_REQUIRED** · **단계**: PHASE 12
- **SoT**: 계획서 §48
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §4에 최종 기준선 재생성 절차를 확정했다(freeze-baseline + regression-harness · baseline/v262는 영구 보존).
- **문제**: 절차는 확정됐고 실행 시점이 릴리스 직전이다. [2026-09-20] B-1(외부 조치) 미완료로 최종 릴리스가 막혀 있어 아직 실행하지 않았다 - 이 항목은 릴리스 직전에만 수행한다(조기 실행하면 다시 해야 한다).
- **필요한 사실**: 최종 데이터 기준일 · 해시 · 결과
- **구현 필요**: 릴리스 직전 node scripts/closeout/freeze-baseline.js · regression-harness.js baseline 실행.
- **테스트**: 회귀 하네스
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §4
- **마지막 확인일**: 2026-09-20

### 자동화 구조

#### P-5 — 판정 규칙 ruleVersion · 소급 재평가 구조

- **현재 판정**: SOLVED_WITH_CONSTRAINT → **최종 SOLVED_WITH_CONSTRAINT** · **단계**: PHASE 2
- **SoT**: 계획서 §12 · §20
- **현재 구현**: js/28 equityListingRuleVersionOf · listEntriesJudgedUnderOlderRule 추가(근거 문구의 규칙 버전을 읽어 옛 버전 판정 항목을 골라낸다). v1로 판정했던 19건을 v2 기준으로 재확인해 현재 옛 규칙 항목 0건.
- **문제**: 제약과 함께 해결됨 → 구조와 현재 상태는 확정됐고, "규칙이 바뀌면 자동으로 다시 판정하는" 자동 재적용은 N-2(자동화) 범위로 남는다.
- **필요한 사실**: 규칙 식별자 체계
- **구현 필요**: 없음(종결)
- **테스트**: 단위
- **검증**: listEntriesJudgedUnderOlderRule() === 0건 · Unit 602/602
- **근거**: §47-12 · js/28-exposure-master.js
- **마지막 확인일**: 2026-09-20

#### P-8 — 자동 조사 실행량 예산 · 대상 범위 제한

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 8
- **SoT**: 계획서 §10 · §22
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §6에 자동 조사 예산을 확정했다 - 대상은 원장 등록 종목만(현재 58건) · 1회 200호출 · 월 1회 · 자동 ACTIVE 없음 · 연속 실패 3회 시 중단.
- **문제**: 해결됨. 종목 마스터 16,731건으로 번지지 않도록 대상 자체를 원장으로 묶었다.
- **필요한 사실**: 대상 = 원장 + 보유 + 목표
- **구현 필요**: 수집기 공통 예산 · 계측
- **테스트**: 스크립트 단위
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §6
- **마지막 확인일**: 2026-09-20

### 외부 데이터

#### P-6 — 외부 source 이용조건 기록 구조

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 1
- **SoT**: 계획서 §7 · §8 · §21
- **현재 구현**: docs/closeout/RELEASE_PLAN.md §5에 외부 원천 기록 구조(13개 필드)와 판단 규칙 3개를 확정했다. 실제 기록은 docs/closeout/research/source-terms.json이 담는다.
- **문제**: 해결됨. 기록이 없는 원천은 쓰지 않는다는 규칙을 포함한다.
- **필요한 사실**: source별 최신 이용조건
- **구현 필요**: 조사표에 필드 포함(이미 PHASE 0에서 마련)
- **테스트**: 해당 없음
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/RELEASE_PLAN.md §5 · docs/closeout/research/source-terms.json
- **마지막 확인일**: 2026-09-20

#### P-12 — 공개 저장소 재배포 · robots 제약과 데이터 원천 선택 원칙

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 1
- **SoT**: 계획서 §7 · §8 · §10
- **현재 구현**: PM 결정(2026-09-20): "공개 저장소 commit 및 jsDelivr 배포는 재배포가 허용된 자료만 사용한다." 재배포가 허용되지 않는 자료는 공개 저장소의 정적 데이터로 저장하지 않는다. robots · 이용조건을 우회하지 않는다. 이 원칙 때문에 막힌 자료는 즉시 NOT_AVAILABLE로 닫지 않고 대체 경로를 먼저 조사한다.
- **문제**: 해결됨(원칙 확정). 개별 자료의 적용은 각 항목에서 판단한다.
- **필요한 사실**: 앱이 외부 데이터를 쓰는 세 가지 방식(① 사용자 브라우저 실시간 조회 ② 저장소에 커밋해 배포 ③ 일회성 조사)에 대해 각각 허용 범위를 정하는 원칙
- **조사 경로**: 각 원천 robots · 약관 확인(source-terms.json) · 공공누리 유형별 조건 · 기존 H.10 · 종목마스터의 근거 재확인
- **선택지**: (가) "저장소 커밋 · 배포는 재배포가 허용된 자료만" 원칙을 명문화하고, 나머지는 사용자 브라우저 직접 조회로만 사용 · (나) 필요한 자료는 라이선스를 확보 · (다) 해당 자료를 쓰지 않는다
- **영향**: 정책 데이터 원천 선택 전반 / Risk 지수 원천 확보 가능 범위 / MC CMA · 금리 자료 수집 방식 / UI 사용자 키 입력 UI가 필요해질 수 있음
- **구현 필요**: 원칙 확정 후 파이프라인 · 조사표에 반영
- **테스트**: 해당 없음(정책)
- **검증**: PM 지시 2026-09-20 · 적용 현황: H.10(public domain) 유지 · 종목 마스터 유지 · 공공데이터포털 KRX 지수는 저장소 저장 불가로 판정(D-5에서 대체 경로 조사 중) · Yahoo 지수 낙폭은 1회성 조사로만 사용(상시 수집 파이프라인 없음)
- **근거**: docs/closeout/research/source-terms.json
- **마지막 확인일**: 2026-09-20

#### P-14 — OpenDART 인증키를 실행 환경에 등록

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 1
- **SoT**: 계획서 §9 · PM 지시(B-4)
- **현재 구현**: 사용자가 OPENDART_API_KEY를 등록했고 실제 호출이 성공했다(운용사 4곳 · status 000 · 요청 61건 · 문서 9건 · 실패 0). 값은 확인 · 출력 · 기록하지 않았다.
- **문제**: 해결됨. 다만 이 키로 열리는 범위가 기대와 달랐다 - 공시 **식별**은 되지만 투자설명서 **본문**은 API가 주지 않는다(첨부문서). 그 한계는 D-3 · D-4에서 다른 경로로 잇는다.
- **필요한 사실**: 키 자체가 아니라 **키가 환경에 존재하는지**만 필요하다(값은 요구 · 출력 · 기록하지 않는다).
- **선택지**: (가) 로컬 조사용으로 환경변수 OPENDART_API_KEY 설정 · (나) 자동 재검증까지 하려면 같은 이름의 GitHub Actions Secret 등록 · (다) 두 가지 모두
- **영향**: 정책 없음 / Risk 간접(확정되면 일부 Benchmark 상태가 바뀔 수 있음) / MC 없음 / UI 없음
- **구현 필요**: 없음 - 스크립트는 이미 준비됐다(scripts/closeout/research/opendart-etf-docs.js · 운용사 고유번호 4곳 기록 완료)
- **테스트**: node scripts/closeout/research/opendart-etf-docs.js(설정 여부만 출력)
- **검증**: node scripts/closeout/research/opendart-fetch-facts.js · 기록 docs/closeout/research/opendart-etf-facts.json
- **근거**: docs/closeout/research/opendart-feasibility.json actualRun
- **마지막 확인일**: 2026-09-20

### 도구 · 조사 역량

#### P-15 — PDF 원문 텍스트 추출 수단 부재

- **현재 판정**: COMPLETED → **최종 SOLVED** · **단계**: PHASE 1
- **SoT**: 계획서 §0-1(가능한 경로를 끝까지 조사)
- **현재 구현**: 조사 전용 임시 폴더(저장소 밖)에 PDF 파서를 설치해 해소했다. package.json · 앱 번들 · CI · production 무변경. 이 수단으로 ICE Benchmark Statement와 운용사 투자설명서 PDF를 실제로 읽어 여러 Fact를 확정했다.
- **문제**: 해결됨.
- **필요한 사실**: 없음(도구 문제)
- **선택지**: (가) poppler-utils 설치(사용자 승인 필요 · 시스템 변경) · (나) 조사용 임시 폴더에 PDF 파서 npm 패키지 설치(저장소 의존성 추가 없음) · (다) HTML로 제공되는 공식 경로만 사용하고 PDF 전용 사실은 NOT_AVAILABLE 후보로 처리
- **영향**: 정책 없음 / Risk 간접(미확정 Fact가 남는다) / MC 없음 / UI 없음
- **구현 필요**: (나)는 저장소를 건드리지 않고 가능하다
- **테스트**: 해당 없음
- **검증**: ICE Benchmark Statement(17p) · 삼성 투자설명서 3건(66~75p) · 미래에셋 투자설명서(57p) 텍스트 추출 성공
- **근거**: docs/closeout/research/etf-facts.json prospectus 필드
- **마지막 확인일**: 2026-09-20

### 정책 충돌

#### P-16 — Bond 설계와 기존 정책 3건의 충돌(§7 σ=0 · Risk 대상 · 제10조 베타)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 6
- **SoT**: §7 · §9-2 BOND-DEF-03 · §44 제10조 · js/09 RISK_ELIGIBLE_CATEGORIES
- **현재 구현**: 정책 충돌 3건을 SoT 개정으로 처리했다 - §47-1(Risk 대상: Equity/Bond 분리) · §47-2(§44 제10조 개정: coverage 표기) · §47-3(§7 채권 σ=0 폐지 · §37 riskProvider).
- **문제**: 해결됨. 각 개정에 CURRENT/PROBLEM/DECISION/IMPLEMENTATION/IMPACT/REGRESSION/ROLLBACK을 기록했다.
- **필요한 사실**: 없음
- **선택지**: 각 충돌을 BOND-2 · BOND-4 · BOND-5 결정과 함께 처리하고, 채택 시 체크리스트 해당 절을 개정한다 · 현행 정책 유지(그 경우 Bond 구현 범위가 축소된다)
- **영향**: 정책 §7 · §44 제10조 · Risk 대상 정의 / Risk 채권 편입 · 포트폴리오 베타 / MC 채권 σ / UI 위험 카드 · 베타 표시
- **구현 필요**: 결정 후 SoT 개정 + 구현
- **테스트**: risk · mc 회귀 전후 측정
- **검증**: Unit 589/589 · E2E 1029/1032(잔여 3건은 이번 변경의 기대값 갱신 대상) · ESLint 0 · Data Guard PASS · Release Guard는 버전 미변경이라 의도적으로 FAIL(최종 릴리스 때 1회 상향)
- **근거**: docs/closeout/research/PM_SOLUTION_CLOSURE.md §12
- **마지막 확인일**: 2026-09-20

### Risk · 표시

#### F-7 — 위험 기여도 음수 0 처리(§39-3 보류 묶음에서 분리)

- **현재 판정**: SOLVED → **최종 SOLVED** · **단계**: PHASE 7
- **SoT**: §39-3 · §44 위험 기여도
- **현재 구현**: js/09 computeRiskContributions에서 Math.max(0, …) 제거. 합이 0 근처면 만들지 않는다(0으로 나누기 방지).
- **문제**: 해결됨. 음수 기여도는 "값이 없는 것"이 아니라 "위험을 낮췄다"는 사실이다. 자르지 않아야 합이 100%로 맞는다(정의상 포트폴리오 베타=1).
- **영향**: 정책 표시 / Risk 기여도 값 / MC 없음 / UI 위험 상세
- **구현 필요**: 없음(종결)
- **테스트**: test/risk-observation-windows.test.js
- **검증**: test/risk-observation-windows.test.js의 F-7 테스트(음수 표시 · 합 100%)
- **근거**: §47-12
- **마지막 확인일**: 2026-09-20

