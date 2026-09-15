import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 2,
  reporter: "list",
  webServer: process.env.CONSOLE_TEST_URL
    ? undefined
    : {
        command: "npm run dev -- --strictPort",
        url: "http://127.0.0.1:5180",
        reuseExistingServer: true,
        timeout: 30000,
      },
  use: {
    baseURL: process.env.CONSOLE_TEST_URL ?? "http://127.0.0.1:5180",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
});
