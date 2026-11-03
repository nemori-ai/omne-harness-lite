# @omne-harness/calendar-tools

[中文](README_ZH.md)

## Responsibility and status

This member provides the Calendar Tool author module, argument and result schemas, trusted context environment and Cordis contribution plugin. Actions are list/get/effective/resolve. The only capability is calendar.read. It implements no Calendar rules, storage or Tool runtime. The package remains private at `0.0.0`. Real cross-domain assembly follows M2. Schedule and Job remain A2 work.

## Usage

The root exports createCalendarToolModule, createCalendarToolEnvironment and argument/result schemas. The host supplies CalendarQueries, a real Tool environment and a trusted resolver. Cordis hosts use createCalendarToolsPlugin from `./cordis`. See [usage](docs/context.md).

## Contracts

[SPEC](SPEC.md) owns this member's behavior. Source definitions own public shapes. [Calendar behavior](../calendar/SPEC.md) remains the business contract.

## Design

[Architecture](docs/architecture.md), [flows](docs/flows.md) and [objects](docs/object-model.md) explain this member. [Cordis](docs/cordis.md) states its assembly responsibility.

## Configuration and operation

The environment resolver consumes each CallAccess. Model arguments contain no trusted identity. Plugin configuration follows the Tool author protocol. Complete results pass to ToolOutputCustody/Offloader. Encoding beyond 16 MiB fails explicitly.

## Verification

Run `pnpm --filter @omne-harness/calendar-tools build`, `pnpm --filter @omne-harness/calendar-tools typecheck` and `pnpm --filter @omne-harness/calendar-tools test` in the workspace. [Tests](tests/README.md) describes the resources and their limits. Local evidence does not establish final acceptance or real cross-domain integration.

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
