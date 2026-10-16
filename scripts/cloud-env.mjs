import { ensureLocalConfig } from './local/runtime.mjs'
try {
  ensureLocalConfig()
  console.log('Local sandbox configuration validated; existing values preserved.')
} catch (error) { console.error(error.message); process.exitCode = 1 }
