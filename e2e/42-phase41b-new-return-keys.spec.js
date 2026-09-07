// E2E-42 Phase 41-B - 근거가 확보된 두 자산군(미국 외 선진국 / 신흥국) Return Key의 상시 회귀.
//
// [핵심 계약]
//  1) 두 Key의 값은 임의로 만든 숫자가 아니라 Vanguard VCMM 원자료를 앱 semantic contract
//     (연 명목 APR, 월복리)로 변환한 결과다. 변환식은 US_EQUITY와 동일한 함수를 쓴다.
//  2) 기존 Key의 숫자는 하나도 바뀌지 않는다.
//  3) VEA/VWO가 더 이상 S&P500으로 흘러가지 않고, NONE으로도 남지 않는다.
//  4) Deterministic(자산 기반)과 Monte Carlo(목표 기반)가 같은 rate를 쓴다.
//  5) 기존 사용자의 명시적 설정은 새 Key가 생겼다고 해서 자동으로 바뀌지 않는다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof cmaGeometricToAppRate === 'function'
    && typeof recommendReturnAssumptionKey === 'function');
}

/* ─────────────────── 1. Return Key 정의 ─────────────────── */

test('1~2. 두 Key가 시스템 기준 목록에 등록되어 있다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const byKey = Object.fromEntries(SCENARIO_RATE_BASE_ROWS.map((x) => [x.key, x.label]));
    return { dev: byKey['DEV_EX_US'], em: byKey['EMERGING'] };
  });
  // 사용자에게는 내부 키가 아니라 이해 가능한 이름으로 보인다.
  expect(r.dev).toBe('선진국(미국 제외) 주식');
  expect(r.em).toBe('신흥국 주식');
});

test('3~4. 두 Key의 Asset Character와 Region이 정확하다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    devChar: RETURN_KEY_CHARACTER['DEV_EX_US'], devRegion: RETURN_KEY_REGION['DEV_EX_US'],
    emChar: RETURN_KEY_CHARACTER['EMERGING'], emRegion: RETURN_KEY_REGION['EMERGING']
  }));
  expect(r).toEqual({
    devChar: 'DEV_EX_US_EQUITY', devRegion: '해외',
    emChar: 'EM_EQUITY', emRegion: '해외'
  });
});

test('5. 두 Key에 CMA metadata가 연결되어 있고 정의가 기록되어 있다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ['DEV_EX_US', 'EMERGING'].map((k) => {
    const anchor = getCmaAnchorForKey(k);
    const m = CMA_SOURCE_METADATA[anchor];
    return { key: k, anchor, status: m.status, hasSource: !!m.source, hasUrl: !!m.sourceUrl,
      horizon: m.forecastHorizonYears, currency: m.currency, nominalReal: m.nominalReal,
      geometric: /geometric/.test(m.meanType), total: /total/.test(m.returnType),
      hasAsOf: !!m.asOfDate, hasUncertainty: !!m.uncertaintyNote };
  }));
  r.forEach((x) => {
    expect(x.status, `${x.key} status`).toBe('cma_verified');
    expect(x.hasSource && x.hasUrl && x.hasAsOf && x.hasUncertainty, `${x.key} metadata 완비`).toBe(true);
    expect(x.horizon).toBe(10);
    expect(x.currency).toBe('USD');
    expect(x.nominalReal).toBe('nominal');
    expect(x.geometric).toBe(true);
    expect(x.total).toBe(true);
  });
  expect(r.map((x) => x.anchor)).toEqual(['DEV_EX_US_EQUITY', 'EM_EQUITY']);
});

/* ─────────────────── 2. Rate 변환 검산 ─────────────────── */

test('변환식이 기존 US_EQUITY 값을 그대로 재현한다(같은 정책임을 증명)', async ({ page }) => {
  await boot(page);
  // 4.2/5.2/6.2는 Vanguard의 US equity 원자료. 이 함수가 현재 코드에 박혀 있는 4.1/5.1/6.0을
  // 되돌려주지 못하면 신규 두 Key도 다른 정책으로 만들어진 셈이 된다.
  const r = await page.evaluate(() => [4.2, 5.2, 6.2].map(cmaGeometricToAppRate));
  expect(r).toEqual([4.1, 5.1, 6.0]);
});

