# Independent follow-up: native product regression setup

**Source review PASS, no blocker**, final file SHA-256 `29e76844d5488cdc085a27cdca8c5582f4a5ea2549a94d051f65ef56925a58dc`. No repository files written by reviewer.

Original full validation at `3c58201993c7d70df22824a4d9e93629efa77da0` genuinely failed: original first seven stages exited 0; production builds passed; Bun backend was 225 pass / 6 fail. First native target test lacked `products:edit`; subsequent five tests had undefined dependent fixture state. Parent retained actual runner exit 1. Browser and final no-demo stages were not reached in that execution.

The final correction proves both existing identities using actual native login and canonical password login, then calls the original dual-proof connect endpoint and checks actual `/admin/users/me?fields=+permissions` product edit/manage permission before unchanged CRUD. Source review of the connect handler confirms canonical session verification, existing role/scope restrictions and idempotent same-identity insertion. No role assertion, new permission grant, application change or setup SQL bypass is introduced.

Teardown removes only the disposable canonical demo-admin bridge for the exact live native-admin@didar.test actor, after existing native product cleanup. It restores the required unconnected state for the later browser journey. It does not delete unrelated actors or grants. Existing disposable QA guard remains.

Independent exact-text comparison proves removing only those two added blocks restores the original file byte-for-byte: CRUD and all five protection tests/expected statuses remain unchanged. Latest comparison process exited 0. An earlier setup-only comparison exited 1 while coordinator added the necessary teardown; no application or test execution was involved, and the final two-block comparison passes.

Fresh combined-suite/browser proof remains required. This source review does not claim runtime success or parallel fixture isolation; existing shared identities and suite sequencing remain. Lint and QA type reviews are unaffected.
