# agent-contract

## Responsibility and status

This package holds the contract of the Agent capability: domain values, operations, results, behavior obligations, and replaceable provider ports. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204).

The package exports these items:

- All contract types, for definitions, extensions, identities, evaluation, requests, passages, execution, and the Journal.
- Five constants: `ATTRIBUTE_ITEMS`, `POSITIONS`, `POWERS`, `POSITION_OUTPUTS`, and `AGENT_IDENTITY_MAX_LENGTH`.
- Three judgment functions: `judgeAgentDefinition`, `judgeLoopExtensions`, and `judgeExtensionOutput`.
- The asset body contract `agentBodyContract`.
- Fourteen identity decoders, named `decode*`, and four structure judgments: `judgeAdoption`, `judgeEvidence`, `judgeAccess`, and `judgeAuthority`.

The package does not implement the progression Loop, the evaluator, the runtime, the Journal provider, or the host plugin. The interfaces of these parts exist as types only. No provider implements them. Providers and the host plugin belong to [agent](../agent/README.md), [agent-host-local](../agent-host-local/README.md), and the provider packages.

## Usage

```ts
import { decodeStepId, judgeAgentDefinition } from '@omne-harness/agent-contract'

const definition = await judgeAgentDefinition(raw)
const step = decodeStepId(text)
```

`raw` and `text` are unknown input from the caller. Each function returns a refusal with a named reason instead of throwing. The [SPEC](SPEC.md#声明判断) owns the limits, the refusal reasons, and the identity rules.

A consumer registers the body contract with the asset category registry:

```ts
import { createCategoryRegistry } from '@omne-harness/assets'
import { agentBodyContract } from '@omne-harness/agent-contract'

createCategoryRegistry().register(agentBodyContract())
```

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api/README.md) is a navigation page to the source files. The source files own the types.

## Design

The [architecture](docs/architecture.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. The package does not install Cordis and does not depend on a concrete host. It depends on `assets` for the body contract, and `assets` does not depend on this package. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm turbo run test --filter=@omne-harness/agent-contract` from the repository root, and `pnpm typecheck` in this directory. turbo builds this package and its dependencies first. `pnpm test` in this directory runs Vitest only and does not build. The tests cover the declaration judgments, the output judgment, the identity decoders and structure judgments, the body contract, the export set, and the dependency direction. The [test page](tests/README.md) lists the files. These tests do not prove the runtime, a provider, the assembly, or the Cordis integration.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. The [docs](docs/README.md) page lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
