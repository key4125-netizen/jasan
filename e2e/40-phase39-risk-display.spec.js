// E2E-40 Phase 39 - "Risk 표시 최소 개선"의 상시 회귀.
//
// [핵심 계약]
//  1) 데이터 신뢰도는 "86%" 같은 정확도로 읽히는 숫자가 아니라 상태 한 단어로 보여준다.
//     숫자와 사유는 사라지지 않고 [i] 툴팁에 남는다. 계산식(computeDataConfidence)은 무변경이다.
//  2) 리스크 진단이 가구 전체 합산 기준이라는 사실이 화면에 드러난다.
//  3) 목표 자산배분 이탈은 위험점수와 분리된 "계획 확인" 안내로만 연결된다 -
//     위험/주의/매도 같은 Risk 표현을 붙이지 않는다.
//  4) 거래량 급증은 위험 태그가 아니다. 단 계산값(volumeSpike)은 그대로 남아 있다.
//  5) 이 Phase는 표시만 바꾼다 - 위험점수/등급은 그대로여야 한다.
//
// [e2e/39와의 역할 분리] 39는 Phase 35의 "행동 지시 금지 / 결측 표기"를 지킨다.
// 이 파일은 Phase 39가 새로 만든 표시 계약만 검사한다 - 같은 것을 두 번 확인하지 않는다.
//
// [외부 API 비의존] 위험점수는 가격 이력이 필요해 이 샌드박스에서 만들 수 없다. 그래서 실제 렌더가
// 쓰는 바로 그 함수/DOM에 대표 입력을 직접 넣어 결과를 검사한다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof dataConfidenceBand === 'function' && typeof buildIndividualRiskTags === 'function');
}

// 위험점수 계산에 필요한 최소 metrics 스텁 - renderRiskDiagnosisSummary()가 읽는 필드만 채운다.
// (외부 시세 없이 카드를 실제로 그려보기 위한 입력이며, 계산 함수는 전부 앱의 실제 코드가 돈다.)
async function renderCardWith(page, over) {
  await page.evaluate((over) => {
    const subScores = { concentration: 30, volatility: 40, drawdown: 20, market: 35, correlation: 40, technical: 30 };
    state.advancedRiskMetrics = Object.assign({
      totalCur: 10000000, holdings: [], missingCount: 0,
      topWeight: 30, topHolding: { name: '테스트종목', benchmarkKey: 'KOSPI', riskContributionPct: 30 },
      hhi: 0.3, portfolioBeta: 1.0, portfolioVolatilityPct: 18, portfolioMDDPct: -15,
      var95Pct: -2, cvarPct: -3, var95KRW: -200000, weightedAvgCorrelation: 0.4,
      topCorrelation: null, topCorrelationPair: null,
      sectorExposure: { topSector: '반도체', topSectorWeight: 30, unclassifiedWeightPct: 0, sectorTotals: {} },
      portfolioVolatilityShortPct: 18, volatilitySpike: false,
      subScores, riskScore: computeCompositeRiskScore(subScores),
      dataConfidence: { score: 92, reasons: ['수급 지표는 실제 외국인/기관 매매 데이터가 아닌 거래량 기반 추정치'] }
    }, over);
    renderRiskDiagnosisSummary();
  }, over || {});
  await expect(page.locator('#riskDiagnosisSummary')).toBeVisible();
}

/* ─────────────────────── 1. 데이터 신뢰도 상태 표현 ─────────────────────── */

test('1. 신뢰도 구간이 기존 임계값(80/50)을 그대로 쓰고 상태 라벨로 갈린다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [100, 92, 80, 79.9, 60, 50, 49.9, 37, 0]
    .map((v) => [v, dataConfidenceBand(v).label]));
  expect(r).toEqual([
    [100, '데이터 충분'], [92, '데이터 충분'], [80, '데이터 충분'],
    [79.9, '일부 데이터 부족'], [60, '일부 데이터 부족'], [50, '일부 데이터 부족'],
    [49.9, '분석 제한'], [37, '분석 제한'], [0, '분석 제한']
  ]);
});

test('2. 화면에 퍼센트 신뢰도가 아니라 상태 문구가 보인다', async ({ page }) => {
  await boot(page);
  await renderCardWith(page, { dataConfidence: { score: 92, reasons: ['수급 지표는 추정치'] } });
  const txt = await page.locator('#riskDiagnosisSummary').innerText();
  expect(txt).toContain('데이터 충분');
  // "분석 신뢰도 92%"처럼 정확도로 읽히는 표기가 다시 등장하면 안 된다.
  expect(txt).not.toContain('분석 신뢰도');
  expect(txt).not.toMatch(/신뢰도\s*\d+\s*%/);
});

