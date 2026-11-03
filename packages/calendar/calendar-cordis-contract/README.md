# @omne-harness/calendar-cordis-contract

[中文](README_ZH.md)

## Responsibility and status

This member defines CalendarQueryService/calendarQueryKey and CalendarSupplyService/calendarSupplyKey for Cordis assembly. Providers own implementation, configuration and resources. The root has no running service. Import service definitions from `./cordis`. The package remains private at `0.0.0`. Final independent acceptance and the parent merge are pending. Real cross-domain assembly follows M2. Schedule and Job remain A2 work.

## Usage

Providers extend the exported services. Consumers inject the service keys. Query and supply providers can load separately. See the [public index](docs/public-api.md) and [Cordis ownership](docs/cordis.md).

## Contracts

[SPEC](SPEC.md) owns this member's behavior. Source definitions own public shapes. [Calendar behavior](../calendar/SPEC.md) remains the business contract.

## Design

[Architecture](docs/architecture.md), [flows](docs/flows.md) and [objects](docs/object-model.md) explain this member. [Cordis](docs/cordis.md) states its assembly responsibility.

## Configuration and operation

Use Cordis 4.0.4. Definitions have no business configuration, database, network or timer. Injection grants no calendar.read or supply authority. Each call still needs trusted context.

## Verification

Run `pnpm --filter @omne-harness/calendar-cordis-contract build`, `pnpm --filter @omne-harness/calendar-cordis-contract typecheck` and `pnpm --filter @omne-harness/calendar-cordis-contract test` in the workspace. [Tests](tests/README.md) describes the resources and their limits. Local evidence does not establish final acceptance or real cross-domain integration.

## Maintenance

Keep the public source, behavior, consumer documentation and both entry files consistent. Preserve unknown outcomes and provider limits. Do not copy public type definitions into prose.

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
