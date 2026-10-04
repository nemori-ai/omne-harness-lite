# @omne-harness-lite/pi-ai-transport

[中文](README_ZH.md)

Plan one OpenRouter request, send it over HTTPS, and translate SSE into public arrival events. This experimental ESM workspace package contains a targeted pi 1.0.0 fork and is not published on npm.

Every caller supplies complete model definitions explicitly. There are no default models. `officialModelIds` is derived from the eight public `<family>Definitions` lists, which now carry complete MP4 declarations for all 37 confirmed identities. Every project cap is finite; unavailable upstream limits are explicitly `unknown`. A complete declaration supports pure reading and profile construction, while real model/provider sending and cache certification require separate evidence. See the [realization status](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md).

## Public API

| Export                                                                    | Purpose                                                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ModelDefinition`, `ModelRoute`, `ParameterRule`, `ParameterRules`        | Complete capabilities and explicit per-route reminder, eight parameter rules, recognized private keys and cache values |
| `readModelDefinition(definitions, coordinates)`                           | Immutable exact-version observation; does not acquire usage rights                                                     |
| `configurationSchema(definition, provider)`                               | Closed Draft 2020-12 Schema, generated from route data without defaults                                                |
| `interpretConfiguration(definition, values, provider)`                    | The same route's strict, lossless configuration interpretation                                                         |
| `createOfficialProfileContent(definition, options)`                       | Construct and judge core content; no directory write, registration or timestamp                                        |
| `planRequest(input, definitions, meter, execution, preparer?)`                                  | Asynchronous fixed-byte plan and final input admission with a trusted, versioned model/provider meter                          |
| `createPiAiTransport(options)`                                            | Explicit definitions, bound input meters and owned pool with plan/send/read/close                                      |
| `sendRequest`, `readStream`                                               | Independent functions borrowing explicit network resources                                                             |
| `createModelTransportService`, `AdaptationLease`, `RetirementPolicy`      | Process-local precise registration, fixed leases and explicit draining                                                 |
| `parseSSE`, `canonicalInteger`, `generatedCallId`                         | Framing and exact deterministic identity helpers                                                                       |
| `officialModelIds`, eight `<family>Definitions` and `<family>ModelRoutes` | Complete MP4 declarations, exact route policies and derived target IDs                                                 |
| `officialCatalog`, `officialCatalogRevision`, `createOfficialCatalogProfile(entry, revision)` | Every official leaf with its only route, bound input-meter factory and derived initial cache setting; the catalog's publication revision; profile content per entry |
| `OPENROUTER_BASE_URL`, `PI_AI_CARRIABLE_MODALITIES`                       | Product endpoint and currently carried text/image input                                                                |

Pure reads return `{ ok }`, `invalidInput` or `unavailable`. The content builder preserves core representation rejection names such as `parameter_out_of_range` and `max_output_exceeds_profile`; definition/route/configuration consistency failures are provider `invalidInput`. Unknown exact versions/routes are unavailable; illegal declarations/configurations are invalid input. Errors contain finite rejection categories, not configuration contents. The root entry does not load Cordis. `./plugin` is the explicit Cordis 4.0.4 entry.

## Official catalog

`officialCatalog` lists every official leaf (currently 37) in family order. Each entry gives `family`, `definition`, the single route key `provider`, `createInputMeter(definition)`, the bound factory's exported name `inputMeterFactory` and `cache`. The model-to-meter binding is written once, in `src/official-catalog.ts`: the two DeepSeek leaves use their own factories; OpenAI, Anthropic, Google, xAI, Qwen and Moonshot use their family factory; ZAI lists every leaf: `createGlm52InputMeter` for GLM-5.2, `createGlm53InputMeter` for GLM-5.3 and GLM-5.3-Flash, and `createZaiCommercialInputMeter` for GLM-5.3-Prime and GLM-5.3-FlashX. `cache` is derived from the route declaration: `automatic` stays automatic; `explicit` takes the first declared TTL and the first declared breakpoint layout. It is an initial value; a caller wanting another declared value builds its own configuration with `createOfficialProfileContent`. `createOfficialCatalogProfile(entry, revision)` builds content for the entry's only route with fallback disabled and the derived cache, and returns the same result shape as `createOfficialProfileContent`; it writes no directory and registers nothing. The catalog holds no meters: the consumer calls `createInputMeter` and owns that construction cost (the first meter of a family loads its pinned tokenizer once per process).

`officialCatalogRevision` is a positive integer that rises by one with every catalog change. A consumer that publishes a directory manifest, such as the minimal demo, derives its manifest ordinal from it, so an existing data directory picks up a changed catalog without consumer edits. `tests/official-catalog.spec.ts` freezes the catalog fingerprint (model ID, definition and implementation revisions, meter algorithm revision and factory name per leaf) with its revision in `tests/fixtures/official-catalog/fingerprint.json`; a changed fingerprint without a raised revision fails.

To add a leaf: add its complete definition, pinning exactly one route, to `official-models/<family>.ts`; add a meter under `input-meters/` if the family factory does not accept it; bind it in `official-catalog.ts` if its family lists leaves (DeepSeek, ZAI); raise `officialCatalogRevision`; append the new revision and fingerprint to the fixture and replace its leaf list. A leaf in an existing family-factory export enters the catalog automatically, and `tests/official-catalog.spec.ts` builds every leaf's meter and profile. Loading the catalog asserts that its identities equal `officialModelIds` and that every leaf pins one route and has a meter binding, so a family or leaf left unbound fails at module load instead of surfacing later as a missing item. Catalog membership is not certification: real per-leaf OpenRouter evidence is recorded in the [realization verification](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md).

## Define an explicit teaching fixture

Save this as `example-definition.ts`; the following examples import its values. These capability and parameter facts are synthetic, for local controlled tests only. They do not describe an official model and must not be published or sent to a live route. A production definition needs verified facts and an adopted configuration source.

```ts
import type {
  ModelDefinition,
  InputMeter,
  RetirementPolicy,
  TransportPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  openRouterCredentialRedactionConfig,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime-local'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'

// Synthetic teaching data for controlled tests only. Never publish or call this as a live model.
export const definition: ModelDefinition = {
  modelId: 'example/controlled-text',
  revision: 'example-1',
  implementation: { name: 'example:openrouter-text', revision: '7' },
  capabilities: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 128,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
  },
  routes: {
    'example-provider': {
      reminderRole: 'developer',
      parameters: {
        reasoningEffort: { kind: 'pass' },
        temperature: { kind: 'pass' },
        topP: { kind: 'pass' },
        seed: { kind: 'pass' },
        maxOutputTokens: { kind: 'pass' },
        stopSequences: { kind: 'pass' },
        frequencyPenalty: { kind: 'pass' },
        presencePenalty: { kind: 'pass' },
      },
      extra: { example_flag: { kind: 'pass' } },
      cache: { mode: 'automatic' },
    },
  },
}
export const definitions: readonly ModelDefinition[] = [definition]
export const controlledMeter: InputMeter = {
  modelId: definition.modelId,
  definitionRevision: definition.revision,
  implementation: definition.implementation,
  provider: 'example-provider',
  algorithmRevision: 'local-controlled-example-1',
  evidence: 'synthetic local fixture; never use for real model admission',
  tokenizerRevision: 'synthetic/1',
  replayRevision: 'unsupported/1',
  transformRevision: 'openrouter-wire/2',
  measureReplay: () => ({ kind: 'unavailable' }),
  measureNew: () => ({ kind: 'unavailable' }),
  measureFull: () => ({ kind: 'exact', tokens: 1 }),
}

