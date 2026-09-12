/* -------------------------------------------------------------------------
 * 21. 엑셀 내보내기 (전체 백업 - 파생 필드 포함)
 * ---------------------------------------------------------------------- */
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  // [P1 데이터 보존 - FIX-3] 예전엔 평가금액이 0인 자산(전량 매도된 포지션, 수량이 0으로 들어간
  // 부동산 등)을 "표시할 필요 없는 행"으로 보고 이 시트에서 걸러냈다. 그런데 이 파일은 화면 스냅샷이
  // 아니라 전체 백업이고(위 섹션 제목 참고), [덮어쓰기]로 다시 올리면 state.assets를 파일 내용으로
  // 통째 교체한다 - 걸러진 자산은 그 왕복 한 번으로 영구히 사라졌고, 동기화가 켜져 있으면 배우자
  // 기기에서도 함께 사라졌다(실사용 데이터에서 대상 자산 2건 확인). 백업의 목적은 보존이므로
  // state.assets 레코드는 평가금액과 무관하게 전부 내보낸다.
  // [화면 정책은 그대로다] 화면에서 이런 자산을 숨기는 규칙(tableAssets/filteredAssets/
  // hasRealEstateHoldings, js/01)은 전혀 건드리지 않았다 - 화면에는 계속 안 보이고, 백업 파일에만
  // 들어간다. "포트폴리오 구성"의 신규 매수 목표는 state.rebalance.targets에 따로 저장되어 이
  // 배열(state.assets)에 애초에 없으므로 여기 영향이 없다.
  const rows = state.assets.map(a => {
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
// [P1 데이터 보존 - FIX-7] 백업 파일이 그 키를 "안 담고 있었다"와 "빈 값으로 담고 있었다"를
// 구분한다 - 전자만 기존 값을 보존해야 한다(값이 {}인 것은 그 시점에 실제로 비어 있었다는 사실이다).
function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}
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

/* [V1.2-B BL-17 - PM 재확정] 엑셀/JSON 재업로드의 category 처리 원칙:
 *   "기존 사용자 확정값은 빈 셀 때문에 사라지지 않는다. 그러나 새로운 category 값이 명시적으로
 *   입력된 경우에는(유효하든, 앱이 모르는 값이든) 그 새 입력을 우선 처리한다."
 * 판단 기준은 오직 "이번 파일이 이 행의 category 칸에 뭐라도(공백 제외) 적어 뒀는가" 하나뿐이다 -
 * 그 칸에 적힌 값이 유효한지 아닌지, 기존 값이 user/system/legacy 중 무엇이었는지는 이 판단에
 * 전혀 관여하지 않는다(칸이 비었으면 기존 값을 종류 불문 그대로 이어받고, 칸에 뭐라도 있으면 그
 * 값에 대한 makeAsset/resolveImportedCategory의 판단 - 유효하면 user, 오염이면 system - 을 그대로
 * 채택한다). 그래서 buildCategorySourceIndex는 'user'만 걸러내지 않고 존재하는 기존 자산 전부를
 * 색인한다 - system이나 legacy(categorySource 없음)도 "빈 칸"을 만나면 그대로 보존 대상이다. */
function buildCategorySourceIndex(existingAssets) {
  const byId = new Map(), byKey = new Map();
  (existingAssets || []).forEach((a) => {
    if (!a) return;
    const entry = { category: a.category, categorySource: a.categorySource };
    if (a.id) byId.set(a.id, entry);
    byKey.set(assetMergeKey(a), entry);
  });
  return { byId, byKey };
}
// incoming.categoryCellRaw는 makeAsset()이 category/categorySource를 판정하기 전, 뭉개지기 전의
// 원본 셀 텍스트다(위 imported 매핑/restored 매핑 참고) - 이 표식을 여기서 소비하고 반드시 제거한다
// (state.assets/localStorage에는 절대 남지 않아야 한다).
function carryOverCategorySource(incoming, index) {
  const cellRaw = incoming.categoryCellRaw;
  const clean = { ...incoming };
  delete clean.categoryCellRaw;
  if (cellRaw !== '') return clean; // 이번 파일이 이 칸에 뭐라도 적어 뒀다 - 유효/오염 불문 그 결과를 그대로 채택
  const kept = index.byId.get(clean.id) || index.byKey.get(assetMergeKey(clean));
  return kept === undefined ? clean : { ...clean, category: kept.category, categorySource: kept.categorySource };
}

/* [P1 데이터 보존 - FIX-4/FIX-5] 엑셀 시트의 빈 칸(또는 아예 없는 열)이 기존 값을 지우지 않게 한다.
 *
 * pick()은 "빈 셀"과 "열 자체가 없음"을 똑같이 ''로 뭉갠다 - 그래서 Phase 53 이전에 만들어진 구형
 * 파일처럼 열이 아예 없는 파일을 올리기만 해도 취득환율(buyRate)과 대표매칭(rateMatchOverride)이
 * 통째로 사라졌다. 이건 "사용자가 지웠다"가 아니라 "그 파일에는 그 정보가 없다"이다.
 *
 * [왜 이 두 필드인가]
 *   buyRate            : 앱에 이 값을 비우는 입력칸 자체가 없다(거래원장 동기화가 USD일 때만 채운다).
 *                        클라우드 병합은 이미 MERGE_PRESERVE_IF_ABSENT로 보호하고 있었는데 엑셀
 *                        경로만 지우고 있었다 - 같은 필드에 대한 두 경로의 판단이 서로 달랐다.
 *   rateMatchOverride  : 지우는 조작이 존재하는 필드라 클라우드 병합에서는 일부러 보호하지 않는다.
 *                        엑셀은 다르다 - 구형 파일에는 이 열이 없어서 "비었다"가 의도를 뜻하지 못한다.
 *                        엑셀로 해제하는 문법은 이번에 만들지 않는다(자산 상세/거래 폼에서 그대로
 *                        해제할 수 있다). 클라우드 쪽 MERGE_PRESERVE_IF_ABSENT는 건드리지 않는다.
 *
 * 구조는 positionSource(buildPositionSourceIndex/carryOverPositionSource)와 똑같다 - id로 먼저 찾고,
 * id가 없는 구형 파일은 identity(assetMergeKey)로 찾는다. 기존 자산을 못 찾으면 값 없이 그대로 둔다
 * (없던 값을 추정해 만들지 않는다 - 상시 정책 5항). */
const IMPORT_CARRY_IF_ABSENT_FIELDS = ['buyRate', 'rateMatchOverride'];
function buildCarryIfAbsentIndex(existingAssets) {
  const byId = new Map(), byKey = new Map();
  (existingAssets || []).forEach((a) => {
    if (!a) return;
    const entry = {};
    IMPORT_CARRY_IF_ABSENT_FIELDS.forEach((f) => { if (a[f] !== undefined) entry[f] = a[f]; });
    if (Object.keys(entry).length === 0) return;
    if (a.id) byId.set(a.id, entry);
    byKey.set(assetMergeKey(a), entry);
  });
  return { byId, byKey };
}
function carryOverAbsentFields(incoming, index) {
  const missing = IMPORT_CARRY_IF_ABSENT_FIELDS.filter((f) => incoming[f] === undefined);
  if (missing.length === 0) return incoming;
  const kept = index.byId.get(incoming.id) || index.byKey.get(assetMergeKey(incoming));
  if (kept === undefined) return incoming;
  const out = { ...incoming };
  missing.forEach((f) => { if (kept[f] !== undefined) out[f] = kept[f]; });
  return out;
}

function mergeAssetsForAppend(existingAssets, incomingAssets) {
  const merged = existingAssets.map((a) => ({ ...a })); // 원본 배열/객체를 직접 변형하지 않도록 복사
  const indexByKey = new Map(merged.map((a, i) => [assetMergeKey(a), i]));
  let newCount = 0, updatedCount = 0;
  incomingAssets.forEach((incoming) => {
    const key = assetMergeKey(incoming);
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      // 이어받을 기존 자산이 없다 - carryOverCategorySource가 개입할 이유도 없으므로, 이번 파일 자체의
      // 판단(makeAsset/resolveImportedCategory)을 그대로 쓴다. categoryCellRaw 표식만 정리해서 뺀다.
      const newAsset = { ...incoming };
      delete newAsset.categoryCellRaw;
      merged.push(newAsset);
      indexByKey.set(key, merged.length - 1);
      newCount++;
      return;
    }
    const kept = merged[idx];
    // 값은 전부 최신 파일 기준, id만 기존 것 유지. positionSource/categorySource는 아래 공용 규칙이 이어받는다.
    const withPosition = carryOverPositionSource({ ...incoming, id: kept.id }, buildPositionSourceIndex([kept]));
    merged[idx] = carryOverCategorySource(withPosition, buildCategorySourceIndex([kept]));
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
      const imported = json.map(row => {
        // [V1.2-B BL-17] 셀이 "비어 있었다"와 "지원하지 않는 값이 적혀 있었다"는 서로 다르다 - 전자만
        // carryOverCategorySource의 보호 대상이다(sanitizeAssetCategory를 거치면 둘 다 undefined로
        // 뭉개져 구분이 사라지므로, 뭉개지기 전의 원본 텍스트를 따로 남겨 둔다).
        const categoryCellRaw = String(pick(row, '자산군(자동분류)', '자산군', 'category') ?? '').trim();
        const asset = makeAsset({
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
          category: sanitizeAssetCategory(categoryCellRaw),
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
        });
        // [V1.2-B BL-17] carryOverCategorySource 전용 임시 표식 - mergeAssetsForAppend와 아래 덮어쓰기
        // 분기가 소비한 뒤 반드시 제거한다(state.assets/localStorage에는 절대 남지 않는다).
        asset.categoryCellRaw = categoryCellRaw;
        return asset;
      });

      if (imported.length === 0) { alert('가져올 데이터가 없습니다. (ticker, 소유자, 계좌구분, 종목명, 국내/해외, 통화, 수량, 매수단가 헤더를 확인하세요)'); return; }
      const choice = await openImportChoiceModal(`${imported.length}건을 불러옵니다.\n기존 데이터를 덮어쓸까요, 추가할까요?`);
      if (choice === 'cancel') return; // 가져오기 자체를 취소 - 아무 것도 바뀌지 않는다.
      let resultMsg;
      // [P1 데이터 보존 - FIX-4/FIX-5] 엑셀에 그 칸이 비어 있거나 열 자체가 없을 때 기존
      // buyRate/rateMatchOverride를 이어받는다. 반드시 state.assets를 바꾸기 **전에** 색인을 만든다.
      // 두 분기 모두 마지막에 한 번씩만 적용한다 - mergeAssetsForAppend()와 덮어쓰기 분기의 기존
      // 규칙(assetMergeKey 매칭, positionSource/categorySource 이월)은 그대로 두고 그 결과 위에
      // 덧입히는 방식이라, 이 경로 밖(JSON 복원/클라우드 병합)의 동작은 전혀 달라지지 않는다.
      const keptCarryFields = buildCarryIfAbsentIndex(state.assets);
      if (choice === 'append') {
        const { assets, newCount, updatedCount } = mergeAssetsForAppend(state.assets, imported);
        state.assets = assets.map((a) => carryOverAbsentFields(a, keptCarryFields));
        resultMsg = `신규 ${newCount}개 추가, 기존 ${updatedCount}개 최신 수량으로 업데이트됨`;
      } else {
        // [V1.1 M4] 덮어쓰기는 state.assets를 통째로 갈아치운다 - 갈아치우기 전의 자산에서
        // positionSource를 이어받는다(엑셀에는 그 칸이 없어서 파일만으로는 알 수 없다).
        // 찾지 못한 자산은 값 없이 그대로 둔다 - 거래내역 유무로 추측하지 않는다.
        const keptSources = buildPositionSourceIndex(state.assets);
        // [V1.2-B BL-17] positionSource와 같은 이유로 categorySource도 덮어쓰기 전 기존 값에서 이어받는다.
        const keptCategorySources = buildCategorySourceIndex(state.assets);
        state.assets = imported
          .map((a) => carryOverPositionSource(a, keptSources))
          .map((a) => carryOverCategorySource(a, keptCategorySources))
          // categorySource 이월이 category까지 되돌린 뒤에 실행해야 identity(assetMergeKey)가
          // 기존 자산과 같은 값으로 계산된다 - id가 없는 구형 파일에서 이 순서가 중요하다.
          .map((a) => carryOverAbsentFields(a, keptCarryFields));
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
      category: a.category,
      // [V1.2-B BL-17] 빠지면 이 값이 사용자가 확정한 것인지 시스템 추천인지 복원 시 알 수 없게 된다
      // (positionSource와 같은 이유 - makeAsset() 주석 참고).
      categorySource: a.categorySource,
      name: a.name, isDomestic: a.isDomestic, currency: a.currency,
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

      // [P1 데이터 보존 - FIX-6] 이 가져오기 동작 전체가 공유하는 "복원 시각" - 핸들러에서 한 번만
      // 계산한다(applyRemoteState의 restoredAt과 같은 의미).
      const restoredAt = Date.now();
      // JSON 백업은 이미 완전한 자산 객체이므로 makeAsset()으로 재분류하지 않고 타입 안전성만 보정한다.
      const restored = parsed.assets.map(a => ({
        id: a.id || genId(),
        ticker: String(a.ticker ?? '').trim(),
        // [V1.1] 위와 같은 이유로 그대로 보존한다.
        owner: String(a.owner ?? '').trim(),
        accountType: a.accountType || '일반계좌',
        // [V1.2-B BL-17] 예전엔 빈 칸/누락을 무조건 '주식'으로 확정했다 - 이제 normalizeImportedAsset과
        // 완전히 같은 판단(resolveImportedCategory, js/01)을 쓴다. 두 복원 경로가 다르게 판단하면
        // "추가하기로는 확정이 살아남는데 덮어쓰기로는 사라지는"(또는 그 반대) 상태가 된다.
        ...resolveImportedCategory(a),
        // [V1.2-B BL-17] carryOverCategorySource 전용 임시 표식(엑셀 경로와 동일 규칙) - 이 파일의
        // category 필드 자체가 비어 있었는지를 남긴다. mergeAssetsForAppend가 소비 후 반드시 제거한다.
        categoryCellRaw: String(a.category ?? '').trim(),
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
        role: parseAssetRoleInput(a.role),
        // [V1.1 Phase 1 - BL-7a] 이 한 줄이 빠져 있었다. 백업 파일에는 positionSource가 정상적으로
        // 들어 있는데(buildSyncBlob) 여기서 읽지 않아 undefined가 되고, 그러면 아래 병합의
        // carryOverPositionSource가 "파일에 값이 없다"고 보고 로컬 기존 자산의 값으로 채워 넣었다.
        // 그 결과 파일이 manual인데 로컬이 ledger면 복원 후 ledger가 됐다 - 백업에 없던 표식이
        // 복원본에 붙는 셈이라, 다음 부팅에 거래원장이 수량을 덮어쓸 수 있었다(실측).
        // [덮어쓰기와 같은 규칙] normalizeImportedAsset과 똑같은 sanitizePositionSource를 쓴다 -
        // 두 복원 경로가 다르게 판단하면 "덮어쓰기로는 살아남는데 추가하기로는 뒤집히는" 상태가 된다.
        // 파일에 값이 없으면 예전 그대로 undefined로 두고, carryOverPositionSource의 legacy 규칙에
        // 맡긴다 - 여기서 거래 유무나 이름으로 추론해 채우지 않는다.
        positionSource: sanitizePositionSource(a.positionSource),
        // [P1 데이터 보존 - FIX-6] 이 줄이 없었다. 그래서 [추가하기]로 복원한 자산은 updatedAt이
        // undefined가 됐고, mergeAssetsForAppend가 기존 자산을 갱신할 때 그 자산이 갖고 있던
        // updatedAt까지 함께 지워버렸다. mergeCollectionById(js/12)는 값이 없으면 0으로 보므로,
        // 같은 세션에서 3초 뒤 자동 push가 도는 순간(persistAssets -> schedulePush) push 직전
        // 선병합에서 원격이 모든 공통 id를 이겨, 방금 복원한 값이 올라가기도 전에 폐기됐다.
        // "다음 부팅의 loadState 백필(js/01)이 채워줄 것"에 기대면 안 된다 - 그 백필은 push/pull
        // 보다 한참 뒤다. 덮어쓰기 복원이 쓰는 것과 같은 restoredAt 규칙을 여기에도 적용한다
        // (BL-15와 동일한 근거: 사용자가 [추가하기]를 실행한 것 자체가 실제 변경이다).
        updatedAt: restoredAt
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
        // [P1 데이터 보존 - J-4] 이 파일에 거래내역이 아예 없으면 applyRemoteState는 자산만 바꾸고
        // 기존 거래원장을 그대로 남긴다. 그게 맞는 처리다 - 거래내역 필드가 생기기 전(index.html
        // 시절)의 정상 백업에는 이 키 자체가 없었고, "파일이 모르는 데이터"를 복원이라는 이유로
        // 지워버리면 복구 경로가 없는 원장을 앱이 먼저 없애는 셈이 된다. 대신 자산만 되돌아갔다는
        // 사실을 조용히 넘기지 않고 결과 문구로 알린다(새 화면/검증 단계를 만들지 않는다).
        if (!Array.isArray(parsed.transactions)) {
          resultMsg += ' 이 파일에는 거래내역이 없어 자산만 되돌렸습니다 - 기존 거래내역은 그대로 남아 있습니다.';
        }
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
    // [V1.2-B BL-17] JSON append 경로(위 restored 매핑)와 완전히 같은 판단(resolveImportedCategory,
    // js/01)을 쓴다 - 예전엔 빈 칸/누락을 무조건 '주식'으로 확정했다.
    ...resolveImportedCategory(a),
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
    // [V1.1 Phase 1 - BL-15] 복원한 레코드의 updatedAt을 "지금"으로 찍는다.
    // 백업 파일에 적힌 시각은 정의상 항상 과거다. 그대로 복원하면 복원 직후 동기화에서
    // 원격이 무조건 더 최신이 되어, 방금 되돌린 값이 그대로 다시 뒤집혔다(실측 100 -> 70).
    // 게다가 이 함수는 아래에서 병합 기준선을 비우고 lastVersion을 0으로 되돌려 다음 pull이
    // 반드시 병합하게 만들므로, 그 되돌림이 사실상 확정적이었다.
    // [의미 왜곡이 아니다] updatedAt은 "이 레코드가 마지막으로 실제 변경된 시각"이고,
    // 사용자가 덮어쓰기를 실행한 것은 그 자체로 실제 변경이다. 배경 시세 갱신이 이 값을
    // 건드리지 않는 것과 같은 기준이다(persistAssets의 skipPush 주석 참고).
    // [추가하기와 같아진다] 추가하기 경로는 updatedAt을 읽지 않아 loadState가 Date.now()로
    // 백필해 왔고, 그래서 그쪽만 복원이 살아남았다 - 두 복원 경로의 결과를 일치시킨다.
    const restoredAt = Date.now();
    state.assets = (Array.isArray(parsed.assets) ? parsed.assets : []).map((a) => ({ ...normalizeImportedAsset(a), updatedAt: restoredAt }));
    state.dayChangeMap = {};
    state.prevCloseMap = {};
    state.sessionMap = {};
    state.priceFetchFailedIds = new Set();
    // [P1 데이터 보존 - J-1] stampAt을 넘겨 rebalance/projection도 자산·거래내역과 같은 복원 시각을
    // 갖게 한다. 예전엔 이 둘만 파일에 적힌 옛 시각을 그대로 이어받아서(skipStamp), 복원 직후 10초
    // 주기 pull이 "원격이 더 최신"이라고 판정해 방금 되돌린 목표비중/미래예측 설정만 원격 값으로
    // 되돌려놓았다 - 사용자 눈에는 [덮어쓰기] 한 번에 자산은 복원되고 목표비중만 잠시 뒤 되돌아가는,
    // 설명할 수 없는 동작이었다. BL-15가 자산/거래내역에 대해 이미 택한 것과 같은 규칙으로 통일한다.
    applyRemoteScalarFields(parsed, { stampAt: restoredAt });
    if (Array.isArray(parsed.transactions)) {
      // 거래내역도 같은 병합 규칙(mergeCollectionById)을 타므로 자산과 같은 이유로 함께 찍는다 -
      // 한쪽만 보호하면 복원이 절반만 살아남는다.
      state.transactions = parsed.transactions.map((t) => ({ ...normalizeImportedTransaction(t), updatedAt: restoredAt }));
      persistTransactions();
    }
    // [학습된 종목명 캐시] 복원은 "이 시점으로 되돌리기"라 다른 필드들과 마찬가지로 통째 교체한다.
    // [P1 데이터 보존 - FIX-7] 단, "파일에 키가 아예 없다"와 "파일이 빈 레지스트리를 담고 있다"는
    // 다르다. 예전엔 둘 다 {}로 처리해서, 이 키가 없던 시절의 백업이나 손으로 편집한 파일을
    // 복원하기만 해도 이 기기가 쌓아 온 캐시/역할 지정이 통째로 사라졌다. 키가 없으면 "그 파일이
    // 이 개념을 몰랐다"는 뜻이므로 기존 값을 그대로 둔다(MERGE_PRESERVE_IF_ABSENT와 같은 원칙).
    // 키가 있으면 빈 객체({})여도 "그 시점에 비어 있었다"는 사실이므로 예전 그대로 교체한다.
    if (hasOwn(parsed, 'learnedTickerNames')) {
      state.learnedTickerNames = (parsed.learnedTickerNames && typeof parsed.learnedTickerNames === 'object' && !Array.isArray(parsed.learnedTickerNames)) ? parsed.learnedTickerNames : {};
      persistLearnedTickerNames();
    }
    // [티커별 역할(포지션) 단일 소스] 동일한 이유로 통째 교체한다.
    if (hasOwn(parsed, 'tickerRoles')) {
      state.tickerRoles = (parsed.tickerRoles && typeof parsed.tickerRoles === 'object' && !Array.isArray(parsed.tickerRoles)) ? parsed.tickerRoles : {};
      persistTickerRoles();
    }
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
// [P1 데이터 보존 - J-1] opts.stampAt: JSON 백업 "덮어쓰기" 복원만 넘긴다(applyRemoteState). 채택한
// 값의 updatedAt을 파일에 적힌 옛 시각이 아니라 복원 시각으로 바꿔, 복원 직후 10초 주기 pull이
// "원격이 더 최신"이라고 판정해 방금 되돌린 설정만 다시 뒤집는 일을 막는다 - 자산/거래내역이 이미
// 쓰고 있는 BL-15와 같은 규칙이다. 클라우드 동기화(force:false) 경로는 이 값을 넘기지 않으므로
// 예전과 완전히 동일하게 원격의 updatedAt을 그대로 이어받는다.
function adoptRemoteRebalanceAndProjection(parsed, opts) {
  const force = !opts || opts.force !== false;
  const stampAt = (opts && Number(opts.stampAt)) || 0;
  const ts = (v) => Number(v) || 0;
  if (parsed.rebalance && typeof parsed.rebalance === 'object' && (force || ts(parsed.rebalance.updatedAt) > ts(state.rebalance.updatedAt))) {
    // [소유자별 독립 리밸런싱 목표 - Option B] loadState와 동일한 normalizeRebalanceState(js/01)로
    // 옛 단일 구조/새 owner-keyed 구조를 모두 안전하게 처리한다.
    state.rebalance = normalizeRebalanceState(parsed.rebalance);
    if (stampAt) state.rebalance.updatedAt = stampAt;
    persistRebalance(true); // skipStamp - 위에서 정한 updatedAt을 그대로 저장한다(여기서 다시 찍지 않음)
  }
  if (parsed.projection && typeof parsed.projection === 'object' && (force || ts(parsed.projection.updatedAt) > ts(state.projection.updatedAt))) {
    state.projection = {
      updatedAt: stampAt || ts(parsed.projection.updatedAt),
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
  // [P1 데이터 보존 - J-1] stampAt은 JSON 덮어쓰기 복원에서만 넘어온다(위 함수 주석 참고).
  adoptRemoteRebalanceAndProjection(parsed, { force: !gated, stampAt: opts && opts.stampAt });
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
// [V1.1 Phase 1 - BL-13/BL-16] "상대 레코드에 없는 값"이 "여기 있는 값"을 지우지 않게 한다.
// 이 병합은 레코드를 통째로 채택하므로, 상대가 이 필드를 아예 몰랐던 구버전 기기여도 그 레코드가
// 더 최신이기만 하면 이쪽의 값이 통째로 사라졌다 - 사용자가 직접 입력한 positionSource가 그렇게
// 사라지면 다음 부팅에 거래원장이 수량까지 덮어쓴다(실측).
//
// [왜 이 필드들만인가] 앱에 "이 값을 지운다"는 조작이 없는 필드만 담는다 - 그래야
// "값이 없다 = 그 버전이 몰랐다"가 참이 된다.
//   positionSource : 이 값을 undefined로 대입하는 코드가 저장소 전체에 0건이다.
//   buyRate        : 사용자가 비울 수 있는 입력칸이 없고, 거래원장 동기화가 USD일 때만 채울 뿐
//                    지우지 않는다. 값이 없으면 calcRow가 오늘 환율로 폴백해 원가가 왜곡된다.
// role과 rateMatchOverride는 일부러 제외했다 - 거래 수정 모드에서 칸을 비우면 그것이 그대로
// undefined로 저장되어(js/06) "사용자가 의도적으로 지움"을 뜻한다. 보호하면 지운 값이 되살아난다.
//
// [필드 단위 병합이 아니다] 승자를 고르는 규칙(updatedAt 최신승)은 그대로다. 양쪽에 값이
// 있으면 언제나 승자 값을 쓴다 - 원격이 이겼는데 원격에 그 값이 아예 없을 때만 로컬 값을 남긴다.
// [V1.2-B BL-17 - categorySource는 이 배열에 없다] category는 categorySource와 반드시 같은 논리적
// 쌍으로만 다뤄야 한다 - "categorySource='user'"는 "그 category 값을 사용자가 확인했다"는 뜻이라,
// 값과 표식이 서로 다른 레코드에서 오면 그 주장 자체가 거짓이 된다(positionSource는 "이 값을 자동
// 덮어쓰지 않는다"는 행동 보호 선언이라 어떤 값이 붙어도 의미가 안 깨지는 것과 다르다 - 실제로
// PM Cloud Sync Audit에서 "local user + remote legacy, remote 승" 상황을 실측 재현: 원격이 이겼는데
// 원격이 category를 몰랐다는 이유만으로 categorySource만 옮기면, 로컬이 확인한 적 없는 원격의
// category 값에 로컬의 'user' 표식이 붙었다 - "확인되지 않은 분류를 확인된 사실처럼 저장" 금지
// 정책 위반). 그래서 categorySource는 아래 mergeCollectionById 안에서 category와 함께(pair)만
// 이월하는 전용 규칙으로 처리하고, 이 배열에서는 뺀다.
const MERGE_PRESERVE_IF_ABSENT = ['positionSource', 'buyRate'];
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
      const remoteWins = toTs(r.updatedAt) > toTs(l.updatedAt);
      let picked = remoteWins ? r : l;
      if (remoteWins) {
        // [한 방향뿐이다] 원격이 이겼을 때 "여기 있던 값"이 사라지는 것만 막는다.
        // 반대로 로컬이 이겼는데 로컬에 값이 없는 경우는 채우지 않는다 - 표식이 없는 legacy 자산에
        // 원격의 옛 표식을 심으면 그것이 곧 legacy -> manual 자동 승격이 되어 정책 위반이다
        // (e2e/52 I/J가 그 동작을 고정하고 있다).
        MERGE_PRESERVE_IF_ABSENT.forEach((f) => {
          if (picked[f] === undefined && l[f] !== undefined) {
            if (picked === r) picked = { ...r }; // 원본 레코드를 변형하지 않는다
            picked[f] = l[f];
          }
        });
        // [V1.2-B BL-17 - category/categorySource 전용 pair 이월] 위 배열 방식과 똑같은 조건
        // (원격 승자가 이 개념 자체를 몰랐고, 로컬은 알고 있었다)이지만, categorySource 하나만
        // 옮기지 않고 category "값"까지 반드시 함께 옮긴다 - 그래야 이월된 표식이 실제로 그 값을
        // 가리키게 된다(PM Cloud Sync Audit Option A 확정).
        if (picked.categorySource === undefined && l.categorySource !== undefined) {
          if (picked === r) picked = { ...r };
          picked.category = l.category;
          picked.categorySource = l.categorySource;
        }
      }
      merged.push(picked);
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
  // [V1.2-B BL-18] asset/transaction을 여기까지는 각자 독립적으로 병합했다 - id별로 승자만 통째로
  // 고르는 mergeCollectionById 특성상, 두 기기가 같은 시점에서 갈라져 서로 다른 거래를 추가하면
  // "합쳐진 거래 전체 기준 포지션"과 "우연히 timestamp가 더 최신이었던 쪽 asset 레코드"가 서로 다른
  // 기기 것일 수 있다(실측 재현: A가 3주 매도해 7주, B가 5주 매수해 15주 - 병합된 거래 전체(10-3+5)의
  // 정답은 12인데 asset은 B의 15가 그대로 남는다). 거래내역이 바뀔 때 자산을 다시 맞추는 로직은 이미
  // 있다(syncAssetsFromTransactions, js/06) - 로컬에서 거래를 추가/수정/삭제할 때는 매번 이 함수가
  // 뒤따라 불려 정합성이 유지되는데, 유독 이 Cloud 병합 경로만 그 호출이 빠져 있었다.
  // [auto:true인 이유] 이 호출 시점에 이 기기 사용자는 방금 이 자산의 거래를 "직접" 건드리지 않았다 -
  // 부팅(js/14)과 똑같이 "사용자가 지금 아무것도 안 했는데 도는 배경 재계산"이므로, legacy 자산
  // (positionSource 없음)은 이 함수가 아니라 boot과 같은 조건으로 보호해야 한다(D-3) - 그래야 사용자가
  // legacy 자산의 수량을 자산관리 화면에서 직접 정정해 둔 값이 배우자 기기의 무관한 거래 동기화 한 번에
  // 조용히 되돌아가지 않는다. manual 자산은 auto 값과 무관하게 이 함수 자체가 항상 보호한다(BL-8).
  // category/categorySource는 이 함수가 건드리는 필드가 아니므로(js/06 참고) BL-17 pair 정책과
  // 무관하다. persistAssets()/persistTransactions()는 이 함수를 부르는 쪽(pullFromCloud/pushToCloud)이
  // applyingRemoteUpdate=true 구간 안에서 이어서 호출하므로, 여기서 갱신된 값도 같은 저장/1회 push에
  // 자연히 포함되고 별도의 재-push 루프를 만들지 않는다.
  syncAssetsFromTransactions({ auto: true });
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
/* -------------------------------------------------------------------------
 * [P1-1 - 이 기기 데이터 올리기] 업로드 payload에만 "지금" 시각을 찍는다.
 *
 * 왜 필요한가: Cloud를 이 기기 내용으로 덮어써도, 받는 기기의 병합이 그것을 되돌릴 수 있다.
 * mergeCollectionById는 같은 id를 updatedAt이 더 최신인 쪽으로 고르고(아래 :1058 근처),
 * rebalance/projection은 adoptRemoteRebalanceAndProjection이 필드 자체의 updatedAt을 비교한다.
 * 그래서 상대 기기가 그 레코드를 더 최근에 고쳐 뒀다면, 사용자가 "이 기기 기준"을 명시적으로
 * 골랐는데도 상대 값이 그대로 남고 다음 push에서 되돌아간다(실측 재현).
 *
 * 왜 payload만인가: state.assets/state.transactions/state.rebalance/state.projection을 실제로
 * 고치면 ① 업로드가 실패했을 때 로컬이 조용히 바뀐 채로 남고 ② 사용자가 실제로 편집한 시각
 * (누가 언제 고쳤는지)이 영구히 사라진다. encryptSyncBlob은 JSON.stringify만 하므로,
 * 복사본에 찍어 올리면 두 문제가 모두 생기지 않는다 - 실패해도 원복할 대상 자체가 없다.
 *
 * 찍는 것은 네 곳뿐이다(assets[].updatedAt / transactions[].updatedAt / rebalance.updatedAt /
 * projection.updatedAt). createdAt은 정렬 안정성의 기준이라 절대 건드리지 않고, positionSource·
 * categorySource·buyRate·rateMatchOverride·role 등 보존 대상 필드도 그대로 복사된다.
 * tickerRoles/learnedTickerNames/dailySnapshots는 timestamp가 없는 합집합 구조라(병합 쪽 주석
 * 참고) 여기서 다루지 않는다 - 덮어쓰기 개념 자체가 없다.
 *
 * 삭제는 이 함수와 무관하다 - "payload에 그 id가 없음 + 받는 기기의 기준선에 있었음"으로
 * 표현되므로(mergeCollectionById), 시각을 새로 찍어도 삭제 전파는 그대로 동작한다.
 * ---------------------------------------------------------------------- */
function stampPayload(blob, ts) {
  return {
    ...blob,
    assets: (blob.assets || []).map((a) => ({ ...a, updatedAt: ts })),
    transactions: (blob.transactions || []).map((t) => ({ ...t, updatedAt: ts })),
    rebalance: blob.rebalance ? { ...blob.rebalance, updatedAt: ts } : blob.rebalance,
    projection: blob.projection ? { ...blob.projection, updatedAt: ts } : blob.projection
  };
}

// opts.localWins: 사용자가 동기화 재개 화면에서 [이 기기 데이터 올리기]를 명시적으로 고른 경우에만
// true로 넘어온다(onSyncPasswordSaved 아래 핸들러 참고). 그때만 아래 "덮어쓰기 전 병합"을 건너뛰고
// 이 기기 상태를 그대로 올린다. 값을 넘기지 않는 기존 호출(schedulePush, 최초 업로드 버튼 등)은
// 예전과 완전히 같은 경로를 탄다 - 자동 동기화가 스스로 한쪽을 이기게 만들지 않는다.
async function pushToCloud(opts) {
  const localWins = !!(opts && opts.localWins);
  if (!syncState.enabled) return;
  // [실패 원자성] 성공 이후에만 바뀌어야 하는 값이다. 아래 선병합이 중간까지 진행된 뒤 POST가
  // 실패하는 경우에도 이 기기가 "원격을 이미 반영했다"고 잘못 기억하지 않도록 catch에서 되돌린다.
  const savedLastVersion = syncState.lastVersion;
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
      if (!localWins && remote.version && remote.version > syncState.lastVersion) {
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
    // [P1-1] localWins일 때만 업로드본에 "지금"을 찍는다 - state는 건드리지 않는다(stampPayload 주석).
    const blob = buildSyncBlob();
    const encrypted = await encryptSyncBlob(localWins ? stampPayload(blob, version) : blob, syncState.password);
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
    // [실패 원자성] 성공 경로에서만 갱신되는 값을 원래대로 돌려둔다 - 로컬 데이터(state/localStorage)는
    // 애초에 건드리지 않으므로 되돌릴 것이 없고, 여기서는 메모리상 진행 상태만 원복한다.
    syncState.lastVersion = savedLastVersion;
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
  // [P1-1] 지난번에 열어두고 닫은 방향 선택이 그대로 남아 있으면, 지금 클라우드 상태와 무관한
  // 선택지를 보여주게 된다 - 열 때마다 접어 두고 암호를 저장한 뒤에 다시 판단한다.
  document.getElementById('syncDirectionBox')?.classList.add('hidden');
  document.getElementById('syncSettingsModal').classList.remove('hidden');
  pushModalHistoryState();
}
function closeSyncSettingsModal(viaBackButton) {
  document.getElementById('syncSettingsModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
// [최초 페어링] 신랑님 폰(먼저 설정, 클라우드 비어있음) -> 슬롯 확인이 404 -> "이 기기 데이터 업로드"
// 버튼을 한 번 더 눌러 확인해야 push된다(자동으로 바로 push하지 않는다 - 아래 이유 참고). 와이프님
// 폰(나중에 설정, 클라우드에 이미 있음) -> 방향 선택을 보여주고 사용자가 직접 고른다.
// [오타 방지 - 자동 push하지 않는 이유] "클라우드에 데이터 없음(404)"은 (a) 정말 최초 기기이거나
// (b) 배우자와 다른 암호를 잘못 입력했을 때 똑같이 발생해서 구분이 안 된다 - 자동으로 바로 push하면
// 오타를 낸 사용자가 원래 있던 진짜 동기화 슬롯과 무관한 "유령" 슬롯을 조용히 만들고도 "동기화 시작됨"
// 이라는 성공 메시지를 보게 되어, 정작 배우자 기기와는 영영 연결되지 않는 조용한 실패로 이어진다.
//
/* -------------------------------------------------------------------------
 * [P1-1 데이터 보존 - 동기화 재개 시 방향을 묻는다]
 *
 * 예전에는 암호를 저장하면 곧장 pullFromCloud({fullAdopt:true})를 불렀다. fullAdopt는 병합이
 * 아니라 통째 교체라, 사용자가 동기화를 껐다 켜는 사이에 입력한 거래·자산이 한 번에 사라졌다
 * (실측: 거래 3건 추가 후 재개 -> 3건 전부 소멸, 자산 수량도 클라우드의 과거 값으로 회귀).
 * "동기화를 다시 켠다"와 "이 기기를 지우고 클라우드로 되돌린다"는 전혀 다른 뜻인데 코드가
 * 그 둘을 구분하지 않았다.
 *
 * 앱이 어느 쪽이 맞는지 추측하지 않는다 - 클라우드에 데이터가 있으면 사용자에게 직접 묻는다.
 * fullAdopt 자체는 그대로 둔다: 처음 연결하는 기기에는 샘플 자산이 들어 있어서, 병합으로 붙이면
 * 배우자의 실제 목록에 샘플이 섞인다(실측: 자산 1건이 되어야 할 상황에서 7건). 그 보호는
 * [클라우드 데이터 받기]를 고른 경우에 그대로 살아 있다.
 *
 * 슬롯 확인은 GET 한 번으로 끝내고 state에 아무것도 반영하지 않는다 - 404면 예전 그대로
 * 업로드 확인 흐름으로 가고(불필요한 선택을 묻지 않는다), 200이면 방향 선택을 보여준다.
 * ---------------------------------------------------------------------- */
async function onSyncPasswordSaved(password) {
  localStorage.setItem(LS_SYNC_PASSWORD, password);
  localStorage.setItem(LS_SYNC_ENABLED, '1');
  syncState.password = password;
  syncState.enabled = true;
  syncState.lastVersion = 0; // 비밀번호가 바뀌면 이전 버전 기록은 의미가 없으므로 초기화하고 다시 판정
  localStorage.setItem(LS_SYNC_LAST_VERSION, '0');
  document.getElementById('syncDecryptErrorBox')?.classList.add('hidden');
  document.getElementById('syncUploadConfirmBox')?.classList.add('hidden');
  document.getElementById('syncDirectionBox')?.classList.add('hidden');

  let probe;
  try {
    probe = await probeCloudSlot(password);
  } catch (e) {
    updateSyncStatusUI();
    showToast('네트워크 오류로 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    return;
  }
  updateSyncStatusUI();
  if (!probe.exists) {
    // 404 - 예전과 같은 업로드 확인 흐름. 방향 선택을 묻지 않는다.
    document.getElementById('syncUploadConfirmBox')?.classList.remove('hidden');
    return;
  }
  if (probe.decryptFailed) {
    // 암호가 달라 복호화가 안 되는 경우 - 예전과 같은 안내. 방향을 고르게 하지 않는다
    // (어느 쪽이 "내 데이터"인지 알 수 없는 상태에서 덮어쓰기를 제시하면 위험하다).
    showSyncDecryptFailure();
    updateSyncStatusUI();
    return;
  }
  renderSyncDirectionCounts(probe.counts);
  document.getElementById('syncDirectionBox')?.classList.remove('hidden');
}

/* [P1-1] 슬롯 존재 확인 전용 - state/localStorage에 아무것도 쓰지 않는다.
 * 기존 deriveKvKey/decryptSyncBlob/Worker API를 그대로 쓰고 새 엔드포인트를 만들지 않는다.
 * 복호화는 건수 안내를 위해서만 시도하고, 실패해도 슬롯 존재 사실은 그대로 반환한다. */
async function probeCloudSlot(password) {
  const kvKey = await deriveKvKey(password);
  const res = await fetch(`${SYNC_WORKER_URL}/?k=${encodeURIComponent(kvKey)}`);
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error('probe failed: ' + res.status);
  const remote = await res.json();
  if (!remote || !remote.version) return { exists: false };
  try {
    const parsed = await decryptSyncBlob(remote, password);
    return {
      exists: true,
      counts: {
        remoteAssets: Array.isArray(parsed.assets) ? parsed.assets.length : null,
        remoteTx: Array.isArray(parsed.transactions) ? parsed.transactions.length : null
      }
    };
  } catch (e) {
    return { exists: true, decryptFailed: true };
  }
}

/* [P1-1] 방향 선택 화면의 건수 안내 - 새 기기(샘플 자산만 있는 상태)에서 실수로 [이 기기 데이터
 * 올리기]를 누르는 것을 막는 가장 단순한 장치다. 건수를 알 수 없으면 추측하지 않고 비워 둔다. */
function renderSyncDirectionCounts(counts) {
  const localEl = document.getElementById('syncDirectionLocalCounts');
  const remoteEl = document.getElementById('syncDirectionRemoteCounts');
  if (localEl) localEl.textContent = `이 기기: 자산 ${fmtNum(state.assets.length)}건 · 거래 ${fmtNum(state.transactions.length)}건`;
  if (remoteEl) {
    const known = counts && Number.isFinite(counts.remoteAssets) && Number.isFinite(counts.remoteTx);
    remoteEl.textContent = known
      ? `클라우드: 자산 ${fmtNum(counts.remoteAssets)}건 · 거래 ${fmtNum(counts.remoteTx)}건`
      : '클라우드: 건수를 확인하지 못했습니다';
  }
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
    // [빈 슬롯] 선병합할 원격 데이터가 없으므로 localWins가 필요 없다 - 예전 호출 그대로 둔다.
    await pushToCloud();
    document.getElementById('syncUploadConfirmBox')?.classList.add('hidden');
    updateSyncStatusUI();
    showToast('이 기기의 데이터를 클라우드에 업로드했습니다.', 'success');
    closeSyncSettingsModal(); // [자동 닫기] 업로드가 실제로 성공했을 때만 닫는다
  } catch (e) {
    showToast('네트워크 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
  }
});
// [P1-1 - 클라우드 데이터 받기] 예전에 암호 저장 직후 자동으로 돌던 그 호출을 그대로 쓴다 -
// pullFromCloud와 fullAdopt의 의미는 한 줄도 바꾸지 않았고, 실행 시점만 "사용자가 골랐을 때"로 옮겼다.
document.getElementById('syncDirectionPullBtn').addEventListener('click', async () => {
  document.getElementById('syncDirectionBox')?.classList.add('hidden');
  const result = await pullFromCloud({ fullAdopt: true });
  updateSyncStatusUI();
  if (result === 'applied') {
    showToast('클라우드 데이터를 이 기기에 반영했습니다.', 'success');
    closeSyncSettingsModal();
  } else if (result === 'not_found') {
    document.getElementById('syncUploadConfirmBox')?.classList.remove('hidden');
  } else if (result === 'decrypt_failed') {
    showToast('비밀번호가 올바르지 않습니다.', 'error');
  } else if (result === 'error') {
    document.getElementById('syncDirectionBox')?.classList.remove('hidden'); // 재시도할 수 있게 되돌린다
    showToast('네트워크 오류로 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
  } else {
    // 'up_to_date' - 받아올 새 내용이 없었다(이 기기가 이미 그 버전을 본 적이 있는 경우).
    showToast('클라우드에 새로 받아올 내용이 없습니다.', 'info');
    closeSyncSettingsModal();
  }
});
// [P1-1 - 이 기기 데이터 올리기] 되돌릴 수 없는 동작이라 한 번 더 확인을 받는다(거래 삭제와 같은 방식).
// 문구는 실제 반영 범위와 정확히 일치시킨다 - tickerRoles/학습된 종목명/일별 손익 이력은 합집합
// 구조라 덮이지 않고, 상대 기기가 아직 올리지 않은 입력도 지워지지 않는다. 그래서 "모든 데이터"나
// "완전히 덮어쓰기" 같은 표현을 쓰지 않는다.
document.getElementById('syncDirectionPushBtn').addEventListener('click', async () => {
  const ok = confirm(
    '이 기기 데이터를 클라우드에 올릴까요?\n\n'
    + '이 기기의 자산, 거래내역, 목표비중, 미래예측 설정을 클라우드에 올립니다.\n'
    + '클라우드와 다른 기기의 내용이 이 기기 기준으로 바뀔 수 있습니다.\n'
    + '다른 기기에서 아직 동기화하지 않은 입력이 있으면 그 내용은 지워지지 않고 합쳐집니다.\n\n'
    + '먼저 JSON 백업을 권장합니다.'
  );
  if (!ok) return; // 취소 - 네트워크 요청 자체를 하지 않는다
  try {
    await pushToCloud({ localWins: true });
    document.getElementById('syncDirectionBox')?.classList.add('hidden');
    updateSyncStatusUI();
    showToast('이 기기 데이터를 클라우드에 올렸습니다.', 'success');
    closeSyncSettingsModal();
  } catch (e) {
    // 실패해도 로컬 데이터는 그대로다(payload에만 시각을 찍으므로 state를 건드리지 않는다) -
    // 선택 화면을 닫지 않고 그대로 두어 바로 다시 시도할 수 있게 한다.
    showToast('클라우드에 올리지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.', 'error');
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
// [V1.2-B BL-17] carryOverCategorySource/buildCategorySourceIndex/mergeAssetsForAppend도 같은 이유로 노출한다.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeCollectionById, carryOverCategorySource, buildCategorySourceIndex, mergeAssetsForAppend,
    // [P1 데이터 보존 - FIX-4/FIX-5] 같은 이유로 노출한다(순수 함수라 단위 테스트로 검증 가능).
    buildCarryIfAbsentIndex, carryOverAbsentFields,
    // [P1-1] 업로드 payload 스탬프도 순수 함수라 같은 방식으로 검증한다.
    stampPayload };
}

