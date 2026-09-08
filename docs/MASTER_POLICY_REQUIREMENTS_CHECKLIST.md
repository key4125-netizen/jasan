# 자산관리앱 Master Policy & Requirements Checklist

> Project Governance / Source of Truth  
> Project: 자산관리앱 업그레이드  
> 기준일: 2026-09-08  
>
> **Source-safe edition:** 실제 사용자 금융정보·실제 자산금액·실제 거래정보를 포함하지 않으며, Git repository에 저장할 수 있는 정책/거버넌스 기준만 담는다.

## 0. Governance — 절대 규칙

- **GOV-01** Master Policy & Requirements Checklist를 프로젝트 공식 거버넌스 체크리스트로 사용한다.
- **GOV-02** 모든 Claude Code 작업지시, 코드 리뷰, 구현 판단, 우선순위, Release 판단은 본 체크리스트를 먼저 확인한다.
- **GOV-03** 향후 확정되는 정책·요구사항은 반드시 본 체크리스트에 추가한다.
- **GOV-04** 해결된 항목도 삭제하지 않고 `RESOLVED`로 상태를 기록한다.
- **GOV-05** 체크리스트가 추가/변경되면 사용자에게 업데이트된 체크리스트를 제시한다.
- **GOV-06** 위 거버넌스 규칙은 프로젝트 종료까지 유지한다.
- **GOV-07** 새 요청은 기존 정책/요구사항/OPEN/DROP 항목과 충돌·중복·범위확장을 먼저 점검한다.
- **GOV-08** Claude Code의 제안은 PM 승인 전 확정 정책으로 간주하지 않는다.
- **GOV-09** PM 승인 없는 기능 확장 및 범위 확대를 하지 않는다.

## 1. Product Constitution

목표:
> 경제를 잘 모르고 투자 경험이 거의 없는 사회초년생도 쉽게 사용할 수 있지만, 계산은 정확하고, 위험은 숨기지 않으며, 결과에 대해 과도한 확신을 갖지 않도록 만드는 장기 자산관리 시뮬레이션 앱.

우선순위:
1. 초보자 사용성
2. 계산 정확성
3. 안전성
4. 결과의 정직성
5. 유지보수성
6. 고급 기능

핵심 원칙:
- 복잡성은 내부에 숨기고 화면은 단순하게 한다.
- 기능 존재보다 사용자가 발견·이해·정확히 사용·오해하지 않는지가 중요하다.
- 정책에 없는 기능을 임의로 추가하지 않는다.

## 2. UX Constitution

- Mobile First
- Dark Mode First
- 노안/가독성 우선
- 초보자 이해 우선
- Desktop은 이후 대응하되 기능을 희생하지 않는다.
- 375px 기준에서 읽기 쉬워야 한다.
- 숫자·경고·버튼·입력은 명확하고 높은 대비로 표현한다.
- 색상만으로 상태를 전달하지 않는다.
- 화면은 Settings / Diagnosis / Execution / Results / Safety / Explanation의 역할을 구분한다.
- 카드 남발 대신 기존 화면에 통합한다.
- 모바일에서 글자를 축소해 밀어 넣지 않고 접기/단순화/점진적 공개를 사용한다.
- 최종 검수 우선순위: 모바일 낮/밤 → 태블릿 낮/밤 → 데스크톱.

## 3. Current Project Baseline

- V1.2-A FINAL RELEASE: v222 / commit `33641d6`
- V1.1 FINAL FREEZE 완료
- V1.0 FINAL 완료
- 현재 V1.2-B는 **자산/거래내역 정합성** 중심.
- 현재 우선순위: BL-17 → BL-18 → BL-19 correction-path UX.
- V1.2-B에서는 대규모 UX/기능 확장을 하지 않는다.

## 4. Current V1.2-A Resolved

### C1 Macro staleness — RESOLVED
- 각 매크로 지표별 마지막 성공 조회 시각을 관리한다.
- 조회 실패 시 기존 값과 마지막 성공 시각을 유지한다.
- 최초 조회 실패는 `- / 조회 전`.
- v222 production 검증 완료.

### C2 Macro/Risk distinction — RESOLVED
고정 문구:
> 매크로 동향과 보유자산 위험은 서로 다른 기준으로 계산됩니다. 매크로 동향은 현재 시장환경을, 보유자산 위험은 내 자산의 위험 특성을 보여줍니다.

