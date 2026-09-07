// E2E-43 Phase 43 - "사용자 가정과 시스템 참고 가정의 구분" + Asset Character 오판정 회귀.
//
// [핵심 계약]
//  1) 사용자가 직접 넣은 수익률이 계산에 쓰인다는 사실을 화면이 밝힌다. 그 값을 "틀렸다"고
//     판단하거나 "낮추라"고 권하지 않는다 - 어떤 값이 적용되는지만 투명하게 보여준다.
//  2) 시스템 참고 가정이 실제로 존재하는 기준에만 참고값을 보여준다. 사용자가 직접 만든 키에
//     지역 대표지수 값을 끌어와 "시스템 참고값"인 척하지 않는다.
//  3) 상품명에 미국 지수 브랜드(다우존스 등)가 있다는 이유만으로 미국 주식으로 판정하지 않는다.
//  4) 이 Phase는 수익률 숫자와 사용자 데이터를 전혀 바꾸지 않는다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof getUserOverriddenPresets === 'function'
    && typeof getSystemReferenceRates === 'function' && typeof resolveAssetCharacter === 'function');
}

const charOf = (page, ticker, name, currency) => page.evaluate(([t, n, c]) =>
  resolveAssetCharacter(makeAsset({ ticker: t, name: n, currency: c })).character, [ticker, name, currency]);

/* ─────────── 1. Asset Character 오판정 수정 (P0-2) ─────────── */

test('A. TIGER 코리아배당다우존스가 국내 주식으로 판정된다', async ({ page }) => {
  await boot(page);
  // 이름의 "배당다우존스"가 SCHD 키워드에 걸려 미국 주식으로 판정되던 버그.
  expect(await charOf(page, '0052D0', 'TIGER 코리아배당다우존스', 'KRW')).toBe('KR_EQUITY');
});

test('B~E. 기존에 맞던 판정은 그대로 유지된다', async ({ page }) => {
  await boot(page);
  const cases = [
    ['SCHD', 'Schwab US Dividend Equity ETF', 'USD', 'US_EQUITY'],
    ['360750', 'TIGER 미국S&P500', 'KRW', 'US_EQUITY'],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'USD', 'DEV_EX_US_EQUITY'],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD', 'EM_EQUITY']
  ];
  for (const [t, n, c, expected] of cases) {
    expect(await charOf(page, t, n, c), `${n}`).toBe(expected);
  }
});

test('F. 국내 대표지수 ETF는 국내 주식으로 판정된다', async ({ page }) => {
  await boot(page);
  expect(await charOf(page, '069500', 'KODEX 200', 'KRW')).toBe('KR_EQUITY');
  expect(await charOf(page, '102110', 'TIGER 200', 'KRW')).toBe('KR_EQUITY');
});

test('G. 국내/미국 표기가 판정을 가르고, 미국 표기가 함께 있으면 미국이 우선한다', async ({ page }) => {
  await boot(page);
  // 같은 "배당다우존스"라도 앞에 붙은 시장 표기로 갈린다.
  expect(await charOf(page, '', 'TIGER 코리아배당다우존스', 'KRW')).toBe('KR_EQUITY');
  expect(await charOf(page, '', 'TIGER미국배당다우존스', 'KRW')).toBe('US_EQUITY');
  expect(await charOf(page, '', 'ACE 미국S&P500', 'KRW')).toBe('US_EQUITY');
  expect(await charOf(page, '', 'RISE 미국나스닥100', 'KRW')).toBe('US_EQUITY');
});

test('H. 단순 문자열 키워드가 상품 성격을 덮어쓰지 않는다', async ({ page }) => {
  await boot(page);
  // "다우존스"가 들어 있어도 국내 상품이면 미국 주식이 아니다.
  const r = await page.evaluate(() => {
    // Golden에 실제로 들어 있는 티커 표기(.KS)와, 접미사가 없어 지역을 알 수 없는 표기 둘 다 확인한다.
    const withSuffix = resolveAssetCharacter(makeAsset({ ticker: '0052D0.KS', name: 'TIGER 코리아배당다우존스', currency: 'KRW' }));
    const noSuffix = resolveAssetCharacter(makeAsset({ ticker: '0052D0', name: 'TIGER 코리아배당다우존스', currency: 'KRW' }));
    return { character: withSuffix.character, region: withSuffix.region, noSuffixCharacter: noSuffix.character };
  });
  expect(r.character).toBe('KR_EQUITY');
  expect(r.region).toBe('국내');
  // 지역을 알 수 없어도 상품명이 국내 지수를 명시하면 판정이 흔들리지 않아야 한다.
  expect(r.noSuffixCharacter).toBe('KR_EQUITY');
});

