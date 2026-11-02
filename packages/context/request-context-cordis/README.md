# @omne-harness/request-context-cordis

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation member of Request Context. Variant: `service-provider`.

## Responsibility and status

This package puts the mechanism of [request-context](../request-context/README.md) into the service `requestContext` that [request-context-cordis-contract](../request-context-cordis-contract/README.md) defines. It owns the contribution registry, the strategy selection by configuration, the configuration check failure, the isolate binding, and removal. [request-context-contract](../request-context-contract/README.md) owns domain behavior, and request-context owns mechanism behavior. Neither is in this package.

Status: Service implementation member, `draft`. The adoption basis is the [member and Cordis placement section](../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位) of the system page and the [SPEC](SPEC.md).

- Implemented: `src/cordis.ts` exports `RequestContextProvider`, the concrete subclass of `RequestContextService`. The plugin needs the trust key `requestContextTrust` and provides two keys, `requestContext` and `contextAccountingInbox`, from one fiber. It implements contribution registration, the change event, `register`, `replace`, and `assembly(target)`. Removal closes the source registry. The static `Config` checks the plugin options with a Standard Schema, and the plugin picks the compaction and the representation strategy by name from the serializable `selection` (property 4). Without a selection the default strategies run with their initial values. Trusted assembly code may pass ready strategy objects as `policies` instead. `policies` and `selection` exclude each other.
- Not implemented: the trim threshold and the cache capacity as plugin configuration (the selection shape of the contract has no field for them), the `notify('contributions', …)` path, the producers of the two blocks through a child fiber, and the duplicate-load check. `src/index.ts` still holds only a template marker, and the root entry exports nothing.
- Not verified: the definition member tests the intercept mechanism on Cordis 4.0.4. The reading is not registered in the shared basis yet. `tests/provider.spec.ts` checks the trust key, the one-fiber two-key lifetime, trust-gated registration, and the inbox. None of the ten verification obligations on the Cordis page has a test that covers it in full. The package makes no claim about persistence or cross-process consistency.
- A Cordis caller reaches the configured operations through `assembly(target)`. The operations borrow the source set that a source adapter registered for that target through `register`, and they read the contributions of that scope at each call. A target with no registered source set gets unavailable. The plugin gives only contribution-registry changes to the source registry instance through `notify('contributions', …)`. It subscribes to no other change. The producers of the two blocks depend on Runtime Context as an optional dependency through a child fiber. See the [Cordis page](docs/cordis.md#插件与服务).

No application loads this plugin now, and no package depends on this package.

## Usage

The package has two entries:

- `@omne-harness/request-context-cordis/cordis` holds the plugin. An application assembler adds one row for this plugin to the plugin tree and supplies the configuration.
- `@omne-harness/request-context-cordis` exports nothing. A caller without Cordis uses `createAssemblyOperations` from the request-context-contract root entry. The source registry factory is in [request-context](../request-context/README.md).

Contributors and callers that assemble requests do not import this package. They use the service through the service definition. The [usage page](docs/context.md#使用方式) shows the assembly row and the independent use. `examples/` is empty, so no runnable example exists now.

## Contracts

- `src/` owns the public shapes. `src/cordis.ts` exports `RequestContextProvider`, and `src/index.ts` exports nothing. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 9.
- The [Cordis page](docs/cordis.md) owns the plugin, the configuration and strategy selection, the isolate binding, the contribution registry, the change event dispatch, and the removal order.
- [request-context-cordis-contract](../request-context-cordis-contract/docs/cordis.md) owns the service key, the abstract class, the intercept configuration, the event, and the strategy selection shape.

The fiber of this plugin owns the service instance, the source registry instance, and the strategy instances. When the plugin unloads, removal runs in a fixed order:

1. Refuse new registrations and assemblies.
2. Cancel in-flight assemblies.
3. Discard the contribution registry and the cache, then call `close()` on the source registry and wait until every source set settles.

The fiber of the contributor plugin owns a contribution registration. Only the source registry instance holds the section rendering. Removal does not take back candidates, plans, or transitions that it gave out.

## Design

`./cordis` has five parts: configuration and strategy selection, service subclass, contribution registry, event dispatch, and removal. The outside dependencies are request-context-contract, request-context-cordis-contract, request-context, and `@deepseek-ai/cordis`. Removal runs in one effect. The service reads the scope on each call. A strategy selection failure fails the load and does not fall back. Registration and removal both notify the source registry instance. Source sets are registered per target. Runtime Context is an optional dependency. The package opens no fiber per request. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the three mechanism flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

A Standard Schema checks the plugin configuration. The configuration has these fields:

- the compaction strategy selection and its parameters
- the representation strategy selection and its preference order
- no field yet for the trim threshold and the cache capacity: the selection shape of the contract has none

Default values are only initial values, and request-context owns them. The plugin does not load when the configuration points to a strategy that does not exist. It also does not load when a parameter does not match the schema. In both cases the fiber goes to `FAILED`. The plugin does not fall back to the default strategy. One isolate label holds one copy of the plugin. A second load under the same label fails.

The package needs no environment, reads no resources at run time, and does not access storage. After a process failure, contributors register again.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context-cordis
```

In this directory, run `pnpm typecheck` for the type check. The current tests check that the root entry exports nothing, that `./cordis` exports only `RequestContextProvider`, the provider behavior listed above, and the configuration schema, the failed load on a bad configuration (on real Cordis 4.0.4), and the strategy selection. See [tests/](tests/README.md). The ten verification obligations on the Cordis page arrive with the remaining implementation. Some of them must run on real Cordis. See the [verification obligations](docs/cordis.md#验证义务). Persistence, cross-process consistency, and end-to-end composition are outside this package. A passing structure check does not prove behavior.

## Maintenance

- When the service definition changes, update the concrete subclass, the [Cordis page](docs/cordis.md), and the tests.
- When the factory, the default strategies, or the configuration of request-context change, update the configuration schema and the [API page](docs/public-api.md).
- Before a Cordis upgrade, run the basis probes that the service definition members list.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 9
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RQP01 to F-RQP03
├── object-model.md       Service instance, plugin configuration, contribution registry
├── public-api.md         Export entries and definition index
├── context.md            Assembly, independent use, position
└── cordis.md             Plugin, strategies, isolate, registry, event, removal, IC map
src/                      cordis.ts holds the provider, index.ts holds a template marker only
tests/                    Two entry tests and provider.spec.ts, fixtures/ is empty now
schema/                   Empty, the configuration schema goes in src/
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
