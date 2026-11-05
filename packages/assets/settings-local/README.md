# Settings SQL provider

`@omne-harness/settings-local` stores Settings assignments, revisions, original operation results, and value-free change records through the public SQL storage contract. It implements the Settings commit port and an authorized read of one target's persisted assignments. The root entry has no Cordis dependency.

The package supplies SQL materials and `createSettingsSqlBackend`. The application supplies a registered SQL combination, a trusted access adapter, and a separate transaction participant that owns target qualification. There is no permissive default guard.

## Assembly

1. Combine `settingsSqlMaterials()` with the target owner's guard materials. Register both participants in the same transaction domain through the public SQL provider.
2. Declare `settingsSqlGuardFact` in the guard participant's `providesFacts`. Settings declares the corresponding `requiresFacts`, so Storage orders the guard before persistence.
3. Create the backend with `storage`, `domain`, `combinationVersion`, `manifestDigest`, `access`, and `guards`. The application fixes these values; they are not request fields.
4. Supply the backend as `SettingsCommitPort<Context>`. Use its `readState` only within the owner's authorized projection. The owner combines sources across targets and supplies a coherent `SettingsReadPort`; this package does not build a catalog.
5. Close the backend before closing its shared SQL provider. `close()` stops admission and drains accepted calls. It does not close the caller-owned provider.

The exact types and Schemas are exported from [src/index.ts](src/index.ts). The Settings behavior comes from [Settings SPEC](../settings/SPEC.md) and [the composition design](../docs/settings-composition.md). Provider behavior and unsupported cases are specified in [SPEC.md](SPEC.md).

## Owner guard protocol

`guards.command(binding)` returns the command for one distinct participant. The binding contains the server-selected SQL domain, the trusted principal reference, the full Settings command, and its server-computed digest. The callback must not treat caller-supplied facts or a prior access result as current authorization.

Inside the SQL transaction, the guard reads its own authoritative state and validates the complete binding. It provides a value accepted by `SettingsSqlGuardFactSchema`: the binding, current fixed definition and definition reference, allowed grants, and ordered `sourceIds`. The definition digest is SHA-256 over RFC 8785 canonical JSON. Settings verifies the digest and definition identity again.

`sourceIds` are the slots this concrete target may persist. They do not authorize copying organization assignments or another tenant's private values into this target. Each successful read grant must cover every persisted source in that target. Cross-target source composition belongs to the owner's projection.

The fact must be produced by a real preceding participant in the same commit. A boolean approval, missing fact, different principal or target, different command or digest, invalid declaration, and ungranted source/action cannot authorize a write. Settings does not read the owner's private tables.

For a qualified rejection, the guard returns `conflict` or `unsupported` with a `SettingsSqlGuardRejectionSchema` basis. Build its binding with `settingsSqlOperationBinding(binding)` and include the typed Settings failure. Return no command body, values, or secret material in the guard's response or rejection basis. The helper preserves only domain, principal, target, operation identity, and digest. Settings uses the same value-free binding in its own receipts.

The guard must coordinate every writer that can change target existence, qualification, definition, or allowed sources in the same transaction domain. Existing Identity uses a separate singleton transaction domain. This package does not establish atomic Identity revocation or production Asset ownership qualification.

## Reads and recovery

Every `readState`, `getOperation`, and `readChanges` calls `access.authorize` again. The adapter returns a current trusted principal, scope, and target. The backend requires exact scope and target equality. Granting a target must not reveal another principal's private source values. `readState` reads only that target and returns `absent` when no assignment state exists.

The access adapter's current check is a read linearization prerequisite. It does not prove the later write's atomic qualification. The transaction guard supplies that write evidence. The owner must coordinate coherent projection and revalidation where its policy requires more than this single-target read.

An operation identity includes the SQL domain, principal, complete target, and `operationId`. A lookup for another principal or target cannot find the original operation. A denied lookup returns the policy failure without disclosing existence. The server hashes the semantic command, including expected revision and action. It excludes only `requestId`, which identifies a transport attempt. Matching retries recover the original result even after later revisions. Different content with the same identity returns `operation_conflict`.

This replay guarantee covers successful operations and guard rejections that satisfy the published schema. If a guard violates the SQL fact protocol, such as declaring a fact without providing it, Storage can record `fact_violation` without a business binding. The backend returns `unsupported`, writes no assignments, and does not automatically retry. That damaged-provider path cannot distinguish different business payloads precisely. It is not evidence of successful business idempotency.

`unknown` means completion is undetermined. Call `getOperation` with the same target and operation identity. Do not infer rollback or allocate a replacement operation. This API has no cancellation operation. Cancelling a transport observer does not undo SQL already accepted by Storage. The underlying [SQL contract](../../storage/sql-contract/SPEC.md) owns observation cancellation and durable recovery.

## Verification

Run the build before tests because worker fixtures import the built entry:

```sh
pnpm --filter @omne-harness/settings-local run build
pnpm --filter @omne-harness/settings-local run typecheck
pnpm --filter @omne-harness/settings-local run test:fast
```

The tests run `@omne-harness/sqlite-provider` with real SQLite transactions. They cover reopen, process termination by SIGKILL, original-operation recovery, competing revisions, rollback after Settings writes, missing or misbound facts, source layout changes, persisted locks, authorized reads, response loss, change pagination, no-op recovery, and close/drain behavior.

The guard's authority table is a conformity fixture. It proves the Settings fact protocol against a real SQL transaction, not production Identity or Asset qualification. OS crashes, physical power loss, production owner adapters, catalog consistency, and complete system adoption remain outside this test evidence.
