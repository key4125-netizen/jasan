/* -------------------------------------------------------------------------
 * 18-3. [초보자용 리스크 진단] 안전 점수/신호등 + 쉬운 한글 번역 레이어
 *    - 화면에 노출되는 문구는 전부 이 구간에서 만든다. 내부 지표(베타/VaR/CVaR/Sortino/상관관계/
 *      집중도)는 computeAdvancedRiskMetrics()가 이미 실제로 계산해 둔 값을 그대로 쓰고, 여기서는
 *      "쉬운 한글 설명 + 점수 + 행동 제안"으로 옮겨 적기만 한다.
 * ---------------------------------------------------------------------- */
// [Sortino Ratio → 폭락장 방어 성적표 A~F] 연율화 Sortino 비율을 직관적인 학점으로 변환한다 - 학술적
// 컷오프가 아니라 일반 투자자가 감을 잡기 위한 참고용 구간이다.
function sortinoToGrade(sortino) {
  if (typeof sortino !== 'number' || !Number.isFinite(sortino)) return null;
  if (sortino >= 2.0) return 'A';
  if (sortino >= 1.0) return 'B';
  if (sortino >= 0.3) return 'C';
  if (sortino >= 0) return 'D';
  if (sortino >= -0.5) return 'E';
  return 'F';
}

// [1줄 쉬운 종합 진단] 6대 위험요인 중 점수가 가장 높은(가장 위험한) 요인 하나를 골라 그 원인을 구체
// 수치와 함께 문장으로 설명한다 - "72점입니다"가 아니라 "왜 72점인가"를 보여주는 것이 핵심.
function buildRiskDiagnosisLine(m) {
  const s = m.subScores;
  const maxKey = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  if (maxKey === 'concentration' && m.topHolding) {
    const contrib = typeof m.topHolding.riskContributionPct === 'number' ? m.topHolding.riskContributionPct : null;
    return contrib !== null
      ? `${m.topHolding.name}은(는) 투자 비중은 ${fmtNum(m.topWeight, 0)}%지만, 전체 계좌 위험의 ${fmtNum(contrib, 0)}%를 만듭니다.`
      : `현재 ${m.topHolding.name} 비중이 ${fmtNum(m.topWeight, 0)}%로 너무 커서 하락장에 널뛰기가 심할 수 있습니다.`;
  }
  if (maxKey === 'volatility' && typeof m.portfolioVolatilityPct === 'number') {
    return `포트폴리오 연환산 변동성이 ${fmtNum(m.portfolioVolatilityPct, 1)}%로 시장 평균보다 높은 편이라, 등락 폭 자체가 큽니다.`;
  }
  if (maxKey === 'drawdown') {
    return `평소에도 하루에 ${fmtNum(Math.abs(m.var95Pct), 1)}%(약 ${fmtKRWShort(Math.abs(m.var95KRW))}) 안팎까지 하락할 수 있고, 과거 데이터 기준 최대낙폭은 ${fmtNum(Math.abs(m.portfolioMDDPct ?? 0), 1)}%였습니다.`;
  }
  if (maxKey === 'market' && typeof m.portfolioBeta === 'number') {
    return `포트폴리오 전체가 시장보다 ${fmtNum(m.portfolioBeta, 1)}배 더 크게 움직이는 구조라, 하락장에서 손실 폭이 시장보다 클 수 있습니다.`;
  }
  if (maxKey === 'correlation' && m.topCorrelationPair) {
    return `${m.topCorrelationPair[0]}과(와) ${m.topCorrelationPair[1]}이(가) 같이 움직이는 경향이 커서, 종목 수는 여러 개여도 분산 효과가 기대만큼 크지 않을 수 있습니다.`;
  }
  if (maxKey === 'technical' && m.topHolding) {
    return '보유 종목 중 일부가 단기 과열이거나 추세가 꺾여 있어 기술적 위험이 다소 높습니다.';
  }
  return '포트폴리오가 비교적 안정적으로 분산되어 있습니다.';
}

// [💡 초직관적 행동 제안] 감지된 신호별로 규칙 기반 문장을 쌓는다(여러 개면 전부 보여준다). 아무
// 신호도 없으면 "유지" 안내 한 줄만 보여준다. 임계치는 6대 위험요인 산정 기준과 동일선상에 있다.
function buildRiskActionItems(m) {
  const items = [];
  if (m.topWeight >= 25 && m.topHolding) {
    const alt = m.topHolding.benchmarkKey === 'SP500' ? '미국 대표 지수 ETF(QQQM, SPYM 등)' : '코스피 대표지수 ETF';
    items.push(`${m.topHolding.name} 비중을 줄여 ${alt}로 나눠 담으세요.`);
  }
  if (typeof m.portfolioBeta === 'number' && m.portfolioBeta >= 1.15) {
    items.push('하락장 충격을 줄이기 위해 현금이나 미국 국채(TLT) 비중을 15% 정도 확보하세요.');
  }
  if (typeof m.weightedAvgCorrelation === 'number' && m.weightedAvgCorrelation >= 0.7 && m.topCorrelationPair) {
    items.push(`${m.topCorrelationPair[0]}과(와) ${m.topCorrelationPair[1]}은(는) 같이 움직이는 종목이라, 두 종목을 동시에 늘리기보다 성격이 다른 자산과 섞는 게 좋아요.`);
  }
  if (m.sectorExposure && m.sectorExposure.topSectorWeight >= 50 && m.sectorExposure.topSector && m.sectorExposure.topSector !== '미분류') {
    items.push(`ETF 속 구성종목까지 합치면 '${m.sectorExposure.topSector}' 섹터 노출이 ${fmtNum(m.sectorExposure.topSectorWeight, 0)}%에 달합니다 - 다른 섹터 자산으로 분산해 보세요.`);
  }
  if (items.length === 0) items.push('현재 특별한 위험 신호가 없습니다. 지금처럼 분산 투자를 유지하세요.');
  return items;
}

// [개별 종목 행동 지침 태그] RISK 관리 카드의 감지 종목 행에 붙일 짧은 한글 태그 - 어떤 조건에
// 걸렸는지에 따라 다르게 보여준다(RSI 과열/추세 이탈/52주 고점대비 급락/거래량 급증 각각에 대응,
// 우선순위 하나만 골라 보여준다 - 자세한 근거는 [🔍 리스크 진단 보기] 상세 카드에서 전부 보여준다).
function buildAssetActionTag(tags) {
  if (tags.includes('단기 과열')) return '비중 축소 검토';
  if (tags.includes('52주 고점대비 급락')) return '방어자산 확보 필요';
  if (tags.includes('추세 이탈')) return '단기 추세 주의';
  if (tags.includes('거래량 급증')) return '변동성 확대 주의';
  return null;
}

// [개별 종목 정밀 주가 분석 엔진의 판정 결과 → 태그] computeAdvancedRiskMetrics()가 이미 계산해 둔
// holding(h) 하나를 받아 RSI14 과열(70이상)/추세 이탈(20일선 아래)/52주 고점대비 급락(-30% 이하)/
// 거래량 급증(20일 평균 거래량의 2배 이상) 중 해당하는 태그를 전부 모은다(OR 조건). 가격 이력이 없는
// 종목(h가 없거나 hasData=false, 신규상장·API 실패 등)은 안전하게 태그 없음(안정 목록)으로 처리한다.
function buildIndividualRiskTags(h) {
  if (!h || !h.hasData) return [];
  const tags = [];
  if (h.rsiState === '과열') tags.push('단기 과열');
  if (h.trendBroken) tags.push('추세 이탈');
  if (typeof h.week52DrawdownPct === 'number' && h.week52DrawdownPct <= -30) tags.push('52주 고점대비 급락');
  if (h.volumeSpike) tags.push('거래량 급증');
  return tags;
}

// [구 3조건(지수대비 과락/매수가대비 -20%/20일선 이탈) → 신규 개별 종목 정밀 주가 분석 엔진으로 완전
// 대체] 이제 별도로 시세/지수를 다시 조회하지 않고, computeAdvancedRiskMetrics()가 이미 계산해 둔
// state.advancedRiskMetrics.holdings(포트폴리오 위험 진단과 완전히 같은 단일 데이터)에서 티커로 찾아
// 태그만 판정한다 - 중복 계산이 전혀 없다. 아직 계산 전(state.advancedRiskMetrics===null)이면 모든
// 종목이 태그 없음(안정)으로 잠시 보였다가, 계산이 끝나면 다음 렌더링에서 정상 분류된다.
// 신랑/와이프가 같은 종목을 나눠 보유해도 태그는 시세 데이터 기준(종목당 공통)이라 소유자별로 갈릴
// 일이 없다 - owners는 표시용으로만 병합한다(티커, 없으면 이름 기준 - 다른 병합 로직과 동일).
// [RISK 카드 - 소유자별 필터] ownerFilter가 있으면 그 소유자 보유분만 걸러서 리스트를 만들고, 태그
// 판정용 holding도 (전체가 아니라) 그 소유자 기준으로 다시 계산된 지표(getCurrentRiskMetrics 참고)를
// 쓴다 - 위험기여도(riskContributionPct) 같은 값은 소유자 범위에 따라 달라지기 때문이다.
function computeRiskClassifiedAssets(ownerFilter) {
  const m = (!ownerFilter || ownerFilter === 'all') ? state.advancedRiskMetrics : riskCardOwnerMetricsCache[ownerFilter];
  const holdingsByTicker = new Map(((m && m.holdings) || []).map((h) => [h.ticker, h]));

  const byKey = new Map();
  riskEligibleAssets().filter((a) => !ownerFilter || ownerFilter === 'all' || a.owner === ownerFilter).forEach((a) => {
    const yahoo = sanitizeTicker(a.ticker).yahooTicker;
    const key = String(a.ticker ?? '').trim() || `__name__${a.name}`;
    const row = { ...a, ...calcRow(a) };
    if (!byKey.has(key)) byKey.set(key, { key, asset: a, row, owners: new Set(), curAmount: 0, buyAmount: 0, holding: holdingsByTicker.get(yahoo) || null });
    const bucket = byKey.get(key);
    bucket.owners.add(a.owner);
    bucket.curAmount += row.curAmount; // 신랑/와이프가 나눠 보유해도 정렬 기준(평가금액)은 합산 기준으로 잡는다
    bucket.buyAmount += row.buyAmount;
  });

  const merged = [...byKey.values()].map((b) => ({
    key: b.key, asset: b.asset, row: b.row, holding: b.holding, tags: buildIndividualRiskTags(b.holding),
    owners: [...b.owners].sort((x, y) => ownerRank(x) - ownerRank(y)),
    curAmount: b.curAmount, buyAmount: b.buyAmount,
    rateOfReturn: b.buyAmount !== 0 ? (b.curAmount - b.buyAmount) / b.buyAmount * 100 : 0
  }));

  return { risky: merged.filter((x) => x.tags.length > 0), safe: merged.filter((x) => x.tags.length === 0) };
}

// [🔍 리스크 진단 보기] 개별 종목 정밀 리스크 카드 - 주가 상태 진단문 + 널뛰기위험(베타)/방어력
// (Sortino)/계좌 내 비중/52주 고점 대비 낙폭 + 초직관적 행동 지침을 전부 holding(h) 하나에서 뽑는다.
function buildIndividualDiagnosisLine(h) {
  if (!h || !h.hasData) return '가격 이력 데이터가 부족해(신규 상장 등) 정밀 진단을 계산할 수 없습니다.';
  const trendPhrase = h.trendBroken ? '20일선 아래로 단기 하락 전환 상태입니다.' : '20일선 위 상승 추세를 유지 중입니다.';
  // [초보자 용어] 'RSI'라는 전문용어 대신 '과열지수'(0~100, 높을수록 단기간에 너무 급하게 오른 상태)로
  // 통일해서 표현한다 - 원래 수치(h.rsi14)는 괄호 안에 그대로 남겨 숙련자도 참고할 수 있게 한다.
  const rsiPhrase = h.rsiState === '과열'
    ? `최근 며칠 너무 가파르게 올라 '숨 고르기'가 필요한 단기 과열 상태입니다 (과열지수 ${fmtNum(h.rsi14, 0)}/100).`
    : h.rsiState === '과매도'
      ? `단기간 너무 많이 빠져 '바닥 다지기' 구간에 가까운 상태입니다 (과열지수 ${fmtNum(h.rsi14, 0)}/100).`
      : `과열도 과매도도 아닌 적정 구간입니다 (과열지수 ${typeof h.rsi14 === 'number' ? fmtNum(h.rsi14, 0) : '-'}/100).`;
  return `${trendPhrase} ${rsiPhrase}`;
}

function buildIndividualActionItem(h, weightPct) {
  if (!h || !h.hasData) return '가격 이력 데이터가 부족해 행동 지침을 계산할 수 없습니다. 최근 상장/거래정지 종목일 수 있습니다.';
  const overweight = weightPct >= 25;
  if (overweight && h.rsiState === '과열') {
    return `현재 단기 과열 및 비중 과다(${fmtNum(weightPct, 1)}%) 상태입니다. 추가 매수보다는 일부 이익을 실현하여 목표 비중(15% 이하)으로 줄이고 방어 자산을 확보하세요.`;
  }
  if (overweight) {
    return `계좌 내 비중이 ${fmtNum(weightPct, 1)}%로 높은 편입니다. 목표 비중(15% 이하)까지 서서히 줄여 위험을 분산하세요.`;
  }
  if (h.rsiState === '과열') {
    return `단기 과열 상태입니다 (과열지수 ${fmtNum(h.rsi14, 0)}/100). 추가 매수는 조정 이후로 미루고, 일부 이익 실현을 고려하세요.`;
  }
  if (h.trendBroken) {
    return '20일선 아래로 단기 추세가 꺾였습니다. 반등 여부를 확인한 뒤 대응하고, 손실 확대에 대비해 손절 기준을 미리 정해두세요.';
  }
  if (h.flowSignal === 'outflow') {
    return '최근 거래량이 급증하면서 하락한 매물 압박(추정) 흐름입니다. 추가 매수는 안정 여부를 확인한 뒤 판단하세요.';
  }
  if (typeof h.week52DrawdownPct === 'number' && h.week52DrawdownPct <= -30) {
    return `52주 고점 대비 ${fmtNum(Math.abs(h.week52DrawdownPct), 0)}% 하락한 상태입니다. 추가 하락 여력을 감안해 무리한 추가 매수는 피하세요.`;
  }
  if (h.volumeSpike) {
    return '거래량이 평소보다 크게 늘었습니다. 단기 변동성이 커질 수 있으니 주가 움직임을 주의 깊게 지켜보세요.';
  }
  return '현재 특별한 위험 신호가 없습니다.';
}

