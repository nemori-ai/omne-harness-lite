# 工具执行生命周期与 Session / Run 级联：备忘

状态：备忘，不是候选正文，不构成接受。用户 2026-09-14 裁决
（[U-37](../../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）：归档后后台调用的
存续政策属于工具执行的生命周期/状态机设计，也要级联；工具设计
（[U-30](../../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户) 延后）启动时把
本页捞出来讨论。本页只列 [D-014](../../../decisions/D-014-session-run-agent-lifecycles.md)
之后留给工具侧的义务与选项，不预作选择。

## 1. 需要一台工具调用的状态机权威

[tools v1](../../../../spec/capabilities/tools/v1/contract.md) 已有调用/attempt、后台、停止
（TL-09）、绑定撤回（TL-06）、帧（TL-12）的条款，但没有像 Session / Run / 实例那样
一张完整的状态机与级联表。工具设计时补齐，并与
[生命周期组合 LC-04](../../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
的行对齐：

| LC-04 触发 | 对前台调用 | 对后台调用 | 现有依据 |
|---|---|---|---|
| Run → completed / failed（行 3） | 不应存在未收束的前台调用（收束前提） | 继续；结算作为 arrival 回到 Session，按发起 Run 判定（[A-4](../../agent-loop-inbound/README.md#作者裁决2026-09-14r3-修订)），终态 Run 的晚到结算作 trigger 开新 Run | [SE-14/17](../../../../spec/capabilities/session/v1/contract.md) |
| Run cancel / force_stop（行 4） | TL-09 收口；force_stop 受理点撤 epoch，旧执行者结果走隔离通道 | 自有后台调用按 [PF-013.C4](../../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) 处置表 | [RN-04](../../../../spec/capabilities/run/v1/contract.md)、TL-09 |
| Run interrupt / interrupt_then_run（行 5/11） | 请求自有调用停止，安全收口后 interrupted | 不隐式取消（PF-013.C4 前台/后台区分） | RN-04 |
| 实例计划退役（行 6） | 驱动器到安全边界 Yield；热宽限到期仍有前台执行则按 interrupt 收口并记 `yield_forced` | 不受影响：后台调用从启动起归独立执行所有者 | [RD-14](../../../../spec/capabilities/run-driver/v2/contract.md)、[lifecycle.md](lifecycle.md#在途工作对-cordis-所有权的要求) |
| 实例崩溃 / 进程重启（行 7） | 恢复时核实在途 attempt，已耐久 dispatched 的不重发 | 恢复后重新关联（[PF-003.C6](../../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md)） | [RN-08](../../../../spec/capabilities/run/v1/contract.md)、[RD-16](../../../../spec/capabilities/run-driver/v2/contract.md) |
| 租户撤权 / 写入权丢失（行 12） | 驱动器停在已确认水位 | 后台调用能否继续取决于它实际持有的独立资源是否仍有效 | [CC-02/04](../../../../spec/compositions/core-work-coordination/v2/contract.md)、lifecycle.md |
| Session 归档 / 删除（行 1） | 前提：无非终态 Run，所以没有前台调用 | **未定**，见下节 | [SE-02](../../../../spec/capabilities/session/v1/contract.md) |

## 2. 归档 / 删除后的后台调用：待选政策

LC-04 行 1 的前提只要求"无非终态 Run"，没有说后台调用。三个候选，各有代价：

| 政策 | 含义 | 代价与连带 |
|---|---|---|
| a. 扩展前提 | 有未收束的后台调用时归档返回 busy | 用户必须先处理后台工作；简单、无悬空结算 |
| b. 归档不动工作 | 后台调用继续到终态；结算 arrival 到达已归档 Session 时按 [SE-17](../../../../spec/capabilities/session/v1/contract.md) 关闭（`closed(archived)`），不开新 Run；删除时同样关闭并按数据治理处理结果 | 需要"归档态 Session 仍可受理并关闭 arrival"的读写资格；媒体与结果的保留期归数据治理 |
| c. 归档触发停止 | 归档请求先对后台调用发 stop，收口后再归档 | 归档变成异步多步操作，需要 stopping 态或返回 busy 直到收口 |

选择时一并回答：已归档 Session 的读取资格（[frames.md](frames.md#cordis-生命周期与-context-sessions-交接)
末段）、逻辑删除后的媒体保留与清理完成判定、后台调用结算的费用归属。

## 3. 其他留给工具侧的接口

- **TL → Inbound 端口形状**：调用结算作为 arrival 受理（[SE-12](../../../../spec/capabilities/session/v1/contract.md)），
  载荷至少含 call、attempt、outcome、发起 Run；一律按发起 Run 判定（A-4）。事件命名三段式
  （[U-33](../../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)，如 `tools.call.settled`）、
  去重键（U-34）与来源级 `dedupKey` 同时适用。
- **`gate_restored` 的生产者义务**：预算（BG）与依赖可用性提供者何时、以什么去重键发出
  恢复事实，使 Run 从 waiting_gate 返回原点（[RN-01](../../../../spec/capabilities/run/v1/contract.md)、
  [RD-12](../../../../spec/capabilities/run-driver/v2/contract.md)）。
- **工具帧与出站流**：TL-12 的帧、游标与 gap 词表如何进入[出站流](../../outbound-stream/README.md)
  的瞬态旁路。
- **调用级绑定撤回**：TL-06 结算 unavailable 而不等待，与 Run 的 waiting_gate（依赖门）的分界。
