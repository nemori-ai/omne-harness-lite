# Run、Step、执行权与控制

**当前正式契约为 [capability.run v1](v1/contract.md)**，接受依据
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)；精确版本、状态与接受
依据以 [catalog](../../catalog.json) 为准。它与 [session v1](../session/README.md) 一起取代
[session-run v2](../session-run/README.md)：Run、状态、epoch、Step、驱动位置投影、取得下一
Step 的条件、控制、复合打断对旧 Run 的处置、命令 Run 的终态映射与恢复兼容证据归本
能力；推进规则由 [run-driver v2](../run-driver/README.md) 消费本版定义；占位与执行者
关系归[生命周期组合](../../compositions/session-run-agent-lifecycles/README.md)。

| 对象 | 当前状态与依据 |
|---|---|
| run v1 设计与规格 | 已接受；[设计来源与评审](../../../docs/proposals/session-run-agent-lifecycles/README.md)、[Run 候选正文](../../../docs/proposals/session-run-agent-lifecycles/run.md)、[接受记录](../../../docs/proposals/session-run-agent-lifecycles/README.md#接受记录) |
| 形式模型 | Run 的推进与等待由 [run-driver 模型](../run-driver/verification.md) 覆盖；状态机与占位/执行者关系由 [生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md) 覆盖；RN-03 中"对 interrupted 的 Run 做 cancel/force_stop 直接到 cancelled"由后者的反例得出 |
| 提供者设计 | [Run 提供者](../../../packages/session/run/design.md)（新建叶子包，目标实现尚未开始） |

本页不代替精确契约；实现符合性另行验收。
