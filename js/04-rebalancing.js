/* -------------------------------------------------------------------------
 * 10-2. 포트폴리오 구성 검토
 *    - 필터와 무관하게 항상 전체 포트폴리오 기준으로 계산한다(자산배분은 포트폴리오 전체를 보는 도구).
 *    - 목표비중 입력창은 카테고리 목록이 바뀔 때(자산 추가/삭제 등)만 다시 그리고, 값 변경 시에는
 *      결과 카드만 갱신해 타이핑 중 포커스가 끊기지 않게 한다.
 * ---------------------------------------------------------------------- */
// 지역(국내/해외) 안에서 목표 항목(티커 지정 또는 자산군 캐치올)에 매칭되는 현재 평가금액을 계산한다.
// 티커형 항목을 먼저 매칭해 자산을 "선점"시키고(claimedIds), 자산군 캐치올은 이미 선점된 자산을
// 제외한 나머지만 합산한다 - 이중 집계를 막는다. 어느 항목에도 매칭되지 않는 자산(예: 부동산 같은
// 실물자산)은 매수/매도로 조절할 수 없으므로 목표 비중 계산 대상에서 자동으로 제외된다.
// targetsOverride: 기본은 state.rebalance.targets[region](사용자가 편집하는 원본, '주식' 항목이
// selectedStocks를 포함해도 한 항목으로 남아있다). 종목별 실행 가이드/세부 결과 카드처럼 선택된
// 개별 종목을 각자 따로 계산해야 하는 곳은 expandRebalanceTargetsForComputation(region)으로 "펼친"
// 목록을 넘긴다 - 매칭 로직 자체는 동일하게 재사용한다.
// ownerFilter: [소유자별 독립 리밸런싱 목표 - Option B] 이제 항상 실제 소유자명(REBALANCE_OWNERS 중
// 하나)이 필수로 넘어온다 - 가구 통합('all') 모드는 더 이상 없다(그 소유자만의 목표 vs 그 소유자만의
// 보유자산을 항상 짝지어 계산한다). isAssetIncludedForOwner는 하위 호환을 위해 'all'/undefined도
// "필터 없음(전체 포함)"으로 계속 허용한다 - Part 3 포지션별 비중 분석 카드(합산 보기)가 이 관용을 쓴다.
function isAssetIncludedForOwner(a, ownerFilter) {
  return !ownerFilter || ownerFilter === 'all' || a.owner === ownerFilter;
}
function computeRegionTargetAmounts(region, targetsOverride, ownerFilter) {
  const targets = targetsOverride || state.rebalance[ownerFilter].targets[region] || [];
  // [버그 수정 - 평가금액 0원인 유령 자산 제외] 전량 매도된 포지션은 자산 목록에서 삭제되지 않고
  // 수량만 0으로 남는다(syncAssetsFromTransactions 참고, 삭제는 사용자가 원할 때 직접 하도록 의도적으로
  // 남겨둠). [버그 수정 2 - 수량만으론 부족] 채권처럼 수동 등록하는 자산은 수량은 남아있는데 시세(가격)가
  // 0/미입력이라 평가금액만 0인 경우도 있다 - 수량이 아니라 실제 평가금액(calcRow(a).curAmount)이 0인
  // 자산을 걸러야 두 경우 다 잡힌다. 이 필터가 없으면 평가금액 0원인 종목이 계속 목표 카테고리에
  // 매칭돼 "0원 보유 · 매수 필요"인 행으로 실행 가이드/엑셀 다운로드에 계속 나타난다.
  const regionAssets = state.assets.filter((a) => a.isDomestic === region && isRebalanceEligibleAccount(a) && isAssetIncludedForOwner(a, ownerFilter) && Math.round(calcRow(a).curAmount) !== 0);
  const claimedIds = new Set();
  // assetId -> targetIdx. 종목별 실행 가이드(computeIndividualRebalanceGuide)가 "이 자산은
  // 정확히 어느 목표 항목에 묶였는가"를 알아야 그 항목의 목표금액을 개별 종목 단위로 다시 나눠줄 수
  // 있으므로, 매칭 결과를 여기서 함께 기록해 반환한다(매칭 로직을 두 곳에 중복 구현하지 않기 위함).
  const claimedTargetIdx = new Map();
  const amounts = new Array(targets.length).fill(0);

  targets.forEach((t, idx) => {
    if (t.type !== 'ticker') return;
    const targetYahoo = sanitizeTicker(t.ticker).yahooTicker;
    if (!targetYahoo) return;
    regionAssets.forEach((a) => {
      if (claimedIds.has(a.id)) return;
      if (sanitizeTicker(a.ticker).yahooTicker === targetYahoo) {
        amounts[idx] += calcRow(a).curAmount;
        claimedIds.add(a.id);
        claimedTargetIdx.set(a.id, idx);
      }
    });
  });
  targets.forEach((t, idx) => {
    if (t.type !== 'category') return;
    regionAssets.forEach((a) => {
      if (claimedIds.has(a.id)) return;
      // ETF는 별도 자산군이 아니라 실질적으로 주식형 상품이므로, 지정 티커에 안 걸린 ETF도 '주식'
      // 목표 항목에 그대로 매칭되게 한다(예: TIGER 미국S&P500처럼 이름이 지정 티커와 다른 ETF들이
      // "목표 항목 없음"으로 목표 비중 계산에서 통째로 빠지는 문제를 막는다).
      const matchesCategory = a.category === t.category || (a.category === 'ETF' && t.category === '주식');
      if (matchesCategory) {
        amounts[idx] += calcRow(a).curAmount;
        claimedIds.add(a.id);
        claimedTargetIdx.set(a.id, idx);
      }
    });
  });

  const coveredTotal = amounts.reduce((s, v) => s + v, 0);
  const uncoveredTotal = regionAssets.reduce((s, a) => s + (claimedIds.has(a.id) ? 0 : calcRow(a).curAmount), 0);
  return { amounts, coveredTotal, uncoveredTotal, claimedTargetIdx, targets };
}

// [개별주식 다중 설정] '주식' 캐치올에 selectedStocks(최대 3개)가 지정돼 있으면, 실제 목표 비중 계산
// (매칭·목표금액·종목별 가이드)에서는 이를 각각 독립된 티커 목표로 "펼쳐서" 다룬다 - 그래야 지정한
// 종목이 하나의 뭉치로 묶여 "현재 비중 비율대로" 나눠 갖는 게 아니라 자기 비중만큼의 목표금액/증감을
// 온전히 따로 갖는다. 지정하지 않은 나머지 보유 주식(같은 지역의 주식/ETF 중 3종목에 안 걸린 것들)은
// "주식(기타)" 항목으로 남기되 목표 비중을 강제로 0%로 고정한다 - 이렇게 해야 아직 지정 안 한 기존
// 보유 종목이 "목표 항목 없음"으로 조용히 제외(uncovered, 부동산과 같은 취급)되는 대신, 명시적으로
// 매도 대상(목표 0%→전량 매도)으로 계산에 반영된다. 이 펼쳐진 목록은 계산 전용이고, 사용자가 실제로
// 편집하는 state.rebalance.targets[region](원본, 3개 고정 항목 구조)은 그대로 둔다.
function expandRebalanceTargetsForComputation(owner, region) {
  const raw = state.rebalance[owner].targets[region] || [];
  const expanded = [];
  raw.forEach((t) => {
    if (t.type === 'category' && t.category === '주식' && Array.isArray(t.selectedStocks) && t.selectedStocks.length > 0) {
      t.selectedStocks.forEach((s) => {
        // [포지션별 비중 분석 - 목표 비중 기준 집계, 요청 반영] s.role을 그대로 넘겨줘야 아래
        // computeOwnerTargetRoleWeights()가 selectedStocks 안에 개별 지정된 종목의 포지션까지
        // 놓치지 않고 집계한다 - 예전엔 이 role이 펼쳐지는 과정에서 버려져 있었다. [티커별 역할
        // 단일 소스 - 자동 연동] 이 항목 자체에 role이 없어도 레지스트리에 등록된 값으로 폴백한다 -
        // 이 카드는 모달을 연 적 없는 티커도 집계하므로 cloneRebalanceTargetList의 폴백만으론 부족하다.
        expanded.push({ type: 'ticker', ticker: s.ticker, label: s.name, pct: num(s.pct), role: s.role || getTickerRole(s.ticker) });
      });
      expanded.push({ type: 'category', category: '주식', label: '주식(기타)', pct: 0 });
    } else {
      expanded.push(t.type === 'ticker' ? { ...t, role: t.role || getTickerRole(t.ticker) } : t);
    }
  });
  return expanded;
}

// computeRegionTargetAmounts(region)을 항상 "펼쳐진" 목록 기준으로 실행하는 편의 함수 - 종목별 실행
// 가이드/세부 결과 카드 등 개별 종목 단위 계산이 필요한 곳에서 쓴다.
function computeExpandedRegionTargetAmounts(region, ownerFilter) {
  return computeRegionTargetAmounts(region, expandRebalanceTargetsForComputation(ownerFilter, region), ownerFilter);
}

// 종목별 실행 가이드: 자산군/티커 단위로 뭉쳐 있던 "목표금액"을 실제 보유 중인 개별 종목
// 단위로 풀어낸다. 주의: computeRegionTargetAmounts()가 돌려주는 amounts는 그 항목에 매칭된 자산의
// "현재" 평가금액 합계이지 목표금액이 아니다 - 실제 목표금액은 아래(지역 목표금액 × 항목 비중%) 공식으로
// 별도 계산한다.
//   - 특정 티커로 지정된 목표(KODEX 200TR, QQQM 등)는 그 목표금액을 그대로 쓴다(보통 종목 1개뿐이지만,
//     여러 소유자가 같은 티커를 나눠 보유하는 경우까지 대비해 아래 "그룹 내 비중대로 분배"를 동일하게 적용).
//   - 자산군 캐치올(주식/채권/현금)에 묶인 여러 종목은 그 캐치올 목표금액을 "현재 각 종목이 그룹 내에서
//     차지하는 비중"대로 나눠 갖는다 - 즉 캐치올 전체가 늘거나 줄어야 하는 비율만큼 그 안의 모든 종목이
//     동일한 비율로 조정된다고 가정한다(개별 종목마다 별도 목표를 지정하지 않은 이상 가장 자연스러운
//     기본 가정).
//   - 어느 목표에도 매칭되지 않는 자산(부동산 등 실물자산)은 excluded로 따로 반환한다.
//   - 소유자가 달라도 동일 종목(티커, 티커가 없으면 이름)은 하나의 행으로 합산한다 - 신랑/와이프가
//     같은 종목을 나눠 보유해도 "종목 하나당 매수/매도 실행 가이드 하나"만 나오게 한다(단, ownerFilter로
//     특정 소유자를 지정하면 애초에 그 소유자의 자산만 대상이라 이 합산은 자연히 그 사람 것만 남는다).
// ownerFilter: 'all'/undefined면 가구 전체(기존 동작), 특정 소유자명이면 그 소유자의 자산만으로 "독립된
// 포트폴리오"를 가정해 같은 목표 비중(%)을 적용한 매수/매도 가이드를 만든다(실행 가이드의
// 소유자별 필터 전용).
// [버그 수정 - 소유자 필터 시 미보유 목표 종목 누락] 특정 소유자(예: 와이프)가 어떤 목표 항목을
// 하나도 보유하지 않을 때, 그 종목의 시세/통화를 알아야 목표금액 대비 매수 수량을 계산할 수 있다 -
// 목표로 지정된 티커는 보통 가구 내 누군가는 실제로 보유하고 있으므로, 소유자 필터와 무관하게 가구
// 전체에서 같은 티커를 가진 자산을 하나 찾아 그 시세/통화를 빌려 쓴다(정말 아무도 안 산 티커라면
// 시세를 알 방법이 없어 수량은 0으로 남는다 - 틀린 값보다 빈 값이 낫다).
function findAnyHouseholdAssetByTicker(ticker) {
  const target = sanitizeTicker(ticker).yahooTicker;
  if (!target) return null;
  return state.assets.find((a) => sanitizeTicker(a.ticker).yahooTicker === target) || null;
}

