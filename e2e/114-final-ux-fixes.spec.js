/* global document, getComputedStyle, window */
// E2E-114 [최종 마감 · PM 승인 2026-09-22] D2-Q1 · UX-1 · UX-3 · UX-6 · UX-7 · UX-8 · UX-9
//
// 최종 종합감사와 사용자 편의성 감사에서 PM이 승인한 수정만 고정한다.
// 계산 로직(Risk · MC · Return Key · Bond · Tracking Beta)은 바뀌지 않았고, 이 파일도 계산을 검사하지 않는다 -
// **사용자가 보는 것**(문구가 실제 상태와 맞는가 · 손가락으로 누를 수 있는가 · 줄이 정렬되는가)만 본다.
//
// [실제 사용자 데이터 미사용] 전부 ZZ 합성값이다.
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof switchTab === 'function' && typeof makeAsset === 'function');
}

/** 국내주(직접관리) · 코스닥주(원장 미등재) · 미국 채권 ETF가 섞인 합성 포트폴리오. */
async function seed(page) {
  await page.evaluate(() => {
    state.assets = []; state.transactions = []; state.bondPositions = [];
    const mk = (o) => state.assets.push(makeAsset(Object.assign({ owner: '신랑', accountType: '일반계좌', currency: 'KRW', isDomestic: '국내' }, o)));
    mk({ ticker: '005930.KS', name: 'ZZ 국내대형주', category: '주식', quantity: 50, buyPrice: 70000, currentPrice: 82000 });
    mk({ ticker: '247540.KQ', name: 'ZZ 코스닥주', category: '주식', quantity: 20, buyPrice: 300000, currentPrice: 260000 });
    mk({ ticker: 'TLT', name: 'ZZ 미국장기국채 ETF', category: 'ETF', isDomestic: '해외', currency: 'USD', quantity: 100, buyPrice: 90, currentPrice: 88 });
    state.assets[0].positionSource = 'manual';   // 자산관리 화면에서 직접 관리하는 자산
    persistAssets(); persistTransactions(); persistBondPositions();
    renderAll();
  });
}

/* ══ D2-Q1 · UX-8③ — 문구가 실제 계산 상태와 일치한다 ════════════════════ */

test('F-1 채권형 ETF는 시장 베타에서 빠지고, 화면이 그 사유를 그대로 말한다', async ({ page }) => {
  await boot(page);
  await seed(page);
  const r = await page.evaluate(async () => {
    const m = await computeAdvancedRiskMetrics();
    const h = (m.holdings || []).find((x) => x.ticker === 'TLT');
    return {
      benchmarkKey: h ? h.benchmarkKey : 'no-holding',
      source: h ? h.benchmarkSource : null,
      beta: h ? h.beta : null,
      note: betaUnavailableReasonsNoteHtml(m).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    };
  });
  expect(r.benchmarkKey).toBeNull();
  expect(r.source).toBe('bondAssetClass');
  expect(r.beta).toBeNull();
  // "확정하지 못했다"가 아니라 "대상이 아니다"라고 말해야 한다.
  expect(r.note).toContain('채권형 상품이라 주식 시장위험 집계에서 제외했습니다');
  /* [기대값 갱신 · §53-2 · v267] 이 테스트가 보는 것은 "채권은 대상이 아니다"와 "확정하지 못했다"가
   * 섞이지 않는다는 것이다. 자동화 이후 원장에 없는 코스닥 종목은 공식 종목 마스터의 증권그룹(ST)으로
   * 코스닥 지수를 받게 됐고, 남은 사유는 지수 가격 자료 쪽이다 - 사유 문구가 달라졌을 뿐 구분은 그대로다.
   * 그래서 특정 문구를 고정하지 않고 "채권 사유와 다른 사유가 함께 표시된다"를 고정한다. */
  const rows = r.note.split("ZZ ").filter((x) => x.trim());
  const bondRows = rows.filter((x) => x.includes("채권형 상품이라"));
  expect(bondRows).toHaveLength(1);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.some((x) => !x.includes("채권형 상품이라"))).toBe(true);
});

