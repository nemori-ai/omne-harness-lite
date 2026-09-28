# @omne-harness-lite/messages

[中文](README_ZH.md)

Pure immutable message and model-invocation record validation, plus readability, pairing and compaction checks over an explicit log prefix. It supplies message values and predicates for consumers without owning a session log or runtime.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/messages": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                                                | Purpose                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `judgeMessage`, `judgeMessageText`, `judgeMessageInLog`                   | Single-message admission, strict JSON reception and forward-reference checks |
| `judgeModelInvocationRecord`, `judgeModelInvocationRecordText`            | Admit five invocation record kinds, separately from messages                 |
| `isReadable`, `judgePairing`, `judgeCompactionList`                       | Prefix-dependent checks with explicit external inputs                        |
| `brandMessage`, `brandRecord`, `isWireMessage`, `isWireRecord`, `Wire<T>` | Shape-only transport restoration and wire typing                             |
| Message/record types, `LogPrefixView`                                     | Seven message types and caller-owned ordered prefixes                        |
| `validate`, `schemaId`; `./schema`                                        | Current MS6 shape validation                                                 |
| `./schema/v2`, `./schema/v3`                                              | Exact resources for current transitive specification references              |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Receive a message through strict JSON

```ts
import { judgeMessageText } from '@omne-harness-lite/messages'

const result = judgeMessageText(
  JSON.stringify({
    id: 'message_1',
    type: 'user',
    createdAt: '2026-09-26T10:00:00Z',
    blocks: [
      { kind: 'text', id: 'block_1', visibility: { toHuman: true, toModel: true }, text: 'Hello' },
    ],
  }),
)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.ok.type, Object.isFrozen(result.ok)) // user true
console.log(judgeMessageText('{"type":"user","type":"user"}')) // { rejected: 'malformed' }
```

### Check compaction against a complete prefix

```ts
import {
  isReadable,
  judgeCompactionList,
  judgeMessage,
  judgeMessageInLog,
  judgePairing,
  type LogPrefixView,
} from '@omne-harness-lite/messages'

const user = judgeMessage({
  id: 'message_1',
  type: 'user',
  createdAt: '2026-09-26T10:00:00Z',
  blocks: [
    {
      kind: 'text',
      id: 'block_1',
      visibility: { toHuman: true, toModel: true },
      text: 'Long request',
    },
  ],
})
if ('rejected' in user || user.ok.type !== 'user') throw new Error('invalid user message')
const prefix: LogPrefixView = [user.ok]
const ref = { messageId: user.ok.id, blockId: user.ok.blocks[0]!.id }
const compact = judgeMessageInLog(
  {
    id: 'message_2',
    type: 'compaction',
    createdAt: '2026-09-26T10:01:00Z',
    blocks: [
      {
        kind: 'text',
        id: 'block_2',
        visibility: { toHuman: true, toModel: true },
        text: 'Request summary',
      },
    ],
    silenced: [ref],
  },
  prefix,
)
if ('rejected' in compact || compact.ok.type !== 'compaction') throw new Error('invalid compaction')
console.log(judgePairing(compact.ok, prefix)) // { undetermined: 'compaction_list' }
console.log(
  judgeCompactionList(compact.ok, prefix, {
    pendingCardBlocks: [],
    lastModelRequestPrefixLength: 1,
  }),
)
// { valid: true }
console.log(isReadable(ref, prefix)) // true
console.log(isReadable(ref, [...prefix, compact.ok])) // false
```

The supplied prefix and external inputs describe this whole example log. Check all required results before appending in your own log transaction.

### Validate an invocation record separately

```ts
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'

const opened = judgeModelInvocationRecord({
  kind: 'model_call_opened',
  call: 'model_call_1',
  dispatch: 1,
  firstTokenAt: '2026-09-26T10:00:00Z',
})
if ('rejected' in opened) throw new Error(opened.rejected)
console.log(opened.ok.kind) // model_call_opened
```

A dispatched record carries the complete profile snapshot. The record receiver checks its shape and binding; the profile writer must judge the source profile before copying it.

```ts
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'

const adaptation = {
  implementation: { name: 'example-family', revision: '1' },
  definition: { modelId: 'vendor/chat', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const dispatched = judgeModelInvocationRecord({
  kind: 'model_call_dispatched',
  call: 'model_call_1',
  dispatch: 1,
  provider: 'provider-a',
  response: 'response_1',
  profile: { origin: 'official', routeName: 'vendor/chat' },
  profileSnapshot: {
    providers: ['provider-a'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation,
    updatedAt: '2026-09-28T00:00:00Z',
  },
  adaptation,
  parameters: {},
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
})
if ('rejected' in dispatched) throw new Error(dispatched.rejected)
console.log(dispatched.ok.kind) // model_call_dispatched
```

## Boundaries and failures

Successful judges return owned frozen values; rejections do not repair input. Text judges use lossless JSON reception and map syntax or duplicate-member failures to `malformed`. Named message/block predicates run before the remaining shape check. `brandMessage`/`brandRecord` restore brands after complete Schema validation but omit additional single-value and log rules; invalid representation preconditions throw `TypeError`.

`LogPrefixView` must be complete, ordered, validated and consistent. `createdAt` is not the ordering key. `judgeMessageInLog` checks representation and forward references; it does not append or establish pairing. `judgePairing` checks uniqueness and call/result relationships but a nonempty compaction list needs `judgeCompactionList` as well. Call the latter only after message/forward-reference admission. Missing pending-card or last-request inputs can produce `undetermined`; this is not permission to append.

Messages themselves do not carry tenant ownership. Session routing, authorization, atomic append, persistence, record-sequence consistency and conversion into model-provider requests belong to consumers. `tool_internal` content must remain invisible to the model and is excluded from outbound requests. Node `>=24.18.0 <25` is required.

## Development

```sh
pnpm --filter @omne-harness-lite/messages run build
pnpm --filter @omne-harness-lite/messages run typecheck
pnpm --filter @omne-harness-lite/messages run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.

The default entry and Schema use `data.messages/v6`. A dispatched record must carry the complete `profileSnapshot.inputConstraints` and `profileSnapshot.upstreamInputLimits` objects. `brandRecord` and `validate` check shape only; `judgeModelInvocationRecord` additionally checks the complete binding and actual parameter disposition. The snapshot receiver does not rerun the profile writer's cross-field cap comparison. Old record shapes fail at the current entry, without data rewriting. `./schema/v2` and `./schema/v3` remain exact Schema resources for current transitive specification references, without executable old codecs.
