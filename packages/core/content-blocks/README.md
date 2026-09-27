# @omne-harness-lite/content-blocks

[中文](README_ZH.md)

Immutable multimodal content blocks and a strict, lossless JSON boundary. Validate text, thinking, media, tool-call and tool-result values while preserving exact numeric literals and opaque transport payloads.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/content-blocks": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Entry / API                                                 | Purpose                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `judgeContentBlock`                                         | Complete block judgment with ordered named rejections               |
| `contentBlockFromRepresentation`                            | Shape-checked transport restoration; does not replace full judgment |
| `readJsonStrict`, `writeJsonLossless`, `copyJsonValue`      | Duplicate-aware JSON read, exact write and owned frozen copy        |
| `LosslessNumber`, numeric predicates and `jsonNumberSource` | Exact numeric representation and explicit source access             |
| `toOpaqueJson`, `readOpaqueJson`                            | Explicit transport-only opaque wrapping/read boundary               |
| Block types, equality helpers, media-type helpers           | Seven block kinds, identities, attachments and modality             |
| `validate`, `schemaId`; `./schema`, `./schema/v2`           | Current v3 and retained v2 Schema resources                         |
| `./schema-runtime`                                          | `createSchemaRuntime` and exact Draft 2020-12 validator types       |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Round-trip exact JSON and reject duplicate names

```ts
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const source = '{"large":9007199254740993,"price":1.10,"huge":1e400,"zero":-0}'
const read = readJsonStrict(source)
if ('failed' in read) throw new Error(read.failed)
console.log(writeJsonLossless(read.ok) === source) // true
console.log(readJsonStrict('{"x":1,"\u0078":2}')) // { failed: 'duplicate_member' }
```

### Admit a block and preserve opaque payloads

```ts
import {
  judgeContentBlock,
  toOpaqueJson,
  writeJsonLossless,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'

const result = judgeContentBlock({
  kind: 'thinking',
  id: 'b_1',
  visibility: { toHuman: false, toModel: true },
  text: 'Considering the request',
  opaque: toOpaqueJson({ vendor: 'token', n: new LosslessNumber('1.10') }),
})
if ('rejected' in result) throw new Error(result.rejected)
console.log(Object.isFrozen(result.ok)) // true
console.log(writeJsonLossless(result.ok)) // includes "opaque":{"vendor":"token","n":1.10}
console.log(judgeContentBlock({ kind: 'text', id: 'b_2', text: 'Hello' }))
// { rejected: 'visibility_missing' }
```

A transport adapter may wrap or read opaque data. Other consumers keep the opaque value intact and do not branch on its contents.

### Validate an exact numeric bound with a standalone compiler

```ts
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'

const runtime = createSchemaRuntime([])
const validator = runtime.compile({
  type: 'integer',
  minimum: new LosslessNumber('9007199254740993'),
})
console.log(validator.validate(new LosslessNumber('9007199254740992'))) // false
console.log(validator.validate(new LosslessNumber('9007199254740993'))) // true
console.log(validator.validate(new LosslessNumber('1.00000000000000000001'))) // false
```

## Boundaries and failures

`judgeContentBlock` checks `kind_unknown`, `visibility_missing`, `incomplete_call_visible`, `call_in_result`, `modality_mismatch`, then remaining shape/cross-member constraints as `malformed`. Success owns a deeply frozen copy. `contentBlockFromRepresentation` checks the full bundled Schema and restores brands, but skips additional judgment predicates; malformed representation preconditions throw `TypeError`.

`JsonNumber` is `number | LosslessNumber`. The strict reader keeps ordinary safe-integer literals as numbers; decimals, exponents, unsafe integers and negative zero retain their source in `LosslessNumber`. Never use `Number(source)` to establish exact bounds or equality. The writer rejects non-JSON values with `TypeError` instead of omitting them; copying rejects getters, cycles and other non-JSON properties. Opaque JSON is not an inspection permission, and copying its exchange representation does not preserve its domain brand.

The bundled `validate` is shape-only and has a numeric projection specific to this fixed Schema; do not reuse that projection for arbitrary numeric constraints or pass wrappers directly to ordinary Ajv. `createSchemaRuntime` is caller-owned, resolves only supplied fixed resources, and performs no remote loading or async validation. This package does not parse `rawArguments`, execute tools, retrieve attachments, persist blocks, establish block-ID uniqueness across messages, or authorize visibility. `./schema/v2` retains the old resource without v2 behavior compatibility. Node `>=24.18.0 <25` is required for the actual JSON source/raw-number APIs.

## Development

```sh
pnpm --filter @omne-harness-lite/content-blocks run build
pnpm --filter @omne-harness-lite/content-blocks run typecheck
pnpm --filter @omne-harness-lite/content-blocks run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
