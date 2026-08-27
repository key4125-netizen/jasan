/* -------------------------------------------------------------------------
 * 26. [개별 채권 관리] 채권 현황 모달 - 총평가액/총손익/연간 이자수입 요약, 보유 채권 리스트,
 *    선택 종목 지표 카드(만기일/이표주기/YTM/표면금리), 이자 지급 현금흐름 타임라인.
 *    데이터 소스는 두 갈래다: 시세(currentPrice)는 이미 js/11 fetchAllPrices가 KIS 채권 시세로
 *    갱신해 state.assets에 채워두므로 여기서 새로 조회하지 않는다 - 발행정보(만기/표면금리/이자지급일)
 *    만 이 파일에서 getCachedBondInfo(js/13)로 온디맨드 조회한다(가격보다 훨씬 무거운 정적 정보라
 *    모달을 열 때만 가져옴).
 *    [KIS 응답 필드명 - 미검증] cloudflare-worker-kis-proxy.js의 handleBondInfo/handleBondPrice가
 *    추정한 필드명이 실제와 다르면 이 파일의 화면 요소들이 "정보 없음"으로 비어 보일 수 있다 - 데이터
 *    로직 문제가 아니라 그 Worker 파일의 필드 추출부를 고쳐야 하는 문제다.
 * ---------------------------------------------------------------------- */

// [보유 채권 통합] 같은 ISIN을 여러 소유자가 나눠 가진 경우 하나의 종목으로 합산해 리스트에 보여준다
// (openAssetDetailModalGroup과 비슷한 취지지만, 여기서는 소유자별 세부 내역까지 펼치지 않고 종목
// 단위 합계만 필요하다 - 이 모달의 목적이 "채권 전체 현황 한눈에 보기"이지 개별 계좌 내역 조회가
// 아니므로).
function computeBondHoldings() {
  const byIsin = {};
  state.assets.forEach((a) => {
    if (a.category !== '채권' || !isBondTicker(a.ticker) || num(a.quantity) <= 0) return;
    const r = calcRow(a);
    if (!byIsin[a.ticker]) {
      byIsin[a.ticker] = { isin: a.ticker, name: a.name, quantity: 0, buyAmount: 0, curAmount: 0, currentPrice: a.currentPrice, info: null };
    }
    const g = byIsin[a.ticker];
    g.quantity += num(a.quantity); // "10,000원 액면 단위" 수량(거래 입력 시 액면가÷10000으로 저장됨)
    g.buyAmount += r.buyAmount;
    g.curAmount += r.curAmount;
    if (Number.isFinite(a.currentPrice)) g.currentPrice = a.currentPrice;
  });
  return Object.values(byIsin).sort((a, b) => b.curAmount - a.curAmount);
}

