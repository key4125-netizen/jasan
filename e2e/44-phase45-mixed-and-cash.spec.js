// E2E-44 Phase 45 - 혼합형 상품 성격 오판정 차단(P0-1) + CASH 시스템 기본값 폴백 차단(P0-2).
//
// [핵심 계약]
//  1) 이름이 스스로 "여러 자산군이 섞여 있다"고 밝히는 상품(채권혼합/주식혼합/혼합형)은 어떤 단일
//     자산군으로도 자동 판정하지 않는다. '채권'이라는 단어가 이름에 있다는 것만으로 BOND가 되면 안 된다.
//  2) 그렇다고 순수 채권 상품까지 UNRESOLVED가 되면 안 된다 - 이 변경은 혼합형에만 적용된다.
//  3) 현금(CASH/CASH.USD)의 시스템 기본 가정을 물으면 앱이 계산에 쓰는 정의(0%)가 나와야 한다.
//     지역 폴백으로 미국 주식 지수 값이 나오면 표시값과 계산값이 어긋난다.
//  4) 이 Phase는 수익률 숫자·사용자 데이터·계산 공식을 전혀 바꾸지 않는다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof resolveAssetCharacter === 'function'
    && typeof getSystemDefaultRate === 'function' && typeof resolveProjectionRateForKey === 'function');
}

const charOf = (page, ticker, name, currency) => page.evaluate(([t, n, c]) =>
  resolveAssetCharacter(makeAsset({ ticker: t, name: n, currency: c })).character, [ticker, name, currency]);

const detailOf = (page, ticker, name, currency) => page.evaluate(([t, n, c]) => {
  const r = resolveAssetCharacter(makeAsset({ ticker: t, name: n, currency: c }));
  return { character: r.character, source: r.source, confidence: r.confidence };
}, [ticker, name, currency]);

const PRESETS = ['conservative', 'normal', 'optimistic'];

/* ─────────── 1. 혼합형 상품은 단일 자산군으로 판정하지 않는다 (P0-1) ─────────── */

test('A. 국내 채권혼합 ETF는 채권이 아니라 UNRESOLVED로 남는다', async ({ page }) => {
  await boot(page);
  // 이름에 '채권'이 들어 있다는 이유만으로 BOND로 판정되던 실제 보유 자산.
  const r = await detailOf(page, '272560', 'KODEX 코리아배당성장채권혼합', 'KRW');
  expect(r.character).toBe('UNRESOLVED');
  expect(r.source).toBe('mixedAssetName');
});

test('B. 해외지수 채권혼합 ETF도 UNRESOLVED로 남는다', async ({ page }) => {
  await boot(page);
  // '미국'이 들어 있다고 미국 주식으로도, '채권'이 들어 있다고 채권으로도 판정하지 않는다.
  const r = await detailOf(page, '456600', 'TIGER 미국테크TOP10채권혼합', 'KRW');
  expect(r.character).toBe('UNRESOLVED');
  expect(r.source).toBe('mixedAssetName');
});

test('C. 혼합 표기 변형(혼합형/주식혼합/주식+채권)도 모두 UNRESOLVED다', async ({ page }) => {
  await boot(page);
  const names = ['KODEX 주식혼합', 'ACE 채권혼합형', '주식+채권 인덱스', '국내주식 + 채권 배분형'];
  for (const n of names) {
    expect(await charOf(page, '', n, 'KRW'), n).toBe('UNRESOLVED');
  }
});

test('D. 티커 없는 혼합형 펀드도 카테고리 경로로 채권이 되지 않는다', async ({ page }) => {
  await boot(page);
  // 티커가 없으면 classifyCategory(js/01)가 BOND_KEYWORDS로 category를 '채권'으로 자동 확정한다 -
  // 성격 판정이 카테고리보다 먼저 혼합형을 걸러내지 않으면 여기서 BOND가 된다.
  const probe = await page.evaluate(() => {
    const a = makeAsset({ ticker: '', name: '채권혼합형 사모펀드', currency: 'KRW' });
    return { category: a.category, character: resolveAssetCharacter(a).character };
  });
  expect(probe.category).toBe('채권'); // 카테고리 자체는 건드리지 않는다(Risk 대상 자산이 달라지지 않도록)
  expect(probe.character).toBe('UNRESOLVED');
});

test('E. 순수 채권 상품은 그대로 채권으로 판정된다(과잉 차단 없음)', async ({ page }) => {
  await boot(page);
  const cases = [
    ['114260', 'KODEX 국고채3년', 'KRW'],
    ['', '국고채 10년', 'KRW'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD'],
    ['', '회사채 사모', 'KRW']
  ];
  for (const [t, n, c] of cases) {
    expect(await charOf(page, t, n, c), n).toBe('BOND');
  }
});

test('F. 혼합형과 무관한 기존 판정은 하나도 바뀌지 않는다', async ({ page }) => {
  await boot(page);
  const cases = [
    ['360750', 'TIGER 미국S&P500', 'KRW', 'US_EQUITY'],
    ['0052D0', 'TIGER 코리아배당다우존스', 'KRW', 'KR_EQUITY'], // Phase 43 회귀 방지
    ['005930', '삼성전자', 'KRW', 'KR_EQUITY'],
    ['069500', 'KODEX 200', 'KRW', 'KR_EQUITY'],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'USD', 'DEV_EX_US_EQUITY'],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD', 'EM_EQUITY'],
    ['', '달러 예수금', 'USD', 'CASH']
  ];
  for (const [t, n, c, expected] of cases) {
    expect(await charOf(page, t, n, c), n).toBe(expected);
  }
});

