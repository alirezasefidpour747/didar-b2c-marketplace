// QA client only. Never mounted into or copied over an accepted application image.
import {randomBytes, createHash} from 'node:crypto'
import {request} from 'node:https'
import {createRequire} from 'node:module'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {fileURLToPath, pathToFileURL} from 'node:url'

const ACCEPTED_SOURCE = '0c4b047baa9dbe37cd1876159c15d22b40cf7cac'
const fail = code => { throw new Error(code) }
const check = (value, code) => { if (!value) fail(code) }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function privateJSON(path) {
  check(isAbsolute(path), 'PRIVATE_FILE_ABSOLUTE_PATH_REQUIRED')
  const stat = lstatSync(path)
  check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'UNSAFE_PRIVATE_FILE')
  return JSON.parse(readFileSync(path, 'utf8'))
}
function atomic(path, data, privateFile = false) {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700})
  const temp = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', {flag: 'wx', mode: 0o600})
  renameSync(temp, path)
  if (privateFile) chmodSync(path, 0o600)
}
export function validateConfiguration(config, phase) {
  check(['before-restart', 'after-restart'].includes(phase), 'INVALID_PHASE')
  check(config.source_sha === ACCEPTED_SOURCE, 'UNACCEPTED_APPLICATION_SOURCE')
  const origin = new URL(config.origin)
  check(origin.protocol === 'https:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password, 'DISPOSABLE_LOOPBACK_HTTPS_REQUIRED')
  for (const key of ['ca_file', 'output_dir', 'fixture_file']) check(typeof config[key] === 'string' && isAbsolute(config[key]), 'ABSOLUTE_PATH_REQUIRED')
  const fixtureRelative = relative(resolve(config.output_dir), resolve(config.fixture_file))
  check(fixtureRelative === '..' || fixtureRelative.startsWith('..' + sep) || isAbsolute(fixtureRelative), 'PRIVATE_FIXTURE_MUST_NOT_BE_IN_EVIDENCE')
  check(/^[a-zA-Z0-9_-]{1,80}$/.test(config.run_id || ''), 'INVALID_RUN_ID')
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.admin_email || '') && !config.admin_email.toLowerCase().endsWith('@didar.test'), 'EXPLICIT_NON_DEMO_ADMIN_REQUIRED')
  check(typeof config.admin_didar_password === 'string' && config.admin_didar_password.length >= 16 && typeof config.admin_native_password === 'string' && config.admin_native_password.length >= 16 && config.admin_didar_password !== config.admin_native_password, 'DISTINCT_ADMIN_CREDENTIALS_REQUIRED')
  return {...config, origin: origin.origin, phase}
}

