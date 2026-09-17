// E2E-80 [매크로 브리핑 실가시성 · 구조] v233에서 해석 버튼을 눌러도 아무것도 보이지 않던 회귀(v234)를
// 고정하고, PM 확정 구조를 함께 고정한다.
//
// [구조] 「시장 현황 & 매크로 브리핑」 자체와 지표 10개는 접지 않고 항상 보인다. 접는 것은 그 아래
// 「📌 세부 내용 보기」 하나뿐이며, 그 안(시장 종합 평가 / 내 포트폴리오 영향 / 참고 / 상관관계 가이드)에는
// 접기를 다시 두지 않는다.
//
// [측정 방식] v234 회귀를 기존 테스트가 통과시킨 이유는 검사가 "그 요소 자신의 height > 0"만 봤기
// 때문이다. 잘리는 쪽은 자식이 아니라 부모라서, 자식은 멀쩡한 채로 화면에는 0px만 나올 수 있다.
// 그래서 여기서는 전부 visibleHeight()로 잰다: 요소의 사각형을 overflow를 자르는 조상들로 차례로
// 깎아, 사용자가 실제로 보는 높이만 남긴다.
//
//   ① 지수 10개가 대시보드 진입 직후부터 보인다
//   ②③④ 세부 내용 열기 -> 닫기 -> 다시 열기가 매번 실제로 동작한다
//   ⑤ 재렌더(5분 자동 갱신과 같은 경로) 후에도 유지된다
//   ⑥ 탭을 다녀와도 동작한다
//   ⑦ 세부 내용을 펼치면 네 항목(상관관계 가이드 포함)이 별도 토글 없이 잘리지 않고 보인다
//   ⑧ 브리핑 제목에는 접기 버튼/caret이 없다
//   ⑨ 375/768/1024 × Light/Dark 전부 동일하다
//
// 지표 종류·데이터·계산은 하나도 건드리지 않았다 - 표시 구조만 다룬다.
const { test, expect } = require('@playwright/test');

// 지표 10종 - 종류가 바뀌면(추가/삭제) 여기서 먼저 걸린다.
// [용어 정비] VIX 타일 이름만 'VIX(공포지수)' → 'VIX(변동성)'으로 바뀌었다(지표 종류·순서 무변경).
const MACRO_LABELS = ['VIX(변동성)', '원/달러', '美 10년물 금리', '금 시세', '달러인덱스',
  '코스피', '코스닥', 'S&P 500', '나스닥', '다우'];
const DETAIL_TITLES = ['📌 시장 종합 평가', '💰 내 포트폴리오 영향', '🔎 참고', '💡 상관관계 가이드'];

const TRANSITION = 900; // max-height 300ms + 여유

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

// 조상 clipping까지 반영한 실제 표시 높이. "자식 height > 0 이지만 부모가 잘라내서 안 보이는"
// 상태를 반드시 0으로 잡아내야 한다 - v234 회귀를 놓친 원인이 정확히 그 지점이었다.
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
    const guide = doc.getElementById('correlationGuide');
    return {
      tileLabels: tiles.map((t) => t.querySelector('div').textContent.trim()),
      // 타일 하나하나가 통째로 보이는지(일부만 걸쳐 보이는 것도 잡는다)
      tilesFullyVisible: tiles.filter((t) => visibleHeight(t) >= Math.round(t.getBoundingClientRect().height) - 1).length,
      gridVisibleH: byId('macroBriefingGrid'),
      diagnosisVisibleH: byId('macroBriefingDiagnosis'),
      diagnosisFullH: Math.round(doc.getElementById('macroBriefingDiagnosis').getBoundingClientRect().height),
      guideVisibleH: visibleHeight(guide),
      guideFullH: guide ? Math.round(guide.getBoundingClientRect().height) : null,
      pageOverflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
    };
  });
}

