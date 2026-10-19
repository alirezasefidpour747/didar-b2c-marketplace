// Execute with the pinned njs binary, not Node. Input is generated from v1 Node.
import fs from 'fs'
import signer from './sign.mjs'

const vectors = JSON.parse(fs.readFileSync(process.env.DIDAR_NJS_VECTORS, 'utf8'))
let count = 0
for (let index = 0; index < vectors.positive.length; index++) {
  const item = vectors.positive[index]
  const input = item.input
  input.body = Buffer.from(input.bodyHex, 'hex')
  const proof = signer.signNetwork(input)
  if (proof !== item.expected) throw Error('V1_VECTOR_MISMATCH:' + count)
  count++
}
for (let index = 0; index < vectors.invalidPeers.length; index++) {
  const peer = vectors.invalidPeers[index]
  let rejected = false
  try { signer.normalizePeer(peer) } catch (e) { rejected = true }
  if (!rejected) throw Error('INVALID_PEER_ACCEPTED')
}
const randomized = vectors.positive[0].input
delete randomized.nonce
const first = signer.signNetwork(randomized), second = signer.signNetwork(randomized)
if (first === second || !first.match(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/)) throw Error('ENTROPY_NOT_OBSERVED')
console.log(JSON.stringify({ status: 'PASS', vectors: count, invalid_peers: vectors.invalidPeers.length, observed_distinct_secure_nonces: true }))
