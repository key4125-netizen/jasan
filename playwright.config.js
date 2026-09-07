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
    // [Phase 47-G - E2E 네트워크 격리] 테스트 브라우저의 DNS를 localhost와 앱 셸 CDN 3곳으로만
    // 제한한다. 그 외 호스트는 이름 해석 자체가 실패해(ERR_NAME_NOT_RESOLVED) 요청이 이 기기를
    // 떠나지 못한다.
    //
    // 왜 이 방식인가: 예전엔 E2E가 실제 production Cloudflare Worker를 그대로 호출했다. 앱은 부팅할
    // 때마다 refreshPricesAndRates()로 보유종목/지수/매크로/환율 시세를 받아오는데, 그 경로의
    // CORS 프록시 목록 첫 번째가 사용자 개인 Worker(asset-manager-proxy)다 - 실측 결과 깨끗한 부팅
    // 1회당 26건이 나갔고, 테스트 1건 = 부팅 1회이므로 전체 e2e 1회에 약 12,000건이 발생했다.
    // 반복 실행으로 Cloudflare Free 한도(계정 전체 100,000/day)를 실제로 소진했다.
    //
    // page.route로 막지 않고 브라우저 DNS 단계에서 막는 이유는 두 가지다. ① spec 48개의 import를
    // 하나도 건드리지 않고 config 한 곳으로 끝난다. ② 개별 테스트가 실수로든 의도로든 우회할 수
    // 없다 - route는 각 테스트가 page.unroute로 풀 수 있지만 이건 브라우저 실행 인자라 풀 수 없다.
    //
    // 부수 효과(의도한 것): 외부 시세가 응답하지 않으므로 "실시간 시세가 시드값을 덮어써서" 생기던
    // 플레이크(e2e/13·19·36·40에서 반복 관찰됨)가 구조적으로 사라진다. 테스트는 이제 앱 코드와
    // 시드 데이터만으로 결정된다.
    //
    // EXCLUDE 목록은 index.html이 <script>로 로드하는 앱 셸 CDN 3곳뿐이다 - 이게 없으면 Chart.js/
    // lucide/xlsx/Tailwind가 로드되지 않아 앱 자체가 뜨지 않는다. 시세/환율/Worker 호스트는 하나도
    // 들어있지 않다.
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND,'
        + ' EXCLUDE localhost,'
        + ' EXCLUDE 127.0.0.1,'
        + ' EXCLUDE cdn.tailwindcss.com,'
        + ' EXCLUDE unpkg.com,'
        + ' EXCLUDE cdn.jsdelivr.net'],
    },
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
