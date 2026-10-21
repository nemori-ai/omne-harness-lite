# @omne-harness/runtime-context-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The pure contract member of Runtime Context. Variant: `module`.

## Responsibility and status

This package owns the Runtime Context protocol. It defines types for block declarations, context needs, need bindings, registrations, and read eligibility. It also defines types for bound readers, snapshots and changes, context updates, step commits, and change material. It also owns five pure check functions over these types.

The package does not own the content of any block. It does not decide whether an action is allowed, does not assemble model requests, and does not store history. It knows only generic roles: scope holder, producer, consumer class, integrator, coordinator, and caller.

Status: contract member, `draft`. The [SPEC](SPEC.md) states which parts come from technical acceptance and which parts come from the product text, revision 4.

- Implemented: `src/` holds only the shared types and the two block declaration kinds. All of them are types. The root entry exports no runtime value.
- Not implemented: the types for needs, bindings, registrations, eligibility, readers, updates, step commits, and change material.
- Not implemented: the functions `judgeNeed`, `judgeBinding`, `judgeRegistration`, `reduceStep`, and `diffForReminder`.
- Not verified: every behavior clause in the SPEC. The package has no runtime implementation. It makes no claim about tenant isolation, concurrency, recovery, or performance.

The current consumers are execution-environment-contract and execution-environment. They use the scope reference and the block declaration types.

## Usage

The package has one entry: `@omne-harness/runtime-context-contract`. A semantic owner exports a block declaration from its own package and adds its key to the block map:

```ts
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'example.locale': { tag: string }
  }
}

export const localeBlock: SuppliedBlockDescriptor<'example.locale', { tag: string }> = {
  kind: 'supplied',
  key: 'example.locale',
  schema: localeSchema,
  consumers: ['model', 'tool'],
  required: false,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'reread',
}
```

`localeSchema` is any validator that implements Standard Schema. The [usage page](docs/context.md#使用方式) gives the full example and the independent path.

Independent use needs only this package. It needs no scope holder and no Cordis. The package has no `./cordis` entry. Cordis integration lives in other members of the group. See the [Cordis page](docs/cordis.md).

## Contracts

- `src/index.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types, in clauses RC-01 to RC-07.
- The [API page](docs/public-api.md) indexes the exports. It lists current exports and planned exports in two separate tables.
- The [object model](docs/object-model.md) owns identity, owners, and lifecycle of each object.

A read has five results: success, refusal, missing, unknown, and cursor invalidated. Registration, block content, and step commit are three separate commits. None of them happens inside this package. The package gives only check results and merge material. It holds no resources and has nothing to dispose.

## Design

The root entry has seven modules: shared types, block declarations, needs and bindings, registration and eligibility, readers and observation, updates and commits, and pure functions. Dependencies between them go one way. The only outside dependency is `@standard-schema/spec`. legal-identity joins when the eligibility type arrives. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the eight protocol flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

The package has no configuration, needs no environment, and reads no resources at run time. The caller supplies scope references, block declarations, producer material, and eligibility material. The caller also commits and stores registrations, step commits, and reminders. Access to data that the system hosts still follows the original access contract.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-contract
```

In this directory, run `pnpm typecheck` for the type check. The current test checks only that the root entry has no runtime exports. See [tests/](tests/README.md). No test covers the [verification obligations](SPEC.md#持续验证义务) in the SPEC yet. A passing structure check does not prove behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md), and the export test.
- When block declaration fields, consumer classes, or read results change, update the dependents: execution-environment-contract, request-context-contract, runtime-context-cordis-contract, and runtime-context.
- A semantic owner adds a new block in its own package. This package does not change.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types, RC-01 to RC-07
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Protocol flows F-RC01 to F-RC08
├── object-model.md       Objects, lifecycle, and states
├── public-api.md         Export entry and definition index
├── context.md            Independent use, neighbor handoff, position
└── cordis.md             Why Cordis integration does not apply
src/                      Public types, only index.ts now
tests/                    Continuous tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