export async function execute(rawConfig, phase) {
  const config = validateConfiguration(rawConfig, phase)
  const root = config.root || resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const output = join(config.output_dir, phase)
  mkdirSync(output, {recursive: true})
  const stages = [], http = [], pageErrors = [], screenshots = []
  let stage = 'configuration', browser, fixture
  const ca = readFileSync(config.ca_file)
  // Socket/CA validation is real here: no forged forwarding headers, no signing
  // secret, no direct private API, no rejectUnauthorized:false or URL redirects.
  const api = async (label, path, {token = '', body, seller, expected = [200]} = {}) => {
    check(path.startsWith('/') && !path.startsWith('//'), 'INVALID_HTTP_PATH')
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const result = await new Promise((resolveRequest, reject) => {
      const req = request(new URL(path, config.origin), {
        ca, rejectUnauthorized: true, method: payload === undefined ? 'GET' : 'POST',
        headers: {'content-type': 'application/json', ...(token ? {authorization: 'Bearer ' + token} : {}), ...(seller ? {'x-seller-id': seller} : {}), ...(payload ? {'content-length': Buffer.byteLength(payload)} : {})},
      }, res => {
        const chunks = []; let size = 0
        res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(new Error('HTTP_RESPONSE_TOO_LARGE')); else chunks.push(chunk) })
        res.on('error', () => reject(new Error('HTTPS_RESPONSE_FAILED')))
        res.on('end', () => { try { resolveRequest({status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8'))}) } catch { reject(new Error('NON_JSON_HTTP_RESPONSE')) } })
      })
      req.setTimeout(45000, () => req.destroy(new Error('HTTPS_TIMEOUT')))
      req.on('error', () => reject(new Error('HTTPS_REQUEST_FAILED')))
      if (payload !== undefined) req.write(payload)
      req.end()
    })
    http.push({label, path: path.split('?')[0], method: payload === undefined ? 'GET' : 'POST', status: result.status, expected})
    check(expected.includes(result.status), 'HTTP_STATUS_' + label + '_' + result.status)
    return result.data
  }
  const credentials = (email, password) => ({email, password})
  const login = async (label, path, email, password) => {
    const data = await api(label, path, {body: credentials(email, password)})
    check(typeof data.token === 'string' && data.token.length > 10, 'MISSING_AUTH_TOKEN_' + label)
    return data
  }
  const complete = label => stages.push({stage: label, status: 'PASS'})
  const context = async () => {
    // Only disposable browser contexts ignore this ephemeral QA certificate.
    // Independent Node HTTP above verifies its supplied CA and hostname.
    const c = await browser.newContext({viewport: {width: 1440, height: 1000}, ignoreHTTPSErrors: true})
    c.on('page', p => p.on('pageerror', error => pageErrors.push({sha256: hash(error.message)})))
    return c
  }
  const shot = async (page, name) => {
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      await page.setViewportSize({width, height})
      const path = join(output, name + '-' + width + '.png')
      await page.screenshot({path, fullPage: true})
      screenshots.push({file: name + '-' + width + '.png', sha256: hash(readFileSync(path)), width})
    }
  }
  const nativeSignIn = async (page, surface, email, password, sellerName) => {
    await page.goto(config.origin + '/' + surface + '/login')
    await page.locator('input[name=email]').fill(email)
    await page.locator('input[name=password]').fill(password)
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/' + (surface === 'seller' ? 'member' : 'user') + '/emailpass' && r.request().method() === 'POST')
    response.catch(() => {})
    await page.locator('button[type=submit]').click()
    check((await response).status() === 200, 'NATIVE_BROWSER_SIGN_IN_FAILED')
    if (surface === 'seller') {
      await page.waitForURL(u => u.pathname === '/seller/store-select')
      await page.getByRole('button').filter({hasText: sellerName}).click()
    }
    await page.waitForURL(u => !u.pathname.endsWith('/login') && u.pathname !== '/seller/store-select')
  }
  const nativeWorkspace = async (page, surface, email, password, needsConnect) => {
    const prefix = surface === 'seller' ? '/vendor' : '/admin'
    const manage = page.waitForResponse(r => new URL(r.url()).pathname === prefix + '/didar/manage' && r.request().method() === 'GET', {timeout: 60000})
    // Preserve the original rejection for the awaited assertion, while avoiding
    // an unhandled rejection if an earlier form interaction fails first.
    manage.catch(() => {})
    await page.goto(config.origin + '/' + surface + '/didar')
    if (needsConnect) {
      await page.getByLabel('ایمیل حساب دیدار', {exact: true}).fill(email)
      await page.getByLabel('رمز حساب دیدار', {exact: true}).fill(password)
      const connected = page.waitForResponse(r => new URL(r.url()).pathname === prefix + '/didar/connect' && r.request().method() === 'POST')
      await page.getByRole('button', {name: 'اتصال امن حساب', exact: true}).click()
      check((await connected).status() === 200, 'NATIVE_BROWSER_DUAL_PROOF_FAILED')
    }
    const response = await manage
    check(response.status() === 200, 'NATIVE_BROWSER_MANAGE_FAILED')
    const data = await response.json()
    check(Array.isArray(data.products) && data.products.length === 0, 'FRESH_WORKSPACE_MUST_HAVE_NO_PRODUCTS')
    check(Array.isArray(data.suppliers), 'SUPPLIER_PROJECTION_REQUIRED')
    if (surface === 'seller') check(data.suppliers.length === 1 && data.suppliers[0].id === fixture.supplier_id, 'VENDOR_SUPPLIER_ISOLATION_FAILED')
    await page.getByRole('button', {name: 'تازه‌سازی مدیریت', exact: true}).waitFor({state: 'visible'})
    await page.getByRole('heading', {name: surface === 'seller' ? 'پنل تأمین‌کننده' : 'مدیریت بازار دیدار', exact: true}).waitFor({state: 'visible'})
    check(await page.locator('a[href="/' + surface + '/products"]').count() > 0, 'NATIVE_PRODUCT_NAVIGATION_MISSING')
    return data
  }
  const nativeProductsNavigation = async (page, surface) => {
    await page.setViewportSize({width: 1440, height: 1000})
    const prefix = surface === 'seller' ? '/vendor' : '/admin'
    const response = page.waitForResponse(r => new URL(r.url()).pathname === prefix + '/products' && r.request().method() === 'GET', {timeout: 45000})
    response.catch(() => {})
    await page.locator('a[href="/' + surface + '/products"]').first().click()
    await page.waitForURL(u => u.pathname === '/' + surface + '/products')
    check((await response).status() === 200, 'NATIVE_BUILT_IN_PRODUCTS_NAVIGATION_FAILED')
    stages.push({stage: surface + '-built-in-products-navigation', status: 'PASS', http: 200, route: '/' + surface + '/products'})
  }
  try {
    stage = 'bootstrap-native-admin-and-dual-proof'
    const nativeAdmin = (await login('native_admin_login', '/auth/user/emailpass', config.admin_email, config.admin_native_password)).token
    const canonicalAdmin = await login('didar_admin_login', '/didar/login', config.admin_email, config.admin_didar_password)
    check(canonicalAdmin.user?.role === 'admin', 'BOOTSTRAP_ADMIN_ROLE_REQUIRED')
    await api('anonymous_native_admin_denied', '/admin/didar/context', {expected: [401]})
    await api('canonical_token_not_native', '/admin/didar/context', {token: canonicalAdmin.token, expected: [401]})
    await api('native_token_not_canonical', '/didar/manage', {token: nativeAdmin, expected: [401]})
    if (phase === 'before-restart') {
      check(!existsSync(config.fixture_file), 'FRESH_FIXTURE_ALREADY_EXISTS')
      await api('first_admin_unlinked', '/admin/didar/context', {token: nativeAdmin, expected: [403]})
    } else {
      fixture = privateJSON(config.fixture_file)
      check(fixture.source_sha === config.source_sha && fixture.run_id === config.run_id && fixture.origin === config.origin, 'PRIVATE_FIXTURE_PROVENANCE_MISMATCH')
    }
    const require = createRequire(join(root, 'package.json'))
    const {chromium} = require('@playwright/test')
    const {browserLaunchOptions} = await import(pathToFileURL(join(root, 'scripts/local/browser-options.mjs')))
    browser = await chromium.launch({...browserLaunchOptions(process.env), headless: true})
    const ac = await context(), adminPage = await ac.newPage()
    await nativeSignIn(adminPage, 'dashboard', config.admin_email, config.admin_native_password)
    await nativeWorkspace(adminPage, 'dashboard', config.admin_email, config.admin_didar_password, phase === 'before-restart')
    await shot(adminPage, 'native-admin-authenticated')
    await nativeProductsNavigation(adminPage, 'dashboard')
    await ac.close()
    const adminContext = await api('native_admin_connected', '/admin/didar/context', {token: nativeAdmin})
    check(adminContext.user?.id === canonicalAdmin.user.id && adminContext.user.role === 'admin', 'ADMIN_DUAL_PROOF_IDENTITY_MISMATCH')
    complete(stage)

    if (phase === 'before-restart') {
      stage = 'managed-merchant-native-provisioning'
      const unique = randomBytes(10).toString('hex')
      fixture = {source_sha: config.source_sha, run_id: config.run_id, origin: config.origin,
        supplier_email: 'supplier-' + unique + '@fresh.didar.invalid',
        vendor_email: 'vendor-' + unique + '@fresh.didar.invalid', customer_email: 'customer-' + unique + '@fresh.didar.invalid',
        foreign_email: 'foreign-' + unique + '@fresh.didar.invalid',
        supplier_password: randomBytes(24).toString('base64url'), vendor_password: randomBytes(24).toString('base64url'),
        customer_password: randomBytes(24).toString('base64url'), foreign_password: randomBytes(24).toString('base64url'),
        seller_name: 'Fresh QA ' + unique, handle: 'fresh-' + unique}
      const supplier = await api('managed_canonical_supplier_create', '/admin/didar/manage', {token: nativeAdmin, body: {kind: 'supplier', name: fixture.seller_name, email: fixture.supplier_email, password: fixture.supplier_password}})
      check(typeof supplier.id === 'string', 'SUPPLIER_CREATION_FAILED'); fixture.supplier_id = supplier.id
      await api('managed_supplier_approval', '/admin/didar/manage', {token: nativeAdmin, body: {kind: 'supplier_state', id: supplier.id, status: 'approved', active: true}})
      const registration = await api('native_vendor_register', '/auth/member/emailpass/register', {body: credentials(fixture.vendor_email, fixture.vendor_password), expected: [200, 201]})
      const seller = await api('native_vendor_create_seller', '/vendor/sellers', {token: registration.token, body: {name: fixture.seller_name, email: fixture.vendor_email, member_email: fixture.vendor_email, currency_code: 'irr'}, expected: [201]})
      check(typeof seller.seller?.id === 'string', 'SELLER_CREATION_FAILED'); fixture.seller_id = seller.seller.id
      await api('managed_native_seller_approve', '/admin/sellers/' + fixture.seller_id + '/approve', {token: nativeAdmin, body: {}})
      await api('managed_native_supplier_link', '/admin/didar/seller-links', {token: nativeAdmin, body: {seller_id: fixture.seller_id, supplier_id: fixture.supplier_id}})
      await api('managed_public_store_launch', '/admin/didar/storefront', {token: nativeAdmin, body: {kind: 'save', supplier_id: fixture.supplier_id, handle: fixture.handle, name: fixture.seller_name, visibility: 'UNLISTED_LINK', published: true, approved: true}})
      const foreignRegistration = await api('foreign_native_vendor_register', '/auth/member/emailpass/register', {body: credentials(fixture.foreign_email, fixture.foreign_password), expected: [200, 201]})
      const foreignSeller = await api('foreign_seller_create', '/vendor/sellers', {token: foreignRegistration.token, body: {name: 'Foreign ' + unique, email: fixture.foreign_email, member_email: fixture.foreign_email, currency_code: 'irr'}, expected: [201]})
      check(typeof foreignSeller.seller?.id === 'string', 'FOREIGN_SELLER_CREATION_FAILED'); fixture.foreign_seller_id = foreignSeller.seller.id
      const foreignSupplier = await api('foreign_canonical_supplier_create', '/admin/didar/manage', {token: nativeAdmin, body: {kind: 'supplier', name: 'Foreign ' + unique}})
      check(typeof foreignSupplier.id === 'string' && foreignSupplier.id !== fixture.supplier_id, 'FOREIGN_SUPPLIER_CREATION_FAILED'); fixture.foreign_supplier_id = foreignSupplier.id
      const customer = await api('fresh_customer_register', '/api/didar/register', {body: {...credentials(fixture.customer_email, fixture.customer_password), name: 'مشتری آزمون نصب تازه'}})
      check(customer.user?.role === 'customer' && customer.user.id, 'CUSTOMER_CREATION_FAILED'); fixture.customer_id = customer.user.id
      atomic(config.fixture_file, fixture, true)
      complete(stage)
    }

    stage = 'native-vendor-dual-proof-and-tenant-isolation'
    const vendor = (await login('native_vendor_login', '/auth/member/emailpass', fixture.vendor_email, fixture.vendor_password)).token
    const supplier = await login('didar_supplier_login', '/didar/login', fixture.supplier_email, fixture.supplier_password)
    check(supplier.user?.supplier_id === fixture.supplier_id && supplier.user.role === 'supplier', 'SUPPLIER_IDENTITY_MISMATCH')
    await api('native_vendor_store_select', '/vendor/sellers/select', {token: vendor, body: {seller_id: fixture.seller_id}})
    await api('foreign_seller_context_denied', '/vendor/didar/context', {token: vendor, seller: fixture.foreign_seller_id, expected: [400, 403]})
    await api('vendor_not_admin', '/admin/didar/context', {token: vendor, expected: [401]})
    if (phase === 'before-restart') {
      await api('unlinked_vendor_denied', '/vendor/didar/context', {token: vendor, seller: fixture.seller_id, expected: [403]})
      await api('wrong_admin_proof_denied', '/vendor/didar/connect', {token: vendor, seller: fixture.seller_id, body: {didar_token: canonicalAdmin.token}, expected: [403]})
    }
    const vc = await context(), vendorPage = await vc.newPage()
    await nativeSignIn(vendorPage, 'seller', fixture.vendor_email, fixture.vendor_password, fixture.seller_name)
    await nativeWorkspace(vendorPage, 'seller', fixture.supplier_email, fixture.supplier_password, phase === 'before-restart')
    await shot(vendorPage, 'native-vendor-authenticated')
    await nativeProductsNavigation(vendorPage, 'seller')
    await vc.close()
    const ownContext = await api('vendor_own_context', '/vendor/didar/context', {token: vendor, seller: fixture.seller_id})
    check(ownContext.seller_id === fixture.seller_id && ownContext.user?.supplier_id === fixture.supplier_id, 'VENDOR_CONTEXT_IDENTITY_MISMATCH')
    const own = await api('vendor_own_management', '/vendor/didar/manage', {token: vendor, seller: fixture.seller_id})
    check(own.suppliers?.length === 1 && own.suppliers[0].id === fixture.supplier_id && own.products?.length === 0, 'VENDOR_MANAGEMENT_ISOLATION_FAILED')
    await api('vendor_foreign_onboarding_denied', '/vendor/didar/onboarding?supplier_id=' + encodeURIComponent(fixture.foreign_supplier_id), {token: vendor, seller: fixture.seller_id, expected: [403]})
    const stores = await api('vendor_only_own_store', '/vendor/didar/storefront', {token: vendor, seller: fixture.seller_id})
    check(stores.stores?.length === 1 && stores.stores[0].supplier_id === fixture.supplier_id, 'VENDOR_STOREFRONT_ISOLATION_FAILED')
    complete(stage)

    stage = 'customer-real-login-account-orders-and-public-merchant'
    const customer = await login('fresh_customer_login', '/api/didar/login', fixture.customer_email, fixture.customer_password)
    check(customer.user?.id === fixture.customer_id && customer.user.role === 'customer', 'PERSISTENT_CUSTOMER_IDENTITY_MISMATCH')
    const me = await api('customer_me', '/api/didar/me', {token: customer.token})
    check(me.user?.id === fixture.customer_id && me.user.role === 'customer', 'CUSTOMER_SELF_AUTHORITY_MISMATCH')
    const orders = await api('fresh_customer_orders', '/api/didar/orders', {token: customer.token})
    check(Array.isArray(orders.orders) && orders.orders.length === 0, 'FRESH_CUSTOMER_ORDERS_MUST_BE_EMPTY')
    await api('customer_admin_denied', '/admin/didar/manage', {token: customer.token, expected: [401]})
    const catalog = await api('fresh_empty_catalog', '/api/didar/catalog')
    check(Array.isArray(catalog.products) && catalog.products.length === 0, 'FRESH_CATALOG_MUST_HAVE_NO_PRODUCTS')
    const store = await api('managed_merchant_public_read', '/api/didar/storefront?handle=' + encodeURIComponent(fixture.handle))
    check(store.store?.supplier_id === fixture.supplier_id && store.store.handle === fixture.handle && store.store.visibility === 'UNLISTED_LINK', 'MANAGED_STORE_NOT_PUBLICLY_READABLE')
    const cc = await context(), customerPage = await cc.newPage()
    await customerPage.goto(config.origin + '/login')
    await customerPage.getByLabel('ایمیل', {exact: true}).fill(fixture.customer_email)
    await customerPage.getByLabel('رمز عبور', {exact: true}).fill(fixture.customer_password)
    const loginResponse = customerPage.waitForResponse(r => new URL(r.url()).pathname === '/api/didar/login' && r.request().method() === 'POST')
    const profileResponse = customerPage.waitForResponse(r => new URL(r.url()).pathname === '/api/didar/profile' && r.request().method() === 'GET', {timeout: 45000})
    profileResponse.catch(() => {})
    await customerPage.getByRole('button', {name: 'ورود', exact: true}).click()
    const browserLogin = await loginResponse
    check(browserLogin.status() === 200 && (await browserLogin.json()).user?.id === fixture.customer_id, 'CUSTOMER_BROWSER_LOGIN_FAILED')
    await customerPage.waitForURL(u => u.pathname === '/account')
    const browserProfile = await profileResponse
    check(browserProfile.status() === 200 && (await browserProfile.json()).user?.id === fixture.customer_id, 'CUSTOMER_BROWSER_PROFILE_IDENTITY_FAILED')
    await customerPage.getByRole('heading', {name: 'حساب من', exact: true}).waitFor({state: 'visible'})
    await customerPage.getByRole('button', {name: 'ذخیره اطلاعات حساب', exact: true}).waitFor({state: 'visible'})
    await shot(customerPage, 'customer-authenticated-account')
    await customerPage.goto(config.origin + '/m/' + fixture.handle)
    await customerPage.getByRole('heading', {name: fixture.seller_name, exact: true}).waitFor({state: 'visible'})
    await cc.close()
    complete(stage)
    stage = 'session-continuity'
    if (phase === 'before-restart') {
      // Preserve real pre-restart credentials only in the protected, excluded
      // fixture. New sessions above do not stand in for old-session continuity.
      fixture.pre_restart_sessions = {customer: customer.token, native_admin: nativeAdmin, native_vendor: vendor}
      atomic(config.fixture_file, fixture, true)
    } else {
      const prior = fixture.pre_restart_sessions
      check(prior && ['customer', 'native_admin', 'native_vendor'].every(key => typeof prior[key] === 'string' && prior[key].length > 10), 'PRE_RESTART_SESSIONS_REQUIRED')
      const priorCustomer = await api('pre_restart_customer_session_retained', '/api/didar/me', {token: prior.customer})
      check(priorCustomer.user?.id === fixture.customer_id && priorCustomer.user.role === 'customer', 'CUSTOMER_SESSION_CONTINUITY_FAILED')
      const priorAdmin = await api('pre_restart_native_admin_session_retained', '/admin/didar/context', {token: prior.native_admin})
      check(priorAdmin.user?.id === canonicalAdmin.user.id && priorAdmin.user.role === 'admin', 'ADMIN_SESSION_CONTINUITY_FAILED')
      const priorVendor = await api('pre_restart_native_vendor_session_retained', '/vendor/didar/context', {token: prior.native_vendor, seller: fixture.seller_id})
      check(priorVendor.seller_id === fixture.seller_id && priorVendor.user?.supplier_id === fixture.supplier_id, 'VENDOR_SESSION_CONTINUITY_FAILED')
    }
    complete(stage)
    check(pageErrors.length === 0, 'BROWSER_PAGE_ERRORS')
    await browser.close(); browser = undefined
    const result = {kind: 'didar-fresh-install-real-journeys', source_sha: config.source_sha, run_id: config.run_id, phase, status: 'PASS', stages, http, screenshots,
      identities: {canonical_admin_id: canonicalAdmin.user.id, supplier_id: fixture.supplier_id, seller_id: fixture.seller_id, customer_id: fixture.customer_id},
      tls: {node_ca_and_hostname_verification: true, browser_ephemeral_disposable_qa_ignoreHTTPSErrors: true, target_public_https: 'NOT_VERIFIED'},
      page_errors: pageErrors, scope: 'No demo seed, SQL identity changes, Product/Offer/inventory/order/payment/financial mutations or runtime source overlays. Empty fresh catalog/orders are intentional.'}
    atomic(join(output, 'browser-verdict.json'), result)
    return result
  } catch (error) {
    if (browser) { try { await browser.close() } catch {} }
    const code = /^[A-Z][A-Z_0-9]{2,140}$/.test(error.message || '') ? error.message : 'QA_CLIENT_FAILURE'
    atomic(join(output, 'browser-verdict.json'), {kind: 'didar-fresh-install-real-journeys', source_sha: config.source_sha, run_id: config.run_id, phase, status: 'FAIL', failed_stage: stage, failure_code: code, failure_detail_sha256: hash(String(error.message)), stages, http, screenshots, page_errors: pageErrors})
    throw new Error(code)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await execute(privateJSON(resolve(process.argv[2] || '')), process.argv[3])
    process.stdout.write('Fresh-install browser/HTTP verification PASS\n')
  } catch {
    process.stderr.write('Fresh-install browser/HTTP verification FAIL; inspect sanitized browser-verdict.json when available\n')
    process.exitCode = 1
  }
}