test('6~11. 두 Key의 저장값이 Vanguard 원자료 변환 결과와 정확히 일치한다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const P = ['conservative', 'normal', 'optimistic'];
    return {
      raw: CMA_RAW_RANGES,
      devStored: P.map((p) => getSystemDefaultRate(p, 'DEV_EX_US')),
      emStored: P.map((p) => getSystemDefaultRate(p, 'EMERGING')),
      devExpected: [4.5, 5.5, 6.5].map(cmaGeometricToAppRate),
      emExpected: [2.0, 3.0, 4.0].map(cmaGeometricToAppRate)
    };
  });
  // 원자료 range가 Vanguard 발표값 그대로인지
  expect(r.raw.DEV_EX_US).toEqual({ conservative: 4.5, normal: 5.5, optimistic: 6.5 });
  expect(r.raw.EMERGING).toEqual({ conservative: 2.0, normal: 3.0, optimistic: 4.0 });
  // 저장값이 변환 결과와 일치하는지(하드코딩된 다른 숫자가 아닌지)
  expect(r.devStored).toEqual(r.devExpected);
  expect(r.emStored).toEqual(r.emExpected);
  expect(r.devStored).toEqual([4.4, 5.4, 6.3]);
  expect(r.emStored).toEqual([2.0, 3.0, 3.9]);
});

test('저장값을 앱 계산식에 넣으면 원자료 수익률로 되돌아온다(왕복 검산)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // 결정론 경로가 실제로 쓰는 식: (1 + r/12)^12 - 1
    const eff = (r) => (Math.pow(1 + r / 100 / 12, 12) - 1) * 100;
    const P = ['conservative', 'normal', 'optimistic'];
    return {
      dev: P.map((p, i) => Math.abs(eff(getSystemDefaultRate(p, 'DEV_EX_US')) - [4.5, 5.5, 6.5][i])),
      em: P.map((p, i) => Math.abs(eff(getSystemDefaultRate(p, 'EMERGING')) - [2.0, 3.0, 4.0][i]))
    };
  });
  // 소수 첫째 자리 반올림 때문에 생기는 오차만 남아야 한다(0.05%p 미만).
  r.dev.concat(r.em).forEach((d) => expect(d).toBeLessThan(0.05));
});

/* ─────────────────── 3. 추천 ─────────────────── */

test('12~17. VEA/VWO가 각 자산군으로 추천되고 미국 주식으로 흘러가지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ['VEA', 'VWO'].map((t) => {
    const name = t === 'VEA' ? 'Vanguard FTSE Developed Markets ETF' : 'Vanguard FTSE Emerging Markets ETF';
    const out = recommendReturnAssumptionKey({ ticker: t, name, currency: 'USD' });
    return { t, key: out.recommendedReturnKey, character: out.character, status: out.status,
      strength: out.recommendationStrength };
  }));
  const vea = r[0], vwo = r[1];

  expect(vea.key).toBe('DEV_EX_US');
  expect(vea.character).toBe('DEV_EX_US_EQUITY');
  expect(vwo.key).toBe('EMERGING');
  expect(vwo.character).toBe('EM_EQUITY');
  // 금지 결과 - 이 Phase 이전에는 NONE이었고, 그 이전에는 S&P500이었다.
  [vea, vwo].forEach((x) => {
    expect(x.key, `${x.t}가 S&P500으로 가면 안 된다`).not.toBe('S&P500');
    expect(x.key, `${x.t}가 NASDAQ으로 가면 안 된다`).not.toBe('NASDAQ');
    expect(x.key, `${x.t}가 NONE이면 안 된다`).not.toBeNull();
    expect(x.status).toBe('OK');
  });
});

test('같은 성격의 다른 상품도 동일하게 연결된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [
    ['IEFA', 'iShares Core MSCI EAFE ETF'],
    ['EEM', '신흥국 주식 ETF']
  ].map(([t, n]) => recommendReturnAssumptionKey({ ticker: t, name: n, currency: 'USD' }).recommendedReturnKey));
  expect(r).toEqual(['DEV_EX_US', 'EMERGING']);
});

