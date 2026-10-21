# @omne-harness/session-storage-sql

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The storage member of Session. Variant: `cordis-module`.

## Responsibility and status

This is the only member of the Session group that touches the storage medium. It uses SQL tables to implement the `SessionTransactionPort` that [session-contract](../session-contract/README.md) declares. The port covers commit, authoritative read, original-operation query, history read, epoch-view read, pending scan, reference query, and released-scope read. The package owns four things: the SQL shape of the authoritative tables and derived indexes, with their migration fragments; the storage-contract participant module `session`, which runs the Session fact statements inside the transaction of the storage provider; the SQL implementation of `SessionTransactionPort`; and the algorithms of read paths R1 to R11 with the conformance suite.

The package does not own the governance rules or the domain services (session-contract owns them). It does not own the part of the command pipeline outside the transaction ([session](../session/README.md) owns it). It does not own the neighbor translation ([session-adapters](../session-adapters/README.md) owns it). It does not own the commit protocol or the receipts (the storage contract owns them). It does not own the entry cache, the snapshot cache, or the view-prefix digest cache.

Status: storage member, `draft`, candidate technical design, no running implementation. The adoption basis is the [member decomposition](../docs/architecture.md) of the group and the [SPEC](SPEC.md).

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` hold only template markers. Both entries export nothing.
- Not implemented: the transaction port implementation, the participant module, the derivation maintenance, the read paths, the rebuild, the codecs, the migration fragments, and the Cordis plugin.
- Not verified: no SPEC obligation has a test. The current tests check only that both entries export nothing.
- Missing precondition: the storage contract has no workspace member to depend on. [XP-1 to XP-6](SPEC.md#xp-table) of the SPEC record six expectations about it. The storage line owns them ([issue 540](https://github.com/nemori-ai/omne-harness-lite/issues/540)). When one is missing, the related operation returns `unavailable`. The package does not replace it with an in-memory implementation.

No package depends on this package now.

## Usage

The package has two entries:

- The root entry `@omne-harness/session-storage-sql` does not depend on Cordis. It will export the provider factory, the participant module, the migration fragments, and the combination registration material. A caller without Cordis uses the factory to get the transaction port. The caller gives the port to the `transactions` dependency of the [session](../session/README.md) factory.
- `@omne-harness/session-storage-sql/cordis` will export one plugin. The plugin provides the service key `sessionTransactions`. [session-cordis-contract](../session-cordis-contract/README.md) owns the key and the abstract class. The application assembler installs the plugin, and session-cordis takes the port through `inject`.

Both paths need a usable provider of the storage contract. Both paths also need the execution-record provider to register the same combination version in the same transaction domain as this package. Each operation passes the tenant and the session explicitly. The package does not infer the tenant from a connection, a transaction domain, or the assembly tree. The implementation will fix the name and signature of the factory. No runnable example exists now. The assembly steps and the role pseudocode of independent use are in the [usage page](docs/context.md#使用方式). The plugin dependencies and the load order are in the [Cordis page](docs/cordis.md).

A caller that needs only types and pure functions uses session-contract and does not need this package.

## Contracts

- `src/` owns the public shapes. It is empty now. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the required behavior: tables and indexes, write paths W1 to W6, read paths R1 to R11, retention and caches, conformance C-01 to C-04, and the failure classification.
- The [session-contract SPEC](../session-contract/SPEC.md#sessiontransactionport) owns the eleven operations of the port, with their results and failures.
- The [object model](docs/object-model.md) owns the shape of the tables, the indexes, and the in-process objects.

The party that calls the factory owns the port instance and closes it. Close releases only the statement cache and the reference to the cursor signing key. It does not close the connection or the Worker of the provider, and it does not roll back any commit. `commit` has no cancel. The caller reconciles by the original operation identity. A read path returns `unavailable` when the provider is not available, when an index is rebuilding, or when the read entry is absent. It never returns an empty page. The package does not delete entries, batches, receipts, or old epoch rows.

## Design

The package has seven modules: transaction port, participant module, derivation maintenance, read path, rebuild, codec, and migration fragments. The outside dependencies are the pure functions of session-contract (the OP-00 identity derivation, `decide`, and `reduce`), the storage contract, and Kysely. The key mechanisms are:

- one storage participant `session`, with the bridge material packed into the same command
- one encoding from command to entries, owned by `decide`, so this package only assigns positions, writes rows, and maintains derivations
- the snapshot and seven derived indexes written in the same transaction as the entries, so no read path replays the log
- history pagination with a fixed upper bound and signed cursors, so the server keeps no read session
- a storage rollback is never written as a business rejection, an attempt that did not take effect is never written as not committed, and an unprovable outcome is returned as unknown
- no deletion of entries, and quarantine of a session with an entry gap instead of truncation of its tail

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the sequences of the write paths, the compaction commit, the epoch-view read, and the derivation rebuild. The [object model](docs/object-model.md) describes the tables and the indexes.

## Configuration and operation

The configuration items are the medium (SQLite or PostgreSQL, which must match the storage provider), the inline threshold (initial value 16 KiB), the large-object destination (initial value: the same-database `sl_blob`), the `pageBytes` limit, `maxScanPerPage`, and the snapshot rebuild mode. The last three items have no initial value, and the assembly must give them. All default values are only initial configuration values. With Cordis, the plugin configuration supplies these values and checks them with a Standard Schema. See the [Cordis page](docs/cordis.md#配置). The cursor signing key is a run-time object that the assembly injects. It is not a configuration value.

The environment precondition is a SQLite or PostgreSQL provider of the storage contract. The provider owns the connection, the Worker, the PRAGMA settings, and the writer generation. This package does not open a connection. The migration fragments run with the atomic migration of the provider. Until the migration completes, reads and writes return `unavailable`. No in-memory implementation exists. The caller closes the port, and the owner of storage closes the provider.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-storage-sql
```

