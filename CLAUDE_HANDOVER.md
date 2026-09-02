# CLAUDE_HANDOVER.md — 세션 간 인계장

이 파일은 회사 PC ↔ 개인 PC를 오가며 이 프로젝트를 개발할 때, 서로 이어지지 않는 대화 세션 사이의
유일한 연결고리다. **새 세션을 시작하면 가장 먼저 이 파일을 읽고**, 세션을 마칠 때(또는 유의미한
작업이 끝날 때) 이 파일을 최신 상태로 갱신한다 — 자세한 규칙은 `CLAUDE.md`의 "인계장 워크플로우"
섹션 참고.

---

## 최근 세션 요약 (2026-09-02, 개인 PC) — 커밋 시 버전 v188

**버전 관례**: 커밋마다 `index.html`의 `#appVersionLabel`과 `sw.js`의 `CACHE_NAME`을 함께 1씩 올린다
(서비스워커 캐시 무효화 트리거 겸용). `sw.js`의 `CACHE_NAME` 옆 주석에 그 버전에서 뭐가 바뀌었는지
한 줄 요약을 남기는 게 관례(과거 커밋들 참고). 이번 세션 변경분은 v187 → **v188**로 이미 반영해 둠 —
다음 세션에서 추가 작업 후 커밋하려면 v189부터 시작할 것.

### 배경
- 이 저장소(`key4125-netizen/jasan`, 배포: `25-netizen.github.io`)가 실제 운영 중인 프로젝트임을
  확인하고, 이전에 별도로 진행되던 `asset-manager`(단일 HTML 파일) 작업을 중단, 이 저장소를 메인
  작업 디렉토리로 전환했다.
- 구조: `index.html` + `js/01-core-state.js` ~ `js/14-settings-boot.js` (14개 모듈, `<script>` 태그
  순서대로 로드, 번들러 없음). 서비스워커(sw.js) 사용 — **코드 수정 후 로컬 테스트 전에는 항상
  `navigator.serviceWorker.getRegistrations()`로 unregister + `caches.keys()`로 전체 삭제 후
  강제 새로고침해야 한다.** 안 그러면 캐시된 옛 JS가 조용히 서빙된다.
- 로컬 프리뷰: 루트의 `G:\dragon_클로드\.claude\launch.json`(이 PC 전용, 회사 PC에서는 새로 만들어야
  함)에 `jasan-static`이라는 이름으로 PowerShell 정적 서버(포트 8643)가 등록되어 있다. 저장소 안의
  `.claude/launch.json`은 참고용일 뿐 실제로는 사용되지 않는다(도구가 루트 launch.json만 읽음).

### 이번 세션에서 완료 + 실측 검증된 작업

1. **몬테카를로 시뮬레이션 엔진 — 목표 비중(Targets) 기준으로 근본 재설계** (`js/05-future-projection.js`)
   - 기존에는 μ(기대수익률)·σ(변동성) 모두 "현재 실제 보유 자산" 기준이었다. 이제:
     - **PV(초기 원금)** — 변경 없음. 현재 총 평가금액 그대로 사용 (`computeHouseholdMonteCarloPV`).
     - **μ** — 기존에 있던 `computeTargetWeightedAvgRate('normal')`을 재사용(신규 코드 없음). 이미
       "리밸런싱 후" 시나리오가 쓰던 함수라 '포트폴리오 구성' 탭에서 보는 기대수익률과 항상 일치.
     - **σ** — 신규 함수 `computeTargetPortfolioVolatilityPct()`(비동기). 신랑/와이프 각자의 목표
       비중을 종목(티커)/카테고리 단위로 펼쳐(`computeHouseholdTargetInstrumentWeights` →
       `computeOwnerTargetInstrumentWeights`) 실측 과거 일별 수익률(`getCachedDailyCloses`, js/09와
       캐시 공유)을 목표 비중으로 가중합성한 뒤 연환산 변동성 공식 적용. 카테고리 캐치올(예: "주식"
       미지정분)은 국내/해외 대표지수로 대체, 채권/현금 목표는 변동성 0으로 근사.
   - `renderMonteCarloSection()`을 `async`로 전환 + `monteCarloRequestToken` 경쟁상태 가드 추가.
     `state.advancedRiskMetrics` 준비 여부 게이트는 제거(더 이상 그 값에 의존하지 않음), `pv <= 0`
     예외 처리 추가.
   - 반복 횟수 `MONTE_CARLO_ITERATIONS`를 1,000 → 10,000으로 늘리고, `createSeededRandom(seed)`
     (mulberry32 PRNG) + 고정 시드 `MONTE_CARLO_SEED = 20260101`로 매 호출마다 새 RNG 인스턴스를
     만들어 같은 입력이면 항상 같은 결과가 나오게 함(예전엔 매번 값이 크게 흔들리는 문제가 있었음).
   - **실측 검증 결과**: 테스트 데이터 기준 σ가 기존 63%+ (SK하이닉스 한 종목 89% 쏠림 때문에 왜곡된
     수치)에서 **9.9%**로 정상화, μ는 **8%**. 동일 입력으로 두 번 연속 호출 시 완전히 동일한 결과
     (시드 고정 확인). P10=보수(빨강)/P90=낙관(에메랄드) 라벨·컬러·정렬 모두 정상.
   - `index.html`의 `#monteCarloDesc` 및 표 아래 각주 문구를 새 방식을 설명하도록 갱신.

