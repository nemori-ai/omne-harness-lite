# @omne-harness/tokenizer-tiktoken

[中文](README_ZH.md)

## Responsibility and status

This member is the tiktoken engine adapter for `ModelTextTokenizer`. A family meter passes its own vocabulary and special-token table to it and gets a tokenizer. The group architecture defines the responsibility in [members and conditions](../docs/architecture.md#成员与新增条件) and [tokenizer resources and metering](../docs/architecture.md#tokenizer-的资源与计量分工).

This package only wraps the engine. It checks the resources at initialization. `count` is a pure computation. This package holds no vendor vocabulary. `pi-ai-openai` consumes this package with the o200k vocabulary. `pi-ai-anthropic` consumes it with the `claude.json` vocabulary that it publishes.

### Support levels

The table has five levels. Each level states only checked facts. A commit that changes the support level updates this table, the Chinese README, [SPEC](SPEC.md) and the group page.

| Level | Delivered | Entry | Verification |
| --- | --- | --- | --- |
| Public entry exported | Run-time value `createTiktokenTokenizer`; types `TiktokenRanks` and `TiktokenResources` | Root entry | `public-entry.spec.ts` checks that the root entry has one run-time export |
| Initialization checks implemented | The implementation revision equals the installed js-tiktoken. The vocabulary digest and the configuration digest equal the SHA-256 of the canonical JSON. Any mismatch returns `unavailable` | Root entry; `src/tokenizer.ts`, `src/digest.ts`, `src/engine-version.ts` | Fast tier with the real js-tiktoken 1.0.21, o200k and a synthetic vocabulary. The digest constants come from outside this package |
| Count implemented | Special-token spellings in text count as ordinary text. Adjacent text segments join before encoding. A special-token segment uses only the fixed table, else `unsupported-token`. An empty sequence counts `"0"`. Text that is not well-formed Unicode returns `invalid` | `ModelTextTokenizer.count` | Fast tier. o200k counts match the full js-tiktoken encoder. Synthetic counts match hand-computed values |
| Build output verified | The build output initializes and counts in another process and another directory, with the same results as the source. A version mismatch also returns `unavailable` | `dist/index.js` | Slow tier, child process. No consumer installs the package outside the workspace |
| Family consumers verified | `pi-ai-openai` passes the o200k ranks. `pi-ai-anthropic` passes `claude.json`: it checks the SHA-256 of the file when it reads it, and the count through this package equals the @anthropic-ai/tokenizer 0.0.4 reference of 150 | The tokenizer resource functions of the two family packages | The fast meter tests of the two family packages. These checks are in the family packages, not in this package. No consumer installs the package outside the workspace |

## Usage

A family member imports the factory and the types from the root entry. It initializes once, before it publishes its metering:

```ts
import o200k from 'js-tiktoken/ranks/o200k_base'
import { createTiktokenTokenizer } from '@omne-harness/tokenizer-tiktoken'

const created = createTiktokenTokenizer({
  definition, // TokenizerDefinition: the four adoptions that the family gives
  ranks: { patStr: o200k.pat_str, specialTokens: o200k.special_tokens, bpeRanks: o200k.bpe_ranks },
  specialTokens: { '<|endoftext|>': 199999 },
})
if ('failure' in created) throw new Error(created.failure.kind)
created.ok.count([{ kind: 'text', text: 'hello world' }]) // { ok: { tokens: '2' } }
```

Set `definition.implementation.revision` to the installed js-tiktoken version. Compute `vocabulary.digest` and `configuration.digest` as [SPEC "canonical JSON"](SPEC.md#规范-json) states. This package installs model-contract, operation-result and js-tiktoken. It does not install Cordis or any family. It has no Cordis entry; [Cordis integration](docs/cordis.md) gives the reason. [Use and context](docs/context.md) has more detail.

## Contracts

The [behavior specification](SPEC.md) owns the initialization checks, the canonical JSON, the count rules, ownership and failures. [model-contract](../model-contract/SPEC.md#分词与完整请求计量) owns the tokenizer types and the shared count rules. [Public API](docs/public-api.md) indexes the public entry.

## Design

`tokenizer.ts` owns initialization and counting. `digest.ts` writes the canonical JSON and computes the digest. `engine-version.ts` reads the installed js-tiktoken version. [Internal architecture](docs/architecture.md) explains modules, mechanisms and reasons. [Key flows](docs/flows.md) and [object model](docs/object-model.md) give the rest.

## Configuration and operation

This package has no configuration and no defaults. All input is the argument of `createTiktokenTokenizer`:

- `definition`: the four adoptions that the family gives.
- `ranks`: the vocabulary that the family supplies.
- `specialTokens`: the fixed table of special tokens that explicit segments can use.

Initialization reads the js-tiktoken `package.json` once to get the installed version. `count` reads no file, does not use the current directory and does not use the network. A tokenizer holds no resource to release. Node.js 24 or later is necessary.

## Verification

Run these commands at the repository root. The package engines require Node.js >=24. The pnpm version is 10.28.1.

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/tokenizer-tiktoken
pnpm turbo run test --filter=@omne-harness/tokenizer-tiktoken
pnpm turbo run test:slow --filter=@omne-harness/tokenizer-tiktoken
pnpm run lint:deps
pnpm run check:docs
```

Turbo builds this package and its dependencies before `test`, `test:fast` and `test:slow`. The slow tier needs the build output. [Tests](tests/README.md) describes the tiers and the fixture. [SPEC "composition and verification"](SPEC.md#组合与验证) lists coverage and gaps.

Results of `pnpm run package:template scan --member packages/model/tokenizer-tiktoken`:

- `integration` is `unknown`, because `docs/architecture/constraints.json` has no entry for this member. The architecture owner keeps that entry. The structure check does not depend on it.
- `adoption` is `current`: `package.json` has the `typescript-package@3.0.0` adoption marker with the variant `module`. `structure` is `pass`.
- With `--check`, the exit code is 0. This result does not show that the integration check or the business acceptance is complete.

## Maintenance

- Upgrade js-tiktoken only with a reason. Change the catalog in `pnpm-workspace.yaml`, update `ENGINE_REVISION` in the tests and tell the family members to update `implementation.revision`.
- A change to the canonical JSON makes every family digest invalid. Revise SPEC first and update all family members.
- A change to the count rules updates SPEC, the tests and [key flows](docs/flows.md).
- A new run-time dependency follows the dependency direction of the group architecture.
- A change to the support level updates this table, the Chinese README, the [group page](../README.md) and [package organization](../../../docs/package-organization.md).

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
