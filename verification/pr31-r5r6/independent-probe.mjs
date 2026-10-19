// Independent review probes authored without implementing application corrections.
// Only owned disposable artifacts. HTTP logins create ordinary auth state;
// all direct database access below is explicitly READ ONLY. No grants or fixtures.
import assert from 'node:assert/strict'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { observer } from '../../scripts/topology/process.mjs'

const c = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
for (const key of ['run_id', 'source_sha', 'api', 'frontend', 'edge', 'owner_label', 'ca_file', 'origin', 'image_ids', 'frontend_manifest_sha256', 'upload_volume']) assert.ok(c[key], 'Explicit owned runtime required: ' + key)
assert.match(c.source_sha, /^[a-f0-9]{40}$/)
const directory = join(c.output_dir, '..', 'independent-review'), cases = [], exits = []
await mkdir(directory, { recursive: true })
const command = observer(directory, exits), ca = await readFile(c.ca_file)
const sha = b => createHash('sha256').update(b).digest('hex')
const docker = async (name, args, input) => (await command(name, 'docker', args, { input })).stdout.toString().trim()
const inspect = async (role, id) => JSON.parse(await docker('review-inspect-' + role, ['inspect', '--format', '{{json .}}', id]))
const request = (path, { body, headers = {} } = {}) => new Promise((accept, reject) => {
  const raw = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  const req = https.request(c.origin + path, { ca, timeout: 15000, method: raw ? 'POST' : 'GET', headers: { ...(raw ? { 'content-type': 'application/json', 'content-length': raw.length } : {}), ...headers } }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => { const bytes = Buffer.concat(chunks); let json; try { json = JSON.parse(bytes) } catch {} accept({ status: res.statusCode, json, bytes, headers: res.headers }) })
  })
  req.on('timeout', () => req.destroy(Error('INDEPENDENT_HTTPS_TIMEOUT'))); req.on('error', reject); req.end(raw)
})
const check = async (name, fn) => {
  try { cases.push({ name, status: 'PASS', ...await fn() }) }
  catch (error) { cases.push({ name, status: 'FAIL', message: error.code || 'Independent assertion failed; inspect executed probe source and sanitized stage receipts' }); throw error }
  finally { await writeFile(join(directory, 'cases.json'), JSON.stringify(cases, null, 2) + '\n') }
}
let success = false, customer, admin, states, data
try {
  await check('Exact artifact identities, ownership, package bytes and actual shared namespace', async () => {
    states = Object.fromEntries(await Promise.all(['api', 'frontend', 'edge'].map(async role => [role, await inspect(role, c[role])])))
    for (const state of Object.values(states)) { assert.equal(state.Config.Labels[c.owner_label], c.run_id); assert.equal(state.State.Running, true) }
    for (const [role, key] of [['api', 'api'], ['frontend', 'storefront']]) {
      assert.equal(states[role].Image, c.image_ids[key]); assert.equal(states[role].Config.Labels['org.opencontainers.image.revision'], c.source_sha)
    }
    assert.equal(states.frontend.HostConfig.NetworkMode, 'container:' + c.api)
    assert.equal(states.frontend.Mounts.length, 0)
    assert.equal(states.api.Mounts.length, 1); assert.equal(states.api.Mounts[0].Type, 'volume'); assert.equal(states.api.Mounts[0].Name, c.upload_volume)
    assert.equal(states.api.Mounts[0].Destination, '/app/packages/api/.medusa/server/static')
    for (const state of [states.api, states.frontend]) assert.equal(Object.keys(state.HostConfig.PortBindings || {}).length, 0)
    const script = "const fs=require('node:fs'),crypto=require('node:crypto');const b=fs.readFileSync('/app/PACKAGING.json');process.stdout.write(JSON.stringify({source_sha:JSON.parse(b).source_sha,sha256:crypto.createHash('sha256').update(b).digest('hex')}))"
    const actual = JSON.parse(await docker('review-package-manifest', ['exec', c.frontend, 'node', '-e', script]))
    assert.equal(actual.source_sha, c.source_sha); assert.equal(actual.sha256, c.frontend_manifest_sha256)
    return { images: c.image_ids, packaging_sha256: actual.sha256, application_source_mounts: 0, private_application_port_bindings: 0 }
  })
  await check('Read-only PostgreSQL proves populated UID/order/payment history and balanced journals', async () => {
    const script = String.raw`const{Pool}=require('/app/packages/api/node_modules/pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{if(process.env.DIDAR_DISPOSABLE_QA!=='true'||process.env.DIDAR_PAYMENT_MODE!=='sandbox'||process.env.DIDAR_AUTH_PROXY_POLICY!=='require-proof')throw Error('OWNED_SANDBOX_REQUIRED');const client=await p.connect();try{await client.query('BEGIN READ ONLY');const counts={};for(const table of ['didar_inventory_item','didar_order','didar_order_line','didar_payment_attempt','didar_fin_event','didar_fin_journal','didar_fin_posting'])counts[table]=(await client.query('SELECT count(*)::int n FROM '+table)).rows[0].n;const paid=(await client.query("SELECT count(*)::int n FROM didar_order o JOIN didar_payment_attempt p ON p.order_id=o.id WHERE o.status='paid' AND p.provider='sandbox' AND p.status='success'")).rows[0].n;const uid=(await client.query("SELECT count(*)::int n FROM didar_inventory_item WHERE status='sold' AND uid IS NOT NULL AND length(uid)>0")).rows[0].n;const imbalance=(await client.query('SELECT count(*)::int n FROM (SELECT journal_id,instrument FROM didar_fin_posting GROUP BY journal_id,instrument HAVING sum(delta)<>0 OR count(*)<2)t')).rows[0].n;const sellers=(await client.query("SELECT seller_id,supplier_id FROM didar_native_seller WHERE active AND supplier_id IN ('s1','s2') ORDER BY supplier_id")).rows;const assets=(await client.query("SELECT id,source_mime FROM didar_media_asset WHERE alt='Disposable packaged artifact media' ORDER BY created_at,id")).rows;await client.query('COMMIT');process.stdout.write(JSON.stringify({counts,paid,uid,imbalance,sellers,assets}))}finally{client.release()}})().finally(()=>p.end()).catch(e=>{console.error(e.code||'READ_ONLY_PROBE_FAILED');process.exitCode=1})`
    data = JSON.parse(await docker('review-postgres-read-only-authorities', ['exec', c.api, 'node', '-e', script]))
    for (const count of Object.values(data.counts)) assert.ok(count > 0)
    assert.ok(data.paid > 0); assert.ok(data.uid > 0); assert.equal(data.imbalance, 0)
    assert.ok(data.sellers.some(s => s.supplier_id === 's1')); assert.ok(data.sellers.some(s => s.supplier_id === 's2'))
    return { populated_counts: data.counts, paid_sandbox_orders: data.paid, sold_individual_uids: data.uid, unbalanced_journal_instruments: data.imbalance, direct_database_writes: 0 }
  })
  await check('Strict-CA public customer authentication ignores caller network assertions', async () => {
    const r = await request('/api/didar/login', { body: { email: 'customer@didar.test', password: 'DidarDemo2026!' }, headers: { 'x-forwarded-for': '198.51.100.241', 'x-real-ip': '203.0.113.241', forwarded: 'for=203.0.113.242', 'x-didar-auth-network': 'independent-forged-proof' } })
    assert.equal(r.status, 200); assert.equal(r.json.user.id, 'demo-customer'); customer = r.json.token; assert.ok(customer)
    const me = await request('/api/didar/me', { headers: { authorization: 'Bearer ' + customer } }); assert.equal(me.status, 200); assert.equal(me.json.user.id, 'demo-customer')
    return { login: r.status, account: me.status, canonical_customer: 'demo-customer', qa_ca_and_hostname_verification: true }
  })
  await check('Native Admin and Vendor contexts preserve canonical links and foreign-tenant denial', async () => {
    const a = await request('/auth/user/emailpass', { body: { email: 'native-admin@didar.test', password: 'DidarNative2026!' } })
    const v = await request('/auth/member/emailpass', { body: { email: 'native-supplier@didar.test', password: 'DidarNative2026!' } })
    assert.equal(a.status, 200); assert.equal(v.status, 200)
    const own = data.sellers.find(s => s.supplier_id === 's1').seller_id, foreign = data.sellers.find(s => s.supplier_id === 's2').seller_id
    const ac = await request('/admin/didar/context', { headers: { authorization: 'Bearer ' + a.json.token } })
    assert.equal(ac.status, 200); assert.equal(ac.json.user.id, 'demo-admin'); assert.equal(ac.json.user.role, 'admin')
    const vc = await request('/vendor/didar/context', { headers: { authorization: 'Bearer ' + v.json.token, 'x-seller-id': own } })
    assert.equal(vc.status, 200); assert.equal(vc.json.user.id, 'demo-supplier'); assert.equal(vc.json.seller_id, own); assert.equal(vc.json.user.supplier_id, 's1')
    const denied = await request('/vendor/didar/context', { headers: { authorization: 'Bearer ' + v.json.token, 'x-seller-id': foreign } })
    assert.ok([400, 403].includes(denied.status))
    const anonymous = await request('/admin/didar/context'); assert.ok([401, 403].includes(anonymous.status))
    const wrongAuthority = await request('/admin/didar/context', { headers: { authorization: 'Bearer ' + customer } }); assert.ok([401, 403].includes(wrongAuthority.status))
    return { native_admin_login: 200, native_vendor_login: 200, canonical_admin_context: 200, own_vendor_context: 200, foreign_seller: denied.status, anonymous_admin: anonymous.status, customer_token_admin: wrongAuthority.status }
  })
  await check('Unsigned private Next and API authentication remain denied inside their namespace', async () => {
    const script = "const body=JSON.stringify({email:'customer@didar.test',password:'DidarDemo2026!'});Promise.all([3001,9000].flatMap(port=>[false,true].map(forged=>fetch('http://127.0.0.1:'+port+(port===3001?'/api/didar/login':'/didar/login'),{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'198.51.100.250',...(forged?{'x-didar-auth-network':'invalid'}:{})},body}).then(r=>r.status)))).then(statuses=>process.stdout.write(JSON.stringify(statuses))).catch(()=>process.exitCode=1)"
    const statuses = JSON.parse(await docker('review-private-unsigned-auth', ['exec', c.api, 'node', '-e', script])); assert.deepEqual(statuses, [403, 403, 403, 403])
    return { private_next_unsigned: statuses[0], private_next_forged: statuses[1], private_api_unsigned: statuses[2], private_api_forged: statuses[3], supplied_forwarding_and_invalid_proof_accepted: false }
  })
  await check('Actual private media uses identical authorized native/Next bytes and video ranges', async () => {
    const login = await request('/api/didar/login', { body: { email: 'admin@didar.test', password: 'DidarDemo2026!' } }); assert.equal(login.status, 200); admin = login.json.token
    const proof = []
    for (const [mime, route, contentType] of [['image/png', 'image', 'image/webp'], ['video/mp4', 'media-file', 'video/mp4']]) {
      const asset = data.assets.find(x => x.source_mime === mime); assert.ok(asset, 'Image-owned media fixture required')
      const path = '/didar/' + route + '?id=' + encodeURIComponent(asset.id), paths = [path, '/api' + path]
      const anon = await Promise.all(paths.map(p => request(p))); assert.deepEqual(anon.map(x => x.status), [404, 404])
      const full = await Promise.all(paths.map(p => request(p, { headers: { authorization: 'Bearer ' + admin } })))
      for (const r of full) { assert.equal(r.status, 200); assert.equal(r.headers['content-type']?.split(';')[0], contentType); assert.ok(r.bytes.length > 100) }
      assert.deepEqual(full[0].bytes, full[1].bytes)
      const item = { media: route, anonymous: [404, 404], authorized: [200, 200], sha256: sha(full[0].bytes) }
      if (route === 'media-file') {
        const ranged = await Promise.all(paths.map(p => request(p, { headers: { authorization: 'Bearer ' + admin, range: 'bytes=0-63' } })))
        for (const r of ranged) { assert.equal(r.status, 206); assert.equal(r.bytes.length, 64); assert.match(r.headers['content-range'], /^bytes 0-63\//); assert.deepEqual(r.bytes, full[0].bytes.subarray(0, 64)) }
        item.range = [206, 206]; item.range_bytes = 64
      }
      proof.push(item)
    }
    return { actual_media: proof, independent_native_and_next_authorization: true }
  })
  success = true
} finally {
  await writeFile(join(directory, 'result.json'), JSON.stringify({ status: success ? 'PASS' : 'FAIL', reviewer: '/root/r5r6_independent_review', source_sha: c.source_sha, images: c.image_ids, cases: cases.length, actual_child_exits: exits, reviewed_implementation_authored_by_reviewer: false, application_or_database_patches: false, claims: 'Independent live HTTP and read-only PostgreSQL review of loaded candidate artifacts; CI/full browser/lifecycle outcomes are separately reviewed', target_config: 'BLOCKED', public_https: 'NOT_VERIFIED' }, null, 2) + '\n')
}
