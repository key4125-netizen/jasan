// E2E-46 Phase 47-A - Return Calculation Path Completion.
//
// 이 Phase가 닫은 것: 자산 성격 판정(Phase 40-C)은 정확한데 실제 수익률을 정하는 계산 경로는 그 판정을
// 보지 않고 "국내면 KOSPI, 해외면 S&P500"이라는 지역 폴백을 쓰던 문제. 국고채 ETF가 한국 주식 수익률을,
// 미국 국채 ETF가 미국 주식 수익률을 받고 있었다.
//
// [고정하는 계약]
//  1) 성격이 확인되면 그 성격에 맞는 Return Key를 실제 계산에 쓴다
//  2) 성격을 확인하지 못하면 어떤 가정도 적용하지 않는다(성장 0%) - 지역 대표지수로 대체하지 않는다
//  3) 사용자가 지정한 값(rateMatchOverride / customScenarioRates)은 언제나 최우선이고 변경되지 않는다
//  4) Deterministic 경로와 Monte Carlo adapter 경로가 모든 자산에서 같은 값을 낸다
//  5) 삼성전자는 KOSPI 앵커를 상속한다(전용 Alpha 폐지) - 단, 사용자가 직접 넣은 값은 그대로 쓰인다
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof resolveRateKeyFromAssetCharacter === 'function'
    && typeof resolveAssetGroupKeyDetail === 'function' && typeof getAssetProjectionRate === 'function');
}

const PRESETS = ['conservative', 'normal', 'optimistic'];

// 자산 하나의 "성격 → 적용 키 → 적용 수익률"을 한 번에 본다.
const probe = (page, ticker, name, currency) => page.evaluate(([t, n, c]) => {
  const a = makeAsset({ ticker: t, name: n, currency: c });
  const detail = resolveAssetGroupKeyDetail(a);
  return {
    character: resolveAssetCharacter(a).character,
    key: detail.key,
    source: detail.source,
    rate: getAssetProjectionRate(a, 'normal'),
    status: assessReturnAssumptionStatus(a).status
  };
}, [ticker, name, currency]);

/* ─────────── 1. 성격 → Return Key 계산 연결 (§1) ─────────── */

test('1. 국내 채권형 ETF는 주식 지수가 아니라 채권 기준을 받는다', async ({ page }) => {
  await boot(page);
  // Phase 46에서 측정한 대표 사례 - 예전엔 KOSPI 7%가 붙어 20년 기준 +81.7% 과대였다.
  for (const [t, n] of [['114260.KS', 'KODEX 국고채3년'], ['148070.KS', 'KOSEF 국고채10년']]) {
    const r = await probe(page, t, n, 'KRW');
    expect(r.character, n).toBe('BOND');
    expect(r.key, n).toBe('BOND');
    expect(r.source, n).toBe('assetCharacter');
    expect(r.rate, n).toBe(4); // 시스템 BOND 일반값
    expect(r.status, n).toBe('OK');
  }
});

test('2. 미국 채권형 ETF는 국내 채권 기준을 빌려 쓰지 않는다', async ({ page }) => {
  await boot(page);
  // 통화·시장이 다르다 - 'BOND'는 원화 한국 국고채 기준이고 US_BOND Key는 아직 없다.
  // 그렇다고 S&P500(예전 동작)을 붙이지도 않는다. 둘 다 틀렸으므로 가정을 적용하지 않는 것이 정답이다.
  for (const [t, n] of [['TLT', 'iShares 20+ Year Treasury Bond ETF'], ['IEF', 'iShares 7-10 Year Treasury Bond ETF']]) {
    const r = await probe(page, t, n, 'USD');
    expect(r.character, n).toBe('BOND');
    expect(r.key, n).toBe('UNRESOLVED');
    expect(r.rate, n).toBe(0);
    expect(r.status, n).toBe('UNRESOLVED');
  }
});

