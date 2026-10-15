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
