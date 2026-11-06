# @omne-harness/telemetry-contract

[中文](README_ZH.md)

The pure contract of engineering telemetry: scope binding, declarative definitions, field and binding validation, carrier encoding, admission results and the close report shape. It also holds a bounded capturing double. The Cordis service definition `telemetry` is the member `@omne-harness/telemetry-cordis-contract`, so that this package installs without Cordis.

## Responsibility and status

This package owns the shapes and rules that every telemetry provider and every emitting domain share. This package holds the one copy of the rules. A provider calls `validateFields` and `validateBinding`. It does not write its own copy of the rules.

Status: candidate, first version. The design basis is line B of [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md). The RFC is not accepted yet, so every clause in [SPEC.md](SPEC.md) is a candidate. The root entry and `./testing` have implementations and tests. `health()` is deferred with OTel and is not in the first version. `Carrier`, `defineMetric` and `Emitter.record` are reserved: they have shapes, validation and tests, but no consumer in the first version. They stay for the deferred OTel traces and metrics.

Named consumers: the Cordis definition member `telemetry-cordis-contract` implements `TelemetryPort` on its abstract service. The Node provider `telemetry-node` validates with the functions of this package. The application `apps/harness-server` declares the entry diagnostic event. The telemetry facades of Session and Agent use the definitions and the port of this package.

This package does not own output formats, queues, sampling, budgets, SDKs or back ends. They belong to the provider.

## Usage

Declare definitions in the emitting domain. Bind an emitter with a scope that `@omne-harness/legal-identity` minted:

```ts
import { tenantScope, type TenantId } from '@omne-harness/legal-identity'
import { defineEvent, type TelemetryPort } from '@omne-harness/telemetry-contract'

const stepFailed = defineEvent({
  owner: 'packages/session/session',
  name: 'omne.session.step.failed',
  version: 1,
  level: 'error',
  schema: {
    code: { kind: 'enum', values: ['timeout', 'refused'] },
    step: { kind: 'ref', owner: 'packages/session/session', maxBytes: 64, optional: true },
  },
})

function report(port: TelemetryPort, tenant: TenantId): void {
  const emitter = port.bind({
    scope: tenantScope(tenant),
    component: 'session',
    instance: { owner: 'apps/harness-server', ref: 'process-1' },
  })
  emitter.event(stepFailed, { code: 'timeout' })
}
```

A field rule with `optional: true` may be absent. A present field is checked as usual.

Independent use needs the root entry only. It depends on `@omne-harness/legal-identity` and on nothing else at run time. The production install closure of this package has no Cordis. Cordis integration imports `TelemetryService` and `telemetryKey` from `@omne-harness/telemetry-cordis-contract/cordis`. Tests of emitting domains use `createCapturingTelemetry` from `./testing`.

The package has no initialization and no disposal. Emitters are immutable values.

## Contracts

- Public types and run-time validation: [src/index.ts](src/index.ts), indexed by [docs/public-api.md](docs/public-api.md).
- Behavior beyond types: [SPEC.md](SPEC.md). It owns the no-throw rule, the field rules, the optional field rule, the scope rule, the carrier format, the structural limits and the close report boundaries.
- Errors: `define*` and `encodeCarrier` throw `TypeError` for invalid input. Port operations and validators never throw. They answer `dropped(invalid)` or `invalid`.

## Design

The root entry has five pure modules: limits, definitions, fields, binding and carrier, with the port types. `./testing` holds the capturing double. The design is in [docs/architecture.md](docs/architecture.md), [docs/object-model.md](docs/object-model.md) and [docs/flows.md](docs/flows.md).

## Configuration and operation

The package has no configuration. `TELEMETRY_LIMITS` holds structural limits of the contract, not run-time budgets. Budgets belong to the provider configuration. The capturing double takes one option, `capacity` (default 1024).

## Verification

From the package directory:

```sh
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

The tests are unit tests and contract tests from the public entries. `tests/public-entry.spec.ts` reads the built `dist`, so build first (`pnpm run build`). It checks that the two entries reach no Cordis module and no Node built-in, and that the production install closure has no route to Cordis. `pnpm run lint:deps` at the repository root checks the dependency direction. A real provider and a real back end are not covered here. They belong to `telemetry-node`.

## Maintenance

A change to a public type or a rule in SPEC.md affects `telemetry-cordis-contract`, `telemetry-node` and `apps/harness-server`. Change the rule in one place: the validators in `src/`. Keep the clause in SPEC.md and the tests in step. A new field rule kind needs a new validation arm, a new SPEC clause and a check that it adds no free-text path. Do not add a Cordis dependency to this package: the install closure test and the Agent public entry test watch for it. `health()` is deferred with OTel. Do not add it before that work reopens.

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
└── cordis.md             Pointer: the Cordis definition is another member
src/                      Public definitions, validation, and implementation
└── testing/              The capturing double
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas (none yet)
verification/             models/ and proofs/ (none yet)
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources (none)
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