/* ─────────────────── 4. 계산 연결 ─────────────────── */

test('18~21. Deterministic(자산 기반)과 Monte Carlo(목표 기반)가 같은 rate를 쓴다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', currency: 'USD', owner: '신랑',
        accountType: '일반계좌', category: 'ETF', isDomestic: '해외', quantity: 10, buyPrice: 50, currentPrice: 50,
        rateMatchOverride: 'DEV_EX_US' }),
      makeAsset({ ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', currency: 'USD', owner: '신랑',
        accountType: '일반계좌', category: 'ETF', isDomestic: '해외', quantity: 10, buyPrice: 45, currentPrice: 45,
        rateMatchOverride: 'EMERGING' })
    ];
    persistAssets();
    const pair = (ticker) => {
      const a = state.assets.find((x) => x.ticker === ticker);
      // 경로 A: 자산 기반(결정론 미래예측). 경로 B: 목표 기반 - MC 어댑터(js/16)가 쓰는 바로 그 함수.
      const target = { type: 'ticker', ticker, label: ticker, owner: '신랑' };
      return ['conservative', 'normal', 'optimistic'].map((p) => ({
        a: resolveProjectionRateForKey(getProjectionAssetGroupKey(a), p, true),
        b: getTargetProjectionRate(target, p, '해외')
      }));
    };
    return { vea: pair('VEA'), vwo: pair('VWO') };
  });
  // 두 경로가 어긋나면 "화면의 5.4%가 MC에서는 다른 5.4%"인 문제가 생긴다.
  r.vea.forEach((x, i) => expect(x.a, `VEA preset ${i}`).toBe(x.b));
  r.vwo.forEach((x, i) => expect(x.a, `VWO preset ${i}`).toBe(x.b));
  expect(r.vea.map((x) => x.a)).toEqual([4.4, 5.4, 6.3]);
  expect(r.vwo.map((x) => x.a)).toEqual([2.0, 3.0, 3.9]);
});

test('수익률 관리 목록에 두 Key가 이해 가능한 이름으로 노출된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.assets = [
      makeAsset({ ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', currency: 'USD', owner: '신랑',
        accountType: '일반계좌', category: 'ETF', isDomestic: '해외', quantity: 10, buyPrice: 50, currentPrice: 50,
        rateMatchOverride: 'DEV_EX_US' })
    ];
    persistAssets();
    openScenarioRateManagerModal();
    return { source: getReturnAssumptionSourceInfo('DEV_EX_US').label };
  });
  const text = await page.locator('#scenarioRateManagerList').innerText();
  expect(text).toContain('선진국(미국 제외) 주식');
  expect(r.source).toBe('근거 확인됨');
});

/* ─────────────────── 5. 기존 값·데이터 보호 ─────────────────── */

test('기존 Return Key 숫자가 하나도 바뀌지 않았다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const P = ['conservative', 'normal', 'optimistic'];
    const v = (k) => P.map((p) => getSystemDefaultRate(p, k));
    return { 'S&P500': v('S&P500'), NASDAQ: v('NASDAQ'), SCHD: v('SCHD'), NVDA: v('NVDA'),
      MSFT: v('MSFT'), GOOGL: v('GOOGL'), AAPL: v('AAPL'), AMZN: v('AMZN'), META: v('META'),
      KOSPI: v('KOSPI'), KOSDAQ: v('KOSDAQ'), samsung: v('005930.KS'),
      BOND: v('BOND'), realEstate: v('부동산') };
  });
  expect(r).toEqual({
    'S&P500': [4.1, 5.1, 6.0], NASDAQ: [4.1, 5.1, 6.0], SCHD: [4.1, 5.1, 6.0], NVDA: [4.1, 5.1, 6.0],
    MSFT: [4.1, 5.1, 6.0], GOOGL: [4.1, 5.1, 6.0], AAPL: [4.1, 5.1, 6.0], AMZN: [4.1, 5.1, 6.0], META: [4.1, 5.1, 6.0],
  // [Phase 47-A - PM 승인 정책 변경으로 기대값 갱신] 테스트가 낡아서 고친 것이 아니라,
  // PM이 명시적으로 승인한 정책 변경(삼성전자 Individual Alpha 폐지 / 지역 폴백 제거)의 결과다.
  // 삼성전자는 이제 KOSPI 앵커를 상속한다(전용 8/9/15 폐지).
    KOSPI: [5.0, 7.0, 11.0], KOSDAQ: [5.0, 7.0, 11.0], samsung: [5.0, 7.0, 11.0],
    BOND: [3.5, 4.0, 5.5], realEstate: [3.0, 5.5, 8.0]
  });
});

