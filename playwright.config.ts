import { defineConfig } from "@playwright/test";

const useLocalWebServer = process.env.PLAYWRIGHT_USE_LOCAL_SERVER === "1";
const localPort = process.env.PLAYWRIGHT_LOCAL_PORT || "3013";
const localBaseURL = `http://127.0.0.1:${localPort}`;
const baseURL = process.env.E2E_BASE_URL || (useLocalWebServer ? localBaseURL : "https://test.gshs.app");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  expect: {
    timeout: 15_000,
  },
  webServer: useLocalWebServer
    ? {
        command: `npm run start -- --hostname 127.0.0.1 --port ${localPort}`,
        url: `${localBaseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
