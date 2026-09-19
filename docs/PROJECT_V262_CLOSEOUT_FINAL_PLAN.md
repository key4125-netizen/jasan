# 자산관리앱 업그레이드 v262 → 전체 미결사항 종결 통합작업계획서 (FINAL · PM APPROVED)

> **등록 정보**
> - 기준일: 2026-09-20
> - 상태: **FINAL · PM APPROVED — 본 프로젝트의 기준문서(작업계획서)**
> - 등록 시점 Production: v262 (release commit `b9ff90e`) · main `d4459a7`
> - 공식 SoT(정책 원문)는 여전히 `docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md`이며,
>   본 문서는 그 SoT를 **어떻게 종결까지 실행할 것인가**를 규정하는 실행 기준문서다.
> - 등록 시점에는 **어떤 코드·데이터·정책 변경도 수행하지 않았다**(문서 등록만).
> - 본문은 PM이 확정한 원문 그대로이며, 임의 수정·요약·해석 추가를 하지 않는다.

---

## 0. 문서 목적 및 프로젝트 정의

본 문서는 현재 Production v262를 기준으로,
자산관리앱에 남아 있는 모든 미결사항을 하나의 프로젝트 안에서
조사·검증·구현·회귀검증하여 최종 종결하기 위한 PM 최종 계획서이다.

이번 프로젝트는 미결사항을 관리하는 프로젝트가 아니다.

"모든 미결사항을 해결하여 프로젝트를 종료하는 프로젝트"이다.

현재 확인된 모든 미결사항은 본 프로젝트 범위에 포함한다.

프로젝트 종료 시 각 항목은 반드시 다음 중 하나의 최종 상태가 되어야 한다.

1. COMPLETED
2. RETAINED
3. NOT_AVAILABLE
4. PM DECISION RESOLVED

최종 종료 시 다음 상태를 남기지 않는다.

- HOLD
- BACKLOG
- FUTURE
- TBD
- TO REVIEW
- 조사 중
- 다음 프로젝트에서 처리
- 나중에 확인

### 0-1. "데이터가 없다"에 대한 최상위 원칙

이번 프로젝트에서는 현재 사용 중인 API나 데이터 소스에서
데이터가 나오지 않는다는 이유만으로 미결사항을 NOT_AVAILABLE로
종결하지 않는다.

각 미결사항에 대해 다음의 검증 가능한 경로를 끝까지 조사한다.

- 공식 규제기관
- 거래소
- 발행사
- 운용사
- 지수 제공기관
- 금융투자 관련 공식기관
- 공식 API
- 공개 역사 시계열
- 기존 확보 데이터
- 합법적인 대체 데이터
- 직접 계산 가능한 역사 데이터
- 기타 검증 가능한 대체 경로

실제로 수신하고,
정의를 확인하고,
품질을 확인하고,
이용조건을 확인하고,
운영 적용 가능성을 확인하고,
필요하면 직접 계산하고,
교차검증하고,
실제 적용하고,
회귀검증한다.

그 결과에도 불구하고 객관적으로 사용할 수 없는 경우에만
NOT_AVAILABLE로 종결한다.

단순 API 부재 = NOT_AVAILABLE가 아니다.

"자료가 없어서 포기"는 해결로 인정하지 않는다.

그러나 존재하지 않는 값이나 확인되지 않은 사실을
추정하여 채우는 것 역시 절대로 해결로 인정하지 않는다.

### 0-2. 해결의 두 가지 절대 원칙

① 가능한 모든 검증 가능한 방법을 찾아 끝까지 해결한다.

② 없는 값을 만들어내지 않는다.

예:

금지
- PR을 TR로 간주
- TR을 PR로 간주
- 확인되지 않은 hedge를 추정
- 거래소 상장만으로 benchmark 결정
- 상관관계가 높다는 이유로 동일 index로 간주
- 출처 없는 숫자 생성
- 임의 보간값을 공식 데이터처럼 사용

허용
- 실제 역사 데이터로 drawdown 직접 계산
- 공식 공시에서 hedge 여부 확인
- 공식 index methodology에서 PR/TR 확인
- 여러 공식 자료를 교차검증
- 검증된 대체 source 사용
- 실제 수신 가능한 공개 역사 데이터에서 파생값 계산

---

## 1. PM 최상위 원칙

1-1. 이번 프로젝트는 전체 미결사항 종결 프로젝트다.

1-2. 불필요한 기능 확장과 범위 확장은 금지한다.

1-3. 기존 정책은 명시적인 PM 변경 없이 변경하지 않는다.

1-4. 데이터 변경과 정책 변경을 구분한다.

1-5. 자동 수집과 자동 적용을 구분한다.

1-6. 명확한 결정론적 사실은 승인된 규칙에 따라 자동 ACTIVE 가능하다.

1-7. 기존 확정 사실의 철회·변경·충돌은 자동 ACTIVE하지 않는다.

