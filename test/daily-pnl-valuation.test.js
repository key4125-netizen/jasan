// [Daily Valuation 통합 · 일별 손익 PM 확정 U1=C · U2 · U3 · U4] 일별 손익 순수 계산 검증 + 두 팝업 공통 기간 계산.
//
// 계산 함수(js/23)가 원장 판정 · 자산 분류에 쓰는 js/01 · js/02 · js/06의 실제 함수를 흉내내지 않도록, test/mc-adapter-sandbox.js와
// 같은 방식으로 원본 스크립트를 vm 컨텍스트에 index.html 순서대로 싣고 그 위에 js/23을 싣는다(새 의존성 0개).
// 시세는 Yahoo 일봉 모양의 합성 응답을 dvNormalizeChart로 정리해 넣는다. 네트워크 · 현재 시각 · 실제 사용자 데이터를 쓰지 않는다.
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dv = require(path.join(__dirname, '..', 'js', '23-daily-valuation.js'));
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '23-daily-valuation.js'), 'utf8'), SB, { filename: '23-daily-valuation.js' });

const ts = (iso) => Date.parse(iso) / 1000;
const FETCHED = '2026-09-14T12:00:00Z'; // 월요일 - 아래 과거 봉(9/1~9/11)은 모두 확정
const TZ = { KR: 'Asia/Seoul', US: 'America/New_York', FX: 'Europe/London' };
const BAR_TIME = { KR: 'T00:00:00Z', US: 'T13:30:00Z', FX: 'T12:00:00Z' };
const WEEK = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
const EARLY = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
const flat = (v, days = [...EARLY, ...WEEK]) => Object.fromEntries(days.map((d) => [d, v]));

function series(symbol, marketKey, closes, o = {}) {
  const dates = Object.keys(closes).sort();
  const result = {
    meta: Object.assign({ exchangeTimezoneName: TZ[marketKey], firstTradeDate: ts('2020-01-02T00:00:00Z') }, o.meta || {}),
    timestamp: dates.map((d) => ts(d + BAR_TIME[marketKey])),
    indicators: { quote: [{ close: dates.map((d) => closes[d]) }] },
    events: o.splits ? { splits: o.splits } : undefined
  };
  return SB.dvNormalizeChart(result, { symbol, marketKey, fetchedAtMs: Date.parse(o.fetched || FETCHED), requestedStartDate: '2026-08-01' });
}
const A = (o) => Object.assign({ accountType: '일반계좌', categorySource: 'user', createdAt: 1, updatedAt: 1, isDomestic: '국내', currency: 'KRW', quantity: 0, buyPrice: 1, currentPrice: 1 }, o);
const T = (o) => Object.assign({ accountType: '일반계좌', fee: 0, origin: 'period', updatedAt: 1, type: 'buy', currency: 'KRW', createdAt: 1 }, o);
const snap = (byOwnerCat) => ({
  total: { cur: 1, dailyPnL: 0 }, byOwner: {},
  byOwnerCategory: Object.fromEntries(Object.entries(byOwnerCat).map(([o, cats]) => [o, Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { cur: v, dailyPnL: 0 }]))]))
});

// 원장 기반 자산의 수량을 원장 최종 수량에 맞춘다(실제 앱의 syncAssetsFromTransactions 뒤 상태).
function syncLedgerQty(assets, transactions) {
  const positions = SB.computePositionsAndRealizedPnL(transactions).positions;
  assets.forEach((a) => {
    if (a.positionSource !== 'ledger') return;
    const p = SB.findLedgerPositionForAsset(a, positions);
    if (p) a.quantity = p.quantity;
  });
}

