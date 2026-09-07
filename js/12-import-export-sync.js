/* -------------------------------------------------------------------------
 * 21. 엑셀 내보내기 (전체 백업 - 파생 필드 포함)
 * ---------------------------------------------------------------------- */
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  // [버그 수정 - 전량 매도 종목 제외] 전량 매도된 포지션은 자산 목록에서 삭제되지 않고 수량만 0으로
  // 남는다(syncAssetsFromTransactions 참고, 삭제는 사용자가 원할 때 직접 하도록 의도적으로 남겨둠).
  // 채권처럼 수동 등록하는 자산은 수량은 남아있는데 시세(가격)가 0/미입력이라 평가금액만 0인 경우도
  // 있다 - 수량이 아니라 실제 평가금액(calcRow(a).curAmount)이 0인 자산을 걸러야 두 경우 다 잡힌다
  // (포트폴리오 구성 탭의 리밸런싱 가이드에 적용한 것과 동일한 필터, js/04 참고). "포트폴리오 구성"의
  // 신규 매수 목표는 state.rebalance.targets에 별도로 저장되어 이 배열(state.assets)에 애초에 없으므로
  // 이 필터로 영향받지 않는다.
  const rows = state.assets.filter((a) => Math.round(calcRow(a).curAmount) !== 0).map(a => {
    const r = calcRow(a);
    return {
      'ticker': a.ticker || '', '소유자': a.owner, '계좌구분': a.accountType, '종목명': a.name,
      '국내/해외': a.isDomestic, '통화': a.currency, '수량': a.quantity, '매수단가': a.buyPrice,
      // [Phase 53] 매수 시점 가중평균 환율(외화만). 이 칸이 없던 시절에는 엑셀 왕복만으로 외화 자산의
      // 원가가 오늘 환율로 바뀌어 손익·수익률이 조용히 달라졌다(실측: 수익률 61% -> 33%, 환차익이
      // 통째로 사라짐). 원화 자산은 환율 개념이 없어 빈 칸으로 둔다 - calcRow도 원화는 1로 고정한다.
      '취득환율(매수시점)': a.currency === 'USD' && num(a.buyRate) > 0 ? a.buyRate : '',
      '자산군(자동분류)': a.category, '현재가': a.currentPrice,
      '매입금액(자산통화, 자동계산)': Math.round(r.buyAmountOriginal * 100) / 100,
      '매입금액(KRW환산)': Math.round(r.buyAmount), '평가금액(KRW)': Math.round(r.curAmount),
      '평가손익(KRW)': Math.round(r.profit), '수익률(%)': Math.round(r.rateOfReturn * 100) / 100,
      // [대표매칭(수익률연동키)] 사용자가 이 자산에 "직접 지정한" 기준만 적는다. 지정하지 않았으면
      // 빈 칸으로 남긴다 - 빈 칸은 "아직 지정하지 않았다(자동판별을 그대로 쓴다)"는 의미 있는 상태다.
      // 이 칸을 직접 고쳐서 올리면 makeAsset()이 rateMatchOverride로 저장해 이후 계산에서 최우선으로
      // 반영된다(22. 엑셀 업로드 참고).
      //
      // [Phase 48-A - P0-3 수정] 예전엔 지금 실제로 적용 중인 키(resolveAssetGroupKeyDetail의 결과)를
      // 그대로 찍었다. 그런데 그 결과에는 사용자가 지정한 것과 앱이 스스로 판별한 것이 섞여 있다 -
      // 예를 들어 'KODEX 200'은 아무 지정이 없어도 자동으로 KOSPI가 되는데, 그 'KOSPI'가 셀에 찍혀
      // 나가고 그 파일을 다시 올리면 rateMatchOverride='KOSPI'로 저장돼 **자동판별이 사용자 지정으로
      // 굳었다**(실측 재현: source가 assetCharacter -> override로 바뀜). 그렇게 굳은 자산은 이후
      // 시스템 정책이 바뀌어도(예: Phase 47-A의 지역 폴백 제거) 영원히 따라가지 못한다.
      //
      // 이건 두 번째 시트("수익률 관리 기준")가 Phase 29-B에서 이미 겪고 고친 것과 완전히 같은 문제다 -
      // 거기서도 "지금의 최종 유효값"을 찍다가 시스템 기본값이 영구 오버라이드로 동결됐고, 이제는
      // "실제로 저장돼 있는 오버라이드 원본값만 적고 없으면 빈 칸"으로 바꿔 두었다. 여기도 같은 규칙을
      // 쓴다: a.rateMatchOverride를 그대로, 없으면 빈 칸.
      //
      // [자동판별 결과를 보고 싶다면] 자산 상세 모달의 "장기 수익률 가정" 블록이 지금 적용 중인 기준과
      // 그것이 자동 판별인지 사용자 지정인지를 함께 보여준다(Phase 47-F) - 그 정보를 이 칸에 섞어
      // 내보내면 위 승격 문제가 되살아나므로 여기서는 의도적으로 내보내지 않는다.
      '대표매칭(수익률연동키)': sanitizeRateMatchOverride(a.rateMatchOverride) || '',
      // [자산별 역할(포지션) 분류] 값을 고쳐서 다시 업로드하면 makeAsset()이 role로 저장한다.
      '역할(포지션)': ASSET_ROLE_LABELS[a.role] || '',
      // [Phase 53] 자산 식별자. 사용자가 볼 일이 없는 값이라 맨 끝에 둔다 - 지우거나 고치지 말 것.
      // 이 칸이 없던 시절에는 엑셀로 복원한 기기가 클라우드와 처음 페어링할 때 같은 자산이 두 벌로
      // 남았다(실측: 자산 2개 -> 4개). 칸을 비우거나 지운 채 올려도 예전처럼 새 id가 발급된다.
      'id': a.id
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '자산목록');

  // [멀티 시트 - 요청 반영] 두 번째 시트에 "수익률 관리" 팝업이 지금 실제로 보여주는 것과 완전히 같은
  // 목록(getScenarioRateDisplayRows - 동적 필터링된 대표 종목들, js/05)을 정리해 내려받는다. 여기서
  // 종목을 추가하거나 수익률을 고쳐서 다시 업로드하면 state.projection.customScenarioRates에 그대로
  // 반영된다(22. 엑셀 업로드 참고).
  // [Phase 29-B - round-trip 의미 보존 버그 수정] 예전엔 이 칸에 getReferenceRate()(오버라이드가 있으면
  // 그 값, 없으면 시스템 기본값까지 합성한 "최종 유효값")를 항상 채워 넣었다 - 그러면 사용자가 한 번도
  // 손대지 않은 필드(customScenarioRates[key][preset]가 아예 없는, 시스템 기본값을 그냥 따르던 필드)도
  // 엑셀에는 구체적인 숫자로 찍혀 나가고, 그 파일을 그대로 다시 올리기만 해도(22. 엑셀 업로드는 빈 칸이
  // 아닌 값을 전부 명시적 오버라이드로 저장한다) 시스템 기본값이 영구 오버라이드로 동결됐다 - 이후
  // Phase 7-x/29-A가 그 필드의 시스템 기본값이나 추천값을 갱신해도 더 이상 반영되지 않는 원인이었다.
  // 이제 "실제로 저장돼 있는 그 필드의 원본 오버라이드 값"만 적고, 없으면 빈 칸으로 남겨 "이 필드는
  // 아직 시스템 기본값을 따르는 중"이라는 사실 자체를 보존한다 - 대표매칭(rateMatchOverride)의 override-
  // first 원칙과 동일하게, 여기서도 "값이 없다"는 것 자체가 의미 있는 상태다. 커스텀 키(row.custom -
  // 시스템 기본값 개념이 아예 없는, 사용자가 직접 등록한 종목)는 저장 시 항상 3개 필드를 전부 쓰므로
  // (js/05 saveScenarioRateManagerModalBtn 핸들러) 이 규칙을 그대로 적용해도 동작이 달라지지 않는다.
  const rateRows = getScenarioRateDisplayRows().map((row) => {
    const customEntry = (state.projection.customScenarioRates || {})[row.key];
    const keywords = (customEntry && Array.isArray(customEntry.keywords)) ? customEntry.keywords : [];
    const overrideOnly = (preset) => (customEntry && customEntry[preset] !== undefined) ? num(customEntry[preset]) : '';
    return {
      '키(수익률연동키)': row.key,
      '종목명': row.label,
      // [키워드 자동매칭 - 요청 반영] 이 칸에 쉼표로 구분해 키워드를 적으면(예: "현금, 달러") 종목명에
      // 그 키워드가 포함된 자산이 카테고리/지역 폴백보다 우선해서 이 키로 자동 매칭된다
      // (getCustomKeywordRateKey, js/05). 다시 업로드하면 그대로 반영된다.
      '키워드(쉼표로 구분)': keywords.join(', '),
      '보수적(%)': overrideOnly('conservative'),
      '일반적(%)': overrideOnly('normal'),
      '긍정적(%)': overrideOnly('optimistic')
    };
  });
  const rateWs = XLSX.utils.json_to_sheet(rateRows);
  XLSX.utils.book_append_sheet(wb, rateWs, '수익률 관리 기준');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `자산관리_${today}.xlsx`);
});

/* -------------------------------------------------------------------------
 * 22. 엑셀 업로드
 *    - ticker/소유자/계좌구분/종목명/국내해외/통화/수량/매수단가 8개 필수 컬럼을 읽는다.
 *    - '국내/해외'('국내'/'해외')와 '통화'('KRW'/'USD')는 각각 독립적인 필드로 그대로 저장되며,
 *      비어있거나 인식할 수 없는 값이면 ticker 형식을 기준으로 한 자동판별로 폴백한다.
 *    - 그 외 컬럼(자산군, 매입금액 등)이 섞여 있어도 무시하고 자동판별/자동계산을 다시 적용한다.
 * ---------------------------------------------------------------------- */
function pick(row, ...keys) {
  for (const k of keys) { if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; }
  return '';
}

// [추가하기(append) 모드 - 중복 종목 최신 수량 반영] 예전엔 그냥 이어붙였다(concat) - 이미 보유 중인
// 자산과 소유자/계좌구분/티커가 완전히 같은 종목을 다시 가져오면 똑같은 행이 하나 더 생겨 평가금액이
// 두 배로 잡히는 사고로 이어졌다. 그다음엔 "추가 매수"처럼 수량을 합산(가중평균 매수단가)해봤지만,
// 사용자 입장에선 "그 사이 38주에서 50주로 늘었다"는 최신 스냅샷을 반영하려던 것뿐인데 88주로 뻥튀기
// 되는 문제가 있었다 - 이제 같은 종목(티커가 없는 채권/현금/부동산 등은 소유자+계좌구분+자산군+이름
// 으로 대신 식별)을 다시 만나면 수량을 더하지도, 무시하지도 않고 **불러온 파일의 값으로 완전히
// 덮어써(최신 스냅샷으로 갱신)** id만 기존 것을 유지한다. 기존에 없던 완전 신규 종목만 새 행으로
// 추가한다. newCount/updatedCount를 함께 반환해 "신규 N개 추가, 기존 N개 업데이트" 안내에 쓴다.
/* [B-2/B-8] 티커가 없는 자산은 이름만으로는 같은 자산인지 알 수 없다 - 같은 계좌 안에 이름이 같은
 * 원화 예수금과 달러 예수금이 함께 있을 수 있고, 같은 이름의 달러를 국내 계좌와 해외 계좌에 나눠
 * 들고 있을 수도 있다. 그 둘이 같은 키를 갖는 순간 [추가하기]의 indexByKey가 슬롯 하나만 남기고,
 * 파일의 두 행이 그 슬롯 하나를 번갈아 덮어써서 자산이 실제로 사라지거나 복제됐다.
 *
 * 실측(감사 fixture): 원화 예수금 1,000만 + 달러 예수금 $10,000(= 2,450만)에 같은 내용의 파일을
 * [추가하기]로 올렸을 때, 파일의 행 순서가 뒤집혀 있으면 결과가 2,000만이 되어 달러분이 통째로
 * 사라지고 원화가 두 벌로 남았다. 국내 달러 + 해외 달러 조합에서는 반대로 2,175만 -> 2,900만으로
 * 부풀었다. 살아남는지 여부가 엑셀 정렬 순서에 달려 있었다.
 *
 * 통화와 국내/해외는 이미 자산에 있는 필드이고 엑셀에도 이미 컬럼이 있다 - 새 스키마를 만들지 않고
 * 그 둘을 키에 넣는다. 티커가 있는 자산은 티커가 곧 통화와 시장을 결정하므로 예전 키 그대로 둔다.
 * [함께 고쳐지는 것] buildPositionSourceIndex의 byKey도 이 함수를 쓴다 - id가 없는 구형 파일에서
 * 원화 자산이 달러 자산의 positionSource를 이어받던 문제(B-8)가 같은 수정으로 사라진다. */
