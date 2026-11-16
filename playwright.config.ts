import { defineConfig, devices } from '@playwright/test';

// Uçtan uca testler: uygulamayı gerçek tarayıcı motorlarında açar ve
// bir kullanıcı gibi kullanır. iPad ve iPhone, Safari'nin motoru WebKit ile.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4179',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
    { name: 'telefon', use: { ...devices['iPhone 14'] } },
    { name: 'masaustu', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4179 --strictPort',
    port: 4179,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
