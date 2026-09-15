/* -------------------------------------------------------------------------
 * 28. [P1-1 동기화 차이 확인] 이 기기 데이터와 클라우드 데이터의 "의미 있는 차이"를 계산한다 - 순수 함수
 *    - 자동 동기화가 받은 클라우드 데이터를 이 기기에 반영하기 직전에 부른다(js/12 pull 병합 · push 선병합).
 *      차이가 있으면 반영하지 않고 사용자에게 보여 준 뒤 [클라우드 데이터 받기] / [이 기기 데이터 올리기] / [취소]
 *      중 하나를 직접 고르게 한다. 동기화 재개 화면(방향 선택)도 같은 결과로 차이를 보여 준다.
 *    - 비교 대상은 동기화가 실제로 옮기는 사용자 데이터뿐이다: 자산(id별 사용자 입력 · 보유 필드), 거래내역(id별),
 *      목표비중(rebalance), 미래예측 설정(projection). 받는 쪽 정규화(normalizeImportedAsset · normalizeImportedTransaction ·
 *      adoptRemoteRebalanceAndProjection, js/12)와 같은 규칙으로 값을 맞춘 뒤 비교한다 - 동기화하면 같아지는 표기 차이는
 *      차이로 보지 않는다.
 *    - 차이로 보지 않는 것: updatedAt · createdAt · version · 배열 순서 · 직렬화(키) 순서 · 현재가 · regularMarketPrice ·
 *      환율 · 일간변동률 · 합집합 3종(tickerRoles · learnedTickerNames · dailySnapshots).
 *    - 입력 객체를 바꾸지 않는다(화면 표시용 값은 새로 만든 복사본). localStorage · 네트워크 · 화면을 쓰지 않는다.
 *    - js/12보다 먼저 로드한다(index.html) - 부팅 직후 첫 동기화가 이 함수를 부를 수 있다.
 * ---------------------------------------------------------------------- */

// 자산에서 비교하는 필드(화면 표시 순서). 현재가 · regularMarketPrice · 당일 시가/고가/저가 · updatedAt은 넣지 않는다.
const SYNC_DIFF_ASSET_FIELDS = Object.freeze([
  'name', 'ticker', 'owner', 'accountType', 'category', 'categorySource', 'isDomestic', 'currency',
  'quantity', 'buyPrice', 'buyRate', 'rateMatchOverride', 'role', 'positionSource'
]);
// 거래내역에서 비교하는 필드(화면 표시 순서) - normalizeImportedTransaction(js/12)이 받는 필드에서 createdAt · updatedAt만 뺐다.
const SYNC_DIFF_TX_FIELDS = Object.freeze([
  'date', 'name', 'ticker', 'owner', 'accountType', 'type', 'quantity', 'price', 'currency', 'appliedRate', 'fee', 'origin'
]);
const SYNC_DIFF_FIELD_LABELS = Object.freeze({
  name: '종목명', ticker: '티커', owner: '보유자', accountType: '계좌', category: '자산군', categorySource: '자산군 확정',
  isDomestic: '국내/해외', currency: '통화', quantity: '수량', buyPrice: '매입단가', buyRate: '매입 환율',
  rateMatchOverride: '수익률 기준(대표매칭)', role: '역할(포지션)', positionSource: '수량 관리',
  date: '거래일', type: '거래 구분', price: '거래 단가', appliedRate: '적용 환율', fee: '수수료', origin: '구분'
});

function isSyncRecordWithId(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  return (typeof x.id === 'string' && x.id.trim() !== '') || (typeof x.id === 'number' && Number.isFinite(x.id));
}

// [malformed payload 방어] 복호화는 됐지만 동기화 데이터의 모양이 아닌 경우. 예전 병합은 배열이 아니면 빈 배열로 보고
// 병합해, 이 기기의 기존 자산 · 거래가 "상대가 지웠다"로 판정되어 사라질 수 있었다. 이 검사를 통과하지 못하면
// 차이 계산 · 병합 · 통째 받기 어느 쪽으로도 넘기지 않는다.
function validateSyncPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'notObject' };
  if (!Array.isArray(parsed.assets)) return { ok: false, reason: 'assetsNotArray' };
  if (!Array.isArray(parsed.transactions)) return { ok: false, reason: 'transactionsNotArray' };
  if (!parsed.assets.every(isSyncRecordWithId)) return { ok: false, reason: 'assetWithoutId' };
  if (!parsed.transactions.every(isSyncRecordWithId)) return { ok: false, reason: 'transactionWithoutId' };
  for (const key of ['rebalance', 'projection']) {
    const v = parsed[key];
    if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) return { ok: false, reason: key + 'NotObject' };
  }
  return { ok: true, reason: null };
}

