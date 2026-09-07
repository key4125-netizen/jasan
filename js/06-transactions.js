/* -------------------------------------------------------------------------
 * 10-4. [거래내역] 매매 거래 CRUD + 이동평균법 집계 + 기간별 실현손익
 *    - state.transactions가 원본(source of truth)이다. 계좌별·종목별 수량/평단가는 항상 거래내역에서
 *      다시 계산해 대시보드 자산에 동기화한다(syncAssetsFromTransactions). 계산이 실제와 다르면
 *      대시보드에서 수량/매수단가를 직접 고쳐도 되지만, 그 뒤 거래내역이 다시 바뀌면 이 동기화가 다시
 *      돌면서 자동 계산값으로 덮어써진다 - "거래내역이 정답"이라는 원칙을 일관되게 지키기 위함이다.
 * ---------------------------------------------------------------------- */

// 이동평균법: 매수 시 (기존 총매입금액+신규 매입금액)/(기존 수량+신규 수량)으로 평단가를 갱신하고,
// 매도 시 (매도단가-평단가)*매도수량-수수료를 실현손익으로 떼어내되 평단가 자체는 그대로 유지한다.
// 반환값의 annotated는 각 거래에 그 시점 실현손익(매도 건만)을 붙인 것으로, 기간별 손익 집계에 쓰인다.
// [해외주식 환차손익 반영] 평단가(avgPrice, 달러 등 거래 통화 기준)와 완전히 같은 방식으로 "매수 시점
// 환율의 가중평균(avgRate)"도 함께 추적한다 - 분할 매수마다 그때그때의 tx.appliedRate(없으면
// DEFAULT_LEGACY_FX_RATE)를 수량 가중으로 누적한다. 매도 시 원화 매도금액은 그 매도 건 자신의
// appliedRate(매도 시점 환율)로, 원화 매입원가는 포지션에 쌓인 avgRate(매수 시점 가중평균 환율)로
// 각각 환산해 차감하므로, 주가 차익과 환차손익이 하나의 확정 원화 금액에 함께 반영된다. 원화(KRW)
// 거래는 rate가 항상 1이라 이 로직을 그대로 타도 결과가 기존과 같다(환산이 사실상 없는 것과 동일).
/* [B-5] 거래/포지션 identity 키.
 *
 * 티커가 있으면 티커 하나가 종목도 통화도 시장도 결정하므로 예전 규칙 그대로다. 티커가 없으면
 * 이름만으로는 부족하다 - 같은 계좌 안에 이름이 같은 원화 자산과 달러 자산이 함께 있을 수 있는데,
 * 그 둘이 한 포지션으로 합쳐지면 수량·평단가·가중평균환율·실현손익이 통화가 섞인 값이 된다.
 *
 * 실측(감사 fixture): 같은 이름의 원화 매수 100주@10,000원 + 달러 매수 100주@$100 + 달러 매도
 * 50주@$120을 넣으면 포지션이 하나로 합쳐져 평단가 5,050 · 가중평균환율 650.5가 되고, 실현손익이
 * -155,551,250원으로 계산됐다(이름을 나눠 정상 분리하면 +2,200,000원).
 *
 * 거래 레코드에는 currency가 이미 있다(폼·엑셀·JSON 전부 저장한다) - 새 필드를 만들지 않고 그것만
 * 쓴다. isDomestic은 거래 스키마에 없으므로 여기서 추론하지 않는다(최종 보고서의 dependency 참고). */
function transactionIdentityKey(t) {
  const ticker = String(t.ticker ?? '').trim();
  return ticker
    ? `${t.owner}__${t.accountType}__${ticker}`
    : `${t.owner}__${t.accountType}__${t.name}__${t.currency}`;
}

/* [B-5] 자산 하나와 거래(또는 거래 포지션) 하나가 같은 대상을 가리키는지 판정한다.
 *
 * 예전에는 이 판정이 네 곳에 각자 인라인으로 흩어져 있었고 전부 통화를 보지 않았다. 그래서 같은
 * 이름의 원화 현금과 달러 현금이 함께 있으면 state.assets 배열에서 먼저 나오는 쪽이 매칭됐고,
 * 그게 원화 현금이면 바로 아래 원화현금 가드가 걸려 return 해버려 **달러 거래가 아예 반영되지
 * 않았다**(실측: 배열 순서만 바꿔도 총평가가 2,450만 <-> 2,015만으로 갈렸고, 반영되지 않은 쪽은
 * buyRate가 비어 환차손익 근거까지 사라졌다).
 *
 * 판정을 한 곳에 모아 네 호출부가 같은 규칙을 쓰게 한다 - 규칙이 갈라지면 "동기화는 건드리는데
 * 화면은 문제없다고 말하는" 상태가 다시 생긴다. */
function assetMatchesLedgerIdentity(asset, ledger) {
  if (asset.owner !== ledger.owner || asset.accountType !== ledger.accountType) return false;
  const ledgerTicker = String(ledger.ticker ?? '').trim();
  if (ledgerTicker) return asset.ticker === ledger.ticker;
  return !String(asset.ticker ?? '').trim() && asset.name === ledger.name && asset.currency === ledger.currency;
}

function computePositionsAndRealizedPnL() {
  const positions = {}; // key(transactionIdentityKey) -> { owner, accountType, ticker, name, currency, quantity, avgPrice, totalCost, avgRate, totalRateWeighted, realizedPnL }
  const sorted = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const annotated = sorted.map((tx) => {
    const key = transactionIdentityKey(tx);
    if (!positions[key]) positions[key] = { owner: tx.owner, accountType: tx.accountType, ticker: tx.ticker, name: tx.name, currency: tx.currency, quantity: 0, avgPrice: 0, totalCost: 0, avgRate: 1, totalRateWeighted: 0, realizedPnL: 0 };
    const pos = positions[key];
    const txRate = tx.currency === 'USD' ? (num(tx.appliedRate) || DEFAULT_LEGACY_FX_RATE) : 1;
    let computedRealizedPnL = null, computedSellAmount = null;
    if (tx.type === 'buy') {
      pos.totalCost += tx.quantity * tx.price + num(tx.fee);
      pos.totalRateWeighted += tx.quantity * txRate;
      pos.quantity += tx.quantity;
      pos.avgPrice = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
      pos.avgRate = pos.quantity > 0 ? pos.totalRateWeighted / pos.quantity : 1;
    } else {
      const sellQty = Math.min(tx.quantity, pos.quantity); // 보유수량보다 많이 팔 수 없도록 안전하게 clamp
      const buyRate = pos.avgRate || DEFAULT_LEGACY_FX_RATE; // 매수 시점 가중평균 환율(원화 매입원가에 적용)
      const krwSellAmount = tx.price * sellQty * txRate; // 원화 매도금액 = 매도가 × 매도수량 × 매도시점 환율
      const krwBuyCost = pos.avgPrice * sellQty * buyRate; // 원화 매입원가 = 평단가 × 매도수량 × 매수시점 가중평균 환율
      computedRealizedPnL = krwSellAmount - krwBuyCost - num(tx.fee) * txRate;
      computedSellAmount = krwSellAmount;
      pos.realizedPnL += computedRealizedPnL;
      pos.quantity = Math.max(0, pos.quantity - sellQty);
      pos.totalCost = pos.avgPrice * pos.quantity; // 평단가는 유지, 총원가만 남은 수량에 비례해 축소
      pos.totalRateWeighted = pos.avgRate * pos.quantity; // 가중평균 환율도 동일하게 유지, 누적치만 축소
    }
    pos.name = tx.name || pos.name;
    pos.currency = tx.currency || pos.currency;
    return { ...tx, computedRealizedPnL, computedSellAmount };
  });
  return { positions, annotated };
}

// [Phase 7-G - 매도 수량 검증 전용 헬퍼] computePositionsAndRealizedPnL()과는 별개의 경량 함수다 -
// 그 함수(평단가/실현손익까지 전부 계산)를 건드리지 않고, "지금 이 조합의 보유수량이 몇 개인가"만
// 빠르게 계산해 거래 저장 직전 UI 검증에 쓴다. excludeTxId: 수정 중인 거래 자기 자신은 계산에서
// 제외해야, "이 거래를 이렇게 고치면 보유수량을 넘는가"를 정확히 비교할 수 있다.
// [B-5] 매도 검증도 실제 계산(computePositionsAndRealizedPnL)과 반드시 같은 포지션을 봐야 한다 -
// 규칙이 갈라지면 "저장은 막았는데 계산은 다른 포지션을 보는" 상태가 된다. 같은 키 함수를 쓴다.
function computeCurrentHoldingQuantity(owner, accountType, ticker, name, currency, excludeTxId) {
  const key = transactionIdentityKey({ owner, accountType, ticker, name, currency });
  let qty = 0;
  [...state.transactions]
    .filter((t) => t.id !== excludeTxId && transactionIdentityKey(t) === key)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0))
    .forEach((t) => { qty += t.type === 'buy' ? t.quantity : -Math.min(t.quantity, qty); });
  return qty;
}

// [Phase 13 - Excel 대량 거래입력 초과매도 검증] 단건 입력(위 tx_id 저장 핸들러의 computeCurrentHoldingQuantity
// 호출)과 동일한 정책을 대량 업로드에도 적용하기 위한 사전 검증 헬퍼. computePositionsAndRealizedPnL()과
// 완전히 동일한 키 규칙(소유자__계좌구분__티커/이름)과 정렬 기준(날짜→생성시각)으로 "이번에 새로 추가될
// 거래(newRows)"를 기존 거래(existingTransactions)와 합쳐 순서대로 재생하면서, 매도 거래의 수량이 그
// 시점의 보유수량을 초과하는지 확인한다. 오직 newRows에 속한 거래만 위반으로 보고한다 - 이미 state에
// 있던 과거 거래(예: 이 검증이 생기기 전에 등록된 데이터)는 이번 작업 범위(신규 거래만 검증) 밖이라
// 재검증/재차단하지 않는다. 단, 과거 거래도 러닝밸런스 계산에는 그대로 포함시켜야(같은 clamp 규칙으로)
// 그 뒤에 오는 신규 거래의 "그 시점 보유수량"이 실제 커밋 후 계산(computePositionsAndRealizedPnL)과
// 정확히 같아진다. 이 함수는 state를 전혀 변경하지 않는다(순수 사전 검증 - 호출부가 결과에 따라 반영
// 여부를 결정).
function findExcelOversellViolations(newRows, existingTransactions, excelRowNumById) {
  const newIds = new Set(newRows.map((t) => t.id));
  const combined = existingTransactions.concat(newRows)
    .map((t, originalIdx) => ({ t, originalIdx }))
    // [정렬 안정성 명시화] Array.prototype.sort는 ES2019+에서 stable이 보장되므로 날짜+생성시각이
    // 동률이면 원래 배열 순서(엑셀 행 순서)가 그대로 유지된다 - computePositionsAndRealizedPnL과 동일한
    // 암묵적 가정이지만, 여기서는 originalIdx를 명시적 3차 tie-break로 넣어 그 가정에 의존하지 않게 한다
    // (실제 결과는 동일 - 검증 전용 헬퍼이므로 production 정렬 로직 자체는 손대지 않는다).
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || (a.t.createdAt || 0) - (b.t.createdAt || 0) || a.originalIdx - b.originalIdx)
    .map(({ t }) => t);

  const qtyByKey = new Map();
  const violations = [];
  combined.forEach((t) => {
    // [B-5] 위 computeCurrentHoldingQuantity와 같은 이유로 실제 계산과 동일한 키를 쓴다.
    const key = transactionIdentityKey(t);
    const available = qtyByKey.get(key) || 0;
    if (t.type === 'buy') {
      qtyByKey.set(key, available + t.quantity);
      return;
    }
    if (newIds.has(t.id) && t.quantity > available) {
      violations.push({
        rowNum: excelRowNumById ? excelRowNumById.get(t.id) : undefined,
        date: t.date, owner: t.owner, accountType: t.accountType,
        ticker: t.ticker, name: t.name, quantity: t.quantity, available
      });
    }
    qtyByKey.set(key, Math.max(0, available - Math.min(t.quantity, available)));
  });
  return violations;
}

