// [C-3 근거 측정] Risk 지표별 관측기간 1년 · 2년 · 3년 비교 (PM FINAL DECISION DIRECTIVE §8)
//
// 왜 필요한가: §44 제7조는 지표별 목표 관측 수를 1Y/2Y/3Y로 정해 두었는데(js/09
// RISK_TARGET_OBSERVATIONS = technical 250 · vol/beta/corr 500 · VaR/CVaR/MDD 750),
// 실제 조회는 range='1y' 한 가지뿐이라 대부분 미달이다. 기간을 늘리면 사용자가 보는 모든 위험
// 숫자가 바뀌므로, "얼마나 바뀌는가"를 실제 시장 데이터로 먼저 재고 판단한다.
//
//   node scripts/closeout/research/risk-observation-window.js [--save]
//
// 수집한 가격은 저장하지 않는다(지표 통계만 남긴다) - 이용조건상 시계열 재배포를 하지 않기 위해서다.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'closeout', 'research', 'risk-observation-window.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 원장(js/28)에 있는 종목 중 시장 · 통화가 다른 대표 표본만 쓴다 - 전수 조회는 하지 않는다(P-8 예산).
const SAMPLE = [
  { ticker: '005930.KS', label: '국내 대형주', benchmark: '^KS11' },
  { ticker: '000660.KS', label: '국내 반도체', benchmark: '^KS11' },
  { ticker: '069500.KS', label: '국내 지수 ETF', benchmark: '^KS11' },
  { ticker: 'AAPL', label: '미국 대형주', benchmark: '^GSPC' },
  { ticker: 'TSLA', label: '미국 고변동주', benchmark: '^GSPC' },
  { ticker: 'SPYM', label: '미국 지수 ETF', benchmark: '^GSPC' }
];
const WINDOWS = [
  { name: '1y', tradingDays: 250 },
  { name: '2y', tradingDays: 500 },
  { name: '3y', tradingDays: 750 }
];

async function fetchDaily(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3y`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${ticker} HTTP ${res.status}`);
  const j = await res.json();
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  const ts = (r && r.timestamp) || [];
  const close = (r && r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (typeof close[i] === 'number' && Number.isFinite(close[i])) {
      rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: close[i] });
    }
  }
  // 일별 간격 확인 - 솎인 데이터(월별)로 지표를 계산하면 값이 통째로 틀어진다.
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / 86400);
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  if (!(median <= 5)) throw new Error(`${ticker} 일별 간격 아님(중앙값 ${median}일)`);
  return rows;
}

function returnsOf(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const p0 = rows[i - 1].close, p1 = rows[i].close;
    if (p0 > 0) out.push({ date: rows[i].date, r: p1 / p0 - 1 });
  }
  return out;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function annualVolPct(rs) {
  if (rs.length < 2) return null;
  const m = mean(rs);
  const v = rs.reduce((s, x) => s + (x - m) * (x - m), 0) / (rs.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}
function betaOf(assetRs, benchRs) {
  const n = Math.min(assetRs.length, benchRs.length);
  if (n < 2) return null;
  const a = assetRs.slice(-n), b = benchRs.slice(-n);
  const ma = mean(a), mb = mean(b);
  let cov = 0, varb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); varb += (b[i] - mb) * (b[i] - mb); }
  return varb > 0 ? cov / varb : null;
}
function varCvarPct(rs) {
  if (!rs.length) return { var95: null, cvar95: null };
  const s = [...rs].sort((x, y) => x - y);
  const idx = Math.max(0, Math.floor(s.length * 0.05) - 1);
  const tail = s.slice(0, idx + 1);
  return { var95: s[idx] * 100, cvar95: (tail.reduce((a, b) => a + b, 0) / tail.length) * 100 };
}
function mddPct(rows) {
  let peak = -Infinity, mdd = 0;
  rows.forEach((x) => { if (x.close > peak) peak = x.close; const dd = x.close / peak - 1; if (dd < mdd) mdd = dd; });
  return mdd * 100;
}

