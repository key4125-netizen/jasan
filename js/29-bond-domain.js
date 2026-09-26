/* -------------------------------------------------------------------------
 * 29. Bond Domain V1 — 직접보유 채권의 사실 · 현금흐름 · 수익률 · 금리위험
 *     (체크리스트 §47-7 · PM EXECUTION DIRECTIVE 2026-09-20 §4 · BOND-1~6)
 *
 * 왜 별도 모듈인가
 *   기존 자산(js/01 makeAsset)은 `ticker · quantity · buyPrice · currentPrice` 중심이라 채권의
 *   액면 · 표면이율 · 만기 · 지급주기를 담을 수 없다. 기존 자산 구조를 바꾸면 모든 화면 · 동기화 ·
 *   엑셀 왕복이 함께 움직이므로, 채권 사실만 별도 레코드로 두고 assetId로 1:1 연결한다
 *   (기존 데이터 마이그레이션 0건).
 *
 * 네 계층을 섞지 않는다(설계 §1-1)
 *   A. Official Terms — 공식 발행조건(만기 · 쿠폰 · 지급주기). 출처 · 기준일을 함께 기록한다.
 *   B. User Holding   — 매입일 · 매입액면 · 매입단가 · 계좌. **어떤 자동 경로도 덮어쓰지 않는다.**
 *   C. Market         — 그 날의 시장가격. 공공누리 제4유형이라 저장하지 않고 화면에서만 쓴다.
 *   D. Derived        — 현금흐름 · 수익률 · 듀레이션. 저장하지 않고 매번 계산한다.
 *
 * 절대 하지 않는 것
 *   - 값이 없을 때 0으로 채우지 않는다. `{ status: 'UNAVAILABLE', reason }`을 돌려준다.
 *   - 신용 스프레드 자료가 없으므로 신용위험을 수치로 만들지 않는다(등급 · 순위 · 발행인 유형만 표시).
 *   - 시장가격이 없다는 이유로 확정 계층(매입 시 YTM · 실현 쿠폰)을 평가값으로 대체하지 않는다.
 *
 * 일수 계산(day-count): 실제일수/365(ACT/365). 설계 §5가 예시로 든 관행을 그대로 쓰고,
 * 새 금융상품 정책을 추가하지 않는다. 계산 결과에는 이 규칙 이름을 함께 돌려준다.
 * ---------------------------------------------------------------------- */

// ISIN 자동조회 결과 6상태(설계 §4 · PM 지시 §4-2). 화면은 이 여섯 가지만 표시한다.
const BOND_SOURCE_STATUS = Object.freeze({
  FOUND: 'FOUND',                                 // 단건 확정 - 공식 값으로 채운다
  MULTIPLE_MATCH: 'MULTIPLE_MATCH',               // 같은 키에 여러 건 - 사용자가 고른다
  NOT_FOUND: 'NOT_FOUND',                         // 원천에 없다 - 직접 입력
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',       // 원천에 닿지 못했다(네트워크 · 키 · 장애)
  SOURCE_DATA_INCOMPLETE: 'SOURCE_DATA_INCOMPLETE', // 응답은 왔으나 필수 항목이 비었다
  LICENSE_RESTRICTED: 'LICENSE_RESTRICTED'        // 라이선스상 저장 · 가공할 수 없는 항목
});

// MC 자산군 연결용 채권 구분(§47-3). 원천의 발행인 유형에서 정하며, 모르면 UNCLASSIFIED로 둔다.
const BOND_CLASS = Object.freeze({
  KR_GOV: 'KR_GOV',                                   // 국채 · 지방채 · 특수채
  KR_CORP: 'KR_CORP',                                 // 회사채 · 금융채
  // 외화채는 발행인 유형과 환헤지 여부가 **둘 다** 확인돼야 분류한다 - 같은 만기라도 헤지 여부에
  // 따라 원화 기준 변동성이 3배 넘게 달라지고(JPM 원문: 미국 중기국채 11.14% vs 3.45%),
  // 국채와 크레딧도 서로 다른 자산군이기 때문이다. 하나라도 모르면 UNCLASSIFIED다.
  FOREIGN_GOV_HEDGED: 'FOREIGN_GOV_HEDGED',
  FOREIGN_GOV_UNHEDGED: 'FOREIGN_GOV_UNHEDGED',
  FOREIGN_CORP_HEDGED: 'FOREIGN_CORP_HEDGED',
  FOREIGN_CORP_UNHEDGED: 'FOREIGN_CORP_UNHEDGED',
  UNCLASSIFIED: 'UNCLASSIFIED'                        // 분류 근거 없음 → MC에서 제외(σ=0으로 만들지 않는다)
});

// 원천(채권기본정보)의 발행인 유형 표기 → BOND_CLASS. 표기가 목록에 없으면 분류하지 않는다.
const BOND_TYPE_TO_CLASS = Object.freeze({
  '국채': BOND_CLASS.KR_GOV, '국고채권': BOND_CLASS.KR_GOV, '지방채': BOND_CLASS.KR_GOV,
  '특수채': BOND_CLASS.KR_GOV, '통안채': BOND_CLASS.KR_GOV, '통화안정증권': BOND_CLASS.KR_GOV,
  '회사채': BOND_CLASS.KR_CORP, '금융채': BOND_CLASS.KR_CORP, '은행채': BOND_CLASS.KR_CORP,
  '기업어음': BOND_CLASS.KR_CORP
});

const BOND_COUPON_TYPE = Object.freeze({
  COUPON: 'COUPON',       // 이표채 - 정기 지급
  DISCOUNT: 'DISCOUNT',   // 할인채 - 중간 지급 없음, 액면 상환
  COMPOUND: 'COMPOUND'    // 복리채 - 만기 일시(원리금)
});

const BOND_DAY_COUNT = 'ACT/365';
const BOND_STORAGE_KEY = 'sam_bond_positions_v1';
// ±bp 시나리오(정책 고정값 · 난수 없음). 기본은 ±100bp이고 나머지는 보조 표시다.
const BOND_RATE_SHOCKS_BP = Object.freeze([-200, -100, -50, 50, 100, 200]);
const BOND_PRIMARY_SHOCK_BP = 100;

/* ── 공통 도우미 ───────────────────────────────────────────────────────── */

// 빈 값은 0이 아니라 "없음"이다 - Number(null) === 0 · Number('') === 0 이므로 먼저 걸러낸다.
// 이 구분이 무너지면 "입력이 없다"가 "0이다"로 바뀌어, 이 모듈이 지키려는 원칙이 첫 줄에서 깨진다.
function bondNum(v) {
  if (v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '')) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function bondDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim().replace(/[./]/g, '-');
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s.replace(/-/g, '').length === 8 ? s.replace(/-/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isFinite(d.getTime()) ? d : null;
}
function bondIsoDate(d) { return d ? d.toISOString().slice(0, 10) : null; }
function bondDayDiff(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
// ACT/365 연 단위 경과. 음수도 그대로 돌려준다(호출부가 판단한다).
function bondYearFraction(from, to) { return bondDayDiff(from, to) / 365; }
function bondAddMonths(d, months) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const t = new Date(Date.UTC(y, m + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(day, last)));
}
// "계산할 수 없다"를 값 대신 돌려주는 단 하나의 형식 - 0으로 대체하지 않는다.
function bondUnavailable(reason) { return { status: 'UNAVAILABLE', value: null, reason }; }
function bondValue(value, extra) { return Object.assign({ status: 'OK', value }, extra || {}); }

/* ── A · B 계층: 레코드 ────────────────────────────────────────────────── */

/**
 * 채권 레코드를 만든다. 공식 값(identity · terms)과 사용자 보유(holding)를 섞지 않고,
 * 사용자가 공식 값을 고친 경우 원본을 남긴 채 userOverride에만 적는다.
 */
