# @omne-harness/pi-ai-anthropic

[中文](README_ZH.md)

## Responsibility and status

This member is the Anthropic family of the pi transport. It gives the Anthropic model records, the rules of the four engine hooks, the input meter, the `claude.json` vocabulary resource and the official profiles. The shared transport gets the family through `composeFamilies`. All models go through OpenRouter. The group architecture defines the responsibility in [members and conditions](../docs/architecture.md#成员与新增条件) and [the pi family contribution protocol](../docs/architecture.md#pi-家族贡献的取得协议).

The two examples and the integration test of this package consume it. The planned consumer is the release assembly (official profiles and `composeFamilies`). No assembly consumes this package yet.

### Support levels

Each level states only checked facts. A commit that changes the support level updates this table, the Chinese README, [SPEC](SPEC.md) and the group page.

| Level | Delivered | Entry | Verification |
| --- | --- | --- | --- |
| Public entry exported | `createAnthropicFamily`, `officialAnthropicProfiles`, `anthropicTokenizerResources`, `TokenizerResourceError`, `ANTHROPIC_RECORDS`, `ANTHROPIC_OWNER` and their types | Root entry | `public-entry.spec.ts` |
| Records | 4 current records at revision 1, migrated from the sealed official definitions. Pure data with committed fingerprints | `ANTHROPIC_RECORDS` | `records.spec.ts`, `adoptions.spec.ts` |
| Acquire and binding | One acquire gives one binding for the exact supplier. An unknown adoption, a wrong route, a mismatched tokenizer and a cancelled acquire fail as a whole | `createAnthropicFamily` with `composeFamilies` | `family.spec.ts` |
| Parameters and request body | Output limit, stop sequences and the reasoning efforts `low`, `medium`, `high` and `max`, written as themselves. `none` and every other parameter are `unsupported` before sending. The 1h cache marker goes on the last message. Without a place for it, the result is `unsupported` | `binding.rules.plan`, `binding.encode` | `plan.spec.ts` |
| Rules | Seal and replay of the whole signed reasoning group. Thinking without a signed group is `unsupported`. Usage arithmetic with cache reads and writes and a `usage-inconsistent` diagnostic. Object-root tool schema | `src/rules.ts` | `rules.spec.ts` |
| Meter | Estimate of the NFKC JSON of the visible projection with `claude.json` and the configured margin. The 28-pixel patch rule from pixel facts. No estimate for a request that carries a signed group | `binding.meter` | `meter.spec.ts` |
| Vocabulary resource | Reads the published `claude.json` and checks its SHA-256. Counts through tokenizer-tiktoken equal the independent reference. Special-token text counts as ordinary text | `anthropicTokenizerResources` | `meter.spec.ts` |
| Official profiles | One profile per current record. Each profile supplier acquires a binding and plans a request | `officialAnthropicProfiles` | `profiles.spec.ts` |
| Replay fixtures | The inline SSE cases of the sealed tests, as contract facts with the account of each finished response, with intended differences listed | `tests/fixtures` | `fixtures.spec.ts` |
| Cross-family replay, Anthropic side | A foreign assistant message loses its state and thinking and is named in a `replay-omitted` diagnostic of encode. An Anthropic message keeps its signed group. After a foreign tool turn, every record keeps the requested reasoning effort. By the project convention, no record turns reasoning off | `binding.rules.plan`, `binding.encode` | `cross-family-replay.spec.ts` |
| Integration of two families through the shared transport | This family and the OpenAI family go through one `composeFamilies` into `createPiTransport`. A local HTTPS server replays the fixture of each record of both families by the model in the request body. The sent body equals the fixture body, and the facts equal the fixture facts. The conformance suite runs its transport group for one record of each family, and the six obligations pass | `composeFamilies`, `createPiTransport` | `two-families.spec.ts` (slow tier) |
| Examples | [examples/anthropic-request.ts](examples/anthropic-request.ts) sends one request to `anthropic/claude-opus-5.5` through the proxy. The history has a foreign tool turn, and reasoning stays on at effort `low`. [examples/cross-family-history.ts](examples/cross-family-history.ts) alternates OpenAI and Anthropic models for four rounds of one history. It prints the replay projection of each round and whether each reply carried a reasoning state | Root entry | Type check. `examples.spec.ts` (slow tier) runs the examples only when `OMNE_LIVE_TESTS=1` and skips otherwise. Live evidence comes only from manual runs |
| Not delivered | The account of a stream that fails before its end. Credential resolution and continuous verification of real routes (#466) | None | No continuous evidence for these paths |

## Usage

The assembly reads the vocabulary resource once, creates the family once and gives it to the transport:

```ts
import { composeFamilies, createPiTransport } from '@omne-harness/pi-ai-transport'
import {
  anthropicTokenizerResources,
  createAnthropicFamily,
  officialAnthropicProfiles,
} from '@omne-harness/pi-ai-anthropic'

const anthropic = createAnthropicFamily({
  tokenizer: anthropicTokenizerResources(), // reads and checks claude.json
  limits, // ChatCompletionsLimits: decoder buffer limits
  margin: { percent: '20', source: marginPolicy }, // the margin of every estimate
})
const families = composeFamilies([anthropic])
const profiles = officialAnthropicProfiles({ retryPolicy, compactionTriggerPercent: '80' })
```

`createAnthropicFamily` only computes. The first `acquire` initializes the tokenizer. The family shares the tokenizer between its bindings. The tokenizer holds nothing to release. This package has no Cordis entry. [Cordis integration](docs/cordis.md) gives the reason. [Use and context](docs/context.md) has more detail.

## Contracts

The [behavior specification](SPEC.md) owns the records, the rules, the meter, the vocabulary resource, the official profiles and the acquire. [pi-ai-transport](../pi-ai-transport/SPEC.md) owns the family table, the gateway engine and the fixture check. [model-contract](../model-contract/SPEC.md) owns the profile, replay and meter types and rules. [Public API](docs/public-api.md) indexes the public entry.

## Design

`records.ts` holds the data. `rules.ts` and `images.ts` hold the revisioned rule tables. `meter.ts` writes the token input and measures. `tokenizer.ts` reads and checks the vocabulary file. `family.ts` binds through the engine. `profiles.ts` derives the official profiles. [Internal architecture](docs/architecture.md) explains modules, mechanisms and reasons. [Key flows](docs/flows.md) and [object model](docs/object-model.md) give the rest.

## Configuration and operation

The package has no defaults. All input is the argument of `createAnthropicFamily` and `officialAnthropicProfiles`:

- `tokenizer`: the tokenizer resources. Use `anthropicTokenizerResources()`. Their definition must equal the definition that the records name.
- `limits`: the decoder buffer limits of every binding.
- `margin`: the margin percent of every estimate and the adoption of that margin policy.
- `retryPolicy` and `compactionTriggerPercent`: the Model retry policy and the profile compaction trigger.

`anthropicTokenizerResources` reads the published `resources/tokenizers/anthropic-legacy/claude.json`, about 680 KiB. The rest of the package reads no environment, file or network. Node.js 24 or later is necessary.

## Verification

Run these commands at the repository root. The package engines require Node.js >=24. The pnpm version is 10.28.1.

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/pi-ai-anthropic
pnpm turbo run test --filter=@omne-harness/pi-ai-anthropic
pnpm run lint:deps
pnpm run check:docs
```

Turbo builds this package and its dependencies before the tests. After a change of the fixture table, build the package, then run `pnpm --filter @omne-harness/pi-ai-anthropic run fixtures`. After a new record, build the package, then run `pnpm --filter @omne-harness/pi-ai-anthropic run fingerprints`. Both scripts load the package from `dist`. The examples send real requests through a proxy and are not part of `test`. After a build, run `pnpm run examples` in the package directory. [examples/README.md](examples/README.md) gives the prerequisites and the expected output. [Tests](tests/README.md) describes the tiers and the sealed tests that are not ported. [SPEC "composition and verification"](SPEC.md#组合与验证) lists coverage and gaps.

## Maintenance

- A new model is a new record, a fingerprint line and a fixture. A changed model is a new revision. Never change a record in place.
- A changed rule is a new rule name. The records that use it get a new revision.
- An upgrade of js-tiktoken or a new `claude.json` changes the tokenizer definition of every record. Add new revisions. Update the digest in `src/tokenizer.ts` and the source record of the resource directory.
- A change to the support level updates this table, the Chinese README, the [group page](../README.md) and [package organization](../../../docs/package-organization.md).

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
provenance.json           Sources of the migrated data
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
resources/                Non-source runtime resources: claude.json, its license and source
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
