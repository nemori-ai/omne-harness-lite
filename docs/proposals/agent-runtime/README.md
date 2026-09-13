---
kind: proposal
id: P-agent-runtime
status: accepted
scope: 从 Cordis 视角定义 OMNE 活体 Agent 的身份、装配、授权边界和生命周期
---

# Agent 运行时 v1

本提案把固定上游的原语观察转为 OMNE 目标设计。设计交付包括
[架构视图](../../architecture/agent-runtime.md)、[选择与取舍](v1/design.md)、
[来源与差异](v1/source-mapping.md)、[需求范围](v1/requirements.md)、
[精确规格](../../../spec/capabilities/live-agent/v1/contract.md)和[评审记录](review.md)。

## 用户依据与正式化范围

2026-09-13，用户先确认复用 dsh-agent、在 spec 保存源设计基线，并要求每一步
完成架构设计、评审和验收再进入下一步；随后明确除 Cordis 官方发布包外，选定
DSH 组件由本项目 fork 维护。源基线完成独立评审后，本轮明确要求：

> 从 Cordis 视角出发完成正式的建模和架构设计，并正式化落好 docs/architecture、docs/decisions、spec/

本轮以此开展目标设计并正式化。没有用户逐项确认的新技术细节，不伪称已有
历史接受；授权依据、作者形成的技术选择与独立评审分别记录。阶段范围是内核运行时，不能
扩大为完整 Agent Loop、Session、租户 IAM 或源代码导入授权。

## 接受记录

本次正式化依据是上节用户对本轮建模、架构设计和三个正式目录落盘的明确授权，
以及先前确认的复用、维护和阶段边界。技术选择由本任务作者在这些约束内形成，
不记录为用户已经逐条预先选定，也不记录为评审者接受。

登记对象为 [D-005](../../decisions/D-005-agent-runtime.md)、
[data.agent-runtime-identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)
和 [capability.live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md)。
规范文件集合和内容由 [frozen](../../../spec/frozen.json) 固定；
[独立评审记录](review.md)绑定实际修订与发现处置，
[验证记录](../../../spec/capabilities/live-agent/verification.md)说明实际执行及边界。
原 draft 只作为上游源语义依据保留，不整体转为正式契约。

正式化只覆盖这份内核运行时设计：租户/实例身份、受信实现前提、受限能力入口、
装配与工作绑定、独占激活、退出及提供者使用关系。最终动态判据、完整恢复、
Session/Run、Definition/IAM、插件执行隔离和后续组合仍按需求覆盖保留。
这不撤回逐阶段评审与验收要求，不等于产品实现完成，也不授权自行进入源码
fork、二次开发、主分支合并或对外发布。下一阶段另以本次设计及其验收结果派发。

源码阶段已由后续用户任务单独授权，计划和交付沿[定向 fork](fork/plan.md)进入；
上述历史正式化范围保持不变。
