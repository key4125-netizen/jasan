// E2E-45 Phase 46 - Return Assumption Policy 회귀 고정.
//
// 이 파일은 새 기능을 검사하지 않는다. Phase 46에서 "정책으로 확정한 것"을 코드가 계속 지키는지
// 고정하는 것이 목적이다. 여기 있는 숫자는 전부 지금 시스템이 실제로 쓰고 있는 값이며, 이 파일이
// 깨진다면 그것은 테스트가 낡은 것이 아니라 **누군가 정책을 바꾼 것**이다 - 그때는 PM 승인 없이
// 기대값을 고치지 말고 왜 바뀌었는지부터 확인해야 한다.
//
// [고정하는 계약]
//  1) 시스템 Return Key 목록과 그 Bear/Base/Bull 값
//  2) 근거 없는 자동 추천 금지(지역만으로, 이름의 '채권'/'미국'만으로 Key를 붙이지 않는다)
//  3) 사용자 override는 시스템 값과 독립이며 시스템 조회가 사용자 값을 바꾸지 않는다
//  4) Deterministic 경로와 Monte Carlo adapter 경로가 같은 의미의 연 수익률을 쓴다
//  5) 아직 정책이 없는 것(BOND.STOCK)은 "없다"는 사실 자체를 고정한다
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof getSystemDefaultRate === 'function'
    && typeof getTargetProjectionRate === 'function' && typeof computeMuGBM === 'function'
    && typeof resolveAssetCharacter === 'function');
}

const PRESETS = ['conservative', 'normal', 'optimistic'];

// 이 세 값이 Phase 46 시점의 시스템 정책이다(보수 / 일반 / 긍정).
const SYSTEM_RATES = {
  'BOND': [3.5, 4.0, 5.5],
  '부동산': [3.0, 5.5, 8.0],
  'KOSPI': [5.0, 7.0, 11.0],
  'KOSDAQ': [5.0, 7.0, 11.0],
  // [Phase 47-A] Individual Alpha 폐지 - KOSPI 앵커를 상속한다(전용 8/9/15 삭제).
  '005930.KS': [5.0, 7.0, 11.0],
  'S&P500': [4.1, 5.1, 6.0],
  'SCHD': [4.1, 5.1, 6.0],
  'NASDAQ': [4.1, 5.1, 6.0],
  'DEV_EX_US': [4.4, 5.4, 6.3],
  'EMERGING': [2.0, 3.0, 3.9],
  'MSFT': [4.1, 5.1, 6.0],
  'GOOGL': [4.1, 5.1, 6.0],
  'AAPL': [4.1, 5.1, 6.0],
  'AMZN': [4.1, 5.1, 6.0],
  'META': [4.1, 5.1, 6.0],
  'NVDA': [4.1, 5.1, 6.0],
  'CASH': [0, 0, 0],
  'CASH.USD': [0, 0, 0]
};

/* ─────────── 1. Return Key inventory와 값 (§4) ─────────── */

test('1. 시스템 Return Key 목록이 16개 그대로다 - 임의로 늘거나 줄지 않는다', async ({ page }) => {
  await boot(page);
  const keys = await page.evaluate(() => SCENARIO_RATE_BASE_ROWS.map((r) => r.key));
  expect(keys).toEqual(['BOND', '부동산', 'KOSPI', 'KOSDAQ', '005930.KS', 'S&P500', 'SCHD', 'NASDAQ',
    'DEV_EX_US', 'EMERGING', 'MSFT', 'GOOGL', 'AAPL', 'AMZN', 'META', 'NVDA']);
});

test('2. 모든 시스템 Key의 Bear/Base/Bull 값이 고정된다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(([keys, presets]) => {
    const out = {};
    for (const k of keys) out[k] = presets.map((p) => getSystemDefaultRate(p, k));
    return out;
  }, [Object.keys(SYSTEM_RATES), PRESETS]);
  expect(got).toEqual(SYSTEM_RATES);
});

