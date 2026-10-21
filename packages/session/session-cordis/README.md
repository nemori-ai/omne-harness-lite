# @omne-harness/session-cordis

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation member of Session. Variant: `service-provider`.

## Responsibility and status

This package puts the mechanism of [session](../session/README.md) into the service `session` that [session-cordis-contract](../session-cordis-contract/README.md) defines. It gets the ports, checks the configuration, and checks the caller class. It sends and receives the commit notice and binds one recovery scanner for each tenant. It also handles removal and provider change. [session-contract](../session-contract/README.md) owns domain behavior. session owns mechanism behavior. [session-adapters](../session-adapters/README.md) and the storage provider own the port implementations. None of them is in this package.

Status: Service implementation member, `draft`. The adoption basis is the [Cordis placement section](../docs/architecture.md#cordis-落位) of the group architecture and the [SPEC](SPEC.md). The SPEC is a candidate design. Technical acceptance has not happened for it.

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` hold only template markers. Both entries export nothing.
- Not implemented: the concrete subclass (which is also the plugin), the configuration schema, the port wiring, the combined notifier, the scanner binding, and removal. The root entry stays empty.
- Open gaps: the intake slots, the source change notices, and the tenant set have no channel yet. The internal principals arrive through the service key `sessionPrincipals`. The [SPEC](SPEC.md#明确缺项) lists each gap and the behavior before it closes.
- Not verified: four mechanism facts have only a source reading or no reading. They are the caller class lookup, the failure of a second load, and `FAILED` on a bad configuration. The fourth is the order of old and new instances after a provider change. They are assumptions now. None of the verification obligations in the SPEC has a test. The package makes no claim about one scanner per tenant across processes.

No application loads this plugin now, and no package depends on this package.

## Usage

The package has two entries:

- `@omne-harness/session-cordis/cordis` holds the plugin. An application assembler adds one row for this plugin to the plugin tree and supplies the configuration. The assembler also loads the providers of the transaction port and the other ports.
- `@omne-harness/session-cordis` exports nothing. A host without Cordis takes the factory `createSessionInstance` from [session](../session/README.md).

Caller plugins, port providers, and listeners do not import this package. They use the service through the service definition. The [usage page](docs/context.md#使用方式) shows the assembly row and the independent use. The plugin is not implemented, so no runnable example exists now.

## Contracts

- `src/` owns the public shapes. It is empty now. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 11. It also holds the port wiring table, the known gaps, and the verification obligations.
- The [Cordis page](docs/cordis.md) owns the plugin, `inject`, configuration, the caller class check, the notice, the scanner binding, and the removal order.
- [session-cordis-contract](../session-cordis-contract/docs/cordis.md) owns the service key, the abstract class, the caller classes, the port service keys, and the event.

The fiber of this plugin owns the service instance and its `SessionInstance`. When the plugin unloads, removal runs in a fixed order. It refuses new face calls, releases the scanner of each tenant, and then waits for the instance to stop, up to a time limit. Removal does not roll back committed facts, does not send outbound calls again, and does not take back outside effects.

## Design

`./cordis` has six parts: configuration, port wiring, service subclass, notice, scanner binding, and removal. The outside dependencies are session-contract, session-cordis-contract, session, and `@deepseek-ai/cordis`. Only the transaction port is in `inject`. The plugin gets each other port at each call, through its own Context. This package sends the commit notice. The plugin binds a scanner when it first sees a tenant in a notice. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the four lifecycle flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

A Standard Schema checks the plugin configuration. The fields are `policy`, which overrides fields of the scheduling policy one by one, and `disposeWaitMs`, the time limit for removal. A policy field that the configuration omits takes the initial value from session. Default values are only initial values. If the configuration is not valid, the plugin does not load and the fiber goes to `FAILED`. If the transaction port is absent, the fiber stays `PENDING`.

Each tenant has one recovery scanner at a time. In the first version, a single instance in the assembly keeps this guarantee. Load one copy of this plugin across all processes. Do not load one copy under each of two isolate labels. Tenants, principals, and callbacks are not configuration. The package reads no resources and reaches storage only through the transaction port.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-cordis
```

In this directory, run `pnpm typecheck` for the type check. The two current tests check only that both entries export nothing. See [tests/](tests/README.md). The nine verification obligations of the SPEC arrive with the implementation and run on real Cordis 4.0.4. See the [verification obligations](docs/cordis.md#验证义务). One scanner per tenant across processes, persistence, and end-to-end composition with real neighbors are outside this package. A passing structure check does not prove behavior.

## Maintenance

- When the service definition changes, update the concrete subclass, the port wiring, the [Cordis page](docs/cordis.md), and the tests.
- When the factory, the dependency classes, or the scheduling policy of session change, update the configuration schema, the port wiring, and the [API page](docs/public-api.md).
- The service definition member can add a key for the internal principals, the intake slots, or the change notices. When it does, update the known gaps in the SPEC and the Cordis page.
- Before a Cordis upgrade, run the basis probes that the service definition member and this package list.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types: properties 1 to 11, port wiring, gaps, verification
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, modules, dependencies, mechanisms and reasons, SOLID
├── flows.md              Lifecycle flows FC-01 to FC-04
├── object-model.md       Service instance, configuration, port wiring, notifier, tenant table
├── public-api.md         Export entries and definition index
├── context.md            Assembly, independent use, position
└── cordis.md             Plugin, inject, configuration, notice, scanner, removal, IC map
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
