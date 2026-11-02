# @omne-harness/runtime-context-cordis

[中文](README_ZH.md)

The Service implementation member of Runtime Context. Variant: `service-provider`.

## Responsibility and status

This package puts the mechanism of [runtime-context](../runtime-context/README.md) into the service `runtimeContext` that [runtime-context-cordis-contract](../runtime-context-cordis-contract/README.md) defines. It owns the isolate binding, reading the consumer class, scope-filtered wake-up, the registration effect of producers, removal, and cleanup. [runtime-context-contract](../runtime-context-contract/README.md) owns domain behavior, and runtime-context owns mechanism behavior. Neither is in this package.

Status: Service implementation member, `draft`. The adoption basis is the [member and Cordis placement section](../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位) of the system page and the [SPEC](SPEC.md).

- Implemented: the concrete subclass `RuntimeContextProvider` and the plugin entry `createRuntimeContextPlugin` in `./cordis`. The provider injects `runtimeContextTrust`, stays pending while the key is absent, and hands `authority` and `bindings` to the runtime-context factory. It validates its configuration with a Standard Schema. It registers producer effects on the calling fiber and compares the intercept consumer class in `bind`. It dispatches scope-filtered wake-ups and closes the mechanism on unload. The root entry stays empty.
- Verified on Cordis 4.0.4: the whole `runtimeContextConformance` suite passes through the service. Member tests cover pending, configuration failure, duplicate load, producer unload, generation interleaving, a caller that unloads during registration, wake-up filtering, intercept mismatch, and unload with a read in flight.
- Not verified: the synchronous revocation source (gap kept in #677), persistence, cross-process consistency, and the end-to-end composition with real consumers and producers. The definition member's three mechanism readings are not registered in the shared basis yet.

No application loads this plugin now. The assembly row belongs to the application assembler.

The two Runtime Context contract members publish their types, checks, and Cordis service definition. Their package tests do not implement this member or prove production behavior.

## Usage

The package has two entries:

- `@omne-harness/runtime-context-cordis/cordis` holds the plugin. An application assembler adds one row for this plugin to the plugin tree and supplies the configuration.
- `@omne-harness/runtime-context-cordis` exports nothing. `./cordis` exports `RuntimeContextProvider` and `createRuntimeContextPlugin`. A caller without Cordis takes the mechanism factory from [runtime-context](../runtime-context/README.md).

Producers, scope holders, and readers do not import this package. They use the service through the service definition. The [usage page](docs/context.md#使用方式) shows the assembly row and the independent use.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 10.
- The [Cordis page](docs/cordis.md) owns the plugin, configuration, isolate, consumer class reading, registration, wake-up, and removal order.
- [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md) owns the service key, the abstract class, the intercept configuration, and the event.

The fiber of this plugin owns the service instance and the mechanism instance. When the plugin unloads, one effect calls `close()` of the mechanism. Close refuses new requests, ends the readers, cancels the waits in flight, waits within the settle bound for every operation in flight, and releases the tables. The fiber of the producer plugin owns a producer registration. The consumer plugin owns a bound reader. Removal does not take back change material that it gave out, or any outside effect.

## Design

`./cordis` has four parts: configuration, service subclass, wake-up dispatch, and removal. The outside dependencies are runtime-context-contract, runtime-context-cordis-contract, runtime-context, and `@deepseek-ai/cordis`. Removal runs in one effect. The mechanism instance lives only in constructor closures. The service reads the consumer class on each call. Wake-up uses a filtered `emit`. An absent storage port means a missing block. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the three mechanism flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

A Standard Schema checks the plugin configuration. The fields are the seven mechanism bounds and the diagnostics level. Every field may be omitted. Initial values are only configuration starting points. The runtime-context resolver decides the bounds. Unknown fields fail the load. If the configuration is not valid, the plugin does not load and the fiber goes to `FAILED`. One isolate label holds one copy of the plugin. A second load under the same label fails.

This stage has no durable storage port. The scope holder stores registrations and step commits outside the service. A `persisted` supplied block reads as missing until its producer publishes again. The package needs no other environment and reads no resources at run time.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-cordis
```

In this directory, build runtime-context and this package first (`pnpm build`), then run `pnpm test` and `pnpm typecheck`. The tests import the packages through `dist` and run on real Cordis 4.0.4. See [tests/](tests/README.md) and the [verification obligations](docs/cordis.md#验证义务). Persistence, cross-process consistency, and end-to-end composition are outside this package. A passing structure check does not prove behavior.

## Maintenance

- When the service definition changes, update the concrete subclass, the [Cordis page](docs/cordis.md), and the tests.
- When the mechanism factory or its configuration changes, update the configuration schema and the [API page](docs/public-api.md).
- When a storage port arrives, update property 5 of the SPEC and the Cordis page.
- Before a Cordis upgrade, run the basis probes that the service definition member lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 10
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RCP01 to F-RCP03
├── object-model.md       Service instance and plugin configuration
├── public-api.md         Export entries and definition index
├── context.md            Assembly, independent use, position
└── cordis.md             Plugin, configuration, isolate, wake-up, removal, IC map
src/                      Empty index.ts, and cordis.ts with the provider
tests/                    Conformance, lifecycle, and entry tests, fixtures/ is empty
schema/                   Empty, the configuration schema goes in src/
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
