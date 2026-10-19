// js_content deliberately buffers auth ONLY. The named proxy preserves original raw bytes/URI.
import signer from './sign.mjs'

const authPaths = ['/api/didar/login', '/api/didar/register', '/didar/login', '/didar/register']

function authenticate(r) {
  try {
    if (r.method !== 'POST') { r.return(405); return }
    const path = r.variables.request_uri
    if (!authPaths.includes(path.split('?')[0])) { r.return(400); return }
    // This configuration supports a genuine first hop only. No CDN/PROXY/real_ip rewrite.
    const original = r.variables.realip_remote_addr
    if (!original || signer.normalizePeer(original) !== signer.normalizePeer(r.variables.remote_addr) || r.variables.proxy_protocol_addr) {
      r.return(503); return
    }
    const encoding = r.headersIn['Content-Encoding']
    if (encoding && encoding !== 'identity') { r.return(415); return }
    const length = r.headersIn['Content-Length']
    if (length && (!/^[0-9]+$/.test(length) || Number(length) > 1200000)) { r.return(413); return }
    // requestBuffer is binary, never requestText/JSON/subrequest body conversion.
    // A nonempty temp-file body is rejected instead of being silently signed as empty.
    const body = r.requestBuffer
    if (r.variables.request_body_file || (!body && (Number(length || 0) > 0 || r.headersIn['Transfer-Encoding']))) {
      r.return(413); return
    }
    // njs0.8.9 may expose an empty requestBuffer with a detached backing
    // store. Hash a fresh empty buffer; preserve every nonempty raw byte.
    const raw = body && body.length ? body : Buffer.alloc(0)
    if (raw.length > 1200000) { r.return(413); return }
    r.variables.didar_network_proof = signer.signNetwork({
      key: process.env.DIDAR_AUTH_NETWORK_KEY,
      peer: original,
      method: r.method,
      path,
      body: raw,
    })
    r.internalRedirect('@didar_signed_relay')
  } catch (error) {
    // No configuration, socket, entropy, crypto or buffer failure falls back unsigned.
    r.return(503)
  }
}

export default { authenticate }
