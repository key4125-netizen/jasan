/* global document, window, getComputedStyle */
// E2E-115 [§53 · v267 통합 자동화] 실제 화면에서 자동 판정이 동작하는지 본다.
//
// Unit(test/v267-automation.test.js)이 판정 규칙을 고정한다면, 이 파일은 **브라우저에서 실제로**
//   ① 자산 등록 폼이 종목만 넣어도 자산군 · 국내외 · 통화를 스스로 채우는지
//   ② 거래 폼의 거래일 · 거래유형 기본값이 자동으로 정해지는지
//   ③ 베타를 못 구한 이유가 종목마다 구체적으로 표시되는지
//   ④ 엑셀 가져오기 사전검증 · 백업 무결성 · 동기화 충돌 판정이 동작하는지
//   ⑤ 375px · 다크모드에서 깨지지 않는지
// 를 확인한다.
//
// [실제 사용자 데이터 미사용] 전부 ZZ 접두어 합성 종목이다.
// [외부 API 비의존] 종목 마스터는 테스트가 직접 주입한다(네트워크를 타지 않는다).
const { test, expect } = require('@playwright/test');

/** 합성 종목 마스터를 주입한다 - 실제 원천이 담는 필드 모양 그대로다. */
async function bootWithMaster(page) {
  /* 앱은 부팅할 때 종목 마스터를 CDN에서 받아 tickerMasterByTicker를 덮어쓴다(js/09 loadTickerMaster,
   * await 없이 백그라운드로 돈다). 그 응답이 아래 주입보다 늦게 도착하면 합성 마스터가 지워져
   * 병렬 실행에서 드물게 실패했다 - 이 테스트는 네트워크에 의존하지 않으므로 그 요청을 막는다. */
  await page.route('**/ticker-master.json*', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => typeof resolveInstrumentFacts === 'function' && typeof classifyCategory === 'function');
  await page.evaluate(() => {
    /* js/09의 tickerMasterByTicker는 스크립트 최상위 let 바인딩이라 window 속성이 아니다 -
     * window.xxx로 넣으면 앱이 보는 바인딩과 다른 곳에 들어간다. 이름 그대로 대입해야 닿는다
     * (정적 분석기에는 읽기전용 전역으로 보이므로 eval 경로로 같은 바인딩에 넣는다). */
    const MASTER = {
      'ZZKP.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 코스피주권', securityGroup: 'ST', currency: 'KRW', yahooTicker: 'ZZKP.KS' },
      'ZZKQ.KQ': { exchange: 'KOSDAQ', market: 'KR', nameKr: 'ZZ 코스닥주권', securityGroup: 'ST', currency: 'KRW', yahooTicker: 'ZZKQ.KQ' },
      'ZZEF.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 상장지수펀드', securityGroup: 'EF', currency: 'KRW', yahooTicker: 'ZZEF.KS' },
      ZZUSCOM: { exchange: 'NASDAQ', market: 'US', nameEn: 'ZZ US CORP', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ US Corp. - Common Stock', yahooTicker: 'ZZUSCOM' },
      ZZADR: { exchange: 'NYSE', market: 'US', nameKr: 'ZZ 해외기업(ADR)', nameEn: 'ZZ FOREIGN CO', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ Foreign Co Common Stock', yahooTicker: 'ZZADR' }
    };

    window.eval('tickerMasterByTicker = ' + JSON.stringify(MASTER) + ';');
  });
}

/* ══════════════════ A. 원천 사실 기반 자동 판정 ══════════════════ */

