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
  '005930.KS': [8.0, 9.0, 15.0],
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

test('10-B. [미결 고정] 인식되지 않는 자산은 개별주식으로 간주되어 지역 대표지수를 받는다', async ({ page }) => {
  await boot(page);
  // ⚠ 이 테스트도 "올바른 동작"이 아니라 **현재 정책의 빈틈**을 고정한다.
  // classifyCategory(js/01)의 마지막 줄은 아무 규칙에도 걸리지 않은 자산을 '주식'으로 되돌린다.
  // 그래서 resolveAssetCharacter 6단계("category '주식'은 상장 시장이 곧 성격")가 "확인된 개별 지분증권"이
  // 아니라 "정체를 모르는 모든 것"에 적용되고, 결과적으로 지역 대표지수가 MEDIUM 강도로 추천된다.
  // ETF 경로(위 테스트 10)에서는 막아 둔 지역 폴백이 이 경로로는 아직 열려 있다. PM 판단 필요.
  const got = await page.evaluate(() => [
    ['', '블라블라', 'KRW'],
    ['ZZTOP', 'Zz Unknown Corp', 'USD']
  ].map(([t, n, c]) => {
    const out = recommendReturnAssumptionKey({ ticker: t, name: n, currency: c });
    return { n, source: out.characterSource, key: out.recommendedReturnKey, strength: out.recommendationStrength };
  }));
  expect(got[0]).toEqual({ n: '블라블라', source: 'individualStock', key: 'KOSPI', strength: 'MEDIUM' });
  expect(got[1]).toEqual({ n: 'Zz Unknown Corp', source: 'individualStock', key: 'S&P500', strength: 'MEDIUM' });
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

test('13. [미결 고정] BOND.STOCK에는 시스템 장기 가정이 없고, 폴백이 주식 지수로 흐른다', async ({ page }) => {
  await boot(page);
  // ⚠ 이 테스트는 "올바른 동작"을 고정하는 것이 아니라 **아직 정책이 없다는 사실**을 고정한다.
  // BOND.STOCK은 SCENARIO_RATE_BASE_ROWS에 없는 사용자 정의 키인데, 사용자가 customScenarioRates에
  // 값을 등록하지 않으면 지역 폴백까지 흘러내려 채권혼합 상품에 순수 주식 지수 수익률이 붙는다.
  // 게다가 같은 키인데 자산의 국내/해외 표기에 따라 값이 갈린다. PM 정책 확정 시 이 테스트를 반드시 갱신한다.
  const got = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    state.projection.customScenarioRates = {}; // 수익률 시트 없이 자산 시트만 올린 사용자를 모사
    const P = ['conservative', 'normal', 'optimistic'];
    const r = {
      baseRow: SCENARIO_RATE_BASE_ROWS.some((x) => x.key === 'BOND.STOCK'),
      국내자산: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, false)),
      해외자산: P.map((p) => resolveProjectionRateForKey('BOND.STOCK', p, true)),
      KOSPI: P.map((p) => resolveProjectionRateForKey('KOSPI', p, false)),
      SP500: P.map((p) => resolveProjectionRateForKey('S&P500', p, true)),
      BOND: P.map((p) => resolveProjectionRateForKey('BOND', p, false))
    };
    state.projection.customScenarioRates = before;
    return r;
  });
  expect(got.baseRow).toBe(false);                 // 시스템 Key가 아니다
  expect(got.국내자산).toEqual(got.KOSPI);          // 국내 표기면 KOSPI가 붙는다(정책 아님 - 폴백)
  expect(got.해외자산).toEqual(got.SP500);          // 해외 표기면 S&P500이 붙는다
  expect(got.국내자산).not.toEqual(got.해외자산);    // 같은 키인데 값이 갈린다 - 이것이 미결 사항이다
  expect(got.국내자산).not.toEqual(got.BOND);       // 채권 기준이 붙지도 않는다
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

test('17. [미결 고정] 성격 판정 결과가 실제 계산 Key에 반영되지 않는다', async ({ page }) => {
  await boot(page);
  // ⚠ Phase 46 최대 발견. resolveAssetCharacter는 채권형 ETF를 정확히 BOND로 판정하는데,
  // 실제 수익률을 정하는 getProjectionAssetGroupKey는 그 판정을 전혀 보지 않고 지역 대표지수로 간다.
  // 즉 Phase 40-C가 만든 성격 계층이 계산에 연결돼 있지 않다. 사용자가 rateMatchOverride를 지정하면
  // 그 값이 우선하므로 기존 사용자에게는 드러나지 않지만, 아무 설정도 하지 않은 신규 사용자에게는 그대로 적용된다.
  // 연결 여부는 PM 정책 결정 사항이므로 여기서는 현재 상태를 고정만 한다.
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
      status: assessReturnAssumptionStatus(a).status
    };
  }));
  for (const r of got) {
    expect(r.character, r.n).toBe('BOND');            // 성격은 정확히 채권으로 판정된다
    expect(r.appliedSource, r.n).toBe('regionFallback'); // 그런데 계산은 지역 폴백을 쓴다
    expect(r.appliedKey, r.n).not.toBe('BOND');       // 채권 기준이 적용되지 않는다
    expect(r.status, r.n).toBe('NEEDS_REVIEW');       // 진단 계층은 이미 문제를 알고 있다
  }
});

test('18. 진단 계층은 정확한 문구를 만들지만 아직 어떤 UI에도 연결돼 있지 않다', async ({ page }) => {
  await boot(page);
  // 문구 자체는 사용자를 비난하지 않고 "확인해 주세요"로 끝난다 - 연결 Phase에서 이 톤을 유지해야 한다.
  const msg = await page.evaluate(() =>
    assessReturnAssumptionStatus(makeAsset({ ticker: '114260.KS', name: 'KODEX 국고채3년', currency: 'KRW' })).message);
  expect(msg).toContain('채권');
  expect(msg).toContain('확인해');
  expect(msg).not.toMatch(/잘못|위험|틀렸|낮추|매도/);
});