// normalizeImportedAsset(js/12)과 같은 규칙으로 비교 · 표시용 값을 만든다(값이 없으면 null).
function syncDiffAssetView(a) {
  const { category, categorySource } = resolveImportedCategory(a);
  return {
    id: String(a.id),
    name: a.name || '이름없음',
    ticker: String(a.ticker ?? '').trim(),
    owner: String(a.owner ?? '').trim(),
    accountType: a.accountType || '일반계좌',
    category,
    categorySource: categorySource ?? null,
    isDomestic: a.isDomestic === '해외' ? '해외' : '국내',
    currency: a.currency === 'USD' ? 'USD' : 'KRW',
    quantity: num(a.quantity),
    buyPrice: num(a.buyPrice),
    buyRate: typeof a.buyRate === 'number' ? a.buyRate : null,
    rateMatchOverride: sanitizeRateMatchOverride(a.rateMatchOverride) ?? null,
    role: parseAssetRoleInput(a.role) ?? null,
    positionSource: sanitizePositionSource(a.positionSource) ?? null
  };
}

// normalizeImportedTransaction(js/12)과 같은 규칙.
function syncDiffTransactionView(t) {
  const currency = t.currency === 'USD' ? 'USD' : 'KRW';
  const rate = num(t.appliedRate);
  return {
    id: String(t.id),
    date: t.date ? String(t.date) : '',
    name: t.name || '이름없음',
    ticker: String(t.ticker ?? '').trim(),
    owner: String(t.owner ?? '').trim(),
    accountType: t.accountType || '일반계좌',
    type: t.type === 'sell' ? 'sell' : 'buy',
    quantity: num(t.quantity),
    price: num(t.price),
    currency,
    appliedRate: currency === 'USD' && Number.isFinite(rate) && rate > 0 ? rate : null,
    fee: num(t.fee),
    origin: t.origin === 'initial' ? 'initial' : 'period'
  };
}

// 숫자는 부동소수점 반올림 오차만큼은 같은 값으로 본다(같은 거래를 다시 계산한 수량 · 평균단가).
function syncDiffSameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return String(a) === String(b);
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a === b;
}

// 객체 키 순서를 정렬한 JSON - 직렬화 순서 차이를 차이로 보지 않는다(배열 순서는 설정 값 자체라 유지한다).
function syncDiffStableJson(value) {
  return JSON.stringify(value, (key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((o, k) => { o[k] = v[k]; return o; }, {});
    }
    return v;
  });
}

// 같은 id끼리 짝을 지어 이 기기에만 · 클라우드에만 · 내용이 다름으로 나눈다. 같은 id가 여러 번 있으면
// mergeCollectionById(Map)와 같이 마지막 것을 쓴다.
function syncDiffCollection(localArr, cloudArr, toView, fields) {
  const localById = new Map();
  (Array.isArray(localArr) ? localArr : []).filter(isSyncRecordWithId).forEach((x) => { const v = toView(x); localById.set(v.id, v); });
  const cloudById = new Map();
  (Array.isArray(cloudArr) ? cloudArr : []).filter(isSyncRecordWithId).forEach((x) => { const v = toView(x); cloudById.set(v.id, v); });
  const localOnly = [], different = [];
  localById.forEach((l, id) => {
    const c = cloudById.get(id);
    if (!c) { localOnly.push(l); return; }
    const changed = fields.filter((f) => !syncDiffSameValue(l[f], c[f])).map((f) => ({ field: f, local: l[f], cloud: c[f] }));
    if (changed.length) different.push({ id, local: l, cloud: c, fields: changed });
  });
  const cloudOnly = [];
  cloudById.forEach((c, id) => { if (!localById.has(id)) cloudOnly.push(c); });
  return { localOnly, cloudOnly, different };
}

function syncDiffRebalanceKey(r) {
  const { updatedAt, ...rest } = normalizeRebalanceState(r);
  return syncDiffStableJson(rest);
}