// [추세/과열도/수급 신호등] 3개 항목을 초보자용 신호등 색+짧은 문구로 보여준다 - 각각 h.trendBroken/
// h.rsiState/h.flowSignal(거래량+가격 기반 대체 수급 지표)에서 그대로 가져온다.
function buildIndividualSignalLightsHtml(h) {
  if (!h || !h.hasData) {
    return `<div class="grid grid-cols-3 gap-1.5 text-center">
      ${['추세', '과열도', '수급(추정)'].map((label) => `<div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2"><p class="text-xs text-slate-400">${label}</p><p class="text-sm font-semibold text-slate-400">⚪ 부족</p></div>`).join('')}
    </div>`;
  }
  const trendHtml = h.trendBroken ? '🔴 하락 전환' : '🟢 상승 흐름';
  const rsiHtml = h.rsiState === '과열' ? '🔥 단기 과열' : h.rsiState === '과매도' ? '🛡️ 바닥권' : '🟢 적정';
  const flow = flowSignalLabel(h.flowSignal);
  return `
  <div class="grid grid-cols-3 gap-1.5 text-center">
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-xs text-slate-400">추세</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${trendHtml}</p>
    </div>
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-xs text-slate-400">과열도</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${rsiHtml}</p>
    </div>
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-xs text-slate-400">수급(추정)</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${flow.emoji} ${flow.label}</p>
    </div>
  </div>`;
}

function buildIndividualRiskDetailHtml(h, weightPct) {
  const betaText = h && typeof h.beta === 'number' ? fmtNum(h.beta, 2) + '배' : '데이터 부족';
  const sortinoText = h ? (sortinoToGrade(h.sortino) || '-') + '등급' : '-등급';
  const drawdownText = h && typeof h.week52DrawdownPct === 'number' ? fmtNum(h.week52DrawdownPct, 1) + '%' : '데이터 부족';
  const contribText = h && typeof h.riskContributionPct === 'number' ? fmtNum(h.riskContributionPct, 0) + '%' : '데이터 부족';
  return `
  <div class="mt-2.5 mb-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-3">
    <div>
      <p class="text-sm font-semibold text-slate-400 mb-1">📊 주가 및 리스크 정밀 진단</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2.5">${buildIndividualDiagnosisLine(h)}</p>
      ${buildIndividualSignalLightsHtml(h)}
    </div>
    <div>
      ${buildMetricItem('⚡ 지수 대비 널뛰기 심함', betaText, '시장이 1% 움직일 때 이 종목이 대략 몇 % 움직이는지 나타냅니다. 1보다 크면 시장보다 더 크게 흔들려요.')}
      ${buildMetricItem('폭락장 방어 성적표', sortinoText, '하락 위험 대비 실제로 벌어들인 수익의 성적표입니다(A가 가장 우수, F가 가장 저조).')}
      ${buildMetricItem('계좌 내 비중', fmtNum(weightPct, 1) + '%', '전체 계좌에서 이 종목이 차지하는 평가금액 비중입니다.')}
      ${buildMetricItem('52주 고점 대비', drawdownText, '최근 1년 최고가 대비 현재 주가가 얼마나 낮은지 나타냅니다.')}
      ${buildMetricItem('💣 진짜 위험 만드는 주범', contribText, "투자 비중이 아니라 '실제로 내 계좌를 흔드는 힘'이 몇 %인지 보여줍니다. 이 숫자가 투자 비중보다 훨씬 크면 겉보기보다 훨씬 위험한 종목이에요.")}
    </div>
    <div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2.5">
      <p class="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1">💡 초직관적 권장 행동 지침</p>
      <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${buildIndividualActionItem(h, weightPct)}</p>
    </div>
  </div>`;
}

// [RISK 관리 아코디언] 리스크 감지/안정 종목 두 섹션의 펼침 상태를 렌더링 사이에도 기억한다 - 5분
// 자동 갱신 등으로 renderRiskSection이 반복 호출돼도 사용자가 열어/닫아 둔 상태가 되돌아가지 않게 한다.
// 기본값: 두 섹션 모두 접힘(요청된 기본 상태) - 헤더를 탭해야만 펼쳐진다.
let riskyAccordionOpen = false;
let safeAccordionOpen = false;
// [🔍 리스크 진단 보기] 리스크 감지 종목마다 개별 펼침 상태를 종목 키(티커, 없으면 이름) 단위로
// 기억한다 - riskyAccordionOpen과 마찬가지로 5분 자동 갱신에도 사용자가 펼쳐 둔 카드가 유지된다.
let openStockDetailKeys = new Set();

// [RISK 카드 - 소유자별 필터] 'all'이면 지금까지처럼 state.advancedRiskMetrics(가구 전체, 5분 자동
// 갱신/새로고침 버튼이 채움)를 그대로 쓴다. 특정 소유자를 고르면 그 소유자 보유분만으로 같은 엔진
// (computeAdvancedRiskMetrics)을 다시 돌린 결과를 riskCardOwnerMetricsCache에 담아 재사용한다 - 종목별
// 1년 시세 이력은 이미 state.riskHistoryCache에 캐시돼 있어 네트워크 재호출 없이 즉시 계산된다.
let riskCardOwnerFilter = 'all';
let riskCardOwnerMetricsCache = {}; // { 소유자명: 계산결과 | null(계산 완료, 대상 없음) } - undefined면 "아직 계산 전"
let riskCardOwnerRequestToken = 0; // 소유자를 빠르게 연속 전환해도 가장 마지막 선택만 반영되도록 하는 가드
function getCurrentRiskMetrics() {
  return riskCardOwnerFilter === 'all' ? state.advancedRiskMetrics : riskCardOwnerMetricsCache[riskCardOwnerFilter];
}
function selectRiskCardOwner(owner) {
  riskCardOwnerFilter = owner;
  riskCardOwnerRequestToken++;
  renderRiskCardOwnerTabs();
  renderRiskSection();
}
function renderRiskCardOwnerTabs() {
  const wrap = document.getElementById('riskCardOwnerTabs');
  if (!wrap) return;
  const owners = getDailyPnlOwnerList();
  if (owners.length < 2) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; } // 소유자가 1명뿐이면 구분할 의미가 없다
  wrap.classList.remove('hidden');
  const tabs = [{ key: 'all', label: '전체' }, ...owners.map((o) => ({ key: o, label: o }))];
  wrap.innerHTML = tabs.map((t) => `
    <button type="button" data-risk-owner="${escapeHtml(t.key)}" class="daily-pnl-owner-btn ${t.key === riskCardOwnerFilter ? 'active' : ''} text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 whitespace-nowrap">${escapeHtml(t.label)}</button>
  `).join('');
  wrap.querySelectorAll('button[data-risk-owner]').forEach((btn) => {
    btn.addEventListener('click', () => selectRiskCardOwner(btn.dataset.riskOwner));
  });
}
function setAccordionOpen(bodyEl, chevronEl, isOpen) {
  bodyEl.style.maxHeight = isOpen ? bodyEl.scrollHeight + 'px' : '0px';
  chevronEl.classList.toggle('rotate-180', isOpen);
}

// [포트폴리오 위험 진단 & 위기 시뮬레이션] state.advancedRiskMetrics(refreshPricesAndRates에서 이미
// 계산 완료된 값)를 읽어 안전 점수/신호등/1줄 진단/행동 제안/2020년 폭락 재현 손실 추정치를 그린다.
// 데이터가 없으면(계산 전, 리스크 대상 종목 자체가 없음 등) 섹션 자체를 숨긴다.
// [6대 위험요인 막대그래프 한 줄] 라벨+(i)툴팁 / 막대 / 점수. 가독성을 위해 최소 폰트를 text-xs(12px)
// 이상으로 유지한다(작은 화면에서도 잘 읽히도록).
// [가독성] 라벨(이모지 포함)이 길어질 수 있어 라벨/점수를 한 줄에, 막대를 그 아래 별도 줄에 꽉 차게
// 배치한다 - 좁은 화면에서 라벨이 단어 중간에 어색하게 줄바꿈되는 것을 원천적으로 막는다.
function buildFactorBarRow(label, score, tooltip) {
  const level = riskLevelFromScore(score);
  const widthPct = Math.max(4, Math.min(100, score));
  return `
  <div>
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
        ${escapeHtml(label)}
        <button type="button" data-info-tip="${escapeHtml(tooltip)}" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </span>
      <span class="text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0">${Math.round(score)}</span>
    </div>
    <span class="block h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <span class="block h-full rounded-full ${level.barClass}" style="width:${widthPct}%"></span>
    </span>
  </div>`;
}

// [정밀 수치 한 항목] 쉬운 한글 라벨 + (i) 툴팁 + 실제 계산된 숫자값.
function buildMetricItem(label, valueHtml, tooltip) {
  return `
  <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
    <span class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 min-w-0 leading-snug break-keep">
      ${escapeHtml(label)}
      <button type="button" data-info-tip="${escapeHtml(tooltip)}" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
    </span>
    <span class="text-base font-semibold text-slate-700 dark:text-slate-200 text-right shrink-0 pl-2">${valueHtml}</span>
  </div>`;
}

function renderRiskDiagnosisSummary() {
  const container = document.getElementById('riskDiagnosisSummary');
  if (!container) return;
  const m = getCurrentRiskMetrics();

  // [소유자별 필터 - 캐시 미스] 아직 이 소유자로 한 번도 계산한 적이 없으면(undefined - null과 구분,
  // null은 "계산 완료했지만 대상 없음") 계산 중 표시를 띄우고 백그라운드로 계산을 시작한다. 계산이
  // 끝났을 때 사용자가 이미 다른 소유자/전체로 옮겨갔으면(riskCardOwnerRequestToken 불일치) 결과를
  // 버리고 다시 그리지 않는다 - 빠르게 탭을 연속으로 눌러도 마지막 선택만 반영된다.
  if (m === undefined) {
    container.classList.remove('hidden');
    container.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">계산 중...</p>';
    const owner = riskCardOwnerFilter;
    const myToken = riskCardOwnerRequestToken;
    computeAdvancedRiskMetrics(owner).then((result) => {
      riskCardOwnerMetricsCache[owner] = result;
      if (myToken === riskCardOwnerRequestToken) renderRiskSection();
    });
    refreshRiskDetailModalIfOpen();
    return;
  }
  if (!m) {
    if (riskCardOwnerFilter !== 'all') {
      container.classList.remove('hidden');
      container.innerHTML = `<p class="text-sm text-slate-400 py-6 text-center">${escapeHtml(riskCardOwnerFilter)}님의 위험 분석 대상 보유 종목(일반계좌 주식/ETF)이 없습니다.</p>`;
    } else {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
    refreshRiskDetailModalIfOpen();
    return;
  }
  container.classList.remove('hidden');

  const score = m.riskScore;
  const level = riskLevelFromScore(score);
  const diagnosisLine = buildRiskDiagnosisLine(m);
  const actionItems = buildRiskActionItems(m);
  const conf = m.dataConfidence;
  const confLevel = conf.score >= 80 ? 'text-emerald-500' : conf.score >= 50 ? 'text-amber-500' : 'text-red-500';

  container.innerHTML = `
  <div class="rounded-xl border p-3.5 ${level.bgClass}">
    <div class="flex items-start justify-between gap-2 flex-wrap">
      <p class="text-lg font-bold ${level.colorClass}">${level.emoji} 종합 위험점수 ${score}/100 [${level.label}]</p>
      <span class="shrink-0 text-xs font-semibold ${confLevel} flex items-center gap-1 whitespace-nowrap">
        분석 신뢰도 ${conf.score}%
        <button type="button" data-info-tip="${escapeHtml('이 진단이 얼마나 실제 데이터에 기반했는지 보여주는 별도 점수입니다(위험점수를 왜곡하지 않습니다). ' + conf.reasons.join(' · '))}" class="text-slate-400" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </span>
      <!-- [모바일 시인성 개선] 카드 다른 곳의 "세부내용" 버튼과 같은 .detail-btn(테두리 있는 버튼 모양)
           스타일로 통일하고, ml-auto로 항상 이 줄의 맨 오른쪽 끝에 붙인다 - 분석 신뢰도 텍스트와 줄바꿈
           돼도(좁은 모바일 폭) 왼쪽 끝이 아니라 우측 끝에 자리잡는다. -->
      <button type="button" id="riskDetailBtn" class="detail-btn ml-auto">🔍 세부내용 <i data-lucide="chevron-right" class="w-3 h-3"></i></button>
    </div>
    <p class="text-base font-medium text-slate-700 dark:text-slate-200 mt-2 leading-relaxed">${diagnosisLine}</p>
    <div class="mt-2.5 space-y-1.5">
      ${actionItems.map((item, i) => `<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">💡 ${i + 1}. ${item}</p>`).join('')}
    </div>

    <!-- [단기 변동성 급증 경고] 최근 20거래일 변동성이 최근 1년 평균의 1.5배 이상으로 튀었을 때만 표시된다
         (volatilitySpike, computeAdvancedRiskMetrics 참고) - 평소엔 공간을 차지하지 않는다. -->
    ${m.volatilitySpike ? `
    <div class="mt-2.5 rounded-lg bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 p-2.5">
      <p class="text-sm font-semibold text-amber-700 dark:text-amber-400">⚡ 최근 단기 변동성 급증 경고</p>
      <p class="text-xs text-amber-700/90 dark:text-amber-400/90 mt-0.5 leading-relaxed">최근 한 달간 계좌 흔들림(연환산 ${fmtNum(m.portfolioVolatilityShortPct, 0)}%)이 최근 1년 평균(${fmtNum(m.portfolioVolatilityPct, 0)}%)보다 크게 커졌습니다 - 시장에 새로운 변수가 생겼을 수 있으니 최근 뉴스를 확인해 보세요.</p>
    </div>` : ''}
  </div>`;

  lucide.createIcons();
  refreshRiskDetailModalIfOpen();
}

// [🔍 세부내용 모달] 6대 위험요인 분해/정밀 수치/과거 폭락장 재현 시나리오/What-If 시뮬레이션 -
// 메인 RISK 카드에서 분리해 이 모달 전용 컨테이너(#riskDetailModalBody)에 그린다. 메인 카드와 동일하게
// getCurrentRiskMetrics()로 "지금 선택된 소유자(또는 전체)" 기준 지표를 읽으므로, 모달이 열린 채로 상단
// 명의 탭을 바꾸면(refreshRiskDetailModalIfOpen 경유) 내용이 그 소유자 기준으로 다시 그려진다.
function renderRiskDetailModal() {
  const body = document.getElementById('riskDetailModalBody');
  if (!body) return;
  const m = getCurrentRiskMetrics();

  if (m === undefined) {
    body.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">계산 중...</p>';
    return;
  }
  if (!m) {
    body.innerHTML = `<p class="text-sm text-slate-400 py-6 text-center">${riskCardOwnerFilter !== 'all' ? escapeHtml(riskCardOwnerFilter) + '님의 ' : ''}위험 분석 대상 보유 종목(일반계좌 주식/ETF)이 없습니다.</p>`;
    return;
  }

  const sortinoGrade = sortinoToGrade(m.sortino) || '-';
  const s = m.subScores;
  const barsHtml = [
    buildFactorBarRow('🎯 몰빵위험', s.concentration, '100점에 가까울수록 위험해요. 한 종목/업종에 돈이 쏠려 있으면 그 종목이 흔들릴 때 계좌 전체가 같이 흔들립니다.'),
    buildFactorBarRow('🌊 변동성', s.volatility, '100점에 가까울수록 위험해요. 내 계좌 가격이 평소에 얼마나 위아래로 크게 출렁이는지를 나타냅니다.'),
    buildFactorBarRow('📉 손실위험', s.drawdown, '100점에 가까울수록 위험해요. 과거 데이터로 계산한 "최악의 하루/최악의 구간에 얼마나 잃을 수 있는가"입니다.'),
    buildFactorBarRow('⚡ 시장위험', s.market, '100점에 가까울수록 위험해요. 시장이 1% 빠질 때 내 계좌가 그보다 더 크게 빠지는 정도입니다.'),
    buildFactorBarRow('🔗 상관관계', s.correlation, '100점에 가까울수록 위험해요. 종목은 여러 개인데 실제로는 다 같이 오르고 같이 빠지면 분산 효과가 없다는 뜻입니다.'),
    buildFactorBarRow('🔥 과열·수급', s.technical, '100점에 가까울수록 위험해요. 보유 종목이 단기간에 너무 많이 올라 숨고르기가 필요하거나, 거래량이 심상치 않은 정도입니다.')
  ].join('');

  body.innerHTML = `
    <!-- [6대 위험요인 분해] -->
    <div class="space-y-3">${barsHtml}</div>

    <!-- [정밀 수치] 쉬운 한글 + (i) 툴팁 - 라벨이 길어 2열 그리드 대신 한 줄씩 나열한다(가독성). -->
    <div class="mt-3.5">
      ${buildMetricItem('⚡ 지수 대비 널뛰기 심함', typeof m.portfolioBeta === 'number' ? fmtNum(m.portfolioBeta, 2) + '배' : '데이터 부족', '시장이 1% 움직일 때 내 포트폴리오가 대략 몇 % 움직이는지 나타냅니다. 1보다 크면 시장보다 더 크게 흔들린다는 뜻이에요.')}
      ${buildMetricItem('🎯 한 종목 몰빵 위험', fmtNum(m.topWeight, 0) + '% (' + escapeHtml(m.topHolding ? m.topHolding.name : '-') + ')', '특정 종목 하나에 자산이 얼마나 쏠려 있는지 보여줍니다. 비중이 클수록 그 종목 하나의 움직임에 계좌 전체가 휘둘려요.')}
      ${buildMetricItem('📉 평소 하락장 하루 최대 손실 예상액', fmtKRWShort(Math.abs(m.var95KRW)), '일상적인 하락장에서 95% 확률로 겪을 수 있는 하루 손실액입니다.')}
      ${buildMetricItem('💥 대폭락장(금융위기급) 손실 예상액', fmtKRWShort(Math.abs(m.cvarKRW)), '2020년 코로나 폭락 같은 극단적인 위기 상황이 실제로 벌어졌을 때 예상되는 평균 손실액입니다.')}
      ${buildMetricItem('폭락장 방어 성적표', sortinoGrade + '등급', '하락 위험 대비 실제로 벌어들인 수익의 성적표입니다(A가 가장 우수, F가 가장 저조).')}
      ${buildMetricItem('🔗 운명 공동체(위험 중복)', typeof m.weightedAvgCorrelation === 'number' ? (m.weightedAvgCorrelation >= 0.7 ? '매우 높음' : m.weightedAvgCorrelation >= 0.5 ? '높음' : m.weightedAvgCorrelation >= 0.3 ? '보통' : '낮음') : '데이터 부족', '종목이 달라도 주가가 같이 움직이는 정도입니다. 높을수록 "따로 담았지만 사실상 한 종목"과 비슷해 분산 효과가 떨어져요.')}
    </div>
    ${m.sectorExposure && m.sectorExposure.topSector && m.sectorExposure.topSector !== '미분류' ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-2.5">🏭 (ETF 속 구성종목 포함) 최다 노출 섹터: <b>${escapeHtml(m.sectorExposure.topSector)}</b> ${fmtNum(m.sectorExposure.topSectorWeight, 0)}%</p>` : ''}

    <!-- [역사적 하락장 체험하기] 2020 코로나(짧고 강한 급락) + 2022 고금리(길게 이어진 약세장) 두 시나리오
         - 모바일(375px)에서도 카드가 잘리지 않도록 grid-cols-1로 세로로 쌓고, sm 이상에서만 2열로
         나란히 배치한다. 초보자 눈높이에 맞춰 "금융위기급 폭락이 재현될 경우"처럼 쉬운 말로 설명한다. -->
    <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div class="rounded-lg bg-white/70 dark:bg-black/20 p-3 min-w-0">
        <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">📉 2020 코로나 폭락 재현 시</p>
        <p class="text-lg sm:text-xl font-bold text-blue-500 break-keep">약 ${fmtKRWShort(Math.abs(m.stressLossKRW))} (${fmtNum(m.stressLossPct, 1)}%) 손실 예상</p>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed">* 코로나 폭락처럼 짧은 기간에 급격히 폭락하는 금융위기급 충격이 재현될 경우 예상 손실액입니다(코스피 -35.7%·S&P500 -33.9% 등 실측 낙폭 대입 추정치).</p>
      </div>
      <div class="rounded-lg bg-white/70 dark:bg-black/20 p-3 min-w-0">
        <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">📉 2022 고금리 기술주 폭락 재현 시</p>
        <p class="text-lg sm:text-xl font-bold text-orange-500 break-keep">약 ${fmtKRWShort(Math.abs(m.stressLossKRW2022))} (${fmtNum(m.stressLossPct2022, 1)}%) 손실 예상</p>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed">* 2022년처럼 금리가 급격히 오르며 특히 기술/성장주가 길게 이어서 빠지는 약세장이 재현될 경우 예상 손실액입니다(코스피 -28.6%·나스닥100 -35.1% 등 실측 낙폭 대입 추정치).</p>
      </div>
    </div>

    <!-- [What-If 리밸런싱 시뮬레이션] -->
    ${m.topHolding ? `
    <div class="mt-3 rounded-lg bg-white/70 dark:bg-black/20 p-3" id="whatIfSimBox" data-top-ticker="${escapeHtml(m.topHolding.ticker)}">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
        💡 위험관리 시뮬레이션(What-If)
        <button type="button" data-info-tip="실제 매도 지시가 아니라, 비중을 조정하면 위험점수가 어떻게 바뀌는지 미리 계산해 보는 기능입니다." class="text-slate-400" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </p>
      <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">${escapeHtml(m.topHolding.name)} 비중을 조절하면?</p>
      <div class="flex gap-1.5 mb-2.5">
        ${['aggressive', 'balanced', 'conservative'].map((key) => {
          const label = key === 'aggressive' ? '공격적' : key === 'balanced' ? '균형' : '보수적';
          const targetPct = key === 'aggressive' ? Math.max(5, m.topWeight - 15) : key === 'balanced' ? Math.max(5, m.topWeight * 0.55) : Math.min(15, m.topWeight);
          return `<button type="button" data-scenario-preset="${key}" data-target-pct="${targetPct.toFixed(1)}" class="flex-1 text-xs sm:text-sm font-semibold py-2 rounded-lg border transition-colors border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700">${label} ${fmtNum(targetPct, 0)}%</button>`;
        }).join('')}
      </div>
      <div id="whatIfResultBox"></div>
    </div>` : ''}

    ${m.missingCount > 0 ? `<p class="text-sm text-slate-400 mt-2.5">* ${m.missingCount}개 종목은 가격 이력이 부족해(신규 상장 등) 이 진단에서 제외되었습니다.</p>` : ''}
  `;

  lucide.createIcons();
  // 진입 시 "균형" 시나리오를 기본으로 미리 계산해 보여준다(클릭 없이도 바로 가치를 확인할 수 있게).
  if (m.topHolding) {
    const balancedBtn = body.querySelector('[data-scenario-preset="balanced"]');
    if (balancedBtn) balancedBtn.click();
  }
}

// [모달 열림 중 명의 탭 전환 대응] renderRiskDiagnosisSummary()가 매 렌더링마다(탭 전환 포함) 호출하여,
// 모달이 열려 있을 때만 그 안의 내용도 함께 새로고침한다 - 닫혀 있으면 불필요한 재계산을 피한다.
function refreshRiskDetailModalIfOpen() {
  const modal = document.getElementById('riskDetailModal');
  if (modal && !modal.classList.contains('hidden')) renderRiskDetailModal();
}

function openRiskDetailModal() {
  renderRiskDetailModal();
  document.getElementById('riskDetailModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeRiskDetailModal(viaBackButton) {
  document.getElementById('riskDetailModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#riskDetailBtn')) openRiskDetailModal();
});
document.getElementById('riskDetailModalHeader').addEventListener('click', () => closeRiskDetailModal());
document.getElementById('closeRiskDetailModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeRiskDetailModal();
});
document.getElementById('riskDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'riskDetailModal') closeRiskDetailModal();
});

// [What-If 프리셋 버튼 클릭] 실제 데이터 재조회 없이 computeScenarioRiskMetrics()로 즉시 재계산한다.
// [소유자별 필터 대응] state.advancedRiskMetrics를 직접 읽지 않고 getCurrentRiskMetrics()로 지금 화면에
// 보이는 소유자(또는 전체) 기준 지표를 가져온다 - 안 그러면 "신랑" 카드를 보면서 시뮬레이션해도 가구
// 전체 데이터로 계산되는 불일치가 생긴다.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-scenario-preset]');
  if (!btn) return;
  const box = document.getElementById('whatIfSimBox');
  const m = getCurrentRiskMetrics();
  if (!box || !m || !m.topHolding) return;
  const targetPct = parseFloat(btn.dataset.targetPct);
  const scenario = computeScenarioRiskMetrics(m, { [box.dataset.topTicker]: targetPct / 100 });
  const resultBox = document.getElementById('whatIfResultBox');
  if (!resultBox) return;
  const beforeLevel = riskLevelFromScore(m.riskScore);
  const afterLevel = riskLevelFromScore(scenario.riskScore);
  const delta = scenario.riskScore - m.riskScore;
  resultBox.innerHTML = `
    <p class="text-sm text-slate-700 dark:text-slate-200 mb-2">${escapeHtml(m.topHolding.name)} ${fmtNum(m.topWeight, 0)}% → ${fmtNum(targetPct, 0)}%로 조정 시</p>
    <div class="flex items-center gap-2 mb-2 flex-wrap">
      <span class="text-2xl font-extrabold ${beforeLevel.colorClass}">${m.riskScore}</span>
      <span class="text-slate-400">→</span>
      <span class="text-2xl font-extrabold ${afterLevel.colorClass}">${scenario.riskScore}</span>
      <span class="text-sm font-semibold ${delta <= 0 ? 'text-emerald-500' : 'text-red-500'}">${delta <= 0 ? '▼' : '▲'}${Math.abs(Math.round(delta))}</span>
      <span class="text-sm text-slate-500 dark:text-slate-400">${afterLevel.emoji} ${afterLevel.label}</span>
    </div>
    <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
      <div>변동성: ${fmtNum(m.portfolioVolatilityPct, 1)}% → ${fmtNum(scenario.portfolioVolatilityPct, 1)}%</div>
      <div>최대낙폭: ${fmtNum(m.portfolioMDDPct, 1)}% → ${fmtNum(scenario.portfolioMDDPct, 1)}%</div>
    </div>
    <p class="text-xs text-slate-400 mt-2 leading-relaxed">* 실제 매매 지시가 아닌 추정 시뮬레이션이며, 과거 변동성·상관관계 구조가 유지된다고 가정합니다.</p>`;
  setActiveScenarioPresetButton(btn);
});

// [버그 수정 - 선택된 버튼이 마우스오버 시 흰색으로 바뀌는 문제] 예전엔 선택 시 bg-brand-600/text-white만
// "추가"하고 원래 있던 border-slate-300/hover:bg-slate-100 등은 그대로 남겨뒀다 - hover 유틸리티가
// 일반 유틸리티보다 스타일시트에서 나중에 오므로, 선택된(파란) 버튼에 마우스를 올리면 hover:bg-slate-100
// (연회색/흰색)이 bg-brand-600을 덮어써 버튼이 하얗게 보였다. 이제 선택/비선택 각각의 전체 클래스
// 묶음을 통째로 remove→add해 미선택 버튼의 hover 클래스가 선택된 버튼에 남지 않게 한다.
const SCENARIO_PRESET_UNSELECTED_CLASSES = ['border-slate-300', 'dark:border-slate-600', 'text-slate-600', 'dark:text-slate-300', 'bg-white', 'dark:bg-slate-900', 'hover:bg-slate-100', 'dark:hover:bg-slate-700'];
const SCENARIO_PRESET_SELECTED_CLASSES = ['border-brand-600', 'dark:border-brand-500', 'text-white', 'bg-brand-600', 'hover:bg-brand-700', 'dark:hover:bg-brand-500'];
function setActiveScenarioPresetButton(activeBtn) {
  document.querySelectorAll('[data-scenario-preset]').forEach((b) => {
    b.classList.remove(...SCENARIO_PRESET_UNSELECTED_CLASSES, ...SCENARIO_PRESET_SELECTED_CLASSES);
    b.classList.add(...(b === activeBtn ? SCENARIO_PRESET_SELECTED_CLASSES : SCENARIO_PRESET_UNSELECTED_CLASSES));
  });
}

/* -------------------------------------------------------------------------
 * 18-5. [시장 현황 & 매크로 브리핑] RISK 관리 카드 최상단 - VIX/원달러/미10년물/주요지수 4대 지표를
 *    날씨·신호등 아이콘으로 보여주고, 사용자의 원화/외화 자산 비중과 엮은 맞춤 진단 문구를 만든다.
 *    데이터는 refreshPricesAndRates()가 한 번의 갱신 주기에 함께 조회해 state.macroIndicatorCache/
 *    state.marketIndexCache/state.exchangeRate에 채워둔 것을 그대로 읽기만 한다(여기서 새로 조회 안 함).
 * ---------------------------------------------------------------------- */
// VIX(공포·탐욕 지수) 수준 → 날씨 아이콘. 20 미만 안정, 20~30 주의, 30 이상 긴장 - 널리 쓰이는 통상적
// 구간(20=평상시 평균 근방, 30=시장이 눈에 띄게 불안해하는 구간)을 참고한 근사치.
function vixWeatherIcon(vix) {
  if (typeof vix !== 'number' || !Number.isFinite(vix)) return { icon: '❓', label: '조회 실패' };
  if (vix < 20) return { icon: '😌', label: '안정' };
  if (vix < 30) return { icon: '😐', label: '주의' };
  return { icon: '😰', label: '긴장' };
}
// 등락률 → 방향 화살표(±0.05%는 보합으로 처리해 미세한 노이즈에 화살표가 계속 바뀌지 않게 한다).
function trendArrowIcon(changePercent) {
  if (typeof changePercent !== 'number' || !Number.isFinite(changePercent)) return '❓';
  if (changePercent > 0.05) return '📈';
  if (changePercent < -0.05) return '📉';
  return '➡️';
}
// [지표 상세 팝업 클릭 진입점] key(vix/usdkrw/us10y/kospi/kosdaq/sp500/nasdaq/dow)를 data-macro-key로
// 붙여두면 문서 전역 위임 리스너(아래) 하나가 어떤 타일을 눌러도 openMacroDetailModal을 연다 -
// data-open-stock-detail과 동일한 위임 패턴.
// [열 수는 항상 4로 고정 - 답답함은 패딩/폰트로 해결] grid-cols-4가 모든 화면에서 예외 없이
// 적용되므로(index.html), 좁은 화면에서 답답해 보이는 문제를 열 수를 줄이는 대신 카드 내부 패딩과
// 글자 크기로 대응한다. md:(768px)부터 태블릿 세로를 포함한 모든 비-폰 화면에 동일하게 적용된다 -
// 이전엔 lg:(1024px)부터만 적용돼 768~1023px 태블릿 세로가 폰과 똑같이 빽빽했다.
function macroTileHtml(key, label, valueText, sub, icon) {
  return `
  <div class="macro-card rounded-lg border border-slate-100 dark:border-slate-800 px-1 sm:px-1.5 md:px-2 py-2 md:py-2.5 text-center cursor-pointer transition-all hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm hover:-translate-y-0.5" data-macro-key="${key}">
    <div class="text-[10px] md:text-xs text-slate-400 truncate">${escapeHtml(label)}</div>
    <div class="text-base md:text-lg leading-tight my-0.5">${icon}</div>
    <div class="text-[11px] md:text-sm font-semibold truncate">${escapeHtml(valueText)}</div>
    <div class="text-[9px] md:text-[11px] text-slate-400 truncate">${escapeHtml(sub)}</div>
  </div>`;
}
// [맞춤형 연계 진단] 원/달러 환율 방향 × 내 포트폴리오의 외화(달러) 자산 비중을 엮어 한 줄로 설명한다.
// [매크로 종합 해설] VIX/환율/미10년물/코스피 4개 신호를 규칙 기반으로 조합해 "핵심 원인 → 내
// 포트폴리오 영향 → 대응 가이드" 3단으로 설명한다 - buildRiskDiagnosisLine/buildRiskActionItems와
// 같은 우선순위 규칙 패턴(더 구체적이거나 심각한 조합을 먼저 검사하고, 해당하는 첫 규칙만 채택).
// 방향 판정 임계값(±0.05%)은 trendArrowIcon과 동일해 지표별 화살표 아이콘과 해설 문구의 방향이
// 항상 일치한다.
function buildMacroCommentary({ vix, fxChangePct, ust10yChangePct, kospiChangePct, foreignWeightPct }) {
  const isUp = (v) => typeof v === 'number' && v > 0.05;
  const isDown = (v) => typeof v === 'number' && v < -0.05;
  const fw = typeof foreignWeightPct === 'number' ? fmtNum(foreignWeightPct, 0) : null;

  if (typeof vix === 'number' && vix >= 30) {
    return {
      cause: `시장 전반의 공포심리(VIX ${fmtNum(vix, 1)})가 높아진 고변동성 국면입니다.`,
      impact: '주식 비중이 높을수록 단기 등락폭이 커질 수 있어 계좌 변동성이 확대될 수 있습니다.',
      guide: '무리한 추가 매수보다는 관망하며 상황을 지켜보는 편이 유리합니다.'
    };
  }
  if (isUp(ust10yChangePct) && isUp(fxChangePct)) {
    return {
      cause: '미국 금리와 원/달러 환율이 동반 상승 중입니다.',
      impact: fw !== null
        ? `달러 자산(전체의 ${fw}%) 평가액에는 호재이나, 국내 증시는 자금 이탈 압력으로 변동성이 커질 수 있습니다.`
        : '달러 자산 평가액에는 호재이나, 국내 증시는 자금 이탈 압력으로 변동성이 커질 수 있습니다.',
      guide: '신규 매수는 서두르지 말고 분할로 접근하는 것이 유리합니다.'
    };
  }
  if (isDown(ust10yChangePct) && isUp(kospiChangePct)) {
    return {
      cause: '금리가 진정되며 위험자산 선호 심리가 살아나는 분위기입니다.',
      impact: '국내 주식 비중이 있는 계좌에는 우호적인 환경입니다.',
      guide: '기존에 계획한 투자 전략을 그대로 유지해도 무방한 국면입니다.'
    };
  }
  if (isDown(fxChangePct) && isUp(kospiChangePct)) {
    return {
      cause: '원화가 강세를 보이며 국내 증시에 우호적인 자금 유입이 기대되는 분위기입니다.',
      impact: '달러 자산 평가액은 다소 줄어들 수 있으나, 국내 자산 비중에는 긍정적입니다.',
      guide: '달러 환전이나 해외 자산 매수 계획이 있다면 상대적으로 유리한 시점일 수 있습니다.'
    };
  }
  if (isDown(kospiChangePct) && typeof vix === 'number' && vix >= 20) {
    return {
      cause: '국내 증시가 조정을 받고 있고 시장 불안 심리도 다소 높아진 상태입니다.',
      impact: '단기 변동성 확대에 유의할 필요가 있습니다.',
      guide: '무리한 추가 매수보다는 관망 후 저가 분할매수를 고려해보세요.'
    };
  }
  return {
    cause: 'VIX·환율·금리·지수 모두 특별한 쏠림 없이 대체로 평이한 흐름입니다.',
    impact: '포트폴리오에 미치는 특별한 매크로 압력은 없는 편입니다.',
    guide: '평소처럼 계획한 투자 전략을 유지하시면 됩니다.'
  };
}
// [자산간 상관관계 가이드] 금리(美 10년물) ↔ 채권가격/성장주/달러가치는 교과서적으로 항상 반대·같은
// 방향으로 움직이는 구조적 관계라, buildMacroCommentary의 "지금 국면이 무엇이냐"와 달리 다른 조건
// 분기 없이 지금 금리 방향 하나로만 세 화살표가 통째로 뒤집힌다. 추가로 지금 환율이 그 교과서적
// 방향과 실제로 일치하는지도 한 줄 참고 문구로 덧붙인다(다른 재료가 더 세게 작용 중인지 가늠하는 용도).
function buildAssetCorrelationGuide({ ust10yChangePct, fxChangePct }) {
  const rateUp = typeof ust10yChangePct === 'number' && ust10yChangePct > 0.05;
  const rateDown = typeof ust10yChangePct === 'number' && ust10yChangePct < -0.05;
  const rateArrow = rateUp ? '📈' : (rateDown ? '📉' : '➡️');
  const oppArrow = rateUp ? '📉' : (rateDown ? '📈' : '➡️');

  const lines = [
    `금리 ${rateArrow} → 채권가격 ${oppArrow} : 금리와 채권가격은 반대로 움직여요 - 새로 나오는 채권 금리가 더 매력적이면 기존 채권 가격은 떨어져요.`,
    `금리 ${rateArrow} → 성장주(고PER주) ${oppArrow} : 미래 이익을 지금 가치로 환산할 때 할인폭이 ${rateUp ? '커져서 주가에 부담이 돼요' : '작아져서 주가에 우호적이에요'}.`,
    `금리 ${rateArrow} → 달러 가치 ${rateArrow} : 금리가 오르면 더 높은 이자를 좇아 자금이 몰려 달러가 ${rateUp ? '강해지는' : '약해지는'} 경향이 있어요.`
  ];

  let note;
  if (rateUp || rateDown) {
    const fxMatches = rateUp ? fxChangePct > 0.05 : fxChangePct < -0.05;
    note = fxMatches
      ? '지금은 환율도 이 교과서적인 방향과 같이 움직이고 있어요.'
      : '다만 지금 환율은 이 방향과 다르게 움직이고 있어요 - 금리 외에 다른 요인(수급, 지정학 이슈 등)이 더 크게 작용하고 있을 수 있어요.';
  } else {
    note = '지금은 금리 변동이 크지 않아 이 관계가 뚜렷하게 나타나지 않는 구간이에요.';
  }
  return { lines, note };
}

/* -------------------------------------------------------------------------
 * 18-6. [매크로 브리핑 - 지표 상세 설명 팝업] 8개 타일을 눌렀을 때 "이 지표가 뭔지 + 지금 수치가
 *    뭘 뜻하는지 + 뭘 지켜봐야 하는지"를 보여준다. 개념/관전포인트는 고정 텍스트(초보자용 정의라
 *    실시간으로 바뀔 이유가 없음), 현재값·등락·동향 해설만 renderMacroBriefing()이 매 갱신마다
 *    채워두는 macroDetailSnapshot을 읽어 동적으로 만든다. buildMacroCommentary/buildAssetCorrelation
 *    Guide와 마찬가지로 "지금 상태를 설명"까지만 하고 매수/매도 판단은 담지 않는다.
 * ---------------------------------------------------------------------- */
const MACRO_INDICATOR_INFO = {
  vix: {
    label: 'VIX (공포·탐욕 지수)',
    concept: '옵션 시장에서 예상하는 향후 변동성을 지수화한 값으로, 흔히 "공포지수"라고 불려요. 낮을수록 투자자들이 안정적이라고 느끼고, 높을수록 단기적인 불안 심리가 크다는 뜻이에요.',
    watchPoints: [
      '20 미만은 평상시 수준, 30 이상이면 시장 전반이 긴장한 상태로 봅니다.',
      'VIX가 급등하면 주식 비중이 높은 계좌일수록 단기 등락폭이 커질 수 있어요.',
      '짧게 튀었다가 가라앉는 경우가 많아, 한 번의 급등만으로 판단하기보다는 며칠간 추이를 함께 지켜보는 게 좋아요.'
    ]
  },
  usdkrw: {
    label: '원/달러 환율',
    concept: '1달러를 사는 데 필요한 원화 금액이에요. 환율이 오르면(원화 약세) 달러 자산의 원화 환산 가치가 커지고, 내리면(원화 강세) 작아져요.',
    watchPoints: [
      '달러 자산을 보유 중이라면 환율 상승은 평가액 증가, 하락은 감소로 이어집니다.',
      '환율은 미국 금리·무역수지·글로벌 위험회피 심리 등 여러 요인이 함께 작용해 움직여요.',
      '환전 계획이 있다면 하루 등락보다 며칠~몇 주 단위의 추세를 함께 참고하는 게 도움이 됩니다.'
    ]
  },
  us10y: {
    label: '美 10년물 국채금리',
    concept: '미국 정부가 10년 만기로 발행한 국채의 시장 수익률이에요. 전 세계 금리·자산 가격의 기준점 역할을 해서 "글로벌 금리의 나침반"이라고도 불려요.',
    watchPoints: [
      '금리가 오르면 채권가격은 내려가고, 성장주(고PER주)에는 대체로 부담 요인으로 작용하는 경향이 있어요.',
      '금리가 내리면 반대로 위험자산(주식) 선호 심리가 살아나는 경우가 많아요.',
      '미국 연준(Fed) 통화정책 발표나 물가지표 발표 전후로 변동성이 커지는 경우가 많습니다.'
    ]
  },
  kospi: {
    label: '코스피 지수',
    concept: '국내 코스피 시장에 상장된 기업 전체의 시가총액 흐름을 지수화한, 한국을 대표하는 주가지수예요.',
    watchPoints: [
      '국내 주식 비중이 있는 계좌라면 코스피 방향과 계좌 성과가 대체로 함께 움직이는 경향이 있어요.',
      '반도체 등 특정 대형주 비중이 높아, 개별 대형주 이슈에도 지수 전체가 크게 흔들릴 수 있어요.',
      '환율·외국인 수급과 함께 움직이는 경우가 많아 원/달러 환율 흐름도 같이 참고하면 도움이 됩니다.'
    ]
  },
  kosdaq: {
    label: '코스닥 지수',
    concept: '코스닥에 상장된 중소형·성장주 중심 기업들의 흐름을 보여주는 지수예요. 코스피보다 변동성이 큰 편이에요.',
    watchPoints: [
      '성장주 비중이 높아 금리·투자심리 변화에 코스피보다 민감하게 반응하는 경향이 있어요.',
      '개별 종목 이슈(실적, 테마)에 따라 지수 전체 변동성이 커질 수 있습니다.',
      '코스닥 비중이 있는 계좌는 지수 등락폭이 더 클 수 있다는 점을 감안하는 게 좋아요.'
    ]
  },
  sp500: {
    label: 'S&P 500 지수',
    concept: '미국 대형 우량기업 500개로 구성된, 미국 증시를 가장 폭넓게 대표하는 지수예요.',
    watchPoints: [
      '미국 주식/ETF 비중이 있는 계좌라면 이 지수 흐름과 대체로 함께 움직이는 경향이 있어요.',
      '미국 금리·물가지표·기업실적 발표 시즌에 변동성이 커지는 경우가 많습니다.',
      '나스닥보다는 업종이 고르게 분산돼 있어 상대적으로 변동성이 완만한 편이에요.'
    ]
  },
  nasdaq: {
    label: '나스닥 종합지수',
    concept: '미국 기술주 비중이 특히 높은 지수로, 성장주·기술주에 대한 투자심리를 잘 반영해요.',
    watchPoints: [
      '금리 변화에 S&P500보다 더 민감하게 반응하는 경향이 있어요(성장주는 금리에 더 취약).',
      'QQQM 등 나스닥100 추종 ETF를 보유 중이라면 이 지수 흐름을 함께 참고하면 좋아요.',
      '기술주 실적 발표 시즌에 변동성이 커지는 경우가 많습니다.'
    ]
  },
  dow: {
    label: '다우존스 지수',
    concept: '오래되고 안정적인 미국 대형 우량기업 30개로 구성된 지수예요. S&P500·나스닥보다 변동성이 낮은 편이에요.',
    watchPoints: [
      '전통 산업/금융 비중이 높아 기술주 중심의 나스닥과는 다르게 움직이는 경우가 있어요.',
      '다른 미국 지수와 방향이 엇갈릴 때는 시장 내 업종별 온도차가 있다는 신호로 볼 수 있어요.',
      '장기적으로 미국 경기 전반의 체감 지표로 함께 참고하면 좋습니다.'
    ]
  }
};

let macroDetailSnapshot = {};
let currentMacroDetailKey = null;
let macroDetailRequestToken = 0;

// [실제 5일/20일 추세] 키 -> 야후 티커. usdkrw/us10y/vix/dow는 macroIndicatorCache 조회에 쓰던 티커와
// 동일, kospi 등 지수는 이미 있는 INDEX_TICKERS를 그대로 재사용한다(js/09).
const MACRO_KEY_TICKERS = {
  vix: '^VIX', usdkrw: 'KRW=X', us10y: '^TNX',
  kospi: INDEX_TICKERS.KOSPI, kosdaq: INDEX_TICKERS.KOSDAQ,
  sp500: INDEX_TICKERS.SP500, nasdaq: INDEX_TICKERS.NASDAQ, dow: '^DJI'
};
// [박스권 판정 임계값] 지표마다 평소 변동폭이 크게 달라(VIX는 일상적으로 수십% 출렁이지만 환율은
// 1%만 움직여도 큰 변화) 5일/20일 등락률이 몇 %부터 "추세"로 볼지 지표군별로 다르게 잡는다 - 정밀한
// 통계적 기준이 아니라 초보자 설명용 근사치다.
const MACRO_TREND_THRESHOLDS = {
  vix: { d5: 15, d20: 25 },
  usdkrw: { d5: 0.8, d20: 1.5 },
  us10y: { d5: 3, d20: 5 },
  kospi: { d5: 2, d20: 4 }, kosdaq: { d5: 2.5, d20: 5 },
  sp500: { d5: 1.5, d20: 3 }, nasdaq: { d5: 2, d20: 4 }, dow: { d5: 1.5, d20: 3 }
};

// [5일/20일 종가 비교] getCachedDailyCloses(js/09)가 이미 RISK 엔진/종목 분석용으로 쓰는 1년치 일별
// 종가 캐시를 그대로 재사용한다 - 팝업을 열 때만(온디맨드) 호출하므로 5분 자동 갱신 주기에 8개 지표
// 전부의 1년치 이력을 추가로 불러오는 부담이 없다.
async function fetchMacroShortTermTrend(key) {
  const ticker = MACRO_KEY_TICKERS[key];
  if (!ticker) return null;
  const data = await getCachedDailyCloses(ticker);
  if (!data || !Array.isArray(data.closes) || data.closes.length < 21) return null;
  const closes = data.closes;
  const last = closes[closes.length - 1];
  const c5 = closes[closes.length - 6];
  const c20 = closes[closes.length - 21];
  return {
    change5d: (typeof c5 === 'number' && c5 > 0) ? ((last - c5) / c5) * 100 : null,
    change20d: (typeof c20 === 'number' && c20 > 0) ? ((last - c20) / c20) * 100 : null
  };
}

function macroDirectionLabel(changePercent) {
  if (typeof changePercent !== 'number') return '보합';
  if (changePercent > 0.05) return '상승';
  if (changePercent < -0.05) return '하락';
  return '보합';
}

// [상태 뱃지] VIX는 안정/주의/긴장 3단계, 나머지는 상승/하락/보합 - 국내 관행대로 상승=빨강/하락=파랑.
function macroStatusTag(key, s) {
  if (!s || typeof s.value !== 'number') return { text: '데이터 없음', color: 'slate' };
  if (key === 'vix') {
    const w = vixWeatherIcon(s.value);
    return { text: w.label, color: w.label === '긴장' ? 'red' : (w.label === '주의' ? 'amber' : 'green') };
  }
  const dir = macroDirectionLabel(s.changePercent);
  return { text: dir, color: dir === '상승' ? 'red' : (dir === '하락' ? 'blue' : 'slate') };
}

function macroDetailValueText(key, s) {
  if (!s || typeof s.value !== 'number') return '-';
  if (key === 'usdkrw') return `${fmtNum(s.value, 0)}원`;
  if (key === 'us10y') return `${fmtNum(s.value, 2)}%`;
  if (key === 'vix') return fmtNum(s.value, 1);
  return fmtNum(s.value, 1);
}

// [지표별 "그래서 무슨 뜻인지" 꼬리 문장] 1일/5일/20일 어느 조합으로 문장을 구성하든 마지막에 똑같이
// 붙는다 - VIX는 상태(안정/주의/긴장) 자체가 이미 의미를 담고 있어 별도 꼬리가 없다.
function macroMeaningTail(key) {
  if (key === 'usdkrw') return '환율이 오르면 보유 중인 달러 자산의 원화 환산 평가액은 늘고, 내리면 줄어듭니다.';
  if (key === 'us10y') return '금리가 오르면 채권가격은 내려가고, 성장주(고PER주)에는 대체로 부담 요인으로 작용하는 경향이 있습니다.';
  if (key === 'vix') return null;
  return '지수 등락은 그 시장에 상장된 기업들의 평균적인 투자심리를 보여줍니다.';
}

// [📈 최근 시장 동향 & 해설] 예전엔 오늘 하루 등락률만으로 "최근 동향"이라고 표시해 실제로는 하루짜리
// 스냅샷을 추세처럼 보이게 하는 착시가 있었다 - 이제 실제 5일/20일 종가 비교(fetchMacroShortTermTrend)
// 로 진짜 단기 추세를 판정하고, 오늘 하루가 그 추세와 반대 방향이면("최근 5일 조정 중 오늘 반등") 그
// 것까지 짚어준다. 이력 데이터를 못 가져온 경우(s.change5d가 null/undefined)에는 예전처럼 오늘 하루
// 등락만으로 안전하게 폴백한다. "그러니 사라/팔라"로 넘어가지 않고 "무슨 뜻인지"까지만 설명한다
// (투자자문 경계 - 이 세션 내내 지켜온 원칙과 동일).
function buildMacroDetailTrendText(key, s) {
  if (!s || typeof s.value !== 'number') return '아직 데이터를 불러오지 못했습니다 - 잠시 후 다시 확인해 주세요.';
  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${fmtNum(v, key === 'vix' ? 1 : 2)}%`;

  if (key === 'vix') {
    const w = vixWeatherIcon(s.value);
    const tail = w.label === '긴장'
      ? '시장 전반의 단기 변동성이 커진 상태라 계좌 등락폭도 함께 확대될 수 있습니다.'
      : (w.label === '주의' ? '평상시보다 다소 경계심이 높아진 수준입니다.' : '투자자들이 단기 변동성을 크게 우려하지 않는 평온한 구간입니다.');
    let text = `현재 VIX는 ${fmtNum(s.value, 1)}로 '${w.label}' 구간입니다. ${tail}`;
    if (typeof s.change5d === 'number') text += ` 최근 5일간 ${fmtPct(s.change5d)} 움직였습니다.`;
    return text;
  }

  // [1일 폴백] 이력 데이터를 못 가져왔으면 예전 방식(오늘 하루 등락만)으로 안전하게 대체한다.
  if (typeof s.change5d !== 'number') {
    const dir = macroDirectionLabel(s.changePercent);
    const changeText = typeof s.changePercent === 'number' ? fmtPct(s.changePercent) : '';
    const info = MACRO_INDICATOR_INFO[key];
    const base = key === 'usdkrw'
      ? `원/달러 환율이 ${dir}(${changeText}) 중입니다.`
      : (key === 'us10y' ? `미 10년물 금리가 ${dir} 흐름입니다.` : `${info.label}가 ${dir}(${changeText}) 흐름을 보이고 있습니다.`);
    const tail = macroMeaningTail(key);
    return tail ? `${base} ${tail}` : base;
  }

  const th = MACRO_TREND_THRESHOLDS[key] || { d5: 2, d20: 4 };
  const dirWord = (pct, threshold) => pct > threshold ? '상승' : (pct < -threshold ? '하락' : '박스권(보합)');
  const dir5 = dirWord(s.change5d, th.d5);
  const label = key === 'usdkrw' ? '원/달러 환율' : (key === 'us10y' ? '미 10년물 금리' : MACRO_INDICATOR_INFO[key].label);

  // [조사(이/가·은/는) 회피] label에 영문(S&P 500 등)이 섞여 있어 받침 유무로 조사를 고를 수 없다 -
  // "~의 최근 5일 등락률은" 형태로 어떤 label이 와도 자연스럽게 이어지도록 문장을 구성한다.
  const parts = [`${label}의 최근 5일 등락률은 ${fmtPct(s.change5d)}로 ${dir5} 흐름입니다.`];
  if (typeof s.change20d === 'number') {
    parts.push(`최근 20일 기준으로는 ${fmtPct(s.change20d)}로 ${dirWord(s.change20d, th.d20)} 흐름이에요.`);
  }
  // [오늘이 추세와 반대 방향이면 짚어주기] 사용자가 요청한 "최근 5일간 조정 중 오늘 소폭 반등" 패턴.
  if (dir5 !== '박스권(보합)' && typeof s.changePercent === 'number') {
    const todayDir = macroDirectionLabel(s.changePercent);
    if (dir5 === '하락' && todayDir === '상승') parts.push(`다만 오늘 하루는 ${fmtPct(s.changePercent)} 소폭 반등했습니다.`);
    else if (dir5 === '상승' && todayDir === '하락') parts.push(`다만 오늘 하루는 ${fmtPct(s.changePercent)} 소폭 조정받았습니다.`);
  }
  const tail = macroMeaningTail(key);
  if (tail) parts.push(tail);
  return parts.join(' ');
}

const MACRO_TAG_COLOR_CLASSES = {
  red: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  green: 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
};

function renderMacroDetailModal(key) {
  const info = MACRO_INDICATOR_INFO[key];
  if (!info) return;
  const s = macroDetailSnapshot[key];
  const tag = macroStatusTag(key, s);
  const hasChange = s && typeof s.changePercent === 'number';

  document.getElementById('macroDetailModalTitle').textContent = `📊 ${info.label}`;
  document.getElementById('macroDetailModalBody').innerHTML = `
    <div class="flex items-center justify-between mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
      <div class="text-xl font-bold">${escapeHtml(macroDetailValueText(key, s))}</div>
      <div class="flex items-center gap-2">
        ${hasChange ? `<span class="text-sm font-medium ${s.changePercent >= 0 ? 'text-red-500' : 'text-blue-500'}">${s.changePercent >= 0 ? '+' : ''}${fmtNum(s.changePercent, 2)}%</span>` : ''}
        <span class="text-xs font-semibold px-2 py-1 rounded-full ${MACRO_TAG_COLOR_CLASSES[tag.color]}">${escapeHtml(tag.text)}</span>
      </div>
    </div>
    <div class="mb-4">
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">💡 지표 기본 개념</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(info.concept)}</p>
    </div>
    <div class="mb-4">
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📈 최근 시장 동향 &amp; 해설</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(buildMacroDetailTrendText(key, s))}</p>
    </div>
    <div class="rounded-lg border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 p-3">
      <p class="text-xs font-semibold text-brand-700 dark:text-brand-300 mb-1.5">🧭 관전 포인트 &amp; 대응 팁</p>
      ${info.watchPoints.map((w, i) => `<p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1">${i + 1}. ${escapeHtml(w)}</p>`).join('')}
    </div>`;
}

async function openMacroDetailModal(key) {
  if (!MACRO_INDICATOR_INFO[key]) return;
  currentMacroDetailKey = key;
  renderMacroDetailModal(key); // 1차: 오늘 하루 등락 기준으로 먼저 보여준다(항상 즉시 응답).
  document.getElementById('macroDetailModal').classList.remove('hidden');
  pushModalHistoryState();

  // [5일/20일 추세 - 온디맨드 조회] 이미 오늘자로 캐시돼 있으면(getCachedDailyCloses가 날짜 단위로
  // 캐싱) 즉시 반영되고, 처음 조회하는 지표라면 1년치 종가를 새로 받아온 뒤 문장을 다시 그린다.
  const token = ++macroDetailRequestToken;
  const trend = await fetchMacroShortTermTrend(key);
  if (token !== macroDetailRequestToken || currentMacroDetailKey !== key) return; // 그 사이 닫히거나 다른 지표로 전환됐으면 버림
  const s = macroDetailSnapshot[key];
  if (s) {
    s.change5d = trend ? trend.change5d : null;
    s.change20d = trend ? trend.change20d : null;
  }
  renderMacroDetailModal(key); // 2차: 실제 5일/20일 추세 반영
}
function closeMacroDetailModal(viaBackButton) {
  currentMacroDetailKey = null;
  document.getElementById('macroDetailModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('macroDetailModalHeader').addEventListener('click', () => closeMacroDetailModal());
document.getElementById('closeMacroDetailModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeMacroDetailModal();
});
document.getElementById('macroDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'macroDetailModal') closeMacroDetailModal();
});
// [이벤트 위임] 8개 타일이 renderMacroBriefing()마다 매번 새로 그려지므로(innerHTML 교체), 타일 각각에
// 리스너를 다는 대신 문서 전역에 한 번만 걸어둔다 - data-open-stock-detail과 동일한 패턴.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-macro-key]');
  if (!el) return;
  openMacroDetailModal(el.dataset.macroKey);
});

function renderMacroBriefing() {
  const gridEl = document.getElementById('macroBriefingGrid');
  const diagnosisEl = document.getElementById('macroBriefingDiagnosis');
  if (!gridEl || !diagnosisEl) return;

  const vixInfo = state.macroIndicatorCache['VIX'];
  const vix = vixInfo ? vixInfo.price : null;
  const vixWeather = vixWeatherIcon(vix);

  const ust10yInfo = state.macroIndicatorCache['UST10Y'];
  const ust10y = ust10yInfo ? ust10yInfo.price : null;
  const ust10yChangePct = ust10yInfo ? ust10yInfo.changePercent : null;

  const fxChangePct = (typeof state.refExchangeRate === 'number' && state.refExchangeRate > 0)
    ? ((state.exchangeRate - state.refExchangeRate) / state.refExchangeRate) * 100 : 0;

  const kospiInfo = getMarketIndexInfoFromState(INDEX_TICKERS.KOSPI);
  const kosdaqInfo = getMarketIndexInfoFromState(INDEX_TICKERS.KOSDAQ);
  const sp500Info = getMarketIndexInfoFromState(INDEX_TICKERS.SP500);
  const nasdaqInfo = getMarketIndexInfoFromState(INDEX_TICKERS.NASDAQ);
  const dowInfo = state.macroIndicatorCache['DOW'];
  const indexTile = (key, label, info) => macroTileHtml(key, label, info ? fmtNum(info.price, 1) : '-', info ? `${info.changePercent >= 0 ? '+' : ''}${fmtNum(info.changePercent, 2)}%` : '조회 전', trendArrowIcon(info ? info.changePercent : null));

  gridEl.innerHTML = [
    macroTileHtml('vix', 'VIX(공포지수)', typeof vix === 'number' ? fmtNum(vix, 1) : '-', vixWeather.label, vixWeather.icon),
    macroTileHtml('usdkrw', '원/달러', typeof state.exchangeRate === 'number' ? `${fmtNum(state.exchangeRate, 0)}원` : '-', `${fxChangePct >= 0 ? '+' : ''}${fmtNum(fxChangePct, 2)}%`, trendArrowIcon(fxChangePct)),
    macroTileHtml('us10y', '美 10년물 금리', typeof ust10y === 'number' ? fmtNum(ust10y, 2) + '%' : '-', '국채 수익률', trendArrowIcon(ust10yChangePct)),
    indexTile('kospi', '코스피', kospiInfo),
    indexTile('kosdaq', '코스닥', kosdaqInfo),
    indexTile('sp500', 'S&P 500', sp500Info),
    indexTile('nasdaq', '나스닥', nasdaqInfo),
    indexTile('dow', '다우', dowInfo)
  ].join('');

  // [지표 상세 팝업용 스냅샷] 타일을 클릭했을 때(openMacroDetailModal) 다시 조회하지 않고 이 갱신
  // 주기에서 이미 받아온 값을 그대로 재사용한다 - 8개 지표를 한 곳에 모아두면 팝업 렌더링 쪽 코드가
  // 지표별 원본 소스(macroIndicatorCache/marketIndexCache/exchangeRate)를 몰라도 된다.
  // [5일/20일 추세 보존] change5d/change20d는 팝업을 열 때만 온디맨드로 채워지는데(openMacroDetailModal),
  // 여기서 매번 객체를 통째로 새로 만들면 그 값이 갱신 주기마다 날아가 버린다 - 이전 스냅샷에 남아있던
  // 값을 그대로 이어받는다(1년치 종가는 자주 안 바뀌므로 5분마다 다시 불러올 필요가 없다).
  const prevMacroSnapshot = macroDetailSnapshot;
  macroDetailSnapshot = {
    vix: { value: vix, changePercent: vixInfo ? vixInfo.changePercent : null, change5d: prevMacroSnapshot.vix && prevMacroSnapshot.vix.change5d, change20d: prevMacroSnapshot.vix && prevMacroSnapshot.vix.change20d },
    usdkrw: { value: state.exchangeRate, changePercent: fxChangePct, change5d: prevMacroSnapshot.usdkrw && prevMacroSnapshot.usdkrw.change5d, change20d: prevMacroSnapshot.usdkrw && prevMacroSnapshot.usdkrw.change20d },
    us10y: { value: ust10y, changePercent: ust10yChangePct, change5d: prevMacroSnapshot.us10y && prevMacroSnapshot.us10y.change5d, change20d: prevMacroSnapshot.us10y && prevMacroSnapshot.us10y.change20d },
    kospi: { value: kospiInfo ? kospiInfo.price : null, changePercent: kospiInfo ? kospiInfo.changePercent : null, change5d: prevMacroSnapshot.kospi && prevMacroSnapshot.kospi.change5d, change20d: prevMacroSnapshot.kospi && prevMacroSnapshot.kospi.change20d },
    kosdaq: { value: kosdaqInfo ? kosdaqInfo.price : null, changePercent: kosdaqInfo ? kosdaqInfo.changePercent : null, change5d: prevMacroSnapshot.kosdaq && prevMacroSnapshot.kosdaq.change5d, change20d: prevMacroSnapshot.kosdaq && prevMacroSnapshot.kosdaq.change20d },
    sp500: { value: sp500Info ? sp500Info.price : null, changePercent: sp500Info ? sp500Info.changePercent : null, change5d: prevMacroSnapshot.sp500 && prevMacroSnapshot.sp500.change5d, change20d: prevMacroSnapshot.sp500 && prevMacroSnapshot.sp500.change20d },
    nasdaq: { value: nasdaqInfo ? nasdaqInfo.price : null, changePercent: nasdaqInfo ? nasdaqInfo.changePercent : null, change5d: prevMacroSnapshot.nasdaq && prevMacroSnapshot.nasdaq.change5d, change20d: prevMacroSnapshot.nasdaq && prevMacroSnapshot.nasdaq.change20d },
    dow: { value: dowInfo ? dowInfo.price : null, changePercent: dowInfo ? dowInfo.changePercent : null, change5d: prevMacroSnapshot.dow && prevMacroSnapshot.dow.change5d, change20d: prevMacroSnapshot.dow && prevMacroSnapshot.dow.change20d }
  };
  if (!document.getElementById('macroDetailModal').classList.contains('hidden') && currentMacroDetailKey) {
    renderMacroDetailModal(currentMacroDetailKey); // 팝업이 열려있는 동안 갱신 주기가 돌면 값도 함께 최신화
  }

  const foreignAmount = state.assets.reduce((s, a) => { const r = calcRow(a); return s + (r.isForeign ? r.curAmount : 0); }, 0);
  const totalAmount = state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
  const foreignWeightPct = totalAmount > 0 ? (foreignAmount / totalAmount) * 100 : null;

  const commentary = buildMacroCommentary({
    vix, fxChangePct,
    ust10yChangePct,
    kospiChangePct: kospiInfo ? kospiInfo.changePercent : null,
    foreignWeightPct
  });
  const correlation = buildAssetCorrelationGuide({ ust10yChangePct, fxChangePct });
  diagnosisEl.innerHTML = `
    <p class="text-lg text-slate-600 dark:text-slate-300 leading-relaxed"><span class="font-semibold">📌 시장 종합 평가</span> ${escapeHtml(commentary.cause)}</p>
    <p class="text-lg text-slate-600 dark:text-slate-300 leading-relaxed"><span class="font-semibold">💰 내 포트폴리오 영향</span> ${escapeHtml(commentary.impact)}</p>
    <p class="text-lg text-slate-600 dark:text-slate-300 leading-relaxed"><span class="font-semibold">🧭 대응 가이드</span> ${escapeHtml(commentary.guide)}</p>
    <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <p class="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">💡 자산간 상관관계 가이드</p>
      <ul class="space-y-1 list-none">
        ${correlation.lines.map((l) => `<li class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(l)}</li>`).join('')}
      </ul>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">${escapeHtml(correlation.note)}</p>
    </div>`;
}

function renderRiskSection() {
  renderMacroBriefing();
  renderRiskCardOwnerTabs();
  renderRiskDiagnosisSummary();
  const riskyContainer = document.getElementById('riskListContainer');
  const safeContainer = document.getElementById('safeListContainer');
  const riskyBadge = document.getElementById('riskyCountBadge');
  const safeBadge = document.getElementById('safeCountBadge');
  const riskyBody = document.getElementById('riskyAccordionBody');
  const safeBody = document.getElementById('safeAccordionBody');
  const riskyChevron = document.getElementById('riskyAccordionChevron');
  const safeChevron = document.getElementById('safeAccordionChevron');
  if (!riskyContainer || !safeContainer) return;

  // [소유자별 필터] 리스크 감지/안정 목록도 지금 선택된 소유자(또는 전체) 기준으로만 보여준다.
  const { risky: riskyRaw, safe: safeRaw } = computeRiskClassifiedAssets(riskCardOwnerFilter);
  // 정렬 기준: 해외 자산을 먼저, 그 다음 평가금액이 큰 순서로 보여준다(두 목록 공통).
  const regionThenAmount = (x, y) => {
    const regionRank = (b) => (b.asset.isDomestic === '해외' ? 0 : 1);
    return regionRank(x) - regionRank(y) || y.curAmount - x.curAmount;
  };
  const risky = riskyRaw.sort(regionThenAmount);
  const safe = safeRaw.sort(regionThenAmount);
  // [소유자별 필터] 비중(%) 계산 분모도 선택된 소유자 기준 총액으로 맞춘다 - '전체'일 때는 기존과 동일.
  const totalPortfolioCur = state.assets
    .filter((a) => riskCardOwnerFilter === 'all' || a.owner === riskCardOwnerFilter)
    .reduce((s, a) => s + calcRow(a).curAmount, 0);

  riskyBadge.textContent = `${risky.length}건`;
  safeBadge.textContent = `${safe.length}건`;

  riskyContainer.innerHTML = risky.length === 0
    ? '<p class="text-xs text-slate-400 py-1">현재 리스크 감지 종목이 없습니다. (포트폴리오 안정)</p>'
    : risky.map(({ key, asset: a, row: r, tags, owners, curAmount, holding }) => {
      const p = derivePresentation(r);
      const weightPct = totalPortfolioCur !== 0 ? (curAmount / totalPortfolioCur) * 100 : 0;
      const tagHtml = tags.map((t) =>
        `<span class="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 font-semibold">[${escapeHtml(t)}]</span>`
      ).join(' ');
      // [쉬운 행동 지침 태그] 감지 조건에 따라 "비중 축소 검토"/"방어자산 확보 필요"/"단기 추세 주의"/
      // "변동성 확대 주의" 중 하나를 골라 옆에 덧붙인다 - buildAssetActionTag()가 우선순위대로 고른다.
      const actionTag = buildAssetActionTag(tags);
      const actionTagHtml = actionTag ? `<span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">💡 ${escapeHtml(actionTag)}</span>` : '';
      return `
      <div class="py-2.5 border-b last:border-b-0 border-red-100 dark:border-red-900/40" data-risk-row data-risk-key="${escapeHtml(key)}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-base font-semibold truncate"><span class="cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(a.ticker)}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span> <span class="text-xs font-normal text-slate-400">· ${escapeHtml(owners.join('+'))}</span></p>
            <div class="flex flex-wrap items-center gap-1.5 mt-1.5">${tagHtml}${actionTagHtml}<span class="text-xs text-slate-400">비중 ${fmtNum(weightPct, 1)}%</span></div>
          </div>
          <div class="text-right shrink-0 pl-2">
            <p class="text-base font-bold">${p.priceUnit}${fmtNum(r.currentPrice, 2)}${p.sessionBadge}</p>
            <button type="button" data-risk-detail-toggle class="mt-1.5 inline-flex items-center gap-0.5 py-1 pl-2 -mr-2 text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
              🔍 리스크 진단 보기 <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200" data-risk-detail-chevron></i>
            </button>
          </div>
        </div>
        <div data-risk-detail-body class="overflow-hidden transition-[max-height] duration-300 ease-in-out" style="max-height:0px;">
          ${buildIndividualRiskDetailHtml(holding, weightPct)}
        </div>
      </div>`;
    }).join('');

  safeContainer.innerHTML = safe.length === 0
    ? '<p class="text-sm text-slate-400 py-1">아직 안정 상태로 분류된 종목이 없습니다.</p>'
    : safe.map(({ asset: a, row: r, owners, curAmount }) => {
      const p = derivePresentation(r);
      const weightPct = totalPortfolioCur !== 0 ? (curAmount / totalPortfolioCur) * 100 : 0;
      return `
      <div class="flex items-start justify-between gap-2 py-2.5 border-b last:border-b-0 border-emerald-100 dark:border-emerald-900/40">
        <div class="min-w-0">
          <p class="text-base font-semibold truncate"><span class="cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(a.ticker)}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span> <span class="text-xs font-normal text-slate-400">· ${escapeHtml(owners.join('+'))}</span></p>
          <div class="flex items-center gap-1.5 mt-1.5">
            <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 font-semibold">특이사항 없음</span>
            <span class="text-xs text-slate-400">비중 ${fmtNum(weightPct, 1)}%</span>
          </div>
        </div>
        <div class="text-right shrink-0 pl-2">
          <p class="text-base font-bold">${p.priceUnit}${fmtNum(r.currentPrice, 2)}${p.sessionBadge}</p>
        </div>
      </div>`;
    }).join('');

  // 방금 다시 그린 내용 기준으로 펼침 상태를 재적용한다 - 펼쳐진 채로 데이터가 바뀌어도(5분 자동
  // 갱신 등) 높이가 새 내용에 맞게 갱신되고, 접힌 쪽은 계속 접힌 채로 유지된다.
  if (riskyBody && riskyChevron) setAccordionOpen(riskyBody, riskyChevron, riskyAccordionOpen);
  if (safeBody && safeChevron) setAccordionOpen(safeBody, safeChevron, safeAccordionOpen);

  // [🔍 리스크 진단 보기] 새로 그려진 종목 행마다 data-lucide 아이콘을 실제 SVG로 바꿔주고, 이 종목이
  // openStockDetailKeys에 펼쳐진 상태로 기록돼 있으면 높이/화살표를 즉시 재적용한다(reapplyRiskDetailPanelHeights).
  // 그 다음 바깥 "리스크 감지" 아코디언 높이도 늘어난 내용에 맞춰 다시 계산한다(중첩 아코디언 버그 수정).
  lucide.createIcons();
  reapplyRiskDetailPanelHeights();
  reapplyRiskyOuterAccordionHeight();
}

