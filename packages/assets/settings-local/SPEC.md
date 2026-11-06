# Settings local behavior

This package implements local persistence and catalog capture for [Settings](../settings/SPEC.md). Public types and runtime Schemas belong to [src/index.ts](src/index.ts); the opt-in Identity composition is exported by [src/identity.ts](src/identity.ts). The caller owns registration, trusted capability distribution, the shared SQL provider, and Identity lifecycle.

## One-target persistence

`settings.persistence` owns `st_states`, `st_operations`, and `st_changes`. It reads current state inside the tenant transaction and invokes `decideSettingsChange`. A stale expected revision returns `revision_conflict`. Only one competing command against the same revision can change that state.

A successful change stores assignments, their revision, the value-free original result, and a value-free change record in one transaction. A later participant rejection rolls them back together. A genuine no-op records its original result without incrementing the revision or appending a change. A raw assignment or lock change increments the revision even when another source masks its effective value.

Ordinary changes require the complete current definition reference and the same ordered source layout. Definition mismatch returns `definition_changed`; source-layout mismatch returns `basis_changed`. There is no implicit migration, cross-target assignment transaction, or destructive target cleanup operation. Explicit deployment maintenance is defined below.

Secret item commands return `unsupported`. The provider accepts no state-changing secret value and exposes no secret vault or secret plaintext read API. Persistence and owner rejection receipts must omit command bodies and assignment values.

## Target qualification

A preceding participant in the same SQL transaction must supply `settings.current`. Its binding covers the domain, trusted principal, complete command, and server-computed digest. Its payload supplies the current definition, exact definition reference, grants, and ordered sources. Settings verifies the digest, declaration identity, target binding, allowed action, and source membership. A boolean, prior access result, missing fact, or caller assertion cannot authorize a write.

`settingsSqlOperationBinding` produces the value-free operation binding used in receipts. A qualified owner rejection uses `SettingsSqlGuardRejectionSchema` and returns `conflict` or `unsupported`. The guard must coordinate every real writer that changes target existence, qualification, definition, or source layout in its transaction domain.

In the catalog composition, the independent and Asset owners each produce their named fact, `settings.standalone-projection` and `settings.assets-projection`. Both use `settings-projection/1` and the exact `SettingsProjectionBinding`. `settings.target-guard` requires both facts and translates one qualified target into `settings.current`. Mismatched bindings, duplicate complete targets, and more than 128 projected targets fail the transaction. No target yields `forbidden`. An assembly without Assets explicitly produces an empty Asset projection through `settings.without-assets`; it does not fabricate Asset ownership.

The central composition installs `settingsStandaloneMaterials({ settingsGuard: false })`. The direct independent persistence composition may instead use default materials and `standaloneSettingsGuards`. A combination must not register competing producers of `settings.current`.

## Independent target ownership

`settings.targets` owns `st_targets` and `st_definitions`. `createStandaloneSettingsOwner` is a trusted provisioning capability, not a tenant setting service. Provisioning validates the declaration, computes its canonical digest, and binds the target to a tenant scope with policy `independent`. The same provider, definition, and version identity cannot acquire different declaration content.

Provision and retire operations use owner revisions to reject stale editors. A retired record cannot be provisioned again under the same complete target identity. Retirement removes that target from qualified projections and prevents later writes, while preserving assignment and operation history. Owner revision and assignment revision are separate counters. Owner operation recovery returns the original receipt; Storage-confirmed `not_committed` maps to `not_found`. An indeterminate Storage result remains `unknown`. Neither observation revokes the owner capability or seals a future attempt.

Target records specify allowed source slots and actions. They do not authorize copying another tenant's values or shared organization values into those slots. Every access grant must permit reading all persisted sources in that concrete target.

## Coherent catalog capture

`createSettingsCatalog` verifies an issued acting-for-tenant principal, the fixed deployment, the tenant transaction domain, and every explicitly requested target scope. Each read obtains a fresh Identity standing reservation for its unique capture operation and the configured qualifications. It does not reuse a prior page's permission decision.