test('A - 브라우저에서 증권그룹 · 증권클래스로 자산군과 노출시장을 자동 판정한다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => ({
    krStockCategory: classifyCategory('ZZKP.KS', 'ZZ 코스피주권'),
    krEtfCategory: classifyCategory('ZZEF.KS', 'ZZ 상장지수펀드'),
    krExposure: resolveRuntimeMarketExposure({ ticker: 'ZZKP.KS', category: '주식' }).exposure,
    kqExposure: resolveRuntimeMarketExposure({ ticker: 'ZZKQ.KQ', category: '주식' }).exposure,
    etfReason: resolveRuntimeMarketExposure({ ticker: 'ZZEF.KS', category: 'ETF' }).reason,
    usExposure: resolveRuntimeMarketExposure({ ticker: 'ZZUSCOM', category: '주식' }).exposure,
    adrReason: resolveRuntimeMarketExposure({ ticker: 'ZZADR', category: '주식' }).reason,
    krBenchmark: resolveMarketRiskBenchmark({ ticker: 'ZZKQ.KQ', category: '주식', name: '' }).key,
    usBenchmark: resolveMarketRiskBenchmark({ ticker: 'ZZUSCOM', category: '주식', name: '' }).key
  }));
  expect(r.krStockCategory).toBe('주식');
  expect(r.krEtfCategory).toBe('ETF');
  expect(r.krExposure).toBe('KR');
  expect(r.kqExposure).toBe('KR');
  expect(r.etfReason).toBe('etfNeedsOfficialIndex');
  expect(r.usExposure).toBe('US');
  expect(r.adrReason).toBe('depositaryReceipt');
  expect(r.krBenchmark).toBe('KOSDAQ');   // 코스닥 상장 주권이 원장 없이 코스닥 지수를 받는다
  expect(r.usBenchmark).toBe('SP500');
});

test('A-2 - Market Beta와 Tracking Beta가 같은 종목에 대해 서로 다른 전제를 갖지 않는다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => ({
    market: resolveMarketRiskBenchmark({ ticker: 'ZZKQ.KQ', category: '주식', name: '' }).key,
    tracking: resolveRiskBenchmark({ ticker: 'ZZKQ.KQ', category: '주식', name: '' }).key,
    adrMarket: resolveMarketRiskBenchmark({ ticker: 'ZZADR', category: '주식', name: '' }).key,
    adrTracking: resolveRiskBenchmark({ ticker: 'ZZADR', category: '주식', name: '' }).key
  }));
  expect(r.market).toBe('KOSDAQ');
  expect(r.tracking).toBe('KOSDAQ');
  expect(r.adrMarket).toBeNull();
  expect(r.adrTracking).toBeNull();
});

/* ══════════════════ B. 자산 등록 폼 자동 채움 ══════════════════ */

test('B - 자산 등록 폼이 종목만 넣어도 자산군 · 국내외 · 통화를 스스로 채운다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    const out = {};
    document.getElementById('f_ticker').value = 'ZZKP.KS';
    document.getElementById('f_name').value = 'ZZ 코스피주권';
    autoClassifyModal();
    out.kr = {
      category: document.getElementById('f_category').value,
      isDomestic: document.getElementById('f_isDomestic').value,
      currency: document.getElementById('f_currency').value
    };
    document.getElementById('f_ticker').value = 'ZZUSCOM';
    document.getElementById('f_name').value = 'ZZ US CORP';
    autoClassifyModal();
    out.us = {
      category: document.getElementById('f_category').value,
      isDomestic: document.getElementById('f_isDomestic').value,
      currency: document.getElementById('f_currency').value
    };
    // 이름에 ETF 브랜드가 없어도 원천 사실이 ETF면 ETF로 채워진다.
    document.getElementById('f_ticker').value = 'ZZEF.KS';
    document.getElementById('f_name').value = 'ZZ 고배당 상품';
    autoClassifyModal();
    out.etfCategory = document.getElementById('f_category').value;
    return out;
  });
  expect(r.kr).toEqual({ category: '주식', isDomestic: '국내', currency: 'KRW' });
  expect(r.us).toEqual({ category: '주식', isDomestic: '해외', currency: 'USD' });
  expect(r.etfCategory).toBe('ETF');
});

/* ══════════════════ C. 거래 폼 기본값 ══════════════════ */

