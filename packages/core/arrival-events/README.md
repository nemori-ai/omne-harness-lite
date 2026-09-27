# @omne-harness-lite/arrival-events

[中文](README_ZH.md)

Pure validation of arrival envelopes and reduction of one block's fills. The same data vocabulary describes model-response streams and tool execution frames; this package supplies no transport or reliable-delivery mechanism.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/arrival-events": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                             | Purpose                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `judgeArrivalEnvelope`, `judgeArrivalEnvelopeText`     | Ordered representation judgment; optional caller-owned `openBlock` view |
| `reduceFills`                                          | Reduce legal fills of one block in producer order                       |
| `isStandardBase64`                                     | Strict nonempty standard Base64 with canonical padding/tail bits        |
| Arrival/event/open/reduction types                     | `open`, `fill`, `close`, `trim`, `account`, `finish` values             |
| `validate`, `schemaId`, `SCHEMA_DEF_NAMES`; `./schema` | Shape validation and v2 Schema                                          |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Validate model and tool envelopes

```ts
import { judgeArrivalEnvelope, judgeArrivalEnvelopeText } from '@omne-harness-lite/arrival-events'

console.log(
  judgeArrivalEnvelope({
    target: { kind: 'model_call', callId: 'model_call_1', dispatch: 1 },
    event: {
      t: 'open',
      index: 0,
      id: 'block_1',
      kind: 'text',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
  }),
) // { ok: true }
console.log(
  judgeArrivalEnvelopeText(
    JSON.stringify({
      target: { kind: 'tool_execution', callId: 'call_1' },
      event: {
        t: 'open',
        index: 0,
        id: 'block_2',
        kind: 'text',
        fill: 'append',
        visibility: { toHuman: true, toModel: false },
      },
    }),
  ),
) // { ok: true }
console.log(
  judgeArrivalEnvelope({
    target: { kind: 'model_call', callId: 'model_call_1', dispatch: 1 },
    event: {
      t: 'open',
      index: 1,
      id: 'block_3',
      kind: 'image',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
  }),
) // { rejected: 'fill_kind_not_appendable' }
```

### Reduce text, raw parameters and decoded audio bytes

```ts
import { isStandardBase64, reduceFills } from '@omne-harness-lite/arrival-events'

console.log(reduceFills({ kind: 'text', fill: 'append' }, ['Hello, ', 'Ada'])) // Hello, Ada
console.log(reduceFills({ kind: 'tool_call', fill: 'append' }, ['{"x":', '1}'])) // {"x":1}
console.log(reduceFills({ kind: 'voice', fill: 'append' }, ['AQ==', 'Ag=='])) // AQI=
console.log(reduceFills({ kind: 'text', fill: 'replace' }, ['old', 'new'])) // new
console.log(reduceFills({ kind: 'text', fill: 'append' }, [])) // undefined
console.log(isStandardBase64('AQ==')) // true
console.log(isStandardBase64('AR==')) // false: nonzero unused tail bits
```

## Boundaries and failures

Judgment checks representation, not event sequence. A successful `{ ok: true }` does not prove that an index was opened, is monotonic, or can be closed. Use a sequence consumer such as [stream-assembly](../stream-assembly/README.md) for those checks. The optional `openBlock(index)` must return a legal immutable currently open view, or `undefined` when absent/closed. Only replacement-shape and tool-frame voice-fill predicates borrow this view; missing views do not prove those contextual conditions.

Tool frames must have `toModel: false`; inline media bytes are forbidden, and tool streams have no `account`, `max_tokens` finish or finish error. Presentation hints are rejected in the current version. Model targets carry `callId` and `dispatch`; tool targets carry `callId`. Neither target carries session or tenant routing.

`reduceFills` assumes legal mode and payloads belonging to one block in producer order. Invalid preconditions throw `TypeError`; zero fills return `undefined`. Audio concatenates decoded bytes, not Base64 strings. Tool arguments remain raw strings and are not parsed here. Text reception rejects syntax and nested duplicate members as `malformed` and preserves exact numeric values. Callers own sequencing, close/reduction consistency, throttling, trim accounting, routing, authorization and ordered delivery without duplicates or loss. Rejected data does not itself terminate an execution.

## Development

```sh
pnpm --filter @omne-harness-lite/arrival-events run build
pnpm --filter @omne-harness-lite/arrival-events run typecheck
pnpm --filter @omne-harness-lite/arrival-events run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
