// CMA 원문 수집 - HTTP 조건부 요청(ETag / Last-Modified) · timeout · 1회 재시도 · PDF → 텍스트 변환.
// 네트워크 구현(fetchImpl)과 PDF 변환(pdfToText)은 주입할 수 있다 - 테스트는 실제 네트워크 없이 같은 코드를 돈다.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { sha256, ERROR_CODE } = require('./cma-core.js');

const USER_AGENT = 'Mozilla/5.0 (compatible; jasan-cma-check/1.0; +https://github.com/key4125-netizen/jasan)';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchError(code, message, httpStatus) {
  const e = new Error(message);
  e.code = code;
  if (httpStatus !== undefined) e.httpStatus = httpStatus;
  return e;
}

async function fetchOnce(url, validators, options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  let timer = null;
  // abort 신호를 따르지 않는 구현(프록시 · 응답 본문이 멈춘 경우)에서도 끝나도록 타이머와 경쟁시킨다.
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const e = new Error('timeout');
      e.name = 'AbortError';
      reject(e);
    }, timeoutMs);
  });
  const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };
  if (validators && validators.etag) headers['If-None-Match'] = validators.etag;
  if (validators && validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
  try {
    const res = await Promise.race([fetchImpl(url, { headers, signal: controller.signal, redirect: 'follow' }), timeout]);
    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 304) return { status: 'NOT_MODIFIED', httpStatus: 304, etag, lastModified, contentType };
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      const err = fetchError(retryable ? ERROR_CODE.DOWNLOAD_FAILED : ERROR_CODE.SOURCE_UNAVAILABLE, `HTTP ${res.status}`, res.status);
      err.retryable = retryable;
      throw err;
    }
    const body = Buffer.from(await Promise.race([res.arrayBuffer(), timeout]));
    return { status: 'OK', httpStatus: res.status, etag, lastModified, contentType, body, sha256: sha256(body), finalUrl: res.url || url };
  } catch (e) {
    if (e && e.name === 'AbortError') { const t = fetchError(ERROR_CODE.TIMEOUT, `시간 초과(${timeoutMs}ms)`); t.retryable = true; throw t; }
    if (e && e.code && Object.values(ERROR_CODE).includes(e.code)) throw e;
    const n = fetchError(ERROR_CODE.DOWNLOAD_FAILED, `네트워크 오류: ${e && e.message ? e.message : e}`);
    n.retryable = true;
    throw n;
  } finally {
    clearTimeout(timer);
    timeout.catch(() => {});
  }
}

/**
 * 일시적 실패(네트워크 · timeout · 5xx · 429)만 짧게 1회 재시도한다(CMA-AUTO-05). 그래도 실패하면 오류를 던진다.
 * 반환: { status: 'OK' | 'NOT_MODIFIED', body?, sha256?, etag, lastModified, contentType, attempts }
 */
async function fetchWithRetry(url, validators, options) {
  options = options || {};
  const maxAttempts = 2;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await fetchOnce(url, validators, options);
      out.attempts = attempt;
      return out;
    } catch (e) {
      lastErr = e;
      e.attempts = attempt;
      if (!e.retryable || attempt === maxAttempts) break;
      await sleep(options.retryDelayMs === undefined ? DEFAULT_RETRY_DELAY_MS : options.retryDelayMs);
    }
  }
  throw lastErr;
}

// PDF 바이트인지 확인 - 없는 분기 주소는 HTML 안내 페이지로 넘어가므로(302 → 200 HTML) 형식으로 판정한다.
function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

// pdftotext(xpdf · poppler 공통 옵션 -raw -enc UTF-8)로 글자 순서 그대로의 텍스트를 뽑는다.
function pdfToTextWithPdftotext(buffer, options) {
  options = options || {};
  const bin = options.pdftotextPath || process.env.PDFTOTEXT_PATH || 'pdftotext';
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cma-pdf-'));
    const input = path.join(dir, 'source.pdf');
    fs.writeFileSync(input, buffer);
    execFile(bin, ['-raw', '-enc', 'UTF-8', input, '-'], { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      fs.rmSync(dir, { recursive: true, force: true });
      if (err) {
        const e = new Error(err.code === 'ENOENT' ? `PDF 변환 도구(${bin})를 찾지 못했습니다.` : `PDF 변환 실패: ${err.message}`);
        e.code = err.code === 'ENOENT' ? ERROR_CODE.PARSER_TOOL_UNAVAILABLE : ERROR_CODE.PARSE_FAILED;
        reject(e);
        return;
      }
      resolve(stdout);
    });
  });
}

module.exports = { fetchWithRetry, looksLikePdf, pdfToTextWithPdftotext, USER_AGENT };
