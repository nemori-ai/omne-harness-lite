# @omne-harness/runtime-context

[中文](README_ZH.md)

The mechanism member of Runtime Context. Variant: `module`.

## Responsibility and status

This package implements the supply mechanism of Runtime Context. The mechanism has a scope table, a registration table, a producer table, an eligibility table, a current projection, cursors, recovery sessions, and a read cache. The package exports one factory, `createRuntimeContext`, that does not depend on Cordis. The factory returns a mechanism instance that implements the three operation faces of the contract and `close`.

[runtime-context-contract](../runtime-context-contract/README.md) owns the public behavior. [runtime-context-cordis](../runtime-context-cordis/README.md) owns the Cordis binding and the wake-up. This package holds no durable state. All tables are in-process copies.

Status: mechanism member, `draft`. The adoption basis is the [member decomposition](../docs/architecture.md#成员分解) of the group and the [SPEC](SPEC.md).

- Implemented: the factory and the eight operations. The checks use the two authority ports. Producer slots are per tenant and key. The package also implements scope end, recovery sessions with refresh marks, the read cache, the change outlet, the diagnostic outlet, and the five-step close.
- Verified: the whole `runtimeContextConformance` suite passes against the mechanism. Member tests cover cross-tenant refusal, the read cache, close with operations in flight, restored supply limits, absent checkpoint values, diagnostics, and the caller declaration of `bind`.
- Not verified: persistence, cross-process consistency, power-loss durability, and the end-to-end composition with real holders and producers. No formal model exists for the recovery and generation protocol.

[runtime-context-cordis](../runtime-context-cordis/README.md) depends on this package.

The two Runtime Context contract members publish their types, checks, and Cordis service definition. Their package tests do not implement this member or prove production behavior.

## Usage

The package has one entry: `@omne-harness/runtime-context`. A system that assembles Cordis does not import it directly. runtime-context-cordis calls the factory. A caller without Cordis calls the factory of this package directly. That caller wires disposal and wake-up itself. See the [usage page](docs/context.md#独立使用).

The [API page](docs/public-api.md) lists the exports. The usage page shows the call order of the factory, the recovery session, the producer, and the reader.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the local behavior: tables and projection, local rules, the read cache, recovery, close and rebuild.
- The [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) owns the inputs, results, and failures of the three faces, in clauses RC-01 to RC-09.
- The [object model](docs/object-model.md) owns identity and lifecycle of the internal objects.

The party that calls the factory owns the mechanism instance and closes it. Close first refuses new requests. Then it ends the readers and cancels the waits in flight. It waits within the settle bound for every operation in flight. Last, it releases the tables. An operation in flight answers `closed`, not success. Close does not take back change material that it gave out, or any outside effect.

## Design

The source has eight modules: configuration, shared state, producer face, holder face, recovery session, reader face, read cache, and diagnostics. The outside dependencies are runtime-context-contract and legal-identity. The key mechanisms are:

- the two authority ports, `current()`, and waits that close cancels
- holder commits applied in commit order
- producer slots per tenant and key, generations, and supply sequences
- one declaration catalog, checked across tenants
- recovery sessions with refresh marks, and restored supply that is joined and limited
- the read cache behind every access check, keyed on the projection version
- the change outlet and the diagnostic outlet
- a fixed close order

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the five mechanism flows. The [object model](docs/object-model.md) describes the internal objects.

## Configuration and operation

The factory accepts the trust object, seven bounds, the change outlet, and the diagnostic outlet. The bounds are `retention`, `replayCapacity`, `supplyBoundMs`, `settleBoundMs`, `readCacheEntries`, `refreshConcurrency`, and `refreshRetryMs`. The initial values are only configuration starting points. An illegal bound throws `RangeError`. With Cordis, the plugin configuration of runtime-context-cordis supplies the bounds and checks them through the same resolver. The package needs no environment, reads no resources at run time, and does not access storage. The scope holder stores registrations and step commits durably. Producers publish `persisted` supplied blocks again after a restart.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context
```

In this directory, run `pnpm build` first, then `pnpm test` and `pnpm typecheck`. The tests import the package through `dist`. See [tests/](tests/README.md) and the [verification scenarios](SPEC.md#组合与验证) of the SPEC. End-to-end evidence for persistence, cross-process consistency, and tenant isolation is outside this package. A passing structure check does not prove behavior.

## Maintenance

- When read results, cursor rules, recovery rules, or step commit rules change in the contract, update the [architecture page](docs/architecture.md), the [flows page](docs/flows.md), and the tests.
- When you add a configuration item, update `src/config.ts`, the [API page](docs/public-api.md), and the configuration schema of runtime-context-cordis.
- When you add state that changes a filtered read, advance the projection version or bypass the read cache, and add a test.
- When the factory signature changes, update runtime-context-cordis, the only user in the group.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Tables, local rules, read cache, recovery, close
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RCI01 to F-RCI05
├── object-model.md       Entries, sessions, cache entries, lifecycle
├── public-api.md         Export entry and definition index
├── context.md            Use with Cordis, independent use, position
└── cordis.md             Why Cordis integration does not apply
src/                      The factory and its eight modules
tests/                    Conformance and member tests, fixtures/ is empty
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
