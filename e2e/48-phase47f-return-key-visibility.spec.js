// E2E-48 Phase 47-F - 자산 상세 모달의 "장기 수익률 가정" 표시.
//
// [무엇을 보장하는가]
//  1) 화면에 보이는 기준과 실제 계산에 쓰이는 기준이 언제나 같다(화면 전용 판정 로직이 없다는 뜻).
//  2) 적용된 가정이 없는 자산(성장 0%)을 사용자가 앱 안에서 알 수 있다.
//  3) 문구가 사용자를 비난하거나 겁주지 않고, 0%를 "0% 수익률 전망"이라고 말하지 않는다.
//  4) 표시가 계산을 바꾸지 않는다.
//
// [작성 규칙] 이 저장소의 e2e 파일은 브라우저 전역(document/window)을 직접 쓰지 않는다
// (eslint.config.js의 e2e 설정에 browser globals가 없다) - 페이지 안 DOM은 항상 locator의
// evaluate로 요소를 넘겨받아 다루고, 그 요소의 ownerDocument로 나머지를 찾는다.
const { test, expect } = require('@playwright/test');

const BOX = '#assetDetailReturnAssumption';

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof describeAppliedReturnAssumption === 'function'
    && typeof openAssetDetailModal === 'function' && typeof getAssetProjectionRate === 'function');
}

// 자산 하나만 남기고 상세 모달을 연 뒤, 그 블록의 텍스트와 실제 계산값을 함께 읽어온다.
const openWith = (page, ticker, name, currency, override) =>
  page.locator(BOX).evaluate((box, [t, n, c, ov]) => {
    const a = makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: c,
      quantity: 10, buyPrice: 1000, currentPrice: 1200 });
    if (ov) a.rateMatchOverride = ov;
    state.assets = [a];
    openAssetDetailModal(a.id);
    return {
      hidden: box.classList.contains('hidden'),
      text: box.innerText.replace(/\s+/g, ' ').trim(),
      // 실제 계산 경로가 쓰는 값 - 화면과 비교하기 위한 기준점
      계산Key: getProjectionAssetGroupKey(a),
      계산수익률: getAssetProjectionRate(a, 'normal'),
      표시Key: describeAppliedReturnAssumption(a).appliedKey
    };
  }, [ticker, name, currency, override]);

// 테스트가 앱 상태를 남기지 않도록 매번 저장/복원한다(localStorage에는 쓰지 않는다).
let savedAssets = null;
test.beforeEach(async ({ page }) => {
  await boot(page);
  savedAssets = await page.evaluate(() => JSON.parse(JSON.stringify(state.assets)));
});
test.afterEach(async ({ page }) => {
  if (savedAssets) await page.evaluate((snap) => { state.assets = snap; }, savedAssets);
});

/* ─────────── A~C. 세 가지 상태가 각각 보인다 ─────────── */

test('A. 자동 판별된 정상 자산은 적용 기준과 방식이 보인다', async ({ page }) => {
  const got = await openWith(page, '069500.KS', 'KODEX 200', 'KRW', null);
  expect(got.hidden).toBe(false);
  expect(got.text).toContain('장기 수익률 가정');
  expect(got.text).toContain('적용 중인 기준');
  expect(got.text).toContain('KOSPI (국내 대표지수)');
  expect(got.text).toContain('적용 방식');
  expect(got.text).toContain('자동 판별');
  expect(got.text).toContain('적합한 장기 수익률 가정을 사용하고 있습니다');
});

test('B. 사용자가 지정한 기준은 "사용자 지정"으로 구분되어 보인다', async ({ page }) => {
  const got = await openWith(page, '140860.KQ', '파크시스템스', 'KRW', 'KOSDAQ');
  expect(got.text).toContain('KOSDAQ (코스닥 대표지수)');
  expect(got.text).toContain('사용자 지정');
  expect(got.text).toContain('사용자가 지정한 수익률 기준을 사용하고 있습니다');
  expect(got.text, '자동 판별로 잘못 표시되면 안 된다').not.toContain('자동 판별');
});

test('C. 가정을 찾지 못한 자산은 0% 계산 중이라는 사실이 보인다', async ({ page }) => {
  const got = await openWith(page, 'ZZETF', 'Unknown Global ETF', 'USD', null);
  expect(got.hidden).toBe(false);
  expect(got.text).toContain('적용된 기준 없음');
  expect(got.text).toContain('0%');
  expect(got.text).toContain('기준을 지정하면');
  expect(got.계산수익률, '실제로도 0%로 계산되고 있다').toBe(0);
  // 0%를 "0% 수익률 전망"이라고 말하지 않는다 - 가정 부재 상태라는 Phase 47-A 정책을 유지한다.
  expect(got.text).toContain('찾지 못해');
  expect(got.text).not.toMatch(/수익률이 0|0% 수익률|손실|위험합니다|잘못/);
});

