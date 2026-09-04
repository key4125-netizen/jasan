// 최소 정적 파일 서버 - Playwright smoke test 전용(검증환경 구축, 기능 코드 아님).
// 새 의존성을 추가하지 않기 위해 Node 내장 모듈(http/fs/path)만 사용한다 - .claude/launch.json의
// 개발용 PowerShell 서버는 이 세션의 scratchpad 임시 경로를 가리켜 다른 PC/CI에서 재현되지 않으므로
// (v208/v209/v210 인계장에 기록된 사유와 동일), Playwright 설정이 의존할 수 있는 이식 가능한 서버가
// 별도로 필요했다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8644;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  // [경로 이탈 방지] 루트 바깥으로 나가는 요청(../ 등)은 차단한다.
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`dev-static-server listening on http://localhost:${PORT}`);
});