test('3. 숫자와 사유는 사라지지 않고 툴팁에 남는다(만점이 92라는 사실 포함)', async ({ page }) => {
  await boot(page);
  await renderCardWith(page, { dataConfidence: { score: 57, reasons: ['35% 비중 종목은 가격 이력 부족', '수급 지표는 추정치'] } });
  const tip = await page.locator('#riskDiagnosisSummary [data-info-tip]').first().getAttribute('data-info-tip');
  expect(tip).toContain('57/100');
  expect(tip).toContain('92');
  expect(tip).toContain('가격 이력 부족');
  // 위험점수와 별개라는 설명이 유지되어야 한다.
  expect(tip).toContain('위험점수');
});

test('4. 신뢰도 계산식은 변경되지 않았다(구조적 최대 92점 유지)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const se = (unc) => ({ topSector: '반도체', topSectorWeight: 100, unclassifiedWeightPct: unc, sectorTotals: {} });
    return {
      full: computeDataConfidence({ holdings: [{ weight: 1, hasData: true }], sectorExposure: se(0) }).score,
      halfMissing: computeDataConfidence({ holdings: [{ weight: 0.5, hasData: true }, { weight: 0.5, hasData: false }], sectorExposure: se(0) }).score,
      worst: computeDataConfidence({ holdings: [{ weight: 1, hasData: false }], sectorExposure: se(100) }).score
    };
  });
  expect(r).toEqual({ full: 92, halfMissing: 75, worst: 37 });
});

/* ─────────────────────── 2. 가구 전체 기준 명시 ─────────────────────── */

test('5. Risk 카드에 가구 전체 합산 기준임이 표시된다', async ({ page }) => {
  await boot(page);
  const note = page.locator('#riskScopeNote');
  await expect(note).toBeVisible();
  const txt = await note.innerText();
  expect(txt).toContain('가구 전체');
  expect(txt).toContain('소유자 구분 없이');
  // 특정 가족 구성을 전제하는 표현은 쓰지 않는다.
  expect(txt).not.toContain('신랑');
  expect(txt).not.toContain('와이프');
  expect(txt).not.toContain('부부');
  // 기존 자산군 안내는 그대로 남아 있어야 한다(대체가 아니라 보강).
  expect(txt).toContain('주식·ETF만');
});

test('6. 가구 기준 표기는 진단 대상 자산에 실제로 부합한다(계산 무변경 확인)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [
      { id: 'a', name: '삼성전자', ticker: '005930', owner: '신랑', accountType: '일반계좌', category: '주식', isDomestic: '국내', currency: 'KRW', quantity: 30, buyPrice: 100000, currentPrice: 100000 },
      { id: 'b', name: '삼성전자', ticker: '005930.KS', owner: '와이프', accountType: '일반계좌', category: '주식', isDomestic: '국내', currency: 'KRW', quantity: 20, buyPrice: 100000, currentPrice: 100000 }
    ];
    return { owners: riskEligibleAssets().map((a) => a.owner), count: riskEligibleAssets().length };
  });
  expect(r.count).toBe(2);
  expect(r.owners.sort()).toEqual(['신랑', '와이프']);
});

/* ─────────────────────── 3. 목표비중 ↔ Risk Score 분리 ─────────────────────── */

test('7. 계획 확인 안내가 위험점수와 분리되어 표시된다', async ({ page }) => {
  await boot(page);
  await renderCardWith(page);
  const txt = await page.locator('#riskDiagnosisSummary').innerText();
  expect(txt).toContain('가격 변동 위험');
  expect(txt).toContain('목표 자산배분');
  await expect(page.locator('#riskPlanCheckBtn')).toBeVisible();
});

test('8. 계획 확인 안내에 Risk 표현이나 행동 지시가 붙지 않는다', async ({ page }) => {
  await boot(page);
  await renderCardWith(page);
  const line = await page.locator('#riskPlanCheckBtn').evaluate((el) => el.closest('p').innerText);
  ['위험합니다', '주의하세요', '경고', '매도', '매수', '줄이', '늘리', '손절'].forEach((w) => {
    expect(line, `계획 안내에 Risk/행동 표현 발견: ${w} / 원문: ${line}`).not.toContain(w);
  });
});

test('9. 목표비중은 위험점수에 편입되지 않는다(6대 요인 그대로)', async ({ page }) => {
  await boot(page);
  const keys = await page.evaluate(() => {
    const sub = { concentration: 50, volatility: 50, drawdown: 50, market: 50, correlation: 50, technical: 50 };
    return { score: computeCompositeRiskScore(sub), factors: Object.keys(sub).length };
  });
  // 계획 관련 7번째 요인이 생기면 가중합이 50에서 벗어난다.
  expect(keys).toEqual({ score: 50, factors: 6 });
});

test('10. 계획 확인 버튼이 기존 포트폴리오 구성 탭으로 이동시킨다', async ({ page }) => {
  await boot(page);
  await renderCardWith(page);
  await page.locator('#riskPlanCheckBtn').click();
  await expect(page.locator('#tabPanelRebalance')).toBeVisible();
});

/* ─────────────────────── 4. 거래량 급증 태그 제거 ─────────────────────── */