1-8. Risk 변경이 MC에 영향을 미칠 가능성이 있더라도 MC 정책을 자동 변경하지 않는다.

1-9. Bond는 Stock Risk 모델을 복사하지 않는다.

1-10. 사용자 금융정보와 비밀값을 저장소에 넣지 않는다.

1-11. 모든 계산 변경은 동일 조건의 before/after 회귀검증을 수행한다.

1-12. 최종 목표는 "빠른 종료"가 아니라 "정확한 종결"이다.

---

## 2. 공식 SoT 및 우선순위

최우선 SoT:

`docs/MASTER_POLICY_REQUIREMENTS_CHECKLIST.md`

보조 기준:

- CLAUDE.md
- 기존 PM Decision
- 현재 Production 코드
- 테스트
- 회귀 기준선
- 현재 Master
- 현재 운영 데이터

충돌 발생 시 임의 해석 금지.

다음 상황에서는 PM STOP:

- SoT와 구현의 정책 충돌
- 계산 결과에 영향을 주는 정책 변경
- 사용자 입력 의미 변경
- 데이터 손실 위험
- 보안/개인정보 위험
- 기존 정책을 뒤집는 변경
- 새로운 기능으로 범위 확장
- 정책 근거 없는 대규모 구조 변경

---

## 3. 현재 Production 기준

현재 Production: v262

Release commit: `b9ff90e`

Handover: `725a00e`

main: `725a00e`

현재 Production: 정상

현재 working tree: `.claude/launch.json` 사용자 로컬 변경만 존재

`.claude/launch.json`: 절대 수정·삭제·복구·revert·commit하지 않는다.

---

## 4. Git / Branch / Release 전략

통합 작업 브랜치:

`integration/v262-closeout`

4-1. `integration/v262-closeout`는 origin push를 허용한다.

4-2. PC 2대를 오가는 작업을 고려하여 integration branch를 원격에 보존한다.

4-3. 단계별 commit/push를 허용한다.

4-4. main merge/push는 최종 Production release에서 단 1회 수행한다.

4-5. integration branch push는 GitHub Pages Production 배포를 발생시키지 않는다.

4-6. force push 금지.

4-7. reset/rebase/destructive checkout 금지.

4-8. 중간 version bump 금지.

4-9. 최종 모든 변경이 끝난 뒤 단 한 번 final version bump.

4-10. 최종 Production release 이전에는 main을 배포 목적으로 변경하지 않는다.

---

## 5. 프로젝트 기간 자동 Workflow 통제

현재 종목마스터/CMA 관련 자동 workflow가 저장소 또는 데이터 기준선을
변경할 수 있으므로 프로젝트 기간 동안 통제한다.

특히 종목마스터 workflow:

**2026-10-01 00:00 UTC**

이전까지 반드시 DRY-RUN 또는 integration branch 방식으로 전환한다.

CMA 자동 확인도 동일 원칙으로 통제한다.

목적은 자동화를 폐기하는 것이 아니다.

프로젝트 종료 후 승인된 자동화 구조로 복귀한다.

프로젝트 중:

자동 main commit → 금지

자동 데이터 생성 → dry-run artifact 또는 integration branch 우선

---

## 6. 세션 간 인계 규칙

이번 프로젝트는 최종 Production release가 마지막 한 번이므로
기존 "release 후 handover"만으로는 충분하지 않다.

매 세션 종료 시 다음 세션이 즉시 작업을 이어받을 수 있도록
현재 상태를 integration branch에 보존한다.

최소 기록:

① 전체 미결사항 종결 대장 최신 상태
② 이번 세션 완료사항
③ 진행 중인 작업
④ 다음 착수 지점
⑤ PM 결정 대기사항
⑥ 주요 조사 결과
⑦ 테스트/회귀 상태
⑧ 변경 commit

문서 변경이 발생한 경우 해당 문서를 commit/push한다.

코드/문서 변경이 전혀 없는 단순 확인 세션은 의미 없는 빈 commit을 만들지 않는다.

핵심 원칙:

"매 세션마다 억지 commit"이 아니라
"매 세션 종료 시 최신 프로젝트 상태를 원격에서 복구할 수 있어야 한다."

---

## 7. 외부 데이터 수집 준수 정책

외부 데이터 수집 전 각 source의 최신 이용조건을 확인한다.

확인 대상:

- 이용약관
- robots 정책
- API 정책
- 요청 속도 제한
- User-Agent 요구사항
- 저장/재배포 조건
- 상업적/비상업적 사용 조건

각 source별 확인 결과를 기록한다.

요청 속도는 해당 제공기관의 최신 공식 제한 이하로 운영한다.

특정 수치를 임의로 고정하지 않는다.

재시도 정책:

- 재시도 횟수 상한
- exponential backoff
- 반복 실패 시 중지
- 원인 기록

을 적용한다.

수집 범위는 원칙적으로:

① Exposure Master 등록 종목
② 사용자 보유 종목
③ 사용자 목표 종목