function assetMergeKey(a) {
  const ticker = String(a.ticker ?? '').trim();
  return ticker
    ? `${a.owner}|${a.accountType}|${ticker.toUpperCase()}`
    : `${a.owner}|${a.accountType}|${a.category}|${a.name}|${a.currency}|${a.isDomestic}`;
}
/* [V1.1 M4] 가져오기로 들어온 자산이 기존 자산의 positionSource를 이어받게 한다.
 *
 * 엑셀 시트에는 positionSource 칸이 없다(내부 데이터 출처 표식이라 일부러 넣지 않는다). 그래서
 * 파일에서 돌아온 자산은 항상 값이 비어 있고, 덮어쓰기는 state.assets를 통째로 그것으로 갈아치운다 -
 * 결과적으로 엑셀 한 번에 ledger/manual 구분이 전부 legacy로 되돌아갔다. 그렇게 되면 다음 부팅의
 * syncAssetsFromTransactions에서 manual 자산이 더 이상 보호받지 못해 수량/취득가가 거래원장 값으로
 * 조용히 바뀔 수 있다(Phase 50이 막아 둔 바로 그 문제다).
 *
 * 컬럼을 새로 만들지 않고 고친다 - Phase 53에서 id를 보존하게 되었으므로 같은 자산을 정확히 찾을 수
 * 있고, id가 없는 구형 파일은 append가 이미 쓰던 identity 규칙(assetMergeKey)으로 찾는다.
 *
 * [추측하지 않는다] 기존 자산을 찾지 못하면 값 없이 그대로 둔다. 거래내역이 있는지 없는지로
 * ledger/manual을 새로 판단하지 않는다 - 그건 저장된 사실이 아니라 현재 상태일 뿐이다(상시 정책 5항).
 * [파일이 값을 담고 있으면 파일이 이긴다] JSON/Cloud처럼 incoming에 값이 명시된 경로는 그대로 둔다. */
function buildPositionSourceIndex(existingAssets) {
  const byId = new Map(), byKey = new Map();
  (existingAssets || []).forEach((a) => {
    if (!a || a.positionSource === undefined) return;
    if (a.id) byId.set(a.id, a.positionSource);
    byKey.set(assetMergeKey(a), a.positionSource);
  });
  return { byId, byKey };
}
function carryOverPositionSource(incoming, index) {
  if (incoming.positionSource !== undefined) return incoming;
  const kept = index.byId.get(incoming.id) || index.byKey.get(assetMergeKey(incoming));
  return kept === undefined ? incoming : { ...incoming, positionSource: kept };
}

function mergeAssetsForAppend(existingAssets, incomingAssets) {
  const merged = existingAssets.map((a) => ({ ...a })); // 원본 배열/객체를 직접 변형하지 않도록 복사
  const indexByKey = new Map(merged.map((a, i) => [assetMergeKey(a), i]));
  let newCount = 0, updatedCount = 0;
  incomingAssets.forEach((incoming) => {
    const key = assetMergeKey(incoming);
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      merged.push({ ...incoming });
      indexByKey.set(key, merged.length - 1);
      newCount++;
      return;
    }
    const kept = merged[idx];
    // 값은 전부 최신 파일 기준, id만 기존 것 유지. positionSource는 아래 공용 규칙이 이어받는다.
    merged[idx] = carryOverPositionSource({ ...incoming, id: kept.id }, buildPositionSourceIndex([kept]));
    updatedCount++;
  });
  return { assets: merged, newCount, updatedCount };
}

// [버그 수정 - "취소"를 눌러도 자산이 중복 추가되던 문제] 예전엔 confirm() 하나로 "덮어쓰기(확인)/추가(취소)"
// 둘을 억지로 구분했다 - 그 결과 사용자가 정말 가져오기 자체를 그만두고 싶어서 취소를 눌러도 실제로는
// 기존 데이터 위에 그대로 이어붙여져(추가) 자산이 중복 계산되는 사고로 이어졌다. 이제 [덮어쓰기]/
// [기존 데이터에 추가]/[취소] 3개를 명확한 별도 버튼으로 두고, [취소]는 정말로 "가져오기 행위 자체를
// 취소"해 아무 것도 바뀌지 않는다. importChoiceModal(HTML) 참고.
let importChoiceResolve = null;
function openImportChoiceModal(message) {
  document.getElementById('importChoiceMessage').textContent = message;
  document.getElementById('importChoiceModal').classList.remove('hidden');
  pushModalHistoryState();
  return new Promise((resolve) => { importChoiceResolve = resolve; });
}
function closeImportChoiceModal(result, viaBackButton) {
  document.getElementById('importChoiceModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
  if (importChoiceResolve) { importChoiceResolve(result); importChoiceResolve = null; }
}
// [덮어쓰기 전 추가 경고] 파일 형식이 옳으면 몇 건인지까지 확인한 뒤 고르는 선택지이지만, "덮어쓰기"는
// 되돌릴 수 없는 삭제 작업이므로 한 번 더 명시적으로 확인한다 - 취소하면 선택 모달 자체는 그대로 열려
// 있어 [기존 데이터에 추가]나 [취소]로 다시 고를 수 있다.
document.getElementById('importChoiceOverwriteBtn').addEventListener('click', () => {
  if (!confirm('기존 데이터가 모두 삭제됩니다. 계속하시겠습니까?')) return;
  closeImportChoiceModal('overwrite');
});
document.getElementById('importChoiceAppendBtn').addEventListener('click', () => closeImportChoiceModal('append'));
document.getElementById('importChoiceCancelBtn').addEventListener('click', () => closeImportChoiceModal('cancel'));
document.getElementById('closeImportChoiceModalBtn').addEventListener('click', () => closeImportChoiceModal('cancel'));
document.getElementById('importChoiceModal').addEventListener('click', (e) => {
  if (e.target.id === 'importChoiceModal') closeImportChoiceModal('cancel');
});

document.getElementById('importExcelBtn').addEventListener('click', () => document.getElementById('excelFileInput').click());

document.getElementById('excelFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      // [멀티 시트 - 요청 반영] 두 번째 시트("수익률 관리 기준")가 있으면 함께 읽어둔다 - 시트 이름이
      // 정확히 일치하지 않아도(사용자가 실수로 이름을 바꾼 경우 등) 두 번째 시트 자체를 그대로 쓴다.
      // 적용은 아래에서 [덮어쓰기/추가] 선택 후, [취소]가 아닐 때만 한다(자산과 동일한 취소 시맨틱).
      const rateSheetName = wb.SheetNames.find((n) => n === '수익률 관리 기준') || wb.SheetNames[1];
      const rateJson = rateSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[rateSheetName]) : [];

      // [Phase 53] 한 파일 안에서 같은 id가 두 번 나오면(사용자가 행을 복사했거나 두 파일을 합친 경우)
      // 뒤에 오는 행에는 새 id를 준다 - 같은 id를 가진 자산 두 개는 클라우드 병합에서 서로를 덮어쓴다.
      const seenIds = new Set();
      const imported = json.map(row => makeAsset({
        // [Phase 53] 자산 식별자를 되살린다. 칸이 없는 구형 파일이나 빈 칸이면 undefined가 넘어가
        // makeAsset이 예전처럼 새 id를 만든다.
        id: (() => {
          const id = sanitizeAssetId(pick(row, 'id', 'ID', 'Id'));
          if (!id || seenIds.has(id)) return undefined;
          seenIds.add(id);
          return id;
        })(),
        ticker: pick(row, 'ticker', 'Ticker', 'TICKER'),
        owner: pick(row, '소유자'),
        accountType: pick(row, '계좌구분'),
        name: pick(row, '종목명'),
        isDomestic: pick(row, '국내/해외', '국내해외', '국내외'),
        currency: pick(row, '통화', 'Currency', 'CURRENCY'),
        quantity: pick(row, '수량'),
        buyPrice: pick(row, '매수단가'),
        // [Phase 53] 내보내기가 이미 적고 있던 자산군을 이제 실제로 읽는다. 예전에는 이 칸을 무시하고
        // 이름 키워드로 다시 분류해서, 이름에 키워드가 없는 티커 없는 자산(전세보증금·생활비 통장 등)이
        // 왕복마다 '주식'이 됐다. 그 결과가 표시만의 문제가 아니었다 - 원화 현금 보호막이
        // asset.category === '현금'에 걸려 있어서 재분류된 순간 잔고가 거래원장 값으로 덮어써졌고
        // (실측: 5,000,000 -> 100), assetMergeKey에도 category가 들어가 있어 [추가하기]가 같은 자산을
        // 새 행으로 복제했다(실측: 3개 -> 6개). 앱이 지원하지 않는 값이면 undefined가 되어
        // makeAsset이 예전처럼 자동분류로 되돌아간다(sanitizeAssetCategory, js/01).
        category: sanitizeAssetCategory(pick(row, '자산군(자동분류)', '자산군', 'category')),
        // [Phase 53] 매수 시점 환율. 칸이 없는 구형 파일에서는 undefined가 되어 calcRow의 기존
        // 폴백(오늘 환율)이 그대로 동작한다 - 구형 파일의 동작을 바꾸지 않는다.
        buyRate: pick(row, '취득환율(매수시점)', '취득환율', 'buyRate'),
        // 선택 입력: 값이 있으면 makeAsset이 그대로 현재가로 채택하고, 비어 있으면 매수단가로 초기화한다.
        currentPrice: pick(row, '현재가'),
        // [대표매칭 오버라이드 - 요청 반영] "대표매칭(수익률연동키)" 컬럼을 사용자가 직접 고쳐서 올리면
        // rateMatchOverride로 저장된다(비어 있으면 makeAsset이 undefined로 남겨 자동판별을 그대로 쓴다) -
        // getProjectionAssetGroupKey(js/05)가 이 값을 최우선으로 반영해 즉시 시뮬레이션에 연동된다.
        rateMatchOverride: pick(row, '대표매칭(수익률연동키)', '대표매칭', '수익률연동키'),
        // [자산별 역할(포지션) 분류] 한글 라벨('공격수' 등) 또는 내부 키 둘 다 인식한다(parseAssetRoleInput).
        role: pick(row, '역할(포지션)', '역할', 'role')
      }));

      if (imported.length === 0) { alert('가져올 데이터가 없습니다. (ticker, 소유자, 계좌구분, 종목명, 국내/해외, 통화, 수량, 매수단가 헤더를 확인하세요)'); return; }
      const choice = await openImportChoiceModal(`${imported.length}건을 불러옵니다.\n기존 데이터를 덮어쓸까요, 추가할까요?`);
      if (choice === 'cancel') return; // 가져오기 자체를 취소 - 아무 것도 바뀌지 않는다.
      let resultMsg;
      if (choice === 'append') {
        const { assets, newCount, updatedCount } = mergeAssetsForAppend(state.assets, imported);
        state.assets = assets;
        resultMsg = `신규 ${newCount}개 추가, 기존 ${updatedCount}개 최신 수량으로 업데이트됨`;
      } else {
        // [V1.1 M4] 덮어쓰기는 state.assets를 통째로 갈아치운다 - 갈아치우기 전의 자산에서
        // positionSource를 이어받는다(엑셀에는 그 칸이 없어서 파일만으로는 알 수 없다).
        // 찾지 못한 자산은 값 없이 그대로 둔다 - 거래내역 유무로 추측하지 않는다.
        const keptSources = buildPositionSourceIndex(state.assets);
        state.assets = imported.map((a) => carryOverPositionSource(a, keptSources));
        state.dayChangeMap = {};
        state.prevCloseMap = {};
        state.sessionMap = {};
        resultMsg = `엑셀 데이터 ${imported.length}건을 불러왔습니다.`;
      }
      persistAssets();

      // [멀티 시트 - 요청 반영] 두 번째 시트 내용을 state.projection.customScenarioRates에 업서트한다 -
      // 자산 가져오기를 [취소]했으면(위 return으로 이미 걸러짐) 여기까지 오지 않으므로 함께 취소된다.
      // 키가 비어있는 행은 건너뛰고, 세 수익률이 전부 빈칸인 행도 의미가 없어 건너뛴다 - 일부만 채워도
      // (예: 일반적만) 그 값만 오버라이드로 저장되고 나머지는 기존처럼 시스템 기본값으로 대체된다.
      let rateUpdatedCount = 0;
      rateJson.forEach((row) => {
        const key = String(pick(row, '키(수익률연동키)', '키', 'key') || '').trim();
        if (!key) return;
        const label = String(pick(row, '종목명', 'label') || key);
        const conservative = pick(row, '보수적(%)', '보수적', 'conservative');
        const normal = pick(row, '일반적(%)', '일반적', 'normal');
        const optimistic = pick(row, '긍정적(%)', '긍정적', 'optimistic');
        // [키워드 자동매칭 - 요청 반영] 이 칸에 쉼표로 구분해 적은 키워드가 종목명에 포함되면 카테고리/
        // 지역 폴백보다 우선해서 이 키로 자동 매칭된다(getCustomKeywordRateKey, js/05).
        const keywordsRaw = String(pick(row, '키워드(쉼표로 구분)', '키워드', 'keywords') || '').trim();
        if (conservative === '' && normal === '' && optimistic === '' && keywordsRaw === '') return;
        const entry = { label };
        if (conservative !== '') entry.conservative = num(conservative);
        if (normal !== '') entry.normal = num(normal);
        if (optimistic !== '') entry.optimistic = num(optimistic);
        if (keywordsRaw !== '') entry.keywords = keywordsRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        state.projection.customScenarioRates[key] = entry;
        rateUpdatedCount++;
      });
      if (rateUpdatedCount > 0) persistProjection();

      renderAll();
      // [일괄 업로드 소급 히스토리] 엑셀로 한 번에 들어온 종목들은 개별 등록 경로(assetForm 제출)를
      // 타지 않아 각자 새로 생성될 때 걸리는 backfillDailyPnlHistory 호출이 없다 - 대신 이 마이그레이션
      // 함수가 "아직 안 채워진 자산"만 골라 처리하므로 여기서 바로 불러 다음 새로고침을 기다리지 않고
      // 즉시 소급 이력을 채운다.
      backfillAllHoldingsDailyPnlHistory();
      // [가져오기 직후 리스크 즉시 갱신] renderAll()만으로는 시세/RISK 진단(state.advancedRiskMetrics)이
      // 새 데이터 기준으로 다시 계산되지 않는다 - 5분 자동 갱신이나 수동 새로고침을 기다리지 않고 바로
      // 새 포트폴리오 기준 위험점수/스트레스 테스트가 보이도록 명시적으로 한 번 더 호출한다.
      refreshPricesAndRates();
      updateProjection(); // 방금 반영된 customScenarioRates/대표매칭 오버라이드가 미래예측에도 즉시 보이도록.
      alert(`${resultMsg}${rateUpdatedCount > 0 ? ` / 수익률 관리 ${rateUpdatedCount}건 반영` : ''} (자산군/국내해외 자동판별 + 매입금액 자동계산 완료)`);
    } catch (err) {
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
});

