# @omne-harness-lite/pi-ai-transport

[中文](README_ZH.md)

Plan one OpenRouter request, send it over HTTPS, and translate SSE into public arrival events. This experimental ESM workspace package contains a targeted pi 0.86.1 fork and is not published on npm.

Every caller supplies complete model definitions explicitly. There are no default models. `officialModelIds` is derived from the eight public `<family>Definitions` lists, which now carry complete MP4 declarations for all 37 confirmed identities. Every project cap is finite; unavailable upstream limits are explicitly `unknown`. A complete declaration supports pure reading and profile construction, while real model/provider sending and cache certification require separate evidence. See the [realization status](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md).

## Public API

| Export                                                                    | Purpose                                                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ModelDefinition`, `ModelRoute`, `ParameterRule`, `ParameterRules`        | Complete capabilities and explicit per-route reminder, eight parameter rules, recognized private keys and cache values |
| `readModelDefinition(definitions, coordinates)`                           | Immutable exact-version observation; does not acquire usage rights                                                     |
| `configurationSchema(definition, provider)`                               | Closed Draft 2020-12 Schema, generated from route data without defaults                                                |
| `interpretConfiguration(definition, values, provider)`                    | The same route's strict, lossless configuration interpretation                                                         |
| `createOfficialProfileContent(definition, options)`                       | Construct and judge core content; no directory write, registration or timestamp                                        |
| `planRequest(input, definitions, meter)`                                  | Pure fixed-byte plan and final input admission with a trusted, versioned model/provider meter                          |
| `createPiAiTransport(options)`                                            | Explicit definitions, bound input meters and owned pool with plan/send/read/close                                      |
| `sendRequest`, `readStream`                                               | Independent functions borrowing explicit network resources                                                             |
| `createModelTransportService`, `AdaptationLease`, `RetirementPolicy`      | Process-local precise registration, fixed leases and explicit draining                                                 |
| `parseSSE`, `canonicalInteger`, `generatedCallId`                         | Framing and exact deterministic identity helpers                                                                       |
| `officialModelIds`, eight `<family>Definitions` and `<family>ModelRoutes` | Complete MP4 declarations, exact route policies and derived target IDs                                                 |
| `OPENROUTER_BASE_URL`, `PI_AI_CARRIABLE_MODALITIES`                       | Product endpoint and currently carried text/image input                                                                |

Pure reads return `{ ok }`, `invalidInput` or `unavailable`. The content builder preserves core representation rejection names such as `parameter_out_of_range` and `max_output_exceeds_profile`; definition/route/configuration consistency failures are provider `invalidInput`. Unknown exact versions/routes are unavailable; illegal declarations/configurations are invalid input. Errors contain finite rejection categories, not configuration contents. The root entry does not load Cordis. `./plugin` is the explicit Cordis 4.0.4 entry.

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
} from '@omne-harness-lite/model-request-runtime'
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
const result = planRequest(request, definitions, controlledMeter)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // developer; no HTTP request
```

Each route declares its reminder role; the model name selects no policy. OpenAI routes use developer, other supported routes use an appropriate verified dedicated role or user. Reminder identity/order and the separate compaction mapping are preserved.

`pass` keeps a supplied value, `drop` records its name, and `select` accepts exact values or an explicit numeric interval, otherwise dropping or adjusting to a declared value. Absent values remain absent. Decimal/integer comparison never rounds through Number. Current G-22 permits only pass for maxOutputTokens; profile/request representation limits still apply. Unknown or protected private keys are dropped under their **original keys**, including keys beginning with `extra.`. Empty actual extra is omitted.

Automatic cache configuration is exactly `{ cache: { mode: 'automatic' } }` and emits no manual controls. Explicit route declarations contain `ttlValues` and complete `breakpointLayouts`; configuration must supply mode, TTL and one declared layout. No TTL/default/layout combinations are hardcoded in shared code. Schema and interpreter read the same declaration. Planning a control does not establish upstream adoption, a cache hit or expiry behavior.

## Final input admission

`PlanInput.tokenMargin` is required for every plan: `{ multiplier, reserveTokens }`, with a finite decimal multiplier at least 1 and a nonnegative integer reserve. The final serialized request is measured before a `planned` result can be signed. Request UTF-8 bytes, decoded inline image bytes and image count are exact; image duplicates and tool-result images count each time. Missing caps yield `input_limit_missing`. A known exact excess yields `input_limit_exceeded` with `basis: 'exact'`; an estimated token admission excess has `basis: 'estimated'`, both the raw estimate and the margin-adjusted admission. Unmeasurable inputs yield `input_size_unavailable`. Upper-bound excess is unmeasurable, not an actual excess. No pre-send rejection performs an HTTP request.

