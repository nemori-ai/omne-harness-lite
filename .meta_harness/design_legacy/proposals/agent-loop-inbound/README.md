---
kind: proposal
id: P-agent-loop-inbound
status: accepted
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

2026-09-14 由用户主导的设计讨论形成，经两轮独立评审与 r3 修订后由
[D-012](../../decisions/D-012-run-driver-and-inbound.md) 接受；精确承诺已发布为
[run-driver v1](../../../spec/capabilities/run-driver/v1/contract.md) 与
[session-run v2](../../../spec/capabilities/session-run/v2/contract.md)。文中"沿用"指
引用已接受契约，"本次提出"指本提案提出并随 D-012 进入规格的语义；本文保留当时
的候选身份与取舍，不再是正式依赖的落点。

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
- [cordis.md](cordis.md)：Cordis 视角与提供者边界——消费方式推导、语义对象的运行位置、
  装载效应与撤除责任、四类提供者接口对接、依赖变化对进行中 Run 的政策、性质/前提/证据
  对应表、提供者设计归属与实施入口；由 D-013 接受。
- [requirements.md](requirements.md)：需求消费基线、确认条款与相邻缺口；[evidence/](evidence/model/results.json)
  保存模型运行记录与需求基线恢复记录。
- [review.md](review.md)：2026-09-14 独立只读评审 r1（对象 `bce30a0`），结论"不闭合"，含逐节点
  状态枚举、反例记录、最小 TLA+ 风格模型与冲突清单；逐项处置见该文件末尾，r2 修订据此完成。
- [review-r2.md](review-r2.md)：2026-09-14 独立只读评审 r2（对象 `439a4da`），结论"有条件闭合"，
  含 r1 处置核对、新增节点闭合论证、可改写为可运行模块的 TLA+ 模型 `LoopInboundR2`、规格就绪
  清单与契约影响；逐项处置见该文件末尾，r3 修订据此完成。

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
| U-11 | U-10 只适用于 `completed`/`failed`；`cancelled`、force_stop 以及 Session 归档/删除级联终止是人主动终止的意图，晚到回调不得复活，接续一律关闭并记录 |
| U-12 | 收束后才被批准的调用不引入 TL-10 之外的第三种关系：Run 在 E6 以"等待该调用结算"为接续位置 |
| U-13 | 预算耗尽与依赖缺失进入 `waiting_gate`，由预算/依赖能力的恢复事实唤醒，不需要用户 resume |
| U-14 | 日程"继续同一件工作"：原 Run 先结算，到期以 trigger 开新 Run |
| U-15 | 子代理本质是工具：派发是普通工具调用，前后台、detach 与晚到结算全部沿 TL-10/11，不设独立的子代理结果来源 |
| U-16 | 规格落点：Inbound 进入 session-run 的新版本；Loop 作为独立的 `capability.run-driver` v1 消费它 |

## 作者裁决（2026-09-14，r3 修订）

评审 r2 留下九处设计取舍。用户授权"针对性地完成优化和补漏后推进决策与规格"，
以下由作者裁决并在 r3 落入正文；标注"政策级"的条目改变产品可感知行为，接受
决定前用户可否决。

| 编号 | 取舍 | 裁决 | 落点 |
|---|---|---|---|
| A-1（X1） | Yield 的占位语义 | 封闭 epoch、保留占位、Run 状态不变；新运行时实例经 E0 重取；热宽限到期仍有前台工作则按 interrupt 收口并记 `yield_forced` | loop.md E0/E7，I-1，P-1 |
| A-2（X2） | `waiting_gate` 的机制 | 进入点 E1（依赖）、E3（预算/路由）、E4（预算）、E4A（预算），记 `(gateRef, gateRet)`；`gate_restored` 由预算与依赖可用性能力作为提供者义务推送；显式 resume 保留为人工路径；依赖门只在 Run 级，调用级沿 TL-06 结算 | loop.md E1/E3/E4/E6，I-24 |
| A-3（X3） | 结算与答复的消费路径 | 单一路径：settled 视图只源自已裁决 arrival，新增 `settling` 阻止值；每种人类请求唯一来源 | loop.md 词表，inbound.md 定义，I-23 |
| A-4（M1） | WorkRef 定时派发结果在 master 忙时 | 不设忙时策略，统一工具视角：裁决以发起该调用的 Run 为判定对象，发起 Run 非终态 → `context`（U-9），发起 Run 已终态或 WorkRef 无发起 Run → `queue`（U-10、PF-004.C7）。r3 曾引入 `policy.busy`，2026-09-14 用户裁定删除 | inbound.md 决定表；session-run v2 SR-17 |
| A-5（M5，政策级） | 暂行"一次接续"在 Run 存活但不等待时 | `continuation`，`refs = run`：不唤醒进行中的 Step，下一次 E5 判定时作为就绪接续 | inbound.md 决定表，I-13 |
| A-6（M6） | 缺省串行门与后台/待审批的关系 | 前一个调用的视图不再阻止收束即放行（settled、staged_provisional、detached_background、waiting_approval） | loop.md E4 |
| A-7（M9） | E4A 与 E1 同时就绪的优先级 | E4A 先于 E1 | loop.md E1/E5 |
| A-8（M3） | EC 与 IN-01 的分工 | EC 只承接 SR-07 有序命令；上下文装载型命令随文本项走 takeBatch；EC 结算词表与控制语义封闭 | loop.md EC |
| A-9（M2） | U-15 的适用范围 | 只覆盖结果路由；子 Agent 权限与终止传播沿 SR-12 末段交给 PF-004 | loop.md E4，inbound.md 来源 |

