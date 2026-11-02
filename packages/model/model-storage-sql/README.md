# @omne-harness/model-storage-sql

[中文](README_ZH.md)

The SQL storage member of Model. It implements `ModelCommandStorage`, the storage port of the shared commands core, and it assembles the durable `ModelCommands` from the core and this storage. It keeps the durable facts of one Model call as one call document and writes the document with a version check (CAS). It uses SQL only through the public shapes of `@omne-harness/sql-contract`.

## Responsibility and status

This package owns five things: the four tables `md_call`, `md_dispatch`, `md_part`, and `md_operation` with their migration; the parse from rows to the call document; the SQL `ModelCommandStorage`, whose runs read, run the core's work, and commit with CAS; the participant `model` with the two read handlers `model.call` and `model.pending`; and `createSqlModelCommands`, which puts the shared core on this storage.

The package does not own the rules of the Model commands. The shared core of `@omne-harness/model` owns them. It does not own the commit protocol, the receipts, or the tenant domain directory. The storage contract and the application own them.

Status: `draft`. The [implementation status](SPEC.md#实现现状) of the SPEC gives the coverage.

- Implemented: `createSqlModelCommands` (with `send`, also the send coordinator over the same core), `createSendMirror`, `createSqlModelStorage`, the tables and the migration, the row parse, the participant, the two handler modules, and the construction checks.
- Not implemented: `modelStorageMaterials()`.
- Known difference: after a restart, `query` can answer `not-committed` for a write whose outcome was unknown before the restart. The [known differences](SPEC.md#已知差异) of the SPEC give all differences from the memory commands.
- No `./cordis` subpath exists. The application plugin `modelCommands` belongs to the application.

## Usage

The root entry is the only entry. Create the durable commands:

```ts
import { createSqlModelCommands } from '@omne-harness/model-storage-sql'

const { commands } = createSqlModelCommands({
  owners,
  authority,
  evidence,
  clock,
  limits,
  storage,
  domains,
  combination,
  maxCallBytes,
  maxCommandBytes,
})
```

`commands` has the 22 methods of `ModelCommands`. The shared core runs each method with `run(work, scope)` of the storage. The scope gives the tenant, the call, and, for a write, the operation. In `work` the core reads with `documents` and `reserved`, and it writes one time with `commit` or `publish`. After a CAS conflict, the run reads again and runs the work again. `scanPending` uses the `pending` port of the storage and does not run an attempt.

## Contracts

The public types and the runtime checks are in [src/](src/index.md). The behavior is in the [SPEC](SPEC.md). The SPEC also records how this package meets the storage port of the shared core, and the invariants N1, N2, N3, N5, N6, and N7. The types of the storage port belong to `@omne-harness/model/commands`. The root entry exports them again without change.

## Design

The main thread computes. The participant checks the version and writes. One commit holds one fact command for the participant `model`. The participant does not run the rules of the commands or callbacks. A stale read can only cause a CAS conflict. The loop then reads again in the next attempt generation. The [SPEC](SPEC.md#一次-run) gives the steps.

Each column is declared one time, in `TABLES` of `src/schema.ts`. The migration, the parse, and the participant use that declaration.

## Configuration and operation

| Option            | Meaning                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| `owners`          | The consumer owner declarations of the shared core                                     |
| `authority`       | The qualification port of the shared core                                              |
| `evidence`        | The evidence adapters of the shared core                                               |
| `clock`           | The clock of the shared core                                                           |
| `limits`          | The limits of the shared core. `limits.capacity` is the share of one tenant            |
| `storage`         | The `SqlStorage` of the application                                                    |
| `domains`         | The `TenantDomainLookup` of the application                                            |
| `combination`     | The combination version and manifest digest that the application registered            |
| `maxCallBytes`    | The largest call material                                                              |
| `maxCommandBytes` | The `maxCommandBytes` of the provider                                                  |
| `attemptLimit`    | Attempt generations of one operation, default 8                                        |
| `unresolvedLimit` | Operations with an unknown outcome that the process keeps for one tenant, default 1024 |

Construction fails when `maxCallBytes` plus the 64 KiB command reserve is more than `maxCommandBytes` (N1), and when `limits.scanPageCalls` is more than 1000. A call whose `capacity.bytes` is more than `maxCallBytes` is refused when it is admitted.

## Verification

The tests in [tests/](tests/index.md) run the real participant, migration, and read handlers on `node:sqlite` in-memory databases. Most of them run the 22 methods through the shared core. They compare the accounts suite on the memory and the SQL commands. They do not cover the Worker, durability, queues, or close of the real provider.

## Maintenance

To add a column, change `TABLES` in `src/schema.ts`, then the parse and the encoders in `src/documents.ts`. Add a new migration for a released schema. The storage port belongs to the shared core. When the core changes it, change this package to match.

## Directory structure and documentation roles

| Path                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `SPEC.md`            | Behavior, invariants, failures, and known limits |
| `src/`               | Source, see [src/index.md](src/index.md)         |
| `tests/`             | Tests, see [tests/index.md](tests/index.md)      |
| `documentation.json` | The documentation bindings of this package       |
