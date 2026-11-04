# @omne-harness/skill-contract

[中文](README_ZH.md)

The pure contract member of the Skill group. It gives the Skill values, failures, service interfaces, pure functions, the three demand ports, their conformance suites, and the `skill` category port of `@omne-harness/assets`.

## Responsibility and status

This member owns the Skill words that other members use: the package rules, the snapshot and its digest, the failure kinds, the port shapes, and the asset body of the `skill` category. It has no service implementation, no source, and no runtime state. The services `PackageInspection`, `SkillCatalog` and `SkillAccess` are interfaces only. Their implementation is in `@omne-harness/skill`. The directory source is in `@omne-harness/skill-host-local`.

Status: the shapes and the rules are candidates. They do not have technical acceptance. The pure functions and the memory doubles have tests. No real source, read check or resolution is verified here.

## Usage

There are three entries:

- `@omne-harness/skill-contract`: for callers. Values, failures, service interfaces, pure functions, `skillBodyContract`, the constants `MANIFEST_PATH`, `DECLARATION_PATH` and `PAGE_LIMIT`, and `sameCapability`.
- `@omne-harness/skill-contract/provider`: for port implementations. The ports, the `PackageInspection` interface, `SkillRef`, `PackageLocator` and `sealSnapshot`.
- `@omne-harness/skill-contract/testing`: for the tests of port implementations and of the `SkillAccess` and `SkillCatalog` implementations. The suites are lists of cases that fail by `node:assert`, so the consumer registers them in its own test framework.

A source gives a snapshot only through `sealSnapshot`. A check of a package then looks like this:

```ts
import { parseSkillPackage, toPackagePath } from '@omne-harness/skill-contract'
import { sealSnapshot } from '@omne-harness/skill-contract/provider'

const manifest = new TextEncoder().encode('---\nname: review\ndescription: Reviews a change.\n---\nBody.\n')
const path = toPackagePath('SKILL.md')
if (!('ok' in path)) throw new Error('bad path')
const sealed = sealSnapshot({ rootName: 'review', files: [{ path: path.ok, bytes: manifest }] })
if (!('ok' in sealed)) throw new Error(sealed.failure.kind)
const checked = parseSkillPackage({ snapshot: sealed.ok, control: { manifest } })
```

To register the category port, give `skillBodyContract()` to the category registry of `@omne-harness/assets`. This member has no Cordis entry.

## Contracts

The public types in `src/` own the data shapes. [SPEC.md](SPEC.md) owns the behavior that the types cannot show: the rejection order, the snapshot digest, the frontmatter and declaration rules, the read shape rules, the port requirements, the conformance suites and the category port extension. [docs/public-api.md](docs/public-api.md) indexes the public definitions. The machine-readable shape of `.omne/skill.json` is [schema/skill-declaration.schema.json](schema/skill-declaration.schema.json).

## Design

The member is a set of small modules: values, names, digests, media types, the snapshot constructor, the package parser, the shape readers that the declaration file and the asset body share, the projection, the category port, and the test suites. See [docs/architecture.md](docs/architecture.md).

## Configuration and operation

There is no runtime configuration. A caller of `parseSkillPackage` can give another declaration budget (`declarationLimits`). The read page of 65536 bytes is fixed in this version. Load this member only once in a process: a snapshot that one module instance seals is not accepted by another instance. The member needs Node.js 24 or later.

## Verification

Run `pnpm run build`, `pnpm run typecheck` and `pnpm test` in this directory. The tests are unit and contract tests. `tests/conformance.spec.ts` also runs the suites in process on doubles that disclose an identity, and checks that exactly the non-disclosure cases fail. See [tests/README.md](tests/README.md) and the verification section of [SPEC.md](SPEC.md).

## Maintenance

Change the public shapes only by additive changes after this member merges into the parent branch. When a shape or a rule changes, update SPEC.md, the schema, the tests, and the consumers `@omne-harness/skill` and `@omne-harness/skill-host-local`. The group design is in [../docs/architecture.md](../docs/architecture.md).

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

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. The independent acceptance owners maintain `acceptance/`. This pure contract member has no acceptance scenario.
