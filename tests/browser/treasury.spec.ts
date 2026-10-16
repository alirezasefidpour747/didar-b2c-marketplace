import { test, expect } from "@playwright/test";
test("Gate 2 treasury UI records and approves a synthetic purchase through real APIs", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.goto("/manage/treasury");
  await expect(
    page.getByRole("heading", {
      name: "تدارک طلا، خزانه و تسویه",
      exact: true,
    }),
  ).toBeVisible();
  const f = page
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "ثبت خرید آزمایشی",
          exact: true,
        }),
      }),
    doc = "purchase-ui-" + crypto.randomUUID();
  for (const [name, value] of Object.entries({
    counterparty: "خرید آزمایشی",
    document: doc,
    weight_mg: "1000",
    purity: "995",
    cost_irr: "100000000",
    rate_irr: "65000000",
    custody: "گاوصندوق آزمایشی",
    reason: "آزمون مرورگر خرید",
  }))
    await f.locator(`[name="${name}"]`).fill(value);
  await f.locator('[name="title_confirmed"]').selectOption("yes");
  await f
    .getByRole("button", { name: "ثبت خرید آزمایشی", exact: true })
    .click();
  const p = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: new RegExp(doc) }) });
  await expect(p).toBeVisible();
  await p.getByLabel("دلیل تأیید خرید").fill("تأیید آزمایشی مرورگر");
  await p
    .getByRole("button", { name: "تأیید خرید ثبت‌شده", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "تأیید خرید ثبت‌شده", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "گردش خزانه و تسویه", exact: true }),
  ).toBeVisible();
});
