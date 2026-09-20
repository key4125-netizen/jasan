// [종결 프로젝트 · 실행 묶음 B · DP-10 · DP-02 · 대장 D-7 · D-9] 지수 역사 낙폭 직접 계산
//
// 목적:
//   스트레스 낙폭을 임의 상수로 두지 않고, 실제 역사 시계열에서 직접 계산한다(계획서 §24).
//   원화 기준 낙폭(D-9)도 같은 정의로, 이미 확보한 H.10 환율만 써서 계산한다 - 새 환율 공급자를 만들지 않는다.
//
// 데이터 원천:
//   Yahoo Finance chart API. 이 앱이 이미 운영에서 쓰는 가격 원천과 같은 곳이다(js/09) - 새 외부 의존성이 아니다.
//   지수는 수준값(Index Level)을 쓴다(Index Master priceDefinition = INDEX_LEVEL · D-01).
//
// 하지 않는 것:
//   - 값을 만들어내지 않는다. 받은 종가만 쓰고, 결측일은 건너뛴다(보간 금지).
//   - 원시 시계열을 저장소에 커밋하지 않는다(계획서 §8). 해시와 집계값만 남긴다.
//
// 실행량 통제(계획서 §10 · §22): 지수 7개 · 각 1회 요청 · 요청 간 간격 · 재시도 상한 3.
//
// 사용법: node scripts/closeout/research/index-drawdowns.js [--out <경로>]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'closeout', 'research', 'index-drawdowns.json');
const FROZEN_H10 = path.join(ROOT, 'baseline', 'v262', 'data', 'usdkrw-h10.json');

const UA = 'jasan-closeout-research/1.0 (personal portfolio app)';
const REQUEST_GAP_MS = 1200;   // 요청 간 최소 간격
const MAX_RETRY = 3;
const TIMEOUT_MS = 30000;

// [중요 · 실측으로 확인] Yahoo chart API에 range=max&interval=1d를 주면 일별이 아니라 월/분기 단위로
// 솎아낸 시계열이 온다(^IXIC 42년치가 169행). 그대로 쓰면 낙폭이 실제보다 작게 나온다.
// period1/period2로 구간을 잘라 요청하면 진짜 일별이 온다(2000~2004 = 1,256행). 그래서 5년 단위로
// 나눠 받아 합친다. 아래 품질 검사(medianGapDays)가 다시 솎인 데이터를 잡아낸다.
const CHUNK_YEARS = 5;
const HISTORY_START_YEAR = 1980;

// 조사 대상. market은 원화 환산 대상 판단에만 쓴다(미국 지수만 H.10으로 환산한다).
const INDEXES = [
  { key: 'NASDAQ', symbol: '^IXIC', name: 'NASDAQ Composite', market: 'US', inIndexMaster: true },
  { key: 'SP500', symbol: '^GSPC', name: 'S&P 500', market: 'US', inIndexMaster: true },
  { key: 'NASDAQ100', symbol: '^NDX', name: 'NASDAQ-100', market: 'US', inIndexMaster: true },
  { key: 'DOW', symbol: '^DJI', name: 'Dow Jones Industrial Average', market: 'US', inIndexMaster: true },
  { key: 'KOSPI', symbol: '^KS11', name: 'KOSPI', market: 'KR', inIndexMaster: true },
  { key: 'KOSDAQ', symbol: '^KQ11', name: 'KOSDAQ', market: 'KR', inIndexMaster: true },
  // DP-02 - 아직 Index Master에 없다. 수신 · 정의 · 품질 확인 목적.
  { key: 'NYSE_COMPOSITE', symbol: '^NYA', name: 'NYSE Composite', market: 'US', inIndexMaster: false }
];

// 낙폭을 볼 구간. "전체"는 받은 이력 전부.
const WINDOWS = [
  { id: 'full', label: '전체 이력', from: null, to: null },
  { id: '2020', label: '2020년(코로나)', from: '2020-01-01', to: '2020-12-31' },
  { id: '2022', label: '2022년(금리 인상)', from: '2022-01-01', to: '2022-12-31' },
  { id: '2008', label: '2008년(금융위기 · 참고)', from: '2008-01-01', to: '2009-12-31' }
];

