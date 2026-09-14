# 设计提案

这里保存有长期取舍价值的候选设计及裁决结果，供后续决定和精确契约追溯。
新增前按[持久化准入](../maintenance/organization.md#提案的持久化准入)判断对象、
价值和下游拥有者，再按[提案内容](../maintenance/knowledge-flow.md#提案需要留下什么)
说明性质与证据义务。具体语义未明确接受前不能作为正式契约；临时排期和一般
讨论不因涉及设计就永久进入本目录。

- [文档与规格体系](documentation-system/README.md)：组织与治理方向已接受，原提案保留。
- [性质与证据义务贯通设计和交付](evidence-governance/README.md)：目录准入、需求推导、证明门槛和计划消费的本轮治理候选。
- [架构设计与规格维护衔接](design-spec-maintenance/README.md)：具体提供者正文、设计就绪与变更传播的本轮治理候选。
- [系统目标与产品要求作为设计基础](requirements-foundation/README.md)：组织与追溯规则已接受，见 D-004；历史讨论与评审保留。
- [Agent 核心](agent-core/README.md)：提示词、工具与执行历史候选；本批当前接受范围见 [D-008](../decisions/D-008-core-capabilities.md)，未覆盖部分保持候选。
- [工具系统](tool-system/README.md)：多命令工具、技能依赖、调用与动态装配的历史候选；本批接受范围见 D-008，原建议不整体生效。
- [DSH 核心能力源码采用范围](dsh-core-adoption/README.md)：本批 fork 集合、依赖处理及分阶段设计边界已接受，见 D-006；后续本批目标契约见 D-008，产品组合仍待验收。
- [运行时共同边界与 Session 附着](runtime-composition/README.md)：D-006 工作 A 的共同边界和组合 v1 已接受，见 D-007。
- [核心能力设计与二次开发](core-capabilities/README.md)：D-008 目标契约和 D-009 职责布局已接受；[首批实施来源](core-capabilities/implementation/README.md)保留路线和接受证据，当前覆盖从[核心架构](../architecture/core-capabilities.md)进入。
- [租户契约](tenant-contracts/README.md)：旧模型语义迁移的历史候选；本批当前接受范围见 D-008，其余建议仍待确认。
- [模型契约](model-contracts/README.md)：旧模型语义迁移，待逐项确认。

转化规则见[知识流转](../maintenance/knowledge-flow.md)。

- [Agent Loop 与 Session Inbound](agent-loop-inbound/README.md)：阶段 E 的 Run 驱动器拓扑、到达账本与循环不变式；accepted，由 D-012 发布 run-driver v1 与 session-run v2，D-013 接受其 Cordis 视角与提供者边界，两轮评审与用户/作者裁决记录在内。
- [Agent 运行时 v1](agent-runtime/README.md)：Cordis 视角的身份、装配和资源生命周期；源基线到目标契约的明确差异。
- [Session、Run 与 Agent 实例：生命周期、关系与级联](session-run-agent-lifecycles/README.md)：三台状态机的权威拆分、三条关系与级联的组合契约、三者的 Cordis 视角与提供者设计；已由 [D-014](../decisions/D-014-session-run-agent-lifecycles.md) 接受（session v1、run v1、生命周期组合 v1、CC v2、run-driver v2），承接并部分取代 D-012/D-013。