const clickDetails = async (page) => {
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
  expect(m.diagnosisVisibleH, '세부 내용은 기본으로 닫혀 있다').toBe(0);
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

/* ── ②③④ 세부 내용 토글 ────────────────────────────────────────────── */

test('C. 세부 내용을 열고-닫고-다시 열면 매번 실제로 보이고 사라진다', async ({ page }) => {
  await open(page);
  await seed(page);

  // ② 열기 - 부모에게 잘리지 않고 내용 전체가 보여야 한다.
  await clickDetails(page);
  let m = await measure(page);
  expect(m.diagnosisVisibleH, '세부 내용이 실제로 보인다(부모 clipping 없음)').toBeGreaterThan(0);
  expect(m.diagnosisVisibleH, '일부만 보이는 게 아니라 전체가 보인다').toBe(m.diagnosisFullH);
  expect(m.tilesFullyVisible, '세부 내용을 펼쳐도 지수 10개는 그대로 보인다').toBe(10);

  // ③ 닫기
  await clickDetails(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH, '두 번째 클릭으로 실제로 닫힌다').toBe(0);
  expect(m.tilesFullyVisible).toBe(10);

  // ④ 다시 열기 - v233에서 바로 이 세 번째 클릭이 다시 깨졌다.
  await clickDetails(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH, '세 번째 클릭으로 다시 실제로 보인다').toBe(m.diagnosisFullH);
  expect(m.diagnosisVisibleH).toBeGreaterThan(0);
});

/* ── ⑤ 재렌더 ───────────────────────────────────────────────────────── */

test('D. 매크로 재렌더 후에도 펼친 세부 내용이 그대로 보인다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDetails(page);

  // 5분 자동 갱신이 타는 경로와 같다 - diagnosis innerHTML이 통째로 다시 그려진다.
  await page.locator('body').evaluate(() => renderRiskSection());
  await page.waitForTimeout(TRANSITION);

  const m = await measure(page);
  expect(m.tilesFullyVisible, '재렌더 후에도 지수 10개는 보인다').toBe(10);
  expect(m.diagnosisVisibleH, '재렌더가 펼친 세부 내용을 되돌리거나 잘라내지 않는다').toBe(m.diagnosisFullH);
  expect(m.diagnosisVisibleH).toBeGreaterThan(0);

  // 재렌더 뒤에도 토글이 계속 동작한다(리스너 소실 없음).
  await clickDetails(page);
  expect((await measure(page)).diagnosisVisibleH).toBe(0);
});

/* ── ⑥ 탭 왕복 ──────────────────────────────────────────────────────── */

test('E. 다른 탭에 다녀와도 지수와 세부 내용 토글이 정상이다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDetails(page);

  await page.locator('[data-tab="investmentDetail"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="dashboard"]').click();
  await page.waitForTimeout(TRANSITION);

  let m = await measure(page);
  expect(m.tilesFullyVisible).toBe(10);
  // [v255 · PM 지시] 탭을 옮겼다 돌아오면 펼쳐 둔 영역은 접혀 있다(e2e/100 B-1) - 예전엔 펼친 채로 남았다.
  expect(m.diagnosisVisibleH, '복귀하면 접혀 있다').toBe(0);

  // 복귀 후 열고 닫기까지 동작하고, 열었을 때 잘리지 않는다(v234 회귀 방지 목적 그대로).
  await clickDetails(page);
  m = await measure(page);
  expect(m.diagnosisVisibleH, '복귀 후에도 세부 내용이 잘리지 않는다').toBe(m.diagnosisFullH);
  await clickDetails(page);
  expect((await measure(page)).diagnosisVisibleH).toBe(0);
});

/* ── ⑦ 세부 내용 네 항목 ───────────────────────────────────────────── */

test('F. 세부 내용을 펼치면 네 항목(상관관계 가이드 포함)이 별도 토글 없이 잘리지 않고 보인다', async ({ page }) => {
  await open(page);
  await seed(page);
  await clickDetails(page);

  const m = await measure(page);
  for (const title of DETAIL_TITLES) {
    await expect(page.locator('#macroBriefingDiagnosis')).toContainText(title);
  }
  expect(m.guideVisibleH, '상관관계 가이드가 실제로 보인다').toBeGreaterThan(0);
  expect(m.guideVisibleH, '상관관계 가이드가 부분적으로 잘리지 않는다').toBe(m.guideFullH);
  expect(m.diagnosisVisibleH, '세부 내용 전체가 보인다').toBe(m.diagnosisFullH);
  expect(m.tilesFullyVisible, '지수 10개도 그대로다').toBe(10);

  // 세부 내용 안에는 접기를 다시 두지 않는다.
  await expect(page.locator('#macroBriefingDiagnosis button')).toHaveCount(0);
  await expect(page.locator('#correlationGuideToggleBtn')).toHaveCount(0);
  await expect(page.locator('#macroBriefingDiagnosis')).not.toContainText('상관관계 가이드 보기');
});

