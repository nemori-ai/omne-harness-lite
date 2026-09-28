# @omne-harness-lite/model-request-runtime

[中文](README_ZH.md)

Invoke one explicit model transport and assemble its stream into a final result, with cancellation, content deadlines and an asynchronous first-content gate. This experimental ESM workspace package is not published on npm.

The current implementation contains standalone invocation, pure policy functions, bounded durable consumers, four session selection/query operations, and a pure no-Run call-history interpreter. `createModelRuntime` composes thirteen typed methods under one process-local call owner; production recovery-host and Run-backed paths remain pending. The `./plugin` entry exposes an application-retained assembly through Cordis. Reply disposition uses the original anchored invocation handle and recognizes a completed no-Run batch from an owned recovery scope after the local container is gone. No-Run reconciliation can settle a durable dispatched call without another model request using the stopped original invocation's facts or a host-confirmed cold-recovery absence. An interrupt intent with no dispatch is closed with its durable end record. Explicit call-host and bounded observer wiring is being integrated under [D103](../../../.meta_harness/design/record/decisions/model-runtime-host-observer-adoption/decision.md); the shared ports and queue alone do not prove a real session endpoint. See the [current service design](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v7-current-design.md), [D105 recovery mapping](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v12-recovery-timing-design.md), [recovery owner supplement](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v12-recovery-owner-supplement.md) and [realization status](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md); Run-backed success still needs a real Run-history interpreter.

## Public API

| Export                                                                           | Purpose                                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invokeModel(input)`                                                             | Return a handle containing `outcome`, `snapshot()`, `observedFacts()` and `abort()`                                                                        |
| `classifyCause(facts, hasContent, table)`                                        | Classify failure sources using an explicit status table without altering raw status                                                                       |
| `dispatchGuard(input)`                                                           | Synchronously check one retry plan against explicit call, dispatch and profile facts                                                                      |
| `DispatchGuardInput`, `DispatchGuardResult`, `DispatchGuardFact<T>`              | Readonly guard inputs, closed answers and explicit known/unknown facts                                                                                    |
| `retryDelay(input)`, `RetryBackoffPolicy`, `RetryDelayInput`, `RetryDelayResult` | Compute an exact TD3 Duration from explicit policy, retry ordinal, sample and decorrelated previous delay                                                 |
| `TransportAdapter`, `PlanInput`                                                  | Consumer-owned planning/send/read ports and explicit request context                                                                                      |
| `InvocationPolicy`, `ModelInvocationResult`                                      | Scheduling/redaction/diagnostic policy and an unsettled result projection with an actual string send time                                                  |
| `modelLogFormat`, `encodeModelLogKey`, `decodeModelLogKey`                       | Current `mrr/3` payload with closed business keys, reversible UTF16 encoding and exact dispatch normalization                                             |
| `captureModelLogValue`, `prepareModelLogEntry`, `inspectModelLogEntry`           | Strict owned values, position-free candidates and reverse validation of actual log entries                                                                |
| `inspectSettlementMembers`                                                       | Check complete response/message members and original associations from one complete prefix                                                                |
| `modelLogJsonEqual`, `recognizeMessageValue`                                     | Exact full JSON equality and recognition retaining the original captured message                                                                          |
| `createSessionModelSelection(input)`                                             | Borrowed-provider consumer with `legalTargets`, `selectModel`, `displayList`, `effectiveModel` and owned operation cleanup                                |
| `interpretCallHistory({ prefix, callId })`                                       | Interpret one no-Run call from a complete, owned SL3 prefix with the current `mrr/3` codec; incomplete or Run history remains unavailable                 |
| `projectCallState({ session, callId, history, local? })`                         | Overlay a process-owned `open` or `reply_pending` responsibility only while no durable response overrides it                                              |
| `ModelRuntimeService`, `RuntimeConstruction` and operation input/result types    | Explicit thirteen-operation service contract and required host ports; the type contract does not itself install a running service                         |
| `createCallContainerStore()`                                                     | Process-owned per-session/call resources and bounded, cancellable short reservations                                                                      |
| `ModelCallHost`, `ModelObserverRequest`, `SessionObserverAccess`                  | Explicit original-call lifetime and authorized, per-dispatch observer ports                                                                              |
| `createCallPreparationOwner(host)`                                              | Synchronously register one original call before asynchronous preparation and retain late resources until actual close                                    |
| `createModelObserverQueue(input)`                                               | Per-dispatch snapshot-first observer queue with exact serialized UTF-8 byte and event bounds; accepted delivery is not reader completion                 |
| `createRuntimeReads(construction)`                                               | Six selection and history methods plus `close()` for borrowed-provider ownership                                                                          |
| `createServiceCalls(construction)`, `createServiceControl(construction)`         | Independent call and control method composers for the shared runtime assembly                                                                             |
| `createServiceDispatch(construction)`                                            | Dispatch and dispatchAgain through the fixed profile and exact transport lease, current session facts, durable anchors and the original invocation handle |
| `createRuntimeSettleReply(input)`, `createRuntimeReconcile(input)`               | Original-handle reply disposition and no-Run recovery; reconcile returns `{ reconcile, close }` and retains original scopes until actual stop and full-prefix recognition |
| `createModelRuntime(construction)`                                               | Compose the thirteen methods under one call store and one retryable close owner; no Cordis context is required                                             |

`createRuntimeReconcile(input)` returns `{ reconcile, close }`. An unavailable reconciliation keeps its original recovery scope when facts or writes remain unresolved; a later reconciliation uses that same scope before attempting another recovery entry for the session. `close()` seals new reconciliation, stops owned tasks, reads the original complete prefix, and releases each scope only after the physical work is accounted for. It never appends a business record. If `close()` returns `unavailable`, retain this same component and retry after the original task or read source recovers. `createModelRuntime` includes this close in its own retryable close.

The optional `beforeSend` on a standalone invocation is the synchronous final admission before its one transport send. Only literal `true` proceeds; `false` cancels before send, and a thrown or malformed answer remains unavailable. The anchored service supplies its current stop/generation check there. `observedFacts()` reads the original invocation only after its reader and gates have actually stopped; an unavailable read must not be recast as absence. Its actual send time, partial account facts and headers are recovery sources, while durable dispatched/opened records remain the settlement authority.

The service forwards the existing `SettlementDiagnostic` through `RuntimeConstruction.policy.diagnostic` with its tenant, session, call, dispatch, response, owner, policy and contention counters intact. The observer delivery diagnostic still carries its typed scope, position and buffer counts in `detail`. Diagnostic callbacks are best-effort and cannot change settlement or observer delivery results; applications must keep sink failure state independently of business history. These ports do not provide durable trace storage or a query API. See RT9 S-63 for the engineering correlation and content boundary.

## Cordis service assembly under development

`@omne-harness-lite/model-request-runtime/plugin` exports `createModelRuntimePlugin` and the `modelRuntime` service key. The application supplies a complete `ModelRuntimeAssembly` through `construct`; this plugin does not fill missing operations. Cordis waits for the declared required providers before construction. The host retains `assembly.owner` before `construct` resolves. One cleanup effect closes admission to `openCall`, `dispatch`, and `dispatchAgain`, then calls that owner's `close()`. It calls `owner.release()` exactly once only after actual close reports `released`. If close is unavailable, the host keeps the same owner after the fiber unloads and must later complete stop/recovery and retry close; a diagnostic alone cannot release it. Existing references can still invoke allowed settlement and read operations during shutdown.

```ts
import type { Context } from '@deepseek-ai/cordis'
import {
  createModelRuntimePlugin,
  type ModelRuntimeAssembly,
  type ModelRuntimeAssemblyOwner,
} from '@omne-harness-lite/model-request-runtime/plugin'

