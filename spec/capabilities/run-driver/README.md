# Run 驱动器

**当前正式契约为 [capability.run-driver v2](v2/contract.md)**，接受依据
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)；[v1](v1/contract.md)
（[D-012](../../../docs/decisions/D-012-run-driver-and-inbound.md)）保持冻结与可引用，标为
superseded。v2 与 v1 只有引用差异：v1 引用的 session-run v2 已拆为
[session v1](../session/README.md) 与 [run v1](../run/README.md)，占位与执行者关系归
[生命周期组合 v1](../../compositions/session-run-agent-lifecycles/README.md)，共同准入升为
[CC v2](../../compositions/core-work-coordination/README.md)；条款语义、编号、模型与场景不变。
精确版本、状态与接受依据以 [catalog](../../catalog.json) 为准。

| 对象 | 当前状态与依据 |
|---|---|
| run-driver 设计与规格 | v1 由 D-012 接受，v2 由 D-014 接受（仅引用变化）；[设计来源与评审](../../../docs/proposals/agent-loop-inbound/README.md)、[Cordis 视角](../../../docs/proposals/agent-loop-inbound/cordis.md)、[验证范围](verification.md) |
| 形式模型 `RunDriver.tla` | v2 目录内的模型与配置是 v1 的逐字节副本；有限模型检查通过（三个安全配置、三个进展配置、四个否定变体），范围见验证说明；不是无条件证明 |
| 目标实现 | 尚未开始；提供者设计归 [run-driver 包](../../../packages/agent/run-driver/design.md)；DSH agent-loop 的[源基线](../../../docs/proposals/core-capabilities/fork/loop-source.md)按 [取舍表](../../../docs/proposals/agent-loop-inbound/loop.md#对-dsh-agent-loop-源码的取舍)只保留算法思想 |

[规范场景](v2/scenarios.md)列出提供者验收条件。设计接受、模型检查与实现验收
分别记录；本页不代替精确契约。
