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

/** MC · Risk가 쓰는 채권 구분. 근거가 없으면 UNCLASSIFIED다(추정하지 않는다). */
function resolveBondClass(position) {
  const { identity } = bondEffectiveTerms(position);
  const ccy = String(identity.currency || 'KRW').toUpperCase();
  const byType = BOND_TYPE_TO_CLASS[String(identity.bondType || '').trim()];
  if (ccy !== 'KRW') {
    // 환헤지 미확인이면 헤지로도 비헤지로도 단정하지 않는다 - 발행인 유형을 몰라도 마찬가지다.
    if (!identity.hedgeStatus || !byType) return BOND_CLASS.UNCLASSIFIED;
    const gov = byType === BOND_CLASS.KR_GOV;
    if (identity.hedgeStatus === 'HEDGED') return gov ? BOND_CLASS.FOREIGN_GOV_HEDGED : BOND_CLASS.FOREIGN_CORP_HEDGED;
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
  const face = bondNum(terms.faceValue !== null ? (position.holding && position.holding.faceAmount) || terms.faceValue : NaN);
  const faceAmount = Number.isFinite(bondNum(position.holding && position.holding.faceAmount))
    ? bondNum(position.holding.faceAmount) : (Number.isFinite(face) ? face : NaN);
  const maturity = bondDate(terms.maturityDate);
  if (!maturity) return { status: 'UNAVAILABLE', flows: [], reason: '만기일이 없어 현금흐름을 만들 수 없습니다.' };
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
  const cf = buildBondCashFlows(position, { asOf });
  const out = {
    asOf: bondIsoDate(asOf), dayCount: BOND_DAY_COUNT, layer: { confirmed: {}, valuation: {} },
    marketPriceAvailable: Number.isFinite(bondNum(opt.marketPrice))
  };

  // ── 확정 계층(시세가 없어도 항상 계산된다)
  out.layer.confirmed.couponYield = Number.isFinite(bondNum(terms.couponRate))
    ? bondValue(bondNum(terms.couponRate)) : bondUnavailable('표면이율이 없습니다.');
  out.layer.confirmed.purchaseAmount = Number.isFinite(bondNum(h.purchaseAmount))
    ? bondValue(bondNum(h.purchaseAmount)) : bondUnavailable('매입금액이 없습니다.');

  if (cf.status === 'OK') {
    const iso = bondIsoDate(asOf);
    const realized = cf.flows.filter((f) => f.kind === 'COUPON' && f.date <= iso && (!h.purchaseDate || f.date > h.purchaseDate));
    out.layer.confirmed.realizedInterest = bondValue(realized.reduce((s, f) => s + f.amount, 0), { count: realized.length });
    const principal = cf.flows.find((f) => f.kind === 'PRINCIPAL' || f.kind === 'PRINCIPAL_COMPOUND');
    out.layer.confirmed.maturityRepayment = principal ? bondValue(principal.amount, { date: principal.date }) : bondUnavailable('만기 상환 현금흐름이 없습니다.');
    out.layer.confirmed.maturityPL = (principal && Number.isFinite(bondNum(h.purchaseAmount)))
      ? bondValue(principal.amount + cf.flows.filter((f) => f.kind === 'COUPON' && (!h.purchaseDate || f.date > h.purchaseDate)).reduce((s, f) => s + f.amount, 0) - bondNum(h.purchaseAmount))
      : bondUnavailable('만기 상환금액 또는 매입금액이 없습니다.');
    const maturity = bondDate(terms.maturityDate);
    out.layer.confirmed.remainingYears = maturity ? bondValue(Math.max(0, bondYearFraction(asOf, maturity))) : bondUnavailable('만기일이 없습니다.');
    const nextFlow = cf.future.find((f) => f.kind === 'COUPON');
    out.layer.confirmed.nextCouponDate = nextFlow ? bondValue(nextFlow.date, { amount: nextFlow.amount }) : bondUnavailable('남은 쿠폰 지급일이 없습니다.');
    // 매입 시 YTM - 매입일 · 매입금액 기준(만기까지 보유 가정 수익률)
    const pDate = bondDate(h.purchaseDate);
    out.layer.confirmed.purchaseYtm = (pDate && Number.isFinite(bondNum(h.purchaseAmount)))
      ? solveBondYtm(cf.flows, pDate, bondNum(h.purchaseAmount))
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
    const pa = bondNum(h.purchaseAmount);
    out.layer.valuation.marketValue = bondValue(mp);
    out.layer.valuation.valuationPL = Number.isFinite(pa) ? bondValue(mp - pa) : bondUnavailable('매입금액이 없습니다.');
    const couponRate = bondNum(terms.couponRate), faceAmount = bondNum(h.faceAmount);
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
  const cf = buildBondCashFlows(position, { asOf });
  if (cf.status !== 'OK') return { status: 'UNAVAILABLE', reason: cf.reason, modelValue: true };
  const future = cf.future;
  if (!future.length) return { status: 'UNAVAILABLE', reason: '평가 시점 이후 남은 현금흐름이 없습니다(이미 만기).', modelValue: true };

  let y = bondNum(opt.ytm);
  let ySource = 'given';
  if (!Number.isFinite(y)) {
    const h = position.holding || {};
    const pDate = bondDate(h.purchaseDate);
    const solved = (pDate && Number.isFinite(bondNum(h.purchaseAmount))) ? solveBondYtm(cf.flows, pDate, bondNum(h.purchaseAmount)) : bondUnavailable('매입 정보가 없습니다.');
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
  const priceOf = (p) => {
    const mp = opt.marketPrices ? bondNum(opt.marketPrices[p.id]) : NaN;
    if (Number.isFinite(mp)) return { value: mp, basis: 'MARKET' };
    const pa = bondNum(p.holding && p.holding.purchaseAmount);
    return Number.isFinite(pa) ? { value: pa, basis: 'PURCHASE' } : { value: NaN, basis: null };
  };
  const rows = list.map((p) => {
    const d = computeBondDuration(p, { asOf });
    const w = priceOf(p);
    return {
      id: p.id, name: (p.identity && p.identity.instrumentName) || null,
      currency: (p.identity && p.identity.currency) || 'KRW',
      bondClass: resolveBondClass(p),
      creditRating: (p.identity && p.identity.creditRating) || null,
      seniority: (p.identity && p.identity.seniority) || null,
      bondType: (p.identity && p.identity.bondType) || null,
      weightBasis: w.basis, amount: w.value,
      duration: d
    };
  });
  const usable = rows.filter((r) => r.duration.status === 'OK' && Number.isFinite(r.amount) && r.amount > 0);
  const totalAmount = usable.reduce((s, r) => s + r.amount, 0);
  const avgDuration = totalAmount > 0 ? usable.reduce((s, r) => s + r.duration.modifiedDuration * r.amount, 0) / totalAmount : null;
  const impact100 = avgDuration === null ? null : -avgDuration * (BOND_PRIMARY_SHOCK_BP / 10000) * 100;
  const byCurrency = {};
  rows.forEach((r) => { byCurrency[r.currency] = (byCurrency[r.currency] || 0) + (Number.isFinite(r.amount) ? r.amount : 0); });
  const ratings = {};
  rows.forEach((r) => { const k = r.creditRating || '미확인'; ratings[k] = (ratings[k] || 0) + 1; });
  return {
    status: 'OK', count: rows.length, rows,
    modelValue: true, dayCount: BOND_DAY_COUNT,
    durationCoveragePct: rows.length ? (usable.length / rows.length) * 100 : 0,
    weightedModifiedDuration: avgDuration,
    primaryShockBp: BOND_PRIMARY_SHOCK_BP,
    primaryImpactPct: impact100,
    currencyExposure: byCurrency,
    creditRatingDistribution: ratings,
    // 신용위험은 수치화하지 않는다 - 화면이 이 사실을 그대로 말하게 한다.
    creditRiskNote: '신용 스프레드 자료가 없어 신용위험을 수치로 계산하지 않습니다. 등급 · 채권순위 · 발행인 유형만 표시합니다.',
    unavailable: rows.filter((r) => r.duration.status !== 'OK').map((r) => ({ id: r.id, name: r.name, reason: r.duration.reason }))
  };
}

/* ── MC · 자산 성격 연계 (§47-3) ───────────────────────────────────────── */

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
  const cls = resolveBondClass(p);
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
    computeAccruedInterest, solveBondYtm, computeBondYields, computeBondDuration, computeBondRiskSummary,
    resolveBondAssetCharacter, mapBondSourceResponse, mergeBondSourceIntoPosition
  };
}
