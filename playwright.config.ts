import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
// WebGPU in headless Chromium; three falls back to WebGL2 if it's unavailable.
const launchOptions = { args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions },
    },
    {
      // iPhone 13 class, landscape.
      name: 'phone',
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 13'].userAgent,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