test('3. 리츠/부동산 ETF는 지역 대표지수를 받지 않는다', async ({ page }) => {
  await boot(page);
  // 부동산 Key는 "티커 없이 직접 보유하는 실물 부동산"용이라 상장 리츠 ETF에 그대로 쓸 수 없다.
  const cases = [['329200.KS', 'TIGER 리츠부동산인프라', 'KRW'], ['VNQ', 'Vanguard Real Estate ETF', 'USD']];
  for (const [t, n, c] of cases) {
    const r = await probe(page, t, n, c);
    expect(r.key, n).toBe('UNRESOLVED');
    expect(r.rate, n).toBe(0);
  }
  // 반면 실물 부동산은 예전 그대로 부동산 기준을 받는다(과잉 차단 없음).
  const apt = await probe(page, '', '서울 아파트', 'KRW');
  expect(apt.key).toBe('부동산');
  expect(apt.rate).toBe(5.5);
});

test('4. 혼합형 상품과 미등록 ETF는 가정 없이 계산된다', async ({ page }) => {
  await boot(page);
  const cases = [
    ['237370.KS', 'KODEX 코리아배당성장채권혼합', 'KRW'],
    ['472170.KS', 'TIGER 미국테크TOP10채권혼합', 'KRW'],
    ['278530.KS', 'KODEX 200TR', 'KRW'],
    ['999999.KS', 'KODEX 알수없는상품', 'KRW'],
    ['ZZETF', 'Unknown Global ETF', 'USD']
  ];
  for (const [t, n, c] of cases) {
    const r = await probe(page, t, n, c);
    expect(r.key, n).toBe('UNRESOLVED');
    expect(r.rate, n).toBe(0);
    expect(['KOSPI', 'S&P500', 'KOSDAQ'], n).not.toContain(r.key);
  }
});

test('5. 근거가 있는 주식·ETF는 정상적으로 기준을 받는다(과잉 차단 없음)', async ({ page }) => {
  await boot(page);
  const cases = [
    ['069500.KS', 'KODEX 200', 'KRW', 'KOSPI', 7],
    ['360750.KS', 'TIGER 미국S&P500', 'KRW', 'S&P500', 5.1],
    ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', 'NASDAQ', 5.1],
    ['SPYM', 'SPDR Portfolio S&P 500 ETF', 'USD', 'S&P500', 5.1],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'USD', 'DEV_EX_US', 5.4],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD', 'EMERGING', 3],
    ['000660.KS', 'SK하이닉스', 'KRW', 'KOSPI', 7],
    ['NVDA', 'NVIDIA', 'USD', 'NVDA', 5.1]
  ];
  for (const [t, n, c, key, rate] of cases) {
    const r = await probe(page, t, n, c);
    expect(r.key, n).toBe(key);
    expect(r.rate, n).toBe(rate);
  }
});

/* ─────────── 2. Unknown asset 지역 폴백 차단 (§2) ─────────── */

test('6. 정체를 확인할 수 없는 자산에는 Return Key를 부여하지 않는다', async ({ page }) => {
  await boot(page);
  for (const [t, n, c] of [['', '블라블라', 'KRW'], ['ZZTOP', 'Zz Unknown Corp', 'USD'], ['140860.KQ', '파크시스템스', 'KRW']]) {
    const r = await probe(page, t, n, c);
    expect(r.key, n).toBe('UNRESOLVED');
    expect(r.rate, n).toBe(0);
  }
});

test('7. classifyCategory 자체는 건드리지 않았다 - Risk 대상 자산군이 그대로다', async ({ page }) => {
  await boot(page);
  // 계산 계층의 폴백만 막았고 카테고리 분류는 손대지 않았다(§2 지시).
  const got = await page.evaluate(() => [
    ['', '블라블라', 'KRW'], ['ZZTOP', 'Zz Unknown Corp', 'USD'],
    ['114260.KS', 'KODEX 국고채3년', 'KRW'], ['', '국고채 10년', 'KRW'],
    ['', '현금', 'KRW'], ['', '서울 아파트', 'KRW']
  ].map(([t, n, c]) => [n, makeAsset({ ticker: t, name: n, currency: c }).category]));
  expect(Object.fromEntries(got)).toEqual({
    '블라블라': '주식', 'Zz Unknown Corp': '주식', 'KODEX 국고채3년': 'ETF',
    '국고채 10년': '채권', '현금': '현금', '서울 아파트': '부동산'
  });
});

/* ─────────── 3. BOND.STOCK 폴백 차단 (§3) ─────────── */