test('F-2 「기초지수 추적 민감도」 설명이 실제 집계 대상과 일치한다', async ({ page }) => {
  await boot(page);
  await seed(page);
  /* [안정화] page.evaluate 안에서 await을 걸면 병렬 실행 중 promise가 회수될 수 있다 -
   * 계산과 렌더를 나눠 호출하고, 결과가 state에 들어온 뒤 팝업을 연다. */
  await page.evaluate(() => computeAdvancedRiskMetrics().then((m) => { state.advancedRiskMetrics = m; }));
  await page.waitForFunction(() => !!state.advancedRiskMetrics);
  await page.evaluate(() => { renderRiskDiagnosisSummary(); openRiskDetailModal(); });
  await expect(page.locator('#riskDetailModalBody')).toBeVisible();
  // 추적 민감도 줄이 실제로 그려진 뒤에 툴팁을 읽는다(비동기 렌더 · 병렬 실행 안정화).
  await expect(page.locator('#riskDetailModalBody')).toContainText('기초지수 추적 민감도');
  const tip = await page.evaluate(() => [...document.querySelectorAll('#riskDetailModalBody [data-info-tip]')]
    .map((e) => e.getAttribute('data-info-tip')).find((s) => /따라갔는지/.test(s || '')) || '');
  // 예전 문구는 사실과 달랐다 - 개별 주식도 실제로는 집계에 들어간다.
  expect(tip).not.toContain('개별 주식은 공식 기초지수가 없어 이 값에 들어가지 않습니다');
  expect(tip).toContain('개별 주식도 이 값에 함께 들어갑니다');
});

/* ══ UX-3 — 거래는 저장하되, 반영되지 않았다는 사실을 그 자리에서 알린다 ══ */

test('F-3 직접관리 자산에 거래를 저장하면 수량은 지키고 그 사실을 바로 알려준다', async ({ page }) => {
  await boot(page);
  await seed(page);
  const r = await page.evaluate(async () => {
    const toasts = [];
    const real = window.showToast;
    window.showToast = (m, t) => toasts.push({ m: String(m), t });
    switchTab('transactions');
    await new Promise((res) => setTimeout(res, 300));
    document.getElementById('addTransactionBtn').click();
    await new Promise((res) => setTimeout(res, 300));
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('tx_date', '2026-09-22'); set('tx_type', 'buy'); set('tx_owner', '신랑'); set('tx_accountType', '일반계좌');
    set('tx_assetClass', '주식');
    await new Promise((res) => setTimeout(res, 200));
    document.getElementById('tx_ticker').value = '005930.KS';
    set('tx_name', 'ZZ 국내대형주'); set('tx_quantity', '10'); set('tx_price', '90000'); set('tx_currency', 'KRW'); set('tx_fee', '0');
    await new Promise((res) => setTimeout(res, 200));
    document.getElementById('transactionForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((res) => setTimeout(res, 800));
    window.showToast = real;
    const a = state.assets.find((x) => x.ticker === '005930.KS');
    return { toasts, quantity: a ? a.quantity : null, saved: state.transactions.some((t) => t.ticker === '005930.KS') };
  });
  expect(r.saved).toBe(true);                 // 거래는 저장된다
  expect(r.quantity).toBe(50);                // 사용자가 직접 넣은 수량은 지켜진다(정책 무변경)
  expect(r.toasts.some((t) => t.m.includes('거래 내역을 저장했습니다'))).toBe(true);
  const warn = r.toasts.find((t) => t.t === 'warning');
  expect(warn).toBeTruthy();
  expect(warn.m).toContain('보유 수량이 거래내역으로 바뀌지 않습니다');
  expect(warn.m).toContain('현재 자산 vs 거래내역');
});

/* ══ UX-1 — 미래 예측이 막히면 무엇을 해야 하는지 말한다 ═════════════════ */

test('F-4 자산이 없으면 Monte Carlo 실패 안내가 구체적이고 개발 용어를 쓰지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { state.assets = []; state.transactions = []; persistAssets(); persistTransactions(); renderAll(); });
  const r = await page.evaluate(async () => {
    const toasts = [];
    const real = window.showToast;
    window.showToast = (m) => toasts.push(String(m));
    switchTab('rebalance');
    await new Promise((res) => setTimeout(res, 400));
    const sub = [...document.querySelectorAll('button')].find((b) => /^미래 예측/.test((b.textContent || '').trim()) && b.offsetParent);
    if (sub) sub.click();
    await new Promise((res) => setTimeout(res, 500));
    const btn = document.getElementById('mcRunBtn');
    if (btn) btn.click();
    await new Promise((res) => setTimeout(res, 2500));
    window.showToast = real;
    return { toasts, status: (document.getElementById('mcStatusText') || {}).textContent || '' };
  });
  const all = r.toasts.join(' ') + ' ' + r.status;
  // 예전에는 "입력값을 확인해주세요."만 나와 사용자가 다음 행동을 알 수 없었다.
  expect(all).toContain('미래 예측에 넣을 자산이 없습니다');
  expect(all).toMatch(/등록하고|다시 실행/);
  // 내부 용어는 그대로 노출하지 않는다.
  expect(all).not.toMatch(/instruments|correlationMatrix|muAnnual|sigmaAnnual|positionSource|assetOrder/);
});

