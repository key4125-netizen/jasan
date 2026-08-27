/* -------------------------------------------------------------------------
 * 21. [한국투자증권(KIS) 재무/수급 데이터] 국내주식 전용 - PER/PBR/ROE/매출·영업이익·순이익/외국인·기관
 *    수급 동향을 cloudflare-worker-kis-proxy.js(개인 Worker, KIS API를 대신 호출) 경유로 받아와
 *    종목 상세 모달/종목 분석 모달에 사실 그대로 보여준다. 계산이나 판단(저평가/고평가 등)은 전혀
 *    섞지 않는다 - 이 프로젝트 전체가 지키는 "투자 판단은 사용자 몫, 앱은 사실만" 원칙을 그대로
 *    따른다(§18-3 리스크 진단, §18-6 종목 분석 리포트와 동일한 방침).
 *    - "엔진"(이 파일의 fetch/캐시 함수)과 "번역"(HTML 렌더링 함수)을 분리하지 않고 한 파일에 둔
 *      이유: 아직 이 기능 하나 뿐이라 09/10처럼 엔진·번역을 나눌 만큼 분량이 크지 않다 - 나중에
 *      커지면 그때 분리해도 늦지 않는다(불필요한 조기 추상화를 피한다).
 * ---------------------------------------------------------------------- */

// [국내 종목코드 추출] KIS API는 국내주식 전용이라 6자리 종목코드가 필요하다 - 이 앱 전역에서 쓰는
// yahooTicker 표기(예: '005930.KS', '005930.KQ')에서 코드만 뽑아낸다. 해외 티커거나 티커 자체가
// 없으면 null을 반환해 호출부가 KIS 조회를 아예 시도하지 않게 한다.
function extractKisDomesticCode(rawTicker) {
  const s = sanitizeTicker(rawTicker);
  if (s.isDomestic !== '국내') return null;
  const m = s.yahooTicker.match(/^(\d{6})\.(KS|KQ)$/);
  return m ? m[1] : null;
}