const retained = new Set<ModelRuntimeAssemblyOwner>()
export function retainRuntime(
  service: ModelRuntimeAssembly['service'],
  close: ModelRuntimeAssemblyOwner['close'],
): ModelRuntimeAssembly {
  const owner: ModelRuntimeAssemblyOwner = {
    close,
    release() {
      if (!retained.delete(owner)) throw new Error('runtime owner was not retained')
    },
  }
  retained.add(owner)
  return { service, owner }
}

export async function installRuntime(
  ctx: Context,
  construct: () => Promise<ModelRuntimeAssembly>, // must retain before resolving
) {
  return ctx.plugin(createModelRuntimePlugin({ construct }), {})
}
```

The internal `createCallContainerStore().waitReserve(...)` takes an explicit positive waiter limit and timeout plus an owned scheduler and abort signal. The explicit `OpenCallInput.host` is a lifecycle owner, not session identity: session, tenant and log generation still come from the authorized session binding. Its `register(close)` must synchronously reject registration after stopping; the preparation owner registers before any asynchronous preparation, keeps the same close responsibility after call publication, and unregisters only after actual release. Once a call container is inserted, the active reservation attaches the original anchored invocation handle. Releasing the reservation leaves that handle, pending reply, observer binding, unknown writers and exact transport lease with the container. A system stop first asks the original call's durable S-36 closure to settle; `container.close()` releases the lease only after that result, the original handle and observer tasks report actual release, and the remaining owner checks pass. The reservation does not create durable authorization. An unavailable anchored close retains its coordinator and borrowed references. Once the original work has actually stopped and settlement facts become available, call `close()` again; concurrent closes share one attempt, and a released close is idempotent.

An optional `OpenCallInput.observer` supplies an actual endpoint plus explicit positive event and byte bounds. The authorized session binding must supply `observers.authorize` for that endpoint and call; each dispatch rechecks its concrete target before opening a receiver and before handing it text. The independently usable queue accepts original `ArrivalEvent` values and the original assembly snapshot. `start(snapshot)` makes that visible snapshot first, drops pre-start increments at or before its position, and then drains newer accepted increments in order. Both limits include the current receive task until its `stopped` promise resolves. A failed or slow observer never changes the model response or causes another send; `close()` retains the receiver owner while actual stop is unknown. The host must retain an unavailable owner and retry after real stop. See [D103's scope and receiver mapping](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v11-host-observer-design.md).

```ts
import { createModelObserverQueue, type ModelObserverQueueInput } from '@omne-harness-lite/model-request-runtime'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'

export async function beginObservedDispatch(input: ModelObserverQueueInput, visible: AssemblySnapshot) {
  const queue = createModelObserverQueue(input)
  const first = queue.start(visible)
  // Retain queue even when the snapshot was refused: close may remain unavailable until actual stop.
  return { first, queue }
}
```

For direct use, supply one fully bound `RuntimeConstruction` and give its call store to exactly one runtime. The host retains the returned owner while it holds provider resources. `close()` synchronously stops new service admission, asks every call and component to stop, waits for registered operations, and returns `released` only after their actual cleanup. If it returns `unavailable`, keep the same owner and retry after the blocking fact changes. The call store does not erase durable history.

```ts
import { createModelRuntime } from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'

export async function inspectWithRuntime(
  construction: Parameters<typeof createModelRuntime>[0],
  session: SessionRef,
  retain: (owner: ReturnType<typeof createModelRuntime>) => void,
) {
  const runtime = createModelRuntime(construction)
  try {
    return await runtime.service.effectiveModel({ session })
  } finally {
    const stopped = await runtime.close()
    if ('unavailable' in stopped) retain(runtime)
  }
}
```

The service host supplies distinct `call()`, `response()` and `message()` identity sources. The reply's `MessageId` comes from `message()` for that send; it is neither copied from the `ResponseId` nor chosen by the adapter.

Each new plan requires a complete `tokenMargin: { multiplier, reserveTokens }` supplied by the host or direct caller. The runtime captures it for that plan and never supplies a default. Missing applicable profile caps or upstream input-limit facts reject as `input_limit_missing` before a new anchor or HTTP request. An estimated token limit rejection retains `basis: 'estimated'`, `estimatedTokens`, `admissionTokens` and `limit`; an exact excess retains `basis: 'exact'`, `actual` and `limit`. Neither estimate is upstream usage or cost. See the adopted [RT8 input limit contract](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v8/contract.md#s-74-每次发送之前的完整输入限制与固定计划) and [runtime v9 mapping](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v9-token-estimate-design.md).

The read composer owns its borrowed selection providers until its `close()` actually releases them. Pass an explicit `RuntimeConstruction` from the host; it supplies authorized same-session bindings and the required policies.
An unknown selection-write receipt remains an unknown business outcome. Once that original writer and callback have actually stopped, the component can release its physical registration; it does not replay the write or infer success from the current route. Concurrent closes share the active attempt, and only `released` is cached.

```ts
import { createRuntimeReads } from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'