2. **목표 비중 수정 모달(`rebalanceTargetModal`) — 종목 삭제/검색추가/포지션 지정 기능 신규 구현**
   (`js/04-rebalancing.js`, `index.html`)
   - 기존에는 이 모달에서 종목을 뺄 방법도, 안 갖고 있는(미보유) 종목을 새로 추가할 방법도 없었다.
     이번에 추가:
     - **삭제**: 각 목표 행마다 X 버튼(`data-rtm-delete`) → `removeRtmTarget(region, idx)`가
       draft에서 해당 행 제거. 국내 5개+해외 5개(신랑 기준) 전부 정상 렌더링 확인, 클릭 시 draft만
       바뀌고 [확인] 눌러야 실제 반영, [취소]/배경 클릭 시 원상복구되는 기존 draft-then-commit 패턴
       그대로 따름.
     - **검색+추가**: `rtmAddSearchInputDomestic`/`Foreign` 입력창 → `searchRtmAddCandidates(region,
       query)`(마스터 데이터에서 그 지역 종목 중 이미 목표에 있는 건 제외하고 검색) →
       `renderRtmAddSearchResults`가 후보 버튼 렌더링 → 클릭하면 `{type:'ticker', ticker, label,
       pct:0}`로 draft에 추가(비중은 0%부터 시작, 사용자가 직접 조정). 각 티커 행에는 role
       `<select>`(`data-rtm-role`, attacker/midfielder/defender/core)도 함께 붙어 추가 시점에 바로
       포지션 지정 가능.
   - 새로 추가한 종목(예: 삼성전자)이 비중을 0%→10%로 바꾸는 즉시 `computeIndividualRebalanceGuide`
     결과(종목별 실행 가이드)에 정확한 목표금액으로 반영됨을 확인(별도 반영 지연 없음, "즉시 반영"
     요건 충족).

3. **메인화면 신랑/와이프 목표 비중 카드 — 독립 아코디언 전환** (`js/04-rebalancing.js`, `index.html`)
   - 예전엔 두 카드 세트가 항상 펼쳐진 상태로 화면을 많이 차지했다. `ownerTargetAccordionBtn/Body/
     Chevron` + `Husband`/`Wife` 접미사 id로 각각 독립적으로 접고 펼 수 있게 전환
     (`reapplyOwnerTargetAccordionHeights`, 앱 전반의 `setAccordionOpen` 패턴 재사용). 기본 접힘,
     한쪽을 펴도 다른 쪽 상태에 영향 없음.

