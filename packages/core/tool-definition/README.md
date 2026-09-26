# tool-definition

当前实现采用 `data.tool-definition v3`（[规范](../../../.meta_harness/design/spec/data/tool-definition/v3/contract.md)）。公开 `./schema` 为冻结 v3；`./schema/v2` 只保留完整冻结 v2 资源及原 `$id`，不提供 v2 领域行为兼容入口。

Pure values and judgments for the accepted `data.tool-definition` v3 contract.
The maintained responsibility and verification map is the
[realization node](../../../.meta_harness/design/realization/packages/core/tool-definition/README.md).

Import the package public entry for definition/return types, ordered representation
judgments, model entries and names, the `toolBodyContract`, and
`createParameterJudge()`. The caller owns this object's compiler/cache lifetime;
there is no author-schema cache shared between callers. Parameter schemas retain
exact JSON numbers through the public content-blocks Schema runtime.

`toolDependencies(definition, effectiveTargetEnvironment)` requires the caller's
already evaluated environment, or explicit `undefined` when none is declared.
`toolResultOf(returned, blockId)` requires the receiving runtime's block identity.
Neither function evaluates settings, allocates identity or performs execution.

`isToolReturn` reports representation validity as a boolean; it does not turn the
original JSON value into a branded domain value. `toolResultOf` accepts an unknown
representation and, after the existing return judgment, rebuilds content and
offload-summary blocks through the content-blocks public judgment. Its copied,
immutable result contains genuine opaque wrappers, including nested result blocks.
Invalid representations raise `TypeError`; strings remain plain text.

The `./schema` export is byte-identical to the frozen v3 exchange Schema. Pattern
limits U1–U7 apply here; execution timing, U8 worker termination, actual result
settlement and durable logs belong to their runtime providers.

Verification retains the original v2 normative cases as regressions against current3,
without relabeling their source, and separately consumes every accepted v3 appendix
instance. The current and retained public Schema resources are checked independently.
