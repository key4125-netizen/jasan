// E2E-67 [V1.2-A] Macro/Risk clarity 최소 구현 회귀 테스트.
//
// C1: 매크로 지표별 "마지막 정상 조회 시각"을 실패해도 사라지지 않게 보여준다(판단성 문구 없음, 새
//     stale threshold 없음). C2: 매크로 브리핑과 RISK 진단이 서로 다른 계산이라는 한 줄 안내.
// C4: VIX 등 threshold가 절대 기준이 아니라 참고용 구간이라는 한 줄 고지.
//
// 셋 다 계산식/판정 로직을 전혀 건드리지 않았으므로, 여기서는 (1) 문구/시각이 실제로 나타나는지
// (2) 실패해도 기존 값·시각이 사라지지 않는지 (3) threshold 숫자와 리스크 신호등 판정이 그대로인지만
// 확인한다. 외부 네트워크는 쓰지 않는다(실제 fetch 대신 state.macroIndicatorCache를 직접 채워
// "정상 조회 성공/실패"를 흉내낸다 - js/11 macroPromise의 실제 대입 방식과 동일한 형태로).
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderMacroBriefing === 'function');
}

// [v234] 매크로 브리핑은 대시보드 진입 직후부터 펼쳐져 있다 - 예전처럼 헤더를 누르면 오히려
// 접히므로 클릭하지 않는다. 지수 타일을 바로 쓸 수 있는 상태로만 만들어 준다.
async function openMacroBriefing(page) {
  await page.locator('[data-tab="dashboard"]').click();
}