으로 제한한다.

전 종목 크롤링 금지.

종목 master 전체 16,731건을 자동 판정 대상으로 확대하지 않는다.

---

## 8. 외부 원문 문서 저장 정책

투자설명서, Fact Sheet, 공시 PDF 등 원문을 저장소에 그대로 commit하지 않는다.

저장하는 정보:

- source URL
- 문서 제목/식별자
- 취득일
- document hash
- evidence grade
- 판정에 사용한 최소 근거
- 판정 결과

원문 재확인이 필요한 경우 URL과 hash를 이용하여 다시 취득한다.

최소 인용만 기록한다.

불필요한 원문 복제 금지.

---

## 9. 개인정보 / 연락처 처리

SEC 등 외부 서비스가 연락처/User-Agent 정보를 요구하더라도
사용자 개인정보를 source code에 넣지 않는다.

연락처는:

- GitHub Actions Secret
- 실행 환경 변수

등으로 주입한다.

다음에 기록하지 않는다.

- source code
- commit
- fixture
- regression output
- 종결 대장
- 테스트 결과
- 공개 artifact

---

## 10. 자동 판정 대상 및 실행 예산

자동 판정/재검증 대상은 다음으로 제한한다.

① Exposure Master 등록 종목
② 사용자 보유 종목
③ 사용자 목표 종목

실행별로:

- 요청 수
- 실행 시간
- 재시도 횟수
- 실패 수

를 기록한다.

실행 상한을 초과할 경우 자동으로 계속 실행하지 않고 분할 실행한다.

목적:

- API 비용 통제
- 외부 source 부하 방지
- 실행 시간 통제
- 프로젝트 범위 통제

---

## 11. 외부 데이터 상태 표준

외부 데이터는 단순 "수신 성공"만으로 ACTIVE하지 않는다.

기본 상태 흐름:

DISCOVERED → ACCESS_VERIFIED → QUALITY_VERIFIED → POLICY_VERIFIED → ACTIVE

실패 예:

DISCOVERED → ACCESS_VERIFIED → QUALITY_FAILED → NOT_AVAILABLE

충돌 예:

DISCOVERED → CONFLICT → REVIEW → PM DECISION → ACTIVE

중요:

수신 가능 ≠ 사용 가능

정의 일치 + 품질 + 이용조건 + 운영 안정성 까지 확인되어야 ACTIVE다.

---

## 12. Rule Version 변경 및 소급 처리

판정 규칙 자체가 변경되는 경우 기존 결과를 자동으로 덮어쓰지 않는다.

절차:

RuleVersion 변경 → 전체 영향 대상 재평가 → 기존 결과 vs 신규 결과 비교 → 차이 목록 생성

명확한 신규 사실/확정 증가 방향: 자동 ACTIVE 가능

기존 확정 사실 철회: REVIEW

기존 확정 사실의 의미 변경: REVIEW

자료 충돌: REVIEW

영향 대상이 정상 범위를 초과하는 경우: pipeline STOP → 원인 확인 → 필요시 PM DECISION

모든 rule 변경은 ruleVersion을 기록한다.

---

## 13. PHASE 0 — 전체 재감사 및 기준선 고정

PHASE 0은 실제 실행의 첫 단계다.

산출물:

① `integration/v262-closeout` 생성 및 origin push
② 자동 workflow DRY-RUN 전환
③ v262 frozen data snapshot
④ regression harness
⑤ 전체 미결사항 종결 대장 초판
⑥ 데이터 경로 조사 착수표

13-1. 전체 OPEN 재추출

SoT + 코드 + 테스트 + 문서 + workflow + Master 를 전수 재감사한다.

13-2. 이미 해결된 항목도 종결 대장에 기록한다.

포함:

- v262 Production release
- 0052D0 currency/region
- 0052D0 KRX ticker normalization
- 국내 우선주 처리 — PM ④ 현행 유지
- jsDelivr purge — 별도 조치하지 않고 자연 만료
- `.claude/launch.json` 유지
- 기존 Risk/MC invariant
- 기존 PM Decisions

13-3. 알려진 데이터 조사 결과도 착수표에 포함한다.

예:

- 네이버 KOSPI200 시계열
- Yahoo ^IXIC 장기 이력
- KRX 데이터 경로
- FRED 데이터 경로

13-4. 기존 목록과 새롭게 발견된 OPEN 항목을 통합한다.

13-5. 중복 ID를 제거한다.

---

## 14. v262 Frozen Regression Dataset

v262 기준선을 고정한다.

특히:

- H.10
- ticker-master
- Exposure Master
- Index Master
- Risk fixture
- MC 관련 입력
- 필요한 기타 data file

을 snapshot한다.

각 파일:

- source
- 기준일
- 생성/취득일
- hash
- snapshot version

을 기록한다.

H.10은 매주 갱신되므로 현재 운영 파일을 그대로 regression baseline으로 사용하지 않는다.

