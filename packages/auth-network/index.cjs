// Server-only request attribution, not an identity or authentication provider.
const {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} = require("node:crypto");
const { isIP } = require("node:net");
const HEADER = "x-didar-auth-network",
  MAX_AGE_MS = 30000;
function normalizePeer(value) {
  if (typeof value !== "string" || !isIP(value) || value.includes("%"))
    throw Error("FORBIDDEN");
  if (isIP(value) === 4) return value;
  const normalized = new URL("http://[" + value + "]/").hostname
    .slice(1, -1)
    .toLowerCase();
  const mapped = normalized.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/);
  if (mapped) {
    const n = parseInt(mapped[1], 16),
      m = parseInt(mapped[2], 16);
    return [n >> 8, n & 255, m >> 8, m & 255].join(".");
  }
  return normalized;
}
function requireKey(key) {
  if (typeof key !== "string" || Buffer.byteLength(key) < 32)
    throw Error("AUTH_NETWORK_NOT_CONFIGURED");
  return key;
}
// Exact socket peers only. This is configuration, never a forwarding-header parser.
function exactPeers(value, required = false) {
  if (value === undefined || value === "") {
    if (required) throw Error("AUTH_NETWORK_NOT_CONFIGURED");
    return [];
  }
  if (typeof value !== "string") throw Error("AUTH_NETWORK_NOT_CONFIGURED");
  try {
    const peers = value.split(",").map((p) => {
      if (!p.trim()) throw Error();
      return normalizePeer(p.trim());
    });
    if (new Set(peers).size !== peers.length) throw Error();
    return peers;
  } catch {
    throw Error("AUTH_NETWORK_NOT_CONFIGURED");
  }
}
function apiNetworkPolicy(env = process.env) {
  const mode = env.DIDAR_AUTH_PROXY_POLICY ?? "direct";
  if (!["direct", "require-proof"].includes(mode))
    throw Error("AUTH_NETWORK_NOT_CONFIGURED");
  const peers = exactPeers(env.DIDAR_AUTH_PROXY_PEERS, mode === "require-proof");
  if (mode === "require-proof") requireKey(env.DIDAR_AUTH_NETWORK_KEY);
  return { mode, peers };
}
function mac(key, payload, method, path, body) {
  return createHmac("sha256", requireKey(key))
    .update(
      [
        "didar-auth-network-v1",
        method,
        path,
        createHash("sha256").update(body).digest("hex"),
        payload,
      ].join("\n"),
    )
    .digest("hex");
}
function signNetwork({
  key,
  peer,
  method,
  path,
  body,
  ts = Date.now(),
  nonce = randomBytes(16).toString("hex"),
}) {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, peer: normalizePeer(peer), ts, nonce }),
  ).toString("base64url");
  return payload + "." + mac(key, payload, method, path, body);
}
function verifyNetwork({
  key,
  assertion,
  method,
  path,
  body,
  now = Date.now(),
}) {
  requireKey(key);
  if (
    typeof assertion !== "string" ||
    assertion.length > 700 ||
    !/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(assertion)
  )
    throw Error("FORBIDDEN");
  const [payload, signature] = assertion.split(".");
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(mac(key, payload, method, path, body), "hex"),
    )
  )
    throw Error("FORBIDDEN");
  let p;
  try {
    const raw = Buffer.from(payload, "base64url");
    if (raw.toString("base64url") !== payload) throw Error();
    p = JSON.parse(raw.toString("utf8"));
  } catch {
    throw Error("FORBIDDEN");
  }
  if (
    !p ||
    Object.keys(p).sort().join(",") !== "nonce,peer,ts,v" ||
    p.v !== 1 ||
    !Number.isSafeInteger(p.ts) ||
    p.ts > now + 5000 ||
    p.ts < now - MAX_AGE_MS ||
    !/^([a-f0-9]{32})$/.test(p.nonce) ||
    normalizePeer(p.peer) !== p.peer
  )
    throw Error("FORBIDDEN");
  return p;
}
module.exports = {
  HEADER,
  MAX_AGE_MS,
  normalizePeer,
  requireKey,
  exactPeers,
  apiNetworkPolicy,
  signNetwork,
  verifyNetwork,
};
