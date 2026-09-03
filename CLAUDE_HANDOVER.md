# CLAUDE_HANDOVER.md — 세션 간 인계장

이 파일은 회사 PC ↔ 개인 PC를 오가며 이 프로젝트를 개발할 때, 서로 이어지지 않는 대화 세션 사이의
유일한 연결고리다. **새 세션을 시작하면 가장 먼저 이 파일을 읽고**, 세션을 마칠 때(또는 유의미한
작업이 끝날 때) 이 파일을 최신 상태로 갱신한다 — 자세한 규칙은 `CLAUDE.md`의 "인계장 워크플로우"
섹션 참고.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 두 번째 세션) — 커밋 시 버전 v190

**커밋**: `4aa07d9` (코드) — 인계장 커밋은 이 파일 갱신 직후 별도로 이어짐. 버전은 v189 → **v190**.

### 배경
직전 세션(v189, 아래 "커밋 시 버전 v189" 섹션 참고)에서 티커별 역할(포지션) 단일 소스
(`state.tickerRoles`)를 도입했지만, 사용자가 실사용 중 "이미 다른 화면에서 지정한 역할이 팝업을 열
때 자동으로 안 보인다"고 보완 요청을 줬다. Plan Mode로 직접 코드를 재조사해 원인을 특정한 뒤(직전
세션에 내가 직접 작성한 코드라 Explore 에이전트 없이 직접 읽어 확인), 승인받고 구현했다.

### 완료 + 실측 검증된 작업 (`index.html`, `js/04-rebalancing.js`, `js/05-future-projection.js`, `sw.js`)

1. **역할(포지션) 자동 연동 버그 수정 — 근본 원인**: `state.rebalance[owner].targets[]`,
   `taxAdvantagedPlan.allocationByOwner[]`, `monthlyContributionByOwner[owner].allocation[]`의
   개별 항목 `role`은 **그 팝업에서 직접 건드린 적이 있을 때만** 채워져 있었다 - 자산관리/거래내역
   에서만 지정했거나 `DEFAULT_REBALANCE_TARGETS`처럼 애초에 role이 없는 기본값이면, 각 팝업 렌더
   함수가 로컬 `role`만 읽고 `getTickerRole()` 레지스트리로 폴백하지 않아 "포지션 미지정"으로 보였다.
   - `cloneRebalanceTargetList`(js/04) - 목표비중 모달 draft 시딩/커밋 양쪽에 재사용되는 이 함수
     한 곳에 `role: t.role || getTickerRole(t.ticker)` 폴백을 넣어 `renderRtmTargetGroup`/
     `renderStockAllocationSelectedList`(종목선택 팝업) 둘 다 자동으로 해결.
   - `expandRebalanceTargetsForComputation`(js/04) - "포지션별 목표비중 분석" 카드/드릴다운 팝업이
     쓰는 펼침 함수에도 동일 폴백 - 모달을 한 번도 안 연 티커도 카드 집계에 정확히 반영되게 함.
   - `roleFor()`(js/05, 절세계좈 적립설정 팝업) - 배분 항목이 아직 없는 보유 종목도 레지스트리로 폴백.
   - `openMonthlyContributionAllocationModal()`의 draft 시딩(js/05, 적립금 설정 팝업) - 동일 패턴.
   - 신규 종목 추가 시 role이 안 채워지던 누락 1곳도 함께 고침(적립금 설정 팝업의 검색-추가 플로우,
     다른 3개 추가 플로우는 이미 정상이었음).

2. **부수 버그 - 레지스트리 삭제 부작용 제거**: `syncTickerRolesFromRebalanceTargets`(목표비중 모달
   [확인])와 적립금 설정 모달 [저장]이 role이 비어있는 항목까지 `setTickerRole(ticker, undefined)`로
   무조건 덮어써, 이미 다른 화면에 등록된 역할을 조용히 지우고 있었다. 위 1번 폴백 수정 덕분에 커밋
   시점엔 로컬 role이 항상 먼저 채워져 있어 이 부작용이 자연히 사라짐(적립금 설정 모달 저장 시
   레지스트리로 역방향 동기화하는 루프도 새로 추가 - 예전엔 아예 없었음).

