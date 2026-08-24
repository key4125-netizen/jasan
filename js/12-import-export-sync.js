/* -------------------------------------------------------------------------
 * 21. 엑셀 내보내기 (전체 백업 - 파생 필드 포함)
 * ---------------------------------------------------------------------- */
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  const rows = state.assets.map(a => {
    const r = calcRow(a);
    return {
      'ticker': a.ticker || '', '소유자': a.owner, '계좌구분': a.accountType, '종목명': a.name,
      '국내/해외': a.isDomestic, '통화': a.currency, '수량': a.quantity, '매수단가': a.buyPrice,
      '자산군(자동분류)': a.category, '현재가': a.currentPrice,
      '매입금액(자산통화, 자동계산)': Math.round(r.buyAmountOriginal * 100) / 100,
      '매입금액(KRW환산)': Math.round(r.buyAmount), '평가금액(KRW)': Math.round(r.curAmount),
      '평가손익(KRW)': Math.round(r.profit), '수익률(%)': Math.round(r.rateOfReturn * 100) / 100
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '자산목록');
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
function assetMergeKey(a) {
  const ticker = String(a.ticker ?? '').trim();
  return ticker
    ? `${a.owner}|${a.accountType}|${ticker.toUpperCase()}`
    : `${a.owner}|${a.accountType}|${a.category}|${a.name}`;
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
    merged[idx] = { ...incoming, id: merged[idx].id }; // 값은 전부 최신 파일 기준, id만 기존 것 유지
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

      const imported = json.map(row => makeAsset({
        ticker: pick(row, 'ticker', 'Ticker', 'TICKER'),
        owner: pick(row, '소유자'),
        accountType: pick(row, '계좌구분'),
        name: pick(row, '종목명'),
        isDomestic: pick(row, '국내/해외', '국내해외', '국내외'),
        currency: pick(row, '통화', 'Currency', 'CURRENCY'),
        quantity: pick(row, '수량'),
        buyPrice: pick(row, '매수단가'),
        // 선택 입력: 값이 있으면 makeAsset이 그대로 현재가로 채택하고, 비어 있으면 매수단가로 초기화한다.
        currentPrice: pick(row, '현재가')
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
        state.assets = imported;
        state.dayChangeMap = {};
        state.prevCloseMap = {};
        state.sessionMap = {};
        resultMsg = `엑셀 데이터 ${imported.length}건을 불러왔습니다.`;
      }
      persistAssets();
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
      alert(`${resultMsg} (자산군/국내해외 자동판별 + 매입금액 자동계산 완료)`);
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
      updatedAt: a.updatedAt
    })),
    transactions: state.transactions,
    // [버그 수정] dailySnapshots는 위 주석(state 선언부)에 "JSON 백업에 저장됨"이라 적혀 있었지만 실제로는
    // 빠져 있었다 - 이 필드가 없으면 새 기기에서 복원해도 일별손익/총평가금액/누적평가손익 추이 차트의
    // 과거 히스토리가 전부 사라진다(복원 이후 날짜부터 새로 쌓이기 시작).
    dailySnapshots: state.dailySnapshots
  };
}

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const backup = buildSyncBlob();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `자산관리_백업_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('JSON 백업 파일을 다운로드했습니다.', 'success');
});

document.getElementById('importJsonBtn').addEventListener('click', () => document.getElementById('jsonFileInput').click());

// JSON 백업의 거래 객체를 타입 안전하게 보정한다 - 덮어쓰기/추가하기 두 경로가 공유한다.
function normalizeImportedTransaction(t) {
  return {
    id: t.id || genId(),
    date: t.date || todayDateStr(),
    owner: t.owner || '공동',
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
        owner: a.owner || '공동',
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
        buyRate: typeof a.buyRate === 'number' ? a.buyRate : undefined
      }));

      if (restored.length === 0) { alert('복원할 자산 데이터가 없습니다.'); return; }
      const choice = await openImportChoiceModal(`${restored.length}건을 복원합니다.\n기존 데이터를 덮어쓸까요, 추가할까요?`);
      if (choice === 'cancel') return; // 복원 자체를 취소 - 아무 것도 바뀌지 않는다.
      let resultMsg;
      if (choice === 'append') {
        // [추가하기 - 자산] 중복 종목(소유자+계좌구분+티커 동일)은 새 행을 만들지 않고, 불러온 파일의
        // 최신 값으로 덮어써 갱신한다(mergeAssetsForAppend 참고 - 수량을 더하지 않는다).
        const { assets, newCount, updatedCount } = mergeAssetsForAppend(state.assets, restored);
        state.assets = assets;
        resultMsg = `신규 ${newCount}개 추가, 기존 ${updatedCount}개 최신 수량으로 업데이트됨`;
        // [추가하기 - 거래내역] 예전엔 append 모드에서 거래내역이 통째로 무시돼, 방금 합쳐진 자산
        // 수량의 근거가 되는 매수 기록이 [거래내역] 탭/기간별 실현손익에 전혀 안 남는 문제가 있었다.
        // 이제 기존 거래내역 뒤에 이어 붙이되, 같은 id(예: 같은 백업을 실수로 두 번 불러온 경우)를
        // 가진 거래는 다시 추가하지 않아 이중 계상을 막는다 - 설정(rebalance/projection/환율/일별
        // 스냅샷)은 "추가"라는 의도에 맞게 건드리지 않는다(덮어쓰기에서만 갱신).
        if (Array.isArray(parsed.transactions)) {
          const incomingTx = parsed.transactions.map(normalizeImportedTransaction);
          const existingIds = new Set(state.transactions.map((t) => t.id));
          state.transactions = state.transactions.concat(incomingTx.filter((t) => !existingIds.has(t.id)));
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
// 버튼(동기화중/동기화중지/동기화오류)이 이 값을 읽는다. 비밀번호가 틀려 복호화가 실패한 경우는
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
    owner: a.owner || '공동',
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
    // [가족 동기화 - 스마트 머지] mergeCollectionById() 참고 - 없으면 지금 시각으로 폴백(오래된 백업 등).
    updatedAt: a.updatedAt || Date.now()
  };
}

// [JSON 백업/파일 복원 전용 - "덮어쓰기"] 자산/거래내역을 원격(파일) 데이터로 완전히 교체한다 - 백업
// 복원은 "이 시점으로 되돌리기"가 목적이므로 병합이 아니라 통째 교체가 맞는 동작이다. 클라우드 동기화
// (pullFromCloud/pushToCloud)는 이 함수를 쓰지 않고 mergeAssetsAndTransactionsWithRemote()로 병합한다
// - 부부가 비슷한 시간에 각자 입력한 데이터가 한쪽 push/pull로 통째 덮어써져 사라지는 걸 막기 위함.
async function applyRemoteState(parsed) {
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
  persistAssets();
  renderAll();
  backfillAllHoldingsDailyPnlHistory();
  refreshPricesAndRates();
}

// [가족 동기화 + JSON 백업 복원 공용] 환율/일간변동률/리밸런싱 목표/자산예측 설정/일별 스냅샷처럼
// "배열이 아닌" 설정값들을 원격 데이터에서 반영한다 - 자산/거래내역(배열)은 호출부가 각자 다르게
// 처리한다(applyRemoteState는 통째 교체, mergeAssetsAndTransactionsWithRemote는 병합). 요청 범위가
// 자산/거래내역 병합으로 명시돼 있어 이 스칼라 설정값들은 지금처럼 "원격이 더 최신이면 그대로 채택"
// 방식을 유지한다(호출부에서 이미 remote.version > lastVersion을 확인한 뒤에만 호출됨).
function applyRemoteScalarFields(parsed) {
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
  if (parsed.rebalance && typeof parsed.rebalance === 'object') {
    const tg = parsed.rebalance.targets;
    const defaults = cloneDefaultRebalanceTargets();
    state.rebalance = {
      domestic: parsed.rebalance.domestic || { '국내': 40, '해외': 60 },
      targets: (tg && typeof tg === 'object')
        ? { '국내': ensureSelectedStocksField(stripCustomRebalanceTargets(Array.isArray(tg['국내']) ? tg['국내'] : defaults['국내'])), '해외': ensureSelectedStocksField(stripCustomRebalanceTargets(ensureForeignCategoryCatchalls(Array.isArray(tg['해외']) ? tg['해외'] : defaults['해외']))) }
        : defaults
    };
    persistRebalance();
  }
  if (parsed.projection && typeof parsed.projection === 'object') {
    state.projection = {
      monthlyContribution: num(parsed.projection.monthlyContribution),
      categoryReturns: parsed.projection.categoryReturns || {},
      inflationRate: (parsed.projection.inflationRate !== undefined && parsed.projection.inflationRate !== null && parsed.projection.inflationRate !== '') ? num(parsed.projection.inflationRate) : 2.5,
      customScenarioRates: parsed.projection.customScenarioRates || {}
    };
    persistProjection();
  }
  if (parsed.dailySnapshots && typeof parsed.dailySnapshots === 'object' && !Array.isArray(parsed.dailySnapshots)) {
    state.dailySnapshots = parsed.dailySnapshots;
    persistDailySnapshots();
    // [버그 수정 - 복원 후 일별 손익 이중 합산] backfillAllHoldingsDailyPnlHistory()는 "아직 소급 채움을
    // 안 해본 자산"만 골라 dailySnapshots에 += 로 더한다 - 방금 완성된 과거 이력을 통째로 반영했으므로
    // 이 자산들을 "안 채움"으로 두면 같은 값이 중복 합산된다. 반영된 자산 id를 전부 "이미 채워짐"으로
    // 미리 표시해 이중 합산을 막는다.
    const doneIds = getBackfillDoneIds();
    state.assets.forEach((a) => doneIds.add(a.id));
    localStorage.setItem(LS_DAILY_BACKFILL_DONE_IDS, JSON.stringify(Array.from(doneIds)));
  }
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
function mergeAssetsAndTransactionsWithRemote(parsed) {
  const remoteAssets = (Array.isArray(parsed.assets) ? parsed.assets : []).map(normalizeImportedAsset);
  const remoteTx = (Array.isArray(parsed.transactions) ? parsed.transactions : []).map(normalizeImportedTransaction);
  state.assets = mergeCollectionById(state.assets, remoteAssets, getMergeBaseline(LS_SYNC_MERGED_ASSET_IDS));
  state.transactions = mergeCollectionById(state.transactions, remoteTx, getMergeBaseline(LS_SYNC_MERGED_TX_IDS));
  localStorage.setItem(LS_SYNC_MERGED_ASSET_IDS, JSON.stringify(state.assets.map((a) => a.id)));
  localStorage.setItem(LS_SYNC_MERGED_TX_IDS, JSON.stringify(state.transactions.map((t) => t.id)));
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
      } else {
        // [스마트 머지] 통째 덮어쓰기 대신 자산/거래내역은 id+updatedAt 기준으로 병합한다.
        mergeAssetsAndTransactionsWithRemote(parsed);
      }
      // 나머지 설정값(환율/리밸런싱/자산예측 등)은 두 경로 모두 기존처럼 원격 값을 그대로 채택한다
      // (이미 위에서 remote.version > lastVersion을 확인한 뒤라 원격이 더 최신).
      applyRemoteScalarFields(parsed);
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
const SYNC_COLOR_ACTIVE = ['bg-brand-50', 'dark:bg-brand-950/40', 'border-brand-200', 'dark:border-brand-800', 'text-brand-600', 'dark:text-brand-400'];
const SYNC_COLOR_INACTIVE = ['bg-white', 'dark:bg-slate-900', 'border-slate-200', 'dark:border-slate-800', 'text-slate-400', 'dark:text-slate-500'];
const SYNC_COLOR_ERROR = ['bg-red-50', 'dark:bg-red-950/40', 'border-red-200', 'dark:border-red-800', 'text-red-600', 'dark:text-red-400'];
const SYNC_ALL_COLOR_CLASSES = [...SYNC_COLOR_ACTIVE, ...SYNC_COLOR_INACTIVE, ...SYNC_COLOR_ERROR];
function updateSyncStatusUI() {
  const toggleBtn = document.getElementById('syncSettingsBtn');
  if (toggleBtn) {
    toggleBtn.classList.remove(...SYNC_ALL_COLOR_CLASSES);
    if (!syncState.enabled) {
      toggleBtn.textContent = '동기화중지';
      toggleBtn.classList.add(...SYNC_COLOR_INACTIVE);
    } else if (syncState.hasError) {
      toggleBtn.textContent = '동기화오류';
      toggleBtn.classList.add(...SYNC_COLOR_ERROR);
    } else {
      toggleBtn.textContent = '동기화중';
      toggleBtn.classList.add(...SYNC_COLOR_ACTIVE);
    }
  }
  // [모달 안 상태 배지] 암호 입력란보다 위에서 크게 보여준다(요청에 따라 위치 이동) - 헤더 버튼과
  // 같은 3색 규칙 + 마지막 동기화 시각까지 함께 표기한다.
  const statusEl = document.getElementById('syncStatusText');
  if (statusEl) {
    statusEl.classList.remove(...SYNC_ALL_COLOR_CLASSES);
    if (!syncState.enabled) {
      statusEl.textContent = '동기화중지';
      statusEl.classList.add(...SYNC_COLOR_INACTIVE);
    } else if (syncState.hasError) {
      statusEl.textContent = '동기화오류 · 네트워크 연결을 확인해주세요';
      statusEl.classList.add(...SYNC_COLOR_ERROR);
    } else {
      const lastAt = localStorage.getItem(LS_SYNC_LAST_SYNCED_AT);
      statusEl.textContent = lastAt ? `동기화중 · 마지막 동기화 ${new Date(lastAt).toLocaleString('ko-KR')}` : '동기화중 · 동기화 대기 중...';
      statusEl.classList.add(...SYNC_COLOR_ACTIVE);
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

