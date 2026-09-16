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
- correlation은 date-aligned daily returns + Pearson + PSD correction + Cholesky *(→ 2026-09-16 PM 승인으로 장기 MC 상관계수는 CMA 체계로 대체, §37)*
- missing observations <10 → corr 0 + Safety WARNING *(→ §37로 대체 - 장기 MC는 가격이력 상관을 쓰지 않는다)*
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
- ~~CMA 자동 업데이트~~ *(→ 2026-09-16 PM 승인으로 범위 포함, §37 CMA-AUTO-01~06)*
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
- **장기 MC CMA 체계 · CMA 자동 업데이트 · Correlation Benchmark — PM 승인 정책 등록(2026-09-16, §37)** — §7 상관 · RET-03-06 변동성 · §13 CMA 자동 업데이트 문구를 §37로 대체(삭제 없음). 구현 기록은 §37-2 이후

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
- N-02(엑셀 무수정 왕복 시 system → user 승격)는 이번 FIX 범위가 아니다. 이름으로 재확인되지 않는 시스템 추천 자산군은 왕복 뒤 사용자 확정이 되어 계산 근거가 바뀔 수 있다.
- 결과 유효성 서명은 객체 키 순서를 비교하지 않는다(키 정렬 직렬화). 다만 배열 순서(목표 항목 · 배분 항목 순서)가 바뀌면 같은 내용이어도 "다시 계산 필요"가 뜬다(보수적 방향).
- 같은 소유자 · 같은 계좌 안의 보유분끼리 대표매칭이 다르면 어느 쪽도 고르지 않고 자동 판별로 계산한다(경고 표시).

**32-5. PM Decision 기록**
- **PMD-03 계산 방식 — 확정(A, 2026-09-15)**: 구현 보고 당시 "미선택 적립금을 목표 비중에 자동 분산하지 않는다"와 §7 기본 순서(contribution → target allocation)의 충돌, 미선택 금액의 계산 방법 부재를 PM Decision으로 올렸다. PM이 A(현행 MC 계산 유지 + 미선택 경고)로 확정했다 - 추가 계산 코드 없음, v245 경고 구현이 최종 정책이다. 선택지 B(선택 종목 MC 반영) · C(미선택분 투자 제외) · D(실행 차단)는 채택하지 않았다.
- **N-02**(엑셀 무수정 왕복 시 system → user 승격)는 이번 통합 과제에서 제외된 OPEN ISSUE로 유지한다(수정 · migration 없음).

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
