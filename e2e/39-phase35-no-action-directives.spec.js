// E2E-39 Phase 35 - "앱이 투자 행동을 지시하지 않는다" + "결측을 정상으로 표시하지 않는다" 상시 회귀.
//
// [핵심 계약]
//  1) Risk/매크로 문구는 "지금 어떤 상태인가 + 무엇을 함께 확인하면 되는가"까지만 말한다.
//     매수/매도/손절/이익실현/비중축소/방어자산확보/관망/분할매수 같은 행동 지시는 금지다.
//     "매도하지 마세요" 같은 부정형도 결국 행동 지시이므로 함께 금지한다.
//  2) 사용자의 실제 목표비중을 모르는 상태에서 "목표 비중 15% 이하" 같은 숫자를 제시하지 않는다.
//  3) 특정 종목/ETF/티커를 대안으로 권하지 않는다(예전엔 QQQM/SPYM/TLT를 직접 권했다).
//  4) 매크로 데이터가 없으면 "평이한 흐름"이라고 하지 않는다 - 결측/제한을 그대로 밝힌다.
//  5) 이 Phase는 표현만 바꾼다 - 위험점수 계산 결과는 그대로여야 한다.
//
// [외부 API 비의존] 위험점수/개별 종목 판정은 가격 이력이 필요해 이 샌드박스에서 재현할 수 없으므로,
// 문구 생성 함수에 대표 입력을 직접 넣어 출력 문자열을 검사한다(실제 렌더가 쓰는 바로 그 함수들이다).
const { test, expect } = require('@playwright/test');

// 행동을 지시하는 표현 - 긍정형/부정형 모두 금지한다.
const BANNED = [
  '매도하', '파세요', '팔아', '손절', '이익을 실현', '이익 실현',
  '추가 매수는', '추가 매수보다', '분할매수', '분할로 접근', '관망',
  '방어자산을 확보', '방어 자산을 확보', '방어자산 확보 필요',
  '비중을 줄이', '비중을 줄여', '나눠 담으세요', '유지하세요',
  '목표 비중(15', '15% 정도 확보', '유리한 시점', '서두르지'
];
// 특정 상품을 권하지 않는다.
const BANNED_TICKERS = ['QQQM', 'SPYM', 'TLT'];

function assertNoDirective(text, label) {
  const hit = BANNED.filter((w) => text.includes(w));
  expect(hit, `${label}: 행동 지시 표현 발견 → ${JSON.stringify(hit)} / 원문: ${text}`).toEqual([]);
  const tk = BANNED_TICKERS.filter((t) => text.includes(t));
  expect(tk, `${label}: 특정 종목 추천 발견 → ${JSON.stringify(tk)} / 원문: ${text}`).toEqual([]);
}

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof buildMacroCommentary === 'function' && typeof buildIndividualActionItem === 'function');
}

/* ─────────────────────────── Macro: 정상 / 결측 구분 ─────────────────────────── */

test('1. 매크로 정상 데이터 - 시장 상태를 설명하고 행동은 지시하지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => buildMacroCommentary({
    vix: 15, fxChangePct: 0.01, ust10yChangePct: 0.01, kospiChangePct: 0.01,
    goldChangePct: 0.1, usdxChangePct: 0.1, foreignWeightPct: 40
  }));
  expect(r.cause).toContain('평이한 흐름');       // 정상 데이터일 때만 이 문구가 허용된다
  assertNoDirective(r.cause + r.impact + r.note, '매크로 정상');
});

test('2. 매크로 일부 데이터 결측 - "평이함"으로 표시되지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => buildMacroCommentary({
    vix: 15, fxChangePct: null, ust10yChangePct: 0.01, kospiChangePct: null,
    goldChangePct: null, usdxChangePct: null, foreignWeightPct: null
  }));
  expect(r.cause).not.toContain('평이한 흐름');
  expect(r.cause).not.toContain('특별한 쏠림 없이');
  expect(r.cause).toContain('확인할 수 없어');
  expect(r.cause).toContain('원/달러');           // 어떤 지표가 없는지 밝힌다
  expect(r.cause).toContain('코스피');
  assertNoDirective(r.cause + r.impact + r.note, '매크로 일부 결측');
});

test('3. 매크로 핵심 데이터 전부 결측 - 종합 판단 불가를 명시한다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => buildMacroCommentary({
    vix: null, fxChangePct: null, ust10yChangePct: null, kospiChangePct: null,
    goldChangePct: null, usdxChangePct: null, foreignWeightPct: null
  }));
  expect(r.cause).toContain('시장현황을 표시하기 어렵습니다');
  expect(r.cause).not.toContain('평이');
  expect(r.impact).not.toContain('없는 편입니다');   // "특별한 압력 없음"으로 단정하지 않는다
  assertNoDirective(r.cause + r.impact + r.note, '매크로 전부 결측');
});

