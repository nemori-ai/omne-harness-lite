# @omne-harness/governance-local

## Responsibility and status

Local governance commands, queries and persistence. The plain factory assembles registration, withdrawal, adoption, protected catalog reads and operation queries. The Cordis adapter binds contribution cleanup to the caller fiber. Production definition sources and current-fact adapters remain incomplete.

## Usage

Import `governanceSqlMaterials` to supply fixed participants, read handlers and migrations to a trusted SqlStorage assembly. The assembly registers the metadata, mutation, adoption and catalog combinations.

Create `createGovernanceLocalDestination` before Identity and register its resolver under the configured destination. Then call `createGovernanceLocal` with that Identity instance, the same storage domain and metadata combination, and trusted source and current-fact adapters. These dependencies are assembly inputs, not client request data.

Only a `created` result exposes `service` and `close`. Startup creates a fresh epoch and recovers historical responsibilities before exposing the service. `unavailable` exposes no service. All five service methods use the same ingress and shutdown boundary.

For Cordis, import `createGovernanceLocalPlugin` from `@omne-harness/governance-local/cordis`. Supply the trusted assembly configuration without `storage` and `identity`; Cordis injects them. The required `observeClose` callback receives the first pending shutdown report, if any, and the final closed report. Callback completion does not control cleanup.

## Contracts

See the [local specification](SPEC.md) and [governance contract](../governance-contract/SPEC.md).

## Design

The [architecture](docs/architecture.md) separates storage ownership from external authority. The [object model](docs/object-model.md) records each lease's target support.

## Configuration and operation

The assembly owns the tenant domain, SQLite configuration and shutdown. The factory opens no database. `recoveryPagesPerPass` bounds each recovery pass. `closeTimeoutMs` bounds how long a close call waits. A plain-factory `pending` close retains responsibility and permits another close attempt. The Cordis adapter retries provider shutdown automatically. Keep borrowed SQL and Identity dependencies available until close reports `closed`.

## Verification

Run this member's typecheck, build and fast tests. Public-factory tests use real SQLite and Identity, with named definition and current-fact fixtures. Cordis tests use the installed 4.0.4 kernel and actual caller fibers. They do not establish production source integration or complete independent acceptance.

## Maintenance

Keep table ownership, migrations, consuming assemblies and verification aligned. Do not read another owner's private tables.

## Directory structure and documentation roles

Source owns implementation, tests own repeatable checks, and docs explain design. The [index](index.md) locates each resource. Execution reports stay in task tmp.
