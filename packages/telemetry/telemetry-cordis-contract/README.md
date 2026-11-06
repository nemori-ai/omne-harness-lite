# @omne-harness/telemetry-cordis-contract

[中文](README_ZH.md)

The Cordis service definition of engineering telemetry: the abstract `TelemetryService`, its key `telemetryKey` (`telemetry`) and the `Context.telemetry` augmentation, at `./cordis`. The root entry exports no value. The pure contract is `@omne-harness/telemetry-contract`.

## Responsibility and status

This package owns the one Cordis seam of telemetry. A provider extends `TelemetryService` and implements `bind`. A consumer injects `telemetryKey`. The service authorizes nothing: the scope in a binding says whom a record belongs to, not what the caller may do.

Status: candidate, first version. The design basis is D02 of [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) ( three members, after the precedent of `model-contract` and `model-cordis-contract`). The RFC is not accepted yet, so every clause in [SPEC.md](SPEC.md) is a candidate. The pure contract and the Cordis definition are two members so that a domain member which depends on the pure contract has no Cordis in its production install closure; the Agent public entry test watches for that.

Named consumers: the Node provider `telemetry-node` extends `TelemetryService` in its `./cordis`. The application `apps/harness-server` injects `telemetryKey` in the `server-entry` row and provides it in the `telemetry` row.

This package does not own the port rules, the field rules, validation, carriers or the capturing double. They belong to `telemetry-contract`. It does not own any provider, runtime or outlet. They belong to `telemetry-node`.

## Usage

A provider extends the service and does not write the key again:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Binding, Emitter, TelemetryPort } from '@omne-harness/telemetry-contract'
import { TelemetryService } from '@omne-harness/telemetry-cordis-contract/cordis'

export function createTelemetryPlugin(port: TelemetryPort): new (ctx: Context) => TelemetryService {
  return class TelemetryPlugin extends TelemetryService {
    bind(binding: Binding): Emitter {
      return port.bind(binding)
    }
  }
}
```

A consumer injects the key and reads `ctx.telemetry`:

```ts
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'

export const consumer = {
  inject: [telemetryKey],
  apply(ctx: Context) {
    const emitter = ctx.telemetry.bind({ scope, component: 'probe', instance })
    emitter.event(definition, fields)
  },
}
```

Independent use is not a goal of this package: the root entry exports nothing, and `./cordis` needs `@deepseek-ai/cordis`. Installing this package brings in Cordis and `@omne-harness/telemetry-contract`. The package has no initialization and no disposal. A provider creates its resources in its own plugin context.

## Contracts

- Public types: [src/cordis.ts](src/cordis.ts), indexed by [docs/public-api.md](docs/public-api.md).
- Behavior beyond types: [SPEC.md](SPEC.md). It owns the key rule, the inject rule and the no-resource rule.
- Errors: the service throws nothing of its own. The behavior of `bind` and of the emitter is the port contract of `telemetry-contract` (TC-1: never throws).

## Design

One abstract `Service` subclass with one static field, and a `Context` augmentation. The design is in [docs/architecture.md](docs/architecture.md), [docs/object-model.md](docs/object-model.md) and [docs/flows.md](docs/flows.md).

## Configuration and operation

The package has no configuration and no environment requirement beyond Cordis 4.0.4 (catalog). Explicit dependencies: `@deepseek-ai/cordis` and `@omne-harness/telemetry-contract`.

## Verification

From the package directory:

```sh
pnpm run build
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

`tests/cordis-entry.spec.ts` uses a real Cordis `Context`: a subclass provides the key, a consumer injects it by the constant, and the key is absent after the provider is disposed. `tests/public-entry.spec.ts` reads the built `dist`: the root entry exports nothing and reaches no module; `./cordis` exports the two names and reaches Cordis. A real provider is not covered here. It belongs to `telemetry-node`.

## Maintenance

A change to `TelemetryService` or its key affects `telemetry-node`, `apps/harness-server` and every emitting row. The key is written once, in the static field. A new method on the service needs a matching member on `TelemetryPort` in `telemetry-contract` first. Do not add a value export to the root entry: the root stays free of Cordis (IC-4).

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
└── cordis.ts             The telemetry Service, key and Context augmentation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas (none)
verification/             models/ and proofs/ (none)
adr/                      Implementation decisions with continuing consumers (none)
examples/                 Examples against the public entry (none)
resources/                Non-source runtime resources (none)
acceptance/               Independent acceptance; fixtures/ holds its inputs (none)
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
