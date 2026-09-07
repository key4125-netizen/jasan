// E2E-41 Phase 40-C - "모르는 자산을 억지로 아는 척하지 않는다"의 상시 회귀.
//
// [핵심 계약]
//  1) 자산 성격(Asset Character)을 확인하지 못하면 지역만 보고 주식 수익률 가정을 붙이지 않는다.
//     "미국인데 모르겠다 → S&P500", "국내인데 모르겠다 → KOSPI"라는 사고방식을 제거한다.
//  2) 적합한 장기 수익률 기준이 없으면 NONE이 정상 결과다. 억지로 기존 Key에 끼워 맞추지 않는다.
//  3) 대표매칭 키 추천(recommendRateMatchKey)과 수익률 가정 추천(recommendReturnAssumptionKey)은
//     서로 다른 질문에 답하는 별개의 함수다.
//  4) 기존 사용자가 명시한 rateMatchOverride/customScenarioRates는 자동으로 바뀌지 않는다.
//  5) 이 Phase는 수익률 숫자를 전혀 바꾸지 않는다 - 기존 계산 결과가 그대로여야 한다.
//
// [외부 API 비의존] 추천/판정은 전부 순수 함수라 네트워크 없이 검사한다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof recommendReturnAssumptionKey === 'function'
    && typeof resolveAssetCharacter === 'function');
}

const rec = (page, ticker, name, currency) => page.evaluate(([t, n, c]) => {
  const r = recommendReturnAssumptionKey({ ticker: t, name: n, currency: c });
  return { key: r.recommendedReturnKey, character: r.character, strength: r.recommendationStrength,
    status: r.status, alternatives: r.alternatives, confirm: r.requiresUserConfirmation, reason: r.reason };
}, [ticker, name, currency]);

/* ───────────────── 1. 잘못된 지역 폴백이 실제로 사라졌는지 ───────────────── */

test('1. TLT(미국 장기국채)는 채권으로 판정되고 S&P500 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, 'TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD');
  expect(r.character).toBe('BOND');
  expect(r.key).not.toBe('S&P500');
  // 'BOND' 기준은 한국 국고채를 검토한 값이라 미국 국채에 자동 적용하지 않고 대안으로만 제시한다.
  expect(r.key).toBeNull();
  expect(r.alternatives).toContain('BOND');
  expect(r.confirm).toBe(true);
});

test('2. GLD(금)는 원자재로 판정되고 S&P500 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, 'GLD', 'SPDR Gold Shares', 'USD');
  expect(r.character).toBe('COMMODITY');
  expect(r.key).not.toBe('S&P500');
  expect(r.key).toBeNull();
  expect(r.strength).toBe('NONE');
});

test('3. LQD(회사채)는 채권으로 판정되고 S&P500 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, 'LQD', 'iShares Investment Grade Corporate Bond ETF', 'USD');
  expect(r.character).toBe('BOND');
  expect(r.key).not.toBe('S&P500');
  expect(r.key).toBeNull();
});

test('4. VWO(신흥국)는 신흥국 주식으로 판정되고 S&P500 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, 'VWO', 'Vanguard FTSE Emerging Markets ETF', 'USD');
  expect(r.character).toBe('EM_EQUITY');
  // 지역 폴백 금지는 이 파일의 영구 계약이다.
  expect(r.key).not.toBe('S&P500');
  expect(r.key).not.toBe('NASDAQ');
  // [Phase 41-B에서 갱신] 이 Phase를 쓸 당시엔 신흥국에 쓸 근거가 없어 NONE이 정답이었다.
  // Vanguard VCMM 신흥국 전망(2~4%)이 확보되면서 정식 Key로 해소됐다 - 상세는 e2e/42.
  expect(r.key).toBe('EMERGING');
});

test('5. VEA(선진국 ex-US)는 별도 성격으로 판정되고 S&P500 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, 'VEA', 'Vanguard FTSE Developed Markets ETF', 'USD');
  expect(r.character).toBe('DEV_EX_US_EQUITY');
  expect(r.key).not.toBe('S&P500');
  expect(r.key).not.toBe('NASDAQ');
  // [Phase 41-B에서 갱신] Vanguard VCMM 선진국 ex-US 전망(4.5~6.5%) 확보로 NONE에서 해소됨.
  expect(r.key).toBe('DEV_EX_US');
});

