# @omne-harness/mcp-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of MCP. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the MCP seams. It has seven abstract `Service` classes and their keys. Three are the MCP services: `ActionDiscoveryService<P>` (`mcpActionDiscovery`), `ActionInvokerService<P>` (`mcpActionInvoker`) and `EndpointStatusService<P, S>` (`mcpEndpointStatus`). Four are the demand ports: `AdoptionViewService<P, S>` (`mcpAdoptionView`), `UseEligibilityService<P>` (`mcpUseEligibility`), `CredentialUseService<P>` (`mcpCredentialUse`) and `ProcessLandingService<P>` (`mcpProcessLanding`). It exports one key constant for each class (`mcpActionDiscoveryKey`, `mcpActionInvokerKey`, `mcpEndpointStatusKey`, `mcpAdoptionViewKey`, `mcpUseEligibilityKey`, `mcpCredentialUseKey`, `mcpProcessLandingKey`). It also has the `Context` augmentation for the seven keys.

The package owns no behavior. [mcp-contract](../mcp-contract/README.md) owns the seven interfaces. [mcp](../mcp/README.md) owns the three services. [mcp-host-local](../mcp-host-local/README.md) owns the plugin that provides the three services. The four port services are provided by other domains. `EndpointInspection` and `Connections` have no key. The package knows only generic roles: the consumer of a service and the provider of a port.

Status: Cordis definition member. The behavior is a candidate and has no technical acceptance yet. The adoption basis is the member split on the [group page](../README.md#成员与依赖) and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: `./cordis` exports the seven abstract classes and seven key constants (each taken from the `provide` of its class), and declares the `Context` augmentation. The root entry exports nothing.
- Tested: the seven keys, the export set, loading and unloading of a subclass on a real Cordis 4.0.4 `Context`, and the root entry import boundary.
- Not implemented: events (none are declared) and a `./testing` entry (none is planned; the port doubles are in `@omne-harness/mcp-contract/testing`).

## Usage

The package has two entries:

- The root entry `@omne-harness/mcp-cordis-contract` exports nothing. It does not load Cordis.
- `@omne-harness/mcp-cordis-contract/cordis` holds the service definitions.

A port provider extends the abstract class and loads it as a plugin. Cordis removes the service when the plugin unloads:

```ts
import { Context } from '@deepseek-ai/cordis'
import {
  UseEligibilityService,
  mcpUseEligibilityKey,
} from '@omne-harness/mcp-cordis-contract/cordis'

class Eligibility extends UseEligibilityService<unknown> {
  async check() {
    return { kind: 'unknown' } as const
  }
}

const ctx = new Context()
await ctx.plugin(Eligibility)
const eligibility = ctx.get(mcpUseEligibilityKey) // the instance, or undefined
```

A consumer reads a service with `ctx.get(<key constant>)` and accepts `undefined`. See the [usage page](docs/context.md#使用方式) for each kind of dependent.

Independent use does not need this package. A caller without Cordis uses the root entries of mcp-contract and mcp.

## Contracts

- `src/cordis.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 9.
- The [Cordis page](docs/cordis.md) owns the dependency classes and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [mcp-contract SPEC](../mcp-contract/SPEC.md) owns the inputs, results and failures of the seven interfaces.

The package holds no resources. The fiber of the plugin that loads a subclass owns the life of the service.

## Design

The package has one source file with definitions. It depends on the types of mcp-contract and on `@deepseek-ai/cordis`. It imports no provider. Each key is written once, in the `provide` of its class. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the load and unload flows. The [object model](docs/object-model.md) lists the technical objects.

## Configuration and operation

The package has no plugin, no configuration and no environment needs, and reads no resources at run time. The plugin that provides the three services is in [mcp-host-local](../mcp-host-local/docs/cordis.md).

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/mcp-cordis-contract test
```

Run `pnpm typecheck` here for type checking. Tests run on real Cordis 4.0.4. They cover the keys, the export set, the loading and unloading of a subclass, and the import boundary of the root entry. See [tests/](tests/README.md) for scope and limits. Passing structure checks do not prove MCP behavior.

## Maintenance

- When one of the seven interfaces in mcp-contract gains or loses a method, update the abstract class, the [API page](docs/public-api.md) and the export test.
- When a key changes, update the [Cordis page](docs/cordis.md) and the plugin in mcp-host-local.
- Before a Cordis upgrade, run the tests of this package and of mcp-host-local.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 9
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Load and unload flows of a service
├── object-model.md       Seven technical objects and the Context augmentation
├── public-api.md         Export entries and definition index
├── context.md            Use by each dependent, position
└── cordis.md             Service definitions, dependency classes, IC map
src/                      index.ts empty export, cordis.ts service definitions
tests/                    Entry tests; fixtures/ is empty
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Independent acceptance; not filled in this member yet
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