test('8. BOND.STOCK은 등록이 없으면 가정 없음, 등록이 있으면 그 값을 쓴다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = {};
    const none = {
      국내: presets.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, false)),
      해외: presets.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, true)),
      시스템참고: presets.map((p) => getSystemDefaultRate(p, 'BOND.STOCK'))
    };
    state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 } };
    const withUser = {
      국내: presets.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, false)),
      해외: presets.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, true))
    };
    state.projection.customScenarioRates = before;
    return { none, withUser };
  }, PRESETS);
  expect(got.none.국내).toEqual([0, 0, 0]);
  expect(got.none.해외).toEqual([0, 0, 0]); // 같은 키가 지역에 따라 갈리지 않는다
  expect(got.none.시스템참고).toEqual([0, 0, 0]); // 화면 참고값도 계산과 같은 말을 한다
  expect(got.withUser.국내).toEqual([3, 6, 9]);
  expect(got.withUser.해외).toEqual([3, 6, 9]);
});

/* ─────────── 4. 삼성전자 Individual Alpha 제거 (§4) ─────────── */

test('9. 삼성전자 시스템 기본 가정이 KOSPI 앵커를 상속한다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => ({
    samsung: presets.map((p) => getSystemDefaultRate(p, '005930.KS')),
    kospi: presets.map((p) => getSystemDefaultRate(p, 'KOSPI')),
    presetTickerRow: presets.map((p) => SCENARIO_RATE_PRESETS[p].tickers['005930.KS'])
  }), PRESETS);
  expect(got.samsung).toEqual([5, 7, 11]);
  expect(got.samsung).toEqual(got.kospi); // 숫자를 복사해 둔 것이 아니라 같은 앵커를 가리킨다
  expect(got.presetTickerRow).toEqual([undefined, undefined, undefined]); // 전용 행이 실제로 사라졌다
});

test('10. 사용자가 직접 넣은 삼성전자 수익률은 그대로 유지된다', async ({ page }) => {
  await boot(page);
  // 정책 변경이 사용자 데이터를 덮어쓰지 않는다 - Golden 사용자는 6/8/11을 등록해 두었다.
  const got = await page.evaluate((presets) => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = { '005930.KS': { label: '삼성전자', conservative: 6, normal: 8, optimistic: 11 } };
    const a = makeAsset({ ticker: '005930.KS', name: '삼성전자', currency: 'KRW' });
    const r = {
      key: resolveAssetGroupKeyDetail(a).key,
      자산경로: presets.map((p) => getAssetProjectionRate(a, p)),
      키직접: presets.map((p) => resolveProjectionRateForKey('005930.KS', p, false)),
      시스템참고: presets.map((p) => getSystemDefaultRate(p, '005930.KS')),
      저장된값: JSON.parse(JSON.stringify(state.projection.customScenarioRates['005930.KS']))
    };
    state.projection.customScenarioRates = before;
    return r;
  }, PRESETS);
  expect(got.key).toBe('005930.KS');
  expect(got.자산경로).toEqual([6, 8, 11]);
  expect(got.키직접).toEqual([6, 8, 11]);
  expect(got.시스템참고).toEqual([5, 7, 11]); // 시스템 값은 KOSPI, 사용자 값은 그대로 - 둘은 별개다
  expect(got.저장된값).toEqual({ label: '삼성전자', conservative: 6, normal: 8, optimistic: 11 });
});

test('11. 삼성 전용 Alpha Key를 새로 만들지 않았다', async ({ page }) => {
  await boot(page);
  const keys = await page.evaluate(() => SCENARIO_RATE_BASE_ROWS.map((r) => r.key));
  expect(keys).toEqual(['BOND', '부동산', 'KOSPI', 'KOSDAQ', '005930.KS', 'S&P500', 'SCHD', 'NASDAQ',
    'DEV_EX_US', 'EMERGING', 'MSFT', 'GOOGL', 'AAPL', 'AMZN', 'META', 'NVDA']);
  // 국내 개별종목 정책이 미국 개별종목 정책과 같아졌다 - 둘 다 대표지수 앵커를 alpha 0으로 상속한다.
  const got = await page.evaluate(() => ({
    us: ['MSFT', 'GOOGL', 'AAPL', 'AMZN', 'META', 'NVDA'].map((k) => getSystemDefaultRate('normal', k)),
    usAnchor: getSystemDefaultRate('normal', 'S&P500'),
    kr: getSystemDefaultRate('normal', '005930.KS'),
    krAnchor: getSystemDefaultRate('normal', 'KOSPI')
  }));
  expect(new Set(got.us).size).toBe(1);
  expect(got.us[0]).toBe(got.usAnchor);
  expect(got.kr).toBe(got.krAnchor);
});