function computeIndividualRebalanceGuide(ownerFilter) {
  const rows = [];
  const excluded = [];
  const { total } = getRebalanceTotals(ownerFilter);

  ['국내', '해외'].forEach((region) => {
    // 개별 지정 종목(selectedStocks)이 있으면 "펼쳐진" 목록을 써서 그 종목들이 각자 자기 비중만큼의
    // 목표를 따로 갖고, 지정 안 한 나머지 보유 주식은 목표 0%(전량 매도)로 계산되게 한다.
    const { claimedTargetIdx, targets } = computeExpandedRegionTargetAmounts(region, ownerFilter);
    // [버그 수정 - 평가금액 0원인 유령 자산 제외] computeRegionTargetAmounts와 동일한 이유(수량 0 또는
    // 가격 미입력으로 평가금액이 0인 자산 제외).
    const regionAssets = state.assets.filter((a) => a.isDomestic === region && isRebalanceEligibleAccount(a) && isAssetIncludedForOwner(a, ownerFilter) && Math.round(calcRow(a).curAmount) !== 0);
    // 위 목표금액 공식과 동일하게: 지역 목표금액 = 전체 구성
    // 대상 총액(이 소유자 기준) × 지역 목표비중(%). 항목별 목표금액 = 지역 목표금액 × 항목 비중(%).
    const regionTargetAmount = total * num(state.rebalance[ownerFilter].domestic[region]) / 100;

    const groups = new Map(); // targetIdx -> assets[] (이 소유자가 실제 보유한 자산만 - 없는 idx도 있을 수 있다)
    regionAssets.forEach((a) => {
      if (!claimedTargetIdx.has(a.id)) { excluded.push(a); return; }
      const idx = claimedTargetIdx.get(a.id);
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx).push(a);
    });

    // [버그 수정] 예전엔 groups.forEach로 "이 소유자가 실제 보유한 목표 항목"만 훑었다 - 그 결과 목표
    // 비중이 설정돼 있어도 이 소유자가 하나도 보유하지 않은 항목(예: 와이프가 안 가진 해외 ISA 종목)은
    // 통째로 화면/엑셀에서 빠졌다. 이제 targets 전체를 훑어, 보유가 없는 항목도 "0원 보유, 목표금액
    // 전액 신규 매수 필요"인 행으로 빠짐없이 보여준다.
    targets.forEach((t, idx) => {
      const pct = num(t.pct);
      const groupAssets = groups.get(idx);
      const targetAmount = regionTargetAmount * pct / 100;

      if (!groupAssets || groupAssets.length === 0) {
        if (pct <= 0) return; // 보유도 없고 목표 비중도 0%면(예: 미지정 "주식(기타)") 보여줄 내용이 없다.
        const isTicker = t.type === 'ticker';
        const refAsset = isTicker ? findAnyHouseholdAssetByTicker(t.ticker) : null;
        const isForeign = refAsset ? refAsset.currency === 'USD' : false;
        const priceRate = isForeign ? state.exchangeRate : 1;
        const priceKRW = refAsset ? num(refAsset.currentPrice) * priceRate : 0;
        const qtyDelta = priceKRW !== 0 ? targetAmount / priceKRW : 0;
        // 티커 표기는 실제로 보유 중인 자산(refAsset)이 있으면 그 표기를 그대로 쓴다 - 목표 설정에는
        // "278530"처럼 접미사 없이 적혀 있어도, 실제 보유 자산은 "278530.KS"처럼 등록돼 있을 수 있어
        // 그대로 쓰면 같은 종목인데 소유자 탭마다 티커 표기가 달라 보이는 문제가 생긴다.
        rows.push({
          name: isTicker ? (refAsset ? refAsset.name : t.label) : t.label,
          ticker: isTicker ? (refAsset ? refAsset.ticker : t.ticker) : '',
          owners: [],
          region, targetLabel: t.label,
          curAmount: 0, targetAmount, diff: targetAmount, qtyDelta, isForeign
        });
        return;
      }

      const groupCurTotal = groupAssets.reduce((s, a) => s + calcRow(a).curAmount, 0);

      // 소유자 무관 동일 종목 합산: 같은 그룹 안에서 티커(없으면 이름)가 같은 자산끼리 먼저 하나로 묶는다.
      const byTicker = new Map(); // key(티커/이름) -> { assets, curAmount, owners, name, ticker, isForeign, currentPrice }
      groupAssets.forEach((a) => {
        const key = String(a.ticker ?? '').trim() || `__name__${a.name}`;
        if (!byTicker.has(key)) {
          byTicker.set(key, { assets: [], curAmount: 0, owners: new Set(), name: a.name, ticker: a.ticker, isForeign: false, currentPrice: a.currentPrice });
        }
        const bucket = byTicker.get(key);
        const ra = calcRow(a);
        bucket.assets.push(a);
        bucket.curAmount += ra.curAmount;
        bucket.owners.add(a.owner);
        bucket.isForeign = ra.isForeign; // 같은 티커면 통화도 같으므로 마지막 값 그대로 써도 무방
      });

      byTicker.forEach((bucket) => {
        const share = groupCurTotal !== 0 ? bucket.curAmount / groupCurTotal : (1 / byTicker.size);
        const assetTargetAmount = targetAmount * share;
        const diff = assetTargetAmount - bucket.curAmount;
        const priceRate = bucket.isForeign ? state.exchangeRate : 1;
        const priceKRW = num(bucket.currentPrice) * priceRate;
        const qtyDelta = priceKRW !== 0 ? diff / priceKRW : 0;
        rows.push({
          name: bucket.name, ticker: bucket.ticker, owners: [...bucket.owners].sort((a, b) => ownerRank(a) - ownerRank(b)),
          region, targetLabel: t.label,
          curAmount: bucket.curAmount, targetAmount: assetTargetAmount, diff, qtyDelta, isForeign: bucket.isForeign
        });
      });
    });
  });

  rows.sort((a, b) => b.curAmount - a.curAmount);
  return { rows, excluded };
}

// 목표금액-현재금액 차액(diff)의 색상 관례: 매수 필요(부족, 양수)=파랑, 매도 필요(과다, 음수)=빨강.
// 1원 미만 차이는 오차로 보고 중립색 처리한다.
function rebalanceDiffColorClass(diff) {
  return diff > 1 ? 'text-blue-500 dark:text-blue-400' : (diff < -1 ? 'text-red-500 dark:text-red-400' : 'text-slate-400');
}

// 포트폴리오 구성 탭 전용 총액 - 두 지역 모두 "목표에 매칭되는(=구성 대상인)" 자산만 합산한다.
// ownerFilter를 생략하면(대부분의 호출부 - 메인 화면 요약/목표 비중 입력칸 등) 기존과 동일하게 항상
// 가구 전체 기준이다. 종목별 실행 가이드의 소유자별 필터에서만 특정 소유자명을 넘긴다.
function getRebalanceTotals(ownerFilter) {
  const byDomestic = { '국내': 0, '해외': 0 };
  const perRegion = {};
  let total = 0;
  ['국내', '해외'].forEach((region) => {
    const { amounts, coveredTotal } = computeRegionTargetAmounts(region, undefined, ownerFilter);
    perRegion[region] = amounts;
    byDomestic[region] = coveredTotal;
    total += coveredTotal;
  });
  return { total, byDomestic, perRegion };
}

// [소유자별 독립 리밸런싱 - Option B] 신랑/와이프 각각의 목표 비중을 독립적으로 계산해 각자의 카드
// 세트(...Husband/...Wife 접미사)에 그린다 - buildDomesticTargetInputs/buildTargetInputs가 owner
// 파라미터로 어느 카드 세트인지 구분한다.
function rebalanceOwnerSuffix(owner) { return owner === '신랑' ? 'Husband' : 'Wife'; }
// [읽기전용 요약 카드 삭제 - 요청 반영] 예전엔 여기서 신랑/와이프 각자의 "국내/해외 목표 비중" +
// "국내/해외 세부 목표 비중" 3카드 그리드를 그렸으나, 그 카드들이 통째로 삭제되고 편집 진입점(타이틀
// 옆 [비중조절] 버튼, data-rebalance-detail-btn)만 남았다 - 이제 renderRebalance()가 할 일은
// updateRebalanceResults() 하나뿐이다(포지션별 목표비중 분석 카드·실행 가이드·미래예측 재계산).
function renderRebalance() {
  updateRebalanceResults();
}

/* -------------------------------------------------------------------------
 * 15-1. [개별주식 검색 모달] - 거래내역 탭의 종목 선택 전용
 *    - 로컬(보유 자산 종목명/티커 부분일치, 한글 검색 지원) + Yahoo Finance 검색 API(v1/finance/search,
 *      인증 불필요, 영문명/티커/코드) 두 소스를 합쳐서 보여준다.
 *    - [포트폴리오 구성 탭 개별주식 추가 기능 제거] 이 모달은 원래 포트폴리오 구성 탭에서도 재사용했으나(모드 분기),
 *      그 기능이 통째로 제거되어 이제 거래내역 탭 전용으로 단순화했다.
 * ---------------------------------------------------------------------- */
let stockSearchDebounceTimer = null;
let stockSearchRequestSeq = 0; // 느린 응답이 늦게 도착해 최신 검색 결과를 덮어쓰는 경쟁 상태 방지용