In this directory, run `pnpm typecheck` for the type check. The two current tests check only that both entries export nothing. See [tests/](tests/README.md). The SPEC obligations arrive with the implementation, as listed in the [verification obligations](verification/obligations.md): a shadow-table set difference for "derived equals recomputed", property tests for pagination and cursors, one write-path case for each joint-commit row, benchmarks of read-path complexity with N from 10³ to 10⁶, and injection cases for the failure table. All obligations assume a real SQLite or PostgreSQL provider, so they wait for the storage line to provide the entries. The package declares no numeric target before measurement. Power-loss durability belongs to SQL-T01 of the storage line, and this package does not claim it. A passing structure check does not prove behavior.

## Maintenance

- When the transaction port, `decide`, `reduce`, or the event catalog changes in session-contract, update the write paths and read paths of the SPEC, the [architecture page](docs/architecture.md), and the [flows page](docs/flows.md). When the fold version changes, rebuild `sl_state` as R9 states.
- When you add an event kind or a reference kind, update the derived-row table of the SPEC, the recompute table of C-01, and the rebuild.
- When a table or an index changes, update the [object model](docs/object-model.md) and the migration fragments. Authoritative tables only gain columns.
- When you add a configuration item, update the [API page](docs/public-api.md) and the configuration on the [Cordis page](docs/cordis.md).
- When the storage contract supplies an item of the XP table, remove the matching fallback and the explicit gap from the SPEC.
- The consumers are session-cordis (through the service key) and the application assembler. The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Tables, write paths, read paths, conformance, failures
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons, limits
├── flows.md              Write paths, compaction commit, epoch-view read, rebuild
├── object-model.md       Tables, indexes, in-process objects, lifecycle
├── public-api.md         Export entries, candidate exports, configuration
├── context.md            Usage, consumers, and position
└── cordis.md             Cordis integration as the sessionTransactions provider
src/                      Two entries, template markers only now
tests/                    Entry tests, fixtures/ is empty now
schema/                   Empty now, table shapes are in docs/object-model.md
verification/             obligations.md; models/ and proofs/ are empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
