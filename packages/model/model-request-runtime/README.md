# @omne-harness-lite/model-request-runtime

[中文](README_ZH.md)

Invoke one explicit model transport and assemble its stream into a final result, with cancellation, content deadlines and an asynchronous first-content gate. This experimental ESM workspace package is not published on npm.

The current implementation contains standalone invocation and pure policy functions. The durable thirteen-operation service, Cordis plugin, tenant admission, recovery, retry orchestration and reply settlement are pending. See the [realization status](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md) for exact adoption and coverage.

## Public API

| Export | Purpose |
| --- | --- |
| `invokeModel(input)` | Return a handle containing `outcome`, `snapshot()` and `abort()` |
| `classifyCause(facts, hasContent, table)` | Classify failure sources using an explicit status table without altering raw status |
| `dispatchGuard(input)` | Synchronously check one retry plan against explicit call, dispatch and profile facts |
| `DispatchGuardInput`, `DispatchGuardResult`, `DispatchGuardFact<T>` | Readonly guard inputs, closed answers and explicit known/unknown facts |
| `retryDelay(input)`, `RetryBackoffPolicy`, `RetryDelayInput`, `RetryDelayResult` | Compute an exact TD3 Duration from explicit policy, retry ordinal, sample and decorrelated previous delay |
| `TransportAdapter`, `PlanInput` | Consumer-owned planning/send/read ports and explicit request context |
| `InvocationPolicy`, `ModelInvocationResult` | Scheduling/redaction/diagnostic policy and an unsettled result projection |
| `modelLogFormat`, `encodeModelLogKey`, `decodeModelLogKey` | D088 `mrr/1` closed business keys; reversible UTF16 encoding and exact dispatch normalization |
| `captureModelLogValue`, `prepareModelLogEntry`, `inspectModelLogEntry` | Strict owned values, position-free candidates and reverse validation of actual log entries |
| `inspectSettlementMembers` | Check complete response/message members and original associations from one complete prefix |
| `modelLogJsonEqual`, `recognizeMessageValue` | Exact full JSON equality and recognition retaining the original captured message |

## Call an explicitly supplied request

Supply a complete `PlanInput`, an explicitly owned typed adapter, credential and abort signal. This example uses only the runtime public package and real stream assembler; declare it as a direct dependency. Configure the adapter with the same complete credential policy. The caller owns its resources and releases them after the outcome and any separate gate work have actually stopped. No environment credential is read.

```ts
import {
  invokeModel, openRouterCredentialRedactionConfig,
  type PlanInput, type PlannedSemantics, type TransportAdapter, type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'

export const callerPolicy: InvocationPolicy = {
  now: () => new Date().toISOString(),
  schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
  firstContentTimeoutMs: 60000, idleContentTimeoutMs: 60000,
  statusCauseTable: { '401': 'credential_unavailable', '429': 'upstream_unavailable', '503': 'upstream_unavailable' },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: event => { console.log(event.kind) },
}

export async function invokeOnce<P extends PlannedSemantics, R>(
  request: PlanInput, transport: TransportAdapter<P, R>, credential: string, signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const handle = invokeModel({ ...request, transport, credential, signal, policy: callerPolicy,
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

## Calculate an exact retry delay

`retryDelay` is a synchronous pure function implementing [RT4 S-60](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v4/contract.md#s-60-纯判定与可单取用构件), adopted by D086 with the D076 R3-P7 projection retained by D087. It returns `{ ok: duration }` or `{ invalidInput: { reason: 'malformed' } }`. It requires all five policy members and a positive integer `n` and exact `uniformSample` in `[0, 1)`, including when jitter is `none`. The decorrelated branch also requires `previousDelay`; on the first retry it must equal `base` by duration value. No defaults or random source are supplied.

```ts
import { retryDelay } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const delay = retryDelay({
  policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT25S', jitter: 'half' },
  n: 3, uniformSample: new LosslessNumber('0.999'),
})
if ('invalidInput' in delay) throw new Error(delay.invalidInput.reason)
if (delay.ok !== 'PT24.9875S') throw new Error('unexpected exact delay')