// 보유 중인 자산의 종목명/티커에서 부분일치로 찾는다 - Yahoo 검색 API가 한글을 지원하지 않아서,
// 최소한 "이미 포트폴리오에 있는 종목"만큼은 한글 이름으로도 찾을 수 있도록 보조 지원한다.
// [티커 없는 자산(부동산/채권/실물자산) 검색 지원] 예전엔 `if (!a.ticker) return;`으로 티커 없는
// 자산을 검색 결과에서 통째로 제외했다 - 그 결과 거래추가 팝업의 [종목 검색] 버튼으로는 부동산/채권을
// 절대 찾을 수 없어, 매도 시 종목명을 직접 다시 타이핑해야 했고 한 글자라도 다르면(syncAssetsFrom
// Transactions가 소유자+계좌구분+종목명 완전일치로만 매칭하므로) 기존 포지션과 연결되지 않고 조용히
// 새 포지션이 생기는 사고가 났다. 이제 티커 없는 자산도 종목명을 매칭 키로 검색 결과에 포함하고,
// symbol을 빈 문자열로 둬(실제 시장 티커가 아님을 표시) 선택 시 tx_ticker도 비워 넣는다 - 대신
// owner/accountType/currency를 함께 실어 보내 매도 입력 시 소유자·계좌구분까지 정확히 자동완성되게
// 한다(applyStockPickToTransactionForm 참고).
function searchLocalHoldings(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set();
  const results = [];
  state.assets.forEach((a) => {
    // [원화 현금만 거래내역 차단] 거래 추가 모달(mode='transaction')에서는 원화 현금만 검색 결과에서
    // 빼서 선택 자체를 못 하게 한다(자산관리 탭에서만 잔고를 직접 수정) - 달러(USD) 현금은 이제
    // 거래내역 기반 가중평균 환율 관리 대상이므로 검색에서 정상적으로 나와야 한다.
    if (stockSearchTargetMode === 'transaction' && !a.ticker && a.category === '현금' && a.currency !== 'USD') return;
    const hay = `${a.name} ${a.ticker}`.toLowerCase();
    if (!hay.includes(q)) return;
    const key = a.ticker ? a.ticker.toUpperCase() : `NOTICKER:${a.owner}__${a.accountType}__${a.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      symbol: a.ticker || '', name: a.name, exch: a.isDomestic === '국내' ? '국내' : '해외', type: a.category,
      owner: a.ticker ? undefined : a.owner,
      accountType: a.ticker ? undefined : a.accountType,
      currency: a.ticker ? undefined : a.currency
    });
  });
  return results;
}

// Yahoo Finance 검색(자동완성) API - v7/quote, v10/quoteSummary와 달리 인증 없이 열려있다(2026-07 확인).
// 프록시 없이 직접 호출을 먼저 시도하고(가장 빠름), 막히면 프록시 2개만 추가로 경쟁시킨다(검색은
// 시세 조회만큼 소스를 많이 둘 필요는 없어 트래픽을 절약한다).
async function searchYahooStocks(query) {
  const url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=8&newsCount=0';
  const attempts = [
    async () => {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return safeParseJsonResponse(res);
    },
    ...CORS_PROXIES.slice(0, 2).map((proxy) => async () => {
      const res = await fetchWithTimeout(proxy.build(url), 8000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return proxy.parse ? await proxy.parse(res) : await safeParseJsonResponse(res);
    })
  ];
  let data;
  try {
    data = await Promise.any(attempts.map((fn) => fn()));
  } catch (e) {
    return [];
  }
  const quotes = (data && data.quotes) || [];
  return quotes
    .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map((q) => ({ symbol: q.symbol, name: q.shortname || q.longname || q.symbol, exch: q.exchDisp || q.exchange || '', type: q.quoteType }));
}

// [종목 마스터 검색] tickerMasterRecords(js/09, GitHub Actions가 매달 갱신하는 국내 코스피/코스닥
// 전종목 + 미국 나스닥/뉴욕/아멕스 주요종목)에서 이름/티커 부분일치 후보를 찾는다. 이 파일(js/04)이
// js/09보다 먼저 로드되지만, tickerMasterRecords 참조는 함수 "본문" 안에만 있어 실제 호출 시점
// (사용자가 검색창에 입력한 뒤, 즉 전체 스크립트가 다 로드된 뒤)에는 이미 값이 채워져 있다 - 이
// 프로젝트가 다른 곳(예: js/10)에서도 쓰는 것과 같은 로드 순서 안전 패턴. Yahoo 검색과 달리 로컬에
// 이미 캐싱된 데이터라 네트워크 없이 즉시 결과가 나온다.
function searchTickerMaster(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const r of tickerMasterRecords) {
    if (results.length >= 15) break;
    if (!(r._nameKrLower.includes(q) || r._nameEnLower.includes(q) || r._tickerLower.includes(q))) continue;
    results.push({ symbol: r.yahooTicker, name: r.nameKr || r.nameEn, exch: r.exchange, type: r.market === 'KR' ? '국내' : '해외' });
  }
  return results;
}

// [검색 결과 소스 병합 - 중복 제거] 티커가 있는 결과는 티커(대문자)로, 티커 없는 결과(부동산/채권 등
// 보유 자산)는 소유자+계좌구분+이름으로 중복을 가른다 - searchLocalHoldings() 내부의 중복 판정 기준과
// 반드시 같아야 한다(그렇지 않으면 계좌가 다른 두 무-티커 자산이 같은 항목으로 잘못 합쳐진다).
function stockSearchResultKey(r) {
  return r.symbol ? r.symbol.toUpperCase() : `NOTICKER:${r.owner || ''}__${r.accountType || ''}__${r.name}`;
}
function mergeStockSearchResults(...sourceArrays) {
  const seen = new Set();
  const merged = [];
  sourceArrays.flat().forEach((r) => {
    const key = stockSearchResultKey(r);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(r);
  });
  return merged.slice(0, 15);
}

async function searchStockCandidates(query) {
  const local = searchLocalHoldings(query);
  const master = searchTickerMaster(query);
  const remote = await searchYahooStocks(query);
  return mergeStockSearchResults(local, master, remote);
}

// 티커 접미사(.KS/.KQ)로 국내/해외를 판별한다 - sanitizeTicker와 동일한 기준(getMarketKeyForTicker 등
// 이 앱 전반에서 쓰는 규칙)이라 다른 곳의 국내/해외 분류와 항상 일치한다.
// [자산 추가 팝업 개선] mode: 'transaction'(기본, 거래내역 탭) | 'asset'(자산 추가 팝업) - 검색 결과를
// 선택했을 때 어느 폼에 채울지를 결정한다(아래 renderStockSearchResults 참고). 이 모달은 assetModal
// 위에도(z-[60] > assetModal의 z-50) 그대로 겹쳐 뜨므로, assetModal을 닫지 않고 그 위에서 검색만
// 진행할 수 있다.
let stockSearchTargetMode = 'transaction';
function openStockSearchModal(mode) {
  stockSearchTargetMode = mode || 'transaction';
  document.getElementById('stockSearchModalTitle').textContent = stockSearchTargetMode === 'asset' ? '종목 검색' : '개별주식 검색 추가';
  // [티커 없는 자산 검색 지원] 거래내역 모드에서는 부동산/채권처럼 티커 없는 보유 자산도 이름으로
  // 찾아 고를 수 있다는 안내를 추가한다(searchLocalHoldings 참고).
  document.getElementById('stockSearchHint').textContent = stockSearchTargetMode === 'transaction'
    ? '국내 종목은 한글 종목명(보유 중인 종목 한정)이나 코드로, 그 외에는 영문명/티커로 검색하세요. 부동산·채권 등 티커 없는 보유 자산도 이름으로 검색해 고를 수 있습니다.'
    : '국내 종목은 한글 종목명(보유 중인 종목 한정)이나 코드로, 그 외에는 영문명/티커로 검색하세요.';
  document.getElementById('stockSearchModal').classList.remove('hidden');
  pushModalHistoryState();
  const input = document.getElementById('stockSearchInput');
  input.value = '';
  document.getElementById('stockSearchResults').innerHTML = '<p class="text-xs text-slate-400 text-center py-6">검색어를 입력하세요</p>';
  setTimeout(() => input.focus(), 50);
}

function closeStockSearchModal(viaBackButton) {
  document.getElementById('stockSearchModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}

document.getElementById('closeStockSearchModalBtn').addEventListener('click', () => closeStockSearchModal());
document.getElementById('stockSearchModal').addEventListener('click', (e) => {
  if (e.target.id === 'stockSearchModal') closeStockSearchModal(); // 배경(오버레이) 클릭 시 닫기
});

function renderStockSearchResults(results, seq) {
  if (seq !== stockSearchRequestSeq) return; // 더 최신 검색이 이미 진행 중이면 이 응답은 버린다
  const container = document.getElementById('stockSearchResults');
  if (results.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">검색 결과가 없습니다</p>';
    return;
  }
  // [티커 없는 자산 표시] symbol이 비어있으면(부동산/채권 등) 둘째 줄에 티커·거래소 대신 소유자·
  // 계좌구분을 보여준다 - 같은 이름의 자산이 여러 계좌에 있을 때 어느 것을 고르는지 구분할 수 있다.
  container.innerHTML = results.map((r) => {
    const isNoTicker = !r.symbol;
    const subtext = isNoTicker
      ? `${escapeHtml(r.owner || '')} · ${escapeHtml(r.accountType || '')} · 티커 없음`
      : `${escapeHtml(r.symbol)} · ${escapeHtml(r.exch || '')}`;
    return `
    <button type="button" data-pick-symbol="${escapeHtml(r.symbol)}" data-pick-name="${escapeHtml(r.name)}"
      data-pick-owner="${escapeHtml(r.owner || '')}" data-pick-account-type="${escapeHtml(r.accountType || '')}" data-pick-currency="${escapeHtml(r.currency || '')}"
      class="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
      <span class="min-w-0">
        <span class="block text-sm font-medium truncate">${escapeHtml(r.name)}</span>
        <span class="block text-[11px] text-slate-400">${subtext}</span>
      </span>
      <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">${escapeHtml(r.type || '')}</span>
    </button>`;
  }).join('');
  container.querySelectorAll('button[data-pick-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stockSearchTargetMode === 'asset') {
        applyStockPickToAssetForm(btn.dataset.pickSymbol, btn.dataset.pickName);
      } else {
        applyStockPickToTransactionForm(btn.dataset.pickSymbol, btn.dataset.pickName, btn.dataset.pickOwner, btn.dataset.pickAccountType, btn.dataset.pickCurrency);
      }
      closeStockSearchModal();
    });
  });
}

document.getElementById('stockSearchInput').addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(stockSearchDebounceTimer);
  if (!query) {
    document.getElementById('stockSearchResults').innerHTML = '<p class="text-xs text-slate-400 text-center py-6">검색어를 입력하세요</p>';
    return;
  }
  document.getElementById('stockSearchResults').innerHTML = '<p class="text-xs text-slate-400 text-center py-6">검색 중...</p>';
  stockSearchDebounceTimer = setTimeout(async () => {
    const seq = ++stockSearchRequestSeq;
    // [즉시 표시] 보유 자산 + 종목 마스터는 로컬 데이터라 네트워크 없이 즉시 결과가 나온다 - Yahoo
    // 검색(느릴 때 8~12초까지 걸림)을 기다리지 않고 먼저 보여준 뒤, Yahoo 응답이 도착하면 새로 찾은
    // 종목만 추가로 이어붙인다. 결과가 하나도 없으면(로컬/마스터 둘 다 무매칭) "검색 중..." 문구를
    // 그대로 둔다 - 비워서 렌더링하면 Yahoo 결과가 아직 안 왔는데도 "결과 없음"이 잠깐 깜빡여 보인다.
    const instant = mergeStockSearchResults(searchLocalHoldings(query), searchTickerMaster(query));
    if (instant.length > 0) renderStockSearchResults(instant, seq);
    const remote = await searchYahooStocks(query);
    const merged = mergeStockSearchResults(instant, remote);
    renderStockSearchResults(merged, seq);
  }, 350);
});

/* -------------------------------------------------------------------------
 * 15-0-1. [전체 목표 비중 수정] 모달 - 포트폴리오 구성 탭의 목표 비중은 기본 화면에서 읽기 전용이고, 이
 *    모달에서만 편집한다. rebalanceModalDraft(초안)에서만 값을 바꾸다가 [확인]을 눌러야 state.rebalance에
 *    커밋된다 - 취소/오버레이 클릭/뒤로가기로 닫으면 초안을 버리고 이전 상태를 그대로 유지한다.
 *    목표금액/증감금액 미리보기는 "지금 보유 중인 실제 금액"(rebalanceModalSnapshot - 모달을 여는 시점에
 *    한 번만 스냅샷)과 "지금 입력 중인 draft 비중"을 조합해 매 입력마다 다시 계산한다 - 보유 자산
 *    금액 자체는 비중 입력과 무관하므로 재조회 없이 스냅샷을 그대로 재사용해도 정확하다.
 * ---------------------------------------------------------------------- */
let rebalanceModalDraft = null;
let rebalanceModalSnapshot = null;
// [소유자별 독립 리밸런싱 - Option B] 팝업(rebalanceTargetModal)은 신랑/와이프가 하나를 공유한다 - 이
// 변수가 지금 편집 중인 소유자를 기억해 [확인] 커밋 시 state.rebalance[rebalanceModalOwner]에 반영한다.
let rebalanceModalOwner = null;

// targets 배열을 깊은 복사한다 - selectedStocks가 배열(참조 타입)이라 얕은 복사({...t})만 하면 draft와
// state.rebalance가 같은 배열을 공유하게 되어, draft에서 종목 추가/삭제(push/splice)가 취소 전에도
// state.rebalance를 그대로 오염시키는 문제가 있었다.
// [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 목표 항목을 이 팝업에서 직접 건드린 적이 없어
// role이 비어있더라도, 자산관리/거래내역 등 다른 화면에서 이미 등록해 둔 역할이 있으면 그 값을
// 이어받는다 - 모달을 열 때(state→draft)와 커밋할 때(draft→state) 양쪽에서 이 함수를 재사용하므로,
// 한 번 열고 닫기만 해도 로컬 role이 채워져 syncTickerRolesFromRebalanceTargets가 레지스트리를
// 지우는 부작용도 함께 사라진다.
function cloneRebalanceTargetList(list) {
  return (list || []).map((t) => ({
    ...t,
    ...(t.type === 'ticker' ? { role: t.role || getTickerRole(t.ticker) } : {}),
    ...(Array.isArray(t.selectedStocks) ? { selectedStocks: t.selectedStocks.map((s) => ({ ...s, role: s.role || getTickerRole(s.ticker) })) } : {})
  }));
}

function openRebalanceTargetModal(owner) {
  rebalanceModalOwner = owner;
  document.getElementById('rebalanceTargetModalTitle').textContent = `${owner}님 목표 비중 수정`;
  const { total, byDomestic, perRegion } = getRebalanceTotals(owner);
  rebalanceModalSnapshot = { total, byDomestic, perRegion };
  rebalanceModalDraft = {
    domestic: { ...state.rebalance[owner].domestic },
    targets: {
      '국내': cloneRebalanceTargetList(state.rebalance[owner].targets['국내']),
      '해외': cloneRebalanceTargetList(state.rebalance[owner].targets['해외'])
    }
  };
  renderRtmDomesticSplit();
  renderRtmTargetGroup('국내');
  renderRtmTargetGroup('해외');
  updateRtmPreviews();
  // [+ 종목 추가 폼 초기화] 지난번에 열어둔 채로 남아있지 않도록 항상 접힌 상태로 새로 연다.
  ['Domestic', 'Foreign'].forEach((suffix) => {
    document.getElementById('rtmAddForm' + suffix).classList.add('hidden');
    document.getElementById('rtmAddSearchInput' + suffix).value = '';
    document.getElementById('rtmAddSearchResults' + suffix).innerHTML = '';
  });
  document.getElementById('rebalanceTargetModal').classList.remove('hidden');
  pushModalHistoryState();
}

function closeRebalanceTargetModal(viaBackButton) {
  document.getElementById('rebalanceTargetModal').classList.add('hidden');
  rebalanceModalDraft = null;
  rebalanceModalSnapshot = null;
  rebalanceModalOwner = null;
  if (!viaBackButton) popModalHistoryIfNeeded();
}

// 국내/해외 split 입력창 - 이 함수는 모달을 열 때 한 번만 호출한다(입력 중에는 호출하지 않는다 -
// input 엘리먼트 자체를 다시 그리면 타이핑 중 포커스/커서 위치가 날아간다). 값이 바뀔 때의 화면
// 갱신은 updateRtmPreviews()가 텍스트만 갱신하는 방식으로 처리한다.
function renderRtmDomesticSplit() {
  const wrap = document.getElementById('rtmDomesticSplit');
  const domesticPct = num(rebalanceModalDraft.domestic['국내']);
  wrap.innerHTML = `
    <label class="text-xs">
      <span class="text-slate-500 dark:text-slate-400">국내 (%)</span>
      <input id="rtm_domesticKR" type="number" min="0" max="100" step="1" value="${domesticPct}"
        class="w-full mt-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 outline-none text-right">
      <div data-rtm-domestic-preview="국내" class="mt-1 text-[11px] flex flex-col gap-0.5"></div>
    </label>
    <label class="text-xs">
      <span class="text-slate-500 dark:text-slate-400">해외 (%) · 자동계산</span>
      <input id="rtm_domesticFR" type="text" value="${fmtNum(100 - domesticPct, 1)}" disabled
        class="w-full mt-1 text-sm bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 outline-none text-right text-slate-400">
      <div data-rtm-domestic-preview="해외" class="mt-1 text-[11px] flex flex-col gap-0.5"></div>
    </label>`;
  document.getElementById('rtm_domesticKR').addEventListener('input', (e) => {
    const v = Math.max(0, Math.min(100, num(e.target.value)));
    rebalanceModalDraft.domestic = { '국내': v, '해외': 100 - v };
    updateRtmPreviews();
  });
}

// 국내/해외 세부 목표 % 입력창 - 위와 같은 이유로 모달을 열 때 한 번만 호출한다.
// [종목 삭제 - 요청 반영] 더 이상 가져가지 않을 목표 항목(티커 지정이든 자산군 캐치올이든)을 목록에서
// 완전히 제거한다 - draft(rebalanceModalDraft)에서만 지우고, [확인]을 눌러야 실제 state.rebalance에
// 반영된다(다른 편집과 동일한 draft-then-commit 패턴). 지운 뒤 합계 100%가 깨져도(경고 배지만 뜸)
// 저장 자체는 막지 않는다 - 남은 항목 비중을 사용자가 직접 다시 맞추거나 새 종목을 추가하면 된다.
function removeRtmTarget(region, idx) {
  rebalanceModalDraft.targets[region].splice(idx, 1);
  renderRtmTargetGroup(region);
  updateRtmPreviews();
}

function renderRtmTargetGroup(region) {
  const wrapId = region === '국내' ? 'rtmTargetsDomestic' : 'rtmTargetsForeign';
  const wrap = document.getElementById(wrapId);
  const targets = rebalanceModalDraft.targets[region];

  wrap.innerHTML = targets.map((t, idx) => {
    // ['주식' 개별 종목 다중 설정] '주식' 항목에 한해 검색(돋보기) 버튼을 붙여 보유 종목을 최대
    // MAX_SELECTED_STOCKS_PER_CATEGORY개까지 지정할 수 있게 한다. 하나라도 지정돼 있으면 그 항목의
    // %는 지정된 종목들의 비중 합으로 자동 계산되므로(recalcStockCategoryPct) 직접 입력을 막고
    // (disabled) 하단에 "└ 종목명 %, 종목명 %" 소형 텍스트로 구성 내역을 보여준다.
    const isStockCategory = t.type === 'category' && t.category === '주식';
    const hasSelectedStocks = isStockCategory && Array.isArray(t.selectedStocks) && t.selectedStocks.length > 0;
    const searchBtn = isStockCategory
      ? `<button type="button" data-rtm-stock-search data-region="${region}" data-idx="${idx}" title="보유 주식 종목 선택"
          class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-brand-600 hover:border-brand-400 dark:hover:border-brand-500 shrink-0">
          <i data-lucide="search" class="w-3.5 h-3.5"></i>
        </button>`
      : '';
    const subText = hasSelectedStocks
      ? `<p class="mt-1 text-[10px] text-slate-400 truncate">└ ${t.selectedStocks.map((s) => `${escapeHtml(s.name)} ${fmtNum(num(s.pct), 1)}%`).join(', ')}</p>`
      : '';
    // [종목 삭제 버튼 - 요청 반영] 티커 지정/자산군 캐치올 어느 쪽이든 이 목표 항목 자체를 목록에서
    // 제거할 수 있다 - 개별 지정 종목(selectedStocks)을 하나씩 빼는 건 별도 팝업(stockAllocationModal)
    // 몫이므로 여기서는 항목 전체 단위로만 지운다.
    const deleteBtn = `<button type="button" data-rtm-delete data-region="${region}" data-idx="${idx}" title="이 항목 삭제"
        class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>`;
    // [미보유 종목 추가 - 포지션 지정] 개별 티커 목표 항목뿐 아니라 자산군 캐치올(채권/현금)에도
    // 포지션(공격수/코어미드필드/수비수)을 지정할 수 있다 - 캐치올은 티커별 세부 보유가 없어도
    // "이 뭉치 전체가 어떤 성격인가"로 하나의 역할을 대표시킬 수 있다는 요청에 따라 확장했다([확인]으로
    // 커밋되면 computePositionRoleBreakdown(정확히는 computeOwnerTargetRoleWeights)이 이 role을 목표
    // 비중 기준으로 그대로 집계한다 - selectedStocks[i].role과 동일한 성격이다).
    const roleSelect = `<select data-rtm-role data-region="${region}" data-idx="${idx}" class="mt-1.5 w-full text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 outline-none">
          <option value="">포지션 미지정</option>
          ${ASSET_ROLE_OPTIONS.map((o) => `<option value="${o.value}" ${t.role === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>`;
    return `
    <div class="border border-slate-100 dark:border-slate-800 rounded-lg p-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-600 dark:text-slate-300 min-w-0 truncate">${escapeHtml(t.label)}</span>
        <div class="flex items-center gap-1 shrink-0">
          ${searchBtn}
          <input data-rtm-pct data-region="${region}" data-idx="${idx}" type="number" min="0" max="100" step="1" value="${num(t.pct)}" ${hasSelectedStocks ? 'disabled title="선택된 종목 비중의 합으로 자동 계산됩니다"' : ''}
            class="w-16 text-sm ${hasSelectedStocks ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400' : 'bg-slate-50 dark:bg-slate-800'} border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none text-right">
          <span class="text-xs text-slate-400">%</span>
          ${deleteBtn}
        </div>
      </div>
      ${subText}
      ${roleSelect}
      <div data-rtm-preview data-region="${region}" data-idx="${idx}" class="mt-1.5 text-[11px] flex flex-col gap-0.5"></div>
    </div>`;
  }).join('') || `<p class="text-xs text-slate-400">설정된 목표 항목이 없습니다.</p>`;

  wrap.querySelectorAll('input[data-rtm-pct]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const r = e.target.dataset.region;
      const idx = Number(e.target.dataset.idx);
      rebalanceModalDraft.targets[r][idx].pct = Math.max(0, Math.min(100, num(e.target.value)));
      updateRtmPreviews();
    });
  });
  wrap.querySelectorAll('button[data-rtm-stock-search]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openStockAllocationModal(btn.dataset.region, Number(btn.dataset.idx));
    });
  });
  wrap.querySelectorAll('button[data-rtm-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeRtmTarget(btn.dataset.region, Number(btn.dataset.idx));
    });
  });
  wrap.querySelectorAll('select[data-rtm-role]').forEach((select) => {
    select.addEventListener('change', (e) => {
      const r = e.target.dataset.region;
      const idx = Number(e.target.dataset.idx);
      rebalanceModalDraft.targets[r][idx].role = parseAssetRoleInput(e.target.value);
    });
  });
  lucide.createIcons();
}