### C4 threshold disclosure — RESOLVED
고정 문구:
> ※ 위 구간은 시장에서 널리 참고되는 범위를 바탕으로 한 설명용 기준이며, 절대적인 위험 기준은 아닙니다.

### V1.2-A scope boundary
- Macro→Risk 정량 연결 금지.
- 새 Risk Score 설계 금지.
- 대규모 sector map 확장 금지.
- 신규 Macro indicator 추가 금지.
- AI/CMA 자동화 등 범위 외 기능 금지.

## 5. V1.2-B — Current Scope

### BL-17 Category confirmation — **RESOLVED** (v223)

정책 방향(PM 확정):
> 시스템은 확인되지 않은 자산 분류를 확인된 사실처럼 저장해서는 안 된다. 입력 단계에서 추천은 가능하지만, 추천과 확정은 구분한다.

필수 원칙:
- 기존 데이터 자동 마이그레이션 금지.
- 기존 데이터의 출처가 불명확하다고 사후 추정하여 확정하지 않는다.
- 추천값 ≠ 확정값.
- 미확정 상태의 영향은 deterministic / MC / Risk / Return Key / rebalance / price lookup / daily P&L / dashboard / Macro / Safety 전반을 영향 분석한 후 결정한다.
- backward compatibility를 유지한다.
- 사용자 화면에는 내부 구현 용어를 그대로 노출하지 않는다.
- 구현 전 반드시 READ-ONLY policy design audit을 거친다.

**확정된 상태 모델**: `category`(값) + `categorySource`(`'user'` | `'system'` | 필드 자체 없음=legacy, `positionSource`와 동일 패턴).
- 신규 자산 폼 저장(추가/수정 공용) → 항상 `categorySource='user'`(추천값을 그대로 받아들여도 저장 = 확정).
- Excel 셀에 지원되는 값이 있으면 `user`, 비어있거나 지원하지 않는 값이면 `classifyCategory` 추천 + `system`.
- JSON append/overwrite·Cloud sync(pull/push/최초 페어링) 전부 `resolveImportedCategory`(js/01) 하나로 통일 판단.
- Cloud 병합은 기존 `positionSource`/`buyRate`와 같은 `MERGE_PRESERVE_IF_ABSENT` one-way 보존 규칙에 `categorySource`를 추가하는 방식으로 재사용(새 필드 단위 병합 체계 신설 없음).
- **Excel 재업로드 category 처리 정책(PM 재확정)**: "기존 사용자 확정값은 빈 Excel 셀 때문에 사라지지 않는다. 그러나 새로운 category 값이 명시되어 있는 경우에는 해당 입력을 우선 처리하며, 지원되지 않는 값은 시스템 추천으로 대체하고 사용자 확정으로 승격하지 않는다." 판단 기준은 오직 "이번 파일이 이 행의 category 칸에 뭐라도(공백 제외) 적어 뒀는가" 하나뿐 — 칸이 비었으면 기존 category/categorySource를 종류(user/system/legacy) 불문 그대로 보존하고, 칸에 값이 있으면(유효하든 지원하지 않는 값이든) 그 입력에 대한 판단(유효=user, 오염=classifyCategory 결과+system)을 그대로 채택한다. `carryOverCategorySource`(js/12)가 이 규칙을 구현하며, JSON append에도 동일 규칙을 재사용한다(Excel/JSON 경로가 다르게 판단하지 않도록).
- 기존 legacy 데이터(`categorySource` 필드 자체가 없음)는 자동 migration하지 않음 — user/system 어느 쪽으로도 소급 확정하지 않음.

**구현 완료(코드)**: `js/01-core-state.js`(상태 모델·`makeAsset`), `js/07-table-render-modals.js`(폼 저장), `js/12-import-export-sync.js`(Excel/JSON/Cloud 경로 + `carryOverCategorySource` 재설계), `test/category-source.test.js`(신규 unit 21건), `e2e/69-v12b-bl17-category-confirmation.spec.js`(신규 e2e 11건). 계산 로직(`js/05/06/08/09/10/11`)은 전혀 변경하지 않음 — `category==='부동산'` 판정/Return Key 매핑/Risk universe/rebalance 모집단 전부 기존 코드 그대로 유지.

