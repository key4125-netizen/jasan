// E2E-49 Phase 47-G - 테스트 환경 네트워크 격리 회귀 고정.
//
// [왜 이 파일이 있는가]
// 예전엔 E2E가 실제 production Cloudflare Worker를 그대로 호출했다. 앱은 부팅할 때마다
// refreshPricesAndRates()로 시세/환율을 받아오고, 그 경로의 CORS 프록시 목록 첫 번째가 사용자
// 개인 Worker(asset-manager-proxy)라, 테스트 1건마다 실측 26건이 실제로 나갔다. 전체 e2e 1회에
// 약 12,000건, 반복 실행으로 Cloudflare Free 한도(계정 전체 100,000/day)를 실제로 소진했다.
//
// playwright.config.js가 브라우저 DNS를 localhost + 앱 셸 CDN 3곳으로만 제한해 이 경로를 끊었다.
// 이 파일은 그 차단이 실제로 동작하는지를 "요청 로그"로 증명한다 - 주석이나 신뢰가 아니라 관측으로.
//
// ⚠ 이 테스트가 깨지면 그것은 테스트가 낡은 것이 아니라 **테스트가 다시 실제 인프라를 때리고
// 있다는 뜻**이다. 기대값을 완화하지 말고 config의 host-resolver-rules부터 확인할 것.
const { test, expect } = require('@playwright/test');

// 절대 이 기기를 떠나면 안 되는 호스트들. A~F(PM 지시 3항)를 그대로 옮겼다.
const FORBIDDEN_HOST_PATTERNS = [
  /\.workers\.dev$/i,                 // A. 모든 Cloudflare Worker
  /^asset-manager-proxy\./i,          // B. 시세/환율 프록시 Worker
  /^keymaster\./i,                    // C. KIS Worker
  /^steep-haze-/i,                    // D. Sync Worker
  /finance\.yahoo\.com$/i,            // E/F. Yahoo
  /(^|\.)naver\.com$/i,               // F. 네이버 시세
  /(^|\.)stooq\.com$/i,               // F. Stooq
  /(^|\.)allorigins\.win$/i,          // 공용 CORS 프록시들
  /(^|\.)corsproxy\.io$/i,
  /(^|\.)codetabs\.com$/i,
  /(^|\.)r\.jina\.ai$/i,
  /exchangerate/i                     // 환율 API
];

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const isForbidden = (url) => {
  const h = hostOf(url);
  return !!h && FORBIDDEN_HOST_PATTERNS.some((re) => re.test(h));
};

// 페이지가 살아 있는 동안의 모든 요청/실패를 모은다.
function watchRequests(page) {
  const log = { requested: [], failed: new Map(), succeeded: [] };
  page.on('request', (r) => log.requested.push(r.url()));
  page.on('requestfailed', (r) => log.failed.set(r.url(), (r.failure() && r.failure().errorText) || 'unknown'));
  page.on('response', (r) => log.succeeded.push(r.url()));
  return log;
}

test('1. 앱을 부팅해도 production Worker / 외부 시세 API로 나가는 요청이 하나도 성립하지 않는다', async ({ page }) => {
  const log = watchRequests(page);
  await page.goto('/');
  // 부팅 직후의 시세/환율/지수/매크로 갱신이 전부 시도될 시간을 준다 - 차단이 없다면
  // 이 사이에 26건 안팎이 실제로 나간다(조사에서 실측한 값).
  await page.waitForFunction(() => typeof refreshPricesAndRates === 'function');
  await page.waitForTimeout(6000);

  // ① 실제로 응답을 받아낸(=네트워크를 떠난) 금지 호스트 요청이 0건이어야 한다.
  const leaked = log.succeeded.filter(isForbidden);
  expect(leaked, `이 기기를 떠나 응답까지 받은 요청:\n${leaked.slice(0, 10).join('\n')}`).toEqual([]);

  // ② 금지 호스트로 "시도"된 것이 있다면 전부 이름 해석 단계에서 실패했어야 한다.
  //    (앱 코드는 그대로 두었으므로 시도 자체는 남는다 - 중요한 건 그것이 나가지 못했다는 사실이다.)
  const attempted = [...new Set(log.requested.filter(isForbidden))];
  const notBlocked = attempted.filter((u) => !log.failed.has(u));
  expect(notBlocked, `차단되지 않은 채 남은 요청:\n${notBlocked.slice(0, 10).join('\n')}`).toEqual([]);
  for (const u of attempted) {
    expect(log.failed.get(u), `${hostOf(u)} 실패 사유`).toMatch(/ERR_NAME_NOT_RESOLVED|ERR_(FAILED|ABORTED|CONNECTION|BLOCKED)/);
  }
});

