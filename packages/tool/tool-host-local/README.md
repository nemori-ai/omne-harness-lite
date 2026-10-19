# @omne-harness/tool-host-local

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The single-machine Tool host. Its root entry exports the local start coordinator ([G5](../tool-contract/SPEC.md#342-契约缺口决定)). The host clock ([G4](../tool-contract/SPEC.md#342-契约缺口决定)), the binding registry ([G7](../tool-contract/SPEC.md#342-契约缺口决定)) and the Cordis plugin on `./cordis` are not yet delivered.

## Responsibility and status

This package is the first provider of the Tool start ordering domain (contract SPEC P04, decision G5). `createLocalStartCoordinator` implements `ToolStartAuthority` for one process on one machine. An application assembly passes it to `createToolRuntime` of `@omne-harness/tool` as `ToolDependencies.authority`.

## Support range

The checkout scope and the cross-package table are in [the group support range](../README.md#支持范围). This section states the part of this package. The verification scope tells what the tests check. It does not tell that behavior outside the tests holds.

| Tier | State in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: `LocalStartCoordinatorInput`, `StartCoordinatorAccess`, `GuardResource`, and the names `startCoordinatorAdoption`, `START_COORDINATOR_OWNER` and `START_COORDINATOR_DOMAIN_KEY`. The `./cordis` entry exports no value | Root entry | `tests/public-entry.spec.ts` checks the root exports and that the root import graph has no Cordis. `tests/cordis-entry.spec.ts` checks that `./cordis` exports no value |
| Pure contract functions implemented | None. The contract functions are in `tool-contract` | None | None |
| Independent execution implemented | None. It is in `tool` | None | None |
| Runtime paths implemented | The package has no runtime. It supplies the start-ordering provider of the runtime: `createLocalStartCoordinator` implements `ToolStartAuthority` with permits, consume, inspect, invalidate and exclude, and keeps the acceptance ledger in the `host` domain of the ledger store. It serves one process on one machine. Its P01 operation bindings return the first evidence for identical invalidate/exclude input and conflict for changed input. Each successful exclusion operation binds its reason, including operations on an already excluded call | Root entry. The assembly passes the coordinator as `ToolDependencies.authority` | `tests/start-coordinator.spec.ts` checks the coordinator over the non-durable store of `@omne-harness/tool/testing`. `tests/start-composition.spec.ts` runs it under the real Tool runtime, ledger and driver, with a stand-in executor binding. `tests/start-authority-conformance.spec.ts` runs the start-authority suite of `tool-contract/testing` against it. All 19 conformance cases pass with no not-applicable cases. It checks the P01 conflicts and identical-input replay, including SA13 and SA14. Coordinator tests also check historical invalidations, exclusion aliases, reconstruction, full guard fields and tenant isolation. This is the only real-implementation cross-check of that suite that exists. Durability, a crash of the process and a second process are not covered |
| Hosts and providers not yet delivered | The host clock ([G4](../tool-contract/SPEC.md#342-契约缺口决定)). The binding registry ([G7](../tool-contract/SPEC.md#342-契约缺口决定)). The Cordis plugin on `./cordis`. A start ordering domain that spans processes. A durable store provider ([#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)) | None | None |

## Usage

Construct one coordinator per process with the same store that the ledger uses:

```ts
const authority = createLocalStartCoordinator({
  store, // the ToolLedgerStore that createToolLedger also uses
  access, // answers start and invalidate qualification for a principal and a tenant
  guardsOf: request => [{ owner: 'permissions', resource: `${request.scope.owner}/${request.availability.definition.name}` }],
  commitAttempts: 8,
})
```

The coordinator holds no resource that needs a release. It does not import Cordis. A second coordinator in another process over the same store was not verified, so it is not a supported assembly.

## Contracts

The public types and the P04 protocol belong to [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p04-实际发起围栏). [SPEC.md](SPEC.md) states what this provider does beyond the types: the order of permits, acceptances, rejections and invalidations, the answers for an unreadable ledger, and the tenant checks. The store port and the `host` domain belong to [`@omne-harness/tool`](../tool/docs/public-api.md).

## Design

One module, [start-coordinator.ts](src/start-coordinator.ts). Every operation reads one `host` domain per tenant, decides, and commits by domain revision inside one in-process serial section. The records are guard revisions, invalidation operations, exclusion operations, the current permit of each start, acceptances, rejections and exclusion markers. Operation records preserve input bindings and first evidence across later operations and coordinator reconstruction. They commit with the business change in the same domain. [docs/architecture.md](docs/architecture.md) describes the records and the order.

## Configuration and operation

The assembly owns all inputs. `guardsOf` declares which guard resources apply to a request. Each resource becomes one guard of the permit, and its owner invalidates it through `invalidate`. `commitAttempts` bounds the re-reads after a revision conflict. There are no defaults.

## Verification

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool-host-local test` builds the package and runs the tests. They check the coordinator over the non-durable store, and the coordinator under the real Tool runtime, ledger and driver. [tests/README](tests/README.md) maps each behavior to its test. Durability, crash of the process and a second process are not covered.

## Maintenance

A change to `ToolStartAuthority` or to P04 in the contract changes this coordinator and its tests. A change to the store port or to the `host` domain in `@omne-harness/tool` changes the record layout here. Application assemblies that construct the coordinator change with `LocalStartCoordinatorInput`.

## Directory structure and document responsibilities

Each fixed directory has one responsibility. A directory that exists does not prove that it contains an implementation, a schema, a model, a proof, or an acceptance capability. The source entries and the package-root READMEs keep the `PACKAGE_TEMPLATE_DRAFT` marker. The other skeleton pages keep a placeholder marker until the owner writes their content.

```text
tool-host-local/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md
├── src/                      README.md + index.md + index.ts + cordis.ts + start-coordinator.ts
├── tests/                    README.md + index.md + entry, coordinator and composition specs + values
│   └── fixtures/             README.md + index.md
├── schema/                   README.md + index.md
├── verification/             README.md + index.md
│   ├── models/               README.md + index.md
│   └── proofs/               README.md + index.md
├── adr/                      README.md + index.md
├── examples/                 README.md + index.md
├── resources/                README.md + index.md
├── acceptance/               README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

The public contract of this provider belongs to the contract package [`@omne-harness/tool-contract`](../tool-contract/README.md). The full file navigation is in [index](index.md). The topic responsibilities are in [docs/README](docs/README.md).