---

## 15. Frozen Baseline vs Current Data

두 테스트를 완전히 분리한다.

**A. FROZEN BASELINE** — 목적: 코드/정책 변경에 따른 결과 변화 판단

**B. CURRENT DATA** — 목적: 현재 운영 데이터에서 실제 상태 확인

예:

H.10 갱신으로 결과가 변경된 경우 → DATA CHANGE

코드 변경으로 결과가 변경된 경우 → CODE CHANGE

정책 변경으로 결과가 변경된 경우 → POLICY CHANGE

세 가지를 혼합하지 않는다.

---

## 16. 회귀 하네스

최소 비교:

- Risk fixture
- Risk score
- volatility
- VaR
- CVaR
- MDD
- Sortino
- correlation
- portfolio beta
- benchmark resolution
- Exposure Master
- Index Master
- Return Key
- MC asset-class input
- MC 주요 결과

MC는 동일 seed / 동일 portfolio 조건을 유지한다.

기존 49/49 asset-class invariant를 검증한다.

모든 계산 변경은 before/after measurement log를 생성한다.

---

## 17. PHASE 1 — 데이터 경로 및 결정 패키지

모든 정책을 프로젝트 시작 전에 일괄 확정하지 않는다.

각 미결 영역별로:

- 현재 사실
- 후보 방법
- 데이터 경로
- 실제 수신 여부
- 공식성
- 이용조건
- 품질
- 갱신주기
- 대체 경로
- 정책 영향
- Risk 영향
- MC 영향
- UI 영향
- 구현 방법
- 회귀 방법
- PM 결정 필요 여부

를 작성한다.

PHASE 1의 목적은 "조사했다"가 아니라 "실제로 어떻게 종결할 것인지 결정했다"이다.

---

## 18. 자동 데이터 업데이트 / 자동 적용

자동 수집과 자동 적용을 분리한다.

18-1. 자동 ACTIVE 가능

- 명확한 신규 사실
- UNRESOLVED → ACTIVE
- 승인된 deterministic correction
- SoT 규칙으로 결과가 하나로 결정되는 경우

18-2. 자동 ACTIVE 금지

- 기존 확정 사실 철회
- 기존 benchmark 변경
- PR/TR 의미 변경
- hedge status 변경
- Exposure 의미 변경
- index identity 변경
- 공식 자료 간 충돌

절차:

CHANGE_DETECTED → IMPACT_ANALYSIS → REVIEW → PM DECISION 필요 시 결정 → ACTIVE

18-3. 대량 이상 변경

실제 정상 변경분포를 먼저 측정한다.

그 후 정상범위를 벗어나는 대량 변경을 pipeline STOP 조건으로 설정한다.

임의의 고정 N건을 사전에 박지 않는다.

---

## 19. D-1 — 미국 개별주 HOME_COMMON

미국 개별주의 benchmark unresolved 문제를 해결한다.

판정 상태:

HOME_COMMON / NOT_HOME_COMMON / REVIEW / UNRESOLVED

사용 source:

- SEC EDGAR
- issuer official source
- exchange/official source
- 필요한 기타 공식 자료

종목별 기록:

- ticker
- issuer
- SEC identifier
- security identifier
- listing
- source
- evidence date
- evidence grade
- ruleVersion
- result

명확한 경우: 자동 ACTIVE

애매하거나 충돌: REVIEW

거래소 상장만으로 HOME_COMMON 판정 금지.

---

## 20. D-2 / D-6 — NYSE Composite

NYSE Composite를 조사한다.

후보:

Yahoo `^NYA`
기타 공식/합법 source

실제 역사 데이터를 확인한다.

Index Master 등록 시:

- identifier
- symbol
- index name
- source
- definition
- currency
- price definition
- availability
- license
- refresh cycle

기록.

절대 원칙:

NYSE listing ≠ NYSE Composite benchmark

HOME_COMMON이 확정되고 승인된 resolver가 있는 경우에만 listing-market benchmark를 사용한다.

---

## 21. D-3 / D-4 / ETF Fact 전수 해결

조사 대상:

- SCHD
- SPYM
- 278530
- 0052D0
- 360750
- 368590
- 360200
- 458730
- 487230
- 237370
- 472170
- 069500
- 102110

각각:

- underlying index
- PR/TR
- hedge status
- currency
- source
- evidence grade
- historical data
- license
- refresh cycle

확인.

국내 ETF:

- 운용사
- 투자설명서
- 집합투자규약
- 금융투자협회
- 거래소
- index provider

미국 ETF:

- issuer
- SEC filings
- index provider
- official fact sheet
- official methodology

등을 사용한다.

확인되지 않은 값은 추정하지 않는다.

---

## 22. D-5 — KOSPI200 PR / TR

069500 / 102110:

KOSPI200 PR source를 조사한다.

후보:

- 네이버
- KRX
- 운용사
- 기타 공식 source

