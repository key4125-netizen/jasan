/* [§53 · v267 통합 자동화] 원천 사실 기반 자동 판정 회귀 테스트.
 *
 * 무엇을 고정하는가
 *   ① 공식 종목 마스터의 원천 사실(증권그룹 · 증권유형 · 호가통화 · ETF 플래그 · 증권 클래스)을
 *      읽어 자산군 · 경제적 노출 · 통화를 정하는 규칙
 *   ② "정상 케이스는 자동, 충돌 · 근거없음만 미확정"이라는 경계
 *   ③ 사용자가 확정한 값은 자동 판정이 덮지 않는다는 보호
 *   ④ 같은 종목에 대해 Market Beta와 Tracking Beta가 서로 다른 전제를 갖지 않는다는 정합성
 *
 * 특정 종목을 위한 예외는 만들지 않는다 - 전부 증권그룹 · 증권클래스라는 일반 규칙으로 판정한다.
 * 실제 사용자 종목을 쓰지 않는다(전부 ZZ 접두어 합성 데이터).
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadRiskSandbox } = require('./risk-sandbox.js');

// vm 샌드박스에서 나온 객체는 다른 realm의 것이라 assert.deepStrictEqual이 그대로 비교하지 못한다.
// 다른 리스크 테스트들과 같은 방식으로 평범한 객체로 옮겨 담는다.
const plain = (v) => JSON.parse(JSON.stringify(v));

/* 합성 종목 마스터. 실제 원천이 담는 필드 모양을 그대로 쓴다(scripts/update-ticker-master.js 참고). */
const MASTER = {
  // ── 국내 ──
  'ZZKP.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 코스피주권', securityGroup: 'ST', currency: 'KRW' },
  'ZZKQ.KQ': { exchange: 'KOSDAQ', market: 'KR', nameKr: 'ZZ 코스닥주권', securityGroup: 'ST', currency: 'KRW' },
  'ZZPR.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 코스피주권우', securityGroup: 'ST', currency: 'KRW' },
  'ZZEF.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 상장지수펀드', securityGroup: 'EF', currency: 'KRW' },
  'ZZRT.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 리츠', securityGroup: 'RT', currency: 'KRW' },
  'ZZDR.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 예탁증서', securityGroup: 'DR', currency: 'KRW' },
  'ZZFS.KQ': { exchange: 'KOSDAQ', market: 'KR', nameKr: 'ZZ 외국주권', securityGroup: 'FS', currency: 'KRW' },
  // ── 미국 ──
  ZZUSCOM: { exchange: 'NASDAQ', market: 'US', nameEn: 'ZZ US CORP', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ US Corp. - Common Stock' },
  ZZUSETF: { exchange: 'AMEX', market: 'US', nameEn: 'ZZ INDEX ETF', securityType: '3', drFlag: 'N', isEtf: true, currency: 'USD', securityName: 'ZZ Index ETF' },
  ZZADRK: { exchange: 'NYSE', market: 'US', nameKr: 'ZZ 해외기업(ADR)', nameEn: 'ZZ FOREIGN CO', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ Foreign Co Common Stock' },
  ZZADRF: { exchange: 'NYSE', market: 'US', nameEn: 'ZZ OTHER CO', securityType: '2', drFlag: 'Y', drCountry: 'GB', isEtf: false, currency: 'USD', securityName: 'ZZ Other Co Common Stock' },
  ZZORD: { exchange: 'NASDAQ', market: 'US', nameEn: 'ZZ ISRAEL LTD', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ Israel Ltd. - Ordinary Shares' },
  ZZNV: { exchange: 'NYSE', market: 'US', nameEn: 'ZZ EURO NV', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ Euro N.V. Common Shares' },
  ZZNOCLS: { exchange: 'NYSE', market: 'US', nameEn: 'ZZ UNKNOWN CLASS', securityType: '2', drFlag: 'N', isEtf: false, currency: 'USD', securityName: 'ZZ Unknown Class Inc.' },
  // 구버전 마스터(증권그룹 · 증권클래스가 아직 없다 - 캐시된 옛 데이터)
  'ZZOLD.KS': { exchange: 'KOSPI', market: 'KR', nameKr: 'ZZ 구버전국내주' },
  ZZOLDUS: { exchange: 'NASDAQ', market: 'US', nameEn: 'ZZ OLD US CORP' }
};

function fresh() {
  const s = loadRiskSandbox();
  s.setTickerMaster(MASTER);
  return s;
}
const facts = (s, t) => plain(s.evalInSandbox(`resolveInstrumentFacts(${JSON.stringify(t)})`));
const cat = (s, t, name) => s.evalInSandbox(`classifyCategory(${JSON.stringify(t)}, ${JSON.stringify(name || '')})`);
const mkt = (s, t, category, name) => plain(s.resolveMarketRiskBenchmark({ ticker: t, category: category || '주식', name: name || '' }));
const trk = (s, t, category, name) => plain(s.resolveRiskBenchmark({ ticker: t, category: category || '주식', name: name || '' }));

/* ══════════════════ A. 원천 사실 읽기 ══════════════════ */

test('A - 종목 마스터의 원천 사실을 그대로 읽는다(지어내지 않는다)', () => {
  const s = fresh();
  const kr = facts(s, 'ZZKP.KS');
  assert.strictEqual(kr.found, true);
  assert.strictEqual(kr.market, 'KR');
  assert.strictEqual(kr.exchange, 'KOSPI');
  assert.strictEqual(kr.securityGroup, 'ST');
  assert.strictEqual(kr.currency, 'KRW');
  // 마스터에 없는 종목은 found=false이고 모든 값이 null이다 - 추측하지 않는다.
  const none = facts(s, 'ZZNOWHERE');
  assert.strictEqual(none.found, false);
  assert.strictEqual(none.securityGroup, null);
  assert.strictEqual(none.currency, null);
});

test('A-2 - market 필드가 없어도 상장 거래소로 시장을 정한다(1:1 대응)', () => {
  const s = loadRiskSandbox();
  s.setTickerMaster({ 'ZZX.KQ': { exchange: 'KOSDAQ', nameKr: 'ZZ', securityGroup: 'ST' }, ZZY: { exchange: 'NYSE', nameEn: 'ZZ', securityType: '2' } });
  assert.strictEqual(facts(s, 'ZZX.KQ').market, 'KR');
  assert.strictEqual(facts(s, 'ZZY').market, 'US');
});

/* ══════════════════ B. 자산군 자동 판정 ══════════════════ */

test('B - 국내 증권그룹으로 자산군을 정한다(이름 키워드보다 우선)', () => {
  const s = fresh();
  assert.strictEqual(cat(s, 'ZZKP.KS', 'ZZ 코스피주권'), '주식');
  assert.strictEqual(cat(s, 'ZZPR.KS', 'ZZ 코스피주권우'), '주식');
  assert.strictEqual(cat(s, 'ZZEF.KS', 'ZZ 상장지수펀드'), 'ETF');
  // 리츠는 매일 호가가 서는 거래 종목이다 - '부동산'(시세조회 제외)으로 두면 평가금액이 멈춘다.
  assert.strictEqual(cat(s, 'ZZRT.KS', 'ZZ 리츠'), '주식');
  assert.strictEqual(cat(s, 'ZZDR.KS', 'ZZ 예탁증서'), '주식');
  assert.strictEqual(cat(s, 'ZZFS.KQ', 'ZZ 외국주권'), '주식');
});

test('B-2 - 이름에 ETF 브랜드가 없어도 원천 사실이 ETF면 ETF다', () => {
  const s = fresh();
  // 예전 규칙(이름 키워드)만으로는 '주식'이 됐을 이름이다.
  assert.strictEqual(cat(s, 'ZZEF.KS', 'ZZ 고배당 상품'), 'ETF');
  assert.strictEqual(cat(s, 'ZZUSETF', 'ZZ INDEX'), 'ETF');
});

test('B-3 - 마스터에 없으면 예전 이름 규칙이 그대로 동작한다(후퇴 없음)', () => {
  const s = fresh();
  assert.strictEqual(cat(s, '', '전세보증금'), '주식');       // 기존 기본값
  assert.strictEqual(cat(s, '', '국고채'), '채권');
  assert.strictEqual(cat(s, '', '달러'), '현금');
  assert.strictEqual(cat(s, '', '아파트'), '부동산');
  assert.strictEqual(cat(s, 'ZZUNKNOWN', 'TIGER 무언가'), 'ETF');
});

test('B-4 - ISIN(채권)은 원천 사실보다 먼저 판정된다(기존 정책 유지)', () => {
  const s = fresh();
  assert.strictEqual(cat(s, 'KR103502GE71', 'ZZ 국고채'), '채권');
});

/* ══════════════════ C. 국내 Market Exposure 자동 판정 ══════════════════ */

test('C - 국내 상장 주권은 원장 없이도 상장 시장 지수를 받는다(보통주 · 우선주 동일)', () => {
  const s = fresh();
  assert.strictEqual(mkt(s, 'ZZKP.KS').key, 'KOSPI');
  assert.strictEqual(mkt(s, 'ZZKQ.KQ').key, 'KOSDAQ');
  assert.strictEqual(mkt(s, 'ZZPR.KS').key, 'KOSPI');           // 우선주도 같은 시장
  assert.strictEqual(mkt(s, 'ZZKP.KS').source, 'listingMarketRuntime');
});

test('C-2 - 주권이 아닌 국내 증권은 자동 판정하지 않고 사유를 남긴다', () => {
  const s = fresh();
  assert.strictEqual(mkt(s, 'ZZEF.KS', 'ETF').source, 'etfNeedsOfficialIndex');
  assert.strictEqual(mkt(s, 'ZZRT.KS').source, 'reitExposureUnconfirmed');
  assert.strictEqual(mkt(s, 'ZZDR.KS').source, 'depositaryReceipt');
  assert.strictEqual(mkt(s, 'ZZFS.KQ').source, 'foreignListedSecurity');
  for (const t of ['ZZEF.KS', 'ZZRT.KS', 'ZZDR.KS', 'ZZFS.KQ']) assert.strictEqual(mkt(s, t, t === 'ZZEF.KS' ? 'ETF' : '주식').key, null, t);
});

/* ══════════════════ D. 미국 교차검증 ══════════════════ */

test('D - 미국 본국 보통주만 S&P500을 받는다', () => {
  const s = fresh();
  const r = mkt(s, 'ZZUSCOM');
  assert.strictEqual(r.key, 'SP500');
  assert.strictEqual(r.source, 'usExposureRuntime');
});

test('D-2 - 예탁증서는 두 원천 중 어느 쪽이 알려줘도 배제된다', () => {
  const s = fresh();
  // ① KIS 한글명에 (ADR) 표기가 있는 경우 - 거래소 증권클래스는 Common Stock이라 단독으로는 놓친다.
  assert.strictEqual(mkt(s, 'ZZADRK').source, 'depositaryReceipt');
  // ② KIS DR 필드가 Y인 경우
  assert.strictEqual(mkt(s, 'ZZADRF').source, 'depositaryReceipt');
  assert.strictEqual(mkt(s, 'ZZADRK').key, null);
  assert.strictEqual(mkt(s, 'ZZADRF').key, null);
});

test('D-3 - 예탁증서가 아닌 외국기업 직상장도 자동확정되지 않는다', () => {
  const s = fresh();
  // 거래소가 "Ordinary Shares"로 표기한 경우 - 미국 보통주가 아님이 명확하다.
  assert.strictEqual(mkt(s, 'ZZORD').key, null);
  assert.strictEqual(mkt(s, 'ZZORD').source, 'nonCommonSecurityClass');
  /* "Common Shares"(Stock이 아니다) + 외국 법인격(N.V.) 표기 - 미국 보통주로 단정할 근거가 없다.
   * 자동확정 조건은 거래소가 "Common Stock"으로 표기한 경우뿐이므로 여기 걸리지 않고 REVIEW로 간다.
   * 이 경계가 Stellantis N.V.형 오판정(자동으로 S&P500을 받는 것)을 막는다. */
  const nv = mkt(s, 'ZZNV');
  assert.strictEqual(nv.key, null, '외국 법인격 직상장은 자동으로 S&P500을 받지 않는다');
  assert.strictEqual(nv.source, 'securityClassUnrecognized');
});

test('D-4 - 증권 종류를 확정하지 못하면 자동 판정하지 않고 REVIEW 사유를 남긴다', () => {
  const s = fresh();
  const r = mkt(s, 'ZZNOCLS');
  assert.strictEqual(r.key, null);
  assert.strictEqual(r.source, 'securityClassUnrecognized');
});

test('D-5 - 미국 ETF는 공식 기초지수가 필요하다(상장 사실로 S&P500을 주지 않는다)', () => {
  const s = fresh();
  assert.strictEqual(mkt(s, 'ZZUSETF', 'ETF').key, null);
  assert.strictEqual(mkt(s, 'ZZUSETF', 'ETF').source, 'etfNeedsOfficialIndex');
});

/* ══════════════════ E. 구버전 마스터 하위호환 ══════════════════ */

test('E - 증권그룹이 없는 옛 마스터에서도 기존 판정이 유지된다(회귀 없음)', () => {
  const s = fresh();
  // 국내: 자산군이 '주식'으로 확정돼 있으면 예전처럼 상장 시장 지수를 받는다.
  assert.strictEqual(mkt(s, 'ZZOLD.KS').key, 'KOSPI');
  assert.strictEqual(mkt(s, 'ZZOLD.KS').source, 'listingMarketRuntime');
  // 미국: 예전과 똑같이 미확정이고, 사유 코드도 기존 것을 그대로 쓴다.
  const us = mkt(s, 'ZZOLDUS');
  assert.strictEqual(us.key, null);
  assert.strictEqual(us.source, 'listingDomicileUnconfirmed');
});

/* ══════════════════ F. Market · Tracking 정합성 ══════════════════ */

test('F - 같은 종목에 대해 두 베타 경로가 서로 다른 전제를 갖지 않는다', () => {
  const s = fresh();
  // v266에서는 Tracking만 KOSDAQ을 주고 Market은 미확정이었다(실측된 불일치).
  assert.strictEqual(mkt(s, 'ZZKQ.KQ').key, 'KOSDAQ');
  assert.strictEqual(trk(s, 'ZZKQ.KQ').key, 'KOSDAQ');
  // 배제 대상은 두 경로 모두 배제한다.
  assert.strictEqual(mkt(s, 'ZZADRK').key, null);
  assert.strictEqual(trk(s, 'ZZADRK').key, null);
});

/* ══════════════════ G. 통화 자동 확정 · 사용자 확정값 보호 ══════════════════ */

test('G - 통화를 공식 마스터에서 확정한다', () => {
  const s = fresh();
  const kr = plain(s.evalInSandbox(`resolveInstrumentMetadata({ ticker: 'ZZKP.KS', name: 'ZZ' })`));
  assert.strictEqual(kr.currency, 'KRW');
  const us = plain(s.evalInSandbox(`resolveInstrumentMetadata({ ticker: 'ZZUSCOM', name: 'ZZ' })`));
  assert.strictEqual(us.currency, 'USD');
});

test('G-2 - 사용자가 확정한 값이 자동 판정보다 우선한다', () => {
  const s = fresh();
  /* 이미 저장된 자산(=사용자가 저장 버튼을 눌러 확정한 값)이 있으면 그 값이 이긴다.
   * 자동 판정과 다르면 조용히 바꾸지 않고 conflicts로 알린다(PD-03). */
  s.state.assets = [{ id: 'a1', ticker: 'ZZKP.KS', name: 'ZZ 코스피주권', owner: '신랑', accountType: '일반계좌', currency: 'USD', category: '채권', categorySource: 'user' }];
  const meta = plain(s.evalInSandbox(`resolveInstrumentMetadata({ ticker: 'ZZKP.KS', name: 'ZZ 코스피주권', owner: '신랑', accountType: '일반계좌' })`));
  assert.strictEqual(meta.currency, 'USD', '사용자 확정 통화가 유지된다');
  assert.strictEqual(meta.category, '채권', '사용자 확정 자산군이 유지된다');
});

test('G-3 - 근거끼리 어긋나면 덮어쓰지 않고 충돌로 알린다', () => {
  const s = fresh();
  const meta = plain(s.evalInSandbox(`resolveInstrumentMetadata({ ticker: 'ZZKP.KS', name: 'ZZ', currency: 'USD' })`));
  assert.strictEqual(meta.currency, 'KRW', '근거 있는 값이 이긴다');
  assert.ok(Array.isArray(meta.conflicts) && meta.conflicts.some((c) => c.field === 'currency'), '충돌이 보고된다');
});

/* ══════════════════ H. 거래일 기본값 ══════════════════ */

test('H - 거래일 기본값은 주말이면 직전 영업일이다', () => {
  const s = fresh();
  const v = s.evalInSandbox('defaultTradeDateStr()');
  assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
  const day = new Date(v + 'T00:00:00').getDay();
  assert.ok(day >= 1 && day <= 5, `기본 거래일은 평일이어야 한다(실제 ${v}, 요일 ${day})`);
});

/* ══════════════════ I. 계산 모델 불변 ══════════════════ */

test('I - 이번 자동화는 판정 근거만 넓혔고 지수 상수 · 산식은 그대로다', () => {
  const s = fresh();
  assert.deepStrictEqual(plain(s.RISK_MARKET_INDEX_BY_LISTING_EXCHANGE), { KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ' });
  assert.strictEqual(s.evalInSandbox('RISK_US_EXPOSURE_MARKET_INDEX'), 'SP500');
  assert.deepStrictEqual(plain(s.RISK_ELIGIBLE_CATEGORIES), ['주식', 'ETF']);
  assert.deepStrictEqual(plain(s.NON_TRADABLE_CATEGORIES), ['채권', '현금', '부동산']);
  assert.strictEqual(s.evalInSandbox('MIN_COMMON_RISK_RETURNS'), 120);
});

test('I-2 - 채권 · 현금 · 부동산은 여전히 시장 베타 대상이 아니다', () => {
  const s = fresh();
  for (const c of ['채권', '현금', '부동산']) {
    assert.strictEqual(mkt(s, 'ZZKP.KS', c).source, 'notEquityLike', c);
  }
});
