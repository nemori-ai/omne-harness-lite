# @omne-harness/governance-contract

## Responsibility and status

This package defines dynamic governance contributions, current adoption and protected catalog queries. It contains input schemas, result types and the Cordis service definition. The production provider and full conformance verification remain outstanding.

## Usage

Import pure contracts from `@omne-harness/governance-contract` and the service from `./cordis`. Pass trusted Access separately from serializable requests. See the [public API](docs/public-api.md).

## Contracts

The [specification](SPEC.md) owns operation identity, immutable declarations, complete publication, current facts and exact withdrawal. Source definitions own data shapes.

## Design

The [architecture](docs/architecture.md), [object model](docs/object-model.md) and [flows](docs/flows.md) separate assembly facts from settings, authorization and execution responsibilities.

## Configuration and operation

This package owns no database, background task or startup configuration. Providers enforce cumulative budgets in addition to schema bounds.

## Verification

Run the package build and fast tests for public boundary checks. See [verification](verification/README.md) for finite models and provider obligations.

## Maintenance

Change contracts together with provider implementations and application bridges. Keep SQL participants and runtime objects out of transport values.

## Directory structure and documentation roles

`src/` owns definitions, `tests/` owns boundary checks, `docs/` explains design and `SPEC.md` owns behavioral obligations. The [index](index.md) lists resource locations.
