# @omne-harness/skill

[中文](README_ZH.md)

The general implementation of two Skill application services: `createPackageInspection` checks one package through a source, and `createSkillAccess` describes, reads, lists and exports one Skill through the three demand ports of `@omne-harness/skill-contract`.

## Responsibility and status

This member implements the interfaces `PackageInspection` and `SkillAccess` of the contract. It holds no state between calls, no cache, and no source of its own: every operation checks the read right, the resolution and the package bytes on the spot. The ports are given by the integrator. `SkillCatalog` is not in this member yet (W3).

Status: candidate, without technical acceptance. The services are verified against the memory doubles of `skill-contract/testing` and against the `SkillAccess` conformance suite. No real read check, resolution or source is verified here. The first real source is `@omne-harness/skill-host-local`.

## Usage

```ts
import { createPackageInspection, createSkillAccess } from '@omne-harness/skill'
import type { SkillPackageSource, SkillReadCheck, SkillResolution } from '@omne-harness/skill-contract/provider'

declare const source: SkillPackageSource
declare const readCheck: SkillReadCheck<Principal, Scope>
declare const resolution: SkillResolution<Principal, Scope>

const inspection = createPackageInspection(source)
const checked = await inspection.inspect({ kind: 'directory', root: '/skills/review' })

const skills = createSkillAccess({ readCheck, resolution, source })
const described = await skills.describe(access, scope, capability)
if ('ok' in described && described.ok.material.kind === 'pinned') {
  const page = await skills.read(access, scope, { capability, part: { kind: 'body' } }, {
    basis: described.ok.material.basis,
    range: { start: 0, length: 4096 },
  })
}
```

The factories take plain objects and give plain objects. There is nothing to start or to dispose. `read`, `list` and `export` take an `AbortSignal`; `describe` does not. The memory doubles of `@omne-harness/skill-contract/testing` are for tests only.

## Contracts

The data shapes are the public types of `@omne-harness/skill-contract`. The behavior of the two services is owned by the contract: the rejection order and the control-file rules by [its SPEC "检查 Skill 包"](../skill-contract/SPEC.md#parse), the read shape rules by ["读取的形状规则"](../skill-contract/SPEC.md#read-shape), the eleven read steps and the port mapping by the group page ["读取"](../docs/architecture.md#读取) and ["端口"](../docs/architecture.md#端口). [SPEC.md](SPEC.md) of this member owns only what the implementation adds: how the steps are cut into three stages, where the mapping lives, and the decisions this member had to make. [docs/public-api.md](docs/public-api.md) indexes the public definitions.

## Design

Three stages, each a function over the ports: `gate` (steps 1 to 3), `pin` (steps 5 and 7), `verifiedBytes` (steps 9 and 10). `describe` ends after `gate`, `list` after `pin`, `read` and `export` go through all three. One table, `mapping.ts`, turns a source answer into a service failure. `range.ts` is the pure byte range function. See [docs/architecture.md](docs/architecture.md).

## Configuration and operation

There is no configuration. The page limit of 65536 bytes is fixed by the contract. The member needs Node.js 24 or later. Load `@omne-harness/skill-contract` only once in the process: the snapshot credential of the contract is per module instance.

## Verification

Run `pnpm run build`, `pnpm run typecheck` and `pnpm test` in this directory. The tests run the services over the memory doubles, run each stage directly, and run the `SkillAccess` conformance suite on this implementation. See [tests/README.md](tests/README.md). Not covered: real ports, concurrent writes to a package, a content-store source.

## Maintenance

When the contract changes a failure kind, a step or a shape rule, change `mapping.ts`, the stage that owns the step, the tests, and [SPEC.md](SPEC.md). Keep the three stages free of each other's steps. The group design is in [../docs/architecture.md](../docs/architecture.md).

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
