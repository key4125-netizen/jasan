// E2E-07 Model Semantic Safety (Phase 6-C) - Phase 6-B 감사에서 지적된 "계산은 맞지만 사용자가
// 오해할 수 있는" semantic 이슈에 대응해 추가한 안내 카드/문구가 실제로 표시되는지 UI 레벨에서
// 확인한다. 계산 결과 자체는 이 Phase에서 손대지 않았으므로 여기서는 텍스트 노출 여부만 검증한다.
const { test, expect } = require('@playwright/test');
const { seedPortfolio, goToProjectionTab } = require('./fixtures');

test('Deterministic 시나리오 설명 - "기준 연간 성장률"과 Monte Carlo와의 가정 차이가 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2ESemantic국내', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  // 시나리오 카드 라벨이 "기대수익률"에서 "기준 연간 성장률"로 바뀌었는지(median 의미 명확화).
  await expect(page.getByText('기준 연간 성장률').first()).toBeVisible();

  // [Phase 24-B STEP 9 - 검증 경로 갱신] 이 설명(“평균이 아니라”/“같은 조건을 두 방식으로 검증한 것이
  // 아니라”)은 문구가 삭제된 것이 아니라 메인 상시 노출에서 ⓘ 팝업으로 이동했다(모바일에서 실행 버튼
  // 도달 전 스크롤 부담을 줄이기 위한 제품 결정) - assertion을 약화하지 않고, 팝업을 실제로 열어
  // 동일한 문구가 그대로 있는지 확인하도록 경로만 갱신한다(팝업 열림 검증이 추가되어 검증 강도는 오히려 높아짐).
  await expect(page.locator('#mcIntroInfoBtn')).toBeVisible();
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  await expect(page.locator('#mcInfoModalBody')).toContainText('평균이 아니라');
  await expect(page.locator('#mcInfoModalBody')).toContainText('같은 조건을 두 방식으로 검증한 것이 아니라');
  await page.locator('#closeMcInfoModalBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeHidden();
});

test('Monte Carlo 실행 결과에 기대수익률/Goal Probability/데이터 기간/모델 범위 안내 카드가 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2ESemantic국내2', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcGoalAmountInput').fill('100000000');
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  // [Phase 17 P1-4] 이 안내 카드들은 전부 severity=INFO(always-on 설명)라 이제 결과보다 아래
  // "상세보기" 영역(mcSafetyDetail)에 표시된다 - mcSafetyIssues는 더 이상 정상 완료 경로에서 쓰이지
  // 않는다(BLOCK 전용). 접힌 아코디언 안이라도 DOM에는 그대로 남아있어 innerText로 확인 가능하다.
  const safetyText = await page.locator('#mcSafetyDetail').innerText();
  // [Phase 22 STEP 9 - 용어 통일] "기대수익률의 의미" -> "기준 연간 성장률의 의미"로 문구만 변경
  // (Phase 21 T-08) - 판정/카드 노출 조건은 무변경.
  expect(safetyText).toContain('기준 연간 성장률의 의미');
  expect(safetyText).toContain('목표 달성 확률의 의미');
  expect(safetyText).toContain('변동성·상관관계 데이터 기간 안내');
  expect(safetyText).toContain('이 시뮬레이션의 범위 안내');
  // 해외자산이 없으므로 FX 안내 카드는 나타나면 안 된다.
  expect(safetyText).not.toContain('해외자산 환율 변동 미반영 안내');
});

test('목표금액 미설정 시 Goal Probability 안내 카드는 나타나지 않는다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [{ owner: '신랑', region: '국내', name: 'E2ESemantic국내3', pct: 100 }],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const safetyText = await page.locator('#mcSafetyDetail').innerText();
  expect(safetyText).not.toContain('목표 달성 확률의 의미');
});

test('해외자산이 포함되면 FX 환율 변동 미반영 안내 카드가 표시된다', async ({ page }) => {
  await seedPortfolio(page, {
    targets: [
      { owner: '신랑', region: '국내', name: 'E2ESemantic국내채권4', pct: 100 },
      { owner: '신랑', region: '해외', name: 'E2ESemantic해외채권', pct: 100 },
    ],
    projection: { inflationRate: 2.5 },
  });
  await goToProjectionTab(page);

  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 15000 });

  const safetyText = await page.locator('#mcSafetyDetail').innerText();
  expect(safetyText).toContain('해외자산 환율 변동 미반영 안내');
});
