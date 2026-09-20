# CHANGE-B3-001 — ETF · 지수 기준정보 공식 확인 반영

> 계획서 §42 measurement log · 실행 묶음 B 3차 · 2026-09-20

## 분류

**DATA CHANGE (사실 확정)** — 계산식 · 정책 · Resolver 코드는 건드리지 않았다. 발행사 · 지수 제공기관 · 거래소의 공식 자료로 확인한 사실을 Exposure Master · Index Master에 기록했을 뿐이다.

## 확인한 사실과 출처

| 종목/지수 | 확인 사실 | 출처(공식) |
| --- | --- | --- |
| 278530 KODEX 200TR | 기초지수 **코스피 200 TR** · "코스피200 지수 구성종목의 세전 현금배당이 재투자되는 것을 가정하여, 배당수익률이 가산된 총수익률을 반영한 지수" | 삼성자산운용 상품 페이지 |
| 069500 KODEX 200 | 기초지수 **KOSPI 200**(지수산출: 한국거래소) | 삼성자산운용 상품 페이지 |
| 102110 TIGER 200 | "한국거래소가 발표하는 코스피 200 지수를 추적대상지수로하여" · 환헤지 해당없음 | 미래에셋 상품 페이지 |
| 487230 KODEX 미국AI전력핵심인프라 | 기초지수 **iSelect 미국AI전력핵심인프라 지수(Price Return)** · **환노출** · 상장 2024-07-09 | 삼성자산운용 상품 페이지 · 상품 데이터(currencyRisk="환노출") |
| 0052D0 TIGER 코리아배당다우존스 | 기초지수 **Dow Jones Korea Dividend 30 지수 (Price Return)** · 환헤지 해당없음 · 상장 2025-05-20 | 미래에셋 상품 페이지 |
| 458730 TIGER 미국배당다우존스 | 기초지수 **Dow Jones U.S. Dividend 100 Price Return Index** · "환헤지 사항: 환헤지를 하지 아니함" | 미래에셋 상품 페이지 |
| 360750 TIGER 미국S&P500 | 기초지수 "S&P Dow Jones Indices에서 발표하는 S&P 500 지수" · 환헤지 하지 않음 | 미래에셋 상품 페이지 |
| **368590 RISE 미국나스닥100** | 기초지수 **NASDAQ 100 Index(KRW)(T-1)**(산출: NASDAQ OMX Group) · **"미국 나스닥100 지수를 추종하는 환노출형 ETF"** → 비헤지 확정 | KB자산운용 상품 페이지 |
| 360200 ACE 미국S&P500 | 기초지수 **S&P 500 지수**(S&P Dow Jones Indices 산출) · **환헤지 여부는 페이지에 없음** | 한국투자신탁운용 상품 페이지 |
| 237370 KODEX 코리아배당성장채권혼합 | 기초지수 **KRX 배당성장 채권혼합지수** = 코스피 배당성장 50 **30%** + KTB지수 **70%**(2010-01-04 = 1000.00pt) | 삼성자산운용 상품 페이지 |
| 472170 TIGER 미국테크TOP10채권혼합 | 기초지수 **FnGuide 미국테크TOP10 채권혼합지수** = "Indxx US Tech Top10 지수" + "KIS 국채 3-10년(총수익 지수) 지수" 비중 **5:5**(2025-10-31부터 4:6 → 5:5) · "환헤지를 하지 아니함" | 미래에셋 상품 페이지 |
| SCHD | 기초지수 Dow Jones U.S. Dividend 100 Index. 투자설명서의 "total return" 문구는 **펀드 운용목표**이고 지수의 PR/TR 표기가 아니다 | SEC 497K |
| S&P 500 | 제공기관 페이지가 대표값을 **Price Return**으로 표시 | S&P Dow Jones Indices |
| Dow Jones U.S. Dividend 100 | 제공기관 페이지가 대표값을 **Price Return**으로 표시 · Launch Date 2011-08-31 | S&P Dow Jones Indices |
| 코스피 200 / 코스피 200 TR | 코스피 200: 기준일 1990.01.03 · 발표 1994.06.15 · 기준지수 100. 총수익지수 정의: "원지수 구성종목의 현금배당이 재투자되는 것을 가정하여 배당수익률이 가산된 총수익률을 반영한 지수" → 코스피 200은 원지수(PR) | KRX 공식 지수 사이트(index.krx.co.kr) |