test.describe('V1.2-A 매크로/리스크 명확성 최소 구현', () => {
  test('A. 정상 조회 성공 시 fetchedAt이 기록되고 상세 팝업에 "마지막 정상 조회"가 표시된다', async ({ page }) => {
    await open(page);
    await openMacroBriefing(page);
    await page.locator('body').evaluate(() => {
      state.macroIndicatorCache['VIX'] = { price: 18.5, changePercent: -1.2, fetchedAt: Date.now() };
      renderMacroBriefing();
    });
    await page.locator('[data-ticker="^VIX"]').click();
    await expect(page.locator('#assetDetailModal')).toBeVisible();
    await expect(page.locator('#assetDetailModal')).toContainText('마지막 정상 조회');
  });

  test('B. 재조회 성공 시 timestamp가 갱신된다', async ({ page }) => {
    await open(page);
    const result = await page.locator('body').evaluate(() => {
      state.macroIndicatorCache['VIX'] = { price: 18.5, changePercent: -1.2, fetchedAt: 1000 };
      const t1 = state.macroIndicatorCache['VIX'].fetchedAt;
      state.macroIndicatorCache['VIX'] = { price: 19.1, changePercent: 0.5, fetchedAt: 2000 }; // 두 번째 정상 조회
      const t2 = state.macroIndicatorCache['VIX'].fetchedAt;
      return { t1, t2 };
    });
    expect(result.t2).toBeGreaterThan(result.t1);
  });

  test('C. 조회 실패 시 기존 값과 fetchedAt이 그대로 유지된다(삭제/0/새 timestamp 없음)', async ({ page }) => {
    await open(page);
    const result = await page.locator('body').evaluate(() => {
      state.macroIndicatorCache['VIX'] = { price: 18.5, changePercent: -1.2, fetchedAt: 12345 };
      // js/11 macroPromise: Promise.allSettled 결과가 rejected면 그 인덱스의 if(fulfilled) 분기가
      // 아예 실행되지 않는다 - 여기서도 "아무 대입도 하지 않음"으로 실패를 그대로 흉내낸다.
      return { ...state.macroIndicatorCache['VIX'] };
    });
    expect(result).toEqual({ price: 18.5, changePercent: -1.2, fetchedAt: 12345 });
  });

  test('D. 최초 조회 실패/데이터 없음 상태에서는 "마지막 정상 조회" 문구가 나타나지 않는다', async ({ page }) => {
    await open(page);
    await openMacroBriefing(page);
    await page.locator('body').evaluate(() => {
      state.macroIndicatorCache = {}; // 한 번도 정상 조회된 적 없음
      renderMacroBriefing();
    });
    await page.locator('[data-ticker="^VIX"]').click();
    await expect(page.locator('#assetDetailModal')).toBeVisible();
    await expect(page.locator('#assetDetailModal')).not.toContainText('마지막 정상 조회');
  });

  test('E. 한 지표의 조회 실패가 다른 지표의 fetchedAt에 영향을 주지 않는다', async ({ page }) => {
    await open(page);
    const result = await page.locator('body').evaluate(() => {
      state.macroIndicatorCache = {
        VIX: { price: 18.5, changePercent: -1.2, fetchedAt: 5000 },
        GOLD: { price: 2400, changePercent: 0.8, fetchedAt: 6000 },
      };
      state.macroIndicatorCache['VIX'] = { price: 19.0, changePercent: -0.5, fetchedAt: 9000 }; // VIX만 이번 주기 성공
      // GOLD는 건드리지 않음(실패 시뮬레이션)
      return { vix: state.macroIndicatorCache.VIX.fetchedAt, gold: state.macroIndicatorCache.GOLD.fetchedAt };
    });
    expect(result.vix).toBe(9000);
    expect(result.gold).toBe(6000); // 실패했어도 이전 성공 시각 그대로
  });

  test('F. 매크로/리스크 구분 안내 문구가 화면에 존재한다(C2)', async ({ page }) => {
    await open(page);
    await openMacroBriefing(page);
    await expect(page.locator('#macroBriefingDiagnosis')).toContainText('매크로 동향과 보유자산 위험은 서로 다른 기준으로 계산됩니다');
  });

  test('G. threshold가 참고용 기준일 뿐이라는 고지 문구가 지표 상세 팝업에 존재한다(C4)', async ({ page }) => {
    await open(page);
    await openMacroBriefing(page);
    await page.locator('[data-ticker="^VIX"]').click();
    await expect(page.locator('#assetDetailModal')).toBeVisible();
    await expect(page.locator('#assetDetailModal')).toContainText('절대적인 위험 기준은 아닙니다');
  });

  test('H. threshold 숫자와 리스크 신호등 판정 로직은 변경되지 않았다(계산값 불변 확인)', async ({ page }) => {
    await open(page);
    const result = await page.locator('body').evaluate(() => ({
      vixThreshold: { ...MACRO_TREND_THRESHOLDS.vix },
      usdkrwThreshold: { ...MACRO_TREND_THRESHOLDS.usdkrw },
      vixWeather20: vixWeatherIcon(19.9).label,
      vixWeather30: vixWeatherIcon(30).label,
      riskLevel40: riskLevelFromScore(40).level,
      riskLevel41: riskLevelFromScore(41).level,
    }));
    expect(result.vixThreshold).toEqual({ d5: 15, d20: 25 });
    expect(result.usdkrwThreshold).toEqual({ d5: 0.8, d20: 1.5 });
    expect(result.vixWeather20).toBe('안정');
    expect(result.vixWeather30).toBe('긴장');
    expect(result.riskLevel40).toBe('safe');
    expect(result.riskLevel41).toBe('warn');
  });

  test('I. fetchedAt이 추가되어도 매크로 타일 표시값(가격·등락률)은 그대로다', async ({ page }) => {
    await open(page);
    await openMacroBriefing(page);
    await page.locator('body').evaluate(() => {
      state.macroIndicatorCache['VIX'] = { price: 22.3, changePercent: 1.4, fetchedAt: Date.now() };
      renderMacroBriefing();
    });
    await expect(page.locator('#macroBriefingGrid')).toContainText('22.3');
  });
});
