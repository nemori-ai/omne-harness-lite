# @omne-harness-lite/stream-assembly

[中文](README_ZH.md)

An immutable, pure stream assembler. Feed arrival events into caller-owned state to obtain snapshots and a final content/account settlement for model responses or tool frames. It does not call models, execute tools or perform I/O.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/stream-assembly": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Function                           | Result                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| `start(target: unknown)`           | `{ ok: AssemblyState }` or `{ rejected: 'malformed' }`          |
| `accept(state, event: unknown)`    | New state or a representation/sequence rejection                |
| `snapshot(state)`                  | `AssemblySnapshot` with block views and accepted-event position |
| `closeOut(state)`                  | `AssemblySettlement` or `stream_not_finished`                   |
| `abandon(state, reason?: unknown)` | Lost settlement or `malformed` / `event_after_finish`           |

`AssemblyState` is exported only as an opaque type; obtain it through `start`. Result, snapshot, settlement and rejection types are also public. The package has no separate Schema resource.

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Assemble text and settle a finished stream

```ts
import {
  start,
  accept,
  snapshot,
  closeOut,
  type AssemblyState,
} from '@omne-harness-lite/stream-assembly'

import { jsonNumberSource } from '@omne-harness-lite/content-blocks'

const initial = start({ kind: 'model_call', callId: 'model_call_1', dispatch: 1 })
if ('rejected' in initial) throw new Error(initial.rejected)
let state: AssemblyState = initial.ok
const events = [
  {
    t: 'open',
    index: 0,
    id: 'block_1',
    kind: 'text',
    fill: 'append',
    visibility: { toHuman: true, toModel: true },
  },
  { t: 'fill', index: 0, payload: 'Hello' },
  {
    t: 'close',
    index: 0,
    block: {
      kind: 'text',
      id: 'block_1',
      visibility: { toHuman: true, toModel: true },
      text: 'Hello',
    },
  },
  { t: 'finish', reason: 'end' },
]
for (const event of events) {
  const next = accept(state, event)
  if ('rejected' in next) throw new Error(next.rejected)
  state = next.ok
}
console.log(jsonNumberSource(snapshot(state).position)) // 4
console.log(snapshot(initial.ok).position) // 0: previous states remain usable
const settled = closeOut(state)
if ('rejected' in settled) throw new Error(settled.rejected)
console.log(settled.ok.blocks[0]?.kind, settled.ok.ending.reason) // text end
if ('usage' in settled.ok.account) console.log(settled.ok.account.usage.source) // none: no reported account
```

### Seal raw tool arguments exactly once

```ts
import { start, accept, closeOut, type AssemblyState } from '@omne-harness-lite/stream-assembly'

const initial = start({ kind: 'model_call', callId: 'model_call_1', dispatch: 1 })
if ('rejected' in initial) throw new Error(initial.rejected)
let state: AssemblyState = initial.ok
for (const event of [
  {
    t: 'open',
    index: 0,
    id: 'block_1',
    kind: 'tool_call',
    fill: 'append',
    visibility: { toHuman: true, toModel: true },
    head: { callId: 'call_1', tool: 'lookup' },
  },
  { t: 'fill', index: 0, payload: '{"x":1,"x":2}' },
  { t: 'close', index: 0 },
  { t: 'finish', reason: 'end' },
]) {
  const next = accept(state, event)
  if ('rejected' in next) throw new Error(next.rejected)
  state = next.ok
}
const result = closeOut(state)
if ('rejected' in result) throw new Error(result.rejected)
const call = result.ok.blocks[0]
if (call?.kind !== 'tool_call' || !call.complete || !('unparseable' in call))
  throw new Error('expected unparseable call')
console.log(call.unparseable, call.rawArguments) // true {"x":1,"x":2}
```

The close is accepted. Duplicate parameter names produce a complete `unparseable` call, not a rejected close. This example does not invoke `lookup`.

### Handle refusal and abandon a stream without continuity

```ts
import { start, accept, snapshot, closeOut, abandon } from '@omne-harness-lite/stream-assembly'

const initial = start({ kind: 'tool_execution', callId: 'call_1' })
if ('rejected' in initial) throw new Error(initial.rejected)
console.log(closeOut(initial.ok)) // { rejected: 'stream_not_finished' }
console.log(accept(initial.ok, { t: 'fill', index: 0, payload: 'Hello' }))
// { rejected: 'block_not_open' }
console.log(snapshot(initial.ok).position) // 0: refused input has no effect
const lost = abandon(initial.ok)
if ('rejected' in lost) throw new Error(lost.rejected)
console.log(lost.ok.ending.reason) // lost
const finished = accept(initial.ok, { t: 'finish', reason: 'end' })
if ('rejected' in finished) throw new Error(finished.rejected)
console.log(accept(finished.ok, { t: 'unknown' })) // { rejected: 'event_unknown' }
console.log(accept(finished.ok, { t: 'fill', index: 0, payload: 'late' }))
// { rejected: 'event_after_finish' }
```

## Boundaries and failures

Every `accept` first checks the arrival representation, then `event_after_finish`, then sequence guards. Representation errors therefore retain priority even after finish. Sequence failures include reused/non-monotonic indices, missing/closed blocks, mismatched payloads and duplicate accounts. Rejection leaves the supplied state unchanged. Invalid forged state objects violate the opaque-state precondition and may throw; obtain states only from this module.

Tool parameters remain raw throughout fills. A legal, accepted, untrimmed tool-call close with a valid model tool name parses once using strict lossless JSON; an empty raw string denotes `{}`. Syntax errors, duplicate names or invalid tool names produce a complete `unparseable` call preserving raw name/arguments. Content-changing trims and unclosed calls settle as invisible incomplete calls. Snapshots, settlement and abandonment do not parse parameters again or initiate execution. Non-call closes must supply the matching final block; the producer owns equality with the fill reduction.

Positions and `firstContentAt` are event positions, not timestamps. A missing model account settles to explicit unknown usage/cost, not zero. Tool streams return frame accounting. `abandon` means lost continuity; a reason is allowed only for model streams, and settlement does not mutate or consume the original state. The caller must ensure one current state per session/target, ordered delivery without duplicates/loss, rejected-increment trim reporting, snapshot/event continuity, clock capture, durable recording exactly once, and abandonment on host removal. Cross-process reliable delivery, authorization and recovery are outside this package. Retaining old immutable states retains memory; array lookup/update costs grow with block count.

## Development

```sh
pnpm --filter @omne-harness-lite/stream-assembly run build
pnpm --filter @omne-harness-lite/stream-assembly run typecheck
pnpm --filter @omne-harness-lite/stream-assembly run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