/* ══ UX-7 — 총자산 발견성 · 반올림 0% ══════════════════════════════════ */

test('F-5 첫 화면에서 부동산 포함 총자산을 볼 수 있고, 반올림 0%를 사실대로 말한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.assets = []; state.transactions = [];
    state.assets.push(makeAsset({ ticker: '005930.KS', name: 'ZZ 국내주', owner: '신랑', accountType: '일반계좌', category: '주식', currency: 'KRW', isDomestic: '국내', quantity: 10, buyPrice: 70000, currentPrice: 70000, dailyChangeRate: 0.0001 }));
    state.assets.push(makeAsset({ ticker: '', name: 'ZZ 아파트', owner: '신랑', accountType: '일반계좌', category: '부동산', currency: 'KRW', isDomestic: '국내', quantity: 1, buyPrice: 500000000, currentPrice: 620000000 }));
    persistAssets(); renderAll();
  });
  const fin = await page.locator('#kpiFinancialValueInline').innerText();
  const tot = await page.locator('#kpiTotalValueInline').innerText();
  expect(fin).toMatch(/원$/);
  expect(tot).toMatch(/원$/);
  // 부동산이 포함된 총자산이 금융자산보다 크다(같은 숫자를 두 번 보여주지 않는다).
  const n = (s) => Number(String(s).replace(/[^0-9]/g, ''));
  expect(n(tot)).toBeGreaterThan(n(fin));
  // 어느 탭에 전체 금액이 있는지도 그 자리에서 알려준다.
  const line = page.locator('#kpiTotalValueInline').locator('xpath=ancestor::p[1]');
  await expect(line).toContainText('부동산 포함 총자산');
  await expect(line).toContainText('총자산현황');
});

/* ══ UX-6 · UX-8① — 터치 영역과 줄 정렬 ═══════════════════════════════ */