// 초과매도 위반 목록을 사용자에게 보여줄 메시지로 조립한다 - 종목/거래종류/거래수량/그 시점 보유수량/
// 이유/(가능하면) 엑셀 행 번호를 최소 정보로 포함한다(요청 반영, 복잡한 전용 UI를 새로 만들지 않고
// 기존 alert() 관례를 그대로 따른다 - 이 파일의 다른 업로드 차단 메시지들과 동일한 패턴).
function buildExcelOversellAlertMessage(violations) {
  const lines = violations.map((v, i) => {
    const rowLabel = v.rowNum ? `[엑셀 ${v.rowNum}행] ` : '';
    const over = v.quantity - v.available;
    return `${i + 1}. ${rowLabel}${v.date} · ${v.owner} · ${v.accountType} · ${v.name}${v.ticker ? `(${v.ticker})` : ''} 매도 ${fmtNum(v.quantity, 4)} - 그 시점 보유수량 ${fmtNum(v.available, 4)} (${fmtNum(over, 4)} 초과)`;
  });
  return `초과 매도가 발견되어 이번 업로드를 적용하지 않았습니다(파일 전체가 반영되지 않았습니다).\n`
    + `아래 거래의 수량을 보유수량 이하로 고친 뒤 다시 올려주세요.\n\n${lines.join('\n')}`;
}

// [Phase 22 STEP 4] 위 buildExcelOversellAlertMessage()와 동일한 위반 목록 구조를 그대로 받아 JSON
// 백업 "추가하기" 컨텍스트에 맞는 문구로만 바꾼 wrapper - "업로드"/"엑셀 N행"이라는 표현이 JSON 복원
// 상황과 맞지 않아 문구만 분리했다(위반 판정 로직/데이터 구조는 완전히 동일, 재사용).
function buildJsonImportOversellAlertMessage(violations) {
  const lines = violations.map((v, i) => {
    const over = v.quantity - v.available;
    return `${i + 1}. ${v.date} · ${v.owner} · ${v.accountType} · ${v.name}${v.ticker ? `(${v.ticker})` : ''} 매도 ${fmtNum(v.quantity, 4)} - 그 시점 보유수량 ${fmtNum(v.available, 4)} (${fmtNum(over, 4)} 초과)`;
  });
  return `초과 매도가 발견되어 이번 추가하기를 적용하지 않았습니다(기존 데이터가 그대로 유지됩니다).\n`
    + `아래 거래 때문에 보유수량을 초과하는 매도가 발생합니다 - 백업 파일을 확인해주세요.\n\n${lines.join('\n')}`;
}

// [현금/외화현금 - 무티커 자산 유형별 이원화] 부동산/채권/상장 주식·ETF는 계속 거래내역(매수/매도)으로
// 추적한다. 원화 현금은 여기에 더해 거래내역 자체를 만들 수 없게 막고 자산관리 탭에서 직접 잔고를
// 수정하는 방식을 유지한다(환율 개념이 없어 거래내역화할 실익이 없음). ticker가 있으면 애초에 상장
// 종목이라 대상이 아니다.
// [버그 수정 - 신규 생성 경로 누락] 예전엔 "이미 존재하는 현금 자산"과 이름/소유자/계좌구분이 일치할
// 때만 막았다 - 그런데 대량 거래내역 업로드(엑셀)처럼 아직 매칭되는 자산이 하나도 없는 상태에서
// "현금"/"달러" 같은 이름의 거래가 처음 들어오면 이 함수가 null을 반환해 그대로 통과되고,
// syncAssetsFromTransactions()가 classifyCategory()로 '현금'이라고 자동판별해 새 현금 자산을 만들어
// 버렸다(차단이 무력화됨). 이제 기존 자산 매칭에 더해, classifyCategory()의 자동판별 결과가 '현금'이면
// (CASH_KEYWORDS 참고) 매칭되는 기존 자산이 없어도 동일하게 차단한다.
// [달러(외화) 현금 - 거래내역 기반 전환] 원화와 달리 달러 현금은 매수/매도 시점 환율에 따라 환차손익이
// 발생한다 - 이걸 추적하려면 주식과 똑같이 거래내역 기반 가중평균 매입환율(computePositionsAndRealizedPnL의
// avgRate)이 필요하므로, currency==='USD'인 경우는 더 이상 여기서 차단하지 않고 그대로 통과시킨다
// (호출부가 통화 값을 함께 넘겨줘야 한다).
function findMatchingCashAsset(owner, accountType, ticker, name, currency) {
  if (ticker) return null;
  if (currency === 'USD') return null;
  const existing = state.assets.find((a) => !a.ticker && a.category === '현금' && a.owner === owner && a.accountType === accountType && a.name === name);
  if (existing) return existing;
  if (classifyCategory(ticker, name) === '현금') return { owner, accountType, ticker: '', name, category: '현금' };
  return null;
}

// 거래내역 기준 최종 수량/평단가를 대시보드 자산 목록에 반영한다. 이미 있는 자산(소유자+계좌구분+티커
// 일치, 티커 없으면 소유자+계좌구분+종목명 일치)이면 수량/매수단가만 덮어쓰고, 없으면 새로 만든다.
// 전량 매도(수량 0 이하)된 포지션은 자산을 지우지 않고 수량만 0으로 남긴다(삭제는 되돌리기 어려운
// 작업이라 사용자가 원할 때 직접 지우도록 함).
// [부동산/실물채권/절세계좌 거래내역 동기화] 예전엔 티커가 없는 거래(부동산, 실물채권 등 시세 조회가
// 안 되는 자산)를 자동 동기화 대상에서 통째로 제외했다(!pos.ticker 가드) - 거래내역 탭에 기록해도
// 자산 목록에는 전혀 반영되지 않아, 이런 자산은 자산관리 탭에서 별도로 직접 등록/수정해야 했다. 이제
// 티커가 없으면 종목명(pos.name)을 대신 매칭 키로 써서 정상 동기화한다(computePositionsAndRealizedPnL도
// 이미 "티커 || 이름"으로 포지션을 구분해왔으므로 그 결과를 그대로 반영하는 것뿐이다). 같은 소유자·
// 계좌 안에서 이름까지 같아야 동일 자산으로 보므로, 서로 다른 부동산 2건을 같은 이름으로 적지만
// 않으면 섞이지 않는다.
// [원화 현금 보호] '현금' 카테고리는 원화만 거래내역을 아예 만들 수 없지만(위 findMatchingCashAsset로
// 신규 입력을 막음), 이 정책 이전에 이미 쌓여있던 과거 거래(구 잔고조정 등)가 남아 있을 수 있다 - 그런
// 레거시 거래 때문에 원화 현금 자산의 수동 수정값이 재동기화 때마다 조용히 덮어써지는 일이 없도록,
// 매칭되는 자산이 원화 '현금' 카테고리면 이 함수가 절대 건드리지 않고 그대로 건너뛴다(수량을 0으로
// 만드는 것도 포함). 달러(외화) 현금은 이제 거래내역 기반으로 관리하므로 이 가드에서 제외한다.
function syncAssetsFromTransactions() {
  const { positions } = computePositionsAndRealizedPnL();
  Object.values(positions).forEach((pos) => {
    // [B-5] 통화까지 보고 정확한 자산을 먼저 고른다(assetMatchesLedgerIdentity). 예전에는 이름만
    // 봤기 때문에 같은 이름의 원화 현금이 배열에서 먼저 나오면 그것이 매칭되고, 바로 아래 원화현금
    // 가드가 걸려 return 해버려 정작 이 포지션의 주인인 달러 자산이 영영 갱신되지 않았다 - 가드가
    // 잘못된 자산 위에서 실행된 것이지 가드 자체가 문제가 아니었다. 순서는 그대로 두고(매칭 → 가드
    // → 반영) 매칭만 정확하게 만든다.
    let asset = state.assets.find((a) => assetMatchesLedgerIdentity(a, pos));
    if (asset && asset.category === '현금' && asset.currency !== 'USD') return; // 원화 현금만 자산관리 탭 전용 - 절대 덮어쓰지 않는다
    // [Phase 50 - P0-1] 자산 마스터가 수량을 관리한다고 스스로 적어 둔 자산(positionSource='manual',
    // Phase 49)은 거래원장이 덮어쓰지 않는다. 바로 위 원화 현금 가드와 같은 성격의 예외이며, 차이는
    // "카테고리로 추정한 예외"가 아니라 "자산에 저장된 사실에 따른 예외"라는 점이다.
    // 이 가드가 없으면, 같은 소유자·계좌·티커(또는 이름)를 가진 거래가 하나라도 생기는 순간 사용자가
    // 자산 화면에서 직접 입력한 수량/취득가가 매 부팅마다 조용히 거래원장 값으로 되돌아간다.
    // legacy 자산(표식 없음)은 여기에 걸리지 않는다 - 예전과 완전히 같은 경로로 흐른다. 표식이 없는
    // 자산을 "거래가 있으니 ledger겠지"라고 추정해 저장하지 않는다(PM 확정 정책).
    if (asset && asset.positionSource === 'manual') return;
    if (pos.quantity <= 0) {
      // [가족 동기화 - 스마트 머지] 값이 실제로 바뀔 때만 updatedAt을 찍는다 - 이 함수는 부팅마다
      // 실행되는 안전망 재계산이라, 매번 무조건 찍으면 아무것도 안 바뀌었는데도 "방금 수정됨"으로
      // 보여 병합 시 진짜 편집을 이겨버릴 수 있다.
      if (asset && asset.quantity !== 0) { asset.quantity = 0; asset.updatedAt = Date.now(); }
      return;
    }
    if (!asset) {
      // [Phase 49] 이 자산은 거래원장에서 태어났다 - 추측이 아니라 사실이므로 여기서 명시한다.
      // 이미 있던 자산(아래 else 분기)에는 소급해서 찍지 않는다 - 그건 별도 승인이 필요한 판단이다.
      asset = makeAsset({ ticker: pos.ticker, owner: pos.owner, accountType: pos.accountType, name: pos.name, quantity: pos.quantity, buyPrice: pos.avgPrice, currency: pos.currency, positionSource: 'ledger' });
      state.assets.push(asset);
      // [최초 등록 소급 히스토리] 거래내역(엑셀 업로드/거래 추가)으로 처음 생긴 자산만 해당 - 이미
      // 있던 자산의 수량/매수단가 갱신(else 분기)에는 다시 호출하지 않는다(중복 소급 방지, 자연히
      // 멱등적이다). 네트워크 호출이라 굳이 기다리지 않고 백그라운드로 흘려보낸다. 티커가 없는 자산
      // (부동산/실물채권 등)은 시세 조회 자체가 불가능하므로 호출하지 않는다.
      if (pos.ticker) backfillDailyPnlHistory(asset);
    } else if (asset.quantity !== pos.quantity || asset.buyPrice !== pos.avgPrice) {
      asset.quantity = pos.quantity;
      asset.buyPrice = pos.avgPrice;
      asset.updatedAt = Date.now();
    }
    // [미실현 평가손익 환차 반영] 해외통화 포지션이면 거래내역에서 계산된 매수시점 가중평균 환율
    // (pos.avgRate)을 자산에 함께 저장해둔다 - calcRow()가 매입원가를 오늘 환율이 아니라 이 값으로
    // 환산해서, 보유 중인(아직 안 판) 포지션의 누적 평가손익에도 환차손익이 반영되게 한다.
    if (asset && pos.currency === 'USD' && asset.buyRate !== pos.avgRate) {
      asset.buyRate = pos.avgRate;
      asset.updatedAt = Date.now();
    }
  });
}

// [삭제/수정 버튼 게이팅 - 거래내역 추적 여부] 이 자산과 매칭되는 거래(소유자+계좌구분+티커, 티커
// 없으면 이름+통화)가 거래내역에 하나라도 있으면 true - openAssetDetailModal/assetDetailOwnerRowHtml이
// 이 값으로 [수정]/[삭제] 버튼을 숨긴다(거래내역이 잔고의 근거이므로 여기서 직접 못 고치게).
// [B-5] 동기화와 같은 판정 함수를 쓴다 - 예전엔 통화를 보지 않아, 같은 이름의 달러 자산에 거래가
// 있다는 이유로 원화 자산의 [수정] 버튼까지 사라졌다(그 반대도 마찬가지).
function isTransactionTracked(a) {
  return state.transactions.some((t) => assetMatchesLedgerIdentity(a, t));
}