test('3. 모든 시스템 Key가 Bear ≤ Base ≤ Bull 순서를 지킨다', async ({ page }) => {
  await boot(page);
  const rows = await page.evaluate(([keys, presets]) =>
    keys.map((k) => ({ k, v: presets.map((p) => getSystemDefaultRate(p, k)) })),
  [Object.keys(SYSTEM_RATES), PRESETS]);
  for (const { k, v } of rows) {
    expect(v[0], `${k} Bear≤Base`).toBeLessThanOrEqual(v[1]);
    expect(v[1], `${k} Base≤Bull`).toBeLessThanOrEqual(v[2]);
  }
});

test('4. CMA 앵커가 붙은 Key와 legacy 근사치 Key가 구분되어 있다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const out = {};
    for (const a of Object.keys(CMA_SOURCE_METADATA)) out[a] = CMA_SOURCE_METADATA[a].status;
    return out;
  });
  // 외부 출처가 실제로 확인된 것만 cma_verified다. 나머지를 검증된 것처럼 표시하지 않는다.
  expect(got).toEqual({
    US_EQUITY: 'cma_verified', DEV_EX_US_EQUITY: 'cma_verified', EM_EQUITY: 'cma_verified',
    KR_EQUITY: 'legacy_approximation', KR_BOND: 'legacy_approximation',
    REAL_ESTATE: 'legacy_approximation', CASH: 'legacy_approximation'
  });
});

/* ─────────── 2. Deterministic ↔ Monte Carlo 의미 일치 (§14) ─────────── */

test('5. 모든 시스템 Key에서 Deterministic 경로와 MC adapter 경로가 같은 값을 낸다', async ({ page }) => {
  await boot(page);
  // 경로 A: resolveProjectionRateForKey(자산 기반) / 경로 B: getTargetProjectionRate(목표 기반,
  // js/16 MC adapter가 실제로 호출하는 함수). 두 경로가 갈라지면 같은 화면의 두 카드가 다른 미래를 그린다.
  const mismatches = await page.evaluate((presets) => {
    const keys = SCENARIO_RATE_BASE_ROWS.map((r) => r.key).concat(['CASH', 'CASH.USD']);
    const bad = [];
    for (const k of keys) {
      for (const p of presets) {
        const foreign = RETURN_KEY_REGION[k] === '해외';
        const a = resolveProjectionRateForKey(k, p, foreign);
        const b = getTargetProjectionRate(
          { type: 'ticker', ticker: 'ZZPOLICY', label: 'ZZPOLICY', rateMatchOverride: k },
          p, foreign ? '해외' : '국내');
        if (a !== b) bad.push({ k, p, a, b });
      }
    }
    return bad;
  }, PRESETS);
  expect(mismatches).toEqual([]);
});

test('6. MC의 GBM 중앙값 성장률이 Deterministic 월복리 성장률과 정확히 같다', async ({ page }) => {
  await boot(page);
  // computeMuGBM(r,σ) = 12·ln(1+r/12) + σ²/2 이므로 exp(mu − σ²/2) − 1 = (1+r/12)^12 − 1 이어야 한다.
  // 즉 σ를 무엇으로 주든 MC의 "중앙 경로"는 결정론 카드와 같은 성장률이다 - σ는 폭만 만든다.
  const worst = await page.evaluate((presets) => {
    const keys = SCENARIO_RATE_BASE_ROWS.map((r) => r.key).concat(['CASH', 'CASH.USD']);
    let max = 0;
    for (const k of keys) {
      for (const p of presets) {
        const r = getSystemDefaultRate(p, k) / 100;
        for (const sig of [0.05, 0.18, 0.35, 0.60]) {
          const mu = computeMuGBM(r, sig);
          const mc = Math.exp(mu - (sig * sig) / 2) - 1;
          const det = Math.pow(1 + r / 12, 12) - 1;
          max = Math.max(max, Math.abs(mc - det));
        }
      }
    }
    return max;
  }, PRESETS);
  expect(worst).toBeLessThan(1e-12);
});

