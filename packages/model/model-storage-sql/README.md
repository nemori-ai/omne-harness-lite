# @omne-harness/model-storage-sql

[中文](README_ZH.md)

The SQL storage member of Model. It keeps the durable facts of one Model call as one call document, and it writes the document with a version check (CAS). It uses SQL only through the public shapes of `@omne-harness/sql-contract`.

## Responsibility and status

This package owns four things: the four tables `md_call`, `md_dispatch`, `md_part`, and `md_operation` with their migration; the parse from rows to the stored call document; the commit loop that reads, runs the caller's work, and commits with CAS; and the participant `model` with the two read handlers `model.call` and `model.pending`.

The package does not own the reduction rules of the Model commands. The shared core of `@omne-harness/model` owns them. It does not own the commit protocol, the receipts, or the tenant domain directory. The storage contract and the application own them.

Status: `draft`, slice S1 (storage skeleton). The [implementation status](SPEC.md#实现现状) of the SPEC gives the coverage.

- Implemented: `createModelStore`, the tables and the migration, the row parse, the participant, the two handler modules, and the construction checks.
- Not implemented: the 22 methods of `ModelCommands`, the send coordinator, and `modelStorageMaterials()`.
- No `./cordis` subpath exists. The application plugin `modelCommands` belongs to the application.

## Usage

The root entry is the only entry. Create a store, then run work in one transaction of (tenant, call, operation):

```ts
import { createModelStore } from '@omne-harness/model-storage-sql'

const store = createModelStore({ storage, domains, combination, limits })
const result = await store.transact({ tenant, call, operation }, tx => {
  const current = tx.read(tenant, operation)
  if ('failure' in current) return current
  return tx.write(tenant, operation, current.ok?.version ?? null, next)
})
```

The work can run more than one time. After a CAS conflict, the loop reads again and runs the work again. The work must be synchronous and must not keep effects of a run that did not commit.

## Contracts

The public types and the runtime checks are in [src/](src/index.md). The behavior is in the [SPEC](SPEC.md). The SPEC also records the frozen shape of `ModelStorageTransaction` and the invariants N1, N2, N3, N5, N6, and N7.

## Design

The main thread computes. The participant checks the version and writes. One commit holds one fact command for the participant `model`. The participant does not run reduction rules or callbacks. A stale read can only cause a CAS conflict. The loop then reads again in the next attempt generation. The [SPEC](SPEC.md#提交循环) gives the steps.

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
| `attemptLimit`           | Attempt generations of one operation, default 8                             |

Construction fails when `maxCallBytes` plus the 64 KiB command reserve is more than `maxCommandBytes` (N1).

## Verification

The tests in [tests/](tests/index.md) run the real participant, migration, and read handlers on `node:sqlite` in-memory databases. They do not cover the Worker, durability, queues, or close of the real provider.

## Maintenance

To add a column, change `TABLES` in `src/schema.ts`, then the parse and the encoders in `src/documents.ts`. Add a new migration for a released schema. To change the transaction shape, agree with the shared core first: the shape is frozen on both sides.

## Directory structure and documentation roles

| Path                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `SPEC.md`            | Behavior, invariants, failures, and known limits |
| `src/`               | Source, see [src/index.md](src/index.md)         |
| `tests/`             | Tests, see [tests/index.md](tests/index.md)      |
| `documentation.json` | The documentation bindings of this package       |
