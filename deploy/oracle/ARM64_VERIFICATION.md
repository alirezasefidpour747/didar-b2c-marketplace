# ARM64 evidence — 2026-10-15

Registry manifest verification succeeded for each image used by the source Docker build and Compose stack. These are the linux/arm64 descriptor digests returned for the listed tags on the verification date; tags can move. `verify-images.sh` repeats the checks and prints the current descriptors before deployment.

| Image tag | Verified linux/arm64 descriptor |
| --- | --- |
| `node:24-bookworm-slim` | `sha256:156e9bc7a0a267cc6ca77b4283e32b123479342df684ce297455d7b95ff5a6b5` |
| `oven/bun:1.4.3` | `sha256:bf9d5b1f01be2de7cec5aa6e3977e8848f7ab9a307c6c3a8af7a50a27e609023` |
| `postgres:17-alpine` | `sha256:0b2882c46a2b8d8e148431b333394348cf4d7f15aec6df7f17d51dc641e56cfa` |
| `redis:7-alpine` | `sha256:1f09a89a207d794a8c61d9edfc26e7c58427de10ccef7c5d18d638df79a63b85` |

The frozen Bun lockfile static audit passed for SWC, Next SWC, Sharp, esbuild, Rollup, resolver bindings and Turbo ARM64 artifacts, including package integrity metadata. No Linux x64-only hard dependency was found in the audited lock metadata. This establishes artifact availability, not successful native execution.

Twenty-three local environment/deployment tests passed: eight mocked Oracle shape/host/free-tier guards, four destination-secret/demo configuration checks, four mocked SSH source-transfer controls, three mocked backup failure/privacy/image-retention checks and four append-only local environment migration checks. The merged Compose ARM64 configuration validates. Tests use mocks and local temporary directories; they do not provision resources, SSH to a real VM, restore databases or emulate ARM.

The available development machine is x86_64. A clean native ARM64 build, migrations, service startup, image processing and end-to-end functional tests remain pending an accessible eligible Ubuntu A1 staging VM. Oracle availability/capacity, account-wide free eligibility, host address, verified host key and authorized SSH key have not been supplied. No Oracle resource, paid fallback or production deployment was attempted.