const stats = { requests: 0, retries: 0, failures: 0, startedAt: new Date().toISOString() };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      stats.requests++;
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === MAX_RETRY) { stats.failures++; throw e; }
      stats.retries++;
      await sleep(REQUEST_GAP_MS * Math.pow(2, attempt)); // exponential backoff
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// Yahoo 응답 → [{date, close}] (결측 종가는 버린다 - 채우지 않는다)
function toDatedCloses(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) return null;
  const closes = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
  if (!Array.isArray(closes)) return null;
  const out = [];
  r.timestamp.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c)) out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), close: c });
  });
  return { rows: out, meta: { currency: r.meta && r.meta.currency, exchange: r.meta && r.meta.fullExchangeName, instrumentType: r.meta && r.meta.instrumentType, timezone: r.meta && r.meta.exchangeTimezoneName } };
}

// 5년 단위로 나눠 받아 합친다(같은 날짜는 한 번만 남기고 날짜순 정렬).
async function fetchDailyHistory(symbol) {
  const nowYear = new Date().getUTCFullYear();
  const byDate = new Map();
  let meta = null;
  for (let y = HISTORY_START_YEAR; y <= nowYear; y += CHUNK_YEARS) {
    const p1 = Math.floor(Date.UTC(y, 0, 1) / 1000);
    const p2 = Math.floor(Date.UTC(Math.min(y + CHUNK_YEARS, nowYear + 1), 0, 1) / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;
    let json;
    try { json = await fetchJson(url); } catch { await sleep(REQUEST_GAP_MS); continue; } // 상장 전 구간은 빈 응답/에러가 정상이다
    const parsed = toDatedCloses(json);
    if (parsed) {
      if (!meta) meta = parsed.meta;
      parsed.rows.forEach((r) => byDate.set(r.date, r.close));
    }
    await sleep(REQUEST_GAP_MS);
  }
  const rows = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close }));
  return { rows, meta };
}

// 품질 검사 - 값을 고치지 않고 사실만 기록한다.
function quality(rows) {
  let duplicates = 0, outOfOrder = 0, nonPositive = 0;
  const seen = new Set();
  const gaps = [];
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(rows[i].date)) duplicates++; else seen.add(rows[i].date);
    if (i > 0 && rows[i].date <= rows[i - 1].date) outOfOrder++;
    if (i > 0) gaps.push((Date.parse(rows[i].date) - Date.parse(rows[i - 1].date)) / 86400000);
    if (!(rows[i].close > 0)) nonPositive++;
  }
  gaps.sort((a, b) => a - b);
  const medianGapDays = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  return {
    rowCount: rows.length, startDate: rows.length ? rows[0].date : null, endDate: rows.length ? rows[rows.length - 1].date : null,
    duplicates, outOfOrder, nonPositive, medianGapDays,
    maxGapDays: gaps.length ? gaps[gaps.length - 1] : null,
    // 일별 시계열인지 - 중앙 간격이 5일을 넘으면 솎인 데이터이므로 낙폭 계산에 쓰지 않는다.
    dailyCadence: medianGapDays !== null && medianGapDays <= 5
  };
}

// 종가 기준 최대 낙폭 - 직전 최고 종가 대비 하락률의 최솟값.
//   drawdown(t) = close(t) / max(close(0..t)) - 1,  MDD = min drawdown
function maxDrawdown(rows) {
  if (rows.length < 2) return null;
  let peak = rows[0], peakForTrough = rows[0], worst = 0, trough = null;
  rows.forEach((r) => {
    if (r.close > peak.close) peak = r;
    const dd = r.close / peak.close - 1;
    if (dd < worst) { worst = dd; trough = r; peakForTrough = peak; }
  });
  if (!trough) return { drawdownPct: 0, peakDate: rows[0].date, peakClose: rows[0].close, troughDate: rows[0].date, troughClose: rows[0].close };
  return {
    drawdownPct: Number((worst * 100).toFixed(4)),
    peakDate: peakForTrough.date, peakClose: Number(peakForTrough.close.toFixed(4)),
    troughDate: trough.date, troughClose: Number(trough.close.toFixed(4))
  };
}

function slice(rows, from, to) {
  return rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
}

// 원화 환산(§44 44-15 · D-9): 지수 수준 × 같은 날짜의 H.10. 환율이 없는 날은 버린다(보간 · 앞값 채우기 금지).
function toKrw(rows, fx) {
  const out = [];
  rows.forEach((r) => { const rate = fx.get(r.date); if (typeof rate === 'number') out.push({ date: r.date, close: r.close * rate }); });
  return out;
}

