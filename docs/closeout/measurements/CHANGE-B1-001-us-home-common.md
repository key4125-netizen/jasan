# CHANGE-B1-001 — 미국 개별주 본국 보통주 근거 반영

> 계획서 §42 계산 변경 measurement log · 실행 묶음 B · 2026-09-20

## 분류

**DATA CHANGE (사실 추가)** — 정책은 바뀌지 않았다. §44 44-16 **D-06**은 원래 "해외 개별주는 원장에 본국 보통주 근거(A등급)가 있을 때만 Benchmark를 쓴다"이고, 이번에 그 **근거를 확보해 채운 것**이다. 판정 규칙 · 계산식 · 코드 경로는 그대로다.

## 무엇을 바꿨나

| 항목 | 내용 |
| --- | --- |
| 파일 | `js/28-exposure-master.js` (Exposure Master 항목 20건의 evidence · equityListing · evidenceGrade) |
| 추가한 값 | `equityListing: "HOME_COMMON"` · `evidenceGrade: "A"` — **19건** |
| 남긴 값 | GOOG — 근거 없음(REVIEW). evidence에 사유만 기록 |
| 판정 규칙 | `HOME_COMMON_RULE_V1` (아래) |
| 근거 기록 | `docs/closeout/research/sec-filer-facts.json` · `docs/closeout/research/us-home-common.json` |
| 재현 | `node scripts/closeout/research/us-home-common.js` |

### HOME_COMMON_RULE_V1

세 가지가 모두 공식 1차 자료로 확인될 때만 HOME_COMMON이다.

1. 발행인이 미국 주에 설립됐다 — SEC EDGAR 회사기록 `State of Incorp.` 또는 10-K 표지의 설립 관할
2. 연차보고서가 **10-K**다(국내 신고인) — SEC EDGAR 제출 목록
3. 해당 종목이 그 발행인의 **보통주**다 — 거래소 종목 디렉터리(Nasdaq Trader) 또는 10-K 표지 12(b) 등록증권

- 예탁증권(ADR/ADS) 표기 또는 20-F/40-F → `NOT_HOME_COMMON`
- 하나라도 미확인이거나 자료가 어긋나면 → `REVIEW`
- **거래소 상장 사실만으로는 판정하지 않는다.**

## 판정 결과 (20건)

| 판정 | 건수 | 종목 |
| --- | ---: | --- |
| HOME_COMMON | 19 | AAPL MSFT GOOGL AMZN NVDA AVGO AMD META TSLA NFLX JPM V MA JNJ UNH XOM CVX PG KO |
| REVIEW | 1 | GOOG — 등록증권이 "Class C Capital Stock"이라 보통주 표기가 아니다(정책 판단 필요 · 대장 D-11) |

자료가 어긋난 사례(기록만 하고 1차 자료를 따랐다): XOM은 거래소 디렉터리 표기가 "ExxonMobil Holdings Corporation Common Stock"인데 10-K 표지의 등록인 명칭은 "Exxon Mobil Corporation"이다.

## Risk 영향 (회귀 하네스 · FROZEN 데이터 · 동일 fixture)

`node scripts/closeout/regression-harness.js compare --suite=risk` → **차이 10건**

| 경로 | before | after |
| --- | --- | --- |
| holdings[AAPL].benchmarkKey | null | `NASDAQ` |
| holdings[AAPL].benchmarkStatus | UNRESOLVED | RESOLVED |
| holdings[AAPL].benchmarkSource | listingDomicileUnconfirmed | exposureMaster |
| holdings[AAPL].benchmarkPriceSource | null | AVAILABLE |
| holdings[AAPL].benchmarkAlignment / betaMethod | null | SAME_DATE |
| holdings[AAPL].beta | null | 1.235294118 |
| holdings[AAPL].betaStatus | BENCHMARK_UNRESOLVED | OK |
| portfolio.dataConfidence.score | 78 | 81 |
| portfolio.dataConfidence.reasons[0] | "61% 비중 종목은 시장(벤치마크) 비교 불가" | "36% …" |

**바뀌지 않은 것**: 변동성 · VaR · CVaR · MDD · Sortino · 상관 · 위험점수 · 포트폴리오 베타(여전히 null — fixture의 다른 종목이 아직 베타를 못 구한다) · 스트레스 · 지표 상태.

> 이 수치는 합성 fixture 값이다. 사용자 포트폴리오 값이 아니다.

## MC 영향

`compare --suite=mc` → **차이 0건**. Exposure Master 변경이 Return Key를 건드리지 않는다는 D-16 경계(js/16 · js/05의 `{ exposureMaster: false }`)가 그대로 지켜졌다. 자산군 · μ · σ · 상관 · 고정 seed 결과 모두 동일.

## Master 영향

원장 20건의 evidence 문구가 길어지고 19건에 `equityListing` · `evidenceGrade`가 생겼다. 원장 건수(58) · 자산군 · benchmark 키 자체는 변경 없음. Index Master 변경 없음.

## Benchmark 상태 분포 (원장 58건)

| 상태 | before | after |
| --- | ---: | ---: |
| 확인 · 원천 있음 | 22 | **32** |
| 확인 · 원천 없음 | 5 | 5 |
| 헤지 미확인 | 2 | 2 |
| 혼합 | 2 | 2 |
| 미해결 | 27 | **17** |

미해결 17 = NYSE 상장 미국 개별주 9(앱에 NYSE 종합지수 없음 · 대장 D-2) + GOOG 1 + 대응 지수 없는 ETF 7.

## 테스트

| 테스트 | 처리 |
| --- | --- |
| `exposure-master-activation` 3 | 기대값 갱신 — EM-2026.1에도 "근거가 있으면" 등급을 붙일 수 있게. 규칙: 등급이 있으면 evidence에 판정 규칙 이름이 있어야 하고, 없으면 equityListing도 없어야 한다 |
| `exposure-master-activation` 11 | NVDA null → `NASDAQ` |
| `integrated-benchmark-index` ① | v261 대비 달라지는 종목 수 11 → **1**(GOOG) |
| `integrated-benchmark-index` ⑤ | AAPL UNRESOLVED → RESOLVED, 근거 없는 예시를 GOOG로 교체 |
| `integrated-benchmark-index` 상태 표 | 분포 갱신(위 표) |
| `risk-engine` P-4 | NVDA UNRESOLVED → RESOLVED(원장). 거래소 상장만으로 주는 경로(ZZNQ)는 그대로 막혀 있음을 계속 검증 |

전체: **Unit 566/566 PASS**.

## 남은 것

- **D-2** NYSE 종합지수 — 본국 보통주가 확인된 NYSE 상장 9종목은 비교할 지수가 없어 여전히 미해결이다. `^NYA` 수신은 확인했으나 공식 정의 · PR/TR · 이용조건이 미확인이라 ACTIVE하지 않는다.
- **D-11**(신규) GOOG 무의결권 Class C 주식을 본국 보통주로 볼지 — 정책 판단.
- **P-7** SEC 연락처 — 주기적 자동 재검증에 필요(이번 1회 조사는 완료).
