import { defineConfig, devices } from '@playwright/test'

// UI tests: the real app in a real browser, with every backend (search, routing, transit, the
// maps backend, map tiles) answered from e2e/fixtures, so no stack or data is needed.
//
//   npm run test:e2e          behaviour tests, on this machine
//   npm run test:e2e:docker   everything, screenshots too, in the same Linux browser as CI
//   npm run test:e2e:update   re-record the screenshots after an intended UI change
//
// Screenshots only match when fonts and rendering are identical, so they're compared only in
// the pinned Playwright container (CI and the docker scripts set E2E_SCREENSHOTS).
const PORT = 7100
const screenshots = Boolean(process.env.E2E_SCREENSHOTS)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  grepInvert: screenshots ? undefined : /@screenshot/,
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Fixed so dates, times and opening hours render the same everywhere
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
