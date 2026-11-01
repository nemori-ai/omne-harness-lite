# @omne-harness/model-storage-sql

[中文](README_ZH.md)

The SQL storage member of Model. It implements `ModelCommandStorage`, the storage port of the shared commands core. It keeps the durable facts of one Model call as one call document and writes the document with a version check (CAS). It uses SQL only through the public shapes of `@omne-harness/sql-contract`.

## Responsibility and status

This package owns four things: the four tables `md_call`, `md_dispatch`, `md_part`, and `md_operation` with their migration; the parse from rows to the call document; the SQL `ModelCommandStorage`, whose runs read, run the core's work, and commit with CAS; and the participant `model` with the two read handlers `model.call` and `model.pending`.

The package does not own the reduction rules of the Model commands. The shared core of `@omne-harness/model` owns them. It does not own the commit protocol, the receipts, or the tenant domain directory. The storage contract and the application own them.

Status: `draft`, slice S1 (storage skeleton). The [implementation status](SPEC.md#实现现状) of the SPEC gives the coverage.

- Implemented: `createSqlModelStorage`, the tables and the migration, the row parse, the participant, the two handler modules, and the construction checks.
- Not implemented: the assembly of `ModelCommands` over this storage, the send coordinator, and `modelStorageMaterials()`.
- The port types in `src/documents.ts` mirror the shared core. They become imports when `@omne-harness/model/commands` exists.
- No `./cordis` subpath exists. The application plugin `modelCommands` belongs to the application.

## Usage

The root entry is the only entry. Create the storage and give it to the shared commands core:

```ts
import { createSqlModelStorage } from '@omne-harness/model-storage-sql'

const storage = createSqlModelStorage({ storage, domains, combination, limits, isPending })
```

The core calls `run(work, scope)` with the tenant, call, and operation of one command. In `work` it reads with `documents` and `reserved`, and it writes one time with `commit` or `publish`. The work can run more than one time: after a CAS conflict, the run reads again and runs the work again. The work must be synchronous.

## Contracts

The public types and the runtime checks are in [src/](src/index.md). The behavior is in the [SPEC](SPEC.md). The SPEC also records how this package meets the storage port of the shared core, and the invariants N1, N2, N3, N5, N6, and N7.

## Design

The main thread computes. The participant checks the version and writes. One commit holds one fact command for the participant `model`. The participant does not run reduction rules or callbacks. A stale read can only cause a CAS conflict. The loop then reads again in the next attempt generation. The [SPEC](SPEC.md#一次-run) gives the steps.

Each column is declared one time, in `TABLES` of `src/schema.ts`. The migration, the parse, and the participant use that declaration.

## Configuration and operation

| Option                   | Meaning                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `storage`                | The `SqlStorage` of the application                                         |
| `domains`                | The `TenantDomainLookup` of the application                                 |
| `combination`            | The combination version and manifest digest that the application registered |
| `limits.tenantCapacity`  | The share of one tenant                                                     |
| `limits.maxCallBytes`    | The largest call material                                                   |
| `limits.maxCommandBytes` | The `maxCommandBytes` of the provider                                       |
| `isPending`              | The rule of the shared core that marks a call with recovery work            |
| `attemptLimit`           | Attempt generations of one operation, default 8                             |
| `unresolvedLimit`        | Operations with an unknown outcome that the process keeps, default 1024     |

Construction fails when `maxCallBytes` plus the 64 KiB command reserve is more than `maxCommandBytes` (N1).

## Verification

The tests in [tests/](tests/index.md) run the real participant, migration, and read handlers on `node:sqlite` in-memory databases. They do not cover the Worker, durability, queues, or close of the real provider.

## Maintenance

To add a column, change `TABLES` in `src/schema.ts`, then the parse and the encoders in `src/documents.ts`. Add a new migration for a released schema. The storage port belongs to the shared core. When the core changes it, change this package to match.

## Directory structure and documentation roles

| Path                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `SPEC.md`            | Behavior, invariants, failures, and known limits |
| `src/`               | Source, see [src/index.md](src/index.md)         |
| `tests/`             | Tests, see [tests/index.md](tests/index.md)      |
| `documentation.json` | The documentation bindings of this package       |
