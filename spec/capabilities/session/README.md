# 会话、耐久输入与到达账本

**当前正式契约为 [capability.session v1](v1/contract.md)**，接受依据
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)；精确版本、状态与接受
依据以 [catalog](../../catalog.json) 为准。它与 [run v1](../run/README.md) 一起取代
[session-run v2](../session-run/README.md)：Session 身份与生命周期、历史、输入队列、复合
打断的受理、会话级强停的 hold、状态贡献注册、恢复顺序与 Session Inbound 归本能力；
占位、执行者与三台状态机的级联归
[生命周期组合](../../compositions/session-run-agent-lifecycles/README.md)。

| 对象 | 当前状态与依据 |
|---|---|
| session v1 设计与规格 | 已接受；[设计来源与评审](../../../docs/proposals/session-run-agent-lifecycles/README.md)、[条款归属](../../../docs/proposals/session-run-agent-lifecycles/session.md#2-条款逐句归属)、[接受记录](../../../docs/proposals/session-run-agent-lifecycles/README.md#接受记录) |
| 形式模型 | Inbound 裁决与转换由 [run-driver 模型](../run-driver/verification.md) 覆盖；生命周期与级联由 [生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md) 覆盖；队列顺序、命令与强停仍由 session-run v1 的 `QueueControl` 覆盖 |
| 提供者设计 | [Session 提供者](../../../packages/session/session/design.md)、[恢复](../../../packages/session/persistence/design.md)、[投影](../../../packages/session/projection/design.md)；目标实现尚未开始 |

本页不代替精确契约；实现符合性另行验收。