const reminder = judgeMessage({
  id: 'reminder-example',
  type: 'system_reminder',
  nature: 'event',
  source: { kind: 'extension', extension: 'example:reminder' },
  createdAt: '2026-09-27T00:00:00Z',
  blocks: [
    {
      id: 'text-example',
      kind: 'text',
      text: 'Continue the task.',
      visibility: { toHuman: true, toModel: true },
    },
  ],
})
if ('rejected' in reminder) throw new Error(reminder.rejected)
export const request: PlanInput = {
  calibration: { kind: 'none', reason: 'no_observation' },
  outputHistory: [],
  tokenMargin: { multiplier: 1, reserveTokens: 0 },
  target: {
    kind: 'model_call',
    callId: unwrap(parseOpaqueIdentifier('call-example', 'ModelCallId')),
    dispatch: 1,
  },
  routeName: definition.modelId,
  provider: 'example-provider',
  messages: [reminder.ok],
  tools: [],
  parameters: { maxOutputTokens: 64 },
  snapshot: {
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: { revision: 'example-automatic-1', values: { cache: { mode: 'automatic' } } },
    },
    providers: ['example-provider'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 128,
    inputConstraints: definition.capabilities.inputConstraints,
    upstreamInputLimits: definition.capabilities.upstreamInputLimits,
    updatedAt: '2026-09-27T00:00:00Z',
  },
}
export const networkPolicy: TransportPolicy = {
  maxConnections: 4,
  idleConnectionTimeoutMs: 30000,
  connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536,
  maxSseEventBytes: 8388608,
  credentialRedaction: openRouterCredentialRedactionConfig,
}
export const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
```

## Plan a reminder without sending

All four pure surfaces and planning work without a runtime, directory, tenant or connection pool.

```ts
import {
  readModelDefinition,
  configurationSchema,
  interpretConfiguration,
  createOfficialProfileContent,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { definition, definitions, request, controlledMeter } from './example-definition.js'

const binding = request.snapshot.adaptation
console.log(
  readModelDefinition(definitions, {
    implementation: binding.implementation,
    definition: binding.definition,
  }),
)
console.log(configurationSchema(definition, request.provider))
console.log(interpretConfiguration(definition, binding.configuration.values, request.provider))
const content = createOfficialProfileContent(definition, {
  providers: request.snapshot.providers,
  allowFallback: false,
  configuration: binding.configuration,
})
if ('rejected' in content) throw new Error(content.rejected)
// This is a construction example only; it does not publish the synthetic content.
const result = await planRequest(request, definitions, controlledMeter, {
  signal: new AbortController().signal,
})
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // developer; no HTTP request
```

Each route declares its reminder role; the model name selects no policy. OpenAI routes use developer, other supported routes use an appropriate verified dedicated role or user. Reminder identity/order and the separate compaction mapping are preserved.

`pass` keeps a supplied value, `drop` records its name, and `select` accepts exact values or an explicit numeric interval, otherwise dropping or adjusting to a declared value. Absent values remain absent. Decimal/integer comparison never rounds through Number. Current G-22 permits only pass for maxOutputTokens; profile/request representation limits still apply. Unknown or protected private keys are dropped under their **original keys**, including keys beginning with `extra.`. Empty actual extra is omitted.

Automatic cache configuration is exactly `{ cache: { mode: 'automatic' } }` and emits no manual controls. Explicit route declarations contain `ttlValues` and complete `breakpointLayouts`; configuration must supply mode, TTL and one declared layout. No TTL/default/layout combinations are hardcoded in shared code. Schema and interpreter read the same declaration. Planning a control does not establish upstream adoption, a cache hit or expiry behavior.

## Final input admission

`PlanInput.tokenMargin` is required for every plan: `{ multiplier, reserveTokens }`, with a finite decimal multiplier at least 1 and a nonnegative integer reserve. The final serialized request is measured before a `planned` result can be signed. Request UTF-8 bytes, decoded inline image bytes and image count are exact; image duplicates and tool-result images count each time. Missing caps yield `input_limit_missing`. A known exact excess yields `input_limit_exceeded` with `basis: 'exact'`; an estimated token admission excess has `basis: 'estimated'`, both the raw estimate and the margin-adjusted admission. Unmeasurable inputs yield `input_size_unavailable`. Upper-bound excess is unmeasurable, not an actual excess. No pre-send rejection performs an HTTP request.

`InputMeter` is trusted executable code supplied to the function or transport factory, not model-profile JSON or a caller-provided permission flag. Its exact definition, provider, algorithm revision and evidence are bound to the contribution; a plan from another meter source cannot be sent through this host. `createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)` uses a pinned DeepSeek V4 Pro public prompt encoder and tokenizer for the exact `deepseek/deepseek-v4-pro-0813` / `deepinfra/fp8` route. It returns an **estimate** because OpenRouter/DeepInfra do not publish a byte-identical private prompt projection in the inspected sources. Its packaged tokenizer/config hashes and official text, reasoning and tool golden vectors are checked offline. The caller chooses the explicit margin; this estimate never replaces upstream usage or cost. Official definitions without an evidenced meter cannot be successfully planned. The synthetic `controlledMeter` above proves only the local protocol example and must never be sent to a real provider.

The 37 supplied models use the shared refusal-text reader. Current OpenAI and Anthropic definitions bind their family implementation at `mp4-18`; Moonshot, DeepSeek and the two open-weight Qwen leaves bind `mp4-19`; xAI and the six commercial Qwen leaves bind `mp4-20` (each family's own implementation name); all five ZAI leaves bind `mp4-18`; Google remains at `mp4-17`. `tests/official-reader-bindings.spec.ts` checks all current factories, complete profiles and actual planner calls against explicit release fixtures. Factories reject previous execution bindings. These local checks do not certify all 37 live OpenRouter routes; Pro context usage remains explicitly unknown.

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` binds the separate V4.1 Flash tokenizer and public encoder to `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`. Official multi-turn/tool and two-image prompts are checked against pinned upstream vectors. The `mp4-19` implementation estimates inline images from their dimensions using the pinned public image processor's patch/downsample grid and 1,024-token maximum, replacing the placeholder already counted in the prompt. Actual provider preprocessing is not public. Image bytes and count still use the exact final-body gate. Unknown image URLs or unsupported content make the meter unavailable before HTTP. The estimate includes the serialized request fields outside the rendered prompt without treating inline base64 as text tokens. Configure the margin per request; these estimates do not replace reported usage or prove live image delivery.

DeepSeek Flash and Pro now bind definition revisions 5 and 6 respectively at `mp4-19` (Flash algorithm `deepseek-v41-flash-reference-5`, Pro `deepseek-v4-pro-reference-4`, boundary `deepseek-reference-boundary/2`, transforms `/2`). They share wire-metadata, visible-detail projection and marginal counting while retaining their distinct reference encoders. One finite `reasoning_details` shape is explained: an assistant message with exactly one detail whose own keys are `type`, `text`, `format`, `index`, with `reasoning.text`, a string text, the literal `unknown` and an index of exact value 0, and no parallel `reasoning` or `reasoning_content`. Only a meter-side copy maps that text to the reference encoder's `reasoning_content`; full, φ and δ share the mapping. The actual body, serialized bytes, output blocks and digests are unchanged, the text is not counted again as serialized metadata, and neither the original output count nor `reasoning_tokens` is added. The result is still an **estimate**: the OpenRouter/DeepInfra private projection is unknown and no error bound is claimed. Every other detail shape, summary, encrypted payload or mixed reasoning source stays unavailable, so the request is refused before HTTP; ciphertext JSON never substitutes for hidden reasoning tokens. Both factories run the shared `measureFull`/`measureReplay`/`measureNew` source guards on their own public methods. Previous `mp4-18` bases are not proven compatible and fall back to full; old factories are not retained.

`createOpenAiInputMeter(definition)` supplies the 12 current OpenAI leaves through one `openaiFamilyRecord` table and one `openAiOutputHistoryPolicy`. GPT-6 Astra/Sol/Luna use definition revisions 5/6/7, their three Pro leaves use revision 6, GPT-5.6 Sol/Terra/Luna use revision 9, and their Pro leaves use revision 8; every current leaf binds `pi-ai:openai/mp4-18`. The factory rejects old execution bindings. Exact archived bindings remain finite original-fact rows for O interpretation only.

Visible input uses the pinned `js-tiktoken` `o200k_base` surrogate. GPT-5.6 base vision rules and the existing Astra sizing rule retain their documented local rounding; Sol/Luna and Pro images retain their explicitly estimated proxies. This is neither an exact tokenizer nor an upstream preprocessing guarantee. Actual image bytes, history, reminder roles and tool arguments/results remain in the submitted request. Unknown remote URLs, invalid/MIME-mismatched images, animated/incomplete GIF and unsupported details remain unavailable. Callers configure `tokenMargin`; usage and costs remain upstream facts.

The common output-group algorithm accounts for intact `openai-responses-v1` encrypted history as original upstream O once, with zero experimental net framing and `estimated` precision. O already includes reasoning tokens. Source model/provider/mode/binding and every original block/order must match the finite policy. A different model with no applicable opaque projector is rejected before metering or send; the original blocks are not stripped. Unknown formats, missing encrypted data, partial selection and unexplained opaque units never fall back to ciphertext tokenization. Full/new may use a legally interpretable O when original I is unavailable; φ requires known original I and the same complete effective basis. The six Pro leaves retain `scope_unknown` and cannot re-anchor I. These local rules do not certify real retention, zero framing or an error bound.

`tests/openai-family-current.spec.ts` pins the current twelve leaves through the public invoke and the Cordis transport-service lease, with and without a tool, over three local TLS rounds with one inline 64px PNG. Ordinary leaves plan full, then marginal twice: φ equals the previous response's upstream O and the anchor is its observed input. Pro leaves plan full three times with `source_unavailable`; each full value equals an independent oracle of visible JSON tokens plus image tokens plus each earlier O once. The merged `reasoning.summary` and `reasoning.encrypted` details of every earlier reply are replayed byte for byte and never tokenized. The wire carries no `cache_control` (automatic cache), and `cached_tokens` is read as cache read. Temperature, top_p, seed, stop and both penalties are dropped, `max_tokens` is passed, and an effort outside the leaf's set (Astra `none`) is dropped. A foreign-route opaque history is `unavailable` and a non-`openai-responses-v1` group is `input_size_unavailable`, both before HTTP. OpenRouter may stream the literal `[REDACTED]` in place of encrypted reasoning data. As with the xAI family, this placeholder is missing ciphertext under the r5 provider mapping ("signature/ciphertext missing → unavailable"), not a complete group. The retained history is not stripped, and the next round is `input_size_unavailable` before any HTTP, for ordinary and Pro leaves alike. The implementation stays at `mp4-18`. That rests on an assumption, left to independent review: the change only narrows a shape that should never have been accepted, it changes no accepted estimate, and it creates no new saved basis. The upstream stream is synthetic; this is not live route certification.

`createAnthropicInputMeter(definition)` supplies four current Claude leaves at definition revision 4 / `pi-ai:anthropic/mp4-18`, using one finite family policy. Visible text/images retain the pinned legacy Claude BPE and vision-patch approximation; this is a rough estimate rather than the newer official tokenizer. Retained signed `reasoning.text` and encrypted `reasoning.encrypted` need a complete, unchanged assistant output group and known upstream O. The shared full/new/φ implementation substitutes the entire group once with estimated O plus zero experimental net framing. Ciphertext, signatures and unexplained reasoning are never ordinary JSON tokens. An encrypted detail whose data is the literal `[REDACTED]` streaming placeholder is not a complete group: the next request is refused with `input_size_unavailable` before any HTTP request. Opus 5.5 and Fable 5.1 also require owned evidence of the unchanged original prefix; missing necessary evidence makes the contribution unavailable. Original `/2` facts remain unchanged and cannot prove a `/3` signed prefix.

An opaque Anthropic history block whose route does not match the selected model is unavailable at planning; it is never made sendable by dropping its signed content. Same-route complete groups retain their opaque bytes and tool pairing.

