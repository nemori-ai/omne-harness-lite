# @omne-harness-lite/model-request-runtime

[中文](README_ZH.md)

Invoke one explicit model transport and assemble its stream into a final result, with cancellation, content deadlines and an asynchronous first-content gate. This experimental ESM workspace package is not published on npm.

The current implementation is the standalone function slice. The durable thirteen-operation service, Cordis plugin, tenant admission, recovery, retries and reply settlement are pending. See the [realization status](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md) for exact adoption and coverage.

## Public API

| Export | Purpose |
| --- | --- |
| `invokeModel(input)` | Return a handle containing `outcome`, `snapshot()` and `abort()` |
| `classifyCause(facts, hasContent, table)` | Classify failure sources using an explicit status table without altering raw status |
| `dispatchGuard(input)` | Synchronously check one retry plan against explicit call, dispatch and profile facts |
| `DispatchGuardInput`, `DispatchGuardResult`, `DispatchGuardFact<T>` | Readonly guard inputs, closed answers and explicit known/unknown facts |
| `TransportAdapter`, `PlanInput` | Consumer-owned planning/send/read ports and explicit request context |
| `InvocationPolicy`, `ModelInvocationResult` | Scheduling/redaction/diagnostic policy and an unsettled result projection |

## Call an explicitly supplied request

Declare both packages as direct workspace dependencies. Build a `PlanInput` through the [transport example](../pi-ai-transport/README.md#plan-a-reminder-without-sending), then call this helper with an explicitly owned credential and abort signal. The helper only sends when invoked; it reads no environment credential.

```ts
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport, type TransportOptions } from '@omne-harness-lite/pi-ai-transport'

export async function invokeOnce(
  request: PlanInput, transportOptions: TransportOptions, credential: string, signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const transport = createPiAiTransport(transportOptions)
  const fragmentLength = transportOptions.policy.credentialFragmentMinLength
  try {
    const handle = invokeModel({
      ...request, transport, credential, signal,
      ...(beforeFirstContent ? { beforeFirstContent } : {}),
      policy: {
        now: () => new Date().toISOString(),
        schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
        firstContentTimeoutMs: 60000, idleContentTimeoutMs: 60000,
        statusCauseTable: { '401': 'credential_unavailable', '429': 'upstream_unavailable', '503': 'upstream_unavailable' },
        redact: text => {
          let value = text.split(credential).join('█')
          for (let offset = 0; offset <= credential.length - fragmentLength; offset++)
            value = value.split(credential.slice(offset, offset + fragmentLength)).join('█')
          return value
        },
        diagnostic: event => { console.log(event.kind) },
      },
    })
    console.log(handle.snapshot().position)
    return await handle.outcome
  } finally { await transport.close() }
}
```

Supply transportOptions.definitions explicitly with verified complete definitions and an owned network policy. There are no default pilot models; officialModelIds lists targets only. Missing/incomplete definitions fail before resources are created. The transport README uses synthetic teaching data; never use it with live credentials.

The status table and redactor are examples of caller policy, not mandatory global defaults. A production caller supplies its complete approved policy. `maxOutputTokens`, provider, snapshot, binding and messages come from the request; the function does not look them up.

The invocation captures owned request values and policy members before asynchronous work. The caller still owns borrowed functions and resources. When using an acquired dynamic adaptation, pass `lease.transport`, track the outcome and any separate asynchronous gate/settlement with `lease.track(...)`, then release after they have actually stopped.

## Observe, gate and cancel

`handle.snapshot()` reads the accepted sequence without sending again. Optional `onAccepted(event, snapshot)` observes that same sequence. If `beforeFirstContent` is supplied, content stays private until it resolves successfully; rejection stops execution with a local failure and no private blocks. An absent gate provides no durable-persistence guarantee.

Call `handle.abort()` or abort the supplied signal to request cancellation, then await `handle.outcome` before releasing resources. Pre-send cancellation returns `{ cancelledBeforeSend: true }` with no request result. Sent calls settle to `complete`, `truncated`, `interrupted` or `failed`. Post-content failure retains the delivered portion. Raw usage, cache zero/unknown distinctions and precise reported cost are preserved; missing upstream identity is not filled from the requested route.

Planning rejection produces no model response. Unexpected implementation defects remain rejected promises. The result has no session/tenant/ResponseId, durable accounting or reply-persistence claim.

## Check a retry plan without sending

`dispatchGuard` is a synchronous pure function. The caller supplies legally obtained current call facts, the complete opening history across all attempts, the most recent failure, the original complete profile snapshot and a retry plan. `{ known: null }` means this call is known absent; `{ unknown: true }` means the fact cannot currently be established. A local stale phase must not be supplied as known current authority. Invalid data returns `invalidInput`; required facts that cannot decide the current guard return `unavailable`.

The function checks call existence, terminal or `reply_pending` phase, any prior opening, then phase, failure class and provider restrictions in that order. It uses the snapshot's original ordered providers and `allowFallback`. It copies strict JSON inputs without invoking getters, changes no input and retains no call state. There is no Cordis, storage, clock, scheduling or network operation in the guard.

This synthetic example runs without a service or credentials. Declare `content-blocks` as a direct dependency alongside this package for exact JSON numbers.

```ts
import { dispatchGuard, type DispatchGuardInput } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const input: DispatchGuardInput = {
  session: 'example-session',
  callId: 'example-call',
  call: { known: {
    session: 'example-session', callId: 'example-call', phase: { known: 'awaiting_decision' },
  } },
  dispatches: { known: {
    session: 'example-session', callId: 'example-call', opened: [{ known: false }],
  } },
  latestFailure: { known: 'upstream_unavailable' },
  snapshot: { known: {
    adaptation: {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: 'teaching/model', revision: 'one' },
      configuration: { revision: 'one', values: {} },
    },
    providers: ['first', 'second'], allowFallback: true,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: new LosslessNumber('9007199254740993'), maxOutputTokens: 10,
    updatedAt: '2026-09-27T00:00:00Z',
  } },
  plan: { provider: 'second', after: 'PT9007199254740993.0000000001S' },
}
const answer = dispatchGuard(input)
if (!('allowed' in answer)) throw new Error('Expected this example retry plan to be allowed')
```

`after` is the shared ISO duration string (`PT` hours/minutes/seconds), with no numeric ceiling or conversion to milliseconds. Omission means no wait; this function never waits. Answers are `{ allowed: true }`, `{ refused: { why } }` or `{ rejected }` (`wrongPhase` also carries `phase`). Refusal reasons are `already_spoke`, `fact_class` and `provider_not_allowed`. Rejections are `invalidInput`, `callNotFound`, `alreadyEnded`, `wrongPhase` and `unavailable`. Permission applies only to the supplied facts; a later actual operation rechecks state, host stopping and dependencies. The durable `canDispatchAgain`/`dispatchAgain` service is still pending.

## Development

```sh
pnpm --filter @omne-harness-lite/model-request-runtime... run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

The companion transport tests exercise this function against actual local HTTPS and the public core assembler. Complete service/durability and live model certification require their later acceptance stages.
