# @omne-harness/execution-environment-cordis-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Cordis definition member of the execution environment. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the execution environment seam. The definition has four parts: the service key `executionEnvironment`, the abstract class `ExecutionEnvironmentService<P>`, the intercept configuration type `ExecutionEnvironmentIntercept`, and the `Context` augmentation.

The package does not own domain behavior. [execution-environment-contract](../execution-environment-contract/README.md) owns the behavior of the eight methods. [execution-environment](../execution-environment/README.md) owns the registry mechanism. [execution-environment-host-local](../execution-environment-host-local/README.md) owns the Service implementation and the host provider. The package knows only generic roles: integrator, maintainer, provider, and facility owner.

Status: Cordis definition member, `draft`. The adoption basis is the member split on the [system page](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备) and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: `./cordis` exports the abstract class and the key constant. It also declares the intercept configuration type and the `Context` augmentation. The root entry exports nothing.
- Not implemented: the check of the caller class. No Service implementation reads the intercept configuration. See the [Cordis page](docs/cordis.md#intercept-配置与调用方类).
- Not verified: the mechanism that reads the intercept configuration has only a source reading. It is not in the basis yet. No test checks the import boundary file by file.

execution-environment-host-local depends on this package now.

## Usage

The package has two entries:

- The root entry `@omne-harness/execution-environment-cordis-contract` exports nothing. It does not import Cordis.
- `@omne-harness/execution-environment-cordis-contract/cordis` holds the service definition.

A provider plugin registers like this. Cordis removes the registrations when the plugin unloads:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'

export const inject = [executionEnvironmentKey]
export function apply(ctx: Context) {
  ctx.executionEnvironment.registerFacility(myFacilityDescriptor)
  ctx.executionEnvironment.registerProvider(myProvider)
}
```

`myFacilityDescriptor` and `myProvider` are values of the provider. The contract owns their shapes. A maintainer plugin uses the object form `inject: { executionEnvironment: { caller: 'maintainer' } }`. The [usage page](docs/context.md#使用方式) gives the use for each kind of dependent.

Independent use does not need this package. A caller without Cordis uses the root entries of execution-environment-contract and execution-environment.

## Contracts

- `src/cordis.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 8.
- The [Cordis page](docs/cordis.md) owns the service definition, the method faces, the intercept configuration, the registration and removal protocol, the dependency classes, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) owns the inputs, results, and failures of the eight methods.

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

In this directory, run `pnpm typecheck` for the type check. The two test files hold four tests. They check that the root entry has no runtime export, the export set and the key constant of `./cordis`, and that a subclass provides the service on the key and goes away when its plugin unloads. See [tests/](tests/README.md). On 2026-10-21, on Node v24.18.0 and linux, all four tests passed. No test covers the caller-class check or the import boundary. A passing structure check does not prove behavior.

## Maintenance

- When `ExecutionEnvironment<P>` or `ProviderRegistrations` in the contract gains or loses a method, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When the service key or the intercept configuration changes, update the [Cordis page](docs/cordis.md) and the Service implementation execution-environment-host-local.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 8
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Mechanism flows F-EED01 and F-EED02
├── object-model.md       Two technical objects; domain objects in the contract
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definition, caller class, registration, IC map
src/                      index.ts empty export, cordis.ts service definition
tests/                    Two entry tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
