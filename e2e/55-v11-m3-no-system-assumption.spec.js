// E2E-55 V1.1 M3 - "지원되는 장기 수익률 가정이 없음"과 "0%로 계산됨"을 구분한다.
//
// [무엇이 문제였나]
// 원자재·가상자산은 category가 그대로 Return Key가 되는데(원자재/암호화폐),
// resolveProjectionRateForKey는 그런 키를 모르므로 마지막에 0을 돌려준다. 그런데 화면은
// "적합한 장기 수익률 가정을 사용하고 있습니다"라고 말했다 - 사용자는 앱이 금·비트코인의 장기
// 기대수익률을 0%라고 판단했다고 읽게 된다. 그건 이 앱의 정책이 아니다.
//
// [이번에 바꾼 것과 바꾸지 않은 것]
//   바꾼 것   : 그 상태의 "의미 표시"뿐. NO_SYSTEM_ASSUMPTION 상태와 문구를 분리했다.
//   안 바꾼 것: 수익률 숫자. 원자재/암호화폐는 여전히 0%로 계산된다(그 판단은 별도 승인 사항).
//
// [세 상태를 섞지 않는다]
//   A 시스템 가정 있음        -> 기존 표시 그대로(현금 0%, 채권 4% 등)
//   B 시스템 가정 없음        -> ⚠ + "가정이 아직 없다" + "0%가 기대수익률이라는 뜻이 아니다"
//   C 사용자가 직접 지정      -> 사용자 값 최우선, "사용자 지정"으로 표시(B로 잘못 표시하지 않는다)
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof describeAppliedReturnAssumption === 'function'
    && RETURN_ASSUMPTION_STATUS.NO_SYSTEM_ASSUMPTION !== undefined);
}

// state를 건드린 뒤 반드시 원복한다.
const withState = (page, body) => page.evaluate((b) => {
  const snap = { assets: JSON.parse(JSON.stringify(state.assets)),
    tx: JSON.parse(JSON.stringify(state.transactions)),
    csr: JSON.parse(JSON.stringify(state.projection.customScenarioRates || {})) };
  try { return new Function(b)(); }
  finally {
    state.assets = snap.assets; state.transactions = snap.tx;
    state.projection.customScenarioRates = snap.csr;
  }
}, body);

const PROBE = `
  const probe = (name, category, opts) => {
    const a = makeAsset({ ticker: (opts && opts.ticker) || '', owner: '신랑', accountType: '일반계좌',
      name, category, currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1000 });
    if (opts && opts.override) a.rateMatchOverride = opts.override;
    state.projection.customScenarioRates = (opts && opts.custom) || {};
    state.assets = [a];
    const d = describeAppliedReturnAssumption(a);
    return { 자산: name, 적용키: resolveAssetGroupKeyDetail(a).key, status: d.status, tone: d.tone,
      방식: d.sourceLabel, 라벨: d.keyLabel, isUserSet: d.isUserSet, 문구: d.message,
      수익률: [getAssetProjectionRate(a, 'conservative'), getAssetProjectionRate(a, 'normal'),
        getAssetProjectionRate(a, 'optimistic')] };
  };
`;

/* ══════ 상태 B — 시스템 가정 없음 ══════ */

