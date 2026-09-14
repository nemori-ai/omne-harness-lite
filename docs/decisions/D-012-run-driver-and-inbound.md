---
kind: decision
id: D-012
status: accepted
scope: Agent Loop 作为 Run 驱动器的推进语义（run-driver v1）与 Session Inbound 到达账本及其在 session-run v2 中的落点
date: 2026-09-14
sources:
  - ../proposals/agent-loop-inbound/README.md
  - ../research/agent-loop-events-and-hooks/README.md
acceptance: ../proposals/agent-loop-inbound/README.md#接受记录
supersedes: []
---

# D-012：Run 驱动器与 Session Inbound

接受[Agent Loop 与 Session Inbound 提案](../proposals/agent-loop-inbound/README.md)
的 r3 修订，精确对象为 [capability.run-driver v1](../../spec/capabilities/run-driver/v1/contract.md)
与 [capability.session-run v2](../../spec/capabilities/session-run/v2/contract.md)；
session-run v1 保持冻结与可引用，其他 D-008 契约不变。事实依据来自
[六系统循环/事件/hooks 研究](../research/agent-loop-events-and-hooks/README.md)。

## 选择

- Agent Loop 是可重建的 **Run 驱动器**：对已提交事实求纯函数 `decide`，只在安全边界
  推进，驱动位置是 projection，只有意图是 authoritative；不是拥有 inbox、turn 计数
  与 AbortController 的内存循环。DSH agent-loop 只保留 attempt 重试、有序 pre/post
  与"恢复先补齐边界"的算法思想，放弃 inbox 热注入、turn 边界、进程内 approval。
- 一次 Run 中途的异步到达统一进入 Session 级 **Inbound**：受理成 arrival，由不依赖
  驱动器的裁决者按裁决时刻的 Run 状态判为 queue / continuation / context / control
  之一并耐久记录；同一事实只有一条进入驱动器的路径。已终态 Run 的晚到回调作为
  trigger 开新 Run；人主动终止（cancel、force_stop、归档/删除级联）的 Run 不因晚到
  回调复活。
- 队列消费：连续用户文本合批开一个 Run；有序 slash command 与 trigger 各一项一 Run，
  同为分隔符；keyboard command 是即时控制；队列内随时可撤回，出队后只能控制 Run。
  用户中途插入维持 `interrupt_then_run`，不采用热注入。
- 占位与 epoch 分离：waiting（含 waiting_human/waiting_gate）与 stopping 都占位；
  运行时退役只封闭 epoch、保留占位，由调度重取。预算耗尽与 Run 级依赖缺失进入
  `waiting_gate`，由恢复事实返回原点重做准入，不跳过门。子代理是普通工具调用，
  结果路由统一沿工具契约；终止传播仍归 PF-004。
- 压缩、标题等辅助工作是 Run 内的独立 Step；收束后才被批准的调用以 Run 级位置
  等待，不引入第三种前后台关系。

## 理由与边界

这些选择让恢复成为"重建位置后用同一个决策函数继续"而不是重放执行，让异步
事件与 Run 生命周期解耦而不丢不双投，并把停止、退役、门等待收敛到同一收口
协议。代价是：驱动器每步都要经共同提交并核对 epoch；`waiting_gate` 持占位会
阻塞该 Session 的普通排队输入直到恢复或用户 interrupt；`failed(context_overflow)`
的 Run 留下的后台调用会逐个以 trigger 开新 Run。调用结算的裁决以发起该调用的
Run 为判定对象，不设忙时策略（用户裁定）；一处产品可感知的作者裁决（暂行"一次
接续"在 Run 运行中降为下一次收束时就绪）记录在
[提案的作者裁决表](../proposals/agent-loop-inbound/README.md#作者裁决2026-09-14r3-修订)，
用户可另行否决。

证据为 [RunDriver 有限模型](../../spec/capabilities/run-driver/verification.md)：三个
安全配置、三个进展配置与四个否定变体按预期结果通过，每个配置都在数分钟内完整
探索；它们是有限范围证据，不是无界系统或实现的证明。两条独立评审（r1 不闭合、r2 有条件闭合）及逐项处置保存在
提案内。本决定接受目标设计与有限验证工件，不接受实现已完成：崩溃窗口注入、
`gate_restored` 生产者义务、多进程 epoch 活性判定与通知命名空间（U-5）仍待后续。

需求消费基线固定为 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`，确认条款、路径与保留引用归
[消费记录](../proposals/agent-loop-inbound/requirements.md)。
