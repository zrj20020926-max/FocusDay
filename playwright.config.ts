import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4177', browserName: 'chromium', serviceWorkers: 'allow' },
  webServer: {
    command: 'node scripts/pwa-test-server.mjs',
    url: 'http://127.0.0.1:4177/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