async function main() {
  const h10 = JSON.parse(fs.readFileSync(FROZEN_H10, 'utf8'));
  const fx = new Map();
  (h10.rates || []).forEach(([d, v]) => { if (typeof v === 'number' && Number.isFinite(v)) fx.set(d, v); });

  const results = [];
  for (const idx of INDEXES) {
    const urlPattern = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?period1=<from>&period2=<to>&interval=1d (${CHUNK_YEARS}년 단위 분할)`;
    let entry = { key: idx.key, symbol: idx.symbol, name: idx.name, market: idx.market, inIndexMaster: idx.inIndexMaster, source: 'Yahoo Finance chart API', url: urlPattern, retrievedAt: new Date().toISOString() };
    try {
      const parsed = await fetchDailyHistory(idx.symbol);
      if (!parsed || parsed.rows.length === 0) throw new Error('종가 시계열이 비어 있다');
      const rows = parsed.rows;
      entry.meta = parsed.meta;
      entry.quality = quality(rows);
      if (!entry.quality.dailyCadence) throw new Error(`일별 시계열이 아니다(중앙 간격 ${entry.quality.medianGapDays}일) - 낙폭을 계산하지 않는다`);
      entry.seriesSha256 = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      entry.drawdowns = {};
      WINDOWS.forEach((w) => {
        const part = slice(rows, w.from, w.to);
        entry.drawdowns[w.id] = part.length < 2
          ? { label: w.label, available: false, reason: '해당 구간 관측치 부족' }
          : Object.assign({ label: w.label, available: true, observations: part.length, from: part[0].date, to: part[part.length - 1].date }, maxDrawdown(part));
      });
      if (idx.market === 'US') {
        const krwRows = toKrw(rows, fx);
        entry.krw = { basis: 'FRB H.10 USD/KRW (v262 frozen snapshot)', fxEndDate: h10.endDate, matchedObservations: krwRows.length, drawdowns: {} };
        WINDOWS.forEach((w) => {
          const part = slice(krwRows, w.from, w.to);
          entry.krw.drawdowns[w.id] = part.length < 2
            ? { label: w.label, available: false, reason: '환율과 함께 있는 관측치 부족' }
            : Object.assign({ label: w.label, available: true, observations: part.length, from: part[0].date, to: part[part.length - 1].date }, maxDrawdown(part));
        });
      }
      entry.status = 'ACCESS_VERIFIED';
    } catch (e) {
      entry.status = 'FETCH_FAILED';
      entry.error = String(e && e.message ? e.message : e);
    }
    results.push(entry);
    console.log(`${entry.status === 'ACCESS_VERIFIED' ? '✓' : '✗'} ${idx.key} (${idx.symbol}) ${entry.quality ? `${entry.quality.rowCount}행 ${entry.quality.startDate}~${entry.quality.endDate} · 전체낙폭 ${entry.drawdowns.full.drawdownPct}%` : entry.error}`);
    await sleep(REQUEST_GAP_MS);
  }

  stats.finishedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    title: '지수 역사 낙폭 직접 계산 (DP-10 · DP-02 · 대장 D-7 · D-9)',
    definition: {
      priceBasis: '지수 수준값(종가). 배당 재투자를 더하지 않는다 - 지수가 PR이면 PR 그대로다.',
      formula: 'drawdown(t) = close(t) / max(close(0..t)) - 1 · MDD = min drawdown (구간 내에서 다시 계산)',
      missing: '종가가 없는 날은 제외한다. 보간 · 앞값 채우기를 하지 않는다.',
      krw: '미국 지수는 같은 날짜의 FRB H.10 USD/KRW를 곱해 원화 수준을 만든 뒤 같은 식으로 계산한다(§44 44-15). 환율이 없는 날은 제외한다.'
    },
    dataUse: 'Yahoo Finance는 이 앱이 이미 운영에서 쓰는 가격 원천이다(js/09). 원시 시계열은 저장하지 않고 해시와 집계값만 남긴다.',
    execution: stats,
    indexes: results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n✓ 기록: ${path.relative(ROOT, OUT)} · 요청 ${stats.requests} · 재시도 ${stats.retries} · 실패 ${stats.failures}`);
}

main().catch((e) => { console.error('✗ 실패:', e); process.exit(1); });