/* ─────────── 2. 사용자 설정값 vs 시스템 참고값 (P0-1) ─────────── */

async function seedOverride(page) {
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: 'SPYM', name: 'SPDR Portfolio S&P 500 ETF', currency: 'USD', owner: '신랑',
        accountType: '일반계좌', category: 'ETF', isDomestic: '해외', quantity: 10, buyPrice: 100, currentPrice: 100 }),
      makeAsset({ ticker: '005930', name: '삼성전자', currency: 'KRW', owner: '신랑',
        accountType: '일반계좌', quantity: 10, buyPrice: 70000, currentPrice: 70000 })
    ];
    state.projection.customScenarioRates = Object.assign({}, state.projection.customScenarioRates,
      { 'S&P500': { label: 'S&P500 (SPYM)', conservative: 6, normal: 9, optimistic: 11 } });
    persistAssets(); persistProjection();
    openScenarioRateManagerModal();
  });
}

test('1. 사용자 설정 여부와 시스템 참고값을 구분해 돌려준다', async ({ page }) => {
  await boot(page);
  await seedOverride(page);
  const r = await page.evaluate(() => ({
    overridden: getReturnAssumptionSourceInfo('S&P500'),
    untouched: getReturnAssumptionSourceInfo('005930.KS'),
    presets: getUserOverriddenPresets('S&P500'),
    nonePresets: getUserOverriddenPresets('005930.KS'),
    appliedOverride: ['conservative', 'normal', 'optimistic'].map((p) => getReferenceRate(p, 'S&P500')),
    systemRef: getSystemReferenceRates('S&P500')
  }));
  expect(r.overridden.label).toBe('사용자 설정값 적용');
  expect(r.overridden.systemReferenceText).toBe('4.1 / 5.1 / 6%');
  expect(r.presets).toEqual(['conservative', 'normal', 'optimistic']);
  // 실제 계산에 쓰이는 값은 사용자 값이다.
  expect(r.appliedOverride).toEqual([6, 9, 11]);
  // 시스템 참고값은 그대로 남아 있어야 한다(덮어써지지 않았다).
  expect(r.systemRef).toEqual({ conservative: 4.1, normal: 5.1, optimistic: 6.0 });
  // 오버라이드가 없는 기준은 기존 표현을 유지한다.
  expect(r.untouched.label).toBe('추가 확인 필요');
  expect(r.nonePresets).toEqual([]);
});

test('2. 화면에 사용자 설정값과 시스템 참고 가정이 함께 보인다', async ({ page }) => {
  await boot(page);
  await seedOverride(page);
  const txt = await page.locator('#scenarioRateManagerList').innerText();
  expect(txt).toContain('사용자 설정값 적용');
  expect(txt).toContain('시스템 참고 가정: 4.1 / 5.1 / 6%');
  // 사용자 값을 평가/훈수하는 문구가 없어야 한다.
  ['위험한', '잘못된', '비현실', '낮추', '추천하지', '과도'].forEach((w) => {
    expect(txt, `평가성 문구 발견: ${w}`).not.toContain(w);
  });
});

test('3. 시스템 참고 가정이 없는 사용자 정의 키에는 참고값을 지어내지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.projection.customScenarioRates = Object.assign({}, state.projection.customScenarioRates,
      { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 } });
    persistProjection();
    const info = getReturnAssumptionSourceInfo('BOND.STOCK');
    return { label: info.label, refText: info.systemReferenceText, ref: getSystemReferenceRates('BOND.STOCK'),
      detail: info.detail };
  });
  expect(r.label).toBe('사용자 설정값 적용');
  // 지역 대표지수 값을 끌어와 "시스템 참고값"인 척하면 안 된다.
  expect(r.ref).toBeNull();
  expect(r.refText).toBeNull();
  expect(r.detail).toContain('참고 가정이 없습니다');
});

