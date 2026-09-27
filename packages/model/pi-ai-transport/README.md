# @omne-harness-lite/pi-ai-transport

[中文](README_ZH.md)

Plan a single OpenRouter request, send it over HTTPS, and translate its SSE stream into public arrival events. This experimental ESM workspace package uses a targeted pi 0.86.1 fork; it is not published on npm.

The default static pilot set contains `openai/gpt-6-sol` and `anthropic/claude-sonnet-5`. The separately exported `officialDefinitions` contains the 37 confirmed model identities, reminder roles and route/cache rules. Select it explicitly; registration does not certify a model or its cache behavior. Complete capability offers, directory publication and live model certification are pending. Follow the [realization status](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md) for accepted scope and verification.

## Public API

| Export | Purpose |
| --- | --- |
| `planRequest` | Pure validation and immutable wire planning; reports rejection and dropped parameters |
| `sendRequest`, `readStream` | Separately reusable send/read functions with explicit owned network resources |
| `createPiAiTransport` | Own a connection pool and provide `plan`, `send`, `read`, `close` and diagnostic counters |
| `pilotDefinitions`, `officialDefinitions`, `ModelDefinition` | Explicit static model/implementation revisions and route policies |
| `createModelTransportService` | Own a shared pool and process-local adaptation registry |
| `AdaptationLease`, `RetirementPolicy` | Fixed bindings, execution retention and explicit retirement scheduling |
| `parseSSE`, `canonicalInteger`, `generatedCallId` | Strict framing and exact deterministic call identity helpers |
| `OPENROUTER_BASE_URL`, `PI_AI_CARRIABLE_MODALITIES` | Default endpoint and supported input modalities |

## Plan a reminder without sending

```ts
import { planRequest, pilotDefinitions } from '@omne-harness-lite/pi-ai-transport'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'

const definition = pilotDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const reminder = judgeMessage({
  id: 'reminder-example', type: 'system_reminder', nature: 'event',
  source: { kind: 'extension', extension: 'example:reminder' },
  createdAt: '2026-09-27T00:00:00Z',
  blocks: [{ id: 'text-example', kind: 'text', text: 'Continue the task.',
    visibility: { toHuman: true, toModel: true } }],
})
if ('rejected' in reminder) throw new Error(reminder.rejected)
const input: PlanInput = {
  target: { kind: 'model_call', callId: unwrap(parseOpaqueIdentifier('call-example', 'ModelCallId')), dispatch: 1 },
  routeName: definition.modelId, provider: 'openai', messages: [reminder.ok], tools: [],
  parameters: { maxOutputTokens: 128 },
  snapshot: {
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: { revision: 'example-automatic-1', values: { cache: { mode: 'automatic' } } },
    },
    providers: ['openai'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 128000, maxOutputTokens: 4096, updatedAt: '2026-09-27T00:00:00Z',
  },
}
const result = planRequest(input)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // role: developer; no network operation
```

Unknown exact revisions or routes are unavailable. Uninterpretable configuration is invalid input. Automatic cache mode sends no explicit cache controls. The Anthropic pilot requires `configuration.values.cache = { mode: 'explicit', ttl: '5m' | '1h', breakpoints: [...] }`; supported breakpoint names are `system`, `last_tool`, `last_message`. Supply the TTL explicitly. Cache hits come from reported usage, never from planning.

## Own the transport

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'

