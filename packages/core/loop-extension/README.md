# @omne-harness-lite/loop-extension

当前实现采用 `data.loop-extension v3`（[规范](../../../.meta_harness/design/spec/data/loop-extension/v3/contract.md)）。公开 `./schema` 为冻结 v3；`./schema/v2` 只保留完整冻结 v2 资源及原 `$id`，不提供 v2 领域行为兼容入口。


Pure TypeScript values and boundary judgments for accepted `data.loop-extension` v2.
Authority: [contract](../../../.meta_harness/design/spec/data/loop-extension/v2/contract.md),
[realization](../../../.meta_harness/design/realization/packages/core/loop-extension/design.md),
[verification](../../../.meta_harness/design/realization/packages/core/loop-extension/verification.md).

The public root exports the protocol types, immutable power/position tables,
the 42-definition Schema registry and shape validator, `judgeDefinition`,
`judgeInput`, `judgeOutput`, `judgeValue`, `judgeConclusion`, type guards,
the explicit-body declaration/reference functions and
`loopExtensionBodyContract: BodyContract<'loop_extension'>`.
`./schema` exports the byte-identical frozen Schema resource.

`isExtensionInput`, `isExtensionOutput` and `isConclusion` report Schema shape as
booleans. They do not brand the caller's original wire object. Typed successful
judgments rebuild the admitted object through the public content-blocks and
messages representation adapters, including nested subjects and earlier records.
These adapters preserve opaque payloads without adding message business refusals
to this contract. `judgeValue` continues to return a neutral JSON exchange value.
Only fixed owned resources are compiled; no author-input cache grows at module scope.
JSON inputs and results preserve lossless numbers through the content-blocks public boundary.

`validate` reports Schema shape only. `judgeValue` applies the ordered representation
predicates to a standalone definition/input/output/record or `$defs` value;
record-relative source names are compared to that record's `extension`.
Receiving a conclusion requires `judgeConclusion`; a standalone `judgeValue` success
does not establish comparisons against the actual invocation.
`judgeConclusion(value, inputs)` also compares the original invocation subject and
actual extension name. Its required `ConclusionInputs` contains the caller-admitted
`ExtensionInput` and actual `CapabilityName` for this invocation. The caller owns
invocation provenance; the function checks observable position, dimension and
action identity pairing. A missing, invalid or mismatched auxiliary configuration
raises `TypeError` after independently decidable domain refusals. This technical
precondition error is outside the ten domain rejection values. A record's extension
name that differs from the supplied actual name is `malformed`.
Neither function defaults, evaluates, repairs or resolves inputs.

The ordinary-shape pass uses a private view to defer the named S-37 predicates.
An illegal dimension cannot select a Subject or impose scope-dependent call/card
fields. Independently decidable shape and identity-mirror errors still take precedence.
In an inject source with a non-extension string kind, the forbidden source branch's
private fields are not validated; S-37 row 10 rejects that kind. Missing/non-object
source, missing/non-string kind and malformed extension-source shape remain row 1.
The exported frozen Schema is unchanged and still reports shape independently.

`src/declarations.ts` reads only the explicit author definition. It derives position,
the declared dimension member, and the power downset; its references are empty.
It does not add reserved declarations, evaluate settings, or assemble default ports.

This package does not execute extensions, persist conclusions, implement replay,
resolve environment/log handles, check system-converter eligibility or model-selection/
retry eligibility, or assemble all body contracts. Those obligations retain their
runner, projection, model-request and assembly owners in the linked verification.

Run `pnpm --filter @omne-harness-lite/loop-extension build`, `typecheck`, and `test`.
Tests include all frozen examples, an independent 312-cell oracle, ordered failures,
original-value rewrite comparisons, lossless JSON/opaque boundaries and public types.
