// [Phase 5 E2E 공용 helper] 각 테스트가 알아야 할 것: 이 앱은 localStorage 기반 상태를 실제 앱
// 코드(state/persistAssets/persistRebalance/persistProjection, 전부 js/01)로 직접 세팅한 뒤
// reload해서 시작한다 - 이유는 다음과 같다.
//
// 1) 목표 비중 입력 UI(rebalanceTargetModal의 "종목 추가")는 종목 마스터 검색(js/09,
//    searchTickerMaster)에 의존하는데, 이건 네트워크/캐시 상태에 따라 결과가 달라져 E2E를
//    flaky하게 만든다. 반면 채권/현금(namedHolding) 종목은 σ=0으로 계산되어 가격 이력 조회 자체가
//    필요 없다(js/16 adapter의 isRiskFree 분기) - 이 계열만 쓰면 완전히 네트워크 독립적인 결정론적
//    시나리오를 만들 수 있다(Phase 3-5/4 세션 전체에서 실제로 이 방법으로 Safety Layer를 검증했다).
// 2) 개별 pct input은 앱 자신의 change 핸들러가 `Math.max(0, Math.min(100, ...))`으로 즉시 clamp한다
//    (js/04) - 즉 "-20%"처럼 실제로 잘못된 값은애초에 타이핑으로 만들 수 없다. Negative Weight
//    BLOCK(E2E-03)이 방어하는 실제 위험은 JSON 복원/클라우드 동기화 같은 "UI를 거치지 않는 경로"이므로
//    (Phase 3-5 세션에서 실측 확인된 사실), 그 경로를 정확히 재현하려면 state를 직접 세팅하는 것이
//    맞다 - UI 타이핑 흉내가 아니라 이 위험의 실제 진입점을 그대로 재현하는 것이다.
//
// 이 파일이 하는 일은 "계산을 대신 해주는 것"이 전혀 아니다 - state.rebalance/assets/projection을
// 세팅하고 실제 앱의 persist*()를 호출한 뒤 reload할 뿐이고, 그 다음 모든 계산/렌더링/Safety 판정은
// 전부 앱의 실제 코드가 수행한다.

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {Array<{owner:string, region:'국내'|'해외', name:string, pct:number}>} opts.targets
 * @param {number} [opts.assetValueEach] - 각 owner당 시드로 넣을 보유자산 평가금액(원)
 * @param {object} [opts.projection] - state.projection에 덮어씌울 필드(inflationRate 등)
 */
async function seedPortfolio(page, opts) {
  const { targets, assetValueEach = 100000000, projection = {} } = opts;
  await page.goto('/');
  // [주의] 이 앱은 <script> 태그로 로드되는 classic script라 top-level `const state`는 window의
  // 프로퍼티가 되지 않는다(함수 선언만 window에 붙는다) - 그래서 `window.state`가 아니라 페이지의
  // 실제 전역 스코프에서 그대로 평가되는 bare 참조(state/persistAssets)로 확인해야 한다.
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof persistAssets === 'function');

  await page.evaluate(({ targets, assetValueEach, projection }) => {
    // [필수] 완전히 새 브라우저 컨텍스트(localStorage 없음)로 처음 페이지를 열면 loadState()가
    // "진짜 첫 실행"으로 판단해 sampleAssets()(GOOGL/MSFT/QQQM/SK하이닉스/국고채 등 실제 데모 보유
    // 자산)를 자동으로 채워 넣는다(js/01) - 이걸 지우지 않고 그냥 push만 하면 household 자산총액에
    // 데모 자산 가치가 섞여 들어가 목표비중 가중치가 의도한 값에서 벗어난다(실측: 100%로 세팅했는데
    // computeHouseholdTargetInstrumentWeights가 41.66%로 계산됨 - 이 버그를 직접 겪고 고쳤다).
    state.assets = [];
    const owners = [...new Set(targets.map((t) => t.owner))];
    // 1) 보유자산 - 채권 카테고리(가격조회 불필요, calcRow가 quantity*currentPrice로 그대로 평가)
    owners.forEach((owner) => {
      const asset = makeAsset({
        name: `E2E보유자산-${owner}`, category: '채권', owner, accountType: '일반계좌',
        quantity: 1, buyPrice: assetValueEach, currentPrice: assetValueEach,
      });
      state.assets.push(asset);
    });

    // 2) 목표 비중 - 모든 owner를 먼저 빈 상태로 초기화한 뒤(데모/잔여 상태 제거), targets에 있는
    // owner만 실제 값으로 채운다.
    REBALANCE_OWNERS.forEach((owner) => {
      state.rebalance[owner].domestic = { '국내': 100, '해외': 0 };
      state.rebalance[owner].targets = { '국내': [], '해외': [] };
    });
    owners.forEach((owner) => {
      const ownerTargets = targets.filter((t) => t.owner === owner);
      const regions = [...new Set(ownerTargets.map((t) => t.region))];
      state.rebalance[owner].domestic = {
        '국내': regions.includes('해외') && !regions.includes('국내') ? 0 : (regions.includes('해외') ? 50 : 100),
        '해외': regions.includes('해외') ? (regions.includes('국내') ? 50 : 100) : 0,
      };
      ['국내', '해외'].forEach((region) => {
        state.rebalance[owner].targets[region] = ownerTargets
          .filter((t) => t.region === region)
          .map((t) => ({ type: 'namedHolding', name: t.name, pct: t.pct, role: '수비수' }));
      });
    });

    Object.keys(projection).forEach((key) => { state.projection[key] = projection[key]; });

    persistAssets();
    persistRebalance();
    persistProjection();
  }, { targets, assetValueEach, projection });

  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined');
  // [Phase 47-G] reload 이후에 넣어야 한다 - riskHistoryCache는 localStorage에 저장되지 않는
  // 메모리 캐시라 reload하면 사라진다.
  await seedPriceHistory(page);
}


