# 系统目标与产品要求

[文档地图](../README.md) · [当前架构](../architecture/README.md)

这里维护 omne-harness-lite 要实现什么、最终达到怎样的状态，以及必须满足的产品
特性和全局约束。已确认内容是后续系统建模、能力定义、设计与产品化的前提。
用户仍在逐步介绍；内容未完整不影响已确认要求生效，也不能由现有实现反推空白。

| 阅读方向 | 入口 |
|---|---|
| 系统目标、最终状态与全局要求 | [系统要求](system/README.md) |
| 按环境、用户、智能体查找特性 | [产品三维](product/README.md) |
| 确认范围、来源补充和需求变更怎样维护 | [需求维护](../maintenance/requirements.md) |
| 原完全动态定义与存在时间线 | [原文及 Git 历史](../research/fully-dynamic-system/README.md) |
| 已经采用的选择与尚未覆盖的要求 | [当前架构](../architecture/README.md#需求覆盖与缺口) |

2026-09-12，用户要求逐步记录完整系统目标，并指定其为后续工作的前提；同日明确
完全动态目标、产品最终状态、功能继承方向、前两项产品特性及三维框架，并接受
[需求基础提案](../proposals/requirements-foundation/README.md#接受记录)。各正文记录
具体确认范围，来源补充和未决问题分别标明；没有对未来补充整页预先接受。

同日，用户继续补充[运行时与持久状态解耦、恢复接续及异构适配](system/runtime-state-and-continuity.md)
的系统目标；其三项确认范围和来源参考在独立正文维护。

跨主题仍待展开的内容从各自拥有者进入：[动态定义的量词](system/fully-dynamic-system.md#待澄清)、
[产品达成判断](system/long-running-and-evolving.md#待澄清)、
[利益对齐](system/interest-alignment.md#待澄清)、
[继承截止范围](system/omne-next-continuity.md#待澄清)。

需求的稳定身份与当前路径从这些正文发现；不另建全局 JSON 清单。既有
proposals → decisions 体系继续使用，[D-004](../decisions/D-004-requirements-foundation.md)
记录本次组织与权威调整。
