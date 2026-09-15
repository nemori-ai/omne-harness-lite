# 工具、技能、独立调用与披露

**当前正式契约为 [capability.tools v2](v2/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v1](v1/contract.md)（[D-008](../../../docs/decisions/D-008-core-capabilities.md)）保持冻结与
可引用，标为 superseded。v2 是语义变化版本：调用的五个正交维度、转移的提交面与同批
伙伴、等待关系归 Run 等待登记簿、内建 `human` 工具、前台上限的执行归属、帧的耐久性与
结果三层投影首次成为规范正文，TL-07 / TL-09 / TL-10 / TL-11 / TL-12 按新语义改写
（逐条见[契约末尾的差异表](v2/contract.md)）。精确版本、状态与接受依据以
[catalog](../../catalog.json) 为准。

| 对象 | 当前状态与依据 |
|---|---|
| 工具契约 | v1 由 [D-008](../../../docs/decisions/D-008-core-capabilities.md) 接受，v2 由 [D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md) 接受；设计来源见[核心能力提案](../../../docs/proposals/core-capabilities/README.md)与[工具执行提案](../../../docs/proposals/tool-execution/README.md)（含三轮架构复核与裁决表） |
| 形式模型 `ToolCall.tla` | 模型与两个登记配置位于 [v2 目录](v2/)，是[工具执行提案证据目录](../../../docs/proposals/tool-execution/evidence/README.md)的逐字节副本；补充进展配置与否定变体仍留在提案证据目录。覆盖范围、运行数字与未覆盖条款见[验证范围](verification.md)；有限模型检查不是无条件证明 |
| 规范场景 | [v2/scenarios.md](v2/scenarios.md) 的 TS-01～TS-23 列出提供者验收条件 |
| 目标实现 | 尚未开始；提供者设计归 [tools 提供者](../../../packages/tools/tools/design.md)与[本地执行提供者](../../../packages/tools/local-execution/design.md)，两者仍是 v1 基线，按 D-015 重写属接受之后的工作。源码 fork 不表示实现已符合 |

设计接受、模型检查与实现验收分别记录；本页不代替精确契约。