One tenant SQL transaction consumes the capture terminal, obtains both owner projections, and reads Settings assignment state through `settings.snapshot`. Only each owner reads its own authority tables. The snapshot participant reads `st_states`, not Asset or Identity tables. Capture does not change assignment revisions or grant write rights. It does create an operation terminal and SQL receipt for coordination.

Every explicitly requested target must appear in the qualified projections. A declaration must validate and match its exact reference digest. Persisted state must match that reference and the ordered source layout. A definition mismatch returns `definition_changed`. A source identity or order mismatch returns `basis_changed`. Invalid evaluation returns `incompatible`.

The registry generation is read before capture and checked again after settlement. A change returns `basis_changed`. Available definitions must match complete references, including digest. Missing declarations are omitted from management entries and reported through `partial` plus `unavailableProviders`. Runtime capture with a missing declaration returns `unavailable`. Settings evaluation also rejects a partial basis. An empty catalog does not by itself prove completeness.

The captured revision binds projected owner facts, included state, catalog incarnation, registry generation, expiry epoch, and selection digest. The Settings query layer also binds cursors to scope, view, filter, locale, page size, and offset. Every page recaptures. Any basis or query mismatch returns `basis_changed`, rather than combining generations.

The expiry epoch is `floor(maximumObservedTime / cursorLifetimeMs)`. The configured lifetime must be a positive safe integer. Crossing an epoch invalidates prior cursors, so a cursor can expire sooner than a full lifetime after issuance. Within one catalog instance, an observed later epoch cannot revert after wall-clock rollback. Restart generates a new incarnation. This mechanism is not a durable monotonic clock or an elapsed-time guarantee during an unobserved clock rollback.

Capture is bounded by public Schemas and input budgets. Owner facts admit at most 128 targets, each with at most 32 distinct source slots. The serialized captured basis is limited to 512 KiB. SQL storage has additional admission, command, response, and retention limits. There is no retained snapshot cache or package-owned automatic receipt collection.

## Runtime selections

Management discovery does not require runtime selection. Runtime reads require a nonempty explicit target list and a selection reference. The configured selection source must return the same deployment and exact ordered targets for the verified principal. A missing source returns `unsupported`; a mismatched selection returns `forbidden`.

`createSettingsSelections` stores bounded, expiring in-memory intent records for verified principals. Creation rejects duplicate targets. Resolution re-verifies the principal. Expired records are removed when observed; the holder tracks the maximum observed clock value. Expiry cannot revive after an observed clock rollback. Release, close, or process loss removes the selection.

A valid selection establishes consumer intent only. Every target still requires fresh owner and Identity qualification. Selection does not grant ownership, activate a target, or establish executor adoption. This package has no Assembly execution-adoption receipt.

## Declaration availability and target invalidation

Registry registration and release control declaration availability in the process. Release preserves persistent assignments and operation history. A reload of the same exact declaration can make those values readable again.

Registry unload is not atomic write-authorization removal. A pending write that already passed a read check can still commit if the authoritative target guard remains valid. To invalidate a target, the trusted owner retires the independent target or removes or changes the Asset holding through its transaction protocol. Those owner changes serialize with Settings target qualification. An Asset holding recreated under a different identity does not inherit another target's values.

## Trusted deployment rebase

`createSettingsMaintenance` is a deployment-owner capability. The assembly fixes `ownerRef`, tenant domain, storage combination, and projection commands. It uses principal identity `maintenance/<ownerRef>`. It deliberately bypasses the ordinary Identity principal, standing, and reservation route. It must not be exposed as an ordinary tenant or tool command. Its holder is responsible for authority to retain or discard the target's assignments.

`rebase` requires exact `from` and `to` definition references, the expected assignment revision, and one explicit `retain` or `discard` choice for every existing assignment. Missing, duplicate, or extra choices return `invalid_input`. Retained assignments must have a source and item in the new basis and pass evaluation. Incompatible retained data returns `incompatible`. No display-name matching or automatic conversion occurs.