test('1·2. 원자재/가상자산은 "가정 없음"으로 표시되고 0%를 기대수익률로 말하지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, PROBE + `
    return [probe('금 현물', '원자재'), probe('비트코인', '암호화폐')];
  `);
  for (const r of got) {
    expect(r.status, `${r.자산} 상태`).toBe('NO_SYSTEM_ASSUMPTION');
    expect(r.tone, `${r.자산} 색조는 확인 필요 쪽`).toBe('weak');
    // 계산값은 이번 Phase에서 바꾸지 않는다.
    expect(r.수익률, `${r.자산} 계산은 그대로 0%`).toEqual([0, 0, 0]);
    // PM이 금지한 표현이 남아 있으면 안 된다.
    expect(r.문구).not.toContain('적합한 장기 수익률 가정을 사용');
    expect(r.문구).not.toContain('보수적');
    expect(r.문구).not.toContain('안전한 가정');
    // 초보자가 오해하지 않도록 세 가지를 모두 말해야 한다.
    expect(r.문구, '가정이 없다는 사실').toContain('아직 없습니다');
    expect(r.문구, '지금은 0%로 계산된다는 사실').toContain('0%');
    expect(r.문구, '0%가 기대수익률이 아니라는 사실').toContain('뜻은 아닙니다');
    expect(r.문구, '어디서 지정하는지').toContain('수익률 관리');
  }
  expect(got[0].문구).toContain('금·원자재');
  expect(got[1].문구).toContain('가상자산');
});

/* ══════ 상태 C — 사용자 지정 보호 ══════ */

test('3·4. rateMatchOverride가 있으면 사용자 값이 최우선이고 "가정 없음"으로 표시되지 않는다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, PROBE + `
    return [probe('금 현물', '원자재', { override: 'BOND' }),
      probe('비트코인', '암호화폐', { override: 'KOSPI' })];
  `);
  expect(got[0].적용키).toBe('BOND');
  expect(got[0].수익률, '사용자 지정 키의 값이 그대로 적용된다').toEqual([3.5, 4, 5.5]);
  expect(got[1].적용키).toBe('KOSPI');
  expect(got[1].수익률).toEqual([5, 7, 11]);
  for (const r of got) {
    expect(r.status, '가정 없음으로 잘못 표시하지 않는다').not.toBe('NO_SYSTEM_ASSUMPTION');
    expect(r.방식).toBe('사용자 지정');
    // 성격과 다른 기준을 골랐으므로 기존 NEEDS_REVIEW 안내가 그대로 나온다(이번에 바꾸지 않았다).
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.문구).toContain('확인해 주세요');
  }
});

test('5. customScenarioRates가 있으면 그 값이 적용되고 "사용자 지정"으로 표시된다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, PROBE + `
    return [
      probe('금 현물', '원자재', { custom: { '원자재': { label: '원자재', conservative: 1, normal: 2, optimistic: 3 } } }),
      probe('비트코인', '암호화폐', { custom: { '암호화폐': { label: '암호화폐', conservative: 4, normal: 6, optimistic: 9 } } })
    ];
  `);
  expect(got[0].수익률, '사용자가 넣은 값이 그대로 계산된다').toEqual([1, 2, 3]);
  expect(got[1].수익률).toEqual([4, 6, 9]);
  for (const r of got) {
    expect(r.status, '가정 없음으로 잘못 표시하지 않는다').toBe('USER_DEFINED');
    expect(r.isUserSet, '자기가 넣은 값인데 자동 판별로 보이면 안 된다').toBe(true);
    expect(r.방식).toBe('사용자 지정');
    expect(r.문구).toContain('사용자가 지정한');
    expect(r.문구).not.toContain('아직 없습니다');
  }
});

test('5-2. 사용자가 0%를 직접 넣은 것과 시스템 가정이 없는 것을 구분한다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, PROBE + `
    return { 가정없음: probe('금 현물', '원자재'),
      사용자가_0입력: probe('금 현물', '원자재',
        { custom: { '원자재': { label: '원자재', conservative: 0, normal: 0, optimistic: 0 } } }) };
  `);
  // 두 경우 모두 계산값은 0%지만 의미가 다르다 - 화면이 그 차이를 말해야 한다.
  expect(got.가정없음.수익률).toEqual([0, 0, 0]);
  expect(got.사용자가_0입력.수익률).toEqual([0, 0, 0]);
  expect(got.가정없음.status).toBe('NO_SYSTEM_ASSUMPTION');
  expect(got.사용자가_0입력.status).toBe('USER_DEFINED');
  expect(got.가정없음.문구).not.toBe(got.사용자가_0입력.문구);
});

/* ══════ 6. 기존 Return Key 자산 회귀 ══════ */

test('6. 시스템 가정이 있는 자산은 표시도 계산도 그대로다', async ({ page }) => {
  await boot(page);
  const got = await withState(page, PROBE + `
    return [
      probe('삼성전자', undefined, { ticker: '005930.KS' }),
      probe('KODEX 200', undefined, { ticker: '069500.KS' }),
      probe('국고채 10년', '채권'),
      probe('생활비 통장', '현금'),
      probe('서울 아파트', '부동산'),
      probe('전세보증금', undefined)
    ];
  `);
  const by = Object.fromEntries(got.map((r) => [r.자산, r]));
  // 가정이 있는 자산은 예전 그대로 OK + "적합한 가정" 문구를 유지한다.
  for (const n of ['삼성전자', 'KODEX 200', '국고채 10년', '생활비 통장', '서울 아파트']) {
    expect(by[n].status, `${n} 상태`).toBe('OK');
    expect(by[n].tone, `${n} 색조`).toBe('ok');
    expect(by[n].문구, `${n} 문구`).toBe('적합한 장기 수익률 가정을 사용하고 있습니다.');
  }
  expect(by['삼성전자'].수익률).toEqual([5, 7, 11]);
  expect(by['국고채 10년'].수익률).toEqual([3.5, 4, 5.5]);
  expect(by['생활비 통장'].수익률, '현금 0%는 정책상 옳은 가정이다').toEqual([0, 0, 0]);
  expect(by['서울 아파트'].수익률).toEqual([3, 5.5, 8]);
  // 성격을 모르는 자산은 예전처럼 UNRESOLVED로 남는다(가정 없음과 다른 상태다).
  expect(by['전세보증금'].status).toBe('UNRESOLVED');
  expect(by['전세보증금'].문구).toContain('찾지 못해');
});

/* ══════ 7·8. 계산 불변 ══════ */

test('7·8. 결정론적 예측과 Monte Carlo 입력이 이번 변경으로 달라지지 않는다', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(async () => {
    const snap = { a: JSON.parse(JSON.stringify(state.assets)),
      t: JSON.parse(JSON.stringify(state.transactions)) };
    try {
      const mk = (name, ticker, cat) => makeAsset({ ticker, owner: '신랑', accountType: '일반계좌',
        name, category: cat, currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1200 });
      state.assets = [mk('삼성전자', '005930.KS'), mk('KODEX 200', '069500.KS'),
        mk('국고채', '', '채권'), mk('금 현물', '', '원자재'), mk('비트코인', '', '암호화폐')];
      state.transactions = [];
      const g = getProjectionGroupStats(null);
      const mc = await buildMonteCarloInputFromState({ presetKey: 'normal' });
      return {
        결정론_그룹: Object.keys(g).sort().map((k) => [k, Math.round(g[k].value)]),
        총평가액: Math.round(state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0)),
        적용키: state.assets.map((a) => [a.name, resolveAssetGroupKeyDetail(a).key]),
        수익률: state.assets.map((a) => [a.name, getAssetProjectionRate(a, 'normal')]),
        MC: { order: mc.assetOrder, errors: mc.errors,
          instruments: (mc.instruments || []).map((i) => [i.key, i.weight, i.muAnnual, i.sigmaAnnual]) }
      };
    } finally { state.assets = snap.a; state.transactions = snap.t; }
  });
  // 적용 키와 수익률 숫자는 M3 이전과 동일해야 한다 - 이번 변경은 "표시"만 바꿨다.
  // 삼성전자의 적용 키는 KOSPI다 - Phase 47-A에서 전용 프리셋을 폐지해 국내 지수 앵커를 상속한다.
  expect(got.적용키).toEqual([['삼성전자', 'KOSPI'], ['KODEX 200', 'KOSPI'],
    ['국고채', '채권'], ['금 현물', '원자재'], ['비트코인', '암호화폐']]);
  expect(got.수익률).toEqual([['삼성전자', 7], ['KODEX 200', 7], ['국고채', 4],
    ['금 현물', 0], ['비트코인', 0]]);
  // getProjectionGroupStats는 category가 아니라 적용 Return Key로 묶는다 - 삼성전자와 KODEX 200이
  // 둘 다 KOSPI라 한 그룹이다. 원자재/암호화폐는 각자 자기 키로 남아 원금에 그대로 들어간다.
  expect(got.결정론_그룹).toEqual([['KOSPI', 24000], ['암호화폐', 12000],
    ['원자재', 12000], ['채권', 12000]]);
  expect(got.총평가액).toBe(60000);
  expect(got.MC.errors).toEqual([]);
});

/* ══════ 9~12. 모바일 375px · 다크 · 가독성 · 넘침 ══════ */

test('9~12. 375px 다크에서 읽을 수 있고 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await boot(page);
  await page.locator('#assetDetailModal').evaluate((el) => {
    el.ownerDocument.documentElement.classList.add('dark');
  });
  await page.evaluate(() => {
    state.transactions = [];
    state.projection.customScenarioRates = {};
    state.assets = [makeAsset({ ticker: '', owner: '신랑', accountType: '일반계좌', name: '금 현물',
      category: '원자재', currency: 'KRW', quantity: 10, buyPrice: 1000, currentPrice: 1000,
      positionSource: 'manual' })];
    renderAll();
    openAssetDetailModal(state.assets[0].id);
  });
  await page.waitForTimeout(400);
  const got = await page.locator('#assetDetailReturnAssumption').evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const ps = [...el.querySelectorAll('p, span')].filter((n) => n.textContent.trim());
    const 최소폰트 = Math.min(...ps.map((n) => parseFloat(win.getComputedStyle(n).fontSize)));
    const msg = el.querySelector('p:last-of-type');
    return { 표시됨: !el.classList.contains('hidden'), 문구: msg.textContent.trim(),
      최소폰트: Math.round(최소폰트 * 10) / 10,
      색: win.getComputedStyle(msg).color,
      기호로도_구분: msg.textContent.trim().startsWith('⚠'),
      가로스크롤: el.ownerDocument.documentElement.scrollWidth > el.ownerDocument.documentElement.clientWidth,
      요소넘침: el.scrollWidth > el.clientWidth };
  });
  expect(got.표시됨).toBe(true);
  expect(got.최소폰트, '14px 미만 금지').toBeGreaterThanOrEqual(14);
  expect(got.기호로도_구분, '색상만으로 상태를 표현하지 않는다').toBe(true);
  expect(got.가로스크롤, '페이지 가로 스크롤 없음').toBe(false);
  expect(got.요소넘침, '안내 영역이 넘치지 않음').toBe(false);
  expect(got.문구).toContain('아직 없습니다');
  expect(got.문구).not.toContain('적합한 장기 수익률 가정을 사용');
});
