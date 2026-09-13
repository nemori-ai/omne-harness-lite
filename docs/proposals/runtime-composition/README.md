---
kind: proposal
id: P-runtime-composition
status: in-review
scope: 本批能力的共同边界、内核映射与 Agent/Session 运行附着组合，不包含完整 Session/Run/tools/LLM 子系统
---

# 运行时共同边界与 Session 附着

本轮承接 [D-006 的工作 A](../dsh-core-adoption/design-plan.md)：先完成共同契约与
内核映射，再使各能力在必需接口接受后分别推进设计和开发。2026-09-13 用户明确
要求开始设计，按提案 → 决定 → architecture/spec 正式化，并提供 context-sessions
交接材料；本任务未获得新增产品源码导入、实现或 main 合并授权。

设计对象为 Session 与活体的交接、四类运行时提供者接口，以及状态、调用上下文、
模型上下文与工具事实的唯一归属。本轮不声称已完成整个 Session 日志/队列/Run、
模型或工具系统；后续必须完成的具体设计在[覆盖与门槛](requirements.md)记录。

- [设计与 Cordis 映射](design.md)：能力责任、端口组合、生命周期和替代方案。
- [组合契约候选](candidate/contract.md)：拟发布 `composition.agent-session-binding v1`。
- [符合性场景](candidate/scenarios.md)：真实实现须兑现的竞争、退出和失败情形。
- [需求与输入](requirements.md)、[来源](sources.md)：确认范围和新旧基线差异。
- [独立评审](review.md)：受审对象、发现处置与验证范围。
- [验证映射](verification.md)：有限模型、故障反例及未执行的真实组合场景。

已有 `data.agent-runtime-identity v1`、`capability.live-agent v1` 保持有效。本轮仅
细化其跨提供者交接，不修改冻结版本，不把上游源草案整体变成产品契约。已将该
历史草案迁至[来源入口](../agent-runtime/source-baseline/README.md)，原证据可追溯。
