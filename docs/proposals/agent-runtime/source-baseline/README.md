# DSH agent 源设计基线（历史候选）

这里保存固定上游 `c291e7961a515f6d7af9304e7fd1d257929aef26` 的原语观察、
候选语义和历史验证。原件曾依用户当时要求放在 `spec/capabilities/live-agent/draft/`；
2026-09-13 用户要求正式化后清理 draft、按提案 → 决定 → 架构/规格组织，现移至本处。
这些源语义没有整体接受为 OMNE 契约。

当前正式规格是 [live-agent v1](../../../../spec/capabilities/live-agent/v1/contract.md)，
接受依据为 [D-005](../../../decisions/D-005-agent-runtime.md)；已完成的定向源码阶段见
[fork 验收](../fork/review.md)。下述“待验收”“尚未 fork”是原阶段的历史表述，
不能用于判断当前设计或实现进度。

| 历史材料 | 范围 |
|---|---|
| [源语义候选](design/contract.md)、[场景](design/scenarios.md) | 原注册表、发起者、工厂与相关上游语义 |
| [来源映射](source-map.md)、[文件清单](upstream-baseline.json) | 研究版本、源码及测试摘要 |
| [历史评审](review.md)、[验证](evidence/validation.md) | 当时的审阅与执行范围，不等于 OMNE 目标实现符合性 |
| [注册表模型](design/AgentRegistry.tla)、[发起者模型](design/InitiatorScope.tla) | 有限的源算法抽象；当前复跑路径由 [formal-tasks](../../../../spec/formal-tasks.json)登记 |
| [迁移映射](relocation.json) | 原 commit/路径/哈希、现路径与链接调整后的哈希 |

原日志、JSON 快照、模型和配置保持字节不变；Markdown 只重算本地链接。历史日志
中的旧绝对工作树路径不作为当前执行入口，沿迁移映射和当前 formal-tasks 复跑。
原提交对象由既有需求基线 tag/bundle 保留。新业务候选继续在 proposals 评审，
只有接受的精确规范进入 spec，不在 spec 长期并置同名 draft 与正式版本。