/* ── ⑧ 브리핑 제목 구조 ────────────────────────────────────────────── */

test('G. 브리핑 제목에는 접기 버튼/caret이 없고, 접기는 「상세 현황 보기」(v253 전 「세부 내용 보기」) 하나뿐이다', async ({ page }) => {
  await open(page);
  await seed(page);

  const s = await page.locator('#macroBriefingSection').evaluate((sec) => {
    const h4 = sec.querySelector('h4');
    return {
      title: h4 ? h4.textContent.trim() : null,
      titleInsideButton: !!(h4 && h4.closest('button')),
      titleRowIcons: h4 ? h4.parentElement.querySelectorAll('svg, i').length : null,
      togglers: [...sec.querySelectorAll('[id$="ToggleBtn"]')].map((b) => b.id),
      detailsLabel: (sec.querySelector('#macroDiagnosisToggleBtn') || {}).textContent,
    };
  });
  expect(s.title).toBe('시장 현황 & 매크로 브리핑');
  expect(s.titleInsideButton, '제목은 버튼이 아니다(눌러서 접히지 않는다)').toBe(false);
  expect(s.titleRowIcons, '제목 줄에 caret이 없다').toBe(0);
  expect(s.togglers, '브리핑 안의 접기는 세부 내용 하나뿐이다').toEqual(['macroDiagnosisToggleBtn']);
  // [v253] 명칭 · 아이콘만 바뀌었다(📌 세부 내용 보기 → 📄 상세 현황 보기). 접기 동작은 아래 검사 그대로다.
  expect(s.detailsLabel.trim()).toBe('📄 상세 현황 보기');
  expect(s.detailsLabel).not.toContain('시장 해석 보기');
  await expect(page.locator('#macroBriefingToggleBtn')).toHaveCount(0);
  await expect(page.locator('#macroBriefingChevron')).toHaveCount(0);

  // 제목을 눌러도 지수 10개는 그대로 보인다.
  await page.locator('#macroBriefingSection h4').click();
  await page.waitForTimeout(TRANSITION);
  expect((await measure(page)).tilesFullyVisible).toBe(10);
});

/* ── ⑨ 375 / 768 / 1024 × Light / Dark ──────────────────────────────── */

for (const [w, h] of [[375, 812], [768, 1024], [1024, 768]]) {
  for (const dark of [true, false]) {
    test(`H. ${w}px ${dark ? 'Dark' : 'Light'} - 지수 기본 표시 · 세부 내용 열기/닫기가 실제로 동작한다`, async ({ page }) => {
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

      // 제목·세부 내용 버튼 줄바꿈 - 한 줄에 들어간다.
      const rows = await page.locator('#macroBriefingSection').evaluate((sec) => {
        const lineCount = (el) => {
          const cs = el.ownerDocument.defaultView.getComputedStyle(el);
          return Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight));
        };
        return { title: lineCount(sec.querySelector('h4')), details: lineCount(sec.querySelector('#macroDiagnosisToggleBtn span')) };
      });
      expect(rows, '제목과 「세부 내용 보기」가 줄바꿈되지 않는다').toEqual({ title: 1, details: 1 });

      await clickDetails(page);
      m = await measure(page);
      expect(m.diagnosisVisibleH, '세부 내용이 잘리지 않고 전부 보인다').toBe(m.diagnosisFullH);
      expect(m.diagnosisVisibleH).toBeGreaterThan(0);
      expect(m.guideVisibleH, '상관관계 가이드도 함께 보인다').toBe(m.guideFullH);
      expect(m.tilesFullyVisible).toBe(10);
      expect(m.pageOverflowX).toBe(false);

      await clickDetails(page);
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
