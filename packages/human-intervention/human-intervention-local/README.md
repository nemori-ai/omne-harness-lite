# @omne-harness/human-intervention-local

[中文](README_ZH.md)

## Responsibility and status

Node local SQL provider for the accepted HITL protocol. The package implements durable operation terminals, request/card transactions, independent wait recovery and original operation readback. Identity membership coordination also protects named writes and result disclosure. The public application services remain in development. This is not a complete HITL application service.

## Usage

Import `hitlSqlMaterials`, `independentWaitSqlMaterials` and the operation factories from the package root. Register the materials and a combination with an existing SqlStorage, then pass that storage, tenant domain, combination version and digest to the factory. A real assembly example is in [tests/world.ts](tests/world.ts).

## Contracts

[Public API](docs/public-api.md) indexes source definitions. [SPEC](SPEC.md) owns operation identity, seal ordering and uncertain-result handling. Only trusted assembly code may use the terminal factory. It does not authenticate users.

## Design

[Architecture](docs/architecture.md) describes SQL participant and reader ownership. [Object model](docs/object-model.md) separates operation values, durable terminals and injected storage.

## Configuration and operation

The caller supplies registered SQL materials and a tenant domain. This factory does not create or close the shared storage. There are no environment defaults or global service instances.

## Verification

Run `pnpm --filter @omne-harness/human-intervention-local build`, `typecheck` and `test:fast`. Real SQLite tests cover registration, competing replies, batch recovery, receiver generations, original results, seals and rollback. IdentitySql tests also cover membership revocation, unavailable destinations and drain on close. Complete public application services remain unverified.

## Maintenance

Changing operation identity or material behavior requires rerunning terminal tests and updating the public behavior owner. Complete C2 integration and independent acceptance remain required.

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
