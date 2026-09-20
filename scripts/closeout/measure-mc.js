// [v262 Closeout] 동일 seed Monte Carlo 전후 측정기 (PM EXECUTION DIRECTIVE 2026-09-20 §5)
//
//   node scripts/closeout/measure-mc.js            현재 저장소 상태로 측정해 결과를 출력한다
//   node scripts/closeout/measure-mc.js --json      기계 판독용 JSON만 출력한다
//   node scripts/closeout/measure-mc.js --save <라벨>  docs/closeout/measurements/mc-<라벨>.json 으로 저장한다
//   node scripts/closeout/measure-mc.js --compare <라벨A> <라벨B>  저장된 두 측정을 비교한다
//
// 왜 필요한가: CMA 교체(C-1) · 채권 자산군 연결(BOND-4)은 둘 다 MC 분포를 바꾼다. 두 변경이 한 번에
// 섞이면 어느 쪽이 얼마를 움직였는지 말할 수 없으므로, 단계마다 같은 seed · 같은 포트폴리오로 재고
// 그 숫자를 저장해 둔다. 사용자 실제 보유 자산은 쓰지 않는다 - 원장(js/28)의 종목 사실만 써서
// 합성 포트폴리오(ZZ 접두어)를 만든다.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'docs', 'closeout', 'measurements');
const { loadAdapterSandbox } = require(path.join(ROOT, 'test', 'mc-adapter-sandbox.js'));
const EM = require(path.join(ROOT, 'js', '28-exposure-master.js'));

const SEED = 20260101;
const ITERATIONS = 2000;
const YEARS = 20;
const PV0 = 100000000;
const MONTHLY = 1000000;

const bare = (t) => String(t).replace(/\.KS$/, '');
const isForeign = (e) => ['FOREIGN_STOCK', 'FOREIGN_LISTED_ETF'].includes(e.assetType);
const isStock = (e) => e.assetType === 'KR_STOCK' || e.assetType === 'FOREIGN_STOCK';

// 원장 49건(EM-2026.1) + SCHD - 기존 측정과 같은 구성이어야 비교가 성립한다.
function equityEntries() {
  return EM.EXPOSURE_MASTER_ENTRIES.filter((e) => e.version === 'EM-2026.1' || e.ticker === 'SCHD');
}

// [BOND-4 측정용] 합성 채권 3종 - 실제 보유 종목이 아니다(ZZ 접두어 · 가상 발행인).
// 세 번째는 "환헤지 미확인 외화채"로, MC에 연결되지 않고 제외돼야 한다는 것을 함께 확인한다.
const SYNTHETIC_BONDS = [
  { name: 'ZZ 국고채권 10년(합성)', bondType: '국채', currency: 'KRW', couponRate: 3.5, maturityDate: '2034-03-10' },
  { name: 'ZZ 회사채 3년(합성)', bondType: '회사채', currency: 'KRW', couponRate: 4.2, maturityDate: '2028-06-01' },
  { name: 'ZZ 미국국채(합성 · 헤지 미확인)', bondType: '국채', currency: 'USD', couponRate: 4.0, maturityDate: '2032-05-15' }
];

