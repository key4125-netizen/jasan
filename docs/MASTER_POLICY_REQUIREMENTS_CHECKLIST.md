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
- **V1.3 — CLOSED**: BL-19(v226) · P1-1 위험점수 범위 고지(v226) 두 항목을 릴리즈하고 종료했다. Bond Domain은 READ-ONLY audit + Decision Gate만 수행했고 **production code는 변경하지 않았다** — BOND-DEF-01~05의 PM 최종 결정은 §9-3 참고. V1.3 종료가 Bond 구현 착수 승인을 의미하지 않으며, 다음 단계는 PM이 별도로 결정한다.
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
- V1.2-B BL-17 — **RESOLVED / v224 RELEASE PASS**(최초 기능 릴리즈 v223, `da1948e`) — categorySource localStorage persistence hotfix 및 Cloud merge category/categorySource pair 보호 정책 포함
- V1.2-B BL-18 — **RESOLVED / v225 RELEASE PASS**(`18c0295`) — Cloud merge 후 `syncAssetsFromTransactions({auto:true})` 재동기화로 ledger asset position을 merged transaction 기준과 일치시킴
- V1.2-B closeout — BL-17/BL-18 모두 RESOLVED. BL-19는 그 closeout에 포함되지 않았고, 이후 V1.3에서 RESOLVED 처리되었다(아래).
- V1.3 BL-19 — **RESOLVED / v226 RELEASE PASS** — correction-path 안내 강화(Option 1 TEXT-ONLY): 현재 자산값 vs 거래내역 기준값 대조 표시 + 확인 경로 문장 안내, `assessPositionConsistency()` 무변경, `#assetDetailPositionNotice` 내부 button/link = 0 정책 유지
- V1.3 P1-1 — **RESOLVED / v226 RELEASE PASS** — 종합 위험점수 범위 고지: 메인 RISK 카드는 기존 `#riskScopeNote`로 이미 충족되어 있었고, 누락 지점이던 `riskAlertModal`에만 동일 고지 추가. Risk 계산/산식/Universe 무변경
- V1.3 Bond Domain Audit — **READ-ONLY 완료 / 코드 변경 0건** — 신규 P0/P1 구현 버그 없음. 정의 backlog(BOND-DEF-01~05)를 §9-2에 기록하고 구현은 보류(정책 결정 선행 필요)
- V1.3 Bond Definition Decision Gate — **완료 / 코드 변경 0건** — BOND-DEF-01~05 각각 backlog 유지 또는 현행 유지로 PM 최종 결정(§9-3). BOND-DEF-02는 소규모 UX 개선 후보로만 유지하며 P1로 승격하지 않는다
- **V1.3 — CLOSED** — BL-19(v226) + P1-1(v226) 릴리즈 완료, Bond는 추가 구현 없이 종료
- Bond domain — BACKLOG / 별도 Phase (§9-1 audit 결과 · §9-2 정의 backlog 참고)
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
