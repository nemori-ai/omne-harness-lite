# @omne-harness/pi-ai-openai

[中文](README_ZH.md)

## Responsibility and status

This member is the OpenAI family of the pi transport. It gives the OpenAI model records, the rules of the four engine hooks, the input meter and the official profiles. The shared transport gets the family through `composeFamilies`. All models go through OpenRouter. The group architecture defines the responsibility in [members and conditions](../docs/architecture.md#成员与新增条件) and [the pi family contribution protocol](../docs/architecture.md#pi-家族贡献的取得协议).

The integration test and the cross-family example of `pi-ai-anthropic` use this package as a dev dependency. The planned consumer is the release assembly (official profiles and `composeFamilies`). No assembly consumes this package yet.

### Support levels

Each level states only checked facts. A commit that changes the support level updates this table, the Chinese README, [SPEC](SPEC.md) and the group page.

| Level | Delivered | Entry | Verification |
| --- | --- | --- | --- |
| Public entry exported | `createOpenAiFamily`, `officialOpenAiProfiles`, `openAiTokenizerResources`, `OPENAI_RECORDS`, `OPENAI_OWNER` and their types | Root entry | `public-entry.spec.ts` |
| Records | 12 current records at revision 1, migrated from the sealed family policy. Pure data with committed fingerprints | `OPENAI_RECORDS` | `records.spec.ts`, `adoptions.spec.ts` |
| Acquire and binding | One acquire gives one binding for the exact supplier. An unknown adoption, a wrong route, a mismatched tokenizer and a cancelled acquire fail as a whole | `createOpenAiFamily` with `composeFamilies` | `family.spec.ts` |
| Parameters and request body | Output limit and the reasoning efforts that each model publishes, written as themselves: `low`, `medium`, `high` and `max`. `none` and every other parameter are `unsupported` before sending, because by the project convention no record turns reasoning off | `binding.rules.plan`, `binding.encode` | `plan.spec.ts` |
| Rules | Encrypted reasoning seal and replay, usage arithmetic with unknown Pro scope and a `usage-inconsistent` diagnostic for a negative input remainder, object-root tool schema | `src/rules.ts` | `rules.spec.ts` |
| Meter | o200k proxy estimate of the visible projection with the configured margin. Three image patch rules from pixel facts. The representation carries the `units` side table. Through a preparation lease: a unit with encrypted reasoning is counted once as the output tokens of its source call (sealed method `openai-complete-output-group-workload-estimated/1`), a continued call anchors the amount at its real input total with the margin on the new part only (`+continuation-anchored/1`); a missing or withheld source is a named unavailability, never zero. Without a lineage the behavior is the one before: no estimate for encrypted reasoning | `binding.meter` (`CalibratedInputMeter`) | `meter.spec.ts`, `calibration.spec.ts` |
| Official profiles | One profile per current record. Each profile supplier acquires a binding and plans a request | `officialOpenAiProfiles` | `profiles.spec.ts` |
| Replay fixtures | The inline SSE cases of the sealed tests, as contract facts with the account of each finished response, with intended differences listed | `tests/fixtures` | `fixtures.spec.ts` |
| Cross-family replay, OpenAI side | A foreign assistant message loses its state and thinking and is named in a `replay-omitted` diagnostic of encode. An OpenAI message keeps its state | `binding.encode` | `cross-family-replay.spec.ts` |
| Integration through the shared transport | This family and the Anthropic family go through one `composeFamilies` into `createPiTransport`. A local HTTPS server replays the fixture of each record by the model in the request body. The sent body equals the fixture body, and the facts equal the fixture facts. The conformance suite runs its transport group for one record of each family, and the six obligations pass | `composeFamilies`, `createPiTransport` | `two-families.spec.ts` of `pi-ai-anthropic` (slow tier) |
| Example | [examples/openai-request.ts](examples/openai-request.ts) sends one request to `openai/gpt-5.6-luna` through the proxy. The history has an assistant message with only a tool call, a tool result without content, and an image | Root entry | Type check. `examples.spec.ts` (slow tier) runs the example only when `OMNE_LIVE_TESTS=1` and skips otherwise. Live evidence comes only from manual runs |
| Not delivered | Credential resolution and continuous verification of real routes (#466) | None | No continuous evidence for these paths |

## Usage

The assembly creates the family once and gives it to the transport:

```ts
import { composeFamilies, createPiTransport } from '@omne-harness/pi-ai-transport'
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'

const openai = createOpenAiFamily({
  tokenizer: openAiTokenizerResources(),
  limits, // ChatCompletionsLimits: decoder buffer limits
  margin: { percent: '10', source: marginPolicy }, // the margin of every estimate
})
const families = composeFamilies([openai])
const profiles = officialOpenAiProfiles({ retryPolicy, compactionTriggerPercent: '80' })
```

`createOpenAiFamily` only computes. The first `acquire` initializes the tokenizer. The family shares the tokenizer between its bindings. The tokenizer holds nothing to release. This package has no Cordis entry; [Cordis integration](docs/cordis.md) gives the reason. [Use and context](docs/context.md) has more detail.

## Contracts

The [behavior specification](SPEC.md) owns the records, the rules, the meter, the official profiles and the acquire. [pi-ai-transport](../pi-ai-transport/SPEC.md) owns the family table, the gateway engine and the fixture check. [model-contract](../model-contract/SPEC.md) owns the profile, replay and meter types and rules. [Public API](docs/public-api.md) indexes the public entry.

## Design

`records.ts` holds the data. `rules.ts` and `images.ts` hold the revisioned rule tables. `meter.ts` writes the token input and measures. `family.ts` binds through the engine. `profiles.ts` derives the official profiles. [Internal architecture](docs/architecture.md) explains modules, mechanisms and reasons. [Key flows](docs/flows.md) and [object model](docs/object-model.md) give the rest.

## Configuration and operation

The package has no defaults. All input is the argument of `createOpenAiFamily` and `officialOpenAiProfiles`:

- `tokenizer`: the tokenizer resources. Use `openAiTokenizerResources()`. Their definition must equal the definition that the records name.
- `limits`: the decoder buffer limits of every binding.
- `margin`: the margin percent of every estimate and the adoption of that margin policy.
- `retryPolicy` and `compactionTriggerPercent`: the Model retry policy and the profile compaction trigger.

The package reads no environment, file or network. Node.js 24 or later is necessary.

## Verification

Run these commands at the repository root. The package engines require Node.js >=24. The pnpm version is 10.28.1.

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/pi-ai-openai
pnpm turbo run test --filter=@omne-harness/pi-ai-openai
pnpm run lint:deps
pnpm run check:docs
```

Turbo builds this package and its dependencies before the tests. The example sends a real request through a proxy and is not part of `test`. After a build, run `pnpm run examples` in the package directory. [examples/README.md](examples/README.md) gives the prerequisites and the expected output. After a change of the fixture table, run `pnpm --filter @omne-harness/pi-ai-openai run fixtures`. After a new record, run `pnpm --filter @omne-harness/pi-ai-openai run fingerprints`. [Tests](tests/README.md) describes the tiers and the sealed tests that are not ported. [SPEC "composition and verification"](SPEC.md#组合与验证) lists coverage and gaps.

## Maintenance

- A new model is a new record, a fingerprint line and a fixture. A changed model is a new revision. Never change a record in place.
- A changed rule is a new rule name. The records that use it get a new revision.
- An upgrade of js-tiktoken changes the tokenizer definition of every record. Add new revisions.
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
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
