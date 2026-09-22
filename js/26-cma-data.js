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
        "Korean Government Bonds": {
          "expectedReturn": 3,
          "volatility": 5.357291318235813
        },
        "Korean Corporate Bonds": {
          "expectedReturn": 3.5000000000000004,
          "volatility": 2.539956328818818
        },
        "Global Credit hedged": {
          "expectedReturn": 4.1000000000000005,
          "volatility": 5.556221501342378
        },
        "World Government Bonds": {
          "expectedReturn": 2.3,
          "volatility": 9.69232747192174
        },
        "World Government Bonds hedged": {
          "expectedReturn": 3.5000000000000004,
          "volatility": 3.985382018102107
        },
        "Korean Equity": {
          "expectedReturn": 5.2,
          "volatility": 19.362401823368693
        },
        "U.S. Large Cap": {
          "expectedReturn": 4.7,
          "volatility": 13.722309014388456
        },
        "U.S. Large Cap hedged": {
          "expectedReturn": 5.800000000000001,
          "volatility": 16.63977109253169
        },
        "Emerging Markets Equity": {
          "expectedReturn": 5.800000000000001,
          "volatility": 14.473282329575344
        }
      },
      "correlation": {
        "kind": "FULL",
        "classes": [
          "Korean Government Bonds",
          "Korean Corporate Bonds",
          "Global Credit hedged",
          "World Government Bonds",
          "World Government Bonds hedged",
          "Korean Equity",
          "U.S. Large Cap",
          "U.S. Large Cap hedged",
          "Emerging Markets Equity"
        ],
        "matrix": [
          [
            1.0000000000000002,
            0.851681808033078,
            0.5923763332327315,
            0.12321832941844892,
            0.6933710393845445,
            0.15880356073907428,
            -0.013600222151413276,
            0.19790284092050703,
            -0.037934006936419906
          ],
          [
            0.851681808033078,
            0.9999999999999998,
            0.5041198252985389,
            0.17328967088553088,
            0.61309022948334,
            0.09256821710065198,
            -0.0754399540844658,
            0.09907637833302613,
            -0.08995315831250561
          ],
          [
            0.5923763332327315,
            0.5041198252985389,
            1,
            -0.027230703075454124,
            0.7373964259936657,
            0.4235167435878428,
            0.2688422244953301,
            0.5266111476445496,
            0.37736893812002026
          ],
          [
            0.12321832941844892,
            0.17328967088553088,
            -0.027230703075454124,
            1,
            0.32587874642400655,
            -0.39363415929700274,
            0.1655820143486541,
            -0.42230947360999105,
            -0.16270566147351306
          ],
          [
            0.6933710393845445,
            0.61309022948334,
            0.7373964259936657,
            0.32587874642400655,
            1,
            0.08655686891410166,
            0.04682511723961898,
            0.14531192490289155,
            -0.03126133334397982
          ],
          [
            0.15880356073907428,
            0.09256821710065198,
            0.4235167435878428,
            -0.39363415929700274,
            0.08655686891410166,
            1,
            0.4124456921608721,
            0.6931240999229659,
            0.6772476909891292
          ],
          [
            -0.013600222151413276,
            -0.0754399540844658,
            0.2688422244953301,
            0.1655820143486541,
            0.04682511723961898,
            0.4124456921608721,
            1.0000000000000002,
            0.7023437621998414,
            0.5007268458463904
          ],
          [
            0.19790284092050703,
            0.09907637833302613,
            0.5266111476445496,
            -0.42230947360999105,
            0.14531192490289155,
            0.6931240999229659,
            0.7023437621998414,
            1.0000000000000002,
            0.570297328939026
          ],
          [
            -0.037934006936419906,
            -0.08995315831250561,
            0.37736893812002026,
            -0.16270566147351306,
            -0.03126133334397982,
            0.6772476909891292,
            0.5007268458463904,
            0.570297328939026,
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
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"U.S. Large Cap\"(기대수익률 4.7% · 변동성 13.722%) - 원화 기준 · 환헤지 없음. [PM 결정 1 · A안 · 2026-09-22] 환헤지 여부를 MC에 반영하려면 환노출/환헤지가 같은 원문 · 같은 통화 기준의 짝이어야 한다(\"U.S. Large Cap hedged\" 5.8% · 16.640%와 쌍). 그래서 위험(σ · 상관) 출처를 이 Dataset으로 고정한다(riskProvider). 이 앱의 주식 상관계수는 이미 전부 이 Dataset에서 오고 있었으므로(AllianzGI 상관은 VERSUS_REFERENCE 형식이라 쌍 값을 주지 못한다) σ와 상관의 출처가 일치하게 된다. 기대수익률은 Benchmark Dataset이라 MC 수익률 경로를 열지 않는다(§37-5 유지 · μ는 Return Key 그대로)."
        }
      },
      "riskProvider": "J.P. Morgan Asset Management"
    },
    "US_EQUITY_HEDGED": {
      "label": "미국 주식(환헤지)",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "U.S. Large Cap hedged",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"U.S. Large Cap hedged\"(기대수익률 5.8% · 변동성 16.640%). 같은 행렬의 환노출 행 \"U.S. Large Cap\"(4.7% · 13.722%)과 짝을 이루며, 두 행의 차이가 이 원문이 말하는 환율 효과다(환헤지 쪽 변동성이 더 큰 것은 원화가 미국 주식과 음의 상관을 가져 환노출이 원화 기준 변동성을 낮추기 때문이며, 원문 값 그대로다). 사용자가 환헤지로 확정한 미국 주식형 상품만 이 자산군에 연결한다 - 추정 금지(미선택은 환노출로 간주하지 않고 US_EQUITY 그대로 둔다)."
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
    },
    "KR_GOV_BOND": {
      "label": "국내 국공채",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "Korean Government Bonds",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"Korean Government Bonds\"(기대수익률 3.0% · 변동성 5.357%). 국채 · 지방채 · 특수채는 발행인 유형으로 이 자산군에 연결한다."
        }
      }
    },
    "KR_CORP_BOND": {
      "label": "국내 회사채",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "Korean Corporate Bonds",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"Korean Corporate Bonds\"(3.5% · 2.540%). 회사채 · 금융채는 발행인 유형으로 이 자산군에 연결한다."
        }
      }
    },
    "FOREIGN_GOV_BOND_HEDGED": {
      "label": "해외 국공채(환헤지)",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "World Government Bonds hedged",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"World Government Bonds hedged\"(3.5% · 3.985%). 환헤지가 A등급 근거로 확인된 해외 국공채만 연결한다."
        }
      }
    },
    "FOREIGN_GOV_BOND_UNHEDGED": {
      "label": "해외 국공채(환노출)",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "World Government Bonds",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"World Government Bonds\"(2.3% · 9.692%) - 원화 기준 · 환헤지 없음. 환노출이 확인된 해외 국공채만 연결한다."
        }
      }
    },
    "FOREIGN_CORP_BOND_HEDGED": {
      "label": "해외 회사채(환헤지)",
      "riskProvider": "J.P. Morgan Asset Management",
      "providers": {
        "J.P. Morgan Asset Management": {
          "class": "Global Credit hedged",
          "evidence": "J.P. Morgan 2026 LTCMA 원화(KRW) 행렬 행 \"Global Credit hedged\"(4.1% · 5.556%). 환헤지가 A등급 근거로 확인된 해외 회사채만 연결한다."
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
    "BOND": "발행인 유형 · 통화 · 환헤지 중 하나라도 확인되지 않은 채권은 자산군을 정하지 않는다(§47-3). 예전처럼 변동성 0으로 두지 않고 장기 MC에서 제외하며, 그 사실을 화면에 표시한다.",
    "CASH": "현금성은 기존 §7 정책대로 변동성 0으로 둔다(채권으로 취급하지 않는다 · §47-3 ②).",
    "UNRESOLVED": "성격을 확인하지 못한 위험자산은 장기 CMA 자산군을 정할 수 없다.",
    "FOREIGN_CORP_BOND_UNHEDGED": "J.P. Morgan 원문에 환헤지하지 않은 글로벌 크레딧 자산군이 없다(\"Global Credit\"은 hedged만 있다). 가까운 다른 자산군으로 옮겨 쓰지 않고 연결하지 않는다 - 장기 MC에서 제외한다.",
    "KR_EQUITY_HEDGED": "국내 주식은 원화 자산이라 환헤지 개념이 성립하지 않는다 - J.P. Morgan 원문에도 \"Korean Equity hedged\" 행이 없다.",
    "EM_EQUITY_HEDGED": "J.P. Morgan 원문에 \"Emerging Markets Equity hedged\" 행이 없다. 가까운 다른 자산군으로 옮겨 쓰지 않고 연결하지 않는다."
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CMA_ACTIVE_SET };
}