3. **절세계좈 적립설정 팝업 - 종목별 삭제 버튼 추가**: 계좈 카드의 각 종목 행에 휴지통 아이콘 버튼을
   추가했다. 보유 종목은 배분 항목만 지워져 pct 0으로 돌아가고(행 자체는 실제 보유라 남음), 미보유
   (`planned`) 종목은 배분 항목이 곧 행의 존재 근거라 삭제 시 행 자체가 사라진다.

4. **목표비중 모달 "목표금액" 줄바꿈 방지**: `updateRtmPreviews()`의 국내/해외 split 미리보기(2열
   그리드 안)와 목표 항목별 미리보기 두 곳에 `whitespace-nowrap` 추가 - 375px 모바일 실측 확인.

5. **팝업 세로 길이 압축**: 목표비중/종목선택/절세계좈/적립금설정 4개 모달의 바깥 `space-y`와 카드
   `mb-*`/`p-*`를 한 단계씩 줄이고, `assetDetailModal`의 섹션 구분 여백(`my-6 pt-6` - 코드베이스 내
   최대 여백이었음)을 `my-4 pt-4`로 줄였다. 터치 영역(버튼 크기/인풋 패딩)은 그대로 유지.

### 검증 방법 (참고용)
브라우저 콘솔에서 `setTickerRole('0052D0.KS', 'core')`로 레지스트리에 직접 값을 넣은 뒤, 세 팝업을
차례로 열어 role select가 자동으로 "코어자산"으로 선택되는지, 목표비중 모달을 커밋한 뒤에도
`getTickerRole()` 값이 유지되는지, 절세계좈 팝업에서 종목 삭제 버튼이 `allocationByOwner`에서
항목을 정확히 splice하는지 직접 확인했다(실제 API 연동 없이 로컬 state 조작만으로 충분히 검증 가능한
로직이라 이 방식을 씀).

### 다음 세션에서 할 일
- 없음(이번 요청 범위는 모두 완료·검증됨).
- `git pull` 먼저 해서 이 커밋(v190)을 받았는지 확인.
- **버전 예산(runway)은 계속 추적/언급하지 않는다** - 이전 섹션 끝에 남아있던 "v190 한 번 남음" 안내는
  2026-09-03에 이미 철회된 지침과 모순되는 stale 문구였어서 이번에 함께 정리함(아래 v189 섹션의
  "다음 세션에서 할 일" 참고).

---

## 최근 세션 요약 (2026-09-03, 개인 PC) — 커밋 시 버전 v189

**버전 관례**: 커밋마다 `index.html`의 `#appVersionLabel`과 `sw.js`의 `CACHE_NAME`을 함께 1씩 올린다
(서비스워커 캐시 무효화 트리거 겸용). `sw.js`의 `CACHE_NAME` 옆 주석에 그 버전에서 뭐가 바뀌었는지
한 줄 요약을 남기는 게 관례. 이번 세션 변경분은 v188 → **v189**로 이미 반영해 둠(회사 PC 세션이
남긴 v188을 이어받아 작업).

**[정정] 버전 예산 알림 철회**: 이전 버전에서 "v190에서 개발을 마무리할 계획이니 남은 여유가 얼마
안 된다"고 적었으나, 사용자가 이후(2026-09-03) "v190은 넘어갈 것 같으니 여유 카운트를 하지 말라"고
정정했다 - **앞으로 어떤 세션도 버전 여유(runway)를 계산하거나 언급하지 말 것.**

