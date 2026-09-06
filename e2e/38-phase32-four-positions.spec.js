// E2E-38 Phase 32 - 포트폴리오 4개 포지션(코어자산/미드필더/공격수/수비수) 복원 상시 회귀.
//
// [핵심 계약]
//  1) 엑셀/입력의 '코어자산'은 core, '미드필더'는 midfielder로 저장된다. 다시는 core_mid로 합치지 않는다.
//  2) 이미 저장된 legacy 'core_mid'는 그대로 보존한다 - 코어/미드필더로 자동 분해하지 않는다
//     (합쳐질 때 원래 정보가 사라졌으므로 코드가 복원할 수 없다. 사용자 선택이나 엑셀 재업로드로만 바뀐다).
//  3) 신규 선택 목록에는 정식 4개만 나온다. legacy 항목은 그 값이 이미 저장돼 있을 때만 덧붙는다
//     (목록에 없으면 select가 조용히 빈칸이 되어 저장 시 기존 포지션이 날아간다).
//  4) role은 표시/집계 전용이다 - 미래예측·Monte Carlo 계산에 절대 들어가지 않는다.
//
// [사용자 실데이터 미포함] Golden Reference의 실제 종목명은 이 파일에 넣지 않는다. 대신 Golden과
// 동일한 4개 포지션 분포(공격수 10 / 미드필더 6 / 코어자산 6 / 수비수 4 = 26)를 테스트 전용 이름으로
// 재현해 구조를 고정한다. 실제 Golden 파일 검증은 릴리스 시 별도 수동 확인으로 수행한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

// Golden과 같은 분포(10/6/6/4)를 테스트 전용 이름으로 재현한다.
const GOLDEN_SHAPE = [
  ...Array.from({ length: 10 }, (_, i) => ({ name: `E2E38_공격_${i + 1}`, role: '공격수', key: 'attacker' })),
  ...Array.from({ length: 6 }, (_, i) => ({ name: `E2E38_미드_${i + 1}`, role: '미드필더', key: 'midfielder' })),
  ...Array.from({ length: 6 }, (_, i) => ({ name: `E2E38_코어_${i + 1}`, role: '코어자산', key: 'core' })),
  ...Array.from({ length: 4 }, (_, i) => ({ name: `E2E38_수비_${i + 1}`, role: '수비수', key: 'defender' }))
];

async function seed(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');
  await page.evaluate(() => {
    state.assets = [];
    state.transactions = [];
    persistAssets();
    persistTransactions();
  });
}

const parseRole = (page, raw) => page.evaluate((raw) => parseAssetRoleInput(raw), raw);

/* ------------------------------------------------- Test A~E: 입력 변환 */

test('A. "코어자산" 입력 → core', async ({ page }) => {
  await seed(page);
  expect(await parseRole(page, '코어자산')).toBe('core');
  expect(await parseRole(page, '코어')).toBe('core');   // 포트폴리오 계획 파일 표기
  expect(await parseRole(page, 'core')).toBe('core');
});

test('B. "미드필더" 입력 → midfielder', async ({ page }) => {
  await seed(page);
  expect(await parseRole(page, '미드필더')).toBe('midfielder');
  expect(await parseRole(page, 'midfielder')).toBe('midfielder');
});

test('C. "공격수" 입력 → attacker', async ({ page }) => {
  await seed(page);
  expect(await parseRole(page, '공격수')).toBe('attacker');
  expect(await parseRole(page, 'attacker')).toBe('attacker');
});

test('D. "수비수" 입력 → defender', async ({ page }) => {
  await seed(page);
  expect(await parseRole(page, '수비수')).toBe('defender');
  expect(await parseRole(page, 'defender')).toBe('defender');
});

test('E. legacy "core_mid"는 그대로 보존된다(코어/미드필더로 자동 분해 금지)', async ({ page }) => {
  await seed(page);
  expect(await parseRole(page, 'core_mid')).toBe('core_mid');
  expect(await parseRole(page, '코어미드필더')).toBe('core_mid');
  // 이미 저장된 자산의 legacy 값도 로드/저장을 거쳐 그대로 남는다.
  const kept = await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E38_레거시', owner: '신랑', accountType: '일반계좌',
      quantity: 1, buyPrice: 1000, currency: 'KRW', role: 'core_mid' })];
    persistAssets();
    loadState();
    const a = state.assets.find((x) => x.name === 'E2E38_레거시');
    return a && a.role;
  });
  expect(kept).toBe('core_mid');
});