KOSPI200 TR:

- KIS
- KRX
- 운용사
- 기타 공식 source

를 조사한다.

278530 KODEX 200TR과 KOSPI200 TR도 별도로 검증한다.

PR과 TR을 절대로 혼동하지 않는다.

---

## 23. Index Master source availability

현재 unavailable:

- KOSPI200_TR
- DJ_KOREA_DIV30_PR
- ISELECT_US_AI_POWER_PR
- DJ_US_DIV100_PR

각 항목을 다시 전수 조사한다.

단계:

source 발견 → 실제 수신 → 정의 확인 → 역사성 확인 → 품질 → 이용조건 → 운영 가능성 → ACTIVE / NOT_AVAILABLE 판정

단순 현재 API 미지원으로 종료하지 않는다.

---

## 24. NASDAQ Composite Stress

새로운 임의 숫자를 입력하지 않는다.

Yahoo `^IXIC` 등 실제 역사 데이터를 사용하여 drawdown을 직접 계산한다.

최소:

- 2020
- 2022
- 전체 available history

각 결과:

- source
- period
- high
- low
- drawdown
- formula
- 기준일
- data hash

를 기록한다.

KOSPI/KOSDAQ/S&P500/NASDAQ100도 동일 계산 정의로 검증한다.

---

## 25. Hedge / PR / TR A등급

368590 · 360200 의 hedge 여부를 조사한다.

360750 · SCHD 의 PR/TR을 조사한다.

공식 자료:

- 운용사
- 투자설명서
- 집합투자규약
- 금융투자협회
- index provider
- official fact sheet

등을 사용한다.

A등급 근거가 확인된 경우에만 ACTIVE한다.

---

## 26. B-1~B-4 KIS / Worker Security

B-1: KIS Worker secret rotation / Origin allowlist / Rate limit / Fail-closed / Redeploy

B-2: KIS index API terms / data redistribution terms

B-3: Asset proxy Worker CORS

B-4: Sync Worker CORS / rate limit

비밀값은 코드/문서에 기록하지 않는다.

KIS terms가 확인되지 않은 데이터는 운영 저장/재배포하지 않는다.

---

## 27. Risk 미결사항

조사/해결:

- beta observation period
- volatility observation period
- VaR/MDD period
- Yahoo stability
- adjusted close
- Dimson lag0+1
- beta unavailable diagnostics
- benchmark diagnostics
- stress
- FX
- portfolio beta

F-1 상태 구분:

- benchmark unresolved
- price source unavailable
- insufficient common dates
- invalid price
- calculation failure
- other

F-2: Dimson lag0+1 정의 및 산출기간을 필요한 수준으로 표시한다.

---

## 28. CMA 2026Q2

CMA-2026.1을 현재 기준으로 유지한다.

CMA 2026Q2:

- source
- date
- asset class
- return
- volatility
- correlation
- methodology

를 조사한다.

활성화 여부는 PM decision package로 결정한다.

승인 없이 MC 계산값 변경 금지.

변경 시: old CMA → new CMA → same seed → same portfolio → before/after → regression

---

## 29. C-2 MC FX

현재 FX=0 / hedge cost=0 처리 구조를 확인한다.

조사:

- 미국 단기금리
- 한국 단기금리
- FX
- hedge cost

데이터가 충분한 경우 정책을 만든다.

임의 hedge cost 생성 금지.

정책 변경 시 PM 승인 + 동일 seed regression.

---

## 30. C-3 Observation Period

Risk:

- volatility
- beta
- VaR
- MDD

각 기간을 데이터 안정성과 통계적 적합성 관점에서 조사한다.

현재 1y/2y/3y 구조의 필요성을 재검토한다.

변경 시 before/after regression.

---

## 31. Bond — N-1 전체 종결

Bond는 독립 도메인이다.

31-1. 경제적 정의 — Hold-to-Maturity / Mark-to-Market 분리.

31-2. Bond Fact Ledger

- identifier
- issuer
- maturity
- coupon
- coupon type
- duration
- credit
- currency
- price
- yield
- market value
- acquisition value

등.

31-3. 데이터

- 금융투자협회 채권정보센터
- 한국자산평가
- KRX
- 기타 공식/합법 source

31-4. Risk

- rate sensitivity
- duration
- credit
- spread
- currency

Stock Beta 복사 금지.

31-5. Score — Bond Score 포함 여부를 정책 결정.

31-6. MC

- expected return
- volatility
- correlation
- currency
- foreign bond
- Return Key

별도 검토.

31-7. Mixed Product — 237370 · 472170 의 1:N exposure 검토.

31-8. NOT_AVAILABLE

가능한 모든 경로 조사 후에도 법적·기술적·품질상 실제 적용이 불가능한 경우만 허용.

반드시:

- 조사 경로
- 실패 이유
- 이용조건
- 대체 경로
- 현재 안전한 동작
- 재개 조건

기록.

