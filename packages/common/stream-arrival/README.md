# @omne-harness/stream-arrival

[中文](README_ZH.md)

One step of a streaming delivery. The steps are open, fill, close, trim, and finish.

## Responsibility and status

A step belongs to one streaming delivery. It is not an inbound intake and it is not a Cordis dispatch. The code that sends a request and the code that runs a tool keep their own behavior and consume this vocabulary.

The package does not assign indexes, store a log, or carry usage and cost bodies. `judgeStreamArrival` checks that one step name and one index are present. It does not order steps. `assembleStream` folds one target's steps into a live assembly or an ended terminal. Index, repeat, and continuation rules are in Contracts. It does not reorder.

The [public observation contract](#public-observation-contract) is an adopted extension under [#682 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/682#issuecomment-6370514518). Its references, cursors, frames, and observation ports are not implemented or exported yet. The existing arrival and assembly contracts remain in force.

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

An open head has `kind`, `id`, and `visibility`. A `tool_call` head also has `callId`, which is not empty, and `name`, which is any string and may be empty. A `tool_result` head also has `callId`. A `reasoning_state` head has only `kind`, `id`, and `visibility`. A voice or image head may have `mediaType`, and a file head may have `storage`, `key`, and `mediaType`. These keys come from `CONTENT_BLOCK_HEAD_KEYS` of content-block, and their values must be text. A head has no body field, and its `kind` is never a variant name. `judgeBlockIdentity` of content-block judges `id` and `visibility`, and the head keeps the `visibility` that it returns. A head that breaks a rule is `step`. `detail` is `json` (an accessor, a non-enumerable key, or a prototype that is not plain), `kind`, `extra` (an unknown key, a body field, a key of another kind, or an unknown key inside `visibility`), `id`, `visibility`, or the name of a text key. The head is judged before it is copied, so a deep value in a head is refused at its key and does not throw.

`close` may include `block`. `judgePart` of message judges the block before the step is looked at. A refusal is `block`, and `detail` is the rejection of `judgePart`. Absent means the head and the accumulated text are sealed. The sealed part must equal the head in every key: `kind`, `id`, `visibility`, and each text key (`callId`, `name`, `mediaType`, `storage`, `key`). Any difference is `conflict`. If its text or inline body disagrees with the accumulated text, the rejection is `conflict`. In each of these cases the previous assembly stays.

An explicit whole image, voice, or file block has one body-matching exception. In replace mode, it can close without matching the initial empty body if no fill was ever accepted. This permits inline images and closed media references. Every kind, identity, visibility, and declared head field must still match. Reference fields remain subject to `judgePart`. A head mediaType is not reinterpreted as ref.mediaType. Any accepted fill, including an empty fill or a later replacement with empty text, disables the exception. Append mode, text, thinking, and tool calls retain their body rules. A reference does not prove content availability or access permission. The assembler does not load media.

A `tool_call` closes only with an explicit block that holds a whole `tool_call`. A close without `block` is `block`, and `detail` is one of `callId`, `name`, `arguments`, taken from `judgePart`. A head always has a `callId` that is not empty, so the details that arrive are `name` (an empty name) and `arguments` (the accumulated text is not a value tree). This package does not compare `arguments` with the accumulated text: the settling side of the stream checks that. A `tool_call` block can also close with a `tool_call_unparsed` part. That is the one case where the kind differs from the head. The other keys must equal the head and `raw` must equal the accumulated text, or the rejection is `conflict`. A `tool_call_incomplete` part is never sealed: the rejection is `block` with `detail` `incomplete` on a `tool_call` head, and `conflict` on a head of another kind. On a head of another kind, a `tool_call_unparsed` part is `conflict` too. A `tool_call` block that has a trim record cannot close as a `tool_call` or as a `tool_call_unparsed`: the rejection is `block` with `detail` `trimmed`. The text that is left may decode, but that does not show that the model had finished. A `trim` reaches an open block only. A `trim` on a closed block is `closed`, the same as a `fill`, so a sealed part never gains a trim record.

The terminal of a `stopped`, `cancelled`, or `failed` end holds the closed parts and the trim records only, and it is not judged as a message. A `tool_call` that is still open is not in it. `finish` is `open` while a block is open. The settling side of the stream takes the closed parts, adds the incomplete call parts that it makes, and judges the whole message itself. `tool_result` has no append form, so a marker arrives as one whole block.

[STREAM-T01](../../../docs/architecture/runtime/streaming-and-consumption.md#stream-t01) covers the `reasoning_state` part and `finish.replay`. A `reasoning_state` part has no append form either, and it only arrives whole: an open in replace mode, then a close that carries the whole part. An open in append mode is `mode`, and a fill between the open and the close is `mode`, the same as for `tool_result`. A close without `block` is `block` with `detail` `payload`, because the head has no payload. `judgePart` of message judges the part, so a part that has `toHuman` true, an empty payload, or bad `pairs` is `block` with the rejection of `judgePart` as `detail`. The sealed part must equal the head in `id` and `visibility`, and a part of another kind is `conflict`. The head holds no other key.

`finish` may carry `replay: { scope, format }`, and no other key. A `replay` whose value is `undefined` counts as no `replay`, as in `judgeMessage`. `replay` must be a plain object whose own keys are exactly `scope` and `format`, with no accessor, and both values are text. Any other shape is `step` with `detail` `replay`, and the previous assembly stays. Whether the text is empty or too long is a rule of message, so it is judged when the message is made. When `finish` is accepted, the assembly writes `at` itself: the positions of the `reasoning_state` parts among the sealed parts, in order. It passes `{ id, role, blocks, replay: { scope, format, at } }` to `judgeMessage`. Without `replay` on the `finish` it passes `{ id, role, blocks }` only, and a message that has a state part is then `block` with `detail` `replay`. A message that has `thinking` and no state part may carry `replay`, and its `at` is empty. `judgeMessage` refuses a message that has neither as `block` with `detail` `replay`. It refuses a `replay` on a target that is not an assistant message as `block` with `detail` `extra`. A `stopped`, `cancelled`, or `failed` terminal keeps only the sealed parts, so the settling side writes `replay` itself when it makes the message. Usage and cost are not in `replay` or in any step.

## Public observation contract

This extension carries producer-confirmed projections. It does not replace arrival steps or interpret Model and Tool state machines. The common package imports neither domain. Each producer owns its snapshot, delta, and producer-specific observation end value. Model owns its [projection and current target](../../model/model-contract/SPEC.md#公共内容观察与当前目标).

### References and cursors

StreamProducer distinguishes model and tool. StreamId, StreamRef, and StreamCursor are opaque text identities. A reference binds the producer, the original producer call's canonical reference text, and one published stream identity. Its canonical encoding is versioned. A new dispatch or publication generation uses a new stream identity. An old reference never redirects to a successor.

The envelope parser only selects a route. Reference validation checks the producer before delegating the call text to that producer's original codec. The codec validates the explicit tenant and returns canonical call text. The common layer does not redefine tenant, call, or admission. Validation distinguishes an invalid envelope, wrong producer, malformed call reference, and foreign tenant. Successful parsing proves neither existence nor current permission.

A cursor binds the complete reference and a monotonic position within that stream. Cursor validation distinguishes invalid text from a cursor for another stream. Positions from different streams have no shared order. The producer advances the cursor for every confirmed projection change, including state changes without new content.

### Frames and identity

All frames use the `kind` discriminant. The adopted frame vocabulary has these branches:

| Frame | Meaning |
| --- | --- |
| snapshot | A confirmed projection value and its cursor |
| delta | A change value, its starting cursor `from`, and its ending cursor `cursor` |
| gap | Lost continuity, with the last cursor `after` or null, and reason buffer or source-history |
| ended | This observation ended, with a standard reason or a producer-specific end value |

A snapshot's identity is its reference and cursor. A delta's identity is its reference, from, and cursor. Identical identities require identical content. Deltas C10 to C12 and C11 to C12 may have different values. Producers may combine confirmed changes, but each delta starts at the last cursor delivered to that observer.

The standard ended reasons are source-closed, observer-closed, stale-stream, denied, unavailable, and capacity. Source-closed means that the source stream will not change again. It does not establish business completion. Producer-specific termination uses reason producer-ended and a typed value owned by that producer. StreamFrame and StreamObserver carry that value through the additional generic parameter E, defaulting to never. This branch carries a public producer end value, never a raw exception, Error object, or arbitrary log text. Common consumers end the observation without inferring stronger business facts from that value.

The common layer does not enumerate Tool reasons or reinterpret its closed reason as a permanently unchanging source. A producer adapter preserves the meaning of its own public reasons. Producer-specific values obey the same byte limits and disclosure checks as other frames. Model may use E=never when standard reasons suffice. Tool's concrete end alias and adapter remain owned by Tool.

### Snapshot and subscription boundary

An observer first receives a confirmed snapshot, or an explicit end if the observation cannot start. The producer obtains snapshot C and registers the subscription for changes after C within one critical section. Reading a snapshot before an ordinary subscribe is insufficient because it can miss a confirmed change between them. Model publishes only after its save is confirmed.

The observation request does not provide an after cursor for replay. After a gap or disconnection, the consumer requests a new current snapshot. The protocol promises neither durable delta replay nor every upstream chunk. A gap or ended frame is final. EOF without either frame is a connection failure, not a successful observation end.

### Disclosure, capacity, and close

Before each actual frame output, the source checks current permission, tenant, stream binding, and publication generation. If data preparation waits, the source checks again after preparation. The final integration output boundary checks its own disclosure permission too. Queued content and an earlier permission check do not authorize later output. Revocation removes the subscription, clears queued data, and ends with denied. Already disclosed content cannot be recalled.

Providers declare finite limits for snapshot bytes, delta bytes, each observer's queued frames and bytes, observers per tenant, total memory, and queue residence time. Normative bytes use UTF-8 JSON with recursively sorted object keys, ordered arrays, and JSON string escaping. These limits do not measure actual heap overhead, which the provider bounds separately.

When a queue limit is reached, the producer first removes the subscription and discards pending data, then emits one terminal gap. It cannot drop intermediate data and continue. An oversized snapshot ends with capacity. Limits also cover producer-specific end values.

Abort and iterator return remove only this observation. They do not cancel producer work, acknowledge a result, or authorize result release. A business terminal and an observation end are separate facts.

### Delivery and verification boundary

The public observation ports must import Access from the public identity owner's sole entry. Candidate identity declarations must not be copied here. Those ports require an adopted, available identity contract and a verified consumer declaration closure. The pure reference and cursor work does not establish an available observation service.

Conformance scenarios cover a commit between snapshot and registration, a state-only update, wrong producer or tenant, a foreign-stream cursor, and revocation after queuing. They also cover different from cursors with one ending cursor, a slow reader, an oversized snapshot, and EOF without a terminal frame. Pure codec tests and controlled observers cannot prove a real producer's atomic subscription boundary or actual disclosure checks. Runtime publication, identity integration, consumer refresh, and real adapters require their owners' integration evidence.

## Design

`src/index.ts` owns the step list, `judgeStreamArrival`, and `assembleStream`.

## Configuration and operation

The package reads no environment. The emitting runtime assigns the index.

## Verification

`pnpm --filter @omne-harness/stream-arrival test` runs `tests/public-entry.spec.ts`, `tests/assembly.spec.ts`, `tests/tool-call.spec.ts`, `tests/head-and-trim.spec.ts`, and `tests/reasoning-replay.spec.ts`. Those files are the unit tests and the contract tests. They check the step names, index rejection, and the assembly terminals, including a repeated delivery, a truncated delivery, a late step, and a caller cancel. `tool-call.spec.ts` checks the closed head, the rules of the explicit close, the two call variants, the trim rule, deep values, and the step fingerprint. `reasoning-replay.spec.ts` checks the whole arrival of a `reasoning_state` part, the refusals of its open, fill, and close, the `replay` of a `finish`, and the `replay.at` of the finished message. `head-and-trim.spec.ts` checks a non-enumerable head key, a head that reports a key without a descriptor, a `tool_result` head without `callId`, a voice or image head without `mediaType`, a sealed part that adds a text key the head left out, a `tool_call_unparsed` close on a head of another kind, a trimmed `tool_call` closed with a text block, and a trim on an index that was never opened. They use the real message, content-block, and json-text packages. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Execution facts stay with the code that sends and runs. The settling side of a stream makes the incomplete call parts, and this package does not.