test('4. 일부 시나리오만 입력한 경우 그 프리셋만 사용자 설정으로 센다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.projection.customScenarioRates = Object.assign({}, state.projection.customScenarioRates,
      { 'NASDAQ': { label: 'NASDAQ 100 (QQQM)', normal: 9 } });
    persistProjection();
    return { presets: getUserOverriddenPresets('NASDAQ'),
      applied: ['conservative', 'normal', 'optimistic'].map((p) => getReferenceRate(p, 'NASDAQ')) };
  });
  expect(r.presets).toEqual(['normal']);
  // 비워 둔 보수/긍정은 시스템 기본값을 그대로 따른다(Phase 29-B 정책 유지).
  expect(r.applied).toEqual([4.1, 9, 6.0]);
});

/* ─────────── 3. 숫자·데이터 불변 ─────────── */

test('5. 이 Phase는 수익률 숫자를 바꾸지 않았다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const P = ['conservative', 'normal', 'optimistic'];
    const v = (k) => P.map((p) => getSystemDefaultRate(p, k));
    return { 'S&P500': v('S&P500'), NASDAQ: v('NASDAQ'), SCHD: v('SCHD'),
      KOSPI: v('KOSPI'), KOSDAQ: v('KOSDAQ'), samsung: v('005930.KS'),
      BOND: v('BOND'), realEstate: v('부동산'), dev: v('DEV_EX_US'), em: v('EMERGING') };
  });
  expect(r).toEqual({
    'S&P500': [4.1, 5.1, 6.0], NASDAQ: [4.1, 5.1, 6.0], SCHD: [4.1, 5.1, 6.0],
  // [Phase 47-A - PM 승인 정책 변경으로 기대값 갱신] 테스트가 낡아서 고친 것이 아니라,
  // PM이 명시적으로 승인한 정책 변경(삼성전자 Individual Alpha 폐지 / 지역 폴백 제거)의 결과다.
    KOSPI: [5.0, 7.0, 11.0], KOSDAQ: [5.0, 7.0, 11.0], samsung: [5.0, 7.0, 11.0],
    BOND: [3.5, 4.0, 5.5], realEstate: [3.0, 5.5, 8.0],
    dev: [4.4, 5.4, 6.3], em: [2.0, 3.0, 3.9]
  });
});

test('6. Character 수정이 실제 적용 Return Key를 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [
    ['0052D0', 'TIGER 코리아배당다우존스', 'KRW'],
    ['360750', 'TIGER 미국S&P500', 'KRW'],
    ['069500', 'KODEX 200', 'KRW'],
    ['SCHD', 'Schwab US Dividend', 'USD']
  ].map(([t, n, c]) => getProjectionAssetGroupKey(makeAsset({ ticker: t, name: n, currency: c }))));
  // 성격 판정만 고쳤고 계산 경로의 키 판정은 그대로다 - 사용자 수익률이 바뀌지 않는다.
  expect(r).toEqual(['SCHD', 'S&P500', 'KOSPI', 'SCHD']);
});

/* ─────────── 4. 모바일 가독성 ─────────── */

for (const w of [375, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 사용자/시스템 값 구분이 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await seedOverride(page);
      const info = await page.locator('#scenarioRateManagerList').evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        const nodes = [...el.querySelectorAll('p, span')].filter((n) => n.textContent.trim());
        return { min: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))),
          clipped: el.scrollWidth - el.clientWidth };
      });
      expect(info.min).toBeGreaterThanOrEqual(14);
      expect(info.clipped).toBeLessThanOrEqual(1);
      const body = await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(body).toBeLessThanOrEqual(1);
      // 색만으로 구분하지 않는다 - 문구 자체가 두 값을 설명해야 한다.
      const txt = await page.locator('#scenarioRateManagerList').innerText();
      expect(txt).toContain('사용자 설정값 적용');
      expect(txt).toContain('시스템 참고 가정');
    });
  }
}
