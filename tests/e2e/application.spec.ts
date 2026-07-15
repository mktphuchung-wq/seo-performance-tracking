import { expect, test, type Page } from "@playwright/test";

const previewSecret = process.env.E2E_TEST_AUTH_SECRET;
const previewAdmin = process.env.E2E_TEST_ADMIN_EMAIL;
const previewMember = process.env.E2E_TEST_MEMBER_EMAIL;

async function signInPreview(page: Page, email: string) {
  const request = page.context().request;
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/auth/callback/preview-test", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      secret: String(previewSecret ?? ""),
      callbackUrl: "/",
      json: "true",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("public entry renders a meaningful sign-in surface without an error overlay", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "SEO Performance Workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in with Google" }),
  ).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});

test("Admin and Member workspaces are isolated from anonymous users", async ({
  page,
  request,
}) => {
  await page.goto("/admin/sync");
  await expect(page).toHaveURL(/\/$/);
  const memberApi = await request.get("/api/me/performance");
  expect(memberApi.status()).toBe(401);
});

test("legacy write endpoints are read-only during migration", async ({
  request,
}) => {
  for (const endpoint of [
    "/api/sync/sheet",
    "/api/refresh/cache",
    "/api/project-kpi-settings",
    "/api/admin/monthly-kpi-settings",
  ]) {
    const response = await request.post(endpoint, { data: {} });
    expect(response.status(), endpoint).toBe(410);
  }
});

test("Preview-only test auth exposes authenticated Admin workflows", async ({
  page,
}) => {
  test.skip(
    !previewSecret || !previewAdmin,
    "Preview test credentials were not supplied to Playwright.",
  );
  await signInPreview(page, previewAdmin!);
  for (const path of [
    "/admin/sync",
    "/admin/projects",
    "/admin/data-source",
    "/admin/member-performance",
    "/admin/member-review",
    "/admin/kpi-close",
  ]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/$/);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
  for (const endpoint of [
    "/api/admin/source-pipeline/status",
    "/api/admin/projects/options",
    "/api/admin/data-source",
    "/api/admin/performance/status",
    "/api/admin/member-review?month=2026-07",
    "/api/admin/kpi-close?month=2026-07",
  ]) {
    const response = await page.context().request.get(endpoint);
    expect(response.status(), `${endpoint}: ${await response.text()}`).toBe(
      200,
    );
  }
});

test("Preview-only Member identity cannot access Admin and sees only member routes", async ({
  page,
}) => {
  test.skip(
    !previewSecret || !previewMember,
    "Preview test credentials were not supplied to Playwright.",
  );
  await signInPreview(page, previewMember!);
  await page.goto("/admin/sync");
  await expect(page).toHaveURL(/\/$/);
  for (const path of ["/dashboard", "/my-urls", "/my-kpi"]) {
    await page.goto(path);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
  const adminApi = await page
    .context()
    .request.get("/api/admin/source-pipeline/status");
  expect(adminApi.status()).toBe(403);
});