test('E-2. 정식 선택 목록에는 legacy가 없고, 저장된 값이 legacy일 때만 항목이 붙는다', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(() => ({
    정식: assetRoleSelectOptionsHtml('', '미지정'),
    레거시선택됨: assetRoleSelectOptionsHtml('core_mid', '미지정'),
    옵션값: ASSET_ROLE_OPTIONS.map((o) => o.value)
  }));
  expect(result.옵션값).toEqual(['attacker', 'core', 'midfielder', 'defender']);
  expect(result.정식).not.toContain('core_mid');       // 신규 선택 유도 안 함
  expect(result.레거시선택됨).toContain('core_mid');    // 기존 값은 사라지지 않음
  expect(result.레거시선택됨).toContain('구분 필요');
});

/* ------------------------------------------------- Test F: 기존 role 보호 (Phase 30 회귀 방지) */

test('F. 신규 거래를 추가해도 기존 자산의 role이 유지된다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E38_기존자산', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currency: 'KRW', role: 'core' })];
    persistAssets();
  });
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#tx_name').fill('E2E38_기존자산');
  await page.locator('#tx_quantity').fill('5');
  await page.locator('#tx_price').fill('1100');
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const role = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E38_기존자산');
    return a && a.role;
  });
  expect(role).toBe('core');
});

test('F-2. legacy core_mid 자산도 신규 거래로 지워지지 않는다', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E38_레거시보호', owner: '신랑', accountType: '일반계좌',
      quantity: 10, buyPrice: 1000, currency: 'KRW', role: 'core_mid' })];
    persistAssets();
  });
  await page.getByText('거래내역', { exact: true }).click();
  await page.locator('#addTransactionBtn').click();
  await page.locator('#tx_owner').selectOption('신랑');
  await page.locator('#tx_accountType').fill('일반계좌');
  await page.locator('#tx_manualEntryToggle').check();
  await page.locator('#tx_name').fill('E2E38_레거시보호');
  await page.locator('#tx_quantity').fill('5');
  await page.locator('#tx_price').fill('1100');
  await page.locator('#transactionForm button[type="submit"]').click();
  await page.waitForTimeout(500);
  const role = await page.evaluate(() => {
    const a = state.assets.find((x) => x.name === 'E2E38_레거시보호');
    return a && a.role;
  });
  expect(role).toBe('core_mid');
});

/* ------------------------------------------------- Test G: Excel roundtrip */

