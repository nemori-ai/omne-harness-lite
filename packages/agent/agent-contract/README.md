PACKAGE_TEMPLATE_DRAFT

# agent-contract

## Responsibility and status

Domain values, operations, results, behavioral obligations, and replaceable provider ports. Agent declaration types and the two declaration judges are implemented. The designs of the runtime APIs are accepted. The runtime APIs are not implemented.

## Usage

```ts
import { judgeAgentDefinition } from '@omne-harness/agent-contract'
const result = await judgeAgentDefinition(raw)
```

`raw` is declaration input supplied by the caller. The [SPEC](SPEC.md#声明判断) owns limits and refusal categories.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api/README.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. Declaration tests verify existing behavior. Empty-entry tests only verify the scaffold. They do not establish runtime support.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. The [docs](docs/README.md) page lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