// 자산과 벤치마크의 "같은 날짜"만 남긴다 - 베타는 날짜가 어긋나면 의미가 없다.
function alignPair(aRows, bRows) {
  const bByDate = new Map(bRows.map((x) => [x.date, x.close]));
  const a = [], b = [];
  aRows.forEach((x) => { if (bByDate.has(x.date)) { a.push(x); b.push({ date: x.date, close: bByDate.get(x.date) }); } });
  return [a, b];
}

(async () => {
  const save = process.argv.includes('--save');
  const cache = new Map();
  const get = async (t) => {
    if (!cache.has(t)) { cache.set(t, await fetchDaily(t)); await new Promise((s) => setTimeout(s, 1200)); }
    return cache.get(t);
  };

  const results = [];
  for (const s of SAMPLE) {
    try {
      const [aAll, bAll] = alignPair(await get(s.ticker), await get(s.benchmark));
      const row = { ticker: s.ticker, label: s.label, benchmark: s.benchmark, availableRows: aAll.length, windows: {} };
      WINDOWS.forEach((w) => {
        const aRows = aAll.slice(-w.tradingDays), bRows = bAll.slice(-w.tradingDays);
        const aR = returnsOf(aRows).map((x) => x.r), bR = returnsOf(bRows).map((x) => x.r);
        const vc = varCvarPct(aR);
        row.windows[w.name] = {
          observations: aR.length,
          목표충족: aR.length >= (w.name === '1y' ? 250 : w.name === '2y' ? 500 : 750) - 10,
          volatilityPct: round(annualVolPct(aR)),
          beta: round(betaOf(aR, bR), 4),
          var95Pct: round(vc.var95),
          cvar95Pct: round(vc.cvar95),
          mddPct: round(mddPct(aRows))
        };
      });
      results.push(row);
      console.log(`${s.ticker} (${s.label}) · 행 ${aAll.length}`);
      WINDOWS.forEach((w) => {
        const x = row.windows[w.name];
        console.log(`   ${w.name}: obs ${x.observations} · σ ${x.volatilityPct}% · β ${x.beta} · VaR95 ${x.var95Pct}% · CVaR95 ${x.cvar95Pct}% · MDD ${x.mddPct}%`);
      });
    } catch (e) {
      results.push({ ticker: s.ticker, error: String(e.message || e) });
      console.log(`${s.ticker} 실패: ${e.message}`);
    }
  }

  // 1년 대비 변화폭 요약 - "기간을 늘리면 얼마나 달라지는가"가 이 조사의 결론이다.
  console.log('\n=== 1년 대비 변화(중앙값 절대폭) ===');
  const summary = {};
  ['volatilityPct', 'beta', 'var95Pct', 'cvar95Pct', 'mddPct'].forEach((k) => {
    ['2y', '3y'].forEach((w) => {
      const diffs = results.filter((r) => r.windows).map((r) => {
        const base = r.windows['1y'][k], cur = r.windows[w][k];
        return (typeof base === 'number' && typeof cur === 'number') ? Math.abs(cur - base) : null;
      }).filter((x) => x !== null).sort((a, b) => a - b);
      const med = diffs.length ? diffs[Math.floor(diffs.length / 2)] : null;
      summary[`${k}_${w}`] = round(med, 4);
      console.log(`  ${k} ${w}: |Δ| 중앙값 ${round(med, 4)}`);
    });
  });

  if (save) {
    const payload = {
      measuredAt: new Date().toISOString().slice(0, 10),
      note: '가격 시계열은 저장하지 않는다 - 지표 값과 관측 수만 남긴다(이용조건상 재배포 금지).',
      targets: { technical: 250, volatility: 500, beta: 500, correlation: 500, var: 750, cvar: 750, mdd: 750 },
      results, summaryAbsDiffMedian: summary
    };
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log('\n저장: ' + path.relative(ROOT, OUT));
  }
})();

function round(x, d) { return typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(d === undefined ? 2 : d)) : null; }