31-9. Bond UI — currentPrice 자동 업데이트 등 Bond 관련 UI를 확정된 Bond 정책에 맞춰 처리한다.

---

## 32. C-4 Backtest / 장기 패널

Backtest 구현 전:

- source
- license
- storage
- history depth
- reproducibility

확인.

후보:

- Kenneth French
- FRED
- 기타 공식/공개 source

사용조건을 확인한 뒤 적용한다.

---

## 33. Q-1 Storage

ticker-master localStorage 압력을 실제 환경에서 검증한다.

검토:

- Chrome
- Safari/iOS
- QuotaExceeded
- persistAssets
- setItem 경로

실제 문제 확인 후 최소 변경.

Risk/MC/Return Key 의미 변경이 발생하면 PM STOP.

---

## 34. Q-2 Snapshot Retention

`sam_daily_snapshot_v1` 누적 문제를 확인한다.

필요하면 최소 retention 정책을 만든다.

기존 사용자 데이터 의미 훼손 금지.

---

## 35. Q-3 / Q-4 / Q-5

Q-3: Risk alert popup 연결 상태 조사. 정책상 필요 없는 dead code라면 최소 범위에서 정리.

Q-4: 숨겨진 Stress/What-If와 main card plan check note를 현행 정책과 대조. 불필요한 기능 활성화 금지.

Q-5: jsDelivr cache/version 동작 검토. cache duration / refresh / device cache / application behavior 확인. 필요 시 최소 cache/version 전략으로 해결.

---

## 36. G-1~G-6 Code Hygiene

G-1: old `getBenchmarkKeyForTicker` path 조사/종결.

G-2: APP_SHELL 외 13개 js runtime caching 확인.

G-3: N-02 Excel categorySource 문제 정책 확인 후 결정.

G-4: FIX-3-FULL historical chart gaps 종결.

G-5: KIS financial lookup numeric-only 문제 확인.

G-6: 8644가 local Playwright static server configuration인지 확인. Production 문제 아니면 RETAINED.

---

## 37. Return Key / Benchmark / Asset Class 분리

다음 개념을 분리한다.

Return Key ≠ Risk Benchmark ≠ Underlying Index ≠ MC Asset Class ≠ CMA Asset Class

사용자 지정 Return Key 보존.

자동 matching과 사용자 입력 구분.

blank ≠ 0%

Benchmark 변경으로 Return Key 자동 변경 금지.

Exposure Master 변경으로 Return Key 자동 변경 금지.

---

## 38. Exposure Master / Index Master

Exposure Master:

- benchmark
- evidence
- evidence grade
- listing
- asset character
- required fact

등을 관리한다.

Index Master:

- identifier
- name
- symbol
- source
- currency
- price definition
- availability
- evidence
- license
- refresh cycle

관리.

Master 변경:

Master change → impact analysis → benchmark reevaluation → MC impact analysis → regression

---

## 39. Mixed Product 1:N

237370 · 472170 등을 공식 자료로 확인한다.

실제 구성비를 확인한다.

단일 benchmark로 강제하지 않는다.

Risk와 MC가 동일 exposure interpretation을 공유할 수 있는지 검토하되
모델 목적에 따라 필요한 차이는 유지한다.

---

## 40. UI 종결

F-1: Beta unavailable reason 구분

F-2: Dimson beta 설명

F-3: fixed toast가 popup button을 가리는 문제

F-4: Bond currentPrice auto update 안내

F-5: DEFINITION_MISMATCH / PR/TR unknown 상태

현재 0건이라도 실제 정책상 필요한 상태만 최소 구현.

---

## 41. STOP 대기 중 독립 작업

PM Decision이 필요한 항목이 발생하더라도 프로젝트 전체를 무조건 STOP하지 않는다.

원칙:

의존성이 있는 항목 → STOP

독립적으로 진행 가능한 항목 → 계속 진행

단, PM 결정 결과가 영향을 줄 수 있는 작업은 영향 범위를 확인하고 진행한다.

PM STOP은 필요한 범위로 최소화한다.

---

## 42. 계산 변경 Measurement Log

모든 Risk/MC/정책 관련 계산 변경은 기록한다.

CHANGE ID

Before: code / data snapshot / policy / result

After: code / data snapshot / policy / result

Difference: metric / absolute difference / relative difference / reason

Classification: intended / unintended / data-only / code-only / policy-driven

---

## 43. 종결 대장 자동 정합성 검사

최종 감사 전에 자동 검사를 수행한다.

각 Issue ID가 다음과 연결되는지 확인한다.

Issue ID ↔ SoT section ↔ implementation/reference ↔ test/reference ↔ evidence ↔ final status

누락/불일치 발견 시 종결하지 않는다.

---

## 44. Final Release 전 Release Guard

프로젝트 중간 단계에서 app shell 변경 때문에 발생하는
version/cache mismatch Release Guard FAIL은 예상 상태다.

최종 Release 직전에는 반드시 PASS.