/* [Phase 47-G] Monte Carlo σ 계산에 필요한 일별 종가를 네트워크 없이 공급한다.
 *
 * 배경: playwright.config.js가 테스트 브라우저의 외부 DNS를 막았다(실제 Cloudflare Worker/시세 API로
 * 요청이 나가지 않는다). 그러자 가격 이력이 필요한 테스트가 실패했는데, 이건 테스트가 틀려서가 아니라
 * 앱이 원래 그렇게 동작하기 때문이다 - buildMonteCarloInputFromState(js/16)는 위험자산의 가격 이력이
 * 없으면 σ를 0으로 채우지 않고 errors를 반환하며(의도된 설계), 그 경우 safety 객체 자체를 만들지
 * 않는다. 그래서 "목표비중 합계 BLOCK"처럼 데이터와 무관한 판정도 화면에 뜨지 못한다.
 *
 * 그래서 실제 시세 대신 결정론적 합성 시계열을 앱의 당일 캐시(state.riskHistoryCache)에 직접 넣는다.
 * getCachedDailyCloses(js/09)는 오늘 날짜 캐시가 있으면 네트워크를 아예 타지 않으므로, 이 한 줄로
 * "요청 0건 + 계산 가능"이 동시에 성립한다.
 *
 * 이 데이터는 시세의 정확성을 검증하는 용도가 아니다 - σ를 계산할 수 있는 최소한의 재료일 뿐이며,
 * 이 시계열을 쓰는 테스트들은 전부 Safety 판정/인플레이션 환산/진행률/muAnnual처럼 "가격 자체와
 * 무관한 것"을 검증한다. 오히려 실제 시세를 쓰던 예전보다 결정론적이다(매일 값이 달라지지 않는다).
 *
 * 가격 이력이 "없는 상태" 자체를 검증하는 테스트(e2e/19 케이스 2 등)에는 이 함수를 부르지 않는다 -
 * 그래서 전역 자동 주입이 아니라 명시적 opt-in 헬퍼로 둔다.
 */
const DEFAULT_HISTORY_TICKERS = ['^KS11', '^GSPC']; // js/05 buildHouseholdInstrumentReturnSeries가 namedHolding에 쓰는 지역 대표지수
async function seedPriceHistory(page, extraTickers = []) {
  await page.evaluate((tickers) => {
    const today = new Date().toISOString().slice(0, 10);
    // 결정론적 의사난수(선형합동) - seed가 같으면 항상 같은 시계열이 나온다.
    const series = (seed) => {
      let s = seed * 2654435761 % 2147483647;
      const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
      const closes = [], volumes = [], dates = [];
      let price = 100;
      const base = new Date();
      base.setDate(base.getDate() - 252);
      for (let i = 0; i < 252; i++) {
        // 일간 표준편차 약 1.1% -> 연 환산 약 18%(실제 주식 지수와 비슷한 수준)
        price *= 1 + (rnd() - 0.5) * 0.022;
        closes.push(Math.round(price * 100) / 100);
        volumes.push(1000000 + Math.round(rnd() * 100000));
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
      }
      return { closes, volumes, dates };
    };
    tickers.forEach((t, i) => { state.riskHistoryCache[t] = { date: today, data: series(i + 1) }; });
  }, [...DEFAULT_HISTORY_TICKERS, ...extraTickers]);
}

// 미래예측 탭까지 이동(포트폴리오/자산예측 -> 미래 예측 서브탭)
async function goToProjectionTab(page) {
  await page.getByText('포트폴리오/자산예측').click();
  await page.getByText('미래 예측', { exact: true }).click();
}

module.exports = { seedPortfolio, goToProjectionTab, seedPriceHistory };