test('2. 차단해도 앱은 정상적으로 부팅하고 렌더링된다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && Array.isArray(state.assets));
  const got = await page.evaluate(() => ({
    // 앱 셸 CDN은 허용 목록이라 차트/아이콘/엑셀 라이브러리가 정상 로드되어야 한다.
    chart: typeof Chart, xlsx: typeof XLSX, lucide: typeof lucide,
    // 앱 자신의 코드도 전부 살아 있어야 한다.
    core: typeof makeAsset === 'function' && typeof calcRow === 'function',
    projection: typeof getAssetProjectionRate === 'function',
    assets: state.assets.length,
    // 시세를 못 받아도 시드된 현재가가 그대로 남는다(계산이 멈추지 않는다).
    prices: state.assets.map((a) => a.currentPrice)
  }));
  expect(got.core).toBe(true);
  expect(got.projection).toBe(true);
  expect(got.chart).toBe('function');
  expect(got.xlsx).toBe('object');
  expect(got.assets).toBeGreaterThan(0);
  expect(got.prices.every((p) => typeof p === 'number' && p > 0), '시세 조회 실패가 현재가를 0으로 만들지 않는다').toBe(true);
});

test('3. 계산 엔진은 네트워크와 무관하게 같은 값을 낸다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof getAssetProjectionRate === 'function');
  // 격리가 수익률 가정/계산 경로에 영향을 주지 않는지 확인한다 - 이 값들은 전부 코드 상수와
  // 사용자 설정에서만 나오므로 네트워크가 없어도 정확히 같아야 한다.
  const got = await page.evaluate(() => {
    const snap = JSON.parse(JSON.stringify(state.assets));
    try {
      const rate = (t, n, c) => {
        const a = makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: c, quantity: 1, buyPrice: 1000 });
        state.assets = [a];
        return ['conservative', 'normal', 'optimistic'].map((p) => getAssetProjectionRate(a, p));
      };
      return {
        kodex200: rate('069500.KS', 'KODEX 200', 'KRW'),
        bondEtf: rate('114260.KS', 'KODEX 국고채3년', 'KRW'),
        unknown: rate('ZZETF', 'Unknown Global ETF', 'USD'),
        samsungSystem: ['conservative', 'normal', 'optimistic'].map((p) => getSystemDefaultRate(p, '005930.KS'))
      };
    } finally { state.assets = snap; }
  });
  expect(got.kodex200).toEqual([5, 7, 11]);
  expect(got.bondEtf).toEqual([3.5, 4, 5.5]);
  expect(got.unknown).toEqual([0, 0, 0]);
  expect(got.samsungSystem).toEqual([5, 7, 11]);
});

test('4. 허용 목록은 앱 셸 CDN과 로컬 서버뿐이다 - 시세/Worker 호스트가 섞여 있지 않다', async ({ page }) => {
  const log = watchRequests(page);
  await page.goto('/');
  await page.waitForFunction(() => typeof refreshPricesAndRates === 'function');
  await page.waitForTimeout(4000);
  // 실제로 응답을 받아낸 외부 호스트 전부를 모아 허용 목록과 대조한다.
  const ALLOWED = ['localhost', '127.0.0.1', 'cdn.tailwindcss.com', 'unpkg.com', 'cdn.jsdelivr.net'];
  const external = [...new Set(log.succeeded.map(hostOf).filter(Boolean))]
    .filter((h) => !ALLOWED.includes(h));
  expect(external, `허용 목록에 없는데 응답까지 받은 호스트: ${external.join(', ')}`).toEqual([]);
});