test('22~23. 기존 사용자의 명시적 설정은 새 Key가 생겨도 자동으로 바뀌지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // 사용자가 VEA에 일부러 S&P500을 지정해 둔 상태(정책과 어긋나지만 사용자의 명시적 의도)
    state.assets = [makeAsset({ ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', currency: 'USD',
      owner: '신랑', accountType: '일반계좌', category: 'ETF', isDomestic: '해외',
      quantity: 10, buyPrice: 50, currentPrice: 50, rateMatchOverride: 'S&P500' })];
    state.projection.customScenarioRates = Object.assign({}, state.projection.customScenarioRates,
      { 'MY_CUSTOM': { label: '내가 만든 기준', normal: 6.6 } });
    persistAssets(); persistProjection();
    const a = state.assets[0];
    const rec = recommendReturnAssumptionKey({ ticker: 'VEA', name: a.name, currency: 'USD', explicitReturnKey: a.rateMatchOverride });
    return {
      override유지: a.rateMatchOverride,
      계산에쓰이는키: getProjectionAssetGroupKey(a),
      추천결과: rec.recommendedReturnKey,
      상태: rec.status,
      대안: rec.alternatives,
      커스텀보존: state.projection.customScenarioRates['MY_CUSTOM'].normal
    };
  });
  expect(r.override유지).toBe('S&P500');
  expect(r.계산에쓰이는키).toBe('S&P500');
  // 자동으로 바꾸지 않고 확인 대상으로만 표시한다.
  expect(r.추천결과).toBe('S&P500');
  expect(r.상태).toBe('NEEDS_REVIEW');
  expect(r.대안).toContain('DEV_EX_US');
  expect(r.커스텀보존).toBe(6.6);
});

test('24. 새 Key가 기존 자산의 대표매칭 판정을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  // Golden에 실제로 들어 있는 대표적인 키들이 그대로 판정되는지.
  const r = await page.evaluate(() => [
    ['005930', '삼성전자', 'KRW'], ['000660', 'SK하이닉스', 'KRW'],
    ['QQQM', 'Invesco NASDAQ 100', 'USD'], ['SPYM', 'SPDR Portfolio S&P 500', 'USD'],
    ['SCHD', 'Schwab US Dividend', 'USD'], ['GOOGL', 'Alphabet', 'USD'],
    ['', '국고채 10년', 'KRW'], ['', '달러 예수금', 'USD']
  ].map(([t, n, c]) => getProjectionAssetGroupKey(makeAsset({ ticker: t, name: n, currency: c }))));
  // 실제 기존 동작 그대로다: SK하이닉스는 시스템 상품표에 없어 지역 대표지수(KOSPI)로 가고,
  // 티커 없는 채권/현금은 카테고리 그룹 키('채권'/'현금')로 간다('BOND'/'CASH'는 수익률 관리
  // 행의 키이고 카테고리 그룹 키와는 다른 층위다). 새 Key 추가가 이 판정을 전혀 건드리지 않았다.
  // [Phase 47-A - PM 승인 정책 변경으로 기대값 갱신] 테스트가 낡아서 고친 것이 아니라,
  // PM이 명시적으로 승인한 정책 변경(삼성전자 Individual Alpha 폐지 / 지역 폴백 제거)의 결과다.
  expect(r).toEqual(['KOSPI', 'KOSPI', 'NASDAQ', 'S&P500', 'SCHD', 'GOOGL', '채권', '현금']);
});
