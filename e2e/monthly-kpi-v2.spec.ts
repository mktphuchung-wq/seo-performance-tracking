import { expect, test } from "@playwright/test";

const adminPath = "/admin/kpi-month/2026-07?member=H%C6%B0%E1%BB%9Bng%20D%C6%B0%C6%A1ng";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/kpi-month/2026-07/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload: Record<string, unknown> = { requestId: "e2e-request", ok: true };
    if (path.endsWith("/calculate")) payload.calculation = { results: [{ preview: { state: "scored", payablePct: 88, payoutVnd: 2_640_000 } }] };
    if (path.endsWith("/finalize")) payload.result = { status: "locked", payable_pct: 88, payout_vnd: 2_640_000, shadow_only: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
});

test("admin completes the fixture workflow and sees the locked shadow snapshot", async ({ page }) => {
  await page.goto(adminPath);
  await expect(page.getByRole("heading", { name: "KPI month 2026-07" })).toBeVisible();
  await expect(page.getByLabel("Member")).toHaveValue("Hướng Dương");
  await expect(page.getByText("88.0% · 2.640.000 VND")).toBeVisible();
  await expect(page.getByRole("link", { name: "https://example.test/fixture-content" })).toBeVisible();

  await page.getByRole("button", { name: /Dry-run reconciliation/ }).click();
  await expect(page.getByText("Workflow action completed.")).toBeVisible();
  await page.getByRole("button", { name: "Persist raw evidence" }).click();
  await page.getByRole("button", { name: "3. Persist approved events" }).click();

  await page.getByLabel("Target units").fill("22");
  await page.getByRole("button", { name: "Save target" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quality review" })).toBeVisible();
  await page.getByLabel("Evidence / reason").fill("E2E reviewer evidence for the canonical URL");
  await page.getByRole("button", { name: "Approve review" }).click();

  await page.getByRole("button", { name: "Refresh mature Performance" }).click();
  await page.getByLabel("Discipline / Attitude score").fill("100");
  await page.getByLabel("Social Content + Video score").fill("90");
  await page.getByRole("button", { name: "Approve manual scores" }).click();
  await page.getByRole("button", { name: "Calculate preview" }).click();
  await expect(page.getByText("88.0% · 2.640.000 VND")).toBeVisible();
  await page.getByRole("button", { name: "Finalize & lock shadow snapshot" }).click();

  await page.goto(`${adminPath}&locked=1`);
  await expect(page.getByText(/Locked v1 · read-only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate preview" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reopen as new version" })).toBeVisible();
});

test("member view is read-only and ignores attempts to select another member", async ({ page }) => {
  await page.goto("/kpi-month/2026-07?member=Nh%C6%B0%20Tuy%E1%BB%81n");
  await expect(page.getByRole("heading", { name: "Hướng Dương · 2026-07" })).toBeVisible();
  await expect(page.getByText("Như Tuyền")).toHaveCount(0);
  await expect(page.getByText("Read-only evidence.")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});