test('6. 국내 국고채 ETF는 채권으로 판정되고 KOSPI 가정을 받지 않는다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, '148070', 'KOSEF 국고채10년', 'KRW');
  expect(r.character).toBe('BOND');
  expect(r.key).not.toBe('KOSPI');
  expect(r.key).toBe('BOND');   // 국내 채권이므로 국내 기준을 그대로 쓸 수 있다
  expect(r.status).toBe('OK');
});

test('7. 성격을 알 수 없는 자산은 NONE이 정상 결과다', async ({ page }) => {
  await boot(page);
  const btc = await rec(page, 'BTC-USD', '비트코인', 'USD');
  expect(btc.character).toBe('CRYPTO');
  expect(btc.key).toBeNull();
  expect(btc.strength).toBe('NONE');
  // 이름도 티커도 시스템이 모르는 해외 ETF - 지역만 아는 상태
  const unknown = await rec(page, 'ZZZZ', 'Some Unknown Fund ETF', 'USD');
  expect(unknown.character).toBe('UNRESOLVED');
  expect(unknown.key).toBeNull();
  expect(unknown.confirm).toBe(true);
});

/* ───────────────── 2. 정상적으로 추천되어야 하는 자산 ───────────────── */

test('8. 성격이 확인되는 자산은 가장 정확한 기준을 추천한다', async ({ page }) => {
  await boot(page);
  const cases = [
    ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', 'NASDAQ', 'US_EQUITY'],
    ['SPYM', 'SPDR Portfolio S&P 500 ETF', 'USD', 'S&P500', 'US_EQUITY'],
    ['SCHD', 'Schwab US Dividend Equity ETF', 'USD', 'SCHD', 'US_EQUITY'],
    ['NVDA', 'NVIDIA', 'USD', 'NVDA', 'US_EQUITY'],
    // [Phase 47-A §4] 삼성전자 전용 시스템 수익률(8/9/15)이 폐지되어 KOSPI 앵커를 상속한다 -
    // 그래서 추천 기준도 '005930.KS'가 아니라 'KOSPI'다. 미국 개별종목이 US_EQUITY를 상속하는 것과 같다.
    ['005930', '삼성전자', 'KRW', 'KOSPI', 'KR_EQUITY']
  ];
  for (const [t, n, c, expectedKey, expectedChar] of cases) {
    const r = await rec(page, t, n, c);
    expect(r.character, `${t} 성격`).toBe(expectedChar);
    expect(r.key, `${t} 추천 키`).toBe(expectedKey);
    expect(r.strength, `${t} 강도`).toBe('HIGH');
  }
});

test('9. 시스템이 알지 못하는 개별 주식에는 기준을 붙이지 않는다', async ({ page }) => {
  await boot(page);
  // [Phase 47-A §2 - 정책 변경] Phase 40-C에서는 "category '주식'은 개별 지분증권이라는 구조를 확인한
  // 것"으로 보고 KOSPI를 추천했다. 그러나 classifyCategory(js/01)의 마지막 줄은 아무 규칙에도 걸리지
  // 않은 자산을 전부 '주식'으로 되돌린다 - 즉 그 근거는 "확인했다"가 아니라 "모른다"와 같다.
  // 실제로 이름이 '블라블라'인 자산까지 KOSPI를 받고 있었다. 이제 SECTOR_MAP/시스템 상품표처럼
  // 그 종목을 실제로 아는 근거가 있을 때만 기준을 붙인다.
  const posco = await rec(page, '005490', 'POSCO홀딩스', 'KRW');
  expect(posco.character).toBe('KR_EQUITY'); // 성격은 여전히 국내 주식으로 "보인다"
  expect(posco.key, '근거가 fall-through뿐이면 기준을 붙이지 않는다').toBeNull();
  expect(posco.strength).toBe('NONE');
  // 반면 시스템이 실제로 아는 개별 종목은 그대로 추천된다(SECTOR_MAP 등록 종목).
  const skhynix = await rec(page, '000660', 'SK하이닉스', 'KRW');
  expect(skhynix.character).toBe('KR_EQUITY');
  expect(skhynix.key).toBe('KOSPI');
  // 성격 미상의 ETF도 같은 지역이어도 추천하지 않는다(기존과 동일).
  const etf = await rec(page, '999999', '알 수 없는 ETF', 'KRW');
  expect(etf.character).toBe('UNRESOLVED');
  expect(etf.key).toBeNull();
});

