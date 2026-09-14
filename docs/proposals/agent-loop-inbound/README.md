---
kind: proposal
id: P-agent-loop-inbound
status: draft
scope: 阶段 E 的 Agent Loop（Run 驱动器）拓扑、Session Inbound 到达账本与循环不变式的候选设计
---

# Agent Loop 与 Session Inbound

[提案索引](../README.md) · [阶段计划 E](../dsh-core-adoption/design-plan.md#设计工作及验收清单) · [session-run v1](../../../spec/capabilities/session-run/v1/contract.md) · [tools v1](../../../spec/capabilities/tools/v1/contract.md) · [人类决定 v1](../../../spec/capabilities/human-decisions/v1/contract.md) · [共同准入 CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)

本提案承接 [D-006](../../decisions/D-006-dsh-core-adoption.md) 阶段计划中的工作 E
"Loop、Run 控制与上下文装配"，在 [D-008](../../decisions/D-008-core-capabilities.md)
已接受的 Session/Run、工具、人类决定、模型与共同准入契约之上，定义本项目自己的
Agent Loop。它回答三个问题：循环怎么走、一次 Run 中途异步到达的事件怎么进入循环、
哪些性质必须永远成立。事实依据来自
[六系统循环/事件/hooks 研究](../../research/agent-loop-events-and-hooks/README.md)
与 DSH agent-loop 的[源基线](../core-capabilities/fork/loop-source.md)。

状态为 draft：2026-09-14 由用户主导的设计讨论形成，尚未经独立评审与接受。
文中"沿用"指引用已接受契约，"本次提出"指本提案新增的候选语义；后者在接受前
不是正式依赖。

## 范围

- 在范围内：Run 驱动器的节点拓扑与推进规则；Session Inbound 的对象、裁决与消费；
  Step 收束与接续就绪的封闭词表；循环与 Inbound 的安全/进展不变式；对 DSH
  agent-loop 源码的取舍。
- 不在范围内：session-run/tools/human-decisions/model-execution 已定义的状态
  转移（只引用，不复述）；通知事件的命名空间与作用域过滤实现（用户裁决留待
  后续）；系统提示词装配的具体算法（沿 runtime-context 源基线与 MC-03）；
  PF-004 三种派发关系的完整协议（只定义其结果如何进入本 Session）。

## 文件

- [loop.md](loop.md)：Run 驱动器的定义、拓扑、`decide` 的输入输出、Step 收束与
  收口协议、对 DSH 源码的取舍。
- [inbound.md](inbound.md)：到达账本的对象、四种投递意图、裁决决定表、来源枚举、
  队列消费规则，以及按全部产品/系统要求做的覆盖核对。
- [invariants.md](invariants.md)：安全与进展不变式，每条标明来源、保护点与证据义务。

## 裁决记录（2026-09-14，用户）

以下为设计讨论中用户明确裁决的选择，是本提案的前提；接受本提案时它们进入
决定，接受前它们是用户已表达的方向而非正式契约。

| 编号 | 裁决 |
|---|---|
| U-1 | 驱动占位 `(SessionRef, RunRef, epoch)` 由 session-run 能力耐久持有并裁决；Loop 只租用，每次推进核对 epoch |
| U-2 | 驱动位置是从 Step/call/request 事实 fold 出的 projection；只有"意图"（复合打断、接续就绪、终止意图）是 authoritative |
| U-3 | 调用批部分结算时允许带 `deferred_receipt` 提前开下一 Step |
| U-4 | 压缩、标题等辅助工作作为 Run 内的 Step |
| U-5 | 通知事件命名空间与作用域过滤是否复用已 fork 的 scope 包，留待后续设计 |
| U-6 | 用户中途插入消息维持 SR-11 的 `interrupt_then_run`：旧 Run 收口、新消息经队列开新 Run；不采用 DSH 等系统的运行中热注入 |
| U-7 | 队列消费：连续用户文本合批出队开一个 Run；slash command 一项一 Run 依次消费；keyboard command 是即时控制不入队；trigger 与用户输入同一队列、同一顺序，作为分隔符一项一 Run |
| U-8 | 队列内的项随时可撤回；一旦出队启动 Run 就不能撤回，只能对 Run 施加 interrupt 等控制 |
| U-9 | delegate/spawn 结果到达时 master 非终态但已不在前台等待，作为 `context`；被动订阅内容 Inbound 只记指针与水位，不复制内容 |
| U-10 | 已终态 Run 的晚到回调作为新 Run 的 trigger 进入循环；事件与 Run 生命周期异步，由 Inbound 统一裁决 |

## 与既有材料的关系

- [agent-core v1 执行候选](../agent-core/v1/execution.md)提出的 Session/Turn/Run/Step
  命名与 durability barrier 原则由 D-008 的 session-run v1 与 CC v1 接受；本提案
  消费这些契约，不重新定义 Run/Step。
- DSH 的 `ReactLoopAgent`、inbox、tool-calls 驱动器按[源基线](../core-capabilities/fork/loop-source.md)
  有意未导入；本提案说明哪些算法思想保留、哪些政策放弃。
- 六系统研究里"事实事件与通知事件分家""阻断点集中在四个站点""停止边界需要刹车"
  三条观察是本设计的直接依据。

## 未决项

- 通知事件的命名空间、作用域过滤与实现（U-5）。
- trigger 来源的容量、去抖与合并参数的具体配置面（inbound.md 只定义义务）。
- TLA+ 模型的范围：至少覆盖 invariants.md 中标注 TLA+ 的条目；模型文件在接受
  前作为提案附件，接受后随 spec 发布。
- 本提案接受后的规格落点：Loop 语义是否作为 `capability.session-run` 的新版本、
  独立的 `capability.run-driver`，还是组合契约；Inbound 是否并入 session-run 的
  队列条款。建议在评审时一并裁决。

## 接受记录

尚无。