`InputMeter` is trusted executable code supplied to the function or transport factory, not model-profile JSON or a caller-provided permission flag. Its exact definition, provider, algorithm revision and evidence are bound to the contribution; a plan from another meter source cannot be sent through this host. `createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)` uses a pinned DeepSeek V4 Pro public prompt encoder and tokenizer for the exact `deepseek/deepseek-v4-pro-0813` / `deepinfra/fp8` route. It returns an **estimate** because OpenRouter/DeepInfra do not publish a byte-identical private prompt projection in the inspected sources. Its packaged tokenizer/config hashes and official text, reasoning and tool golden vectors are checked offline. The caller chooses the explicit margin; this estimate never replaces upstream usage or cost. Official definitions without an evidenced meter cannot be successfully planned. The synthetic `controlledMeter` above proves only the local protocol example and must never be sent to a real provider.

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` binds the separate V4.1 Flash tokenizer and public encoder to `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`. Official multi-turn/tool and two-image prompts are checked against pinned upstream vectors. The `mp4-4` implementation estimates inline images from their dimensions using the pinned public image processor's patch/downsample grid and 1,024-token maximum, replacing the placeholder already counted in the prompt. Actual provider preprocessing is not public. Image bytes and count still use the exact final-body gate. Unknown image URLs or unsupported content make the meter unavailable before HTTP. The estimate includes the serialized request fields outside the rendered prompt without treating inline base64 as text tokens. Configure the margin per request; these estimates do not replace reported usage or prove live image delivery.

`createOpenAiInputMeter(definition)` binds the three GPT-5.6 Sol/Terra/Luna base definitions at revision 6 (`pi-ai:openai` `mp4-12`) and the three Pro definitions at revision 6 (`mp4-13`) on provider `openai`. It uses pinned `js-tiktoken` `o200k_base`, following the [fixed GPT-5 prefix mapping](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py); this does not certify an exact GPT-5.6 tokenizer. The estimate covers final serialized multi-turn messages, `developer` reminders, tools/results, visible plain reasoning and protocol fields. `reasoning_details` can contain visible `reasoning.text`/`text` and `reasoning.summary`/`summary` with `id`, `index` and `format` metadata; this estimates the transmitted visible representation, not hidden reasoning retention. Full/new measurement of encrypted or unrecognized details remains unavailable before HTTP: tokenizing ciphertext does not establish its input-context contribution. Refusal preserves the original history, model and route. Inline image base64 is replaced with a marker before text tokenization. For the three base models, the [OpenAI vision guide](https://developers.openai.com/api/docs/guides/images-vision) supplies low (512px), high (2048px and 2,500 patches), and original/auto (65,535px after an aspect-preserving fit, then up to 30,000 patches) sizing, with 32px patches and a 1.2 multiplier. This meter floors the first pixel-dimension resize as a local estimation convention; the guide does not specify that first rounding direction. Later patch-budget resizing follows its stated formula. The overall result remains `estimated` because OpenRouter/OpenAI chat formatting is private. GIF input must contain exactly one complete frame; animated and truncated GIFs are unavailable. Source images larger than 65,535px are resized in the estimate; this is not a source-dimension rejection limit. The three GPT-5.6 Pro leaves reuse those base image rules as an **estimated proxy**: their [exact OpenRouter model pages](https://openrouter.ai/openai/gpt-5.6-sol-pro) identify the same underlying base model in pro reasoning mode, consistent with the [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode). This is an inference, not measured Pro preprocessing or a uniform error bound. Algorithm `openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1` invalidates the previous text-only basis. Pro input observation stays `scope_unknown`, so every request uses full estimation and the configured margin. Remote/invalid/dimension-unknown images remain unavailable before send. The supplied GPT-6 estimates below do not establish exact tokenizers. The caller supplies `tokenMargin` explicitly; actual usage and cost come only from upstream.

The three GPT-5.6 base bindings now use `openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1` and replay revision `openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1`. Old profiles/meters and anchors are not aliases; this encrypted-replay rule does not apply to Pro, whose `scope_unknown` boundary remains. For a known complete same-source reply group, original-order once-only replay into one unchanged assistant wire message, known output usage, matching binding/provider/envelope and recognized `openai-responses-v1` details, replay estimates **O + 0**, never O + reasoning. The [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) states GPT-5.6 defaults to preserving reasoning across turns; [OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) uses the model default when context is omitted (checked 2026-09-29). This is a versioned applicability inference for the fixed standard route with effort-only or absent reasoning controls, not an observed effective-mode fact. Zero net framing is a frozen experimental assumption, not an equality or upper bound; real next-input residuals and holdout certification remain pending. Margin applies once to I + estimated replay + estimated new input. Ciphertext and stable history never enter the tokenizer during this marginal path.

Partial, reordered, duplicated, mutated or split-across-messages groups, unknown modes/formats or missing source/output usage cannot use aggregate O. Prefix/basis changes fall back to full; full/new opaque history without usable per-group evidence is still unavailable and remains intact. This slice therefore supports ordinary anchored append, not arbitrary compaction or multi-group recovery. `tests/openai-encrypted-replay.spec.ts` covers three public TLS rounds per base model plus mapping negatives, exact large O preservation and zero stable-prefix/ciphertext tokenization. The authenticated demo service test runs three rounds with low/omitted effort and zero-send admission rejection. These controlled TLS fixtures verify local plumbing only; they do not certify provider framing, effective mode, or complete model delivery. The older encrypted-input and demo-delivery tests retain their no-source/unknown-format refusal checks.

`createOpenAiInputMeter(definition)` binds GPT-6 Sol revision `3` / implementation `mp4-6` to a visible-history estimate using `js-tiktoken@1.0.21` and the `o200k_base` surrogate. It covers a single user message, full system/developer/reminder history, assistant visible text/plain reasoning, complete paired tool calls/results, and tool schemas. Sol's new estimate tokenizes the complete final JSON, including controls as actually sent: declared `none`/`low`/`medium`/`high`/`max` efforts and omitted effort are accepted without inventing an upstream default. This extends Sol's own low-effort text observations to a protocol estimate; it does not establish GPT-6 tokenizer identity, private framing, an error bound, or live certification of every effort. The [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode) distinguishes execution mode from effort; the implementation remains scoped to the standard Sol slug on the fixed OpenAI route. Callers supply `tokenMargin` explicitly. After a usable response anchor, replay/new contributions tokenize only units outside the verified prefix; their JSON framing differences remain `estimated`, and the planner applies margin once to the composed estimate. Prefix or counting-basis changes return to full measurement. Images and opaque/unknown reasoning remain unavailable without dropping history. Luna now uses the final-visible successor below; its three historical observations retain their original algorithm and binding; Sol no longer uses a separate unbound candidate factory. Actual usage/cost always come from the upstream response.

GPT-6 Sol revision `4`, Luna revision `5`, and Sol/Luna Pro revision `4` share `pi-ai:openai/mp4-15`. The common final-visible-JSON estimator covers visible history, system/developer reminders, paired tool calls/results, schemas, and all declared efforts as actually sent. Inline PNG/JPEG/WebP and complete single-frame GIF use a dimension-based **estimated proxy**: `ceil(ceil(width / 32) * ceil(height / 32) * 1.2)`, plus `o200k_base` tokens of the final JSON with image bytes replaced by `[image]` only in the metering copy. The public planner omits detail; direct final-body metering accepts omitted/`auto` only. This is an empirical family surrogate, not an upstream Sol/Luna preprocessing rule. It imports no Astra resize or patch cap, uses no fixture-byte whitelist, and subtracts no observed residual.

The four algorithms are `openai-gpt-6-{sol,luna,sol-pro,luna-pro}-final-visible-json-image-proxy-2/response-calibration-1`. Previous bindings/calibrations are not aliases. Exact 4 MiB per-image limits remain profile-enforced; unknown remote URLs, malformed/MIME-mismatched images, animated/incomplete GIF, unsupported detail and opaque reasoning remain unavailable without trimming history. Explicit `tokenMargin` applies to the combined estimate; upstream usage/cost is unchanged. Base models can reuse valid response calibration and meter only new image/text contributions. Pro stays full because upstream context scope is unknown. Current profiles retain their declared finite token limits and four image formats; finite sample dimensions are evidence points, not a new product whitelist or guaranteed error bound.

The [image study](../../../.meta_harness/research/openai-sol-luna-image-estimation/README.md) preserves six actual base image requests and two Pro pair requests with precise source/binding hashes. Base observations used `low` effort and synthetic PNGs; Pro acceptance does not validate context accuracy. The implementation uses the already accepted estimated-meter policy D-101 with caller-configured margin. Run `pnpm --filter @omne-harness-lite/pi-ai-transport exec vitest run tests/openai-sol-luna-images.spec.ts --maxWorkers=1` for generic dimensions, full image/history/tool wire preservation, current bindings, original accounts and zero-HTTP admission failures. The demo's `openai-sol-luna-images-service.spec.ts` verifies durable three-turn composition and exact byte/token refusals. These local checks do not certify every real format/effort or full public/service model delivery.

GPT-6 Astra definition revision `3` / `pi-ai:openai/mp4-10` supplies full/replay/new estimates for final visible text and inline user images. The shared patch calculator uses the archived [OpenAI image guide](https://developers.openai.com/api/docs/guides/images-vision) (2026-09-28, `image-doc.md` SHA256 `4936284cccfc38f22281d6a698b6f190ccc857849ea8dc533ed68617984b608d`): 32px patches × 1.2; `low` fits 512px, `high` fits 65,535px and 2,500 patches, and `original`/`auto` fit 65,535px with rejection above 30,000 processed patches. The guide's 4096×512 `high` example is 2,458 tokens. GPT-5.6 uses its own 2,048px high-detail limit and retains its existing source-dimension support boundary. Initial integer resizing uses the documented local floor convention; actual provider preprocessing and total framing remain estimated.

The metering copy replaces inline image data with `[image]` and adds each visual contribution once; HTTP body, original history, actual bytes/image limits and upstream usage/cost remain intact. The planner currently emits the image's actual default detail (no invented wire detail); direct final-body meter calls also validate explicit detail values. Valid PNG/JPEG/WebP and complete single-frame GIF use the shared MIME/dimension checks; unknown URLs, mismatched MIME, invalid base64, animated/incomplete GIF and opaque reasoning remain unavailable. The standard Astra binding uses its named image rule; the separately versioned Astra Pro proxy is described below. Algorithm `openai-gpt-6-astra-final-visible-json-o200k-patches-1/response-calibration-1` and replay revision `openai-gpt-6-astra-visible-image-units-json-net-estimated/1` invalidate earlier text-only calibration; the factory rejects revision `2` / `mp4-8`. Stable image history is not sent to the marginal tokenizer; new images use the same sizing rules. Prefix image changes require full measurement. Explicit `tokenMargin` still applies once to the combined estimate. `tests/openai-astra-images.spec.ts` covers numeric examples, limits, unchanged wire, old basis and image-prefix invalidation; the demo's `openai-astra-images-service.spec.ts` covers authenticated three-turn local TLS calls. These checks do not certify live OpenRouter image acceptance, private preprocessing, exact tokenizer identity or a universal error bound.

GPT-6 Astra Pro, Sol Pro and Luna Pro share the final-visible-JSON/o200k surrogate with individual model and evidence identities and each route's declared effort set. Their meter returns `estimated`; their billed samples are not context calibration points or fitted overhead. Tools, reminders, plain visible reasoning and history are measured as actually serialized. Sol Pro/Luna Pro images and all three Pro opaque reasoning inputs have no applicable meter and are refused intact; the Astra Pro image proxy is described below. The factory rejects old unmetered revisions. This closes the local pre-send meter availability gap, not live per-model certification or upstream context-scope uncertainty. This Pro change does not alter the standard Sol/Luna counting scope described above.

`createAnthropicInputMeter(definition)` binds only the four named Claude 5.x definitions at revision 2 on the `anthropic` provider. It uses a pinned [Anthropic legacy Claude BPE](https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b), which Anthropic calls a **very rough approximation** since Claude 3. [Claude 4.7 and later use a newer tokenizer](https://platform.claude.com/docs/en/build-with-claude/token-counting); this meter is not that tokenizer and has no uniform error bound. It first checks the complete final wire value, then estimates its input-bearing messages and tools, including multi-turn text, user reminders, tool results and plain reasoning. Generation, routing and cache-control values do not add prompt tokens. Cache TTL values come from the bound route declaration. This JSON input projection remains a rough approximation of OpenRouter's private conversion. Inline PNG/JPEG/WebP/GIF images in user and tool-result history use the documented Claude 4.7+ 28px visual-patch estimate (2576px edge and 4784-patch limits); image bytes are retained in the request. Encrypted or unknown reasoning replay remains unavailable before send; ciphertext length does not measure retained model reasoning. The four definitions bind to `pi-ai:anthropic/mp4-5`. Supply the margin explicitly for each request, and compare each model's future live usage against this rough estimate before claiming route certification. Neither the estimate nor its margin replaces actual upstream usage or cost.

`createQwenInputMeter(definition)` supplies all eight fixed Alibaba models. The two open-weight leaves keep their pinned public vocabulary/Jinja full estimators: Qwen3.8 2.4T-A95B (`mp4-2`) and 27B (`mp4-3`), with 27B's existing unscaled inline PNG subset. The six commercial leaves (Max 0902, MaxPrime, 3.8 Flash, 3.7 Max/Plus/Flash) now bind definition revision 2 / `mp4-6` to one complete **visible final-JSON** estimator. It uses the pinned Qwen public tokenizer as a surrogate over the entire actual request, including ordered system/user/assistant/tool messages, reminder text, schemas, call arguments/results, visible reasoning and protocol/cache controls. Whitespace and lossless schema numbers are preserved. This is an estimate of private OpenRouter/Alibaba framing, not a claim that those models share the public tokenizer or that JSON is their native prompt format. Historical single-user `+51`/`0` fits are not transferred to this new representation. Full measurement is available for ordinary visible multi-turn input; nonempty incremental input still falls back to full. Commercial images/video, encrypted/unknown reasoning and unrecognized fields remain unavailable without removing history. Callers supply the token margin; actual usage/cost always remain upstream facts. Exact current-binding public/service OpenRouter holdouts and the remaining declared modalities are still required for complete model delivery.

`createGlm52InputMeter(definition)` and `createGlm53InputMeter(definition)` cover GLM-5.2, GLM-5.3 and GLM-5.3-Flash text/tool requests using pinned public templates and vocabulary. Results are estimates for the fixed OpenRouter routes, with an explicit caller margin. Historical reasoning, unsupported media and unverified effort mappings return unavailable. `createZaiCommercialInputMeter(definition)` separately binds Prime on `alibaba` and FlashX on `z-ai/fp8` to a rough text/tool estimate. It uses the pinned public GLM-5.3 template/tokenizer projection minus one token, fitted and checked on eight selected-route observations. This does not establish hosted tokenizer identity, exact accounting or an error bound. Prime definition 2 / `mp4-2` admits its already-declared `low`/`high`/`max` request effort through that same public template, without refitting the one-token correction. This estimated scope extension has no actual effort holdout or hosted-template guarantee. FlashX stays at definition 1 / `mp4-1` and does not supply effort. Callers supply `tokenMargin`; historical reasoning, media, malformed/undeclared effort and unsupported cache layouts remain unavailable. Bundled source licenses, including the distinct GLM-5.3 license, accompany the tokenizer artifacts.

`createGoogleInputMeter(definition)` binds the two Gemini 3.7/3.8 Flash AI Studio definitions at revision 2 / `mp4-3`. It counts visible text and tools with the pinned Gemma4 comparator and a frozen per-model offset, returning a rough `estimated` result with an explicit caller margin. Eight fixed-route observations included separate fit and holdout inputs: maximum observed undercount was 10 tokens and maximum absolute error was 60; neither is an error bound. This is not the Gemini tokenizer. The declared `low`/`medium`/`high` request effort values are admitted as generation controls outside the messages/tools estimate; this extends the existing surrogate without refitting its offset or claiming effort-specific upstream accuracy. Omitted effort stays omitted; other values follow the definition’s existing drop rule. Direct unsupported effort structures, media, opaque reasoning replay and unknown controls remain unavailable. Actual effort holdouts remain required. The bundled tokenizer and license are included in packed consumers.

`createXaiInputMeter(definition)` binds Grok 4.6 and 4.7 (definition 2 / `mp4-3`) to a rough visible-text/tool estimate on the pinned xai route. It projects the first-party Grok Build UTF-8 byte heuristic over the final wire and adds per-model offsets fitted only on the two calibration observations: 141 for 4.6 and 1181 for 4.7. Independent tool-history holdouts overestimated complete input by 35 and 34 tokens respectively. This is neither an exact tokenizer nor a proven upper bound; callers configure the margin. Complete context input includes uncached input plus both cache-read/cache-write components. Unknown components leave the total unknown. Declared `low`/`medium`/`high` effort values are included in the complete wire estimate. The frozen offsets were not fitted separately per effort; this scope extension has no actual effort holdout yet. Opaque reasoning, media and malformed or undeclared direct effort remain unavailable without deleting history; complete model certification remains outstanding.

```ts
import { createXaiInputMeter, xaiDefinitions } from '@omne-harness-lite/pi-ai-transport'