/* ─────────── 5. Deterministic ↔ Monte Carlo 연결 (§7) ─────────── */

test('12. 모든 성격에서 Deterministic 경로와 MC adapter 경로가 같은 값을 낸다', async ({ page }) => {
  await boot(page);
  const mismatches = await page.evaluate((presets) => {
    const cases = [
      ['114260.KS', 'KODEX 국고채3년', 'KRW', '국내'],   // BOND
      ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD', '해외'], // 해외 채권 = 기준 없음
      ['VEA', 'Vanguard FTSE Developed Markets ETF', 'USD', '해외'], // DEV_EX_US
      ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD', '해외'],  // EMERGING
      ['069500.KS', 'KODEX 200', 'KRW', '국내'],          // KR_EQUITY
      ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', '해외'],   // US_EQUITY
      ['ZZETF', 'Unknown Global ETF', 'USD', '해외'],      // UNRESOLVED
      ['', '블라블라', 'KRW', '국내'],                     // UNRESOLVED
      ['', '국고채 10년', 'KRW', '국내'],                  // 카테고리 채권
      ['', '현금', 'KRW', '국내']                          // 카테고리 현금
    ];
    const bad = [];
    for (const [t, n, c, region] of cases) {
      const a = makeAsset({ ticker: t, name: n, currency: c });
      for (const p of presets) {
        const A = getAssetProjectionRate(a, p);
        const B = getTargetProjectionRate(
          { type: t ? 'ticker' : 'namedHolding', ticker: t, label: n, name: n, category: a.category }, p, region);
        if (A !== B) bad.push({ n, p, A, B });
      }
    }
    return bad;
  }, PRESETS);
  expect(mismatches).toEqual([]);
});

test('13. customScenarioRates도 두 경로에 똑같이 적용된다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = { BOND: { label: '국채/채권형', normal: 3.3 } };
    const a = makeAsset({ ticker: '114260.KS', name: 'KODEX 국고채3년', currency: 'KRW' });
    const r = {
      A: getAssetProjectionRate(a, 'normal'),
      B: getTargetProjectionRate({ type: 'ticker', ticker: '114260.KS', label: 'KODEX 국고채3년', category: 'ETF' }, 'normal', '국내')
    };
    state.projection.customScenarioRates = before;
    return r;
  });
  expect(got.A).toBe(3.3);
  expect(got.B).toBe(3.3);
});

test('14. UNRESOLVED 자산에는 어떤 지역 주식 수익률도 들어가지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => {
    const a = makeAsset({ ticker: 'ZZETF', name: 'Unknown Global ETF', currency: 'USD' });
    return {
      rates: presets.map((p) => getAssetProjectionRate(a, p)),
      kospi: presets.map((p) => getSystemDefaultRate(p, 'KOSPI')),
      sp500: presets.map((p) => getSystemDefaultRate(p, 'S&P500'))
    };
  }, PRESETS);
  expect(got.rates).toEqual([0, 0, 0]);
  expect(got.rates).not.toEqual(got.kospi);
  expect(got.rates).not.toEqual(got.sp500);
});

/* ─────────── 6. 기존 사용자 보호 (§8) ─────────── */

