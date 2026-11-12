# @omne-harness/access-cordis-contract

[中文](README_ZH.md)

The types of an access contribution and the Cordis service definition of the access registry. A domain that opens a protocol to clients writes one "contribution" with these types. It then calls `mount` to put it on the registry of the access entry. The design source is section 5 of [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#登记表与贡献).

## Responsibility and status

This package owns every shape that a domain sees: the contribution, the operation handler, the call context, the observation context, the frame source, and the registry service definition `AccessRegistryService`. A domain sees only `mount`. The pipeline methods `enter` and `subscribe` are not here. They belong to the registry of [server-entry](../server-entry/SPEC.md).

Implemented: the types and the service definition above. `LoginIdentity` and `Principal` are opaque types for now. The run that joins access to identity gives them their shape. `defineAccessPlugin` does not exist yet. Real consumers: the registry provider of server-entry and its test contribution. No domain access plugin exists yet.

## Usage

```ts
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const notes = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    ping: { identity: 'none', effect: 'read', limit: 'small', body: empty, outcomes: { succeeded: empty } },
  },
  observations: {},
})
const contribution: AccessContribution<typeof notes> = {
  protocol: notes,
  operations: { ping: async () => ({ outcome: 'succeeded', body: {} }) },
  observations: {},
}

// In an access plugin: ctx.accessRegistry.mount(contribution)
```

`mount` is an effect of the caller's Cordis scope. When the plugin unloads, the protocol comes off the registry. The unload waits until every in-flight call and observation of this contribution has ended. An access plugin writes no take-down code.

The root entry has types and one error class, `AccessAssemblyError`. It does not import Cordis. `./cordis` exports `AccessRegistryService` and the service key `accessRegistryKey` (value `accessRegistry`).

## Contracts

The types come from the protocol contract:

- A contribution has one handler for each operation and one frame source for each observation. A missing or extra one does not compile.
- A handler's body type comes from the `body` codec of the operation. An answer can only be an outcome of the result set. An outcome with a codec carries its body. A fixed outcome carries no body.
- The principal in the call context follows the `identity` column: none for `none`, a login identity for `login`, a principal acting for a tenant for `acting-tenant`.

When a protocol of the same name and major version is already mounted, `mount` throws `AccessAssemblyError`. The caller's plugin fails and the mounted protocol stays. [SPEC.md](SPEC.md) owns the full mount and take-down behavior. [docs/public-api.md](docs/public-api.md) indexes the public definitions.

## Design

`AccessRegistryService.mount` is a concrete method. It wraps the mount in `this.ctx.effect`. A provider implements the protected `attach`: it mounts synchronously or throws, and it returns the take-down function. The take-down returns a promise that settles when the last in-flight work has ended. So "unload is take-down" is written in one place only. See [docs/architecture.md](docs/architecture.md).

## Configuration and operation

This package has no configuration. The application assembly of the entry provides the service. Run-time parameters such as the grace period belong to the registry and the settle step of server-entry.

## Verification

- `pnpm exec vitest run --mode fast`: tests of the entry exports and the error class, and the type assertions in `tests/contribution.spec-d.ts`. A missing operation, a handler that disagrees with the contract, an outcome outside the result set, and a body that disagrees with the codec all fail to compile.
- The server-entry tests verify on real Cordis 4.0.4 that unload is take-down, because the provider is there.

## Maintenance

When the shape of `OperationContract`, `ObservationContract`, or `Codec` in the public contract changes, change the types here and `tests/contribution.spec-d.ts`. When the signature of `AccessRegistryService` changes, update the server-entry provider and every domain access plugin.

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
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
