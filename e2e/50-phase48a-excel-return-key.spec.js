// E2E-50 Phase 48-A - Excel 왕복이 "자동 판별 Return Key"를 사용자 지정으로 승격시키지 않는다.
//
// [문제(P0-3)]
// 엑셀 내보내기의 "대표매칭(수익률연동키)" 칸이 예전엔 지금 실제로 적용 중인 키를 그대로 찍었다.
// 그 값에는 사용자가 지정한 것과 앱이 스스로 판별한 것이 섞여 있다 - 'KODEX 200'은 아무 지정이
// 없어도 자동으로 KOSPI가 되는데, 그 'KOSPI'가 셀에 찍혀 나가고 그 파일을 다시 올리면
// rateMatchOverride='KOSPI'로 저장돼 자동판별이 사용자 지정으로 굳었다. 그렇게 굳은 자산은 이후
// 시스템 정책이 바뀌어도(예: Phase 47-A의 지역 폴백 제거) 영원히 따라가지 못한다.
//
// 두 번째 시트("수익률 관리 기준")가 Phase 29-B에서 이미 겪고 고친 것과 같은 문제이고, 같은 규칙
// (저장된 오버라이드 원본값만 적고 없으면 빈 칸)으로 해결했다.
//
// [이 파일의 검증 방식]
// 규칙을 테스트에 베껴 쓰지 않는다. 실제 [엑셀 내보내기] 버튼을 눌러 만들어진 워크북을 그대로
// 읽고, 그 파일을 실제 [엑셀 업로드] 입력에 그대로 올려 왕복시킨다.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof resolveAssetGroupKeyDetail === 'function'
    && typeof sanitizeRateMatchOverride === 'function');
  // 엑셀 업로드는 alert()로 결과를 알린다 - 자동 수락해 두지 않으면 테스트가 멈춘다.
  page.on('dialog', (d) => d.accept());
}

// 자산을 심고 실제 [엑셀 내보내기]를 눌러, 만들어진 워크북의 자산목록 시트를 그대로 돌려준다.
// XLSX.writeFile은 브라우저 다운로드를 일으키므로 테스트에서만 가로채 워크북 객체를 붙잡는다
// (앱 코드는 건드리지 않는다 - CDN 라이브러리 함수 하나만 이 페이지에서 대신한다).
async function seedAndExport(page, assets) {
  // [작성 규칙] 이 저장소의 e2e는 브라우저 전역(document/window/XLSX)을 직접 참조하지 않는다
  // (eslint.config.js의 e2e 설정에 browser globals가 없다) - locator로 요소를 넘겨받아
  // ownerDocument/defaultView를 통해 접근한다.
  return page.locator('#exportExcelBtn').evaluate((btn, rows) => {
    const win = btn.ownerDocument.defaultView;
    const XL = win.XLSX;
    state.assets = rows.map((r) => {
      const a = makeAsset({
        ticker: r.ticker, owner: '신랑', accountType: '일반계좌', name: r.name,
        currency: r.currency, quantity: 10, buyPrice: 1000, currentPrice: 1200
      });
      if (r.override) a.rateMatchOverride = r.override;
      return a;
    });
    persistAssets();
    const realWriteFile = XL.writeFile;
    let captured = null;
    XL.writeFile = (wb) => { captured = wb; };
    try {
      btn.click();
    } finally {
      XL.writeFile = realWriteFile;
    }
    return {
      rows: XL.utils.sheet_to_json(captured.Sheets['자산목록'], { defval: '' }),
      base64: XL.write(captured, { type: 'base64', bookType: 'xlsx' }),
      // 비교용: 지금 실제 계산에 쓰이는 키와 그 판별 근거
      applied: state.assets.map((a) => {
        const d = resolveAssetGroupKeyDetail(a);
        return { name: a.name, key: d.key, source: d.source, rate: getAssetProjectionRate(a, 'normal'),
          override: a.rateMatchOverride === undefined ? null : a.rateMatchOverride };
      })
    };
  }, assets);
}

