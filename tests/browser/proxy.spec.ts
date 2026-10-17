import { test, expect } from "@playwright/test";
import { request as httpRequest } from "node:http";

test("storefront proxy rejects oversized chunked JSON before forwarding to the API", async ({
  baseURL,
}) => {
  const payload = JSON.stringify({ name: "x".repeat(1300000) });
  const status = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      new URL("/api/didar/register", baseURL!),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    request.on("error", reject);
    for (let offset = 0; offset < payload.length; offset += 65536)
      request.write(payload.slice(offset, offset + 65536));
    request.end();
  });
  expect(status).toBe(413);
});

test("an interrupted customer session bootstrap preserves the credential and a real retry restores the account", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("customer@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
  await page.route("**/api/didar/me", (route) => route.abort("failed"));
  await page.reload();
  await expect(page.getByRole("status")).toContainText("دریافت حساب ممکن نشد");
  expect(
    await page.evaluate(() => !!sessionStorage.getItem("didar-session")),
  ).toBe(true);
  await page.unroute("**/api/didar/me");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "خروج · مشتری نمونه", exact: true }),
  ).toBeVisible();
  const revoked = await page.evaluate(async () => {
    const token = sessionStorage.getItem("didar-session");
    return (await fetch("/api/didar/logout", {
      method:"POST", headers:{"content-type":"application/json", authorization:"Bearer "+token}, body:"{}",
    })).status;
  });
  expect(revoked).toBe(200);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem("didar-session"))).toBeNull();
  await expect(page.getByRole("button", {name:"خروج · مشتری نمونه",exact:true})).toHaveCount(0);

});
