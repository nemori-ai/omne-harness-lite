# tool-definition

Pure values and judgments for the accepted `data.tool-definition` v2 contract.
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

The `./schema` export is byte-identical to the frozen v2 exchange Schema. Pattern
limits U1–U7 apply here; execution timing, U8 worker termination, actual result
settlement and durable logs belong to their runtime providers.