/* -------------------------------------------------------------------------
 * [미보유 종목 검색 추가] 종목 마스터 DB(searchTickerMaster, js/09 - 국내 코스피/코스닥 전종목 + 미국
 *    주요종목, 로컬 캐시라 네트워크 없이 즉시 검색)에서 지역(국내/해외)에 맞는 상품을 찾아 새 티커
 *    목표 항목으로 draft에 추가한다. 이미 그 지역 목표 목록에 있는 티커는 후보에서 제외한다(중복 방지).
 * ---------------------------------------------------------------------- */
function searchRtmAddCandidates(region, query) {
  const q = query.trim();
  if (!q) return [];
  const existingTickers = new Set(
    rebalanceModalDraft.targets[region]
      .filter((t) => t.type === 'ticker')
      .map((t) => sanitizeTicker(t.ticker).yahooTicker)
  );
  return searchTickerMaster(q)
    .filter((r) => r.type === region && r.symbol && !existingTickers.has(sanitizeTicker(r.symbol).yahooTicker))
    .slice(0, 10);
}

function renderRtmAddSearchResults(region, query) {
  const containerId = region === '국내' ? 'rtmAddSearchResultsDomestic' : 'rtmAddSearchResultsForeign';
  const container = document.getElementById(containerId);
  if (!container) return;
  const candidates = searchRtmAddCandidates(region, query);
  if (!query.trim()) { container.innerHTML = ''; return; }
  if (candidates.length === 0) {
    container.innerHTML = '<p class="text-[11px] text-slate-400 py-1">검색 결과가 없습니다.</p>';
    return;
  }
  container.innerHTML = candidates.map((c) => `
    <button type="button" data-rtm-add-candidate data-region="${region}" data-ticker="${escapeHtml(c.symbol)}" data-name="${escapeHtml(c.name)}"
      class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
      <span class="text-xs truncate">${escapeHtml(c.name)}</span>
      <span class="text-[10px] text-slate-400 shrink-0">${escapeHtml(c.symbol)}</span>
    </button>`).join('');
  container.querySelectorAll('button[data-rtm-add-candidate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.region;
      // [티커별 역할(포지션) 단일 소스 - 자동 연동] 이 티커에 이미 다른 곳에서 지정해 둔 역할이 있으면
      // 미지정 상태로 시작하지 않고 그 값을 그대로 이어받는다.
      rebalanceModalDraft.targets[r].push({ type: 'ticker', ticker: btn.dataset.ticker, label: btn.dataset.name, pct: 0, role: getTickerRole(btn.dataset.ticker) });
      const input = document.getElementById(r === '국내' ? 'rtmAddSearchInputDomestic' : 'rtmAddSearchInputForeign');
      if (input) input.value = '';
      container.innerHTML = '';
      renderRtmTargetGroup(r);
      updateRtmPreviews();
    });
  });
}
document.getElementById('rtmAddSearchInputDomestic').addEventListener('input', (e) => renderRtmAddSearchResults('국내', e.target.value));
document.getElementById('rtmAddSearchInputForeign').addEventListener('input', (e) => renderRtmAddSearchResults('해외', e.target.value));

// [+ 종목 추가 토글 - "수익률 관리" 팝업 패턴 차용] 버튼을 누르면 검색 폼이 펼쳐지고, 다시 누르면
// 접히면서 입력값/검색결과가 초기화된다(scenarioRateAddNewBtn과 동일한 토글 방식).
['국내', '해외'].forEach((region) => {
  const suffix = region === '국내' ? 'Domestic' : 'Foreign';
  document.getElementById('rtmAddToggleBtn' + suffix).addEventListener('click', () => {
    const form = document.getElementById('rtmAddForm' + suffix);
    const willShow = form.classList.contains('hidden');
    form.classList.toggle('hidden', !willShow);
    document.getElementById('rtmAddSearchInput' + suffix).value = '';
    document.getElementById('rtmAddSearchResults' + suffix).innerHTML = '';
    if (willShow) setTimeout(() => document.getElementById('rtmAddSearchInput' + suffix).focus(), 50);
  });
});

/* -------------------------------------------------------------------------
 * 15-0-2. [보유 주식 종목 선택 모달] - rebalanceTargetModal의 '주식' 세부 목표 항목 전용 2차 팝업.
 *    최대 MAX_SELECTED_STOCKS_PER_CATEGORY개까지 보유 종목을 지정하고 종목별 비중(%)을 입력한다.
 *    [확인]/[취소]가 따로 없다 - rebalanceModalDraft를 바로 수정하며, 부모 모달의 [확인]을 눌러야
 *    최종 state.rebalance에 반영된다(부모 모달을 취소하면 여기서 한 작업도 함께 버려진다).
 * ---------------------------------------------------------------------- */
let stockAllocationCurrentRegion = null;
let stockAllocationCurrentIdx = null;

function getStockAllocationTarget() {
  if (!rebalanceModalDraft || !stockAllocationCurrentRegion || stockAllocationCurrentIdx === null) return null;
  return rebalanceModalDraft.targets[stockAllocationCurrentRegion][stockAllocationCurrentIdx];
}

// '주식' 항목의 pct를 선택된 종목들의 비중 합으로 다시 맞춘다 - 종목 추가/삭제/비중 수정 때마다 호출.
function recalcStockCategoryPct() {
  const t = getStockAllocationTarget();
  if (!t) return;
  t.pct = t.selectedStocks.reduce((s, x) => s + num(x.pct), 0);
}

