# DIDAR — Standing Architecture, Integration and Staging Delivery Policy

This is the owner's persistent, version-independent operating policy for this project. Apply it to future tasks unless the owner explicitly changes it. Keep it in repository guidance and reference it from AGENTS.md; do not rely on conversational memory alone.

## 1. Responsibility boundaries

The development agent owns:

- Implementing authorized changes.
- Appropriate testing and independent review.
- Integrating accepted work into the canonical main branch.
- Producing reproducible deployment artifacts.
- Preparing installation/update instructions and runtime handoffs.

The conversation “03 — DIDAR Deployment & Runtime QA” owns guiding the owner through installation, updates and runtime verification on the owner's existing hosted staging server.

Do not independently connect to or modify that server unless the owner explicitly assigns that action to this agent.

The staging server already exists and has infrastructure installed. Inspect and accommodate its actual state through the runtime workflow. Do not assume a clean machine or propose reinstalling it by default.

## 2. Source and version independence

Never hard-code a particular commit, PR number, branch chain, package version or server address into this standing policy.

For each task, resolve the actual current:

- Authorized scope and acceptance criteria.
- Canonical repository and main branch.
- Relevant working branches and dependencies.
- Reviewed source revision.
- Target environment and supported deployment method.

Pin each individual delivery to an exact source revision and artifact identity. Version independence of this policy does not remove the need for precise release provenance.

“Latest” means the latest accepted and verified project revision. Dependency and infrastructure upgrades require compatibility assessment, appropriate verification and authorization within the task's scope.

## 3. Architecture and data authority

Preserve the approved Medusa/Mercur architecture and native capabilities. Prefer supported extension mechanisms and reuse before replacement.

Maintain explicit canonical authorities for identity, catalog, inventory, orders, payments and financial records. Do not create competing sources of truth or parallel management surfaces without an approved architecture decision.

Separate:

- Functional acceptance.
- Architecture acceptance.
- Operational and release readiness.

A passing test suite or build does not establish complete architecture compliance or production readiness.

Do not silently turn proposed business rules into approved contracts. Identify unresolved decisions and block only the capabilities that actually depend on them.

## 4. Integration and branch lifecycle

Use isolated branches for active changes. Keep accepted work moving toward one canonical main baseline rather than accumulating indefinitely on unmerged branches.

Inspect dependencies, ancestry and overlapping changes before integration. Preserve unique accepted content and resolve conflicts deliberately.

When integration is authorized:

- Verify the integrated candidate.
- Merge accepted changes in the appropriate order.
- Identify superseded PRs only after confirming their content is preserved.
- Verify the resulting remote main revision.
- Provide a precise list of branches eligible for deletion.

Do not rewrite main history or delete branches without authorization. Do not merge unfinished or unaccepted work merely to reduce branch count.

Merging code does not itself authorize deployment or activation of a new business capability.

## 5. Reproducible delivery

Build each release from the exact verified main revision selected for that delivery.

Provide a complete, identifiable deployment artifact containing all required runtime dependencies, assets and process configuration.

Verify the actual packaged artifact in an isolated environment. It must not depend on undeclared source-workspace files or development symlinks.

Use committed dependency locks and reviewed compatible runtime versions. Record the source revision, artifact digest, runtime requirements and verification evidence.

Select verification according to the actual change. Distinguish newly executed checks from inherited evidence and unverified assumptions. Record real process outcomes; never infer success solely from log text.

Material changes require independent review appropriate to their scope.

## 6. Existing-server installation and recovery

Prepare a practical handoff for the Deployment & Runtime QA workflow.

The runbook must support:

- Read-only discovery of the existing environment.
- Compatibility and resource preflight.
- Preservation of application data, media, configuration and unrelated services.
- Verified backup and recovery preparation before risky changes.
- Data-preserving migrations and explicit compatibility assessment.
- Installation/update, startup, health checks and restart behavior.
- Artifact retention and a realistic rollback or recovery procedure.

Do not prescribe database resets, demo seeding, volume deletion, destructive cleanup or infrastructure replacement as routine updates.

Document required configuration and secure secret provisioning. Never expose secret values in Git, logs, screenshots or handoffs.

## 7. Internet-accessible staging

The required outcome is a hosted staging application usable directly over the Internet through its configured domain and HTTPS.

All enabled and accepted customer, Admin and Vendor functionality, including required API and media routes, must be reachable through the appropriate public application routes with normal authentication and permissions.

Do not require the owner to run a local server, SSH tunnel, localhost forwarder, VPN or personal-computer proxy. The hosted application must continue working when the owner's computer is off.

Keep databases, caches and private application listeners internal. Internet access to application functionality does not mean publicly exposing every internal service.

Preserve native panel routes and the project's approved URL structure.

## 8. Network and authentication trust

Treat actual routing, TLS termination, proxies and private listeners as part of release correctness.

Use the currently approved authentication and client-attribution model. Do not trust caller-controlled forwarding headers as authority.

If the target topology differs from the verified topology, reconcile the difference and verify the affected trust boundaries before claiming readiness.

Document public and private entrypoints, trusted peers, required secrets, health checks and operational dependencies.

Do not invent a new security protocol or force a particular transport implementation through this policy; follow the reviewed architecture applicable to the release.

## 9. Runtime acceptance and honest status

The development agent hands off a verified package and runbook. The Deployment & Runtime QA workflow guides installation and gathers evidence from the actual staging environment.

Runtime acceptance must establish:

- Public HTTPS access from an independent Internet connection.
- Working customer and native management journeys.
- Correct API, media and permission behavior.
- Appropriate public/private exposure.
- Health, logs and restart behavior.
- The actual running source revision and artifact identity.

Use designated test accounts and non-destructive checks. Do not perform live financial operations or disruptive abuse tests without explicit authorization.

Report package readiness, installation completion, Internet-access verification and production readiness as separate outcomes. Claim each outcome only when supported by actual evidence.

## 10. Communication and continuity

Write executable technical instructions in English. Write owner-facing explanations and final handoffs in Persian unless the owner requests otherwise.

Each delivery must state:

- What changed and why.
- What was integrated into main.
- Exact source and artifact identity.
- Executed verification and independent review.
- Installation/update instructions.
- Recovery references.
- Remaining limitations and blockers.
- Branch cleanup eligibility.
- The next responsible workflow and concrete action.

Do not claim that creating an issue starts execution. Do not claim that another conversation received instructions automatically. Prepare a self-contained handoff the owner can transfer.

Avoid repeated requests for authorization already granted. Stop only when a concrete blocker, unresolved consequential decision, failed gate or newly required authority prevents safe progress.

This policy governs how work is delivered. It does not authorize every future feature, merge, server operation, destructive action or release. Resolve task-specific scope from the owner's current instructions.
