# @omne-harness-lite/model-response

[中文](README_ZH.md)

Pure MR8 response representation and ordered judgments. A `ModelResponse` records one confirmed durable dispatch responsibility, including its immutable route and profile snapshot, outcome, timing, reply or delivered partial content, actual usage, cost, and optional raw response reference. A persisted `interrupted` response can explicitly carry `timing.sentAt: null` when the actual send time is unavailable; this does not assert that no request was sent. `PendingModelResponse` is the complete reply fact passed to a message writer before that writer decides whether the reply became a message and whether the record is late. Every pending reply requires an actual send time. Neither judgment sends a request or persists a record.

This is a private ESM workspace package. Its current public entries are the package root and `./schema`. Historical response versions have no executable package entry. Incompatible stored values fail admission; the package never fills their missing fields from a current model directory.

## Judge a pending reply, then a persisted response

The example is runnable as an ESM file after building the workspace package. It uses a text-only profile. In a real runtime the route, timestamps, usage, cost, and reply come from the actual dispatch and provider boundary; a caller must not invent them to make an invalid record pass.

```js
import assert from 'node:assert/strict'
import {
  judgeModelResponse,
  judgePendingModelResponse,
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
  raw: { headers: { 'x-example': ['first', 'first', ''] } },
}

assert.deepEqual(judgePendingModelResponse(pending), { ok: true })
assert.equal(validate('ModelResponse', pending).valid, false)

// The message writer supplies this fact only after its own commit decision.
const persisted = { ...pending, replyDisposition: 'persisted' }
assert.deepEqual(judgeModelResponse(persisted), { ok: true })
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
}
assert.deepEqual(judgeModelResponse(recovered), { ok: true })
assert.deepEqual(
  judgePendingModelResponse({ ...pending, timing: { ...pending.timing, sentAt: null } }),
  { rejected: 'malformed' },
)
```

`validate(defName, value)` checks one of the 19 MR8 JSON Schema definitions and returns `{ valid: boolean }`. `judgeModelResponse(value)` and `judgePendingModelResponse(value)` return `{ ok: true }` or `{ rejected: reason }` with the MR8 S-27 rejection order. They preserve exact JSON numbers and never mutate input. A valid representation does not prove the dispatch, time provenance, actual usage, reply commit, or durability; those guarantees belong to the runtime and writer.

MR8's schema compiles against a fixed transitive set of 22 normative resources supplied through the owning packages' public schema entries, including the exact model-profile v5 dependency. Missing or incorrect resources make package initialization fail clearly. The accepted contract is [MR8](../../../.meta_harness/design/spec/data/model-response/v8/contract.md); the adopted provider mapping is [model-response v8](../../../.meta_harness/design/realization/packages/core/model-response/v8-design.md).
