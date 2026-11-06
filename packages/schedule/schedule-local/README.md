# @omne-harness/schedule-local

[中文](README_ZH.md)

## Responsibility and status

Provides bounded rule calculation in workers and SQL persistence for Schedule management. The local application composes management, prediction and queries. Its Cordis plugin injects storage and Calendar services. This private 0.0.0 package does not provide Job execution or recovery scanning.

## Usage

See the [group architecture](../docs/architecture.md) for consumers and dependency direction. Build the package before creating a calculation worker. Register SQL materials and supply a named guard before constructing the management backend. Consumers must use public entries rather than private source paths.

## Contracts

[SPEC](SPEC.md) states this member's boundary. [Public API](docs/public-api.md) distinguishes actual exports from planned definitions. Existing [business behavior](../schedule/SPEC.md) and [API design](../schedule/docs/public-api-design.md) remain implementation inputs without duplicating type definitions.

## Design

[Architecture](docs/architecture.md) assigns this member's responsibility. [Cordis](docs/cordis.md) describes binding applicability. Package creation establishes no new domain, process or distributed implementation.

## Configuration and operation

Node >=24 and ESM. The host supplies worker capacity, SqlStorage, a fixed scope, combination identity and guard adapter. It owns storage shutdown. Await application.close() when using the combined application, or worker.dispose() when using the standalone worker. Local and future remote implementations must preserve the same public semantics.

## Verification

Run `pnpm --filter @omne-harness/schedule-local build`, `typecheck` and `test`. Fast tests cover public boundaries and real SQLite behavior. Slow tests exercise worker termination and process crashes. Calendar integration tests use real CalendarQueries, SQLite, Cordis and released holiday seeds. Identity, settings, authority, consent and quota remain explicit fixtures in those tests. Production cross-domain integration remains unverified.

## Maintenance

Update consumers, necessary behavior and verification when implementing public definitions. Keep planned behavior distinct from actual exports. The Cordis plugin requires explicit dependencies and preserves stored facts across dependency replacement.

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

Use createScheduleCalendarEnvironment to share a Calendar environment reader with follow predictions. It preserves the captured revision and does not guard later commands.
