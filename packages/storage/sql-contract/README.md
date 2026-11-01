# @omne-harness/sql-contract

[中文](README_ZH.md)

The SQL storage contract: shapes, three pure functions, Cordis service definitions, and a conformance suite with a memory double.

## Responsibility and status

This package owns the public shape of SQL storage for the harness: identity, commit and recognition results, registration, reads, static materials, the manifest digest, the close control, and the three Cordis service definitions. It implements no provider. The SQLite provider is a separate member (`packages/storage/sqlite-provider`) and is not built yet.

Status: the design is adopted as the input of #687 revision 2 (comment 6554935672). It is not the delivery acceptance D-A01. Implemented here: the shapes, `inputDigestV2`, `manifestDigest`, `combinationManifest`, the three service definitions, and the memory double with its conformance suite. Not implemented here: any SQLite, Worker or file behavior (scenarios C08 to C11, C13, C15, C17 to C23).

## Usage

Four entries:

- `@omne-harness/sql-contract`: shapes and the three pure functions. It imports no Cordis.
- `@omne-harness/sql-contract/worker`: interfaces of modules that provider Workers load. Types only. It imports no Cordis.
- `@omne-harness/sql-contract/cordis`: `StorageService` (key `storage`), `StorageHostService` (key `storageHost`) and `TenantDomainsService` (key `tenantDomains`) and `TenantDomainLookupService` (key `tenantDomainLookup`). A consumer injects `storageKey` and does not import a provider.
- `@omne-harness/sql-contract/testing`: `createMemorySqlStorage` and `runSqlStorageConformance`, and `createMemoryTenantDomainLookup` and `runTenantDomainLookupConformance`.

```ts
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
const result = combinationManifest({ catalog, participants: ['session', 'agent-journal'] })
if (result.kind === 'manifest') request.manifestDigest = manifestDigest(result.manifest)
```

The operations carry no principal. Injecting `storage` is an assembly scope, not access control. The domain entry that calls SQL owns authorization.

## Contracts

Public types: `src/types.ts` (root) and `src/worker.ts`. Service definitions: `src/cordis.ts`. Behavior beyond the types: [SPEC.md](SPEC.md). Index of definitions: [docs/public-api.md](docs/public-api.md).

No promise rejects to report an outcome. The provider checks the field rules: names are non-empty, well-formed UTF-16 and at most 1024 UTF-8 bytes; `transactionDomain` is at most 120 bytes; digests are 64 lowercase hexadecimal characters. The pure digest functions throw `TypeError` for a fact that is not strict JSON, so a digest never hashes a lossy form.

## Design

`canonical.ts` writes RFC 8785 text and judges strict JSON. `digest.ts` and `manifest.ts` hold the pure functions. `fields.ts` holds the field rules that the double uses. `testing/memory.ts` is the double and `testing/conformance.ts` is the suite. The design reasons are in the adopted SQL r2 specification. The long-term text moves to this package in the second segment of #687.

## Configuration and operation

No configuration and no resources. The package needs Node 24 or later. `./testing` writes fixture module files to a temporary directory and removes them when the suite ends. The memory double declares durability `none`.

## Verification

Run in this directory: `pnpm run build`, `pnpm run typecheck`, `pnpm exec vitest run --mode fast`. The tests cover the field rules (one case per rule), the rejection order of `commit`, `registerCombination` and `read`, the digests including the manifest test vector and RFC 8785 number writing, `combinationManifest` for each problem kind, the four entries and the Cordis-free root, and the conformance suite against the double and against deliberately wrong providers.

Not covered: durability, Worker failure, SQLite behavior, domain states other than absent, ready and closed, queue limits, and conformance scenarios C08 to C11, C13, C15, C17 to C23. A pass of the double proves none of them.

## Maintenance

A change to a public shape needs a change to the API snapshot (`pnpm run contract:api`) and to `docs/public-api.md`. Consumers: `packages/session/session-storage-sql` (#1000) and the SQLite provider (second segment of #687). Keep the digest test vector and the specification in step.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