// riskyContainer 안의 각 종목 행을 순회하며 openStockDetailKeys에 있는 종목만 펼친 상태로 되돌린다 -
// setAccordionOpen과 동일한 max-height 트릭이지만 종목별로 여러 개를 동시에 다뤄야 해 별도 함수로 뺐다.
function reapplyRiskDetailPanelHeights() {
  document.querySelectorAll('#riskListContainer [data-risk-row]').forEach((rowEl) => {
    const key = rowEl.dataset.riskKey;
    const bodyEl = rowEl.querySelector('[data-risk-detail-body]');
    const chevronEl = rowEl.querySelector('[data-risk-detail-chevron]');
    if (!bodyEl) return;
    const isOpen = openStockDetailKeys.has(key);
    bodyEl.style.maxHeight = isOpen ? bodyEl.scrollHeight + 'px' : '0px';
    if (chevronEl) chevronEl.classList.toggle('rotate-180', isOpen);
  });
}

// [중첩 아코디언 높이 버그 수정] "리스크 감지" 바깥 아코디언(riskyAccordionBody)의 max-height는 종목
// 리스트가 그려질 때의 높이로 한 번 고정되는데, 그 안의 개별 [🔍 리스크 진단 보기] 카드가 나중에
// 펼쳐지면 바깥 컨테이너 높이가 더 늘어나야 한다 - 그렇지 않으면 안쪽 카드가 잘려 보인다. 안쪽 카드가
// CSS transition으로 서서히 커지는 도중에는 scrollHeight를 읽어도 아직 다 커지지 않은 중간값이 잡히므로,
// 즉시 한 번 + 안쪽 transition(300ms)이 끝난 뒤 한 번 더 재계산해 확실히 맞춘다.
function reapplyRiskyOuterAccordionHeight() {
  const riskyBody = document.getElementById('riskyAccordionBody');
  if (!riskyBody || !riskyAccordionOpen) return;
  riskyBody.style.maxHeight = riskyBody.scrollHeight + 'px';
  setTimeout(() => { if (riskyAccordionOpen) riskyBody.style.maxHeight = riskyBody.scrollHeight + 'px'; }, 320);
}

