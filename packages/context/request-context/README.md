# @omne-harness/request-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The mechanism member of Request Context. Variant: `module`.

## Responsibility and status

This package implements the two stateful mechanisms of Request Context: the source registry and the account projection. It exports two factories that do not depend on Cordis. The default compaction strategy, the default representation strategy, the trimmer, and the absent conversion result reader also belong here, and they are implemented as plain constructors. The candidate cache and the precomputed derivations also belong here. They are not implemented yet.

[request-context-contract](../request-context-contract/README.md) owns the public behavior. [request-context-cordis-contract](../request-context-cordis-contract/README.md) owns the registration face for prompt contributions. [request-context-cordis](../request-context-cordis/README.md) owns the Cordis binding and the strategy selection by configuration. This package holds no durable state. The registry, the account index, and the cache are in-process state. The account index is rebuilt, with authorization, from the log of the result receiver.

Status: mechanism member, `draft`. The adoption basis is the [member decomposition](../docs/architecture.md#成员分解) of the group and the [SPEC](SPEC.md).

- Implemented: `createContextSourceRegistry` (register, replace, withdraw and settle, borrows, the publication check, close) and `createContextAccounting` (the fixed check order of the inbox, idempotency and capacity, target eviction (CX-11: the least recently used ready target without an operation in flight leaves when a new target needs a slot), the four window usage states, staged rebuild with system recovery access).
- Verified: in-process tests of the registry and the account projection. The `assembly(target)` of the registry runs every case of the operation conformance suite of the contract. See [tests/](tests/README.md).
- Implemented (constructors): `createDefaultCompactionPolicy` (with the trimmer and the summary instruction), `createDefaultRepresentationPolicy`, `createAbsentConversionResults`, and the initial values of their configuration.
- Not implemented: the candidate cache and `notify`, and the precomputed derivations.
- Verified in this member: the default values, retention that never splits a call from its result, trimming, the representation preference, a fixed request accepted by the Model request preparation double, and `lineage.continues` in round 2. See [tests/](tests/README.md).
- Not verified: the SPEC scenarios for the cache, the derivations, and complexity arrive with their implementation. A real Model preparation resource is checked in the integration. The default strategy values come from evidence about similar systems. They take effect as initial values only after a recheck against the metering of this project. See the [architecture page](docs/architecture.md) and the [API page](docs/public-api.md).

No package depends on this package now. The owner of request-context-cordis migrates its service.

## Usage

The package has one entry: `@omne-harness/request-context`. A system that assembles Cordis does not import it directly. request-context-cordis selects the strategies by configuration and calls the factory. A source adapter registers the source set of one target with `register`: the seven group readers, the narrow adopted source, the history source, the conversion results, the read eligibility, and the Model preparation resources. A caller gets the operation group with `assembly(target)`. A caller without Cordis that wants hosted registration calls the factories of this package directly. See the [usage page](docs/context.md#独立使用).

A caller that needs only a standalone operation group uses `createAssemblyOperations` from the root entry of request-context-contract and does not need this package. No runnable example exists now. See [tests/](tests/README.md) for usage.

## Contracts

- `src/` owns the public shapes: the two factories. request-context-contract owns the types of their parameters and results. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the local behavior: the source registry, the account projection, the candidate cache, precomputed derivations, default strategies and trimmer, local rules, and close.
- The [request-context-contract SPEC](../request-context-contract/SPEC.md) owns the operation group, the source set, the account protocol, results, and failures, in clauses RQ-01 to RQ-15.
- The [object model](docs/object-model.md) owns identity and lifecycle of the internal objects.

The party that calls a factory owns the instance. `close()` of the registry refuses new registrations and borrows and waits until every generation settles. Close does not cancel operations in flight and does not take back candidates, plans, or transitions that it gave out. Dropping an account projection does not clean the original log. If a dependency port is absent or unavailable, the related operation returns unavailable with a diagnostic.

## Design

The implemented modules are the source registry, the account projection, and three stateless constructors: the default compaction strategy (with the trimmer), the default representation strategy, and the absent conversion result reader. The planned modules are the candidate cache and the derivations. The outside run-time dependencies are request-context-contract, model-contract (types), content-block, message, call-account, and legal-identity. The key mechanisms are:

- a cache key equal to `PreparedInputKey` (RQ-13): the source generation, the group-one identity, the six group tokens, and the adopted derivation rules
- invalidation by group, so that only the affected layers are computed again
- invalidation by change notifications, not by time or content hashes
- derivations computed when their inputs change, not when a request arrives
- prefix comparison only at the layer anchors
- default strategy values as initial configuration values only
- a trimmer that does not change the original records or the model view
- no plan progress kept in this package

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the three mechanism flows. The [object model](docs/object-model.md) describes the internal objects.

## Configuration and operation

The default compaction constructor accepts the trim threshold (bytes, initial value 65536). The cache capacity gets a field when the cache exists. The default compaction strategy has the trigger line, the retention budget, the retention preference, trim-first, and the step bound. The default representation strategy has the preference order by modality. All default values are only initial configuration values. With Cordis, the plugin configuration of request-context-cordis supplies and checks these values. The package needs no environment, reads no resources at run time, and does not access storage. The coordinator stores plan progress, and the history holder stores history and compaction records.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context
```

In this directory, run `pnpm typecheck` for the type check. The current tests cover the root entry, the registry, the account projection, the default strategies and the trimmer, the conversion result reader, and the default strategies in a real operation group. See [tests/](tests/README.md). The other [verification scenarios](SPEC.md#组合与验证) of the SPEC arrive with their implementation. The complexity scenario needs measurement, not only assertions. Persistence, joint commits, model sending, and end-to-end composition with a real coordinator and holder are outside this package. A passing structure check does not prove behavior.

## Maintenance

- When the input groups, the six-layer layout, or the prefix change reasons change in the contract, update the [architecture page](docs/architecture.md), the [flows page](docs/flows.md), and the tests.
- When you add a configuration item or change a default value, update the SPEC, the [API page](docs/public-api.md), and the configuration schema of request-context-cordis.
- When the factory signature changes, update request-context-cordis, the only user in the group.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Cache, derivations, default strategies, local rules, close
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RQI01 to F-RQI03
├── object-model.md       Cache entries, derivations, strategy instances, lifecycle
├── public-api.md         Export entry and definition index
├── context.md            Use with Cordis, independent use, position
└── cordis.md             Why Cordis integration does not apply
src/                      index.ts, registry.ts, and accounting.ts
tests/                    Entry, registry, and account projection tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
