// E2E-37 Phase 30 - 신규 거래 대표매칭키 자동 제안 UX 상시 회귀.
//
// [핵심 계약]
//  1) 추천은 새 판단이 아니다 - 원래도 계산 시점에 돌던 자동판별(resolveAssetGroupKeyDetail, js/05)의
//     결과를 입력 시점에 보여줄 뿐이다. 그래서 "추천값"과 "저장 후 실제로 쓰이는 값"이 어긋날 수 없다.
//  2) 근거가 있는 단계(customKey/customKeyword/presetTicker/tickerAlias/nameKeyword)만 추천한다.
//     지역 폴백(regionFallback)과 자산군 캐치올(category)은 추천하지 않는다 - "추천 없음"은 실패가
//     아니라 안전한 정상 상태다(비워두면 지금까지처럼 계산 시점에 시스템이 정한다).
//  3) 사용자가 [이대로 사용]을 누르거나 직접 고른 값만 명시적 override로 저장된다. 자동 확정은 없다.
//  4) 이미 지정된 override는 신규 거래가 들어와도 절대 바뀌거나 지워지지 않는다.
//
// [외부 API 비의존] 모든 시드는 티커 없는 자산이거나 계산 검증 시 채권(무위험, σ=0)을 쓴다 -
// 이 환경은 외부 시세 조회가 막혀 있어(Phase 23-R) 주식/ETF의 가격 이력에 의존하면 안 된다.
const { test, expect } = require('@playwright/test');

const TOUCH_MIN = 43.9; // devicePixelRatio 반올림 흡수
const FONT_MIN = 14;

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    persistAssets();
    persistTransactions();
  });
}

const recommend = (page, input) => page.evaluate((input) => recommendRateMatchKey(input), input);

// 거래 입력 폼을 "종목 선택까지 끝난 상태"로 채운다(applyStockPickToTransactionForm이 하는 일과 동일).
async function openTxFormWith(page, { owner = '신랑', accountType = '일반계좌', name, ticker = '', currency = 'KRW' }) {
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_owner').selectOption(owner);
  await page.locator('#tx_accountType').fill(accountType);
  if (!ticker) await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#transactionForm').evaluate((form, { name, ticker, currency }) => {
    const d = form.ownerDocument;
    d.getElementById('tx_name').value = name;
    d.getElementById('tx_ticker').value = ticker;
    d.getElementById('tx_currency').value = currency;
    // 실제 앱에서 종목이 정해지는 순간(applyStockPickToTransactionForm 등)과 동일한 호출이다.
    d.defaultView.refreshTxRateMatchRecommendation({ allowPrefill: true });
  }, { name, ticker, currency });
  await page.locator('#tx_quantity').fill('10');
  await page.locator('#tx_price').fill('10000');
}

/* ---------------------------------------------------------------- 추천 판단 규칙 */

test('1. 이름 키워드로 명확히 매칭되면 추천한다(RISE 미국나스닥100 → NASDAQ)', async ({ page }) => {
  await seed(page);
  const rec = await recommend(page, { name: 'RISE 미국나스닥100', ticker: '', currency: 'KRW' });
  expect(rec).not.toBeNull();
  expect(rec.key).toBe('NASDAQ');
  expect(rec.source).toBe('nameKeyword');
});

test('2. 시스템 기본 상품표 티커면 추천한다(MSFT)', async ({ page }) => {
  await seed(page);
  const rec = await recommend(page, { name: 'Microsoft', ticker: 'MSFT', currency: 'USD' });
  expect(rec.key).toBe('MSFT');
  expect(rec.source).toBe('presetTicker');
});

test('3. 티커 별칭도 추천한다(QQQM → NASDAQ)', async ({ page }) => {
  await seed(page);
  const rec = await recommend(page, { name: 'Invesco NASDAQ 100 ETF', ticker: 'QQQM', currency: 'USD' });
  expect(rec.key).toBe('NASDAQ');
  expect(rec.source).toBe('tickerAlias');
});

