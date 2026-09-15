# 核心工作准入与耐久协调

当前推荐版本：[v2](v2/contract.md)，接受依据 [D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)；
[v1](v1/contract.md)（[D-008](../../../docs/decisions/D-008-core-capabilities.md)）保持冻结与可引用，
未迁移的消费者继续按 v1。v2 与 v1 只有一处差异：CC-01 的原子关系声明规则改为"本契约
及同一协调域内发布的组合契约明确声明的组合"，使
[生命周期组合 v1](../session-run-agent-lifecycles/README.md) 能逐行声明 Session 与 Run 拆分后的
同提交关系；其余条款原文不变，v1 的 `Admission` 模型仍是这些条款的证据。

[设计来源与评审](../../../docs/proposals/core-capabilities/README.md)、[v1 验证范围](../../../docs/proposals/core-capabilities/verification.md)、
[v2 变化来源](../../../docs/proposals/session-run-agent-lifecycles/review.md)。本版本为目标契约，源码 fork 不表示实现已符合。

当前短门、双视图与精确使用的提供者映射见
[admission 设计](../../../packages/coordination/admission/design.md)，提交后的事实广播
义务见[生命周期组合 LC-06](../session-run-agent-lifecycles/v1/contract.md)；产品仍待实现与组合验收。