The rebase still consumes the operation terminal and current projections from the same target owner through the central guard. An invalidated target cannot be rebased. State, exact new definition reference, original result, value-free rebase change, and terminal commit together. A changed basis increments the assignment revision; an identical basis can record a no-op. Expected revision and exact reference conflicts remain explicit failures.

Catalog capture rejects mismatched old state until successful rebase. Raw authorized `readState` remains a persistence inspection API and returns the stored reference, state and source provenance; it is not an evaluated current catalog. Rebase retry and lookup use the fixed maintenance identity and original operation binding. Tenant qualification revocation does not revoke this separate deployment capability.

## Terminals, retry, and unknown results

`settings.terminal` owns `st_terminals`. A normal operation consumes an absent terminal inside the same transaction as its effects. Trusted sealing turns an absent terminal into `aborted`, or returns its existing `committed` or `aborted` terminal. A terminal cannot be replaced or reopened. A late operation cannot commit after an aborted seal.

The operation identity comprises domain, principal, complete target, and `operationId`. The server hashes the semantic command with SHA-256 over canonical JSON. Only transport `requestId` is excluded. Matching retries return the original result. Different content under that identity returns `operation_conflict`, even after later revisions.

This replay guarantee covers successful participation and owner rejections conforming to the published binding schema. A damaged guard can cause Storage `fact_violation` without a usable business binding. That path returns `unsupported`, changes no assignments, and is not automatically retried. It cannot precisely distinguish business payload conflicts.

Storage `unknown` remains undetermined. Recover the same operation identity. `getOperation` maps `not_committed` to `not_found` only when no terminal exists. An aborted terminal without a prior business receipt gives `basis_changed`. A prior qualified rejection preserves that rejection. Absence, cancellation, timeout, or service close cannot release an Identity reservation. [Identity coordination](docs/coordination.md) defines settlement.

## Authorized reads and lifecycle

`readState`, `getOperation`, and `readChanges` call the configured access adapter again. The backend requires exact scope and target equality. Denied access must not disclose historical operation existence. Revocation can prevent readback without changing prior successful effects. A custom adapter's access check is not atomic write authorization; the transaction guard supplies that evidence.

Changes contain no assignment values. Ordinary changes identify revision, operation, item, and source. Rebase changes identify revision and operation. A page contains at most 100 changes and returns the last delivered revision as continuation only when another page exists. A change stream is not a catalog snapshot or an adoption receipt.

Backend, owner, maintenance, and catalog close operations stop their own admission and drain their accepted mutations or captures. They do not close shared SQL or Identity dependencies. The registry and selection holder have separate synchronous close operations. Unresolved reservations remain Identity recovery work.

The public commit port has no cancellation operation. Cancelling a Storage observer cannot withdraw accepted SQL. Worker failures, SQL limits, unsupported registration, and incomplete shared-provider close retain explicit failure or unknown semantics under the [SQL contract](../../storage/sql-contract/SPEC.md).

## Verification boundary

[tests/README.md](tests/README.md) owns current test entry points and distinguishes guard fixtures, real Identity composition, persistent independent targets, catalog capture, and Asset-owned combination tests. Source and tests do not establish independent acceptance or deployment adoption. Remote authentication, final UI, tools or Cordis plugin delivery, Calendar adoption, OS crashes, and physical power-loss recovery are outside this package's evidence.

## Source identity and persisted provenance

Owner commands supply ordered stable source identities. A source identity includes its ID, owner, scope kind and scope subject. No layer is inferred from its ID. In particular, an ID named `organization` can have an explicitly declared `owner` scope. Source IDs are unique within the complete target. A layout contains one to 32 sources.

The owner projects each source with its current persisted owner revision as `authorityRevision`. Provisioning commands cannot supply this revision. The revision describes the local owner's facts, not a proof of external Identity, Session or organization qualification. Those providers retain their own verification duties. Catalog entries preserve the complete descriptors so consumers do not reconstruct authority from names.

Assignment records store the stable layout they adopted. A bound record must have the same ordered IDs as its assignment state. Current evaluation and ordinary writes require exact ordered equality of stable identities with the owner projection. Changing only the owner's authority revision does not change value ownership. Changing an owner, scope kind, subject or order requires an explicit rebase.