**해결된 충돌**: `carryOverCategorySource`의 최초 구현("기존 user는 무조건 보호")이 기존 `e2e/53` "P0-1-2"(시트 오염값 → classifyCategory 자동분류 폴백) 정책과 충돌했던 것을 위 "이 칸에 뭐라도 적혀 있는가" 기준으로 재설계해 해결 — `e2e/53` 12개 테스트 전부 기존 정책 그대로 PASS 확인, 기존 테스트를 수정/삭제하지 않음.

**미확정(system) category의 계산 처리 정책**: 이번 구현 범위에 포함하지 않음(별도 PM Decision Gate 사항) - 계산 로직은 전혀 변경하지 않았으므로 현재 계산 결과는 이번 변경 전후 완전히 동일함.

**Cloud Sync category/categorySource 결합 오류 수정(Option A, PM 승인)**: Cloud sync record-level merge에서 승자(remote) 레코드가 `categorySource`를 몰랐던 구버전이면, 예전 구현은 `categorySource`만 로컬에서 옮겨와 **로컬이 확인한 적 없는 remote의 category 값에 로컬의 'user' 표식이 붙는** 결합 오류가 있었다(PM Cloud Sync Audit에서 실측 재현: local=ETF/user, remote=주식/legacy(newer) → 결과가 category='주식', categorySource='user'로 뒤섞임 — "확인되지 않은 분류를 확인된 사실처럼 저장" 정책 위반).
- **원인**: `category`(값)와 `categorySource`(확정 표식)는 반드시 같은 논리적 쌍으로 취급해야 하는데, `MERGE_PRESERVE_IF_ABSENT`가 `categorySource`를 `positionSource`/`buyRate`와 같은 개별 필드로 다뤄 값과 표식이 서로 다른 레코드에서 결합될 수 있었다. (`positionSource`는 "자동 덮어쓰기 금지"라는 행동 보호 선언이라 어떤 값이 붙어도 의미가 안 깨지지만, `categorySource='user'`는 "그 값을 사용자가 확인했다"는 검증 주장이라 값과 분리되면 주장 자체가 거짓이 된다 — 같은 merge mechanism이어도 semantic 위험은 다름을 확인.)
- **수정(Option A)**: `categorySource`를 `MERGE_PRESERVE_IF_ABSENT`에서 제거(`['positionSource','buyRate']`만 남음). `mergeCollectionById`(js/12)에 전용 규칙 추가 — `remoteWins && picked.categorySource===undefined && local.categorySource!==undefined`일 때만 `category`와 `categorySource`를 **항상 함께** local에서 이월. 기존 record-level LWW 구조·field-level merge 미도입 원칙·`positionSource`/`buyRate` 처리는 전혀 변경하지 않음.
- **검증**: 핵심 재현(local user+remote legacy) 포함 12개 케이스 매트릭스 전부 실측 확인(단위 테스트 T1~T9 + 실제 브라우저 `mergeCollectionById`/`mergeAssetsAndTransactionsWithRemote` 직접 호출) — category/categorySource가 서로 다른 record에서 결합되는 경로 제거, legacy 자동 승격 없음, 기존 확정값 소실 없음.

**핵심 회귀 테스트**: `test/category-source.test.js`(27건, T1~T9가 Cloud merge pair invariant 전담), `e2e/69-v12b-bl17-category-confirmation.spec.js`(11건). 전체 Unit 245/245, E2E 659/659, ESLint 0, Data Guard PASS.

**Release**: v223 — `sw.js` CACHE_NAME / `index.html` appVersionLabel 함께 범프, Release Guard PASS.

**상태**: **PM 최종 승인 완료(RESOLVED).** 구현·회귀 검증·Cloud Sync 결합 오류 수정·v223 릴리즈 전부 완료.

### BL-18 Asset/ledger consistency — OPEN / P1

현재 이슈:
- asset과 transaction이 서로 다른 시점의 상태를 가질 수 있다.
- Cloud merge가 asset/transaction을 독립 병합한 뒤 `syncAssetsFromTransactions`를 다시 호출하지 않는다.
- ledger asset의 quantity/buyPrice가 transaction과 불일치해도 일부 경로에서는 감지되지 않는다.

원칙:
- 자동 덮어쓰기는 SoT 분석 후 결정한다.
- 자산 데이터 손실이 없어야 한다.
- 동시/원격 병합 경로까지 검증한다.

### BL-19 correction-path UX — OPEN / P2
- LEDGER_UNKNOWN 경고는 존재한다.
- 거래내역 수정으로 교정할 수 있지만 현재 경고에서 그 경로를 충분히 안내하지 않는다.
- 구현 전 BL-17/18 영향과 함께 최소 UX 개선안을 확정한다.