// 지정 후보 - 해당 지역의 보유 '주식' 카테고리 자산(절세 계좌 제외, 구성 대상과 동일 범위)을
// 티커 기준으로 중복 없이 모은다(같은 종목을 신랑/와이프가 나눠 보유해도 한 줄로 노출).
function getHeldStockCandidates(region) {
  const seen = new Map();
  state.assets
    .filter((a) => a.isDomestic === region && a.category === '주식' && isRebalanceEligibleAccount(a) && String(a.ticker ?? '').trim() !== '' && num(a.quantity) > 0)
    .forEach((a) => {
      const key = a.ticker.toUpperCase();
      if (!seen.has(key)) seen.set(key, a);
    });
  return [...seen.values()];
}

// [미보유 종목도 목표로 지정 가능 - 요청 반영] 검색어가 없으면(기본 진입) 예전처럼 보유 중인 주식만
// 빠르게 골라 담을 수 있게 보여주고, 검색어를 입력하면 보유 여부와 무관하게 종목 마스터 DB
// (tickerMasterRecords, js/09 - 국내 코스피/코스닥 전종목 + 미국 주요종목) 전체를 대상으로 찾는다 -
// 아직 사지 않은 종목도 목표 비중에 미리 지정해두고(리밸런싱 실행 가이드가 "0원 보유 · 전액 매수
// 필요"로 자동 반영, computeIndividualRebalanceGuide 참고) 나중에 실제로 매수하면 자연히 연결된다.
// searchTickerMaster는 로컬 캐시 데이터라 네트워크 호출 없이 동기적으로 즉시 결과를 낸다.
function searchStockAllocationCandidates(region, query) {
  const q = query.trim().toLowerCase();
  const held = getHeldStockCandidates(region).map((a) => ({ ticker: a.ticker, name: a.name }));
  if (!q) return held;
  const heldFiltered = held.filter((c) => `${c.name} ${c.ticker}`.toLowerCase().includes(q));
  const seen = new Set(heldFiltered.map((c) => c.ticker.toUpperCase()));
  const masterMatches = searchTickerMaster(q)
    .filter((r) => r.type === region && r.symbol && !seen.has(r.symbol.toUpperCase()))
    .map((r) => { seen.add(r.symbol.toUpperCase()); return { ticker: r.symbol, name: r.name }; });
  return [...heldFiltered, ...masterMatches];
}

function openStockAllocationModal(region, idx) {
  stockAllocationCurrentRegion = region;
  stockAllocationCurrentIdx = idx;
  document.getElementById('stockAllocationSearchInput').value = '';
  renderStockAllocationSelectedList();
  renderStockAllocationSearchResults('');
  document.getElementById('stockAllocationModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}

function closeStockAllocationModal(viaBackButton) {
  document.getElementById('stockAllocationModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
  // 부모 팝업(rebalanceTargetModal)의 '주식' 항목 행을 다시 그려서 자동 합산%/하단 종목 리스트를
  // 최신 상태로 반영한다 - 부모는 이 2차 팝업이 열려 있는 동안 안 보이므로 닫힐 때만 갱신해도 충분하다.
  if (stockAllocationCurrentRegion) {
    renderRtmTargetGroup(stockAllocationCurrentRegion);
    updateRtmPreviews();
  }
  stockAllocationCurrentRegion = null;
  stockAllocationCurrentIdx = null;
}

// [AI 최적 추천 비중] 선택된 종목들 사이에서 "베타(시장 민감도)가 낮은 종목일수록 더 크게, 높은
// 종목일수록 더 작게" 나눠 담는 역베타 가중(inverse-beta weighting) 방식이다 - 정밀 리스크 엔진이
// 이미 계산해 둔 state.advancedRiskMetrics.holdings의 beta를 그대로 재사용하므로 별도 계산·API 호출이
// 없다. 카테고리 전체 비중(totalPct)은 그대로 유지한 채 "같은 총 비중을 더 안전하게 나누는" 참고용
// 배분만 제안한다 - 실제 매매 지시가 아니며, 베타 데이터가 없는 종목(신규상장 등)은 1.0(시장 평균)으로
// 근사하고, 아무 데이터도 없으면 안전하게 균등 배분으로 폴백한다.
function computeAiOptimalStockWeights(selectedStocks, totalPct) {
  if (selectedStocks.length === 0) return [];
  const m = state.advancedRiskMetrics;
  const betas = selectedStocks.map((s) => {
    const yahoo = sanitizeTicker(s.ticker).yahooTicker;
    const h = m && m.holdings.find((hh) => hh.ticker === yahoo);
    return (h && typeof h.beta === 'number' && h.beta > 0) ? h.beta : 1.0;
  });
  const inverseBetas = betas.map((b) => 1 / b);
  const sumInverse = inverseBetas.reduce((a, b) => a + b, 0);
  if (sumInverse <= 0) return selectedStocks.map(() => totalPct / selectedStocks.length);
  return inverseBetas.map((ib) => (ib / sumInverse) * totalPct);
}

function renderStockAllocationSelectedList() {
  const t = getStockAllocationTarget();
  const container = document.getElementById('stockAllocationSelectedList');
  const sumHint = document.getElementById('stockAllocationSumHint');
  if (!t) return;
  sumHint.textContent = `합계 ${fmtNum(t.pct, 1)}%`;

  const applyAllBtn = document.getElementById('stockAllocationApplyAiAllBtn');
  if (applyAllBtn) applyAllBtn.classList.toggle('hidden', t.selectedStocks.length < 2);

  if (t.selectedStocks.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400">아직 선택된 종목이 없습니다. 아래에서 검색해 추가하세요.</p>';
    return;
  }
  // [AI 최적 추천 비중] 현재 카테고리 총 비중(t.pct)을 그대로 유지한 채, 선택된 종목들 사이에서만
  // 역베타 가중으로 재배분한 값이다 - 종목이 1개뿐이면 재배분할 대상이 없으므로 계산하지 않는다.
  const aiWeights = t.selectedStocks.length >= 2 ? computeAiOptimalStockWeights(t.selectedStocks, t.pct) : null;

  container.innerHTML = t.selectedStocks.map((s, i) => {
    const aiPct = aiWeights ? aiWeights[i] : null;
    const diff = aiPct !== null ? aiPct - num(s.pct) : null;
    const badgeHtml = aiPct !== null ? `
      <div class="flex items-center gap-1 mt-1.5 flex-wrap">
        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 whitespace-nowrap">💡 AI 최적 추천: ${fmtNum(aiPct, 1)}% (${diff >= 0 ? '▲' : '▼'}${fmtNum(Math.abs(diff), 1)}%p)</span>
        <button type="button" data-stock-alloc-apply-ai data-i="${i}" class="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 whitespace-nowrap">적용</button>
      </div>` : '';
    const isHeld = getHeldStockCandidates(stockAllocationCurrentRegion).some((a) => a.ticker === s.ticker);
    const roleOptionsHtml = ['<option value="">역할 미지정</option>', ...ASSET_ROLE_OPTIONS.map((o) => `<option value="${o.value}" ${s.role === o.value ? 'selected' : ''}>${o.label}</option>`)].join('');
    return `
    <div class="border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-1.5">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHtml(s.name)}</p>
          <p class="text-[11px] text-slate-400 truncate">${escapeHtml(s.ticker)}${isHeld ? '' : ' · <span class="text-amber-500">미보유(목표만 지정)</span>'}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <input data-stock-alloc-pct data-i="${i}" type="number" min="0" max="100" step="1" value="${num(s.pct)}"
            class="w-16 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none text-right">
          <span class="text-xs text-slate-400">%</span>
          <button type="button" data-stock-alloc-remove data-i="${i}" title="삭제" class="touch-target w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-400">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <!-- [미보유 종목 포지션 태깅 - 요청 반영] 실제 자산(state.assets)이 아니라 이 목표 항목 자체에
           역할을 저장한다 - 포지션별 비중 분석 카드(실물 보유 기준)와는 무관한 별도 메타데이터다. -->
      <select data-stock-alloc-role data-i="${i}" class="mt-1.5 w-full text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none">${roleOptionsHtml}</select>
      ${badgeHtml}
    </div>`;
  }).join('');
  lucide.createIcons();

  container.querySelectorAll('input[data-stock-alloc-pct]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.i);
      const tt = getStockAllocationTarget();
      tt.selectedStocks[i].pct = Math.max(0, Math.min(100, num(e.target.value)));
      recalcStockCategoryPct();
      document.getElementById('stockAllocationSumHint').textContent = `합계 ${fmtNum(tt.pct, 1)}%`;
    });
  });
  container.querySelectorAll('select[data-stock-alloc-role]').forEach((select) => {
    select.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.i);
      const tt = getStockAllocationTarget();
      tt.selectedStocks[i].role = parseAssetRoleInput(e.target.value);
    });
  });
  container.querySelectorAll('button[data-stock-alloc-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const tt = getStockAllocationTarget();
      tt.selectedStocks.splice(i, 1);
      recalcStockCategoryPct();
      renderStockAllocationSelectedList();
      renderStockAllocationSearchResults(document.getElementById('stockAllocationSearchInput').value);
    });
  });
  // [AI 최적 추천 - 종목별 적용] 그 종목 하나만 추천값으로 바꾸고 나머지는 손대지 않는다(기존 수동
  // 입력과 동일하게 카테고리 합계는 recalcStockCategoryPct()가 그때그때 합산해 다시 계산한다).
  container.querySelectorAll('button[data-stock-alloc-apply-ai]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const tt = getStockAllocationTarget();
      const weights = computeAiOptimalStockWeights(tt.selectedStocks, tt.pct);
      tt.selectedStocks[i].pct = Math.round(weights[i] * 10) / 10;
      recalcStockCategoryPct();
      renderStockAllocationSelectedList();
    });
  });
}

// [⚡ AI 최적 추천 비중 전체 적용] 선택된 모든 종목을 한 번에 역베타 가중 추천값으로 맞춘다.
document.getElementById('stockAllocationApplyAiAllBtn').addEventListener('click', () => {
  const t = getStockAllocationTarget();
  if (!t || t.selectedStocks.length < 2) return;
  const weights = computeAiOptimalStockWeights(t.selectedStocks, t.pct);
  t.selectedStocks.forEach((s, i) => { s.pct = Math.round(weights[i] * 10) / 10; });
  recalcStockCategoryPct();
  renderStockAllocationSelectedList();
});

function renderStockAllocationSearchResults(query) {
  const t = getStockAllocationTarget();
  const container = document.getElementById('stockAllocationSearchResults');
  if (!t) return;

  if (t.selectedStocks.length >= MAX_SELECTED_STOCKS_PER_CATEGORY) {
    container.innerHTML = `<p class="text-[11px] text-amber-600 dark:text-amber-400 py-2">최대 ${MAX_SELECTED_STOCKS_PER_CATEGORY}개까지 선택할 수 있습니다.</p>`;
    return;
  }

  const selectedTickers = new Set(t.selectedStocks.map((s) => s.ticker));
  const candidates = searchStockAllocationCandidates(stockAllocationCurrentRegion, query)
    .filter((a) => !selectedTickers.has(a.ticker))
    .slice(0, 20);

  if (candidates.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 py-2">검색 결과가 없습니다.</p>';
    return;
  }
  container.innerHTML = candidates.map((a) => `
    <button type="button" data-stock-alloc-add data-ticker="${escapeHtml(a.ticker)}" data-name="${escapeHtml(a.name)}"
      class="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
      <span class="text-sm truncate">${escapeHtml(a.name)}</span>
      <span class="text-[11px] text-slate-400 shrink-0">${escapeHtml(a.ticker)}</span>
    </button>`).join('');
  container.querySelectorAll('button[data-stock-alloc-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tt = getStockAllocationTarget();
      if (tt.selectedStocks.length >= MAX_SELECTED_STOCKS_PER_CATEGORY) return;
      // [티커별 역할(포지션) 단일 소스 - 자동 연동] 위 rtmAddSearchResults 추가 플로우와 동일한 이유.
      tt.selectedStocks.push({ ticker: btn.dataset.ticker, name: btn.dataset.name, pct: 0, role: getTickerRole(btn.dataset.ticker) });
      recalcStockCategoryPct();
      renderStockAllocationSelectedList();
      renderStockAllocationSearchResults(document.getElementById('stockAllocationSearchInput').value);
    });
  });
}

document.getElementById('stockAllocationSearchInput').addEventListener('input', (e) => {
  renderStockAllocationSearchResults(e.target.value);
});
document.getElementById('closeStockAllocationModalBtn').addEventListener('click', () => closeStockAllocationModal());
document.getElementById('closeStockAllocationModalBtn2').addEventListener('click', () => closeStockAllocationModal());
document.getElementById('stockAllocationModal').addEventListener('click', (e) => {
  if (e.target.id === 'stockAllocationModal') closeStockAllocationModal();
});

