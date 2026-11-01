# @omne-harness/session-storage-sql

[中文](README_ZH.md)

The storage member of Session. It implements `SessionTransactionPort` over SQL. It uses SQL only through the public shapes of `@omne-harness/sql-contract`.

## Responsibility and status

This is the only member of the Session group that touches the storage medium. It uses SQL tables to implement the `SessionTransactionPort` that [session-contract](../session-contract/README.md) declares. The port covers commit, authoritative read, original-operation query, control-operation query, model-selection read, history read, epoch-view read, pending scan, reference query, and released-scope read. The package owns four things: the SQL shape of the authoritative tables and derived indexes, with their migration fragments; the storage-contract participant module `session`, which runs the Session fact statements inside the transaction of the storage provider; the SQL implementation of `SessionTransactionPort`; and the algorithms of the read paths with the conformance suite.

The package does not own the governance rules or the domain services (session-contract owns them). It does not own the part of the command pipeline outside the transaction ([session](../session/README.md) owns it). It does not own the neighbor translation ([session-adapters](../session-adapters/README.md) owns it). It does not own the commit protocol or the receipts (the storage contract owns them). It does not own the entry cache, the snapshot cache, or the view-prefix digest cache.

Status: storage member, `draft`. The head has an implementation. The [implementation status](SPEC.md#实现现状) of the SPEC gives its coverage. The adoption basis is the [member decomposition](../docs/architecture.md) of the group and the [SPEC](SPEC.md).

- Implemented: the root entry `createSessionStorage`, `sessionStorageMaterials`, and `SESSION_PARTICIPANT`; one participant `session`, one migration, and eight `snapshot` read handlers; the port operations commit, read, `queryOperation`, `queryControlOperation`, `readModelSelection`, history read, `pending`, `references`, and `releasedScopes`.
- No `./cordis` subpath exists. The application owns the session storage composite (material catalog, combination declaration, tenant domain directory, Cordis services). This package does not rebuild it.
- Not implemented: `commitEntries` (it always returns `unavailable`, because session-contract has no pure range check for the entries interpretation yet), `sl_batch`, `sl_blob`, `sl_ref_idx`, the R9 catch-up and rebuild, and PostgreSQL.
- Verified: the public entries and dependency rules (`tests/public-entry.spec.ts`), tenant isolation and the tenant domain directory (`tests/tenant-isolation.spec.ts`), and the cases that another writer adds to `tests/`. The `node:sqlite` fixture runs the real participant and handler modules in memory and does **not** cover the Worker, durability, or close. `tests/real-provider.spec.ts` runs the package over the real sqlite-provider (Worker commit, kill after the receipt then `query` by the original identity, never-committed identity, close, two limits, group commit count of 8 operations to 8 physical transactions, so zero merge). It does not cover power loss, WAL maintenance, cross-process writers or lock timeout. The new behavior has no red-then-green record. Negative-control cases take its place.
- Precondition: the storage contract is now [sql-contract](../../storage/sql-contract/SPEC.md), and the provider is [sqlite-provider](../../storage/sqlite-provider/SPEC.md). The provider is a dev dependency of the tests only.

No package depends on this package now. The application assembly selects it later.

## Usage

The root entry is the only entry:

- `createSessionStorage(options)` returns a `SessionTransactionPort<P>`. `options` holds `storage` (`SqlStorage`), `domains` (`TenantDomainAccess`), `accessCheck`, `cursorSigning`, `combination` (`combinationVersion` and `manifestDigest`), and the optional `attemptLimit` (initial value 8), `cursorTtlMs` (initial value 15 minutes), and `now`.
- `sessionStorageMaterials()` returns three static descriptions: the participant, the migration, and the read handlers. The application merges them into its own material catalog.
- `SESSION_PARTICIPANT` is the participant name that a combination lists for the Session log. Its value is `session`.

The application builds the session storage composite from these three items and gives the port to the `transactions` dependency of the [session](../session/README.md) factory. Each operation passes the tenant and the session explicitly. The package does not infer the tenant from a connection, a transaction domain, or the assembly tree, and it has no default permission. The assembly steps are in the [usage page](docs/context.md#使用方式). The part that the application owns is in the [assembly boundary](docs/cordis.md).

A caller that needs only types and pure functions uses session-contract and does not need this package.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the required behavior: tables and indexes, write paths W1 to W6, read paths R1 to R11, retention and caches, conformance C-01 to C-04, and the failure classification.
- The [session-contract SPEC](../session-contract/SPEC.md#sessiontransactionport) owns the operations of the port, with their results and failures.
- The [object model](docs/object-model.md) owns the shape of the tables, the indexes, and the in-process objects.

The port holds only the storage, the directory, the access check, and the cursor signing that the application passes in. It holds no connection and has no close function. `commit` has no cancel. The caller reconciles by the original operation identity. A read path returns `unavailable` when a read fails, when a read is cancelled, when the directory has no entry for the tenant, or when `sl_state` does not cover the tail. It never returns an empty page. The package does not delete entries, receipts, or old epoch rows.

## Design

The design target has seven modules: transaction port, participant module, derivation maintenance, read path, rebuild, codec, and migration fragments. The outside dependencies are the pure functions of session-contract (the OP-00 identity derivation, `decide`, and `reduce`) and the public shapes of sql-contract. The current SQL is hand-written SQLite statements without Kysely. The rebuild and the PostgreSQL dialect are not in yet. The key mechanisms are:

- one storage participant `session`, with the bridge material packed into the same command
- one encoding from command to entries, owned by `decide`, so this package only assigns positions, writes rows, and maintains derivations
- the snapshot and the derived indexes written in the same transaction as the entries, so no read path replays the log
- history pagination with a fixed upper bound and signed cursors that bind kind, tenant, session, and expiry, so the server keeps no read session
- the failure basis of a rollback is stored in the response evidence and read back, so no failure is recomputed outside the transaction
- no deletion of entries

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the sequences. The [object model](docs/object-model.md) describes the tables and the indexes.

## Configuration and operation

The configuration is the fields of `SessionStorageOptions`, listed under [Usage](#usage). The initial values of `attemptLimit` and `cursorTtlMs` are only initial configuration values, and the application can change them. The application injects the cursor signing. It is not a configuration value. The inline threshold, the large-object destination, the `pageBytes` limit, `maxScanPerPage`, and the rebuild mode that the SPEC designs are not configuration items now. See the [implementation status](SPEC.md#实现现状).

The environment precondition is a storage provider of sql-contract. The provider owns the connection, the Worker, the PRAGMA settings, and the writer generation. This package does not open a connection. The migration runs with the atomic migration of the provider. Until it completes, reads and writes return `unavailable`. No in-memory implementation exists. The test fixture is a test provider on `node:sqlite`. It is not a published artifact.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-storage-sql
```

In this directory, run `pnpm typecheck` for the type check. The cases are in [tests/](tests/README.md). The `node:sqlite` fixture does not pass through the Worker of sqlite-provider; `tests/real-provider.spec.ts` does, and covers process-level durability, close, and the `command_limit` and `queue_full` limits. Power-loss durability and WAL maintenance have no coverage. The "derived equals recomputed" check, the read-path complexity benchmarks, concurrent writes, and failure-table injection in the [verification obligations](docs/verification-obligations.md) are not implemented. The package declares no numeric target before measurement. Power-loss durability belongs to the owners of [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01), and this package does not claim it. A passing structure check does not prove behavior.

## Maintenance

- When the transaction port, `decide`, `reduce`, or the event catalog changes in session-contract, update the write paths and read paths of the SPEC, the [architecture page](docs/architecture.md), and the [flows page](docs/flows.md).
- When you add an event kind or a reference kind, update the derived-row table of the SPEC, the recompute table of C-01, and the rebuild.
- When a table or an index changes, update the [object model](docs/object-model.md) and the migration fragment. Authoritative tables only gain columns.
- When you add a configuration item, update the [API page](docs/public-api.md#配置).
- When the public shapes of sql-contract change, update the XP table of the SPEC and the [assembly boundary](docs/cordis.md).
- The consumer is the application assembler. It uses the materials and the port of this package to build the session storage composite. The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Implementation status, tables, write paths, read paths, conformance, failures
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons, limits
├── flows.md              Write paths, compaction commit, epoch-view read, rebuild
├── object-model.md       Tables, indexes, in-process objects, lifecycle
├── public-api.md         Export entry and configuration
├── context.md            Usage, consumers, and position
├── cordis.md             Assembly boundary: no Cordis entry here, what the application owns
└── verification-obligations.md  Verification obligations, methods, preconditions, and gaps
src/                      Root entry, port implementation, codec, cursor, static materials; worker/ holds the Worker modules
tests/                    Entry and dependency, tenant isolation cases; fixtures/ is the node:sqlite test fixture
schema/                   No published schema; table shapes are in docs/object-model.md; the DDL is in src/worker/schema.ts
verification/             Index of verification resources; the obligations are in docs/verification-obligations.md; models/ and proofs/ are empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