## 6. V1.1 SoT / Data Preservation — RESOLVED

- `positionSource` (`ledger` | `manual` | legacy undefined) 도입.
- manual 자산은 transaction 존재 여부와 관계없이 사용자가 자산 자체를 수정/삭제할 수 있다.
- transaction은 manual 자산의 SoT가 아니며, 존재 시 진단 정보로만 활용한다.
- Excel category / buyRate / id / duplicate ID 처리 완료.
- Excel merge preservation 완료.
- remote sync에서 local absent fields를 보존하는 one-way remote-wins 정책 적용.
- V1.1 핵심 목적:
  > 사용자가 입력한 자산 정보가 어떤 경로로도 조용히 사라지지 않고, 미래예측이 실제 계좌 구조와 같은 범위를 계산하도록 기존 기능을 완성한다.

## 7. Monte Carlo / Future Projection

기본 구조:
- monthly precision
- 10k default
- UI 5k / 10k / 50k
- seeded RNG default `20260101`
- annual rebalancing
- order: contribution → target allocation → correlated shock → gross return → fee → annual rebalancing → milestone snapshot
- inflation은 engine 외부 milestone에서 적용
- GBM은 geometric/median-like annual growth 가정
- correlation은 date-aligned daily returns + Pearson + PSD correction + Cholesky
- missing observations <10 → corr 0 + Safety WARNING
- bond/cash sigma 0은 의도적일 수 있으므로 데이터 부족과 구분
- goal probability = samples >= goal / n
- deterministic와 MC는 경제적으로 동일하지 않다.

### Tax MC — REQUIRED THREE SCOPES
반드시 세 가지를 별도로 지원한다.
1. 일반계좌/과세계좌 MC
2. 절세계좌 MC
3. 일반계좌 + 절세계좌 통합 MC

통합 MC:
- P50 단순 합산 금지.
- 동일 simulation path/sample에서 일반계좌와 절세계좌를 집계하여 combined distribution과 goal probability를 산출한다.
- contribution / allocation / rebalancing scope을 명확히 분리한다.
- 중복/누락 asset이 없어야 한다.
- 결과 화면에 scope를 명확히 표시한다.

## 8. Asset Assumption Policy

- US_EQUITY V1.0: Vanguard VCMM 기반 4.1 / 5.1 / 6.0 유지.
- Dev ex-US / EM는 Vanguard 기반 key.
- Samsung system Alpha는 제거.
- KOSPI/KOSDAQ은 기존 정책 유지.
- unknown/unresolved는 지원되는 가정이 없으면 0%로 계산하되 UI에 경고한다.
- CASH fall-through 금지.
- blind regional fallback 금지.
- Return Key와 asset character 연결은 명시적으로 검증한다.
- BOND.STOCK은 user-defined scenario key이며 system default Return Key로 오용하지 않는다.

## 9. Bond Domain — BACKLOG / 별도 단계

본 항목은 V1.2-B의 현재 범위를 무리하게 확장하지 않는다.

필요한 별도 bond domain audit:
- 개별채와 채권 ETF를 구분한다.
- 개별채: 발행가격, 매입가격, 액면/수량, 표면금리, 지급주기, 만기일, 매입일, 세금 기준, 만기상환, 중도매도, YTM, 이자수령, 만기 후 재투자.
- 정부채와 회사채를 구분한다.
- BOND Return Key의 정의를 재검토한다.
- BOND.STOCK은 일반 채권 Return Key로 대체하지 않는다.
- 채권 ETF에 주식 기술적 위험 규칙/주식 benchmark를 무비판적으로 적용하지 않는다.
- KIS API는 발행정보/상세조회에 선택적으로 사용하되 계산은 API 실패와 독립되어야 한다.
- 전역 refresh에 개별 채권 상세조회/검색을 넣지 않는다.
- 금리·가격·YTM·현금흐름·만기상환·중도매도·재투자·신용위험 모델을 먼저 정의한 후 UI를 설계한다.
- Bond domain은 별도 Phase에서 PM 승인 후 진행한다.

## 10. Macro / Risk

현재 macro:
- VIX, USDKRW, US10Y, gold, DXY, KOSPI, KOSDAQ, S&P500, Nasdaq, Dow
- rule-based beginner commentary
- cache 및 last-success timestamp