export async function inspectEffectiveModel(
  construction: Parameters<typeof createRuntimeReads>[0],
  session: SessionRef,
) {
  const reads = createRuntimeReads(construction)
  const result = await reads.methods.effectiveModel({ session })
  const closed = await reads.close()
  // Keep reads and its borrowed providers if closed is unavailable; retry after actual stop.
  return { result, closed, reads }
}
```

## Read a call without promoting local state to durable fact

Obtain `prefix` with `readSettlementPrefix` from an authenticated session-log binding and a registered read task. That function rejects gaps, wrong tenant, foreign session and provider generation changes. The interpreter only reads that full prefix; it never sends, writes or infers a Run ending. For a no-Run call with a complete response batch, its durable terminal phase wins over an old local `reply_pending` responsibility. The caller must still handle any unresolved old writer before deciding that a missing record permits a new send.

```ts
import {
  interpretCallHistory,
  projectCallState,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'

export function readNoRunCall(prefix: SettlementPrefix, session: SessionRef, callId: string) {
  const history = interpretCallHistory({ prefix, callId })
  return projectCallState({ session, callId, history })
}
```

The returned `CallHistoryDispatch` keeps original dispatched log entries, their opened anchor, the validated complete original response value, and its projection. A returned `in_flight` or `speaking` describes the durable frontier, not proof that the old physical request or writer has stopped. An intent without a dispatch remains visible in history with `phase: null` for reconciliation; the state projection returns `unavailable` until its outcome is known. Unknown model-log formats also return `unavailable`, never absence. With-Run history reports `run_history_unavailable` pending the accepted original Run/attempt recognizer.

## Call an explicitly supplied request

Supply a complete `PlanInput`, an explicitly owned typed adapter, credential and abort signal. This example uses only the runtime public package and real stream assembler; declare it as a direct dependency. Configure the adapter with the same complete credential policy. The caller owns its resources and releases them after the outcome and any separate gate work have actually stopped. No environment credential is read.

```ts
import {
  invokeModel,
  openRouterCredentialRedactionConfig,
  type PlanInput,
  type PlannedSemantics,
  type TransportAdapter,
  type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'

export const callerPolicy: InvocationPolicy = {
  now: () => new Date().toISOString(),
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
  firstContentTimeoutMs: 60000,
  idleContentTimeoutMs: 60000,
  statusCauseTable: {
    '401': 'credential_unavailable',
    '429': 'upstream_unavailable',
    '503': 'upstream_unavailable',
  },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: event => {
    console.log(event.kind)
  },
}

export async function invokeOnce<P extends PlannedSemantics, R>(
  request: PlanInput,
  transport: TransportAdapter<P, R>,
  credential: string,
  signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const handle = invokeModel({
    ...request,
    transport,
    credential,
    signal,
    policy: callerPolicy,
    ...(beforeFirstContent ? { beforeFirstContent } : {}),
  })
  return await handle.outcome
}
```

For the actual OpenRouter adapter, supply verified complete definitions and an owned network policy through the [transport package](../pi-ai-transport/README.md). There are no default pilot models; officialModelIds lists targets only. Synthetic teaching data must never be used with live credentials.

The timeouts and status table above are example caller choices. `credentialRedaction` is a required complete explicit configuration, validated and bound before planning or sending; missing/invalid configuration returns `invalidInput` without sending. The old arbitrary `redact` callback is removed without fallback. `maxOutputTokens`, provider, snapshot, binding and messages come from the supplied request.

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
  call: {
    known: {
      session: 'example-session',
      callId: 'example-call',
      phase: { known: 'awaiting_decision' },
    },
  },
  dispatches: {
    known: {
      session: 'example-session',
      callId: 'example-call',
      opened: [{ known: false }],
    },
  },
  latestFailure: { known: 'upstream_unavailable' },
  snapshot: {
    known: {
      adaptation: {
        implementation: { name: 'teaching', revision: 'one' },
        definition: { modelId: 'teaching/model', revision: 'one' },
        configuration: { revision: 'one', values: {} },
      },
      providers: ['first', 'second'],
      allowFallback: true,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: new LosslessNumber('9007199254740993'),
      maxOutputTokens: 10,
      updatedAt: '2026-09-27T00:00:00Z',
    },
  },
  plan: { provider: 'second', after: 'PT9007199254740993.0000000001S' },
}
const answer = dispatchGuard(input)
if (!('allowed' in answer)) throw new Error('Expected this example retry plan to be allowed')
```

`after` is the shared ISO duration string (`PT` hours/minutes/seconds), with no numeric ceiling or conversion to milliseconds. Omission means no wait; this function never waits. Answers are `{ allowed: true }`, `{ refused: { why } }` or `{ rejected }` (`wrongPhase` also carries `phase`). Refusal reasons are `already_spoke`, `fact_class` and `provider_not_allowed`. Rejections are `invalidInput`, `callNotFound`, `alreadyEnded`, `wrongPhase` and `unavailable`. Permission applies only to the supplied facts; a later actual operation rechecks state, host stopping and dependencies. The durable `canDispatchAgain`/`dispatchAgain` service is still pending.

## Calculate an exact retry delay

`retryDelay` is a synchronous pure function implementing [RT4 S-60](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v4/contract.md#s-60-纯判定与可单取用构件), adopted by D086 with the D076 R3-P7 projection retained by D087. It returns `{ ok: duration }` or `{ invalidInput: { reason: 'malformed' } }`. It requires all five policy members and a positive integer `n` and exact `uniformSample` in `[0, 1)`, including when jitter is `none`. The decorrelated branch also requires `previousDelay`; on the first retry it must equal `base` by duration value. No defaults or random source are supplied.

```ts
import { retryDelay } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const delay = retryDelay({
  policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT25S', jitter: 'half' },
  n: 3,
  uniformSample: new LosslessNumber('0.999'),
})
if ('invalidInput' in delay) throw new Error(delay.invalidInput.reason)
if (delay.ok !== 'PT24.9875S') throw new Error('unexpected exact delay')

const next = retryDelay({
  policy: { kind: 'constant', base: 'PT1M', factor: 1.5, max: 'PT2M', jitter: 'decorrelated' },
  n: 1,
  uniformSample: 0.25,
  previousDelay: 'PT60S',
})
if ('invalidInput' in next) throw new Error(next.invalidInput.reason)
if (next.ok !== 'PT67.5S') throw new Error('unexpected decorrelated delay')
console.log(delay.ok, next.ok)
```

Declare content-blocks as a direct dependency when constructing `LosslessNumber` values. Durations accept TD3 H/M/S strings, including fractional seconds and equivalent spellings; output uses exact seconds. Coefficients use the public `JsonNumber` representation so a caller can preserve decimal literals and retry ordinals beyond 2^53. Ordinary JavaScript numbers retain the decimal value already present at the call boundary; precision lost before the call cannot be restored.

The function copies and validates JSON data without reading getters, leaves caller data unchanged, and calculates without rounding to milliseconds. This arithmetic result supplies neither retry permission nor waiting, sending, fallback or a default retry contribution. Actual timer precision and large-duration scheduling remain subject to R3-G7; P-5/runner integration and the 37-model certification are pending.

## Decide a bounded default retry

`decideRetry` consumes the complete LC6 failure subject, including its per-call `retryConclusions`, and explicit backoff inputs. It returns the LC6 `retry` or `observed` result, or a rejection. It performs no waiting or sending; an actual retry still needs `dispatchGuard` and the durable call service. The policy values below are caller choices, not runtime defaults.

```ts
import { decideRetry } from '@omne-harness-lite/model-request-runtime'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'

export function chooseRetry(subject: AfterModelCallFailureSubject) {
  return decideRetry({
    subject: { known: subject },
    policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT10S', jitter: 'none' },
    uniformSample: 0,
  })
}
```

The no-fallback branch counts the default extension's recorded conclusions, so a same-provider continuation does not spend its one default retry. If the complete conclusion history cannot be established, the consumer must return `unavailable` rather than invent one. Complete P-5 integration remains pending.

## Capture, prepare and recognize log values

These pure functions implement the [D088 adopted format](../../../.meta_harness/design/record/decisions/model-runtime-log-codec-adoption/decision.md). Static root imports and calls do not open a log, install Cordis, read environment credentials, obtain a clock or generate identities. `SessionLog` types are borrowed from that package's public root. Every session, tenant, run/attempt pair, purpose and message prefix is explicit. A supplied message prefix must be the complete legal prefix before that message; `null` means unavailable and is rejected for a log message.

Text reception and value reception are different modes. Nested duplicate object members, getters, `toJSON`, unsupported objects and fake number brands are rejected. The returned capture retains the original immutable JSON and number spellings. The response judge checks the capture; it does not manufacture an owned `ModelResponse` from `{ ok: true }`.

```ts
import { captureModelLogValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const captured = captureModelLogValue({
  category: 'record',
  input: {
    kind: 'text',
    text: '{"kind":"model_call_opened","call":"example-call","dispatch":1.0,"firstTokenAt":"2026-09-27T00:00:01Z"}',
  },
})
if (!('ok' in captured)) throw new Error(captured.reason)
if (!writeJsonLossless(captured.ok.value).includes('"dispatch":1.0'))
  throw new Error('Original numeric spelling must survive capture')
```

Prepare a candidate with no durable position. Append ownership, authorization, fence and condition belong to its actual writer. Selection records have no dedupe key. Every other dedupe key also appears explicitly in `readKeys`; reads validate the complete key set without requiring its array order. Persisted assistant messages use `{ kind: 'persistedMessage', response: capturedResponse }` and the response's complete reply. Independent assistant writes and SystemMessage log writes are rejected.

```ts
import {
  captureModelLogValue,
  prepareModelLogEntry,
  encodeModelLogKey,
} from '@omne-harness-lite/model-request-runtime'
import { parseTenantId } from '@omne-harness-lite/identity-values'

const tenant = parseTenantId({ organization: 'example-organization', account: 'example-account' })
const message = captureModelLogValue({
  category: 'message',
  input: {
    kind: 'value',
    value: {
      id: 'example-message',
      type: 'user',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [],
    },
  },
})
if (!('ok' in tenant) || !('ok' in message)) throw new Error('Invalid example value')
const prepared = prepareModelLogEntry({
  session: 'example-session',
  shell: { tenant: tenant.ok },
  captured: message.ok,
  purpose: { kind: 'message' },
  messagePrefix: [],
})
if (!('ok' in prepared)) throw new Error(prepared.reason)
const key = encodeModelLogKey({ kind: 'message', message: 'example-message' })
if (!('ok' in key) || prepared.ok.dedupeKey !== key.ok || !prepared.ok.readKeys.includes(key.ok))
  throw new Error('D and R must explicitly share the MessageId key')
if ('position' in prepared.ok) throw new Error('A candidate has no durable position')
```

Full-value recognition compares numeric mathematical values, unordered object members, ordered arrays and exact strings. Absence differs from `null`. It returns the original capture rather than rewriting its number spelling. An id-only or same-source check cannot substitute for full equality.

```ts
import { recognizeMessageValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const original =
  '{"id":"example-reminder","type":"system_reminder","nature":"event","source":{"kind":"extension","extension":"teaching","payload":{"amount":1.00}},"blocks":[],"createdAt":"2026-09-27T00:00:00Z"}'
const candidate = original.replace('1.00', '1e0')
const recognized = recognizeMessageValue({
  candidate: { kind: 'text', text: candidate },
  original: { kind: 'text', text: original },
})
if (!('same' in recognized)) throw new Error('Expected the same mathematical JSON value')
if (!writeJsonLossless(recognized.original.value).includes('1.00'))
  throw new Error('Recognition must retain the original value')
```

`inspectModelLogEntry` accepts an actual `LogEntry`, the expected session/tenant, explicit purpose and the message prefix before its position. It checks the closed wrapper `{ format, category, value }`, the shell, position and reconstructed D/R. `inspectSettlementMembers` accepts `{ mode: 'read', session, tenant, prefix: { entries, tail }, target: { call, dispatch, response }, anchors: { dispatched, opened, intent }, current }`. `current` is either `null` or the previously designated `{ messageId, disposition }`; the absent members of that pair use `null`. Write mode additionally requires the complete `candidates` array of position-free `OwnedLogEntry` values.

Read mode recognizes an existing batch using its own MessageId, ResponseId, binding, parameters, amounts and full reply before checking a losing candidate's occupancy. A different losing MessageId, even one occupied by another message, cannot invalidate a lawful original batch. Only when no original batch exists does candidate occupancy prevent `absent`. `completeMembers` contains the original captures and entries, plus `disposition: 'same' | 'firstWinner' | 'unrequested'`; a different lawful disposition retains the winner. Pure results do not map these answers to a service operation's success or `alreadyEnded`.

Member checking does **not** prove one physical append, lawful history, read permission, Run lifecycle, or actual old-task stop. H1 once `[M,R]` and H2 separately `[M]`/`[R]` can expose identical SL3 read results. G29-P/H remain host/all-writer responsibilities. WithRun late recognition currently returns `undetermined: true, reason: 'run_history_unavailable'` pending the original G28 production interpreter; it does not treat unknown history as false or use the accounting attempt as the original attempt. The thirteen-operation service, actual runner/app adoption, G30/G31 and production model certification remain pending.

The member checker consumes the [D089 adopted](../../../.meta_harness/design/record/decisions/model-time-order-projection-adoption/decision.md) `offer-expiry` root comparator on the captured original timing strings. It checks `sentAt <= firstTokenAt <= endedAt`, or `sentAt <= endedAt` when no first token exists, when the actual `sentAt` is known. Under [D105](../../../.meta_harness/design/record/decisions/model-recovery-timing-provider-adoption/decision.md), only an anchored `interrupted` response may carry `sentAt: null`; the first-token/ended comparison and opened-record equality still apply. Null means the actual send time is unavailable, not proof of zero send or zero cost. Ordinary invocation results and pending replies still require an actual string time. Static invalid dates and reversed known times cannot return complete members. Arbitrary fractional digits and offset-equivalent instants keep their precision; the original opened string must still match exactly.

```ts
import { captureModelLogValue, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'

const sent = '2026-09-27T00:00:00.0004Z'
const first = '2026-09-27T00:00:00.0003Z'
const order = compareRfc3339Instants(sent, first)
if (!('ok' in order) || order.ok !== 1)
  throw new Error('Sub-millisecond reverse order must remain visible')
const alias = '2026-09-27T01:00:00.0003+01:00'
const sameInstant = compareRfc3339Instants(first, alias)
if (!('ok' in sameInstant) || sameInstant.ok !== 0)
  throw new Error('Expected offset-equivalent instants')
if (modelLogJsonEqual(first, alias)) throw new Error('Original strings remain different')
const opened = captureModelLogValue({
  category: 'record',
  input: {
    kind: 'value',
    value: {
      kind: 'model_call_opened',
      call: 'example-call',
      dispatch: 1,
      firstTokenAt: first,
    },
  },
})
if (
  !('ok' in opened) ||
  opened.ok.record?.kind !== 'model_call_opened' ||
  opened.ok.record.firstTokenAt !== first
)
  throw new Error('Capture must retain the original opened string')
```

The comparator and `completeMembers` operate within the declared legal RFC3339 input domain. They do not certify actual time sources, leap announcements, legal history or physical commits. The producer/host/history owner must establish TL-G1 at the real production boundary; unconfirmed external values or history remain unavailable there. The old millisecond Instant/Clock interfaces keep their original behavior.

## Explicit shared credential redaction

`createCredentialRedactionPolicy(config)` constructs the pure policy adopted by [D093](../../../.meta_harness/design/record/decisions/model-credential-policy-adoption/decision.md). All three named parameters are required. `openRouterCredentialRedactionConfig` is the deeply immutable, explicit `openrouter-redaction/1` baseline: minimum fragment length 8, the 11 adopted denylist headers and the three finite sk-/Bearer/Basic descriptors. The algorithm has no implicit configuration, environment, network, storage or Cordis dependency.

`policy.bind(knownCredential)` returns `{ ok: bound }` or `{ rejected: 'invalidInput' }`. The frozen bound closure only exposes `text(value)`, `headers(value)` and `json(value)`, each returning the same explicit result shell. Known credentials must be nonempty printable ASCII. Full credentials shorter than the fragment minimum remain protected. All matches use the original input and their interval union becomes `█`; scanning does not normalize, decode unknown encodings or evaluate open regular expressions. Headers first remove original denylist keys with ASCII case folding, then redact keys and values; string versus ordered string-array shape, duplicates and empty values survive. JSON processes keys and all scalar tokens, including exact numbers, booleans and null. A matching nonstring scalar becomes a marker string; unhit types and exact numeric spelling remain. Outputs are independent and frozen, and processing the safe value again gives the same value. Exact-number admission captures the trusted public LosslessNumber source getter at module initialization, reads the branded source explicitly, and immediately clones a standard owned number; token matching uses jsonNumberSource on that clone. Caller prototype Get traps cannot substitute that numeric token.

`redact(value, knownCredential, params)` is the standalone RT5 S60 JSON/string function and uses this same kernel. For actual response headers use `bound.headers`, which also strips denylist entries. Declare this package and `content-blocks` as direct dependencies for the exact-number example; it uses synthetic data and makes no request.

```ts
import {
  createCredentialRedactionPolicy,
  openRouterCredentialRedactionConfig,
  redact,
} from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const policy = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig)
const binding = policy.bind('teaching-secret')
if (!('ok' in binding)) throw new Error(binding.rejected)
const text = binding.ok.text('teaching-secret / Bearer example-token')
if (!('ok' in text) || text.ok !== '█ / █') throw new Error('Unexpected safe text')
const headers = binding.ok.headers({
  Authorization: 'discard',
  X: ['', 'teaching-secret', 'again', 'again'],
  Empty: [],
})
if (!('ok' in headers) || 'Authorization' in headers.ok || headers.ok.X?.length !== 4)
  throw new Error('Expected safe headers with their original array shape')
const rawError = redact(
  [true, null, new LosslessNumber('9007199254740993')],
  'true',
  openRouterCredentialRedactionConfig,
)
if (!('ok' in rawError) || writeJsonLossless(rawError.ok) !== '["█",null,9007199254740993]')
  throw new Error('Expected redacted boolean and unchanged exact number')
```

Illegal static configuration throws `CredentialRedactionConfigurationError` with fixed text and no input/cause. Illegal credential or data admission returns `invalidInput`; getters and `toJSON` are not called. Unexpected internal processing defects throw a fixed, input-free ordinary Error instead of being reported as invalid input or returning original data. Such an exception is a defect, not a successful redaction or a new domain failure.

Generic construction accepts minimum lengths 1–64, at most 128 lowercase ASCII HTTP-token header names and at most 64 finite descriptors; explicitly empty lists are permitted in the generic function. This does not approve a production configuration. The adopted baseline must retain every one of its 11 headers and three descriptors; production strengthening may add entries or lower the minimum to 1–8, with its own resource and false-positive verification. Values above 8 require a separately accepted production revision. The future assembly owner must verify that eligibility and supply one complete snapshot to both consumers.

This surface processes raw/error JSON. Required business status, identity and cost facts must follow their own contracts; do not pass a complete ModelResponse through this general mapper. Raw body byte/attachment projection, transport/runtime policy migration, actual send/read/header publication and full S20 acceptance remain outside this increment. Existing invoke/transport callbacks retain their prior behavior until their explicit migration is delivered.

For credential length k, input length n, minimum m and descriptor count d, the kernel builds at most k fixed-width windows and four linear endpoint arrays, then compares at most d literals of length at most 64 per position. Work is bounded by O(km + n(m + 64d) + output), with exact Set string equality rather than hash equality as authority; endpoint working memory is O(n), plus window/configuration and output data. JSON admission and projection use iterative traversal. Key-collision suffix work includes the size of the required output names. Finite adversarial measurements do not prove unlimited input or same-process sandboxing, and closures do not promise physical memory erasure.

## Choose from explicit directory facts

`legalTargets(rows, allowed, projection, compatible)`, `displayList(rows, allowed, projection, compatible, selected, credentials)` and `effectiveModel(selected, lock, rows, allowed)` are synchronous pure functions. They implement [RT5 S-10–S-12/S-60](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md#s-60-纯判定与可单取用构件), reusing the directory's public winner rule. They have no session, authority, storage, Cordis or IO port. Currentness, completeness, lawful acquisition and the evaluated above-session lock are the caller's responsibility; these functions do not establish those facts.

Set inputs use readonly arrays with no duplicates. Each input is explicitly `{ known: value }` or `{ unknown: true }`; known empty projection is valid. A known `null` selection means there is no durable initial selection and returns `unavailable`. A known `null` lock means evaluation confirmed no above-session lock, including a missing optional model setting. Unknown lock never means no lock. Rows must be complete profile3 values with matching refs, no duplicate scope/name and one organization/tenant chain across all route names. `compatible` must be pure and implement projection ⊆ full-profile input modalities; the returned `ok` or nonempty `blocked` set is checked against that relation. This caller dependency does not claim to implement or connect the modality-projection provider.

The following teaching data exercises all three functions without a credential or service. Declare the runtime and model-profile-directory packages as direct dependencies for these public imports. The example is not a live official model definition.

All profile numbers, including nested adaptation configuration and parameter extras, are copied before any profile or winner decision. Finite JavaScript numbers and standard `LosslessNumber` tokens retain their exact boundary value and spelling. Ordinary subclasses inheriting the trusted public source getter are supported; a foreign source accessor or data override returns `invalidInput` without invoking it. Numeric capture directly calls the trusted getter on the branded receiver and creates an owned standard number, so a caller's prototype Proxy `get` cannot substitute a value. Input getters and `toJSON` are never called. Unexpected capture defects throw the fixed ordinary error `model selection JSON capture failed` without retaining the original error or cause.

```ts
import {
  legalTargets,
  displayList,
  effectiveModel,
  type SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'

const rows: readonly ProfileRow[] = [
  {
    ref: { origin: 'official', routeName: 'teaching/model' },
    profile: {
      routeName: 'teaching/model',
      origin: 'official',
      registration: 'listed',
      adaptation: {
        implementation: { name: 'teaching', revision: 'one' },
        definition: { modelId: 'teaching/model', revision: 'one' },
        configuration: { revision: 'one', values: {} },
      },
      providers: ['teaching-provider'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 10,
      inputConstraints: {},
      updatedAt: '2026-09-27T00:00:00Z',
    },
  },
]
const compatible: SelectionCompatibility = (profile, projection) => {
  const blocked = projection.filter(modality => !profile.inputModalities.includes(modality))
  return blocked.length === 0 ? { ok: true } : { blocked }
}
const allowed = { known: ['teaching/model'] }
const projection = { known: [] }
const selected = { known: 'teaching/model' }
const legal = legalTargets({ known: rows }, allowed, projection, compatible)
if (!('ok' in legal) || legal.ok[0] !== 'teaching/model') throw new Error('Expected a legal target')
const list = displayList({ known: rows }, allowed, projection, compatible, selected, {
  known: [{ ref: { origin: 'official', routeName: 'teaching/model' }, present: { known: false } }],
})
if (
  !('ok' in list) ||
  !list.ok[0]?.selected ||
  !list.ok[0].annotations.includes('credential_missing')
)
  throw new Error('Expected missing-credential annotation')
const effective = effectiveModel(selected, { known: 'teaching/model' }, { known: rows }, allowed)
if (!('ok' in effective) || effective.ok.selectedBy !== 'layer_lock')
  throw new Error('An equal-name lock keeps its source')
console.log(legal.ok[0], list.ok[0].annotations, effective.ok.selectedBy)
```

Legal targets do not filter credentials or deployment transport capabilities. A withdrawn tenant row lets a listed general row win; missing credentials or incompatible modalities do not cause fallback from the winner. Without a winner, landing prefers the most-specific listed row before any withdrawn row. Display includes legal names plus the selected name, with immutable refs and annotations; covered rows are annotations, not choices. No winner means exactly `withdrawn` or `scope_disallowed`, without evaluating its credentials or compatibility.

Success is `{ ok: value }`. Malformed or missing required data returns `{ invalidInput: { reason } }`; explicit unknown required facts and an unexpectedly throwing compatibility callback return `{ unavailable: true }` without its original error. No partial result is returned. A selected/effective name with no row returns `{ profileNotFound: true }`. Credential facts are keyed by full winning ref and origin: absent required fact is malformed, explicitly unknown presence is unavailable. Outputs are owned and deeply immutable; borrowed callbacks remain caller-owned. The durable thirteen-operation service, actual current-evaluation reader and persistent projection cache remain pending.

## Development

```sh
pnpm --filter @omne-harness-lite/model-request-runtime... run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

The companion transport tests exercise this function against actual local HTTPS and the public core assembler. Complete service/durability and live model certification require their later acceptance stages.

## Current model log codec

The package root exports one current codec for MS6 records and messages and MR7 responses. Its payload and business-key format is `mrr/3`. It preserves ordered string-array `raw.headers`, exact numbers, and the difference between absent and empty values. Previous `mrr/1` and `mrr/2` records are rejected as unknown format; there is no versioned runtime codec export or compatibility reader.

The following standalone example prepares a complete persisted `[M,R]` batch or one nonpersisted response. Supply the complete actual response and legal message prefix; the example performs no IO and grants no log permission. Declare the imported packages as direct dependencies.

```ts
import {
  captureModelLogValue,
  prepareModelLogEntry,
  inspectSettlementMembers,
  type InspectSettlementMembersInput,
} from '@omne-harness-lite/model-request-runtime'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { LogPrefixView } from '@omne-harness-lite/messages'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'

export function prepareReplyBatch(
  session: string,
  tenant: TenantId,
  responseValue: unknown,
  messagePrefix: LogPrefixView,
): readonly OwnedLogEntry[] {
  const response = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: responseValue },
  })
  if (!('ok' in response)) throw new Error(response.reason)
  const r = prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: response.ok,
    purpose: { kind: 'response' },
    messagePrefix,
  })
  if (!('ok' in r)) throw new Error(r.reason)
  if (response.ok.response?.replyDisposition !== 'persisted') return [r.ok]
  const message = captureModelLogValue({
    category: 'message',
    input: { kind: 'value', value: response.ok.response.reply },
  })
  if (!('ok' in message)) throw new Error(message.reason)
  const m = prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: message.ok,
    purpose: { kind: 'persistedMessage', response: response.ok },
    messagePrefix,
  })
  if (!('ok' in m)) throw new Error(m.reason)
  return [m.ok, r.ok]
}

