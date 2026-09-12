// E2E-80 [v234 - 매크로 브리핑 실가시성] v233에서 「📌 시장 해석 보기」를 눌러도 아무것도 보이지
// 않던 회귀를 고정한다. 원인은 중첩 아코디언의 높이 계산 시점이었다 - 안쪽 max-height에 300ms
// 트랜지션이 걸려 있어, 클릭 직후 동기적으로 읽은 바깥 scrollHeight에는 접힌 높이가 잡혔고 그 값으로
// 바깥이 고정되면서 방금 펼친 내용을 통째로 잘라냈다.
//
// 이 회귀를 기존 테스트가 통과시킨 이유가 핵심이다 - 검사가 "그 요소 자신의 height > 0"만 봤기
// 때문이다. 잘리는 쪽은 자식이 아니라 부모라서, 자식은 389px 멀쩡한 채로 화면에는 0px만 나온다.
// 그래서 여기서는 전부 visibleHeight()로 잰다: 요소의 사각형을 overflow를 자르는 조상들로 차례로
// 깎아, 사용자가 실제로 보는 높이만 남긴다.
//
//   ① 지수 10개가 대시보드 진입 직후부터 보인다(v234 - 예전엔 헤더를 한 번 더 눌러야 했다)
//   ②③④ 해석 열기 -> 닫기 -> 다시 열기가 매번 실제로 동작한다
//   ⑤ 재렌더(5분 자동 갱신과 같은 경로) 후에도 유지된다
//   ⑥ 탭을 다녀와도 동작한다
//   ⑦ 상관관계 가이드(3단)도 잘리지 않는다
//   ⑧ 375/768/1024 × Light/Dark 전부 동일하다
//
// 지표 종류·데이터·계산은 하나도 건드리지 않았다 - 표시 여부만 다룬다.
const { test, expect } = require('@playwright/test');

// 지표 10종 - 종류가 바뀌면(추가/삭제) 여기서 먼저 걸린다.
const MACRO_LABELS = ['VIX(공포지수)', '원/달러', '美 10년물 금리', '금 시세', '달러인덱스',
  '코스피', '코스닥', 'S&P 500', '나스닥', '다우'];

const TRANSITION = 900; // max-height 300ms × 중첩 보정 여유

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderAll === 'function');
}

function seed(page) {
  return page.locator('body').evaluate(() => {
    state.assets = [
      { id: 'e80a', ticker: 'E80A', owner: '신랑', accountType: '일반계좌', category: '주식',
        categorySource: 'user', name: 'E80_국내주식', isDomestic: '국내', currency: 'KRW',
        quantity: 10, buyPrice: 1000, currentPrice: 1200, positionSource: 'manual',
        createdAt: 1000, updatedAt: 1000 },
      { id: 'e80b', ticker: 'E80B', owner: '와이프', accountType: '일반계좌', category: 'ETF',
        categorySource: 'user', name: 'E80_해외ETF', isDomestic: '해외', currency: 'USD',
        quantity: 5, buyPrice: 100, currentPrice: 120, positionSource: 'manual',
        createdAt: 1000, updatedAt: 1000 },
    ];
    state.transactions = [];
    state.exchangeRate = 1380;
    state.refExchangeRate = 1350;
    state.macroIndicatorCache = {
      VIX: { price: 22.3, changePercent: 4.1 }, UST10Y: { price: 4.25, changePercent: 1.2 },
      GOLD: { price: 2400, changePercent: 0.8 }, USDX: { price: 104.2, changePercent: 0.3 },
      KOSPI: { price: 2700, changePercent: -1.1 }, KOSDAQ: { price: 850, changePercent: -1.5 },
      SP500: { price: 5600, changePercent: -0.7 }, NASDAQ: { price: 18000, changePercent: -0.9 },
      DOW: { price: 40000, changePercent: -0.4 },
    };
    persistAssets(true); persistTransactions();
    renderAll();
  });
}

// ⑨ 조상 clipping까지 반영한 실제 표시 높이. "자식 height > 0 이지만 부모가 잘라내서 안 보이는"
// 상태를 반드시 0으로 잡아내야 한다 - 이 회귀를 놓친 원인이 정확히 그 지점이었다.
function measure(page) {
  return page.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const win = doc.defaultView;
    const visibleHeight = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      let top = r.top, bottom = r.bottom;
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        if (win.getComputedStyle(p).overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top);
        bottom = Math.min(bottom, pr.bottom);
      }
      return Math.max(0, Math.round(bottom - top));
    };
    const byId = (id) => visibleHeight(doc.getElementById(id));
    const tiles = [...doc.querySelectorAll('#macroBriefingGrid .macro-card')];
    return {
      tileLabels: tiles.map((t) => t.querySelector('div').textContent.trim()),
      // 타일 하나하나가 통째로 보이는지(일부만 걸쳐 보이는 것도 잡는다)
      tilesFullyVisible: tiles.filter((t) => visibleHeight(t) >= Math.round(t.getBoundingClientRect().height) - 1).length,
      gridVisibleH: byId('macroBriefingGrid'),
      diagnosisVisibleH: byId('macroBriefingDiagnosis'),
      diagnosisFullH: Math.round(doc.getElementById('macroBriefingDiagnosis').getBoundingClientRect().height),
      guideVisibleH: byId('correlationGuideBody'),
      guideFullH: doc.getElementById('correlationGuideBody')
        ? doc.getElementById('correlationGuideBody').scrollHeight : null,
      pageOverflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
    };
  });
}

