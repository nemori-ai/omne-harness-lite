# @omne-harness/request-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The mechanism member of Request Context. Variant: `module`.

## Responsibility and status

This package implements the pure operations of Request Context with a cache, precomputed derivations, and default strategies. The package exports one factory that does not depend on Cordis. The factory returns an instance that implements the pure operations of the contract. The package also implements the default compaction strategy, the default representation strategy, and the trimmer.

[request-context-contract](../request-context-contract/README.md) owns the public behavior. [request-context-cordis-contract](../request-context-cordis-contract/README.md) owns the registration face for prompt contributions. [request-context-cordis](../request-context-cordis/README.md) owns the Cordis binding and the strategy selection by configuration. This package holds no durable state. The cache and the derivations are in-process copies. A rebuild from the inputs does not change any result.

Status: mechanism member, `draft`. The adoption basis is the [member decomposition](../docs/architecture.md#成员分解) of the group and the [SPEC](SPEC.md).

- Implemented: nothing. `src/index.ts` holds only a template marker. The root entry exports nothing.
- Not implemented: the factory, the candidate cache, the derivations, the default strategies, the trimmer, and close.
- Not verified: none of the ten verification scenarios in the SPEC has a test. The default strategy values come from evidence about similar systems. They take effect as initial values only after a recheck against the metering of this project.
- The instance receives change notifications through `notify(change)`. A trimming step is always followed by a summary step. The instance learns that a candidate is fixed only from the input "adopted". See the [architecture page](docs/architecture.md) and the [API page](docs/public-api.md).

No package depends on this package now.

## Usage

The package has one entry: `@omne-harness/request-context`. A system that assembles Cordis does not import it directly. request-context-cordis selects the strategies by configuration and calls the factory. A caller without Cordis calls the factory directly. That caller supplies the five construction dependencies, collects prompt contributions, and stores plan progress itself. See the [usage page](docs/context.md#独立使用).

A caller that needs only the pure operations without a cache uses request-context-contract and does not need this package.

The implementation will fix the name and signature of the factory. No runnable example exists now.

## Contracts

- `src/` owns the public shapes. It is empty now. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns the local behavior: candidate cache, precomputed derivations, default strategies and trimmer, local rules, and close.
- The [request-context-contract SPEC](../request-context-contract/SPEC.md) owns the inputs, results, and failures of the pure operations, in clauses RQ-01 to RQ-11.
- The [object model](docs/object-model.md) owns identity and lifecycle of the internal objects.

The party that calls the factory owns the instance and closes it. After close, a new assembly returns unavailable. Close waits for in-flight assemblies to settle. Then it releases the cache. Close does not take back candidates, plans, or transitions that it gave out. If a construction dependency is absent or unavailable, the related operation returns unavailable with a diagnostic.

## Design

The factory has eight modules: candidate cache, derivations, assembly, plan and steps, default compaction strategy, default representation strategy, trimmer, and lifecycle. The only outside dependency is request-context-contract. The key mechanisms are:

- the revision digests of the seven input groups as the cache key
- invalidation by group, so that only the affected layers are computed again
- invalidation by change notifications, not by time or content hashes
- derivations computed when their inputs change, not when a request arrives
- prefix comparison only at the layer anchors
- default strategy values as initial configuration values only
- a trimmer that does not change the original records or the model view
- no plan progress kept in this package

The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the three mechanism flows. The [object model](docs/object-model.md) describes the internal objects.

## Configuration and operation

The factory accepts the trim threshold and the cache capacity. The default compaction strategy has the trigger line, the retention budget, the retention preference, trim-first, and the step bound. The default representation strategy has the preference order by modality. All default values are only initial configuration values. With Cordis, the plugin configuration of request-context-cordis supplies and checks these values. The package needs no environment, reads no resources at run time, and does not access storage. The coordinator stores plan progress, and the history holder stores history and compaction records.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context
```

In this directory, run `pnpm typecheck` for the type check. The current test checks only that the root entry exports nothing. See [tests/](tests/README.md). The [verification scenarios](SPEC.md#组合与验证) of the SPEC arrive with the implementation. The complexity scenario needs measurement, not only assertions. Persistence, joint commits, model sending, and end-to-end composition with a real coordinator and holder are outside this package. A passing structure check does not prove behavior.

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
