// Let Playwright choose its platform/architecture-specific browser by default.
// Cloud runners may explicitly select system Chromium and disable the sandbox.
export function browserLaunchOptions(env = process.env) {
  return {
    ...(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : {}),
    ...(env.PLAYWRIGHT_NO_SANDBOX === '1' ? { args: ['--no-sandbox'] } : {}),
  }
}