// 입력 중인 draft 비중 + 모달을 연 시점의 실보유금액 스냅샷을 조합해 목표금액/증감금액 미리보기를
// 갱신한다 - input 엘리먼트는 절대 다시 그리지 않고 미리보기 텍스트(.textContent/.innerHTML)와
// FR(자동계산) 표시만 갱신하므로, 타이핑 중 포커스가 끊기지 않는다.
function updateRtmPreviews() {
  const frInput = document.getElementById('rtm_domesticFR');
  if (frInput) frInput.value = fmtNum(100 - num(rebalanceModalDraft.domestic['국내']), 1);

  const { total, byDomestic, perRegion } = rebalanceModalSnapshot;
  // 국내/해외 split 아래 목표금액/조정금액 미리보기 - 모달 안의 세부 목표 항목 미리보기와 같은 형식
  // (한 줄 flex row, 목표금액 굵게)을 그대로 맞춘다. 모달은 폭이 넓어(max-w-lg) 기본 화면의 좁은
  // 카드용 축약 표기(rebalanceAmountPreviewHtml)까지는 필요 없다.
  ['국내', '해외'].forEach((region) => {
    const el = document.querySelector(`[data-rtm-domestic-preview="${region}"]`);
    if (!el) return;
    const targetAmount = total * num(rebalanceModalDraft.domestic[region]) / 100;
    const currentAmount = (byDomestic && byDomestic[region]) || 0;
    const diff = targetAmount - currentAmount;
    // [모바일 줄바꿈 버그 수정] 예전엔 두 span을 한 flex row(justify-between)에 나란히 두어, 금액이
    // 길어지면 좁은 화면에서 중간에 부자연스럽게 줄바꿈됐다. 이제 각 줄을 별도 block(div)으로 나눠
    // 화면 폭과 무관하게 항상 목표금액/조정금액 두 줄로 고정 표시한다. [목표금액 줄바꿈 방지 - 요청
    // 반영] 이 div는 2열 그리드(rtmDomesticSplit) 안이라 폭이 좁아 "목표금액" 라벨과 금액이 그
    // 자체로도 줄바꿈될 수 있어 whitespace-nowrap을 추가한다.
    el.innerHTML = `<div class="text-slate-400 whitespace-nowrap">목표금액 <span class="font-bold text-slate-700 dark:text-slate-200">${fmtKRW(targetAmount)}</span></div><div class="font-medium ${rebalanceDiffColorClass(diff)}">${fmtSigned(diff)}</div>`;
  });

  ['국내', '해외'].forEach((region) => {
    const regionTargetAmount = total * num(rebalanceModalDraft.domestic[region]) / 100;
    const targets = rebalanceModalDraft.targets[region];
    const currentAmounts = perRegion[region] || [];
    let sum = 0;
    targets.forEach((t, idx) => {
      const pct = num(t.pct);
      sum += pct;
      const targetAmount = regionTargetAmount * pct / 100;
      const currentAmount = currentAmounts[idx] || 0;
      const diff = targetAmount - currentAmount; // 양수=매수 필요(부족), 음수=매도 필요(과다)
      const previewEl = document.querySelector(`[data-rtm-preview][data-region="${region}"][data-idx="${idx}"]`);
      if (!previewEl) return;
      // [모바일 줄바꿈 버그 수정] 위 국내/해외 split 미리보기와 동일하게 두 줄(block)로 고정한다.
      // [목표금액 줄바꿈 방지 - 요청 반영] whitespace-nowrap 추가.
      previewEl.innerHTML = `<div class="text-slate-400 whitespace-nowrap">목표금액 <span class="font-bold text-slate-700 dark:text-slate-200">${fmtKRW(targetAmount)}</span></div><div class="font-medium ${rebalanceDiffColorClass(diff)}">${fmtSigned(diff)}</div>`;
    });
    const sumEl = document.getElementById(region === '국내' ? 'rtmSumDomestic' : 'rtmSumForeign');
    const isValid = targets.length === 0 || Math.abs(sum - 100) < 0.05;
    sumEl.textContent = `합계 ${fmtNum(sum, 1)}%`;
    sumEl.className = isValid ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs font-semibold text-amber-600 dark:text-amber-400';
  });
}

// [티커별 역할(포지션) 단일 소스 - 요청 반영] 모달 [확인] 커밋 시점에만 레지스트리에 반영한다 - 드래프트
// 편집 중(입력할 때마다)에는 반영하지 않는다. [취소]/배경 클릭으로 닫으면 드래프트가 통째로 버려지는
// 기존 규칙과 맞추기 위함이다(편집 중 값이 취소돼도 레지스트리가 조용히 오염되면 안 된다).
function syncTickerRolesFromRebalanceTargets(owner) {
  ['국내', '해외'].forEach((region) => {
    (state.rebalance[owner].targets[region] || []).forEach((t) => {
      if (t.type === 'ticker' && t.ticker) setTickerRole(t.ticker, t.role);
      if (Array.isArray(t.selectedStocks)) {
        t.selectedStocks.forEach((s) => { if (s.ticker) setTickerRole(s.ticker, s.role); });
      }
    });
  });
}

// [확인] - 초안을 state.rebalance에 커밋하고 저장 + 메인 화면/연산 로직에 반영한다.
document.getElementById('confirmRebalanceTargetModalBtn').addEventListener('click', () => {
  const owner = rebalanceModalOwner;
  state.rebalance[owner].domestic = { ...rebalanceModalDraft.domestic };
  state.rebalance[owner].targets = {
    '국내': cloneRebalanceTargetList(rebalanceModalDraft.targets['국내']),
    '해외': cloneRebalanceTargetList(rebalanceModalDraft.targets['해외'])
  };
  syncTickerRolesFromRebalanceTargets(owner);
  persistRebalance();
  closeRebalanceTargetModal();
  renderRebalance();
});
document.getElementById('closeRebalanceTargetModalBtn').addEventListener('click', () => closeRebalanceTargetModal());
document.getElementById('cancelRebalanceTargetModalBtn').addEventListener('click', () => closeRebalanceTargetModal());
document.getElementById('rebalanceTargetModal').addEventListener('click', (e) => {
  if (e.target.id === 'rebalanceTargetModal') closeRebalanceTargetModal();
});

// [소유자별 진입점] 신랑/와이프 각 카드의 [비중조절] 버튼이 같은 모달을 그 소유자용으로 연다
// (data-rebalance-detail-btn 위임 - 카드가 owner별로 2벌이라 리스너도 위임 방식으로 묶는다).
document.querySelectorAll('[data-rebalance-detail-btn]').forEach((btn) => {
  btn.addEventListener('click', () => openRebalanceTargetModal(btn.dataset.owner));
});

// [버그 수정 - 옛 "목표 비중 설정" 탭 통합] 예전엔 여기서 "국내/해외 구성 결과"·"국내/해외 세부
// 구성 결과" 아코디언 카드 3개를 채웠으나(renderRebalanceResultGroup/renderTargetRebalanceResultGroup),
// 요청에 따라 그 카드들을 완전히 삭제하고 그 자리에 더 상세한 "종목별 실행 가이드"(옛 "실행
// 가이드" 탭 - renderIndividualRebalanceGuide)를 대신 보여주게 됐다. [3카드 그리드 완전 삭제 - 요청
// 반영] 목표비중 입력 섹션의 "합계 N%" 배지(updateTargetSum)를 표시하던 카드 자체가 삭제되어 이
// 호출도 함께 제거됐다 - 합계는 이제 rebalanceTargetModal 안(rtmSumDomestic/Foreign)에서만 보인다.
function updateRebalanceResults() {
  renderPositionAnalysisCard('positionAnalysisCardAll', 'all');
  renderPositionAnalysisCard('positionAnalysisCardHusband', '신랑');
  renderPositionAnalysisCard('positionAnalysisCardWife', '와이프');
  reapplyPositionAnalysisAccordionHeights();
  renderIndividualRebalanceGuide();
  updateProjection();
}

/* -------------------------------------------------------------------------
 * [Part 3] 포지션별 목표비중 분석 - 국내/해외 + 공격수/코어미드필드/수비수/미지정, 총 6개 클릭 탭
 *    - [목표 비중 기준] 실제 보유 자산(state.assets)이 아니라 신랑/와이프 각자의 목표 비중
 *      (state.rebalance[owner])을 기준으로 집계한다 - "지금 무엇을 들고 있는가"가 아니라 "무엇을
 *      목표로 하고 있는가"를 보여주는 카드다.
 *    - [3개 인스턴스 - 요청 반영] 부부 합산 카드 하나(index.html "전체 포지션별 목표비중 분석") +
 *      신랑/와이프 각자의 목표비중 타이틀 바로 아래 상시 노출 카드 2개, 총 3곳에서
 *      renderPositionAnalysisCard()를 각기 다른 컨테이너/ownerFilter로 호출한다.
 *    - [6개 클릭 탭 - '코어미드필드' 통합 반영] 국내/해외 2개 + 공격수/코어미드필드/수비수/미지정 4개
 *      (예전엔 미드필더/코어자산이 따로였음), 전부 클릭하면 positionRoleBreakdownModal이 그 항목을
 *      구성하는 실제 목표 종목(티커/비중)을 팝업으로 보여준다(buildPositionDrilldownRows/
 *      openPositionDrilldownModal).
 * ---------------------------------------------------------------------- */
// 소유자 한 명의 목표 비중 100%를 role별로 나눈 순수 비율(0~1, 합계 1) - 실제 금액과 무관하게 국내/해외
// split(%) × 지역 내 항목 비중(%)만으로 계산한다. selectedStocks까지 놓치지 않도록 펼쳐진 목록
// (expandRebalanceTargetsForComputation)을 쓴다.
function computeOwnerTargetRoleWeights(owner) {
  const weights = { attacker: 0, core_mid: 0, defender: 0, unassigned: 0 };
  const domestic = state.rebalance[owner].domestic;
  ['국내', '해외'].forEach((region) => {
    const regionWeight = num(domestic[region]) / 100;
    expandRebalanceTargetsForComputation(owner, region).forEach((t) => {
      const rowWeight = regionWeight * (num(t.pct) / 100);
      // [자산군 캐치올도 포지션 집계 대상 - 요청 반영] 티커 지정 항목뿐 아니라 채권/현금 같은 캐치올도
      // role이 있으면 그대로 집계한다(더 이상 티커 유무로 제한하지 않음).
      const key = (t.role && weights[t.role] !== undefined) ? t.role : 'unassigned';
      weights[key] += rowWeight;
    });
  });
  return weights;
}
// ownerFilter가 실제 소유자명이면 그 사람의 목표 비중 100%를 그대로 role별로 나눈 비율이고, 'all'
// (또는 생략, 부부 합산)이면 두 사람의 실제 리밸런싱 대상 총액(getRebalanceTotals)을 가중치로 삼아
// 금액 가중 평균한다 - 신랑이 실제로 더 큰 총액을 갖고 있으면 신랑의 목표 배분이 합산 결과에 더 크게
// 반영된다(단순 50:50 평균이 아니다). grandTotal은 실제 금액(그 소유자/가구의 리밸런싱 대상 총액)이며,
// "역할이 집계될 자산 자체가 없음"을 판정하는 용도로만 쓰인다 - 목표 비중 계산 자체(pct)에는 관여하지 않는다.
function computePositionRoleBreakdown(ownerFilter) {
  if (ownerFilter && ownerFilter !== 'all') {
    const ownerTotal = getRebalanceTotals(ownerFilter).total;
    const weights = computeOwnerTargetRoleWeights(ownerFilter);
    const totals = {}, pct = {};
    Object.keys(weights).forEach((k) => { totals[k] = weights[k] * ownerTotal; pct[k] = weights[k] * 100; });
    return { totals, pct, grandTotal: ownerTotal };
  }
  const totals = { attacker: 0, core_mid: 0, defender: 0, unassigned: 0 };
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((owner) => {
    const ownerTotal = getRebalanceTotals(owner).total;
    if (ownerTotal <= 0) return;
    const weights = computeOwnerTargetRoleWeights(owner);
    Object.keys(weights).forEach((k) => { totals[k] += weights[k] * ownerTotal; });
    grandTotal += ownerTotal;
  });
  const pct = {};
  Object.keys(totals).forEach((k) => { pct[k] = grandTotal !== 0 ? (totals[k] / grandTotal) * 100 : 0; });
  return { totals, pct, grandTotal };
}

