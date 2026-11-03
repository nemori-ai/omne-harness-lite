# @omne-harness/schedule-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

## Responsibility and status

Owns public domain values, commands, queries, results, errors and replaceable service ports. Wire requests and receipts must be serializable and contain no runtime objects. This private 0.0.0 package is an initialized draft. Public entries remain empty; no business service is runnable.

## Usage

See the [group architecture](../docs/architecture.md) for consumers and dependency direction. Only skeleton build and checks are available. Consumers must use public entries rather than private source paths.

## Contracts

[SPEC](SPEC.md) states this member's boundary. [Public API](docs/public-api.md) distinguishes actual exports from planned definitions. Existing [business behavior](../schedule/SPEC.md) and [API design](../schedule/docs/public-api-design.md) remain implementation inputs without duplicating type definitions.

## Design

[Architecture](docs/architecture.md) assigns this member's responsibility. [Cordis](docs/cordis.md) describes binding applicability. Package creation establishes no new domain, process or distributed implementation.

## Configuration and operation

Node >=24 and ESM. There is no business configuration or startup entry. Local and future remote implementations must preserve the same public semantics.

## Verification

Run `pnpm --filter @omne-harness/schedule-contract build`, `typecheck` and `test`. Tests check draft exports only. They do not establish persistence, tenant isolation, network, lifecycle or business guarantees.

## Maintenance

Update consumers, necessary behavior and verification when implementing public definitions. Keep draft markers until implementation and verification are complete. Methods, schemas, service classes and providers remain unimplemented.

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
