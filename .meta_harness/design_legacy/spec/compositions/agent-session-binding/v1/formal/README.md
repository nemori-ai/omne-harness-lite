# Agent/Session Binding v1 形式化工件

| 性质/条款 | 工件 | 抽象与限制 |
|---|---|---|
| 租户/占位精确、发布状态、附着、退出清理与工作移交的有限片段 | [Binding.tla](Binding.tla)、[Binding.cfg](Binding.cfg) | 检查 `TenantBound`、`SlotExact`、`PublicationSafe`、`AttachmentExact`、`DisposedIsClean`、`TransferAccounted` 等；不表达 CB-03 的真实 IAM/存储共同门或 CB-13 的可选贡献在途撤除 |

模型来自旧 `composition.agent-session-binding@1` 当前规范并保持语义；旧执行日志不冒充新运行。
本基线 safety 已实际运行，精确结果见版本外 [verification](../../verification.md)；模型通过不代表真实提供者符合。
