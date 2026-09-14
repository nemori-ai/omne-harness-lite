# 会话、耐久输入与运行控制

当前推荐版本：[v2](v2/contract.md)，接受依据 [D-012](../../../docs/decisions/D-012-run-driver-and-inbound.md)；
[v1](v1/contract.md)（D-008）保持冻结与可引用，未迁移的消费者继续按 v1。
v2 新增 Session Inbound（到达账本、四种投递意图、裁决决定表）、trigger 队列项与
`takeTrigger`、`waiting_human`/`waiting_gate`、占位与 epoch 的分离、系统发起的复合打断；
驱动器推进规则由 [run-driver v1](../run-driver/README.md) 消费本版定义。

[v1 设计来源与评审](../../../docs/proposals/core-capabilities/README.md)、[v1 验证范围](../../../docs/proposals/core-capabilities/verification.md)；
[v2 设计来源](../../../docs/proposals/agent-loop-inbound/README.md)、[v2 验证范围](../run-driver/verification.md)（Inbound 段由 run-driver 模型覆盖，队列与强停仍由 v1 的 QueueControl 覆盖）。本版本为目标契约，源码 fork 不表示实现已符合。

当前实现映射见 [Session 提供者](../../../packages/session/session/design.md)、
[恢复](../../../packages/session/persistence/design.md)及
[投影](../../../packages/session/projection/design.md)；采用范围与未交付义务随所属正文维护。
