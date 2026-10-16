import { test, expect } from "@playwright/test";
test("Gate 4 Persian aggregate close is dry-run, mock acknowledgement is idempotent, vendor mapping remains blocked", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.goto("/manage/tahesab");
  await expect(
    page.getByRole("heading", {
      name: "ته‌حساب؛ خروجی تجمیعی آزمایشی",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("BLOCKED_BY_SPEC");
  const map = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "ثبت نسخه نگاشت آزمایشی",
        exact: true,
      }),
    });
  await map.locator('[name="supplier_id"]').selectOption("s1");
  for (const [name, value] of Object.entries({
    merchant_code: "QA_S1",
    gold_code: "QA_GOLD",
    rial_code: "QA_RIAL",
    invoice_reference: "QA_S1_AGGREGATE",
    db_alias: "QA_DIDAR",
    reason: "نگاشت آزمایشی مرورگر",
  }))
    await map.locator(`[name="${name}"]`).fill(value);
  await map
    .getByRole("button", { name: "ثبت نسخه نگاشت آزمایشی", exact: true })
    .click();
  await expect(page.getByText(/مرجع فاکتور QA_S1_AGGREGATE/)).toBeVisible();
  const funded = await page.evaluate(async () => {
    const r = await fetch("/api/didar/wallet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + sessionStorage.getItem("didar-session"),
      },
      body: JSON.stringify({
        operation: "fund",
        party: "supplier:s1",
        instrument: "IRR",
        amount: "1",
        document: "QA aggregate browser source",
        reason: "Explicit merchant source for browser close",
        idempotency_key: crypto.randomUUID(),
      }),
    });
    return { http: r.status, ...(await r.json()) };
  });
  expect(funded.http).toBe(200);
  await expect
    .poll(() => Date.now() - new Date(funded.event.created_at).getTime())
    .toBeGreaterThan(1100);
  const close = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "تهیه خروجی تجمیعی آزمایشی",
        exact: true,
      }),
    });
  await close.locator('[name="supplier_id"]').selectOption("s1");
  await close
    .locator('[name="start_at"]')
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 19));
  await close
    .locator('[name="end_at"]')
    .fill(new Date().toISOString().slice(0, 19));
  await close
    .getByRole("button", { name: "تهیه خروجی تجمیعی آزمایشی", exact: true })
    .click();
  const row = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: /^DIDAR_QA_/ }) })
    .filter({ hasText: "هنوز صادر نشده" })
    .first();
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: "ثبت در شبیه‌ساز محلی", exact: true })
    .click();
  const ack = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: /^DIDAR_QA_/ }) })
    .filter({ hasText: "تأییدشده در شبیه‌ساز" });
  await expect(ack.first()).toBeVisible();
  await ack
    .first()
    .getByRole("button", { name: "تطبیق سند شبیه‌ساز", exact: true })
    .click();
  await expect(ack.first()).toBeVisible();
});