document.getElementById('riskyAccordionBtn').addEventListener('click', () => {
  riskyAccordionOpen = !riskyAccordionOpen;
  setAccordionOpen(document.getElementById('riskyAccordionBody'), document.getElementById('riskyAccordionChevron'), riskyAccordionOpen);
});
document.getElementById('safeAccordionBtn').addEventListener('click', () => {
  safeAccordionOpen = !safeAccordionOpen;
  setAccordionOpen(document.getElementById('safeAccordionBody'), document.getElementById('safeAccordionChevron'), safeAccordionOpen);
});

// [🔍 리스크 진단 보기] 종목 행 안의 토글 버튼 클릭 - 위임(delegated) 리스너 하나로 재렌더링 여부와
// 무관하게 항상 동작한다(data-open-stock-detail과 동일한 패턴). 아코디언이 펼쳐지면서 detail 카드
// 안의 실제 렌더링된 높이(scrollHeight)를 그대로 max-height에 반영해 자연스럽게 슬라이드된다.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-risk-detail-toggle]');
  if (!btn) return;
  const rowEl = btn.closest('[data-risk-row]');
  if (!rowEl) return;
  const key = rowEl.dataset.riskKey;
  const bodyEl = rowEl.querySelector('[data-risk-detail-body]');
  const chevronEl = rowEl.querySelector('[data-risk-detail-chevron]');
  const isOpen = !openStockDetailKeys.has(key);
  if (isOpen) openStockDetailKeys.add(key); else openStockDetailKeys.delete(key);
  if (bodyEl) bodyEl.style.maxHeight = isOpen ? bodyEl.scrollHeight + 'px' : '0px';
  if (chevronEl) chevronEl.classList.toggle('rotate-180', isOpen);
  reapplyRiskyOuterAccordionHeight();
});