필수:

- Unit
- Full E2E
- ESLint
- Data Guard
- Release Guard
- Risk regression
- MC regression
- production smoke
- Service Worker/version marker
- network/security isolation
- sensitive file check

---

## 45. 최종 Rollback 정책

최종 Production release 전 rollback 계획을 문서화한다.

중요:

Service Worker 특성상 version을 과거 번호로 내리지 않는다.

예:

v266 Production → 문제 발생 → v262 코드 상태로 복구 → 새로운 version v267 → v267 rollback release

즉:

"코드를 이전 정상 상태로 되돌리되 버전 번호는 더 높은 새 버전을 사용한다."

Rollback 기준:

- 앱 boot failure
- 핵심 데이터 손상
- Risk 계산 오류
- MC 계산 오류
- 사용자 입력 의미 훼손
- Service Worker 오류
- 보안 문제
- 주요 Production 기능 장애

Rollback 절차:

1. 문제 확인
2. 영향 범위 판단
3. rollback decision
4. 정상 commit 상태로 코드 복구
5. 새 version number
6. build
7. Unit/E2E
8. Data Guard
9. Release Guard
10. deploy
11. Service Worker 확인
12. production smoke
13. incident 기록

---

## 46. 사용자 영향 고지

최종 릴리스 산출물에 사용자 영향 고지를 포함한다.

최소 내용:

① 무엇이 변경되었는가
② 왜 변경되었는가
③ 사용자에게 어떤 숫자/화면 변화가 발생할 수 있는가
④ Risk/Beta/MC 관련 변화
⑤ 데이터/정책 기준
⑥ 필요한 경우 사용자가 확인해야 할 사항

별도 대형 기능을 개발하지 않는다.

기존 앱의 Release Note 또는 적절한 기존 고지 방식으로 처리한다.

특히 Risk Score/Beta/MC 수치가 변경되는 경우 사용자가 변경 이유를 이해할 수 있어야 한다.

---

## 47. 최종 Production Release

모든 미결사항이 종결된 후 단 한 번 최종 Production release를 수행한다.

순서:

1. 전체 issue ledger 종결
2. SoT update
3. CLAUDE update
4. final code integration
5. final version bump
6. Unit
7. Full E2E
8. ESLint
9. Data Guard
10. Release Guard
11. Risk regression
12. MC regression
13. Storage check
14. Security check
15. user impact note
16. production build
17. main merge/push
18. GitHub Pages deployment
19. Service Worker upgrade
20. production smoke
21. final issue ledger audit
22. handover
23. project closure

---

## 48. Final Baseline 재생성

최종 Production release 이후 v262 Frozen Baseline을 삭제하지 않는다.

v262 snapshot: 역사적 회귀 기준으로 영구 보존.

최종 Production Current Data를 이용하여 새로운 Production Baseline을 생성한다.

구조:

v262 Frozen Baseline + Final Production Baseline

두 기준선을 모두 보존한다.

Final Baseline 생성 시:

- 데이터 기준일
- file hash
- Risk result
- MC result
- Master state
- version
- release commit

기록.

---

## 49. 자동화 최종 운영

프로젝트 종료 후 승인된 자동화 구조로 복귀한다.

정상 신규 사실: 자동 ACTIVE 가능

기존 확정 사실 변경: CHANGE_DETECTED → IMPACT_ANALYSIS → REVIEW

정책 변경: PM DECISION

대량 이상 변경: PIPELINE STOP

모든 자동화 결과는:

- source
- date
- evidence
- ruleVersion
- result
- change
- impact

추적 가능해야 한다.

---

## 50. 프로젝트 실행 순서

**PHASE 0** 전체 OPEN 재감사 + integration branch + workflow 통제 + v262 frozen baseline + regression harness + 종결 대장

**PHASE 1** 데이터 경로 전수 조사 + 결정 패키지

**PHASE 2** Master / evidence / automation infrastructure

**PHASE 3** US individual stocks + NYSE Composite + ETF + Index + PR/TR + Hedge

**PHASE 4** Risk + Stress + Observation period + Beta diagnostics

**PHASE 5** CMA + MC FX + MC policy

**PHASE 6** Bond + Mixed Product

**PHASE 7** Storage + UI + Code hygiene + CDN

**PHASE 8** Automatic revalidation

**PHASE 9** 전체 regression

**PHASE 10** 전체 issue ledger final audit

**PHASE 11** SoT / CLAUDE / documentation

**PHASE 12** Final Production Release

PHASE 번호는 실행 순서를 위한 내부 관리 단위다.

어떤 항목도 다음 프로젝트로 이관하는 의미가 아니다.

---

## 51. 최종 종결 상태 정의

**COMPLETED** : 실제 구현 및 검증 완료.

**RETAINED** : 현재 정책/동작을 유지하는 것이 맞음을 검증 완료.