function buildSandbox(options) {
  const opt = options || {};
  const sb = loadAdapterSandbox();
  const S = sb.state;
  S.assets = []; S.transactions = []; S.exchangeRate = 1400;
  S.projection.customScenarioRates = { ZZKEY: { conservative: 4, normal: 6, optimistic: 8 } };
  S.projection.customFeeRates = {};
  S.projection.monthlyContributionByOwner = { '신랑': { total: 0, years: null, allocation: [] }, '와이프': { total: 0, years: null, allocation: [] } };
  S.projection.contributionGrowthRate = 0;
  S.projection.inflationRate = 2.5;
  S.projection.taxAdvantagedPlan = {
    yearsByOwner: { '신랑': 0, '와이프': 0 }, monthlyByOwner: { '신랑': 0, '와이프': 0 },
    allocationByOwner: { '신랑': [], '와이프': [] }, contributionByOwnerAccount: { '신랑': [], '와이프': [] }
  };
  ['신랑', '와이프'].forEach((o) => { S.rebalance[o].domestic = { '국내': 50, '해외': 50 }; S.rebalance[o].targets = { '국내': [], '해외': [] }; });
  sb.getCachedDailyCloses = async () => { throw new Error('측정 중 가격 조회가 발생했다 - 측정은 가격 이력을 쓰지 않아야 한다'); };

  const equities = equityEntries();
  S.assets = equities.map((e) => sb.makeAsset({
    ticker: bare(e.ticker), name: `ZZ ${bare(e.ticker)}`, category: isStock(e) ? '주식' : 'ETF',
    owner: '신랑', accountType: '일반계좌', quantity: 1, buyPrice: 1e7, currentPrice: 1e7,
    currency: isForeign(e) ? 'USD' : 'KRW', isDomestic: isForeign(e) ? '해외' : '국내', rateMatchOverride: 'ZZKEY'
  }));
  if (opt.withBonds) {
    S.bondPositions = [];
    SYNTHETIC_BONDS.forEach((b) => {
      const asset = sb.makeAsset({
        ticker: '', name: b.name, category: '채권', owner: '신랑', accountType: '일반계좌',
        quantity: 1, buyPrice: 1e7, currentPrice: 1e7, currency: 'KRW', isDomestic: '국내'
      });
      S.assets.push(asset);
      // 성격 세분은 채권 레코드가 있을 때만 일어난다(js/29 · §47-3) - 자산에 성격을 직접 박지 않는다.
      S.bondPositions.push(sb.evalInSandbox('makeBondPosition')({
        assetId: asset.id,
        identity: { instrumentName: b.name, bondType: b.bondType, currency: b.currency },
        terms: { issueDate: '2024-03-10', maturityDate: b.maturityDate, couponRate: b.couponRate, couponType: 'COUPON', paymentFrequency: 2 },
        holding: { owner: '신랑', faceAmount: 1e7, purchaseDate: '2024-03-10', purchaseAmount: 1e7 }
      }));
    });
  }

  const spread = (list) => list.map((label, i) => ({
    type: 'name', label, pct: i === 0 ? 100 - Math.floor(100 / list.length) * (list.length - 1) : Math.floor(100 / list.length)
  }));
  const krEquity = equities.filter((e) => !isForeign(e)).map((e) => bare(e.ticker));
  const foreign = equities.filter(isForeign).map((e) => bare(e.ticker));
  const mkTargets = (tickers) => tickers.map((t, i) => ({
    type: 'ticker', ticker: t, label: `ZZ ${t}`,
    pct: i === 0 ? 100 - Math.floor(100 / tickers.length) * (tickers.length - 1) : Math.floor(100 / tickers.length)
  }));
  const domesticTargets = mkTargets(krEquity);
  if (opt.withBonds) {
    // 채권은 티커가 없는 보유이므로 이름 기준 목표로 넣는다(앱의 namedHolding 경로와 같다).
    const bondPct = 5;
    domesticTargets.forEach((t, i) => { if (i === 0) t.pct -= bondPct * SYNTHETIC_BONDS.length; });
    SYNTHETIC_BONDS.forEach((b) => domesticTargets.push({ type: 'namedHolding', label: b.name, name: b.name, pct: bondPct }));
  }
  S.rebalance['신랑'].targets = { '국내': domesticTargets, '해외': mkTargets(foreign) };
  void spread;
  return sb;
}

async function runOnce(options) {
  const sb = buildSandbox(options);
  const input = await sb.buildMonteCarloInputFromState({ presetKey: 'normal', ownerFilter: '신랑', includeTaxAdvantaged: true, years: YEARS });
  if (!input.instruments) {
    return { ok: false, errors: input.errors || [], warnings: input.warnings || [] };
  }
  const res = sb.runMonthlyPrecisionMC({
    pv0: PV0, instruments: input.instruments, correlationMatrix: input.correlationMatrix,
    monthlyContribution: MONTHLY, years: YEARS, iterations: ITERATIONS, seed: SEED, taxScope: input.taxScope
  });
  const fv = res.finalValue || {};
  const instruments = input.instruments.map((i) => ({
    key: i.key, weight: round(i.weight, 6), mu: round(i.muAnnual, 6), sigma: round(i.sigmaAnnual, 6)
  }));
  return {
    ok: true,
    finalValue: { p10: fv.p10, p50: fv.p50, p90: fv.p90, mean: fv.mean },
    instrumentCount: instruments.length,
    muHash: hashOf(instruments.map((i) => `${i.key}:${i.mu}`)),
    sigmaByKey: Object.fromEntries(instruments.map((i) => [i.key, i.sigma])),
    excluded: input.excludedFromMc || [],
    warnings: (input.warnings || []).slice(0, 5)
  };
}