**[신규 규칙] 인계장 워크플로우 변경**: `CLAUDE.md`의 "인계장 워크플로우" 섹션이 이번에 갱신됐다
(커밋 `b23d38d`) - 이제 코드 커밋을 승인받으면 (a) 코드부터 먼저 커밋+push, (b) 그 직후 별도 승인
없이 이 `CLAUDE_HANDOVER.md`를 갱신해 **별도의 두 번째 커밋으로** push, (c) 그 다음에 사용자에게
보고하는 순서를 모든 PC/세션이 공통으로 따른다. (이전에는 인계장을 코드와 같은 커밋에 한 번에
묶어 넣었었다 - 이제는 그렇게 하지 않는다.)

### 배경
- 이 세션을 시작할 때 로컬이 origin보다 1커밋 뒤처져 있었다(회사 PC가 먼저 v188을 커밋·푸시함) -
  `git pull --ff-only`로 먼저 받은 뒤 작업을 시작했다. **다음 세션도 반드시 `git pull` 먼저 할 것.**
- 사용자가 "포트폴리오 구성 탭 개편 + 미래예측 탭 개선 + 공통 UX 정비"라는 큰 요청을 줬고, Plan Mode로
  먼저 계획을 세워 승인받은 뒤 구현했다(계획 파일: 세션 로컬 `.claude/plans/ancient-greeting-kitten.md`,
  다른 PC에서는 안 보임 - 이 문서가 유일한 인계 수단).

### 이번 세션에서 완료 + 실측 검증된 작업

1. **"포트폴리오 구성" 탭 — 읽기전용 3카드 그리드 완전 삭제** (`index.html`, `js/04-rebalancing.js`)
   - 신랑/와이프 각각의 "국내/해외 목표 비중"+"국내 세부"+"해외 세부" 3카드 그리드(아코디언으로 접혀
     있던 것)를 통째로 삭제했다 - 실제 편집은 어차피 모달 안에서만 가능해 읽기 전용 요약이었을 뿐이다.
   - 대신 `<h3>👤 신랑 목표 비중</h3>` 타이틀 바로 옆에 기존 [비중조절] 버튼을 재배치했다(로직 무변경,
     `openRebalanceTargetModal(owner)` 그대로).
   - `buildDomesticTargetInputs`/`buildTargetInputs`/`updateTargetSum`/`rebalanceAmountPreviewHtml`/
     아코디언 메커니즘(`ownerTargetAccordionOpen` 등)을 전부 제거했다 - 죽은 코드 없음, 전부 이 삭제로
     인해 실제로 불필요해진 것들.

2. **"포지션별 목표비중 분석" 카드 — 국내/해외 축 추가 + 7개 클릭 탭 + 3개 인스턴스**
   (`js/04-rebalancing.js`)
   - 신규 계산 함수 `computeOwnerTargetRegionWeights`/`computeTargetRegionBreakdown` - role과 동일한
     가중 기준(owner의 실제 리밸런싱 대상 총액 비중)으로 국내/해외 축을 계산한다.
   - `renderPositionAnalysisCard(containerId, ownerFilter)` - 국내/해외 2개 + 공격수/미드필더/수비수/
     코어자산/미지정 5개, 총 7개 막대 행이 전부 클릭 가능한 버튼(`data-position-tab`)이다. 클릭하면
     `openPositionDrilldownModal(kind, key, ownerFilter)`가 기존 `positionRoleBreakdownModal`을
     재사용해 그 항목의 실제 구성 종목(티커/유효비중%)을 팝업으로 보여준다(`buildPositionDrilldownRows`
     - household 합산일 때는 owner별 리밸런싱 대상 총액 비중으로 다시 가중해 카드에 표시된 %와 정확히
     맞춘다, 실측 검증 완료).
   - 3개 인스턴스: 가구 합산("⚽ 전체 포지션별 목표비중 분석", 옛 [신랑 비중]/[와이프 비중] 팝업 버튼은
     삭제 - 이제 아래 2개가 상시 노출이라 중복), 신랑 카드(타이틀 바로 아래), 와이프 카드(동일).