/* ─────────── D. 표시와 계산의 일치 ─────────── */

test('D. 표시되는 기준과 실제 계산에 쓰이는 기준이 항상 같다', async ({ page }) => {
  const cases = [
    ['069500.KS', 'KODEX 200', 'KRW', null],
    ['140860.KQ', '파크시스템스', 'KRW', 'KOSDAQ'],
    ['114260.KS', 'KODEX 국고채3년', 'KRW', null],
    ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', null],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'USD', null],
    ['237370.KS', 'KODEX 코리아배당성장채권혼합', 'KRW', null],
    ['', '국고채 10년', 'KRW', null],
    ['', '현금', 'KRW', null],
    ['', '서울 아파트', 'KRW', null]
  ];
  for (const [t, n, c, ov] of cases) {
    const got = await openWith(page, t, n, c, ov);
    expect(got.표시Key, `${n} - 화면과 계산이 같은 키를 써야 한다`).toBe(got.계산Key);
    if (got.계산Key !== 'UNRESOLVED') {
      const label = await page.evaluate((k) => getRateMatchKeyDisplayLabel(k), got.계산Key);
      expect(got.text, `${n} - 라벨 표시`).toContain(label);
    } else {
      expect(got.text, `${n}`).toContain('적용된 기준 없음');
    }
  }
});

/* ─────────── E~F. Golden / 거래 없는 자산 ─────────── */

test('E. Golden 사용자의 대표매칭 지정이 그대로 표시된다', async ({ page }) => {
  const got = await page.locator(BOX).evaluate((box) => {
    const snapC = JSON.parse(JSON.stringify(state.projection.customScenarioRates || {}));
    try {
      state.projection.customScenarioRates = {
        '005930.KS': { label: '삼성전자', conservative: 6, normal: 8, optimistic: 11 },
        'BOND.STOCK': { label: '채권혼합', conservative: 3, normal: 6, optimistic: 9 }
      };
      return [['005930.KS', '삼성전자', '005930.KS'], ['237370.KS', 'KODEX 코리아배당성장채권혼합', 'BOND.STOCK']]
        .map(([t, n, key]) => {
          const a = makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: 'KRW', quantity: 1, buyPrice: 1000 });
          a.rateMatchOverride = key;
          state.assets = [a];
          openAssetDetailModal(a.id);
          return { n, text: box.innerText.replace(/\s+/g, ' ').trim(), rate: getAssetProjectionRate(a, 'normal') };
        });
    } finally { state.projection.customScenarioRates = snapC; }
  });
  expect(got[0].text).toContain('삼성전자');
  expect(got[0].text).toContain('사용자 지정');
  expect(got[0].rate, 'Golden 등록값 8%가 그대로 적용된다').toBe(8);
  expect(got[1].text).toContain('채권혼합');
  expect(got[1].rate).toBe(6);
});

test('F. 거래내역이 없는 자산(부동산/실물채권/원화현금)도 기준이 보인다', async ({ page }) => {
  const cases = [
    ['', '서울 아파트', 'KRW', '부동산'],
    ['', '국고채 10년', 'KRW', '채권'],
    ['', '현금', 'KRW', '현금']
  ];
  for (const [t, n, c, expectedLabel] of cases) {
    const got = await openWith(page, t, n, c, null);
    expect(got.hidden, `${n} - 블록이 보여야 한다`).toBe(false);
    expect(got.text, n).toContain(expectedLabel);
    expect(got.text, n).toContain('자동 판별');
  }
});

test('F-2. 같은 종목을 보유분마다 다르게 지정하면 그 사실을 알린다', async ({ page }) => {
  const got = await page.locator(BOX).evaluate((box) => {
    const mk = (owner, ov) => {
      const a = makeAsset({ ticker: '005930.KS', owner, accountType: '일반계좌', name: '삼성전자',
        currency: 'KRW', quantity: 1, buyPrice: 1000, currentPrice: 1000 });
      a.rateMatchOverride = ov;
      return a;
    };
    const read = (list) => {
      state.assets = list;
      openAssetDetailModalGroup(list.map((a) => Object.assign({}, a, calcRow(a))));
      return box.innerText.replace(/\s+/g, ' ').trim();
    };
    return { same: read([mk('신랑', 'KOSPI'), mk('와이프', 'KOSPI')]),
      diff: read([mk('신랑', 'KOSPI'), mk('와이프', 'KOSDAQ')]) };
  });
  expect(got.same).toContain('KOSPI (국내 대표지수)');
  expect(got.diff).toContain('보유분마다 적용 중인 기준이 서로 다릅니다');
  expect(got.diff, '아무 하나를 골라 보여주지 않는다').not.toContain('적용 방식');
});

/* ─────────── G~H. 375px / Dark Mode 가독성 ─────────── */

