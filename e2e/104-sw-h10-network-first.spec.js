// E2E-104 [B-1 · §44 44-15 · v259] 서비스워커의 H.10 환율(data/fx/) 네트워크 우선 처리.
//
// [핵심 계약]
//  A) 캐시에 오래된 H.10(끝일 2026-08-01)이 있어도, 네트워크가 되면 서버의 최신 파일을 쓴다(캐시도 최신으로 바뀐다).
//  B) 네트워크가 안 되면 기존 캐시를 쓴다.
//  C) 네트워크도 캐시도 없으면 임의 환율 없이 SOURCE_UNAVAILABLE.
//  D) data/fx/ 밖의 같은 출처 파일은 예전처럼 캐시 우선이다(다른 자산 회귀 없음).
// 실제 서비스워커(sw.js)를 등록해 확인한다 - 결과 객체를 넣어 보는 방식이 아니다.
/* global caches, location */
const { test, expect } = require('@playwright/test');
const FILE = require('../data/fx/usdkrw-h10.json');

async function bootWithServiceWorker(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof getRiskUsdKrwRates === 'function');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // 첫 방문에는 아직 페이지를 제어하지 않을 수 있다(clients.claim 직후) - 제어될 때까지 새로고침한다.
  for (let i = 0; i < 3 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); i++) {
    await page.reload();
    await page.waitForFunction(() => typeof getRiskUsdKrwRates === 'function');
  }
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
const cacheName = (page) => page.evaluate(async () => (await caches.keys()).find((k) => k.startsWith('smart-asset-manager-')));

test('A. 캐시에 오래된 H.10이 있어도 네트워크가 되면 서버의 최신 파일을 쓰고 캐시도 갱신한다', async ({ page }) => {
  await bootWithServiceWorker(page);
  const name = await cacheName(page);
  expect(name).toBe('smart-asset-manager-v259');
  const r = await page.evaluate(async (name) => {
    const url = new URL('data/fx/usdkrw-h10.json', location.href).href;
    const cache = await caches.open(name);
    await cache.put(url, new Response(JSON.stringify({ endDate: '2026-08-01', rates: [['2026-07-31', 1300], ['2026-08-01', 1301]] }), { headers: { 'Content-Type': 'application/json' } }));
    const planted = await (await cache.match(url)).json();
    riskUsdKrwCache = null;
    const got = await getRiskUsdKrwRates();
    await new Promise((res) => setTimeout(res, 300));
    const after = await (await cache.match(url)).json();
    return { planted: planted.endDate, appEnd: got.endDate, appSize: got.rates ? got.rates.size : 0, cacheAfter: after.endDate };
  }, name);
  expect(r.planted).toBe('2026-08-01');
  expect(r.appEnd).toBe(FILE.endDate);
  expect(r.appSize).toBe(FILE.validCount);
  expect(r.cacheAfter).toBe(FILE.endDate);
});

test('B · C. 네트워크가 안 되면 캐시를 쓰고, 캐시도 없으면 SOURCE_UNAVAILABLE(임의 환율 없음)', async ({ page, context }) => {
  await bootWithServiceWorker(page);
  const name = await cacheName(page);
  // 네트워크가 될 때 한 번 받아 캐시에 넣어 둔다.
  await page.evaluate(async () => { riskUsdKrwCache = null; await getRiskUsdKrwRates(); await new Promise((r) => setTimeout(r, 300)); });
  await context.setOffline(true);
  const offlineWithCache = await page.evaluate(async () => {
    riskUsdKrwCache = null;
    const got = await getRiskUsdKrwRates();
    return { status: got.status, end: got.endDate, size: got.rates ? got.rates.size : 0 };
  });
  expect(['OK', 'DATA_STALE']).toContain(offlineWithCache.status);
  expect(offlineWithCache.end).toBe(FILE.endDate);
  expect(offlineWithCache.size).toBe(FILE.validCount);

  const offlineNoCache = await page.evaluate(async (name) => {
    await (await caches.open(name)).delete(new URL('data/fx/usdkrw-h10.json', location.href).href);
    riskUsdKrwCache = null;
    const got = await getRiskUsdKrwRates();
    return { status: got.status, rates: got.rates, end: got.endDate };
  }, name);
  await context.setOffline(false);
  expect(offlineNoCache.status).toBe('SOURCE_UNAVAILABLE');
  expect(offlineNoCache.rates).toBeNull();
  expect(offlineNoCache.end).toBeNull();
});

test('D. data/fx/ 밖의 같은 출처 파일은 예전처럼 캐시 우선이다', async ({ page }) => {
  await bootWithServiceWorker(page);
  const name = await cacheName(page);
  const r = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    const shellCached = !!(await cache.match(new URL('js/09-price-fx-risk-engine.js', location.href).href));
    // 같은 출처의 다른 정적 파일에 가짜 캐시를 넣으면, 캐시 우선이므로 그 가짜가 그대로 돌아온다.
    const url = new URL('manifest.json?b1-check', location.href).href;
    await cache.put(url, new Response('{"b1":"cached"}', { headers: { 'Content-Type': 'application/json' } }));
    const body = await (await fetch(url)).text();
    await cache.delete(url);
    return { shellCached, body };
  }, name);
  expect(r.shellCached).toBe(true);
  expect(r.body).toBe('{"b1":"cached"}');
});
