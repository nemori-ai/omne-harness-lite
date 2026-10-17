# tool 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [independent-scope.ts](../src/independent-scope.ts)：`createIndependentToolScope`（G2）。它检查 `IndependentToolScopeInput`，返回 `ToolExecutionScope` 或 `{ field, reason }` 失败。`field` 是被拒绝的字段路径，例如 `limits.authorBufferBytes`。`reason` 是 `type`、`range`、`missing`、`accessor` 或 `unknown-field`。作用域内 `emit`、`wait` 与 `finish` 的失败是 `ToolPrimitiveFailure` 值。各种情况对应的种类见 [SPEC 的失败解释](../SPEC.md#失败解释)。
- [execute-tool.ts](../src/execute-tool.ts)：`executeTool` 与其失败类型 `ExecuteToolFailure`。`effect` 为 `not-started` 时作者没有运行。`effect` 为 `unknown` 时作者运行过。
- [construction.ts](../src/construction.ts)：`ToolDependencies` 与 `ToolConfiguration`，即 `createToolRuntime` 的构造形状。
- [ledger.ts](../src/ledger.ts)：`createToolLedger(store, guards, clock)`（G1）返回 `{ commands, reads }`，即契约的 `ToolCommands` 与 `ToolReads`；`toolLedgerAdoption` 是它在 `unsupported` 答复中的采用。已实现的操作与各种拒绝见 [SPEC 的受理账本](../SPEC.md#受理账本怎样满足-p01p02p08-与-p09)。
- [ledger-store.ts](../src/ledger-store.ts)：记录仓端口 `ToolLedgerStore` 与它的事务域、记录、写入、读取和提交结果类型；`recordKey` 给出记录在域内的唯一键。存储提供者实现这个端口。
- [ledger-guards.ts](../src/ledger-guards.ts)：`ToolLedgerGuards`，即账本的受信快照：`ToolAccessGuard`、`ToolSourceGuard`、文本结果工厂、结果政策与 `ToolLedgerBudgets`。
- [runtime.ts](../src/runtime.ts)：`createToolRuntime(dependencies, configuration)`（G8）返回契约的 `ToolProvider`；`toolRuntimeAdoption` 是它在 `unsupported` 答复中的采用。配置超出范围或缺端口时抛 `TypeError`。

`./testing` 入口由 [src/testing.ts](../src/testing.ts) 定义：`createMemoryToolLedgerStore` 是声明 `durability: 'none'` 的非耐久记录仓，带读取与提交的故障注入，只供测试。公开类型归契约包的 [author-context.ts](../../tool-contract/src/author-context.ts)、[execution.ts](../../tool-contract/src/execution.ts) 与 [ports.ts](../../tool-contract/src/ports.ts)。目录职责见 [README](README.md)。
