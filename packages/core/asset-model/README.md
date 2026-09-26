# asset-model

`@omne-harness-lite/asset-model` implements the locally decidable value boundaries of
[`data.asset-model` v1](../../../.meta_harness/design/spec/data/asset-model/v1/contract.md),
adopted through the [asset-model realization](../../../.meta_harness/design/realization/packages/core/asset-model/design.md).
It is a pure package, with an independent public `dist` entry and `./schema` entry.
The Schema is an unchanged copy of the frozen resource. There is no Cordis service.

`CapabilityId`, JSON values/numbers and strict JSON transport come from content-blocks.
The whitespace set and tenant identities come from identity-values. Exchange shells
refer to body JSON without duplicating the six packages' precise body type definitions.

## Explicit body ports

`BodyContract<C>` carries a literal `category: C`, a fixed `schema` resource, and three
closures: `judge(body, context?)`, `deriveDeclarations(body, ...snapshot)`, and
`references(body)`. `BodyContracts` requires all six categories. A misplaced port is
a type error; a missing or mismatched runtime port throws during construction (M51).
`judge` returns `{ ok: true } | { rejected: string }`, preserving the original JSON
instead of converting a typed or opaque body result back into JSON.

`BodyJudgeContext` contains only `capabilityName?`, `origin?`, and `definition?`.
For a record, `createAssetModelJudge(bodies).judgeAssetValue('AssetDefinition', value)`
passes its name and actual origin to each draft/version body judge (S-27; slash-command
S-4 requires both). `definition` is used only when an explicitly supplied declaration
references a fixed `$defs` entry in a body Schema. Optional `AssetJudgeContext.declarations`
supplies this dependency; the judge never guesses a contract from an assignment item.
Adapters must call their own body validators to narrow unknown/JSON inputs before
calling their strongly typed public functions; no body implementation is imported here.

`attributeDeclarationsOf(content, bodies, actionSnapshot?)` adds the S-15/S-36 reserved
declarations, throws on reserved/duplicate/invalid body declarations, and preserves
`underivable`. The action snapshot is allowed only for MCP. Connector, plugin and
agent-definition declarations remain underivable under the adopted v1 gaps.
`referencesOf(content, bodies)` returns explicit references or the agent-definition gap.
`parseWorkspaceManifestText(text, bodies)` parses strictly and returns the unchanged,
frozen JSON value, or the single S-27 rejection. A caller-owned judge holds compiled
fixed resources; author domain compilers are invocation-local.

`capabilityCanonicalString`/`parseCapabilityCanonicalString` implement S-3.
`normalizeWorkspaceDirectory` accepts absolute paths and normalizes only their literal
spelling. `carrierRecordId` requires that canonical spelling and encodes the specified
five-element tuple (M44). `contentFingerprint` hashes codepoint-ordered canonical JSON
while retaining numeric source spelling, including long decimals and overflow literals.

## Verification scope

The protected [`./schema-runtime`](src/schema-runtime.ts) subentry exports
`createSchemaRuntime(resources, options?)`, returning `metaValidate(schema)` and
`compile(schema).validate(value: JsonValue)`. Resources must be fixed `$id` objects.
Schemas are copied and frozen at binding/compile; original values are copied per
call, and the private Ajv projection and original-value context stay inside the
validator. Each runtime owns its compiler/cache. Standard meta resources come from
the adopted Ajv version; author compilers do not accumulate in a module cache.

Only `options.patternFactory(source): RegExp` is configurable. It must be a
deterministic, effect-free native RegExp factory; global/sticky patterns throw.
The default uses Ajv's Unicode pattern mode. Tool consumers supply their M56
non-Unicode-first factory. Meta failures are boolean; compiling an invalid meta
input throws, and reference/pattern/compiler exceptions propagate. Async Schema
results throw as an internal safeguard; the nonstandard `$async` annotation is
ignored in the private Draft compiler view. There is no remote loading, and
formats are annotations. Other engine extensions (`nullable`, legacy `id`,
`$recursiveAnchor`/`$recursiveRef` and `dependencies`) have no assertion semantics
in this Draft view; the standard meta Schema still checks their deprecated shapes.

Tests cover exact integers and decimal bounds, multipleOf, const/enum/uniqueItems,
object/array vocabularies, compositions, explicit and recursive refs, standard
meta validation, and mixed pattern flags. This is measured coverage of the
adopted engine, not a claim that every Draft 2020-12 construct has been verified.
Tool-specific subsets, rejection ordering and configured limits stay with tool.
Numeric bounds, multipleOf, integer types and numeric const/enum values use the
original number source. Length, array size and property count bounds compare exact
codepoint/element/member counts. `minContains` and `maxContains` use native Ajv
counting. For larger-than-safe integer bounds, the private compiler substitutes
MAX_SAFE_INTEGER: actual matching counts cannot exceed array length, and
[ECMAScript arrays have length below 2^32](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-array-exotic-objects).
Within the actual JavaScript value domain these comparisons are equivalent;
this is not a claim about unbounded arrays in another language. Original bounds,
meta checks, annotation numbers and defaults remain unchanged. An open domain
without an author default needs only meta validation, not compilation.

Run `pnpm --filter @omne-harness-lite/asset-model run build`, `typecheck`, and `test`.
Tests use the accepted frozen six Schema resources and explicitly labelled W2 protocol
doubles. They establish the shell boundary, rejection order and port protocol; they do
not establish the six real body implementations. The unique `defaultBodyContracts`
composition belongs to asset-evaluation (W6). Acceptance obligations and external
owners remain in the [node verification map](../../../.meta_harness/design/realization/packages/core/asset-model/verification.md).
Storage uniqueness, owner/version mutation paths, sharing validity, credential
custody and symbolic-link resolution are outside this package.
