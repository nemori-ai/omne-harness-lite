# @omne-harness/runtime-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The mechanism member of Runtime Context. Variant: `module`.

## Responsibility and status

This package implements the supply mechanism of Runtime Context. The mechanism has a registration table, a producer table, an eligibility table, need bindings, a current projection, an observation chain, eligibility checks, and translation. The package exports one factory that does not depend on Cordis. The factory returns a mechanism instance that implements the three operation faces of the contract.

[runtime-context-contract](../runtime-context-contract/README.md) owns the public behavior. [runtime-context-cordis](../runtime-context-cordis/README.md) owns the Cordis binding and the wake-up. This package holds no durable state. All five tables are in-process copies.

Status: mechanism member, `draft`. The adoption basis is the [member decomposition](../docs/architecture.md#成员分解) of the group and the [SPEC](SPEC.md).

- Implemented: nothing. `src/index.ts` holds only a template marker. The root entry exports nothing.
- Not implemented: the factory, the five tables, the observation chain, eligibility checks, translation, the change outlet, and close.
- Not verified: none of the ten verification scenarios in the SPEC has a test. The package makes no claim about persistence, cross-process consistency, or tenant isolation.

No package depends on this package now.

The two Runtime Context contract members publish their types, checks, and Cordis service definition. Their package tests do not implement this member or prove production behavior.

## Usage

The package has one entry: `@omne-harness/runtime-context`. A system that assembles Cordis does not import it directly. runtime-context-cordis calls the factory. A caller without Cordis calls the factory of this package directly. That caller wires disposal and wake-up itself. See the [usage page](docs/context.md#独立使用).

The implementation will fix the name and signature of the factory. No runnable example exists now.

## Contracts

- `src/` owns the public shapes. It is empty now. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the local behavior: tables and projection, local rules, close and rebuild.
- The [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) owns the inputs, results, and failures of the three faces, in clauses RC-01 to RC-08.
- The [object model](docs/object-model.md) owns identity and lifecycle of the internal objects.

The party that calls the factory owns the mechanism instance and closes it. Close first refuses new requests. Then it ends the readers, cancels in-flight calls, and waits within the timeout for in-flight reads to settle. Last, it releases the tables. Close does not take back change material that it gave out, or any outside effect.

## Design

The factory has seven modules: registration table, producer table, current projection, observation chain, eligibility table, read, and lifecycle. The only outside dependency is runtime-context-contract. The package has eight key mechanisms:

- holder commits applied in commit order
- producer identity, generation, and write sequence
- lookup along the scope chain
- a bounded observation chain with refetch
- eligibility checks and translation at read time
- step commits written only after commit
- the change outlet
- a fixed close order

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the five mechanism flows. The [object model](docs/object-model.md) describes the internal objects.

## Configuration and operation

The factory accepts the retention limit of the observation chain, the timeout for source calls and callbacks, and the change outlet callback. Default values are only initial configuration values. With Cordis, the plugin configuration of runtime-context-cordis supplies and checks the two configuration values. The package needs no environment, reads no resources at run time, and does not access storage. The scope holder stores registrations and step commits durably. Producers publish `persisted` supplied blocks again after a restart.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context
```

In this directory, run `pnpm typecheck` for the type check. The current test checks only that the root entry exports nothing. See [tests/](tests/README.md). The [verification scenarios](SPEC.md#组合与验证) of the SPEC arrive with the implementation. End-to-end evidence for persistence, cross-process consistency, and tenant isolation is outside this package. A passing structure check does not prove behavior.

## Maintenance

- When read results, cursor rules, or step commit rules change in the contract, update the [architecture page](docs/architecture.md), the [flows page](docs/flows.md), and the tests.
- When you add a configuration item, update the [API page](docs/public-api.md) and the configuration schema of runtime-context-cordis.
- When the factory signature changes, update runtime-context-cordis, the only user in the group.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Tables and projection, local rules, close and rebuild
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RCI01 to F-RCI05
├── object-model.md       Table entries, cursors, and instance lifecycle
├── public-api.md         Export entry and definition index
├── context.md            Use with Cordis, independent use, position
└── cordis.md             Why Cordis integration does not apply
src/                      Only index.ts, template marker only now
tests/                    Entry test, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