3. **`rebalanceTargetModal` 종목 추가 UI — "수익률 관리" 팝업 패턴으로 통일**
   (`index.html`, `js/04-rebalancing.js`)
   - `rtmAddSearchInputDomestic`/`Foreign`(예전: 상시 노출 인풋)을 `scenarioRateAddNewBtn`과 동일한
     [+ 종목 추가] 토글 버튼 → 검색폼 펼침 방식으로 바꿨다(`rtmAddToggleBtnDomestic`/`Foreign`,
     `rtmAddFormDomestic`/`Foreign`).

4. **티커별 역할(포지션) 단일 소스 — `state.tickerRoles` 레지스트리 신설**
   (`js/01-core-state.js` 핵심, 5개 파일에 걸쳐 배선)
   - 예전엔 role이 `state.assets[].role`, 리밸런싱 목표(`targets[].role`/`selectedStocks[].role`),
     월적립금 배분(`monthlyContributionByOwner[].allocation[].role`) 세 곳에 완전히 독립적으로
     저장되어 서로 동기화되지 않았다(조사로 확인, 의도적 설계가 아니라 진짜 사각지대였음).
   - `getTickerRole(ticker)`/`setTickerRole(ticker, role)`(js/01, `sanitizeTicker().yahooTicker`로
     정규화한 키 사용) 하나가 이제 단일 소스다. **쓰기**: 자산 폼(js/07)·거래 폼(js/06)·rtm role
     select·stockAllocation role select(js/04, 모달 [확인] 커밋 시점에만 반영 - draft 취소 시
     레지스트리 오염 안 되게)·월적립금 role select(js/05)·절세계좈 배분 role select(js/05, 신규).
     **읽기(자동연동)**: 모든 "종목 추가" 플로우가 새 티커를 만들 때 `getTickerRole()`로 미리 채우고,
     `makeAsset()`도 `raw.role`이 없으면 레지스트리에서 폴백한다(이미 목표비중에 태깅해 둔 종목을
     나중에 실제로 사면 role이 자동으로 딸려온다 - 왕복 실측 검증 완료).
   - 1회성 마이그레이션(`seedTickerRolesFromLegacyStorageOnce`, loadState 안)이 기존 4곳에 흩어져
     있던 role 값으로 레지스트리를 최초 1회 시드한다(자산 role 우선). 가족 동기화/JSON 백업에도
     `tickerRoles` 필드를 추가했다(buildSyncBlob/applyRemoteState/mergeAssetsAndTransactionsWithRemote/
     pullFromCloud fullAdopt 4곳 모두 배선).
   - **주의**: 포지션별 비중 분석 카드의 계산 기준(목표비중 기반, 실제 보유 무관 - v188에서 이미
     확정된 설계)은 이번에 안 건드렸다. 이번 변경은 "role 값이 어디서 시작되고 동기화되는가"만
     다룬다.

5. **절세계좈 [적립설정] 팝업 — 계좈별 미보유 종목 추가 + 역할 선택**
   (`js/05-future-projection.js`)
   - `renderTaxAdvantagedAllocationEditor`가 그리는 계좈 카드마다 [+ 종목 추가] 버튼/폼을 추가했다
     (searchStockCandidates 재사용, 범위 제한 없음). 선택하면 `allocationByOwner[owner]`에
     `{accountType, ticker, label, pct:0, role: getTickerRole(ticker)}`로 push하고 카드를 다시
     그린다 - 그 계좈이 실제 보유하지 않은 종목도 "(미보유)" 배지와 함께 행으로 뜬다.
   - 모든 배분 행(보유+미보유)에 role select를 추가했다. `normalizeTaxAdvantagedAllocationList`(js/01)
     에 `role` 필드 보존을 추가했다(예전엔 없었음).
   - **범위 제한(의도적)**: 이미 렌더링된 계좈 카드에만 종목 추가 가능 - 그 owner가 아직 하나도
     보유하지 않은 새 계좈종류(예: 아직 IRP가 없는데 IRP 카드를 미리 만드는 것)는 이번 범위 밖.