// [국내/해외 목표비중 축 - 요청 반영] role과 나란히 보여줄 두 번째 축. state.rebalance[owner].domestic에
// 이미 %로 직접 저장돼 있어 role처럼 목표 항목을 펼쳐 집계할 필요가 없다.
function computeOwnerTargetRegionWeights(owner) {
  const domestic = state.rebalance[owner].domestic;
  return { '국내': num(domestic['국내']) / 100, '해외': num(domestic['해외']) / 100 };
}
// computePositionRoleBreakdown과 완전히 동일한 가중 기준(owner 실제 리밸런싱 대상 총액 비중)으로
// 국내/해외 축을 계산한다 - 두 축이 항상 같은 기준으로 합산되어 카드 안에서 일관되게 보인다.
function computeTargetRegionBreakdown(ownerFilter) {
  if (ownerFilter && ownerFilter !== 'all') {
    const ownerTotal = getRebalanceTotals(ownerFilter).total;
    const weights = computeOwnerTargetRegionWeights(ownerFilter);
    return { pct: { '국내': weights['국내'] * 100, '해외': weights['해외'] * 100 }, grandTotal: ownerTotal };
  }
  const totals = { '국내': 0, '해외': 0 };
  let grandTotal = 0;
  REBALANCE_OWNERS.forEach((owner) => {
    const ownerTotal = getRebalanceTotals(owner).total;
    if (ownerTotal <= 0) return;
    const weights = computeOwnerTargetRegionWeights(owner);
    totals['국내'] += weights['국내'] * ownerTotal;
    totals['해외'] += weights['해외'] * ownerTotal;
    grandTotal += ownerTotal;
  });
  const pct = {};
  Object.keys(totals).forEach((k) => { pct[k] = grandTotal !== 0 ? (totals[k] / grandTotal) * 100 : 0; });
  return { pct, grandTotal };
}

const POSITION_ROLE_BAR_ROWS = [
  { key: 'attacker', label: '⚔️ 공격수', color: '#ef4444' },
  { key: 'core_mid', label: '🎯 코어미드필드', color: '#f59e0b' },
  { key: 'defender', label: '🛡️ 수비수', color: '#3b82f6' },
  { key: 'unassigned', label: '미지정', color: '#94a3b8' }
];
const POSITION_REGION_BAR_ROWS = [
  { key: '국내', label: '🇰🇷 국내', color: '#0ea5e9' },
  { key: '해외', label: '🌎 해외', color: '#8b5cf6' }
];
// [절세계좈 현황 카드 - 포지션 비중 표기 재사용] "공격수 10% · 코어미드필드 20% · 수비수 30%" 같은
// 한 줄 요약 문자열을 만든다 - POSITION_ROLE_BAR_ROWS와 같은 라벨/순서를 써서 "포지션별 목표비중
// 분석" 카드와 표기가 항상 일치하게 한다(0%에 가까운 항목은 생략해 간결하게 유지).
function formatRolePctSummary(pct) {
  const parts = POSITION_ROLE_BAR_ROWS
    .filter((r) => num(pct[r.key]) > 0.5)
    .map((r) => `${r.label} ${fmtNum(pct[r.key], 0)}%`);
  return parts.length > 0 ? parts.join(' · ') : '집계할 포지션 데이터가 없습니다';
}
// 클릭 가능한 막대 행 하나 - kind('region'|'role')/key/ownerFilter를 data attribute로 실어두면, 클릭 시
// openPositionDrilldownModal이 그 항목을 구성하는 실제 목표 종목을 팝업으로 보여준다.
function positionTabRowHtml(kind, key, label, pct, color, ownerFilter) {
  return `
  <button type="button" data-position-tab data-kind="${kind}" data-key="${escapeHtml(key)}" data-owner="${escapeHtml(ownerFilter)}"
    class="w-full text-left mb-2 last:mb-0 group">
    <div class="flex items-center justify-between text-[11px] mb-1">
      <span class="text-slate-600 dark:text-slate-300 font-medium group-hover:text-brand-600 dark:group-hover:text-brand-400 group-hover:underline">${label}</span>
      <span class="font-semibold" style="color:${color}">${fmtNum(pct, 1)}%</span>
    </div>
    <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div class="h-full rounded-full" style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></div>
    </div>
  </button>`;
}
function positionAnalysisCardBodyHtml(ownerFilter) {
  const region = computeTargetRegionBreakdown(ownerFilter);
  const role = computePositionRoleBreakdown(ownerFilter);
  if (role.grandTotal === 0) return '<p class="text-xs text-slate-400">집계할 목표 비중이 없습니다.</p>';
  const regionHtml = POSITION_REGION_BAR_ROWS.map((row) => positionTabRowHtml('region', row.key, row.label, region.pct[row.key], row.color, ownerFilter || 'all')).join('');
  const roleHtml = POSITION_ROLE_BAR_ROWS.map((row) => positionTabRowHtml('role', row.key, row.label, role.pct[row.key], row.color, ownerFilter || 'all')).join('');
  return regionHtml + '<div class="my-2.5 border-t border-slate-100 dark:border-slate-800"></div>' + roleHtml;
}
function renderPositionAnalysisCard(containerId, ownerFilter) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = positionAnalysisCardBodyHtml(ownerFilter);
  el.querySelectorAll('[data-position-tab]').forEach((btn) => {
    btn.addEventListener('click', () => openPositionDrilldownModal(btn.dataset.kind, btn.dataset.key, btn.dataset.owner));
  });
}

// [포지션 카드 아코디언 부활 - 요청 반영] 가구 합산/신랑/와이프 3개 포지션 분석 카드 모두 기본은
// 닫힘(topHoldingsAccordionOpen과 동일한 setAccordionOpen 패턴, js/10) - 헤더를 눌러야 펼쳐지고,
// 탭 전환 시 resetAllAccordionsOnTabSwitch()(js/03)가 전부 다시 닫는다.
let positionAnalysisAccordionOpen = { all: false, '신랑': false, '와이프': false };
const POSITION_ANALYSIS_ACCORDION_SUFFIX = { all: 'All', '신랑': 'Husband', '와이프': 'Wife' };
// renderPositionAnalysisCard()로 내부 콘텐츠가 다시 그려질 때마다(합계/탭 값이 바뀌어 높이도 바뀔 수
// 있음) 호출해, 열려 있는 카드의 max-height를 새 scrollHeight로 재계산한다(topHoldings와 동일한 이유).
function reapplyPositionAnalysisAccordionHeights() {
  Object.keys(POSITION_ANALYSIS_ACCORDION_SUFFIX).forEach((key) => {
    const suffix = POSITION_ANALYSIS_ACCORDION_SUFFIX[key];
    const body = document.getElementById(`positionAnalysisAccordion${suffix}Body`);
    const chevron = document.getElementById(`positionAnalysisAccordion${suffix}Chevron`);
    if (body && chevron) setAccordionOpen(body, chevron, positionAnalysisAccordionOpen[key]);
  });
}
Object.keys(POSITION_ANALYSIS_ACCORDION_SUFFIX).forEach((key) => {
  const suffix = POSITION_ANALYSIS_ACCORDION_SUFFIX[key];
  const btn = document.getElementById(`positionAnalysisAccordion${suffix}Btn`);
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    // [비중조절 버튼과 겹침 방지] 신랑/와이프 헤더는 [비중조절] 버튼과 같은 행을 공유한다 - 그 버튼
    // 클릭이 이 행으로 버블링돼도 아코디언까지 함께 토글되지 않게 걸러낸다.
    if (e.target.closest('[data-rebalance-detail-btn]')) return;
    positionAnalysisAccordionOpen[key] = !positionAnalysisAccordionOpen[key];
    reapplyPositionAnalysisAccordionHeights();
  });
});

/* -------------------------------------------------------------------------
 * [Part 3 드릴다운 팝업] 6개 탭(국내/해외/공격수/코어미드필드/수비수/미지정) 중 아무거나 클릭하면
 * 그 항목을 구성하는 실제 목표 종목(티커/비중)을 보여준다 - positionRoleBreakdownModal을 그대로
 * 재사용한다(제목/본문만 그때그때 새로 채움).
 * ---------------------------------------------------------------------- */