const next = retryDelay({
  policy: { kind: 'constant', base: 'PT1M', factor: 1.5, max: 'PT2M', jitter: 'decorrelated' },
  n: 1, uniformSample: 0.25, previousDelay: 'PT60S',
})
if ('invalidInput' in next) throw new Error(next.invalidInput.reason)
if (next.ok !== 'PT67.5S') throw new Error('unexpected decorrelated delay')
console.log(delay.ok, next.ok)
```

Declare content-blocks as a direct dependency when constructing `LosslessNumber` values. Durations accept TD3 H/M/S strings, including fractional seconds and equivalent spellings; output uses exact seconds. Coefficients use the public `JsonNumber` representation so a caller can preserve decimal literals and retry ordinals beyond 2^53. Ordinary JavaScript numbers retain the decimal value already present at the call boundary; precision lost before the call cannot be restored.

The function copies and validates JSON data without reading getters, leaves caller data unchanged, and calculates without rounding to milliseconds. This arithmetic result supplies neither retry permission nor waiting, sending, fallback or a default retry contribution. Actual timer precision and large-duration scheduling remain subject to R3-G7; P-5/runner integration and the 37-model certification are pending.

## Capture, prepare and recognize log values

These pure functions implement the [D088 adopted format](../../../.meta_harness/design/record/decisions/model-runtime-log-codec-adoption/decision.md). Static root imports and calls do not open a log, install Cordis, read environment credentials, obtain a clock or generate identities. `SessionLog` types are borrowed from that package's public root. Every session, tenant, run/attempt pair, purpose and message prefix is explicit. A supplied message prefix must be the complete legal prefix before that message; `null` means unavailable and is rejected for a log message.

Text reception and value reception are different modes. Nested duplicate object members, getters, `toJSON`, unsupported objects and fake number brands are rejected. The returned capture retains the original immutable JSON and number spellings. The response judge checks the capture; it does not manufacture an owned `ModelResponse` from `{ ok: true }`.

```ts
import { captureModelLogValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const captured = captureModelLogValue({
  category: 'record',
  input: { kind: 'text', text: '{"kind":"model_call_opened","call":"example-call","dispatch":1.0,"firstTokenAt":"2026-09-27T00:00:01Z"}' },
})
if (!('ok' in captured)) throw new Error(captured.reason)
if (!writeJsonLossless(captured.ok.value).includes('"dispatch":1.0'))
  throw new Error('Original numeric spelling must survive capture')
```

Prepare a candidate with no durable position. Append ownership, authorization, fence and condition belong to its actual writer. Selection records have no dedupe key. Every other dedupe key also appears explicitly in `readKeys`; reads validate the complete key set without requiring its array order. Persisted assistant messages use `{ kind: 'persistedMessage', response: capturedResponse }` and the response's complete reply. Independent assistant writes and SystemMessage log writes are rejected.

```ts
import { captureModelLogValue, prepareModelLogEntry, encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { parseTenantId } from '@omne-harness-lite/identity-values'

const tenant = parseTenantId({ organization: 'example-organization', account: 'example-account' })
const message = captureModelLogValue({ category: 'message', input: { kind: 'value', value: {
  id: 'example-message', type: 'user', createdAt: '2026-09-27T00:00:00Z', blocks: [],
} } })
if (!('ok' in tenant) || !('ok' in message)) throw new Error('Invalid example value')
const prepared = prepareModelLogEntry({
  session: 'example-session', shell: { tenant: tenant.ok }, captured: message.ok,
  purpose: { kind: 'message' }, messagePrefix: [],
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

const original = '{"id":"example-reminder","type":"system_reminder","nature":"event","source":{"kind":"extension","extension":"teaching","payload":{"amount":1.00}},"blocks":[],"createdAt":"2026-09-27T00:00:00Z"}'
const candidate = original.replace('1.00', '1e0')
const recognized = recognizeMessageValue({
  candidate: { kind: 'text', text: candidate }, original: { kind: 'text', text: original },
})
if (!('same' in recognized)) throw new Error('Expected the same mathematical JSON value')
if (!writeJsonLossless(recognized.original.value).includes('1.00'))
  throw new Error('Recognition must retain the original value')
```

`inspectModelLogEntry` accepts an actual `LogEntry`, the expected session/tenant, explicit purpose and the message prefix before its position. It checks the closed wrapper `{ format, category, value }`, the shell, position and reconstructed D/R. `inspectSettlementMembers` accepts `{ mode: 'read', session, tenant, prefix: { entries, tail }, target: { call, dispatch, response }, anchors: { dispatched, opened, intent }, current }`. `current` is either `null` or the previously designated `{ messageId, disposition }`; the absent members of that pair use `null`. Write mode additionally requires the complete `candidates` array of position-free `OwnedLogEntry` values.

Read mode recognizes an existing batch using its own MessageId, ResponseId, binding, parameters, amounts and full reply before checking a losing candidate's occupancy. A different losing MessageId, even one occupied by another message, cannot invalidate a lawful original batch. Only when no original batch exists does candidate occupancy prevent `absent`. `completeMembers` contains the original captures and entries, plus `disposition: 'same' | 'firstWinner' | 'unrequested'`; a different lawful disposition retains the winner. Pure results do not map these answers to a service operation's success or `alreadyEnded`.

Member checking does **not** prove one physical append, lawful history, read permission, Run lifecycle, or actual old-task stop. H1 once `[M,R]` and H2 separately `[M]`/`[R]` can expose identical SL3 read results. G29-P/H remain host/all-writer responsibilities. WithRun late recognition currently returns `undetermined: true, reason: 'run_history_unavailable'` pending the original G28 production interpreter; it does not treat unknown history as false or use the accounting attempt as the original attempt. The thirteen-operation service, actual runner/app adoption, G30/G31 and production model certification remain pending.

The member checker consumes the [D089 adopted](../../../.meta_harness/design/record/decisions/model-time-order-projection-adoption/decision.md) `offer-expiry` root comparator on the captured original timing strings. It checks `sentAt <= firstTokenAt <= endedAt`, or `sentAt <= endedAt` when no first token exists. Static invalid dates and reversed order cannot return complete members. Arbitrary fractional digits and offset-equivalent instants keep their precision; the original opened string must still match exactly.

```ts
import { captureModelLogValue, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'

const sent = '2026-09-27T00:00:00.0004Z'
const first = '2026-09-27T00:00:00.0003Z'
const order = compareRfc3339Instants(sent, first)
if (!('ok' in order) || order.ok !== 1) throw new Error('Sub-millisecond reverse order must remain visible')
const alias = '2026-09-27T01:00:00.0003+01:00'
const sameInstant = compareRfc3339Instants(first, alias)
if (!('ok' in sameInstant) || sameInstant.ok !== 0) throw new Error('Expected offset-equivalent instants')
if (modelLogJsonEqual(first, alias)) throw new Error('Original strings remain different')
const opened = captureModelLogValue({ category: 'record', input: { kind: 'value', value: {
  kind: 'model_call_opened', call: 'example-call', dispatch: 1, firstTokenAt: first,
} } })
if (!('ok' in opened) || opened.ok.record?.kind !== 'model_call_opened' || opened.ok.record.firstTokenAt !== first)
  throw new Error('Capture must retain the original opened string')
```

The comparator and `completeMembers` operate within the declared legal RFC3339 input domain. They do not certify actual time sources, leap announcements, legal history or physical commits. The producer/host/history owner must establish TL-G1 at the real production boundary; unconfirmed external values or history remain unavailable there. The old millisecond Instant/Clock interfaces keep their original behavior.

## Explicit shared credential redaction

`createCredentialRedactionPolicy(config)` constructs the pure policy adopted by [D093](../../../.meta_harness/design/record/decisions/model-credential-policy-adoption/decision.md). All three named parameters are required. `openRouterCredentialRedactionConfig` is the deeply immutable, explicit `openrouter-redaction/1` baseline: minimum fragment length 8, the 11 adopted denylist headers and the three finite sk-/Bearer/Basic descriptors. The algorithm has no implicit configuration, environment, network, storage or Cordis dependency.

`policy.bind(knownCredential)` returns `{ ok: bound }` or `{ rejected: 'invalidInput' }`. The frozen bound closure only exposes `text(value)`, `headers(value)` and `json(value)`, each returning the same explicit result shell. Known credentials must be nonempty printable ASCII. Full credentials shorter than the fragment minimum remain protected. All matches use the original input and their interval union becomes `█`; scanning does not normalize, decode unknown encodings or evaluate open regular expressions. Headers first remove original denylist keys with ASCII case folding, then redact keys and values; string versus ordered string-array shape, duplicates and empty values survive. JSON processes keys and all scalar tokens, including exact numbers, booleans and null. A matching nonstring scalar becomes a marker string; unhit types and exact numeric spelling remain. Outputs are independent and frozen, and processing the safe value again gives the same value. Exact-number admission captures the trusted public LosslessNumber source getter at module initialization, reads the branded source explicitly, and immediately clones a standard owned number; token matching uses jsonNumberSource on that clone. Caller prototype Get traps cannot substitute that numeric token.

`redact(value, knownCredential, params)` is the standalone RT5 S60 JSON/string function and uses this same kernel. For actual response headers use `bound.headers`, which also strips denylist entries. Declare this package and `content-blocks` as direct dependencies for the exact-number example; it uses synthetic data and makes no request.

```ts
import {
  createCredentialRedactionPolicy, openRouterCredentialRedactionConfig, redact,
} from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const policy = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig)
const binding = policy.bind('teaching-secret')
if (!('ok' in binding)) throw new Error(binding.rejected)
const text = binding.ok.text('teaching-secret / Bearer example-token')
if (!('ok' in text) || text.ok !== '█ / █') throw new Error('Unexpected safe text')
const headers = binding.ok.headers({ Authorization: 'discard', X: ['', 'teaching-secret', 'again', 'again'], Empty: [] })
if (!('ok' in headers) || 'Authorization' in headers.ok || headers.ok.X?.length !== 4)
  throw new Error('Expected safe headers with their original array shape')
const rawError = redact([true, null, new LosslessNumber('9007199254740993')], 'true', openRouterCredentialRedactionConfig)
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
  legalTargets, displayList, effectiveModel, type SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'

const rows: readonly ProfileRow[] = [{
  ref: { origin: 'official', routeName: 'teaching/model' },
  profile: {
    routeName: 'teaching/model', origin: 'official', registration: 'listed',
    adaptation: {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: 'teaching/model', revision: 'one' },
      configuration: { revision: 'one', values: {} },
    },
    providers: ['teaching-provider'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 100, maxOutputTokens: 10, inputConstraints: {},
    updatedAt: '2026-09-27T00:00:00Z',
  },
}]
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
if (!('ok' in list) || !list.ok[0]?.selected ||
  !list.ok[0].annotations.includes('credential_missing')) throw new Error('Expected missing-credential annotation')
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

## Explicit MR5 log codec

Import `@omne-harness-lite/model-request-runtime/log-codec/v2` explicitly for MR5 responses, including ordered string-array `raw.headers`. It exports the same codec functions and types listed above. Its `modelLogFormat` is `mrr/2`; the root remains MR4 and `mrr/1`. Payload format and business-key namespace are separate: both writers retain the same `mrr/1` dedupe keys for each MessageId and ResponseId.

The following standalone example prepares a complete persisted `[M,R]` batch or one nonpersisted response. Supply the complete actual response and legal message prefix; the example performs no IO and grants no log permission. Declare the imported packages as direct dependencies.

```ts
import {
  captureModelLogValue, prepareModelLogEntry, inspectSettlementMembers,
  type InspectSettlementMembersInput,
} from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { LogPrefixView } from '@omne-harness-lite/messages'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'

export function prepareReplyBatchV2(
  session: string, tenant: TenantId, responseValue: unknown, messagePrefix: LogPrefixView,
): readonly OwnedLogEntry[] {
  const response = captureModelLogValue({ category: 'response', input: { kind: 'value', value: responseValue } })
  if (!('ok' in response)) throw new Error(response.reason)
  const r = prepareModelLogEntry({ session, shell: { tenant }, captured: response.ok,
    purpose: { kind: 'response' }, messagePrefix })
  if (!('ok' in r)) throw new Error(r.reason)
  if (response.ok.response?.replyDisposition !== 'persisted') return [r.ok]
  const message = captureModelLogValue({ category: 'message',
    input: { kind: 'value', value: response.ok.response.reply } })
  if (!('ok' in message)) throw new Error(message.reason)
  const m = prepareModelLogEntry({ session, shell: { tenant }, captured: message.ok,
    purpose: { kind: 'persistedMessage', response: response.ok }, messagePrefix })
  if (!('ok' in m)) throw new Error(m.reason)
  return [m.ok, r.ok]
}

export function inspectReplyBatchV2(input: InspectSettlementMembersInput) {
  return inspectSettlementMembers(input)
}
```

Append the **entire returned array once** through the actual SL3 provider. V2 inspection reads `mrr/1` with MR4 and `mrr/2` with MR5, retains original payload format/value/position, and rejects unknown formats or arrays falsely tagged `mrr/1`. It preserves ordered duplicates, exact numbers, and absent versus empty headers. Neither inspection nor adjacency certifies a physical batch; G29-P/H, lawful reads, old-writer stop and the full runtime remain the host's responsibility.

Captures belong to their originating codec domain. Root and v2 captures cannot be interchanged. V2 history captures cannot be prepared for writing: explicitly call v2 `captureModelLogValue` on the original value and pass complete reception again. Existing root capture/prepare behavior remains unchanged. No automatic history rewrite or consumer upgrade occurs. Adoption is fixed by [D094](../../../.meta_harness/design/record/decisions/model-log-codec-v2-adoption/decision.md).

## RT5 single response-header handoff

`SendResult` may carry `rawHeaders` on its response, failed or aborted branch, and never on rejected. `TransportFailure.headers` and a second header field on `StreamEnd` are absent. The sender must already process and own an immutable MR5 header map under the same explicit policy. Invoke immediately retains that exact value, including ordered array duplicates, empty values, absent versus empty map, across all four outcomes and content-gate cancellation; it does not re-run header redaction. Invalid or mutable header representation fails the entire port and requests actual reader stop; independently known HTTP failure facts survive.

Upstream error/local text pass through the bound shared JSON/text policy. Raw/error keys and all scalar tokens are processed, while independent protocol status and actual usage/cost remain intact even if their literal value equals the credential. Processing rejection/defect omits unsafe payload and emits fixed stage diagnostics; an already retained H survives. A pre-send bind defect rejects the outcome with a controlled stage error and no fabricated sent result. Diagnostic-sink failure does not alter business behavior.

Business reply/tool fragments retain their original assembler semantics. This implementation does not close the outstanding content-echo policy, raw-body attachments, full S20, production TLS composition or durable service. Exact scope is adopted by [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md).
