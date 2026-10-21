# @omne-harness/request-context-cordis-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Cordis definition member of Request Context. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the Request Context seam. The definition has five parts:

- the service key `requestContext`
- the abstract class `RequestContextService`
- the intercept configuration `{ scope }`
- the change event `request-context-cordis-contract/changed`
- the configuration shape that selects the compaction strategy and the representation strategy

The service carries one thing with a lifetime: the registration face for prompt contributions.

The package does not own domain behavior. [request-context-contract](../request-context-contract/README.md) owns the pure operations, the two kinds of prompt contribution, and the assembly rules. [request-context](../request-context/README.md) owns the cache, the precomputed derivations, and the default strategies. [request-context-cordis](../request-context-cordis/README.md) owns the Service implementation. The package knows only generic roles: contributor, caller, listener, and provider.

Status: Cordis definition member, `draft`. The adoption basis is the [prompt contribution registration section](../../../docs/architecture/runtime/request-context.md#提示词贡献登记面) and the [member and Cordis placement section](../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位) of the system page, and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` hold only template markers. Both entries export nothing.
- Not implemented: the abstract class, the key constant, the intercept configuration type, the strategy selection shape, the `Context` and `Events` augmentations, and the type re-exports of the root entry.
- Not verified: one Cordis mechanism reading is not in the basis yet. Thus property 7 of the SPEC is an assumption. See the [Cordis page](docs/cordis.md#机制读数与假设).
- A Cordis caller uses `assembly(scope)` to reach the cached implementation with the selected strategies. A contributor declares the global layer with `scope: null`. Open items: the SPEC does not name the source of `ScopeRef` or the side that filters the event by scope. See the [Cordis page](docs/cordis.md).

No package depends on this package now.

## Usage

The package has two entries:

- The root entry `@omne-harness/request-context-cordis-contract` re-exports only contract types. It does not import Cordis.
- `@omne-harness/request-context-cordis-contract/cordis` holds the service definition.

After the implementation arrives, a contributor plugin declares its scope and registers in its plugin body:

```text
import type {} from '@omne-harness/request-context-cordis-contract/cordis'
inject: { requestContext: { scope: <scope reference> } }
plugin body: dispose = ctx.requestContext.contributeSection(section)
```

Cordis removes the registration when the contributor plugin unloads. A caller that assembles a request uses `inject: ['requestContext']` and calls `contributions(scope)`. It calls `assembly(scope)` to get the pure operations that are bound to the configured strategies and the registration surface. Then it passes the contributions to those operations. The [usage page](docs/context.md#使用方式) gives the use for each kind of dependent.

Independent use does not need this package. A caller without Cordis collects prompt contributions itself and uses the root entries of request-context-contract and request-context.

## Contracts

- `src/` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 10.
- The [Cordis page](docs/cordis.md) owns the service definition, the intercept configuration, the event, the dependency classes, the registration and removal protocol, the strategy selection, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [request-context-contract SPEC](../request-context-contract/SPEC.md) owns the two contribution kinds, the refusal of per-request variables, and the inputs, results, and failures of the pure operations.

The package holds no resources. The fiber of the contributor plugin owns the life of a contribution registration. The fiber of the listener owns the life of an event listener. The provider owns service removal and the settlement of in-flight assemblies.

## Design

Each entry has one source file. The outside dependencies are the types of request-context-contract and `@deepseek-ai/cordis`. The package does not import the mechanism or the provider. The service has one key and holds only the registration face. The pure operations stay in the contract root entry. The event is an invalidation hint with a revision, not a source of facts. The strategy selection is configuration, not a service method. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the two mechanism flows. The [object model](docs/object-model.md) lists the three technical objects.

## Configuration and operation

The package has no plugin configuration of its own, needs no environment, and reads no resources at run time. The intercept configuration `{ scope }` is an assembly declaration of a contributor plugin. It is not configuration of this package. The package defines the shape of the strategy selection. The provider [request-context-cordis](../request-context-cordis/docs/cordis.md) checks that configuration and selects the implementations. The default strategy values belong to [request-context](../request-context/SPEC.md).

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context-cordis-contract
```

In this directory, run `pnpm typecheck` for the type check. The two current tests check only that both entries export nothing. See [tests/](tests/README.md). The mechanism property needs a basis probe first. Then the provider tests check the registration behavior. A passing structure check does not prove behavior.

## Maintenance

- When the registration face types or `PromptContribution` change in the contract, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When the service key, the intercept configuration, the event, or the strategy selection shape changes, update the [Cordis page](docs/cordis.md) and the provider request-context-cordis.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 10
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RQD01 and F-RQD02
├── object-model.md       Three technical objects; domain objects in the contract
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definition, event, registration, strategies, IC map
src/                      index.ts and cordis.ts, template markers only now
tests/                    Two entry tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
