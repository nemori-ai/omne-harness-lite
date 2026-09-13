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

## 上游源基线的历史入口

`draft/` 保存此前对固定上游的原语设计基线。原[评审](review.md)与
[验证记录](evidence/validation.md)中的“待验收”“尚未 fork”等文字描述的是
**该次源基线交付时的历史状态**。此后目标设计和源码阶段分别沿上表完成接受；
原草案没有被整体发布为本项目 v1 契约。

这些材料依用户当时要求保存在 `spec/`，用于复查源事实、候选取舍和演进差异，
不成为目标 v1 的隐含依赖，也不改变其它候选的提案流程。原入口内容可在源基线
提交 bad8af9 查阅；本入口维护当前导航。

| 入口 | 内容 |
|---|---|
| [源基线候选](draft/contract.md) | 固定上游的职责、身份、操作、不变量、失败、依赖与演化边界 |
| [源基线场景](draft/scenarios.md) | 当时的验收条件和验证映射 |
| [注册表模型](draft/AgentRegistry.tla) | 注册、公告、重入撤销、同 ID 再注册 |
| [发起者模型](draft/InitiatorScope.tla) | 接纳关闭、被跟踪工作的排空、自卸载排除 |
| [来源映射](source-map.md) | 固定的上游与需求基线、源事实和本项目建议的区分 |
| [源文件清单](upstream-baseline.json) | 源码、类型、测试及相关依赖的 SHA-256 |
| [验证记录](evidence/validation.md) | 实际执行范围、结果与未覆盖部分 |
| [源基线历史评审](review.md) | 当时的独立评审、修订处置及阶段边界；目标 v1 的评审见[目标设计评审](../../../docs/proposals/agent-runtime/review.md) |