6. **미래예측 탭 명칭 변경 + 소유자별 적립금 분리 재검증** (`index.html`)
   - "💰 포트폴리오 기준" → "💰 일반계좌 설정", [월적립금 설정] 버튼/모달 타이틀 → "적립금 설정".
   - 소유자별 월적립금이 시뮬레이션에서 실제로 분리 반영되는지 브라우저에서 직접 검증: 신랑/와이프의
     국내/해외 목표를 일부러 다르게(100%/0% vs 0%/100%) 만든 뒤 같은 금액을 각자에게 몰아 넣고
     `simulateRebalancedPreset` 10년차 결과가 서로 다르게 나오는 것까지 확인(코드는 이미 정상이라
     변경 없음, `getOwnerMonthlyContributionInputs`→owner별 독립 `ownerCalcs`→합산은 결과값에서만).

7. **공통 UX 정비**
   - `autocomplete="off"`를 종목 검색/이름/키워드 텍스트 인풋 전반(정적+JS 템플릿, 약 13곳)에
     추가했다 - 브라우저 비밀번호 관리자 팝업 차단. 숫자(비중/금액/기간) 인풋은 낮은 위험으로 판단해
     범위에서 제외했다(전수 조사는 했으나 의도적으로 스킵).
   - `kpiDailyProfitCard`(일간금융평가손익) 헤더가 형제 카드(`kpiTotalProfit`)와 달리 모바일 좁은
     화면에서 줄바꿈되던 문제를 `truncate`/`shrink-0`/`min-w-0` 클래스 보강으로 고쳤다(375px 실측
     확인).
   - 설명 문구 재검토: `positionScopeNote`(새 7탭 카드에 맞게 재작성), `monteCarloDesc`(다른 세션이
     쓴 "1,000회"가 실제 코드의 `MONTE_CARLO_ITERATIONS=10000`/새 P10=보수·P90=낙관 라벨과 어긋나
     있던 것을 발견해 함께 고침 - `js/03-filters-charts-tabs.js`의 `updateRealEstateGuidanceText()`
     안, 부동산 유무 조건부 텍스트 두 벌 다 수정). 삭제된 카드에 연결돼 있던
     `domesticTargetHelpIconHusband/Wife`/`domesticCaptionHusband/Wife` 텍스트 토글 코드도 함께 정리.

### 알아둘 점 / 알려진 한계
- `openPositionDrilldownModal`의 household(`'all'`) 합산 모드는 owner별 실제 리밸런싱 대상 총액
  비중으로 재가중한다 - 원금이 0인 owner(예: 아직 일반계좌 자산이 하나도 없는 경우)는 자동으로
  제외된다(`computePositionRoleBreakdown`/`computeTargetRegionBreakdown`과 동일한 기존 규칙).
- 절세계좈 종목 추가는 계좈 카드가 이미 있어야만 가능하다(위 5번 범위 제한 참고) - 사용자가 "아직
  없는 계좈 종류도 미리 만들고 싶다"고 하면 그건 이번 범위를 벗어나는 별도 작업.
- `state.tickerRoles` 마이그레이션은 1회성 플래그(`sam_ticker_roles_seeded_v1`)로 막혀 있다 - 이미
  실행된 기기에서는 다시 안 돈다(의도적 - 나중에 사용자가 role을 지워도 안 되살아나게).

### 다음 세션에서 할 일
- (2026-09-03 갱신: 아래 항목은 stale - 실제로는 v190에서도 개발이 계속됐다. **버전 예산/runway는
  추적하지 않는다** - 위 v190 섹션 참고.)
- ~~없음(이번 요청 범위는 모두 완료·검증됨) - 단, 버전 예산(v190 한 번 남음)을 항상 먼저 확인할 것.~~
- `git pull` 먼저 해서 최신 커밋을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.
