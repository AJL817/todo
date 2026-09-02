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
        // E2E 는 개발 데이터와 분리된 데이터베이스를 쓴다.
        // MONGODB_URI 는 일부러 비워 두어 lib/mongo-uri.ts 의 로컬 폴백을 그대로 태운다.
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
