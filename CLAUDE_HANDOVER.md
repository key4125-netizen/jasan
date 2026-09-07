# CLAUDE_HANDOVER.md — 세션 간 인계장

이 파일은 회사 PC ↔ 개인 PC를 오가며 이 프로젝트를 개발할 때, 서로 이어지지 않는 대화 세션 사이의
유일한 연결고리다. **새 세션을 시작하면 가장 먼저 이 파일을 읽고**, 세션을 마칠 때(또는 유의미한
작업이 끝날 때) 이 파일을 최신 상태로 갱신한다 — 자세한 규칙은 `CLAUDE.md`의 "인계장 워크플로우"
섹션 참고.

---

## 🔒 Global Readability Policy (Phase 27 확정 — 앞으로 모든 UI 개발의 기본 기준)

**이 정책은 특정 Phase의 산물이 아니라 이 프로젝트의 상시 기준이다. 새 UI를 만들 때 먼저 읽는다.**

1. **Mobile First** — 375px를 최우선으로 판단한다.
2. **Dark Mode First** — 다크 모드에서 먼저 확인한다.
3. **최소 가독성 기준 = 14px.** 「절세계좌 현황」 타이틀의 실측값(`text-sm` = font-size 14px / weight 600 / line-height 20px)을 기준점으로 삼는다. 이 값은 `e2e/32-phase27-readability.spec.js`가 고정하고 있다.
4. **일반 사용자 노출 텍스트는 14px보다 작게 만들지 않는다.** `text-xs`(12px), `text-[10px]`, `text-[11px]`, `text-[9px]`, `text-[13.5px]` 등은 쓰지 않는다.
5. **설명문·보조문구도 14px를 유지한다.** "덜 중요하니까 작게"는 금지다.
6. **중요도는 크기가 아니라 색상·명도·weight로 구분한다.** 예: 핵심 숫자 `font-bold` + 브랜드/손익 색, 보조 라벨 `text-slate-400`(같은 14px, 낮은 대비).
7. **핵심 숫자는 기준보다 크게** 표시한다(`text-lg`/`text-xl` 등).
8. **공간이 부족하면 글자를 줄이지 않는다.** 대신 ① 줄바꿈 허용(`whitespace-nowrap` 제거) ② 컨테이너 폭 확대 ③ 우선순위 낮은 정보 축약/접기 순으로 해결한다. **새 카드·아코디언을 만들어 해결하지 않는다.**
9. **금액은 항상 천 단위 구분자를 쓴다.** 새로 만들지 말고 기존 유틸을 재사용한다 — `fmtKRW`(콤마+원) / `fmtNum` / `fmtSigned` / `fmtKRWShort`(억·만원 축약) / `fmtSignedShort` / 입력창은 `attachThousandsInputFormatting`. 이들은 전부 `Intl.NumberFormat('ko-KR')` 기반이다. **이미 적용된 곳에 중복 포맷을 덧씌우지 않는다.**
10. **연도·개월·iteration·퍼센트·비율·티커·날짜·ID에는 금액 포맷을 적용하지 않는다.**
11. **계산/state 값은 절대 바꾸지 않는다.** 포맷은 표시 계층에서만 한다. 입력창은 화면에 `1,000,000`을 보여주되 `num()`이 콤마를 제거해 state에는 숫자 `1000000`이 들어간다.

**정책 예외(문서화된 것만 허용)**
- 차트 내부 텍스트(Chart.js `font:{size:...}` 설정, canvas/svg 내부) — DOM 텍스트가 아니고 좁은 플롯 영역에 종속된다.
- 개발자용 `console.log` — 사용자에게 보이지 않는다.
- `truncate`가 걸린 컨테이너의 말줄임 자체는 허용하되, **구분에 필요한 단어가 잘리면 안 된다**(예: 시나리오 카드가 "목표배분..."까지만 남아 보수적/일반적/긍정적이 사라진 사례 — 줄바꿈 허용으로 해결했다).

**회귀 장치**: `e2e/32-phase27-readability.spec.js`가 6개 뷰포트(375/390/412/768/1024/1440) × Light/Dark에서 ① 14px 미만 텍스트 0건 ② 콤마 없는 4자리 이상 금액 0건 ③ 가로 overflow 0을 검사한다. 이 테스트를 약화시켜 통과시키지 않는다.

---

## 🔒 상시 정책 — 소유자는 신랑 또는 와이프뿐이다 (V1.1 Phase 1 확정)

**모든 자산·거래는 신랑 또는 와이프 중 한 명이 소유한다. `공동`은 더 이상 유효한 소유자가 아니다.**

**계기**: `공동`은 계산 경로마다 취급이 달랐다. 결정론적 미래예측은 소유자를 가리지 않아 공동 자산을
포함하는데, **Monte Carlo의 자산배분 가중치는 `REBALANCE_OWNERS`(신랑/와이프)만 돌기 때문에 공동
자산의 금액이 basis에서 빠진다.** 실측: 공동 5천만을 더하면 결정론 합계는 2천만 → 7천만이 되는데
**MC basis는 2천만 그대로**. 같은 포트폴리오를 두 엔진이 다르게 본다. 공동을 위한 별도 계산체계를
만드는 대신 **입력 단계에서 막았다.**

### 🔑 막는 곳과 보존하는 곳이 다르다 — 절대 합치지 말 것

| 경로 | 동작 |
|---|---|
| **신규 입력**(자산 폼 · 거래 폼) | **저장 거부 + 다시 입력 요구** |
| **가져오기·복원**(Excel · JSON · Cloud) | **있는 그대로 보존** |

**막아야 할 곳에서 보존하면 정책이 무의미해지고, 보존해야 할 곳에서 막으면 기존 사용자 데이터가
조용히 바뀐다.** `e2e/54` 파일 머리에 이 이유를 남겨 두었다.

### 구현 사양

- **`VALID_ASSET_OWNERS = REBALANCE_OWNERS`** (js/01) — MC/리밸런싱이 도는 소유자와 **같은 배열을
  직접 참조**해 둘이 영원히 어긋날 수 없게 했다. 판정은 `isValidOwner()` 하나뿐.
- **`makeAsset`의 `|| '공동'` 제거** — `공동`이 유효하지 않은 값인데 앱이 스스로 만들어내는 것은
  모순이다. **빈 값은 빈 값으로 남긴다. `'신랑'`으로도 `'공동'`으로도 몰래 채우지 않는다.**
  이미 `'공동'`으로 저장된 값은 그대로 보존된다.
- **자산 폼·거래 폼 제출 시 `isValidOwner` 검증** — select 선택지에서 `공동`을 뺀 것에 더해
  **제출부에서도 검증**한다(select를 우회해 값을 넣어도 막힌다. `e2e/54` A·B가 실제로 주입해 확인).
- **Excel 거래 import(js/06) · JSON/Cloud 복원 3곳(js/12)의 `|| '공동'` 제거** — 보존만 한다.

### ⛔ 기존 공동 데이터는 자동으로 바꾸지 않는다

계좌·거래내역·금액·티커·**role** 어느 것으로도 소유자를 추정하지 않는다 — **누구 것인지는 사용자만
안다.** 50:50 분할·자동 이관·삭제 전부 금지. **Owner와 Role은 다른 개념이며 role을 owner 판단에
쓰지 않는다.**

**식별 방법**: 이미 있던 자산 상세 안내 영역(`#assetDetailPositionNotice`, Phase 50)을 **재사용**해
알린다. 새 카드/탭/화면을 만들지 않았다.

> ⚠ 소유자가 지정되지 않았습니다. 신랑 또는 와이프로 지정해 주세요.
> **지정 전에는 미래 예측과 몬테카를로가 이 자산을 다르게 계산합니다.**

"무엇이 문제인지"까지 말하고, **자동 지정 버튼은 두지 않았다.** 375px 다크 실측: 14px / amber-400 /
가로스크롤 없음 / 버튼 0개 / `⚠` 기호로도 구분.

### 계산 불변

**Projection/Monte Carlo 엔진은 한 줄도 건드리지 않았다.** 신랑/와이프 자산의 자산수·소유자별
평가액·소유자별 수량·적용 Return Key·수익률·결정론 집계·**MC 입력**(`assetOrder`/`weight`/`muAnnual`/
`sigmaAnnual`)이 전부 불변임을 `e2e/54` F가 고정한다.

> **정직하게 남긴다**: 기존 공동 자산이 있으면 **결정론과 MC의 차이는 그대로 남아 있다.** 이번
> Phase는 그 차이를 없앤 것이 아니라 신규 데이터에서 생기지 않게 막고 기존 데이터에 알리는 것까지다.

### 🔴 N-7 (미해결 — 다음 단계에서 read-only audit 후 결정)

**거래내역이 연결된 공동 자산은 현재 자산 수정 경로가 막혀 있으며, 거래 폼에서 owner를 변경할 경우
자산 분열 가능성이 있다.**

`isTransactionTracked(a)`가 자산 상세의 [수정]/[삭제] 버튼을 숨기기 때문에(거래내역이 잔고의 근거라
직접 못 고치게 하는 기존 방어), **경고는 보이는데 고칠 경로가 막힌 조합이 존재한다.** 거래 폼에서
소유자를 바꾸면 `syncAssetsFromTransactions`의 매칭 키가 달라져 다음 부팅에 자산이 둘로 갈라진다
(Phase 52 E에서 실측: 총액 2배). **Phase 1에서 해결하지 않았고, 임의로 손대지 말 것** — 다음 단계에서
코드 경로를 먼저 read-only로 감사한 뒤 최소 수정안을 정한다.

### 테스트

`npm test` **205/205** · `eslint` **0** · `e2e/54` **10/10** · 전체 e2e **520/520** ·
Data Guard **PASS** · **Production Worker/외부 API 0건**.

---

## 🔒 상시 정책 — 실제 사용자 데이터는 저장소에 넣지 않는다 (2026-09-07 확정)

**계기**: 2026-07-28, 실제 자산 데이터가 담긴 엑셀 파일 하나가 이 저장소에 커밋되어 GitHub Pages로
**약 1시간 22분 공개 배포**됐다(추가 `1e53256` → 삭제 `9081b52`). 계좌번호나 API 키가 아니라
**"무엇을 얼마나 들고 있는가"** 였고, 그건 자격증명과 달리 **회전할 수도 무를 수도 없는 정보**다.

### 저장소에 넣지 않는다
실제 자산 수량 · 매수단가 · 현재가 · 거래내역 · 자산 평가금액 · 계좌별 보유내역 ·
사용자 Excel/CSV/JSON 백업 파일.

### 저장소에 넣어도 되는 것
앱 소스코드 · **가상 데이터로 만든** fixture · 비개인적 ticker master · 설정/문서.

### 테스트 데이터 원칙
**실제 사용자 데이터를 복사해 fixture로 쓰지 않는다.** 가상 티커·가상 금액·가상 소유자·가상 계좌로
새로 만든다. 지금의 e2e는 전부 이 원칙을 따르고 있고, 엑셀이 필요한 테스트는 저장소가 아니라
`os.tmpdir()`에 임시 파일을 만든다.

### 두 개의 Guard는 목적이 다르므로 합치지 않는다

| | Release Guard | **Data Guard** |
|---|---|---|
| 스크립트 | `scripts/verify-sw-release.js` | **`scripts/verify-no-user-data.js`** |
| 실행 | `npm run release-guard` | **`npm run data-guard`** |
| 시점 | 릴리스 직전 | **커밋 직전** |
| FAIL의 뜻 | "버전을 올려라" | **"이 커밋을 하지 마라"** |

**합치면 안 되는 이유**: Release Guard는 개발 중 **정상적으로 FAIL한다**(APP_SHELL을 고치고 아직
버전을 안 올린 상태 — Phase 53에서 실제로 그랬다). 거기에 데이터 유출 경고를 섞으면 "어차피 빨간색"이
되어 무시당한다. **무시당하는 경고는 방지 장치가 아니다.**

**Data Guard가 보는 것**: 파일명과 확장자뿐이다. **파일을 열지 않고, 내용을 분석하지 않고, 값을
출력하지 않는다.** DLP를 만드는 것이 목적이 아니라 "실수로 커밋하는 것"만 막는 것이 목적이다.
차단: `.xlsx` `.xls` `.csv` `.zip` + 파일명 `자산관리*` `거래내역*` `포트폴리오구성_*` `*백업*` `*backup*`.
허용 예외: `package.json` `package-lock.json` `manifest.json` `data/ticker-master.json`.

> ⚠️ **`*.json`을 통째로 막지 않는다.** 막으면 `package.json`·`manifest.json`·`data/ticker-master.json`이
> 함께 막혀 개발이 멈춘다. 그래서 JSON 백업은 확장자가 아니라 **파일명 패턴**으로 잡는다.

> 💡 **`git ls-files`는 기본 설정에서 한글 경로를 8진 이스케이프로 감싸서 준다.** 그대로 받으면
> 확장자가 `.xlsx"`가 되어 검사를 통과해 버린다 — **이번 사고 파일이 정확히 한글 이름이었으므로
> 가장 중요한 경로에서만 조용히 뚫리는 형태다.** Data Guard는 `-z`(NUL 구분)로 읽는다.
> `test/data-guard.test.js`가 이 구멍을 실제로 잡아냈다.

### ⚠️ 과거 히스토리에 대한 정직한 기록

**현재 HEAD·작업트리·GitHub Pages 어디에도 그 파일은 없다**(Pages 실측 404, 2026-07-29 `9081b52`로 삭제됨).
**그러나 과거 커밋의 객체는 그대로 남아 있고, 이 저장소는 PUBLIC이다.**
history rewrite는 **PM이 의도적으로 하지 않기로 결정**했다 — 프로젝트 히스토리 보존, Phase별 인계장
커밋 참조 보존, 두 PC clone의 재오염 위험, 이미 공개된 데이터를 완전히 회수할 수 있다는 보장이 없기
때문이다. **"히스토리에서 완전히 제거했다"거나 "과거 노출을 회수했다"고 말하지 않는다.**

---

## 🔒 PM 확정 정책 — Hybrid Source of Truth (Phase 48 기준선)

**이 정책은 특정 Phase의 산물이 아니라 이 프로젝트의 상시 기준이다. 데이터 구조를 건드리기 전에 먼저 읽는다.**

| 데이터 | Source of Truth |
|---|---|
| ticker · name · owner · accountType · currency · isDomestic | **assets** |
| quantity · buyPrice · buyRate | **transactions** — 단 **거래가 없는 수동 자산은 assets** |
| KRW Cash 수량 | **assets** |
| USD Cash 수량 | **transactions** |
| currentPrice | ticker 有 → **외부 시장데이터 캐시** / ticker 無 → **사용자 입력값** |
| role · rateMatchOverride | **사용자 설정** |
| Projection / MC / Risk | **파생 계산 결과** |
| Cloud | SoT 아님 — **동기화/보존 저장소** |
| Excel | SoT 아님 — **사용자 입력/이동/백업 수단** |
| JSON | **전체 상태 백업/복원 수단** |

**구현 원칙**
1. `"transactions가 항상 SoT"`로 바꾸지 않는다. `"assets가 항상 SoT"`로도 바꾸지 않는다.
   현재 Hybrid를 **먼저 명시적으로 안전하게 만드는** 방향이다.
2. **부동산·현금·최초등록 자산을 거래내역이 없다는 이유만으로 삭제하거나 수량을 0으로 만들지 않는다.**
3. **자동 데이터 정리/삭제는 금지한다.**
4. 한 번에 하나의 데이터 정합성 문제만 해결한다.

**5. positionSource와 `isTransactionTracked(a)`는 같은 뜻이 아니다(Phase 49에서 PM 확정).**
   - `positionSource='ledger'` = **이 자산의 position 관리 원천이 거래원장이라는 "저장된 사실"**
   - `positionSource='manual'` = 그 원천이 자산 마스터라는 "저장된 사실"
   - `isTransactionTracked(a)=true` = **지금 이 순간 매칭되는 거래가 존재한다는 "현재 상태"**

   `isTransactionTracked()`를 positionSource의 **영구 대체값으로 취급하지 않는다.**
   legacy 자산은 ① 저장된 positionSource가 있으면 그것을 우선 ② 없으면 현재 거래 존재 여부를
   *참고*만 함 ③ 거래 존재 여부만으로 source를 **영구 저장(migration)하지 않음**
   ④ 불명확하면 기존 데이터를 보존한다.

---

## 🎉 최근 세션 요약 (2026-09-07) — Phase 54: **V1.0 FINAL RELEASE — v214 → v215**

**커밋** `ac6ffea` "release: bump service worker cache to v215" — push 완료.

**V1.0은 여기서 종료되었다.** 이후 발견되는 개선사항은 **V1.1 backlog**로 분리한다(아래 목록 참고).

### 무엇이 사용자에게 전달되었나

Phase 52 감사가 확정한 **V1.0 blocker 3건**(엑셀 `category` 미복원 · `buyRate` 미복원 · `id` 재발급)의
수정이 v215로 전달된다. Phase 53에서 고쳤지만 CACHE_NAME이 v214에 머물러 있어 아직 닿지 않던 상태였고,
**Phase 51의 Release Guard가 이번에는 그 상태를 스스로 잡아냈다**(bump 전 FAIL, `js/01-core-state.js`와
`js/12-import-export-sync.js`를 정확히 지목 → bump 후 PASS).

### v214 → v215 캐시 갱신 실측

**"캐시를 지우면 된다"로 끝내지 않았다.** 진짜 v214 릴리스 파일(`6de5a68`)로 캐시를 만든 뒤,
**캐시를 그대로 둔 채** v215를 배포하고 앱을 다시 여는 것만으로 확인했다.

| 검증 | 결과 |
|---|---|
| v214 캐시 사전 존재 | ✅ `smart-asset-manager-v214` · 화면 v214 · Phase 53 함수 전부 `undefined` · **엑셀 17열** |
| v215 배포 후 재접속 | ✅ SW update → activate |
| **v214 캐시 제거** | ✅ |
| **v215 캐시 존재** | ✅ (캐시 안의 `js/01`에 Phase 53 코드 포함 확인) |
| active SW = v215 | ✅ 화면 v215 |
| **Phase 53 기능 실제 제공** | ✅ **엑셀 19열**(`취득환율(매수시점)` · `id` 추가) · 왕복 후 category(부동산·원자재)·buyRate(1,200)·id·평가손익 **전부 보존** |
| 첫 방문자 | ✅ v215 수신 |
| **Production Worker 요청** | ✅ **0건** — 외부 시도 728건 전부 `ERR_NAME_NOT_RESOLVED`(성공 0) |

### 최종 테스트

`npm test` **193/193** · `eslint` **0** · 전체 e2e **510/510** · `e2e/49` **4/4** ·
Release Guard **PASS(v215)**.

### 📌 V1.1 backlog (V1.0에 넣지 않기로 PM이 확정한 것들 — 임의 착수 금지)

| 항목 | 상태 |
|---|---|
| **legacy positionSource 확정 UX** | 앱이 추정하지 않고 사용자가 상세 모달에서 한 번 선택. 선택 전에는 기존 동작 유지 |
| **0원 자산 엑셀 export 제외** | 🟡 NON-BLOCKER. 최소 수정안은 필터를 `curAmount === 0 && quantity === 0`으로 좁히는 것 |
| **Return Key 수정 UI** | 확인은 상세 모달(47-F), 수정은 거래 모달 `tx_rateMatchOverride` + 엑셀 칸 두 경로 존재 |
| **buyRate JSON validation 통일** | 엑셀은 `sanitizeBuyRate`, JSON은 `typeof === 'number'`. 실제로 갈라지지 않지만 통일이 안전 |
| **엑셀 덮어쓰기가 positionSource를 지움** | id가 보존되므로 이제 컬럼 없이 이어받는 방법이 생겼으나 새 규칙이라 미승인 |
| **identity 이동 semantics** | ticker/owner/계좌 변경 시 자산 분열. UI는 이미 막혀 있음(거래내역 있는 자산은 [수정]/[삭제] 숨김) |
| **Excel P1** | import의 `category` 재계산은 해결됐고 `updatedAt` 재발급은 의도된 동작. 나머지는 미결 |
| **Release Guard CI 자동 실행** | 현재 `npm run release-guard` 수동 실행뿐. 이 저장소에는 lint/test/e2e CI 워크플로 자체가 없다 |
| 보류 | Bond 상세 · Cash 구조 · CORS_PROXIES 6중 호출 · backfill dedupe · Sync 10초 polling · 오프라인 MC Safety BLOCK |

**⚠️ 다음에 APP_SHELL(index.html · js/01~14)을 고치면 릴리스 때 CACHE_NAME과 appVersionLabel을 함께
올려야 한다.** `npm run release-guard`가 잊었을 때 알려준다 — **FAIL을 통과시키려고 버전만 올리지 말고,
정말 릴리스할 준비가 됐는지 먼저 판단할 것.**

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 51~53: Release Guard + 엑셀 복원 경로 정상화 **→ v215로 전달됨**

**커밋** `f222ac0` "ci: add service worker release guard" · `713f460` "fix: restore category,
acquisition fx rate and asset id from excel" — push 완료.

> **⚠️ 지금 상태: `npm run release-guard`는 FAIL이 정상이다.** Phase 53이 APP_SHELL(js/01·js/12)을
> 바꿨는데 PM이 v215 bump를 아직 승인하지 않았다. Guard가 그걸 정확히 감지하고 있는 것이며,
> **통과시키려고 임의로 버전을 올리지 말 것.** 승인이 나면 v214 → v215 bump가 이번 수정을 사용자에게
> 전달하는 마지막 단계다.

### Phase 51 — Release Guard 강화 (`scripts/verify-sw-release.js`)

Phase 50에서 **v213 이후 다섯 Phase가 APP_SHELL을 바꿨는데 CACHE_NAME이 멈춰 있어 아무것도 전달되지
않았던 사건**의 재발 방지. 기존 검사는 두 버전 문자열이 서로 *일치*하는지만 봐서 둘 다 v213으로
멈춘 상태를 통과시켰다.

- **판단은 실제 파일 내용으로 한다.** 지금 CACHE_NAME이 sw.js에 등장하게 된 커밋(git pickaxe `-S`)을
  찾고, 그 이후 APP_SHELL 파일이 바뀌었는지 본다(작업 트리 포함). CACHE_NAME이 이력에 없으면
  "지금 올리는 중"으로 보고 통과.
- **오탐 방지가 이 검사의 수명을 좌우한다.** `.js`는 espree 토큰 스트림 비교(주석은 토큰이 아니라
  자연히 빠지고, 문자열 안의 `//`는 코드로 남는다), `.html`은 script/style 바깥 HTML 주석만 제거.
  espree가 없으면 원본 비교로 **더 많이 잡는 쪽**으로 degrade한다.
- **테스트는 진짜 git 저장소를 만들어 실제 스크립트를 프로세스로 실행한다**(`test/sw-release-guard.test.js`,
  14개). 그러려고 루트만 `SW_RELEASE_GUARD_ROOT`로 주입 가능하게 했다 — 값을 주지 않으면 예전과 동일.
- 실제 이력 검증: `2743c90`(v213 직후) PASS · `23091d7`/`35ff9ff`(변경이 묻혀 있던 시점) **FAIL**,
  파일 목록까지 실제와 일치 · `6de5a68`(v214 직후) PASS.
- **`npm run release-guard`** 로 실행한다. **아직 CI에서 자동으로 돌지 않는다** — 이 저장소에는
  lint/test/e2e를 도는 워크플로 자체가 없다(`update-ticker-master.yml` 하나뿐). `npm test`에 넣지
  않은 이유: APP_SHELL을 고치는 순간부터 릴리스까지 계속 빨갛게 되어 사람이 실패를 무시하게 된다.

### Phase 52 — V1.0 Release Blocker 감사 (제품 코드 0건)

**B·C·D·E는 서로 다른 버그가 아니라 한 뿌리의 4가지 증상**이었다: 엑셀 가져오기가 행마다
`makeAsset()`으로 자산을 **새로 만들어서**, 시트에 있어도 읽지 않는 값은 버리고 없는 값은 다시 추론한다.

| 판정 | 항목 |
|---|---|
| 🔴 **V1.0 BLOCKER** | Excel `category` 미복원 · `buyRate` 미복원 · `id` 재발급 |
| 🟡 NON-BLOCKER | identity split(UI는 이미 막혀 있음 — 거래내역 있는 자산은 [수정]/[삭제] 숨김) · Return Key 수정 UI(확인 가능 + workaround 2개) |
| 🔵 V1.1 | legacy positionSource 확정 UX |

### Phase 53 — 엑셀 복원 경로 정상화 (BLOCKER 3건 해결)

**Excel 자산목록 시트: 17열 → 19열.** 추가는 두 개뿐이고 `자산군(자동분류)`는 이미 있던 칸을 재사용.

| 위치 | 컬럼 | 비고 |
|---|---|---|
| 매수단가 다음 | **`취득환율(매수시점)`** | 외화만 기록, 원화는 빈 칸. 별칭 `취득환율`/`buyRate`도 읽음 |
| 맨 끝 | **`id`** | 사용자가 손댈 값이 아니라 끝에 둠. 별칭 `ID`/`Id` |

**보존 정책 (js/01의 `sanitizeAssetCategory` / `sanitizeAssetId` / `sanitizeBuyRate`)**

- **category** — 앱이 아는 7종(`ASSET_CATEGORIES`: 주식·ETF·채권·현금·부동산·원자재·암호화폐)만 복원.
  그 외는 `undefined` → 예전처럼 자동분류. **검증은 엑셀 경로에서만 한다** — `makeAsset` 안에서
  검증하면 자산 폼의 "직접 입력"으로 사용자가 타이핑한 분류를 앱이 조용히 바꾸게 된다.
- **id** — 빈 칸/100자 초과면 새로 발급. **한 파일 안에서 같은 id가 두 번 나오면 뒤쪽에 새 id**를 준다.
- **buyRate** — 0·음수·비수치는 저장하지 않는다(0이면 매입원가가 0이 되어 수익률이 무한대).

**구형 엑셀 하위호환** — id/취득환율 칸이 없는 파일도 정상 import된다. id는 새로 발급, buyRate는
기존 폴백(오늘 환율), **없던 값을 추정해 만들지 않는다.** `e2e/53`이 컬럼을 지운 파일로 실제 검증한다.

**해결 확인(실측)**: 원자재·암호화폐 포함 8종 category 유지 · 원화 현금 잔고 5,000,000 유지(거래원장
100에 안 끌려감) · [추가하기] 복제 소멸 · buyRate 1,200 유지(오늘 환율 1,450 미사용) · 왕복 후 id 동일 ·
클라우드 최초 페어링 중복 소멸 · 대시보드/소유자별 합계·결정론적 집계·**Monte Carlo 입력** 전부 불변.

**⚠️ Golden Reference는 직접 검증하지 못했다.** `자산관리_2026-09-06_v-1.xlsx`는 저장소에 없다
(사용자 개인 데이터). 대신 Golden 구조를 고정하는 기존 `e2e/46` 테스트 15 통과 + 대표 자산 조합으로
같은 항목을 왕복 검증했다. **실제 파일이 확보되면 그것으로 한 번 더 돌려볼 것.**

**positionSource는 이번 Phase에서 변경하지 않았다.** 엑셀 컬럼을 추가하지 않았으므로 **덮어쓰기에서는
여전히 값이 지워진다**(추가하기는 Phase 50대로 보존). `e2e/53`이 이 상태를 "고쳤다"가 아니라
"지금 이렇다"로 고정해 두었다. id가 보존되므로 이제 컬럼 없이 기존 자산에서 이어받는 방법이 생겼지만
**그건 새 규칙이라 PM 승인 없이 넣지 않았다.**

### 🟡 남은 이슈 — 평가금액 0 자산이 엑셀 내보내기에서 제외된다

`js/12` 내보내기의 `Math.round(calcRow(a).curAmount) !== 0` 필터. **이건 버그가 아니라 의도된 설계다** —
주석이 "전량 매도 종목과 시세 미입력 자산 두 경우를 다 걸러내려고" 평가금액 기준으로 했다고 명시한다.
그런데 Phase 53으로 엑셀이 복원 경로로서 신뢰할 만해진 지금은 그 의도가 **복원과 충돌**한다.

| 0원이 되는 경로 | 실측 |
|---|---|
| 자산 폼 현재가에 **`0`을 직접 입력** | 통과됨(수량 0·매수단가 0은 막힘). 현재가 **빈칸**이면 매수단가로 채워져 안전 |
| **전량 매도**된 종목 | 수량 0으로 남음(삭제하지 않는 기존 정책) |
| 환율 0 | **도달 불가** — 로드·입력·클라우드 전부 `> 0` 가드가 있고 시세 실패는 현재가를 덮어쓰지 않는다 |

**엑셀 덮어쓰기로 복원하면 그 자산들이 앱에서 사라진다**(실측: 자산 5개 → 1개). 수량 0 자산은
매입금액도 0이라 실질 손실이 없지만, **수량 > 0 인데 현재가 0인 자산은 총매입금액이 함께 사라져**
전체 손익·수익률이 달라진다(실측: 총매입 20,000 → 10,000). **[추가하기]와 JSON 백업에서는 보존된다.**

→ **🟡 V1.0 NON-BLOCKER** (트리거가 "현재가에 0을 직접 입력"이고, 그 자산은 이미 화면에 0원으로
보이며, 완전 복원 수단인 JSON이 따로 있다). 최소 수정안은 필터를 `curAmount === 0 && quantity === 0`
으로 좁히는 것 — 전량매도 제외라는 원래 의도는 지키면서 보유 자산은 남는다. **PM 미승인, 구현 금지.**

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 50: Hybrid SoT를 동기화에 연결 + **🚀 v213 → v214 릴리스**

**커밋** `0d89180` "fix: enforce hybrid position source for asset positions" ·
`2dae3b8`(인계장) · **`6de5a68` "release: bump service worker cache to v214"** — 전부 push 완료.

### ✅ v213 → v214 캐시 갱신 실측 (릴리스 완료 근거)

**"캐시를 지우면 된다"로 끝내지 않았다.** 진짜 v213 릴리스 파일(`2743c90`)로 캐시를 만든 뒤,
**캐시를 그대로 둔 채** v214를 배포하고 앱을 다시 여는 것만으로 확인했다.

| 단계 | 캐시 | 화면 | 47-F | 49 | 50 |
|---|---|---|---|---|---|
| ① v213 사용자 | `…-v213` | v213 | 없음 | 없음 | 없음 |
| ② 다시 연 뒤 | **`…-v214` 하나만** | **v214** | ✅ | ✅ | ✅ |
| ③ 첫 방문자 | `…-v214` | v214 | — | — | ✅ |

서빙된 v214 코드에서 동작까지 확인: 48-A 자동판별 키 엑셀 빈칸(계산키는 KOSPI) · 49 거래원장이
만든 자산 `ledger`/허용값 2개 · 50 P0-1 manual 수량 보존(10, 거래원장은 40) · 50 P0-2
`LEDGER_WITHOUT_TX` 탐지 + 자동삭제 없음 + 부동산은 정상.

이 검증은 `playwright.config.js`와 **같은 DNS 차단 인자**로 수행해 **Production Worker/외부 API
요청 0건**이었다(외부 시도 201건 전부 `ERR_NAME_NOT_RESOLVED` — 기기를 떠나지 못함).
스크립트는 scratchpad에 있고 커밋하지 않았다(파일을 디스크에서 교체하는 방식이라 상시 spec으로
두면 다음 버전 bump 때 깨진다).

> **⚠️ 이 릴리스가 중요한 이유**: v213 이후 커밋된 제품 코드(47-E · 47-F · 48-A · 49 · 50)는
> **APP_SHELL이 v213 캐시에 갇혀 실제 사용자에게 전달되지 않고 있었다.** Phase 50 브라우저 검증 중
> 실측으로 확인했다(v213 캐시가 있는 상태에서 새 `index.html`이 서빙되지 않음 → 캐시를 지우자 나타남).
> 각 Phase 지시가 "SW 재bump 금지"였기 때문에 생긴 누적이며, **v214 bump 한 번으로 다섯 Phase 분이
> 함께 전달된다.** 앞으로도 APP_SHELL 파일(index.html · js/01~14)을 고쳤으면 릴리스 시점에
> CACHE_NAME을 올려야 사용자에게 닿는다 — **코드가 정상인 것과 사용자가 그 코드를 받는 것은 별개다.**

### P0-1 — 거래원장이 무엇을 덮어써도 되는가

**원인**: `syncAssetsFromTransactions`([js/06:172](js/06-transactions.js#L172))는 **매 부팅마다**
실행되면서([js/14:181](js/14-settings-boot.js#L181)) 매칭되는 포지션의 수량/취득가/취득환율을 자산에
덮어써 왔다. 같은 소유자·계좌·티커(또는 이름)를 가진 거래가 하나라도 생기는 순간부터, 사용자가 자산
화면에서 직접 입력한 값은 다음 부팅에 조용히 사라졌다.

**수정**: 원화 현금 가드 바로 아래 **한 줄**.

```js
if (asset && asset.positionSource === 'manual') return;
```

| 원천 | 수량·취득가·취득환율 | 이번 변경 |
|---|---|---|
| `ledger` | 거래원장이 원천 | **무변경**(기존 정상 동작 유지) |
| `manual` | 자산 마스터가 원천. 전량매도 시 수량 0 처리도 안 함 | **이번 Phase의 유일한 데이터 동작 변경(PM 승인)** |
| 없음(legacy) | 이 가드에 걸리지 않음 → 예전과 완전히 동일 | **무변경** |

**legacy를 전부 ledger로 강제하는 방식은 쓰지 않았다.** 아무것도 하지 않아 동작이 그대로 유지된다.

### P0-2 — 어긋난 상태는 "탐지"만 한다

`assessPositionConsistency(asset)` — **쓰기가 한 줄도 없는 순수 조회 함수.**

| 상태 | 판정 |
|---|---|
| `ledger`인데 매칭 거래 없음 | `LEDGER_WITHOUT_TX` |
| `manual`인데 매칭 거래가 있고 **값이 어긋남** | `MANUAL_WITH_TX` |
| `manual` + 거래 없음 / 값 일치 · 원화현금 · **legacy** | `OK`(문제 아님) |

**"거래내역이 없다 = 고아"라는 단순 규칙은 절대 만들지 않는다** — 부동산·원화현금·직접등록 자산은
거래가 없는 것이 정상이라, 그 규칙은 멀쩡한 자산 다수를 문제로 표시한다. 매칭 키는
`syncAssetsFromTransactions`와 **똑같은 것**을 쓴다(두 곳이 갈라지면 "동기화는 건드리는데 화면은
문제없다고 말하는" 상태가 된다). 취득가는 상대오차 1e-9 허용치(나눗셈 끝자리 흔들림 방지).

**금지 유지**: 자산 자동 삭제 · quantity/buyPrice/buyRate 자동 0 · positionSource 자동 변경 ·
owner/accountType/ticker 자동 변경.

**UI**: 기존 자산 상세 모달 안 **한 줄**(`#assetDetailPositionNotice`, 수량/매수단가 바로 아래).
새 카드/탭/진단 화면 0개, **자동 해결 버튼 0개** — 어느 쪽 값이 맞는지는 앱이 아니라 사용자만 알기
때문에 문구도 단정하지 않고 확인만 요청한다. 375px 다크 실측: 14px / amber-400 / 가로스크롤 없음.

### Excel merge 보존

`mergeAssetsForAppend`가 `{...incoming, id: 기존id}` 형태라 기존 `positionSource`를 잃던 문제
(Phase 49의 알려진 한계)를 막았다. **엑셀 시트에 이 칸이 없으므로 "파일에 값이 없다"는 "manual이다"가
아니라 "이 파일은 그 사실을 담지 않는다"는 뜻이다.** 값이 없으면 기존 값 보존, 파일이 값을 담고 있으면
다른 필드와 똑같이 파일이 이긴다. **schema 변경 0건.** Phase 48-A 규칙(자동 판별 Key → 엑셀 빈칸,
사용자 override → 기록) 그대로.

### 불변성 (실측)

**데이터**: ticker · owner · accountType · name · currency · category · role · rateMatchOverride ·
customScenarioRates · id, 그리고 **ledger/legacy 자산의 수량·취득가·취득환율 전부 불변.**
유일한 의도된 변경은 manual 자산이 잘못된 overwrite에서 보호되는 것 — 저장된 데이터를 고치는 게
아니라 **다음 부팅부터 되돌아가지 않을 뿐**이다(되돌리려면 그 한 줄을 빼면 된다).

**계산**: 적용 Return Key와 3개 시나리오 수익률이 세 원천 상태에서 동일(숫자를 테스트에 베끼지 않고
`SCENARIO_RATE_PRESETS`에서 읽어 비교). 결정론적 집계(`getProjectionGroupStats`)와 **Monte Carlo 입력**
(`assetOrder`/`weight`/`muAnnual`/`sigmaAnnual`/`errors`)이 동기화 전후 완전 동일.
MC는 시뮬레이션이 아니라 **엔진 입력**을 비교했다 — 입력이 같으면 결과는 구성상 같고, 원인 지점을
정확히 짚는다.

### 테스트

`npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v214)** · `e2e/52` **17/17** ·
전체 e2e **498/498 — 실패 0건, 신규 회귀 0건** · **Production Worker/외부 API 요청 0건**(Phase 47-G 유지).

> 실행 중 1건이 처음 실패했으나 **테스트 픽스처 오류였고 제품 버그가 아니었다** — 거래의 환율 필드명은
> `rate`가 아니라 **`appliedRate`**([js/06:24](js/06-transactions.js#L24)).

### 🔴 다음 Phase 후보 (PM 승인 대기 — 임의 착수 금지)

| 항목 | 내용 |
|---|---|
| **legacy source 확정 UX** | 앱이 추정하지 않고 **사용자가 상세 모달에서 한 번 선택**(ledger/manual). 선택하지 않으면 기존 상태 유지, 선택 전에는 legacy 동작을 바꾸지 않는다. **PM이 좋은 후보로 인정했으나 이번 릴리스에 포함하지 않음** |
| P1 | Excel import의 `category` 재계산 · `id`/`updatedAt` 재발급 · `buyRate` 미포함 · ticker/owner/accountType 변경 시 자산 분열 |
| F-4 | Return Key **수정** UI(현재는 보기만 가능) |
| 보류 | Bond · Cash 구조 · CORS_PROXIES 6중 호출 · backfill dedupe · Sync 10초 polling · 오프라인 MC Safety BLOCK |

**legacy 자산은 여전히 보호받지 못한다**(표식이 없어 예전처럼 덮어써진다). 의도된 선택이다 — 원천을
모르는 자산을 추정해 보호하면 실제로는 거래원장이 맞는 자산의 값을 틀린 채로 굳혀 **새 P0을 만든다.**

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 49: positionSource 도입 **v213 유지**

**커밋** `9f90763` "feat: record whether each asset's position comes from the ledger or manual entry" — push 완료.

### 무엇을, 왜

Phase 48 감사가 확정한 Hybrid SoT가 **코드 어디에도 적혀 있지 않다**는 것이 P0-1/P0-2를 못 고치던
진짜 이유였다. `syncAssetsFromTransactions`는 "지금 매칭되는 거래가 있는가"만 볼 수 있어서
**거래가 있었다가 사라진 자산(고아)** 과 **애초에 거래가 없던 자산(부동산·현금·최초등록)** 을
구분하지 못한다. 자산에 표식 한 필드를 더해 그 구분을 명시적으로 남겼다.
**이번 Phase는 "적어 두는 것"까지이고 실제 sync 동작은 전혀 바꾸지 않았다.**

### positionSource 사양 (PM 승인 완료)

| 항목 | 내용 |
|---|---|
| **저장 위치** | 자산 객체 `state.assets[]`의 필드 하나 |
| **허용값** | **정확히 `'ledger'` \| `'manual'` 둘뿐.** 3번째 값 추가 금지 |
| **값 없음(`undefined`)** | 세 번째 값이 **아니다** — "아직 표시되지 않았다"는 뜻. `rateMatchOverride`("빈 값=자동판별")·`customScenarioRates`("필드 없음=시스템 기본")가 이미 쓰는 **필드-존재 의미 체계**(Phase 29-B) 그대로. 그래서 스키마가 2-value로 유지된다 |
| **영속화** | `persistAssets` 화이트리스트 · `buildSyncBlob` · `normalizeImportedAsset` |

**생성은 "사실이 만들어지는 순간" 딱 두 곳뿐이다.**

| 경로 | 값 |
|---|---|
| `syncAssetsFromTransactions`가 포지션에서 **자산을 새로 만들 때**([js/06:172](js/06-transactions.js#L172)) | `'ledger'` |
| 자산 폼("최초등록")의 **생성 분기**([js/07](js/07-table-render-modals.js)) | `'manual'` |

**일부러 찍지 않은 곳** — sync의 *기존 자산* 갱신 분기 · 자산 폼의 *수정* 분기 · Excel import ·
Cloud merge. 특히 자산 폼 수정 분기는 `payload`에 넣지 않고 `{ ...oldAsset, ...payload }`를 그대로
뒀다. **넣었다면 거래원장에서 태어난 자산을 이 화면에서 열고 저장만 해도 `'manual'`로 뒤집혀
P0-1/P0-2의 판단 근거가 그 자리에서 오염된다.** `e2e/51` B-2가 이 지점을 고정한다.

**추론 금지** — ticker·category·owner·accountType·rateMatchOverride·assetCharacter 중 무엇도 이 값을
결정하는 데 쓰지 않는다. **마이그레이션 0건**(legacy 자산은 값 없이 그대로).

### 데이터 불변성 (실측)

같은 자산을 `ledger`/`manual`/값없음 세 상태로 만들어 **백업·동기화 왕복까지 통과시킨 뒤**
positionSource만 빼고 **JSON 문자열 단위 완전 일치** 확인 — ticker·owner·accountType·quantity·
buyPrice·**buyRate**·currency·category·role·rateMatchOverride·id 전부 불변. 계산도 4개 대표 자산
× 3 시나리오에서 **적용 키·수익률이 세 상태 모두 동일**(숫자를 테스트에 베끼지 않고 프리셋에서
직접 읽어 비교). KOSPI 앵커 상속 · BOND 카테고리 · UNRESOLVED→0 전부 유지.

### 테스트

`npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v213)** · `e2e/51` **11/11** ·
전체 e2e **481/481 — 실패 0건, 신규 회귀 0건**. Phase 47-G 격리 유지 — **Production Worker/외부 API 0건.**

> 테스트 중 3건이 처음 실패했으나 **전부 테스트 픽스처 오류였고 제품 버그가 아니었다.** 기대값을
> 완화하지 않고 사실에 맞게 고쳤다: ⓐ **삼성전자의 적용 키는 `005930.KS`가 아니라 `KOSPI`다**
> (Phase 47-A에서 전용 프리셋 폐지 → 판별 자체가 지수 키로 떨어짐) ⓑ **`buyRate`는 `makeAsset`이
> 만드는 값이 아니라 거래원장 동기화가 채우는 값**이라 왕복 경로로 검증하도록 변경 ⓒ 수정 모달
> 진입 함수는 `openModal('edit', id)`.

### 알려진 한계 (숨기지 않고 기록)

- **Excel import 자산은 값이 없다.** PM §7 "컬럼 추가 금지"를 지킨 결과이며, 값 없음 = 현행 동작
  그대로라 안전하다.
- **`mergeAssetsForAppend`가 `{...incoming, id: 기존id}` 형태라 기존 `positionSource`를 잃는다.**
  Excel 의미 변경 금지에 걸려 Phase 49에서는 손대지 않았다. → **Phase 50 검토 대상.**

### P0-1 / P0-2 착수 조건

- **신규 자산은 이제 스스로 출처를 말한다.** legacy 자산에는 아직 표식이 없다.
- legacy에 추측을 넣을 필요는 없다 — `isTransactionTracked(a)`([js/06:211](js/06-transactions.js#L211))가
  "지금 매칭되는 거래가 있는가"라는 **사실**을 답한다. **단, 위 상시 정책 5항대로 그것을
  positionSource의 영구 대체값으로 삼지 않는다.**
- 저장된 표식의 고유한 가치는 **"거래가 있었다가 사라진 자산"을 "애초에 거래가 없던 자산"과
  구분하는 그 한 경우** — 정확히 P0-2가 막혀 있던 지점이다.
- 진행 순서: **표식 있으면 표식 우선 → 없으면 `isTransactionTracked` 사실 판정 → 그래도 모호하면
  건드리지 않고 보존.** 자동 삭제/0 만들기는 여전히 금지.

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 48 SoT 감사(코드 0건) + Phase 48-A: P0-3 수정 **v213 유지**

**커밋** `23091d7` "fix: stop excel round-trip from promoting auto-resolved return keys to user overrides" — push 완료.

### Phase 48 — F-3 Source of Truth 전면 감사 (제품 코드 변경 0건)

핵심 질문 *"사용자가 입력한 사실 데이터와 설정이 의도하지 않게 변하지 않는가?"* → **NO.**
18개 충돌 시나리오를 실제 state 조작으로 전수 재현했다.

**P0 (실제 데이터 손실 / 의미 변경)**

| | 문제 | 재현 |
|---|---|---|
| **P0-1** | Excel 자산 replace의 quantity/buyPrice가 **다음 부팅에 조용히 되돌아감** (99주 → 10주). `syncAssetsFromTransactions`가 매 부팅 실행([js/14:181](js/14-settings-boot.js#L181)) | S1·S2·S15 |
| **P0-2** | 거래 overwrite / Excel replace / **Cloud pull**에서 거래에 없어진 자산이 옛 수량 그대로 잔존 → 화면·KPI·Projection·MC·Risk 전부 과대. 고아 방어는 **거래 1건 삭제 경로에만** 있다([js/06:822](js/06-transactions.js#L822)) | S14 |
| **P0-3** | Excel 왕복이 자동 판별 Return Key를 사용자 override로 승격 | S7 → **48-A에서 해결** |

**P1**: Excel import가 `category` 재계산(주식→ETF, S4) · `id`/`updatedAt` 재발급(S5·S17) ·
ticker/owner/accountType 한 글자 차이로 자산 분열(S13) · Excel이 `buyRate`를 담지 않음.

**정상 확인된 것**: Cloud Sync 충돌은 **명시적 정책**이다(id + `updatedAt` LWW + `lastSyncedIds` baseline으로
"삭제 vs 신규" 구분, 5가지 조합 실측 전부 의도대로). 거래 모달의 빈칸 보호(Phase 30)와 JSON 복원의
override 보존(Phase 47-E)도 정상. 원화 현금 보호도 정상(S11).

**구조 요약**
- `category`가 **4개 역할을 겸한다**: 화면 분류 / 시세조회 대상(`NON_TRADABLE_CATEGORIES`) /
  Risk Universe(`RISK_ELIGIBLE_CATEGORIES`) / Projection 그룹. **그래서 Excel의 category 재계산이 위험하다.**
- **Risk Universe ≠ Rebalance Universe** — 목적이 달라 통합하지 않는다.
- **완전 복원 수단은 JSON 백업 하나뿐이다.** 거래백업은 원장만, Excel은 자산+수익률만 담는다.
- **"최초등록"은 UI 용어(자산 추가)이고 `origin:'initial'` 거래와 다른 기능이다.** 이름만 같다.
- **field-level split**: `currentPrice`/`role`/Return Key는 분리 안전. **`quantity`+`buyPrice`+`buyRate`는
  반드시 하나로 묶어야 한다**(같은 거래 집합에서 동시에 나오므로 섞이면 손익이 무의미). ticker/owner/
  accountType/name도 **매칭 키**라 반드시 함께.
- **이행 권고(B안)**: 자산에 `positionSource`(`'ledger'`|`'manual'`) 표식 1개를 더해 지금의 Hybrid를
  **명시적으로** 만든 뒤 P0-1/P0-2를 푼다. **표식 없이 고아 자산을 자동 정리하면 부동산·현금·최초등록
  자산을 잘못 0으로 만들어 새 P0을 만든다.** ← 아직 미승인, 구현 금지.

### Phase 48-A — P0-3 수정 (이번 Phase의 유일한 구현)

**원인**: `js/12` 엑셀 export의 대표매칭 칸이 `resolveAssetGroupKeyDetail(a).key`(지금 적용 중인 키)를
찍었다. 그 값에는 사용자 지정과 자동 판별이 섞여 있어, 재업로드하면 `makeAsset`이 그것을
`rateMatchOverride`로 저장해 **자동판별이 사용자 지정으로 굳었다.**

**수정**: `'대표매칭(수익률연동키)': sanitizeRateMatchOverride(a.rateMatchOverride) || ''` — **저장된
오버라이드 원본값만 적고 없으면 빈 칸.** Phase 29-B가 수익률 시트에서 이미 쓰는 규칙 그대로다.

**내보내기만 바꿨다. 가져오기는 그대로 뒀다** — 예전 파일에 찍힌 자동 판별값이 사용자가 적은 것인지
예전 export가 찍은 것인지 **현재 schema로는 구분할 수 없어서**, 임의로 추정해 지우지 않고 보존한다
(**알려진 legacy 모호성**, `e2e/50` 테스트 D가 이 사실 자체를 고정한다).

**부작용 없음 확인**: 자동 판별 자산의 계산 키·수익률은 왕복 전후 동일(KOSPI 7%), 사용자 지정은
그대로 유지, `customScenarioRates`·owner·계좌·수량·매수단가 전부 불변.

**엑셀 칸이 비어 보이는 것에 대해**: 적용 중인 기준은 이제 **자산 상세 모달의 "장기 수익률 가정"
블록**(Phase 47-F)에서 자동/사용자 구분과 함께 볼 수 있다. 그 정보를 엑셀 칸에 다시 섞으면 승격
문제가 되살아나므로 **의도적으로 내보내지 않는다.**

**검증 방식이 중요하다**: `e2e/50`은 규칙을 테스트에 베껴 쓰지 않는다. 실제 `#exportExcelBtn`을 눌러
만들어진 워크북을 읽고(테스트에서만 `XLSX.writeFile`을 가로챔), 그 파일을 base64→임시파일로 만들어
**실제 `#excelFileInput`에 올려** 왕복시킨다. 규칙을 복사한 테스트는 규칙이 바뀌어도 안 깨진다.

### 테스트

`npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v213)** · `e2e/49` **4/4** ·
`e2e/50` **6/6** · 전체 e2e **470/470 — 실패 0건, 신규 회귀 0건**.
Phase 47-G 네트워크 격리 유지 — **Production Worker/외부 API 요청 0건**.

### 🔴 남은 미결 (PM 결정 대기 — 임의로 손대지 말 것)

| 항목 | 상태 |
|---|---|
| **P0-1** quantity/buyPrice가 부팅 때 되돌아감 | 미해결. `positionSource` 표식 승인 필요 |
| **P0-2** 고아 자산 | 미해결. 고아 정의 후보 O-1~O-4 중 미확정(**O-3=baseline 방식 또는 O-4=UI 표시만** 권고) |
| P1 Excel category 재계산 / id·updatedAt 재발급 / buyRate 미포함 | 미해결 |
| P1-3 ticker·owner·accountType 변경 시 자산 분열 | 미해결 |
| F-4 Return Key **수정** UI | 미해결(보기만 가능). `populateRateMatchOverrideOptions`([js/06:541](js/06-transactions.js#L541)) 재사용 가능 |
| Cash 입력경로 통일 | **현행 유지 권고**(USD를 assets로 옮기면 환차손익 계산 능력 상실) |
| Bond | **P0-1 SoT 확정 후 착수**(시간축 이벤트 = 원장 구조) |
| CORS_PROXIES 6중 동시 호출 / backfill ticker dedupe / Sync 10초 polling / 오프라인 MC Safety BLOCK | 보류 |

**다음 구현 순서 권고**: ① `positionSource` 표식(마이그레이션 불필요) → ② P0-1/P0-2 → ③ 고아 정의 →
④ Backup/Restore 명칭 명확화 → ⑤ Excel category/id → ⑥ F-4 수정 UI → ⑦ Cash 설명 → ⑧ Bond.

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 🔴 상시 개발 정책 — E2E는 Production API/Worker를 호출하지 않는다

**이 정책은 특정 Phase의 산물이 아니라 이 프로젝트의 상시 기준이다. 새 E2E를 쓰기 전에 먼저 읽는다.**

1. **일반 E2E 테스트는 Production API/Worker를 호출하지 않는다.** 테스트 브라우저는 `playwright.config.js`의
   `--host-resolver-rules`로 DNS가 localhost와 앱 셸 CDN 3곳(cdn.tailwindcss.com / unpkg.com /
   cdn.jsdelivr.net)으로 제한돼 있다. 이 허용 목록에 **시세·환율·Worker 호스트를 추가하지 않는다.**
2. **외부 연결 자체를 검증해야 한다면** 일반 E2E에 섞지 말고 **별도의 Integration/Connectivity 테스트로 분리**한다.
   그리고 **그런 테스트는 반복 실행하지 않는다**(1회 수동 실행).
3. **어떤 경우에도 `--repeat-each` / stress 반복 / 동일 spec 수십 회 반복 / 백그라운드·포그라운드 동시
   실행을 하지 않는다.** 마지막 항목은 두 프로세스가 같은 dev server를 공유해 false failure를 만든다(실제로 겪음).
4. 가격 이력이 필요한 테스트는 `fixtures.seedPriceHistory(page, [extraTickers])`로 **결정론적 합성 시계열**을
   앱의 당일 캐시에 넣는다. 실제 시세를 부르지 않는다.
5. **`e2e/49-network-isolation.spec.js`의 기대값을 완화하지 않는다.** 이 테스트가 깨지면 테스트가 낡은 것이
   아니라 **테스트가 다시 실제 인프라를 때리고 있다는 뜻**이다.

---

## 최근 세션 요약 (2026-09-07) — 🔴 Cloudflare 100k/day 소진 사건 + Phase 47-G: E2E 네트워크 격리 **v213 유지**

**커밋** `2b49d05` "test: isolate e2e from production cloudflare workers and price APIs" — push 완료.
**제품 코드·Worker 코드 변경 0건**(테스트 인프라만).

### 사건

Cloudflare Workers Free 계정의 **일일 요청 한도 100,000건(계정 전체, 세 Worker가 공유)을 실제로 소진**해
초과 메일이 반복 발생했다. 긴급 조사(READ-ONLY) 결과 원인은 **내가 실행한 E2E 테스트**였다.

### 원인 — 실측

1. **E2E에 네트워크 mock이 전혀 없었다.** `page.route`/`abort`/`fulfill`/`setOffline` 검색 결과 **0건**.
   `playwright.config.js`의 `baseURL: localhost:8644`는 **정적 파일만** 로컬이고, 앱 코드는 그대로 실행되어
   **production Worker URL을 직접 호출**했다.
2. **깨끗한 앱 부팅 1회 = own-worker(asset-manager-proxy) 요청 26건**(브라우저 network 로그 실측, 전부 200).
   내역: 환율 1 + 보유종목 시세 5 + 리스크 1y 4 + 소급 2y 5 + 지수·매크로 11.
3. **Playwright는 테스트마다 새 컨텍스트(빈 localStorage)를 준다** → 매 테스트가 샘플 자산 시딩 →
   `bootApp()` → `refreshPricesAndRates()` 전체 실행. **테스트 1건 = 페이지 1회 로드 = 26건.**
4. **전체 e2e 1회 ≈ 460 테스트 × 26 ≈ 12,000건.** 이번 세션에 전체 e2e 약 10회 + 부분/변이/스트레스 반복
   → **추정 160,000~172,000건** (한도의 1.6~1.7배).

**증폭 구조**: `CORS_PROXIES`(js/01)의 **첫 번째가 own-worker**이고 6개를 **동시에 발사**한다
(`Promise.any`). 다른 프록시가 이겨도 own-worker 요청은 이미 나간 뒤다. 국내 티커는
`raceFetchNaverKr`와 `raceFetchYahooStooq`를 **동시에** 시작하므로 **티커 1개당 own-worker 2건**이다.

**앱 자체에는 무한 retry / timer 중복 / event listener 중복이 없다**(재진입 가드·1분 가드 정상 확인).
시세 경로에 재시도 없음. Sync 폴링은 테스트에서 `syncState.enabled=false`라 요청을 만들지 않는다.

### Phase 47-G에서 한 일 — DNS-level isolation

`playwright.config.js`의 `use.launchOptions.args`에 한 줄:
```
--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1,
                      EXCLUDE cdn.tailwindcss.com, EXCLUDE unpkg.com, EXCLUDE cdn.jsdelivr.net
```

**`page.route`가 아니라 브라우저 실행 인자를 쓴 이유 두 가지** — ① spec 48개의 import를 하나도 건드리지
않고 config 한 곳으로 끝난다 ② 개별 테스트가 `page.unroute`로 **우회할 수 없다**(구조적 보장).
EXCLUDE 목록은 `index.html`이 `<script>`로 로드하는 앱 셸 CDN 3곳뿐이다 — 이게 없으면 Chart.js/lucide/
xlsx/Tailwind가 로드되지 않아 앱 자체가 뜨지 않는다.

**검증(요청 로그 관측, 주석·문자열 검색 아님)** — `e2e/49-network-isolation.spec.js` 4/4:
`*.workers.dev` / `asset-manager-proxy` / `keymaster` / Sync Worker / Yahoo / Naver / Stooq /
allorigins / corsproxy.io / codetabs / r.jina.ai / exchangerate **12패턴에 대해 응답을 받은 요청 0건**,
시도된 요청은 전부 `ERR_NAME_NOT_RESOLVED`. 응답을 받은 외부 호스트는 허용 목록 3곳 외 **0개**.

> 앱 코드를 그대로 뒀으므로 브라우저 **내부 시도**는 남는다. 중요한 건 DNS가 실패해 **패킷이 이 기기를
> 떠나지 못한다**는 것이다 — Cloudflare에 도달하는 요청은 0건이다. e2e/49 테스트 1이 이 둘을 구분해 검증한다.

### 결정론적 price-history fixture

격리 직후 11건이 실패했는데, 테스트가 틀려서가 아니라 **앱이 원래 그렇게 동작하기 때문**이다:
`buildMonteCarloInputFromState`(js/16)는 **가격 이력 조회를 Safety 판정보다 먼저** 하고, 위험자산 이력이
없으면 σ를 0으로 채우지 않고 `errors`를 반환하면서 **`safety` 객체 자체를 만들지 않는다.** 그래서
"목표비중 합계 90%" 같은 데이터와 무관한 BLOCK 판정조차 화면에 뜨지 못했다.

해결: `fixtures.seedPriceHistory(page, extraTickers)` — 252일 결정론적 합성 시계열(선형합동 의사난수,
연 σ≈18%)을 `state.riskHistoryCache`에 직접 넣는다. `getCachedDailyCloses`(js/09)는 **당일 캐시가 있으면
네트워크를 아예 타지 않으므로** "요청 0건 + 계산 가능"이 동시에 성립한다.

- `seedPortfolio`가 **reload 이후에** 호출한다(riskHistoryCache는 localStorage에 저장되지 않는 메모리 캐시라
  reload하면 사라진다 — 순서를 바꾸면 안 된다)
- 기본 시딩 티커는 `^KS11`, `^GSPC`(js/05 `buildHouseholdInstrumentReturnSeries`가 namedHolding에 쓰는 지역
  대표지수). e2e/34·35는 각자 1줄로 추가 호출(35는 `['QQQM']`)
- **전역 자동 주입이 아니라 opt-in**이다 — "가격 이력이 없는 상태" 자체를 검증하는 테스트
  (e2e/19 케이스 2: "instruments가 비어 검증 오류 발생")를 망가뜨리면 안 되기 때문
- **기대값은 하나도 완화·삭제하지 않았다.** e2e/02는 여전히 "합계 90% → BLOCK + '차단' 문구 + 결과영역 숨김"을 그대로 검증한다

### 결과

| | 격리 전 | 격리 후 |
|---|---:|---:|
| 전체 e2e 통과 | 445 | **464** |
| 실패 | **15** | **0** |
| 테스트 1건당 Worker 요청 | 26 | **0** |
| 전체 e2e 1회당 Worker 요청 | ~12,000 | **0** |

`npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v213)** · `e2e/49` **4/4** ·
전체 e2e **464/464** · **신규 regression 0건**.

**오랫동안 "이 환경의 알려진 실패"로 기록해 온 15건이 전부 해소됐다** — e2e/33 헤더 반응형 14건 +
e2e/36 test 8 시세 레이스 1건. 원인이 설명된다: e2e/33이 재던 4요소 중 하나가 **환율 뱃지**라,
실시간 환율이 도착하면 뱃지 텍스트 폭이 변해 헤더 측정이 흔들리고 있었다. e2e/36은 시드한 QQQM
현재가를 실시간 시세가 덮어쓰던 레이스였다. **둘 다 "테스트가 실제 시장 데이터에 의존하던 것"이
원인이었고 격리가 뿌리를 제거했다.** → 앞으로 이 15건을 "환경 실패"로 보고하지 말 것.

### 🔴 보류 backlog (PM 결정 대기 — 이번에 손대지 않았다)

| 항목 | 내용 |
|---|---|
| **CORS_PROXIES 6중 동시 호출** | own-worker가 항상 배열 [0]이라 조회 1건마다 요청 1건 확정. 정상 사용 요청량을 2~6배로 만든다. 단계 경쟁으로 바꾸면 줄지만, **과거 "20초+ 지연" 사고로 지금 구조가 된 이력**이 js/09 주석에 있다 |
| **backfillDailyPnlHistory ticker dedupe** | fingerprint가 자산 단위라 같은 티커를 2인이 보유하면 2y 조회가 2번 나간다(실측) |
| **Sync 10초 polling** | 동기화 ON인 기기당 8,640건/day 고정 |
| **오프라인 MC Safety BLOCK 미표시** | 위 §fixture 문단의 제품 코드 문제. 네트워크가 없으면 MC 실행 시 BLOCK 카드가 뜨지 않고 "데이터 부족" 오류만 난다. **실사용자가 오프라인일 때도 동일** |

**Cloudflare Paid Plan 업그레이드는 고려 대상이 아니다**(PM 확정).

### 참고 — 정상 사용 시 예상 요청량

Golden 포트폴리오(18 티커) 기준 5분 갱신 1회 ≈ 43건 → 탭을 종일 열어두면 기기당 ≈ 12,400/day,
2기기 ≈ 24,800 + Sync 17,280 = **약 42,000/day(한도의 42%)**. 헤드룸이 얇으므로 위 backlog는
언젠가 다뤄야 한다.

---

## 최근 세션 요약 (2026-09-07) — Phase 47-F: 적용 중인 Return Key 가시화 **v213 유지**

**커밋** `eea7be2` "feat: show which return assumption each asset is actually using" — push 완료.

### 목적

대표매칭키(`rateMatchOverride`)를 확인·지정할 수 있는 곳이 **거래 등록 모달(`tx_rateMatchOverride`)과
엑셀 대표매칭 칸뿐**이라, 거래내역을 쓰지 않는 자산(부동산·실물채권·원화현금·"최초등록"으로만 넣은 종목)은
사용자가 자기 자산에 어떤 수익률 가정이 붙어 있는지 **앱 안에서 확인할 방법이 아예 없었다**(Phase 47-B/C/D
감사 F-4). Phase 47-A로 지역 폴백이 사라진 뒤로는 그런 자산이 **성장 0%로 계산**될 수 있는데 그 사실조차
보이지 않았다. 이번 Phase는 "가시화"만 한다 — **수정 UI는 만들지 않았다**(아래 PM 결정 대기).

### 변경 파일

| 파일 | 내용 |
|---|---|
| `js/05-future-projection.js` | **신규** `describeAppliedReturnAssumption(asset)` + `RATE_KEY_SOURCE_LABELS` + `RATE_ASSUMPTION_DEFAULT_MESSAGES` (+61) |
| `js/08-detail-modal-fx.js` | **신규** `renderAssetDetailReturnAssumption(assets)` + 단일/통합 모달에서 각 1줄 호출 (+43) |
| `index.html` | `#assetDetailReturnAssumption` div 1개 (+8). **새 카드/탭/페이지 없음** |
| `e2e/48-phase47f-return-key-visibility.spec.js` | **신규** 14 테스트 |

### 🔑 화면 Key와 계산 Key의 동일성을 어떻게 보장했나

`describeAppliedReturnAssumption`은 **판정을 하나도 새로 하지 않는다.** 실제 계산이 쓰는
`resolveAssetGroupKeyDetail(asset)`과 `assessReturnAssumptionStatus(asset)`의 결과를 **그대로 옮겨 담기만**
한다. 사람이 읽는 이름도 `getRateMatchKeyDisplayLabel()`("수익률 관리"가 쓰는 같은 표)에서 가져온다.

**화면 전용 판정 로직을 절대 만들지 말 것** — 만드는 순간 "화면에는 KOSPI라고 나오는데 실제 계산은 다른 키"가
언젠가 반드시 생긴다. `e2e/48` 테스트 D가 9종 자산에 대해 `표시Key === getProjectionAssetGroupKey()`를 고정한다.

### 표시 규칙

- **적용 방식**은 `resolveAssetGroupKeyDetail`의 `source`로 정한다(`RATE_KEY_SOURCE_LABELS`):
  `override`/`customKey`/`customKeyword` → **사용자 지정**, 나머지(`category`/`presetTicker`/`tickerAlias`/
  `nameKeyword`/`assetCharacter`) → **자동 판별**.
- **상태 문구**는 `assessReturnAssumptionStatus`의 message가 있으면 그것을 우선 쓰고(UNRESOLVED/NEEDS_REVIEW),
  비어 있을 때만 채운다. **채우는 기준은 `status`가 아니라 `isUserSet`이다** — `status`의 `USER_DEFINED`는
  `customScenarioRates`에 등록된 키만 가리켜서, 사용자가 `KOSDAQ` 같은 **시스템 키**를 직접 지정한 경우를
  놓친다(그때 status는 OK). 구현 중 실측으로 잡은 문제이며, `status`로 되돌리면 "적용 방식: 사용자 지정"과
  "적합한 가정을 사용 중"이 나란히 뜨는 앞뒤가 안 맞는 조합이 다시 나온다.
- **UNRESOLVED**: "이 자산에 적용할 장기 수익률 가정을 찾지 못해 성장 없이(0%) 계산하고 있습니다.
  기준을 지정하면 그 값이 사용됩니다." — 자동 KOSPI/S&P500 적용 없음, 임의 추천 없음,
  **0%를 기대수익률이라고 말하지 않음**, override를 몰래 저장하지 않음(테스트 I가 고정).
- **적용 수익률(%)은 표시하지 않는다(PM 확정).** Bear/Base/Bull 중 하나만 보이면 초보자가 그것을
  "이 자산의 예상수익률"로 오해한다.
- **통합 모달**(같은 종목을 소유자/계좌별로 나눠 든 경우): 대표매칭키가 보유분마다 다를 수 있어
  **전부 같을 때만 값을 보여주고**, 다르면 "보유분마다 적용 중인 기준이 서로 다릅니다"로 알린다 —
  아무 하나를 골라 보여주면 나머지 보유분에 대해 거짓이 된다.

### 모바일 / Dark Mode

375 / 768 / 1440 × Dark·Light **6조합 전부 검증**(e2e/48). 각 조합에서 최소 글꼴 14px 이상 · 블록 가로 넘침 ≤1px ·
페이지 가로 넘침 ≤1px · **라벨 줄바꿈 없음** · 아이콘(✓/📝/⚠) 존재를 측정한다.
색만으로 상태를 구분하지 않는다 — 아이콘+문구가 먼저이고 색(`RETURN_SOURCE_TONE_CLASSES`, 기존 상수 재사용)은 보조.

첫 구현은 라벨을 고정폭 80px 좌측 열에 뒀는데 375px에서 "적용 중인 기준"이 **2줄로 접히는 것을 실측**해,
이 모달의 기존 정보 그리드(`assetDetailInfoGrid`)와 같은 "라벨 위 / 값 아래" 2열 격자로 바꿨다.
테스트가 `maxLabelLines <= 1`로 고정하므로 레이아웃을 바꿀 때 이 제약을 깨지 말 것.

### 테스트

- `npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v213)**
- `e2e/47` **10/10** · `e2e/48` **14/14**
- 전체 e2e **445 통과 / 15 실패 — 신규 회귀 0건**
  - e2e/33 헤더 반응형 13건 = 알려진 환경 실패
  - e2e/28 헤더 반응형 1건 = 같은 계열. 격리 6회 반복에서 **수정본 6/6 통과, 기준선도 6/6 통과** →
    이 환경의 헤더 반응형 플레이크로 확인(추가한 요소는 `hidden` 모달 안에 있어 헤더 레이아웃에 영향 불가)
  - e2e/36 테스트 8 1건 = 실시간 시세 레이스(기준선 동률 입증됨)
- **주의**: 전체 e2e를 백그라운드/포그라운드에서 **동시에 실행하지 말 것.** 두 프로세스가 같은 dev server를
  공유하면 e2e/37·40·48 등이 false failure를 낸다(이번 세션에서 실제로 겪음).

### 이번 Phase에서 변경하지 않은 것

Return Key 숫자 · `SCENARIO_RATE_PRESETS` · `customScenarioRates` · Deterministic/MC/GBM μ/volatility/
correlation/rebalancing/Risk/Safety/Projection 계산식 · Asset Character 판정 · `resolveRateKeyFromAssetCharacter` ·
`resolveAssetGroupKeyDetail`의 정책 · 지역 fallback 정책 · Samsung/KOSPI 정책 · KOSPI/KOSDAQ/BOND/부동산/
CASH 수익률 · **사용자 데이터** · **Excel schema** · **Cloud Sync 구조** · **Transaction 구조** ·
**Source of Truth** · **F-2 고아자산 처리** · **F-3** · **F-8 Excel 대표매칭 semantics** · **Bond 모델** ·
**Cash 입력경로** — 전부 무변경.

### 남은 미결 (PM 결정 대기 — 임의로 손대지 말 것)

- **F-2** 거래 Excel overwrite / Excel 자산 replace / 클라우드 동기화에서 거래에 없어진 자산이 옛 수량 그대로
  남는다. 고아 방어는 **거래 1건 삭제 경로에만** 있다([js/06:822](js/06-transactions.js#L822)).
- **F-3 Source of Truth** — 후보 A(transactions 원천)/B(assets 원천)/C(현행 유형별 분리)/D(최초등록을
  opening transaction으로)/E(Excel을 조정 입력으로). **어느 것도 임의 선택 금지.**
- **F-8** 엑셀 대표매칭 칸이 자동판별 결과와 사용자 지정을 구분 없이 같은 칸에 써서, 한 번 왕복하면
  `source: assetCharacter` → `override`로 굳어 이후 시스템 정책 변경을 따라가지 않는다.
- **Return Key 수정 UI 연결** — `populateRateMatchOverrideOptions(currentValue)`([js/06:541](js/06-transactions.js#L541))가
  재사용 가능한 안전한 구조다(목록은 `getScenarioRateDisplayRows`에서, 미등록 현재값은 `⚠ 현재값 …`으로 보존).
  다만 `<select id="tx_rateMatchOverride">`에 고정 결합돼 있어 ⓐ 자산 모달에 select 추가 ⓑ 함수가 id 대신
  요소를 받도록 일반화 ⓒ 저장 경로 ⓓ 거래 추적 자산도 수정 허용할지 결정이 필요하다.
- Cash 입력경로 통일 · Bond 착수 시점 · Excel 기타(category 재분류/id 재발급/buyRate 유실/updatedAt 변질).

### ▶ 다음 Phase의 선행 작업

**"F-3 Source of Truth 및 자산 입력/동기화 생명주기 전면 감사"가 다음 Phase의 선행 작업이다.**
F-2·Cash 입력경로 통일·Bond 데이터 모델이 전부 이 결정에 걸려 있어, 이것을 확정하기 전에 그 셋을 구현하면
반드시 재작업이 된다. 특히 후보 D(최초등록을 opening transaction으로)는 과거 `origin:'adjust'` 자동 거래
생성을 **폐지한 이력**([js/07:848-855](js/07-table-render-modals.js#L848))이 있으므로 그 폐지 사유의 재발
여부를 먼저 검증해야 한다.

`.claude/launch.json`은 이번에도 커밋하지 않았다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 47-B/C/D 감사 + 47-E: 자산 데이터 정합성 P0 수정 **v213 유지**

**커밋** `4135895` "fix: preserve user-set return key across backup restore and cloud sync" — push 완료.
Phase 47-B/C/D는 READ-ONLY 감사(코드 변경 0건), 47-E가 그 결과 중 P0 하나만 수정한 것이다.

### 🔴 F-1 — 백업/동기화가 사용자 지정 Return Key를 통째로 잃고 있었다 (수정 완료)

`buildSyncBlob()`([js/12:273](js/12-import-export-sync.js#L273))은 자산 16개 필드를 정상적으로 내보내는데,
되받는 `normalizeImportedAsset()`([js/12:545](js/12-import-export-sync.js#L545))에 **`rateMatchOverride`를
읽는 줄이 없었다.** 15개는 복원하고 이 하나만 빠뜨린 한 줄짜리 누락이다.

영향 경로 3개(전부 이 함수를 거친다): **JSON 백업 복원 / 클라우드 동기화 병합(원격이 updatedAt으로 이길 때) /
최초 페어링(fullAdopt)**.

**Phase 47-A 이후 심각도가 올라갔다**: 예전엔 override를 잃어도 지역 폴백이 받아줘서 "다른 기준이 적용됨"에
그쳤지만(KOSDAQ→KOSPI, 7%→7%), 지역 폴백이 사라진 지금은 **적용 수익률 7% → 0%**가 된다. 사용자 눈에는
자산이 갑자기 성장을 멈춘 것으로 보이고 원인을 알 수 있는 화면이 없다. 실브라우저로 재현했다
(파크시스템스 `rateMatchOverride='KOSDAQ'` → 복원 후 필드 자체가 사라짐).

**수정 방식**: `sanitizeRateMatchOverride(raw)`(js/01, `makeAsset` 바로 위)를 새로 만들어 **`makeAsset`(엑셀 경로)과
`normalizeImportedAsset`(백업/동기화 경로)이 공유**하게 했다. 같은 판단을 두 곳이 각각 하던 것이 이 버그의
원인이었으므로, 한 곳에 모아야 재발하지 않는다. 규칙: 없음/빈문자/공백 → `undefined`(자동판별 유지),
**`'UNRESOLVED'` → `undefined`**(내부 계산 상태를 사용자 지정으로 굳히지 않는다), 그 외 → trim한 문자열.

**기존 사용자 영향**: 이미 잃은 값은 자동 복구되지 않지만, `buildSyncBlob`은 원래도 정상이었으므로
**기존 백업 파일에는 값이 들어 있다** → 복원하면 회복된다.

**회귀 테스트** `e2e/47-phase47e-data-integrity.spec.js` 10개(A~L). 전부 실제 state를 바꾸고 원복하며
"함수 호출 여부"가 아니라 **적용 수익률 값**을 검증한다. Mutation: 수정 줄 제거 → **8/10 실패**,
UNRESOLVED 가드만 제거 → 1 실패.

### Phase 47-B/C/D 감사에서 확정한 사실 (코드 변경 0건)

**이 앱의 원천은 두 개다.** `state.transactions`가 `quantity`/`buyPrice`/`buyRate`의 원천이고,
`state.assets`가 그 외 전부(currentPrice/category/currency/role/rateMatchOverride)의 원천이다.
**원화 현금만 예외**로 `assets`가 수량의 원천이기도 하다([js/06:177](js/06-transactions.js#L177) — 의도적 설계).
이 3중 구조가 아래 위험 대부분의 뿌리다.

**미해결(전부 PM 결정 대기 — 임의로 손대지 말 것)**

- **F-2** 거래 Excel overwrite / Excel 자산 replace / **클라우드 동기화**에서 거래에 없어진 자산이
  옛 수량 그대로 남는다. `syncAssetsFromTransactions`는 "현재 포지션"만 순회해서 사라진 것을 방문조차 못 한다.
  고아 방어 코드는 **거래 1건 삭제 경로에만** 있다([js/06:822](js/06-transactions.js#L822)).
  `filteredAssets()`가 수량 0만 숨기므로 고아는 화면·KPI·Projection·MC·Risk에 전부 포함된다.
  클라우드 pull은 `syncAssetsFromTransactions()`를 **호출조차 하지 않는다**.
- **F-3** Excel 자산 replace로 고친 수량이 **다음 부팅에 조용히 되돌아간다**(실측 99주 → 10주).
  Source of Truth 정책(A~E 후보)을 PM이 결정하기 전에는 고치지 않는다.
- **F-4** 최초등록으로만 만든 자산은 Return Key를 **보지도 고치지도 못한다** — `rateMatchOverride` 입력은
  **거래 모달(`tx_rateMatchOverride`)과 Excel 대표매칭 칸에만** 있다. → Phase 47-F에서 "가시화"만 처리.
- **F-8(신규)** Excel export의 대표매칭 칸이 **자동판별 결과와 사용자 지정을 구분 없이 같은 칸에 쓴다**.
  한 번 왕복하면 `source: assetCharacter` → `override`로 굳어 **이후 시스템 정책 변경을 따라가지 않는다**
  (실측 확인). Phase 29-B가 수익률 시트에서 이미 고친 것과 같은 유형인데 이 칸에는 미적용이다.
- Excel round-trip 기타: `category` 재계산 · `id` 재발급 · `buyRate` 유실 · `updatedAt` 전부 "지금"으로.

**Bond**: 개별채권 지원은 현재 0%다(만기/표면금리/이표 필드 없음 — 채권은 "만기 없이 연 4%로 영원히 복리
성장하는 자산"으로 계산된다). 필요한 데이터는 거의 전부 **시간축 이벤트**라 `transactions` 구조와 맞고
`assets` 스냅샷 구조와 맞지 않는다 → **F-3을 먼저 결정하지 않고 Bond를 만들면 두 번 만들게 된다.**

**KIS API**: PM이 물었던 "호출량 문제"는 추정이 아니라 **실증된 사고**다. `251fc44`에서 채권 기능(ISIN + KIS
채권 라우트 2개)을 실제로 구현했다가 `93b563b`("missing timeout on KIS proxy calls")를 거쳐 `e8a6fed`로
**전체 revert**했고, 같은 날 시세 갱신 성능 커밋이 8개 이어졌다. worker 주석에도 "세 라우트를 동시 요청하면
일부가 **500으로 실패하는 게 재현됐다**"고 기록돼 있다(정확한 제한치는 문서 미확인 = 추정).
확인된 채권 엔드포인트: `/uapi/domestic-bond/v1/quotations/inquire-price`(FHKBJ773400C0),
`search-bond-info`(CTPF1114R). 현재 KIS는 **네이버·Yahoo가 둘 다 실패했을 때만 순차 호출되는 최종 안전망**이다.

**KRW/USD Cash**: Asset Class·Character·Return Key·수익률이 **완전히 동일**하고 `currency`/`isDomestic`만
다르다 — 즉 **Asset Class와 Currency는 이미 독립 축이고 구조 변경이 필요 없다**. 갈라진 것은 입력 경로뿐이며,
USD가 거래 기반인 실질적 이유는 **가중평균 매입환율(`buyRate`)**이다. `calcRow`([js/01:1349](js/01-core-state.js#L1349))는
`buyRate`가 없으면 오늘 환율로 폴백해 **환차손익이 항상 0으로 보인다**.

### 테스트

- `npm test` **179/179** · `eslint` **0** · Release Guard **PASS(v213)**
- 전체 e2e **431 통과 / 15 실패 — 신규 회귀 0건**
  (e2e/33 헤더 반응형 14건 = 알려진 환경 실패, e2e/36 테스트 8 = 실시간 시세 레이스로 기준선 동률 입증됨)
- `e2e/47` **10/10**

### 다음 세션이 손대면 안 되는 것

- **F-3(Source of Truth)은 PM 결정 전 구현 금지.** 후보 A(transactions 원천)/B(assets 원천)/C(현행 유형별
  분리)/D(최초등록을 opening transaction으로)/E(Excel을 조정 입력으로) 중 어느 것도 임의 선택하지 않는다.
  D는 UX를 유지하며 정합성을 얻지만, 과거 `origin:'adjust'` 자동 거래 생성을 **폐지한 이력**
  ([js/07:848-855](js/07-table-render-modals.js#L848))이 있어 그 폐지 사유의 재발 여부를 먼저 검증해야 한다.
- `e2e/45`·`e2e/46`·`e2e/47`의 기대값을 PM 승인 없이 고치지 말 것.
- `.claude/launch.json`은 커밋하지 않는다(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 46 감사 + 47-A: 수익률 계산 경로 완성 **V1.1 v212 → v213**

**커밋 2건, 둘 다 push 완료.**
- `2743c90` "release: bump service worker cache to v213" (Phase 46)
- `ddf475b` "fix: resolve return assumptions from asset character instead of region" (Phase 47-A)

**버전: v212 → v213** (sw.js CACHE_NAME + index.html appVersionLabel 동시 갱신, Release Guard PASS)

### 🔴 Phase 46이 찾아낸 것 — 정책 계층과 계산 계층이 서로 다른 말을 하고 있었다

`resolveAssetCharacter`(Phase 40-C)는 국고채 ETF를 정확히 `BOND`로 판정하고 있었는데, 실제 수익률을
정하는 `getProjectionAssetGroupKey`는 그 판정을 **전혀 보지 않고** `getRegionFallbackRateKey`
("국내면 KOSPI, 해외면 S&P500")를 썼다. 즉 Phase 40-C가 만든 성격 계층이 계산에 연결돼 있지 않았다.

| 자산(override 없음) | 성격 판정 | 실제 적용 | 20년 과대 |
|---|---|---|---|
| KODEX 국고채3년 | BOND | KOSPI 7% | **+81.7%** |
| TLT (미국 국채 ETF) | BOND | S&P500 5.1% | +24.5% |
| TIGER 리츠부동산인프라 | UNRESOLVED | KOSPI 7% | - |

게다가 `assessReturnAssumptionStatus`는 이미 정확한 진단 문구를 만들고 있었는데 **어떤 UI에도 연결돼
있지 않았다**(저장소 전체 grep: 정의부 + 테스트 외 호출 0건). 문제를 아는 코드가 사용자에게 도달하지 않았다.

Phase 46은 감사(코드 변경 = SW bump + 테스트뿐)였고, PM이 7개 결정 항목 중 ①②③⑤⑥과 설명문 수정을
승인해 Phase 47-A에서 구현했다.

### Phase 47-A가 실제로 바꾼 계산 경로

`getRegionFallbackRateKey`를 **삭제**하고 그 자리에 `resolveRateKeyFromAssetCharacter()`(js/05)를 넣었다.

```
사용자 지정(override) → 동일 ticker 사용자 등록 → 카테고리 → 시스템 티커/별칭 → 이름 키워드
→ [신규] 자산 성격 → 그 성격의 Return Key → 지역·통화 검증 → 없으면 UNRESOLVED(성장 0%)
```

- `resolveAssetGroupKeyDetail`의 `source`: `regionFallback` **삭제**, `assetCharacter`/`unresolved` 신설
- 같은 함수를 **경로 B**(`getTargetProjectionRate` - MC adapter가 호출하는 함수)의 세 군데 지역 폴백과
  **표시 경로**(`resolveTickerToRateKey`)에도 적용 → 세 경로가 하나의 규칙을 공유한다
- `resolveProjectionRateForKey` / `getSystemDefaultRate`의 최종 폴백도 지역 대표지수 → **0**
  (이것이 BOND.STOCK 미결 사항을 닫았다 - 예전엔 같은 키가 국내 표기면 KOSPI, 해외 표기면 S&P500이었다)

**`UNRESOLVED`의 0%는 "수익률이 0일 것으로 예상한다"가 아니라 "적용할 근거 있는 가정이 없어 원금을
그대로 둔다"는 뜻이다.** 이 구분을 잃으면 안 된다.

**`CHARACTER_SOURCES_FOR_AUTO_RATE_KEY`**(js/05)가 자동 적용 허용 근거 목록이다:
`category / etfHoldings / nameKeyword / sectorMap / presetTicker / indexNameKeyword / domesticIndexName`.
**`individualStock`은 의도적으로 빠져 있다** - `classifyCategory`(js/01)의 마지막 줄이 아무 규칙에도
안 걸린 자산을 `'주식'`으로 되돌리기 때문에, 그 근거는 "개별 주식임을 확인했다"가 아니라 "정체를 모른다"와
구분되지 않는다(이름이 '블라블라'인 자산까지 KOSPI를 받고 있었다). **`classifyCategory` 자체는 건드리지
않았다** - 거기를 고치면 category가 바뀌어 Risk 대상 자산군이 달라진다.

### 삼성전자 Individual Alpha 폐지 (PM 승인)

세 프리셋의 `tickers['005930.KS']`(8.0/9.0/15.0)를 **삭제**하고 `resolveProjectionRateForKey` /
`getSystemDefaultRate`에 "`005930.KS` → KOSPI 앵커" 분기를 명시했다. 숫자를 복사하지 않고 앵커를
가리키므로 앞으로 두 값이 어긋날 수 없다. 새 Samsung 전용 Key는 만들지 않았고 시스템 Key는 16개 그대로다.

**구현 중 스스로 만든 버그를 발견해 고쳤다**: 처음 작성한 Samsung 분기가 `getCustomRate` 조회보다 앞에
있어, 삼성전자 수익률을 직접 설정해 둔 기존 사용자의 값(Golden 6/8/11)이 조용히 KOSPI로 덮이는 상태였다.
브라우저 실측에서 잡았고 e2e/46 테스트 10이 고정한다. **이 분기를 수정할 일이 생기면 custom 우선을 반드시 유지할 것.**

### 실측 영향 (일반적 시나리오, override 없는 신규 사용자)

| 자산 | 이전 → 이후 | 20년 변화 |
|---|---|---|
| KODEX 국고채3년 | KOSPI 7% → **BOND 4%** | −45.0% |
| TLT | S&P500 5.1% → 가정 없음 0% | −63.9% |
| 리츠/부동산 ETF | 7% / 5.1% → 0% | −75.2% / −63.9% |
| 혼합형·미등록 ETF | 7% → 0% | −75.2% |
| 삼성전자 | 9% → **KOSPI 7%** | −32.8% |

**Golden 사용자 영향 = 0.** 26개 자산 전부 `rateMatchOverride`를 갖고 있고, 13개 대표매칭 키 전부가
`customScenarioRates`에 등록돼 있다(브라우저 실측 불일치 0건).

### 🔴 다음 세션이 반드시 알아야 할 부작용

**`SECTOR_MAP`(js/09)에 없는 실재 개별주식이 이제 0%로 계산된다.** SECTOR_MAP은 국내 16종·해외 21종,
총 **37개**뿐이다. 파크시스템스(140860.KQ), POSCO홀딩스(005490), 대부분의 국내 중소형주가 여기 해당한다.
`블라블라` 같은 가짜 이름과 실재 상장주식을 앱이 구분할 수단이 현재 없기 때문이다(6자리 코드 형식은 존재를
보장하지 않고, `data/ticker-master.json`은 CDN에서 받아오므로 계산 경로에 쓰면 결과가 비결정적이 된다).

기존 사용자는 override가 있어 영향이 없지만, **신규 사용자가 개별주식을 등록하고 아무 설정도 하지 않으면
예측이 조용히 0% 성장으로 계산되며 이를 알려주는 UI가 없다.** `assessReturnAssumptionStatus`는 정확한
문구("성장 없이(0%) 계산하고 있습니다. 기준을 지정하면 그 값이 사용됩니다")를 만들지만 여전히 미연결이다.
**다음 Phase 최우선 후보** - ① 진단 문구 UI 연결 또는 ② SECTOR_MAP/티커 마스터를 성격 근거로 승격.
둘 다 PM 판단 사항이라 47-A에서 구현하지 않았다.

### 테스트

- `npm test` **179/179** · `eslint` **0** · Release Guard **PASS**
- 전체 e2e **421 통과 / 15 실패 — 신규 회귀 0건**
  - e2e/33 헤더 반응형 14건(알려진 환경 실패, 실행마다 6→11→14로 변동)
  - e2e/19 Case A 1건 — 격리 반복 **72회 중 1회**만 실패(직후 40/40 통과). 외부 시세 의존 플레이크
  - e2e/32(가독성)·e2e/36·e2e/40은 이번 실행에서 전부 통과
- 신규 `e2e/46-phase47a-calculation-path.spec.js` **17/17**, `e2e/45-phase46-return-policy.spec.js` **19/19**
- **Mutation test**: 지역 폴백 부활 → **15건 실패**, 삼성 8/9/15 복원 → **4건 실패**,
  `individualStock` 자동 적용 허용 → **5건 실패**. 되돌리면 전부 재통과
- 커밋 1은 그 시점 코드로 82/82 통과하도록 e2e/45를 Phase 46 형태로 커밋했고, 커밋 2가 코드와 함께
  4개 테스트를 새 정책으로 갱신했다(각 커밋이 독립적으로 green)

### 미결 / 손대면 안 되는 것

- **`e2e/45`·`e2e/46`의 기대값을 PM 승인 없이 고치지 말 것.** 이 파일들이 깨진다면 테스트가 낡은 것이
  아니라 누군가 정책을 바꾼 것이다.
- `recommendReturnAssumptionKey` / `assessReturnAssumptionStatus`의 UI 연결은 **PM 승인 사항**이다.
- Phase 46 감사에서 남긴 backlog: 미등록 국내 대표지수 ETF(KODEX 200TR 등) `ETF_HOLDINGS_MAP` 보강 ·
  BOND의 국고채/회사채 분리 · KOSDAQ "전용 가정 없음" 표시 · DEV_EX_US 한국 포함 이중계상 ·
  μ(미래 가정)와 σ(과거 실현변동성)의 성격 차이 UI 설명 · `US_BOND` Key 신설 필요성 · KRW/USD Cash 구조.
- `.claude/launch.json`은 이번에도 로컬 scratchpad 경로라 **커밋하지 않았다**(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 45: 혼합형/현금 분류 하드닝 + 삼성 Alpha 영향분석 **V1.1 v212 유지**

**커밋** `b628554` "fix: stop mixed-asset and cash misclassification in return assumptions" — push 완료.
**수익률 숫자 변경 0건 / 사용자 데이터 변경 0건 / 계산 공식 변경 0건.**
바뀐 파일은 `js/05-future-projection.js`(+28줄)과 신규 `e2e/44-phase45-mixed-and-cash.spec.js`(12 테스트) 둘뿐이다.

### 무엇을 고쳤나 (P0 2건)

**P0-1 혼합형 상품이 채권으로 판정되던 문제** — `resolveAssetCharacter`(js/05) 맨 앞에 혼합형 차단 단계(0단계)를
넣었다. `MIXED_ASSET_NAME_KEYWORDS = ['혼합', '주식+채권', '주식 + 채권', '채권+주식', '채권 + 주식']`에 걸리면
즉시 `UNRESOLVED`(source `'mixedAssetName'`)를 돌려준다. `'혼합'` 한 단어가 채권혼합·채권혼합형·주식혼합·혼합형을
전부 덮으므로 중복 키워드는 넣지 않았다.

**왜 1단계(카테고리)보다도 앞인가** — 혼합형을 단일 자산군으로 미는 경로가 셋이었다.
① 3단계 이름 키워드: `BOND_KEYWORDS`의 `'채권'`이 `'채권혼합'`에 걸린다.
② 1단계 카테고리: 티커 없는 `'채권혼합형 펀드'`는 `classifyCategory`(js/01)가 같은 `BOND_KEYWORDS`로
   category를 `'채권'`으로 자동 확정하므로 3단계에 닿기도 전에 BOND가 된다.
③ 5단계 지수 이름: `'TIGER 미국테크TOP10채권혼합'`의 `'미국'`을 보고 US_EQUITY가 될 수 있다.
세 경로를 한 번에 막으려면 0단계여야 한다. **`classifyCategory` 자체는 건드리지 않았다** — 거기를 고치면
category가 바뀌어 `RISK_ELIGIBLE_CATEGORIES` 대상 자산이 달라지고 위험점수가 움직인다(e2e/44 테스트 D가
"category는 여전히 '채권', character만 UNRESOLVED"를 고정한다).

**P0-2 `getSystemDefaultRate('CASH')`가 미국 주식 값을 돌려주던 문제** — CASH/CASH.USD가 어느 분기에도
걸리지 않아 마지막 지역 폴백까지 흘러내려 4.1/5.1/6.0(S&P500)이 나왔다. `if (key === 'CASH' || key ===
'CASH.USD') return 0;`을 KOSDAQ 분기 바로 뒤에 추가했다. 새 수익률을 만든 게 아니라 앱이 이미 확정해 둔
현금 정의(`resolveProjectionRateForKey` line 280, `getTargetProjectionRate` 모두 0%)를 한 곳 더 적용한 것이다.

### 폭발 반경 — 왜 계산 결과가 하나도 안 바뀌는가 (구조적 보장)

- `resolveAssetCharacter`의 호출자는 **`recommendReturnAssumptionKey`와 `assessReturnAssumptionStatus` 둘뿐**이고,
  **그 둘은 아직 어떤 UI에도 연결돼 있지 않다**(저장소 전체 grep 결과 정의부 + 테스트 외 호출 0건).
  즉 P0-1은 정책 계층만 고친 것이고, 지금 화면에 보이는 동작은 하나도 바뀌지 않는다. 이 계층을 UI에 붙이는 것은
  **별도 Phase의 PM 승인 사항**이다.
- `getSystemDefaultRate` 호출자 5곳 중 CASH가 도달할 수 있는 곳은 없다: 저장 핸들러(js/05:2646)·draft 빌더·
  `getSystemReferenceRates`는 전부 `SCENARIO_RATE_BASE_ROWS` 소속 키만 다루는데 **CASH는 base row가 아니다**
  (16개 base row: BOND, 부동산, KOSPI, KOSDAQ, 005930.KS, S&P500, SCHD, NASDAQ, DEV_EX_US, EMERGING,
  MSFT, GOOGL, AAPL, AMZN, META, NVDA). CMA 자동입력부는 `preset.tickers` 키만 받는다.
- 엑셀 export(js/12)는 **저장된 override 원본값만** 쓰고 `getSystemDefaultRate`를 보지 않는다 → round-trip 무영향.
- Golden 사용자는 `CASH 2/3/4`, `CASH.USD 2/3/4`, `005930.KS 6/8/11`을 **직접 override**해 두었다(엑셀
  "수익률 관리 기준" 시트 18행 직접 확인). custom이 항상 우선하므로 Golden 계산 결과 변화 0.
- Golden의 혼합형 2건(`237370.KS KODEX 코리아배당성장채권혼합`, `472170.KS TIGER 미국테크TOP10채권혼합`)은
  둘 다 `rateMatchOverride = 'BOND.STOCK'`이라 성격 판정과 무관하게 기존 수익률을 그대로 쓴다.

### 🔴 다음 세션이 반드시 알아야 할 것 — Service Worker 캐시가 v212에 묶여 있다

로컬 브라우저로 검증하다 확인했다: `sw.js`의 `CACHE_NAME = 'smart-asset-manager-v212'`이고 `js/05-future-projection.js`는
APP_SHELL에 들어 있는 **cache-first** 대상이다. 실제로 SW가 등록된 상태에서는 수정 전 js/05가 계속 서빙됐고,
SW를 unregister + cache 삭제한 뒤에야 새 코드가 로드됐다. **Phase 43과 Phase 45의 js/05 변경분은 CACHE_NAME을
올리기 전까지 기존 사용자에게 도달하지 않는다.** 이 두 Phase 모두 사용자 화면 동작 변화가 없어서 급하지는 않지만,
정책 계층을 UI에 연결하는 Phase에서는 **반드시 CACHE_NAME + appVersionLabel을 함께 bump**해야 한다.
이번 Phase는 PM 지시에 버전 bump가 없어 **v212 그대로 두었다** — bump 여부는 PM 결정 사항이다.

### P1 삼성전자 Individual Alpha 영향 분석 (측정만 — 구현 안 함)

**Samsung 숫자는 하나도 바꾸지 않았다.** 시스템 기본값은 지금도 `005930.KS = 8 / 9 / 15`다.

| 항목 | 값 |
|---|---|
| Scenario A (현행) 삼성 시스템 기본 | 보수 8.0 / 일반 9.0 / 긍정 15.0 |
| Scenario B (KOSPI 연동 가정) | 보수 5.0 / 일반 7.0 / 긍정 11.0 |
| Alpha (A − B) | **+3.0 / +2.0 / +4.0 %p** |

20년 배수(월복리 `(1+r/12)^240`, 앱 `computeFutureValue`와 동일): 보수 4.93→2.71(−44.9%),
일반 6.01→4.04(−32.8%), 긍정 19.72→8.94(−54.7%). 10년 기준으로도 −25.8% / −18.0% / −32.7%.

- **Golden 사용자 영향 = 0.** `005930.KS`를 6/8/11로 직접 override해 두었기 때문에 시스템 기본값을 무엇으로
  바꾸든 계산이 달라지지 않는다(엑셀에서 직접 확인).
- **영향 받는 대상**: `005930.KS`에 override가 없는 사용자뿐. 신규 사용자가 삼성전자를 등록하고 수익률을
  손대지 않으면 KOSPI보다 높은 가정을 조용히 받는다.
- **정합성 문제**: 미국 개별 종목 키 6종(MSFT/GOOGL/AAPL/AMZN/META/NVDA)은 전부 US_EQUITY Anchor를
  **alpha 0으로** 상속한다(Phase 7-C~7-F 원칙: Expected Growth = Anchor, 종목별 프리미엄 임의 추가 금지).
  **시스템 alpha를 가진 개별 종목은 삼성전자 하나뿐이고, 그 +3/+2/+4 %p의 근거 문서는 없다**(legacy_approximation).
- **Implementation requires separate PM approval.** 이번 Phase는 측정만 했다. 어느 시나리오도 구현하지 않았다.

### 테스트 결과

- `npm test` (node --test): **179/179 통과**
- `npx eslint .`: 경고/오류 0
- `npx playwright test` 전체: **385 통과 / 15 실패** — 신규 회귀 0건. 실패 내역 전부 사전 존재 확인:
  - `e2e/33-phase28-header-single-row` 13건 — 이 환경의 알려진 헤더 반응형 실패(계속 기록돼 온 항목).
  - `e2e/36` 테스트 8 — 시드한 QQQM 자산의 `currentPrice`(55000)를 **실시간 시세 fetch가 295.41로 덮어쓰는
    레이스**. 이 PC는 외부 시세가 열려 있어 재현된다. 동일 조건 6회 반복: **수정본 4/6 실패, HEAD 기준선도
    4/6 실패**(동률) → Phase 45와 무관.
  - `e2e/40` Risk 카드 반응형 1건 — `getComputedStyle`이 `''`를 돌려주는(요소 detach) 레이스. 뷰포트가 실행마다
    바뀐다. 48회 반복: **수정본 1/48 실패, HEAD 기준선 5/48 실패** → 기준선이 오히려 더 자주 깨진다. Phase 45와 무관.
- 신규 `e2e/44-phase45-mixed-and-cash.spec.js` 12개 전부 통과. **변이 테스트**로 실효성 확인: 두 수정을
  동시에 무력화하면 **12개 중 8개가 실패**(A/B/C/D/G/I/J/K), 되돌리면 다시 12/12 통과.
- 실브라우저 검증(localhost:8643, SW 해제 후): 혼합형 2건 `UNRESOLVED(mixedAssetName)`, 순수 채권 ETF `BOND`,
  삼성전자 `KR_EQUITY`, TIGER 코리아배당다우존스 `KR_EQUITY`(Phase 43 회귀 없음), CASH/CASH.USD 시스템
  기본값 `[0,0,0]`이며 계산값과 일치. 삼성 `[8,9,15]` · KOSPI `[5,7,11]` · S&P500 `[4.1,5.1,6.0]` 불변.
  JS 예외 0건(콘솔 오류는 전부 외부 시세 CORS/404 — 알려진 환경 이슈).

### 다음 세션이 손대면 안 되는 것 / 미결

- **삼성 8/9/15는 PM 승인 없이 절대 건드리지 않는다.** 위 분석은 측정 결과일 뿐 결정이 아니다.
- `recommendReturnAssumptionKey` / `assessReturnAssumptionStatus`를 UI에 연결하는 작업은 **PM 승인 사항**이다.
  지금 연결하면 사용자에게 "확인 필요" 문구가 갑자기 쏟아진다.
- `assessReturnAssumptionStatus`는 UNRESOLVED 분기가 `isUserDefined` 검사보다 앞에 있어, 사용자 지정 키 +
  UNRESOLVED 성격 조합에서 `USER_DEFINED` 대신 `OK`를 돌려준다. UI 미연결이라 지금은 무해하지만 연결
  Phase에서 정리 대상이다(이번 Phase 범위 밖이라 손대지 않았다).
- `.claude/launch.json`은 이번에도 로컬 scratchpad 경로라 **커밋하지 않았다**(상시 규칙).

---

## 최근 세션 요약 (2026-09-07) — Phase 42 감사 + 43: 수익률 가정 투명성 + Character 버그 **V1.1 v212 유지**

**커밋** `e03b629` "feat: distinguish user-set and system reference return assumptions" — push 완료.
Phase 42는 감사(코드 0건), 43이 구현이다. **수익률 숫자·사용자 데이터 변경 0건.**

### 🔴 Phase 42 최대 발견 — 검증한 CMA가 실사용자에게 도달하지 않는다
Golden 실측: 사용자가 시스템 기본값을 **거의 전부** `customScenarioRates`로 덮어쓰고 있다.

| Key | 시스템(검증됨) | **사용자 실제값** |
|---|---|---|
| S&P500 | 4.1/5.1/6.0 | **6/9/11** |
| NASDAQ | 4.1/5.1/6.0 | **8/11/14** |
| SCHD | 4.1/5.1/6.0 | **6.5/9.5/11.5** |
| KOSPI | 5/7/11 | **4/6/9** |
| KOSDAQ | 5/7/11 | **4/8/12** (사용자는 이미 KOSPI와 분리해 씀) |
| 005930.KS | 8/9/15 | **6/8/11** (사용자가 더 온건) |
| CASH | 0/0/0 | **2/3/4** |

Vanguard 원문까지 검증한 US 5.1%는 이 사용자 화면에 **한 번도 나타나지 않았다**. 20년 배수로
2.767배 vs 6.009배(S&P500), 8.935배(NASDAQ). → Phase 43이 이 차이를 화면에 드러내도록 고쳤다.

### Phase 43 구현 2건
1. **투명성**: 수익률 관리 행에 `📝 사용자 설정값 적용` + `시스템 참고 가정: 4.1 / 5.1 / 6%`.
   - **사용자 값을 평가하지 않는다** - 위험/잘못/과도/낮추세요 같은 문구 금지(e2e/43이 고정).
   - **시스템 참고 가정이 실제로 있는 키에만** 참고값을 붙인다(`getSystemReferenceRates`).
     사용자 정의 키(BOND.STOCK 등)에 `getSystemDefaultRate`의 지역 폴백 값을 끌어오면
     **없는 근거를 지어내는 것**이라 줄 자체를 만들지 않는다.
   - 프리셋별 판정(`getUserOverriddenPresets`) - Phase 29-B "필드가 있으면 오버라이드" 유지.
2. **Character 버그**: `TIGER 코리아배당다우존스`가 이름 속 '배당다우존스'(SCHD 키워드) 때문에
   US_EQUITY로 판정되던 문제. **지수 브랜드 이름 ≠ 그 지수가 담는 시장.**
   `KR_UNDERLYING_NAME_KEYWORDS`(코리아/한국/KOREA/KRX/국내) vs `US_UNDERLYING_NAME_KEYWORDS`로
   기초지수 시장을 먼저 보고, **미국 표기가 함께 있으면 미국 우선**(TIGER 미국배당다우존스는 US 유지).
   성격 판정만 고쳤고 rateMatchOverride·적용 Return Key는 무변경.

### Phase 42 감사 결과 — 추가 발견 (전부 Finding, 미수정)
- **`BOND.STOCK`(채권혼합 3/6/9)이 구조가 전혀 다른 두 상품을 하나로 묶는다**:
  `KODEX 코리아배당성장채권혼합`(국내 배당주+채권) + `TIGER 미국테크TOP10채권혼합`(미국 테크+채권).
  주식 슬리브가 완전히 다른데 동일 가정. → DEFINITION_REQUIRED / SEPARATE_LATER
- **BOND / 부동산 정의 부재** → DEFINITION_REQUIRED (숫자 평가 이전 문제)
- 사용자 정의 키 실태: `0052D0.KS`(코리아배당다우존스 5/7/11) · `000660.KS`(SK하이닉스 5/10/15) ·
  `GOLD`(금 0/0/0, **사용 자산 0건**) — 개별종목 alpha가 비공식 관행화되어 있다.
- **한국 주식 CMA 3회 조사 실패** 확정(Vanguard/BlackRock/JPM/Amundi/Invesco/Schroders/
  한국투자신탁운용/국민연금). 추가로 **분류 충돌** 확인: FTSE=선진국, MSCI=신흥국.
- Bear/Base/Bull 폭: CMA 3키는 전부 [+1.0, +0.9]로 일관, legacy는 KOSPI [2,4]·삼성전자 [1,6]·
  BOND [0.5,1.5]·부동산 [2.5,2.5]로 제각각.

### 🔒 되돌리지 말 것
- 사용자 override를 "더 합리적인 시스템값"으로 자동 교체하지 않는다.
- 지역 폴백 금지(Phase 40-C)·신규 Key 2개(41-B)·성격 우선 판정 전부 유지.

### 🔴 다음 PM 결정 대기 (Phase 42 §7 우선순위)
P1: BOND/부동산/BOND.STOCK 정의 명문화 · 개별종목 alpha 정책 · Bear/Base/Bull 폭 규칙
P2: legacy APR 재변환 · US_BOND Key 신설 · KOSDAQ 분리
REJECT: Commodity/Crypto/US_SMALL_CAP/US_VALUE/US_GROWTH Key 신설, FX 모델

---

## 최근 세션 요약 (2026-09-07) — Phase 41 감사 + 41-B: 선진국ex-US/신흥국 Return Key 신설 **V1.1 v212 유지**

**커밋** `5a08615` "feat: add developed ex-US and emerging markets return keys" — push 완료.
Phase 41(감사)은 코드 변경 0건, 41-B가 구현이다. **기존 Key 숫자는 하나도 바꾸지 않았다.**

### 신규 Return Key 2개 (근거 확보된 것만)
| Key | 표시명 | Bear/Base/Bull | 원자료(Vanguard VCMM) |
|---|---|---|---|
| `DEV_EX_US` | 선진국(미국 제외) 주식 | **4.4 / 5.4 / 6.3** | 4.5~6.5% |
| `EMERGING` | 신흥국 주식 | **2.0 / 3.0 / 3.9** | 2~4% |

as-of 2026-06-30, 게시 2026-07-22, **nominal / geometric / total return / USD / 10년** (원문 직접 확인).
US_EQUITY와 동일한 VCMM 실행분이다.

### ⚠ 변환은 반드시 `cmaGeometricToAppRate()`를 쓴다
Phase 7-F가 US_EQUITY를 만들 때 손으로 계산한 식 `12×((1+g)^(1/12)−1)`을 함수로 옮긴 것이다.
**4.2/5.2/6.2를 넣으면 현재 코드의 4.1/5.1/6.0이 그대로 재현된다**(e2e/42가 고정).
새 CMA를 추가할 때 이 함수를 안 거치면 정책이 갈라진다. 원자료는 `CMA_RAW_RANGES`에 남긴다.

### 🔴 FTSE 분류 - 반드시 기억할 것
FTSE는 **한국을 선진국으로 분류**한다(2009년~). 따라서
- `EMERGING`(신흥국) 가정을 **국내 주식에 적용하면 안 된다** - 그 바스켓에 한국이 없다.
- Vanguard의 Developed ex-US(4.5~6.5%)에는 **한국이 포함**된다 → KOSPI의 간접 앵커가 된다.

### Phase 41 감사 결론 (숫자 변경은 전부 PM 대기)
- **US_EQUITY 4.1/5.1/6.0 → KEEP.** 원문 재확인 완료, 변환 검산 통과(±0.03%p 반올림 오차뿐).
  단 Morningstar 종합(다수 기관) US equity는 **3.5~5.5%** 로 Vanguard보다 낮다 - 앱 값이
  peer 대비 보수적이지 않다는 점은 정직하게 기록해 둔다.
- **KOSPI 5/7/11 → UNRESOLVED.** 직접 CMA를 끝내 확보하지 못했다(한국투자신탁운용 LTCMA는
  수치 비공개, 국민연금은 방법론만 공개). 다만 한국을 포함하는 유일한 앵커의 **상단이 6.5%** 라
  **Bull 11%는 그 1.7배**다. Bull부터 재검토 대상.
- **삼성전자 8/9/15 → HOLD.** 저장 15%가 실효 **16.08%** 로 적용되어 20년 **19.72배**,
  사용자가 "연 15%"로 이해한 16.37배와 **1억당 3.35억원** 차이. Base→Bull 간격이
  Bear→Base의 **6배**(US는 0.90배). 미국 "개별 종목 프리미엄 금지" 원칙과 정면 모순.
- **legacy 값 미변환 문제**: KOSPI 7.0 저장값이 실제로는 **7.229%** 로 동작한다. PM Q3 결정으로
  현행 APR 의미를 확정했고 숫자는 바꾸지 않았다.
- BOND/부동산 → WEAK_EVIDENCE / UNRESOLVED (정의 불명확이 숫자보다 먼저 문제).

### 🔒 되돌리지 말 것
- Golden 26자산에 신규 Key가 **자동 적용되지 않는다**(실측 0건). 기존 override는 그대로 존중하고
  성격과 어긋나도 NEEDS_REVIEW 표시만 한다.
- 지역 폴백 금지(Phase 40-C)는 그대로다. e2e/41의 VEA/VWO 단언만 NONE→정식 Key로 갱신했다.

### 🔴 다음 PM 결정 대기
1. 삼성전자 프리미엄 정책 / 2. KOSPI Bull 재검토 / 3. KOSDAQ 분리·통합
4. legacy 값 APR 재변환 여부 / 5. BOND 정의 확정(해외 채권 별도 Key 필요)
6. Commodity·Crypto·US Bond Key — **CMA 미확보라 숫자 생성 금지**
7. Benchmark 정비(Phase 39-B 이월) — 채권/원자재 가격지수가 앱에 없음

---

## 최근 세션 요약 (2026-09-07) — Phase 40-A/B/C: 수익률 가정 체계 감사 + 자산 성격 기반 Return Key **V1.1 v212 유지**

**커밋** `0a0dfbe` "feat: pick return assumptions by asset character, not by region" — push 완료.
40-A/B는 조사(코드 변경 0), 40-C가 구현이다. **수익률 숫자는 한 줄도 바꾸지 않았다.**

### ⚠ 무엇이 문제였나 — "모르면 그 지역 주식지수"
성격을 확인하지 못한 자산의 마지막 폴백이 `getRegionFallbackRateKey()`(해외→S&P500, 국내→KOSPI)라
자산 성격과 무관한 장기 수익률이 조용히 붙었다. **실측(수정 전)**: TLT/GLD/LQD/VWO/VEA/BTC → S&P500
5.1%, 국내 국고채 ETF(148070) → KOSPI 7%. 정작 Risk 엔진의 `ETF_HOLDINGS_MAP`은 TLT/IEF를
`{채권:1}`로 **이미 알고 있었는데** 수익률 경로가 그 정보를 전혀 안 봤다.

### 40-C 구현 — 전부 순수 추가(계산 함수 diff 0건)
1. **`resolveAssetCharacter(asset)`** — 새 분류 체계를 만들지 않고 기존 정보 재사용:
   `ETF_HOLDINGS_MAP` → `SECTOR_MAP` → `category` → `BOND_KEYWORDS`/`CASH_KEYWORDS`.
   **`classifyCategory`는 절대 건드리지 않는다** - 거기를 고치면 category가 바뀌어
   `RISK_ELIGIBLE_CATEGORIES`가 달라지고 **위험점수가 움직인다**. 성격은 그 위에 얹는 별도 개념이다.
   원자재/가상자산/신흥국/선진국ex-US 키워드도 `classifyCategory`가 아니라 이 함수에만 넣었다.
2. **`recommendReturnAssumptionKey()`** — `recommendRateMatchKey()`와 **별도 함수**. 매칭은 "어느 행에
   붙일 것인가", 가정은 "어떤 성장률을 적용해도 되는가"라는 다른 질문이다. **두 함수를 합치지 말 것.**
3. **`assessReturnAssumptionStatus(asset)`** — 기존 자산은 계산을 그대로 두고 상태만 판정(유예 정책).
4. **`getReturnAssumptionSourceInfo(key)`** — 기존 수익률 관리 행에 근거 상태 1줄(새 카드 없음).

### 📌 추천 실측 결과 (e2e/41이 고정)
| 자산 | 성격 | 추천 Key | 비고 |
|---|---|---|---|
| TLT / LQD | 채권 | **NONE** | 'BOND' 기준은 한국 국고채 근거라 해외채권에 자동 적용 안 함. 대안으로만 제시 |
| GLD | 금·원자재 | **NONE** | 쓸 수 있는 기준 없음 |
| VWO / VEA | 신흥국 / 선진국ex-US | **NONE** | 기준 없음 |
| BTC-USD | 가상자산 | **NONE** | 기준 없음 |
| 148070 국고채ETF | 채권 | **BOND** | KOSPI 아님 |
| QQQM / SPYM / SCHD / NVDA | 미국 주식 | 각각 전용 키 | 성격 확인 후 기존 매칭 로직으로 정확한 키 선택 |
| TIGER 미국S&P500 | 미국 주식 | S&P500 | **상장 시장이 아니라 기초지수를 따른다** |
| POSCO홀딩스 등 개별 국내주식 | 국내 주식 | KOSPI | 개별 지분증권이라는 **구조**를 본 것(지역 폴백 아님). ETF는 해당 안 됨 |

### 🔒 절대 되돌리지 말 것
- **지역만 보고 주식 Key를 붙이지 않는다.** `resolveAssetCharacter`가 UNRESOLVED면 추천은 NONE이다.
- **"적합한 Key 없음"은 정상 결과다.** 억지로 기존 Key에 끼워 맞추지 않는다.
- Portfolio Position(코어/수비수/미드필더/공격수)과 Risk Benchmark는 Return Key 선택에 쓰지 않는다.

### 40-A/B 감사에서 확인된 사실 (숫자 변경은 전부 보류)
- **MC median ≡ Deterministic 성장률** — 모든 r/σ에서 정확히 일치함을 실측 증명.
  `returnRate` 의미 = **연 명목 APR(월복리), total return, GBM median 연성장률과 동치**.
- **US_EQUITY 4.1/5.1/6.0은 유지 권장** — Vanguard 원문(geometric/nominal/total/USD) 확인,
  Case A 변환식 검산 통과(원자료 대비 ±0.03%p, 반올림 오차뿐).
- **14개 Return Key 중 9개가 완전 동일값**(US_EQUITY 4.1/5.1/6.0). KOSPI=KOSDAQ도 동일값.
  실질적으로 서로 다른 가정은 6개뿐이다.
- **legacy 값은 APR 변환이 안 됨** — KOSPI 7.0 저장값이 실제로는 연 **7.229%** 로 동작한다
  (삼성전자 긍정 15% → **16.08%**). PM Q3 결정: **현행 APR 의미로 확정, 숫자 변경 없음.**
- **삼성전자 8/9/15가 KOSPI보다 높다** — 미국은 "개별 종목 프리미엄 금지" 원칙인데 한국만 반대.
  PM Q2 결정: **변경하지 않고 NEEDS_REVIEW로 유지.**

### 🔴 다음 Phase PM 결정 대기
1. 채권/원자재/EM/선진국ex-US의 **실제 CMA 출처** — 확보 전까지 임의 숫자 생성 금지(Key만 정의됨)
2. 삼성전자 프리미엄 정책
3. legacy rate value 재검토
4. **Benchmark 정비(Phase 39-B 이월)** — 채권/원자재 가격지수가 앱에 없다(`^TNX`는 금리이지 가격지수 아님)
5. 신규 자산의 계산 경로 폴백 차단 여부 — 이번엔 추천 계층에서만 막았고 계산은 유예 중

---

## 최근 세션 요약 (2026-09-07) — Phase 39-B: Risk 결측 데이터 안전성 + beta 날짜 정렬 **V1.1 v212 유지**

**커밋** `fa54c27` "fix: treat missing risk data as unknown and align beta by date" — push 완료.
working tree에는 `.claude/launch.json`만 남는다(**항상 제외**). 정상 데이터 위험점수가 전혀 바뀌지
않아(아래 Golden 무변경) PM이 SW/버전 bump 없이 승인했다.

### 무엇이 문제였나 — "데이터 없음"이 "위험 없음"으로 읽히고 있었다
결측이 산술에 섞여 조용히 0이 되면 유한값처럼 보여서, `scoreFromBands`가 **가장 안전한 구간**을
돌려줬다. 코드에는 이미 `?? 50`(모르면 중립) 폴백이 있었는데 **도달조차 못 하는 구조**였다.

| 경로 | 이전 | 이후 |
|---|---|---|
| 손실위험 결측 | `Math.abs(mdd ?? 0)` → **20점(최저)** | `absOrNull()` → **50(중립)** |
| VaR/CVaR 결측 | 소스에서 **리터럴 0** | **null** (금액도 null → 화면 "데이터 부족") |
| hhi 결측 | `null * 100 = 0` → 20점 | `finiteOrNull()` → 중립 |
| 집중도 결측 | `?? 0` (이론 경로) | `?? 50` |
| portfolioBeta | 결측 종목을 **1.0으로 채움** → 35점 | **관측된 beta만 재정규화**, 없으면 null → 50 |
| correlation 결측 | `?? 40`("어느 정도 분산됨") | `?? 50` |
| `hasData` | `!!returns` (**종가 1개도 true**) | `returns.length >= 10` |

**⚠ 두 가지를 절대 다시 합치지 말 것**: 일반 Risk의 "관측 beta 결측"과 스트레스 시나리오의
`STRESS_ASSUMED_BETA = 1.0`은 의미가 다르다. 후자는 "시장이 그때처럼 급락하면 베타를 모르는 자산도
시장만큼 움직인다"는 **가정**이라 그대로 둔다(빼면 그 자산이 손실 0으로 빠져 과소평가된다).

### ⚠ 날짜 정렬 — 결측보다 위험했던 문제
`fetchDailyCloses()`는 **이미 `dates`를 돌려주고** 있었고 `js/15`에 `dateAlignedReturns()`도 있었는데,
**리스크 엔진만 그 날짜를 0번 쓰고** `slice(-n)`으로 "최근 N개를 그냥 나란히" 비교했다. 거래일이 다른
시장을 섞거나 한쪽 이력이 짧으면 **전혀 다른 날의 수익률이 짝지어져 그럴듯한 오답**이 나왔다.
- 실측: 종목 2025년 / 지수 2026년(겹침 0)인데 예전엔 **beta 1.1579**가 나왔다 → 이제 **null**.
- 새 데이터 공급도 새 프레임워크도 만들지 않았다 - `js/16`이 이미 쓰는 변환 패턴 + `js/15` 유틸 재사용.
- **날짜가 없는 시계열은 기존 방식으로 폴백**한다(구 캐시/테스트 fixture). 정확도가 올라갈 수 있을
  때만 올린다는 뜻이며, 덕분에 기존 Golden이 그대로 유지된다.
- `h.betaAligned` / `h.betaObservationCount`로 "몇 개의 공통 거래일로 계산됐는지" 확인할 수 있다.

### dataConfidence 감점 2종 추가 (계산 구조는 유지)
기존 3종(가격이력 35 / 섹터 20 / 수급 8) + **벤치마크 비교 불가 비중 최대 15** + **상관관계 계산 불가 10**.
**자산이 1개면 상관관계는 계산 실패가 아니라 성립하지 않는 개념이라 감점하지 않는다**(PM 확정 -
종목 1개의 문제는 집중도 위험이 이미 100점으로 잡는다). 최대 92 구조는 그대로다.

### 📌 Risk Golden — 정상 데이터 무변경 (재확인)
composite **66** · subScores **100/40/20/55/100/30** · **danger** · confidence **92** ·
beta 1.101037 · stress −37.905057 / −32.673129. **결측 경로만 바뀌었다.**

### 결측 경로 새 기준값 (테스트로 고정됨)
| 상황 | subScores | score | conf |
|---|---|---:|---:|
| 가격이력 전무 | 100/50/**50**/**50**/**50**/50 | **71**(이전 64) | **57** |
| benchmark만 없음 | market **50**(이전 35) | 62 | **77**(이전 92) |
| 단일종목 정상 | correlation **50**(이전 40) | 60 | **92**(감점 없음) |
| 2종목 상관 불가 | correlation 50 | 41 | **82** |
| 이력 10일 이하 | hasData **false** | — | **57** |

`hasData` 경계는 **수익률 10개 = 종가 11개**다.

### 테스트
- `test/risk-engine.test.js` **47건**(+10), `test/risk-rules.test.js` 23건 → Risk unit **70/70**
- `test/risk-sandbox.js`: `js/15` 로드 추가(`dateAlignedReturns` 때문), `datesFrom()` fixture 추가
- `e2e/40` 24건(+1) — 신뢰도 결측 라벨까지 고정
- Unit 전체 **179/179** · ESLint 0 · 전체 Playwright **315 passed / 22 failed**(전부 기존 환경)
- Mutation 검증: VaR 0 복원 → 2건 실패 / hasData 복원 → 2건 / 날짜 정렬 끄기 → 4건, 원복 후 전부 통과

### 🔴 이번에 하지 않은 것 (PM 확인 필요 - Phase 40)
**채권/원자재 benchmark로 쓸 가격지수가 앱에 아예 없다.** `INDEX_TICKERS`는 주식 지수 6개뿐이고
`^TNX`는 금리(수익률)이지 가격지수가 아니다. 새 티커를 정하는 것은 추측이 되므로 남겨 뒀다.
- **현재 mismatch**: `TLT` → SP500, `IEF` → SP500, `GLD` → SP500, `148070.KS` → KOSPI
- **다만 앱은 이미 성격을 알고 있다**: `ETF_HOLDINGS_MAP`의 `TLT`/`IEF`가 `sectorWeights {채권: 1}`로
  등록돼 있다. 즉 **Asset Character용 새 분류 체계를 만들 필요가 없고**, benchmark 지수만 정하면 된다.
  `GLD`/`148070.KS`는 아예 미등록(미분류 + 주식 지수).
- **시장 vs 개별자산 상대성과(Phase 41)는 구현하지 않았다** - benchmark가 정비되기 전에 만들면
  채권·금에서 "시장보다 크게 하락"이라는 틀린 진단이 나온다. PM 조건("benchmark와 날짜 정렬 기반이
  정상이라면")의 절반만 충족된 상태다.
- RSI/MA/52주 정책은 Phase 42 그대로 유지.

---

## 최근 세션 요약 (2026-09-06) — Phase 33~39-C: Risk/매크로 안전성 + Risk 회귀 테스트 기반 **V1.1 v212 유지**

**커밋 4개 (전부 push 완료, HEAD == origin/main == `ebba70c`)**
| hash | message | 내용 |
|---|---|---|
| `f06ccc0` | `fix: remove investment action directives from risk and macro briefing` | Phase 35 |
| `bfb01e8` | `test: add risk regression foundation` | Phase 38 |
| `65270e4` | `feat: clarify risk scope and separate plan check from risk score` | Phase 39 |
| `ebba70c` | `fix: enforce risk detail readability` | Phase 39-C |

working tree에는 `.claude/launch.json`만 남아 있다(**항상 커밋에서 제외**). SW/버전은 v212 그대로 -
계산 결과와 데이터 구조가 전혀 바뀌지 않아 PM이 bump 없이 종료 승인했다.

### 이 구간의 전체 흐름
Phase 33+34(감사) → 35(행동지시 제거) → 36(설계 조사) → 37(PM 정책 결정) → 38(테스트 기반) →
39(표시 개선) → 39-C(가독성). **조사 → 정책 → 테스트 → 구현** 순서를 PM이 고정했고, 그대로 지켰다.

### ⚠ Phase 35 — 앱은 투자 행동을 지시하지 않는다 (상시 정책)
`js/10`의 Risk/매크로 문구에서 매수·매도·손절·이익실현·비중조절·관망·분할매수 지시를 전부 제거하고
**"지금 어떤 상태인가 + 무엇을 함께 확인하면 되는가"**까지만 말하도록 바꿨다. 특정 종목/ETF 추천도
금지다(예전엔 QQQM/SPYM/TLT를 직접 권했다). 부정형("매도하지 마세요")도 결국 행동 지시라 함께 막는다.
- 사용자의 실제 목표비중을 모르는 상태에서 **"목표 비중 15% 이하"** 같은 숫자를 제시하지 않는다(2곳 제거).
- 매크로 3번째 칸: `guide`("대응 가이드") → `note`("참고"). 9개 규칙 전부 중립 서술로.
- **결측을 정상으로 표시하지 않는다**: 핵심 지표(VIX/원달러/미10년물/코스피)의 ①전부 결측 ②일부 결측
  (어떤 지표인지 명시) ③정상을 구분한다. 환율 결측 시 `0%(보합)`이 아니라 `조회 전`.
- 회귀 장치: **`e2e/39-phase35-no-action-directives.spec.js` (23건)** - 금지어 목록 + 특정 티커 +
  8개 시장 국면 전수 + 375/390/412/768 × Light/Dark. **이 목록을 약화시키지 말 것.**

### ⚠ Phase 38 — Risk 회귀 테스트 기반 (계산 변경 전 반드시 통과시켜야 하는 안전망)
`js/09`(Risk 엔진)와 `js/10`(Rule)의 **현재 동작을 Golden으로 고정**했다. 제품 코드는 0줄 변경.

- **`test/risk-sandbox.js`** — js/09/10에는 `module.exports`가 없다(브라우저 `<script>` 로드).
  소스에 export 블록을 덧붙이는 대신 **Node 내장 `vm`으로 원본을 그대로 실행**한다(새 의존성 0).
  로드 순서는 브라우저와 동일하게 **`01 → 07 → 09 → 10`** (js/07은 `ownerRank()` 때문에 필요).
  `fetch`를 차단하고 가격 이력은 `setDailyCloses()` fixture로만 주입한다 - 네트워크/현재 시세/환율/
  날짜에 의존하지 않는다. **주의 2가지**: ① vm에서 `const` 선언은 sandbox 프로퍼티가 안 되므로
  `state` 등은 BRIDGED 목록으로 globalThis에 얹는다 ② vm 객체는 realm이 달라 `deepStrictEqual`이
  값이 같아도 실패한다 → 테스트에서 `plain()`(JSON 왕복)으로 감싼다.
- **`test/risk-engine.test.js` (37건)** — 모집단/benchmark 현재 매핑/6대 subScore 구간/Composite
  가중치/Risk Level/dataConfidence/가구 합산/Edge/Golden.
- **`test/risk-rules.test.js` (23건)** — RSI14·MA·52주 −30%·거래량 2.0배 경계, 감지 목록 분류,
  Rule이 종합 점수에 미치는 영향.
- **여기 고정한 값은 "이래야 옳다"가 아니라 "지금 이렇다"**이다. 정책 변경 Phase에서 테스트가 실패하면
  그것이 영향 범위이며, **PM 승인 후에만** Golden을 갱신한다. 새 정책에 맞추려고 임의 수정 금지.

### 📌 Risk Golden (정상 데이터 - 임의 변경 금지)
표준 2종목 fixture: 삼성전자 가구 500만(신랑 300만 `005930` + 와이프 200만 `005930.KS`) + QQQM 연금저축 130만

| 항목 | 값 |
|---|---:|
| totalCur | 6,300,000 (현금 제외, 절세계좌 포함) |
| subScores | 집중 **100** · 변동성 **40** · 손실 **20** · 시장 **55** · 상관 **100** · 기술 **30** |
| **composite / level** | **66 / 위험(danger)** |
| dataConfidence | **92** (구조적 최대) |
| beta / 변동성 / MDD | 1.101037 / 16.315345% / −0.938095% |
| 스트레스 2020 / 2022 | −37.905057% / −32.673129% |

가중치 **25/20/20/15/10/10** · 극단가산 **90→+5, 95→+8** · Risk Level **0–40 양호 / 41–60 주의 / 61–100 위험**

### Phase 39 — Risk "표시"만 개선 (계산 0 변경)
1. **데이터 신뢰도**: `분석 신뢰도 86%` → **`데이터 충분`/`일부 데이터 부족`/`분석 제한`**.
   퍼센트가 "이 진단이 86% 맞다"는 정확도로 오해되던 문제. 구간(80/50)은 **새로 만든 게 아니라**
   원래 이 화면이 색을 고르던 기준을 `DATA_CONFIDENCE_BANDS` 한 곳으로 모은 것이다.
   숫자·사유·"최대 92" 한계는 `[i]` 툴팁에 남긴다. **`computeDataConfidence` 계산식 무변경.**
2. **가구 기준 명시**: `riskEligibleAssets()`에 owner 필터가 없어 처음부터 가구 전체를 합산해왔는데
   그 사실이 코드 주석에만 있었다. 기존 `riskScopeNote`(js/03) 한 줄에 "소유자 구분 없이 가구 전체
   합산"을 덧붙였다. **"신랑"/"와이프"/"부부" 표현은 쓰지 않는다**(e2e가 금지어로 고정).
3. **가격 위험 ↔ 계획 위험 분리**: 위험점수가 가격 변동만 본다는 점을 밝히고 목표 자산배분 차이는
   기존 [포트폴리오 구성] 탭으로 안내만 연결(`#riskPlanCheckBtn`, 기존 `switchTab` 경로 재사용).
   **목표비중 이탈을 Risk Score에 편입하지 않는다**(PM Q1 확정) - 모집단이 다르고(리스크 1,000만 vs
   리밸런싱 300만) 부호가 소실되며 목표를 하나 빠뜨린 것만으로 점수가 오른다.
4. **거래량 급증을 위험 감지 태그에서 제외**(PM Q3 확정): 방향이 없는 신호이고, 앱 스스로
   dataConfidence에서 "추정치"라며 8점을 깎는 지표다. **계산값(`volumeSpike`/`volMA20`/`lastVolume`/
   `flowSignal`)은 참고용으로 보존**한다 - 제거한 것은 태그뿐이다. 위험점수 영향 0
   (`computeTechnicalFlowRiskScore`는 태그가 아니라 `rsi14`/`trendLabel`/`flowSignal`만 읽는다).
- 회귀 장치: **`e2e/40-phase39-risk-display.spec.js` (23건)**.

### Phase 39-C — `.detail-btn` 가독성
Risk 카드의 [🔍 세부내용]이 공용 `.detail-btn`(10px)을 받아 14px 정책을 어기고 있었다. 이 카드는
`state.advancedRiskMetrics` 없이는 `hidden`이라 **외부 시세가 없는 테스트 환경에서 `e2e/32`가 한 번도
측정하지 못한 사각지대**였다. `index.html`에 **`#riskDetailBtn { font-size: 14px; }` 한 줄만** 추가.
**전역 `.detail-btn`은 건드리지 않는다** - KPI 카드 3개 + 리밸런싱 [비중조절] 2개가 함께 쓰며 실측으로
그 5개가 10px 그대로임을 확인했다.

### 다음 PM Roadmap (순서 고정 - 임의로 앞당기지 말 것)
1. **Phase 39-B** ← 다음 순서. 결측 데이터 처리 안전성. **분석 → 정책 제안 → 테스트 → PM 승인 → 구현**
   순서이며 승인 전 `js/` 수정 금지.
2. **Phase 40** benchmark 정비(채권/원자재). `beta`가 바뀌므로 **Golden 재확정 필수**.
3. **Phase 41** 시장 vs 개별자산 20일 상대성과(52주 −30% Rule을 여기에 흡수).
4. **Phase 42** RSI/거래량 정책 반영(RSI는 점수에서 제거 - PM Q2 확정).
5. 이후 backlog: 사용자 매도 기준 비교 / 투자 역할 자동 추천 / MC 결과 표현 정책.

### 🔴 미해결 - Phase 38에서 발견, Phase 39-B 대상 (수정 안 함)
1. **손실위험 결측이 "가장 안전"(20점)으로 계산된다** - `Math.abs(null) === 0`이라 MDD/VaR/CVaR가
   전부 없어도 최저 위험 구간을 받는다. 다른 요인의 결측 폴백(변동성 50 / 시장 50 / 상관 40)과 어긋난다.
2. **benchmark 결측이 신뢰도에 미반영** - beta가 조용히 `1.0`으로 대체되는데 confidence는 92 만점.
3. **correlation 계산 불가도 미반영** - 종목 1개면 `weightedAvgCorrelation = null`인데 confidence 92.
4. **가격 이력 10일도 `hasData = true`** - 1년치 전제 지표를 10일로 계산하며 "데이터 충분"으로 표시.

### 🟡 기타 backlog (Phase 36 조사 결과)
- 목표 미지정 종목의 **분모 오염**(실측 32.0% → 31.7%) - 이탈률을 Risk로 승격 전 선행 해결 필요
- benchmark mismatch 실측: **TLT/IEF/GLD → SP500, 148070.KS → KOSPI** (Phase 40)
- 환율 초기 기본값 1450 / 375px 매크로 라벨 잘림 4건 / COVID·2022 하드코딩 낙폭 출처 문서화
- `js/04` 리밸런싱 실행 가이드의 "매도"/"비중 축소 검토" 문구는 **의도적으로 유지**(PM Q4 확정) -
  앱의 시장 판단이 아니라 사용자가 세운 목표와의 산술 차이라 성격이 다르다.

### 알려진 환경 실패 (제품 버그 아님 - 매번 같은 24건)
- **외부 시세 이력 조회 실패 12건**: e2e/02·03·04·05×2·06·07×2·17·19·34·35
  (`가격 이력을 가져오지 못해` / `mcResultArea` 미표시). 샌드박스가 외부 네트워크를 막는다.
- **`e2e/33` 헤더 반응형 12건**: 환율 값 길이 의존. Phase 31에서 원본 코드로도 재현 확인.
- `e2e/18`은 간헐 flake(`browser.newContext ... closed`) - 격리 재실행하면 통과한다.
- **이 숫자들을 "제품 버그"로 보고하지 말 것.** 단, 새로운 실패가 생기면 반드시 구분해서 보고한다.

---

## 최근 세션 요약 (2026-09-06) — Phase 31(조사) + Phase 32: 포트폴리오 4개 포지션 복원 **V1.1 v212 유지**

**커밋**: `3bdc0fd` "feat: restore four portfolio positions" — **push 완료**(origin/main과 동일).
working tree에는 `.claude/launch.json`만 의도적으로 남아 있다(이 파일은 항상 커밋에서 제외한다).
SW/버전은 v212 그대로다(계산·자산 데이터 구조가 아니라 role 값 도메인만 바뀌어 PM이 bump 없이 종료 승인).

### 무엇이 문제였나
사용자의 실제 포트폴리오 전략은 **코어자산/미드필더/공격수/수비수 4개**인데, 앱은 '코어자산'과
'미드필더'를 `core_mid` 하나로 합쳐 저장하고 있었다. 그래서 위험자산 안에서 코어/미드/공격을 나눠
잡는 사용자의 목표비중 계획(예: 코어 50% / 미드 25% / 공격 25%)을 앱이 표현할 수 없었고, 사용자가
자기 엑셀을 올릴 때마다 **26건 중 12건의 포지션 구분이 매번 사라졌다**.

### 정식 포지션(복원 완료)
| 내부값 | 표시 | 비고 |
|---|---|---|
| `attacker` | 공격수 | 위험자산 |
| `core` | 코어자산 | 위험자산 |
| `midfielder` | 미드필더 | 위험자산 |
| `defender` | 수비수 | 안전자산 |
| `core_mid` | 코어미드필더 | **legacy 전용** - 신규 선택지 아님 |

`ASSET_ROLE_OPTIONS`(js/01)는 정식 4개만 담고, legacy는 `LEGACY_ROLE_CORE_MID`로 따로 둔다.
집계 키는 `emptyRoleWeights()`, 선택 <option> 목록은 `assetRoleSelectOptionsHtml()` **하나만** 쓴다
(js/04·05·06·07이 전부 이 두 함수를 공유한다 - 키 집합을 각자 하드코딩하지 말 것).

### ⚠ legacy `core_mid` 보존 원칙 (다음 세션이 반드시 지킬 것)
1. **`core_mid`를 코어자산/미드필더 중 하나로 자동 추정·분할하지 않는다.** 합쳐질 때 원래 정보가
   사라졌으므로 코드가 복원할 수 없다 - 추측하면 사용자의 투자 전략을 왜곡한다.
2. 복원 경로는 **① 사용자가 직접 선택 ② Golden Excel 재업로드** 두 가지뿐이다.
3. legacy 값은 읽기/표시/저장/Excel roundtrip 전 구간에서 **그대로 보존**한다.
4. 신규 입력의 정상 선택지로 `core_mid`를 다시 노출하지 않는다. 이미 그 값이 저장돼 있을 때만
   "코어미드필더(구분 필요)" 항목이 덧붙는다 - 목록에 없으면 select가 조용히 빈칸이 되어 저장 시
   기존 포지션이 날아간다(그래서 정적 <option>을 쓰지 않고 동적 생성으로 바꿨다).

### ⚠ 다시 도입하면 안 되는 파괴적 migration
`migrateCoreMidfielderRoleMergeOnce()`를 **제거했다**. 이 함수는 `state.assets[].role`,
`state.tickerRoles`, `rebalance targets`/`selectedStocks`, `monthlyContributionAllocation`,
`monthlyContributionByOwner[].allocation`, `taxAdvantagedPlan.allocationByOwner` **6곳을 한꺼번에**
`core_mid`로 덮어쓰는 1회성 마이그레이션이었고, 기기마다 플래그(`sam_role_core_mid_merged_v1`)로 돌았다.
남겨두면 **새 기기에서 백업을 복원할 때 복원된 4개 포지션을 다시 합쳐 없앤다.**
이런 형태의 일괄 role 재작성 migration을 어떤 이유로도 다시 만들지 말 것. (기기에 남은 플래그 값은
참조하는 코드가 없어 그대로 둔다.)

### Golden Reference 실측 검증 (실제 엑셀 재Import)
| 항목 | 결과 |
|---|---|
| 자산 수 | 26 |
| 공격수 / 미드필더 / 코어자산 / 수비수 | **10 / 6 / 6 / 4** |
| 대표매칭키 | 13종, 누락 0 |
| 수익률 관리 기준 | 18건 |
| 소유자 | 신랑 21 / 와이프 5 |
| 수량 0 · 매입단가 0 | 0건 · 0건(데이터 손상 없음) |

### 계산 로직은 건드리지 않았다 (Phase 31 조사 결론 유지)
role은 **표시·집계 전용**이며 계산 입력이 아니다. 코드 전수 확인 결과 `js/15~22`(MC 엔진/어댑터/
워커/컨트롤러/UI, inflation, Safety)에 `role` 참조 **0건**이고, `rateMatchOverride ↔ role` 결합도 **0건**이다.
`role`을 읽는 곳은 표시용 집계 2곳(`computeOwnerTargetRoleWeights`, `getTaxAdvantagedRoleBreakdown`)뿐.
**앞으로도 role을 μ/σ/correlation/target weight/future value 계산에 연결하지 말 것.**
부동산 legacy도 이번에 손대지 않았다(Phase 31 판정: 금융자산 계산에 영향 없음 → 유지).

MC Golden 완전 일치(허용 오차가 아니라 표시값 동일):
가구 12.95억 / 7.90억 · 신랑 7.77억 / 4.74억 · 와이프 5.18억 / 3.16억

### ⚠ False-green 교훈 — import/export·confirm 기반 테스트 공통 주의사항
Excel [덮어쓰기]는 `confirm('기존 데이터가 모두 삭제됩니다...')`로 한 번 더 확인받는데(js/12),
**Playwright는 dialog를 기본적으로 자동 취소(dismiss)** 한다. confirm이 취소되면 선택 모달의 Promise가
해결되지 않아 **import가 아예 실행되지 않는다.** 그런데 테스트는 "round-trip 후 값이 그대로"를
검증했기 때문에 **아무 일도 일어나지 않은 상태가 그대로 통과**했다(Phase 29-B `e2e/36` 9건과
Phase 32 `e2e/38` G/G-2가 여기 해당). `page.on('dialog', d => d.accept())`를 추가해 고쳤고, 실제
import가 실행되는 상태에서 25/25 통과를 다시 확인했다(제품 동작 자체는 원래 정상이었다).

**앞으로 지킬 것**:
- 파일 import/export, 데이터 초기화, 삭제처럼 `confirm/alert/prompt`가 끼는 흐름을 테스트할 때는
  **반드시 dialog 핸들러를 명시**한다(`on('dialog')` 또는 `once('dialog')` + `accept()`).
- "버튼을 클릭했다"가 아니라 **실제 state/localStorage가 바뀌었는지**를 단언한다. 클릭만 검증하는
  테스트는 조용히 거짓 통과한다.
- 참고로 기존 `e2e/20·21·24·25`는 이미 `accept()` + 실제 state 검증을 하고 있어 문제 없었다
  (`once('dialog')` 형태도 있으니 점검할 때 `on(` 만 grep하지 말 것).

### 테스트 결과(릴리스 시점)
- ESLint 0 / Unit **109·109** / 신규 `e2e/38` **16·16** / 실제 Excel roundtrip **25·25**
- 전체 Playwright(workers=1) **268 passed / 22 failed** - **"전체 통과"가 아니다.**
- 실패 22건은 전부 기존 환경 의존이며 **Phase 32 신규 regression 0건**:
  외부 시세(가격 이력) 접근 차단 11건 + 기존 환율 입력칸 클리핑(`e2e/33`) 11건.

### 다음 PM Roadmap (Phase 32 이후 - 기능 추가 먼저 하지 말 것)
1. **Phase 33+34 통합 객관 감사** ← 다음 순서
   - 시장현황 & 매크로 브리핑 감사
   - 보유종목 RISK 관리 감사
   - 두 기능의 관계 분석
   - 이후 사용자의 개인 매도 기준/리스크 관리 기준과 비교
2. 투자 역할(포지션) 자동 추천 - **위 감사 이후 별도 판단**. Phase 31 조사 결론상 근거는
   "같은 종목을 사용자가 이미 지정한 적 있음"(tickerRoles) 하나뿐이고, 대표매칭키·자산군·수익률·
   변동성 기반 추론은 Golden 데이터에서 반증됐다(KOSPI가 코어자산·미드필더 둘 다, BOND.STOCK이
   미드필더·수비수 둘 다에 대응) - 채택 불가.
3. Monte Carlo UX/정책 변경 논의는 별도 과제로 유지하며 33+34와 섞지 않는다.

---
## 최근 세션 요약 (2026-09-06) — Phase 30: 거래 입력 대표매칭키 추천 **V1.1 v212 유지**

**커밋**: `66b7eaa` "feat: add transaction rate match recommendation" — **push 완료**(origin/main).
SW/버전은 v212 그대로다(PM이 이번엔 bump 없이 종료 승인 - 필요해지면 sw.js CACHE_NAME과
index.html appVersionLabel을 함께 올린다).

### 무엇을 만들었나
거래를 입력할 때 앱이 대표매칭키 후보를 **제안**하고, 사용자가 [이대로 사용]을 누르거나 직접 고른
경우에만 자산의 override로 저장한다. **자동 확정은 하지 않는다** - 추천을 무시하고 저장하면 지금까지와
100% 동일하게(빈칸=계산 시점 자동판별) 동작한다.

### 핵심 설계 - 추천 엔진을 새로 만들지 않았다 (다음 세션이 반드시 지킬 것)
`getProjectionAssetGroupKey`의 8단계 판별 체인을 `resolveAssetGroupKeyDetail(asset)`로 추출해
`{key, source}`를 함께 돌려주게 했고, 기존 함수는 `.key`만 반환하는 얇은 래퍼가 됐다(순서·조건·반환값
전부 동일 - 순수 리팩터링). 추천은 **그 결과를 그대로 보여줄 뿐**이라 "추천값 == 자동판별값"이 항상
성립한다(`e2e/37` 8번이 이 동일성을 상시 고정한다). 판별 로직을 복사해 두 벌로 관리하면 언젠가
반드시 어긋나므로, **판별은 이 함수 한 곳에만 둔다.**

추천 입력은 `makeAsset()`으로 만든 probe를 쓴다 - 실제 저장될 자산과 완전히 같은 방식(카테고리/
국내해외 자동판별 포함)이라 추천값과 저장 후 실제 계산값이 어긋날 수 없다.

### 추천 가능/불가 정책 (`RATE_MATCH_RECOMMENDABLE_SOURCES`, js/05)
| source | 추천 | 이유 |
|---|---|---|
| customKey / customKeyword | O | 사용자가 "수익률 관리"에 직접 등록한 종목·키워드에 걸림 |
| presetTicker / tickerAlias | O | 시스템 기본 상품표 티커에 정확히 걸림 |
| nameKeyword | O | 국내상장 해외지수 ETF 이름 규칙(NAME_KEYWORD_RATE_MAP) |
| category | X | '채권'/'현금' 캐치올 - 종목 단위 근거가 아니고, 비워둬도 자동판별이 같은 값을 씀 |
| regionFallback | X | 근거가 하나도 없어 지역 대표지수로 대체된 것 - 추천하면 확실한 것처럼 오해된다 |

**"추천 없음"은 실패가 아니라 안전한 정상 상태다.** 종목명/브랜드/가격/수익률/역할을 보고 임의로
분류·추정하는 로직은 일절 넣지 않았다. 추측성 fallback을 만들지 않는다.

### ⚠ 함께 고친 기존 데이터 손실 버그 (PM이 "필수 데이터 보호 수정"으로 승인)
조사 중 실측 재현한 문제: **신규 거래를 저장하면 그 자산의 기존 대표매칭키/역할이 조용히 삭제됐다.**
```
저장 전: { override: "KOSPI", role: "attacker" }
→ 같은 자산에 매수 1건 추가(대표매칭 칸은 건드리지 않음)
저장 후: { }   ← 사라짐
```
원인: 신규 거래는 이 두 칸이 항상 빈칸인데 저장 핸들러가 빈칸을 "지워라"로 해석했다.
수정: 빈칸을 **"이번 입력에서 건드리지 않았다"**로 해석한다(js/06 `isEditingExistingTx` 가드).
수정 모드에서 비우는 기존 해제 경로는 그대로 유지된다(모달이 기존 값을 미리 보여주므로 "보고 비운"
의도가 분명하다). `e2e/37` 16·17번이 두 의미를 각각 고정한다.

### 구현 중 발견한 함정 (같은 실수 반복 금지)
안내 문구를 갱신하는 `refreshTxRateMatchRecommendation()`이 빈 선택칸에 기존 값을 자동으로 되채우게
했더니, 사용자가 값을 비우는 즉시 다시 채워져 **"해제"가 불가능**해졌다. → `opts.allowPrefill`를 도입해
**종목/소유자/계좌가 정해지는 순간에만** 채우고, 사용자가 select를 직접 조작했을 때(change)는 절대
채우지 않는다.

### UI (기존 거래 입력 모달 안에 통합 - 새 탭/화면 없음)
대표매칭 선택칸 **바로 아래** 안내 블록. 선택칸이 항상 실제 값이고 블록은 그걸 정하는 걸 도울 뿐이다
(핵심 선택값을 팝업에 숨기지 않았다).
- 추천 있음: `앱 추천: NASDAQ 100 (QQQM) 기준으로 계산합니다.` + [이대로 사용] 버튼
- 추천 없음: `자동으로 추천할 기준을 찾지 못했어요. 비워두면 계산할 때 시스템이 정하고, 원하면 위에서 직접 고를 수 있어요.`
- 기존 지정 있음: `이미 지정해 둔 기준이 있어 그대로 유지됩니다: …`

※ `.touch-target`은 `@media (max-width:639px)` 안에만 있어 768px에서는 적용되지 않는다 - 신규 버튼은
Phase 25 M-1 선례대로 폭 무관 `min-h-[44px]`를 썼다. 기존 전역 정책은 건드리지 않았다(backlog).

### 바꾸지 않은 것
deterministic/MC 계산 경로, MC engine/adapter, Safety, asset valuation, 거래 계산, Excel schema,
Cloud Sync schema, state schema(신규 필드 0개 - 추천값은 화면 전용 변수로 저장되지 않는다),
Phase 28-F A/B 동일성, Phase 29-A/29-B 계약.

### 테스트 (릴리스 시점 실측)
- ESLint 0 / Unit **109·109** / 신규 `e2e/37` **26·26**
- 전체 Playwright(workers=1) **251 passed / 23 failed** - **"전체 통과"가 아니다.**
- 실패 23건은 전부 기존 환경 의존 실패이며 **Phase 30 신규 실패는 0건**이다:
  12건 `e2e/33` 환율 입력칸 클리핑(값 길이 의존, 원본 코드에서도 재현됨),
  11건 외부 가격 이력 조회 불가(`가격 이력을 가져오지 못해 변동성을 계산할 수 없습니다`).
- MC Golden 동일: 가구 12.95억/7.90억, 신랑 7.77억/4.74억, 와이프 5.18억/3.16억.

### Phase 30 backlog
- `.touch-target` 전역 정책(639px 전용)과 768px 터치 타겟 기준의 정합성 정리
- `e2e/34`#8·`e2e/35`#10 시드를 외부 시세 비의존(이름에 "채권"이 들어가는 자산)으로 교체
- `e2e/33` 환율 입력칸 클리핑
- 투자 역할(포지션) 자동 제안 - **이번 범위 밖**, 분류 규칙을 새로 설계해야 하므로 별도 Phase 필요
- "대표매칭키" 용어 자체가 초보자에게 낯설 수 있음(이번엔 라벨 미변경, PM 판단 대기)

---

## 최근 세션 요약 (2026-09-06) — Phase 28 + 28-E/F + 29-A/B 릴리스 **V1.1 v211 → v212**

**커밋**: `abce28f` "release: V1.1 phase28-29 cma and data integrity" — **push 완료**(origin/main).
PM 판단으로 Phase 28 Header + 28-E/F + 29-A + 29-B를 **하나의 릴리스 커밋**으로 묶었다(마지막 커밋이
Phase 27이었고, index.html/js/05/js/12에 여러 Phase hunk가 섞여 있어 분리가 더 위험하다고 판단).

### ✅ 해결됨 — sw.js CACHE_NAME v211 → v212 (커밋 `26b95b9`)
Phase 28~29 릴리스가 index.html과 js 6개를 바꿨는데 `CACHE_NAME`이 v211 그대로여서, cache-first 정책상
**기존 사용자가 서비스워커 캐시의 구버전 화면에 갇히는 것을 이 세션에서 실제로 재현했다**(브라우저가 수정된
js를 계속 무시했고, SW 등록 해제 + `caches.delete('smart-asset-manager-v211')` 후에야 새 코드가 로드됨).
PM이 이를 backlog가 아닌 **Release blocker**로 판단해 별도 커밋 `26b95b9` "release: V1.1 v212 service worker
cache bump"로 처리했다 — **허용된 변경은 정확히 2곳뿐**이다: `sw.js`의 CACHE_NAME(v211→v212)과
`index.html`의 `appVersionLabel`(v211→v212). 캐시 정책/APP_SHELL/install/activate/fetch 로직과 Phase 28~29
코드는 일절 건드리지 않았다.

**검증 방법(다음에 버전 올릴 때 그대로 재사용할 것)**: 브라우저에서 SW 전부 해제 + 캐시 전부 삭제 후,
`caches.open('smart-asset-manager-v211')`에 stale 응답을 인위적으로 심어 "구버전 사용자" 상태를 만든 뒤
재로드 → ① v212 SW 등록·활성화 ② v212 캐시 생성 ③ **v211 캐시 자동 삭제**(activate 핸들러) ④ 캐시된
index.html이 stale이 아니고 v212 표기 ⑤ 신규 JS 로드(`getPendingCmaFields`/`findRateMatchOverrideForTarget`
존재) ⑥ 핵심 화면 렌더 ⑦ Phase 29-A 추천 UI·29-B Excel 진입점 존재를 순서대로 확인했다.

**버전을 올릴 때는 `sw.js` CACHE_NAME과 `index.html` appVersionLabel을 항상 같은 값으로 맞춘다**
(index.html 해당 줄 주석에도 명시돼 있다).

### Phase 28 — Header Utility 한 줄
환율 뱃지/다크모드/동기화/설정 4요소가 320~1440px 전 구간에서 한 줄을 유지한다. 동기화 버튼은 텍스트
대신 상태별 아이콘(`cloud-off`/`alert-triangle`/`refresh-cw`) + `aria-label`로 바꿔 색상 단독 전달을 없앴다
(`SYNC_BTN_PRESENTATION`, js/12). 회귀: `e2e/33-phase28-header-single-row.spec.js`.

### Phase 28-E — BOND/CASH 표준 키 연결
엑셀 "대표매칭(수익률연동키)"에 앱 표준 키(BOND/CASH/CASH.USD)를 적었는데 "수익률 관리 기준" 시트가
함께 올라오지 않으면, 예전엔 지역 대표지수 폴백까지 흘러내려 현금이 7%(KOSPI)로 계산됐다.
`resolveProjectionRateForKey`에서 기존 정책(BOND→채권 프리셋, CASH/CASH.USD→미등록 시 0%)을 그대로
따르도록 고쳤다. **새 수익률을 만들지 않았다.**

### Phase 28-F — 대표매칭키 경로 A/B 통합 (핵심)
수익률 해석에는 두 경로가 있다:
- **경로 A(자산 기반)**: `getProjectionAssetGroupKey` → `resolveProjectionRateForKey` — `asset.rateMatchOverride`를 본다.
- **경로 B(목표비중 기반)**: `getTargetProjectionRate` — 입력이 `state.rebalance` target이라 override를 **몰랐다**. 결정론 일반계좌 예측과 Monte Carlo 어댑터(js/16)가 둘 다 이 경로다.

`findRateMatchOverrideForTarget(target)`(js/05)을 신설해, target에 대응하는 **보유 자산을 지금 state에서
동적으로 찾아** 그 override를 경로 B에도 0순위로 태운다. ticker형은 정규화 티커, namedHolding형은 정규화
이름으로 매칭하고 `target.owner`가 있으면 그 소유자 자산을 우선한다(js/04 `expandRebalanceTargetsForComputation`와
js/16 pseudoTarget에 owner를 실어 보낸다).
**특정 키 이름을 코드에 하드코딩하지 않는다** — 사용자가 "수익률 관리 기준"에 어떤 키를 추가/수정/삭제하든
코드 수정 없이 따라간다. 회귀: `e2e/34-phase28f-rate-key-override.spec.js`(테스트 전용 키만 사용).

### Phase 29-A — 검증된 장기 전망(CMA) 추천
**핵심 계약: recommended ≠ active rate.** 사용자가 [적용]을 눌러야만 계산 기준이 바뀐다.
- `CMA_SOURCE_METADATA[anchor]`에 `recommended`(현재 5개 앵커 전부 **null**)와 `appliesToKeys` 추가.
  **출하 코드에 임의 수치를 넣지 않았다** — 사람이 원문을 검증해 승인 기준 9항목(출처/투자기간/자산군 정의/
  nominal-real/arithmetic-geometric/price-total/통화/장기 타당성/앱 성장률 정의 호환)을 통과시킨 값만 채운다.
- `getPendingCmaFields(key)`가 **필드 단위**로 후보를 고른다: 사용자가 이미 `customScenarioRates[key][preset]`을
  확정한 필드는 후보에서 제외 → **override는 절대 덮이지 않는다**. 판단은 draft가 아니라 커밋된 state 기준.
- UI는 기존 "수익률 관리" 모달 행에 배지 + 소형 팝업(`cmaRecommendationModal`)만 추가. 새 탭/화면 없음.
  [나중에]는 `state.projection.cmaRecommendationStatus[anchor].seenVersion`만 기록(계산 불변), [적용]만 커밋.
- 신규 state 필드는 `cmaRecommendationStatus` 하나뿐(하위호환 백필, 계산에 영향 없음). 클라우드 sync의
  `adoptRemoteRebalanceAndProjection`에도 추가했다(빠지면 기기 간 확인 이력이 사라진다).
- 회귀: `e2e/35-phase29a-cma-recommendation.spec.js`(추천 값은 테스트 중 런타임 주입, 출하 데이터 오염 없음).

### Phase 29-B — Excel round-trip override 의미 보존
**원인은 Export 한 곳이었다.** Import는 원래부터 정상(빈 칸=override 없음).
Export가 `getReferenceRate()`(오버라이드+시스템 기본값 합성 최종값)를 3칸에 **항상** 채워 넣어서,
자기 파일을 그대로 재업로드하기만 해도 시스템 기본값이 영구 override로 동결됐다(이후 기본값/추천 갱신이
반영되지 않는 원인).
→ **실제 저장된 원본 override만 기록하고, 없으면 빈 칸**으로 남긴다(`overrideOnly`, js/12). 명시적 `0`은
`undefined`와 구분되어 그대로 `0`으로 나간다. **Excel 컬럼 추가/변경 없음, Import 무변경.**
실측 예: NASDAQ에 `normal=5.8`만 override → `보수적(%)=""`, `일반적(%)=5.8`, `긍정적(%)=""`.
- **구형 파일 호환**: Import를 안 바꿨으므로 예전에 내려받은 파일(3칸 전부 채워진 형식)은 이전과 100%
  동일하게 동작한다(그 한계도 그대로). 개선은 **이번 수정 이후 새로 내보낸 파일부터** 적용된다.
- 회귀: `e2e/36-phase29b-excel-roundtrip.spec.js` — 실제 [엑셀 내보내기] 다운로드 → 실제 [엑셀 업로드]
  재주입으로 default-only / partial / full / 추천적용 / 추천미적용 / 타 커스텀키 / deterministic·MC 불변 /
  자산·거래 불변 / sync 구조를 검증한다.

### 테스트 상태 (릴리스 시점 실측)
- Unit **109/109 pass**
- Phase 29-B `e2e/36` **9/9 pass**, Phase 29-A `e2e/35` **12/13**(#10만 아래 환경 이슈)
- 전체 Playwright(workers=1) **226 passed / 22 failed** — **"전체 통과"가 아니다.**

### ⚠ 환경 의존 실패 2종 (제품 회귀 아님 — 고치지 말고 원인부터 확인할 것)
1. **외부 시세(가격 이력) 조회 불가 11건** (`e2e/02·03·04·05×2·06·07×2·19·34#8·35#10`).
   오류 문구: `instrument "..."(weight 100.0%)의 가격 이력을 가져오지 못해 변동성을 계산할 수 없습니다.`
   위험자산(주식/ETF, 그리고 **이름으로 채권 판정이 안 되는 namedHolding**)은 σ 계산에 가격 이력이 필요한데
   이 샌드박스는 외부 API가 막혀 있다(Phase 23-R 기확인). 세션 초반엔 통과했다가 후반에 실패했다 —
   네트워크 가용성에 따라 달라진다.
   ※ js/16은 namedHolding의 자산군을 **저장된 category가 아니라 이름**(`classifyCategory('', name)`)으로
   판정한다. 그래서 이름에 "채권"이 없는 채권 자산(`E2E34_MC자산`)은 위험자산으로 분류돼 가격 이력을 찾는다.
   → 백로그: MC 검증 테스트 시드를 이름에 "채권"이 들어가는 자산으로 바꾸면 외부 의존이 사라진다
   (`e2e/36`의 `E2E36_채권`이 그 방식이라 항상 통과한다).
2. **환율 입력칸 클리핑 11건** (`e2e/33`). 표시되는 환율 값의 길이에 따라 `scrollWidth > clientWidth`가 된다.
   **작업 트리 전체를 `git stash`로 되돌린 원본 코드에서도 재현**했다(오히려 19/20 실패) — Phase 28/29와 무관.

### MC Golden (Phase 28-F/29-A/29-B 전부 동일 — 변하면 안 되는 값)
가구 12.95억(실질 7.90억) / 신랑 7.77억(4.74억) / 와이프 5.18억(3.16억) — 채권 시드 기준.

### Phase 29 설계 문서(구현 안 한 것 포함)
- **외부 데이터 자동화 3단계**: ①자동 탐색/감지(앱 밖 스크립트로 "출처 페이지가 바뀐 것 같다"는 신호만 —
  숫자 추출·해석은 하지 않는다) ②전문가/PM 검증(사람, 자동화 불가) ③사용자 승인 후 적용(앱 내, 29-A).
  조사 결과 Vanguard/BlackRock/JPM/RA/국민연금 등 **신뢰 가능한 출처 전부 공식 API가 없고 PDF/웹페이지**다.
  자동 스크레이핑은 ToS·파싱 취약성·정의 오해석 위험으로 채택하지 않는다.
- **국내 자산군(KR_EQUITY/KR_BOND/REAL_ESTATE/CASH)** 은 `legacy_approximation`(source=null) 유지.
  임의 숫자를 넣지 않는다. "출처 미검증" 라벨 노출은 별도 승인 대상(미구현).
- **미구현 백로그**: 투자 역할 자동 제안(카테고리→역할 분류기 신규 설계 필요), 거래입력 화면의 대표매칭
  자동판별 미리보기(순수 표시, 기존 로직 재사용), 위 테스트 취약점 2종.

---

## 최근 세션 요약 (2026-09-06) — Phase 26(Monte Carlo Performance Audit) **V1.1 v211 유지**

**커밋**: `85a1e01` "perf: optimize monte carlo annual rebalance" — **push 완료**. **SW 버전은 v211 그대로다**(엔진 JS만 바뀌었고 APP_SHELL 밖 런타임 캐싱 대상이라 PM이 bump 없이 종료 승인).

### 결론 먼저
**사용자 체감 성능 문제는 없었다.** 기본 10K 엔진 0.5초, 50K 2.5초, 첫 진행률 표시 31~84ms, 취소 98~148ms. 다만 **측정으로 확인된 낭비 1건**이 있어 그것만 최소 수정했다.

### 무엇을 고쳤나 (2줄)
`runMonthlyPrecisionMC()`의 연 1회 리밸런싱이 호출마다 배열 3개를 새로 만들었다(`Array.from(balances)`, `Array.from(weight)`, 내부 `map`). 50,000회 실행이면 리밸런싱만 1,000,000번 → 배열 3,000,000개.
```js
// before
const rebalanced = rebalanceToWeights(Array.from(balances), Array.from(weight));
for (let i = 0; i < n; i++) balances[i] = rebalanced[i];
// after
let total = 0; for (let i = 0; i < n; i++) total += balances[i];
for (let i = 0; i < n; i++) balances[i] = total * weight[i];
```
**결과: 5K 358→270ms, 10K 654→513ms, 50K 3,198→2,552ms (-20~25%). 계산 결과는 288개 값 전부 정확 일치(tolerance 0).**
`rebalanceToWeights` 함수 자체는 preview 경로(`runAnnualPreviewMC`)와 export에서 계속 쓰이므로 **삭제하지 않았다.**

### 골든값 회귀 테스트 (앞으로 반드시 유지할 것)
`test/monte-carlo-engine.test.js`에 고정 seed(20260906) 골든값 테스트를 추가했다 — milestone 4개 × mean/P10/P25/P50/P75/P90 + goal probability를 `deepStrictEqual`로 고정한다.
- **tolerance를 넣어 통과시키는 것은 금지다.** 근사 비교를 허용하면 이 테스트의 존재 이유가 사라진다.
- 모델을 의도적으로 바꾸는 Phase에서만 기대값을 함께 갱신한다. 그런 의도 없이 깨지면 성능/리팩터링 변경이 계산을 훼손한 것이다.
- 실효성 확인 완료: 원본 엔진에서도 통과(최적화가 결과 중립임을 증명), `×1.0000001` 변조 시 5건 실패(무의미한 통과가 아님을 증명).

### 측정에서 확인된 것 (다음에 또 재지 않아도 되는 값)
| 항목 | 실측 |
|---|---|
| 전처리(adapter+correlation+PSD+Cholesky) | **0.5~2.1ms** — 캐싱 불필요 |
| Worker 전송 | input 850B / result 1.3KB / postMessage **0ms** — 병목 아님 |
| Progress | 40회(5K·10K) / 61회(50K), 첫 표시 31~84ms — 조정 불필요 |
| 결과 렌더링 | 4ms(정상) ~ 41ms(6x throttle) — 병목 아님 |
| Cancel | **98~148ms**, stale 없음, 재실행 정상 |

### 다음 세션이 알아야 할 측정 함정
- **CDP `Emulation.setCPUThrottlingRate`는 메인 스레드만 제한하고 Web Worker는 제한하지 않는다.** MC 엔진은 Worker에서 도니 이 방법으로는 저사양 기기를 흉내낼 수 없다(1x/4x/6x에서 엔진 3,198/3,312/3,307ms로 거의 동일, 렌더만 4.2/20.6/41.5ms로 스케일). **저사양 실기기 성능은 측정 불가로 남아 있다 — 추정하지 말 것.**
- **MC 동일성 하네스는 환율을 고정해야 한다.** USD 자산 평가액이 비동기 환율 갱신으로 흔들리면 목표비중 weight가 바뀌어 결과가 달라진다(첫 비교에서 실제로 겪음 — 제품 문제 아니라 하네스 결함). `state.exchangeRate` 고정 + 워밍업 adapter 호출 후 측정할 것.
- **Worker의 `shouldCancel` 훅은 mid-run에 발화할 수 없다.** Worker는 단일 스레드이고 시뮬레이션이 동기 루프라 실행 중 `CANCEL` 메시지를 처리하지 못한다. 실제 취소는 `js/18`의 `worker.terminate()`가 즉시 수행한다(실측 98ms). **정상 설계이며 고칠 필요 없다** — 코드만 보면 오해하기 쉬워 기록한다.

---

## 이전 세션 요약 (2026-09-06) — Phase 25(전체 입력 UI UX 표준화 + 미래예측 IA 정리) **V1.1 v210 → v211**

**커밋**: `5d11eef` "release: V1.1 v211 phase25 input ux investment plan" — **push 완료**(직전 `c71ed2d` 위에 이어짐). **V1.1은 이제 v211이다.**

### 이번 Phase의 한 줄 요약
사용자의 자산·투자계획·미래예측에 영향을 주는 **모든 입력을 draft 계약으로 통일**하고, 미래예측 화면의 "투자계획 / 가정 / 결과" 경계를 정리했다. 계산 모델·Safety 정책·state schema는 일절 건드리지 않았다.

### 확정된 입력 UI 표준 (앞으로 새 입력을 만들 때 반드시 따를 것)
```
기존값 → draft → 입력 → [취소] 폐기 / [확인] validation → state → persist → render
```
- **취소는 state와 localStorage를 절대 건드리지 않는다.** 화면 결과도 그대로다.
- **확인만이** validation을 통과한 뒤 state를 바꾼다. 값을 조용히 보정하지 않고 저장 자체를 막는다.
- 참조 구현: `monthlyContributionByOwnerDraft`, `rebalanceModalDraft`, `taxAdvantagedPlanDraft`(신규), `projectionAssumptionsDraft`(신규), `mcFeeRatesDraft`(신규).
- **즉시 적용 예외**(그대로 유지): 검색·필터·탐색용 select, MC 관점 세그먼트, 자동 갱신되는 환율/일간증감률, form submit + cancel 구조인 자산/거래 입력, 부모 draft가 전체를 지배하는 중첩 모달.

### 무엇이 바뀌었나
**P0 절세계좌 적립** — 예전엔 타이핑마다 state 변경 + `persistProjection()`이라 [닫기]로 되돌릴 수 없었다(같은 화면의 [적립금 설정] 팝업은 정확히 반대로 동작해 일관성도 깨져 있었다). `taxAdvantagedPlanDraft` + [취소]/[확인] + validation(배분합계 100% 초과 / 음수 금액·기간 / 납입주기)으로 전환했다. **팝업을 열기만 해도 계좌 기본값이 저장되던 것**도 함께 없앴다. 팝업 안 결과표는 draft로 계산해 **실시간 미리보기는 그대로 유지**된다(`simulateTaxAdvantagedOwnerGrowth(owner, preset, years, planOverride)` — Phase 24-B `ownerFilter`와 같은 "optional 인자, 생략 시 기존 동작" 패턴).

**P1 MC 운용보수** — dropdown → 팝업. **"미확인"과 "명시적 0%"를 글자로 구분**한다(색만으로 전달하지 않는다). `customFeeRates[key] === undefined` = 미확인이라는 데이터 모델과 Safety의 미확인 경고 semantics는 무변경.

**P1 인플레이션율** — 계좌와 무관한 전역 가정이라 "나의 투자계획"에서 분리해 미래예측 가정 팝업으로 이동.

**P2 IA** — `💰 일반계좌 설정` → **`💰 나의 투자계획`**. 매년 투자금 증가율을 [적립금 설정] 팝업으로 옮겨 "매달 얼마 / 몇 년 / 매년 얼마나 늘릴지"가 하나의 투자계획으로 읽히게 했다. **목표비중은 Portfolio에 그대로 둔다**(현재비중 비교·리밸런싱 실행 맥락이 거기 있다) — 미래예측에는 이동 링크만 뒀다.

**M-1 접근성** — 목표비중 모달의 role select(10px/25px), 비중 % 입력(34px), [종목 추가](34px), 국내/해외 split 입력, 취소/확인, 목표금액 미리보기(11px)를 44px / 12px 기준으로 맞췄다.

### 다음 세션이 반드시 알아야 할 함정 (Phase 24-B 항목에 추가)
- **`updateProjection()`은 이제 DOM이 아니라 state를 읽는다.** 예전엔 `inflationRateInput`/`contributionGrowthRateInput`의 DOM 값을 읽어 state에 되썼는데, 두 입력이 draft 팝업 안으로 들어가면서 **"취소해도 draft 값이 state로 새어 들어가는"** 경로가 됐다. 입력을 팝업으로 옮길 때는 이런 역방향 동기화가 남아있지 않은지 반드시 확인할 것.
- **새 모달은 `SWIPE_MODAL_IDS`와 `MODAL_CLOSE_FNS`(js/03) 양쪽에 등록해야 한다.** 한쪽만 등록하면 Android 물리 뒤로가기가 팝업을 못 닫고 "앱 종료" 경로로 빠진다(Phase 24-B에서 실제로 겪은 결함).
- **`.touch-target`은 `@media (max-width: 639px)` 한정이다.** 태블릿(768px)에서는 적용되지 않아 32px로 떨어진다 — 44px가 필요하면 `min-h-[44px]`를 명시할 것.
- **텍스트 크기는 컨테이너가 아니라 실제 innerHTML을 만드는 쪽에 있을 수 있다.** 목표비중 미리보기가 그랬다(컨테이너 클래스를 고쳐도 11px 그대로였음).
- Browser pane `document.hidden` 이슈와 cache-first SW 이슈는 아래 Phase 24-B 항목 참고(그대로 유효).

### 검증 결과 (v211)
ESLint 0 · Unit 108/108 · **Playwright 184/184** · SW Release Guard PASS(v211) · 375/390/412/768 × Light/Dark 16/16 · 가로 overflow 0 · 목표비중 모달 12px 미만 텍스트 0건(수정 전 6건).
**MC baseline 유지**: 가구 전체 P50 12.95억 / 실질 7.90억 / 목표확률 95% 초과 / milestone 6.44·8.19·10.34·12.95억, owner MC 신랑 7.77억 + 와이프 5.18억 = 12.95억 가산성 유지.

### backlog (PM이 "착수 금지"로 지정 — 임의 착수 금지)
1. Range Bar 제거 권장(milestone 표 마지막 행을 문자 그대로 중복, MC 결과 영역의 16.5% 점유)
2. Hero owner별 분해(계산 기반은 `simulateRebalancedPreset(preset, maxYears, ownerFilter)`로 이미 마련됨)
3. MC 안내 카드 7개 통합
4. MC 결과 자동 소거 개선(`js/05` `updateProjection`의 `resetMonteCarloUiToReady()` — 시세 자동 갱신이 10초 기다린 MC 결과를 지운다. **Phase 19-P1부터 있던 기존 동작이지 회귀가 아니다**)
5. `openExchangeRateModal()` 호출자 0개 확정 — PM 지시로 삭제하지 않고 유지 중
6. MC 목표금액 영속화(새로고침하면 사라짐)
7. 인플레이션 팝업 + MC fee 팝업 통합(PM이 이번엔 하지 말라고 명시)
8. **전역 `.touch-target`이 640px 이상에서 미적용** — 이번엔 목표비중 모달만 명시 보강했고, 앱 전체의 다른 touch-target 버튼은 태블릿/데스크탑에서 32px로 남아 있다
9. **`runAnnualPreviewMC`에 동일한 배열 할당 패턴** — UI가 쓰지 않는 preview 경로라 Phase 26에서 건드리지 않았다(병목 미확인 코드는 최적화하지 않는다는 원칙)
10. **저사양 Android 실기기 MC 성능 실측** — 위 "측정 함정" 참고, 현재 환경에서는 측정 불가
11. **Dashboard 상단 Utility 배치** — 환율 숫자/주야간 전환/서버 동기화/설정이 모바일에서 의도한 한 줄 그룹으로 보이지 않는다(PM 지적, 미착수)
12. **전역 가독성 정책** — 「절세계좌 현황」 타이틀을 모바일 최소 가독성 기준으로 삼고, 일반 UI 텍스트가 그보다 작아지지 않게 한다. 중요도는 작은 글자가 아니라 색상/명도/weight로 구분하고 핵심 숫자는 더 크게(PM 방향 제시, 미착수)
13. **금액 천 단위 구분자** — 표시 계층에서만 `1000000원 → 1,000,000원`. 계산/state 값은 변경하지 않는다(PM 지적, 미착수)

### 알려진 환경 이슈
`e2e/17`이 간헐적으로 `browser.newContext: Target page, context or browser has been closed`로 실패한다. `git stash` A/B 각 10회 측정 결과 **baseline 1/10 · Phase 25 2/10**으로 동일 오류 유형이고 표본 오차 범위다 — assertion 실패가 아니며 제품 회귀가 아니다. 단독 실행하면 11/11 통과한다.

---

## 이전 세션 요약 (2026-09-06) — Phase 23(Header 모바일 UX) + Phase 24(Owner별 Monte Carlo) **V1.1 v209 → v210**

**커밋**: `05e701a` "release: V1.1 v210 phase24b owner monte carlo" — **push 완료**(직전 `0bdda76`(v209 phase22) 위에 이어짐). **V1.1은 이제 v210이다.**

### 무엇이 바뀌었나

**Phase 23 (Header 모바일 UX)** — 설정 기어 wrapping + 1024~1099px overflow 해결.
근본 원인은 flexbox `min-width:auto`(자식이 콘텐츠 크기 아래로 안 줄어듦)와 **환율 뱃지가 데스크탑 폭에서 `sm:` 클래스 때문에 359px까지 커진다**는 점이었다. 1행에 억지로 밀어넣으면 Server Sync가 잘려서, PM이 명시 허용한 **의도적인 2행 구조**로 갔다 — 환율 뱃지가 단독 1행, 다크모드/서버동기화/설정이 2행, `min-[1200px]`부터 1행으로 합쳐진다. 모든 유틸 버튼 `w-11 h-11`(44px). Header의 "환율보기" 버튼은 제거하되 환율 숫자와 `#exchangeRateModal` 자체는 PM 지시대로 유지.

**Phase 24-B (Owner별 Monte Carlo)** — MC를 신랑/와이프/가구 전체 3관점으로 제공. 기본은 "가구 전체".
- **핵심 설계**: MC 코어 엔진 `js/15`는 **일절 수정하지 않았다**. 입력 생성 레이어에만 optional `ownerFilter`를 스레딩했다(js/19 → js/18 → js/16 → js/05). 인자를 생략하면 기존 동작과 **비트 동일**이 되도록 설계했고, `git stash`로 이전 코드를 복원해 실제로 A/B 실행 대조해 검증했다.
- **가구 전체 pooled 비중을 owner MC에 재사용하지 않는다** — `computeHouseholdTargetInstrumentWeights(ownerFilter)`가 ownerFilter가 있으면 `computeOwnerTargetInstrumentWeights(owner)`로 분기한다.
- Scenario 섹션: 기본 접힘 아코디언 + 절세계좌 유무에 따른 일반계좌/전체 자산 토글(`hasDistinctTotalAssetScenario()`)로 중복 표시 제거.
- 긴 MC 서두 설명은 **내용을 한 글자도 지우지 않고** 재사용 가능한 `#mcInfoModal` 팝업으로 이동.

### 최종 검증에서 발견해 함께 고친 결함 3건(전부 Phase 24-B가 만든 것)
1. 관점 세그먼트 비활성 버튼에 `aria-pressed` 누락 → 스크린리더가 3지선다로 인식 못 함.
2. 팝업 열기/닫기 컨트롤 44px 미달(ⓘ 32px, X 20×20px, 닫기 40px).
3. **`mcInfoModal`이 `SWIPE_MODAL_IDS`(js/03)에 미등록** → Android 물리 뒤로가기가 팝업을 못 닫고 "한 번 더 누르면 종료" 경로로 빠짐. `MODAL_CLOSE_FNS`에만 등록하고 이 배열을 빠뜨린 게 원인. **새 모달을 추가할 때는 두 곳 모두 등록해야 한다.**

셋 다 `e2e/29`의 test 11·12·13으로 고정했고, **test 13은 수정을 되돌리면 실제로 FAIL함을 확인**해 무의미한 통과가 아님을 입증했다.

### 검증 결과 (v210)
ESLint 0 · Unit 108/108 · **Playwright 152/152** · SW Release Guard PASS(v210) · 8개 뷰포트(375/390/412/768 × Light/Dark) 가로 overflow 0 / 터치 44px · 가구 전체 P50 12.95억·실질 7.90억·목표확률·milestone 4행이 이전 baseline과 동일 · **신랑 7.77억 + 와이프 5.18억 = 가구 전체 12.95억** 가산성 확인 · σ>0(합성 이력 주입, 삼성전자 σ=0.2118/VOO σ=0.1424)에서도 owner 격리 비트 동일 확인.

### 다음 세션이 반드시 알아야 할 함정 2가지
- **Browser pane이 `document.hidden=true`면 CSS transition이 t=0에 멈춘다.** 아코디언 높이가 0으로, 차트가 평평하게 측정되는데 **제품 버그가 아니다**. `*{transition:none!important}`를 임시 주입하고 측정하거나 Playwright(실제 가시 브라우저)로 확인할 것. `requestAnimationFrame`도 안 돌아서 rAF 루프를 쓰면 타임아웃난다.
- **Service Worker가 cache-first라 편집이 화면에 안 나타난다.** 브라우저 검증 전 매번 SW unregister + `caches.delete()` 후 reload할 것.

### backlog (PM이 명시적으로 "이번엔 건드리지 말 것"으로 지정 — 임의 착수 금지)
1. **Range Bar 제거 권장** — `mcRangeBarsArea`/`mcRangeBarsRealArea`(명목 99px + 실질 99px = 198px)가 milestone 표 마지막 행을 **문자 그대로 중복**하며 MC 결과 영역의 16.5%를 차지한다. 표는 같은 228px에 4시점 × 명목/실질을 담아 정보량이 4배다.
2. **Hero owner별 분해** — 계산 기반은 이미 마련됨(`simulateRebalancedPreset(preset, maxYears, ownerFilter)`).
3. MC 안내 카드 7개 통합.
4. **MC 결과 자동 소거 개선** — 시세/환율 자동 갱신 타이머가 `updateProjection()`을 부르고 그게 `resetMonteCarloUiToReady()`를 호출해, 사용자가 10초 기다린 MC 결과가 말없이 사라진다. `js/05:2178`. **Phase 19-P1부터 있던 기존 동작이지 Phase 24-B 회귀가 아니다**(git diff로 확인함).
5. **`openExchangeRateModal()` 호출자 0개 확정** — Phase 23-C Final의 Header 버튼 제거 결과. PM 지시로 삭제하지 않고 유지 중.

---

## 이전 세션 요약 (2026-09-06) — Phase 21(Full-System Deep Audit, 읽기전용) + Phase 22(V1.1 Hardening & Quality Sprint)

**커밋**: `release: V1.1 phase22 hardening` - PM 최종 승인 후 이 파일을 포함해 커밋·push됨(실제 해시는 `git log -1`로 확인). Phase 21은 읽기 전용 audit이라 별도 커밋 없이 Phase 22에 통합.

### Phase 21 - V1.0 v209 Full-System Deep Audit(읽기 전용, 코드 변경 없음)
Parts A~W 전체 audit 수행(UI 인벤토리/중복/용어/데드코드/State 정합성/Import-Export/Safety/모바일·다크모드/성능/테스트커버리지/보안 등). 코드 변경 0건, 임시 분석 스크립트(dead-code/DOM-orphan cross-reference)는 사용 후 삭제. Master Backlog(T-01~T-18)로 정리되어 Phase 22 작업 지시의 근거가 됨.

### Phase 22 - V1.1 Hardening & Quality Sprint(실제 구현, STEP 0~18)
Phase 21에서 찾은 항목 중 PM이 선별한 것만 구현. **계산모델/State 의미/Safety 임계값 변경 없음**(전부 bit-identical 재확인됨), 신규 기능 없음, 오직 dead-code 제거·표시 정합성·검증 강화·용어 통일만 수행.

1. **STEP 1 - Legacy Monte Carlo 완전 제거**: `js/05-future-projection.js`에서 미사용 레거시 MC 블록(~156줄: `createSeededRandom`/`runMonteCarloSimulation`/`renderMonteCarloSection`/`renderMonteCarloChart` 등, 현재 MC 엔진은 js/15~19가 전담)을 삭제. `computeTargetPortfolioVolatilityPct()`가 부수적으로 orphan화됐지만 PM 지시 범위 밖이라 보존.
2. **STEP 2 - 개별 dead code 6건 제거**: `getProjectionGroupLabel`+`PROJECTION_GROUP_LABELS`(js/05), `getAssetProjectionFeeRate`(js/05), `parseInputValue`(js/01), `getTotalLineColor`/`getTotalLineHaloColor`(js/11). `getGroupReturnRate`/`categoryReturns`/마이그레이션 함수는 PM 지시대로 보존.
3. **STEP 3 - targetLabel fallback 정합성 수정**: `js/04-rebalancing.js`의 `computeIndividualRebalanceGuide()`가 `t.label`만 쓰던 것을 `t.label || t.name || t.ticker || '(이름 없음)'`로 수정(`computePortfolioTargetSummaryRows()`의 기존 공식과 동일하게 통일) - name만 있고 label이 없는 타겟의 드릴다운 연결이 끊기던 버그 수정. 신규 e2e `e2e/23-phase22-step3-label-fallback.spec.js`(3개).
4. **STEP 4 - JSON append 오버셀 검증 추가**: `js/12-import-export-sync.js`의 JSON "추가하기" 모드에 Phase 13 Excel 업로드와 동일한 `findExcelOversellViolations()` 기반 원자적 거부를 적용(신규 `buildJsonImportOversellAlertMessage()`, js/06). 기존 append 정책(assets 병합/거래id 중복 스킵)은 무변경. 신규 e2e `e2e/24-phase22-step4-json-oversell.spec.js`(6개).
5. **STEP 5 - JSON 백업 라운드트립 회귀 테스트 추가**(코드 변경 없음, 테스트만): `e2e/25-phase22-step5-json-roundtrip.spec.js`(2개).
6. **STEP 6 - Assets 관점전환 세그먼트 컨트롤(Phase 18) 전용 회귀 테스트 추가**(코드 변경 없음): `e2e/26-phase22-step6-assets-segmented-control.spec.js`(3개).
7. **STEP 7 - Portfolio 드릴다운(Phase 17) 전용 회귀 테스트 추가**(코드 변경 없음, STEP 3 수정 검증 포함): `e2e/27-phase22-step7-portfolio-drilldown.spec.js`(3개).
8. **STEP 8 - MC 목표금액 입력에 `min="0"` 추가**(index.html `#mcGoalAmountInput`) - 음수 입력은 기존에도 `if (goalAmount > 0)` 게이트로 안전하게 무시되고 있었음을 먼저 실측 확인 후 진행한 순수 UI 어포던스 추가.
9. **STEP 9 - 용어 통일("기대수익률" → "기준 연간 성장률")**: `js/21-safety-layer.js`의 사용자 노출 문구(제목/메시지) 전부 통일, `js/05-future-projection.js`의 가정 리스트에 "현재 자산(일반계좌)" 라벨 명확화(범위 표기). **내부 함수명/변수명(`SAFETY_EXTREME_RETURN` 등)은 PM 지시대로 무변경**. `test/safety-layer.test.js`, `e2e/07-semantic-safety.spec.js` 어서션 동기화.
10. **STEP 10 - `#mcGoalArea` 위치 조정**: P50/실질가치 박스 직후·`#mcSafetyCritical` 이전으로 이동(기존 위치는 disclaimer 문단 뒤라 목표달성확률을 보기 전에 다른 텍스트를 먼저 지나야 했음).
11. **STEP 11 - Safety 그룹 카드 recommendation 중복 제거**: `js/22-safety-ui.js`의 `renderSafetyIssueGroupCard()`가 그룹 내 자산 수만큼 반복 출력하던 recommendation 문구를 카드당 1회만 표시하도록 수정(그룹 멤버 전체가 동일한 정적 문자열임을 확인 후 진행).
12. **STEP 12 - 고인플레이션 Safety 정책**: 근거 있는 임계값 기준이 없어 **구현하지 않음** - PM 정책 결정 필요 항목으로 backlog에 남김.
13. **STEP 13 - 모바일/다크모드 회귀 확장 검증**(코드 변경 없음, 검증만): 375/390/768/1024/1440px × Light/Dark 전수 확인. **신규 발견(미수정, backlog)**: 헤더의 환율뱃지/다크모드/서버동기화 버튼 그룹이 **약 1024px~1099px 구간**(Tailwind `lg:` 브레이크포인트 활성 직후, 1023/1100/1200/1440px는 전부 정상 - 직접 측정으로 경계 확인)에서 body 기준 최대 약 76px 가로 오버플로 발생. 원인: 이 구간 미만에서는 `w-full overflow-x-auto`가 컨테인하지만 `lg:`부터 `lg:w-auto lg:overflow-visible`로 전환되며 컨테인먼트가 풀리고, 이 flex item에 `min-width` 제약이 없어(전형적 flexbox `min-width:auto` 이슈) intrinsic content width(약 527px)를 그대로 요구해 부모 폭을 초과함. Phase 22 변경과 무관(해당 index.html 편집은 미래예측/MC 섹션에만 있었음). 헤더 전체에 영향을 주는 수정이라 STEP 13 범위를 벗어난다고 판단해 수정하지 않고 finding으로만 기록 - **P2, 예상 최소 수정 범위: 해당 div에 `lg:min-w-0` 한 줄(단, 헤더 전체 회귀 재확인 필요)**.
14. **STEP 14 - 신규 테스트 실효성 검증**: STEP 3/4의 신규 e2e는 `git stash`로 수정 전 코드를 복원해 실패함을 직접 확인 후 재적용(load-bearing 확인 완료).
15. **STEP 15 - Release/SW Guard 스크립트 추가**: `scripts/verify-sw-release.js`(신규, package.json 미연결) - CACHE_NAME/appVersionLabel 버전 일치 + APP_SHELL 파일 존재 여부를 기계적으로 검사. **주의**: 이 스크립트 검증 중 `git checkout -- index.html`을 실수로 실행해 STEP 8/10의 uncommitted 변경을 잠깐 날렸으나 즉시 감지하고 동일 내용으로 재작업 + 전체 회귀 재실행으로 복구 완료(사용자 개입 없이 자체 복구).
16. **STEP 16~18**: 이 섹션(문서화) + 최종 회귀(npm test 108/108, ESLint 0, Playwright는 아래 "E2E 인프라 이슈" 참고) + Before/After 비교(P50="12.95억"/실질 P50="7.90억"류 단일자산 결정론적·MC 시나리오 값이 STEP 1/2/10 전후 bit-identical, 실제 브라우저로 Dashboard→Assets→Transactions→Portfolio→Projection→MC 전체 여정 및 Safety 경고 렌더링 확인 완료).

### E2E 인프라 이슈(Phase 22 최종검증에서 근본원인 확인, backlog)
전체 Playwright 스위트(6 workers 병렬)를 연속 7회 재실행한 결과 6회는 123/123 PASS, 1회는 122/123(그 1회 실패한 파일은 `e2e/19-f1-mc-zero-asset.spec.js` - 애초 보고했던 `e2e/07`과는 **다른 파일**). 실패 지점은 항상 테스트 코드 실행 이전(`browser.newContext: Target page, context or browser has been closed`). 원인: `js/14-settings-boot.js:226`의 `refreshPricesAndRates()`가 모든 페이지 로드마다 Yahoo Finance/allorigins.win 등 실제 외부 API로 네트워크 요청을 보내는데(테스트 환경에서 CORS로 막히지만 요청 자체는 실제로 나감), 6개 워커가 동시에 이를 반복하면서 드물게 Chromium 프로세스가 죽는 인프라 레벨 이슈 - 특정 테스트의 assertion/로직 결함이 아니며 Phase 22 변경과 무관함(무작위로 다른 파일에서 발생하는 것이 그 증거). **완전한 결정론적 해결은 e2e 전역에 걸쳐 외부 API를 `page.route()`로 차단하는 테스트 인프라 변경이 필요하나, 이는 123개 테스트 전체의 실행 경로에 영향을 주는 광범위한 변경이라 Phase 22 범위(unrelated refactoring 금지) 밖으로 판단해 시도하지 않음.** retry 증가/skip/assertion 완화도 하지 않았음(PM 지시).

### Git 상태 - Phase 22 커밋 완료
수정: `index.html`, `js/01-core-state.js`, `js/04-rebalancing.js`, `js/05-future-projection.js`, `js/06-transactions.js`, `js/11-refresh-history.js`, `js/12-import-export-sync.js`, `js/21-safety-layer.js`, `js/22-safety-ui.js`, `test/safety-layer.test.js`, `e2e/07-semantic-safety.spec.js`, `CLAUDE_HANDOVER.md`(이 파일).
신규: `e2e/23~27-phase22-*.spec.js`(5개), `scripts/verify-sw-release.js`.
**`​.claude/launch.json`은 이번에도 로컬 전용(브라우저 프리뷰 툴이 자동 관리하는 dev-server 경로/포트 설정) - Phase 22 작업과 무관하게 세션 내내 변경돼 있었고 커밋에서 제외했다.**

### 다음 세션이 알아야 할 것
**V1.0 v209는 그대로 유지**(이번 Phase는 버전 bump 없음 - SW CACHE_NAME/appVersionLabel 무변경, `scripts/verify-sw-release.js` PASS 확인됨). STEP 12(고인플레이션 Safety 정책), STEP 13의 1024~1099px 헤더 오버플로(P2), 위 "E2E 인프라 이슈"는 **PM 승인 전까지 임의로 구현/수정하지 않는다** - 이 인계장을 읽었다고 시작하지 말 것.

---

## 최근 세션 요약 (2026-09-05, 계속 18) — Phase 20: Release Cache/Version Finalization (v208 → v209)

**커밋**: `0b60566` "release: V1.0 v209 cache version bump" - **push 완료**(직전 `d756f64` 위에 이어짐).
**V1.0은 이제 v209다.**

### 이번 세션에서 완료된 작업

Phase 19-Final(`d756f64`)까지의 변경(Excel oversell/IA P1·P2/다크모드 MC 보존 수정 등)이 **실제 기존 사용자에게 전달되는지**를 Service Worker/cache 관점에서 검증했다.

1. **핵심 발견(실제 브라우저 재현)**: `sw.js`의 fetch 핸들러는 동일 출처 앱 셸 파일에 대해 완전한 cache-first 전략을 쓴다(`caches.match(req)`가 있으면 네트워크를 아예 확인하지 않음). `CACHE_NAME`이 `v208`에서 전혀 바뀌지 않았으므로 브라우저의 기본 SW 업데이트 감지(스크립트 바이트 비교)가 새 install/activate 주기를 트리거하지 않는다 - 캐시에 `js/05-future-projection.js`의 옛(스텁) 내용을 직접 주입한 뒤 **일반 새로고침**(수동 unregister/캐시삭제 없이)만으로 재현: 최신 코드가 아니라 주입해둔 옛 콘텐츠가 계속 실행됨을 확인했다. 즉 **기존 v208 사용자는 Phase 13~19-Final의 모든 수정(Dark Mode MC 보존 수정 포함)을 영원히 받지 못하는 상태였다.**
2. **최소 수정**: `sw.js`의 `CACHE_NAME`을 `smart-asset-manager-v208` → `smart-asset-manager-v209`로 변경(+사유 주석), `index.html`의 `appVersionLabel`을 `v208`→`v209`로 갱신. **그 외 아무것도 건드리지 않음** - `APP_SHELL`(여전히 js/01~14만 포함, js/15~22는 미포함 - 기존 R-2 한계 그대로 유지), install/activate/fetch 로직, skipWaiting/clients.claim 전부 무변경(이미 올바르게 구성돼 있었음 - activate가 CACHE_NAME과 다른 이름의 캐시를 자동으로 지우는 로직을 직접 재현해 정상 동작 확인).
3. **검증**: 신규 사용자(빈 캐시) 정상 동작, localStorage(assets/rebalance/projection 등)는 SW 캐시와 완전히 별개 저장소라 이번 변경과 무관하게 보존됨을 확인. Phase 19-P1 P1 기능(다크모드 토글 시 MC 결과 보존) v209 환경에서 재확인 PASS.
4. **테스트**: npm test 108/108, ESLint 0 problems, Playwright 106/106(무변경 - 새 테스트 추가 없음, 코드 로직 변경이 없으므로).

### 다음 세션이 알아야 할 것

**V1.0은 이제 v209다** - `sw.js`/`index.html`을 다시 볼 때 이 버전 기준으로 판단할 것. `APP_SHELL`이 `js/15-monte-carlo-engine.js`~`js/22-safety-ui.js`를 포함하지 않는 것은 **의도적으로 그대로 둔 기존 한계**(이번 Phase는 cache/version 문제만 해결, APP_SHELL 재설계 아님) - 이 파일들은 fetch 핸들러의 런타임 캐싱(첫 요청 시 네트워크 후 캐시 저장)으로 결국 캐시되지만 install 시점에 미리 채워지지는 않는다. **앞으로 코드가 바뀔 때마다 CACHE_NAME을 함께 올리는 이 프로젝트의 기존 관행을 반드시 지킬 것** - 이번 Phase 20이 그 관행이 누락됐을 때 실사용자에게 실제로 어떤 영향이 생기는지 실측으로 확인한 사례다. `.claude/launch.json`은 이번에도 로컬 전용(scratchpad) - 커밋 대상 아님. `git pull`로 이 커밋을 받았는지 먼저 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-05, 계속 17) — Phase 13~19-Final: Excel oversell, V1.0 IA P1/P2, 통합 UX 검증, Dark Mode MC 보존 수정 (v208 유지, post-release stabilization)

**커밋**: 이 섹션 작성 직후 `release: V1.0 v208 post-release stabilization`으로 커밋·push 예정(아래 "다음 세션이 알아야 할 것"의 실제 커밋 해시로 갱신될 것). **버전은 v208 그대로 유지** - 이번 커밋은 신규 기능이 아니라 v208 위에 쌓인 버그 수정/IA 정리이므로 CACHE_NAME/appVersionLabel을 올리지 않았다. **주의**: 실사용자 브라우저에 이미 v208 Service Worker가 캐시돼 있다면 이번 변경(특히 Phase 13 Excel oversell 검증, Phase 19-P1 Dark Mode 수정)이 즉시 반영되지 않을 수 있다 - 필요 시 PM이 별도로 버전 bump 여부를 결정할 것.

### 이번 세션에서 완료된 작업(Phase 13~19-Final 누적, 하나의 커밋으로 정리)

1. **Phase 13 - Excel 대량 거래입력 초과매도 검증**(V1.1-M01 구현): `findExcelOversellViolations()`/`buildExcelOversellAlertMessage()`(js/06-transactions.js) 추가 - 엑셀 업로드 시 보유수량을 초과하는 매도가 하나라도 있으면 파일 전체를 원자적으로 거부(부분 반영 없음). 기존 `computePositionsAndRealizedPnL()`의 `Math.min()` clamp는 무변경. 신규 e2e `e2e/20-phase13-excel-oversell.spec.js`(4개).
2. **Phase 14/14-A/14-B - Legacy 감사 + N-1 수정**: "데이터 초기화" 핸들러(js/14-settings-boot.js)가 `monthlyContributionByOwner`를 `years:15`로 하드코딩하던 것을 신규 설치 기본값(`years:null`)과 일치하도록 `normalizeMonthlyContributionByOwner()` 재사용으로 수정. 신규 e2e `e2e/21-n1-reset-default.spec.js`(3개).
3. **Phase 15/16/16-B/16-C - V1.0 IA 설계**(코드 변경 없음): Dashboard/Assets/Portfolio/Future Projection/Monte Carlo 전면 재검토 후 P1(우선 구현)/P2(후속) 항목 확정.
4. **Phase 17 - IA P1 구현**: Dashboard(관리버튼 6개 → ⚙ 모달 통합, KPI 카드에 금융자산평가금액 보조줄+캡션 추가, 매크로 브리핑 아코디언화), Portfolio(목표비중 진단 카드에 실행 상세 드릴다운 추가 - 기존 계산 함수만 재사용), Future Projection(Hero "지금 계획대로면" 재구성, 미래예상자산 폰트 확대, Scenario/MC 구분 문구·구분선 추가), Monte Carlo(Safety를 critical/일반/INFO 3단으로 분리 - critical은 결과 바로 아래 상시 노출, 나머지는 상세보기 아코디언). 계산/State/Safety 판정 로직 전부 무변경(호출 위치와 표시 위치만 변경). 회귀 확인을 위해 기존 e2e 3개 파일(04/07/09)의 selector 진입 경로만 수정(assertion 의미는 무변경 - Phase 17 최종 검증에서 1:1 대조 완료).
5. **Phase 18 - IA P2 구현**: Assets(4개 독립 아코디언[전체/소유자별/국내해외별/자산군별]을 단일 목록 + 관점 전환 세그먼트 컨트롤로 통합 - `assetListViewMode`가 현재 관점만 기억하고 `renderTable()`이 그 하나만 계산·렌더링, 그룹핑 규칙 자체는 무변경), Dashboard(⚙ 모달 내부를 "데이터 관리"/"주의 - 되돌릴 수 없음"으로 시각 구분), Transactions(Excel 관련 3버튼을 헤더에서 하단 "Excel로 거래 관리" 아코디언[기본 접힘]으로 이동, 헤더에는 "거래 추가"만 남김). Excel oversell 검증(Phase 13) 로직은 완전히 보존, e2e 20의 진입 경로만 아코디언 오픈 클릭 추가.
6. **Phase 19 - 통합 UX 검증**(읽기 전용, 코드 변경 없음): Dashboard→Assets→Portfolio→Transactions→Future Projection→Monte Carlo 전체 흐름을 실제 브라우저(375/1440px, Light/Dark)로 검증. 데이터 연결(거래→자산→포트폴리오→예측→MC) 전부 정상. **P1 1건 발견**: 미래예측 화면에서 Monte Carlo 결과 확인 중 다크모드를 토글하면 결과가 리셋됨. 그 외 P2 5건/P3 3건은 아래 Backlog 참고.
7. **Phase 19-P1 - P1 수정**: 원인은 `darkModeBtn` 핸들러(js/14)가 차트 재도색을 위해 호출하는 `updateProjection()`(js/05)이 마지막에 항상 `resetMonteCarloUiToReady()`를 실행해 MC 결과를 리셋시키는 것. `updateProjection(preserveMcResult)` 매개변수를 추가(무인자 호출은 전부 기존과 100% 동일)하고 `darkModeBtn` 핸들러만 `updateProjection(true)`로 호출해 리셋을 건너뛰도록 수정. MC 결과 표시는 전부 Tailwind `dark:` 클래스 기반(캔버스/JS 색상 계산 없음)이라 DOM을 그대로 둬도 테마만 자동 재도색됨 - Light→Dark→Light 반복 시 `mcResultArea.innerHTML`이 바이트 단위로 완전히 동일함을 실측 확인. 신규 e2e `e2e/22-phase19-p1-dark-mode-mc-preservation.spec.js`(1개) 추가.
8. **최종 테스트**: npm test 108/108, ESLint 0 problems, Playwright 106/106(신규 e2e 3개 파일: 20/21/22).

### Backlog로 신규 기록된 항목(Phase 19 통합 검증에서 발견, 이번 세션에서 구현하지 않음)

**P2**:
- "기대수익률"(js/21 Safety 메시지) ↔ "기준 연간 성장률"(js/05 시나리오 카드) 용어 혼재 - Phase 6-C에서 시나리오 카드 라벨만 좁게 수정하고 Safety 메시지는 범위 밖으로 남은 결과.
- Monte Carlo 결과 화면에서 "목표 도달 가능성"이 P50 직후가 아니라 범위표(milestone table) 이후에 위치.
- Assets 상단 필터바("전체 소유자" 등, 차트 필터)와 자산 관리 카드 세그먼트 컨트롤("소유자" 등, 목록 그룹 전환)의 유사 명칭 중복 - 서로 다른 메커니즘인데 혼동 가능.
- Safety WARNING/INFO 카드 본문이 11px(배지 10px)로 앱의 핵심 숫자보다 작음.
- "미래 예측" 서브탭을 벗어났다가 되돌아오면(다크모드와 무관하게) MC 결과가 리셋됨 - `renderProjection()`이 `updateProjection()`을 무인자로 호출하는 기존 설계(의도된 동작으로 코드에 이미 주석돼 있음, Phase 19-P1에서는 다크모드 토글 경로만 수정하고 이 경로는 그대로 둠).

**P3**:
- Portfolio 진단 카드("비중 축소 검토")와 실행 가이드("-40,000,000원 매도")의 어조 혼재.
- 무티커(채권/현금) 자산의 "예상 매수/매도 수량"이 항상 "0주"로 표시되어 금액 조정과 모순돼 보일 수 있음.
- Safety "운용보수 미확인" 그룹 카드 내부에 동일 안내문이 자산 수만큼 반복 표시.

### 다음 세션이 알아야 할 것

**V1.0은 여전히 v208**(버전 bump 없음, 위 참고). 위 P2/P3 Backlog는 **PM이 우선순위를 결정하기 전까지 임의로 구현하지 않는다** - 이 인계장을 읽었다고 시작하지 않을 것. `.claude/launch.json`은 이번에도 로컬 전용 경로(scratchpad)라 커밋 대상 아님. `git pull`로 이 커밋을 받았는지 먼저 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-05) — Phase 9~12: 적립기간 기능, F-1 MC 자산0 수정, V1.0 Release(v208)

**커밋**: `1bf48a7` "release: V1.0 v208" - **push 완료**(직전 `5f292b6` 위에 이어짐).
**V1.0 Release Candidate = v208로 PM 최종 승인 및 Freeze 완료.**

### 이번 세션에서 완료된 작업(Phase 9~12 누적, 하나의 커밋으로 정리됨)

1. **적립기간(신규 납입 기간) 기능** - `monthlyContributionByOwner[owner].years`(null=제한없음/0=신규납입없음/N=N년)를 Deterministic(js/05)과 Monte Carlo(js/15~19, `contributionStreams`) 양쪽에 동일 의미로 반영. 옛 버전이 저장해 둔 기본값(`years:15`)은 최초 1회 null로 마이그레이션(기존 사용자 결과 보존).
2. **F-1 수정** - `computeHouseholdTargetInstrumentWeights()`(js/05)가 가구 전체 현재원금(grandTotal)이 0일 때 owner별 현재원금 대신 owner별 월적립금 총액을 가중치 기준으로 fallback(임의 instrument/50:50/현금 추가 없음, 기존 목표비중 구조만 재사용). Owner 조합(Case A/B/C/D) 전부 검증, `totalValue>0` 기존 경로는 완전히 동일(bit-identical) 유지.
3. **P1 수정** - `totalValue===0` 신규 사용자도 신규 적립금이 정상적으로 미래예측에 반영(회귀 없음).
4. **초보자 UX 개선** - 미래예측 탭 상단 히어로 요약 카드(현재자산/매달투자/N년후 예상자산), 가정 아코디언, "투자 기간"과 "적립 기간" 라벨 구분, Monte Carlo percentile을 "낮은 편/중간 수준/높은 편"으로 재표현, "월 적립금"→"매달 투자할 금액" 등 문구 순화.
5. **Service Worker cache/version bump(v207→v208)** - `sw.js`의 `CACHE_NAME`과 `index.html`의 `appVersionLabel`을 함께 올림(이 프로젝트 확립된 컨벤션). Release Preparation 단계(Phase 12)에서 이 프로젝트의 "코드 바뀌면 버전도 함께 올린다" 관행이 v207에서 누락된 것을 발견해 PM 승인 후 최소 수정으로 해결 - 실브라우저로 activate 시 구 캐시(v207) 삭제 + 신규 캐시(v208) 생성 + 최신 index.html/js 제공을 직접 재현·확인함.
6. **테스트**: npm test 108/108, ESLint 0 problems, Playwright 98/98(신규 e2e 8개 spec 파일: 11,13,14,15,16,17,18,19).

### Phase 프로세스(다음 세션이 알아둘 만한 특이 패턴)

이번 세션은 Phase 9(구현) → Phase 10(코드 수정 금지 최종 통합테스트) → Phase 10 Follow-up(F-1만 좁게 수정) → Phase 11(V1.0 Release Candidate 최종 검증, 코드 변경 없는 읽기 전용 감사) → Phase 12(Release Preparation, R-1 버전불일치 발견) → Phase 12 Follow-up(R-1만 최소 수정) → 최종 Commit/Push 순서로 진행됐다 - "발견한 문제를 그 자리에서 임의로 고치지 않고, PM 승인을 받은 뒤 범위를 좁혀 별도 단계로 처리"하는 패턴이 여러 번 반복됨.

### Backlog로 신규 기록된 항목(V1.1 이후 검토, 이번 세션에서 구현하지 않음)

- **UX-001 — 금액 입력 천 단위 콤마 적용 범위 통일**(2026-09-05 Phase 12 Legacy Audit에서 문구 정정됨 - 예전엔 "미구현"이라고 잘못 기록돼 있었음): `attachThousandsInputFormatting()`(js/01-core-state.js:647)가 실제로 이미 3곳에 적용돼 있다 - 절세계좌 적립설정 금액(js/05:1299), 월 적립금 총액(신랑/와이프, js/05:2581), 매수 검토 금액(js/10:1639). **누락된 곳은 `mcGoalAmountInput`(Monte Carlo 목표 금액) 1곳뿐**이다. 결과 표시 영역의 `toLocaleString()`은 계산 결과를 "보여줄 때"만 쓰이고 입력 UX와는 별개 함수. **V1.1 검토 시 필수 확인사항(사용자 명시, 여전히 유효)**: 단순히 `type="number"`→`text` 치환으로 바로 구현하지 말 것 - 금액/수량/비율/기간/소수점허용/음수허용/모바일입력/붙여넣기/커서이동삭제/validation/state저장값/계산엔진전달값/Import-Export영향을 각각 구분해서 먼저 설계 검토할 것. 화면 표시값과 내부 계산값을 분리하되 기존 계산 로직의 숫자 semantics는 변경하지 않는 것이 기본 원칙. 이번에도 구현하지 않음.
- **V1.1-M01 — F-3: Excel 대량 거래 업로드 초과매도 검증 누락**(우선순위 High, 2026-09-05 Phase 12 Legacy Audit에서 신규 발견, PM 승인 완료, 상태: Backlog/구현 전): 단일 거래 입력 모달(js/06-transactions.js:553, `computeCurrentHoldingQuantity` 호출)은 저장 직전 초과매도를 차단하지만, 엑셀 대량 업로드(js/06-transactions.js:245-339, `txExcelFileInput` 핸들러)는 이 검증을 거치지 않는다. `computePositionsAndRealizedPnL()`(js/06:18)이 `Math.min(tx.quantity, pos.quantity)`로 조용히 clamp하기 때문에, 거래내역 목록에 표시되는 금액(입력한 수량 그대로)과 실제 계산되는 실현손익(clamp된 수량 기준)이 어긋날 수 있다 - Node 스크립트로 재현 확인됨(보유100주에 1000주 매도 업로드 시 화면엔 ₩75,000,000 매도로 보이지만 실현손익은 100주 기준 ₩500,000만 반영, 경고 없음). **PM이 확정한 V1.1 기본 정책**: 초과매도 발견 시 (a) 자동으로 수량을 줄이거나 (b) 조용히 값을 바꾸거나 (c) clamp로 숨기는 방식이 아니라, **해당 거래 입력 자체를 거부하고 사용자에게 명확한 오류/경고를 제공**하는 방향으로 구현할 것. 계산 함수의 `Math.min()`은 이번에도 건드리지 않았음(V1.1 구현 시점에 다룰 것). 실제 구현 시 엑셀 행 순서에 따른 running balance(매수→매도→매수처럼 뒤섞인 순서)까지 반드시 고려해서 설계할 것.
- (기존 Known Limitation 유지, 재나열 안 함) F-2/F-5/I-5/I-6/R-2(SW APP_SHELL이 js/15~22 미포함)/`updateRebalanceResults()`가 `updateProjection()`을 직접 호출하는 테스트환경 전용 stale-DOM 타이밍 이슈.

### Phase 12 — Legacy Logic & Calculation Health Check (2026-09-05, CLOSED)

Release Preparation 단계였던 위 "Phase 12"(R-1 버전불일치)와는 별개로, V1.0 v208 Freeze 이후 V1.1 착수 전 별도로 진행된 **읽기 전용 감사**(코드 수정 없음, Commit/Push 없음). 자산관리/거래/리밸런싱/Price·FX/State·Persistence/Deterministic Projection legacy 전반을 추적해 F-3(위 참고)을 발견, PM이 🟢 Audit 완료 승인 + F-3을 P2/V1.1-M01(High)로 확정. **V1.0 v208 코드는 이 Audit 때문에 전혀 수정되지 않았고 Hotfix도 만들지 않음 - 그대로 유지.** 이 Audit 자체는 여기서 CLOSED.

### 다음 세션이 알아야 할 것

**V1.0 v208은 PM이 최종 Freeze한 Release Candidate다** - 새로운 개발 과제(V1.1-M01/UX-001 포함)는 이 인계장을 읽었다고 임의로 시작하지 않는다. **V1.1의 범위와 우선순위는 PM이 별도로 결정할 예정** - 그 결정이 있기 전까지 위 backlog 항목을 임의로 구현하지 않는다. `.claude/launch.json`은 이번에도 커밋 대상 아님. `git pull`로 이 커밋(`1bf48a7`)을 받았는지 먼저 확인. **참고**: 이 섹션(Phase 12 Legacy Audit 관련 내용)은 커밋되지 않은 로컬 수정일 수 있다 - `git status`로 CLAUDE_HANDOVER.md가 modified로 남아있다면, 사용자 승인 없이 임의로 커밋하지 말 것.

---

## 최근 세션 요약 (2026-09-04, 계속 16) — Phase 8: 포트폴리오·리밸런싱 UX 개선 (V207)

**커밋**: `b4294ed` "feat: improve portfolio target allocation UX (Phase 8)" - **push 완료**(직전 `711c4ea` 위에 이어짐).

### 완료된 작업

"포트폴리오 구성" 탭의 "신랑/와이프 목표 비중" 섹션 맨 위에 **클릭 없이 바로 보이는** "현재 vs 목표 한눈에 보기" 요약 카드를 신규 추가(`renderPortfolioTargetSummary`, js/04). 사용자가 실제로 설정한 목표 항목마다:

1. **현재 비중 / 목표 비중 표시** - "현재 10% · 목표 30%"
2. **부족/적정/초과 상태 표시** - 색상 배지(부족=파랑, 적정=초록, 초과=빨강), 판정 기준은 ±1%p(UI 표시 전용 상수 `PORTFOLIO_SUMMARY_PARITY_TOLERANCE_PCT`, Safety threshold와 무관)
3. **금액 차이 표시** - "약 2,000만원 부족/초과"
4. **목표 비중 합계 안내** - 지역별 "목표 합계 100% ✓" 또는 "90% - 100%가 되도록 조정해주세요"(기존 합계 검증 로직 재사용, 새 validation 체계 아님)
5. **초보자용 행동 안내** - "새로 투자할 때 이 자산을 조금 더 늘리는 방법을 생각해볼 수 있어요" 등 매매를 직접 지시하지 않는 부드러운 문구

### 기존 계산 재사용 / 변경 없음

`computeRegionTargetAmounts()`/`getRebalanceTotals()`/`computeIndividualRebalanceGuide()` 등 기존 리밸런싱 계산 함수는 전혀 수정하지 않고 그대로 호출만 함(새 계산식 없음). state/transaction schema 변경 없음. projection/Monte Carlo 영향 없음. 상태 판정은 반올림 전 원본값 기준, 반올림은 표시 문자열 조립 시점에서만 적용(`fmtNum(...,1)`).

### 모바일 UX 확인

375px 모바일 뷰포트에서 실제 스크린샷으로 확인 - 가로 스크롤 없이 카드가 정상 표시됨.

### 신규 E2E

`e2e/10-portfolio-target-summary.spec.js`(2개) - 부족/초과/적정 3상태 동시 검증(하나의 시나리오에서), 목표합계≠100% 안내 검증. state를 직접 세팅해 실제 보유자산 이름과 목표 항목 이름을 정확히 일치시키는 방식 사용(seedPortfolio 픽스처는 이름이 달라 이 카드 검증에 부적합해 별도 세팅 함수 작성).

### 테스트 결과

npm test 97/97 PASS · ESLint 0 problems · Playwright **25/25 PASS**(기존 23 + 신규 2).

### 향후 후보(이번 Phase에서 구현하지 않음, 별도 지시 필요)

- 역할(포지션)/가구 합산 기준의 유사 "현재 vs 목표" 요약(기존 "전체 포지션별 목표비중 분석" 카드와 중복 우려로 보류)
- KR_EQUITY/KR_BOND/REAL_ESTATE/CASH CMA 조사(Phase 7 계열에서 이미 보류 확정된 사항, 계속 유효)

### 다음 세션이 알아야 할 것

새로운 개발 과제는 이 인계장을 읽었다고 임의로 시작하지 않는다 - 사용자의 명시적 지시를 받은 뒤에만 진행. `.claude/launch.json`은 이번에도 커밋 대상 아님. `git pull`로 이 커밋(`b4294ed`)을 받았는지 먼저 확인.

---

## 최근 세션 요약 (2026-09-04, 계속 15) — Phase 7-G: 자산·거래 입력 UX 개선 (V207)

**커밋**: `def9c82` "feat: improve asset and transaction input validation UX (Phase 7-G)" - **push 완료**(직전 `c8adb21` 위에 이어짐).

### 완료된 작업

1. **자산 등록 입력 검증**(js/07) - 수량/매수단가가 0 이하일 때 조용히 저장되던 것을 `showToast`로 즉시 안내하고 저장을 막도록 함. HTML `min="0"`은 보조 힌트일 뿐이고, 실제 차단은 JS `quantityVal > 0` / `buyPriceVal > 0` 비교로 이뤄짐(직접 재확인 완료).
2. **초과매도 사전 차단**(js/06) - 신규 함수 `computeCurrentHoldingQuantity(owner, accountType, ticker, name, excludeTxId)`를 추가해, 매도 저장 직전 "지금 보유수량"을 계산하고 초과하면 차단. `computePositionsAndRealizedPnL()`은 전혀 수정하지 않음(완전히 별개의 경량 함수). 의미적 정합성을 Node로 직접 검증: 매수10→매도3→매수5(뒤섞인 배열 순서로 넣어도) = 12, 같은 날짜 tie-break(createdAt 순), excludeTxId로 "수정 중인 거래 자신 제외" 전부 정상 확인.
3. **금융 용어 초보자 설명 추가**(index.html) - "수량/좌수"→"지금 가지고 있는 개수", "매매단가"→"1개(주)당 가격", "총 실현손익"에 hover 툴팁("팔아서 확정된 손익").
4. **신규 E2E**(`e2e/09-asset-transaction-input-validation.spec.js`, 3개) - 실제 자산 등록/거래 입력 모달 UI를 직접 조작해 위 검증들을 확인. (참고: 기존 E2E는 전부 `seedPortfolio` 픽스처로 `state`를 직접 세팅해 이 두 모달 자체를 한 번도 실제로 거치지 않았음 - 이번이 이 두 폼에 대한 최초의 실제 E2E 커버리지.)

### 기존 계산 엔진 변경 없음

`computePositionsAndRealizedPnL()`/`syncAssetsFromTransactions()`/`makeAsset()`/`calcRow()`/transaction schema/state schema/projection/Monte Carlo - 전부 무변경. 이번 변경은 전부 "저장하기 전에 막는" UI 단계 검증 추가일 뿐.

### 테스트 결과

npm test 97/97 PASS · ESLint 0 problems · Playwright **23/23 PASS**(기존 20 + 신규 3).

### 다음 세션이 알아야 할 것

새로운 개발 과제(추가 UX 개선, 새 자산 분류 체계, AI 기능 등)는 이 인계장을 읽었다고 임의로 시작하지 않는다 - 사용자의 명시적 지시를 받은 뒤에만 진행. `.claude/launch.json`은 이번에도 커밋 대상 아님. `git pull`로 이 커밋(`def9c82`)을 받았는지 먼저 확인.

---

## 최근 세션 요약 (2026-09-04, 계속 14) — Phase 7~7-F: CMA Research/Design/Validation, US_EQUITY 실제 적용 (V207)

**Current Version**: V207
**Phase Status**: Phase 7-F Final Validation — **COMPLETE / APPROVED**
**커밋**: `90c9316` "fix: update US_EQUITY CMA to latest Vanguard VCMM 2026-06-30 figures (Phase 7-F Final Validation)" - **push 완료**(직전 `b99e974`(v213) 위에 이어짐).

### 개요

Phase 6 시리즈(투자모델 감사)에 이어, Phase 7(Research)→7-B(Architecture Design)→7-C(Anchor Spec 검증)→7-D(CMA Source 조사)→7-E(제품 방향 재정렬+실제 적용)→7-F(V207 Baseline 전수조사+CMA 원문 최종검증)까지 순차 진행. 핵심 산출물은 **"Region×Asset-Class Anchor→Security Default(무조정 상속)→User Override" 아키텍처**를 설계하고, 그중 **신뢰할 수 있는 원문을 실제로 확보한 US_EQUITY Anchor 하나만** 코드에 반영한 것.

### US_EQUITY CMA

- **Source**: Vanguard Capital Markets Model(VCMM), "Setting realistic expectations" 공식 페이지(https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html) — WebFetch로 원문 직접 확인(2회 재현).
- **As-of**: 2026-06-30(모델 실행), 페이지 게시/갱신 2026-07-22
- **Forecast horizon**: 10년 / **Currency**: USD / **Return type**: Total Return(원문 확인) / **통계적 정의**: Geometric returns, 10,000회 시뮬레이션(원문 확인)
- **Official range**: 4.2% ~ 6.2%
- **App 적용값**(Case A 변환식 `12×((1+R)^(1/12)-1)`, Node로 직접 계산 검증): **Conservative 4.1% / Normal 5.1%(range 중간값 5.2%의 변환) / Optimistic 6.0%**
- 반영 위치: `js/05-future-projection.js`의 `SCENARIO_RATE_PRESETS.*.indexRates.foreign` + 9개 tickers, `CMA_SOURCE_METADATA.US_EQUITY`(version:2)

### US_EQUITY Inheritance

S&P500 / NASDAQ / SCHD / MSFT / GOOGL / AAPL / AMZN / META / NVDA — **9개 전부 동일 Anchor 값을 무조정 상속**(개별 Alpha·NASDAQ premium·SCHD premium 없음, 코드로 확인됨). Volatility는 기존 설계 그대로 종목별 실측값(Yahoo Finance 종가) 사용 — Expected Growth와 Volatility는 계속 분리된 입력.

### Legacy Approximation(변경 안 함)

**KOSPI, 삼성전자(KR_EQUITY) / 채권(KR_BOND) / 부동산(REAL_ESTATE) / 현금(CASH)** — 신뢰할 수 있는 forward-looking CMA를 확보하지 못해(Phase 7-D/7-E/7-F 조사 결과) 기존 하드코딩 근사치를 그대로 유지. `CMA_SOURCE_METADATA`에 `status:'legacy_approximation'`으로 명시적으로 구분 기록됨.

### Important Architecture (V207 Baseline 재확인)

```
기존 개인 자산관리 대시보드
    ↓
자산 / 거래 / 적립 / 포트폴리오 / 리밸런싱
    ↓
Deterministic 미래가치
    ↓
Monte Carlo / Inflation / Safety
```

Monte Carlo/CMA는 기존 자산관리 구조 **위에 얹힌 후속 기능**이며, 이 세션에서 처음 작성한 `V207 CURRENT STATE & BASELINE REPORT`(Phase 7-G)를 현재 구조의 **공식 기준선(Baseline)**으로 간주한다. 향후 세션은 이 보고서를 먼저 참고할 것(대화 로그에만 존재, 별도 파일로 저장되지 않았음 — 필요 시 사용자에게 재요청 필요).

### 다른 변경사항(같은 커밋에 포함)

- `[수익률 관리]` 버튼을 일반 사용자 1차 동선에서 제거하고, "수익률 직접 조정(고급)" 저시인성 텍스트 링크로 재배치(index.html) — 내부 메커니즘(`customScenarioRates`, `getTargetProjectionRate`, 키워드 매칭)은 완전히 유지.
- `test/safety-layer.test.js`에 기대수익률 임계값(20%/50%/100%, 음수 비대칭) 경계값 테스트 5개 추가.
- `e2e/08-custom-rate-override.spec.js` 신규 — Override가 Deterministic+MC 양쪽에 동일 반영되는지 확인.
- 회귀: npm test 97/97, ESLint 0, Playwright 20/20 — 전부 유지.

### 다음 세션이 반드시 지킬 것

**다음 개발 방향(KR_EQUITY/KR_BOND/REAL_ESTATE/CASH CMA 조사, Local AI, 추가 금융모델 등)은 이 인계장을 읽었다고 임의로 시작하지 않는다** — 사용자의 명시적 지시를 받은 뒤에만 진행. `.claude/launch.json`은 이번에도 커밋 대상 아님. `git pull`로 이 커밋(`90c9316`)을 받았는지 먼저 확인 — 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, 계속 13) — Phase 6/6-B/6-C: 투자모델 검증 감사 + Semantic Safety Fix (v213)

**커밋**: `2abb0a9` "docs: clarify expected return/goal probability/FX/data-period semantics in UI
(Phase 6-C)" - **push 완료**(직전 `9f64864`(v212) 위에 이어짐). 이번 세션은 크게 세 단계로 진행됐다:
Phase 6(읽기 전용 감사) → Phase 6-B(더 깊은 semantic/cross-engine 재감사, 역시 읽기 전용) →
Phase 6-C(감사에서 확정된 semantic 문제만 UI 텍스트로 고치는 구현 단계, 실제 커밋 발생).

### Phase 6 — Investment Model Validation Audit (읽기 전용, 코드 변경 없음)
js/05/15~22 전체를 코드 기준으로 재구성해 23개 항목을 감사했다. 핵심 발견(전부 CODE DEFECT 아님,
MODEL LIMITATION/데이터 품질/문서화 공백):
- 해외자산 환율(FX) 변동이 프로젝션 경로 전체에 전혀 모델링되지 않음(오늘 스팟 환율만 현재 평가액에
  반영, 미래 경로는 환율 고정 가정) - grep으로 js/05/15/16/17/18/19 전체에서 `exchangeRate` 참조가
  없음을 직접 확인.
- 변동성/상관계수가 `fetchDailyCloses(ticker, range='1y')`의 **기본값 그대로** 쓰여, 20년 프로젝션의
  σ/상관계수가 **최근 1년 일별 데이터**로만 추정됨(관측치 개수 충분 vs 그 기간이 미래를 대표하는지는
  별개 문제).
- Expected Return preset(SCENARIO_RATE_PRESETS)은 지수(KOSPI/S&P500/NASDAQ) 레벨은 외부 벤치마크와
  근접해 근거 있으나, 개별 빅테크 종목의 "일반적" 시나리오(GOOGL/META/NVDA 11.5~12.5%)는 시장평균
  초과 지속을 기본 가정하는 셈이라 경제이론적 근거가 약함.
- Fee는 ETF/펀드 연 보수만 반영, 세금/거래수수료/환전비용/spread는 전부 스코프 밖(기존에 이미 알려진
  제한).
- 최종 판정: 🟡 PASS WITH LIMITATIONS.

### Phase 6-B — Semantic & Cross-Engine Audit (읽기 전용, 코드 변경 없음)
사용자가 Phase 6 결과를 승인하지 않고 지적한 핵심 불일치 두 가지를 심층 재검증:
- **"기대수익률"의 실제 통계적 정체성**: `computeMuGBM = 12·ln(1+r/12) + σ²/2`(median-match
  설계)를 r=9%/σ=20% 수치 예시로 직접 계산 - Deterministic 연 성장률(9.376%) = GBM **median**
  경로(9.376%, 완전 일치, 설계 의도대로) ≠ GBM **arithmetic 기대값**(11.590%, `= median ×
  exp(σ²/2)`). 즉 화면의 "기대수익률"은 산술평균(E[R])이 아니라 **중앙값(median) 기준값**임을
  수식으로 증명. `extractMilestoneStats`가 산술평균(`stats.mean`)을 계산은 하지만 UI 어디에도
  표시되지 않는다는 점도 확인.
- **Deterministic vs Monte Carlo 리밸런싱 전략 불일치**: `simulateRebalancedPreset`(js/05)은
  region별 **가중평균 rate 1개를 폐쇄형 복리식 1번**으로 계산 - 이는 암묵적으로 "매 순간 목표비중이
  완벽히 유지되는 연속 재조정"과 수학적으로 동등. 반면 MC는 "연 1회만 재조정, 그 사이엔 실제 드리프트
  허용". median-match 때문에 두 결과가 숫자로 비슷해 보이지만, **같은 전략을 검증한 게 아니라 서로
  다른 가정의 계산**이라는 결론(YES/NO 판정: NO, 동일 전략 아님).
- 그 외 재확인: Sequence of Returns Risk는 적립(accumulation) 단계에만 해당(은퇴 후 인출 단계는
  애초에 이 앱의 모델링 범위 밖 - grep 결과 인출/은퇴 관련 로직 전무), Goal Probability 공식
  재확인(`count(sample>=goal)/n`, 코드와 표현 일치), Price Return(변동성, 비수정 종가) vs Total
  Return(preset, 추정) 기준 불일치 가능성.
- 최종 판정: 🟠 MODEL SEMANTIC FIX REQUIRED(코드 결함 아님, 용어/설명 층위 문제로 한정).

### Phase 6-C — Semantic Safety Fix (실제 구현 + 커밋)
사용자가 🟡 조건부 승인하며 "계산 엔진은 재설계하지 않는다, UI/설명 문구만 고친다"고 범위를 못박은
단계. **계산식/판정 로직 완전 무변경**(`git diff --stat`으로 js/15/16/17/18/20/22 diff 0줄 확인) -
아래는 전부 라벨/설명문/주석/새 INFO 카드(값에 영향 없는 순수 설명)만 추가:
1. 시나리오 카드 라벨 "기대수익률" → **"기준 연간 성장률"**(js/05 `renderScenarioSummaryCards`).
2. Monte Carlo 섹션 설명문(index.html) 전면 개정 - "평균이 아니라 전형적(중앙값) 경로", "Deterministic은
   목표비중이 항상 유지된다는 가정의 단순 계산", "같은 조건을 두 방식으로 검증한 것이 아니라 서로 다른
   가정" 명시.
3. `js/21-safety-layer.js`에 기존 `explainResultAlwaysOn` 패턴을 그대로 따르는 새 INFO 설명 함수 5개
   추가: `explainExpectedReturnSemanticAlwaysOn`(기대수익률=median 의미), `explainGoalProbability
   SemanticAlwaysOn`(목표 설정 시에만, 조건부 확률이지 실제 미래 확률 아님), `explainHistorical
   DataPeriodAlwaysOn`(변동성/상관관계 데이터는 최근 약 1년), `explainFxRiskIfForeign`(해외자산
   비중>0일 때만 조건부 - 미래 환율변동 미반영 고지), `explainAccumulationScopeAlwaysOn`(적립 단계만
   다룸, 인출 단계 아님). js/19가 MC 결과 렌더링 시 이 5개를 `mcSafetyIssues` 카드 영역에 함께 표시.
4. `js/09`(fetchDailyCloses)와 `js/05`(SCENARIO_RATE_PRESETS)에 Price Return vs Total Return 기준
   불명확성을 사실 그대로(임의로 확정하지 않고) 문서화하는 개발자 주석 추가.
5. 신규 `e2e/07-semantic-safety.spec.js`(4 test) - 라벨/설명문/5개 안내 카드의 표시·미표시(FX는
   해외자산 있을 때만, Goal Probability 설명은 목표 설정했을 때만) 조건을 검증.
6. 회귀: `npm test` 92/92(무변경), `npx eslint .` 0 problems, Playwright **18/18**(기존 14 +
   신규 4) 전부 통과.

### 다음 세션이 알아야 할 것
- Phase 6/6-B에서 나온 **V1.1/V2 후보**(이번엔 구현하지 않음, 사용자가 향후 우선순위 재검토 예정):
  σ/상관계수 추정 기간을 1년보다 늘리는 방안, 해외자산 σ에 FX 변동성을 합성하는 근사 모델, 개별
  종목 preset의 "일반적" 시나리오 재검토(시장평균 수렴 가정 강화), `stats.mean`(산술평균)을 P50과
  나란히 노출하는 방안, Deterministic 엔진에 명시적 연 1회 재조정 로직 추가(상당한 재설계라 신중한
  별도 논의 필요).
- Phase 6-C에서 추가한 5개 `explain*AlwaysOn/`If*` 함수는 **판정 로직이 아니라 순수 설명**이다 -
  이후 세션에서 Safety Layer를 건드릴 때 이 구분(assess*=판정, explain*=설명)을 유지할 것.
- `.claude/launch.json`은 이번에도 커밋 대상 아님(항상 그대로 유지).
- `git pull` 먼저 해서 이 커밋(v213, `2abb0a9`)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, Node.js 있는 PC, 계속 12) — Phase 5 핵심 Playwright E2E 구축 (v212)

**커밋**: `9f64864` "test: add core Playwright E2E coverage" - **push 완료**(직전 `8f06c7c`(v211) 위에
이어짐). 실제 사용자 흐름(포트폴리오 입력 → Monte Carlo 실행 → Safety 판정 → 결과 표시)이 브라우저에서
하나의 일관된 시스템으로 동작하는지 자동 검증하는 핵심 E2E 6개(9 test)를 구축했다.

### 이번에 완료된 작업

1. **`e2e/fixtures.js` - 공용 seeding helper**(`seedPortfolio`, `goToProjectionTab`) 신설. 핵심
   설계: 목표 비중 입력을 실제 UI(모달+종목검색)로 흉내내지 않고, `page.evaluate()`로 앱의 실제
   `state`/`makeAsset`/`persistAssets`/`persistRebalance`/`persistProjection`을 직접 호출해 세팅한
   뒤 `page.reload()` - 이유는 (a) 종목검색이 네트워크/캐시 의존이라 flaky해지고, (b) 개별 pct
   input은 앱 자신의 change 핸들러가 즉시 0~100으로 clamp해 "-20%" 같은 값은 애초에 타이핑으로
   만들 수 없기 때문(Negative Weight BLOCK이 방어하는 실제 위험은 JSON 복원 같은 UI-우회 경로임 -
   Phase 3-5에서 이미 실측 확인된 사실). 전부 채권(namedHolding, σ=0) 종목만 써서 가격 이력 네트워크
   조회 자체가 필요 없는 완전히 결정론적인 fixture로 만들었다.
2. **핵심 6개 E2E**(`e2e/01~06-*.spec.js`, 9 test):
   - 01 정상 기본: 포트폴리오 입력→MC 실행→P10/P50/P90/GoalProb에 NaN/undefined/Infinity/음수 없음
   - 02 Weight Sum BLOCK(60%+30%=90%): Deterministic 배너 + MC 양쪽 BLOCK, 잘못된 결과로 안 덮임
   - 03 Negative Weight BLOCK(-20%+120%=100%): Phase 3-5 실제 결함의 회귀 재확인
   - 04 Fee UNKNOWN: 미확인=WARNING(계산은 허용) vs 명시적 0%=WARNING 해소, 구분 확인
   - 05 Inflation: 2.5%→3.5% 변경 시 nominal P50 완전 불변 + real P50만 하락, real goal 명목환산 확인
   - 06 MC 실행/취소: running→cancel→idle→재실행, 완주 시나리오 둘 다 확인
   - 92개 Node 테스트/ESLint(0 problems)/기존 smoke 5개 전부 무손상, **기능 코드(js/05,15~22,sw.js)
     완전 무변경**.
3. **작업 중 겪은 실제 버그(전부 fixture/테스트 쪽, 코드 아님) - 다음에 새 E2E 만들 때 재발 방지용
   기록**:
   - `window.state`로 `waitForFunction` 체크하면 영원히 timeout난다 - classic script의 top-level
     `const`는 `window`에 안 붙는다(함수 선언만 붙음). bare 참조(`state`)로 확인해야 한다.
   - **빈 localStorage로 처음 페이지를 열면 `sampleAssets()`가 진짜 데모 보유자산(GOOGL/MSFT/QQQM/
     SK하이닉스/국고채)을 자동 시딩한다**(js/01 "진짜 첫 실행" 온보딩, 정상 기능) - fixture가
     `state.assets`를 비우지 않고 push만 하면 목표비중 가중치가 크게 희석된다(실측: 100% 세팅했는데
     41.66%로 계산됨). `seedPortfolio()`는 이제 `state.assets=[]`로 먼저 비운다.
   - E2E 테스트용 종목 이름에 "채권/국채" 같은 키워드가 없으면 `classifyCategory`가 위험자산으로
     분류해 실제 가격 이력을 찾으려 시도하고, 여러 개를 동시에 같은 대표지수로 폴백시키면 상관계수가
     전부 1.0에 가까운 퇴화행렬이 되어 Cholesky가 실패한다(CORRELATION_ERROR) - E2E fixture의 종목
     이름은 반드시 채권 키워드를 포함해야 네트워크 불필요 + σ=0 결정론적 테스트가 된다.
   - `eslint.config.js`의 `e2e/**/*.js`는 Node 테스트 러너 코드와 `page.evaluate()` 안의 브라우저
     코드가 한 파일에 섞여 있어, Node 전역과 프로젝트 공유 전역(js/** 스캔 결과)을 **둘 다** 허용해야
     한다(전용 override 블록으로 분리).

### 다음 세션이 알아야 할 것
- **아직 작성 안 된 나머지 E2E**(Phase 5 사용자 요청 12개 중 핵심 6개만 완료) - 나머지: LocalStorage/
  Refresh, Safety WARNING/BLOCK 동시존재, Refresh/State Integrity, Fee Monotonicity(seed 고정 비교),
  Contribution Growth 세부. 다음에 이어서 작성할 때는 이번에 만든 `e2e/fixtures.js`의
  `seedPortfolio()`를 그대로 재사용할 것(채권 키워드 이름 필수, `state.assets` 초기화 로직 이미 포함됨).
- **Fee 편집 UI 상호작용 패턴**: `#mcFeeRatesToggleBtn` 클릭 → `#mcFeeRatesList` 안에서 라벨 텍스트로
  행을 찾아 `input[data-fee-key]`를 채우는 방식(`e2e/04-fee-unknown-warning.spec.js` 참고) - 정확한
  key 문자열(`buildCustomRateKey` 정규화 결과)을 몰라도 라벨 텍스트로 찾으면 안전하다.
- **MC 취소 타이밍**: 8-instrument(채권, σ=0)/50,000회 조합이 "running" 상태를 안정적으로 캐치할 만큼
  충분히 느리다(실측 확인) - instrument 수를 더 줄이면 완료가 너무 빨라 cancel 테스트가 racy해질 수
  있다.
- `.claude/launch.json`은 이번에도 로컬 scratchpad 임시 경로로 남아있을 수 있다 - 커밋 대상 아님.
- **다음 우선순위는 사용자가 재검토 예정** - 계산 로직/UI 신기능은 이번 세션에서 전혀 추가하지 않음.
- `git pull` 먼저 해서 이 커밋(v212, `9f64864`)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, Node.js 있는 PC — 회사 PC로 추정, 계속 11) — Node.js 검증 + 검증환경 구축 (v211)

**커밋**: `2adf2fb`(percentile 테스트 수정) → `782e14e`(Playwright+ESLint 검증환경) - **push 완료**.
이번 세션은 처음으로 이 저장소에서 Node.js가 있는 PC(v24.20.0/npm 11.19.0)로 진행됐다 - 이전
세션들(v205~v210)은 전부 Node.js 없는 개인 PC에서 브라우저 콘솔로만 검증했었다.

### 이번에 완료된 작업

1. **Node.js 실제 검증** - 그동안 브라우저로만 확인했던 Monte Carlo Engine/Safety Layer/Inflation/
   Calibration 전체를 처음으로 `node --test`로 실행. `npm ci`로 기존 package-lock.json 그대로
   의존성(adm-zip/iconv-lite) 설치. 발견된 실제 문제 1건: `test/monte-carlo-calibration.test.js`가
   js/15의 **비공개** 내부함수 `percentile`을 직접 import하고 있었다(브라우저는 `<script>` 전역
   노출 때문에 이 실수가 가려져 있었음) - `percentile`을 공개 API로 승격하지 않고, 대신 공개 API인
   `extractMilestoneStats`만 사용하도록 테스트 3개를 재작성해서 고쳤다(엔진 코드는 무변경).
   최종 `npm test`: **92/92 PASS**(merge 9, ticker-master-parse 6, inflation-transform 6,
   monte-carlo-engine 27, safety-layer 35, monte-carlo-calibration 9).
2. **Playwright + ESLint 검증환경 신설**(`eslint.config.js`, `playwright.config.js`,
   `scripts/dev-static-server.js`, `e2e/smoke.spec.js`) - 둘 다 이 저장소에 처음 도입됨.
   - **ESLint 핵심 설계**: 이 앱은 22개 js/*.js가 `<script>` 태그로 순차 로드되며 서로의 top-level
     선언을 전역으로 공유하는 구조라, 순진하게 설정하면 첫 실행에서 **926개 오탐**(no-undef/
     no-redeclare)이 났다. `eslint.config.js`가 js/ 전체를 스캔해 공유 전역 목록을 자동 생성하도록
     만들어(파일이 바뀌면 자동 갱신, 별도 생성파일 없음) 해결 - 최종 `npx eslint .` **0 problems**.
     `no-redeclare`는 `{builtinGlobals:false}` 옵션으로 "자기 자신의 전역 선언"만 무시하고 진짜
     파일 내부 중복선언은 계속 잡는다. sw.js/cloudflare-worker-*.js는 각각 Service Worker/
     Cloudflare Workers 전용 globals 세트 적용(js/**/*.js와 다른 override).
   - **sw.js:477 `no-useless-assignment` false positive**: `isNetworkFirst`가 `try{...}
     catch{return}` 다음의 `if`문에서 실제로 읽히는데도 ESLint v10 신규 규칙이 이 제어흐름을
     못 따라가 오탐 - sw.js 로직은 그대로 두고, `eslint.config.js`에서 **sw.js 파일에 한정해서만**
     이 규칙을 껐다(다른 규칙/다른 파일 영향 없음, 사용자 확인 후 처리).
   - **Playwright smoke test**(5개, `e2e/smoke.spec.js`): 페이지 로드/대시보드 렌더링/JS runtime
     error 없음/핵심 탐색 UI 존재/Monte Carlo UI 로드 - 이 저장소 최초의 실제 브라우저 자동화 테스트.
     `.claude/launch.json`(세션 임시 scratchpad 경로, 커밋 안 됨)에 의존하지 않도록 새 의존성 없이
     Node 내장 모듈만 쓰는 `scripts/dev-static-server.js`(포트 8644)를 만들어 Playwright의
     webServer가 이걸 띄우게 했다 - 다른 PC/CI에서도 그대로 재현 가능.
   - `package.json`에 `lint`/`e2e` npm script 2개 추가(devDependencies: eslint, @eslint/js,
     globals, @playwright/test). 기존 `test`/`update-ticker-master` 스크립트와 dependencies는 무변경.
3. **정상 시나리오/Safety/Projection/상태관리/MC 세부 시나리오는 이번에 작성하지 않음** -
   요청대로 "최소 smoke test 환경"까지만 구축, 나머지 E2E 테스트는 다음 단계 후보로 남김.

### 다음 세션이 알아야 할 것
- **이 PC엔 Node.js가 있다** - 다음에 이 PC에서 세션을 열면(또는 Node 있는 PC라면) `npm test`/
  `npx eslint .`/`npm run e2e`가 전부 즉시 동작해야 한다. 만약 Node.js 없는 PC(v205~v210이 진행된
  개인 PC)로 돌아가면 이 3개 검증은 여전히 브라우저 콘솔로 대체해야 한다.
- **node_modules/ms-playwright 브라우저 바이너리는 이 PC 로컬 전용**(각각 `node_modules/`,
  `C:\Users\<user>\AppData\Local\ms-playwright\`) - git에 커밋되지 않으므로 다른 PC에서는
  `npm ci` + `npx playwright install chromium`을 다시 실행해야 함.
- **npm audit 미해결**: `npm install` 시 "1 high severity vulnerability" 경고가 떴으나, 이 세션
  내내 `npm audit`이 npm registry security-advisory 엔드포인트 네트워크 타임아웃으로 응답하지
  않았다 - 어떤 패키지/취약점인지 **끝내 확인하지 못함**(`SECURITY AUDIT: UNVERIFIED`). `npm audit
  fix`는 실행하지 않았고 package version도 임의로 바꾸지 않았다 - 다음 세션(특히 네트워크가 원활한
  환경)에서 `npm audit` 한 번 더 시도해 실제 내역을 확인할 것.
- `sw.js`의 `no-useless-assignment` off는 **파일 단위**로만 적용됨 - 향후 sw.js에 새 코드를 추가할
  때 진짜 dead-store 버그가 생겨도 이 규칙이 잡아주지 않는다는 점 유의(그 경우 수동 리뷰 필요).
- `.claude/launch.json`은 이번에도 로컬 scratchpad 임시 경로로 남아있을 수 있다 - 커밋 대상 아님.
- **다음 우선순위는 사용자가 재검토 예정** - 계산 로직/UI 신기능은 이번 세션에서 전혀 추가하지 않음.
- `git pull` 먼저 해서 이 커밋들(v211, `2adf2fb`→`782e14e`)을 받았는지 확인 - 이 파일 맨 위 섹션이
  가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, 개인 PC 계속 10) — Phase 4 Monte Carlo Calibration & Investment Model Validation (v210)

**커밋**: `00e1afd` "feat: add Monte Carlo calibration regression suite and stability/sensitivity UI
guidance" - **push 완료**(직전 `21e20da`(v209) 위에 이어짐). "Monte Carlo가 seed/횟수에 안정적인가"
(Numerical Stability)와 "그 결과가 실제로 신뢰할 만한가"(Economic/Parameter Sensitivity)는 완전히
다른 질문이라는 원칙 하에, 두 차례의 설계 감사(Calibration Design Audit → Investment Model
Validation Audit, 실측 데이터로 뒷받침) 후 최소한의 구현만 승인받아 진행한 회차.

### 이번에 완료된 작업

1. **실측 Calibration/Sensitivity 연구(코드화 안 함, 세션 기록으로만 남음)** - 동일 baseline
   포트폴리오(KOSPI 7%/S&P500 9% 유사 2자산)에서: (a) seed 5개 × iteration 5k/10k/50k 그리드로
   P10/P50/P90/GoalProbability의 seed간 상대표준편차 측정(P50: 0.55%→0.18%, **GoalProb(P90 부근
   목표)는 4.06%→0.74%로 다른 지표보다 4~10배 불안정**), (b) σ=0이 9개 seed×count 조합 전체에서
   spread=0(완전 동일)임을 실측 + 구조적 증명(σ=0이면 엔진이 랜덤 shock 자체를 곱하지 않음), (c)
   scalar GBM 이론값과 대조 - median은 `computeDeterministicMonthlyFV`와 상대오차 0(median-match가
   근사가 아니라 정확한 항등식), mean은 median의 1.868배(Jensen 부등식/변동성 항력, 실측도 이론과
   0.5%대로 근접), (d) **정규화된(변화폭 1%p/1%당) Parameter Sensitivity**: Expected Return
   ±1%p→P50 -13.8%/+16.4%, **Fee +1%p→P50 -14.5%~-14.8%(Return과 같은 자릿수 - 정규화 전엔 Fee가
   훨씬 작아 보였는데 이건 변화폭이 달라서 생긴 착시였다는 게 이번 보정의 핵심)**, Volatility
   ±1%p→P50은 거의 불변(-0.9%~+1.2%)이나 P90은 크게 움직임(-4.2%~+5.8%), Contribution Growth
   ±1%p→±4.3%/+4.7%, Monthly Contribution 탄력성 ≈0.6(입력 +1%→P50 +0.6%), **Inflation
   ±1%p(실질가치 기준)→+21.7%/-17.6%(nominal에는 구조적으로 영향 0)** - Return/Fee/Inflation이
   전부 비슷한 자릿수(14~22%)라 "어느 것이 절대적으로 가장 중요하다"고 단정하지 않는 것으로 결론,
   (e) Horizon 5/10/15/20년에서 P90/P10 spread(1.90→3.27배)와 Return sensitivity(4.3%→16.4%)가
   전부 거의 선형 증가, (f) percentile nearest-rank vs linear interpolation 차이는 5,000회에서도
   상대차이 0.01% 미만(seed noise의 100분의 1 이하) - 변경 불필요 결론 재확인.
2. **[SCOPE 발견, 결함 아님]** `MILESTONE_YEARS=[5,10,15,20]`이 하드코딩되어 있어 `years:30`을 넘겨도
   30년 milestone 자체가 생성되지 않음 - [js/05:229](jasan/js/05-future-projection.js:229) 주석에
   "최대 20년 시야, 사용자 요청"으로 이미 의도된 기존 설계임을 확인, 이번엔 변경하지 않음(30년 지원은
   별도 제품 스코프 결정 사항으로 남김).
3. **Calibration 회귀 테스트 신설** (`test/monte-carlo-calibration.test.js`, 9개) - σ=0 invariant(여러
   seed×count, 단일자산 + 다자산·fee·growth 조합), Fee/Growth monotonicity(3 seed), percentile
   경계값/단조성/nearest-rank vs interpolation 무의미성, Goal Probability 기본계산/단조성. **Parameter
   Sensitivity 실측치 자체(수익률/변동성 등 절대 수치)는 회귀로 코드화하지 않음** - baseline이 바뀌면
   매번 달라지는 "연구" 결과라 자동 테스트 대상이 아니라는 원칙을 지킴(사용자 조건부승인 항목 9).
4. **Goal Probability 표시 정책 개선** (`js/22-safety-ui.js` `formatGoalProbabilityDisplay`) -
   10~90% 구간은 기존 소수점 1자리 유지, **<10%/>90%는 "약 N%"**, <5%는 "5% 미만", >95%는 "95%
   초과"로 정밀도를 낮추고 꼬리 구간에는 "이 확률은 분포의 극단에 가까워 시뮬레이션 표본에 따라
   다소 달라질 수 있습니다" 캡션을 함께 표시([js/19](jasan/js/19-monte-carlo-ui.js) 양쪽 목표금액
   모드(명목/실질) 모두 적용) - 실측 근거: 꼬리 확률은 50,000회에서도 seed간 relSD 0.7%대로 남아
   소수점 표시가 실제보다 정밀해 보이는 착시를 줌.
5. **"계산 안정성 ≠ 미래 예측 정확성" 안내 카드 신설** (`explainSimulationStabilityAlwaysOn`,
   js/21) - 기존 Phase 3-5의 `explainResultAlwaysOn`("복리로 누적된 결과"라는 경제적 해석)과
   **의도적으로 분리된 별도 카드**로 매 결과에 동반("시뮬레이션 횟수가 많을수록 표본 변동은
   줄어들지만, 이는 계산이 안정적이라는 뜻일 뿐 미래 수익률을 예측할 수 있다는 뜻은 아니다") -
   두 개념을 하나로 섞지 말라는 사용자 지시를 그대로 반영.
6. **실측 검증**: 브라우저에서 실제 프로덕션 코드로 Calibration 회귀 9개 전부 PASS, 기존 Phase
   3-4/3-5 회귀(Fee=0/Seed재현/weight-sum BLOCK/negative-weight BLOCK/fee WARNING) 무손상 확인,
   실제 UI에서 WARNING(Fee 미확인)+INFO(결과해석)+INFO(시뮬레이션 안정성) 3개 카드가 함께 렌더링됨을
   확인, Goal Probability "95% 초과"/"5% 미만" + 꼬리 캡션이 실제 화면에 정확히 표시됨을 확인(둘 다
   스크린샷/get_page_text로 실측), 로컬스토리지 오염 없음 확인.

### 다음 세션이 알아야 할 것
- **Parameter Sensitivity 정규화 원칙을 반드시 유지할 것**: 서로 다른 parameter를 비교할 때는
  반드시 같은 변화폭(주로 ±1%p 또는 입력값 대비 %)으로 환산한 뒤에만 비교한다 - 원래(정규화 전)
  실측에서는 Fee의 영향이 Return보다 훨씬 작아 보였으나, 이는 Fee 변화폭(±0.25~0.50%p)이 Return
  변화폭(±1%p)보다 작았기 때문일 뿐이었다(사용자가 직접 잡아낸 방법론적 오류 - 다음에도 이런 종류의
  비교를 할 때 항상 변화폭부터 맞출 것).
- **"Expected Return/Inflation이 가장 중요한 변수"라고 절대 단정하지 말 것** - 정규화 후에도
  Return(~14~16%/%p)·Fee(~14.5%/%p)·Inflation(~18~22%/%p, 실질가치 한정)이 비슷한 자릿수라 "이
  baseline과 변화범위에서 상대적으로 크게 나타난 변수들"이라고만 표현해야 한다(사용자 명시 지시).
- **MILESTONE_YEARS=[5,10,15,20] 30년 미지원**은 기존 의도된 설계 - 이번에도 건드리지 않음. 30년
  지원 논의가 다시 나오면 이건 Calibration이 아니라 제품 스코프 결정임을 상기시킬 것.
- **PSD_WARNING_THRESHOLD(-0.05), Safety threshold 전체, percentile 알고리즘, annual rebalancing,
  GBM 모델**은 이번 Phase에서도 전혀 변경하지 않았다 - 계속 유지.
- `.claude/launch.json`은 이번에도 로컬 scratchpad 임시 경로로 남아있을 수 있다 - 커밋 대상 아님.
- **다음 우선순위는 사용자가 재검토 예정** - Phase 4까지 완료되었으므로 다음 기능/개선은 사용자
  지시를 기다릴 것.
- `git pull` 먼저 해서 이 커밋(v210, `00e1afd`)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, 개인 PC 계속 9) — Phase 3-5 Safety Layer 구현 + 커밋 (v209)

**커밋**: `6f4cb62` "feat: add Safety Layer with input validation and model risk diagnostics" - **push 완료**
(직전 baseline `27d1977`(v208) 위에 이어짐). GPT/사용자가 설계한 "BLOCK/WARNING/INFO 3단계 Safety
Layer"를 Full Audit → 설계 승인 → 구현 → 사용자가 직접 지정한 sanity check(4항목) → sanity check에서
실제 결함(음수 개별 비중 미검증) 발견 → 그 결함만 최소 수정 → 재검증 → 커밋의 순서로 진행한 회차.

### 이번에 완료된 작업

1. **Safety Layer 신설** (`js/21-safety-layer.js`, `js/22-safety-ui.js`) - state/DOM에 의존하지 않는
   순수 판정 함수 12개(assessWeightSums/assessExpectedReturn/assessVolatility/assessDataSufficiency/
   assessCorrelationPair/assessPSDCorrection/assessContributionGrowth/assessInflation/assessFee/
   assessSimulationConfidence/assessResultSpread/explainResultAlwaysOn) + BLOCK/WARNING/INFO 3단계
   스키마(`buildSafetyResult`) + "무엇이 문제→왜 중요→무엇을 해야" 3단 카드 UI. **Safety Layer는
   절대 값을 수정하지 않는다** - issue(경고/설명)만 반환.
2. **B1 수정**: js/16 어댑터의 `computeAnnualizedVolatilityPct(...) || 0`을 제거하고, 데이터 부족(null)
   시 명확히 `errors.push`로 계산을 막음(σ=0과 데이터부족을 구조적으로 분리). **잔여**: `js/05:2088`
   `computeTargetPortfolioVolatilityPct`(레거시 `renderMonteCarloSection` 전용, 어디서도 호출되지
   않는 dead code)에 동일한 `|| 0` 패턴이 남아있음 - 실행 경로 없어 삭제하지 않고 기록만 함(다음
   세션 정리 후보).
3. **B2 수정**: js/19의 Monte Carlo 소비 지점 2곳(`Math.max(0, inflationRatePct)`)의 바닥 처리 제거 -
   저장값(state.projection.inflationRate, % 단위)=표시 라벨=계산값이 모두 일치하도록 통일. 음수(디플레
   이션) 자체는 여전히 허용(BLOCK 대상 아님, -100% 이하만 BLOCK).
4. **B3 수정(2단계)**:
   - 1차: `assessHouseholdWeightSums()`(js/05) 신설 - `state.rebalance[owner].targets[region]` 원본
     비중 합계가 ±1%p를 벗어나면 계산 시작 전 BLOCK. Future Projection(`updateProjection` 최상단,
     BLOCK 시 배너만 표시하고 렌더 자체를 skip)과 Monte Carlo(`buildMonteCarloInputFromState`) 둘 다
     이 함수 하나만 호출 - 단일 소스.
   - **2차(사용자 지정 sanity check로 발견)**: 1차 구현이 "지역 합계"만 검사해 `[-20, 120]`(합=100)
     같은 개별 음수 비중이 tolerance를 통과해버리는 구멍을 발견 - 게다가 이 경우 MC(음수 항목을
     조용히 제외)와 Deterministic(음수 가중치를 그대로 가중평균에 포함)이 **서로 다르게 계산**하는
     것까지 실측으로 확인됨(Phase 3-3과 같은 패턴의 교차 불일치). `assessIndividualWeightSigns()`를
     추가해 개별 pct<0을 별도로 BLOCK(`SAFETY_NEGATIVE_WEIGHT`) - `assessHouseholdWeightSums()`
     내부에서만 조합해 두 계산 경로에 자동으로 동시 적용됨(호출부 변경 불필요).
5. **Fee UNKNOWN 구분**: `isFeeExplicitlySet(target)`(js/05) - 스키마 변경 없이 "key 존재=명시적,
   key 부재=UNKNOWN"만 조회하는 병행 헬퍼.
6. **Worker Timeout**: 실측(브라우저, 10-instrument/50,000회/20년 ≈10.3초) 기반 60초
   (`SAFETY_THRESHOLDS.WORKER_TIMEOUT_MS`) - 무한 대기 없이 `WORKER_TIMEOUT` 코드로 명확히 종료.
7. **Error code 세분화**: `SAFETY_WEIGHT_SUM`/`SAFETY_NEGATIVE_WEIGHT`/`SAFETY_INVALID_FEE`/
   `SAFETY_EXTREME_*`/`SAFETY_DATA_INSUFFICIENT`/`SAFETY_CORRELATION_INSUFFICIENT`/
   `SAFETY_PSD_CORRECTION`/`WORKER_TIMEOUT` 등 - 이전엔 전부 `DATA_ERROR` 하나로 뭉개졌음.
8. **실측 검증**: `test/safety-layer.test.js`(35개 테스트, 음수비중 후속수정 포함) 브라우저에서 실제
   프로덕션 함수로 전항목 PASS 확인 + 기존 회귀(Fee=0/Growth=0/Inflation=0/σ=0/Direct=Worker/Seed
   재현/Cancellation) 전부 무손상 + Deterministic↔MC 양쪽에서 malformed 입력(음수 비중) 동일하게
   BLOCK 확인 + 브라우저 스크린샷으로 BLOCK 배너/WARNING·INFO 카드 렌더링 확인.

### 다음 세션이 알아야 할 것
- **B1 잔여 dead code**: `js/05:2088`(`computeTargetPortfolioVolatilityPct`)과 그 유일한 호출부
  `renderMonteCarloSection`(js/05:2145 부근)은 Engine v2 이전의 레거시 단일-스칼라 Monte Carlo
  구현으로, index.html 어디에서도 호출되지 않는 완전한 dead code - 실행 경로가 없어 이번엔 삭제하지
  않았다. 다음에 코드 정리할 때 삭제 후보(단, 삭제도 "리팩터링"이니 별도 확인 후 진행할 것).
  MONTE_CARLO_SEED/MONTE_CARLO_ITERATIONS 상수, `runMonteCarloSimulation` 함수도 이 dead code 블록의
  일부.
- **Node.js 테스트 미실행**: 이 PC엔 Node.js가 없어 `test/safety-layer.test.js`/
  `test/monte-carlo-engine.test.js`가 실제 `node --test`로 한 번도 실행되지 않았다 - 브라우저 콘솔
  실행으로만 확인됨. 회사 PC 등 Node 있는 환경에서 반드시 한 번 실행해 확인할 것.
- **requiresConfirmation은 네이티브 confirm()**: 기대수익률 100%+/Fee 20%+ 같은 극단 가정은 커스텀
  모달이 아니라 브라우저 네이티브 `confirm()`으로 재확인을 받는다(최소 구현, 이번 Phase 범위).
- **PSD_WARNING_THRESHOLD(-0.05)/Monte Carlo seed-variance calibration**: 둘 다 잠정치/범위 밖으로
  유지 - 사용자가 명시적으로 "이번 Phase에서 확정하지 말 것"/"제외"라고 지시함.
- `.claude/launch.json`은 이번에도 로컬 scratchpad 임시 경로로 수정된 채 남아있을 수 있다 - 커밋
  대상 아님(v207/v208 섹션과 동일 사유), 무시해도 된다.
- **다음 우선순위는 사용자가 재검토 예정** - Phase 3-5(Safety Layer)까지 완료되었으므로, 세금/거래
  비용 등 다음 기능은 사용자가 전체 모델 관점에서 다시 우선순위를 정한 뒤 지시할 것.
- `git pull` 먼저 해서 이 커밋(v209, `6f4cb62`)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-04, 개인 PC 계속 8) — Monte Carlo Engine v2 최초 baseline 커밋 (v208)

**커밋**: `8c42998` "feat: add Monte Carlo Engine v2 with date-aligned correlation, contribution
growth, and instrument-level fee model" — **push 완료**. 이 세션 자체의 새 작업이 아니라, 이전
여러 세션(Phase 0 ~ 3-4)에 걸쳐 만들어졌지만 **한 번도 커밋된 적 없던** Monte Carlo Engine v2 전체를
사용자 최종 승인 하에 하나의 baseline commit으로 처음 기록한 회차. 이 세션은 그 전 단계인 Phase 3-4
(instrument-level 운용보수 모델)의 조건부 승인 3개 항목(Node 테스트 기록/Fee %↔decimal 변환 회귀
테스트/미설정 Fee Known Limitation 명문화)을 마무리하고, GPT/사용자의 최종 승인을 받은 뒤 커밋했다.

### 이번에 완료된 작업

1. **Phase 3-4 조건부승인 #2 대응 - Fee %→decimal 변환 경계를 함수 하나로 통일**
   (`js/15-monte-carlo-engine.js`, `js/16-monte-carlo-adapter.js`, `js/05-future-projection.js`) -
   기존엔 "UI %(예: 0.20) → 엔진 decimal(예: 0.002)" 변환("/100")이 소비 지점 3곳(js/16:39,
   js/05의 computeRegionWeightedFeeRate 소비부, getMonthlyAllocationItemFeeRate 소비부)에 각각
   따로 인라인으로 있어 이중변환/누락에 무방비였다. `feePercentToDecimal(feeRatePercent)`
   (js/15, `computeMonthlyFeeFactor` 바로 아래)를 신설해 세 곳 모두 이 함수만 호출하도록 통일 -
   값은 100% 동일(회귀 없음), 브라우저 콘솔에서 실제 프로덕션 경로(QQQM 키)로 재확인 완료.
   `test/monte-carlo-engine.test.js`에 이 변환의 대표값(0%/0.20%/1%/20%) + undefined/NaN 방어 +
   왕복(이중변환 없음) 회귀 테스트 3개 추가.
2. **Monte Carlo Engine v2 전체를 최초로 커밋** - 아래 "Commit 상세" 참고. Phase 0(μ_GBM/날짜정렬
   상관관계/Cholesky+PSD보정/연1회 리밸런싱) ~ Phase 3-4(instrument별 운용보수)까지 전부 포함.

### Commit 상세
- **Commit Hash**: `8c42998`
- **Push 결과**: 성공 (`a62e027..8c42998  main -> main`), push 후 `git status`로 working tree 확인 완료
- **포함된 파일**(14개, 2003 insertions / 52 deletions): `index.html`, `js/01-core-state.js`,
  `js/05-future-projection.js`, `js/09-price-fx-risk-engine.js`(date-aligned correlation용 `dates`
  필드 추가), `js/12-import-export-sync.js`, `js/14-settings-boot.js`, 신규
  `js/15-monte-carlo-engine.js`(519줄) ~ `js/20-inflation-transform.js`(60줄), 신규
  `test/monte-carlo-engine.test.js`(411줄), `test/inflation-transform.test.js`(60줄)
- **제외한 파일**: `.claude/launch.json` - 이번 세션 scratchpad의 임시 경로
  (`C:\Users\DRAGON~1\AppData\Local\Temp\claude\...\serve_asset_manager.ps1`)를 가리키도록 로컬에서
  바뀐 상태라 다른 PC/세션에서 재현 안 됨(v207 섹션에서도 이미 같은 주의사항 언급됨) - **의도적으로
  staging에서 제외**, 삭제 여부는 임의 결정하지 않음(사용자 지시).
- **Working Tree 상태**: push 후 `git status` 기준 `.claude/launch.json`만 unstaged 상태로 남고
  나머지는 전부 깨끗함(clean).

### 다음 세션이 알아야 할 것
- **Node.js 테스트 미실행**: 이 PC(개인 PC)에는 Node.js가 없다(`node` 명령 자체 없음, 설치하지
  않음). `test/monte-carlo-engine.test.js`(Phase 0/2-2/3-3/3-4 전체 + 조건부승인#2 변환 테스트)와
  `test/inflation-transform.test.js`는 **이번 세션에서 실제 `node --test`로 한 번도 실행되지
  않았다** - 브라우저 콘솔에서 동일 로직을 프로덕션 함수로 직접 실행해 전항목 PASS만 확인한 상태.
  Node이 있는 환경(회사 PC 등)에서 `node --test test/`를 반드시 한 번 실행해 실제 통과를 확인할 것.
- **Known Limitation(Phase 3-5 Safety Layer 핵심 검토 대상으로 이미 지정됨)**: ETF/펀드의 운용보수가
  미입력된 종목/카테고리는 현재 0%로 계산된다("Fee 정보 없음"과 "실제 Fee=0%"를 구분하지 않음) -
  실제 운용보수가 있는 상품에서는 미래자산가치가 과대평가될 수 있다.
- **다음 우선순위는 Phase 3-5 Safety Layer** (사용자가 명시적으로 지정, 세금/거래비용보다 먼저) -
  단순 input validation이 아니라 "입력 유효성 검사 → 경제적으로 비정상적인 가정 탐지 → 데이터 품질
  검사 → 계산 가능 여부 판단 → 결과 신뢰도/주의사항 표시 → 초보자에게 이해 가능한 설명"까지 포함하는
  투자 의사결정 보호 계층으로 설계 예정. **이 세션에서는 Safety Layer를 구현하지 않았다** - push까지만
  진행하고 사용자가 다음 세션에서 전체 모델 관점의 우선순위를 다시 정하기로 함.
- `.claude/launch.json`은 이번에도 로컬에서 수정된 채 남아있을 수 있다(위 "제외한 파일" 참고) -
  커밋 대상 아님, 무시해도 된다.
- `git pull` 먼저 해서 이 커밋(v208, `8c42998`)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 7) — 커밋 시 버전 v207

**커밋**: 사용자 승인 대기 중. 바로 아래 "v206" 섹션과 같은 날 같은 세션의 연속 - 사용자가 v206의
"설정값은 자동 병합하지 않는다"는 결론에 "일을 덜 하려는 선택 아니냐"고 재확인을 요청, 그 질문에
정직하게 다시 검토하다가 v206 논의와는 **별개인 진짜 버그**를 새로 발견해 수정한 회차.

### 이번에 완료 + 실측 검증된 작업

1. **버그 수정 - 클라우드 동기화(push)가 배우자의 최근 목표비중/자산예측 설정을 조용히 덮어씀**
   (`js/01-core-state.js`, `js/12-import-export-sync.js`) — v206은 "복원(JSON 백업) 시점의 의도
   충돌"에 대한 답이었지 "평소 push/pull 자체의 안전성"에 대한 답은 아니었다는 걸 재검토 중에
   깨달았다. `pushToCloud()`([12]:739)를 다시 읽어보니 업로드 직전 자산/거래내역만 원격과 병합하고,
   `rebalance`/`projection`은 **검사 자체를 하지 않고** 로컬 값을 그대로 밀어 올리고 있었다 - 즉
   배우자 기기가 이 설정을 더 최근에 고쳐놨어도, 이 기기가 그 설정과 무관한 사소한 편집(거래 하나
   추가 등) 하나만 해도 `schedulePush()`가 걸려 배우자의 수정이 경고 없이 사라질 수 있었다. pull
   쪽(`applyRemoteScalarFields`)도 "원격의 전체 버전이 로컬보다 높으면" 이 필드를 무조건 통째
   채택했는데, 전체 버전은 이 필드와 무관한 변경만으로도 올라가므로 같은 종류의 문제가 있었다.
   **복원과 달리 이건 사람이 판단할 "의도 충돌"이 아니라 순수한 버그**라 자동으로 막아야 맞다.
   - **수정**: `state.rebalance`/`state.projection`에 자체 `updatedAt`을 추가(`persistRebalance`/
     `persistProjection`이 실제 로컬 편집마다 새로 찍음, `skipStamp` 인자로 "원격 값을 그대로
     이어받을 때"는 새로 안 찍음). 새 함수 `adoptRemoteRebalanceAndProjection(parsed, { force })`가
     push/pull 양쪽에서 공용으로 쓰이며, `force:false`(클라우드 동기화 전용)일 땐 "필드 자체의
     `updatedAt`이 로컬보다 정말 더 최신일 때만" 채택한다. `pushToCloud()`에도 push 직전 이 비교를
     새로 추가했다(예전엔 이 검사 자체가 없었음).
   - **복원(JSON 백업)은 그대로 무조건 통째 채택 유지**: `applyRemoteState`는 `force:true`(기본값)로
     호출돼 타임스탬프와 무관하게 항상 채택한다 - 구현 중 처음엔 이 구분 없이 하나의 함수로 합쳤다가,
     "3일 전 백업 복원"이 항상 로컬보다 오래된 값이라 gated 비교를 걸면 복원 자체가 조용히 무시되는
     새 버그가 생긴다는 걸 검증 과정에서 직접 발견해 `force`/`gated` 옵션으로 분리했다 - v206의
     "복원은 의도 충돌이라 자동 판단하면 안 된다"는 결론은 그대로 유지됨.
   - **레거시 데이터 마이그레이션**: `updatedAt`이 없던 기존 값은 `loadState()`에서 최초 1회만
     "지금"으로 채워 넣는다(자산/거래내역에 이미 쓰던 것과 동일한 패턴).
   - **실측 검증**: 브라우저 콘솔에서 세 시나리오 직접 실행 - (1) 원격이 더 오래된 값 → gated 비교로
     무시됨(로컬 유지) (2) 원격이 더 최신 값 → gated 비교로 채택됨 (3) `force:true`(복원 경로) →
     원격이 더 오래된 값이어도 무조건 채택됨(복원 의미 유지 확인). 마이그레이션도 기존
     `localStorage`(`updatedAt` 없는 구버전 포맷)로 직접 재현해 최초 로드 시 정상적으로 채워짐을
     확인. 참고: 이 검증 중 서비스 워커(`sw.js`) 캐시가 수정 전 파일을 계속 서빙하고 있던 걸 발견해
     `caches.delete()`/`unregister()`로 지우고 재확인했다 - 프리뷰 서버 자체는 파일을 매번 새로 읽는
     구조라 문제 없었음.

### 다음 세션이 알아야 할 것
- v206 섹션의 "여전히 설정값 자체를 병합하지는 않는다"는 문장은 이제 정확하지 않다 - **push/pull
  양쪽 모두 필드 단위 최신성 비교가 들어갔다.** 다만 이건 "항목 단위 병합"이 아니라 "레코드(필드)
  전체를 최신 쪽으로 채택"이라는 점은 자산/거래내역과 다르다(rebalance/projection은 값 하나라
  애초에 항목 단위 병합이 불가능 - v206/v205에서 이미 논의됨).
- exchangeRate/dailyChangeRate는 이번에 손대지 않았다(여전히 "원격이 최신이면 통째 채택") - 사용자가
  수동 입력하는 값이라 부부가 동시에 따로 편집할 일이 거의 없다고 판단해 범위에서 제외했다. 필요하면
  `adoptRemoteRebalanceAndProjection`과 동일한 패턴으로 확장 가능.
- 몬테카를로/베타 재확인(외부 사이트 정책 검사 서비스 다운)은 여전히 미해결 - v204 섹션 참고.
- `.claude/launch.json`이 로컬에서 수정된 채로 남아있을 수 있다(프리뷰 서버가 세션별 임시 스크립트
  경로를 가리키도록 자동 변경됨) - 커밋 대상이 아니다(다른 PC/세션에서 그 경로가 존재하지 않음).
  실제 배포/개발 서버 실행 방법과 무관하니 무시해도 된다.
- `git pull` 먼저 해서 이 커밋(v207)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 6) — 커밋 시 버전 v206

**커밋**: 사용자 승인 대기 중. 바로 아래 "v205" 섹션과 같은 날 같은 세션의 연속 - v205에서 "아직
안 고친 위험"으로 남겨뒀던 목표비중/자산예측 설정 문제의 설계를 검토하고 실제로 반영한 회차.

### 이번에 완료 + 실측 검증된 작업

1. **JSON 백업 복원 후 자동 동기화 push 억제 + 명확한 경고** (`js/12-import-export-sync.js`,
   `applyRemoteState`) — v205 마무리 시점에 "목표비중/자산예측 설정은 병합 대상으로 바꿀지, 복원 시
   동기화를 잠깐 멈출지" 설계 검토를 요청받아 두 방향을 비교했다.
   - **검토 결론**: "설정값도 병합"은 기각 - 목표비중/자산예측은 자산/거래내역과 달리 "지금 이 순간의
     설정 하나"라 항목 단위 병합이 의미가 없고(서로 다른 두 설정이 뒤섞여 합계가 안 맞는 등 더
     혼란스러운 결과가 나올 위험), updatedAt 타임스탬프로 자동으로 최신 걸 채택하게 해도 "3일 전으로
     되돌리기"와 "배우자의 최근 수정 유지하기"는 애초에 동시에 만족할 수 없는 사용자 의도의 문제라
     앱이 대신 판단하면 안 된다고 결론지었다. 대신 **"복원 시 동기화를 잠깐 멈추고 사용자에게 확인받는"**
     쪽으로 설계.
   - **구현**: pull 진행 중 재push를 막는 데 이미 쓰던 안전장치(`applyingRemoteUpdate` 플래그)를
     복원(`applyRemoteState`) 전체를 감싸는 데 재사용해, 복원 중 persist*() 호출들이 트리거하는
     `schedulePush()`가 전부 조용히 무시되게 했다(새 장치 없이 기존 검증된 패턴 재사용). 복원이 끝난
     뒤(플래그 해제 후) 동기화가 켜져 있으면 `showToast`로 "곧 클라우드에 반영되며 배우자의 최근 설정
     변경이 되돌아갈 수 있다"고 10초간 경고하고, 확인하려면 [서버 동기화중지]를 먼저 누르라고 안내한다
     - 앱이 자동으로 어느 쪽도 선택하지 않는다.
   - **실측 검증**: 브라우저에서 직접 확인 - 동기화 켜진 상태로 복원 실행 후 `applyingRemoteUpdate`가
     정확히 `false`로 돌아오고 `pushDebounceTimer`가 전혀 예약되지 않음(자동 push 억제 확인), 복원
     직후 경고 토스트가 정확한 문구로 DOM에 실제로 뜸을 확인, 동기화가 꺼져 있으면 토스트가 안 뜨는
     것도 확인(불필요한 알림 없음).

### 다음 세션이 알아야 할 것
- v204~v206으로 "3일 전 백업 복원 후 동기화" 시나리오의 알려진 위험은 전부 다뤘다: 일별 손익
  이력(v204, 병합), 자산/거래내역 삭제 오인(v205, 기준값 리셋), 목표비중/자산예측 설정 조용한
  덮어쓰기(v206, 자동 push 억제+경고) - 추가로 발견되는 게 없다면 이 주제는 일단락된 것으로 본다.
- 여전히 "설정값 자체를 병합"하지는 않는다 - 사용자가 복원 후 정말 목표비중까지 되돌리고 싶다면
  그대로 두면 되고, 배우자 설정을 지키고 싶다면 동기화를 끄고 확인 후 판단해야 한다(자동화 아님,
  의도적 설계). **[v207에서 갱신]** 이건 "복원"에 대해서만 여전히 맞는 말이다 - 평소 push/pull에는
  v207에서 필드 단위 최신성 비교가 추가됐다. 아래 v207 섹션 참고.
- 몬테카를로/베타 재확인(외부 사이트 정책 검사 서비스 다운)은 여전히 미해결 - v204 섹션 참고.
- `git pull` 먼저 해서 이 커밋(v206)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 5) — 커밋 시 버전 v205

**커밋**: 사용자 승인 대기 중. 바로 아래 "v204" 섹션과 같은 날 같은 세션의 연속 - v204에서 "3일 전
백업을 복원하고 동기화하면 어떻게 되냐"는 사용자 질문에 답하다가 발견한 관련 버그를 실제로 고친 회차.

### 이번에 완료 + 실측 검증된 작업

1. **JSON 백업 복원 후 동기화가 최근 데이터를 "삭제됨"으로 오인하는 버그 수정**
   (`js/12-import-export-sync.js`, `applyRemoteState`) — v204의 질문에 답하려고 코드를 끝까지
   추적하다가 발견. 오래된 백업을 복원하면 `state.assets`/`state.transactions`는 그 시점으로
   되돌아가지만, 동기화 병합이 "삭제 여부"를 판단하는 기준값(`LS_SYNC_MERGED_ASSET_IDS`/
   `LS_SYNC_MERGED_TX_IDS` - "이 기기가 예전에 존재를 알고 있었던 id 목록")은 복원으로 초기화되지
   않고 그대로 남는다. 그 결과 백업 시점 이후 새로 생긴 자산/거래(이 기기든 배우자 기기든)가 복원
   때문에 로컬에서 사라지면, 복원 직후 자동으로 걸리는 동기화(`schedulePush`→`pushToCloud`)의 병합
   로직(`mergeCollectionById`)이 "로컬에 없는데 예전엔 있다고 기억함 = 사용자가 일부러 지운 것"으로
   해석해 **클라우드에서도 영구히 지워버릴 수 있었다.**
   - **수정**: `applyRemoteState`(JSON 복원) 끝에서, 동기화가 켜져 있으면 병합 기준값을 완전히
     비우고(`LS_SYNC_MERGED_ASSET_IDS`/`TX_IDS` → `[]`) `syncState.lastVersion`/
     `LS_SYNC_LAST_VERSION`도 0으로 되돌린다 - 복원을 "이 기기가 동기화 이력을 처음부터 다시
     시작하는 것"과 동일하게 취급해, 다음 동기화가 로컬/원격 어느 한쪽에만 있는 항목이든 전부
     "새로 생김"으로 보고 살리게 한다(같은 id가 양쪽에 있으면 기존처럼 `updatedAt` 최신 쪽이 이기는
     규칙은 그대로 유지).
   - **실측 검증**: 대조 테스트로 확인 - "복원 시점 이후 배우자 기기가 추가한 자산"이 있는 상황을
     그대로 재현해, 기존 방식(기준값 유지)으로 병합하면 그 자산이 실제로 사라짐을 먼저 확인했고,
     수정 후 방식(기준값 리셋)으로 병합하면 정확히 보존됨을 확인했다.

### 다음 세션이 알아야 할 것
- **아직 다루지 않은 관련 위험**: 목표비중/자산예측 설정(`rebalance`/`projection`)은 여전히 병합
  없이 "복원된(오래된) 값 그대로 클라우드에 업로드"된다 - 배우자 기기가 최근에 목표비중을 바꿨다면
  복원 후 첫 push로 그 변경사항이 양쪽 기기 모두에서 되돌아갈 수 있다. 이번 수정 범위(자산/거래내역
  삭제 오인)와는 별개 문제라 손대지 않았고, 사용자에게 안내는 했으나 아직 수정 요청은 없었다 -
  다시 나오면 이 메모를 먼저 참고할 것. **[v207에서 해결]** push 자체가 이 필드를 검사 없이 밀어
  올리던 버그를 v207에서 고쳤다 - 아래 v207 섹션 참고.
  - Monte Carlo/베타 재확인(외부 사이트 정책 검사 서비스 다운)은 v204 섹션 참고 - 아직 해결 여부
    확인 안 됨.
- `git pull` 먼저 해서 이 커밋(v205)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 3) — 커밋 시 버전 v202

**커밋**: 사용자 승인 대기 중. 사용자가 실제 엑셀 2개(`자산관리_2026-09-03 v0.xlsx`,
`거래내역_백업_20260903.xlsx`)를 첨부해 "클린 상태에서 실데이터 기반 정합성 전수검증 + UI 전수조사"를
요청 - 이 PC에 python/node가 없어 PowerShell로 xlsx 내부 XML을 직접 풀어서 읽었다.

### 이번에 완료 + 실측 검증된 작업

1. **버그 수정 - 티커 없는 외화 자산(예: "달러") 지역 오판별** (`js/01-core-state.js`) — 실데이터
   검증 중 발견. `classifyIsDomestic(ticker)`가 티커 없으면 무조건 `'국내'`를 반환해서, 거래내역에서
   "달러"(USD 현금, 티커 없음)를 **처음** 매수하면(`syncAssetsFromTransactions`가 `makeAsset()`으로
   새 자산을 만드는 경로 - 이 경로는 `isDomestic`을 안 넘김) 그 자산이 실제로는 외화인데도 국내로
   분류됐다. 실측 확인된 파급 효과: 목표비중 모달의 "+ 종목 추가" 이름검색에서 해외 탭에는 전혀 안
   뜨고 국내 탭에서만 보임 + `computeRegionTargetAmounts`가 지역(`isDomestic===region`)으로 자산을
   거르기 때문에 국내/해외 총액 계산 자체가 틀어짐(달러 목표를 해외에 넣어도 실제 보유분과 매칭이
   안 됨). **수정**: `classifyIsDomestic(ticker, currency)`/`deriveDefaults(ticker, name, currency)`가
   티커 없을 때만 통화를 대신 참고(USD→해외, 그 외→기존처럼 국내)하도록 확장, `makeAsset()` 호출부에
   `raw.currency` 전달. 티커 있는 자산의 판별은 전혀 안 바뀐다. **실측**: 수정 전/후
   `deriveDefaults('','달러','USD')`가 `국내`→`해외`로 바뀜을 확인, 해외 목표(namedHolding "달러")와
   실제 보유분의 목표금액이 정확히 일치함(15,249,854.77원 양쪽 동일)을 확인.
2. **모바일 UI 전수조사 확장 - whitespace-nowrap 보강** (`js/04`,`js/08`,`js/10`) — 종목별 실행
   가이드 카드 2종(보유/구성제외)의 금액 4칸, `stockAnalysisStatTile`(종목분석 팝업 통계 타일 - 섹터
   비중 비교처럼 긴 문자열이 나올 수 있어 `whitespace-nowrap`이 아니라 `truncate`+`title` 툴팁 적용),
   자산상세 팝업 통화별 행, 몬테카를로 합계 텍스트에 줄바꿈 방지 보강.
3. **실데이터 기반 정합성 검증** — 클린 상태에서 두 엑셀을 실제 내부 표현(`state.assets`/
   `state.transactions`)으로 정확히 재구성(거래내역→자산 자동계산 함수 `syncAssetsFromTransactions()`가
   계산한 최종 보유 수량·매수단가가 첨부된 별도 자산 스냅샷과 완전히 일치 - 소름끼치게 정확한 교차검증),
   신랑/와이프 목표비중·적립금 배분을 국채/현금/달러 포함해 실제 팝업 함수로 설정한 뒤 μ/σ/포지션
   비중/몬테카를로를 전부 손계산으로 대조 - 전부 정확히 일치(자세한 수치는 이번 대화의 최종 보고서
   참고, 대화 로그에 있음). 이 테스트 데이터(26개 자산, 31건 거래, 목표비중/적립금 설정 포함)는
   그대로 브라우저에 남겨뒀다(정리하지 않음 - 사용자가 이어서 볼 수 있게).

### 다음 세션이 알아야 할 것
- 이번 요청은 모두 완료·검증됨.
- 리스크 진단 카드의 "역사적 하락장 스트레스 테스트"(2020/2022)는 이번에 건드리지 않았고, 이 PC의
  샌드박스가 시세 API를 CORS로 막아 베타/낙폭 수치를 제대로 검증하지 못했다(계산이 에러 없이 도는
  것만 확인) - 실제 배포 환경에서 한 번 더 확인해볼 가치가 있다(특히 이번에 `portfolioBeta`가
  음수로 나온 것을 우연히 봤는데, 정상 범위인지 다음 세션에서 살펴볼 것).
- `git pull` 먼저 해서 이 커밋(v202)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 4) — 커밋 시 버전 v204

**커밋**: 사용자 승인 대기 중. 바로 아래 "v203" 섹션과 같은 날 같은 세션의 연속 - 실제 배포 사이트에서
사용자가 직접 보고한 버그 수정.

### 이번에 완료 + 실측 검증된 작업

1. **가족 동기화가 과거 일별 손익 이력을 지우는 버그 수정** (`js/12-import-export-sync.js`) — 사용자가
   실제 배포 사이트에서 "서버 동기화"를 한 뒤 [일별 손익 추이] 그래프에 오늘(9/3) 하루치만 남고
   9/1~9/2가 사라졌다고 스크린샷과 함께 신고했다.
   - **원인**: `applyRemoteScalarFields(parsed)`가 `dailySnapshots`(날짜별 일간손익 기록)를 환율/
     리밸런싱 목표/자산예측 설정 같은 "지금 이 순간의 설정값"과 똑같이 취급해 `state.dailySnapshots =
     parsed.dailySnapshots`로 **통째 교체**했다. 이 함수는 JSON 복원과 클라우드 동기화(`pullFromCloud`)
     양쪽에서 공용으로 쓰이는데, "원격이 최신이면 통째 교체"는 JSON 복원(의도적으로 그 시점에
     되돌리기)에는 맞지만 클라우드 동기화에는 틀리다 - 배우자 기기가 거래 하나만 추가해도 전체 버전
     번호가 올라가고, 그 시점 배우자 기기의 dailySnapshots가 이 기기보다 이력이 짧으면(예: 최근에야
     켠 기기) pull 한 번으로 이 기기가 쌓아온 과거 이력이 통째로 사라진다.
   - **수정**: 자산/거래내역이 이미 "JSON 복원=통째 교체(`applyRemoteState`) vs 클라우드 동기화=id
     단위 병합(`mergeAssetsAndTransactionsWithRemote`)"으로 나뉘어 있는 것과 동일한 원칙으로,
     dailySnapshots도 공용 함수(`applyRemoteScalarFields`)에서 완전히 빼서 각 호출부가 자기 정책을
     직접 적용하게 했다 - `applyRemoteState`(JSON 복원)는 기존처럼 통째 교체 유지, `pullFromCloud`의
     일반 동기화 경로(`mergeAssetsAndTransactionsWithRemote`)와 최초 페어링(`fullAdopt`) 경로는
     둘 다 **날짜 키 단위로 병합**(`{...remote, ...local}` - 같은 날짜면 로컬 값 우선, 한쪽에만 있는
     날짜는 그대로 보존)하도록 바꿨다 - `learnedTickerNames`/`tickerRoles`가 이미 이 함수 밖에서
     호출부별로 다르게(순수 추가형 캐시는 병합) 처리되고 있던 것과 동일한 구조를 그대로 재사용했다.
   - **실측 검증**: 로컬(9/1~9/3 보유) vs 원격(9/3만 보유, 다른 값) 상황을 그대로 재현해
     `mergeAssetsAndTransactionsWithRemote`를 직접 호출 → 병합 후 3개 날짜 모두 보존, 겹치는 9/3은
     로컬 값이 정확히 우선함을 확인. JSON 복원(`applyRemoteState`)은 여전히 통째 교체임을 코드로
     재확인(이쪽은 의도된 동작이라 그대로 둠).

### 다음 세션이 알아야 할 것
- 이 버그는 "실제 배포 사이트"에서 사용자가 실사용 중 겪은 진짜 데이터 손실이었다 - v204 배포 후
  사용자가 다시 동기화를 걸어 과거 이력이 살아있는지 실사용 확인을 부탁드릴 것(이미 동기화로 한쪽
  기기의 이력이 지워진 상태라면, 그 데이터 자체는 이 수정으로 되살아나지 않는다 - 앞으로의 동기화만
  안전해진다. 만약 지워지기 전 JSON 백업이 있다면 그걸로 복원하면 살릴 수 있음을 안내할 것).
- 브라우저 도구로 실제 배포 사이트(key4125-netizen.github.io/jasan)에 접속해 몬테카를로/베타를 다시
  확인해 달라는 이전 요청은, 외부 사이트 상호작용을 막는 정책 검사 서비스가 일시적으로 다운되어
  완료하지 못했다(로컬 미리보기는 정상 동작 확인, `example.com` 등 다른 외부 사이트도 동일하게 막혀
  있어 이 사이트/작업과 무관한 인프라 문제로 확인) - 사용자가 직접 확인하기로 함, 다음 세션에서
  다시 시도해볼 수 있다.
- `git pull` 먼저 해서 이 커밋(v204)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 3) — 커밋 시 버전 v203

**커밋**: 사용자 승인 대기 중. 바로 아래 "v201" 섹션과 같은 날 같은 세션의 연속 - 실데이터 정합성
전수검증(v202) 다음 회차.

### 이번에 완료 + 실측 검증된 작업

1. **몬테카를로 σ=27.8%·베타 마이너스 재조사 - 코드 버그 아님으로 결론** (조사만, 코드 변경 없음) —
   사용자가 이 두 수치를 "namedHolding 처리 오류의 결정적 증거"로 보고 긴급 수정을 요청했으나, 실제
   계산 경로를 직접 재현해 반증했다:
   - `computeTargetPortfolioVolatilityPct()`(js/05)를 그대로 재현해 국채/현금/달러가
     `zeroVolSkipped:true`로 정확히 제외되는 것을 직접 확인 - 27.8%는 SK하이닉스(91.6%)/삼성전자
     (75.7%)/KODEX 200TR(59.0%) 등 **국내 종목들의 실측 개별 변동성**에서 나온 값이었다.
   - `riskEligibleAssets()`(js/09:606)가 `ticker !== ''`을 요구해 애초에 국채/현금/달러가 스트레스
     테스트/베타 계산에 입력되지도 않음을 코드로 확인 - namedHolding이 이 계산에 영향을 줄 방법 자체가
     없다.
   - 마이너스 베타의 실제 원인을 추적한 결과, 이 브라우저에 캐시된 KOSPI 벤치마크 데이터가
     `getCachedDailyCloses('^KS11')` 기준 243거래일 만에 3184→6579(+106%)로 비현실적인 값이었다
     (나스닥100은 같은 기간 +24%로 정상) - **계산식은 정확하고, 이 테스트 환경에 캐시된 국내 가격
     이력 자체가 실제 시장과 다른 값**이라는 결론.
   - P10 곡선이 연도 사이 1~6%씩 미세하게 흔들리는 현상은 실재하나, 매 연도 10,000회를 독립적으로
     새로 뽑아서 생기는 정상적인 몬테카를로 표본오차(namedHolding과 무관) - 원하면 반복횟수 증가나
     연도 간 공통난수 방식으로 매끈하게 다듬을 수 있다고 안내, 아직 요청 없음.

2. **목표비중 모달 - 종목 마스터 DB에 없는 보유 티커 검색 지원** (`js/04-rebalancing.js`) — 사용자
   실측 신고: 보유 중인 "TIGER 코리아배당다우존스"(0052D0.KS)가 목표비중 모달의 "+ 종목 추가"에서
   검색이 안 됨(적립금/절세계좈 두 팝업은 정상). 원인: 이 티커가 종목 마스터 DB(16,309건, 매달 갱신)
   에 없는데(코드 형식도 표준 6자리 숫자가 아닌 `0052D0` - 원본 데이터 오기 가능성 있어 사용자에게
   안내함), 목표비중 모달의 티커형 후보는 마스터 DB만 봤기 때문(다른 두 팝업은 `searchLocalHoldings`로
   보유 자산도 함께 봐서 문제없었음). `searchRtmAddCandidates`가 이제 마스터 DB 결과에 없는 티커를
   소유자+지역 기준 실제 보유 자산에서 추가로 찾아 병합하고(최대 10개는 그대로 유지), 그 자산의
   role도 이어받는다.
   - **실측 검증**: 수정 직후 v203 리로드로 확인 → 이 종목이 이제 검색되고, role도 자산에 태깅해둔
     값(코어미드필더)이 그대로 붙어서 draft에 들어감. 기존 마스터 DB 검색(삼성전자 등)도 회귀 없이
     정상 동작 확인.
   - **작업 중 자체 발견 버그**: 이 수정을 넣으면서 `qLower`를 같은 함수 안에서 두 번 `const` 선언한
     오타가 있었다 - 이게 `js/04-rebalancing.js` 전체를 파싱 실패시켜 `openRebalanceTargetModal` 등
     이 파일의 모든 함수가 `undefined`가 되는 전체 장애였다. 브라우저에서 재로드해 콘솔에
     `openRebalanceTargetModal is not defined`가 뜨는 것을 보고 즉시 발견·수정했다 - 커밋 전에
     반드시 실제로 리로드해서 확인하는 절차 덕에 잡힌 사례.

### 다음 세션이 알아야 할 것
- σ/베타 관련해서는 코드를 고치지 않았다 - "이 브라우저의 가격 캐시를 지우고 실제 배포 사이트에서
  다시 확인해보라"고 안내했고, 사용자가 아직 그 결과를 안 알려줬다. 이 주제가 다시 나오면 이미
  코드 레벨에서 반증했다는 사실을 먼저 알릴 것(위 1번 항목 근거 그대로 재사용 가능).
- P10 표본오차 스무딩(반복횟수 증가/공통난수)은 제안만 했고 아직 요청받지 않았다.
- `git pull` 먼저 해서 이 커밋(v203)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속 2) — 커밋 시 버전 v201

**커밋**: 사용자 승인 대기 중. 바로 아래 "v200" 섹션과 같은 날 같은 세션의 연속.

### 이번에 완료 + 실측 검증된 작업

1. **앱 전반 세로 길이 압축** (`index.html`) — 사용자가 미래예측 탭 모바일 스크린샷을 첨부하며 지적.
   - [적립금 설정]/[수익률 관리]/[절세계좈 적립설정] 버튼 3개: `py-1.5` → `py-1`(절세계좈 버튼은
     `.touch-target`(44px 최소) 클래스가 있어 실제 렌더 높이는 그대로 유지됨 - 패딩만 코드상 통일).
   - 카드(`rounded-2xl` 섹션) 8곳(일간금융평가손익/리스크관리/KPI 2개/절세계좈 현황/시나리오별
     일반계좈·총자산 그래프/몬테카를로): 고정 `p-4` → 반응형 `p-3 sm:p-4`(모바일만 축소, 데스크톱은
     그대로).
   - 카드 사이 여백(`mb-6`): 컨텐츠 섹션 전부 `mb-4`로 축소(헤더/탭바 등 구조적 여백은 그대로 둠).
   - **팝업 전체**: 헤더/본문/푸터 안쪽 여백 `px-5 py-4` → `px-4 py-3` 일괄 축소(같은 리터럴 문자열이
     전부 모달 헤더/본문/푸터였음을 먼저 확인 후 전체 치환 - 20개 넘는 팝업 전부 적용).
   - **검증**: 모바일 뷰포트(375px) 라이트/다크 모드 스크린샷으로 시인성/줄바꿈 확인 - 기존
     whitespace-nowrap 방지 규칙(KPI 카드 태그 줄 등) 그대로 유지됨을 확인, 터치 버튼도 여전히
     불편하지 않은 크기.

2. **'코어미드필드' → '코어미드필더' 용어 수정** (`js/01`, `js/04`, `js/05`, `index.html`) — 화면에
   보이는 한글 라벨(옵션/카드 타이틀/드릴다운 탭/코멘트) 전부 교체, 내부 저장 키(`core_mid`)는
   변경 없음(하위 호환·기존 데이터 영향 없음).

### 다음 세션이 알아야 할 것
- 이번 요청은 모두 완료·검증됨 - 추가 확인 대기 항목 없음.
- "전수 조사"를 문자 그대로 모든 Tailwind 클래스 하나하나까지 다 훑은 것은 아니다 - 카드/팝업의
  주요 반복 패턴(`p-4`/`mb-6`/`px-5 py-4`)을 데이터 기반으로(grep 카운트) 찾아 일괄 적용했다. 특정
  화면이 여전히 길다는 피드백이 오면 그 화면을 지목해서 알려달라고 할 것.
- `git pull` 먼저 해서 이 커밋(v201)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 계속) — 커밋 시 버전 v200

**커밋**: 코드 커밋은 사용자 승인 대기 중(이 인계장 갱신도 같은 승인 범위 안에서 함께 커밋됨). 바로
아래 "v199" 섹션과 같은 날 같은 세션의 연속 - v199에서 발견한 namedHolding 버그를 실제로 고친 회차.

### 이번에 완료 + 실측 검증된 작업

1. **목표비중 수정 팝업 "+ 종목 추가" 버튼 모바일 시인성 개선** (`index.html`) — 라이트/다크 모드
   모바일 화면에서 점선 테두리+회색 글자+배경 없음이라 거의 안 보이던 것을, 브랜드색(인디고) 옅은
   배경 채우기+굵은 글자+실선 테두리로 바꿔 두 테마 모두에서 뚜렷하게 도드라지게 했다(스크린샷으로
   라이트/다크 양쪽 확인).

2. **`namedHolding`(티커 없는 보유 자산) 포지션(역할) 자동 연동 전면 개선** — v199에서 실측으로 확인한
   버그("목표비중/적립금 설정/절세계좈 적립설정 어디서도 국채·현금·달러 같은 티커 없는 자산은 role이
   자동으로 안 이어짐")를 실제로 고쳤다.
   - **레지스트리 확장** (`js/01-core-state.js`): `state.tickerRoles`의 키 규칙을
     `buildCustomRateKey`(js/05, 수익률 오버라이드가 이미 쓰던 "티커 우선, 없으면 'NAME:정규화이름'"
     규칙)로 통일 - `getTickerRole(ticker, name)`/`setTickerRole(ticker, role, name)`가 이제 셋째
     인자로 이름을 받아 티커 없는 자산도 조회/저장할 수 있다(기존 호출부는 name 생략 시 예전과 동일하게
     동작 - 하위 호환).
   - **쓰기(자동 연동) 지점 확장**: 자산관리 폼 저장(`js/07`), 거래내역 저장(`js/06`), 목표비중 모달
     [확인] 커밋(`syncTickerRolesFromRebalanceTargets`, `js/04`), 절세계좈 적립설정 role
     select(`js/05`), 적립금 설정 [저장](`js/05`) - 전부 티커가 없으면 이름으로 레지스트리에 반영하도록
     확장. 1회성 마이그레이션(`seedTickerRolesFromLegacyStorageOnce`)도 함께 확장했으나 이미 실행된
     기기에서는 재실행되지 않으므로, 실제 검증은 레지스트리에 직접 값을 넣어 확인했다(아래 참고).
   - **읽기(자동 채움) 지점 확장**: 목표비중 모달의 이름검색 추가(`searchRtmAddCandidates`/
     `renderRtmAddSearchResults`), 절세계좈 적립설정의 `roleFor`/검색 후보 추가, 적립금 설정의
     `withRoleFallback`/검색 후보 추가 - 모두 "검색 후보가 실어 보낸 실제 보유 자산의 role(있으면
     최우선) → 레지스트리(이름 키)" 순으로 자동 채운다.
   - **부수 발견 - 키 충돌 버그**: namedHolding 항목은 `category`/`ticker`가 없어서, 같은 지역/계좈에
     티커 없는 항목이 둘 이상(예: "국채"+"현금") 있으면 전부 빈 문자열 키로 뭉개져 비중·역할이 서로
     덮어써지고 있었다(σ 계산의 `computeOwnerTargetInstrumentWeights`, 절세계좈의 `pctFor`/`roleFor`,
     적립금 설정의 중복 판정 전부 동일한 원인). 새 `allocEntryIdentity(ticker, label)`(js/05)로 통일해
     세 팝업 모두에서 함께 고쳤다.
   - **절세계좈 적립설정 - 티커 없는 후보 노출**: `renderTaxAddSearchResults`가 `r.symbol` 있는 것만
     보여주던 필터를 제거 - 이제 국채/현금도 검색되고 추가할 수 있다. 또한 `plannedRows`(미보유 상태로
     이름검색만으로 추가한 항목)가 `it.ticker` 진리값으로만 걸러져 티커 없는 계획 항목은 화면에 영원히
     안 보이던 사각지대도 함께 고쳤다.
   - **적립금 설정 - 검색 노출 불안정 버그**: `searchLocalHoldings`가 모듈 전역 `stockSearchTargetMode`
     (거래 추가 모달 전용 상태)를 직접 읽어, 그 값이 우연히 `'transaction'`으로 남아있으면 원화 현금이
     검색에서 빠지는 일관성 없는 버그가 있었다(사용자가 v199 답변에서 직접 지적) - 함수가 명시적
     `excludeTransactionKrwCash` 매개변수를 받도록 바꿔, 거래 추가 모달 자신만 그 값을 넘기고 나머지
     호출부(적립금 설정/절세계좈/수익률 관리)는 전역 상태와 완전히 무관해졌다.
   - **실측 검증**(브라우저 콘솔에서 실제 보유자산+role 등록 후 세 팝업 전부 직접 조작): 목표비중
     모달에서 "국채"(role=defender) 이름검색 추가 시 draft에 role이 즉시 채워지고 select도 "수비수"로
     보임, 확인 커밋 후 `computeOwnerTargetRoleWeights`가 정확히 반영. 적립금 설정에서 "국채"(defender)
     +"현금"(core_mid)을 연달아 추가해도 서로 안 겹치고 각자 role 유지, "이미 배분된 종목입니다" 오탐
     없음. 절세계좈 적립설정에서 IRP 계좈에 이미 보유 중인 "국채"+"현금"(계좈 안에 둘 다 있는 상태)의
     role select가 각각 정확히 수비수/코어미드필드로 표시, 검색으로 "삼성전자"(레지스트리 등록된 티커)를
     같은 계좈에 새로 추가하면 role이 자동으로 채워지고 "(미보유)" 행으로 정상 노출.

### 다음 세션이 알아야 할 것
- 이번 요청은 모두 완료·검증됨 - 추가 확인 대기 항목 없음.
- `seedTickerRolesFromLegacyStorageOnce`의 namedHolding 확장분은 이미 마이그레이션이 실행된 기기에서는
  재적용되지 않는다(의도적, 플래그 `sam_ticker_roles_seeded_v1`) - 실제 사용자 데이터에 이미 있는
  티커 없는 보유 자산(국채/현금/달러 등)의 role이 아직 레지스트리에 없다면, 자산관리 화면에서 그
  종목의 역할을 한 번 다시 저장(또는 재선택 후 저장)하면 이번 세션에서 확장된 쓰기 경로를 타고 자동으로
  채워진다.
- `git pull` 먼저 해서 이 커밋(v200)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC) — 커밋 시 버전 v199

**버전**: v198 → v199. 코드 커밋은 사용자 승인 대기 중(이 인계장 갱신도 같은 승인 범위 안에서 함께
커밋됨 - `CLAUDE.md` 인계장 워크플로우 참고).

### 이번에 완료 + 실측 검증된 작업

1. **몬테카를로 범례/툴팁 표시 순서 재반전** (`js/05-future-projection.js`) — v193에서 낙관→중앙값→
   보수(P90→P50→P10)로 정렬했던 것을 사용자 요청으로 다시 보수→중앙값→낙관(P10→P50→P90)으로
   뒤집었다. `MONTE_CARLO_DISPLAY_ORDER` 맵 하나만 바꾸면 범례와 "그래프 클릭 시 뜨는 툴팁(팝업)"
   둘 다 같은 값을 쓰므로 함께 반영된다 - 실제 차트 인스턴스의 `legend.legendItems`/`itemSort` 정렬
   결과를 콘솔에서 직접 호출해 확인했다.

2. **`namedHolding`(티커 없는 보유 자산 이름검색으로 추가된 목표) 기대수익률·변동성 버그 수정** —
   **버그 발견 경위**: 사용자가 첨부한 실제 엑셀 파일(`자산관리_2026-09-03 v0.xlsx`, 이 PC에 python/
   node가 없어 PowerShell로 xlsx 내부 XML을 직접 풀어서 읽음)에 "국채"(신랑, 국내)/"현금"(신랑,
   국내)/"달러"(신랑, 해외) 티커 없는 실보유 자산이 있었고, 사용자가 "수익률 관리 기준" 시트에 이미
   국채=4%/현금=3%/달러=3%(일반적 기준) 커스텀 수익률까지 등록해뒀다. 이 세 이름을 목표비중 모달의
   "+ 종목 추가" 이름검색으로 개별 목표(`namedHolding`)에 추가했다고 가정하고 실제 함수를 그대로
   호출해보니 **7%/7%/9%(지역 대표지수 KOSPI/S&P500)로 부풀려짐**을 실측으로 확인했다(원인: `namedHolding`
   타입은 `category` 필드가 없는데, `getTargetProjectionRate`/`computeOwnerTargetInstrumentWeights`
   둘 다 "그 외 = category형 목표"로 가정하고 분기해 이름 자체를 한 번도 안 봄).
   - **μ 수정** (`getTargetProjectionRate`, js/05): `type==='ticker'`와 동일하게 사용자 등록
     오버라이드(`findCustomRateKeyForAsset`)·키워드 매칭(`getCustomKeywordRateKey`)을 이름 기준으로
     먼저 시도하고, 등록이 없으면 자산 등록 시와 동일한 `classifyCategory('', name)`(js/01,
     BOND_KEYWORDS/CASH_KEYWORDS)로 채권/현금 여부를 추론해 그래도 안 되면만 지역 지수로 폴백.
   - **σ 수정** (`computeOwnerTargetInstrumentWeights`/`computeTargetPortfolioVolatilityPct`, js/05):
     `v.kind==='namedHolding'`이면 `v.category` 대신 `classifyCategory('', v.name)`으로 채권/현금
     여부를 판정해 변동성 0 처리. 부수적으로 발견한 **키 충돌 버그**도 함께 고쳤다 - namedHolding은
     `category`가 없어서 같은 지역의 서로 다른 namedHolding 두 개(예: "국채"와 "현금")가 전부 같은
     맵 키(`C:지역:undefined`)로 뭉개져 비중이 하나로 합산되고 있었다 - `N:지역:이름` 형식의 고유
     키로 바꿨다.
   - **실측 검증**(브라우저 콘솔에서 실제 함수 직접 호출): 커스텀 수익률 등록 상태에서 국채/현금/달러
     = 4%/3%/3%(사용자 의도값과 정확히 일치), 등록 없는 상태에서는 4%/0%/0%(BOND 프리셋/CASH 0% 폴백
     정상 동작). σ 쪽은 이 샌드박스 브라우저가 외부 시세 API를 CORS로 막아 종단간(σ 최종값) 검증은
     못 했지만, 함수 안에서 실제로 쓰는 분류 조건(`classifyCategory('', name) === '채권'/'현금'`)을
     그대로 재현해 국채/현금/달러 전부 zero-vol 분기로 스킵됨을 확인했고, "금현물"처럼 채권/현금
     키워드에 안 걸리는 이름은 여전히(의도대로) 지수 근사로 감을 확인했다. 키 충돌 수정도 서로 다른
     이름의 namedHolding 두 개를 동시에 넣어 서로 다른 weight로 별도 유지됨을 확인했다.

3. **목표비중 수정 팝업 — 빈 상태(Zero-base) 시작** (`js/01-core-state.js`) — 예전엔 신규 owner(저장된
   목표가 전혀 없는 첫 실행)를 만들면 `DEFAULT_REBALANCE_TARGETS`가 KODEX 200TR/TIGER
   코리아배당다우존스/채권/현금(국내), QQQM/SPYM/SCHD/현금(해외) 예시 포트폴리오를 자동으로 채워
   넣었다 - 이제 완전히 빈 배열(`{국내:[], 해외:[]}`)로 시작해, 사용자가 "+ 종목 추가"로 직접 고르지
   않은 종목은 절대 나타나지 않는다. 곁들여 `ensureForeignCategoryCatchalls`(불러올 때마다 해외
   목표에 0%짜리 "현금" 캐치올을 자동으로 끼워넣던 함수)도 완전히 제거했다 - 더 이상 자동으로 채워
   넣는 "기본 항목"이 하나도 없다. **이미 저장돼 있는 기존 사용자의 목표비중은 전혀 영향받지 않는다**
   (`normalizeRebalanceOwnerTargets`는 저장된 값이 있으면 그대로 쓰고, 없을 때만 이 빈 기본값을 씀 -
   `normalizeRebalanceOwnerTargets(undefined)` 직접 호출로 빈 배열이 나옴을 확인). 실제 모달을 열어
   "설정된 목표 항목이 없습니다" 빈 상태 UI가 정상 렌더링되고 합계 배지가 "0%"를 경고 없이(초록색)
   보여주는 것도 스크린샷으로 확인.

### 다음 세션이 알아야 할 것
- 이 세 가지 모두 사용자가 직접 지시한 작업이라 별도 확인 대기 항목 없음.
- namedHolding σ의 종단간(end-to-end) 실측은 이 개발 PC의 샌드박스 브라우저가 외부 시세 API를 CORS로
  막아서 못 했다(σ 계산에 쓰는 분류 로직 자체는 직접 재현해 검증 완료) - 실제 배포 환경(정상적으로
  시세 조회가 되는 환경)에서 namedHolding으로 채권/현금을 추가한 뒤 몬테카를로 σ가 실제로 안 오르는지
  한 번 더 확인해보면 좋다.
- `git pull` 먼저 해서 이 커밋(v199)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 세 번째 세션 계속 2) — 커밋 시 버전 v198

**커밋**: `85e92be` (코드, v197→v198를 한 번에 묶어 커밋) — 인계장 커밋은 이 파일 갱신 직후 별도로 이어짐.
바로 아래 "v196" 섹션과 같은 날 같은 세션의 연속. 오늘 세션은 여기서 마무리(사용자가 "오늘 작업은
여기까지" 로 종료 선언).

### 이번에 완료 + 실측 검증된 작업

1. **KPI 카드 현금/달러 분리 표시** (v197, `js/02-dashboard-kpi.js`) — "총자산평가금액/총자산투자금액/
   총평가손익/일간금융평가손익" 카드 하단 자산군별 태그에서 원화 현금과 달러(USD) 현금을 "현금"/
   "달러" 별도 항목으로 갈라서 보여준다. **핵심 설계 - 표시 전용 분리**: 새 `categoryDisplayKey(a)`
   함수가 태그 렌더링에서만 `a.category==='현금'&&a.currency==='USD'`를 '달러'로 바꿔치기하고,
   자산의 실제 `category` 필드 자체는 절대 안 건드린다 - 아래 "다음 세션이 알아야 할 것"에 적은
   설계 논의 참고(자산군을 진짜로 쪼개는 건 명시적으로 기각됨).
2. **목표비중 수정 팝업 - 티커 없는 보유 자산 이름 검색 추가** (v197, `js/04-rebalancing.js`) —
   "+ 종목 추가" 검색이 예전엔 종목 마스터 DB(티커 있는 종목)만 찾았다 - 이제 이 팝업을 연 소유자가
   실제 보유 중인, 티커 없는 자산(채권/현금/부동산 등)도 이름으로 검색해 새 목표 항목
   `type:'namedHolding'`으로 추가할 수 있다. `computeRegionTargetAmounts`에 이름 매칭 패스를
   티커 매칭과 카테고리 캐치올 매칭 "사이"에 추가(특정 보유분이 캐치올보다 먼저 클레임됨). 역할
   select/삭제 버튼 등 기존 렌더링 함수들이 이미 타입에 무관하게 동작하도록 짜여 있어서 별도 수정
   없이 자동으로 지원됨.
3. **목표비중 모달 금액 줄바꿈 정비** (v198, `js/04-rebalancing.js`) — 개별 목표 항목(예: KODEX
   200TR)의 "목표금액 X원" + "조정금액 Y원"이 별도 두 줄이던 것을 "목표금액 X원 Y원" 한 줄로 합쳤다
   (이 영역은 모달 폭 전체를 써서 한 줄에 들어간다). 반면 상단 국내/해외 split 미리보기(2열 그리드라
   좁아서 한 줄에 안 들어감)는 CSS Grid(`grid-template-columns:auto auto`)로 짜서, 2번째 줄
   (조정금액)이 "목표금액" 라벨이 아니라 그 옆 금액 숫자가 시작하는 자리에 정확히 정렬되도록 했다.
4. **시나리오 요약 카드 "기대수익률" 한 줄 표기** (v198, `js/05-future-projection.js`) — "기대수익률"
   라벨과 "%"값이 별도 두 줄이던 것을 "기대수익률 7.67%" 한 줄로 합쳤다.
5. **축약 금액 표기를 "X.XX억" 형식으로 통일** (v198, `js/01-core-state.js` 핵심) — `fmtKRWShort()`가
   1억 이상 금액을 "10억2,060만원" 대신 소수점 둘째 자리까지의 억 단위("10.21억")로 표기한다 -
   **1억 미만은 기존처럼 만원/원 단위를 그대로 쓴다**(의도적 - 안 그러면 종목 상세의 주당 가격이나
   핵심종목 카드의 소액 일간손익 같은 곳이 "0.00억"으로 정보가 사라져 보인다). 이 함수 하나만
   고쳐서 KPI 카드 태그/몬테카를로 차트·표/시나리오 비교 차트·표 등 전 사용처에 자동으로 통일
   적용됨(차트 Y축 인라인 포맷터·스케줄 표 로컬 fmtEok 헬퍼도 전부 이 함수를 직접 호출하도록 정리).
   소수점 자릿수(2자리)와 적용 범위(축약 표기만, 원 단위 정밀 표기 `fmtKRW`/`fmtSigned`는 그대로 유지)
   는 AskUserQuestion으로 사용자에게 직접 확인받고 진행했다.

### 설계 논의 (코드 변경 없음, 但 중요한 결정 - 다음 세션이 알아야 함)
- **엑셀에서 달러 자산의 자산군을 '현금'→'달러'로 바꾸는 것에 대해 사용자가 여러 차례 질문/제안했으나
  최종적으로 하지 않기로 함.** 이유: `category==='현금'`을 직접 검사하는 코드가 최소 7개 파일
  15곳 이상에 흩어져 있다(일간손익 환차 계산, 자산상세 팝업의 달러 현금 전용 UI, 리밸런싱 캐치올
  매칭, 거래내역 자동 동기화 가드 등) - 자산군을 진짜로 쪼개면 이 전부를 놓치지 않고 같이 고쳐야
  하고 기존 데이터 마이그레이션도 필요해 회귀 위험이 크다. 특히 "대표매칭(수익률연동키)" 컬럼은
  일간손익 계산과 완전히 무관한 별개 시스템(미래예측 전용)이라, 대표매칭만 CASH.USD로 맞춰도
  일간손익에는 전혀 반영되지 않는다는 점도 명확히 안내함. **대신 위 1번(KPI 카드 표시만 분리)으로
  타협** - 자산군 필드는 그대로 두고 표시 레이어에서만 나눴다.
- **엑셀 "수익률 관리 기준" 시트(2번째 시트)가 이미 완성돼 있음을 재확인**: 대표매칭 키/키워드/
  보수·일반·긍정 수익률을 엑셀에 적어 올리면 `state.projection.customScenarioRates`에 자동
  업서트된다(`js/12-import-export-sync.js`). 또한 "고아 키"(계산엔 쓰이는데 미등록인 키)는
  `getScenarioRateDisplayRows()`가 자동 감지해 "수익률 관리" 팝업에 노출한다 - 사용자가 이 기능의
  존재를 몰랐던 것뿐, 이미 다 구현돼 있었다.

### 다음 세션이 알아야 할 것
- **(이월) 몬테카를로 v193 항목의 범위 판단**: "시나리오별 일반계좈/총자산" 카드는 P10/P50/P90이
  아니라 보수적/일반적/긍정적 3개 시나리오를 쓰는 별개 함수라 낙관>중앙값>보수 정렬 요청 대상에서
  제외했다고 보고했으나 사용자가 아직 확인/반박하지 않았다.
- **(이월) 천단위 콤마 적용 범위**: 원단위 정수 금액 입력창(절세계좈 적립설정/적립금 설정/매수
  검토 금액) 3곳에만 적용돼 있다. 더 추가하려면 `attachThousandsInputFormatting()`을 그 input에
  붙이면 되지만, 소수점 입력(`step="any"`)에는 그대로 못 쓴다(현재 `formatInputNumber`는 정수 전용).
- **(신규) 축약 금액 "X.XX억" 형식의 소수점/범위는 AskUserQuestion으로 직접 확인받은 결정**이다 -
  나중에 "1억 미만도 억 단위로 통일해달라"는 요청이 오면 `fmtKRWShort`의 `abs >= 1e8` 분기 조건을
  없애면 되지만, 그러면 주당 가격 등 소액 표기가 "0.00억"이 되는 트레이드오프를 다시 안내할 것.
- `git pull` 먼저 해서 이 커밋(v198)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 세 번째 세션 계속) — 커밋 시 버전 v196

**커밋**: `d1b5962` (코드, v193→v196를 한 번에 묶어 커밋) — 인계장 커밋은 이 파일 갱신 직후 별도로 이어짐.
바로 아래 "v193" 섹션과 같은 날 같은 세션의 연속이다(사용자가 버그 리포트 1건 + 추가 요청 4건을
연달아 보내와서 매번 커밋하지 않고 v196으로 한 번에 묶었다).

### 이번에 완료 + 실측 검증된 작업

1. **버그 수정 - '주식' 캐치올 제거 후 미지정 보유 종목이 목표비중 총액에서 누락됨** (v194,
   `js/04-rebalancing.js`) — 사용자 신고: "와이프 목표비중 수정 팝업에서 와이프 자산을 못 끌고
   오는것 같다". 원인: v191에서 '주식' 캐치올을 없애면서, 목표 티커로 안 잡힌 보유 주식/ETF가
   부동산 같은 실물자산과 똑같이 계산에서 빠져 "현재 보유금액"이 실제보다 적게 표시됐다. 수정:
   `computeRegionTargetAmounts`가 미지정 주식/ETF를 `uncoveredStockTotal`로 별도 집계하고
   `getRebalanceTotals`가 이를 합산에 포함(부동산 등 실물자산은 계속 제외). 실행 가이드의 "구성
   제외 자산" 카드도 미지정 종목은 "목표 미지정 종목 · 전량 매도 검토"로 라벨을 구분했다.
2. **전체 포지션별 목표비중 분석 카드 - 중복 종목 병합 + 아코디언 제거** (v195, `js/04-rebalancing.js`,
   `index.html`) — 부부 합산 드릴다운에서 신랑/와이프가 같은 티커를 각자 목표로 가지면(예: 둘 다
   SCHD) 한 줄로 병합해 "SCHD (부부합산)"로 표기(`buildPositionDrilldownRows`, 티커 없는 캐치올은
   병합 대상 아님). 이 가구합산 카드만 아코디언을 완전히 제거해 항상 펼쳐진 채로 상시 노출 -
   신랑/와이프 개별 카드는 그대로 아코디언 유지(`positionAnalysisAccordionOpen`에서 `all` 키 제거).
3. **절세계좈 현황 카드 - "일반계좈 기준" 문구/데이터 오류 수정** (v196, `js/05-future-projection.js`)
   — 카드 상단이 실수로 일반계좈 목표비중(computePositionRoleBreakdown)을 참조해 절세계좈 카드에
   "일반계좈 기준" 문구가 섞여 나왔다. `getTaxAdvantagedRoleBreakdown(ownerFilter)`를 owner 필터
   받도록 확장해 상단(부부합산, ownerFilter 생략)/계좈 세부(개인)가 전부 절세계좈 "실제 보유" 기준
   하나만 쓰도록 통일했다.
4. **절세계좈 적립 예상 팝업 하단 결과표 모바일 줄바꿈 방지** (v196) — `<td>` 금액 셀에
   `whitespace-nowrap` 누락이 원인, 추가로 해결. 375px에서 "5억1,816만원" 같은 큰 금액도 한 줄 유지,
   넘치는 열은 표 자체가 가로 스크롤됨을 확인.
5. **전사적 입력창 천단위 콤마 자동 포맷팅** (v196, `js/01-core-state.js` 핵심) — **`num()` 자체를
   쉼표 허용(`replace(/,/g,'')`)으로 바꾼 게 핵심 설계 결정** - 이 앱의 숫자 읽기가 전부 num()을
   거치므로, 이 한 줄 수정만으로 기존 코드 전부가 콤마 입력을 자동으로 안전하게 처리하게 됐다(개별
   read 지점을 일일이 고칠 필요 없음). 새 유틸 `formatInputNumber`/`parseInputValue`/
   `attachThousandsInputFormatting`(커서 위치 보존 로직 포함, 실측 검증 완료) 추가. **적용 범위는
   의도적으로 제한**했다 - 절세계좈 적립설정 금액, 적립금 설정(월 적립 총액), 매수 검토 금액처럼
   "원 단위 정수 금액" 입력창에만 적용하고, 수량/매입단가/비율/환율처럼 소수점이 의미 있는 입력창은
   콤마 처리 시 소수점이 깨질 위험이 있어 제외했다(요청은 "모든 입력창"이었으나 안전을 위해 범위를
   좁혔고, 이 판단을 사용자에게 보고했다 - 아직 반박/추가 지시 없음).
6. **모바일 금액 줄바꿈 전수 조사** (v196) — whitespace-nowrap이 빠져 있던 지점을 찾아 일괄 보강:
   대시보드 핵심종목 테이블(js/02), 몬테카를로 예상표(js/05), 거래내역 실현손익 합계행(js/07),
   자산상세 2열 그리드(js/08), 리스크 진단 카드(js/10), 총자산/총평가손익 추이 팝업(js/11).

### 알아둘 점 / 다음 세션이 알아야 할 것
- **(이월) 몬테카를로 v193 항목의 범위 판단**: "시나리오별 일반계좈/총자산" 카드는 P10/P50/P90이
  아니라 보수적/일반적/긍정적 3개 시나리오를 쓰는 별개 함수라, 낙관>중앙값>보수 정렬 요청 대상에서
  제외했다고 보고했으나 사용자가 아직 확인/반박하지 않았다 - 다시 나오면 이미 검토했다는 사실을 먼저
  알릴 것.
- **(신규) 천단위 콤마 적용 범위 판단**: 위 5번 항목 - "모든 입력창"이라는 요청 문구를 문자 그대로
  받아들이지 않고 원단위 정수 금액 입력창(3곳)으로 좁혔다. 사용자가 특정 입력창을 더 추가해 달라고
  하면(예: 자산 등록 폼의 평균 매수단가 등) `attachThousandsInputFormatting()`을 그 input에 붙이기만
  하면 되지만, `step="any"`(소수점) 입력에 그대로 붙이면 소수점이 사라지므로 그럴 땐 formatInputNumber
  자체를 소수점 허용 버전으로 먼저 고쳐야 한다(현재는 정수 전용, `/[^0-9]/g` 필터).
- `git pull` 먼저 해서 이 커밋(v196)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

---

## 최근 세션 요약 (2026-09-03, 개인 PC 세 번째 세션) — 커밋 시 버전 v193

**커밋**: `5951f29` (코드, v190→v193를 한 번에 묶어 커밋) — 인계장 커밋은 이 파일 갱신 직후 별도로 이어짐.

### 배경
직전 세션(v190, 아래 섹션)에 곧바로 이어진 같은 날 세션. 사용자가 연속으로 여러 개의 독립적인
보완/개편 요청을 빠르게 이어서 줬고("추가 지시합니다" 식으로 이전 요청 구현 도중에도 다음 요청이
들어옴), 매번 커밋하지 않고 전부 한 번에 v193으로 묶어 커밋했다(배치 커밋 - 메모리
`feedback_batch_version_bumps` 참고).

### 이번 세션에서 완료 + 실측 검증된 작업

1. **목표비중 모달 '주식' 자산군 캐치올 완전 제거** (v191, `js/01-core-state.js`, `js/04-rebalancing.js`)
   - `DEFAULT_REBALANCE_TARGETS`에서 제거 + 기존 저장 데이터도 `stripStockCategoryRebalanceTargets`로
     불러올 때마다 자동 정리. 대신 채권/현금 캐치올에도 포지션(역할) select를 추가했고,
     `computeOwnerTargetRoleWeights`/`buildPositionDrilldownRows`가 캐치올의 role도 집계하도록 확장.

2. **'코어미드필드' 포지션 통합 + 카드 아코디언 부활** (v192, `js/01/03/04-core-state.js` 등)
   - '미드필더'+'코어자산' → `core_mid`(코어미드필드) 하나로 통합. `ASSET_ROLE_OPTIONS`가 단일 소스라
     대부분 UI가 자동 반영됐고, 하드코딩된 `f_role`/`tx_role` select(index.html)만 별도 수정.
   - **1회성 마이그레이션** `migrateCoreMidfielderRoleMergeOnce()` - 이미 저장돼 있던 role 값(자산/
     티커 레지스트리/리밸런싱 목표/절세계좈·월적립금 배분)을 전부 훑어 `core_mid`로 직접 재기록한다
     (레거시 데이터 주입 후 재현 테스트로 검증 완료). `parseAssetRoleInput`에 `LEGACY_ASSET_ROLE_ALIASES`
     를 추가해 엑셀 업로드 등 옛 표기가 계속 들어와도 자동 정규화된다.
   - 신랑/와이프 목표 비중 헤더 + 포지션 분석 카드 3개(가구합산/신랑/와이프)를 아코디언으로 전환 -
     기본 닫힘, 헤더 클릭 시 펼침. `resetAllAccordionsOnTabSwitch()`(js/03)의 기존 범용 순회에
     `positionAnalysisAccordionOpen`을 편입시켜, 탭 전환 시 다른 아코디언들과 함께 자동으로 닫힌다.

3. **절세계좈 현황 카드 - 위험/안전자산 → 포지션 축 전환** (v193, `js/04/05-future-projection.js`)
   - 카드 상단 대표 표시는 `computePositionRoleBreakdown('all')`(포트폴리오 구성 탭과 완전히 같은
     함수) 재사용 - 부부합산 목표비중 기준, 다른 카드와 숫자가 항상 일치한다.
   - 신랑/와이프 계좈 세부 드롭다운은 새 `getTaxAdvantagedRoleBreakdown(owner)` - 그 사람이 절세계좈에
     "실제 보유 중인" 종목들의 포지션 비중(목표가 아니라 현재 보유 기준, `a.role || getTickerRole`).
   - 공용 포맷터 `formatRolePctSummary(pct)`(js/04)를 새로 만들어 두 곳(상단/드롭다운)과 향후
     비슷한 요약이 필요한 곳에서 재사용 가능.

4. **일별 손익 추이 팝업 - 월 단위 기간 기준** (v193, `js/01-core-state.js`, `js/11-refresh-history.js`)
   - "오늘로부터 N일 전" 상대 계산 → "해당 월 1일부터 오늘까지" 기준(당월/3개월/6개월/1년)으로 변경.
   - 새 `daysSinceMonthsAgoStart(monthsBack)`(js/01)가 이 팝업 전용으로 "일수"를 계산해 기존
     `buildSnapshotSeries(days, ...)`에 그대로 넘긴다 - 그 함수를 공유하는 총 평가금액/총 평가손익
     추이 팝업은 전혀 안 건드렸다(기존 "N일" 동작 그대로).
   - 버튼 라벨 `당월/3개월/6개월/1년`, `data-pnl-months`로 변경(예전 `data-pnl-days` 폐기). 375px
     모바일에서 4개 버튼이 한 줄에 줄바꿈 없이 배치되는 것 확인.

5. **몬테카를로 시뮬레이션 그래프 정비** (v193, `js/05-future-projection.js`)
   - X축: 예전엔 마일스톤 연도(5개 점)만 계산해 5년 간격으로만 표기됐다 - 이제 "시나리오별 일반계좈/
     총자산" 그래프(`renderScenarioCompareChart`)와 동일하게 매년 값을 촘촘히 계산해 선을 그리고
     마일스톤 연도에만 점을 찍는다(`renderMonteCarloSection`이 스케줄 표용 5점 계산은 그대로 두고,
     차트 전용으로 매년(0~20) 계산을 추가). 두 그래프의 x축 라벨 배열이 동일(21개, Y26~Y46)해져
     Chart.js autoSkip 눈금 간격이 자동으로 맞춰진다(실측 확인 - 라벨 배열 완전 일치).
   - 범례/툴팁 순서: 데이터셋 배열 자체는 `[P90,P10,P50]` 순서를 유지해야 밴드 채우기(`fill:'-1'`)가
     정상 동작한다 - 대신 legend `generateLabels`와 tooltip `itemSort` 콜백으로 "보이는" 순서만
     낙관(P90)→중앙값(P50)→보수(P10)로 재정렬했다(`MONTE_CARLO_DISPLAY_ORDER`).
   - **범위 판단**: 사용자가 "시나리오별 일반계좈/총자산" 카드도 대상이라고 했으나, 그 카드는
     P10/P50/P90이 아니라 보수적/일반적/긍정적 3개 시나리오를 쓰는 별개 함수라 이번 정렬 대상에서
     제외했다(사용자에게 이 판단을 보고했고, 필요하면 후속 요청으로 처리 예정 - 아직 응답 없음).

### 알아둘 점 / 다음 세션이 알아야 할 것
- **"시나리오별 일반계좈/총자산" 카드의 보수적/일반적/긍정적 순서 변경 여부**: 위 5번 항목의 범위
  판단에 대해 사용자가 아직 확인/반박하지 않았다 - 다음 세션에서 이 주제가 다시 나오면, 이미 검토했고
  의도적으로 제외했다는 사실을 먼저 알릴 것.
- `migrateCoreMidfielderRoleMergeOnce()`도 다른 1회성 마이그레이션과 동일하게 플래그
  (`sam_role_core_mid_merged_v1`)로 막혀 있다 - 이미 실행된 기기에서는 다시 안 돈다.
- `git pull` 먼저 해서 이 커밋(v193)을 받았는지 확인 - 이 파일 맨 위 섹션이 가장 최근 세션이다.

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
