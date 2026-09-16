// CMA 파일 저장소 - data/cma 아래 JSON 파일만 다룬다.
//   registry.json                : 공식 Source 목록(확인 주기 · 마지막 확인 · HTTP 검증값)
//   app-asset-class-map.json     : 앱 자산 성격 → 기관별 자산군 연결 근거
//   datasets/<datasetId>.json    : Dataset(한 번 저장하면 숫자 · 출처는 다시 쓰지 않는다 - 상태 기록만 추가)
//   active.json                  : 앱 계산에 쓰는 세트(PM 승인 뒤 activate 명령으로만 바뀐다)
//   audit-log.json               : 확인 이력
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { NUMBER_KIND } = require('./cma-core.js');

function createStore(rootDir, options) {
  options = options || {};
  const dir = path.join(rootDir, 'data', 'cma');
  const datasetsDir = path.join(dir, 'datasets');
  const file = (name) => path.join(dir, name);

  const readJson = (p, fallback) => {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  // 쓰기는 임시 파일 → 이름 바꾸기로 한다 - 중간에 멈춰도 반쯤 쓴 JSON이 남지 않는다.
  const writeJson = (p, value) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, p);
  };

  return {
    rootDir, dir,
    readRegistry: () => readJson(file('registry.json'), null),
    writeRegistry: (reg) => writeJson(file('registry.json'), reg),
    readAssetClassMap: () => readJson(file('app-asset-class-map.json'), null),
    readActive: () => readJson(file('active.json'), null),
    writeActive: (active) => writeJson(file('active.json'), active),
    readAudit: () => readJson(file('audit-log.json'), { schemaVersion: 1, entries: [] }),
    appendAudit(entry) {
      const log = this.readAudit();
      log.entries.push(entry);
      writeJson(file('audit-log.json'), log);
    },
    listDatasets() {
      if (!fs.existsSync(datasetsDir)) return [];
      return fs.readdirSync(datasetsDir).filter((f) => f.endsWith('.json')).sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(datasetsDir, f), 'utf8')));
    },
    readDataset(id) {
      return readJson(path.join(datasetsDir, `${id}.json`), null);
    },
    // 새 Dataset 저장 - 같은 id가 있으면 거부한다(기존 Dataset 덮어쓰기 금지 · CMA-VER-01).
    saveNewDataset(ds) {
      if (ds.numberKind === NUMBER_KIND.SYNTHETIC_TEST_DATA && !options.allowSynthetic) {
        throw new Error('SYNTHETIC_TEST_DATA는 실제 CMA 저장소에 저장할 수 없습니다.');
      }
      const p = path.join(datasetsDir, `${ds.datasetId}.json`);
      if (fs.existsSync(p)) throw new Error(`Dataset ${ds.datasetId}이 이미 있습니다 - 덮어쓰지 않습니다.`);
      writeJson(p, ds);
    },
    // 상태 변경 - 숫자 · 출처 필드가 그대로인지 확인한 뒤에만 쓴다.
    updateDatasetStatus(id, mutate) {
      const p = path.join(datasetsDir, `${id}.json`);
      const before = readJson(p, null);
      if (!before) throw new Error(`Dataset ${id}이 없습니다.`);
      const after = mutate(JSON.parse(JSON.stringify(before)));
      const frozen = ['datasetId', 'provider', 'sourceId', 'sourceUrl', 'fileSha256', 'contentHash', 'assetClasses', 'expectedReturn', 'arithmeticReturn', 'volatility', 'correlationMatrix', 'numberKind'];
      frozen.forEach((k) => {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) throw new Error(`Dataset ${id}의 "${k}"는 저장 뒤 바꿀 수 없습니다.`);
      });
      writeJson(p, after);
      return after;
    },
    writeText(relPath, text) {
      const p = path.join(rootDir, relPath);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, p);
    }
  };
}

module.exports = { createStore };