test('7. σ는 수익률 가정과 분리되어 있다 - 채권/현금은 σ=0, μ는 σ와 무관하다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    // 같은 μ에 서로 다른 σ를 줘도 중앙 성장률은 그대로다(μ와 σ가 섞이지 않는다는 뜻).
    mu동일: [0.05, 0.30].map((s) => Math.exp(computeMuGBM(0.07, s) - (s * s) / 2) - 1),
    // σ=0이면 GBM은 결정론과 완전히 동일해진다.
    sigma0: Math.exp(computeMuGBM(0.07, 0)) - 1,
    det: Math.pow(1 + 0.07 / 12, 12) - 1
  }));
  expect(got.mu동일[0]).toBeCloseTo(got.mu동일[1], 15);
  expect(got.sigma0).toBeCloseTo(got.det, 15);
});

/* ─────────── 3. 사용자 override 정책 (§12) ─────────── */

test('8. 사용자 값이 시스템 값보다 우선하고, 시스템 값 조회가 사용자 값을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = Object.assign({}, before, {
      'KOSPI': { label: 'KOSPI (국내 대표지수)', normal: 6.0 }
    });
    const r = {
      사용자값적용: getReferenceRate('normal', 'KOSPI'),
      시스템값불변: getSystemDefaultRate('normal', 'KOSPI'),
      미입력프리셋은시스템값: getReferenceRate('conservative', 'KOSPI'),
      오버라이드된프리셋: getUserOverriddenPresets('KOSPI'),
      // 시스템 참고값을 여러 번 읽어도 사용자 값이 오염되지 않는다.
      조회후사용자값: (getSystemReferenceRates('KOSPI'), getReferenceRate('normal', 'KOSPI'))
    };
    state.projection.customScenarioRates = before;
    return r;
  });
  expect(got.사용자값적용).toBe(6.0);
  expect(got.시스템값불변).toBe(7.0);
  expect(got.미입력프리셋은시스템값).toBe(5.0);
  expect(got.오버라이드된프리셋).toEqual(['normal']);
  expect(got.조회후사용자값).toBe(6.0);
});

test('9. 사용자가 직접 만든 Key에는 시스템 참고값을 지어내지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    시스템키: getSystemReferenceRates('KOSPI'),
    사용자키: getSystemReferenceRates('BOND.STOCK'),
    현금: getSystemReferenceRates('CASH')
  }));
  expect(got.시스템키).toEqual({ conservative: 5, normal: 7, optimistic: 11 });
  expect(got.사용자키).toBeNull(); // 시스템 기본 행이 아니다 - 참고값이 "없다"가 정답이다
  expect(got.현금).toBeNull();
});

/* ─────────── 4. Return Key 추천 정책 (§13) ─────────── */

test('10. 근거 없는 ETF에는 지역 대표지수를 붙이지 않는다', async ({ page }) => {
  await boot(page);
  // ETF는 무엇이든 담을 수 있으므로 "국내 상장이니 KOSPI"가 성립하지 않는다 - 이것이 Phase 40-C가
  // 막은 바로 그 경로다. 등록된 구성정보/지수 키워드가 하나도 없으면 추천하지 않는 것이 정답이다.
  const got = await page.evaluate(() => [
    ['999999.KS', 'KODEX 알수없는상품', 'KRW'],
    ['ZZETFKR', 'TIGER 알수없는상품', 'KRW'],
    ['ZZETF', 'Unknown Global ETF', 'USD'],
    ['278530.KS', 'KODEX 200TR', 'KRW'] // 실제 보유 자산인데 어느 표에도 등록돼 있지 않다
  ].map(([t, n, c]) => {
    const out = recommendReturnAssumptionKey({ ticker: t, name: n, currency: c });
    return { n, character: out.character, key: out.recommendedReturnKey, strength: out.recommendationStrength };
  }));
  for (const r of got) {
    expect(r.character, r.n).toBe('UNRESOLVED');
    expect(r.key, r.n).toBeNull();
    expect(r.strength, r.n).toBe('NONE');
  }
});

