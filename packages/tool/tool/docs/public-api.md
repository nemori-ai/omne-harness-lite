# tool 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [independent-scope.ts](../src/independent-scope.ts)：`createIndependentToolScope`（G2）。它检查 `IndependentToolScopeInput`，返回 `ToolExecutionScope` 或 `{ field, reason }` 失败。`field` 是被拒绝的字段路径，例如 `limits.authorBufferBytes`。`reason` 是 `type`、`range`、`missing`、`accessor` 或 `unknown-field`。作用域内 `emit`、`wait` 与 `finish` 的失败是 `ToolPrimitiveFailure` 值。各种情况对应的种类见 [SPEC 的失败解释](../SPEC.md#失败解释)。
- [execute-tool.ts](../src/execute-tool.ts)：`executeTool` 与其失败类型 `ExecuteToolFailure`。`effect` 为 `not-started` 时作者没有运行。`effect` 为 `unknown` 时作者运行过。
- [construction.ts](../src/construction.ts)：`ToolDependencies` 与 `ToolConfiguration`，即 `createToolRuntime` 的构造形状。

`createToolRuntime` 已接受、尚未实现，签名见契约包 [public-api](../../tool-contract/docs/public-api.md#尚未实现的函数m2m3-实现后移除)。实现后签名移入本包源码。公开类型归契约包的 [author-context.ts](../../tool-contract/src/author-context.ts) 与 [execution.ts](../../tool-contract/src/execution.ts)。目录职责见 [README](README.md)。
