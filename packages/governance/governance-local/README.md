# @omne-harness/governance-local

## Responsibility and status

Local governance persistence. Relational migrations are implemented. Business services, current facts and Cordis assembly remain incomplete.

## Usage

Import `governanceSqlMigrations` from the root entry to supply fixed migration materials to a trusted SqlStorage assembly. This does not register a business participant.

## Contracts

See the [local specification](SPEC.md) and [governance contract](../governance-contract/SPEC.md).

## Design

The [architecture](docs/architecture.md) separates storage ownership from external authority. The [object model](docs/object-model.md) records each lease's target support.

## Configuration and operation

The assembly owns the tenant domain, SQLite configuration and shutdown. The factory opens no database.

## Verification

Run this member's typecheck, build and fast tests. Relational and real Worker tests do not establish complete business-service conformance.

## Maintenance

Keep table ownership, migrations, consuming assemblies and verification aligned. Do not read another owner's private tables.

## Directory structure and documentation roles

Source owns implementation, tests own repeatable checks, and docs explain design. The [index](index.md) locates each resource. Execution reports stay in task tmp.
