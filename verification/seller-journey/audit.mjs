// External QA client. Never copied into an application image or used on staging.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import https from 'node:https'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { resolve, join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { privateJSON } from '../fresh-install/browser.mjs'

export const applicationSource = '0c4b047baa9dbe37cd1876159c15d22b40cf7cac'
const digest = b => createHash('sha256').update(b).digest('hex')
export function validateAuditContext(c, output, env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Disposable Actions only')
  assert.equal(env.GITHUB_REF, 'refs/heads/audit/seller-journey-feedback-loop')
  assert.equal(c.browser?.source_sha, applicationSource)
  const u = new URL(c.browser.origin)
  assert.equal(u.protocol, 'https:'); assert.ok(['127.0.0.1', 'localhost'].includes(u.hostname))
  assert.equal(u.pathname, '/'); assert.equal(u.username + u.password + u.search + u.hash, '')
  const outside = relative(resolve(output), resolve(c.browser.fixture_file))
  assert.ok(outside === '..' || outside.startsWith('..' + sep), 'Private credentials must not be uploaded')
  for (const role of ['api', 'storefront', 'postgres', 'redis']) assert.match(c.ids[role], /^[a-f0-9]{64}$/)
}

export async function execute(contextFile, output) {
  const c = privateJSON(resolve(contextFile)); output = resolve(output)
  validateAuditContext(c, output, process.env)
  await mkdir(output, { recursive: true, mode: 0o700 })
  const secretValues = [c.admin.DIDAR_BOOTSTRAP_PASSWORD, c.admin.NATIVE_BOOTSTRAP_PASSWORD, c.env.DIDAR_AUTH_NETWORK_KEY, c.env.JWT_SECRET, c.env.COOKIE_SECRET, c.env.DIDAR_DB_PASSWORD].filter(Boolean)
  const safe = text => secretValues.reduce((t, value) => t.split(value).join('[REDACTED]'), String(text)).replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[TOKEN_REDACTED]').slice(0,1200)
  const rows = [], http = [], captions = [], gaps = [], screenshots = [], processExits = []
  const source = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
  assert.equal(source.status, 0)
  const auditSource = source.stdout.trim(), ca = await readFile(c.browser.ca_file)
  const save = (name, value) => writeFile(join(output, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  let fatalDiagnostic = null
  const privacyMasks = []
  let privacyTimer, privacyBusy = false
  let browser, bc, page, video, start = Date.now(), success = false, current = 'preflight'
  const api = async (label, path, { token = '', seller, body, expected = [200] } = {}) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const result = await new Promise((done, reject) => {
      const req = https.request(new URL(path, c.browser.origin), { method: payload ? 'POST' : 'GET', ca, rejectUnauthorized: true, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(seller ? { 'x-seller-id': seller } : {}), ...(payload ? { 'content-length': payload.length } : {}) } }, res => {
        const parts = []; let length = 0
        res.on('data', p => { length += p.length; if (length > 8 * 1024 ** 2) req.destroy(Error('BODY_LIMIT')); else parts.push(p) })
        res.on('end', () => { try { done({ status: res.statusCode, data: JSON.parse(Buffer.concat(parts)) }) } catch { reject(Error('NON_JSON_RESPONSE')) } })
      }); req.setTimeout(45000, () => req.destroy(Error('HTTPS_TIMEOUT'))); req.on('error', reject); req.end(payload)
    })
    http.push({ label, path: path.split('?')[0], method: payload ? 'POST' : 'GET', status: result.status, expected })
    assert.ok(expected.includes(result.status), 'HTTP_' + label + '_' + result.status)
    return result.data
  }
  const login = async (path, email, password) => (await api('login_' + path, path, { body: { email, password } })).token
  const docker = (stage, args) => {
    const r = spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 ** 2, timeout: 120000 })
    processExits.push({ stage, code: r.status, signal: r.signal, spawn_error: r.error?.code || null })
    assert.equal(r.status, 0, stage); assert.equal(r.signal, null); assert.equal(r.error, undefined)
    return r.stdout.trim()
  }
  const step = async (id, text, fn, { optionalUI = false } = {}) => {
    current = id; captions.push({ at_ms: Date.now() - start, text })
    try { const result = await fn(); rows.push({ id, status: 'OBSERVED', at_ms: Date.now() - start }); await page.waitForTimeout(1300); return result }
    catch (e) {
      rows.push({ id, status: 'FAIL', diagnostic: safe(e.message), error_sha256: digest(String(e.message)), at_ms: Date.now() - start })
      if (!optionalUI) throw e
      gaps.push({ id, status: 'NOT_MET_UI_PATH', detail: 'Observed UI step failed; see actual screenshot/video. Subsequent API-assisted exploration is separate, not a successful UI fallback.' })
      await shot(id + '-failure'); return null
    }
  }
  const shot = async name => { const path = join(output, name + '.png'); await page.screenshot({ path, fullPage: true, mask:[page.locator('input[type=email],input[name=email],input[type=password]'),page.getByText(/[^\s]+@[^\s]+\.invalid/,{exact:true})], maskColor:'#000000' }); screenshots.push({ file: name + '.png', sha256: digest(await readFile(path)) }) }
  const waitPost = (path, status = 200) => {
    const p = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === 'POST', { timeout: 45000 }); p.catch(() => {})
    return async () => { const r = await p; assert.ok((Array.isArray(status) ? status : [status]).includes(r.status()), 'UI_POST_' + path + '_' + r.status()); return r.json() }
  }
  const reset = async () => { await page.goto(c.browser.origin + '/login'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await bc.clearCookies() }
  const signIn = async (surface, email, password, sellerName) => {
    await reset(); await page.goto(c.browser.origin + '/' + surface + '/login')
    await page.locator('input[name=email]').fill(email); await page.locator('input[name=password]').fill(password)
    const done = waitPost('/auth/' + (surface === 'seller' ? 'member' : 'user') + '/emailpass')
    await page.locator('button[type=submit]').click(); await done()
    if (surface === 'seller') { await page.waitForURL(u => u.pathname === '/seller/store-select'); await page.getByRole('button').filter({ hasText: sellerName }).click() }
    await page.waitForURL(u => !u.pathname.endsWith('/login') && !u.pathname.endsWith('/store-select'))
  }
  const nativePage = async (surface, route = '/didar') => { await page.goto(c.browser.origin + '/' + surface + route); await page.getByRole('button', { name: 'تازه‌سازی مدیریت', exact: true }).waitFor({ state: 'visible' }) }
  const adminManage = async tab => { await nativePage('dashboard'); await page.getByRole('button', { name: tab, exact: true }).click() }
  const sql = (stage, query) => {
    const output = docker(stage, ['exec', c.ids.postgres, 'psql', '--no-psqlrc', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', c.env.DIDAR_DB_USER, '-d', c.env.DIDAR_DB_NAME, '-c', 'BEGIN READ ONLY; ' + query + '; COMMIT;'])
    return JSON.parse(output.split('\n').find(x => x.trim().startsWith('{')))
  }
  const metrics = stage => JSON.parse('[' + docker(stage, ['stats', '--no-stream', '--format', '{{json .}}', ...Object.values(c.ids)]).split('\n').join(',') + ']')
  let ids = {}, admin, canonicalAdmin, member, supplierToken, seller, sid, leaf
  const suffix = randomBytes(8).toString('hex'), business = 'آزمون فروشنده ' + suffix
  const email = 'seller-' + suffix + '@audit.didar.invalid', password = 'A1!' + randomBytes(24).toString('base64url')
  const supplierEmail = 'supplier-' + suffix + '@audit.didar.invalid', supplierPassword = 'S1!' + randomBytes(24).toString('base64url')
  secretValues.push(password, supplierPassword, email, supplierEmail, c.admin.DIDAR_BOOTSTRAP_EMAIL)
  try {
    const verdict = JSON.parse(await readFile(join(c.browser.output_dir, '..', 'result-complete.json')))
    assert.equal(verdict.status, 'PASS_SCOPED_FRESH_INSTALL_QA')
    const ownership = privateJSON(c.environmentFile + '.didar-nginx-state.json')
    assert.equal(ownership.phase,'HEALTHY'); assert.equal(ownership.source_sha,applicationSource)
    assert.deepEqual(ownership.containers,{api:c.ids.api,storefront:c.ids.storefront})
    assert.equal(c.project,c.env.DIDAR_COMPOSE_PROJECT); assert.equal(c.operation.project,c.project)
    for(const role of ['postgres','redis'])assert.equal(c.ids[role],c.operation.backup.source_container_ids[role])
    const dependencyOwners=[]
    for (const role of ['api', 'storefront', 'postgres', 'redis']) {
      const image = JSON.parse(docker('verify_audit_image_' + role, ['inspect', c.ids[role]]))[0]
      assert.equal(image.Config.Labels['didar.disposable-qa'], 'true'); assert.equal(image.Config.Labels['com.docker.compose.project'], c.project)
      if (role === 'postgres' || role === 'redis') {
        assert.match(image.Config.Labels['didar.fresh-owner'],/^[a-f0-9]{48}$/); dependencyOwners.push(image.Config.Labels['didar.fresh-owner'])
      }
      if (role === 'api' || role === 'storefront') {
        assert.equal(image.Config.Labels['org.opencontainers.image.revision'], applicationSource)
        assert.equal(image.Image, role === 'api' ? 'sha256:1ffb2c40294dd899bfe6c4c76224cf7d0e3d5fe7e75e732e12f5d0a15c8911cf' : 'sha256:b928edafdf670fa6ace1fcff550571d73cc5828b3bfdb2d0ed4a9ed914c86d10')
      }
    }
    assert.equal(dependencyOwners[0],dependencyOwners[1])
    const before = sql('baseline_authority_counts', "SELECT json_build_object('orders',(SELECT count(*) FROM didar_order),'payments',(SELECT count(*) FROM didar_payment_attempt),'journals',(SELECT count(*) FROM didar_fin_journal))")
    await save('runtime-before.json', { samples: metrics('runtime_before'), runner: c.runnerRuntime, capacity_is_not_load_test: true })
    const require = createRequire(resolve('package.json')), { chromium } = require('@playwright/test')
    browser = await chromium.launch({ headless: true })
    bc = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, recordVideo: { dir: join(output, 'raw-video'), size: { width: 1280, height: 900 } } })
    page = await bc.newPage(); video = page.video(); start = Date.now()
    page.setDefaultTimeout(18000)
    const observePrivacy = async () => {
      if (privacyBusy) return
      privacyBusy=true
      try {
        const rects=await page.evaluate(()=>{
          const boxes=[];const add=r=>{if(r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight) boxes.push({x:Math.max(0,Math.floor(r.x)-6),y:Math.max(0,Math.floor(r.y)-6),w:Math.ceil(r.width)+12,h:Math.ceil(r.height)+12})}
          for(const e of document.querySelectorAll('input[type=email],input[name=email],input[type=password]'))add(e.getBoundingClientRect())
          const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT)
          let node;while((node=walker.nextNode()))if(!['SCRIPT','STYLE'].includes(node.parentElement?.tagName)&&/[^\s]+@[^\s]+/.test(node.textContent||'')){const r=document.createRange();r.selectNodeContents(node);add(r.getBoundingClientRect())}
          return boxes
        })
        privacyMasks.push({at_ms:Date.now()-start,rects})
      } catch {} finally {privacyBusy=false}
    }
    await observePrivacy(); privacyTimer=setInterval(observePrivacy,100)
    let nativeRegistered = false
    const nativeRegistrationUI = await step('native-registration', 'محیط disposable؛ نسخهٔ برنامه ثابت است. ثبت‌نام واقعی عضو Mercur؛ نه تأیید تجاری دیدار.', async () => {
      await page.goto(c.browser.origin + '/seller/register')
      await page.locator('input[name=first_name]').fill('آزمون'); await page.locator('input[name=last_name]').fill(suffix)
      await page.locator('input[name=email]').fill(email); await page.locator('input[name=password]').fill(password)
      const done = waitPost('/auth/member/emailpass/register', [200,201]); await page.locator('button[type=submit]').click(); await done(); nativeRegistered = true
      await page.waitForURL(u => u.pathname === '/seller/onboarding'); await shot('native-registration-onboarding'); return true
    }, {optionalUI: true})
    if (!nativeRegistered) { await api('API_ASSISTED_native_registration', '/auth/member/emailpass/register', {body:{email,password},expected:[200,201]}); nativeRegistered = true }
    if (!nativeRegistrationUI) gaps.push({id:'NATIVE_REGISTRATION_UI',status:'NOT_MET_UI_PATH'})
    member = await login('/auth/member/emailpass', email, password)
    const uiSeller = await step('native-shop-setup', 'راه‌اندازی عمومی فروشگاه: ارز، نشانی، شرکت و پرداخت؛ این فرم، پذیرش طلای دیدار نیست.', async () => {
      await page.locator('input[name=name]').fill(business); await page.locator('input[name=email]').fill(email)
      await page.getByRole('combobox').click(); const options = page.getByRole('option'); await options.first().waitFor()
      const currencies = await options.allTextContents(); await save('native-currencies.json', { options: currencies })
      await options.first().click(); await page.locator('button[type=submit]').click()
      for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /Skip|رد کردن|صرف.?نظر|بعداً|فعلاً/i }).click()
      const done = waitPost('/vendor/sellers', 201); await page.getByRole('button', { name: /Skip|رد کردن|صرف.?نظر|بعداً|فعلاً/i }).click(); return done()
    }, { optionalUI: true })
    if (uiSeller) seller = uiSeller.seller.id
    else {
      captions.push({ at_ms: Date.now() - start, text: 'مسیر UI بالا ناقص/ناموفق است؛ ادامه صرفاً با API موجود برای بررسی مستقل مراحل بعدی، نه اصلاح برنامه.' })
      const own = await api('own_native_sellers_before_fallback', '/vendor/sellers', {token:member,expected:[200]})
      const existing = (own.seller_members || []).map(x=>x.seller).find(x => x.name === business)
      seller = existing?.id || (await api('API_ASSISTED_native_shop_setup', '/vendor/sellers', { token: member, body: { name: business, email, member_email: email, currency_code: 'irr' }, expected: [201] })).seller.id
    }
    member = await login('/auth/member/emailpass', email, password)
    ids.native_seller = seller
    await api('select_pending_native_store', '/vendor/sellers/select', { token: member, body: { seller_id: seller } })
    await api('unlinked_native_gold_denied', '/vendor/didar/onboarding', { token: member, seller, expected: [403] })
    await api('pending_native_generic_product_denied', '/vendor/products', { token: member, seller, body: { title: business }, expected: [409] })
    await step('canonical-supplier-registration', 'ثبت‌نام مستقل تأمین‌کنندهٔ دیدار؛ حساب بومی قبلی خودکار به این هویت متصل نمی‌شود.', async () => {
      await reset(); await page.goto(c.browser.origin + '/login?register=supplier')
      await page.locator('input[name=name]').fill(business); await page.locator('input[name=email]').fill(supplierEmail); await page.locator('input[name=password]').fill(supplierPassword)
      const done = waitPost('/api/didar/register'); await page.getByRole('button', { name: 'ایجاد حساب', exact: true }).click(); const data = await done()
      sid = data.user.supplier_id; supplierToken = data.token; ids.canonical_supplier = sid
      await page.waitForURL(u => u.pathname.startsWith('/manage')); await shot('canonical-registration-pending')
    })
    await api('pending_supplier_store_denied', '/didar/storefront', { token: supplierToken, body: { kind: 'save', supplier_id: sid, handle: 'audit-' + suffix, name: business, published: true }, expected: [403] })
    admin = await login('/auth/user/emailpass', c.admin.DIDAR_BOOTSTRAP_EMAIL, c.admin.NATIVE_BOOTSTRAP_PASSWORD)
    canonicalAdmin = await login('/didar/login', c.admin.DIDAR_BOOTSTRAP_EMAIL, c.admin.DIDAR_BOOTSTRAP_PASSWORD)
    await step('admin-commercial-review', 'بررسی و تأیید تجاری در Admin بومی؛ این تصمیم با تأیید Seller عمومی دو رکورد مستقل دارد.', async () => {
      await signIn('dashboard', c.admin.DIDAR_BOOTSTRAP_EMAIL, c.admin.NATIVE_BOOTSTRAP_PASSWORD)
      await adminManage('تأمین‌کنندگان')
      const card = page.locator('[data-supplier-id="' + sid + '"]'); await card.getByRole('button', { name: 'تأیید تأمین‌کننده', exact: true }).click()
      await page.waitForTimeout(600)
      const state = await api('canonical_supplier_review_verified', '/admin/didar/manage', { token: admin }); assert.equal(state.suppliers.find(s => s.id === sid).status, 'approved'); await shot('admin-supplier-reviewed')
    })
    await step('managed-store-before-vendor-link', 'دیدار می‌تواند پیش از اتصال Vendor ویترین را مدیریت کند؛ ویترین خالی، کالای قابل فروش نیست.', async () => {
      await page.goto(c.browser.origin + '/dashboard/didar/storefront'); await page.getByLabel('فروشنده ویترین').selectOption(sid)
      const form = page.locator('form').filter({ has: page.locator('input[name=handle]') })
      await form.locator('input[name=handle]').fill('audit-' + suffix); await form.locator('input[name=name]').fill(business)
      await form.locator('select[name=visibility]').selectOption('UNLISTED_LINK'); await form.locator('input[name=published]').check(); await form.locator('input[name=approved]').check()
      const done = waitPost('/admin/didar/storefront'); await form.getByRole('button', { name: 'ذخیره ویترین', exact: true }).click(); await done()
      const publicStore = await api('managed_empty_public_store', '/api/didar/storefront?handle=audit-' + suffix); assert.equal(publicStore.store.supplier_id, sid); await shot('admin-managed-store'); await page.goto(c.browser.origin + '/m/audit-' + suffix); await page.getByText(business,{exact:false}).first().waitFor(); await shot('public-managed-empty-store')
    })
    await step('native-approval-and-explicit-link', 'تأیید مستقل Seller و اتصال صریح به تأمین‌کننده با API بومی Admin؛ پیوند از روی ایمیل حدس زده نمی‌شود.', async () => {
      await page.goto(c.browser.origin + '/dashboard/sellers/' + seller)
      await api('native_seller_review_approve', '/admin/sellers/' + seller + '/approve', { token: admin, body: {} })
      await api('explicit_native_supplier_mapping', '/admin/didar/seller-links', { token: admin, body: { seller_id: seller, supplier_id: sid } })
      await shot('native-seller-independent-review')
    })
    await step('vendor-dual-proof', 'ورود Vendor با هویت بومی و اثبات جداگانهٔ حساب دیدار؛ مالک بودن Seller مجوز نوشتن طلا نمی‌دهد.', async () => {
      await signIn('seller', email, password, business); await page.goto(c.browser.origin + '/seller/didar')
      await page.getByLabel('ایمیل حساب دیدار', { exact: true }).fill(supplierEmail); await page.getByLabel('رمز حساب دیدار', { exact: true }).fill(supplierPassword)
      const done = waitPost('/vendor/didar/connect'); await page.getByRole('button', { name: 'اتصال امن حساب', exact: true }).click(); await done(); await shot('vendor-linked-no-gold-grant')
    })
    const owned = await api('owned_onboarding_after_link', '/vendor/didar/onboarding', { token: member, seller }); assert.equal(owned.supplier.id, sid)
    const leaves = owned.categories.filter(x => x.kind === 'subcategory'); assert.ok(leaves.length); leaf = leaves[0]
    const proposal = { operation: 'request', supplier_id: sid, title: 'طلای آزمایشی ' + suffix, slug: 'audit-' + suffix, purity: 750, category_id: leaf.id, sku: 'QA-' + suffix, making_mode: 'percent', making_bps: 1200, active: true, idempotency_key: 'audit-' + suffix }
    await api('no_grant_product_request_denied', '/vendor/didar/onboarding', { token: member, seller, body: proposal, expected: [403] })
    const grant = (permission, granted) => api('admin_grant_' + permission + '_' + granted, '/admin/didar/permissions', { token: admin, body: { supplier_id: sid, permission, granted } })
    await grant('REQUEST_PRODUCT_CREATION', true)
    await api('wrong_supplier_after_valid_grant_denied', '/vendor/didar/onboarding', { token: member, seller, body: { ...proposal, supplier_id: privateJSON(c.browser.fixture_file).supplier_id }, expected: [403] })
    let request
    await step('gold-product-native-ui-submission', 'با مجوز صریح، پیشنهاد محصول طلا در فرم دیدار داخل Vendor بومی؛ هنوز Product یا Offer ایجاد نشده است.', async () => {
      await page.goto(c.browser.origin + '/seller/didar/onboarding'); const form = page.locator('form').filter({ has: page.locator('input[name=sku]') })
      await form.locator('input[name=title]').fill(proposal.title); await form.locator('input[name=slug]').fill(proposal.slug)
      const parent = owned.categories.find(x => x.id === leaf.parent_id)
      await form.getByLabel('خانواده', { exact: true }).selectOption(parent.parent_id); await form.getByLabel('دسته اصلی').selectOption(parent.id); await form.getByLabel('زیردسته', { exact: true }).selectOption(leaf.id)
      await form.locator('input[name=sku]').fill(proposal.sku)
      const done = waitPost('/vendor/didar/onboarding'); await form.getByRole('button', { name: 'ارسال برای بررسی دیدار', exact: true }).click(); request = (await done()).id; assert.ok(request); await shot('vendor-gold-proposal')
    })
    ids.request = request
    const rejectInput = { ...proposal, title: 'درخواست ردشونده ' + suffix, idempotency_key: 'reject-' + suffix }
    const rejected = await api('second_request_for_rejection', '/vendor/didar/onboarding', { token: member, seller, body: rejectInput })
    const replayed = await api('same_product_request_intent_replay', '/vendor/didar/onboarding', {token:member,seller,body:rejectInput}); assert.equal(replayed.id,rejected.id)
    await api('changed_product_request_intent_denied', '/vendor/didar/onboarding', {token:member,seller,body:{...rejectInput,title:rejectInput.title+' changed'},expected:[409]})
    await step('admin-request-reject-and-approve', 'بررسی محصول در Admin: یک درخواست رد می‌شود؛ درخواست دیگر با طبقه‌بندی معتبر به Master اصلی متصل می‌شود.', async () => {
      await signIn('dashboard', c.admin.DIDAR_BOOTSTRAP_EMAIL, c.admin.NATIVE_BOOTSTRAP_PASSWORD); await adminManage('کاتالوگ و تصاویر')
      const rejectCard = page.locator('[data-request-id="' + rejected.id + '"]'); await rejectCard.locator('select[name=decision]').selectOption('rejected'); await rejectCard.locator('input[name=reason]').fill('رد آزمایشی؛ بدون محصول یا موجودی')
      let done = waitPost('/admin/didar/manage'); await rejectCard.getByRole('button', { name: 'ثبت تصمیم درخواست' }).click(); await done()
      const acceptCard = page.locator('[data-request-id="' + request + '"]'); await acceptCard.locator('select[name=category_id]').selectOption(leaf.id)
      done = waitPost('/admin/didar/manage'); await acceptCard.getByRole('button', { name: 'ثبت تصمیم درخواست' }).click(); const approved = await done(); ids.product = approved.product_id; assert.ok(ids.product); await shot('admin-product-reviewed')
    })
    const approvedState = await api('approved_request_separate_from_offer', '/vendor/didar/onboarding', { token: member, seller }); const master = approvedState.products.find(p => p.id === ids.product); assert.ok(master); assert.equal(master.offers.length, 0); assert.equal(approvedState.requests.find(r => r.id === rejected.id).product_id, null)
    await api('native_generic_product_still_protected', '/vendor/products', { token: member, seller, body: { title: proposal.title }, expected: [409] })
    const offerInput = { kind: 'new_offer', product_id: ids.product, weight_mg: 1500, quantity: 0, making_mode: 'percent', making_bps: 1200, labor_irr: 0, active: true }
    await api('no_grant_offer_denied', '/vendor/didar/manage', { token: member, seller, body: offerInput, expected: [403] }); await grant('CREATE_OWN_OFFER', true)
    await step('vendor-offer-native-ui-submission', 'فرم عرضهٔ موجود با وزن و اجرت؛ تعداد صفر عمدی است. این مسیر تجمیعی قدیمی، جای UID فیزیکی نیست.', async () => {
      await signIn('seller', email, password, business); await nativePage('seller'); await page.getByRole('button',{name:'موجودی و عرضه',exact:true}).click(); const form = page.getByTestId('new-offer-form')
      await form.locator('select[name=product_id]').selectOption(ids.product); await form.locator('input[name=weight_mg]').fill('1500'); await form.locator('input[name=quantity]').fill('0')
      const done = waitPost('/vendor/didar/manage'); await form.getByRole('button', { name: 'ثبت عرضه من', exact: true }).click(); ids.aggregate_offer = (await done()).id; await shot('vendor-offer-submitted')
    }, {optionalUI:true})
    if (!ids.aggregate_offer) {
      captions.push({at_ms:Date.now()-start,text:'UI عرضه در بالا ناموفق است. ادامه صرفاً API-assisted است؛ این شکست برنامه پنهان یا اصلاح نمی‌شود.'})
      const state=await api('own_offer_before_API_assist','/vendor/didar/manage',{token:member,seller})
      const existing=state.products?.find(p=>p.id===ids.product)?.offers?.find(o=>o.supplier_id===sid&&o.stock_mode==='legacy'&&o.quantity===0&&o.weight_mg===1500)
      ids.aggregate_offer=existing?.id||(await api('API_ASSISTED_first_offer','/vendor/didar/manage',{token:member,seller,body:offerInput})).id
    }
    await grant('CREATE_OWN_OFFER', false); await api('revoked_offer_grant_immediate_denial', '/vendor/didar/manage', { token: member, seller, body: offerInput, expected: [403] })
    await grant('CREATE_OWN_INTAKE', true)
    await step('exact-uid-api-intake', 'مرحلهٔ API-assisted و صریح: پذیرش یک قطعهٔ مصنوعی با وزن واقعی، UID مستقل و RFID اختیاری؛ هیچ پرداختی اجرا نمی‌شود.', async () => {
      const call = body => api('synthetic_uid_' + body.operation, '/vendor/didar/intake', { token: member, seller, body })
      const batch = (await call({ operation: 'create', invoice_number: 'AUDIT-' + suffix, reference_purity: 750 })).id
      const line = (await call({ operation: 'line', batch_id: batch, product_id: ids.product, description: 'Synthetic disposable item only', quantity: 1, total_weight_mg: 1500, purity: 750, making_mode: 'percent', making_bps: 1200 })).id
      ids.line = line
      await call({ operation: 'item', batch_id: batch, line_id: line, weight_mg: 1500 }); ids.batch = batch
      await api('vendor_cannot_centrally_verify_intake', '/vendor/didar/intake', {token:member,seller,body:{operation:'verify',batch_id:batch},expected:[403]})
      for (const operation of ['verify','post']) await api('API_ASSISTED_admin_intake_' + operation, '/admin/didar/intake', {token:admin,body:{operation,batch_id:batch}})
      await page.goto(c.browser.origin + '/seller/didar/operations'); await shot('vendor-itemized-intake')
    })
    await step('public-store-after-uid', 'ویترین عمومی بعد از پذیرش UID؛ دیده‌شدن و امکان قیمت‌گذاری فقط بر پایهٔ رفتار واقعی گزارش می‌شود.', async () => {
      await page.goto(c.browser.origin + '/m/audit-' + suffix); await page.getByText(proposal.title,{exact:false}).first().waitFor(); await shot('public-store-with-uid')
    }, {optionalUI:true})
    await step('supplier-rejection-boundary', 'رد تجاری بعدی دسترسی نوشتن را می‌بندد؛ این مسیر رد واقعی است، نه مخفی‌کردن دکمه.', async () => {
      await signIn('dashboard', c.admin.DIDAR_BOOTSTRAP_EMAIL, c.admin.NATIVE_BOOTSTRAP_PASSWORD); await adminManage('تأمین‌کنندگان')
      const done = waitPost('/admin/didar/manage'); await page.locator('[data-supplier-id="' + sid + '"]').getByRole('button', { name: 'رد تأمین‌کننده', exact: true }).click(); await done()
      await api('rejected_supplier_write_denied', '/vendor/didar/intake', { token: member, seller, body: { operation: 'create', invoice_number: 'DENIED-' + suffix }, expected: [403] }); await shot('rejected-supplier-no-commerce'); await api('rejected_store_no_public_access','/api/didar/storefront?handle=audit-' + suffix,{expected:[403,404]}); await page.goto(c.browser.origin + '/m/audit-' + suffix); await shot('public-store-rejected')
    })
    assert.match(sid, /^[a-f0-9-]{36}$/); assert.match(ids.product, /^[a-f0-9-]{36}$/)
    const after = sql('audit_authority_results', `SELECT json_build_object('orders',(SELECT count(*) FROM didar_order),'payments',(SELECT count(*) FROM didar_payment_attempt),'journals',(SELECT count(*) FROM didar_fin_journal),'master_count',(SELECT count(*) FROM didar_product WHERE id='${ids.product}'),'native_projection_count',(SELECT count(*) FROM didar_product d JOIN product p ON p.id=d.native_id WHERE d.id='${ids.product}'),'offers',(SELECT coalesce(json_agg(json_build_object('stock_mode',stock_mode,'quantity',quantity,'weight_mg',weight_mg)),'[]') FROM didar_offer WHERE supplier_id='${sid}' AND product_id='${ids.product}'),'uids',(SELECT count(*) FROM didar_inventory_item WHERE supplier_id='${sid}' AND product_id='${ids.product}'),'canonical_rejected_requests',(SELECT count(*) FROM didar_product_request WHERE supplier_id='${sid}' AND status='rejected' AND product_id IS NULL))`)
    for (const k of ['orders', 'payments']) assert.equal(after[k], before[k])
    assert.equal(after.journals, before.journals + 1)
    const finance = sql('synthetic_intake_balanced_memo', `SELECT json_build_object('events',(SELECT count(*) FROM didar_fin_event WHERE supplier_id='${sid}' AND kind='INTAKE_MEMO' AND snapshot->>'batch_id'='${ids.batch}'),'journals',(SELECT count(*) FROM didar_fin_journal j JOIN didar_fin_event e ON e.id=j.event_id WHERE e.supplier_id='${sid}'),'postings',(SELECT count(*) FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE e.supplier_id='${sid}' AND p.instrument='MEMO_GOLD_UG'),'balance',(SELECT coalesce(sum(p.delta),0)::text FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE e.supplier_id='${sid}'))`)
    assert.equal(finance.events,1); assert.equal(finance.journals,1); assert.equal(finance.postings,2); assert.equal(finance.balance,'0')
    const exactFinance = sql('synthetic_intake_exact_financial_authority', `SELECT json_build_object('events',(SELECT json_agg(json_build_object('intent',intent,'kind',kind,'actor_id',actor_id,'supplier_id',supplier_id,'gold_ug',gold_ug::text,'irr',irr::text,'snapshot',snapshot)) FROM didar_fin_event WHERE supplier_id='${sid}'),'postings',(SELECT json_agg(json_build_object('account',p.account,'party',p.party,'instrument',p.instrument,'delta',p.delta::text,'basis',j.basis) ORDER BY p.account) FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE e.supplier_id='${sid}'))`)
    const adminContext = await api('canonical_admin_actor_for_memo','/admin/didar/context',{token:admin})
    assert.equal(exactFinance.events.length,1); const event=exactFinance.events[0]
    assert.equal(event.intent,'receipt:'+ids.line); assert.equal(event.kind,'INTAKE_MEMO'); assert.equal(event.actor_id,adminContext.user.id); assert.equal(event.supplier_id,sid); assert.equal(event.gold_ug,'0'); assert.equal(event.irr,'0')
    for (const [key,value] of Object.entries({batch_id:ids.batch,invoice_line_id:ids.line,quantity:1,weight_mg:1500,purity:750,fine_ug:'1125000',ownership:'CONSIGNMENT',recognition:'custody_and_stock_acceptance_only',external_payable:false})) assert.equal(event.snapshot[key],value,'memo_snapshot_'+key)
    assert.deepEqual(exactFinance.postings,[{account:'CONSIGNMENT_CUSTODY',party:'DIDAR',instrument:'MEMO_GOLD_UG',delta:'1125000',basis:'SANDBOX_PROVISIONAL'},{account:'SUPPLIER_CONSIGNMENT_MEMO',party:'supplier:'+sid,instrument:'MEMO_GOLD_UG',delta:'-1125000',basis:'SANDBOX_PROVISIONAL'}])
    await save('synthetic-intake-finance.json', {finance,exactFinance})
    assert.equal(after.master_count, 1); assert.equal(after.native_projection_count, 1); assert.equal(after.uids, 1); assert.equal(after.canonical_rejected_requests, 1)
    await save('authority-results.json', { before, after, mutations: 'Existing HTTP workflows only; SQL reads use BEGIN READ ONLY', no_live_provider_or_checkout: true })
    await save('runtime-after.json', { samples: metrics('runtime_after'), docker_root_usage: docker('docker_disk_usage', ['system', 'df', '--format', '{{json .}}']).split('\n').map(x => JSON.parse(x)), capacity_is_not_load_test: true })
    gaps.push({ id: 'REGISTRATION_INTEGRATION', status: 'SEPARATE_AUTHORITIES_OBSERVED', detail: 'Native Member/Seller and canonical supplier are separate authorities; explicit Admin mapping and dual proof remain required. Native shell does not establish native gold ProductChange/Offer reuse.' })
    success = true
  } catch(error) { fatalDiagnostic = safe(error.message); throw error
  } finally {
    if (page) { captions.push({ at_ms: Date.now() - start, text: 'پایان audit baseline؛ technical evidence با پذیرش کسب‌وکار، معماری یا آمادگی release یکسان نیست.' }); await page.waitForTimeout(1800).catch(() => {}); await shot('final-observed-state').catch(() => {}) }
    if (privacyTimer) clearInterval(privacyTimer)
    await save('privacy-masks.json', {format:1,viewport:{width:1280,height:900},samples:privacyMasks,policy:'Recording-only redaction of email/password input fields and visible email text. Application DOM and business behavior unchanged.'})
    if (bc) await bc.close(); if (browser) await browser.close()
    if (video) await video.saveAs(join(output, 'seller-journey-raw.webm'))
    const end = Date.now() - start
    const stamp = n => { const s = Math.max(0, n / 1000); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(Math.floor(s) % 60).padStart(2, '0') + ',' + String(Math.floor(n % 1000)).padStart(3, '0') }
    await save('captions-fa.srt', captions.map((x, i) => `${i + 1}\n${stamp(x.at_ms)} --> ${stamp((captions[i + 1]?.at_ms || end) - 1)}\n${x.text}\n`).join('\n'))
    await save('audit-results.json', { status: success ? 'AUDIT_EXECUTED_WITH_EXPLICIT_GAPS' : 'AUDIT_FAILED', application_source_sha: applicationSource, verification_source_sha: auditSource, run_id: process.env.GITHUB_RUN_ID, failed_stage: success ? null : current, failure_diagnostic: fatalDiagnostic, rows, http, gaps, screenshots, ids, process_exits: processExits, synthetic_data_only: true, preview_hosting: 'NOT_PROVISIONED_OWNER_REQUEST', business_acceptance: 'NOT_INFERRED', architecture_acceptance: 'NOT_INFERRED', release_readiness: 'NOT_AUTHORIZED', tls: http.length ? 'Actual HTTP used Node CA/hostname validation; ephemeral browser QA certificate ignored; target HTTPS NOT_VERIFIED' : 'NOT_EXECUTED_NO_HTTP', credential_artifacts: 'NONE; private context excluded' })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await execute(process.argv[2], process.argv[3]) } catch { process.stderr.write('Seller baseline audit failed; retain sanitized evidence and recording.\n'); process.exitCode = 1 }
}
