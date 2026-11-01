# @omne-harness/session-cordis

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation member of Session. Variant: `service-provider`.

## Responsibility and status

This package puts the mechanism of [session](../session/README.md) into the service `session` that [session-cordis-contract](../session-cordis-contract/README.md) defines. It gets the ports, checks the configuration, and checks the caller class. It sends and receives the commit notice and binds one recovery scanner for each tenant. It also handles removal and provider change. [session-contract](../session-contract/README.md) owns domain behavior. session owns mechanism behavior. [session-adapters](../session-adapters/README.md) and the storage provider own the port implementations. None of them is in this package.

Status: Service implementation member, `draft`. The adoption basis is the [Cordis placement section](../docs/architecture.md#cordis-落位) of the group architecture and the [SPEC](SPEC.md). The SPEC is a candidate design. Technical acceptance has not happened for it.

- Implemented: the plugin `SessionProvider` at `./cordis`. It is the concrete subclass of `SessionService`. It has the configuration schema, the port wiring, the caller class check, the combined notifier, the scanner binding, and the two removal triggers. The root entry stays empty. The SPEC section [实现现状](SPEC.md#实现现状) lists the details and the limits.
- Open gaps: the intake slots, the source change notices, and the tenant set have no channel yet. The assembly lifecycle has no formal definition, so the plugin uses the private key of the assembly entry (a deviation from IC-8). The [SPEC](SPEC.md#明确缺项) lists each gap and the behavior before it closes.
- Verified: on real Cordis 4.0.4, the nine verification obligations of the SPEC have tests. The four mechanism facts that were assumptions are now tested: the caller class lookup, the failure of a second load, `FAILED` on a bad configuration, and the order of old and new instances after a provider change. Checkpoint CP1 runs the plugin with session-storage-sql on the real sqlite-provider. The package makes no claim about one scanner per tenant across processes.
- Known defect, not of this package: the history read of session-storage-sql has no `LIMIT`, so the commit notice on the real store has no entry kinds. A test pins it.

No application loads this plugin yet, and no package depends on this package.

## Usage

The package has two entries:

- `@omne-harness/session-cordis/cordis` holds the plugin. An application assembler adds one row for this plugin to the plugin tree and supplies the configuration. The assembler also loads the providers of the transaction port and the other ports.
- `@omne-harness/session-cordis` exports nothing. A host without Cordis takes the factory `createSessionInstance` from [session](../session/README.md).

Caller plugins, port providers, and listeners do not import this package. They use the service through the service definition. The [usage page](docs/context.md#使用方式) shows the assembly row and the independent use. The runnable use of the plugin is in the tests, for example [assembly.ts](tests/fixtures/assembly.ts).

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 11. It also holds the port wiring table, the known gaps, and the verification obligations.
- The [Cordis page](docs/cordis.md) owns the plugin, `inject`, configuration, the caller class check, the notice, the scanner binding, and the removal order.
- [session-cordis-contract](../session-cordis-contract/docs/cordis.md) owns the service key, the abstract class, the caller classes, the port service keys, and the event.

The fiber of this plugin owns the service instance and its `SessionInstance`. When the plugin unloads, removal runs in a fixed order. It refuses new face calls, releases the scanner of each tenant, and then waits for the instance to stop, up to a time limit. Removal does not roll back committed facts, does not send outbound calls again, and does not take back outside effects.

## Design

`./cordis` has six parts: configuration, port wiring, service subclass, notice, scanner binding, and removal. The outside dependencies are session-contract, session-cordis-contract, session, legal-identity, operation-result, and `@deepseek-ai/cordis`. Five keys are in `inject`: the access check `sessionAccessCheck`, the trusted delegated transactions `sessionDelegatedTransactions`, the internal principals `sessionPrincipals`, the trusted work principals `sessionWorkPrincipals`, and the assembly lifecycle `assemblyLifecycle`. The public transaction port `sessionTransactions` is not in `inject`. The plugin gets it at each call, only for `pending`, `references` and `releasedScopes`. The plugin gets each other port at each call, through its own Context. This package sends the commit notice. The plugin binds a scanner when it first sees a tenant in a notice. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the four lifecycle flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

A Standard Schema checks the plugin configuration. The fields are `policy`, which overrides fields of the scheduling policy one by one, `disposeWaitMs`, the time limit for removal, and `admission`, the declaration for admission slots. `admission` is either omitted or `'none'`. A policy field that the configuration omits takes the initial value from session. Default values are only initial values. If the configuration is not valid, the plugin does not load and the fiber goes to `FAILED`. If any of the five `inject` keys is absent, the fiber stays `PENDING`. Each face operation calls the access check once, at its start.

Each tenant has one recovery scanner at a time. In the first version, a single instance in the assembly keeps this guarantee. Load one copy of this plugin across all processes. Do not load one copy under each of two isolate labels. Tenants, principals, and callbacks are not configuration. The package reads no resources and reaches storage only through the transaction port.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-cordis
```

In this directory, run `pnpm typecheck` for the type check. The tests run on real Cordis 4.0.4 and cover the nine verification obligations of the SPEC. See [tests/](tests/README.md) and the [verification obligations](docs/cordis.md#验证义务). One scanner per tenant across processes, real identity and authorization, and end-to-end composition with the other neighbors are outside this package. A passing structure check does not prove behavior.

## Maintenance

- When the service definition changes, update the concrete subclass, the port wiring, the [Cordis page](docs/cordis.md), and the tests.
- When the factory, the dependency classes, or the scheduling policy of session change, update the configuration schema, the port wiring, and the [API page](docs/public-api.md).
- The service definition member can add a key for the intake slots or the change notices. When it does, update the known gaps in the SPEC and the Cordis page.
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
src/                      index.ts (empty) and cordis.ts, with the files of the plugin
tests/                    Entry tests, plugin tests, CP1, and fixtures/ with the assembly code
schema/                   Empty, the configuration schema goes in src/
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
