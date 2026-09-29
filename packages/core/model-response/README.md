# @omne-harness-lite/model-response

[中文](README_ZH.md)

Pure MR10 response representation and ordered judgments. A `ModelResponse` records one confirmed durable dispatch responsibility, including its immutable route and profile snapshot, outcome, timing, reply or delivered partial content, actual usage, cost, and optional raw response reference. A persisted `interrupted` response can explicitly carry `timing.sentAt: null` when the actual send time is unavailable; this does not assert that no request was sent. `PendingModelResponse` is the complete reply fact passed to a message writer before that writer decides whether the reply became a message and whether the record is late. Every pending reply requires an actual send time. Neither judgment sends a request or persists a record.

This is a private ESM workspace package. Its current public entries are the package root and `./schema`. Historical response versions have no executable package entry. Incompatible stored values fail admission; the package never fills their missing fields from a current model directory.

## Judge a pending reply, then a persisted response

The example is runnable as an ESM file after building the workspace package. It uses a text-only profile. In a real runtime the route, timestamps, usage, cost, and reply come from the actual dispatch and provider boundary; a caller must not invent them to make an invalid record pass.

```js
import assert from 'node:assert/strict'
import {
  copyInputCalibration,
  judgeModelResponse,
  judgePendingModelResponse,
  judgeResponseFinalization,
  validate,
} from '@omne-harness-lite/model-response'

const adaptation = {
  implementation: { name: 'example-family', revision: '1' },
  definition: { modelId: 'example/chat', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const pending = {
  id: 'resp_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    adaptation,
    profile: { origin: 'official', routeName: 'example/chat' },
    profileSnapshot: {
      adaptation,
      providers: ['example'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: '2026-09-28T10:00:00Z',
    },
    selectedBy: 'session',
    provider: 'example',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'complete',
  reply: {
    id: 'message_1',
    type: 'assistant',
    response: 'resp_1',
    ending: 'complete',
    blocks: [
      {
        id: 'block_1',
        kind: 'text',
        text: 'Hello.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    createdAt: '2026-09-28T10:00:02Z',
  },
  timing: {
    sentAt: '2026-09-28T10:00:00Z',
    firstTokenAt: '2026-09-28T10:00:01Z',
    endedAt: '2026-09-28T10:00:02Z',
  },
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: { cost_usd: 0.0001, source: 'upstream_usage' },
  inputCalibration: {
    requestInput: {
      kind: 'known',
      projectionRevision: 'example-projection-1',
      prefixBoundary: 1,
      prefixDigest: '1'.repeat(64),
      inputEnvelopeDigest: '2'.repeat(64),
      countingBasis: {
        binding: adaptation,
        model: 'example/chat',
        provider: 'example',
        tokenizerRevision: 'example-tokenizer-1',
        meterRevision: 'example-meter-1',
        projectionRevision: 'example-projection-1',
        replayRevision: 'example-replay-1',
        transformRevision: 'example-transform-1',
      },
    },
    observedInput: {
      kind: 'from_usage',
      provenance: { adapterRevision: 'example-adapter-1', fieldPaths: ['usage.prompt_tokens'] },
    },
    outputGroup: {
      kind: 'known',
      projectionRevision: 'example-projection-1',
      source: 'reply',
      blockDigests: ['3'.repeat(64)],
      completeness: 'complete',
      usageRef: 'usage',
    },
  },
  raw: { headers: { 'x-example': ['first', 'first', ''] } },
}

assert.deepEqual(judgePendingModelResponse(pending), { ok: true })
assert.equal(validate('ModelResponse', pending).valid, false)

// The message writer supplies this fact only after its own commit decision.
const persisted = { ...pending, replyDisposition: 'persisted' }
assert.deepEqual(judgeModelResponse(persisted), { ok: true })
assert.deepEqual(judgeResponseFinalization(pending, persisted), { ok: true })
assert.deepEqual(
  judgeResponseFinalization(pending, { ...persisted, cost: { cost_usd: 0, source: 'upstream_usage' } }),
  { rejected: 'malformed' },
)
assert.deepEqual(
  judgeResponseFinalization(pending, { ...persisted, reply: { ...pending.reply, createdAt: '2026-09-28T10:00:03Z' } }),
  { rejected: 'malformed' },
)
assert.deepEqual(persisted.raw.headers['x-example'], ['first', 'first', ''])

// A separate recovery-shaped value illustrates the representation only. The writer must
// establish the durable dispatch, actual-stop, and timing facts before persisting it.
const recovered = {
  id: 'resp_recovery_1',
  call: { callId: 'recovery_call_1' },
  dispatch: 1,
  route: pending.route,
  outcome: 'interrupted',
  initiator: 'runtime_lost',
  timing: { sentAt: null, endedAt: '2026-09-28T10:01:00Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
  inputCalibration: {
    requestInput: { kind: 'unavailable', reason: 'send_unknown' },
    observedInput: { kind: 'unavailable', reason: 'missing_usage' },
    outputGroup: { kind: 'unavailable', reason: 'not_retained' },
  },
}
assert.deepEqual(judgeModelResponse(recovered), { ok: true })
assert.equal(recovered.cost.cost_usd, 'unknown')
assert.deepEqual(
  judgeModelResponse({ ...recovered, cost: { cost_usd: 0, source: 'none' } }),
  { rejected: 'malformed' },
)

const independentOutput = {
  ...pending,
  inputCalibration: {
    ...pending.inputCalibration,
    requestInput: { kind: 'unavailable', reason: 'not_retained' },
  },
}
assert.deepEqual(judgePendingModelResponse(independentOutput), { ok: true })
const copied = copyInputCalibration(independentOutput.inputCalibration)
if (!('ok' in copied)) throw new Error('invalid calibration')
assert.equal(Object.isFrozen(copied.ok.outputGroup), true)
assert.notEqual(copied.ok.outputGroup, independentOutput.inputCalibration.outputGroup)

assert.deepEqual(
  judgePendingModelResponse({ ...pending, timing: { ...pending.timing, sentAt: null } }),
  { rejected: 'malformed' },
)
```

