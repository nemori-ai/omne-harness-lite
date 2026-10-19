# agent-cordis-contract

## Responsibility and status

This package holds the unique Cordis service definitions of the Agent capability: services, keys, type augmentations, and the binding protocol. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204).

The `./cordis` entry exports these items:

- 17 abstract Services and the concrete `AgentInstancesService`, with 18 key constants.
- The `Context` augmentation for the 18 keys, and the `agent-cordis-contract/instance-retired` event in `Events`.
- The interface `AgentPublicationAuthority`.
- The directory plugin `agentInstancesPlugin`.

The root entry exports no value. It exports three types: `AgentLocalRoute`, `AgentRegistrationInput`, and `AgentWithdrawalInput`. The root entry has no edge to Cordis.

The package does not implement the Agent progression Loop, the evaluator, a provider for any service key, or the host plugin. The host plugin belongs to [agent-host-local](../agent-host-local/README.md). No run-time verification with a real provider exists.

## Usage

A plugin that consumes an Agent service imports the key constants and the types from `@omne-harness/agent-cordis-contract/cordis`. Domain types come from `@omne-harness/agent-contract`. A plugin does not import a Service from an implementation package. The [API page](docs/public-api.md) navigates to the source.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [Cordis page](docs/cordis.md) owns the service keys, the registration protocol, and the conformance mapping to IC-1 through IC-19.

## Design

The [architecture](docs/architecture.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Cordis definitions and concrete providers are in separate packages. The directory plugin takes an empty `Config` object and refuses any member. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. `pnpm test` builds the package first. The tests run on Cordis 4.0.4. They cover the root entry, the key set and the class set, the directory registration rules, and the directory plugin. The [test page](tests/README.md) lists the files. The tests use test subclasses for the publication authority, the access check, and the host. They do not prove the behavior of a real provider.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. The [docs](docs/README.md) page lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