export function inspectReplyBatch(input: InspectSettlementMembersInput) {
  return inspectSettlementMembers(input)
}
```

Append the **entire returned array once** through the actual SL3 provider. The current inspector retains original payload value and position but does not certify a physical batch, lawful read, or the cessation of old writers. Captures from this codec are only valid for this codec's write boundary; a recognized historical value must be explicitly recaptured before making a new candidate. The current representation is specified by [RT7](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v7/contract.md) and its [v8 codec projection](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v8-current-codec-design.md).

## Single response-header handoff

`SendResult` may carry `rawHeaders` on its response, failed or aborted branch, and never on rejected. `TransportFailure.headers` and a second header field on `StreamEnd` are absent. The sender must already process and own an immutable MR7 header map under the same explicit policy. Invoke immediately retains that exact value, including ordered array duplicates, empty values, absent versus empty map, across all four outcomes and content-gate cancellation; it does not re-run header redaction. Invalid or mutable header representation fails the entire port and requests actual reader stop; independently known HTTP failure facts survive.

Upstream error/local text pass through the bound shared JSON/text policy. Raw/error keys and all scalar tokens are processed, while independent protocol status and actual usage/cost remain intact even if their literal value equals the credential. Processing rejection/defect omits unsafe payload and emits fixed stage diagnostics; an already retained H survives. A pre-send bind defect rejects the outcome with a controlled stage error and no fabricated sent result. Diagnostic-sink failure does not alter business behavior.

Business reply/tool fragments retain their original assembler semantics. This implementation does not close the outstanding content-echo policy, raw-body attachments, full S20, production TLS composition or durable service. Exact scope is adopted by [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md).

## Durable settlement components

`readSettlementPrefix`, `interpretSettlementPrefix`, and `createSettlementCoordinator` are standalone components. They use the actual SL3 log and the root `mrr/3` representation. The first delivered path is noRun: one unfenced, unconditional append contains either the entire `[message, response]` or `[response]` batch. Existing legal batches win with their original identities, format and accounting. The coordinator never plans or sends a model request.

Supply the host's actual session/tenant/log-generation binding and registered owner. `SettlementRegistration.start` must register before invoking the operation; `stopped` means actual resource cessation. The owner enforces shared concurrency admission and supplies the actual opened receipt plus all unresolved old writers. These structural ports grant no authorization or historical batch certification. Required named contention limits and the exact monotonic scheduler are explicit; no default attempts, timer or waiting policy is installed.

```typescript
import {
  createSettlementCoordinator,
  type SettlementCoordinatorInput,
  type SettlementRequest,
} from '@omne-harness-lite/model-request-runtime'