// [날짜 파싱] KIS 날짜 필드가 'YYYYMMDD'(구분자 없음, KIS 관례) 또는 'YYYY-MM-DD' 어느 쪽으로 올지
// 실제 응답으로 확인하지 못해 둘 다 받아들인다. 파싱 실패하면 null.
function parseKisDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatKisDate(raw) {
  const d = parseKisDate(raw);
  if (!d) return '정보 없음';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
// D-day(오늘 기준 잔존일수) - 만기가 지났으면 음수.
function ddayFromDate(raw) {
  const d = parseKisDate(raw);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// [연간 이자수입] 액면가(원) × 표면금리(%) - 이자지급주기와 무관하게 "연 환산" 총액이다(이표주기가
// 다른 채권끼리도 합산 비교가 가능하도록). quantity는 "1만원 단위"로 저장돼 있으므로 ×10000으로
// 실제 액면가(원)를 복원한다(거래 입력 시 액면가÷10000으로 저장한 것의 역변환 - js/06 참고).
function bondAnnualInterest(holding) {
  const coupon = holding.info && Number.isFinite(holding.info.couponRatePct) ? holding.info.couponRatePct : null;
  if (coupon === null) return null;
  const faceValueWon = holding.quantity * 10000;
  return faceValueWon * (coupon / 100);
}

function bondDetailStatTileHtml(label, valueText, sub) {
  return `
  <div class="border border-slate-100 dark:border-slate-800 rounded-lg p-2.5">
    <p class="text-[10px] text-slate-400 mb-0.5">${escapeHtml(label)}</p>
    <p class="text-sm font-semibold">${valueText}</p>
    ${sub ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(sub)}</p>` : ''}
  </div>`;
}

function renderBondDetailSummary(holdings) {
  const totalCur = holdings.reduce((s, h) => s + h.curAmount, 0);
  const totalBuy = holdings.reduce((s, h) => s + h.buyAmount, 0);
  const totalProfit = totalCur - totalBuy;
  const totalProfitPct = totalBuy !== 0 ? (totalProfit / totalBuy) * 100 : 0;
  // 발행정보를 못 받아온 채권(coupon null)은 연간이자 합산에서 제외하고, 하나라도 빠지면 "일부 종목
  // 제외" 안내를 붙인다 - 실제보다 적은 값을 마치 정확한 총액인 것처럼 보여주지 않기 위함.
  let interestTotal = 0, interestKnownCount = 0;
  holdings.forEach((h) => {
    const ai = bondAnnualInterest(h);
    if (ai !== null) { interestTotal += ai; interestKnownCount++; }
  });
  const interestNote = interestKnownCount < holdings.length ? `(정보 확인된 ${interestKnownCount}/${holdings.length}종목 기준)` : null;

  document.getElementById('bondDetailSummary').innerHTML = [
    bondDetailStatTileHtml('총평가액', fmtKRW(totalCur)),
    bondDetailStatTileHtml('총손익률', `<span class="${profitColor(totalProfit)}">${fmtSigned(totalProfit)}</span>`, `${fmtPct(totalProfitPct)}`),
    bondDetailStatTileHtml('연간 예상 이자수입', interestKnownCount > 0 ? fmtKRW(interestTotal) : '정보 없음', interestNote)
  ].join('');
}

let bondDetailSelectedIsin = null;

function renderBondDetailList(holdings) {
  document.getElementById('bondDetailList').innerHTML = holdings.map((h) => {
    const profit = h.curAmount - h.buyAmount;
    const dday = h.info ? ddayFromDate(h.info.maturityDate) : null;
    const ddayText = dday === null ? '' : (dday >= 0 ? `D-${dday}` : '만기 경과');
    const coupon = h.info && Number.isFinite(h.info.couponRatePct) ? `표면 ${h.info.couponRatePct}%` : '';
    const selected = h.isin === bondDetailSelectedIsin;
    return `
    <button type="button" data-bond-isin="${escapeHtml(h.isin)}"
      class="w-full text-left border rounded-lg px-3 py-2.5 transition-colors ${selected ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700'}">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium truncate">${escapeHtml(h.name || h.isin)}</span>
        <span class="text-sm font-semibold ${profitColor(profit)} shrink-0">${fmtKRW(h.curAmount)}</span>
      </div>
      <div class="flex items-center justify-between gap-2 mt-0.5">
        <span class="text-[11px] text-slate-400">액면 ${fmtKRW(h.quantity * 10000)} · 현재단가 ${Number.isFinite(h.currentPrice) ? fmtNum(h.currentPrice, 2) : '조회 중'}</span>
        <span class="text-[11px] text-slate-400 shrink-0">${escapeHtml([ddayText, coupon].filter(Boolean).join(' · '))}</span>
      </div>
    </button>`;
  }).join('');
  document.getElementById('bondDetailList').querySelectorAll('button[data-bond-isin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bondDetailSelectedIsin = btn.dataset.bondIsin;
      const holdings2 = computeBondHoldings();
      holdings2.forEach((h) => { h.info = bondDetailHoldingsInfoMap[h.isin] || null; });
      renderBondDetailList(holdings2); // 선택 강조 다시 그림
      renderBondIndicatorCards(holdings2.find((h) => h.isin === bondDetailSelectedIsin));
    });
  });
}

function renderBondIndicatorCards(holding) {
  const title = document.getElementById('bondDetailIndicatorTitle');
  const cards = document.getElementById('bondDetailIndicatorCards');
  if (!holding) { cards.innerHTML = ''; return; }
  title.textContent = `📊 채권 지표 - ${holding.name || holding.isin}`;
  const info = holding.info;
  const dday = info ? ddayFromDate(info.maturityDate) : null;
  cards.innerHTML = [
    bondDetailStatTileHtml('만기일', info ? formatKisDate(info.maturityDate) : '조회 중', dday !== null ? (dday >= 0 ? `D-${dday}` : '만기 경과') : null),
    bondDetailStatTileHtml('이표주기', info && Number.isFinite(info.paymentFreqMonths) ? `${info.paymentFreqMonths}개월마다` : '정보 없음'),
    bondDetailStatTileHtml('만기수익률(YTM)', info && Number.isFinite(info.yieldPct) ? `${info.yieldPct}%` : '정보 없음', '수익비율(KIS) 기준 - 참고용'),
    bondDetailStatTileHtml('표면금리', info && Number.isFinite(info.couponRatePct) ? `${info.couponRatePct}%` : '정보 없음')
  ].join('');
}

// [이자 지급일 스케줄 계산] KIS가 미래 전체 스케줄을 내려주지 않으므로, "차기이자지급일"을 시작점 삼아
// 이표주기(개월)만큼 반복해서 만기일까지 직접 생성한다 - 단순 등간격 가정(콜옵션/변동금리 등 예외
// 케이스는 반영하지 않음, 화면에도 참고용임을 명시).
function buildCouponSchedule(holding, maxCount) {
  const info = holding.info;
  if (!info || !Number.isFinite(info.paymentFreqMonths) || info.paymentFreqMonths <= 0) return [];
  const start = parseKisDate(info.nextCouponDate);
  const maturity = parseKisDate(info.maturityDate);
  if (!start) return [];
  const perPayment = bondAnnualInterest(holding) !== null ? bondAnnualInterest(holding) * (info.paymentFreqMonths / 12) : null;
  const schedule = [];
  let cursor = new Date(start);
  for (let i = 0; i < (maxCount || 60); i++) {
    if (maturity && cursor > maturity) break;
    schedule.push({ date: new Date(cursor), amount: perPayment, isin: holding.isin, name: holding.name });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + info.paymentFreqMonths, cursor.getDate());
  }
  return schedule;
}

function renderBondCashFlow(holdings) {
  const withInfo = holdings.filter((h) => h.info);
  const allSchedules = withInfo.flatMap((h) => buildCouponSchedule(h, 40));
  const now = new Date();
  const yearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  const next12mTotal = allSchedules
    .filter((s) => s.date >= now && s.date <= yearFromNow)
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const monthlyAvg = next12mTotal / 12;

  document.getElementById('bondDetailCashFlowSummary').innerHTML = [
    bondDetailStatTileHtml('향후 12개월 예상 이자', withInfo.length > 0 ? fmtKRW(next12mTotal) : '정보 없음'),
    bondDetailStatTileHtml('월평균 환산', withInfo.length > 0 ? fmtKRW(monthlyAvg) : '정보 없음')
  ].join('');

  const upcoming = allSchedules
    .filter((s) => s.date >= now)
    .sort((a, b) => a.date - b.date)
    .slice(0, 8);
  const timelineEl = document.getElementById('bondDetailCashFlowTimeline');
  if (upcoming.length === 0) {
    timelineEl.innerHTML = '<p class="text-xs text-slate-400 py-2">예정된 이자 지급일 정보가 없습니다.</p>';
    return;
  }
  timelineEl.innerHTML = upcoming.map((s) => {
    const dday = Math.round((s.date - now) / 86400000);
    return `
    <div class="flex items-center justify-between gap-2 text-xs border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
      <span class="min-w-0 truncate">${escapeHtml(s.name || s.isin)}</span>
      <span class="shrink-0 text-slate-400">${s.date.getFullYear()}.${String(s.date.getMonth() + 1).padStart(2, '0')}.${String(s.date.getDate()).padStart(2, '0')} (D-${dday})</span>
      <span class="shrink-0 font-medium">${s.amount !== null ? fmtKRW(s.amount) : '-'}</span>
    </div>`;
  }).join('');
}

// [발행정보 캐시 조회 결과를 재사용] renderBondDetailList의 클릭 핸들러가 다시 그릴 때마다 매번
// getCachedBondInfo를 새로 부르지 않도록, 모달을 열 때 한 번 받아온 결과를 이 모듈 변수에 잠깐 담아둔다.
let bondDetailHoldingsInfoMap = {};

async function openBondDetailModal() {
  const holdings = computeBondHoldings();
  if (holdings.length === 0) {
    showToast('보유 중인 채권이 없습니다.', 'info');
    return;
  }
  document.getElementById('bondDetailModal').classList.remove('hidden');
  pushModalHistoryState();
  document.getElementById('bondDetailSummary').innerHTML = '<p class="col-span-3 text-xs text-slate-400 text-center py-4">채권 발행정보 조회 중...</p>';
  document.getElementById('bondDetailList').innerHTML = '';
  document.getElementById('bondDetailIndicatorCards').innerHTML = '';
  document.getElementById('bondDetailCashFlowSummary').innerHTML = '';
  document.getElementById('bondDetailCashFlowTimeline').innerHTML = '';

  const infos = await Promise.all(holdings.map((h) => getCachedBondInfo(h.isin)));
  holdings.forEach((h, i) => { h.info = infos[i]; });
  bondDetailHoldingsInfoMap = {};
  holdings.forEach((h) => { bondDetailHoldingsInfoMap[h.isin] = h.info; });

  if (!bondDetailSelectedIsin || !holdings.some((h) => h.isin === bondDetailSelectedIsin)) {
    bondDetailSelectedIsin = holdings[0].isin;
  }
  renderBondDetailSummary(holdings);
  renderBondDetailList(holdings);
  renderBondIndicatorCards(holdings.find((h) => h.isin === bondDetailSelectedIsin));
  renderBondCashFlow(holdings);
  lucide.createIcons();
}

function closeBondDetailModal(viaBackButton) {
  document.getElementById('bondDetailModal').classList.add('hidden');
  if (!viaBackButton) popModalHistoryIfNeeded();
}
document.getElementById('closeBondDetailModalBtn').addEventListener('click', () => closeBondDetailModal());
document.getElementById('bondDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'bondDetailModal') closeBondDetailModal();
});

// [KPI 카드 하단 '채권' 태그 클릭 진입점] renderKpiBreakdown(js/02)이 '채권' 항목에만
// data-open-bond-detail을 붙여준다 - 위임 리스너 하나로 어느 KPI 카드의 태그를 눌러도 동일하게 연다
// (기존 data-open-stock-detail 패턴과 동일한 방식, js/08 참고).
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-open-bond-detail]');
  if (!el) return;
  openBondDetailModal();
});