`validate(defName, value)` checks one of the 25 MR10 JSON Schema definitions and returns `{ valid: boolean }`. `judgeModelResponse(value)` and `judgePendingModelResponse(value)` return `{ ok: true }` or `{ rejected: reason }` with the MR10 S-27 rejection order. They preserve exact JSON numbers and never mutate input. A valid representation does not prove the dispatch, time provenance, actual usage, reply commit, or durability; those guarantees belong to the runtime and writer.

MR10 compiles all 25 public definitions and its two existing private member validators over nine exact normative resources through public schema entries: MR10, CA3, IV1, MP5, CB2, OE1, LC6, CB3 and MS7. The private member view remains separate. LC6 supplies only the referenced FailureCause definition; this graph does not register MS6, CA2, MP6, TD3 or the old asset chain. Each required resource keeps its original bytes and `$id`. Missing or incorrect resources make package initialization fail clearly. The accepted contract is [MR10](../../../.meta_harness/design/spec/data/model-response/v10/contract.md); the adopted provider mapping is [model-response v10](../../../.meta_harness/design/realization/packages/core/model-response/v10-reference-result-design.md).

## Input calibration values

Both response forms require `inputCalibration`. The public readonly types are `CountingBasis`, `RequestInputEvidence`, `ObservationProvenance`, `ObservedInput`, `OutputGroupEvidence`, and `InputCalibration`. Request evidence records the original projection and counting basis; observed input records upstream facts; output evidence describes the retained group. `from_usage` refers to the three mutually exclusive input usage components; it never copies or adds another total. Missing components remain `unknown`.

The example's repeated-digit digests and revision labels are illustrative values, not authenticated hashes of its content. Production adapters must supply the actual fixed projection, source facts, and content digests. Request evidence may be unavailable while output evidence remains known with its own projection revision, as the example shows.

`copyInputCalibration(value)` returns `{ ok: InputCalibration }` or `{ rejected: 'malformed' }`. It rejects getters without running them, cycles, non-JSON members, invalid shapes, and conflicting local projection revisions. Success returns an independent, deeply frozen, lossless snapshot; it does not certify route/usage relations, digest contents, or upstream provenance.

`validate` remains Schema-only. The two judges additionally compare the complete adaptation binding, projection revisions, observed route facts, exact input-component sums, and output source/block count, after the existing named rejection checks. A fragment can pass `copyInputCalibration` while its enclosing response fails judgment. Neither operation reads historical logs, calls a tokenizer, or persists calibration. The runtime owns authorization and atomic response/reply persistence; older values missing this field are rejected without backfill.

## Preserve the original response through finalization

`judgeResponseFinalization(pending, final)` first owns and fully judges the complete Pending, then owns and judges final, preserving each S-27 rejection order. Only final's top-level `replyDisposition` and `late` are removed for comparison. Every other JSON value must be exactly equal, including original reply derivations, usage/cost, raw references, header order and input calibration. Object key order and equal numeric spellings do not matter; array order, duplicates, absence and exact decimal differences do. The result is the existing frozen judgment, and input is unchanged.

Pending can be retained as immutable content under S-46; it is still not a final response. This helper certifies neither bytes, source, authorization, durable publication nor cost selection. It never queries a provider or meter, recomputes original digests, or fills unknown amounts. A first persisted message's permitted rendering/transcript additions belong to the unique `judgeModelReplyMessage` in messages; final.reply itself remains original. The runtime/writer composes both judgments with actual source and permission checks and commits the original batch. [D-110](../../../.meta_harness/design/record/decisions/model-runtime-reference-lifecycle-adoption/decision.md) adopts this version; actual runtime/storage combination remains a separate verification obligation.

The current resource registration and verification roots follow the accepted [public-definition closure revision 2](../../../.meta_harness/design/realization/packages/core/messages/public-definition-resource-closure-followup.md) and [D110 closure decision](../../../.meta_harness/design/record/decisions/model-runtime-reference-lifecycle-adoption/public-schema-closure-decision.md). MS2/MS3/MS6 resources remain available for their actual external consumers, with no old executable codec. LC/AE migration and runtime persistence are separate responsibilities.