test('4. 매크로 - 어떤 시장 국면에서도 행동 지시가 나오지 않는다(8개 규칙 전수)', async ({ page }) => {
  await boot(page);
  const outputs = await page.evaluate(() => {
    const cases = [
      { vix: 35, fxChangePct: 0.2, ust10yChangePct: 0.2, kospiChangePct: -1 },        // VIX 급등
      { vix: 22, fxChangePct: 0.2, ust10yChangePct: 0.2, kospiChangePct: -1, goldChangePct: 2 }, // 안전자산 선호
      { vix: 15, fxChangePct: 0.2, ust10yChangePct: 0.2, kospiChangePct: 0.2, usdxChangePct: 1 },  // 강달러
      { vix: 15, fxChangePct: 0.2, ust10yChangePct: 0.2, kospiChangePct: 0.2, usdxChangePct: -1 }, // 약달러
      { vix: 15, fxChangePct: 0.5, ust10yChangePct: 0.5, kospiChangePct: 0.1 },        // 금리+환율 동반 상승
      { vix: 15, fxChangePct: 0.1, ust10yChangePct: -0.5, kospiChangePct: 0.5 },       // 금리 하락+코스피 상승
      { vix: 15, fxChangePct: -0.5, ust10yChangePct: 0.01, kospiChangePct: 0.5 },      // 원화 강세+코스피 상승
      { vix: 25, fxChangePct: 0.01, ust10yChangePct: 0.01, kospiChangePct: -0.5 }      // 코스피 조정+불안
    ];
    return cases.map((c) => {
      const r = buildMacroCommentary(Object.assign({ goldChangePct: null, usdxChangePct: null, foreignWeightPct: 30 }, c));
      return r.cause + ' ' + r.impact + ' ' + r.note;
    });
  });
  expect(outputs).toHaveLength(8);
  outputs.forEach((t, i) => assertNoDirective(t, `매크로 규칙 ${i + 1}`));
});

test('5. 매크로 - guide(대응 가이드) 필드가 부활하지 않았다', async ({ page }) => {
  await boot(page);
  const keys = await page.evaluate(() => Object.keys(buildMacroCommentary({
    vix: 35, fxChangePct: 0.2, ust10yChangePct: 0.2, kospiChangePct: -1
  })));
  expect(keys).not.toContain('guide');
  expect(keys).toContain('note');
});

/* ─────────────────────────── Risk: 개별 종목 문구 ─────────────────────────── */

test('6. RSI 과열 - 매도/이익실현 지시가 나오지 않는다', async ({ page }) => {
  await boot(page);
  const t = await page.evaluate(() => buildIndividualActionItem({ hasData: true, rsiState: '과열', rsi14: 78 }, 10));
  expect(t).toContain('과열');
  assertNoDirective(t, 'RSI 과열');
});

test('7. 52주 급락 - 방어자산 확보 지시가 나오지 않는다', async ({ page }) => {
  await boot(page);
  const t = await page.evaluate(() => buildIndividualActionItem({ hasData: true, rsiState: '적정', week52DrawdownPct: -42 }, 10));
  expect(t).toContain('52주 고점');
  assertNoDirective(t, '52주 급락');
});

test('8. 거래량 급증 - 매매 행동 지시가 나오지 않는다', async ({ page }) => {
  await boot(page);
  const t = await page.evaluate(() => buildIndividualActionItem({ hasData: true, rsiState: '적정', volumeSpike: true }, 10));
  expect(t).toContain('거래량');
  assertNoDirective(t, '거래량 급증');
});

test('9. 추세 이탈 - 손절 기준 지시가 나오지 않는다', async ({ page }) => {
  await boot(page);
  const t = await page.evaluate(() => buildIndividualActionItem({ hasData: true, rsiState: '적정', trendLabel: '역배열(하락추세)' }, 10));
  expect(t).toContain('역배열');
  assertNoDirective(t, '추세 이탈');
});

test('10. 비중 과다 - 하드코딩 "목표 비중 15%"가 다시 등장하지 않는다', async ({ page }) => {
  await boot(page);
  const texts = await page.evaluate(() => [
    buildIndividualActionItem({ hasData: true, rsiState: '적정' }, 40),
    buildIndividualActionItem({ hasData: true, rsiState: '과열', rsi14: 80 }, 40)
  ]);
  texts.forEach((t, i) => {
    expect(t, `비중과다 ${i}`).not.toContain('15%');
    expect(t).toContain('비중');
    assertNoDirective(t, `비중 과다 ${i}`);
  });
});

test('11. 개별 종목 태그 - 행동 지시형 이름이 아니다', async ({ page }) => {
  await boot(page);
  const tags = await page.evaluate(() => [
    buildAssetActionTag(['단기 과열']),
    buildAssetActionTag(['52주 고점대비 급락']),
    buildAssetActionTag(['추세 이탈']),
    buildAssetActionTag(['거래량 급증'])
  ]);
  tags.forEach((t) => assertNoDirective(String(t), '태그'));
  expect(tags[0]).toBe('비중·가격 점검');
  expect(tags[1]).toBe('낙폭 점검');
});