// adoptRemoteRebalanceAndProjection(js/12)이 실제로 옮기는 설정만 비교한다. cmaRecommendationStatus는 추천 배지를
// 봤는지 기록하는 화면 상태라 계산에 영향이 없어 넣지 않는다.
// [v246 · PMD-12] instrumentReturnKeys: 필드가 없으면 받아도 이 기기 값이 유지되므로(adopt의 hasOwn 규칙) fallbackInstrumentKeys로 비교한다.
function syncDiffProjectionKey(p, fallbackInstrumentKeys) {
  const optNum = (v, d) => ((v !== undefined && v !== null && v !== '') ? num(v) : d);
  return syncDiffStableJson({
    monthlyContribution: num(p.monthlyContribution),
    categoryReturns: p.categoryReturns || {},
    inflationRate: optNum(p.inflationRate, 2.5),
    contributionGrowthRate: optNum(p.contributionGrowthRate, 0),
    customScenarioRates: p.customScenarioRates || {},
    customFeeRates: p.customFeeRates || {},
    instrumentReturnKeys: Object.prototype.hasOwnProperty.call(p, 'instrumentReturnKeys')
      ? sanitizeInstrumentReturnKeys(p.instrumentReturnKeys) : sanitizeInstrumentReturnKeys(fallbackInstrumentKeys),
    taxAdvantagedPlan: normalizeTaxAdvantagedPlan(p.taxAdvantagedPlan),
    monthlyContributionAllocation: normalizeMonthlyContributionAllocation(p.monthlyContributionAllocation),
    monthlyContributionByOwner: normalizeMonthlyContributionByOwner(p.monthlyContributionByOwner)
  });
}

function isSyncPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

// localData: { assets, transactions, rebalance, projection } (이 기기 state)
// cloudData: 복호화한 클라우드 데이터(validateSyncPayload를 먼저 통과해야 한다)
function compareSyncData(localData, cloudData) {
  const local = localData || {};
  const cloud = cloudData || {};
  const assets = syncDiffCollection(local.assets, cloud.assets, syncDiffAssetView, SYNC_DIFF_ASSET_FIELDS);
  const transactions = syncDiffCollection(local.transactions, cloud.transactions, syncDiffTransactionView, SYNC_DIFF_TX_FIELDS);
  // 클라우드에 설정 자체가 없으면 받아도 이 기기 설정이 바뀌지 않으므로 차이로 보지 않는다.
  const rebalanceChanged = isSyncPlainObject(local.rebalance) && isSyncPlainObject(cloud.rebalance)
    && syncDiffRebalanceKey(local.rebalance) !== syncDiffRebalanceKey(cloud.rebalance);
  const projectionChanged = isSyncPlainObject(local.projection) && isSyncPlainObject(cloud.projection)
    && syncDiffProjectionKey(local.projection) !== syncDiffProjectionKey(cloud.projection, local.projection.instrumentReturnKeys);
  const size = (g) => g.localOnly.length + g.cloudOnly.length + g.different.length;
  return {
    assets,
    transactions,
    rebalance: { changed: rebalanceChanged },
    projection: { changed: projectionChanged },
    hasMeaningfulDifference: size(assets) + size(transactions) > 0 || rebalanceChanged || projectionChanged
  };
}