const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
const meter = createXaiInputMeter(definition)
// Supply this meter to createPiAiTransport({ ..., inputMeters: [meter!] }).
```

`createMoonshotInputMeter(definition)` binds Kimi K3 and K2.7 Code to their pinned vocabulary and distinct XTML/Jinja prompt templates. Text, plain reasoning and paired tool history are estimated; the complete JSON envelope is not counted again. K3 `mp4-3` orders consecutive parallel tool results by the preceding call IDs for its prompt estimate, following the pinned encoder. The transmitted history remains unchanged; K2.7 uses `mp4-2`. Both models estimate inline PNG/JPEG/WebP image tokens with their pinned model-specific visual processors, including images in complete text/tool history. Remote images, video, encrypted/unknown reasoning and unrecognized model-input fields remain unavailable. These estimates do not certify OpenRouter usage or cache retention. The caller supplies the token margin. Bundled `LICENSE.K3` and `LICENSE.K27` retain the respective upstream licensing and attribution conditions.

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
  const result = transport.plan(request)
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

This path adopts [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md) and the [transport credential projection, revision 3](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v6-credential-path-design.md). Save the following as `execute-once.ts` and call it with a transport owning a verified complete definition. It borrows that transport, retains the same processed H and stops the response before returning; the owner closes the transport when finished.

```ts
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PiAiTransport } from '@omne-harness-lite/pi-ai-transport'