for (const vp of [{ w: 375, h: 812 }, { w: 390, h: 844 }]) {
  for (const theme of ['Light', 'Dark']) {
    test(`F-6 (${vp.w} ${theme}) 누를 수 있는 요소의 세로 터치 영역이 44px 이상이고 가로로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await boot(page);
      await seed(page);
      await page.evaluate((t) => { document.documentElement.classList.toggle('dark', t === 'Dark'); }, theme);
      const r = await page.evaluate(async () => {
        const hit = (e) => {
          const rect = e.getBoundingClientRect();
          const cs = getComputedStyle(e, '::after');
          return { w: Math.max(rect.width, parseFloat(cs.width) || 0), h: Math.max(rect.height, parseFloat(cs.height) || 0) };
        };
        const bad = [];
        let overflow = 0;
        for (const tab of ['dashboard', 'investmentDetail', 'transactions', 'rebalance']) {
          switchTab(tab);
          await new Promise((res) => setTimeout(res, 700));
          overflow = Math.max(overflow, document.documentElement.scrollWidth - document.documentElement.clientWidth);
          [...document.querySelectorAll('button,a,select,[role=button]')].filter((e) => e.offsetParent).forEach((e) => {
            const s = hit(e);
            /* 세로 44px를 기준으로 본다. 가로는 버튼 폭 그대로 둔다 - 아이콘보다 넓히면
             * 이 프로젝트가 지키는 "가로 넘침 0" 계약(e2e 91 · 92 · 93 · 103 · 111)이 깨진다. */
            if (s.h < 44) bad.push({ tab, id: e.id, txt: (e.textContent || '').trim().slice(0, 18), h: Math.round(s.h), w: Math.round(s.w) });
          });
        }
        return { bad, overflow };
      });
      expect(r.overflow).toBeLessThanOrEqual(1);
      expect(r.bad, JSON.stringify(r.bad.slice(0, 5))).toHaveLength(0);
    });
  }
}

test('F-7 (375) 아이콘으로 시작하는 안내문은 둘째 줄이 본문 시작점에 맞는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  await seed(page);
  await page.evaluate(async () => { state.advancedRiskMetrics = await computeAdvancedRiskMetrics(); renderRiskDiagnosisSummary(); openRiskDetailModal(); });
  await expect(page.locator('#riskDetailModalBody')).toBeVisible();
  // 안내 문단이 실제로 그려진 뒤에 재야 한다(비동기 렌더 · 병렬 실행에서 흔들리지 않도록).
  await expect(page.locator('#riskDetailModalBody p.flex.items-start').first()).toBeVisible();
  const r = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('#riskDetailModalBody p.flex.items-start').forEach((p) => {
      const body = p.children[1];
      if (!body) return;
      const range = document.createRange();
      range.selectNodeContents(body);
      const rects = [...range.getClientRects()].filter((x) => x.width > 2 && x.height > 4);
      if (rects.length < 2) return;
      // 본문 span 안에서 첫 줄과 둘째 줄의 왼쪽 시작점이 같아야 한다(아이콘 아래로 돌아가지 않는다).
      rows.push({ icon: (p.children[0].textContent || '').trim(), diff: Math.round(rects[1].left - rects[0].left) });
    });
    return rows;
  });
  expect(r.length).toBeGreaterThan(0);
  // 아이콘 폭(약 20~24px)만큼 왼쪽으로 밀리는 일이 없어야 한다.
  const pushedBack = r.filter((x) => x.diff < -2);
  expect(pushedBack, JSON.stringify(pushedBack)).toHaveLength(0);
});

/* ══ T-2 · A-3 · T-3 · A-2 — 팝업 잔여 수정 (PM 승인 2026-09-22) ═══════ */

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  test(`F-8 (${vp.w}) 두 팝업의 닫기 버튼이 44×44이고 실제로 닫힌다`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await boot(page);
    // 거래등록 팝업
    await page.evaluate(() => { switchTab('transactions'); });
    await page.locator('#addTransactionBtn').click();
    await expect(page.locator('#transactionModal')).toBeVisible();
    const txBox = await page.locator('#closeTxModalBtn').boundingBox();
    expect(Math.round(txBox.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(txBox.height)).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#closeTxModalBtn')).toHaveAttribute('aria-label', '닫기');
    await page.locator('#closeTxModalBtn').click();
    await expect(page.locator('#transactionModal')).toBeHidden();

    // 최초 자산등록 팝업
    await page.evaluate(() => { document.getElementById('systemManagementModal').classList.remove('hidden'); });
    await page.locator('#addAssetBtn').click();
    await expect(page.locator('#assetModal')).toBeVisible();
    const asBox = await page.locator('#closeModalBtn').boundingBox();
    expect(Math.round(asBox.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(asBox.height)).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#closeModalBtn')).toHaveAttribute('aria-label', '닫기');
    // <form> 안에 있는 버튼이라 type=button이어야 엔터/클릭이 저장으로 새지 않는다.
    await expect(page.locator('#closeModalBtn')).toHaveAttribute('type', 'button');
    await page.locator('#closeModalBtn').click();
    await expect(page.locator('#assetModal')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('F-9 거래등록 저장 버튼을 식별자로 집을 수 있고 저장 동작은 그대로다', async ({ page }) => {
  await boot(page);
  await seed(page);
  await page.evaluate(() => { switchTab('transactions'); });
  await page.locator('#addTransactionBtn').click();
  const btn = page.locator('#txFormSubmitBtn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('저장');
  await expect(btn).toHaveAttribute('type', 'submit');
  await expect(btn).toHaveAttribute('aria-label', '거래 내역 저장');
  // 이 버튼으로 실제 저장이 된다(동작 무변경 확인).
  const before = await page.evaluate(() => state.transactions.length);
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('tx_date', '2026-09-22'); set('tx_owner', '신랑'); set('tx_accountType', 'ZZ신규계좌');
    set('tx_assetClass', '주식'); set('tx_name', 'ZZ 신규종목'); set('tx_quantity', '5'); set('tx_price', '1000');
  });
  await btn.click();
  await expect(page.locator('#transactionModal')).toBeHidden();
  expect(await page.evaluate(() => state.transactions.length)).toBe(before + 1);
});

test('F-10 최초 자산등록 안내가 번호(①~④)의 뜻을 밝힌다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { document.getElementById('systemManagementModal').classList.remove('hidden'); });
  await page.locator('#addAssetBtn').click();
  await expect(page.locator('#assetModal')).toBeVisible();
  const body = (await page.locator('#assetModal').innerText()).replace(/\s+/g, ' ');
  // 번호는 "직접 입력해야 하는 칸"을 가리킨다는 사실이 화면에 있어야 한다.
  expect(body).toContain('①~④');
  expect(body).toMatch(/직접 입력/);
  // 번호가 붙은 네 칸은 그대로다(번호 체계만 정리 · 문구 의미 변경 없음).
  ['① 소유자', '② 계좌구분', '③ 수량/좌수', '④ 매수단가'].forEach((s) => expect(body).toContain(s));
});
