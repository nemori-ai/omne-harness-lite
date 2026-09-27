# Independent P3 joint credential verification — 2026-09-27

## Position and authority

- Execution worktree: `panqiwei/model-request-runtime-p3-joint-credential-verification`, HEAD `553222412f56facad3cc0bb0c69a7e31e3d4fbbc`; tracked status clean before and after. No tracked product, design, test or lock file was edited.
- Task brief SHA-256: `c66e426aad14c0226b5340162da4a5f135378923c995b121d9e8d0e5ea2fb6ab`.
- D-075 adopted `capability.model-profile-directory/v3` and the D-075 model-only subset of `capability.credential-custodian/v2`, with directory `v3-design.md` and local custodian `v2-design.md`. This report is implementation evidence, not acceptance or an amendment of either design.
- `inputs.sha256` freezes 33 selected related design, source, public export, README, storage and lock inputs; `sha256sum -c inputs.sha256` exited 0 after all tests. The successful runner SHA-256 is `b6881c4f45c6ae6b8a5f96a5732257e38b992140bafe9d0f3f6968813a23af39`; the preserved concurrency runner SHA-256 is `ddf2373978a360021e8bca3fd3eb764d3fb6c75576dd8b570fe06aa996a6e8bf`.

## Actual apparatus

Node 24.18.0, pnpm 10.28.1, Vitest 4.1.11. `pnpm install --offline --frozen-lockfile` exited 0, with zero downloads. The 14 selected package/dependency builds exited 0. The scratch runners import every product through package names and `package.json` public exports; script-local symlinks under this ignored directory only make those package specifiers resolvable. Product source uses the worktree's own `dist` artifacts.

The positive path uses one `openStorage` `SqlStorage` object backed by one real temporary SQLite file, composed OG/clock/directory/CCL migrations, real Cordis directory and local lookup plugins, real OG `memberships.standing`, actual `createCredentialBindingReader(storage)`, and actual `createModelReplicaCustodian`. The component and directory receive that **identical storage object**. A second connection in the preserved concurrent runner opens the same filename. A random 32-byte regular `0600` key file is read at startup and operation time. `TenantId` and `LoginStateId` are parsed real identity values, but their source is a test seed: accounts and logins ports deliberately throw if called. There is no authenticated product login or trusted production bootstrap in this apparatus.

`verify-independent.mjs` final run PID 167067, exit 0, is recorded in `independent4.{stdout,stderr,pid,exit}`. It reports 13 passing named stages. The successful observed results include exact binary body equality on tenant reads and after reopening, ciphertext source equality, A→B rejection of stale A, other-tenant ciphertext rejection, NULL-source rejection, no factory invocation while a tenant binding is selected, key fault mapped to unavailable after outer rollback, and no committed sentinel when a caller catches either an internal read fault or a controlled fault after temporarily obtaining a body. Foreign/expired real units raise `StorageDefect`. `close()` waited for an admitted store, declined new work and left storage and facts usable. The deliberately constant binding-reader negative compiled/ran and failed its B-store success oracle; it was **only** used in that isolated negative. The main successful path never uses it. A profile was actually registered, then `readProfile`, nonempty `listProfiles`, `credentialPresent` and 31 captured directory/CCL diagnostic events were checked for the test reference and body representations. The SQLite main file, scanned after close, lacked raw body bytes; the WAL was absent at that observation point (`diskFilesChecked: 1`).

The runner's `fetch` hook observed zero calls **within this test**. No model runtime or transport is mounted; this cannot prove the product runtime's zero-HTTP failure guarantee.

## Concurrent result retained without changing the oracle

`verify.mjs` was executed three times; `run1`, `run2`, `run3` retain separate stdout/stderr/exit files. All exit 1 at the same oracle. The stderr file modification times are 22:21:16.659, 22:22:17.185 and 22:22:37.966 UTC respectively. The initial commands did not record child PIDs; their IDs are **unknown**, not reconstructed. The run3 preflight confirms the second connection's real OG standing and an idempotent directory bind succeed without contention. After the first component's injected probe delegates to the **real** reader and holds its acquired SQLite write transaction, a second real directory `bindCredential` starts. The probe releases; the store reports `stored:true`; the second bind reports `{failure:'unavailable'}`. Directory diagnostics show `bindCredential/start`, `store/binding/accepted`, `store/unit/stored`, `bindCredential/error/unavailable` in that order. The `bindCredential` result did not expose a reference. The runner does not perform a post-interleaving lookup after this failure.