test('4. 사용자가 등록한 키워드에 걸리면 그 키를 추천한다(customKeyword)', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates['E2E37_MYKEY'] = {
      label: '내 전용 기준', conservative: 1, normal: 2, optimistic: 3, keywords: ['E2E37특수종목']
    };
    persistProjection();
  });
  const rec = await recommend(page, { name: 'E2E37특수종목 성장형', ticker: '', currency: 'KRW' });
  expect(rec.key).toBe('E2E37_MYKEY');
  expect(rec.source).toBe('customKeyword');
  expect(rec.label).toBe('내 전용 기준');
});

test('5. 근거가 없으면(지역 폴백) 추천하지 않는다 - 안전한 정상 상태', async ({ page }) => {
  await seed(page);
  const rec = await recommend(page, { name: 'E2E37 이름만있는 알수없는종목', ticker: '', currency: 'KRW' });
  expect(rec).toBeNull();
});

test('6. 자산군 캐치올(채권/현금)은 추천하지 않는다 - 비워둬도 자동판별이 같은 값을 쓴다', async ({ page }) => {
  await seed(page);
  const bond = await recommend(page, { name: 'E2E37 정기예금', ticker: '', currency: 'KRW' });
  const cash = await recommend(page, { name: 'E2E37 달러 예수금', ticker: '', currency: 'USD' });
  expect(bond).toBeNull();
  expect(cash).toBeNull();
});

test('7. 입력이 비어 있으면 추천하지 않는다', async ({ page }) => {
  await seed(page);
  expect(await recommend(page, { name: '', ticker: '', currency: 'KRW' })).toBeNull();
});

test('8. 추천은 자동판별 결과와 항상 일치한다(별도 판단 로직을 만들지 않았다는 계약)', async ({ page }) => {
  await seed(page);
  const same = await page.evaluate(() => {
    const cases = [
      { name: 'RISE 미국나스닥100', ticker: '', currency: 'KRW' },
      { name: 'Microsoft', ticker: 'MSFT', currency: 'USD' },
      { name: 'Invesco NASDAQ 100 ETF', ticker: 'QQQM', currency: 'USD' }
    ];
    return cases.map((c) => {
      const rec = recommendRateMatchKey(c);
      const auto = getProjectionAssetGroupKey(makeAsset({ ticker: c.ticker, name: c.name, currency: c.currency }));
      return { rec: rec && rec.key, auto };
    });
  });
  same.forEach((r) => expect(r.rec).toBe(r.auto));
});

/* ---------------------------------------------------------------- 신규 자산 UX */

test('9. 신규 거래 - 추천이 화면에 보이고 [이대로 사용]을 누르면 선택칸에 반영된다', async ({ page }) => {
  await seed(page);
  await openTxFormWith(page, { name: 'RISE 미국나스닥100' });
  await expect(page.locator('#txRateMatchHelp')).toBeVisible();
  await expect(page.locator('#txRateMatchHelpText')).toContainText('앱 추천');
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('');
  await page.locator('#txRateMatchApplyBtn').click();
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('NASDAQ');
  await expect(page.locator('#txRateMatchApplyBtn')).toBeHidden(); // 이미 적용됐으니 버튼은 사라진다
});

test('10. [이대로 사용] 후 저장하면 그 값이 자산의 override로 저장된다', async ({ page }) => {
  await seed(page);
  await openTxFormWith(page, { name: 'RISE 미국나스닥100' });
  await page.locator('#txRateMatchApplyBtn').click();
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'RISE 미국나스닥100');
    return a ? a.rateMatchOverride : null;
  });
  expect(saved).toBe('NASDAQ');
});

test('11. 추천을 무시하고 저장하면 override가 생기지 않는다(자동 확정 없음)', async ({ page }) => {
  await seed(page);
  await openTxFormWith(page, { name: 'RISE 미국나스닥100' });
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'RISE 미국나스닥100');
    return a ? (a.rateMatchOverride === undefined) : null;
  });
  expect(saved).toBe(true);
});

