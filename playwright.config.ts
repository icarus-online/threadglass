import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      chromiumSandbox: process.env.CHROMIUM_SANDBOX !== 'false',
    },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'android',
      use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