export async function settleResponse(
  dependencies: SettlementCoordinatorInput,
  request: SettlementRequest,
) {
  const coordinator = createSettlementCoordinator(dependencies)
  try {
    const task = coordinator.settle(request)
    const result = await task.completion
    await task.stopped
    return result
  } finally {
    await coordinator.close()
  }
}
```

`completion` reports settlement or an unavailable reason. `requestStop` requests cancellation; `stopped` and `close()` wait for actual owned tasks and permit release. A committed batch can be recognized while an old task is still live; that task keeps its original owner. An absent read never permits resubmission after an unknown receipt. Opened unknown blocks ordinary responses. Recovered absence must be established by the original host at the existing S-33 recovery boundary, after all old writers stop; this component adds no online recovery API.

The example takes actual host dependencies and a complete MR7 response, without installing a service. Full thirteen-operation composition, official model certification, production withRun interpretation (G28), lawful read wiring and all-writer provenance remain pending. Adoption: [D087/v4 projection](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v4-design.md), [v8 current codec](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v8-current-codec-design.md).

## Durable noRun invocation

`createAnchoredModelInvocation` composes the standalone `invokeModel` with a real
SessionLog binding and the shared settlement coordinator. Its current delivery
supports a single noRun dispatch with an explicit list of resolved model tools. The host supplies fixed
call/response/message identities, the complete profile binding and selection
source, the actual credential scope/value, policy, transport, owner and log
generation. The function validates these values; their shape does not establish
authorization or credential provenance. It borrows the exact transport for this
call; this delivery does not implement transport hot replacement.

The original transport plans once. The confirmed dispatched record precedes
HTTP, and the confirmed opened record precedes visible content. The complete MR7
response uses that original opened timestamp, actual usage/cost/upstream facts
and the same invocation's safe headers. Complete and truncated replies remain
caller-owned full `PendingModelResponse` facts without disposition or lateness. The lower-level `settleReply('persisted')` uses
the shared coordinator for one `[AssistantMessage, ModelResponse]` append;
explicit vetoed/consumed dispositions use one response append. Determinate
failure and system interruption settle a response before outcome resolves;
system interruption retains any delivered content without creating a reply.

`abort()` requests system stop. User interruption needs the separate durable
intent protocol and is outside this slice. `close()` closes admission, requests
stop and waits for actual invocation, gate, append and settlement tasks to stop.
Only confirmed settlement (or no dispatch) permits `releaseBorrowed`. Unknown
anchors or settlement return unavailable and retain the handle, candidate and
borrowed references for the actual host's recovery responsibility. This function
does not perform S-33 recovery, resend, or turn unknown acknowledgement into
confirmed absence.

After actual host preparation, pass its input and an explicit reply disposition to the example below. Retain the returned call and its host owner while close is unavailable. The complete thirteen-operation service, Run integration and production-model certification remain pending.

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'

/** Supply actual host preparation and an explicit caller disposition. */
export async function runPreparedInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  disposition: ReplyDisposition,
) {
  const call = createAnchoredModelInvocation(input)
  const outcome = await call.outcome
  const settlement = 'replyPending' in outcome ? await call.settleReply(disposition) : null
  const close = await call.close()
  // Retain call and its host owner when close is unavailable; neither abort nor outcome proves release.
  return { call, outcome, settlement, close }
}
```