4. **포지션별 비중 분석 카드 — 계산 기준을 "실제 보유"에서 "목표 비중"으로 전환**
   (`js/04-rebalancing.js`)
   - 예전엔 `state.assets`의 실제 보유 자산 role 태그로 집계했다 — '포트폴리오 구성' 탭에서 종목에
     포지션을 지정해도 그 종목을 실제 보유한 자산에 똑같이 role을 안 달아주면 반영이 안 되는
     불일치가 있었다. 이제 `computeOwnerTargetRoleWeights(owner)`가 신랑/와이프 각자의 목표 비중 ×
     목표 항목에 지정된 role을 기준으로 집계(`computePositionRoleBreakdown`이 이 함수를 사용하도록
     재작성). 메인 카드는 부부합산(`'all'`), [신랑 비중]/[와이프 비중] 버튼은 모달로 각자 독립 결과를
     보여준다.
   - **소유자 독립성 재검증**: 사용자가 "소유자별로 합산되거나 꼬여 있다"고 보고했으나, 브라우저에서
     직접 `computePositionRoleBreakdown('신랑'|'와이프'|'all')`을 호출하고 실제 모달까지 열어 대조한
     결과 **로컬 코드에서는 문제를 재현하지 못함** — 두 소유자 결과가 완전히 분리되어 나옴.
     `computeIndividualRebalanceGuide('신랑'|'와이프')`도 각자 9종목/8종목으로 명확히 분리 확인.
     **추정: 배포된 사이트(25-netizen.github.io)가 이 세션 이전의 구버전이라 관찰된 문제였을 가능성이
     높음** — 로컬에서는 이미 정상. 다음에 배포 후 실사이트에서 한 번 더 확인 권장.

5. **인계 프로토콜 도입** — `CLAUDE.md`에 "인계장(CLAUDE_HANDOVER.md) 워크플로우" 섹션 추가, 이 파일
   신설. 또한 `CLAUDE.md` 맨 아래 저장소 경로 오기(예전 `D:\클로드\asset-manager` 참조 - 다른
   프로젝트의 흔적)를 `jasan`으로 수정.

### 커밋 상태 — ✅ 이번 커밋(v188)으로 반영 완료
위 1~5의 코드 변경은 사용자 승인을 받아 `index.html`, `js/04-rebalancing.js`,
`js/05-future-projection.js`, `sw.js`, `CLAUDE.md`, `CLAUDE_HANDOVER.md`(신규)를 함께 커밋(및
origin/master로 push)했다. `git log -1`로 커밋 메시지 첫 줄이 "Redesign Monte Carlo around target
weights"로 시작하면 이 세션 작업분이 맞다. 다음 세션(어느 PC든)에서 이어받으면:
- `git pull` 먼저 해서 이 커밋을 받았는지 확인(다른 PC에서 먼저 작업했다면 그쪽 변경도 함께 받아진다).
- 그 다음은 아래 "알아둘 점"과 "다음 세션에서 할 일"만 참고하면 된다.

### 알아둘 점 / 알려진 한계
- σ 계산(`computeTargetPortfolioVolatilityPct`)은 목표에 "종목으로 직접 지정된" 항목만 실측 시세를
  쓰고, 카테고리 캐치올(예: 국내 "주식" 20%를 특정 종목 없이 남겨둔 경우)은 국내/해외 대표지수로
  근사한다 — 실제 편입 종목과 정확히 같지는 않지만 의도된 단순화다.
- 실행 가이드에서 아직 실제로 보유하지 않은 신규 목표 종목은 `qtyDelta`(예상 매수 수량)가 0으로
  나올 수 있다 — 가구 내 어느 계좌에도 해당 티커의 현재가 참조용 자산이 없을 때 발생(버그 아님,
  실거래 전 가격 정보 소스가 없어서). 실사용 시 시세 자동조회가 채워지면 해결될 가능성 높음 — 다음
  세션에서 실제 배포 환경(자동 시세조회 동작)으로 재확인 권장.
- 이 세션은 `python`이 이 환경에서 깨진 Microsoft Store 스텁이라는 것을 확인했다 — 로컬 프리뷰
  서버의 `runtimeExecutable`로 쓰면 안 되고, PowerShell `HttpListener` 스크립트를 대신 쓴다(위 참고).

### 다음 세션에서 할 일
- 없음(이번 요청 범위는 모두 완료·검증됨) — 단, 위 "커밋 상태" 확인이 최우선.
- 커밋/push 후에는 실제 배포 사이트(25-netizen.github.io)에서 포지션별 비중 분석·실행 가이드
  소유자 독립성을 한 번 더 확인해 배포 전 버전 문제였다는 추정을 검증하는 것을 권장.
