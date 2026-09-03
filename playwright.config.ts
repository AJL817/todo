import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const STUB_PORT = 3199
const BASE_URL = `http://127.0.0.1:${PORT}`
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 실제 GitHub 에 붙을 수 없으므로 OAuth 세 지점을 흉내내는 스텁을 띄운다.
      // 테스트 전용 라우트를 앱에 심지 않기 위해 별도 프로세스로 둔다.
      command: `node scripts/github-oauth-stub.mjs`,
      url: `${STUB_URL}/__current-user`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { STUB_PORT: String(STUB_PORT) },
    },
    {
      command: `npx next dev --port ${PORT}`,
      // DB 를 건드리지 않는 health 엔드포인트로 준비 여부를 확인한다.
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        // E2E 는 개발 데이터와 분리된 로컬 데이터베이스를 쓴다.
        //
        // MONGODB_URI 를 빈 문자열로 "명시" 해야 한다. 주석으로 비워 뒀다고 적어 두는
        // 것으로는 부족하다 — next dev 가 .env 를 읽으므로, 개발용 .env 에
        // MONGODB_URI 가 있으면 그 값이 그대로 쓰인다. 실제로 그렇게 해서 E2E 가
        // 원격 Atlas 운영 DB 에 붙어 돌았고, 매 요청이 네트워크를 타면서
        // 테스트마다 옮겨 다니는 간헐 타임아웃으로 나타났다.
        // process.env 가 .env 파일보다 우선하므로 여기서 비우면 로컬 폴백을 탄다.
        MONGODB_URI: '',
        MONGO_DB_NAME: 'todo-e2e',
        NODE_ENV: 'development',
        // 스텁을 GitHub 대신 쓰게 한다. 값은 형식만 맞으면 되고 실제 비밀이 아니다.
        GITHUB_CLIENT_ID: 'e2e-client-id',
        GITHUB_CLIENT_SECRET: 'e2e-client-secret',
        GITHUB_OAUTH_BASE: STUB_URL,
        GITHUB_API_BASE: STUB_URL,
      },
    },
  ],
})