/* =========================================================================
 * [Phase 50 - P0-2] 거래원장과 자산 마스터가 어긋난 상태를 "탐지"만 한다.
 *
 * 이 블록은 아무것도 고치지 않는다. 자산 삭제·수량 0·취득가 0·positionSource 자동 변경·소유자/
 * 계좌/티커 자동 변경을 전부 하지 않는다. 목적은 자동 정리가 아니라 안전한 탐지와 보존이다.
 *
 * [왜 "거래내역이 없다 = 고아"가 아닌가]
 * 부동산·원화현금·자산 화면에서 직접 등록한 종목은 거래내역이 없는 것이 정상이다. 그 단순 규칙을
 * 쓰면 멀쩡한 자산 다수를 문제로 표시하게 된다. 그래서 판단 기준은 "거래가 있는가"가 아니라
 * "이 자산이 스스로 적어 둔 원천과 지금 상태가 어긋나는가"다.
 *
 * [legacy 자산은 판정하지 않는다]
 * positionSource가 없는 자산은 원천을 알 수 없다. 현재 거래 존재 여부로 추정해 경고를 띄우면
 * 사용자에게 "고치라"고 말하면서 정작 무엇이 맞는지는 앱도 모르는 상태가 된다. 확실하지 않으면
 * 데이터도 화면도 건드리지 않는다 - 데이터를 고치는 것보다 잘못 고치지 않는 것이 우선이다.
 * ====================================================================== */
const POSITION_CONSISTENCY = Object.freeze({
  OK: 'OK',
  LEDGER_WITHOUT_TX: 'LEDGER_WITHOUT_TX', // 거래원장 기반이라고 적혀 있는데 매칭되는 거래가 없다
  MANUAL_WITH_TX: 'MANUAL_WITH_TX'        // 자산 마스터 기반인데 매칭되는 거래가 있고 값이 어긋난다
});

// 초보자가 읽을 문구다 - 무엇이 잘못됐는지 단정하지 않고(앱도 어느 쪽이 맞는지 모른다) 확인을
// 요청하기만 한다. 자동 해결 버튼을 두지 않는 것과 같은 이유다.
const POSITION_CONSISTENCY_MESSAGES = Object.freeze({
  LEDGER_WITHOUT_TX: '거래내역이 확인되지 않는 거래원장 기반 자산입니다. 거래내역을 지웠거나 파일로 덮어썼다면 내용을 확인해 주세요.',
  MANUAL_WITH_TX: '거래내역과 자산 정보가 일치하지 않습니다. 내용을 확인해 주세요.'
});

// 취득가는 나눗셈으로 나온 실수라 왕복 과정에서 끝자리가 흔들릴 수 있다 - 그 정도 차이로 경고를
// 띄우면 아무 문제 없는 자산이 매번 문제로 보인다.
function positionValuesDiffer(assetValue, ledgerValue) {
  const a = num(assetValue), b = num(ledgerValue);
  return Math.abs(a - b) > Math.max(1e-9, Math.abs(b) * 1e-9);
}

// syncAssetsFromTransactions()가 자산을 찾을 때 쓰는 것과 같은 판정(assetMatchesLedgerIdentity -
// 소유자+계좌구분+티커, 티커가 없으면 이름+통화)을 그대로 쓴다 - 두 곳이 다르게 판단하면
// "동기화는 건드리는데 화면은 문제없다고 말하는" 상태가 된다.
function findLedgerPositionForAsset(asset, positions) {
  const map = positions || computePositionsAndRealizedPnL().positions;
  return Object.values(map).find((p) => assetMatchesLedgerIdentity(asset, p)) || null;
}

function assessPositionConsistency(asset, positions) {
  const out = (status, extra) => Object.assign({ status, message: POSITION_CONSISTENCY_MESSAGES[status] || '' }, extra || {});
  if (!asset) return out(POSITION_CONSISTENCY.OK);
  // 원화 현금은 시스템 정책상 거래원장이 관리하지 않는다(syncAssetsFromTransactions의 첫 가드).
  // 옛 거래가 남아 있어도 그건 어긋난 상태가 아니라 의도된 예외다.
  if (asset.category === '현금' && asset.currency !== 'USD') return out(POSITION_CONSISTENCY.OK);
  if (asset.positionSource === undefined) return out(POSITION_CONSISTENCY.OK); // legacy - 판정하지 않는다

  const pos = findLedgerPositionForAsset(asset, positions);
  if (asset.positionSource === 'ledger') {
    return pos ? out(POSITION_CONSISTENCY.OK) : out(POSITION_CONSISTENCY.LEDGER_WITHOUT_TX);
  }
  // manual - 거래가 아예 없으면 정상이다(부동산·직접등록 자산이 원래 그렇다).
  if (!pos) return out(POSITION_CONSISTENCY.OK);
  const differs = positionValuesDiffer(asset.quantity, pos.quantity) || positionValuesDiffer(asset.buyPrice, pos.avgPrice);
  return differs
    ? out(POSITION_CONSISTENCY.MANUAL_WITH_TX, { ledgerQuantity: pos.quantity, ledgerBuyPrice: pos.avgPrice })
    : out(POSITION_CONSISTENCY.OK);
}