test('12. 포트폴리오 점검 항목 - 지시/특정 종목 추천이 없다', async ({ page }) => {
  await boot(page);
  const items = await page.evaluate(() => buildRiskActionItems({
    topWeight: 40,
    topHolding: { name: '테스트종목', benchmarkKey: 'SP500', riskContributionPct: 55 },
    portfolioBeta: 1.4,
    weightedAvgCorrelation: 0.8,
    topCorrelationPair: ['A종목', 'B종목'],
    sectorExposure: { topSectorWeight: 70, topSector: '반도체' },
    subScores: {}
  }));
  expect(items.length).toBeGreaterThanOrEqual(4);
  items.forEach((t, i) => assertNoDirective(t, `점검 항목 ${i}`));
});

test('13. 위험 신호가 없을 때도 "유지하세요" 같은 지시가 없다', async ({ page }) => {
  await boot(page);
  const items = await page.evaluate(() => buildRiskActionItems({
    topWeight: 5, topHolding: null, portfolioBeta: 0.9,
    weightedAvgCorrelation: 0.2, topCorrelationPair: null,
    sectorExposure: { topSectorWeight: 10, topSector: 'IT' }, subScores: {}
  }));
  expect(items).toEqual(['현재 특별한 위험 신호가 없습니다.']);
});

/* ─────────────────────────── 계산 불변 + 환율 결측 ─────────────────────────── */

test('14. 위험점수 계산은 이번 변경의 영향을 받지 않는다(문구 함수는 순수 문자열)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const m = {
      topWeight: 40, topHolding: { name: 'X', benchmarkKey: 'SP500' }, hhi: 0.3,
      sectorExposure: { topSectorWeight: 70, topSector: '반도체' },
      portfolioVolatilityPct: 22, portfolioMDDPct: -25, var95Pct: -3, cvarPct: -5,
      portfolioBeta: 1.3, weightedAvgCorrelation: 0.8
    };
    const before = {
      concentration: computeConcentrationRiskScore(m),
      volatility: computeVolatilityRiskScore(m),
      drawdown: computeDrawdownTailRiskScore(m),
      market: computeMarketRiskScore(m),
      correlation: computeCorrelationRiskScore(m)
    };
    buildRiskActionItems(Object.assign({ subScores: {}, topCorrelationPair: ['A', 'B'] }, m)); // 문구 생성
    buildIndividualActionItem({ hasData: true, rsiState: '과열', rsi14: 80 }, 40);
    const after = {
      concentration: computeConcentrationRiskScore(m),
      volatility: computeVolatilityRiskScore(m),
      drawdown: computeDrawdownTailRiskScore(m),
      market: computeMarketRiskScore(m),
      correlation: computeCorrelationRiskScore(m)
    };
    return { before, after, composite: computeCompositeRiskScore(before) };
  });
  expect(r.after).toEqual(r.before);
  // 기존 밴드 그대로인지 값으로 고정한다(계산식이 바뀌면 여기서 잡힌다).
  expect(r.before).toEqual({ concentration: 73, volatility: 60, drawdown: 60, market: 75, correlation: 80 });
  expect(r.composite).toBe(67);
});

test('15. 환율 기준값이 없으면 "보합"이 아니라 결측으로 다룬다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const guide = buildAssetCorrelationGuide({ ust10yChangePct: 0.5, fxChangePct: null });
    const commentary = buildMacroCommentary({
      vix: 15, fxChangePct: null, ust10yChangePct: 0.01, kospiChangePct: 0.01,
      goldChangePct: null, usdxChangePct: null, foreignWeightPct: null
    });
    return { note: guide.note, cause: commentary.cause };
  });
  expect(r.note).toContain('확인할 수 없어');
  expect(r.note).not.toContain('다르게 움직이고 있어요');  // 결측을 관측 결과처럼 단정하지 않는다
  expect(r.cause).toContain('원/달러');
});

/* ─────────────────────────── 모바일 / Dark ─────────────────────────── */

for (const w of [375, 390, 412, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 매크로 브리핑 문구가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.locator('[data-tab="dashboard"]').click();
      // [v234] 브리핑 자체는 기본 펼침이고, 그 아래 해석만 접혀 있다 - 문구를 재려면 해석을 연다.
      await page.locator('#macroDiagnosisToggleBtn').click();
      await expect(page.locator('#macroBriefingDiagnosis')).toBeVisible();
      const info = await page.locator('#macroBriefingDiagnosis').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const sizes = [...el.querySelectorAll('p, span, li')]
          .filter((n) => n.textContent.trim())
          .map((n) => parseFloat(win.getComputedStyle(n).fontSize));
        return { min: sizes.length ? Math.min(...sizes) : null, clipped: el.scrollWidth - el.clientWidth };
      });
      expect(info.min).toBeGreaterThanOrEqual(14);
      expect(info.clipped).toBeLessThanOrEqual(1);
      const bodyOverflow = await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(bodyOverflow).toBeLessThanOrEqual(1);
    });
  }
}
