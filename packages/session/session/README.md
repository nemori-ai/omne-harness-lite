PACKAGE_TEMPLATE_DRAFT

# session

## Responsibility and status

Reusable implementation mechanisms and factories, without Cordis. The package is initialized. Runtime APIs are not implemented; candidate designs retain their existing acceptance status.

## Usage

Current entries export no runtime capability. The [API design](docs/public-api.md) describes candidates, not executable examples.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from candidate interfaces.

## Design

The [architecture](docs/architecture/README.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. Binding ownership and lifecycle rules are described in [Cordis integration](docs/cordis.md).

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. Declaration tests verify existing behavior. Empty-entry tests only verify the scaffold; they do not establish runtime support.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. Member relationships are owned by the [group](../README.md).

## Directory structure and documentation roles

The package follows the source template skeleton. Six documentation topics are listed in [docs](docs/README.md). Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
