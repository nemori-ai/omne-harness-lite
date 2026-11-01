# @omne-harness/runtime-context-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of Runtime Context. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the Runtime Context seam. The definition has four parts: the service key `runtimeContext`, the abstract class `RuntimeContextService`, the intercept configuration `{ consumer }`, and the wake-up event `runtime-context-cordis-contract/changed`. It also defines the construction input `RuntimeContextTrustService` with the key `runtimeContextTrust`: the trusted assembly provides the two original authority ports there, and a provider plugin injects it. It is not a Runtime Context capability. Subtree visibility is an assembly position, not encapsulation.

The package does not own domain behavior. [runtime-context-contract](../runtime-context-contract/README.md) owns the behavior of the three operation faces. [runtime-context](../runtime-context/README.md) owns the supply mechanism. [runtime-context-cordis](../runtime-context-cordis/README.md) owns the Service implementation. The package knows only generic roles: producer, scope holder, consumer class, and listener.

Status: Cordis definition member, `draft`. The adoption basis is the [member and Cordis placement section](../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位) of the system page and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: the abstract Service, unique key, intercept type, Context/Events augmentations and explicit contract type re-exports.
- The concrete provider and domain mechanism belong to their implementation members.
- Three mechanism readings pass real Cordis 4.0.4 tests here. Their common basis registration remains open. See the [Cordis page](docs/cordis.md#机制读数与假设).

No package depends on this package now.

## Usage

The package has two entries:

- The root entry `@omne-harness/runtime-context-cordis-contract` re-exports only contract types. It does not import Cordis.
- `@omne-harness/runtime-context-cordis-contract/cordis` holds the service definition.

A consumer-side adapter plugin declares its consumer class like this:

```ts
import type {} from '@omne-harness/runtime-context-cordis-contract/cordis'

export const inject = {
  runtimeContext: { consumer: 'model' },
}
```

A producer plugin uses `inject: ['runtimeContext']` and calls `registerProducer` in its plugin body. Cordis removes the registration when the plugin unloads. The [usage page](docs/context.md#使用方式) gives the use for each kind of dependent.

Independent use does not need this package. A caller without Cordis uses the root entries of runtime-context-contract and runtime-context.

## Contracts

- `src/` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 9.
- The [Cordis page](docs/cordis.md) owns the service definition, the event, the dependency classes, the registration and removal protocol, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) owns the inputs, results, and failures of the three faces.

The package holds no resources. The fiber of the producer plugin owns the life of a producer registration. The fiber of the listener owns the life of an event listener. The provider owns service removal, settlement of in-flight reads, and discard of late publications.

## Design

Each entry has one source file. The outside dependencies are the types of runtime-context-contract and `@deepseek-ai/cordis`. The package does not import the mechanism or the provider. The service has one key. Blocks are data, not services. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the two mechanism flows. The [object model](docs/object-model.md) lists the three technical objects.

## Configuration and operation

The package has no plugin configuration, needs no environment, and reads no resources at run time. The intercept configuration `{ consumer }` is an assembly declaration of a consumer plugin. It is not configuration of this package. The provider configuration belongs to [runtime-context-cordis](../runtime-context-cordis/docs/cordis.md).

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-cordis-contract
```

In this directory, run `pnpm typecheck` for the type check. Tests check entries, exported declarations, real Cordis loading, caller lifecycle and the three mechanism readings. See [tests/](tests/README.md). The basis owner still maintains common registration. Concrete providers must verify their own resource and in-flight behavior. A passing structure check does not prove behavior.

## Maintenance

- When the operation types of the three faces change in the contract, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When the service key, the intercept configuration, or the event changes, update the [Cordis page](docs/cordis.md) and the provider runtime-context-cordis.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 9
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-RCD01 and F-RCD02
├── object-model.md       Three technical objects; domain objects in the contract
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definition, event, registration, IC map
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