/* -------------------------------------------------------------------------
 * 22-1. JSON 백업/복원 (모바일 기기 간 데이터 이동용 - 전체 상태를 있는 그대로 보존)
 *    - 엑셀은 6~8개 표준 컬럼만 담아 업로드 시 재분류가 일어나지만, JSON은 자산 객체를 그대로
 *      저장/복원하므로 수동으로 override한 자산군/국내해외/통화 값까지 손실 없이 유지된다.
 * ---------------------------------------------------------------------- */
// [가족 동기화와 공유] JSON 백업 파일과 클라우드 동기화가 똑같은 모양의 전체 상태 스냅샷을 쓰므로,
// 이 객체 조립 로직을 함수로 빼 pushToCloud()(§22-2)와 공유한다 - 필드가 하나 추가/삭제될 때 두 곳을
// 따로 고쳐야 하는 실수를 막는다.
function buildSyncBlob() {
  return {
    app: 'smart-asset-manager',
    schemaVersion: LS_ASSETS,
    exportedAt: new Date().toISOString(),
    exchangeRate: state.exchangeRate,
    dailyChangeRate: state.dailyChangeRate,
    rebalance: state.rebalance,
    projection: state.projection,
    assets: state.assets.map(a => ({
      id: a.id, ticker: a.ticker, owner: a.owner, accountType: a.accountType,
      category: a.category, name: a.name, isDomestic: a.isDomestic, currency: a.currency,
      quantity: a.quantity, buyPrice: a.buyPrice, currentPrice: a.currentPrice,
      regularMarketPrice: a.regularMarketPrice,
      buyRate: a.buyRate,
      // [가족 동기화 - 스마트 머지] mergeCollectionById()가 이 값으로 로컬/원격 중 더 최신 레코드를
      // 고른다 - 빠지면 항상 0으로 취급돼 병합이 무의미해진다.
      updatedAt: a.updatedAt,
      // [대표매칭 오버라이드] makeAsset() 주석 참고 - 빠지면 백업 복원/기기 간 동기화 시 사라진다.
      rateMatchOverride: a.rateMatchOverride,
      // [자산별 역할(포지션) 분류] makeAsset() 주석 참고 - 빠지면 백업 복원/기기 간 동기화 시 사라진다.
      role: a.role,
      // [Phase 49] 같은 이유. 옛 버전 앱이 이 필드가 든 페이로드를 받아도 normalizeImportedAsset이
      // 화이트리스트 방식이라 조용히 무시할 뿐이라, 앞뒤 버전이 섞여도 깨지지 않는다.
      positionSource: a.positionSource
    })),
    transactions: state.transactions,
    // [버그 수정] dailySnapshots는 위 주석(state 선언부)에 "JSON 백업에 저장됨"이라 적혀 있었지만 실제로는
    // 빠져 있었다 - 이 필드가 없으면 새 기기에서 복원해도 일별손익/총평가금액/누적평가손익 추이 차트의
    // 과거 히스토리가 전부 사라진다(복원 이후 날짜부터 새로 쌓이기 시작).
    dailySnapshots: state.dailySnapshots,
    // [종목 분석 모달 - 학습된 종목명 캐시] 다른 기기에서 검색해서 익힌 티커→이름도 JSON 백업/복원과
    // 클라우드 동기화로 함께 넘어가야 그 기기에서 처음 검색하는 종목도 바로 이름이 뜬다.
    learnedTickerNames: state.learnedTickerNames,
    // [티커별 역할(포지션) 단일 소스] getTickerRole() 주석 참고 - 이것도 기기 간 동기화되어야 한쪽에서
    // 지정한 포지션이 다른 기기에도 그대로 반영된다.
    tickerRoles: state.tickerRoles
  };
}