Anthropic's configured `last_message` layout selects the last real nonempty text block. A terminal user message containing only validated images uses top-level OpenRouter `cache_control`, with TTL from the validated configuration. Empty or ambiguous targets never backtrack or invent text. The single shared selector also validates cache-neutral projection; only its exact configured marker is removed from the metering copy. Wire bytes still include the marker. Public and Cordis service local tests cover the composition; upstream cache hits and current per-leaf usage accuracy require separate real observations.

`tests/anthropic-family-current.spec.ts` runs three local TLS rounds per leaf, with and without tools, through both the public transport and the Cordis transport-service lease. It checks full then marginal measurement, one HTTP request per round with bytes equal to the plan, and one configured 1h marker on the terminal message. The first round uses the id-less text-then-signature shape, which becomes one signed detail. Later rounds use an encrypted group and then two separate signed details. Every earlier group is replayed once, in order, and its original O counts once. The same file checks these refusals: other cache TTLs and layouts are rejected; unsigned `reasoning.text`, `[REDACTED]` placeholders and groups from another route are refused before HTTP; audio and video stay `modality_not_carried`. It also checks that a refusal replays as ordinary text and that a terminal pure image uses the top-level TTL. The upstream is synthetic, so these checks do not replace real OpenRouter certification of the four models.

