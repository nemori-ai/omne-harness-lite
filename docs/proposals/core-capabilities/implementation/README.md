# 首批核心能力的实施选择与接受来源

首批路线将定向 fork 推进为受租户隔离、可耐久等待人类批准并在重启后接续的
文本 Agent 流程。原 [M1/M2 范围](scope.md)分别验证真实工具审批和 OpenRouter
消费；后续收窄的[最小运行节点](runtime-baseline.md)先验证确定性 allow 闭环，
其通过不等于完整 M1/M2 交付。

本目录保留对长期消费者有意义的路线、接口来源、反例和接受事实。当前提供者
与装配正文归[包入口](../../../../packages/README.md)及
[local-harness 设计](../../../../apps/local-harness/design.md)；当前覆盖与未交付范围归
[核心架构](../../../architecture/core-capabilities.md)，执行进度不在本目录维护。

| 历史判断与证据 | 入口 |
|---|---|
| 路线范围、实现约束和行为场景 | [范围](scope.md)、[实施选择](implementation-spec.md)、[路线理由](plan.md)、[A01–A32](acceptance.md) |
| 共享数据、记录和准入的原受审输入 | [共享接口来源](shared-interfaces.md) |
| 共享日志/trace、目录 owner 及反例 | [D-010 来源](observability.md)、[D-011 来源](observability-directory.md) |
| TG/AU/BG 与 Agent/Session 受审输入 | [治理来源](governance-interfaces.md)、[Session 来源](session-runtime-interfaces.md)、[运行映射来源](runtime-provider-interfaces.md) |
| 工具、审批与本地执行的范围差异 | [TL/HD/LE 来源](tool-decision-interfaces.md) |
| 接受身份、原反例与实际结果 | [固定交付记录](delivery.md)、[独立评审](review.md) |

实施起点 `570000a` 消费 D-005～D-009，DSH 来源固定为
`c291e7961a515f6d7af9304e7fd1d257929aef26`；需求与补充要求的恢复身份继续归
[原消费记录](../requirements.md)。用户授权按系统目标与产品机制推进二次开发、
采用 TDD 并对照文档核实交付；这些授权不改变冻结契约或 main 合并权限。
