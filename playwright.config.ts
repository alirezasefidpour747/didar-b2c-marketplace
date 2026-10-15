import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.TEST_STOREFRONT_URL || "http://localhost:3000",
    headless: true,
    actionTimeout: 20000,
    navigationTimeout: 30000,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  reporter: "list",
});
