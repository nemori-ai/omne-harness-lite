# @omne-harness/tool-host-local

[中文](README_ZH.md)

The single-machine Tool host. Its root entry exports the local start coordinator ([G5](../tool-contract/SPEC.md#342-契约缺口决定)), the host clock ([G4](../tool-contract/SPEC.md#342-契约缺口决定)), the binding registry with its Catalog ([G7](../tool-contract/SPEC.md#342-契约缺口决定)), and three absent ports. The generation coordinator `toolGenerations`, `ToolBindings.resolve` and `recover`, and the Cordis plugin on `./cordis` are not yet delivered.

## Responsibility and status

This package is the first provider of the Tool start ordering domain (contract SPEC P04, decision G5). `createLocalStartCoordinator` implements `ToolStartAuthority` for one process on one machine. An application assembly passes it to `createToolRuntime` of `@omne-harness/tool` as `ToolDependencies.authority`.

## Support range

The checkout scope and the cross-package table are in [the group support range](../README.md#支持范围). This section states the part of this package. The verification scope tells what the tests check. It does not tell that behavior outside the tests holds.

| Tier                                  | State in this package                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Entry                                                                           | Verification scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public types exported                 | Exported: `LocalStartCoordinatorInput`, `StartCoordinatorAccess`, `GuardResource`, the guard types `ToolHostAccess`, `LocalToolLedgerGuardsInput`, `LocalInvocationSource`, `LocalInvocationSourceInput`, `PrincipalCodec`, `PrincipalJson`, `LocalGrantScope` and `LocalStartGuardInput`, and the names `startCoordinatorAdoption`, `START_COORDINATOR_OWNER` and `START_COORDINATOR_DOMAIN_KEY`. No `./cordis` entry is available                                                                                                                          | Root entry                                                                      | `tests/public-entry.spec.ts` checks the root exports and that the root import graph has no Cordis. `tests/entry-boundary.spec.ts` checks that Node rejects `./cordis` with `ERR_PACKAGE_PATH_NOT_EXPORTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Pure contract functions implemented   | None. The contract functions are in `tool-contract`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None                                                                            | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Independent execution implemented     | None. It is in `tool`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None                                                                            | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Runtime paths implemented             | The package has no runtime. It supplies the start-ordering provider of the runtime: `createLocalStartCoordinator` implements `ToolStartAuthority` with permits, consume, inspect, invalidate and exclude, and keeps the acceptance ledger in the `host` domain of the ledger store. It serves one process on one machine. Its P01 operation bindings return the first evidence for identical invalidate/exclude input and conflict for changed input. Each successful exclusion operation binds its reason, including operations on an already excluded call | Root entry. The assembly passes the coordinator as `ToolDependencies.authority` | `tests/start-coordinator.spec.ts` checks the coordinator over the non-durable store of `@omne-harness/tool/testing`. `tests/start-composition.spec.ts` runs it under the real Tool runtime, ledger and driver, with a stand-in executor binding. `tests/start-authority-conformance.spec.ts` runs the start-authority suite of `tool-contract/testing` against it. All 19 conformance cases pass with no not-applicable cases. It checks the P01 conflicts and identical-input replay, including SA13 and SA14. Coordinator tests also check historical invalidations, exclusion aliases, reconstruction, full guard fields and tenant isolation. This is the only real-implementation cross-check of that suite that exists. Durability, a crash of the process and a second process are not covered |
| Hosts and providers not yet delivered | The generation coordinator `toolGenerations` ([G7](../tool-contract/SPEC.md#342-契约缺口决定)). `ToolBindings.resolve` and `recover`. A production origin check for contributions. `toolOutputCustody`. The Cordis plugin on `./cordis`. A start ordering domain that spans processes. A durable store provider ([#280](https://github.com/nemori-ai/omne-harness-lite/issues/280))                                                                                                                                                                          | None                                                                            | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Environment scheduling and credentials

The root entry also exports `createLocalScheduledEnvironment` and `createLocalToolCredentials`. The scheduler consumes explicit host policy through the environment verbs. Its slot accounting is local to one process. The credential adapter checks stored bindings again at protected use. See the [public API](docs/public-api.md) for provider responsibilities and current limits. The allocation-to-first-adoption mapping and the real vault are not delivered.

## Host clock, binding registry, Catalog and absent ports

The root entry also exports `createLocalToolClock` ([G4](SPEC.md#宿主时钟g4)), `createLocalToolBindingRegistry` and `createLocalToolCatalog` ([G7](SPEC.md#绑定登记表与换代协调者g7)), and `createAbsentToolPorts` ([D-07](SPEC.md#缺席端口d-07)). The clock measures with a monotonic reading and a process epoch, and refuses a marker of another epoch instead of recounting. The registry admits a contribution only through an injected origin check; without one, `register` answers `unavailable`. The Catalog lists live contributions that the asking tenant may access and does not tell whether another tenant registered anything. The absent ports answer a named `unavailable` for every method. Limits: the registry is in-process and not durable, a workspace-layer contribution is visible to no tenant scope, and no production origin check exists yet.

Verification, all in one process with test doubles named in the files: `tests/clock-conformance.spec.ts`, `tests/bindings-conformance.spec.ts` run the contract suites `toolClockConformance` and `toolBindingRegistryConformance` with no not-applicable case. `tests/clock.spec.ts`, `tests/catalog.spec.ts`, `tests/absent-ports.spec.ts` check the rules of this package. `tests/runtime-composition.spec.ts` shows that `createToolRuntime` accepts these parts. The executor-binding suite `toolExecutorBindingConformance` is not run: it checks an execution adapter, which this package does not provide.

## Ledger guards

The root entry also exports the production parts of the ledger guards ([TL-11](SPEC.md#账本守卫tl-11)): `createLocalToolLedgerGuards` (puts the eight guards together), `createLocalInvocationSource` (the source issuer and source guard; the bindings are kept in the `host` domain of the ledger store), `createLocalOperationIdentities`, `createLocalGrantVerifiers` (one scope value, D1), `createLocalStartGuard`, `createLocalTextResults`, and the constants `localArgumentLimits`, `INVOCATION_SOURCE_DOMAIN_KEY` and `PROGRAMMATIC_NOT_IN_M2`. All of them are pure factories. The qualification adapter, the principal comparison and the principal codec enter as parameters. The assembly is wired by the `./cordis` plugin, which is not yet delivered.

Verification scope: `tests/ledger-guards.spec.ts`, `tests/invocation-source.spec.ts`, `tests/grant-verifiers.spec.ts` and `tests/start-guard.spec.ts`. They use the real ledger of `tool` over an in-memory store, with `createTableToolAccess` as the qualification. They prove behaviour in one process only: cross-tenant denial without a store read, source recall and forgery, the grant, the start guard, the text result, and the required parts and budgets of the assembly. They do not prove durability or the real qualification adapter.

## Usage

Construct one coordinator per process with the same store that the ledger uses:

```ts
const authority = createLocalStartCoordinator({
  store, // the ToolLedgerStore that createToolLedger also uses
  access, // answers start and invalidate qualification for a principal and a tenant
  guardsOf: request => [
    {
      owner: 'permissions',
      resource: `${request.scope.owner}/${request.availability.definition.name}`,
    },
  ],
  commitAttempts: 8,
})
```

The coordinator holds no resource that needs a release. It does not import Cordis. A second coordinator in another process over the same store was not verified, so it is not a supported assembly.

## Contracts

The public types and the P04 protocol belong to [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p04-实际发起围栏). [SPEC.md](SPEC.md) states what this provider does beyond the types: the order of permits, acceptances, rejections and invalidations, the answers for an unreadable ledger, and the tenant checks. The store port and the `host` domain belong to [`@omne-harness/tool`](../tool/docs/public-api.md).

## Design

The coordinator is in [start-coordinator.ts](src/start-coordinator.ts). Every operation reads one `host` domain per tenant, decides, and commits by domain revision inside its tenant's in-process serial section. The records are guard revisions, invalidation operations, exclusion operations, the current permit of each start, acceptances, rejections and exclusion markers. Operation records preserve input bindings and first evidence across later operations and coordinator reconstruction. They commit with the business change in the same domain. [docs/architecture.md](docs/architecture.md) describes the records and the order.

## Configuration and operation

The assembly owns all inputs. `guardsOf` declares which guard resources apply to a request. Each resource becomes one guard of the permit, and its owner invalidates it through `invalidate`. `commitAttempts` bounds the re-reads after a revision conflict. There are no defaults.

## Verification

From the repository root, use Node.js 24 or later and pnpm 10.28.1. Prepare workspace dependencies once, then build and run this member's checks:

```sh
pnpm --workspace-concurrency=1 --filter @omne-harness/tool... --filter @omne-harness/tool-host-local... -r run build
pnpm --filter @omne-harness/tool-host-local run typecheck
pnpm --filter @omne-harness/tool-host-local run test
```

Both member commands should exit with code 0. Missing modules or declarations require dependency preparation and a build in this checkout. Invalid `commitAttempts` throws at construction. Unreadable authorization or store state returns a named failure. See [failure behavior](SPEC.md#6-身份租户与失败) before treating a start as confirmed.

See the [Tool tutorial](../tool/examples/README.md) for ordinary invocation, pagination, and delivery release. That tutorial uses a memory start authority. This member's tests exercise the real local coordinator on a non-durable store. The two evidence scopes remain separate. Neither provides a production host, durable recovery, or a real Agent/Session integration.

`pnpm turbo run test --filter=@omne-harness/tool-host-local` builds the package and its dependencies, then runs the tests. They check the coordinator over the non-durable store, and the coordinator under the real Tool runtime, ledger and driver. [tests/README](tests/README.md) maps each behavior to its test. Durability, crash of the process and a second process are not covered.

## Maintenance

A change to `ToolStartAuthority` or to P04 in the contract changes this coordinator and its tests. A change to the store port or to the `host` domain in `@omne-harness/tool` changes the record layout here. Application assemblies that construct the coordinator change with `LocalStartCoordinatorInput`.

## Directory structure and document responsibilities

Each fixed directory has one responsibility. A directory that exists does not prove that it contains an implementation, a schema, a model, a proof, or an acceptance capability. The root entry delivers start coordination, environment scheduling and credential adapters. The Cordis plugin remains a future design, with no available `./cordis` entry. Skeleton pages keep a placeholder marker until the owner writes their content.

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
├── src/                      README.md + index.md + index.ts + start-coordinator.ts
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
│   └── fixtures/             README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

The public contract of this provider belongs to the contract package [`@omne-harness/tool-contract`](../tool-contract/README.md). The full file navigation is in [index](index.md). The topic responsibilities are in [docs/README](docs/README.md).

The runtime composition test submits an ordinary payload through invoke with paired source issuance and verification. The test host passes its instance identity explicitly to driver.run. This package supplies no production instance host, source issuer, identity issuer, claim or takeover protocol. See [the host boundary](SPEC.md#实例宿主与普通调用的边界).