// [JSON 백업 다운로드 - 수동/자동 공용] 예전엔 exportJsonBtn 클릭 핸들러에만 인라인으로 있었다 - 이제
// 자동 백업 토글(즉시 1회 실행 + 매일 부팅 체크) 양쪽에서도 똑같이 써야 해서 함수로 뽑았다.
function downloadJsonBackup() {
  const backup = buildSyncBlob();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `자산관리_백업_${todayDateStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// [JSON 자동 백업 토글] 상태 텍스트/색상 갱신 - syncSettingsBtn과 같은 "색상 세트 전부 지운 뒤 현재
// 상태만 다시 붙이기" 패턴을 쓴다.
const AUTO_BACKUP_ON_CLASSES = ['bg-brand-50', 'dark:bg-brand-950/40', 'text-brand-600', 'dark:text-brand-400'];
const AUTO_BACKUP_OFF_CLASSES = ['text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-800'];
function isAutoBackupEnabled() {
  return localStorage.getItem(LS_AUTO_BACKUP_ENABLED) === '1';
}
function updateAutoBackupToggleUI() {
  const btn = document.getElementById('autoBackupToggleBtn');
  if (!btn) return;
  btn.classList.remove(...AUTO_BACKUP_ON_CLASSES, ...AUTO_BACKUP_OFF_CLASSES);
  if (isAutoBackupEnabled()) {
    btn.textContent = 'JSON 자동 백업중';
    btn.classList.add(...AUTO_BACKUP_ON_CLASSES);
  } else {
    btn.textContent = 'JSON 자동 백업 종료';
    btn.classList.add(...AUTO_BACKUP_OFF_CLASSES);
  }
}
// [매일 부팅 시 자동 백업] 토글이 켜져 있고 오늘 날짜로는 아직 실행한 적이 없으면 1회 다운로드한다.
// bootApp()에서 호출되고, 토글을 켜는 순간의 "즉시 1회 백업"과 별개다(그쪽은 항상 강제 실행).
function runAutoBackupIfDue() {
  if (!isAutoBackupEnabled()) return;
  const today = todayDateStr();
  if (localStorage.getItem(LS_LAST_AUTO_BACKUP_DATE) === today) return; // 오늘 이미 실행함
  downloadJsonBackup();
  localStorage.setItem(LS_LAST_AUTO_BACKUP_DATE, today);
}

document.getElementById('autoBackupToggleBtn').addEventListener('click', () => {
  const turningOn = !isAutoBackupEnabled();
  localStorage.setItem(LS_AUTO_BACKUP_ENABLED, turningOn ? '1' : '0');
  updateAutoBackupToggleUI();
  if (turningOn) {
    // [즉시 1회 백업] 켜는 순간 바로 백업하고 오늘 날짜를 기록해둔다 - 하루에 또 백업하고 싶으면
    // 껐다 켜는 것으로 수동 백업을 대신할 수 있다(요청 사항).
    downloadJsonBackup();
    localStorage.setItem(LS_LAST_AUTO_BACKUP_DATE, todayDateStr());
    showToast('JSON 자동 백업을 켰습니다 - 지금 1회 백업 파일을 내려받았습니다. 앞으로 매일 접속 시 자동으로 백업됩니다.', 'success', 6000);
  } else {
    showToast('JSON 자동 백업을 껐습니다.', 'info');
  }
});

document.getElementById('importJsonBtn').addEventListener('click', () => document.getElementById('jsonFileInput').click());

// JSON 백업의 거래 객체를 타입 안전하게 보정한다 - 덮어쓰기/추가하기 두 경로가 공유한다.
function normalizeImportedTransaction(t) {
  return {
    id: t.id || genId(),
    date: t.date || todayDateStr(),
    // [V1.1] 백업에 적힌 소유자를 그대로 되살린다 - 복원이 사용자 데이터를 바꾸지 않는다.
    owner: String(t.owner ?? '').trim(),
    accountType: t.accountType || '일반계좌',
    ticker: String(t.ticker ?? '').trim(),
    name: t.name || '이름없음',
    type: t.type === 'sell' ? 'sell' : 'buy',
    quantity: num(t.quantity),
    price: num(t.price),
    currency: (t.currency === 'USD') ? 'USD' : 'KRW',
    // [해외주식 적용 환율 - 왕복 보존] 이 필드가 빠지면 JSON 백업을 복원할 때마다(덮어쓰기/추가하기
    // 둘 다 이 함수를 거친다) 해외주식 거래의 실제 적용 환율이 사라져 DEFAULT_LEGACY_FX_RATE(1,450원)로
    // 되돌아간다 - 실현손익이 원래 저장했던 값과 달라지는 조용한 데이터 손실이라 반드시 보존해야 한다.
    appliedRate: (t.currency === 'USD' && Number.isFinite(num(t.appliedRate)) && num(t.appliedRate) > 0) ? num(t.appliedRate) : undefined,
    fee: num(t.fee),
    origin: t.origin === 'initial' ? 'initial' : 'period',
    createdAt: t.createdAt || Date.now(),
    // [가족 동기화 - 스마트 머지] mergeCollectionById()가 이 값을 읽는다 - 없으면 createdAt으로,
    // 그마저 없으면(아주 오래된 백업 등) 지금 시각으로 폴백한다.
    updatedAt: t.updatedAt || t.createdAt || Date.now()
  };
}

document.getElementById('jsonFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed || !Array.isArray(parsed.assets)) throw new Error('올바른 백업 파일 형식이 아닙니다(assets 배열 없음)');

      // JSON 백업은 이미 완전한 자산 객체이므로 makeAsset()으로 재분류하지 않고 타입 안전성만 보정한다.
      const restored = parsed.assets.map(a => ({
        id: a.id || genId(),
        ticker: String(a.ticker ?? '').trim(),
        // [V1.1] 위와 같은 이유로 그대로 보존한다.
        owner: String(a.owner ?? '').trim(),
        accountType: a.accountType || '일반계좌',
        category: a.category || '주식',
        name: a.name || '이름없음',
        isDomestic: (a.isDomestic === '해외') ? '해외' : '국내',
        currency: (a.currency === 'USD') ? 'USD' : 'KRW',
        quantity: num(a.quantity),
        buyPrice: num(a.buyPrice),
        currentPrice: num(a.currentPrice),
        // regularMarketPrice(정규장 기준가)만 왕복 보존한다 - lastTradeKey/dailyRefTradeKey/
        // dailyRefTradeKeyDate는 기기별 스냅샷 방식 자체를 없애면서 더 이상 쓰지 않는다(다음 정상
        // 시세 조회 때 API의 절대 시각만으로 매번 새로 판정됨, getMarketDateKeyForEpoch 참고).
        regularMarketPrice: typeof a.regularMarketPrice === 'number' ? a.regularMarketPrice : undefined,
        buyRate: typeof a.buyRate === 'number' ? a.buyRate : undefined,
        // [대표매칭 오버라이드] makeAsset() 주석 참고 - 빠지면 JSON 백업 복원 시 사라진다.
        rateMatchOverride: (typeof a.rateMatchOverride === 'string' && a.rateMatchOverride.trim() !== '') ? a.rateMatchOverride.trim() : undefined,
        // [자산별 역할(포지션) 분류] makeAsset() 주석 참고 - 빠지면 JSON 백업 복원 시 사라진다.
        role: parseAssetRoleInput(a.role)
      }));

      if (restored.length === 0) { alert('복원할 자산 데이터가 없습니다.'); return; }
      const choice = await openImportChoiceModal(`${restored.length}건을 복원합니다.\n기존 데이터를 덮어쓸까요, 추가할까요?`);
      if (choice === 'cancel') return; // 복원 자체를 취소 - 아무 것도 바뀌지 않는다.
      let resultMsg;
      if (choice === 'append') {
        // [추가하기 - 거래내역] 예전엔 append 모드에서 거래내역이 통째로 무시돼, 방금 합쳐진 자산
        // 수량의 근거가 되는 매수 기록이 [거래내역] 탭/기간별 실현손익에 전혀 안 남는 문제가 있었다.
        // 이제 기존 거래내역 뒤에 이어 붙이되, 같은 id(예: 같은 백업을 실수로 두 번 불러온 경우)를
        // 가진 거래는 다시 추가하지 않아 이중 계상을 막는다 - 설정(rebalance/projection/환율/일별
        // 스냅샷)은 "추가"라는 의도에 맞게 건드리지 않는다(덮어쓰기에서만 갱신).
        const incomingTx = Array.isArray(parsed.transactions) ? parsed.transactions.map(normalizeImportedTransaction) : [];
        const existingIds = new Set(state.transactions.map((t) => t.id));
        const newTx = incomingTx.filter((t) => !existingIds.has(t.id));

        // [Phase 22 STEP 4 - JSON append 오버셀 검증] Phase 13에서 Excel 대량 업로드에 적용한 것과
        // 동일한 원자적 거부 원칙을 JSON 백업 "추가하기"에도 적용한다. 자산 병합(mergeAssetsForAppend)을
        // 실행하기 전에 먼저 거래내역만으로 검증한다 - 하나라도 위반이면 자산/거래내역 어느 쪽도
        // 반영하지 않고 함수를 즉시 종료한다(부분 반영 금지). 검증 로직 자체는 Phase 13의
        // findExcelOversellViolations()를 그대로 재사용한다(newRows/existingTransactions 인자 구조가
        // 이미 이 용도에 맞게 범용적이라 새 계산을 만들 필요가 없었다) - excelRowNumById는 JSON
        // 컨텍스트에 해당 개념이 없으므로 undefined로 넘긴다(위반 메시지에서 "[엑셀 N행]" 부분만 빠짐).
        const violations = findExcelOversellViolations(newTx, state.transactions, undefined);
        if (violations.length > 0) {
          alert(buildJsonImportOversellAlertMessage(violations));
          return; // 전체 거부 - 기존 state(assets/transactions) 완전히 그대로 유지
        }

        // [추가하기 - 자산] 중복 종목(소유자+계좌구분+티커 동일)은 새 행을 만들지 않고, 불러온 파일의
        // 최신 값으로 덮어써 갱신한다(mergeAssetsForAppend 참고 - 수량을 더하지 않는다).
        const { assets, newCount, updatedCount } = mergeAssetsForAppend(state.assets, restored);
        state.assets = assets;
        resultMsg = `신규 ${newCount}개 추가, 기존 ${updatedCount}개 최신 수량으로 업데이트됨`;
        if (newTx.length > 0) {
          state.transactions = state.transactions.concat(newTx);
          persistTransactions();
        }
        persistAssets();
        renderAll();
        backfillAllHoldingsDailyPnlHistory(); // 엑셀 업로드와 동일한 이유 - 일괄 복원은 개별 등록 경로를 타지 않는다.
        // [가져오기 직후 리스크 즉시 갱신] renderAll()만으로는 시세/RISK 진단(state.advancedRiskMetrics)이
        // 새 데이터 기준으로 다시 계산되지 않는다 - 5분 자동 갱신이나 수동 새로고침을 기다리지 않고 바로
        // 새 포트폴리오 기준 위험점수/스트레스 테스트가 보이도록 명시적으로 한 번 더 호출한다.
        refreshPricesAndRates();
      } else {
        // [가족 동기화와 공유] "덮어쓰기" 로직 자체는 applyRemoteState()(§22-2)로 옮겼다 - 클라우드
        // pull이 정확히 같은 복원 로직을 타야 두 경로가 어긋나지 않는다.
        await applyRemoteState(parsed);
        resultMsg = `JSON 백업 ${restored.length}건을 복원했습니다.`;
      }
      showToast(resultMsg, 'success');
    } catch (err) {
      alert('JSON 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

/* -------------------------------------------------------------------------
 * 22-2. 가족 동기화 (Cloudflare Worker+KV, AES 암호화)
 *    - 예전 구글 드라이브 동기화(OAuth, 완전히 제거됨 - LEGACY_GOOGLE_LS_KEYS 참고)와 달리 로그인이
 *      필요 없다. 가족 공유 암호 하나를 기기별로 1회 입력받아 그 기기의 localStorage에만 저장하고,
 *      이 암호에서 (1) AES-GCM 암호화 키(PBKDF2 유도)와 (2) 클라우드에 데이터를 저장할 위치(KV 키,
 *      SHA-256 유도)를 함께 만든다 - 공개 저장소 소스코드에는 어떤 비밀값도 없다.
 *    - Push는 로컬 변경(persist*() 7개 함수, §7 참고) 직후 3초 디바운스로 자동 실행, Pull은 부팅 시
 *      1회 + 10초 주기 폴링으로 실행한다. 충돌 해소는 단순 최종 수정 우선(version=Date.now() 비교) -
 *      부부 2인 저빈도 편집 환경에서는 병합 로직 없이 이걸로 충분하다.
 * ---------------------------------------------------------------------- */
// hasError: 직전 push/pull 시도가 통신 오류(네트워크 실패 등)로 끝났는지 - 헤더의 동기화 상태
// 버튼(서버 동기화중/서버 동기화중지/서버 동기화오류)이 이 값을 읽는다. 비밀번호가 틀려 복호화가 실패한 경우는
// 별도의 syncDecryptErrorBox 안내가 이미 있으므로 여기 hasError에는 포함시키지 않는다.
let syncState = { enabled: false, password: '', lastVersion: 0, hasError: false };
function loadSyncState() {
  syncState.password = localStorage.getItem(LS_SYNC_PASSWORD) || '';
  syncState.enabled = localStorage.getItem(LS_SYNC_ENABLED) === '1' && !!syncState.password;
  syncState.lastVersion = Number(localStorage.getItem(LS_SYNC_LAST_VERSION)) || 0;
}

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
// 암호 하나에서 용도가 다른 두 값을 유도한다 - kvKey는 빠른 "주소 지정"용(SHA-256 1회), aesKey는
// 실제 데이터를 보호하는 "암호화"용(PBKDF2 10만 회 반복으로 무차별대입에 더 강함). 두 값은 서로
// 유도할 수 없으므로 Worker 운영자가 kvKey(URL 쿼리로 노출됨)를 봐도 데이터를 복호화할 수 없다.
async function deriveKvKey(password) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return 'sync:' + hex.slice(0, 32);
}
async function deriveAesKey(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptSyncBlob(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: arrayBufferToBase64(cipherBuf), iv: arrayBufferToBase64(iv), salt: arrayBufferToBase64(salt) };
}
// salt/iv는 비밀이 아니라(암호화 결과와 함께 평문으로 보관해도 안전) ciphertext 옆에 그대로 저장한다.
// AES-GCM은 인증 태그를 포함하므로 비밀번호가 틀리면(또는 데이터가 변조되면) 아래 decrypt가 예외를
// 던진다 - 이게 "복호화 실패 시 재입력 요청" 요구사항이 자연스럽게 걸리는 지점이다.
async function decryptSyncBlob({ ciphertext, iv, salt }, password) {
  const key = await deriveAesKey(password, base64ToBytes(salt));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext));
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// JSON 백업/원격 동기화 공용 - 자산 객체를 타입 안전하게 보정한다(normalizeImportedTransaction과 짝).
function normalizeImportedAsset(a) {
  return {
    id: a.id || genId(),
    ticker: String(a.ticker ?? '').trim(),
    // [V1.1] 위와 같은 이유로 그대로 보존한다(기존 '공동' 자산도 '공동'인 채로 복원된다).
    owner: String(a.owner ?? '').trim(),
    accountType: a.accountType || '일반계좌',
    category: a.category || '주식',
    name: a.name || '이름없음',
    isDomestic: (a.isDomestic === '해외') ? '해외' : '국내',
    currency: (a.currency === 'USD') ? 'USD' : 'KRW',
    quantity: num(a.quantity),
    buyPrice: num(a.buyPrice),
    currentPrice: num(a.currentPrice),
    regularMarketPrice: typeof a.regularMarketPrice === 'number' ? a.regularMarketPrice : undefined,
    buyRate: typeof a.buyRate === 'number' ? a.buyRate : undefined,
    // [Phase 47-E - 데이터 손실 버그 수정] 이 한 줄이 빠져 있었다. buildSyncBlob()은 이 필드를
    // 정상적으로 내보내는데(js/12 §22-1) 되받는 쪽에서 읽지 않아, JSON 백업 복원·클라우드 동기화·
    // 최초 페어링 세 경로 모두에서 사용자가 지정한 대표매칭 기준이 통째로 사라졌다. 감사에서
    // 실브라우저로 재현했고(파크시스템스 rateMatchOverride='KOSDAQ' → 복원 후 없음), Phase 47-A로
    // 지역 폴백이 없어진 뒤로는 그 결과가 "다른 기준이 적용됨"이 아니라 "적용 수익률 7% → 0%"가
    // 됐다 - 사용자 눈에는 자산이 갑자기 성장을 멈춘 것으로 보인다.
    // 정규화 규칙은 makeAsset과 완전히 같은 함수를 쓴다(sanitizeRateMatchOverride, js/01) -
    // 두 경로가 서로 다른 판단을 하면 "엑셀로는 살아남는데 백업으로는 사라지는" 지금 상황이 재발한다.
    rateMatchOverride: sanitizeRateMatchOverride(a.rateMatchOverride),
    // [Phase 49] makeAsset과 완전히 같은 규칙(sanitizePositionSource, js/01)을 쓴다 - 두 경로가 다르게
    // 판단하면 "엑셀로는 살아남는데 백업으로는 사라지는" Phase 47-E의 상황이 그대로 재발한다.
    // 값이 없는 legacy 자산은 값 없이 그대로 복원된다(임의로 채우지 않는다).
    positionSource: sanitizePositionSource(a.positionSource),
    // [자산별 역할(포지션) 분류] makeAsset() 주석 참고 - 빠지면 가족 동기화/백업 복원 시 사라진다.
    role: parseAssetRoleInput(a.role),
    // [가족 동기화 - 스마트 머지] mergeCollectionById() 참고 - 없으면 지금 시각으로 폴백(오래된 백업 등).
    updatedAt: a.updatedAt || Date.now()
  };
}

// [JSON 백업/파일 복원 전용 - "덮어쓰기"] 자산/거래내역을 원격(파일) 데이터로 완전히 교체한다 - 백업
// 복원은 "이 시점으로 되돌리기"가 목적이므로 병합이 아니라 통째 교체가 맞는 동작이다. 클라우드 동기화
// (pullFromCloud/pushToCloud)는 이 함수를 쓰지 않고 mergeAssetsAndTransactionsWithRemote()로 병합한다
// - 부부가 비슷한 시간에 각자 입력한 데이터가 한쪽 push/pull로 통째 덮어써져 사라지는 걸 막기 위함.
async function applyRemoteState(parsed) {
  // [버그 수정 - 복원 직후 자동 push로 목표비중/자산예측 설정이 조용히 덮어써짐] 복원은 자산/거래내역
  // 등 여러 값을 한 번에 바꾸는데, 그중 rebalance/projection persist 함수는 하나라도 저장될 때마다
  // schedulePush()를 걸어 3초 뒤 자동으로 클라우드에 업로드한다. 문제는 이 값들이 "병합"이 아니라
  // "원격이 최신이면 통째 채택" 방식이라(위 applyRemoteScalarFields 참고 - 목표비중을 항목 단위로
  // 병합하면 서로 다른 두 설정이 뒤섞여 합계가 안 맞는 등 더 혼란스러운 값이 나올 수 있어 의도적으로
  // 이렇게 두었다), "3일 전으로 되돌리기"와 "배우자가 그 사이 수정한 목표비중 유지하기"가 동시에
  // 성립할 수 없는 순간에 자동으로 push가 나가버리면 배우자의 최근 변경사항이 사용자 모르게 지워질
  // 수 있다 - 이건 앱이 대신 판단할 문제가 아니라 사용자에게 물어봐야 하는 문제다. pull 진행 중에
  // 재push를 막는 것과 동일한 안전장치(applyingRemoteUpdate)를 복원 중에도 재사용해 자동 push
  // 자체를 막고, 복원이 끝난 뒤 동기화가 켜져 있으면 그 사실과 위험을 명확히 알린다(자동으로 아무
  // 쪽도 선택하지 않음 - 사용자가 [서버 동기화중지]로 끄고 확인하거나, 그대로 두면 곧 반영된다).
  applyingRemoteUpdate = true;
  try {
    state.assets = (Array.isArray(parsed.assets) ? parsed.assets : []).map(normalizeImportedAsset);
    state.dayChangeMap = {};
    state.prevCloseMap = {};
    state.sessionMap = {};
    state.priceFetchFailedIds = new Set();
    applyRemoteScalarFields(parsed);
    if (Array.isArray(parsed.transactions)) {
      state.transactions = parsed.transactions.map(normalizeImportedTransaction);
      persistTransactions();
    }
    // [학습된 종목명 캐시] 복원은 "이 시점으로 되돌리기"라 다른 필드들과 마찬가지로 통째 교체한다.
    state.learnedTickerNames = (parsed.learnedTickerNames && typeof parsed.learnedTickerNames === 'object' && !Array.isArray(parsed.learnedTickerNames)) ? parsed.learnedTickerNames : {};
    persistLearnedTickerNames();
    // [티커별 역할(포지션) 단일 소스] 동일한 이유로 통째 교체한다.
    state.tickerRoles = (parsed.tickerRoles && typeof parsed.tickerRoles === 'object' && !Array.isArray(parsed.tickerRoles)) ? parsed.tickerRoles : {};
    persistTickerRoles();
    // [일별 손익 이력] 복원은 "이 시점으로 되돌리기"라 다른 필드들과 마찬가지로 통째 교체한다(applyRemoteScalarFields
    // 상단 주석 참고 - pullFromCloud의 날짜 단위 병합과는 의도적으로 다른 정책).
    if (parsed.dailySnapshots && typeof parsed.dailySnapshots === 'object' && !Array.isArray(parsed.dailySnapshots)) {
      state.dailySnapshots = parsed.dailySnapshots;
      persistDailySnapshots();
      // [버그 수정 - 복원 후 일별 손익 이중 합산] backfillAllHoldingsDailyPnlHistory()는 "아직 소급 채움을
      // 안 해본 자산"만 골라 dailySnapshots에 += 로 더한다 - 방금 완성된 과거 이력을 통째로 반영했으므로
      // 이 자산들을 "안 채움"으로 두면 같은 값이 중복 합산된다. 반영된 자산을 전부 "이미 채워짐"으로
      // 미리 표시해 이중 합산을 막는다.
      const doneFingerprints = getBackfillDoneFingerprints();
      state.assets.forEach((a) => doneFingerprints.add(getBackfillFingerprint(a)));
      localStorage.setItem(LS_DAILY_BACKFILL_DONE_FINGERPRINTS, JSON.stringify(Array.from(doneFingerprints)));
    }
    // [버그 수정 - 복원 후 동기화가 최근 데이터를 "삭제됨"으로 오인] 클라우드 동기화의 병합
    // (mergeCollectionById)은 "로컬에 없는데 예전엔 있었다고 기억하는 id"를 전부 "그 사이 사용자가
    // 일부러 지운 것"으로 판단해 되살리지 않는다 - 그 "예전엔 있었다고 기억"하는 기준이 바로
    // LS_SYNC_MERGED_ASSET_IDS/TX_IDS인데, 이 값은 복원으로 지워지지 않고 그대로 남아있다. 그래서
    // 백업 시점 이후 새로 생긴 자산/거래(이 기기든 배우자 기기든)가 복원으로 로컬에서 사라지면,
    // 복원 직후 자동으로 걸리는 동기화가 이걸 "삭제 의도"로 오인해 클라우드에서도 영구히 지워버릴 수
    // 있었다(사용자 문의로 발견). 복원은 이 기기가 "동기화 이력을 처음부터 다시 시작하는 것"과 같으므로,
    // 병합 기준을 완전히 비워 다음 동기화가 로컬/원격 어느 쪽에만 있는 항목이든 "삭제"가 아니라
    // "새로 생김"으로 보고 전부 살리게 한다(같은 id가 양쪽에 있으면 기존처럼 updatedAt이 더 최신인
    // 쪽이 이긴다 - 이 규칙은 그대로 유지). syncState.lastVersion도 0으로 되돌려, 다음 pull이
    // "이미 최신"이라고 건너뛰지 않고 반드시 한 번 더 클라우드와 실제로 비교·병합하게 한다.
    if (syncState.enabled) {
      localStorage.setItem(LS_SYNC_MERGED_ASSET_IDS, JSON.stringify([]));
      localStorage.setItem(LS_SYNC_MERGED_TX_IDS, JSON.stringify([]));
      syncState.lastVersion = 0;
      localStorage.setItem(LS_SYNC_LAST_VERSION, '0');
    }
    persistAssets();
    renderAll();
    backfillAllHoldingsDailyPnlHistory();
    refreshPricesAndRates();
  } finally {
    applyingRemoteUpdate = false;
  }
  if (syncState.enabled) {
    showToast('백업을 복원했습니다. 동기화가 켜져 있어 곧 이 내용이 클라우드에도 반영됩니다 - 배우자 기기가 그 사이 수정한 목표비중/자산예측 설정이 있다면 되돌아갈 수 있습니다. 먼저 확인하려면 지금 [서버 동기화중지]를 눌러주세요.', 'warn', 10000);
  }
}

// [가족 동기화 - 필드별 최신성 비교] rebalance/projection은 자산처럼 "항목 목록"이 아니라 통째 값
// 하나라 id 단위 병합이 불가능하다 - 그렇다고 "원격의 전체 버전이 더 높으면 통째 채택"도 클라우드
// 동기화(push/pull)에서는 안전하지 않다(전체 버전은 이 필드와 무관한 다른 변경만으로도 올라가므로,
// 그 사이 이 기기가 먼저 만들어둔 더 최신 rebalance/projection 수정이 조용히 덮어써질 수 있다 -
// pushToCloud는 예전에 이 필드를 아예 검사조차 하지 않고 로컬을 그대로 밀어 올려 배우자의 최근
// 수정을 지웠다). 반대로 JSON 백업 복원(applyRemoteState)은 "이 시점으로 통째로 되돌리기"가 목적이라
// 타임스탬프를 비교하면 안 된다(복원 대상이 항상 더 오래된 값일 수 있으므로, 비교하면 복원 자체가
// 조용히 무시된다) - opts.force로 이 차이를 구분한다: force(기본값, 복원용)는 무조건 채택, force:false
// (클라우드 동기화 전용, pull/push 양쪽에서 재사용)는 필드 자체의 updatedAt이 더 최신일 때만 채택한다.
function adoptRemoteRebalanceAndProjection(parsed, opts) {
  const force = !opts || opts.force !== false;
  const ts = (v) => Number(v) || 0;
  if (parsed.rebalance && typeof parsed.rebalance === 'object' && (force || ts(parsed.rebalance.updatedAt) > ts(state.rebalance.updatedAt))) {
    // [소유자별 독립 리밸런싱 목표 - Option B] loadState와 동일한 normalizeRebalanceState(js/01)로
    // 옛 단일 구조/새 owner-keyed 구조를 모두 안전하게 처리한다.
    state.rebalance = normalizeRebalanceState(parsed.rebalance);
    persistRebalance(true); // skipStamp - 원격의 updatedAt을 그대로 이어받는다("지금"으로 새로 찍지 않음)
  }
  if (parsed.projection && typeof parsed.projection === 'object' && (force || ts(parsed.projection.updatedAt) > ts(state.projection.updatedAt))) {
    state.projection = {
      updatedAt: ts(parsed.projection.updatedAt),
      monthlyContribution: num(parsed.projection.monthlyContribution),
      categoryReturns: parsed.projection.categoryReturns || {},
      inflationRate: (parsed.projection.inflationRate !== undefined && parsed.projection.inflationRate !== null && parsed.projection.inflationRate !== '') ? num(parsed.projection.inflationRate) : 2.5,
      contributionGrowthRate: (parsed.projection.contributionGrowthRate !== undefined && parsed.projection.contributionGrowthRate !== null && parsed.projection.contributionGrowthRate !== '') ? num(parsed.projection.contributionGrowthRate) : 0,
      customScenarioRates: parsed.projection.customScenarioRates || {},
      customFeeRates: parsed.projection.customFeeRates || {}, // [Phase 3-4]
      // [Phase 29-A] 빠지면 다른 기기의 배지 확인/적용 이력이 복원·동기화 시 사라진다(js/01 loadState의
      // 같은 필드 백필 주석 참고 - 계산에는 영향 없는 순수 UI 상태).
      cmaRecommendationStatus: parsed.projection.cmaRecommendationStatus || {},
      // [버그 수정 - 복원/동기화 후 절세계좌 계획 소실] 이 필드가 빠져 있으면 state.projection.
      // taxAdvantagedPlan이 undefined가 되어 updateProjection()이 즉시 TypeError로 죽는다 - loadState와
      // 동일한 normalizeTaxAdvantagedPlan(js/01)으로 안전하게 채운다.
      taxAdvantagedPlan: normalizeTaxAdvantagedPlan(parsed.projection.taxAdvantagedPlan),
      // 월적립금 종목 배분도 동일한 이유로 loadState와 같은 정규화 함수(js/01)를 재사용한다.
      monthlyContributionAllocation: normalizeMonthlyContributionAllocation(parsed.projection.monthlyContributionAllocation),
      // 소유자별 독립 월적립금 설정도 동일한 이유로 loadState와 같은 정규화 함수(js/01)를 재사용한다.
      monthlyContributionByOwner: normalizeMonthlyContributionByOwner(parsed.projection.monthlyContributionByOwner)
    };
    persistProjection(true); // skipStamp - 위와 동일한 이유
  }
}

// [가족 동기화 + JSON 백업 복원 공용] 환율/일간변동률/일별 스냅샷처럼 "배열이 아닌" 나머지 설정값들을
// 원격 데이터에서 반영한다 - 자산/거래내역(배열)은 호출부가 각자 다르게 처리한다(applyRemoteState는
// 통째 교체, mergeAssetsAndTransactionsWithRemote는 병합). 환율/일간변동률은 지금처럼 "원격이 더
// 최신이면 그대로 채택" 방식을 유지한다(호출부에서 이미 remote.version > lastVersion을 확인한 뒤에만
// 호출됨 - 배경 시세갱신과 달리 사용자가 수동으로 입력한 값이라 부부가 동시에 두 값을 따로 편집할
// 일이 거의 없어 필드별 타임스탬프까지는 필요하지 않다고 판단). rebalance/projection은 opts.gated로
// 구분한다: 기본값(false, JSON 복원용)은 통째 채택, true(클라우드 동기화 전용)는 필드 자체의
// updatedAt을 비교한다(adoptRemoteRebalanceAndProjection 주석 참고).
function applyRemoteScalarFields(parsed, opts) {
  const gated = opts && opts.gated;
  if (Number.isFinite(num(parsed.exchangeRate)) && num(parsed.exchangeRate) > 0) {
    state.exchangeRate = num(parsed.exchangeRate);
    document.getElementById('exchangeRateInput').value = state.exchangeRate;
    persistRate();
  }
  if (parsed.dailyChangeRate !== undefined) {
    state.dailyChangeRate = num(parsed.dailyChangeRate);
    document.getElementById('dailyChangeInput').value = state.dailyChangeRate;
    persistDaily();
  }
  adoptRemoteRebalanceAndProjection(parsed, { force: !gated });
  // [버그 수정 - 동기화가 과거 일별 손익 이력을 지움] dailySnapshots는 예전엔 이 함수 안에서 다른
  // 설정값들과 똑같이 "원격이 최신이면 통째 교체"했다 - 그런데 이 함수는 JSON 복원과 클라우드 동기화
  // 양쪽에서 공용으로 쓰인다. JSON 복원은 "이 시점으로 되돌리기"라 통째 교체가 맞지만, 클라우드
  // 동기화는 그렇지 않다: 배우자 기기가 사소한 거래 하나만 추가해도 전체 버전 번호가 올라가고, 그
  // 시점에 배우자 기기의 dailySnapshots가 이 기기보다 며칠치 이력이 적으면(예: 최근에야 켠 기기,
  // 아직 소급 채움 전) pull 한 번으로 이 기기가 몇 주간 쌓아온 과거 일별 손익 이력이 통째로 사라졌다
  // (사용자 실측 신고 - 동기화 직후 일별 손익 추이 그래프에 오늘 하루치만 남음). 자산/거래내역이 이미
  // "통째 교체(복원) vs id 단위 병합(동기화)"으로 갈라져 있는 것과 동일하게, dailySnapshots도 이제
  // 이 공용 함수에서 빼서 각 호출부(applyRemoteState=복원은 통째 교체, pullFromCloud=동기화는 날짜
  // 단위 병합)가 자기 상황에 맞는 정책을 직접 적용한다 - learnedTickerNames/tickerRoles가 이미
  // 이 함수 밖에서 호출부별로 다르게 처리되고 있는 것과 같은 구조다.
}

// [가족 동기화 - 스마트 머지] "id가 한쪽에만 있음"은 "새로 생김"과 "상대가 지움" 둘 다일 수 있어
// lastSyncedIds(직전 병합 성공 시점에 이 기기가 알던 id 집합) 없이는 구분이 안 된다:
//   - 로컬에만 있음 + lastSyncedIds에 있었음  -> 원격이 그 사이 지웠다는 뜻 -> 버림
//   - 로컬에만 있음 + lastSyncedIds에 없었음  -> 아직 동기화 안 된 순수 신규 로컬 항목 -> 살림
//   - 원격에만 있음 + lastSyncedIds에 있었음  -> 로컬이 그 사이 지웠다는 뜻 -> 버림(되살리지 않음)
//   - 원격에만 있음 + lastSyncedIds에 없었음  -> 상대가 새로 만든 항목 -> 살림
// 양쪽에 다 있으면 updatedAt이 더 최신인 쪽을 통째로 채택한다(필드 단위 병합은 하지 않음 - 부부 2인
// 저빈도 편집 환경에서는 "레코드 단위 최신 채택"으로 충분하고 필드별 병합보다 훨씬 예측하기 쉽다).
// [순수 함수 - 의존성 없음] 전역 num() 헬퍼조차 쓰지 않고 자체적으로 숫자 변환한다 - test/merge.test.js가
// 이 파일 전체를 require()하지 않고도(브라우저 전용 top-level DOM 배선 코드가 많아 Node에서 그대로
// 실행할 수 없다) 이 함수 하나만 순수 로직으로 독립 검증할 수 있게 하기 위함이다.
function mergeCollectionById(localArr, remoteArr, lastSyncedIds) {
  const toTs = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const localMap = new Map(localArr.map((x) => [x.id, x]));
  const remoteMap = new Map(remoteArr.map((x) => [x.id, x]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];
  allIds.forEach((id) => {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && r) {
      merged.push(toTs(r.updatedAt) > toTs(l.updatedAt) ? r : l);
    } else if (l && !r) {
      if (!lastSyncedIds.has(id)) merged.push(l);
    } else if (r && !l) {
      if (!lastSyncedIds.has(id)) merged.push(r);
    }
  });
  return merged;
}
function getMergeBaseline(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (e) { return new Set(); }
}
// state.assets/state.transactions만 병합하고 스칼라 필드는 건드리지 않는다(요청 범위 - 자산/거래내역).
// 호출부(pullFromCloud/pushToCloud)가 persistAssets()/persistTransactions()/renderAll()을 알아서 호출한다.
// [학습된 종목명 캐시는 예외적으로 여기서 함께 병합] exchangeRate/rebalance 같은 "현재 설정값"과 달리
// 이건 순수 추가형 캐시라 원격이 최신이라고 통째 덮어쓰면 이 기기가 그 사이 배운 종목명을 잃는다 -
// 충돌 없이 그냥 두 쪽 키를 합친다(같은 티커가 양쪽에 있으면 로컬 값을 우선 - 사실상 항상 같은 값).
function mergeAssetsAndTransactionsWithRemote(parsed) {
  const remoteAssets = (Array.isArray(parsed.assets) ? parsed.assets : []).map(normalizeImportedAsset);
  const remoteTx = (Array.isArray(parsed.transactions) ? parsed.transactions : []).map(normalizeImportedTransaction);
  state.assets = mergeCollectionById(state.assets, remoteAssets, getMergeBaseline(LS_SYNC_MERGED_ASSET_IDS));
  state.transactions = mergeCollectionById(state.transactions, remoteTx, getMergeBaseline(LS_SYNC_MERGED_TX_IDS));
  localStorage.setItem(LS_SYNC_MERGED_ASSET_IDS, JSON.stringify(state.assets.map((a) => a.id)));
  localStorage.setItem(LS_SYNC_MERGED_TX_IDS, JSON.stringify(state.transactions.map((t) => t.id)));
  if (parsed.learnedTickerNames && typeof parsed.learnedTickerNames === 'object' && !Array.isArray(parsed.learnedTickerNames)) {
    state.learnedTickerNames = { ...parsed.learnedTickerNames, ...state.learnedTickerNames };
    persistLearnedTickerNames();
  }
  // [티커별 역할(포지션) 단일 소스] learnedTickerNames와 동일한 이유(순수 추가형, 로컬 값 우선 병합) -
  // 배우자 기기에서 지정한 포지션도 이 기기에 함께 반영되어야 두 기기의 role이 실제로 동기화된다.
  if (parsed.tickerRoles && typeof parsed.tickerRoles === 'object' && !Array.isArray(parsed.tickerRoles)) {
    state.tickerRoles = { ...parsed.tickerRoles, ...state.tickerRoles };
    persistTickerRoles();
  }
  // [버그 수정 - 동기화가 과거 일별 손익 이력을 지움] 예전엔 applyRemoteScalarFields가 dailySnapshots를
  // exchangeRate/rebalance 같은 "현재 설정값"과 똑같이 "원격이 최신이면 통째 교체"했다 - 배우자 기기가
  // 사소한 거래 하나만 추가해도 전체 버전이 올라가는데, 그 시점 배우자 기기의 dailySnapshots가 이
  // 기기보다 며칠치 이력이 적으면(최근에야 켠 기기, 아직 소급 채움 전 등) pull 한 번으로 이 기기가
  // 쌓아온 과거 이력이 통째로 사라졌다(사용자 실측 신고 - 동기화 직후 일별 손익 추이에 오늘 하루치만
  // 남음). learnedTickerNames/tickerRoles와 동일한 이유(순수 추가형 - 하루의 기록은 한 번 쌓이면
  // 바뀔 일이 없다) 날짜 키 단위로 병합한다 - 같은 날짜가 양쪽에 있으면(대개 "오늘") 로컬 값을
  // 우선한다. 어느 한쪽에만 있는 과거 날짜는 병합으로 그대로 보존된다.
  if (parsed.dailySnapshots && typeof parsed.dailySnapshots === 'object' && !Array.isArray(parsed.dailySnapshots)) {
    state.dailySnapshots = { ...parsed.dailySnapshots, ...state.dailySnapshots };
    persistDailySnapshots();
  }
}

let pushDebounceTimer = null;
let applyingRemoteUpdate = false; // 원격 데이터 반영 중엔 재push 금지(무한루프/낭비 방지)
function schedulePush() {
  if (!syncState.enabled || applyingRemoteUpdate) return;
  clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushToCloud().catch((e) => console.warn('[동기화] 업로드 실패', e));
  }, 3000); // 3초 트레일링 디바운스 - 엑셀 일괄 업로드 등 연속 변경을 한 번의 push로 합친다
}
async function pushToCloud() {
  if (!syncState.enabled) return;
  try {
    const kvKey = await deriveKvKey(syncState.password);
    // [스마트 머지 - 덮어쓰기 전 병합] 업로드 직전에 클라우드를 먼저 확인해, 로컬이 아직 못 받은 더
    // 최신 원격 데이터가 있으면 push하기 전에 먼저 병합한다 - 안 그러면 배우자가 방금 추가한 자산/
    // 거래가 이 push 한 번으로 통째 덮어써져 사라질 수 있다(부부가 비슷한 시간에 각자 입력하는 경우
    // 정확히 이 시나리오였다). 비밀번호가 틀려 복호화가 실패하면 아래 catch가 잡아 push 자체를
    // 중단한다 - 검증 안 된 원격 위에 무작정 덮어쓰지 않기 위함이다.
    const getRes = await fetch(`${SYNC_WORKER_URL}/?k=${encodeURIComponent(kvKey)}`);
    if (getRes.ok) {
      const remote = await getRes.json();
      if (remote.version && remote.version > syncState.lastVersion) {
        const parsed = await decryptSyncBlob(remote, syncState.password);
        applyingRemoteUpdate = true;
        try {
          mergeAssetsAndTransactionsWithRemote(parsed);
          persistAssets();
          persistTransactions();
          // [버그 수정 - push가 배우자의 최근 설정 수정을 조용히 덮어씀] 예전엔 이 push 전 병합이
          // 자산/거래내역만 확인하고, rebalance/projection은 검사 없이 곧장 로컬 값을 그대로 밀어
          // 올렸다 - 그 사이 배우자 기기가 이 필드를 더 최근에 고쳐뒀어도 이 기기가 (그 필드와 무관한)
          // 사소한 편집 하나만 해도 통째로 덮어써 사라졌다. pull과 동일한 함수로 push 직전에도 필드
          // 단위 최신성을 비교해(force:false), 정말 원격이 더 최신인 경우에만 그 값을 먼저 반영한 뒤
          // 업로드한다 - 여기는 복원이 아니라 동기화이므로 force:true(통째 채택)를 쓰면 안 된다.
          adoptRemoteRebalanceAndProjection(parsed, { force: false });
        } finally {
          applyingRemoteUpdate = false;
        }
        syncState.lastVersion = remote.version;
        renderAll();
      }
    }
    const version = Date.now();
    const encrypted = await encryptSyncBlob(buildSyncBlob(), syncState.password);
    const res = await fetch(`${SYNC_WORKER_URL}/?k=${encodeURIComponent(kvKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...encrypted, version, updatedAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error('push failed: ' + res.status);
    syncState.lastVersion = version;
    syncState.hasError = false;
    localStorage.setItem(LS_SYNC_LAST_VERSION, String(version));
    localStorage.setItem(LS_SYNC_LAST_SYNCED_AT, new Date().toISOString());
    // [스마트 머지 - 기준선 갱신] 병합을 안 거치고 곧장 push한 경우(원격이 비어있던 최초 push 등)에도
    // 기준선을 반드시 갱신해야 한다 - 안 그러면 이 기기의 기준선이 계속 비어있는 채로 남아, 다음 번
    // 상대의 삭제가 이 기기에서 "삭제로 인식"되지 못하고 되살아나 버린다.
    localStorage.setItem(LS_SYNC_MERGED_ASSET_IDS, JSON.stringify(state.assets.map((a) => a.id)));
    localStorage.setItem(LS_SYNC_MERGED_TX_IDS, JSON.stringify(state.transactions.map((t) => t.id)));
    updateSyncStatusUI();
  } catch (e) {
    syncState.hasError = true;
    updateSyncStatusUI();
    throw e; // schedulePush()의 .catch(console.warn)이 계속 받아 로그로 남기도록 그대로 전파
  }
}
// 반환값은 호출부(특히 onSyncPasswordSaved의 최초 페어링 분기)가 상황을 구분하는 데 쓰인다.
// opts.fullAdopt: 이 기기가 이번에 처음 동기화를 켤 때만 true로 넘어온다(onSyncPasswordSaved 참고) -
// [최초 페어링 - 병합하지 않고 통째로 채택하는 이유] 병합 기준선이 아직 하나도 없는 상태에서 일반
// 병합을 그대로 적용하면, 이 기기의 기존 로컬 데이터(특히 와이프님 폰처럼 아직 안 지운 샘플/데모
// 자산 6건)까지 전부 "아직 동기화 안 된 신규 항목"으로 오인해 배우자의 진짜 데이터와 합쳐(union)
// 버린다 - 그 결과 신랑님의 실제 자산 목록에 와이프님 폰의 샘플 자산이 섞여 들어가는 사고가 난다.
// 최초 1회만은 예전처럼 원격을 통째로 "채택"해 이 문제를 원천 차단하고, 이후 편집분부터는 정상적으로
// 병합된다(기준선이 이 시점에 채택된 id 목록으로 설정되므로).
async function pullFromCloud(opts) {
  const silent = opts && opts.silent;
  const fullAdopt = opts && opts.fullAdopt;
  if (!syncState.enabled) return 'disabled';
  try {
    const kvKey = await deriveKvKey(syncState.password);
    const res = await fetch(`${SYNC_WORKER_URL}/?k=${encodeURIComponent(kvKey)}`);
    if (res.status === 404) { // 아직 아무도 push 안 함(최초 페어링 - 이 기기 데이터가 기준) - 통신 자체는 성공
      syncState.hasError = false;
      updateSyncStatusUI();
      return 'not_found';
    }
    if (!res.ok) throw new Error('pull failed: ' + res.status);
    const remote = await res.json();
    syncState.hasError = false; // 여기까지 왔으면 통신은 정상 - 이후 분기는 통신 오류가 아니다
    if (!remote.version || remote.version <= syncState.lastVersion) { updateSyncStatusUI(); return 'up_to_date'; }
    let parsed;
    try {
      parsed = await decryptSyncBlob(remote, syncState.password);
    } catch (e) {
      showSyncDecryptFailure();
      updateSyncStatusUI();
      return 'decrypt_failed';
    }
    applyingRemoteUpdate = true;
    try {
      if (fullAdopt) {
        // [최초 페어링 전용] 위 주석 참고 - 병합 없이 원격을 통째로 채택하고, 그 결과를 기준선으로 삼는다.
        state.assets = (Array.isArray(parsed.assets) ? parsed.assets : []).map(normalizeImportedAsset);
        state.transactions = (Array.isArray(parsed.transactions) ? parsed.transactions : []).map(normalizeImportedTransaction);
        localStorage.setItem(LS_SYNC_MERGED_ASSET_IDS, JSON.stringify(state.assets.map((a) => a.id)));
        localStorage.setItem(LS_SYNC_MERGED_TX_IDS, JSON.stringify(state.transactions.map((t) => t.id)));
        // [학습된 종목명 캐시는 최초 페어링이어도 병합] 자산/거래내역과 달리 "잘못 섞이면 안 되는 진짜
        // 데이터"가 아니라 순수 도움용 캐시라, 이 기기가 이미 배운 이름을 굳이 버릴 이유가 없다.
        if (parsed.learnedTickerNames && typeof parsed.learnedTickerNames === 'object' && !Array.isArray(parsed.learnedTickerNames)) {
          state.learnedTickerNames = { ...parsed.learnedTickerNames, ...state.learnedTickerNames };
          persistLearnedTickerNames();
        }
        // [티커별 역할(포지션) 단일 소스] 동일한 이유(순수 도움용 캐시) - 최초 페어링이어도 병합한다.
        if (parsed.tickerRoles && typeof parsed.tickerRoles === 'object' && !Array.isArray(parsed.tickerRoles)) {
          state.tickerRoles = { ...parsed.tickerRoles, ...state.tickerRoles };
          persistTickerRoles();
        }
        // [일별 손익 이력 - 버그 수정] 동일한 이유(순수 추가형 기록) - 최초 페어링이어도 통째 교체
        // 대신 날짜 단위로 병합한다(mergeAssetsAndTransactionsWithRemote와 동일한 정책).
        if (parsed.dailySnapshots && typeof parsed.dailySnapshots === 'object' && !Array.isArray(parsed.dailySnapshots)) {
          state.dailySnapshots = { ...parsed.dailySnapshots, ...state.dailySnapshots };
          persistDailySnapshots();
        }
      } else {
        // [스마트 머지] 통째 덮어쓰기 대신 자산/거래내역은 id+updatedAt 기준으로 병합한다.
        mergeAssetsAndTransactionsWithRemote(parsed);
      }
      // 환율/일간변동률은 두 경로 모두 기존처럼 원격 값을 그대로 채택한다(이미 위에서
      // remote.version > lastVersion을 확인한 뒤라 원격이 더 최신). rebalance/projection은
      // { gated: true }로 넘겨 필드 자체의 updatedAt을 따로 비교하게 한다(아래 adoptRemoteRebalanceAndProjection
      // 주석 참고 - fullAdopt 최초 페어링이어도 예외 없이 적용: 이 필드는 "샘플/데모 데이터 섞임" 문제와
      // 무관해 최초 페어링을 다르게 취급할 이유가 없다).
      applyRemoteScalarFields(parsed, { gated: true });
      persistAssets();
      persistTransactions();
      renderAll();
      backfillAllHoldingsDailyPnlHistory();
      refreshPricesAndRates();
    } finally {
      applyingRemoteUpdate = false;
    }
    syncState.lastVersion = remote.version;
    localStorage.setItem(LS_SYNC_LAST_VERSION, String(remote.version));
    localStorage.setItem(LS_SYNC_LAST_SYNCED_AT, new Date().toISOString());
    updateSyncStatusUI();
    if (!silent) showToast('클라우드에서 최신 데이터를 받아왔습니다.', 'success');
    return 'applied';
  } catch (e) {
    console.warn('[동기화] 다운로드 실패', e); // 네트워크 오류는 조용히 무시 - 다음 10초 주기에 재시도
    syncState.hasError = true;
    updateSyncStatusUI();
    return 'error';
  }
}

// [동기화 상태 색상 3세트] 아이콘 없이 텍스트+배경색만으로 상태를 구분한다(요청에 따라 아이콘 완전
// 제거) - 헤더의 syncSettingsBtn과 모달 안의 syncStatusText가 이 색상 세트를 공유한다.
// updateSyncStatusUI()가 매번 세 세트를 전부 지운 뒤 현재 상태에 맞는 세트만 다시 붙이는 방식이라,
// 상태가 바뀔 때마다 이전 색이 남아있을 걱정 없이 항상 정확한 한 가지 색만 적용된다.
// [버그 수정] 위 방식은 상태가 안 바뀌어도(예: 10초 주기 pullFromCloud가 계속 "동기화중" 유지) 매번
// classList를 지웠다가 다시 붙여서, 안 바뀐 배경색까지 매번 transition-colors(150ms)를 재시작시켰다
// - 그 결과 실기기에서 애니메이션이 자주 리셋되며 완료 직전 프레임(옅은/흰색 배경)에 계속 머무는 것처럼
// 보이는 현상이 있었다. 목표 색상 세트가 실제로 바뀔 때만 classList를 건드리도록 고쳤다.
const SYNC_COLOR_ACTIVE = ['bg-brand-50', 'dark:bg-brand-950/40', 'border-brand-200', 'dark:border-brand-800', 'text-brand-600', 'dark:text-brand-400'];
const SYNC_COLOR_INACTIVE = ['bg-white', 'dark:bg-slate-900', 'border-slate-200', 'dark:border-slate-800', 'text-slate-400', 'dark:text-slate-500'];
const SYNC_COLOR_ERROR = ['bg-red-50', 'dark:bg-red-950/40', 'border-red-200', 'dark:border-red-800', 'text-red-600', 'dark:text-red-400'];
const SYNC_ALL_COLOR_CLASSES = [...SYNC_COLOR_ACTIVE, ...SYNC_COLOR_INACTIVE, ...SYNC_COLOR_ERROR];
function applySyncColorSet(el, state) {
  if (el.dataset.syncColorState === state) return; // 이미 이 색상 세트라면 classList를 건드리지 않는다
  el.classList.remove(...SYNC_ALL_COLOR_CLASSES);
  el.classList.add(...(state === 'inactive' ? SYNC_COLOR_INACTIVE : state === 'error' ? SYNC_COLOR_ERROR : SYNC_COLOR_ACTIVE));
  el.dataset.syncColorState = state;
}
// [Phase 28] Header Utility를 모든 폭에서 한 줄로 유지하기 위해 동기화 버튼을 아이콘 전용(44x44)으로
// 바꿨다 - 예전 텍스트 버튼("서버 동기화중지")은 375px에서 117px을 차지해 한 줄이 성립하지 않았다.
// [색상만으로 상태를 전달하지 않는다] 상태 구분을 색에 맡기지 않고 아이콘 "모양"이 서로 다르게 한다:
// 중지=cloud-off(구름에 사선), 동기화중=refresh-cw(회전 화살표), 오류=alert-triangle(경고 삼각형).
// 화면에서 사라진 한국어 상태 문구는 title/aria-label로 그대로 남아 스크린리더와 툴팁에 전달되고,
// 동기화 설정 모달 안의 상태 배지(syncStatusText)는 예전 그대로 전체 문장을 보여준다.
const SYNC_BTN_PRESENTATION = {
  inactive: { icon: 'cloud-off', label: '서버 동기화중지' },
  error: { icon: 'alert-triangle', label: '서버 동기화오류' },
  active: { icon: 'refresh-cw', label: '서버 동기화중' }
};
function applySyncButtonPresentation(btn, state) {
  const p = SYNC_BTN_PRESENTATION[state];
  btn.setAttribute('title', p.label);
  btn.setAttribute('aria-label', p.label);
  // 같은 아이콘이면 다시 그리지 않는다(lucide.createIcons가 매번 DOM을 갈아끼우는 비용을 피한다).
  if (btn.dataset.syncIcon === p.icon) return;
  btn.dataset.syncIcon = p.icon;
  btn.innerHTML = `<i data-lucide="${p.icon}" class="w-4 h-4"></i>`;
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
function updateSyncStatusUI() {
  const toggleBtn = document.getElementById('syncSettingsBtn');
  if (toggleBtn) {
    const state = !syncState.enabled ? 'inactive' : (syncState.hasError ? 'error' : 'active');
    applySyncButtonPresentation(toggleBtn, state);
    applySyncColorSet(toggleBtn, state);
  }
  // [모달 안 상태 배지] 암호 입력란보다 위에서 크게 보여준다(요청에 따라 위치 이동) - 헤더 버튼과
  // 같은 3색 규칙 + 마지막 동기화 시각까지 함께 표기한다.
  const statusEl = document.getElementById('syncStatusText');
  if (statusEl) {
    if (!syncState.enabled) {
      statusEl.textContent = '서버 동기화중지';
      applySyncColorSet(statusEl, 'inactive');
    } else if (syncState.hasError) {
      statusEl.textContent = '서버 동기화오류 · 네트워크 연결을 확인해주세요';
      applySyncColorSet(statusEl, 'error');
    } else {
      const lastAt = localStorage.getItem(LS_SYNC_LAST_SYNCED_AT);
      statusEl.textContent = lastAt ? `서버 동기화중 · 마지막 동기화 ${new Date(lastAt).toLocaleString('ko-KR')}` : '서버 동기화중 · 동기화 대기 중...';
      applySyncColorSet(statusEl, 'active');
    }
  }
}
// [암호 보기/숨기기] input type을 text<->password로 토글하고 눈 아이콘도 함께 바꾼다.
function toggleSyncPasswordVisibility() {
  const input = document.getElementById('syncPasswordInput');
  const btn = document.getElementById('syncPasswordToggleBtn');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" class="w-4 h-4"></i>`;
  lucide.createIcons();
}
function showSyncDecryptFailure() {
  document.getElementById('syncDecryptErrorBox')?.classList.remove('hidden');
  openSyncSettingsModal();
}
function openSyncSettingsModal() {
  updateSyncStatusUI();
  document.getElementById('syncSettingsModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeSyncSettingsModal(viaBackButton) {
  document.getElementById('syncSettingsModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
// [최초 페어링] 신랑님 폰(먼저 설정, 클라우드 비어있음) -> pull이 'not_found' -> "이 기기 데이터 업로드"
// 버튼을 한 번 더 눌러 확인해야 push된다(자동으로 바로 push하지 않는다 - 아래 이유 참고). 와이프님
// 폰(나중에 설정, 클라우드에 이미 있음) -> pull이 'applied'로 자동 채택.
// [오타 방지 - 자동 push하지 않는 이유] "클라우드에 데이터 없음(404)"은 (a) 정말 최초 기기이거나
// (b) 배우자와 다른 암호를 잘못 입력했을 때 똑같이 발생해서 구분이 안 된다 - 자동으로 바로 push하면
// 오타를 낸 사용자가 원래 있던 진짜 동기화 슬롯과 무관한 "유령" 슬롯을 조용히 만들고도 "동기화 시작됨"
// 이라는 성공 메시지를 보게 되어, 정작 배우자 기기와는 영영 연결되지 않는 조용한 실패로 이어진다.
async function onSyncPasswordSaved(password) {
  localStorage.setItem(LS_SYNC_PASSWORD, password);
  localStorage.setItem(LS_SYNC_ENABLED, '1');
  syncState.password = password;
  syncState.enabled = true;
  syncState.lastVersion = 0; // 비밀번호가 바뀌면 이전 버전 기록은 의미가 없으므로 초기화하고 다시 판정
  localStorage.setItem(LS_SYNC_LAST_VERSION, '0');
  document.getElementById('syncDecryptErrorBox')?.classList.add('hidden');
  document.getElementById('syncUploadConfirmBox')?.classList.add('hidden');
  const result = await pullFromCloud({ fullAdopt: true }); // 최초 페어링 - 병합 대신 통째 채택(위 pullFromCloud 주석 참고)
  updateSyncStatusUI();
  if (result === 'applied') {
    showToast('클라우드 데이터를 이 기기에 반영했습니다.', 'success');
    closeSyncSettingsModal(); // [자동 닫기] 저장이 실제로 성공(=최신 데이터 반영)했을 때만 닫는다
  }
  else if (result === 'not_found') document.getElementById('syncUploadConfirmBox')?.classList.remove('hidden');
  else if (result === 'decrypt_failed') showToast('비밀번호가 올바르지 않습니다.', 'error');
  else if (result === 'error') showToast('네트워크 오류로 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
}

document.getElementById('syncSettingsBtn').addEventListener('click', () => openSyncSettingsModal());
document.getElementById('syncPasswordToggleBtn').addEventListener('click', () => toggleSyncPasswordVisibility());
document.getElementById('closeSyncSettingsModalBtn').addEventListener('click', () => closeSyncSettingsModal());
document.getElementById('syncSettingsModal').addEventListener('click', (e) => { if (e.target.id === 'syncSettingsModal') closeSyncSettingsModal(); });
document.getElementById('syncPasswordSaveBtn').addEventListener('click', async () => {
  const pw = document.getElementById('syncPasswordInput').value.trim();
  if (!pw) { showToast('암호를 입력해주세요.', 'warn'); return; }
  await onSyncPasswordSaved(pw);
});
document.getElementById('syncUploadConfirmBtn').addEventListener('click', async () => {
  try {
    await pushToCloud();
    document.getElementById('syncUploadConfirmBox')?.classList.add('hidden');
    updateSyncStatusUI();
    showToast('이 기기의 데이터를 클라우드에 업로드했습니다.', 'success');
    closeSyncSettingsModal(); // [자동 닫기] 업로드가 실제로 성공했을 때만 닫는다
  } catch (e) {
    showToast('네트워크 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
  }
});
document.getElementById('syncDisableBtn').addEventListener('click', () => {
  syncState.enabled = false;
  syncState.hasError = false;
  localStorage.setItem(LS_SYNC_ENABLED, '0');
  updateSyncStatusUI();
  showToast('동기화를 껐습니다.', 'info');
});

// [테스트 전용] 브라우저에는 `module`이 없으므로 이 블록은 그냥 무시된다 - Node의 test/merge.test.js가
// mergeCollectionById()를 require해서 순수 함수 단위로 검증할 수 있도록 노출만 해준다.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeCollectionById };
}