## 원장 · Index Master 변경

| 대상 | 변경 | 성격 |
| --- | --- | --- |
| Index Master | **KOSPI200_PR 신규 등록**(KRX · PR · INDEX_LEVEL · KRW · availability **UNAVAILABLE**) | 정의는 확인, 가격 원천은 없음 |
| 069500 · 102110 | benchmark **KOSPI200_PR** · underlyingReturnType PR · evidenceGrade A | 사실 추가 |
| 368590 | hedgeStatus **UNHEDGED** · fxExposure EXPOSED · conversionMethod FX_MULTIPLY | 사실 추가(HOLD 해제) |
| 278530 · 0052D0 · 487230 · 458730 · 360750 · SCHD · 237370 · 472170 | evidence 문구 보강(사실값 무변경) | 근거 강화 |
| 360200 | **변경 없음** — 환헤지 여부가 공식 자료에 없어 HOLD 유지 | 미확인 유지 |

> 정의 확인 ≠ 가격 데이터 사용 가능. KOSPI200_PR · KOSPI200_TR · DJ_KOREA_DIV30_PR · ISELECT_US_AI_POWER_PR · DJ_US_DIV100_PR은 **정의만 확정**됐고 일별 시계열 원천은 여전히 없다.

## Risk 영향 (회귀 하네스 · FROZEN · 동일 fixture)

`compare --suite=risk` → **차이 19건**(CHANGE-B1-001의 10건 포함 · 이번 pass에서 9건 추가)

| 경로 | before(v262 기준선) | after |
| --- | --- | --- |
| holdings[069500].benchmarkKey | null | `KOSPI200_PR` |
| holdings[069500].benchmarkStatus | UNRESOLVED | RESOLVED |
| holdings[069500].benchmarkSource | exposureIncomplete | exposureMaster |
| holdings[069500].benchmarkPriceSource | null | UNAVAILABLE |
| holdings[069500].betaStatus | BENCHMARK_UNRESOLVED | SOURCE_UNAVAILABLE |
| portfolio.metricStatus.beta.reason | BENCHMARK_UNRESOLVED | SOURCE_UNAVAILABLE |
| portfolio.stressStatus.covid2020 / rateHike2022 | BENCHMARK_UNRESOLVED | SOURCE_UNAVAILABLE |

의도된 변화다. 값(변동성 · VaR · CVaR · MDD · Sortino · 상관 · 위험점수 · 포트폴리오 베타)은 **하나도 바뀌지 않았다** — 바뀐 것은 "왜 못 구하는지"를 말하는 상태 코드뿐이다(기준 지수를 몰라서가 아니라, 알지만 그 지수의 가격 원천이 없어서).

368590은 이 fixture에 없어 직접 영향은 없지만, 원장 판정은 `{key: NASDAQ100, status: RESOLVED, alignment: ASYNC_DIMSON, benchmarkFx: USD_TO_KRW_H10}`으로 바뀌었다 — 이 상품을 보유하면 이제 비동기 Dimson 베타가 산출된다.

## MC 영향

`compare --suite=mc` → **차이 0건**. 069500이 원장 RESOLVED가 되면서 `resolveExposureAssetClass`가 값을 주기 시작했지만 기존 판정 경로도 같은 국내주식 자산군을 주고 있었기 때문에 MC 입력 · 결과가 모두 동일하다. Return Key도 불변이다(원장은 자동 Return Key 근거가 아니다 · D-16).

## Benchmark 상태 분포 (원장 58건)

| 상태 | v262 | B-1 후 | **B-3 후** |
| --- | ---: | ---: | ---: |
| 확인 · 원천 있음 | 22 | 32 | **33** |
| 확인 · 원천 없음 | 5 | 5 | **7** |
| 헤지 미확인 | 2 | 2 | **1** |
| 혼합 | 2 | 2 | 2 |
| 미해결 | 27 | 17 | **15** |

미해결 15 = NYSE 상장 미국 개별주 9 + GOOG 1 + 대응 지수 없는 ETF 5.

## 테스트

기대값 갱신 7건(모두 사유 주석 포함): activation 3 · 6 · 10 · 11 · 16, integrated 상태 표, risk-engine P-4.
결과: **Unit 566/566**, E2E는 이 커밋에서 별도 실행.