/* -------------------------------------------------------------------------
 * 18-4. [초보자용] 포트폴리오 위험 진단 알림 팝업
 *    - 웹 접속(bootApp) 시 딱 한 번 판단한다: state.advancedRiskMetrics가 있고, 안전 점수가 주의(🟡)
 *      /위험(🔴) 단계이면 자동으로 뜬다. 내용은 RISK 관리 카드와 완전히 같은 계산 결과를 재사용하므로
 *      숫자가 어긋날 일이 없다.
 *    ['오늘 하루 안 보기' 제거] 예전엔 localStorage(LS_RISK_ALERT_DISMISSED)에 오늘 날짜를 저장해 같은
 *      날 재접속/새로고침 시 팝업을 건너뛰었다 - 요청에 따라 이 저장/조회 로직을 완전히 없애 접속·
 *      새로고침 때마다(위험/주의 단계인 한) 매번 다시 뜨도록 바꿨다.
 * ---------------------------------------------------------------------- */
function maybeShowRiskAlertPopup() {
  const m = state.advancedRiskMetrics;
  if (!m) return;
  const level = riskLevelFromScore(m.riskScore);
  if (level.level === 'safe') return; // 양호 단계면 팝업 없음
  openRiskAlertModal();
}

// 🚨 핵심 위험 TOP3 카드 - 집중도가 높은 종목(topWeight>=25%, 위험 기여도 함께 표기)과, RISK 관리
// 카드의 감지 종목을 합쳐 최대 3개까지만 간추려 보여준다(팝업이 너무 길어지지 않도록).
function buildRiskAlertStockCards(m) {
  const cards = [];
  if (m.topWeight >= 25 && m.topHolding) {
    const contrib = typeof m.topHolding.riskContributionPct === 'number' ? m.topHolding.riskContributionPct : null;
    cards.push(`⚠️ [${escapeHtml(m.topHolding.name)}] 비중 ${fmtNum(m.topWeight, 0)}%${contrib !== null ? ` · 위험기여도 ${fmtNum(contrib, 0)}%` : ''} (과도함)`);
  }
  const { risky } = computeRiskClassifiedAssets();
  risky.slice(0, 3).forEach((r) => {
    if (cards.length >= 3) return;
    const tagText = r.tags.join(', ');
    cards.push(`⚠️ [${escapeHtml(r.asset.name)}] ${escapeHtml(tagText)}`);
  });
  return cards.slice(0, 3);
}

