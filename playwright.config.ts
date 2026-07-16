import { defineConfig } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: protectionBypass
      ? {
          "x-vercel-protection-bypass": protectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        env: {
          NEXTAUTH_SECRET: "playwright-local-secret-not-for-production",
          NEXTAUTH_URL: "http://127.0.0.1:3100",
          VERCEL_ENV: "preview",
          E2E_TEST_AUTH_ENABLED: "true",
          E2E_TEST_AUTH_SECRET: "playwright-preview-secret-123456789",
          E2E_TEST_ADMIN_EMAIL: "admin-preview@example.com",
          E2E_TEST_MEMBER_EMAIL: "member-preview@example.com",
          ADMIN_EMAILS: "admin-preview@example.com",
        },
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
