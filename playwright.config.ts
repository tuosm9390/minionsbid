import { defineConfig, devices } from '@playwright/test'

const port = 3015
const nodeExec = process.execPath.replace(/\\/g, '/')
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl || `http://localhost:${port}`
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'

export default defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: `"${nodeExec}" ./node_modules/next/dist/bin/next dev --port ${port}`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
        env: {
          NODE_ENV: 'development',
          E2E_SCHEDULE_FIXTURE: '1',
          E2E_AUCTION_FIXTURE: '1',
          NEXT_PUBLIC_E2E_AUCTION_FIXTURE: '1',
          HALL_OF_FAME_ADMIN_CODE: 'secret-code',
          NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.local',
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-project',
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-bucket',
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'demo-sender',
          NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
          NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://demo.local',
          NEXT_PUBLIC_FIRESTORE_DATABASE_ID: '(default)',
          FIREBASE_PROJECT_ID: 'demo-project',
          FIREBASE_CLIENT_EMAIL: 'demo@example.com',
          FIREBASE_PRIVATE_KEY: 'demo-key',
          FIREBASE_DATABASE_URL: 'https://demo.local',
          FIRESTORE_DATABASE_ID: '(default)',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
})
