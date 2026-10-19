# Preserved R5/R6 preparation failures

These are failed diagnostic executions, not release acceptance. GitHub workflow
conclusions are not numeric process exits. The numeric codes below come from the
recorded child-close receipts or actual CLI diagnostics. A later passing run does
not turn these runs into passing evidence. Artifacts require repository access
and have 30-day retention; retain downloaded copies before expiry.

Repository: `alirezasefidpour747/didar-b2c-marketplace`.

| Candidate source | Workflow run / job | Observed failure | Artifact ID | Artifact ZIP SHA-256 |
| --- | --- | --- | --- | --- |
| `614978b2a36f466a30ae10435ecd607aff709075` | [39209315639 / 117918943783](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39209315639) | Outer verifier `1`; Debian-context preparation failed. The inner curl numeric exit was not retrieved. Missing CA provisioning was corrected without disabling TLS. | `12167106490` | `c594c1dc3c2271fecda341f17222e03c1824f30e254488ff74ea4ce0b14bf63d` |
| `bff9e4ef8b73a35fb799ac0249b57cb387fc7230` | [39209421902 / 117919410855](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39209421902) | Outer verifier `1`: strict version oracle rejected actual Debian Compose `2.26.1-4`. Upstream version and package revision are now recorded separately. | `12166624345` | `f226a4b0c595ab724999bdde3a015df5347fefc8db7ec8d389742910d9897b79` |
| `84bbe94ed1f638883d1acba768b563d27bb382f8` | [39209676838 / 117920225440](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39209676838) | Fixture `1`, isolated PostgreSQL restore child `2`. TCP readiness replaces the temporary-init Unix socket check; `ON_ERROR_STOP=1` makes SQL errors fatal. The original connection failure cause was not conclusively captured. | `12166762617` | `a775c994427fb44aa78d47a876c33c4bfe8a3bdec258add65d6870333944d199` |
| `a4479edc3cb45a6bddb60ee1764d2d738a82f77d` | [39210459738](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39210459738) | Fixture `1`; protected CLI `2`, `UNSAFE_PROCESS_OVERRIDE:COMPOSE_DISABLE_ENV_FILE`. The fixture re-entered an internal flag as operator input. Caller overrides remain rejected. | `12167193804` | `8c605f69016a4cfcc787da01d50a700723a4b6f9395cafbce657048f17d727e0` |
| `645c18d59249667a431258eadea05828ea52faa1` | [39211429227 / 117925584323](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39211429227) | Fixture `1`; `recreate-api` Compose child `1`. Only stderr SHA was retained at that revision, so its precise Compose error is unproven. Faithful legacy Compose metadata and owned, redacted diagnostics were subsequently added. | `12167273579` | `0bd22cf88df23b6d59908bf24676097449b06c2f77a4a14b89311f8cd6bcaace` |
| `d6600480454ba8cac8475766cfa075d0c6929585` | [39212307434 / 117928464090](https://github.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/39212307434) | Fixture `1`; migration itself `0`; protected CLI `2`, `UNRELATED_OR_DEPENDENCY_CHANGED`. Before/after metadata was not captured, so the precise changed field is unproven. Mount ordering is now canonicalized by destination while preserving every compared value; owned QA mismatches record curated metadata. | `12168600786` | `e59ea0f9372d886baddeb12bc28414c3349f7a3f5b14f2be882c38859f158a87` |

Some earlier full CI/image jobs were cancelled by a later branch push before
completion. Those executions are **CANCELLED**, not passing or numeric exit `0`.
The final handoff identifies the actual final-source runs separately.

The interim `d660048` R5 runner and all eight recorded groups returned `0`.
Independent visual review nevertheless found its Vendor desktop screenshot in
transient loading: the old browser check asserted a heading also present before
the canonical workspace loaded. The mobile screenshot taken afterward showed
the loaded own inventory. Preserve that evidence, but do not cite its desktop
image as loaded-workspace acceptance. The corrected harness requires HTTP `200`
from the real canonical native management API, populated product/offer data,
Vendor own-supplier scope, and matching rendered offer quantity before either
screenshot. Final-source execution is required; this is a verifier correction,
not a demonstrated application defect.

Additional isolated Debian compatibility failures and their actual receipts are
retained in [`debian-compat/scope-and-failures.json`](debian-compat/scope-and-failures.json):
fixture startup `1`, fixture stderr setup `1`, and the original njs0.8.9 empty-body
handler `1`/HTTP `503`. The last exposed a genuine detached empty Buffer issue;
the bounded normalization preserves all nonempty bytes and the unchanged v1
protocol. Successful compatibility evidence is separate from application artifact
acceptance and target installation.

No failed evidence authorizes publication, target configuration, installation,
an unsigned fallback, merge or release. `TARGET_CONFIG=BLOCKED` until verified
target discovery and review; independent public HTTPS acceptance is unexecuted.
