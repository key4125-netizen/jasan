// E2E-29 Phase 24-B - Owner별 Monte Carlo(신랑/와이프/가구 전체) + Scenario 통합/축소 전용 회귀.
//
// [핵심 검증 원칙] "가구 전체"는 Phase 24-B 이전과 완전히 동일한 결과여야 하고(기존 사용자 보호),
// owner 단독 선택은 그 owner의 자산·목표비중·월적립금만 반영해야 한다(다른 owner가 결과에 전혀
// 영향을 주지 않음). MC 코어 엔진(js/15)은 이번 작업에서 수정되지 않았고, 입력을 만드는 상위 레이어
// (js/05 computeHouseholdTargetInstrumentWeights/computeHouseholdMonteCarloPV, js/16 어댑터)에만
// ownerFilter가 추가됐다.
//
// [시드 설계] 외부 시세 API에 의존하지 않도록 티커 없는 채권(변동성 0) 2건만 쓴다 - 이 환경에서
// 가격 이력 조회가 막혀 있어도(Phase 23-R에서 원인 규명됨) MC가 정상 실행된다. 변동성이 0이라
// 신랑 결과 + 와이프 결과 = 가구 전체 결과가 수학적으로 정확히 성립해, owner 분리가 올바른지
// 숫자로 직접 검증할 수 있다는 이점도 있다.
const { test, expect } = require('@playwright/test');

async function seedTwoOwners(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E29신랑채권', category: '채권', owner: '신랑', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW' }),
      makeAsset({ name: 'E2E29와이프채권', category: '채권', owner: '와이프', accountType: '일반계좌', isDomestic: '국내', quantity: 1, buyPrice: 200000000, currentPrice: 200000000, currency: 'KRW' }),
    ];
    persistAssets();
    state.rebalance = {
      updatedAt: Date.now(),
      '신랑': { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'E2E29신랑채권', label: 'E2E29신랑채권', pct: 100, role: '수비수' }], '해외': [] } },
      '와이프': { domestic: { '국내': 100, '해외': 0 }, targets: { '국내': [{ type: 'namedHolding', name: 'E2E29와이프채권', label: 'E2E29와이프채권', pct: 100, role: '수비수' }], '해외': [] } }
    };
    persistRebalance();
    state.projection.monthlyContributionByOwner = {
      '신랑': { total: 300000, years: null, allocation: [] },
      '와이프': { total: 200000, years: null, allocation: [] }
    };
    state.projection.taxAdvantagedPlan.monthlyByOwner = { '신랑': 0, '와이프': 0 }; // 절세계좌 계획 없음(기본 상태)
    persistProjection();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('미래 예측', { exact: true }).click();
}

async function runMcAndReadP50(page, scope) {
  await page.locator(`#mcOwnerScopeSegmented [data-scope="${scope}"]`).click();
  await page.locator('#mcRunBtn').click();
  await expect(page.locator('#mcResultArea')).toBeVisible({ timeout: 30000 });
  return (await page.locator('#mcP50Text').textContent()).trim();
}

test('1+5. 기본값은 "가구 전체"이고, 그 상태로 실행하면 두 owner의 자산·적립금이 모두 반영된 결과가 나온다', async ({ page }) => {
  await seedTwoOwners(page);
  // 기본 선택 상태 확인 - 기존 사용자에게 가장 익숙한 현재 동작이 기본값이어야 한다.
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="household"]')).toHaveAttribute('aria-pressed', 'true');

  const p50 = await runMcAndReadP50(page, 'household');
  expect(p50).not.toBe('-');
  // 월 적립금 표시는 두 owner 합계(30만+20만=50만)여야 한다.
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('50만원');
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('가구 전체 목표비중');
  // 목표확률 영역도 정상 렌더(목표금액 미설정 안내 또는 확률) - 존재 자체를 확인한다.
  await expect(page.locator('#mcGoalArea')).toBeVisible();
});

test('2. 신랑 MC - 신랑의 자산/적립금만 반영되고 와이프 자산은 결과·Safety 어디에도 섞이지 않는다', async ({ page }) => {
  await seedTwoOwners(page);
  await runMcAndReadP50(page, '신랑');
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('30만원'); // 신랑 적립금만
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('신랑님의 목표비중');
  const resultText = await page.locator('#mcResultArea').innerText();
  expect(resultText).toContain('E2E29신랑채권');
  expect(resultText).not.toContain('E2E29와이프채권'); // 와이프 자산이 전혀 등장하지 않아야 한다
});

