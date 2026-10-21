# @omne-harness/session

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The mechanism member of the Session group. Variant: `module`.

## Responsibility and status

This package implements the [run contract of session-contract](../session-contract/SPEC.md#运行契约候选) without Cordis. It adds no public behavior. The package owns these mechanisms:

- the command handler pipeline, which makes one durable commit for each command
- the five coordinators and the seven schedulers, which decide what to send and when to check a session
- the orchestration of the before-admit and after-admit extension slots
- the rules to read and derive facts from Agent events
- the entry cache and the snapshot cache
- the scheduling policy object

The package holds no durable state. The session log, the operation records, the governance state, the derived indexes and the consume cursors belong to the provider of the transaction port. Memory in this package holds only timers, retry counters and caches. A restart loses them, and the recovery scan builds them again from the authoritative reads.

Allow and deny decisions come only from the pure functions of session-contract. [session-contract](../session-contract/README.md) owns the four faces, the ports and the events. [session-cordis-contract](../session-cordis-contract/README.md) owns the service definition. [session-cordis](../session-cordis/README.md) owns the Cordis binding. [session-adapters](../session-adapters/README.md) owns the neighbor adapters. [session-storage-sql](../session-storage-sql/README.md) owns the SQL storage.

Status: mechanism member, candidate technical design. Technical acceptance has not happened.

- Implemented: nothing. `src/index.ts` holds only a template marker. The root entry exports nothing.
- Not implemented: the factory, the command handler, the coordinators, the schedulers, the caches, and `close`. The [API page](docs/public-api.md#随实现进入的导出) lists them.
- Not verified: no clause of the [SPEC](SPEC.md) has a test. The crash matrix and the fault scenarios have no runner.

[session-cordis](../session-cordis/README.md) lists this package as a dependency. Both root entries export nothing, so no call runs now. No other package depends on this package.

## Usage

The package has one entry: `@omne-harness/session`. The entry exports nothing now. After the implementation arrives, a host uses the package in this order:

1. Build `SessionDependencies` and a `SessionConfiguration`. Only the transaction port and the internal principals are required to start.
2. Call `createSessionInstance(dependencies, configuration)`.
3. Give each caller class its own faces from `facesFor(caller)`.
4. Call `maintain(tenant)` for each tenant that the host serves. Keep the handle that the call returns.
5. Pass commit notices to `committed` and change notices to `changed`.
6. On exit, release the maintenance handles, then call `close()`.

A caller that only needs the domain interfaces does not install this package. It installs session-contract. A Cordis plugin installs session-cordis-contract. An application that assembles Cordis does not import this package. session-cordis calls the factory for it. The [usage page](docs/context.md) gives the independent path and the hosted path.

The factory signature is a candidate. No example can run now.

## Contracts

- `src/index.ts` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns the mechanisms that the contract does not state: the pipeline (CP), the extension slots (EX), the coordinators (C1 to C5), the schedulers (S1 to S7 and SR), the event reads (RD), the caches (CA), the crash matrix (CR) and the verification duties (VM).
- The [API page](docs/public-api.md) owns the factory, its two parameters and the instance members.
- The [object model](docs/object-model.md) owns the construction objects and the owners of in-memory state.
- Operations, failures, events and state machines belong to the [contract SPEC](../session-contract/SPEC.md). This package links to them and does not repeat them.

The factory returns an instance that the caller owns. After `close`, the four faces return `unavailable`. `close` does not roll back a committed fact. It does not cancel an Agent, Tool or Model execution. A missing outbound port stops only the operations that need it. A missing transaction port stops the whole instance.

## Design

The instance has these modules: the faces and caller-class check, the command handler, the extension slot orchestration, the coordinators, the schedulers, the per-session serial queue, the event read rules, the caches, the policy and the lifecycle. Dependencies go one way. The schedulers call the coordinators. The coordinators call the command handler and the outbound ports. The command handler calls the transaction port, the bridges and the pure functions.

The main mechanisms are:

- one commit for each use case, and one operation identity for each replay
- external calls after the commit, with the receipt committed as a new fact
- coordinators and schedulers that hold no state
- caches that only evict and never carry correctness
- derived data that is maintained when inputs change, so a request only reads it

The [architecture page](docs/architecture/README.md) explains the modules and the reasons. The [mechanisms page](docs/architecture/mechanisms.md) explains the log model and the technical duties. The [flows page](docs/flows.md) gives the flows of the pipeline, the coordinators and the schedulers.

## Configuration and operation

The factory takes two parameters. `SessionDependencies` holds the injected ports. `SessionConfiguration` holds the static `SchedulingPolicy`. `SchedulingPolicy` has the intervals, retry limits, back-off sequences and cache budgets. `defaultSchedulingPolicy` gives initial values only. A host can replace the whole policy or single fields. The factory rejects an invalid policy and names the field. The [API page](docs/public-api.md#配置) describes the shape, and the [SPEC](SPEC.md#schedulingpolicy) gives each field and its initial value.

The package reads no environment variable and no resource file. Tenant, session and operation identity are call arguments. They do not come from the dependencies or from the configuration. One instance serves all sessions. A host runs one scanner for each tenant in all processes. The first version meets this rule with one instance.

The package does not choose a clock, a notification bus or a storage medium. The host supplies them through ports.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session
```

In this directory, run `pnpm typecheck` for the type check. The current test only checks that the root entry has no exports. It does not show any behavior. The duties in the [SPEC](SPEC.md#vm-机制的持续验证义务) and the [fault scenarios](docs/fault-scenarios.md) are results that the implementation must pass later. They are not test runs. A passing structure check does not prove behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md) and the export test.
- When session-contract changes an operation, a port, an event or a state transition, update the affected clauses of the SPEC and the fault scenarios first.
- When the factory signature changes, update session-cordis, the one consumer in the group.
- A new neighbor domain is a new plugin in session-adapters. This package does not change.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Mechanism behavior: CP, EX, C, S, SR, RD, CA, CR, VM
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture/         Modules, reasons, and the log and commit mechanisms
├── flows.md              Pipeline, coordinator, and scheduler flows
├── object-model.md       Construction objects and owners of in-memory state
├── public-api.md         Export entry, factory, parameters, and failures
├── context.md            Independent use, hosted use, and position
└── cordis.md             Why this member loads no Cordis
src/                      Public definitions, only an empty index.ts now
tests/                    Entry test only, fixtures/ is empty
schema/                   Empty, the package publishes no schema
verification/             Fault scenarios, models/ and proofs/ are empty
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