function openRiskAlertModal() {
  const m = state.advancedRiskMetrics;
  if (!m) return;
  const score = m.riskScore;
  const level = riskLevelFromScore(score);

  document.getElementById('riskAlertScoreBox').innerHTML = `
    <div class="rounded-xl border p-3 ${level.bgClass}">
      <p class="text-base font-bold ${level.colorClass}">${level.emoji} 종합 위험점수 ${score}/100 [${level.label}]</p>
      <p class="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed">${buildRiskDiagnosisLine(m)}</p>
    </div>`;

  const stockCards = buildRiskAlertStockCards(m);
  document.getElementById('riskAlertStockCards').innerHTML = stockCards.length
    ? stockCards.map((c) => `<p class="text-sm font-semibold text-red-600 dark:text-red-400 leading-relaxed">${c}</p>`).join('')
    : '';

  const actionItems = buildRiskActionItems(m);
  document.getElementById('riskAlertActionItems').innerHTML = `
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">💡 초직관적 행동 제안</p>
    ${actionItems.map((item, i) => `<p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${i + 1}. ${item}</p>`).join('')}`;

  document.getElementById('riskAlertModal').classList.remove('hidden');
  pushModalHistoryState();
  lucide.createIcons();
}

function closeRiskAlertModal(viaBackButton) {
  document.getElementById('riskAlertModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}

// [팝업 내부 터치 닫기] 이 팝업은 화면 대부분을 차지해 바깥 배경(오버레이)을 터치하기 어렵다 - 안쪽
// 콘텐츠를 눌러도 닫히도록 모달 루트 전체에 클릭 리스너를 하나만 둔다(버블링으로 안쪽 클릭도 여기로
// 올라옴). 실행 버튼 3개(닫기/원클릭 리밸런싱 이동/상세 리스크관리 이동)는 각자 핸들러에서
// e.stopPropagation()으로 이 리스너까지 전파되지 않게 막아, 원래 동작만 실행되고 팝업이 예기치 않게
// 같이 닫히는 일이 없게 한다.
document.getElementById('riskAlertModal').addEventListener('click', () => closeRiskAlertModal(false));

document.getElementById('closeRiskAlertModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeRiskAlertModal(false);
});

// [⚡ 원클릭 리밸런싱 이동] 팝업을 닫고 곧바로 "리밸런싱/자산예측" 탭의 "목표 비중 설정" 서브탭으로 이동한다.
document.getElementById('riskAlertRebalanceBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeRiskAlertModal(false);
  switchTab('rebalance');
  switchRebalanceSubTab('target');
});

