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
| `planRequest(input, definitions, meter)`                                         | Pure fixed-byte plan and final input admission with a trusted, versioned model/provider meter                                     |
| `createPiAiTransport(options)`                                            | Explicit definitions, bound input meters and owned pool with plan/send/read/close                                  |
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
  measure: () => ({ kind: 'exact', tokens: 1 }),
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

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` binds the separate V4.1 Flash tokenizer and public encoder to `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`. Official multi-turn/tool and two-image prompts are checked against pinned upstream vectors. For inline images, the estimate adds 1,024 tokens per occurrence, based on the model's published `vision_max_n_token` and reference image processor; actual provider preprocessing is not public. Image bytes and count still use the exact final-body gate. Unknown image URLs or unsupported content make the meter unavailable before HTTP. The estimate includes the serialized request fields outside the rendered prompt without treating inline base64 as text tokens. Configure the margin per request; these estimates do not replace reported usage or prove live image delivery.

`createOpenAiInputMeter(definition)` binds only the six named GPT-5.6 Sol/Terra/Luna base and Pro definitions at revision 1 on provider `openai`. It uses the pinned `js-tiktoken` `o200k_base` encoder, following the [current OpenAI tiktoken source mapping](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py) for GPT-5; released tiktoken 0.12.0 does not recognize each GPT-5.6 name, so this is an **estimate**, not an exact per-model tokenizer certification. The estimate covers the final serialized messages, `developer` reminders, tools, tool results, reasoning and protocol fields. It substitutes a marker for each inline image rather than tokenizing base64. The three base models apply the [OpenAI vision guide's](https://developers.openai.com/api/docs/guides/images-vision) named 32-pixel patch and 1.2× image rule for omitted/`auto` detail. Pro image inputs return `input_size_unavailable` until variant-specific image accounting is evidenced; remote, invalid or dimension-unknown images also refuse before send. GPT-6 has no evidenced tokenizer mapping here and cannot construct this meter. The explicit per-request margin absorbs estimation risk; actual usage and cost still come from upstream.

`createAnthropicInputMeter(definition)` binds only the four named Claude 5.x definitions at revision 1 on the `anthropic` provider. It uses a pinned [Anthropic legacy Claude BPE](https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b), which Anthropic calls a **very rough approximation** since Claude 3. [Claude 4.7 and later use a newer tokenizer](https://platform.claude.com/docs/en/build-with-claude/token-counting); this meter is not that tokenizer and has no uniform error bound. It encodes the complete final OpenRouter Chat JSON, including multi-turn text, user reminders, tools/results, reasoning details, cache markers and provider fields, as an estimate of this fixed route; OpenRouter's private conversion is unknown. It refuses image content before send because no applicable image accounting is established. Supply the margin explicitly for each request, and compare each model's future live usage against this rough estimate before claiming route certification. Neither the estimate nor its margin replaces actual upstream usage or cost. The selected Google 3.7/3.8 Flash definitions still lack an evidenced local tokenizer binding and have no official input meter here.

## Own the transport

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import { definitions, request, networkPolicy, controlledMeter } from './example-definition.js'

const transport = createPiAiTransport({ definitions, inputMeters: [controlledMeter], policy: networkPolicy })
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
import { definition, request, networkPolicy, retirement, controlledMeter } from './example-definition.js'

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

`deepseekV4Pro0813Definition` provides one fixed leaf for `deepseek/deepseek-v4-pro-0813` through `deepinfra/fp8`. It shares the OpenRouter planner and DeepSeek family rules under `pi-ai:deepseek / mp4-1`; its definition revision is `2`. Importing it does not register a model, allocate a connection pool or send a request.

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
