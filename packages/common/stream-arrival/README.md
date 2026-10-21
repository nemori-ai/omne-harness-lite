# @omne-harness/stream-arrival

[中文](README_ZH.md)

One step of a streaming delivery. The steps are open, fill, close, trim, and finish.

## Responsibility and status

A step belongs to one streaming delivery. It is not an inbound intake and it is not a Cordis dispatch. The code that sends a request and the code that runs a tool keep their own behavior and consume this vocabulary.

The package does not assign indexes, store a log, or carry usage and cost bodies. `judgeStreamArrival` checks that one step name and one index are present. It does not order steps. `assembleStream` folds one target's steps into a live assembly or an ended terminal. Index, repeat, and continuation rules are in Contracts. It does not reorder.

## Usage

```ts
import { assembleStream, judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'finish', index: '9' })

assembleStream({
  target: { id: 'msg_abcdefghijklmnopqrstuv', role: 'assistant' },
  steps: [
    {
      step: 'open',
      index: '0',
      mode: 'append',
      head: { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true } },
    },
    { step: 'fill', index: '0', seq: '0', chunk: 'hello' },
    { step: 'fill', index: '0', seq: '1', chunk: 'hello' },
    { step: 'close', index: '0' },
    { step: 'finish', index: '0' },
  ],
})
```

A caller cancel is `end: { kind: 'cancelled' }`. It is not a step. Disconnecting an observer adds no step and no `end`.

There is no Cordis entry.

## Contracts

`STREAM_ARRIVAL_STEPS` is `open`, `fill`, `close`, `trim`, `finish`. `judgeStreamArrival` returns `{ rejected: 'step' }` for any other step name, including `event`. A missing index is `{ rejected: 'index' }`. The judge reads `{ step, index }` only.

`assembleStream` returns `{ ok }` or `{ rejected, at, assembly }`. `ok.phase` is `live` or `ended`. An ended assembly has `terminal`. `terminal.kind` is `complete`, `truncated`, `failed`, or `cancelled`. Only `complete` carries a `message`.

`index` is a decimal non-negative integer assigned by the runtime that emits that target. The scope is that one target. The first open may be any safe integer, including `8`. Each later open must be greater, and a gap is allowed. `seq` belongs to that block. The first fill must be `0`. The next fill must be one greater. A new gap or regression is `seq`.

A repeat is checked before order. The identity of a fill is the block index plus `seq`. Other steps use the step name plus the block index. `finish` has no index in its identity. The same identity and the same content is a no-op, and the text is not doubled. The same identity with different content is `conflict`, and a different `replay` (or a `replay` on one and none on the other) is different content. A different open is `index`.

`from` must be an earlier return for the same `id` and `role`. After a terminal, replaying an accepted step with the same content keeps that terminal. A new step is `late`. `assembleStream` copies `id`, `role`, and the head at admission. A later edit of the caller objects does not change a returned assembly. A hand-built `{ phase: 'live' }` is rejected. A `stopped` end is a terminal even when no block has closed. A later close or finish is `late`. A step that has a block, and a head, is judged before it is copied, as the next paragraphs say.

An open head has `kind`, `id`, and `visibility`. A `tool_call` head also has `callId`, which is not empty, and `name`, which is any string and may be empty. A `tool_result` head also has `callId`. A `reasoning_state` head has the three identity keys only. A voice or image head may have `mediaType`, and a file head may have `storage`, `key`, and `mediaType`. These keys come from `CONTENT_BLOCK_HEAD_KEYS` of content-block, and their values must be text. A head has no body field, and its `kind` is never a variant name. `judgeBlockIdentity` of content-block judges `id` and `visibility`, and the head keeps the `visibility` that it returns. A head that breaks a rule is `step`. `detail` is `json` (an accessor, a non-enumerable key, or a prototype that is not plain), `kind`, `extra` (an unknown key, a body field, a key of another kind, or an unknown key inside `visibility`), `id`, `visibility`, or the name of a text key. The head is judged before it is copied, so a deep value in a head is refused at its key and does not throw.

`close` may include `block`. `judgePart` of message judges the block before the step is looked at. A refusal is `block`, and `detail` is the rejection of `judgePart`. Absent means the head and the accumulated text are sealed. The sealed part must equal the head in every key: `kind`, `id`, `visibility`, and each text key (`callId`, `name`, `mediaType`, `storage`, `key`). Any difference is `conflict`. If its text or inline body disagrees with the accumulated text, the rejection is `conflict`. In each of these cases the previous assembly stays.

An explicit whole image, voice, or file block has one body-matching exception. In replace mode, it can close without matching the initial empty body if no fill was ever accepted. This permits inline images and closed media references. Every kind, identity, visibility, and declared head field must still match. Reference fields remain subject to `judgePart`. A head mediaType is not reinterpreted as ref.mediaType. Any accepted fill, including an empty fill or a later replacement with empty text, disables the exception. Append mode, text, thinking, and tool calls retain their body rules. A reference does not prove content availability or access permission. The assembler does not load media.

