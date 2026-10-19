# Nginx first-hop signer — bounded implementation

This directory implements the edge part of the reviewed topology. It is not the
owner server configuration and does not modify an existing Nginx instance.
Target discovery from Runtime QA is required before rendering a candidate.

The module requires Nginx HTTP SSL and realip support and a version-pinned njs
HTTP dynamic module with binary `requestBuffer`, `internalRedirect`, `js_var`,
Node-compatible SHA-256/HMAC, WebCrypto system entropy and Buffer base64url.
Verify the actual Nginx/module binary pair; a Node unit test does not establish
module compatibility. Do not install an unpinned module into the owner's Nginx.

`auth.mjs` runs as `js_content` for only the four POST login/register paths. It
signs the existing v1 protocol over the unchanged method, `$request_uri` and
binary `requestBuffer`, then internally redirects to a fixed TLS relay location.
Nginx retains the original request body. There is no text conversion, body
subrequest, unsigned fallback or caller-selected upstream.

`$realip_remote_addr` is the original connection socket when realip is present.
This bounded mode also requires it to equal `$remote_addr` and rejects an active
PROXY address. No `set_real_ip_from`, `real_ip_header`, PROXY protocol, CDN or
upstream load balancer is supported by this template. A CDN cannot be made a
first-hop client by trusting its forwarding headers. Discovery must establish
the actual socket path and absence of an upstream attribution boundary.

The first hop overwrites client proof and forwarding headers. It uses secure
system entropy for each nonce; timestamps must remain synchronized. Auth bodies
are bounded at exactly 1,200,000 bytes and buffered as binary. Unsupported content
compression, unsafe temp-file bodies, unknown sockets and configuration/clock/
entropy failures never continue unsigned. Encoded aliases of an auth path are
rejected rather than signed under a different raw target.

All traffic goes to one fixed HTTPS relay with mandatory CA and hostname
verification. The relay, not Nginx, owns the fixed native/API/media vs Next route
inventory and the exact observed peer allowlist. Native/Admin/Vendor/Media
authorization remains in the API. Private Next must remain unpublished.

## Render and inspect a candidate

Prepare a non-secret JSON object with exactly the following string keys, using
observed values, not historical examples:

```
NJS_MODULE_FILE PID_FILE SIGNER_DIRECTORY RELAY_ADDRESS LISTEN_ADDRESS
PUBLIC_HOST PUBLIC_PORT TLS_CERT_FILE TLS_KEY_FILE UPSTREAM_CA_FILE RELAY_TLS_NAME
```

`RELAY_ADDRESS` and `LISTEN_ADDRESS` require explicit IPv4:port or [IPv6]:port.
Hostname fields do not contain schemes, paths or ports. All file paths are
absolute. `SIGNER_DIRECTORY` must contain the version-matched `auth.mjs` and
`sign.mjs` files. Secret values never belong in this JSON, rendered config or
image. Supply `DIDAR_AUTH_NETWORK_KEY` through the reviewed runtime secret
mechanism and preserve the existing shared key until a compatible-bundle change
is reviewed. Never print it while diagnosing Nginx environment inheritance.

```sh
node scripts/deployment/nginx/render.mjs discovery.json new-candidate-directory
node --test scripts/deployment/nginx/sign.test.mjs
nginx -t -c /absolute/path/to/new-candidate-directory/nginx.conf
```

The renderer refuses unknown/missing fields, injection characters, unresolved
paths and overwriting an existing candidate. `nginx -t` is necessary but does not
prove HMAC interoperability, actual-peer attribution or target readiness. Require
the isolated real Nginx HTTPS/Docker bridge matrix before any cutover.

The upstream API upload limit remains 29MiB; auth has a stricter independent
limit. Range and cache-control headers pass through; proxy caching is disabled.
The template does not implement HMR/WebSocket upgrades. It preserves cookies,
Authorization, content types and original URI/query bytes. Configure same-origin
panel build URLs in the compatible application bundle; do not rewrite roles,
sessions, redirects or request bodies at the edge.
