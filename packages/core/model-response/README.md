# model-response

当前实现采用 `data.model-response v3`（[规范](../../../.meta_harness/design/spec/data/model-response/v3/contract.md)）。公开 `./schema` 为冻结 v3；`./schema/v2` 只保留完整冻结 v2 资源及原 `$id`，不提供 v2 领域行为兼容入口。

Pure TypeScript implementation of the accepted
[`data.model-response` v3](../../../.meta_harness/design/spec/data/model-response/v3/contract.md).
The [provider mapping](../../../.meta_harness/design/realization/packages/core/model-response/design.md)
owns the implementation boundary.

The package exports all sixteen definition types, `validate(defName, value)` for
the full frozen shape, and `judgeModelResponse(value)` for the ordered S-27
rejection. The judge returns `{ ok: true } | { rejected: ModelResponseRejection }`.
The `./schema` entry exports the unchanged frozen resource. Use the
content-blocks JSON reader and writer for text boundaries and lossless numbers.

The package neither sends requests nor reads clocks, generates identifiers,
redacts upstream material, retries, or writes accounts. S-25 and V-2 through V-14
remain with the model-request runtime and its transport and storage owners.
Passing shape validation does not establish those facts.

Package tests cover normative examples, rejection precedence, all definitions,
lossless numeric boundaries and generated public type constraints. Run `build`,
`typecheck` and `test` with the workspace package filter.

Verification retains the original v2 normative cases as regressions against current3,
without relabeling their source, and separately consumes every accepted v3 appendix
instance. The current and retained public Schema resources are checked independently.
