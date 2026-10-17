# tool 源码

- [index.ts](index.ts) 是根入口 `.`，不导入 Cordis。它导出 `createIndependentToolScope`、`executeTool`、`createToolLedger`、`createToolRuntime`、记录仓端口类型、guard 类型与构造形状类型。
- [independent-scope.ts](independent-scope.ts) 实现独立执行作用域（G2）：输出账、等待历史、取消与收尾。作者拿到的 `context` 与调用者拿到的 `scope` 都在这里构造。
- [execute-tool.ts](execute-tool.ts) 实现执行包装器 `executeTool`：核对作用域，运行作者，再调用 `finish`。
- [limits.ts](limits.ts) 是 `ToolAuthorLimits` 的闭合检查，两个入口共用。
- [json-tree.ts](json-tree.ts) 检查等待请求的标签 JSON 树，复制它并给出规范文本与字节数。它用显式栈遍历，超过字节上限即停止。
- [construction.ts](construction.ts) 给出 runtime 工厂的构造形状 `ToolDependencies` 与 `ToolConfiguration`。
- [ledger-store.ts](ledger-store.ts) 定义记录仓端口 `ToolLedgerStore`（G1）：事务域、五种记录、写入、读取与提交结果，以及记录键。
- [ledger-guards.ts](ledger-guards.ts) 定义账本的受信快照 `ToolLedgerGuards`：资格守卫、来源守卫、文本结果工厂、结果政策与预算。
- [boundary.ts](boundary.ts) 是命令与读取的边界检查：租户形状、品牌身份与写入上下文。
- [evidence.ts](evidence.ts) 铸造规范 JSON 摘要、耐久证据、修订号与结果/交付身份。
- [ledger-decider.ts](ledger-decider.ts) 是纯决定器：快照、受理决定（P01、P02）与交付解除决定（P08）。
- [ledger-reads.ts](ledger-reads.ts) 是快照上的读取投影：lookup、操作认回、结果分页与账目。
- [ledger.ts](ledger.ts) 实现 `createToolLedger`：每个入口做边界、资格、读取、决定与按修订号提交；后续工单的操作回复具名 `unsupported`。
- [runtime.ts](runtime.ts) 实现 `createToolRuntime`：构造时检查配置与端口，逻辑终局路径的操作接到账本端口，其余回复具名 `unsupported`。
- [testing.ts](testing.ts) 是 `./testing` 入口：非耐久记录仓 `createMemoryToolLedgerStore`，带故障注入。
- 本包经 `@omne-harness/tool-contract` 取得公共类型，不复制它们。`Outcome` 来自 `@omne-harness/kernel-basis`。

实现选择见 [SPEC](../SPEC.md)。文档导航见 [index](index.md)。
