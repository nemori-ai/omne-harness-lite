# 会话、耐久输入与运行控制（已被取代）

本能力的 [v2](v2/contract.md)（[D-012](../../../docs/decisions/D-012-run-driver-and-inbound.md)）
已由 [D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 拆分为两个新身份：
[capability.session v1](../session/README.md)（Session 身份与生命周期、历史、队列、复合打断
受理、会话级 hold、状态贡献注册、恢复顺序、Inbound）与
[capability.run v1](../run/README.md)（Run、状态、epoch、Step、驱动位置投影、控制、命令 Run
终态映射、恢复兼容证据）；占位与执行者关系归
[生命周期组合 v1](../../compositions/session-run-agent-lifecycles/README.md)。逐句归属见
[提案归属表](../../../docs/proposals/session-run-agent-lifecycles/session.md#2-条款逐句归属)。

[v2](v2/contract.md) 与 [v1](v1/contract.md)（D-008）都保持冻结与可引用，在 catalog 中标为
superseded；未迁移的消费者继续按其采用的版本，新设计以 session v1 与 run v1 为依赖。
v1 的 `QueueControl` 模型仍是队列顺序、命令与强停的证据，登记在 formal-tasks 中。

[v1 设计来源与评审](../../../docs/proposals/core-capabilities/README.md)、[v1 验证范围](../../../docs/proposals/core-capabilities/verification.md)；
[v2 设计来源](../../../docs/proposals/agent-loop-inbound/README.md)、[v2 验证范围](../run-driver/verification.md)。