test('10. 국내 상장 미국지수 ETF는 상장 시장이 아니라 기초지수를 따른다', async ({ page }) => {
  await boot(page);
  const r = await rec(page, '360750', 'TIGER 미국S&P500', 'KRW');
  expect(r.character).toBe('US_EQUITY');
  expect(r.key).toBe('S&P500');
  expect(r.key).not.toBe('KOSPI');
});

/* ───────────────── 3. 기존 사용자 데이터 보호 ───────────────── */

test('11. 사용자가 지정한 기준은 그대로 존중된다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const out = recommendReturnAssumptionKey({ ticker: 'AAPL', name: 'Apple', currency: 'USD', explicitReturnKey: 'NASDAQ' });
    return { key: out.recommendedReturnKey, status: out.status, confirm: out.requiresUserConfirmation };
  });
  expect(r.key).toBe('NASDAQ');
  expect(r.status).toBe('OK');
  expect(r.confirm).toBe(false);
});

test('12. 성격과 어긋나는 기존 지정도 자동으로 바꾸지 않고 확인 대상으로만 표시한다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // 미국 장기국채에 미국 주식 기준이 지정돼 있는 상태(기존 사용자 데이터에 있을 수 있다)
    const out = recommendReturnAssumptionKey({ ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', currency: 'USD', explicitReturnKey: 'S&P500' });
    return { key: out.recommendedReturnKey, status: out.status, confirm: out.requiresUserConfirmation, alts: out.alternatives };
  });
  expect(r.key, '기존 지정값을 삭제하거나 바꾸지 않는다').toBe('S&P500');
  expect(r.status).toBe('NEEDS_REVIEW');
  expect(r.confirm).toBe(true);
  expect(r.alts).toContain('BOND');
});

test('13. 기존 보유 자산의 적용 상태를 판정하되 계산은 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const gold = makeAsset({ ticker: 'GLD', name: 'SPDR Gold Shares', currency: 'USD', quantity: 1, buyPrice: 100, currentPrice: 100 });
    const before = getProjectionAssetGroupKey(gold);
    const assessed = assessReturnAssumptionStatus(gold);
    const after = getProjectionAssetGroupKey(gold);
    return { before, after, status: assessed.status, message: assessed.message, applied: assessed.appliedKey };
  });
  // [Phase 47-A] 금 ETF는 성격(원자재)은 확인되지만 그 성격에 맞는 기준이 앱에 없다 - 예전엔 지역
  // 폴백으로 S&P500이 붙었고 상태만 "확인 필요"로 알렸다. 이제 가정 자체를 적용하지 않고(0%),
  // 상태도 그 사실을 그대로 말한다. 판정 함수가 계산을 바꾸지 않는다는 계약은 그대로다.
  expect(r.before).toBe(r.after);
  expect(r.applied).toBe(r.before);
  expect(r.status).toBe('UNRESOLVED');
  expect(r.message).toContain('성장 없이');
});

test('14. 대표매칭 추천과 수익률 가정 추천은 서로 다른 함수이며 결과가 다를 수 있다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const input = { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', currency: 'USD' };
    return {
      matching: recommendRateMatchKey(input),
      assumption: recommendReturnAssumptionKey(input).recommendedReturnKey,
      두함수가다름: typeof recommendRateMatchKey === 'function' && typeof recommendReturnAssumptionKey === 'function'
        && recommendRateMatchKey !== recommendReturnAssumptionKey
    };
  });
  expect(r.두함수가다름).toBe(true);
  expect(r.assumption).toBeNull();
});

/* ───────────────── 4. Position / Benchmark 와의 분리 ───────────────── */

test('15. 포트폴리오 포지션은 수익률 가정 추천에 영향을 주지 않는다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const base = { ticker: 'QQQM', name: 'Invesco NASDAQ 100 ETF', currency: 'USD' };
    return ['attacker', 'core', 'midfielder', 'defender', undefined]
      .map((role) => recommendReturnAssumptionKey(Object.assign({ role }, base)).recommendedReturnKey);
  });
  expect(new Set(r).size, '포지션이 달라도 추천 결과는 같아야 한다').toBe(1);
  expect(r[0]).toBe('NASDAQ');
});

/* ───────────────── 5. 수익률 숫자 불변 ───────────────── */

test('16. 이 Phase는 수익률 숫자를 바꾸지 않았다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    US: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, 'S&P500')),
    KOSPI: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, 'KOSPI')),
    KOSDAQ: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, 'KOSDAQ')),
    삼성전자: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, '005930.KS')),
    BOND: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, 'BOND')),
    부동산: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, '부동산')),
    NASDAQ: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, 'NASDAQ'))
  }));
