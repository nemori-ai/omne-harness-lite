# @omne-harness/runtime-context-cordis

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation member of Runtime Context. Variant: `service-provider`.

## Responsibility and status

This package puts the mechanism of [runtime-context](../runtime-context/README.md) into the service `runtimeContext` that [runtime-context-cordis-contract](../runtime-context-cordis-contract/README.md) defines. It owns the isolate binding, reading the consumer class, scope-filtered wake-up, the registration effect of producers, removal, and cleanup. [runtime-context-contract](../runtime-context-contract/README.md) owns domain behavior, and runtime-context owns mechanism behavior. Neither is in this package.

Status: Service implementation member, `draft`. The adoption basis is the [member and Cordis placement section](../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位) of the system page and the [SPEC](SPEC.md).

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` hold only template markers. Both entries export nothing.
- Not implemented: the concrete subclass, the plugin, the configuration schema, and the factory of the root entry.
- Not verified: properties 2, 3, and 4 of the SPEC depend on three mechanism readings that are not in the basis yet. They are assumptions now. None of the six verification obligations in the SPEC has a test. The package makes no claim about persistence or cross-process consistency.

No application loads this plugin now, and no package depends on this package.

## Usage

The package has two entries:

- `@omne-harness/runtime-context-cordis/cordis` holds the plugin. An application assembler adds one row for this plugin to the plugin tree and supplies the configuration.
- `@omne-harness/runtime-context-cordis` holds a factory that does not depend on Cordis. The factory returns the same implementation as the plugin.

Producers, scope holders, and readers do not import this package. They use the service through the service definition. The [usage page](docs/context.md#使用方式) shows the assembly row and the independent use. The plugin and the factory are not implemented, so no runnable example exists now.

## Contracts

- `src/` owns the public shapes. It is empty now. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 7.
- The [Cordis page](docs/cordis.md) owns the plugin, configuration, isolate, consumer class reading, registration, wake-up, and removal order.
- [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md) owns the service key, the abstract class, the intercept configuration, and the event.

The fiber of this plugin owns the service instance and the mechanism instance. When the plugin unloads, removal runs in a fixed order: refuse new requests, end the readers, wait for in-flight reads, and close the mechanism instance. The fiber of the producer plugin owns a producer registration. The consumer plugin owns a bound reader. Removal does not take back change material that it gave out, or any outside effect.

## Design

`./cordis` has four parts: configuration, service subclass, wake-up dispatch, and removal. The outside dependencies are runtime-context-contract, runtime-context-cordis-contract, runtime-context, and `@deepseek-ai/cordis`. Removal runs in one effect. The service reads the consumer class on each call. Wake-up uses a filtered `emit`. An absent storage port means a missing block. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the three mechanism flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

A Standard Schema checks the plugin configuration. The fields are the retention limit of the observation chain and the diagnostics level. Default values are only initial values. If the configuration is not valid, the plugin does not load and the fiber goes to `FAILED`. One isolate label holds one copy of the plugin. A second load under the same label fails.

This stage has no durable storage port. The scope holder stores registrations and step commits outside the service. A `persisted` supplied block reads as missing until its producer publishes again. The package needs no other environment and reads no resources at run time.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-cordis
```

In this directory, run `pnpm typecheck` for the type check. The two current tests check only that both entries export nothing. See [tests/](tests/README.md). The six verification obligations of the SPEC arrive with the implementation. Three of them must run on real Cordis. See the [verification obligations](docs/cordis.md#验证义务). Persistence, cross-process consistency, and end-to-end composition are outside this package. A passing structure check does not prove behavior.

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
SPEC.md                   Behavior beyond the types, properties 1 to 7
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, modules, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RCP01 to F-RCP03
├── object-model.md       Service instance and plugin configuration
├── public-api.md         Export entries and definition index
├── context.md            Assembly, independent use, position
└── cordis.md             Plugin, configuration, isolate, wake-up, removal, IC map
src/                      index.ts and cordis.ts, template markers only now
tests/                    Two entry tests, fixtures/ is empty now
schema/                   Empty, the configuration schema goes in src/
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