test('12. 사용자가 추천과 다른 값을 고르면 그 값이 저장된다', async ({ page }) => {
  await seed(page);
  await openTxFormWith(page, { name: 'RISE 미국나스닥100' });
  await page.locator('#tx_rateMatchOverride').evaluate((sel) => {
    const win = sel.ownerDocument.defaultView;
    win.ensureRateMatchOption('S&P500');
    sel.value = 'S&P500';
    win.refreshTxRateMatchRecommendation();
  });
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'RISE 미국나스닥100');
    return a ? a.rateMatchOverride : null;
  });
  expect(saved).toBe('S&P500');
});

test('13. 취소하면 state가 전혀 바뀌지 않는다', async ({ page }) => {
  await seed(page);
  const before = await page.evaluate(() => JSON.stringify({ a: state.assets, t: state.transactions }));
  await openTxFormWith(page, { name: 'RISE 미국나스닥100' });
  await page.locator('#txRateMatchApplyBtn').click();
  await page.locator('#cancelTxModalBtn').click();
  const after = await page.evaluate(() => JSON.stringify({ a: state.assets, t: state.transactions }));
  expect(after).toBe(before);
});

test('14. 추천 불가면 안내만 보이고 [이대로 사용] 버튼은 없다', async ({ page }) => {
  await seed(page);
  await openTxFormWith(page, { name: 'E2E37 이름만있는 알수없는종목' });
  await expect(page.locator('#txRateMatchHelp')).toBeVisible();
  await expect(page.locator('#txRateMatchHelpText')).toContainText('찾지 못했어요');
  await expect(page.locator('#txRateMatchApplyBtn')).toBeHidden();
});

/* ---------------------------------------------------------------- 기존 자산 보호 */

test('15. 기존 override가 있으면 추천하지 않고 "유지" 안내를 보여준다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E37기존자산', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currency: 'KRW', rateMatchOverride: 'KOSPI' })];
    persistAssets();
  });
  await openTxFormWith(page, { name: 'E2E37기존자산' });
  await expect(page.locator('#txRateMatchHelpText')).toContainText('그대로 유지됩니다');
  await expect(page.locator('#txRateMatchApplyBtn')).toBeHidden();
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('KOSPI'); // 화면에도 채워 보여준다
});

test('16. 신규 거래를 저장해도 기존 자산의 override/역할이 지워지지 않는다(Phase 30 데이터 보호)', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E37기존자산', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currency: 'KRW', rateMatchOverride: 'KOSPI', role: 'attacker' })];
    persistAssets();
  });
  await openTxFormWith(page, { name: 'E2E37기존자산' });
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E37기존자산');
    return a ? { override: a.rateMatchOverride, role: a.role } : null;
  });
  expect(after.override).toBe('KOSPI');
  expect(after.role).toBe('attacker');
});

test('17. 수정 모드에서는 기존처럼 비워서 override를 해제할 수 있다(의도된 삭제 경로 유지)', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.transactions = [{ id: 'e2e37-tx', date: '2026-01-01', owner: '신랑', accountType: '일반계좌',
      ticker: '', name: 'E2E37해제대상', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0 }];
    persistTransactions();
    state.assets = [makeAsset({ name: 'E2E37해제대상', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currency: 'KRW', rateMatchOverride: 'KOSPI' })];
    persistAssets();
  });
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.getByText('거래내역', { exact: true }).click();
  await page.evaluate(() => openTransactionModal('e2e37-tx'));
  await expect(page.locator('#tx_rateMatchOverride')).toHaveValue('KOSPI');
  await page.locator('#tx_rateMatchOverride').selectOption('');
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E37해제대상');
    return a ? (a.rateMatchOverride === undefined) : null;
  });
  expect(after).toBe(true);
});

/* ---------------------------------------------------------------- 계산 경로 연결 */

