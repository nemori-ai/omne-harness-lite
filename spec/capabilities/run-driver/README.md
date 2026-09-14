# Run 驱动器

**当前正式契约为 [capability.run-driver v1](v1/contract.md)**，接受依据
[D-012](../../../docs/decisions/D-012-run-driver-and-inbound.md)；精确版本、状态与
接受依据以 [catalog](../../catalog.json) 为准。它消费
[session-run v2](../session-run/v2/contract.md) 的 Run/Step/占位与 Inbound 定义，在
tools v1、human-decisions v1、model-execution v1、CC v1 的已提交事实上推进，不改写
这些能力的状态转移。

| 对象 | 当前状态与依据 |
|---|---|
| run-driver v1 设计与规格 | 已接受；[设计来源与评审](../../../docs/proposals/agent-loop-inbound/README.md)、[接受记录](../../../docs/proposals/agent-loop-inbound/README.md#接受记录)、[验证范围](verification.md) |
| 形式模型 `RunDriver.tla` | 有限模型检查通过（三个安全配置、三个进展配置、四个否定变体），范围见验证说明；不是无条件证明 |
| 目标实现 | 尚未开始；DSH agent-loop 的[源基线](../../../docs/proposals/core-capabilities/fork/loop-source.md)按 [取舍表](../../../docs/proposals/agent-loop-inbound/loop.md#对-dsh-agent-loop-源码的取舍)只保留算法思想 |

[规范场景](v1/scenarios.md)列出提供者验收条件。设计接受、模型检查与实现验收
分别记录；本页不代替精确契约。