test('3. 와이프 MC - 와이프의 자산/적립금만 반영되고 신랑 자산은 섞이지 않는다', async ({ page }) => {
  await seedTwoOwners(page);
  await runMcAndReadP50(page, '와이프');
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('20만원'); // 와이프 적립금만
  await expect(page.locator('#mcContributionScheduleArea')).toContainText('와이프님의 목표비중');
  const resultText = await page.locator('#mcResultArea').innerText();
  expect(resultText).toContain('E2E29와이프채권');
  expect(resultText).not.toContain('E2E29신랑채권');
});

test('4. owner 전환 - 관점을 바꾸면 이전 결과가 남아 오해를 주지 않도록 즉시 숨겨진다', async ({ page }) => {
  await seedTwoOwners(page);
  await runMcAndReadP50(page, 'household');
  await expect(page.locator('#mcResultArea')).toBeVisible();
  await page.locator('#mcOwnerScopeSegmented [data-scope="신랑"]').click();
  await expect(page.locator('#mcResultArea')).toBeHidden(); // 새 관점으로 다시 실행해야 결과를 볼 수 있다
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="신랑"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="household"]')).toHaveAttribute('aria-pressed', 'false');
});

test('5-2. 변동성 0(채권) 시드에서 신랑 P50 + 와이프 P50 = 가구 전체 P50 (owner 분리가 수학적으로 일관됨)', async ({ page }) => {
  await seedTwoOwners(page);
  // 화면 표기(억 단위 반올림) 대신 엔진 원본값을 직접 읽어 정확히 비교한다.
  const readP50Raw = async (scope) => {
    await page.locator(`#mcOwnerScopeSegmented [data-scope="${scope}"]`).click();
    return page.evaluate(async (ownerScope) => {
      const adapter = await buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: ownerScope });
      const years = Math.max(...getMilestoneYearOffsets());
      const pv = computeHouseholdMonteCarloPV(ownerScope);
      const inputs = ownerScope ? [ownerScope] : REBALANCE_OWNERS;
      const monthly = inputs.reduce((s, o) => s + getOwnerMonthlyContributionInputs(o).monthlyContribution, 0);
      const engineConfig = {
        pv0: pv, instruments: adapter.instruments, correlationMatrix: adapter.correlationMatrix,
        monthlyContribution: monthly, years, iterations: 200, seed: 20260101
      };
      return runMonthlyPrecisionMC(engineConfig).milestones.at(-1).p50;
    }, scope === 'household' ? null : scope);
  };
  const husband = await readP50Raw('신랑');
  const wife = await readP50Raw('와이프');
  const household = await readP50Raw('household');
  // 변동성 0 자산만 있으므로 두 owner의 결과 합이 가구 전체와 정확히 일치해야 한다(부동소수점 오차 허용).
  expect(husband + wife).toBeCloseTo(household, -3);
  expect(husband).toBeGreaterThan(0);
  expect(wife).toBeGreaterThan(0);
});

