import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { browserLaunchOptions } from "./browser-options.mjs";
export async function bootstrapAcceptance(env) {
  const origin = env.TEST_API_URL;
  const browser = await chromium.launch({
    headless: true,
    ...browserLaunchOptions(env),
  });
  try {
    const page = await browser.newPage({ locale: "fa-IR" }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const auth = await fetch(origin + "/auth/user/emailpass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: env.DIDAR_BOOTSTRAP_EMAIL,
        password: env.NATIVE_BOOTSTRAP_PASSWORD,
      }),
    });
    if (!auth.ok) throw Error("First native Admin HTTP sign-in failed");
    const token = (await auth.json()).token;
    const denied = await fetch(origin + "/admin/products", {
      headers: { authorization: "Bearer " + token },
    });
    if (denied.status !== 403)
      throw Error("Unlinked first Admin received unapproved generic rights");
    await page.goto(origin + "/dashboard/login");
    await page.locator("input[name=email]").fill(env.DIDAR_BOOTSTRAP_EMAIL);
    await page
      .locator("input[name=password]")
      .fill(env.NATIVE_BOOTSTRAP_PASSWORD);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((u) => u.pathname !== "/dashboard/login");
    await page.goto(origin + "/dashboard/didar/connect");
    await page.getByLabel("ایمیل حساب دیدار").fill(env.DIDAR_BOOTSTRAP_EMAIL);
    await page.getByLabel("رمز حساب دیدار").fill(env.DIDAR_BOOTSTRAP_PASSWORD);
    await page
      .getByRole("button", { name: "اتصال امن حساب", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "اتصال حساب موجود دیدار", exact: true })
      .waitFor({ state: "hidden" });
    const products = await fetch(origin + "/admin/products", {
      headers: { authorization: "Bearer " + token },
    });
    if (!products.ok)
      throw Error(
        "First Admin did not gain verified approved rights after dual proof",
      );
    await page.goto(origin + "/dashboard/didar/connections");
    await page
      .getByRole("heading", {
        name: "پیوند فروشگاه Mercur و تأمین‌کننده دیدار",
        exact: true,
      })
      .waitFor();
    mkdirSync(".local/evidence/issue13", { recursive: true });
    await page.screenshot({
      path: ".local/evidence/issue13/first-admin-no-demo.png",
      fullPage: true,
    });
    if (errors.length)
      throw Error("First Admin browser errors: " + errors.join("; "));
    console.log("C09_FIRST_ADMIN_HTTP_BROWSER_DUAL_PROOF_PASS");
  } finally {
    await browser.close();
  }
}