**NOT_AVAILABLE** : 가능한 모든 검증 가능한 경로를 조사했으나 객관적으로 운영 적용이 불가능함을 입증 완료. 대체 경로 및 재개 조건 포함.

**PM DECISION RESOLVED** : 정책 선택 완료 및 그 결정에 따른 구현/유지 완료.

NOT_AVAILABLE의 필수 조건:

- 조사 경로 기록
- 접근 가능성 확인
- 이용조건 확인
- 품질 확인
- 대체 경로 확인
- 적용 불가능 사유
- 현재 안전한 동작
- 재개 조건

단순 "자료 없음"은 인정하지 않는다.

---

## 52. 재개 조건

NOT_AVAILABLE 항목은 재개 조건을 기록한다.

예:

- 공식 API 공개
- 데이터 제공 시작
- 운용사 공시 제공
- 거래소 제공
- KIS 이용조건 승인
- 라이선스 확보
- 데이터 품질 개선

재개 조건은 현재 프로젝트의 미결사항을 의미하지 않는다.

객관적 NOT_AVAILABLE 판정이 완료되면 현재 프로젝트에서는 종결된 것으로 기록한다.

---

## 53. 최종 성공 기준

[정책] 모든 정책 미결사항 결정 완료.

[데이터] 모든 데이터 미결사항 해결 또는 객관적으로 입증된 NOT_AVAILABLE 완료.

[자동화] 필요한 자동 revalidation 완료.

[Risk] benchmark / beta / stress / observation period 검증 완료.

[MC] 정책 및 입력/결과 영향 검증 완료.

[Bond] Bond 정책 및 가능한 범위의 구현/종결 완료.

[UI] 필요한 사용자 상태/오류/설명 완료.

[Storage] 실사용 환경 저장공간 위험 검증 완료.

[Security] KIS / Worker 관련 보안 위험 종결.

[Code] legacy / policy-inconsistent path 종결.

[Regression] Frozen baseline과 Current Data를 구분한 전체 회귀검증 완료.

[Documentation] SoT / CLAUDE / issue ledger / handover 완료.

[User Communication] 최종 변경사항 및 사용자 영향 고지 완료.

[Release] 최종 Release Guard PASS.

[Production] Production smoke PASS.

[Project] OPEN / HOLD / BACKLOG / FUTURE = 0.

---

## 54. PM 최종 지시

이번 프로젝트에서는 미결사항을 뒤로 미루지 않는다.

"데이터가 없다"를 결론으로 먼저 쓰지 않는다.

가능한 모든 검증 가능한 경로를 조사한다.

실제 데이터를 확보한다.

정의를 확인한다.

이용조건을 확인한다.

품질을 확인한다.

대체 경로를 확인한다.

직접 계산할 수 있으면 직접 계산한다.

교차검증한다.

실제 적용한다.

회귀검증한다.

문서화한다.

그리고 종결한다.

그러나 없는 값을 만들어내지 않는다.

이번 프로젝트의 핵심은 다음 두 원칙의 동시 준수다.

> **"어떻게 해서든 검증 가능한 방법을 찾아 해결한다."**
> **+**
> **"검증되지 않은 값은 절대로 만들어내지 않는다."**

이번 프로젝트의 최종 목적은:

v262 → 전체 미결사항 재감사 → 해결방법 전수 탐색 → 실제 데이터 확보 → 정책 결정 → 구현 → 자동화 → Risk 검증 → MC 검증 → Bond 검증 → UI/Storage/Security 검증 → 전체 회귀검증 → 사용자 영향 고지 → 최종 Production Release → 최종 Baseline 생성 → 프로젝트 완전 종결

이다.

최종 Production release는 모든 종결 조건을 충족한 뒤 단 1회 수행한다.

그 이후에는 본 프로젝트를 종료하고, 승인된 자동화 운영 체계만 유지한다.

---

## 55. FINAL PM APPROVAL

본 문서를 자산관리앱 업그레이드 v262 → 전체 미결사항 종결 프로젝트의
최종 작업계획서로 확정한다.

Claude Code는 본 계획에 따라 작업한다.

단, 다음 상황에서는 즉시 PM STOP:

- SoT 충돌
- 정책 변경 필요
- 계산 결과 의미 변경
- 데이터 손실 위험
- 보안/개인정보 위험
- 범위 확장
- 외부 데이터 이용조건 위반 가능성
- 자동화 대량 이상 변경
- 사용자 입력 의미 변경

그 외의 조사·구현·검증은 본 계획 범위 안에서 중단 없이 진행한다.

PM Decision 대기 항목이 발생한 경우 해당 항목과 의존 항목만 STOP하고
독립적인 작업은 계속한다.

모든 작업은 `integration/v262-closeout`에 보존한다.

main은 최종 릴리스에서만 갱신한다.

최종적으로 모든 미결사항을 종결하고 Production release와 최종 handover를 완료한 뒤
프로젝트를 종료한다.

---

**END OF FINAL PM APPROVED PLAN**
