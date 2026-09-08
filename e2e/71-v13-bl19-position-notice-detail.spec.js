// E2E-71 [V1.3 BL-19] Correction-path 안내 강화(Option 1 — TEXT-ONLY).
//
// PM 승인 범위: assessPositionConsistency()(js/06, 무변경)가 이미 계산해 돌려주는
// ledgerQuantity/ledgerBuyPrice를 renderAssetDetailPositionNotice()(js/08)가 "현재 자산 vs 거래내역
// 기준" 대조 텍스트 + "거래내역 탭에서 확인해 주세요" 안내로만 보여준다. 새 버튼/링크/자동수정 없음 -
// e2e/52 F-UI의 "#assetDetailPositionNotice 안 button/a = 0" 정책을 그대로 유지해야 한다(이 파일에서도
// 별도로 재확인한다).
const { test, expect } = require('@playwright/test');

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof makeAsset === 'function');
}

function readNotice(page) {
  return page.locator('#assetDetailPositionNotice').evaluate((el) => ({
    hidden: el.classList.contains('hidden'),
    text: el.textContent.trim(),
    html: el.innerHTML,
    interactiveCount: el.querySelectorAll('button, a').length,
    paragraphFontSizes: [...el.querySelectorAll('p')].map((p) =>
      Math.round(parseFloat(p.ownerDocument.defaultView.getComputedStyle(p).fontSize)))
  }));
}

