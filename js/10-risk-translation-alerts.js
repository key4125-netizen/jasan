/* -------------------------------------------------------------------------
 * 18-3. [초보자용 리스크 진단] 안전 점수/신호등 + 쉬운 한글 번역 레이어
 *    - 화면에 노출되는 문구는 전부 이 구간에서 만든다. 내부 지표(베타/VaR/CVaR/Sortino/상관관계/
 *      집중도)는 computeAdvancedRiskMetrics()가 이미 실제로 계산해 둔 값을 그대로 쓰고, 여기서는
 *      "쉬운 한글 설명 + 점수 + 행동 제안"으로 옮겨 적기만 한다.
 * ---------------------------------------------------------------------- */
// [내어쓰기(Hanging Indent) 공용 헬퍼] "💡 1. ~~", "📌 시장 종합 평가 ~~"처럼 이모지/번호 접두사 뒤에
// 본문이 이어지는 문장이 모바일 좁은 화면에서 줄바꿈될 때, 예전엔 한 <p> 태그 안에 접두사+본문을
// 그대로 이어 붙여서 둘째 줄이 접두사 밑(맨 왼쪽)부터 시작해 버렸다 - flex로 접두사(shrink-0, 줄바꿈
// 없음)와 본문(자기 줄바꿈은 자기 시작 위치에 맞춰짐)을 분리해서, 둘째 줄이 첫 줄의 "본문 시작 위치"에
// 맞춰지도록 한다(내어쓰기). break-keep(word-break:keep-all)으로 "~면", "~로" 같은 조사나 "(TLT)" 같은
// 괄호 단어가 중간에서 끊기지 않게 하고, break-words(overflow-wrap:break-word)로 그래도 화면보다 긴
// 단일 토큰(에: 아주 긴 영문 티커)이 있으면 그것만 예외적으로 줄바꿈해 넘치지 않게 한다.
function hangingIndentLine(prefixHtml, textHtml, extraClass) {
  return `<div class="flex items-start gap-1.5 ${extraClass || ''}">
    <span class="shrink-0">${prefixHtml}</span>
    <span class="break-keep break-words min-w-0">${textHtml}</span>
  </div>`;
}
// [타이틀 기준 정렬 - 라벨/본문을 세로로 분리] hangingIndentLine은 라벨(prefix)과 본문을 "한 줄에
// 나란히" 놓고, 본문이 줄바꿈되면 둘째 줄이 본문 시작 위치(라벨 오른쪽)에 맞춰진다 - "💡 1. ~~"류
// 번호 매김 목록엔 맞는 동작이지만, "📌 시장 종합 평가"처럼 라벨 자체가 하나의 제목이고 그 아래
// 설명 문장이 이어지는 경우엔 사용자가 "줄바꿈된 둘째 줄이 라벨의 첫 글자(예: '시')와 같은 수직
// 선에 맞춰지길" 기대한다 - 라벨과 본문을 애초에 서로 다른 줄(세로 스택)에 두면, 본문이 몇 줄로
// 줄바꿈되든 전부 이 컨테이너의 왼쪽 여백(=라벨의 왼쪽 여백과 동일)에 자연스럽게 맞춰진다.
function stackedTitleBody(titleHtml, bodyHtml, extraClass) {
  return `<div class="${extraClass || ''}">
    <p class="font-semibold mb-0.5">${titleHtml}</p>
    <p class="break-keep break-words">${bodyHtml}</p>
  </div>`;
}
// [Sortino Ratio → 폭락장 방어 성적표 A~F] 연율화 Sortino 비율을 직관적인 학점으로 변환한다 - 학술적
// 컷오프가 아니라 일반 투자자가 감을 잡기 위한 참고용 구간이다.
// [용어 정비] Sortino는 '폭락 방어 능력'이 아니라 최근 1년 수익을 하락한 날의 흔들림으로 나눈 과거 값이다(등급 구간은 그대로).
const SORTINO_GUIDE_TEXT = '최근 1년 수익을 하락한 날의 흔들림으로 나눈 값을 A~F 참고 구간으로 나타냈습니다(A가 가장 높음). 과거 성과이며 앞으로의 하락 방어를 보장하지 않습니다.';
function sortinoToGrade(sortino) {
  if (typeof sortino !== 'number' || !Number.isFinite(sortino)) return null;
  if (sortino >= 2.0) return 'A';
  if (sortino >= 1.0) return 'B';
  if (sortino >= 0.3) return 'C';
  if (sortino >= 0) return 'D';
  if (sortino >= -0.5) return 'E';
  return 'F';
}

// [Phase 39 - 데이터 신뢰도 상태 표현] computeDataConfidence()의 점수는 그대로 두고 "표시"만 바꾼다.
// 예전엔 "분석 신뢰도 86%"라고 적어서 ①"이 진단이 86% 맞다"는 정확도로 오해되고 ②만점이 92점이라
// 100%가 나올 수 없다는 사실이 화면에 드러나지 않았다. 이제 상태 한 단어로 보여주고, 숫자와 사유는
// 옆의 [i] 툴팁에 남긴다(정보가 사라지지 않는다).
// 구간(80/50)은 새로 만든 값이 아니라 원래 이 화면이 색상을 고르던 기준을 그대로 재사용한 것이다 -
// 라벨과 색이 항상 같은 기준으로 갈리도록 여기 한 곳에서만 판정한다.
const DATA_CONFIDENCE_BANDS = [
  { min: 80, label: '데이터 충분', colorClass: 'text-emerald-500 dark:text-emerald-400' },
  { min: 50, label: '일부 데이터 부족', colorClass: 'text-amber-500 dark:text-amber-400' },
  { min: -Infinity, label: '분석 제한', colorClass: 'text-red-500 dark:text-red-400' }
];
function dataConfidenceBand(score) {
  return DATA_CONFIDENCE_BANDS.find((b) => score >= b.min);
}

// [1줄 쉬운 종합 진단] 6대 위험요인 중 점수가 가장 높은(가장 위험한) 요인 하나를 골라 그 원인을 구체
// 수치와 함께 문장으로 설명한다 - "72점입니다"가 아니라 "왜 72점인가"를 보여주는 것이 핵심.
function buildRiskDiagnosisLine(m) {
  const s = m.subScores;
  const maxKey = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  if (maxKey === 'concentration' && m.topHolding) {
    const contrib = typeof m.topHolding.riskContributionPct === 'number' ? m.topHolding.riskContributionPct : null;
    return contrib !== null
      ? `${m.topHolding.name}은(는) 비중 ${fmtNum(m.topWeight, 0)}%, 위험 기여도 ${fmtNum(contrib, 0)}%로 가장 큽니다.`
      : `${m.topHolding.name} 비중이 주식·ETF 중 ${fmtNum(m.topWeight, 0)}%로 가장 큽니다. 이 종목의 가격 움직임이 계좌 전체 등락에 크게 반영됩니다.`;
  }
  if (maxKey === 'volatility' && typeof m.portfolioVolatilityPct === 'number') {
    return `최근 1년 변동성(연환산)이 ${fmtNum(m.portfolioVolatilityPct, 1)}%로, 6개 요인 중 변동성 점수가 가장 높습니다.`;
  }
  if (maxKey === 'drawdown') {
    // [Phase 39-B] 손실 지표가 결측이면 Math.abs(null)=0 때문에 "하루 0%까지 하락"이라는 거짓 문장이
    // 만들어졌다. 이제 결측이면 숫자를 지어내지 않고 계산할 수 없다는 사실을 그대로 말한다.
    if (typeof m.var95Pct !== 'number' || typeof m.portfolioMDDPct !== 'number') {
      return '가격 이력이 부족해 하락 지표(최대낙폭·하루 하락 기준선)를 계산할 수 없습니다.';
    }
    // [용어 정비] VaR95는 최근 1년 일별 수익률 하위 약 5% 지점(과거 기록의 경계)이지 '최대 손실'이 아니다.
    // 부호가 있는 값을 그대로 보여준다(하락이면 음수로 표시된다).
    return `최근 1년 중 하락이 컸던 하위 약 5% 날의 하루 하락 기준선은 ${fmtNum(m.var95Pct, 1)}%(현재 평가액으로 약 ${fmtKRWShort(Math.abs(m.var95KRW))})였고, 같은 기간 최대낙폭(MDD)은 ${fmtNum(m.portfolioMDDPct, 1)}%였습니다.`;
  }
  if (maxKey === 'market' && typeof m.portfolioBeta === 'number') {
    // [용어 정비] 베타가 1 미만이어도 참인 정의형 문장만 쓴다("더 크게" 단정 금지).
    // [§50 · PD-15] 이 값은 **상장 시장 지수** 대비 민감도다(기초지수 추적 베타와 다른 값이다).
    return `각 종목의 기준 시장(국내는 코스피·코스닥, 미국 노출은 S&P500)이 1% 움직일 때 내 주식·ETF는 평균 약 ${fmtNum(m.portfolioBeta, 1)}% 움직였습니다(시장 민감도, 최근 1년).`;
  }
  if (maxKey === 'correlation' && m.topCorrelationPair) {
    return `비중이 큰 ${m.topCorrelationPair[0]}과(와) ${m.topCorrelationPair[1]}의 가격이 같은 방향으로 움직인 정도가 높아, 보유 종목 간 동조성(상관) 점수가 가장 높습니다.`;
  }
  if (maxKey === 'technical' && m.topHolding) {
    return '보유 종목 중 일부가 단기 과열권(RSI 70 이상)이거나 이동평균이 하락 배열이어서, 단기 과열·추세 점수가 가장 높습니다.';
  }
  // [문구 점검 P0] 예전에는 여기서 "포트폴리오가 비교적 안정적으로 분산되어 있습니다"라고 했다. 이 줄에 오는 것은
  // 점수가 가장 높은 요인을 설명할 자료가 없을 때(예: 종목이 1개라 상관 쌍이 없음)이므로 안정하다는 근거가 아니다.
  return '가장 높은 위험 요인을 한 문장으로 설명할 자료가 부족합니다. 요인별 점수는 🔍 세부내용에서 확인할 수 있습니다.';
}

// [Phase 35 - 점검 항목] 감지된 신호별로 규칙 기반 문장을 쌓는다(여러 개면 전부 보여준다).
// [행동 지시 금지] 이 앱은 매수/매도/손절/비중조절 같은 투자 행동을 사용자 대신 결정하지 않는다 -
// "지금 어떤 상태인가"와 "무엇을 함께 확인하면 되는가"까지만 알려주고, 그래서 사고팔지는 사용자가
// 정한다. 특정 종목/ETF/티커를 대안으로 제시하는 것도 금지다(예전엔 QQQM/SPYM/TLT를 직접 권했다).
// 임계치는 6대 위험요인 산정 기준과 동일선상에 있으며, 이 함수는 문자열만 만들 뿐 위험점수 계산에
// 전혀 관여하지 않는다.
function buildRiskActionItems(m) {
  const items = [];
  if (m.topWeight >= 25 && m.topHolding) {
    items.push('가장 큰 비중의 종목이 본인의 투자 계획과 맞는지 전체 자산배분과 함께 확인해 보세요.');
  }
  if (typeof m.portfolioBeta === 'number' && m.portfolioBeta >= 1.15) {
    items.push(`시장 민감도(베타)가 ${fmtNum(m.portfolioBeta, 1)}로 1보다 큽니다. 시장이 내릴 때 평가액이 시장보다 더 크게 움직였던 구조인지 자산배분과 함께 확인해 보세요.`);
  }
  if (typeof m.weightedAvgCorrelation === 'number' && m.weightedAvgCorrelation >= 0.7 && m.topCorrelationPair) {
    items.push(`${m.topCorrelationPair[0]}과(와) ${m.topCorrelationPair[1]}처럼 함께 움직인 종목이 많으면 종목 수에 비해 분산 효과가 작을 수 있습니다. 보유 목적이 겹치는지 확인해 보세요.`);
  }
  if (m.sectorExposure && m.sectorExposure.topSectorWeight >= 50 && m.sectorExposure.topSector && m.sectorExposure.topSector !== '미분류') {
    items.push(`ETF 속 구성종목까지 합치면 '${m.sectorExposure.topSector}' 섹터 노출이 ${fmtNum(m.sectorExposure.topSectorWeight, 0)}%입니다. 특정 섹터에 쏠려 있는지 함께 확인해 보세요.`);
  }
  if (items.length === 0) items.push('현재 특별한 위험 신호가 없습니다.');
  return items;
}

// [개별 종목 행동 지침 태그] RISK 관리 카드의 감지 종목 행에 붙일 짧은 한글 태그 - 어떤 조건에
// 걸렸는지에 따라 다르게 보여준다(RSI 과열/추세 이탈/52주 고점대비 급락 각각에 대응,
// 우선순위 하나만 골라 보여준다 - 자세한 근거는 [🔍 리스크 진단 보기] 상세 카드에서 전부 보여준다).
// [Phase 35] '비중 축소 검토'/'방어자산 확보 필요'는 행동을 지시하는 이름이라 점검을 뜻하는 이름으로
// 바꿨다. '단기 추세 주의'는 상태 서술이라 그대로 둔다.
// [Phase 39] '거래량 급증'이 감지 태그에서 빠지면서 '변동성 확대 주의' 분기도 함께 사라졌다
// (아래 buildIndividualRiskTags 주석 참고 - 이 분기는 도달할 수 없는 코드가 된다).
function buildAssetActionTag(tags) {
  if (tags.includes('단기 과열')) return '비중·가격 점검';
  if (tags.includes('52주 고점대비 급락')) return '낙폭 점검';
  if (tags.includes('추세 이탈')) return '단기 추세 주의';
  return null;
}

// [개별 종목 정밀 주가 분석 엔진의 판정 결과 → 태그] computeAdvancedRiskMetrics()가 이미 계산해 둔
// holding(h) 하나를 받아 RSI14 과열(70이상)/추세 이탈(20일선 아래)/52주 고점대비 급락(-30% 이하)
// 중 해당하는 태그를 전부 모은다(OR 조건). 가격 이력이 없는
// 종목(h가 없거나 hasData=false, 신규상장·API 실패 등)은 안전하게 태그 없음(안정 목록)으로 처리한다.
// [Phase 39 - 거래량 급증을 위험 신호에서 제외] 거래량 급증은 방향이 없는 신호다(급등이든 급락이든
// 똑같이 걸리고, 지수 리밸런싱일·배당락일·만기일에도 걸린다). 게다가 이 앱 스스로
// computeDataConfidence()에서 "실제 수급 데이터가 아닌 거래량 기반 추정치"라며 고정 8점을 깎고 있다 -
// 앱이 신뢰하지 않는다고 명시한 지표를 "위험 감지"로 올리는 것은 앞뒤가 맞지 않는다.
// 계산값(h.volumeSpike / h.volMA20 / h.lastVolume / h.flowSignal)은 그대로 남겨 둔다 - 종목 상세의
// 참고정보로 계속 쓰이고, 나중에 다른 형태로 노출할 여지도 남는다. 여기서는 "위험 태그로 세지 않는다"만
// 바꾼다. 위험점수는 영향을 받지 않는다: computeTechnicalFlowRiskScore(js/09)는 태그가 아니라
// rsi14/trendLabel/flowSignal만 읽으며 volumeSpike를 참조하지 않는다.
function buildIndividualRiskTags(h) {
  if (!h || !h.hasData) return [];
  const tags = [];
  if (h.rsiState === '과열') tags.push('단기 과열');
  if (h.trendLabel === '역배열(하락추세)') tags.push('추세 이탈');
  if (typeof h.week52DrawdownPct === 'number' && h.week52DrawdownPct <= -30) tags.push('52주 고점대비 급락');
  return tags;
}

