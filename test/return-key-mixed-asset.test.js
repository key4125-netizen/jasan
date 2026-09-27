/* [PM 지시 2026-09-26 · ISSUE-D] 혼합형 상품의 자산 성격과 Return Key가 같은 결론에 도달한다.
 *
 * 문제: §Phase 45는 이름이 스스로 "한 자산군이 아니다"라고 밝히는 상품(채권혼합 등)을 단일 자산군으로
 *       판정하지 않도록 세 경로를 막았다 - 그런데 세 곳 모두 **자산 성격** 판정 경로였고,
 *       수익률 기준(Return Key) 쪽의 이름 키워드 단계는 빠져 있었다.
 *       그 결과 'TIGER 미국배당다우존스채권혼합'(미국 주식 50% + 국내 국고채 50%)은
 *       성격은 UNRESOLVED인데 Return Key는 SCHD(미국 배당주 100%)를 받아, MC가 이 상품 전체에
 *       미국 주식 기대수익률(μ)과 변동성(σ)을 적용했다.
 *
 * 고친 방식: 새 규칙 · 새 키워드 · 새 수익률을 만들지 않고, 이미 승인된 MIXED_ASSET_NAME_KEYWORDS를
 *           그 한 단계에도 적용했다. 결과는 "가정 없음"이며, 사용자가 대표매칭으로 직접 지정하면
 *           그 값이 1순위로 그대로 쓰인다(사용자 의사를 막지 않는다).
 * 실행: node --test test/return-key-mixed-asset.test.js
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdapterSandbox } = require('./mc-adapter-sandbox.js');

const SB = loadAdapterSandbox();
const ev = (code) => SB.evalInSandbox(code);
const keyOf = (a) => ev(`resolveAssetGroupKeyDetail(${JSON.stringify(a)}).key`);
const srcOf = (a) => ev(`resolveAssetGroupKeyDetail(${JSON.stringify(a)}).source`);
const charOf = (a) => ev(`resolveAssetCharacter(${JSON.stringify(a)}).character`);
const mcOf = (a) => ev(`(function(){var d=resolveAssetGroupKeyDetail(${JSON.stringify(a)});`
  + `return resolveMcAppAssetClass({key:d.key,source:d.source,subject:${JSON.stringify(a)}}).appClass;})()`);

const etf = (ticker, name) => ({ id: 'ZZ1', ticker, name, category: 'ETF', categorySource: 'user', currency: 'KRW', isDomestic: '해외' });

/* ══════════════ ISSUE-D 본체 ══════════════ */

test('ISSUE-D. 이름이 혼합이라고 밝힌 상품은 이름 키워드로 Return Key를 받지 않는다', () => {
  const cases = [
    ['미국배당다우존스채권혼합', 'TIGER 미국배당다우존스채권혼합'],
    ['미국나스닥100채권혼합', 'ACE 미국나스닥100채권혼합'],
    ['S&P500 채권혼합', 'ZZ 미국S&P500채권혼합'],
    ['주식+채권 표기', 'ZZ 미국나스닥100 주식+채권'],
    ['혼합형', 'ZZ 배당다우존스 혼합형']
  ];
  cases.forEach(([label, name]) => {
    const a = etf('472170', name);
    assert.strictEqual(charOf(a), 'UNRESOLVED', label + ' 성격');
    assert.strictEqual(keyOf(a), ev('UNRESOLVED_RATE_KEY'), label + ' Return Key');
    assert.strictEqual(srcOf(a), 'unresolved', label + ' 판정 단계');
    assert.strictEqual(mcOf(a), 'UNRESOLVED', label + ' MC 자산군');
  });
});

