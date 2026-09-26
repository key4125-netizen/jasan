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
- 우선순위였던 BL-17 → BL-18은 각각 v224 / v225로 **RESOLVED** — 아래 5장 참고.
- **V1.2-B closeout**: BL-17(v224)/BL-18(v225) 두 항목 모두 RESOLVED로 확정. BL-19 correction-path UX는 그 closeout 범위에 포함되지 않았고, 이후 **V1.3에서 PM 승인 하에 Option 1(TEXT-ONLY)로 구현되어 v226으로 RESOLVED** 되었다(§5 참고).
- **다음 작업 우선순위(PM 확정)**: ① RET-02(Return Key 정기 검토 거버넌스 — §8-1~8-3, **확정 완료**) → ② RET-03(전체 Return Key 정책 감사 + PM Decision — §8-4, **확정 완료 / 값 변경 0건**) → ③ **FUTURE-P1(Monte Carlo 중심 미래예측 구조 개편 — 진입 승인, 다음 단계)** → ④ BOND-P1 → ⑤ FX-P1 → ⑥ UX-P1. 앞 단계가 끝났다는 사실이 다음 단계의 착수/변경을 자동 승인하지 않는다(FUTURE-P1은 §8-4 RET-03-09로 진입이 명시 승인됨).
- **V1.3 — CLOSED**: BL-19(v226) · P1-1 위험점수 범위 고지(v226) 두 항목을 릴리즈하고 종료했다. Bond Domain은 READ-ONLY audit + Decision Gate만 수행했고 **production code는 변경하지 않았다** — BOND-DEF-01~05의 PM 최종 결정은 §9-3 참고. V1.3 종료가 Bond 구현 착수 승인을 의미하지 않으며, 다음 단계는 PM이 별도로 결정한다.
- V1.2-B에서는 대규모 UX/기능 확장을 하지 않는다.
- **현재 production: v243**(2026-09-15) — v238 과거 이력 무결성(§25) · v239 신규 시작 안정화(§26) · v240 일별 이력 복구 제거 · 클라우드 데이터 초기화(§27) · v241 총자산 추이 Daily Valuation(§28) · v242 일별 손익 추이 Daily Valuation · 두 팝업 기간 통일(§29) · v243 P1-1 동기화 차이 확인 · 사용자 확정(§30, commit `ce40c06`). 아래는 당시 기록이다 — **이전 기록: 현재 production: v237**(2026-09-13). v236 = 일별 이력 복구 **안전성 수정의 코드 배포**(§22), v237 = 매크로 브리핑 UX 단순화 **RELEASE ACCEPTED**(§23). **실제 사용자 데이터에 대한 Recovery Apply는 BLOCKED**이며, v236 Recovery 문제는 **해결 완료가 아니다**. 현재 상태 요약은 §24.

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

### BL-17 Category confirmation — **RESOLVED** (v224, 최초 기능 릴리즈는 v223)

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

**상태(v223 시점)**: PM 최종 승인 완료(RESOLVED). 구현·회귀 검증·Cloud Sync 결합 오류 수정·v223 릴리즈 전부 완료.

**v224 Persistence Hotfix(BL-18 READ-ONLY 감사 중 발견, RESOLVED)**: v223 릴리즈 이후 `persistAssets()`(js/01)의 localStorage 저장 whitelist에 `category`는 있었지만 `categorySource`가 빠져 있었던 것이 확인됨 — 사용자가 폼에서 확정한 `categorySource='user'`가 새로고침/브라우저 재시작 한 번이면 조용히 legacy(표식 없음)로 되돌아가는 결함이었다(같은 탭 세션 안에서는 메모리의 `state.assets`가 멀쩡해 e2e/69의 기존 A~G 테스트가 이 결함을 잡아내지 못했음). `positionSource`가 이미 그 목록에 있던 것과 동일한 이유로 `categorySource`를 저장 목록에 추가하는 최소 수정으로 해결 — 그 외 serialization 구조·category 분류 알고리즘·Excel/JSON/Cloud merge 로직은 전혀 변경하지 않음.
- **구현**: `js/01-core-state.js`(`persistAssets()` 한 줄 추가).
- **신규 회귀 테스트**: `test/category-source.test.js`에 실제 localStorage round-trip 단위 테스트(H-1~H-4) 추가, `e2e/69-v12b-bl17-category-confirmation.spec.js`에 실제 `page.reload()`를 수행하는 e2e 테스트(H-1~H-4) 추가 — 기존 e2e/69가 reload를 포함하지 않아 이 결함을 놓쳤던 점을 반영.
- **검증**: Unit 249/249, E2E 663/663, ESLint 0, Data Guard PASS, Release Guard PASS. 수정을 임시로 되돌려 정확히 이 신규 테스트들만 실패함을 확인해 회귀탐지력 검증. Cloud Sync category/categorySource pair 핵심 회귀(local ETF/user + remote 주식/legacy(newer) → ETF/user)도 재확인, 무변경.
- **Release**: v224 — commit `da1948e`. Production 실측: 실제 GitHub Pages에서 `categorySource='user'` 자산 seed → 실제 새로고침 → 유지 확인, legacy는 undefined 유지 확인, pageerror 0.
- **상태**: **PM 최종 승인 완료(RESOLVED).**

### BL-18 Asset/ledger consistency — **RESOLVED** (v225)

현재 이슈(원본, READ-ONLY 감사에서 확인 — 기록 보존):
- asset과 transaction이 서로 다른 시점의 상태를 가질 수 있다.
- Cloud merge가 asset/transaction을 독립 병합한 뒤 `syncAssetsFromTransactions`를 다시 호출하지 않는다.
- ledger asset의 quantity/buyPrice가 transaction과 불일치해도 일부 경로에서는 감지되지 않는다.

원칙(원본, 기록 보존):
- 자동 덮어쓰기는 SoT 분석 후 결정한다.
- 자산 데이터 손실이 없어야 한다.
- 동시/원격 병합 경로까지 검증한다.

**PM 결정(Option A 승인)**: Cloud merge는 boot과 동일하게 "이 기기 사용자가 지금 이 자산의 거래를 직접 건드리지 않은" 이벤트이므로, `mergeAssetsAndTransactionsWithRemote()`(js/12)가 asset/transaction/부가데이터 병합을 모두 마친 뒤 기존 함수 `syncAssetsFromTransactions({ auto: true })`를 그대로 호출한다 — 새 SoT 모델이나 merge framework를 만들지 않고, 거래 추가/수정/삭제/부팅 때 이미 쓰던 것과 같은 함수를 이 경로에도 동일하게 재사용.
- **핵심 재현**: 공통 tx1(buy10) + 로컬 tx2(sell3, quantity=7) + 원격 tx3(buy5, newer, quantity=15) → Cloud merge 직후 병합된 거래 전체(10-3+5) 기준 `asset.quantity=12`로 정정됨(수정 전에는 우연히 timestamp가 최신인 쪽의 15가 그대로 남았음).
- **보존된 기존 정책**: `positionSource='manual'` 자산은 `auto` 값과 무관하게 이 함수가 항상 보호(BL-8, 변경 없음) — 관련 거래가 병합되어도 quantity/buyPrice/buyRate 불변. `positionSource===undefined`(legacy) 자산은 `auto:true`이므로 boot(D-3)과 동일하게 보호 — 값 불변, ledger로 자동 승격되지 않음. `category`/`categorySource`는 이 함수가 전혀 건드리지 않아 BL-17 pair 불변식과 무관.
- **구현(코드)**: `js/12-import-export-sync.js`(`mergeAssetsAndTransactionsWithRemote()` 끝에 `syncAssetsFromTransactions({ auto: true })` 한 줄 추가) 1개 파일뿐 — 계산엔진(`js/05/08/09/10/11`), Risk/Macro, category classifier, Excel/JSON 정책, Cloud merge의 record-level LWW 구조는 전혀 변경하지 않음.
- **신규 회귀 테스트**: `e2e/70-v12b-bl18-cloud-merge-ledger-sync.spec.js`(8건) — 실제 앱의 실제 함수(`mergeAssetsAndTransactionsWithRemote`/`syncAssetsFromTransactions`/`computePositionsAndRealizedPnL`/`calcRow`)를 실제 브라우저에서 직접 호출해 검증(등가 로직 복제 없음). 핵심 divergence(12로 정정), manual/legacy 보호, categorySource pair 보존, USD buyRate(단순 존재확인이 아니라 `computePositionsAndRealizedPnL`의 실제 가중평균값과 일치 확인), local 직접입력 경로와 Cloud merge 경로의 결과 동등성(추가/삭제), multi-owner 분리, 신규 ledger 자산 생성 시 `categorySource='system'`, 계산엔진(`calcRow`) 소비 확인을 모두 포함. 수정을 임시로 되돌려 보호-무관 케이스만 통과하고 나머지가 정확히 실패함을 확인해 회귀탐지력 검증.
- **검토했으나 채택하지 않은 대안**: Cloud merge 전용 별도 sync mode(Option C) — 기존 `auto:true`가 이미 정확히 필요한 정책 차이(legacy 보호)를 표현하므로 불필요하다고 판단, 새 abstraction 도입하지 않음.
- **테스트 구조 관련 PM 재검토**: 최초 구현 라운드에서 `js/01-core-state.js`/`js/06-transactions.js`에 Node 단위테스트용 `module.exports`를 추가했었으나, PM이 "production surface 불필요 증가" 가능성을 지적해 재검토 — 실제 브라우저 e2e만으로 등가 로직 복제 없이 완전히 검증 가능함을 확인하고 전량 되돌림(두 파일 모두 diff 0). 최종적으로 프로덕션 소스 변경은 `js/12-import-export-sync.js` 1개 파일, 기능 diff 1줄뿐.
- **검증**: Unit 249/249, E2E 671/671, ESLint 0, Data Guard PASS, Release Guard PASS. Production 실측(GitHub Pages, DNS 격리, 합성 데이터): 핵심 divergence(quantity=12), manual/legacy 보호, BL-17 categorySource 새로고침 후 유지, sensitive xlsx 404, pageerror 0 전부 확인.
- **Release**: v225 — commit `18c0295`.
- **잔여 미결(이번 범위 밖, 별도 유지)**: "같은 id가 기기마다 다른 positionSource를 가질 수 있는가"(이론적, 실제 발생 가능성 미확정) — 이번 release로 해결하지 않았으며 별도 미결 이슈로 유지한다.
- **상태**: **PM 최종 승인 완료(RESOLVED).**

### BL-19 correction-path UX — **RESOLVED** (v226)

현재 이슈(원본, 기록 보존):
- LEDGER_UNKNOWN 경고는 존재한다.
- 거래내역 수정으로 교정할 수 있지만 현재 경고에서 그 경로를 충분히 안내하지 않는다.
- 구현 전 BL-17/18 영향과 함께 최소 UX 개선안을 확정한다.

**PM 결정(Option 1 — TEXT-ONLY 승인)**: 경고 문구를 강화하되 자동 교정도, 이동 버튼/링크도 만들지 않는다. `assessPositionConsistency()`(js/06)의 판정 로직은 변경하지 않고, 그 함수가 **이미 계산해 반환하던** `ledgerQuantity`/`ledgerBuyPrice`를 현재 자산값과 나란히 보여주는 것으로 한정한다.
- **구현(코드)**: `js/08-detail-modal-fx.js` 1개 파일 — `renderAssetDetailPositionNotice()`에 상태별 상세 줄 조립(`buildPositionNoticeDetailLines()`)을 추가. `assessPositionConsistency()`·판정 기준·positionSource·게이팅 전부 무변경.
- **상태별 안내**: `LEDGER_UNKNOWN`/`MANUAL_WITH_TX` → "현재 자산 — 수량/매입단가" + "거래내역 기준 — 수량/매입단가" 대조 + 확인할 화면 안내. `MANUAL_WITH_TX`는 manual 자산이 SoT라는 사실(거래내역은 참고용)을 함께 안내한다(BL-8 유지). `LEDGER_WITHOUT_TX` → 대조값이 애초에 계산되지 않는 상태이므로 값 없이 "거래내역이 남아 있는지 확인" 안내만. `OWNER_UNASSIGNED` 등 BL-19 범위 밖 상태는 기존 문구 그대로.
- **내부 상태 코드 비노출**: `LEDGER_UNKNOWN` 같은 내부 코드명을 사용자 문구에 노출하지 않는다(e2e/71이 고정).
- **버튼/링크 0 유지**: `#assetDetailPositionNotice` 내부 `button/a = 0`이라는 기존 안전 정책(`e2e/52` F-UI, "자동 해결 버튼을 두지 않는다")을 그대로 유지했고, 그 assertion을 완화하지 않았다. 거래내역 탭으로의 이동은 버튼이 아니라 문장 안내로만 한다(PM이 Option 2를 명시적으로 제외).
- **신규 회귀 테스트**: `e2e/71-v13-bl19-position-notice-detail.spec.js`(6건) — 실제 값 일치(화면 숫자 = `assessPositionConsistency()` 실제 반환값), 상태별 문구, 내부 코드 비노출, `interactiveCount === 0`, 375px 다크모드 오버플로/폰트.
- **Release**: v226.
- **상태**: **PM 최종 승인 완료(RESOLVED).**

### P1-1 종합 위험점수 범위 고지 — **RESOLVED** (v226)

**배경(감사 정정 포함)**: Bond audit 과정에서 "종합 위험점수 헤드라인에 계산 대상 고지가 없다"고 보고했으나, 구현 착수 전 재확인 결과 **메인 RISK 카드에는 이미 존재**했다 — `#riskScopeNote`(index.html, 문구는 `updateRealEstateGuidanceText`(js/03)가 부동산 보유 여부에 따라 교체)가 RISK 헤드라인 바로 아래·점수 렌더 영역 바로 위에 상시 노출되며, `e2e/40` "5"가 이미 그 문구를 고정하고 있었다. **실제로 누락된 지점은 위험 경고 팝업(`riskAlertModal`) 한 곳**이었다.
- **구현(코드)**: `js/10-risk-translation-alerts.js` 1개 파일 — `openRiskAlertModal()`의 점수 박스에 "진단 대상: 주식·ETF 보유분만 해당(현금·채권·부동산 제외)" 한 줄 추가.
- **Risk 계산 무변경**: `RISK_ELIGIBLE_CATEGORIES`(`['주식','ETF']`, js/09) · 위험점수 산식 · 6대 요인 · Risk Universe 전부 그대로. 채권/현금/부동산을 Universe에 추가하지 않았고 Macro→Risk 정량 연결도 만들지 않았다.
- **기존 문구와의 관계**: 범위 고지(어떤 자산이 대상인가)와 기존 성격 고지("이 점수는 가격 변동 위험만 봅니다", Phase 39)는 서로 다른 축이며 충돌하지 않는다 — 둘 다 유지된다.
- **신규 회귀 테스트**: `e2e/72-v13-p1-1-risk-scope-notice.spec.js`(6건) — 카드·팝업 두 자리 모두 고지 노출, 채권/현금/부동산 비중이 큰 포트폴리오에서도 유지, Risk 계산값 불변, 기존 안내와 의미 충돌 없음, 375px 다크모드.
- **Release**: v226.
- **상태**: **PM 최종 승인 완료(RESOLVED).**

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
- 수익률(μ)은 기존 Return Key를 쓴다 - CMA Expected Return은 MC 직접 입력으로 쓰지 않는다(§37-5)
- volatility는 장기 CMA 자산군 변동성을 쓴다 - 종목 최근 가격이력 변동성을 쓰지 않는다(§37)
- correlation은 장기 CMA 상관(OFFICIAL_CMA_DIRECT → OFFICIAL_CMA_MAPPING → BENCHMARK_REFERENCE) + PSD correction + Cholesky(§37)
- 공식 CMA · 등록 Benchmark 어디에도 상관이 없거나 CMA 자산군이 없는 위험자산이 있으면 임의 값 없이 실행 전 오류로 알린다(§37)
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

### 7-1. FUTURE-P1 Phase 2-C — 계산 계층 구현 완료 기록 (2026-09-09)

위 "Tax MC — REQUIRED THREE SCOPES" 요구사항의 **계산 계층**이 구현·검증되었다(commit `e783568`, v227,
**push/deploy 미실행**). 새 요구사항을 추가한 기록이 아니라, 기존 요구사항의 충족 상태를 기록한 것이다.

- 일반계좌 = 기존과 동일한 연 1회 목표비중 리밸런싱. **General-only golden 39/39 무변경**
- 절세계좌 = deterministic `simulateTaxAdvantagedOwnerGrowth`와 같은 의미의 buy-and-hold. 초기 잔고는
  `state.assets`의 `calcRow(a).curAmount`, 납입은 기존 `taxAdvantagedPlan` 구조를 그대로 읽는다.
  절세계좌 target weight를 새로 만들지 않으며, 현재 보유 비중을 영구 target으로 쓰지 않는다
- 통합 = 같은 simulation path에서 두 계좌를 먼저 더한 뒤 그 분포에서 백분위/목표확률을 산출한다
  (P50 단순 합산 경로가 코드에 존재하지 않는다)
- instrument universe는 기존 `T:` / `N:` / `C:` 키 규칙 그대로 통합하며, 같은 종목은 하나로 merge되어
  같은 시장 충격을 받되 잔고는 계좌별로 분리 유지된다. 부동산·'공동' 자산은 계속 제외
- GBM·σ·상관행렬·Cholesky·Return Key·SoT **무변경**. inflation은 기존대로 js/20에서 범위별 post-transform
- UI는 최소 연결만 수행(계좌 범위별 중앙값 표시 + 기존 대표 숫자가 일반계좌 기준임을 명시).
  **UI/UX 전면 개편은 다음 Phase**이며 이 절이 그것을 승인하지 않는다

### 7-3. FUTURE-P1 Phase 3-2 / 3-3 — 미래예측 UI/UX 재구성과 통합검증 (2026-09-09, v228)

Phase 2-C에서 완성한 계산 계층을 **계산은 한 줄도 바꾸지 않고** 초보자가 올바르게 읽을 수 있도록
표시 구조만 재배치했다. `js/15` · `js/16` · `js/17` · `js/18` · `js/20` · `js/21` 변경 **0건**,
Return Key · SoT 변경 **0건**, General-only golden **39/39 유지**.

**Phase 3-2 — 구현**
- Monte Carlo를 미래예측의 주 결과로 승격(투자계획 입력 직후로 이동). **자동 실행은 하지 않는다**
  — 수 초~수십 초가 걸릴 수 있어 기존 수동 실행 정책을 유지하고, 대신 실행 전 초보자 안내
  (`#mcEmptyState`)를 둔다
- deterministic hero를 참고값으로 격하: 라벨 `${years}년 후 자산 참고값`, 브랜드 강조 해제,
  "수익률이 매년 일정하다고 가정한 단순 계산값(일반계좌 기준)"임을 화면에서 직접 설명
- P50 명칭을 `시뮬레이션 중앙값(P50)`으로 확정("예상자산" 표현 제거)
- 계좌 범위(일반계좌 / 절세계좌 / 통합) 선택과 기간(5·10·15·20년) 선택을 세그먼트 컨트롤로 제공.
  선택은 중앙값·기간별 표·범위 막대·목표 도달 가능성에 모두 연동된다
- Phase 2-C의 계좌 범위 금액 나열을 선택 컨트롤로 바꿔 **같은 금액이 두 번 표시되던 중복을 제거**
- P10~P90을 title 속성이 아니라 실제 화면 텍스트로 표시(터치 기기 대응). 표와 막대의 어휘 통일
  → **§31(PM 승인 2026-09-15)로 개정**: 화면 표시는 P10/P25/P50/P75(P25·P50 중심), P90은 계산·데이터·Safety에만 유지.
  "실제 화면 텍스트로 표시(title 의존 금지)" 원칙은 그대로다. 기본 계좌 범위도 §31에 따라 절세계좌가 있으면 통합
- Goal Probability를 보조 정보로 강등(브랜드색 해제 + "보조 정보" 테두리 박스, 위치를 분포표 뒤로)
- percentile(위치) ≠ probability(비율) 설명을 결과 바로 옆 항상-노출 문단에 배치
- deterministic 시나리오/그래프는 삭제하지 않고 "여기부터는 참고 계산입니다" 구역으로 후순위 배치
- 명목 / `현재가치 기준(물가상승률 N% 가정)` 구분 명시(js/20 변환식 무변경)

**Phase 3-3 — 통합검증(야간)**
- 실제 브라우저에서 Monte Carlo를 직접 실행해 확인: 클릭 158ms 내 진행 표시, 10,000회 완료,
  취소·재실행·범위/기간 전환 정상, 재실행 시 선택 상태가 기본값으로 복귀
- SoT 무변경 실측: MC 실행 전후 및 UI 조작 전후로 `state`/`localStorage` **바이트 동일**,
  범위·기간 선택은 localStorage에 저장되지 않는다(순수 화면 상태)
- 375 / 768 / 1024 × Light/Dark 6조합: 가로 overflow 0, 잘린 요소 0, 14px 미만 0
- Typography/줄바꿈 전수 감사: 어절 중간에서 끊기던 10곳을 `break-keep`/`whitespace-nowrap`으로 교정
  (글자 크기 축소·무차별 nowrap 없음). 표는 375px에서 가로 스크롤 없이 정확히 들어맞는다
- 재배치 때문에 사실과 어긋나게 된 안내 문구 2건 교정: Monte Carlo 설명 팝업의 위치 지시어,
  절세계좌 카드의 "별도로 계산됩니다"(→ 현재 현황 카드임을 명시하고 미래 분포는 MC로 안내)
- 핵심 터치 컨트롤 점검(I-3 게이트): 미래예측 실행 흐름에서 매번 조작하는 컨트롤 6종을 44px로
  맞췄다(MC 실행/취소, 시나리오·횟수 select, 목표금액 입력, 서브탭). 앱 전역 버튼 스타일은
  건드리지 않았고, 보조 아코디언 토글(33~37px)은 이번 범위에서 제외했다
- 계산 회귀 0건 / Data Guard PASS / 전체 E2E PASS

### 7-2. FUTURE-P1 Backlog

**FUTURE-P1-BL-01 — `runAnnualPreviewMC` taxScope compatibility**
- **상태: Deferred / Non-blocking**
- 사유: preview mode는 현재 production 사용자 경로에 존재하지 않는다. `startMonteCarloRun`의 production
  호출은 `mode: 'official'` 고정이며 저장소 전체에 preview 호출부가 없다 — 현재 사용자 영향 0
- 재검토 조건: preview mode가 실제 사용자 경로로 복원/활성화될 경우
- 범위 한정: preview 경로의 **호환성**만 검토한다. 별도의 금융모델 확장이나 새 계산 정책을 의미하지 않는다
- Phase 2-C에서는 코드를 수정하지 않았다

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

### 8-1. RET-02 — Return Key 정기 검토 운영정책 (거버넌스, PM 확정)

> **목적**: Return Key 및 장기 기대수익률 가정을 최소 분기 1회 검토하되, **검토와 변경을 명확히 구분하고**, 근거 없는 자동 변경을 방지하며, RET-03 정책감사의 공식 운영 기준을 확립한다.
>
> 이 절은 **Return Key 값을 결정하는 규정이 아니라, 값을 언제·어떻게 검토하고 어떤 조건에서만 변경할 수 있는지를 정하는 거버넌스 규정**이다. 실제 값의 정책 판단은 RET-03에서 PM이 별도로 결정한다.

**RET-02-01 검토 주기**
- Return Key 및 장기 기대수익률 정책은 **최소 연 4회(분기 1회 이상)** 검토한다.
- **"검토"와 "변경"은 별개의 행위다.** 분기 검토를 했다는 사실이 수익률 변경의 근거가 되지 않으며, 검토 결과 **"변경하지 않음"도 정상적인 검토 결과로 인정**한다.

**RET-02-02 검토 대상** (최소 항목)
- 등록된 모든 Return Key / system default / user override와 system default의 구분
- Return Key별 Asset Character 연결, deterministic 연결, Monte Carlo 연결
- 장기 역사적 실현수익률, 주요 기관의 장기 기대수익률 전망
- 전망 horizon · nominal/real · total/price return · geometric/arithmetic · 배당 포함 여부
- 현재 정책값의 출처와 근거, 장기 전망의 변화 여부
- 초보자에게 과도한 기대수익률을 유도할 가능성
- Monte Carlo 결과에 대한 민감도

**RET-02-03 검토 자료의 우선순위**
1. 신뢰할 수 있는 기관의 최신 장기 기대수익률 전망
2. 장기 역사적 실현수익률
3. 자산 특성과 구조적 변화
4. 기타 보조자료

금지: **역사적 실현수익률을 미래 기대수익률로 자동 대체하지 않는다.** 특정 기관의 단일 전망을 이유로 자동 변경하지 않는다. **다기관 평균을 자동 계산해 system default로 채택하지 않는다.**

**RET-02-04 변경 원칙**
- 다음 경우 **기존 값을 유지할 수 있다**: 새로운 근거가 충분하지 않음 · 기관 전망 간 차이가 큼 · 기존 정책이 이 프로젝트의 보수적/안전한 목적에 부합함 · 장기 구조 변화가 명확하지 않음.
- 다음의 **충분한 정책적 근거가 있을 때만 PM Decision 대상으로 올린다**: 장기 기대수익률 전망의 구조적 변화 · 기존 가정의 명확한 근거 상실 · 자산 특성의 구조적 변화 · 장기 투자 전제 자체의 변화.

**RET-02-05 사용자 Override 보호**
- system default와 user override(`state.projection.customScenarioRates`)를 명확히 구분한다.
- **분기 정책 검토 결과가 user override를 자동 변경해서는 안 된다.**
- system default 변경과 사용자 정책값 변경은 **별도의 의사결정**이다.
- 사용자가 명시한 값을 시스템이 임의로 평가하거나 교정하지 않는다(Phase 43 "사용자 값을 평가하지 않는다" 원칙과 동일 선상, `e2e/43` 고정).

**RET-02-06 근거 불충분 자산의 취급**
- 근거가 충분하지 않은 Return Key에 **임의의 수익률을 새로 만들지 않는다.**
- KOSDAQ · 국내 개별주식 · BOND · 부동산 · mixed asset 등에 대해 **이 절에서는 어떤 숫자도 결정하지 않는다.**
- **"근거 부족"은 "즉시 수정"과 동일한 의미가 아니다.** 해당 항목은 RET-03에서 별도 정책감사 대상으로 다룬다.

**RET-02-07 현재 정책 사례 기록(값 변경 없음)**
- US equity system default는 Vanguard VCMM 2026-06-30 기준의 **4.1 / 5.1 / 6.0** 구조이며, 이 값은 RET-02 문서화 작업에서 변경하지 않았다.
- **다른 기관의 전망이 더 높다는 사실만으로 현재 값을 변경하지 않는다.**
- 다음 3가지를 상시 금지 원칙으로 기록한다: ① **개별 종목 system alpha 재도입 금지**(Phase 47-A에서 폐지된 정책을 되돌리지 않는다) ② **historical return을 미래 기대수익률로 직접 대체 금지** ③ **근거 없는 KOSDAQ 전용 default 생성 금지**.

### 8-2. RET-02 검토 이력 (문서 관리)

검토 이력은 **이 표로만 관리한다.** 이를 저장하기 위한 새로운 코드·DB·JSON 구조를 만들지 않는다(`CMA_SOURCE_METADATA`의 `asOfDate`는 **외부 자료의 기준일**이지 우리의 검토일이 아니므로, 검토일 기록을 그 필드에 섞지 않는다).

기록 항목: 검토일 · 검토 대상 Return Key · 주요 검토 자료/출처 · 외부 자료 기준일 · 기존 정책값 · 변경 여부 · (변경 시) old → new · 변경 사유 · PM 승인 여부 · 적용 release/version · 비고

| 검토일 | 대상 Key | 검토 자료/출처 | 자료 기준일 | 기존 값 | 변경 | old → new | 사유 | PM 승인 | 적용 release | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| (다음 검토 시 이 표에 1행씩 추가한다) | | | | | | | | | | |

**값이 유지된 경우에도 반드시 1행을 기록한다.** 예: `변경 여부 = NO` · `old → new = 5 / 7 / 11 → 5 / 7 / 11` · `사유 = 신규 근거가 기존 정책을 변경할 정도로 충분하지 않음`. "검토했으나 유지"는 기록이 없으면 "검토하지 않음"과 구분되지 않는다.

**RET-02-08 검토 일정 (PM Decision 2026-09-10 — 반기 → 분기로 변경)**
- **주기: 분기 1회(연 4회 이상).** 정확한 실행일은 해당 분기의 운영 상황과 source publication 일정에 따라 합리적으로 조정한다.
- **첫 정식 분기 검토 목표: 2026-12경.** 이후 목표 주기 2027-03경 · 2027-06경 · 2027-09경 · 이후 분기별 반복.
- **현재 정식 분기 검토 횟수: 0회.** RET-03(2026-09-09)은 별도로 완료된 End-to-End 정책감사이며 **정식 분기 검토 1회차로 소급 기록하지 않는다** — 위 이력 표는 첫 정식 검토 전까지 비어 있는 상태를 유지한다(정책 위반이 아니라 정상적인 초기 운영 상태).
- **분기 검토는 더 자주 확인하기 위한 것이지 더 자주 바꾸기 위한 것이 아니다.** 주기가 짧아졌다는 사실 자체가 변경 근거가 되지 않으며, RET-02-04(변경 원칙)와 RET-02-05(user override 보호)는 그대로 적용된다.
- **자동 갱신 금지 재확인**: 분기 운영을 이유로 외부 source를 읽어 Return Key를 자동으로 바꾸는 기능을 만들지 않는다. *(2026-09-16 §37: CMA 자동 업데이트는 PM 승인으로 범위에 포함됐지만 Return Key 값을 바꾸지 않으며, 새 CMA Dataset도 PM 승인 전에는 계산에 쓰이지 않는다 - 이 원칙과 충돌하지 않는다)*

**RET-02-09 검토 깊이 (매 분기 모든 Key를 같은 수준으로 재연구하지 않는다)**
- **Level 1 — 최신성 확인**(유효한 source가 있는 Key: US_EQUITY · DEV_EX_US · EMERGING): 신규 publication 여부 · source as-of · 기존 자료와의 변화만 확인한다.
- **Level 2 — 근거 재검토**(source가 없는 legacy approximation: KOSPI · KOSDAQ · BOND · 부동산 · CASH): 새로운 신뢰 가능한 장기 근거가 생겼는지, 기존 값을 유지할 수 있는지만 확인한다. 근거가 없으면 **유지가 정상 결과**다.
- **Level 3 — 변경 검토**: 충분한 근거가 확보된 Key에 한해 기존 값 · 신규 근거 · 변경 필요성 · 계산 영향 · 사용자 영향을 분석한다. **Level 3에 들어갔다는 사실이 값 변경을 의미하지 않으며, 실제 변경은 RET-02-04 절차(PM Decision → 영향 분석 → 테스트 → Change Log → Release)를 따른다.**
- 분기 검토에서 BOND의 duration/credit/YTM 모델(BOND-P1)이나 부동산 전용 모델을 끌어오지 않는다 — 이들은 별도 Phase 범위다.

> 참고: RET-02 정책 수립 직전(2026-09) 수행한 READ-ONLY 감사에서 확인된 사실 — deterministic과 Monte Carlo는 `getTargetProjectionRate()` 단일 진입점을 공유하고, user override는 모든 resolver에서 최우선이며, 성격 미확인 자산에는 어떤 가정도 적용되지 않는다(지역 폴백은 Phase 47-A에서 삭제됨). 이 감사 자체는 검토 이력의 1회차가 아니며, **정식 분기 검토는 이 표의 첫 행부터 시작한다.**

### 8-3. RET-02와 RET-03의 관계

- **RET-02**: Return Key 정책의 **정기 검토/변경 거버넌스**(이 절).
- **RET-03**: 현재 모든 Return Key와 자산별 기대수익률의 **실제 정책 End-to-End 감사**.

진행 순서: **RET-02 정책 확정 → RET-03 전체 정책 감사 → PM Decision → 필요 시 구현 → FUTURE-P1 연결.**

RET-02는 RET-03의 선행 조건이며, RET-02가 확정되었다는 사실이 RET-03의 값 변경을 승인하는 것은 아니다.

### 8-4. RET-03 — Return Key 정책 PM Decision (확정)

> **PM Decision date: 2026-09-09** · RET-03 READ-ONLY 감사(코드 변경 0건) 결과를 근거로 아래 정책을 확정한다. **이 결정으로 Return Key 숫자는 하나도 변경되지 않았다** — "현행 유지 + 근거 확보 전 동결"도 정식 정책 확정으로 인정한다.

**RET-03-00 Legacy Return Key 공통 운영 원칙**
> **Legacy/source unknown Return Key는 근거가 충분히 확보되기 전까지 현재 값을 동결하고, RET-02의 분기 검토에서 근거 확보 여부를 재검토한다.**

대상: KOSPI · KOSDAQ(별도 default 없음 → "KOSPI 상속 유지"로 기록) · BOND · 부동산.

**"근거 없음"을 다음 중 어느 것으로도 자동 처리하지 않는다**: ① 0%로 낮추기 ② 새로운 보수적 숫자 생성. 코드의 **unresolved 0% 정책**(성격을 확인하지 못한 자산에 가정을 적용하지 않음)과 **legacy system default의 근거 부족**은 서로 다른 개념이며 혼동하지 않는다.

| Key | 현행 값 | PM 결정 | 근거 상태 |
|---|---|---|---|
| **KOSPI** | 5 / 7 / 11 | **현행 유지 + 동결** | legacy / source unknown |
| **KOSDAQ** | 전용 default 없음 | **KOSPI 상속 유지**(별도 Key 미생성) | — |
| **BOND** | 3.5 / 4.0 / 5.5 | **현행 유지 + 동결** | legacy / source unknown |
| **부동산** | 3.0 / 5.5 / 8.0 | **현행 유지 + 동결** | legacy / source unknown |
| **US Equity** | 4.1 / 5.1 / 6.0 | **현행 유지** | Vanguard VCMM 2026-06-30 (cma_verified) |
| **Individual Stock Anchor** | system alpha 없음 | **현행 유지 / alpha 재도입 NO-GO** | 개별종목 CMA 부재가 근거 |
| **CASH / CASH.USD** | 0 / 0 / 0 | **현행 유지** | 정책값 |
| **Mixed Asset / BOND.STOCK** | 자동 Key 부여 없음 | **현행 유지** | user-defined 전용 |

**RET-03-01 KOSPI** — 현행 5/7/11 유지. 근거 확보 전 동결하며 RET-02 분기 검토에서 근거 확보를 계속 시도한다. 근거 없는 대체 수치를 만들지 않고, 최근 역사적 수익률로 상향하지 않으며, 다른 자산(예: 한국을 포함하는 DEV_EX_US)의 기대수익률을 가져와 KOSPI 값으로 직접 대체하지 않는다. **Bull 11%가 상대적으로 높은 장기 민감도를 갖는다는 사실은 검토 기록으로 남기되, 대체 근거가 없으므로 Bull만 임의로 하향하지 않는다.**
> PM 판단: **"근거가 부족하다" ≠ "임의로 보수적인 숫자를 만들어야 한다".**

**RET-03-02 KOSDAQ** — 현행 KOSPI 상속 유지. 별도 default를 만들지 않으며, **"KOSDAQ 특성이 KOSPI와 다르다"는 이유만으로 새 숫자를 생성하지 않는다.** 별도 장기 기대수익률 근거가 확보되면 RET-02/RET-03을 통해 재검토한다. 사용자 override는 기존 원칙대로 보호한다.

**RET-03-03 BOND** — 현행 3.5/4.0/5.5 유지, legacy/source unknown으로 기록, 근거 확보 전 동결. 개별채권/채권 ETF의 정책 및 모델 구조는 **BOND-P1에서 별도 감사**한다. **이 결정은 Bond 모델을 승인하거나 확정하지 않는다** — duration · credit · YTM · maturity cashflow · coupon reinvestment · 개별채권 전용 Monte Carlo는 전부 BOND-P1 범위다.

**RET-03-04 부동산** — 현행 3.0/5.5/8.0 유지, 근거 확보 전 동결, RET-02 분기 검토에서 근거 확보 시도. **현재 계산 범위(MC 제외 / 총자산 미래예측 포함)는 이번 결정에서 변경하지 않으며, 범위 문제는 별도 backlog/policy review로 관리한다.**

**RET-03-05 US Equity** — 현행 4.1/5.1/6.0 유지. 근거: Vanguard VCMM 2026-06-30 원문 확인, 4.2~6.2% range의 변환 구조 확인, 다기관 종합 자료와 normal 수준이 정합적, 과도한 기대수익률을 제시하지 않는다는 프로젝트 목적과 부합. **다기관 평균을 system default로 자동 채택하지 않으며, Capital Group/JPMorgan/State Street가 더 높다는 이유로 상향하지 않는다.** Vanguard 단일 source 구조를 당분간 유지하고, 타 기관 자료는 RET-02 검토의 **참고자료로만** 사용한다. 분기 검토 때 source 변화 여부를 재검토한다.

**RET-03-06 Individual Stock Anchor** — 개별주식 system alpha를 **재도입하지 않는다(NO-GO)**. 개별주식은 대표 시장/자산군 anchor를 사용하고, 종목별 volatility만 별도 실측한다 *(→ 2026-09-16 PM 승인: 장기 MC 변동성은 Asset Class의 CMA 변동성으로 대체, §37 CMA-03)*. **"개별 종목에 연 15% 성장" 같은 system-generated expectation을 다시 만들지 않는다.** 사용자 override는 별도로 취급하며 시스템이 평가·교정하지 않는다.

**RET-03-07 CASH / CASH.USD** — 0/0/0 유지. 이는 "현금이 반드시 0% 수익"이라는 예측이 아니라 **"시스템이 현금에 성장 가정을 부여하지 않는다"는 정책값**이다. 사용자 override 시 기존 resolver 우선순위를 유지한다.

**RET-03-08 Mixed Asset** — 현행 유지. 정의되지 않은 mixed asset에 자동 Return Key를 부여하지 않고 unresolved 처리를 유지하며, BOND.STOCK의 user-defined 전용 구조를 유지한다. 근거 없는 composition 추정으로 system default를 만들지 않는다.

**RET-03-09 FUTURE-P1 진입 승인** — 아래 선행조건이 모두 충족되어 **FUTURE-P1(Monte Carlo 중심 미래예측 구조 개편) 진입을 승인한다**: ① Return Key system default 정책 확정(이 절) ② user override 보호 확인 ③ deterministic / MC 공통 rate source 확인(`getTargetProjectionRate` 단일 진입점) ④ unresolved 처리 확인 ⑤ 주요 Key policy classification 완료. **모든 legacy Key의 숫자를 새로 산정하는 것은 선행조건이 아니다** — "현행 유지 + 근거 확보 전 동결"도 정책 확정으로 인정한다.

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

### 9-1. Bond Domain READ-ONLY Audit 결과 (V1.3, 코드 변경 0건)

**결론**: 이번 audit 범위에서 **새로운 P0/P1 구현 버그는 확인되지 않았다**. 현재 Bond 관련 구현은 대부분 의도가 코드 주석에 명시된 단순화이며, 남은 쟁점은 구현 결함이 아니라 **정책/경제적 모델 정의가 선행되어야 하는 사항**이다.

**확인된 현재 구현 사실(감사 시점 v225 기준)**:
- **개별채권**(티커 없음 → `classifyCategory`가 `'채권'` 확정, js/01): `NON_TRADABLE_CATEGORIES`로 시세조회 대상에서 제외(js/11) → `currentPrice`는 **사용자가 마지막으로 입력한 값이 그대로 유지**된다(시장가 재평가 없음). quantity/buyPrice/거래내역/positionSource는 다른 자산과 동일한 규칙(BL-8/D-3 포함)을 따른다.
- **채권 ETF**(티커 있음 → `'ETF'`로 분류): 가격/변동성/Risk는 일반 ETF 파이프라인을 그대로 쓰되, **Return Assumption에서는 채권 성격을 별도로 인식할 수 있다** — `resolveAssetCharacter`(js/05)가 ①ETF 구성정보 채권100%(high) ②이름 키워드(medium) 순으로 `BOND` 성격을 판정한다. 즉 μ는 채권 가정, σ는 실측 시장변동성이 될 수 있다.
- **혼합형 상품 보호**: 이름에 '혼합' 등이 있으면 어떤 단일 성격으로도 판정하지 않고 `UNRESOLVED`로 남긴다(Phase 45) — 가정이 자동으로 붙지 않고 사용자 확인을 요청한다.
- **`BOND` Return Key**: `preset.categories['채권']`(js/05), 근거는 한국 국고채 CMA, `RETURN_KEY_REGION`상 **국내(KRW) 전용**이며 통화/시장이 다른 해외채권에는 **자동 추천하지 않는다**(근거 없는 숫자를 만들지 않는다는 기존 원칙).
- **`BOND.STOCK`**: system default 없음 · user-defined · 자동 키워드 매칭 가능 · 값 미등록 시 "가정 없음" · 지역 폴백 없음(기존 정책 그대로, 아래 BOND-DEF-04 참고).
- **개별채권 σ=0**: `isRiskFree`(js/16)로 채권/현금에 부여되는 **명시적 모델링 결정**이며, "데이터 부족"과는 코드상 분리되어 있다 — 위험자산의 가격 이력이 없으면 σ=0으로 채우지 않고 **계산을 중단하는 오류**를 낸다(Phase 3-5 B1). 다만 duration/credit/만기/발행주체를 구분하지 않는 단순화이며, 상관행렬에서도 채권은 무상관으로 처리된다.
- **Risk Universe**: `RISK_ELIGIBLE_CATEGORIES = ['주식','ETF']`(js/09) — 개별채권은 제외된다. 이 사실의 사용자 고지는 P1-1(v226)에서 팝업까지 보강 완료.
- **Rebalance / Excel / Cloud sync / categorySource / positionSource**: Bond 전용 분기가 없으며 다른 카테고리와 동일하게 처리된다(BL-17/BL-18 정책이 그대로 적용됨) — **정상**.

**감사 정정 노트(기존 기록은 삭제하지 않고 아래를 덧붙임)**:
1. 최초 audit 보고에서 "종합 위험점수 헤드라인에 범위 고지가 없다"고 했으나, **메인 RISK 카드에는 `#riskScopeNote`로 이미 존재**했다. 실제 누락 지점은 `riskAlertModal`이었고 v226에서 보강했다(§5 P1-1 참고).
2. 최초 audit 보고에서 "채권 ETF는 일반 ETF와 완전히 동일하게 취급된다"고 했으나 부정확하다. **Return Assumption 경로에서는 채권 성격을 별도로 인식**한다(위 확인 사실 참고).

### 9-2. Bond 정의 Backlog (구현하지 않음 — 정책 결정 선행 필요)

아래 항목은 "미완료"가 아니라 **구현 버그가 아닌, 경제적 모델/정책 정의가 선행되어야 하는 backlog**다.

| ID | 항목 | 현재 상태 | 지금 구현하지 않는 이유 | 선행 정책 결정 | 예상 영향 범위 |
|---|---|---|---|---|---|
| BOND-DEF-01 | 개별채권의 경제적 의미 정의 | 사용자 입력 평가값을 유지하는 자산으로 동작 | 액면/쿠폰/만기/YTM을 어디까지 표현할지 미정 | 개별채권을 만기보유 전제로 볼지, 시가평가 대상으로 볼지 | js/01·05·16, 자산 입력 UI |
| BOND-DEF-02 | 개별채권 `currentPrice`의 사용자 고지 여부 | 고지 없음 | 문구가 "고정가치"로 오해되지 않게 정의 필요 | 고지 문구의 정확한 표현 | js/07·08(표시만) |
| BOND-DEF-03 | 개별채권 σ=0 모델의 장기 타당성 | 의도된 risk-free 모델링 | duration/credit 도입은 MC 입력 체계 변경 필요 | 채권을 위험자산으로 편입할지 | js/16, MC 전반 |
| BOND-DEF-04 | BOND.STOCK 상품 성격 분리 | 자동 판정은 UNRESOLVED로 이미 차단, 사용자 수동 지정은 허용 | 사용자가 만든 키의 자유도이며 앱이 임의로 갈라놓지 않음 | 혼합형 키를 앱이 분리 제안할지 | js/05, 수익률 관리 UI |
| BOND-DEF-05 | 해외채권 Return Key 필요성 | Key 없음 → 가정 없음 처리 | 근거 CMA 미확보 상태에서 숫자를 만들지 않음 | 해외채권 CMA 출처 확정 | js/05 |

**금지 유지**: duration·credit rating·yield curve·spread·bond pricing engine·채권 전용 Monte Carlo·Risk Universe 확대는 PM의 별도 승인 없이 구현하지 않는다.

### 9-3. Bond Definition Decision Gate — PM 최종 결정 (V1.3 종료)

> **V1.3 Bond Definition Decision Gate 결과, 현재 production에서 수정이 필요한 P0/P1 이슈는 없으며, BOND-DEF-01~05는 각각 정책/모델 backlog 또는 현행 유지로 결정하였다. BOND-DEF-02는 유효한 소규모 UX 개선 후보이나 V1.3 범위에서는 구현하지 않는다.**

| ID | PM 최종 결정 | 비고 |
|---|---|---|
| BOND-DEF-01 | **BACKLOG 유지** | 현재 구조를 변경하지 않는다. |
| BOND-DEF-02 | **BACKLOG 유지** | 직접 입력한 채권 `currentPrice`가 자동 갱신되지 않는다는 사용자 안내. V1.3에는 구현하지 않으며, **향후 작은 UX 개선 후보로만** 기록한다. **P1이나 필수 개선사항으로 승격하지 않는다.** |
| BOND-DEF-03 | **POLICY/MODEL BACKLOG** | 개별채권 σ=0 단순화. 현재 계산 구조를 변경하지 않는다. |
| BOND-DEF-04 | **현행 유지** | BOND.STOCK 사용자 정의 Return Key. 추가 분리·자동 재분류하지 않는다. |
| BOND-DEF-05 | **현행 유지** | 해외채권 Return Key. 근거 CMA가 없는 상태에서 임의 Key를 생성하지 않는다. |

이 Decision Gate에서 **production code 변경은 0건**이었다(Bond 관련 코드 무변경).

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

표시 구조 (v237 확정, §23):
- 시장 현황 & 매크로 브리핑 제목 우측의 상하 아이콘은 제거되었으며, 상단 브리핑 영역은 항상 펼쳐진 상태로 표시된다. 접기/펼치기는 '세부 내용 보기' 영역에서만 수행한다.
- 「📌 세부 내용 보기」 안의 시장 종합 평가 / 내 포트폴리오 영향 / 참고 / 상관관계 가이드에는 별도 접기를 두지 않는다.
- 표시 구조의 변경일 뿐이며, 지표 종류 · 데이터 수집 · 계산 · Macro→Risk 분리 정책은 그대로다.

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
- 실시간 데이터 redesign
- 대규모 sector map expansion
- 새 Macro indicator
- Macro→Risk 정량 결합
- 새 Risk Score
- 주식 Alpha / NASDAQ premium / SCHD premium 임의 추가
- 과도한 계좌 segmentation
- 전문가용 CMA research platform
- 새 CMA provider 추가 · CMA Return의 MC 적용 · Benchmark 변경(§37-6, 별도 PM 승인 필요)

> CMA 자동 업데이트(Fetch → Parse → Validate → Diff → Version → Review, 자동 ACTIVE 금지)는 2026-09-16 PM 승인으로 범위에 포함됐다(§37). 과거 Out-of-Scope 기록과 변경 사실은 §15 Change Log에 보존한다.
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
- V1.2-B BL-17 — **RESOLVED / v224 RELEASE PASS**(최초 기능 릴리즈 v223, `da1948e`) — categorySource localStorage persistence hotfix 및 Cloud merge category/categorySource pair 보호 정책 포함
- V1.2-B BL-18 — **RESOLVED / v225 RELEASE PASS**(`18c0295`) — Cloud merge 후 `syncAssetsFromTransactions({auto:true})` 재동기화로 ledger asset position을 merged transaction 기준과 일치시킴
- V1.2-B closeout — BL-17/BL-18 모두 RESOLVED. BL-19는 그 closeout에 포함되지 않았고, 이후 V1.3에서 RESOLVED 처리되었다(아래).
- V1.3 BL-19 — **RESOLVED / v226 RELEASE PASS** — correction-path 안내 강화(Option 1 TEXT-ONLY): 현재 자산값 vs 거래내역 기준값 대조 표시 + 확인 경로 문장 안내, `assessPositionConsistency()` 무변경, `#assetDetailPositionNotice` 내부 button/link = 0 정책 유지
- V1.3 P1-1 — **RESOLVED / v226 RELEASE PASS** — 종합 위험점수 범위 고지: 메인 RISK 카드는 기존 `#riskScopeNote`로 이미 충족되어 있었고, 누락 지점이던 `riskAlertModal`에만 동일 고지 추가. Risk 계산/산식/Universe 무변경
- V1.3 Bond Domain Audit — **READ-ONLY 완료 / 코드 변경 0건** — 신규 P0/P1 구현 버그 없음. 정의 backlog(BOND-DEF-01~05)를 §9-2에 기록하고 구현은 보류(정책 결정 선행 필요)
- V1.3 Bond Definition Decision Gate — **완료 / 코드 변경 0건** — BOND-DEF-01~05 각각 backlog 유지 또는 현행 유지로 PM 최종 결정(§9-3). BOND-DEF-02는 소규모 UX 개선 후보로만 유지하며 P1로 승격하지 않는다
- **V1.3 — CLOSED** — BL-19(v226) + P1-1(v226) 릴리즈 완료, Bond는 추가 구현 없이 종료
- RET-02 Return Key 정기 검토 거버넌스 — **확정 / 문서 정책 수립 완료**(§8-1~8-3) — 코드 변경 0건, Return Key 값 변경 0건. 검토 이력은 §8-2 표로만 관리하며 별도 코드 구조를 만들지 않는다
- RET-03 Return Key End-to-End 정책 감사 — **완료 / 코드 변경 0건** — 전체 Key inventory·End-to-End mapping·기관 전망 및 역사적 근거 조사 수행. 한국 주식 CMA는 **4번째 조사에서도 확보 실패**(한국투자신탁운용 2026 LTCMA 수치 비공개 확인)
- RET-03 PM Policy Decision — **확정(2026-09-09) / 거버넌스 결정, 값 변경 release 아님**(§8-4) — KOSPI·KOSDAQ·BOND·부동산·US Equity·개별주식 anchor·CASH·Mixed Asset **전부 현행 유지**, legacy Key는 근거 확보 전 **동결**. Return Key 숫자 변경 **0건**, 코드 변경 **0건**
- FUTURE-P1 Monte Carlo 중심 미래예측 구조 개편 — **진입 승인 / 다음 단계**(§8-4 RET-03-09)
- FUTURE-P1 Phase 2-C 계산 계층(일반/절세/통합 3-scope) — **구현 완료 / commit `e783568` / v227 / NOT PUSHED · NOT DEPLOYED**(§7-1) — General-only golden 39/39, Unit 274/274, E2E 686/686, ESLint 0, Data Guard·Release Guard PASS. SoT·Return Key 무변경
- FUTURE-P1-BL-01 `runAnnualPreviewMC` taxScope compatibility — **Deferred / Non-blocking**(§7-2) — 현재 production 경로에 preview mode 호출부 없음, 사용자 영향 0
- FUTURE-P1 Phase 3-2 UI/UX restructuring — **구현 완료**(§7-3) — Monte Carlo 주 결과 승격(자동 실행 없음), deterministic 참고값 격하, 계좌 범위·기간 선택, P50/percentile/Goal Probability 의미 구분, 명목·현재가치 구분. 계산 계층·Return Key·SoT 변경 0건
- FUTURE-P1 Phase 3-3 통합검증 — **완료**(§7-3) — P0/P1 0건, 계산 regression 0건, SoT 실측 무변경, 375/768/1024 Light·Dark PASS, Typography 감사 완료, Data Guard PASS
- **FUTURE-P1 Release Candidate — v228** — Phase 2-C 계산 계층 + Phase 3-2 UI/UX + Phase 3-3 검증 결과를 하나의 release로 묶는다
- **P1 DATA PRESERVATION MAINTENANCE — v229 / 구현·검증 완료**(§17) — 거래 저장·절세계좌 계획 저장·엑셀 가져오기·JSON 복원 네 경로에서 사용자가 지정한 값이 조용히 사라지던 결함 9건(FIX-1~FIX-7 · J-1 · J-4)을 최소 범위로 수정. **계산 계층 변경 0건**(js/15·16·17·18·20·21 무변경, Return Key·SCENARIO_RATE_PRESETS·getTargetProjectionRate 무변경), **실제 사용자 데이터 변경 0건**, **실제 JSON/Excel import 0건**, **Cloud write 0건**. ESLint 0 / Unit 283 / E2E 711 / Golden 유지 / Data Guard PASS / Release Guard PASS
- **DASHBOARD KPI / ASSET DETAIL UX — v230 / RELEASED · ACCEPTED**(§18) — WORK PACKAGE A(대시보드 KPI 표시 정비) + WORK PACKAGE B(자산 현황 화면 표시 정비)를 하나의 release로 배포. 계산 정정은 **USD 금융자산 집계에서 부동산 제외 1건**이며, 그 외 **계산 계층 변경 0건**(Monte Carlo·deterministic·Return Key·RET-02 정책 무변경), **실제 사용자 데이터 변경 0건**, **JSON/Excel import 0건**, **Cloud write 0건**. ESLint 0 / Unit 283 / E2E 735 / Golden 35 / Data Guard PASS / Release Guard PASS / production smoke PASS. commit `59b4c75`, 인계장 `1865c66`
- **P1-1 SYNC DIRECTION SAFETY — v231 / RELEASED · ACCEPTED**(§19) — 동기화를 껐다 켜면 그 사이의 로컬 변경이 자동 fullAdopt로 클라우드의 과거 데이터에 덮여 사라질 수 있었다. **앱이 데이터 방향을 추측하던 것을 없애고, 클라우드에 데이터가 있으면 사용자가 Cloud→Local / Local→Cloud를 명시적으로 고르게** 했다. `fullAdopt`·`pullFromCloud`·`mergeCollectionById`·Cloud schema·암호화·localStorage 키 **전부 무변경**, **계산 계층 변경 0건**, **실제 사용자 데이터 변경 0건**, **Production Cloud write 0건**. ESLint 0 / Unit 290 / E2E 751 / Golden 35 / Data Guard PASS / Release Guard PASS / production smoke PASS WITH OBSERVATION(§19-5). commit `51818ae`
- **ASSET LIST FILTER SIMPLIFICATION — v232 / RELEASED · ACCEPTED**(§20-1) — 자산목록 보기 버튼에서 **'자산군' 필터 하나만 제거**하고 남은 셋(전체 / 소유자 / 국내외)을 375px에서도 3열 한 줄로 배치. '전체'가 이미 자산군으로 그룹핑하므로(`renderTable`의 `none` 분기 → `'category'`) 같은 개념이 버튼으로 중복 노출돼 있던 것을 정리한 것이며, **자산군 기능 자체는 그대로**(자산군별 목록·건수·소계·비중·아코디언·비중 차트·분류/집계 전부 무변경, `getTableGroupKey`의 `'category'` 분기 유지). **계산 계층 변경 0건**. ESLint 0 / Unit 290 / E2E 751 / Golden 35 / Data Guard PASS / Release Guard PASS. commit `c4dc0d1`
- **DASHBOARD / PROJECTION UX SIMPLIFICATION — v233 / RELEASED · ACCEPTED**(§20-2) — 이미 화면의 숫자로 알 수 있는 것을 설명문·별도 카드·팝업으로 한 번 더 보여주던 부분을 걷어내고(총금융자산평가손익 [세부내용] 버튼·팝업·설명문 2줄 제거, 국내/해외 Top 5 카드 2개 제거, 매크로 브리핑 하단 해석 영역 아코디언화), 찾기 어렵던 「⚙ 수익률 직접 조정 (고급)」 진입점을 미래예측 탭 회색 링크에서 포트폴리오 탭의 독립 버튼으로 옮겼다(같은 id 유지 → 기존 팝업·저장 로직 무변경, JS 0줄). **계산 계층 변경 0건**. ESLint 0 / Unit 290 / E2E 763 / Golden 86 / Data Guard PASS / Release Guard PASS. commit `d24cdb3`
- **MACRO BRIEFING VISIBILITY FIX — v234 / RELEASED · ACCEPTED WITH OBSERVATION**(§20-3) — v233 이후 사용자가 제보한 두 가지, ① 대시보드에 들어와도 시장 지표가 하나도 보이지 않음 ② 「📌 시장 해석 보기」를 눌러도 아무것도 나타나지 않음을 수정. 중첩 아코디언의 **높이 계산 시점** 결함(안쪽 max-height 트랜지션이 끝나기 전에 바깥 scrollHeight를 읽어 부모가 자식을 통째로 잘라냄)을 `transitionend` 보정으로 해결하고, 매크로 1단을 기본 펼침으로 바꿨다. **기존 지표 10종 유지 · 신규 indicator 0건 · Macro→Risk 연결 0건 · 계산/데이터/Risk 구조 변경 0건 · 사용자 데이터 변경 0건 · Production Cloud write 0건**. ESLint 0 / Unit 290 / E2E 776 / Golden PASS / Data Guard PASS / Release Guard PASS / production smoke 6뷰포트 PASS. commit `6628653`. Observation 4건(OBS-1~4)은 §20-5에 기록하며 **개발 과제로 승격하지 않는다**
- **DAILY SNAPSHOT PRESERVATION & RECOVERY — v235 / RELEASED**(§21) — 과거 일별 자산 이력(`dailySnapshots`)이 조용히 사라지던 경로를 막고, 이미 잃은 이력을 사용자 백업에서 되찾는 경로를 추가했다. FIX-1(마이그레이션의 과거 스냅샷 삭제 제거 + 소급 채우기 `protectedDates`) · R-5(신규 자산의 기존 날짜 소급 금지) · FIX-2a(`dailySnapshots` 전용 미리보기 후 명시적 복구, placeholder 6조건 AND · `PLACEHOLDER_MIN_RUN = 14`) · FIX-3(근거 없는 과거 스냅샷 생성 금지). **계산 엔진·자산·거래·리밸런싱·미래예측·Cloud Sync 구조 변경 0건**, **실제 사용자 데이터 변경 0건**, **Production Cloud write 0건**. **복구 기능의 배포이며, 실제 사용자 백업의 자동 복구가 아니다.** Unit 317 / E2E 811 / Golden 122 / ESLint 0 / Data Guard PASS / Release Guard PASS. commit `1d5745d`
  - ※ **정정(v236 closeout, §21-11)**: 위 "Production Cloud write 0건"은 **v235 릴리스 과정**(구현·테스트·배포·smoke)에 대한 사실이다. 이후 감사에서 v235 복구 핸들러가 적용 직후 `renderAll()`을 호출해 **동기화 ON 기기에서는 복구 결과가 약 3초 뒤 업로드될 수 있었음**이 확인되어 v236 P1-A로 수정했다. v235 placeholder 판정 조건 ③(`cur`가 오늘과 동일)은 v236 F2로 대체되었다.
- **RECOVERY SAFETY (P1-A · P1-B F2) — v236 / RELEASED(코드 배포) · RECOVERY UNRESOLVED · Recovery Apply BLOCKED**(§22) — P1-A: 복구 적용(Apply + 화면 갱신) 구간을 기존 `applyingRemoteUpdate` 가드로 감싸고 대기 중인 push 예약을 취소해 **Recovery Apply 처리 자체에서 Cloud POST가 발생하지 않도록 보호**(동기화 ON이면 이후 일반 동기화로 반영될 수 있음). P1-B: placeholder candidate 탐지 기준을 **F2**(현재 모든 축 dailyPnL 0 · 연속 14일 이상 · 백업 손익 기록 비율 25% 이상 · `cur` 비교 제거)로 교체하고, 2차 확인창에 백업 metadata를 표시. **실제 사용자 데이터에 대한 Recovery Apply는 실행하지 않았다.** Unit 337 / E2E 820 / Golden 122 / ESLint 0 / Data Guard PASS / Release Guard PASS / production smoke 6뷰포트 PASS. commit `94f1544`
- **MACRO BRIEFING UX SIMPLIFICATION — v237 / RELEASED · ACCEPTED**(§23) — 「시장 현황 & 매크로 브리핑」 전체 접기와 제목 우측 Chevron을 제거해 지표 10개를 항상 표시하고, 접기는 「📌 세부 내용 보기」(구 「시장 해석 보기」) 하나로 줄였다. 내부 「상관관계 가이드 보기」 토글 제거. **Recovery · 계산 · 데이터 수집 · Risk 변경 0건**. Unit 337 / E2E 820 / Golden 122 / ESLint 0 / Data Guard PASS / Release Guard PASS / production smoke 8뷰포트 PASS. commit `1bf07ab`
- Bond domain — BACKLOG / 별도 Phase (§9-1 audit 결과 · §9-2 정의 backlog 참고)
- Tax MC 3-scope — REQUIRED / 구현 시 반드시 체크
- **MC 결과 화면 정리 — v250(§38)** — UI/IA/문구만 변경(계산 · CMA · Return Key 무변경, 변경 전후 결과 동일). MCD-3 카드 내 해설 문구는 §38 UX-5로 대체, MCD-4(P90 비표시) 유지 확정, 결과 아래 기술 정보 블록(적립금 · 총 납입원금 · 목표비중 기준 안내 · 인플레이션율 · 가중평균 보수)은 PM 수정 지시로 삭제 - MCD-5 해당 문구 · P5 고지 대체(§38-3)
- **Macro/Risk 표시 용어 기준 — v251(§39)** — 화면 문구 · 라벨만 정비(계산 · 판정 · 가중치 · 임계값 · What-If · MC · CMA · Return Key 무변경, 변경 전후 계산 · 판정 결과 동일). 표시 용어 기준표를 §39에 등재(PM 승인 T8)
- **Risk 계산 정책 P-1~P-9 — v252(§40)** — 포트폴리오 수익률 공통 거래일 결합 · 공통 수익률 120개 미만 데이터 부족(점수 없음 · 50 대체 없음) · 종목 베타 120개 기준 · 거래량 결측 null · 벤치마크는 추종 지수/상장 시장 지수 확인 시에만(나머지 UNRESOLVED → 베타 · 스트레스 null) · 채권 모델 없음 · Risk Score 구조 · Macro · MC · Return Key · CMA 무변경. 로컬 커밋만(push · 배포 안 함)
- **UI 정리 4건 — v253(§41)** — Risk 세부 모달의 과거 하락장 가정 손실(2020 · 2022) · What-If 영역 화면 미표시(계산 코드 유지) · 매크로 「📄 상세 현황 보기」 명칭 · 신랑/와이프 목표 비중 드롭다운 독립 동작 고정 · 일반계좌 적립계획 버튼 「적립설정」. 계산 · 정책 무변경
- **UI 정리 v253 누락분 — v254(§41-2)** — 메인 Risk 카드 하단 계획 확인 안내(「이 점수는 가격 변동 위험만 봅니다 … 포트폴리오 설정에서 보기」) 화면 미표시(이동 처리 코드 유지). P1-1(§ v226)의 "범위 고지와 성격 고지 둘 다 유지" 중 성격 고지 표시는 이 결정으로 대체된다(범위 고지는 유지). 계산 · 정책 무변경
- **UI 상태 통일 · 참고값 기준 표시 — v255(§42)** — 탭 전환 시 남아 있던 펼침 상태 5종 닫기 · 새로 연 팝업은 맨 위부터 · MC ⓘ 팝업 주의사항 묶음 첫 클릭 · 「20년 후 자산 참고값 (일반적 수익률 적용)」. 상단 필터와 자산 세부현황 보기 버튼은 이미 독립(무변경). 계산 · 선택값 · 입력값 · 저장 데이터 무변경
- **소유자 카드 표시 순서 · 실현손익 배지 문구 — v256(§43)** — 신랑 · 와이프 목표 비중 카드에서 포지션 목표비중 그래프를 종목 목록보다 먼저 표시 · 총 실현손익 배지 「총 실현손익 : 금액」. 상단 필터와 자산 세부현황 보기 버튼은 이미 독립(재확인 · 무변경). 계산 · 범위 · 소유자 분리 무변경 · **자산 세부현황 목록 범위 분리(상단 필터는 그래프에만 적용 - v230 결정 되돌림)** · RISK 제목 옆 ⓘ 버튼 삭제
- **최종 개편 — v261(§46)** — 「베타 기준 참고 비중」 1.0 대체 폐지 · 미확정 종목 현재 비중 유지 · 개별/전체 적용 모두 주식 목표 비중 합계 보존 · 0.1% 최대 잔여법 · 매크로 티커 직접 검색은 매크로 지표 팝업으로 · 매크로 차트 단위 · 환율 실패 안내 문구 · 화면 명칭 4개 · 근거 설명 쉬운 말 · 옛 코드/주석 정리. Portfolio Beta · Risk · MC · CMA · Return Key · 데이터 구조 무변경
- **장기 MC CMA 체계 · CMA 자동 업데이트 · Correlation Benchmark — PM 승인 정책 등록(2026-09-16, §37)** — §7 상관 · RET-03-06 변동성 · §13 CMA 자동 업데이트 문구를 §37로 대체(삭제 없음). 구현 기록은 §37-2 이후
- **v249 정책 · 문서 Finalization(2026-09-17, §37-6)** — 본문을 최신 정책으로 정리하고 과거 문구는 여기에 보존한다.
  - 과거 §13 Out-of-Scope 항목: "CMA 자동 업데이트" → 2026-09-16 PM 승인으로 범위 포함(§37 CMA-AUTO-01~06). §13 목록에서 제외하고 안내 문장으로 대체
  - 과거 §7 기본 구조: "correlation은 date-aligned daily returns + Pearson + PSD correction + Cholesky" · "missing observations <10 → corr 0 + Safety WARNING" → 장기 CMA 상관 · 변동성, Return Key 수익률로 본문 교체(§37 · §37-5)
  - RET-03-06(PM Decision 기록)은 원문을 유지하고 §37 대체 표시만 둔다
  - 정책 고정: CMA-2026.1 ACTIVE 유지 · AllianzGI 2026 Q2 VERIFIED 유지 · Return 정책(CMA-RET-01~05) 확정 · J.P. Morgan 2026 KRW Benchmark 유지 · DEV_EX_US 별도 PM 검토 · 자동 업데이트 현행 유지 · 추가 구현 금지

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

## 17. P1 데이터 보존 유지보수 (v229 · PM Approval 2026-09-10)

V1.3 이후 안정화 단계에서 발견된 **P1 데이터 보존 문제에 대한 예외적 유지보수 작업**이다. 기능 확장이
아니며, "사용자가 명시적으로 입력·복원·가져온 데이터가 앱 내부의 다른 경로 때문에 조용히 사라지지
않게 한다"는 목적 하나만 수행했다. Cloud Sync·Excel·JSON 세 경로에 대한 읽기 전용 포렌식 감사
4회(코드 감사 → 백업 포렌식 → Excel/Cloud 통합 감사 → JSON 감사) 후 PM이 승인한 범위다.

**17-1. 수정 항목**

| ID | 파일 | 내용 |
|---|---|---|
| FIX-1 | `js/06-transactions.js` | 거래 저장이 자산의 `role`/`rateMatchOverride`를 **실제로 바꾼 경우에만** `asset.updatedAt`을 갱신한다. 예전에는 값만 바뀌고 timestamp가 그대로여서 두 기기가 영원히 갈라진 뒤, 다음 정상 편집 한 번에 상대 기기 지정이 사라졌다. 기존 change-only timestamp 패턴 재사용, manual/ledger/legacy SoT 무변경 |
| FIX-2 | `js/05-future-projection.js` | 절세계좌 적립계획 저장 시 `role`이 지정된 배분 항목만 `setTickerRole()`에 넘긴다. 예전에는 role 없는 항목 때문에 다른 화면에서 지정해 둔 티커 역할이 삭제됐다. `setTickerRole()` semantics 무변경, 명시적 해제 경로(자산 상세·거래 폼·리밸런싱 목표) 유지 |
| FIX-3 | `js/12-import-export-sync.js` | 엑셀 내보내기를 **"전체 자산 백업"** 정의에 맞춘다 — 평가금액이 0이라는 이유로 자산 레코드를 제외하지 않는다. 화면 표시 정책(`tableAssets`/`filteredAssets`/`hasRealEstateHoldings`)은 **변경하지 않았다** |
| FIX-4 | `js/12-import-export-sync.js` | 엑셀 가져오기에서 `buyRate` 칸이 비었거나 열이 없으면 기존 값을 이어받는다. 같은 필드를 클라우드 병합은 이미 보호하고 있어 경로 간 판단이 서로 달랐다 |
| FIX-5 | `js/12-import-export-sync.js` | 동일 규칙을 `rateMatchOverride`에도 적용한다. **엑셀 명시적 삭제 문법을 만들지 않았고**, **Cloud의 `MERGE_PRESERVE_IF_ABSENT`에 `role`/`rateMatchOverride`를 추가하지 않았다** |
| FIX-6 | `js/12-import-export-sync.js` | JSON [추가하기] 복원이 핸들러에서 1회 계산한 `restoredAt`을 자산 `updatedAt`에 적용한다. 예전에는 값이 비어 같은 세션 push 직전 선병합에서 복원본이 무조건 패배했다. 부팅 시점 백필에 의존하지 않는다 |
| FIX-7 | `js/12-import-export-sync.js` | JSON 덮어쓰기에서 `tickerRoles`/`learnedTickerNames`를 **키 없음 = 기존 값 유지 / 키 + 정상 object = 복원 / 키 + `{}` = 명시적 초기화**로 구분한다(`hasOwn`) |
| J-1 | `js/12-import-export-sync.js` | JSON 덮어쓰기 복원에서 `rebalance`/`projection`도 `restoredAt`으로 갱신한다(Option A — 명시적 복원을 최신 local intent로 취급). 예전에는 이 둘만 파일의 옛 시각을 유지해 복원 직후 pull에서 되돌아갔다. **일반 Cloud sync 경로(`force:false`)의 semantics는 변경하지 않았다** |
| J-4 | `js/12-import-export-sync.js` | `transactions` 키가 없는 구버전 JSON(이 필드가 생기기 전의 정상 백업)을 그대로 호환한다 — 기존 거래내역을 삭제하지 않고, 자산만 되돌렸다는 사실을 결과 문구로 알린다. 새 validation framework·새 UI 없음 |

**17-2. PM이 명시적으로 수용한 잔존 사항**

| ID | 내용 | 상태 |
|---|---|---|
| N-1 | 오래된 JSON [추가하기] 복원이 클라우드의 최신 `rebalance`/`projection`보다 우선할 수 있다 — BL-15의 명시적 사용자 복원 정책과 같은 방향으로 수용 | **ACCEPTED / OBSERVE** |
| N-7 | Cloud merge에서 `role`/`rateMatchOverride`가 여전히 field-level 보호를 받지 않는 비대칭(엑셀 경로만 보존) — `MERGE_PRESERVE_IF_ABSENT` semantics를 변경하지 않는다 | **OBSERVE** |
| B-5 | `projection` 통 객체 교체(단일 `updatedAt`) — 의도된 설계 | OBSERVE |
| B-7 | 거래 엑셀 업로드 후 legacy 자산 재계산 — 의도된 SoT일 가능성 | OBSERVE |
| B-9 | 대표매칭 키 개명 마이그레이션의 `updatedAt` 미갱신 — 백필 위험과 충돌 | OBSERVE |
| B-6 | 엑셀 가져오기에 시각 비교 없음 — 복원 시맨틱과 충돌 | DEFER |
| B-8 | 거래 엑셀의 id 재발급 — 스키마 변경 필요, 실피해 없음 | DEFER |
| — | 과거에 이미 발생했을 수 있는 데이터 손실의 **소급 복구** | **이번 릴리스 범위 아님 / 수행하지 않음** |

**17-3. 사고 판정 (변경 없음)**

스마트폰 포트폴리오 대체 신고는 **UNDETERMINED**를 유지한다. 2026-09-07~09-10 백업 4건에서
regression이 발견되지 않았다는 사실만 사용하며, 사고 발생도 부재도 확정하지 않는다. `Date.now()`
boot backfill은 이번 사건 원인에서 **REJECTED**, 2026-09-08 `rebalance` 변경은 **실제 사용자 편집
HIGH CONFIDENCE**를 유지한다. 위 9건은 전부 **사고 원인 확정과 무관하게 재현 가능한 결함**으로서만
수정했다.

**17-4. 안전 선언**

- **계산 계층 변경 0건** — `js/15`·`js/16`·`js/17`·`js/18`·`js/20`·`js/21` 무변경. μ·σ·correlation·
  Cholesky·contribution·annual rebalancing·inflation·Return Key·`SCENARIO_RATE_PRESETS`·
  `getTargetProjectionRate()` 전부 무변경.
- **실제 사용자 데이터 변경 0건 / 실제 JSON import 0건 / 실제 Excel import 0건 / Cloud write 0건.**
  모든 검증은 합성 fixture·mock·E2E 환경에서만 수행했다(§16 Data-Safety Rule 준수).
- 테스트: ESLint 0 error · Unit **283/283** · E2E **711/711** · Golden 유지(대표 13개 Return Key
  등록값 불변, 백업 왕복 값 불변, Deterministic ↔ MC adapter 동일) · Data Guard PASS ·
  Release Guard PASS.
- **v228 → v229** — 기능 확장 릴리스가 아니라 *V1.3 stabilization P1 data-preservation maintenance
  release*다. cache-first 환경에서 이 수정이 실제 사용자에게 전달되게 하기 위한 버전 상승이다.
- **v229 이후 자동으로 V1.4를 시작하지 않는다.** 새 개선은 별도 PM 판단을 거친다.

## 18. 대시보드 KPI / 자산 세부현황 표시 개선 (v230 · PM Approval 2026-09-10)

안정화 단계에서 수행한 **표시 계층 정비 릴리스**다. 숫자를 새로 만들지 않았고, 이미 있는 숫자가
무엇을 뜻하는지 이름과 배치로 드러내는 데 범위를 한정했다. 계산 정정은 아래 18-2의 1건뿐이다.

**18-1. 범위**

| 묶음 | 내용 |
|---|---|
| WORK PACKAGE A | 일간 금융 평가손익 표시 용어 정비(**원화자산 / 외화자산 / 달러 현금**) · 총자산평가금액 카드 구조 개선(**금융자산 총평가금액 = 원화자산 평가금액 + 달러자산 평가금액**, 부동산 분리) · **달러자산 미실현 환차손익** 명칭 확정 · 실현손익과 미실현손익의 의미 구분 안내 |
| WORK PACKAGE B | 필터 → 통계 그래프 → 자산 세부현황 **범위 통일** · 전체 / 소유자별 / 국내·해외 / 자산군별 **4개 보기 방식 전부 아코디언** · 필터 초기화 버튼 화면 제거 · 모바일 필터 배치 개선 · 필터 결과가 없을 때의 안내 · 기존 검색 팝업 정책 유지 |

**18-2. 계산 정정 (1건)**

USD 자산 집계에서 **USD 부동산이 달러자산 평가금액에 포함**되는 범위 불일치가 있었다. 같은 자산이
금융자산에는 들어가지 않으면서 달러자산에는 들어가, 두 값의 기준이 서로 달랐다.

v230에서 다음 구조가 되도록 정정했다.

- **USD 금융자산만** 달러자산 평가금액에 포함한다.
- **USD 부동산은 금융자산 범위에서 제외**한다.
- **금융자산 = 원화자산 + 달러자산**이 성립한다.

`financialCur` · `totalCur` · `realEstateCur`는 **변경하지 않았다**. 표시 용어 변경은 렌더 시점의
표시 계층에서만 처리했고 `categoryDisplayKey()`는 변경하지 않아, `dailySnapshots` 저장 키
호환성을 그대로 유지한다.

**18-3. OBSERVE 항목 (v230에서 해결하지 않는다)**

| ID | 내용 | 상태 |
|---|---|---|
| OBSERVE-01 | 전체 vs 자산군별의 접힌 상태 유사성 | OBSERVE |
| OBSERVE-02 | `renderCharts()` + `renderTable()` 호출 구조 분산 | OBSERVE |
| OBSERVE-03 | production 호출자 0인 `tableAssets()` | OBSERVE |
| OBSERVE-04 | 아코디언 펼침 상태가 새로고침·탭 이동 시 초기화 | OBSERVE |
| OBSERVE-05 | 실제 사용자 피드백 | OBSERVE |

다섯 항목 모두 **해결되지 않았고, 개발 과제로 승격하지도 않는다.** 관찰 상태를 유지한다.

**18-4. 안전 / 검증**

- **계산 엔진 변경 0건** — Monte Carlo · deterministic projection · μ · σ · correlation · Cholesky ·
  contribution · annual rebalancing · inflation 전부 무변경.
- **Return Key 변경 0건 / RET-02 정책 변경 0건**(§8-1~8-3 그대로 유지).
- **실제 사용자 데이터 변경 0건 / JSON import 0건 / Excel import·export 0건 / Cloud write 0건.**
  모든 검증은 합성 fixture · E2E 환경에서만 수행했다(§16 Data-Safety Rule 준수).
- 테스트: ESLint PASS · Unit **283/283** · E2E **735/735** · Golden **35/35** · Data Guard PASS ·
  Release Guard PASS · **production smoke PASS**.
- **v229 → v230 / production release 완료 — RELEASED · ACCEPTED.** cache-first 환경에서 이 변경이
  실제 사용자에게 전달되게 하기 위한 버전 상승이다.
- **v230 이후에도 V1.4를 시작하지 않는다.** 새 개선은 별도 PM 판단을 거친다.

## 19. P1-1 동기화 방향 선택 — 데이터 보존 (v231 · PM Approval 2026-09-12)

안정화 단계에서 발견된 **동기화 데이터 보존 문제**를 고친 릴리스다. 기능 확장이 아니며,
"앱이 사용자의 의사를 추측해 한쪽 데이터를 고르지 않는다"는 원칙 하나를 동기화 재개 지점에
적용했다. §6 V1.1 핵심 목적("사용자가 입력한 자산 정보가 어떤 경로로도 조용히 사라지지 않게
한다")에 직접 걸리는 문제였고, v229 배치(§17)가 다루지 않은 경로였다.

**19-1. 문제**

동기화를 끈 상태에서 거래·자산을 입력한 뒤 같은 암호로 다시 켜면, `onSyncPasswordSaved`가
곧장 `pullFromCloud({ fullAdopt: true })`를 불렀다. `fullAdopt`는 병합이 아니라 통째 교체라
그 사이의 입력이 한 번에 사라졌다(실측: 거래 3건 추가 후 재개 → 3건 전부 소멸, 자산 수량도
클라우드의 과거 값으로 회귀). "동기화를 다시 켠다"와 "이 기기를 지우고 클라우드로 되돌린다"는
다른 뜻인데 코드가 그 둘을 구분하지 않았다.

**19-2. PM 결정 — 자동 판단 제거, 사용자 명시적 선택**

| 검토안 | 결정 |
|---|---|
| 비밀번호·`lastSyncedAt` 비교로 기존 슬롯 여부를 **자동 판별** | **폐기** — 앱이 사용자의 의사를 추측하는 구조보다 사용자가 직접 고르는 구조가 안전하다 |
| 비밀번호를 바꿔 새 슬롯에 올리는 **우회 방식** | **폐기** — 정식 경로가 아니다 |
| 동기화 재개 시 **방향 선택을 묻는다** | **채택** |

자동 동기화(10초 폴링·변경 시 자동 push)는 기존 병합/보존 정책 그대로 두고, 방향 선택은
오직 재개 시점에서만 일어난다. 자동 덮어쓰기 금지 원칙은 유지되며, 사용자가 고지받고 직접
누르는 반영은 별개의 승인 동작으로 취급한다.

**19-3. 구현 (최소 변경)**

| 지점 | 내용 |
|---|---|
| `onSyncPasswordSaved` | 자동 `pullFromCloud` 호출 제거. `probeCloudSlot()`로 슬롯 존재만 확인한다(GET 1회, state·localStorage에 아무것도 쓰지 않는다) |
| Cloud 404 | 예전 업로드 확인 흐름 그대로. **방향을 묻지 않는다** |
| 복호화 실패 | 예전 안내 그대로. 어느 쪽이 내 데이터인지 모르는 상태에서 덮어쓰기를 제시하지 않는다 |
| Cloud 200 | 방향 선택 표시 + **양쪽 자산/거래 건수** 함께 표기(샘플만 있는 새 기기의 오조작 방지) |
| Cloud→Local | 기존 `pullFromCloud({ fullAdopt: true })`를 **그대로** 호출. 함수도 `fullAdopt`의 의미도 무변경 — 최초 페어링의 샘플 혼입 방지가 그대로 유지된다 |
| Local→Cloud | 확인 절차 후 `pushToCloud({ localWins: true })`. 기존 push의 **선병합 게이트만** 건너뛰고 GET·암호화·POST·lastVersion·lastSyncedAt·기준선 갱신·에러 처리는 전부 재사용 |
| `stampPayload()` | 업로드 **payload 복사본에만** 시각을 찍는다 — `assets[].updatedAt` · `transactions[].updatedAt` · `rebalance.updatedAt` · `projection.updatedAt` 네 곳뿐. `createdAt`·`positionSource`·`categorySource`·`buyRate`·`rateMatchOverride`·`role`은 무변경 |
| 로컬 state | **직접 변경하지 않는다.** 그래서 업로드가 실패해도 원복할 대상 자체가 없다(실패 원자성이 구조적으로 성립) |
| 삭제 전파 | timestamp와 무관하게 기존 기준선 방식 그대로 동작한다 |
| union metadata | `tickerRoles` · `learnedTickerNames` · `dailySnapshots`는 timestamp가 없는 합집합 구조 — **기존 동작 유지**, 덮어쓰기 대상이 아니다 |

`mergeCollectionById` · `mergeAssetsAndTransactionsWithRemote` · `adoptRemoteRebalanceAndProjection` ·
`applyRemoteState` · `buildSyncBlob` · `encryptSyncBlob`/`decryptSyncBlob` · `deriveKvKey` ·
Cloud endpoint · Cloud schema · 새 localStorage 키 — **전부 무변경**.

**19-4. 알려진 한계 (해결하지 않는다)**

| 내용 | 상태 |
|---|---|
| 상대 기기가 **아직 올리지 않은** 신규 입력은 Local→Cloud 반영 후에도 지워지지 않고 합쳐진다 | 기능의 한계로 정의. 그 데이터는 상대 사용자가 실제로 입력한 것이므로 지우는 쪽이 §6 위반이다. 확인 문구에 그대로 고지한다. authority flag·device generation·sync epoch·snapshot version·tombstone·Cloud schema 변경 **도입하지 않는다** |
| 기기 간 시계 오차가 크면 스탬프해도 이기지 못할 수 있다 | 기존 merge가 이미 갖고 있는 성질. 보정하지 않는다 |
| 처음 연결하는 기기의 오조작 | UI로만 완화(버튼 위계·확인 절차·양쪽 건수 표기) |

**19-5. 검증 한계 / Observation (제품 결함 아님 · 개발 과제로 승격하지 않는다)**

| ID | 내용 | 판정 |
|---|---|---|
| OBS-v231-1 | production smoke에서 시세·환율 실패 토스트가 표시됨 | **검증환경 artifact** — 안전을 위해 DNS로 시세/환율 API를 차단한 결과다. 실제 production API 정상 환경에서는 발생하지 않으며 P1-1과 무관하다. 수정하지 않는다 |
| OBS-v231-2 | `pullFromCloud` 인자 계측 시 10초 폴링의 `{silent:true}` 호출이 먼저 포착되어 버튼의 `{fullAdopt:true}`를 직접 캡처하지 못함 | **계측상의 한계** — 실제 결과(자산 6→12, 거래 10→34로 통째 교체)와 E2E T-02로 `fullAdopt` 동작이 검증됐다. 제품 결함이 아니다. 수정하지 않는다 |

**19-6. 안전 / 검증**

- **계산 엔진 변경 0건** — Monte Carlo · deterministic projection · μ · σ · correlation · Cholesky ·
  contribution · annual rebalancing · inflation 전부 무변경.
- **Return Key 변경 0건 / RET-02 정책 변경 0건**(§8-1~8-3 그대로 유지).
- **실제 사용자 데이터 접근 0건 / 변경 0건 / JSON·Excel import 0건 / Production Cloud write 0건.**
  구현·검증 전 과정에서 합성 fixture만 사용했고, Cloud Worker는 DNS 격리와 요청 가로채기로
  이중 차단한 상태에서 측정했다(§16 Data-Safety Rule 준수).
- 테스트: ESLint PASS · Unit **290/290** · E2E **751/751** · Golden **35/35** · Data Guard PASS ·
  Release Guard PASS.
- production: GitHub Pages **auto deploy SUCCESS**, deployed SHA = origin/main = local HEAD =
  `51818aeb3903e113dd00337c8bd82367ac713d9d`, `appVersionLabel` v231, SW `smart-asset-manager-v231`,
  배포본 SHA-256 = 커밋 artifact 일치, 6뷰포트(375/768/1024 × Light·Dark) PASS,
  JS runtime exception 0 · unhandled exception 0 · static asset load failure 0.
- **v230 → v231 / production release 완료 — RELEASED · ACCEPTED.** cache-first 환경에서 이 수정이
  실제 사용자에게 전달되게 하기 위한 버전 상승이다.
- **v231 이후에도 V1.4를 시작하지 않는다.** 현재 단계는 안정화 / 운영 / 관찰이며, 다음 공식 운영
  마일스톤은 기존 결정대로 **2026-12경 RET-02 첫 정기 검토**다.

## 20. 화면 단순화 및 매크로 가시성 수정 (v232 · v233 · v234 · PM Approval 2026-09-12)

v231 이후 같은 날 연속으로 진행된 UX 정리 3건이다. 기능 추가가 아니라 **이미 있는 화면을
초보자가 바로 이해할 수 있게 정리**하는 작업이며, v234만 성격이 다르다 — v233이 만든 표시
결함을 사용자 제보로 확인해 고친 수정 릴리스다.

| Version | Date | Commit | Change | Validation | Decision / Status |
|---|---|---|---|---|---|
| **v232** | 2026-09-12 | `c4dc0d1` | 자산목록 '자산군' 필터 제거, 남은 3개 필터 1행 배치 | ESLint 0 / Unit 290 / E2E 751 / Golden 35 / Data Guard PASS / Release Guard PASS / 6뷰포트 실측 | **RELEASED · ACCEPTED** |
| **v233** | 2026-09-12 | `d24cdb3` | 총금융자산평가손익 카드 정리 · Top 5 카드 제거 · 매크로 해석 아코디언화 · 수익률 직접 조정 진입점 이동 | ESLint 0 / Unit 290 / E2E 763 / Golden 86 / Data Guard PASS / Release Guard PASS / 6뷰포트 실측 | **RELEASED · ACCEPTED** |
| **v234** | 2026-09-12 | `6628653` | 매크로 지표 10개 기본 표시 · 중첩 아코디언 clipping 수정 · 회귀 E2E 보강 | ESLint 0 / Unit 290 / E2E 776 / Golden PASS / Data Guard PASS / Release Guard PASS / production smoke 6뷰포트 PASS | **RELEASED · ACCEPTED WITH OBSERVATION** |

**20-1. v232 — 자산목록 필터 단순화 (`c4dc0d1`)**

자산목록 상단 보기 방식 버튼에서 **'자산군' 하나만** 없애고, 남은 셋(전체 / 소유자 / 국내외)을
한 줄에 뒀다. '전체'가 이미 자산군(주식·ETF·채권·현금·부동산)으로 묶어 보여주기 때문에
(`renderTable`의 `none` 분기가 `'category'`로 그룹핑한다) 같은 개념이 버튼으로 한 번 더
노출돼 있었고, 두 방식은 접힌 상태에서 건수 표기만 달랐다 — v230 OBSERVE-01로 남겨 둔
중복이다.

**"자산군 필터를 없앤 것이지 자산군 기능을 없앤 것이 아니다."** 자산군별 목록·건수·소계·비중,
아코디언 접기/펼치기, 자산군 비중 차트, 분류·집계·계산 로직 **전부 무변경**이다.
`getTableGroupKey`의 `'category'` 분기도 남겨 뒀다 — '전체'가 그 키로 그룹을 만들기 때문에
지우면 자산군 목록이 통째로 사라진다(주석으로 못박음). 375px에서 2×2로 접히던 배치가 3열 한
줄이 됐고(`grid-cols-2 sm:grid-cols-4` → `grid-cols-3`), 한 줄로 만들려고 글자를 줄이거나
잘라내지 않았다(버튼 높이 44px · 폰트 14px · clipping 0 · 가로 overflow 0, 6뷰포트 실측).

변경 파일 6개: `index.html` · `sw.js` · `js/07`(주석만) · `js/08`(주석만) ·
`e2e/26` · `e2e/77`. **로직 변경은 `index.html` 버튼 제거뿐이다.**

**20-2. v233 — 대시보드 / 미래예측 UX 정리 (`d24cdb3`)**

| 대상 | 변경 |
|---|---|
| 총금융자산평가손익 카드 | [세부내용] 버튼과 누적 평가손익 추이 팝업 제거 + 설명문 2줄 제거. 카드의 숫자(현재가−매입원가, 부동산 제외)와 팝업의 누적 추이(`dailySnapshots` 기반, 부동산 포함)는 **기준이 서로 달라** 같은 카드 안에서 "그 숫자의 내역"으로 오해되기 쉬웠다 — 차이를 설명하는 문구를 덧붙이는 대신 진입 자체를 없앴다. 제목·실현손익 배지·평가손익·수익률·매입원가 기준·금융자산 평가금액·소유자별/자산군별 chip은 그대로 |
| 국내/해외 자산 Top 5 | 카드 2개 전부 제거. 같은 정보를 자산목록에서 볼 수 있다 |
| 시장 현황 & 매크로 브리핑 | 지수 타일과 해석을 분리해, 하단 해석(시장 종합 평가 / 내 포트폴리오 영향 / 참고 / 상관관계 가이드)만 `#macroDiagnosisToggleBtn` 아코디언으로 접었다. **지수 종류·데이터 수집·계산 무변경**, 아래 RISK 관리 카드 무변경 |
| 수익률 직접 조정(고급) | 미래예측 탭 시나리오 안내문 아래 작은 회색 링크였던 것을, 포트폴리오 탭의 "전체 포지션별 목표비중 분석"과 "종목별 실행 가이드" **사이 독립 긴 버튼**으로 이동. 같은 id를 유지해 기존 핸들러(`openScenarioRateManagerModal`, js/05)와 기존 [수익률 관리] 팝업을 그대로 쓴다 — **JS 변경 0줄** |

승인 문구(그대로 유지): **"⚙ 수익률 직접 조정 (고급)"** /
**"자산별 수익률 가정을 직접 설정할 수 있습니다."** — "(고급)" 라벨과 중립 색을 유지해
고급 설정이라는 성격을 보존했고, **변동성까지 설정한다고 쓰지 않는다.**

계산 계층 전부 무변경(`js/01·05·06·08·09·12·13·15~22` diff 0). Return Key ·
`SCENARIO_RATE_PRESETS` · Monte Carlo · deterministic projection · Risk Engine · Macro 수집 ·
동기화 · Cloud schema · Excel 구조 **어느 것도 건드리지 않았다.**

**20-3. v234 — 매크로 브리핑 실가시성 수정 (`6628653`)**

v233 배포 후 사용자가 두 가지를 제보했다. ① 대시보드에 들어와도 지수·환율·금리가 하나도
보이지 않는다 ② 「📌 시장 해석 보기」를 눌러도 아무것도 나타나지 않는다. READ-ONLY 조사에서
**둘 다 사실로 확인**됐고, 원인이 서로 달랐다.

| 문제 | 원인 | 분류 |
|---|---|---|
| 지수가 안 보임 | 결함이 아니라 **의도 불일치**. Phase 17 P1-1이 매크로 브리핑 전체를 기본 접힘(`macroBriefingOpen = false`)으로 두었고, 지수 타일은 그 안에 있었다. v233 보고서의 "지수 카드는 항상 표시"는 "**브리핑을 펼치면** 항상 표시"의 조건절을 누락한 부정확한 서술이었다 | 요구사항/구현 의도 불일치 |
| 해석이 안 열림 | **render lifecycle 결함**. 안쪽 `max-height`에 300ms 트랜지션이 걸려 있어, 클릭 직후 동기적으로 읽은 바깥 `scrollHeight`에는 아직 접힌 높이가 잡혔다. 그 값으로 바깥 `max-height`가 고정되면서 안쪽이 다 펼쳐져도 **부모가 통째로 잘라냈다**(6뷰포트 전부 해석 389px 중 **0px** 노출, 3단 상관관계 가이드는 263px 중 107px). 5분 자동 갱신이나 탭 왕복이 우연히 되살려 "가끔 되고 가끔 안 되는" 증상으로 보였다 | 신규 회귀(v233 도입) |

**수정 (최소 변경, `js/10` 실질 7줄)**

| 항목 | 내용 |
|---|---|
| FIX-1 clipping | 정적 DOM인 `#macroBriefingBody`에 `transitionend` 리스너 **1개**를 달아, 안쪽 트랜지션이 끝난 뒤 바깥 높이를 다시 확정한다. `transitionend`가 버블링되므로 2단(해석)과 3단(상관관계 가이드)을 **한 리스너로** 덮고, 매 렌더마다 새로 그려지는 가이드에도 **재등록이 필요 없다**. 바깥 자신의 트랜지션은 건너뛰어 순환을 막는다 |
| FIX-2 기본 표시 | `macroBriefingOpen = false` → `true`. 첫 페인트부터 깜빡임이 없도록 `#macroBriefingBody`의 `max-height:0px` 인라인 초기값 제거 + chevron 초기 상태를 펼침으로 맞춤. **헤더로 접었다 펴는 기능은 그대로** |
| 유지 | `setAccordionOpen()` · `reapplyMacroDiagnosisAccordionHeight()` · `reapplyMacroBriefingAccordionHeight()` · 기존 토글 핸들러 3개 · 기존 즉시 계산 **전부 무변경** |
| 가이드 | 상관관계 가이드의 **내용·문구 변경 0건** — 같은 메커니즘으로 clipping만 해소 |

**지표 10종 그대로 유지 · 추가/삭제/순서변경 0건**:
VIX · 원/달러 · 美 10년물 금리 · 금 시세 · 달러인덱스 · 코스피 · 코스닥 · S&P 500 · 나스닥 · 다우.
데이터가 없을 때의 기존 표현(`-` / `조회 전` / `조회 실패`)도 그대로이며,
**결측이라고 카드를 접거나 숨기지 않는다**(`e2e/80` B 테스트로 고정).

**20-4. v234 회귀 테스트 보강 — 이 결함을 놓친 이유**

기존 검사가 **"그 요소 자신의 `height > 0`"만** 봤기 때문에 통과했다. 잘리는 쪽은 자식이
아니라 **부모**라서, 자식은 389px 멀쩡한 채로 화면에는 0px만 나온다. `e2e/79`의 그 검사가
정확히 이 위양성이었다.

`e2e/80-macro-accordion-visibility.spec.js`(신규 13건)는 요소의 사각형을 **overflow를 자르는
조상들로 차례로 깎아** "사용자가 실제로 보는 높이"로 검증한다 — 지수 10개 기본 표시, 결측 시
카드 유지, 해석 열기/닫기/재열기, 재렌더 후, 탭 왕복 후, 3단 가이드, 1단 접기/재펼침,
375·768·1024 × Light·Dark. `e2e/79`의 위양성 검사도 같은 방식으로 교체했고, 기본 펼침으로
바뀐 `e2e/39` · `e2e/67`의 진입 절차를 맞췄다. **테스트를 약화시켜 통과시키지 않았다.**

**20-5. Observation (v234에서 수정하지 않는다 · 개발 과제로 승격하지 않는다)**

| ID | 내용 | 처리 |
|---|---|---|
| **OBS-1** | 토글 버튼 2개의 touch target이 44px 미만 — `macroBriefingToggleBtn` **24px**, `correlationGuideToggleBtn` **20px**(`macroDiagnosisToggleBtn`은 44px) | v234 **이전부터 동일**하며 이번 변경으로 나빠지지 않았다. 기존 UX observation으로 기록하고 **별도 backlog 후보로만 보존한다.** **V1.4 착수 근거로 사용하지 않는다** |
| **OBS-2** | 매크로 10개 기본 표시로 RISK 관리 카드가 375px 기준 약 **269px 아래로 이동**(`1027px` → `1296px`) | **v234의 의도된 결과**로 기록한다. 변경 전에도 이미 첫 viewport(812px) 밖이었다는 사실을 함께 기록한다. **Risk 카드 자체는 수정하지 않으며** 별도 기능 변경으로 확대하지 않는다 |
| **OBS-3** | 브라우저 resize 시 px 기반 accordion `max-height`가 즉시 재계산되지 않는다 | 앱의 **모든 아코디언에 공통인 기존 전역 특성**이다. v234에서 수정하지 않으며 **전역 accordion refactor로 확대하지 않는다** |
| **OBS-4** | 중첩 아코디언의 약 **600ms 순차 애니메이션**(안쪽 300ms → 바깥 300ms) | 승인된 `transitionend` 보정 구조의 결과다. **최종 표시 결과에는 문제가 없다.** 현재 수정하지 않는다 |

**20-6. 안전 / 검증 (v234)**

- **계산 로직 변경 0건 · 데이터 구조 변경 0건 · Risk 구조 변경 0건.**
  `js/09`(Macro 수집·Risk 엔진) · `js/05`(deterministic projection) · `js/15·16·17`(Monte Carlo) ·
  `js/20`(inflation) · `js/21`(safety layer) · `js/12`(Cloud Sync · P1-1) · `js/01`(core state/SoT) ·
  `js/06`(tax) · `cloudflare-worker*` · `data/` **전부 무변경**.
  `SCENARIO_RATE_PRESETS` · Return Key · `MACRO_TICKERS` · `INDEX_TICKERS` ·
  `RISK_ELIGIBLE_CATEGORIES` **diff 등장 0건**.
- **신규 Macro indicator 0건 / Macro→Risk 정량 연결 0건**(§10 정책 유지).
  Excel · asset/transaction SoT · tax scope · FX 모델 무변경. `aria-expanded` 미추가.
- **실제 사용자 데이터 접근 0건 / 변경 0건 / JSON·Excel import 0건 / Production Cloud write 0건.**
  조사·구현·검증 전 과정에서 합성 fixture만 사용했고, Cloud Worker 호스트는 DNS 격리
  EXCLUDE 목록에 넣지 않아 요청 자체가 차단된 상태에서 측정했다(§16 Data-Safety Rule 준수).
- 테스트: ESLint PASS · Unit **290/290** · E2E **776/776** · Golden PASS ·
  Data Guard PASS · Release Guard PASS.
- production: GitHub Pages **auto deploy SUCCESS**(run `34692075752`, build `built`, 41.2초,
  error null), deployed SHA = origin/main = local HEAD = `6628653e76b1fd9ad48bd1470a0db99b158ac912`,
  HTTP 200, `appVersionLabel` **v234**, SW `smart-asset-manager-v234`,
  배포본 SHA-256 = 커밋 artifact **일치**, P1-1 동기화 코드 생존 확인.
  **수동 deploy · workflow dispatch · rerun 0건.**
- production 브라우저 smoke — 375·768·1024 × Light·Dark **6뷰포트 전부 PASS**:
  지수 10개 최초 표시 PASS · 시장 해석 열기/닫기/재열기 PASS · 상관관계 가이드 clipping 없음 ·
  탭 왕복 PASS · JS runtime error **0** · 가로 overflow 없음 · 최소 폰트 **14px**.
- **v233 → v234 / production release 완료 — RELEASED · ACCEPTED WITH OBSERVATION.**

**20-7. 표현 기준 (기록 시 지켜야 할 것)**

이 릴리스를 "모든 Macro UX 문제 해결" / "Accordion 문제 전부 해결" / "UX 전면 개선 완료" /
"V1.4 착수"로 표현하지 않는다. 정확한 표현은 다음 한 문장이다.

> **사용자가 제보한 v233 Macro 표시 / 시장해석 가시성 문제를 v234에서 해결했으며,
> 기존 touch target 및 전역 resize 특성은 observation으로 남겼다.**

**v234 이후에도 V1.4를 시작하지 않는다.** 현재 단계는 **STABILIZATION / OBSERVATION**이며,
다음 공식 운영 마일스톤은 기존 결정대로 **2026-12경 RET-02 첫 정기 검토**다(§8-1 정책·주기·
횟수 **변경 없음**).

**20-8. v237 이후 구조 변경 안내 (v237 closeout 추가 — 위 20-2~20-7은 당시 기록으로 보존)**

v237(§23)에서 매크로 브리핑 구조가 바뀌어, 위 기록 중 다음 항목은 **현재 코드에 더 이상 해당하지 않는다.**

| 위 기록 | v237 이후 |
|---|---|
| 20-2 v233 표 — 하단 해석을 `#macroDiagnosisToggleBtn` 아코디언으로 접음 | 접기 자체는 유지. 라벨만 「📌 시장 해석 보기」 → **「📌 세부 내용 보기」** |
| 20-3 FIX-1 — `#macroBriefingBody`의 `transitionend` 높이 보정 | **제거**. 중첩 아코디언이 없어져 보정이 필요 없다 |
| 20-3 FIX-2 — 브리핑 1단 기본 펼침 · "헤더로 접었다 펴는 기능은 그대로" | **1단 접기 자체를 제거**. 제목은 버튼이 아니며 항상 펼쳐져 있다 |
| 20-3 — 3단 상관관계 가이드 아코디언 | **토글 제거**. 세부 내용 안에 제목과 목록을 바로 표시한다(문구 변경 0) |
| 20-4 — `e2e/80`의 "1단 접기/재펼침" 검사 | 새 구조 기준으로 재작성(13건 유지) |
| 20-5 OBS-1 — `macroBriefingToggleBtn` 24px · `correlationGuideToggleBtn` 20px | 두 버튼이 **v237에서 사라졌다**. KPI `.detail-btn` 25px 등 다른 보조 터치타깃 observation은 그대로다 |
| 20-5 OBS-4 — 중첩 아코디언의 순차 애니메이션 | 중첩이 없어져 **해당 없음** |

OBS-2(Risk 카드 위치)와 OBS-3(resize 시 `max-height` 재계산)은 v237에서 재측정하거나 변경하지 않았다.

## 21. 일별 이력 보존·복구 — 데이터 보존 (v235 · PM Approval 2026-09-13)

§6 V1.1 핵심 목적("사용자가 입력한 자산 정보가 어떤 경로로도 조용히 사라지지 않게 한다")에 직접 걸리는
**데이터 보존 결함**을 고친 릴리스다. 기능 확장이 아니다.

**21-1. 문제**

| 결함 | 원인 |
|---|---|
| 과거 일별 이력 소실 | `remediateDuplicatedDailySnapshotHistory()`(js/01)가 오늘 이전 스냅샷을 1회성으로 **통째로 삭제**했다. 재채움을 맡기로 한 소급 채우기는 지문(`sam_daily_backfill_done_fingerprints_v2`)에 이미 있는 자산을 건너뛰어 대상이 0건이 됐고, 부동산·채권·현금·달러는 티커가 없어 **어떤 경로로도 되살릴 수 없었다** |
| 사실 아닌 수평선 차트 | `reconstructHistoricalCurValues()`(js/11)가 기록 없는 과거 날짜에 스냅샷을 새로 만들고, 역산 근거가 없어 **오늘 값을 과거로 복제**했다 — 화면에는 수개월간 변동 없는 수평선으로 보였다 |
| 이중 가산 위험 | 소급 채우기가 `dailyPnL`을 더하는(`+=`) 구조라, 기존 기록이 있는 날짜에 겹치면 손익이 부풀려진다(실측: 기존 30일이 1,000원 → 2,000원) |

**21-2. PM 결정**

| 항목 | 결정 |
|---|---|
| R-1 마이그레이션의 과거 스냅샷 삭제 | **해소** — 삭제 자체를 중단한다(POLICY-SNAPSHOT-PRESERVATION). "중복 가능성이 있다"는 이유로 되살릴 수 없는 기록을 지우지 않는다 |
| R-5 신규 자산의 소급 | **승인** — 이력이 이미 있는 기기에 새 자산을 더해도, 이미 기록된 과거 날짜에는 소급하지 않는다. 실제로 보유하지 않았던 과거에 자산을 끼워 넣지 않는다 |
| `PLACEHOLDER_MIN_RUN` | **14일 확정** |
| R-3 기록 없는 구간의 차트 표현 | **BACKLOG**(`FIX-3-FULL`) — v235에서 차트 UI를 바꾸지 않는다 |
| R-6 구 키 `sam_daily_backfill_done_ids_v1` | **OBSERVE** — 현재 코드가 읽지 않으므로 삭제 마이그레이션을 추가하지 않는다 |

**21-3. 구현 (최소 변경)**

| 구분 | 지점 | 내용 |
|---|---|---|
| **FIX-1** | `remediateDuplicatedDailySnapshotHistory()` | 과거 스냅샷을 **지우지 않는다**. 지문을 무조건 비우거나 채우지도 않는다. 완료 플래그만 한 번 남긴다(`case: 'PRESERVED'`) |
| **FIX-1** | `backfillAllHoldingsDailyPnlHistory()` | 패스 **시작 시점**에 이미 있던 날짜를 `preExistingDates`로 한 번만 확보해 보호한다. 같은 패스 안에서 새로 만든 날짜에는 여러 자산이 정상 누적된다 |
| **FIX-1 / R-5** | `backfillDailyPnlHistory(asset, protectedDates)` | 보호 날짜는 건너뛴다(`if (protectedSet.has(dateKey)) continue;`). 인자가 없으면 호출 시점의 모든 날짜를 보호한다 — 단건 호출부(js/06·js/07)는 이 기본값을 쓰므로 신규 자산이 기존 날짜에 소급되지 않는다. 빈 기기에서는 예전처럼 전 구간을 채운다 |
| **FIX-2a** | 데이터 관리 → [일별 이력만 복구] | 백업 파일에서 **`dailySnapshots`만** 읽는다. 전체 JSON 복원 경로를 쓰지 않는다. 미리보기 → 사용자 확인 → 저장 |
| **FIX-2a** | `planSnapshotRecovery()` | 순수 함수(미리보기 중 쓰기 0). invalid / confirmed missing / placeholder candidate / normal existing / conflict로 분류. **ADD MISSING ONLY** — 값이 다른 기존 날짜는 덮지 않고 충돌로만 보고한다 |
| **FIX-2a** | placeholder candidate | **자동 적용하지 않는다.** `includePlaceholders: true`가 명시적으로 주어진 경우(사용자 2차 승인)에만 교체한다. 판정은 6조건 AND — ① 오늘 이전 ② 모든 축 `dailyPnL` 0 ③ `cur` 구성이 오늘과 완전 동일 ④ 14일 이상 연속 ⑤ 백업에 같은 날짜 존재 ⑥ 백업 항목 형식 정상. 오늘 기록이 없으면 후보를 만들지 않는다 |
| **FIX-2a** | `applySnapshotRecovery()` | 저장 **1회**, 실패 시 메모리·저장소 원복. `persistDailySnapshots({ skipPush: true })` — 복구가 클라우드 업로드를 예약하지 않는다. **(⚠ 불완전한 서술 — §21-11 정정)** 인자 없는 기존 호출부의 push 예약 동작은 그대로다 |
| **FIX-3** | `reconstructHistoricalCurValues()` | 기록 없는 과거 날짜에 스냅샷을 **새로 만들지 않는다**. 오늘 값을 과거로 복제하지 않고, 실제 PnL 0을 만들어내지 않는다. 기존 스냅샷의 `cur` 재계산은 유지한다 |

assets · transactions · rebalance · projection · Return Key · customScenarioRates · category · categorySource ·
positionSource · quantity · buyPrice · buyRate · inflationRate · tickerRoles · learnedTickerNames · exchangeRate ·
dailyChangeRate — **변경 경로 0건**. Cloud Sync 구조 · Excel · Risk/Macro · FX · Bond · Monte Carlo · 차트 UI 무변경.

**21-4. 설계 근거 — 실제 백업 READ-ONLY 검증 (PM 승인 단계, 저장·복구·반입 0건)**

| 항목 | 결과 |
|---|---|
| 원본 보유 | 2026-09-07 ~ 09-10 백업 4개 모두 이력 보존. 09-10 백업이 나머지를 완전히 포함(395일, 형식 일탈 0) |
| 합성 피해 상태 Preview | confirmed missing **32일** + placeholder candidate **363일** = 백업 395일 전체, 충돌 0 |
| threshold 민감도 | 7 / 10 / 14일 모두 후보 363일(피해 구간이 단일 연속) |
| 정상 zero-PnL 오탐 | 실제 원본을 정상 데이터로 놓고 검사 시 **0일**(zero-PnL 112일 존재) |
| 백업 파일 | 읽기만 했다. 수정·복사·저장소 반입 0건. 금액·종목명은 기록하지 않았다 |

**21-5. 테스트 / 검증**

- 신규: `test/snapshot-recovery.test.js`(27) · `e2e/81-snapshot-recovery.spec.js`(35). fixture는 전부 합성 데이터다.
- 최종 게이트: **Unit 317/317 · E2E 811/811 · Golden 122/122 · ESLint 0 error / 0 warning · Data Guard PASS · Release Guard PASS**.
- **E2E 날짜 기준 문제(해소)**: RC 감사 중 KST 00:00~08:59에 **809/811**이 발생했다. 원인은 제품 코드가 아니라
  **테스트 코드의 UTC 날짜 계산**(`toISOString().slice(0, 10)`)이었다 — 앱은 로컬 날짜(`todayDateStr()`/`dateKeyFromDate()`)를 쓴다.
  테스트 파일 2개의 19줄을 앱과 같은 로컬 기준으로 고치고(브라우저 쪽은 앱 함수 재사용, Node 쪽은 `localDateKey()`),
  KST 06시대 실제 경계 조건(UTC 날짜가 하루 전)에서 **811/811**을 재검증했다. **제품 코드의 날짜 계산은 변경하지 않았다.**
- v235 bump 직후 첫 전체 실행에서 `e2e/78` T-03(P1-1 동기화)이 1회 실패했다. 단독 5/5 · spec 16/16 통과로 재현되지 않아
  타이밍 flaky로 판정했고, 커밋 전 전체 재실행에서 811/811을 확인했다(21-8 OBSERVE).
- 주석 정정(AUDIT-1): js/01·js/11의 현재 동작과 모순되던 주석 2곳 — 실행 로직 변경 0.

**21-6. Release**

- commit `1d5745de2a3c786d000063033f4e2fe759915510` — `fix: preserve and recover historical daily snapshots (v235)`
- GitHub Pages **auto deploy SUCCESS** — run `34721917506`(pages build and deployment), deployed SHA = origin/main = local HEAD.
  수동 deploy · workflow dispatch · rerun 0건.
- production: HTTP 200 · MIME 정상 · `appVersionLabel` **v235** · SW `smart-asset-manager-v235` ·
  배포본 SHA-256 = 커밋 artifact **10/10 일치** · P1-1 동기화 marker 유지 · FIX-1/FIX-2a/FIX-3 marker 확인.
- production 브라우저 smoke — 375 · 768 · 1024 × Light · Dark **6뷰포트 PASS**, runtime exception **0**,
  static asset failure **0**, Cloud write **0**(합성 fixture · 일회용 브라우저 컨텍스트).
- **v234 → v235 / production release 완료 — RELEASED.**

**21-7. 실제 사용자 데이터 안전성 — v235는 "복구 기능의 배포"이지 "실제 백업의 자동 복구"가 아니다**

v235 릴리스 과정(구현·테스트·배포·smoke)에서:
- 실제 사용자 localStorage 접근 **없음** · 실제 production state 접근 **없음** · 실제 Cloud 데이터 접근 **없음** · Cloud write **없음**
- 실제 백업 파일 접근 **없음** · 2026-09-10 실제 백업 **자동 복구 없음** · 실제 사용자 데이터 자동 변경 **없음**

(21-4의 백업 분석은 그보다 앞선 설계 단계에서 PM 승인 하에 READ-ONLY로만 수행했다.)

**실제 이력 복구는 아직 실행되지 않았다.** 다음 단계는 사용자가 직접 통제한다(21-9).

**21-8. OBSERVE / BACKLOG (v235에서 수정하지 않는다)**

| ID | 내용 | 상태 |
|---|---|---|
| OBS-v235-1 | `e2e/78` T-03 동기화 타이밍 flaky — 재현 안 됨 | **OBSERVE** |
| OBS-v235-2 | `test/snapshot-recovery.test.js` 머리 주석의 "7일"(실제 상수 14) | **OBSERVE** |
| OBS-v235-3 | js/11 소급 채우기 설명 주석의 오래된 매수단가 문장(v235 이전부터 존재, 아래 코드는 이미 매수단가 미사용) | **OBSERVE** |
| OBS-v235-4 | 구 키 `sam_daily_backfill_done_ids_v1` 잔존(R-6) | **OBSERVE** |
| FIX-3-FULL | 기록 없는 과거 구간의 차트 표현(historical no-data visualization, R-3) | **BACKLOG** |
| BOND-P1 · FX-P1 | 기존 분류 그대로 | **DEFERRED** |
| UX 보조 터치타깃 | v234 OBS-1(24/20px) 및 KPI `.detail-btn` 25px 등 | **OBSERVE** |

**21-9. Next Action — 실제 백업 이력 복구 (사용자 통제 · 별도 단계)**

2026-09-10 백업에 대해 사용자가 실기기에서 직접 진행한다.

1. 사용자가 백업 파일을 선택한다
2. Preview를 실행한다
3. 추가 / placeholder 교체 후보 / 충돌 결과를 확인한다
4. 사용자가 명시적으로 승인한다(교체 후보는 2차 승인)
5. `dailySnapshots`만 Apply한다
6. 복구 후 다른 데이터가 보존됐는지 검증한다

**전체 JSON restore는 사용하지 않는다. 자동 복구도 하지 않는다.**

**21-10. 프로젝트 방향**

- **v235 이후에도 V1.4를 시작하지 않는다.** 현재 단계는 **STABILIZATION / OBSERVATION**이다.
- 우선순위: ① 실제 사용자 데이터 복구 안전성 확인 → ② v235 운영 안정성 관찰 → ③ 사용자 피드백 수집 → ④ 정기 정책 검토.
- 다음 공식 운영 마일스톤은 기존 결정대로 **2026-12경 RET-02 첫 정기 검토**다(§8-1 정책·주기·횟수 **변경 없음**).
- §13 Out-of-Scope 및 기존 착수 금지 목록(AI · 새 Risk Score · Macro→Risk 정량 결합 · FX stochastic · 복잡한 Bond 모델 ·
  새 자산군 · Expert 설정 등)은 그대로 유지한다 — v235는 이 목록을 바꾸지 않는다.

**21-11. v236 closeout 정정 (2026-09-13 — 위 21-1~21-10은 v235 당시 기록으로 보존)**

| 위 기록 | 정정 |
|---|---|
| 21-3 `applySnapshotRecovery()` — "복구가 클라우드 업로드를 예약하지 않는다" | 함수 자체는 `skipPush: true`로 저장하지만, **v235 복구 핸들러는 적용 직후 `renderAll()`을 호출**했고 그 경로(`renderKPIs → recordDailySnapshot → persistDailySnapshots()`)가 push를 예약해 **동기화 ON 기기에서는 약 3초 뒤 업로드될 수 있었다**(v235 이후 READ-ONLY 감사의 합성 실험으로 확인). v236 P1-A에서 수정했다(§22-2) |
| 21-6 · 21-7 "Cloud write 0" | **v235 릴리스 과정**(테스트·배포·smoke)에 대한 사실이다. 복구 적용 경로 전체에 대한 보장으로 읽으면 안 된다 |
| 21-3 placeholder 6조건 중 ③ "`cur` 구성이 오늘과 완전 동일" | **v236 F2로 대체**(§22-3). 과거 `cur`은 부팅마다 재구성되는 파생값이라 판정 근거가 되지 못했다 |
| 21-8 OBS-v235-2 — 테스트 머리 주석 "7일" | v236에서 해당 주석이 F2 기준 설명으로 교체되어 **해소** |
| 21-9 Next Action | v235에서 실제 휴대폰으로 Preview만 실행(1차 확인창에서 취소)한 **사용자 보고 관찰값**: 추가 33 · 복구 후보 0 · 기존 유지 366 · 값이 달라 건너뜀 362 · 형식 오류 0. 이것이 v236의 계기가 됐다. **Apply는 실행하지 않았다.** 현재 Next Action은 §22-7, 현재 상태는 §24 |

## 22. 일별 이력 복구 안전성 — P1-A · P1-B F2 (v236 · PM Approval 2026-09-13)

> **상태: RELEASED(코드 배포) · RECOVERY UNRESOLVED · Recovery Apply BLOCKED.**
> v236은 복구 **기능의 안전성 수정을 배포**한 것이다. 실제 사용자 휴대폰에서 Recovery Apply는 **실행하지 않았고**,
> 실제 데이터의 최종 복구 대상도 **확정되지 않았다**. "복구 완료" · "데이터 복구 완료" · "Recovery 정상 완료" ·
> "historical snapshot 복원 완료" · "손상 데이터 정상 복원 확인"으로 표현하지 않는다. Preview를 실행하거나 취소한 것은 Apply가 아니다.

**22-1. 계기**

| 발견 | 내용 |
|---|---|
| Cloud 자동 업로드 (P1-A) | v235 복구 핸들러가 적용 직후 `renderAll()`을 호출해, 동기화 ON 기기에서 복구 결과가 약 3초 뒤 업로드될 수 있었다(§21-11). 완료 토스트의 "클라우드에는 올리지 않았습니다"도 이 경우 사실과 달랐다 |
| placeholder 판정 사각지대 (P1-B) | v235 조건 ③("과거 `cur` = 오늘 `cur`")은 최근 실제 손익 기록 뒤의 부팅 재구성, 세션 중 시세 변화, USD 현금 키 차이(`'달러'`/`'현금'`), 부동소수점 덧셈 순서 차이 중 하나만 있어도 진짜 placeholder를 놓쳤다. 반대로 티커 없는 자산만 가진 정상 이력은 후보로 잘못 분류했다(합성 실험) |

**22-2. P1-A — Recovery Apply 처리 중 Cloud POST 방지**

- 복구 핸들러에서 사용자가 확인한 뒤의 구간만 `clearTimeout(pushDebounceTimer)` → `applyingRemoteUpdate = true` →
  `applySnapshotRecovery()` + `renderAll()` → `finally`에서 `false`로 감쌌다. JSON 복원과 같은 기존 가드를 재사용했다.
- 전역 `schedulePush` 차단 · `syncState` 변경 · Sync 함수 시그니처 변경 · Cloud schema 변경 **없음**.
  대기 중이던 push 예약 취소는 **전송 지연**이며 로컬 데이터는 그대로다.
- 안내 문구 — 1차 확인창: "복구 적용 중에는 클라우드에 저장하지 않습니다." / "이후 일반 동기화가 실행되면 복구 결과가 반영될 수 있습니다."
  완료 토스트: 동기화 OFF "클라우드에는 올리지 않았습니다." / ON "복구하는 동안에는 클라우드에 올리지 않았습니다. 이후 정상 동기화에서 이 기기의 변경사항이 반영됩니다."
- **정확한 의미**: Recovery Apply 처리 자체에서 Cloud POST가 발생하지 않도록 보호되었으며, 관련 테스트(실제 UI 경로 · Worker route 가로채기 — 동기화 OFF · ON · 대기 중인 push 예약이 있는 경우)와 production smoke(Apply 호출 없음)에서 Cloud write 0을 확인했다.
  **동기화가 켜져 있으면 복구 이후의 일반 동기화에서 이 기기의 이력이 Cloud에 반영될 수 있다** — "Cloud에 절대 쓰이지 않는다"는 뜻이 아니다.
  **Recovery Apply는 실제 사용자 데이터에 대해 아직 실행하지 않았다.**

**22-3. P1-B — F2 placeholder candidate 탐지 기준**

목적: placeholder로 의심되는 historical `dailySnapshots` 구간을 현재 데이터와 백업 데이터를 비교하여 **보수적으로 식별**하기 위한 조건이다.
**이것은 복구 대상 확정 규칙이 아니라, 현재 구현된 placeholder candidate 탐지 기준이다.** 실제 사용자 데이터에서의 최종 후보 확정은 Recovery Preview 및 별도 사용자 확인 이후에 이루어진다.

날짜 d는 아래를 모두 만족할 때만 "복구 후보"다(`detectPlaceholderCandidates`, js/12):
1. d는 오늘 이전이고, 백업의 최대 날짜 이하다
2. 현재 d의 모든 축(total / byOwner / byOwnerCategory) `dailyPnL`이 0이다
3. d가 속한 달력상 연속 zero-PnL 구간 R의 길이가 `PLACEHOLDER_MIN_RUN`(**14**) 이상이다
4. R 가운데 백업에 유효 snapshot이 있는 날짜 n개 중, 어느 축이든 `dailyPnL ≠ 0`인 날짜가 max(1, ceil(n × `PLACEHOLDER_BACKUP_PNL_RATIO`)) 이상이다 — 비율 **0.25**
5. 백업에 d의 유효 snapshot이 있다

- **현재 `cur`와 백업 `cur`(또는 오늘 `cur`)의 단순 숫자 비교는 후보 판단의 근거로 사용하지 않는다.** 백업 값이 현재와 다르다는 사실만으로 후보로 판정하지 않는다.
- `snapshotCurShape` · `SNAPSHOT_SHAPE_CATEGORY_ALIAS`(v236 RC 중 검토한 USD 키 정규화)는 **릴리스되지 않고 제거**되었다.
- 분류 순서 유지: 형식 오류 → 현재에 키 없음 = added → 후보 → 충돌. **missing(added) 복구와 후보 교체는 서로 독립**이며, 후보 교체는 사용자 2차 승인(`includePlaceholders: true`) 없이는 일어나지 않는다.

**기준값과 실제 검증 범위 (구분해서 기록한다)**
- 현재 코드 기준값: `PLACEHOLDER_MIN_RUN = 14` · `PLACEHOLDER_BACKUP_PNL_RATIO = 0.25`(PM 확정).
- 기준값의 근거: 2026-09-10 실제 백업의 `dailySnapshots`만 READ-ONLY로 읽은 통계 — 유효 snapshot 395개(2025-08-06 ~ 2026-09-09) ·
  정상 zero-PnL 최대 연속 3일(14일 이상 구간 0개) · 휴대폰 362일 대응 구간(2025-09-13 ~ 2026-09-09)의 백업 손익 기록 256/362 = 70.72% ·
  7~30일 창별 최저 비율 50%. 합성 상태(P0~P11)에서 진짜 placeholder FN 0 · 정상 이력 FP 0.
- **이 기준값이 실제 사용자 데이터에 대해 최종 검증된 것은 아니다.** 위 통계는 백업 파일 1개에 대한 것이며, 다음은 **미확정**이다.
  - 실제 휴대폰의 362일 손상/placeholder 구간이 F2 조건을 만족하는지
  - 실제 Recovery 후보 날짜가 최종적으로 몇 일인지
  - Recovery Apply 후 historical graph가 의도대로 복구되는지
  - P8 다른 계보 백업 위험에 대한 최종 사용자 확인
- 백업 통계 값은 코드에 하드코딩하지 않았다. 테스트 fixture는 전부 합성 데이터다.

**22-4. P8 — 다른 계보 백업: 사용자 확인 단계의 제한적 통제**

- 사용자가 계보가 다른 백업(다른 가계·다른 포트폴리오의 파일)을 고르면, 그 파일에 손익 기록이 있는 한 **F2로는 자동 판별하지 않는다**(합성 P8: 후보 362 — threshold로 분리할 수 없음).
- 현재 정책: **2차 확인 과정에서 사용자가 백업 metadata를 확인**한다 — 내보낸 시각(`exportedAt`, KST 변환) · snapshot 이력 기간(시작일 ~ 종료일) · 소유자 목록 · 복구 후보 일수. 파싱한 백업에 이미 있는 값만 사용하며, 새 fingerprint · 계정 식별자 · Cloud schema는 만들지 않았다.
- 이것은 **완전한 lineage 검증 시스템이 아니다.** **P8 위험을 사용자 확인 단계에서 관리하는 현재의 제한적 통제**다.

**22-5. 테스트 / Release**

- `test/snapshot-recovery.test.js` 47건(F2 진짜 placeholder 9종 · 정상 zero-PnL · 장기 zero · P8 한계 · 비율 24/25% · 연속 13/14일 · 최신 날짜 · 백업 결측/형식 오류 · 33일 added 분리 · metadata) ·
  `e2e/81-snapshot-recovery.spec.js` 44건(UI 경로 Cloud POST 0 · 확인창 문구 · metadata · 최근 실제 손익 + 부팅 재구성 · 경계값).
- 최종 게이트: **Unit 337/337 · E2E 820/820 · Golden 122/122 · ESLint 0 error / 0 warning · Data Guard PASS · Release Guard PASS**.
- commit `94f154465d7eb76237f7357923483c7fb05e65b6` — `fix: keep recovery apply off the cloud and detect placeholders by PnL gaps (v236)`. push 1회.
- GitHub Pages run `34731709210` completed / success, build commit 일치.
- production: HTTP 200 · `appVersionLabel` **v236** · SW `smart-asset-manager-v236` · 웹 자산 SHA-256 **25/25** 일치 · 민감 경로 7개 404 ·
  375 · 768 · 1024 × Light · Dark **6뷰포트 PASS** · runtime exception 0 · F2 경계값(합성) 확인 · Cloud 요청 **0** · Recovery Apply 호출 **0**.

**22-6. 실제 사용자 데이터 안전성**

v236 구현·검증·배포 과정에서 실제 휴대폰 state · 실제 사용자 localStorage · 실제 Cloud 데이터 접근 **없음**, Cloud write **없음**, Recovery Apply **없음**.
실제 백업은 PM 승인 단계에서 `dailySnapshots`만 READ-ONLY로 읽었고(SHA-256 · size · mtime 전후 동일), 복사 · 저장소 반입 · fixture 사용은 없었다.

**22-7. Next Action — Recovery Apply는 BLOCKED 유지**

1. 사용자가 휴대폰에서 현재 production(v237) 로딩을 확인한다
2. [일별 이력만 복구] → 2026-09-10 백업 선택 → **1차 확인창의 숫자만 기록하고 취소**한다(추가 · 복구 후보 · 기존 유지 · 건너뜀 · 형식 오류)
3. 결과를 PM에게 보고한다. 예상(추가 33 · 복구 후보 362 · 건너뜀 0 · 형식 오류 0)과 다르면 즉시 중단한다
4. **Recovery Apply는 PM의 별도 승인 전까지 실행하지 않는다.** 전체 JSON restore · 자동 복구 금지

## 23. 매크로 브리핑 UX 단순화 (v237 · PM Approval 2026-09-13)

> **상태: RELEASED · ACCEPTED.** 목적: 「시장 현황 & 매크로 브리핑」의 beginner-first UX 단순화.
> **v236 Recovery와 무관한 독립 릴리스**다.

**23-1. 변경**

1. 「시장 현황 & 매크로 브리핑」 전체 드롭다운 제거
2. 제목 우측 상하(Chevron) 아이콘 제거
3. 제목 클릭으로 전체 브리핑을 접는 동작 제거
4. 매크로 지표 10개 항상 표시(VIX · 원/달러 · 美 10년물 금리 · 금 시세 · 달러인덱스 · 코스피 · 코스닥 · S&P 500 · 나스닥 · 다우)
5. 「📌 시장 해석 보기」 → **「📌 세부 내용 보기」**
6. 상세 해석 영역만 accordion 유지(`#macroDiagnosisToggleBtn`, Chevron 유지, 높이 44px)
7. 내부 「상관관계 가이드 보기」 토글 제거 — 세부 내용 안에 제목과 목록을 바로 표시(문구 변경 0)
8. Risk Management 영역은 변경하지 않음

> **시장 현황 & 매크로 브리핑 제목 우측의 상하 아이콘은 제거되었으며, 상단 브리핑 영역은 항상 펼쳐진 상태로 표시된다.
> 접기/펼치기는 '세부 내용 보기' 영역에서만 수행한다.**

변경 파일 5개: `index.html`(매크로 섹션 마크업 · 버전 표기) · `js/10-risk-translation-alerts.js`(브리핑 접기 로직 정리 — `macroBriefingOpen` · 제목 리스너 · 상관관계 가이드 토글 · `transitionend` 보정 제거) ·
`e2e/80-macro-accordion-visibility.spec.js`(새 구조 기준 재작성, 13건) · `e2e/67-v12a-macro-clarity.spec.js`(낡은 주석 2줄) · `sw.js`.

**23-2. 범위 밖 — v237에 변경 없음**

Recovery · `dailySnapshots` · P1-A/P1-B 로직 · `buildSnapshotSeries` · backfill · `reconstructHistoricalCurValues` · Cloud Sync · Monte Carlo ·
Return Key · Risk Score · Macro→Risk 정량 연결 · FX stochastic · Bond model · AI · 자산군 추가 · 세금 구조 · 전문가 설정 — **변경 0건**.
매크로 지표 종류 · 데이터 수집 · 계산 · 해석 문구도 그대로다.
- `js/04-rebalancing.js`의 stale `correlationGuideToggleBtn` 주석은 v237에서 수정하지 않았다.
- `.claude/launch.json`은 기존 dirty 상태이며 v237 commit에 포함되지 않았다.

**23-3. 테스트 / Release**

- **Unit 337/337 · E2E 820/820 · Golden 122/122 · ESLint 0 error / 0 warning · Data Guard PASS · Release Guard PASS**.
- commit `1bf07ab1a51f9507c36842a882cd8ae5b4ba0355` — `feat: simplify macro briefing UX (v237)`. push 1회.
- GitHub Pages deployment run `34738712186` completed / success, build commit `1bf07ab`.
- production: v237 확인(`appVersionLabel` v237 · SW `smart-asset-manager-v237`) · 웹 자산 SHA-256 **25/25** 일치 · 민감 경로 7개 404 ·
  **8개 viewport**(375 / 768 / 1024 / 1440 × Dark / Light) 검증 — 가로 overflow 0 · runtime exception 0 · Cloud 요청 0 · Recovery Apply 0.
- 375px Dark Mode: 제목 1줄 · 제목 우측 Chevron 없음 · 매크로 지표 10개 표시 · 「세부 내용 보기」에만 Chevron 존재 · 상세 내용 accordion 정상 · Risk Management 영역 정상.

**23-4. OBSERVE (v237에서 수정하지 않는다)**

| ID | 내용 | 상태 |
|---|---|---|
| OBS-v237-1 | `js/04-rebalancing.js:492` 주석이 제거된 `correlationGuideToggleBtn`을 예시로 언급 — 동작 영향 없음 | **OBSERVE** |
| OBS-v237-2 | 375px에서 5열 고정 지표 타일의 일부 라벨 말줄임("VIX(공…", "美 10…", "달러…") — v237 전후 동일한 기존 표시 | **OBSERVE** |

## 24. 현재 프로젝트 상태 (2026-09-13 closeout 기준)

| 구분 | 항목 | 상태 |
|---|---|---|
| **RELEASED / ACCEPTED** | v237 Macro UX(§23) | **RELEASE ACCEPTED** · 현재 production = v237 |
| **RELEASED (코드)** | v236 Recovery 안전성 P1-A · P1-B F2(§22) | 코드 배포 완료 · **Recovery 문제 해결 미완료** |
| **BLOCKED** | 실제 사용자 데이터 Recovery Apply | **BLOCKED** — 휴대폰 Preview(1차 확인창 취소) 결과를 PM이 확인하고 별도 승인하기 전까지 실행하지 않는다 |
| **DEFERRED** | BOND-P1 · FX-P1 · FUTURE-P1-BL-01 · UX-P1 | 기존 분류 그대로 |
| **BACKLOG** | FIX-3-FULL(기록 없는 과거 구간의 차트 표현) | 기존 분류 그대로 |
| **OBSERVE** | OBS-v235-1 · OBS-v235-3 · OBS-v235-4 · OBS-v237-1 · OBS-v237-2 · v234 OBS-2 · OBS-3 · UX 보조 터치타깃(KPI `.detail-btn` 25px 등) | 기존 분류 그대로 |

- 현재는 **v237 이후 STABILIZATION / OPERATIONS 단계**다. V1.4를 시작하지 않는다.
- 다음 자연스러운 공식 milestone은 **RET-02 Return Key Quarterly Review의 첫 공식 검토 시점인 2026-12경**이다.
- **RET-03 2026-09-09 감사는 RET-02의 공식 1회차로 소급하지 않는다**(§8-2 RET-02-08 그대로).
- §13 Out-of-Scope 및 기존 착수 금지 목록(AI · 새 Risk Score · Macro→Risk 정량 결합 · FX stochastic · 복잡한 Bond 모델 · 새 자산군 · Expert 설정 등)은 그대로 유지한다.

## 25. 과거 일별 이력 무결성 — P0 Historical Snapshot Integrity (PM Approval 2026-09-13 · v238 릴리스)

> **상태: v238 릴리스 (PM Release Approval 2026-09-13) · v237 → v238.** 릴리스 노트·후속 backlog는 §25-8.
> **Recovery Apply는 계속 BLOCKED**이며, 이 절의 구현은 실제 사용자 데이터에 어떤 복구도 실행하지 않았다(§24).

**25-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **D1** | 부팅·pull·엑셀/JSON 가져오기의 자동 재구성(`reconstructHistoricalCurValues`)이 기존 과거 스냅샷의 `cur`을 지금 보유 자산 기준으로 다시 계산해 덮어쓰지 않는다 |
| **D2** | 자동 소급 채우기(`backfillDailyPnlHistory` · `backfillAllHoldingsDailyPnlHistory`)가 기록이 없는 과거 날짜를 지금 수량·가격·환율로 만들어내지 않는다. 오늘 기록(`recordDailySnapshot`)과 사용자가 명시적으로 입력하는 현재 데이터는 그대로다 |
| **D3** | 스냅샷 존재 + 값 0 → 0 / 스냅샷 존재 + 값 → 값 / **스냅샷 없음 → null(공백)**. 그래프·요약에서 "기록 없음"을 0원으로 표시하지 않는다 |
| **D4** | 백그라운드 과거 이력 변경이 끝나기 전 Preview가 흔들리는 구조를 허용하지 않는다 — **원인(자동 과거 이력 변경) 자체를 제거**해 해결했다. 별도 상태 머신·UI 없음 |

**25-2. 백업 `cur`의 의미 (정책)**

2026-09-10 백업의 최근 1년 `cur`은 READ-ONLY 분석에서 **백업 시점 보유 자산을 anchor로 역산된 파생값**으로 확인됐다
(인접일 관계식 일치 364/365, 소유자 = 자산군 합 789/790, 합계 = 소유자 합 395/395).
- 백업에서 복구할 수 있는 것: 날짜 · `dailyPnL` · owner/category 키 · 스냅샷 구조 · 백업에 실제로 존재하는 historical snapshot.
- 백업 `cur`은 **"2026-09-10 시점 데이터 구조에서 계산되어 저장된 historical snapshot value"**로 취급한다. 복구 시 `cur`을 버리지는 않지만,
  UI·문서에서 **"해당 날짜의 실제 계좌 평가금액"이나 검증된 historical valuation fact로 표현하지 않는다.**

**25-3. 구현 (코드 변경 범위)**

| 파일 | 변경 |
|---|---|
| `js/11-refresh-history.js` | `backfillDailyPnlHistory` · `backfillAllHoldingsDailyPnlHistory` · `reconstructHistoricalCurValues` — 기존 호출부(js/06·07·12)가 깨지지 않도록 이름만 남기고 **과거 이력을 읽거나 쓰지 않으며 과거 시세도 조회하지 않는다**(D1·D2). 지문 헬퍼(`getBackfillFingerprint` 등)는 JSON 복원이 쓰므로 유지 |
| `js/11-refresh-history.js` | `buildSnapshotSeries` — 없는 날 `{ recorded: false, total: null }`. `buildTotalValueSeries` — null 유지. `seriesAmountForOwner` — 기록 없음 null, 기록된 날 소유자 항목 없음 0 |
| `js/11-refresh-history.js` | `renderMultiSeriesLineChart` — 합계·소유자 라인 null, `spanGaps: false`, 툴팁에서 null 제외. `renderDailyPnlChart` — 기록 없는 날 막대 없음(기록된 0원은 0 막대) |
| `js/11-refresh-history.js` | `renderTotalValueSummary` — 기간 안 첫·마지막 **기록된 날** 기준(첫날이 기록 없음이면 "기간 내 첫 기록일 대비 증감"). `renderDailyPnlSummary` — 기록된 날만 합산. 기록이 없으면 "데이터 없음", 공백이 있으면 "기록이 없는 날짜는 그래프에서 비워 표시합니다." 한 줄 |
| `js/14-settings-boot.js` | 부팅 `refreshPricesAndRates().finally()`에서 `backfillAllHoldingsDailyPnlHistory()` 호출 제거 |

변경하지 않은 것: `planSnapshotRecovery` 분류 순서 · F2(`PLACEHOLDER_MIN_RUN = 14` · `PLACEHOLDER_BACKUP_PNL_RATIO = 0.25`) · P1-A 가드 · `skipPush` ·
2차 확인창 metadata · `recordDailySnapshot` · pull 날짜 단위 합집합(로컬 우선) · JSON 복원 · 엑셀 경로 · Cloud schema · 지문 키 · 자산/거래/리밸런싱/미래예측 ·
Return Key · Risk · Macro · Monte Carlo · FX · Bond. **이미 저장된 과거 값은 되돌리지 않았다(마이그레이션 없음).**
엑셀/JSON 가져오기 뒤 과거 이력 자동 재구성·소급이 더 이상 실행되지 않는 것은 이 정책에 따른 정상 변화다.

**25-4. 복구 병합 정책 (현행 유지 · 테스트로 고정)**

backup-only → ADD · current-only → KEEP · 둘 다 같음 → KEEP · 값이 다름 → 충돌 표시(자동 교체 금지) ·
F2 후보 → Preview 표시 후 **사용자 2차 승인 시에만** 교체 · 현재·백업 어디에도 없는 날짜 생성 0 · 복구 대상은 `dailySnapshots`뿐.

**25-4a. 수정 전 오류 재현 (RECOVERY ERROR ZERO)**

같은 합성 시나리오를 수정 전 코드(HEAD e1b8663의 js/11·js/14를 route로 주입)와 수정 후 코드에서 실행해 비교했다. js/12는 두 코드가 동일하다.

| ID | 시나리오 | 수정 전 | 수정 후 |
|---|---|---|---|
| R0-1 | 백업 395일 복구(추가 33 · 교체 362) → 자산 변경(매도·추가·소유자·자산군) → 실제 부팅 3회 | 부팅마다 창 안 cur 변경 **362/362** | **0/395** (부팅 3회 모두) |
| R0-2 | D1 기록 1억 · D2 기록 0 · D3 기록 없음 · D4 기록 2억 | 시계열·합계/소유자 라인·손익 막대 D3 = **0** | D3 = **null**, D2 = 0 유지 |
| R0-3 | 매수일 30일 전 자산 · 소급 지문 없음 | 과거 날짜 생성 **251** · 매수일 이전 **221**(손익≠0 221 · 평가액>0 221) · 과거 시세 조회 1 | **0 · 0 · 0 · 0 · 조회 0** · 오늘 기록 유지 |
| R0-4 | Preview 1 → 백그라운드 소급 → Preview 2 / 지연 소급 중 Apply | 추가 60→**0** · 충돌 0→**60** · 스냅샷 1→**252** · 복구 날짜 손익 변경 **60/60** · 충돌 0→60 | Preview 동일 · 스냅샷 1→1 · 변경 **0** · 충돌 변화 0 |
| R0-5 | D1 기록 없음 · D2 1억 · D3 1.1억 요약 | 시작값 0 → 증감 **+1.1억** · 기록 없는 날 0원 합산 1 | 시작값 1억 → 증감 **+1천만원** · "기간 내 첫 기록일 대비 증감" |

각 R0 시나리오는 e2e/82 R0-1~R0-5로 고정했고, 같은 테스트를 수정 전 코드에 주입해 실행하면 실패함을 확인했다.

**25-5. 테스트**

- 신규 `e2e/82-historical-snapshot-integrity.spec.js` 15건: T1 부팅 불변(재부팅 2회) · T2 복구 후 재부팅 3회 불변 · T3 매수·매도·자산 추가·삭제·소유자·자산군 변경 후 불변(+재부팅) ·
  T3-b 매수일 이전 과거 생성 0 · T4 기록 없음 null(시계열·라인·막대, `spanGaps: false`) · T5 기록된 0은 0 · T6 요약 첫 기록일 기준·데이터 없음 ·
  T7 백그라운드 이력 경로와 복구 경쟁·Preview 안정성 · T8 복구 적용 POST 0 · 이후 이력 경로 POST 0 · 오늘 기록 push 유지 · T9 state isolation.
- e2e/82 R0-1~R0-5(§25-4a 재현 시나리오 고정): 395일 백업 복구 후 부팅 3회 변경 0/395 · 그래프 [1억, 0, null, 2억] · 매수일 이전 생성 0 · 지연 이력 작업과 Preview/Apply 경쟁 변화 0 · 요약 시작 1억/증감 1천만원.
- 신규 Unit `U-48`: 병합 정책 6항목(backup-only·current-only·같음·충돌·후보·생성 0).
- 기존 테스트 기대값 변경(각 테스트에 사유 주석): `e2e/81` M(기록된 날 기준 계산) · O 머리 주석 · P(기록된 과거 cur 불변) · R(기록된 날만 고유값) ·
  V(복구 이력 byte 불변) · X-3 · X-5 · X-6(과거 날짜 생성 0 · 과거 시세 조회 0) · Y-6/Y-7 피해 state 생성(재구성 대신 예전 placeholder 모양을 직접 구성).
- 게이트: **Unit 338/338 · E2E 835/835 · Golden 122/122 · ESLint 0 · Data Guard PASS** · Release Guard는 version bump 전이라 예상된 FAIL(js/11·js/14 변경).
- 수정 전 코드 주입 실행(e2e/82 사본에 HEAD js/11·js/14 route 주입): R0-1~R0-5 5/5 실패 · T1~T8 8/8 실패 · T9 통과(state isolation은 수정 전에도 성립).

**25-6. 실제 사용자 데이터**

실제 휴대폰 state · 실제 사용자 localStorage 접근/변경 0 · Cloud write 0 · 백업 파일 수정 0 · Recovery Apply 0.
실제 백업 수치는 이전 READ-ONLY 분석 결과를 인용했고, 코드에 하드코딩하지 않았다.

**25-7. Recovery Apply 전제조건 (여전히 BLOCKED)**

1. ~~이 절의 변경을 PM이 검토하고 version bump · commit · push · 배포 · production smoke를 별도 승인~~ → v238 릴리스로 충족(PM Release Approval 2026-09-13)
2. 휴대폰에서 새 버전 로딩 후 Preview(1차 확인창 취소)만으로 추가 · 후보 · 충돌 수치 확인 → PM 보고
3. 2차 확인창 metadata로 백업 계보 확인 · 적용 전 동기화 일시 중지 여부 PM 결정
4. **PM의 별도 Recovery Apply 승인** — 테스트 PASS만으로 승인하지 않는다

**25-8. v238 릴리스 노트 · 후속 backlog**

**사용자 영향 (F-1 · PM 정책 수용)**

> 신규 자산의 과거 이력 자동 소급 생성을 중단했습니다. 실제로 기록된 이력이 없는 기간은 그래프에서 공백으로 표시됩니다.

- 대상: 자산 추가 · 거래원장에서 새로 생긴 자산 · 엑셀 가져오기 · JSON 추가하기. 예전에는 등록 직후 과거 약 1년 추세를 현재 수량·환율로 채워 보여줬다.
- 결함이 아니라 "실제로 기록되지 않은 과거 데이터를 현재 자산 상태로 추정하여 사실처럼 보여주지 않는다"는 데이터 안전 정책의 결과다. 이번 릴리스에 대체 기능은 없다.

**릴리스 전 최종 영향성 검증 (수정 전/후 코드 비교 · 합성 데이터 · 코드 무수정)**

- 단일 자산 추가·수정 · 거래원장 신규 자산 · 엑셀 덮어쓰기 · JSON 추가/복원 · Cloud pull · 오늘 기록: 자산·거래·리밸런싱·미래예측·설정·KPI/Risk/Macro/Projection 화면값·Return Key·오늘 스냅샷이 수정 전과 동일.
- 과거 이력: 수정 전 경로별 생성 227일 · 재구성 변경 24일(JSON 복원은 파일 대비 30/30 변경) → 수정 후 자동 생성 0 · 재구성 0. Cloud pull의 원격 전용 날짜 추가는 기존 날짜 단위 합집합(로컬 우선) 정책 그대로다.
- 복구 lifecycle(적용 → renderAll → 재부팅 → pull → renderAll → 오늘 갱신): 과거 변경 0/63, 복구 적용 POST 0, 올라간 과거 = 로컬(Cloud 과거 재작성 0), 오늘 스냅샷 갱신·push 정상.
- 그래프 D1 1억 · D2 기록 0 · D3 기록 없음 · D4 2억 → 시계열·합계/소유자 라인·손익 막대(전체/소유자)·툴팁·요약 전 경로 [1억, 0, null, 2억].
- 테스트 수: Unit 337 → 338(+U-48) · E2E 820 → 835(+e2e/82 15건, e2e/81 기대값 변경 8건) · Golden 122 → 122 · 삭제 0.

**후속 backlog (F-2 · v238 미포함)**

- 옛 소급 채우기 동작을 현재형으로 설명하는 주석 정리 — js/06:264~268 · js/07:913~915 · js/12:430~434 · js/12:691 · js/12:889~893 · js/01:1138 · sw.js:377. 기능 영향 없음.

**version**: v237 → v238 (`index.html` appVersionLabel · `sw.js` CACHE_NAME).

## 26. 신규 시작 안정화 — 빈 포트폴리오 기록 · 초기화 잔존 · 새 동기화 시작 (PM 지시 2026-09-13 · v239)

> **목적**: 2026-09-14 사용자가 새 자산관리 파일·거래내역 파일을 올리면 그 데이터가 이 앱과 동기화의 새로운 최초 데이터가 되게 한다.
> 이전 정책 유지: 과거 스냅샷 자동 소급·재구성 금지(§25) · 기록 없음 ≠ 0원 · manual 자산 SoT 독립 · ledger 자산 = 거래 SoT ·
> categorySource/positionSource 정책 · 동기화 방향 선택(§19) · Preview ≠ Apply · Recovery Apply는 PM 승인 없이 실행하지 않음.

**26-1. PM 확정 정책(이번 수정)**

| ID | 정책 |
|---|---|
| **N-1** | 자산이 하나도 없는 상태(기기 데이터 초기화 직후·아무것도 입력하지 않은 기기)는 "평가금액 0원인 날"이 아니라 "입력된 자산이 없는 날"이다. 오늘 스냅샷을 기록하지 않고, 같은 날 앞서 남긴 오늘 기록이 있으면 그 오늘 기록만 지운다. 과거 날짜는 읽지도 쓰지도 않는다 |
| **N-2** | 자산은 있는데 평가금액이 0원인 날(전량 매도로 수량 0 등)은 실제 기록이라 0원으로 남긴다(§25 D3 "기록된 0 = 0" 유지) |
| **N-3** | 기기 데이터 초기화는 localStorage뿐 아니라 메모리의 티커 역할·학습 종목명도 비운다(앱을 다시 연 것과 같은 상태) |

**26-2. 조사 결과**

| 항목 | 결과 |
|---|---|
| 거래가 없는 날 | 보유 자산은 그대로이고 평가금액은 지금 보유 × 현재가로 계산된다. 오늘 기록은 정상이며 0원이 아니다 |
| 앱을 열지 않은 날 | 스냅샷이 없고 그래프·요약에서 null(공백)이다(§25 D3) |
| 스냅샷이 있고 손익 0 | 0으로 유지된다 |
| 과거 스냅샷 자동 생성·재구성 | v238 no-op 유지. 부팅·렌더·시세 갱신·자산/거래 입력·엑셀/JSON·pull·복원·탭 이동에서 같은 효과를 내는 다른 경로 없음 |
| 차트의 0 채움 | 스냅샷 계열(총 평가금액·일별 손익)만 날짜 공백이 있고 null 처리. 자산 도넛·가격/환율 이력·미래예측은 날짜 공백을 0으로 만드는 경로 없음. 실현손익 기간 막대의 0은 "그 기간 매도 없음 = 실현손익 0"이라는 사실값 |
| Risk · Macro · 미래예측 · Monte Carlo | dailySnapshots와 거래 없는 날 판정을 쓰지 않는다(현재 보유 기준) |
| **결함 P0** | 빈 포트폴리오도 렌더마다 오늘을 0원으로 기록 → 오늘 초기화하고 다음 날 입력하면 그래프가 전날 0원에서 실제 금액으로 튄다(재현: 2026-09-13 = 0 기록, 2026-09-14 = 입력 금액). 초기화 버튼 직후에도 오늘 0원 기록이 생겼다 |
| **결함 P1** | 초기화 후 앱을 다시 열기 전에 자산을 추가하면 메모리에 남은 예전 티커 역할이 다시 저장됐다 |
| 진행 중 pull/push와 초기화 경합 | 예전 데이터 부활 0 · 초기화 뒤 업로드 0(초기화가 암호를 비워 복호화·업로드가 실패). 화면에 동기화 오류 표시가 남을 수 있음(P2, 재실행으로 사라짐) |
| 초기화하지 않은 다른 기기 | 같은 암호로 계속 올리면, 날짜 단위 합집합 정책 때문에 예전 일별 이력·티커 역할·학습 종목명이 새로 시작한 기기로 섞인다(자산·거래는 기준선 삭제 전파로 섞이지 않음). 코드가 아닌 절차로 막는다: 모든 기기 초기화 + 새 동기화 암호 |
| Cloud Worker | GET/POST만 지원(DELETE 없음). KV 키 = `sync:` + SHA-256(암호) 앞 32자리. 앱에서 슬롯을 삭제할 수 없다 |
| 자산 엑셀의 positionSource | 엑셀에 칸이 없어 가져온 자산은 미확정(legacy)이다. 거래 엑셀을 명시적으로 가져올 때 거래 기준으로 수량·평균단가가 반영되고, 부팅 자동 동기화는 건너뛴다(§기존 D-3 정책 유지, 변경 없음) |

**26-3. 수정 (코드)**

| 파일 | 변경 |
|---|---|
| `js/11-refresh-history.js` | `recordDailySnapshot` — 자산 0건이면 오늘을 기록하지 않고, 같은 날 앞선 오늘 기록만 지운다(N-1) |
| `js/14-settings-boot.js` | 기기 데이터 초기화 — `state.tickerRoles = {}` · `state.learnedTickerNames = {}`(N-3) |
| `sw.js` · `index.html` | v238 → v239 |

변경하지 않은 것: 과거 이력·그래프 null 정책 · 동기화 병합·방향 선택 · Recovery · 엑셀/JSON 가져오기 규칙 · SoT 정책 · Risk/Macro/MC/Return Key/Bond/FX/UX.

**26-4. 기기 데이터 초기화 후 Local 상태**

| 구분 | 키/상태 |
|---|---|
| CLEAR | 자산 · 거래 · 목표비중 · 미래예측 · 일별 스냅샷 · 환율/일간변동/기준환율 · 티커 역할(+시딩 표시) · 학습 종목명 · 동기화 암호·켜짐·버전·마지막 동기화·병합 기준선 · 자동 백업 설정·마지막 백업일 · 소급 지문 · 마이그레이션 표시 · 종목 마스터 캐시(재다운로드) |
| KEEP | 다크모드 · 첫 실행 표시(샘플 자산 재시딩 방지) |
| RESET(메모리) | syncState · 자산/거래/필터/목표비중/미래예측/스냅샷/시세 캐시 · 티커 역할 · 학습 종목명(v239) |

자동 백업 설정도 지워지므로, 원하면 새로 시작한 뒤 다시 켠다.

**26-5. 새 동기화 시작 절차 (사용자 수행 — 동기화 암호는 앱 밖으로 받지 않는다)**

1. **오늘**: 이 앱을 쓰는 **모든 기기**(휴대폰·PC 등)에서 v239 로딩 확인 → 동기화 끄기 → 시스템관리 → 기기 데이터 초기화 → 앱을 완전히 닫았다가 다시 열어 자산 0건·그래프 기록 없음 확인.
2. **오늘(예전 Cloud 내용 비우기)** — v240 이후: 기기 데이터 초기화를 마친 기기 하나에서 가족 동기화 설정에 **예전 암호**를 입력한다(v240부터 방향을 고르기 전에는 자동 동기화가 돌지 않아 예전 데이터가 이 기기로 들어오지 않는다) → [클라우드 데이터 초기화] → 1차 확인창 건수 확인 → 2차 확인 → "클라우드 데이터를 초기화했습니다" 확인(§27). v240 이전 절차("빈 데이터로 올리기")는 새 version으로 올라가 다른 기기의 로컬 자산·거래를 지울 수 있어 쓰지 않는다.
3. **내일**: 한 기기에서 자산 엑셀(덮어쓰기) → 거래 엑셀(덮어쓰기) → 화면 확인 → 동기화 설정에서 **새 암호** 입력 → 빈 슬롯이라 [업로드] 확인만 뜨는지 확인 → 업로드.
4. **내일**: 다른 기기는 1번 초기화 상태에서 새 암호 입력 → [클라우드 데이터 받기].

새 암호를 쓰는 이유: 초기화를 빠뜨린 기기가 있어도 예전 암호 슬롯에만 올라가 새 시작 데이터에 섞이지 않는다(E2E-83 N7).

**26-6. 테스트**

- 신규 `e2e/83-new-start-stability.spec.js` 9건: N1 빈 포트폴리오 오늘 기록 없음·자산 생기면 기록·모두 지우면 오늘만 삭제(과거 불변) · N1-b 수량 0은 0원 기록 · N2 전날 비운 기기 다음 날 엑셀 입력 시 그래프 [공백, 금액] ·
  N3 초기화 후 0원 기록 없음·메모리 역할/학습명 비움·재실행 전 자산 추가에도 예전 값 미저장 · N4 Day1 자산·거래 엑셀 + 최초 동기화(빈 슬롯 업로드) → Day2 거래 없음(0원 없음·과거 불변) → Day3 매수(수량 15·평균단가·Cloud 3일) ·
  N5 앱을 열지 않은 날 공백 · N6 진행 중 pull/push와 초기화 경합(부활 0·업로드 0) · N7 새 암호 기기는 초기화하지 않은 기기의 예전 슬롯 업로드를 받지 않음.
- 수정 전 코드에서 N1 · N2 · N3 · N6(2) · N7 실패(오늘 0원 기록·예전 역할 재저장), 수정 후 9/9 통과.
- 게이트: (릴리스 결과는 인계장·릴리스 보고에 기록)

**26-7. 초기화 명칭 구분 (PM 추가 P0)**

| 명칭 | 범위 | 지우지 않는 것 |
|---|---|---|
| **기기 데이터 초기화** | 이 기기에 저장된 이 앱의 데이터(자산 · 거래내역 · 일별 이력 · 목표비중 · 미래예측 설정 · 환율 입력값 · 동기화 연결(암호) · 자동 백업 설정 · 티커 역할·종목명 기억). 다크모드·첫 실행 표시만 유지 | 클라우드 데이터(동기화를 먼저 끄므로 업로드도 하지 않음) |
| **클라우드 데이터 초기화** | 현재 동기화 암호에 연결된 클라우드 데이터(§27 구현) | 이 기기의 데이터(자산·거래·일별 이력·설정). 확인창에 "이 기기의 데이터는 삭제되지 않습니다"를 적는다 |

- 사용자 노출 문구만 변경: 시스템관리 버튼 라벨 + 범위 설명 한 줄 · 헤더 버튼 title · 확인창 · 완료 토스트. id(`resetDataBtn`)·핸들러·삭제 범위 무변경.
- 두 기능의 확인창은 상대 기능의 데이터를 지우는 것처럼 읽히는 표현을 쓰지 않는다.
- 테스트: `e2e/84-device-reset-naming.spec.js`(명칭 표시 · 모호한 "데이터 초기화" 사용자 문구 0 · 확인창 범위 문구 · 취소 시 무변경 · 삭제 범위와 Cloud 무변경).

## 27. 일별 이력 복구 제거 · 클라우드 데이터 초기화 (PM 작업지시 2/3 · 2026-09-13 · v240 릴리스 완료)

> **상태: 구현·검증 완료(작업트리, v240 표시) · commit / push / 배포 전 — PM 검토 대기.** 실제 Cloud·실제 사용자 기기에는 아무것도 실행하지 않았다.
> 이 절이 §21 · §22 · §25-4 · §25-7의 "일별 이력 복구" 기능을 대체한다(해당 절은 당시 기록으로 보존).

**27-1. 정책**

| ID | 정책 |
|---|---|
| **R-1** | 일별 이력 복구(Recovery) 기능을 완전히 제거한다 — 버튼·파일 입력·Preview·Apply·후보(F2) 판정·확인창·토스트·전역 함수·단위/E2E 테스트. **일별 이력(dailySnapshots) 자체는 제거하지 않는다**: 오늘 기록 · 기록 없는 날 null · 기록된 0 = 0 · 과거 자동 생성/재구성 금지 · 빈 포트폴리오 기록 안 함(§25 · §26) 그대로 |
| **C-1** | **클라우드 데이터 초기화**는 이 기기에 저장된 동기화 암호의 슬롯(`sync:` + SHA-256(암호) 앞 32자리)만 빈 데이터로 덮어쓴다. 이 기기의 자산·거래·일별 이력·목표비중·미래예측·설정은 바꾸지 않는다. 기기 데이터 초기화와 서로 부르지 않는다 |
| **C-2** | 빈 데이터는 **version 0**으로 올린다. 기존 코드가 모두 "빈 슬롯"과 같게 다룬다(연결 시 [업로드] 확인만 · pull 받아올 것 없음 · push 선병합 없음) → 어느 기기의 로컬 데이터도 지워지지 않는다. 새 version으로 올리면 다른 기기의 pull이 병합 기준선의 자산·거래를 삭제로 전파한다(합성 실험 재현) |
| **C-3** | 2단계 확인: 1차 = 이 기기 동기화 켜짐/꺼짐 · 클라우드 자산/거래/일별 이력 건수 · "이 기기의 데이터는 삭제되지 않습니다" / 2차 = "클라우드 데이터만 초기화합니다" · "이 기기의 데이터는 삭제되지 않습니다" · 같은 암호로 동기화가 켜진 다른 기기는 다음 동기화 때 자기 데이터를 다시 올린다 · 이 기기의 동기화도 꺼진다 · 되돌릴 수 없음 |
| **C-4** | 경합 방지: 확인 뒤 잠금(예약 push·push·pull 차단) → 예약 push 타이머 취소 → 진행 중 push/pull 종료 대기(최대 20초) → POST → **같은 슬롯 재조회(version 0 · 복호화 건수 0/0/0)로 성공 판정** → 이 기기 동기화 끔(암호 유지 · 버전 0 · 병합 기준선 비움) → 잠금 해제. 실패 시 이 기기 데이터·동기화 상태 무변경 |
| **C-5** | (PM 지시 3/3) 동기화 중인 다른 기기가 원격 **version 0**을 보고, 그 기기가 이 슬롯의 version을 알고 있었으면(호출 시작 시점 lastVersion > 0) "다른 기기에서 클라우드가 초기화됨"으로 판단한다 → 업로드·병합 없음 · 로컬 데이터 삭제/유입 없음 · 그 기기 동기화만 끔(버전 0 · 병합 기준선 비움) · 안내 토스트. push 선조회와 pull 양쪽에서 판정. 새로 연결하는 기기(lastVersion 0)의 [이 기기 데이터 업로드]는 그대로 허용 |
| **G-1** | (조사 중 발견 · 수정) 동기화 암호를 저장한 뒤 [업로드]·[클라우드 데이터 받기]·[이 기기 데이터 올리기] 중 하나를 고를 때까지 동기화를 켜지 않는다. 예전엔 저장 즉시 켜져 10초 주기 pull이 방향 선택 전에 클라우드 데이터를 합쳤다(합성 실험: 빈 기기에 12초 안에 자산·거래·일별 이력 유입). 방향 선택 의미·fullAdopt·localWins·병합 규칙은 무변경 |

**27-2. Worker 계약 확인(무변경)**

GET `?k=sync:…` → 200 `{ciphertext, iv, salt, version, updatedAt}` / 404. POST 같은 필드(version은 number) → KV put(덮어쓰기). DELETE 없음. 빈 데이터 POST 뒤 GET으로 version·복호화 내용 확인 가능(합성 검증).

**27-3. 제거 · 변경 범위**

| 파일 | 변경 |
|---|---|
| `index.html` | [일별 이력만 복구] 버튼·파일 입력 제거 · 데이터 관리 "주의" 영역에 [클라우드 데이터 초기화] 추가(기기 데이터 초기화 바로 아래) · 가족 동기화 설정에도 같은 버튼 · 헤더 안내 문구 · v240 |
| `js/12-import-export-sync.js` | 복구 섹션 전체 삭제(검증·F2 후보·계획·적용·UI 핸들러·테스트 export) · `resetCloudData` · `readCloudSlot` · `buildEmptyCloudBlob` · `waitForSyncIdle` 추가 · `pushToCloud`/`pullFromCloud` 바깥 래퍼(잠금·진행 수, 본문은 `…Now` 그대로) · `schedulePush` 잠금 조건 · `enableSyncAfterChoice`(G-1) |
| `js/01-core-state.js` | 복구 전용 `persistDailySnapshots({ skipPush })` 옵션 제거 · 주석 |
| `js/11-refresh-history.js` | 주석만(복구 언급 정리) |
| `sw.js` | v240 |
| 테스트 | 삭제 `e2e/81-snapshot-recovery.spec.js`(44건) · `test/snapshot-recovery.test.js`(단위 48건) — 기능 제거에 따른 삭제(PM 지시) · `e2e/82` T2·T7·T8·T9·R0-1·R0-4를 JSON 복원·동기화 병합·직접 저장으로 재작성(검증 성질 동일, 각 테스트에 사유 주석) · 신규 `e2e/85-recovery-removed-cloud-reset.spec.js` 16건 |

변경하지 않은 것: 동기화 병합 규칙(mergeCollectionById · 날짜 합집합 · fullAdopt · localWins) · 암호화/키 유도 · Worker · 기기 데이터 초기화 범위 · 오늘 기록 · 그래프 · 자산/거래 SoT · categorySource/positionSource · Risk/Macro/MC/Return Key/Bond/FX/세금.

**27-4. 다기기 제한(남는 위험)**

- ~~같은 암호로 동기화가 켜진 다른 기기가 다음 업로드 때 자기 데이터를 다시 올린다~~ → **3/3에서 코드로 차단(C-5)**. 남는 조건: 이 감지 코드가 없는 **이전 버전 앱**을 쓰는 기기는 여전히 다시 올릴 수 있다 — 모든 기기가 v240을 로딩한 뒤 절차를 진행한다(2차 확인창에 안내).
- 초기화하지 않은 기기가 새 암호를 입력해 [이 기기 데이터 올리기]를 고르면 예전 데이터가 새 슬롯에 올라간다 — 사용자 선택 단계라 코드로 막지 않는다(방향 선택창에 건수 표시).

**27-5. 테스트**

- `e2e/85` 16건: RR-1/2 복구 UI·문구·전역 함수 0 · RR-3~5 부팅·pull·JSON 가져오기 오류 0 · RR-6~8 오늘 기록·과거 불변 · CR-1 두 화면 진입·1차 문구 · CR-2/CR-3 1·2차 취소 무변경 · CR-4/6/7/8/11 이 슬롯만 version 0·재조회 확인·다른 슬롯/이 기기 무변경·토스트 · CR-5 진행 중·예약 push 경합(마지막 쓰기 = 초기화) · CR-6-b 재조회 불일치 → 실패 보고·무변경 · CR-10 POST 500 → 무변경·잠금 해제·일반 동기화 계속 · CR-9 재연결 시 [업로드] 확인 → 일반 동기화 · CR-11-b 암호 없음 안내 · CR-13 다른 기기 로컬 보존·재업로드(제한 고정) · PG-1 방향 선택 전 유입 0 · CR-12 375px Light/Dark 버튼 44px·14px·잘림 0.
- 게이트(작업트리): Unit 290 · E2E 820 · Golden 122 · ESLint 0 · Data Guard PASS · Release Guard PASS(v240 표시).

**27-8. PM 작업지시 3/3 — 다른 기기의 클라우드 초기화 감지 (작업트리)**

- 문제(재현): 클라우드 데이터 초기화(version 0) 뒤 같은 암호로 동기화가 켜진 기존 기기가 평소 렌더에서 push → 선병합 없이 로컬 blob을 POST → 초기화한 클라우드가 다시 채워짐.
- 수정(`js/12-import-export-sync.js`만): `isCloudResetSinceLastSync(remote, lastVersionAtStart)` · `stopSyncAfterRemoteCloudReset()` 추가 · `pushToCloudNow` 선조회 직후와 `pullFromCloudNow` up_to_date 판정 직전에 판정(반환 `'cloud_reset'`) · 2차 확인창 문구와 섹션 주석을 실제 동작에 맞춤. Worker · 스키마 · mergeCollectionById · fullAdopt/localWins 무변경.
- 안내 토스트: "클라우드 데이터가 초기화되어 이 기기의 동기화를 중지했습니다. 이 기기의 데이터는 삭제되지 않았습니다. 다시 동기화하려면 가족 동기화 설정에서 암호를 입력해 주세요."
- 다시 켜기: 자동으로 켜지지 않는다. 암호를 다시 저장하면 방향 선택 절차(빈 슬롯 → [이 기기 데이터 업로드] 확인 / 데이터 있음 → 받기·올리기 선택).
- 테스트: 신규 `e2e/86-cloud-reset-other-device.spec.js` 8건 — CR-14 자동 push 업로드 0·동기화 중지·로컬 보존 · CR-15 15초 대기+부팅+렌더+시세 갱신+포커스+입력 저장 뒤에도 version 0 · CR-16 다시 연결해도 확인 단계에서 멈춤 · CR-17 새 기기(lastVersion 0) 최초 업로드 정상 · CR-18 pull 경로 로컬 보존·유입 0·동기화 중지 · CR-19 다른 암호 슬롯·기기 영향 0 · CR-20 초기화 직전 예약 push도 업로드 0 · NS-1 신규 시작 전체 절차(초기화를 빠뜨린 기기가 동기화 켜진 채 있어도 version 0 유지 → 새 데이터 최초 업로드 → 다른 기기 받기 일치). `e2e/85` CR-13 기대값을 새 동작으로 변경(사유 주석).
- 게이트(작업트리): Unit 290 · E2E 828 · Golden 122 · ESLint 0 · Data Guard PASS · Release Guard PASS.

## 28. 총자산 추이 Daily Valuation (D-1~D-4 · PM 최종 구현 지시 · v241)

> **상태: 구현 · 검증 완료 · v240 → v241.** 실제 사용자 기기 데이터 · 실제 Cloud에는 아무것도 실행하지 않았다(합성 데이터 · 가짜 시세 route로만 검증).
> 이 절은 §25 D3 중 **총자산 추이 그래프**의 원천을 스냅샷에서 원장 기반 Daily Valuation으로 바꾼다. **일별 손익 추이 그래프는 §25 D3 그대로**(스냅샷 기반)다.
> **[v242 · §29로 갱신]** 일별 손익 추이 그래프도 Daily Valuation(U1=C)으로 전환됐고, 두 팝업의 기간이 당월/3/6/12개월 · 기본 당월로 통일됐다. 위 문장의 "일별 손익 추이 = 스냅샷 기반"은 v241 당시 기록이다.

**28-1. 사용자 · PM 확정 정책**

| ID | 정책 |
|---|---|
| **D-1** | 총자산 추이의 주 원천 = 거래내역(원장) 기반 Daily Valuation. dailySnapshots는 실제 기록으로 보존하고 DV가 만들거나 고치거나 지우지 않는다. 과거 소급 · 재구성 함수는 쓰지 않는다 |
| **D-3-A** | 원화 현금 = D일 이전 가장 최근 앱 기록 잔액 유지 · 첫 기록 이전 계산 안 함 · "실제 잔액"이라 표현하지 않음 |
| **D-3-B** | 부동산 · 개별채권 등 수동평가 = D일 이전 가장 최근 앱 기록 평가액 유지 · 첫 기록 이전 계산 안 함 · 시장가격이라 표현하지 않음 |
| **D-3-C** | 그래프 하나(기존 팝업) · 신랑 / 와이프 / 합계 유지 · 새 그래프 없음 |
| **D-4-U1** | 시장 현지 날짜: KRX Asia/Seoul · 미국 America/New_York · 환율 KRW=X Europe/London. UTC 문자열 날짜를 쓰지 않는다 |
| **D-4-U2** | 평일 결측 **K = 3 거래일**: 1~3 거래일 직전 확정값 추정 · 4거래일째 계산 불가 · 주말 · 확인된 휴장일은 세지 않음 |
| **U-A** | 오늘은 정규장 기준가 반영 잠정값 → 정규장 종료 후 종가가 확인되면 확정. 시장별로 판정, 하나라도 잠정이면 소유자 · 합계는 잠정 |
| **U-B** | 계산할 수 없는 자산이 있으면 그 소유자 null, 소유자 중 하나라도 null이면 합계 null. 부분 합산 금지 · null ≠ 0 |
| **M2** | 당일 확정 = Yahoo 오늘 정규장 시간이 평소 형태 + regularMarketTime ≥ 실제 종료(KRX 15:30 · 미국 16:00) + 응답 시각 ≥ 종료. 불명확하면 잠정 유지(다음 현지 날짜에 확정) |
| **M4** | 보유 중 분할 · 병합 이벤트가 있으면 그 이전 날짜 계산 안 함(corporateActionUnverified) · 안내 문구 · 해당 종목 캐시하지 않음 |
| **M5** | 자산 카테고리 변경 이력이 없어 생기는 과거 해석 오차는 구조 한계로 인정(이력 스키마 추가 없음) |
| 삭제 자산 | 자산 목록(assets master)이 기준 · 거래만 남은 종목을 복원해 더하지 않음 |
| 현금 | 주식 매수/매도와 현금 자동 연결 없음 · 현금 원장 없음 · 그 한계를 안내 |
| BOND.STOCK | 역사평가는 상장 혼합 ETF도 상품 종가 × 수량(미래예측 BOND 적용은 별도 트랙) |

**28-2. 구현**

| 파일 | 변경 |
|---|---|
| `js/06-transactions.js` | (A2) `computePositionsAndRealizedPnL(txs = state.transactions)` — 인자 기본값 1개. 기존 호출부 무변경 · 결과 바이트 동일(HEAD 대비 합성 4종 · 백업 4개 비교) |
| `js/23-daily-valuation.js` (신규) | 순수 계산: 시장 타임존 날짜 · 일봉 정규화(오늘 봉 잠정/확정) · 가격 · 환율 판정(휴장 · K=3 · 상장 전 · 범위 밖) · 분할 차단 · 마지막 기록값 · 자산 분류 · positionsAsOf(날짜 필터 → 기존 원장 함수) · 소유자 · 합계 전파 |
| `js/24-daily-valuation-data.js` (신규) | 시세 레이어: Yahoo 일봉(interval=1d · 창 시작 − 21일부터 · events=split) · 직접+CORS 프록시 경쟁 · 메모리 캐시(잠정 봉 · 날짜 변경 · 분할이면 다시 받음) · 행 조립. LocalStorage · IndexedDB · Cloud 저장 없음 |
| `js/11-refresh-history.js` | 총자산 추이 팝업을 DV로 연결(비동기 · 마지막 요청만 그림) · 툴팁 상태 글자(잠정 · 추정 포함 · 마지막 기록값 포함) · 요약(합계 선의 첫/마지막 표시일을 모든 선에 같이 적용 → 소유자 증감의 합 = 합계 증감) · 안내 문구 · 시세 갱신 완료 시 열린 팝업 재계산. `buildSnapshotSeries` · 일별 손익 팝업 무변경 |
| `index.html` · `sw.js` | 스크립트 2개 추가 · v241 |

**28-3. 분류 규칙(자산 목록 기준)**
- 시세 · 원장: 티커 있음 · 카테고리 주식/ETF/원자재/암호화폐 · manual 아님 · 원장 최종 수량 = 자산 수량 → 수량(D) × 현지 D일 가격 × (USD) 런던 D일 환율
- 달러 현금: manual 아님 · 원장 수량 일치 → 수량(D) × 환율(D) / manual · 원장 없음 → '달러' 기록값 유지 / 원장 불일치 → 계산 불가
- 원화 현금 · 부동산 · 채권(티커 있어도 해당 카테고리) → 스냅샷 소유자 × 카테고리 기록값 유지(기록된 날 키 없음 = 0)
- 시세 대상인데 manual · 원장 없음 · 원장 불일치 · 티커 없음 → 계산 불가(그 소유자 · 합계 선 미표시)

**28-4. 테스트**
- 신규 Unit `test/daily-valuation.test.js` 10건: 타임존(KST · EDT · EST · BST · GMT · UTC 경계 · 미지원 타임존) · KRX 15:00~15:30 잠정 · 특수 거래일 잠정 · 미국 16:00 확정 · 환율 오늘 잠정 · K=3/K=4 · 주말 · 휴장 · 지수 실패 · 상장 전 · 범위 밖 · 분할 · 마지막 기록값 · U-B
- 신규 E2E `e2e/87-daily-valuation.spec.js` 9건: 손계산 Golden(D1~D5 · 휴장 · 결측 · 기록값 · 한국 확정/미국 잠정) · 뒤늦게 입력한 과거 거래 · 팝업(신랑/와이프/합계 · null 공백 · 상태 글자 · 안내 · 데이터/저장소/KPI 불변 · Cloud 쓰기 0 · 부팅 역사 시세 조회 0) · 전 시장 확정 · manual/무티커/불일치 · 삭제 자산 · 분할 · 조회 실패 · 갱신 후 재계산
- `e2e/82` T4 · T5 · R0-2: 팝업이 DV로 바뀌어 스냅샷 시리즈를 같은 렌더러로 직접 그려 null 공백 · 기록된 0 성질을 계속 고정(기대값 변경 없음, 사유 주석)
- 게이트: **Unit 300 · E2E 837 · Golden 122 · ESLint 0 · Data Guard PASS · Release Guard PASS** (최종 전체 실행 836 + 1 실패: e2e/31 412x915 Dark 미래예측 입력 UI — 총자산 추이와 무관한 화면, 단독 재실행 17/17 통과 · 직전 전체 실행에서는 통과)

**28-5. 알려진 한계(숨기지 않음)**
- 현금 미연결: 과거일 매수는 주식만 늘고 현금은 다음 기록일까지 유지 → 과거 총자산이 당시 실제 순자산과 다를 수 있다(안내 문구)
- 첫 스냅샷 이전 날짜 · 계산 불가 자산(manual 시세 자산 · 거래 없는 legacy 등)을 가진 소유자와 합계는 선이 보이지 않는다
- 특수 거래일(개장 지연 · 조기 폐장)은 그날 안에 확정하지 않고 다음 현지 날짜에 확정한다
- 거래정지는 결측과 구분하지 않는다(Yahoo가 같은 가격 봉을 주면 그 가격을 쓴다)
- 카테고리 변경 이력 부재(M5) · 미국 거래일은 현지일 입력 전제
- 시세 일봉은 외부 프록시 가용성에 의존한다(실패 시 해당 소유자 · 합계 미표시)

## 29. Daily Valuation 통합 — 일별 손익 추이 DV 전환 · 두 팝업 기간 통일 (PM FINAL IMPLEMENTATION ORDER · v242)

> §28(v241) 총자산 추이 DV에 이어 **일별 손익 추이 그래프도 거래내역 기반 Daily Valuation**으로 계산한다. 그래프에 값이 있는지는 "그날 앱을 열었는가(스냅샷)"가 아니라 "그날 값을 계산할 수 있는가"로 정해진다. dailySnapshots는 삭제하지 않고 역할만 바뀐다(29-3).

**29-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **REQ-1** | 일별 손익 추이 · 총 평가금액 추이 모두 Daily Valuation으로 계산한다 |
| **REQ-2** | 두 팝업 기간 = 당월 / 3개월 / 6개월 / 1년 · 기본 당월 · `daysSinceMonthsAgoStart` 재사용 · 의미 "이번 달을 1개월로 세어 (N−1)개월 전 달의 1일 ~ 오늘(포함)". 30/90/180/365일 체계 폐기 |
| **REQ-3** | dailySnapshots 유지 · 그래프의 직접 시계열 원천이 아님 · DV의 보조 원천(원화 현금 · 부동산 · 개별채권 마지막 기록값) · Sync / JSON 백업 · 복원 / 기기 초기화 보존 · 스키마 축소 · 삭제 · migration 없음 |
| **U1 = C** | 일별 손익 = Σ원장자산 [ qty_D × P_D × FX_D − qty_(D−1) × P_(D−1) × FX_(D−1) − 당일 매수대금 + 당일 매도대금 ] + 원장 달러현금 환율 손익. 매매대금 = 수량 × 체결가 × 적용환율(appliedRate). DV(D) − DV(D−1) 방식은 쓰지 않는다 |
| **U2** | 거래 수수료는 일별 손익에서 차감하지 않는다 |
| **U3** | 달러 현금: 원장으로 과거 수량 확인 → 계산 / 원장 외 기존 데이터로 복원 가능 → 계산 / 복원 불가 → 계산 불가(null). "달러 현금이면 무조건 null"이 아니다 |
| **U4** | U-B를 일별 손익에도 적용 — 계산 불가 자산을 가진 소유자 null, 소유자 하나라도 null이면 합계 null. 0 = 실제 손익 0, null = 정확한 계산 불가 |
| **U5** | dailySnapshots 유지 |
| **U6** | KPI "일간금융평가손익" 카드는 기존 실시간 산식 그대로 · 팝업의 오늘 값(DV · U-A)과 다를 수 있음을 짧게 안내 |
| 기존 | U-A · M2 · D-4-U1 · K=3 · 휴장 · M4 · M5 · 삭제 자산 · 현금 자동연결 금지 · BOND.STOCK — §28 그대로 |

**29-2. 구현**

| 파일 | 변경 |
|---|---|
| `js/23-daily-valuation.js` | 신규 순수 함수 `dvBuildDailyPnlRows` · `dvPositionDailyPnl`(포지션 하나의 C 산식 · 당일 거래를 원장과 같은 순서로 재생 · 매도 수량을 원장과 같이 보유수량으로 제한 · 끝 수량이 원장과 다르면 계산 불가) · `dvTradeRate`(원장과 같은 환율 규칙) · `dvFindLedgerEntry`. 기존 `dvBuildRows` · `dvPriceAt` · positionsAsOf · `dvCombineParts` 무변경(재사용) |
| `js/24-daily-valuation-data.js` | `dvLoadValuationInputs`(두 팝업 공용 입력 · 같은 날짜 축 · 같은 자산 분류 · 같은 시세 캐시) · `loadDailyPnlRows` 신규 · `loadDailyValuationRows` 결과 동일. 캐시: 오늘 봉이 확정이면 다시 쓰고, 오늘 봉이 없거나 잠정이면 60초 안에만 다시 쓴다 · 시세 갱신 뒤 재계산(fresh)은 새로 받는다 |
| `js/11-refresh-history.js` | 일별 손익 팝업 비동기 DV(마지막 요청만 그림 · 불러오는 중 · 실패 안내 · 소유자 탭은 재계산 없이 다시 그림) · 0원 막대 minBarLength(막대 없는 계산 불가와 구분) · 툴팁 상태 글자 · 요약(null 제외 합산 · 합계가 계산된 날 공통 기준) · 안내 문구 · 시세 갱신 훅에 일별 손익 팝업 추가 · 총 평가금액 기간을 `daysSinceMonthsAgoStart`로 통일 · 요약 기간 머리말 공용(`periodSummaryLabel`) · 스냅샷 손익 시리즈 `buildDailyPnlSeries` · `buildUnrealizedPnlSeries` 제거(원천 교체) |
| `js/01-core-state.js` | `daysSinceMonthsAgoStart` 주석만(두 팝업 공용) |
| `index.html` | 두 팝업 기간 버튼 당월/3/6/12개월 · 기본 당월 · 터치 44px · 강제 nowrap 제거(단어 단위 줄바꿈) · 주석 · v242 |
| `sw.js` | CACHE_NAME v242 |

**29-3. dailySnapshots 역할(유지 · 역할만 변경)**
- 유지: 오늘 기록(`recordDailySnapshot` · v239 빈 포트폴리오 규칙) · localStorage · Sync(날짜 합집합) · JSON 백업/복원 · 기기/클라우드 초기화 · 총 평가금액 DV의 원화 현금 · 부동산 · 채권(· 원장 없는 달러 현금) 마지막 기록값
- 폐기: 두 그래프의 직접 시계열 원천
- 일별 손익 DV는 스냅샷을 읽지 않는다(원화 현금 · 부동산 · 채권 손익 = 0, 기존 앱과 같다)
- DV는 스냅샷을 만들거나 고치거나 지우지 않는다 · backfill / reconstruct 재활성화 없음 · `remediateDuplicatedDailySnapshotHistory` 무변경

**29-4. 구현 중 확인한 사실**
- **U3-B 경로의 기존 데이터 없음**: 원장 외에 과거 달러 수량을 복원할 수 있는 기존 데이터가 앱에 없다. 스냅샷 '달러'는 원화 평가액만 있고 당시 적용 환율이 저장되지 않으며, 자산 목록은 현재 수량만 가진다. 따라서 원장 없는 달러 현금은 U3-C(계산 불가)로 처리되고, 추정 환율로 수량을 역산하지 않는다. 티커 없는 달러 현금은 부팅 마이그레이션이 '최초' 거래를 만들어 대부분 원장 기반(U3-A)이다.
- 총 평가금액 DV(v241)는 소유자마다 D일 이전 스냅샷 기록이 하나는 있어야 값이 생긴다(현금 · 부동산 · 채권이 없는 소유자도 동일) — v241 규칙 그대로 유지했다. 일별 손익은 이 조건이 없다.

**29-5. 테스트**
- 신규 Unit `test/daily-pnl-valuation.test.js` 12건 — 실제 js/01~10 · js/23을 vm 샌드박스에 싣는다: U1=C 11사례(매수/매도 × 현금 기록 반영/미반영 · 현금 유입 · 인출 · 가격 상승 · 매수+가격 · 매도+가격) · 환율 변화 · 적용 환율 차이 · U2 수수료 · 원장 순서 과다 매도 · 당일 왕복 · U3 · U4 · positionsAsOf(거래 없는 날 · 늦게 입력한 과거 거래 · 삭제 자산 잔여 거래) · U-A(잠정 · 확정 · 혼합 시장) · 휴장 · 지수 조회 실패 · K=3/4 · 분할 · 마지막 기록값 · 기간(월초 · 월말 · 연도 변경 · 윤년 · 오늘 포함)
- 신규 E2E `e2e/88-daily-pnl-valuation.spec.js` 10건: Golden(D1~D5 손계산 · 스냅샷 없는 날 막대 · 0원 막대 · 상태 글자 · 안내 · 합계) · 전 시장 확정 · 기간 통일(버튼 4종 · 기본 당월 · 두 팝업 같은 날짜 · 다시 열면 당월 · 44px) · U4 · U3 · 불변성(자산 · 거래 · 스냅샷 · 설정 · 동기화 페이로드 · KPI) · KPI 산식 · Cloud 쓰기 0 · 갱신 훅 · 경쟁 상태 · 분할 · 조회 실패 · 기기 초기화
- 재작성(새 정책과 충돌한 스냅샷 기반 일별 손익 검증): `e2e/82` T4 · T5 · T6 · R0-2 · R0-5의 일별 손익 부분은 같은 모양의 행으로 렌더러 · 요약 규칙(null 막대 없음 · 0 막대 · null 제외 합산)을 고정 / `e2e/83` N5 일별 손익 [0, null, 0] → [0, 0, 0]. 스냅샷 보존 · 동기화 · 백업 · 초기화 테스트는 그대로
- 게이트: **Unit 312 · E2E 847 · Golden 122 · ESLint 0 · Data Guard PASS · Release Guard PASS** (전체 실행 1회 전부 통과) · 브라우저 8뷰포트(375/768/1024/1440 × Light/Dark) 두 팝업 값 일치 · 버튼/탭 44px · 글자 14px · 잘림/넘침 0 · 저장소 · 스냅샷 불변 · Cloud 쓰기 0

**29-6. 알려진 한계(숨기지 않음)**
- §28-5 그대로(현금 미연결 · 첫 기록 이전 · 계산 불가 자산 · 특수 거래일 확정 지연 · 거래정지 · M5 · 외부 프록시 의존)
- 일별 손익: 원화 현금 · 부동산 · 채권의 가치 변화는 손익에 넣지 않는다(시세 없음 · 기존 앱과 같다) · 원장 없는 달러 현금은 계산 불가 · 수수료 미차감
- KPI 카드와 팝업의 오늘 값은 다를 수 있다(U6 · 안내 문구)
- 첫 팝업 열기 지연(외부 프록시 조회)은 실기기에서 측정하지 않았다

## 30. P1-1 동기화 차이 확인 — 자동 동기화 반영 전 사용자 확정 (PM 구현 지시 · v243)

> 자동 동기화가 받은 클라우드 데이터가 이 기기와 **의미 있게 다르면 반영하지 않고**, 실제 자산 · 거래 단위의 차이를 보여 준 뒤 사용자가 방향을 고른다. §19(v231 · 동기화 재개 시 방향 선택)를 **자동 동기화 전반**으로 넓힌 것이다. 병합 규칙(`mergeCollectionById`) · fullAdopt · localWins · 암호화 · Cloud schema · localStorage 키는 바꾸지 않았다.

**30-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **S-1** | 의미 있는 차이가 없으면 확인 화면 없이 기존 자동 동기화를 계속한다 |
| **S-2** | 차이가 있으면 자동 병합 · 자동 업로드를 보류하고, 차이를 보여 준 뒤 사용자가 고른 경우에만 실행한다 |
| **S-3** | 선택지: [클라우드 데이터 받기](기존 `pullFromCloud({ fullAdopt: true })`) · [이 기기 데이터 올리기](기존 `pushToCloud({ localWins: true })`) · [취소](동기화하지 않음 · 이 기기 · 클라우드 무변경) |
| **S-4** | 비교 대상(받는 쪽 정규화와 같은 규칙): 자산 id별 종목명 · 티커 · 보유자 · 계좌 · 자산군 · 자산군 확정 · 국내/해외 · 통화 · 수량 · 매입단가 · 매입 환율 · 대표매칭 · 역할 · 수량 관리 / 거래 id별 거래일 · 종목명 · 티커 · 보유자 · 계좌 · 매수/매도 · 수량 · 단가 · 통화 · 적용 환율 · 수수료 · 최초/기간 / 목표비중 / 미래예측 설정 |
| **S-5** | 차이로 보지 않는 것: version · updatedAt · createdAt · 배열 순서 · 직렬화 순서 · 현재가 · regularMarketPrice · 환율 · 일간변동률 · 합집합 3종(tickerRoles · learnedTickerNames · dailySnapshots, 기존 처리 유지) · 미래예측 추천 배지 기록 |
| **S-6** | 같은 차이로 확인 화면을 겹쳐 띄우거나 반복하지 않는다. 새 localStorage 키를 만들지 않는다(메모리 상태) |
| **S-7** | malformed payload(복호화는 되지만 assets/transactions가 배열이 아님 · id 없는 항목 · 설정이 객체가 아님) → 동기화 중단 · 빈 목록으로 보지 않음 · 안내 "클라우드 데이터 형식을 확인할 수 없어 동기화를 중단했습니다. 현재 기기의 데이터는 변경되지 않았습니다." |
| **PM 결정 (2026-09-15)** | [클라우드 데이터 받기]는 목표비중 · 미래예측 설정도 **클라우드 값으로** 맞춘다(`adoptSettings`). 사유: 기존 "더 최근에 바꾼 쪽 유지"로는 이 기기 설정 시각이 더 최근일 때(예: 새로 연결한 기기의 기본 설정) 받은 뒤에도 차이가 남아, 같은 설정 차이로 자동 동기화가 계속 보류된다. 자동 동기화의 필드 시각 비교와 fullAdopt(자산 · 거래 통째 받기)의 의미는 그대로다. 동기화 재개 화면의 [받기]에도 같이 적용된다 |
| 금지 유지 | field-level merge · 3-way merge · conflict DB · sync history · device registry · 메인기기/읽기 전용 기기 정책 · Cloud schema 변경 · AI 판단 — P1-2 이후 별도 결정 |

**30-2. 구현**

| 파일 | 변경 |
|---|---|
| `js/25-sync-diff.js` (신규) | 순수 함수: `validateSyncPayload` · `compareSyncData`(자산 · 거래 localOnly / cloudOnly / different + 필드별 양쪽 값 · rebalance / projection changed · hasMeaningfulDifference) · `syncDiffSignature`(취소 판정) · 표시 문구 `syncDiffValueText` · `syncDiffItemLines` · `syncDiffEffectLines`. 입력 불변 · 저장 · 네트워크 · 화면 없음. js/12보다 먼저 로드 |
| `js/12-import-export-sync.js` | 반영 직전 검사 `gateIncomingSyncData`(pull 병합 직전 · push 선병합 직전) · 보류 상태 `syncDiffHold`(메모리 · 같은 클라우드 버전은 다시 복호화하지 않음) · 모양 검사 `checkSyncPayloadShape`(받기 · 올리기 재확인 · 재개 확인 포함) · 확인 화면 `renderSyncDirectionDiff`(textContent만) · [취소] · 닫기(X · 바깥 · ESC · 뒤로가기) = 취소 · 확인하는 사이 차이가 달라지면 반영하지 않고 새 차이로 다시 표시(`expectSignature` — 시세 · 일별 기록만 올라와 버전만 바뀐 경우는 그대로 진행) · 헤더 버튼 "서버 동기화 확인 필요" · 받기 `adoptSettings` · [올리기] 확인 문구 정정 |
| `index.html` | 방향 선택 박스 확장(제목 · 안내 · 차이 요약 · 상세 보기 · 버튼별 결과 · [취소] 44px) · 동기화 모달 세로 스크롤(max-h 90vh) · js/25 로드 · v243 |
| `sw.js` | CACHE_NAME v243 |

무변경: `mergeCollectionById` · `mergeAssetsAndTransactionsWithRemote` · `buildSyncBlob` · `stampPayload` · `encryptSyncBlob` / `decryptSyncBlob` · `deriveKvKey` · Worker API · Cloud schema · localStorage 키 · Daily Valuation · 계산 엔진 · Risk · MC · Return Key

**30-3. 동작**

| 상황 | 동작 |
|---|---|
| 클라우드 버전이 이 기기가 마지막으로 반영한 버전 이하 | 예전 그대로(이 기기 편집은 그대로 업로드) |
| 새 클라우드 버전 · 의미 있는 차이 없음 | 예전 그대로 병합 · 업로드 · 확인 화면 없음 |
| 새 클라우드 버전 · 차이 있음 | 병합 · 업로드 · lastVersion 갱신 없음 → 확인 화면(부팅 · 10초 주기 · 편집 뒤 업로드 모두 같은 검사) |
| [클라우드 데이터 받기] | 확인 당시 차이와 같으면 기존 fullAdopt + 설정 클라우드 값 → 보류 해제 |
| [이 기기 데이터 올리기] | 확인창 → 확인 당시 차이와 같으면 기존 localWins → 보류 해제 |
| [취소] · 닫기 | 이 기기 · 클라우드 무변경 · 보류 유지 · 같은 확인을 다시 띄우지 않음(클라우드 버전과 차이 내용이 둘 다 바뀌면 다시 표시) · 동기화 설정을 열면 다시 확인 |
| 확인하는 사이 차이 변경 | 반영하지 않고 새 차이로 다시 표시 |
| malformed payload | 자동 병합 · 받기 · 올리기 · 재개 방향 선택 모두 중단 · 안내(자동 동기화는 같은 버전에 1회) |
| 동기화 재개(암호 저장) | 방향 선택 유지(차이가 없어도 묻는다 · §19 그대로) + 차이 표시 |

**30-4. 정책상 결과 · 알려진 한계(숨기지 않음)**
- S-2에 따라 한쪽 기기의 사용자 데이터 추가 · 수정 · 삭제는 다른 기기에서 **다음 동기화 때 확인 화면**으로 나타난다. 사용자 데이터 차이의 자동 병합은 더 이상 일어나지 않는다.
- 보류 중에는 그 기기의 편집도 클라우드에 올라가지 않는다(선택 전까지). 헤더 동기화 버튼이 "확인 필요"로 표시된다.
- 보류 · 취소 기억은 메모리에만 있다. 앱을 다시 열면 첫 동기화가 다시 비교해 같은 확인을 보여 준다.
- 차이는 두 곳의 현재 값 비교다. 누가 언제 바꿨는지(한쪽 수정 · 양쪽 수정 · 삭제 vs 수정)는 구분하지 않고 "한쪽에만 있음 · 내용이 다름"으로 보여 준다(3-way · 기기 식별 없음).
- 한쪽에만 있는 항목의 세부 내용 변경은 취소 판정 서명에 넣지 않는다(id만). 그 변경만으로는 취소한 확인을 다시 띄우지 않는다.
- v242 이하 앱이 켜진 기기는 새 서비스 워커를 받기 전까지 예전처럼 자동 병합한다.
- 합집합 3종은 받기 · 자동 동기화에서 예전처럼 합쳐진다.

**30-5. 테스트**
- 신규 Unit `test/sync-diff.test.js` 12건 — 실제 js/01~10 · js/25를 vm 샌드박스에서 실행: 같은 데이터(updatedAt · createdAt · 배열 · 키 순서) · 이 기기에만/클라우드에만 · 수량 필드 차이 · 거래 필드 차이 · 삭제 vs 수정 양방향 · 목표비중/미래예측 변경 · 시세/환율만 · 합집합만 · malformed 12종 거부 · 입력 불변(깊은 동결) · 받는 쪽 정규화와 같은 규칙 · 취소 서명
- 신규 E2E `e2e/89-sync-diff-confirm.spec.js` 16건: S-01 차이 없음 자동 동기화 · S-02 이 기기에만 · 재진입 · 업로드 보류 · S-03 클라우드에만 + 받기(fullAdopt 기준선) · S-04 수량 차이 + 올리기 + 상대 기기 보류 · S-05 거래 차이 · S-06 삭제 vs 수정 양방향 · S-07 설정 차이 + 받기 설정 채택 · S-08 malformed(pull · 받기 · push · 재개) · S-09 취소 · 닫기 · 재표시 규칙 · S-10 확인 중 변경 · S-11 404 · 재개 같음/다름 · 재개 취소 · S-12 JSON 복원 뒤 · S-13 375 Dark · 375 Light · Tablet 768 · Desktop 1280(44px · 14px · 잘림 · nowrap · 가로 넘침 · 스크롤로 버튼 도달)
- 기대값 변경(새 정책과 직접 충돌 · 사유): `e2e/78` T-03 · T-06~T-08 · T-09 · T-10/T-11 · T-16/T-17 · T-19~T-25(상대 기기의 pull이 곧바로 병합 → 확인 화면 뒤 [받기]) · T-15(자동 합침 → 합치지도 지우지도 않고 확인 대기 · 제목 변경) · T-27(옵션 없는 push 선병합 → 내용 차이가 없으면 선병합 유지 · 차이가 있으면 보류 · 제목 변경) / `e2e/85` RR-3~RR-5(pull 'applied' → 'held' 뒤 [받기]). 그 밖의 테스트는 수정하지 않았다
- 게이트: **Unit 324 · E2E 863 · Golden 122 · ESLint 0 · Data Guard PASS · Release Guard PASS** (최종 전체 실행 1회 전부 통과) · 브라우저: e2e/89 S-13(375 Dark · 375 Light · Tablet 768 · Desktop 1280) 44px · 14px · 잘림 0 · nowrap 0 · 가로 넘침 0 · 스크롤로 버튼 도달 · 실제 렌더링 캡처 확인(pageerror 0)

## 31. Monte Carlo 결과 표시 · 운용보수 입력 경로 정합성 (PM 일괄 구현 지시 ①~⑤ · 2026-09-15 · 릴리스 전)

> v243 READ-ONLY 사전 검토(5개 변경 후보) 결과를 근거로 PM이 사용자 승인까지 받아 확정한 표시 · 입력 정책이다. **계산 엔진(js/15) · 어댑터(js/16) · Worker(js/17) · Controller(js/18) · 인플레이션(js/20) · Return Key · SoT · 동기화 · Safety 판정 로직은 바꾸지 않았다.** 사용자에게 보이는 범위와 의미만 바뀐다. §7-3의 "P10~P90 화면 표시" 항목은 이 절로 개정된다.

**31-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **MCD-1 운용보수 입력** | 운용보수 팝업은 MC가 실제로 계산하는 항목을 모두 나열한다: 일반계좌 목표 종목 + 절세계좌 보유 · 적립 배분 · 미배분 잔여분(`buildTaxAdvantagedMonteCarloInputs`, 어댑터와 같은 함수). 키 규칙(`resolveFeeUIKey` = `getTargetProjectionFeeRate`와 같은 규칙) · 카테고리 키(`주식형자산` · `채권` · `현금`, 지역 구분 없음) · fee 계산식 · 미확인과 명시적 0% 구분은 그대로. 같은 키는 한 행(입력칸 하나)으로 합치고 행마다 쓰이는 계좌(일반계좌 / 절세계좌 / 일반계좌 · 절세계좌)를 표시한다. 기존 사용자 입력값은 덮어쓰지 않는다 |
| **MCD-2 기본 계좌 범위** | MC 결과가 오면 절세계좌 결과(`accountScopes`)가 있으면 **통합(combined)**, 없으면 **일반계좌(general)** 를 기본 선택한다. 재실행 시 이 기본값으로 돌아가고, 기간 변경 시 범위는 유지한다. 사용자 전환(일반계좌 / 절세계좌 / 통합)은 그대로. combined는 엔진이 같은 경로에서 합친 분포이며 새로 계산하지 않는다(P50 단순 합산 금지 유지) |
| **MCD-3 P25 · P50 중심** | 핵심 결과 카드에 `시뮬레이션 중앙값(P50)`과 `보수적으로 볼 때의 참고 금액(P25)`(명목 + 현재가치)을 함께 보여 준다. P25/P50은 금액의 위치(percentile)이며 확률이 아니라고 카드 안에서 설명한다. 표는 P25 · P50 열을 굵게 강조한다 |
| **MCD-3 목표 도달 가능성** | 기존 `goalProbability = count(sample ≥ goal) / n` 하나만 표시한다. **NO-GO**: P25/P50별 목표달성률 · 달성확률 등 새 지표. "P25 확률" 같은 표현 금지. 위쪽 금액의 기간(선택 기간)과 확률의 기간(목표 기간)이 다르면 그 사실을 한 줄로 밝힌다 |
| **MCD-4 P90** | P90은 엔진 percentile · `accountScopes` · js/20 현재가치 변환 · Safety 결과 범위 판정(`assessResultSpread`) · 테스트 데이터에 **그대로 유지**한다. 화면(표 열 · 범위 막대 · 해설 문구)에서만 뺀다. 범위 막대 길이 기준은 화면에 보이는 최댓값(P75)으로 바꾼다(표시 배율만) |
| **MCD-5 일반계좌 기준 문구** | 일반계좌 값으로만 계산되는 표시는 그 사실을 밝힌다: 가중평균 운용보수 `(일반계좌 목표비중 가중평균)` · 적립금 안내 `일반계좌 월 적립금 …` / `일반계좌 적립금은 … 목표비중을 기준으로 계산합니다` · 결과 범위 판정 안내 `일반계좌 결과 기준으로 …` · 목표확률 정밀도 WARNING `일반계좌 결과 기준으로, 낮은 시뮬레이션 횟수에서는 …`(PM 후속 지시 · 판정 입력 · 기준 무변경) · 결과 하단 ※ 문구(일반계좌 = 목표 비중, 절세계좌 = 보유 + 적립설정 배분). 항상 표시되는 범위 안내(`explainAccumulationScopeAlwaysOn`)의 "화면 위쪽은 일반계좌 기준" 문장은 "위에서 고른 계좌 범위를 따른다 + 범위별 계산 방식"으로 정정 |
| 범위 밖(별도) | **G-1** Return Key UNRESOLVED → 0% 계산 시 MC 경고 부재 — 별도 P1(이번 작업에서 계산 · 경고 · 구조 변경 없음). Safety 판정 기준 · post-hoc safety의 일반계좌 기준 계산 · deterministic 계산 · 엔진 계산 범위는 변경 금지 |

**31-2. 구현**

| 파일 | 변경 |
|---|---|
| `js/19-monte-carlo-ui.js` | `buildFeeRateRows`(일반 + 절세 항목 · 키별 한 행 · 계좌 표시) · 팝업 행에 계좌 줄 · 기본 범위(`mcHasAccountScopes` ? combined : general) · P25 카드 값 · 표 P90 열 제거 · 막대 P90 행 제거 + 기준 P75 · 목표 기간 안내 줄 · 가중평균 보수 / 적립금 문구 |
| `index.html` | P25 카드 · 해설 문구 · 표 헤더 P90 제거(P25 굵게) · 범위 선택 정적 기본 표시 통합 · 결과 하단 ※ 문구 · 가중평균 보수 자리 문구 · 운용보수 팝업 안내 한 줄 |
| `js/21-safety-layer.js` | `assessResultSpread` 안내 문구(판정 기준 p90/p10 > 20 무변경) · `explainAccumulationScopeAlwaysOn` 문구 |
| `js/03-filters-charts-tabs.js` | `monteCarloDesc` 문구(P10~P90 → P50 · P25 중심, 현재 화면에 해당 요소 없음) |

| `sw.js` · `index.html` | CACHE_NAME · appVersionLabel v244 (전체 게이트 통과 후 상향 · production 확정은 PM 승인 대기) |

무변경: js/15 · js/16 · js/17 · js/18 · js/20 · js/22 · Return Key · customFeeRates 스키마 · 동기화 · localStorage 키

**31-3. 테스트**
- 신규 E2E `e2e/90-mc-display-policy.spec.js`: F-1 · F-2(일반만 · 절세만 · 양쪽 · 명시 0 · 미설정 · 실제 MC 입력 키 일치) · S-1 · S-2(통합 기본 · 일반 기본 · 전환 · 기간 유지 · 재실행) · P-1(P25/P50 값 · P90 코드/금액 부재 · 데이터에는 P90 존재 · 막대 4개) · G-1(확률 1개 · 금지 표현 · 기간 안내) · W-1(일반계좌 기준 문구) · R(375/768/1024 Dark · Light + 1440)
- 기대값 변경(새 정책과 직접 충돌 · 사유): `e2e/73` B(기본 일반계좌 → 통합) · C(일반계좌 값을 직접 선택해 읽음) · D(기간 변경 시 "통합 · 5년 후") · E(P90 표시 → 미표시 + 데이터 존재) · G(목표 기준 통합으로 시작) / `e2e/11`(헤더 P90 · "높은 편" → 없음) / `e2e/32`(헤더 코드 P90 제외) / `e2e/64`(범위 안내 새 문장) / `e2e/30` 12(시드의 ISA 채권이 팝업에 나와 요약 "미확인 1개" → 모두 입력 후 "전부 확인됨") / `e2e/01` 제목

## 32. Return Key → Return Rate → Deterministic → Monte Carlo 통합 수정 (PMD-11 공식 통합 과제 · PM 통합 구현 지시 · 2026-09-15 · 릴리스 전)

> 3차 READ-ONLY 검증(HEAD `6599d0e`)의 확정 결함과 PM Decision(PMD-01~11)을 한 번에 반영한 통합 수정이다. **GBM · σ · 상관 모델 · 연 1회 리밸런싱 · 월 단위 순서 · seed · 인플레이션 외부 적용 · Tax MC 3-scope · goalProbability 정의 · Return Key 숫자(US 4.1/5.1/6.0 · KOSPI · BOND · 부동산) · SoT 스키마 · 동기화는 바꾸지 않았다.** 사용자 데이터 자동 migration 없음.

**32-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **PMD-01** | 사용자가 입력한 티커 · 키 원본 보존, 자동 접미사/표준화 금지. 접미사 없는 국내 종목코드 키(예: `005930`)는 보유 종목과 연결되지 않는다는 사실만 안내(수익률 관리 행 · 엑셀 가져오기 알림) |
| **PMD-02 / N-10** | 소유자별 사용자 설정은 독립. 다른 소유자 · 다른 계좌의 대표매칭(`rateMatchOverride`)을 빌려 쓰지 않는다. 같은 종목에 서로 다른 기준이 쓰이면 경고 + 사용자 수정(자동 해결 · 먼저/나중 우선순위 없음) |
| **PMD-03** | **PM 최종 결정 A(2026-09-15): 현행 MC 계산 유지 + 월 적립금 대상 종목 미선택 경고.** 미선택 사실 · 비율 · 금액을 알리고 종목 선택을 안내한다. 금지: 미선택 금액 자동 종목 배분 · 투자 제외 · 현금 처리 · 실행 차단 · contribution/target allocation 계산 변경 · MC 모델 변경(§7 순서 contribution → target allocation → correlated shock → gross return → fee → annual rebalance → milestone 그대로) |
| **PMD-04** | 절세계좌 운용보수 = 일반계좌와 같은 정책(결정론에도 월 보수 배율 적용) · 절세 전용 fee 모델 없음 |
| **PMD-05** | MC 구조적 낙관성은 모델 특성으로 인정 - GBM · σ · 상관 · 리밸런싱 무변경, Det에 맞추지 않음 |
| **PMD-06** | 사용자 수익률 = 연 APR · 월복리 유지. 수익률 관리 팝업에 "월복리 기준(10% → 1년 약 10.47%)" 한 줄 |
| **PMD-07** | 이름 키워드 자동 매칭 유지, 자산 성격과 다르면 NEEDS_REVIEW 경고(MC 결과 + 자산 상세) · 사용자 확정값 불변 · 우선순위 재설계 없음 |
| **PMD-08** | 미등재 개별주 · 가정 없음은 UNRESOLVED 0% 유지 + "가정 없음/확인 필요" 경고 · 시장 anchor · 지역 대체 없음 |
| **PMD-09** | 시세 · 환율 갱신과 탭 이동은 MC 결과를 지우지 않는다. MC 입력이 바뀌면 결과를 지우지 않고 "다시 계산이 필요합니다" + 중앙값 제목 "이전 설정 기준" 표시(입력을 되돌리면 사라짐) |
| **PMD-10 / F-05** | 사용자 확정(user) category > 시스템 추천(system). 시스템 추천은 저장값 자체를 계산 근거로 쓰지 않고, 지금의 티커 · 이름으로 같은 자동 분류(`classifyCategory`)를 다시 했을 때 같은 결과일 때만 자동 판별 근거로 쓴다. **legacy(표식 없음)는 소급 확정도 소급 격하도 하지 않고 기존처럼 사용**(BL-17 · 기존 계산값 보존) |
| **PMD-11** | 이 절이 공식 통합 과제 기록이다 |

**32-2. 구현(확정 FIX)**

| ID | 수정 | 파일 |
|---|---|---|
| F-01 | 엑셀 키만 적은 행 보존(처음 보는 사용자 키만 `{label}` · 시스템 키 빈 행/기존 키는 기존처럼 건드리지 않음) · 팝업 저장이 키만 있는 항목을 지우지 않음 · 키만 있는 항목은 매칭 · "사용자 설정값"으로 보지 않음(계산은 자동 판별) | js/12 · js/05 |
| F-02 / N-01 | 팝업: 저장된 칸만 값 표시(사용자 행 빈 칸 = "미입력"), 사용자가 고친 칸만 저장, 비운 칸 = 미입력, 기존 명시 0 보존, 한 번도 저장 안 된 행은 무수정 저장 시 항목을 만들지 않음 · `UNRESOLVED`를 목록 · 저장 · 엑셀 키로 만들지 않음(기존 저장분은 자동 삭제하지 않음) | js/05 · js/12 |
| F-03 | 시스템 행 판정을 키 자체(`isScenarioRateBaseKey`)로 - 보유하지 않은 시스템 키가 사용자 값으로 굳지 않음 | js/05 |
| F-04 · N-08 · N-11 · F-24 | 목표 · 배분 항목도 "그 소유자 · 그 계좌 범위"의 보유 자산으로 경로 A(`resolveAssetGroupKeyDetail`)를 쓴다(`resolveTargetRateDetail`). 보유분이 없으면 다른 보유분의 자산 사실(자산군 · 이름)만 쓰고 대표매칭은 쓰지 않음, 그래도 없으면 가상 자산. 절세 MC 보유분 = 그 자산 자체(`resolveMcEntryRateDetail`). 수익률 관리 목록도 같은 해석. 사전 칸이 빈 시나리오는 자동 판별로 넘어감(0% 아님) | js/05 · js/16 |
| F-08 | MC Safety `SAFETY_RETURN_ASSUMPTION_MISSING`(결과 바로 아래) · 자산 상세 "지정된 기준에 수익률이 없어 0%" | js/21 · js/22 · js/16 · js/05 |
| N-05 | 절세 연납 결정론 = 연초 납입 + 월복리(실효 연율 `(1+r/12)^12-1`로 연 계산) - MC와 같은 뜻 | js/05 |
| N-06 | 이름형 목표 · 절세 이름형 보유의 σ=0 판정 = 확정 자산군(시스템 추천이면 이름) - 어댑터 · 시계열 빌더 같은 값 | js/05 · js/16 |
| N-07 | 엔진 안에서만 계산용 비중을 합계로 나눔(합계가 1이면 비트 동일) · 입력 · 저장 비중 불변 · 가중평균 보수 표시도 같은 기준 | js/15 · js/19 |
| N-09 | 상관 경고 기준 = 수익률 관측치 수(`returnObservationCount`) | js/15 · js/16 · js/21 |
| N-10 | 같은 종목이라도 세 시나리오 키가 다른 항목은 instrument 키에 기준을 붙여 분리(`T:티커\|키`) · 같으면 기존 키 그대로 · `채권`/`BOND` 표기 차이는 같은 기준(`canonicalRateKey`) · 경고 `SAFETY_RETURN_KEY_CONFLICT` · 자산 상세 안내 | js/05 · js/16 · js/08 |
| F-06a | 실행 중(WAITING/RUNNING)에는 화면을 READY로 되돌리지 않음 · 새 실행이 이전 실행을 대신한 취소는 화면을 초기화하지 않음 · 준비 · 실행 중 중복 클릭 무시 | js/05 · js/18 · js/19 |
| F-07 · N-04 | Cholesky가 기존 경로로 실패할 때만 같은 PSD 클리핑을 고유값 하한(1e-8, 1e-6)으로 재시도 - ρ=±1 · 고유값 0 계산 가능, 기존 성공 행렬 비트 동일 | js/15 |
| PMD-03 경고 | `SAFETY_CONTRIBUTION_TARGET_UNSELECTED`(소유자별 미선택 비율 · 금액) · `SAFETY_CONTRIBUTION_OWNER_NOT_WEIGHTED`(원금이 없어 가구 가중에서 빠진 소유자) | js/05 · js/21 · js/16 |
| PMD-09 | 입력 서명(`computeMonteCarloInputSignature`: 자산 수량 · 매입가 · 계좌 · 소유자 · 자산군/확정 · 대표매칭 · 시세 없는 자산 평가액, 목표 비중, 사전, 보수, 적립금 · 배분 · 증가율, 절세 계획, 물가, 실행 조건) - 시세 · 환율 제외 · `#mcStaleNotice` | js/19 · js/05 · index.html |

무변경: js/17 · js/20 · GBM/σ/상관/리밸런싱 · Return Key 숫자 · 스키마 · 동기화 · Risk · Macro · Daily Valuation

**32-3. 테스트**
- 신규 Unit `test/return-rate-integration.test.js` 21건(A 사전 · B 자산군/성격 · C 소유자 · D 결정론=MC(σ0) · E 엔진/경고 · F 목록)
- 신규 E2E `e2e/91-return-rate-integration.spec.js` 10건(D-1 팝업 저장 · D-2 엑셀 키만 행 왕복 · M-1 결과 유효성 · M-2 실행 중 갱신 · M-3 경고 · O-1 자산 상세 불일치 · R 375 Dark/Light · 768 · 1440)
- 기대값 변경(새 정책과 직접 충돌 · 사유): `e2e/29` 4(소유자 관점 전환 시 결과 숨김 → PMD-09 "다시 계산 필요" 표시)
- 수치 검증(합성 · 수정 전 HEAD vs 수정 후): 영향 없는 포트폴리오 결정론 3시나리오 · MC P50 비트 동일 / 절세 원금 Det=MC 2.2226억 / 연납 4.2146억 → 4.2739억(=MC) · 월납 4.1758억 불변 / 절세 보수 0.5% Det 4.0387억 → 3.6535억(=MC) / 비중 99.5% · 100.5% 2.0005억 · 2.4680억 → 2.2226억(=100%) / 이름형 코리아배당다우존스 Det 7 → 5.1(=A=MC) + 확인 필요 / 파크시스템스 가구 MC 4.5% 단일 → 4.5% · 7% 분리 + 경고 / ρ=±1 · 고유값 0 실패 → 성공 / 공통 날짜 10개 경고 없음 → 경고

**32-4. 알려진 한계(숨기지 않음)**
- 기존에 저장된 `UNRESOLVED` 사전 항목 · 0으로 변환돼 저장된 값 · 시스템 값으로 굳은 항목은 자동으로 되돌리지 않는다(migration 금지) - 새로 생기는 것만 막는다.
- N-02(엑셀 무수정 왕복 시 system → user 승격)는 이번 FIX 범위가 아니었다. 이름으로 재확인되지 않는 시스템 추천 자산군은 왕복 뒤 사용자 확정이 되어 계산 근거가 바뀔 수 있었다. **[2026-09-20 갱신] 대장 G-3으로 해소됨**(아래 32-5 참고).
- 결과 유효성 서명은 객체 키 순서를 비교하지 않는다(키 정렬 직렬화). 다만 배열 순서(목표 항목 · 배분 항목 순서)가 바뀌면 같은 내용이어도 "다시 계산 필요"가 뜬다(보수적 방향).
- 같은 소유자 · 같은 계좌 안의 보유분끼리 대표매칭이 다르면 어느 쪽도 고르지 않고 자동 판별로 계산한다(경고 표시).

**32-5. PM Decision 기록**
- **PMD-03 계산 방식 — 확정(A, 2026-09-15)**: 구현 보고 당시 "미선택 적립금을 목표 비중에 자동 분산하지 않는다"와 §7 기본 순서(contribution → target allocation)의 충돌, 미선택 금액의 계산 방법 부재를 PM Decision으로 올렸다. PM이 A(현행 MC 계산 유지 + 미선택 경고)로 확정했다 - 추가 계산 코드 없음, v245 경고 구현이 최종 정책이다. 선택지 B(선택 종목 MC 반영) · C(미선택분 투자 제외) · D(실행 차단)는 채택하지 않았다.
- **N-02**(엑셀 무수정 왕복 시 system → user 승격)는 당시 이 통합 과제에서 제외된 OPEN ISSUE였다. **[2026-09-20 갱신] 종결 대장 G-3으로 SOLVED** - js/12 `carryOverCategorySource`가 "자산군 칸 값이 기존과 같고 기존이 user가 아니면 기존 상태를 유지"하도록 바꿔 무수정 왕복에서 system → user 승격이 일어나지 않는다(값이 달라졌으면 예전대로 user). 기존 저장값의 migration은 여전히 하지 않는다.

## 33. Instrument Return Key Master (PMD-12 · v246 · PM 승인 · 조사 1 · 조사 2 완료 · 릴리스 전)

> 요구: 자산관리 파일 2번째 시트(수익률 관리 기준)의 Return Key에 종목이 연결돼 있으면, 신랑/와이프 · 계좌 · 보유 여부와 관계없이 그 종목에 같은 Return Key를 적용하고 결정론 · Monte Carlo 실제 입력까지 연결한다. **계산 변경은 "Instrument Master에 명시적으로 연결된 종목은 그 Return Key를 쓴다" 하나뿐이다.** GBM · σ · 상관 · RNG · 적립 · 리밸런싱 · 보수 · APR 월복리 · Return Key 수치 · 자동 추천 규칙 · UNRESOLVED 0% 정책 · MC 엔진은 바꾸지 않았다.

**33-1. PM 확정 정책**

| ID | 정책 |
|---|---|
| **PMD-12** | `state.projection.instrumentReturnKeys = { [종목 식별자 원문]: returnKey }`가 시스템 단위 **Instrument Return Key Master**다. 소유자 · 계좌 · 보유 여부와 무관하게 그 종목의 모든 보유분 · 목표 · 월 적립 배분 · 절세 배분에 적용된다. 해석 순서는 **USER override(`asset.rateMatchOverride`) → INSTRUMENT MASTER → 기존 자동 추천(customKey · customKeyword · category · presetTicker · tickerAlias · nameKeyword · assetCharacter) → UNRESOLVED**. Master는 자산 설정이 아니라 금융상품 자체의 기준정보이므로 PMD-02(다른 소유자 · 계좌의 `rateMatchOverride` 차용 금지)와 충돌하지 않는다 - 다른 보유분의 대표매칭은 계속 빌리지 않는다 |
| D-1 · D-7 | 식별자는 사용자가 적은 원문(티커, 티커 없으면 `NAME:이름`)을 그대로 저장하고 비교할 때만 `sanitizeTicker` · `normalizeNameKey`로 정규화한다 |
| D-3 | 엑셀 1시트 `대표매칭(수익률연동키)` = USER override 원본(Phase 48-A 유지) · 표시용 `수익률 기준 출처`(가져오기에서 읽지 않음). 2시트에 `적용 종목` 칸 추가(3시트 없음). 헤더에 칸이 없으면 옛 파일 → Master 불변, 칸이 있고 빈 칸이면 그 키의 연결 해제, 값이 있으면 복원 · 교체 |
| D-4 | 같은 종목에 서로 다른 Master 키 → 자동 선택 금지 · 기존 자동 추천 체인으로 계산 · NEEDS_REVIEW. 자동 결과가 UNRESOLVED여도 MISSING과 NEEDS_REVIEW를 따로 발생. Master와 사전 티커 키 행(customKey)이 함께 있으면 승인 순서대로 Master가 우선(충돌 아님) |
| D-5 | Master 키에 그 시나리오 수익률이 없으면 0% + MISSING, 다른 키로 대체하지 않는다 |
| D-6 | customKey · customKeyword 계산 의미 불변, 표시만 "종목 기준". 사용자 지정 판정(`isUserSet`)은 라벨 문자열이 아니라 source 기반이며 instrument는 사용자 지정(자산 단위)이 아니다 |
| D-8 | 기존 `asset.rateMatchOverride`를 Master로 자동 migration하지 않는다 |
| D-9 | 엑셀 1시트 같은 종목의 비어 있지 않은 역할이 모두 같으면 `tickerRoles`에 반영(한 번 저장) · 빈 칸은 기존 값을 지우지 않음 · 서로 다르면 반영하지 않고 알림 |
| D-10 | 거래 등록 · 수정에서 직접 고른 Return Key는 USER override로만 저장 · Master는 거래 경로에서 바뀌지 않는다. Master가 있으면 선택칸은 빈값(= Master 사용)을 유지하고 안내만 표시 |

**33-2. 구현**

| 영역 | 내용 | 파일 |
|---|---|---|
| 해석 | `findInstrumentReturnKey` · `resolveAssetGroupKeyDetail` 2단계 삽입(source `instrument`) · 충돌 표식 `instrumentConflict`를 `resolveAssetRateDetail` · `resolveTargetRateDetail`까지 전달 · 목표 · 미보유 목표 · 적립 · 절세 · MC는 기존 해석기를 그대로 경유 | js/05 |
| 표시 · 경고 | `RATE_KEY_SOURCE_LABELS` 종목 기준 · `describeAppliedReturnAssumption` source 기반 판정 · `assessReturnAssumptionStatus` 충돌 문구 · MC `pushReturnAssumptionIssues`(instrument 제외 목록 · 충돌 NEEDS_REVIEW를 MISSING과 독립 발행) | js/05 · js/16 |
| 수익률 관리 | 행별 적용 종목 입력 · Master 참조 키는 항상 목록에 포함 · 무수정 저장 유지 · 알아볼 수 없는 표기 · 중복은 저장 전 알림 · 행 삭제 = 그 키의 연결 해제 · 기본값 초기화는 Master 유지 | js/05 · index.html |
| 거래 | 종목 기준 안내(추천보다 먼저) · 선택칸 빈값 유지 · 새 자산일 때만 종목 포지션 미리 채움(기존 자산에는 새 쓰기 없음) | js/06 · index.html |
| 엑셀 | 1시트 출처 칸 · 2시트 적용 종목 칸(헤더 판정 · 매핑만 적힌 시스템 키 행 보존 · 충돌/표기 알림 · Master 변경도 저장) · 1시트 역할 → tickerRoles | js/12 · js/05 |
| 저장 · 동기화 | 기본값/로드/초기화 필드 · adopt(JSON 복원 · Cloud) FIX-7 hasOwn 규칙(필드 없음 = 로컬 유지, `{}` = 명시적 초기화) · 동기화 차이 비교 · MC 결과 유효성 서명 | js/01 · js/14 · js/12 · js/25 · js/19 |

무변경: js/15 · 17 · 18 · 20 · 21 · 22 · GBM/σ/상관/RNG/적립/리밸런싱/보수/월복리 · Return Key 숫자 · 자동 추천 규칙 · 기존 override/사전/tickerRoles 데이터

**33-3. 테스트**
- 신규 Unit `test/instrument-return-key-master.test.js`(I-1~I-9 · M-1 · S-1)
- 신규 E2E `e2e/92-instrument-return-key-master.spec.js`(T-1~T-3 · X-1~X-3 · P-1 · M-2 · R 375 Dark/Light · 768 · 1440)
- 기존 테스트 기대값 변경 없음

**33-4. 알려진 한계(숨기지 않음)**
- 앱 화면의 자동 추천 라벨은 기존 계약(e2e/48)대로 "자동 판별"을 유지한다(엑셀 출처 칸도 같은 말).
- v245 이하 기기는 Master를 표시 · 편집하지 못한다. 그 기기가 올린 projection에는 필드가 없어 신규 기기의 Master는 유지된다(projection 전체 LWW는 기존 그대로).
- 사전 티커 키 행이 있는 종목에 Master를 연결하면 그 행의 수익률은 그 종목 계산에 쓰이지 않는다(승인 순서).

## 34. 일반계좌 포트폴리오 화면 UX 정비 (v247 · PM 승인 · 모바일 우선 · 릴리스 전)

> **표시 계층만 바꾼다.** 목표 비중 계산 · 실행 금액 계산(`computeIndividualRebalanceGuide` · `computePortfolioTargetSummaryRows` · `computePositionRoleBreakdown` · `computeTargetRegionBreakdown`) · Return Key · Monte Carlo · deterministic projection · 자산/거래 데이터 구조 · 저장/복원/동기화는 **한 줄도 바꾸지 않았다.**

| ID | 확정 내용 |
|---|---|
| REQ-01 · REQ-02 | 소유자 타이틀의 접기/펼치기 상태(`positionAnalysisAccordionOpen[owner]`) **하나**가 "세부 종목 현황"과 "포지션 그래프"에 함께 적용된다. 두 영역을 같은 아코디언 body로 옮겨 상태를 공유하며 **새 상태를 만들지 않는다.** 신랑/와이프 상태는 예전처럼 독립 |
| REQ-03 | "전체 포지션별 목표비중 분석" 카드는 위치 · 계산 · 표시 모두 유지 |
| REQ-04 | "수익률 직접 조정 (고급)"은 제목 · 설명 · id · 핸들러 · 팝업 그대로, **색 체계만** violet 계열로 분석 카드와 구분(경고 amber · 핵심 조작 brand와도 겹치지 않음). 색만으로 뜻을 전달하지 않도록 ⚙ 아이콘과 "(고급)" 라벨 유지 |
| REQ-05 | "📋 종목별 실행 가이드" 카드 삭제(세부 종목 현황과 중복). 카드 전용 렌더 · 상태 · 안내문(`renderIndividualRebalanceGuide` · `rebalanceGuideAccordionOpen` · `guideScopeNote` 등)도 함께 제거. **엑셀 다운로드 기능은 삭제하지 않는다** |
| REQ-06 | 엑셀 다운로드를 신랑/와이프 타이틀 행(제목과 [비중조절] 사이)으로 이동(`data-rebalance-export-btn`). 시트 구성 · 파일명(`포트폴리오구성_실행가이드_YYYYMMDD.xlsx`) · 생성 로직(`buildRebalanceGuideSheetRows`)은 그대로 재사용 |
| REQ-07 | [비중조절] = 브랜드 채움(핵심 조작), [엑셀 다운로드] = 라인 버튼(보조). 둘 다 44px 터치 · 14px 글자. 공용 `.detail-btn`(10px, KPI 카드 공용)은 건드리지 않고 이 화면 전용 클래스(`.portfolio-weight-btn` · `.portfolio-export-btn`)만 신설 |
| REQ-08 | 서브탭 표시 이름 "포트폴리오 구성" → **"일반계좌 포트폴리오"**. 내부 키(`data-subtab="target"` · `rebalanceSubTab` · DOM id)는 변경하지 않는다 |
| REQ-09 | 탭 이름과 중복되던 안내문(`rebalanceScopeNote`)과 그 여백 삭제. 계산 대상 범위는 무변경 |

**34-1. 변경 파일** — `index.html`(탭 라벨 · 안내문 삭제 · 타이틀 행 · 아코디언 구조 · 고급 카드 색 · 버튼 클래스 · v247) · `js/03`(삭제된 문구/상태 배선 정리) · `js/04`(아코디언 가드 · 열림 높이 · 가이드 카드 렌더/상태 제거 · 엑셀 버튼 바인딩) · `sw.js`(v247) · `e2e/10 · 23 · 27 · 57 · 79`(변경된 UX 기준으로 기대값 수정) · 신규 `e2e/93-portfolio-mobile-ux.spec.js`

**34-2. 기존 기록과의 관계** — §20-2(v233)의 "수익률 직접 조정(고급) = 전체 포지션별 목표비중 분석과 종목별 실행 가이드 **사이**" 기록은 그대로 보존한다. v247에서 아래 카드가 삭제되어 기준점이 사라졌을 뿐, 그 버튼의 위치(포지션 카드 아래 · 독립 긴 버튼) · id · 핸들러 · 승인 문구는 변하지 않았다.

**34-3. 알려진 한계** — 미래예측 탭의 안내 문구("이 예측은 **포트폴리오 구성 탭**의 목표비중을 기준으로 합니다" 등)는 이번 범위(REQ-01~09) 밖이라 문구를 그대로 두었다. 탭 이름과 표현이 달라 보일 수 있으며, 변경은 PM 승인 사항이다.

## 35. v247 후속 모바일 UX 미세 수정 (v247-1 · v248 · PM 승인 · 표시 계층 한정)

> **표시 · 레이아웃 · 문구만 바꾼다.** 목표비중 · 실행금액 계산, Return Key 로직과 Master, customScenarioRates, `asset.rateMatchOverride`, MC, deterministic, 자산/거래 구조, 저장 · 복원 · 동기화, 엑셀 생성 로직은 diff 0이다.

| ID | 확정 내용 |
|---|---|
| REQ-01 | 신랑/와이프 타이틀 행을 375px에서 **모두 한 행**으로. 실측 원인: 컨테이너 343px에 제목(신랑 138 · 와이프 152px) + 버튼 그룹 239px + 간격이 들어가지 않아 **두 소유자 모두** 줄바꿈 상태였다. 두 소유자에 같은 규칙을 적용한다(한쪽 전용 CSS 없음) |
| REQ-02 | 버튼 좌우 padding 12→10px · 아이콘 간격 4→3px · 엑셀 라벨을 아이콘 + "엑셀"로 축약(뜻은 `aria-label`/`title`에 "엑셀 다운로드"로 유지). **글자 14px · 터치 높이 44px는 유지** - 좁다고 글자나 터치 영역을 줄이지 않는다 |
| REQ-03 | [비중조절] 채움색 `#4f46e5`(brand-600) → teal(`#0f766e`, 다크 `#0d9488`). 상단 [시세 & 환율 갱신](`#refreshAllBtn`, bg-brand-600)과 실측 배경색이 **완전히 같아** KPI 영역 버튼과 구분되지 않았다. 앱 전역 색 체계는 그대로 두고 이 버튼에만 적용하며, "비중조절" 텍스트도 유지한다 |
| REQ-04 | 「수익률 관리」 팝업 상단 설명 문단 3개(등록 안내 · 월복리 안내 · 적용 종목 안내) 삭제, 제목만 유지. 등록된 종목 · 초기화 · 수익률 3칸 · 키워드 · 적용 종목 · 저장 · 취소 등 설정 UI는 그대로 |
| REQ-05 · 06 | 키워드 입력 앞에 "키워드 :", 적용 종목 입력 앞에 "적용종목 :" **표시용 라벨**(입력칸 밖 span). 저장값(`keywords` 배열 · `instrumentReturnKeys`)과 파싱 · 매칭 · 엑셀 내보내기 값에는 접두어가 들어가지 않는다 |
| REQ-07 | 375px에서 팝업 좌우 잘림 · 입력 영역 가로 넘침 없음(입력칸을 `flex-1 min-w-0`로 두고 placeholder만 접두어와 겹치지 않게 축약) |

**35-1. §32 PMD-06과의 관계(중요)** — PMD-06의 **계산 정책(사용자 수익률 = 연 APR · 월복리)은 그대로 유지**된다. 이번에 없앤 것은 그 정책을 팝업 상단에 한 줄로 안내하던 **화면 문구**뿐이며, PM이 REQ-04로 명시 지시했다. §32의 PMD-06 기록은 삭제하지 않고 그대로 두고, 문구 노출이 사라졌다는 사실만 여기 기록한다(관련 E2E 기대값은 e2e/91 D-1에서 "문구 존재" → "문구 없음"으로 수정).

**35-2. 변경 파일** — `index.html`(헤더 flex-nowrap · 버튼 CSS/색 · 엑셀 라벨 · 팝업 상단 문단 삭제 · 접두어 라벨 CSS · v248) · `js/05`(팝업 행의 키워드/적용 종목 입력에 표시용 라벨 래퍼) · `sw.js`(v248) · `e2e/91`(상단 문구 기대값 · R 측정 대상) · `e2e/92`(R 측정 대상) · `e2e/93`(L·M 헤더 한 행/버튼 색·크기, N 팝업 접두어·저장값 무변경)

## 36. 미래예측 화면 정비 · 적립계획 카드 재배치 · 탭 명칭 "포트폴리오 설정" (v248-1 · PM 승인 · 표시 계층 한정 · 미커밋)

> **표시 위치 · 문구 · 레이아웃만 바꾼다. 새 계산식은 없다.** 목표비중 · 실행금액 · 적립금액 계산, 미래예측(deterministic) · MC 엔진/시나리오, 성장률 · 물가상승률 · 절세계좌 계산, Return Key · Instrument Master, customScenarioRates, `asset.rateMatchOverride`, 자산/거래/계좌 구조, 저장 · 복원 · 동기화, 엑셀 생성, 시세/환율은 무변경이다(js/01 · js/15~18 · js/21 diff 0).

| ID | 확정 내용 |
|---|---|
| REQ-01 | "지금 계획대로면" 카드의 접힘 영역("이 계산은 이런 가정을 사용했어요" · 가정 목록)을 삭제했다. 그 안의 **인플레이션율 · [가정 수정]**은 MC 카드의 "운용보수(연간) 설정" 바로 아래로 옮겼다 - id(`projectionInflationSummary` · `openProjectionAssumptionsBtn`) · 리스너 · 팝업 · draft 저장은 그대로 |
| REQ-02 | "💰 나의 투자계획" → **"💰 일반계좌 적립계획"**(표시명만). "이 예측은 포트폴리오 구성 탭의 목표비중을 기준으로 합니다 / 목표비중 보기 ›"(`goToRebalanceTargetBtn`)와 그 리스너 삭제. 매달 투자할 금액 · [적립금 설정]은 그대로 |
| REQ-03 | 일반계좌 적립계획 카드를 포트폴리오 설정 탭의 "수익률 직접 조정 (고급)" 바로 아래로 이동(`#generalContributionPlanCard`). id · 저장값 · 계산 그대로. 이 탭에서도 `renderRebalance → updateRebalanceResults → updateProjection`이 요약 배지를 갱신한다 |
| REQ-04 · 05 | "🏦 절세계좌 현황" 카드 전체(신랑/와이프 계좌 세부 드롭다운 포함)를 일반계좌 적립계획 아래로 이동하고 제목만 **"🏦 절세계좌 적립계획"**으로 변경(`#taxContributionPlanCard`). `taxAdvantagedSummary` · `taxAdvantagedPlanBtn` · 아코디언 상태(`taxHusband`/`taxWife`) 그대로 |
| REQ-06 | 카드 설명의 "앞으로 얼마나 불어날지는 위 Monte Carlo에서 … 확인하세요." 삭제. "합계 평가금액" → **"현재 절세계좌 금액"**(값 `getTaxAdvantagedHoldingsByOwner` 합계 그대로) |
| REQ-07 · 08 | "📐 성장률별 참고 결과" 카드 전체(제목 · 설명 · 성장률 카드 · "성장률별 결과 보기" 아코디언 · 일반계좌/전체 자산 그래프 · 금액 비교표 · 관점 토글) 삭제. 성장률 3개만 "지금 계획대로면" 제목 아래로 옮겨 **"보수적 / 일반적 / 긍정적 N%"**(이름 · 값 두 줄 칩, 14px)로 표시 - 값은 `presetResults[preset].weightedAvgRate`(`computeTargetWeightedAvgRate`) 그대로. 삭제된 UI 전용 렌더/상태(`renderScenarioCompareChart` · `renderScenarioCompareScheduleTable` · `scheduleTooltipAutoHide` · 관점 토글 · `hasDistinctTotalAssetScenario` · 아코디언 키 4개)도 함께 제거. **시나리오 계산(`presetResults` · `totalScenarioData`)은 그대로 실행** |
| REQ-09 | "20년 후 자산 참고값"을 **일반계좌 / 절세계좌 / 합계**로 분리. 일반계좌 = `presetResults.normal.yearlyPoints[20].total`(기존 값). 절세계좌 · 합계 = `updateProjection()`의 `totalScenarioData`(normal) 20년 포인트 - 이미 합산에 쓰이던 두 항(절세계좌 합 `simulateTaxAdvantagedOwnerYearlyPoints` · 부동산 미래가치)을 포인트에 함께 담았을 뿐, total은 같은 항 · 같은 순서의 합이다. **합계는 앱의 공식 총자산 정의(일반계좌 + 절세계좌 + 부동산)를 그대로 쓴다** - 부동산이 없으면 합계 = 일반 + 절세, 부동산이 있으면 라벨을 "합계(부동산 포함)"로 표시 |
| REQ-10 | 위치가 바뀌어 어긋난 문구만 최소 수정: 히어로 안내("(일반계좌 기준)" → "현재 자산 · 매달 투자는 일반계좌 기준"), MC 설명 팝업의 카드 이름("성장률별 참고 결과" → "지금 계획대로면"의 참고값), MC 결과 주석 "'포트폴리오 구성'의 목표 비중" → "'포트폴리오 설정'…", 수익률 관리 빈 목록 안내의 탭 이름 |
| 색 | 두 적립계획 카드는 Tailwind 기본 팔레트 **sky** 계열 하나(bg-sky-50 / dark:bg-sky-950/40 · border-sky-200 / dark:border-sky-800 · 제목 sky-900 / sky-100)로 묶었다 - 분석 카드(흰색) · 고급 카드(violet) · [비중조절](teal) · 핵심 조작(brand) · 경고(amber) · 좋음(emerald)과 겹치지 않는다. 앱 전역 색 체계 무변경 |
| TAB | 서브탭 표시 이름 **"일반계좌 포트폴리오" → "포트폴리오 설정"** → 화면은 [포트폴리오 설정] [미래 예측]. 내부 key(`data-subtab="target"` · `rebalanceSubTab` · `rebalanceSubTarget`) 무변경 |

**36-1. 기존 기록과의 관계** — §34 REQ-08(탭 이름 "일반계좌 포트폴리오")은 삭제하지 않고 보존하며, 표시 이름만 이 절(TAB)로 대체된다. §34-3의 "알려진 한계"(미래예측 탭의 '포트폴리오 구성 탭' 안내 문구)는 REQ-02로 그 문구가 삭제되어 해소됐다. Phase 9 P2(적립 기간을 결과 화면 가정 목록에 노출)는 REQ-01로 그 목록이 삭제되어, 적립 기간은 [적립금 설정] 팝업 입력칸에서만 보인다(e2e/18 P2 기대값을 팝업 기준으로 갱신).

**36-2. 남은 옛 명칭(이번 범위 밖 · PM 판단 대기)** — 대시보드 RISK 카드 버튼 "포트폴리오 구성에서 보기"(js/10), 목표비중 합계 BLOCK 안내 "포트폴리오 구성 화면에서…"(js/21 Safety Layer). 코드 주석 · 엑셀 파일명(`포트폴리오구성_실행가이드_*.xlsx`)은 그대로.

**36-3. 변경 파일** — `index.html`(탭 라벨 · 적립계획 카드 2개 이동/개명/색 · 히어로 재구성 · 인플레이션 행 이동 · 성장률별 참고 결과/절세계좌 현황 삭제 · 문구) · `js/05`(히어로 렌더 · 성장률 칩 템플릿 · totalScenarioData 포인트 필드 노출 · 삭제 UI 전용 렌더/리스너/상태 제거 · 라벨/문구) · `js/03`(삭제된 설명 id 배선 제거 · 주석) · `js/19`(MC 설명 팝업의 카드 이름) · `e2e/fixtures`(`goToPortfolioSettingsTab`) · `e2e/01 · 05 · 07 · 10 · 11 · 15 · 18 · 23 · 27 · 29 · 30 · 31 · 32 · 57 · 93`(진입 경로 · 명칭 · 삭제 UI 기대값) · `e2e/94`(신규 회귀). 버전 표기는 미커밋 v248 그대로(sw.js 무변경).

**36-4. REQ-09 합계 의미 — PM 최종 결정(A · READ-ONLY 비교 검토 후)** — 위 REQ-09 행의 "합계 = 공식 총자산(부동산 포함) · 라벨 '합계(부동산 포함)'" 구현을 다음으로 대체한다(위 행은 당시 기록으로 보존).
- "지금 계획대로면 · 20년 후 자산 참고값"의 **합계 = 일반계좌 + 절세계좌**. 근거: 세 칸(일반/절세/합계) 구조의 사용자 의미, §7 Tax MC 세 범위의 "일반계좌 + 절세계좌 통합" 정의와 같은 범위.
- **부동산 미래가치는 이 합계에서 제외**한다(부동산이 있어도 동일). "합계(부동산 포함)" 표현은 쓰지 않는다.
- 값은 `totalScenarioData`(normal) 20년 포인트에 이미 있는 원시값 `general + taxAdvantaged`를 더한 뒤 표시 형식(`fmtKRWShort`)만 적용한다 - 반올림된 표시 문자열을 다시 더하지 않는다.
- 기존 총자산 · 부동산 미래가치 계산 정의(`totalScenarioData`의 `realEstate` · `total`)는 **변경 · 삭제하지 않으며**, 부동산 값을 보여주는 새 표시 영역도 추가하지 않는다. 부동산 미래예측 범위는 RET-03-04에 따라 별도 정책 검토 대상으로 유지한다.
- **새로운 계산모델을 추가하지 않는다.** 회귀: `e2e/94` TEST-H(부동산 없음/있음 모두 합계 = 일반 + 절세, `totalScenarioData`의 일반 · 절세 · 부동산 · total이 독립 재계산값과 정확히 같음).
- 변경 파일: `js/05`(히어로 합계 표시 한 곳 · 조건부 라벨 제거) · `index.html`(해당 위치 주석 한 줄 - 구현과 어긋난 설명 정정) · `e2e/94` · 이 체크리스트.

**36-5. PM 최종 감사 후속 수정(F-01 · F-02 · F-05 · PM 승인)** — 정책 · 계산 · 데이터 구조 변경 없음.
- **F-01**: 목표비중 합계 오류(BLOCK)이면 `updateProjection()`이 조기 종료되어, v248-1에서 포트폴리오 설정 탭으로 옮긴 적립계획 카드 2개가 "미설정"/빈 카드로 보이던 회귀를 고쳤다. 저장값 표시 함수(`updateMonthlyContributionSummary` · `renderTaxAdvantagedCard`)만 BLOCK 판정 앞으로 옮겼고, BLOCK 판정 · 안내 배너 · 시나리오 미계산 · MC 차단은 그대로다(`e2e/94` F-01).
- **F-02**: 사용자 노출 옛 탭 이름 2곳 → "포트폴리오 설정"(js/21 목표 비중 합계 BLOCK 안내 · js/10 RISK 카드 버튼). 문구만 변경(`e2e/94` F-01 · `e2e/40` 10).
- **F-05**: 절세계좌 카드 · 적립설정 빈 계좌 안내의 오탈자 "절세계좈/계좈" → "절세계좌/계좌"(`e2e/94` F-05).
- 범위 밖 유지: F-03(일별 손익 vs 총 평가금액 정의) · F-04 · F-06 · F-07 · F-08 · O-01 · O-02는 변경하지 않았다.

## 37. 장기 MC CMA 체계 · CMA 자동 업데이트 · Correlation Benchmark (PM FINAL IMPLEMENTATION DIRECTIVE · 2026-09-16 · PM 승인)

> **이 절은 PM이 최종 승인한 정책 변경이다.** 아래 37-1의 과거 문구(§7 상관 · RET-02-08 · RET-03-06 · §13)와 충돌하면 이 절이 우선한다. 과거 문구는 GOV-04에 따라 삭제하지 않고 "→ §37로 대체" 표시만 붙였다.

**37-0. 승인 정책 (원문 요지)**

| ID | 확정 내용 |
|---|---|
| CMA-01 | 장기 MC의 Return / Volatility / Correlation은 장기 CMA 체계를 기반으로 한다 (Instrument → Asset Class → Long-term CMA → MC Adapter → 기존 MC Engine). MC Engine(js/15)은 가능한 한 유지한다 |
| CMA-02 | 기존 Return Key lineage(user override · Instrument Return Key Master · 자동 추천 · unresolved · legacy 호환)는 유지한다. Return Key 숫자(US_EQUITY 4.1/5.1/6.0 등)는 이번 작업에서 삭제 · 변경하지 않는다 |
| CMA-03 | 장기 MC 변동성에 개별 상품의 최근 가격이력에서 직접 계산한 값을 장기 CMA 변동성 대신 쓰지 않는다 |
| CMA-CORR-01 | 공식 CMA에 해당 Pair의 상관계수가 직접 있으면 그대로 쓴다 (`OFFICIAL_CMA_DIRECT`) |
| CMA-CORR-02 | 공식 CMA의 명시적 Asset Class Mapping으로 연결되면 Mapping 근거를 저장하고 쓴다 (`OFFICIAL_CMA_MAPPING`) |
| CMA-CORR-03 | 개별 종목의 최근 1년 등 단기 역사적 상관계수를 장기 CMA 상관계수 대체값으로 쓰지 않는다 |
| CMA-CORR-04 | Direct / Mapping이 없어도 MC를 중단하지 않고 Benchmark를 쓴다 |
| CMA-CORR-05 | Benchmark = 목적 · 투자기간 · Asset Class · 방법론이 가장 유사한 공식기관의 장기 CMA / SAA / MC 자료. 코드가 자동으로 고르지 않고 **명시적으로 등록된 Benchmark**만 쓴다 (`BENCHMARK_REFERENCE`) |
| CMA-CORR-06 ~ 08 | Benchmark는 공식 CMA 입력값과 별도 Dataset으로 관리하고, 원문 값을 그대로 저장한다. 임의 변형 · 기관 간 평균 · 혼합 · 보간 · 최근 시장 상관 대체 · 개발자 생성 숫자 · Benchmark 기관 자동 교체를 금지한다 |
| CMA-CORR-09 | 상관계수 출처 유형(`OFFICIAL_CMA_DIRECT` / `OFFICIAL_CMA_MAPPING` / `BENCHMARK_REFERENCE`)을 MC 결과 · 상세정보에서 확인할 수 있어야 한다 |
| CMA-SRC-01 | 숫자는 공식기관 원문(공식 webpage · PDF · Excel/Matrix · institutional data download)에서 확인된 것만 쓴다. 뉴스 · 블로그 · 검색 snippet · 2차 DB · 임의 계산값은 근거가 아니다. 원문을 확인하지 못한 수치는 `UNVERIFIED`로 두고 확정하지 않는다 |
| CMA-SRC-02 | 숫자를 세 종류로 구분한다: `OFFICIAL_DATA`(원문 CMA 수치) · `BENCHMARK_REFERENCE`(공식 자료이지만 직접 입력이 아닌 대체 참고값) · `SYNTHETIC_TEST_DATA`(구조 검증용 개발자 숫자). **SYNTHETIC_TEST_DATA는 실제 CMA Dataset에 절대 넣지 않는다** |
| CMA-SRC-03 | 기관 간 숫자 혼합으로 새 CMA를 만들지 않는다(예: A 기관 Return + B 기관 Volatility + C 기관 Correlation). 기관 Dataset은 독립적으로 관리한다 |
| CMA-VER-01 | CMA Dataset은 Version을 갖고, 새 Dataset이 생겨도 기존 Dataset을 보존한다. 상태: `DISCOVERED` · `VERIFIED` · `APPROVED` · `ACTIVE` · `SUPERSEDED` · `FAILED` |
| CMA-VER-02 | MC 결과에 `modelVersion` · `cmaDatasetVersion`을 연결하고, MC 입력 서명에 `cmaDatasetVersion`을 포함한다. 새 CMA가 ACTIVE가 되어도 과거 MC 결과를 소급 변경 · 자동 재계산하지 않는다 |
| CMA-AUTO-01 | **CMA 자동 업데이트를 이번 범위에 포함한다**(§13의 Out-of-Scope 해제). 실제 동작하는 Pipeline: Source Registry → Check → Fetch → Parse → Validate → Diff → New Dataset Version → REVIEW → PM Approval → ACTIVE |
| CMA-AUTO-02 | **자동 ACTIVE 금지.** 새 Dataset은 VERIFIED(검토 대기)로 남고, PM 승인(APPROVED) 뒤에만 ACTIVE가 된다. 새 Dataset이 ACTIVE가 되면 이전 ACTIVE는 삭제하지 않고 SUPERSEDED로 바꾼다 |
| CMA-AUTO-03 | 확인 주기: 연간 · 분기 CMA 모두 최소 월 1회. 변경이 없으면(UNCHANGED) 새 Dataset을 만들지 않는다. 가능하면 HTTP ETag / Last-Modified / 파일 hash로 변경을 감지한다. 매일 무조건 다운로드하는 구조를 만들지 않는다 |
| CMA-AUTO-04 | 다운로드 실패 · timeout · source unavailable · parse 실패 · 누락 값 · 잘못된 숫자/날짜/자산군 · mapping 실패 · 잘못된 상관행렬(차원 · 대칭 · 대각 1 · 범위 · finite · PSD) · 출처/버전 식별 실패 시 **기존 ACTIVE Dataset을 절대 바꾸지 않고** `UPDATE_FAILED` / `REVIEW_REQUIRED`를 기록한다. 빈 값 · 임의 값으로 보완하지 않는다 |
| CMA-AUTO-05 | 일시적 네트워크 실패는 짧게 1회만 재시도하고, 그래도 실패하면 다음 정기 확인으로 넘긴다(무한 재시도 금지) |
| CMA-AUTO-06 | 확인 이력(checkedAt · provider · source · result · previousVersion · detectedVersion · changedFields · errorCode · errorMessage · resultingStatus)을 Audit Log로 남긴다. 별도의 복잡한 감사 시스템은 만들지 않는다 |
| CMA-UI-01 | 초보자 화면은 복잡하게 만들지 않는다. 최소 표시: 장기 CMA 사용 여부 · CMA 기준일 · 출처 기관 · 상관계수 출처 유형 · Benchmark 사용 여부. Benchmark Pair는 Pair · 기관 · 자료 · 기준일 · 값을 확인할 수 있게 한다 |
| 유지 | monthly precision · 10,000회 기본 · seeded RNG · 연 1회 리밸런싱 · 적립 · 상관 충격 · GBM · 운용보수 · milestone · 일반/절세/통합 3-scope(같은 경로 결합, P50 합산 금지) · PSD 보정 · Cholesky · PMD-06(APR 월복리 의미) |
| 금지(범위 밖) | 새 Risk Score · Macro→Risk · FX stochastic · 새 Asset Class · Bond Domain 확장 · AI · 별도 서버/daemon · 기관 평균/혼합 · 임의 상관 · 자동 승인 · 과거 MC 소급 변경 · 대규모 UI 개편 · P50을 특정 값에 맞추는 보정 |

**37-1. 이 절로 대체된 과거 문구 (삭제하지 않고 보존)**

| 위치 | 과거 문구 | 현재 정책 |
|---|---|---|
| §7 기본 구조 | "correlation은 date-aligned daily returns + Pearson + PSD correction + Cholesky" · "missing observations <10 → corr 0 + Safety WARNING" | 장기 MC 상관계수는 CMA 체계(CMA-CORR-01~09). PSD 보정 · Cholesky는 유지. 날짜정렬 상관 함수(js/15)는 엔진 파일에 남지만 장기 MC 입력에 쓰지 않는다 |
| §8-1 RET-02-08 | "외부 source를 읽어 Return Key를 자동으로 바꾸는 기능을 만들지 않는다" | 유지된다 - CMA 자동 업데이트는 Return Key 값을 바꾸지 않고, 새 Dataset도 PM 승인 전에는 계산에 쓰이지 않는다(CMA-AUTO-02) |
| §8-4 RET-03-06 | "종목별 volatility만 별도 실측한다" | 장기 MC 변동성은 Asset Class의 CMA 변동성(CMA-03). 개별주식 system alpha 금지는 그대로 유지. 가격이력 변동성은 RISK 진단 등 다른 기능에서만 쓴다 |
| §13 Out-of-Scope | "CMA 자동 업데이트" | 이번 PM 승인으로 범위 포함(CMA-AUTO-01~06). "전문가용 CMA research platform"은 계속 범위 밖 |

**37-2. 구현 기록 (v249 · 2026-09-17)**

| 항목 | 구현 |
|---|---|
| 데이터 저장소 | `data/cma/registry.json`(공식 Source 6개 - Dataset 2 · 방법론 참고 4) · `data/cma/datasets/*.json`(Dataset, 저장 후 숫자 · 출처 변경 불가) · `data/cma/active.json`(ACTIVE 세트 · 이력) · `data/cma/audit-log.json` · `data/cma/app-asset-class-map.json`(앱 자산 성격 → 기관 자산군, 근거 포함) |
| Pipeline | `scripts/cma/`(cma-core 검증 · Diff · hash / cma-fetch 조건부 요청 · timeout · 1회 재시도 / parsers: J.P. Morgan CSV · AllianzGI PDF(`pdftotext -raw`) / cma-store / cma-pipeline) · CLI `scripts/cma-update.js check · status · approve · activate · build` · `npm run cma:check` · GitHub Actions `.github/workflows/cma-update-check.yml`(매달 3일, `data/cma`만 커밋, ACTIVE · 앱 파일이 바뀌면 중단) |
| 런타임 | `js/26-cma-data.js`(activate가 생성 · 연결 자산군만 · 원문 값 그대로) · `js/27-cma-runtime.js`(자산군 변동성 · 상관 출처 우선순위 Direct → Mapping → Benchmark, 없으면 오류) |
| MC 연결 | `js/16 buildMonteCarloInputFromState`: 가격 이력 조회 제거 → 항목별 앱 자산 성격(Return Key 성격, 사용자 키는 종목 성격) → CMA 변동성 · 상관. 엔진(js/15) 무변경. `js/18`: 결과에 `cmaDatasetVersion` · `inputModelVersion`(CMA-ASSET-CLASS-1) · 출처 정보 · 엔진 `modelVersion` 유지. `js/19`: 입력 서명에 세트 버전 · "장기 가정 출처" 요약/상세 표시 · 장기 가정 오류 시 자산 이름 표시. `js/21`: 변동성 · 상관 기간 안내 문구 |
| 초기 세트 | **CMA-2026.1** = PRIMARY `AGI-LTCMA-2026Q1-USD`(AllianzGI 2026 Q1, 기준일 2025-12-31, USD, 10년) + BENCHMARK `JPM-LTCMA-2026-KRW`(J.P. Morgan 2026 LTCMA 원화 행렬, 기준일 2025-09-30, 10~15년). 두 Dataset 모두 실제 공식 원문을 Pipeline으로 받아 검증했고, 승인 근거는 이 지시서(§2 SOURCE B/D · §11 · §13)로 기록했다 |
| 자동 발견 | 첫 실행에서 AllianzGI **2026 Q2**(기준일 2026-03-31, Korea 7.3% / 29.4% / DW 0.84)를 자동 발견 → `AGI-LTCMA-2026Q2-USD` **VERIFIED(검토 대기)** - 자동 ACTIVE 하지 않았다 |
| 테스트 | Unit: `test/cma-dataset-parser.test.js` 14 · `test/cma-pipeline.test.js` 12(CASE A~L) · `test/cma-runtime.test.js` 16 · 기존 기대값 변경 3건(아래 37-3) · E2E: `e2e/95-cma-long-term-mc.spec.js` 5 |

**37-3. Developer의 보수적 해석(원문 · 정책에 없는 부분 - PM 확인 대상, 37-4)**
- **R-1 수익률**: AllianzGI 원문은 "10-year Expected Return p.a."의 기하 · 산술 구분을 적지 않았다(2025Q4 · 2026Q1 · 2026Q2 확인). 엔진은 r을 기하(중앙값) APR로 쓰므로 해석에 따라 한국 주식 기대수익률이 크게 달라진다(σ 27.9%에서 약 ±3.9%p). 임의로 해석하지 않고 **MC 수익률은 기존 Return Key를 그대로 쓴다**(`returnDefinition: NOT_STATED_IN_SOURCE` → `returnUsableForMc: false`). 정의가 확인된 세트에서는 시스템 기본 수익률 항목만 CMA 수익률(`cmaGeometricToAppRate`)로 바꾸고 사용자 수익률은 그대로 두는 경로를 구현 · 테스트했다(M-4). 결과적으로 US_EQUITY 수익률(Vanguard)과 변동성(AllianzGI)이 다른 기관에서 온다 - 새 CMA Dataset을 만드는 혼합은 아니며 결과 화면에 출처를 따로 표시한다.
- **R-2 미국 주식**: AllianzGI에 미국 단독 자산군이 없어 `North America Equities`(MSCI North America, 캐나다 포함)에 연결했다. `Developed World Equities`는 미국 주식으로 쓰지 않았다.
- **R-3 미국 외 선진국(DEV_EX_US)**: AllianzGI에 해당 자산군이 없어 연결하지 않았다 → 이 성격의 위험자산(수익률 가정 있음)이 목표에 있으면 MC를 실행하지 않고 자산 이름과 함께 안내한다.
- **R-4 채권 · 현금 티커 상품**: 가격 이력 변동성을 더 쓸 수 없어 기존 §7 정책(채권 · 현금 σ=0)을 티커 상품에도 적용했다(Bond Domain은 BACKLOG 유지).
- **R-5 수익률 가정 없는 자산(0% + 경고, PMD-08)**: RET-03-00("가정을 적용하지 않고 원금 그대로")에 맞춰 변동성 가정도 적용하지 않는다(σ=0) - MC는 경고와 함께 계속 실행된다. 이전에는 지수 · 가격 변동성을 받았다. 기존 테스트 3건의 기대값을 이 정책에 맞게 바꿨다(`test/mc-adapter-account-scope` 8-b → 8-b/8-c, `test/return-rate-integration` B-1 σ, `runSigma0`가 σ=0을 명시).
- **R-6 사용자 키 개별주**: 위험 자산군 판정에 "확정 자산군 '주식' + 상장 지역"도 인정한다(수익률 자동 추천에는 쓰지 않음).
- **R-7 같은 자산군 종목**: 같은 CMA 자산군은 같은 변동성 · 상관 1(자산군 단위 모델) - 종목 수를 늘려도 분산 효과가 생기지 않는다.
- **R-8 통화 기준**: PRIMARY는 USD 기준(AllianzGI - 한국 주식 변동성에 원/달러 변동이 포함된 달러 기준 값), Benchmark 상관은 원화 기준(J.P. Morgan KRW 행렬). 한국 주식이 들어 있는 J.P. Morgan 공식 행렬은 원화 행렬뿐이다. 환율 모델은 추가하지 않았다(FX stochastic 금지).
- **R-9 엔진 진단 문자열**: js/15 결과의 `diagnostics.correlationMethod`는 여전히 'date-aligned'로 찍힌다(엔진 무변경 원칙). 실제 입력 방식은 결과의 `inputModelVersion` · `cma`로 확인한다.

**37-4. PM 최종 확인 필요 (구현은 보수적 기본값으로 완료)**
1. 초기 세트 CMA-2026.1의 ACTIVE 승인(이 지시서를 승인 근거로 기록함) 확인.
2. AllianzGI 2026 Q2(VERIFIED) 승인 · 활성화 여부 - 활성화하면 CMA-2026.2가 되고 기존 결과는 "다시 계산 필요"로 표시된다.
3. R-1 수익률 정의(기관 문의 · 기하로 간주 · Return Key 유지 중 선택).
4. R-3 DEV_EX_US 처리(현재 실행 차단) · R-4/R-5 σ=0 처리 · R-8 통화 기준 차이 수용 여부.
5. 자동 확인 워크플로가 main에 `data/cma` 변경을 매달 커밋한다(종목 마스터 워크플로와 같은 방식) - push 시 Pages 배포가 함께 일어나는지 확인.

**37-5. 장기 MC 수익률 정책 고정 (PM 확정 · 2026-09-17)** - 37-3 R-1의 보수적 해석을 정책으로 확정한다(37-4 3번 해소).

| ID | 확정 내용 |
|---|---|
| CMA-RET-01 | CMA Expected Return은 현재 Monte Carlo의 직접 입력값으로 **사용하지 않는다** |
| CMA-RET-02 | MC 수익률(μ)은 **기존 Return Key**(user override · Instrument Master · 자동 추천 · unresolved · legacy)를 그대로 쓴다 - 결정론과 같은 해석 경로 |
| CMA-RET-03 | CMA **Volatility는 사용**한다(Asset Class 변동성) |
| CMA-RET-04 | CMA **Correlation은 사용**한다(Direct → Mapping → Benchmark) |
| CMA-RET-05 | 향후 CMA Return 적용은 **별도 PM 정책 결정 없이는 변경하지 않는다** - Dataset의 수익률 정의가 확인되거나(returnUsableForMc) 새 세트가 ACTIVE가 되어도 자동으로 바뀌지 않는다 |

- 구현: `js/27` `MC_CMA_RETURN_POLICY`(useCmaExpectedReturn false · useCmaVolatility true · useCmaCorrelation true · returnSource RETURN_KEY, 동결 객체) · `js/16` CMA 수익률 분기는 이 정책 값이 true일 때만 동작 · `js/19` 요약 문구 "수익률: 기존 수익률 기준을 그대로 씁니다(장기 CMA에서는 변동성 · 상관계수만 사용합니다)".
- 테스트: `test/cma-runtime` M-4(정의가 확인된 세트여도 Return Key 유지) · M-6(정책 상수) · `e2e/95` A(요약 문구).
- CMA Dataset에 저장된 기대수익률 값은 원문 기록 · 비교 목적으로 그대로 보존한다(삭제하지 않음).

**37-6. v249 PM 최종 정책 고정 (PM FINALIZATION · 2026-09-17)** - 개발이 아니라 정책 · 문서 확정이다(코드 · 모델 변경 없음).

| 항목 | 확정 |
|---|---|
| ACTIVE 세트 | **CMA-2026.1 ACTIVE 유지** (PRIMARY `AGI-LTCMA-2026Q1-USD` + BENCHMARK `JPM-LTCMA-2026-KRW`) - 37-4 1번 해소 |
| AllianzGI 2026 Q2 | **VERIFIED 유지** - 자동 ACTIVE 금지 · 활성화하지 않는다. 동일 조건 비교(READ-ONLY): Det 변화 0% · P50 +0.0~+1.8% · 분포 폭 확대(단일 국내주식 P90 +8.5% · 평균 +7.9% · P10 −5.7%, 한국 변동성 27.9→29.4%) - 37-4 2번 해소 |
| Return | §37-5 CMA-RET-01~05 최종 확정 - CMA Expected Return은 MC 직접 입력 아님 · 기존 Return Key 유지 · CMA Volatility 사용 · CMA Correlation 사용 · 향후 CMA Return 적용은 별도 PM 승인 없이 변경 금지(`js/27 MC_CMA_RETURN_POLICY`) - 37-4 3번 해소 |
| J.P. Morgan 2026 KRW Matrix | 공식 Source 검증 완료(공식 interactive matrix 데이터 파일, 재수집 SHA-256 `b59143b645ac4538b52193043f93b1fc559691d2997477d5ccb9e571b81f96de` = 저장값) · 62×62 · 자산군 순서 동일 · Korea-US **0.4124456921608721**(CSV 29행 33열) · Korea-EM **0.6772476909891292**(42행 33열) · US-EM **0.5007268458463904**(42행 34열). **Benchmark Reference 정책 유지** |
| DEV_EX_US | **현재 해결하지 않는다 · 별도 PM 정책 검토 대상**(AllianzGI에 해당 자산군 없음). σ=0 등 임의 fallback을 두지 않는다 - 현행대로 이 성격의 위험자산(수익률 가정 있음)이 목표에 있으면 MC를 실행하지 않고 자산 이름과 함께 안내한다(`test/cma-runtime` M-2 · `e2e/95` D) - 37-4 4번 중 R-3 |
| CMA 자동 업데이트 | 현재 구현 유지 - Fetch → Parse → Validate → Diff → Version → Review · 자동 ACTIVE 금지 · 실패 시 기존 ACTIVE 유지 |
| 추가 구현 금지 | 새 CMA provider · Return 모델 변경 · DEV_EX_US 해결 · UI 확장 · MC Engine 변경 · Benchmark 변경 |

- 남은 PM 검토(구현 금지 상태로 기록만): DEV_EX_US 정책 · R-4/R-5(채권 · 현금 티커와 가정 없는 자산 σ=0, 기존 §7 · RET-03-00 적용) · R-8(PRIMARY USD vs Benchmark KRW 기준 차이) · push 시 Pages 배포와 월간 자동 확인 워크플로 활성화(37-4 5번).

## 38. Monte Carlo 결과 화면 정리 (v250 · PM 작업 승인 · UI/IA/문구 한정)

> **보이는 구조만 바꿨다. 계산은 바꾸지 않았다.** MC 엔진(js/15) · 어댑터(js/16) · Worker/Controller(js/17 · 18) · 인플레이션(js/20) · Safety 판정(js/21) · CMA 데이터/정책(§37) · Return Key · 목표 도달 가능성 계산 · 계좌/소유자 범위 계산 · state schema 무변경. 같은 합성 시드 · 같은 seed로 변경 전후 결과(가구 전체 · 신랑 · 와이프 × 일반/절세/통합 × 5/10/15/20년 P10~P90 · 평균 · 현재가치 · 목표 확률)가 **완전히 같음**을 확인했다.

| ID | 확정 내용 |
|---|---|
| UX-1 소유자 순서 | `#mcOwnerScopeSegmented` 표시 순서 **가구 전체 · 신랑 · 와이프**. data-scope · 기본값(가구 전체) · `mcOwnerScope` 의미 · 스타일 · aria-pressed 무변경 |
| UX-2 계좌 범위 순서 | `#mcScopeSegmented` 표시 순서 **통합 · 일반계좌 · 절세계좌**. data-scope(combined/general/taxAdvantaged) · 기본 선택 규칙(MCD-2: 절세계좌 결과가 있으면 통합, 없으면 일반계좌) 무변경 |
| UX-3 범위 막대 삭제 | "선택한 기간의 범위를 막대로 보기" 전체(토글 · 명목/현재가치 막대)와 전용 상태 · 렌더(`mcRangeBarsOpen` · `renderBarsInto` · 토글 핸들러) 삭제. milestone 데이터 · percentile · `mcScopedMilestones` · 분포표 유지. 대체 시각화 없음 |
| UX-4 목표 도달 가능성 위치 | 참고금액 카드 바로 아래로 이동(`#mcGoalBox`). "보조 정보 · 목표 도달 가능성" 라벨과 확률 아래 짧은 부연 설명("현재 설정을 기준으로 한 시뮬레이션 결과예요 …") 삭제. 목표금액 · 확률 · 기간 차이 안내 · 꼬리 확률 정밀도 안내(Phase 4)는 그대로. 확률의 의미 설명은 상단 ⓘ 팝업의 항상-on 안내에 그대로 있다 |
| UX-5 참고금액 | P25 라벨 = **"시뮬레이션 결과 N년 기준 보수적으로 볼 때의 참고금액"**(N = 선택 기간, 기본 20). 카드 아래 장문 해설(P50/P25 위치 · 확률 아님 · 명목/현재가치 설명) 삭제 - **MCD-3의 "카드 안에서 설명한다" 문구를 이 결정으로 대체**(P50 · P25 값 · 현재가치 표시는 그대로) |
| UX-6 표 명칭 | **초약세 P10 · 약세 P25 · 보통 P50 · 강세 P75**. 계산 · 순서 무변경. P90은 MCD-4대로 화면에 표시하지 않는다(데이터에는 유지) - 38-1 참고 |
| UX-7 표 아래 문구 | 장문 해설 삭제, **"각 칸의 아래쪽 회색 숫자는 현재가치 기준 금액"** 한 줄만 |
| UX-8 장기 가정 출처 | 기본 접힘 드롭다운(`#mcCmaSourceToggleBtn` → 요약: 기관 · 기준일 · 기간 · 통화 · 세트 · 상관 출처 유형 · 수익률 정책) + 옆 ⓘ(`#mcCmaInfoBtn` → 기존 `mcInfoModal`에 자산군 변동성 · 상관계수 · 출처 상세). 내용 · 수치 · 메타데이터는 v249와 동일(§37 CMA-UI-01 충족 방식만 변경). 위치는 분포표 한 줄 안내 다음 · 기술 정보 앞 |
| UX-9 주의사항 · 계산 방법 | 결과 아래 "주의사항 및 계산 방법 자세히 보기" 토글 삭제. 같은 카드(참고성 WARNING + 항상-on INFO)는 상단 **"실제 미래는 여러 경로로 달라질 수 있습니다 ⓘ"** 팝업 끝 "주의사항 및 계산 방법"에 표시(마지막 실행 기준, 실행 전에는 기존 설명만). 판정 · 분류(`classifyMcSafetyTier`) · 문구 · critical 표시(`#mcSafetyCritical`, 결과 영역) 무변경 |

**38-1. 기존 정책과의 관계 (당시 보수적 해석 - PM 결정은 38-3)**
- **P90 열(UX-6)**: 지시서는 표를 "P10~P90 5개"로 전제하고 "높은 편 P90"을 남기라고 했으나, 실제 화면은 MCD-4(§31, PM 승인)에 따라 이미 P90 열이 없다(4열). 새 열을 추가하면 MCD-4를 뒤집게 되므로 **P90 비표시를 유지**했다(데이터 · 엔진 · Safety에는 그대로). P90 열 복원 여부는 PM 결정 대상.
- **"일반계좌~ 0.05%" 문구(UX-4)**: 목표 박스 아래에 있던 기술 정보 블록(일반계좌 월 적립금 · 총 납입원금 · 목표비중 기준 안내 · 인플레이션율 · "예상 연간 운용보수(일반계좌 목표비중 가중평균): 0.05%")로 보인다. 이 블록은 MCD-5(§31)와 P5 고지(Phase 9)가 요구하는 문구이고 지시서 10항 ⑫도 "기존 기술 정보" 유지로 적었으므로 **삭제하지 않고 기술 정보 위치(장기 가정 출처 다음)에 그대로 두었다**. 목표 박스를 옮겨 더 이상 목표 박스 아래에 붙어 보이지 않는다. 블록 자체 삭제 여부는 PM 결정 대상.

**38-3. PM 수정 지시 (v250 최종 UI 승인 전 보완 · 2026-09-17)**
- **P90**: 4열(P10/P25/P50/P75) 표시 유지 · 화면에 추가하지 않음 · 내부 데이터/계산 유지 - **MCD-4 유지 확정**(38-1 첫 항목 해소).
- **목표 도달 가능성 아래 설명 블록 삭제**(PM 첨부 화면의 붉은 테두리 영역): 확률 아래 부연 설명("현재 설정을 기준으로 한 시뮬레이션 결과예요. …" - UX-4에서 이미 삭제)과 **기술 정보 블록 전체** - `#mcContributionScheduleArea`("일반계좌 월 적립금 …(매월 동일) · 총 납입원금(N년) …" / 증가율이 있으면 "일반계좌 초기 월 적립금 … · 연간 증가율 …% · N년차 월 적립금 약 …" + "일반계좌 총 납입원금(N년) …", 그리고 "참고: 일반계좌 적립금은 {가구 전체|○○님의} 목표비중을 기준으로 계산합니다.") · `#mcInflationNote`("인플레이션율: N%") · `#mcWeightedFeeNote`("예상 연간 운용보수(일반계좌 목표비중 가중평균): N%"). 다른 위치로 옮기거나 다른 문구로 다시 쓰지 않았다(38-1 두 번째 항목 해소). **MCD-5의 가중평균 보수 · 적립금 안내 문구와 Phase 9 P5 고지는 이 결정으로 대체**한다.
- 값 · 계산은 그대로다: 적립금 · 증가율 · 적립 기간은 그대로 엔진 입력(`startMonteCarloRun`)으로 넘어가고, 총 납입원금 함수(`computeTotalContributionPrincipal*`, js/15)도 그대로다. 인플레이션율은 MC 카드 상단 입력 행 · 현재가치 라벨("현재가치 기준(물가상승률 N% 가정)")에, 운용보수는 [운용보수(연간) 설정] 팝업에, 적립금 · 적립 기간은 [적립금 설정] 팝업에 그대로 표시된다. 표시 전용이던 가중평균 보수 계산(js/19)만 함께 정리했다(엔진 입력과 무관).
- 결과 하단 ※ 문구(일반계좌 = 목표 비중 · 절세계좌 = 보유 + 적립설정 배분 · CMA 변동성/상관 · 운용보수 반영 · 수수료/세금/환전비용 미반영)는 PM 표시 범위(붉은 테두리) 밖이라 유지한다.
- 숫자 회귀: 수정 전 v250 · v249 기준과 결과 JSON 완전 동일(가구 전체 · 신랑 · 와이프 × 일반/절세/통합 × 5/10/15/20년 P10~P90 · 평균 · 현재가치 · 목표 확률).
- 테스트: `e2e/96` C(블록 요소 · 문구 부재, 목표 박스 다음 = 주요 주의사항) · `e2e/14`(총 납입원금은 계산값 비교 유지 + 화면 줄 부재) · `e2e/18` P5(고지 블록 부재 + P50 값 일치 유지) · `e2e/19`(블록 부재) · `e2e/29`(소유자별 월 적립금 · 관점을 실제 실행 입력으로 확인: 가구 50만 · 신랑 30만 · 와이프 20만) · `e2e/90` W-1(블록 부재 · ※ 문구 유지).

**38-2. 변경 파일** — `index.html`(버튼 순서 · 참고금액 라벨 · 카드/표 장문 해설 삭제 · 목표 박스 이동 · 표 명칭 · 한 줄 안내 · 범위 막대/상세 토글 삭제 · 출처 드롭다운 + ⓘ · v250) · `js/19`(범위 막대 코드 삭제 · 참고금액 라벨 기간 연동 · 목표 부연 설명 삭제 · 출처 드롭다운/ⓘ · 주의사항 보관 요소 + 상단 ⓘ 팝업 연결) · `js/22`(상세 토글 전용 상태/리스너 삭제) · `sw.js` v250 · 테스트: 신규 `e2e/96-mc-result-layout-v250.spec.js`(8) · 셀렉터/위치 갱신 `e2e/07 · 11 · 32 · 64 · 73 · 90 · 95`(검증 의미 유지: 안내 카드는 상단 팝업에서, 삭제 요소는 부재 확인, P90 비표시 · 값 일치 · 14px/44px/무넘침 그대로).

## 39. Macro/Risk 표시 용어 기준 (v251 · PM 승인 · 표시 문구 한정)

> **금융 지표의 계산 정의와 화면 설명은 일치해야 하며, 초보자에게 설명할 때에도 금융 개념을 왜곡하지 않는다.**
> 이 기준은 화면에 보이는 이름 · 설명에만 적용된다. 계산식 · 판정 조건 · Risk Score 가중치 · Macro 규칙과 임계값은 이 절로 바뀌지 않는다.

| 개념 | 화면 표시 기준 |
|---|---|
| 변동성 | **변동성(연환산)** |
| Beta | **시장 민감도(베타)** — 변동성과 같은 뜻으로 쓰지 않는다 |
| Correlation | **보유 종목 간 동조성(상관)** |
| MDD | **최대낙폭(MDD, 최근 1년)** |
| 52주 | **52주 고점 대비 현재 하락률** — MDD와 다른 값임을 구분한다 |
| VaR | **하루 하락 기준선(VaR 95%)** — "최대 손실"로 표현하지 않는다 |
| CVaR | **하락이 컸던 날 평균(CVaR 95%)** — 특정 위기 상황의 손실로 표현하지 않는다 |
| Stress | **과거 하락장 가정 손실(추정)** — "재현"으로 표현하지 않는다 |
| Sortino | **하락 변동 대비 수익(소르티노)** — A~F 참고 구간은 유지, 하락 방어 능력으로 단정하지 않는다 |
| RSI | **단기 과열 지표(RSI 14일)** — 상태: 과열권 · 중립 · 과매도권 |
| 거래량 기반 추정 | **거래량 신호(추정)** — 거래량 늘며 하락 · 거래량 늘며 상승 · 거래 한산 · 특이 신호 없음 |
| VIX | 타일 **VIX(변동성)** / 지표 정보 **VIX (변동성 지수)** — "공포·탐욕 지수"로 부르지 않는다(별칭 "공포지수" 언급은 허용) |

**39-1. 기존 정책과의 연결**
- 행동 지시 금지(Phase 35, `e2e/39`): 행동을 권하거나 예측하는 제목 · 표현(행동 제안 · 권장 행동 · 원클릭 · 쉬어가기 · 지켜볼 만한 · 단기 벽/버팀목 · 대응 팁 등)을 쓰지 않는다.
- 과장 표현 금지: 속어 · 과장(몰빵 · 널뛰기 · 주범 · 금융위기급 · 초직관적 등)을 쓰지 않는다.
- 수급 추정치(Phase 39): 거래량 기반 추정 신호를 실제 매수 · 매도 주체 데이터처럼 표현하지 않는다. KIS 실제 수급은 **외국인·기관 5일 순매수**로 따로 표시한다.
- Macro/Risk 분리(§4 · §10): 매크로 설명은 하루 등락을 "국면"으로 단정하지 않고 관찰과 경향으로 서술한다. Macro→Risk 정량 연결 금지는 그대로다.

**39-2. 검증** — `test/risk-terminology.test.js`(8) · `e2e/97-risk-macro-terminology.spec.js`(4, 렌더된 카드 · 모달 · 팝업 · 툴팁의 금지 표현 부재와 기준 명칭 표시). 변경 전후 계산 · 판정 스냅샷 동일(위험점수 · 하위 점수 · 베타 · 상관 · MDD · VaR · CVaR · Sortino · Stress · 위험 기여도 · RSI · 거래량 신호 · 감지 태그 · What-If · Macro 규칙 선택).

**39-3. 보류(이번 절로 결정하지 않음)** — T4(진단 · 점검 항목 표시 로직 중복) · F-7(위험 기여도 음수 0 처리) · C-15(Macro 규칙 민감도) · D-6(상관관계 가이드 중복) · S-40(What-If 프리셋 이름 · 15%) · 375px VIX 타일 라벨 잘림(OBS-v237-2 계열) · 화면에 노출되지 않는 HTML 주석의 옛 용어.

## 40. Risk 계산 정책 — 공통 거래일 · 최소 관측 · 벤치마크 확인 (v252 · PM 최종 반영 지시 · 로컬 커밋 · push/배포 안 함)

> **포트폴리오 위험은 모든 보유 종목의 가격이 함께 있는 거래일로만 계산하고, 그 표본이 부족하거나 기준 지수를 확인할 수 없으면 값을 만들어 내지 않는다.**
> 대상: 종합 위험점수(Risk Score) 계산 경로(js/09 `computeAdvancedRiskMetrics` · `computeScenarioRiskMetrics`)와 그 표시(js/10). Risk Score 구조(§ Phase 39-B)와 Macro · MC · Return Key · CMA는 이 절로 바뀌지 않는다.

| ID | 정책 | 구현 |
|---|---|---|
| **P-1** 날짜 정렬 | 포트폴리오 일간 수익률은 위험 대상 보유 종목 **전체의 날짜별 종가 교집합** D로 만든다. r_i(k) = close_i(D[k]) / close_i(D[k−1]) − 1, 포트폴리오 = Σ w_i · r_i. 끝에서부터 같은 순번끼리 맞추는 방식 폐지. 0% 채움 · 직전값 채움 · 보간 · 종목 제외 · 비중 재정규화 없음 | `buildCommonDateReturns` · `buildPortfolioCommonReturns`. 상관 행렬 · 상위 2종목 상관 · 위험 기여도 · What-If도 같은 공통 거래일 수익률(`commonReturns`)을 쓴다. 날짜가 없는 시계열은 위치로 맞추지 않는다(베타 null · 공통 거래일 0) |
| **P-2** 최소 표본 | 공통 거래일 수익률 **120개 이상**일 때만 계산. 미만이면 `dataSufficiency.status = 'INSUFFICIENT'` — 위험점수 · 등급 · 하위 점수 · 진단 · 신뢰도 · 변동성/MDD/VaR/CVaR/Sortino/베타/상관/스트레스 모두 null(50점 대체 없음). 종목 단위 최소 관측 `MIN_RETURNS_FOR_STATS = 10`은 유지 | `MIN_COMMON_RISK_RETURNS = 120`. 경계: 수익률 119개 → INSUFFICIENT · 120개 → SUFFICIENT. 비중 · 집중도 · 섹터 정보와 종목 단위 필드는 남긴다 |
| **P-2 Beta** | 종목↔벤치마크 공통 수익률 120개 미만이면 종목 베타 null(기존 10개 경로 삭제). 베타가 없는 종목을 빼거나 비중을 다시 나누지 않는다 — 포트폴리오 베타는 모든 종목에 베타가 있을 때만 계산 | 시장위험 요인은 기존 결측 처리(50) 그대로 |
| **P-3** 거래량 | 거래량 결측 → null, 실제 0 → 0. 거래량 이동평균은 null을 빼고 계산. 새 신뢰도 감점 없음 | `parseYahooDailySeries` · `computeVolumeMA`. 마지막 거래량이 없으면 거래량 급증 · 거래량 신호를 만들지 않는다 |
| **P-4** 벤치마크 | 앱 정보로 **실제 추종 지수 또는 상장 시장 지수**가 확인될 때만 정한다. 나머지는 UNRESOLVED(null). 티커 접미사 · ETF라는 사실 · 섹터 유사성 · 예전 근사 집합만으로는 정하지 않는다. Return Key는 근거가 아니다 | `resolveRiskBenchmark`: ① ETF 구성표 라벨이 앱 지수와 정확히 같을 때(나스닥100 → NASDAQ100, S&P500 → SP500) ② 개별 주식(분류 '주식')은 종목 마스터의 상장 거래소 종합지수(KOSPI · KOSDAQ · NASDAQ 종합). NYSE · AMEX · 마스터에 없는 종목 · 이름이 ETF/ETN/채권/현금 성격인 종목 → UNRESOLVED. **[1차 통합 구현 갱신 · 2026-09-19 → §44 44-16]** 결정 순서가 ⓪ Exposure Master(원장 등록 종목은 원장 판정으로 종료) → ① ETF 구성표 라벨(동결) → ② 국내 상장 개별주만 상장 시장 지수(KOSPI · KOSDAQ)로 바뀌었다. 원장에 없는 미국 상장 주식은 NASDAQ 상장이어도 거래소 지수로 보내지 않는다(D-06 · `listingDomicileUnconfirmed`). **[2차 통합 보완 · PM 결정 ③]** 원장에 등록된 해외 개별주도 본국 보통주 근거(`equityListing: HOME_COMMON` · 근거 등급 A)가 없으면 UNRESOLVED다(거래소 상장 근거만으로 추정하지 않음). 정해진 지수의 가격 원천이 없으면 Benchmark는 RESOLVED로 두고 원천만 UNAVAILABLE(`priceSource`)로 표시하며 베타는 null이다 |
| **P-5** 채권 ETF | 채권 모델을 만들지 않는다. 벤치마크가 확인되지 않으면 베타 null, 벤치마크 기반 스트레스 null. 주식 대체 낙폭을 쓰지 않는다 | 스트레스 손실은 모든 종목에 벤치마크와 베타가 있을 때만 계산(가정 베타 1.0 삭제). ~~확인된 지수가 낙폭 표에 없으면 기존 대체 낙폭 유지(기존 스트레스 계산).~~ **[정정 2026-09-19 · 실제 구현과 일치]** 대체 낙폭(−34% / −28%)은 v259(Phase 2-4 T4)에서 삭제됐다 - 확인된 지수가 낙폭 표에 없으면(예: 나스닥 종합) 그 시나리오는 만들지 않는다(null · `SOURCE_UNAVAILABLE`). 대체 낙폭을 되살리지 않으며 새 역사적 낙폭 산출체계도 만들지 않는다(1차 통합 구현 PM 결정). 원화 환산 지수에 대한 베타(D-05)가 있는 포트폴리오도 같은 사유로 null이다. 화면: "계산할 수 없음 (기준 지수나 시장 민감도를 확인할 수 없는 종목 포함)" |
| **P-6** 섹터 | 변경 없음(섹터 매핑 확대 없음) | — |
| **P-7** 환율 | 위험 계산에 환율 요인을 넣지 않는다 | — |
| **P-8** 점수 구조 | 가중치 25/20/20/15/10/10 · 구간 임계값 · 결측 요인 50 · 등급 40/60 · 극단위험 가산 · 신뢰도 · 진단/점검 임계값 무변경 | — |
| **P-9** 위험 알림 팝업 | 연결하지 않고 삭제하지도 않는다(현 상태 유지) | `openRiskAlertModal` · `maybeShowRiskAlertPopup` 무변경 |

**40-1. 화면**
- 요약 카드 · 세부 모달(데이터 부족일 때): 제목 **"종합 위험점수 계산 불가 (데이터 부족)"**, 본문 **"보유 주식·ETF의 가격 기록이 함께 있는 거래일이 {n}일이라, 계산에 필요한 120일보다 적습니다. 최근 상장했거나 가격 기록을 받지 못한 종목이 있으면 이렇게 표시됩니다."** 점수 · 등급 · 진단 · 세부내용/계획 확인 버튼 없음.
- What-If: 데이터 부족이면 계산하지 않는다(`computeScenarioRiskMetrics` → null, 프리셋 클릭 무시).
- 분기 조건은 `dataSufficiency.status === 'INSUFFICIENT'`일 때만 — 이 필드가 없는 예전 형태 결과는 정상으로 그린다.
- 종목 베타 ⓘ 설명에 기준 지수 확인 조건과 120일 기준을 추가.

**40-2. 검증** — `test/risk-engine.test.js`(날짜 없는 fixture에 같은 날짜 부여 → Golden 값 동일 · P-1 서로 다른 시장 달력(교집합 · 수동 계산 일치 · 예전 인덱스 방식과 다름 · 0% 채움 없음) · 공통 거래일 기반 상관/기여도 · P-2 119/120 경계 · 짧은 종목 제외/재정규화 없음 · 베타 119/120 경계 · P-3 파싱/이동평균/마지막 결측 · P-4 벤치마크 결정표 · P-4/P-5 채권 ETF · What-If 동일 비중 = 기준 · 데이터 부족 → null) · `test/risk-rules.test.js`(fixture 날짜 부여) · `test/risk-sandbox.js`(종목 마스터 주입 · 날짜 부여 도우미) · 신규 `e2e/98-risk-data-sufficiency.spec.js`(요약 카드 · 세부 모달 · What-If 차단 · 예전 형태 결과 정상 · 스트레스 계산 불가 문구 · 375/1440 × Light/Dark 14px 이상 · 넘침 없음) · `e2e/97` 금지 표현 검사에 데이터 부족 · 스트레스 계산 불가 화면 추가.

**40-3. 남은 위험(이번 절로 해결하지 않음)**
- 브랜드 키워드가 없는 국내 ETF가 분류 '주식'으로 저장돼 있으면 상장 시장 지수(KOSPI)를 받는다(분류 확정 정책 BL-17 영역).
- NYSE · AMEX 상장 미국 주식은 앱에 해당 종합지수가 없어 베타 · 스트레스가 null이다.
- ~~나스닥 종합(NASDAQ)은 스트레스 낙폭 표에 없어 기존 대체 낙폭(−34% / −28%)을 쓴다.~~ **[정정 2026-09-19]** v259에서 대체 낙폭을 삭제했다 - 나스닥 종합이 벤치마크인 종목이 있으면 스트레스는 null(`SOURCE_UNAVAILABLE`)이다(스트레스는 화면 미표시 · 점수 미반영 · UI-253-1).
- 종목 마스터 캐시가 없는 첫 실행에서는 개별 주식 벤치마크가 다음 갱신까지 UNRESOLVED다.
- 기존 사용자는 보유 종목 중 하나라도 이력이 120 거래일 미만이면 종합 위험점수 대신 데이터 부족 안내를 본다(의도된 동작).

## 41. UI 정리 — Risk 세부 모달 · 매크로 접기 이름 · 목표 비중 드롭다운 · 적립계획 버튼 (v253 · PM 지시 · 표시만)

> 화면 표시와 UX 동작만 정리한다. Risk 계산 · Risk Score · P-1~P-9(§40) · Macro · MC · Return Key · CMA · 저장 구조는 바뀌지 않는다.

| ID | 결정 | 구현 |
|---|---|---|
| **UI-253-1** | Risk 세부 모달(RISK 상세 분석 & 시뮬레이션)에서 **과거 하락장 가정 손실 2건(2020년 초 급락 · 2022년 금리 인상기)과 위험관리 시뮬레이션(What-If)** 을 보이지 않게 한다. 빈 자리를 남기지 않는다. 나머지 지표는 유지 | js/10 `RISK_DETAIL_SHOW_STRESS_AND_WHATIF = false` - 두 블록을 렌더링하지 않는다. `computeStressScenario` · `computeScenarioRiskMetrics` · 프리셋 클릭 처리 · `stressLossValueText`는 그대로 남긴다(값을 true로 바꾸면 다시 표시) |
| **UI-253-2** | 시장 현황 & 매크로 브리핑의 접기 버튼 이름 **「📌 세부 내용 보기」 → 「📄 상세 현황 보기」** (아이콘은 기존과 같은 이모지 체계) | index.html `#macroDiagnosisToggleBtn` 문구만 변경. 펼침/접힘(`macroDiagnosisOpen`) 무변경 |
| **UI-253-3** | 신랑/와이프 목표 비중 드롭다운은 **각자의 열림 상태만 바꾼다**(하나를 열면 다른 하나를 닫는 방식도 쓰지 않는다) | 확인 결과 js/04 `positionAnalysisAccordionOpen['신랑' / '와이프']`가 이미 별도 상태이며 클릭은 자기 값만 바꾼다(375 · 1440에서 재현 안 됨). 코드 변경 없이 `e2e/99` C로 4가지 상태를 고정. 참고: 항상 펼쳐진 「전체 포지션별 목표비중 분석」 카드가 와이프 제목 바로 아래에 있어 와이프 드롭다운이 열린 것처럼 보일 수 있다(표시 구조 - 이번 범위 밖) |
| **UI-253-4** | 일반계좌 적립계획 버튼 **「적립금 설정」 → 「적립설정」** (절세계좌 적립계획 버튼과 같은 이름) | index.html `#openMonthlyContributionAllocationBtn` 문구만 변경. 팝업 제목 · 기능 · 위치 · 크기 무변경 |

**41-1. 검증** — 신규 `e2e/99-ui-cleanup-v253.spec.js`(A 세부 모달 미표시 · 빈 자리 없음 · 유지 지표 / B 명칭 · 펼침/접힘 / C 드롭다운 4상태 / D 버튼 이름 · 팝업 열림 / E 375 · 1440 × Light · Dark 14px · 잘림 · 넘침). 기대값 갱신: `e2e/80` G(접기 버튼 이름) · `e2e/97` 3(세부 모달에서 사라진 스트레스 제목 대신 표시 문구 함수 확인) · `e2e/98` 3 · 5(What-If 클릭 처리 · 스트레스 문구를 모달 밖에서 확인, 모달에는 없음).

**41-2. v253 누락분 (v254 · PM 지시)** — v253 지시 스크린샷 2의 붉은 영역(메인 Risk 카드 하단 계획 확인 안내)이 v253에서 처리되지 않았다(v253은 매크로 버튼 이름만 반영). v254에서 js/10 `RISK_SUMMARY_SHOW_PLAN_CHECK_NOTE = false`로 그 안내(📋 문장 + 「포트폴리오 설정에서 보기」 버튼)만 그리지 않는다. 점수 · 데이터 상태 · 세부내용 버튼 · 진단 문장 · 확인 항목 · 리스크 감지 · 범위 고지(`#riskScopeNote`)는 그대로이며, `#riskPlanCheckBtn` 이동 처리 코드는 남긴다. 목표비중을 위험점수에 넣지 않는 Phase 39 원칙(e2e/40 9)은 그대로다.
- 검증: `e2e/99` F(375 · 1440 × Light · Dark - 안내 부재 · 유지 요소 · 빈 자리 없음 · 넘침 없음). 기대값 갱신: `e2e/40` 7 · 8 · 10 · 뷰포트 테스트(안내 표시 → 미표시, 10은 이동 처리 코드 유지 확인), `e2e/72` G(범위 고지 유지 · 성격 고지 미표시).

## 42. UI 상태 통일 — 필터 독립 · 펼침 상태 · 스크롤 위치 · 참고값 기준 표시 (v255 · PM 지시 · 표시/상태만)

> 되돌리는 것은 화면 상태(펼침/접힘 · 스크롤 위치)뿐이다. 필터 선택값 · 입력값 · 목표 비중 · 적립금 · 투자 기간 · 저장 데이터 · 계산 결과는 바뀌지 않는다.

| ID | 결정 | 조사 결과 · 구현 |
|---|---|---|
| **UI-255-A** 필터 독립 | 상단 필터(소유자 · 자산군 · 계좌)와 자산 세부현황 보기 버튼(전체 · 소유자 · 국내외)은 서로의 선택 상태를 바꾸지 않는다 | 이미 독립 - 상단은 `state.filters`(js/08 change 핸들러), 하단은 `assetListViewMode`(js/07 `setAssetListView`)만 바꾼다. 상단 선택이 목록 금액을 바꾸는 것은 같은 `filteredAssets()`를 쓰는 정상 동작. 코드 변경 없음(`e2e/100` A로 고정). 참고: 보기 버튼은 Phase 18 P2-1 기존 정책대로 탭을 옮기면 '전체'로 돌아간다(유지) |
| **UI-255-B** 펼침 상태 | 탭(하위 탭 포함)을 옮겼다 돌아오면 펼쳐 둔 영역은 접혀 있다. 팝업을 다시 열면 안쪽 묶음도 접혀 있다 | 조사 20종: 네이티브 선택 상자 · 기존 초기화 6종(리스크 감지 · 신랑/와이프 목표 비중 · 절세계좌 소유자 세부 · 거래 목록 · Excel 관리 · 보기 버튼) · 팝업 안 추가 폼/검색 목록(목표 비중 · 수익률 관리 · 종목 검색 · 적립 배분 · 종목 분석 - 열 때 초기화) · 정보 툴팁(바깥 클릭 · 스크롤 시 닫힘)은 정상. **문제 6건 수정**: `resetAllAccordionsOnTabSwitch`(js/03)에 자산 세부현황 그룹(`assetGroupExpanded`) · 목표 비중 종목 행(`portfolioDiagRowOpen`) · 기간별 실현손익 행(`pnlPeriodDetailOpen`) · 대시보드 「상세 현황 보기」(`macroDiagnosisOpen`) · MC 결과 주의사항 묶음/장기 가정 출처(`collapseMonteCarloResultAccordions`, js/19) 추가. MC ⓘ 팝업은 주의사항 묶음을 항상 접힌 보관 HTML로 다시 그리는데 펼침 기록이 남아 첫 클릭이 "닫기"로 처리됐다 - 팝업을 열 때 그 묶음의 기록만 지운다(js/19) |
| **UI-255-C** 스크롤 위치 | 탭을 옮겼다 돌아오면 화면 맨 위, 팝업을 닫았다 다시 열면 팝업 맨 위부터 | 문서 스크롤: `switchTab` · `switchRebalanceSubTab`이 이미 맨 위로 보낸다(정상). 탭 안에는 세로 스크롤 영역이 없다(가로 표 스크롤만). 팝업(26개): 브라우저가 숨김(display:none) 전 스크롤 위치를 기억해 다시 열면 그 위치였다(자산 추가 · 적립설정 · 거래 입력 등 실측) - 자산 상세 · 종목 분석만 따로 맨 위로 보냈다. **수정**: 모든 팝업이 열자마자 부르는 `pushModalHistoryState`(js/03)에서 "이번에 새로 열린" 팝업과 그 안의 스크롤 영역만 맨 위로. 이미 열려 있던(겹친 아래) 팝업은 그대로, 여는 함수가 그 뒤에 일부러 옮기는 스크롤(동기화 차이 확인 상자)도 그대로. 닫힘은 class 변화 관찰로 기록(닫는 경로 무변경) |
| **UI-255-D** 참고값 기준 | 「20년 후 자산 참고값」 → **「20년 후 자산 참고값 (일반적 수익률 적용)」** | js/05 `renderProjectionHeroSummary` 제목 문구 · index.html 초기 문구만. 값은 원래 `presetResults.normal`(일반적 수익률) 경로 - 계산 · 수익률 · 성장률 표시 무변경(v254와 같은 시드로 카드 값 동일 확인) |

**42-1. 검증** — 신규 `e2e/100-ui-state-reset-v255.spec.js`(11: A 필터 독립 · B-1~3 펼침 상태 · C-1~3 스크롤 · D 375/1440 × Light/Dark). 같은 테스트를 v254 코드에 돌리면 B-1 · B-2 · B-3 · C-2 · D가 실패하고 A · C-1 · C-3은 통과(조사 결과와 일치). 기대값 갱신: `e2e/11` · `e2e/94`(참고값 제목) · `e2e/80` E(탭 왕복 후 「상세 현황 보기」가 펼친 채 남는다 → 접혀 있다, 열었을 때 잘리지 않음 검사는 유지).

## 43. 소유자 카드 표시 순서 · 실현손익 배지 문구 (v256 · PM 지시 · 표시만)

| ID | 결정 | 구현 |
|---|---|---|
| **UI-256-1** 필터 독립(재확인) | 상단 필터(소유자 · 자산군 · 계좌)와 총자산 카드 보기 버튼(전체 · 소유자 · 국내외)은 서로의 선택 상태를 바꾸지 않는다 | §42 UI-255-A와 같은 결론 - 상단은 `state.filters`(js/08 change 핸들러), 하단은 `assetListViewMode`(js/07 `setAssetListView`)만 바꾼다. 같은 `filteredAssets()`를 쓰므로 금액 · 목록이 함께 바뀌는 것은 정상 동작. 코드 변경 없음(`e2e/100` A로 고정) |
| **UI-256-2** 카드 표시 순서 | 신랑 · 와이프 목표 비중 카드에서 **포지션 목표비중 그래프를 종목 목록보다 먼저** 보여준다(두 소유자 동일) | index.html에서 `positionAnalysisCard{Husband,Wife}`와 `portfolioTargetSummary{Husband,Wife}`의 위치만 맞바꿨다. 렌더 함수(`renderPositionAnalysisCard` · `renderPortfolioTargetSummary`, js/04) · 계산 · 소유자별 데이터 분리 · 아코디언 상태는 그대로다 |
| **UI-256-3** 실현손익 배지 문구 | 「총 실현손익 · 전체 자산: 금액」 → **「총 실현손익 : 금액」** | js/02 `renderKPIs`의 라벨 문자열만 변경. 금액(`getTotalRealizedPnL`) · 거래원장 기준 범위(부동산 매매 포함) · 배지 색/형식 무변경. 「오늘 실현손익」 배지와 다른 화면의 문구는 건드리지 않았다 |

| **UI-256-4** 목록 범위 분리 | **상단 필터(소유자 · 자산군 · 계좌)는 상단 도넛 그래프에만 적용**한다. 총자산 카드의 금액 · 보유 자산 수 · 종목 목록은 상단 필터와 무관하게 항상 보유 전체 기준 | 사용자가 "상단 필터를 바꾸면 하단 목록 종목 수가 변한다"고 확인했고, 실측(4건 → 2건 → 1건)으로 재현됐다. 이는 v230 §"필터 범위 통일"(커밋 59b4c75)에서 의도적으로 묶은 동작이었으나 **PM 결정으로 v230 이전 상태로 되돌렸다** - js/07 `renderTable`이 `filteredAssets()` 대신 `tableAssets()`를 쓴다(계산 · 검색 · 보기 버튼 · 그룹 구조 무변경). 목록이 0건인 경우는 이제 "등록된 자산이 없습니다" 하나뿐이라 필터 전용 안내 문구는 제거했다. 한 화면 안에서 그래프(필터 기준)와 목록(전체 기준)의 기준이 서로 다르다는 점은 이 결정의 전제다 |
| **UI-256-5** RISK ⓘ 버튼 삭제 | 대시보드 「⚠️ RISK 관리」 제목 옆 ⓘ 버튼을 화면에서 제거 | 전수 점검(클릭 요소 187개)에서 유일하게 확인된 No-Op - `data-info-tip` 없이 `title`만 있어 모바일에서 눌러도 아무 동작이 없었다. index.html에서 그 `<button>`만 삭제했다(제목 · 범위 고지 · 진단 카드 · 리스크 감지 · RISK 계산 전부 무변경. 전용 핸들러가 없어 함께 지울 코드도 없다) |

**43-1. 검증** — 신규 `e2e/101-owner-card-order-realized-label.spec.js`(4: A 두 소유자의 그래프 · 목록 순서와 소유자별 내용 분리 / B 배지 문구 · 금액 불변 · 오늘 실현손익 문구 유지 / C 상단 필터를 바꿔도 총자산 · 보유 자산 수 · 목록 불변, 그래프만 변경 / D RISK 제목 옆 ⓘ 부재와 나머지 RISK 영역 유지). 기대값 갱신: `e2e/77` D(그래프만 필터 적용) · E(필터가 목록을 비우지 않음 - 빈 안내는 자산 0건일 때만) · `e2e/40` 13(삭제된 ⓘ title 대신 RISK 영역의 보이는 안내 · 툴팁 전체에 「거래량 급증」이 없음을 확인 - 태그 판정은 11 · 12가 그대로 지킨다). 375px 화면으로도 순서 · 문구 확인.

## 44. Risk · MC 전면 개선 정책 — RM-MC-POLICY v1.1 (PM 최종 승인 2026-09-18 · 정책 문서 · 코드 변경 없음)

> **이 절은 정책만 확정한다. 코드 · 데이터 · 테스트 · 버전(`sw.js` CACHE_NAME · `#appVersionLabel`)은 이 절로 바뀌지 않는다 — v256 동작 그대로다.**
> **[상태 주석 2026-09-20]** 위 문장은 이 절을 작성한 시점(2026-09-18 · v256)의 서술이다. 이후 44-13(v258) · 44-15(v259) · 44-16 · 44-16-2(v262)는 **시행 기록**을 담고 있으며, 해당 절에 적힌 대로 코드 · 데이터 · 테스트 · 버전이 실제로 바뀌었다.
> 배경: Risk / MC 전면 재감사(READ-ONLY) 2회와 PM 검토 5라운드를 거쳐 확정했다. **조사 단계는 이 절로 종료한다 — 같은 주제의 반복 조사 금지.** 이후는 Phase별로 구현 1회 + 검토 1회로 진행한다.
> 조 번호(제1조~제49조)는 PM 승인 정책서 RM-MC-POLICY v1.1의 번호를 그대로 쓴다. 인용 시 `§44 제N조`로 참조한다.

**문서 분리 원칙** — 정책과 검증 결과를 섞지 않는다.

| 문서 | 성격 | 시점 |
|---|---|---|
| **RM-MC-POLICY v1.1** (= 본 절) | 사전 확정 정책 | Backtest 이전 확정 · 결과를 본 뒤 수정하지 않는다 |
| **Backtest Gate v1.0** | 사전 확정 검증 기준 · 판정식(A층) | Backtest 이전 확정 · **아직 미작성(다음 단계)** |
| **Backtest Gate Result v1.0** | 실제 실행 결과 기록 | Backtest 이후 산출 |

---

**44-0. 목적과 기존 정책과의 관계 (제1조 · 제2조)**

**제1조 목적** — ① 실제 시장 관측자료 기반 위험 측정의 신뢰성 향상 ② 자산의 경제적 특성·통화 노출 반영 ③ 단순 확률모형의 시장 재현 한계 개선 ④ 장기 자본시장 가정(CMA)과 역사적 데이터 결합 ⑤ 데이터·가정·모델·검증 결과의 추적성 ⑥ 결과가 좋아 보인다는 이유로 신규 모델을 임의 채택하지 않음 ⑦ 사전 확정된 Backtest Gate를 통과한 모델만 제품 적용 대상.
목표는 완벽한 미래 예측이 아니라 **현실적 시장 특성 반영 · 데이터/가정/모델 추적성 · 재현 가능하고 사전 검증 가능한 체계** 세 가지의 동시 확보다.

**제2조 기존 정책과의 관계** — 기존 확정 정책은 임의 변경하지 않는다. 본 절에서 **명시적으로 대체한다고 규정한 것만** 정식 정책 변경으로 간주하며, 대체는 **시행 시점부터**다(그 전까지 기존 조항이 유효).

| 기존 정책 | 내용 | 대체 |
|---|---|---|
| **§40 P-7** | "위험 계산에 환율 요인을 넣지 않는다" | → §44 **제6조**(Risk FX) 시행 시점부터 대체 |
| **§40 P-2** | "공통 거래일 120개 미만이면 전체 INSUFFICIENT" | → §44 **제7조 · 제12조**(지표별 기간 · Metric-level Partial Display) 시행 시점부터 대체 |

그 외 기존 정책(§37 CMA · §40 P-1 · P-3~P-6 · P-8 · P-9 · Risk Score 구조 등)은 본 절에서 명시 변경하지 않는 한 계속 유효하다. 기존 사용자 데이터와 사용자 입력의 의미는 보존한다.

---

**44-1. 계층 분리 — Return Key · Risk/MC 역할 · Exposure Master (제3조~제5조)**

| 조 | 정책 |
|---|---|
| **제3조** Return Key | Return Key는 **유지**한다(일반 미래 수익률 추정 · 보수/일반/낙관 · 대표 수익률 연동 · 사용자 지정 가정 · MC 장기 기대수익률 Anchor). Return Key(= 장기 기대수익률·일반 수익률 가정의 권위)와 MC 확률모형(= 미래 경로의 확률적 생성 방식)은 **서로 다른 계층**으로 분리한다. MC 모델 개선을 위해 Return Key를 제거하지 않는다 |
| **제4조** 역할 분리 | Risk = 보유자산의 **실제 시장 데이터에서 관측되는 위험 측정**. MC = 장기 자본시장 가정과 역사적 시장 움직임으로 **미래 경로 분포 생성**. 목적이 다르므로 동일한 데이터 처리 규칙을 기계적으로 공유하지 않는다. 단 **자산의 기본 사실관계는 Exposure Master를 공통 Source of Truth로** 사용한다 |
| **제5조** Exposure Master | Risk·MC가 자산 성격을 일관되게 판단하기 위한 공통 사실원장. 관리 항목: `AssetClass · MarketExposure · Benchmark · PriceCcy · UnderlyingCcy · FXExp · HedgeStatus · ConversionMethod · Evidence · Version`. **모든 자산에 모든 필드를 강제하지 않는다** — 자산 유형별로 필요한 필드만 필수. 판정에 필요한 정보가 확인되지 않으면 **임의의 값으로 보정하지 않는다**. **[D-16 시행 경계 · 1차 통합 구현 · 2026-09-19 → 44-16]** 원장 → 자산 성격(Asset Character) · MC 자산군은 **시행**(js/05 `resolveAssetCharacter` 1-1단계 · js/16). 원장 → 자동 Return Key(μ)는 **금지**(별도 PM 결정 사항) - Return Key 자동 판정 · 추천 · 상태 점검은 원장을 보지 않는다 |

*자산유형별 필수 필드 (제5조 운영 기준)*

| 자산 유형 | AssetClass | MarketExp | Benchmark | PriceCcy | UnderlyingCcy | FXExp | HedgeStatus |
|---|---|---|---|---|---|---|---|
| 원화 현금성 | 필수 | N/A | N/A | 필수(KRW) | N/A | N/A | N/A |
| 외화 현금성 | 필수 | N/A | N/A | 필수 | = PriceCcy | 필수 | N/A |
| 국내 개별주 | 필수 | 필수 | 필수 | 필수(KRW) | N/A | N/A | N/A |
| 해외상장 개별주 | 필수 | 필수 | 필수 | 필수 | = PriceCcy | 필수 | N/A |
| 국내상장 국내ETF | 필수 | 필수 | 필수 | 필수(KRW) | N/A | N/A | N/A |
| **국내상장 해외ETF** | 필수 | 필수 | 필수 | 필수(KRW) | **필수** | **필수** | **필수** |
| 해외상장 ETF | 필수 | 필수 | 필수 | 필수 | 필수 | 필수 | 필수 |
| 채권 · 기타 | 필수 | 필수 | 조건부 | 필수 | 조건부 | 조건부 | 조건부 |

해당 유형의 필수 칸이 하나라도 비면 UNRESOLVED. N/A 칸이 비어 있는 것은 정상이며 오류로 보지 않는다.

> 현재 `data/ticker-master.json`은 code · nameKr · nameEn · market · exchange · naverTicker · yahooTicker 만 갖는다 — UnderlyingCcy · FXExp · HedgeStatus를 채울 근거가 앱 안에 없다. Exposure Master는 신규 구축이 불가피하다. 또한 현재 MC 자산군 판정(js/16 `resolveMcAppAssetClass`)은 사용자가 고른 Return Key에서 자산군을 추론하므로, 제4조·제5조에 따라 **사실 판정 축으로 이관**한다.

---

**44-2. FX 정책 (제6조)**

| 항 | 정책 |
|---|---|
| **6-1 Risk** | Risk의 FX 처리는 **실제 가격 시계열의 통화(가격통화)** 를 기준으로 한다. 한국에 상장된 해외자산 ETF처럼 가격 시계열 자체가 KRW 기준인 경우 동일 FX 효과를 다시 곱해 **이중 반영하지 않는다** |
| **6-2 MC** | MC는 **실제 경제적 FX 노출**을 기준으로 한다. 필요한 경우 Exposure Master에서 PriceCcy · UnderlyingCcy · FXExp · HedgeStatus · ConversionMethod를 구분한다. 필수 FX 정보가 확인되지 않으면 **임의로 FX=0으로 가정하지 않고** UNRESOLVED(또는 해당 데이터 부족 상태)로 처리한다 |
| **6-3 금지** | 다음 조용한 가정을 금지한다 — 미확인 FX = 0 / 미확인 Hedge Cost = 0 / 미확인 환노출 = 0 / 미확인 자산의 임의 환노출 / 기타 경제적 의미를 가진 값을 임의의 0으로 대체 |

> **확인된 현황**: js/15(엔진) · js/16(어댑터) · js/18(컨트롤러) 어디에도 환율 계산이 없고 js/19(UI)에 안내 문구만 있다. 즉 현재 MC는 모든 해외자산에 **FX=0 · 헤지비용=0**을 암묵 적용 중이다. 따라서 이 조는 환헤지형만의 문제가 아니라 **MC 해외자산 FX 모델 전체**를 대상으로 하며, "현행 유지"가 더 보수적인 선택이 아니다. FX는 Exposure Master 활성화와 함께 도입하고(부분 도입 금지), 미해결 자산은 사유를 표시하고 차단한다(제20조).

---

**44-3. Risk — 기간 · 가격 · 품질 · 벤치마크 · 스트레스 · 부분표시 (제7조~제12조)**

| 조 | 정책 |
|---|---|
| **제7조** 데이터 기간 | 지표 목적별 차등: RSI / MA / 52주 **1년** · Volatility **2년** · Beta **2년** · Correlation **2년** · VaR **3년** · CVaR **3년** · MDD **3년** · Historical Stress **별도 장기 역사 데이터**. 데이터가 부족해도 전체 Risk를 일괄 실패시키지 않고 **지표별로** 산출 가능 여부를 판단한다. **단, 3년 관측기간의 실제 적용 시점은 제41조(Yahoo 확인)가 끝난 뒤 결정한다 — 정책 확정과 시행 시점은 분리한다** |
| **제8조** 가격 데이터 | 8-1 통계적 위험지표(Volatility · VaR · CVaR · Beta · Correlation · Sortino · MDD)는 가능한 경우 **조정주가 기반 수익률**. 8-2 기술적 지표(RSI · MA · 52주 고저 · 거래량 신호)는 **실제 가격 시계열**. 두 기준을 혼용하지 않는다. **[8-1 단서 · D-01 · 2026-09-19 → 44-16]** 지수(Benchmark)에는 ETF의 조정주가 개념을 적용하지 않는다 - **지수 수준(Index Level/Close)을 통계용 가격으로 인정**한다. 상품의 공식 기초지수와 같은 수익 정의(PR/TR)를 우선하고, 다른 정의를 쓰게 되면 `DEFINITION_MISMATCH`를 남긴다(PR을 TR로 표시하지 않는다) |
| **제9조** 데이터 품질 | 단일 DATA SHORTAGE를 세분화한다 — `FETCH_FAILED · TICKER_INVALID · NO_HISTORY · INSUFFICIENT_HISTORY · BENCHMARK_UNRESOLVED · INSUFFICIENT_COMMON_DATES · DATA_STALE · DATA_QUALITY_FAILED · SOURCE_UNAVAILABLE`. 품질검사 항목: 중복 날짜 · 날짜 순서 · 누락 · 비정상 급등락 · 동일가격 반복 · 장기 stale · 통화 · 빈도 · Price/Total Return 구분 · 출처 · 데이터 버전. **신뢰할 수 없는 데이터를 0 또는 임의 fallback으로 대체하지 않는다** |
| **제10조** Benchmark | 단순 거래소 기준으로 결정하지 않는다. 판단 구조 `Asset → Classification → Economic Exposure → Benchmark`. ETF도 실제 경제적 노출 기준. 확인되지 않으면 `BENCHMARK_UNRESOLVED`이며 임의 Benchmark를 지정하지 않는다. **[D-06 · 2026-09-19 → 44-16]** 개별주 우선순위: ① 원장의 근거 있는 경제적 노출(해외 개별주는 본국 보통주 A등급 근거가 있을 때만 · PM 결정 ③ 2026-09-19) ② 원장 근거가 없는 국내 상장 개별주 → 상장 시장 지수(국내 우선주도 현행 유지 · PM 결정 ④) ③ 미국 상장주 등 ADR 여부 · 본국 보통주 여부를 원장으로 확정하지 못하면 거래소 지수로 보내지 않는다(NYSE · AMEX 포함 무조건 fallback 없음) ④ 그 외 UNRESOLVED. 이 조의 "단순 거래소 기준으로 결정하지 않는다"를 ②의 국내 상장 개별주에 한해 예외로 둔다(상장 시장 지수 = 그 시장 보통주를 담는 지수) |
| **제11조** Stress | 하드코딩 fallback 수치를 쓰지 않는다. 역사적으로 실제 발생한 Benchmark 최악 하락 구간 · 주요 위기 국면 · 2020 COVID · 2022 금리상승을 활용하되, **2020/2022도 임의 숫자가 아니라 역사적 데이터에서 산출**한다 |
| **제12조** Partial Display | **Metric-level Partial Display가 원칙.** 예: Volatility 산출 가능 · Beta 데이터 부족 · MDD 산출 가능 → Volatility·MDD는 표시하고 Beta는 산출 불가임을 명확히 표시. 일부 지표의 데이터 부족으로 전체 Risk 화면을 무조건 실패시키지 않는다 |

---

**44-4. MC — 모델 · 패널 · 부트스트랩 · 채택 (제13조~제20조)**

| 조 | 정책 |
|---|---|
| **제13조** 기본정책 | 현재 GBM을 **Baseline Model로 유지**한다. 개선 후보 모델은 `CMA / Return Key + Historical Monthly Total Return Panel + Stationary Block Bootstrap + CMA Re-centering`. 후보 모델은 **사전 Backtest Gate 통과 시에만** 제품 적용 검토 대상이다 |
| **제14조** 데이터 패널 | 가능한 경우 포함: KR Equity · US Equity · Developed ex-US · Emerging Markets · Gold · Cash/Short Rate · USD/KRW. **다음은 본 패널로 자동 해결된다고 보지 않는다 — REAL_ESTATE · CRYPTO · Gold 이외 원자재 · BOND.** 해당 자산군은 필요한 역사 데이터와 정책이 확보되기 전까지 MC에서 UNRESOLVED / NOT_EVALUABLE_DATA 사유를 표시하고 계산을 차단할 수 있으며, **개선 이후에도 지원되지 않는 자산군이 존재할 수 있음을 제품 고지·릴리스 노트에 명시**한다. 자산군 추가는 ① 경제적 의미 명확 ② 데이터 품질 확보 ③ 사용·재배포 조건 확인 ④ 모델 검증 활용 가능 — 4개를 모두 충족할 때만 |
| **제15조** Total Return | 가능한 경우 MC 역사 표본은 **Total Return 기준**으로 구성하고 배당·분배금을 반영한다. Price Return과 Total Return을 혼용하지 않으며, 각 데이터의 Return Basis를 메타데이터에 기록한다 |
| **제16조** Joint Bootstrap | 자산군별 월별 수익률을 **독립적으로 추출하지 않는다.** 동일 월의 자산군 수익률 **벡터**를 하나의 관측 단위로 보고 Block 단위로 resampling한다(KR · US · DevExUS · EM · Gold · Cash · FX). 이를 통해 시장 동시 하락 · 자산 간 의존관계 · 위기기간 연속성 · 변동성 군집을 가능한 범위에서 보존한다 |
| **제17조** Block Length | 후보 **6 · 12 · 24 · 36개월**. 결과가 가장 좋은 것을 사후 선택해 Gate를 통과시키는 방식을 **금지**한다. 절차: ① **Calibration Dataset**에서 사전 정의된 선정규칙으로 **단 하나의 L을 선정** → ② **Evaluation Dataset**에서 그 L을 **고정**(재선택·변경 금지) → ③ 고정된 L에 대해 Backtest Gate를 **단 한 번** 적용. Evaluation 결과를 본 후 L을 다시 선택하지 않는다. **Calibration/Evaluation 분할 방법 자체도 Gate A층에서 사전 확정한다** |
| **제18조** CMA Re-centering | 역사 표본의 장기 기대수익률이 현재 CMA / Return Key와 다를 수 있으므로 역사 표본을 CMA / Return Key의 geometric return 기준에 맞춰 재조정한다. **P50이 기존 GBM과 동일하거나 거의 같다고 사전에 가정하지 않는다** — P50 변화 여부는 실제 Backtest 및 제품 시뮬레이션 결과로 측정한다 |
| **제19조** 채택 원칙 | 순서: ① 현재 GBM Backtest → ② Bootstrap 후보 Calibration → ③ Block Length 선정·고정 → ④ Bootstrap Evaluation → ⑤ 사전 확정 Gate 적용 → ⑥ 최종 판정. Gate 통과 → Bootstrap 제품 적용 / Gate 실패 → **기존 GBM 유지** / NOT_EVALUABLE_DATA → 검증 불가로 기록하고 데이터 확보 후 재평가 가능. **더 현대적이거나 현실적으로 보인다는 이유만으로 채택하지 않는다** |
| **제20조** 데이터 불확실성 | 필수 데이터가 없을 때 임의의 0값을 쓰지 않는다. 금지: 수익률 0% 자동 대체 · FX 0 자동 대체 · Hedge Cost 0 자동 대체 · 미확인 자산의 임의 자산군 분류. 확인되지 않으면 UNRESOLVED 또는 NOT_EVALUABLE_DATA. **해결되지 않은 자산은 사유를 사용자에게 표시하고 계산을 차단할 수 있다** |

---

**44-5. Backtest Gate (제21조~제37조)**

| 조 | 정책 |
|---|---|
| **제21조** 사전등록 | Gate는 **결과를 보기 전에** 확정한다. 결과를 본 후 변경하지 않는 항목: 검정방법 · 유의수준 · 평가 Horizon · 절대 허용밴드 · 최소 표본요건 · 필수/보조 계층 · 다중검정 방법 · Calibration/Evaluation 분할방법 · Block Length 선정방법 · PASS/FAIL 규칙 · 보조진단 거부조건 · 결과 재현성 조건. A층 항목은 결과에 따라 완화하지 않는다 |
| **제22조** Horizon | 필수 평가 Horizon은 **1M · 3M · 6M · 1Y**. 각 Horizon은 독립적인 **필수 관문**이며, 최종 채택에는 4개 모두 통과가 필요하다. 하나라도 통과하지 못하면 Bootstrap을 채택하지 않고 기존 GBM을 유지한다 |
| **제23조** 3계층 | Gate는 ① 필수 통계적 적합성 ② 절대 허용밴드 및 최소 표본 ③ 보조 진단 및 GBM 비교 — 3계층. **각 검정·지표의 계층 배정은 실행 전 A층에서 사전 확정**하며, 결과를 본 뒤 필수↔보조 재분류를 금지한다 |
| **제24조** 필수 통계검정 | PIT / Density Forecast Evaluation · Kupiec Unconditional Coverage · Christoffersen Independence · Berkowitz 계열 Density Evaluation. 추가 평가: Forecast vs Realized Volatility · Beta Regression Fit · MDD Distribution · Quantile Stability. 검정별 계층과 판정식은 A층에서 사전 확정 |
| **제25조** 해석 원칙 | **"귀무가설이 기각되지 않았다는 것은 모델의 정확성을 증명하지 않는다."** p-value > α라는 이유만으로 PASS시키지 않는다. 통계검정은 부적합 발견 장치이지 진실성 증명 장치가 아니다 |
| **제26조** 다중검정 | 보정은 **각 Horizon 내부에서만** 적용(기본: Holm Sequential Correction). 1M·3M·6M·1Y 전체를 하나의 family로 묶어 보정하지 않는다. **Block Length 후보 선택으로 인한 다중선택 문제는 제17조의 Calibration/Evaluation 분리로 처리**한다 |
| **제27조** 검정력·최소표본 | 표본 부족으로 모델을 기각하지 못하는 문제를 방지한다 — ① 통계검정 + ② 절대 허용밴드 + ③ 최소 표본요건을 **함께** 적용. 유효 표본수가 사전 정의 최소요건보다 작으면 **PASS가 아니라 NOT_EVALUABLE_DATA**. 판정 기록에 표본 수 · 유효 표본 수 · 최소 요구 표본 수 · 검정 결과 · 검정력 관련 정보를 남긴다 |
| **제28조** 절대 허용밴드 | 통계검정과 **별도로** 절대 허용밴드를 적용한다(예: VaR 예측 위반율 vs 명목 위반율 vs 사전 정의 허용범위). **통계검정 PASS + 절대 밴드 PASS 모두** 충족해야 해당 필수 Gate 통과. 수치·계산식은 Gate v1.0 A층에서 사전 확정 |
| **제29조** 중첩 Window | 1Y 등 장기 Horizon의 rolling-origin 평가에서 중첩 표본이 생기면 일반적인 독립성 가정을 그대로 적용하지 않는다. 중첩 표본을 쓰는 경우 **bootstrap 기반 empirical null distribution**으로 검정하며, 반복횟수·seed·절차를 사전 고정한다 |
| **제30조** 부분통과 | 채택 조건 = `1M PASS AND 3M PASS AND 6M PASS AND 1Y PASS`. 하나라도 필수 Gate FAIL → 최종 FAIL → 기존 GBM 유지. 표본·데이터 부족 → NOT_EVALUABLE_DATA |
| **제31조** 비대칭 거부권 | ③ 보조 진단·GBM 비교는 **채택의 근거가 될 수 없다.** 그러나 A층에 사전 정의된 명백한 모델 이상이 발견되면 **미채택을 결정할 수 있다.** 미채택 사유는 Gate Result에 기록하며, 거부 조건도 실행 전 A층에서 사전 확정한다 |
| **제32조** GBM 비교 | GBM 대비 성능 개선은 단독 채택 조건이 아니다. 동일 조건에서 PIT · VaR Coverage · Volatility · MDD · P10 · P25 · P50 · P75 · P90 · Goal Probability를 비교·기록한다. **절대 Gate 통과가 우선이다** |
| **제33조** 20년·30년 결과 | 20년·30년 MC 결과는 **직접적인 out-of-sample 예측 검증 결과가 아니다.** 장기 구조적 시뮬레이션·시나리오 분석의 성격으로 취급하며, 실제 미래 예측 정확도처럼 표현하지 않는다(사용자 화면 「20년 후 자산 참고값」 영역 포함) |
| **제34조** 재현성 | Backtest는 **명령 하나로 재실행 가능**해야 한다. Data Version · Model Version · Policy Version · Seed · Input Signature · **Runtime Version(Node)** 이 같으면 동일 결과가 재현되어야 하며, 재현되지 않으면 `REPRODUCIBILITY_FAILED` |
| **제35조** 결과 상태 | `PASS`(검증 가능 + Gate 통과) · `FAILED_BACKTEST`(검증 가능 + Gate 불통과) · `NOT_EVALUABLE_DATA`(데이터·표본·조건 부족으로 검증 자체 불가). **세 상태를 서로 대체해 기록하지 않는다.** 실행 재현성 문제는 `REPRODUCIBILITY_FAILED`로 별도 기록 |
| **제36조** 사후 변경 금지 | 실행 후 결과에 유리하도록 변경 금지: 유의수준 α · 허용밴드 · 최소 표본수 · 평가 Horizon · 검정방법 · 필수/보조 계층 · PASS/FAIL 규칙 · Block Length 선정규칙 · Calibration/Evaluation 분할규칙 · 보조진단 거부조건. 새 정책이 필요하면 기존 결과를 소급 변경하지 않고 **별도 정책 버전**으로 관리한다 |
| **제37조** 결과 산출물 | 문서명 **Backtest Gate Result v1.0**. 최소 기록: Run ID · Data/Model/Policy Version · Node Runtime Version · Seed · Input Signature · Calibration Period · Evaluation Period · Evaluation Horizon · Sample Size · Effective Sample Size · Minimum Sample Requirement · Selected Block Length · Block Length Candidates · Bootstrap Iterations · PIT · Kupiec · Christoffersen · Volatility · Quantile · MDD · Absolute Band · Statistical Test · 보조진단 · Horizon별 Gate · Overall Gate · 최종 상태 |

---

**44-6. 모델 버전 · 파이프라인 · 데이터 출처 (제38조~제41조)**

| 조 | 정책 |
|---|---|
| **제38조** 모델 버전 | MC 모델은 **Model Version**을 갖는다. MC 결과는 Model Version · Policy Version · Data Version · Seed · Input Signature를 메타데이터로 갖는다. 모델이 바뀌면 이전 모델의 결과를 새 모델 결과와 **동일하게 취급하지 않는다.** GBM → Bootstrap 전환 시 모델 버전을 명확히 표시하고, 기존 결과를 자동 재해석하거나 덮어쓰지 않는다 |
| **제39조** Pipeline | 장기 데이터 수집은 **App Runtime에서 수행하지 않는다.** 구조: External Source → Build-time / GitHub Actions → Raw Data → Normalization → Quality Gate → Market Panel / Parameter Dataset → Versioning → Static JSON → Application. 앱 실행 중 외부 데이터 의존성을 최소화한다 |
| **제40조** 출처·라이선스 | 모든 장기 데이터에 Source · URL · 취득일 · 기간 · 통화 · Return Basis · License Status · Data Version을 기록한다. **라이선스가 확인되지 않은 데이터는 제품 데이터셋으로 사용하지 않는다.** 별도 확인 대상: Kenneth French · **FRED 개별 Series**(계열별 저작권 표기가 다르므로 일괄 적용 금지) · Samsung Asset Management / KODEX · 장기 Gold TR · 기타 제3자 데이터 |
| **제41조** Yahoo | 현재 Yahoo 기반 Risk 데이터를 **즉시 제거하지 않는다.** 확인 항목: 장기 데이터 제공 안정성 · Rate Limit / 429 · 사용 조건 · 라이선스 · 대체 데이터 확보 가능성. **3년 Risk 조회의 실제 적용은 위 확인 완료 이후**로 하며, 정책상 3년 기준 확정과 실제 요청 범위 확대는 별개 단계로 관리한다 |

> 참고(실측): 현재 Risk는 `range=1y`로 조회하고 캐시가 메모리에만 있어 새로고침마다 재요청한다. 3년이면 종목당 응답량이 약 3배 × 보유 종목 수이며, 과거 429 응답이 관측된 적이 있다.

---

**44-7. 범위 제한 (제42조~제44조)**

| 조 | 정책 |
|---|---|
| **제42조** 모델 복잡도 | 이번 개선에서 추가하지 않는다 — AI 기반 수익률 예측 · GARCH · 복잡한 Regime Switching · 별도 서버 기반 예측 모델 · 실시간 시장예측 시스템. 목적은 복잡도 상승이 아니라 **검증 가능한 모델 구축** |
| **제43조** Bond | Bond 신규 모델은 본 개선 범위에 포함하지 않는다. 기존 Bond 정책(§40 P-5 포함) 및 Backlog를 유지하며, PM 승인 없는 Bond 모델 확장을 금지한다 |
| **제44조** Macro | 본 개선으로 변경하지 않는다 — Macro Indicator 추가 · Macro 구조 변경 · Macro → Risk 정량 연결 · Macro Score Redesign. Macro와 Risk의 역할은 계속 분리한다 |

---

**44-8. 진행 · 전환 · 중단 · 최종원칙 (제45조~제49조)**

**제45조 Phase별 진행원칙** — 각 Phase는 **구현 1회 + 검토 1회**. 불필요한 반복 연구·반복 구현을 하지 않는다.

| 순서 | 내용 | 상태 |
|---|---|---|
| ① | 운영원칙 최종 확정 | 완료(PM 승인 2026-09-18) |
| ② | **Backtest Gate A층 확정** | **완료**(2026-09-18 · 본 절 44-10 제50조~제66조) |
| ③ | RM-MC-POLICY v1.1 공식 문서화 | 본 절 |
| ④ | Phase 1A — Exposure Master 구조 | **완료**(v257 · 비활성 도입) |
| ⑤ | Phase 1B — Exposure Master 데이터 | **완료**(v257 활성화 · v262에서 EM-2026.2 확장 · 44-16) |
| ⑥ | Risk 데이터·진단·기간 개선 | **부분 완료** — 데이터 품질 · 부분 표시 · 결측 요인 재정규화(v258 · 44-13) · 원화 기준 환율(v259 · 44-15) · Benchmark · Index Master · 비동기 베타(v262 · 44-16). **지표별 관측기간(제7조 2년 · 3년)은 미착수**(선행: 제41조 Yahoo 확인) |
| ⑦ | 장기 Market Panel 구축 | 미착수(제40조 라이선스 확인 선행) |
| ⑧ | 현재 GBM Backtest | 미착수 |
| ⑨ | Bootstrap Calibration | 미착수 |
| ⑩ | Block Length 고정 | 미착수 |
| ⑪ | Bootstrap Evaluation | 미착수 |
| ⑫ | Backtest Gate 판정 | 미착수 |
| ⑬ | Backtest Gate Result 기록 | 미착수 |
| ⑭ | 통과 시 Bootstrap 제품화 | 미착수 |
| ⑮ | 최종 통합 검증 및 Release | 미착수 |

**제46조 Phase 1A / 1B 전환 정책** — Phase 1A에서는 Exposure Master의 **구조와 판정 로직만** 도입하고 **비활성 상태**로 두며 기존 Risk·MC 경로를 유지한다. 실제 판정·강제 적용은 **Phase 1B에서 필수 데이터가 채워진 뒤 활성화**한다. Phase 1B의 최소 필수 범위는 **실제 사용자 보유자산 + 앱 기본 자산**이며, 그 외 자산은 UNRESOLVED로 남을 수 있다. 이를 통해 빈 Exposure Master가 전체 Risk·MC를 일시에 차단하는 문제를 방지한다.

**제47조 PM STOP 조건** — 다음 상황에서는 구현을 중단하고 PM에 보고한다. 단순한 구현 난이도나 코드량 증가는 STOP 사유가 아니다.

| ID | 조건 |
|---|---|
| **STOP-1** | 기존 정책 ID 또는 정책 의미를 변경해야 하는 경우 |
| **STOP-2** | 필수 데이터 또는 라이선스 등 선행조건이 확보되지 않는 경우 |
| **STOP-3** | 사용자 입력의 의미가 변경되는 경우 |
| **STOP-4** | 기존 사용자 데이터가 손실될 가능성이 있는 경우 |
| **STOP-5** | 의도하지 않은 사용자-visible behavior가 발생하는 경우 |
| **STOP-6** | 정책에서 사전 확정하지 않은 판단이 필요한 경우 |

**제48조 정책 및 결과의 분리** — RM-MC-POLICY v1.1(사전 확정 정책) · Backtest Gate v1.0(사전 확정 검증 기준) · Backtest Gate Result v1.0(실제 실행 결과)을 분리한다. 검증 결과를 이용해 정책이나 Gate를 유리하게 수정하지 않는다. **데이터 부족으로 검증할 수 없는 경우와 검증 결과가 실패한 경우를 반드시 구분한다.**

**제49조 최종 원칙** — 본 프로젝트는 '더 복잡한 모델'을 목표로 하지 않는다. 채택 모델은 다음을 만족해야 한다.
1. 실제 시장 특성을 가능한 범위에서 충실히 반영할 것
2. 데이터와 가정의 근거를 추적할 수 있을 것
3. 계산 과정이 재현 가능할 것
4. 미래 관측자료로 검증할 수 있을 것
5. 결과를 본 후 합격기준을 변경하지 않을 것
6. 불확실한 데이터를 임의의 0값으로 숨기지 않을 것
7. 검증을 통과하지 못한 신규 모델은 기존 모델을 유지할 것
8. 보조 진단에서 명백한 이상이 발견되면 안전을 위해 신규 모델을 미채택할 수 있을 것
9. Block Length 등 모델 선택변수를 검증 결과를 보고 사후적으로 선택하지 않을 것
10. 모델 변경 시 이전 결과와 신규 결과를 명확히 구분할 것

> **"좋아 보이는 모델이 아니라, 사전에 정한 기준을 통과하고, 데이터와 가정을 추적할 수 있으며, 결과를 본 뒤 기준을 바꾸지 않은 모델만 제품에 적용한다."**

---

**44-9. 이번 절에서 하지 않는 것 · 남은 선행조건**
- 코드 · 데이터 파일 · 테스트 · 버전 변경 없음. **v256 동작 그대로**이며 이 절만으로 화면에서 달라지는 것은 없다.
- Backtest Gate v1.0 A층(유의수준 · 검정 · 허용밴드 · 최소표본 · 분할 · 블록길이 · MC-NULL · Veto · 재현성)은 **44-10(제50조~제66조)에서 확정**되었다. 표본 수에 의존하는 산출값만 B층으로 남는다.
- 표본 수에 의존하는 임계값(B층)은 A층에서 정한 **공식으로 기계적으로 산출**하며, 산출값은 정책 개정이 아니라 **Backtest Gate Result v1.0에 결과로 기록**한다(제48조).
- 선행조건 미해소: 장기 패널 소스 라이선스(제40조) · 패널 저장/배포 위치 · Yahoo 사용조건(제41조) · 환헤지 비용(한·미 단기금리차) 데이터 확보. 환헤지 비용 데이터가 없으면 **0으로 채우지 않고**(제6조 6-3 · 제20조) 해당 자산을 UNRESOLVED로 차단한다.
- 앱 현황 기준점(이 절 작성 시점): 자산 성격 10종(js/05 `ASSET_CHARACTERS`: KR_EQUITY · US_EQUITY · EM_EQUITY · DEV_EX_US_EQUITY · BOND · CASH · REAL_ESTATE · COMMODITY · CRYPTO · UNRESOLVED) 중 CMA 매핑은 KR/US/EM 3종뿐이다. 제14조 패널이 구축되면 DEV_EX_US · CASH · FX가 새로 해소되고, REAL_ESTATE · CRYPTO · Gold 이외 원자재 · BOND는 계속 미지원으로 남는다.

---

**44-10. Backtest Gate v1.0 — A층 확정 기준 (제50조~제66조 · PM 승인 2026-09-18 · 결과 확인 전 사전 등록)**

> **이 절은 Backtest를 한 번이라도 실행하기 전에 확정된 기준이다.** 제21조·제36조에 따라 실행 후 어떤 항목도 완화·재분류·변경하지 않는다. 산출값(B층)은 이 절을 고치지 않고 `Backtest Gate Result v1.0`에 기록한다(제48조).
> 표기: **[M]** = 필수(mandatory, 채택 판정에 사용) · **[A]** = 보조(auxiliary, 기록만 — 제31조의 미채택 근거로만 사용 가능)

**제50조 (A층의 지위)** — 제51조~제66조는 Backtest Gate v1.0 A층을 구성한다. 이 절의 항목은 ① 통계적으로 유도된 기준, ② 정책적으로 사전 선택한 허용한계, ③ 사전 등록된 절차 — 세 종류이며, 각 조문은 자신이 어디에 속하는지 밝힌다. **정책적 선택값을 통계적 사실처럼 표현하지 않는다.**

**제51조 (유의수준과 다중검정)** — [정책적 선택 + 통계적 구조]
- α = **0.05**. 관례값이며 통계적 필연값이 아니다.
- Horizon **내부**의 필수 검정 집합(family)에 **Holm 순차 보정**을 적용해 그 Horizon의 FWER를 0.05로 통제한다. family 구성은 제66조 표에 고정한다.
- Horizon **간에는 추가 보정을 하지 않는다.** 이는 "보정이 불필요해서"가 아니라, 모든 필수 Horizon을 통과해야 하는 AND 구조에서 **신규 모델 채택을 보수적으로 만들기 위한 정책적 설계**다.
- 그 대가(trade-off)를 명시한다: 완전히 올바른 모델이 우연히 탈락할 확률이 커진다. 두 필수 Horizon(1M·3M)의 검정 family가 서로 **독립이라는 가정 하에서는** 단순 참고값으로 1−(0.95)² ≈ **9.75%** 가 계산된다. 다만 두 Horizon은 같은 데이터를 공유하므로 family 간 의존구조에 따라 **실제 결합 기각확률은 이 값보다 클 수도 작을 수도 있다.** 따라서 9.75%를 실제 상한으로 해석하지 않는다. 실제 값은 제63조 MC-NULL에서 산출해 Gate Result에 기록한다.

**제52조 (PIT / 밀도예측 적합성)** — **1M [M] · 3M [M] · 6M [A] · 1Y [A]**
- PIT 정의: origin t의 예측 앙상블(정렬된 M개, M = 10,000)에서 실현값 y_t의 순위 r_t를 구해 `u_t = (r_t − 0.5) / M`.
- 귀무가설 H₀: 모델의 조건부 h개월 예측분포가 옳다 ⇒ u_t의 주변분포는 U(0,1). (각 origin의 예측분포 F_t가 서로 달라도 u는 동일 분포가 되므로 이질성 문제가 제거된다.)
- 대립가설: 균등성으로부터의 **임의의 이탈**(omnibus).
- 검정통계량: **Anderson–Darling A²**. 꼬리 이탈에 민감하여 우리가 잡으려는 실패 양상에 적합하다. 상측 기각(A²가 클수록 부적합).
- p-value: **제63조 MC-NULL**로 산출(중첩 의존성 반영). 표준 AD 임계표는 사용하지 않는다.
- 최소표본: **검정력 기준**을 사전 등록 절차로 산정한다(제60조 N2). 사전 등록 대립가설 = **예측 표준편차가 실제보다 20% 과소** — 즉 실현값을 생성하는 분포의 스케일이 예측분포의 1.25배인 경우(이때 u_t는 양끝이 두꺼운 U자형으로 균등에서 이탈하며, AD가 겨냥하는 형태다). 이는 제55조의 변동성 밴드 ln(1.25)와 동일한 경제적 크기로, 기준 간 정합성을 위해 선택했다. α = 0.05, 목표 검정력 = **0.80**, 귀무 반복 10,000회 · 대립 반복 2,000회, N 탐색 범위 [20, 400] 이분 탐색, seed 20260101.
- **N = 50 같은 관행값을 근거 없이 쓰지 않는다.** 위 절차는 실제 시장 데이터가 전혀 필요 없으므로 Backtest 실행 전에 산출해 Gate Result에 등록하며, 등록 후 변경하지 않는다.
- 표본 미달 시: 해당 Horizon **NOT_EVALUABLE_DATA**.

**제53조 (Kupiec 무조건부 커버리지)** — **5%: 1M [M] · 3M [M] · 6M [A] · 1Y [A] / 1%: 전 Horizon [A]**
- 예외(exception) 정의: 실현 h개월 수익률 < 모델 예측 5% 분위수.
- 귀무가설 H₀: 예외 발생확률 = p₀ = 0.05.
- 검정통계량: LR_uc (양측 성격의 우도비 — 과다·과소 예외를 모두 탐지).
- p-value: 제63조 MC-NULL.
- **최소표본(검정력 기준, PM 결정 2)**: p₀ = 0.05, p₁ = 0.10, α = 0.05, 검정력 0.80. 정규근사 참고값 N = 150 (= (z₀.₉₅√(p₀q₀)+z₀.₈₀√(p₁q₁))²/(p₁−p₀)²). **확정값은 실제 사용하는 LR_uc 검정에 대해 제63조 절차로 시뮬레이션하여 산정**한다(참고값 150은 근사이며 양측 검정에서는 소폭 커질 수 있다).
- 방향의 일관성: 검정 자체는 양측이고, **최소표본은 위험상 중요한 상향 이탈(p₁ = 2p₀)에 대한 단측 검정력으로 산정**한다. 두 개념을 혼동하지 않는다.
- 1% VaR을 필수로 두지 않는 이유: 기대 예외 수가 N_eff × 0.01에 불과해 우리 표본 범위에서 검정력이 사실상 없다. 필수로 두면 "표본 부족으로 인한 자동 통과"가 되어 제27조 취지에 반한다.
- 표본 미달 시: 해당 Horizon **NOT_EVALUABLE_DATA**.

**제54조 (Christoffersen 독립성)** — **1M [M] · 3M [A] · 6M [A] · 1Y [A]**
- 예외지표 계열 I_t = 1{u_t < 0.05}의 전이빈도(n00·n01·n10·n11)로 LR_ind를 계산한다. 조건부 커버리지 LR_cc는 uc와 ind의 합이므로 **중복 계상을 피해 필수에 넣지 않고 [A]로 기록**한다.
- h > 1에서 [A]인 이유: 월별 origin으로 h개월을 굴리면 예외가 **설계상 기계적으로 연속**된다. 이때 독립성 검정은 모델 결함이 아니라 중첩 구조를 검출하므로 필수 관문으로 부적절하다. (MC-NULL은 그 기계적 군집을 귀무에 포함시키므로 기록값 자체는 해석 가능하다.)
- p-value: 제63조 MC-NULL. α = 0.05, Holm family에 포함(1M).
- 최소표본: 제52조와 동일한 절차로 시뮬레이션 산정(α = 0.05, 목표 검정력 0.80). 사전 등록 대립가설 = **예외의 1차 지속성**: π₁₁ = 0.25 이고 **무조건부 예외율은 p₀ = 0.05로 유지**되도록 π₀₁ = p₀(1 − π₁₁)/(1 − p₀) ≈ 0.0395로 둔다. 이렇게 해야 커버리지는 정상인데 **군집만 존재하는** 상태가 되어, 독립성 검정이 겨냥하는 이탈만 분리해 검정력을 산정할 수 있다(π₀₁를 p₀로 두면 무조건부 예외율이 0.0625로 어긋나 제53조 검정과 혼재된다).
- 표본 미달 시: 해당 검정 NOT_EVALUABLE → 그 Horizon의 필수 집합이 완성되지 않으므로 Horizon **NOT_EVALUABLE_DATA**(표본 부족을 PASS로 바꾸지 않는다).

**제55조 (변동성 적합성)** — **1M [M] · 3M [M] · 6M [A] · 1Y [A] · 성격: 절대 허용밴드(정책값)**
- 예측 변동성: 각 origin의 h개월 누적 로그수익률 앙상블의 표준편차 σ̂_t. 집계는 RMS(√(평균 σ̂_t²)).
- 실현 변동성: 평가구간 origin들의 실현 h개월 로그수익률 표본표준편차.
- **연환산하지 않는다**(horizon 스케일에서 직접 비교 — 스케일링 가정을 끌어들이지 않기 위함).
- 밴드: **|ln(실현/예측)| ≤ ln(1.25) = 0.2231** — 예측 대비 −20% ~ +25%. **정책적 허용한계이며 통계적으로 유도된 값이 아니다.**
- 최소표본(추정 정밀도 기준, 제60조 N1): ln비의 표준오차 ≈ 1/√(2·N_eff). 밴드가 최소 3 표준오차의 분해능을 갖도록 **N_eff ≥ 1/(2·(0.2231/3)²) = 91**.
- MC-NULL p-value는 [A]로 함께 기록한다(밴드 판정과 별개).

**제56조 (분위수 커버리지)** — **전 Horizon [A] · 단조성 위반은 제64조 Veto**
- 대상 q ∈ {0.10, 0.25, 0.50, 0.75, 0.90}. 관측 커버리지 ĉ_q = #{y_t < 예측 q분위수} / N_eff.
- 절대 밴드: **|ĉ_q − q| ≤ 0.05 (고정)**. 정책값이다.
- **`max(0.05, 1.96·SE)` 같은 표본의존 확장 금지** — 표본이 적을수록 밴드가 넓어져 통과가 쉬워지는 구조는 제27조에 정면으로 반한다.
- 최소표본(추정 정밀도): N1(q) = ⌈q(1−q)(1.96/0.05)²⌉ → q=0.10·0.90 → **138**, q=0.25·0.75 → **288**, q=0.50 → **384**. 충족하지 못한 q는 해당 항목만 NOT_EVALUABLE로 기록한다.
- **[A]로 두는 근거**: 제52조 PIT-AD가 이미 분포 전체(모든 분위수 포함)를 검정하는 omnibus 필수 검정이다. 분위수별 커버리지는 독립적인 정보를 거의 더하지 않으면서 표본 요구만 크게 높인다(최대 384). 따라서 필수로 승격하지 않고 진단·기록으로 둔다. 다만 **단조성(q10 ≤ q25 ≤ q50 ≤ q75 ≤ q90) 위반은 분포 생성 자체의 결함**이므로 제64조 Veto로 처리한다.

**제57조 (VaR 예외율 절대밴드)** — **1M [M] · 3M [M] · 6M [A] · 1Y [A] · 성격: 정책적 허용한계**
- 명목 5% VaR 기준, **관측 예외율 ∈ [1%, 9%] (δ = 0.04)**. 정책값이다.
- 최소표본(추정 정밀도, 제60조 N1): N1 = p(1−p)(1.96/δ)² = 0.05·0.95·(1.96/0.04)² = **114**. 이 값은 **밴드를 식별할 수 있는 추정 정밀도**를 뜻하며 **검정력이 아니다**(검정력 기준은 제53조).
- **Kupiec FAIL과 밴드 FAIL의 의미 구분**: Kupiec FAIL = 관측된 차이를 우연으로 설명하기 어렵다. 밴드 FAIL = 차이의 크기가 실무 허용치를 넘었다. 둘은 서로 다른 실패이며, **둘 중 하나만 통과해도 PASS가 아니다**(제59조).

**제58조 (MDD)** — **전 Horizon [A] · 보조진단**
- MDD는 경로의존 지표이므로 **독립표본 검정으로 다루지 않는다.**
- 절차: 평가구간 실현 경로의 MDD가, 제63조 MC-NULL이 생성한 의사경로들의 MDD 분포에서 차지하는 순위를 기록한다.
- 판정에 사용하지 않으며, 순위가 [1%, 99%] 밖이면 Gate Result에 이상치로 표기한다(제64조 Veto 아님).

**제59조 (통계검정과 절대밴드의 관계)** — 두 장치는 성격이 다르다. 통계검정은 "관측 차이가 우연으로 설명되는가", 절대밴드는 "그 차이가 실무적으로 허용되는가"를 본다. **둘 다 정의된 지표는 둘 다 충족해야 해당 항목이 통과**하며, 하나만 만족한 경우를 PASS로 처리하지 않는다.

| 지표 | 필수 통계검정 | 필수 절대밴드 | 근거 |
|---|---|---|---|
| 밀도(PIT) | ○ (AD) | — | omnibus 검정으로 충분, 별도 밴드 정의 시 이중 규제 |
| VaR 5% | ○ (Kupiec) | ○ ([1%,9%]) | 표본 부족 시 "기각 못 함"이 통과가 되지 않도록 밴드 병행 |
| 예외 군집 | ○ (Christoffersen, 1M) | — | 밴드로 표현할 자연 척도 없음 |
| 변동성 | — (MC-NULL p값은 기록) | ○ (ln1.25) | 검정은 소표본에서 무력, 경제적 허용폭이 실질 기준 |
| 분위수·MDD | — | — ([A] 기록) | 제56·58조 근거 |

**제60조 (최소표본 3체계)** — 서로 다른 세 개념을 **하나의 N으로 표현하지 않는다.**

| 기호 | 의미 | 산정 | 해당 |
|---|---|---|---|
| **N1** | 추정 정밀도 — 밴드를 식별할 수 있는 표본 | 닫힌 식 | VaR 밴드 114 · 변동성 91 · 분위수 138/288/384 |
| **N2** | 검정력 — 사전 등록 대립가설을 목표 검정력으로 탐지 | MC 시뮬레이션(데이터 불요) | Kupiec(참고 150) · PIT · Christoffersen |
| **N3** | 실제 가용 표본 | N3 = ⌊origins(h) / h⌋ | 패널 확정 후 실측(B층) |

- 중첩 보정(제63조)은 검정의 **크기(size)를 교정**할 뿐 정보량을 늘리지 않으므로, 가용 표본은 중첩을 할인한 N3로 판정한다.
- 판정: Horizon h는 **모든 필수 항목에 대해 N3 ≥ max(N1, N2)** 일 때만 평가 가능하다. 아니면 **NOT_EVALUABLE_DATA**.
- **데이터가 부족할 때 밴드를 넓혀 통과시키는 처리를 금지한다.**

**제61조 (Calibration / Evaluation 분할)** — [통계적 유도 + 정책 하한]
- 시간순 분할만 사용한다(무작위 분할 금지 — look-ahead 차단).
- **Calibration = max(120개월, 패널의 40%)**, **Embargo = 12개월**(= 평가하는 최대 Horizon), **Evaluation = 나머지**.
- 고정 비율(60/40 등) 대신 위 규칙을 쓰는 근거: Calibration의 역할(블록길이 추정·적률 추정)은 대략 10년이면 포화되는 반면, Gate의 평가 가능성은 Evaluation의 N3에 의해 좌우된다. 남는 표본은 Evaluation에 배분하는 것이 통계적으로 유리하다.
- 최소 요건: Calibration ≥ 120개월, Evaluation ≥ 96개월. 미달 시 전체 **NOT_EVALUABLE_DATA**.
- 누수 차단: Evaluation 데이터는 블록길이 선정·모수 추정·기준 설정 어디에도 입력되지 않는다. 구현 시 L 선정 함수가 **Evaluation 데이터에 접근할 수 없는 시그니처**를 갖도록 강제한다(결과를 보고 되돌아가는 경로가 코드상 존재하지 않아야 한다).
- Evaluation 결과를 본 뒤 분할·임계값·검정·Horizon 등급을 변경하지 않는다(제36조).

**제62조 (Block Length 선정)** — [사전 등록 절차]
- 후보 L ∈ {6, 12, 24, 36}(개월).
- 선정: **Politis–White 계열 자동 블록길이 추정치 b̂를 Calibration 패널에서만 계산**하고, 후보 중 b̂에 가장 가까운 값을 택한다. 동률이면 **작은 값**. b̂ < 6이면 6, b̂ > 36이면 36으로 클램프한다.
- 근거: 추정식은 패널의 자기공분산 구조만 사용하며 **Gate 결과를 전혀 참조하지 않으므로**, 후보 비교에서 발생하는 선택편향이 구조적으로 발생하지 않는다(제26조 요구 충족).
- "결과가 가장 좋은 L 선택"은 금지한다. b̂ 원값·선정 L·자기공분산 요약을 Gate Result에 기록한다.

**제63조 (MC-NULL — 중첩 Horizon 귀무분포)** — [사전 등록 절차 · PM 결정 3]
- **채택 이유**: 종전 안("각 origin에서 y*를 뽑아 블록 재표집")은 ① origin마다 예측분포 F_t가 달라 y를 섞을 수 없고, ② 귀무에서 새로 뽑은 y*계열은 이미 독립이라 블록 재표집을 해도 **중첩 의존성이 재현되지 않는다**. 따라서 사용하지 않는다.
- 절차(고정):
  1. 후보 모델이 참 DGP라는 귀무 하에서, Evaluation 길이만큼의 **연속 월별 의사경로**를 1개 생성한다.
  2. 그 경로에서 실제와 **동일한 rolling-origin·동일한 중첩 구조**로 h개월 실현값을 읽는다(보정이 아니라 구조적 재현).
  3. 각 origin의 **저장된 예측 앙상블(정렬 보관)** 에 순위를 매겨 u*_t를 만든다.
  4. u* 계열로 AD · LR_uc · LR_ind 를 **모두** 계산한다(검정 간 일관된 귀무).
  5. 1~4를 **B = 10,000**회 반복한다. seed = **20260101**, 스트림은 (horizon, test, rep) 오프셋으로 분기한다.
  6. empirical p-value = (1 + #{stat_b ≥ stat_obs}) / (B + 1).
- **사전 size 검증(필수)**: 귀무를 만족하는 인공 데이터에서 실제 기각률이 명목 α = 0.05에 부합하는지(허용 [0.04, 0.06]) 시뮬레이션으로 확인하고 결과를 Gate Result에 기록한다. 실데이터가 필요 없으므로 실행 전에 수행한다. 부합하지 않으면 구현 결함으로 보고 PM에 보고한다(임의 조정 금지).
- **해석의 한계(명시)**: MC-NULL은 통계량의 유한표본·중첩 구조를 평가하기 위한 **귀무분포 생성 장치**일 뿐이며, **모델이 실제 시장에서 옳다는 증거가 아니다.** 모델의 OOS 적합성은 오직 실현된 Evaluation 데이터로 평가된다.

**제64조 (Veto 및 정책 Tripwire)** — 제31조의 비대칭 거부권을 사전 등록 조건으로 구체화한다. **③은 채택 근거가 될 수 없고, 아래 조건은 미채택 근거로만 쓴다.**

| ID | 조건 | 성격 |
|---|---|---|
| **V-1** | 생성 결과에 NaN 또는 Inf 존재 | 통계·계산 결함 |
| **V-2** | 자산가치가 음수인 경로 존재 | 모델 정의 위반 |
| **V-3** | 분위수 단조성 위반(q10 ≤ q25 ≤ q50 ≤ q75 ≤ q90 불성립) 1건 이상 | 분포 생성 결함 |
| **V-4** | CMA / Return Key 재중심화 잔차: 생성 경로의 장기 연환산 기하평균과 목표값의 차이 \|Δ\| > 0.5%p | 제18조 미이행 |
| **V-5** | 재현성 실패 | 제65조 |
| **T-1** | 20년 종점 자산의 P99/P50 > 20배 | **정책적 tripwire. 통계적 기준이 아니며, 모델의 통계적 정확성과 무관하다.** horizon·변동성·적립 스케줄에 따라 자연 변동하는 값이므로 참고 경보로만 사용한다 |

**제65조 (재현성)** — Backtest는 **명령 하나로 재실행 가능**해야 한다. 다음을 Gate Result 매니페스트에 기록하고, 동일 조건에서 결과가 재현되지 않으면 **REPRODUCIBILITY_FAILED**로 판정한다: `dataVersion · modelVersion · policyVersion · seed · inputSignature · calibrationPeriod · evaluationPeriod · horizon · blockLength · bootstrapRepetitions(B) · forecastEnsembleSize(M) · nodeRuntimeVersion`. seed는 숨기거나 실행마다 바꾸지 않는다.

**제66조 (최종 판정 구조)** — [제22조 대체 · 아래 44-12 참조]

*Horizon 등급과 필수 검정 집합(Holm family)*

| Horizon | 등급 | 필수 검정(Holm family) | 필수 밴드 | 보조 기록 |
|---|---|---|---|---|
| **1M** | **필수** | PIT-AD · Kupiec 5% · Christoffersen | VaR 예외율 [1%,9%] · 변동성 ln1.25 | Kupiec 1% · LR_cc · 분위수 · MDD |
| **3M** | **필수** | PIT-AD · Kupiec 5% | VaR 예외율 · 변동성 | Christoffersen · Kupiec 1% · 분위수 · MDD |
| **6M** | 보조 | — | — | 전 항목 기록, 표본 미달 시 NOT_EVALUABLE_DATA 기록 |
| **1Y** | 보조 | — | — | 상동 |

*판정 알고리즘(순서 고정)*
```
1. 재현성 검증 실패            → REPRODUCIBILITY_FAILED (종료)
2. 필수 Horizon(1M·3M) 중 하나라도
   N3 < max(N1, N2)            → NOT_EVALUABLE_DATA (종료)
   또는 Cal/Eval 최소길이 미달
3. 필수 Horizon에서
   Holm 보정 후 기각 발생       → FAILED_BACKTEST → 기존 GBM 유지
   또는 필수 절대밴드 이탈
4. Veto V-1~V-5 중 하나라도 발동 → 미채택(사유 기록) → 기존 GBM 유지
5. 위 어디에도 걸리지 않음       → PASS → Bootstrap 제품 적용 검토 대상
```
- 6M·1Y는 어떤 경우에도 **채택의 필수 조건이 아니며**, 그 결과가 좋다는 이유로 채택 근거가 되지도 않는다(제31조). 다만 V-1~V-5에 해당하면 미채택 근거가 될 수 있다.
- 20Y·30Y는 직접 OOS Backtest로 취급하지 않는다(제33조 유지).
- 결과를 본 뒤 Gate 완화·PASS 조건 변경은 금지된다(제21·36조).

**44-11. 제22조 대체 기록 (추적용 · 기존 문구 삭제하지 않음)**

| 구분 | 내용 |
|---|---|
| **기존 정책** | §44 **제22조** — "필수 평가 Horizon은 1M · 3M · 6M · 1Y. 각 Horizon은 독립적인 필수 관문이며, 최종 채택에는 4개 모두 통과가 필요하다." (44-5 표에 원문 그대로 보존) |
| **대체 정책** | §44 **제66조** — 필수 Horizon = **1M · 3M**. 6M · 1Y는 **보조(auxiliary)** 로 기록하며 채택의 필수 PASS 조건으로 사용하지 않는다. 표본 부족 시 NOT_EVALUABLE_DATA로 기록한다 |
| **대체 사유** | 월간 패널에서 유효표본 N3 = ⌊origins/h⌋ 이므로 h가 커질수록 표본이 급감한다. 6M·1Y는 제60조의 최소표본(N1·N2)을 어떤 분할로도 충족할 수 없어, 제22조와 제27조를 동시에 지키면 결과가 항상 NOT_EVALUABLE_DATA가 된다. 기준을 낮춰 통과시키지 않고 **필수 범위를 검증 가능한 구간으로 한정**하는 방식을 택했다(PM 결정, 2026-09-18) |
| **적용 시점** | Backtest Gate v1.0 시행 시점부터. 그 전까지 제22조가 유효하다 |
| **영향 없는 조문** | 제19조(채택 순서) · 제21조(사전등록) · 제23조(3계층) · 제25조(해석 원칙) · 제26조(Holm 범위) · 제27조(검정력·최소표본) · 제30조(부분통과 원칙 — 필수 Horizon 집합에 대해 그대로 적용) · 제31조(비대칭 거부권) · 제33조(장기 결과 성격) · 제35조(상태 구분) · 제36조(사후 변경 금지) |

**44-11-1. 3M 필수 유지 결정의 사전 등록 (PM 확정 2026-09-18 · Backtest 실행 전)**

- **3M은 필수 Horizon으로 유지한다.** 이 결정은 실제 Evaluation 결과를 본 뒤 조정한 것이 아니라, Backtest를 한 번도 실행하지 않은 **정책 확정 단계에서 사전 결정**된 것이다(제21조).
- 현재 확보 가능한 패널에서 3M의 N3가 제60조 최소표본에 미달할 수 있다는 사실을 인지한 상태에서 내린 결정이며, 그 경우의 판정은 **NOT_EVALUABLE_DATA** 다.
- **NOT_EVALUABLE_DATA의 의미(정의)**: "현재 확보된 데이터로는 3M Backtest의 사전 등록된 통계적 검증을 수행하기에 충분한 정보량이 없다." 이는 **모델의 FAILED_BACKTEST가 아니며**, 모델이 틀렸다는 뜻도 아니다(제35조).
- 금지 사항(사후 우회 차단):
  - Evaluation 결과를 보고 **3M을 1M으로 낮추지 않는다.**
  - 표본을 인위적으로 늘리지 않는다 — **다자산 pooling으로 3M 표본을 보충하지 않는다.**
  - 중첩 관측을 독립 표본으로 세지 않는다(제60조 N3 정의 유지).
  - 결과가 PASS가 되도록 최소표본·밴드·α·검정력을 변경하지 않는다(제36조).
- 재평가: 적법하게 확보된 장기 데이터가 늘어나면 **동일한 사전 등록 Gate를 그대로 재실행**한다(제19조). 재실행 시에도 이 절의 기준은 변경하지 않는다.

**44-12. A층 확정에 따른 예상 평가가능성 (사실 기록 · 기준이 아님)**
- 공동 패널은 모든 자산군이 동시에 존재하는 구간만 사용 가능하므로(제16조), 시작 시점은 가장 늦은 계열이 결정한다. 조사 기준 두 가지 시나리오: **A안** KR을 KODEX200(2002-10~)으로 구성 → 월 ≈ 287, **B안** 더 이른 KR 총수익 계열 확보 시(라이선스 미확인 · 제40조) → 월 ≈ 447.
- 제61조 분할 규칙 적용 시: A안 Cal 120 · Embargo 12 · Eval 155 → N3 = 1M 154 · 3M 50 · 6M 24 · 1Y 11. B안 Cal 179 · Eval 256 → N3 = 1M 255 · 3M 84 · 6M 40 · 1Y 20.
- 제60조 기준(1M·3M 필수, max(N1,N2) ≈ 150 수준)과 대조하면 **1M은 두 시나리오 모두 충족 가능**, **3M은 두 시나리오 모두 미달**이다. 따라서 현 데이터 전망에서 Overall 판정은 **NOT_EVALUABLE_DATA**가 될 가능성이 높다.
- 이는 기준을 낮춰 해결할 문제가 아니라 **표본이 실제로 부족하다는 사실**이며, 정책의 실패가 아니라 **44-11-1에서 사전 등록한 대로 작동한 결과**다. 제19조에 따라 데이터 확보 후 재평가 대상으로 남긴다. 이 수치들은 A층 기준이 아니라 **현 시점의 사실 기록**이며, 실제 값은 패널 확정 후 Gate Result에 산출된다.

**44-13. 기존 P-8 대체 기록 — 결측 위험 요인의 점수 처리 (PM 결정 2026-09-18 · Phase 2-1 · v258)**

| 항목 | 내용 |
|---|---|
| **변경 대상** | §40 **P-8** 중 "결측 요인 50" (가중치 25/20/20/15/10/10 · 구간 임계값 · 등급 40/60 · 극단위험 가산 · 신뢰도는 **변경 없음**) |
| **변경 이유** | 결측 요인을 50점(중립)으로 채우면 "기준 지수를 확인하지 못해 **모른다**"가 화면에서 "위험이 **보통**이다"로 표시된다. §44 제20조(모르는 값을 임의 값으로 대체 금지) · 제12조(산출 불가를 명확히 표시)와 어긋난다 |
| **기존 정책** | 하위 요인이 결측이면 50점으로 대체한 뒤 6요인 가중합으로 종합 위험점수를 만든다 |
| **변경 정책** | 결측 요인은 **점수 계산에서 제외**하고, 산출된 요인의 **가중치를 재정규화**한다. 산출 가능한 요인이 하나도 없으면 점수를 만들지 않는다(null). 제외된 요인은 **사용자 화면에 명시**한다 |
| **사용자 영향** | 결측 요인이 있던 포트폴리오의 **종합 위험점수와 등급이 바뀔 수 있다**. 화면에는 "데이터가 부족해 점수에 넣지 못한 항목"이 함께 표시되며, 해당 요인 막대는 0%·50%가 아니라 **"점수 없음 + 사유"** 로 표시된다 |
| **계산 결과 영향** | 결측이 전혀 없던 포트폴리오는 **점수 무변경**(유효 가중치 합 = 1.0). 결측이 있으면 남은 요인 비중이 커지므로 점수가 오르거나 내릴 수 있다. 등급 임계값(40/60) · 점수 방향(높을수록 위험) · 0~100 범위는 **그대로** |
| **함께 적용된 원칙** | 요인 내부(손실위험의 MDD·VaR·CVaR)와 기술·수급 요인의 종목 단위 기본값 50, 위험기여도의 베타 1.0 가정도 같은 이유로 제거했다 — 같은 "조용한 대체"이기 때문이다 |
| **승인 주체** | PM |
| **변경일** | 2026-09-18 |
| **적용 버전** | v258 (Phase 2-1) |

> §40 P-8의 원문은 44-5 이전 절(§40 표)에 **그대로 보존**한다. 이 절은 삭제가 아니라 대체 이력이며, P-8의 나머지 항목(가중치·임계값·등급·극단가산·신뢰도 구조)은 계속 유효하다.

**44-14. Phase 2-1 운영 파라미터 (신규 · 정책 변경 아님)**

§44 제9조(데이터 품질 상태)와 제12조(지표별 부분 표시)를 실제로 구현하면서 정한 값이다. 정책이 수치를 지정하지 않은 항목이며, 결과를 본 뒤 조정하지 않는다.

| ID | 값 | 근거 |
|---|---|---|
| **OP-1** 오래된 데이터 기준 | 마지막 거래일이 **10일** 초과 | 주말(2일) + 국내 최장 연휴를 감안한 상한. 거래정지·상장폐지 종목을 정상 데이터처럼 쓰지 않기 위한 **진단용**이며, 이 상태만으로 계산에서 제외하지 않는다 |
| **OP-2** 관측기간 신뢰도 감점 | 공통 거래일이 **최소요건(120일)의 2배(240일)** 미만이면 부족분에 비례해 **최대 10점** 감점 | 120일은 계산을 시작할 수 있는 최소선일 뿐이라 "겨우 넘긴 상태"와 "여유 있게 넘긴 상태"가 같은 신뢰도로 보이던 문제를 고친다. 기존 감점(가격이력 35·섹터 20·수급 8·벤치마크 15·상관 10) 구조는 그대로 두고 크기를 가장 작게 잡았다 |
| **OP-3** 지표별 목표 관측 수 | 기술 250 · 변동성/베타/상관 500 · VaR/CVaR/MDD 750(거래일) | §44 제7조의 1Y/2Y/3Y를 거래일로 환산한 **표시용 기준**이다. 현재 조회 기간은 1년이므로 대부분 미달이며, **이 값 때문에 지표를 막지 않는다**(R-02에서 조회 기간을 늘릴 때 그대로 쓴다) |

**44-15. Risk 원화 기준 환율 반영 — §44 제6조 6-1 시행 · §40 P-7 대체 기록 (PM 결정 2026-09-19 · T6 · v258 유지)**

§40 P-7("위험 계산에 환율 요인을 넣지 않는다")은 44-0 대체 조항 표에 따라 §44 제6조 시행 시점부터 대체된다. 제6조 6-1("Risk의 FX 처리는 가격통화 기준, 원화 가격 시계열에는 다시 곱하지 않는다")과 js/28 주석("Risk는 priceCcy로 측정")의 해석이 갈릴 수 있어, PM이 아래와 같이 확정하고 이 절로 시행한다.

| 항목 | 내용 |
|---|---|
| **적용 기준** | "경제적 해외자산 여부"가 아니라 **가격통화(PriceCcy)** 로 판단한다. PriceCcy는 Exposure Master(RESOLVED)의 값, 없으면 자산의 거래통화(`a.currency`) |
| **PriceCcy = USD** | 통계용 조정주가(USD) × 같은 날의 **연준 H.10 USD/KRW**(달러당 원화) → 원화 조정주가 → 기존 날짜 기준 수익률 · 공통 거래일 계산. 적용 지표: 종목 Sortino · MDD, 포트폴리오 변동성 · VaR · CVaR · MDD · Sortino · 상관 · 위험기여도 |
| **PriceCcy = KRW** | 환율을 추가로 적용하지 않는다(국내 상장 해외 ETF 포함 - 가격에 이미 환율 · 헤지 효과가 들어 있다) |
| **Beta** | 기존 의미 유지 - **환산 전 현지통화 조정주가 수익률**과 기존 벤치마크 수익률로 계산한다 |
| **기술 지표** | RSI · 이동평균 · 52주 고저 · 거래량 신호는 원주가(현지통화) 그대로(제8조 8-2) |
| **날짜 결합** | 가격과 H.10이 **함께 있는 날짜만** 쓴다. 앞 값 채우기 · 뒤 값 채우기 · 보간 · 가까운 날짜 대체 · ECB/Yahoo KRW=X 등 다른 출처 혼합 금지(제6조 6-3 · 제9조 · 제20조) |
| **기준일** | H.10 마지막 사용 가능일 이후의 가격은 통계에 쓰지 않는다. 달러 종목이 모두 환율과 함께 있는 마지막 날을 **환율 기준일**로 화면에 표시한다(값은 데이터에서 동적으로) |
| **데이터** | `data/fx/usdkrw-h10.json` - 빌드 단계 정적 JSON(제39조). `scripts/fx/update-usdkrw-h10.js`가 생성 · 검증(형식 · 중복 · 역순 · 미래 날짜 · 양수 · 범위 · 최소 행 수 · 기존 파일 대비 축소 거부)하고, 통과한 경우에만 원자적으로 교체한다. `.github/workflows/update-fx-h10.yml` 주 1회. 출처: Board of Governors of the Federal Reserve System, H.10(뉴욕 정오 매입환율) · public domain · 연준 출처 표기(제40조). 앱 실행 중 H.10 원문을 조회하지 않는다. 앱은 이 정적 파일(`data/fx/`)을 서비스워커에서 **네트워크 우선**으로 조회하고(주간 갱신이 설치 사용자에게 전달되도록), 네트워크가 실패하면 기존 캐시를 쓴다. 둘 다 없으면 `SOURCE_UNAVAILABLE`(B-1 · v259) |
| **데이터 품질** | 환율 파일을 읽지 못함 → `SOURCE_UNAVAILABLE`, 형식 · 값 검사 실패 → `DATA_QUALITY_FAILED`: 해당 달러 종목의 원화 통계 시계열을 만들지 않는다(달러 수익률로 조용히 대신하지 않음). 공통 거래일 부족은 기존 `INSUFFICIENT_COMMON_DATES` · metricStatus로 처리 |
| **사용자 영향** | 가격통화 USD 종목이 있는 포트폴리오는 변동성 · 손실 지표 · 상관과 그에 따른 **종합 위험점수가 바뀔 수 있다**. 원화 종목만 있으면 결과 무변경. 기존 과거 저장값은 소급 변경하지 않는다(Risk 결과는 저장하지 않고 매번 계산한다) |
| **화면** | Phase 2-4 T3의 "환율 변동 미포함" 문구를 계산 정의 문구로 교체: "달러로 거래되는 종목 N개는 달러 가격과 원/달러 환율을 함께 반영한 원화 가치 변동으로 Risk를 계산했습니다" + 환율 기준일. 평가성 표현(정확도 개선 등)은 쓰지 않는다 |
| **비동기 · 지수 원화 환산 (D-05 · 2026-09-19 → 44-16)** | 국내 상장 해외 ETF처럼 종목 가격(원화 · 한국 달력)과 기초지수(달러 · 미국 달력)가 서로 다른 시장이면 **같은 날짜 정렬을 쓰지 않는다**. 베타는 Dimson 방식(시차 0 + 시차 1 기울기 합 · 최소 관측 120 · 조회 1년 유지)으로 계산한다. 환헤지 여부가 A등급으로 확인된 비헤지 상품만 지수 수준 × 같은 날짜의 H.10 → 원화 지수(= 달러 수익률 + 환율 수익률 + 교차항)와 비교한다. 종목 자신의 원화 가격에는 환율을 곱하지 않는다(6-1 이중 반영 금지 유지). 환헤지 미확인 → UNRESOLVED(HOLD), 환헤지형 → 헤지비용 자료가 없어 UNRESOLVED(0으로 두지 않음). 새 환율 공급자 없음(H.10만) |
| **범위 밖** | 스트레스 시나리오(현지통화 지수 낙폭 · 화면 미표시) · MC FX(제6조 6-2) · 환율 확률 모형 · 종목 분석 리포트(analyzeTickerForModal) |
| **승인 주체 · 변경일** | PM · 2026-09-19 (로컬 v258, 버전업은 최종 통합 때) |

| ID | 값 | 근거 |
|---|---|---|
| **OP-4** 환율 자료 오래됨 | H.10 마지막 날짜가 오늘보다 **21일** 초과 | H.10은 주 1회 전주 금요일까지 게시돼 정상 지연이 최대 약 10일이다. 게시가 두 번 이상 끊긴 경우만 `DATA_STALE`로 진단하며(OP-1과 같이 진단용), 이 상태만으로 계산에서 제외하지 않는다 |

> §40 P-7의 원문은 §40 표에 **그대로 보존**한다. 이 절은 삭제가 아니라 대체 시행 기록이다.

**44-16. 1차 통합 구현 — Index Master · Evidence Grade · 공유표 원칙 · D-01 / D-05 / D-06 / D-16 (PM 결정 2026-09-19 · v262 시행 · 2026-09-19 운영 배포 · 커밋 b9ff90e)**

> 연결 구조: Instrument → Classification → Exposure(Exposure Master) → Risk Benchmark → **Index Master** → Price Source → Risk(베타 · 포트폴리오 베타), 그리고 Exposure Master → 자산 성격 / MC 자산군 → MC 입력. Exposure → Return Key(μ) 연결은 이번에 만들지 않는다.

| ID | 결정 | 구현 |
|---|---|---|
| **IM-1** Index Master | Risk Benchmark(무엇과 비교할지)와 가격 원천(어디서 받는지)을 분리한다. 최소 필드: `key · officialName · provider · sourceId · returnType(PR/TR) · priceDefinition(INDEX_LEVEL) · currency · market · source · evidenceGrade · availability(+unavailableReason)`. 공식 근거가 없는 칸은 null(추정 금지) | js/28 `INDEX_MASTER_ENTRIES` · `resolveIndexMasterEntry` · `isIndexPriceSourceAvailable` · `indexPriceSourceTicker`. 기존 6개 지수(KOSPI · KOSDAQ · NASDAQ · SP500 · NASDAQ100 · DOW)는 AVAILABLE(Yahoo · 기호는 `INDEX_TICKERS`와 같음). 공식 기초지수로 확인됐지만 원천이 없는 지수는 UNAVAILABLE로 기록만 한다: 코스피 200 TR(`NO_PERMITTED_SOURCE` - KRX 로그인 필요 · Yahoo 이력 없음 · KIS 지수코드는 약관 확인 전 연결 금지), Dow Jones Korea Dividend 30 PR · iSelect 미국AI전력핵심인프라 PR(`NO_PUBLIC_SOURCE`), Dow Jones U.S. Dividend 100 PR(`NO_PUBLIC_SOURCE` - §50 PD-13으로 정정 · Yahoo는 `^DJUSDIV` · `^DJUSDV` · `^DJDVY` 모두 과거 시계열을 제공하지 않고 당일 수준값 1건만 준다 · 400일 요청 실측 2026-09-21) |
| **IM-2** 원천 없음 | 정해진 지수의 가격 원천이 없으면 Benchmark를 "계산 가능"으로 처리하지 않는다. **[2차 통합 보완 · 세 상태 분리]** Benchmark 확인(RESOLVED) ≠ 지수 가격 원천(`priceSource: UNAVAILABLE`) ≠ 베타(null · `SOURCE_UNAVAILABLE`) - 세 상태를 하나로 합치지 않는다(1차의 `UNRESOLVED(indexSourceUnavailable)` 표기를 대체). 원천 없는 지수는 조회하지 않고, 다른 정의 · 비슷한 지수로 대신하지 않는다 | js/09 `finalizeRiskBenchmark` · 종목 `benchmarkPriceSource` |
| **D-01** 지수 가격 · PR/TR | ① 지수 수준을 통계 가격으로 인정(§44 제8조 8-1 단서) ② 공식 기초지수와 같은 수익 정의 우선 ③ 다른 정의를 쓰게 되면 `DEFINITION_MISMATCH` 보존 ④ 278530 목표 = 코스피 200 TR(현재 원천 없음 → UNRESOLVED) ⑤ KIS 2035 등 KIS 지수 API는 약관 확인 전 연결 · 호출하지 않는다 | js/09 지수 시계열은 `datedClosesFromSeries(data, 'raw')`(수준값). 원장 `underlyingReturnType`(공식 확인분만) ↔ Index Master `returnType` 비교(`resolveBenchmarkDefinitionStatus` - MATCH / DEFINITION_MISMATCH / UNCONFIRMED). 현재 원장에 불일치 항목 없음 |
| **D-05** 비동기 쌍 | 같은 날짜 정렬 금지. 일반 엔진(Dimson 시차 0 + 1) · 원화 상품이면 H.10 원화 환산 지수. 공식 A등급 환헤지 사실이 있는 상품만 연결(비헤지 A: 360750 · 458730). 환헤지 A등급 미확인(368590 · 360200)은 HOLD. 특정 상품 하드코딩 없음 · 최소 관측 120 · 1년 조회 유지 | js/09 `riskSeriesMarketOf` · `RISK_MARKET_CLOSE_ORDER`(같은 날짜면 한국이 먼저 마감) · `buildAsyncDimsonRows` · `computeAsyncDimsonBeta`(절편 + 두 설명변수 최소제곱 · 기울기 합). 판정은 "종목 시계열 시장 ≠ 지수 시장"이라는 성질로만 한다. 458730은 기초지수 원천이 없어(IM-1) 현재 UNRESOLVED |
| **D-06** 개별주 | §44 제10조 갱신 문구 그대로. 종목 마스터에 설립국 · ADR 필드가 없으므로 미국 상장주를 "본국 보통주"로 추정하지 않는다 | js/09 `RISK_BENCHMARK_BY_LISTING_EXCHANGE = { KOSPI, KOSDAQ }`. 원장에 없는 NASDAQ · NYSE · AMEX 상장 주식 → `listingDomicileUnconfirmed`. **[2차 통합 보완 · PM 결정 ③]** 원장의 해외 개별주는 `equityListing`(HOME_COMMON · ADR · 근거 등급 A만 기록 가능)이 HOME_COMMON일 때만 원장 Benchmark를 쓴다. 원장 미국 개별주 20건은 근거가 거래소 상장뿐이라 전부 UNRESOLVED(v261에서 NASDAQ이던 11건 포함 · 자산군 US_EQUITY는 그대로). ADR → `adrListing`. **PM 결정 ④** 국내 우선주는 종목유형 Master를 추가하지 않고 국내 상장시장 지수 정책을 유지. **[v267 정정 · §53-2]** D-2(§51) 도입으로 원장 조회가 상장시장 판정보다 앞서면서 이 결정이 실질적으로 무효화돼 있었다(원장 미등재 우선주 → 미확정). §53-2로 **원래 취지가 복원**됐다 — 우선주도 증권그룹이 ST(주권)이므로 보통주와 같은 상장시장 지수를 받는다. 종목유형 Master를 새로 만들지 않는다는 원칙도 그대로다(기존 KIS 종목마스터 필드를 읽을 뿐이다) |
| **D-16** MC 자산군 | 원장 → 자산 성격 / MC 자산군 시행. 원장 → 자동 Return Key 금지. 불변: v261 원장 49건의 자산군 · MC 입력 · 같은 seed MC 결과 | js/05 `resolveAssetCharacter(asset, options)` 1-1단계(사용자 확정 자산군 · 이름 혼합 표시 다음, 공유표보다 먼저). Return Key 계층 3곳(`resolveRateKeyFromAssetCharacter` · `recommendReturnAssumptionKey` · `assessReturnAssumptionStatus`)은 `{ exposureMaster: false }`. `CHARACTER_SOURCES_FOR_AUTO_RATE_KEY`에 원장 없음. js/16 `resolveMcAppAssetClass`가 원장 성격을 신뢰 근거로 인정(basis `exposureMaster`). 신규 원장 항목의 MC 영향은 별도 판단 대상이다(사용자 정의 수익률 키를 쓴 경우의 자산군만 바뀔 수 있음). **[PM 결정 ① · 2026-09-19]** 신규 원장 항목이 MC 자산군에 연결돼 실제 MC 계산이 바뀌는 것(특히 사용자 정의 Return Key가 있는 신규 자산의 MC가 실행 가능해지는 것)을 허용한다 - EXPECTED CHANGE로 명시하고, v261 원장 49건의 MC 결과 불변 · 자동 Return Key 금지는 유지한다 |
| **EG** Evidence Grade | A = 공식 1차 자료(운용사 상품정보 · 투자설명서 · 규제기관 공시 · 지수산출기관 · 거래소/KIS 종목마스터) · B = 공식 자료의 2차 요약(기록만 · 자동 연결 근거 아님) · C = 확인 불가/추정(원장 값으로 넣지 않음). 자동 연결(Benchmark · 환헤지)은 A만 | js/28 `EM_EVIDENCE_GRADE` · `evidenceGrade` 필드(EM-2026.2부터). A가 아닌데 Benchmark · 환헤지를 적으면 BLOCKED. 기존 49건(EM-2026.1)은 저장소 안 근거만 쓰며 소급 등급 부여 없음 |
| **MX** 혼합 노출 | 주식 + 채권 혼합 상품(237370 · 472170)은 단일 Benchmark · 단일 자산군으로 강제하지 않는다 - UNRESOLVED(`MIXED_EXPOSURE`). 1:N 노출 구조는 이번 범위 밖 | js/28 `exposureStructure: 'MIXED'` → 검증 결과 UNRESOLVED · `mixedExposure`. Risk `mixedExposure` · 성격 `exposureMasterMixed` |
| **ST** 공유표 원칙 | js/09 `ETF_HOLDINGS_MAP` · `SECTOR_MAP` 신규 항목 추가 동결(삭제 없음). 역할 분리: 섹터 노출(sectorWeights)은 공유표 고유 역할 · 자산 성격은 원장 우선(공유표는 원장에 없는 종목의 대체 근거와 Return Key 경로에만) · Risk Benchmark는 원장 + Index Master. 새 상품의 사실은 원장에 근거와 함께 넣는다 | 키 목록을 `test/integrated-benchmark-index.test.js`가 고정 |
| **NS** 나스닥 스트레스 | 대체 낙폭을 되살리지 않는다 · 새 역사적 낙폭 산출체계를 만들지 않는다 · SoT 문구를 실제 구현(null)에 맞게 정정 | §40 P-5 · 40-3 정정 |
| **FX** | H.10만 사용 · 새 환율 공급자 없음 · 환헤지 미확인 → UNRESOLVED/HOLD | 44-15 비동기 행 |

**원장 EM-2026.2 (공식 기초지수 확인분 · 근거 등급 A · 2026-09-19)** — 278530 → 코스피 200 TR(TR · 원천 없음) · 0052D0 → Dow Jones Korea Dividend 30 PR(원천 없음) · 487230 → iSelect 미국AI전력핵심인프라 PR(비헤지 · 원천 없음) · 360750 → S&P 500(비헤지 · 비동기 · 원화 환산 · PR/TR 구분 미확인 → UNCONFIRMED) · 458730 → Dow Jones U.S. Dividend 100 PR(비헤지 · 원천 부족) · 368590 · 360200 → 환헤지 A등급 미확인 HOLD · 237370 · 472170 → 혼합 노출 · SCHD → Dow Jones U.S. Dividend 100(Benchmark 확인 · 원천 부족 → 베타 계산 불가 · 2차 보완에서 세 상태 분리) · SPYM → S&P 500(원천 있음 · 기존 RESOLVED 유지). 상품의 사실만 담고 사용자 보유 수량 · 금액은 담지 않는다.

**44-16-1. 남은 과제(이번 절로 해결하지 않음)** — KIS 약관 확인(코스피 200 TR 원천) · 368590 · 360200 환헤지 A등급 확인 · ~~영문이 섞인 새 국내 종목코드(예: 0052D0) 식별 문제~~ → **해결(2차 통합 보완 · PM 결정 ⑤ · 44-16-2)** · ~~국내 우선주의 상장 시장 지수 편입 여부~~ → **PM 결정 ④로 현행 유지(종목유형 Master 추가 없음)** · 혼합 노출 1:N 구조 · 원화 기준 역사적 낙폭(스트레스) · Release(버전업)는 PM 승인 후.

**44-16-2. 영문 혼합 국내 종목코드 입력 · 정규화 (2차 통합 보완 · PM 결정 ⑤ · 2026-09-19 · v262 시행)**

| 항목 | 내용 |
|---|---|
| **결함** | js/01 `sanitizeTicker`가 숫자 6자리만 국내 코드로 보아, KRX 영문 혼합 신규 코드(숫자 4 + 영문 1 + 숫자 1, 예: 0052D0)를 접미사 없이 입력하면 해외 티커로 해석했다 - Yahoo 조회 실패(0052D0은 404 · 0052D0.KS는 정상), 네이버 조회 거절(형식 검사), 원장 · 종목 마스터 식별 불일치. 월간 종목 마스터 생성기(scripts/update-ticker-master.js)도 같은 형식 검사로 이 코드를 버렸다 |
| **수정** | js/01 `KRX_SHORT_CODE_PATTERN`(숫자 6자리 또는 숫자 4 + 영문 1 + 숫자 1) · `isKrxShortCode`를 국내 판정(해외 판정보다 먼저)에 쓴다(A 접두사 포함). 같은 도우미를 가격 조회(접미사 없는 코드의 코스피/코스닥 동시 시도 · 네이버 형식 검사 · 종목 분석 코스닥 재시도)와 거래 입력의 통화 추정에 쓴다. 생성기도 같은 형식을 받는다. 숫자 코드 · 해외 티커 · 지수 기호 동작은 그대로다 |
| **저장값 보존** | 예전 정규화 키(접미사 없는 코드)로 이미 저장된 포지션 · 종목 수익률 · 운용보수가 있으면 그 키를 계속 쓴다(js/05 `legacyKrxAlphaStoredKey` - 저장값을 옮기거나 바꾸지 않음). 종목 기준(Instrument Return Key)은 비교 시 정규화하므로 그대로 연결된다 |
| **세 상태** | 0052D0: 원장 확인(RESOLVED · DJ Korea Dividend 30 PR) · 지수 원천 없음(UNAVAILABLE) · 베타 null |
| **범위 밖** | KIS 재무 조회(js/13 `extractKisDomesticCode`)는 숫자 코드만 - KIS 변경 금지 범위라 그대로 둔다. `data/ticker-master.json` 재생성은 v262 릴리스 때 PM 승인으로 실행 완료(2026-09-19 · 16,731건 · 영문 코드 367건 포함) |

## 45. UI 마무리 — 매크로 용어 · 베타 설명 · 줄바꿈 · 소유자 칩 · MC 안내 (PM 지시 2026-09-19 · 표시 계층 한정 · 버전업 전)

> **보이는 문구 · 배치만 바꿨다.** Risk · MC · Macro 계산식, 베타 계산 정책(미확정 → 1.0 · 제외 · 재정규화 여부는 별도 PM 결정 프로젝트로 이관 → **RESOLVED(§46, PM 최종 정책 결정서 v1.0)** — 1.0 대체는 「베타 기준 참고 비중」에만 있었고 §46에서 폐지했다. 포트폴리오 베타는 §40 P-2 그대로), Benchmark 정책, 데이터 · 데이터 출처, 서비스워커는 무변경.

| ID | 확정 내용 |
|---|---|
| UI-45-1 매크로 지표 이름 | 지표 상세의 공용 카드(`buildIndexPriceLevelsHtml`)가 금리 · 환율 · VIX · 달러인덱스 · 지수에도 "주가 위치 참고 · 3개월 최고가/최저가"를 쓰던 것을 지표별 이름으로 바꾼다: 금리 "최근 3개월 최고/최저 금리", 환율 "최고/최저 환율", 지수 · VIX · 달러인덱스 "최고치/최저치", 금 시세는 "최고가/최저가" 유지. 값 · MDD 계산 무변경 |
| UI-45-2 포트폴리오 베타 설명 | 포트폴리오 베타는 종목 베타의 비중 가중합이라, 한 종목이라도 베타가 없으면 비운다(§40 P-2 그대로). 비어 있을 때 "기준 지수 확인 필요" 대신 "일부 종목 계산 불가"(짧은 칸)와 "보유 주식·ETF N개 중 M개는 … 계산하지 못했습니다. 그래서 포트폴리오 전체 값도 만들지 않았습니다"(요인 막대)로 원인을 말한다. 임의 기준 지수 대체 없음 |
| UI-45-3 줄바꿈 | 본문 기본값 `word-break: keep-all` + `overflow-wrap: break-word`(한 단어가 한 줄보다 길 때만 나눔). 미래예측 요약 줄은 "이름 + 값" 단위로 묶는다. 글자 크기 무변경 |
| UI-45-4 총자산 소유자 칩 | 신랑 · 와이프 금액 칩에 기존 소유자 색(차트 평단 점선 `OWNER_AVG_LINE_COLORS`, 신랑 #0077B6/#64D2FF · 와이프 #CC7A00/#FF9F0A)의 점 · 테두리를 넣고 글자는 진하게. 이름 텍스트 유지(색만으로 구분하지 않음), 손익 색(빨강/파랑) 미사용 |
| UI-45-5 MC 안내 정보구조 | **§38 UX-8의 위치를 대체**: 결과 아래 「장기 가정 출처」 드롭다운과 별도 ⓘ를 없애고, 같은 요약(기관 · 기준일 · 기간 · 통화 · 세트 · 상관 출처 유형 · Benchmark 기관/기준일 · 수익률 기준)과 상세(자산군 변동성 · 상관계수 쌍별 출처 · 자료)를 상단 「실제 미래는 여러 경로로 달라질 수 있습니다」 ⓘ 팝업의 "장기 가정 출처" 절에 둔다(MC 설명 → 공식 모델 → 장기 가정 출처 → 주의사항 및 계산 방법). §37 CMA-UI-01 최소 표시 항목은 모두 그대로 확인 가능하다. 결과 하단 ※ 문구(§38-3)는 유지하고 "(위 출처)"를 "(출처는 상단 ⓘ 안내)"로 바꾼다. 상세 목록의 내부 코드 괄호 표기(예: `BENCHMARK_REFERENCE`)는 한국어 이름만 남긴다 |

## 46. 최종 개편 — 베타 기준 참고 비중 · 매크로 직접 검색 · 단위 · 잔여 정리 (PM 최종 정책 결정서 v1.0 · 2026-09-19 · v261)

> **원칙: 모르는 값을 아는 값처럼 만들어 계산하지 않는다.** 이 절은 v260 이후 전수조사(B-01~B-07 · M-01 · M-02 · F-01 · T-01~T-04 · D-01 · G-01 · G-02)를 닫는 최종 정책이다. §45 머리말의 "베타 계산 정책 이관" 문구는 이 절로 **RESOLVED**.
> **무변경**: Portfolio Beta(§40 P-2 · 결측 시 null · 1.0 대체 금지 · 제외 후 재정규화 금지) · Risk Score · Risk 엔진 베타 계산 · MC 모델 · CMA · Return Key · 매크로 계산값 · 저장 데이터 구조 · Risk fixture.

**46-1. 베타 기준 참고 비중 (포트폴리오 설정 → 목표 비중 → '주식' 항목 → 보유 주식 종목 선택)**

| ID | 확정 정책 |
|---|---|
| **REF-01** 정의 | 선택한 주식 종목들 사이에서 시장 민감도(베타)에 반비례(1/β)해 나눈 **참고용 주식 내부 배분값**이다. Risk 결과 · 포트폴리오 베타 · MC에 영향을 주지 않으며, 사용자가 [적용] · [전체 적용]을 누를 때만 목표 비중(초안)에 반영된다 |
| **REF-02** 사용 가능한 베타 | Risk 엔진 결과(`state.advancedRiskMetrics.holdings[].beta`)에서 **유한한 양수**(`beta > 0 && finite`)만 쓴다. 임의의 하한(0.1 등)을 두지 않는다 - 0에 가까운 양수로 큰 참고 비중이 나오는 것은 역비례 방식의 수학적 결과다 |
| **REF-03** 계산 불가(= 미확정) | null · 값 없음 · 0 · 음수 · NaN · Infinity · 보유하지 않은 종목(목표만 지정 · Risk 계산 대상 아님) · Risk 결과 자체 없음. **베타 1.0 대체 폐지**(v260까지 js/04에 있던 "미확정 → 1.0"과 "전부 없으면 균등 배분" 모두 폐지) |
| **REF-04** 미확정 종목 | 참고 비중을 계산하지 않고 **현재 목표 비중을 그대로 둔다**(0%로 만들지 않음 · 줄이지 않음) |
| **REF-05** 배분 대상 | 확인 종목 배분 비중 = '주식' 항목 목표 비중 − 미확정 종목 현재 비중 합계. 이 비중을 확인 종목끼리 1/β 비례로 나눈다 |
| **REF-06** 계산 조건 | ① Risk 결과가 있고 ② 사용 가능한 베타 종목이 **2개 이상**이고 ③ 확인 종목 배분 비중 **> 0**일 때만 계산한다. 종합 위험점수가 "데이터 부족"이어도 종목 베타가 있으면 계산할 수 있다(종목 단위 판단) |
| **REF-07** 계산 불가 표시 | 조건을 못 채우면 참고 비중 배지를 표시하지 않고 [전체 적용]을 비활성화하며 사유를 문장으로 보여 준다(자료 준비 전 / 확인 종목 N개 / 나눌 비중 없음). 미확정 종목에는 "참고 비중 계산 불가"와 쉬운 사유(보유하지 않은 종목 · 기준 지수 미확인 · 가격 기록 부족 · 0 이하)를 표시한다. 1.0 · 0% 같은 임의 숫자를 표시하지 않으며, 균등 배분을 "베타 기준 참고 비중"으로 표시하지 않는다. 내부 상태 코드는 노출하지 않는다. 선택 종목이 1개면 기존처럼 이 영역 자체를 두지 않는다 |
| **REF-08** 전체 적용 | 미확정 종목은 현재 비중 유지, 확인 종목은 REF-05 비중을 1/β로 배분. **'주식' 항목 목표 비중 합계는 적용 전과 같다** |
| **REF-09** 개별 적용 | 선택 종목 A를 A의 참고 비중(배지 값)으로 바꾸고, 차이는 **다른 확인 종목**이 나눠 흡수한다: 그들의 현재 비중 합 > 0이면 현재 비중 비례, = 0이면 참고 비중 비례. 미확정 종목은 재분배 대상이 아니다. **'주식' 항목 합계 보존 · 음수 없음**. 확인 종목이 2개면 결과가 전체 적용과 같을 수 있다(정상) |
| **REF-10** 반올림 | 0.1% 단위. 확인 종목끼리 **최대 잔여법**(버린 소수점이 큰 종목부터 0.1%씩 보정 · 동률이면 참고 비중이 큰 종목 · 그다음 목록 순서). 미확정 종목 값은 보정하지 않는다. 확인 종목 + 미확정 종목 합계 = 적용 전 '주식' 항목 목표 비중(예: 10%를 셋으로 → 3.4 · 3.3 · 3.3). 개별 · 전체 적용 모두 같은 규칙 |
| **REF-11** 이전 동작 기록 | v260까지: 미확정 · 0 이하 · 미보유 · Risk 결과 없음을 모두 베타 1.0으로 계산(전부 없으면 사실상 균등 배분), 개별 적용은 한 종목만 바꾸고 '주식' 합계를 다시 더해 합계가 바뀜(예: 20/20 → 20/10, 40 → 30), 전체 적용은 0.1% 반올림으로 합계가 어긋날 수 있었음(10 → 9.9). 저장된 기존 목표 비중은 사용자가 적용을 누르기 전에는 바뀌지 않는다 |

**46-2. 매크로 지표 직접 검색 · 단위**

| ID | 확정 정책 |
|---|---|
| **MAC-DS-01** 직접 검색 | 종목 분석 검색창에 **티커로 직접 입력**한 값이 기존 매크로 지표 티커(`MACRO_KEY_TICKERS`: ^TNX · KRW=X · ^KS11 · ^KQ11 · ^GSPC · ^IXIC · ^DJI · ^VIX · GC=F · DX-Y.NYB)이면 종목 분석을 실행하지 않고 **매크로 타일과 같은 지표 팝업**(`openStockDetailModal`)을 연다. 새 매크로 계산 · 한글 이름 검색 · 자연어 검색 · 검색어 사전은 추가하지 않는다 |
| **MAC-UNIT-01** 단위 | 지표 팝업 차트의 이동평균 범례 · 세로축은 지표 성격대로 표시한다: 금리 `%` · 원/달러 환율 `원` · 주가지수 · VIX · 달러인덱스는 단위 없는 지수값 · 금 시세 `$`. "해외 티커"라는 이유로 `$`를 붙이지 않는다. 값 자체는 무변경 |

**46-3. 문구 · 명칭 · 정리**

| ID | 확정 정책 |
|---|---|
| **TXT-46-1** 환율 실패 안내 | "환율을 불러오지 못해 기존 환율(○원)을 그대로 사용합니다. 상단 환율 입력란에서 직접 수정할 수 있습니다." - 내부 구현(API) 표현 없음. 계산 무변경 |
| **TXT-46-2** 화면 명칭 4개 | 「일간금융평가손익」→「금융자산 오늘 평가손익」 · 「총금융자산평가손익」→「금융자산 전체 평가손익」 · 「RISK 관리」→「위험 관리」 · 「📊 RISK 세부내용」→「📊 위험 세부내용」(같은 이름을 가리키는 「📊 RISK 관리로 이동」 버튼 · 안내 문장도 함께). 기능 · 계산 · id 무변경. 이 4개 외 앱 전체 명칭 개편은 하지 않는다 |
| **TXT-46-3** 근거 설명 쉬운 말 | 수익률 근거 ⓘ(js/05 `CMA_SOURCE_METADATA`)의 "horizon mismatch" → "기준 기간이 달라 비교에 주의가 필요", "출처 불명" → "출처를 확인할 수 없음" 등 이번에 확인된 표현만. 불확실성 · 한계는 숨기지 않는다 |
| **CLN-46-1** 정리 | "AI 최적 추천" 옛 주석 · 화면에 없는 `monteCarloDesc` 문구 · 참조 없는 `RISK_METRIC_LABELS` · 현재 동작과 다른 옛 주석(js/09 "결측 처리(50)") · 테스트 제목 "[알려진 mismatch, Phase 40 정비 예정]"(Risk 경로는 §40 P-4에서 해결됨). **js/21 `assessDataSufficiency` · `assessCorrelationPair`는 앱에서 호출하지 않아도 unit 테스트 계약이므로 삭제하지 않는다** |

**46-4. 검증 기준** — Unit · 전체 E2E · ESLint · Data Guard · Release Guard · 375/1440px · Risk fixture 불변(2026-09-11 · 254 · 19.6615 · -1.7207 · -2.1546 · -10.1092 · 1.2130 · 0.8662 · 1.1117 · 69) · MC 계산 파일(js/15~19 · 26 · 27 · data/cma) 무변경 + 기존 MC E2E · 참고 비중 20개 상태(REF 전 항목) · 매크로 직접 검색 6종(^TNX · KRW=X · ^KS11 · ^VIX · GC=F · DX-Y.NYB) · 환율 실패 안내 문구. 버전은 전체 통과 후 v260 → v261 한 번만 올린다.

**46-5. 검증 중 발견 · 처리(앱 동작 무변경 · 테스트만)**
- `e2e/89` S-10: E2E는 외부 호출이 막혀 부팅 때마다 시세 · 환율 실패 토스트(8~9초)가 쌓인다. TXT-46-1로 환율 안내가 길어지자 토스트 높이가 [클라우드 데이터 받기] 버튼을 덮어 클릭이 미뤄졌고, 그 사이 자동 동기화가 먼저 돌아 검증 순간이 지나갔다(v260 문구 점검 때 "원인 미확인"으로 보류했던 의존성의 실제 원인). 테스트가 누르기 직전 무관한 토스트만 지우도록 고쳤다 - 동기화 판단 검증은 그대로.
- `e2e/29` #12: 팝업 열림 애니메이션 도중 크기를 재 43.99px로 간헐 실패 - 애니메이션이 끝난 뒤 재도록 고쳤다(기준 44px 그대로).
- 추가 발견(범위 밖 · 미구현): 화면 아래 고정 토스트(z-9999)가 열린 팝업의 아래쪽 버튼을 최대 8~9초 가릴 수 있다(기존 배치). 별도 PM 판단 대상.


## 47. v262 Closeout — PM Solution Closure 승인 반영 (PM EXECUTION DIRECTIVE 2026-09-20 · 승인 7건)

> PM이 `docs/closeout/research/PM_SOLUTION_CLOSURE.md`의 해결안을 검토해 **BOND-1 · BOND-2 · BOND-4 · BOND-5 · C-1 · D-11 = APPROVED**,
> **D-5 = APPROVED WITH CONSTRAINT** 로 확정했다. 이 절은 그 결정으로 바뀌는 SoT를 기록한다.
> 기존 §7 · §9 · §37 · §44의 원문은 삭제하지 않는다 — 이 절이 해당 조항을 **개정**한다(개정 전 문구는 역사로 보존).

### 47-1. §7-1 Risk 대상 — Equity Risk와 Bond Risk 분리 (BOND-2 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT** | 위험 진단 대상 = `RISK_ELIGIBLE_CATEGORIES = ['주식','ETF']`(js/09). 직접채권(카테고리 '채권')은 진단 자체에서 빠져 금리위험이 보이지 않았다 |
| **PROBLEM** | 채권 보유자는 자기 포트폴리오의 가장 큰 위험(금리)을 앱에서 볼 수 없다 |
| **DECISION** | Bond Risk를 **기존 주식 Risk Score와 분리된 별도 층**으로 제공한다. 6-factor 위험점수의 산식 · 가중치 · 대상(주식 · ETF)은 **변경하지 않는다**. 직접채권과 채권 ETF를 같은 Beta 모델로 처리하지 않는다 — 직접채권은 듀레이션/금리민감도, 채권 ETF는 기존 가격시계열 Risk |
| **IMPLEMENTATION** | `RISK_ELIGIBLE_CATEGORIES` 는 그대로 둔다(주식 점수 보존). 별도 함수 `computeBondRiskSummary()`가 카테고리 '채권' 보유를 읽어 채권 위험 카드를 만든다 |
| **IMPACT** | 위험 화면에 채권 카드 추가. 기존 위험점수 · 등급 · 지표 무변경 |
| **REGRESSION** | Risk fixture 전후 동일(§46-4 고정값) · 채권 카드 신규 테스트 |
| **ROLLBACK** | 채권 카드 호출부 제거(기존 경로 무변경이므로 즉시 복귀) |

### 47-2. §44 제10조 개정 — Portfolio Beta는 주식 노출만 집계 + Coverage 표시 (BOND-5 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT** | 대상 종목 중 하나라도 베타가 없으면 `portfolioBeta = null`(전부-또는-무) |
| **PROBLEM** | 베타를 못 구하는 종목이 하나만 있어도 시장위험 지표 전체가 사라진다. 채권을 진단에 넣으면 이 문제가 상시화된다 |
| **DECISION** | ① Portfolio Beta는 **주식 노출(주식 · ETF)만** 집계한다 — 채권은 분자 · 분모 어디에도 넣지 않는다(0 대입 금지). ② 베타를 구한 종목만으로 가중평균하고 **Equity Beta Coverage(%)** 를 함께 표시한다. ③ Coverage가 `BETA_COVERAGE_MIN`(50%) 미만이면 값을 표시하지 않고 사유를 쓴다. ④ 전부-또는-무 정책은 **주식 베타 집계 영역에 한정**해 폐지하고, 다른 지표에는 적용하지 않는다 |
| **IMPLEMENTATION** | js/09 `computeBetaAggregate(holdings)` 신설 — `{ beta, coverage, missingCount }`. 본 엔진 · 시나리오 엔진이 같은 함수를 쓴다. js/10이 "베타 92% · 채권 18% 제외"를 함께 표시 |
| **IMPACT** | 기존에 null이던 포트폴리오 베타가 값으로 나타난다 → 6-factor 중 **market 요인이 다시 점수에 참여**한다(산식은 무변경, 입력이 생긴 것). 위험점수가 변할 수 있다 |
| **REGRESSION** | Risk 전후 측정 필수(§46-4 fixture 값 갱신 사유를 기록) |
| **ROLLBACK** | `computeBetaAggregate`의 임계값을 101%로 두면 기존 동작(사실상 전부-또는-무)으로 복귀 |

### 47-3. §7 채권 σ=0 · §37 개정 — Bond MC 자산군 연결 (BOND-4 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT** | js/16 `riskFree = … || appClass === BOND || appClass === CASH` → 채권 σ=0. `app-asset-class-map.json`의 BOND는 unmapped("Bond Domain은 BACKLOG") |
| **PROBLEM** | σ=0은 "위험이 없다"는 뜻이 되어 사실과 다르다. 원인은 데이터 부재가 아니라 **매핑 부재**였다 — `data/cma/datasets/JPM-LTCMA-2026-KRW.json`(이미 저장소에 있음)에 Korean Government Bonds(ER 3.0 / σ 5.357) · Korean Corporate Bonds(3.5 / 2.540) 등이 있다 |
| **DECISION** | ① 채권 자산 성격을 `KR_GOV_BOND` · `KR_CORP_BOND` · `FOREIGN_BOND_HEDGED` · `FOREIGN_BOND_UNHEDGED` 로 세분하고, 매핑 가능한 성격은 **JPM-LTCMA-2026-KRW를 μ/σ 근거(risk provider)로** 쓴다. ② **현금(CASH)은 채권으로 취급하지 않는다** — 기존 σ=0 정책 유지. ③ 매핑되지 않는 채권은 **σ=0으로 계산하지 않고 MC 대상에서 제외**하고 그 사실을 사용자에게 표시한다. ④ 외화채는 hedged / unhedged 를 분리해 관리하고, **환헤지가 A등급으로 확인되지 않으면 헤지 자산군을 쓰지 않는다**(비헤지로도 단정하지 않고 미연결 → MC 제외). ⑤ FX 모델이 없는 상태에서 외화채를 원화 채권과 동일 취급하지 않는다 |
| **IMPLEMENTATION** | `app-asset-class-map.json` appClasses에 4종 추가(각 항목에 `riskProvider: "J.P. Morgan Asset Management"` 명시) · js/27 `resolveCmaRiskForAppClass`가 appClass별 riskProvider를 우선 조회 · js/16이 BOND 계열을 riskFree에서 빼고, 미매핑 채권은 `excludedFromMc` 로 분리 · MC_CMA_RETURN_POLICY(μ = Return Key)는 **변경 없음** |
| **IMPACT** | 채권을 보유한 포트폴리오의 MC 분포가 바뀐다(σ>0). μ는 바뀌지 않는다 |
| **REGRESSION** | 동일 seed 3단계 측정(BASE → CMA Q2 → Bond 매핑) · 원장 49건 MC invariant 별도 검증 |
| **ROLLBACK** | app-asset-class-map.json의 4개 appClass를 unmapped로 되돌리면 즉시 복귀(데이터 파일만) |

### 47-4. §37 CMA — 2026Q2 활성화 (C-1 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT** | ACTIVE primary = AGI-LTCMA-2026Q1-USD(기준일 2025-12-31) |
| **PROBLEM** | 더 최신 공식 발행물(2026Q2 · 기준일 2026-03-31)이 VERIFIED 상태로 대기 중이었다 |
| **DECISION** | AGI-LTCMA-2026Q2-USD 를 PRIMARY로 활성화한다. **μ는 Return Key에서 오므로 CMA 교체로 변하지 않는다**(§37-5 유지) — 반영되는 것은 σ와 상관이다 |
| **IMPLEMENTATION** | `node scripts/cma-update.js approve` → `activate --primary AGI-LTCMA-2026Q2-USD --benchmark JPM-LTCMA-2026-KRW` (js/26-cma-data.js 재생성) |
| **IMPACT** | 측정값(동일 seed 20260101 · 2,000회 · 20년 · 원장 49건): P10 −1.97% · P50 +1.52% · P90 +4.77% · mean +3.84% · μ 불변 |
| **REGRESSION** | BOND-4와 **같은 단계에서 섞지 않는다** — STEP 1(Q2)과 STEP 2(Bond 매핑)를 각각 측정한다 |
| **ROLLBACK** | `activate --primary AGI-LTCMA-2026Q1-USD` 로 되돌린다(이력은 active.json history에 남는다) |

### 47-5. §44 제10조 · D-06 개정 — HOME_COMMON_RULE v2 (D-11 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT (v1)** | 증권 종류 표기가 "common stock"인 경우만 HOME_COMMON |
| **PROBLEM** | 같은 발행인이 의결권만 다르게 발행한 지분증권(예: Alphabet Class C Capital Stock)이 명칭 때문에 보류됐다. 규칙의 목적은 "외국 발행인 · 예탁증권을 국내 대표지수와 비교하지 않는 것"이지 명칭 대조가 아니다 |
| **DECISION (v2)** | ① 발행인이 미국 주에 설립되고 ② 연차보고서가 10-K이며 ③ 해당 종목이 그 발행인의 **본국 발행 지분증권**(보통주 및 의결권만 다른 동일 지분권)이고 ④ **ADR/ADS · 우선주 · ETF가 아니면** HOME_COMMON. **거래소 상장 사실만으로는 절대 추론하지 않는다.** 불명확 · 충돌은 REVIEW/UNRESOLVED |
| **IMPLEMENTATION** | js/28 GOOG에 `equityListing: 'HOME_COMMON' · evidenceGrade: 'A'` + 근거 기록, `HOME_COMMON_RULE_VERSION = 'v2'` |
| **IMPACT** | 원장 영향 1건(GOOG). Benchmark 상태 분포 RESOLVED 33→34 · UNRESOLVED 15→14. 대장 검증 위반 0건 |
| **REGRESSION** | `test/integrated-benchmark-index.test.js` 상태표 갱신 · `exposure-master-activation.test.js` |
| **ROLLBACK** | GOOG 항목의 equityListing 제거(v1 동작) |

### 47-6. §44 제10조 — KOSPI200 계열 Benchmark (D-5 APPROVED WITH CONSTRAINT)

| 구분 | 내용 |
|---|---|
| **DECISION** | ① **ETF 자기 자신을 proxy benchmark로 쓰지 않는다**(self-proxy beta=1 방식 폐기 · 금지 규칙으로 고정). ② 사용자가 Benchmark · Return Key를 명시 지정하면 그 기준을 쓴다. ③ 공식 KOSPI200 PR/TR 시계열이 확보되면 Index Master의 공식 benchmark로 연결할 수 있도록 **구조를 유지**한다. ④ 공식 원천이 없는 현재는 069500 · 102110 · 278530을 **"Benchmark 정의는 확인 · 가격원천 없음(SOURCE_UNAVAILABLE)"** 상태로 정확히 유지한다 |
| **상태** | **SOLVED WITH CONSTRAINT** — 공식 데이터 원천 확보 전까지 베타 계산 불가. 추가 조사는 하지 않는다 |
| **REGRESSION** | self-proxy 금지 테스트 신설(Index Master 어떤 항목도 sourceId가 자기 ETF 티커가 아님) |

### 47-7. Bond Domain V1 구현 범위 (BOND-1 APPROVED)

| 구분 | 내용 |
|---|---|
| **DECISION (BOND-1)** | 채권 성과는 **확정 계층(기본)** 과 **평가 계층(보조)** 으로 나눈다. 기본 표시 · 관리의 중심은 확정 계층이다. 평가 계층은 시장가치가 확보된 경우에만 별도로 표시하고, **시장가격이 없다는 이유로 확정값을 평가값으로 대체하지 않는다** |
| **확정 계층** | 매입금액 · 수령/예정 쿠폰 · 만기 상환금액 · 매입 시 YTM · 잔존기간 · 다음 이자일 (시세 불필요) |
| **평가 계층** | 평가금액 · 평가손익 · Current Yield · 현재가 YTM (그 날 시세가 있을 때만) |
| **구현 범위 V1** | ① Bond Ledger(공식 Terms / 사용자 보유 분리 · 기존 자산 migration 없음) ② ISIN 조회 어댑터(6상태) ③ 현금흐름 · 경과이자 · 수익률 8종 ④ 기존 자산 입력 폼 확장(신규 화면 없음 · 375px) ⑤ 듀레이션 모형(표시는 "모형값") |
| **금지** | 신용 스프레드 데이터가 없는 상태에서 credit risk 수치를 만들지 않는다 · 사용자 매입가/수량/매입일을 API 결과로 덮어쓰지 않는다 · 서비스키를 소스 · 로그에 남기지 않는다 |
| **라이선스 (BOND-6)** | 제2유형(기본정보 · 권리일정 · 발행정보) = 저장 · 가공 가능(출처표시 · 비상업). 제4유형(시세) = 저장 · 재배포 없이 화면 표시에만 사용 |

### 47-8. B-1 KIS Proxy Worker 보안 (SOLVED · EXTERNAL ACTION 포함)

| 항목 | 개정 전 | 개정 후 |
|---|---|---|
| CORS | `Access-Control-Allow-Origin: '*'` | Origin 허용목록만 반사 + `Vary: Origin` |
| 인증 | `CLIENT_SHARED_SECRET` 미등록 시 검사 생략(fail-open) | **fail-closed** — 미등록이면 503, 불일치면 401 |
| 요청 제한 | 없음 | KV 카운터(분 30 · 일 300 초과 시 429) |
| 오류 | 상류 본문 전달 가능 | 상태코드 · 일반 메시지만 |
| 제약 | — | 공개 PWA의 `X-App-Secret`은 본질적으로 공개값 → 실질 방어선은 **Origin 허용목록 + rate limit** |

**EXTERNAL ACTION REQUIRED** — Cloudflare Dashboard에서 변수 등록 · 비밀값 회전 · 재배포는 사용자 작업이다(절차는 PM_SOLUTION_CLOSURE.md §9). 이 저장소는 코드만 수정한다.

### 47-9. §47-3 정정 — "MC 대상에서 제외"의 정확한 뜻 (BOND-4 재검토 · A/B 측정 후 확정)

PM 원지시는 "매핑 불가능한 Bond는 MC 대상에서 제외한다"였다. 두 해석을 **같은 조건에서 실제로 재고**
비교한 뒤(주식 70% + 미분류 채권 30% + 절세계좌 채권 400만원 · seed 20260101 · 2,000회 · 20년) 확정한다.

| 항목 | 안 A (universe에서 제거) | 안 B (원금 유지 · 위험 미반영) |
|---|---|---|
| instrument 수 | 1 | 3 |
| weight 합계 | 0.70 | 1.00 |
| 절세계좌 초기잔고 | **0원** (400만원 사라짐) | 4,000,000원 |
| 초기 배분 | 주식 **100%** (채권 30%가 주식으로 흡수) | 주식 70% · 채권 30% |
| P10 | 2.8738억 | 3.8754억 |
| P50 | 9.9711억 | 9.3971억 |
| P90 | 39.2887억 | 26.1913억 |
| 평균 | 18.2915억 | 13.3593억 |

**판정: 안 B (APPROVED).** 근거는 세 가지다.
① 안 A는 엔진이 남은 비중을 재정규화하므로(js/15 normalizeWeights) **채권 30%가 주식 100%로 바뀐다** —
   위험을 0으로 두는 것보다 더 큰 왜곡이다(P90 +50% · 평균 +37%).
② 안 A는 절세계좌 채권 **원금 400만원을 미래예측에서 지운다** — 사용자 자산이 조용히 사라진다.
③ 이 프로젝트의 목적은 "계산 결과의 정직성"과 "자산이 조용히 사라지지 않는 것"이다. 안 B는 위험을
   만들어내지 않으면서(σ 미적용) 그 사실을 WARNING으로 **말한다** — 예전의 조용한 σ=0과 다른 점이 이것이다.

따라서 §47-3의 "MC 대상에서 제외"는 **위험 시뮬레이션에서 제외**를 뜻하며, 자산·원금·적립·리밸런싱에서
제외한다는 뜻이 아니다. 화면은 "이 채권은 위험 시뮬레이션에서 빠졌습니다(원금은 그대로 반영됩니다)"로
말한다. **ROLLBACK**: 안 A로 바꾸려면 js/16에서 해당 항목을 cmaEntries에 넣지 않으면 되지만, 그때는
위 ①②를 함께 표시해야 한다.

### 47-10. §44 제7조 이행 — Risk 지표별 관측기간 (C-3 APPROVED)

| 구분 | 내용 |
|---|---|
| **CURRENT** | 가격 조회가 `range='1y'` 하나뿐이라 제7조가 정한 목표 관측 수(기술 250 · 변동성/베타/상관 500 · VaR/CVaR/MDD 750)를 **구조적으로 채울 수 없었다** |
| **PROBLEM** | 1년 창은 꼬리 위험을 과소평가한다. 실측: AAPL MDD 1년 −13.8% vs 3년 −33.4%, SPYM −9.1% vs −19.0%. 변동성도 창에 따라 중앙값 21%p 움직인다 |
| **DECISION** | 조회를 3년으로 늘리고 **지표마다 필요한 만큼만 잘라 쓴다** — 기술 1년 · 변동성/베타/상관 2년 · VaR/CVaR/MDD 3년. 전 지표를 한 기간으로 묶지 않는다 |
| **근거(실측)** | Yahoo는 range=3y에서도 일별 간격을 유지한다(국내 730행 · 미국 753행 · 중앙 간격 1일). range=max처럼 월별로 솎이지 않는다. 기록: `docs/closeout/research/risk-observation-window.json` |
| **IMPLEMENTATION** | js/09 `RISK_OBSERVATION_WINDOWS` + `sliceRecentObservations`. 본 엔진과 시나리오(What-If) 엔진이 같은 창 규칙을 쓴다. 관측 수 표시도 그 창의 실제 개수로 바뀐다 |
| **IMPACT** | 위험점수 · 변동성 · 베타 · VaR · CVaR · MDD · 상관이 모두 바뀔 수 있다. **MC는 영향 없다**(σ는 CMA에서 온다 · §37). 저장소 사용량도 영향 없다(가격 이력은 메모리 캐시) |
| **REGRESSION** | `test/risk-observation-windows.test.js` 5건이 창 규칙을 고정한다(2년 창 밖 급락이 MDD에만 반영되는지 포함) |
| **ROLLBACK** | `RISK_OBSERVATION_WINDOWS`를 전부 250으로 두고 fetch 기본값을 '1y'로 되돌리면 이전 동작이다 |

### 47-11. §44 제6조 6-2 · 6-3 — MC 환율 처리 (C-2 NO_CHANGE · 사실 명문화)

조사 결과 **"모형이 없다"보다 정확한 사실은 "통화 기준이 섞여 있다"** 였다.

| 자산군 | 현재 쓰는 값(AllianzGI · USD 기준) | 같은 자산군의 원화 기준 값(J.P. Morgan KRW) | 차이 |
|---|---|---|---|
| 국내 주식 | σ 29.4% | σ 19.36% | −10.04%p |
| 미국 주식 | σ 16.6% | σ 13.72% | −2.88%p |
| 신흥국 주식 | σ 24.4% | σ 14.47% | −9.93%p |

즉 원화 투자자에게 **환위험이 없는 국내 주식에 USD 환산 변동성을 쓰고 있다.**

**판정: 이번 릴리스는 변경하지 않는다(NO_CHANGE).** 이유는 "근거가 없어서"가 아니다 —
① 해결책(PRIMARY 교체 또는 자산군별 통화 기준 통일)은 §37의 PM 결정(AllianzGI PRIMARY)을 뒤집는 일이고,
② 이번 릴리스에 이미 C-3(위험 지표 전면)과 BOND-4(채권 σ)라는 대규모 계산 변경이 두 건 들어 있다.
세 번째를 겹치면 무엇이 무엇을 움직였는지 사용자도 우리도 말할 수 없다(변경 격리 원칙).

**명문화(이번에 확정)** — `hedge cost = 0`은 **정책이 아니라 모형 없음**이다. 현재 MC는 외화자산을
오늘 환율로 원화 환산하되 환율 변동을 별도 위험요인으로 모형화하지 않으며, 변동성은 USD 기준 값을 쓴다.
이 사실은 화면(장기 가정 안내의 "달러(USD) 기준" 문구 · CMA 근거 설명)에 이미 표시돼 있다.
**다음 단계(별도 승인 필요)**: 자산군별 통화 기준을 원화로 통일하고 동일 seed 전후를 측정한다.

### 47-12. 그 밖의 종결 판정 (표시 · 코드 · 저장소)

| ID | 판정 | 내용 |
|---|---|---|
| F-1 | APPROVED | 베타를 못 구한 종목의 **사유를 종목별로** 표시(기준 지수 미확정 / 지수 가격 자료 없음 / 공통 거래일 부족 / 자료 오래됨 …). 계산 무변경 |
| F-2 | APPROVED | 비동기 Dimson 베타(시차 0+1) 정의를 베타 툴팁 한 문장으로 설명. 계산 무변경 |
| F-3 | APPROVED | 팝업이 열려 있는 동안 토스트를 화면 위쪽으로 옮긴다(`body.modal-open`). 표시 시간 · z-index · 문구는 그대로 |
| F-5 | APPROVED | 기준 지수의 PR/TR이 확인되지 않은 종목을 화면에 밝힌다(원장의 UNCONFIRMED를 그대로 읽는다) |
| F-7 | APPROVED | 음수 위험 기여도를 0으로 깎지 않는다. 자르지 않아야 기여도 합이 100%로 맞고(정의상 포트폴리오 베타=1), 위험을 낮춘 종목이 "0%"로 감춰지지 않는다 |
| G-1 | APPROVED | 종목 분석 모달의 구형 근사 경로(`getBenchmarkKeyForTicker` · 티커 접미사 + 손으로 고른 집합 + S&P500 fallback)를 제거하고 §44 제10조 경로로 통일. **화면에 쓰이던 값이 아니어서 사용자 영향 0** |
| G-3 | APPROVED | 엑셀을 고치지 않고 다시 올렸을 때 `categorySource`가 system → user로 승격되던 것을 막는다(값이 기존과 같고 기존이 user가 아니면 유지). 가짜 확정을 만들지 않는 쪽을 택했다 |
| G-4 | NO_CHANGE | 이미 해결돼 있다 — 기록 없는 날은 `recorded:false → total:null` + `spanGaps:false`로 선을 끊는다(js/11). 0으로 그리는 경로 없음 |
| G-5 | EXTERNAL | Worker가 영문 혼합 코드를 `ticker_format_unsupported`로 구분해 답한다(사실과 다른 "코드 오류" 안내 제거). **허용 범위는 넓히지 않았다** — KIS가 이 형식을 받는지 확인되지 않았다 |
| Q-1 | APPROVED | 저장 실패 시 재생성 가능한 캐시(종목 마스터)를 비우고 한 번 재시도, 그래도 실패하면 사용자에게 알린다. 실측: localStorage 2,638KB 중 마스터가 2,635KB(99.9%) · Chromium은 여유 20MB+. **저장 구조 · 키 · 데이터 의미 무변경** |
| Q-2 | NO_CHANGE | 실측: 스냅샷 1건 393B · 연 140KB · 10년 1.4MB. 사용자 기록이라 보존이 기본이고, 실제 압력은 마스터 캐시였다(Q-1으로 흡수) |
| Q-3 | NO_CHANGE | 죽은 경로가 아님을 확인(위험 상세의 action items가 실제로 호출) |
| Q-4 | NO_CHANGE | 계획 확인 안내 비표시는 v254 PM 결정(§41)이고 코드는 보존돼 있다 — 그 결정을 유지한다 |
| M-1 | APPROVED | 코드 변경 없이 **동작을 테스트로 확정**: 같은 id에 서로 다른 positionSource가 있으면 최신 편집(updatedAt)이 이긴다. 새 규칙을 만들 필요가 없음을 확인 |
| M-2 | 분할 | F-7만 APPROVED(위). 나머지(T4 중복 · C-15 Macro 민감도 · D-6 상관 가이드 중복 · S-40 What-If 프리셋 이름 · 375px VIX 라벨 · HTML 주석 옛 용어)는 **NO_CHANGE** — 사용자 화면 문구·배치를 넓게 바꾸는 일이라 §46 TXT 규칙("이 4개 외 명칭 개편 없음")과 충돌하고, 화면에 보이지 않는 주석은 사용자 영향이 없다 |
| M-3 | NO_CHANGE | 같은 이유(§46 TXT 규칙 보존) |
| P-5 | APPROVED | 규칙 버전 기록 구조 완성 — `equityListingRuleVersionOf` · `listEntriesJudgedUnderOlderRule`. v1로 판정했던 19건을 v2 기준으로 재확인(같은 근거로 성립)해 **현재 옛 규칙 항목 0건** |
| C-4 | NO_CHANGE | Backtest Gate는 §50 릴리스 게이트가 요구하지 않는다. 회귀 검증 목적은 기존 수단(regression-harness · measure-mc 동일 seed 3단계)으로 이미 충족된다. 모델 선택(GBM vs Bootstrap) 체계는 이 프로젝트의 종결 대상이 아니다 |

### 47-13. 미래예측 카드의 계좌 기준 확인 (통합 검증 · 불일치 없음)

화면 문구 "현재 자산 · 매달 투자는 일반계좌 기준이며…"를 실제 계산과 대조했다.

| 표시 | 계산 경로 | 실제 범위 | 일치 |
|---|---|---|---|
| 현재 자산 | `renderProjectionHeroSummary` → `presetResults.normal.yearlyPoints[0].total` → `getProjectionGroupStats` | 일반계좌만(절세계좌 · 부동산 제외 — js/05:481) | ✔ |
| 매달 투자 | `getHouseholdMonthlyContributionTotal` → `projection.monthlyContributionByOwner` | 일반계좌 적립 계획(절세계좌는 `taxAdvantagedPlan`로 분리) | ✔ |
| 20년 후 값 | `totalScenarioData` | 일반계좌 · 절세계좌 · 합계를 **나눠서** 표시 | ✔ |

**결론: 문구와 로직이 일치한다.** v248-1 REQ-09에서 "(일반계좌 기준)"의 적용 범위를 현재 자산 · 매달
투자로 좁힌 조치가 유효하다. 문구만 보고 계산을 고치지 않았고, 계산을 보고 문구를 고칠 필요도 없었다.

---

## 48. 데이터 업데이트 거버넌스 — 종목 마스터 Diff Gate · 잔여 결정 확정 (PM FINAL IMPLEMENTATION DIRECTIVE 2026-09-20 · D-1 ~ D-4)

> 배경: 2026-09-20 전수 감사에서 **사용자 입력 없이 자동으로 바뀌면서 계산 결과까지 바꿀 수 있는 기준
> 데이터는 종목 마스터와 H.10 환율 둘뿐**임을 확인했다. H.10은 스크립트에 회귀 가드 5종(시작일 불변 ·
> 끝일 역행 금지 · 유효 행 감소 금지 · 값 범위 · 임시 파일 재검증)이 이미 있고 바꾸는 것이 "값"이다.
> 종목 마스터는 바꾸는 것이 **"판정"**(어느 지수와 비교할지)인데 변경 검토 장치가 없었다. 이 절이 그 빈자리를 메운다.

### 48-1. 종목 마스터 Diff Gate (D-1 확정)

**적용 범위**: `data/ticker-master.json` 자동 갱신 한 곳뿐이다. Exposure Master · Index Master ·
HOME_COMMON · ETF Holdings · Sector Map에는 자동화를 추가하지 않는다(전부 수동 · PM 승인 유지).

**흐름**: 다운로드 → 파싱 → 기존 구조 검증 → **임시 파일에 기록** → Diff → 임계값 판정 →
정상이면 운영 파일로 교체 후 커밋 / 이상이면 **교체하지 않고 STOP** → 감사 기록 → 사람 확인 → 재실행.

| 구분 | 대상 | STOP 조건 |
|---|---|---|
| 절대 건수 | 신규 | **1,000건 이상** |
| 절대 건수 | 삭제 | **500건 이상** |
| 절대 건수 | 거래소 변경 | **10건 이상** |
| 절대 건수 | 이름 변경 | **1,000건 이상** |
| 비율(기준 = 기존 마스터 건수) | 신규 **또는** 삭제 | **5% 이상** |
| 비율 | 이름 변경 | **10% 이상** |
| 무조건 | 국내 **KOSPI ↔ KOSDAQ** 이동 | **1건이라도** |
| 무조건 | 핵심 종목(Exposure Master 58건)의 Benchmark 판정 영향(삭제 · 거래소 변경 · 펀드형 판정 변화) | **1건이라도** |
| 무조건 | 국내 종목 이름 변경으로 `looksLikeFundName` 판정이 뒤집힌 경우 | **1건이라도** |

**감시 대상의 근거**

- 미국 거래소 간 이동(NASDAQ ↔ NYSE ↔ AMEX)은 D-06에 따라 어차피 UNRESOLVED라 계산에 닿지 않는다 →
  세어서 기록만 하고 무조건 STOP 대상으로 두지 않는다(절대 건수 10건 임계값에는 포함된다).
- 종목명은 `resolveRiskBenchmark`가 `looksLikeFundName(자산명 + 마스터 nameKr + nameEn)`으로 읽는다 →
  이름만 바뀌어도 Benchmark가 사라지거나 생길 수 있다. 다만 영문 → 한글 음차 같은 정상 개명은
  판정을 바꾸지 않으므로, **판정이 실제로 뒤집힌 건만** 무조건 STOP으로 본다.
- 핵심 종목은 **Exposure Master 58건**으로 고정한다. 사용자의 실제 보유 종목은 기준으로 쓰지 않는다
  (앱이 서버에 보유 정보를 두지 않으므로 워크플로가 알 수 없고, 알아서도 안 된다).

**정상 이전과 공급자 오류의 구분**: 하지 않는다. 시스템은 이상 징후를 탐지해 멈출 뿐이고, 어느 쪽인지는
사람이 판단한다. 의미론적 추측을 넣지 않는다(오탐 · 미탐은 임계값의 결과로만 발생한다).

**STOP 시점**: 다운로드 · 파싱 · 기존 구조 검증 · Diff가 끝난 뒤, **운영 파일 교체와 커밋 이전**이다.
따라서 이상 데이터는 저장소에 반영되지 않는다.

**STOP 이후(승인 · RESUME)**: 감사 기록을 PM이 확인한다. 강제 통과 플래그는 만들지 않는다.
원인이 해소되면(공급자 데이터 정정 등) 같은 워크플로를 `workflow_dispatch`로 다시 실행한다.
변경이 정당한 대규모 변경이어서 그대로 반영해야 한다면, 사람이 직접 마스터를 커밋한 뒤 재실행한다.
재실행 시 변경이 없으면 커밋하지 않는다(중복 커밋 방지 — 기존 `git diff --quiet` 규칙 그대로).

**감사 기록**: `docs/closeout/ticker-master-audit.json`(저장소 파일 · Git 이력으로 장기 보존).
실행 시각 · 실행 URL · 기존/신규 식별정보와 건수 · 신규 · 삭제 · 거래소 변경 · 이름 변경 ·
국내 이름 변경 · 국내 시장 이동 · 펀드형 판정 변화 · 핵심 종목 영향 · 임계값별 판정 결과 ·
STOP/APPLY · 샘플을 남긴다. 각 항목에 `auditId`(`TMG-<UTC시각>-<지문>`)가 붙고, 커밋 메시지에
그 ID가 들어가 대장 · 커밋과 연결된다. GitHub Actions 실행 로그도 증거로 함께 쓴다.
별도 DB · 관리 시스템 · 알림 · 관리자 UI는 만들지 않는다.

**Rollback**: Git revert를 공식 수단으로 한다. **클라이언트 `localStorage` 캐시(최대 20일) 제약은
그대로 남는다** — 이번 범위에서 캐시 강제 무효화 기능을 만들지 않기로 PM이 확정했다.

**구현 위치**: `scripts/ticker-master-diff-gate.js`(판정) · `scripts/update-ticker-master.js`의
`TICKER_MASTER_OUT` 출력 경로 오버라이드(수집 · 파싱 로직 무변경) ·
`.github/workflows/update-ticker-master.yml`(임시 파일 생성 → 게이트 → 조건부 커밋).
판정 함수는 앱 코드를 그대로 빌려 쓴다(`looksLikeFundName` · `RISK_BENCHMARK_BY_LISTING_EXCHANGE`) —
키워드 목록을 복사하지 않는다. 검증: `test/ticker-master-diff-gate.test.js`.

**이 게이트가 바꾸지 않는 것**: 종목 마스터의 계산 영향 · Risk Benchmark 정책 · Exposure Master ·
MC 모델 · Risk Score · 캐시 정책.

**실측 근거(임계값 설정의 기준이 된 실제 변경 분포)** — git 이력의 마스터 3개 버전을 직접 비교했다.

| 구간 | 총건수 | 신규 | 삭제 | 거래소 | 이름 | 총변경률 | 국내 이름변경 | KOSPI↔KOSDAQ | 판정 뒤집힘 |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-27 → 09-01 | 16,312 → 16,309 | 30 | 33 | 1(미국) | 540 | 3.70% | 1 | 0 | 0 |
| 2026-09-01 → 09-08 | 16,309 → 16,305 | 21 | 25 | 1(미국) | 22 | 0.42% | 1 | 0 | 0 |
| 2026-09-08 → v262(수동 재생성) | 16,305 → 16,731 | 447 | 21 | 2(미국) | 243 | 4.37% | 4 | 0 | 0 |

세 구간 모두 위 임계값에서 **APPLY**로 판정된다(오탐 0건).

### 48-2. 거래 엑셀 이후 legacy 재계산 — 확정 (D-2 · §17-2 B-7 종결)

**확정 정책**: 사용자가 **거래 엑셀을 명시적으로 가져오거나 거래내역을 직접 저장 · 삭제한 경우**,
거래 원장을 기준으로 **legacy 자산**(`positionSource`가 없는 자산)의 수량 · 매입단가를 재계산한다.
자동 동기화 경로(부팅 재계산 `js/14` · 클라우드 병합 `js/12`)는 예전 그대로 legacy를 보호한다
(`syncAssetsFromTransactions({ auto: true })` → S-1 D-3 가드).
`positionSource === 'manual'` 자산은 **모든 경로에서** 보호된다(BL-8 · BL-12, 변경 없음).

근거: 자동 배경 동기화는 사용자의 의사 표시가 아니지만, 거래 원장을 직접 올리거나 고치는 행위는
"이 원장을 기준으로 삼겠다"는 명시적 의사 표시다. 두 경우를 같은 규칙으로 다루면 한쪽은 반드시 틀린다.
§17-2의 "의도된 SoT일 가능성"이라는 잠정 표현은 이 조항으로 **확정**된다.
새 transaction/asset 모델은 만들지 않는다.

### 48-3. 일별 스냅샷 보존 — 제약과 함께 종결 (D-3 · 대장 Q-2)

Q-2는 **SOLVED_WITH_CONSTRAINT**다. 스냅샷 보존 상한 기능은 **없다**(자동 삭제 경로 0건 · 삭제는
사용자 조작 한 곳뿐). 실측 증가량은 연 약 140KB이고, 저장 실패 위험은 Q-1의 복원력
(`setLocalStorageItemSafely`)이 흡수한다. 이번 범위에서 자동 retention · 삭제 기능을 추가하지 않는다.

### 48-4. FX-P1 · UX-P1 — 정의되지 않은 로드맵 단계로 종결 (D-4)

FX-P1과 UX-P1은 저장소 어디에도 **요구사항 · 범위 · 완료 조건이 기록돼 있지 않다**
(작업 순서 목록과 DEFERRED 분류로만 등장한다). 과거 범위를 추정해 복원하지 않고
**정의되지 않은 로드맵 단계로 종결**한다. 필요해지면 새 PM 지시로 범위를 정의한 뒤 시작한다.

---

## 49. 채권 프로세스 — 거래내역 기반 보유관리 (PM FINAL POLICY 2026-09-21 · BOND-01 ~ BOND-40)

> **한 문장**: 채권을 자산관리 화면에서 총액을 직접 고치는 방식에서 벗어나 **실제 거래내역으로 보유상태를
> 관리**한다. 구조는 `Bond Master → Transaction → Transaction 파생 Position → 자산관리 · Bond Risk · MC`다.
> **KIS는 Position의 원천이 아니라 기본정보 · 가격 Provider일 뿐이다.**
>
> 이 절은 PM이 2026-09-21에 확정한 채권 정책 BOND-01~40을 이 체크리스트의 조항으로 편입한 것이다
> (CLAUDE.md Governance §5 - 정책은 구현 전 또는 구현과 함께 SoT에 들어와야 한다). §47-7(Bond Domain V1)은
> 폐기되지 않는다 - 그 절이 만든 4계층 구조(A 공식 발행조건 / B 사용자 보유 / C 시장 / D 파생)는 그대로이고,
> 이 절은 **B 계층의 원천을 거래내역으로 옮기는 것**이다.

### 49-1. 원칙 (BOND-01 ~ BOND-08)

| ID | 확정 내용 |
|---|---|
| BOND-01 | **거래내역이 채권 보유의 유일한 원천(SoT)이다.** 보유수량 · 매입원가는 거래에서 계산한다. |
| BOND-02 | Bond Master(발행조건)와 Position(보유)은 서로 다른 계층이다 - 한쪽이 다른 쪽을 대신하지 않는다. |
| BOND-03 | 자산관리 · Bond Risk · Monte Carlo는 전부 **같은 Transaction 파생 Position**을 본다(계산 창구 단일화). |
| BOND-04 | 채권의 신분증은 **표준코드(ISIN, ISO 6166)** 다. 6자리 종목코드는 쓰지 않는다(조회 원천 없음). |
| BOND-05 | **ISIN은 새 필드를 만들지 않고 기존 `ticker` 필드에 저장한다.** Identity는 기존 그대로 `owner + account + ticker + currency` - 공통 Identity 로직을 바꾸지 않는다. |
| BOND-06 | **`classifyCategory()`에 ISIN 형식(`/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/`) → '채권' 예외를 넣는다.** 이게 없으면 부팅 · sync · cloud merge 때마다 채권이 ETF로 뒤집히고 Yahoo 조회를 반복한다(실측 확인). |
| BOND-07 | **quantity 단위 = 액면 1만원.** `faceAmount = quantity × 10,000`, `purchaseAmount = quantity × price`. 사용자가 액면을 따로 입력하지 않는다(중복 입력 · 불일치의 원인). KIS bond-price의 "1만원 액면 기준 단가"와 같은 체계다. |
| BOND-08 | **Bond Master의 `holding.faceAmount` · `purchaseAmount`는 거래 기반 채권에서 원천이 아니다.** legacy manual bond에서만 계속 쓰인다. |

### 49-2. Legacy 처리 (BOND-09) — 절대 규칙

기존 manual bond는 **그대로 보존한다.** 과거 거래 추정 생성 · 자동 transaction 화 · 수량 0 처리 ·
강제 전환은 **전부 금지**다. 같은 `ISIN + owner + account`로 신규 거래가 들어오면 **저장을 차단하고**
"수동관리 중"을 안내한다 - **조용한 병존을 금지**한다(거래 파생 보유분이 수동 총액을 덮어써
사용자가 적어 둔 값이 사라진 것처럼 보이기 때문). 명시적 전환 기능은 별도 정책 확정 전까지 만들지 않는다.

**반대 방향도 같은 규칙이다(2026-09-21 PM 추가 확인에서 실측으로 확정).** 이미 **거래내역으로
관리 중인** 채권을 자산 폼([최초등록])에서 같은 `ISIN + owner + account`로 또 만들려 하면 **저장을
차단한다.** 막지 않으면 채권 레코드가 둘이 되고, 둘 다 같은 원장을 가리켜 채권 위험 요약이 같은 채권을
두 번 센다(실측: count 1 → 2). 보유수량 자체는 원장이 이기므로 어긋나지 않지만 포트폴리오 수준의 채권
노출이 두 배가 된다. 구현: `js/07` assetForm submit 선두 가드. 검증: `e2e/109` #5.

### 49-3. 입력 화면 (BOND-10 ~ BOND-14 · BOND-32 · BOND-33)

| ID | 확정 내용 |
|---|---|
| BOND-10 | 계좌는 **목록에서 고르되 Account Master/ID를 만들지 않는다.** 기존 문자열을 그대로 쓰고, 기존 데이터에 실제로 존재하는 모든 `(owner, accountType)`을 목록에 포함한다. **자동 정규화 금지** (`isa`/`ISA`/`삼성증권` 등을 바꾸면 Position Identity가 깨진다). |
| BOND-11 | 거래 입력에 **자산군 선택**을 둔다(주식 · ETF · 채권 · 현금 · 부동산 · 원자재 · 암호화폐 7종. '외화'는 자산군이 아니라 통화이므로 넣지 않는다). |
| BOND-12 | **Transaction schema에 category를 추가하지 않는다.** 사용자의 자산군 선택은 UI override로만 전달해 그 거래로 만들어지는 **자산**에 반영한다(역할 · 대표매칭키와 같은 경로). 안전 전달이 불가능하면 임의 변경 말고 PM 보고. |
| BOND-13 | 자산군이 채권이면 **ISIN으로 Bond Master를 연결**한다. 이미 아는 ISIN이면 발행조건을 채워 준다(네트워크 조회가 아니라 앱에 이미 있는 값). |
| BOND-14 | 자산군에 따라 **입력 화면이 달라진다**(채권일 때만 ISIN · 만기 · 표면이율 · 지급방식 · 지급횟수 · 발행인유형 · 신용등급이 보인다). |
| BOND-32 | 자산군을 바꾸면 **그 자산군과 무관한 칸은 비운다** - 화면에서 사라진 값이 저장되는 상황을 만들지 않는다. |
| BOND-33 | 자산군과 종목코드가 어긋나면 **저장을 차단한다**(채권인데 ISIN 없음 · ISIN 형식 아님 · 채권이 아닌데 ISIN이 들어 있음). 조용히 한쪽으로 맞추지 않는다. |

### 49-4. 거래 → 보유 (BOND-15 ~ BOND-19)

| ID | 확정 내용 |
|---|---|
| BOND-15 | 거래 저장 시 **Bond Master를 upsert**한다(키 = ISIN + owner + account). 보유수량은 넣지 않는다(BOND-08). |
| BOND-16 | 매수 · **추가매수는 기존 원장 로직 그대로 가중평균**된다(재구현 금지 - 이미 정상 동작함을 실측 확인). |
| BOND-17 | **부분매도**는 수량 · 액면만 줄고 평단은 유지된다. |
| BOND-18 | **전량매도**하면 보유 0이 되고 그 채권은 계산에서 빠진다. **레코드와 거래이력은 지우지 않는다.** |
| BOND-19 | 거래 **수정 · 삭제**는 남은 거래 기준으로 전부 다시 계산된다(기존 재계산 경로 그대로). |

### 49-5. 계산 연결 (BOND-20 ~ BOND-24)

| ID | 확정 내용 |
|---|---|
| BOND-20 | **Bond Risk 가중**: MARKET / PURCHASE 2단 규칙은 **유지**하고, PURCHASE 금액의 **원천만** 거래 파생 누적 매입원가로 교체한다. Bond Risk 모델 재설계 금지. |
| BOND-21 | 자산관리 화면의 채권 평가 · 표시는 같은 Position을 쓴다. |
| BOND-22 | **Monte Carlo**는 같은 Position을 입력으로 받는다. **MC 수식 · 모델은 바꾸지 않는다**(자산 성격 매핑 BOND_CLASS → BOND_CLASS_TO_CHARACTER 그대로). |
| BOND-23 | 보유가 0인(전량매도) 채권은 **위험 · MC 집계에서 제외**한다. 등급 분포 · 통화 노출 · 듀레이션 커버리지도 같은 기준을 쓴다. |
| BOND-24 | **쿠폰 수령 회계(이자 수령을 거래로 기록)는 범위 밖**이다. 전량매도 후에는 이후 현금흐름을 만들지 않는다. |

### 49-6. 데이터 수명 (BOND-25 ~ BOND-31)

| ID | 확정 내용 |
|---|---|
| BOND-25 | Bond Master는 **historical 보존**한다 - 다 팔았다고 발행조건을 지우지 않는다. |
| BOND-26 | 값이 없으면 **0이 아니라 "없음"** 이다(§47-7 원칙 유지 - `{status:'UNAVAILABLE', reason}`). |
| BOND-27 | 공식 값(A 계층)과 사용자 수정값은 섞지 않는다(`userOverride` 분리 · §47-7 유지). |
| BOND-28 | 자동 경로는 사용자 보유정보(B 계층)를 **건드리지 않는다**. |
| BOND-29 | **Bond Master는 기기 간 동기화 대상**이다. 병합은 자산 · 거래와 같은 규칙(**id + `updatedAt` LWW**)이고, 삭제 전파를 위한 병합 기준선을 둔다(없으면 한쪽에서 지운 채권이 되살아난다). |
| BOND-30 | **Bond Master는 JSON 백업 · 복원 대상**이다. 복원은 통째 교체 + 복원 시각 stamp(BL-15와 같은 이유). 백업에 채권 키가 아예 없으면(옛 백업) 지금 값을 그대로 둔다(FIX-7 원칙). |
| BOND-31 | Bond Master 삭제 · Asset 삭제 · Transaction 삭제 · 전량매도 · 재계산 · Sync merge · Backup restore 어느 경로에서도 **ghost 레코드가 남지 않아야 한다.** 단 거래가 남아 있는 채권 레코드는 지우지 않는다(거래가 원천이므로 자산은 재계산으로 되살아나는데 발행조건만 사라진다). |

### 49-7. 단계 분리 (BOND-34) — 이 순서를 지킨다

- **1단계(KIS 없이 핵심 완성)**: 계좌 목록 · 자산군 선택 · ISIN→ticker · ISIN category 예외 ·
  채권 거래 UI · Bond Master 연결 · 거래 파생 Position · 매수/추가매수/부분매도/전량매도 ·
  수정 · 삭제 재계산 · legacy 보호 · Bond Risk · MC Position 연결 · ghost 정리 ·
  Bond Master Sync(id + `updatedAt` LWW) · 테스트. **KIS 없이도 직접입력으로 완결되어야 한다.**
- **2단계(KIS 복원)**: `/api/kis/bond-info` · `/api/kis/bond-price` 복원.
  **과거 코드(`70c49b3`)를 그대로 복사하지 않는다** - 실제 raw response 확보 → 필드 · 단위 · 날짜 검증 →
  호출량 검증 후 현재 구조에 맞게 재작성한다. 되돌린 이력(`e9b33cb`)의 원인 2가지가 미해결이기 때문이다.

### 49-8. 재작성 금지 (BOND-35 ~ BOND-38) — 이미 정상 구현 확인됨

Transaction Position 계산 · 거래 수정/삭제 재계산 · 과매도 방지(js/06) · Owner/Account Position 분리 ·
Portfolio Beta의 Bond 제외 · MC UNCLASSIFIED 처리 · 조회 실패 시 직접입력(6상태 어댑터).

### 49-9. 범위 밖 (BOND-39)

AI Provider · 새 Bond Data Provider · **6자리 채권 종목코드 조회**(원천 없음) · Account Master/ID ·
Transaction category schema · 새 Bond Risk Score · Equity Risk Score 변경 · 새 MC 모델 ·
채권 이자/배당 회계 · 세무회계 · 과거거래 추정 migration · manual bond 강제 전환 ·
신용위험 수치화 · 새 Macro 지표 · Macro→Risk 정량연계.

### 49-10. 보고 (BOND-40)

정책 충돌 시 임의 우회 금지. `[POLICY CONFLICT]` 형식(관련 정책 / 현재 코드 / 충돌 내용 / 영향 /
선택지 / PM 결정 필요사항)으로 보고한다. MC 결과 변화는 P10 · P50 · P90 · Mean · μ지문 · σ ·
Bond mapping을 baseline과 전후 비교해 기록한다(계산식 자체는 불변).

### 49-11. 1단계 구현 결과 (2026-09-21)

| 조항 | 구현 위치 |
|---|---|
| BOND-04 · 05 · 06 | `js/01` `BOND_ISIN_PATTERN` · `isBondIsin()` · `classifyCategory()` 선두 예외 |
| BOND-07 | `js/29` `BOND_FACE_UNIT` · `bondFaceToQuantity()` · `bondQuantityToFace()`, `js/06` `updateTxBondFaceHint()` |
| BOND-01 · 02 · 03 · 08 | `js/29` `bondLedgerKey()` · `resolveBondHolding()`(LEDGER / MANUAL / NONE) |
| BOND-09 | `js/06` `findConflictingManualBond()` + 저장 차단 |
| BOND-10 | `js/06` `collectKnownAccountTypes()` · `refreshAccountTypeDatalist()`(거래 폼 · 자산 폼 공용) |
| BOND-11 · 12 | `index.html` `#tx_assetClass`, `js/06` 저장 핸들러의 자산 `category`/`categorySource` 반영 |
| BOND-13 · 14 · 32 · 33 | `index.html` `#tx_bondFieldsWrap`, `js/06` `updateTxBondFieldsUI()` · `clearTxBondFields()` · `applyKnownBondMasterToTxForm()` · 저장 검증 |
| BOND-15 | `js/06` `upsertBondMasterFromTxForm()` |
| BOND-16 ~ 19 | 기존 `computePositionsAndRealizedPnL()` · `syncAssetsFromTransactions()` 그대로(재작성 없음) |
| BOND-20 · 23 | `js/29` `computeBondRiskSummary()`(open 기준 집계 · `closedCount`), `js/10` 원장 전달 |
| BOND-22 | `js/29` `resolveBondAssetCharacter()` 그대로(매핑 · 수식 불변) |
| BOND-24 | `js/29` `buildBondCashFlows()` → 전량매도 시 `status:'CLOSED'` |
| BOND-29 · 30 | `js/12` `buildSyncBlob()` · `applyRemoteState()` · `mergeAssetsAndTransactionsWithRemote()` · `stampPayload()`, `js/01` `LS_SYNC_MERGED_BOND_IDS` |
| BOND-31 | `js/08` `cleanupOrphanBondPositionForAsset()`(자산 삭제 2경로) |
| 자산 폼 중복 차단 | `js/07` assetForm submit 가드(49-2 반대 방향) |
| 검증 | `test/bond-transaction-core.test.js`(23건) · `e2e/108`(12건) · `e2e/109` PM 추가 확인(6건) |

**1단계에서 의도적으로 하지 않은 것**: KIS 관련 일체(2단계) · 새 Provider · 강제 전환 기능 ·
쿠폰 수령 회계 · 신용위험 수치화 · Bond Risk 모델 변경 · MC 수식 변경.

**PM 승인 완료(2026-09-21)**: BOND-10의 "Dropdown"을 `<select>`가 아니라 **실제 데이터로 채운
`<datalist>`**(입력칸을 누르면 목록이 뜨고 직접 입력도 된다)로 구현했다. `<select>`로 바꾸면 목록에 없는
**새 계좌를 만들 수 없게 되고**, 기존 E2E 4개 파일이 이 입력칸을 직접 채우고 있어 함께 고쳐야 한다.
**PM이 이 `<datalist>` 구현을 승인했다 - 순수 `<select>`로 바꾸지 않는다.**

### 49-12. Stage 2 — KIS 연동 · 시장가치 평가 (BOND-41 ~ BOND-46 · PM 확정 2026-09-21)

> Stage 1(BOND-01~40)은 **변경하지 않는다.** 이 절은 거래원장 기반 구조 위에 KIS 조회와
> 시장가치 평가를 얹는 것뿐이다. KIS는 Provider이고 거래내역은 여전히 보유의 유일한 원천이다.

| ID | 확정 내용 |
|---|---|
| **BOND-41** | KIS Bond Price가 유효성 검증 및 가격기준액면 검증을 통과한 경우 Bond Risk valuation source로 **MARKET**을 사용한다. MARKET을 사용할 수 없는 경우 기존 거래 기반 **PURCHASE** valuation을 사용한다. |
| **BOND-42** | KIS bond-price는 `rt_cd`만으로 유효성을 판정하지 않는다. `stnd_iscd` 존재 및 요청 ISIN 일치, 유효한 가격, 유효한 가격기준액면을 모두 확인한 경우에만 MARKET valuation에 사용한다. |
| **BOND-43** | 거래 quantity는 기존 BOND-07에 따라 **액면 10,000원 단위**로 유지한다. KIS 시장가격의 가격기준액면은 거래 quantity와 **별도로** 처리한다. |
| **BOND-44** | KIS 시장가격의 가격기준액면은 **실제 확인된 근거가 있는 경우에만** 사용한다. 확인되지 않은 가격기준액면을 임의 추정하지 않는다. |
| **BOND-45** | MARKET valuation이 불가능하면 기존 PURCHASE valuation을 사용한다. 유효하지 않은 KIS 가격을 **0원 또는 임의값으로 Bond Risk에 반영하지 않는다.** |
| **BOND-46** | Bond Risk MARKET valuation 연결은 **Bond Risk valuation source에 한정**하며, Portfolio Beta · MC · Return Key · Macro 및 Equity Risk 계산정책을 변경하지 않는다. |

#### 49-12-1. 실측으로 확정된 KIS 응답 (2026-09-21 · 운영 Worker 직접 호출)

**bond-info** (`search-bond-info` · CTPF1114R · PDNO=ISIN · PRDT_TYPE_CD=302)
성공 시 HTTP 200 · `rt_cd "0"` · `msg_cd "KIOK0530"` · `output` 객체 1개 · `output2` null.
없는 ISIN이면 `rt_cd "7"` · `msg_cd "APBN0024"` · `output` null.

**bond-price** (`inquire-price` · FHKBJ773400C0 · FID_COND_MRKT_DIV_CODE='B')
성공 시 HTTP 200 · `rt_cd "0"` · `msg_cd "MCA00000"` · `output` 객체 1개.
**없는 ISIN에도 `rt_cd "0"`으로 답한다** — 값이 전부 0이고 `stnd_iscd` 필드가 빠진다.
그래서 BOND-42가 `stnd_iscd` 존재·일치를 요구한다.

2026-08 구현(`70c49b3`)의 추정 필드명은 실측 결과 bond-info 8개 중 8개가 틀렸다
(`srfc_inrt` → 실제 `ksd_rcvg_bond_srfc_inrt`, `rdpt_date` → 실제 `rdpt_dt` 등).
**과거 매핑을 한 개도 가져오지 않았다.**

#### 49-12-2. Bond Master 매핑표 (PM 확정)

| Bond Master | KIS bond-info | 비고 |
|---|---|---|
| `identity.isin` | `pdno` | 요청 ISIN과 일치할 때만 채택 |
| `identity.instrumentName` | `ksd_bond_item_name` | |
| `identity.currency` | `iso_crcy_cd` | **빈 문자열로 오는 사례 실측** → 그때는 기존값 유지 |
| `identity.bondType` | `bond_clsf_kor_name` | 아래 변환표 |
| `identity.issuer` | — | **자동 입력하지 않는다**(49-12-3) |
| `identity.creditRating` · `seniority` | — | KIS가 주지 않는다 → 기존값 유지 |
| `terms.issueDate` | `issu_dt` | YYYYMMDD · `"00000000"`은 없음 처리 |
| `terms.maturityDate` | `rdpt_dt` | 〃 |
| `terms.couponRate` | `ksd_rcvg_bond_srfc_inrt` | 문자열 → Number |
| `terms.paymentFrequency` | `12 / int_caltm_mcnt` | 6개월 → 연 2회 |
| `terms.couponType` | 파생 | 할인율>0 → DISCOUNT, 표면이율>0 + 주기 → COUPON, 그 외 null |
| `source.provider` | `"KIS"` | |
| `source.sourceDate` | `tlg_rcvg_dtl_dtime` 앞 8자리 | |

**bondType 변환표** — 표에 없는 값은 비슷해 보여도 분류하지 않는다(null → UNCLASSIFIED).

| KIS `bond_clsf_kor_name` | 앱 `bondType` |
|---|---|
| 국고채권 | 국채 |
| 지방채권 | 지방채 |
| 특수채권 | 특수채 |
| 회사채권 | 회사채 |
| 금융채권 | 금융채 |

**덮어쓰기 범위**: KIS가 실제로 준 항목만 덮어쓴다. 주지 않은 항목 · 사용자가 고친 값
(`userOverride`) · 보유(B 계층)는 조회가 건드리지 않는다.

#### 49-12-3. issuer 처리 (PM 확정)

KIS 응답에 **발행인명 필드가 없다.** 다음 셋은 발행인이 아니므로 issuer로 쓰지 않는다:
`padf_plac_hdof_name`(원리금 지급장소) · `krx_issu_istt_cd`(기관 코드) · `bond_clsf_kor_name`(채권 분류).
issuer는 **null을 허용**하고 추정하지 않으며, issuer가 없다는 이유로 Bond Master 저장을 막지 않는다.

#### 49-12-4. 가격기준액면 결정 (BOND-44 구현 근거)

**조사 결과**(PM 지시 §7 A~E)

- **E. bond-info에 가격기준액면을 직접 의미하는 필드는 없다.** `uval_cut_*`(단가 절사 구분·자릿수) ·
  `ksd_int_calc_unit_cd`(이자계산 단위) · `pnia_int_calc_unpr`은 기준액면이 아니다.
- **C/D. KIS 응답 · 공개 문서에서 기준액면을 직접 명시한 필드/문구를 찾지 못했다.**
  KRX 일반채권시장의 **매매수량단위가 액면 1만원**이라는 것은 확인되나(거래단위이지 호가 기준의
  직접 근거는 아니다), 이것만으로 모든 채권에 일반화하지 않는다.
- **A/B. 그래서 종목마다 응답 자체로 판정한다.** KIS는 같은 응답에 가격(`bond_prpr`)과
  수익률(`ernn_rate`)을 함께 준다. 그 채권의 발행조건으로 수익률에서 이론가격을 계산하면
  "액면 1만원당 얼마여야 하는가"가 나오고, 실제 가격을 그것으로 나누면 기준액면이 드러난다.
  **국고채에서 확인한 값을 다른 채권에 일반화하지 않는다** — 채권마다 따로 확인한다.

**결정 규칙** — 후보는 `[1,000 · 10,000 · 100,000 · 1,000,000]`뿐이고, 후보끼리 10배씩 떨어져 있으므로
내재 기준액면이 어느 후보의 **2배 이내**일 때만 그 후보로 확정한다(경과이자 · 일수계산 차이 흡수).
어느 후보와도 맞지 않거나, 만기 · 표면이율 · 수익률이 없어 대조할 수 없으면 **UNAVAILABLE**이고
**PURCHASE로 되돌아간다**(BOND-45). 10,000 · 100,000 등을 근거 없이 넣지 않는다.

**실측 결과**(국고채 2건): 내재 기준액면 9,947 → 후보 10,000 확정(편차 −0.53%).

#### 49-12-5. 시장가치 계산

```
faceAmount  = quantity × 10,000                (BOND-07 · BOND-43 - 거래 단위는 그대로)
marketValue = faceAmount × (bond_prpr / priceBasisFace)
```

가격기준액면이 확인되지 않으면 marketValue를 만들지 않는다. Bond Risk 가중은 그때
`purchaseAmount`(거래원장 누적 매입원가)를 그대로 쓴다. **PURCHASE 계산 로직 자체는 무변경이다.**

전량매도(보유 0)된 채권은 애초에 평가 대상이 아니다(BOND-23 · Stage 1 그대로).

#### 49-12-6. 변경하지 않은 것 (BOND-46)

Duration · Modified Duration · ±100bp 충격 · Bond Risk 별도 영역 유지 · 신용위험 수치화 금지 ·
Portfolio Beta의 Bond 제외 · Bond Risk coverage 정책 · Equity Risk · Risk Score 구조 ·
MC 모델/수식 · Return Key · Macro. 이번 변경은 **valuation source 선택 한 곳**뿐이다.

#### 49-12-7. 저장하지 않는 것

KIS raw response · 조회한 시장가격을 **영구 저장하지 않는다.** 시세는 메모리에만 두며
localStorage · JSON 백업 · 기기 간 동기화 어디에도 들어가지 않는다. Worker 캐시(발행정보 30일 ·
시세 20분)와 앱의 메모리 캐시(20분)로 같은 채권을 반복 호출하지 않는다.

---

## 50. Instrument Metadata · 통화 무결성 · 채권 평가 일원화 · Beta 분리 (PM FINAL INTEGRATED IMPLEMENTATION DIRECTIVE 2026-09-21 · PD-01 ~ PD-17)

> **근거**: 2026-09-20~21 종합감사(READ-ONLY) 결과 24건. PM이 그중 17건을 결정(PD-01 ~ PD-17)하고
> **한 번의 통합 구현**으로 처리하도록 지시했다. 개별 증상을 따로 막지 않고 **근본 원인**을 제거한다.
> 이 절은 §49(채권 프로세스)를 대체하지 않는다 - BOND-01~46은 그대로 유효하고, 그중 BOND-46(valuation
> source를 Bond Risk에 한정)만 PD-07로 개정된다(아래 50-7).

### 50-0. 근본 원인 (감사 CAUSE-1 ~ CAUSE-6)

| 원인 | 내용 | 파생 증상 |
| --- | --- | --- |
| **CAUSE-1** | **ticker 칸의 의미 과적재** - 한 필드가 ① 종목 identity ② 국내/해외 판정 ③ 통화 판정 ④ 주식분석 입력 ⑤ 시세 조회 심볼을 동시에 수행. BOND-05가 여기에 ISIN을 넣자 ②③④가 전부 오작동 | D-01 · D-02 · D-03 · B-01 · B-03 · C-02 |
| **CAUSE-2** | 가격의 SoT가 자산군마다 다른데 화면은 전부 "현재가"로 부름 | A-01 · A-02 |
| **CAUSE-3** | 세분 성격(채권 6종)은 추가했으나 그 위의 검증 · 집계는 옛 단일 BOND 전제 | B-02 · A-03 |
| **CAUSE-4** | 식별 경로(검색/수동)에 따라 downstream 자격이 달라지는데 UI는 동등한 선택처럼 제시 | C-01 · C-02 |
| **CAUSE-5** | "원천 없음"과 "일시 실패"를 구분하는 코드는 있으나 사유 판정이 실측과 어긋남 | F-01 |
| **CAUSE-6** | 보호 장치(rate limit)가 캐시보다 먼저 실행 | H-01 |

### 50-1. PD-01 Instrument Metadata 우선 · Identifier 분류 보조

통화 · 국내외 · 자산군 · 분석 가능 여부를 **ticker 문자열만으로 추론하지 않는다.** 우선순위:

1. **확정 metadata** - 저장된 Asset · 채권 원장(Bond Master)
2. **승인된 Master** - Exposure Master(`priceCcy`) · 종목 마스터(상장 거래소)
3. **Identifier classifier** - 형태에서 나온 힌트
4. **명시적 사용자 입력**

충돌하면 **자동으로 덮어쓰지 않는다** - `conflicts`에 담아 돌려주고 저장 경로가 차단하거나 REVIEW로 둔다.

| 구현 | 위치 |
| --- | --- |
| `IDENTIFIER_KIND` · `classifyIdentifier()` - **형태만** 판정. ISIN은 `currencyHint` · `marketHint` 모두 null(국가코드로 통화를 단정하지 않는다) · `quoteSymbolSupported: false` | js/01 |
| `resolveInstrumentMetadata()` · `INSTRUMENT_CONFIDENCE`(CONFIRMED / MASTER / CLASSIFIER / USER / UNRESOLVED) | js/01 |
| `lookupBondMasterFacts()` · `lookupExposurePriceCcy()` | js/01 |

### 50-2. PD-02 Position Identity에 Currency 포함

`owner + account + ticker` → **`owner + account + ticker + currency`**.
통화가 비어 있는 옛 거래는 원화로 읽는다(`ledgerCurrencyOf`).

- **일괄 migration 하지 않는다.** 한 종목의 거래가 전부 같은 통화면 그룹 결과가 **완전히 동일**하다(테스트로 고정).
  통화가 섞인 데이터만 갈라지며, 그것이 드러나야 하는 상태다.
- **같은 규칙을 쓰는 곳 전수**: `transactionIdentityKey`(js/06) · `assetMatchesLedgerIdentity`(js/06) ·
  `computeCurrentHoldingQuantity`(js/06) · `getSuggestedAppliedRate`(js/06) ·
  `downloadHoldingsAsTxTemplate`(js/06) · **`bondLedgerKey`(js/29)**.
  손으로 만든 키를 남기지 않는다 - 한 곳이라도 옛 규칙이면 보유가 사라진다(구현 중 실제로 재현됨).

### 50-3. PD-03 확정 metadata ↔ 거래 통화 불일치 = 저장 차단

`showToast` 경고 후 통과가 아니라 **`return`(저장 안 함)**이다. 근거 출처를 문구에 그대로 적는다
(채권 원장 발행통화 / 이미 등록된 같은 보유분 / 종목 기준정보 / 국내 상장 종목코드).
근거가 하나도 없으면 입력값을 그대로 쓰고 충돌로 보지 않는다(모르는 것을 틀렸다고 하지 않는다).

### 50-4. PD-04 isDomestic을 ticker 형식에서 분리

`classifyIsDomestic(ticker, currency)` 판정 순서:
① 거래소 코드 체계로 **확정**되는 것(`.KS`/`.KQ` · 국내 단축코드 · 지수 심볼)이 통화보다 강하다
② 확정 metadata인 통화 ③ 식별자 힌트.
ISIN은 ①에 해당하지 않으므로 ②로 내려간다 - **원화 채권이 '해외'로 굳던 문제가 여기서 끝난다.**

### 50-5. PD-05 채권의 주식 전용 기능 진입 차단

`instrumentCapabilities(assetLike)` → `{ marketPriceLookup, equityAnalysis, equityBenchmark, bondValuation }`.
판정 기준을 "티커가 비어 있지 않다"에서 **"이 자산으로 무엇을 할 수 있는가"**로 바꾼다.

| 진입점 | 변경 |
| --- | --- |
| `attachStockAnalysisReportToDetailModal` · `attachFundamentalSection` · `attachRiskDiagnosisToDetailModal` | `assetSupportsEquityAnalysis()`가 true일 때만 호출(js/08) |
| `renderAssetDetailChart` | `marketPriceLookup`으로 판정 · 채권 전용 안내 문구(js/08) |
| `isCashOrBondNoTicker`(목록 표시) | `!r.ticker` → **시세 조회 대상이 아님**으로 판정(js/07) |
| `resolveMarketRiskBenchmark` | 주식 · ETF만 대상(채권 제외 정책 유지 · js/09) |

Bond Risk는 기존 별도 정책 그대로다(§49 · §47-1).

### 50-6. PD-06 검색/수동 입력은 신뢰도 기반

- 보유 자산에서 온 검색 결과는 **확정 metadata**다 - 티커 유무와 무관하게
  `owner · accountType · currency · category · isDomestic · role · source · confidence`를 전부 전달한다(js/04).
- `applyStockPickToTransactionForm`은 통화를 **재추론하지 않는다** - `resolveInstrumentMetadata`가 정한다(js/06).
- 자산군이 확정돼 있으면 폼에 반영하고, 채권이면 ISIN 칸까지 채운다(축 A/B 분리는 유지).
- "검색 가능하면 수동 입력 전면 금지"로 만들지 않는다. Master가 없거나 식별하지 못하는 자산은 수동 입력을 그대로 허용한다.
- `txBondFormActive` 조건 개정: 자동으로 채워진 '채권'이라도 **ISIN이 실제로 있으면** 채권 입력으로 본다
  (ISIN 없는 자동 채움은 예전 그대로 비활성 - E2E-59 회귀 방지).
- `findConflictingManualBond` 판정 수정: `Number(null)`이 0이라 **빈 레코드도 "수동 보유분 있음"으로 읽히던 버그** 제거.

### 50-7. PD-07 · PD-08 Bond Asset valuation (BOND-46 개정)

```
자산 화면 평가 = 수량 × resolveAssetUnitPrice(asset).unitPrice
  MARKET   : 10,000 × (KIS 시세 / 가격기준액면)       ← BOND-41~45 검증을 통과한 시세만
  PURCHASE : 거래원장 가중평균 매입단가(asset.buyPrice)
```

- **「채권 위험」 카드와 같은 함수**(`resolveBondAssetUnitPrice`, js/29)를 쓴다 - 두 화면이 갈라지지 않는다.
- **"최초 거래가격을 currentPrice로 고정"하던 동작을 제거한다.** `syncAssetsFromTransactions`가
  거래원장 기반 채권의 저장 현재가를 가중평균 매입단가와 함께 갱신한다.
- **시장가격은 저장하지 않는다(PD-08)** - 메모리 캐시(js/13 `bondQuoteMemory`)만 읽고,
  저장되는 값은 매입원가뿐이다. localStorage · JSON 백업 · 동기화 어디에도 시세가 들어가지 않는다.
- 거래원장이 없는 **수동 채권(legacy)**은 사용자가 적어 둔 값을 그대로 둔다(PD-17 보존).
- 평가 캐시는 `bondValuationSignature()`(거래 수 · 최신 updatedAt · 채권 레코드 · `bondQuoteVersion()`)로
  무효화한다 - 렌더링마다 원장을 다시 계산하지 않기 위한 것이며 값을 저장하는 것이 아니다.

**BOND-46 개정**: "이 변경은 valuation source 선택 한 곳뿐이다"의 적용 범위를 **Bond Risk + 자산 화면 평가**로
넓힌다. Duration · Modified Duration · ±100bp · 신용위험 비수치화 · Portfolio Beta의 Bond 제외 ·
MC 모델 · Return Key · Macro는 **그대로 무변경**이다.

### 50-8. PD-09 Bond weight 연결

`calcRow()`가 `curKRW`를 실제로 돌려준다(= `curAmount`). js/09의 `bondCur` → `bondWeightPct`가 비로소 동작한다.
**Portfolio Beta에서 Bond를 제외하는 정책은 그대로 유지한다.**
(예전에는 `calcRow(a).curKRW`가 코드 전체에서 생산처 0인 키라 `bondWeightPct`가 항상 0이었고,
"채권 비중 N%는 베타 집계 대상이 아닙니다" 안내가 한 번도 출력되지 않았다.)

### 50-9. PD-10 Bond Return Key validator 정합성

`assessReturnAssumptionStatus`의 불일치 판정을 **추천기와 같은 표**로 한다 -
`returnKeyCandidatesForCharacter(character)`에 지금 키가 들어 있으면 정상이다.
문자열 예외를 추가하지 않는다. 채권 세부 성격이 더 늘어나도 같은 규칙이 그대로 맞는다.
**Return Key의 수익률 계산 정책 자체는 변경하지 않는다.**

| 적용키 | 성격 | 판정(변경 후) |
| --- | --- | --- |
| `채권`(자동) | 전 성격 | OK(변경 없음) |
| `BOND` | `BOND` | OK(변경 없음) |
| `BOND` | `KR_GOV_BOND` · `KR_CORP_BOND` · `FOREIGN_*_BOND_*` 4종 | **OK** (이전: NEEDS_REVIEW 오탐) |
| `BOND` | 주식 등 비채권 성격 | NEEDS_REVIEW(변경 없음 - 검증기를 무력화하지 않았다) |

### 50-10. PD-11 Excel · Sync에서 Bond identity 보존

`relinkBondPositionsToAssets()`(js/29) - assetId가 끊어진 채권 레코드를 **ISIN + 소유자 + 계좌**로 다시 잇는다.
찾지 못하면 **그대로 둔다**(발행조건을 삭제하지 않는다 · PD-17). 호출 지점: 엑셀 가져오기 직후 ·
JSON 복원 직후 · 클라우드 병합 직후. 엑셀에서 거래원장을 생성하는 확장은 하지 않는다.

### 50-11. PD-12 Cloudflare KV 사용구조

처리 순서를 **인증 → 입력검증 → 라우팅 → 한도 판정(읽기) → 캐시 → (미스일 때만) 한도 기록 → 상류**로 바꾼다.

| 요청 유형 | KV put (변경 전 → 후) |
| --- | --- |
| 인증 실패(401) | 0 → 0 |
| 형식 오류(400) | **2 → 0** |
| 캐시 적중 | **2 → 0** |
| 캐시 미스 | 3 → 3 |
| 없는 경로(404) | **2 → 0** |

**제한을 약하게 만들지 않는다**: 인증은 여전히 맨 앞 · 분 30회 · 일 300회 **값 그대로** ·
한도 판정은 모든 요청에서 수행(읽기 전용)하여 이미 한도를 넘긴 IP는 캐시 적중이어도 429다.
카운터 **증가**만 상류를 실제로 부르는 요청으로 한정한다(보호 대상이 상류 호출이기 때문).

### 50-12. PD-13 DJ US Dividend 100 사유 코드 정정

`SOURCE_INSUFFICIENT_HISTORY` → **`NO_PUBLIC_SOURCE`**.
실측(2026-09-21 · 400일 요청): `^DJUSDIV` · `^DJUSDV` · `^DJDVY` 모두 **관측 1건**(당일 수준값)만 오고,
`DJUSDIV` · `^SDY` · `^DJUSDVP`는 404다. 대조군 `^GSPC` 274 · `^IXIC` 274 · `^KS11` 268 · `^KQ11` 268.
`^KS200`도 관측 1건으로 같은 상태임을 함께 확인했다(KOSPI200_PR/TR의 `NO_PERMITTED_SOURCE` 기록과 일치).
**시간이 지나면 해결된다고 표시하지 않는다.** `sourceId`는 "무엇을 시도했고 왜 안 되는지"의 근거로 남긴다.

### 50-13. PD-14 ACE 미국S&P500 환헤지

**공식 원문을 확보하지 못했다 → 기존 UNRESOLVED(`hedgeUnconfirmed`) 유지.** 추정하지 않는다.
확인한 것(원문 아님): 운용사 상품 페이지에 환헤지 문구가 **없다**(2026-09-21 확인) ·
금융투자협회 FunETF 분류 "해외주식 시장대표 환노출형" · DART 정식 펀드명이 `(주식)`이고 `(주식-파생형)(H)`가 아니다.
남은 경로: 운용사 (간이)투자설명서 PDF **원문**(다운로드 승인 필요) 또는 DART 첨부문서(robots 금지 경로라 사용 안 함).

### 50-14. PD-15 Market Beta / Tracking Beta 분리

두 값은 **서로 다른 통계량**이다. 하나의 숫자로 섞지 않는다.

| | Market Beta | Tracking Beta |
| --- | --- | --- |
| 기준 | **상장 시장 대표지수** | **공식 기초지수**(Exposure Master) |
| 용도 | **위험점수 「시장위험」(가중치 15%) · Portfolio Beta · 스트레스** | 추적 특성 **표시 전용** |
| 필드 | `benchmark*` · `beta` · `betaStatus` | `trackingBenchmark*` · `trackingBeta` · `trackingBetaStatus` |
| 집계 | `portfolioBeta` · `betaCoveragePct` | `portfolioTrackingBeta` · `trackingBetaCoveragePct` |

**기준 지수 매핑은 원장 · 코드에 이미 있는 사실만 쓴다**(`RISK_MARKET_INDEX_BY_LISTING_EXCHANGE`):
KOSPI 상장 → `KOSPI`(^KS11) · KOSDAQ 상장 → `KOSDAQ`(^KQ11) · NASDAQ 상장 → `NASDAQ`(^IXIC).
**NYSE · AMEX는 매핑하지 않는다(UNRESOLVED)** - 앱에 그 시장의 종합지수가 없다(§44 D-02 유지).
S&P500으로 대신하지 않는다. 종목 마스터에 없어도 `.KS`/`.KQ` 접미사 자체가 상장 시장이므로 그대로 읽는다.
해외 상장 개별주는 본국 보통주(HOME_COMMON) 근거가 있을 때만 쓴다(D-06 게이트 유지).

**부수 효과(의도된 것)**: Market Beta는 항상 같은 시장 · 같은 통화끼리 비교하므로 **H.10 원화 환산과
비동기 Dimson 경로를 타지 않는다.** 원화 낙폭표(`*_KRW`)를 쓰는 경우가 사라져 "정의가 맞는 짝끼리만
곱한다"(D-9)가 구조적으로 보장된다. 비동기 · H.10 · Dimson 계산은 **Tracking Beta에 그대로 남아 있다**(무변경).

`m.betaDefinition = 'MARKET'` - 위험점수가 어떤 베타를 쓰는지 화면이 말할 수 있게 명시한다.
**Portfolio Beta의 Bond · Cash · Real Estate 제외 정책은 그대로 유지한다.**

### 50-15. PD-16 KIS Index API

**실제 응답 · 의미 · license 확인 전 구현 금지.** 이번 구현에서 **아무것도 하지 않았다.**
Worker에 지수 라우트가 없고, 라우트를 추가하려면 재배포가 필요한데 그 전에 실제 응답 검증이 선행돼야 한다
(§49-12와 같은 순서). KOSPI200 ≠ KOSPI200TR 대체 금지 · DJ · iSelect 임의 mapping 금지 그대로.

### 50-16. PD-17 기존 오염 데이터 - 탐지만 한다

`detectInstrumentIntegrityIssues(asset)` · `scanInstrumentIntegrity()`(js/01) - **아무것도 고치지 않는다.**

| 코드 | 등급 | 조건 |
| --- | --- | --- |
| `BOND_CURRENCY_CONFLICT` | REVIEW | 채권 원장 발행통화 ≠ 자산 통화 |
| `DOMESTIC_CODE_FOREIGN_CURRENCY` | REVIEW | 국내 상장 코드인데 통화가 USD |
| `LEDGER_CURRENCY_CONFLICT` | REVIEW | 같은 소유자 · 계좌 · 종목에 통화가 섞인 거래 |
| `BOND_POSITION_ORPHAN` | UNRESOLVED | 채권 발행조건이 가리키는 자산이 없다 |

자산 상세의 기존 안내 영역(`assetDetailPositionNotice`)에 그대로 붙인다.
**자동 대량 변환 금지** - 모든 ISIN 채권을 KRW로 덮어쓰는 식의 처리를 하지 않는다.
실사용자 데이터에 대한 migration script를 별도로 실행하지 않는다.

### 50-17. 계산 결과 변화 (의도된 것 · baseline 재승인 대상)

| 항목 | 변경 전 | 변경 후 | 사유 |
| --- | --- | --- | --- |
| Golden 2종목 `portfolioBeta` · 6대 요인 · riskScore · 변동성 · MDD · VaR · CVaR · 신뢰도 | - | **전부 동일** | 계산식 무변경(기준 지수만 바뀌었고 fixture에서 두 지수가 같은 시계열) |
| Golden `benchmarkKey` | `['KOSPI','NASDAQ100']` | `['KOSPI','NASDAQ']` | PD-15 - 상장 시장 지수 |
| Golden `stressLossPct` (2020) | -37.919709 | **-38.300241** | 낙폭 상수가 NASDAQ100(-28.03) → NASDAQ(-30.12) |
| Golden `stressLossPct2022` | -32.053438 | **-32.091673** | 낙폭 상수가 NASDAQ100(-35.28) → NASDAQ(-35.49) |
| 채권 자산 평가금액 | 첫 거래 단가 고정 | MARKET → PURCHASE | PD-07 |
| 총자산 · 비중 · 미래예측 초기자본 · MC `initialPrincipal` | 위 고정값 반영 | 위 평가 반영 | PD-07의 downstream |
| `bondWeightPct` | 항상 0 | 실제 채권 비중 | PD-09 |
| ISIN 채권 `isDomestic` | 해외 | **국내**(원화채) | PD-04 |
| ISIN 채권 자동 Return Key | `채권` | `BOND` | isDomestic 정정의 부수 효과. **수익률 값은 동일**(둘 다 `getReferenceRate(preset,'BOND')`) |

**의도하지 않은 변경 0** - MC 4지표 · μ/σ 지문 · Return Key 수익률 · Macro는 그대로다.

### 50-18. 변경하지 않은 것

§44 Risk 정책 구조 · 6대 요인 가중치(집중 25 / 변동성 20 / 손실 20 / **시장 15** / 상관 10 / 기술 10) ·
밴드 · 등급 임계값 · 최소 관측 120 · 관측 창 · Dimson 공식 · H.10 단일 환율 공급자 ·
§49 BOND-01~45 · Duration 계산 · MC 엔진/수식 · Return Key 수익률 · Macro ·
~~`#riskScopeNote` 상시 노출(V1.3 P1-1)~~ → **§52-13으로 개정(2026-09-22 · 점수 옆 ⓘ 팝업으로 통합)** · Exposure Master 원장 내용(사유 코드 1건 제외) ·
Worker 읽기 전용 원칙 · 한도 값(30/min · 300/day) · 시세 비저장 원칙.

### 50-19. 측정 결과 (v264 → v265 · 2026-09-21)

**회귀 하네스**(`node scripts/closeout/regression-harness.js compare` · FROZEN 데이터 · v262 기준선)

| suite | v264 | v265 | 증감 |
| --- | --- | --- | --- |
| risk | 23 | **53** | **+30** (전부 PD-15 Beta 분리에서 나온 의도된 변화) |
| mc | 683 | 683 | **0** |
| master | 73 | 73 | **0** |
| 합계 | 779 | 809 | +30 |

v264 기준선은 `git worktree`로 태그 v264를 따로 펼쳐 같은 하네스를 돌려 얻었다(작업 트리 무접촉).

**risk +30건의 내역**(합성 포트폴리오 7종목)

| 구분 | 종목 | 변화 |
| --- | --- | --- |
| 커버리지 상승 | h2 (KOSPI200_PR · 원천 없음) | 베타 없음 → **KOSPI 대비 0.8947** |
| 커버리지 상승 | h4 (혼합 노출) | 베타 없음 → **KOSPI 대비 0.5789** (상장 시장은 혼합 여부와 무관) |
| 커버리지 상승 | h6 (KOSPI200_TR · 원천 없음) | 베타 없음 → **KOSPI 대비 0.7895** |
| 의미 변경 | h3 (국내 상장 미국 ETF) | SP500 비동기 Dimson −0.0012 → **KOSPI 같은 날짜 1.0000** · H.10 환산 경로 해제 |
| 사유 코드만 변경 | h5 (SCHD · AMEX 상장) | 베타 없음(SOURCE_UNAVAILABLE) → 베타 없음(**BENCHMARK_UNRESOLVED**) — 값 변화 없음 |
| 포트폴리오 | — | `portfolioBeta` null → **1.0418** · `subScores.market` null → **55** · `riskScore` 45 → **48** · 신뢰도 78 → **86**(베타 미확인 비중 61% → 7%) |

⇒ PD-15의 목적(시장위험 요인이 실제로 계산되는 것)이 수치로 확인된다. AMEX · NYSE 상장분은
의도대로 미확정으로 남는다(임의 대체 금지).

**Monte Carlo**(`node scripts/closeout/measure-mc.js` · seed 20260101 · 2,000회 · 20년)

| 시나리오 | P10 | P50 | P90 | 평균 | μ지문 | σ 변경 |
| --- | --- | --- | --- | --- | --- | --- |
| 주식만(원장 49건) | 0.00% | 0.00% | 0.00% | 0.00% | 동일 `af875582fc001dc2` | 0건 |
| 주식 + 합성채권 3종 | 0.00% | 0.00% | 0.00% | 0.00% | 동일 `a36f5ba2112d4d44` | 0건 |

기록: `docs/closeout/measurements/mc-v265-s50.json`

**게이트**: Unit 695/695 · ESLint 0 · Data Guard PASS · Release Guard PASS(v265) ·
Secret Scan(신규 하드코딩 0) · E2E는 아래 인계장 기록 참조.

---

## 51. Market Beta 기준 시장 확정 — 국내는 상장시장 · 미국 노출은 S&P500 (PM FINAL IMPLEMENTATION DIRECTIVE 2026-09-21 · D-2)

> **근거**: §50 PD-15로 Market Beta와 Tracking Beta를 나눌 때, 시장 지수를 **상장 거래소**로 정하고
> 뉴욕 · 아멕스는 대응 지수가 없어 미확정으로 남겨 두었다(대장 D-2). PM은 이 미결을 종결하면서
> 기준 자체를 바꿨다. 이 절은 그 최종 정책과 구현 · 검증을 기록한다.
> **기준선**: 직전 상태 v265는 D-2 착수 전에 로컬 커밋으로 고정했다(§51-13 참조).

### 51-0. 판정 구조 (PM 최종)

이것은 "모든 자산을 노출시장 하나로 통일"하는 정책이 **아니다**. 판정은 두 단계다.

```
                    Market Beta
                         │
             ┌───────────┴───────────┐
          국내 노출                미국 노출
             │                       │
       ┌─────┴─────┐                 │
   KOSPI 상장   KOSDAQ 상장      (상장지 무관)
       │           │                 │
     KOSPI       KOSDAQ            S&P500
```

① 경제적 노출시장이 **US**면 상장 거래소를 보지 않고 **S&P500**이다 — 나스닥 · 뉴욕 · 아멕스 상장이든
국내(.KS/.KQ) 상장 미국 ETF든 모두 같다. ② 그 밖(국내 노출 · GLOBAL)이면 **상장 시장** 지수다 —
국내 자산에서 코스피 · 코스닥 구분을 없애지 않는다.

### 51-1. 네 개념을 섞지 않는다

| 개념 | 뜻 | 판정 근거 | 예: 360750.KS | 예: 237370.KS |
| --- | --- | --- | --- | --- |
| `listingMarket` | 어느 거래소에 상장됐나 | 종목 마스터 exchange, 없으면 .KS/.KQ 접미사 | KOSPI | KOSPI |
| `exposureMarket` | 경제적으로 어느 시장에 노출됐나 | **Exposure Master `marketExposure`만** | US | KR |
| Market Beta benchmark | 시장위험을 무엇으로 재나 | 위 51-0 | **SP500** | **KOSPI** |
| Tracking benchmark | 공식 기초지수를 얼마나 따라가나 | Exposure Master `benchmark` | SP500 | (혼합 · 없음) |

`.KS`/`.KQ`는 **listingMarket 판정에만** 쓴다. exposureMarket · currency · hedge 판정에 재사용하지
않는다. 하나의 ticker 문자열에서 네 가지 의미를 추론하지 않는다.

### 51-2. 구현

js/09 `resolveMarketRiskBenchmark(a)` — 순서: 티커 → 주식·ETF 카테고리 → **원장에서 marketExposure
읽기** → US면 `finalizeRiskBenchmark(yahoo, 'SP500', 'usExposure', entry)`, 아니면 상장시장 지수로
`finalizeRiskBenchmark(yahoo, key, 'listingMarket', null)`. 상수는 두 개다 —
`RISK_MARKET_INDEX_BY_LISTING_EXCHANGE = { KOSPI, KOSDAQ }` · `RISK_US_EXPOSURE_MARKET_INDEX = 'SP500'`.
상장시장 판정은 `riskListingMarketOf(yahoo)`로 분리했다.

**새 계산 엔진을 만들지 않았다.** 환헤지 게이트 · 비동기 정렬(Dimson 시차 0+1) · H.10 원화 환산 ·
최소 관측 120은 전부 기존 승인 경로(`finalizeRiskBenchmark` · §44 44-15 · D-05)를 그대로 쓴다.
바뀐 것은 그 경로에 **어떤 지수 키를 넘기는가** 하나뿐이다.

### 51-3. ~~원장 미등재 종목 — 산출하지 않는다~~ → **§53-2로 개정(2026-09-22 · v267)** (STEP 5 · GAP-1)

> **개정 요지**: 근거로 인정하는 원천이 "Exposure Master 하나"에서 "**승인된 A등급 사실원천**"으로
> 넓어졌다. **추정 금지 원칙 자체는 그대로다** — 티커 접미사 단독 · 상품명 · 거래소 단독은 여전히
> 근거가 아니다. 아래 원문은 개정 전 기록으로 보존한다.

승인된 Exposure 근거(`marketExposure`)가 없으면 Market Beta를 **자동 산출하지 않는다**(UNRESOLVED ·
사유 `exposureUnconfirmed`). 다음을 근거로 쓰지 않는다: `.KS`/`.KQ` 접미사 · 거래소 · ISIN 국가코드 ·
티커 문자열 · 상품명("미국"이 들어갔다는 사실). D-06의 추정 금지 원칙과 같은 자리다.

⚠ **커버리지 영향**: v265에서는 원장에 없어도 상장 거래소만으로 기준 지수를 받던 종목이 있었다
(예: 원장에 없는 국내 상장 종목 → KOSPI). 이제는 미확정이다. 근거 없이 붙이던 기준을 뺀 결과이며,
커버리지를 늘리려면 Exposure Master를 넓히는 것이 정해진 길이다.

### 51-4. ACE 미국S&P500(360200.KS) — 환헤지 확정 (STEP 6 · R-2 · PD-14 종결)

PM이 한국투자신탁운용 공식 **간이투자설명서**(한국투자 ACE 미국 S&P500 증권 상장지수투자신탁(주식) ·
작성기준일 2025.12.31)를 확인했다. 「환율변동 위험」에 외국통화 표시 투자대상자산에 대하여 환헤지
거래를 **실행하지 아니할 계획**이라고 명시돼 있다.

⇒ `hedgeStatus: UNHEDGED` · `fxExposure: EXPOSED` · `conversionMethod: FX_MULTIPLY` (A등급 · 근거 문구를
원장 evidence에 기록). 원장 판정이 UNRESOLVED → **RESOLVED**로 바뀌고, Market Beta · Tracking Beta
모두 SP500(비동기 · H.10 원화환산)으로 산출된다. 종전 "환헤지 미확인 → 연결 보류" 상태를 해제한다.

### 51-5. KODEX 코리아배당성장채권혼합(237370.KS) (STEP 7)

기초지수 KRX 배당성장 채권혼합지수 = 코스피 배당성장50 30% + KTB지수 70%. 국내 주식 + 국내 국채이므로
전체 노출은 **KR**이다. `exposureStructure: MIXED`이지만 MIXED가 "여러 국가시장"을 뜻하지 않는다.
⇒ listingMarket KOSPI · exposureMarket KR · **Market Beta = KOSPI**. 원장 값 변경 없음(이미 그렇게 적혀 있다).

### 51-6. TIGER 미국테크TOP10채권혼합(472170.KS) (STEP 8)

50:50 혼합(Indxx US Tech Top10 + KIS 국채 3-10년 TR). PM 최종 결정:
**Market Beta = KOSPI 유지 · 1:N Exposure Engine 미도입 · D-13 유지 · 화면에 혼합구조 명시.**
환헤지는 새 추정이 아니라 **기존 A등급 근거의 구조화**다 — evidence에 이미 있던 "환헤지를 하지 아니함"을
`hedgeStatus: UNHEDGED` 항목으로 옮겼다. MIXED 규칙(assetClass · benchmark 단일값 금지)은 그대로이고,
원장 검증 결과(UNRESOLVED · mixedExposure · violations 0)도 그대로다.

### 51-7. MIXED 처리 원칙 (STEP 9)

MIXED라는 **값만으로** benchmark를 정하지 않는다. 237370과 472170은 둘 다 MIXED이고 둘 다 KOSPI지만,
그 이유는 "MIXED라서"가 아니라 "미국 노출이 아니라서"다. 다음 규칙을 만들지 않는다:
`MIXED → S&P500` · `MIXED → 1:N 자동 분해`.

### 51-8. Tracking Beta — 변경 없음 (STEP 10)

`resolveRiskBenchmark`(공식 기초지수 경로)는 이번 작업에서 손대지 않았다. SCHD → DJ U.S. Dividend 100 ·
360200 → S&P500 · 237370 → 혼합(없음) 그대로다. 표시 전용이며 위험점수에 들어가지 않는다.
360200의 추적 기준이 UNRESOLVED에서 RESOLVED로 바뀐 것은 §51-4(환헤지 확정)의 결과이지
Tracking 정책 변경이 아니다.

### 51-9. 환헤지 Gate (STEP 12)

미국 노출 자산 중 **비동기 쌍**(국내 상장 · 원화 가격 ↔ 달러 지수)만 게이트에 걸린다.
UNHEDGED → S&P500 원화환산 허용 · HEDGED → `hedgeCostUnavailable`로 미확정 · 미확인 → `hedgeUnconfirmed`로
계산 금지. 미국 상장 자산은 지수와 같은 달력 · 같은 통화라 게이트 자체를 타지 않는다(SAME_DATE).
360200 확정으로 원장 내 국내 상장 미국 ETF 5건은 전부 UNHEDGED다.

### 51-10. Portfolio Beta 설명 · 기준시장 표시 (STEP 13)

**계산식은 변경하지 않았다.** 표시만 바꿨다.
- 위험 세부내용에 「🧭 기준시장 구성: 코스피 nn% · S&P500 nn%」 줄을 추가했다(`data-risk-benchmark-mix`).
  집계에 실제로 들어간 종목(베타가 있는 종목)만 분모로 쓴다.
- 문구: "하나의 지수에 대한 값이 아니라, 종목마다 **자기 시장**에 대해 잰 민감도를 보유비중대로 합친 값".
  기준시장이 하나뿐이면 구성 대신 그 시장 하나임을 말한다.
- 종목별 값에 기준시장을 병기한다 — 예: `1.31배 (S&P500 기준)`.
- 혼합구조 상품은 종목 진단에 안내를 붙인다(`data-holding-mixed-note`).

### 51-11. Stress 영향 (STEP 14)

**Stress 정책 · 상수는 변경하지 않았다.** 기준 지수가 바뀌므로 곱하는 낙폭이 따라 바뀐다.

| 대상 | 베타 기준 | 곱하는 낙폭(2020 / 2022) |
| --- | --- | --- |
| 미국 **상장** 자산 | S&P500 현지통화(USD) · SAME_DATE | `SP500` −33.92 / −25.43 |
| 국내 상장 미국 ETF | S&P500 **원화환산**(H.10) · ASYNC_DIMSON | `SP500`(_KRW) −29.86 / −17.55 |
| 국내 노출 자산 | 상장시장 지수 | `KOSPI` −35.71 / −27.89 · `KOSDAQ` −38.15 / −36.84 |

같은 S&P500 노출인데 상장지에 따라 다른 상수가 적용되는 것처럼 보이지만, 이는 **베타를 잰 통화와
낙폭의 통화를 맞춘** 결과다(D-9 "정의가 맞는 짝끼리만 곱한다"). 버그로 보고 상수를 통일하지 않는다.

### 51-12. 변경하지 않은 것

Risk 계산식 · 6대 요인 가중치 · 점수 밴드 · MC 모델/수식/seed · Return Key · Macro ·
Bond Risk · Duration · Modified Duration · ±100bp · Bond/Cash/부동산의 포트폴리오 베타 제외 ·
Tracking Beta 경로 · Index Master · KIS Index API(PD-16 유지 · 구현하지 않음) ·
Stress 상수 표 · H.10 공급자 · 최소 관측 120.

### 51-13. 측정 결과 (v265 → D-2 · 2026-09-22)

**기준선**: v265 frozen baseline 로컬 커밋 `a72e984` (push · deploy · tag 없음).

**회귀 하네스**(`node scripts/closeout/regression-harness.js` · FROZEN 데이터 · 합성 7종목)

| 항목 | v265 | D-2 | 분류 |
| --- | --- | --- | --- |
| 005930.KS · 069500.KS · 237370.KS · 278530.KS(국내 노출) | KOSPI · 베타 1.157895 / 0.894737 / 0.578947 / 0.789474 | **전부 동일** | 변화 없음 |
| AAPL(나스닥 상장 · 미국 노출) | NASDAQ · 1.235294 | **SP500 · 1.312500** | A(의도) |
| 360750.KS(국내 상장 미국 ETF) | KOSPI · 0.999999 · SAME_DATE | **SP500 · −0.001153 · ASYNC_DIMSON · H.10** | A(의도) |
| SCHD(아멕스 상장 · 미국 노출) | 미확정 · 베타 없음 | **SP500 · 0.812500** | A(의도 · 신규 산출) |
| portfolioBeta | 1.041763 | **0.931429** | A |
| subScores.market | 55 | **35** | A(밴드 <1.0) |
| riskScore | 48 | **45** | A |
| dataConfidence | 86 | **87** | A(벤치마크 미확정 사유 1건 해소) |
| stressLossPct / 2022 | null(미확정 종목 있음) | **−32.584542 / −25.047751** | A |
| 변동성 · VaR · CVaR · MDD · 상관 | — | **전부 동일** | 변화 없음 |
| Master 원장 | — | 360200 3항목 + 472170 1항목 추가 | A(STEP 6 · 8) |
| MC | — | **전부 동일** | 변화 없음 |

⇒ **B(코드 부작용) · C(데이터 변화) · D(기타) 0건.** 모든 변화가 D-2 정책 변경으로 설명된다.

**Monte Carlo**(`node scripts/closeout/measure-mc.js` · seed 20260101 · 2,000회 · 20년)

| 시나리오 | P10 | P50 | P90 | 평균 | μ지문 | σ 변경 |
| --- | --- | --- | --- | --- | --- | --- |
| 주식만(원장 49건) | 0.00% | 0.00% | 0.00% | 0.00% | 동일 `af875582fc001dc2` | 0건 |
| 주식 + 합성채권 3종 | 0.00% | 0.00% | 0.00% | 0.00% | 동일 `a36f5ba2112d4d44` | 0건 |

기록: `docs/closeout/measurements/mc-d2-market-beta.json`

**원장 58건 전건 판정**: KR 21 → KOSPI · GLOBAL 1 → KOSPI · US 36 → SP500.
미확정 0건(v265에서는 뉴욕 9 + 아멕스 4가 미확정이었다).

### 51-14. PM이 제공한 reference와의 차이 (STEP 15 · GAP-4)

PM reference(360750 0.8682 · 368590 1.0833 · 360200 0.8728 · 458730 0.5386 · 487230 1.5619)는
앱과 **계산조건이 다르다**: reference는 원주가 · 약 529거래일 전체, 앱은 **조정주가(closesAdj)** ·
range 3y 후 **최근 500행**이다. 지수는 양쪽 다 원주가(INDEX_LEVEL), FX는 양쪽 다 H.10이다.
배당을 많이 주는 상품일수록 차이가 크다. **계산 엔진을 reference 조건에 맞추지 않는다.**
차이는 "계산조건 차이(조정주가 / 최근 500행 / 기간)"로 기록하고 정상으로 수용한다.

### 51-15. 열린 쟁점 — PM 확인 요청 (임의 변경하지 않음)

| # | 사실 | 왜 쟁점인가 | 현재 동작 |
| --- | --- | --- | --- |
| D2-Q1 | 원장의 **미국 채권형 ETF** TLT · IEF는 `assetClass: BOND`이지만 `marketExposure: US`다 | D-2를 문자 그대로 적용하면 채권형 펀드가 **주식 지수(S&P500)** 시장 베타를 받는다. v265에서도 이미 상장 거래소 기준(NASDAQ)으로 받고 있었고(v264까지는 미확정), D-2는 그 기준을 옮겼을 뿐이다. 앱 카테고리가 '채권'인 자산은 예전 그대로 제외된다 | 지시대로 **S&P500**. 정책을 임의로 추가하지 않았다. `test/risk-engine.test.js`가 현재 동작을 사실대로 고정하고 있다 |
| D2-Q2 | Exposure Master 58건에 **KOSDAQ 상장 항목이 하나도 없다** | "KOSDAQ 상장 → KOSDAQ" 분기는 구현·검증돼 있지만, §51-3(원장 미등재 → 미확정)과 겹치면 현재 원장으로는 **실제로 도달할 수 없다**. 사용자가 코스닥 종목을 보유하면 Market Beta가 미확정이 된다 | 코드 경로는 정상(합성 원장으로 검증). 커버리지를 넓히려면 원장 확대가 필요하다 |
| D2-Q3 | 원장 미등재 종목의 커버리지가 v265보다 줄었다(§51-3) | PM이 STEP 5에서 명시적으로 선택한 결과다. 기록만 남긴다 | 미확정 |

---

## 52. 최종 종합감사 · 사용자 편의성 감사 반영 (PM FINAL IMPLEMENTATION DIRECTIVE 2026-09-22)

> **근거**: v266(D-2 구현본) 기준으로 ① 전체 종합감사(READ-ONLY) ② 사용자 편의성 감사(READ-ONLY)를
> 수행해 발견사항을 PM에 보고했고, PM이 그중 승인한 항목만 이 절에서 구현했다.
> **이번 작업에서 계산은 하나도 바꾸지 않았다** — Risk 계산식 · 6대 요인 · 점수 밴드 · MC 엔진/seed/분포 ·
> Return Key · Macro · Bond Risk · Duration · ±100bp · Tracking Beta 집계 · Stress 상수 · Portfolio Beta 공식 ·
> Exposure Master 기존 승인 데이터 · backup/restore schema · cloud merge 정책 전부 그대로다.

### 52-0. 결정 요약

| # | 항목 | PM 결정 | 결과 |
| --- | --- | --- | --- |
| D2-Q1 | 채권 자산군의 Market Beta | **Market Beta 대상에서 제외** | 구현 |
| D2-Q2 | KOSDAQ Exposure Master | **원장을 확대하지 않는다 · 근거 없으면 UNRESOLVED** | 현행 확인(코드 변경 없음) |
| UX-1 | Monte Carlo 오류 안내 | 사용자가 해결 방향을 알 수 있게 | 구현 |
| UX-2 | 최초 자산 등록 진입점 | **현행 유지** | NO CODE CHANGE |
| UX-3 | 거래 ↔ 직접관리 자산 불일치 | 정책 유지 · **알림 시점만 개선** | 구현 |
| UX-4 | 검색 안내문 | 실제 동작과 일치시킨다 | 구현 |
| UX-5 | 「Monte Carlo 실행」 버튼명 | **현행 유지** | NO CODE CHANGE |
| UX-6 | 모바일 터치 타깃 | 44px 확보 | 구현 |
| UX-7 | 첫 화면 정보 밀도 | 소폭 개선(총자산 발견성 · 반올림 표시) | 구현 |
| UX-8① | 아이콘 문단 줄 시작 정렬 | 기존 helper 재사용 | 구현(19곳) |
| UX-8② | 문맥을 끊는 줄바꿈 | 최소 CSS | 구현(4구절) |
| UX-8③ | Tracking Beta 설명 문구 | 계산 유지 · 문구만 정정 | 구현 |
| UX-9 | 수익률 0% vs 미래 자산 증가 | 계산 유지 · 설명 보강 | 구현 |

### 52-1. D2-Q1 — 채권 자산군은 Market Beta 대상이 아니다

**결정**: 원장 `assetClass === 'BOND'`인 상품은 미국 경제적 노출이더라도 S&P500 Market Beta를 받지 않는다.

**왜**(실측 근거 · Yahoo 548거래일 · 앱과 같은 계산 함수):

| 종목 | S&P500 베타 | 시장위험 점수 |
| --- | --- | --- |
| TLT(미국 장기국채 ETF) | **0.0824** | 20 (최저 밴드) |
| IEF(미국 중기국채 ETF) | **0.0171** | 20 (최저 밴드) |
| SPY(대조군) | 1.0189 | 55 |
| AAPL(대조군) | 1.0791 | 55 |

베타 0.08은 통계적으로 맞는 값이다 — 국채는 주식시장과 거의 함께 움직이지 않는다. 문제는 그 결과
**실효 듀레이션 16년짜리 상품이 "가장 안전"으로 표시되고**(스트레스도 0.0824 × −33.92% ≈ −2.8%),
정작 그 상품의 진짜 위험인 금리위험은 앱 어디에도 잡히지 않는다는 점이다. 또 같은 종목을 MC는
채권으로 보고 경고하는데(`bondsWithoutRiskAssumption`) Risk는 주식으로 보고 있어 두 화면이 다른 말을 했다.

**구현**: js/09 `resolveMarketRiskBenchmark` — 원장 entry를 읽은 직후 `assetClass === 'BOND'`이면
`unresolved('bondAssetClass')`. 앱 카테고리 '채권'은 그 위 `notEquityLike`에서 이미 걸러지므로,
이 줄은 **ETF로 등록된 채권형 상품**을 같은 기준으로 다룬다.
새 정책이 아니라 기존 정책(PD-15 "채권은 포트폴리오 베타 집계 대상이 아니다")을
**사용자가 고른 카테고리가 아니라 원장의 A등급 사실**로 적용한 것이다.

**화면**: js/10 `betaUnavailableReasonsNoteHtml` — 사유가 `bondAssetClass`이면
"채권형 상품이라 주식 시장위험 집계에서 제외했습니다(금리 위험은 따로 계산하지 않습니다)".
"기준 지수를 확정하지 못했다"와 **구분해서** 말한다.

**변경하지 않은 것**: Bond Risk · Duration · Modified Duration · ±100bp · MC · Tracking Beta ·
Portfolio Beta 공식 · Stress 상수.

**원장 58건 판정(갱신)**: KR 21 → KOSPI · GLOBAL 1 → KOSPI · **US 34 → SP500** · **채권 자산군 2 → 대상 아님**.

### 52-2. D2-Q2 — KOSDAQ은 원장을 확대하지 않는다

**결정**: 승인된 Exposure 근거가 없으면 Market Beta는 UNRESOLVED로 둔다. 원장을 대량 생성하지 않는다.
**[v267 단서 · §53-2]** "원장 대량 생성 금지"는 **그대로 유지**된다(원장은 여전히 58건이다).
KOSDAQ 커버리지는 원장 확대가 아니라 **§51-3의 근거 원천 확장**으로 해결했다 — 실행 시점에
공식 종목 마스터의 증권그룹구분을 읽어 판정하고, 원장에는 한 줄도 쓰지 않는다.
**확인 결과**(코드 변경 없음): 종목 마스터의 KOSDAQ 종목 1,822건, Exposure Master의 KOSDAQ 항목 **0건**.
실제 코스닥 종목을 넣으면 Market Beta는 `exposureUnconfirmed`로 미확정이고, 화면은
"비교할 기준 지수가 확정되지 않았습니다"로 표시한다. D-2의 KOSDAQ 분기 자체는 유지한다
(합성 원장으로 동작을 검증해 두었다 — test/d2-market-beta-policy.test.js B · B-2).

### 52-3. UX-1 — Monte Carlo가 막힐 때의 안내

**문제**: 검증기(js/16)와 컨트롤러(js/18)·워커(js/17)는 사유를 만들어 전달하는데,
js/19:756이 `error.code`만 보고 `error.message`를 버려 **「입력값을 확인해주세요.」만** 남았다.
사용자는 무엇을 고쳐야 하는지 알 수 없었다(실제 사유는 `instruments가 비어있습니다.`였다).

**구현**(js/19): 새 검증기를 만들지 않고 기존 결과만 번역한다.
- `MC_USER_REASON_RULES` — 검증기가 내는 문구를 사용자 문장으로 옮기는 표(13개 규칙).
- `monteCarloUserReason(message)` — 규칙에 맞으면 사용자 문장, 어댑터가 만든 한국어 사유는 그대로 통과,
  **짝이 없으면 null**(개발 용어를 화면에 내보내지 않고, 원인을 추측해 지어내지도 않는다).
- 실행 직전 preflight: 계산에 넣을 자산이 0개면 진행바를 띄우지 않고 바로 안내한다
  (이미 호출해 둔 `feeDisplayResult`를 그대로 쓴다 — 추가 계산 없음).
- 실패 처리: 예전에는 DATA_ERROR만 사유를 덧붙였는데, 이제 사용자 말로 옮길 수 있는 사유가 있으면 코드와 무관하게 덧붙인다.

**결과**: "미래 예측에 넣을 자산이 없습니다. 주식·ETF 자산을 등록하고 수익률 관리에서 기준을 정한 뒤
다시 실행해 주세요." · 개발 용어 노출 0.
**MC 계산 엔진 · seed · 분포 · 정상 결과 경로는 변경하지 않았다.**

### 52-4. UX-3 — 거래 저장 직후 불일치 알림

**정책 무변경**: `positionSource === 'manual'` 자산의 수량·매입단가를 거래원장이 덮어쓰지 않는다.
사용자가 저장한 값을 지키는 것이 최우선이다.
**바뀐 것은 알려주는 시점뿐**이다 — 예전에는 자산 상세 팝업을 열어야만 불일치를 알 수 있었다.

js/06 `notifyManualAssetMismatchAfterSave(asset)` — 저장 성공 직후 기존
`assessPositionConsistency()` 판정을 그대로 재사용해 MANUAL_WITH_TX · LEDGER_UNKNOWN이면
경고 토스트 한 줄을 덧붙인다. 새 진단 체계를 만들지 않았고, 자산 상세의 상세 비교 안내는 그대로다.

### 52-5. UX-4 — 검색 안내문 정정

실측: 보유하지 않은 「삼성전자」도 한글 종목명으로 정상 검색된다. 기존 안내문의
"한글 종목명(**보유 중인 종목 한정**)"은 사실과 달라 사용자가 한글 검색을 시도조차 하지 않게 만들었다.
문구만 고쳤다(index.html `#stockSearchHint` · js/04 두 갈래).
**검색 API · 검색 알고리즘 · 결과 구성은 변경하지 않았다** — 같은 이름이 여러 개 나올 때
거래소·국내/해외 표시를 보고 고르라는 안내를 덧붙였다.

### 52-6. UX-6 — 모바일 터치 타깃 44px

두 가지 방식을 용도에 맞게 나눠 썼다(둘 다 글자·아이콘 크기는 그대로 둔다).
- `.tap44` (index.html) — `::after`로 **눌리는 범위만** 44px로 넓힌다. 문서 흐름에 들어가지 않아
  레이아웃·밀도가 전혀 바뀌지 않는다. 적용: ⓘ 툴팁 버튼 6곳(js/10 5 · js/05 1) ·
  `#portfolioRiskInfoBtn` · `.detail-btn` · 헤더 갱신 버튼 2개 · 리스크 아코디언 · 토스트 닫기(js/07).
- `min-height: 44px` — 폼 컨트롤·목록 버튼은 겹침으로 옆 요소의 터치를 가로채지 않도록
  **컨트롤 자체**를 키운다. 적용: 자산/거래 필터 셀렉트·버튼 · 거래 추가 · 거래백업/거래등록 ·
  기간 이동(◀▶) · 손익 기간 세그먼트 · 포지션 분석 카드 행.

**결과**: 375 · 390 × Light/Dark × 4개 탭에서 44px 미만 터치 대상 **0건** · 가로 넘침 0 · 14px 미만 글자 0.

### 52-7. UX-7 — 총자산 발견성 · 반올림 0%

- 기존 「금융자산 평가금액」 보조 줄에 **「· 부동산 포함 총자산 n원 (자세히는 「총자산현황」 탭)」** 한 칸을
  덧붙였다. 새 카드를 만들지 않았고 값은 `renderKPIs`가 이미 합산해 둔 `totalCur`을 그대로 쓴다(새 계산 없음).
  (이 자리의 원래 주석이 "부동산 포함 전체 금액은 총자산현황 탭에 있다는 점만 짧게 안내한다"고
  적어 두었는데 화면에는 그 안내가 빠져 있었다.)
- 손익 금액이 0이 아닌데 비율이 반올림으로 0%가 되면 "변동 없음"으로 읽힌다 →
  그 경우에만 **「+0.01% 미만」**으로 표시한다. `dailyProfitRate` 계산값은 건드리지 않았다.

### 52-8. UX-8 — 문구와 줄바꿈

① **줄 시작 정렬**: 아이콘이 본문과 같은 문단 안에 인라인으로 있던 안내문 19곳을
`hangingIndentLine()`과 **같은 구조**(flex + `shrink-0` 아이콘 + `min-w-0` 본문)로 바꿨다 —
둘째 줄이 아이콘 아래가 아니라 본문 시작점에 맞는다. 짧은 제목(줄바꿈이 없는 것)은 건드리지 않았다.
적용: js/10 16곳 · js/05 1곳 · js/08 2곳.

② **문맥 줄바꿈**: `break-keep`은 한글 단어 내부만 막고 단어 사이는 막지 못한다. 375px에서 실측된
네 구절을 앱이 이미 쓰던 `whitespace-nowrap` 패턴으로 묶었다 —
「시장 민감도(베타)」(여는 괄호에서 갈라지던 문제) · 「종목 n개」 · 「최근 n거래일」 ×2.
문장 자체는 바꾸지 않았고, 화면 밖으로 넘치지 않는 길이만 묶었다(넘침 0 확인).

③ **Tracking Beta 설명**: 실측 결과 개별 주식(005930.KS · AAPL)도 추적 베타 집계에 들어간다
(coverage 100% · missing 0). 원장이 국내 개별주에는 상장 시장 지수를, 해외 개별주에는 원장에 적힌
지수를 "기초지수"로 부여하기 때문이다. 그런데 툴팁은 "개별 주식은 … 이 값에 들어가지 않습니다"라고
말하고 있었다. **계산·coverage는 그대로 두고 문구만** 사실에 맞췄다.

### 52-9. UX-9 — 수익률 0%인데 미래 금액이 커지는 이유

「지금 계획대로면 … 0%」인데 20년 후 금액이 크게 나와 오해할 수 있었다. 계산은 맞다(현재 자산 + 납입 누계).
설명 한 문장만 덧붙였다 — "수익률이 0%여도 매달 넣는 돈이 쌓이기 때문에 미래 금액은 늘어납니다."
MC 지표 · 계산식 · seed · 분포 · 수익률 · 변동성 · 상관관계는 변경하지 않았다.

### 52-10. NO CODE CHANGE로 확정한 것

- **UX-2 최초 자산 등록 진입점**: ⚙ → 데이터 관리 → 최초등록 구조를 그대로 둔다.
  자산 추가 버튼 신설 · 진입점 이동 · 온보딩 · Wizard · 홈 카드 추가 전부 하지 않았다.
- **UX-5 「Monte Carlo 실행」 버튼명**: 그대로 둔다.

### 52-11. 측정 결과 (D-2 → 최종 · 2026-09-22)

**Risk 회귀 하네스**(FROZEN · 합성 7종목): riskScore 45 · portfolioBeta 0.931428547 ·
변동성 14.83527456 · VaR −1.075213608 · CVaR −1.211565192 · MDD −2.662509179 · 상관 0.9022471287 —
**D-2 측정과 전부 동일**, 종목별 benchmarkKey · beta · alignment도 **한 줄도 다르지 않다**
(이 fixture에는 채권 자산군 종목이 없다).

**Monte Carlo**(seed 20260101 · 2,000회 · 20년): P10 · P50 · P90 · 평균 **0.00%** ·
μ지문 `af875582fc001dc2` / `a36f5ba2112d4d44` **동일** · σ 변경 0건.
기록: `docs/closeout/measurements/mc-final-v266.json`

**게이트**: Unit 718/718 · E2E(신규 10 포함) · ESLint 0 · Data Guard PASS · Secret Scan 신규 0 ·
Release Guard PASS · 375/390/1440 × Light/Dark PASS.

### 52-12. 팝업 잔여 UX 수정 (PM 추가 승인 2026-09-22)

최종 UX 감사에서 보고한 팝업 항목 중 PM이 승인한 4건을 반영했다. 계산 · 데이터 · 정책은 손대지 않았다.

| # | 내용 | 구현 |
| --- | --- | --- |
| T-2 | 거래등록 팝업 닫기 버튼이 16px이라 누르기 어려웠다 | 이 프로젝트가 이미 쓰는 관례(`w-11 h-11 -mr-2 flex items-center justify-center` + `aria-label="닫기"`, 예: #closeMcInfoModalBtn)를 그대로 적용 → **44×44**. 아이콘 크기 · 헤더 높이 · 팝업 길이 무변경 |
| A-3 | 최초 자산등록 팝업 닫기 버튼 동일 문제 | 같은 관례 적용 + `type="button"` 추가 — 이 버튼은 `<form>` 안에 있어 type이 없으면 브라우저 기본값이 submit이다 |
| T-3 | 거래등록 저장 버튼에 식별자가 없었다(취소에는 있었다) | `id="txFormSubmitBtn"` · `aria-label="거래 내역 저장"`. 이름은 자산 폼의 기존 관례(`assetFormSubmitBtn`)를 따랐다. 문구 · 동작 무변경 |
| A-2 | 입력칸 12개 중 ①~④에만 번호가 붙어 "이것만 채우면 되나"로 읽혔다 | 확인 결과 번호는 임의가 아니라 **사용자가 직접 입력하는 네 칸**을 가리키고 있었다(나머지는 검색 결과로 자동 채워지거나 읽기 전용). 새 단계 · 새 설명 블록을 만들지 않고 **이미 있던 안내문 한 줄에 그 뜻만 밝혔다** |

검증: 375 · 1440에서 닫기 버튼 44×44 · 정상 닫힘 · 가로 넘침 0 (e2e/114 F-8 · F-9 · F-10).

### 52-13. 구현하지 않은 두 건과 그 이유

**① A-1 「빈칸 저장 무반응」 — 보고가 틀렸다. 고칠 것이 없다.**

최종 UX 감사에서 "안내 0건 · 무반응"으로 보고했으나 재확인 결과 **그 보고가 잘못이었다** —
측정 스크립트가 `showToast`만 가로채고 `window.alert`를 가로채지 않아 놓친 것이다.
실제 동작(브라우저 재현 확인):

| 상황 | 실제 안내 | 결과 |
| --- | --- | --- |
| 전부 빈 값 | `alert('종목명을 입력해주세요.')` (js/07-table-render-modals.js:1042) | 저장 안 함 · 팝업 유지 |
| 소유자 미선택 | `showToast('소유자를 신랑 또는 와이프 중에서 선택해주세요.', 'warn')` | 저장 안 함 · 입력값 보존 |
| 수량 0 | `showToast('수량은 0보다 커야 합니다.', 'warn')` | 저장 안 함 · 입력값 보존 |

세 경우 모두 안내가 나오고, 저장되지 않으며, 팝업이 유지되고 입력값이 보존된다. **무반응은 없다.**
남는 것은 같은 폼 안에서 첫 검증만 `alert()`를 쓰고 나머지는 토스트를 쓴다는 일관성 문제인데,
`alert()`는 이 앱 전반(5개 파일 28곳)의 기존 패턴이고 일부 E2E가 dialog 이벤트에 의존한다
(e2e/20 · e2e/112). 임의로 바꾸면 범위가 커지므로 **PM 결정 사항으로 남긴다.**

**② 「위험 관리」 영역 → 위험점수 ⓘ 팝업 통합 — 아래 충돌을 보고한 뒤 PM이 "삭제"로 최종 결정. 실행 완료.**

지시는 `⚠️ 위험 관리` 영역(제목 + 진단 대상 고지)을 ⓘ 팝업 안으로 옮기라는 것이었다.
구현 전 추적 결과, **옮기려는 두 요소가 각각 이미 확정·릴리스된 PM 결정에 묶여 있다.**

| 요소 | 묶여 있는 결정 | 근거 |
| --- | --- | --- |
| `<h3>위험 관리</h3>` 제목 | **§46 TXT-46-2** 화면 명칭 4개 확정(「RISK 관리」→「위험 관리」) | SoT 2628행 · test/wording-review.test.js가 `>위험 관리</h3>` 문자열을 고정 · e2e/101 D · e2e/107:209 · e2e/79 E |
| `#riskScopeNote` 진단 대상 고지 | **V1.3 P1-1 · RESOLVED / v226 RELEASE PASS** — "툴팁이 아니라 점수가 보이는 자리에 **상시 노출**" | SoT 609행 · **SoT 3423행 보존 목록에 "`#riskScopeNote` 상시 노출(V1.3 P1-1)" 명시** · e2e/72 A-1 · e2e/40(3곳) · e2e/111:447 · e2e/101:125 |

그리고 **지시의 목적은 이미 달성되어 있다** — ⓘ 팝업(`#portfolioRiskInfoModal`)에는
「누구 기준인가(가구 전체 합산)」 · 「무엇이 대상인가(주식·ETF)」 ·
「현금 · 채권 · 부동산은 빠집니다」가 **이미 전부 들어 있다**(index.html 2797~2810행).
2026-09-21 지시로 6대 요인 설명을 팝업으로 옮길 때 같은 내용을 함께 넣었고,
그때 `#riskScopeNote`만 V1.3 P1-1 때문에 화면에 남긴 것이 index.html 주석에 기록되어 있다.

따라서 남은 작업은 "정보 이동"이 아니라 **화면에서의 제거**뿐이고, 그 제거가 위 두 결정과 정면으로 충돌한다.
§14에 따라 임의로 진행하지 않고 PM 결정을 요청했다.

**PM 최종 결정(2026-09-22): 해당 영역을 삭제한다.** 이에 따라 다음을 실행했다.

| 대상 | 조치 |
| --- | --- |
| `<h3>위험 관리</h3>` 제목 블록 | index.html에서 **제거** |
| `#riskScopeNote` (진단 대상 고지) | index.html에서 **제거** · js/03 `updateRealEstateGuidanceText()`의 해당 `setText` 호출도 함께 제거(죽은 코드) |
| ⓘ 팝업 `#portfolioRiskInfoModal` | **변경 없음** — 같은 설명(가구 전체 합산 · 주식·ETF · 현금/채권/부동산 제외)이 이미 들어 있다 |
| 위험 경고 팝업 `riskAlertModal`의 진단 대상 줄 | **유지** — 다른 자리의 별도 고지이며 이번 삭제 대상이 아니다 |

**개정되는 기존 정책 2건**
- **V1.3 P1-1** — "메인 RISK 카드에 `#riskScopeNote` 상시 노출"은 이 결정으로 **개정**된다.
  범위 고지 자체는 없어지지 않고 ⓘ 팝업과 위험 경고 팝업 두 자리에 남는다.
  §50-18(보존 목록)의 "`#riskScopeNote` 상시 노출(V1.3 P1-1)" 항목은 이 절로 대체된다.
- **§46 TXT-46-2** — 화면 명칭 4개 중 「위험 관리」 제목 항목이 **빠진다**(나머지 3개와 옛 이름 금지는 그대로).

**바뀌지 않은 것**: 위험점수 계산 · 등급 · 6대 요인 · 진단 대상 집합(`RISK_ELIGIBLE_CATEGORIES = ['주식','ETF']`) ·
Portfolio/Market/Tracking Beta · Bond Risk · 위험 감지 건수 · 경고 발생 조건 · Risk 화면의 나머지 카드 배치.
회귀 하네스 · MC 측정값 모두 삭제 전과 동일하다.

**갱신한 테스트**(계약을 없애지 않고 확인 지점만 이동)
e2e/72 A-1 · B · G · E/F(→ ⓘ 팝업에서 검사) · e2e/101 D · e2e/107 D · e2e/79 E ·
e2e/111 "11" · test/wording-review.test.js §46 TXT-46-2.

---

## 53. 통합 자동화 — 앱이 아는 사실은 다시 묻지 않는다 (PM FINAL AUTOMATION IMPLEMENTATION 2026-09-22 · v267)

> 기준: [FINAL READ-ONLY 2차 자동화 조사] 결과. 이번 작업은 **데이터 판정의 자동화**이며
> 계산 모델(Risk Score 산식 · Beta 산식 · MC 엔진/seed/분포/상관 · Return Key μ · CMA · Bond Risk)은
> 한 줄도 바꾸지 않았다. 회귀로 확인했다 — Risk 하네스 전 지표가 v266 승인 baseline과 완전히 같고,
> MC는 두 시나리오 모두 p10/p50/p90/평균 변화 0.00% · μ 지문 동일 · σ 변경 0건이다.

### 53-1. 원칙

| 상황 | 처리 |
| --- | --- |
| 사용자가 확정한 값 | **보호** — 공식 원천이 달라도 자동으로 덮지 않고 충돌로 알린다 |
| 공식 원천 + 결정론적 규칙으로 판단 가능 | **AUTO** — 다시 묻지 않는다 |
| 출처끼리 어긋남 · 근거 없음 | **REVIEW / UNRESOLVED** — 사유를 구체적으로 말한다 |
| 실제 거래 사실(수량 · 체결가 · 거래일) | **사용자 입력** — 만들어내지 않는다 |
| 투자 전략(목표비중 · 적립금 · 역할 · 수익률 확정) | **사용자 결정** — 대신하지 않는다 |

우선순위: `USER CONFIRMED > OFFICIAL FACT > MASTER > DETERMINISTIC RESOLVER > FALLBACK > REVIEW`

### 53-2. 승인된 A등급 사실원천 (§51-3 개정 · PC-1 · PC-2)

경제적 노출시장의 근거로 인정하는 원천을 다음 셋으로 확정한다. 전부 EG 규칙이 이미 A등급으로
정의한 1차 자료다(새 등급을 만들지 않았다).

1. **Exposure Master** — 상품 구조 · 공식 기초지수 · 환헤지 · 혼합노출 · 사용자 override (최우선)
2. **KIS 공식 종목마스터의 증권그룹구분** — 국내 상장 증권의 종류
3. **거래소 공식 종목 디렉터리** — 미국 상장 증권의 ETF 플래그 · 증권 클래스

**여전히 근거가 아닌 것**: 티커 접미사 단독 · 상장 거래소 단독 · ISIN 국가코드 · 티커 문자열 ·
상품명("미국"이 들어갔다는 사실). 근거가 없으면 미확정이다.

**원장은 확대하지 않는다.** 판정은 실행 시점(runtime)에 한다 — `marketExposure`를 소비하는 곳은
js/09 두 곳뿐이고 MC는 이 값을 읽지 않으므로(MC는 `assetClass` 경로), 원장에 줄을 추가하지 않으면
MC가 **구조적으로** 영향받지 않는다. 원장은 예외 · 상품구조 · 사용자 지정 담당으로 남는다.

| 구현 | 위치 |
| --- | --- |
| `resolveInstrumentFacts(ticker)` · `resolveUsSecurityVerdict(rec)` · `categoryFromInstrumentFacts(ticker)` | js/01 |
| `KR_SECURITY_GROUP_CATEGORY` · `KR_AUTO_EXPOSURE_GROUPS` · `EXCHANGE_TO_MARKET` | js/01 |
| `resolveRuntimeMarketExposure(a)` · `krExposureReasonFor(group)` | js/09 |
| 종목 마스터 필드 확장(`securityGroup` · `securityType` · `currency` · `drFlag` · `drCountry` · `isEtf` · `securityName`) | scripts/update-ticker-master.js (schemaVersion 2) |

### 53-3. 국내 판정 규칙 (PC-3 · PC-4)

증권그룹구분 실측 분포(2026-09-22) — KOSPI: ST 892 · EF 1,176 · RT 23 · DR 1 · FS 1 · MF/IF/PF 5 /
KOSDAQ: ST 1,803 · FS 11 · DR 9. 합계 **ST 2,695건**.

| 증권그룹 | 자산군 | Market Exposure | 사유 코드 |
| --- | --- | --- | --- |
| **ST** 주권(보통주 · **우선주**) | 주식 | **KR → 상장시장 지수(KOSPI/KOSDAQ)** | — |
| **EF** ETF | ETF | 미확정 | `etfNeedsOfficialIndex` |
| **RT** 부동산투자회사 | **주식** | 미확정 | `reitExposureUnconfirmed` |
| **DR** 주식예탁증서 | 주식 | 미확정 | `depositaryReceipt` |
| **FS** 외국주권 | 주식 | 미확정 | `foreignListedSecurity` |
| MF · IF · PF | (이름 규칙) | 미확정 | `securityGroupNotAutoResolved` |

**RT를 '부동산'으로 두지 않는 이유**: 상장 리츠는 매일 호가가 서는 거래 종목인데 '부동산'은
`NON_TRADABLE_CATEGORIES`라 시세 조회 대상에서 빠진다 — 평가금액이 멈춘다. 실물 부동산과 상장
리츠는 다른 자산이므로 '주식'(거래되는 지분증권)으로 둔다. **PM 지시의 "RT → 부동산형" 문구에서
벗어난 유일한 항목이며, 그 사유는 데이터 손실 방지다.**

### 53-4. 미국 판정 규칙 — 교차검증 (PC-3 · HOME_COMMON_RULE_V2)

단일 원천으로는 판정할 수 없다는 것이 실측 결론이다.
· KIS DR 필드만 쓰면 알려진 ADR 20건 중 8건만 잡힌다(ASML · JD · BABA가 'N')
· 거래소 증권클래스만 쓰면 BP · TM · RIO · BBVA · MUFG 등이 'Common Stock'으로 적혀 통과한다
두 원천의 **놓치는 지점이 다르므로** 배제 신호를 합집합으로 쓴다.

판정 순서 — ① ETF 플래그/증권유형 3 → ETF ② 예탁증서 신호(DR 필드 Y · 한글명 (ADR)/(ADS) ·
영문명 ADR/ADS/SPON/DEPOSITARY/NY REGISTRY) → 배제 ③ 비보통주 클래스(Ordinary Shares ·
American Depositary Shares · Subordinate Voting · Closed End Fund · Preferred · Warrant · Unit · Right)
→ 배제 ④ 외국 법인격 표기(N.V. · PLC · S.A. · A/S · Ltd · Limited 등) → 배제
⑤ 거래소가 "Common Stock"으로 표기 → **HOME_COMMON(S&P500)** ⑥ 그 외 → REVIEW

실측 정확도: 알려진 ADR **20/20 배제** · 미국 본국주 30건 중 **28건 자동확정**(V · T는 거래소가
증권 클래스를 적지 않아 REVIEW) · 외국 직상장 11건 중 9건 배제.
전체 13,805 심볼 → ETF 6,104 · 배제 1,838 · **자동확정 3,875** · REVIEW 968(7.0%).

**남는 한계(정직하게 기록)**: Royal Caribbean Cruises Ltd처럼 외국 설립이면서 거래소가
"Common Stock"으로 표기하는 종목은 이 규칙으로 걸러지지 않는다. SEC EDGAR(10-K vs 20-F ·
stateOfIncorporation)만이 확정할 수 있는데 이번 조사에서 접근 검증에 실패했다(HTTP 403 ·
연락처 User-Agent 필요). **SEC를 필수 의존성으로 만들지 않았다** — 검증된 원천만으로 가능한
범위까지만 자동화했다. 도입 여부는 PM 결정 사항으로 남긴다(§53-10).

### 53-5. 자산군 자동 판정 (PC-5)

`classifyCategory(ticker, name)`에 원천 사실 계층을 끼웠다. 순서는 **ISIN(채권) → 원천 사실 →
기존 이름 규칙**이다. 마스터에 없으면 예전 규칙이 그대로 돌아간다(후퇴 없음).

왜 필요했나: 코스피 상장 2,098건 중 **1,176건(56%)이 ETF**인데, 이름에 브랜드 문자열
(TIGER · KODEX 등)이 없으면 '주식'으로 떨어졌다. 추측이 필요 없는 자리였다.

**기존 저장 데이터를 일괄 변환하지 않는다.** 런타임 판정만 바꿨고, 사용자가 확정한 자산군
(`categorySource === 'user'`)은 호출부가 먼저 가로채므로 이 함수까지 오지 않는다.

### 53-6. 두 베타 경로 정합성

v266에는 같은 종목에 대해 **Market Beta는 미확정인데 Tracking Beta는 상장시장 지수로 계산되는**
불일치가 있었다(실측: 140860.KQ · 005385.KS). `resolveRiskBenchmark` 분기 ③이 종목 마스터의
상장거래소만 보고 지수를 배정하고 있었기 때문이다. 이제 두 경로가 같은 사실 계층을 본다.

### 53-7. 통화 자동 확정

우선순위: 채권 원장 · 저장된 자산(확정) → Exposure Master `priceCcy` → **공식 종목마스터 통화(신규)**
→ 식별자 힌트 → 호출부 입력. 근거끼리 어긋나면 덮지 않고 `conflicts`로 알린다(PD-03 그대로).

**혼동 금지**: 거래통화 · `priceCcy`(가격계열 통화) · `underlyingCcy`(기초자산 통화) · 환산통화는
서로 다른 축이다. 국내 상장 해외 ETF는 `priceCcy = KRW`이고 기초자산은 USD다 — 하나를 다른
것으로 적용하면 환율이 이중 적용된다. 이번 변경은 **거래통화와 priceCcy 축만** 다룬다.

### 53-8. 나머지 자동화

| 항목 | 내용 | 위치 |
| --- | --- | --- |
| 자산 등록 폼 | 거래 폼과 같은 판정기(`resolveInstrumentMetadata`)를 쓴다. 예전에는 이 폼만 이름 키워드에 기댔다 | js/07 `autoClassifyModal` |
| 통화 확정 시점 | 시세 조회 응답이 아니라 공식 마스터에서 먼저 정한다(조회 실패해도 통화는 확정된다) | js/07 `applyStockPickToAssetForm` |
| 채권 자동 조회 | ISIN 형식이 완성되면 [조회] 없이 공식 발행조건을 불러온다(조회 경로 · 결과 처리 무변경) | js/07 `f_bondIsin` input |
| 거래일 기본값 | 주말이면 직전 영업일(공휴일은 모른다 — 사용자가 고친다) | js/01 `defaultTradeDateStr` |
| 거래유형 기본값 | 보유가 0이면 매수. 사용자가 직접 고르면 그 뒤로 덮지 않는다 | js/06 `applyDefaultTransactionType` |
| 중복 거래 탐지 | 날짜 · 종목 · 소유자 · 계좌 · 유형 · 수량 · 단가가 같으면 저장 전에 확인(막지는 않는다) | js/06 |
| Risk 자동 진단 | 베타 미산출 사유 24종을 종목마다 사용자 말로 표시 | js/10 `BETA_UNRESOLVED_SOURCE_TEXT` |
| MC 사전 표시 | BLOCK이 아닌 주의사항도 **실행 전에** 보여 준다(결과를 본 뒤가 아니라) | js/19 |
| Excel 사전검증 | 적용 전에 이상한 행을 세어 확인 화면에 요약(가져오기 규칙 무변경) | js/12 `buildExcelImportPreflight` |
| 백업 무결성 | sha256 체크섬 + schemaVersion. 표식 없는 옛 백업은 예전처럼 복원된다 | js/12 `computeBackupChecksum` |

### 53-9. 동기화 — 진짜 충돌만 묻는다 (PC-6)

v266까지는 "의미 있는 차이"가 하나라도 있으면 무조건 방향 선택을 요구했다. 다른 기기에서 거래
하나를 추가한 정상 상황까지 매번 물었다. 이제 **손실이 생길 수 있는 경우만** 멈춘다.

| 차이 | 판정 | 근거 |
| --- | --- | --- |
| 로컬에만 있고 직전 동기화에 없던 항목 | **자동 병합** | 이 기기가 새로 만든 것 — 병합해도 남는다 |
| 원격에만 있는 항목 | **자동 병합** | 추가되거나, 이 기기가 지운 상태가 유지된다 |
| 로컬에만 있고 직전 동기화에 있던 항목 | **REVIEW** | 원격이 지웠다는 뜻 — 병합하면 사라진다 |
| 이 기기가 지운 항목을 저쪽이 갖고 있음 | **REVIEW** | 삭제 vs 수정 — 병합하면 저쪽 수정이 사라진다 |
| 같은 항목의 값이 다름 | **REVIEW** | 최종수정 우선으로 한쪽이 덮인다 |
| 목표비중 · 미래예측 설정 변경 | **REVIEW** | 통째로 덮어쓴다 |

구현: js/12 `syncDifferenceNeedsReview(diff)` — 기존 `mergeCollectionById` · `lastSyncedIds` 기준선을
그대로 재사용한다.

**[범위 축소 · 구현 중 확인]** PM 지시 §21은 "같은 ID인데 **한쪽만** lastSynced 이후 변경 → 자동 병합"도
요구했으나 **구현하지 않았다.** 지금 앱이 가진 메타데이터로는 그것을 안전하게 가릴 수 없기 때문이다 —
레코드마다 `updatedAt`이 있고 기기마다 마지막 동기화 시각이 **하나** 있을 뿐이라,
"내 변경은 이미 올렸다(`updatedAt < lastSyncedAt`)"와 "클라우드 값이 내 상태의 후속이다"를 구분하지 못한다.
실제 손실 경로를 회귀 테스트가 잡았다(e2e/89 S-04) — 휴대폰이 수량 120으로 고쳐 올린 뒤 PC가
[이 기기 데이터 올리기]로 100을 덮어쓰면, 휴대폰에서는 자기 변경이 "이미 동기화된 것"으로 보여
자동 병합 대상이 되고 **120이 조용히 사라진다.**
안전하게 하려면 레코드별 "마지막으로 동기화된 값"(해시 또는 버전 벡터)이 필요한데 이는 저장 구조 변경이다.
**§53-10의 PM 결정 대기 항목으로 남긴다.** 값이 다르면 지금은 무조건 확인받는다.

### 53-10. 하지 않은 것 · PM 결정이 남은 것

| 항목 | 상태 | 사유 |
| --- | --- | --- |
| Return Key 자동 확정 | **하지 않음** | D-16 유지. 추천만 자동, 적용은 사용자. μ 불변 |
| CMA ACTIVE 자동 승격 | **하지 않음** | 모델 입력 변경 — PM 승인 유지 |
| SEC EDGAR 연결 | **하지 않음** | **차단 사유 정정(실측 2026-09-22)**: 403의 본문은 "Request Rate Threshold Exceeded"로, User-Agent 연락처 문제가 아니라 **이 개발 PC 네트워크의 IP 차단**이다. UA를 네 가지로 바꿔도 모두 403이고 `data.sec.gov`도 같다. SEC 자료 자체는 **무료 · 공개 · 인증 불필요**이므로, GitHub Actions나 다른 네트워크에서는 접근될 가능성이 높다 — **환경 문제이지 데이터 확보 문제가 아니다** |
| 채권 API 프록시화 | **하지 않음** | 데이터 확보는 문제없다(앱이 이미 사용자 키로 받아오고 있다). 막고 있는 것은 **공공누리 제2유형(상업적 이용금지) 해석** 하나뿐이다 |
| ETF 기초지수 · 환헤지 자동 수집 | **하지 않음** | **원천 존재 확인(실측 2026-09-22)**: 공공데이터포털 금융위 `GetSecuritiesProductInfoService/getETFPriceInfo`가 키 미등록 오류(403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR)를 돌려준다 — **서비스가 실재한다**. `GetKrxListedInfoService`(상장종목정보)도 같다. OpenDART도 응답한다("등록되지 않은 인증키"). 남은 것은 **해당 서비스 활용신청 + 실제 응답 스키마 확인**이지 원천 부재가 아니다. KRX 직접 조회(data.krx.co.kr)는 세션을 요구해 "LOGOUT"만 반환하므로 쓰지 않는다 |
| 미국 외 해외시장 | **하지 않음** | **원천 존재 확인(실측 2026-09-22)**: KIS가 도쿄 · 홍콩 · 상해 · 심천 · 하노이 · 호치민 종목마스터를 모두 인증 없이 제공한다(전부 HTTP 200). 막는 것은 데이터가 아니라 **앱의 계산 코어가 KRW/USD 두 통화만 전제**한다는 점이다 — 통화 확장은 별도 프로젝트 |
| 동기화 "한쪽만 변경" 자동 병합 | **하지 않음** | 현재 메타데이터로 안전 판정 불가(§53-9). 레코드별 동기화 값 해시가 선행돼야 한다 — **PM 결정 필요** |
| 기존 저장 데이터 일괄 변환 | **하지 않음** | 런타임 판정만 바꿨다 |

### 53-11. 계산 영향

| 지표 | 영향 | 성격 |
| --- | --- | --- |
| Market Beta · Portfolio Beta · Risk Score · Stress | **산출 대상 확대** | EXISTING MODEL INPUT CORRECTION — 그동안 근거가 없어 비워 두던 입력이 공식 근거로 채워진 것. 산식 무변경 |
| Volatility · VaR · CVaR · MDD · Correlation | **변화 없음** | 가격 수익률 기반 · benchmark 무관 |
| MC · Return Key · CMA · Bond Risk | **변화 없음** | 실측 확인(전 지표 0.00% · μ 지문 동일) |
| Portfolio Value · P&L | **변화 가능** | 자산군 판정이 정확해지면 시세조회 대상이 달라질 수 있다. 사용자 확정값은 보호되고 저장값은 변환하지 않는다 |

**모델 변경이 아니다.** 새 베타 산식 · 새 Risk Score · 새 MC 분포를 만들지 않았다.
`RISK_MARKET_INDEX_BY_LISTING_EXCHANGE` · `RISK_US_EXPOSURE_MARKET_INDEX` ·
`RISK_ELIGIBLE_CATEGORIES` · `NON_TRADABLE_CATEGORIES` · `MIN_COMMON_RISK_RETURNS`는
전부 그대로이며 테스트가 고정하고 있다(test/v267-automation.test.js I · I-2).

### 53-12. 테스트

신규 — test/v267-automation.test.js(21) · e2e/115-v267-automation.spec.js(16).
갱신 — test/d2-market-beta-policy.test.js STEP 5(§51-3 개정 반영) ·
test/risk-engine.test.js Edge 섹터(신뢰도 57 → 72, D-2 이전 값 복귀).

---

## §54. 통합 개선 배치 — ETF 사용자 확인 · 연도별 추가 투자 · 채권 KIS 통합 (PM 지시 2026-09-22)

PM 지시문 [통합 개선 배치 — 최종 상세 구현 지시문](2026-09-22)의 확정 사항을 정책으로 등록한다.
범위는 E-01 · E-02 · E-03 · E-04 · B-01 · MC-01 · UX-01 일곱 항목뿐이며, 그 밖의 확장은 없다.

### 54-1. ETF Market Beta — 자동 우선 · 미확인은 사용자 확인 (E-01)

우선순위는 다음 순서로 고정한다.

1. **사용자 확정값**(`asset.marketBetaIndexOverride`) — 자동 판정이 덮어쓰지 않는다.
2. Exposure Master(승인된 원장 · A등급)
3. 공식 종목 마스터의 원천 사실(§53 v267 사실 계층)
4. 위 어느 것으로도 확인되지 않으면 **UNRESOLVED** — 화면에서 사용자에게 확인을 요청한다.

사용자가 고를 수 있는 값은 **앱이 실제로 Market Beta 기준으로 지원하는 지수**로 제한한다
(`USER_MARKET_BETA_INDEX_CHOICES` = KOSPI · KOSDAQ · SP500 · js/01). 목록 밖 값은 저장하지 않고
자동 판정으로 되돌린다 — 지원하지 않는 지수를 저장하면 "확인했는데도 계산되지 않는" 상태가 된다.

**금지**: 상품명에 "미국"/"코스피"가 있다는 이유, 미국 거래소 상장이라는 이유, 유사 ETF가 그렇다는
이유, ticker 문자열만으로 Market Beta를 확정하지 않는다.

사용자 확정값은 기존 게이트를 우회하지 않는다. 비동기 쌍(국내 상장 미국 ETF ↔ S&P500)은 D-05
환헤지 게이트를 그대로 지나며, 환헤지가 미선택이면 예전처럼 `hedgeUnconfirmed`로 막힌다.

**확인 자리는 두 곳이다.** 자산 입력 폼(신규 등록 · 수정)과 **자산 상세 팝업**이다.
후자가 반드시 필요하다 — 자산 입력 폼의 [수정] 진입점은 거래내역으로 관리되는 자산에서 숨겨지는데
(js/08 `tracked` 판정 · 거래가 SoT이므로 이 화면에서 못 고치게 하는 기존 정책), 정작 기준 지수와
환헤지를 확인해 줘야 하는 대상이 바로 그 자산들(이미 보유 중인 ETF · 주식)이다. 등록 시점에만
고를 수 있으면 "미확인 시 사용자 확인"이 실제로는 작동하지 않는다.
자산 상세의 확인 자리(`#assetDetailRiskConfirm` · js/08 `renderAssetDetailRiskConfirm`)는 주식 ·
ETF에만 보이고, 고른 값을 같은 종목의 보유분 전부에 적는다("이 상품이 무엇을 따라가는가"는 하나다).
"선택 안 함"으로 되돌리면 필드를 지워 자동 판정으로 되돌아간다 — 수량 · 매입가처럼 거래원장이
SoT인 값은 여기서 건드리지 않는다.

### 54-2. ETF 환헤지 — 사용자 선택이 SoT (E-02 §5)

`asset.fxHedgeStatus` ∈ { `HEDGED`, `UNHEDGED`, 미선택(=UNRESOLVED) }. 표현은 기존 채권 레코드
(js/29)의 enum을 그대로 재사용한다.

- 시스템은 이름 · ticker · "H" 문자 · 키워드로 **추정하지 않는다**. 미선택은 미선택으로 보존한다.
- 사용자 선택값은 저장 · reload · Excel Export/Import · Backup/Restore · Sync에서 유지된다.
  동기화 차이 확인(js/25 `SYNC_DIFF_ASSET_FIELDS`)에 포함되어 다른 기기가 조용히 덮어쓰지 못한다.

### 54-3. MC 환헤지 반영 — **PM 결정 1 · A안 확정 (2026-09-22)** (E-02 §6)

#### 조사 결과(변경 전 실측)

| 확인 항목 | 실측 결과 |
| --- | --- |
| js/15 · 16 · 17 · 18의 FX · 환율 · KRW 변환 코드 | **없음**(H.10 · FX adjustment 어느 것도 MC 경로에 없다) |
| 환율 영향이 들어 있는 곳 | 원화 기준 CMA 자산군의 μ/σ/상관 **안에** |
| 기존에 환헤지가 MC에 반영되던 방식 | 해외채권만 — `hedgeStatus` → 자산군 → 원문의 환헤지/환노출 **행 선택** |
| 변경 전 US_EQUITY 위험 출처 | PRIMARY(AllianzGI) · **USD 기준** `North America Equities` σ 16.6% |
| 변경 전 주식 상관 출처 | **이미 전부 JPM Benchmark**(AllianzGI 상관은 VERSUS_REFERENCE 형식이라 쌍 값을 주지 못한다) |

#### PM 결정 1 (확정)

**A안 채택.** HEDGED / UNHEDGED는 **동일 provider · 동일 자산군 · 동일 기준의 pair**로 처리한다.
혼합(C안 — AllianzGI 환노출 + JPM 환헤지)은 **금지**한다.

그래서 US_EQUITY의 위험(σ · 상관) 출처를 J.P. Morgan으로 옮겨 같은 원문의 짝을 만들었다.

| 앱 자산군 | JPM LTCMA 2026 KRW 행 | 기대수익률 | 변동성 |
| --- | --- | --- | --- |
| `US_EQUITY`(환노출) | `U.S. Large Cap` | 4.7% | **13.722309014388456%** |
| `US_EQUITY_HEDGED`(환헤지) | `U.S. Large Cap hedged` | 5.8% | **16.639771092531690%** |

두 행의 차이(**+2.917%p**)가 이 원문이 말하는 환율 효과다. 환헤지 쪽 변동성이 더 큰 것은 원화가
미국 주식과 음의 상관을 가져 **환노출이 원화 기준 변동성을 낮추기** 때문이며, 원문 값 그대로다.

**이 변경은 σ와 상관의 출처를 일치시킨다.** 상관은 이전부터 JPM에서 왔으므로, 실측 결과
US_EQUITY의 상관값은 **하나도 바뀌지 않았다**(0.4124456921608721 등 그대로).

#### 적용 범위

- 바뀌는 것: `US_EQUITY`의 σ(16.6 → 13.722) · `US_EQUITY_HEDGED` 신설(σ 16.640).
- **바뀌지 않는 것**: μ(Return Key 경로 · 두 자산군의 `returnUsableForMc`는 false 유지 · §37-5) ·
  MC 엔진 · seed · 분포 · 상관 구조 · Risk Score · Portfolio Beta · Tracking Beta ·
  Bond · KR_EQUITY(29.4%) · EM_EQUITY(24.4%).
- 연결 지점: `js/16 applyUserHedgeToAppClass` — 사용자가 **HEDGED로 확정한 경우에만** 환헤지
  자산군으로 바꾼다. 미선택(UNRESOLVED)은 추정하지 않고 `US_EQUITY` 그대로 둔다(= 원문상 환노출).
- 국내 주식 · 신흥국 주식은 원문에 환헤지 행이 없어 대상이 아니다
  (`data/cma/app-asset-class-map.json`의 `unmapped`에 사유 기록).

#### Before / After (합성 3자산 fixture · seed 20260101 · 3,000회 · 20년)

| 항목 | Before | After |
| --- | --- | --- |
| US_EQUITY provider | Allianz Global Investors | J.P. Morgan Asset Management |
| US_EQUITY class | North America Equities (USD 기준) | U.S. Large Cap (원화 기준) |
| US_EQUITY σ | 16.6% | 13.722309014388456% |
| US_EQUITY ~ KR_EQUITY 상관 | 0.4124456921608721 | **동일**(변화 없음) |
| US_EQUITY ~ EM_EQUITY 상관 | 0.5007268458463904 | **동일** |
| US_EQUITY_HEDGED | UNMAPPED | MAPPED · σ 16.63977109253169% · 상관 0.6931240999229659 |
| MC P10 / P50 / P90 / mean (환노출) | 967,506,828 / 1,815,289,161 / 3,657,098,008 / 2,140,071,813 | 992,008,286 / 1,789,157,265 / 3,466,555,103 / 2,086,881,223 |
| MC P10 / P50 / P90 / mean (환헤지) | — (연결 없음) | 911,836,237 / 1,759,645,693 / 3,730,883,755 / 2,145,352,117 |

측정 기록: `docs/closeout/measurements/mc-v268-integrated.json` ·
scratchpad `baseline-before.json` / `baseline-after.json`.

### 54-4. 추가 투자 — "매년 투자금 증가율" 폐지, "연도별 추가 투자" 채택 (MC-01)

- **입력 방식 변경**: 매달 적립금을 해마다 몇 %씩 자동으로 불리는 `contributionGrowthRate` 입력을
  화면에서 제거하고, `state.projection.yearlyExtraContributions` = `[{year, amount}]`(연도 오름차순 ·
  연도 중복 없음 · 금액 0 이상)를 사용자가 직접 입력한다.
- **기본 적립과 분리**: 기본 월 적립금 계산은 그대로다. 추가 투자는 그 위에 더해지는 별도 현금흐름이다.
- **이중 반영 금지**: 저장된 `contributionGrowthRate` 값은 **지우지 않는다**(데이터 손실 금지).
  다만 입력에서도 계산에서도 더 이상 읽지 않으므로(js/05 · js/16 · js/19) 두 방식이 동시에
  적용될 수 없다. 증가율을 쓰지 않던 사용자의 결과는 이전과 **비트 단위로 동일**하다.
- **MC 반영**: 달력 연도 → 시뮬레이션 월 번호 변환은 달력을 아는 유일한 계층(js/19
  `mapYearlyExtraContributionsToMonths`)이 맡고, 엔진(js/15)은 그 달에 목표비중대로 배분해
  월 적립금과 **같은 자리**(수익률 적용 전)에 더한다. 새 확률모형 · 새 수익률 · seed · 분포 ·
  상관 구조는 건드리지 않는다.
- **예측 기간 밖**: 지난 연도 · 예측 기간(20년)을 넘는 연도는 반영할 자리가 없다. 조용히 버리지 않고
  팝업의 해당 행에 "계산에 반영되지 않습니다"를 표시한다.
- **범위 한계**: 소유자별 관점(mcOwnerScope) MC에는 넘기지 않는다 — 가구 전체 기준 입력이라
  소유자 배분 규칙이 없고, 앱이 임의로 나누면 사용자가 입력하지 않은 금액이 만들어진다.
- **결정론 시나리오 카드(js/05)** — **PM 결정 2 확정(2026-09-22): 반영한다.**
  MC와 **같은 입력원**(`state.projection.yearlyExtraContributions`) · **같은 정규화 규칙** ·
  **같은 시점 규칙**을 쓴다. 시점 규칙은 `js/05 yearlyExtraContributionMonthIndex` **한 함수**에만
  두고 MC(js/19)가 그것을 부른다 — 규칙을 두 곳에 두면 같은 입력에 두 화면이 다른 답을 낸다
  (Phase 3-3이 고쳤던 그 종류의 불일치).
  성장은 새 공식을 만들지 않고, 이 카드가 이미 화면에 "기준 연간 성장률"로 보여 주는 가구
  가중평균 수익률(`computeTargetWeightedAvgRate`)과, **그것과 완전히 같은 집계 방식**으로 구한 가구
  가중평균 운용보수(`computeTargetWeightedFeeRate` — 새 배분정책이 아니라 수익률에 이미 쓰고 있는
  집계 규칙을 보수에 그대로 적용한 것)를 기존 `computeFutureValueWithContributionGrowthAndFee`에 넘긴다.
  **가구 단위**로만 반영하며 소유자 · 계좌 · 자산에 임의로 나누지 않는다. 소유자별 관점 호출
  (`ownerFilter`)에는 넣지 않는다 — 어느 소유자 몫인지 사용자가 정한 적이 없기 때문이다.

### 54-5. 채권 자산등록 KIS 통합 (B-01)

자산등록 화면의 ISIN 조회를 공공데이터포털에서 **KIS `/api/kis/bond-info`(TR CTPF1114R)**로 통일한다
— 거래등록(js/06)이 이미 쓰는 어댑터(js/13 `fetchKisBondInfoRaw` · js/29 `mapKisBondInfo` ·
`mergeKisBondInfoIntoPosition`)를 그대로 재사용하며 새 TR을 만들지 않는다.

- 사용자 명시값 > KIS 자동값. 병합 규칙은 거래등록과 **같은 함수**가 담당한다.
- KIS가 모르는 항목(발행인명 · 선순위 · 발행금액 등)은 손대지 않는다.
- 조회 실패가 등록을 막지 않는다 — 직접 입력하면 그대로 저장되며 기존 필수값 validation은 유지한다.
- 공공데이터 경로 제거 근거: 해당 서비스는 응답하지 않는다(일부러 틀린 경로도 같은
  `NO_OPENAPI_SERVICE_ERROR`를 돌려주는 반면 같은 기관의 다른 서비스 3종은 "키 미등록"을 돌려준다).
- 기존 저장 데이터는 변환하지 않는다. Bond transaction/Stage2 · Bond Risk · Bond valuation
  (MARKET → PURCHASE fallback) 정책은 모두 그대로다.

### 54-6. ETF 근거 재확인 (E-03 · E-04)

2026-09-22 운용사 · 지수 제공기관 1차 자료 실측.

| 종목 | 확인한 것 | 조치 |
| --- | --- | --- |
| QQQM | Invesco 공식 상품자료(invesco.com 배포 PDF) "Access the Nasdaq-100 Index" · "based on the NASDAQ-100 Index" | evidence를 운용사 1차 자료로 교체 · `evidenceGrade: A` 부여 |
| SPYM | SSGA 공식 상품 페이지 벤치마크 "S&P 500® Index" | 동일 |
| 360750 | 미래에셋 공식 "S&P 500 Index"(원화환산) · "환헤지를 하지 아니함" | 기존 기록과 일치 — 변경 없음 |
| 360200 | ACE ETF 공식 "S&P 500 지수"(S&P Dow Jones Indices 산출) | 기존 기록과 일치 — 변경 없음 |
| 368590 | RISE ETF 공식 "NASDAQ 100 Index(KRW)(T-1)"(NASDAQ OMX Group 산출) | 기존 기록과 일치 — 변경 없음 |
| SCHD | Schwab 공식 "the total return of the Dow Jones U.S. Dividend 100™ Index" | 기존 기록과 일치 — 이 문장은 **펀드 운용목표**이지 지수 유형 표기가 아니다 |
| 472170 | 운용사 페이지가 동적 로딩이라 이번 조사에서 재확인 실패 | 기존 A등급 기록 유지 |

**PR/TR 결론**: 운용사 자료 계층은 지수 이름만 적고 PR/TR을 표기하지 않는다. 표기 주체는 지수
산출기관(S&P DJI · Nasdaq)이며 두 곳 모두 자동 접근을 차단한다(403). 따라서 `underlyingReturnType`은
**채우지 않는다** — 임의 확정 금지(지시문 §8). Tracking Beta 계산식 · Risk Score · MC 연결은 무변경.

원장 규모는 58행 그대로이며 EM-2026.1 / EM-2026.2 코호트 구분(48 / 10)도 바뀌지 않았다
— QQQM · SPYM은 "새로 추가한 상품"이 아니라 **기존 항목에 새 근거가 생긴 것**이므로 미국 개별주 19건과
같은 방식으로 등급만 부여했다(§44 44-16 선례).

### 54-6-2. UX 정리 — 적립 기간 안내 문단 삭제 (PM 지시 2026-09-22)

[투자금 설정] 팝업 상단의 💡 "적립 기간 vs 미래예측 기간" 안내 문단(Step 3에서 넣었던 것)을
삭제했다. 연도별 추가 투자가 들어오면서 팝업이 길어졌고, 이 문단이 화면 위쪽 1/4을 차지했다.
같은 설명은 "적립 기간(년, 선택)" 입력칸의 `title` 툴팁("비워두면 20년(미래예측 전체 기간) 내내
투자, 0이면 지금부터 추가 투자 없음")에 신랑 · 와이프 두 카드 모두 남아 있다.
계산 · id · 동작은 전혀 바뀌지 않았다(표시 문구만 제거).

### 54-6-3. 통합 더미데이터 검증에서 발견해 고친 것 (2026-09-22)

자동 단위 · E2E 테스트는 전부 통과하던 상태에서, 합성 가구를 실제 앱 흐름으로 통과시키는
통합 검증(자산 → 거래 → Portfolio → Risk → Beta → 환헤지 → MC → 추가투자 → 결정론 →
Excel → Backup/Restore → 재계산)을 돌려 다음 두 가지를 발견하고 고쳤다.

**① [데이터 손실 결함] JSON 백업 복원에서 사용자 확정값 2종이 사라졌다**

- 어디: `js/12` `jsonFileInput` change 핸들러의 자산 복원 필드 목록.
- 무엇: 이 핸들러는 `makeAsset`도 `normalizeImportedAsset`도 아닌 **자기만의 필드 나열**로
  자산을 만든다(세 번째 경로). 그 목록에 `marketBetaIndexOverride` · `fxHedgeStatus`가 없어,
  백업 파일에는 정상적으로 들어 있는데도(`buildSyncBlob`이 내보낸다) 복원하면 두 값이 사라졌다.
- 성격: Phase 47-E(대표매칭) · BL-7a(positionSource) · FIX-6(updatedAt)과 **같은 유형**이며,
  그 세 곳의 주석이 "이 목록에 빠지면 사라진다"고 이미 경고하고 있던 자리다.
- 왜 자동 테스트가 못 잡았나: 단위 테스트는 `normalizeImportedAsset`(덮어쓰기 · 동기화 경로)만
  검증했고, JSON 파일 복원 경로는 실제 파일 왕복이 필요해 통합 검증에서만 드러난다.
- 고침: 같은 목록에 두 줄 추가. 정규화는 다른 두 경로와 **같은 함수**(js/01)를 쓴다.
- 회귀 고정: `e2e/117` STEP 11·12(백업 → 상태변경 → 복원 → 재계산 일치).

**② [UX 정정] 장기 가정 출처 표기가 실제 기관과 어긋났다**

- 어디: `js/19` 장기 가정 출처 상세("자산군 변동성(기관명)").
- 무엇: 제목 하나가 모든 줄을 PRIMARY 기관으로 표기했다. 자산 성격마다 `riskProvider`를 따로
  지정할 수 있는 구조(§47-3 · 채권이 이미 그렇다)에서는 줄마다 기관이 다를 수 있다.
  PM 결정 1로 미국 주식이 J.P. Morgan을 쓰게 되면서 "미국 주식 → U.S. Large Cap"인데 제목은
  AllianzGI로 표기되는 상태가 화면에 드러났다.
- 고침: 제목에서 기관을 빼고 **줄마다 실제 기관**을 적는다(`riskProvider`를 결과에 함께 담는다).
  값 · 계산은 건드리지 않았다.

### 54-7. 하지 않은 것 · PM 결정이 남은 것

| 항목 | 상태 | 사유 |
| --- | --- | --- |
| ETF 환헤지 → MC 자산군 연결 | **해소(구현 완료)** | PM 결정 1 · A안 확정(2026-09-22) — §54-3 |
| 연도별 추가 투자 → 결정론 시나리오 카드 | **해소(구현 완료)** | PM 결정 2 확정(2026-09-22) — §54-4 |
| 연도별 추가 투자 → 소유자별 MC | **하지 않음** | 가구 기준 입력이라 소유자 배분 근거가 없다 |
| ETF PR/TR 확정 | **하지 않음** | 지수 산출기관이 자동 접근을 차단(403). 운용사 자료에는 표기 없음 |
| Tracking Beta 계산식 · Risk Score · MC 연결 | **하지 않음** | 이번 범위 밖(지시문 §3 · §8) |
| 기존 저장 데이터 일괄 변환 | **하지 않음** | `contributionGrowthRate`를 포함해 저장값은 전부 보존 |

### 54-8. 계산 영향

| 지표 | 영향 | 성격 |
| --- | --- | --- |
| Market Beta · Portfolio Beta · Risk Score | **산출 대상 확대** | 사용자가 확인해 준 기준 지수만큼 늘어난다. 산식 무변경 |
| MC(추가 투자 없음) | **변화 없음** | 실측: 빈 배열 · 필드 생략 · 증가율 0 세 경우 모두 비트 동일 |
| MC(추가 투자 있음) | **의도된 변화** | 지정한 달에 지정한 금액이 그대로 더해진다(실측: +1,000만 · +1,500만 정확 일치) |
| MC(증가율을 쓰던 기존 사용자) | **의도된 변화** | 더 이상 자동 증가하지 않는다. 저장값은 보존되며 화면 안내로 대체된다 |
| μ · σ · 상관 · seed · 분포 · 시뮬레이션 수 | **변화 없음** | CMA 자산군 목록 · 값 무변경(테스트가 고정) |
| Bond valuation · Bond Risk | **변화 없음** | 입력 경로만 바뀌었다 |

### 54-9. 테스트

**신규** — `test/v268-integrated-batch.test.js`(17) · `e2e/116-integrated-batch.spec.js`(15).

전체 결과 — Unit 756/756 · E2E 1,137/1,137 · ESLint 0 · Data Guard PASS · Release Guard PASS.

**단위 테스트는 한 건도 수정하지 않았다**(739 → 756, 전부 통과).

**E2E 기대값 갱신 16건** — 전부 이번에 PM 지시로 **제거한 기능을 기대하던** 테스트다
(§10-1 "매년 투자금 증가율 입력 방식을 제거한다" · §11 "적립금 설정 문구를 교체한다").
테스트를 고쳐 통과시킨 것이 아니라 사양이 바뀐 것이며, 각 지점에 갱신 사유를 남겼다.

| 파일 | 건수 | 무엇이 바뀌었나 |
| --- | --- | --- |
| `e2e/11` | 2 | 요약 한 줄 `증가 없음(매월 동일)` → `없음`. 증가율 입력 테스트 → "연도별 추가 투자를 저장하면 요약 한 줄에 반영되고, 결정론 히어로 금액은 MC 범위 밖이라 그대로"로 교체 |
| `e2e/13` | 1 | "증가율 3% + 적립기간" → "저장된 옛 증가율이 남아 있어도 계산에 적용되지 않는다(+ 저장값은 보존된다)" |
| `e2e/14` | 1 | "증가율 3% + 적립기간" → "연도별 추가 투자 + 적립기간 병행". 기대값 헬퍼가 화면(js/19)과 같은 입력을 쓰도록 맞춤. 옛 증가율 무영향 테스트 **1건 추가** |
| `e2e/17` | 1 | 원금 0 경로에서도 옛 증가율이 적용되지 않음을 고정 |
| `e2e/30` | 2 | 팝업 draft/취소/저장 계약 검증 대상을 증가율 입력 → 연도별 추가 투자로 교체 |
| `e2e/31` | 8 | 모바일 44px · 12px · 무오버플로 기준을 새 편집 UI(연도 · 금액 입력 · [연도 추가])에 적용 |
| `e2e/99` | 1 | 버튼 이름 — 일반계좌 「투자금 설정」 · 절세계좌 「적립설정」(이번 범위 밖이라 유지) |

---

## §55. 장기 수익률 기준 · 환헤지 입력 UX 정합성 (PM 수정 지시 2026-09-23)

기능 확장이 아니다. 이미 있는 정책(`rateMatchOverride` · `fxHedgeStatus`)을 사용자가
**입력이 필요한 시점에** 이해하고 넣을 수 있게 입력 경로와 문구를 맞춘 것이다.
계산식 · 저장 구조 · 자동 판정 우선순위는 바뀌지 않았다.

### 55-1. 사용자-facing 명칭 통일

같은 값을 화면마다 다르게 부르던 것을 하나로 맞췄다.

| 화면 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 거래 추가 폼 | 대표 추종 수익률 종목 | **장기 수익률 기준**(미래예측 · 장기 시뮬레이션에 쓰입니다) |
| 자산 상세 | 장기 수익률 가정 | **장기 수익률 기준** |
| 자산 상세 · 자산 폼 · 거래 폼 | 환헤지 여부 | **환헤지** |

바꾸지 않은 것: 내부 필드명(`rateMatchOverride` · `fxHedgeStatus`) ·
엑셀 컬럼명(`대표매칭(수익률연동키)`) · 저장 schema · 자동 판정 구조.

### 55-2. 자동 추천이 없을 때의 안내 — 사실 정정

거래 추가 폼은 자동 추천 근거가 없을 때 이렇게 말하고 있었다.

> (변경 전) 자동으로 추천할 기준을 찾지 못했어요. **비워두면 계산할 때 시스템이 정하고**,
> 원하면 위에서 직접 고를 수 있어요.

**사실이 아니었다.** Phase 47-A가 지역 폴백("국내면 KOSPI")을 없앤 뒤로 시스템은 정하지 않고
UNRESOLVED로 두며 **장기 수익률 0%**로 계산한다. 그때 문구를 함께 고치지 않아 남아 있었다.
실측(2026-09-23): `042700.KS` → `recommendRateMatchKey` null → `resolveAssetGroupKeyDetail`
UNRESOLVED → `getTargetProjectionRate` **0%**.

사용자는 거래 입력 시점에 "비워둬도 된다"고 안내받고, 한참 뒤 자산 상세에서야
"⚠ 성장 없이(0%) 계산하고 있습니다"를 보게 됐다.

> (변경 후) 이 종목에 맞는 장기 수익률 기준을 찾지 못했습니다. 비워 두면 장기 수익률을
> **0%로(성장 없이)** 계산합니다. 필요하면 위에서 직접 고를 수 있어요.

세 가지를 반드시 말한다 — ① 찾지 못했다 ② 비워두면 0% ③ 직접 고를 수 있다.
"시스템이 정한다"는 표현은 쓰지 않는다(테스트가 재발을 막는다).

자동 추천이 있는 경우와 기존 사용자 확정값이 있는 경우의 안내 · 우선순위는 그대로다
(사용자 확정값 → 승인된 자동 판정 → UNRESOLVED).

### 55-3. 환헤지 입력 — 환노출이 있는 상품에만 묻는다

v268에서 환헤지 선택을 "주식 · ETF이고 티커가 있으면"으로 보여 준 것은 잘못이었다.
국내 원화 자산에서는 무엇을 골라도 계산이 달라지지 않는데(실측 확인) 선택을 요구했다.

판정은 **새 체계를 만들지 않고** 이미 승인된 사실만 순서대로 본다
(`js/01 fxExposureStateOf` — 표시 조건 전용, 계산에 쓰지 않는다).

1. **표시 통화** — 원화가 아니면 환노출(채권 폼이 이미 쓰는 규칙과 같다)
2. **Exposure Master** — `fxExposure` 값, 없으면 `assetType`
   (§44 매트릭스가 이미 유형을 구분한다. `KR_STOCK` · `KR_LISTED_DOMESTIC_ETF` · `KRW_CASH`는
   스키마상 `fxExposure`를 요구하지도 않는다 = 그 유형에 환노출 개념이 없다)
3. **공식 종목 마스터**(v267 사실 계층) — `resolveRuntimeMarketExposure`의 US / KR
4. **사용자가 고른 국내/해외** — 자산 레코드의 기존 필드

결과는 `EXPOSED` · `NONE` · `UNKNOWN` 셋이며, **NONE일 때만 숨긴다.**
확인되지 않은 상품(UNKNOWN)을 숨기면 사용자가 알려 줄 방법 자체가 사라지므로 보여 준다.

**데이터 보호**: UI를 숨겨도 이미 저장된 `fxHedgeStatus`는 지우지 않는다.
"보이지 않는 것"과 "삭제하는 것"은 다른 문제다(테스트가 고정한다).

### 55-4. 거래 추가 폼에도 환헤지 입력

거래로 자산을 처음 만드는 사용자는 자산 입력 폼을 거치지 않는다. 그래서 거래 폼에도
같은 조건(55-3)으로 환헤지 칸을 두었다. 새 필드를 만들지 않고 기존 `fxHedgeStatus`에 저장하며,
반영 규칙은 `rateMatchOverride` · `role`과 **완전히 같다**.

- 신규 거래의 빈칸은 "건드리지 않았다"로 본다(Phase 30 데이터 보호) — 기존 값을 지우지 않는다
- 수정 모드에서 비우면 미선택으로 되돌린다
- 값이 실제로 바뀔 때만 `updatedAt`을 찍는다(FIX-1 병합 규칙)

저장 이후 경로(정규화 · 영속화 · MC `applyUserHedgeToAppClass`)는 기존 것을 그대로 탄다.
거래 스키마에는 `isDomestic`이 없으므로(js/06 상단 주석) 거래 폼에서는 통화 · 원장 ·
종목 마스터의 사실만으로 판정된다.

### 55-5. Fixture 결과 (실측 2026-09-23)

| 대상 | 판정 | 환헤지 UI |
| --- | --- | --- |
| 042700.KS 한미반도체(원장 없음) | NONE | 숨김 |
| 005930.KS 삼성전자(원장 KR_STOCK) | NONE | 숨김 |
| 069500.KS · 278530.KS 국내 ETF | NONE | 숨김 |
| 360750.KS 한국 상장 미국 ETF | EXPOSED | 표시 |
| 472170.KS 혼합형(fxExposure 없음 · 유형은 해외 ETF) | EXPOSED | 표시 |
| QQQM · AAPL 미국 상장 | EXPOSED | 표시 |
| 원화 채권 · 원화 현금 | NONE | 숨김 |
| 외화 채권 · 달러 현금 | EXPOSED | 표시 |
| 원장 · 마스터에 없는 새 종목(거래 폼) | UNKNOWN | 표시 |

계산 불변 확인: 042700.KS에 환헤지를 UNHEDGED/HEDGED 어느 쪽으로 두어도
Market Beta(KOSPI) · Tracking(KOSPI) · Return Key(UNRESOLVED) · MC 자산군(KR_EQUITY) 모두 동일.
360750.KS는 PM 결정 1 정책대로 HEDGED에서만 `US_EQUITY_HEDGED`로 전환된다.

### 55-6. 테스트

신규 — `test/v269-input-ux.test.js`(11) · `e2e/117`에 거래 폼 검증 2건 추가.
기대값 갱신 2건 — `e2e/37` #14(안내 문구) · `e2e/117` UX(환헤지 칸 조건부).
둘 다 이번 수정으로 사양이 바뀐 지점이며 사유 주석을 남겼다.

---

## §56. 입력 화면 · 세부 내용 · 목표비중 조작 UI (PM 지시 2026-09-23)

기능 추가가 아니다. 이미 있는 UI와 로직의 **자리 · 표시 조건 · 이벤트 범위**만 바꿨다.
저장 구조 · 계산 · 자동 판정 · 데이터 의미는 하나도 바뀌지 않았다.

### 56-1. 거래 추가 - 채권의 신원은 티커가 아니라 표준코드(ISIN)다

채권은 종목 마스터에 없다. 그런데 거래 추가 폼은 먼저 「종목명/티커」와 돋보기를 보여 주고,
표준코드 칸은 화면 한참 아래 발행조건 블록 안에 있었다. 사용자는 검색해도 나오지 않는 상태에
먼저 놓였다.

자산군 = 채권이면 **종목 검색 UI가 있던 그 자리에** 표준코드(ISIN) 입력/조회 칸이 온다
(`#tx_bondIsinWrap` · `updateTxBondFieldsUI`, js/06). 검색 UI는 `hidden`으로 layout에서
빠지므로 빈 자리가 남지 않는다(`visibility`가 아니다).

화면 순서: 자산군 → **표준코드(ISIN)** → 채권명 → 장기 수익률 기준 → 역할 → 만기일 ·
표면이율 · 나머지 발행조건 → 수량 · 매매단가.

**옮긴 것이지 새로 만든 것이 아니다.** 입력칸 · [조회] 버튼 · 안내문 · 조회 경로
(`applyKnownBondMasterToTxForm` · `lookupBondFromKis` · 12자리 형식 판정 · 빈 칸만 채우는 규칙)는
그대로다. 거래의 ticker에 ISIN을 담는 §49 BOND-05 규칙도 그대로다.

이름칸은 없애지 않고 **「채권명」으로 바꿔 그대로 쓴다.** 조회가 되면 자동으로 채워지고, 조회되지
않는 채권(신규 발행 · 장외)은 직접 적는다. 칸을 없애면 그런 채권의 이름을 넣을 방법이 사라진다 -
"보이지 않는 것"과 "넣을 수 없는 것"은 다른 문제다. 채권에서는 검색할 마스터가 없으므로 이름칸은
수동입력 체크와 무관하게 항상 직접 입력이고, 이름칸 클릭으로 종목 검색이 열리지 않는다.

### 56-2. 수동입력은 기본 OFF이고, 자산군을 바꿔도 승계되지 않는다

예전에는 자산군이 채권이 되면 수동입력을 **강제로 켜고 비활성화**했다. 그 ON 상태는 자산군을
주식으로 되돌려도 그대로 남아, 사용자는 왜 검색이 안 되는지 알 수 없었다(비활성화만 풀렸다).

- 주식 · ETF · 채권 모두 **기본 OFF**(검색 모드)에서 시작한다.
- 채권에서는 체크박스를 **숨긴다**(의미가 없다). 켜지 않고, 비활성화하지도 않는다.
- 자산군을 바꾸면 OFF로 되돌리고, 수동으로 적어 둔 이름 · 티커도 함께 비운다
  (수동입력 토글을 직접 끌 때와 같은 처리 - 읽기전용 칸에 정체불명의 값이 남지 않게 한다).

수정 모드는 예전 그대로다 - 티커가 없는 거래를 열면 수동입력이 켜진 채로 보인다
(`checked = !tx.ticker`). 자동판정 엔진은 건드리지 않았다.

### 56-3. 시장 현황 & 매크로 브리핑 - 세부 내용은 팝업이다

「📄 상세 현황 보기」 아코디언은 펼치면 카드가 길어져 **바로 아래 위험 점수가 화면 밖으로
밀려났고**, 다시 접기 전에는 돌아오지 않았다.

제목 우측 **[세부내용]** 버튼(`#macroDetailBtn`)을 누르면 같은 내용이 팝업
(`#macroDetailModal`)으로 열린다. 카드 높이는 변하지 않는다.

- 내용 컨테이너 `#macroBriefingDiagnosis`는 **같은 것을 팝업 안으로 옮긴 것**이다(복제 아님).
  `renderMacroBriefing()`이 지금까지와 똑같이 채운다 - 문구 · 데이터 · 계산 무변경.
- 지표 10개는 예전처럼 항상 보이고, 제목에는 접기 caret이 없다. 세부 내용 안에 접기를 다시 두지
  않는다는 규칙도 그대로다(상관관계 가이드 포함 4개 항목).
- 팝업은 앱의 기존 모달 규칙을 그대로 쓴다 - 배경 탭 · X · 물리 뒤로가기로 닫힌다
  (`MODAL_CLOSE_FNS` · `SWIPE_MODAL_IDS`, js/03).
- 아코디언이 없어져 `macroDiagnosisOpen` · 높이 재보정(`reapplyMacroDiagnosisAccordionHeight`) ·
  탭 전환 시 되돌릴 펼침 상태도 함께 사라졌다.
- 375px에서 제목과 버튼이 한 줄에 들어가야 하므로 라벨은 「세부내용」이다(📄 없음 - 실측 결과
  이모지가 있으면 두 줄로 밀린다). 글자 14px · 눌리는 범위 44px은 다른 세부내용 버튼과 같다.

### 56-4. 목표비중 아코디언 - 버튼 줄은 트리거가 아니다

증상: 「비중조절」 팝업을 열었다 닫으면 누르지도 않은 목표비중이 펼쳐져 있다.

**실측 결과 "팝업을 닫는 동작"이 아코디언을 여는 경로는 없었다**(2026-09-23). 신랑 · 와이프 각각
X · 취소 · 확인(저장) · 배경 탭 · 뒤로가기 다섯 경로 모두 `positionAnalysisAccordionOpen`이
`false` 그대로였고, 이 값을 `true`로 쓰는 코드는 사용자 클릭 토글 한 줄뿐이다.

**실제 원인은 빗맞은 탭이다.** 375px에서 [엑셀]과 [비중조절] 사이는 **6px**뿐인데, 예전 필터는
두 버튼 요소만 제외했다(`closest('[data-rebalance-detail-btn], [data-rebalance-export-btn]')`).
버튼을 살짝 빗나간 탭은 그 틈으로 부모 행에 닿아 아코디언을 조용히 열었다. 사용자는 "팝업을 닫으니
저절로 열렸다"로 겪는다(실측: 버튼 왼쪽 −2 / −6 / −12px 지점이 모두 아코디언 행으로 잡혔다).

수정: 제외 범위를 **버튼 줄 전체**로 넓힌다(`[data-rebalance-actions]`). 버튼 줄은 조작 영역이지
아코디언 트리거가 아니다. 제목 · chevron을 직접 누르는 정상 경로와 신랑/와이프 독립성은 그대로다.

`setTimeout`으로 강제로 닫는 임시방편은 쓰지 않았다(PM 지시 6-4). 목표비중 값 · Portfolio ·
Risk · Beta · MC · Return Key · Excel · Backup 어디도 건드리지 않았다.

### 56-5. 테스트

신규 — `test/v270-ui-batch.test.js`(15) · `e2e/118-ui-batch-v270.spec.js`(20).
기대값 갱신 — `e2e/39` · `e2e/79` D·F · `e2e/80` C·D·E·F·G·H · `e2e/99` B·E · `e2e/100` B-1.
모두 56-3(아코디언 → 팝업)의 직접 결과이며, 각 테스트가 원래 지키던 것(지수 상시 노출 · 세부
내용이 실제로 보임 · 안쪽 접기 없음 · 14px · 가로 overflow 없음 · 제목에 caret 없음)은 팝업 기준으로
그대로 검사한다. 팝업이라 달라지는 것(카드 높이 불변 · 긴 내용은 팝업 안에서 스크롤)만 바꿨고,
각 지점에 사유 주석을 남겼다.

### 56-6. PM 최종 결정 (2026-09-23)

직전 보고의 PM Decision Required 두 건이 확정됐다.

**D-1 = A안 · 버전은 최종 릴리스 때 한 번만 올린다.**
지금 `CACHE_NAME`은 v268 그대로이고 APP_SHELL 파일은 바뀐 상태다. cache-first이므로 이 상태로는
기존 사용자에게 변경이 전달되지 않으며, **Release Guard는 그 사실을 FAIL로 알린다 - 정상 동작이다.**
최종 릴리스 직전에 v268 → v269로 한 번만 올려 Release Guard까지 PASS시킨다.
그때까지 다음은 하지 않는다: 지금 v269로 변경 · `CACHE_NAME`만 변경 · Release Guard 조건 완화 ·
검사 제외 · 관련 테스트 삭제/수정.

**D-2 = 채권명 유지 + 조회 영역을 채권명 바로 위에.**
56-1의 위치는 그대로 두고, 「채권 조회」와 「채권명」을 화면에서 나눈다.

| 순서 | 무엇 |
| --- | --- |
| 1 | 자산군 |
| 2 | **채권 조회** - 표준코드(ISIN) · [조회] · 안내문 |
| 3 | **채권명** - 조회되면 자동으로 채워지고, 아니면 직접 적는다 |
| 4 | 장기 수익률 기준 |
| 5 | 역할 |
| 6 | 만기일 · 표면이율 · 나머지 발행조건 |
| 7 | 수량 · 매매단가 |

조회 칸 아래에 "조회하면 아래 **채권명**과 발행조건이 자동으로 채워집니다. 조회되지 않아도 직접
입력해 저장할 수 있습니다."를 둔다 - "조회 → 결과"라는 관계를 화면에서 읽히게 하려는 것이고,
없던 기능을 더한 것이 아니다.

지키는 것: `tx_name` 입력/저장과 `required` 정책 · 조회 성공 시 자동 채움 · 조회 실패 시 직접 입력 ·
기존 조회 경로 전부(`applyKnownBondMasterToTxForm` · `lookupBondFromKis` · `fetchKisBondInfoRaw` ·
`mapKisBondInfo` · 12자리 판정 · 빈 칸만 채움 · input 자동조회 · blur · [조회] 클릭) · KIS 호출 방식.
채권명은 수동입력 토글과 무관하게 항상 직접 입력할 수 있다(56-1과 같다).

### 56-7. 자산군 전환 시 이름칸 누출 차단 (D-2 검증에서 발견)

실측(2026-09-23): 채권에서 조회로 채워진 채권명이 자산군을 주식·ETF·현금으로 바꿔도 **그대로
남았다.** ISIN · 발행조건 · 안내문은 비워지는데 이름칸만 남아, 검색 모드의 읽기전용 칸에 채권명이
보이고 그대로 저장하면 티커 없는 주식 거래의 종목명이 채권명이 됐다.

원인: 56-2의 처리는 "수동입력이 켜져 있던 경우"에만 이름 · 티커를 비웠다. 채권은 수동입력을 쓰지
않으므로 그 조건에 걸리지 않았다.

규칙: **이름칸이 가리키는 대상이 바뀌는 경계**(채권명 ↔ 종목명/티커)를 넘으면 이름 · 티커를 비우고,
딸린 안내(장기 수익률 기준 추천 · 환헤지 칸)도 함께 되돌린다. 주식 ↔ ETF처럼 같은 종목 식별 체계
안에서 옮길 때는 예전 그대로 남긴다(검색으로 고른 값을 이유 없이 지우지 않는다).
판정에 쓰는 것은 "직전 자산군" 한 값뿐이며(`txAssetClassBeforeChange`, js/06), 팝업을 열 때
기준점이 맞춰진다. 새 저장 필드는 없다.

곁들여 고친 것: 티커 안내줄을 되돌릴 때 일반 공백을 넣어 줄이 접히면서 폼 높이가 20px 흔들리던
것(686 → 666px 실측)을 index.html 초기값과 같은 `U+00A0`으로 통일했다. 표시만 맞춘 것이다.

### 56-8. 테스트 (56-6 · 56-7 반영)

`test/v270-ui-batch.test.js` 18건 · `e2e/118-ui-batch-v270.spec.js` 25건.
D-2 전용: 구조 3건(조회 묶음 · 채권명 유지 · 경계 누출) · 화면 5건(순서 · 조회 성공 · 조회 실패 ·
required · 자산군 전환 양방향 누출).
`e2e/108` A는 56-1 · 56-2의 직접 결과로 기대값을 갱신했고 사유 주석을 남겼다.

---

## §57. 동기화 — 사용자 선택으로 되돌린다 · 팝업 종료 (PM 지시 2026-09-23)

### 57-1. 확정 정책

**두 곳이 다르면 앱이 고르지 않는다.**

| 상황 | 동작 |
| --- | --- |
| Local == Cloud | 확인 화면 없이 그대로 동기화한다 |
| Local != Cloud | 반영을 멈추고 차이를 보여 준 뒤 **사용자가 고른다** — [클라우드 데이터 받기] · [이 기기 데이터 올리기] · [취소] |

다음은 **사용자 모르게 일어나지 않는다**: updatedAt 최신 우선 · last write wins · 레코드별 자동
선택 · 변경시각 기반 자동 우선순위 · deletion timestamp 기반 자동 삭제 · 순수 추가 자동 병합 ·
레코드별 자동 병합 · 일부 필드만 한쪽에서 조합 · 사용자가 모르는 conflict 자동 해소.

이것은 **§30(v243)의 규칙 복귀**다. §53-9(v267 · PC-6)가 "손실이 생길 수 있는 차이만 묻는다"로
완화했던 것을 PM 결정으로 되돌린다 — §53-9는 이 절로 개정된다.

### 57-2. 자동화 이전 · v267 · 최종 정책

| 항목 | 자동화 이전(§30 v243) | v267(§53-9) | 최종 정책(= 자동화 이전) |
| --- | --- | --- | --- |
| 동일 데이터 | 묻지 않고 동기화 | 같음 | **묻지 않고 동기화** |
| Local 변경 | 확인 후 사용자 선택 | 값이 다르면 확인 | **확인 후 사용자 선택** |
| Cloud 변경 | 확인 후 사용자 선택 | 원격에만 있으면 **자동 병합** | **확인 후 사용자 선택** |
| 양쪽 변경 | 확인 후 사용자 선택 | 같음 | **확인 후 사용자 선택** |
| 삭제 충돌 | 확인 후 사용자 선택 | 같음 | **확인 후 사용자 선택** |
| record merge | 차이가 없을 때만 | 안전하다고 본 차이에서도 | **차이가 없을 때만** |
| updatedAt | 차이 판정에서 제외(§30 S-5) | 같음 | **차이 판정에서 제외** |
| 자동 우선순위 | 없음(선택 전) | 순수 추가에 한해 있음 | **없음** |
| 사용자 선택 | 최종 결정권 | 일부 경우 생략 | **최종 결정권** |
| 초기화 | 기기 · 클라우드 각각 유지 | 같음 | **그대로 유지** |
| popup 종료 | [받기] · [올리기] · [업로드] · [취소]만 닫음 | 같음 | **[동기화 끄기] · [클라우드 초기화]도 닫는다** |

### 57-3. 제거한 것 · 유지한 것

제거 — `syncDifferenceNeedsReview(diff)`(js/12). v267이 "물어야 하는 충돌"과 "조용히 합쳐도 되는
변화"를 가르던 함수다. 정책상 그 구분이 사라졌으므로 함수째 없앴다(죽은 코드로 남기지 않는다).
이제 확인 여부를 정하는 것은 `compareSyncData().hasMeaningfulDifference` 하나뿐이다.

유지 — `mergeCollectionById` · `getMergeBaseline` · `mergeAssetsAndTransactionsWithRemote` ·
`updatedAt` · 병합 기준선(`LS_SYNC_MERGED_*`). 차이가 없을 때의 정상 경로와 [받기] · [올리기]가
그대로 쓴다. 사용처 조사 결과 `mergeCollectionById`는 **동기화 경로와 테스트에서만** 쓰이고
다른 기능은 부르지 않는다. `updatedAt`은 js/01 · 06 · 29가 기록하지만 **우선순위 판정에 읽는 곳은
js/12뿐**이며, 그 판정은 차이가 없다고 확인된 뒤에만 돈다(값이 같으므로 어느 쪽을 골라도 결과가 같다).

무변경 — 암호화 · Cloud schema · localStorage 키 · Worker API · fullAdopt · localWins의 의미 ·
`buildSyncBlob` · `stampPayload` · 기기/클라우드 초기화 · Backup · Excel schema · 계산 전 모듈.

### 57-4. 팝업 — 완료했으면 닫는다

증상(실측 재현 2026-09-23): [동기화 끄기]를 누르면 "동기화를 껐습니다." 토스트는 뜨는데 **가족
동기화 설정 팝업이 그대로 남았다.**

원인: `syncDisableBtn` 핸들러에 `closeSyncSettingsModal()` 호출이 **없었다.** 상태 변경 ·
토스트까지만 하고 끝났다. 같은 팝업의 다른 완료 경로([받기] · [올리기] · [업로드] · [취소])는
전부 닫고 있었으므로, 이 한 곳만 규칙에서 빠져 있었다. 같은 누락이 [클라우드 데이터 초기화]에도
있었다(성공 토스트 뒤 팝업 잔존).

수정: 빠져 있던 호출을 넣는다. `setTimeout` · 강제 close · DOM 제거 · 새로고침 같은 우회는 쓰지 않았다.
초기화는 **성공했을 때만** 닫는다(취소 · 이미 비어 있음 · 네트워크 실패에서는 그대로 두어 재시도).
이 버튼은 데이터 관리 화면에도 있으므로 동기화 팝업이 실제로 열려 있을 때만 닫는다 —
닫혀 있는데 부르면 다른 팝업의 뒤로가기 기록을 대신 소비한다(`popModalHistoryIfNeeded`).

lifecycle(수정 후): 사용자 동작 → 처리 → 완료 메시지 → **팝업 종료** → 원래 화면 복귀.
실패 경로는 예전 그대로 팝업을 남겨 재시도할 수 있게 한다.

### 57-5. 알려진 한계(§30-4에서 이어짐)

- 한쪽 기기의 추가 · 수정 · 삭제는 다른 기기에서 **다음 동기화 때 확인 화면**으로 나타난다.
  v267에서 조용히 합쳐지던 "신규 추가"도 이제 확인 대상이므로 확인 빈도가 늘어난다 — 정책상 의도된 결과다.
- 보류 중에는 그 기기의 편집도 클라우드에 올라가지 않는다(선택 전까지).
- 보류 · 취소 기억은 메모리에만 있다. 앱을 다시 열면 첫 동기화가 다시 비교한다.
- 차이는 두 곳의 현재 값 비교다. 누가 언제 바꿨는지는 구분하지 않는다(3-way · 기기 식별 없음).
- 레코드별 "마지막으로 동기화된 값"(해시 · 버전 벡터)은 여전히 없다. §53-10의 PM 결정 대기 항목이었으나,
  이번 정책에서는 **필요 없다** — 자동 판정을 하지 않기 때문이다.

### 57-6. 테스트

신규 — `test/sync-user-choice.test.js`(20) · `e2e/119-sync-user-choice.spec.js`(9).
15개 충돌 시나리오(지시문 §11) · 설정 차이 · 무결성 · 자동 우선순위 부재 ·
팝업 lifecycle(끄기 · 반복 개폐 · 업로드 · 같음 · 다름 3종 · 실패 · 초기화).
기대값 갱신 — `e2e/115` E-3. v267 완화를 고정하던 테스트라 사양이 바뀐 지점이며,
기대값을 낮춘 것이 아니라 **정반대 방향**(자동 병합되던 두 경우도 이제 묻는다)으로 고정했다.

---

## §58. 채권 국내/해외 · 환헤지 정합성 (PM 지시 2026-09-24)

한 가지 원인이 두 증상을 만들고 있었다. **채권 표준코드(ISIN)를 해외로 판정하던 옛 함수**다.

| 증상 | 사용자가 겪은 것 |
| --- | --- |
| 비중조절에서 국채가 검색되지 않는다 | 국내 탭에 없고 해외 탭에만 있었다 |
| 원화 국채에 환헤지를 고르라고 한다 | 해외로 저장돼 있으니 환노출로 판정됐다 |

### 58-1. 원인 — 절반만 적용된 수정

v265(§50 PD-04) 이전의 판정은 이랬다.

```
if (!ticker) return currency === 'USD' ? '해외' : '국내';
return sanitizeTicker(ticker).isDomestic;   // ← ISIN은 여기서 전부 '해외'
```

`sanitizeTicker`는 "한국 코드 규격(.KS · .KQ · 6자리 단축코드)이 아니면 해외"라는 폴백을 갖고 있어
**모든 ISIN**을 해외로 떨어뜨렸다. PD-04가 `classifyIsDomestic`을 고쳤지만 두 가지가 남았다.

1. **이미 저장된 값을 되돌리는 경로가 없었다**(저장값 보존 원칙 때문).
2. 목표 · 배분 항목의 지역 판정 **4곳이 옛 함수를 계속 쓰고 있었다**.

### 58-2. D-7 · 잔존 경로 (CLOSED)

js/05의 네 곳을 `classifyIsDomestic`으로 통일했다 —
`makeRateProbe` · `resolveTickerToRateKey` · 절세계좌 적립 배분의 region · `getMonthlyAllocationItemRate`.

두 판정기의 차이는 **ISIN 하나뿐**이다(실측 고정 · test/v270).

| 입력 | 옛 판정 | 새 판정 |
| --- | --- | --- |
| `005930.KS` · `069500.KS` | 국내 | 국내 |
| `AAPL`(USD · 통화 미상) | 해외 | 해외 |
| 티커 없음 + KRW | 국내 | 국내 |
| **ISIN + KRW / 통화 미상** | **해외** | **국내** |

그래서 채권 ISIN 이외의 판정은 한 건도 바뀌지 않는다.

### 58-3. D-5 · 기존 데이터 교정 (CLOSED — C안: 일부 자동 · 일부 확인)

**교정 근거**는 "원화니까 국내"가 아니다. **지금 승인된 판정기(PD-04)에 같은 입력을 다시 넣었을 때의
답**으로 되돌린다 — 새 추정을 하지 않는다.

대상 조건(둘 다 만족)
1. 저장된 모양 : ISIN 티커 · 자산군 채권 · 통화 KRW · 현재 `isDomestic === '해외'`
2. 승인된 판정기 : `classifyIsDomestic(ticker, currency) === '국내'`

후보를 둘로 나눈다.

| 구분 | 근거 | 처리 |
| --- | --- | --- |
| `positionSource === 'ledger'` | 자산 상세의 [수정]이 숨겨져 있어 **사용자가 이 값을 만들 수도 고칠 수도 없었다** → 옛 판정 버그의 산물로 확정 | **자동 교정** |
| 그 밖(manual · legacy) | 사용자가 직접 '해외'로 정했을 수 있다 | **REVIEW** — 바꾸지 않고 58-4 교정 UI가 근거와 함께 알린다 |

안전장치
- 바꾸는 값은 `isDomestic` **하나뿐**이다. ticker · ISIN · 수량 · 매입가 · 계좌 · 소유자 · 거래 ·
  `hedgeStatus` · Return Key override · 채권 원장은 건드리지 않는다.
- `updatedAt`도 찍지 않는다 — 사용자 편집이 아니라 옛 판정을 되돌리는 것이므로, 동기화 비교에서
  "이 기기가 방금 고쳤다"로 보이게 하지 않는다.
- 업로드를 예약하지 않는다(`persistAssets(true)`).
- `sam_bond_region_migrated_v1` 마커로 **1회만** 돈다. 이후 사용자가 다시 '해외'로 바꾸면 그대로 둔다.

구현: js/01 `bondRegionMigrationCandidate` · `findBondRegionMigrationTargets` · `runBondRegionMigrationOnce`.

### 58-4. D-8 · 국내/해외 교정 경로 (CLOSED)

거래내역이 원천인 자산은 자산 상세의 [수정]이 숨겨지고(BL-8 · Phase 1) 거래 폼에는 국내/해외 칸이
없다(거래 스키마에 `isDomestic`이 없다). **정상 UI 경로가 한 곳도 없었다.**

자산 상세에 **국내/해외 한 칸만** 여는 교정 경로를 두었다(`#assetDetailRegionFix` ·
`renderAssetDetailRegionFix`, js/08). 「위험 분석 확인」(E-01 · E-02)이 이미 쓰는 방식 그대로이며
새 패턴을 만들지 않았다.

- [수정]이 숨겨진 자산에만 보인다 — 자산 폼으로 고칠 수 있으면 경로를 둘로 만들지 않는다.
- 수량 · 매입가 · 계좌 · 소유자는 그대로 거래내역이 원천이며 여기서 바뀌지 않는다.
- 거래 스키마는 바꾸지 않았다. 값은 지금까지와 같이 자산의 `isDomestic`에 저장된다.
- 옛 판정 버그로 굳은 원화 채권이면 그 사실을 함께 알린다(D-5의 REVIEW가 여기로 온다).

### 58-5. 환헤지 전수 결과

환헤지 판정은 **자산 종류가 아니라 환노출**을 본다(`fxExposureStateOf`, §55). 전수 실측:

| 자산 | 판정 | 환헤지 UI | 근거 |
| --- | --- | --- | --- |
| 국내 주식(005930.KS) | NONE | 숨김 | 종목 마스터 KR |
| 국내 ETF(069500.KS) · 국내 채권 ETF | NONE | 숨김 | 국내 |
| 국내상장 해외 ETF(360750 · 360200 · 368590 · 472170) | EXPOSED | 표시 | 해외 노출 |
| 해외 직접(AAPL · MSFT · SCHD · QQQM) | EXPOSED | 표시 | 통화 USD |
| **원화 국채(교정 후)** | **NONE** | **숨김** | 국내 |
| 원화 국채(교정 전) | EXPOSED | 표시 | ← 이것이 증상이었다 |
| 외화 채권 · 달러 현금 | EXPOSED | 표시 | 통화 USD |
| 원화 현금 | NONE | 숨김 | 국내 |

**원화 채권은 환헤지를 보지 않는다**(js/29 `resolveBondClass`는 `ccy !== 'KRW'`일 때만 환헤지를 요구한다).
외화 채권만 발행인 유형 + 환헤지 둘 다 있어야 분류된다.

MC 연결은 그대로다 — `US_EQUITY` ↔ `US_EQUITY_HEDGED`, 해외채권 hedge pair, JPM LTCMA · CMA 무변경.
사용자가 고른 `hedgeStatus`는 지역 교정으로 **지우지 않는다**(원화 채권에서는 분류에 쓰이지 않을 뿐이다).

### 58-6. 함께 고친 연관 문제

- 보유 중이 아닌 종목을 보는 읽기 전용 상세 화면이 「위험 분석 확인」 칸을 다시 그리지 않아,
  **직전에 본 보유 자산의 칸이 그대로 남아 있었다**(다른 종목의 값을 이 화면에서 고칠 수 있는 것처럼
  보였다). 두 칸 모두 그 경로에서 비운다.

### 58-7. 테스트

신규 — `test/v270-bond-region.test.js`(12) · `e2e/120-bond-region-hedge.spec.js`(17).
D-5 대상 판정 · 멱등 · 다른 필드 불변 · REVIEW 보존 / D-7 잔존 0 · 두 판정기 차이 / D-8 표시 조건 ·
저장 · 되돌리기 / 환헤지 전수 · hedgeStatus 보존 / 연관(비중조절 검색 · 지역 집계) / 375 · 390 · 1440 × Light · Dark.

---

## §59. 입력 보존 · 안내의 정확성 (PM 지시 2026-09-24 · ISSUE-01 ~ 04)

§58에서 원인 하나를 걷어내자 그 뒤에 가려져 있던 네 건이 드러났다. 셋은 **말이 사실과 달랐던**
문제이고, 하나는 **사용자가 채운 값이 사라지는** 문제였다.

### 59-1. ISSUE-01 · 채권 입력 저장 조건 (CLOSED)

저장 여부를 정하는 조건(js/07 `persistBondPositionForAsset`)이 화면의 채권 칸 11개 중
**4개만** 보고 있었다.

| | 항목 |
| --- | --- |
| 보던 것 | 표준코드 · 만기일 · 표면이율 · 액면총액 |
| 못 보던 것 | **발행인 유형** · 환헤지 · 신용등급 · 발행일 · 이자 지급 방식 · 연 지급 횟수 · 매입일 |

두 가지가 일어났다.

1. 못 보던 7개만 채우고 저장하면 레코드를 만들지 않고 **버렸다.**
2. 그 7개만 들어 있던 **기존 레코드는 지웠다**(조건이 거짓이면 splice).

하필 **발행인 유형은 원화 채권의 장기 자산군을 혼자 정하는 값**이다(§47-3 · js/29
`resolveBondClass`). 사용자가 경고를 없애려고 정확히 그 칸을 고치는 순간 정보가 사라지는
경로였다.

**정책** - 화면에 있는 칸은 **무엇 하나라도 채워지면 저장한다.** 빈 레코드를 만들지 않는다는
원래 의도는 그대로다(전부 비면 만들지 않는다). 자산군이 채권이 아니게 되면 레코드를 지우는
기존 정책(계산에 남는 유령 방지)도 그대로다. 다른 자산군의 저장 조건은 이 함수를 지나지 않는다.

### 59-2. ISSUE-02 · 원화 채권에 환헤지를 묻지 않는다 (CLOSED)

실제 분류 규칙(js/29 `resolveBondClass`)은 이렇다.

| 통화 | 필요한 것 |
| --- | --- |
| KRW | 발행인 유형 **하나** |
| KRW 아님 | 발행인 유형 **+ 환헤지** |

그런데 안내는 한 문장뿐이었고 "발행인 유형 · 통화 · 환헤지가 확인되지 않아"라고 했다 -
원화 국채를 가진 사용자에게 **환헤지를 채우라고 말하고 있었다.** 계산은 맞고 문구만 틀렸다.
이제 통화에 따라 문구가 갈린다. **계산 · σ · 비중 · 원금은 무변경이다.**

### 59-3. ISSUE-03 · 이어지지 않은 목표 행 (CLOSED — 안내만)

채권 분류는 `position.assetId === asset.id` 하나로만 이어진다(js/29
`resolveBondAssetCharacter`). 그런데 Monte Carlo가 넘기는 대상에 **id가 없을 수 있다.**

| 목표 행 | 넘어가는 대상 | 채권 정보를 채우면? |
| --- | --- | --- |
| 「채권 20%」 자산군 캐치올 | `null` (js/05 `categoryDetail`) | **반영되지 않는다** |
| 이어지는 보유분이 없는 행 | 가상 자산(probe) - id 필드 자체가 없다 | **반영되지 않는다** |
| 보유분과 이어진 행 | 진짜 자산 | 반영된다 |

예전 안내는 세 경우 모두에게 "채권 정보를 채우면 다음 계산부터 반영됩니다"라고 했다.
앞의 둘에서는 사실이 아니었고, 사용자는 시키는 대로 다 채우고도 경고가 그대로인 상태를
반복해서 겪었다.

이제 **해야 할 일이 다르면 카드도 나눈다**(화면은 같은 code끼리 묶고 권고문은 첫 건 것만
보여준다 - js/22 `renderSafetyIssueGroupCard`).

| code | 뜻 | 권고 |
| --- | --- | --- |
| `BOND_RISK_ASSUMPTION_UNRESOLVED` | 보유 채권과 이어져 있다. 채권 정보가 비어 있다 | 발행인 유형을 채운다(외화면 환헤지도) |
| `BOND_RISK_TARGET_NOT_LINKED` | 이 행은 어떤 보유 채권도 가리키지 않는다 | 비중조절에서 개별 종목으로 추가한다 |

**이어지지 않은 행을 계산상 연결하는 것은 이번 범위가 아니다** - MC 결과가 달라진다
(σ=0 → CMA 변동성). PM 결정 대기(59-6 D-1).

### 59-4. ISSUE-04 · 검색 0건의 이유 (CLOSED)

보유 자산이 비중조절 후보에서 빠지는 조건은 넷인데(js/04 `searchRtmAddCandidates`)
화면은 "검색 결과가 없습니다." 한 줄이었다.

| 조건 | 이제 알려주는 것 |
| --- | --- |
| 다른 지역 탭 | 어느 탭에 있는지 + 자산관리에서 국내/해외를 고칠 수 있다는 것 |
| 절세계좌(ISA · IRP · 연금저축) | 어느 계좌인지 + 목표 비중은 일반계좌만 다룬다는 것 |
| 다른 사람 명의 | 누구 것인지 |
| 이미 목표에 있음 | 아래 목록에서 비중을 고치면 된다는 것 |
| 아무 데도 없음 | 종목명 일부나 표준코드(ISIN)로 다시 찾으라는 것 |

후보를 고르는 규칙(`searchRtmAddCandidates`)은 **한 글자도 바꾸지 않았다** - 0건일 때
보여줄 한 줄을 덧붙였을 뿐이다. `diagnoseRtmAddNoResult`(js/04).

### 59-5. 전수 점검 결과

| 축 | 결과 |
| --- | --- |
| 지역 판정 일관성 | `sanitizeTicker(...).isDomestic` 호출 **0건**(주석 1건만 남음) - §58 D-7 유지 |
| 저장 시점 암묵 삭제 | js/07 두 곳뿐. 하나는 의도된 정책(채권 아님), 하나가 ISSUE-01이었다. 나머지 splice는 전부 사용자가 누른 삭제 · 0% 설정이다 |
| 채권 생명주기 | 거래 폼 · 자산 폼 둘 다 발행인 유형을 갖는다. 거래 폼의 upsert 키는 ISIN + 소유자 + 계좌다 |
| 환헤지 생명주기 | 값이 **두 곳**에 있다 - `asset.fxHedgeStatus`(Risk · MC 자산군)와 `bondPosition.identity.hedgeStatus`(채권 분류). 59-6 D-2 참조 |

### 59-6. PM 결정 대기 (OPEN)

> **[해소됨 → §60]** D-1 · D-2는 PM 결정(2026-09-24)과 구현이 모두 끝났다 — **현재 CLOSED**. D-1 = A안(자동 연결하지 않음 · 구현 없음) · D-2 = A안(자산의 환헤지를 폴백으로 사용 · 구현 완료). 아래 원문은 결정 전의 분석과 선택지를 남겨 두기 위한 기록이다.

둘 다 고치면 **Monte Carlo 결과가 달라진다**(σ=0 → CMA 변동성). 그래서 임의로 구현하지 않았다.

**D-1 · 이어지지 않은 목표 행을 연결할 것인가**
자산군 캐치올 행(「채권 20%」)과 보유분을 찾지 못한 행은 채권 분류에 닿을 수 없다.
지금은 그 사실을 정확히 알리고 사용자가 개별 종목으로 바꾸도록 안내한다(59-3).
자동 연결은 "어느 채권으로 볼 것인가"를 시스템이 정하는 일이라 근거가 필요하다.

**D-2 · 외화 채권의 환헤지가 거래내역 경로에서 닿지 않는다**
거래 폼의 환헤지 칸(`tx_fxHedgeStatus`)은 **자산의** `fxHedgeStatus`에 저장된다.
채권 분류가 보는 것은 **채권 레코드의** `identity.hedgeStatus`이고, 그 칸은 자산 폼에만
있는데 거래내역이 원천인 자산은 자산 폼 [수정]이 숨겨진다(BL-8). 결과적으로 **외화 채권을
거래내역으로 등록하면 환헤지를 넣을 경로가 없다.** 원화 채권은 환헤지를 보지 않으므로 영향이
없다(§58-5). 선택지는 "사용자가 이미 고른 자산의 환헤지를 채권 분류도 함께 본다" ·
"거래 폼에 채권 환헤지 칸을 따로 둔다" · "그대로 둔다"이며, 앞의 둘은 계산 결과를 바꾼다.

### 59-7. 테스트

신규 — `test/v270-bond-input-guidance.test.js`(19) · `e2e/121-input-guidance-v270.spec.js`.
ISSUE-01 저장 · 미삭제 · 빈 입력 · 자산군 이탈 / ISSUE-02 원화 · 외화 · 레코드 없음 /
ISSUE-03 캐치올 · 미연결 · 분류된 채권 무경고 / 계산 불변(σ · 비중 · 원금) /
ISSUE-04 다섯 가지 이유 · ISIN 대소문자.

---

## §60. 환헤지 데이터 우선순위 · 업로드 경쟁 상태 (PM 결정 2026-09-24)

### 60-1. D-1 = A안 (CONFIRMED · 구현 없음)

이어지지 않은 목표 행을 특정 채권에 **자동으로 연결하지 않는다.**

- 자산군 캐치올 「채권 20%」를 어느 보유 채권으로도 해석하지 않는다.
- 보유분을 임의로 특정하지 않는다.
- 이름 · 티커 자동매칭 범위를 절세계좌까지 넓히지 않는다.
- §59-3의 "개별 종목으로 추가" 안내를 유지한다 - 사용자가 고르면 그때부터 반영된다.

**이 결정으로 바뀐 계산은 없다.** 회귀 하네스 값이 v269 기준선과 완전히 같음을 확인했다.

### 60-2. D-2 = A안 (CONFIRMED · 구현 완료)

환헤지 값이 두 곳에 따로 있었다.

| 저장 위치 | 쓰는 곳 | 입력 경로 |
| --- | --- | --- |
| `bondPosition.identity.hedgeStatus` | 채권 분류(js/29 `resolveBondClass`) | 자산 폼 `f_bondHedge` |
| `asset.fxHedgeStatus` | Risk(js/09) · MC 자산군(js/16 `applyUserHedgeToAppClass`) | 거래 폼 `tx_fxHedgeStatus` · 자산 폼 `f_fxHedgeStatus` |

거래내역이 원천인 자산은 자산 폼 [수정]이 숨겨진다(BL-8). 그래서 **외화 채권을 거래내역으로
등록하면 채권 분류용 환헤지를 넣을 경로가 한 곳도 없었다** - 영원히 UNCLASSIFIED였다.

**확정 규칙 - 하나의 함수가 전부를 결정한다**(js/29 `resolveBondHedgeStatusDetail`).

| 순위 | 조건 | 결과 `source` |
| --- | --- | --- |
| 0 | 통화가 KRW | `NOT_APPLICABLE` - 환헤지를 보지 않는다(§58-5) |
| 1 | `bondPosition.identity.hedgeStatus`가 유효 | `bondPosition` |
| 2 | 없고 `asset.fxHedgeStatus`가 유효 | `asset` |
| 3 | 둘 다 없음 | `UNRESOLVED` - 헤지로도 비헤지로도 단정하지 않는다 |

- 유효한 값은 `HEDGED` · `UNHEDGED` 둘뿐이다. 빈 값 · 알 수 없는 값은 없는 것과 같다.
- **두 값이 모두 있고 서로 달라도 언제나 1순위가 이긴다** - 호출 순서 · 횟수 · 화면과 무관하다.
- 호출부가 자산을 넘기지 않으면 `assetId`로 `state`에서 한 번 찾는다. 그래서 Bond Risk ·
  MC · 자산 상세가 **같은 답**을 낸다(화면마다 갈라지지 않는다).
- **읽기만 한다.** 저장된 두 값 어느 쪽도 바꾸지 않고, 새 입력칸도 만들지 않는다.
- `asset.fxHedgeStatus`의 의미는 그대로다 - Risk · US_EQUITY 헤지 전환에서 쓰던 그대로 쓰인다.

**MC 결과 변화** - 허용된 범위 안에서만 일어난다.
`hedgeStatus → BOND_CLASS → ASSET_CHARACTER → 기존 CMA/MC 로직`을 그대로 지난 결과다.
σ를 임의로 조정하거나 결과를 보정하는 코드는 없다(실측: 분류된 외화 국채의 σ가 공식
J.P. Morgan LTCMA 값과 1e-9 이내로 일치. μ · 비중 · 다른 자산은 무변경).

### 60-3. 환헤지 전수 점검 결과

| 경로 | 무엇을 보는가 | 이번 변경 |
| --- | --- | --- |
| Bond 분류 (js/29 `resolveBondClass`) | 60-2 우선순위 | **폴백 추가** |
| Bond Risk 요약 (js/29 `computeBondRiskSummary`) | 같은 함수 | 자동 반영(자산을 state에서 찾는다) |
| MC 자산군 (js/16 `resolveMcAppAssetClass`) | `resolveAssetCharacter` → 같은 함수 | 자동 반영 |
| Portfolio Risk (js/09 `userConfirmedRiskEntry`) | `asset.fxHedgeStatus`만 | 무변경(주식 · ETF 전용 · PD-15) |
| US 주식 헤지 전환 (js/16 `applyUserHedgeToAppClass`) | `asset.fxHedgeStatus`만 | 무변경 |
| 자산 상세 「위험 분석 확인」 | `asset.fxHedgeStatus` | 무변경. 주식 · ETF에만 뜬다(`RISK_ELIGIBLE_CATEGORIES`) |
| 거래 폼 환헤지 | `asset.fxHedgeStatus` | 무변경. 자산군과 무관하게 **환노출이 있으면** 뜬다 → 외화 채권도 입력 가능 |
| Excel | `asset.fxHedgeStatus`("환헤지(사용자확인)") | 무변경. 채권 레코드의 환헤지는 Excel 대상이 아니다(왕복해도 레코드는 그대로 남는다) |
| Backup / Restore | 자산 · `bondPositions` 둘 다 포함 | 무변경 - 두 값 모두 보존된다 |
| Sync | 자산 · `bondPositions` 둘 다 병합 | 무변경 - 두 값 모두 보존된다 |

### 60-4. 업로드가 상대 기기의 업로드를 덮어쓰던 경쟁 상태 (CLOSED)

전체 E2E에서 두 번 관찰된 e2e/78 실패(`pullAndAccept`가 `up_to_date`를 받음)는 테스트
하네스 문제가 아니라 **제품의 경쟁 상태**였다. 실측 재현:

```
pc    GET  클라우드 v1 확인 → "내 것과 같다" → 암호화 …
phone                         그 사이에 새 거래를 v2로 업로드
pc    POST 뒤늦게 도착 → v2를 v1보다 작은 버전으로 덮어씀
pc    pull → remote.version <= lastVersion → 'up_to_date'
```

상대 기기가 올린 거래가 **클라우드에서 사라지고**, 그 뒤 모든 기기가 클라우드를 "최신"으로
오해한다. `pushToCloud`의 "덮어쓰기 전 병합" 가드가 막겠다고 적어 둔 바로 그 시나리오인데,
가드가 **확인 시점에만** 있고 쓰는 시점에는 없었다(확인과 쓰기 사이에 PBKDF2 · AES-GCM
암호화가 들어 있어 실제로 길다).

**고친 것 - 새 정책이 아니라 기존 정책의 빠진 구현이다.**

1. 업로드 직전에 클라우드 버전을 한 번 더 읽는다. 확인했을 때와 다르면 **쓰지 않고 물러난다**
   (`remote_changed`). 다음 pull이 그 차이를 사용자에게 보여 주는 기존 경로를 탄다.
2. 버전 시각을 POST 직전에 찍는다. 예전에는 암호화 전에 찍어, 늦게 도착한 쓰기가 더 작은
   버전을 남겼다.

병합 규칙 · 충돌 해소 방식 · 암호화 · payload 모양은 하나도 바꾸지 않았다.
재확인을 일시적으로 꺼서 같은 시나리오가 다시 `up_to_date`가 되는 것도 확인했다(원인 확정).

### 60-5. PM 결정 대기 (OPEN)

> **[해소됨 → §61]** D-3은 PM 결정(2026-09-24)과 구현이 모두 끝났다 — **현재 CLOSED**. D-3 = B안(채권 레코드를 동기화 차이 검사에 포함 · [클라우드 데이터 받기]에서도 함께 반영). 아래 원문은 결정 전의 분석과 선택지를 남겨 두기 위한 기록이다.

**D-3 · 채권 레코드만 다른 경우는 확인 없이 병합된다**
동기화 차이 검사(js/25 `compareSyncData`)는 자산 · 거래 · 목표비중 · 미래예측만 본다.
`bondPositions`는 검사 대상이 아니면서 pull에서는 `mergeCollectionById`로 병합된다
(js/12). 그래서 상대 기기가 채권의 만기 · 쿠폰 · 발행인 유형 · 환헤지만 고친 경우
§57의 "사용자 모르게 병합하지 않는다"가 적용되지 않는다. 검사 대상을 넓히는 것은
"무엇을 물어볼 것인가"를 바꾸는 정책 변경이라 임의로 하지 않았다.

### 60-6. 테스트

신규 — `test/v270-bond-hedge-fallback.test.js`(12) · `e2e/122-push-overwrite-race.spec.js`(3).
D-2 1~10 전 항목(원화 미적용 · 원화 무영향 · identity 우선 · asset 폴백 · UNRESOLVED ·
거래내역 기반 자산 · 두 값 충돌 시 결정성 · 주식/ETF 회귀 · 원화 채권 회귀 · MC 변경 추적) ·
업로드 경쟁(덮어쓰기 방지 · 정상 경로 유지 · 버전 단조 증가).

---

## §61. 채권 동기화 차이 검사 · KIS 공유키 (PM 결정 2026-09-24)

### 61-1. D-3 = B안 (CLOSED) — 채권도 차이 검사 대상이다

**무엇이 어긋나 있었나** - 차이 검사(js/25 `compareSyncData`)는 자산 · 거래 · 목표비중 ·
미래예측만 봤는데, pull은 `bondPositions`를 `mergeCollectionById`로 병합했다. 상대 기기가
채권의 만기 · 쿠폰 · 발행인 유형 · 환헤지만 고치면 §57의 "사용자 모르게 병합하지 않는다"가
적용되지 않았다.

**비교 대상은 새로 정하지 않았다.** `makeBondPosition`(js/29)이 실제로 저장하는 값 전부다 -
받는 쪽이 쓰는 바로 그 정규화 함수이므로(js/12), 동기화하면 같아지는 표기 차이는 차이로 보지
않는다. 목록을 코드에 적지 않고 저장 구조에서 만들어 내므로(`syncDiffBondFields`) 나중에
필드가 늘어도 빠뜨리지 않는다. 기존 원칙대로 `updatedAt`은 비교하지 않고, `id`는 짝을 짓는
키라 값 비교에서 뺀다.

| 항목 | 규칙 |
| --- | --- |
| 같으면 | 예전 그대로 묻지 않고 자동 완료 |
| 다르면 | 기존 §57 화면 - [클라우드 데이터 받기] / [이 기기 데이터 올리기] / [취소] |
| 클라우드에 채권 키가 없으면(구버전) | 차이로 보지 않는다 - 받아도 이 기기 채권이 바뀌지 않는다 |
| 모양이 잘못됐으면 | 자산 · 거래와 같이 막는다(`bondPositionsNotArray` · `bondPositionWithoutId`) |

새 LWW · 새 레코드 단위 자동병합 · 채권 전용 충돌정책은 만들지 않았다. 자동 동기화 경로의
`mergeCollectionById`도 그대로 둔다 - 이제 그 경로는 **차이가 없을 때만** 도달한다.

**함께 고친 것 (조사 중 확인한 결함)** - `[클라우드 데이터 받기]`(fullAdopt)가 채권에 아예
손대지 않았다. 채권 병합이 `mergeAssetsAndTransactionsWithRemote` 안에만 있는데 이 경로는 그
함수를 부르지 않는다. 그래서 사용자가 "클라우드"를 골라도 **이 기기 채권이 그대로 남았다** -
고른 쪽이 그대로 적용된다는 원칙이 깨진 상태였다. 자산 · 거래와 같은 방식으로 통째 채택하고
기준선을 다시 잡는다(`LS_SYNC_MERGED_BOND_IDS`).

### 61-2. D-4 = B안 (CLOSED) — 공유키를 소스에 두지 않는다

> **[대체됨 · 2026-09-26]** 이 절의 판단(값을 소스에서 제거)은 §62의 PM 결정 D안으로 대체되었다. 아래 기록은 그때의 분석과 근거를 남겨 두기 위한 것이며, 현재 적용 정책은 **§62**다. 명칭도 함께 바뀌었다 — 기존 명칭 `KIS_CLIENT_SHARED_SECRET` → 정책 재정의 후 `KIS_PROXY_ACCESS_TOKEN`.

Worker는 요청마다 `X-App-Secret` 헤더를 `env.CLIENT_SHARED_SECRET`과 맞춰 본다(미등록이면
503 · 불일치면 401 - §47-8). 그 값이 공개 저장소의 js/01에 리터럴로 적혀 있었고, 코드 주석은
"공개 저장소라 어차피 보이는 봇 차단용 문턱"이라는 예외를 달고 있었다.
**그 예외를 없앤다** - 선존이라는 이유로 다음 버전에 가져가지 않는다.

| 계층 | 이번 변경 |
| --- | --- |
| Worker | **무변경.** binding 사용 · fail-closed · KIS 앱키/앱시크릿의 환경변수 구조 전부 그대로 |
| 클라이언트 | 값을 코드에 갖고 있지 않는다. 실행 시점에 받은 값만 쓴다 |

읽는 순서(고정) — js/01 `resolveKisClientSharedSecret`
1. `globalThis.JASAN_RUNTIME_CONFIG.kisClientSharedSecret` (호스팅 · 배포가 주입)
2. `localStorage` 키 `sam_kis_client_secret_v1` (기기별 설정)
3. 둘 다 없으면 `null`

- 값이 없으면 **프록시를 아예 부르지 않는다**(js/13) - 반드시 401이 될 왕복을 만들지 않는다.
  돌려주는 값은 기존 실패와 같은 `null`이라 호출부 동작이 달라지지 않고, 시세 · 보유정보 ·
  위험 진단 등 다른 기능은 그대로다.
- 값은 `X-App-Secret` 헤더에만 싣는다. 주소 · 쿼리 · 본문 · 로그 · 오류 메시지에 넣지 않는다.
- `state`에 넣지 않으므로 백업 · 동기화 · Excel 어디에도 들어가지 않는다.

**운영 영향(반드시 인지)** - 이 저장소는 빌드 없이 GitHub Pages로 그대로 배포된다. 저장소에
값이 없으므로 **배포본은 위 두 경로 중 하나로 값을 받기 전까지 KIS 조회가 동작하지 않는다.**
KIS를 쓰는 기능(국내 재무 데이터 · 채권 표준코드 조회 · 국내 시세 보조 경로)만 조용히 빠지고
나머지는 그대로다. 값을 어떻게 공급할지는 61-4 참조.

### 61-3. 보안 검사 기준

`test/v270-kis-secret-config.test.js`가 고정한다 - 값을 만들지도 출력하지도 않는다.

- 아무 설정도 없으면 `resolveKisClientSharedSecret()`이 `null`이다(= 소스에 값이 없다는 증거)
- js/ 전체 · index.html · sw.js에 `CLIENT_SHARED_SECRET` · `X-App-Secret` · `KIS_APP_KEY` ·
  `KIS_APP_SECRET` · `access_token` 이름 뒤에 문자열 리터럴이 붙은 곳이 없다
  (Worker 쪽 같은 검사 `test/kis-worker-security.test.js`를 클라이언트로 넓힌 것이다)
- Worker의 binding 사용 · fail-closed · 헤더 검증이 그대로 남아 있다

### 61-4. PM 결정 대기 (OPEN)

> **[해소됨 → §62]** D-5(배포본에 공유키를 어떻게 공급할 것인가)는 §62의 PM 결정 D안으로 해소됐다 — **현재 CLOSED**. 소스 기본값을 복원했으므로 배포본은 별도 설정 없이 동작하며, 별도 배포 파이프라인을 만들지 않는다(§62-9 경로로 교체만 가능). 값의 성격도 "공개정보 전용 Proxy Access Token"으로 다시 정의됐다(§62-2). 아래 원문은 결정 전의 분석과 선택지를 남겨 두기 위한 기록이다.

**D-5 · 배포본에 공유키를 어떻게 공급할 것인가**
저장소에 값을 두지 않기로 했으므로, GitHub Pages 배포본이 값을 받을 경로가 필요하다.
지금 코드가 지원하는 두 입구(주입 config · 기기별 localStorage)는 열려 있지만 **무엇으로
채울지는 운영 결정**이라 임의로 정하지 않았다.

- A. 기기별 설정 - 쓰는 기기에서 `sam_kis_client_secret_v1`을 한 번 넣는다.
  저장소 · 배포본 어디에도 값이 남지 않는다. 기기가 바뀌면 다시 넣어야 한다.
- B. 배포 시 주입 - 배포 단계가 `JASAN_RUNTIME_CONFIG`를 쓰는 파일을 만들어 넣는다.
  새 배포 파이프라인이 필요하다(지금은 빌드 단계가 없다).
- C. 헤더 검사를 Worker에서 걷어내고 Origin 허용 목록 + 요청 수 제한에만 의존한다.
  Worker 코드가 스스로 "실질적인 방어선은 Origin 허용 목록 + 요청 수 제한이고 공유 비밀키는
  보조 수단"이라고 적고 있다. 정적 공개 클라이언트가 비밀을 가질 수 없다는 사실과도 맞는다.
  다만 방어 계층 하나를 줄이는 결정이라 PM 승인이 필요하다.

어느 쪽을 고르든 기존 값은 Cloudflare 대시보드에서 새로 바꾸는 것이 전제다(저장소 이력에
남아 있던 값이므로). **값 자체는 이 문서 어디에도 적지 않는다.**

### 61-5. 테스트

신규 — `test/v270-sync-bond-diff.test.js`(16) · `test/v270-kis-secret-config.test.js`(11) ·
`e2e/123-sync-bond-diff.spec.js`(7).
D-3 지정 12항목(동일 · 만기 · 쿠폰 · 발행인 유형 · 환헤지 · 표준코드 · 사용자 선택 표시 ·
이 기기 선택 · 클라우드 선택 · 다른 묶음 불변 · 잘못된 자동병합 없음 · 불필요한 확인 없음) ·
D-4 소스 부재 · 우선순위 · 미설정 시 호출 안 함 · 헤더 전용 · 저장 안 됨.

---

## §62. KIS Proxy Access Token — 정책적 공개 예외 (PM 결정 2026-09-26 · D안)

§61-2를 대체한다. 결론은 "값을 숨긴다"가 아니라 **"이 값이 실제로 무엇인지 사실대로 부르고,
그 사실에 맞는 검사 규칙을 둔다"**다.

### 62-1. 명칭

| | |
| --- | --- |
| 기존 명칭 | `KIS_CLIENT_SHARED_SECRET` (클라이언트 상수) |
| 현재 명칭 | `KIS_PROXY_ACCESS_TOKEN` (js/01-core-state.js) |

**바꾸지 않은 것** — Worker 환경변수명 `CLIENT_SHARED_SECRET`과 HTTP 헤더명
`X-App-Secret`. 이미 Cloudflare에 등록되고 배포된 계약이라, 바꾸면 재등록 전까지
fail-closed로 전면 503이 된다. 둘의 대응관계는 js/01과 Worker 파일 머리말에 적어 두었다.

### 62-2. 정책 성격

`KIS_PROXY_ACCESS_TOKEN`은 **금융정보 접근 credential이 아니다.**

- 한국투자증권이 발급한 값이 아니라 **사용자가 직접 정한 임의 문자열**이다
  (Worker 설치 안내문: "이 앱만 아는 임의의 긴 무작위 문자열(직접 정해서 등록)").
- 정적 공개 페이지가 매 요청에 실어 보내므로 **원리상 공개값**이다. Worker 소스도 같은 말을
  적고 있다 — "X-App-Secret은 원리상 공개값이다 … 실질적인 방어선은 Origin 허용 목록 +
  요청 수 제한이고, 공유 비밀키는 보조 수단이다"(cloudflare-worker-kis-proxy.js 79~80).
- 하는 일은 하나다: Worker 주소를 알아낸 제3자가 curl로 두드리는 것을 한 번 걸러낸다.

### 62-3. 현재 데이터 범위 (코드 실측)

Worker는 앱으로부터 다음을 **받지 않는다** — 앱이 보내는 것은 종목코드 또는 표준코드(ISIN)와
조회 기간뿐이다.

자산 보유정보 · 평가액 · 계좌번호 · 계좌잔고 · 주문 · 매매정보

### 62-4. 현재 route (코드 실측 · 5개 전부 공개정보)

| route | 상류(KIS) | 성격 |
| --- | --- | --- |
| `/api/kis/price` | `quotations/inquire-price` | 현재가 |
| `/api/kis/fundamentals` | `finance/balance-sheet` 등 | **기업 재무제표(공시자료)** |
| `/api/kis/investor-flow` | `quotations/inquire-investor` | 투자자별 매매동향 |
| `/api/kis/bond-info` | 채권 발행정보 | 발행조건 |
| `/api/kis/bond-price` | 채권 시세 | 시세 |

> 오해 방지 — `balance-sheet`는 **기업 재무상태표**이고 계좌 잔고가 아니다.
> `inquire-` 접두어도 KIS 시세 API의 조회 접두어이며 계좌조회가 아니다.

주문 · 계좌 라우트는 코드에 없고, 그 사실은 테스트가 고정한다
(`v1/trading/` 금지 · `order-cash|inquire-balance|inquire-psbl|inquire-account` 금지).

### 62-5. 실제 KIS credential

`KIS_APP_KEY` · `KIS_APP_SECRET`은 Cloudflare Worker의 서버 환경(Secrets)에서만 관리한다.
저장소 · 클라이언트 · 백업 · 동기화 어디에도 없다. KIS 접근토큰(`access_token`)도 Worker가
KV에 캐시하며 클라이언트로 내려오지 않는다.

### 62-6. 유지되는 방어선 (코드 실측)

| 방어선 | 실제 값 · 동작 |
| --- | --- |
| Origin 허용 목록 | 4개 — 운영 GitHub Pages · localhost:8644 · 127.0.0.1:8644 · localhost:8643. 목록 밖이면 CORS 허용 헤더를 붙이지 않는다 |
| 토큰 미등록 | `503 not_configured` — fail-closed(§47-8) |
| 토큰 불일치 | `401 unauthorized` |
| 요청 수 제한 | 분 30회 · 일 300회 초과 시 `429` + `Retry-After` |
| 상류 오류 | `502 upstream_error` — 상류 본문을 그대로 넘기지 않는다 |
| 라우트 구성 | 공개정보 5개뿐 |

인증 순서: CORS 계산 → OPTIONS 204 → GET 아니면 405 → 토큰 미등록 503 → 불일치 401 →
입력 검증 → 라우팅 · 캐시 → 요청 수 제한 → 상류.

### 62-7. Secret Scan 정책 예외

예외명: **`KIS_PROXY_ACCESS_TOKEN_PUBLIC_EXCEPTION`**

무조건 제외가 아니다. `test/v270-kis-proxy-token-policy.test.js`가 **조건 7개를 매번 실제로
확인**하고, 하나라도 깨지면 실패한다.

1. 이름이 `KIS_PROXY_ACCESS_TOKEN`이다 (옛 명칭이 코드에 되살아나면 실패)
2. 실제 KIS APP KEY / APP SECRET이 아니다 (Worker 환경변수로만 읽는다)
3. 공개정보 조회 전용 Worker 접근용이다 (62-4의 5개 라우트와 정확히 일치)
4. Origin 허용 목록이 유지된다 (실측 - 목록 밖 Origin은 허용 헤더 없음)
5. 요청 수 제한이 유지된다 (실측 - 31번째 요청이 429)
6. 민감정보 라우트가 추가되지 않았다 (`v1/trading/` 등 금지)
7. 예외 대상은 이 토큰 **하나**로 한정한다 (허용 목록 길이 1을 검사)

**금지 사항 — 만들지 않는다**
모든 `*_TOKEN` 허용 · 모든 KIS 문자열 허용 · 특정 파일 전체 제외 ·
`cloudflare-worker-kis-proxy.js` 전체 예외 · 광범위한 경로 예외.

허용되지 않은 값이 새로 들어오면 실패한다 — 민감해 보이는 이름에 문자열 리터럴이 붙은 곳을
전부 찾아 허용 목록의 하나만 통과시킨다. `LS_` 로 시작하는 상수는 이 프로젝트 규약상
localStorage **키 이름**이라 값이 아니므로 제외한다.

### 62-8. 예외 재검토 조건

Worker에 다음 중 하나라도 추가되면 **이 예외 정책을 재검토한다.**

계좌정보 · 잔고 · 주문 · 매매 · 그 밖의 사용자별 금융정보

또한 토큰 남용이나 운영정책 변경이 확인되면 **토큰을 교체**한다. 교체 시 코드를 고치지 않아도
되도록 덮어쓰기 경로를 두었다(아래).

### 62-9. 토큰 교체 경로

읽는 순서(고정) — js/01 `resolveKisProxyAccessToken`

1. `globalThis.JASAN_RUNTIME_CONFIG.kisProxyAccessToken` (호스팅 · 배포가 주입)
2. `localStorage` 키 `sam_kis_proxy_access_token_v1` (기기별 설정)
3. 둘 다 없으면 소스의 `KIS_PROXY_ACCESS_TOKEN` 기본값

- 기본값이 있으므로 배포본은 설정 없이도 정상 동작한다(§61-2에서 생겼던 기능 중단이 해소된다).
- 토큰은 `X-App-Secret` 헤더에만 싣는다. 주소 · 쿼리 · 본문 · 로그 · 오류 메시지에 넣지 않는다.
- `state`에 넣지 않으므로 백업 · 동기화 · Excel 어디에도 들어가지 않는다.

### 62-10. 이 예외가 해결한 것

이름이 `SECRET`이었던 탓에 Secret Scan이 릴리스마다 1건을 검출했고, 매번 "기존 항목이라
통과"로 넘어갔다(인계장 3곳에 그 기록이 남아 있다). **경보가 무시되기 시작하는 것**이
원리상 공개값 하나가 공개된 것보다 위험하다. 이제 검사는 조건을 확인하고 통과하거나
실패하며, "예전 거니까"라는 판단이 끼어들 자리가 없다.

### 62-11. 테스트

`test/v270-kis-proxy-token-policy.test.js`(14) — 조건 1~7 · 실제 비밀 부재 · 허용 외 값 차단 ·
토큰 사용 위치 · 기본값 정상 호출 · 덮어쓰기 우선순위 · 헤더 전용 · 미저장 ·
401 · 503 · 429 · Origin 실측.
기존 `test/kis-worker-security.test.js`(Worker 계약)는 손대지 않았다.
`test/v270-kis-secret-config.test.js`(§61-2용)는 이 파일로 대체되어 삭제했다.

### 62-12. D-6 · 동기화 동시 업로드 Race Window — 구조적 제약 (CLOSED)

**상태** CLOSED · **PM 최종 결정** A안(현행 유지) · **결정 주체** PM 사용자 (2026-09-26)

업로드는 쓰기 직전에 클라우드를 다시 확인한다(§60-4). 그래도 **재확인 응답과 실제 쓰기가
서버에 도달하는 사이**의 좁은 구간은 남는다. 두 기기가 거의 같은 순간에 올리면 늦게 도착한
쓰기가 앞선 쓰기를 덮을 수 있다.

닫으려면 저장소가 "기대 버전과 같을 때만 저장"을 받아 줘야 한다(조건부 쓰기). 현재 쓰는
Cloudflare KV에는 그 기능이 없고, Worker 안에서 읽고-비교-쓰기를 해도 Worker 자체가 동시에
실행되므로 같은 구간이 남는다. 진짜로 닫으려면 동기화 저장 구조 자체를 바꿔야 한다
(Durable Objects · 트랜잭션 저장소). **PM 결정으로 현행 구조를 유지한다.**

| | |
| --- | --- |
| 제약 | 재확인 → 쓰기 구간의 잔여 race window. 저장소에 조건부 쓰기가 없어 클라이언트만으로는 닫을 수 없다 |
| 좁혀진 정도 | 암호화 구간 전체 → 요청 한 번 왕복(§60-4에서 수정) |
| 발생 조건 | 두 기기 모두 동기화 켜짐 + 거의 같은 순간 업로드 + 올리는 내용이 서로 다름 |
| 발생 시 | 상대가 방금 올린 내용이 클라우드에서 사라진다 |
| 복구 | **덮어써진 기기에 원본이 그대로 남는다.** 다음 동기화에서 차이 화면이 뜨고, 무엇을 잃는지 항목별로 보여준 뒤 사용자가 고른다 |
| 고정 테스트 | `e2e/122-push-overwrite-race.spec.js` — 주요 경로(낡은 정보로 판단한 업로드)를 서버 응답 지연으로 확정적으로 고정한다 |

**전제로 유지하는 현재 구조**
- 두 곳이 같으면 묻지 않고 자동 완료
- 다르면 앱이 고르지 않고 사용자가 [클라우드 데이터 받기] · [이 기기 데이터 올리기]에서 고른다
- 고른 쪽 기준으로 반영된다(자산 · 거래 · 채권 · 목표비중 · 미래예측)
- 덮어써진 기기에 원본이 남아 복구할 수 있다

**추가하지 않는 것** — Conditional Write · Worker 조건부 쓰기 · LWW ·
record-level 자동 병합 · 새 동기화 정책 · 새 동기화 UI.

### 62-13. 종결 상태 (2026-09-26 · v270 릴리스 기준)

| 구분 | 건수 | 내용 |
| --- | --- | --- |
| 코드 · 구현 미결 | **0** | — |
| PM 결정 대기 | **0** | D-1 · D-2 · D-3 · D-4 · D-5 · D-6 전부 CLOSED |
| 운영 조치 | **1** | KIS Proxy Access Token 교체(아래) |

| 결정 | 내용 | 상태 |
| --- | --- | --- |
| D-1 | 목표비중 행을 자동 연결하지 않는다(A안 · 구현 없음) | CLOSED |
| D-2 | 외화 채권 환헤지를 자산 값으로 폴백(A안) | CLOSED |
| D-3 | 채권 레코드를 동기화 차이 검사에 포함(B안) | CLOSED |
| D-4 | KIS Proxy Access Token 정책 예외(D안) | CLOSED |
| D-5 | 배포본 공급 방식 → §62 D안으로 해소 | CLOSED |
| D-6 | 동시 업로드 race window를 구조적 제약으로 수용(A안) | CLOSED |

**운영 조치 1건 — 코드 미결이 아니다**

`KIS_PROXY_ACCESS_TOKEN`의 이전 값이 git 이력에 남아 있을 수 있다(§61-2 이전 커밋).
그래서 운영 차원에서 **Cloudflare 대시보드의 현재 Proxy Access Token 값을 새 값으로
교체하는 것이 필요하다.** 교체하면 코드를 고치지 않고 §62-9 경로로 반영할 수 있다.

- 이 토큰은 실제 KIS APP KEY · APP SECRET과 **별개**다(그 둘은 Worker 서버 환경에만 있다).
- 토큰 교체는 **운영 절차**이며 코드 변경사항이 아니다. v270 코드 릴리스를 막지 않는다.
- 실제 값은 이 문서 · 보고서 · 로그 어디에도 적지 않는다.

이후 새로 발견되는 사항은 이 절에 누적하지 않고 **별도 이슈로 관리한다.**