// [검증 순서 - 프로젝트 UX 정책] 375 Mobile Dark -> 375 Light -> Tablet -> Desktop.
for (const [w, label] of [[375, '375px'], [768, 'Tablet'], [1440, 'Desktop']]) {
for (const dark of [true, false]) {
  test(`G/H. ${label} ${dark ? 'Dark' : 'Light'} - 14px 이상이고 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await page.goto('/');
    await page.waitForFunction(() => typeof describeAppliedReturnAssumption === 'function');
    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    if (isDark !== dark) await page.locator('#darkModeBtn').click();

    const got = await page.locator(BOX).evaluate((box) => {
      const a = makeAsset({ ticker: 'ZZETF', owner: '신랑', accountType: '일반계좌',
        name: 'Unknown Global ETF', currency: 'USD', quantity: 1, buyPrice: 100, currentPrice: 100 });
      state.assets = [a];
      openAssetDetailModal(a.id);
      const win = box.ownerDocument.defaultView;
      const body = box.ownerDocument.body;
      const nodes = [box, ...box.querySelectorAll('h4, p, span, div')].filter((n) => n.textContent.trim());
      return {
        minFont: Math.min(...nodes.map((n) => parseFloat(win.getComputedStyle(n).fontSize))),
        clipped: box.scrollWidth - box.clientWidth,
        bodyOverflow: body.scrollWidth - body.clientWidth,
        visible: box.getBoundingClientRect().height > 0,
        // 라벨이 좁은 칸 안에서 두 줄로 접히지 않는지(모바일 가독성) - 모든 줄이 한 줄이어야 한다.
        maxLabelLines: Math.max(...[...box.querySelectorAll('span.block')].map((n) =>
          Math.round(n.getBoundingClientRect().height / parseFloat(win.getComputedStyle(n).lineHeight)))),
        // 색만으로 상태를 구분하지 않는다 - 아이콘/문구가 함께 있어야 한다
        hasMark: /⚠|✓|📝/.test(box.innerText)
      };
    });
    expect(got.visible).toBe(true);
    expect(got.minFont, '최소 글꼴 14px').toBeGreaterThanOrEqual(14);
    expect(got.clipped, '블록 가로 넘침').toBeLessThanOrEqual(1);
    expect(got.bodyOverflow, '페이지 가로 넘침').toBeLessThanOrEqual(1);
    expect(got.maxLabelLines, '라벨이 접히지 않는다').toBeLessThanOrEqual(1);
    expect(got.hasMark, '색 외에 아이콘으로도 상태를 구분한다').toBe(true);
  });
}
}

/* ─────────── I. 계산값 불변 ─────────── */

test('I. 표시 기능이 기존 수익률 계산값을 전혀 바꾸지 않는다', async ({ page }) => {
  const got = await page.evaluate((presets) => {
    const snap = JSON.parse(JSON.stringify(state.assets));
    try {
      return [
        ['069500.KS', 'KODEX 200', 'KRW', null], ['140860.KQ', '파크시스템스', 'KRW', 'KOSDAQ'],
        ['114260.KS', 'KODEX 국고채3년', 'KRW', null], ['QQQM', 'Invesco NASDAQ 100 ETF', 'USD', null],
        ['ZZETF', 'Unknown Global ETF', 'USD', null], ['', '서울 아파트', 'KRW', null]
      ].map(([t, n, c, ov]) => {
        const a = makeAsset({ ticker: t, owner: '신랑', accountType: '일반계좌', name: n, currency: c,
          quantity: 1, buyPrice: 1000, currentPrice: 1000 });
        if (ov) a.rateMatchOverride = ov;
        const before = presets.map((p) => getAssetProjectionRate(a, p));
        state.assets = [a];
        openAssetDetailModal(a.id);          // 표시 기능 실행
        describeAppliedReturnAssumption(a);  // 여러 번 불러도 부작용이 없어야 한다
        const after = presets.map((p) => getAssetProjectionRate(a, p));
        return { n, before, after, overrideAfter: a.rateMatchOverride === undefined ? null : a.rateMatchOverride,
          overrideBefore: ov || null };
      });
    } finally { state.assets = snap; }
  }, ['conservative', 'normal', 'optimistic']);
  for (const r of got) {
    expect(r.after, `${r.n} - 수익률 불변`).toEqual(r.before);
    expect(r.overrideAfter, `${r.n} - 표시가 override를 저장하지 않는다`).toBe(r.overrideBefore);
  }
  // 대표적인 값이 Phase 47-A 기준 그대로인지도 함께 고정한다.
  expect(got[0].after).toEqual([5, 7, 11]);    // KODEX 200 -> KOSPI
  expect(got[2].after).toEqual([3.5, 4, 5.5]); // 국고채 ETF -> BOND
  expect(got[4].after).toEqual([0, 0, 0]);     // UNRESOLVED
});