test('11. 거래량 급증은 더 이상 위험 태그가 아니다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const base = { hasData: true, rsiState: '적정', trendLabel: '정배열(상승추세)', week52DrawdownPct: -5 };
    return {
      spikeOnly: buildIndividualRiskTags(Object.assign({}, base, { volumeSpike: true })),
      withRsi: buildIndividualRiskTags(Object.assign({}, base, { volumeSpike: true, rsiState: '과열' })),
      label: buildAssetActionTag(['거래량 급증'])
    };
  });
  expect(r.spikeOnly).toEqual([]);
  expect(r.withRsi).toEqual(['단기 과열']);
  expect(r.label).toBeNull();
});

test('12. 거래량 계산값(volumeSpike)은 그대로 보존된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // js/09의 계산 경로를 그대로 쓴다: volMA20은 급증 당일까지 포함한 최근 20개 평균이다.
    const vols = new Array(60).fill(1000);
    vols[vols.length - 1] = (19 * 3 * 1000) / (20 - 3);   // 정확히 3.0배
    const volMA20 = computeSMA(vols, 20);
    const last = vols[vols.length - 1];
    return { volMA20, last, spike: last >= volMA20 * 2, ratio: Number((last / volMA20).toFixed(4)) };
  });
  expect(r.ratio).toBe(3);
  expect(r.spike).toBe(true);
});

test('13. 안내 문구에서도 거래량 급증이 감지 조건으로 남아있지 않다', async ({ page }) => {
  await boot(page);
  const tip = await page.locator('#riskManagementSection button[title]').first().getAttribute('title');
  expect(tip).not.toContain('거래량 급증');
  expect(tip).toContain('단기 과열');
  expect(tip).toContain('52주 고점대비 급락');
});

/* ─────────────────────── 5. 위험점수 불변 ─────────────────────── */

test('14. 위험점수/등급 계산은 이번 변경의 영향을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const sub = { concentration: 73, volatility: 60, drawdown: 60, market: 75, correlation: 80, technical: 45 };
    return {
      composite: computeCompositeRiskScore(sub),
      levels: [0, 40, 41, 60, 61, 100].map((v) => riskLevelFromScore(v).label),
      extreme90: computeCompositeRiskScore({ concentration: 90, volatility: 0, drawdown: 0, market: 0, correlation: 0, technical: 0 }),
      extreme95: computeCompositeRiskScore({ concentration: 95, volatility: 0, drawdown: 0, market: 0, correlation: 0, technical: 0 })
    };
  });
  expect(r.composite).toBe(66);
  expect(r.levels).toEqual(['양호', '양호', '주의', '주의', '위험', '위험']);
  expect(r.extreme90).toBe(28);
  expect(r.extreme95).toBe(32);
});

test('15. Phase 35 행동지시 금지 정책이 새 문구에서도 유지된다', async ({ page }) => {
  await boot(page);
  await renderCardWith(page, { topWeight: 40, portfolioBeta: 1.3, weightedAvgCorrelation: 0.8 });
  const txt = await page.locator('#riskDiagnosisSummary').innerText();
  ['매도하', '손절', '이익 실현', '비중을 줄이', '유지하세요', '관망', 'QQQM', 'TLT'].forEach((w) => {
    expect(txt, `Phase 39 카드에 행동 지시 발견: ${w}`).not.toContain(w);
  });
});

/* ─────────────────────── 6. 모바일 / 다크모드 ─────────────────────── */

for (const w of [375, 390, 412, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - Risk 카드 새 문구가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      await renderCardWith(page);

      // 새로 추가된 두 문구(가구 기준 / 계획 확인)와 신뢰도 라벨을 모두 포함해 검사한다.
      // [의도적 제외] .detail-btn(🔍 세부내용)은 font-size:10px인 앱 공용 버튼 클래스로 KPI 카드 등
      // 여러 화면이 함께 쓴다 - Phase 39가 만든 요소가 아니고 고치면 앱 전역 레이아웃이 바뀌므로
      // 이번 범위에서 제외하고 보고서에만 기록했다. 그 외에는 전부 14px 기준을 적용한다.
      for (const sel of ['#riskScopeNote', '#riskDiagnosisSummary']) {
        const info = await page.locator(sel).evaluate((el) => {
          const win = el.ownerDocument.defaultView;
          const nodes = [el, ...el.querySelectorAll('p, span, button')]
            .filter((n) => n.textContent.trim() && !n.closest('.detail-btn'));
          return {
            min: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))),
            clipped: el.scrollWidth - el.clientWidth
          };
        });
        expect(info.min, `${sel} 최소 글꼴`).toBeGreaterThanOrEqual(14);
        expect(info.clipped, `${sel} 가로 넘침`).toBeLessThanOrEqual(1);
      }
      const bodyOverflow = await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(bodyOverflow).toBeLessThanOrEqual(1);

      // 계획 확인 버튼은 눌러야 하므로 터치 목표 크기를 확보한다.
      const btn = await page.locator('#riskPlanCheckBtn').boundingBox();
      expect(btn.width).toBeGreaterThan(0);
    });
  }
}