test('C - 거래 등록 기본 거래일은 평일이고, 보유가 없으면 거래유형 기본값이 매수다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    openTransactionModal();
    const date = document.getElementById('tx_date').value;
    // 보유가 없는 합성 종목을 고른 상태를 만든다.
    document.getElementById('tx_name').value = 'ZZ 보유없는종목';
    document.getElementById('tx_ticker').value = 'ZZKP.KS';
    document.getElementById('tx_owner').value = '신랑';
    document.getElementById('tx_type').value = 'sell';
    delete document.getElementById('tx_type').dataset.userTouched;
    applyDefaultTransactionType();
    return { date, type: document.getElementById('tx_type').value, weekday: new Date(date + 'T00:00:00').getDay() };
  });
  expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(r.weekday).toBeGreaterThanOrEqual(1);
  expect(r.weekday).toBeLessThanOrEqual(5);
  expect(r.type).toBe('buy');
});

test('C-2 - 사용자가 거래유형을 직접 고르면 자동 기본값이 그 선택을 덮지 않는다', async ({ page }) => {
  await bootWithMaster(page);
  const type = await page.evaluate(() => {
    openTransactionModal();
    document.getElementById('tx_name').value = 'ZZ 보유없는종목';
    document.getElementById('tx_ticker').value = 'ZZKP.KS';
    const el = document.getElementById('tx_type');
    el.value = 'sell';
    el.dispatchEvent(new Event('change'));   // 사용자가 직접 고른 것으로 표시된다
    applyDefaultTransactionType();
    return el.value;
  });
  expect(type).toBe('sell');
});

/* ══════════════════ D. Risk 자동 진단 문구 ══════════════════ */

test('D - 베타를 못 구한 이유가 종목마다 구체적으로 표시된다', async ({ page }) => {
  await bootWithMaster(page);
  const texts = await page.evaluate(() => {
    const mk = (ticker, name, source) => ({
      ticker, name, weight: 0.25, beta: null, betaStatus: 'BENCHMARK_UNRESOLVED', benchmarkSource: source
    });
    const html = betaUnavailableReasonsNoteHtml({
      holdings: [
        mk('ZZA', 'ZZ 예탁증서', 'depositaryReceipt'),
        mk('ZZB', 'ZZ 상장지수펀드', 'etfNeedsOfficialIndex'),
        mk('ZZC', 'ZZ 리츠', 'reitExposureUnconfirmed'),
        mk('ZZD', 'ZZ 미확인', 'securityClassUnrecognized')
      ]
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    return [...div.querySelectorAll('[data-beta-reason-row]')].map((li) => li.innerText || li.textContent);
  });
  expect(texts).toHaveLength(4);
  expect(texts[0]).toContain('예탁증서');
  expect(texts[1]).toContain('공식 기초지수');
  expect(texts[2]).toContain('리츠');
  expect(texts[3]).toContain('증권 종류');
  // 네 종목이 서로 다른 이유를 받는다(예전처럼 한 문구로 뭉뚱그리지 않는다).
  expect(new Set(texts.map((t) => t.replace(/^ZZ[A-D]\s*/, ''))).size).toBe(4);
});

/* ══════════════════ E. 엑셀 사전검증 · 백업 무결성 · 동기화 판정 ══════════════════ */

test('E - 엑셀 가져오기 사전검증이 이상한 행을 세어 알려준다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    const rows = [
      { owner: '신랑', accountType: '일반계좌', ticker: 'ZZKP.KS', name: 'ZZ 정상', currency: 'KRW', quantity: 10, buyPrice: 1000, category: '주식', categoryCellRaw: '주식' },
      { owner: '', accountType: '일반계좌', ticker: 'ZZKQ.KQ', name: 'ZZ 소유자없음', currency: 'KRW', quantity: 10, buyPrice: 1000 },
      { owner: '신랑', accountType: '일반계좌', ticker: 'ZZEF.KS', name: 'ZZ 수량0', currency: 'KRW', quantity: 0, buyPrice: 1000 },
      { owner: '신랑', accountType: '일반계좌', ticker: 'ZZKP.KS', name: 'ZZ 정상', currency: 'KRW', quantity: 10, buyPrice: 1000 } // 중복
    ];
    const pf = buildExcelImportPreflight(rows, []);
    return { total: pf.total, labels: pf.issues.map((i) => i.label + ':' + i.count), text: excelImportPreflightText(pf) };
  });
  expect(r.total).toBe(4);
  expect(r.labels.join(' ')).toContain('소유자');
  expect(r.labels.join(' ')).toContain('수량이 0 이하인 행:1');
  expect(r.labels.join(' ')).toContain('파일 안에서 중복된 보유분:1');
  expect(r.text).toContain('확인이 필요한 항목');
});