// 같은 차이를 [취소]한 뒤 10초 주기 동기화가 똑같은 확인 화면을 다시 띄우지 않게 비교하는 값(메모리에서만 쓴다).
function syncDiffSignature(diff) {
  const byId = (x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  const group = (g) => ({
    l: g.localOnly.map((v) => v.id).sort(),
    c: g.cloudOnly.map((v) => v.id).sort(),
    d: g.different.map((d) => [d.id, d.fields.map((f) => [f.field, f.local, f.cloud])]).sort(byId)
  });
  return JSON.stringify({ a: group(diff.assets), t: group(diff.transactions), r: !!diff.rebalance.changed, p: !!diff.projection.changed });
}

/* ---- 화면 문구(초보자용 · 개발 용어를 쓰지 않는다) ---- */

function syncDiffQuantityUnit(view) {
  return view && (view.category === '주식' || view.category === 'ETF') ? '주' : '';
}

function syncDiffValueText(field, value, view) {
  if (value === null || value === undefined || value === '') return '없음';
  switch (field) {
    case 'quantity': return `${fmtNum(value, 4)}${syncDiffQuantityUnit(view)}`;
    case 'buyPrice':
    case 'price': return `${fmtNum(value, 4)}${view && view.currency === 'USD' ? '달러' : '원'}`;
    case 'buyRate':
    case 'appliedRate': return `${fmtNum(value, 2)}원`;
    case 'fee': return fmtNum(value, 4);
    case 'categorySource': return value === 'user' ? '직접 확정' : value === 'system' ? '자동 분류' : String(value);
    case 'positionSource': return value === 'ledger' ? '거래내역 기준' : value === 'manual' ? '직접 입력' : String(value);
    case 'role': return ASSET_ROLE_LABELS[value] || String(value);
    case 'type': return value === 'sell' ? '매도' : '매수';
    case 'origin': return value === 'initial' ? '최초' : '기간';
    case 'currency': return value === 'USD' ? '달러(USD)' : '원화(KRW)';
    default: return String(value);
  }
}

function syncDiffItemLines(kind, view) {
  const nameLine = view.ticker ? `${view.name} (${view.ticker})` : view.name;
  if (kind === 'asset') {
    return [nameLine, `${view.owner || '보유자 없음'} · ${view.accountType}`, `수량 ${syncDiffValueText('quantity', view.quantity, view)}`];
  }
  return [
    `${view.date || '거래일 없음'} · ${nameLine}`,
    `${view.owner || '보유자 없음'} · ${view.accountType} · ${syncDiffValueText('type', view.type, view)}`,
    `수량 ${syncDiffValueText('quantity', view.quantity, view)} · 단가 ${syncDiffValueText('price', view.price, view)}`
  ];
}

function syncDiffCountPhrase(assetCount, txCount) {
  const parts = [];
  if (assetCount) parts.push(`자산 ${assetCount}건`);
  if (txCount) parts.push(`거래내역 ${txCount}건`);
  return parts.join(' · ');
}

function syncDiffSettingsPhrase(diff) {
  const names = [];
  if (diff.rebalance.changed) names.push('목표비중');
  if (diff.projection.changed) names.push('미래예측');
  return names.join('·');
}

// 버튼 아래에 붙이는 "이 버튼을 누르면 실제로 일어나는 일". 문장은 실제 동작(받기 = 자산 · 거래 통째 받기 + 설정도 클라우드 값,
// 올리기 = 이 기기 기준으로 올리기)과 정확히 같게 쓴다.
function syncDiffEffectLines(diff, direction) {
  const a = diff.assets, t = diff.transactions;
  const lines = [];
  const settings = syncDiffSettingsPhrase(diff);
  if (direction === 'pull') {
    const lost = syncDiffCountPhrase(a.localOnly.length, t.localOnly.length);
    const changed = syncDiffCountPhrase(a.different.length, t.different.length);
    const added = syncDiffCountPhrase(a.cloudOnly.length, t.cloudOnly.length);
    if (lost) lines.push(`이 기기에만 있는 ${lost}은 이 기기에서 사라집니다.`);
    if (changed) lines.push(`내용이 다른 ${changed}은 클라우드 내용으로 바뀝니다.`);
    if (added) lines.push(`클라우드에만 있는 ${added}을 이 기기에 받아옵니다.`);
    if (settings) lines.push(`${settings} 설정은 클라우드 값으로 바뀝니다.`);
  } else {
    const removed = syncDiffCountPhrase(a.cloudOnly.length, t.cloudOnly.length);
    const changed = syncDiffCountPhrase(a.different.length, t.different.length);
    const added = syncDiffCountPhrase(a.localOnly.length, t.localOnly.length);
    if (removed) lines.push(`클라우드에만 있는 ${removed}은 클라우드에서 빠집니다.`);
    if (changed) lines.push(`내용이 다른 ${changed}은 이 기기 내용으로 올라갑니다.`);
    if (added) lines.push(`이 기기에만 있는 ${added}을 클라우드에 올립니다.`);
    if (settings) lines.push(`${settings} 설정도 이 기기 기준으로 올립니다.`);
  }
  return lines;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYNC_DIFF_ASSET_FIELDS, SYNC_DIFF_TX_FIELDS, SYNC_DIFF_FIELD_LABELS, validateSyncPayload, compareSyncData,
    syncDiffSignature, syncDiffValueText, syncDiffItemLines, syncDiffEffectLines, syncDiffStableJson
  };
}
