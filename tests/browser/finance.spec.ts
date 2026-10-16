import { test, expect } from "@playwright/test";
test("Gate 1 Persian finance: admin contract request/review and supplier isolation", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.goto("/manage/finance");
  await expect(
    page.getByRole("heading", { name: "هسته مالی دیدار", exact: true }),
  ).toBeVisible();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "ثبت درخواست قرارداد",
        exact: true,
      }),
    });
  await form.locator('[name="supplier_id"]').selectOption("s1");
  await form.locator('[name="mode"]').selectOption("MIXED");
  await form.locator('[name="effective_at"]').fill("2020-01-01T12:00");
  const tag = "browser-fin-" + crypto.randomUUID();
  await form.locator('[name="reason"]').fill(tag);
  await form
    .getByRole("button", { name: "ثبت درخواست قرارداد", exact: true })
    .click();
  const row = page.locator("article").filter({ hasText: tag });
  await expect(row).toBeVisible();
  await row.getByLabel("دلیل بررسی مدیر").fill("Browser sandbox review");
  await row.getByRole("button", { name: "ثبت بررسی", exact: true }).click();
  await expect(row).toContainText("تأییدشده");
  const context = await browser.newContext();
  const s = await context.newPage();
  await s.goto("/login");
  await s.getByLabel("ایمیل", { exact: true }).fill("supplier@didar.test");
  await s.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await s.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    s.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await s.goto("/manage/finance");
  await expect(
    s.getByRole("heading", { name: "هسته مالی دیدار", exact: true }),
  ).toBeVisible();
  await expect(s.locator('select[name="supplier_id"] option')).toHaveCount(1);
  await expect(
    s.getByRole("button", { name: "ثبت بررسی", exact: true }),
  ).toHaveCount(0);
  await context.close();
});