### Durable session model selection

`createSessionModelSelection` reads a complete real session-log prefix, current catalog rows, and the current evaluation-input provider. `selectModel` is an explicit delivery command: it validates legality before repeat detection and appends one codec record when the selected name changes. A session with no selection record remains unavailable; the catalog order and root setting never create an initial selection.

`effectiveModel` returns the existing selection basis together with the actual current `EffectiveAssembly`, including its root settings. Above-session model locks produce `layer_lock`, even when the locked name matches the session selection. A failed current read cannot become a known absence of a lock.

Every `legalTargets` and `selectModel` operation independently reads current EvaluationInput and calls the adopted AE4 evaluator before computing legality. Missing optional root `model` is valid; model locks never filter the legal target set. `displayList()` reads that current legality and the authoritative last selection, then calls the directory's `credentialPresent(tenant, origin)` for each displayed winning row. It returns one entry per route with current source, covered rows, annotations and a selected flag. A selected withdrawn route remains visible; a selected name with no directory row returns `profileNotFound`. Unreadable inputs return `unavailable`. Presence reads expose no credential body or reference and do not certify that a later value lookup will succeed. These operations implement [RT5 S9–S14/S24–S27/S66](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md#s-24-legaltargets) through the adopted [R3-P2 projection](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v3-design.md#契约到-cordis-的投影).