test('E-2 - 백업 무결성 표식을 만들고 손상 여부를 가려낸다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(async () => {
    const body = { assets: [{ id: 'a1', name: 'ZZ' }], transactions: [] };
    const checksum = await computeBackupChecksum(JSON.stringify(body));
    const good = await verifyBackupChecksum(Object.assign({}, body, { checksum }));
    const bad = await verifyBackupChecksum(Object.assign({}, body, { checksum, assets: [{ id: 'a1', name: 'ZZ 변조' }] }));
    const old = await verifyBackupChecksum(body); // 표식이 없는 옛 백업
    return { len: (checksum || '').length, good, bad, old };
  });
  expect(r.len).toBe(64);        // sha256 16진수 64자
  expect(r.good).toBe('ok');
  expect(r.bad).toBe('mismatch');
  expect(r.old).toBe('absent');  // 옛 백업은 예전처럼 그대로 복원된다
});

/* [기대값 갱신 사유 · PM 지시 2026-09-23] 이 테스트는 v267(PC-6 · SoT §53-9)의 "진짜 충돌만
 * 묻는다"를 고정하고 있었다. PM 결정으로 그 완화를 되돌렸다 - **두 곳이 다르면 종류를 가리지 않고
 * 사용자가 고른다**(§30 v243 규칙 복귀). 그래서 판정 함수(syncDifferenceNeedsReview)는 사라졌고,
 * 이제 확인 여부를 정하는 것은 compareSyncData의 hasMeaningfulDifference 하나다.
 * 기대값을 낮춘 것이 아니라 정반대 방향으로 고정한다 - 자동으로 합쳐지던 두 경우(①②)도 이제 묻는다. */
test('E-3 - 동기화는 두 곳이 다르면 종류를 가리지 않고 사용자에게 묻는다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    const asset = (over) => Object.assign({
      id: 'a1', name: 'ZZ자산', ticker: 'ZZ.KS', owner: '신랑', accountType: '일반계좌',
      category: '주식', isDomestic: '국내', currency: 'KRW', quantity: 10, buyPrice: 1000
    }, over || {});
    const tx = (over) => Object.assign({
      id: 't1', date: '2026-01-02', name: 'ZZ자산', ticker: 'ZZ.KS', owner: '신랑',
      accountType: '일반계좌', type: 'buy', quantity: 1, price: 1000, currency: 'KRW'
    }, over || {});
    const localBase = { assets: [asset()], transactions: [tx()], rebalance: state.rebalance, projection: state.projection };
    const cloud = (over) => Object.assign({
      assets: [asset()], transactions: [tx()], rebalance: state.rebalance, projection: state.projection
    }, over || {});
    const ask = (remote, local) => compareSyncData(local || localBase, remote).hasMeaningfulDifference;

    return {
      // 같다 - 묻지 않는다(Case A). updatedAt · 시세만 다른 것은 차이로 보지 않는다(§30 S-5).
      same: ask(cloud()),
      sameButStamped: ask(cloud({ assets: [asset({ updatedAt: Date.now(), currentPrice: 99999 })] })),
      // ① 클라우드에만 있는 신규 거래 - v267에서는 자동 병합, 이제는 묻는다
      cloudOnlyTx: ask(cloud({ transactions: [tx(), tx({ id: 't2' })] })),
      // ② 이 기기에만 있는 신규 자산 - v267에서는 자동 병합, 이제는 묻는다
      localOnlyAsset: ask(cloud({ assets: [] }), { ...localBase, assets: [asset(), asset({ id: 'a2' })] }),
      // ③ 같은 항목의 값이 다르다
      valueDiffers: ask(cloud({ assets: [asset({ quantity: 20 })] })),
      // ④ 삭제 vs 보유
      deletedHere: ask(cloud(), { ...localBase, assets: [] }),
      // ⑤ 목표비중 설정이 다르다
      rebalanceChanged: ask(cloud({ rebalance: { ...state.rebalance, updatedAt: Date.now() + 1, '신랑': { domestic: { '국내': 10, '해외': 90 }, targets: { '국내': [], '해외': [] } } } }))
    };
  });
  expect(r.same, '같으면 묻지 않는다').toBe(false);
  expect(r.sameButStamped, '시각 · 시세만 달라진 것은 차이가 아니다').toBe(false);
  expect(r.cloudOnlyTx, '클라우드에만 있는 거래도 이제 묻는다').toBe(true);
  expect(r.localOnlyAsset, '이 기기에만 있는 자산도 이제 묻는다').toBe(true);
  expect(r.valueDiffers).toBe(true);
  expect(r.deletedHere).toBe(true);
  expect(r.rebalanceChanged).toBe(true);
  // 완화 판정 함수는 더 이상 존재하지 않는다(자동 병합 경로가 남아 있지 않다는 뜻이다).
  const gone = await page.evaluate(() => typeof syncDifferenceNeedsReview === 'undefined');
  expect(gone, '자동 병합 판정 함수가 남아 있지 않다').toBe(true);
});