function run({ assets, transactions, snapshots = {}, seriesBySymbol, dates, owners }) {
  syncLedgerQty(assets, transactions);
  const finalPositions = SB.computePositionsAndRealizedPnL(transactions).positions;
  const classified = assets.map((asset) => ({ asset, cls: SB.dvClassifyAsset(asset, finalPositions) }));
  const input = { dates, owners, classified, transactions, seriesBySymbol, K: 3 };
  const pnlRows = SB.dvBuildDailyPnlRows(Object.assign({}, input, { defaultTradeRate: 1450 }));
  const tvRows = SB.dvBuildRows(Object.assign({}, input, { snapshots }));
  return {
    pnlRows, tvRows,
    pnl: (d) => pnlRows.find((r) => r.date === d),
    tv: (d) => tvRows.find((r) => r.date === d)
  };
}

const close = (actual, expected, msg) => {
  if (expected === null) { assert.strictEqual(actual, null, msg); return; }
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} != ${expected}`);
};
const closeList = (actual, expected, msg) => {
  assert.strictEqual(actual.length, expected.length, msg);
  actual.forEach((v, i) => close(v, expected[i], `${msg} [${i}]`));
};

// 신랑: 국내주식(원장) 10주 @100을 9/8에 산다 + 원화 현금(manual · 마지막 기록값). 9/9의 거래 · 종가 · 현금 기록만 바꾼다.
function krWorld({ close9 = 100, trades9 = [], cash9 = null } = {}) {
  const transactions = [
    T({ id: 'b0', date: '2026-09-08', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 10, price: 100 }),
    ...trades9.map((t, i) => T(Object.assign({ id: 't9_' + i, date: '2026-09-09', owner: '신랑', ticker: '900001.KS', name: 'DV_S', createdAt: 2 + i }, t)))
  ];
  const assets = [
    A({ id: 's', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_S', positionSource: 'ledger' }),
    A({ id: 'c', ticker: '', owner: '신랑', category: '현금', name: '원화', quantity: 1, currentPrice: 10000, positionSource: 'manual' })
  ];
  const snapshots = { '2026-09-08': snap({ '신랑': { '현금': 10000 } }) };
  if (cash9 !== null) snapshots['2026-09-09'] = snap({ '신랑': { '현금': cash9 } });
  const seriesBySymbol = {
    '900001.KS': series('900001.KS', 'KR', Object.assign(flat(100), { '2026-09-09': close9, '2026-09-10': close9, '2026-09-11': close9 })),
    '^KS11': series('^KS11', 'KR', flat(3000))
  };
  return run({ assets, transactions, snapshots, seriesBySymbol, dates: ['2026-09-08', '2026-09-09'], owners: ['신랑'] });
}

test('1. [U1=C] 매수 · 매도 원금과 현금 입출금은 손익이 아니다 - 현금 기록 반영 여부와 무관하게 같은 손익 (8+2 사례)', () => {
  const cases = [
    ['1 매수 + 현금 기록 반영', { trades9: [{ quantity: 5, price: 100 }], cash9: 9500 }, 0, 0],
    ['2 매수 + 현금 기록 미반영', { trades9: [{ quantity: 5, price: 100 }] }, 0, 500],
    ['3 매도 + 현금 기록 반영', { trades9: [{ type: 'sell', quantity: 4, price: 100 }], cash9: 10400 }, 0, 0],
    ['4 매도 + 현금 기록 미반영', { trades9: [{ type: 'sell', quantity: 4, price: 100 }] }, 0, -400],
    ['5 신규 현금 유입', { cash9: 13000 }, 0, 3000],
    ['6 현금 인출', { cash9: 8000 }, 0, -2000],
    ['7 가격 상승 100→110', { close9: 110 }, 100, 100],
    ['9 매수 + 가격 변화(105에 5주 · 종가 110)', { close9: 110, trades9: [{ quantity: 5, price: 105 }], cash9: 9475 }, 125, 125],
    ['9b 매수 + 가격 변화(현금 기록 미반영)', { close9: 110, trades9: [{ quantity: 5, price: 105 }] }, 125, 650],
    ['10 매도 + 가격 변화(105에 4주 · 종가 110)', { close9: 110, trades9: [{ type: 'sell', quantity: 4, price: 105 }], cash9: 10420 }, 80, 80],
    ['10b 매도 + 가격 변화(현금 기록 미반영)', { close9: 110, trades9: [{ type: 'sell', quantity: 4, price: 105 }] }, 80, -340]
  ];
  cases.forEach(([name, spec, pnl, totalValueChange]) => {
    const w = krWorld(spec);
    close(w.pnl('2026-09-09').owners['신랑'], pnl, `${name} 일별 손익`);
    close(w.tv('2026-09-09').owners['신랑'] - w.tv('2026-09-08').owners['신랑'], totalValueChange, `${name} 총자산 변화(참고)`);
    close(w.pnl('2026-09-08').owners['신랑'], 0, `${name} 매수일(체결가 = 종가) 손익`);
  });
});

test('2. [U1=C · 8 환율 변화] 달러 주식과 원장 달러 현금은 환율 변화가 손익이고, 매수일은 적용 환율 대비 평가 환율 차이만 손익이다', () => {
  const build = (appliedRate) => run({
    assets: [
      A({ id: 'z', ticker: 'ZZDV', owner: '와이프', category: '주식', name: 'DV_Z', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' }),
      A({ id: 'u', ticker: '', owner: '와이프', category: '현금', name: '달러', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' })
    ],
    transactions: [
      T({ id: 'z1', date: '2026-09-08', owner: '와이프', ticker: 'ZZDV', name: 'DV_Z', quantity: 10, price: 100, currency: 'USD', appliedRate }),
      T({ id: 'u1', date: '2026-09-08', owner: '와이프', ticker: '', name: '달러', quantity: 500, price: 1, currency: 'USD', appliedRate })
    ],
    seriesBySymbol: {
      ZZDV: series('ZZDV', 'US', flat(100)), '^GSPC': series('^GSPC', 'US', flat(7000)),
      'KRW=X': series('KRW=X', 'FX', Object.assign(flat(1300), { '2026-09-09': 1310, '2026-09-10': 1310, '2026-09-11': 1310 }))
    },
    dates: ['2026-09-08', '2026-09-09'], owners: ['와이프']
  });
  const same = build(1300);
  close(same.pnl('2026-09-08').owners['와이프'], 0, '매수일 · 적용 환율 = 평가 환율 → 0');
  close(same.pnl('2026-09-09').owners['와이프'], 10 * 100 * 10 + 500 * 10, '환율 1300→1310: 주식 10,000 + 달러 현금 5,000');
  assert.deepStrictEqual([...same.pnl('2026-09-09').ownerFlags['와이프']], []);
  const cheaper = build(1295);
  close(cheaper.pnl('2026-09-08').owners['와이프'], 10 * 100 * 5 + 500 * 5, '1,295원에 사고 평가 환율 1,300원 → 차이만 손익');
  close(cheaper.pnl('2026-09-09').owners['와이프'], 15000, '다음 날은 적용 환율과 무관');
});

test('3. [U2 · 원장 순서] 수수료는 손익에서 빼지 않고, 당일 매수 뒤 과다 매도는 원장과 같이 보유수량으로 제한된다', () => {
  const withFee = krWorld({ close9: 110, trades9: [{ quantity: 5, price: 105, fee: 50 }], cash9: 9475 });
  close(withFee.pnl('2026-09-09').owners['신랑'], 125, '수수료 50원이 있어도 125');
  const pure = dv.dvPositionDailyPnl({ qtyPrev: 10, unitPrev: 100, qtyCur: 0, unitCur: null, trades: [{ type: 'buy', quantity: 5, price: 100, rate: 1 }, { type: 'sell', quantity: 20, price: 100, rate: 1 }] });
  assert.deepStrictEqual(pure, { value: 0, endQty: 0 }, '10주 + 5주 매수 뒤 20주 매도 → 15주만 팔린다');
  const oversell = krWorld({ trades9: [{ quantity: 5, price: 100 }, { type: 'sell', quantity: 20, price: 100 }] });
  close(oversell.pnl('2026-09-09').owners['신랑'], 0, '원장 수량(0)과 다시 재생한 수량이 같아 계산된다');
  const roundTrip = dv.dvPositionDailyPnl({ qtyPrev: 0, unitPrev: null, qtyCur: 0, unitCur: null, trades: [{ type: 'buy', quantity: 3, price: 100, rate: 1 }, { type: 'sell', quantity: 3, price: 104, rate: 1 }] });
  assert.deepStrictEqual(roundTrip, { value: 12, endQty: 0 }, '당일 사고판 차익은 손익');
});

function householdWorld({ husbandExtra = [], wifeExtra = [], snapshots = {} } = {}) {
  const transactions = [
    T({ id: 'b0', date: '2026-09-08', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 10, price: 100 }),
    T({ id: 'z1', date: '2026-09-08', owner: '와이프', ticker: 'ZZDV', name: 'DV_Z', quantity: 10, price: 100, currency: 'USD', appliedRate: 1300 }),
    T({ id: 'u1', date: '2026-09-08', owner: '와이프', ticker: '', name: '달러', quantity: 500, price: 1, currency: 'USD', appliedRate: 1300 })
  ];
  const assets = [
    A({ id: 's', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_S', positionSource: 'ledger' }),
    A({ id: 'z', ticker: 'ZZDV', owner: '와이프', category: '주식', name: 'DV_Z', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' }),
    A({ id: 'u', ticker: '', owner: '와이프', category: '현금', name: '달러', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' }),
    ...husbandExtra, ...wifeExtra
  ];
  return run({
    assets, transactions, snapshots,
    seriesBySymbol: {
      '900001.KS': series('900001.KS', 'KR', Object.assign(flat(100), { '2026-09-09': 110 })), '^KS11': series('^KS11', 'KR', flat(3000)),
      ZZDV: series('ZZDV', 'US', flat(100)), '^GSPC': series('^GSPC', 'US', flat(7000)),
      'KRW=X': series('KRW=X', 'FX', Object.assign(flat(1300), { '2026-09-09': 1310 }))
    },
    dates: ['2026-09-08', '2026-09-09'], owners: ['신랑', '와이프']
  });
}

test('4. [U3] 원장 달러 현금은 계산하고, 원장으로 수량을 알 수 없는 달러 현금은 스냅샷에 원화 기록값이 있어도 되돌리지 않고 계산 불가', () => {
  const base = householdWorld();
  const d9 = base.pnl('2026-09-09');
  close(d9.owners['신랑'], 100, '신랑');
  close(d9.owners['와이프'], 15000, '와이프(원장 달러 현금 포함)');
  close(d9.total, 15100, '합계');
  // 스냅샷의 '달러'는 원화 평가액뿐이고 그때 적용 환율이 없다 - 이 값으로 달러 수량을 역산하지 않는다(U3 C · B에 해당하는 기존 원천 없음).
  const noLedgerUsd = householdWorld({
    wifeExtra: [A({ id: 'u2', ticker: '', owner: '와이프', category: '현금', name: '달러 예금', currency: 'USD', isDomestic: '해외', quantity: 300, positionSource: 'manual' })],
    snapshots: { '2026-09-07': snap({ '와이프': { '달러': 390000 } }) }
  });
  const n9 = noLedgerUsd.pnl('2026-09-09');
  close(n9.owners['와이프'], null, '원장 없는 달러 현금이 있는 소유자 = null');
  assert.ok(n9.ownerReasons['와이프'].includes('usdCashNoLedger'));
  close(n9.owners['신랑'], 100, '다른 소유자는 그대로');
  close(n9.total, null, '합계 = null');
});

test('5. [U4 = U-B] 계산 불가 자산이 있는 소유자는 null, 합계도 null - 계산 가능한 자산만 골라 더하지 않는다. 0과 null을 섞지 않는다', () => {
  const w = householdWorld({ husbandExtra: [A({ id: 'm', ticker: '900002.KS', owner: '신랑', category: '주식', name: 'DV_M', quantity: 3, positionSource: 'manual' })] });
  ['2026-09-08', '2026-09-09'].forEach((d) => {
    const row = w.pnl(d);
    close(row.owners['신랑'], null, `${d} 신랑`);
    close(row.total, null, `${d} 합계`);
    assert.ok(row.reasons.includes('manualMarketAsset'));
    assert.strictEqual(row.recorded, true, '와이프 값이 있어 그 날은 표시 대상');
  });
  close(w.pnl('2026-09-08').owners['와이프'], 0, '와이프 매수일 = 실제 0 (null 아님)');
  close(w.pnl('2026-09-09').owners['와이프'], 15000, '와이프는 그대로');
});

test('6. [positionsAsOf] 거래 없는 날은 가격 변화만 · 뒤늦게 입력한 과거 거래는 그 날부터만 · 삭제된 자산의 남은 거래는 되살리지 않는다', () => {
  const build = (extraTx) => run({
    assets: [A({ id: 's', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_S', positionSource: 'ledger' })],
    transactions: [T({ id: 'b0', date: '2026-09-08', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 10, price: 100 }), ...extraTx],
    seriesBySymbol: {
      '900001.KS': series('900001.KS', 'KR', Object.assign(flat(100), { '2026-09-10': 120, '2026-09-11': 120 })),
      '^KS11': series('^KS11', 'KR', flat(3000)),
      'GONE.KS': series('GONE.KS', 'KR', flat(50))
    },
    dates: WEEK, owners: ['신랑']
  });
  const base = build([]);
  closeList(base.pnlRows.map((r) => r.owners['신랑']), [0, 0, 0, 200, 0], '기본');
  const late = build([T({ id: 'late', date: '2026-09-09', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 5, price: 100, createdAt: 99 })]);
  closeList(late.pnlRows.map((r) => r.owners['신랑']), [0, 0, 0, 300, 0], '9/9 거래를 나중에 입력');
  closeList(late.pnlRows.slice(0, 2).map((r) => r.owners['신랑']), base.pnlRows.slice(0, 2).map((r) => r.owners['신랑']), '거래일 이전 날짜는 그대로');
  const residual = build([T({ id: 'gone', date: '2026-09-08', owner: '신랑', ticker: 'GONE.KS', name: 'DV_GONE', quantity: 7, price: 50 })]);
  closeList(residual.pnlRows.map((r) => r.owners['신랑']), [0, 0, 0, 200, 0], '자산 목록에 없는 종목의 거래는 더하지 않는다');
});

test('7. [U-A] 오늘 장중은 잠정 · 실제 종료 뒤 체결 확인은 확정 · 혼합 포트폴리오는 잠정 시장이 있으면 합계도 잠정', () => {
  const krPeriod = { regular: { start: ts('2026-09-14T00:00:00Z'), end: ts('2026-09-14T06:00:00Z') } };
  const build = (fetched, lastTrade, withUs) => run({
    assets: [
      A({ id: 's', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_S', positionSource: 'ledger' }),
      ...(withUs ? [A({ id: 'z', ticker: 'ZZDV', owner: '와이프', category: '주식', name: 'DV_Z', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' })] : [])
    ],
    transactions: [
      T({ id: 'b0', date: '2026-09-10', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 10, price: 100 }),
      ...(withUs ? [T({ id: 'z1', date: '2026-09-10', owner: '와이프', ticker: 'ZZDV', name: 'DV_Z', quantity: 1, price: 100, currency: 'USD', appliedRate: 1300 })] : [])
    ],
    seriesBySymbol: {
      '900001.KS': series('900001.KS', 'KR', Object.assign(flat(100), { '2026-09-14': 105 }), { fetched, meta: { currentTradingPeriod: krPeriod, regularMarketTime: ts(lastTrade) } }),
      '^KS11': series('^KS11', 'KR', Object.assign(flat(3000), { '2026-09-14': 3000 }), { fetched, meta: { currentTradingPeriod: krPeriod, regularMarketTime: ts(lastTrade) } }),
      ZZDV: series('ZZDV', 'US', flat(100), { fetched }), '^GSPC': series('^GSPC', 'US', flat(7000), { fetched }),
      'KRW=X': series('KRW=X', 'FX', flat(1300), { fetched })
    },
    dates: ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'], owners: withUs ? ['신랑', '와이프'] : ['신랑']
  });
  // 화면에 글자로 보이는 상태만 비교한다 - 전날(일요일)의 직전 종가 유지(closedCarry)는 내부 상태로만 남고 표시하지 않는다.
  const shown = (flags) => [...flags].filter((f) => f !== 'closedCarry');
  const inSession = build('2026-09-14T06:00:00Z', '2026-09-14T05:59:00Z', false);
  close(inSession.pnl('2026-09-14').owners['신랑'], 50, '장중 잠정값으로 계산');
  assert.deepStrictEqual(shown(inSession.pnl('2026-09-14').ownerFlags['신랑']), ['provisional']);
  close(inSession.pnl('2026-09-12').owners['신랑'], 0, '토요일 = 직전 종가 유지 → 0');
  const confirmed = build('2026-09-14T06:40:00Z', '2026-09-14T06:30:20Z', false);
  close(confirmed.pnl('2026-09-14').owners['신랑'], 50, '종가 확인');
  assert.deepStrictEqual(shown(confirmed.pnl('2026-09-14').ownerFlags['신랑']), [], '확정은 표시 없음');
  const mixed = build('2026-09-14T06:40:00Z', '2026-09-14T06:30:20Z', true);
  assert.deepStrictEqual(shown(mixed.pnl('2026-09-14').ownerFlags['신랑']), [], '한국은 확정');
  assert.ok(mixed.pnl('2026-09-14').ownerFlags['와이프'].includes('provisional'), '뉴욕은 아직 그날 장 전 → 잠정');
  assert.ok(mixed.pnl('2026-09-14').flags.includes('provisional'), '합계도 잠정');
});

function gapWorld({ closes, index, dates }) {
  return run({
    assets: [A({ id: 's', ticker: '900001.KS', owner: '신랑', category: '주식', name: 'DV_S', positionSource: 'ledger' })],
    transactions: [T({ id: 'b0', date: '2026-09-01', owner: '신랑', ticker: '900001.KS', name: 'DV_S', quantity: 10, price: 100 })],
    seriesBySymbol: { '900001.KS': series('900001.KS', 'KR', closes), '^KS11': index },
    dates, owners: ['신랑']
  });
}

test('8. [휴장] 주말 · 확인된 휴장 = 직전 종가 유지(손익 0) · 기준지수 조회 실패는 휴장이 아니라 결측(추정)', () => {
  const closes = Object.assign(flat(100), { '2026-09-09': 110, '2026-09-10': 110, '2026-09-11': 110 });
  delete closes['2026-09-08'];
  const indexNo98 = flat(3000);
  delete indexNo98['2026-09-08'];
  const dates = ['2026-09-08', '2026-09-09', '2026-09-12'];
  const holiday = gapWorld({ closes, index: series('^KS11', 'KR', indexNo98), dates });
  close(holiday.pnl('2026-09-08').owners['신랑'], 0, '확인된 휴장');
  assert.deepStrictEqual([...holiday.pnl('2026-09-08').ownerFlags['신랑']], ['closedCarry']);
  close(holiday.pnl('2026-09-09').owners['신랑'], 100, '휴장 다음 거래일 = 직전 거래일 종가 대비');
  close(holiday.pnl('2026-09-12').owners['신랑'], 0, '토요일');
  const missing = gapWorld({ closes, index: series('^KS11', 'KR', flat(3000)), dates });
  assert.deepStrictEqual([...missing.pnl('2026-09-08').ownerFlags['신랑']], ['estimated'], '지수는 열렸는데 종목만 없음 = 추정');
  const indexFailed = gapWorld({ closes, index: { ok: false, symbol: '^KS11', reason: 'fetchFailed' }, dates });
  assert.deepStrictEqual([...indexFailed.pnl('2026-09-08').ownerFlags['신랑']], ['estimated'], '지수 조회 실패를 휴장으로 보지 않는다');
});

test('9. [K=3] 평일 결측 1~3거래일은 추정 · 4거래일 이상은 계산 불가(null)', () => {
  const three = Object.assign(flat(100), { '2026-09-11': 120 });
  ['2026-09-08', '2026-09-09', '2026-09-10'].forEach((d) => delete three[d]);
  const w3 = gapWorld({ closes: three, index: series('^KS11', 'KR', flat(3000)), dates: ['2026-09-10', '2026-09-11'] });
  close(w3.pnl('2026-09-10').owners['신랑'], 0, '3거래일 결측 → 추정');
  assert.deepStrictEqual([...w3.pnl('2026-09-10').ownerFlags['신랑']], ['estimated']);
  close(w3.pnl('2026-09-11').owners['신랑'], 200, '다음 날 종가 120 − 추정 100');
  assert.deepStrictEqual([...w3.pnl('2026-09-11').ownerFlags['신랑']], ['estimated'], '전날이 추정이면 그날 손익도 추정');
  const four = flat(100);
  WEEK.slice(1).forEach((d) => delete four[d]);
  const w4 = gapWorld({ closes: four, index: series('^KS11', 'KR', flat(3000)), dates: ['2026-09-10', '2026-09-11'] });
  close(w4.pnl('2026-09-11').owners['신랑'], null, '4거래일 결측 → null');
  assert.ok(w4.pnl('2026-09-11').reasons.includes('missingLong'));
  close(w4.pnl('2026-09-11').total, null);
});

test('10. [M4] 보유 중 분할이 있으면 분할일까지의 손익은 계산하지 않는다(전날 종가와 원장 수량 기준이 다를 수 있다)', () => {
  const w = run({
    assets: [A({ id: 'p', ticker: 'ZZSP', owner: '와이프', category: '주식', name: 'DV_P', currency: 'USD', isDomestic: '해외', positionSource: 'ledger' })],
    transactions: [T({ id: 'p1', date: '2026-09-01', owner: '와이프', ticker: 'ZZSP', name: 'DV_P', quantity: 4, price: 10, currency: 'USD', appliedRate: 1300 })],
    // 총자산 계산(v241)은 소유자마다 D일 이전 기록이 하나는 있어야 한다 - 이 소유자는 현금 · 부동산 · 채권이 없는 기록(값 0)이다.
    snapshots: { '2026-09-01': snap({ '와이프': {} }) },
    seriesBySymbol: {
      ZZSP: series('ZZSP', 'US', flat(10), { splits: { s: { date: ts('2026-09-09T13:30:00Z'), numerator: 2, denominator: 1 } } }),
      '^GSPC': series('^GSPC', 'US', flat(7000)), 'KRW=X': series('KRW=X', 'FX', flat(1300))
    },
    dates: WEEK, owners: ['와이프']
  });
  closeList(w.pnlRows.map((r) => r.owners['와이프']), [null, null, null, 0, 0], '분할일(9/9)까지 null');
  assert.ok(w.pnlRows[2].reasons.includes('corporateActionUnverified'));
  closeList(w.tvRows.map((r) => r.owners['와이프']), [null, null, 52000, 52000, 52000], '총자산은 분할일 전날까지 null(v241 규칙 그대로)');
});

test('11. [마지막 기록값 유지] 현금 · 부동산 · 채권 - 총자산은 첫 기록 이전 null · 이후 마지막 값 유지 / 일별 손익은 시세가 없어 0(스냅샷 불필요)', () => {
  const w = run({
    assets: [
      A({ id: 'c', ticker: '', owner: '신랑', category: '현금', name: '원화', quantity: 1, currentPrice: 1500, positionSource: 'manual' }),
      A({ id: 'b', ticker: '', owner: '신랑', category: '채권', name: '국고채', quantity: 1, currentPrice: 2000, positionSource: 'manual' }),
      A({ id: 'r', ticker: '', owner: '신랑', category: '부동산', name: '집', quantity: 1, currentPrice: 3000, positionSource: 'manual' })
    ],
    transactions: [],
    snapshots: {
      '2026-09-09': snap({ '신랑': { '현금': 1000, '채권': 2000, '부동산': 3000 } }),
      '2026-09-11': snap({ '신랑': { '현금': 1500, '채권': 2000, '부동산': 3000 } })
    },
    seriesBySymbol: {}, dates: WEEK, owners: ['신랑']
  });
  closeList(w.tvRows.map((r) => r.owners['신랑']), [null, null, 6000, 6000, 6500], '총자산');
  assert.ok(w.tv('2026-09-10').ownerFlags['신랑'].includes('maintained'));
  assert.ok(w.tv('2026-09-08').ownerReasons['신랑'].includes('beforeFirstRecord'));
  closeList(w.pnlRows.map((r) => r.owners['신랑']), [0, 0, 0, 0, 0], '일별 손익');
  w.pnlRows.forEach((r) => assert.deepStrictEqual([...r.ownerFlags['신랑']], []));
});

test('12. [기간 통일] 당월/3/6/12개월 = 이번 달 포함 (N−1)개월 전 1일 ~ 오늘 - 월초 · 월말 · 연도 변경 · 윤년 · 오늘 포함', () => {
  const RealDate = Date;
  const fixedDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return class extends RealDate {
      constructor(...args) { if (args.length === 0) super(y, m - 1, d, 12, 0, 0); else super(...args); }
      static now() { return new RealDate(y, m - 1, d, 12, 0, 0).getTime(); }
    };
  };
  const cases = [
    ['2026-09-14', { 1: ['2026-09-01', 14], 3: ['2026-07-01', 76], 6: ['2026-04-01', 167], 12: ['2025-10-01', 349] }],
    ['2026-09-01', { 1: ['2026-09-01', 1], 3: ['2026-07-01', 63] }],
    ['2026-10-31', { 1: ['2026-10-01', 31], 3: ['2026-08-01', 92], 6: ['2026-05-01', 184] }],
    ['2027-01-15', { 1: ['2027-01-01', 15], 3: ['2026-11-01', 76], 12: ['2026-02-01', 349] }],
    ['2028-02-29', { 1: ['2028-02-01', 29], 3: ['2027-12-01', 91], 12: ['2027-03-01', 366] }],
    ['2028-12-31', { 12: ['2028-01-01', 366] }]
  ];
  const original = SB.Date;
  try {
    cases.forEach(([today, expected]) => {
      SB.Date = fixedDate(today);
      assert.strictEqual(SB.todayDateStr(), today);
      Object.entries(expected).forEach(([months, [start, days]]) => {
        const n = SB.daysSinceMonthsAgoStart(Number(months));
        const list = SB.dvDateList(SB.todayDateStr(), n);
        assert.deepStrictEqual([n, list[0], list[list.length - 1]], [days, start, today], `${today} ${months}개월`);
      });
    });
  } finally {
    SB.Date = original;
  }
});
