# Live Agent 运行时

**当前正式契约为 [capability.live-agent v1](v1/contract.md)，已接受并登记。**
精确版本、状态和接受依据以 [catalog](../../catalog.json) 为准；身份依赖
[data.agent-runtime-identity v1](../../data/agent-runtime-identity/v1/contract.md)。

| 对象 | 当前状态与依据 |
|---|---|
| OMNE live-agent v1 设计与规格 | 已接受；见 [D-005](../../../docs/decisions/D-005-agent-runtime.md)、[接受记录](../../../docs/proposals/agent-runtime/README.md#接受记录)与[目标验证](verification.md) |
| 定向 dsh-agent 源码 fork | 来源基线已导入并完成阶段验收；见 [agent 包](../../../packages/agent/README.md)与[fork 验收](../../../docs/proposals/agent-runtime/fork/review.md#阶段验收结论) |
| live-agent v1 目标实现 | 尚未完成；现有源码基线尚未兑现完整租户、实例身份和退出等目标保证，具体差距见[包的来源与边界](../../../packages/agent/UPSTREAM.md) |

设计接受、源码导入和目标实现验收分别记录。下方历史源草案的状态不代表当前
v1 的状态，源测试和有限模型检查的覆盖也不等于目标实现已通过验收。

四类提供者的共同发布与释放协议见已接受的
[Agent/Session 附着组合 v1](../../compositions/agent-session-binding/v1/contract.md)，
补充本能力的端口义务，未改写冻结的 live-agent v1。

## 上游源基线的历史入口

原 `draft/`、源映射及其评审/验证材料已移至
[DSH agent 源设计基线](../../../docs/proposals/agent-runtime/source-baseline/README.md)。
它们用于复查固定上游及演进差异，未整体发布为项目契约；历史“待验收”表述
不改变上表的当前状态。迁移保留原证据与路径/哈希映射，正式 v1 文件保持不变。
