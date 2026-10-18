# Independent review — source-grounded topology blocker

Reviewer: separate review-only agent `cms_independent_review`. No application/config/test implementation or owner-server access by reviewer.

Pinned source: 874447e6ec8fc58af3f09a87a4131b45c550a478.

Verdict: the ordinary existing Nginx HTTPS → Docker bridge path is not covered by the current socket signer. No reviewed configuration-only remedy was found. This is an audit finding, not approval of an unimplemented runtime.

Independently inspected ingress, packaged supervisor, Compose, Next proxy, API admission, native workspace and panel clients. Incoming proofs are replaced; signer sees proxy socket; all URI targets go to Next; private Next is loopback-only; API policy A does not infer the original client from headers/allowlist. Native workspace uses /didar/login before canonical connect and must not be broken by blanket blocking.

Design review supports a bounded same-v1 signed-edge/verified-relay development track with explicit actual peer checks and no unsigned fallback, preserving raw bytes/path/nonce, original identities and direct/native auth contracts. It does not certify a particular Nginx signer implementation or target module.

Required evidence: real Nginx plus Docker integration, distinct actual clients/quotas, spoof/replay/byte/path negatives, native linking, private exposure, full CI and published artifact verification. Recovery must restore a compatible bundle or fail closed; never treat unsigned proxied authentication as an equivalent rollback.

Independently executed `node verification/topology-874447e/probe.mjs`: actual process exit0, 2 PASS and 3 GAP_REPRODUCED; ingress child code=null/signal=SIGTERM. Source hashes matched saved evidence. `git diff --check` passed and tracked application source remained unchanged at pinned874. Final documentation/policy-A clarification and acceptance/recovery contract reviewed with no blocking documentation finding.

Probe evidence uses Node HTTP only and is explicitly narrower than actual topology acceptance. No target TLS, Docker/Nginx implementation, owner installation or Internet acceptance was independently executed by this review. PASS applies to audit accuracy and bounded follow-up requirements only; deployment remains blocked.
