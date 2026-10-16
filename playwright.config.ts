import { defineConfig } from "@playwright/test";
import { browserLaunchOptions } from "./scripts/local/browser-options.mjs";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.TEST_STOREFRONT_URL || "http://localhost:3000",
    headless: true,
    actionTimeout: 20000,
    navigationTimeout: 30000,
    launchOptions: browserLaunchOptions(),
  },
  reporter: "list",
});