const clickDiagnosis = async (page) => {
  await page.locator('#macroDiagnosisToggleBtn').click();
  await page.waitForTimeout(TRANSITION);
};

/* ── ① 지수 10개 기본 표시 ───────────────────────────────────────────── */

test('A. 대시보드 진입 직후 지수 10개가 아무것도 누르지 않아도 전부 보인다', async ({ page }) => {
  await open(page);
  await seed(page);

  const m = await measure(page);
  expect(m.tileLabels, '지표 종류와 순서는 그대로다').toEqual(MACRO_LABELS);
  expect(m.tilesFullyVisible, '10개 전부 잘리지 않고 보인다').toBe(10);
  expect(m.gridVisibleH).toBeGreaterThan(0);
  expect(m.diagnosisVisibleH, '해석은 기본으로 닫혀 있다').toBe(0);
});

test('B. 데이터가 없어도 카드를 접거나 숨기지 않는다', async ({ page }) => {
  await open(page);
  await page.locator('body').evaluate(() => {
    state.assets = []; state.transactions = [];
    state.macroIndicatorCache = {}; // 전부 결측
    state.exchangeRate = null; state.refExchangeRate = null;
    persistAssets(true); persistTransactions(); renderAll();
  });

  const m = await measure(page);
  expect(m.tileLabels, '결측이어도 지표 10개 자리는 그대로 있다').toEqual(MACRO_LABELS);
  expect(m.tilesFullyVisible, '결측이라고 카드를 접지 않는다').toBe(10);
  // 기존 결측 표현(-, 조회 전)을 그대로 유지한다 - 0%나 "보합"으로 위장하지 않는다.
  await expect(page.locator('#macroBriefingGrid')).toContainText('조회 전');
});

/* ── ②③④ 해석 토글 ─────────────────────────────────────────────────── */

test('C. 해석을 열고-닫고-다시 열면 매번 실제로 보이고 사라진다', async ({ page }) => {
  await open(page);
  await seed(page);

  // ② 열기 - 부모에게 잘리지 않고 내용 전체가 보여야 한다.
  await clickDiagnosis(page);
  let m = await measure(page);
  expect(m.diagnosisVisibleH, '해석이 실제로 보인다(부모 clipping 없음)').toBeGreaterThan(0);
  expect(m.diagnosisVisibleH, '일부만 보이는 게 아니라 전체가 보인다').toBe(m.diagnosisFullH);
  expect(m.tilesFullyVisible, '해석을 펼쳐도 지수 10개는 그대로 보인다').toBe(10);

  // ③ 닫기
  await clickDiagnosis(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH, '두 번째 클릭으로 실제로 닫힌다').toBe(0);
  expect(m.tilesFullyVisible).toBe(10);

  // ④ 다시 열기 - v233에서 바로 이 세 번째 클릭이 다시 깨졌다.
  await clickDiagnosis(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH, '세 번째 클릭으로 다시 실제로 보인다').toBe(m.diagnosisFullH);
  expect(m.diagnosisVisibleH).toBeGreaterThan(0);
});

/* ── ⑤ 재렌더 ───────────────────────────────────────────────────────── */

test('D. 매크로 재렌더 후에도 펼친 해석이 그대로 보인다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDiagnosis(page);

  // 5분 자동 갱신이 타는 경로와 같다 - diagnosis innerHTML이 통째로 다시 그려진다.
  await page.locator('body').evaluate(() => renderRiskSection());
  await page.waitForTimeout(TRANSITION);

  const m = await measure(page);
  expect(m.tilesFullyVisible, '재렌더 후에도 지수 10개는 보인다').toBe(10);
  expect(m.diagnosisVisibleH, '재렌더가 펼친 해석을 되돌리거나 잘라내지 않는다').toBe(m.diagnosisFullH);
  expect(m.diagnosisVisibleH).toBeGreaterThan(0);

  // 재렌더 뒤에도 토글이 계속 동작한다(리스너 소실 없음).
  await clickDiagnosis(page);
  expect((await measure(page)).diagnosisVisibleH).toBe(0);
});