// [📊 상세 리스크 관리 카드로 이동] 팝업을 닫고 대시보드 탭으로 전환한 뒤, RISK 관리 카드 위치까지
// 부드럽게 스크롤한다 - 아코디언(리스크 감지 목록)도 함께 펼쳐 바로 세부 내용을 볼 수 있게 한다.
// [🔍 리스크 진단 보기 자동 연동] 가장 비중이 큰 감지 종목의 개별 진단 카드까지 미리 펼쳐두고, 잠시
// 파란 테두리로 강조해 팝업에서 보던 문제 종목을 바로 찾을 수 있게 한다.
document.getElementById('riskAlertDetailBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeRiskAlertModal(false);
  switchTab('dashboard');
  if (!riskyAccordionOpen) {
    riskyAccordionOpen = true;
    setAccordionOpen(document.getElementById('riskyAccordionBody'), document.getElementById('riskyAccordionChevron'), true);
  }
  const { risky } = computeRiskClassifiedAssets();
  const primary = risky.slice().sort((a, b) => b.curAmount - a.curAmount)[0] || null;
  if (primary) {
    openStockDetailKeys.add(primary.key);
    renderRiskSection();
  }
  setTimeout(() => {
    document.getElementById('riskManagementSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (primary) {
      const rowEl = document.querySelector(`#riskListContainer [data-risk-key="${CSS.escape(primary.key)}"]`);
      if (rowEl) {
        rowEl.classList.add('ring-2', 'ring-blue-400', 'rounded-lg');
        setTimeout(() => rowEl.classList.remove('ring-2', 'ring-blue-400', 'rounded-lg'), 2500);
      }
    }
  }, 50);
});

/* -------------------------------------------------------------------------
 * 18-6. [종목 분석 & 투자 검토 보고서] 모달 - analyzeTickerForModal()/simulatePortfolioAddition()
 *    (js/09)이 계산해 둔 값을 화면에 옮겨 적기만 한다(18-3 구간의 "엔진은 09, 번역은 10" 원칙과 동일).
 * ---------------------------------------------------------------------- */
function bollingerPositionLabel(bollinger) {
  if (!bollinger || typeof bollinger.pctB !== 'number') return '데이터 부족';
  const pctB = bollinger.pctB;
  if (pctB >= 1) return '상단 밴드 상회(단기 과열 가능)';
  if (pctB >= 0.8) return '상단 부근(단기 과열 구간에 근접)';
  if (pctB <= 0) return '하단 밴드 하회(단기 급락 상태)';
  if (pctB <= 0.2) return '하단 부근(단기 반등 대기 구간 가능)';
  return '중심선 부근(평상시 변동 범위)';
}

// [종합 1줄 리포트] 감지된 신호를 규칙 기반으로 모아 한 문장으로 요약한다 - buildRiskDiagnosisLine과
// 동일한 "왜 그런가"를 보여주는 톤. 고지문은 renderStockAnalysisResult 하단에 한 번만 붙이므로 여기서는
// 중복하지 않는다.
function buildStockAnalysisReportLine(a, sim) {
  const flags = [];
  if (a.rsiState === '과열') flags.push(`단기 과열(RSI ${fmtNum(a.rsi14, 0)})`);
  if (a.trendLabel === '역배열(하락추세)') flags.push('이동평균 역배열(하락추세)');
  if (typeof a.week52DrawdownPct === 'number' && a.week52DrawdownPct <= -30) flags.push(`52주 고점 대비 ${fmtNum(Math.abs(a.week52DrawdownPct), 0)}% 낙폭`);
  if (typeof a.beta === 'number' && a.beta >= 1.3) flags.push(`시장 대비 변동성 높음(베타 ${fmtNum(a.beta, 1)})`);
  if (sim && (sim.after.topSectorWeight - sim.before.topSectorWeight) >= 10) {
    flags.push(`편입 시 '${sim.after.topSector}' 섹터 쏠림 심화(${fmtNum(sim.before.topSectorWeight, 0)}%→${fmtNum(sim.after.topSectorWeight, 0)}%)`);
  }
  if (sim && (sim.after.topWeightPct - sim.before.topWeightPct) >= 5 && sim.after.topHoldingName === (a.name || a.ticker)) {
    flags.push(`이 종목이 계좌 내 최대비중(${fmtNum(sim.after.topWeightPct, 0)}%)이 됨`);
  }
  if (flags.length === 0) return '기술적 신호와 포트폴리오 영향 모두 특별한 경고 신호가 없는 편입니다.';
  return `주의 신호: ${flags.join(' · ')}. 편입 전 비중을 신중히 검토하세요.`;
}

// [📌 핵심 요약 & 현재 상태] 이동평균/RSI/52주 낙폭을 한데 모아 초보자가 한눈에 이해할 수 있는 상태
// 뱃지 + 쉬운 문장 하나로 압축한다. 🟡(주의)는 과열·역배열·큰 낙폭 중 하나라도 걸릴 때, 🔵(관심)은
// 과매도(단기 급락 후 바닥권), 그 외는 🟢(안정)로 분류한다 - "사라/팔라"가 아니라 "지금 상태가 어떤지"
// 까지만 알려준다.
function buildStockStatusSummary(a) {
  const isOverbought = a.rsiState === '과열';
  const isOversold = a.rsiState === '과매도';
  const isDownTrend = a.trendLabel === '역배열(하락추세)';
  const bigDrawdown = typeof a.week52DrawdownPct === 'number' && a.week52DrawdownPct <= -30;

  let trendPhrase;
  if (a.trendLabel === '정배열(상승추세)') trendPhrase = '꾸준히 오르는 흐름을 이어가고 있어요';
  else if (a.trendLabel === '역배열(하락추세)') trendPhrase = '하락 흐름이 이어지는 숨고르기(조정) 구간이에요';
  else trendPhrase = '뚜렷한 방향 없이 등락을 반복하는 구간이에요';

  let extra = '';
  if (isOverbought) extra = ' 최근 단기간 빠르게 올라 잠시 쉬어가기 좋은 위치일 수 있어요.';
  else if (isOversold) extra = ' 단기간 많이 빠져서 관심 있게 지켜볼 만한 구간이에요.';

  let tag = { emoji: '🟢', label: '안정적', color: 'green' };
  if (isOverbought || isDownTrend || bigDrawdown) tag = { emoji: '🟡', label: '주의 필요', color: 'amber' };
  else if (isOversold) tag = { emoji: '🔵', label: '관심 구간', color: 'blue' };

  return { tag, summaryText: trendPhrase + '.' + extra };
}

// [🏦 거래량 & 시장 관심도] analyzeTickerForModal()이 계산해 둔 volumeTrend(최근 5일 평균 vs 그 전
// 15일 평균)를 문장으로 옮긴다.
function buildVolumeTrendText(volumeTrend) {
  if (!volumeTrend) return '거래량 데이터가 부족해 관심도 추이를 계산할 수 없어요.';
  if (volumeTrend.direction === 'up') return '최근 사람들의 관심(거래량)이 늘어나며 주가를 받쳐주는 모습이에요.';
  if (volumeTrend.direction === 'down') return '최근 거래량이 줄어들며 잠시 숨고르기 양상을 보이고 있어요.';
  return '최근 거래량은 평소와 비슷한 수준을 유지하고 있어요.';
}

// [🎯 위험 관리 안내] 이 종목의 현재 가격/지표와 무관하게 어떤 종목을 보든 똑같이 적용되는 일반
// 원칙만 담는다 - 특정 가격대·비중·시점을 지정하면 개인화된 매매 지시가 되므로, 의도적으로 이
// 종목의 수치를 전혀 참조하지 않는 고정 문구다.
const STOCK_ANALYSIS_RISK_TIPS = [
  '한 번에 다 사기보다 나누어 접근하면 가격 변동에 따른 부담을 줄일 수 있어요.',
  '단기간 급하게 오른 자산을 추격 매수하기보다는, 흐름을 지켜본 뒤 판단하는 투자자가 많아요.',
  '여러 종목/자산군에 나눠 담으면 한 종목의 등락이 전체 계좌에 미치는 영향을 줄일 수 있어요.'
];

