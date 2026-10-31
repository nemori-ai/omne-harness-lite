# @omne-harness/execution-environment-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of the execution environment. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the execution environment seam. The definition has five parts: the service key `executionEnvironment`, the abstract class `ExecutionEnvironmentService<P>`, the intercept configuration type `ExecutionEnvironmentIntercept`, the keys and abstract classes of three port services (the recovery authority `executionRecoveryAuthority`, the environment authority `executionEnvironmentAuthority`, and the trusted scope binding `executionScopeBinding`), and the `Context` augmentation.

The package does not own domain behavior. [execution-environment-contract](../execution-environment-contract/README.md) owns the behavior of the nine methods. [execution-environment](../execution-environment/README.md) owns the registry mechanism. [execution-environment-host-local](../execution-environment-host-local/README.md) owns the Service implementation and the host provider. The package knows only generic roles: integrator, maintainer, provider, and facility owner.

Status: Cordis definition member, `draft`. The adoption basis is the member split on the [system page](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备) and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: `./cordis` exports the abstract class and the key constant. It also declares the intercept configuration type and the `Context` augmentation. The root entry exports nothing.
- Implemented: nine template methods check the caller declaration before protected hooks. Registration requires `provider`; environment and recovery calls allow an absent declaration. See the [Cordis page](docs/cordis.md#intercept-配置与调用方类).
- Tested: caller classes, ancestor declarations, registration effects, three Cordis mechanism readings, export inventory, and entry import boundaries. Candidate readings still need basis registration.

execution-environment-host-local depends on this package now.

## Usage

The package has two entries:

- The root entry `@omne-harness/execution-environment-cordis-contract` exports nothing. It does not import Cordis.
- `@omne-harness/execution-environment-cordis-contract/cordis` holds the service definition.

A provider plugin registers like this. Cordis removes the registrations when the plugin unloads:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'

export const inject = { [executionEnvironmentKey]: { caller: 'provider' } }
export function apply(ctx: Context) {
  ctx.executionEnvironment.registerFacility(myFacilityDescriptor)
  ctx.executionEnvironment.registerProvider(myProvider)
}
```

`myFacilityDescriptor` and `myProvider` are values of the provider. The contract owns their shapes. A maintainer plugin uses the object form `inject: { executionEnvironment: { caller: 'maintainer' } }`. The [usage page](docs/context.md#使用方式) gives the use for each kind of dependent.

Independent use does not need this package. A caller without Cordis uses the root entries of execution-environment-contract and execution-environment.

## Contracts

- `src/cordis.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 10.
- The [Cordis page](docs/cordis.md) owns the service definition, the method faces, the intercept configuration, the registration and removal protocol, the dependency classes, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) owns the inputs, results, and failures of the nine methods.

The package holds no resources. The fiber of the calling plugin owns the life of a facility or provider registration. The Service implementation owns the close order on removal and the report of a pending retirement.

## Design

Each entry has one source file. The outside dependencies are the types of execution-environment-contract and `@deepseek-ai/cordis`. The package does not import the mechanism or the Service implementation. The service has one key. Facilities and providers register through the registration face. They are not services. The package declares no event. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the two mechanism flows. The [object model](docs/object-model.md) lists the technical objects.

## Configuration and operation

The package has no plugin configuration, needs no environment, and reads no resources at run time. The intercept configuration `{ caller }` is an assembly declaration of a calling plugin. It is not configuration of this package. The configuration of the Service implementation belongs to [execution-environment-host-local](../execution-environment-host-local/docs/cordis.md).

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/execution-environment-cordis-contract test
```

Run `pnpm typecheck` here for type checking. Entry tests run on real Cordis 4.0.4 and cover nine method templates, caller declarations, loading, unloading, caller effects, and three mechanism readings. The inventory test compares built declarations with the public API page. See [tests/](tests/README.md) for scope and limits. Passing structure checks do not prove all environment behavior.

## Maintenance

- When `ExecutionEnvironment<P>` or `ProviderRegistrations` in the contract gains or loses a method, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When the service key or the intercept configuration changes, update the [Cordis page](docs/cordis.md) and the Service implementation execution-environment-host-local.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 10
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-EED01 and F-EED02
├── object-model.md       Two technical objects; domain objects in the contract
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definition, caller class, registration, IC map
src/                      index.ts empty export, cordis.ts service definition
tests/                    Entry and export inventory tests; fixtures/ has the export list
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
