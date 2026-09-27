import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 2,
  reporter: "list",
  webServer: process.env.CONSOLE_TEST_URL
    ? undefined
    : {
        command: "npm run dev -- --strictPort",
        url: "http://127.0.0.1:5180",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
  use: {
    baseURL: process.env.CONSOLE_TEST_URL ?? "http://127.0.0.1:5180",
    // CI installs Playwright's matching Chromium; local Windows checks keep Chrome.
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: process.env.CI ? "off" : "retain-on-failure",
  },
});
