# Independent packaged-auth verification

Final bounded verdict: [FINAL_REVIEW.json](FINAL_REVIEW.json). Reviewed source `9846b5042e90d06d14d00b5fefdf67ebba455ec0`; authorized base `d9b55b3856d6e52ba86db517430572c2d46761e0`. Reviewer writes verification only. No source-workspace application runtime or dependency mount is used.

- [Accepted primary completion](runs/package-20261018080328338-54401542/COMPLETE.json): actual16 tests/299 assertions,23 independent HTTP/PG cases,3 authenticated browsers,6 screenshots, configuration/lifecycle/private-listener checks and source/resource parity. Actual browser/runner/supervisor closes0. All52 tests and8 reviewer scripts pinned by launch/parity; complete /app bytes/link maps pre==post.
- [Separate full image provenance](provenance/runs/provenance-20261018081109674-2709dec2/RESULT.json): all395 source inputs and complete outputs match inherited receipt, no mounts/network, actual image Node24.22.0; [externally observed wrapper0](provenance/runs/provenance-20261018081109674-2709dec2/TOOL_OBSERVED_WRAPPER_EXIT.json).
- [Independent source/result report](../../../docs/audits/auth-packaging/INDEPENDENT_REVIEW.md): explicit bounded topology, actual failures and limits.
- `runs/package-20261018073024528-22e6459c`: genuine missing Medusa dependency; later tests unexecuted, runner/supervisor1, cleanupPASS.
- `runs/package-20261018073925940-16c3ef9d`: reviewer QA URL TLS mismatch; later tests unexecuted, runner/supervisor1, cleanupPASS. Separate `diagnostic/runs/` preserves initial tool import1 and actual SDK proof0.
- `runs/package-20261018074841200-82d25449`: genuine contained Bun link resolution failure; tests unexecuted, runner/supervisor1; acknowledged packaging-source parityFAIL, cleanupPASS. Separate `diagnostic/runs/standalone-repro-*/` evidence preserves fresh raw reproduction rather than inventing the original raw stderr.
- `attempt-sources/` contains exact eight script snapshots/hash manifests for each failed primary run. Current root eight scripts are the final executed version.

To repeat only in an authorized disposable environment: supply explicit `AUTH_PACKAGE_CANDIDATE`, immutable `AUTH_PACKAGE_API_IMAGE` and `AUTH_PACKAGE_STOREFRONT_IMAGE` to `node verification/auth-packaging/reviewer/launch.mjs --launch` with valid existing build receipt and source/image freeze. This starts a detached observer chain; durable per-stage child closes, final parity/owned cleanup and independently observed runner/supervisor exits define acceptance. No backend/owner target should be substituted. Images must be built and available; the old failed image IDs were retired after retaining metadata/evidence. No key or token is a CLI argument or committed receipt. Runtime TLS is generated only in owned scratch, mounted read-only and removed.

No rollout, owner TLS/network/secret certification, full source compiler rebuild, Mac/ARM64/load or full unchanged commerce regression claim is made. Stop at Chief Architect review.
