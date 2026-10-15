import { test, expect } from "@playwright/test";
test("RTL catalog, supplier comparison, login, checkout and payment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "انگشتر طلای ماه" }),
  ).toBeVisible();
  await expect(page.locator(".product").first().locator(".offer")).toHaveCount(
    2,
  );
  await page
    .locator(".product")
    .first()
    .getByRole("button", { name: "افزودن به سبد +" })
    .first()
    .click();
  await page.getByRole("button", { name: "ورود / عضویت" }).click();
  await page.getByLabel("ایمیل", { exact: true }).fill("customer@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /سبد خرید/ }).click();
  await page.getByLabel("نام گیرنده").fill("مشتری آزمایشی");
  await page.getByLabel("شماره همراه").fill("09123456789");
  await page.getByLabel("شهر", { exact: true }).fill("تهران");
  await page.getByLabel("نشانی کامل").fill("خیابان آزمایشی، پلاک ۱");
  await page.getByLabel("کد پستی").fill("1234567890");
  await page.getByRole("button", { name: "ثبت و تأیید قیمت سفارش" }).click();
  await expect(
    page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "شبیه‌سازی پرداخت ناموفق" })
    .first()
    .click();
  await expect(
    page.getByText("پرداخت ناموفق", { exact: true }).first(),
  ).toBeVisible();
});
test("supplier interface displays only owned stock", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ورود / عضویت" }).click();
  await page.getByLabel("ایمیل", { exact: true }).fill("supplier@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.getByRole("button", { name: "مدیریت طلا" }).click();
  await expect(
    page.getByRole("heading", { name: "پنل تأمین‌کننده" }),
  ).toBeVisible();
  await expect(page.locator(".inventory-form")).toHaveCount(4);
  await expect(page.locator(".inventory-form").first()).toContainText(
    "زرین دیدار",
  );
});
test("admin interface manages gold rate and catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ورود / عضویت" }).click();
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.getByRole("button", { name: "مدیریت طلا" }).click();
  await expect(
    page.getByRole("heading", { name: "مدیریت بازار دیدار" }),
  ).toBeVisible();
  await expect(page.locator(".inventory-form")).toHaveCount(8);
  await page.getByRole("button", { name: "ذخیره نرخ" }).click();
  await expect(page.getByRole("status")).toContainText("نرخ ذخیره شد.");
});
