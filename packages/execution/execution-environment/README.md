# @omne-harness/execution-environment

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The registry mechanism member of the execution environment. Variant: `module`.

## Responsibility and status

This package implements the registry of the execution environment. It keeps the provider table, the facility descriptor table, the acquisition table, and the lease views. It checks access through the environment authority and the scope binding, matches a placement against the allowed list, acquires by tenant and acquisition key, handles a lost answer through the provider quota and original record, checks the provider receipt, and issues the adoption record. It gates each facility operation, drives recovery, and closes in a fixed order. It exports one factory that does not depend on Cordis.

[execution-environment-contract](../execution-environment-contract/README.md) owns the public behavior. [execution-environment-host-local](../execution-environment-host-local/README.md) owns the Cordis binding and the service removal. The package holds no durable state. All four tables are process-local copies.

Status: mechanism member, `draft`. The adoption basis is the [topic owner table](../docs/architecture.md#主题与唯一拥有者) of the group and the [SPEC](SPEC.md).

- Implemented: the factory `createEnvironmentRegistry`, the error class `RetirementPending`, and the SPEC behavior for access checks, placement, acquisition with the quota preflight, adoption and the cleanup of a failed adoption, the two queries and the recovery query, lease views, release, describe, registration and retirement, recovery over resources and acquisitions, and close.
- Open items are in the SPEC [gap list](SPEC.md#明确缺项). The provider plans and permits managed facility operations in the ledger, and this package does not call the ledger. The retention policy for the in-process tables is open. The read surface for the block producer is open. Ledger use for managed facility operations remains open. This package and the host-local member both run the public environment suite of the contract. The suite uses stub ports, so it does not prove a real authority, a real binding source, or durability.
- Not verified: the package does not claim persistence, cross-process consistency, or real resource stop.

execution-environment-host-local depends on this package now.

## Usage

The package has only the root entry `@omne-harness/execution-environment`. A system with Cordis does not import it directly. The Service of execution-environment-host-local calls the factory. A caller without Cordis calls the factory directly:

```ts
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'

const registry = createEnvironmentRegistry<MyPrincipal>({
  recovery: myRecoveryAuthority,
  authority: myEnvironmentAuthority,
  bindings: myScopeBindings,
})
// Register descriptors and providers, resolve a placement, acquire a lease...
await registry.close()
```

`MyPrincipal` and the three ports are values of the caller. An independent caller holds the instance, calls `close()`, and handles the `RetirementPending` that a removal function throws. The [usage page](docs/context.md#独立使用) gives the full use.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the local behavior: tables and views, placement, access checks, acquisition, queries, the operation gate, release, retirement, recovery, and close.
- The [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) owns the inputs, results, and failures of the nine operations.
- The [object model](docs/object-model.md) owns identity and life of the internal objects.

The caller of the factory owns the registry instance and calls `close()`. Close first refuses new placements, acquisitions, and registrations. Then it invalidates all leases. Then it retires all providers. Close does not empty the tables and does not undo external effects. When a retirement stays pending, the removal function throws `RetirementPending`.

## Design

The source has six modules: registry, access check, original record, lease view, recovery, and compare. The outside dependencies are the types of execution-environment-contract, legal-identity, and runtime-context-contract. The key mechanisms are these:

- The access check runs before the acquisition table is read.
- Placement and acquisition are separate, and acquisition checks the placement again.
- The acquisition table gets the key before the provider call.
- Only the provider judges the quota.
- A lost allocation answer is never sent again.
- The package, not the provider, issues the adoption record.
- The lease view is a gate for each operation.
- Removal of a provider starts its retirement.
- Recovery runs over two paths: resources and acquisitions.
- The registry asks the recovery authority once per recovery.
- Close keeps the tables. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives six mechanism flows. The [object model](docs/object-model.md) lists the internal objects.

## Configuration and operation

The factory takes three ports: the recovery authority, the environment authority, and the scope binding source. The only tunable value is `cleanupWaitMs`, the bound on the wait for the cleanup after a failed adoption (initial value 1000 ms). It can also take a `diagnose` sink. The integrator gives the resource ledger and the facility guard on each acquisition. The package needs no environment, reads no resources at run time, and does not access storage. The integrator ledger keeps the durable acquisition state and the adoption record. After a restart, a local query answers `unrecorded` for an old key; an original query still asks the provider of the original quota domain.

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/execution-environment test
```

In this directory, run `pnpm typecheck` for the type check. The eight test files hold 124 tests. See [tests/](tests/README.md); the SPEC [composition and verification](SPEC.md#组合与验证) section records the run. The tests use stub providers, a stub ledger, stub guards, and stub access ports. Evidence for persistence, cross-process consistency, and real resource stop is not in this package. A passing structure check does not prove behavior.

## Maintenance

- When the acquisition states, reject reasons, or facility protocol change in the contract, update the [architecture page](docs/architecture.md), the [flows page](docs/flows.md), and the tests.
- When one item of the SPEC gap list is fixed, update the SPEC, the [flows page](docs/flows.md), and the tests.
- When the factory signature or the ports change, update the [API page](docs/public-api.md) and the only group user, execution-environment-host-local.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Tables, access checks, acquisition, queries, gate, release, retirement, recovery, close, gaps
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Six modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-EER01 to F-EER06
├── object-model.md       Table entries, lease views, instance life
├── public-api.md         Export entries and definition index
├── context.md            Use through Cordis, independent use, position
└── cordis.md             Why Cordis integration does not apply
src/                      index.ts, registry.ts, access.ts, original.ts, lease-view.ts, recovery.ts, compare.ts
tests/                    Entry test and registry tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
