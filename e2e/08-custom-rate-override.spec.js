// E2E-08 Phase 7-F Test A - "수익률 관리"의 customScenarioRates 오버라이드가 Deterministic
// 시나리오 카드와 Monte Carlo 양쪽 계산 경로에 동일하게 반영되는지 확인한다(둘 다 동일한
// getTargetProjectionRate()를 공유하므로 구조적으로 보장되지만, 이번 Phase에서 실제로 값이 바뀌는
// 것을 E2E로 직접 재확인한다). UI 버튼은 Phase 7-F에서 일반 사용자 화면 비노출로 이동했지만, 그
// 내부 메커니즘(state.projection.customScenarioRates)은 그대로 유지되므로 fixture에서 직접 세팅한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('customScenarioRates 오버라이드가 Deterministic 카드 3개 모두에 정확히 반영된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E커스텀오버라이드채권', pct: 100 }],
    projection: {
      customScenarioRates: {
        E2E_CUSTOM_TEST: { conservative: 45, normal: 45, optimistic: 45, keywords: ['커스텀오버라이드'] },
      },
    },
  });
  await goToProjectionTab(page);

  // 3개 시나리오 카드(보수적/일반적/긍정적)에 전부 동일한 45%가 반영되어야 한다(단일 100%
  // 보유자산이라 포트폴리오 가중평균이 오버라이드 값과 정확히 같다). fmtNum이 정수는 소수점 없이
  // 표시하므로("45%", "45.00%" 아님) 실제 렌더링 형식 그대로 확인한다.
  const cardsText = await page.locator('#scenarioSummaryCardsGrid').innerText();
  const matches = cardsText.match(/45%/g) || [];
  expect(matches.length).toBe(3);
});

test('customScenarioRates 오버라이드 값이 커질수록 Monte Carlo P50도 함께 커진다(엔진 반영 확인)', async ({ page }) => {
  // [주의] 키워드는 종목명의 실제 연속 부분문자열이어야 한다 - "이름 뒤에 숫자만 붙이고 키워드에도
  // 같은 숫자를 붙이면" 이름 안에서 "채권"이 그 사이에 끼어들어 부분문자열이 깨진다(keywordMatchesName은
  // 단순 hay.includes(kw)라 순서가 그대로 이어져야 한다) - 실제로 이 실수 때문에 처음엔 오버라이드가
  // 전혀 매칭되지 않고 categories.채권 기본값(4%)으로 조용히 폴백되는 것을 실측으로 확인했다.
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2E커스텀테스트투채권', pct: 100 }],
    projection: {
      customScenarioRates: {
        E2E_CUSTOM_TEST2: { conservative: 2, normal: 2, optimistic: 2, keywords: ['커스텀테스트투'] },
      },
    },
  });
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const p50Low = await page.locator('#mcP50Text').innerText();

  // 같은 포트폴리오, 오버라이드 값만 2% -> 30%로 대폭 상향 - MC P50이 반드시 커져야 한다.
  await page.evaluate(() => {
    state.projection.customScenarioRates.E2E_CUSTOM_TEST2.conservative = 30;
    state.projection.customScenarioRates.E2E_CUSTOM_TEST2.normal = 30;
    state.projection.customScenarioRates.E2E_CUSTOM_TEST2.optimistic = 30;
    persistProjection();
  });
  await page.reload();
  await goToProjectionTab(page);
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });
  const p50High = await page.locator('#mcP50Text').innerText();

  const parseEok = (s) => parseFloat(s.replace(/[^0-9.]/g, ''));
  expect(parseEok(p50High)).toBeGreaterThan(parseEok(p50Low));
});
