# @omne-harness-lite/model-response

[中文](README_ZH.md)

Represent the record of one model dispatch: its route snapshot, actual parameters, response outcome, timing, delivered content, usage and cost. The package judges complete records without sending model requests or owning persistence.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

The package root and `./schema` use **MR4**. Import `./v5` and `./schema/v5` explicitly for ordered string-array response headers. The retained `./v3`, `./schema/v3`, and `./schema/v2` entries keep their original versions. Judging is synchronous and does not capture ownership of the caller's input or establish where headers came from.

## Explicit MR5 complete response and raw headers

This example exercises the public v5 judge and the `RawHeaders` definition. Empty arrays and strings remain distinct from absent keys; MR4 still rejects the mixed array value.

```ts
import assert from 'node:assert/strict'
import { judgeModelResponse as judgeV4 } from '@omne-harness-lite/model-response'
import {
  judgeModelResponse,
  validate,
  type ModelResponse,
  type RawHeaders,
} from '@omne-harness-lite/model-response/v5'

const headers: RawHeaders = {
  'x-one': 'a,b',
  'x-many': ['second', 'first', 'first', ''],
  'x-empty-array': [],
  'x-empty-string': '',
}
const adaptation = {
  implementation: { name: 'example-family', revision: 'impl-1' },
  definition: { modelId: 'vendor/chat', revision: 'model-1' },
  configuration: { revision: 'config-1', values: {} },
}
const response: ModelResponse = {
  id: 'response_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    adaptation,
    profile: { origin: 'official', routeName: 'vendor/chat' },
    profileSnapshot: {
      adaptation,
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'interrupted',
  initiator: 'user',
  timing: { sentAt: '2026-09-26T10:00:00Z', endedAt: '2026-09-26T10:00:02Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
  raw: { headers },
}
assert.deepEqual(validate('RawHeaders', headers), { valid: true })
assert.deepEqual(judgeModelResponse(response), { ok: true })
assert.deepEqual(judgeV4(response), { rejected: 'malformed' })
assert.deepEqual(headers['x-empty-array'], [])
```

| Public API                                    | Use                                                          |
| --------------------------------------------- | ------------------------------------------------------------ |
| `ModelResponse`, `Route`, `Failure`, `Timing` | Type the conditional response shapes                         |
| `judgeModelResponse`                          | Judge independent members and outcome relationships in order |
| `validate`, `SCHEMA_DEF_NAMES`, `schemaId`    | Access the schema validation surface                         |

## Judge a complete response

Create branded message and block identities through public APIs. This record uses an official profile and a factory credential scope.

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'

const block = judgeContentBlock({
  id: 'block_1',
  kind: 'text',
  text: 'Ready.',
  visibility: { toHuman: true, toModel: true },
})
if ('rejected' in block || block.ok.kind !== 'text') throw new Error('Text block required')
const { origin: _origin, ...replyBlock } = block.ok
const response: ModelResponse = {
  id: 'response_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    profile: { origin: 'official', routeName: 'vendor/chat' },
    adaptation: {
      implementation: { name: 'example-family', revision: 'r1' },
      definition: { modelId: 'vendor/chat', revision: 'd1' },
      configuration: { revision: 'c1', values: {} },
    },
    profileSnapshot: {
      adaptation: {
        implementation: { name: 'example-family', revision: 'r1' },
        definition: { modelId: 'vendor/chat', revision: 'd1' },
        configuration: { revision: 'c1', values: {} },
      },
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: { maxOutputTokens: 64 },
  },
  outcome: 'complete',
  reply: {
    id: unwrap(parseOpaqueIdentifier('message_1', 'MessageId')),
    type: 'assistant',
    response: 'response_1',
    ending: 'complete',
    blocks: [replyBlock],
    createdAt: '2026-09-26T10:00:02Z',
  },
  replyDisposition: 'persisted',
  timing: {
    sentAt: '2026-09-26T10:00:00Z',
    firstTokenAt: '2026-09-26T10:00:01Z',
    endedAt: '2026-09-26T10:00:02Z',
  },
  usage: {
    input_tokens: 12,
    output_tokens: 2,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: { cost_usd: 0.0001, source: 'upstream_usage' },
}
console.log(judgeModelResponse(response)) // { ok: true }
console.log(
  judgeModelResponse({ ...response, reply: { ...response.reply, ending: 'truncated_at_limit' } }),
)
// { rejected: 'reply_ending_mismatch' }
```

## Judge failure and rejection precedence

Unknown cost remains unknown. An in-band status-code relationship is checked after the named response relationships.

```ts
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'

const response: ModelResponse = {
  id: 'response_failed',
  call: { callId: 'model_call_2' },
  dispatch: 1,
  route: {
    profile: { origin: 'official', routeName: 'vendor/chat' },
    adaptation: {
      implementation: { name: 'example-family', revision: 'r1' },
      definition: { modelId: 'vendor/chat', revision: 'd1' },
      configuration: { revision: 'c1', values: {} },
    },
    profileSnapshot: {
      adaptation: {
        implementation: { name: 'example-family', revision: 'r1' },
        definition: { modelId: 'vendor/chat', revision: 'd1' },
        configuration: { revision: 'c1', values: {} },
      },
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'failed',
  failure: { cause: 'request_rejected', statusCode: 429 },
  timing: { sentAt: '2026-09-26T10:00:00Z', endedAt: '2026-09-26T10:00:02Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
}
console.log(judgeModelResponse(response)) // { ok: true }
console.log(judgeModelResponse({ ...response, outcome: 'future', dispatch: 0 }))
// { rejected: 'outcome_unknown' }
console.log(
  judgeModelResponse({
    ...response,
    outcome: 'interrupted',
    initiator: 'user',
    failure: { cause: 'request_rejected', inBand: true },
  }),
) // { rejected: 'failure_on_interrupted' }
```

## Failures and boundaries

`judgeModelResponse` returns `{ ok: true }` or one `{ rejected }`. Precedence is: unknown outcome, integer dispatch below one, unknown failure cause, other independent member malformation; then `reply_missing`, `reply_on_failure`, `reply_and_delivered`, `failure_missing`, `failure_on_interrupted`, `failure_on_success`, `reply_ending_mismatch`, `first_token_inconsistent`; remaining cross-member violations are `malformed`. For example, missing `statusCode` with `failure.inBand: true` does not hide `failure_on_interrupted`. Schema-only `validate` reports shape validity rather than this rejection order.

Complete and truncated responses carry a reply and disposition. Mid-reply failure carries `delivered` and a first-token time, with no reply. Interruption has its own shapes and is not a failure. `late` belongs only to a response associated with a run. Numeric counts and costs use exact `JsonNumber` values, and unknown amounts are not replaced with zero.

Passing validation establishes representation validity. Actual dispatch provenance, identity uniqueness, clock provenance, truthful usage, redaction, snapshot capture and persistence remain the writer's responsibility. A rejected record is a writer defect; it must not be reclassified as a failed model call or used as a reason to automatically resend. This module reads no clocks or stores and performs no model calls.

Public JSON Schema entries are `@omne-harness-lite/model-response/schema` (v3) and `/schema/v2`. See [source exports](src/index.ts), [tests](tests/) and [model profile](../model-profile/README.md).

The default entry and Schema use version4; `./v3` and `./schema/v3` retain version3 values and its exact resource. `./schema/v2` remains a Schema resource only. Choose the consumer version explicitly when restoring invocation records/responses.
