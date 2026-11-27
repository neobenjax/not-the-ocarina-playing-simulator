import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173/not-the-ocarina-playing-simulator/',
    headless: true,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173',
        url: 'http://localhost:4173/not-the-ocarina-playing-simulator/',
        reuseExistingServer: true,
        timeout: 20000,
      },
});