Risk:
- holdings-based advanced risk
- stock/ETF 중심
- concentration / volatility / loss / market / correlation / technical 등
- VaR/CVaR 자체 분포
- missing data는 null과 0을 구분
- stress benchmark drop × beta
- confidence는 missingness 등을 고려

정책:
- Macro→Risk 정량 연결 금지.
- Macro 설명과 보유자산 Risk는 별도 기준임을 명시한다.
- 새로운 Risk Score redesign 금지.

## 11. Security / Release

보안 사고 S-01:
- 과거 실제 사용자 자산 파일이 GitHub history에 잠시 노출되었던 사건.
- 현재는 사용자 통제 범위 내 종결.
- 민감 파일 현재 URL 404 및 history 제거 검증 완료.
- "절대적으로 복사본이 없다"라고 주장하지 않는다.
- 사용자는 GitHub Support 요청을 하지 않기로 결정했다.
- 민감한 사용자 금융정보와 실제 자산 데이터는 source repository에 저장하지 않는다.

Release gate:
- Unit
- E2E
- ESLint
- Data Guard
- Release Guard
- Production smoke
- sensitive-file 404
- Service Worker/version marker
- network/security isolation

## 12. Actual Asset Golden Reference — SOURCE SAFE POLICY

실제 사용자 자산 Golden Reference는 별도의 안전한 사용자 제공 자료로 관리한다.

**이 source-safe checklist에는 다음을 저장하지 않는다.**
- 실제 총 자산 평가금액
- 개인별/가구별 자산금액
- 실제 보유수량
- 실제 거래내역
- 실제 계좌정보
- 개인 금융정보
- 사용자별 민감 데이터

필요한 경우 source에는 다음과 같은 정책적 원칙만 기록한다.

- 실제 자산 facts는 source code에 하드코딩하지 않는다.
- 대표 matching key는 정책/구조 검증 목적으로만 관리한다.
- 실제 사용자 데이터는 별도 안전한 자료에서 검증한다.
- Rate 값은 정책 데이터이며 PM 승인 없이 자동 덮어쓰지 않는다.

## 13. Out-of-Scope / DROP

다음은 PM 승인 없이는 추가하지 않는다.
- AI 기능
- local AI on mobile
- CMA 자동 업데이트
- 실시간 데이터 redesign
- 대규모 sector map expansion
- 새 Macro indicator
- Macro→Risk 정량 결합
- 새 Risk Score
- 주식 Alpha / NASDAQ premium / SCHD premium 임의 추가
- 과도한 계좌 segmentation
- 전문가용 CMA research platform
- 기능성 카드/화면의 무분별한 추가

## 14. PM Decision Gate

Claude Code가 다음 중 하나를 발견하면 구현하지 말고 PM에게 STOP 보고:
- 기존 정책과 충돌
- SoT가 불명확
- 계산 결과에 큰 영향을 주는 모델 변경
- 데이터 손실 가능성
- 보안/개인정보 위험
- 사용자 입력 의미가 바뀜
- 신규 기능/범위 확장
- 여러 모듈에 걸친 대규모 구조 변경

보고 형식:
1. 발견사항
2. 영향
3. 정책 충돌 여부
4. 선택지
5. PM 결정 필요 여부
6. 권고안

## 15. Change Log / Status

- V1.0 FINAL — RESOLVED
- V1.1 FINAL — RESOLVED
- V1.2-A v222 — RESOLVED / FINAL RELEASE PASS
- V1.2-B BL-17 — **RESOLVED / v223 RELEASE PASS**
- V1.2-B BL-18 — OPEN
- V1.2-B BL-19 — OPEN
- Bond domain — BACKLOG / 별도 Phase
- Tax MC 3-scope — REQUIRED / 구현 시 반드시 체크

## 16. Source Repository Data-Safety Rule

이 파일 자체가 GitHub source repository에 들어가는 정책 문서이므로,
문서 작성/수정 시에도 다음을 적용한다.

- 실제 사용자 금융정보를 추가하지 않는다.
- 실제 자산금액을 추가하지 않는다.
- 실제 거래내역을 추가하지 않는다.
- 개인정보·credential·secret·token·API key를 추가하지 않는다.
- Golden Reference의 존재와 검증 원칙만 유지한다.
- 개인 데이터가 필요한 테스트는 별도 안전한 테스트 fixture 또는
  합성 데이터로 수행한다.