function makeBondPosition(raw) {
  const r = raw || {};
  const id = String(r.id || '').trim() || `bond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const identity = r.identity || {};
  const terms = r.terms || {};
  const source = r.source || {};
  const holding = r.holding || {};
  const bondType = String(identity.bondType || '').trim();
  return {
    id,
    assetId: String(r.assetId || '').trim() || null,
    identity: {
      isin: String(identity.isin || '').trim().toUpperCase() || null,
      instrumentName: String(identity.instrumentName || '').trim() || null,
      issuer: String(identity.issuer || '').trim() || null,
      currency: String(identity.currency || 'KRW').trim().toUpperCase(),
      bondType: bondType || null,
      seniority: String(identity.seniority || '').trim() || null,
      creditRating: String(identity.creditRating || '').trim() || null,
      // 환헤지는 A등급 근거가 있을 때만 적는다(없으면 null - 비헤지로 단정하지 않는다).
      hedgeStatus: ['HEDGED', 'UNHEDGED'].includes(String(identity.hedgeStatus || '').toUpperCase())
        ? String(identity.hedgeStatus).toUpperCase() : null
    },
    terms: {
      issueDate: bondIsoDate(bondDate(terms.issueDate)),
      maturityDate: bondIsoDate(bondDate(terms.maturityDate)),
      faceValue: Number.isFinite(bondNum(terms.faceValue)) ? bondNum(terms.faceValue) : null,
      issuePrice: Number.isFinite(bondNum(terms.issuePrice)) ? bondNum(terms.issuePrice) : null,
      couponRate: Number.isFinite(bondNum(terms.couponRate)) ? bondNum(terms.couponRate) : null,
      couponType: BOND_COUPON_TYPE[String(terms.couponType || '').toUpperCase()] || null,
      rateType: String(terms.rateType || '').trim() || null,
      paymentFrequency: Number.isFinite(bondNum(terms.paymentFrequency)) ? bondNum(terms.paymentFrequency) : null,
      paymentDates: Array.isArray(terms.paymentDates) ? terms.paymentDates.map((d) => bondIsoDate(bondDate(d))).filter(Boolean) : []
    },
    source: {
      provider: String(source.provider || '').trim() || null,
      sourceDate: bondIsoDate(bondDate(source.sourceDate)),
      retrievedAt: source.retrievedAt || null,
      evidenceGrade: String(source.evidenceGrade || '').trim() || null,
      status: BOND_SOURCE_STATUS[String(source.status || '').toUpperCase()] || null,
      licenseNote: String(source.licenseNote || '').trim() || null
    },
    // 사용자가 고친 공식 값만 담는다(원본은 terms · identity에 그대로 남는다).
    userOverride: (r.userOverride && typeof r.userOverride === 'object') ? Object.assign({}, r.userOverride) : {},
    holding: {
      owner: String(holding.owner || '').trim() || null,
      account: String(holding.account || '').trim() || null,
      purchaseDate: bondIsoDate(bondDate(holding.purchaseDate)),
      faceAmount: Number.isFinite(bondNum(holding.faceAmount)) ? bondNum(holding.faceAmount) : null,
      purchaseUnitPrice: Number.isFinite(bondNum(holding.purchaseUnitPrice)) ? bondNum(holding.purchaseUnitPrice) : null,
      purchaseAmount: Number.isFinite(bondNum(holding.purchaseAmount)) ? bondNum(holding.purchaseAmount) : null,
      accruedInterestAtPurchase: Number.isFinite(bondNum(holding.accruedInterestAtPurchase)) ? bondNum(holding.accruedInterestAtPurchase) : null,
      taxType: String(holding.taxType || '').trim() || null,
      soldDate: bondIsoDate(bondDate(holding.soldDate)),
      soldAmount: Number.isFinite(bondNum(holding.soldAmount)) ? bondNum(holding.soldAmount) : null
    },
    updatedAt: Number.isFinite(bondNum(r.updatedAt)) ? bondNum(r.updatedAt) : Date.now()
  };
}

/** 공식 값 위에 사용자 수정값을 얹은 "계산에 쓸 조건". 원본 레코드는 바뀌지 않는다. */
function bondEffectiveTerms(position) {
  const p = position || {};
  const t = Object.assign({}, p.terms);
  const i = Object.assign({}, p.identity);
  const ov = p.userOverride || {};
  Object.keys(ov).forEach((k) => {
    if (k in t && ov[k] !== undefined && ov[k] !== null && ov[k] !== '') t[k] = ov[k];
    else if (k in i && ov[k] !== undefined && ov[k] !== null && ov[k] !== '') i[k] = ov[k];
  });
  return { terms: t, identity: i, overridden: Object.keys(ov) };
}

// 환헤지로 인정하는 두 값만 통과시킨다(makeBondPosition의 정규화 · js/01 sanitizeFxHedgeStatus와 같은 규칙).
function bondHedgeValue(raw) {
  const v = String(raw || '').trim().toUpperCase();
  return (v === 'HEDGED' || v === 'UNHEDGED') ? v : null;
}
// 이 채권 레코드가 붙어 있는 자산. 호출부가 넘겨 주지 않았을 때만 state에서 한 번 찾는다.
function findAssetForBondPosition(position) {
  const id = String((position || {}).assetId || '');
  if (!id) return null;
  const assets = (typeof state !== 'undefined' && Array.isArray(state.assets)) ? state.assets : [];
  return assets.find((a) => a && String(a.id || '') === id) || null;
}

/* [PM 결정 2026-09-24 · D-2 = A안] 이 채권에 적용할 환헤지와 그 근거.
 *
 * 환헤지 값이 두 곳에 따로 있다 - 채권 레코드의 identity.hedgeStatus(자산 폼에서 입력)와
 * 자산의 fxHedgeStatus(거래 폼 · 자산 상세에서 입력). 거래내역이 원천인 자산은 자산 폼이
 * 숨겨지므로 앞의 값을 넣을 방법이 없었고, 그런 외화 채권은 영원히 분류되지 않았다.
 *
 * 우선순위는 고정이다 - 두 값이 모두 있고 서로 달라도 언제나 같은 답이 나온다.
 *   1 채권 레코드의 값   (그 채권만을 두고 고른 값이므로 가장 구체적이다)
 *   2 자산의 값          (같은 자산에 대해 사용자가 고른 값 - 의미를 바꾸지 않고 그대로 읽는다)
 *   3 UNRESOLVED         (없으면 비헤지로 단정하지 않는다 - 기존 원칙)
 * 원화 채권은 이 판단 자체를 하지 않는다(NOT_APPLICABLE).
 *
 * 돌려주는 것은 사실뿐이다 - σ도 자산군도 여기서 정하지 않는다.
 */
function resolveBondHedgeStatusDetail(position, asset) {
  const { identity } = bondEffectiveTerms(position);
  const currency = String(identity.currency || 'KRW').toUpperCase();
  if (currency === 'KRW') return { status: null, source: 'NOT_APPLICABLE', currency };
  const own = bondHedgeValue(identity.hedgeStatus);
  if (own) return { status: own, source: 'bondPosition', currency };
  const a = asset || findAssetForBondPosition(position);
  const fromAsset = a ? bondHedgeValue(a.fxHedgeStatus) : null;
  if (fromAsset) return { status: fromAsset, source: 'asset', currency };
  return { status: null, source: 'UNRESOLVED', currency };
}
function resolveBondHedgeStatus(position, asset) {
  return resolveBondHedgeStatusDetail(position, asset).status;
}

/** MC · Risk가 쓰는 채권 구분. 근거가 없으면 UNCLASSIFIED다(추정하지 않는다). */
function resolveBondClass(position, asset) {
  const { identity } = bondEffectiveTerms(position);
  const ccy = String(identity.currency || 'KRW').toUpperCase();
  const byType = BOND_TYPE_TO_CLASS[String(identity.bondType || '').trim()];
  if (ccy !== 'KRW') {
    // [D-2] 환헤지는 채권 레코드 → 자산 순으로 읽는다. 아래 분기 규칙 자체는 이전과 같다.
    const hedgeStatus = resolveBondHedgeStatus(position, asset);
    // 환헤지 미확인이면 헤지로도 비헤지로도 단정하지 않는다 - 발행인 유형을 몰라도 마찬가지다.
    if (!hedgeStatus || !byType) return BOND_CLASS.UNCLASSIFIED;
    const gov = byType === BOND_CLASS.KR_GOV;
    if (hedgeStatus === 'HEDGED') return gov ? BOND_CLASS.FOREIGN_GOV_HEDGED : BOND_CLASS.FOREIGN_CORP_HEDGED;
    return gov ? BOND_CLASS.FOREIGN_GOV_UNHEDGED : BOND_CLASS.FOREIGN_CORP_UNHEDGED;
  }
  return byType || BOND_CLASS.UNCLASSIFIED;
}

/* ── D 계층: 현금흐름 ──────────────────────────────────────────────────── */

/**
 * 쿠폰 지급일. 공식 일정(권리일정정보)이 있으면 그대로 쓰고, 없으면 만기일에서 역산해 만들되
 * "생성값"이라는 사실을 함께 돌려준다(공식값과 구분해 표시하기 위해서다).
 */
function bondCouponSchedule(position) {
  const { terms } = bondEffectiveTerms(position);
  const maturity = bondDate(terms.maturityDate);
  if (!maturity) return { status: 'UNAVAILABLE', dates: [], generated: false, reason: '만기일이 없어 지급일정을 만들 수 없습니다.' };
  if (terms.couponType === BOND_COUPON_TYPE.DISCOUNT || terms.couponType === BOND_COUPON_TYPE.COMPOUND) {
    return { status: 'OK', dates: [], generated: false, note: '중간 지급이 없는 채권입니다(만기 일시).' };
  }
  if (Array.isArray(terms.paymentDates) && terms.paymentDates.length) {
    return { status: 'OK', dates: terms.paymentDates.slice().sort(), generated: false };
  }
  const freq = bondNum(terms.paymentFrequency);
  if (!Number.isFinite(freq) || freq <= 0) {
    return { status: 'UNAVAILABLE', dates: [], generated: false, reason: '지급주기가 없어 지급일정을 만들 수 없습니다.' };
  }
  const issue = bondDate(terms.issueDate);
  const stepMonths = Math.round(12 / freq);
  const dates = [];
  let cursor = maturity;
  // 만기에서 거꾸로 내려오며 발행일 이후 지급일만 남긴다(발행일이 없으면 30년으로 제한).
  const floor = issue || bondAddMonths(maturity, -360);
  let guard = 0;
  while (cursor > floor && guard++ < 600) {
    dates.push(bondIsoDate(cursor));
    cursor = bondAddMonths(cursor, -stepMonths);
  }
  return { status: 'OK', dates: dates.reverse(), generated: true };
}

/**
 * 채권 하나의 현금흐름. asOf 이후 남은 흐름과 이미 지난 흐름을 함께 돌려준다.
 * 액면 · 표면이율 · 만기 중 하나라도 없으면 만들지 않는다(추정 금지).
 */
function buildBondCashFlows(position, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const { terms } = bondEffectiveTerms(position);
  /* [BOND-01 · BOND-07 · BOND-08 · §49] 보유 액면은 거래원장이 있으면 거래에서(수량 × 10,000),
   * 없으면 예전처럼 레코드의 B 계층에서 가져온다. 둘이 다르면 거래원장이 이긴다. */
  const held = resolveBondHolding(position, opt.positions);
  const face = bondNum(held.faceAmount !== null ? held.faceAmount : terms.faceValue);
  const faceAmount = Number.isFinite(face) ? face : NaN;
  const maturity = bondDate(terms.maturityDate);
  if (!maturity) return { status: 'UNAVAILABLE', flows: [], reason: '만기일이 없어 현금흐름을 만들 수 없습니다.' };
  /* [BOND-23 · BOND-24 · §49] 전량매도해 보유가 0이면 앞으로 받을 쿠폰이 없다 - 미래 현금흐름을
   * 만들지 않는다. 거래원장이 넘어온 경우에만 판단하며, 레코드와 이미 지난 이력은 그대로 둔다.
   * 쿠폰 수령을 거래로 기록하는 회계 기능은 이번 범위가 아니다(BOND-24). */
  if (held.source === 'LEDGER' && held.closed) {
    return { status: 'CLOSED', flows: [], reason: '전량매도되어 보유분이 없습니다 - 이후 현금흐름을 계산하지 않습니다.' };
  }
  if (!Number.isFinite(faceAmount) || faceAmount <= 0) return { status: 'UNAVAILABLE', flows: [], reason: '보유 액면금액이 없어 현금흐름을 만들 수 없습니다.' };
  const couponRate = bondNum(terms.couponRate);
  const couponType = terms.couponType || (Number.isFinite(couponRate) && couponRate > 0 ? BOND_COUPON_TYPE.COUPON : null);
  if (!couponType) return { status: 'UNAVAILABLE', flows: [], reason: '표면이율 · 쿠폰유형이 없어 현금흐름을 만들 수 없습니다.' };

  const flows = [];
  if (couponType === BOND_COUPON_TYPE.COUPON) {
    if (!Number.isFinite(couponRate)) return { status: 'UNAVAILABLE', flows: [], reason: '표면이율이 없어 쿠폰을 계산할 수 없습니다.' };
    const sch = bondCouponSchedule(position);
    if (sch.status !== 'OK') return { status: 'UNAVAILABLE', flows: [], reason: sch.reason };
    const freq = bondNum(terms.paymentFrequency) || (sch.dates.length > 1 ? Math.round(12 / Math.max(1, monthsBetween(bondDate(sch.dates[0]), bondDate(sch.dates[1])))) : 1);
    const per = faceAmount * (couponRate / 100) / freq;
    sch.dates.forEach((d) => flows.push({ date: d, amount: per, kind: 'COUPON', generated: !!sch.generated }));
    flows.push({ date: bondIsoDate(maturity), amount: faceAmount, kind: 'PRINCIPAL', generated: false });
  } else if (couponType === BOND_COUPON_TYPE.DISCOUNT) {
    flows.push({ date: bondIsoDate(maturity), amount: faceAmount, kind: 'PRINCIPAL', generated: false });
  } else { // COMPOUND - 만기 일시 원리금
    const issue = bondDate(terms.issueDate);
    if (!Number.isFinite(couponRate) || !issue) return { status: 'UNAVAILABLE', flows: [], reason: '복리채는 발행일과 표면이율이 모두 있어야 상환금액을 계산할 수 있습니다.' };
    const years = bondYearFraction(issue, maturity);
    const freq = bondNum(terms.paymentFrequency) || 1;
    const redemption = faceAmount * Math.pow(1 + (couponRate / 100) / freq, freq * years);
    flows.push({ date: bondIsoDate(maturity), amount: redemption, kind: 'PRINCIPAL_COMPOUND', generated: false });
  }
  const iso = bondIsoDate(asOf);
  return {
    status: 'OK',
    dayCount: BOND_DAY_COUNT,
    flows: flows.sort((a, b) => (a.date < b.date ? -1 : 1)),
    past: flows.filter((f) => f.date <= iso),
    future: flows.filter((f) => f.date > iso),
    generatedSchedule: flows.some((f) => f.generated)
  };
}

function monthsBetween(a, b) {
  if (!a || !b) return 0;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** 경과이자 - 직전 지급일부터 평가일까지(ACT/365). 이표채만 해당한다. */
function computeAccruedInterest(position, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const { terms } = bondEffectiveTerms(position);
  const couponRate = bondNum(terms.couponRate);
  const faceAmount = bondNum(position.holding && position.holding.faceAmount);
  if (terms.couponType && terms.couponType !== BOND_COUPON_TYPE.COUPON) return bondValue(0, { note: '중간 지급이 없는 채권이라 경과이자가 없습니다.' });
  if (!Number.isFinite(couponRate) || !Number.isFinite(faceAmount)) return bondUnavailable('표면이율 또는 보유 액면금액이 없어 경과이자를 계산할 수 없습니다.');
  const sch = bondCouponSchedule(position);
  if (sch.status !== 'OK' || !sch.dates.length) return bondUnavailable(sch.reason || '지급일정이 없어 경과이자를 계산할 수 없습니다.');
  const iso = bondIsoDate(asOf);
  const prev = sch.dates.filter((d) => d <= iso).pop() || terms.issueDate;
  if (!prev) return bondUnavailable('직전 지급일과 발행일이 모두 없어 경과이자를 계산할 수 없습니다.');
  const days = bondDayDiff(bondDate(prev), asOf);
  if (days < 0) return bondValue(0, { dayCount: BOND_DAY_COUNT });
  return bondValue(faceAmount * (couponRate / 100) * (days / 365), { dayCount: BOND_DAY_COUNT, fromDate: prev, days });
}

/* ── D 계층: 수익률 ────────────────────────────────────────────────────── */

function bondPresentValue(flows, settlement, rate) {
  return flows.reduce((s, f) => {
    const t = bondYearFraction(settlement, bondDate(f.date));
    return s + f.amount / Math.pow(1 + rate, t);
  }, 0);
}

/**
 * 현금흐름의 현가가 주어진 가격이 되는 연복리 할인율(YTM). 이분법으로 푼다 -
 * 반복 횟수 · 허용오차를 고정해 같은 입력이면 항상 같은 값이 나온다.
 */
function solveBondYtm(flows, settlement, price) {
  if (!Array.isArray(flows) || !flows.length) return bondUnavailable('현금흐름이 없어 YTM을 계산할 수 없습니다.');
  if (!Number.isFinite(price) || price <= 0) return bondUnavailable('가격이 없어 YTM을 계산할 수 없습니다.');
  const future = flows.filter((f) => bondDate(f.date) > settlement);
  if (!future.length) return bondUnavailable('평가 시점 이후 남은 현금흐름이 없습니다(이미 만기).');
  let lo = -0.9, hi = 10;
  const f = (r) => bondPresentValue(future, settlement, r) - price;
  if (f(lo) < 0 || f(hi) > 0) return bondUnavailable('주어진 가격에 해당하는 YTM이 계산 범위(-90%~1000%) 밖입니다.');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return bondValue((lo + hi) / 2, { dayCount: BOND_DAY_COUNT });
}

/**
 * 채권 하나의 수익률 8종. 시장가격이 없으면 **확정 계층만** 채워서 돌려준다(BOND-1).
 * marketPrice는 "보유 액면 전체의 시장가치(경과이자 제외 clean 금액)"다 - 단가가 아니다.
 */
function computeBondYields(position, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const { terms } = bondEffectiveTerms(position);
  const h = position.holding || {};
  /* [BOND-01 · BOND-08 · §49] 매입원가 · 보유 액면은 거래원장이 있으면 거래에서 나온다.
   * 매입일 · 세금 구분처럼 거래에 없는 값만 레코드(h)에서 계속 읽는다. */
  const held = resolveBondHolding(position, opt.positions);
  const cf = buildBondCashFlows(position, { asOf, positions: opt.positions });
  const out = {
    asOf: bondIsoDate(asOf), dayCount: BOND_DAY_COUNT, layer: { confirmed: {}, valuation: {} },
    marketPriceAvailable: Number.isFinite(bondNum(opt.marketPrice))
  };

  // ── 확정 계층(시세가 없어도 항상 계산된다)
  out.layer.confirmed.couponYield = Number.isFinite(bondNum(terms.couponRate))
    ? bondValue(bondNum(terms.couponRate)) : bondUnavailable('표면이율이 없습니다.');
  out.layer.confirmed.purchaseAmount = Number.isFinite(bondNum(held.purchaseAmount))
    ? bondValue(bondNum(held.purchaseAmount)) : bondUnavailable('매입금액이 없습니다.');

  if (cf.status === 'OK') {
    const iso = bondIsoDate(asOf);
    const realized = cf.flows.filter((f) => f.kind === 'COUPON' && f.date <= iso && (!h.purchaseDate || f.date > h.purchaseDate));
    out.layer.confirmed.realizedInterest = bondValue(realized.reduce((s, f) => s + f.amount, 0), { count: realized.length });
    const principal = cf.flows.find((f) => f.kind === 'PRINCIPAL' || f.kind === 'PRINCIPAL_COMPOUND');
    out.layer.confirmed.maturityRepayment = principal ? bondValue(principal.amount, { date: principal.date }) : bondUnavailable('만기 상환 현금흐름이 없습니다.');
    out.layer.confirmed.maturityPL = (principal && Number.isFinite(bondNum(held.purchaseAmount)))
      ? bondValue(principal.amount + cf.flows.filter((f) => f.kind === 'COUPON' && (!h.purchaseDate || f.date > h.purchaseDate)).reduce((s, f) => s + f.amount, 0) - bondNum(held.purchaseAmount))
      : bondUnavailable('만기 상환금액 또는 매입금액이 없습니다.');
    const maturity = bondDate(terms.maturityDate);
    out.layer.confirmed.remainingYears = maturity ? bondValue(Math.max(0, bondYearFraction(asOf, maturity))) : bondUnavailable('만기일이 없습니다.');
    const nextFlow = cf.future.find((f) => f.kind === 'COUPON');
    out.layer.confirmed.nextCouponDate = nextFlow ? bondValue(nextFlow.date, { amount: nextFlow.amount }) : bondUnavailable('남은 쿠폰 지급일이 없습니다.');
    // 매입 시 YTM - 매입일 · 매입금액 기준(만기까지 보유 가정 수익률)
    const pDate = bondDate(h.purchaseDate);
    out.layer.confirmed.purchaseYtm = (pDate && Number.isFinite(bondNum(held.purchaseAmount)))
      ? solveBondYtm(cf.flows, pDate, bondNum(held.purchaseAmount))
      : bondUnavailable('매입일 또는 매입금액이 없어 매입 시 YTM을 계산할 수 없습니다.');
  } else {
    ['realizedInterest', 'maturityRepayment', 'maturityPL', 'remainingYears', 'nextCouponDate', 'purchaseYtm'].forEach((k) => {
      out.layer.confirmed[k] = bondUnavailable(cf.reason);
    });
  }

  // ── 평가 계층(그 날 시장가격이 있을 때만)
  const mp = bondNum(opt.marketPrice);
  if (!Number.isFinite(mp)) {
    const why = '오늘 시장가격이 없습니다(채권 시세는 저장하지 않습니다).';
    ['marketValue', 'valuationPL', 'currentYield', 'currentYtm', 'holdingPeriodReturn'].forEach((k) => { out.layer.valuation[k] = bondUnavailable(why); });
    // 보유기간수익률은 쿠폰 수령분만이라도 부분 표시한다(설계 §6) - 평가분이 빠졌다는 사실을 함께 남긴다.
    const ri = out.layer.confirmed.realizedInterest, pa = out.layer.confirmed.purchaseAmount;
    if (ri && ri.status === 'OK' && pa && pa.status === 'OK' && pa.value > 0) {
      out.layer.valuation.holdingPeriodReturn = bondValue(ri.value / pa.value * 100, { partial: true, note: '쿠폰 수령분만 반영했습니다(평가손익 제외).' });
    }
  } else {
    const pa = bondNum(held.purchaseAmount);
    out.layer.valuation.marketValue = bondValue(mp);
    out.layer.valuation.valuationPL = Number.isFinite(pa) ? bondValue(mp - pa) : bondUnavailable('매입금액이 없습니다.');
    const couponRate = bondNum(terms.couponRate), faceAmount = bondNum(held.faceAmount);
    out.layer.valuation.currentYield = (Number.isFinite(couponRate) && Number.isFinite(faceAmount) && mp > 0)
      ? bondValue(faceAmount * (couponRate / 100) / mp * 100) : bondUnavailable('표면이율 · 보유 액면 · 시장가격 중 빠진 값이 있습니다.');
    out.layer.valuation.currentYtm = cf.status === 'OK' ? solveBondYtm(cf.flows, asOf, mp) : bondUnavailable(cf.reason);
    const ri = out.layer.confirmed.realizedInterest;
    out.layer.valuation.holdingPeriodReturn = (Number.isFinite(pa) && pa > 0 && ri && ri.status === 'OK')
      ? bondValue(((mp - pa) + ri.value) / pa * 100) : bondUnavailable('매입금액 또는 실현 쿠폰을 계산할 수 없습니다.');
  }
  return out;
}

/* ── D 계층: 금리위험(듀레이션 모형) ───────────────────────────────────── */

/**
 * 수정듀레이션과 금리 충격 영향. **시장가격이 없어도 계산된다** - 듀레이션은 가격이 아니라
 * 현금흐름 구조에서 나오기 때문이다(할인율은 매입 시 YTM을 쓴다).
 * 표시할 때는 반드시 "모형값"임을 함께 적는다(시장 실측이 아니다).
 */
function computeBondDuration(position, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const { terms } = bondEffectiveTerms(position);
  /* [BOND-20 · §49] 거래 기반 채권은 레코드에 액면 · 매입원가가 없다 - 원장을 함께 넘기지 않으면
   * 현금흐름을 못 만들어 듀레이션이 통째로 "계산 불가"가 된다(그러면 금리 민감도 칸이 빈다). */
  const cf = buildBondCashFlows(position, { asOf, positions: opt.positions });
  if (cf.status !== 'OK') return { status: 'UNAVAILABLE', reason: cf.reason, modelValue: true };
  const future = cf.future;
  if (!future.length) return { status: 'UNAVAILABLE', reason: '평가 시점 이후 남은 현금흐름이 없습니다(이미 만기).', modelValue: true };

  let y = bondNum(opt.ytm);
  let ySource = 'given';
  if (!Number.isFinite(y)) {
    const h = position.holding || {};
    const held = resolveBondHolding(position, opt.positions);
    const pDate = bondDate(h.purchaseDate);
    const solved = (pDate && Number.isFinite(bondNum(held.purchaseAmount))) ? solveBondYtm(cf.flows, pDate, bondNum(held.purchaseAmount)) : bondUnavailable('매입 정보가 없습니다.');
    if (solved.status === 'OK') { y = solved.value; ySource = 'purchaseYtm'; }
  }
  if (!Number.isFinite(y)) {
    // 할인율 근거가 전혀 없으면 표면이율을 쓰되 그 사실을 남긴다(임의 숫자를 만들지 않는다).
    const c = bondNum(terms.couponRate);
    if (!Number.isFinite(c)) return { status: 'UNAVAILABLE', reason: '할인율(YTM)과 표면이율이 모두 없어 듀레이션을 계산할 수 없습니다.', modelValue: true };
    y = c / 100; ySource = 'couponRate';
  }

  const pv = future.map((f) => ({ t: bondYearFraction(asOf, bondDate(f.date)), pv: f.amount / Math.pow(1 + y, bondYearFraction(asOf, bondDate(f.date))) }));
  const total = pv.reduce((s, x) => s + x.pv, 0);
  if (!(total > 0)) return { status: 'UNAVAILABLE', reason: '현금흐름 현가가 0 이하라 듀레이션을 계산할 수 없습니다.', modelValue: true };
  const macaulay = pv.reduce((s, x) => s + x.t * x.pv, 0) / total;
  const freq = bondNum(terms.paymentFrequency) || 1;
  const modified = macaulay / (1 + y / freq);
  const shocks = {};
  BOND_RATE_SHOCKS_BP.forEach((bp) => { shocks[String(bp)] = -modified * (bp / 10000) * 100; }); // 단위 %
  return {
    status: 'OK', modelValue: true, dayCount: BOND_DAY_COUNT,
    macaulayYears: macaulay, modifiedDuration: modified, discountRate: y, discountRateSource: ySource,
    priceImpactPctByBp: shocks, primaryShockBp: BOND_PRIMARY_SHOCK_BP,
    primaryImpactPct: shocks[String(BOND_PRIMARY_SHOCK_BP)]
  };
}

/**
 * 채권 묶음의 위험 요약(BOND-2 · BOND-3). 주식 위험점수와 합치지 않는다 - 별도 층이다.
 * 점수(0~100)를 만들지 않는다: 주식 점수와 섞이면 의미가 무너진다.
 */
function computeBondRiskSummary(positions, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const list = Array.isArray(positions) ? positions : [];
  if (!list.length) return { status: 'EMPTY', count: 0 };
  /* [BOND-20 · BOND-41 · BOND-45 · §49] MARKET / PURCHASE 2단 규칙.
   *   VALID MARKET   → MARKET   (KIS 시세가 BOND-42 검증과 가격기준액면 확인을 모두 통과한 경우)
   *   MARKET 불가     → PURCHASE (거래원장에서 계산한 누적 매입원가 - 계산 로직 자체는 그대로다)
   * 검증을 통과하지 못한 시세는 쓰지 않는다. 0원이나 임의값으로 평가하지 않는다(BOND-45).
   * opt.quotes: { ISIN(대문자): mapKisBondQuote(...).quote } */
  const holdingOf = (p) => resolveBondHolding(p, opt.positions);
  const quoteFor = (p) => {
    const isin = (p.identity && p.identity.isin) ? String(p.identity.isin).toUpperCase() : '';
    return (isin && opt.quotes && Object.prototype.hasOwnProperty.call(opt.quotes, isin)) ? opt.quotes[isin] : null;
  };
  const priceOf = (p, held) => {
    const quote = quoteFor(p);
    if (quote) {
      const mv = computeBondMarketValue(p, quote, { asOf, positions: opt.positions });
      if (mv.status === 'OK') {
        return { value: mv.marketValue, basis: 'MARKET', priceBasisFace: mv.priceBasisFace, unitPrice: mv.price };
      }
      // 통과하지 못하면 이유를 남기고 매입원가로 되돌아간다(조용히 0으로 만들지 않는다).
      const pa0 = bondNum(held && held.purchaseAmount);
      return Number.isFinite(pa0)
        ? { value: pa0, basis: 'PURCHASE', marketUnavailableReason: mv.reason }
        : { value: NaN, basis: null, marketUnavailableReason: mv.reason };
    }
    // [하위호환] 이미 계산된 평가금액을 직접 넘기는 경로(테스트 · 다른 Provider용)는 그대로 둔다.
    const mp = opt.marketPrices ? bondNum(opt.marketPrices[p.id]) : NaN;
    if (Number.isFinite(mp)) return { value: mp, basis: 'MARKET' };
    const pa = bondNum(held && held.purchaseAmount);
    return Number.isFinite(pa) ? { value: pa, basis: 'PURCHASE' } : { value: NaN, basis: null };
  };
  const rows = list.map((p) => {
    const held = holdingOf(p);
    const d = computeBondDuration(p, { asOf, positions: opt.positions });
    const w = priceOf(p, held);
    return {
      id: p.id, name: (p.identity && p.identity.instrumentName) || null,
      holdingSource: held.source, quantity: held.quantity, faceAmount: held.faceAmount, closed: held.closed,
      valuationSource: w.basis, priceBasisFace: w.priceBasisFace ?? null,
      marketUnitPrice: w.unitPrice ?? null, marketUnavailableReason: w.marketUnavailableReason ?? null,
      currency: (p.identity && p.identity.currency) || 'KRW',
      bondClass: resolveBondClass(p),
      creditRating: (p.identity && p.identity.creditRating) || null,
      seniority: (p.identity && p.identity.seniority) || null,
      bondType: (p.identity && p.identity.bondType) || null,
      weightBasis: w.basis, amount: w.value,
      duration: d
    };
  });
  /* [BOND-23 · §49] 전량매도로 보유가 0이 된 채권은 계산에서 뺀다 - 레코드와 거래이력은 지우지 않는다.
   * 아래 집계 · 통화 · 등급 분포 · 계산 불가 목록 모두 같은 기준(open)을 쓴다. */
  const open = rows.filter((r) => !r.closed);
  const usable = open.filter((r) => r.duration.status === 'OK' && Number.isFinite(r.amount) && r.amount > 0);
  const totalAmount = usable.reduce((s, r) => s + r.amount, 0);
  const avgDuration = totalAmount > 0 ? usable.reduce((s, r) => s + r.duration.modifiedDuration * r.amount, 0) / totalAmount : null;
  const impact100 = avgDuration === null ? null : -avgDuration * (BOND_PRIMARY_SHOCK_BP / 10000) * 100;
  const byCurrency = {};
  open.forEach((r) => { byCurrency[r.currency] = (byCurrency[r.currency] || 0) + (Number.isFinite(r.amount) ? r.amount : 0); });
  const ratings = {};
  open.forEach((r) => { const k = r.creditRating || '미확인'; ratings[k] = (ratings[k] || 0) + 1; });
  if (!open.length) return { status: 'EMPTY', count: 0, closedCount: rows.length };
  /* [BOND-41 · 화면 표시용] 이 요약이 어떤 평가를 썼는지 한 줄로 알 수 있게 센다.
   * 섞여 있으면 MIXED다 - "전부 시장가"라고 말하지 않는다. */
  const marketCount = usable.filter((r) => r.valuationSource === 'MARKET').length;
  const purchaseCount = usable.filter((r) => r.valuationSource === 'PURCHASE').length;
  const valuationSource = marketCount && purchaseCount ? 'MIXED' : (marketCount ? 'MARKET' : (purchaseCount ? 'PURCHASE' : null));
  return {
    status: 'OK', count: open.length, closedCount: rows.length - open.length, rows: open, allRows: rows,
    valuationSource, marketCount, purchaseCount,
    modelValue: true, dayCount: BOND_DAY_COUNT,
    durationCoveragePct: open.length ? (usable.length / open.length) * 100 : 0,
    weightedModifiedDuration: avgDuration,
    primaryShockBp: BOND_PRIMARY_SHOCK_BP,
    primaryImpactPct: impact100,
    currencyExposure: byCurrency,
    creditRatingDistribution: ratings,
    // 신용위험은 수치화하지 않는다 - 화면이 이 사실을 그대로 말하게 한다.
    creditRiskNote: '신용 스프레드 자료가 없어 신용위험을 수치로 계산하지 않습니다. 등급 · 채권순위 · 발행인 유형만 표시합니다.',
    unavailable: open.filter((r) => r.duration.status !== 'OK').map((r) => ({ id: r.id, name: r.name, reason: r.duration.reason }))
  };
}

/* ── 거래 기반 보유 해석 (BOND-01 · BOND-07 · BOND-08 · BOND-20 · §49) ──────
 *
 * 왜 필요한가
 *   채권 레코드의 B 계층(holding.faceAmount · purchaseAmount)은 사용자가 자산 폼에 직접 적은
 *   값이라 거래를 아무리 넣어도 움직이지 않았다 - 매수 · 추가매수 · 매도 뒤에도 Bond Risk 가중이
 *   등록 당시 값에 고정됐다(실측). 이제 거래원장이 있는 채권은 원장에서 보유를 계산한다.
 *
 * 무엇을 원천으로 보는가(BOND-08)
 *   거래 기반 채권 : 거래원장(Transaction)이 유일한 원천. B 계층 값은 쓰지 않는다.
 *   legacy 수동 채권 : 예전 그대로 B 계층을 쓴다(BOND-03 - 자동 전환하지 않는다).
 *   둘이 충돌하면 거래원장이 이긴다.
 *
 * 단위(BOND-07)
 *   거래 수량은 **액면 1만원 단위**다. faceAmount = quantity × 10,000 이고
 *   purchaseAmount = quantity × 평균단가다. 사용자에게 액면총액을 따로 입력받지 않는다.
 *   KIS 채권 시세의 "1만원 액면 기준 매매단가"와 같은 체계다.
 */
const BOND_FACE_UNIT = 10000;

/** 채권 레코드가 가리키는 원장 포지션 키. 거래는 ISIN을 ticker 필드에 담는다(BOND-05). */
function bondLedgerKey(position) {
  const p = position || {};
  const isin = (p.identity && p.identity.isin) ? String(p.identity.isin).trim().toUpperCase() : '';
  const owner = (p.holding && p.holding.owner) ? String(p.holding.owner) : '';
  const account = (p.holding && p.holding.account) ? String(p.holding.account) : '';
  if (!isin || !owner || !account) return null;
  /* [§50 · PD-02] 거래/포지션 identity에 통화가 들어갔다(transactionIdentityKey, js/06).
   * 이 키는 그 포지션 맵을 조회하는 용도이므로 **같은 규칙**이어야 한다 - 규칙이 갈라지면
   * 거래가 멀쩡히 있는 채권이 "보유 없음(NONE)"으로 읽혀 Bond Risk와 자산 평가가 함께 빈다.
   * 채권 원장의 발행통화를 쓰고, 비어 있으면 원화로 읽는다(js/06 ledgerCurrencyOf와 같은 기본값). */
  const ccy = String((p.identity && p.identity.currency) || '').trim().toUpperCase() || 'KRW';
  return `${owner}__${account}__${isin}__${ccy}`;
}

/**
 * 이 채권의 "지금 보유"를 정한다.
 *   positions: computePositionsAndRealizedPnL().positions (없으면 legacy 경로로 떨어진다)
 * 반환 source: 'LEDGER'(거래 기반) | 'MANUAL'(legacy 수동) | 'NONE'(둘 다 없음)
 * 거래원장에 그 키가 있으면 수량이 0이어도 LEDGER다 - 전량매도(0)는 "모름"이 아니라 사실이다.
 */
function resolveBondHolding(position, positions) {
  const p = position || {};
  const key = bondLedgerKey(p);
  const pos = (key && positions && Object.prototype.hasOwnProperty.call(positions, key)) ? positions[key] : null;
  if (pos) {
    const qty = bondNum(pos.quantity);
    const avg = bondNum(pos.avgPrice);
    const quantity = Number.isFinite(qty) ? qty : 0;
    const unitPrice = Number.isFinite(avg) ? avg : null;
    return {
      source: 'LEDGER',
      quantity,
      faceAmount: quantity * BOND_FACE_UNIT,
      purchaseUnitPrice: unitPrice,
      purchaseAmount: unitPrice === null ? null : quantity * unitPrice,
      closed: quantity <= 0
    };
  }
  const h = p.holding || {};
  const face = bondNum(h.faceAmount);
  const amount = bondNum(h.purchaseAmount);
  if (!Number.isFinite(face) && !Number.isFinite(amount)) {
    return { source: 'NONE', quantity: null, faceAmount: null, purchaseUnitPrice: null, purchaseAmount: null, closed: false };
  }
  return {
    source: 'MANUAL',
    quantity: Number.isFinite(face) ? face / BOND_FACE_UNIT : null,
    faceAmount: Number.isFinite(face) ? face : null,
    purchaseUnitPrice: Number.isFinite(bondNum(h.purchaseUnitPrice)) ? bondNum(h.purchaseUnitPrice) : null,
    purchaseAmount: Number.isFinite(amount) ? amount : null,
    closed: false
  };
}

/** 액면총액 → 거래 수량(1만원 단위). UI가 액면으로 받을 때 내부 단위로 바꾼다. */
function bondFaceToQuantity(faceAmount) {
  const v = bondNum(faceAmount);
  return Number.isFinite(v) ? v / BOND_FACE_UNIT : null;
}
/** 거래 수량(1만원 단위) → 액면총액. */
function bondQuantityToFace(quantity) {
  const v = bondNum(quantity);
  return Number.isFinite(v) ? v * BOND_FACE_UNIT : null;
}

/* ══ KIS 채권 연동 (BOND-41 ~ BOND-46 · §49 · Stage 2) ═══════════════════
 *
 * 여기 있는 함수는 전부 순수 함수다 - 네트워크는 js/13이, 화면은 js/06 · js/10이 맡는다.
 * 매핑은 2026-09-21에 **운영 Worker로 실제 응답을 받아 확인한 필드 이름만** 쓴다.
 * 2026-08 구현(70c49b3)의 추정 필드명은 실측 결과 대부분 틀렸으므로 한 개도 가져오지 않았다.
 * ═══════════════════════════════════════════════════════════════════════ */

/* [BOND-16 · PM 확정 매핑표] KIS bond_clsf_kor_name → 앱 bondType.
 * 표에 없는 값은 비슷해 보여도 분류하지 않는다(null → UNCLASSIFIED). */
const KIS_BOND_CLASS_TO_TYPE = Object.freeze({
  국고채권: '국채', 지방채권: '지방채', 특수채권: '특수채', 회사채권: '회사채', 금융채권: '금융채'
});

/* KIS 날짜는 YYYYMMDD 8자리 문자열이고, 값이 없으면 '00000000'으로 온다(null이 아니다). */
function kisBondDate(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{8}$/.test(s) || s === '00000000') return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return bondIsoDate(bondDate(iso));
}
function kisNum(v) {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * [BOND-14 · BOND-17] KIS bond-info 응답 → Bond Master의 A 계층(발행조건).
 * 보유(B 계층)는 절대 만들지 않는다 - 그건 거래원장이 원천이다(BOND-01 · BOND-08).
 * requestedIsin과 응답 pdno가 다르면 채택하지 않는다(엉뚱한 채권의 조건을 심지 않는다).
 */
function mapKisBondInfo(raw, requestedIsin) {
  const want = String(requestedIsin || '').trim().toUpperCase();
  const r = raw || {};
  if (String(r.rtCd ?? '') !== '0') {
    return { status: BOND_SOURCE_STATUS.NOT_FOUND, position: null, reason: String(r.msg1 || '').trim() || '조회 결과가 없습니다.' };
  }
  const o = r.output || null;
  if (!o || typeof o !== 'object') {
    return { status: BOND_SOURCE_STATUS.NOT_FOUND, position: null, reason: String(r.msg1 || '').trim() || '조회된 데이터가 없습니다.' };
  }
  const got = String(o.pdno || '').trim().toUpperCase();
  if (!got || (want && got !== want)) {
    return { status: BOND_SOURCE_STATUS.NOT_FOUND, position: null, reason: '요청한 표준코드와 응답의 표준코드가 다릅니다.' };
  }

  const couponRate = kisNum(o.ksd_rcvg_bond_srfc_inrt);
  const discountRate = kisNum(o.ksd_rcvg_bond_dsct_rt);
  const payMonths = kisNum(o.int_caltm_mcnt);
  const paymentFrequency = (Number.isFinite(payMonths) && payMonths > 0) ? 12 / payMonths : null;
  /* 쿠폰 유형은 기존 Bond Domain 규칙(§47-7)을 그대로 쓴다 - 할인율이 잡혀 있으면 할인채,
   * 표면이율과 지급주기가 있으면 이표채. 둘 다 아니면 단정하지 않는다(null). */
  let couponType = null;
  if (Number.isFinite(discountRate) && discountRate > 0) couponType = BOND_COUPON_TYPE.DISCOUNT;
  else if (Number.isFinite(couponRate) && couponRate > 0 && Number.isFinite(paymentFrequency)) couponType = BOND_COUPON_TYPE.COUPON;

  /* [BOND-15 · PM 확정] 발행인명은 KIS 응답에 없다. padf_plac_hdof_name(원리금 지급장소) ·
   * krx_issu_istt_cd(기관 코드) · bond_clsf_kor_name(채권 분류)은 발행인이 아니므로 쓰지 않는다.
   * 추정하지 않고 비워 둔다 - 그것 때문에 저장을 막지도 않는다. */
  const position = makeBondPosition({
    identity: {
      isin: got,
      instrumentName: String(o.ksd_bond_item_name || '').trim() || null,
      issuer: null,
      // 빈 문자열로 오는 사례가 실제로 있다(실측) - 그때는 통화를 단정하지 않는다.
      currency: String(o.iso_crcy_cd || '').trim() || null,
      bondType: KIS_BOND_CLASS_TO_TYPE[String(o.bond_clsf_kor_name || '').trim()] || null,
      creditRating: null,
      seniority: null
    },
    terms: {
      issueDate: kisBondDate(o.issu_dt),
      maturityDate: kisBondDate(o.rdpt_dt),
      couponRate,
      couponType,
      paymentFrequency,
      paymentDates: []
    },
    source: {
      provider: 'KIS',
      sourceDate: kisBondDate(String(o.tlg_rcvg_dtl_dtime || '').slice(0, 8)),
      retrievedAt: new Date(bondNum(r.fetchedAt) || Date.now()).toISOString(),
      evidenceGrade: 'A',
      status: BOND_SOURCE_STATUS.FOUND
    }
  });
  /* [PM 지시 §14] KIS가 실제로 준 항목만 적어 돌려준다. 호출부는 이 목록에 있는 항목만 덮어쓴다 -
   * 예를 들어 iso_crcy_cd가 빈 문자열로 오는 채권이 실제로 있는데(실측), 그때 기존 통화를
   * 스키마 기본값 'KRW'로 밀어버리면 외화채의 통화가 조용히 바뀐다. */
  const provided = {
    instrumentName: !!position.identity.instrumentName,
    currency: String((o.iso_crcy_cd ?? '')).trim() !== '',
    bondType: !!position.identity.bondType,
    issueDate: position.terms.issueDate !== null,
    maturityDate: position.terms.maturityDate !== null,
    couponRate: position.terms.couponRate !== null,
    couponType: position.terms.couponType !== null,
    paymentFrequency: position.terms.paymentFrequency !== null
  };
  const missing = ['maturityDate', 'couponRate'].filter((k) => position.terms[k] === null);
  if (missing.length) {
    position.source.status = BOND_SOURCE_STATUS.SOURCE_DATA_INCOMPLETE;
    return { status: BOND_SOURCE_STATUS.SOURCE_DATA_INCOMPLETE, position, provided, missingFields: missing };
  }
  return { status: BOND_SOURCE_STATUS.FOUND, position, provided, missingFields: [] };
}

/**
 * [BOND-14 · BOND-27] 조회 결과를 기존 레코드에 얹는다.
 * KIS가 준 항목만 덮어쓰고, 안 준 항목과 사용자가 고친 값(userOverride) · 보유(B 계층)는 그대로 둔다.
 * 조회 실패가 이미 있던 정보를 지우는 일이 없어야 한다.
 */
function mergeKisBondInfoIntoPosition(existing, mapped) {
  if (!mapped || !mapped.position) return existing;
  const base = existing || makeBondPosition({});
  const p = mapped.position;
  const provided = mapped.provided || {};
  const pick = (key, next, prev) => (provided[key] ? next : prev);
  return makeBondPosition({
    id: base.id,
    assetId: base.assetId,
    identity: Object.assign({}, base.identity, {
      isin: p.identity.isin || base.identity.isin,
      instrumentName: pick('instrumentName', p.identity.instrumentName, base.identity.instrumentName),
      currency: pick('currency', p.identity.currency, base.identity.currency),
      bondType: pick('bondType', p.identity.bondType, base.identity.bondType),
      // 발행인 · 신용등급 · 채권순위는 KIS가 주지 않는다 - 기존 값을 그대로 둔다(추정 금지).
      issuer: base.identity.issuer,
      creditRating: base.identity.creditRating,
      seniority: base.identity.seniority
    }),
    terms: Object.assign({}, base.terms, {
      issueDate: pick('issueDate', p.terms.issueDate, base.terms.issueDate),
      maturityDate: pick('maturityDate', p.terms.maturityDate, base.terms.maturityDate),
      couponRate: pick('couponRate', p.terms.couponRate, base.terms.couponRate),
      couponType: pick('couponType', p.terms.couponType, base.terms.couponType),
      paymentFrequency: pick('paymentFrequency', p.terms.paymentFrequency, base.terms.paymentFrequency)
    }),
    source: p.source,
    userOverride: base.userOverride, // 사용자가 고친 값은 조회가 지우지 않는다
    holding: base.holding,           // B 계층은 자동 경로가 절대 건드리지 않는다
    updatedAt: Date.now()
  });
}

/**
 * [BOND-42] KIS bond-price 응답 → 시세. **rt_cd만 믿지 않는다.**
 * 실측(2026-09-21): 존재하지 않는 표준코드에도 rt_cd '0' · "정상처리 되었습니다"로 답하면서
 * 값은 전부 0이고 stnd_iscd 필드 자체가 빠진 응답을 준다. 그 0을 시세로 쓰면 평가금액이 0이 된다.
 * 그래서 표준코드가 응답에 있고 요청과 같을 때만 시세로 인정한다.
 */
function mapKisBondQuote(raw, requestedIsin) {
  const want = String(requestedIsin || '').trim().toUpperCase();
  const r = raw || {};
  if (String(r.rtCd ?? '') !== '0') {
    return { status: 'UNAVAILABLE', quote: null, reason: String(r.msg1 || '').trim() || '시세 조회에 실패했습니다.' };
  }
  const o = r.output || null;
  if (!o || typeof o !== 'object') return { status: 'UNAVAILABLE', quote: null, reason: '시세 응답이 비어 있습니다.' };
  const got = String(o.stnd_iscd || '').trim().toUpperCase();
  if (!got) {
    return { status: 'UNAVAILABLE', quote: null, reason: '응답에 표준코드가 없습니다 - 상장되지 않았거나 없는 채권입니다.' };
  }
  if (want && got !== want) {
    return { status: 'UNAVAILABLE', quote: null, reason: '요청한 표준코드와 응답의 표준코드가 다릅니다.' };
  }
  const price = kisNum(o.bond_prpr);
  if (!Number.isFinite(price) || price <= 0) {
    return { status: 'UNAVAILABLE', quote: null, reason: '시세가 없습니다(거래가 없거나 값이 0입니다).' };
  }
  return {
    status: 'OK',
    quote: {
      isin: got,
      name: String(o.hts_kor_isnm || '').trim() || null,
      price,
      prevClose: kisNum(o.bond_prdy_clpr),
      change: kisNum(o.bond_prdy_vrss),
      changePct: kisNum(o.prdy_ctrt),
      yieldPct: kisNum(o.ernn_rate),
      fetchedAt: bondNum(r.fetchedAt) || null
    }
  };
}

/* [BOND-44] 가격 기준액면 후보. 이 목록에 없는 값은 만들지 않는다. */
const BOND_PRICE_BASIS_CANDIDATES = Object.freeze([1000, 10000, 100000, 1000000]);
/* 후보끼리 10배씩 떨어져 있으므로 2배 이내면 어느 후보인지 헷갈릴 수 없다.
 * 경과이자 · 일수계산 차이(표면이율이 높은 채권일수록 커진다)를 넉넉히 흡수한다. */
const BOND_PRICE_BASIS_TOLERANCE = 2;

/**
 * [BOND-44 · PM 지시 §7 · §8] 이 채권의 KIS 시세가 "액면 얼마를 기준으로 매긴 가격"인지 정한다.
 *
 * 추정하지 않는다. 판단 근거는 **응답 자체**다 - KIS는 같은 응답에 가격(bond_prpr)과
 * 수익률(ernn_rate)을 함께 준다. 이 채권의 발행조건으로 그 수익률에서 이론가격을 직접 계산하면
 * "액면 1만원당 얼마여야 하는가"가 나오고, 실제 가격을 그것으로 나누면 기준액면이 드러난다.
 * 종목마다 따로 판정하므로 국고채에서 확인한 값을 다른 채권에 일반화하지 않는다(§7-A · §7-B).
 *
 * 근거가 부족하면(만기 · 표면이율 · 수익률이 없거나, 어느 후보와도 맞지 않으면) UNAVAILABLE이다.
 * 그 경우 호출부는 PURCHASE로 되돌아간다(BOND-45) - 임의 기준액면을 넣지 않는다.
 */
function resolveBondPriceBasis(position, quote, options) {
  const opt = options || {};
  const asOf = bondDate(opt.asOf) || new Date();
  const price = bondNum(quote && quote.price);
  const y = bondNum(quote && quote.yieldPct);
  if (!Number.isFinite(price) || price <= 0) return { status: 'UNAVAILABLE', reason: '시세가 없습니다.' };
  if (!Number.isFinite(y) || y <= 0) {
    return { status: 'UNAVAILABLE', reason: '수익률이 없어 이 가격이 어느 액면 기준인지 확인할 수 없습니다.' };
  }
  const cf = buildBondCashFlows(position, { asOf, positions: opt.positions });
  if (cf.status !== 'OK') return { status: 'UNAVAILABLE', reason: cf.reason || '현금흐름을 만들 수 없어 가격 기준을 확인할 수 없습니다.' };
  const future = cf.future || [];
  if (!future.length) return { status: 'UNAVAILABLE', reason: '남은 현금흐름이 없습니다.' };

  // 이 현금흐름이 깔린 액면(거래원장 또는 legacy 값)으로 나눠 "액면 1만원당 이론가격"을 만든다.
  const held = resolveBondHolding(position, opt.positions);
  const faceUsed = bondNum(held.faceAmount !== null ? held.faceAmount : (position.terms && position.terms.faceValue));
  if (!Number.isFinite(faceUsed) || faceUsed <= 0) return { status: 'UNAVAILABLE', reason: '보유 액면을 알 수 없습니다.' };

  const r = y / 100;
  const pv = future.reduce((s, f) => s + f.amount / Math.pow(1 + r, bondYearFraction(asOf, bondDate(f.date))), 0);
  if (!(pv > 0)) return { status: 'UNAVAILABLE', reason: '이론가격이 0 이하입니다.' };
  const theoreticalPer10000 = pv / faceUsed * BOND_FACE_UNIT;
  const impliedBasis = BOND_FACE_UNIT * (price / theoreticalPer10000);

  let best = null;
  BOND_PRICE_BASIS_CANDIDATES.forEach((c) => {
    const ratio = impliedBasis > c ? impliedBasis / c : c / impliedBasis;
    if (ratio <= BOND_PRICE_BASIS_TOLERANCE && (!best || ratio < best.ratio)) best = { basisFace: c, ratio };
  });
  if (!best) {
    return { status: 'UNAVAILABLE', reason: '가격과 수익률이 서로 맞지 않아 가격 기준액면을 확인하지 못했습니다.' };
  }
  return {
    status: 'OK',
    basisFace: best.basisFace,
    impliedBasis,
    theoreticalPricePer10000: theoreticalPer10000,
    deviationPct: (impliedBasis / best.basisFace - 1) * 100,
    evidence: 'KIS 응답의 가격과 수익률을 이 채권의 발행조건으로 대조해 확인했습니다.'
  };
}

/**
 * [BOND-41 · BOND-43 · BOND-44] 시장가치.
 *   marketValue = faceAmount × (가격 / 가격기준액면)
 * 거래 quantity(액면 1만원 단위)는 그대로 두고, 가격 쪽 기준액면만 따로 맞춘다.
 */
function computeBondMarketValue(position, quote, options) {
  const opt = options || {};
  const held = resolveBondHolding(position, opt.positions);
  if (held.closed) return { status: 'UNAVAILABLE', reason: '전량매도되어 보유분이 없습니다.' };
  const face = bondNum(held.faceAmount);
  if (!Number.isFinite(face) || face <= 0) return { status: 'UNAVAILABLE', reason: '보유 액면이 없습니다.' };
  const basis = resolveBondPriceBasis(position, quote, opt);
  if (basis.status !== 'OK') return { status: 'UNAVAILABLE', reason: basis.reason };
  const price = bondNum(quote && quote.price);
  const marketValue = face * (price / basis.basisFace);
  if (!Number.isFinite(marketValue) || marketValue <= 0) return { status: 'UNAVAILABLE', reason: '시장가치를 계산하지 못했습니다.' };
  return {
    status: 'OK', marketValue, faceAmount: face, price,
    priceBasisFace: basis.basisFace, priceBasisDeviationPct: basis.deviationPct
  };
}

/* ══ [§50 · PD-07 · PD-08] 자산 화면 채권 평가 ═══════════════════════════
 *
 * 왜 여기에 있는가: 「채권 위험」 카드와 자산 화면이 **같은 함수**로 평가해야 두 화면의 숫자가
 * 갈라지지 않는다(감사 A-02 · 실측 차이 162,518원). 평가 규칙은 computeBondRiskSummary의
 * priceOf와 같은 2단이다 - VALID MARKET → PURCHASE(BOND-41 · BOND-45).
 *
 * 돌려주는 것은 **좌당 단가**다. 자산 화면의 평가금액은 예전과 같이 `수량 × 단가`로 만든다 -
 * 수량의 출처를 둘로 만들지 않기 위해서다(자산 레코드의 수량 하나만 쓴다).
 *   MARKET   단가 = 10,000 × (시세 / 가격기준액면)      ← 액면 1만원당 가격으로 환산
 *   PURCHASE 단가 = 거래원장 가중평균 매입단가(asset.buyPrice)
 *
 * **시세는 저장하지 않는다(PD-08).** 이 함수는 메모리 캐시(js/13)만 읽고, 결과도 저장하지 않는다.
 * 거래원장이 없는 수동 채권(legacy)은 사용자가 적어 둔 현재가를 그대로 둔다(PD-17 - 보존).
 * ====================================================================== */
let bondValuationCache = { signature: null, map: null };
function bondValuationSignature() {
  const st = (typeof state !== 'undefined') ? state : null;
  const txs = st && Array.isArray(st.transactions) ? st.transactions : [];
  const bps = st && Array.isArray(st.bondPositions) ? st.bondPositions : [];
  let txStamp = 0; for (let i = 0; i < txs.length; i++) { const u = txs[i] && txs[i].updatedAt; if (u > txStamp) txStamp = u; }
  let bpStamp = 0; for (let i = 0; i < bps.length; i++) { const u = bps[i] && bps[i].updatedAt; if (u > bpStamp) bpStamp = u; }
  const qv = (typeof bondQuoteVersion === 'function') ? bondQuoteVersion() : 0;
  return `${txs.length}|${txStamp}|${bps.length}|${bpStamp}|${qv}`;
}
/** 보유 중인 모든 채권 자산의 좌당 단가를 한 번에 만든다(자산 id → {unitPrice, source, ...}). */
function buildBondAssetValuationMap() {
  const st = (typeof state !== 'undefined') ? state : null;
  const out = new Map();
  if (!st || !Array.isArray(st.bondPositions) || !st.bondPositions.length) return out;
  const ledger = (typeof computePositionsAndRealizedPnL === 'function') ? computePositionsAndRealizedPnL().positions : null;
  const quotes = (typeof getCachedBondQuotes === 'function') ? getCachedBondQuotes() : null;
  const assets = Array.isArray(st.assets) ? st.assets : [];
  st.bondPositions.forEach((p) => {
    if (!p) return;
    const isin = String((p.identity && p.identity.isin) || '').trim().toUpperCase();
    const asset = assets.find((a) => a && (String(a.id) === String(p.assetId || '')
      || (isin && String(a.ticker || '').trim().toUpperCase() === isin)));
    if (!asset) return;
    const quote = (isin && quotes && Object.prototype.hasOwnProperty.call(quotes, isin)) ? quotes[isin] : null;
    let entry = null;
    if (quote) {
      const basis = resolveBondPriceBasis(p, quote, { positions: ledger });
      if (basis.status === 'OK') {
        const unit = BOND_FACE_UNIT * (bondNum(quote.price) / basis.basisFace);
        if (Number.isFinite(unit) && unit > 0) {
          entry = { unitPrice: unit, source: 'MARKET', priceBasisFace: basis.basisFace, quotePrice: bondNum(quote.price) };
        }
      }
      if (!entry) entry = { unitPrice: null, source: null, marketUnavailableReason: basis.reason || '시세를 평가에 쓸 수 없습니다.' };
    }
    out.set(asset.id, entry || { unitPrice: null, source: null });
  });
  return out;
}
/**
 * 자산 하나의 채권 좌당 단가. 채권이 아니거나 근거가 없으면 null을 돌려주고,
 * 호출부(calcRow)는 예전 그대로 asset.currentPrice를 쓴다.
 * 반환: { unitPrice, source: 'MARKET'|'PURCHASE', marketUnavailableReason? } | null
 */
function resolveBondAssetUnitPrice(asset) {
  if (!asset || asset.category !== '채권') return null;
  const sig = bondValuationSignature();
  if (bondValuationCache.signature !== sig) {
    bondValuationCache = { signature: sig, map: buildBondAssetValuationMap() };
  }
  const hit = bondValuationCache.map ? bondValuationCache.map.get(asset.id) : null;
  if (hit && hit.source === 'MARKET' && Number.isFinite(hit.unitPrice)) return hit;
  /* [PD-07] MARKET을 쓸 수 없으면 거래원장 기반 매입원가로 되돌아간다.
   * asset.buyPrice는 syncAssetsFromTransactions가 거래마다 갱신하는 가중평균 매입단가다 -
   * "최초 거래가격 고정"(감사 A-01)이 사라지는 지점이 바로 여기다.
   * 거래원장이 없는 수동 채권은 사용자가 관리하는 값이므로 건드리지 않는다(PD-17). */
  const ledgerBacked = asset.positionSource === 'ledger'
    || (typeof isTransactionTracked === 'function' && asset.positionSource !== 'manual' && isTransactionTracked(asset));
  if (!ledgerBacked) return hit && hit.marketUnavailableReason ? { unitPrice: null, source: null, marketUnavailableReason: hit.marketUnavailableReason } : null;
  const buy = bondNum(asset.buyPrice);
  if (!Number.isFinite(buy) || buy <= 0) return null;
  return { unitPrice: buy, source: 'PURCHASE', marketUnavailableReason: hit ? hit.marketUnavailableReason : undefined };
}

/* [§50 · PD-11 · 감사 J-02] 자산과 채권 레코드의 연결을 되살린다 - **지우지 않는다.**
 *
 * 엑셀 가져오기는 state.assets를 통째로 교체한다. 그때 자산 id가 새로 발급되면(사용자가 id 칸을
 * 비웠거나 새 행을 직접 추가한 경우) 채권 레코드의 assetId가 가리키던 자산이 사라져 **고아**가 된다.
 * 고아가 되면 세부 성격(국공채/회사채)이 끊기고, 그 ISIN의 시세를 계속 조회하게 된다.
 *
 * 채권의 진짜 신분증은 ISIN이다(BOND-05). 그래서 ISIN + 소유자 + 계좌로 자산을 다시 찾아 연결한다.
 * 찾지 못하면 **그대로 둔다** - 사용자가 잠시 자산을 뺀 것일 수도 있으므로 발행조건을 삭제하지
 * 않는다(PD-17 · 자동 대량 변환 금지). 남은 고아 수는 호출부가 보고용으로 쓴다.
 */
function relinkBondPositionsToAssets() {
  const st = (typeof state !== 'undefined') ? state : null;
  if (!st || !Array.isArray(st.bondPositions) || !st.bondPositions.length) return { relinked: 0, orphan: 0 };
  const assets = Array.isArray(st.assets) ? st.assets : [];
  let relinked = 0, orphan = 0;
  st.bondPositions.forEach((p) => {
    if (!p) return;
    if (assets.some((a) => a && String(a.id) === String(p.assetId || ''))) return;
    const isin = String((p.identity && p.identity.isin) || '').trim().toUpperCase();
    const owner = (p.holding || {}).owner || null;
    const account = (p.holding || {}).account || null;
    const hit = isin ? assets.find((a) => a && String(a.ticker || '').trim().toUpperCase() === isin
      && (!owner || a.owner === owner) && (!account || a.accountType === account)) : null;
    if (hit) { p.assetId = hit.id; p.updatedAt = Date.now(); relinked++; } else { orphan++; }
  });
  if (relinked && typeof persistBondPositions === 'function') persistBondPositions();
  return { relinked, orphan };
}

/* ── MC · 자산 성격 연계 (§47-3) ── */

// BOND_CLASS → 앱 자산 성격(js/05 ASSET_CHARACTERS). UNCLASSIFIED는 연결하지 않는다.
const BOND_CLASS_TO_CHARACTER = Object.freeze({
  KR_GOV: 'KR_GOV_BOND', KR_CORP: 'KR_CORP_BOND',
  FOREIGN_GOV_HEDGED: 'FOREIGN_GOV_BOND_HEDGED', FOREIGN_GOV_UNHEDGED: 'FOREIGN_GOV_BOND_UNHEDGED',
  FOREIGN_CORP_HEDGED: 'FOREIGN_CORP_BOND_HEDGED', FOREIGN_CORP_UNHEDGED: 'FOREIGN_CORP_BOND_UNHEDGED'
});

/**
 * 자산 하나에 연결된 채권 레코드가 있으면 그 채권 구분에 맞는 자산 성격을 돌려준다.
 * 근거가 없으면 null - 호출부(js/05)는 기존 BOND 성격을 그대로 쓴다.
 */
function resolveBondAssetCharacter(asset, positions) {
  if (!asset) return null;
  const list = Array.isArray(positions) ? positions : (typeof state !== 'undefined' && Array.isArray(state.bondPositions) ? state.bondPositions : []);
  if (!list.length) return null;
  const id = String(asset.id || '');
  const p = list.find((x) => x && String(x.assetId || '') === id && id !== '');
  if (!p) return null;
  const cls = resolveBondClass(p, asset); // [D-2] 자산의 환헤지가 폴백이다 - 이미 들고 있으므로 넘긴다
  const ch = BOND_CLASS_TO_CHARACTER[cls];
  return ch ? { character: ch, bondClass: cls, bondId: p.id } : { character: null, bondClass: cls, bondId: p.id };
}

/* ── ISIN 자동조회 어댑터 (A 계층 전용) ────────────────────────────────── */

/**
 * 공공데이터(채권기본정보 · 채권권리일정정보) 응답을 앱 레코드로 옮긴다.
 * **사용자 보유(holding)는 절대 건드리지 않는다** - 이 함수는 identity · terms · source만 만든다.
 * 서비스키는 인자로도 받지 않는다(호출부가 URL을 만들고, 이 함수는 파싱만 한다).
 */
function mapBondSourceResponse(rows, options) {
  const opt = options || {};
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return { status: BOND_SOURCE_STATUS.NOT_FOUND, position: null, candidates: [] };
  if (list.length > 1) {
    return {
      status: BOND_SOURCE_STATUS.MULTIPLE_MATCH, position: null,
      candidates: list.map((r) => ({ isin: r.isinCd || r.isin || null, name: r.isinCdNm || r.bondIsurNm || null, maturityDate: r.bondExprDt || r.maturityDate || null }))
    };
  }
  const r = list[0];
  const terms = {
    issueDate: r.bondIssuDt || r.issueDate || null,
    maturityDate: r.bondExprDt || r.maturityDate || null,
    faceValue: r.bondIssuAmt || r.faceValue || null,
    couponRate: r.bondSrfcInrt !== undefined ? r.bondSrfcInrt : (r.couponRate !== undefined ? r.couponRate : null),
    couponType: normalizeCouponType(r.bondIntTcdNm || r.couponType),
    rateType: r.irtChngDcdNm || r.rateType || null,
    paymentFrequency: normalizePaymentFrequency(r.bondPymtCnt || r.paymentFrequency || r.intPayCycl),
    paymentDates: Array.isArray(opt.scheduleDates) ? opt.scheduleDates : []
  };
  const identity = {
    isin: r.isinCd || r.isin || null,
    instrumentName: r.isinCdNm || r.instrumentName || null,
    issuer: r.bondIsurNm || r.issuer || null,
    currency: r.bondPymtCurCd || r.currency || 'KRW',
    bondType: r.bondOfrMktNm || r.kindNm || r.bondType || null,
    seniority: r.bondRnkNm || r.seniority || null
  };
  const missing = ['maturityDate', 'couponRate'].filter((k) => terms[k] === null || terms[k] === undefined || terms[k] === '');
  const status = missing.length ? BOND_SOURCE_STATUS.SOURCE_DATA_INCOMPLETE : BOND_SOURCE_STATUS.FOUND;
  const position = makeBondPosition({
    identity, terms,
    source: {
      provider: opt.provider || 'data.go.kr/채권기본정보', sourceDate: r.basDt || opt.sourceDate || null,
      retrievedAt: opt.retrievedAt || new Date().toISOString(), evidenceGrade: 'A', status,
      licenseNote: '공공누리 제2유형(출처표시 · 상업적 이용금지) - 출처를 표시해 사용합니다.'
    }
  });
  return { status, position, candidates: [], missingFields: missing };
}

function normalizeCouponType(v) {
  const s = String(v || '');
  if (/할인/.test(s)) return BOND_COUPON_TYPE.DISCOUNT;
  if (/복리/.test(s)) return BOND_COUPON_TYPE.COMPOUND;
  if (/이표|이자지급|단리/.test(s)) return BOND_COUPON_TYPE.COUPON;
  return null;
}
function normalizePaymentFrequency(v) {
  const n = bondNum(v);
  if (Number.isFinite(n) && n > 0 && n <= 12) return n;
  const s = String(v || '');
  if (/3개월|분기/.test(s)) return 4;
  if (/6개월|반기/.test(s)) return 2;
  if (/1개월|매월/.test(s)) return 12;
  if (/1년|연\s*1/.test(s)) return 1;
  return null;
}

/** 자동조회 결과를 기존 레코드에 병합한다 - holding과 userOverride는 그대로 보존한다. */
function mergeBondSourceIntoPosition(existing, fetched) {
  if (!fetched) return existing;
  const base = existing || makeBondPosition({});
  return makeBondPosition({
    id: base.id, assetId: base.assetId,
    identity: Object.assign({}, fetched.identity, { hedgeStatus: base.identity.hedgeStatus, creditRating: base.identity.creditRating || fetched.identity.creditRating }),
    terms: fetched.terms,
    source: fetched.source,
    userOverride: base.userOverride,   // 사용자가 고친 값은 자동 갱신이 지우지 않는다
    holding: base.holding,             // B 계층은 자동 경로가 절대 건드리지 않는다
    updatedAt: Date.now()
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOND_SOURCE_STATUS, BOND_CLASS, BOND_COUPON_TYPE, BOND_TYPE_TO_CLASS, BOND_DAY_COUNT,
    BOND_STORAGE_KEY, BOND_RATE_SHOCKS_BP, BOND_PRIMARY_SHOCK_BP, BOND_CLASS_TO_CHARACTER,
    makeBondPosition, bondEffectiveTerms, resolveBondClass, bondCouponSchedule, buildBondCashFlows,
    // [D-2] 환헤지 우선순위(채권 레코드 → 자산 → UNRESOLVED)를 쓰는 모든 화면이 같은 함수를 본다
    resolveBondHedgeStatus, resolveBondHedgeStatusDetail,
    computeAccruedInterest, solveBondYtm, computeBondYields, computeBondDuration, computeBondRiskSummary,
    resolveBondAssetCharacter, mapBondSourceResponse, mergeBondSourceIntoPosition,
    BOND_FACE_UNIT, bondLedgerKey, resolveBondHolding, bondFaceToQuantity, bondQuantityToFace,
    KIS_BOND_CLASS_TO_TYPE, BOND_PRICE_BASIS_CANDIDATES, mapKisBondInfo, mapKisBondQuote,
    resolveBondPriceBasis, computeBondMarketValue, mergeKisBondInfoIntoPosition,
    // [§50 · PD-07] 자산 화면 · Bond Risk가 같은 규칙으로 평가하도록 공유하는 진입점
    resolveBondAssetUnitPrice, buildBondAssetValuationMap, bondValuationSignature, relinkBondPositionsToAssets
  };
}