`createQwenInputMeter(definition)` supplies all eight fixed Alibaba models. Every Qwen leaf is **full-only**: replay (φ) and new-input (δ) contributions are unavailable and not adopted, so each request is measured again in full. The two open-weight leaves, Qwen3.8 2.4T-A95B and 27B, bind definition revision 4 / `mp4-19` to their pinned public vocabulary/Jinja estimators; 27B keeps its unscaled canonical inline PNG subset. Their declared `high`/`max` request effort renders the template's default xhigh instruction, following Alibaba's documented high/max-to-xhigh mapping. This estimated scope extension has no actual effort holdout or error bound. Archived and current real streams from both open leaves on the `alibaba` route attach one visible `reasoning.text` detail, identical to the plain `reasoning` fragment, to every reasoning fragment; the reader merges them into one entry and the next request replays that entry unchanged. Visible reasoning history is metered as a finite estimate: an assistant message whose `reasoning_details` is exactly one entry with own keys `type`, `text`, `format`, `index` (`reasoning.text`, a string text other than `[REDACTED]`, format `unknown`, index 0, no `id` or `signature`), and whose parallel `reasoning`, if present, is the identical string (compared before the template's trim), has that text placed once into the public template's `reasoning_content` slot on a meter-only copy, exactly as a plain `reasoning` string would be. The sent body and bytes keep the details; no output or `reasoning_tokens` term is added and the caller's margin is applied once at the final gate. How OpenRouter converts details for Alibaba is unknown, so the result stays `estimated` with no error bound. Summary or encrypted reasoning, any additional key (including an explicit `signature: null`), several or zero entries, another format or index, a differing parallel `reasoning`, any parallel `reasoning_content`, details on non-assistant messages, and 27B's `none` and other effort shapes remain unavailable. The factory's full, replay and new methods (all eight leaves) run the shared source and history guard, so a directly supplied malformed history is refused rather than metered. The real upstream replay of these details and the required same-route comparison of details against a plain `reasoning` string (QV4 with P2) are recorded in the [Qwen visible-reasoning decision](../../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/qwen-visible-reasoning-decision.md). The six commercial leaves (Max 0902, Max Prime, 3.8 Flash, 3.7 Max/Plus/Flash) bind definition revision 4 / `mp4-20` to the same pinned public 2.4T template and tokenizer (algorithm `<leaf>-public-template-1`), with three template settings fixed by each binding rather than by configuration: `preserve_thinking` (3.8 leaves render every assistant's visible reasoning; 3.7 leaves render it only for assistants after the last user query that is not a wrapped `<tool_response>`, so earlier reasoning counts 0), the effort instruction (3.8: the template default xhigh, which 0902's declared `high`/`max` also renders; 3.7: none) and the template's `tojson` semantics (wire key order without ASCII or HTML escaping, as transformers and vLLM render the template). Because the render basis changed, the tokenizer revision is new and explicit (`tokenizer-basis/qwen-commercial-38-template-wire-order-1` and `-37-`), and observations made under the former final-JSON estimator are not reused. The settings follow Alibaba's parameter reference (3.8 default on, 3.7 default off); Max Prime is on no list and follows 3.8 as an assumption. On the 18 three-round tool requests of recorded run batch8, rebuilt byte-for-byte, these settings reproduce every upstream `prompt_tokens` value (a key-sorted `tojson` gives +1). That is one scenario with no holdout; the single-user constants (−9 on 3.8, 0 on 3.7) come from older observations; and whether OpenRouter forwards `preserve_thinking` is unknown. If the 3.7 upstream starts keeping earlier reasoning, this estimate undercounts, so it is not a lower bound. The four-key detail projection is the one the open leaves use. Summary, id-bearing or several details, a differing parallel `reasoning`, non-object call arguments, efforts outside the route (any effort on the five routes that drop it), images and unrecognized fields remain unavailable without removing history. The former estimator's structural checks remain: the exact provider object with `require_parameters: true`, a cache control only on an explicit-cache route's system text block and only as `ephemeral`/`5m`, and the exact tool and call member sets. Text-only 2.4T and 3.7 Max reject images as `modality_not_carried`. Video is declared on five leaves, yet `modality_not_carried` applies until an adopted wire projection exists, so the declared video domain is unverified. Six routes use explicit `5m`/`system` caching and the two Flash routes use automatic caching; neither retention nor hit rate is established. Callers supply the token margin; actual usage/cost always remain upstream facts. `tests/qwen-family-current.spec.ts` runs three local TLS rounds per leaf through both the public transport and the Cordis transport service, with and without tools. `tests/qwen-commercial-rounds.spec.ts`, `tests/qwen-commercial-template.spec.ts` and `tests/qwen-commercial-counterexamples.spec.ts` cover the commercial leaves: three local rounds replaying reader-merged details per leaf, route effort domain, tools and entry path; the renderer against independent Jinja goldens (`tests/fixtures/qwen/commercial-reference-render.py`) and the batch8 bodies; the details and `reasoning` string equivalence; the open leaves' output captured before the change; the counterexamples; and the factory methods called directly. `pnpm exec vitest run tests/qwen-visible-reasoning-rounds.spec.ts tests/qwen-visible-reasoning.spec.ts` replays the fragments of the six archived open-leaf raw streams in their exact shape through the real reader: three rounds per open leaf at default, `high` and `max` effort, with and without tools, on both paths, with later rounds full estimated from the replayed details; the equivalence of the details count and the plain `reasoning` string count (27B also behind an inline PNG turn); every refused shape; and the guarded factory methods. These synthetic rounds do not replace real OpenRouter certification; the recorded real public rounds of the two open leaves, and the leaves and paths not yet run, are listed in the [transport verification](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md).

`createGlm52InputMeter(definition)` and `createGlm53InputMeter(definition)` cover GLM-5.2 (definition 3 / `mp4-18`), GLM-5.3 and GLM-5.3-Flash (definition 3 / `mp4-18`) text/tool requests on `z-ai/fp8` using pinned public templates and vocabulary. Results are estimates for the fixed OpenRouter routes, with an explicit caller margin. GLM-5.3 sends the declared `low`/`high`/`max` effort and GLM-5.2 sends `high`; Flash and FlashX send no effort. Any other explicit effort is dropped and reported in `droppedParameters`. `createZaiCommercialInputMeter(definition)` separately binds Prime (definition 4 / `mp4-18`) on `alibaba` and FlashX (definition 3 / `mp4-18`) on `z-ai/fp8` to a rough estimate. It uses the pinned public GLM-5.3 template/tokenizer projection minus one token, fitted and checked on eight selected-route text/tool observations. This does not establish hosted tokenizer identity, exact accounting or an error bound. Prime admits its already-declared `low`/`high`/`max` request effort through that same public template, without refitting the one-token correction. This estimated scope extension has no actual effort holdout or hosted-template guarantee. Malformed or undeclared effort structures and unsupported cache layouts remain unavailable. Each factory accepts only its leaf's current exported release: retired or unpublished definition/implementation revisions throw at construction. The full, replay and new methods of all five leaves run the shared source and history guard, so a directly supplied malformed history is refused rather than metered; valid inputs keep their values. Bundled source licenses, including the distinct GLM-5.3 license, accompany the tokenizer artifacts.

All five ZAI leaves are **full-only**. The meters supply no incremental replay/new contribution (`unsupported-marginal/1`). Every round, including a continuation that carries the previous response observation, is measured in full as `estimated`. φ/δ are unavailable and not adopted, and no incremental estimate is claimed. Visible reasoning history is metered by the `mp4-18` release of all five leaves (algorithms `glm-5.2-public-template-2`, `prime-public-glm53-declared-effort-route-fit-3`, `flashx-public-glm53-route-fit-2`, `glm-5.3-public-template-2` and `glm-5.3-flash-public-template-2`; tokenizer revisions pinned to the unchanged `tokenizer-basis/glm-5.2-public-template-1`, `…-route-fit-2`, `…-route-fit-1`, `tokenizer-basis/glm-5.3-public-template-1` and `tokenizer-basis/glm-5.3-flash-public-template-1`). An assistant's plain `reasoning` string, or its one visible `reasoning_details` entry (own keys exactly `type`, `text`, `format`, `index`; `reasoning.text`, a string text other than `[REDACTED]`, format `unknown`, index 0, no `id` or `signature`) whose parallel `reasoning`, if present, is the identical string, is rendered once into the pinned template's think slot on a meter-only copy, as with `clear_thinking=false` for every historical assistant. GLM-5.2's template default would clear reasoning before the last user; that reading is recorded only for the real-route comparison. The sent body and bytes keep the details. No output or `reasoning_tokens` term is added, Prime/FlashX subtract their fitted token once, and the caller's margin is applied once at the final gate. The recorded Prime/FlashX streams' id-less, unsigned fragments join into one such entry; two reasoning runs separated by content are joined by the shared reader into one entry of the concatenated text, counted once as sent. How OpenRouter forwards the details and whether the route clears historical reasoning are unknown, so the result stays `estimated` with no holdout or error bound. Summary or encrypted reasoning, any additional key (including an explicit `signature: null`), several or zero entries, another format or index, a differing or non-string parallel `reasoning`, any `reasoning_content`, and details on non-assistant messages remain unavailable. GLM-5.2, Prime and FlashX were released first; GLM-5.3 and Flash followed at definition 3 / `mp4-18` after their real-shape observation (ZV0, 2026-09-30: one current-binding stream each, GLM-5.3 at effort `max` and Flash at its default, whose 139 and 78 detail frames all had exactly the four-key shape above with an identical parallel `reasoning` and one continuous reasoning run). The split between the batches was the published implementation revision, never a switch; the refusing definition 2 / `mp4-17` release is retired and throws at construction. Real replay upstream and the required same-route comparison of details, a plain string and no reasoning (ZV4) run only on the root budget ledger. A caller whose context assembly hides thinking from the model (`visibility.toModel: false`) sends no reasoning member, so such continuations plan and send normally. That is a caller decision in runtime context assembly. It is not a transport guarantee that reasoning replay works or is metered. Flash and FlashX declare image and video input. The meters have no image-counting evidence and return unavailable for image parts, so such requests are refused before HTTP. Video is out of scope for this delivery: the declaration is kept, but video is not carried (`modality_not_carried`).

`tests/zai-three-round-invoke.spec.ts` covers every leaf × accepted effort (omitted for Flash/FlashX) × with/without tools over local TLS. Each case runs three rounds through the public transport and through the Cordis transport service with the official model plugin. Replies without reasoning, and replies whose thinking the caller hides, both plan full/`estimated` every round and put no reasoning member on the wire. The hidden-thinking cases include the recorded Prime/FlashX streams. The file also pins reasoning history replayed as returned (every leaf plans round 2 full/`estimated` and sends it unchanged; history unchanged), the dropped out-of-set effort, and the Flash/FlashX video refusal. `pnpm exec vitest run tests/zai-visible-reasoning-rounds.spec.ts tests/zai-visible-reasoning.spec.ts` replays the fragments of the thirteen archived 2026-09-27 and five recorded 2026-09-28 raw streams in their exact shape through the real reader: three rounds per leaf at each current effort, with and without tools, on both paths, with later rounds full estimated from the replayed details (GLM-5.3 recorded no reasoning before ZV0 and replays the archived Flash fragments; the paid ZV0 streams are not in the repository); the pinned Jinja oracle for the GLM-5.2, GLM-5.3 and Flash templates (reasoning before and after the last user); the equivalence of the details count and the plain `reasoning` string count; every refused shape; and the guarded factory methods of all five leaves. These synthetic rounds do not replace real OpenRouter public/service certification of the five models, which remains pending.

Frozen evidence re-run on current source (2026-09-30). The earlier migration record compared meter coordinates only. Here the frozen values were replayed through current code. All five leaves moved to the `mp4-18` releases above without changing any text/tool value.

| Leaf           | Meter algorithm                                  | Frozen evidence replayed                                               | Result on current source                                                                                  |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GLM-5.3        | `glm-5.3-public-template-2`                      | independent pinned Jinja goldens, incl. reverse tool results and `low` | equal; no recorded stream                                                                                 |
| GLM-5.3 Prime  | `prime-public-glm53-declared-effort-route-fit-3` | four selected-route request wires; three recorded SSE (SHA-256 pinned) | estimates equal observed `prompt_tokens`; each stream assembles into one detail equal to the recorded one |
| GLM-5.3 Flash  | `glm-5.3-flash-public-template-2`                | independent pinned Jinja goldens                                       | equal; no recorded stream                                                                                 |
| GLM-5.3 FlashX | `flashx-public-glm53-route-fit-2`                | four selected-route request wires; two recorded SSE (SHA-256 pinned)   | same as Prime                                                                                             |
| GLM-5.2        | `glm-5.2-public-template-2`                      | independent Jinja text and tool/multiturn goldens                      | equal; no recorded stream                                                                                 |

The frozen evidence covers text/tools only. It does not establish effort holdouts, media support or public/service certification; the visible reasoning mapping rests only on the local oracles above. Re-run it with `pnpm exec vitest run tests/zai-*.spec.ts tests/official-zai-*.spec.ts`.

`createGoogleInputMeter(definition)` binds the two Gemini 3.7/3.8 Flash AI Studio definitions at revision 3 / `mp4-17`, on the single `google-ai-studio` provider with fallback disabled. It counts visible text and tools with the pinned Gemma4 comparator and a frozen per-model offset, returning a rough `estimated` result with an explicit caller margin. Eight fixed-route observations included separate fit and holdout inputs: maximum observed undercount was 10 tokens and maximum absolute error was 60; neither is an error bound. This is not the Gemini tokenizer. The declared `low`/`medium`/`high` request effort values are admitted as generation controls outside the messages/tools estimate; this extends the existing surrogate without refitting its offset or claiming effort-specific upstream accuracy. Omitted effort stays omitted; other values follow the definition’s existing drop rule. Actual effort holdouts remain required. The bundled tokenizer and license are included in packed consumers.

Google is full-only. The meter supplies no incremental replay/new contribution (`unsupported-marginal/1`), so every round, including multi-turn continuations, is measured in full and no φ/δ value is reported. Plain visible reasoning history (`reasoning`) is replayed and counted. Signed Gemini reasoning history (`reasoning_details`, such as `google-gemini-v1` text and signature entries) is replayed unchanged by the wire projection, but this meter returns unavailable for it: such a continuation is refused with `input_size_unavailable` before sending, and the history is not stripped. Inline images are also carried by the wire projection, yet there is no offline image-counting evidence, so the meter refuses them the same way. Audio and video remain declared input modalities but are out of scope for this delivery: they are not carried and are rejected as `modality_not_carried`. Unsupported effort structures, other opaque reasoning and unknown controls remain unavailable. Local TLS scenarios cover three-round public and Cordis transport invocation against a synthetic upstream; real OpenRouter public/service certification of both models is still pending.

`createXaiInputMeter(definition)` binds Grok 4.6 and 4.7 at definition 5 / `mp4-20`. Visible text/tools retain the first-party Grok Build UTF-8 byte surrogate over the final wire, with two-fit offsets of 141 and 1181. Independent visible tool-history holdouts overestimated complete input by 35 and 34 tokens. For a complete unchanged assistant output group with a finite known source, full/new/φ use its original upstream output count O once as a workload-related **estimated** input proxy; O already includes reasoning, so summary, encrypted payload, text and tools from that group are not counted again. Original definition 3/4 and definition 5 / `mp4-19` facts remain interpretable only as saved sources; old factories are not retained. A reported upstream identity is admitted only as the exact pair taken from the 2026-09-30 real raw SSE of both leaves: serving provider `xAI` and upstream model equal to the leaf's route id, identical in the output-group origin and the observed usage provenance. The calibration step accepts `xAI` as the display name of the `xai` route, so a same-basis continuation is a marginal. Absent identity is admitted and never filled in; a lone field, any other spelling (`xai`, `x.ai`, trailing space, another model id) or an origin/observed disagreement stays unavailable. Unknown formats and partial groups also remain unavailable, with the original wire intact. A changed current effort or max-token setting invalidates the input anchor, while full can independently interpret a valid original O. This estimate is neither exact input occupancy nor a proven upper bound; callers configure the margin. Complete context input includes uncached input plus both cache-read/cache-write components, and unknown components leave the total unknown. The frozen visible offsets were not fitted separately per effort. The identity mapping is implemented from the real originals and verified locally. Real three-round public and service evidence for Grok 4.6, including accepted ciphertext replay, and the ruling that Grok 4.7 is certified through Grok 4.6, are recorded in the [transport verification](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md) and the [xAI family decision](../../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/xai-family-decision.md); image input remains outside this meter's counting scope.

OpenRouter may stream `[REDACTED]` in place of encrypted reasoning data. This placeholder is not a complete replay group and remains unavailable for the O-based estimate.

`tests/xai-x5-local-replay.spec.ts` pins the identity guard for both leaves through the public invoke and the Cordis transport-service lease, using synthetic `xai-responses-v1` summary plus encrypted details, the original tool callId and a three-turn tool case over local TLS. With the real identity pair, the second turn is a marginal whose replay contribution is the original O, and the complete group is resent unchanged on turns 2 and 3; an unadopted identity (`xai`, `x.ai`, `xAI ` with a space, the other leaf's model, or a single field) returns `input_size_unavailable` before any further HTTP. Without identity, the complete group is resent unchanged, and an upstream refusal on the second turn is a failed invocation. `tests/xai-identity-three-round.spec.ts` runs both leaves, with and without a tool, for three rounds on both entries, streaming the frame order of the real originals (summary fragments, one encrypted detail, tool fragments, a finish frame, then usage); rounds 2 and 3 are marginals counting the previous round's O once. Apart from the identity literals, these synthetic cases are not live replay evidence.

Visible-only response reuse uses the shared JSON marginal estimator: it counts newly replayed visible units and new input against empty-message framing without repeating the stable prefix or tool declarations. Empty messages are allowed only for internal framing and remain unavailable through full-request measurement. The new algorithm/replay basis invalidates old input anchors; old saved complete output groups may still contribute O after source verification. No extra configuration is introduced. Images remain outside this meter’s supported counting scope.

```ts
import { createXaiInputMeter, xaiDefinitions } from '@omne-harness-lite/pi-ai-transport'

const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
const meter = createXaiInputMeter(definition)
// Supply this meter to createPiAiTransport({ ..., inputMeters: [meter!] }).
```

`createMoonshotInputMeter(definition)` binds Kimi K3 (`moonshotai/mxfp4`) and K2.7 Code (`moonshotai/int4`), both definition revision `3` on `pi-ai:moonshot@mp4-19`, to their pinned vocabulary and distinct XTML/Jinja prompt templates. Text, plain reasoning and paired tool history are estimated; the complete JSON envelope is not counted again. K3 orders consecutive parallel tool results by the preceding call IDs for its prompt estimate, following the pinned encoder; the transmitted history remains unchanged. Both models estimate inline PNG/JPEG/WebP image tokens with their pinned model-specific visual processors, including images in complete text/tool history. K3 sends only the `low`, `high` and `max` efforts and drops any other value; K2.7 Code drops every explicit effort and sends no `reasoning` member. Both drops are reported in `droppedParameters`.

The Moonshot meter is full-only. Every request, including a later round that carries the previous response observation, is measured in full as `estimated`. The incremental replay/new contributions (φ/δ) are not adopted for this family and report `unavailable` (`unsupported-marginal/1`), so no incremental estimate is claimed. Archived real streams from both selected routes attach one visible `reasoning.text` detail, identical to the plain `reasoning` fragment, to every reasoning fragment; the reader merges them into one entry and the next request replays that entry unchanged. Visible reasoning history is metered as a finite estimate: an assistant message whose `reasoning_details` is exactly one entry with own keys `type`, `text`, `format`, `index` (`reasoning.text`, a string text other than `[REDACTED]`, format `unknown`, index 0, no `id` or `signature`), and whose parallel `reasoning`/`reasoning_content`, if present, is the identical string, has that text placed once into the template's reasoning slot (K3 think section, K2.7 Code `<think>` slot) on a meter-only copy. The sent body and bytes keep the details; no output or `reasoning_tokens` term is added and the caller's margin is applied once at the final gate. How OpenRouter converts details for these routes is unknown, so the result stays `estimated` with no error bound. Summary or encrypted reasoning, any additional key (including an explicit `signature: null`), several or zero entries, another format or index, a differing parallel string, and details on non-assistant messages make the estimate unavailable, as do remote images and unrecognized model-input fields. Such a request is refused before HTTP. The factory's full, replay and new methods run the shared source and history guard, so a directly supplied malformed history is refused rather than metered. The real upstream replay of these details and the required same-route comparison of details against a plain `reasoning` string (MV4 with P2) are recorded in the [Moonshot visible-reasoning decision](../../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/moonshot-visible-reasoning-decision.md). K3's declared video input stays in its definition. This period carries only text and image, so video is out of scope and not carried (`modality_not_carried`). These estimates do not certify OpenRouter usage, cache retention or fees; the recorded real public and service rounds of both models are listed in the [transport verification](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md). The caller supplies the token margin. Bundled `LICENSE.K3` and `LICENSE.K27` retain the respective upstream licensing and attribution conditions.

## Own the transport

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import { definitions, request, networkPolicy, controlledMeter } from './example-definition.js'

const transport = createPiAiTransport({
  definitions,
  inputMeters: [controlledMeter],
  policy: networkPolicy,
})
try {
  const result = await transport.plan(request, { signal: new AbortController().signal })
  if ('rejected' in result) throw new Error(result.rejected)
  console.log(result.planned.parameters)
  // To send: supply a real complete definition, owned credential and AbortSignal,
  // then use send/read or invokeModel from the companion package.
} finally {
  await transport.close()
}
```

Definitions are required. Missing, undefined, non-array or incomplete definitions synchronously throw TypeError before pool construction. `planRequest` reports invalidInput for the same input errors. Explicit `definitions: []` is allowed and every valid static plan is unavailable; the dynamic service uses this empty network owner internally. It grants no general sending authority. A plan signed by one host is rejected by another; send consumes frozen bytes without reading latest definitions or reinterpreting configuration.

Standalone consumers supply credentials and cancellation explicitly, hold resources until execution stops and read a response once with its original plan. There is no environment credential lookup, hidden retry, provider fallback or redirect. For assembly, gating and deadlines use the companion `invokeModel`. Test callers may supply an explicit HTTPS baseUrl and CA; the product route remains OpenRouter.

A successful `sendRequest` returns an opaque, frozen, null-prototype `RawResponse` handle. Its only public members are `stop(): void` and `stopped: Promise<void>`; `stop()` requests network shutdown and actually returns `undefined`, while `stopped` settles after request/response and owned callback tasks stop and the connection slot is released. Read the body once through `readStream(response, originalPlan, signal, deps)` or the owning transport's `read`. The raw Node stream, status, redactor and successful response headers are not accessible through the handle. The same send result carries optional immutable `rawHeaders` on response, failed or aborted branches. There is no `failed.headers` or reader header outlet. All explicit configuration is validated, copied and bound through the runtime public credential policy before queuing or connecting. Header capture precedes error-body reading; later body/stream processing failures preserve acquired headers and actual status facts. This implements the D095 credential path; reply text and tool arguments are unchanged, and full S-20 content protection and live model certification remain open.

Credential redaction covers decoded error keys and every scalar, header names/values, serving model/provider/request IDs and stop reasons. Escaping cannot bypass it; non-ASCII replacements cannot recreate accepted ASCII credentials or protected fragments. Collisions preserve ordinary members; independent HTTP/in-band status and usage/cost retain exact values. Matching raw/error numbers, booleans and null are replaced. Direct send/read isolates throwing, rejecting and pending diagnostic callbacks; callers own the borrowed sink's health. Factory diagnostics expose failed/pending/dropped counts without changing business outcomes.

Unknown base token counts retain source none and omit reasoning_tokens; any valid base count, including zero, has source upstream. Cost remains independently available. Opaque reasoning metadata and serving-provider changes preserve the revision 6 behavior. This complete-definition implementation is revision 7; previous evidence does not certify it. Definition/configuration revisions remain owned by their actual fact/configuration sources.

The shared reader rebuilds streamed `reasoning_details` into the thinking block's `opaque` without guessing identity. Adjacent `reasoning.text` fragments join, text in arrival order, only when every member other than `text` and `signature` is equal (type, id, index, format and any unknown metadata, which is kept) and they share one content-block identity. That is either the same nonempty `id`, or no id on both. Unsigned id-less fragments are plain streamed reasoning deltas and join as before. When an id-less fragment carries a signature, both fragments must have the same nonnegative integer `index`. The assumption behind this is that adjacent same-index id-less fragments in one response belong to one upstream content block: a paid Claude Sonnet 5 response (ledger entry `cecc12c9-300e-43db-8389-7bb4ac859d4f`) streamed its thinking text and then its signature as two id-less index-0 fragments. Within one identity, absent or `null` signatures may continue until one later nonempty signature fills them, and only that identical signature may follow. A fragment without `text` contributes only such a signature. Anything else stays a separate original entry: different identity or metadata, conflicting signatures, an unsigned fragment after a signed one, a signed id-less fragment without a shared index, or a signature that is not a string or is empty. `reasoning.encrypted` details are never joined; `reasoning.summary` keeps its equal-head join. The signed-replay rules of each family are unchanged, so an unsigned or split Anthropic group remains unavailable at planning rather than being repaired.

This path adopts [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md) and the [transport credential projection, revision 3](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v6-credential-path-design.md). Save the following as `execute-once.ts` and call it with a transport owning a verified complete definition. It borrows that transport, retains the same processed H and stops the response before returning; the owner closes the transport when finished.

```ts
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { PlanInput, ReadFacts } from '@omne-harness-lite/model-request-runtime-local'
import type { PiAiTransport } from '@omne-harness-lite/pi-ai-transport'

// Only completes an unfinished reader early; it is never reported as a read fact.
const notRead: ReadFacts = {
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
  observedInput: { kind: 'unavailable', reason: 'missing_usage' },
}

export async function executeOnce(
  transport: PiAiTransport,
  request: PlanInput,
  credential: string,
  signal: AbortSignal,
) {
  const plan = await transport.plan(request, { signal: new AbortController().signal })
  if ('rejected' in plan) return plan
  const sent = await transport.send(plan.planned, credential, signal)
  if (!('response' in sent)) return sent
  const reader = transport.read(sent.response, plan.planned, signal)
  const events: ArrivalEvent[] = []
  try {
    while (true) {
      const next = await reader.next()
      if (next.done)
        return {
          events,
          end: next.value,
          ...('rawHeaders' in sent ? { rawHeaders: sent.rawHeaders } : {}),
        }
      events.push(next.value)
    }
  } finally {
    try {
      await reader.return({ aborted: true, readFacts: notRead })
    } finally {
      sent.response.stop()
      await sent.response.stopped
    }
  }
}
```

## Register and retire precise versions

```ts
import { createModelTransportService } from '@omne-harness-lite/pi-ai-transport'
import {
  definition,
  request,
  networkPolicy,
  retirement,
  controlledMeter,
} from './example-definition.js'

const service = createModelTransportService({ policy: networkPolicy })
const registered = service.registerAdaptation(definition, controlledMeter, {}, () => {})
if ('rejected' in registered) throw new Error(registered.rejected)
const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
if ('rejected' in acquired) throw new Error(acquired.rejected)
const lease = acquired.lease
try {
  const result = await lease.transport.plan(request, { signal: new AbortController().signal })
  if ('rejected' in result) throw new Error(result.rejected)
  console.log(result.planned.parameters)
} finally {
  lease.release()
}
console.log(await service.retire(registered.registered, retirement))
console.log(await service.close(retirement)) // no HTTP request
```

Registration owns and validates the whole declaration recursively. Reusing an exact key with different capabilities, rules, roles, TTLs or layouts is rejected, including after retirement. Readable declarations do not authorize acquisition. acquire checks the route union; plan validates its explicit provider. Fixed leases preserve full configuration values, not merely revision strings.

Use lease.transport for invocation and lease.track(handle.outcome) for execution. Track separate gates, callbacks, settlement and handoff before release. Release is idempotent and closes that holder's admission while tracked work remains owned. Retiring one contribution stops new acquire and preserves existing holders; closing the whole service immediately stops old-lease sends and queued admission. Sent work may naturally finish with force false. Forced cancellation alone does not prove resource release. remaining_active retains visible ownership; service.closed resolves only after actual execution/callback draining and pool shutdown. Registration does not persist, publish a directory profile or authorize a tenant.

### Observe registration and retirement

The assembly may lend one already-scoped, write-only emitter to a transport service. Bind it to a **local** diagnostic scope and a distinct service-generation association before creating the service:

```ts
const emitter = collector.emitter({ kind: 'local' }, { executionId: 'transport-generation-a' })
const service = createModelTransportService({
  policy: networkPolicy,
  registryDiagnostics: emitter,
})
// The same option is accepted by piAiTransportPlugin's configuration.
```

`registration` and `retirement` records report actual publication, acquisition, reference/execution counts, retirement waiting, forced cancellation requests, cleanup failure, and actual contribution or whole-service stop. A repeated same-owner registration does not create a second publication record. A force request does not mean work has stopped. Binding fields contain owned implementation, model, definition and, when acquired, configuration revisions; values, credentials, and original errors are excluded. The service borrows only `record`; the assembly retains emitter and collector closing responsibility until the service has actually stopped.

`service.inspect()` exposes instance-local `registryDiagnosticFailures` and `registryDiagnosticDropped` as separate exact counts or `unknown` on overflow. Failures cover a throwing or invalid synchronous record result; dropped counts only a valid `{ dropped }` result. An absent emitter starts both at zero. A Promise returned from the synchronous port counts one failure and disables further delivery to that instance; its rejection is observed without awaiting it. These source counts must not be added to collector health as though they were different incidents. `service.diagnostics()` continues to report only the underlying network diagnostic delivery state, including after close.

## Use trusted Cordis contributions

```ts
import { Context } from '@deepseek-ai/cordis'
import { piAiTransportPlugin, createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'
import { definition, networkPolicy, retirement, controlledMeter } from './example-definition.js'

const ctx = new Context()
const stable = ctx.plugin(piAiTransportPlugin, { retirement, policy: networkPolicy })
await stable
const contribution = ctx.plugin(createModelPlugin(definition, controlledMeter, retirement), {})
await contribution
await contribution.dispose()
await stable.dispose() // no acquired lease and no HTTP request
```

The stable plugin provides modelTransport and starts with no implicit contributions. Trusted model plugins register complete declarations and share its pool. Invalid configuration fails before publication; missing required service leaves a contribution pending. Tenant configuration is declarative data, never executable plugin code.

Register new version, explicitly adopt it in the directory, then retire the old version. These are separate operations. During a package-generation migration retain old host A with its original code/data until streams and tracked callbacks drain. New host B does not accept A's plans/leases or recreate a missing old binding with latest. Without independent host ownership, drain A before starting B; no seamless migration is promised.

## Development

```sh
pnpm --filter @omne-harness-lite/pi-ai-transport... run build
pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck
pnpm --filter @omne-harness-lite/pi-ai-transport run test
```

Tests use complete nonofficial fixtures, actual temporary HTTPS, public core judges/assembler, independent Schema validation and real Cordis lifecycle transitions. They do not certify 37 live models, tools/replay/modalities, TTL expiry, durable recovery or the complete observability chain. Fork provenance: [UPSTREAM.md](UPSTREAM.md), [provenance.json](provenance.json), [LICENSE.pi](LICENSE.pi).

### Explicit DeepSeek Pro definition

`deepseekV4Pro0813Definition` provides one fixed leaf for `deepseek/deepseek-v4-pro-0813` through `deepinfra/fp8`. It shares the OpenRouter planner and DeepSeek family rules under `pi-ai:deepseek / mp4-19`; its definition revision is `6`. The Flash leaf is revision `5` under the same implementation. Importing a definition does not register a model, allocate a connection pool or send a request.

The model's recorded capability is text input and text output. Its route reports a 1,048,576-token shared window and 16,384-token output capacity. The 1,032,192-token input budget reserves that complete output capacity; it is a derived input-only budget, not the route's `max_prompt_tokens` field or an extreme-size request test. The empty input-constraint object has no active image constraint in this text-only declaration. Its two applicable upstream facts are explicitly `unknown`, not unlimited.

System reminders become marked `user` messages. Automatic prefix caching uses the explicit configuration below, with no TTL or breakpoints. Historical requests on this route reported cache-read tokens without manual cache controls. That observation does not guarantee a future hit or certify the production runtime.

This supplied route policy deliberately provides `reasoningEffort: 'low'`, `seed: 0`, and `stopSequences: ['END']`. Other values are dropped with their names recorded. Temperature, top-p and both penalties are deliberately not provided and are traced when dropped. Their route-advertised support and native conditional behavior are not reclassified as unsupported. `maxOutputTokens` passes unchanged after the profile's ordinary output-bound check; no dynamic metadata clamping occurs. No private `extra` keys are provided.

```ts
import {
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
  createOfficialProfileContent,
  configurationSchema,
} from '@omne-harness-lite/pi-ai-transport'

const content = createOfficialProfileContent(deepseekV4Pro0813Definition, {
  providers: ['deepinfra/fp8'],
  allowFallback: false,
  configuration: deepseekV4Pro0813Configuration,
})
if ('rejected' in content) throw new Error(content.rejected)
const schema = configurationSchema(deepseekV4Pro0813Definition, 'deepinfra/fp8')
if ('rejected' in schema) throw new Error(schema.rejected)
```

The configuration is an explicitly selected source value (`revision: '1'`, `values: { cache: { mode: 'automatic' } }`), never a hidden transport default. Pass the definition explicitly to a static transport, or register it through the existing model contribution plugin. Catalog publication and tenant authorization remain with their respective owners.

Pure construction, planning and current-binding controlled three-turn public/Cordis transport paths are verified locally. Recorded real public and service rounds for both DeepSeek leaves are listed in the [transport verification](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md); seed/stop effectiveness and full parameter tuning are not established. The local three-turn cases use `low` and `2048`; their synthetic upstream usage does not prove a remote cache hit or tokenizer accuracy. The Flash definition has an image cap and explicit unknown upstream image facts. Historical live image observations predate this binding and do not certify its current production path.

### Family policies and complete model definitions

The files under `src/official-models/` contain two distinct implementation layers:

1. A family shares `ModelRoute` policy fragments; named model/provider routes record the actual differences. These are declarative inputs to the same parameter, reminder, cache and message planner.
2. A complete `ModelDefinition` also supplies capabilities, exact implementation/definition revisions and provider routes. `readModelDefinition` validates and owns that whole value. Explicit configuration and `createOfficialProfileContent` then produce catalog input. Plugin registration uses the existing contribution lifecycle.

All eight modules have the same internal entry shape: `<family>ModelRoutes[modelId][providerId]`, with exact model IDs and provider slugs. Each file puts shared policy first, model differences next, and its explicit map after those rules. Complete six-field definitions follow for all 37 models; explicit source configurations follow where offered; DeepSeek Pro takes its routes directly from `deepseekModelRoutes`. Existing named route exports reuse the same values.

For example, the package root exposes the same selection pattern for both families:

```ts
import {
  deepseekDefinitions,
  deepseekModelRoutes,
  moonshotDefinitions,
  moonshotModelRoutes,
} from '@omne-harness-lite/pi-ai-transport'

const deepseekRoute = deepseekModelRoutes['deepseek/deepseek-v4-pro-0813']['deepinfra/fp8']
const moonshotRoute = moonshotModelRoutes['moonshotai/kimi-k3']['moonshotai/mxfp4']
const deepseek = deepseekDefinitions.find(item => item.modelId === 'deepseek/deepseek-v4-pro-0813')
const moonshot = moonshotDefinitions.find(item => item.modelId === 'moonshotai/kimi-k3')
if (!deepseek || !moonshot) throw new Error('missing official definition')
```

These maps and the eight complete definition lists are public package exports. Complete definitions use the shared validation and configuration path; families do not implement their own registration, connection pool or lifecycle.

| Family    | Target models with internal route policies | Reminder role | Declared cache configuration                                             |
| --------- | -----------------------------------------: | ------------- | ------------------------------------------------------------------------ |
| OpenAI    |                                         12 | developer     | automatic                                                                |
| Anthropic |                                          4 | user          | explicit; caller selects the declared `1h` TTL and `last_message` layout |
| DeepSeek  |                                          2 | user          | automatic                                                                |
| Google    |                                          2 | user          | automatic; Google AI Studio and Vertex routes are explicit               |
| xAI       |                                          2 | user          | automatic                                                                |
| Qwen      |                                          8 | user          | six explicit `5m`/`system` routes; two automatic Flash routes            |
| Moonshot  |                                          2 | user          | automatic                                                                |
| Z.ai      |                                          5 | user          | four automatic routes; Prime has an explicit Alibaba route policy        |

Google's route map also names Vertex, while the first complete Google definitions bind the selected AI Studio endpoint whose limit facts are recorded. A route map alone does not publish a second endpoint as a complete official offer.

The 37 complete definitions are public data values and can be used to construct official profile content. They are not automatically installed as selectable profiles. Tests exercise exact per-model policy choices through the common planner; several families also run local HTTPS/SSE and next-turn tool/reasoning replay. Their synthetic capacity fixtures do not publish real capabilities or certify upstream behavior. Finite project caps and explicit unknown upstream facts are declared. Multimodal carriage, model-specific input measurement and real public/service certification remain explicit release work. A cache declaration or a historical warm read does not prove TTL retention.

From this package directory, run the family checks with:

```sh
pnpm exec vitest run tests/official-*.spec.ts
```

## Input meter source layout

Concrete estimators live in [`src/input-meters/`](src/input-meters/): [`deepseek-v4-pro.ts`](src/input-meters/deepseek-v4-pro.ts), [`deepseek-v41-flash.ts`](src/input-meters/deepseek-v41-flash.ts), and [`openai.ts`](src/input-meters/openai.ts). A family shares its algorithm wherever the evidence supports it; each supplied model/provider route has an explicit binding. Distinct prompt encodings or tokenizers can have separate modules. The common interface and margin/binding checks stay in [`input-meter.ts`](src/input-meter.ts); final input limits stay in [`input-limits.ts`](src/input-limits.ts). Consumers import the factories from the package root.

The Anthropic cache probe (`tests/fixtures/anthropic/cache-public.mjs`) uses explicit TTL configuration and separate write/read/expiry commands. Its current official binding accepts only `1h`; `5m` is rejected before a plan or network request. It records public invocation outcomes, accepted arrival events and retained response headers. `capture.rawSseBody: false` and `capture.protocolFailureFrame: false` state that the original SSE body and rejected frame are not captured. Nonempty unsupported `images` and `audio` content remains a protocol failure; their empty strings, empty arrays and null remain ignored. Under [D-108](../../../.meta_harness/design/record/decisions/openrouter-refusal-mapping-adoption/decision.md), `delta.refusal` has a stricter value domain: missing, null or empty string adds no content; a nonempty string (including whitespace) is delivered unchanged into the same text block as `delta.content`; every other type, including an empty array, fails with the fixed `invalid refusal` diagnostic. Validation precedes any content delivery from that frame. Same-frame content is appended before refusal, independently of JSON key order; later frames append in arrival order. Refusal uses the existing first-content gate, finish reason, cancellation and accounting paths. Normal trailing usage is read until DONE; failures stop without draining later usage. A valid selected reply replays as ordinary text; failed delivered content remains response evidence and does not automatically enter history. Public invocation keeps the existing credential source policy: actual reply text is unchanged, while raw/error/diagnostic text retains source redaction. These diagnostics cannot reconstruct historical rejected frames. Controlled TLS tests do not certify an actual vendor response or settle an earlier unknown bill.

`tests/openai-sol-calibration.spec.ts` checks all declared Sol efforts plus omitted effort, exact-decimal margin boundaries, real public invocation over local TLS, full→marginal→marginal, a tokenizer spy excluding the stable prefix, and prefix/basis/source negative controls. `tests/openai-visible-history-candidate.spec.ts` now exercises the official Sol/Luna factories against the preserved frozen history inputs. The original Sol text-proxy observations remain separate from the new final-JSON predictions. These are local conformance checks, not new OpenRouter certification.

Moonshot image probe fixtures have separate PNG integrity and production input-limit checks: `node --test tests/fixtures/moonshot/repair-image.test.mjs` and `pnpm exec vitest run tests/fixtures/moonshot/repair-image.spec.ts`. `pnpm exec vitest run tests/moonshot-three-round.spec.ts tests/moonshot-closeout-boundaries.spec.ts` runs both models for three rounds through public `invokeModel` and through the Cordis transport service with the official model plugin, with and without tools, over local TLS. It also covers the effort, image, opaque-history and video boundaries. `pnpm exec vitest run tests/moonshot-visible-reasoning-rounds.spec.ts tests/moonshot-visible-reasoning.spec.ts` replays the fragments of the ten archived raw streams in their exact shape through the real reader: three rounds per model, with and without tools, on both paths (K3 at `low`, `high` and `max`), with later rounds full estimated from the replayed details; the equivalence of the details count and the plain `reasoning` string count; every refused shape; and the guarded factory methods. These local checks do not establish provider acceptance or cache behavior.

### ZAI history probe checks

The former unbound ZAI history candidate has been removed: its plaintext
rendering is now the production `mp4-18` path described above, so no second
history estimator remains. Hosted Prime/FlashX history accounting stays
unverified, and mixed opaque/plain history is still refused by planning. The
five recorded complete SSE responses exercise production stream assembly over
local TLS; their independent Jinja prompt goldens cover only the public-template
projection.

After building, prepare the fifteen unsent control/plain/details probes with an
explicit output limit (this command has no network or credential access). Each
probe's `candidate` is now the production Prime/FlashX meter's full count, next
to its `meter` coordinates; plain and details count identically, above control:

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.mjs \
  --max-output-tokens 512 > tmp/zai-history-probes.json
node --test packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.check.mjs
```

The unbound research `createXaiHistoryCandidateInputMeter` in `src/input-meters/xai-candidate.ts` preserves the original opaque history while estimating the known `xai-responses-v1` encrypted item and optional adjacent summary from the pinned first-party heuristic. Four frozen planner-to-TLS samples check that historical comparison only; this candidate is not the official V5 meter or an old execution binding. Unknown wrappers and multiple encrypted items are rejected. Live replay of the official complete-group estimate remains unverified. The research estimate requires an explicit caller margin and is not an error bound.

`ModelTransportService.diagnostics()` reads the underlying instance’s `failed`, `pending` and `dropped` diagnostic-delivery counts without acquiring a lease. It remains readable after close. An optional request-local emitter is passed as the final argument to `send` and `read`; the same emitter owns both phases. Its typed facts contain no message bodies, credentials or engineering identities in HTTP. A mismatched emitter is rejected. Complete runtime invocation wiring and multi-session acceptance remain separate.

An assistant message combining same-route opaque reasoning with an additional independent plaintext thinking block is currently unavailable at planning, before any HTTP send. The original history is not changed or silently dropped. Single-block opaque replay and plaintext-only history keep their existing paths and metering gates. How the selected route consumes both representations together remains unverified; this refusal is not successful mixed-history support.

## Response-calibrated input planning

`PlanInput.calibration` and `PlanInput.outputHistory` are required. Use `{kind:'none',reason:'no_observation'}` and `[]` for a first request without a predecessor. A later input anchor uses a legitimately obtained observation with the original `inputCalibration`, `usage`, complete retained `outputBlocks`, and explicit `replaySelection`. Independently, `outputHistory` carries every selected earlier response with a known output group, including responses without a usable input count. Each group keeps the original route binding, provider, parameters and any actual serving provider/upstream model. Groups are ordered by their first selected target. Missing `outputHistory` is malformed; the planner does not silently replace it with `[]`. Selection indexes identify source blocks and current message/block positions; the planner verifies actual values and final projection coverage. A caller cannot bypass this with a trust flag.

`InputMeter` now supplies `measureFull`, `measureReplay` (φ) and `measureNew` (δ), plus tokenizer/replay/transform revisions. The root exports each operation independently, along with `projectInput`, `projectOutput` and `canonicalProjection`. Marginal results permit signed integers; planning composes accurate I + φ + δ and applies `tokenMargin` once if the result is estimated. `planned.measurement` reports full/marginal, precision, contributions and any source/prefix/basis fallback. Actual usage and cost remain separate.

`measureFull` receives `FullMeterInput`: the actual final body and serialized wire, its one final `InputProjection`, all selected output groups and their `historySpans`. `measureReplay` receives `ReplayMeterInput` with the original anchor `observation`, its matching history group when present, absolute `unitIndices` and `selectionSpans`. `measureNew` receives `NewMeterInput` with absolute N-only `unitIndices`, the current `countingBasis`, and only the complete groups allocated to N plus their spans. A history span identifies its source group and selection, and its half-open final unit range. Multiple blocks may share one range; a shared unit cannot be counted twice. The planner copies, validates and deeply freezes these values before metering; stable P content is absent from both marginal unit arrays.

The shared planner validates all groups before calling any meter, then allocates each group to stable P, anchor replay G or new N on the same final projection. P is already covered by the accurate input observation and contributes no additional O; G is charged once through φ; N goes to δ. A group crossing regions falls back to full. Full still receives all legal groups, even if no usable input observation exists. Partial, duplicated or reordered selections need a supported model mapping or a full count; no aggregate output count is divided among blocks. Independent `measureFull(meter, input)` returns `unavailable` for malformed known facts, while independent `measureReplay`/`measureNew` return `invalidInput`. Unknown old projection revisions are an evidence gap rather than a claimed digest mismatch. The original content remains in the outgoing wire, and final estimated tokens receive the configured margin once. See [runtime v19](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v19-output-history-design.md) and [transport v13](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v13-output-history-design.md) for the adopted handoff.

A replay implementation can inspect `input.observation.usage.output_tokens` together with the original group and actual selection; this does not authorize adding that aggregate to input tokens. Whole-group reasoning must check coverage, source identity, actual target order and exactly-once selection, rather than selection-array order. A source block may legitimately map to several targets; those facts remain visible instead of being globally rejected. Partial, repeated or reordered groups must not silently receive a full-group formula. Independent calls through the exported `measureReplay(meter, input)` must supply valid source and projection relationships; TypeScript `readonly` does not establish provenance. Model-specific unsupported relationships retain `invalidInput`/`unavailable` results and the planner’s existing full fallback. This interface adds no model-specific I+O rule.

Current Anthropic definitions use revision 4 / `pi-ai:anthropic/mp4-18` and projection `/3`. Stable text arrays and exact cache-neutral metadata preserve the full/marginal boundary. Stable prefixes are scanned and hashed but not tokenized again. Terminal pure-image caching uses the same validated selector described above.

Anthropic and the applicable OpenAI visible-history routes provide **estimated** JSON net contributions for newly replayed/appended units. They remove empty-envelope framing in the surrogate; this is not a proof of private template/BPE boundary equality. They do not infer hidden thinking input from aggregate output tokens or ciphertext length. Other existing full meters retain their supported domain and explicitly return marginal unavailable until route-specific evidence exists; no missing model is silently supplied. A failed marginal calculation tries full; if full is unavailable the request is rejected without HTTP or history removal.

Every reader terminal result has `readFacts` from the same accumulator as account events. Usage is captured when parsed, including before later malformed frames or cancellation. Complete prompt totals do not require fabricated zero cache components; `X-OpenRouter-Cache-Status: HIT` produces response-cache unavailable, not an input-zero anchor. Repeated cumulative facts are not summed. Cancellation stops and awaits the actual response resource and returns already-known facts without waiting for future usage.

The current local regression suite includes pure planner and actual TLS reader cases. Live 37-model certification and full runtime/service integration are separate acceptance work; a local passing test does not certify an upstream route.

### OpenAI Pro input observation scope

All six current OpenAI Pro leaves bind `pi-ai:openai/mp4-18`. Actual usage/cost is retained, but input observation remains `unavailable/scope_unknown` because its inherited-context scope is unverified. Missing usage, response-cache and inconsistent-usage branches keep their existing precedence. Pro requests use full estimation with explicit margin; a known-looking original request basis does not authorize φ when the original input usage scope is unknown. Complete, applicable original O may still be interpreted by the shared full/new algorithm.

The private fixed reader rule is shared with planning, selected from the owned request binding, with no public trust flag or extra I/O. The current Pro transform revision is `openrouter-input-transform/pro-scope-1`; this scope boundary remains independent of the supplied estimator revision. Exact previous contribution identities retain their captured reader semantics while an existing lease drains under the registry retirement protocol. The default official table/factory offers only the new identities. This is neither a historical compatibility entry nor a new global ban on explicitly trusted custom code contributions; other trusted contributions retain their prior reader assumptions, without claiming fresh certification of their upstream token scope.

### DeepSeek signed marginal reference counting

Pro0813 revision 6 and Flash revision 5 / `mp4-19` use their pinned public reference renderers for full and signed replay/new estimates on `deepinfra/fp8`. The fixed binding recognizes the OpenRouter serving display name `DeepInfra`; other provider/model identities still invalidate calibration. A pure provider projection compares the old and current reference prompt without tokenizing stable history. Only anchor-external fragments and the finite terminal assistant framing reach the marginal tokenizer. With a new input, δ owns the final framing change; otherwise φ does. The boundary check rejects substantive old reasoning/content rewrites and falls back to full. The finite visible detail shape above enters the boundary through the same meter-side projection; a stable P containing it is still never tokenized. Unknown opaque reasoning never gains marginal support from ciphertext length.

`MarginalMeterInput.boundary` is an optional provider-owned description, produced after source, prefix, and basis validation. It is not a caller trust flag. DeepSeek keeps G/N in their real order before deriving signed suffix differences, including missing-usage turns, merged user/tool messages and empty-side cases. φ estimates the P→P+G suffix change; δ estimates P+G→the actual final ordering. Thus δ can subtract newly replayed reasoning excluded by a later user input. These are estimated net contributions, not measured per-message token counts. Independent suffix tokenization and the OpenRouter/DeepInfra private template remain **estimated**, not exact or an upper bound. Apply the configured margin once to the combined input. This work adds no paid serving certification or cache-hit guarantee. Full request bytes and image limits are still checked; full linear serialization/rendering/hashing remain necessary, while stable P never enters the marginal tokenizer.

Flash uses its own pinned renderer, tool-result ordering, tokenizer and image-span formula. Marginal counting adds only new image spans; the placeholder already in the prompt is subtracted once. Appending a tool result that reorders substantive old projected content falls back to full.

`tests/deepseek-visible-reasoning.spec.ts` compares the captured detail form with the official encoder vectors with and without tools, and covers every rejected shape, direct factory calls with malformed history, and full fallback on prefix, tools or basis changes. `tests/deepseek-visible-reasoning-rounds.spec.ts` streams the captured `delta.reasoning_details` shape over local TLS through both the public transport and the Cordis transport service for three rounds with and without tools. These are local conformance checks; the error against real OpenRouter/DeepInfra input usage remains unmeasured here.

### Explicit image preparation

The transport exports `createImagePreparer`, `createSharpImageCodec`, and the explicitly selected `modelImageBalancedV1` policy. Assembly imports the installed sharp 0.35.3 first; creating or importing a preparer does not load a native codec, read files, or access the network.

```ts
import sharp from 'sharp'
import {
  createImagePreparer,
  createSharpImageCodec,
  modelImageBalancedV1,
} from '@omne-harness-lite/pi-ai-transport'

const codec = createSharpImageCodec(sharp)
const instance = createImagePreparer(modelImageBalancedV1, codec)
if ('unavailable' in instance) throw new Error('Image codec unavailable')
const scope = {}
try {
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: 'blue' },
  }).png().toBuffer()
  const result = await instance.ready.prepareRequestImages({
    images: [{ position: 'user/0/image/0', bytes, mediaType: 'image/png', targetMaxBytes: 1_000_000 }],
    maxRequestBytes: null,
    nonImageWireBytes: 0,
    signal: new AbortController().signal,
  }, scope)
  // Handle the closed prepared/rejected result before using its owned bytes.
  if ('rejected' in result) throw new Error(result.rejected.reason)
  console.log(result.prepared.images.map(({ width, height, changed }) => ({ width, height, changed })))
} finally {
  instance.ready.clearScope(scope)
  await instance.ready.close()
}
```

For a complete JSON request, `nonImageWireBytes` must be the UTF-8 length of its final serialization with each selected image's data URL string value replaced by the empty string. The helper adds each actual JSON data URL contribution, including MIME and base64 expansion. Transport planning still independently serializes and checks the final body before publishing a plan.

The finite search follows fixed candidate ordinals; cache hits never extend the search limit. The source bytes remain unchanged. Cache tables belong to caller-provided opaque scopes, with global byte/entry limits and LRU eviction; scopes confer no authorization. Omit a scope to disable reuse across calls. Cancelling preparation or calling `close()` waits for actual native completion and decoded-handle release. The preparer borrows the codec and does not destroy it. The configured in-flight buffer budget is separate from native RSS and does not impose a process memory limit.

### Assemble images and asynchronous planning

Always await `planRequest` and supply `{ signal, reuseScope? }`. Image requests additionally require the actual ready instance returned by `createImagePreparer`. Text-only requests keep the base transform revision. Planning validates structure, modalities, tool pairs and required limits before preparing actual bytes; serialization, projection and measurement consume the same fixed body. Original input/history remains unchanged. `ReplayMeterInput.countingBasis` explicitly describes the current request; it is never copied from the original observation. Full/new measurement can retain old original O only under the finite source rules; a changed representation or effective basis cannot reuse original prefix I.

Factory and Cordis plugin configuration accepts explicit `imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) }`. The factory owns the preparer. `close()` stops admission, aborts planning and drains actual native work and connections; it does not destroy the borrowed codec. Explicit `codec: null` leaves the codec absent while still strictly validating policy at initialization. Image requests then return unavailable; text follows its existing path. Codec, policy and caps have no implicit fallback.

`ModelTransportService.clearReuseScope(scope)` synchronously clears the service's fixed owned preparer set. It remains callable after lease release, contribution retirement and stopped admission. A scope is an opaque process-local object, outside durable bindings and logs; it grants no tenant authority. Standalone callers own their scopes, and omitting one disables reuse across requests.

### Compose complete output history

`fullOutputHistory`, `newOutputHistory` and `replayOutputHistory` share one complete-output-group walker. Supply an `OutputHistoryPolicy` with finite family source/basis rules and a pure visible-body counter. Units have three classifications: visible, requiring a complete group, or uninterpretable. The common implementation replaces an intact, uniquely selected assistant unit with its original upstream output count once; reasoning tokens are already included in that count. This is an estimated contribution, not an exact input/output-token equality guarantee. Unknown mappings return unavailable instead of tokenizing opaque bytes.

Full measurement verifies the actual body against its cache-neutral projection. Projection revision `openrouter-input-projection/3` removes only a verified, configured Anthropic cache marker; the submitted wire is unchanged. Historical revision `/2` digests are checked using their original revision, without making old input anchors reusable. A signed-prefix rule is consumed through a private, synchronous planner capability on the exact marginal input object; standalone marginal calls without that capability return unavailable.

For a custom finite family, compose the public core with a pure visible counter and your versioned rules:

```ts
import { fullOutputHistory, newOutputHistory, replayOutputHistory } from '@omne-harness-lite/pi-ai-transport'
import { meter, finiteFamilyPolicy, visibleBodyCounter } from './my-finite-model.js'

const full = fullOutputHistory(fullInput, meter, visibleBodyCounter, finiteFamilyPolicy)
const added = newOutputHistory(newInput, meter, visibleBodyCounter, finiteFamilyPolicy)
const replay = replayOutputHistory(replayInput, meter, visibleBodyCounter, finiteFamilyPolicy)
```

The three inputs carry actual original groups and selection spans; supply an explicitly empty history only when there are no selected original observations. `fullInput` also carries the actual serialized body and its projection. A malformed standalone full input yields unavailable; malformed new/replay input yields invalidInput. A valid source with missing necessary interpretation or signed-prefix evidence yields unavailable. The planner first falls back from marginal to full; if full is also unmeasurable, its existing `invalidInput/input_size_unavailable` result describes admission failure rather than an illegal signature or parameter value.


For the two current official Moonshot bindings only, planning omits text parts whose value is exactly the empty string when another part remains in the final user, system, reminder or compaction array. Markers are added first. All-empty arrays, empty arrays and whitespace remain unchanged, as do caller blocks, assistant/tool rules and other routes. The new implementation is `mp4-19`; definition revision 3 and input projection `/3` stay unchanged. Metering and sending use the same fixed final body. See [D-115](../../../.meta_harness/design/record/decisions/moonshot-empty-text-adoption/README.md).
