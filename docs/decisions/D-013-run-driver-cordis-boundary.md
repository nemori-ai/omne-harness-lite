---
kind: decision
id: D-013
status: accepted
scope: Run 驱动器在 Cordis 系统中的消费方式、装载效应与撤除责任、四类提供者接口对接、依赖变化对进行中 Run 的政策与提供者设计归属；补充 D-012，不改其语义层选择
date: 2026-09-14
sources:
  - ../proposals/agent-loop-inbound/README.md
acceptance: ../proposals/agent-loop-inbound/README.md#接受记录
supersedes: []
---

# D-013：Run 驱动器的 Cordis 视角与提供者边界

接受[提案的 Cordis 视角文件](../proposals/agent-loop-inbound/cordis.md)。D-012
接受的是驱动器与 Inbound 的语义层；本决定补上同一设计在 Cordis 系统里的
运行位置、效应与责任，两者共同构成 run-driver v1 的完整设计。精确契约仍是
[run-driver v1](../../spec/capabilities/run-driver/v1/contract.md)与
[session-run v2](../../spec/capabilities/session-run/v2/contract.md)，前者 RD-04
在合并前原地补入重取的兼容前提。

## 选择

- 驱动器是 Factory 为每个活体实例准备并拥有的实例驱动（D-007 四类接口之"谁准备
  和驱动实例"），不是全局服务，不暴露为工具，不开放 hook；`decide` 是无状态纯
  函数。驱动器包只提供 Factory 贡献与驱动位置投影 reducer，其余都是对既有能力
  的消费。Session 级裁决者与调度者是 session-run 提供者的宿主级服务。
- 装载效应与撤除责任成对说明：贡献登记、实例驱动、工作许可、投影贡献、订阅、
  帧投影监听各有建立条件、所有者、撤除动作与完成判据；事实一律保留，Yield 结算
  本实例的工作许可但不结算 Run。复合退出过程沿 AR-12 与 Agent 提供者设计已接受的
  单一过程，不拆成并发 disposer。
- 四类接口对接：CB-09 ↔ E0 的联合准入与每次提交的 epoch/checkWork；AR-12 步骤 1 ↔
  Yield 前提与热宽限；步骤 2 ↔ 后台调用与 HITL 从一开始归独立权威（CB-11）；
  步骤 3/CB-10 的静止判据 = Run 已 Yield/终态/interrupted/stopping、位置可由投影
  重算、工作许可已结算；AR-13 ↔ `yield_forced` 是驱动政策而非超时成功。
- 依赖变化不引入新的 Run 状态：能力配置在各自工作边界重新求值（AR-9），实例
  存续必需绑定的变化走关实例/Yield/重取，操作必需条件的变化走 `waiting_gate`，
  调用级绑定沿 TL-06 结算。驱动器实现换代后的重取须通过 SR-14 恢复兼容证据核对
  Run 记录的驱动绑定，不兼容不自动迁移（A-10）；资格失效由实例关闭与重取门承担，
  不新增门种类（A-11）。
- 提供者设计归属：建议新建叶子包 `packages/agent/run-driver`（D-009），Session 级
  裁决/调度归 `packages/session/session`；服务键、注入、订阅接口形状、投影
  stateKey、driverKey/version 与兼容性声明的形状留到 Session 与工具提供者设计接受
  后闭合，缺口已在提案未决项记录负责产物与受影响消费者。

## 理由与边界

这些选择让驱动器的生命周期完全由已接受的 live-agent v1 与附着组合 v1 承担，
不另造运行时对象或第二事实源；依赖变化的每种情形都映射到既有条款，驱动器
只需在安全边界看到准入被拒。代价是不兼容的驱动器升级会把持占位的 Run 留在
原地直到人工处置，资格失效期间该 Session 的普通排队输入被阻塞。

证据为 [cordis.md §6](../proposals/agent-loop-inbound/cordis.md#6-性质前提证据与未完成义务)
的对应表：装载效应的撤除以论证给出，静止与重取由 RunDriver 有限模型的 Yield/
重取动作部分覆盖但未与 live-agent Runtime.tla 组合，换代重取与依赖变化复用既有
契约。未完成义务：提供者实现的装卸与清理失败测试、实例关闭期间 Yield 前提不满足
的组合场景、兼容性声明的形状、`gate_restored` 生产者义务、出站流协议。本决定接受
设计与责任归属，不接受任何实现。

需求消费基线与 D-012 相同，为 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`，见
[消费记录](../proposals/agent-loop-inbound/requirements.md)。