test('A. 정상 상태(값 일치)에서는 안내가 뜨지 않는다(기존 동작 무변경)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.transactions = [{ id: 'e71-ok-t1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'E71OK', name: 'E71정상종목', type: 'buy', quantity: 10, price: 1000, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    state.assets = [makeAsset({ ticker: 'E71OK', name: 'E71정상종목', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'ledger' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  expect((await readNotice(page)).hidden).toBe(true);
});

test('B. LEDGER_UNKNOWN(legacy 불일치) - 현재값/거래내역값 대조와 확인 경로 안내가 표시되고, 값이 실제 assessPositionConsistency 결과와 일치한다', async ({ page }) => {
  await open(page);
  const verdict = await page.evaluate(() => {
    // 현재 자산: 수량 50 / 매입단가 10,000원. 거래내역: 수량 47 / 매입단가 10,500원(47주*10,500원=493,500원 총원가).
    state.transactions = [{ id: 'e71-lu-t1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'E71LU', name: 'E71레거시불일치', type: 'buy', quantity: 47, price: 10500, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    state.assets = [makeAsset({ ticker: 'E71LU', name: 'E71레거시불일치', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 50, buyPrice: 10000, currentPrice: 10000, positionSource: undefined })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
    return assessPositionConsistency(state.assets[0]);
  });
  expect(verdict.status).toBe('LEDGER_UNKNOWN');
  expect(verdict.ledgerQuantity).toBe(47);
  expect(verdict.ledgerBuyPrice).toBe(10500);

  const notice = await readNotice(page);
  expect(notice.hidden).toBe(false);
  // 내부 상태 코드가 그대로 노출되지 않는다.
  expect(notice.text).not.toContain('LEDGER_UNKNOWN');
  // 현재 자산값(50 / 10,000)과 거래내역 기준값(47 / 10,500)이 각각 화면에 그대로 나타난다 -
  // 단순 문자열 존재가 아니라 verdict의 실제 값과 같은 숫자인지 확인한다.
  expect(notice.text).toContain('50');
  expect(notice.text).toContain('10,000');
  expect(notice.text).toContain(String(verdict.ledgerQuantity));
  expect(notice.text).toContain(verdict.ledgerBuyPrice.toLocaleString('ko-KR'));
  // 확인 경로 안내(거래내역 탭) - 버튼/링크가 아니라 텍스트로만.
  expect(notice.text).toContain('거래내역 탭');
  expect(notice.interactiveCount, '자동 해결/이동 버튼·링크를 추가하지 않는다').toBe(0);
});

test('C. MANUAL_WITH_TX - 양쪽 값 차이와 manual 정책 안내가 표시되고 자동수정 문구가 없다', async ({ page }) => {
  await open(page);
  const verdict = await page.evaluate(() => {
    state.transactions = [{ id: 'e71-mw-t1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'E71MW', name: 'E71수동불일치', type: 'buy', quantity: 40, price: 2500, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    state.assets = [makeAsset({ ticker: 'E71MW', name: 'E71수동불일치', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 1000, currentPrice: 1000, positionSource: 'manual' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
    return assessPositionConsistency(state.assets[0]);
  });
  expect(verdict.status).toBe('MANUAL_WITH_TX');
  expect(verdict.ledgerQuantity).toBe(40);
  expect(verdict.ledgerBuyPrice).toBe(2500);

  const notice = await readNotice(page);
  expect(notice.hidden).toBe(false);
  expect(notice.text).not.toContain('MANUAL_WITH_TX');
  expect(notice.text).toContain('10'); // 현재 수량
  expect(notice.text).toContain('1,000'); // 현재 매입단가
  expect(notice.text).toContain('40'); // 거래내역 기준 수량
  expect(notice.text).toContain('2,500'); // 거래내역 기준 매입단가
  expect(notice.text).toContain('직접 관리하는 자산'); // manual = SoT라는 사실 안내
  expect(notice.text).not.toMatch(/자동.*(수정|반영|적용)/); // 자동수정을 암시하는 문구가 없다
  expect(notice.interactiveCount).toBe(0);

  // manual 자산이므로 [수정]/[삭제] 버튼은 여전히 노출되어야 한다(BL-8 기존 정책, 이번 변경과 무관).
  const editHidden = await page.locator('#assetDetailEditBtn').evaluate((el) => el.classList.contains('hidden'));
  const deleteHidden = await page.locator('#assetDetailDeleteBtn').evaluate((el) => el.classList.contains('hidden'));
  expect({ editHidden, deleteHidden }).toEqual({ editHidden: false, deleteHidden: false });
});

test('D. LEDGER_WITHOUT_TX - 거래내역이 확인되지 않는다는 의미와 확인 경로만 안내하고, 수량 비교는 표시하지 않는다', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.transactions = []; // 매칭되는 거래가 아예 없음
    state.assets = [makeAsset({ ticker: 'E71LW', name: 'E71거래없음', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 5, buyPrice: 3000, currentPrice: 3000, positionSource: 'ledger' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  const notice = await readNotice(page);
  expect(notice.hidden).toBe(false);
  expect(notice.text).not.toContain('LEDGER_WITHOUT_TX');
  expect(notice.text).toContain('거래내역이 확인되지 않는');
  expect(notice.text).toContain('거래내역 탭');
  expect(notice.interactiveCount).toBe(0);
});

test('E. OWNER_UNASSIGNED 등 BL-19 범위 밖 상태는 기존 문구 그대로다(변경 없음)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    state.transactions = [];
    state.assets = [makeAsset({ ticker: '', name: 'E71소유자미정', owner: '', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 1000, currentPrice: 1000 })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  const notice = await readNotice(page);
  expect(notice.hidden).toBe(false);
  expect(notice.text).toContain('소유자가 지정되지 않았습니다');
  expect(notice.interactiveCount).toBe(0);
});

test('F. 모바일/다크모드에서도 레이아웃이 깨지지 않고 대조 텍스트 폰트가 14px 이상이다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.locator('html').evaluate((el) => el.classList.add('dark'));
  await page.evaluate(() => {
    state.transactions = [{ id: 'e71-mob-t1', date: '2026-01-01', owner: '신랑', accountType: '일반계좌', ticker: 'E71MOBILEMOBILEMOBILE', name: 'E71아주아주아주아주아주아주긴종목이름테스트용', type: 'buy', quantity: 47, price: 10500, currency: 'KRW', fee: 0, origin: 'initial', createdAt: 1, updatedAt: 1 }];
    state.assets = [makeAsset({ ticker: 'E71MOBILEMOBILEMOBILE', name: 'E71아주아주아주아주아주아주긴종목이름테스트용', owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내', quantity: 50, buyPrice: 10000, currentPrice: 10000, positionSource: undefined })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  const notice = await readNotice(page);
  expect(notice.hidden).toBe(false);
  notice.paragraphFontSizes.forEach((px) => expect(px, '12px 미만 금지 - 폰트를 줄여 해결하지 않는다').toBeGreaterThanOrEqual(14));
  const scrollWidth = await page.locator('body').evaluate((el) => el.scrollWidth);
  const clientWidth = await page.locator('body').evaluate((el) => el.clientWidth);
  expect(scrollWidth, '긴 종목명/긴 안내 텍스트로 가로 오버플로가 생기면 안 된다').toBeLessThanOrEqual(clientWidth + 1);
});
