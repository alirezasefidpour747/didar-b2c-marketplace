// HTTP-only acceptance of image-owned processors and persisted media. No host API.
import assert from 'node:assert/strict'
import https from 'node:https'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { observer } from './process.mjs'
const c = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
const output = join(c.output_dir, '..', 'media'); await mkdir(output, { recursive: true })
const exits = [], command = observer(output, exits), ca = await readFile(c.ca_file), cases = []
const request = (path, body, token, headers = {}) => new Promise((accept, reject) => {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body))
  const req = https.request(c.origin + path, { ca, method: raw ? 'POST' : 'GET', headers: { ...(raw ? { 'content-type': 'application/json', 'content-length': raw.length } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => { const bytes = Buffer.concat(chunks); let json; try { json = JSON.parse(bytes) } catch {} accept({ status: res.statusCode, headers: res.headers, bytes, json }) })
  }); req.on('error', reject); req.end(raw)
})
const ok = async (path, body, token) => { const r = await request('/api/didar/' + path, body, token); assert.equal(r.status, 200, `${path}: ${r.status} ${JSON.stringify(r.json)}`); return r.json }
let success = false
try {
  const login = await ok('login', { email: 'admin@didar.test', password: 'DidarDemo2026!' }), token = login.token
  assert.ok(token)
  // Generate synthetic inputs using only processors already IN the API image.
  const generated = await command('image-owned-processor-fixtures', 'docker', ['exec', c.api, 'node', '-e', "const sharp=require('/app/packages/api/node_modules/sharp'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),p=require('node:path');(async()=>{const dir=fs.mkdtempSync(p.join(os.tmpdir(),'didar-media-qa-'));try{const file=p.join(dir,'fixture.mp4');cp.execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x240:d=1','-c:v','libx264','-pix_fmt','yuv420p',file]);const image=await sharp({create:{width:1000,height:700,channels:3,background:'#142d50'}}).png().toBuffer();process.stdout.write(JSON.stringify({image:image.toString('base64'),video:fs.readFileSync(file).toString('base64')}))}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e.message);process.exitCode=1})"])
  const inputs = JSON.parse(generated.stdout), ids = {}
  for (const [kind, mime] of [['image', 'image/png'], ['video', 'video/mp4']]) {
    const asset = await ok('content-media', { operation: 'upload', supplier_id: 'DIDAR', idempotency_key: randomUUID(), mime_type: mime, data: inputs[kind], alt: 'Disposable packaged artifact media' }, token)
    ids[kind] = asset.id
    await ok('content-media', { operation: 'review', asset_id: asset.id, approved: true, visibility: 'SHARED_MASTER', reason: 'Disposable artifact acceptance' }, token)
    const path = '/api/didar/' + (kind === 'video' ? 'media-file' : 'image') + '?id=' + encodeURIComponent(asset.id)
    assert.equal((await request(path)).status, 404)
    const authorized = await request(path, undefined, token); assert.equal(authorized.status, 200); assert.ok(authorized.bytes.length > 100)
    assert.match(authorized.headers['content-type'], kind === 'video' ? /^video\/mp4/ : /^image\/webp/)
    const nativePath = path.replace('/api/didar/', '/didar/')
    assert.equal((await request(nativePath)).status, 404)
    const native = await request(nativePath, undefined, token); assert.equal(native.status, 200); assert.deepEqual(native.bytes, authorized.bytes)
    cases.push({ name: kind + '-private-before-publication-authorized-admin', anonymous: 404, authorized: 200, sha256: createHash('sha256').update(authorized.bytes).digest('hex') })
  }
  const blocks = [{ type: 'HERO_VIDEO', title: 'Artifact QA', media: { asset_id: ids.video, alt: 'QA', fit: 'CONTAIN' } }, { type: 'SPLIT_STORY', title: 'Artifact QA', media: { asset_id: ids.image, alt: 'QA', fit: 'CONTAIN' } }]
  const page = await ok('pages', { operation: 'draft', supplier_id: 'DIDAR', kind: 'DIDAR_HOME', title: 'Disposable artifact QA', blocks }, token)
  for (const operation of ['review', 'publish']) await ok('pages', { operation, page_id: page.page_id, version_id: page.version_id, approved: true, reason: 'Disposable artifact acceptance', idempotency_key: randomUUID() }, token)
  const image = await request('/api/didar/image?id=' + ids.image); assert.equal(image.status, 200)
  const path = '/api/didar/media-file?id=' + ids.video, full = await request(path), range = await request(path, undefined, undefined, { range: 'bytes=0-63' })
  assert.equal(full.status, 200); assert.equal(range.status, 206); assert.equal(range.bytes.length, 64); assert.match(range.headers['content-range'], /^bytes 0-63\//); assert.deepEqual(range.bytes, full.bytes.subarray(0, 64))
  for (const value of ['bytes=0-2,5-7', 'bytes=100000000000-']) assert.equal((await request(path, undefined, undefined, { range: value })).status, 416)
  const directImage = await request('/didar/image?id=' + ids.image), directFull = await request('/didar/media-file?id=' + ids.video), directRange = await request('/didar/media-file?id=' + ids.video, undefined, undefined, { range: 'bytes=0-63' })
  assert.equal(directImage.status, 200); assert.deepEqual(directImage.bytes, image.bytes); assert.equal(directFull.status, 200); assert.deepEqual(directFull.bytes, full.bytes); assert.equal(directRange.status, 206); assert.deepEqual(directRange.bytes, range.bytes)
  await ok('pages', { operation: 'pause', page_id: page.page_id, reason: 'Disposable artifact acceptance' }, token)
  assert.equal((await request('/api/didar/image?id=' + ids.image)).status, 404)
  for (const prefix of ['/api/didar/', '/didar/']) for (const [kind, action] of [['image', 'image'], ['video', 'media-file']]) assert.equal((await request(prefix + action + '?id=' + ids[kind])).status, 404)
  cases.push({ name: 'publication-privacy-range-and-pause', published_image: 200, published_video: 200, range: 206, range_bytes: 64, invalid_ranges: [416, 416], paused_private: 404 })
  success = true
} finally { await writeFile(join(output, 'result.json'), JSON.stringify({ status: success ? 'PASS' : 'FAIL', source_sha: c.source_sha, cases, actual_child_exits: exits, host_api_spawned: false }, null, 2) + '\n') }