test('10-B. [Phase 47-A] 인식되지 않는 자산에는 지역 대표지수를 붙이지 않는다', async ({ page }) => {
  await boot(page);
  // Phase 46에서 미결로 기록했던 빈틈을 Phase 47-A(§2)가 닫았다. classifyCategory(js/01)의 마지막 줄이
  // 아무 규칙에도 안 걸린 자산을 주식으로 되돌리기 때문에, resolveAssetCharacter 6단계의
  // 'individualStock'은 "개별 주식임을 확인했다"가 아니라 "정체를 모른다"와 같은 뜻이었다.
  // 이제 그 근거로는 Return Key를 붙이지 않는다 - 이름이 '블라블라'인 자산이 KOSPI를 받던 경로다.
  const got = await page.evaluate(() => [
    ['', '블라블라', 'KRW'],
    ['ZZTOP', 'Zz Unknown Corp', 'USD']
  ].map(([t, n, c]) => {
    const out = recommendReturnAssumptionKey({ ticker: t, name: n, currency: c });
    const a = makeAsset({ ticker: t, name: n, currency: c });
    return { n, source: out.characterSource, key: out.recommendedReturnKey, strength: out.recommendationStrength,
      appliedKey: getProjectionAssetGroupKey(a), rate: getAssetProjectionRate(a, 'normal') };
  }));
  for (const r of got) {
    expect(r.source, r.n).toBe('individualStock'); // 성격 판정 자체는 그대로 두었다(Risk 계층 영향 없음)
    expect(r.key, r.n).toBeNull();                 // 추천하지 않는다
    expect(r.strength, r.n).toBe('NONE');
    expect(r.appliedKey, r.n).toBe('UNRESOLVED');  // 계산도 같은 판단을 한다
    expect(r.rate, r.n).toBe(0);                   // 가정을 적용하지 않음 = 성장 0%
  }
});

test('11. 이름에 "채권"/"미국"이 있다는 이유만으로 Key를 붙이지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    채권혼합: recommendReturnAssumptionKey({ ticker: '237370', name: 'KODEX 코리아배당성장채권혼합', currency: 'KRW' }),
    미국혼합: recommendReturnAssumptionKey({ ticker: '472170', name: 'TIGER 미국테크TOP10채권혼합', currency: 'KRW' })
  }));
  for (const k of ['채권혼합', '미국혼합']) {
    expect(got[k].character, k).toBe('UNRESOLVED');
    expect(got[k].recommendedReturnKey, k).toBeNull();
    expect(got[k].recommendationStrength, k).toBe('NONE');
  }
});

test('12. 근거가 있는 자산은 정상적으로 추천된다(과잉 차단 없음)', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => [
    ['SPYM', 'SPDR Portfolio S&P 500 ETF', 'USD'],
    ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD'],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'USD'],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD']
  ].map(([t, n, c]) => ({ t, key: recommendReturnAssumptionKey({ ticker: t, name: n, currency: c }).recommendedReturnKey })));
  const byTicker = Object.fromEntries(got.map((g) => [g.t, g.key]));
  expect(byTicker['SPYM']).toBe('S&P500');
  expect(byTicker['QQQM']).toBe('NASDAQ');
  expect(byTicker['VEA']).toBe('DEV_EX_US');
  expect(byTicker['VWO']).toBe('EMERGING');
  // 미국 채권은 국내 기준(BOND)을 그대로 붙이지 않는다 - 통화·시장이 다르다.
  expect(byTicker['TLT']).toBeNull();
});

/* ─────────── 5. 아직 정책이 없는 것 (§8) ─────────── */