```ts
import {
  createSessionModelSelection,
  type SessionModelSelectionInput,
} from '@omne-harness-lite/model-request-runtime'

// ports come from the authenticated host's actual scoped providers.
export async function initializeExplicitSelection(
  ports: SessionModelSelectionInput,
  requestedRoute: string,
) {
  const selection = createSessionModelSelection(ports)
  const legal = await selection.legalTargets()
  if (!('ok' in legal)) return { selection, legal }
  const selected = await selection.selectModel(requestedRoute)
  if (!('selected' in selected)) return { selection, selected }
  const display = await selection.displayList()
  const basis = await selection.effectiveModel()
  return { selection, selected, display, basis }
}
```

Keep the returned component for its borrowed provider lifetime. Await `selection.close()` before closing those providers. `{ unavailable: true }` means an unconfirmed original write or retained cleanup responsibility remains; keep the dependencies owned rather than treating the component as released. Operations register work before calling providers and await actual task stop. The host supplies actor authorization, real same-scope provider ports, a genuine complete-prefix modality projection, and an explicit concurrency limit. Type shapes and projection callbacks do not certify production provenance. This component does not register the full thirteen-operation runtime service, own the providers, or send model HTTP.

## Supply tools to a durable invocation

Pass resolved `ModelToolEntry` values through `planInput.tools`. `modelEntry` converts a validated tool definition to that model-facing shape. Declare tool-definition as a direct dependency when using this example.

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import { modelEntry, type ToolDefinition } from '@omne-harness-lite/tool-definition'

export function invokeWithTools<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  definitions: readonly ToolDefinition[],
) {
  return createAnchoredModelInvocation({
    ...input,
    planInput: { ...input.planInput, tools: definitions.map(modelEntry) },
  })
}
```

The runtime sends definitions and assembles streamed tool calls; the caller supplies each corresponding tool result in subsequent history. No tool is executed or automatically fed back by this function. Invalid definitions, duplicate names and orphan calls are rejected before a new dispatched anchor or HTTP request. The internal service composition helper now resolves names through the captured session or Run report scope; it is not a public tool execution API. The interactive demo still supplies an empty tool list.

`RuntimeConstruction.transport.acquire(binding, routeName)` preserves three results: an exact lease, `{unavailable:true}` for an unavailable implementation, or `{invalidInput:{reason:"malformed"}}` for invalid binding/configuration. Both new calls and acquisition from an existing anchor retain the refusal before planning or sending; the enclosing operation still owns its normal cleanup.