/* ── ⑥ 탭 왕복 ──────────────────────────────────────────────────────── */

test('E. 다른 탭에 다녀와도 지수와 해석 토글이 정상이다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDiagnosis(page);

  await page.locator('[data-tab="investmentDetail"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="dashboard"]').click();
  await page.waitForTimeout(TRANSITION);

  let m = await measure(page);
  expect(m.tilesFullyVisible).toBe(10);
  expect(m.diagnosisVisibleH, '복귀 후에도 해석이 잘리지 않는다').toBe(m.diagnosisFullH);

  // 복귀 후 닫고 다시 열기까지 동작한다.
  await clickDiagnosis(page);
  expect((await measure(page)).diagnosisVisibleH).toBe(0);
  await clickDiagnosis(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH).toBe(m.diagnosisFullH);
});

/* ── ⑦ 상관관계 가이드(3단) ─────────────────────────────────────────── */

test('F. 상관관계 가이드는 3단인데도 내용이 잘리지 않는다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDiagnosis(page);

  await page.locator('#correlationGuideToggleBtn').click();
  await page.waitForTimeout(TRANSITION * 2); // 3단 -> 2단 -> 1단 순으로 높이가 확정된다
  let m = await measure(page);
  expect(m.guideVisibleH, '가이드가 실제로 보인다').toBeGreaterThan(0);
  expect(m.guideVisibleH, '가이드가 부분적으로 잘리지 않는다').toBe(m.guideFullH);
  expect(m.diagnosisVisibleH, '가이드를 열어도 그 위 해석이 잘리지 않는다').toBe(m.diagnosisFullH);
  expect(m.tilesFullyVisible, '지수 10개도 그대로다').toBe(10);

  await page.locator('#correlationGuideToggleBtn').click();
  await page.waitForTimeout(TRANSITION * 2);
  m = await measure(page);
  expect(m.guideVisibleH, '가이드가 실제로 닫힌다').toBe(0);
  expect(m.diagnosisVisibleH, '가이드를 닫아도 해석은 그대로 보인다').toBe(m.diagnosisFullH);
});

/* ── 1단 아코디언 자체는 기능으로 남아 있다 ─────────────────────────── */

test('G. 브리핑 헤더로 접었다 다시 펴는 기능은 그대로다', async ({ page }) => {
  await open(page);
  await seed(page);

  await page.locator('#macroBriefingToggleBtn').click();
  await page.waitForTimeout(TRANSITION);
  expect((await measure(page)).gridVisibleH, '헤더를 누르면 접힌다').toBe(0);

  await page.locator('#macroBriefingToggleBtn').click();
  await page.waitForTimeout(TRANSITION);
  const m = await measure(page);
  expect(m.tilesFullyVisible, '다시 펴면 지수 10개가 전부 돌아온다').toBe(10);
});

/* ── ⑧ 375 / 768 / 1024 × Light / Dark ──────────────────────────────── */

for (const [w, h] of [[375, 812], [768, 1024], [1024, 768]]) {
  for (const dark of [true, false]) {
    test(`H. ${w}px ${dark ? 'Dark' : 'Light'} - 지수 기본 표시 · 해석 열기/닫기가 실제로 동작한다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await seed(page);
      await page.locator('body').evaluate((el, isDark) => {
        el.ownerDocument.documentElement.classList.toggle('dark', isDark);
      }, dark);
      await page.waitForTimeout(200);

      let m = await measure(page);
      expect(m.tilesFullyVisible, '진입 직후 지수 10개가 보인다').toBe(10);
      expect(m.diagnosisVisibleH).toBe(0);
      expect(m.pageOverflowX, '가로 스크롤이 생기지 않는다').toBe(false);

      await clickDiagnosis(page);
      m = await measure(page);
      expect(m.diagnosisVisibleH, '해석이 잘리지 않고 전부 보인다').toBe(m.diagnosisFullH);
      expect(m.diagnosisVisibleH).toBeGreaterThan(0);
      expect(m.tilesFullyVisible).toBe(10);
      expect(m.pageOverflowX).toBe(false);

      await clickDiagnosis(page);
      expect((await measure(page)).diagnosisVisibleH).toBe(0);

      // 가독성 - 이 섹션 안 글자는 14px 아래로 내려가지 않는다.
      const minFont = await page.locator('#macroBriefingSection').evaluate((sec) => {
        const win = sec.ownerDocument.defaultView;
        const sizes = [...sec.querySelectorAll('div,p,span,li,h4')]
          .filter((n) => !n.children.length && n.textContent.trim())
          .map((n) => parseFloat(win.getComputedStyle(n).fontSize));
        return sizes.length ? Math.min(...sizes) : null;
      });
      expect(minFont).toBeGreaterThanOrEqual(14);
    });
  }
}