test('18. 저장된 값이 기존 resolver/결정론/MC 경로에 그대로 연결된다(외부 시세 비의존)', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates['E2E37_RATE'] = { label: 'E2E37 기준', conservative: 1, normal: 2, optimistic: 3 };
    persistProjection();
  });
  // 채권 자산에 사용자가 고른 override를 붙여 저장한다(무위험이라 MC가 가격 이력을 요구하지 않는다).
  await openTxFormWith(page, { name: 'E2E37채권자산' });
  await page.locator('#tx_rateMatchOverride').evaluate((sel) => {
    sel.ownerDocument.defaultView.ensureRateMatchOption('E2E37_RATE');
    sel.value = 'E2E37_RATE';
  });
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const result = await page.evaluate(async () => {
    const asset = state.assets.find((x) => x.name === 'E2E37채권자산');
    state.rebalance = state.rebalance || {};
    state.rebalance['신랑'] = { updatedAt: Date.now(), domestic: { '국내': 100, '해외': 0 },
      targets: { '국내': [{ type: 'namedHolding', name: 'E2E37채권자산', label: 'E2E37채권자산', pct: 100, role: '수비수' }], '해외': [] } };
    persistRebalance();
    const target = { type: 'namedHolding', name: 'E2E37채권자산', label: 'E2E37채권자산', owner: '신랑' };
    const out = await buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑' });
    const inst = (out.instruments || []).find((i) => i.key && i.key.includes('E2E37채권자산'));
    return {
      override: asset.rateMatchOverride,
      pathA: resolveProjectionRateForKey(getProjectionAssetGroupKey(asset), 'normal', false), // 경로 A
      pathB: getTargetProjectionRate(target, 'normal', '국내'),                                // 경로 B
      errors: out.errors,
      muAnnual: inst ? inst.muAnnual : null
    };
  });
  expect(result.override).toBe('E2E37_RATE');
  expect(result.pathA).toBeCloseTo(2, 6);
  expect(result.pathB).toBeCloseTo(2, 6); // Phase 28-F A/B 동일성 유지
  expect(result.errors).toEqual([]);
  expect(result.muAnnual).toBeCloseTo(0.02, 6);
});

/* ---------------------------------------------------------------- 모바일/다크 */

for (const w of [375, 390, 412, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 추천 UI가 14px/44px/무오버플로 기준을 지킨다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await seed(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await openTxFormWith(page, { name: 'RISE 미국나스닥100' });

      // 1) 추천 안내 문구 14px 이상
      const fontSize = await page.locator('#txRateMatchHelpText').evaluate((el) =>
        parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize));
      expect(fontSize, '추천 안내 문구 크기').toBeGreaterThanOrEqual(FONT_MIN);

      // 2) [이대로 사용] 버튼 44px 터치 타겟
      const btn = await page.locator('#txRateMatchApplyBtn').boundingBox();
      expect(btn.height, '[이대로 사용] 높이').toBeGreaterThanOrEqual(TOUCH_MIN);

      // 3) 대표매칭 선택칸도 계속 조작 가능한 크기여야 한다
      const sel = await page.locator('#tx_rateMatchOverride').boundingBox();
      expect(sel.height, '대표매칭 선택칸 높이').toBeGreaterThan(0);

      // 4) 가로 overflow 0 - 안내 블록이 모달 밖으로 나가지 않는다
      const overflow = await page.locator('#txRateMatchHelp').evaluate((el) => {
        const modal = el.closest('.modal-anim') || el.parentElement;
        return el.getBoundingClientRect().right - modal.getBoundingClientRect().right;
      });
      expect(overflow, '추천 블록 가로 넘침').toBeLessThanOrEqual(1);

      // 5) 색상만으로 상태를 전달하지 않는다 - 텍스트가 실제로 존재해야 한다
      await expect(page.locator('#txRateMatchHelpText')).not.toBeEmpty();
    });
  }
}
