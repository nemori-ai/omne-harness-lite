# @omne-harness/stream-arrival

[中文](README_ZH.md)

One step of a streaming delivery. The steps are open, fill, close, trim, and finish.

## Responsibility and status

A step belongs to one streaming delivery. It is not an inbound intake and it is not a Cordis dispatch. The code that sends a request and the code that runs a tool keep their own behavior and consume this vocabulary.

The package does not assign indexes, store a log, or carry usage and cost bodies. `judgeStreamArrival` checks that one step name and one index are present. It does not order steps. `assembleStream` folds one target's steps into a live assembly or an ended terminal. Index, repeat, and continuation rules are in Contracts. It does not reorder.

The [public observation contract](#public-observation-contract) is an adopted extension under [#682 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/682#issuecomment-6370514518). Its pure reference and cursor operations are exported from the root entry. The root entry also exports the StreamFrame and StreamObserver declarations from [stream-observation.ts](src/stream-observation.ts). Stateful conformance fixtures remain private to tests; these exports do not supply a production observer. The existing arrival and assembly contracts remain in force.

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

`StreamProducer` is `model` or `tool`. `StreamId`, `StreamPosition`, `StreamRef`, and `StreamCursor` are distinct branded text values. Objects and arrays in these pure values are readonly. The common layer consumes `TenantId` and `tenantCodec` from `@omne-harness/legal-identity`, and `Outcome` from `@omne-harness/operation-result`. It imports neither Model nor Tool.

A reference binds the producer, the original invocation's canonical call text, and one published stream identity. The producer chooses the stream text before validation. The helpers allocate no random identity. One `StreamId` within an invocation identifies only one dispatch, publication generation, and projection version. Each new dispatch or publication generation uses a new `StreamId`. An old reference never redirects to a successor. A brand proves neither uniqueness, existence, provenance, nor current permission.

A cursor binds the complete reference and a monotonic position within that stream. Positions from different streams have no shared order. The producer advances the public cursor for every confirmed projection change, including state changes without new content.

#### Canonical text and limits

The canonical representations and limits are fixed below. Lengths count UTF-16 code units.

| Value or boundary | Canonical text or limit |
| --- | --- |
| `StreamId` | `str_` followed by at least one `[A-Za-z0-9_-]`, at most 256 code units |
| `StreamPosition` | `0` or `[1-9][0-9]*`, at most 256 code units |
| `StreamRef` | `JSON.stringify(['stream-ref', 1, producer, canonicalCallText, stream])` |
| `StreamCursor` | `JSON.stringify(['stream-cursor', 1, canonicalRefText, position])` |
| Call text input and codec success output | Nonempty, at most `STREAM_CALL_MAX_LENGTH = 1668` code units |
| Reference text input and canonical output | At most `STREAM_REFERENCE_MAX_LENGTH = 4096` code units |
| Cursor text input and canonical output | At most `STREAM_CURSOR_MAX_LENGTH = 8192` code units |

The identity and position constants are `STREAM_ID_MAX_LENGTH = 256` and `STREAM_POSITION_MAX_LENGTH = 256`. A value at its limit proceeds to the next check. A value one code unit over its limit fails with `length` before JSON parsing. These are text parsing limits. Message, queue, tenant capacity, throughput, and actual memory limits remain separate obligations.

The call limit covers the current Tool limit of 1668 and Model limit of 1024. The current largest canonical Tool invocation has length 1154. With two quote-only identities of length 256 and a `StreamId` of length 256, the canonical reference has length 2487. A position of length 256 makes its canonical cursor length 4872. Producer identity limits must be checked again before they expand. Valid identities must not be truncated to fit these boundaries.

Canonical output has no BOM, insignificant whitespace, or trailing newline. Persistent bytes are the UTF-8 encoding of that text. JSON string escaping follows ECMAScript `JSON.stringify`. Tuple order and domain case are fixed. The version is the JSON number `1`. The string `"1"` fails. No Unicode normalization, case folding, trimming of identity fields, or percent encoding occurs.

Reference input may contain JSON whitespace outside the tuple and equivalent JSON string escapes within the input limit. The original call codec normalizes the call. The result uses the canonical tuple again. Stream identities and positions are not rewritten. Positions such as `01`, `+1`, `1.0`, and `1e3`, numeric values, negative values, and empty values fail. Position comparison first compares decimal text lengths, then equal-length digit text. It never converts to a JavaScript number.

A cursor's embedded reference must be the complete canonical reference text. `judgeStreamCursor` compares that text with its already validated target reference, code unit by code unit. Any difference returns `foreign-stream`, including an equivalent reference with noncanonical whitespace. Only the cursor's outer JSON whitespace and equivalent string escapes are normalized. Cursor validation neither calls a producer codec nor creates another call parser.

#### Pure operations and failure values

All operations are synchronous and exported from the root entry. The table describes their inputs and outputs. Exact public declarations belong to [src/stream-reference.ts](src/stream-reference.ts), rather than a second signature inventory here.

| Operation | Input | Success value |
| --- | --- | --- |
| `decodeStreamId` | One unknown value | `StreamId` |
| `decodeStreamPosition` | One unknown value | `StreamPosition` |
| `parseStreamEnvelope` | One unknown reference text | Frozen `{ producer, call, stream }`, without a `StreamRef` brand |
| `encodeStreamRef` | `{ tenant, producer, call, stream }` and a producer call codec | Canonical `StreamRef` |
| `judgeStreamRef` | `{ value, tenant }` and a producer call codec | Canonical `StreamRef` |
| `readStreamRef` | Validated `StreamRef` | Frozen `{ producer, call, stream }` |
| `encodeStreamCursor` | `{ ref, position }` | Canonical `StreamCursor` |
| `judgeStreamCursor` | `{ value, ref }` with a validated target reference | Canonical `StreamCursor` |
| `readStreamCursor` | Validated `StreamCursor` | Frozen `{ ref, position }` |
| `compareStreamPositions` | Two validated positions, left then right | `-1`, `0`, or `1` |

The decode, parse, encode, and judge operations return `Outcome`. A `StreamValueRejection` has `field` and `reason`. The field is `StreamId`, `StreamPosition`, `StreamRef`, or `StreamCursor`. Reasons are `type`, `length`, `syntax`, `domain`, `version`, `shape`, `producer`, `identity`, `position`, and `unreadable`.

The identity and position decoders, and the envelope parser, return that rejection directly. A reference failure is `invalid-envelope` with `rejection`, `wrong-producer`, `malformed`, `invalid-tenant`, or `foreign-tenant`. A cursor failure is `invalid` with `rejection`, or `foreign-stream`. Call codecs expose `producer` and `resolve({ text, tenant })`. The resolver returns canonical call text, or `malformed`, `invalid-tenant`, or `foreign-tenant` through `Outcome`.

Checks occur in the following order. The first failure wins.

1. `decodeStreamId` checks string type, nonempty length and upper limit, then lexical form. Failures are `type`, `length`, then `identity`. `decodeStreamPosition` uses the same order, with `position` for lexical failure. Each rejection names the decoder's own field.
2. `parseStreamEnvelope` checks string type, nonempty length and the reference limit, JSON syntax, array shape, domain, version, exact tuple length of five, producer, call, then stream. Every rejection has field `StreamRef`. A non-array or wrong tuple length is `shape`. Producer must be `model` or `tool`, otherwise the reason is `producer`. A nonstring call is `shape`. An empty or oversized call is `length`. Invalid stream text is `identity`. Extra tuple elements are not ignored. Success freezes the envelope but only supplies routing values.
3. `judgeStreamRef` first checks the tenant's minted identity through `tenantCodec.encode`, returning `invalid-tenant` on failure. It then parses the envelope, wrapping a rejection as `invalid-envelope`. Next it compares the envelope producer with `codec.producer`. A mismatch returns `wrong-producer` without calling `resolve`. Finally it calls `resolve`, preserving the three call failure kinds. Success encodes the canonical reference again. An oversized canonical output is `invalid-envelope` with reason `length`.
4. `encodeStreamRef` first captures an exact data record with the keys `tenant`, `producer`, `call`, and `stream`. Each key must be an own, enumerable data property. Only `Object.prototype` and null prototypes are allowed. The operation never calls getters, `toJSON`, or conversion functions. Reflection failure is `invalid-envelope` with reason `unreadable`. Other invalid record shapes use `shape`. After capture, it checks the tenant, envelope field values, producer, original call codec, and canonical output as above. It does not freeze the caller's record.
5. `encodeStreamCursor` captures an exact `ref` and `position` data record under the same descriptor and prototype rules. Record failures use `invalid` with field `StreamCursor`. It accepts an already validated canonical reference brand and checks position lexical form again. An invalid position uses reason `position`. It encodes the fixed cursor tuple and applies the cursor output limit. A forged reference brand is a programming error, not proof of original call validation.
6. `judgeStreamCursor` checks raw string type, nonempty length and the cursor limit, JSON syntax, array shape, domain, version, exact tuple length of four, embedded reference, then position. Every rejection has field `StreamCursor`. A nonstring embedded reference is `shape`. An empty or oversized embedded reference is `length`. Invalid position is `position`. It completes these structural checks before comparing the embedded reference with the target. A mismatch is `foreign-stream`. Success returns canonical cursor text.

The judge parameter containers and call codecs are typed injected dependencies. They are not unknown serialized object graphs. The descriptor rules apply only to the two encode records. Unknown text operations do not inspect object properties. A codec is an owner-supplied pure function. Codec implementation errors propagate rather than becoming `malformed`. A success output that is not a string, is empty, or exceeds 1668 code units is a codec implementation error.

`judgeStreamRef` is the reference decode boundary. There is no alternate `decodeStreamRef` that bypasses tenant and producer validation. Read operations accept only branded values from the validated boundaries. They neither check current permission nor call the producer codec again. An unreadable forged brand throws a generic `TypeError` without the input text. All object results of parsing and reading are frozen. Caller inputs remain unfrozen and unchanged.

Each producer owns its adapter to the original call codec. Model resolves with `resolveModelInvocationRef(text, tenant)`, then encodes with `encodeModelInvocationRef(parts)`. Tool uses its corresponding `resolveToolInvocationRef` and `encodeToolInvocationRef`. The adapter maps a detailed malformed-call rejection to `malformed`, and preserves `invalid-tenant` and `foreign-tenant`. The common tenant check precedes Tool's codec, so Tool's internal treatment of an unminted tenant as foreign does not change the public result. A test callback without original codec validation is not an identity adapter. Tool's concrete adapter remains a Tool obligation.

#### Fixed codec examples

These generation expressions define canonical text, without randomness or environment-dependent data.

```js
const tenantText = '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}'
const call = JSON.stringify(['model-invocation', 1, tenantText, 'mcall_a', 'mop_a'])
const ref = JSON.stringify(['stream-ref', 1, 'model', call, 'str_a'])
const c0 = JSON.stringify(['stream-cursor', 1, ref, '0'])
const c10 = JSON.stringify(['stream-cursor', 1, ref, '10'])
```

With the matching minted tenant and Model codec, reading `ref` returns `{ producer: 'model', call, stream: 'str_a' }`. Reading `c10` returns `{ ref, position: '10' }`. Adding one outer space at each end before judging returns the same canonical value. Comparing `9` with `10`, or `9007199254740992` with `9007199254740993`, returns `-1`.

The fixed refusal cases have the following results.

| Change to the example | Result |
| --- | --- |
| Reference domain becomes `stream-cursor` | `invalid-envelope`, reason `domain` |
| Reference version becomes the string `"1"` | `invalid-envelope`, reason `version` |
| Reference gains a sixth null item | `invalid-envelope`, reason `shape` |
| Producer becomes `tool` with the Model codec | `wrong-producer`, with no codec call |
| Model producer contains a valid Tool invocation | `malformed` |
| A same-shaped unminted tenant is supplied | `invalid-tenant`, with no codec call |
| Another account's minted tenant is supplied | `foreign-tenant` |
| Stream is `str_` | Reason `identity` |
| Position is `01`, or cursor position is the number zero | Reason `position` |
| Cursor embeds a reference with stream `str_b` | `foreign-stream` |
| Cursor embeds a reference with an initial space | `foreign-stream` |
| Reference has 4097 code units, or cursor has 8193 | Reason `length`, before JSON parsing |
| A standalone position contains 256 nines | Success, while 257 nines fails with `length` |

Codec verification uses minted tenants and the producers' original codecs. It covers the fixed vectors, each check's precedence, normalization, limits, and frozen read results. The maximum-length case obtains Tool call text from its original encoder with two quote-only identities of length 256. It then constructs `JSON.stringify(['stream-ref', 1, 'tool', call, 'str_' + 'a'.repeat(252)])` and `JSON.stringify(['stream-cursor', 1, ref, '9'.repeat(256)])`. Their lengths must remain 1154, 2487, and 4872 for call, reference, and cursor. Type checks reject interchange between the four brands and reject a bare string in their place. These checks do not prove real publication or permission.

### Frames and identity

`StreamObserver<P,S,D,E=never>.observe` accepts one readonly input with `ref`, `access`, and `signal`. Their types are `StreamRef`, the public `Access<P>`, and `AbortSignal`. It returns `AsyncIterable<StreamFrame<S,D,E>>`. The input has no `after` field. The observer imports `Access` directly from the root entry of `@omne-harness/legal-identity`. That type does not prove that the principal is trusted or authorized.

All frames use the `kind` discriminant. The adopted frame vocabulary has these branches:

| Frame | Meaning |
| --- | --- |
| snapshot | `cursor` and `value: S`, the confirmed projection |
| delta | `value: D`, the starting cursor `from`, and the ending cursor `cursor` |
| gap | The last delivered cursor `after`, or null, and `reason` of buffer or source-history |
| ended | A standard `reason`, or `reason: producer-ended` with `value: E` |

A snapshot's identity is its reference and cursor. A delta's identity is its reference, from, and cursor. Identical identities require identical content. Deltas C10 to C12 and C11 to C12 may have different values. Producers may combine confirmed changes, but each delta starts at the last cursor delivered to that observer.

The standard ended reasons are source-closed, observer-closed, stale-stream, denied, unavailable, and capacity. Source-closed means that the source stream will not change again. It does not establish business completion. Producer-specific termination uses reason producer-ended and a typed value owned by that producer. StreamFrame and StreamObserver carry that value through the additional generic parameter E, defaulting to never. This branch carries a public producer end value, never a raw exception, Error object, or arbitrary log text. Common consumers end the observation without inferring stronger business facts from that value.

The common layer does not enumerate Tool reasons or reinterpret its closed reason as a permanently unchanging source. A producer adapter preserves the meaning of its own public reasons. Producer-specific values obey the same byte limits and disclosure checks as other frames. Model may use E=never when standard reasons suffice. Tool's concrete end alias and adapter remain owned by Tool.

### Snapshot and subscription boundary

An observer first receives a confirmed snapshot, or an explicit end if the observation cannot start. The producer obtains snapshot C and registers the subscription for changes after C within one critical section. Reading a snapshot before an ordinary subscribe is insufficient because it can miss a confirmed change between them. Model publishes only after its save is confirmed.

The observation request does not provide an after cursor for replay. After a gap or disconnection, the consumer requests a new current snapshot. The protocol promises neither durable delta replay nor every upstream chunk. An emitted gap or ended frame is final. EOF without either frame is a connection failure, not a successful observation end.

### Disclosure, capacity, and close

Before each actual frame output, including a held terminal frame, the source runs the pre-output checks: current permission, tenant, stream binding, and publication generation. If data preparation waits, the source checks again after preparation. The final integration output boundary checks its own disclosure permission too. Queued content and an earlier permission check do not authorize later output. Revocation removes the subscription, clears queued data, and ends with denied. Already disclosed content cannot be recalled.

Providers declare finite limits for snapshot bytes, delta bytes, each observer's queued frames and bytes, observers per tenant, total memory, and queue residence time. Normative bytes use UTF-8 JSON with recursively sorted object keys, ordered arrays, and JSON string escaping. These limits do not measure actual heap overhead, which the provider bounds separately.

A queue overflow occurs when adding a frame would exceed a queue count or byte limit. It also occurs when a queued item reaches its residence deadline. On overflow, the producer removes the subscription and discards pending data. It then holds one terminal gap for output. It cannot drop intermediate data and continue. An oversized snapshot ends with capacity. Limits also cover producer-specific end values.

Abort and iterator return remove only this observation. They do not cancel producer work, acknowledge a result, or authorize result release. A business terminal and an observation end are separate facts.

### Limit comparisons

Count and byte limits are inclusive maxima. Check the proposed occupancy before allocating or enqueueing; exceeding the limit and then reclaiming resources does not meet this bound. A queued frame, snapshot, delta, or producer-ended frame is oversized only when its measured value exceeds the limit. When the observer count already equals its maximum, a new observation fails admission without evicting existing observers. A queued item's residence deadline expires when elapsed time is greater than or equal to the configured duration. No content is delivered from that item at expiry.

### Failure order and iterator completion

An unminted tenant, a foreign tenant, or denied current permission ends with denied. Unreadable public reference syntax ends with stale-stream without a target lookup. After tenant and syntax checks, permission must allow the request before target lookup. An unavailable permission source ends with unavailable, even when the target is stale.

The syntax check is the envelope parse. An `invalid-envelope` failure from the envelope parse ends with stale-stream before permission. The `wrong-producer` and `malformed` failures, and an `invalid-envelope` from the canonical output limit, are target checks. For example, the pure functions return `malformed` for a reference whose producer is model and whose call text is a valid Tool invocation. The source decides these three failures after permission and ends with stale-stream. Before permission, the source discloses only the tenant result and the envelope result.

Once permission allows the request, a wrong producer, an unknown same-tenant mapping, or a retired publication ends with stale-stream. An unavailable target source ends with unavailable. These checks precede capacity checks and ordinary content. Each actual output repeats the pre-output checks. An already emitted terminal frame is final and cannot acquire a second terminal reason.

A held terminal frame, one that is not yet emitted, is not final. Before output, the source runs the pre-output checks on it. When a check fails, the source emits denied, unavailable, or stale-stream instead of the held frame. A later source-closed or producer-ended end, or a source-history gap, does not replace a held terminal frame.

Queue frame, byte, or residence overflow first removes the subscription and clears pending data. It holds one terminal gap with reason buffer and the last delivered cursor. That gap still goes through the pre-output checks before output. An oversized snapshot ends with capacity. An oversized delta ends with gap(buffer). Observer admission failure due to observer count or total resources ends with capacity. Providers bound actual heap separately from normative bytes.

After abort, the observer emits no further content. If the iterator remains open, it terminates with observer-closed. A held terminal frame yields to observer-closed. Before output, the source runs the pre-output checks on that end. When a check fails, the source emits denied, unavailable, or stale-stream instead of observer-closed.

A pending next receives the terminal frame that the source emits, unless return already closed the iterator. Return resolves pending and future next calls as done. Both operations immediately detach and clear queues. Neither operation cancels business work or acknowledges custody.

A dependency exception that prevents a conforming end remains a connection failure through throw or EOF. It cannot become a successful end or a producer-ended value. Producer end limits measure the complete producer-ended frame with the same canonical UTF-8 JSON encoding. After permission allows output, the source removes this subscription for an oversized producer end, discards its pending end value, and then holds a standard ended(capacity) for output. It does not truncate E, delete producer facts, or establish business completion. Denied, unavailable, or stale-stream from a failed pre-output check takes precedence. The source holds an earlier terminal gap, and that gap still goes through the pre-output checks.

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

The public-entry tests in [`tests/stream-reference.spec.ts`](tests/stream-reference.spec.ts) and [`tests/stream-reference.spec-d.ts`](tests/stream-reference.spec-d.ts) check the reference/cursor codecs, brands, failure order, exact data records, tenant minting, canonical text, limits, and cursor scope. They use the real tenant codec and an explicit call-codec substitute. They do not prove a Model or Tool adapter, current authorization, or a live observation service.