Rebase may retain an assignment only when its complete stable source identity exists on both sides. Reordering can retain values after explicit rebase. A different owner or subject cannot inherit them under the same source ID. A binding change increments the assignment revision even if values are empty or unchanged. Revision exhaustion rejects that change. The adopted layout, state, result and change record commit together.

Named source-layout migrations preserve historical records that lack identity evidence as `unmapped`. They preserve IDs, values, grants, retirement and original receipts. They do not infer identities. Each migration reads primary-key pages of at most 64 records and validates existing bound or unmapped records. Malformed explicit provenance fails migration or verification.

An unmapped independent owner cannot emit a current projection. The trusted owner must supply a complete layout. Unmapped assignment provenance remains unavailable to current evaluation and ordinary writes even after this owner mapping. Explicit rebase must discard every old assignment before it binds to the new identities. An empty unmapped state also requires explicit rebase. Authorized raw storage inspection exposes the unmapped state for maintenance and does not declare its values current.

## Durable intent relations

The persistence owner's material set installs `st_governance_intent` and `st_governance_attempt` through a separate migration. These relations prepare the storage boundary for the adopted preparation protocol. The current command provider does not yet write them or implement `SettingsPreparationPort`.

A root key binds its principal, complete target and business operation within the fixed storage domain. A second unique constraint protects those components independently of the key encoding. Each attempt belongs to one root. Attempt IDs are globally unique within that domain. A partial unique index permits at most one prepared or submitted attempt per root. Attempt numbers range from 1 to 64. A next-attempt value of 65 means allocation is exhausted, not that the root is cancelled.

Root state constrains result and abort-reason columns. Pending recovery has a partial index ordered by root key. Exact attempt lookup uses its unique ID index. Foreign keys remain within `settings.persistence`; other participants cannot read these private tables.

These constraints do not by themselves preserve command immutability or prevent terminal revival. The sole persistent writer must enforce the [root and attempt model](../settings/verification/README.md#原操作与准备尝试). Existing values, receipts and old terminals remain unchanged by this migration. Switching providers still requires draining old held reservations and explicitly preserving historical results. The presence of these tables does not complete that upgrade or authorize a direct-commit fallback in the final assembly.

### Preparing allocation

`preparing-migration.ts` adds an explicit preparing phase and a stored comparison plan. Preparing has no ready basis. The live-attempt index includes preparing, prepared, and submitted. An aborted attempt can lack a basis when preparation never completed.

The migration requires the unpublished intent relations to be empty. No previous production writer populated those relations. Unexpected records stop the upgrade before either relation changes. This check does not delete or reinterpret existing Settings values, changes, or operation receipts. The original migration remains unchanged.

`intent-records.ts` provides the private persistence participant operations for allocating and reading an intent. The caller must run allocation inside an existing SqlStorage transaction after trusted admission. This module does not authenticate callers, acquire external holds, or authorize a business commit. It is not exported as a public backend.

Allocation preserves the full original command. A different transport requestId can recognize that command, but a changed semantic command returns operation_conflict. An existing active attempt returns its original ID and comparison plan. A terminal root returns its original status. Only an open root without an active attempt can allocate a successor, within the 64-attempt budget. Root insertion, attempt insertion, and sequence advancement share the enclosing transaction.

Reads use two indexed point queries, each with LIMIT 1. They validate the stored command binding, attempt sequence, plan target, ready-basis digest, and exact SQL destination identity. They do not write or settle anything. The plan stores a SettingsCurrentBasis comparison projection. External reservation requests and custody checkpoints remain separate obligations and are not implemented by allocation.

Tests exercise this writer through the real SQLite Worker with a test participant replacing admission. They cover concurrent allocation, rollback, reopen, immutable commands, exact-ID collisions, terminal recognition, and budget boundaries. Seeded terminal/history records test recognition; they do not prove the production seal service. Current admission, custody, ready/commit plans, recovery routing, and the public preparation backend remain incomplete.
