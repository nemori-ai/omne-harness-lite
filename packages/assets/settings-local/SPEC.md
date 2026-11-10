# Settings local behavior

This package implements local persistence and catalog capture for [Settings](../settings/SPEC.md). Public types and runtime Schemas belong to [src/index.ts](src/index.ts); the opt-in Identity composition is exported by [src/identity.ts](src/identity.ts). The caller owns registration, trusted capability distribution, the shared SQL provider, and Identity lifecycle.

## One-target persistence

`settings.persistence` owns `st_states`, `st_operations`, and `st_changes`. It reads current state inside the tenant transaction and invokes `decideSettingsChange`. A stale expected revision returns `revision_conflict`. Only one competing command against the same revision can change that state.

A successful change stores assignments, their revision, the value-free original result, and a value-free change record in one transaction. A later participant rejection rolls them back together. A genuine no-op records its original result without incrementing the revision or appending a change. A raw assignment or lock change increments the revision even when another source masks its effective value.

Ordinary changes require the complete current definition reference and the same ordered source layout. Definition mismatch returns `definition_changed`; source-layout mismatch returns `basis_changed`. There is no implicit migration, cross-target assignment transaction, or destructive target cleanup operation. Explicit deployment maintenance is defined below.

Secret item commands return `unsupported`. The SQL provider accepts no state-changing secret value and exposes no secret plaintext read API; secret custody is the separate `./secrets` entry ([Secret custody](#secret-custody)). Persistence and owner rejection receipts must omit command bodies and assignment values.

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

Every explicitly requested target must appear in the qualified projections. A declaration must validate and match its exact reference digest. Persisted state must match that reference and the ordered source layout. A mismatch rejects capture with `definition_changed`; invalid evaluation rejects it with `incompatible`.

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

Catalog capture rejects mismatched old state until successful rebase. Raw authorized `readState` remains a persistence inspection API and returns the stored reference with its state; it is not an evaluated current catalog. Rebase retry and lookup use the fixed maintenance identity and original operation binding. Tenant qualification revocation does not revoke this separate deployment capability.

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

## Secret custody

<a id="secret-custody"></a>

The `./secrets` entry is the file provider of the two secret custody ports of [Settings](../settings/SPEC.md#secret-items): `openSecretVault({ path, lockWaitMs?, lockBackoffMs? })` answers `{ kind: 'open', vault }` or `{ kind: 'unavailable', cause: 'missing' | 'corrupt' | 'io' }`. The vault is `SecretCustodyManagement & SecretCustodyUse` plus `snapshot()`, `revise(change)` and `close()`. It has no Cordis dependency and reads no clock.

File format. Version 2 is `{ version: 2, bindings: [{ scope, target, purpose, secret, life, configuredAt? }] }`; `scope` is `{ layer: 'official' }` or `{ layer: 'tenant', tenant: { organization, account } }` in identity text, `configuredAt` is an instant text. A file without `version` is the vault the Model host wrote before custody moved here: its `factorySecret` is read as the official binding of the target `{ owner: 'model', key: 'factory default' }` with purpose `model-send` (an empty factory secret is no binding), and each row as the tenant binding of the target `{ owner: 'model', key: <row id> }` with the same purpose. The first write publishes the whole file as version 2. A stored secret is read as the file holds it: any non-empty string is accepted, so a vault written before `parseSecretText` existed stays readable; `parseSecretText` applies only to new writes. A file that fits neither shape, a row whose secret is not a non-empty string, a time that is not an instant text, a version this code does not know, or two rows with the same key make the file `corrupt`; nothing is repaired or rewritten.

Reads. `describe`, `list`, `use` and `snapshot` read and parse the whole file on every call; the vault keeps no cache, so a change by another process or by hand is seen at once. `use` serves an `active` binding, answers `missing` for no binding, `denied` for a `revoked` one and `unavailable` for an `unreadable` one or an unreadable file. `list` filters one scope, orders by (owner, key, purpose), and continues through an opaque cursor; a cursor this custody did not issue and a `limit` that is not a positive safe integer are `TypeError`s. No read face returns a value except `snapshot`, which is for trusted adapters whose judgment spans several bindings.

Writes. `bind`, `unbind` and `revise` take the file lock (`proper-lockfile`, synchronous back-off within `lockWaitMs`, default 30 000 ms, default back-off 50 ms), read the file again, change it, and publish by a unique temporary file, `fsync`, rename, and on POSIX an `fsync` of the parent directory. `written` means the new file is published; `not-written` means the old file is still on disk (the lock wait ran out, the file was unreadable, or the publish failed before the rename); `unconfirmed` means the rename returned or the temporary file is gone but the confirmation failed, so the new state may be visible and the caller describes the binding before a retry; `denied` is a scope that was never minted or a closed handle, without touching the file. A secret that is not a parsed `SecretText` is a `TypeError`. Each holder of the lock first removes the temporary files of this vault that a crashed publish left behind (`<name>.<pid>.<ms>.<n>.tmp`); other files stay. The lock does not expire with time; after a crash of the holder an operator removes `${path}.lock` once all writers have stopped.

Building and checking. `createSecretVault({ path, seed?, ... })` builds the file under the lock when the path is empty (the seed goes into a built file only) and adopts a readable file otherwise; an unreadable file is `unavailable` and never replaced, a lock wait that ran out is `locked`. `initSecretVault(path, { readSecret, key, configuredAt?, home?, guard?, lockWaitMs?, create? })` builds a vault with one binding on a host: the path must lie below the real user directory and hold nothing; the secret is read once, after the first check and before the second; creation runs under the permission guard (POSIX: new directories `0700`, the file `0600`, created under mask `077` and read back; Windows: the access control inherited below the user directory, which cannot be read back), then the secret is confirmed through the use face; the result is `{ ok: true, path }` or a reason code without any message: `path-invalid`, `path-outside-home`, `path-check-failed`, `path-occupied`, `secret-empty`, `secret-malformed`, `secret-too-long`, `input-not-terminal`, `input-cancelled`, `input-failed`, `lock-timeout`, `write-failed`, `write-unconfirmed`, `permission-failed`. `inspectSecretVault` takes the lock, sweeps and reads, answering `readable` or `unavailable` with `missing`, `corrupt`, `io` or `locked`. `readSecretFromTerminal` reads one line with the echo off and restores the terminal; `readTypedSecret` turns a reader into a `SecretText` or a reason.

What stays out. The vault does not know what a target means, does not choose between scopes, and has no notion of a factory: Model's factory rule lives in Model's adapter. The parse error of a corrupt file is not carried in any result, because its message can quote the file. Multi-machine deployments and files with thousands of bindings are outside this provider; the ports stay, the provider changes.

## Verification boundary

[tests/README.md](tests/README.md) owns current test entry points and distinguishes guard fixtures, real Identity composition, persistent independent targets, catalog capture, and Asset-owned combination tests. Source and tests do not establish independent acceptance or deployment adoption. Remote authentication, final UI, tools or Cordis plugin delivery, Calendar adoption, OS crashes, and physical power-loss recovery are outside this package's evidence.
