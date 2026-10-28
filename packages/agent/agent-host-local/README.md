PACKAGE_TEMPLATE_DRAFT

# agent-host-local

## Responsibility and status

Concrete Cordis integration and ownership of binding resources. The root entry provides an independent Model receiver. The complete Cordis plugin is not implemented. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204).

## Usage

The root exports `createLocalModelReceiver(dependencies, state)` and `createModelReceiverState()`. Retain the same state across receiver reassembly. Pass the same Journal provider, current access checks, stable original targets, Model read-only calls, account outlet and explicit capacity. See [public API](docs/public-api.md). The `./cordis` entry remains empty.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Cordis definitions and concrete providers are in separate packages. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. The root test checks exports. The agent member tests exercise the shared receiving algorithm with the public Model pusher and a non-durable Journal. They do not prove a complete Cordis plugin or production storage.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. The [docs](docs/README.md) page lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