// [공통 Worker 호출] 실패해도(네트워크 오류/401/502 등) 예외를 던지지 않고 null을 반환한다 - 재무
// 데이터는 어디까지나 참고용 부가 정보라, 조회에 실패해도 화면의 다른 부분(가격/보유정보/리스크
// 진단)에는 영향이 없어야 한다.
async function kisProxyFetch(path, code, extraParams) {
  try {
    const url = new URL(KIS_PROXY_URL + path);
    url.searchParams.set('ticker', code);
    Object.entries(extraParams || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: { 'X-App-Secret': KIS_CLIENT_SHARED_SECRET } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchKisPriceSnapshot(code) { return kisProxyFetch('/api/kis/price', code); }
async function fetchKisFundamentalsRaw(code) { return kisProxyFetch('/api/kis/fundamentals', code); }
async function fetchKisInvestorFlowRaw(code) { return kisProxyFetch('/api/kis/investor-flow', code); }

// [당일 캐시] getCachedDailyCloses(js/09)와 완전히 같은 패턴 - 하루 안에는 다시 조회하지 않는다.
// 세 가지를 동시에 요청해 왕복 시간을 줄인다.
async function getCachedKisData(yahooTicker) {
  const code = extractKisDomesticCode(yahooTicker);
  if (!code) return null;
  const today = new Date().toISOString().slice(0, 10);
  const cached = state.fundamentalCache[yahooTicker];
  if (cached && cached.date === today) return cached;

  const [price, fundamentals, investorFlow] = await Promise.all([
    fetchKisPriceSnapshot(code),
    fetchKisFundamentalsRaw(code),
    fetchKisInvestorFlowRaw(code)
  ]);
  const data = { date: today, price, fundamentals, investorFlow };
  state.fundamentalCache[yahooTicker] = data;
  return data;
}

// [단위 안내] KIS 응답의 매출액/영업이익/순이익(income-statement)과 자산·부채·자본총계(balance-sheet)는
// 관례상 백만원 단위로 내려오는 것으로 알려져 있으나, 이 프로젝트에서 실제 응답으로 직접 확인하기
// 전까지는 확정이 아니다 - 그래서 임의로 "억원"/"조원" 등으로 환산 표기하지 않고 받은 숫자에 쉼표만
// 붙여 "(단위: KIS 제공 그대로)"라고 명시해 보여준다. 실제 응답을 확인한 뒤 이 부분만 고치면 된다.
function fmtKisRaw(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '데이터 없음';
}
function fmtKisPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '데이터 없음';
  return (n >= 0 ? '+' : '') + numFmt2.format(n) + '%';
}

function fundamentalMetricTileHtml(label, value) {
  return `<div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-2">
    <p class="text-[11px] text-slate-400">${escapeHtml(label)}</p>
    <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${value}</p>
  </div>`;
}

function buildFundamentalCardHtml(kis) {
  const p = kis.price;
  const f = kis.fundamentals;
  if (!p && !f) {
    return '<p class="text-xs text-amber-600 dark:text-amber-400 py-2">KIS 재무 데이터를 불러오지 못했습니다(일시적 오류일 수 있습니다).</p>';
  }
  return `
  <div>
    <p class="text-sm font-semibold text-slate-400 mb-1.5">📊 재무 펀더멘털 ${f && f.period ? `<span class="text-xs font-normal text-slate-400">(결산 ${escapeHtml(String(f.period))} 기준)</span>` : ''}</p>
    <div class="grid grid-cols-3 gap-1.5">
      ${fundamentalMetricTileHtml('PER', p ? fmtKisRaw(p.per) : '데이터 없음')}
      ${fundamentalMetricTileHtml('PBR', p ? fmtKisRaw(p.pbr) : '데이터 없음')}
      ${fundamentalMetricTileHtml('시가총액(억원)', p ? fmtKisRaw(p.marketCapEok) : '데이터 없음')}
      ${fundamentalMetricTileHtml('ROE', f ? fmtKisPct(f.roePct) : '데이터 없음')}
      ${fundamentalMetricTileHtml('부채비율', f ? fmtKisPct(f.debtRatioPct) : '데이터 없음')}
      ${fundamentalMetricTileHtml('EPS', p ? fmtKisRaw(p.eps) : '데이터 없음')}
    </div>
    ${f ? `
    <div class="grid grid-cols-3 gap-1.5 mt-1.5">
      ${fundamentalMetricTileHtml('매출액(전년비)', `${fmtKisRaw(f.revenue)} <span class="text-xs font-normal">(${fmtKisPct(f.revenueGrowthPct)})</span>`)}
      ${fundamentalMetricTileHtml('영업이익(전년비)', `${fmtKisRaw(f.operatingIncome)} <span class="text-xs font-normal">(${fmtKisPct(f.operatingIncomeGrowthPct)})</span>`)}
      ${fundamentalMetricTileHtml('순이익(전년비)', `${fmtKisRaw(f.netIncome)} <span class="text-xs font-normal">(${fmtKisPct(f.netIncomeGrowthPct)})</span>`)}
    </div>
    <p class="text-[10px] text-slate-300 dark:text-slate-600 mt-1.5">매출·영업이익·순이익 단위는 KIS가 제공하는 원본 숫자 그대로입니다(별도 환산 없음).</p>` : ''}
  </div>`;
}

function buildInvestorFlowCardHtml(kis) {
  const iv = kis.investorFlow;
  if (!iv) {
    return '<p class="text-xs text-amber-600 dark:text-amber-400 py-2">수급 동향 데이터를 불러오지 못했습니다(일시적 오류일 수 있습니다).</p>';
  }
  const sign = (n) => (typeof n === 'number' && n >= 0 ? '+' : '');
  const qty = (n) => (typeof n === 'number' ? `${sign(n)}${n.toLocaleString('ko-KR')}주` : '데이터 없음');
  return `
  <div class="mt-3">
    <p class="text-sm font-semibold text-slate-400 mb-1.5">🏦 외국인 &amp; 기관 수급 동향</p>
    <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
      최근 5일간 외국인 ${qty(iv.foreignNet5d)} 순매수 / 기관 ${qty(iv.institutionNet5d)} 순매수
    </p>
    <p class="text-xs text-slate-400 mt-1">최근 20일 누적: 외국인 ${qty(iv.foreignNet20d)} · 기관 ${qty(iv.institutionNet20d)}</p>
  </div>`;
}

// [종목 상세 모달 + 종목 분석 모달 공용] 두 화면(assetDetailModal/stockAnalysisModal)이 이 함수 하나를
// 그대로 공유한다 - sectionId/bodyId만 다르게 넘기면 된다. 해외 티커거나 티커가 없는 자산(부동산/현금
// 등)이면 영역 자체를 숨긴다(KIS는 국내주식만 지원).
let fundamentalSectionRequestToken = 0;
async function attachFundamentalSection(rawTicker, sectionId, bodyId) {
  const section = document.getElementById(sectionId);
  const body = document.getElementById(bodyId);
  if (!section || !body) return;

  const code = extractKisDomesticCode(rawTicker);
  if (!code) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  body.innerHTML = `
    <div class="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
      <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
      <span class="text-xs">재무·수급 데이터를 불러오는 중...</span>
    </div>`;
  lucide.createIcons();

  const token = ++fundamentalSectionRequestToken;
  const kis = await getCachedKisData(rawTicker);
  if (token !== fundamentalSectionRequestToken) return; // 그 사이 다른 종목으로 바뀌어 늦게 도착한 응답 - 버림

  if (!kis) {
    body.innerHTML = '<p class="text-xs text-amber-600 dark:text-amber-400 py-2">KIS 데이터를 불러오지 못했습니다(일시적 오류일 수 있습니다).</p>';
    return;
  }
  body.innerHTML = buildFundamentalCardHtml(kis) + buildInvestorFlowCardHtml(kis);
  lucide.createIcons();
}