const transport = createPiAiTransport({
  policy: {
    maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
    maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
  },
  onDiagnostic: event => { console.log(event.kind) },
})
// transport.plan(input), then transport.send(planned, credential, signal),
// then transport.read(response, planned, signal), or use invokeModel.
await transport.close()
```

Use `invokeModel` from the companion runtime package for assembly, first-content gating, deadlines and a final result. Standalone callers supply credentials and cancellation explicitly and hold resources until execution stops. No environment credential lookup, retry, provider fallback or redirect is performed. Read each response once with its original plan. Preserve raw tool fragments and lossless numbers; transport does not parse tool argument JSON or produce the host's finish event.

A public test consumer may supply an explicit HTTPS `baseUrl` and CA. The product endpoint is OpenRouter. These options do not make another production provider supported.

Direct send/read representation errors return `{ rejected: "invalidInput" }`; a withdrawn transport returns `unavailable`. Competing response readers are refused without a second read.

HTTP failures retain redacted actual response headers, including separate repeated values. Inconsistent token subtraction produces unknown counts and a diagnostic; it does not fabricate zero. These facts do not establish upstream billing semantics.

Reasoning fragments join only when all other metadata matches. Different detail identities or unknown metadata remain separate opaque values for same-route replay. A reported provider change keeps the first value and emits `model_transport.serving_provider_changed`. The shared implementation is revision 5. When every `extra` entry is protected and dropped, the actual parameter record omits `extra`; it never keeps an invalid empty object. Earlier revision 3 or 4 evidence does not certify this revision.

## Register and retire precise versions

`createModelTransportService(options)` starts with no contributions. Register a definition with an owner object and cleanup function, acquire its exact binding, then retire the returned registration token. Reusing an exact revision for different content is rejected, including after retirement. An unknown or retiring version is unavailable; no newer revision is substituted.

```ts
import {
  createModelTransportService, officialDefinitions, type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'

const retirement: RetirementPolicy = {
  waitMilliseconds: 1000, force: false,
  schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
}
const service = createModelTransportService({ policy: {
  maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
} })
const definition = officialDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const registered = service.registerAdaptation(definition, {}, () => {})
if ('rejected' in registered) throw new Error(registered.rejected)
console.log(await service.retire(registered.registered, retirement))
console.log(await service.close(retirement)) // no HTTP request was made
```

After acquisition, use `lease.transport` and retain the invocation's outcome with `lease.track(handle.outcome)`. Track any additional asynchronous gate, callback, settlement or handoff before release. Call `lease.release()` once your work has settled; repeated release is harmless. Release closes that holder's admission but pending tracked work still retains its resources. The caller remains responsible for releasing its lease.

Retirement closes new acquisition immediately. `force: true` requests cancellation through the lease signal and the transport. `remaining_active` reports an expired wait while resources are still held; abort alone is not completion. Cleanup failure retains visible ownership. `service.closed` resolves only after contributions and the owned pool have stopped. Registration is process-local and does not publish a profile, authorize a tenant or persist a version.

## Use trusted Cordis contributions

The `./plugin` entry exports `piAiTransportPlugin`, `createModelPlugin` and `MODEL_TRANSPORT_SERVICE`. It requires Cordis 4.0.4 and uses the shared kernel plugin helper. The package root can be imported without loading Cordis. The stable plugin provides one `modelTransport`; model contribution plugins register precise versions inside that service and share its pool.

```ts
import { Context } from '@deepseek-ai/cordis'
import { officialDefinitions } from '@omne-harness-lite/pi-ai-transport'
import { piAiTransportPlugin, createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'

const ctx = new Context()
const retirement = {
  waitMilliseconds: 1000, force: false,
  schedule: (ms: number, callback: () => void) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
const stable = ctx.plugin(piAiTransportPlugin, { retirement, policy: {
  maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
} })
await stable
const definition = officialDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const contribution = ctx.plugin(createModelPlugin(definition, retirement), {})
await contribution
await contribution.dispose()
await stable.dispose() // no lease acquired, no HTTP request made
```

A missing required service leaves a contribution pending; invalid plugin configuration fails before publication. Installing a new model contribution does not replace the stable service. Profile adoption and retirement are separate actions. During disposal, an active lease or tracked callback keeps cleanup waiting after a reported timeout. Contributions are for trusted assembly code; tenant-supplied configuration is not executable plugin code.

## Development

```sh
pnpm --filter @omne-harness-lite/pi-ai-transport... run build
pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck
pnpm --filter @omne-harness-lite/pi-ai-transport run test
```

Tests use real temporary HTTPS servers, the public runtime/core assembler and real Cordis lifecycle transitions. They do not certify all live model routes, cache expiry, durable runtime recovery or the complete observability chain. Fork provenance and license are in [UPSTREAM.md](UPSTREAM.md), [provenance.json](provenance.json) and [LICENSE.pi](LICENSE.pi).
