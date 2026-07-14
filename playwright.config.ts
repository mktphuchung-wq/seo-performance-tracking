import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/admin/kpi-month/2026-07?member=H%C6%B0%E1%BB%9Bng%20D%C6%B0%C6%A1ng",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, KPI_E2E_FIXTURE_MODE: "true", KPI_ENGINE_V2_ENABLED: "true" },
  },
});