test('15. Golden 사용자의 13개 대표매칭 키가 등록값 그대로 적용된다', async ({ page }) => {
  await boot(page);
  // Golden 엑셀 "수익률 관리 기준" 시트에 실제로 들어 있는 값 - 이 Phase의 어떤 변경도
  // 이 값을 건드리지 않아야 한다(자산 데이터/수량/매입가/override/customScenarioRates 변경 0).
  const GOLDEN = {
    'BOND': [3, 4, 5], 'KOSPI': [4, 6, 9], 'KOSDAQ': [4, 8, 12], '005930.KS': [6, 8, 11],
    'S&P500': [6, 9, 11], 'SCHD': [6.5, 9.5, 11.5], 'NASDAQ': [8, 11, 14], 'GOOGL': [7.5, 11, 15],
    'BOND.STOCK': [3, 6, 9], '0052D0.KS': [5, 7, 11], '000660.KS': [5, 10, 15],
    'CASH': [2, 3, 4], 'CASH.USD': [2, 3, 4]
  };
  const got = await page.evaluate(([golden, presets]) => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    const custom = {};
    for (const k of Object.keys(golden)) {
      custom[k] = { label: k, conservative: golden[k][0], normal: golden[k][1], optimistic: golden[k][2] };
    }
    state.projection.customScenarioRates = custom;
    const out = {};
    for (const k of Object.keys(golden)) {
      // 자산에 rateMatchOverride로 지정된 상태를 그대로 모사한다(Golden 26개 자산 전부가 그렇다).
      const a = makeAsset({ ticker: 'ZZGOLD', name: 'GOLDEN-' + k, currency: 'KRW' });
      a.rateMatchOverride = k;
      out[k] = presets.map((p) => getAssetProjectionRate(a, p));
    }
    const 저장값그대로 = JSON.stringify(state.projection.customScenarioRates) === JSON.stringify(custom);
    state.projection.customScenarioRates = before;
    return { out, 저장값그대로 };
  }, [GOLDEN, PRESETS]);
  expect(got.out).toEqual(GOLDEN);
  expect(got.저장값그대로, '계산이 사용자 등록값을 바꾸지 않는다').toBe(true);
});

test('16. CASH / CASH.USD 정책은 그대로다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((presets) => presets.map((p) => ({
    cashSys: getSystemDefaultRate(p, 'CASH'), usdSys: getSystemDefaultRate(p, 'CASH.USD'),
    cashCalc: resolveProjectionRateForKey('CASH', p, false), usdCalc: resolveProjectionRateForKey('CASH.USD', p, true)
  })), PRESETS);
  for (const r of got) {
    expect(r.cashSys).toBe(0);
    expect(r.usdSys).toBe(0);
    expect(r.cashCalc).toBe(0);
    expect(r.usdCalc).toBe(0);
  }
});

/* ─────────── 7. 엑셀 round-trip 보호 ─────────── */

test('17. 가정 없는 자산은 엑셀 대표매칭 칸이 비고, 재업로드해도 override가 생기지 않는다', async ({ page }) => {
  await boot(page);
  // [Phase 48-A로 규칙이 넓어졌다] 예전엔 "unresolved일 때만" 이 칸을 비웠다. 지금은 "사용자가
  // 직접 지정한 값(a.rateMatchOverride)만 적고 나머지는 전부 빈 칸"이다 - 자동 판별 결과까지 찍으면
  // 그 파일을 다시 올렸을 때 자동판별이 사용자 지정으로 승격되기 때문이다(P0-3).
  // 실제 export 동작 자체는 e2e/50이 [엑셀 내보내기] 버튼을 눌러 검증한다. 여기서는 이 Phase가
  // 보장하는 것 - "가정 없는 자산에 override가 생기지 않는다" - 만 계속 고정한다.
  const got = await page.evaluate(() => {
    const unknown = makeAsset({ ticker: 'ZZETF', name: 'Unknown Global ETF', currency: 'USD' });
    const known = makeAsset({ ticker: '069500.KS', name: 'KODEX 200', currency: 'KRW' });
    const cell = (a) => sanitizeRateMatchOverride(a.rateMatchOverride) || ''; // js/12 export와 동일한 규칙
    // 빈 칸으로 다시 업로드했을 때 override가 생기지 않는지(round-trip 의미 보존)
    const reimported = makeAsset({ ticker: 'ZZETF', name: 'Unknown Global ETF', currency: 'USD', rateMatchOverride: '' });
    return {
      unknownCell: cell(unknown), knownCell: cell(known),
      knownAppliedKey: resolveAssetGroupKeyDetail(known).key,
      reimportedOverride: reimported.rateMatchOverride || '',
      reimportedKey: resolveAssetGroupKeyDetail(reimported).key
    };
  });
  expect(got.unknownCell).toBe('');
  expect(got.knownCell, '자동 판별값도 엑셀에 찍지 않는다(Phase 48-A)').toBe('');
  expect(got.knownAppliedKey, '계산에는 여전히 자동 판별 결과가 쓰인다').toBe('KOSPI');
  expect(got.reimportedOverride).toBe('');
  expect(got.reimportedKey).toBe('UNRESOLVED');
});