function round(x, d) { return typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(d)) : x; }
function hashOf(parts) { return require('node:crypto').createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16); }
function fmt(x) { return typeof x === 'number' ? (x / 1e8).toFixed(3) + '억' : String(x); }

async function measure() {
  const base = await runOnce({ withBonds: false });
  const withBonds = await runOnce({ withBonds: true });
  return {
    measuredAt: new Date().toISOString().slice(0, 10),
    seed: SEED, iterations: ITERATIONS, years: YEARS, pv0: PV0, monthlyContribution: MONTHLY,
    cmaSetVersion: (() => { try { return require(path.join(ROOT, 'js', '26-cma-data.js')).CMA_ACTIVE_SET.setVersion; } catch { return null; } })(),
    cmaPrimary: (() => { try { return require(path.join(ROOT, 'js', '26-cma-data.js')).CMA_ACTIVE_SET.primary.datasetId; } catch { return null; } })(),
    equityOnly: base,
    withSyntheticBonds: withBonds
  };
}

function printReport(m) {
  console.log(`측정일 ${m.measuredAt} · seed ${m.seed} · ${m.iterations}회 · ${m.years}년 · CMA ${m.cmaSetVersion} (${m.cmaPrimary})`);
  [['주식만(원장 49건)', m.equityOnly], ['주식 + 합성채권 3종', m.withSyntheticBonds]].forEach(([label, r]) => {
    if (!r.ok) { console.log(`\n[${label}] 계산 불가 - ${(r.errors || []).join(' / ')}`); return; }
    const fv = r.finalValue;
    console.log(`\n[${label}] instrument ${r.instrumentCount}개 · μ지문 ${r.muHash}`);
    console.log(`  P10 ${fmt(fv.p10)} · P50 ${fmt(fv.p50)} · P90 ${fmt(fv.p90)} · 평균 ${fmt(fv.mean)}`);
    if (r.excluded && r.excluded.length) console.log(`  MC 제외: ${r.excluded.map((e) => e.label || e.key).join(', ')}`);
  });
}

function compare(a, b) {
  const pct = (x, y) => (typeof x === 'number' && typeof y === 'number' && x !== 0 ? ((y / x - 1) * 100).toFixed(2) + '%' : '-');
  ['equityOnly', 'withSyntheticBonds'].forEach((scope) => {
    const ra = a[scope], rb = b[scope];
    console.log(`\n[${scope}]`);
    if (!ra.ok || !rb.ok) { console.log(`  한쪽이 계산 불가(before ok=${ra.ok} · after ok=${rb.ok})`); return; }
    ['p10', 'p50', 'p90', 'mean'].forEach((k) => {
      console.log(`  ${k}: ${fmt(ra.finalValue[k])} → ${fmt(rb.finalValue[k])} (${pct(ra.finalValue[k], rb.finalValue[k])})`);
    });
    console.log(`  μ지문 ${ra.muHash} → ${rb.muHash} ${ra.muHash === rb.muHash ? '(동일 - Return Key 경로 무변경)' : '(다름 · 확인 필요)'}`);
    const keys = new Set([...Object.keys(ra.sigmaByKey), ...Object.keys(rb.sigmaByKey)]);
    const sigDiff = [...keys].filter((k) => ra.sigmaByKey[k] !== rb.sigmaByKey[k]);
    console.log(`  σ 변경 ${sigDiff.length}건${sigDiff.length ? ': ' + sigDiff.slice(0, 6).map((k) => `${k} ${ra.sigmaByKey[k]}→${rb.sigmaByKey[k]}`).join(' · ') : ''}`);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') {
    const [, la, lb] = argv;
    const rd = (l) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `mc-${l}.json`), 'utf8'));
    console.log(`비교: ${la} → ${lb}`);
    compare(rd(la), rd(lb));
    return;
  }
  const m = await measure();
  if (argv.includes('--json')) { console.log(JSON.stringify(m, null, 2)); return; }
  printReport(m);
  const si = argv.indexOf('--save');
  if (si >= 0 && argv[si + 1]) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const p = path.join(OUT_DIR, `mc-${argv[si + 1]}.json`);
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n', 'utf8');
    console.log(`\n저장: ${path.relative(ROOT, p)}`);
  }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exitCode = 1; });