// [구 3조건(지수대비 과락/매수가대비 -20%/20일선 이탈) → 신규 개별 종목 정밀 주가 분석 엔진으로 완전
// 대체] 이제 별도로 시세/지수를 다시 조회하지 않고, computeAdvancedRiskMetrics()가 이미 계산해 둔
// state.advancedRiskMetrics.holdings(포트폴리오 위험 진단과 완전히 같은 단일 데이터)에서 티커로 찾아
// 태그만 판정한다 - 중복 계산이 전혀 없다. 아직 계산 전(state.advancedRiskMetrics===null)이면 모든
// 종목이 태그 없음(안정)으로 잠시 보였다가, 계산이 끝나면 다음 렌더링에서 정상 분류된다.
// 신랑/와이프가 같은 종목을 나눠 보유해도 태그는 시세 데이터 기준(종목당 공통)이라 소유자별로 갈릴
// 일이 없다 - owners는 표시용으로만 병합한다(티커, 없으면 이름 기준 - 다른 병합 로직과 동일).
// [버그 수정 - 신랑+와이프 중복 보유 종목 미병합] 원래 이 merge key가 자산의 원본 ticker 문자열
// (a.ticker, 예: "000660"/"A000660"/"000660.KS" 등 사용자가 입력한 그대로)을 그대로 썼는데, 같은
// 종목이라도 신랑/와이프가 서로 다른 표기로 입력했으면 다른 key로 갈려서 리스크 감지 목록에 같은
// 종목이 2줄로 따로 나타나는 문제가 있었다. sanitizeTicker()로 정규화한 yahooTicker를 key로 써서
// 표기가 달라도 항상 하나로 합쳐지도록 고쳤다(항상 가구 전체 기준 - 소유자별 필터는 요청에 따라
// 완전히 제거됨).
function computeRiskClassifiedAssets() {
  const m = state.advancedRiskMetrics;
  const holdingsByTicker = new Map(((m && m.holdings) || []).map((h) => [h.ticker, h]));

  const byKey = new Map();
  riskEligibleAssets().forEach((a) => {
    const yahoo = sanitizeTicker(a.ticker).yahooTicker;
    const key = yahoo || `__name__${a.name}`;
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
  // [버그 수정 - 추세 판정 기준 통일] 6섹션 리포트의 핵심 요약(buildStockStatusSummary)과 완전히 같은
  // h.trendLabel(20/60/120일 정배열 기준, maTrendLabel)을 쓴다 - 예전엔 여기만 "현재가 vs 20일선"
  // 단순 이진 판정이라 같은 종목인데 리포트와 반대 신호(🟢인데 리포트는 🟡)를 보여주는 문제가 있었다.
  const trendPhrase = h.trendLabel === '정배열(상승추세)' ? '20·60·120일 이동평균이 상승 배열입니다.'
    : h.trendLabel === '역배열(하락추세)' ? '20·60·120일 이동평균이 하락 배열입니다.'
    : '이동평균의 방향이 섞여 있습니다.';
  // [초보자 용어] 'RSI'라는 전문용어 대신 '과열지수'(0~100, 높을수록 단기간에 너무 급하게 오른 상태)로
  // 통일해서 표현한다 - 원래 수치(h.rsi14)는 괄호 안에 그대로 남겨 숙련자도 참고할 수 있게 한다.
  const rsiPhrase = h.rsiState === '과열'
    ? `최근 14일 상승폭이 하락폭보다 크게 우세한 과열권입니다 (RSI ${fmtNum(h.rsi14, 0)}, 70 이상).`
    : h.rsiState === '과매도'
      ? `최근 14일 하락폭이 상승폭보다 크게 우세한 과매도권입니다 (RSI ${fmtNum(h.rsi14, 0)}, 30 이하).`
      : `과열권도 과매도권도 아닌 중립 구간입니다 (RSI ${typeof h.rsi14 === 'number' ? fmtNum(h.rsi14, 0) : '-'}).`;
  return `${trendPhrase} ${rsiPhrase}`;
}

// [Phase 35 - 행동 지시 금지] 예전엔 "이익을 실현하세요"/"손절 기준을 정해두세요"/"추가 매수는
// 미루세요"처럼 매매 행동을 직접 지시했고, 사용자의 실제 목표비중과 무관한 "목표 비중 15% 이하"를
// 하드코딩해 제시했다(사용자가 의도적으로 크게 담은 종목까지 줄이라고 말하는 문제). 이제 "지금 어떤
// 상태인가 + 무엇을 함께 확인하면 되는가"까지만 말한다 - 사고팔지는 사용자가 정한다.
function buildIndividualActionItem(h, weightPct) {
  if (!h || !h.hasData) return '가격 이력 데이터가 부족해 상태를 판단할 수 없습니다. 최근 상장/거래정지 종목일 수 있습니다.';
  const overweight = weightPct >= 25;
  if (overweight && h.rsiState === '과열') {
    return `단기 과열권(RSI 70 이상)이면서 계좌 내 비중도 ${fmtNum(weightPct, 1)}%로 높은 편입니다. 가격 흐름과 전체 자산배분을 함께 점검해 보세요.`;
  }
  if (overweight) {
    return `계좌 내 비중이 ${fmtNum(weightPct, 1)}%로 높은 편입니다. 이 비중이 본인의 투자 계획과 맞는지 전체 자산배분과 함께 확인해 보세요.`;
  }
  if (h.rsiState === '과열') {
    return `단기 과열권입니다 (RSI ${fmtNum(h.rsi14, 0)}, 70 이상). 짧은 기간에 가격이 크게 오른 상태라는 뜻입니다.`;
  }
  if (h.trendLabel === '역배열(하락추세)') {
    return '20·60·120일 이동평균이 하락 배열입니다. 이 종목을 담은 이유가 지금도 유효한지 함께 확인해 보세요.';
  }
  if (h.flowSignal === 'outflow') {
    return '최근 거래량이 늘면서 가격이 하락한 흐름입니다(추정). 변동이 커진 배경을 함께 살펴보세요.';
  }
  if (typeof h.week52DrawdownPct === 'number' && h.week52DrawdownPct <= -30) {
    return `52주 고점 대비 ${fmtNum(Math.abs(h.week52DrawdownPct), 0)}% 하락한 상태입니다. 시장 전체가 내린 것인지 이 종목만의 흐름인지 함께 확인해 보세요.`;
  }
  if (h.volumeSpike) {
    return '거래량이 평소보다 크게 늘었습니다. 단기 변동이 커질 수 있는 상태입니다.';
  }
  return '현재 특별한 위험 신호가 없습니다.';
}

// [추세/과열도/수급 신호등] 3개 항목을 초보자용 신호등 색+짧은 문구로 보여준다 - 각각 h.trendLabel/
// h.rsiState/h.flowSignal(거래량+가격 기반 대체 수급 지표, 국내 종목은 attachRiskDiagnosisToDetailModal이
// 렌더링 직후 KIS 실제 수급으로 다시 갱신함 - js/08 참고)에서 그대로 가져온다.
function buildIndividualSignalLightsHtml(h) {
  if (!h || !h.hasData) {
    return `<div class="grid grid-cols-3 gap-1.5 text-center">
      ${['이동평균 추세', '단기 과열(RSI)', '거래량 신호(추정)'].map((label) => `<div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2"><p class="text-sm text-slate-400">${label}</p><p class="text-sm font-semibold text-slate-400">⚪ 부족</p></div>`).join('')}
    </div>`;
  }
  // [버그 수정 - 추세 판정 기준 통일] h.trendLabel(20/60/120일 정배열 기준)을 6섹션 리포트의 핵심요약과
  // 완전히 같은 3단계로 표시한다 - 예전엔 여기만 "현재가 vs 20일선" 이진 판정(🟢/🔴 둘뿐)이라 혼조 구간도
  // 무조건 초록불로 보여, 바로 아래 리포트의 🟡(주의 필요) 판정과 어긋나 보였다.
  const trendHtml = h.trendLabel === '정배열(상승추세)' ? '🟢 상승 배열'
    : h.trendLabel === '역배열(하락추세)' ? '🔴 하락 배열'
    : '🟡 혼조';
  const rsiHtml = h.rsiState === '과열' ? '🔥 과열권' : h.rsiState === '과매도' ? '🔵 과매도권' : '🟢 중립';
  const flow = flowSignalLabel(h.flowSignal);
  return `
  <div class="grid grid-cols-3 gap-1.5 text-center">
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-sm text-slate-400">이동평균 추세</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${trendHtml}</p>
    </div>
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-sm text-slate-400">단기 과열(RSI)</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${rsiHtml}</p>
    </div>
    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2">
      <p class="text-sm text-slate-400" data-flow-tile-label>거래량 신호(추정)</p>
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200" data-flow-tile-value>${flow.emoji} ${flow.label}</p>
    </div>
  </div>`;
}

function buildIndividualRiskDetailHtml(h, weightPct) {
  /* [D-2 STEP 13] 이 종목의 베타가 **무엇 대비** 값인지 숫자 옆에 그대로 적는다 - 화면마다 기준이
   * 다를 수 있다는 오해를 없애고, 포트폴리오 합계가 서로 다른 기준의 가중평균임을 알 수 있게 한다. */
  const bmLabel = h ? benchmarkMarketLabel(h.benchmarkKey) : null;
  const betaText = h && typeof h.beta === 'number'
    ? fmtNum(h.beta, 2) + '배' + (bmLabel ? ' (' + bmLabel + ' 기준)' : '')
    : '데이터 부족';
  const sortinoText = h ? (sortinoToGrade(h.sortino) || '-') + '등급' : '-등급';
  const drawdownText = h && typeof h.week52DrawdownPct === 'number' ? fmtNum(h.week52DrawdownPct, 1) + '%' : '데이터 부족';
  const contribText = h && typeof h.riskContributionPct === 'number' ? fmtNum(h.riskContributionPct, 0) + '%' : '데이터 부족';
  return `
  <div class="mt-2.5 mb-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-3">
    <div>
      <p class="text-sm font-semibold text-slate-400 mb-1">📊 주가 및 리스크 정밀 진단</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2.5">${buildIndividualDiagnosisLine(h)}</p>
      ${h && h.exposureStructure === 'MIXED' ? `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5 break-keep flex items-start gap-1.5" data-holding-mixed-note><span class="shrink-0">🧩</span><span class="break-keep break-words min-w-0">이 상품은 한 시장만 담고 있지 않습니다(주식 + 채권 등 혼합구조). 위 시장 민감도는 ${escapeHtml(bmLabel || '기준 시장')} 하나를 기준으로 잰 값이라 상품 구조 전체를 그대로 나타내지는 않습니다.</span></p>` : ''}
      ${h && holdingDataStatusForDisplay(h) !== 'OK' ? `<p class="text-sm text-amber-700 dark:text-amber-400 leading-relaxed mb-2.5 break-keep flex items-start gap-1.5" data-holding-data-status><span class="shrink-0">📋</span><span class="break-keep break-words min-w-0">가격 기록 상태: ${escapeHtml(holdingDataStatusShortText(h))}</span></p>` : ''}
      ${h && h.priceCcy === 'USD' && (h.fxLastDate || h.fxStatus) ? `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5 break-keep" data-holding-fx-note>${h.fxLastDate
        ? `💱 변동성·손실 지표는 달러 가격과 원/달러 환율을 함께 반영한 원화 기준입니다(시장 민감도(베타)는 달러 가격 기준). <span class="whitespace-nowrap">환율 기준일: ${escapeHtml(h.fxLastDate)}</span>`
        : '💱 원/달러 환율 자료가 없어 원화 기준 변동성·손실 지표를 계산하지 않았습니다.'}</p>` : ''}
      ${buildIndividualSignalLightsHtml(h)}
    </div>
    <div>
      ${buildMetricItem('⚡ 시장 민감도(베타)', betaText, '이 종목의 기준 시장 대표지수가 1% 움직일 때 평균 약 몇 % 함께 움직였는지입니다(최근 1년, 포트폴리오 전체 값과는 별개입니다). 기준 시장은 국내 자산이면 상장 시장(코스피 상장은 코스피, 코스닥 상장은 코스닥), 미국에 경제적으로 노출된 자산이면 상장 거래소와 무관하게 S&P500입니다 - 국내에 상장된 미국 ETF도 S&P500 기준이며, 이때는 원/달러 환율을 반영한 원화 기준 지수와 비교합니다. 경제적 노출을 확인할 근거가 없는 종목은 티커나 거래소만 보고 추측하지 않고 \'데이터 부족\'으로 둡니다. 함께 있는 거래일이 120일보다 적을 때도 마찬가지입니다. 종목이 추종하는 공식 기초지수와 비교한 값은 이것과 다른 지표입니다(위험 세부내용의 「기초지수 추적 민감도」).')}
      ${buildMetricItem('하락 변동 대비 수익 (소르티노)', sortinoText, SORTINO_GUIDE_TEXT)}
      ${buildMetricItem('계좌 내 비중 (전체 자산 기준)', fmtNum(weightPct, 1) + '%', '현금·채권·부동산을 포함한 전체 자산 대비 이 종목의 평가금액 비중입니다 - "최대 종목 비중"(위험 세부내용 팝업, 주식·ETF만 기준)과는 분모가 달라 숫자가 다를 수 있습니다.')}
      ${buildMetricItem('52주 고점 대비 현재 하락률', drawdownText, '지금 가격이 최근 1년 최고가보다 얼마나 낮은지(현재 위치)입니다. 1년 중 가장 크게 떨어졌던 폭인 최대낙폭(MDD)과는 다른 값입니다.')}
      ${buildMetricItem('위험 기여도', contribText, '포트폴리오 전체 흔들림 중 이 종목이 차지하는 비율 추정입니다. 비중보다 크면 비중에 비해 계좌 등락에 더 크게 반영되고 있다는 뜻이며, 전체와 반대로 움직인 종목은 0%로 표시됩니다.')}
    </div>
    <div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2.5">
      <p class="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1">💡 함께 확인할 점</p>
      <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${buildIndividualActionItem(h, weightPct)}</p>
    </div>
  </div>`;
}

// [RISK 관리 아코디언] 리스크 감지 목록의 펼침 상태를 렌더링 사이에도 기억한다 - 5분 자동 갱신 등으로
// renderRiskSection이 반복 호출돼도 사용자가 열어/닫아 둔 상태가 되돌아가지 않게 한다. 기본값: 접힘
// (요청된 기본 상태) - 헤더를 탭해야만 펼쳐진다.
let riskyAccordionOpen = false;

function setAccordionOpen(bodyEl, chevronEl, isOpen) {
  bodyEl.style.maxHeight = isOpen ? bodyEl.scrollHeight + 'px' : '0px';
  chevronEl.classList.toggle('rotate-180', isOpen);
}

// [포트폴리오 위험 진단 & 위기 시뮬레이션] state.advancedRiskMetrics(refreshPricesAndRates에서 이미
// 계산 완료된 값)를 읽어 안전 점수/신호등/1줄 진단/행동 제안/2020년 폭락 재현 손실 추정치를 그린다.
// 데이터가 없으면(계산 전, 리스크 대상 종목 자체가 없음 등) 섹션 자체를 숨긴다.
// [6대 위험요인 막대그래프 한 줄] 라벨+(i)툴팁 / 막대 / 점수. 가독성을 위해 최소 폰트를 text-sm(12px)
// 이상으로 유지한다(작은 화면에서도 잘 읽히도록).
// [가독성] 라벨(이모지 포함)이 길어질 수 있어 라벨/점수를 한 줄에, 막대를 그 아래 별도 줄에 꽉 차게
// 배치한다 - 좁은 화면에서 라벨이 단어 중간에 어색하게 줄바꿈되는 것을 원천적으로 막는다.
function buildFactorBarRow(label, score, tooltip, unavailableText) {
  // [Phase 2-1 · R-01/R-09] 계산하지 못한 요인은 막대를 그리지 않는다 - 0%나 50%로 그리면
  // "위험이 없다/보통이다"로 읽힌다. 대신 왜 못 구했는지를 그 자리에 적는다.
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return `
  <div>
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
        ${escapeHtml(label)}
        <button type="button" data-info-tip="${escapeHtml(tooltip)}" class="tap44 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </span>
      <span class="text-sm font-semibold text-amber-600 dark:text-amber-400 shrink-0">점수 없음</span>
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep">${escapeHtml(unavailableText || '데이터 부족')} — 이 항목은 점수에 넣지 않았습니다.</p>
  </div>`;
  }
  const level = riskLevelFromScore(score);
  const widthPct = Math.max(4, Math.min(100, score));
  return `
  <div>
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
        ${escapeHtml(label)}
        <button type="button" data-info-tip="${escapeHtml(tooltip)}" class="tap44 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </span>
      <span class="text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0">${Math.round(score)}</span>
    </div>
    <span class="block h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <span class="block h-full rounded-full ${level.barClass}" style="width:${widthPct}%"></span>
    </span>
  </div>`;
}

// [정밀 수치 한 항목] 쉬운 한글 라벨 + (i) 툴팁 + 실제 계산된 숫자값.
/* [BOND-5 · §47-2] 베타가 "무엇을 설명한 값인지" 한 줄로 밝힌다.
 * 숫자만 보여 주면 사용자는 그 값이 전체 자산을 설명한다고 믿게 된다 - 실제로는 주식 노출 중
 * 베타를 구한 부분만의 평균이고, 채권은 애초에 대상이 아니다. 값을 감추는 대신 범위를 적는다. */
/* [BOND-2 · BOND-3 · §47-1] 채권 위험 카드
 *
 * 주식 위험점수(6요인)와 **합치지 않는다**. 점수화도 하지 않는다 - 주식 점수와 섞이면 두 값 모두
 * 의미를 잃는다. 채권에서 실제로 계산할 수 있는 것은 금리민감도(듀레이션 모형)이고, 신용위험은
 * 스프레드 자료가 없어 수치로 만들지 않는다(등급 · 순위 · 발행인 유형만 사실 그대로 보여 준다).
 * 듀레이션은 가격이 아니라 현금흐름 구조에서 나오므로 시장가격이 없어도 계산된다. */
function bondRiskCardHtml() {
  if (typeof computeBondRiskSummary !== 'function') return '';
  const positions = (typeof state !== 'undefined' && Array.isArray(state.bondPositions)) ? state.bondPositions : [];
  if (!positions.length) return '';
  /* [BOND-20 · §49] 거래원장에서 계산한 보유를 함께 넘긴다 - 거래 기반 채권은 이 값이
   * 가중치가 되고, 거래가 없는 legacy 수동 채권은 예전처럼 등록 당시 값을 쓴다. */
  const ledger = (typeof computePositionsAndRealizedPnL === 'function')
    ? computePositionsAndRealizedPnL().positions : null;
  /* [BOND-41 · §49] 검증을 통과한 KIS 시세가 있으면 그 시장가치로, 없으면 예전처럼 거래 기반
   * 매입원가로 가중한다. 조회는 비동기라 지금 화면에서는 이미 받아 둔 것만 쓴다 - 새로 들어오면
   * refreshBondQuotes()가 다시 그린다(렌더링이 네트워크를 기다리지 않는다). */
  const quotes = (typeof getCachedBondQuotes === 'function') ? getCachedBondQuotes() : null;
  const s = computeBondRiskSummary(positions, { positions: ledger, quotes });
  if (typeof refreshBondQuotes === 'function') refreshBondQuotes();
  if (!s || s.status !== 'OK') return '';
  const ratings = Object.entries(s.creditRatingDistribution || {}).map(([k, v]) => `${escapeHtml(k)} ${v}건`).join(' · ');
  const currencies = Object.keys(s.currencyExposure || {}).join(' · ');
  const durationLine = typeof s.weightedModifiedDuration === 'number'
    ? `평균 수정듀레이션 <b>${fmtNum(s.weightedModifiedDuration, 2)}년</b> · 시장금리가 +1.00%p(100bp) 오르면 평가금액은 약 <b>${fmtNum(s.primaryImpactPct, 1)}%</b> 움직입니다`
    : '만기일 · 표면이율이 채워진 채권이 없어 금리 민감도를 계산하지 못했습니다';
  const unavailable = (s.unavailable || []).length
    ? `<p class="text-sm text-slate-400 mt-1">계산하지 못한 채권 ${s.unavailable.length}건: ${escapeHtml(s.unavailable.map((u) => (u.name || '이름 없음') + '(' + (u.reason || '') + ')').join(' · '))}</p>`
    : '';
  return `
    <div class="mt-3.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">🧾 채권 위험 (직접보유 ${s.count}건)</p>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">${durationLine}</p>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
        신용등급 ${ratings || '미확인'}${currencies ? ' · 통화 ' + escapeHtml(currencies) : ''} · 듀레이션 계산 범위 ${fmtNum(s.durationCoveragePct, 0)}%
      </p>
      ${bondValuationSourceHtml(s)}
      ${unavailable}
      <p class="text-sm text-slate-400 mt-1.5 leading-relaxed">
        위 <b>금리 민감도(듀레이션)</b>는 시장에서 실제로 관측한 가격 변동이 아니라 <b>현금흐름 구조로 계산한 모형값</b>입니다(일수 계산 ${escapeHtml(s.dayCount)}).
        ${escapeHtml(s.creditRiskNote)} 주식 위험점수와는 다른 축이라 하나의 점수로 합치지 않습니다.
      </p>
    </div>`;
}

/* [BOND-41 · PM 지시 §13] 이 카드가 무엇으로 평가했는지 한 줄로 밝힌다.
 * 시장가로 쟀는지 매입원가로 쟀는지에 따라 같은 채권도 금액이 달라지므로, 숫자만 보여 주면
 * 사용자는 그 차이를 알 수 없다. 기존 카드 안에 한 줄만 더한다(화면 구조는 그대로). */
function bondValuationSourceHtml(s) {
  if (!s || !s.valuationSource) return '';
  const reasons = (s.rows || [])
    .filter((r) => r.valuationSource === 'PURCHASE' && r.marketUnavailableReason)
    .map((r) => r.marketUnavailableReason);
  const uniqueReason = reasons.length ? [...new Set(reasons)][0] : '';
  if (s.valuationSource === 'MARKET') {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">평가 기준: <b>시장가</b> - 지금 시장에서 매겨진 가격으로 계산했습니다(${s.marketCount}건).</p>`;
  }
  if (s.valuationSource === 'MIXED') {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">평가 기준: <b>시장가 ${s.marketCount}건 · 매입원가 ${s.purchaseCount}건</b> - 시세를 확인하지 못한 채권은 산 값으로 계산했습니다${uniqueReason ? '(' + escapeHtml(uniqueReason) + ')' : ''}.</p>`;
  }
  return `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">평가 기준: <b>매입원가</b> - 시세를 확인하지 못해 산 값으로 계산했습니다${uniqueReason ? '(' + escapeHtml(uniqueReason) + ')' : ''}.</p>`;
}

function betaCoverageNoteHtml(m) {
  if (!m || typeof m.betaCoveragePct !== 'number') return '';
  const parts = [];
  if (typeof m.portfolioBeta === 'number') parts.push(`주식 노출의 ${fmtNum(m.betaCoveragePct, 0)}%를 설명합니다`);
  else if (m.betaCoveragePct > 0) parts.push(`베타를 구한 범위가 ${fmtNum(m.betaCoveragePct, 0)}%뿐이라(기준 ${fmtNum(m.betaCoverageMinPct, 0)}% 이상) 값을 표시하지 않습니다`);
  if (m.betaMissingCount > 0) parts.push(`베타를 구하지 못한 종목 ${m.betaMissingCount}개는 제외했습니다`);
  if (typeof m.bondWeightPct === 'number' && m.bondWeightPct > 0) parts.push(`채권 비중 ${fmtNum(m.bondWeightPct, 0)}%는 베타 집계 대상이 아닙니다`);
  if (!parts.length) return '';
  return `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-2 leading-relaxed flex items-start gap-1.5"><span class="shrink-0">↳</span><span class="break-keep break-words min-w-0">${escapeHtml(parts.join(' · '))}</span></p>`;
}

function buildMetricItem(label, valueHtml, tooltip) {
  return `
  <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
    <span class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 min-w-0 leading-snug break-keep">
      ${escapeHtml(label)}
      <button type="button" data-info-tip="${escapeHtml(tooltip)}" class="tap44 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
    </span>
    <span class="text-base font-semibold text-slate-700 dark:text-slate-200 text-right shrink-0 whitespace-nowrap pl-2">${valueHtml}</span>
  </div>`;
}

// [Risk 정책 P-2 · v252] 공통 거래일 수익률이 120개 미만인 결과는 위험점수 · 등급 · 진단 대신 이 안내만 보여준다.
// dataSufficiency가 없는 예전 형태의 결과는 정상 결과로 본다(명시적으로 INSUFFICIENT일 때만 분기).
/* [Phase 2-1 · R-09/R-10] 예전에는 공통 거래일이 모자라면 화면 전체를 "계산 불가"로 덮었다.
 * 이제는 계산할 수 있는 요인으로 점수를 만들고, 못 만든 지표만 사유와 함께 보여준다.
 * 따라서 "전체 불가"는 오직 "점수를 만들 요인이 하나도 없을 때"뿐이다.
 */
function isRiskDataInsufficient(m) {
  return !!(m && (m.riskScore === null || m.riskScore === undefined));
}
// 내부 상태 코드를 그대로 화면에 내보내지 않는다 - 초보자가 읽을 수 있는 말로 바꾼다.
const RISK_DATA_STATUS_TEXT = Object.freeze({
  FETCH_FAILED: '시세를 불러오지 못했습니다',
  TICKER_INVALID: '종목 코드를 확인할 수 없습니다',
  NO_HISTORY: '가격 기록이 없습니다',
  INSUFFICIENT_HISTORY: '가격 기록이 짧습니다',
  BENCHMARK_UNRESOLVED: '기준 지수를 확인할 수 없습니다',
  INSUFFICIENT_COMMON_DATES: '가격 기록이 함께 있는 거래일이 부족합니다',
  DATA_STALE: '최근 거래 기록이 오래됐습니다',
  DATA_QUALITY_FAILED: '가격 기록에 이상이 있습니다',
  SOURCE_UNAVAILABLE: '비교할 자료가 없습니다'
});
function riskStatusText(code) {
  return RISK_DATA_STATUS_TEXT[code] || '데이터 부족';
}
// 값이 들어갈 좁은 자리(지표 한 줄)에는 짧은 말을 쓴다 - 긴 문장을 넣으면 375px에서 라벨이
// 세로로 뭉개진다(글자 크기를 줄이지 않고 문구를 줄이는 쪽으로 해결한다).
const RISK_DATA_STATUS_SHORT = Object.freeze({
  FETCH_FAILED: '시세 없음',
  TICKER_INVALID: '종목코드 확인',
  NO_HISTORY: '기록 없음',
  INSUFFICIENT_HISTORY: '기록 짧음',
  BENCHMARK_UNRESOLVED: '기준 지수 확인 필요',
  INSUFFICIENT_COMMON_DATES: '거래일 부족',
  DATA_STALE: '기록 오래됨',
  DATA_QUALITY_FAILED: '기록 이상',
  SOURCE_UNAVAILABLE: '비교 자료 없음'
});
function riskMetricUnavailableShortText(m, key) {
  const st = m && m.metricStatus ? m.metricStatus[key] : null;
  if (!st || st.status === 'AVAILABLE') return '데이터 부족';
  // [UI 마무리 ②] 포트폴리오 베타는 "포트폴리오의 기준 지수"가 아니라 종목마다 베타를 구해 합친 값이다.
  // 일부 종목의 베타를 못 구해서 비었다는 사실을 짧게 말한다(계산 · 판정은 그대로).
  if (key === 'beta' && riskBetaMissingHoldings(m).length > 0) return '일부 종목 계산 불가';
  return RISK_DATA_STATUS_SHORT[st.reason] || '데이터 부족';
}
// 지표 하나가 왜 비었는지 - 화면에 그대로 쓰는 짧은 문구.
function riskMetricUnavailableText(m, key) {
  const st = m && m.metricStatus ? m.metricStatus[key] : null;
  if (!st || st.status === 'AVAILABLE') return '데이터 부족';
  if (key === 'beta') {
    const missing = riskBetaMissingHoldings(m);
    if (missing.length > 0) {
      const total = (m.holdings || []).length;
      const allUnresolved = missing.every((h) => h.betaStatus === 'BENCHMARK_UNRESOLVED');
      const why = allUnresolved ? '비교할 기준 지수가 정해지지 않아' : '비교할 기준 지수가 없거나 함께 비교할 가격 기록이 부족해';
      return `보유 주식·ETF ${fmtNum(total, 0)}개 중 ${fmtNum(missing.length, 0)}개는 ${why} 시장 민감도를 계산하지 못했습니다. 그래서 포트폴리오 전체 값도 만들지 않았습니다.`;
    }
  }
  return riskStatusText(st.reason);
}
// 베타를 구하지 못한 종목(엔진 결과 h.beta · h.betaStatus를 그대로 읽는다).
function riskBetaMissingHoldings(m) {
  return ((m && m.holdings) || []).filter((h) => !(typeof h.beta === 'number' && Number.isFinite(h.beta)));
}
// [R-01] 점수에 반영되지 못한 요인 안내. "데이터 부족 = 위험 없음"으로 읽히지 않게 한다.
function riskExcludedFactorsNote(m) {
  const list = (m && Array.isArray(m.excludedFactors)) ? m.excludedFactors : [];
  if (!list.length) return '';
  const names = list.map((f) => escapeHtml(f.label)).join(' · ');
  return `<p class="text-sm text-amber-700 dark:text-amber-400 mt-2 leading-relaxed break-keep flex items-start gap-1.5"><span class="shrink-0">⚠️</span><span class="break-keep break-words min-w-0">데이터가 부족해 점수에 넣지 못한 항목: ${names}. 이 항목들이 안전하다는 뜻이 아니라, 아직 판단할 수 없다는 뜻입니다.</span></p>`;
}
/* [Phase 2-4 · T1] 종목 하나의 가격 기록 상태(표시용). 엔진이 정한 h.dataStatus를 그대로 쓰고,
 * 새 상태를 만들지 않는다. 단 조회는 정상(OK)이어도 조정주가 하루 변동이 통계 최소 관측 수
 * (MIN_COMMON_RISK_RETURNS)보다 적으면 기존 상태 INSUFFICIENT_HISTORY("그 지표에 필요한 관측 수보다
 * 적음")로 보여준다 - 계산에는 영향이 없다.
 */
function holdingDataStatusForDisplay(h) {
  if (!h) return null;
  const code = h.dataStatus || 'OK';
  if (code !== 'OK') return code;
  const n = Array.isArray(h.returns) ? h.returns.length : null;
  if (typeof n === 'number' && n < MIN_COMMON_RISK_RETURNS) return 'INSUFFICIENT_HISTORY';
  return 'OK';
}
function holdingDataStatusShortText(h) {
  const code = holdingDataStatusForDisplay(h);
  if (!code || code === 'OK') return '정상';
  let text = RISK_DATA_STATUS_SHORT[code] || '데이터 부족';
  if (code === 'INSUFFICIENT_HISTORY' && Array.isArray(h.returns)) text += ` (${fmtNum(h.returns.length, 0)}거래일)`;
  // [T6 후속 · Issue 1] 가격은 최신인데 H.10 환율 자료만 오래돼(OP-4) DATA_STALE이 된 경우 - 가격의 마지막
  // 날짜가 아니라 실제로 오래된 환율의 기준일을 보여준다(판정은 그대로, 표시만 구분).
  if (code === 'DATA_STALE' && h.fxStatus === 'DATA_STALE' && !(h.dataQuality && h.dataQuality.stale)) {
    return h.fxLastDate ? `환율 자료 오래됨 (환율 기준일 ${h.fxLastDate})` : '환율 자료 오래됨';
  }
  if (code === 'DATA_STALE' && h.dataQuality && h.dataQuality.lastDate) text += ` (마지막 ${h.dataQuality.lastDate})`;
  return text;
}
// 세부내용 모달: 종목별 가격 기록 상태. 문제가 있는 종목만 한 줄씩 적고, 모두 정상이면 한 줄로 끝낸다.
function riskHoldingStatusNoteHtml(m) {
  const list = (m && Array.isArray(m.holdings)) ? m.holdings : [];
  if (!list.length) return '';
  const flagged = list.filter((h) => holdingDataStatusForDisplay(h) !== 'OK');
  if (!flagged.length) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-holding-status="ok"><span class="shrink-0">📋</span><span class="break-keep break-words min-w-0">보유 주식·ETF ${fmtNum(list.length, 0)}개 모두 가격 기록을 정상적으로 받았습니다.</span></p>`;
  }
  // [T6 후속 · Issue 11-1] 종목명과 상태가 한 줄에 다 들어가지 않으면(375px + 긴 "환율 자료 오래됨 …")
  // 상태를 다음 줄로 내린다(flex-wrap) - 종목명을 말줄임으로 줄이지 않는다. 넓은 화면은 예전처럼 한 줄이다.
  const rows = flagged.map((h) => `<li class="flex flex-wrap justify-between gap-x-2" data-holding-status-row><span class="break-keep">${escapeHtml(h.name || h.ticker)}</span><span class="text-amber-700 dark:text-amber-400 break-keep">${escapeHtml(holdingDataStatusShortText(h))}</span></li>`).join('');
  return `<div data-risk-holding-status="flagged">
      <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5"><span class="shrink-0">📋</span><span class="break-keep break-words min-w-0">가격 기록 확인이 필요한 종목 ${fmtNum(flagged.length, 0)}개 (전체 ${fmtNum(list.length, 0)}개 중)</span></p>
      <ul class="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">${rows}</ul>
    </div>`;
}
// [Phase 2-4 · T2] 통계 지표가 실제로 몇 개의 관측으로 계산됐는지. 숫자는 엔진 결과(metricStatus ·
// varTailObservationCount)를 그대로 쓰고, 값이 없으면 지어내지 않는다.
/* [F-1 · PM 승인 2026-09-20] 베타를 구하지 못한 이유는 종목마다 다르다.
 * 엔진은 이미 사유를 구분해 두었는데(기준 지수 미확정 · 지수 가격 원천 없음 · 공통 거래일 부족 ·
 * 혼합 노출 · 환헤지 미확인) 화면에는 "데이터 부족"으로 뭉뚱그려 나왔다. 사용자가 무엇을 하면
 * 해결되는지가 사유마다 다르므로(원장 보완 vs 기다리기 vs 해결 불가) 그대로 구분해 적는다.
 * 계산은 건드리지 않는다 - 이미 있는 betaStatus를 읽어 표시만 한다. */
const BETA_UNAVAILABLE_TEXT = Object.freeze({
  BENCHMARK_UNRESOLVED: '비교할 기준 지수가 확정되지 않았습니다',
  SOURCE_UNAVAILABLE: '기준 지수는 확인됐지만 그 지수의 가격 자료가 없습니다',
  INSUFFICIENT_COMMON_DATES: '기준 지수와 함께 거래된 날이 부족합니다',
  DATA_STALE: '가격 자료가 오래돼 비교하지 않았습니다',
  FETCH_FAILED: '가격 자료를 불러오지 못했습니다',
  TICKER_INVALID: '종목코드를 확인하지 못했습니다',
  DATA_QUALITY_FAILED: '가격 자료의 품질 검사를 통과하지 못했습니다'
});
/* [v267] 베타를 못 구한 **구체적인 사유**를 사용자 말로 옮긴다.
 * 엔진은 예전부터 사유를 코드로 구분해 두었는데(자동화로 종류가 더 늘었다) 화면에는
 * "비교할 기준 지수가 확정되지 않았습니다" 한 줄로만 나왔다. 사유마다 사용자가 할 일이
 * 전혀 다르므로(기다리기 · 확인 불가 · 정책상 대상 아님) 그대로 구분해 적는다.
 * 여기 없는 코드는 예전처럼 betaStatus 기준 문구로 떨어진다(빈칸이 생기지 않는다). */
const BETA_UNRESOLVED_SOURCE_TEXT = Object.freeze({
  // 정책상 대상이 아닌 경우 - 사용자가 할 일이 없다
  bondAssetClass: '채권형 상품이라 주식 시장위험 집계에서 제외했습니다(금리 위험은 따로 계산하지 않습니다)',
  notEquityLike: '주식 · ETF가 아니라 시장위험 집계 대상이 아닙니다',
  // 확인할 근거가 없는 경우
  depositaryReceipt: '예탁증서(ADR·ADS)라 본국 시장과 미국 시장 중 어디에 노출됐는지 확정할 수 없습니다',
  foreignIssuerEntity: '미국에 상장됐지만 발행인이 외국 법인이라 미국 시장 노출로 단정하지 않았습니다',
  nonCommonSecurityClass: '보통주가 아닌 증권(우선주·워런트·펀드형 등)이라 시장지수와 비교하지 않았습니다',
  securityClassUnrecognized: '거래소가 표기한 증권 종류를 확정하지 못해 기준 시장을 정하지 않았습니다',
  listingDomicileUnconfirmed: '미국 상장이지만 본국 보통주인지 확인할 근거가 없습니다',
  adrListing: '예탁증서(ADR)라 시장지수 비교 대상이 아닙니다',
  foreignListedSecurity: '국내에 상장된 외국주권이라 노출 시장을 상장 시장으로 단정하지 않았습니다',
  reitExposureUnconfirmed: '부동산투자회사(리츠)라 주식 시장지수를 자동으로 붙이지 않았습니다',
  // 상품 정보가 더 필요한 경우
  etfNeedsOfficialIndex: 'ETF는 공식 기초지수가 확인돼야 기준을 정합니다(상품 정보 확인 필요)',
  mixedExposure: '주식과 채권이 섞인 상품이라 하나의 시장지수로 재지 않았습니다',
  hedgeUnconfirmed: '환헤지 여부가 공식 자료로 확인되지 않아 계산을 멈췄습니다',
  exposureIncomplete: '상품 정보가 일부 비어 있어 기준을 정하지 않았습니다',
  // 종목 정보 자체가 없는 경우
  notInInstrumentMaster: '공식 종목 정보에서 이 종목을 찾지 못했습니다(종목코드를 확인해 주세요)',
  securityGroupUnknown: '공식 종목 정보에 증권 종류가 아직 없습니다(종목 정보가 갱신되면 자동으로 계산됩니다)',
  noExchangeSecurityClass: '거래소 증권 종류 정보가 아직 없습니다(종목 정보가 갱신되면 자동으로 계산됩니다)',
  noListingInfo: '상장 시장을 확인하지 못했습니다',
  noTicker: '종목코드가 없어 시세를 비교할 수 없습니다',
  marketIndexNotAvailable: '이 거래소의 대표지수를 앱이 아직 다루지 않습니다',
  exchangeIndexNotAvailable: '이 거래소의 대표지수를 앱이 아직 다루지 않습니다',
  etfIndexNotAvailable: '이 ETF가 추종하는 지수를 앱이 아직 다루지 않습니다',
  fundLikeName: '펀드형 상품으로 보여 개별주 기준을 적용하지 않았습니다',
  exposureUnconfirmed: '경제적 노출 시장을 확인할 근거가 없습니다'
});
function betaUnresolvedSourceText(source) {
  return BETA_UNRESOLVED_SOURCE_TEXT[source] || null;
}
function betaUnavailableReasonsNoteHtml(m) {
  const list = (m && Array.isArray(m.holdings)) ? m.holdings : [];
  const flagged = list.filter((h) => h && h.betaStatus && h.betaStatus !== 'OK');
  if (!flagged.length) return '';
  const rows = flagged.map((h) => {
    /* [D2-Q1 · v267] 사유를 가장 구체적인 것부터 고른다.
     *   ① 기준 지수를 정하지 못한 이유(benchmarkSource) - 종목마다 다르고 할 일도 다르다
     *   ② 지수는 정해졌지만 계산이 안 된 이유(betaStatus) - 자료 부족 · 오래됨 등
     * ①이 있으면 ①을 쓴다. "채권은 대상이 아니다"와 "확정하지 못했다"를 구분하던 기존 취지를
     * 모든 사유로 넓힌 것이다. */
    const text = betaUnresolvedSourceText(h.benchmarkSource)
      || BETA_UNAVAILABLE_TEXT[h.betaStatus]
      || '시장 민감도를 계산하지 못했습니다';
    return `<li class="flex flex-wrap justify-between gap-x-2" data-beta-reason-row><span class="break-keep">${escapeHtml(h.name || h.ticker)}</span><span class="text-slate-500 dark:text-slate-400 break-keep">${escapeHtml(text)}</span></li>`;
  }).join('');
  return `<div data-risk-beta-reasons>
      <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5"><span class="shrink-0">⚡</span><span class="break-keep break-words min-w-0"><span class="whitespace-nowrap">시장 민감도(베타)</span>를 계산하지 못한 <span class="whitespace-nowrap">종목 ${fmtNum(flagged.length, 0)}개</span> - 이유가 서로 다릅니다.</span></p>
      <ul class="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">${rows}</ul>
    </div>`;
}

/* [D-2 STEP 13] 기준시장을 사람 말로 옮긴다. 값을 만들지 않고 이름만 붙인다.
 * Market Beta는 자산마다 **자기 시장**을 기준으로 재므로, 화면은 "무엇 대비 잰 값인지"를
 * 종목 단위로도, 합계 단위로도 말할 수 있어야 한다(단일 지수에 대한 통합 베타로 오해 방지). */
const RISK_BENCHMARK_MARKET_LABEL = Object.freeze({
  KOSPI: '코스피', KOSDAQ: '코스닥', SP500: 'S&P500', NASDAQ: '나스닥 종합', NASDAQ100: '나스닥100', DOW: '다우'
});
function benchmarkMarketLabel(key) {
  return RISK_BENCHMARK_MARKET_LABEL[key] || null;
}
/* 포트폴리오 베타에 실제로 들어간 종목만 모아 기준시장별 비중을 낸다(베타를 못 구한 종목은
 * 집계에서 빠지므로 여기서도 뺀다 - 두 숫자가 서로 다른 모집단을 말하지 않게 하기 위함이다). */
function betaBenchmarkMixHtml(m) {
  const used = (m && Array.isArray(m.holdings) ? m.holdings : []).filter((h) => typeof h.beta === 'number' && h.benchmarkKey);
  if (!used.length || typeof m.portfolioBeta !== 'number') return '';
  const sum = used.reduce((s, h) => s + (Number(h.weight) || 0), 0);
  if (!(sum > 0)) return '';
  const byKey = new Map();
  used.forEach((h) => { byKey.set(h.benchmarkKey, (byKey.get(h.benchmarkKey) || 0) + (Number(h.weight) || 0)); });
  const parts = [...byKey.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `${benchmarkMarketLabel(k) || k} ${fmtNum((w / sum) * 100, 0)}%`);
  if (parts.length <= 1) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-benchmark-mix><span class="shrink-0">🧭</span><span class="break-keep break-words min-w-0">기준시장: ${escapeHtml(parts[0])} - 집계에 들어간 종목이 모두 같은 시장 기준이라 이 값은 그 시장 하나에 대한 민감도입니다.</span></p>`;
  }
  return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-benchmark-mix><span class="shrink-0">🧭</span><span class="break-keep break-words min-w-0">기준시장 구성: ${escapeHtml(parts.join(' · '))} - 위 숫자는 하나의 지수에 대한 값이 아니라, 종목마다 <b>자기 시장</b>에 대해 잰 민감도를 보유비중대로 합친 값입니다.</span></p>`;
}
/* [F-5 · PM 승인 2026-09-20] 기준 지수의 수익 정의(PR/TR)가 확인되지 않은 종목을 밝힌다.
 * 원장에는 UNCONFIRMED로 기록돼 있는데 화면은 아무 말도 하지 않았다 - 가격지수(PR)와 총수익지수(TR)는
 * 배당만큼 다르므로, 확인되지 않았다는 사실 자체가 사용자가 알아야 할 정보다. */
function benchmarkDefinitionNoteHtml(m) {
  if (typeof resolveBenchmarkDefinitionStatus !== 'function') return '';
  const list = (m && Array.isArray(m.holdings)) ? m.holdings : [];
  const rows = [];
  list.forEach((h) => {
    /* [§50 · PD-15] PR/TR은 **공식 기초지수**의 성질이다 - 시장 지수(benchmarkKey)가 아니라
     * 추적 기준(trackingBenchmarkKey)이 확정된 종목만 대상이다. 기준을 바꾸지 않으면
     * 시장 지수만 확정된 종목까지 "배당 포함 여부 미확인"이라고 말하게 된다(없는 문제를 만든다). */
    if (!h || !h.trackingBenchmarkKey) return;
    let st;
    try { st = resolveBenchmarkDefinitionStatus(h.ticker); } catch (e) { st = null; }
    if (st && st.returnTypeStatus === 'UNCONFIRMED') rows.push(h.name || h.ticker);
  });
  if (!rows.length) return '';
  return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-benchmark-definition><span class="shrink-0">📐</span><span class="break-keep break-words min-w-0">${escapeHtml(rows.join(' · '))}은(는) 기준 지수가 배당을 포함하는지(총수익지수) 여부가 공식 자료에서 확인되지 않았습니다 - 비교 결과에 그만큼 차이가 있을 수 있습니다.</span></p>`;
}

function riskObservationBasisNote(m) {
  const st = m && m.metricStatus ? m.metricStatus.var : null;
  const obs = st && typeof st.observations === 'number' ? st.observations : null;
  if (obs === null) return '';
  const tail = typeof m.varTailObservationCount === 'number' ? m.varTailObservationCount : null;
  if (st.status === 'AVAILABLE' && tail !== null) {
    /* [C-3 · §44 제7조] 이제 지표마다 보는 기간이 다르다 - 문구도 그대로 말한다.
     * 예전 문구("변동성·최대낙폭·VaR·CVaR·상관은 최근 N거래일")는 한 기간을 전제로 했는데,
     * 그 전제가 바뀌었는데도 문구를 그대로 두면 화면이 사실과 다른 말을 하게 된다. */
    const volSt = m.metricStatus.volatility;
    const volObs = volSt && typeof volSt.observations === 'number' ? volSt.observations : null;
    const volPart = volObs !== null ? `변동성·<span class="whitespace-nowrap">시장 민감도(베타)</span>·상관은 <span class="whitespace-nowrap">최근 ${fmtNum(volObs, 0)}거래일</span>` : '변동성·시장 민감도(베타)·상관';
    return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-observation-basis><span class="shrink-0">📏</span><span class="break-keep break-words min-w-0">${volPart}, 최대낙폭·VaR·CVaR는 <span class="whitespace-nowrap">최근 ${fmtNum(obs, 0)}거래일</span>의 하루 변동으로 계산했습니다(지표마다 필요한 기간이 다릅니다). VaR·CVaR는 그중 하락이 가장 컸던 ${fmtNum(tail, 0)}일을 기준으로 합니다.</span></p>`;
  }
  const required = typeof st.required === 'number' ? st.required : null;
  return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-observation-basis><span class="shrink-0">📏</span><span class="break-keep break-words min-w-0">보유 종목이 함께 거래된 날이 ${fmtNum(obs, 0)}거래일이라${required !== null ? `, 통계 지표에 필요한 ${fmtNum(required, 0)}거래일보다 적어` : ''} 해당 지표를 계산하지 않았습니다.</span></p>`;
}
// [T6 · §44 44-15 · Phase 2-4 T3 문구 대체] 가격통화가 USD인 종목이 있을 때만 알린다. 국내 상장 해외
// ETF는 원화 가격이므로 대상이 아니다. 실제 계산 정의와 환율 기준일(엔진 결과 값)만 말한다.
function riskFxBasisNote(m) {
  const fx = m && m.fxBasis;
  if (!fx || !(fx.usdHoldingCount > 0)) return '';
  const n = fmtNum(fx.usdHoldingCount, 0);
  if (!fx.applied) {
    return `<p class="text-sm text-amber-700 dark:text-amber-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-fx-note><span class="shrink-0">💱</span><span class="break-keep break-words min-w-0">원/달러 환율 자료를 불러오지 못해, 달러로 거래되는 종목 ${n}개의 원화 기준 변동성·손실 지표를 계산하지 않았습니다.</span></p>`;
  }
  // [T6 후속 · Issue 2] "환율 기준일: 날짜"를 한 덩어리로 묶어 좁은 화면에서 날짜가 "2026-" / "09-11"로 갈라지지 않게 한다.
  const basis = fx.basisDate ? ` <span class="whitespace-nowrap">환율 기준일: ${escapeHtml(fx.basisDate)}</span> (미국 연방준비제도 H.10)` : '';
  return `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep flex items-start gap-1.5" data-risk-fx-note><span class="shrink-0">💱</span><span class="break-keep break-words min-w-0">달러로 거래되는 종목 ${n}개는 달러 가격과 원/달러 환율을 함께 반영한 원화 가치 변동으로 Risk를 계산했습니다(<span class="whitespace-nowrap">시장 민감도(베타)</span>는 달러 가격 기준).${basis}</span></p>`;
}
const RISK_INSUFFICIENT_TITLE = '포트폴리오 종합 위험점수 계산 불가 (데이터 부족)';
function riskInsufficientMessage(m) {
  const ds = (m && m.dataSufficiency) || {};
  const n = typeof ds.commonReturnCount === 'number' ? ds.commonReturnCount : 0;
  const required = typeof ds.required === 'number' ? ds.required : 120;
  return `보유 주식·ETF의 가격 기록이 함께 있는 거래일이 ${fmtNum(n, 0)}일이라, 계산에 필요한 ${fmtNum(required, 0)}일보다 적습니다. 최근 상장했거나 가격 기록을 받지 못한 종목이 있으면 이렇게 표시됩니다.`;
}
// [Risk 정책 P-4 · P-5 · v252] 스트레스 손실 추정이 없으면(벤치마크나 시장 민감도를 확인할 수 없는 종목 포함) 0원으로 보이지 않게 한다.
// [Phase 2-4 · T4] 기준 지수의 과거 하락폭 자료가 없어 못 만든 경우(SOURCE_UNAVAILABLE)는 사유를 따로 말한다.
function stressLossValueText(lossKRW, lossPct, reason) {
  if (typeof lossKRW !== 'number' || !Number.isFinite(lossKRW) || typeof lossPct !== 'number' || !Number.isFinite(lossPct)) {
    if (reason === 'SOURCE_UNAVAILABLE') return '계산할 수 없음 (기준 지수의 과거 하락폭 자료가 없는 종목 포함)';
    return '계산할 수 없음 (기준 지수나 시장 민감도를 확인할 수 없는 종목 포함)';
  }
  return `약 ${fmtKRWShort(Math.abs(lossKRW))} (${fmtNum(lossPct, 1)}%) 손실 예상`;
}

// [v254 · PM UI 정리(v253 누락분)] 메인 Risk 카드 하단의 계획 확인 안내(「이 점수는 가격 변동 위험만 봅니다 … 포트폴리오 설정에서 보기」)를
// 화면에 그리지 않는다. 이동 버튼(#riskPlanCheckBtn) 클릭 처리 코드는 그대로 두며, 다시 보이려면 이 값만 true로 바꾼다.
const RISK_SUMMARY_SHOW_PLAN_CHECK_NOTE = false;

function renderRiskDiagnosisSummary() {
  const container = document.getElementById('riskDiagnosisSummary');
  if (!container) return;
  const m = state.advancedRiskMetrics;

  if (!m) {
    container.classList.add('hidden');
    container.innerHTML = '';
    refreshRiskDetailModalIfOpen();
    return;
  }
  container.classList.remove('hidden');

  if (isRiskDataInsufficient(m)) {
    container.innerHTML = `
  <div class="rounded-xl border p-3.5 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700">
    <p class="text-lg font-bold text-slate-700 dark:text-slate-200">${RISK_INSUFFICIENT_TITLE}</p>
    <p class="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed break-keep">${escapeHtml(riskInsufficientMessage(m))}</p>
  </div>`;
    refreshRiskDetailModalIfOpen();
    return;
  }

  const score = m.riskScore;
  const level = riskLevelFromScore(score);
  const diagnosisLine = buildRiskDiagnosisLine(m);
  const actionItems = buildRiskActionItems(m);
  const conf = m.dataConfidence;
  const confBand = dataConfidenceBand(conf.score);
  // 숫자는 툴팁으로 옮긴다 - 구조적 한계(수급 추정치) 때문에 만점이 92점이라는 점까지 함께 알려야
  // "왜 100이 안 되지?"라는 오해가 생기지 않는다. 계산식(computeDataConfidence)은 건드리지 않았다.
  const confTip = `분석에 쓸 수 있는 데이터가 얼마나 충분한지 보여주는 상태입니다(위험점수와는 별개이며 점수를 왜곡하지 않습니다). 현재 데이터 충분도 ${conf.score}/100 - 수급이 추정치라는 구조적 한계 때문에 최대 92까지만 올라갑니다. ${conf.reasons.join(' · ')}`;

  container.innerHTML = `
  <div class="rounded-xl border p-3.5 ${level.bgClass}">
    <div class="flex items-start justify-between gap-2 flex-wrap">
      <!-- [PM 지시 2026-09-21] 이 점수가 포트폴리오 전체 기준임을 이름으로 분명히 하고, 바로 옆에
           「포트폴리오 위험 안내」를 여는 (i)를 둔다. 표시 명칭과 버튼만 바뀐다 - 점수 · 등급 계산식은
           건드리지 않았다. 모바일에서 점수가 줄바꿈으로 밀리지 않도록 점수 문구와 (i)를 한 덩어리로
           묶고(whitespace-nowrap) 글자만 한 단계 줄인다(375px에서 한 줄에 들어간다). -->
      <span class="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap min-w-0">
        <span class="text-base sm:text-lg font-bold ${level.colorClass} whitespace-nowrap">${level.emoji} 포트폴리오 종합 위험점수</span>
        <span class="text-base sm:text-lg font-bold ${level.colorClass} whitespace-nowrap flex items-center gap-1">${score}/100 [${level.label}]<button type="button" id="portfolioRiskInfoBtn" class="tap44 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" aria-label="포트폴리오 위험 안내 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button></span>
      </span>
      <span class="shrink-0 text-sm font-semibold ${confBand.colorClass} flex items-center gap-1 whitespace-nowrap">
        ${confBand.label}
        <button type="button" data-info-tip="${escapeHtml(confTip)}" class="tap44 text-slate-400" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </span>
      <!-- [모바일 시인성 개선] 카드 다른 곳의 "세부내용" 버튼과 같은 .detail-btn(테두리 있는 버튼 모양)
           스타일로 통일하고, ml-auto로 항상 이 줄의 맨 오른쪽 끝에 붙인다 - 분석 신뢰도 텍스트와 줄바꿈
           돼도(좁은 모바일 폭) 왼쪽 끝이 아니라 우측 끝에 자리잡는다. -->
      <button type="button" id="riskDetailBtn" class="detail-btn ml-auto">🔍 세부내용 <i data-lucide="chevron-right" class="w-3 h-3"></i></button>
    </div>
    <p class="text-base font-medium text-slate-700 dark:text-slate-200 mt-2 leading-relaxed">${diagnosisLine}</p>
    <!-- [Phase 2-1 · R-01] 점수에 반영되지 못한 위험 요인을 숨기지 않는다. 결측을 50점(보통)으로
         채우던 방식을 없앴으므로, 무엇이 빠졌는지 알려 주지 않으면 사용자가 점수를 과신하게 된다. -->
    ${riskExcludedFactorsNote(m)}
    <!-- [F2 - 메인 카드 간소화] 우선순위 지침은 최대 2개까지만 보여준다 - 나머지(있다면)는 세부내용
         모달에 전부 나열되므로 "🔍 세부내용" 버튼으로 유도한다. 6대 위험요인 막대그래프/섹터 노출
         상세는 원래도 메인 카드에 없고 세부내용 모달 전용이었다(역할 분리가 이미 되어 있던 부분). -->
    <div class="mt-2.5 space-y-1.5">
      ${actionItems.slice(0, 2).map((item, i) => hangingIndentLine(`💡 ${i + 1}.`, item, 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')).join('')}
      ${actionItems.length > 2 ? `<p class="text-sm text-slate-400">그 외 ${actionItems.length - 2}건 더 - 🔍 세부내용에서 전부 확인할 수 있습니다.</p>` : ''}
    </div>

    <!-- [Phase 39 - 가격 위험과 계획 위험의 분리] 이 위험점수는 "가격이 얼마나 흔들릴 수 있는가"만
         본다. "내가 세운 목표 자산배분에서 얼마나 벗어나 있는가"는 성격이 다른 문제라 점수에 넣지
         않는다(목표를 하나 빠뜨린 것만으로 위험점수가 오르면 안 되고, 안전한 쪽으로 벗어난 것까지
         위험으로 계산되기 때문). 그 사실을 사용자에게 한 줄로 알리고, 이미 있는 "포트폴리오 구성"
         탭으로 보내기만 한다 - 새 계산도, 새 카드도 만들지 않는다.
         경고가 아니라 안내이므로 위험 신호 목록과 시각적으로 분리한다(구분선 + 낮은 대비). -->
    ${RISK_SUMMARY_SHOW_PLAN_CHECK_NOTE ? `
    <div class="mt-2.5 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/50">
      <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
        📋 이 점수는 <span class="font-semibold">가격 변동 위험</span>만 봅니다. 목표 자산배분과 지금 비중의 차이는 별도로 확인하세요.
        <button type="button" id="riskPlanCheckBtn" class="underline underline-offset-2 font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400">포트폴리오 설정에서 보기</button>
      </p>
    </div>` : ''}

    <!-- [단기 변동성 급증 경고] 최근 20거래일 변동성이 최근 1년 평균의 1.5배 이상으로 튀었을 때만 표시된다
         (volatilitySpike, computeAdvancedRiskMetrics 참고) - 평소엔 공간을 차지하지 않는다. -->
    ${m.volatilitySpike ? `
    <div class="mt-2.5 rounded-lg bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 p-2.5">
      <p class="text-sm font-semibold text-amber-700 dark:text-amber-400">⚡ 최근 단기 변동성 급증 경고</p>
      <p class="text-sm text-amber-700/90 dark:text-amber-400/90 mt-0.5 leading-relaxed">최근 한 달 변동성(연환산 ${fmtNum(m.portfolioVolatilityShortPct, 0)}%)이 최근 1년 평균(${fmtNum(m.portfolioVolatilityPct, 0)}%)보다 1.5배 이상 커졌습니다.</p>
    </div>` : ''}
  </div>`;

  lucide.createIcons();
  refreshRiskDetailModalIfOpen();
}

// [🔍 세부내용 모달] 6대 위험요인 분해/정밀 수치/과거 폭락장 재현 시나리오/What-If 시뮬레이션 -
// 메인 RISK 카드에서 분리해 이 모달 전용 컨테이너(#riskDetailModalBody)에 그린다.
// [v253 · PM UI 정리] 세부 모달의 과거 하락장 가정 손실(2020 · 2022) 카드와 What-If(위험관리 시뮬레이션) 영역을 화면에 그리지 않는다.
// 계산(computeStressScenario · computeScenarioRiskMetrics)과 프리셋 클릭 처리 코드는 그대로 두며, 다시 보이려면 이 값만 true로 바꾼다.
const RISK_DETAIL_SHOW_STRESS_AND_WHATIF = false;

function renderRiskDetailModal() {
  const body = document.getElementById('riskDetailModalBody');
  if (!body) return;
  const m = state.advancedRiskMetrics;

  if (!m) {
    body.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">위험 분석 대상 보유 종목(주식/ETF)이 없습니다.</p>';
    return;
  }
  if (isRiskDataInsufficient(m)) {
    body.innerHTML = `
    <div class="py-4">
      <p class="text-base font-bold text-slate-700 dark:text-slate-200">${RISK_INSUFFICIENT_TITLE}</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed break-keep">${escapeHtml(riskInsufficientMessage(m))}</p>
    </div>`;
    return;
  }

  const sortinoGrade = sortinoToGrade(m.sortino) || '-';
  const excludedNote = riskExcludedFactorsNote(m);
  const s = m.subScores;
  const barsHtml = [
    buildFactorBarRow('🎯 집중도', s.concentration, '100점에 가까울수록 위험해요. 한 종목/업종에 돈이 쏠려 있으면 그 종목이 흔들릴 때 계좌 전체가 같이 흔들립니다.'),
    buildFactorBarRow('🌊 변동성', s.volatility, '100점에 가까울수록 위험해요. 내 계좌 가격이 평소에 얼마나 위아래로 크게 출렁이는지를 나타냅니다.', riskMetricUnavailableText(m, 'volatility')),
    buildFactorBarRow('📉 손실위험', s.drawdown, '100점에 가까울수록 위험해요. 최근 1년 최대낙폭(MDD)과 하락이 컸던 날들의 하루 하락폭(VaR·CVaR)을 합쳐 본 점수입니다.', riskMetricUnavailableText(m, 'mdd')),
    buildFactorBarRow('⚡ 시장위험', s.market, '100점에 가까울수록 위험해요. 기준 지수가 1% 움직일 때 내 주식·ETF가 평균 몇 % 움직였는지(시장 민감도)가 클수록 점수가 높습니다.', riskMetricUnavailableText(m, 'beta')),
    buildFactorBarRow('🔗 상관관계', s.correlation, '100점에 가까울수록 위험해요. 종목은 여러 개인데 실제로는 다 같이 오르고 같이 빠지면 분산 효과가 없다는 뜻입니다.', riskMetricUnavailableText(m, 'correlation')),
    buildFactorBarRow('🔥 단기 과열·거래량(추정)', s.technical, '100점에 가까울수록 위험해요. 보유 종목의 단기 과열 지표(RSI), 이동평균 하락 배열, 거래량 기반 추정 신호를 합친 점수입니다.', '단기 지표를 만들 가격 기록이 부족합니다')
  ].join('');

  // [F2 - 세부내용 모달로 이관] 메인 카드는 우선순위 지침 최대 2개만 보여주므로, 전체 목록은 여기서
  // 빠짐없이 보여준다(buildRiskActionItems는 메인 카드와 완전히 같은 계산 결과를 재사용 - 중복 계산 없음).
  const actionItems = buildRiskActionItems(m);
  const actionItemsHtml = actionItems.length ? `
    <div class="mb-3.5 space-y-1.5">
      ${actionItems.map((item, i) => hangingIndentLine(`💡 ${i + 1}.`, item, 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')).join('')}
    </div>` : '';

  body.innerHTML = `
    ${excludedNote ? `<div class="mb-3">${excludedNote}</div>` : ''}
    ${actionItemsHtml}
    <!-- [6대 위험요인 분해] -->
    <div class="space-y-3">${barsHtml}</div>

    <!-- [정밀 수치] 쉬운 한글 + (i) 툴팁 - 라벨이 길어 2열 그리드 대신 한 줄씩 나열한다(가독성). -->
    <div class="mt-3.5">
      ${buildMetricItem('⚡ 포트폴리오 시장 민감도(베타)', typeof m.portfolioBeta === 'number' ? fmtNum(m.portfolioBeta, 2) + '배' : riskMetricUnavailableShortText(m, 'beta'), '각 종목을 자기 시장의 대표지수와 비교해 구한 민감도를, 보유비중대로 합친 값입니다. 기준 시장은 국내 자산이면 상장 시장(코스피 상장 → 코스피, 코스닥 상장 → 코스닥), 미국에 경제적으로 노출된 자산이면 상장 거래소와 무관하게 S&P500입니다 - 국내에 상장된 미국 ETF도 S&P500 기준입니다. 그래서 이 값은 어느 지수 하나에 대한 통합 베타가 아니라 서로 다른 기준의 가중평균이며, 어떤 기준이 얼마나 섞였는지는 바로 아래 「기준시장 구성」에 있습니다. 1보다 크면 그 시장보다 크게, 작으면 작게 움직였다는 뜻이며, 가격의 출렁임 자체(변동성)와는 다른 값입니다. 위험점수의 「시장위험」은 이 값만 씁니다. 종목이 추종하는 공식 기초지수와 비교한 값은 아래 「기초지수 추적 민감도」에 따로 있습니다 - 지수를 그대로 따라가는 ETF는 그 값이 1 근처로 나오는 것이 정상이라, 시장위험과 같은 뜻이 아닙니다. 베타를 구하지 못한 종목은 남은 종목에 얹지 않고 빼며, 아래 "설명 범위"가 그 사실을 말해 줍니다. 채권·현금·부동산은 집계 대상이 아닙니다.')}
      ${betaBenchmarkMixHtml(m)}
      ${betaCoverageNoteHtml(m)}
      ${buildMetricItem('🧭 기초지수 추적 민감도', typeof m.portfolioTrackingBeta === 'number' ? fmtNum(m.portfolioTrackingBeta, 2) + '배' : '자료 없음', '각 종목이 자기 공식 기초지수를 1% 움직임당 얼마나 따라갔는지를 비중대로 합친 값입니다(표시 전용 - 위험점수에는 들어가지 않습니다). 지수를 그대로 복제하는 ETF는 1에 가깝게 나오는 것이 정상이고, 1에서 멀어지면 환노출·시차·부분복제 같은 구조 차이를 살펴볼 신호입니다. 다만 이 값 하나로 추적 품질을 판정할 수는 없습니다 - 추적오차(잔차의 크기)는 별개의 지표입니다. 개별 주식도 이 값에 함께 들어갑니다 - 따라갈 상품이 없는 대신 원장이 정해 둔 지수(국내 개별주는 상장 시장 지수, 해외 개별주는 원장에 적힌 지수)와 비교하므로, 이 숫자를 ETF만의 추적 품질로 읽으면 안 됩니다. 국내에 상장된 해외 지수 ETF처럼 우리 시장이 닫힌 뒤에 기준 지수가 움직이는 경우에는 같은 날과 그 다음 날의 반응을 함께 더해(시차 0 + 1) 계산합니다.')}
      ${buildMetricItem('🎯 최대 종목 비중 (주식·ETF 기준)', fmtNum(m.topWeight, 0) + '% (' + escapeHtml(m.topHolding ? m.topHolding.name : '-') + ')', '주식·ETF 보유분만을 기준으로(현금·채권·부동산 제외) 특정 종목 하나에 얼마나 쏠려 있는지 보여줍니다 - 종목 상세의 "계좌 내 비중"(전체 자산 기준)과는 분모가 달라 숫자가 다를 수 있습니다.')}
      ${buildMetricItem('📉 하루 하락 기준선 (VaR 95%)', typeof m.var95KRW === 'number' ? fmtKRWShort(Math.abs(m.var95KRW)) : riskMetricUnavailableShortText(m, 'var'), '최근 1년 중 하루 하락이 컸던 하위 약 5% 날의 경계를 현재 평가액에 적용한 금액입니다. 약 20거래일에 하루꼴로 이보다 크게 떨어진 날이 있었다는 뜻이며, 최대 손실이 아닙니다.')}
      ${buildMetricItem('📉 하락이 컸던 날 평균 (CVaR 95%)', typeof m.cvarKRW === 'number' ? fmtKRWShort(Math.abs(m.cvarKRW)) : riskMetricUnavailableShortText(m, 'cvar'), '위 기준선과 같거나 더 크게 떨어진 날들(최근 1년 하위 약 5%)의 하루 평균 하락폭을 현재 평가액에 적용한 금액입니다. 특정 위기 상황의 손실이 아닙니다.')}
      ${buildMetricItem('하락 변동 대비 수익 (소르티노)', sortinoGrade + '등급', SORTINO_GUIDE_TEXT)}
      ${buildMetricItem('🔗 보유 종목 간 동조성 (상관)', typeof m.weightedAvgCorrelation === 'number' ? (m.weightedAvgCorrelation >= 0.7 ? '매우 높음' : m.weightedAvgCorrelation >= 0.5 ? '높음' : m.weightedAvgCorrelation >= 0.3 ? '보통' : '낮음') : riskMetricUnavailableShortText(m, 'correlation'), '보유 종목들의 가격이 같은 방향으로 움직인 정도를 비중을 반영해 평균낸 값입니다(최근 1년). 높을수록 여러 종목을 담아도 함께 오르내린 경우가 많았다는 뜻입니다.')}
    </div>
    ${bondRiskCardHtml()}
    <!-- [Phase 2-4 · T1~T3] 계산 기준과 한계 - 관측 수 · 종목별 가격 기록 상태 · 환율 미포함.
         새 카드가 아니라 정밀 수치 바로 아래에 같은 글자 크기의 설명 문단으로만 붙인다. -->
    <div class="mt-2.5 space-y-2" data-risk-basis-notes>
      ${riskObservationBasisNote(m)}
      ${riskHoldingStatusNoteHtml(m)}
      ${betaUnavailableReasonsNoteHtml(m)}
      ${benchmarkDefinitionNoteHtml(m)}
      ${riskFxBasisNote(m)}
    </div>
    ${m.sectorExposure && m.sectorExposure.topSector && m.sectorExposure.topSector !== '미분류' ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-2.5 flex items-start gap-1.5"><span class="shrink-0">🏭</span><span class="break-keep break-words min-w-0">(ETF 속 구성종목 포함) 최다 노출 섹터: <b>${escapeHtml(m.sectorExposure.topSector)}</b> ${fmtNum(m.sectorExposure.topSectorWeight, 0)}%</span></p>` : ''}

    <!-- [역사적 하락장 체험하기] 2020 코로나(짧고 강한 급락) + 2022 고금리(길게 이어진 약세장) 두 시나리오
         - 모바일(375px)에서도 카드가 잘리지 않도록 grid-cols-1로 세로로 쌓고, sm 이상에서만 2열로
         나란히 배치한다. [용어 정비] '재현'이 아니라 과거 지수 하락폭 × 베타로 계산한 가정 손실(추정)임을 밝힌다. -->
    ${RISK_DETAIL_SHOW_STRESS_AND_WHATIF ? `
    <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div class="rounded-lg bg-white/70 dark:bg-black/20 p-3 min-w-0">
        <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">📉 2020년 초 급락 가정 시 (추정)</p>
        <p class="text-lg sm:text-xl font-bold text-blue-500 dark:text-blue-400 break-keep">${escapeHtml(stressLossValueText(m.stressLossKRW, m.stressLossPct, m.stressStatus && m.stressStatus.covid2020))}</p>
        <p class="text-sm text-slate-400 mt-1 leading-relaxed">* 2020년 2~3월 기준 지수 하락폭(코스피 -35.7%·S&P500 -33.9% 등)에 종목별 시장 민감도를 곱해 계산한 추정 손실입니다. 국내에 상장된 미국 ETF는 베타를 원화 기준으로 재므로 하락폭도 같은 원화 기준 값(S&P500 -29.9%)을 씁니다. 그 사건이 다시 일어난다는 뜻이 아니며, 하루 하락 지표(VaR·CVaR)와는 다른 가정 계산입니다.</p>
      </div>
      <div class="rounded-lg bg-white/70 dark:bg-black/20 p-3 min-w-0">
        <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">📉 2022년 금리 인상기 하락 가정 시 (추정)</p>
        <p class="text-lg sm:text-xl font-bold text-orange-500 break-keep">${escapeHtml(stressLossValueText(m.stressLossKRW2022, m.stressLossPct2022, m.stressStatus && m.stressStatus.rateHike2022))}</p>
        <p class="text-sm text-slate-400 mt-1 leading-relaxed">* 2022년 고점→저점 기준 지수 하락폭(코스피 -28.6%·나스닥100 -35.1% 등)에 종목별 시장 민감도를 곱해 계산한 추정 손실입니다.</p>
      </div>
    </div>` : ''}

    <!-- [What-If 리밸런싱 시뮬레이션] -->
    ${RISK_DETAIL_SHOW_STRESS_AND_WHATIF && m.topHolding ? `
    <div class="mt-3 rounded-lg bg-white/70 dark:bg-black/20 p-3" id="whatIfSimBox" data-top-ticker="${escapeHtml(m.topHolding.ticker)}">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
        💡 위험관리 시뮬레이션(What-If)
        <button type="button" data-info-tip="실제 매도 지시가 아니라, 비중을 조정하면 위험점수가 어떻게 바뀌는지 미리 계산해 보는 기능입니다." class="tap44 text-slate-400" aria-label="설명 보기"><i data-lucide="info" class="w-3.5 h-3.5"></i></button>
      </p>
      <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">${escapeHtml(m.topHolding.name)} 비중을 조절하면?</p>
      <div class="flex gap-1.5 mb-2.5">
        ${['aggressive', 'balanced', 'conservative'].map((key) => {
          const label = key === 'aggressive' ? '공격적' : key === 'balanced' ? '균형' : '보수적';
          const targetPct = key === 'aggressive' ? Math.max(5, m.topWeight - 15) : key === 'balanced' ? Math.max(5, m.topWeight * 0.55) : Math.min(15, m.topWeight);
          return `<button type="button" data-scenario-preset="${key}" data-target-pct="${targetPct.toFixed(1)}" class="flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700">${label} ${fmtNum(targetPct, 0)}%</button>`;
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

/* [PM 지시 2026-09-21] 「포트폴리오 위험 안내」 - 이 점수가 무엇을 뜻하는지만 설명한다.
 * 실제 계산 수치는 openRiskDetailModal(🔍 세부내용)이 담당한다 - 역할을 합치지 않는다. */
function openPortfolioRiskInfoModal() {
  document.getElementById('portfolioRiskInfoModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closePortfolioRiskInfoModal(viaBackButton) {
  document.getElementById('portfolioRiskInfoModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
// 점수 헤드라인은 매번 innerHTML로 다시 그려지므로 위임으로 받는다(버튼에 직접 걸면 사라진다).
document.addEventListener('click', (e) => {
  if (e.target.closest('#portfolioRiskInfoBtn')) { e.stopPropagation(); openPortfolioRiskInfoModal(); }
});
document.getElementById('closePortfolioRiskInfoBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closePortfolioRiskInfoModal();
});
document.getElementById('portfolioRiskInfoModal').addEventListener('click', (e) => {
  if (e.target.id === 'portfolioRiskInfoModal') closePortfolioRiskInfoModal();
});

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
  // [Phase 39] "계획은 따로 확인하세요" 안내의 이동 버튼 - riskAlertRebalanceBtn과 완전히 같은
  // 이동 경로를 재사용한다(새 화면/새 계산 없음). 이 카드는 매 렌더링마다 innerHTML로 다시 그려지므로
  // 위 riskDetailBtn과 동일하게 document 위임으로 잡는다.
  if (e.target.closest('#riskPlanCheckBtn')) {
    switchTab('rebalance');
    switchRebalanceSubTab('target');
  }
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
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-scenario-preset]');
  if (!btn) return;
  const box = document.getElementById('whatIfSimBox');
  const m = state.advancedRiskMetrics;
  // [Risk 정책 P-2 · v252 → Phase 2-1] 판정 기준을 엔진과 공유한다(canComputeScenarioRisk) -
  // 화면이 따로 데이터 부족을 판단하지 않게 해 두 곳의 기준이 어긋나는 일을 막는다.
  if (!box || !m || !m.topHolding || !canComputeScenarioRisk(m)) return;
  const targetPct = parseFloat(btn.dataset.targetPct);
  const scenario = computeScenarioRiskMetrics(m, { [box.dataset.topTicker]: targetPct / 100 });
  if (!scenario) return;
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
      <span class="text-sm font-semibold ${delta <= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${delta <= 0 ? '▼' : '▲'}${Math.abs(Math.round(delta))}</span>
      <span class="text-sm text-slate-500 dark:text-slate-400">${afterLevel.emoji} ${afterLevel.label}</span>
    </div>
    <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
      <div>변동성: ${fmtNum(m.portfolioVolatilityPct, 1)}% → ${fmtNum(scenario.portfolioVolatilityPct, 1)}%</div>
      <div>최대낙폭: ${fmtNum(m.portfolioMDDPct, 1)}% → ${fmtNum(scenario.portfolioMDDPct, 1)}%</div>
    </div>
    <p class="text-sm text-slate-400 mt-2 leading-relaxed">* 실제 매매 지시가 아닌 추정 시뮬레이션이며, 과거 변동성·상관관계 구조가 유지된다고 가정합니다.</p>`;
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
// [지표 상세 팝업 - 핵심종목 팝업과 통일] 예전엔 이 타일이 data-macro-key로 전용 팝업(openMacroDetailModal,
// #macroDetailModal)을 열었는데, 핵심종목 실시간 팝업에서 지수를 클릭했을 때 뜨는 팝업(종목 상세
// 모달 #assetDetailModal의 읽기전용 변형 - openStockDetailModal, js/08)과 모양·크기·구조가 서로 달라
// 일관성이 없다는 지적이 있었다. data-open-stock-detail data-ticker/data-name으로 바꿔서 문서 전역의
// 그 위임 리스너를 그대로 태우면, attachStockAnalysisReportToDetailModal(js/08)이 getMacroKeyForTicker로
// 이 티커가 매크로 지표임을 감지해 완전히 같은 지표 콘텐츠(buildMacroDetailBodyHtml)를 완전히 같은
// 팝업(assetDetailModal) 안에 보여준다 - 두 진입 경로(핵심종목 팝업/매크로 브리핑)가 이제 정확히
// 하나의 팝업을 공유한다. MARKET_INDEX_LIST(코스피/코스닥/S&P500/나스닥 4개)에 없는 지표(VIX/환율/
// 미국채 10년물)도 MACRO_KEY_TICKERS에만 등록돼 있으면 getMacroKeyForTicker가 그대로 인식하므로 별도
// 예외 처리 없이 동일하게 동작한다. 전용 팝업(openMacroDetailModal 등)은 이제 아무도 열지 않는 죽은
// 코드가 되어 함께 제거했다.
// [열 수는 항상 4로 고정 - 답답함은 패딩/폰트로 해결] grid-cols-4가 모든 화면에서 예외 없이
// 적용되므로(index.html), 좁은 화면에서 답답해 보이는 문제를 열 수를 줄이는 대신 카드 내부 패딩과
// 글자 크기로 대응한다. md:(768px)부터 태블릿 세로를 포함한 모든 비-폰 화면에 동일하게 적용된다 -
// 이전엔 lg:(1024px)부터만 적용돼 768~1023px 태블릿 세로가 폰과 똑같이 빽빽했다.
function macroTileHtml(key, label, valueText, sub, icon) {
  const ticker = MACRO_KEY_TICKERS[key];
  return `
  <div class="macro-card rounded-lg border border-slate-100 dark:border-slate-800 px-1 sm:px-1.5 md:px-2 py-2 md:py-2.5 text-center cursor-pointer transition-all hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm hover:-translate-y-0.5"
    data-open-stock-detail data-ticker="${escapeHtml(ticker)}" data-name="${escapeHtml(label)}">
    <div class="text-sm md:text-sm text-slate-400 truncate">${escapeHtml(label)}</div>
    <div class="text-base md:text-lg leading-tight my-0.5">${icon}</div>
    <div class="text-sm md:text-sm font-semibold truncate">${escapeHtml(valueText)}</div>
    <div class="text-sm text-slate-400 truncate">${escapeHtml(sub)}</div>
  </div>`;
}
// [맞춤형 연계 진단] 원/달러 환율 방향 × 내 포트폴리오의 외화(달러) 자산 비중을 엮어 한 줄로 설명한다.
// [매크로 종합 해설] VIX/환율/미10년물/코스피 4개 신호를 규칙 기반으로 조합해 "핵심 원인 → 내
// 포트폴리오 영향 → 대응 가이드" 3단으로 설명한다 - buildRiskDiagnosisLine/buildRiskActionItems와
// 같은 우선순위 규칙 패턴(더 구체적이거나 심각한 조합을 먼저 검사하고, 해당하는 첫 규칙만 채택).
// 방향 판정 임계값(±0.05%)은 trendArrowIcon과 동일해 지표별 화살표 아이콘과 해설 문구의 방향이
// 항상 일치한다.
// [Phase 35 - 결측을 정상으로 표시하지 않는다] 아래 규칙들은 전부 `typeof === 'number'`를 요구해서,
// 데이터를 하나도 못 받아온 상태에서도 전부 통과해 마지막 기본값("특별한 쏠림 없이 평이한 흐름")으로
// 떨어졌다 - 조회 실패를 "시장이 조용하다"로 읽히게 만드는 문제였다. 이제 핵심 지표의 결측 여부를
// 먼저 판정해 ①전부 결측 ②일부 결측 ③정상을 구분한다. 일부만 없을 때는 확인된 지표로 판정되는
// 규칙은 그대로 살린다(결측 하나 때문에 아는 정보까지 숨기지 않는다).
const CORE_MACRO_LABELS = { vix: 'VIX', fxChangePct: '원/달러', ust10yChangePct: '미 10년물', kospiChangePct: '코스피' };
function missingCoreMacroLabels(input) {
  return Object.keys(CORE_MACRO_LABELS)
    .filter((k) => typeof input[k] !== 'number' || !Number.isFinite(input[k]))
    .map((k) => CORE_MACRO_LABELS[k]);
}
// [Phase 35 - 행동 지시 금지] 세 번째 칸은 예전엔 "대응 가이드"로 관망/분할매수/환전 시점 같은 매매
// 타이밍을 지시했다. 매크로 브리핑의 역할은 "지금 무엇을 해야 하는가"가 아니라 "지금 시장이 어떤
// 상태인가"이므로, 이제 상태를 한 줄 더 설명하는 note로만 쓴다(사고팔라는 결론은 담지 않는다).
function buildMacroCommentary(input) {
  const { vix, fxChangePct, ust10yChangePct, kospiChangePct, goldChangePct, usdxChangePct, foreignWeightPct } = input;
  const missingLabels = missingCoreMacroLabels(input);
  if (missingLabels.length === Object.keys(CORE_MACRO_LABELS).length) {
    return {
      cause: '현재 시장 데이터를 확인할 수 없어 시장현황을 표시하기 어렵습니다.',
      impact: '지표를 받아오지 못한 상태라 포트폴리오 영향도 판단할 수 없습니다.',
      note: '시세·환율이 다시 조회되면 이 자리에 시장 상태가 표시됩니다.'
    };
  }
  const isUp = (v) => typeof v === 'number' && v > 0.05;
  const isDown = (v) => typeof v === 'number' && v < -0.05;
  // [달러인덱스 - 더 높은 임계값] 평소 변동폭이 환율/지수보다 훨씬 작은 지표라(MACRO_TREND_THRESHOLDS
  // 참고, 일간 ±0.05% 정도는 흔한 잡음) "강달러/약달러 국면"이라 부를 만한 뚜렷한 하루 변동만 걸러낸다.
  const isStrongUp = (v) => typeof v === 'number' && v > 0.5;
  const isStrongDown = (v) => typeof v === 'number' && v < -0.5;
  const fw = typeof foreignWeightPct === 'number' ? fmtNum(foreignWeightPct, 0) : null;

  if (typeof vix === 'number' && vix >= 30) {
    return {
      cause: `VIX가 ${fmtNum(vix, 1)}로 30 이상인 구간입니다. 시장이 큰 등락을 예상하고 있는 상태입니다.`,
      impact: '주식 비중이 높을수록 단기 등락폭이 커질 수 있어 계좌 변동성이 확대될 수 있습니다.',
      note: '변동성이 큰 구간에서는 같은 자산이라도 평소보다 평가액 등락이 크게 나타납니다.'
    };
  }
  // [금 시세 반영] 금가 급등(+1.5% 이상)이 VIX 상승(20 이상, 평소보다 경계심이 높아진 수준)과 함께
  // 나타나면 대표적인 "안전자산 선호(flight to safety)" 국면 - 위 VIX 30 이상(고변동성 긴급 국면)
  // 규칙 바로 다음 우선순위로 검사한다.
  if (typeof goldChangePct === 'number' && goldChangePct >= 1.5 && typeof vix === 'number' && vix >= 20) {
    return {
      cause: `오늘 금값이 ${goldChangePct >= 0 ? '+' : ''}${fmtNum(goldChangePct, 2)}% 오르고 VIX도 ${fmtNum(vix, 1)}로 20 이상입니다. 이런 조합은 안전자산 수요가 늘 때 자주 나타나지만, 하루 움직임만으로 단정할 수는 없습니다.`,
      impact: '위험자산(주식) 비중이 높은 계좌는 단기 변동성이 커질 수 있는 국면입니다.',
      note: '안전자산 선호가 강해질 때 나타나는 전형적인 흐름입니다.'
    };
  }
  // [달러인덱스 반영] 강달러/약달러 국면은 원/달러 환율·위험자산 심리에 직접 영향을 주는 독립적인
  // 신호라, 환율+금리 조합 규칙보다 먼저 검사한다(더 직접적인 원인 지표이므로 우선순위를 높게 둔다).
  if (isStrongUp(usdxChangePct)) {
    return {
      cause: `오늘 달러인덱스가 ${usdxChangePct >= 0 ? '+' : ''}${fmtNum(usdxChangePct, 2)}% 올라 달러 강세 방향으로 움직였습니다.`,
      impact: '원/달러 환율 상승 압박과 글로벌 유동성 긴축 신호로, 국내 증시·신흥국 자산에는 부담 요인이 될 수 있습니다.',
      note: '달러 강세 방향일 때는 달러 자산과 원화 자산의 평가액이 서로 다른 방향으로 움직일 수 있습니다.'
    };
  }
  if (isStrongDown(usdxChangePct)) {
    return {
      cause: `오늘 달러인덱스가 ${fmtNum(usdxChangePct, 2)}% 내려 달러 약세 방향으로 움직였습니다.`,
      impact: '달러 약세는 원화 자산과 위험자산(주식)에 유리하게 작용하는 경우가 많습니다.',
      note: '위험자산 선호가 회복될 때 나타나는 흐름입니다.'
    };
  }
  if (isUp(ust10yChangePct) && isUp(fxChangePct)) {
    return {
      cause: '미국 금리와 원/달러 환율이 동반 상승 중입니다.',
      impact: fw !== null
        ? `환율이 오르면 달러 자산(전체의 ${fw}%)의 원화 평가액은 늘어나는 방향이며, 국내 증시는 외국인 자금 흐름에 따라 등락이 커지는 경우가 있습니다.`
        : '환율이 오르면 달러 자산의 원화 평가액은 늘어나는 방향이며, 국내 증시는 외국인 자금 흐름에 따라 등락이 커지는 경우가 있습니다.',
      note: '금리와 환율이 함께 오르면 달러 자산과 국내 자산의 평가액이 서로 다르게 움직이는 경향이 있습니다.'
    };
  }
  if (isDown(ust10yChangePct) && isUp(kospiChangePct)) {
    return {
      cause: '오늘 미국 금리가 내리고 코스피가 올랐습니다.',
      impact: '금리 부담이 줄어드는 날에는 국내 주식이 함께 오르는 경우가 많습니다.',
      note: '금리 부담이 줄어들 때 국내 위험자산에 나타나는 흐름입니다.'
    };
  }
  if (isDown(fxChangePct) && isUp(kospiChangePct)) {
    return {
      cause: '오늘 원화가 강세 방향으로 움직이고 코스피가 올랐습니다.',
      impact: '달러 자산 평가액은 다소 줄어들 수 있으나, 국내 자산 비중에는 긍정적입니다.',
      note: '원화 강세 구간에서는 달러 자산의 원화 평가액이 줄어드는 방향으로 작용합니다.'
    };
  }
  if (isDown(kospiChangePct) && typeof vix === 'number' && vix >= 20) {
    return {
      cause: '국내 증시가 조정을 받고 있고 시장 불안 심리도 다소 높아진 상태입니다.',
      impact: '지수 하락과 불안 지표 상승이 함께 나타나 단기 등락이 커질 수 있는 구간입니다.',
      note: '지수 조정과 불안 심리가 함께 나타나는 구간입니다.'
    };
  }
  if (missingLabels.length > 0) {
    return {
      cause: `일부 시장 데이터(${missingLabels.join('·')})를 확인할 수 없어 종합적인 시장 판단은 제한적입니다.`,
      impact: '확인된 지표만으로는 포트폴리오 영향까지 판단하기 어렵습니다.',
      note: '위 지표 카드에서 조회에 성공한 항목의 값은 그대로 확인할 수 있습니다.'
    };
  }
  return {
    cause: 'VIX·환율·금리·지수 모두 특별한 쏠림 없이 대체로 평이한 흐름입니다.',
    impact: '포트폴리오에 미치는 특별한 매크로 압력은 없는 편입니다.',
    note: '특정 방향으로 뚜렷하게 쏠린 지표는 없습니다.'
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
    // [Phase 35] 환율을 모르는 상태에서 "다르게 움직이고 있어요"라고 단정하면 결측이 관측 결과처럼 읽힌다.
    if (typeof fxChangePct !== 'number' || !Number.isFinite(fxChangePct)) {
      note = '지금은 환율 데이터를 확인할 수 없어 이 방향과 실제로 같이 움직이는지는 비교하기 어려워요.';
    } else {
      const fxMatches = rateUp ? fxChangePct > 0.05 : fxChangePct < -0.05;
      note = fxMatches
        ? '지금은 환율도 이 교과서적인 방향과 같이 움직이고 있어요.'
        : '다만 지금 환율은 이 방향과 다르게 움직이고 있어요 - 금리 외에 다른 요인(수급, 지정학 이슈 등)이 더 크게 작용하고 있을 수 있어요.';
    }
  } else {
    note = '지금은 금리 변동이 크지 않아 이 관계가 뚜렷하게 나타나지 않는 구간이에요.';
  }
  return { lines, note };
}

/* -------------------------------------------------------------------------
 * 18-6. [매크로 브리핑 - 지표 상세 설명 팝업] 9개 타일을 눌렀을 때 "이 지표가 뭔지 + 지금 수치가
 *    뭘 뜻하는지 + 뭘 지켜봐야 하는지"를 보여준다. 개념/관전포인트는 고정 텍스트(초보자용 정의라
 *    실시간으로 바뀔 이유가 없음), 현재값·등락·동향 해설만 renderMacroBriefing()이 매 갱신마다
 *    채워두는 macroDetailSnapshot을 읽어 동적으로 만든다. buildMacroCommentary/buildAssetCorrelation
 *    Guide와 마찬가지로 "지금 상태를 설명"까지만 하고 매수/매도 판단은 담지 않는다.
 * ---------------------------------------------------------------------- */
const MACRO_INDICATOR_INFO = {
  vix: {
    label: 'VIX (변동성 지수)',
    concept: "미국 S&P 500 옵션 가격으로 계산한, 시장이 예상하는 향후 30일 변동성 지수예요. 흔히 '공포지수'라고 불려요. 낮을수록 시장이 큰 등락을 덜 예상하고, 높을수록 큰 등락을 더 예상한다는 뜻이에요.",
    watchPoints: [
      'VIX는 짧게 튀었다가 가라앉는 경우가 많아, 하루 값보다 5일·20일 흐름을 함께 보는 것이 좋아요.',
      'VIX가 급등하면 주식 비중이 높은 계좌일수록 단기 등락폭이 커질 수 있어요.'
    ]
  },
  usdkrw: {
    label: '원/달러 환율',
    concept: '1달러를 사는 데 필요한 원화 금액이에요. 환율이 오르면(원화 약세) 달러 자산의 원화 환산 가치가 커지고, 내리면(원화 강세) 작아져요.',
    watchPoints: [
      '달러 자산을 보유 중이라면 환율 상승은 평가액 증가, 하락은 감소로 이어집니다.',
      '환율은 미국 금리·무역수지·글로벌 위험회피 심리 등 여러 요인이 함께 작용해 움직여요.',
      '환율은 하루 등락보다 며칠~몇 주 단위로 보면 방향을 더 분명히 알 수 있어요.'
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
  },
  gold: {
    label: '금 시세 (Gold)',
    concept: '국제 금 선물(온스당 달러) 가격이에요. 대표적인 안전자산으로, 시장 불안 심리가 커지거나 인플레이션 우려가 있을 때 수요가 몰리는 경향이 있어요.',
    watchPoints: [
      'VIX(공포지수)가 함께 오르면서 금값도 오르면 "안전자산 선호" 심리가 강해졌다는 신호로 볼 수 있어요.',
      '미국 금리·달러 가치와 대체로 반대로 움직이는 경향이 있어요(금리가 오르면 이자가 없는 금의 보유 매력이 상대적으로 줄어들어요).',
      '금 관련 자산을 보유하지 않아도, 전반적인 시장 위험회피 심리를 가늠하는 참고 지표로 활용할 수 있어요.'
    ]
  },
  usdx: {
    label: '달러인덱스(USD Index)',
    concept: '유로·엔·파운드 등 주요 통화 바스켓 대비 달러 가치를 지수화한 값이에요. 오르면 "강달러"(달러 가치 상승), 내리면 "약달러"(달러 가치 하락)로 해석해요.',
    watchPoints: [
      '달러인덱스가 오르면(강달러) 원/달러 환율도 함께 오르는(원화 약세) 경향이 있어요.',
      '미국 금리가 오르면 더 높은 이자를 좇아 자금이 몰려 달러인덱스도 함께 오르는 경향이 있어요.',
      '달러 강세가 이어지는 시기에는 신흥국·위험자산(주식)에서 자금이 빠져나가는 경우가 있어요.'
    ]
  }
};

let macroDetailSnapshot = {};

// [실제 5일/20일 추세] 키 -> 야후 티커. usdkrw/us10y/vix/dow는 macroIndicatorCache 조회에 쓰던 티커와
// 동일, kospi 등 지수는 이미 있는 INDEX_TICKERS를 그대로 재사용한다(js/09).
const MACRO_KEY_TICKERS = {
  vix: '^VIX', usdkrw: 'KRW=X', us10y: '^TNX', gold: 'GC=F', usdx: 'DX-Y.NYB',
  kospi: INDEX_TICKERS.KOSPI, kosdaq: INDEX_TICKERS.KOSDAQ,
  sp500: INDEX_TICKERS.SP500, nasdaq: INDEX_TICKERS.NASDAQ, dow: '^DJI'
};
// [§46 MAC-DS-01] 매크로 타일 이름 - 브리핑 타일과 종목 분석 검색창 직접 입력(→ 같은 지표 팝업)이 함께 쓴다.
const MACRO_KEY_NAMES = {
  vix: 'VIX(변동성)', usdkrw: '원/달러', us10y: '美 10년물 금리', gold: '금 시세', usdx: '달러인덱스',
  kospi: '코스피', kosdaq: '코스닥', sp500: 'S&P 500', nasdaq: '나스닥', dow: '다우'
};
// [§46 MAC-UNIT-01] 지표 팝업 차트(이동평균 범례 · 세로축)의 값 단위 - 값 자체는 바꾸지 않고 표시만 정한다.
// 금리는 %, 원/달러는 원, 금 시세는 달러 가격, 나머지(지수 · VIX · 달러인덱스)는 단위 없는 지수값이다.
const MACRO_VALUE_UNITS = {
  us10y: 'pct', usdkrw: 'krw', gold: 'usd',
  vix: 'point', usdx: 'point', kospi: 'point', kosdaq: 'point', sp500: 'point', nasdaq: 'point', dow: 'point'
};
function getMacroValueUnit(macroKey) {
  return MACRO_VALUE_UNITS[macroKey] || 'point';
}
// [박스권 판정 임계값] 지표마다 평소 변동폭이 크게 달라(VIX는 일상적으로 수십% 출렁이지만 환율은
// 1%만 움직여도 큰 변화) 5일/20일 등락률이 몇 %부터 "추세"로 볼지 지표군별로 다르게 잡는다 - 정밀한
// 통계적 기준이 아니라 초보자 설명용 근사치다.
const MACRO_TREND_THRESHOLDS = {
  vix: { d5: 15, d20: 25 },
  usdkrw: { d5: 0.8, d20: 1.5 },
  us10y: { d5: 3, d20: 5 },
  gold: { d5: 2.5, d20: 5 },
  usdx: { d5: 1, d20: 2 },
  kospi: { d5: 2, d20: 4 }, kosdaq: { d5: 2.5, d20: 5 },
  sp500: { d5: 1.5, d20: 3 }, nasdaq: { d5: 2, d20: 4 }, dow: { d5: 1.5, d20: 3 }
};

// [5일/20일 종가 비교] getCachedDailyCloses(js/09)가 이미 RISK 엔진/종목 분석용으로 쓰는 1년치 일별
// 종가 캐시를 그대로 재사용한다 - 팝업을 열 때만(온디맨드) 호출하므로 5분 자동 갱신 주기에 9개 지표
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
  // [금 시세 - 실제 달러 가격] 나머지 지수(코스피/S&P500 등)는 포인트값이라 통화 기호를 안 붙이지만,
  // 금은 실제 온스당 달러 가격이라 유일하게 '$'를 유지한다.
  if (key === 'gold') return '$' + fmtNum(s.value, 0);
  // [달러인덱스 - 지수값] 통화 바스켓 대비 상대값을 지수화한 숫자라 통화 기호를 붙이지 않는다(VIX와
  // 동일한 성격). 통상 소수 둘째 자리까지 표시한다(예: 103.45).
  if (key === 'usdx') return fmtNum(s.value, 2);
  return fmtNum(s.value, 1);
}

// [지표별 "그래서 무슨 뜻인지" 꼬리 문장] 1일/5일/20일 어느 조합으로 문장을 구성하든 마지막에 똑같이
// 붙는다 - VIX는 상태(안정/주의/긴장) 자체가 이미 의미를 담고 있어 별도 꼬리가 없다.
function macroMeaningTail(key) {
  // [용어 정비 S-36] 원/달러·美 10년물·금·달러인덱스는 같은 팝업의 개념/함께 볼 점과 같은 내용이라 꼬리 문장을 두지 않는다.
  if (key === 'usdkrw' || key === 'us10y' || key === 'gold' || key === 'usdx') return null;
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

// [지수/매크로 티커 → 지표 키 역조회] 코스피/코스닥/S&P500/나스닥/다우/VIX처럼 "종목이 아닌 시장
// 지표"를 종목 상세 모달로 열었을 때(핵심종목 실시간 팝업의 주요 지수 타일 등) 이 함수로 감지해서,
// 이 지표 전용 콘텐츠(buildMacroDetailBodyHtml)를 보여줄지 판단한다.
function getMacroKeyForTicker(yahooTicker) {
  return Object.keys(MACRO_KEY_TICKERS).find((k) => MACRO_KEY_TICKERS[k] === yahooTicker) || null;
}

// [매크로 지표 상세 본문] attachStockAnalysisReportToDetailModal(js/08, 종목 상세 모달에서 지수를
// 열었을 때의 매크로 분기)이 이 콘텐츠를 그대로 재사용한다 - 지수 클릭 팝업이 하나로 통일되면서
// 이제 이 함수를 부르는 곳도 그 한 군데뿐이다.
// [V1.2-A C1] "마지막 정상 조회" 시각 문구 - 판단성 문구(위험/오래됨/신뢰도낮음)는 만들지 않고 시각만
// 그대로 보여준다. 기존 앱의 시각 표기 로케일(js/11 autoRefreshStatusMsg와 동일한 'ko-KR')을 따르되,
// 좁은 팝업 폭에 맞춰 시:분까지만 표시한다(초 단위는 이 용도에 불필요). fetchedAt이 없으면(한 번도
// 정상 조회된 적 없음) 아무것도 표시하지 않는다 - "-"/"조회 전" 기존 정책 그대로.
function macroLastSuccessLabel(s) {
  if (!s || typeof s.fetchedAt !== 'number') return null;
  return `마지막 정상 조회 ${new Date(s.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}

function buildMacroDetailBodyHtml(key) {
  const info = MACRO_INDICATOR_INFO[key];
  if (!info) return '';
  const s = macroDetailSnapshot[key];
  const tag = macroStatusTag(key, s);
  const hasChange = s && typeof s.changePercent === 'number';
  const lastSuccessLabel = macroLastSuccessLabel(s);
  return `
    <div class="flex items-center justify-between mb-1 flex-wrap gap-1">
      <div class="text-xl font-bold">${escapeHtml(macroDetailValueText(key, s))}</div>
      <div class="flex items-center gap-2">
        ${hasChange ? `<span class="text-sm font-medium ${s.changePercent >= 0 ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}">${s.changePercent >= 0 ? '+' : ''}${fmtNum(s.changePercent, 2)}%</span>` : ''}
        <span class="text-sm font-semibold px-2 py-1 rounded-full ${MACRO_TAG_COLOR_CLASSES[tag.color]}">${escapeHtml(tag.text)}</span>
      </div>
    </div>
    ${lastSuccessLabel ? `<p class="text-sm text-slate-400 mb-3">${escapeHtml(lastSuccessLabel)}</p>` : '<div class="mb-4"></div>'}
    <div class="mb-4">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">💡 지표 기본 개념</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-keep break-words">${escapeHtml(info.concept)}</p>
    </div>
    <div class="mb-4">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📈 최근 시장 동향 &amp; 해설</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-keep break-words">${escapeHtml(buildMacroDetailTrendText(key, s))}</p>
    </div>
    <div class="rounded-lg border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 p-3">
      <p class="text-sm font-semibold text-brand-700 dark:text-brand-300 mb-1.5">🧭 함께 볼 점</p>
      ${info.watchPoints.map((w, i) => hangingIndentLine(`${i + 1}.`, escapeHtml(w), 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-1')).join('')}
      <!-- [V1.2-A C4] 위 구간(예: VIX 20/30)은 계산식이 아니라 이 화면이 초보자 설명을 위해 쓰는 고정
           참고값이다(js/10 MACRO_TREND_THRESHOLDS/vixWeatherIcon 주석 참고) - 숫자·판정 로직은 그대로
           두고, 그 사실만 한 줄 공개한다. -->
      <p class="text-sm text-slate-400 mt-2 pt-2 border-t border-brand-100 dark:border-brand-900/50 flex items-start gap-1.5"><span class="shrink-0">※</span><span class="break-keep break-words min-w-0">위 구간은 시장에서 널리 참고되는 범위를 바탕으로 한 설명용 기준이며, 절대적인 위험 기준은 아닙니다.</span></p>
    </div>`;
}

// [지수 모달 - 최근 수준 참고 카드] analyzeTickerForModal()(js/09, 종목/지수 공용 계산)이 뽑아 둔
// recentHigh/recentLow/mdd를 지표 상세 콘텐츠 하단에 덧붙인다 - stockAnalysisStatTile을 그대로 재사용한다.
// [UI 마무리 ①] 금리 · 환율 · VIX · 달러인덱스까지 이 카드를 같이 쓰는데 "주가 위치 · 최고가"는 주식 종목 말이라
// 지표 성격에 맞는 이름으로 부른다(값 · 계산은 그대로). 금 시세는 실제 가격이라 "최고가/최저가"를 유지한다.
const MACRO_LEVEL_WORDING = Object.freeze({
  us10y: { title: '📊 최근 금리 수준 참고', high: '최근 3개월 최고 금리', low: '최근 3개월 최저 금리', what: '금리 수준' },
  usdkrw: { title: '📊 최근 환율 수준 참고', high: '최근 3개월 최고 환율', low: '최근 3개월 최저 환율', what: '환율' },
  gold: { title: '📊 최근 가격 수준 참고', high: '최근 3개월 최고가', low: '최근 3개월 최저가', what: '금 가격' },
  vix: { title: '📊 최근 지수 수준 참고', high: '최근 3개월 최고치', low: '최근 3개월 최저치', what: 'VIX 값' },
  usdx: { title: '📊 최근 지수 수준 참고', high: '최근 3개월 최고치', low: '최근 3개월 최저치', what: '달러인덱스 값' }
});
const MACRO_LEVEL_WORDING_INDEX = Object.freeze({ title: '📊 최근 지수 수준 참고', high: '최근 3개월 최고치', low: '최근 3개월 최저치', what: '지수 값' });
function buildIndexPriceLevelsHtml(a, macroKey) {
  if (!a || a.error) return '';
  const w = MACRO_LEVEL_WORDING[macroKey] || MACRO_LEVEL_WORDING_INDEX;
  const priceDecimals = typeof a.currentPrice === 'number' && a.currentPrice < 100 ? 2 : 0;
  return `
  <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
    <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">${w.title}</p>
    <div class="grid grid-cols-2 gap-2">
      ${stockAnalysisStatTile(w.high, typeof a.recentHigh === 'number' ? fmtNum(a.recentHigh, priceDecimals) : '데이터 부족', `최근 3개월 동안 가장 높았던 ${w.what}이에요.`)}
      ${stockAnalysisStatTile(w.low, typeof a.recentLow === 'number' ? fmtNum(a.recentLow, priceDecimals) : '데이터 부족', `최근 3개월 동안 가장 낮았던 ${w.what}이에요.`)}
      <div class="col-span-2">${stockAnalysisStatTile('최대낙폭(MDD, 1년)', typeof a.mdd === 'number' ? `${fmtNum(a.mdd, 1)}%` : '데이터 부족', `최근 1년 중 고점에서 가장 크게 떨어졌던 폭이에요(이미 지나간 최대 하락). 지금 ${w.what}이 고점보다 얼마나 낮은지와는 다른 값이에요.`)}</div>
    </div>
  </div>`;
}

// [지수 모달 - 하단 캡션] "개별 매수/보유 대상이 아닙니다" 안내를 모달 상단이 아니라 콘텐츠 맨 끝에
// 옅은 텍스트로 배치해, 열자마자 보이는 상단은 차트+지표 설명으로 바로 채워지도록 한다.
function macroIndexFooterCaptionHtml() {
  return '<p class="text-sm text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">개별 매수/보유 대상이 아닌 시장 지표입니다.</p>';
}

// [전용 팝업 제거됨] renderMacroDetailModal/openMacroDetailModal/closeMacroDetailModal과 #macroDetailModal
// 전용 모달은 지수 클릭 팝업을 핵심종목 팝업과 통일하면서(macroTileHtml 주석 참고, data-open-stock-detail로
// 전환) 더 이상 어디서도 열리지 않게 되어 제거했다 - buildMacroDetailBodyHtml/macroDetailSnapshot 등
// 콘텐츠 자체는 attachStockAnalysisReportToDetailModal(js/08)이 그대로 재사용하므로 그대로 남아있다.

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

  const goldInfo = state.macroIndicatorCache['GOLD'];
  const gold = goldInfo ? goldInfo.price : null;
  const goldChangePct = goldInfo ? goldInfo.changePercent : null;

  const usdxInfo = state.macroIndicatorCache['USDX'];
  const usdx = usdxInfo ? usdxInfo.price : null;
  const usdxChangePct = usdxInfo ? usdxInfo.changePercent : null;

  // [Phase 35] 기준 환율이나 현재 환율을 모르면 0(보합)이 아니라 null로 둔다 - 예전엔 0으로 떨어져
  // 타일에 "+0.00% ➡️"가 찍히면서 "데이터 없음"이 "환율이 안 움직였다"로 보였다. state.refExchangeRate
  // 자체와 환율 조회 로직은 그대로 두고, 이 화면의 표시/해설 입력값만 결측으로 넘긴다.
  const fxChangePct = (typeof state.refExchangeRate === 'number' && state.refExchangeRate > 0 && typeof state.exchangeRate === 'number')
    ? ((state.exchangeRate - state.refExchangeRate) / state.refExchangeRate) * 100 : null;

  const kospiInfo = getMarketIndexInfoFromState(INDEX_TICKERS.KOSPI);
  const kosdaqInfo = getMarketIndexInfoFromState(INDEX_TICKERS.KOSDAQ);
  const sp500Info = getMarketIndexInfoFromState(INDEX_TICKERS.SP500);
  const nasdaqInfo = getMarketIndexInfoFromState(INDEX_TICKERS.NASDAQ);
  const dowInfo = state.macroIndicatorCache['DOW'];
  const indexTile = (key, label, info) => macroTileHtml(key, label, info ? fmtNum(info.price, 1) : '-', info ? `${info.changePercent >= 0 ? '+' : ''}${fmtNum(info.changePercent, 2)}%` : '조회 전', trendArrowIcon(info ? info.changePercent : null));

  // [1행 5개 · 2행 5개] 금 시세는 실제 달러 가격이라 '$' 단위를 그대로 쓴다(macroTileHtml 자체는
  // 단위 표기를 몰라도 되게, 값 문자열을 여기서 미리 만들어 넘긴다 - indexTile과 동일 패턴). 달러인덱스는
  // 통화 바스켓 대비 상대값을 지수화한 숫자라 통화 기호 없이 소수 둘째 자리까지 표시한다.
  const goldTile = macroTileHtml('gold', MACRO_KEY_NAMES.gold, typeof gold === 'number' ? '$' + fmtNum(gold, 0) : '-', typeof goldChangePct === 'number' ? `${goldChangePct >= 0 ? '+' : ''}${fmtNum(goldChangePct, 2)}%` : '조회 전', trendArrowIcon(goldChangePct));
  const usdxTile = macroTileHtml('usdx', MACRO_KEY_NAMES.usdx, typeof usdx === 'number' ? fmtNum(usdx, 2) : '-', typeof usdxChangePct === 'number' ? `${usdxChangePct >= 0 ? '+' : ''}${fmtNum(usdxChangePct, 2)}%` : '조회 전', trendArrowIcon(usdxChangePct));
  gridEl.innerHTML = `
    <div class="grid grid-cols-5 gap-1 sm:gap-2">
      ${macroTileHtml('vix', MACRO_KEY_NAMES.vix, typeof vix === 'number' ? fmtNum(vix, 1) : '-', vixWeather.label, vixWeather.icon)}
      ${macroTileHtml('usdkrw', MACRO_KEY_NAMES.usdkrw, typeof state.exchangeRate === 'number' ? `${fmtNum(state.exchangeRate, 0)}원` : '-', typeof fxChangePct === 'number' ? `${fxChangePct >= 0 ? '+' : ''}${fmtNum(fxChangePct, 2)}%` : '조회 전', trendArrowIcon(fxChangePct))}
      ${macroTileHtml('us10y', MACRO_KEY_NAMES.us10y, typeof ust10y === 'number' ? fmtNum(ust10y, 2) + '%' : '-', '국채 수익률', trendArrowIcon(ust10yChangePct))}
      ${goldTile}
      ${usdxTile}
    </div>
    <div class="grid grid-cols-5 gap-1 sm:gap-2">
      ${indexTile('kospi', MACRO_KEY_NAMES.kospi, kospiInfo)}
      ${indexTile('kosdaq', MACRO_KEY_NAMES.kosdaq, kosdaqInfo)}
      ${indexTile('sp500', MACRO_KEY_NAMES.sp500, sp500Info)}
      ${indexTile('nasdaq', MACRO_KEY_NAMES.nasdaq, nasdaqInfo)}
      ${indexTile('dow', MACRO_KEY_NAMES.dow, dowInfo)}
    </div>`;

  // [지표 상세 팝업용 스냅샷] 타일을 클릭했을 때(종목 상세 모달의 매크로 분기,
  // attachStockAnalysisReportToDetailModal - js/08) 다시 조회하지 않고 이 갱신 주기에서 이미 받아온
  // 값을 그대로 재사용한다 - 9개 지표를 한 곳에 모아두면 팝업 렌더링 쪽 코드가 지표별 원본 소스
  // (macroIndicatorCache/marketIndexCache/exchangeRate)를 몰라도 된다.
  // [5일/20일 추세 보존] change5d/change20d는 팝업을 열 때만 온디맨드로 채워지는데(위 js/08 참고),
  // 여기서 매번 객체를 통째로 새로 만들면 그 값이 갱신 주기마다 날아가 버린다 - 이전 스냅샷에 남아있던
  // 값을 그대로 이어받는다(1년치 종가는 자주 안 바뀌므로 5분마다 다시 불러올 필요가 없다).
  const prevMacroSnapshot = macroDetailSnapshot;
  // [V1.2-A C1] fetchedAt(마지막 정상 조회 시각)을 각 지표의 원본 캐시에서 그대로 옮겨 담는다 - 새로
  // 계산하지 않고 js/11이 실제 조회 성공 시점에 이미 채워둔 값을 읽기만 한다. 원/달러(usdkrw)만
  // marketIndexCache/macroIndicatorCache 같은 객체 캐시가 없어 state.exchangeRateFetchedAt(js/09)을
  // 대신 쓴다.
  macroDetailSnapshot = {
    vix: { value: vix, changePercent: vixInfo ? vixInfo.changePercent : null, fetchedAt: vixInfo ? vixInfo.fetchedAt : null, change5d: prevMacroSnapshot.vix && prevMacroSnapshot.vix.change5d, change20d: prevMacroSnapshot.vix && prevMacroSnapshot.vix.change20d },
    usdkrw: { value: state.exchangeRate, changePercent: fxChangePct, fetchedAt: state.exchangeRateFetchedAt, change5d: prevMacroSnapshot.usdkrw && prevMacroSnapshot.usdkrw.change5d, change20d: prevMacroSnapshot.usdkrw && prevMacroSnapshot.usdkrw.change20d },
    us10y: { value: ust10y, changePercent: ust10yChangePct, fetchedAt: ust10yInfo ? ust10yInfo.fetchedAt : null, change5d: prevMacroSnapshot.us10y && prevMacroSnapshot.us10y.change5d, change20d: prevMacroSnapshot.us10y && prevMacroSnapshot.us10y.change20d },
    gold: { value: gold, changePercent: goldChangePct, fetchedAt: goldInfo ? goldInfo.fetchedAt : null, change5d: prevMacroSnapshot.gold && prevMacroSnapshot.gold.change5d, change20d: prevMacroSnapshot.gold && prevMacroSnapshot.gold.change20d },
    usdx: { value: usdx, changePercent: usdxChangePct, fetchedAt: usdxInfo ? usdxInfo.fetchedAt : null, change5d: prevMacroSnapshot.usdx && prevMacroSnapshot.usdx.change5d, change20d: prevMacroSnapshot.usdx && prevMacroSnapshot.usdx.change20d },
    kospi: { value: kospiInfo ? kospiInfo.price : null, changePercent: kospiInfo ? kospiInfo.changePercent : null, fetchedAt: kospiInfo ? kospiInfo.fetchedAt : null, change5d: prevMacroSnapshot.kospi && prevMacroSnapshot.kospi.change5d, change20d: prevMacroSnapshot.kospi && prevMacroSnapshot.kospi.change20d },
    kosdaq: { value: kosdaqInfo ? kosdaqInfo.price : null, changePercent: kosdaqInfo ? kosdaqInfo.changePercent : null, fetchedAt: kosdaqInfo ? kosdaqInfo.fetchedAt : null, change5d: prevMacroSnapshot.kosdaq && prevMacroSnapshot.kosdaq.change5d, change20d: prevMacroSnapshot.kosdaq && prevMacroSnapshot.kosdaq.change20d },
    sp500: { value: sp500Info ? sp500Info.price : null, changePercent: sp500Info ? sp500Info.changePercent : null, fetchedAt: sp500Info ? sp500Info.fetchedAt : null, change5d: prevMacroSnapshot.sp500 && prevMacroSnapshot.sp500.change5d, change20d: prevMacroSnapshot.sp500 && prevMacroSnapshot.sp500.change20d },
    nasdaq: { value: nasdaqInfo ? nasdaqInfo.price : null, changePercent: nasdaqInfo ? nasdaqInfo.changePercent : null, fetchedAt: nasdaqInfo ? nasdaqInfo.fetchedAt : null, change5d: prevMacroSnapshot.nasdaq && prevMacroSnapshot.nasdaq.change5d, change20d: prevMacroSnapshot.nasdaq && prevMacroSnapshot.nasdaq.change20d },
    dow: { value: dowInfo ? dowInfo.price : null, changePercent: dowInfo ? dowInfo.changePercent : null, fetchedAt: dowInfo ? dowInfo.fetchedAt : null, change5d: prevMacroSnapshot.dow && prevMacroSnapshot.dow.change5d, change20d: prevMacroSnapshot.dow && prevMacroSnapshot.dow.change20d }
  };

  const foreignAmount = state.assets.reduce((s, a) => { const r = calcRow(a); return s + (r.isForeign ? r.curAmount : 0); }, 0);
  const totalAmount = state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0);
  const foreignWeightPct = totalAmount > 0 ? (foreignAmount / totalAmount) * 100 : null;

  const commentary = buildMacroCommentary({
    vix, fxChangePct,
    ust10yChangePct,
    kospiChangePct: kospiInfo ? kospiInfo.changePercent : null,
    goldChangePct,
    usdxChangePct,
    foreignWeightPct
  });
  const correlation = buildAssetCorrelationGuide({ ust10yChangePct, fxChangePct });
  // [타이포그래피 통일] 예전엔 이 3줄이 text-lg라 바로 아래 RISK 카드의 같은 성격 텍스트(권장 행동
  // 지침 등, text-sm)보다 눈에 띄게 크게 보였다 - RISK 카드와 동일한 text-sm/leading-relaxed로 맞춰
  // 두 카드의 본문 글자 크기가 균일하게 보이도록 했다.
  // [타이틀 기준 정렬] "📌 시장 종합 평가"를 라벨+본문이 한 줄에 이어지는 hangingIndentLine 대신
  // stackedTitleBody로 세로로 분리해, 문장이 길어 줄바꿈되면 모든 줄이 라벨의 첫 글자(왼쪽 여백)와
  // 같은 수직선에 맞춰지도록 했다 - 사용자가 실제로 요구한 정렬 기준이 "본문 시작 위치"가 아니라
  // "타이틀 시작 위치"였다(위 hangingIndentLine 주석 참고 - 그건 "1. ~~" 같은 번호 매김 목록 전용).
  diagnosisEl.innerHTML = `
    ${stackedTitleBody('📌 시장 종합 평가', escapeHtml(commentary.cause), 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')}
    ${stackedTitleBody('💰 내 포트폴리오 영향', escapeHtml(commentary.impact), 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')}
    ${stackedTitleBody('🔎 참고', escapeHtml(commentary.note), 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')}
    <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
      <p class="font-semibold mb-0.5">💡 상관관계 가이드</p>
      <div id="correlationGuide">
        <ul class="space-y-1 list-none">
          ${correlation.lines.map((l) => `<li class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(l)}</li>`).join('')}
        </ul>
        <p class="text-sm text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">${escapeHtml(correlation.note)}</p>
      </div>
    </div>
    <!-- [V1.2-A C2] 매크로 브리핑과 바로 아래 RISK 진단 카드가 서로 다른 계산이라는 것을 한 줄로
         알린다 - 둘을 정량적으로 잇는 새 계산은 만들지 않는다(js/09 컴포지트 위험점수는 이 카드의
         값을 전혀 입력으로 쓰지 않는다). "매크로가 나쁘면 내 자산도 위험하다"는 식으로 확장하지
         않도록 문구를 그 두 사실의 병렬 서술로만 남긴다. -->
    <p class="text-sm text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 leading-relaxed break-keep">
      매크로 동향과 보유자산 위험은 서로 다른 기준으로 계산됩니다. 매크로 동향은 현재 시장환경을, 보유자산 위험은 내 자산의 위험 특성을 보여줍니다.
    </p>`;

  /* [PM 지시 2026-09-23 · #3] 예전에는 여기서 아코디언 높이를 다시 맞춰야 했다(5분 자동 갱신으로
   * 내용이 통째로 새로 그려지면 max-height가 옛 높이에 묶였기 때문이다). 팝업은 높이를 스스로
   * 잡으므로 그 보정이 필요 없다 - 열려 있는 동안 갱신되면 새 내용이 그대로 보인다. */
}

/* [매크로 브리핑 구조] PM 확정 정책: 「시장 현황 & 매크로 브리핑」 자체와 지표 10개는 접지 않고 항상
 * 보인다. 세부 내용(시장 종합 평가 / 내 포트폴리오 영향 / 참고 / 상관관계 가이드)은 한 곳에 모아 두고
 * 그 안에 다시 접기를 두지 않는다.
 *
 * [PM 지시 2026-09-23 · #3] 그 세부 내용을 **아코디언에서 팝업으로** 옮겼다. 펼치면 카드가 길어져
 * 바로 아래 위험 점수가 화면 밖으로 밀려나던 문제가 있었다 - 팝업은 카드 높이를 바꾸지 않는다.
 * 내용 · 문구 · 데이터 · 계산은 전혀 바뀌지 않았다(같은 #macroBriefingDiagnosis를 그대로 쓴다).
 * 열고 닫는 방식은 #portfolioRiskInfoModal과 같다 - 뒤로가기로도 닫힌다(MODAL_CLOSE_FNS, js/03). */
function openMacroDetailModal() {
  document.getElementById('macroDetailModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeMacroDetailModal(viaBackButton) {
  document.getElementById('macroDetailModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('macroDetailBtn').addEventListener('click', openMacroDetailModal);
document.getElementById('closeMacroDetailBtn').addEventListener('click', () => closeMacroDetailModal());
document.getElementById('macroDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'macroDetailModal') closeMacroDetailModal();
});

function renderRiskSection() {
  renderMacroBriefing();
  renderRiskDiagnosisSummary();
  const riskyContainer = document.getElementById('riskListContainer');
  const riskyBadge = document.getElementById('riskyCountBadge');
  const riskyBody = document.getElementById('riskyAccordionBody');
  const riskyChevron = document.getElementById('riskyAccordionChevron');
  if (!riskyContainer) return;

  // [안정적인 종목 목록 제거] 리스크가 감지된 종목만 노출한다는 요청에 따라 safe 목록은 더 이상 화면에
  // 그리지 않는다 - computeRiskClassifiedAssets()가 여전히 safe를 함께 반환하지만(다른 곳에서 쓸 수도
  // 있어 반환값 자체는 그대로 둠), 여기서는 risky만 사용한다.
  const { risky: riskyRaw, safe } = computeRiskClassifiedAssets();
  // 정렬 기준: 해외 자산을 먼저, 그 다음 평가금액이 큰 순서로 보여준다.
  const regionThenAmount = (x, y) => {
    const regionRank = (b) => (b.asset.isDomestic === '해외' ? 0 : 1);
    return regionRank(x) - regionRank(y) || y.curAmount - x.curAmount;
  };
  const risky = riskyRaw.sort(regionThenAmount);
  const totalPortfolioCur = state.assets.reduce((s, a) => s + calcRow(a).curAmount, 0);

  riskyBadge.textContent = `${risky.length}건`;

  // [문구 점검 P0] 감지 목록이 비어 있다는 것은 "감지 조건에 걸린 종목이 없다"는 뜻일 뿐 포트폴리오가 안정하다는
  // 근거가 아니다. 가격 기록이 없거나 아직 계산 전인 종목은 조건을 판단하지 못해 목록에 오지 않으므로 그 사실도 함께 말한다.
  const noDataCount = state.advancedRiskMetrics ? safe.filter((x) => !x.holding || !x.holding.hasData).length : 0;
  const emptyRiskText = !state.advancedRiskMetrics && riskEligibleAssets().length > 0
    ? '종목별 위험 신호를 아직 계산하지 않았습니다(시세를 불러온 뒤 계산됩니다).'
    : `현재 리스크 감지 조건(단기 과열 · 이동평균 하락 배열 · 52주 고점 대비 30% 이상 하락)에 해당하는 종목이 없습니다.${noDataCount > 0 ? ` 가격 기록이 부족한 ${noDataCount}개 종목은 판단하지 않았습니다.` : ''}`;
  riskyContainer.innerHTML = risky.length === 0
    ? `<p class="text-sm text-slate-400 py-1 break-keep">${escapeHtml(emptyRiskText)}</p>`
    : risky.map(({ key, asset: a, row: r, tags, owners, curAmount }) => {
      const p = derivePresentation(r);
      const weightPct = totalPortfolioCur !== 0 ? (curAmount / totalPortfolioCur) * 100 : 0;
      const tagHtml = tags.map((t) =>
        `<span class="text-sm px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 font-semibold">[${escapeHtml(t)}]</span>`
      ).join(' ');
      // [점검 안내 태그] 감지 조건에 따라 "비중·가격 점검"/"낙폭 점검"/"단기 추세 주의" 중 하나를 골라
      // 옆에 덧붙인다 - buildAssetActionTag()가 우선순위대로 고른다(Phase 35에서 행동 지시형 이름을
      // 점검형으로 바꿨고, Phase 39에서 거래량 급증 분기가 빠졌다).
      const actionTag = buildAssetActionTag(tags);
      const actionTagHtml = actionTag ? `<span class="text-sm px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">💡 ${escapeHtml(actionTag)}</span>` : '';
      return `
      <div class="py-2.5 border-b last:border-b-0 border-red-100 dark:border-red-900/40" data-risk-row data-risk-key="${escapeHtml(key)}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-base font-semibold truncate"><span class="cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(a.ticker)}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span> <span class="text-sm font-normal text-slate-400">· ${escapeHtml(owners.join('+'))}</span></p>
            <div class="flex flex-wrap items-center gap-1.5 mt-1.5">${tagHtml}${actionTagHtml}<span class="text-sm text-slate-400">비중 ${fmtNum(weightPct, 1)}%</span></div>
          </div>
          <div class="text-right shrink-0 pl-2">
            <p class="text-base font-bold">${p.priceUnit}${fmtNum(r.currentPrice, 2)}${p.sessionBadge}</p>
          </div>
        </div>
      </div>`;
    }).join('');

  // 방금 다시 그린 내용 기준으로 펼침 상태를 재적용한다 - 펼쳐진 채로 데이터가 바뀌어도(5분 자동
  // 갱신 등) 높이가 새 내용에 맞게 갱신되고, 접혀 있으면 계속 접힌 채로 유지된다.
  if (riskyBody && riskyChevron) setAccordionOpen(riskyBody, riskyChevron, riskyAccordionOpen);

  lucide.createIcons();
}

document.getElementById('riskyAccordionBtn').addEventListener('click', () => {
  riskyAccordionOpen = !riskyAccordionOpen;
  setAccordionOpen(document.getElementById('riskyAccordionBody'), document.getElementById('riskyAccordionChevron'), riskyAccordionOpen);
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
    cards.push(`⚠️ [${escapeHtml(m.topHolding.name)}] 주식·ETF 중 비중 ${fmtNum(m.topWeight, 0)}%${contrib !== null ? ` · 위험 기여도 ${fmtNum(contrib, 0)}%` : ''}`);
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

  // [V1.3 P1-1 · PM 지시 2026-09-22 갱신] 이 팝업도 "종합 위험점수"를 크게 보여주므로, 팝업만 본
  // 사용자가 이 점수를 전체 자산 기준으로 오해하지 않도록 진단 대상을 한 줄로 함께 적는다.
  // (메인 카드의 #riskScopeNote는 2026-09-22 지시로 없어지고 점수 옆 ⓘ 팝업으로 합쳐졌다 - 이 줄은 그와 별개다.)
  // 계산(riskEligibleAssets = 주식·ETF)은 전혀 건드리지 않고, 카드와 같은 사실을 같은 자리(점수 바로
  // 아래)에 한 줄로만 덧붙인다 - 새 카드/새 점수/새 계산을 만들지 않는다.
  document.getElementById('riskAlertScoreBox').innerHTML = `
    <div class="rounded-xl border p-3 ${level.bgClass}">
      <p class="text-base font-bold ${level.colorClass}">${level.emoji} 포트폴리오 종합 위험점수 ${score}/100 [${level.label}]</p>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-keep">진단 대상: 주식·ETF 보유분만 해당(현금·채권·부동산 제외)</p>
      <p class="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed">${buildRiskDiagnosisLine(m)}</p>
    </div>`;

  const stockCards = buildRiskAlertStockCards(m);
  document.getElementById('riskAlertStockCards').innerHTML = stockCards.length
    ? stockCards.map((c) => `<p class="text-sm font-semibold text-red-600 dark:text-red-400 leading-relaxed">${c}</p>`).join('')
    : '';

  const actionItems = buildRiskActionItems(m);
  document.getElementById('riskAlertActionItems').innerHTML = `
    <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">💡 함께 확인할 점</p>
    ${actionItems.map((item, i) => hangingIndentLine(`${i + 1}.`, item, 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed')).join('')}`;

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

// [⚡ 원클릭 리밸런싱 이동] 팝업을 닫고 곧바로 "포트폴리오/자산예측" 탭의 "목표 비중 설정" 서브탭으로 이동한다.
document.getElementById('riskAlertRebalanceBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeRiskAlertModal(false);
  switchTab('rebalance');
  switchRebalanceSubTab('target');
});

// [📊 상세 리스크 관리 카드로 이동] 팝업을 닫고 대시보드 탭으로 전환한 뒤, RISK 관리 카드 위치까지
// 부드럽게 스크롤한다 - 아코디언(리스크 감지 목록)도 함께 펼쳐 바로 세부 내용을 볼 수 있게 한다.
// 가장 비중이 큰 감지 종목 행을 잠시 파란 테두리로 강조해 팝업에서 보던 문제 종목을 바로 찾을 수
// 있게 한다(개별 정밀 진단 카드는 이제 종목명을 눌러 여는 상세 모달 안으로 이동했다).
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
  if (pctB >= 1) return '상단 밴드 위';
  if (pctB >= 0.8) return '상단 밴드 부근';
  if (pctB <= 0) return '하단 밴드 아래';
  if (pctB <= 0.2) return '하단 밴드 부근';
  return '중심선 부근(평상시 범위)';
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
  if (a.trendLabel === '정배열(상승추세)') trendPhrase = '20·60·120일 이동평균이 상승 배열입니다';
  else if (a.trendLabel === '역배열(하락추세)') trendPhrase = '20·60·120일 이동평균이 하락 배열입니다';
  else trendPhrase = '이동평균의 방향이 섞여 있습니다';

  let extra = '';
  if (isOverbought) extra = ' 최근 짧은 기간에 빠르게 오른 상태입니다.';
  else if (isOversold) extra = ' 최근 짧은 기간에 많이 내린 상태입니다.';

  let tag = { emoji: '🟢', label: '특이 신호 없음', color: 'green' };
  if (isOverbought || isDownTrend || bigDrawdown) tag = { emoji: '🟡', label: '확인 필요', color: 'amber' };
  else if (isOversold) tag = { emoji: '🔵', label: '단기 하락 큼', color: 'blue' };

  return { tag, summaryText: trendPhrase + '.' + extra };
}

// [🎯 위험 관리 안내] 이 종목의 현재 가격/지표와 무관하게 어떤 종목을 보든 똑같이 적용되는 일반
// 원칙만 담는다 - 특정 가격대·비중·시점을 지정하면 개인화된 매매 지시가 되므로, 의도적으로 이
// 종목의 수치를 전혀 참조하지 않는 고정 문구다.
// [용어 정비 S-39] 투자 방법을 권하던 3개 문장(나누어 접근·추격 매수·나눠 담기)을 PM 승인안 한 문장으로 대체했다.
const STOCK_ANALYSIS_RISK_NOTE = '🎯 참고: 한 종목·한 자산군의 비중이 크면 그 자산의 등락이 계좌 전체에 크게 반영됩니다.';

// [초보자용 지표 가이드] guideText가 있으면 값 아래에 작은 회색 캡션으로 항상 보여준다 - 아이콘을
// 눌러야 보이는 호버 툴팁 대신 항상 노출되는 캡션을 택했다(모바일에서는 호버가 없어 툴팁이 잘 안
// 보이는 문제를 피하기 위함, 이 앱의 다른 "초보자용" 설명들도 대부분 이 방식을 쓴다).
function stockAnalysisStatTile(label, valueText, guideText) {
  return `
  <div class="rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
    <div class="text-sm text-slate-400">${escapeHtml(label)}</div>
    <div class="text-sm font-semibold mt-0.5 truncate" title="${escapeHtml(String(valueText).replace(/<[^>]*>/g, ''))}">${valueText}</div>
    ${guideText ? `<div class="text-sm text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">${escapeHtml(guideText)}</div>` : ''}
  </div>`;
}

// [지표별 쉬운 설명] 계산된 상태(state)에 맞춰 매번 다른 문구를 보여준다 - 정적인 정의 하나만 보여주는
// 것보다, "지금 이 종목이 어떤 상태인지"까지 함께 알려줘야 초보자가 실제로 판단에 쓸 수 있다.
function bollingerGuideText(bollinger) {
  if (!bollinger || typeof bollinger.pctB !== 'number') return '';
  return '최근 20일 평균 주가 대비 얼마나 벗어나 있는지 보여주는 지표예요.';
}
const MDD_GUIDE_TEXT = '최근 1년 중 고점에서 가장 크게 떨어졌던 폭이에요(이미 지나간 최대 하락). 지금 가격이 고점보다 얼마나 낮은지와는 다른 값이에요.';

const STOCK_ANALYSIS_TAG_COLOR_CLASSES = {
  green: 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
};

// [종목 분석 모달 + 보유종목 상세 모달 공용 - 앞부분] 핵심 요약&현재 상태 / 주가 위치&기술적 참고
// (+포트폴리오 적합도) 섹션만 만든다. [섹션 재배치] 예전엔 이 함수(당시 이름 renderStockAnalysisReportBody)
// 하나가 핵심요약~위험관리원칙~고지문까지 한 번에 문자열로 만들어 반환했는데, 종목 분석 모달에 재무
// 펀더멘털(KIS) 섹션을 "핵심요약/주가위치 다음, 위험관리원칙 앞"에 끼워 넣어야 하면서(위험관리원칙은
// 데이터 유무와 무관하게 항상 맨 마지막이어야 한다는 요구사항) 앞부분(Main)과 뒷부분(Footer)을 분리해야
// 했다 - 재무 펀더멘털은 별도 비동기 DOM 섹션(attachFundamentalSection)이라 이 사이에 그대로 끼워 넣을
// 수 있다. 보유종목 상세 모달(attachStockAnalysisReportToDetailModal, js/08)은 재무 펀더멘털을 이미
// 별도의 독립 섹션으로 먼저 보여주고 있어 이 분리가 필요 없지만, 호출부를 하나로 유지하려고 아래
// renderStockAnalysisReportBody()가 Main+Footer를 그대로 이어붙여 기존과 동일하게 동작한다.
function renderStockAnalysisReportMain(a, sim) {
  const priceDecimals = a.currentPrice < 100 ? 2 : 0;
  const status = buildStockStatusSummary(a);

  let simHtml = '';
  if (sim) {
    simHtml = `
    <div class="mb-3">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">🧩 포트폴리오 적합도 (편입 시 예상 변화, +${fmtNum(sim.addedWeightPct, 1)}%p)</p>
      <div class="grid grid-cols-2 gap-2">
        ${stockAnalysisStatTile('섹터 쏠림 (최대 섹터)', `${escapeHtml(sim.before.topSector || '-')} ${fmtNum(sim.before.topSectorWeight, 0)}% → ${escapeHtml(sim.after.topSector || '-')} ${fmtNum(sim.after.topSectorWeight, 0)}%`)}
        ${stockAnalysisStatTile('최대 종목 비중', `${fmtNum(sim.before.topWeightPct, 0)}% → ${fmtNum(sim.after.topWeightPct, 0)}%`)}
      </div>
    </div>`;
  }

  return `
  <div class="mb-3">
    <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📌 핵심 요약 &amp; 현재 상태</p>
    <div class="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 flex items-start gap-2">
      <span class="text-sm font-semibold px-2 py-1 rounded-full shrink-0 ${STOCK_ANALYSIS_TAG_COLOR_CLASSES[status.tag.color]}">${status.tag.emoji} ${escapeHtml(status.tag.label)}</span>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(status.summaryText)}</p>
    </div>
  </div>

  <div class="mb-3">
    <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">📊 주가 위치 &amp; 기술적 참고</p>
    <div class="grid grid-cols-2 gap-2">
      ${stockAnalysisStatTile('최근 3개월 최고가', typeof a.recentHigh === 'number' ? fmtNum(a.recentHigh, priceDecimals) : '데이터 부족', '최근 3개월 동안 가장 높았던 가격이에요.')}
      ${stockAnalysisStatTile('최근 3개월 최저가', typeof a.recentLow === 'number' ? fmtNum(a.recentLow, priceDecimals) : '데이터 부족', '최근 3개월 동안 가장 낮았던 가격이에요.')}
      <div class="col-span-2">${stockAnalysisStatTile('볼린저 밴드 위치', bollingerPositionLabel(a.bollinger), bollingerGuideText(a.bollinger))}</div>
      <div class="col-span-2">${stockAnalysisStatTile('최대낙폭(MDD, 1년)', typeof a.mdd === 'number' ? `${fmtNum(a.mdd, 1)}%` : '데이터 부족', typeof a.mdd === 'number' ? MDD_GUIDE_TEXT : '')}</div>
    </div>
  </div>

  ${simHtml}`;
}

// [종목 분석 모달 + 보유종목 상세 모달 공용 - 뒷부분] 위험 관리 일반 원칙 + 고지문 - 데이터 유무와
// 무관하게 리포트의 항상 맨 마지막에 와야 하는 고정 섹션이라 Main과 분리했다(위 주석 참고).
function renderStockAnalysisReportFooter(a) {
  return `
  <p class="text-sm text-slate-400 mb-1 leading-relaxed break-keep">${escapeHtml(STOCK_ANALYSIS_RISK_NOTE)}</p>

  <p class="text-sm text-slate-400 dark:text-slate-500 text-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">본 리포트는 참고용 정보이며, 최종 투자 판단과 책임은 본인에게 있습니다.</p>`;
}

// [보유종목 상세 모달 전용] Main+Footer를 그대로 이어붙인다 - attachStockAnalysisReportToDetailModal()
// (js/08)이 이 함수를 그대로 쓴다(그 모달은 재무 펀더멘털이 이미 별도 독립 섹션이라 Main/Footer를
// 나눠 끼워 넣을 필요가 없다).
function renderStockAnalysisReportBody(a, sim) {
  return renderStockAnalysisReportMain(a, sim) + renderStockAnalysisReportFooter(a);
}

// [종목 분석 모달 전용] 종목명/현재가 헤더만 만든다 - 차트/본문/재무/위험관리원칙은 이제 각자 별도
// 컨테이너(#stockAnalysisHeaderArea 등)에 나눠 들어가므로(runStockAnalysis 참고), 이 함수는 더 이상
// 본문을 이어붙이지 않는다.
function renderStockAnalysisHeaderHtml(a) {
  const changeColor = typeof a.changePercent === 'number' ? (a.changePercent >= 0 ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400') : 'text-slate-400';
  const changeText = typeof a.changePercent === 'number' ? `${a.changePercent >= 0 ? '+' : ''}${fmtNum(a.changePercent, 2)}%` : '조회 실패';
  const priceDecimals = a.currentPrice < 100 ? 2 : 0;
  return `
  <div class="flex items-baseline justify-between gap-2">
    <h4 class="text-sm font-bold truncate">📊 ${escapeHtml(a.name)} <span class="text-sm font-normal text-slate-400">${escapeHtml(a.ticker)}</span></h4>
    <div class="text-right shrink-0">
      <div class="text-sm font-semibold">${fmtNum(a.currentPrice, priceDecimals)}</div>
      <div class="text-sm font-medium ${changeColor}">${changeText}</div>
    </div>
  </div>`;
}

// [종목 검색 추천 목록] searchStockAnalysisCandidates()(js/09)가 찾은 보유자산/종목 마스터 후보를
// 클릭 가능한 목록으로 보여준다 - 고르면 입력창에 "티커"를 채우고 즉시 분석까지 실행한다(모호한 부분
// 일치(예: '삼성')를 findTickerByKoreanName()이 스스로 판단하지 못하는 문제를 여기서 해결).
// [2026-08 - 티커로 채우도록 수정] 종목 마스터 도입 전에는 후보가 전부 국내(한글명) 종목이라 입력창에
// "이름"을 채워도 findTickerByKoreanName()이 문제없이 다시 티커로 바꿔줬다. 이제 미국 종목(영문명)도
// 후보에 섞이는데, 영문명은 한글이 아니라서 그 자동 변환 분기를 안 타고 이름 문자열 그대로 조회를
// 시도해 실패한다 - 애초에 티커를 채우면 국내/해외 어느 쪽이든 곧장 정확하게 조회되므로 이렇게
// 통일했다(데이터셋에 티커 없이 이름만 있는 경우가 없어 안전).
function hideStockAnalysisSuggestions() {
  const el = document.getElementById('stockAnalysisSuggestions');
  el.classList.add('hidden');
  el.innerHTML = '';
}
function renderStockAnalysisSuggestions(candidates) {
  const el = document.getElementById('stockAnalysisSuggestions');
  if (candidates.length === 0) { hideStockAnalysisSuggestions(); return; }
  el.innerHTML = candidates.map((c) => `
    <button type="button" data-suggest-ticker="${escapeHtml(c.ticker)}" class="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
      <span class="truncate">${escapeHtml(c.name)} <span class="text-slate-400 text-sm">${escapeHtml(c.ticker)}</span></span>
      <span class="shrink-0 text-sm px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">${escapeHtml(c.sub)}</span>
    </button>`).join('');
  el.classList.remove('hidden');
  el.querySelectorAll('button[data-suggest-ticker]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('stockAnalysisTickerInput').value = btn.dataset.suggestTicker;
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
  let raw = tickerInput.value.trim();
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
    // [자동완성 1순위 자동 선택] 완전일치는 없지만 부분일치 후보가 정확히 1개면(candidates.length===1),
    // 사용자가 드롭다운을 따로 클릭하지 않고 [확인]/Enter만 눌러도 그 종목으로 바로 분석을 진행한다.
    // findTickerByKoreanName 자체도 "이름에 부분일치하는 고유 티커가 1개"면 이미 자동 매칭하지만,
    // 그 판정 기준(이름만 부분일치)과 이 후보 목록의 판정 기준(이름+티커, 대소문자 무시)이 완전히
    // 같지는 않아 서로 어긋나는 극히 드문 경우를 대비한 안전망이다 - 후보의 정식 이름으로 바꿔치기해
    // 아래 analyzeTickerForModal이 그 이름으로 다시 정확히 매칭하도록 한다.
    raw = candidates[0].name;
    tickerInput.value = raw;
  } else {
    hideStockAnalysisSuggestions();
    // [§46 MAC-DS-01] 매크로 지표 티커(^TNX · KRW=X · ^KS11 · ^VIX · GC=F · DX-Y.NYB 등)를 직접 입력하면
    // 종목 분석(주가 위치 · 최고가 등 종목용 표현)을 실행하지 않고, 매크로 타일과 같은 지표 팝업을 연다.
    // 한글 이름 · 자연어 검색은 지원하지 않는다(티커 직접 입력만). 지표 팝업(z-70)은 이 검색 팝업(z-65) 위에
    // 겹쳐 열린다 - 닫거나 뒤로가기를 누르면 검색 팝업으로 돌아온다(두 팝업을 한 번에 닫고 열면
    // history.back()이 비동기라 방금 연 팝업까지 닫힐 수 있다).
    const macroKey = getMacroKeyForTicker(sanitizeTicker(raw).yahooTicker);
    if (macroKey) {
      openStockDetailModal(MACRO_KEY_TICKERS[macroKey], MACRO_KEY_NAMES[macroKey]);
      return;
    }
  }

  loadingEl.classList.remove('hidden');
  const token = ++stockAnalysisRequestToken;
  const a = await analyzeTickerForModal(raw);
  if (token !== stockAnalysisRequestToken) return; // 그 사이 재검색/모달 닫힘 - 늦게 온 응답은 버림
  loadingEl.classList.add('hidden');

  if (a.error) {
    errorEl.textContent = a.error;
    errorEl.classList.remove('hidden');
    document.getElementById('stockAnalysisFundamentalSection').classList.add('hidden');
    document.getElementById('stockAnalysisFooterBody').classList.add('hidden');
    return;
  }
  const addAmountKRW = num(amountInput.value);
  const sim = addAmountKRW > 0 ? simulatePortfolioAddition(a.ticker, addAmountKRW) : null;
  // [섹션 순서 - 보유종목 세부내용 팝업과 동일하게] 1.헤더 2.차트(비보유 종목도 항상 그림) 3~4.본문
  // (핵심요약/주가위치기술적) 5.재무 펀더멘털(별도 섹션, attachFundamentalSection이 채움) 후,
  // 위험관리원칙+고지문은 항상 맨 마지막 footer 컨테이너에 별도로 넣는다.
  document.getElementById('stockAnalysisHeaderArea').innerHTML = renderStockAnalysisHeaderHtml(a);
  document.getElementById('stockAnalysisMainBody').innerHTML = renderStockAnalysisReportMain(a, sim);
  const footerEl = document.getElementById('stockAnalysisFooterBody');
  footerEl.innerHTML = renderStockAnalysisReportFooter(a);
  footerEl.classList.remove('hidden');
  resultEl.classList.remove('hidden');
  lucide.createIcons();
  const isForeign = !/\.(KS|KQ)$/i.test(a.ticker);
  renderStockAnalysisChart(a.ticker, a.name, isForeign);
  attachFundamentalSection(a.ticker, 'stockAnalysisFundamentalSection', 'stockAnalysisFundamentalBody');
}

// [모바일 키보드 대응] 검색창에 포커스가 가서 온스크린 키보드가 뜨면, 모바일 브라우저는 이 모달의
// 기준인 레이아웃 뷰포트는 줄이지 않고 시각적 뷰포트(visualViewport)만 줄인다 - 그 결과 가운데
// 정렬된 모달이 키보드에 가려지거나 화면 중간의 어중간한 위치에 뜬 채로 안 움직이는 문제가 있었다.
// window.visualViewport로 실제 보이는 영역(높이/오프셋)을 추적해 모달을 그 영역 상단에 붙이고,
// 카드 자체의 max-height도 그 영역에 맞게 동적으로 줄여서 입력창과 결과 일부가 항상 함께 보이게
// 한다. visualViewport를 지원하지 않는 구형 브라우저/데스크톱에서는 이 함수가 조용히 아무 것도
// 하지 않고, CSS의 max-h-[85dvh] + 기본 중앙 정렬로 자연스럽게 폴백된다.
function repositionStockAnalysisModalForViewport() {
  const vv = window.visualViewport;
  const overlay = document.getElementById('stockAnalysisModal');
  const card = overlay ? overlay.querySelector('.modal-anim') : null;
  if (!vv || !overlay || !card || overlay.classList.contains('hidden')) return;
  const topPad = 16;
  overlay.style.top = vv.offsetTop + 'px';
  overlay.style.height = vv.height + 'px';
  overlay.style.alignItems = 'flex-start';
  overlay.style.paddingTop = topPad + 'px';
  card.style.maxHeight = Math.max(200, vv.height - topPad * 2) + 'px';
}
function resetStockAnalysisModalViewportStyles() {
  const overlay = document.getElementById('stockAnalysisModal');
  const card = overlay ? overlay.querySelector('.modal-anim') : null;
  if (overlay) {
    overlay.style.top = '';
    overlay.style.height = '';
    overlay.style.alignItems = '';
    overlay.style.paddingTop = '';
  }
  if (card) card.style.maxHeight = '';
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', repositionStockAnalysisModalForViewport);
  window.visualViewport.addEventListener('scroll', repositionStockAnalysisModalForViewport);
}

function openStockAnalysisModal() {
  document.getElementById('stockAnalysisModal').classList.remove('hidden');
  document.getElementById('stockAnalysisErrorMsg').classList.add('hidden');
  document.getElementById('stockAnalysisResult').classList.add('hidden');
  document.getElementById('stockAnalysisFundamentalSection').classList.add('hidden');
  document.getElementById('stockAnalysisFooterBody').classList.add('hidden');
  document.getElementById('stockAnalysisTickerInput').value = '';
  document.getElementById('stockAnalysisAmountInput').value = '';
  hideStockAnalysisSuggestions();
  pushModalHistoryState();
  // [모바일 스크롤 위치 버그 수정] 이전 검색 결과가 길어서 스크롤을 내린 채로 닫았다가 다시 열면
  // 그 위치가 그대로 남아있던 문제 - 매번 최상단으로 되돌린다. 검색창 자동 포커스(기존 동작, 바로
  // 입력할 수 있게 함)는 유지하되 preventScroll로 포커스 이동이 스크롤을 다시 끌어내리지 않게 막는다.
  const body = document.getElementById('stockAnalysisModalBody');
  if (body) body.scrollTop = 0;
  repositionStockAnalysisModalForViewport();
  setTimeout(() => document.getElementById('stockAnalysisTickerInput').focus({ preventScroll: true }), 50);
}
function closeStockAnalysisModal(viaBackButton) {
  stockAnalysisRequestToken++; // 진행 중이던 조회가 있었다면 그 응답을 무시 처리
  hideStockAnalysisSuggestions();
  document.getElementById('stockAnalysisModal').classList.add('hidden');
  resetStockAnalysisModalViewportStyles();
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('stockAnalysisBtn').addEventListener('click', () => openStockAnalysisModal());
document.getElementById('stockAnalysisSearchBtn').addEventListener('click', () => runStockAnalysis());
document.getElementById('stockAnalysisTickerInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runStockAnalysis(); });
document.getElementById('stockAnalysisAmountInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runStockAnalysis(); });
// [천단위 콤마 자동 포맷팅 - 요청 반영] 매수 검토 금액 입력창.
attachThousandsInputFormatting(document.getElementById('stockAnalysisAmountInput'));
// [모바일 키보드 대응] 포커스 직후 바로 repositionStockAnalysisModalForViewport()를 부르면 아직
// 키보드가 올라오는 애니메이션 중이라 visualViewport 값이 최종 크기가 아닐 수 있다 - 키보드 표시
// 애니메이션이 끝날 시간(약 300ms)을 준 뒤 재배치하고, 입력창 자체도 부드럽게 보이는 영역으로
// 스크롤한다(대부분은 이미 화면 상단에 있어 움직이지 않지만, 안전장치로 둔다).
['stockAnalysisTickerInput', 'stockAnalysisAmountInput'].forEach((id) => {
  document.getElementById(id).addEventListener('focus', () => {
    setTimeout(() => {
      repositionStockAnalysisModalForViewport();
      document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
  });
});
document.getElementById('stockAnalysisModalHeader').addEventListener('click', () => closeStockAnalysisModal());
document.getElementById('closeStockAnalysisModalBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeStockAnalysisModal();
});
document.getElementById('stockAnalysisModal').addEventListener('click', (e) => {
  if (e.target.id === 'stockAnalysisModal') closeStockAnalysisModal();
});