`capability.model-profile-directory/v3#S-19` item ⑧ explicitly allows `unavailable` when storage cannot be written. Thus this observation **does not by itself prove a product contract violation**. It also does **not** satisfy V3-15/MCR-V4's planned successful two-order concurrent interleaving and subsequent current-reference read: this runner aborts before a post-interleaving lookup, so its failure supplies no such safety result. The exact cause of unavailable (SQLite busy, clock or other provider interaction) was not determined by this verifier. No fourth execution of that same competition was made; root owns diagnosis and any change to product or verification design. No assertion was removed from the preserved runner to make it pass.

## Per-criterion assessment

| Criterion | Verdict | Direct evidence and remaining boundary |
| --- | --- | --- |
| V3-14 | Partial | Real directory/CCL/local lookup on identical storage, A read and reopen, tenant selection/factory rule, runtime key failure pass in `independent4`. Real authenticated login/bootstrap, full startup invalid-mode/duplicate-key matrix and production runtime outbound boundary remain unverified. |
| V3-15 | Partial | Sequential A→B stale rejection, B success, constant-reader negative, foreign/expired unit pass. The required successful two-connection ordering, bind/unbind/read overlap, lock-removal mutation, generic rewrite and commit-ack failure are not demonstrated; preserved concurrent oracle fails with allowed `unavailable`. |
| V3-16 | Partial | Real `{body}`/`{absent}`, runtime key unavailable, caught participating fault and post-body fault rollback, foreign/expired units pass. Closed/overlap units, all four failure classes, bad internal reference, clock failure and all failure-table cells were not independently exercised here. |
| MCR-V3 | Partial | A→B→late A→store B, NULL source, unbind, official/custom branch pass; production runtime zero HTTP and trusted source provenance are open. |
| MCR-V4 | Partial | Same physical DB, actual shared unit/reader, observed first-lock ordering and no half-row in tested sequential transitions; concurrent bind returned allowed unavailable. Opposite successful interleaving, read-vs-bind, process crash and receipt loss were not tested. |
| MCR-V5 | Partial | Real 0600 key, ciphertext and one closed SQLite file scan, runtime chmod fault and value-free captured diagnostics pass. Missing/bad-length/nonregular startup and observation sink faults are covered only by package-owner tests, not this independent composition. WAL was absent when scanned; production trace/metrics/storage backups are untested. |
| MCR-V6 | Partial | Admitted store drain, new admission rejection and borrowed storage survival pass. Actual P-1r disposal/replacement, cancellation, participating read drain and full app close order are untested. |
| MCR-V7 | Partial | Real parsed identifiers, directory reader, OG standing, model-only component and Cordis lookup pass. Account/login/bootstrap are test seeded or inert; no app assembly, symbol guard, authenticated provenance, full generic CCL or OAuth claim. |
| MCR-V8 | Partial | Wrong/expired unit and caught rollback pass; package-owner tests separately pass. Complete result/exception table, overlap, clock unavailable, malformed reader and all fault classes remain unverified by this independent runner. |

The two owning packages' `pnpm ... run test` command exited 0: CCL 31 tests/5 files and directory 22 tests/5 files, both with no type errors. Their separate `run typecheck` command exited 0. These existing package tests are supporting owner-level evidence; the joint result above is distinguished from them. `node --check` on both runners and `prettier --check` exited 0. The tracked tree remained clean and `inputs.sha256` rechecked all inputs after execution.

## Reproduction and next owner obligations

From this exact worktree after `pnpm install --offline --frozen-lockfile` and the recorded selected build command:

```bash
node tmp/model-request-runtime/p3-joint-credential-verification/verify-independent.mjs
node tmp/model-request-runtime/p3-joint-credential-verification/verify.mjs
```

The first exits 0 with JSON stage results; the second currently exits 1 at the concurrent real-directory bind oracle. No paid OpenRouter request, PostgreSQL instance or application assembly was used; this script's `fetch` hook is not a general network monitor. Root/app owners still need actual account/login/bootstrap, the named symbol guard with positive and negative consumers, true runtime zero HTTP on credential failure, complete MCR-V4/V8 fault and race matrix, full generic six CCL operations and PostgreSQL-specific concurrency evidence. The D-075 model-only component must not be reported as the full generic custodian.
