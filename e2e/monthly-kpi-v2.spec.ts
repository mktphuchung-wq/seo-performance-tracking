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
  await expect(page.getByRole("heading", { name: "KPI tháng 2026-07" })).toBeVisible();
  await expect(page.getByLabel("Thành viên")).toHaveValue("Hướng Dương");
  await expect(page.getByText("88.0% · 2.640.000 VND")).toBeVisible();
  await expect(page.getByRole("link", { name: "https://example.test/fixture-content" })).toBeVisible();

  await page.getByRole("button", { name: /Chạy thử đối soát/ }).click();
  await expect(page.getByText("Thao tác quy trình đã hoàn tất.")).toBeVisible();
  await page.getByRole("button", { name: /Lưu bằng chứng thô/ }).click();
  await page.getByRole("button", { name: "3. Lưu sự kiện đã duyệt" }).click();

  await page.getByLabel("Đơn vị chỉ tiêu").fill("22");
  await page.getByRole("button", { name: "Lưu chỉ tiêu" }).click();
  await page.getByRole("button", { name: "Đánh giá", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Đánh giá chất lượng" })).toBeVisible();
  await page.getByLabel("Bằng chứng / lý do").fill("Bằng chứng E2E cho URL chuẩn hóa");
  await page.getByRole("button", { name: "Phê duyệt đánh giá" }).click();

  await page.getByRole("button", { name: /Làm mới Performance đủ trưởng thành/ }).click();
  await page.getByLabel("Điểm Kỷ luật").fill("100");
  await page.getByLabel("Điểm Mạng xã hội / Video").fill("90");
  await page.getByRole("button", { name: "Phê duyệt điểm thủ công" }).click();
  await page.getByRole("button", { name: "Tính bản xem trước" }).click();
  await expect(page.getByText("88.0% · 2.640.000 VND")).toBeVisible();
  await page.getByRole("button", { name: "Hoàn tất và khóa snapshot shadow" }).click();

  await page.goto(`${adminPath}&locked=1`);
  await expect(page.getByText(/Đã khóa v1 · chỉ đọc/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tính bản xem trước" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mở lại thành phiên bản mới" })).toBeVisible();
});

test("member view is read-only and ignores attempts to select another member", async ({ page }) => {
  await page.goto("/kpi-month/2026-07?member=Nh%C6%B0%20Tuy%E1%BB%81n");
  await expect(page.getByRole("heading", { name: "Hướng Dương · 2026-07" })).toBeVisible();
  await expect(page.getByText("Như Tuyền")).toHaveCount(0);
  await expect(page.getByText(/Bằng chứng chỉ đọc/)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});
