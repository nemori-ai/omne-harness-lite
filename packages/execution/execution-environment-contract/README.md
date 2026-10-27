# @omne-harness/execution-environment-contract

[中文](README_ZH.md)

The pure contract member of Execution Environment. Variant: `module`.

## Responsibility and status

This package owns the execution environment contract. It defines the types for access identity, binding layers, continuity, environment requirements, placements, quota domains, acquisitions, original acquisition descriptions, adoption records, leases, and managed resources. It defines five needed ports: the resource ledger, the facility guard, the recovery authority, the environment authority, and the scope binding source (its type belongs to Runtime Context). It defines the provider side of quota, original acquisition query, acquisition listing, and settlement. It defines the named facility protocol and three core facilities: `files`, `command`, and `terminal`. It also owns the schema and adoption identity of the tool environment declaration. It owns two block declarations: `execution.placement` and `execution.host-facts`. It owns two pure functions: `judgeRequirement` and `matchProviders`.

The package does not decide whether an action is allowed. It does not choose a binding layer, does not know policy words, and does not record what a tool did. It knows only generic roles: access identity, scope reference, origin reference, request identity, integrator, provider, facility owner, maintainer, and observer.

Status: contract member, `draft`. The [SPEC](SPEC.md) states which parts come from technical acceptance and which parts come from the product text, revision 2.

- Implemented: all public types, and the protocols and descriptors of the three core facilities.
- Implemented: the JSON Schema and Standard Schema of the need declaration, and its adoption identity.
- Implemented: the two block declarations, the two pure functions, `describeFacility`, and `createRecoveryAccess`.
- Tested: the export surface, the facility descriptors, the block declarations, and the absence of Cordis imports.
- Tested: requirement decoding, provider matching, the need schema and its digest. Type tests cover `FacilitySet` and the example.
- Tested: the two facility doubles, alone and in a scripted provider lease. The provider suite runs with the in-memory file system as the held facility.
- No production facility: the package implements no production facility and no environment. The host provider is in [execution-environment-host-local](../execution-environment-host-local/README.md). `./testing` has two facility doubles: an in-memory file system and a scripted command facility.
- Implemented: parameter schemas for nine environment, recovery, and registration operations, seven data result schemas, and `operationSchemas`. Registration results are removal functions. Facility operation schemas remain follow-up work.
- Implemented: `./testing` conformance cases and non-durable doubles, including scripted environment authority and scope bindings. The registry runs the environment suite. Host-local runs both suites.
- Implemented: two `./testing` facility doubles. `createMemoryFileSystem` gives an in-memory `files` facility with read, stat, write, close, and list. `createScriptedCommandFacility` gives a scripted `command` facility with output chunks, outcomes, and stops. The doubles prove the contract shape only. They do not prove real processes, a real file system, a grant-root check, or isolation.
- Not verified: most behavior clauses in the SPEC need the mechanism member, providers, and a real integrator together. The package makes no claim about tenant isolation, resource close, durability, or recovery.

The current consumers are the group members execution-environment-cordis-contract, execution-environment, and execution-environment-host-local.

## Usage

The root entry is: `@omne-harness/execution-environment-contract`. A tool package uses it to write its environment declaration and to derive the facilities that its executor receives:

```ts
import {
  environmentNeedAdoption,
  type EnvironmentNeedDeclaration,
  type FacilitySet,
} from '@omne-harness/execution-environment-contract'

export const shellNeeds = {
  facilities: ['command', 'terminal'],
  isolation: ['process'],
  layers: ['host_machine', 'session_sandbox', 'tenant_sandbox'],
} as const satisfies EnvironmentNeedDeclaration

export type ShellEnvironment = FacilitySet<(typeof shellNeeds)['facilities'][number]>
export const shellEnvironmentSlot = { schema: environmentNeedAdoption, value: shellNeeds }
```

The full example is [examples/shell-needs.ts](examples/shell-needs.ts). The [usage page](docs/context.md#使用方式) explains the work of integrators, provider authors, and facility owners.

Independent use needs only this package. It needs no Cordis. To get a placement and a lease, a caller also needs the mechanism member [execution-environment](../execution-environment/README.md) and one provider member. The package has no `./cordis` entry. Cordis integration lives in other members of the group. See the [Cordis page](docs/cordis.md). The package has no initialization step and nothing to dispose.

## Contracts

- `src/index.ts` owns the public shapes.
- The [SPEC](SPEC.md) owns behavior beyond the types: invariants INV-EE01 to INV-EE18 and verification obligations V-EE01 to V-EE27.
- The [API page](docs/public-api.md) indexes the exports. It also owns the need schema and the two block declarations.
- The [object model](docs/object-model.md) owns identity, owners, and lifecycle of each object.
- The [SPEC](SPEC.md#设施协议) is the single source of the facility protocol rules. The [architecture page](docs/architecture.md#设施协议) expands each facility and gives the reasons.

A facility operation has four results: done, unresolved, rejected, and unknown. The caller's tenant and the integrator's acquisition key identify an acquisition. A repeated request with the same key and the same description does not allocate again; a different description is `acquisitionConflict`. A lost allocation answer is queried through the original record, never sent again. The implementation of this contract issues the adoption record after it checks the provider receipt. The package commits no durable fact. The integrator's ledger keeps resource permits, outcomes, adoption records, and release records.

## Design

The root entry has one source module for each concern. The [architecture page](docs/architecture.md#模块与依赖) lists them. Dependencies between modules go one way. Outside dependencies are runtime-context-contract, legal-identity, operation-result, json-text, schema-provider, and `@standard-schema/spec`. The runtime value dependencies are operation-result, json-text, and legal-identity. The [architecture page](docs/architecture.md) explains the modules, the reasons for the key mechanisms, and the facility protocol. The [flows page](docs/flows.md) gives the nine protocol flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

The package has no configuration, needs no environment, and reads no resources at run time. The integrator supplies access identity, scope references, origin references, the allowed list, acquisition keys, and request identities. The integrator also implements the five ports: the resource ledger, the facility guard, the recovery authority, the environment authority, and the scope binding source. Policy evaluation for the allowed list happens outside this package.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/execution-environment-contract
```

In this directory, run `pnpm test` for the runtime and type tests, and `pnpm typecheck` for the type check. See [tests/](tests/README.md) for coverage. Most [verification obligations](SPEC.md#持续验证义务) in the SPEC cannot be verified inside this package alone. A passing structure check or package test does not prove combined behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md), and the export test.
- When facility operations, the four results, or reject reasons change, update the [facility protocol](docs/architecture.md#设施协议), the mechanism member, and provider members.
- When the schema file changes, update the `digest` of the adoption identity (and its `revision` when the shape changes), the [schema directory](schema/README.md), and the tool-side adoption.
- When block fields change, update the producer in the host-local Service implementation and the Runtime Context readers.
- A facility owner adds a new facility in its own package. A new sandbox is a new provider member. This package does not change in either case.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types, INV-EE01 to INV-EE18
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, mechanisms, facility protocol, Q-EE02 to Q-EE06
├── flows.md              Protocol flows F-EEC01 to F-EEC09
├── object-model.md       Roles, objects, relations, and lifecycle
├── public-api.md         Export entry, definition index, schema, and blocks
├── context.md            Independent use, integrators, neighbor handoff, position
└── cordis.md             Why Cordis integration does not apply
src/                      Public definitions, facilities/ holds the three core facilities
tests/                    Runtime and type tests, fixtures/ holds the export inventory
schema/                   JSON Schema of the tool environment declaration
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Example of a tool environment declaration
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
