// Playwright 설정 - 검증환경 구축 전용(기능 개발 아님). 최소 smoke test 실행만을 위한 구성이다 -
// 정상/Safety/Projection/상태관리/Monte Carlo 세부 시나리오는 이번 단계에서 작성하지 않는다(사용자
// 지시 - "이번 단계에서는 위 테스트를 전부 작성하지 않는다").
//
// [webServer] .claude/launch.json의 PowerShell 서버는 이 세션의 scratchpad 임시 경로를 참조해
// 다른 PC/CI에서 재현되지 않으므로(v208 인계장부터 반복 기록된 사유), 대신 새 의존성 없이 Node
// 내장 모듈만 쓰는 scripts/dev-static-server.js를 그대로 사용한다 - 포트도 겹치지 않게 8644 사용
// (실제 개발 서버는 보통 8643).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8644',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/dev-static-server.js',
    url: 'http://localhost:8644',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