test('6. Monte Carlo 설명 팝업 - 열기/닫기가 정상 동작하고 기존 설명 내용이 그대로 담겨 있다', async ({ page }) => {
  await seedTwoOwners(page);
  await expect(page.locator('#mcInfoModal')).toBeHidden();
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  await expect(page.locator('#mcInfoModalTitle')).toHaveText('Monte Carlo란?');
  // 메인에서 옮겨온 원문(문구 삭제 없이 이동만 함)이 그대로 있어야 한다.
  await expect(page.locator('#mcInfoModalBody')).toContainText('공식 모델: Monthly Precision Monte Carlo');
  await expect(page.locator('#mcInfoModalBody')).toContainText('연 1회 리밸런싱');
  await page.locator('#closeMcInfoModalBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeHidden();
});

test('7. Scenario 섹션 - 기본은 접혀 있고, 펼치면 3개 시나리오 비교 내용이 그대로 보인다', async ({ page }) => {
  await seedTwoOwners(page);
  const body = page.locator('#scenarioSectionAccordionBody');
  await expect(body).toHaveAttribute('style', /max-height:\s*0px/); // 기본 접힘 - 화면 상단을 차지하지 않는다
  await page.locator('#scenarioSectionAccordionBtn').click();
  await expect(body).not.toHaveAttribute('style', /max-height:\s*0px/);
  await expect(page.locator('#scenarioGeneralView')).toBeVisible();
  await expect(page.locator('#scenarioGeneralView')).toContainText('시나리오별 일반계좌 그래프');
});

test('8. 절세계좌 적립계획이 없으면 "전체 자산" 관점 토글 자체가 숨겨진다(중복 표시 제거)', async ({ page }) => {
  await seedTwoOwners(page); // 시드에서 monthlyByOwner를 0으로 설정함
  await expect(page.locator('#scenarioViewToggle')).toBeHidden();
  await page.locator('#scenarioSectionAccordionBtn').click();
  await expect(page.locator('#scenarioGeneralView')).toBeVisible();
  await expect(page.locator('#scenarioTotalView')).toBeHidden(); // 일반계좌와 동일한 숫자를 반복하지 않는다
});

test('9. 절세계좌 적립계획이 있으면 토글이 나타나고 [일반계좌]/[전체 자산] 관점 전환이 동작한다', async ({ page }) => {
  await seedTwoOwners(page);
  await page.evaluate(() => {
    state.projection.taxAdvantagedPlan.monthlyByOwner = { '신랑': 300000, '와이프': 200000 };
    persistProjection();
    renderAll();
  });
  await expect(page.locator('#scenarioViewToggle')).toBeVisible();
  await page.locator('#scenarioSectionAccordionBtn').click();
  await expect(page.locator('#scenarioGeneralView')).toBeVisible();
  await page.locator('#scenarioViewToggle [data-view="total"]').click();
  await expect(page.locator('#scenarioTotalView')).toBeVisible();
  await expect(page.locator('#scenarioGeneralView')).toBeHidden(); // 그래프 2벌을 동시에 쌓아두지 않는다
  await page.locator('#scenarioViewToggle [data-view="general"]').click();
  await expect(page.locator('#scenarioGeneralView')).toBeVisible();
});

test('10. Dark Mode 전환 후에도 owner MC 결과가 그대로 보존된다(재실행되지 않음)', async ({ page }) => {
  await seedTwoOwners(page);
  await runMcAndReadP50(page, '신랑');
  const before = await page.locator('#mcResultArea').innerHTML();
  await page.locator('#darkModeBtn').click();
  await page.waitForTimeout(300);
  const afterDark = await page.locator('#mcResultArea').innerHTML();
  await page.locator('#darkModeBtn').click();
  await page.waitForTimeout(300);
  const afterLight = await page.locator('#mcResultArea').innerHTML();
  expect(afterDark).toBe(before);
  expect(afterLight).toBe(before);
});

/* ---------------------------------------------------------------------------
 * [Phase 24-B 최종검증에서 발견·수정된 3건의 회귀 방지]
 * 실제 모바일(375x812 Dark) 검증 중 발견한 결함들이다 - 계산 결과와 무관한 접근성/터치/뒤로가기
 * 문제라 기존 테스트가 잡지 못했다. 수정 후 같은 조건에서 재현 테스트를 남긴다.
 * ------------------------------------------------------------------------ */
test('11. 관점 세그먼트 3개 버튼 모두 최초 로드 시점부터 aria-pressed를 갖는다(스크린리더가 3지선다로 인식)', async ({ page }) => {
  await seedTwoOwners(page);
  // 클릭하기 전(초기 HTML 상태)에도 비활성 버튼이 aria-pressed="false"를 명시해야 한다 -
  // 속성이 아예 없으면 스크린리더가 "선택되지 않은 토글"이 아니라 "그냥 버튼"으로 읽어
  // 세 개가 서로 배타적인 선택지라는 사실 자체가 전달되지 않는다.
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="신랑"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="와이프"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#mcOwnerScopeSegmented [data-scope="household"]')).toHaveAttribute('aria-pressed', 'true');
});

test('12. MC 안내 팝업의 열기/닫기 컨트롤이 모바일 375px에서 44px 터치 타겟을 만족한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedTwoOwners(page);
  const infoBtn = page.locator('#mcIntroInfoBtn');
  expect((await infoBtn.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await infoBtn.click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  const x = await page.locator('#closeMcInfoModalBtn').boundingBox();
  expect(x.width).toBeGreaterThanOrEqual(44);
  expect(x.height).toBeGreaterThanOrEqual(44);
  expect((await page.locator('#closeMcInfoModalBtnBottom').boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('13. MC 안내 팝업은 물리 뒤로가기/ESC로 닫힌다(앱 종료 토스트가 뜨지 않는다)', async ({ page }) => {
  await seedTwoOwners(page);
  // 물리 뒤로가기 - SWIPE_MODAL_IDS에 등록되지 않으면 popstate 핸들러가 이 모달을 못 찾아
  // "한 번 더 누르면 종료됩니다" 경로로 빠진다(팝업은 열린 채 남음).
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#mcInfoModal')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('한 번 더 누르면 종료');
  // ESC - 동일 레지스트리를 재사용하므로 함께 확인한다.
  await page.locator('#mcIntroInfoBtn').click();
  await expect(page.locator('#mcInfoModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mcInfoModal')).toBeHidden();
});
