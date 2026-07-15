import { expect,test } from "@playwright/test";

test("public entry renders a meaningful sign-in surface without an error overlay",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"SEO Performance Workspace"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Sign in with Google"})).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});

test("Admin and Member workspaces are isolated from anonymous users",async({page,request})=>{
  await page.goto("/admin/sync");
  await expect(page).toHaveURL(/\/$/);
  const memberApi=await request.get("/api/me/performance");
  expect(memberApi.status()).toBe(401);
});

test("legacy write endpoints are read-only during migration",async({request})=>{
  for(const endpoint of ["/api/sync/sheet","/api/refresh/cache","/api/project-kpi-settings","/api/admin/monthly-kpi-settings"]){
    const response=await request.post(endpoint,{data:{}});
    expect(response.status(),endpoint).toBe(410);
  }
});
