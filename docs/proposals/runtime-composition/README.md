---
kind: proposal
id: P-runtime-composition
status: accepted
scope: 本批能力的共同边界、内核映射与 Agent/Session 运行附着组合，不包含完整 Session/Run/tools/LLM 子系统
---

# 运行时共同边界与 Session 附着

本提案的共同边界与组合契约已由 [D-007](../../decisions/D-007-runtime-composition.md)
接受。当前系统视图见[运行时组合](../../architecture/runtime-composition.md)；下文保留
任务来源和设计论证，精确规范已从候选目录移入 spec，未保留另一份 draft 正文。

本轮承接 [D-006 的工作 A](../dsh-core-adoption/design-plan.md)：先完成共同契约与
内核映射，再使各能力在必需接口接受后分别推进设计和开发。2026-09-13 用户明确
要求开始设计，按提案 → 决定 → architecture/spec 正式化，并提供 context-sessions
交接材料；本任务未获得新增产品源码导入、实现或 main 合并授权。

设计对象为 Session 与活体的交接、四类运行时提供者接口，以及状态、调用上下文、
模型上下文与工具事实的唯一归属。本轮不声称已完成整个 Session 日志/队列/Run、
模型或工具系统；后续必须完成的具体设计在[覆盖与门槛](requirements.md)记录。

- [设计与 Cordis 映射](design.md)：能力责任、端口组合、生命周期和替代方案。
- [正式组合契约](../../../spec/compositions/agent-session-binding/v1/contract.md)：`composition.agent-session-binding v1`。
- [符合性场景](../../../spec/compositions/agent-session-binding/v1/scenarios.md)：真实实现须兑现的竞争、退出和失败情形。
- [需求与输入](requirements.md)、[来源](sources.md)：确认范围和新旧基线差异。
- [独立评审](review.md)：受审对象、发现处置与验证范围。
- [验证映射](verification.md)：有限模型、故障反例及未执行的真实组合场景。

已有 `data.agent-runtime-identity v1`、`capability.live-agent v1` 保持有效。本轮仅
细化其跨提供者交接，不修改冻结版本，不把上游源草案整体变成产品契约。已将该
历史草案迁至[来源入口](../agent-runtime/source-baseline/README.md)，原证据可追溯。

## 接受记录

2026-09-13，任务作者在用户“现在先做设计”并要求按提案、决定、architecture/spec
正式落档的授权范围内，结合独立评审接受本次有限设计。不是评审者代为批准，
也不表述为用户逐条审阅了新协议。

- 接受对象：D-006 工作 A 的共同能力归属与四类提供者交接；
  `composition.agent-session-binding v1` 的正文、模型、正常配置及规范场景。
- 受审修订：`adafb2dc1bb8db19e2aac40567feb607aa97bdbe`，首次快照为 `77b351e`。
  评审唯一的非阻断依赖方向歧义已修订并复核，范围内未发现阻断问题。
- 正式规范按受审字节迁移，[发布清单](../../../spec/compositions/agent-session-binding/evidence/v1/publication.json)
  记录旧路径、新路径及哈希。catalog 登记 D-007 为接受依据，frozen 冻结四份文件；
  identity/live-agent v1 的八份已发布文件保持不变。
- 验收证据：有限安全模型 10,748 状态通过，八项故障各产生预期不变量反例；
  需求基线独立恢复及规范迁移可核对。最终检查见[交付验证](../../../spec/compositions/agent-session-binding/verification.md)。
- 不纳入本次接受：完整 Session/Run/tools/LLM/装配及共享内容结构、真实提供者
  符合性、实现闭环、跨进程故障协议。后续工作仍受[覆盖和门槛](requirements.md)约束。

源码导入、产品开发和 main 合并分别属于后续任务，本次接受不改变其状态。
