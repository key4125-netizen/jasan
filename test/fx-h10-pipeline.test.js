// [T6 · §44 44-15] 연준 H.10 USD/KRW 빌드 스크립트(scripts/fx/update-usdkrw-h10.js) 검증 - 네트워크 없음.
// 실행: node --test test/fx-h10-pipeline.test.js
//
// 핵심 계약: 잘못된 HTML · 빈 결과 · 중복/역순 날짜 · 비정상 환율 · 미래 날짜 · 기존보다 짧아진 데이터는
// 전부 거부하고, 통과한 데이터만 임시 파일 → 재검증 → rename으로 교체한다(기존 정상 파일을 깨뜨리지 않는다).

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseH10Html, buildUsdKrwDataset, writeDatasetAtomically } = require('../scripts/fx/update-usdkrw-h10.js');

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const h10Date = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}-${MON[Number(m) - 1]}-${y.slice(2)}`; };
function htmlOf(rows) {
  const body = rows.map(([d, v]) => `<tr><th>${h10Date(d)}</th><td>${v}</td></tr>`).join('');
  return `<html><body><h3>Historical Rates for the South Korean Won</h3><p>Rates in South Korean won per U.S. dollar</p><table>${body}</table></body></html>`;
}
// 2000-01-03부터 연속 n일(주말 구분 없이) - 결정적.
function rowsFrom(n, start = '2000-01-03') {
  const out = [];
  const t0 = Date.parse(start);
  for (let i = 0; i < n; i++) out.push({ date: new Date(t0 + i * 86400000).toISOString().slice(0, 10), value: 1100 + (i % 50) });
  return out;
}

test('L - H.10 표를 읽는다: 날짜 변환 · ND는 null · 단위 확인', () => {
  const rows = parseH10Html(htmlOf([['2000-01-03', '1128.0000'], ['2000-01-17', 'ND'], ['2026-09-11', '1340.3000']]));
  assert.deepStrictEqual(rows, [
    { date: '2000-01-03', value: 1128 }, { date: '2000-01-17', value: null }, { date: '2026-09-11', value: 1340.3 }
  ]);
});

test('L - 잘못된 HTML은 거부한다(제목 · 단위 없음 · 빈 응답 · 잘못된 날짜)', () => {
  assert.throws(() => parseH10Html(''), /빈 응답/);
  assert.throws(() => parseH10Html('<html>Rates in South Korean won per U.S. dollar 3-JAN-00 1128.0</html>'), /표 제목/);
  assert.throws(() => parseH10Html('<html>Historical Rates for the South Korean Won 3-JAN-00 1128.0</html>'), /단위/);
  assert.throws(() => parseH10Html(htmlOf([['2000-01-03', '1128']]).replace('3-JAN-00', '31-FEB-00')), /날짜를 읽을 수 없음/);
});

test('L - 품질 검사: 빈 결과 · 중복 · 역순 · 0 이하 · 비정상 범위 · 미래 날짜 · 행 수 부족을 거부', () => {
  const opts = { todayISO: '2026-09-19' };
  assert.throws(() => buildUsdKrwDataset([], opts), /비어/);
  const base = rowsFrom(5200);
  const dup = base.slice(); dup[10] = { ...dup[9] };
  assert.throws(() => buildUsdKrwDataset(dup, opts), /중복 또는 역순/);
  const rev = base.slice(); [rev[10], rev[11]] = [rev[11], rev[10]];
  assert.throws(() => buildUsdKrwDataset(rev, opts), /중복 또는 역순/);
  const neg = base.slice(); neg[5] = { ...neg[5], value: -1 };
  assert.throws(() => buildUsdKrwDataset(neg, opts), /환율 값 오류/);
  const tiny = base.slice(); tiny[5] = { ...tiny[5], value: 1.1 };
  assert.throws(() => buildUsdKrwDataset(tiny, opts), /비정상 환율/);
  assert.throws(() => buildUsdKrwDataset(base, { todayISO: '2010-01-01' }), /미래 날짜/);
  assert.throws(() => buildUsdKrwDataset(rowsFrom(100), opts), /최소/);
});

test('L - 통과한 데이터: 메타데이터 · ND 제외 · 개수가 맞다', () => {
  const rows = rowsFrom(5200);
  rows[3] = { ...rows[3], value: null };
  const ds = buildUsdKrwDataset(rows, { todayISO: '2026-09-19', fetchedAt: '2026-09-19T00:00:00.000Z' });
  assert.strictEqual(ds.rowCount, 5200);
  assert.strictEqual(ds.validCount, 5199);
  assert.strictEqual(ds.ndCount, 1);
  assert.strictEqual(ds.rates.length, 5199);
  assert.ok(!ds.rates.some(([d]) => d === rows[3].date));
  assert.strictEqual(ds.startDate, rows[0].date);
  assert.strictEqual(ds.endDate, rows[rows.length - 1].date);
  for (const k of ['source', 'series', 'quote', 'observation', 'url', 'license', 'fetchedAt']) assert.ok(ds[k], k);
});

test('L - 기존 정상 파일보다 짧아진 결과(시작일 변경 · 끝일 후퇴 · 행 감소)는 거부한다', () => {
  const prev = buildUsdKrwDataset(rowsFrom(5200), { todayISO: '2026-09-19' });
  assert.throws(() => buildUsdKrwDataset(rowsFrom(5100), { todayISO: '2026-09-19', previous: prev }), /끝일이 앞당겨짐/);
  assert.throws(() => buildUsdKrwDataset(rowsFrom(5200, '2000-01-04'), { todayISO: '2026-09-19', previous: prev }), /시작일이 바뀜/);
  const fewer = rowsFrom(5200); fewer[7] = { ...fewer[7], value: null };
  assert.throws(() => buildUsdKrwDataset(fewer, { todayISO: '2026-09-19', previous: prev }), /유효 행이 줄어듦/);
  assert.ok(buildUsdKrwDataset(rowsFrom(5201), { todayISO: '2026-09-19', previous: prev }));
});

test('L - 원자적 교체: 성공하면 파일이 바뀌고 임시 파일이 남지 않는다 · 검증 실패면 기존 파일 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-h10-'));
  const out = path.join(dir, 'usdkrw-h10.json');
  const good = buildUsdKrwDataset(rowsFrom(5200), { todayISO: '2026-09-19' });
  writeDatasetAtomically(good, out);
  const before = fs.readFileSync(out, 'utf8');
  assert.strictEqual(JSON.parse(before).validCount, 5200);
  assert.deepStrictEqual(fs.readdirSync(dir), ['usdkrw-h10.json']);
  // 스크립트 순서(파싱 → 검사 → 쓰기)상 검사에서 실패하면 쓰기까지 가지 않는다.
  assert.throws(() => {
    const ds = buildUsdKrwDataset(rowsFrom(10), { todayISO: '2026-09-19', previous: JSON.parse(before) });
    writeDatasetAtomically(ds, out);
  });
  assert.strictEqual(fs.readFileSync(out, 'utf8'), before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('[후속 Issue 3] main에 push하는 데이터 갱신 워크플로 두 개는 같은 concurrency 그룹을 쓴다(일정 · 소스 무변경)', () => {
  // Windows 체크아웃(core.autocrlf)에서는 CRLF로 읽히므로 줄바꿈을 맞춘 뒤 비교한다.
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', f), 'utf8').replace(/\r\n/g, '\n');
  const fx = read('update-fx-h10.yml');
  const tm = read('update-ticker-master.yml');
  for (const y of [fx, tm]) {
    assert.match(y, /\nconcurrency:\n {2}group: data-update-main-push\n {2}cancel-in-progress: false\n/);
    assert.ok(!/secrets\./.test(y));
  }
  assert.match(fx, /cron: '0 0 \* \* 2'/);
  assert.match(tm, /cron: '0 0 1 \* \*'/);
  assert.match(fx, /run: node scripts\/fx\/update-usdkrw-h10\.js/);
  assert.match(tm, /run: node scripts\/update-ticker-master\.js/);
});

test('[B-1 · v259] sw.js: data/fx/만 같은 출처 네트워크 우선으로 추가되고 기존 NETWORK_FIRST_HOSTS는 그대로다', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(sw, /const NETWORK_FIRST_SAME_ORIGIN_PATH = '\/data\/fx\/';/);
  assert.match(sw, /isFxData = url\.origin === self\.location\.origin && url\.pathname\.includes\(NETWORK_FIRST_SAME_ORIGIN_PATH\);/);
  const block = sw.match(/const NETWORK_FIRST_HOSTS = \[([\s\S]*?)\];/)[1];
  const hosts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(hosts, [
    'query1.finance.yahoo.com', 'open.er-api.com', 'api.exchangerate-api.com', 'stooq.com', 'api.allorigins.win',
    'corsproxy.io', 'api.codetabs.com', 'r.jina.ai', 'polling.finance.naver.com', 'asset-manager-proxy.key4125.workers.dev',
    'steep-haze-01f0.key4125.workers.dev', 'keymaster.key4125.workers.dev', 'cdn.jsdelivr.net'
  ]);
  // B-1은 v259에서 들어왔다 - 이후 릴리스에서도 유지되는지만 본다(버전 번호는 Release Guard가 확인).
  const ver = Number((sw.match(/const CACHE_NAME = 'smart-asset-manager-v(\d+)';/) || [])[1]);
  assert.ok(ver >= 259, String(ver));
});