// [Phase 47-A - PM 승인 정책 변경으로 기대값 갱신] 아래 기대값은 테스트가 낡아서 고친 것이 아니라,
// PM이 명시적으로 승인한 정책 변경(삼성전자 Individual Alpha 폐지 / 지역 폴백 제거)의 결과다.
  expect(r).toEqual({
    US: [4.1, 5.1, 6.0], KOSPI: [5.0, 7.0, 11.0], KOSDAQ: [5.0, 7.0, 11.0],
    삼성전자: [5.0, 7.0, 11.0], BOND: [3.5, 4.0, 5.5], 부동산: [3.0, 5.5, 8.0], NASDAQ: [4.1, 5.1, 6.0]
  });
});

test('17. [Phase 47-A] 계산 경로가 성격 판정을 따르고 지역 폴백은 사라졌다', async ({ page }) => {
  await boot(page);
  // Phase 40-C는 추천/판정 계층만 추가하고 계산은 유예했다. 그 유예를 Phase 47-A가 끝냈다 -
  // 아래가 그 전후 차이 전부다(주석의 화살표 왼쪽이 Phase 40-C 시절 값).
  const r = await page.evaluate(() => [
    ['005930', '삼성전자', 'KRW'], ['QQQM', 'Invesco NASDAQ 100', 'USD'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD'], ['GLD', 'SPDR Gold Shares', 'USD'],
    ['148070', 'KOSEF 국고채10년', 'KRW'], ['005490', 'POSCO홀딩스', 'KRW']
  ].map(([t, n, c]) => getProjectionAssetGroupKey(makeAsset({ ticker: t, name: n, currency: c }))));
  expect(r).toEqual([
    'KOSPI',       // 005930.KS → KOSPI  : 삼성전자 전용 수익률 폐지, KOSPI 앵커 상속(§4)
    'NASDAQ',      // 변화 없음
    'UNRESOLVED',  // S&P500 → 없음      : 미국 국채 ETF에 미국 주식 수익률을 붙이지 않는다(§1)
    'UNRESOLVED',  // S&P500 → 없음      : 금 ETF에 맞는 기준이 앱에 없다
    'BOND',        // KOSPI → BOND       : 국내 국고채 ETF가 드디어 채권 기준을 받는다(§1 핵심)
    'UNRESOLVED'   // KOSPI → 없음       : 시스템이 모르는 개별 주식(§2)
  ]);
});

/* ───────────────── 6. 출처/상태 표시 ───────────────── */

test('18. 수익률 기준마다 근거 상태를 확인할 수 있다', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    us: getReturnAssumptionSourceInfo('S&P500'),
    kospi: getReturnAssumptionSourceInfo('KOSPI'),
    bond: getReturnAssumptionSourceInfo('BOND')
  }));
  // 출처가 확인된 값과 출처 불명 값이 화면에서 구분되어야 한다.
  expect(r.us.label).toBe('근거 확인됨');
  expect(r.us.detail).toContain('Vanguard');
  expect(r.us.detail).toContain('전망기간');
  expect(r.kospi.label).toBe('추가 확인 필요');
  expect(r.bond.label).toBe('추가 확인 필요');
  // 초보자에게 전문용어를 배지로 노출하지 않는다.
  ['CMA', 'geometric', 'arithmetic', 'nominal'].forEach((w) => {
    expect(r.us.label).not.toContain(w);
    expect(r.kospi.label).not.toContain(w);
  });
});

test('19. 수익률 관리 화면에 근거 상태가 실제로 표시된다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ ticker: 'SPYM', name: 'SPDR Portfolio S&P 500 ETF', currency: 'USD',
      owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 100, currentPrice: 100 })];
    persistAssets();
    openScenarioRateManagerModal();
  });
  const txt = await page.locator('#scenarioRateManagerList').innerText();
  expect(txt).toContain('장기 수익률 가정:');
  expect(txt).toContain('근거 확인됨');
});

/* ───────────────── 7. 모바일 가독성 ───────────────── */

for (const w of [375, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 근거 상태 문구가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.evaluate(() => {
        state.assets = [makeAsset({ ticker: 'SPYM', name: 'SPDR Portfolio S&P 500 ETF', currency: 'USD',
          owner: '신랑', accountType: '일반계좌', quantity: 10, buyPrice: 100, currentPrice: 100 })];
        persistAssets();
        openScenarioRateManagerModal();
      });
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
    });
  }
}
