# Live Agent 运行时

目标版本为 [capability.live-agent v1](v1/contract.md)，身份引用
[data.agent-runtime-identity v1](../../data/agent-runtime-identity/v1/contract.md)。
选择依据见 [D-005](../../../docs/decisions/D-005-agent-runtime.md)，
本轮设计与接受范围见[提案入口](../../../docs/proposals/agent-runtime/README.md)，
执行覆盖见[目标验证](verification.md)。设计正式化不意味着已经 fork 或实现。

## 上游源基线的历史入口

以下内容保留先前源基线交付的范围和状态；draft、来源清单、评审与 evidence
仍只解释当时固定上游，不成为本项目目标 v1 的隐含依赖。原入口内容可在
源基线提交 bad8af9 查阅；本次只更新当前导航。

### Live Agent 原语设计基线

状态：**待验收草案**，尚未登记为可消费的正式契约，也尚未 fork 产品源码。

2026-09-13，用户确认复用 `dsh-agent`，要求先在 `spec/` 落盘设计基线，经过架构
设计、独立评审和验收后再进入下一步。本目录依这次明确要求保存候选；这是本次
放置位置的例外，不改变其他候选的提案流程，也不把复用方向的确认扩大成细节批准。

本基线约束的是包级运行时原语，不是 OMNE Agent、Session 或 Agent Loop 的完整契约。
用能力、实例、作用域、所有权、事件和状态转移建模；TypeScript API 是实现映射。

| 入口 | 内容 |
|---|---|
| [候选契约](draft/contract.md) | 职责、身份、操作、不变量、失败、依赖与演化边界 |
| [规范场景](draft/scenarios.md) | 可观察的验收条件和验证映射 |
| [注册表模型](draft/AgentRegistry.tla) | 注册、公告、重入撤销、同 ID 再注册 |
| [发起者模型](draft/InitiatorScope.tla) | 接纳关闭、被跟踪工作的排空、自卸载排除 |
| [来源映射](source-map.md) | 固定的上游与需求基线、源事实和本项目建议的区分 |
| [源文件清单](upstream-baseline.json) | 源码、类型、测试及相关依赖的 SHA-256 |
| [验证记录](evidence/validation.md) | 实际执行范围、结果与未覆盖部分 |
| [评审记录](review.md) | 独立架构评审、修订处置和剩余验收项 |

接受本基线意味着接受明确列出的原语语义与边界，**不意味着**产品功能已经实现、
上游整个类型体系已成为 OMNE 数据契约，或后续 Loop、存储、授权设计已经获准。

验收后才能发布精确版本、记录接受依据、固定需求消费基线并登记 catalog/frozen；
随后单独进入源码 fork 的设计与实施。本轮不自行执行这些后续动作。