// 내보낸 파일을 실제 [엑셀 업로드] 입력에 그대로 올려 덮어쓰기로 가져온다.
async function importBase64(page, base64) {
  const file = path.join(os.tmpdir(), `e2e50-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  try {
    await page.setInputFiles('#excelFileInput', file);
    await page.locator('#importChoiceOverwriteBtn').click();
    await page.locator('#importChoiceModal').waitFor({ state: 'hidden' });
    // import 핸들러가 state.assets를 교체할 때까지 기다린다.
    await page.waitForFunction(() => Array.isArray(state.assets) && state.assets.length > 0);
    await page.waitForTimeout(300);
    return page.evaluate(() => state.assets.map((a) => {
      const d = resolveAssetGroupKeyDetail(a);
      return { name: a.name, key: d.key, source: d.source, rate: getAssetProjectionRate(a, 'normal'),
        override: a.rateMatchOverride === undefined ? null : a.rateMatchOverride };
    }));
  } finally {
    try { fs.unlinkSync(file); } catch { /* 임시파일 정리 실패는 무시 */ }
  }
}

const cellOf = (rows, name) => (rows.find((r) => r['종목명'] === name) || {})['대표매칭(수익률연동키)'];

/* ─────────── A. 자동 판별 자산 ─────────── */

test('A. 자동 판별된 자산은 엑셀 칸이 비고, 왕복 후에도 자동 판별 상태를 유지한다', async ({ page }) => {
  await boot(page);
  const exported = await seedAndExport(page, [{ ticker: '069500.KS', name: 'KODEX 200', currency: 'KRW' }]);

  // 내보내기 전: 지정 없이 자동으로 KOSPI가 적용되고 있다.
  expect(exported.applied[0]).toEqual({ name: 'KODEX 200', key: 'KOSPI', source: 'assetCharacter', rate: 7, override: null });
  // 엑셀 칸은 비어 있어야 한다 - 이 한 줄이 P0-3의 핵심이다.
  expect(cellOf(exported.rows, 'KODEX 200'), '자동 판별값을 엑셀에 찍지 않는다').toBe('');

  const after = await importBase64(page, exported.base64);
  expect(after[0].override, '왕복 후에도 사용자 지정이 생기지 않는다').toBeNull();
  expect(after[0].source, '여전히 자동 판별이다').toBe('assetCharacter');
  expect(after[0].key, '계산 키는 그대로다').toBe('KOSPI');
  expect(after[0].rate, '적용 수익률도 그대로다').toBe(7);
});

/* ─────────── B. 사용자 지정 자산 ─────────── */

test('B. 사용자가 직접 지정한 기준은 엑셀에 기록되고 왕복 후에도 유지된다', async ({ page }) => {
  await boot(page);
  const exported = await seedAndExport(page, [
    { ticker: '140860.KQ', name: '파크시스템스', currency: 'KRW', override: 'KOSDAQ' }
  ]);
  expect(exported.applied[0].source).toBe('override');
  expect(cellOf(exported.rows, '파크시스템스'), '사용자 지정은 그대로 기록한다').toBe('KOSDAQ');

  const after = await importBase64(page, exported.base64);
  expect(after[0].override).toBe('KOSDAQ');
  expect(after[0].source).toBe('override');
  expect(after[0].key).toBe('KOSDAQ');
  expect(after[0].rate).toBe(7); // KOSDAQ 시스템 기본값(= KOSPI 앵커 상속)
});

/* ─────────── C. 자동 키와 사용자 키가 다른 경우 ─────────── */

test('C. 자동 판별과 사용자 지정이 다르면 사용자 지정이 왕복 후에도 이긴다', async ({ page }) => {
  await boot(page);
  // 'KODEX 200'은 자동으로는 KOSPI인데 사용자가 KOSDAQ으로 바꿔 둔 상태.
  const exported = await seedAndExport(page, [
    { ticker: '069500.KS', name: 'KODEX 200', currency: 'KRW', override: 'KOSDAQ' }
  ]);
  // 자동 판별이 무엇인지도 함께 확인한다(둘이 실제로 다른 상황인지 보증).
  const auto = await page.evaluate(() => {
    const probe = makeAsset({ ticker: '069500.KS', owner: '신랑', accountType: '일반계좌', name: 'KODEX 200', currency: 'KRW', quantity: 1, buyPrice: 1 });
    return resolveAssetGroupKeyDetail(probe).key;
  });
  expect(auto).toBe('KOSPI');
  expect(cellOf(exported.rows, 'KODEX 200')).toBe('KOSDAQ');

  const after = await importBase64(page, exported.base64);
  expect(after[0].override, '사용자 지정이 자동 판별로 되돌아가지 않는다').toBe('KOSDAQ');
  expect(after[0].key).toBe('KOSDAQ');
});

/* ─────────── D. legacy 파일 - 추정하지 않는다 ─────────── */

test('D. [legacy 모호성 고정] 예전 엑셀의 자동 Key는 구분할 수 없으므로 그대로 보존한다', async ({ page }) => {
  await boot(page);
  // 예전 버전이 만든 파일에는 자동 판별 결과가 칸에 찍혀 있다. 현재 schema만으로는 그것이
  // "사용자가 직접 적은 것"인지 "예전 export가 찍은 것"인지 구분할 수 없다 - 그래서 import 동작은
  // 바꾸지 않고(값이 있으면 override로 저장) 그대로 보존한다. 임의로 추정해 지우지 않는다.
  const got = await page.evaluate(() => {
    const legacy = makeAsset({
      ticker: '069500.KS', owner: '신랑', accountType: '일반계좌', name: 'KODEX 200',
      currency: 'KRW', quantity: 10, buyPrice: 1000,
      rateMatchOverride: 'KOSPI' // 예전 export가 찍어 둔 자동 판별값
    });
    const d = resolveAssetGroupKeyDetail(legacy);
    return { override: legacy.rateMatchOverride, source: d.source, key: d.key, rate: getAssetProjectionRate(legacy, 'normal') };
  });
  expect(got.override, 'legacy 값을 지우거나 바꾸지 않는다').toBe('KOSPI');
  expect(got.source, '구분할 수 없으므로 사용자 지정으로 취급된다(알려진 모호성)').toBe('override');
  expect(got.key).toBe('KOSPI');
  expect(got.rate, '계산 결과는 자동 판별이었을 때와 같다').toBe(7);
});

/* ─────────── 부수 검증 ─────────── */

test('E. 엑셀 칸은 저장된 override와 정확히 일치한다(적용 중인 키가 아니라)', async ({ page }) => {
  await boot(page);
  const exported = await seedAndExport(page, [
    { ticker: '069500.KS', name: 'KODEX 200', currency: 'KRW' },                      // 자동 KOSPI
    { ticker: 'QQQM', name: 'Invesco NASDAQ 100 ETF', currency: 'USD' },              // 자동 NASDAQ
    { ticker: '', name: '국고채 10년', currency: 'KRW' },                              // 자동 채권
    { ticker: 'ZZETF', name: 'Unknown Global ETF', currency: 'USD' },                 // UNRESOLVED
    { ticker: '005930.KS', name: '삼성전자', currency: 'KRW', override: '005930.KS' }  // 사용자 지정
  ]);
  // 적용 중인 키는 서로 다르지만, 엑셀에 나가는 것은 "저장된 지정값"뿐이다.
  expect(exported.applied.map((a) => a.key)).toEqual(['KOSPI', 'NASDAQ', '채권', 'UNRESOLVED', '005930.KS']);
  expect(cellOf(exported.rows, 'KODEX 200')).toBe('');
  expect(cellOf(exported.rows, 'Invesco NASDAQ 100 ETF')).toBe('');
  expect(cellOf(exported.rows, '국고채 10년')).toBe('');
  expect(cellOf(exported.rows, 'Unknown Global ETF')).toBe('');
  expect(cellOf(exported.rows, '삼성전자')).toBe('005930.KS');
});

test('F. 왕복이 다른 사용자 데이터와 계산값을 바꾸지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.projection.customScenarioRates = {
      '005930.KS': { label: '삼성전자', conservative: 6, normal: 8, optimistic: 11 }
    };
    persistProjection();
  });
  const exported = await seedAndExport(page, [
    { ticker: '005930.KS', name: '삼성전자', currency: 'KRW', override: '005930.KS' },
    { ticker: '069500.KS', name: 'KODEX 200', currency: 'KRW' }
  ]);
  const after = await importBase64(page, exported.base64);
  // 적용 수익률이 왕복 전후로 동일하다.
  expect(after.map((a) => a.rate)).toEqual(exported.applied.map((a) => a.rate));
  expect(after.map((a) => a.rate)).toEqual([8, 7]); // 사용자 등록값 8% / 자동 KOSPI 7%
  // customScenarioRates가 훼손되지 않았다.
  const csr = await page.evaluate(() => state.projection.customScenarioRates['005930.KS']);
  expect(csr).toEqual({ label: '삼성전자', conservative: 6, normal: 8, optimistic: 11 });
  // owner/accountType/currency/수량/매수단가도 그대로다.
  const kept = await page.evaluate(() => state.assets.map((a) => ({
    owner: a.owner, accountType: a.accountType, currency: a.currency, quantity: a.quantity, buyPrice: a.buyPrice
  })));
  for (const k of kept) {
    expect(k.owner).toBe('신랑');
    expect(k.accountType).toBe('일반계좌');
    expect(k.quantity).toBe(10);
    expect(k.buyPrice).toBe(1000);
  }
});
