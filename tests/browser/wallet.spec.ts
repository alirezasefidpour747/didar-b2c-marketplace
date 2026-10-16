import { test, expect } from "@playwright/test";
async function login(page: any, email: string) {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
}
test("Gate 3 Persian wallet UI funds/releases synthetic money and customer reserves without admin funding privileges", async ({
  page,
  browser,
}) => {
  await login(page, "admin@didar.test");
  await page.goto("/account/wallet");
  await expect(
    page.getByRole("heading", { name: "کیف پول طلا و ریال", exact: true }),
  ).toBeVisible();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "ثبت عملیات کیف پول آزمایشی",
        exact: true,
      }),
    });
  await form
    .getByRole("combobox", { name: "عملیات", exact: true })
    .selectOption("fund");
  await form.locator('[name="party"]').selectOption("customer:demo-customer");
  await form.getByLabel("مبلغ؛ ریال", { exact: true }).fill("1000");
  await form.getByLabel("سند واریز آزمایشی").fill("QA browser credit");
  await form.getByLabel("شرح عملیات کیف پول").fill("واریز آزمایشی مرورگر");
  await form
    .getByRole("button", { name: "ثبت عملیات کیف پول آزمایشی", exact: true })
    .click();
  await expect(
    page.getByText("واریز آزمایشی مرورگر", { exact: false }),
  ).toBeVisible();
  await form
    .getByRole("combobox", { name: "عملیات", exact: true })
    .selectOption("release");
  await form
    .getByRole("button", { name: "ثبت عملیات کیف پول آزمایشی", exact: true })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "customer:demo-customer" })
      .filter({ hasText: "قابل استفاده" }),
  ).toContainText("۱٬۰۰۰");
  const ctx = await browser.newContext(),
    customer = await ctx.newPage();
  await login(customer, "customer@didar.test");
  await customer.goto("/account/wallet");
  await expect(
    customer.getByRole("heading", { name: "کیف پول طلا و ریال", exact: true }),
  ).toBeVisible();
  const cf = customer.locator("form");
  await expect(cf.locator('select option[value="fund"]')).toHaveCount(0);
  await cf.getByLabel("مبلغ؛ ریال", { exact: true }).fill("200");
  await cf.getByLabel("شرح عملیات کیف پول").fill("رزرو آزمایشی مرورگر");
  await cf
    .getByRole("button", { name: "ثبت عملیات کیف پول آزمایشی", exact: true })
    .click();
  await expect(
    customer.getByRole("row").filter({ hasText: "رزروشده" }),
  ).toContainText("۲۰۰");
  await ctx.close();
  await page.goto("/manage/ledger");
  await expect(
    page.getByRole("heading", { name: "دفتر دوطرفه و تطبیق", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "تعداد سند نامتوازن:" }),
  ).toContainText("۰");
});
