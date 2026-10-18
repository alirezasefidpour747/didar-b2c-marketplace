// njs and Node-compatible v1 signer. Keep wire compatibility with @didar/auth-network.
import hash from 'crypto'

const MAX_AUTH_BYTES = 1200000

function ipv4(value) {
  if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(value)) throw Error('INVALID_SOCKET')
  const octets = value.split('.').map(Number)
  if (octets.some(n => n > 255)) throw Error('INVALID_SOCKET')
  return octets
}

function normalizePeer(value) {
  if (typeof value !== 'string' || value.includes('%') || !value.length) throw Error('INVALID_SOCKET')
  if (!value.includes(':')) return ipv4(value).join('.')
  let address = value.toLowerCase()
  if (address.includes('.')) {
    const colon = address.lastIndexOf(':')
    const bytes = ipv4(address.slice(colon + 1))
    address = address.slice(0, colon + 1) + ((bytes[0] << 8) | bytes[1]).toString(16) + ':' + ((bytes[2] << 8) | bytes[3]).toString(16)
  }
  if (!/^[a-f0-9:]+$/.test(address) || address.includes(':::')) throw Error('INVALID_SOCKET')
  const halves = address.split('::')
  if (halves.length > 2) throw Error('INVALID_SOCKET')
  const groups = half => half === '' ? [] : half.split(':').map(part => {
    if (!/^[a-f0-9]{1,4}$/.test(part)) throw Error('INVALID_SOCKET')
    return parseInt(part, 16)
  })
  const left = groups(halves[0]), right = halves.length === 2 ? groups(halves[1]) : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) throw Error('INVALID_SOCKET')
  const words = left.concat(Array(missing).fill(0), right)
  if (words.slice(0, 5).every(n => n === 0) && words[5] === 65535) {
    return [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join('.')
  }
  let start = -1, length = 1
  for (let i = 0; i < words.length;) {
    if (words[i] !== 0) { i++; continue }
    let end = i
    while (end < words.length && words[end] === 0) end++
    if (end - i > length) { start = i; length = end - i }
    i = end
  }
  if (start === -1) return words.map(n => n.toString(16)).join(':')
  return words.slice(0, start).map(n => n.toString(16)).join(':') + '::' + words.slice(start + length).map(n => n.toString(16)).join(':')
}

function randomNonce() {
  // njs' Node-compatible crypto module exposes hashing, not randomBytes.
  // Both supported runtimes expose the system CSPRNG through WebCrypto.
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

function signNetwork(input) {
  const key = input.key, peer = input.peer, method = input.method, path = input.path, body = input.body
  const ts = input.ts === undefined ? Date.now() : input.ts
  const nonce = input.nonce === undefined ? randomNonce() : input.nonce
  if (typeof key !== 'string' || Buffer.byteLength(key) < 32) throw Error('AUTH_NETWORK_NOT_CONFIGURED')
  if (!Buffer.isBuffer(body) || body.length > MAX_AUTH_BYTES) throw Error('INVALID_BODY')
  if (!Number.isSafeInteger(ts) || ts < 0 || !/^[a-f0-9]{32}$/.test(nonce)) throw Error('CLOCK_OR_ENTROPY_FAILURE')
  if (method !== 'POST' || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\r\n\x00]/.test(path)) throw Error('INVALID_TARGET')
  const payload = Buffer.from(JSON.stringify({ v: 1, peer: normalizePeer(peer), ts, nonce })).toString('base64url')
  const digest = hash.createHash('sha256').update(body).digest('hex')
  const signature = hash.createHmac('sha256', key).update(['didar-auth-network-v1', method, path, digest, payload].join('\n')).digest('hex')
  return payload + '.' + signature
}

export default { signNetwork, normalizePeer, MAX_AUTH_BYTES }