// [초보자용 지표 가이드] guideText가 있으면 값 아래에 작은 회색 캡션으로 항상 보여준다 - 아이콘을
// 눌러야 보이는 호버 툴팁 대신 항상 노출되는 캡션을 택했다(모바일에서는 호버가 없어 툴팁이 잘 안
// 보이는 문제를 피하기 위함, 이 앱의 다른 "초보자용" 설명들도 대부분 이 방식을 쓴다).
function stockAnalysisStatTile(label, valueText, guideText) {
  return `
  <div class="rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
    <div class="text-[10px] text-slate-400">${escapeHtml(label)}</div>
    <div class="text-xs font-semibold mt-0.5">${valueText}</div>
    ${guideText ? `<div class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">${escapeHtml(guideText)}</div>` : ''}
  </div>`;
}

// [지표별 쉬운 설명] 계산된 상태(state)에 맞춰 매번 다른 문구를 보여준다 - 정적인 정의 하나만 보여주는
// 것보다, "지금 이 종목이 어떤 상태인지"까지 함께 알려줘야 초보자가 실제로 판단에 쓸 수 있다.
function maTrendGuideText(trendLabel) {
  if (trendLabel === '정배열(상승추세)') return '단기>중기>장기 이동평균 순으로 배열되어 상승 흐름이 이어지는 모양이에요.';
  if (trendLabel === '역배열(하락추세)') return '단기<중기<장기 이동평균 순으로 배열되어 하락 흐름이 이어지는 모양이에요.';
  if (trendLabel === '혼조(추세 불분명)') return '뚜렷한 방향 없이 등락을 반복하는 구간이라 관망이 무난해요.';
  return '';
}
function rsiGuideText(rsiState) {
  if (rsiState === '과열') return '70 이상은 단기 과열 구간이에요 - 추격 매수는 주의하세요.';
  if (rsiState === '과매도') return '30 이하는 과매도 구간이에요 - 단기 반등을 기대해볼 수 있어요.';
  if (rsiState === '적정') return '30~70 사이는 특별히 과열되거나 침체되지 않은 평이한 구간이에요.';
  return '';
}
function bollingerGuideText(bollinger) {
  if (!bollinger || typeof bollinger.pctB !== 'number') return '';
  return '최근 20일 평균 주가 대비 얼마나 벗어나 있는지 보여주는 지표예요.';
}
const MDD_GUIDE_TEXT = '최근 1년 중 고점 대비 가장 크게 떨어졌던 폭이에요 - 손실 위험도를 가늠하는 지표예요.';
function betaGuideText(beta) {
  if (typeof beta !== 'number') return '';
  if (beta >= 1.15) return '베타 1.0 기준, 시장보다 더 민감하게 움직이는 공격형 종목이에요.';
  if (beta <= 0.85) return '베타 1.0 기준, 시장보다 덜 움직이는 안정적인 방어형 종목이에요.';
  return '베타 1.0 기준, 시장과 비슷한 정도로 움직이는 종목이에요.';
}

const STOCK_ANALYSIS_TAG_COLOR_CLASSES = {
  green: 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
};

function renderStockAnalysisResult(a, sim) {
  const changeColor = typeof a.changePercent === 'number' ? (a.changePercent >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-slate-400';
  const changeText = typeof a.changePercent === 'number' ? `${a.changePercent >= 0 ? '+' : ''}${fmtNum(a.changePercent, 2)}%` : '조회 실패';
  const status = buildStockStatusSummary(a);
  const priceDecimals = a.currentPrice < 100 ? 2 : 0;

  let simHtml = '';
  if (sim) {
    simHtml = `
    <div class="mb-3">
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">🧩 포트폴리오 적합도 (편입 시 예상 변화, +${fmtNum(sim.addedWeightPct, 1)}%p)</p>
      <div class="grid grid-cols-2 gap-2">
        ${stockAnalysisStatTile('섹터 쏠림 (최대 섹터)', `${escapeHtml(sim.before.topSector || '-')} ${fmtNum(sim.before.topSectorWeight, 0)}% → ${escapeHtml(sim.after.topSector || '-')} ${fmtNum(sim.after.topSectorWeight, 0)}%`)}
        ${stockAnalysisStatTile('최대 종목 비중', `${fmtNum(sim.before.topWeightPct, 0)}% → ${fmtNum(sim.after.topWeightPct, 0)}%`)}
      </div>
    </div>`;
  }

  return `
  <div class="mb-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-baseline justify-between gap-2">
    <h4 class="text-sm font-bold truncate cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(a.ticker)}" data-name="${escapeHtml(a.name)}" title="차트 보기">📊 ${escapeHtml(a.name)} <span class="text-xs font-normal text-slate-400">${escapeHtml(a.ticker)}</span></h4>
    <div class="text-right shrink-0">
      <div class="text-sm font-semibold">${fmtNum(a.currentPrice, priceDecimals)}</div>
      <div class="text-xs font-medium ${changeColor}">${changeText}</div>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📌 핵심 요약 &amp; 현재 상태</p>
    <div class="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 flex items-start gap-2">
      <span class="text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${STOCK_ANALYSIS_TAG_COLOR_CLASSES[status.tag.color]}">${status.tag.emoji} ${escapeHtml(status.tag.label)}</span>
      <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(status.summaryText)}</p>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📊 주가 위치 &amp; 주요 가격대 참고</p>
    <div class="grid grid-cols-2 gap-2">
      ${stockAnalysisStatTile('단기 벽 (최근 3개월 최고가)', typeof a.recentHigh === 'number' ? fmtNum(a.recentHigh, priceDecimals) : '데이터 부족', '최근 3개월 동안 가장 높았던 가격이에요 - 이 부근에서 상승 속도가 둔해진 적이 있어요.')}
      ${stockAnalysisStatTile('1차 버팀목 (최근 3개월 최저가)', typeof a.recentLow === 'number' ? fmtNum(a.recentLow, priceDecimals) : '데이터 부족', '최근 3개월 동안 가장 낮았던 가격이에요 - 이 부근에서 하락이 멈췄던 적이 있어요.')}
      <div class="col-span-2">${stockAnalysisStatTile('52주 고점 대비', typeof a.week52DrawdownPct === 'number' ? `${fmtNum(a.week52DrawdownPct, 1)}%` : '데이터 부족', '1년 중 가장 높았던 가격 대비 지금 얼마나 내려와 있는지 보여줘요.')}</div>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📈 기술적 분석</p>
    <div class="grid grid-cols-2 gap-2">
      ${stockAnalysisStatTile('이동평균 배열(20/60/120일)', a.trendLabel || '데이터 부족', maTrendGuideText(a.trendLabel))}
      ${stockAnalysisStatTile('과열지수 RSI(14)', typeof a.rsi14 === 'number' ? `${fmtNum(a.rsi14, 0)} (${a.rsiState})` : '데이터 부족', rsiGuideText(a.rsiState))}
      <div class="col-span-2">${stockAnalysisStatTile('볼린저 밴드 위치', bollingerPositionLabel(a.bollinger), bollingerGuideText(a.bollinger))}</div>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">🏦 거래량 &amp; 시장 관심도</p>
    <div class="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
      <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(buildVolumeTrendText(a.volumeTrend))}</p>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">⚠️ 리스크 분석</p>
    <div class="grid grid-cols-2 gap-2">
      ${stockAnalysisStatTile('최대낙폭(MDD, 1년)', typeof a.mdd === 'number' ? `${fmtNum(a.mdd, 1)}%` : '데이터 부족', typeof a.mdd === 'number' ? MDD_GUIDE_TEXT : '')}
      ${stockAnalysisStatTile('베타(시장 민감도)', typeof a.beta === 'number' ? `${fmtNum(a.beta, 2)}배` : '데이터 부족', betaGuideText(a.beta))}
    </div>
  </div>

  ${simHtml}

  <div class="mb-3">
    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">🎯 위험 관리 안내</p>
    <div class="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 space-y-1">
      ${STOCK_ANALYSIS_RISK_TIPS.map((tip, i) => `<p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${i + 1}. ${escapeHtml(tip)}</p>`).join('')}
    </div>
  </div>

  <div class="rounded-lg border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 p-2.5">
    <p class="text-xs font-semibold text-brand-700 dark:text-brand-300">📝 종합 진단</p>
    <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1">${escapeHtml(buildStockAnalysisReportLine(a, sim))}</p>
  </div>

  <p class="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">본 리포트는 참고용 정보이며, 최종 투자 판단과 책임은 본인에게 있습니다.</p>`;
}

// [한글 종목명 검색 추천 목록] searchStockAnalysisCandidates()(js/09)가 찾은 보유자산/주요종목 후보를
// 클릭 가능한 목록으로 보여준다 - 고르면 입력창에 이름을 채우고 즉시 분석까지 실행한다(모호한 부분
// 일치(예: '삼성')를 findTickerByKoreanName()이 스스로 판단하지 못하는 문제를 여기서 해결).
function hideStockAnalysisSuggestions() {
  const el = document.getElementById('stockAnalysisSuggestions');
  el.classList.add('hidden');
  el.innerHTML = '';
}
function renderStockAnalysisSuggestions(candidates) {
  const el = document.getElementById('stockAnalysisSuggestions');
  if (candidates.length === 0) { hideStockAnalysisSuggestions(); return; }
  el.innerHTML = candidates.map((c) => `
    <button type="button" data-suggest-name="${escapeHtml(c.name)}" class="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
      <span class="truncate">${escapeHtml(c.name)} <span class="text-slate-400 text-xs">${escapeHtml(c.ticker)}</span></span>
      <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">${escapeHtml(c.sub)}</span>
    </button>`).join('');
  el.classList.remove('hidden');
  el.querySelectorAll('button[data-suggest-name]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('stockAnalysisTickerInput').value = btn.dataset.suggestName;
      hideStockAnalysisSuggestions();
      runStockAnalysis();
    });
  });
}
let stockAnalysisSuggestDebounceTimer = null;
document.getElementById('stockAnalysisTickerInput').addEventListener('input', (e) => {
  clearTimeout(stockAnalysisSuggestDebounceTimer);
  const query = e.target.value.trim();
  if (query.length < 2) { hideStockAnalysisSuggestions(); return; }
  stockAnalysisSuggestDebounceTimer = setTimeout(() => {
    renderStockAnalysisSuggestions(searchStockAnalysisCandidates(query));
  }, 200);
});
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('stockAnalysisTickerInput');
  if (!wrap) return;
  if (e.target !== wrap && !document.getElementById('stockAnalysisSuggestions').contains(e.target)) hideStockAnalysisSuggestions();
});

let stockAnalysisRequestToken = 0;
async function runStockAnalysis() {
  const tickerInput = document.getElementById('stockAnalysisTickerInput');
  const amountInput = document.getElementById('stockAnalysisAmountInput');
  const raw = tickerInput.value.trim();
  const errorEl = document.getElementById('stockAnalysisErrorMsg');
  const resultEl = document.getElementById('stockAnalysisResult');
  const loadingEl = document.getElementById('stockAnalysisLoading');
  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  if (!raw) { errorEl.textContent = '종목명 또는 티커를 입력해 주세요.'; errorEl.classList.remove('hidden'); return; }

  // [정확 일치 vs 모호한 입력] 한글 이름인데 정확히 하나로 특정되지 않으면(예: '삼성') 바로 에러를
  // 보여주는 대신 추천 드롭다운을 띄운다 - '삼성전자'처럼 완전히 일치하는 이름/티커/영문 입력은
  // findTickerByKoreanName이 바로 매칭되므로 이 분기를 타지 않고 곧장 분석으로 진행된다.
  if (/[가-힣]/.test(raw) && !findTickerByKoreanName(raw)) {
    const candidates = searchStockAnalysisCandidates(raw);
    if (candidates.length >= 2) { renderStockAnalysisSuggestions(candidates); return; }
    hideStockAnalysisSuggestions();
    if (candidates.length === 0) {
      errorEl.textContent = `'${raw}' 이름으로 종목을 찾을 수 없습니다 - 검색창에 두 글자 이상 입력하면 뜨는 추천 목록에서 선택하거나 티커를 직접 입력해 주세요.`;
      errorEl.classList.remove('hidden');
      return;
    }
  } else {
    hideStockAnalysisSuggestions();
  }

  loadingEl.classList.remove('hidden');
  const token = ++stockAnalysisRequestToken;
  const a = await analyzeTickerForModal(raw);
  if (token !== stockAnalysisRequestToken) return; // 그 사이 재검색/모달 닫힘 - 늦게 온 응답은 버림
  loadingEl.classList.add('hidden');

  if (a.error) {
    errorEl.textContent = a.error;
    errorEl.classList.remove('hidden');
    return;
  }
  const addAmountKRW = num(amountInput.value);
  const sim = addAmountKRW > 0 ? simulatePortfolioAddition(a.ticker, addAmountKRW) : null;
  resultEl.innerHTML = renderStockAnalysisResult(a, sim);
  resultEl.classList.remove('hidden');
  lucide.createIcons();
}

function openStockAnalysisModal() {
  document.getElementById('stockAnalysisModal').classList.remove('hidden');
  document.getElementById('stockAnalysisErrorMsg').classList.add('hidden');
  document.getElementById('stockAnalysisResult').classList.add('hidden');
  document.getElementById('stockAnalysisTickerInput').value = '';
  document.getElementById('stockAnalysisAmountInput').value = '';
  hideStockAnalysisSuggestions();
  pushModalHistoryState();
  setTimeout(() => document.getElementById('stockAnalysisTickerInput').focus(), 50);
}
function closeStockAnalysisModal(viaBackButton) {
  stockAnalysisRequestToken++; // 진행 중이던 조회가 있었다면 그 응답을 무시 처리
  hideStockAnalysisSuggestions();
  document.getElementById('stockAnalysisModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('stockAnalysisBtn').addEventListener('click', () => openStockAnalysisModal());
document.getElementById('stockAnalysisSearchBtn').addEventListener('click', () => runStockAnalysis());
document.getElementById('stockAnalysisTickerInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runStockAnalysis(); });
document.getElementById('stockAnalysisAmountInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runStockAnalysis(); });
document.getElementById('stockAnalysisModalHeader').addEventListener('click', () => closeStockAnalysisModal());
document.getElementById('closeStockAnalysisModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeStockAnalysisModal();
});
document.getElementById('stockAnalysisModal').addEventListener('click', (e) => {
  if (e.target.id === 'stockAnalysisModal') closeStockAnalysisModal();
});