test('G. 성격이 UNRESOLVED여도 자동으로 수익률 가정을 붙이지 않는다', async ({ page }) => {
  await boot(page);
  const rec = await page.evaluate(() =>
    recommendReturnAssumptionKey({ ticker: '272560', name: 'KODEX 코리아배당성장채권혼합', currency: 'KRW' }));
  expect(rec.character).toBe('UNRESOLVED');
  expect(rec.recommendedReturnKey).toBeNull();
  expect(rec.recommendationStrength).toBe('NONE');
  // 사용자 자산을 "잘못됐다"고 단정하는 표현을 쓰지 않는다.
  expect(rec.reason).not.toMatch(/잘못|위험|틀렸|낮추/);
});

test('H. 이미 기준을 지정한 자산의 계산값은 성격 변경과 무관하게 그대로다', async ({ page }) => {
  await boot(page);
  // 성격 판정은 "어떤 기준을 추천할까"에만 쓰인다 - 사용자가 이미 지정한 rateMatchOverride가
  // 언제나 우선하므로 기존 보유 자산의 수익률은 이번 변경으로 달라지지 않는다.
  const got = await page.evaluate(() => {
    const a = makeAsset({ ticker: '272560', name: 'KODEX 코리아배당성장채권혼합', currency: 'KRW' });
    a.rateMatchOverride = 'BOND';
    const key = getProjectionAssetGroupKey(a);
    return { key, rate: resolveProjectionRateForKey(key, 'normal', false), bond: getReferenceRate('normal', 'BOND') };
  });
  expect(got.key).toBe('BOND');
  expect(got.rate).toBe(got.bond);
});

/* ─────────── 2. CASH 시스템 기본값 폴백 차단 (P0-2) ─────────── */

test('I. CASH/CASH.USD의 시스템 기본값은 0%다 - 미국 주식 지수로 새지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => {
    const out = {};
    for (const p of presets) {
      out[p] = { cash: getSystemDefaultRate(p, 'CASH'), usd: getSystemDefaultRate(p, 'CASH.USD') };
    }
    return out;
  }, PRESETS);
  for (const p of PRESETS) {
    expect(got[p].cash, `${p}/CASH`).toBe(0);
    expect(got[p].usd, `${p}/CASH.USD`).toBe(0);
  }
});

test('J. 표시용 참고값(getReferenceRate)과 계산값(resolveProjectionRateForKey)이 일치한다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => presets.map((p) => ({
    preset: p,
    ref: getReferenceRate(p, 'CASH'),
    calc: resolveProjectionRateForKey('CASH', p, false),
    refUsd: getReferenceRate(p, 'CASH.USD'),
    calcUsd: resolveProjectionRateForKey('CASH.USD', p, true)
  })), PRESETS);
  for (const row of got) {
    expect(row.ref, `${row.preset} CASH`).toBe(row.calc);
    expect(row.refUsd, `${row.preset} CASH.USD`).toBe(row.calcUsd);
    expect(row.ref).toBe(0);
  }
});

test('K. 사용자가 CASH에 값을 등록하면 그 값이 그대로 우선한다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = Object.assign({}, before, { CASH: { label: '현금', normal: 3.0 } });
    const r = {
      ref: getReferenceRate('normal', 'CASH'),
      calc: resolveProjectionRateForKey('CASH', 'normal', false),
      otherPreset: getReferenceRate('conservative', 'CASH')
    };
    state.projection.customScenarioRates = before; // 원상복구 - 테스트가 상태를 남기지 않는다
    return r;
  });
  expect(got.ref).toBe(3.0);
  expect(got.calc).toBe(3.0);
  // 등록하지 않은 프리셋은 여전히 시스템 정의(0%)를 따른다(필드 단위 override 의미 유지).
  expect(got.otherPreset).toBe(0);
});

test('L. 다른 키의 시스템 기본값은 하나도 바뀌지 않았다', async ({ page }) => {
  await boot(page);
  // Phase 45에서 수익률 숫자 변경 0건이었음을 고정하던 테스트다(삼성전자만 Phase 47-A에서 PM 승인으로 변경).
  const expected = {
    // [Phase 47-A §4] '005930.KS'는 PM 승인으로 KOSPI 앵커를 상속한다(전용 8/9/15 폐지).
    // 나머지 값은 Phase 45 당시와 완전히 동일하다.
    'KOSPI': [5.0, 7.0, 11.0], 'KOSDAQ': [5.0, 7.0, 11.0], '005930.KS': [5.0, 7.0, 11.0],
    'BOND': [3.5, 4.0, 5.5], '부동산': [3.0, 5.5, 8.0],
    'S&P500': [4.1, 5.1, 6.0], 'NASDAQ': [4.1, 5.1, 6.0], 'SCHD': [4.1, 5.1, 6.0],
    'MSFT': [4.1, 5.1, 6.0], 'NVDA': [4.1, 5.1, 6.0]
  };
  const got = await page.evaluate(([keys, presets]) => {
    const out = {};
    for (const k of keys) out[k] = presets.map((p) => getSystemDefaultRate(p, k));
    return out;
  }, [Object.keys(expected), PRESETS]);
  expect(got).toEqual(expected);
});
