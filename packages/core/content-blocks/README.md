# content-blocks

当前实现采用 `data.content-blocks v3`（[规范](../../../.meta_harness/design/spec/data/content-blocks/v3/contract.md)）。公开 `./schema` 为冻结 v3；`./schema/v2` 只保留完整冻结 v2 资源及原 `$id`，不提供 v2 领域行为兼容入口。

`contentBlockFromRepresentation(value)` is a shape-only transport adapter: it
copies a value, checks the complete frozen `ContentBlock` Schema, and restores
identity and opaque wrappers through the same private constructor as
`judgeContentBlock`. Invalid representation preconditions raise `TypeError`.
The adapter does not establish cross-member predicates or replace the receiver's
complete `judgeContentBlock` check. It never branches on opaque contents.

`@omne-harness-lite/content-blocks` implements the public pure module described by
[the accepted realization node](../../../.meta_harness/design/realization/packages/core/content-blocks/design.md),
adopting [data.content-blocks v3](../../../.meta_harness/design/spec/data/content-blocks/v3/contract.md)
(D-061 / D-062 / D-065; coordinates reconciled by D-066). It requires Node `>=24.18.0 <25` and uses Ajv 8.20.0 Draft 2020-12.

Import from the package root for types and functions. `./schema` exports the unchanged
`schema/content-blocks.schema.json` file, with `$id` and 22 `$defs` matching the frozen
specification. To register it in another Ajv instance:

```ts
import schema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import { Ajv2020 } from 'ajv/dist/2020.js'

const ajv = new Ajv2020({ strict: true, strictTypes: false, strictRequired: false })
ajv.addSchema(schema)
const validateBlock = ajv.getSchema(`${schema.$id}#/$defs/ContentBlock`)
```

The two disabled static diagnostics allow the specification's `allOf` / `not` / `required`
composition. They do not disable data constraints. This Schema has no external references;
consumers register this `$id` when their own Schema references its definitions. Raw Ajv
validation alone does not check the cross-member constraints or numeric wrappers described below.

The public functions are independent of Context, sessions, tenants and storage:

| Entry | Result |
| --- | --- |
| `readJsonStrict(text: string)` | `{ readonly ok: JsonValue }` or `{ readonly failed: 'syntax' \| 'duplicate_member' }` |
| `writeJsonLossless(value: unknown)` | JSON text; non-JSON JavaScript values throw `TypeError` rather than being omitted or rewritten |
| `copyJsonValue(value: unknown)` | Frozen JSON exchange value or `{ readonly failed: 'not_json' }`; copies without invoking getters or `toJSON` |
| `judgeContentBlock(value: unknown)` | `{ readonly ok: ContentBlock }` or `{ readonly rejected: ContentBlockRejection }` |
| `validate(defName: SchemaDefName, value: unknown)` | `{ readonly valid: boolean }`, the fixed bundled Schema definitions only |
| `modalityOf(mediaType: string)` | `Modality \| undefined`; the precondition is a canonical media type |
| `isCanonicalMediaType(value: unknown)` | Canonical media-type predicate, without normalization |
| `capabilityIdEquals(a, b)` / `attachmentRefEquals(a, b)` | Exact component equality |

`judgeContentBlock` checks the five named refusal predicates over all block positions in the
contract's order, then checks the remaining Schema and cross-member constraints. It never selects
a refusal from Ajv's errors. Accepted results are owned, deeply frozen copies; callers retain
their original objects. The block variants, `Visibility`, `Modality`, `MediaType`, identifiers,
attachments, outcomes and reasons are exported types. `BlockId` and `CallId` use the public
identity-values brand; use that package's `parseOpaqueIdentifier(value, 'BlockId' / 'CallId')`
and `generateOpaqueIdentifier()` at the respective identity construction boundary.

`JsonNumber` is `number | LosslessNumber`. This implementation conservatively keeps only ordinary
safe-integer literals as `number` (excluding negative zero). Decimals, exponent spellings, unsafe
integers and `-0` use a frozen `LosslessNumber`, preserving their source spelling. Thus `0.1`,
`1.10`, `1e400` and `-0` all round-trip through their original literal, without conversion to a
double. This is an implementation representation choice; the realization's original examples
use `number` for `0.1`. The contract's decimal value is preserved by both representations.

The standalone numeric components are `new LosslessNumber(source)`, `LosslessNumber.is(value)`,
`isJsonNumber(value)`, `jsonNumberSource(number)` and `isNonNegativeJsonInteger(value)`. The
constructor accepts only a JSON number literal and rejects invalid sources with `TypeError`.
Use the source for exact decimal arithmetic in consumers; `Number(source)` cannot establish
exact equality or bounds. `isNonNegativeJsonInteger` handles coefficient/exponent syntax
exactly, including exponents outside the double range. It performs no arithmetic or rounding.

The bundled `validate` projects wrappers as numbers for Ajv, while separately checking the
original `AttachmentRef.bytes` as an exact integer >= 0 at every declared attachment position.
`bytes` is the only numerically constrained member in this fixed Schema; `arguments` and
`opaque` allow arbitrary JSON values. **This projection is internal and specific to this
Schema.** Consumers with `maximum`, precision, enum or other numeric constraints must check
their original `JsonNumber` values according to their own contracts before using any Schema
view. Do not pass `LosslessNumber` directly to an ordinary Ajv instance as an object.

`ThinkingBlock.opaque` exposes only the `OpaqueJson` brand. Transport adapters construct it
with `toOpaqueJson(value)` and read it through `readOpaqueJson(value)`; `writeJsonLossless`
preserves it during serialization. Other layers keep the brand intact and do not inspect it.
No parser operates on a call block's `rawArguments`. The shared strict reader returns a neutral
failure: block/message JSON receivers map it to `malformed`, while stream-assembly maps its one
argument parse failure to the already specified unparseable complete call.

`copyJsonValue` exposes the existing neutral JSON exchange projection used by the writer and
validators. It keeps ordinary numbers (including `-0`) and exact `LosslessNumber` values,
copies and freezes containers, and rejects cycles or non-JSON properties. Its result unwraps
the transport representation of `OpaqueJson`; it is not a typed `ContentBlock` copy and
does not retain that brand. Use it for JSON representation snapshots, validation or full-input
fingerprints. It does not authorize business inspection of opaque contents, validate domain
values, or repair precision already lost before this boundary. Domain objects must retain
their wrappers or be reconstructed through their authoritative judge.

Build before testing or typechecking the public declaration consumer:

```sh
pnpm --filter @omne-harness-lite/content-blocks run build
pnpm --filter @omne-harness-lite/content-blocks run typecheck
pnpm --filter @omne-harness-lite/content-blocks run test
```

Tests cover all 162 normative Schema rows, named block refusal rows and the six precedence
examples, cross-member constraints, immutability, exact JSON number/opaque round-trips,
decoded duplicate keys, public built JavaScript/Schema consumption and negative public type
tests. These correspond to the node's V-1 / V-2 / V-3 and module-side V-6 / V-11 obligations.
The numeric reader relies on the actual Node `context.source` and `JSON.rawJSON` APIs.
Tests of depth 128 and long input are bounded evidence, not a guarantee for unbounded inputs.

Message identity uniqueness, call registration, real log persistence, consumer parsing
allowlists, transport use of opaque, attachment access, assembly and every external JSON hop
remain with their documented owners in the realization node. Package tests do not establish
those external obligations or final acceptance.

Verification retains the original v2 normative cases as regressions against current3,
without relabeling their source, and separately consumes every accepted v3 appendix
instance. The current and retained public Schema resources are checked independently.
