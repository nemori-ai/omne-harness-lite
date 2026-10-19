PACKAGE_TEMPLATE_DRAFT

# agent

## Responsibility and status

This package provides reusable implementation mechanisms and factories. It does not include Cordis. The package is initialized. The runtime APIs are not implemented. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204).

## Usage

The current entries export no runtime capability. The [API design](docs/public-api.md) describes the accepted design. It does not give executable examples.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture/README.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. These checks verify only the scaffold and the empty entry. They do not establish runtime support.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns the member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. [docs](docs/README.md) lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
