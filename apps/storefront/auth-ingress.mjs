// Trusted first hop for customer authentication. No caller forwarding header is trusted.
// Run only in the documented topology; Node/TLS owns the actual public socket.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { readFileSync } from 'node:fs'
import { HEADER, requireKey, signNetwork, verifyNetwork, normalizePeer, exactPeers } from '@didar/auth-network'
const key = requireKey(process.env.DIDAR_AUTH_NETWORK_KEY)
const mode = process.env.DIDAR_AUTH_INGRESS_MODE ?? 'socket'
if (!['socket', 'verified-relay'].includes(mode)) throw Error('INVALID_AUTH_INGRESS_MODE')
const relayPeers = exactPeers(process.env.DIDAR_AUTH_INGRESS_PEERS, mode === 'verified-relay')
const api = process.env.DIDAR_AUTH_NATIVE_URL ? new URL(process.env.DIDAR_AUTH_NATIVE_URL) : null
// Native routing is opt-in; the established socket-only development topology stays intact.
if (api && (mode !== 'verified-relay' || api.origin !== process.env.DIDAR_AUTH_NATIVE_URL ||
  api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.username || api.password || api.pathname !== '/'))
  throw Error('INVALID_NATIVE_AUTH_UPSTREAM')
if (mode === 'verified-relay' && !api) throw Error('NATIVE_AUTH_UPSTREAM_REQUIRED')
const upstream = new URL(
  process.env.DIDAR_AUTH_STOREFRONT_URL || 'http://127.0.0.1:3001',
)
if (
  !['http:', 'https:'].includes(upstream.protocol) ||
  upstream.username ||
  upstream.password ||
  upstream.pathname !== '/' ||
  upstream.search ||
  upstream.hash
)
  throw Error('INVALID_AUTH_UPSTREAM')
const hostname = process.env.DIDAR_AUTH_INGRESS_HOST || '127.0.0.1',
  port = Number(process.env.DIDAR_AUTH_INGRESS_PORT || 3000)
const cert = process.env.DIDAR_AUTH_INGRESS_TLS_CERT_FILE,
  tlsKey = process.env.DIDAR_AUTH_INGRESS_TLS_KEY_FILE
if (
  !!cert !== !!tlsKey ||
  (mode === 'verified-relay' && !cert) ||
  (!['127.0.0.1', '::1', 'localhost'].includes(hostname) && !cert)
)
  throw Error('TLS_REQUIRED_FOR_PUBLIC_AUTH_INGRESS')
function headers(req) {
  const result = { ...req.headers }
  for (const name of Object.keys(result))
    if (
      name.startsWith('x-didar-auth-') ||
      name === 'forwarded' ||
      name.startsWith('x-forwarded-') ||
      ['x-real-ip', 'true-client-ip', 'cf-connecting-ip'].includes(name)
    )
      delete result[name]
  result['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http'
  return result
}
const nativePath = path => /^\/(dashboard|seller|auth|admin|vendor|store|hooks|didar|static)(\/|$)/.test(path) || path === '/health'
const handler = async (req, res) => {
  try {
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) {
      res.writeHead(400)
      res.end()
      return
    }
    const path = req.url.split('?')[0],
      outHeaders = headers(req)
    const target = api && nativePath(path) ? api : upstream
    const transport = target.protocol === 'https:' ? https : http
    let body
    if (
      req.method === 'POST' &&
      /^\/(?:api\/)?didar\/(login|register)$/.test(path)
    ) {
      let length = 0
      const chunks = []
      if (
        req.headers['content-encoding'] &&
        req.headers['content-encoding'] !== 'identity'
      ) {
        res.writeHead(415)
        res.end()
        return
      }
      if (Number(req.headers['content-length'] || 0) > 1200000) {
        res.writeHead(413)
        res.end()
        return
      }
      for await (const chunk of req) {
        length += chunk.length
        if (length > 1200000) {
          res.writeHead(413)
          res.end()
          return
        }
        chunks.push(chunk)
      }
      body = Buffer.concat(chunks)
      if (mode === 'verified-relay') {
        // Never infer an original client from any forwarding header. A verified
        // proof is forwarded byte-for-byte; the API alone consumes its nonce.
        try {
          if (!relayPeers.includes(normalizePeer(req.socket.remoteAddress))) throw Error()
          verifyNetwork({ key, assertion: req.headers[HEADER], method: req.method, path: req.url, body })
          outHeaders[HEADER] = req.headers[HEADER]
        } catch {
          res.writeHead(403); res.end(); return
        }
      } else if (path.startsWith('/api/')) {
        outHeaders[HEADER] = signNetwork({
          key,
          peer: req.socket.remoteAddress,
          method: req.method,
          path: req.url,
          body,
        })
      }
      delete outHeaders['transfer-encoding']
      outHeaders['content-length'] = String(body.length)
    }
    const request = transport.request(
      {
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port || undefined,
        protocol: target.protocol,
        path: req.url,
        method: req.method,
        headers: outHeaders,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers)
        response.pipe(res)
      },
    )
    request.setTimeout(150000, () => request.destroy())
    request.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    res.on('close', () => {
      if (!res.writableFinished) request.destroy()
    })
    if (body) request.end(body)
    else req.pipe(request)
  } catch {
    if (!res.headersSent) res.writeHead(400)
    res.end()
  }
}
const server = cert
  ? https.createServer(
      { cert: readFileSync(cert), key: readFileSync(tlsKey) },
      handler,
    )
  : http.createServer(handler)
// Development HMR uses the same fixed upstream; identity proof is never forwarded on upgrades.
server.on('upgrade', (req, socket, head) => {
  if (
    mode === 'verified-relay' ||
    upstream.protocol !== 'http:' ||
    !req.url?.startsWith('/') ||
    req.url.startsWith('//')
  )
    return socket.destroy()
  const peer = net.connect(
    Number(upstream.port || 80),
    upstream.hostname.replace(/^\[|\]$/g, ""),
    () => {
      const h = headers(req)
      peer.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
          Object.entries(h)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n',
      )
      if (head.length) peer.write(head)
      socket.pipe(peer)
      peer.pipe(socket)
    },
  )
  peer.on('error', () => socket.destroy())
  socket.on('error', () => peer.destroy())
  socket.on('close', () => peer.destroy())
})
server.requestTimeout = 300000
server.headersTimeout = 10000
server.listen(port, hostname, () =>
  console.log(
    'DIDAR signed auth ingress ready (configuration values withheld)',
  ),
)