/* ══════════════════ F. 사용자 확정값 보호 ══════════════════ */

test('F - 사용자가 확정한 값을 자동 판정이 덮지 않고 충돌로 알린다', async ({ page }) => {
  await bootWithMaster(page);
  const r = await page.evaluate(() => {
    state.assets = [{ id: 'a1', ticker: 'ZZKP.KS', name: 'ZZ 코스피주권', owner: '신랑', accountType: '일반계좌', currency: 'USD', category: '채권', categorySource: 'user' }];
    const meta = resolveInstrumentMetadata({ ticker: 'ZZKP.KS', name: 'ZZ 코스피주권', owner: '신랑', accountType: '일반계좌' });
    const conflict = resolveInstrumentMetadata({ ticker: 'ZZKQ.KQ', name: 'ZZ', currency: 'USD' });
    return { currency: meta.currency, category: meta.category, conflictCcy: conflict.currency, conflicts: conflict.conflicts.map((c) => c.field) };
  });
  expect(r.currency).toBe('USD');     // 사용자 확정값 유지
  expect(r.category).toBe('채권');     // 사용자 확정값 유지
  expect(r.conflictCcy).toBe('KRW');  // 근거 있는 값이 이긴다
  expect(r.conflicts).toContain('currency'); // 조용히 바꾸지 않고 알린다
});

/* ══════════════════ G. 모바일 · 다크모드 ══════════════════ */

for (const [label, width] of [['375', 375], ['390', 390], ['1440', 1440]]) {
  for (const dark of [false, true]) {
    test(`G - ${label}px ${dark ? 'Dark' : 'Light'} - 자동 진단 문구가 14px 이상이고 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await bootWithMaster(page);
      if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
      const r = await page.evaluate(() => {
        const html = betaUnavailableReasonsNoteHtml({
          holdings: [
            { ticker: 'ZZA', name: 'ZZ 예탁증서 종목', weight: 0.5, beta: null, betaStatus: 'BENCHMARK_UNRESOLVED', benchmarkSource: 'depositaryReceipt' },
            { ticker: 'ZZB', name: 'ZZ 상장지수펀드 종목', weight: 0.5, beta: null, betaStatus: 'BENCHMARK_UNRESOLVED', benchmarkSource: 'etfNeedsOfficialIndex' }
          ]
        });
        const host = document.createElement('div');
        host.innerHTML = html;
        document.getElementById('riskManagementSection').appendChild(host);
        const nodes = [...host.querySelectorAll('p, li, span')].filter((n) => n.textContent.trim());
        const min = Math.min(...nodes.map((n) => parseFloat(getComputedStyle(n).fontSize)));
        const outside = [...host.querySelectorAll('*')].filter((n) => {
          const b = n.getBoundingClientRect();
          return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1);
        }).length;
        const overflow = document.body.scrollWidth - document.body.clientWidth;
        host.remove();
        return { min, outside, overflow };
      });
      expect(r.min).toBeGreaterThanOrEqual(14);
      expect(r.outside).toBe(0);
      expect(r.overflow).toBeLessThanOrEqual(1);
    });
  }
}