test('13. [Phase 47-A] BOND.STOCK은 주식 지수로 흐르지 않고 가정 없음으로 처리된다', async ({ page }) => {
  await boot(page);
  // Phase 46에서 미결로 기록했던 항목을 Phase 47-A(§3)가 닫았다. BOND.STOCK은 시스템 Key가 아니므로
  // 사용자가 값을 등록하지 않으면 적용할 가정이 없다 - 예전엔 지역 폴백까지 흘러내려 채권혼합 상품에
  // 순수 주식 지수 수익률이 붙었고, 같은 키인데 자산의 국내/해외 표기에 따라 값이 갈리기까지 했다.
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = {}; // 수익률 시트 없이 자산 시트만 올린 사용자를 모사
    const P = ['conservative', 'normal', 'optimistic'];
    const r = {
      baseRow: SCENARIO_RATE_BASE_ROWS.some((x) => x.key === 'BOND.STOCK'),
      국내자산: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, false)),
      해외자산: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, true)),
      시스템참고: P.map((p) => getSystemDefaultRate(p, 'BOND.STOCK')),
      KOSPI: P.map((p) => resolveProjectionRateForKey('KOSPI', p, false)),
      SP500: P.map((p) => resolveProjectionRateForKey('S&P500', p, true))
    };
    state.projection.customScenarioRates = before;
    return r;
  });
  expect(got.baseRow).toBe(false);              // 여전히 시스템 Key가 아니다
  expect(got.국내자산).toEqual([0, 0, 0]);       // 가정 없음
  expect(got.해외자산).toEqual([0, 0, 0]);       // 지역에 따라 갈리지 않는다
  expect(got.시스템참고).toEqual([0, 0, 0]);     // 화면 참고값도 계산과 같은 말을 한다
  expect(got.국내자산).not.toEqual(got.KOSPI);   // 더 이상 주식 지수로 흐르지 않는다
  expect(got.해외자산).not.toEqual(got.SP500);
});

test('14. 사용자가 BOND.STOCK에 값을 등록해 두었다면 그 값이 그대로 쓰인다', async ({ page }) => {
  await boot(page);
  // 위 미결 사항이 실사용자에게 드러나지 않는 이유 - override가 항상 우선하기 때문이다.
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = { 'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 } };
    const P = ['conservative', 'normal', 'optimistic'];
    const r = {
      국내: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, false)),
      해외: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, true))
    };
    state.projection.customScenarioRates = before;
    return r;
  });
  expect(got.국내).toEqual([3, 6, 9]);
  expect(got.해외).toEqual([3, 6, 9]); // override가 있으면 지역에 따라 갈리지 않는다
});

/* ─────────── 6. 자산 성격 ↔ Key 정합성 (§4, §13) ─────────── */

test('15. 모든 시스템 Key가 자산 성격에 매핑되어 있고, 성격→Key 후보가 왕복한다', async ({ page }) => {
  await boot(page);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const row of SCENARIO_RATE_BASE_ROWS) {
      const ch = RETURN_KEY_CHARACTER[row.key];
      if (!ch) { out.push({ key: row.key, why: '성격 미매핑' }); continue; }
      const cands = returnKeyCandidatesForCharacter(ch, RETURN_KEY_REGION[row.key]);
      if (cands.length === 0) out.push({ key: row.key, why: `${ch}에 후보 Key 없음` });
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('16. Golden 자산 유형별로 성격 판정이 안정적이다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const cases = [
      ['005930.KS', '삼성전자', 'KRW'], ['000660.KS', 'SK하이닉스', 'KRW'],
      ['278530.KS', 'KODEX 200TR', 'KRW'], ['360750.KS', 'TIGER 미국S&P500', 'KRW'],
      ['368590.KS', 'RISE 미국나스닥100', 'KRW'], ['0052D0.KS', 'TIGER 코리아배당다우존스', 'KRW'],
      ['SCHD', 'Schwab US Dividend Equity ETF', 'USD'], ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD'],
      ['140860.KQ', '파크시스템스', 'KRW'], ['', '국채', 'KRW'], ['', '현금', 'KRW'], ['', '달러', 'USD'],
      ['237370.KS', 'KODEX 코리아배당성장채권혼합', 'KRW'], ['472170.KS', 'TIGER 미국테크TOP10채권혼합', 'KRW']
    ];
    return cases.map(([t, n, c]) => [n, resolveAssetCharacter(makeAsset({ ticker: t, name: n, currency: c })).character]);
  });
  expect(Object.fromEntries(got)).toEqual({
    '삼성전자': 'KR_EQUITY', 'SK하이닉스': 'KR_EQUITY',
    // KODEX 200TR은 ETF_HOLDINGS_MAP/지수 키워드 어디에도 등록돼 있지 않아 성격이 확인되지 않는다.
    // (같은 KOSPI200 추종인 'KODEX 200'(069500)은 등록돼 있어 KR_EQUITY로 판정된다 - 등록 여부의 차이일 뿐이다.)
    // 실사용자에게는 rateMatchOverride='KOSPI'가 이미 붙어 있어 계산에는 영향이 없다. backlog 항목.
    'KODEX 200TR': 'UNRESOLVED',
    'TIGER 미국S&P500': 'US_EQUITY', 'RISE 미국나스닥100': 'US_EQUITY',
    'TIGER 코리아배당다우존스': 'KR_EQUITY', 'Schwab US Dividend Equity ETF': 'US_EQUITY',
    'Invesco NASDAQ 100 ETF': 'US_EQUITY', '파크시스템스': 'KR_EQUITY',
    '국채': 'BOND', '현금': 'CASH', '달러': 'CASH',
    'KODEX 코리아배당성장채권혼합': 'UNRESOLVED', 'TIGER 미국테크TOP10채권혼합': 'UNRESOLVED'
  });
});