// ownerFilter가 'all'이면 두 owner를 각자 계산해 이어붙이되, 카드에 표시된 household %와 합이 맞도록
// 각 owner의 리밸런싱 대상 총액 비중으로 다시 가중한다(computeTargetRegionBreakdown/
// computePositionRoleBreakdown과 동일한 가중 기준).
function buildPositionDrilldownRows(kind, key, ownerFilter) {
  const isAll = !ownerFilter || ownerFilter === 'all';
  const owners = isAll ? REBALANCE_OWNERS : [ownerFilter];
  const ownerShare = {};
  if (isAll) {
    let grand = 0;
    const totals = {};
    REBALANCE_OWNERS.forEach((o) => { const t = getRebalanceTotals(o).total; totals[o] = t; grand += t; });
    REBALANCE_OWNERS.forEach((o) => { ownerShare[o] = grand !== 0 ? totals[o] / grand : 1 / REBALANCE_OWNERS.length; });
  } else {
    ownerShare[ownerFilter] = 1;
  }
  const rows = [];
  owners.forEach((owner) => {
    const domestic = state.rebalance[owner].domestic;
    const regionsToScan = kind === 'region' ? [key] : ['국내', '해외'];
    regionsToScan.forEach((region) => {
      const regionWeight = num(domestic[region]) / 100;
      expandRebalanceTargetsForComputation(owner, region).forEach((t) => {
        // [자산군 캐치올도 드릴다운 대상 - 요청 반영] 티커 지정 항목뿐 아니라 채권/현금 같은 캐치올도
        // 목록에 함께 보여준다(computeOwnerTargetRoleWeights와 동일한 집계 기준으로 맞춤).
        if (kind === 'role') {
          const tRole = (t.role && POSITION_ROLE_BAR_ROWS.some((r) => r.key === t.role)) ? t.role : 'unassigned';
          if (tRole !== key) return;
        }
        const pct = regionWeight * (num(t.pct) / 100) * ownerShare[owner] * 100;
        if (pct <= 0) return;
        rows.push({ owner, label: t.label, ticker: t.ticker, region, pct });
      });
    });
  });
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}
function positionDrilldownTitle(kind, key, ownerFilter) {
  const ownerLabel = (ownerFilter && ownerFilter !== 'all') ? `${ownerFilter}님 ` : '부부 합산 ';
  if (kind === 'region') return `${ownerLabel}${key} 구성 종목`;
  const roleLabel = (POSITION_ROLE_BAR_ROWS.find((r) => r.key === key) || {}).label || key;
  return `${ownerLabel}${roleLabel} 구성 종목`;
}
function openPositionDrilldownModal(kind, key, ownerFilter) {
  document.getElementById('positionRoleBreakdownModalTitle').textContent = positionDrilldownTitle(kind, key, ownerFilter);
  const rows = buildPositionDrilldownRows(kind, key, ownerFilter);
  const isAll = !ownerFilter || ownerFilter === 'all';
  document.getElementById('positionRoleBreakdownModalBars').innerHTML = rows.length === 0
    ? '<p class="text-xs text-slate-400">구성 종목이 없습니다.</p>'
    : rows.map((r) => `
    <div class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
      <div class="min-w-0">
        <p class="text-xs font-medium truncate">${escapeHtml(r.label)}${isAll ? ` <span class="text-[10px] text-slate-400">(${escapeHtml(r.owner)})</span>` : ''}</p>
        <p class="text-[10px] text-slate-400 truncate">${r.ticker ? escapeHtml(r.ticker) + ' · ' : ''}${escapeHtml(r.region)}</p>
      </div>
      <span class="text-xs font-semibold shrink-0">${fmtNum(r.pct, 1)}%</span>
    </div>`).join('');
  document.getElementById('positionRoleBreakdownModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closePositionRoleBreakdownModal(viaBackButton) {
  document.getElementById('positionRoleBreakdownModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('closePositionRoleBreakdownModalBtn').addEventListener('click', () => closePositionRoleBreakdownModal());
document.getElementById('positionRoleBreakdownModal').addEventListener('click', (e) => {
  if (e.target.id === 'positionRoleBreakdownModal') closePositionRoleBreakdownModal();
});

// 매수/매도 필요 금액에 따라 "매수"(파랑) / "매도"(빨강) / "유지"(회색) 배지를 정하고, 실제 종목별
// 매수/매도 판단 노이즈(아주 미세한 원 단위 오차까지 전부 "매수/매도"로 표시되는 것)를 줄이기 위해
// 현재 평가금액의 2% 미만 차이는 "유지"로 취급한다.
function rebalanceActionBadge(diff, curAmount) {
  const threshold = Math.max(curAmount * 0.02, 10000);
  if (Math.abs(diff) < threshold) {
    return { label: '유지', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' };
  }
  if (diff > 0) {
    return { label: `+${fmtSigned(diff).replace('+', '')} 매수`, className: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' };
  }
  return { label: `${fmtSigned(diff)} 매도`, className: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400' };
}

// [소유자별 순차 아코디언] 'all'(전체, 가구 합산) + 실제 소유자명(신랑/와이프 등) 각각을 독립적인
// 아코디언 섹션으로 늘어놓는다 - 예전엔 탭으로 하나만 골라 보는 방식이었지만, 이제 전부 동시에 펼쳐 둘
// 수 있다. 기본값은 전부 접힘이며, 새로 추가된 소유자는 기본 접힘으로 시작하고 기존에 펼쳐 둔 섹션의
// 상태는 재렌더링돼도 그대로 유지된다.
let rebalanceGuideAccordionOpen = {};

// [헤더 요약 HTML] 특정 소유자(rows)의 매수/매도 필요금액 합계·조정 필요 종목 수를 뱃지로 만든다 -
// rebalanceActionBadge와 동일한 기준(현재 평가금액의 2% 미만 차이는 "유지")으로 분류해 합산한다.
function buildRebalanceGuideSummaryHtml(rows) {
  if (rows.length === 0) return '';
  let buyTotal = 0, sellTotal = 0, adjustCount = 0;
  rows.forEach((r) => {
    const badge = rebalanceActionBadge(r.diff, r.curAmount);
    if (badge.label === '유지') return;
    adjustCount += 1;
    if (r.diff > 0) buyTotal += r.diff; else sellTotal += r.diff;
  });
  return `
    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">매수 ${fmtSigned(buyTotal)}</span>
    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">매도 ${fmtSigned(sellTotal)}</span>
    <span class="text-[10px] text-slate-400">조정 필요 ${adjustCount}종목</span>
  `;
}

const qtyRebalanceGuideText = (qtyDelta, isForeign) => {
  const rounded = isForeign ? Math.round(qtyDelta * 100) / 100 : Math.round(qtyDelta);
  if (rounded === 0) return '0주';
  return (rounded > 0 ? '+' : '') + fmtNum(rounded, isForeign ? 2 : 0) + '주';
};

// [카드 목록 HTML] 특정 소유자 기준 rows/excluded를 카드 그리드 HTML로 만든다 - 소유자별 아코디언
// 섹션마다 이 함수를 재사용한다.
function buildRebalanceGuideCardsHtml(rows, excluded) {
  if (rows.length === 0 && excluded.length === 0) {
    return '<p class="text-xs text-slate-400 col-span-full">등록된 자산이 없습니다.</p>';
  }
  const cards = rows.map((r) => {
    const badge = rebalanceActionBadge(r.diff, r.curAmount);
    return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(r.ticker || '')}" data-name="${escapeHtml(r.name || '')}">${escapeHtml(r.name || r.ticker || '(이름 없음)')}</p>
          <p class="text-[11px] text-slate-400 truncate">${escapeHtml(r.ticker || '-')} · ${escapeHtml(r.owners.join('+') || '-')} · <span class="text-slate-300 dark:text-slate-600">목표: ${escapeHtml(r.targetLabel)}</span></p>
        </div>
        <span class="shrink-0 text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap ${badge.className}">${badge.label}</span>
      </div>
      <div class="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
        <div><span class="text-slate-400 block">현재 평가금액</span><span class="font-medium">${fmtKRW(r.curAmount)}</span></div>
        <div><span class="text-slate-400 block">목표 평가금액</span><span class="font-medium">${fmtKRW(r.targetAmount)}</span></div>
        <div><span class="text-slate-400 block">조정 필요금액</span><span class="font-medium ${profitColor(r.diff)}">${fmtSigned(r.diff)}</span></div>
        <div><span class="text-slate-400 block">예상 매수/매도 수량</span><span class="font-medium">${qtyRebalanceGuideText(r.qtyDelta, r.isForeign)}</span></div>
      </div>
    </div>`;
  }).join('');

  const excludedCards = excluded.map((a) => {
    const r = calcRow(a);
    return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate text-slate-500 dark:text-slate-400 cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(a.ticker || '')}" data-name="${escapeHtml(a.name || '')}">${escapeHtml(a.name || a.ticker || '(이름 없음)')}</p>
          <p class="text-[11px] text-slate-400 truncate">${escapeHtml(a.ticker || '-')} · ${escapeHtml(a.owner || '-')}</p>
        </div>
        <span class="shrink-0 text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300">구성 제외 자산</span>
      </div>
      <div class="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
        <div><span class="text-slate-400 block">현재 평가금액</span><span class="font-medium">${fmtKRW(r.curAmount)}</span></div>
        <div><span class="text-slate-400 block">목표 평가금액</span><span class="font-medium text-slate-300 dark:text-slate-600">해당 없음</span></div>
      </div>
    </div>`;
  }).join('');

  return cards + excludedCards;
}

// [포트폴리오 구성] 탭 맨 아래 "종목별 실행 가이드" - 자산군/티커 단위로 계산된 목표금액을
// 실제 보유 개별 종목 단위로 풀어내 종목별 매수/매도 실행 가이드를 [전체]/[소유자별] 순차 아코디언
// 카드 형태로 보여준다. 부동산 등 목표에 매칭되지 않는 자산은 별도로 "[구성 제외 자산]" 배지를
// 달아 같은 목록에 구분 표시한다.
function renderIndividualRebalanceGuide() {
  const container = document.getElementById('rebalanceGuideAccordionsContainer');
  if (!container) return;

  // [소유자별 독립 실행 가이드 - 요청 반영] 가구 통합('all') 아코디언은 제거하고 신랑/와이프 각자의
  // 독립 목표(state.rebalance[owner]) 기준 가이드만 보여준다.
  const ownerKeys = REBALANCE_OWNERS;
  ownerKeys.forEach((key) => { if (!(key in rebalanceGuideAccordionOpen)) rebalanceGuideAccordionOpen[key] = false; });

  container.innerHTML = ownerKeys.map((key) => {
    const label = key;
    const { rows, excluded } = computeIndividualRebalanceGuide(key);
    return `
    <div class="border-t border-slate-100 dark:border-slate-800">
      <button type="button" data-guide-accordion-key="${escapeHtml(key)}"
        class="rebalance-guide-accordion-btn w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="text-xs font-semibold shrink-0">${escapeHtml(label)} 실행 가이드</span>
          <div class="flex items-center gap-1.5 flex-wrap">${buildRebalanceGuideSummaryHtml(rows)}</div>
        </div>
        <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 rebalance-guide-chevron" data-guide-chevron-key="${escapeHtml(key)}"></i>
      </button>
      <div class="overflow-hidden transition-[max-height] duration-300 ease-in-out rebalance-guide-body" data-guide-body-key="${escapeHtml(key)}" style="max-height:0px;">
        <div class="px-4 pb-4 pt-1">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${buildRebalanceGuideCardsHtml(rows, excluded)}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  lucide.createIcons();
  reapplyRebalanceGuideAccordionHeights();
}

// 방금 다시 그린 섹션들 기준으로 각각의 펼침 상태를 재적용한다 - 소유자가 추가/제거되거나 카드 내용이
// 바뀌어도 max-height가 새 높이에 맞게 갱신되고, 접힌 상태였다면 계속 접힌 채로 유지된다
// (txListAccordion과 동일한 이유).
function reapplyRebalanceGuideAccordionHeights() {
  const container = document.getElementById('rebalanceGuideAccordionsContainer');
  if (!container) return;
  container.querySelectorAll('.rebalance-guide-body').forEach((body) => {
    const key = body.dataset.guideBodyKey;
    const chevron = container.querySelector(`.rebalance-guide-chevron[data-guide-chevron-key="${CSS.escape(key)}"]`);
    if (chevron) setAccordionOpen(body, chevron, !!rebalanceGuideAccordionOpen[key]);
  });
}

// [이벤트 위임] 매 렌더링마다 innerHTML로 통째로 다시 그려지므로, 섹션 헤더 버튼에 개별 리스너를
// 매번 새로 붙이는 대신 컨테이너 하나에 위임해 둔다 - 재렌더링돼도 리스너가 끊기지 않는다.
document.getElementById('rebalanceGuideAccordionsContainer').addEventListener('click', (e) => {
  const btn = e.target.closest('.rebalance-guide-accordion-btn');
  if (!btn) return;
  const key = btn.dataset.guideAccordionKey;
  rebalanceGuideAccordionOpen[key] = !rebalanceGuideAccordionOpen[key];
  reapplyRebalanceGuideAccordionHeights();
});

// [종목별 실행 가이드 엑셀 다운로드] 화면에 보이는 카드와 같은 데이터(computeIndividualRebalanceGuide)를
// 그대로 표로 옮긴다. 이 앱은 이미 SheetJS(xlsx.full.min.js)를 CDN으로 로드해 엑셀 백업/업로드에 쓰고
// 있으므로(위 "21. 엑셀 내보내기" 참고) 같은 라이브러리/패턴을 그대로 재사용한다 - 별도 CDN을 새로
// 추가하지 않는다.
// 특정 소유자 필터(전체/신랑/와이프 등) 기준으로 실행 가이드 표 데이터를 만든다.
// 화면에 그리는 카드용 계산(computeIndividualRebalanceGuide)을 그대로 재사용해 화면과 엑셀의
// 수치가 항상 일치하도록 한다.
function buildRebalanceGuideSheetRows(ownerFilter) {
  const { rows, excluded } = computeIndividualRebalanceGuide(ownerFilter);
  const qtyRounded = (qtyDelta, isForeign) => isForeign ? Math.round(qtyDelta * 100) / 100 : Math.round(qtyDelta);

  const guideRows = rows.map((r) => {
    const badge = rebalanceActionBadge(r.diff, r.curAmount);
    return {
      '종목명': r.name || r.ticker || '(이름 없음)',
      '티커': r.ticker || '',
      '소유자': r.owners.join('+') || '-',
      '지역': r.region,
      '목표 항목': r.targetLabel,
      '거래통화': r.isForeign ? 'USD' : 'KRW',
      '현재 평가금액(KRW)': Math.round(r.curAmount),
      '목표 평가금액(KRW)': Math.round(r.targetAmount),
      '조정 필요금액(KRW)': Math.round(r.diff),
      '실행 구분': badge.label,
      '예상 매수/매도 수량': qtyRounded(r.qtyDelta, r.isForeign)
    };
  });

  // 목표에 매칭되지 않아 화면에서도 "구성 제외 자산"으로 별도 표시되는 항목들 - 같은 표 아래에
  // 이어 붙이되, 목표/실행 관련 컬럼은 해당 없음을 뜻하는 빈 값으로 둔다(화면 카드의 "해당 없음"과 동일).
  const excludedRows = excluded.map((a) => {
    const r = calcRow(a);
    return {
      '종목명': a.name || a.ticker || '(이름 없음)',
      '티커': a.ticker || '',
      '소유자': a.owner || '-',
      '지역': a.isDomestic,
      '목표 항목': '',
      '거래통화': a.currency,
      '현재 평가금액(KRW)': Math.round(r.curAmount),
      '목표 평가금액(KRW)': '',
      '조정 필요금액(KRW)': '',
      '실행 구분': '구성 제외 자산',
      '예상 매수/매도 수량': ''
    };
  });

  return { rows: guideRows, excluded: excludedRows, isEmpty: rows.length === 0 && excluded.length === 0 };
}

document.getElementById('rebalanceGuideExportBtn').addEventListener('click', () => {
  // [소유자별 독립 실행 가이드 - 요청 반영] 가구 통합('all') 시트는 더 이상 의미가 없다(목표 자체가
  // 소유자별로 다르므로 "가구 통합 목표"가 존재하지 않는다) - 신랑/와이프 시트만 생성한다.
  const sheetDefs = REBALANCE_OWNERS.map((o) => ({ key: o, label: o }));
  const sheetCols = [
    { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  let anyData = false;
  const usedNames = new Set();

  sheetDefs.forEach((def) => {
    const { rows, excluded, isEmpty } = buildRebalanceGuideSheetRows(def.key);
    if (!isEmpty) anyData = true;
    const ws = XLSX.utils.json_to_sheet([...rows, ...excluded]);
    ws['!cols'] = sheetCols;
    // 엑셀 시트명 제약(31자 이하, 중복 불가) 대비 - 신랑/와이프 등은 짧아 실무상 충돌 없음.
    let sheetName = def.label.slice(0, 31) || def.key;
    while (usedNames.has(sheetName)) sheetName = `${sheetName}_`.slice(0, 31);
    usedNames.add(sheetName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (!anyData) {
    showToast('내보낼 실행 가이드 데이터가 없습니다.', 'warn');
    return;
  }

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `포트폴리오구성_실행가이드_${ymd}.xlsx`);
});

