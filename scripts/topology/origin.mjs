import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const config = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
const rootRequire = createRequire(join(config.repository, 'package.json'))
const { chromium } = rootRequire('@playwright/test')
const sharp = createRequire(join(config.repository, 'packages/api/package.json'))('sharp')
const { browserLaunchOptions } = await import(pathToFileURL(join(config.repository, 'scripts/local/browser-options.mjs')))
const image = await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#142d50' } }).png().toBuffer()
const browser = await chromium.launch({ ...browserLaunchOptions(process.env), headless: true })
const output = config.origin_output; await mkdir(output, { recursive: true })
let success = false, result
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage()
  await page.goto(config.origin + '/login')
  const uploadRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/didar/content-media' && request.method() === 'POST')
  const evaluation = page.evaluate(async data => {
    const login = await fetch('/api/didar/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@didar.test', password: 'DidarDemo2026!' }) })
    const canonical = await login.json()
    if (login.status !== 200 || !canonical.token) return { login: login.status, upload: null }
    const upload = await fetch('/api/didar/content-media', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + canonical.token }, body: JSON.stringify({ operation: 'upload', supplier_id: 'DIDAR', idempotency_key: crypto.randomUUID(), mime_type: 'image/png', data, alt: 'Disposable topology same-origin media' }) })
    const body = await upload.json()
    return { login: login.status, upload: upload.status, asset_created: typeof body.id === 'string' }
  }, image.toString('base64'))
  const actual = await uploadRequest, headers = await actual.allHeaders()
  result = await evaluation
  assert.equal(headers.origin, config.origin)
  assert.equal(new URL(actual.url()).origin, config.origin)
  assert.equal(result.login, 200); assert.equal(result.upload, 200); assert.equal(result.asset_created, true)
  success = true
  await context.close()
} finally {
  await browser.close()
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success ? 'PASS' : 'FAIL', ...result, origin: config.origin, behavior: 'Actual Chromium-generated Origin POST to Next content-media through non443 fixed-authority Nginx; original Origin check unchanged', qa_tls: 'Ephemeral disposable QA browser context only; separate Node/curl probes require QA CA plus hostname validation', token_or_password_recorded: false }, null, 2) + '\n')
}
