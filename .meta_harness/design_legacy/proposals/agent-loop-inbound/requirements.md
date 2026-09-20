# 需求消费与设计覆盖

本提案的需求基线为 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`（工作树 HUB 当时
包含的需求正文），保留引用 `refs/tags/requirements-baseline/2026-09-14-agent-loop-inbound`；
逐文件哈希与相对 D-008 基线的差异列于[恢复记录](evidence/requirements-baseline.json)。
保留引用只在本地仓库建立，远端是否保存另行说明。用户在设计讨论中的裁决
（U-1～U-16）记录于[提案入口](README.md#裁决记录2026-09-14用户)，不改写需求正文。

| 要求及确认范围 | 本轮设计归属和验收要点 |
|---|---|
| [PF-013.C1–C11](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求) | 队列消费（合批、命令与 trigger 分隔、撤回边界）、复合打断、强停晚到结算隔离、有界与保序；落在 session-run v2 SR-04/06/07/11/12/18/19 |
| [PF-002.C8/C9](../../requirements/product/environment/PF-002-external-change-response.md#已确认要求) | 被动订阅只记指针与水位、永不唤醒；条件触发按获准配置排队或系统发起复合打断；落在 SR-16/17/19 |
| [PF-003.C1–C6](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求) | 前台等待、detach 与收束、重建后重连；落在 run-driver RD-09/10/16 |
| [PF-004.C3/C5/C7](../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md#已确认要求) | 派发是普通工具调用，结果沿 call_settlement 路由并以发起该调用的 Run 为判定对象，定时派发无发起 Run 而排队触发 master；终止传播仍归 PF-004 后续设计 |
| [PF-005](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#已确认要求)、[PF-007.C7](../../requirements/product/user/PF-007-system-initiated-hitl.md#已确认要求)、[PF-008](../../requirements/product/user/PF-008-unified-decision-pool.md#已确认要求) | 问答型与审批型答复的唯一来源与消费点、收束后批准的 Run 级位置、暂行回传四种策略的落点；落在 SR-16/17、RD-06/11 |
| [PF-009.C6/C7](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求) | 上下文装载型命令随文本项进入模型、有序命令为命令 Run、keyboard 为即时控制；落在 SR-07、RD-05 |
| [PF-011.C4/C5/C9/C10](../../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md#已确认要求) | 到期为 trigger、"继续同一件工作"先结算再触发、取消的原工作不复活、纯通知不进 Inbound；落在 SR-16/17 |
| [PF-017.C2/C5/C6](../../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md#已确认要求) | 跨会话消息按权限排队或作 context、绝不自动打断；Run 内等待答复只能是工具调用 |
| [PF-019.C6](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md#已确认要求)、[PF-020.C5](../../requirements/product/environment/PF-020-dependency-availability-and-degradation.md#要求与本轮细化) | 预算被拒与 Run 级依赖缺失进入 waiting_gate，恢复事实返回原点重做准入；gate_restored 生产者为提供者义务 |
| [PF-023.C2](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md#已确认要求) | 模型固定到 Run、压缩为辅助 Step；落在 RD-07/08 |
| [SYS-RUNTIME-CONTINUITY](../../requirements/system/runtime-state-and-continuity.md#已确认要求)、[SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md) | 位置为 projection、恢复不重发、Session 级裁决先行与启动扫描、来源有界与不轮询；落在 RD-01/04/16、SR-14/19/21 |

## 相邻边界与未覆盖部分

- 通知事件命名空间与作用域过滤（U-5）、PF-004 三种派发关系的完整协议、多进程
  部署下旧 epoch 持有者的活性判定不在本轮；相应条款保留缺口。
- PF-012/016/021 的环境、插件与机器变化只作为门的输入进入本设计，不定义其能力契约。
- 本轮不实现任何提供者；崩溃窗口注入与 `gate_restored` 生产者义务由后续实现验收。
