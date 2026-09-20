/* -------------------------------------------------------------------------
 * 26. 장기 CMA 데이터 (자동 생성 파일 - 직접 고치지 않는다)
 *    - 생성: node scripts/cma-update.js activate … (PM 승인된 Dataset만) / build
 *    - 원본: data/cma/active.json · data/cma/datasets/*.json · data/cma/app-asset-class-map.json
 *    - 숫자는 원문 값 그대로이며, 앱이 연결하는 자산군만 담는다(체크리스트 §37).
 * ---------------------------------------------------------------------- */
const CMA_ACTIVE_SET = {
  "setVersion": "CMA-2026.2",
  "activatedAt": "2026-09-20T03:48:03.116Z",
  "activatedBy": "PM (EXECUTION DIRECTIVE 2026-09-20 · C-1 APPROVED)",
  "activationNote": "C-1 승인 - AllianzGI 2026 Q2(기준일 2026-03-31) PRIMARY 활성화 + JPM 2026 LTCMA KRW Benchmark 유지(§47-4).",
  "primary": {
    "datasetId": "AGI-LTCMA-2026Q2-USD",
    "version": "AGI-2026.2",
    "provider": "Allianz Global Investors",
    "sourceTitle": "Long-Term Capital Market Assumptions - Highlights (AllianzGI Asia Pacific, USD) (Released in Q2 2026)",
    "sourceUrl": "https://ap.allianzgi.com/-/media/allianzgi/ap/ap/ideas-connect/pdfs/capitalmarketassumptions-2026q2-allianzgi-ap.pdf",
    "sourceType": "OFFICIAL_PDF",
    "role": "PRIMARY",
    "numberKind": "OFFICIAL_DATA",
    "edition": "2026Q2",
    "publishedAt": "2026-05",
    "asOfDate": "2026-03-31",
    "effectiveDate": "2026-03-31",
    "horizonYears": 10,
    "currency": "USD",
    "returnDefinition": "NOT_STATED_IN_SOURCE",
    "volatilityDefinition": "10-year Expected Volatility p.a. (원문 표기 - 연율 표준편차)",
    "methodologyUrl": "https://ap.allianzgi.com/-/media/allianzgi/ap/ap/ideas-connect/pdfs/capitalmarketassumptions-2026q1-allianzgi-ap.pdf",
    "retrievedAt": "2026-09-16T15:08:01.786Z",
    "verifiedAt": "2026-09-16T15:08:01.786Z",
    "fileSha256": "7881c82e31f52e0465024c6614223c2a80a985558d220b53cce2b724d591e502",
    "returnUsableForMc": false,
    "classes": {
      "Developed World Equities": {
        "expectedReturn": 7,
        "volatility": 17.5
      },
      "North America Equities": {
        "expectedReturn": 6.7,
        "volatility": 16.6
      },
      "Korea Equities": {
        "expectedReturn": 7.3,
        "volatility": 29.4
      },
      "Emerging Markets Equities": {
        "expectedReturn": 6.9,
        "volatility": 24.4
      }
    },
    "correlation": {
      "kind": "VERSUS_REFERENCE",
      "referenceClass": "Developed World Equities",
      "values": {
        "Developed World Equities": 1,
        "North America Equities": 0.99,
        "Korea Equities": 0.84,
        "Emerging Markets Equities": 0.88
      }
    }
  },
  "benchmarks": [
    {
      "datasetId": "JPM-LTCMA-2026-KRW",
      "version": "JPM-KRW-2026.1",
      "provider": "J.P. Morgan Asset Management",
      "sourceTitle": "2026 Long-Term Capital Market Assumptions - Korean won (KRW) assumptions matrix",
      "sourceUrl": "https://cdn.jpmorganfunds.com/content/dam/jpm-am-aem/global/en/institutional/interactive-matrix/data/krw.csv",
      "sourceType": "OFFICIAL_DATA_DOWNLOAD",
      "role": "BENCHMARK",
      "numberKind": "BENCHMARK_REFERENCE",
      "edition": 2026,
      "publishedAt": "2025-10-20",
      "asOfDate": "2025-09-30",
      "effectiveDate": "2025-09-30",
      "horizonYears": {
        "min": 10,
        "max": 15
      },
      "currency": "KRW",
      "returnDefinition": "COMPOUND",
      "volatilityDefinition": "Annualized Volatility (%) (원문 머리글)",
      "methodologyUrl": "https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/portfolio-insights/ltcma/noindex/ltcma-methodology-handbook.pdf",
      "retrievedAt": "2026-09-16T15:08:01.786Z",
      "verifiedAt": "2026-09-16T15:08:01.786Z",
      "fileSha256": "b59143b645ac4538b52193043f93b1fc559691d2997477d5ccb9e571b81f96de",
      "returnUsableForMc": false,
      "classes": {
        "Korean Equity": {
          "expectedReturn": 5.2,
          "volatility": 19.362401823368693
        },
        "U.S. Large Cap": {
          "expectedReturn": 4.7,
          "volatility": 13.722309014388456
        },
        "Emerging Markets Equity": {
          "expectedReturn": 5.800000000000001,
          "volatility": 14.473282329575344
        }
      },
      "correlation": {
        "kind": "FULL",
        "classes": [
          "Korean Equity",
          "U.S. Large Cap",
          "Emerging Markets Equity"
        ],
        "matrix": [
          [
            1,
            0.4124456921608721,
            0.6772476909891292
          ],
          [
            0.4124456921608721,
            1.0000000000000002,
            0.5007268458463904
          ],
          [
            0.6772476909891292,
            0.5007268458463904,
            1
          ]
        ]
      }
    }
  ],
  "appClasses": {
    "KR_EQUITY": {
      "label": "국내 주식",
      "providers": {
        "Allianz Global Investors": {
          "class": "Korea Equities",
          "evidence": "AllianzGI 원문 p.2 표 행 \"Korea Equities\", p.5 기준 지수 \"MSCI Emerging Markets Korea Net Total Return Index USD\""
        },
        "J.P. Morgan Asset Management": {
          "class": "Korean Equity",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"Korean Equity\""
        }
      }
    },
    "US_EQUITY": {
      "label": "미국 주식",
      "providers": {
        "Allianz Global Investors": {
          "class": "North America Equities",
          "evidence": "AllianzGI 원문 p.2 표 행 \"North America Equities\", p.5 기준 지수 \"MSCI North America Net Total Return Index USD\"(미국 · 캐나다). 원문에 미국 단독 자산군이 없어 가장 가까운 공식 자산군으로 연결했다 - \"Developed World Equities\"(미국 외 선진국 포함)는 미국 주식으로 쓰지 않는다."
        },
        "J.P. Morgan Asset Management": {
          "class": "U.S. Large Cap",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"U.S. Large Cap\"(원화 기준 · 환헤지 없음)"
        }
      }
    },
    "EM_EQUITY": {
      "label": "신흥국 주식",
      "providers": {
        "Allianz Global Investors": {
          "class": "Emerging Markets Equities",
          "evidence": "AllianzGI 원문 p.2 표 행 \"Emerging Markets Equities\", p.5 기준 지수 \"MSCI Emerging Net Total Return Index USD\""
        },
        "J.P. Morgan Asset Management": {
          "class": "Emerging Markets Equity",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"Emerging Markets Equity\""
        }
      }
    }
  },
  "officialMappings": [],
  "unmapped": {
    "DEV_EX_US_EQUITY": "AllianzGI 원문에 '미국 외 선진국 주식' 자산군이 없다(Developed World Equities는 미국 포함). 연결하지 않으며, 이 성격의 위험자산은 장기 MC를 실행하지 않고 안내한다.",
    "COMMODITY": "앱에 이 성격의 Return Key가 없다(기존 정책) - 연결하지 않는다.",
    "CRYPTO": "앱에 이 성격의 Return Key가 없다(기존 정책) - 연결하지 않는다.",
    "REAL_ESTATE": "부동산은 Monte Carlo 범위 밖이다(RET-03-04).",
    "BOND": "채권은 기존 §7 정책대로 변동성 0으로 둔다(Bond Domain은 BACKLOG) - 이번 작업에서 바꾸지 않는다.",
    "CASH": "현금성은 기존 §7 정책대로 변동성 0으로 둔다.",
    "UNRESOLVED": "성격을 확인하지 못한 위험자산은 장기 CMA 자산군을 정할 수 없다."
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CMA_ACTIVE_SET };
}