// [보유자산 양식 다운로드] 버튼 - 아직 거래내역이 하나도 없는 보유 종목들을, 지금의 수량/매수단가로
// "구분=최초" 행을 미리 채운 엑셀로 내려준다(일자는 어제로 기본 채움). 예전엔 이 버튼이 거래내역을
// 바로 생성했지만, "기간거래등록" 업로드와 창구를 하나로 합쳐달라는 요청에 따라 이제는 그 업로드 양식을
// 미리 채워서 내려주는 역할만 한다 - 사용자가 이 파일을 열어 실제 매매(구분=기간)를 이어서 적고, 완성된
// 파일을 [기간거래등록]으로 올리면 최초/기간 행이 한 번에 등록된다. 이미 거래내역이 있는 종목은
// (중복 등록 방지 차원에서) 양식에서 제외한다.
function downloadHoldingsAsTxTemplate() {
  // [부동산/채권 등 티커 없는 실보유자산 포함] syncAssetsFromTransactions()가 이제 이름 매칭으로도
  // 동기화되므로, 이 양식도 티커 유무와 무관하게 "현재 등록된 실보유자산" 전체를 대상으로 한다 -
  // 티커 없는 자산은 매칭 키로 티커 대신 종목명을 쓴다(동일 소유자·계좌·이름 조합으로 중복 판별).
  // [원화 현금만 제외 - 달러 현금은 이제 거래내역 추적 대상] 원화(KRW) 현금은 여전히 자산관리 탭에서만
  // 직접 수정하므로 양식에서 제외하지만(findMatchingCashAsset/syncAssetsFromTransactions과 동일 정책),
  // 달러(USD) 현금은 거래내역 기반 가중평균 환율 관리로 전환되었으므로(migrateUsdCashAssetsToTransactions
  // 참고) 다른 보유자산과 동일하게 양식 대상에 포함한다 - 소유자와 무관하게 이 기준을 동일 적용한다.
  const existingKeys = new Set(state.transactions.map((t) => `${t.owner}__${t.accountType}__${t.ticker || t.name}`));
  const targets = state.assets.filter((a) => {
    if (a.category === '현금' && a.currency !== 'USD') return false;
    if (num(a.quantity) <= 0) return false;
    return !existingKeys.has(`${a.owner}__${a.accountType}__${a.ticker || a.name}`);
  });

  if (targets.length === 0) {
    showToast('거래내역이 없는 보유 종목이 없습니다(이미 전부 등록됨).', 'warn');
    return;
  }

  const seedDate = yesterdayDateStr();
  const rows = targets.map((a) => ({
    '구분': '최초', '일자': seedDate, '소유자': a.owner, '계좌구분': a.accountType, '종목명': a.name,
    '티커': a.ticker, '거래유형': '매수', '수량': num(a.quantity), '매매단가': num(a.buyPrice),
    // [적용환율] 해외통화 보유분은 매수 시점 환율 기록이 없으므로 추정 기본값(DEFAULT_LEGACY_FX_RATE)을
    // 미리 채워 내려준다 - 실제 매수 시점 환율을 알면 사용자가 직접 고쳐 올릴 수 있다.
    '통화': a.currency, '적용환율': a.currency === 'USD' ? DEFAULT_LEGACY_FX_RATE : '', '수수료': 0
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '거래내역');
  XLSX.writeFile(wb, `거래내역_양식_${todayDateStr()}.xlsx`);
  showToast(`${targets.length}개 종목을 '최초' 행으로 채운 양식을 내려받았습니다. 실제 거래(구분=기간)를 추가로 적은 뒤 [기간거래등록]으로 올려주세요.`, 'success', 7000);
}
document.getElementById('seedTransactionsBtn').addEventListener('click', downloadHoldingsAsTxTemplate);

// [거래 백업] 버튼 - 지금까지 등록된 거래내역 전체(최초+기간 구분 없이 전부)를 엑셀로 내려받는다.
// 헤더/컬럼 구성을 downloadHoldingsAsTxTemplate()과 완전히 동일하게 맞춰서, 이 파일을 그대로
// [거래등록] 업로드에 다시 올려도(예: 다른 기기로 이전, 실수로 데이터초기화한 뒤 복구 등) 문제없이
// 파싱된다 - 위 txExcelFileInput 핸들러의 pick() 헤더 매칭과 1:1로 대응.
function downloadTransactionsBackup() {
  if (state.transactions.length === 0) {
    showToast('백업할 거래내역이 없습니다.', 'warn');
    return;
  }
  const sorted = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const rows = sorted.map((t) => ({
    '구분': t.origin === 'initial' ? '최초' : '기간',
    '일자': t.date, '소유자': t.owner, '계좌구분': t.accountType, '종목명': t.name,
    '티커': t.ticker, '거래유형': t.type === 'sell' ? '매도' : '매수',
    '수량': num(t.quantity), '매매단가': num(t.price),
    '통화': t.currency, '적용환율': t.currency === 'USD' ? (num(t.appliedRate) || '') : '', '수수료': num(t.fee)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '거래내역');
  const stamp = todayDateStr().replace(/-/g, '');
  XLSX.writeFile(wb, `거래내역_백업_${stamp}.xlsx`);
  showToast(`거래내역 ${rows.length}건을 백업했습니다.`, 'success');
}
document.getElementById('backupTransactionsBtn').addEventListener('click', downloadTransactionsBackup);

// [거래등록 - 엑셀 업로드] 밀린 실제 매매를 한 번에 등록할 때 쓴다 - JSON 백업 복원과 동일하게
// [기존 데이터 덮어쓰기]/[추가하기]/[취소]를 선택하는 모달을 띄운다(openImportChoiceModal 재사용).
// 헤더: 일자/소유자/계좌구분/종목명/티커/거래유형
// (매수 또는 매도)/수량/매매단가/통화(KRW·USD)/수수료. 업로드 후 이동평균 재계산+자산 동기화까지 한번에 처리된다.
function formatDateCell(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed)) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return todayDateStr(); // 날짜를 못 읽으면 안전하게 오늘 날짜로 폴백(거래 자체를 버리지 않기 위함)
}

// [거래등록 - 내용 기반 중복 거래 스킵] 엑셀 행은 매번 새 id(genId())를 받기 때문에 JSON 백업 복원처럼
// id로는 중복을 가려낼 수 없다 - 대신 실제 거래 내용(소유자+계좌구분+티커/이름+일자+거래유형+수량+
// 매매단가)이 완전히 같은 기존 거래가 있으면 "같은 거래를 실수로 다시 올린 것"으로 보고 등록하지
// 않는다. 수수료는 사용자가 매번 다르게 적어도 같은 거래로 볼 수 있어(계산 영향도 미미) 식별 키에서
// 제외했다.
function transactionContentKey(t) {
  return [t.owner, t.accountType, t.ticker || t.name, t.date, t.type, num(t.quantity), num(t.price)].join('|');
}

document.getElementById('importTxExcelBtn').addEventListener('click', () => document.getElementById('txExcelFileInput').click());

document.getElementById('txExcelFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);

      // [Phase 13 - 엑셀 행 번호 추적] tx 객체 자체에는 스키마 외 필드를 절대 섞지 않는다(그대로
      // state.transactions에 들어갈 객체라 오염되면 안 됨) - 대신 id -> 엑셀 행 번호(헤더가 1행이라
      // 데이터는 2행부터 시작)를 별도 Map으로만 들고 있다가 초과매도 오류 메시지에서만 조회한다.
      const excelRowNumById = new Map();
      const parsed = json.map((row, rowIdx) => {
        const typeRaw = String(pick(row, '거래유형', 'type', 'Type') ?? '').trim().toLowerCase();
        const type = (typeRaw === '매도' || typeRaw === 'sell') ? 'sell' : 'buy';
        const currencyRaw = String(pick(row, '통화', 'Currency', 'CURRENCY') ?? '').trim().toUpperCase();
        // '구분' 컬럼(최초/기간)은 계산에는 아무 영향이 없다(둘 다 동일한 매수/매도 거래로 처리됨) -
        // 거래 목록에서 "이게 시작점이었지"를 구분해 보여주기 위한 표시 전용 태그다.
        const originRaw = String(pick(row, '구분', 'origin') ?? '').trim();
        const origin = originRaw.includes('최초') ? 'initial' : 'period';
        const tx = {
          id: genId(),
          date: formatDateCell(pick(row, '일자', '날짜', 'date', 'Date')),
          // [V1.1] 파일에 적힌 소유자를 그대로 읽는다. 유효하지 않아도 신랑/와이프로 바꾸지 않는다 -
          // 가져오기가 사용자 데이터를 조용히 바꾸는 것이 더 위험하다(자산 상세에서 알린다).
          owner: String(pick(row, '소유자', 'owner') ?? '').trim(),
          accountType: String(pick(row, '계좌구분', 'accountType') ?? '').trim() || '일반계좌',
          ticker: String(pick(row, 'ticker', 'Ticker', '티커') ?? '').trim(),
          name: String(pick(row, '종목명', 'name') ?? '').trim() || '이름없음',
          type,
          quantity: num(pick(row, '수량', 'quantity')),
          price: num(pick(row, '매매단가', '단가', 'price')),
          currency: currencyRaw === 'USD' ? 'USD' : 'KRW',
          // [적용환율] '적용환율' 컬럼에 값이 있으면 그대로 쓰고, 해외통화인데 비어 있으면 업로드
          // 시점의 실시간 환율(state.exchangeRate)을 대신 적용한다(요청 스펙: 미기재 시 실시간 환율).
          appliedRate: currencyRaw === 'USD'
            ? (num(pick(row, '적용환율', '환율', 'appliedRate', 'AppliedRate')) || state.exchangeRate)
            : undefined,
          fee: num(pick(row, '수수료', '세금', '수수료/세금', 'fee')),
          origin,
          createdAt: Date.now(),
          updatedAt: Date.now() // [가족 동기화 - 스마트 머지]
        };
        excelRowNumById.set(tx.id, rowIdx + 2);
        return tx;
      }).filter((t) => t.quantity > 0 && t.price > 0 && t.name);

      // [현금/외화현금 거래내역 차단] 기존 보유 '현금' 자산과 이름/소유자/계좌구분이 일치하는 행은
      // 엑셀 업로드로도 등록할 수 없다 - 자산관리 탭에서 직접 잔고를 수정하도록 유도한다.
      let cashSkippedCount = 0;
      const importable = parsed.filter((t) => {
        if (findMatchingCashAsset(t.owner, t.accountType, t.ticker, t.name, t.currency)) { cashSkippedCount++; return false; }
        return true;
      });

      if (importable.length === 0) {
        alert(cashSkippedCount > 0
          ? `현금/외화 자산 거래 ${cashSkippedCount}건은 등록할 수 없어 전부 건너뛰었습니다. 자산관리 탭에서 직접 잔고를 수정해주세요.`
          : '가져올 거래 데이터가 없습니다. (일자, 소유자, 계좌구분, 종목명, 거래유형, 수량, 매매단가 헤더를 확인하세요)');
        return;
      }

      // [거래등록 - 덮어쓰기/추가 선택] 예전엔 항상 기존 거래내역에 이어붙였으나(엑셀을 잘못 두 번
      // 올리면 중복 등록됨), JSON 백업 복원과 동일한 선택 모달(openImportChoiceModal)을 재사용해
      // [기존 데이터 덮어쓰기]/[기존 데이터에 추가하기]/[취소]를 명시적으로 고르게 한다.
      const choice = await openImportChoiceModal(`${importable.length}건의 거래를 등록합니다.\n기존 거래내역을 덮어쓸까요, 추가할까요?`);
      if (choice === 'cancel') return;
      const cashSkipSuffix = cashSkippedCount > 0 ? ` (현금/외화 거래 ${cashSkippedCount}건은 등록 불가로 건너뜀)` : '';
      let resultMsg;
      if (choice === 'overwrite') {
        // [Phase 13 - 초과매도 사전 검증] 덮어쓰기는 기존 거래를 전부 버리므로, 새로 들어올 importable
        // 자체만으로 러닝밸런스를 재생해 검증한다(부분 반영 없이 전체 반영/전체 거부의 atomic 방식 -
        // 오류가 하나라도 있으면 state를 전혀 건드리지 않고 그대로 중단한다).
        const violations = findExcelOversellViolations(importable, [], excelRowNumById);
        if (violations.length > 0) { alert(buildExcelOversellAlertMessage(violations)); return; }
        state.transactions = importable;
        resultMsg = `거래내역 ${importable.length}건을 덮어썼습니다.${cashSkipSuffix}`;
      } else {
        // [내용 기반 중복 스킵] 기존 거래내역 + "이번 업로드에서 이미 받아들인 행"까지 함께 키로 관리해,
        // 같은 파일 안에 똑같은 행이 여러 번 있어도 한 번만 반영되게 한다.
        const seenKeys = new Set(state.transactions.map(transactionContentKey));
        const newOnes = [];
        let dupCount = 0;
        importable.forEach((t) => {
          const key = transactionContentKey(t);
          if (seenKeys.has(key)) { dupCount++; return; }
          seenKeys.add(key);
          newOnes.push(t);
        });
        // [Phase 13 - 초과매도 사전 검증] 추가하기는 기존 거래내역이 그대로 남으므로, 중복을 제외한
        // 신규분(newOnes)을 기존 거래와 합쳐(existingTransactions 포함) 러닝밸런스를 재생해야 "그
        // 시점 보유수량"이 실제 커밋 후 계산과 정확히 같아진다. 여기서도 오류가 하나라도 있으면 state를
        // 전혀 건드리지 않는다(dupCount 계산까지는 이미 끝났지만, 실제 state.transactions 대입은 아직
        // 하지 않았으므로 이 시점에 중단해도 부분 반영이 생기지 않는다).
        const violations = findExcelOversellViolations(newOnes, state.transactions, excelRowNumById);
        if (violations.length > 0) { alert(buildExcelOversellAlertMessage(violations)); return; }
        state.transactions = state.transactions.concat(newOnes);
        resultMsg = `총 ${importable.length}건 중 신규 ${newOnes.length}건 등록, 중복 ${dupCount}건 건너뜀${cashSkipSuffix}`;
      }
      persistTransactions();
      syncAssetsFromTransactions();
      persistAssets();
      renderTransactionsTab();
      renderAll();
      showToast(resultMsg, 'success', 7000);
    } catch (err) {
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
});

// [해외주식 적용 환율 입력란] 통화가 USD일 때만 '적용 환율' 입력란을 보여준다 - 거래 등록 시점의
// 실시간 환율(state.exchangeRate)을 기본값으로 채워주되, 이미 값이 있으면(수정 모드에서 기존 저장값을
// 불러온 경우) 덮어쓰지 않고 사용자가 직접 고쳐 저장할 수 있다.
// [달러 현금 거래 판별] 티커 없고 통화가 USD이면서 종목명이 '현금' 카테고리로 자동분류되는 거래 -
// findMatchingCashAsset()가 더 이상 차단하지 않는 대상과 정확히 같은 조건이다.
function isUsdCashTxForm() {
  const ticker = document.getElementById('tx_ticker').value.trim();
  const name = document.getElementById('tx_name').value.trim();
  const currency = document.getElementById('tx_currency').value;
  return !ticker && currency === 'USD' && classifyCategory(ticker, name) === '현금';
}

// [달러 현금 거래 - 가격 1 고정] 현금성 자산은 "단가" 개념이 없고 수량 자체가 곧 달러 금액이다 - 매매
// 단가를 1로 고정해 잠그고, 수량 라벨을 "금액($)"으로 바꿔 사용자가 헷갈리지 않게 한다.
function updateTxCashPriceLock() {
  const isCash = isUsdCashTxForm();
  const priceInput = document.getElementById('tx_price');
  const qtyLabel = document.getElementById('tx_quantityLabel');
  priceInput.readOnly = isCash;
  priceInput.classList.toggle('bg-slate-100', isCash);
  priceInput.classList.toggle('dark:bg-slate-800/80', isCash);
  priceInput.classList.toggle('cursor-not-allowed', isCash);
  if (isCash) priceInput.value = 1;
  if (qtyLabel) qtyLabel.textContent = isCash ? '금액($) - 넣거나 뺀 달러 금액' : '수량';
}

// [적용 환율 기본값 - 스마트 디폴트] 평소엔 조회 시점의 실시간 환율을 기본값으로 쓰지만, "달러 현금
// 매도(출금/환전)"만은 예외로 그 포지션의 매수 시점 가중평균 환율(computePositionsAndRealizedPnL의
// avgRate)을 기본값으로 채운다 - 실제 환전 시 받은 환율을 사용자가 알고 있으면 그 값으로 덮어써서
// 확정 환차손익을 정확히 기록하고, 모르면 이 가중평균값 그대로 두어도 "원금 그대로 출금"으로
// 합리적으로 처리된다. 필드에 아직 손대지 않은 경우(autofilled 마커)에만 자동으로 갱신한다 -
// 사용자가 직접 고친 값은 절대 덮어쓰지 않는다.
function getSuggestedAppliedRate() {
  const type = document.getElementById('tx_type').value;
  if (type === 'sell' && isUsdCashTxForm()) {
    const owner = document.getElementById('tx_owner').value;
    const accountType = document.getElementById('tx_accountType').value.trim() || '일반계좌';
    const name = document.getElementById('tx_name').value.trim();
    const { positions } = computePositionsAndRealizedPnL();
    const pos = positions[`${owner}__${accountType}__${name}`];
    if (pos && pos.quantity > 0 && Number.isFinite(pos.avgRate) && pos.avgRate > 0) return pos.avgRate;
  }
  return state.exchangeRate;
}
function refreshAppliedRateDefault() {
  const input = document.getElementById('tx_appliedRate');
  if (input.value && input.dataset.autofilled !== '1') return; // 사용자가 직접 고친 값은 보존
  input.value = getSuggestedAppliedRate();
  input.dataset.autofilled = '1';
}
document.getElementById('tx_appliedRate').addEventListener('input', (e) => { delete e.target.dataset.autofilled; });

function updateTxAppliedRateVisibility() {
  const isUsd = document.getElementById('tx_currency').value === 'USD';
  document.getElementById('tx_appliedRateWrap').classList.toggle('hidden', !isUsd);
  updateTxCashPriceLock();
  if (isUsd) refreshAppliedRateDefault();
}
document.getElementById('tx_currency').addEventListener('change', updateTxAppliedRateVisibility);
document.getElementById('tx_type').addEventListener('change', () => { updateTxCashPriceLock(); refreshAppliedRateDefault(); });
document.getElementById('tx_name').addEventListener('blur', () => { updateTxCashPriceLock(); refreshAppliedRateDefault(); });
document.getElementById('tx_owner').addEventListener('change', refreshAppliedRateDefault);
document.getElementById('tx_accountType').addEventListener('blur', refreshAppliedRateDefault);

// 검색 모달(개별주식 검색)을 'transaction' 모드로 열었을 때 종목 선택 결과를 거래 입력 폼에 채운다.
// [티커 없는 자산 - 소유자/계좌구분/통화 자동완성] 부동산/채권처럼 티커가 없는 자산은 소유자+계좌구분+
// 종목명이 정확히 일치해야만 기존 포지션과 연결된다(syncAssetsFromTransactions 참고) - owner/accountType/
// currency는 검색 결과를 고를 때만 전달되며(renderStockSearchResults), 사용자가 직접 타이핑하다 생기는
// 이름/계좌 불일치 사고를 막기 위해 그 값을 그대로 채워 넣는다.
function applyStockPickToTransactionForm(ticker, name, owner, accountType, currency) {
  document.getElementById('tx_name').value = name;
  document.getElementById('tx_ticker').value = ticker;
  if (ticker) {
    const isKr = /\.(KS|KQ)$/i.test(ticker) || /^\d{6}$/.test(ticker);
    document.getElementById('tx_currency').value = isKr ? 'KRW' : 'USD';
    document.getElementById('tx_tickerHint').textContent = `선택된 티커: ${ticker}`;
  } else {
    document.getElementById('tx_currency').value = currency === 'USD' ? 'USD' : 'KRW';
    if (owner) document.getElementById('tx_owner').value = owner;
    if (accountType) document.getElementById('tx_accountType').value = accountType;
    document.getElementById('tx_tickerHint').textContent = '티커 없는 자산 - 소유자/계좌구분이 자동으로 채워졌습니다(매도 시 기존 보유분과 정확히 연결됩니다).';
  }
  updateTxAppliedRateVisibility();
  refreshTxRateMatchRecommendation({ allowPrefill: true }); // [Phase 30] 종목이 정해졌으니 안내/추천을 다시 계산한다.
}

// [수동입력 토글 UI 반영] OFF(검색 모드, 기본값)면 종목명 입력칸을 readonly로 잠그고 클릭/돋보기
// 버튼으로 개별주식 검색 팝업을 띄운다 - ON(수동입력)이면 돋보기를 숨기고 입력칸을 자유 텍스트로
// 바꿔 현금/부동산/예적금처럼 티커가 없는 자산명을 직접 타이핑해 저장할 수 있게 한다.
function applyTxManualEntryModeUI() {
  const manual = document.getElementById('tx_manualEntryToggle').checked;
  const nameInput = document.getElementById('tx_name');
  nameInput.readOnly = !manual;
  nameInput.classList.toggle('cursor-pointer', !manual);
  nameInput.placeholder = manual ? '예: 정기예금, 부동산(강남 아파트) 등 자유롭게 입력' : '클릭해서 종목 검색';
  document.getElementById('txSearchStockBtn').classList.toggle('hidden', manual);
}
document.getElementById('tx_manualEntryToggle').addEventListener('change', () => {
  applyTxManualEntryModeUI();
  document.getElementById('tx_name').value = '';
  document.getElementById('tx_ticker').value = '';
  document.getElementById('tx_tickerHint').textContent = ' ';
  updateTxCashPriceLock();
});
document.getElementById('tx_name').addEventListener('click', () => {
  if (!document.getElementById('tx_manualEntryToggle').checked) openStockSearchModal();
});

// [대표 추종 수익률 종목 셀렉트 - 요청 반영] 예전엔 자유 입력 텍스트칸이라 오타 위험이 컸다(엑셀 실
// 사용 데이터에서 "0052D0.KS" 대신 "84" 같은 값이 들어가 수익률이 조용히 0%로 리셋된 사례 확인) -
// 지금 시스템에 등록된 대표 매칭 종목 리스트(getScenarioRateDisplayRows, "수익률 관리" 팝업과 완전히
// 같은 목록)에서 고르는 드롭다운으로 바꾼다. 모달을 열 때마다(등록 목록이 바뀔 수 있으므로) 새로 채운다.
// 현재 값이 목록에 없는 경우(위 "84" 같은 예전 오타, 또는 아직 목록에 안 뜨는 값)는 지워버리지 않고
// "(현재값)" 옵션으로 얹어 그대로 유지되게 한다 - 다른 필드를 고치려다 실수로 값을 날리는 일이 없게.
function populateRateMatchOverrideOptions(currentValue) {
  const select = document.getElementById('tx_rateMatchOverride');
  const rows = getScenarioRateDisplayRows().slice().sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  const options = ['<option value="">자동판별 (비워두면 시스템이 종목/종목명으로 자동 매칭)</option>'];
  if (currentValue && !rows.some((r) => r.key === currentValue)) {
    options.push(`<option value="${escapeHtml(currentValue)}">⚠ 현재값: ${escapeHtml(currentValue)} (등록되지 않은 키)</option>`);
  }
  rows.forEach((r) => {
    options.push(`<option value="${escapeHtml(r.key)}">${escapeHtml(r.label)} (${escapeHtml(r.key)})</option>`);
  });
  select.innerHTML = options.join('');
  select.value = currentValue || '';
}

/* -------------------------------------------------------------------------
 * [Phase 30] 대표매칭키 추천 UX - 새 판단을 만들지 않고, 원래도 계산 시점에 조용히 돌던 자동판별
 *    (resolveAssetGroupKeyDetail, js/05)의 결과를 입력 시점에 미리 보여줄 뿐이다. 확정은 사용자가
 *    [이대로 사용]을 누르거나 직접 고를 때만 일어나고, 그 값도 폼 안에만 있다가 [저장] 시점에
 *    기존 경로로 반영된다(모달 자체가 이미 draft/confirm 구조라 별도 초안 저장소를 만들지 않는다).
 * ---------------------------------------------------------------------- */
// 지금 화면에 보여주고 있는 추천(없으면 null). state에 저장되지 않는 화면 전용 값이다.
let txRateMatchRecommendation = null;

// 지금 폼에 입력된 소유자/계좌구분/티커(없으면 이름)로 기존 자산을 찾는다 - 저장 핸들러가 쓰는
// 매칭 규칙과 정확히 같은 규칙이어야 "지금 보이는 안내"와 "실제 저장 결과"가 어긋나지 않는다.
function findAssetForTxForm() {
  const owner = document.getElementById('tx_owner').value.trim();
  const accountType = document.getElementById('tx_accountType').value.trim();
  const ticker = document.getElementById('tx_ticker').value.trim();
  const name = document.getElementById('tx_name').value.trim();
  if (!owner || !accountType || (!ticker && !name)) return null;
  // [B-5 일관성] 저장 핸들러와 같은 판정을 쓴다 - 통화를 보지 않으면 같은 이름의 다른 통화 자산을
  // 기준으로 안내가 나가고, 실제 저장 결과와 화면이 어긋난다.
  const currency = document.getElementById('tx_currency').value;
  return state.assets.find((a) => assetMatchesLedgerIdentity(a, { owner, accountType, ticker, name, currency })) || null;
}

// opts.allowPrefill: 기존 자산의 지정값을 빈 선택칸에 자동으로 채워도 되는 시점인지. 종목/소유자/
// 계좌가 정해지는 순간에만 true다 - 선택칸 자체를 사용자가 조작했을 때(change)는 절대 채우지 않는다.
// 그렇지 않으면 사용자가 값을 비우는 즉시 다시 채워져 "해제"가 불가능해진다.
function refreshTxRateMatchRecommendation(opts) {
  const allowPrefill = !!(opts && opts.allowPrefill);
  const isEditMode = !!document.getElementById('tx_id').value;
  const help = document.getElementById('txRateMatchHelp');
  const text = document.getElementById('txRateMatchHelpText');
  const applyBtn = document.getElementById('txRateMatchApplyBtn');
  const select = document.getElementById('tx_rateMatchOverride');
  const ticker = document.getElementById('tx_ticker').value.trim();
  const name = document.getElementById('tx_name').value.trim();
  txRateMatchRecommendation = null;
  applyBtn.classList.add('hidden');

  if (!ticker && !name) { help.classList.add('hidden'); return; }
  help.classList.remove('hidden');

  // [기존 자산 보호] 이미 사용자가 정해둔 값이 있으면 추천하지 않는다 - 거래를 하나 더 넣었다고
  // 해서 그 선택을 다시 흔들지 않는다(Phase 28-F override 보호 계약과 같은 방향).
  const existing = findAssetForTxForm();
  if (existing && existing.rateMatchOverride) {
    // 기존 값을 화면에도 채워 보여준다(빈칸이었을 때만 - 사용자가 이번에 일부러 다른 걸 골랐다면
    // 그 선택을 존중한다). 이 칸이 빈 채로 저장돼 기존 값이 조용히 지워지는 사고를 막는 장치다.
    ensureRateMatchOption(existing.rateMatchOverride);
    if (allowPrefill && !isEditMode && !select.value) select.value = existing.rateMatchOverride;
    const existingLabel = getRateMatchKeyDisplayLabel(existing.rateMatchOverride);
    if (select.value === existing.rateMatchOverride) {
      text.textContent = `이미 지정해 둔 기준이 있어 그대로 유지됩니다: ${existingLabel}`;
    } else if (!select.value) {
      // 수정 모드에서 비운 경우만 실제로 해제된다(신규 거래의 빈칸은 기존 값을 건드리지 않는다).
      text.textContent = isEditMode
        ? `저장하면 기존 지정(${existingLabel})이 해제되고 자동판별로 돌아갑니다.`
        : `이미 지정해 둔 기준이 있어 그대로 유지됩니다: ${existingLabel}`;
    } else {
      text.textContent = `저장하면 이 종목의 기준이 "${getRateMatchKeyDisplayLabel(select.value)}"(으)로 바뀝니다.`;
    }
    return;
  }

  const rec = recommendRateMatchKey({ ticker, name, currency: document.getElementById('tx_currency').value });
  if (!rec) {
    // [추천 없음은 실패가 아니다] 비워두면 계산 시점에 시스템이 알아서 정한다 - 지금까지도 그렇게
    // 동작해 왔다. 그래서 "직접 골라야만 한다"고 몰아붙이지 않는다.
    text.textContent = '자동으로 추천할 기준을 찾지 못했어요. 비워두면 계산할 때 시스템이 정하고, 원하면 위에서 직접 고를 수 있어요.';
    return;
  }
  ensureRateMatchOption(rec.key);
  txRateMatchRecommendation = rec;
  if (select.value === rec.key) {
    text.textContent = `이 종목은 "${rec.label}" 기준으로 계산합니다.`;
    return;
  }
  text.textContent = `앱 추천: ${rec.label} 기준으로 계산합니다.`;
  applyBtn.classList.remove('hidden');
}

// 추천/기존 값이 아직 "수익률 관리" 목록에 없을 수 있다(그 종목을 지금 처음 사는 경우 - 목록은 이미
// 보유·목표에 쓰이는 키만 보여준다). 고를 수 없는 값을 권하면 안 되므로 선택지에 얹어 둔다.
function ensureRateMatchOption(key) {
  const select = document.getElementById('tx_rateMatchOverride');
  if (!key || Array.from(select.options).some((o) => o.value === key)) return;
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = `${getRateMatchKeyDisplayLabel(key)} (${key})`;
  select.appendChild(opt);
}

// [이대로 사용] - 폼의 선택값만 바꾼다. state/localStorage는 [저장]을 눌러야 바뀐다.
document.getElementById('txRateMatchApplyBtn').addEventListener('click', () => {
  if (!txRateMatchRecommendation) return;
  ensureRateMatchOption(txRateMatchRecommendation.key);
  document.getElementById('tx_rateMatchOverride').value = txRateMatchRecommendation.key;
  refreshTxRateMatchRecommendation();
});
// 사용자가 직접 고르거나 되돌리면 안내 문구도 즉시 그 상태를 반영한다.
document.getElementById('tx_rateMatchOverride').addEventListener('change', refreshTxRateMatchRecommendation);
// 종목명 직접 입력(수동입력 모드)/소유자·계좌구분 변경도 판단 근거가 바뀌는 입력이다.
document.getElementById('tx_name').addEventListener('input', () => refreshTxRateMatchRecommendation({ allowPrefill: true }));
document.getElementById('tx_owner').addEventListener('change', () => refreshTxRateMatchRecommendation({ allowPrefill: true }));
document.getElementById('tx_accountType').addEventListener('blur', () => refreshTxRateMatchRecommendation({ allowPrefill: true }));
function openTransactionModal(txId) {
  const form = document.getElementById('transactionForm');
  form.reset();
  document.getElementById('tx_id').value = '';
  document.getElementById('tx_ticker').value = '';
  document.getElementById('tx_tickerHint').textContent = ' ';
  populateRateMatchOverrideOptions('');
  document.getElementById('tx_date').value = todayDateStr();
  document.getElementById('tx_fee').value = 0;
  delete document.getElementById('tx_appliedRate').dataset.autofilled; // 이전 모달 세션의 자동채움 표시 잔재 방지

  if (txId) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;
    document.getElementById('txModalTitle').textContent = '거래 수정';
    document.getElementById('tx_id').value = tx.id;
    document.getElementById('tx_date').value = tx.date;
    document.getElementById('tx_type').value = tx.type;
    document.getElementById('tx_owner').value = tx.owner;
    document.getElementById('tx_accountType').value = tx.accountType;
    document.getElementById('tx_name').value = tx.name;
    document.getElementById('tx_ticker').value = tx.ticker || '';
    document.getElementById('tx_quantity').value = tx.quantity;
    document.getElementById('tx_price').value = tx.price;
    document.getElementById('tx_currency').value = tx.currency;
    document.getElementById('tx_fee').value = tx.fee;
    document.getElementById('tx_appliedRate').value = tx.currency === 'USD' ? (num(tx.appliedRate) || DEFAULT_LEGACY_FX_RATE) : '';
    // [대표 추종 수익률 종목 - 수정 모드] 이 거래의 종목에 해당하는 자산을 찾아 현재 설정된
    // rateMatchOverride를 보여준다(없으면 자동판별 중이라는 뜻이라 빈칸으로 둔다).
    // [B-5 일관성] 통화까지 보고 이 거래의 자산을 찾는다 - 예전엔 같은 이름의 다른 통화 자산이
    // 잡혀서, 달러 거래를 열면 원화 자산의 대표매칭키/역할이 폼에 채워지고 저장 시 그 값이 옮겨 붙었다.
    const matchedForEdit = state.assets.find((a) => assetMatchesLedgerIdentity(a, tx));
    populateRateMatchOverrideOptions((matchedForEdit && matchedForEdit.rateMatchOverride) || '');
    // [자산별 역할(포지션) 분류 - 수정 모드] rateMatchOverride와 동일하게 매칭되는 자산의 현재 role을 보여준다.
    // [Phase 32] 정식 4개 + (이 자산이 legacy core_mid면) legacy 항목까지 채운 뒤 값을 세팅한다 -
    // 옵션에 없는 값이면 select가 조용히 빈칸이 되어 저장 시 기존 포지션이 날아간다.
    const editRole = (matchedForEdit && matchedForEdit.role) || '';
    document.getElementById('tx_role').innerHTML = assetRoleSelectOptionsHtml(editRole, '미지정');
    document.getElementById('tx_role').value = editRole;
    document.getElementById('tx_tickerHint').textContent = tx.ticker ? `티커: ${tx.ticker}` : ' ';
    document.getElementById('tx_manualEntryToggle').checked = !tx.ticker;
  } else {
    document.getElementById('txModalTitle').textContent = '거래 추가';
    document.getElementById('tx_manualEntryToggle').checked = false;
    document.getElementById('tx_role').innerHTML = assetRoleSelectOptionsHtml('', '미지정');
    document.getElementById('tx_role').value = '';
  }
  applyTxManualEntryModeUI();
  updateTxAppliedRateVisibility();
  refreshTxRateMatchRecommendation({ allowPrefill: true }); // [Phase 30] 수정 모드면 기존값 안내, 신규면 아직 종목이 없어 숨겨진다.
  document.getElementById('transactionModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeTransactionModal(viaBackButton) {
  document.getElementById('transactionModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}

document.getElementById('addTransactionBtn').addEventListener('click', () => openTransactionModal(null));
document.getElementById('closeTxModalBtn').addEventListener('click', () => closeTransactionModal());
document.getElementById('cancelTxModalBtn').addEventListener('click', () => closeTransactionModal());
document.getElementById('transactionModal').addEventListener('click', (e) => {
  if (e.target.id === 'transactionModal') closeTransactionModal();
});
document.getElementById('txSearchStockBtn').addEventListener('click', () => openStockSearchModal());

document.getElementById('transactionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('tx_id').value || genId();
  const name = document.getElementById('tx_name').value.trim();
  if (!name) { showToast('종목명을 입력하세요.', 'warn'); return; }
  // [V1.1] 소유자 정책 - 신랑/와이프만 저장한다. 잘못된 값을 조용히 정상값으로 바꾸지 않고
  // 다시 입력하도록 돌려보낸다(초보자에게는 "조용히 고쳐진 것"이 가장 찾기 어려운 오류다).
  if (!isValidOwner(document.getElementById('tx_owner').value)) {
    showToast('소유자를 신랑 또는 와이프 중에서 선택해주세요.', 'warn');
    return;
  }
  // [현금/외화현금 거래내역 차단] 기존 보유 '현금' 자산과 이름/소유자/계좌구분이 일치하면(무티커) 거래로
  // 등록할 수 없다 - 자산관리 탭에서 직접 잔고를 수정하도록 안내한다(findMatchingCashAsset 참고).
  const txOwnerVal = document.getElementById('tx_owner').value;
  const txAccountTypeVal = document.getElementById('tx_accountType').value.trim() || '일반계좌';
  const txTickerVal = document.getElementById('tx_ticker').value.trim();
  const txCurrencyVal = document.getElementById('tx_currency').value;
  if (findMatchingCashAsset(txOwnerVal, txAccountTypeVal, txTickerVal, name, txCurrencyVal)) {
    showToast('현금/외화 자산은 거래내역으로 등록할 수 없습니다. 자산관리 탭의 자산 수정에서 잔고를 직접 고쳐주세요.', 'warn', 6000);
    return;
  }
  const quantity = num(document.getElementById('tx_quantity').value);
  if (quantity <= 0) { showToast('수량은 0보다 커야 합니다.', 'warn'); return; }
  // [달러 현금 거래 - 가격 1 고정] UI에서 이미 잠가두지만, 프로그램적으로 폼이 채워지는 경로(검색 선택
  // 등) 대비 제출 시점에도 한 번 더 강제한다 - 현금성 거래는 수량 자체가 달러 금액이라 단가는 항상 1.
  const price = isUsdCashTxForm() ? 1 : num(document.getElementById('tx_price').value);
  if (price <= 0) { showToast('매매단가는 0보다 커야 합니다.', 'warn'); return; }
  // [Phase 7-G - 매도 수량 검증] 이전에는 보유수량보다 많이 팔아도 그대로 저장되고, 실제 계산
  // (computePositionsAndRealizedPnL)이 조용히 min(매도수량, 보유수량)으로 잘라내기만 했다 - 초보자는
  // "왜 화면에 보이는 수량이 내가 입력한 매도수량과 다르지?"를 이해하기 어렵다. 저장 전에 먼저
  // 친절하게 알려준다(계산 로직 자체는 그대로 유지 - 이 검증은 UI 단계에서만 막는다).
  if (document.getElementById('tx_type').value === 'sell') {
    const excludeTxId = document.getElementById('tx_id').value;
    // [B-5] 통화까지 넘겨 실제 계산과 같은 포지션의 보유수량을 본다(폼의 tx_currency 값 그대로).
    const available = computeCurrentHoldingQuantity(txOwnerVal, txAccountTypeVal, txTickerVal, name, txCurrencyVal, excludeTxId);
    if (quantity > available) {
      showToast(`현재 보유수량(${fmtNum(available, 4)})보다 많은 수량을 매도할 수 없습니다.`, 'warn', 6000);
      return;
    }
  }

  const existing = state.transactions.find((t) => t.id === id);
  const tx = {
    id,
    date: document.getElementById('tx_date').value || todayDateStr(),
    owner: document.getElementById('tx_owner').value,
    accountType: document.getElementById('tx_accountType').value.trim() || '일반계좌',
    ticker: document.getElementById('tx_ticker').value.trim(),
    name,
    type: document.getElementById('tx_type').value,
    quantity, price,
    currency: document.getElementById('tx_currency').value,
    fee: num(document.getElementById('tx_fee').value),
    // [해외주식 적용 환율] 통화가 USD일 때만 의미 있는 값 - 입력란이 비어 있으면(자동 채움 로직을
    // 우회해 강제로 지운 경우 등) 지금 환율로 안전하게 채운다.
    appliedRate: document.getElementById('tx_currency').value === 'USD'
      ? (num(document.getElementById('tx_appliedRate').value) || state.exchangeRate)
      : undefined,
    origin: (existing && existing.origin) || 'period', // 수동 입력은 항상 '기간' 거래로 취급(구분 태그는 엑셀 업로드 전용)
    createdAt: existing ? existing.createdAt : Date.now(), // 정렬 안정성을 위해 최초 생성 시각은 수정해도 유지
    updatedAt: Date.now() // [가족 동기화 - 스마트 머지] 추가든 수정이든 항상 "지금"으로 갱신
  };

  if (existing) {
    const idx = state.transactions.findIndex((t) => t.id === id);
    state.transactions[idx] = tx;
  } else {
    state.transactions.push(tx);
  }

  persistTransactions();
  syncAssetsFromTransactions();
  // [대표 추종 수익률 종목 매칭 - 요청 반영] syncAssetsFromTransactions()가 방금 만들었거나 갱신한
  // 자산을 소유자+계좌구분+티커(없으면 이름)로 찾아 rateMatchOverride를 반영한다 - 입력칸을 채웠으면
  // 그 값을, 비웠으면(기존에 설정돼 있었더라도) 지워서 자동판별로 되돌린다.
  const rateMatchRaw = document.getElementById('tx_rateMatchOverride').value.trim();
  // [B-5 일관성] 동기화가 방금 다룬 바로 그 자산을 같은 판정으로 찾는다 - 통화를 보지 않으면 달러
  // 거래를 저장했는데 같은 이름의 원화 자산에 대표매칭키와 역할이 쓰였다(실측).
  const matchedAsset = state.assets.find((a) => assetMatchesLedgerIdentity(a, tx));
  // [Phase 30 - 데이터 보호] 신규 거래(수정이 아님)에서 이 두 칸은 기본이 빈칸이다. 예전엔 그 빈칸을
  // 그대로 "지워라"로 해석해서, 이미 대표매칭키/역할을 지정해 둔 자산에 매수 한 건을 추가하기만 해도
  // 그 설정이 조용히 사라졌다(Phase 30 조사에서 실측 재현). 빈칸은 "이번 입력에서 건드리지 않았다"로
  // 해석하고 기존 값을 유지한다 - 정말 지우려면 수정 모드에서 기존 값이 보이는 상태로 비우면 된다
  // (수정 모드는 openTransactionModal이 기존 값을 미리 채워주므로 "보고 비우는" 의도가 분명하다).
  const isEditingExistingTx = !!document.getElementById('tx_id').value;
  if (matchedAsset && (rateMatchRaw || isEditingExistingTx)) matchedAsset.rateMatchOverride = rateMatchRaw || undefined;
  // [자산별 역할(포지션) 분류] rateMatchOverride와 나란히 반영 - 위와 같은 이유로 신규 거래의 빈칸은
  // 기존 역할을 지우지 않는다(수정 모드에서 비우면 기존처럼 미지정으로 되돌아간다).
  const roleRaw = document.getElementById('tx_role').value.trim();
  if (matchedAsset && (roleRaw || isEditingExistingTx)) matchedAsset.role = parseAssetRoleInput(roleRaw);
  // [티커별 역할(포지션) 단일 소스 - 티커 없는 자산까지 확장] matchedAsset의 role 변경을 다른 화면에서도
  // 이어받게 레지스트리에도 반영한다. 티커가 없으면 이름으로 대신 키를 만든다.
  if (matchedAsset && (matchedAsset.ticker || matchedAsset.name)) setTickerRole(matchedAsset.ticker, matchedAsset.role, matchedAsset.name);
  persistAssets();
  closeTransactionModal();
  renderTransactionsTab();
  renderAll();
  showToast('거래 내역을 저장했습니다.', 'success');
});

function deleteTransaction(id) {
  if (!confirm('이 거래 내역을 삭제하시겠습니까? 삭제 시 관련 종목의 수량/평단가가 남은 거래내역 기준으로 다시 계산됩니다.')) return;
  const removed = state.transactions.find((t) => t.id === id);
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persistTransactions();
  syncAssetsFromTransactions();
  // [고아 자산 방지] syncAssetsFromTransactions()는 computePositionsAndRealizedPnL()이 만든 positions
  // 맵을 순회하는데, 이 맵은 "현재 남아있는 거래내역"에서만 만들어진다 - 방금 지운 거래가 그 종목
  // (소유자+계좌구분+티커/이름)의 마지막 남은 거래였다면 positions에 그 키 자체가 없어져서 sync가
  // 이 자산을 아예 건드리지 못하고, 자산 수량이 지우기 전 값 그대로 고아 상태로 남는다(전량매도 0
  // 처리가 안 됨) - 명시적으로 0으로 맞춰준다. 거래 없이 처음부터 수동 등록된 자산(양식다운로드
  // 워크플로 등)은 이 분기를 절대 타지 않는다 - 오직 "방금 거래를 지운" 그 종목/소유자/계좌 조합에만
  // 적용되므로, 애초에 거래내역이 없던 자산의 수동 입력 수량을 건드릴 위험이 없다.
  // [B-5 일관성] 남은 거래 확인과 고아 자산 찾기 둘 다 통화까지 본다. 예전에는 둘 다 이름만 봐서
  // 같은 계좌에 이름이 같은 원화/달러 자산이 있으면 양쪽으로 틀렸다 - ① 달러 거래를 지워도 남아 있는
  // 원화 거래 때문에 stillHasTx가 true가 되어 정작 거래가 사라진 달러 자산이 정리되지 않았고,
  // ② 원화 자산만 있는 상태에서 달러 거래를 지우면 **아무 관련 없는 원화 자산의 수량이 0으로
  // 지워졌다**(실측: 수량 100 → 0). 판정만 정확하게 만들고 정리 규칙 자체는 그대로 둔다.
  if (removed) {
    const removedKey = transactionIdentityKey(removed);
    const stillHasTx = state.transactions.some((t) => transactionIdentityKey(t) === removedKey);
    if (!stillHasTx) {
      const orphan = state.assets.find((a) => assetMatchesLedgerIdentity(a, removed));
      if (orphan && orphan.category !== '현금' && orphan.quantity > 0) orphan.quantity = 0;
    }
  }
  persistAssets();
  renderTransactionsTab();
  renderAll();
}

// 거래 1건의 원화환산 평가금액(수량×단가, 외화는 현재 환율로 환산) - 정렬 2순위 기준으로 쓴다.
function txAmountKRW(t) {
  return t.quantity * t.price * (t.currency === 'USD' ? state.exchangeRate : 1);
}

function getFilteredTransactions() {
  const f = state.txFilters;
  const q = f.search.trim().toLowerCase();
  return state.transactions
    .filter((t) => !f.from || t.date >= f.from)
    .filter((t) => !f.to || t.date <= f.to)
    .filter((t) => f.account === 'ALL' || `${t.owner}·${t.accountType}` === f.account)
    .filter((t) => f.type === 'ALL' || t.type === f.type)
    .filter((t) => !q || `${t.name} ${t.ticker}`.toLowerCase().includes(q))
    // 최근 거래 일자 우선(선행 조건) - 같은 날짜끼리는 원화환산 평가금액이 큰 순서로 배치한다.
    .sort((a, b) => b.date.localeCompare(a.date) || txAmountKRW(b) - txAmountKRW(a));
}

function populateTxFilterOptions() {
  const combos = [...new Set(state.transactions.map((t) => `${t.owner}·${t.accountType}`))];
  const sel = document.getElementById('txFilterAccount');
  const current = state.txFilters.account;
  sel.innerHTML = '<option value="ALL">전체 계좌</option>' + combos.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel.value = combos.includes(current) ? current : 'ALL';
}

// [거래 목록 아코디언] 기본값은 접힘 - 헤더(txListAccordionBtn)를 탭해야만 펼쳐진다. RISK 관리
// 아코디언과 동일하게 모듈 전역 변수로 펼침 상태를 기억해, renderTransactionList()가 필터/검색/
// 추가/수정/삭제로 반복 호출돼도 사용자가 선택한 열림/닫힘 상태가 되돌아가지 않는다.
let txListAccordionOpen = false;

function renderTransactionList() {
  populateTxFilterOptions();
  const list = getFilteredTransactions();
  const container = document.getElementById('txListContainer');
  const emptyMsg = document.getElementById('txEmptyMsg');
  const accordionBody = document.getElementById('txListAccordionBody');
  const accordionChevron = document.getElementById('txListAccordionChevron');
  document.getElementById('txListCount').textContent = list.length > 0 ? `(${list.length}건)` : '';

  if (list.length === 0) {
    container.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    setAccordionOpen(accordionBody, accordionChevron, txListAccordionOpen);
    return;
  }
  emptyMsg.classList.add('hidden');

  container.innerHTML = list.map((t) => {
    const typeLabel = t.type === 'buy' ? '매수' : '매도';
    const typeClass = t.type === 'buy' ? 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950 text-blue-500 dark:text-blue-400';
    const unit = t.currency === 'USD' ? '$' : '';
    const amount = t.quantity * t.price;
    const originTag = t.origin === 'initial'
      ? '<span class="text-sm font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">최초</span>'
      : t.origin === 'adjust'
      ? '<span class="text-sm font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">조정</span>'
      : '';
    // [금액 기반 입력 표시] price=1로 저장된 무티커 금액거래는 "1000주 × $1"처럼 보이면 혼란스러우니
    // quantity를 그대로 금액으로 보여준다. appliedRate(참고용으로 적어둔 환율)가 있으면 함께 표기한다.
    const isAmountTx = !t.ticker && num(t.price) === 1;
    // [해외주식 적용 환율 표시] 일반(수량×단가) 거래도 USD면 그 거래에 저장된 적용 환율을 함께 보여준다.
    const rateSuffix = (t.currency === 'USD' && t.appliedRate) ? ` · 적용환율 ${fmtNum(t.appliedRate, 1)}원` : '';
    const amountLine = isAmountTx
      ? `${unit}${fmtNum(amount, 2)}${num(t.fee) > 0 ? ` (수수료 ${unit}${fmtNum(t.fee, 2)})` : ''}${t.appliedRate ? ` · 적용환율 ${fmtNum(t.appliedRate, 1)}원` : ''}`
      : `${fmtNum(t.quantity, 4)}주 × ${unit}${fmtNum(t.price, 2)} = ${unit}${fmtNum(amount, 2)}${num(t.fee) > 0 ? ` (수수료 ${unit}${fmtNum(t.fee, 2)})` : ''}${rateSuffix}`;
    return `
    <div class="py-2.5 flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-sm font-semibold px-1.5 py-0.5 rounded ${typeClass}">${typeLabel}</span>
          ${originTag}
          <span class="text-sm font-medium truncate cursor-pointer hover:underline" data-open-stock-detail data-ticker="${escapeHtml(t.ticker || '')}" data-name="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
          <span class="text-sm text-slate-400">${escapeHtml(t.ticker || '-')}</span>
        </div>
        <p class="text-sm text-slate-400 mt-0.5">${escapeHtml(t.date)} · ${escapeHtml(t.owner)} · ${escapeHtml(t.accountType)}${t.memo ? ` · ${escapeHtml(t.memo)}` : ''}</p>
        <p class="text-sm mt-0.5">${amountLine}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" data-edit-tx="${t.id}" title="수정" class="touch-target w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" data-delete-tx="${t.id}" title="삭제" class="touch-target w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-400">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('button[data-edit-tx]').forEach((btn) => btn.addEventListener('click', () => openTransactionModal(btn.dataset.editTx)));
  container.querySelectorAll('button[data-delete-tx]').forEach((btn) => btn.addEventListener('click', () => deleteTransaction(btn.dataset.deleteTx)));
  lucide.createIcons();
  // 방금 다시 그린 목록 기준으로 펼침 상태를 재적용한다 - 펼쳐진 채로 필터/검색 결과가 바뀌어도
  // max-height가 새 목록 높이에 맞게 갱신되고, 접힌 상태였다면 계속 접힌 채로 유지된다.
  setAccordionOpen(accordionBody, accordionChevron, txListAccordionOpen);
}

document.getElementById('txListAccordionBtn').addEventListener('click', () => {
  txListAccordionOpen = !txListAccordionOpen;
  setAccordionOpen(document.getElementById('txListAccordionBody'), document.getElementById('txListAccordionChevron'), txListAccordionOpen);
});

// 필터 변경은 더 이상 즉시 조회하지 않는다(요청에 따라) - 입력란은 값만 바뀌고, [조회] 버튼을 눌러야
// 그 조건으로 실제 목록이 다시 그려진다. [초기화]는 예외적으로 누르는 즉시 결과까지 초기화해 보여준다.
function applyTxFilters() {
  state.txFilters = {
    from: document.getElementById('txFilterFrom').value,
    to: document.getElementById('txFilterTo').value,
    account: document.getElementById('txFilterAccount').value,
    type: document.getElementById('txFilterType').value,
    search: document.getElementById('txFilterSearch').value
  };
  renderTransactionList();
}
document.getElementById('txFilterApplyBtn').addEventListener('click', applyTxFilters);
document.getElementById('txFilterSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyTxFilters();
});
document.getElementById('txFilterResetBtn').addEventListener('click', () => {
  document.getElementById('txFilterFrom').value = '';
  document.getElementById('txFilterTo').value = '';
  document.getElementById('txFilterAccount').value = 'ALL';
  document.getElementById('txFilterType').value = 'ALL';
  document.getElementById('txFilterSearch').value = '';
  applyTxFilters();
});

/* ---- 기간별(일별/월별/연별) 실현손익 ---- */
function daysInMonth(year, month1to12) { return new Date(year, month1to12, 0).getDate(); }

// granularity: 'daily'(refDate가 속한 달의 일자별, 1일~말일 고정 축) | 'monthly'(refDate가 속한 연도의
// 1~12월 고정 축) | 'yearly'(거래가 존재하는 전체 연도 범위, 가변 축). 매도 거래만 실현손익을 만들어내므로
// (매수는 포지션만 쌓을 뿐 손익이 확정되지 않음) annotated 중 매도 건만 집계 대상으로 삼는다.
function computeRealizedPnLByPeriod(granularity, refDate) {
  const { annotated } = computePositionsAndRealizedPnL();
  const sells = annotated.filter((tx) => tx.type === 'sell' && tx.computedRealizedPnL !== null);

  const [refYear, refMonth] = refDate.split('-').map(Number);
  let periodKeys, keyFn, labelFn, filteredSells;

  if (granularity === 'daily') {
    const dim = daysInMonth(refYear, refMonth);
    const ym = refDate.slice(0, 7);
    periodKeys = Array.from({ length: dim }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
    keyFn = (tx) => tx.date;
    labelFn = (key) => `${Number(key.slice(8, 10))}일`;
    filteredSells = sells.filter((tx) => tx.date.slice(0, 7) === ym);
  } else if (granularity === 'monthly') {
    periodKeys = Array.from({ length: 12 }, (_, i) => `${refYear}-${String(i + 1).padStart(2, '0')}`);
    keyFn = (tx) => tx.date.slice(0, 7);
    labelFn = (key) => `${Number(key.slice(5, 7))}월`;
    filteredSells = sells.filter((tx) => tx.date.slice(0, 4) === String(refYear));
  } else {
    const years = sells.map((tx) => Number(tx.date.slice(0, 4)));
    const minYear = years.length ? Math.min(...years) : refYear;
    const maxYear = Math.max(refYear, ...(years.length ? years : [refYear]));
    periodKeys = [];
    for (let y = minYear; y <= maxYear; y++) periodKeys.push(String(y));
    keyFn = (tx) => tx.date.slice(0, 4);
    labelFn = (key) => `${key}년`;
    filteredSells = sells;
  }

  // [기간별 세부 거래내역 - 아코디언 확장용] 각 기간 버킷에 집계값뿐 아니라 그 기간에 속한 개별 매도
  // 거래(tx) 목록도 함께 쌓아둔다 - renderPnlReportList()가 행을 펼칠 때 이 배열을 그대로 렌더링한다.
  const buckets = {};
  periodKeys.forEach((k) => { buckets[k] = { key: k, label: labelFn(k), realizedPnL: 0, sellAmount: 0, tradeCount: 0, winCount: 0, transactions: [] }; });
  filteredSells.forEach((tx) => {
    const k = keyFn(tx);
    if (!buckets[k]) buckets[k] = { key: k, label: labelFn(k), realizedPnL: 0, sellAmount: 0, tradeCount: 0, winCount: 0, transactions: [] };
    buckets[k].realizedPnL += tx.computedRealizedPnL;
    buckets[k].sellAmount += tx.computedSellAmount;
    buckets[k].tradeCount += 1;
    buckets[k].transactions.push(tx);
    if (tx.computedRealizedPnL > 0) buckets[k].winCount += 1;
  });

  const periods = periodKeys.map((k) => buckets[k]);
  const totalPnL = filteredSells.reduce((s, tx) => s + tx.computedRealizedPnL, 0);
  const totalSellAmount = filteredSells.reduce((s, tx) => s + tx.computedSellAmount, 0);
  const totalTradeCount = filteredSells.length;
  const totalWinCount = filteredSells.filter((tx) => tx.computedRealizedPnL > 0).length;
  // 수익률 = 실현손익 / 매도원가(=매도금액-실현손익, 수수료로 인한 미세한 근사 오차는 허용). 매도금액이
  // 없으면(해당 기간 매도 없음) 0으로 처리한다.
  const costBasis = totalSellAmount - totalPnL;
  const totalRate = costBasis !== 0 ? (totalPnL / costBasis) * 100 : 0;
  const winRate = totalTradeCount !== 0 ? (totalWinCount / totalTradeCount) * 100 : 0;

  return { periods, totalPnL, totalSellAmount, totalTradeCount, totalWinCount, totalRate, winRate };
}

function shiftPnlPeriod(dir) {
  const g = state.pnlPeriod.granularity;
  const [y, m] = state.pnlPeriod.refDate.split('-').map(Number);
  if (g === 'daily') {
    const nd = new Date(y, m - 1 + dir, 1);
    state.pnlPeriod.refDate = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (g === 'monthly') {
    state.pnlPeriod.refDate = `${y + dir}-${String(m).padStart(2, '0')}-01`;
  }
  updatePnlSection();
}
document.getElementById('pnlPeriodPrev').addEventListener('click', () => shiftPnlPeriod(-1));
document.getElementById('pnlPeriodNext').addEventListener('click', () => shiftPnlPeriod(1));
document.querySelectorAll('.pnl-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.pnlPeriod.granularity = btn.dataset.pnlPeriod;
    updatePnlSection();
  });
});

function renderPnlChart(periods) {
  const textColor = chartTextColor();
  const labels = periods.map((p) => p.label);
  const data = periods.map((p) => p.realizedPnL);
  const colors = data.map((v) => (v > 0 ? '#ef4444' : (v < 0 ? '#3b82f6' : '#94a3b8')));

  if (charts.pnl) charts.pnl.destroy();
  const pnlCanvas = document.getElementById('pnlChart');
  charts.pnl = new Chart(pnlCanvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      // [툴팁 3초 자동 숨김] 다른 차트들과 동일하게 hover가 아니라 click에서만 툴팁이 뜨게 하고,
      // 아래 canvas.onclick에서 scheduleDailyPnlTooltipHide로 3초 뒤 자동으로 닫는다.
      events: ['click'],
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtSigned(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: textColor, font: { size: 10 }, callback: (v) => fmtKRWShort(v) }, grid: { color: 'rgba(148,163,184,0.15)' } }
      }
    }
  });
  // DOM0 스타일(onclick=) 할당 - 재렌더링마다 이전 핸들러를 자동으로 덮어써서 리스너가 계속 쌓이지 않는다.
  pnlCanvas.onclick = () => scheduleDailyPnlTooltipHide(charts.pnl);
}

// [기간별 실현손익 - 행별 아코디언 펼침 상태] key(일별="YYYY-MM-DD"/월별="YYYY-MM"/연별="YYYY")별로
// 펼침 여부를 기억한다 - 세 granularity의 key 형식이 서로 겹치지 않으므로 하나의 평면 객체로 충분하다.
// 기간 이동(이전/다음 달)이나 일별·월별·연별 전환으로 다시 렌더링돼도 사용자가 펼쳐둔 행은 그대로 유지된다.
let pnlPeriodDetailOpen = {};

function togglePnlPeriodDetail(key) {
  pnlPeriodDetailOpen[key] = !pnlPeriodDetailOpen[key];
  const body = document.getElementById(`pnlDetailBody_${key}`);
  const chevron = document.querySelector(`[data-pnl-chevron="${key}"]`);
  if (body && chevron) setAccordionOpen(body, chevron, pnlPeriodDetailOpen[key]);
}

// 기간 행을 펼쳤을 때 그 아래 나열되는 개별 매도 거래 카드 - 거래일자/종목명/소유자·계좌구분/매도수량/
// 매도단가/그 거래 하나의 실현손익을 보여준다. 모바일에서도 겹침 없이 보이도록 2줄 카드 형태로 구성한다.
function renderPnlDetailRow(tx) {
  const unit = tx.currency === 'USD' ? '$' : '';
  return `
  <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2 text-sm">
    <div class="flex items-center justify-between gap-2 mb-1 min-w-0">
      <span class="font-semibold text-slate-700 dark:text-slate-200 truncate">${escapeHtml(tx.name)}</span>
      <span class="font-bold shrink-0 ${profitColor(tx.computedRealizedPnL)}">${fmtSigned(tx.computedRealizedPnL)}</span>
    </div>
    <div class="flex items-center justify-between gap-2 text-slate-400 min-w-0">
      <span class="truncate">${escapeHtml(tx.date)} · ${escapeHtml(tx.owner)}·${escapeHtml(tx.accountType)}</span>
      <span class="shrink-0">${fmtNum(tx.quantity, 4)} × ${unit}${fmtNum(tx.price, 2)}</span>
    </div>
  </div>`;
}

// [기간별 집계 - 아코디언 리스트] 각 기간 행(일/월/연)을 클릭하면 그 기간의 개별 매도 거래 목록이
// 바로 아래로 펼쳐진다(setAccordionOpen과 동일한 max-height 트랜지션 패턴). 실현손익 양수=빨강/
// 음수=파랑(profitColor)으로 색상을 구분한다.
function renderPnlReportList(periods) {
  const container = document.getElementById('pnlReportListContainer');
  const nonEmpty = periods.filter((p) => p.tradeCount > 0);
  if (nonEmpty.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 text-sm py-6">해당 기간에 매도 거래가 없습니다.</p>`;
    return;
  }
  const rows = nonEmpty.slice().reverse();
  container.innerHTML = rows.map((p) => {
    const isOpen = !!pnlPeriodDetailOpen[p.key];
    return `
    <div class="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <button type="button" data-pnl-detail-toggle="${escapeHtml(p.key)}"
        class="w-full flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <span class="text-sm font-semibold text-slate-700 dark:text-slate-200 shrink-0">${escapeHtml(p.label)}</span>
        <span class="flex-1 flex items-center justify-end gap-2 sm:gap-4 min-w-0">
          <span class="text-sm font-bold truncate ${profitColor(p.realizedPnL)}">${fmtSigned(p.realizedPnL)}</span>
          <span class="hidden sm:inline text-sm text-slate-400 truncate">${fmtKRWShort(p.sellAmount)}</span>
          <span class="text-sm text-slate-400 shrink-0">${p.tradeCount}건</span>
        </span>
        <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}" data-pnl-chevron="${escapeHtml(p.key)}"></i>
      </button>
      <div id="pnlDetailBody_${escapeHtml(p.key)}" class="overflow-hidden transition-[max-height] duration-300 ease-in-out" style="max-height:0px;">
        <div class="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 space-y-1.5">
          ${p.transactions.slice().reverse().map((tx) => renderPnlDetailRow(tx)).join('')}
        </div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('button[data-pnl-detail-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => togglePnlPeriodDetail(btn.dataset.pnlDetailToggle));
  });
  lucide.createIcons();
  // 방금 다시 그린 목록 기준으로, 이미 펼쳐져 있어야 하는 행들의 실제 높이를 재적용한다(다른
  // 아코디언들과 동일한 이유 - 내용이 바뀌어도 max-height가 새 높이에 맞게 갱신된다).
  rows.forEach((p) => {
    if (!pnlPeriodDetailOpen[p.key]) return;
    const body = document.getElementById(`pnlDetailBody_${p.key}`);
    const chevron = document.querySelector(`[data-pnl-chevron="${p.key}"]`);
    if (body && chevron) setAccordionOpen(body, chevron, true);
  });
}

function updatePnlSection() {
  document.querySelectorAll('.pnl-period-btn').forEach((btn) => {
    const active = btn.dataset.pnlPeriod === state.pnlPeriod.granularity;
    btn.className = 'pnl-period-btn text-sm font-medium px-3 py-1.5 rounded-md ' +
      (active ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400');
  });

  const g = state.pnlPeriod.granularity;
  document.getElementById('pnlPeriodNav').classList.toggle('hidden', g === 'yearly');
  const [y, m] = state.pnlPeriod.refDate.split('-').map(Number);
  document.getElementById('pnlPeriodLabel').textContent = g === 'daily' ? `${y}년 ${m}월` : (g === 'monthly' ? `${y}년` : '전체 기간');

  const result = computeRealizedPnLByPeriod(g, state.pnlPeriod.refDate);

  const totalEl = document.getElementById('pnlSummaryTotal');
  totalEl.textContent = fmtSigned(result.totalPnL);
  totalEl.className = 'text-sm font-bold ' + profitColor(result.totalPnL);
  const rateEl = document.getElementById('pnlSummaryRate');
  rateEl.textContent = fmtPct(result.totalRate);
  rateEl.className = 'text-sm font-bold ' + profitColor(result.totalRate);

  renderPnlChart(result.periods);
  renderPnlReportList(result.periods);
}

function renderTransactionsTab() {
  renderTransactionList();
  updatePnlSection();
  reapplyTxExcelAccordionHeight();
  lucide.createIcons();
}

// [Phase 18 P2-3] Excel 거래 관리 아코디언 - 기본값은 접힘. 내용(버튼 3개)이 필터/검색과 무관하게
// 고정이라 txListAccordion처럼 매번 다시 그릴 필요는 없지만, 탭을 나갔다 돌아오면 다시 접힌 상태로
// 리셋되므로(js/03 resetAllAccordionsOnTabSwitch) 탭 진입 시(renderTransactionsTab) 한 번 더
// 반영해 실제 DOM 상태를 맞춘다.
let txExcelAccordionOpen = false;
function reapplyTxExcelAccordionHeight() {
  const body = document.getElementById('txExcelAccordionBody');
  const chevron = document.getElementById('txExcelAccordionChevron');
  if (body && chevron) setAccordionOpen(body, chevron, txExcelAccordionOpen);
}
document.getElementById('txExcelAccordionBtn').addEventListener('click', () => {
  txExcelAccordionOpen = !txExcelAccordionOpen;
  reapplyTxExcelAccordionHeight();
});