A `tool_call` closes only with an explicit block that holds a whole `tool_call`. A close without `block` is `block`, and `detail` is one of `callId`, `name`, `arguments`, taken from `judgePart`. A head always has a `callId` that is not empty, so the details that arrive are `name` (an empty name) and `arguments` (the accumulated text is not a value tree). This package does not compare `arguments` with the accumulated text: the settling side of the stream checks that. A `tool_call` block can also close with a `tool_call_unparsed` part. That is the one case where the kind differs from the head. The other keys must equal the head and `raw` must equal the accumulated text, or the rejection is `conflict`. A `tool_call_incomplete` part is never sealed: the rejection is `block` with `detail` `incomplete` on a `tool_call` head, and `conflict` on a head of another kind. On a head of another kind, a `tool_call_unparsed` part is `conflict` too. A `tool_call` block that has a trim record cannot close as a `tool_call` or as a `tool_call_unparsed`: the rejection is `block` with `detail` `trimmed`. The text that is left may decode, but that does not show that the model had finished. A `trim` reaches an open block only. A `trim` on a closed block is `closed`, the same as a `fill`, so a sealed part never gains a trim record.

The terminal of a `stopped`, `cancelled`, or `failed` end holds the closed parts and the trim records only, and it is not judged as a message. A `tool_call` that is still open is not in it. `finish` is `open` while a block is open. The settling side of the stream takes the closed parts, adds the incomplete call parts that it makes, and judges the whole message itself. `tool_result` has no append form, so a marker arrives as one whole block.

A `reasoning_state` part has no append form either, and it only arrives whole: an open in replace mode, then a close that carries the whole part. An open in append mode is `mode`, and a fill between the open and the close is `mode`, the same as for `tool_result`. A close without `block` is `block` with `detail` `payload`, because the head has no payload. `judgePart` of message judges the part, so a part that has `toHuman` true, an empty payload, or bad `pairs` is `block` with the rejection of `judgePart` as `detail`. The sealed part must equal the head in `id` and `visibility`, and a part of another kind is `conflict`. The head holds no other key.

`finish` may carry `replay: { scope, format }`, and no other key. A `replay` whose value is `undefined` counts as no `replay`, as in `judgeMessage`. `replay` must be a plain object whose own keys are exactly `scope` and `format`, with no accessor, and both values are text. Any other shape is `step` with `detail` `replay`, and the previous assembly stays. Whether the text is empty or too long is a rule of message, so it is judged when the message is made. When `finish` is accepted, the assembly writes `at` itself: the positions of the `reasoning_state` parts among the sealed parts, in order. It passes `{ id, role, blocks, replay: { scope, format, at } }` to `judgeMessage`. Without `replay` on the `finish` it passes `{ id, role, blocks }` only, and a message that has a state part is then `block` with `detail` `replay`. A message that has `thinking` and no state part may carry `replay`, and its `at` is empty. A message that has neither, and a `replay` on a target that is not an assistant message, are refused by `judgeMessage` as `block` with `detail` `replay` and `extra`. A `stopped`, `cancelled`, or `failed` terminal keeps only the sealed parts, so the settling side writes `replay` itself when it makes the message. Usage and cost are not in `replay` or in any step.

## Design

`src/index.ts` owns the step list, `judgeStreamArrival`, and `assembleStream`.

## Configuration and operation

The package reads no environment. The emitting runtime assigns the index.

## Verification

`pnpm --filter @omne-harness/stream-arrival test` runs `tests/public-entry.spec.ts`, `tests/assembly.spec.ts`, `tests/tool-call.spec.ts`, `tests/head-and-trim.spec.ts`, and `tests/reasoning-replay.spec.ts`. Those files are the unit tests and the contract tests. They check the step names, index rejection, and the assembly terminals, including a repeated delivery, a truncated delivery, a late step, and a caller cancel. `tool-call.spec.ts` checks the closed head, the rules of the explicit close, the two call variants, the trim rule, deep values, and the step fingerprint. `reasoning-replay.spec.ts` checks the whole arrival of a `reasoning_state` part, the refusals of its open, fill, and close, the `replay` of a `finish`, and the `replay.at` of the finished message. `head-and-trim.spec.ts` checks a non-enumerable head key, a head that reports a key without a descriptor, a `tool_result` head without `callId`, a voice or image head without `mediaType`, a sealed part that adds a text key the head left out, a `tool_call_unparsed` close on a head of another kind, a trimmed `tool_call` closed with a text block, and a trim on an index that was never opened. They use the real message, content-block, and json-text packages. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Execution facts stay with the code that sends and runs. The settling side of a stream makes the incomplete call parts, and this package does not.