test('ISSUE-D. 두 판정의 근거가 어긋나지 않는다 - 성격이 UNRESOLVED면 Return Key도 그렇다', () => {
  const mixed = etf('472170', 'TIGER 미국배당다우존스채권혼합');
  assert.strictEqual(charOf(mixed), 'UNRESOLVED');
  assert.notStrictEqual(keyOf(mixed), 'SCHD', '더 이상 미국 배당주 100%로 가정하지 않는다');
  // 원장도 같은 말을 한다 - 혼합 노출(MIXED)이라 단일 자산군 · 단일 Benchmark를 주지 않는다.
  const rec = JSON.parse(ev("JSON.stringify(lookupExposureRecord({ ticker: '472170.KS' }) || null)"));
  assert.ok(rec && rec.entry, '472170은 원장에 있다');
  assert.strictEqual(rec.entry.exposureStructure, 'MIXED');
  assert.strictEqual(rec.entry.assetClass, undefined, '원장도 단일 자산군을 적지 않는다');
});

test('ISSUE-D. 혼합형이 아닌 상품의 이름 키워드 매칭은 그대로다(영향 범위 확인)', () => {
  const unchanged = [
    ['TIGER 미국S&P500', 'S&P500'],
    ['TIGER 미국나스닥100', 'NASDAQ'],
    ['TIGER 미국배당다우존스', 'SCHD'],
    ['KODEX 미국S&P500', 'S&P500']
  ];
  unchanged.forEach(([name, want]) => {
    const a = etf('', name);
    assert.strictEqual(keyOf(a), want, name);
    assert.strictEqual(srcOf(a), 'nameKeyword', name);
  });
});

test('ISSUE-D. 사용자가 직접 지정한 값은 막지 않는다 - 대표매칭 오버라이드가 1순위다', () => {
  /* "가정 없음"이 최종 결론이 아니다. 이 상품의 수익률 가정을 아는 사람은 사용자이고,
   * 사용자가 고른 값은 이 단계보다 앞에 있어 그대로 쓰인다(Phase 47-A와 같은 구조). */
  const a = Object.assign(etf('472170', 'TIGER 미국배당다우존스채권혼합'), { rateMatchOverride: 'SCHD' });
  assert.strictEqual(keyOf(a), 'SCHD');
  assert.strictEqual(srcOf(a), 'override');
  assert.strictEqual(mcOf(a), 'US_EQUITY', '사용자가 정한 기준의 성격이 MC 자산군이 된다');
});

test('ISSUE-D. 사용자 확정 자산군은 그대로 우선한다(혼합 상품을 채권으로 정한 경우)', () => {
  // 카테고리 단계는 이 단계보다 앞이다 - 사용자가 '채권'으로 확정했으면 그 뜻을 따른다.
  const a = Object.assign(etf('472170', 'TIGER 미국배당다우존스채권혼합'), { category: '채권', categorySource: 'user' });
  assert.strictEqual(keyOf(a), '채권');
  assert.strictEqual(srcOf(a), 'category');
});

/* ══════════════ 구현 방식 고정 ══════════════ */

test('ISSUE-D. 새 키워드 목록을 만들지 않고 기존 MIXED_ASSET_NAME_KEYWORDS를 재사용했다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '05-future-projection.js'), 'utf8');
  // 혼합형 키워드 선언은 여전히 한 곳뿐이다(복사본이 생기면 언젠가 어긋난다).
  assert.strictEqual((src.match(/const MIXED_ASSET_NAME_KEYWORDS = /g) || []).length, 1);
  assert.match(src, /const saysMixed = matchesAnyKeyword\(String\(asset\.name \?\? ''\), MIXED_ASSET_NAME_KEYWORDS\);/);
  assert.match(src, /const nameKey = saysMixed \? null : getNameKeywordRateKey\(asset\.name\);/);
  // 목록 자체는 v270과 같아야 한다 - 이번에 키워드를 늘리지 않았다.
  assert.match(src, /const MIXED_ASSET_NAME_KEYWORDS = \['혼합', '주식\+채권', '주식 \+ 채권', '채권\+주식', '채권 \+ 주식'\];/);
});
