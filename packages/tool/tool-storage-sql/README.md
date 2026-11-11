# @omne-harness/tool-storage-sql

[中文](README_ZH.md)

The SQL provider of the Tool ledger store and of the body store. Its root entry exports `createSqlToolLedgerStore` (a durable `ToolLedgerStore` with its due index), `createSqlToolBodyStore` (a durable `ToolBodyStore`), and the static materials `toolStorageMaterials()`. It works on any provider of the SQL storage contract and imports no provider.

## Responsibility and status

This package keeps the durable records of the Tool ledger, the due index and the bytes of offloaded bodies in the transaction domain of each tenant, beside the Session log (Reduce decision R1-D2). The basis is the D2 decision record of the tool-exec line (#421 comment 6561321713) and the W3 body custody (#1168). The named consumers are the `tool-runtime` and `tool-body-sweep` rows of harness-server and the material catalog of the application.

| Part                                                 | State                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `createSqlToolLedgerStore`                           | Implemented. `durability: 'durable'`. One `domain-serial` read or one revision-conditioned SQL commit per call; `due` reads the due index |
| `createSqlToolBodyStore`                             | Implemented. `durability: 'durable'`. It writes immutable chunks under a write permit, writes the sealing manifest after it checks the chunks, reads by range, and deletes idempotently |
| `toolStorageMaterials()`                             | Implemented. One participant `tool`, one migration `tool/r6-001-tool-ledger-body-due`, three read handlers, all on `tl_` tables |
| `./cordis` plugin, `tool-records` row, catalog merge | Not in this package. They belong to the application                                                                            |
| Two processes on one database, a kill, power loss    | Not verified                                                                                                                   |

## Usage

The application builds both adapters from the same `storage` and `tenantDomainLookup` that the `storage` row and the session storage composite provide:

```ts
import { createSqlToolBodyStore, createSqlToolLedgerStore } from '@omne-harness/tool-storage-sql'

const options = {
  storage, // SqlStorage of the `storage` row
  domains, // TenantDomainLookup: the published tenant domain directory
  combination: { combinationVersion, manifestDigest }, // registered for the tenant scope
}
const store = createSqlToolLedgerStore(options)
const bodyStore = createSqlToolBodyStore({
  ...options,
  permitKey, // the same key the ledger signs write permits with
  clock, // the store's own clock for the permit deadline check
})
```

The store goes to `createToolLedger` and to `createLocalStartCoordinator` of `@omne-harness/tool-host-local`. The body store goes, with the same `permitKey`, to `ToolLedgerPorts.bodies` of the ledger and to the `createToolSweep` that the application schedules. The adapters hold no resource and need no release. The materials go into the application's `SqlMaterialCatalog` beside the materials of Session and Model.

## Contracts

The port shapes belong to [`@omne-harness/tool`](../tool/src/ledger-store.ts) (`ToolLedgerStore`) and [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#正文存储端口与到期索引) (`ToolBodyStore` and the due index). The SQL operations belong to [`@omne-harness/sql-contract`](../../storage/sql-contract/SPEC.md). [SPEC.md](SPEC.md) states what this package does beyond the types: the commit order, the answer of each SQL result, tenant isolation, the body chunks and manifest, the due index and the known limits. [docs/public-api.md](docs/public-api.md) lists the exports.

## Design

`src/ledger-store.ts` and `src/body-store.ts` are the two adapters. `src/tenant.ts` resolves the transaction domain of a tenant through the directory. The Worker modules in `src/worker/` are the `tool` participant (ledger writes in `participant.ts`, body commands in `participant-body.ts`), the migration and three read handlers. They share one facts protocol in `src/worker/facts.ts`. [docs/architecture.md](docs/architecture.md) describes the tables and the mechanisms, and [docs/flows.md](docs/flows.md) the commit and body flows.

## Configuration and operation

| Option               | Owner                | Rule                                                                                                          |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `storage`, `domains` | Application assembly | The trusted `storage` and `tenantDomainLookup` rows. A tenant that the directory does not hold is not written |
| `combination`        | Application assembly | The combination that lists the `tool` participant for the tenant scope                                        |
| `permitKey`          | Application assembly | Body store only. It must be the key the ledger signs permits with, or every write answers `permit-invalid`    |
| `clock`              | Application assembly | Body store only. The store reads it to decide whether a permit is past its deadline                           |

No option has a default. The package never registers a tenant or a combination.

## Verification

Run in this directory:

```sh
pnpm run build
pnpm run typecheck
NO_COLOR=1 pnpm exec vitest run --mode fast
```

The tests run the real Worker modules on a node:sqlite test provider (`tests/fixtures/sqlite-storage.ts`). They run the two ledger store suites of `@omne-harness/tool/testing` (with the `due.*` cases) and `toolBodyStoreConformance()` of `@omne-harness/tool-contract/testing` with every handle and no not-applicable case. They also check tenant isolation with planted rows, reopening the files, atomic commits, the quarantine of an old baseline and the start coordinator suites over this store. The slow `-live` cases run on the real sqlite-provider: bodies move no ledger revision, commits write no receipt, the sweep, tenant isolation, single-record reads and delivery release. The test provider does not model Workers, queues, group commit or power loss. The authorization suite of the start coordinator is not applicable: the coordinator has no authorization consumption point.

## Maintenance

A new `LedgerRecord` kind needs no change here: the store keeps records by key and interprets none. A change of the `ToolLedgerStore` or `ToolBodyStore` shape, or of the SQL contract, needs a change here and in the tests. A change of a Worker module changes its digest and so the manifest digest: the application registers a new combination version. Table names keep the `tl_` prefix.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, tables, mechanisms
├── flows.md              Ledger commit and body flows
├── object-model.md       Records, body chunks and manifests
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Not applicable: no Cordis binding
src/                      Adapters, options and the Worker modules
tests/                    Continuous tests; fixtures/ holds the SQLite test provider
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
