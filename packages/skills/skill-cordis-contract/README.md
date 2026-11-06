# @omne-harness/skill-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of Skill. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the Skill seams. It has five abstract `Service` classes and their keys: `PackageInspectionService` (`skillPackageInspection`), `SkillCatalogService<P, S>` (`skillCatalog`), `SkillAccessService<P, S>` (`skillAccess`), `SkillReadCheckService<P, S>` (`skillReadCheck`) and `SkillResolutionService<P, S>` (`skillResolution`). It exports one key constant for each class (`skillPackageInspectionKey`, `skillCatalogKey`, `skillAccessKey`, `skillReadCheckKey`, `skillResolutionKey`). It also has the `Context` augmentation for the five keys.

The package owns no behavior. [skill-contract](../skill-contract/README.md) owns the five interfaces. [skill](../skill/README.md) owns the three services. [skill-host-local](../skill-host-local/README.md) owns the plugin that provides the three services. The two port services (`skillReadCheck`, `skillResolution`) are provided by other domains. The package knows only generic roles: the consumer of a service and the provider of a port.

Status: Cordis definition member. The behavior is a candidate and has no technical acceptance yet. The adoption basis is the member split on the [group page](../README.md#成员与依赖) and the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

- Implemented: `./cordis` exports the five abstract classes and five key constants (each taken from the `provide` of its class), and declares the `Context` augmentation. The root entry exports nothing.
- Tested: the five keys, the export set, loading and unloading of a subclass on a real Cordis 4.0.4 `Context`, and the root entry import boundary.
- Not implemented: events (none are declared) and a `./testing` entry (none is planned).

## Usage

The package has two entries:

- The root entry `@omne-harness/skill-cordis-contract` exports nothing. It does not load Cordis.
- `@omne-harness/skill-cordis-contract/cordis` holds the service definitions.

A port provider extends the abstract class and loads it as a plugin. Cordis removes the service when the plugin unloads:

```ts
import { Context } from '@deepseek-ai/cordis'
import {
  SkillReadCheckService,
  skillReadCheckKey,
} from '@omne-harness/skill-cordis-contract/cordis'

class Check extends SkillReadCheckService<unknown, unknown> {
  async check() {
    return { kind: 'refused' } as const
  }
}

const ctx = new Context()
await ctx.plugin(Check)
const check = ctx.get(skillReadCheckKey) // the instance, or undefined
```

A consumer reads a service with `ctx.get(<key constant>)` and accepts `undefined`. See the [usage page](docs/context.md#使用方式) for each kind of dependent.

Independent use does not need this package. A caller without Cordis uses the root entries of skill-contract and skill.

## Contracts

- `src/cordis.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types, in properties 1 to 8.
- The [Cordis page](docs/cordis.md) owns the dependency classes and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The inputs, results and failures of the five interfaces belong to their own specs: `PackageInspection` to the [skill-contract SPEC](../skill-contract/SPEC.md#parse), `SkillCatalog` and `SkillAccess` to the [skill SPEC](../skill/SPEC.md#catalog), and the two ports to the [demand ports of the skill-contract SPEC](../skill-contract/SPEC.md#ports).

The package holds no resources. The fiber of the plugin that loads a subclass owns the life of the service.

## Design

The package has one source file with definitions. It depends on the types of skill-contract and on `@deepseek-ai/cordis`. It imports no provider. Each key is written once, in the `provide` of its class. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the load and unload flows. The [object model](docs/object-model.md) lists the technical objects.

## Configuration and operation

The package has no plugin, no configuration and no environment needs, and reads no resources at run time. The plugin that provides the three services is in [skill-host-local](../skill-host-local/docs/cordis.md).

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/skill-cordis-contract test
```

Run `pnpm typecheck` here for type checking. Tests run on real Cordis 4.0.4. They cover the keys, the export set, the loading and unloading of a subclass, and the import boundary of the root entry. See [tests/](tests/README.md) for scope and limits. Passing structure checks do not prove Skill behavior.

## Maintenance

- When one of the five interfaces in skill-contract gains or loses a method, update the abstract class, the [API page](docs/public-api.md) and the export test.
- When a key changes, update the [Cordis page](docs/cordis.md) and the plugin in skill-host-local.
- Before a Cordis upgrade, run the tests of this package and of skill-host-local.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the types, properties 1 to 8
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Two entries, dependencies, mechanisms and reasons
├── flows.md              Load and unload flows of a service
├── object-model.md       Five technical objects and the Context augmentation
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
