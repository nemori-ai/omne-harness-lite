# Session 与 Agent Runtime 第一期设计

状态：完整候选设计，等待限定接受。产品负责人已授权自主完成设计；这不等于接受新的技术接口或交付故事卡。

本提案选择持久会话推进、模型消息投影和动态会话装配的承载方式。
正式输入为PF-012 rev24、PF-010 rev8、PF-014 rev13、PF-015 rev21的适用规则，以及
[架构维护规则](../../../architecture/README.md)、[Cordis集成约定](../../../realization/cordis-integration-conventions.md)、SYS-KERNEL／TENANT／COMPOSITION／SPEC。
接受范围按各PF decisions逐项读取，不从最新rev推出整包接受。

现存Session实现除runtime context限定部分外不作为正式基线。模型／工具已有承诺、identity与runtime context的限定接受和验证义务保持。
新增成员在实际实施前取得接口／行为采用依据；本包的接口草稿不是workspace成员，也不是第二份现行契约。

| 问题 | 唯一入口 |
|---|---|
| 领域责任、系统预期和跨模块动作链 | [系统设计](../../../architecture/session-agent-runtime-phase1/README.md) |
| 质量场景与候选比较 | [选择对象](design.md)、[三组候选](alternatives.md) |
| 新成员／迁移成员的候选公开形状与薄行为 | [候选承诺目录](contracts/README.md)；接受后逐份移动到真实成员，不并存两份现行源 |
| 已发生的独立评审与处置 | [评审记录](review.md) |

准入：存在真实持久化覆盖缺口、职责蔓延和会话作用域缺口；每组至少三个实质候选，比较同一组必要性质。具体实施进度与施工计划留任务tmp。

后续消费：ST-015-01施工首先切换会话持久化、调用归因及消息投影，不能只让demo多一个入口。首卡不含工具、恢复演示或第二入口；底层适用安全要求不因卡切薄而消失。设计探针／模型只证明其界定范围，真实OpenRouter、当前授权、包构建与故障验收由后续实施提供。
