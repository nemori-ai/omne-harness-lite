# @omne-harness/request-context-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of Request Context. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the Request Context seam. The definition has five parts:

- the three service keys `requestContext`, `requestContextTrust`, and `contextAccountingInbox`
- the three abstract classes `RequestContextService`, `RequestContextTrustService`, and `ContextAccountingInboxService`
- the intercept configuration `{ scope }`
- the change event `request-context-cordis-contract/changed`
- the configuration shape that selects the compaction strategy and the representation strategy

The `requestContext` service carries one thing with a lifetime: the registration face for prompt contributions. The trust service and the accounting inbox service project original ports and add no lifetime of their own.

The package does not own domain behavior. [request-context-contract](../request-context-contract/README.md) owns the pure operations, the two kinds of prompt contribution, and the assembly rules. [request-context](../request-context/README.md) owns the cache, the precomputed derivations, and the default strategies. [request-context-cordis](../request-context-cordis/README.md) owns the Service implementation. The package knows only generic roles: contributor, caller, listener, and provider.

Status: Cordis definition member, `draft`. The adoption basis is the [prompt contribution registration section](../../../docs/architecture/runtime/request-context.md#提示词贡献登记面) and the [member and Cordis placement section](../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位) of the system page, and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: the three abstract Service classes with their derived keys, intercept and policy selection types, Context/Events augmentations, root type re-exports, and the `./testing` trust double and conformance suite.
- Verified locally: Cordis 4.0.4 object injection, ancestor scope, caller fiber effects, event filtering, and ctx.set behavior, plus hosted operation boundaries. See [tests](tests/README.md).
- Production registry, caching, cancellation and strategy implementations remain the provider's responsibility. Local probe providers are test fixtures.
- ScopeRef is reused from Runtime Context. Intercept scope declares placement and grants no access.

The packages request-context and request-context-cordis depend on this package. No application loads it directly.

## Usage

The package has three entries:

- The root entry `@omne-harness/request-context-cordis-contract` re-exports only contract types, and adds the type `RequestContextTrust`. It does not import Cordis.
- `@omne-harness/request-context-cordis-contract/cordis` holds the three service definitions.
- `@omne-harness/request-context-cordis-contract/testing` holds the scripted trust double and the trust conformance suite. It is not a production export.

A contributor plugin declares its scope and registers in its plugin body:

```text
import type {} from '@omne-harness/request-context-cordis-contract/cordis'
inject: { requestContext: { scope: <scope reference> } }
plugin body: dispose = ctx.requestContext.contributeSection(section)
```

Cordis removes the registration when the contributor plugin unloads. A source adapter registers the source set of one target with `register` or `replace`. The registration lives on the fiber of the adapter. A caller that assembles a request uses `inject: ['requestContext']`. It calls `assembly(target)` to get the operations that are bound to the configured strategies and to the source set registered for that target. At each call, those operations read the contributions of that scope from the registration surface. They replace the contributions that the fourth group reader gives. The [usage page](docs/context.md#使用方式) gives the use for each kind of dependent.

Independent use does not need this package. A caller without Cordis binds its own source set with `createAssemblyOperations` from the root entry of request-context-contract, or uses the factories of request-context.

## Contracts

- `src/` owns the public shapes. The public definitions are implemented.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 15.
- The [Cordis page](docs/cordis.md) owns the service definition, the intercept configuration, the event, the dependency classes, the registration and removal protocol, the strategy selection, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [request-context-contract SPEC](../request-context-contract/SPEC.md) owns the two contribution kinds, the refusal of per-request variables, and the inputs, results, and failures of the pure operations.

The package holds no resources. The fiber of the contributor plugin owns the life of a contribution registration. The fiber of the listener owns the life of an event listener. The provider owns service removal and the settlement of in-flight assemblies.

## Design

Each entry has one source entry file (`index.ts`, `cordis.ts`, `testing/index.ts`). The outside dependencies are the types of request-context-contract and `@deepseek-ai/cordis`. The package does not import the mechanism or the provider. Each of the three services has one key. The `requestContext` service holds only the registration face. The pure operations stay in the contract root entry. The event is an invalidation hint with a revision, not a source of facts. The strategy selection is configuration, not a service method. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the two mechanism flows. The [object model](docs/object-model.md) lists the three technical objects.

## Configuration and operation

The package has no plugin configuration of its own, needs no environment, and reads no resources at run time. The intercept configuration `{ scope }` is an assembly declaration of a contributor plugin. It is not configuration of this package. The package defines the shape of the strategy selection. The provider [request-context-cordis](../request-context-cordis/docs/cordis.md) checks that configuration and selects the implementations. The default strategy values belong to [request-context](../request-context/SPEC.md).

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context-cordis-contract
```

The `./testing` subpath ships `createScriptedRequestContextTrust` and `requestContextTrustConformance`. A provider member runs the suite with a fixture that hands in its registry factory; the suite imports no provider member. The root entry holds the type `RequestContextTrust` (derived from `ContextRegistryOptions` with `Pick`), and `./cordis` holds `RequestContextTrustService` (key `requestContextTrust`) and `ContextAccountingInboxService` (key `contextAccountingInbox`). The trust object is provided in a trusted subtree; omitting `inject` is not access control, and the member does not guarantee atomic ordering of a registration write against a remote revocation.

In this directory, run `pnpm typecheck` for the type check. Tests cover exports, real Cordis mechanisms, lifecycle, and hosted operation boundaries. See [tests/](tests/README.md). Local probe evidence does not replace production provider validation or promote shared basis state. A passing structure check does not prove behavior.

## Maintenance

- When the registration face types or `PromptContribution` change in the contract, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When the service key, the intercept configuration, the event, or the strategy selection shape changes, update the [Cordis page](docs/cordis.md) and the provider request-context-cordis.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 15
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Three entries, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RQD01 and F-RQD02
├── object-model.md       Three technical objects; domain objects in the contract
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definition, event, registration, strategies, IC map
src/                      index.ts, cordis.ts, trust.ts, testing/index.ts: type re-exports, abstract definitions, trust double and suite
tests/                    Entry, mechanism, boundary and trust tests; export inventory
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