export async function executeOnce(
  transport: PiAiTransport,
  request: PlanInput,
  credential: string,
  signal: AbortSignal,
) {
  const plan = transport.plan(request)
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
      await reader.return({ aborted: true })
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
  const result = lease.transport.plan(request)
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

`deepseekV4Pro0813Definition` provides one fixed leaf for `deepseek/deepseek-v4-pro-0813` through `deepinfra/fp8`. It shares the OpenRouter planner and DeepSeek family rules under `pi-ai:deepseek / mp4-3`; its definition revision is `3`. Importing it does not register a model, allocate a connection pool or send a request.

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

Pure construction and planning are verified locally. Seed/stop effectiveness, full parameter tuning and production public/service certification remain pending. The first end-to-end call uses only the previously observed `low` and `1024` parameters. The separate Flash definition is present in `deepseekDefinitions`; its image cap and unknown upstream image facts are explicit. Neither declaration proves live image carriage.

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

The Anthropic cache probe (`tests/fixtures/anthropic/cache-public.mjs`) uses explicit TTL configuration and separate write/read/expiry commands. Its current official binding accepts only `1h`; `5m` is rejected before a plan or network request. It records public invocation outcomes, accepted arrival events and retained response headers. `capture.rawSseBody: false` and `capture.protocolFailureFrame: false` state that the original SSE body and rejected frame are not captured. Nonempty unsupported `images`, `audio` and `refusal` content remains a protocol failure. The reader now reports `unsupported content member: images`, `unsupported content member: audio`, or `unsupported content member: refusal` through the existing `localError` path. Only a fixed field name is included; field values are never added. Public invocation applies the existing credential redaction to this text. Empty strings, empty arrays and null remain ignored. Usage and cost already parsed from the same frame survive the failure; later, unread usage is not invented. These diagnostics cannot recover an old rejected frame or identify its field from a historical generic error/hash.

`tests/openai-sol-calibration.spec.ts` checks all declared Sol efforts plus omitted effort, exact-decimal margin boundaries, real public invocation over local TLS, full→marginal→marginal, a tokenizer spy excluding the stable prefix, and prefix/basis/source negative controls. `tests/openai-visible-history-candidate.spec.ts` now exercises the official Sol/Luna factories against the preserved frozen history inputs. The original Sol text-proxy observations remain separate from the new final-JSON predictions. These are local conformance checks, not new OpenRouter certification.

Moonshot image probe fixtures have separate PNG integrity and production input-limit checks: `node --test tests/fixtures/moonshot/repair-image.test.mjs` and `pnpm exec vitest run tests/fixtures/moonshot/repair-image.spec.ts`. These local checks do not establish provider acceptance or cache behavior.

### ZAI history candidate checks

ZAI's unbound historical-thinking candidate in `src/input-meters/zai-candidate.ts`
reuses the pinned GLM tokenizer and template for complete plaintext assistant
history. It is not exported by the package entry point or registered by official
models. Hosted Prime/FlashX history accounting and mixed opaque/plain history
remain unverified. The five recorded complete SSE responses exercise production
stream assembly over local TLS; their independent Jinja prompt goldens cover
only the public-template projection. The mixed-history test has one named
expected failure and must not be counted as an acceptance pass.

After building, prepare the fifteen unsent control/plain/details probes with an
explicit output limit (this command has no network or credential access):

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.mjs \
  --max-output-tokens 512 > tmp/zai-history-probes.json
node --test packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.check.mjs
```

The unbound `createXaiHistoryCandidateInputMeter` in `src/input-meters/xai-candidate.ts` preserves the original opaque history while estimating the known `xai-responses-v1` encrypted item and optional adjacent summary from the pinned first-party heuristic. Four frozen planner-to-TLS samples are checked locally. Unknown wrappers and multiple encrypted items are rejected; live replay and official binding remain pending. This is an estimate with an explicit caller margin, not an error bound.

`ModelTransportService.diagnostics()` reads the underlying instance’s `failed`, `pending` and `dropped` diagnostic-delivery counts without acquiring a lease. It remains readable after close. An optional request-local emitter is passed as the final argument to `send` and `read`; the same emitter owns both phases. Its typed facts contain no message bodies, credentials or engineering identities in HTTP. A mismatched emitter is rejected. Complete runtime invocation wiring and multi-session acceptance remain separate.

An assistant message combining same-route opaque reasoning with an additional independent plaintext thinking block is currently unavailable at planning, before any HTTP send. The original history is not changed or silently dropped. Single-block opaque replay and plaintext-only history keep their existing paths and metering gates. How the selected route consumes both representations together remains unverified; this refusal is not successful mixed-history support.

## Response-calibrated input planning

`PlanInput.calibration` and `PlanInput.outputHistory` are required. Use `{kind:'none',reason:'no_observation'}` and `[]` for a first request without a predecessor. A later input anchor uses a legitimately obtained observation with the original `inputCalibration`, `usage`, complete retained `outputBlocks`, and explicit `replaySelection`. Independently, `outputHistory` carries every selected earlier response with a known output group, including responses without a usable input count. Each group keeps the original route binding, provider, parameters and any actual serving provider/upstream model. Groups are ordered by their first selected target. Missing `outputHistory` is malformed; the planner does not silently replace it with `[]`. Selection indexes identify source blocks and current message/block positions; the planner verifies actual values and final projection coverage. A caller cannot bypass this with a trust flag.

`InputMeter` now supplies `measureFull`, `measureReplay` (φ) and `measureNew` (δ), plus tokenizer/replay/transform revisions. The root exports each operation independently, along with `projectInput`, `projectOutput` and `canonicalProjection`. Marginal results permit signed integers; planning composes accurate I + φ + δ and applies `tokenMargin` once if the result is estimated. `planned.measurement` reports full/marginal, precision, contributions and any source/prefix/basis fallback. Actual usage and cost remain separate.

`measureFull` receives `FullMeterInput`: the actual final body and serialized wire, its one final `InputProjection`, all selected output groups and their `historySpans`. `measureReplay` receives `ReplayMeterInput` with the original anchor `observation`, its matching history group when present, absolute `unitIndices` and `selectionSpans`. `measureNew` receives `NewMeterInput` with absolute N-only `unitIndices`, the current `countingBasis`, and only the complete groups allocated to N plus their spans. A history span identifies its source group and selection, and its half-open final unit range. Multiple blocks may share one range; a shared unit cannot be counted twice. The planner copies, validates and deeply freezes these values before metering; stable P content is absent from both marginal unit arrays.

The shared planner validates all groups before calling any meter, then allocates each group to stable P, anchor replay G or new N on the same final projection. P is already covered by the accurate input observation and contributes no additional O; G is charged once through φ; N goes to δ. A group crossing regions falls back to full. Full still receives all legal groups, even if no usable input observation exists. Partial, duplicated or reordered selections need a supported model mapping or a full count; no aggregate output count is divided among blocks. Independent `measureFull(meter, input)` returns `unavailable` for malformed known facts, while independent `measureReplay`/`measureNew` return `invalidInput`. Unknown old projection revisions are an evidence gap rather than a claimed digest mismatch. The original content remains in the outgoing wire, and final estimated tokens receive the configured margin once. See [runtime v19](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v19-output-history-design.md) and [transport v13](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v13-output-history-design.md) for the adopted handoff.

A replay implementation can inspect `input.observation.usage.output_tokens` together with the original group and actual selection; this does not authorize adding that aggregate to input tokens. Whole-group reasoning must check coverage, source identity, actual target order and exactly-once selection, rather than selection-array order. A source block may legitimately map to several targets; those facts remain visible instead of being globally rejected. Partial, repeated or reordered groups must not silently receive a full-group formula. Independent calls through the exported `measureReplay(meter, input)` must supply valid source and projection relationships; TypeScript `readonly` does not establish provenance. Model-specific unsupported relationships retain `invalidInput`/`unavailable` results and the planner’s existing full fallback. This interface adds no model-specific I+O rule.

The four Anthropic definitions use revision 2 / `pi-ai:anthropic` `mp4-5`: nonempty assistant/tool text is a single text-block array from its first request, and only the exact supported 1h cache marker is omitted from its input-bearing projection. Wire markers and complete request byte/image checks remain. Cache layout stays `last_message`; no additional omne-next breakpoint strategy is enabled. New revisions first run full. Stable later prefixes are scanned/hashed but never tokenized again.

Anthropic and the applicable OpenAI visible-history routes provide **estimated** JSON net contributions for newly replayed/appended units. They remove empty-envelope framing in the surrogate; this is not a proof of private template/BPE boundary equality. They do not infer hidden thinking input from aggregate output tokens or ciphertext length. Other existing full meters retain their supported domain and explicitly return marginal unavailable until route-specific evidence exists; no missing model is silently supplied. A failed marginal calculation tries full; if full is unavailable the request is rejected without HTTP or history removal.

Every reader terminal result has `readFacts` from the same accumulator as account events. Usage is captured when parsed, including before later malformed frames or cancellation. Complete prompt totals do not require fabricated zero cache components; `X-OpenRouter-Cache-Status: HIT` produces response-cache unavailable, not an input-zero anchor. Repeated cumulative facts are not summed. Cancellation stops and awaits the actual response resource and returns already-known facts without waiting for future usage.

The current local regression suite includes pure planner and actual TLS reader cases. Live 37-model certification and full runtime/service integration are separate acceptance work; a local passing test does not certify an upstream route.

### OpenAI Pro input observation scope

The three GPT-5.6 Sol/Terra/Luna Pro definitions use revision 6 / `pi-ai:openai/mp4-13`; GPT-6 Astra Pro uses revision 4 / `mp4-14`; GPT-6 Sol/Luna Pro use revision 4 / `mp4-15`. Their upstream input accounting scope is unconfirmed. Complete or partial actual usage/cost remains unchanged, while `observedInput` is `unavailable/scope_unknown`. Missing usage, response-cache hits, and inconsistent usage keep their existing more specific handling. Valid zero does not establish scope. The planner also rejects historical or forged current-shaped known anchors for these contributions; GPT-5.6 Pro continues full estimated admission with the configured margin. GPT-6 Pro now supplies full visible-input estimates through the official factory, with explicit margin on every request; it remains in full mode while input observation scope is unknown.

The private fixed reader rule is shared with planning, selected from the owned request binding, with no public trust flag or extra I/O. The current Pro transform revision is `openrouter-input-transform/pro-scope-1`; this scope boundary remains independent of the supplied estimator revision. Exact previous contribution identities retain their captured reader semantics while an existing lease drains under the registry retirement protocol. The default official table/factory offers only the new identities. This is neither a historical compatibility entry nor a new global ban on explicitly trusted custom code contributions; other trusted contributions retain their prior reader assumptions, without claiming fresh certification of their upstream token scope.

### DeepSeek signed marginal reference counting

Pro0813 revision 3 / `mp4-3` and Flash revision 2 / `mp4-4` use its pinned public reference renderer for full and signed replay/new estimates on `deepinfra/fp8`. The fixed binding recognizes the OpenRouter serving display name `DeepInfra`; other provider/model identities still invalidate calibration. A pure provider projection compares the old and current reference prompt without tokenizing stable history. Only anchor-external fragments and the finite terminal assistant framing reach the marginal tokenizer. With a new input, δ owns the final framing change; otherwise φ does. The boundary check rejects substantive old reasoning/content rewrites and falls back to full. Unknown opaque reasoning never gains marginal support from ciphertext length.

`MarginalMeterInput.boundary` is an optional provider-owned description, produced after source, prefix, and basis validation. It is not a caller trust flag. DeepSeek keeps G/N in their real order before deriving signed suffix differences, including missing-usage turns, merged user/tool messages and empty-side cases. φ estimates the P→P+G suffix change; δ estimates P+G→the actual final ordering. Thus δ can subtract newly replayed reasoning excluded by a later user input. These are estimated net contributions, not measured per-message token counts. Independent suffix tokenization and the OpenRouter/DeepInfra private template remain **estimated**, not exact or an upper bound. Apply the configured margin once to the combined input. This work adds no paid serving certification or cache-hit guarantee. Full request bytes and image limits are still checked; full linear serialization/rendering/hashing remain necessary, while stable P never enters the marginal tokenizer.

Flash uses its own pinned renderer, tool-result ordering, tokenizer and image-span formula. Marginal counting adds only new image spans; the placeholder already in the prompt is subtracted once. Appending a tool result that reorders substantive old projected content falls back to full.

GPT-6 Astra Pro definition revision `4` / `pi-ai:openai/mp4-14` reuses the named Astra image rule as an **estimated proxy**, based on its [exact same-base Pro-mode identity](https://openrouter.ai/openai/gpt-6-astra-pro). Algorithm `openai-gpt-6-astra-pro-final-visible-json-o200k-image-proxy-1/response-calibration-1` replaces the old text-only basis. It shares the existing counter, keeps image bytes in every actual request, and still uses full admission with explicit margin because upstream input scope remains `scope_unknown`. This is not measured Pro preprocessing. Sol/Luna use their separately versioned empirical proxy described above. `tests/openai-pro-images.spec.ts` checks the four supported Pro image bindings, model-specific high-detail limits, original wire/accounts and unsupported input; the demo service test exercises durable three-turn history.