test('G. Excel export → import roundtrip에서 4개 포지션이 그대로 보존된다(26건 분포 고정)', async ({ page }) => {
  // 덮어쓰기 confirm()을 수락해야 실제로 import가 실행된다(자동 dismiss면 조용히 취소됨).
  page.on('dialog', (d) => d.accept());
  await seed(page);
  await page.evaluate((shape) => {
    state.assets = shape.map((r, i) => makeAsset({
      name: r.name, owner: i % 2 === 0 ? '신랑' : '와이프', accountType: '일반계좌',
      quantity: 1, buyPrice: 1000000 + i, currentPrice: 1000000 + i, currency: 'KRW', role: r.key
    }));
    persistAssets();
  }, GOLDEN_SHAPE);

  const before = await page.evaluate(() => {
    const c = {};
    state.assets.forEach((a) => { c[a.role || '(미지정)'] = (c[a.role || '(미지정)'] || 0) + 1; });
    return { counts: c, total: state.assets.length };
  });
  expect(before.counts).toEqual({ attacker: 10, midfielder: 6, core: 6, defender: 4 });

  // 실제 [엑셀 내보내기] → 실제 [엑셀 업로드](덮어쓰기)
  await page.evaluate(() => openSystemManagementModal());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  const filePath = path.join(os.tmpdir(), `e2e38-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  await download.saveAs(filePath);
  await page.locator('#excelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  fs.unlinkSync(filePath);

  const after = await page.evaluate(() => {
    const c = {};
    state.assets.forEach((a) => { c[a.role || '(미지정)'] = (c[a.role || '(미지정)'] || 0) + 1; });
    const byName = {};
    state.assets.forEach((a) => { byName[a.name] = a.role; });
    return { counts: c, total: state.assets.length, byName };
  });
  expect(after.counts).toEqual({ attacker: 10, midfielder: 6, core: 6, defender: 4 });
  expect(after.total).toBe(26);
  // 자산 하나하나가 원래 포지션 그대로인지 26/26 확인
  const mismatched = GOLDEN_SHAPE.filter((r) => after.byName[r.name] !== r.key);
  expect(mismatched.map((r) => r.name)).toEqual([]);
});

test('G-2. legacy core_mid가 든 자산도 roundtrip에서 추정 없이 그대로 남는다', async ({ page }) => {
  // 덮어쓰기 confirm()을 수락해야 실제로 import가 실행된다(자동 dismiss면 조용히 취소됨).
  page.on('dialog', (d) => d.accept());
  await seed(page);
  await page.evaluate(() => {
    state.assets = [
      makeAsset({ name: 'E2E38_RT레거시', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW', role: 'core_mid' }),
      makeAsset({ name: 'E2E38_RT코어', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1000000, currentPrice: 1000000, currency: 'KRW', role: 'core' })
    ];
    persistAssets();
    openSystemManagementModal();
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportExcelBtn').click()
  ]);
  const filePath = path.join(os.tmpdir(), `e2e38b-${Date.now()}.xlsx`);
  await download.saveAs(filePath);
  await page.locator('#excelFileInput').setInputFiles(filePath);
  await expect(page.locator('#importChoiceModal')).toBeVisible();
  await page.locator('#importChoiceOverwriteBtn').click();
  await page.waitForTimeout(800);
  fs.unlinkSync(filePath);
  const roles = await page.evaluate(() => {
    const m = {};
    state.assets.forEach((a) => { m[a.name] = a.role; });
    return m;
  });
  expect(roles['E2E38_RT레거시']).toBe('core_mid'); // core/midfielder로 추정하지 않는다
  expect(roles['E2E38_RT코어']).toBe('core');
});

/* ------------------------------------------------- 집계 + 계산 격리 */

test('H. 포지션 집계가 4개를 독립 항목으로 산출한다(코어와 미드필더가 합쳐지지 않는다)', async ({ page }) => {
  await seed(page);
  const weights = await page.evaluate(() => {
    state.rebalance['신랑'] = {
      updatedAt: Date.now(), domestic: { '국내': 100, '해외': 0 },
      targets: { '국내': [
        { type: 'namedHolding', name: 'E2E38_코어T', label: 'E2E38_코어T', pct: 40, role: 'core' },
        { type: 'namedHolding', name: 'E2E38_미드T', label: 'E2E38_미드T', pct: 30, role: 'midfielder' },
        { type: 'namedHolding', name: 'E2E38_공격T', label: 'E2E38_공격T', pct: 20, role: 'attacker' },
        { type: 'namedHolding', name: 'E2E38_수비T', label: 'E2E38_수비T', pct: 10, role: 'defender' }
      ], '해외': [] }
    };
    persistRebalance();
    return computeOwnerTargetRoleWeights('신랑');
  });
  expect(weights.core).toBeCloseTo(0.4, 6);
  expect(weights.midfielder).toBeCloseTo(0.3, 6);
  expect(weights.attacker).toBeCloseTo(0.2, 6);
  expect(weights.defender).toBeCloseTo(0.1, 6);
  expect(weights.core_mid).toBeCloseTo(0, 6); // legacy 키는 존재하되 0
});

test('I. role을 바꿔도 결정론 예측/Monte Carlo 결과가 변하지 않는다(계산 격리 고정)', async ({ page }) => {
  await seed(page);
  const measure = () => page.evaluate(async () => {
    const target = { type: 'namedHolding', name: 'E2E38_채권자산', label: 'E2E38_채권자산', owner: '신랑' };
    const out = await buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑' });
    const inst = (out.instruments || []).find((i) => i.key && i.key.includes('E2E38_채권자산'));
    return { rate: getTargetProjectionRate(target, 'normal', '국내'), muAnnual: inst ? inst.muAnnual : null, errors: out.errors };
  });
  await page.evaluate(() => {
    state.assets = [makeAsset({ name: 'E2E38_채권자산', category: '채권', owner: '신랑', accountType: '일반계좌',
      isDomestic: '국내', quantity: 1, buyPrice: 300000000, currentPrice: 300000000, currency: 'KRW', role: 'core' })];
    persistAssets();
    state.rebalance['신랑'] = {
      updatedAt: Date.now(), domestic: { '국내': 100, '해외': 0 },
      targets: { '국내': [{ type: 'namedHolding', name: 'E2E38_채권자산', label: 'E2E38_채권자산', pct: 100, role: 'core' }], '해외': [] }
    };
    persistRebalance();
  });
  const before = await measure();
  expect(before.errors).toEqual([]);
  await page.evaluate(() => {
    state.assets[0].role = 'attacker';
    state.rebalance['신랑'].targets['국내'][0].role = 'attacker';
    persistAssets(); persistRebalance();
  });
  const after = await measure();
  expect(after.rate).toBeCloseTo(before.rate, 10);
  expect(after.muAnnual).toBeCloseTo(before.muAnnual, 10);
});

/* ------------------------------------------------- 모바일 / Dark */

for (const w of [375, 768]) {
  for (const dark of [true, false]) {
    test(`${w}px ${dark ? 'Dark' : 'Light'} - 4개 포지션이 14px 이상으로 모두 보이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 812 });
      await seed(page);
      const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('#darkModeBtn').click();
      await page.evaluate(() => {
        state.assets = [makeAsset({ name: 'E2E38_뷰포트', owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 100000000, currentPrice: 100000000, currency: 'KRW', role: 'core' })];
        persistAssets();
        state.rebalance['신랑'] = {
          updatedAt: Date.now(), domestic: { '국내': 100, '해외': 0 },
          targets: { '국내': [
            { type: 'namedHolding', name: 'E2E38_뷰포트', label: 'E2E38_뷰포트', pct: 40, role: 'core' },
            { type: 'namedHolding', name: 'E2E38_뷰포트2', label: 'E2E38_뷰포트2', pct: 30, role: 'midfielder' },
            { type: 'namedHolding', name: 'E2E38_뷰포트3', label: 'E2E38_뷰포트3', pct: 20, role: 'attacker' },
            { type: 'namedHolding', name: 'E2E38_뷰포트4', label: 'E2E38_뷰포트4', pct: 10, role: 'defender' }
          ], '해외': [] }
        };
        persistRebalance();
        renderAll();
      });
      await page.locator('[data-tab="rebalance"]').click();
      const card = page.locator('[data-position-tab][data-kind="role"]');
      await expect(card.first()).toBeVisible();
      // 포지션 카드는 화면에 여러 벌(합산/소유자별) 렌더될 수 있으므로 개수가 아니라 "어떤 포지션 키가
      // 나오는가"로 판정한다. 4개가 모두 독립 항목으로 있어야 하고, 값이 0인 legacy는 없어야 한다.
      const keys = await card.evaluateAll((els) => [...new Set(els.map((e) => e.dataset.key))].sort());
      expect(keys).toEqual(['attacker', 'core', 'defender', 'midfielder', 'unassigned']);
      await expect(card.filter({ hasText: '구분 필요' })).toHaveCount(0);
      // 14px 하한 + 가로 넘침 없음
      const info = await card.first().evaluate((el) => {
        const win = el.ownerDocument.defaultView;
        return { fontSize: parseFloat(win.getComputedStyle(el).fontSize), overflow: el.scrollWidth - el.clientWidth };
      });
      expect(info.fontSize).toBeGreaterThanOrEqual(14);
      expect(info.overflow).toBeLessThanOrEqual(1);
      const bodyOverflow = await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(bodyOverflow).toBeLessThanOrEqual(1);
    });
  }
}