/* ─────────── 7. 성격 계층과 계산 계층의 단절 (§14, §20 ②) ─────────── */

test('17. [Phase 47-A] 성격 판정 결과가 실제 계산 Key에 반영된다', async ({ page }) => {
  await boot(page);
  // Phase 46 최대 발견의 해소. 성격 계층(Phase 40-C)이 드디어 계산 계층에 연결됐다.
  // 국내 채권형 ETF는 국내 BOND 기준을 받고, 미국 채권형 ETF는 통화/시장이 달라 국내 기준을 쓸 수
  // 없으므로(US_BOND Key가 아직 없다) 가정을 적용하지 않는다 - 둘 다 지역 대표지수는 아니다.
  const got = await page.evaluate(() => [
    ['114260.KS', 'KODEX 국고채3년', 'KRW'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD']
  ].map(([t, n, c]) => {
    const a = makeAsset({ ticker: t, name: n, currency: c });
    const detail = resolveAssetGroupKeyDetail(a);
    return {
      n,
      character: resolveAssetCharacter(a).character,
      appliedKey: detail.key,
      appliedSource: detail.source,
      rate: getAssetProjectionRate(a, 'normal'),
      status: assessReturnAssumptionStatus(a).status
    };
  }));
  const kr = got[0];
  expect(kr.character).toBe('BOND');
  expect(kr.appliedSource).toBe('assetCharacter');
  expect(kr.appliedKey).toBe('BOND');
  expect(kr.rate).toBe(4);            // KOSPI 7%가 아니라 채권 4%
  expect(kr.status).toBe('OK');
  const us = got[1];
  expect(us.character).toBe('BOND');
  expect(us.appliedSource).toBe('unresolved'); // 국내 BOND 기준을 미국 국채에 붙이지 않는다
  expect(us.appliedKey).toBe('UNRESOLVED');
  expect(us.rate).toBe(0);            // S&P500 5.1%가 아니다
  expect(us.status).toBe('UNRESOLVED');
  for (const r of got) expect(['KOSPI', 'S&P500', 'KOSDAQ']).not.toContain(r.appliedKey);
});

test('18. 가정을 적용하지 못한 자산의 안내 문구는 사용자를 비난하지 않는다', async ({ page }) => {
  await boot(page);
  // 이 문구는 아직 UI에 연결돼 있지 않다(연결은 별도 Phase의 PM 판단 사항). 연결될 때
  // "무엇이 일어났는지"만 말하고 사용자의 선택을 틀렸다고 하지 않는 톤을 유지해야 한다.
  const msg = await page.evaluate(() =>
    assessReturnAssumptionStatus(makeAsset({ ticker: 'ZZTOP', name: 'Zz Unknown Corp', currency: 'USD' })).message);
  expect(msg).toContain('0%');
  expect(msg).toContain('지정');
  expect(msg).not.toMatch(/잘못|위험|틀렸|낮추|매도/);
});
