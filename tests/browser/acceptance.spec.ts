import { test, expect } from "@playwright/test";
test("Gate 5 Persian reconciliation screen records DB-derived checks without claiming Mac or live financial acceptance", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.goto("/manage/acceptance");
  await expect(
    page.getByRole("heading", {
      name: "پذیرش یکپارچه مالی دیدار",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "کنترل‌های تطبیق نرم‌افزاری پاس شدند",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("شناسه کامل نسخه بررسی‌شده؛ ۴۰ نویسه هگز")
    .fill("0e569d4d912c5a43739f8a5c8714dae080d73f7a");
  await page
    .getByRole("button", {
      name: "ثبت گزارش کنترل‌های نرم‌افزاری",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator("article")
      .filter({ hasText: "0e569d4d912c5a43739f8a5c8714dae080d73f7a" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("آزمون انسانی مک و RFID واقعی هنوز انجام نشده‌اند.", {
      exact: false,
    }),
  ).toBeVisible();
});