两处产品可感知的后果一并记录：`waiting_gate` 持有占位，该 Session 的普通排队输入
要等门恢复或用户 interrupt 才能开新 Run（S9）；`failed(context_overflow)` 的 Run 留下
的后台调用逐个以 trigger 开新 Run，成本有界但不为零（M13）。

## 作者裁决（2026-09-14，Cordis 层）

用户指出 D-012 只接受了语义层，Cordis 视角整层缺失；补齐时新增两处取舍，
记录在 [cordis.md](cordis.md#5-依赖变化对进行中-run-的政策)。

| 编号 | 取舍 | 裁决 | 落点 |
|---|---|---|---|
| A-10（政策级） | 驱动器实现换代后如何接续进行中的 Run | 重取须通过 SR-14 恢复兼容证据核对 Run 记录的驱动绑定；不兼容则 Run 保持 Yield 前状态并保留占位，等人工处置或兼容实现；不采用"新实现可接管任意前缀" | cordis.md §5，run-driver v1 RD-04 |
| A-11 | 附着资格、租户权限、定义授权失效时的 Run 处置 | 不新增门种类；由实例关闭（CB-06/AR-16）与重取门承担，Run 状态保持 Yield 前的值，占位阻塞普通排队输入直到资格恢复或用户控制 | cordis.md §4/§5 |

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
- 规格落点已按 U-16 裁决；session-run 新版本须同时纳入 trigger kind、`takeTrigger`、
  系统发起的 `interrupt_then_run`、`waiting_human`/`waiting_gate` 状态、占位与 epoch 的分离，
  以及 Inbound 正文；受影响的 v1 契约见评审 r2 §7。
- `gate_restored` 的生产者义务：预算能力（budget-accounting）与依赖可用性能力当前
  版本无此条款，接受时作为提供者义务登记，或在其下一版本纳入。
- 多进程部署下旧 epoch 持有者的活性判定（租约或故障接管）：live-agent v1 明言
  未规定，单进程首版不成问题；拆进程前必须补，属本提案之外的后续设计。
- 模型请求发网前的 dispatched 记录应包含哪些可核实原请求的信息（本地 attemptId、
  时间、manifest 摘要；供应方请求 ID 只在响应后可得），由 model-execution 的
  提供者设计确定。
- 提供者映射缺口（[cordis.md §7](cordis.md#7-提供者设计归属与实施入口)）：服务键与注入、
  订阅接口形状、投影 stateKey、Factory 的 driverKey/version 约定、驱动绑定兼容性声明的
  形状；负责产物 `packages/agent/run-driver/design.md`，在 Session 与工具提供者设计接受后、
  工作 E 实施前闭合。
- 面向客户端的出站流协议（帧投影层）没有任何契约，留到流帧设计。

## 接受记录

2026-09-14，任务作者在用户"再评最后一轮，并针对性地完成优化和补漏后，就可以
推进正式的决策、架构设计和 spec 撰写（以及必要的形式化推导和验证）"的授权范围内，
结合两轮独立只读评审接受本提案的 r3 修订。评审者未代为接受；用户逐条裁决的
U-1～U-16 是接受前提；作者裁决 A-1～A-9 中 A-4 已由用户改为按发起者统一判定，
A-5 标注政策级，用户可另行否决。

接受对象为 catalog 中以 D-012 为依据的 `capability.run-driver` v1 与
`capability.session-run` v2；session-run v1 保持冻结。评审 r1 判定修订 `bce30a0`
不闭合，评审 r2 判定修订 `439a4da` 有条件闭合，r3 修订 `6fafacb` 处置了全部阻断、
重要项与建议；两份评审及处置表保存在本目录。

证据为 RunDriver 有限模型的三个安全配置（核心、调度、提交去重）、三个进展配置
（调用侧、人类问答侧、调度）与四个否定变体按预期结果通过，每个配置在 8 核上两分钟
内完整探索；实际命令、退出码与状态数见[运行记录](evidence/model/results.json)。
模型在改写评审 r2 §5 的过程中暴露并修正了两处提案措辞（收口产生的合成终态属于
Run 级位置而非 Step 批；批准消费与门判定使用不同的提交种类），已同步进正文。
一个把全部关注点放在一起的大配置在 30 分钟内未收敛，被有意拆开，调用与问题同时
存在的活性实例未探索。这些是有限范围证据，不代表实现已存在或真实提供者已验收。

同日第二次接受：用户指出 D-012 只覆盖语义层、Cordis 视角整层缺失，并要求先列
流程与交付清单再补齐。作者按清单完成 [cordis.md](cordis.md)（消费方式、语义对象
运行位置、装载效应与撤除责任、四类接口对接、依赖变化政策、性质/前提/证据对应表、
提供者设计归属），由 [D-013](../../decisions/D-013-run-driver-cordis-boundary.md) 接受；
run-driver v1 RD-04 按用户"合并前原地修正"的口径补入重取的兼容前提并重算哈希。
作者裁决 A-10（政策级）、A-11 用户可另行否决。独立只读评审待用户派发，本次接受
不以评审为前提，评审结论到达后按处置表补正。清单第 6 项（服务键、注入、订阅接口、
投影 stateKey、驱动绑定兼容性声明）记为未完成义务，负责产物与闭合时点见未决项。
