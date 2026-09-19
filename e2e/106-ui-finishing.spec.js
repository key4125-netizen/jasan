// E2E-106 [UI 마무리 ①~④] 매크로 지표 용어 · 포트폴리오 베타 설명 · 줄바꿈 · 총자산 소유자 칩 - 계산 · 정책 무변경.
// (⑤ MC 안내 정보구조는 e2e/95 · 96 · 100에서 확인한다.)
/* global document */
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof buildIndexPriceLevelsHtml === 'function' && typeof state !== 'undefined');
}

test('① 매크로 지표 카드는 지표 성격에 맞는 이름을 쓴다(금리 · 환율 · 지수에 "주가 · 최고가" 없음)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const a = { recentHigh: 4.8, recentLow: 4.1, mdd: -12.3, currentPrice: 4.4 };
    const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
    return {
      us10y: strip(buildIndexPriceLevelsHtml(a, 'us10y')),
      usdkrw: strip(buildIndexPriceLevelsHtml(a, 'usdkrw')),
      kospi: strip(buildIndexPriceLevelsHtml(a, 'kospi')),
      vix: strip(buildIndexPriceLevelsHtml(a, 'vix')),
      gold: strip(buildIndexPriceLevelsHtml(a, 'gold'))
    };
  });
  expect(r.us10y).toContain('최근 금리 수준 참고');
  expect(r.us10y).toContain('최근 3개월 최고 금리');
  expect(r.us10y).toContain('최근 3개월 최저 금리');
  expect(r.usdkrw).toContain('최근 3개월 최고 환율');
  expect(r.kospi).toContain('최근 3개월 최고치');
  expect(r.vix).toContain('최근 3개월 최저치');
  expect(r.gold).toContain('최근 3개월 최고가');
  for (const k of ['us10y', 'usdkrw', 'kospi', 'vix']) {
    ['주가', '최고가', '최저가'].forEach((w) => expect(r[k], `${k}:${w}`).not.toContain(w));
  }
  // 값 표시는 그대로(같은 계산값)
  expect(r.us10y).toContain('4.8');
  expect(r.us10y).toContain('-12.3%');
});

test('② 포트폴리오 베타가 비면 "일부 종목"이 원인임을 말한다(계산 · 대체값 없음)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const m = {
      holdings: [
        { ticker: 'AAA.KS', name: 'A', beta: 1.1, betaStatus: 'OK' },
        { ticker: 'BBB', name: 'B', beta: null, betaStatus: 'BENCHMARK_UNRESOLVED' },
        { ticker: 'CCC', name: 'C', beta: null, betaStatus: 'INSUFFICIENT_COMMON_DATES' }
      ],
      metricStatus: { beta: { status: 'UNAVAILABLE', reason: 'BENCHMARK_UNRESOLVED' } }
    };
    const onlyUnresolved = { ...m, holdings: m.holdings.slice(0, 2) };
    return {
      short: riskMetricUnavailableShortText(m, 'beta'),
      long: riskMetricUnavailableText(m, 'beta'),
      longUnresolved: riskMetricUnavailableText(onlyUnresolved, 'beta'),
      otherKey: riskMetricUnavailableShortText({ ...m, metricStatus: { var: { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_COMMON_DATES' } } }, 'var')
    };
  });
  expect(r.short).toBe('일부 종목 계산 불가');
  expect(r.long).toBe('보유 주식·ETF 3개 중 2개는 비교할 기준 지수가 없거나 함께 비교할 가격 기록이 부족해 시장 민감도를 계산하지 못했습니다. 그래서 포트폴리오 전체 값도 만들지 않았습니다.');
  expect(r.longUnresolved).toContain('2개 중 1개는 비교할 기준 지수가 정해지지 않아');
  expect(r.otherKey).toBe('거래일 부족');
});

test('③ 줄바꿈: 앱 전체가 단어 단위로 줄을 바꾸고, 미래예측 요약 줄은 "이름 + 값"을 한 덩어리로 둔다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  const r = await page.evaluate(() => {
    const cs = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
    const pairs = [...document.querySelectorAll('#projectionPlanFactsLine > span.whitespace-nowrap')];
    return { wordBreak: cs(document.body).wordBreak, wrap: cs(document.body).overflowWrap, pairs: pairs.length, texts: pairs.map((p) => p.textContent.replace(/\s+/g, ' ').trim()) };
  });
  expect(r.wordBreak).toBe('keep-all');
  expect(r.wrap).toBe('break-word');
  expect(r.pairs).toBe(4);
  expect(r.texts[3].startsWith('인플레이션')).toBe(true);
  // 수급 타일 라벨 "외국인·기관 5일 순매수"가 좁은 3열 칸에서도 단어 중간에서 갈라지지 않는다.
  const tile = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'grid grid-cols-3 gap-1.5 text-center';
    host.style.width = '330px';
    host.innerHTML = '<div class="rounded-md border py-2"><p class="text-sm" id="e2eFlowLabel">외국인·기관 5일 순매수</p></div><div></div><div></div>';
    document.body.appendChild(host);
    const el = document.getElementById('e2eFlowLabel');
    const range = document.createRange();
    const text = el.firstChild;
    const idx = text.textContent.indexOf('순매수');
    range.setStart(text, idx); range.setEnd(text, idx + 3);
    const lines = new Set([...range.getClientRects()].map((rc) => Math.round(rc.top)));
    host.remove();
    return lines.size;
  });
  expect(tile).toBe(1);
});

for (const w of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`④ ${w}px ${dark ? 'Dark' : 'Light'} - 총자산 소유자 칩은 이름 + 서로 다른 색 표시로 구분된다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      const r = await page.evaluate(() => {
        renderKpiBreakdown('kpiTotalValueOwnerBreakdown', { 신랑: { cur: 563000000 }, 와이프: { cur: 553000000 } }, (o) => o.cur, fmtKRWShort, false, 'text-sm text-slate-500 dark:text-slate-400', true);
        const chips = [...document.querySelectorAll('#kpiTotalValueOwnerBreakdown > span')];
        const win = document.defaultView;
        return chips.map((c) => {
          const dot = c.querySelector('[aria-hidden="true"]');
          const label = c.querySelector('.font-semibold');
          return { text: c.textContent.trim(), dot: dot ? win.getComputedStyle(dot).backgroundColor : null, border: win.getComputedStyle(c).borderTopColor, color: win.getComputedStyle(label).color, size: parseFloat(win.getComputedStyle(label).fontSize) };
        });
      });
      expect(r.map((x) => x.text)).toEqual(['신랑 5.63억', '와이프 5.53억']);
      expect(r[0].dot).not.toBe(r[1].dot);
      expect(r[0].border).not.toBe(r[1].border);
      r.forEach((x) => expect(x.size).toBeGreaterThanOrEqual(14));
      // 글자는 진한 색(주간) · 밝은 색(야간)으로 충분한 대비 - 손익 색(빨강/파랑)을 쓰지 않는다.
      const lum = (rgb) => { const [a, b, c] = rgb.match(/\d+/g).map(Number); return 0.299 * a + 0.587 * b + 0.114 * c; };
      r.forEach((x) => { if (dark) expect(lum(x.color)).toBeGreaterThan(180); else expect(lum(x.color)).toBeLessThan(90); });
      expect(await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}
