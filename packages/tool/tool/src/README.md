# tool 源码

- [index.ts](index.ts) 是根入口 `.`，不导入 Cordis。它导出 `createIndependentToolScope`、`executeTool` 与构造形状类型。
- [independent-scope.ts](independent-scope.ts) 实现独立执行作用域（G2）：输出账、等待历史、取消与收尾。作者拿到的 `context` 与调用者拿到的 `scope` 都在这里构造。
- [execute-tool.ts](execute-tool.ts) 实现执行包装器 `executeTool`：核对作用域，运行作者，再调用 `finish`。
- [limits.ts](limits.ts) 是 `ToolAuthorLimits` 的闭合检查，两个入口共用。
- [json-tree.ts](json-tree.ts) 检查等待请求的标签 JSON 树，复制它并给出规范文本与字节数。它用显式栈遍历，超过字节上限即停止。
- [construction.ts](construction.ts) 给出 runtime 工厂的构造形状 `ToolDependencies` 与 `ToolConfiguration`。
- 本包经 `@omne-harness/tool-contract` 取得公共类型，不复制它们。`Outcome` 来自 `@omne-harness/kernel-basis`。

实现选择见 [SPEC](../SPEC.md)。文档导航见 [index](index.md)。
