# Run 驱动器 v3

本契约身份为 `capability.run-driver`，版本 3。与
[v2](../v2/contract.md) 的差异是语义变化：Run 的等待收敛到
[run v2](../../run/v2/contract.md) 的等待登记簿，`waiting_human` 与 `waiting_gate` 不再是
Run 状态；Step 收束的判据改为"attempt 已结算且提议已登记"，原"阻止收束的视图"改为开下一
Step 的合批规则；切点来源扩展为六类；结算视图补 `waiting_human` 与晚到结果形态；Step 结算
补 `invalid_proposal`；Yield 前提按登记簿陈述；不可恢复失败不再处置已准入调用；受理后取用前
新增只能关闭项的守卫；Agent Loop 的扩展点站点成为本契约拥有的一等词表。条款编号沿用
v2，被改的条款保留编号并改正文，新增条款为 RD-18 与 RD-19。
接受依据为
[决定 D-015](../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
v2 与 v1 保持冻结与可引用。

规范依赖：[session v2](../../session/v2/contract.md)（Session、队列、Inbound、取入既有 Run）、
[run v2](../../run/v2/contract.md)（Run、Step、epoch、等待登记簿、控制）、
[生命周期组合 LC v2](../../../compositions/session-run-agent-lifecycles/v2/contract.md)（占位、执行者、级联）、
[tools v2](../../tools/v2/contract.md)（调用五维、声明与执行 owner）、
[human-decisions v2](../../human-decisions/v2/contract.md)（内建 `human` 工具、请求与决定）、
[model-execution v2](../../model-execution/v2/contract.md)（attempt、窗口与装配）、
[共同准入 CC v2](../../../compositions/core-work-coordination/v2/contract.md)、
[durable-records v2](../../durable-records/v2/contract.md)、
[external-hooks v1](../../external-hooks/v1/contract.md)（扩展点的权力上界）、
[live-agent v1](../../live-agent/v1/contract.md)（工作许可与退役）、
[共享数据 CD v2](../../../data/core-work/v2/contract.md)（内容块、占位与声明形状）。
本契约只定义驱动器如何在这些权威的已提交事实上推进，不改写它们的状态转移。

## 定义与原则

**RD-01**：Run 驱动器是可重建、不持有私有状态权威的推进过程。它对 Run 的已提交
事实求纯函数 `decide(view) → intent`，只在 [RN-01](../../run/v2/contract.md) 的安全边界推进，
每次推进经 [CC-01/03](../../../compositions/core-work-coordination/v2/contract.md) 共同提交并核对
当前 epoch（RN-01）。驱动位置 `{RunRef, epoch, currentStep, phase}` 是
[SE-10](../../session/v2/contract.md) 注册面上的 projection，从 Run/Step/调用/请求事实确定性
fold；只有意图是 authoritative：复合打断（[SE-08](../../session/v2/contract.md)、
[RN-04](../../run/v2/contract.md)）、接续就绪（[SE-13](../../session/v2/contract.md)）、终止意图
（[RN-05](../../run/v2/contract.md)）、门等待的 `(gateRef, gateRet)`（RN-01）。相同的已提交
事实前缀必得相同意图。

**RD-02**：`view` 只来自已提交前缀（[DR-03](../../durable-records/v2/contract.md)），含 Run
状态与 epoch、等待登记簿的当前开放登记（[RN-01](../../run/v2/contract.md)）、当前 Step 与其
调用批的结算视图（RD-09）、指向本 Run 的已裁决 arrival（只读 classified，
[SE-18](../../session/v2/contract.md)）、context 水位、队首候选项的资格、预算立场与资格摘要。
`intent` 是封闭联合：OpenStep(basis | supplement | continuations | placeholders)、
AuxiliaryStep(kind)、RequestModel(step)、ProposeCalls(step, calls)、AwaitBatch(step)、
AwaitClaims(claims)、AwaitGate(gateRef, ret)、AdmitApproved(calls)、Reattach(calls)、
Yield(reason)、CloseOut(reason)、Settle(run, reason)。AwaitBatch 是合批等待（RD-10），
AwaitClaims 是登记簿等待（RD-11）；两者都不改写 Run 状态权威。

**RD-03**：每次共同提交的 operationId 从事实前缀确定地派生：
`f(RunRef, stepId, commitKind, ordinal)`，commitKind ∈ {open_step, admit_attempt,
dispatch_attempt, settle_attempt, propose_call, admit_call, consume_decision,
settle_step, await_gate, settle_run}，ordinal 为该 Step 内同类提交序号；不同
commitKind 不共用 operationId。恢复重跑与崩溃前那次提交使用同一 operationId，由
[CC-03](../../../compositions/core-work-coordination/v2/contract.md)/[DR-02](../../durable-records/v2/contract.md)
去重认回；同 ID 异输入返回 conflict 时重读前缀重算，不覆盖。Inbound 裁决、
`take*`/调度与重取的 operationId 由 [SE-06/15](../../session/v2/contract.md) 与
[RN-08](../../run/v2/contract.md) 各自派生，取入既有 Run 的批沿 SE-15 派生。

## 取得驱动与命令

**RD-04**：驱动只以三种方式取得，均在同一提交内取得 `(SessionRef, RunRef, epoch)`：
新 Run（被 takeBatch/takeCommand/takeTrigger 吸收，[SE-06/15](../../session/v2/contract.md)、
[LC-04 行 3](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）、resume
（[RN-03](../../run/v2/contract.md)）、重取（占位仍由本 Run 持有而 epoch 已被 Yield 封闭
或崩溃留下无持有者的 epoch，[LC-07](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。
resume 与重取都执行完整的取得步骤，缺一步不得进入 decide：(1) 取新 epoch 使旧执行者
失去提交权；(2) 读完整已提交前缀，撕裂尾部截回，未回执批次以 lookupOperation 确认；
(3) 等待 Session 级裁决者把本 Session 未裁决的 arrival 裁决完（[SE-18](../../session/v2/contract.md)）；
(4) 折叠驱动位置与等待登记簿，对 dispatched/executing/unknown 的模型请求与调用按原
attemptId 向原 owner inspect/subscribe（TL-11、MC-06），核实不了的记 unknown 且不重发。
前提是无全 Run/Session 控制阻塞，不要求登记簿为空（HD-04）。resume 与重取还须通过
[RN-08](../../run/v2/contract.md) 的恢复兼容证据，其中包含 Run 记录的驱动绑定与投影 reducer
版本；驱动器实现换代后不兼容的 Run 保持原状态并保留占位，等待用户控制或兼容实现，
不自动迁移。附着资格或授权失效时不新增等待种类：联合准入被拒即停在安全边界，由
实例关闭与重取门承担（[CB-06](../../../compositions/agent-session-binding/v1/contract.md)、
[AR-16](../../live-agent/v1/contract.md)）。终态为 `superseded` 的 Run 不可 resume、不可重取
（[RN-03](../../run/v2/contract.md)）。

**RD-05**：basis 为 command 的 Run 只由 [SE-07](../../session/v2/contract.md) 的命令处理者结算，
不经模型与工具批；上下文装载型命令随 text 项进入模型输入（SE-07）。命令 Run 的
结算映射与控制语义沿 [RN-06](../../run/v2/contract.md)。命令 Run 没有模型 Step，不消费
context 水位内的系统通知（RD-06）。

## Step 的开启、模型请求与调用批

**RD-06**：开 Step 前在短提交之外准备：读取模型可消费的就绪接续与 context 水位
（[SE-16](../../session/v2/contract.md)），对本次取用的队首候选项求值受理后守卫（RD-17），
按 MC-10 估算窗口；需要压缩则先执行辅助 Step 再重新准备。随后在一次共同提交内冻结
切点并把被消费的接续与 context 指针标为 consumed。切点来自且只来自六类来源：

| 来源 | 进入模型的形态 | 权威 |
|---|---|---|
| 取入的输入批：Run 的启动依据（仅首个 Step）与在空闲点取入既有 Run 的补充批 | 队列项内容；补充批与 `queue.items.taken{into}` 同提交（RD-18） | [SE-06/15](../../session/v2/contract.md) |
| 模型可消费的就绪接续：已裁决的 call_settlement 与 provisional_outcome | 该 tool_use 的 `tool_result`；该 tool_use 已占位过则改按晚到结果呈现（RD-09） | [SE-13/14](../../session/v2/contract.md) |
| 本 Run 尚无 `tool_result` 的 tool_use 的占位 | `deferred_receipt{call, reason, notice}`，`reason` 沿 [CD v2](../../../data/core-work/v2/contract.md) 的封闭六值 | RD-09/10 |
| 已占位调用的晚到结果或人类答复 | `system_reminder{late_result \| human_answer, ref}`，只引用已耐久的结果，不复制正文 | [SE-13/16](../../session/v2/contract.md)、[CD v2](../../../data/core-work/v2/contract.md) |
| 系统通知（被越过 Run 的被保留工作清单、续跑刹车、前台上限等） | `system_reminder{system_notice}`，正文在切点内 | [SE-13/14](../../session/v2/contract.md) |
| 外部 hooks 兼容层在准备阶段贡献的上下文 | `system_reminder{hook_context}`，正文在切点内 | [HK-1](../../external-hooks/v1/contract.md) |

审批型 human_answer 不进入切点，只由 RD-11 消费；两者同时就绪时先消费批准再开 Step。
多条 `system_reminder` 在同一 Step 的输入里排在新用户文本之前；`system_notice` 类系统
通知由本 Session 下一个有模型 Step 的 Run 在切点消费，恰一次。Step 切点建立后不可变。
本 Step 所需的模型路由、技能或工具绑定不可用时不开 Step，驱动器以 AwaitGate 登记
`(dependency, E1)`（RD-12）；调用级依赖丢失沿 TL-06 结算 unavailable，不在此等待。

**RD-07**：压缩、标题等具名辅助工作作为独立 Step：自有切点与 attempt，不消费
arrival；每次准备最多执行一次辅助 Step，辅助失败、unknown 核实不了或压缩后仍
超限时以 failed(context_overflow) 收口，不重复压缩（MC-10）。辅助 Step 的 attempt 按
`purpose` 记录（[MC-06](../../model-execution/v2/contract.md)），不产生助手回复消息。

**RD-08**：模型请求沿 MC-03/04：prepare → 共同准入（attempt、预算、epoch）→ 发网
前耐久 dispatched 记录 → dispatch → 帧投影 → settle。准入阶段预算被拒（BG-03）或
路由不可用时不产生 attempt，驱动器以 AwaitGate 登记 `(budget | dependency, E3)`，
恢复后同一 Step 重新准入。attempt 结算的出边封闭：success → 调用批；partial 的
完整内容块作为 attempt 事实保留披露、被截断的 tool_call 不 propose、按 failed 处理；
failed 且政策允许 → 同 Step 新 attempt，切点不变；failed 且政策不允许 → 收口，
Run failed；unknown 可核实 → 按核实结果；unknown 核实不了 → 记 unknown 与费用
暴露，政策允许则新 attempt，否则 failed(unknown)；cancelled → 收口。一个 Step 至多
一个 success attempt，它是该 Step 唯一的权威模型输出。

Step 的结算事实 `run.step.settled{outcome}` 有两种 outcome。整份提议经
[TL-01](../../tools/v2/contract.md) 校验不能形成合法 Action 时，tools 不登记任何 proposed，
驱动器以 `invalid_proposal{reasons}` 收口该 Step，`reasons` 逐片段记录真实拒绝原因；
该 Step 不新增任何等待登记，被拒的 `tool_call` 片段以本结算与 attempt 结算记录为耐久
来源（[message-stream v1](../../message-stream/v1/contract.md) 据此派生带 `rejected{reason}`
的块）。其余情形以 `settled` 收口。本版不为 `invalid_proposal` 定义同 Step 重试，收口后
按 RD-10 的收束后判定继续。

**RD-09**：调用批沿 TL-07：proposed 耐久登记 → 门 → allow 者在联合提交取得预算
预留、精确使用与执行许可后由独立 owner start；ask 者建 HD 请求；deny 者直接
结算。提议与该调用在等待登记簿的登记同批（[RN-01](../../run/v2/contract.md)）。预算预留
被拒时调用停留在 proposed，驱动器以 AwaitGate 登记 `(budget, E4)`，恢复后从该调用起
重新过门。缺省串行下后续调用停在 proposed_pending_gate。子代理派发是普通工具调用，
其结果路由沿 TL-10/11 与 call_settlement；子 Agent 权限与终止传播沿
[RN-05](../../run/v2/contract.md) 末段交给 PF-004。问答型人类请求不是独立位置：它附属于
内建 `human` 调用（[HD v2](../../human-decisions/v2/contract.md)），答复经该调用的
call_settlement 进入。

调用的结算视图是封闭词表，settled 只源自指向该调用的已裁决 call_settlement
arrival（[SE-13](../../session/v2/contract.md)），其余值从工具/人类决定权威的状态 fold。
"登记开放"即该调用在等待登记簿上仍有开放登记；"前台"是登记关系为 `foreground` 或
`detach_in_flight` 的投影（[TL-10](../../tools/v2/contract.md)）：

| 视图值 | 来源 | 进入下一 Step 的块 | 登记与关系 |
|---|---|---|---|
| settled(succeeded / failed / denied_before_execution / cancelled_before_execution / interrupted / unavailable / unknown) | 已裁决 call_settlement | 未占位过则 `tool_result`（unknown 标明未知）；已占位过则 `system_reminder{late_result}` | 裁决同批注销 |
| settling | TL-07 已记终态但 arrival 未裁决 | `deferred_receipt{foreground_pending}` | 登记开放，关系不变 |
| staged_provisional | HD-11 产物已 staging、请求待决 | `deferred_receipt{staged_provisional}` | 登记开放；暂行回传沿 SE-14 的 `provisional_outcome` 行进入，不设特例 |
| detached_background | executing 且 detach 已确认，或启动即后台 | `deferred_receipt{detached_background \| background_from_start}` | 确认或准入即注销，关系为 background |
| detach_in_flight | 已请求 detach、owner 未确认 | `deferred_receipt{foreground_pending}` | 登记开放，关系 detach_in_flight |
| waiting_approval | HD-03 待人类决定 | `deferred_receipt{waiting_approval}` | 登记开放，未过门关系为 none |
| waiting_human | 内建 `human` 调用的请求待答 | `deferred_receipt{waiting_human}` | 登记开放，关系 human_wait |
| proposed_pending_gate | 缺省串行下尚未过门 | `deferred_receipt{foreground_pending}` | 登记开放，未过门关系为 none |
| executing_foreground | 前台且未 detach | `deferred_receipt{foreground_pending}` | 登记开放，关系 foreground |
| admitted_pending_start | 已准入但 start 回执或耐久确认未到 | `deferred_receipt{foreground_pending}` | 登记开放，关系 foreground |

同一 Step 内呈现给模型的结果保持模型发出的顺序；跨 Step 晚到的结果与答复以
`system_reminder{late_result | human_answer}` 在到达的 Step 呈现，按 arrival 的受理序
排列；一个调用的最终结果恰以 `tool_result` 或 `system_reminder` 之一进入模型一次。
完成顺序单独记录（[RN-02](../../run/v2/contract.md)）。

**RD-10**：Step 收束当且仅当本 Step 的 attempt 已结算且其提议已耐久登记；调用是否
已返回结果不再是收束条件。收束后 Run 的等待由登记簿决定（登记簿非空即 `waiting`，
[RN-01](../../run/v2/contract.md)），不存在"收束中"的 Run 状态。

下一 Step 的切点必须为上一 Step 的每个 tool_use 恰给一个块（RD-09 的第三列）。
驱动器缺省以 AwaitBatch 等到本批的前台登记全部注销再开下一 Step，使同批结果一起
呈现；只有三种情况提前开：审批就绪（RD-11）、门恢复（RD-12）、队首合格文本取入
（RD-18）。占位的首次呈现本身是可喂给模型的新内容，使模型能就"继续推进还是停下来
等"决策，因此某个 tool_use 首次需要占位即开 Step；已呈现过占位的 tool_use 不再触发
开 Step。

收束后按顺序判定：完成条件成立（[RN-02](../../run/v2/contract.md)）→ 结算 Run；有审批
就绪 → RD-11；有模型可消费的接续或首次占位 → 开新 Step；有队首合格文本 → 取入并开
新 Step（RD-18）；否则进入等待。自然完成的判定基准是模型响应：本 Step 的 attempt 没有
产生调用提议时登记簿不新增登记，其余条件成立即 completed；产生了调用则这些调用（含
附属于它们的人类请求）登记在簿上，Run 停在 `waiting` 直到登记逐一注销。两处刻意
偏差：启动即后台的调用在准入即注销、不阻止完成；没有调用但仍有未答问题时，该问题
附属的 `human` 调用仍在簿上，Run 停在 `waiting`（投影为等人）而不是 completed。

## 等待、批准消费与门

**RD-11**：等待时 Run 处于 `waiting`，等待对象是登记簿的投影 `waitingFor`（等人 /
等工具 / 等门，[RN-01](../../run/v2/contract.md)）；驱动器释放模型/工具驱动但保留占位，
订阅指向本 Run 登记的已裁决 arrival 与队列变化，没有就绪源时休眠，不做模型轮询。
唤醒集合是任何一条开放登记的注销，加上队首出现合格文本（RD-18）。出边封闭：模型
可消费的接续就绪 → 开 Step；审批就绪 → 消费批准；请求无答复而关闭（HD-06
approved_but_not_admitted、HD-07 模式切换、TL-06 绑定撤回、请求过期）→ 其所属调用的
登记注销并重评完成条件；门恢复 → 返回 gateRet；队首合格文本 → 取入既有 Run 并开
Step（RD-18）。判定顺序沿 RD-10：队首合格文本排在就绪接续之后，就绪接续不会被连续
的用户文本饿死。

消费批准（AdmitApproved）沿 HD-06：再次核对当前规则、原精确绑定、待执行位置
与决定，在共同准入中把决定标记被原调用消费、取得预算预留与执行许可，由 owner
start；该调用的 Step 已收束时不开新 Step，该调用的登记保持开放，结算即接续就绪，
不引入 TL-10 之外的第三种关系。决定为 reject 时在同一节点把调用结算为
denied_before_execution，其结算另作 call_settlement 进入切点。失败分支：
HD-06 复核不通过 → denied_before_execution，登记随其结算的裁决注销；预算预留被拒 →
决定未消费，AwaitGate 登记 `(budget, E4A)`；owner start busy → 保持
admitted_pending_start，按 TL-08 政策同 attemptId 重发，超出政策结算 unavailable；
owner 不可用或绑定撤回 → unavailable，登记随其结算注销。经批准消费而启动的调用，
其结算总在等待登记簿上有对应的开放登记。

**RD-12**：门的等待点只有 RD-06（dependency）、RD-08（budget/dependency）、
RD-09（budget）、RD-11（budget）四处，进入时以 AwaitGate 在等待登记簿登记
`(gateRef, gateRet)`（`run.gate.awaited` 同批，[RN-01](../../run/v2/contract.md)）。退出只有
三条路：对应 gate_restored 接续 → 放行注销该登记并返回 gateRet 在原节点重新做准入或
过门，不跳过门；显式 resume → 门的登记随登记簿保留（RD-13），复核门后在原节点重取；
控制 → 收口。
gate_restored 的生产者义务归预算能力与依赖可用性能力的提供者。门的登记持有占位，
该 Session 的普通排队输入在门恢复或用户 interrupt 前不能开新 Run；开 Step 的前提门
（RD-06 的 dependency）未恢复时也不取入补充批（RD-18）。

## 收口、退役与结算

**RD-13**：停止类操作（interrupt、interrupt_then_run、cancel、force_stop）共用收口
协议：封闭新 Step → 按处置表逐个处理在途调用（interrupt 一律中断并留下真实结局，
含后台调用；interrupt_then_run 可转后台者转、不可转者中断、已后台者继续；
cancel/force_stop 沿 [RN-03/05](../../run/v2/contract.md)）→ 取得每个调用的真实停止/交接/
未知结果 → 按原因走终点。收口完成的判据沿 RN-03：每个停止请求都有物理事实（`unknown`
计入）或该调用已结算；不设"收口中"的 Run 状态。收口直接向工具与人类决定权威
inspect，不消费 arrival；收口期间产生的结算 arrival 由 Inbound 裁决。终点：interrupt →
interrupted，登记簿保留，占位随状态派生释放；interrupt_then_run → superseded，终态提交
整簿注销且未消费的 continuation 改判 context；cancel → cancelled；force_stop 在受理进
`stopping` 的提交就整簿注销，隔离已证实 → cancelled(force_stopped)，隔离未证实 →
stopping，保留占位；对 interrupted 的 Run 做 cancel/force_stop 沿 RN-03。未派发即被取消
的调用得到合成终态，其审批请求关闭，指向该请求的未消费决定一并关闭，不留下无人可消费
的接续；unknown 允许长期存在但必须可见。

不可恢复失败不是停止类操作：Run failed 只结算未准入的调用
（proposed / waiting_approval → cancelled_before_execution，其审批请求关闭，因为过门是
Run 的动作），已准入的调用与未答的人类请求继续由各自 owner 承担，终态提交整簿注销；
它们的结算与答复此后按 [SE-14](../../session/v2/contract.md) 的 C 列成为 trigger 开新 Run
接上，驱动器不在收口中处置它们。

**RD-14**：运行时退役（[AR-11/12](../../live-agent/v1/contract.md)）以 Yield 结束驱动：封闭
epoch、保留占位、Run 状态与等待登记簿不变，位置由投影保留，由 Session 级调度以新
epoch 重取（[SE-15](../../session/v2/contract.md)、[LC-07](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。
前提按登记簿陈述：登记关系为 `foreground` 或 `detach_in_flight` 的调用，以及已过门但
未收到 start 回执的调用，阻止 Yield；关系为 `human_wait` 的调用、未过门的 proposed 与
waiting_approval、以及门的登记都不阻止 Yield。热宽限到期仍不满足时按 interrupt 收口并
记 yield_forced。Yield 不是控制，不改写为 interrupt，也不注销任何登记。

**RD-15**：Run 结算沿 [RN-02](../../run/v2/contract.md) 的完成条件，与 Inbound 接续处理同一
提交（[SE-17](../../session/v2/contract.md)、[RN-09](../../run/v2/contract.md)）；占位随 Run 状态
派生，不需要单独的释放事实（[LC-02](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。
结算后由 Session 级调度启动下一 Run。

## 恢复

**RD-16**：非预期退出（进程崩溃、OOM、宿主重启、断电、与 owner 分区、writer 隔离）
后的恢复不是重放日志重新执行，而是 RD-04 的四步后用同一个 decide 算出下一步。
成立前提是每个外部效果之前都有耐久意图（[CC-04](../../../compositions/core-work-coordination/v2/contract.md)、
TL-08、MC-03/04），事实前缀落后于世界至多一个在途尝试。恢复重跑不会对同一 attempt
再次发网或再次派发同一 attemptId 的 start；新 attempt 只能是经政策与准入的新记录。
两项提供者义务：模型执行提供者在发网前提交 dispatched 记录（MC-04）；工具执行 owner
以同一 attemptId 幂等接纳 start 且重启先恢复账本（TL-08）。逐窗口判定：

| 崩溃窗口 | 恢复判定 |
|---|---|
| 占位后、开 Step 前 | 重新 OpenStep，启动依据认回同一批 |
| 切点提交前 | 重算切点，由重同步后的前缀决定；守卫对未求值的队首项重新求值（RD-17） |
| 辅助 Step 中途 | 同模型窗口；压缩结果未提交视为未压缩 |
| attempt 准入后、dispatch 记录前 | 判定未发出：旧 attempt cancelled，同 Step 新 attempt |
| dispatch 记录后、settle 前 | 记 unknown/partial；有供应方 ID 则查询，否则按政策新 attempt 并保留费用暴露；已流给用户的前缀不可恢复 |
| 提交时 | lookupOperation 认回或重做 |
| 调用 proposed 后、准入前 | 登记已耐久，重新过门，按当前授权/预算判定，不重复提议 |
| 准入后、owner 确认 start 前 | 同 attemptId inspect；owner 无此 attempt 且许可有效则同 ID 重发；账本不耐久则 unknown |
| executing 中 | 独立 owner 存活则 subscribe 重连；owner 随进程死亡则 unknown |
| 存活但与 owner 分区 | 不换 epoch；按 TL-11 标 unknown/lost，Run 等待重连或人工处置 |
| 等待中 | 按登记簿重新订阅；答复期间崩溃按 HD-08/CC-05 补交付；门等待从 gateRet 继续 |
| 批准消费后、start 前 | 同准入后的 start 窗口 |
| 取入补充批的提交前 | 该批仍在队列，按 RD-18 重新判定空闲点与守卫 |
| 收口中途 | 逐个 inspect 继续收口；墓碑拒绝迟到 start |
| Yield 后、重取前 | 调度重取即 RD-04，不是新 Run |
| 受理后、裁决前 | Session 级裁决者在当前 Run 状态下裁决 |
| writer 隔离 | 停在已确认水位处，不推进 |

本版接受的局限：模型流式前缀不可恢复；同进程前台工具随进程死亡的外部效果只能
unknown；多进程部署下旧 epoch 持有者的活性判定不在本版。

## 可改写与可阻断的站点

**RD-17**：输入准入归 Inbound 与 Session 队列（[session v2](../../session/v2/contract.md)），
插件只能作到达行为求值提供者；受理本身不可阻断（SE-12 立即成功）。受理之后、取用
之前存在唯一一道守卫：它只能关闭队列项，不能改写队列项的内容、顺序或到达行为，由
取用者在 `takeBatch` 短提交之外的准备阶段对队首候选项逐项求值——开新 Run 时是 Session
级调度者，取入既有 Run 时是驱动器（RD-18），两者用同一协议。关闭在同一 take 门内与
该项的 `queue.item.closed{closed_by_guard}` 及其 arrival 的
`inbound.arrival.closed{closed_by_guard}` 一起提交，随后继续下一队首项；求值超时、崩溃
或输出非法一律视为放行，并记录该次求值结果；未求值的项在下一次 take 前重新求值，
求值本身幂等。装配可改写 prompt section 与 skill 贡献但不可阻断；模型请求不开放改写
hook，模型归 Run 固定；工具前只有 TL-07 门与 TL-13 守卫且守卫只能收紧，参数不可改写；
工具后只能选择进入模型的投影，不改耐久结果；停止边界只有
[RN-02](../../run/v2/contract.md) 完成条件，没有"阻止停止"的 hook；压缩是 MC-10 的辅助
Step。扩展点贡献的上下文正文只能以 `system_reminder{hook_context}` 进入切点（RD-06），
不改写任何已耐久的输入、参数或结果（[HK-1](../../external-hooks/v1/contract.md)）。

## 等待期间取入排队文本

**RD-18**：Run 在等待时，队首的普通用户文本作为同一 Run 的下一步切点进入模型，不必
等到 Run 结束。空闲点是：Run 处于 `waiting`（Step 已收束、登记簿非空——等工具、等人、
等门都是它的投影），且当前未恢复的门不是开 Step 的前提（RD-06 的路由、技能、工具
绑定）；Step 内（attempt 进行中）不是空闲点。判定由驱动器做，取批形态与合批规则沿
[SE-06/15](../../session/v2/contract.md)：`queue.items.taken{into: RunRef}` 与
`run.step.opened{cutpoint}` 同一提交，不创建 Run、不换 epoch、不改占位
（[LC-02](../../../compositions/session-run-agent-lifecycles/v2/contract.md)），队首是有序命令或
trigger 时不取入，仍等 Run 终态后由 SE-15 一项一 Run。

切点内容是用户文本加上一 Step 每个尚无 `tool_result` 的 tool_use 各一个块（RD-09 与
RD-10 的合批规则），因此这是合批规则的提前开启形态；同时就绪的接续排在文本之前
（RD-11）。前台调用的语义不变：登记仍开放，文本 Step 结束后 Run 回到 `waiting`，其结算
仍按 [SE-14](../../session/v2/contract.md) A 列为 continuation，并因已占位而以
`system_reminder{late_result}` 进入到达的 Step。等人时的普通文本不是答复（答复沿
[HD-04](../../human-decisions/v2/contract.md) 的 `answer`），请求与登记都保留。Run 的 basis
仍是首批，后续取入的批以 `supplement` 记在 Run 上（[RN-02](../../run/v2/contract.md)），
[RN-08](../../run/v2/contract.md) 恢复时按 Step 切点重建；Session 处于 hold 时不取入。

## Agent Loop 的扩展点站点

**RD-19**：Agent Loop 的扩展点站点是封闭枚举，由本契约拥有。扩展点只有四种：准备
阶段同步贡献者（在 RD-06/RD-07 的短提交之外运行，受求值时限约束，超时即无贡献并
记录）、守卫（在取用或准入的准备阶段求值，只能关闭或收紧）、投影选择器（只选择
进入模型的投影）、提交后观察者（消费已提交事实，不能延迟、撤销或改写提交，也不能
把内容送进已经发出的请求）。每个站点只承载下表指定的那一种。

| 站点 | 标签 | 循环位置 | 扩展点种类 | 扩展点归属 | 权力上界 |
|---|---|---|---|---|---|
| S0 | `run_prepare` | 本 Run 首个 Step 的准备阶段（RD-06 短提交之外） | 准备阶段同步贡献者 | 本契约 RD-06；prompt section 形状归 [MC-07](../../model-execution/v2/contract.md) | 贡献本 Run 首个 Step 的 prompt section 或 `system_reminder{hook_context}`；不可阻断开 Run |
| S1 | `pre_take` | 输入受理后、取用前的准备阶段（开新 Run 时是调度者，取入既有 Run 时是驱动器） | 守卫 | 队列项与 arrival 的关闭归 [SE-04/06/12](../../session/v2/contract.md)，求值时点与协议归本契约 RD-17 | 只能关闭该队列项（`closed_by_guard`）；不能改写内容、顺序或到达行为，不能阻断受理 |
| S2 | `assembly` | 装配模型输入（RD-06 准备阶段之内） | 准备阶段同步贡献者 | [MC-07](../../model-execution/v2/contract.md)（prompt section）、[TL-01](../../tools/v2/contract.md)（skill 与工具贡献） | 改写 prompt section 与 skill 贡献；不可阻断，不改写已耐久的输入、历史与结果 |
| S3 | `model_request` | 发出模型请求（RD-08） | — | — | 本版不开放：模型归 Run 固定，模型切换只在下一 Run 生效 |
| S4 | `model_stream` | 模型流式响应（MC 的帧投影） | — | — | 本版不开放 |
| S5 | `pre_execute` | 工具准入：门的授权求值之后、准入提交之前的准备阶段 | 守卫 | [TL-13](../../tools/v2/contract.md) | 只能收紧（deny 或 ask）并记原因；参数与授权结论不可改写，不能放宽 |
| S6 | `tool_execute` | 工具执行中（执行 owner 的账本内） | — | — | 本版不开放 |
| S7 | `post_execute` | 结算 arrival 被裁决后、结果进入任一 Step 投影前，每个结算求值一次 | 投影选择器 | [TL-13](../../tools/v2/contract.md) | 只能排除或附带上下文地选择进入模型的投影；不改耐久结果，不改结算结论 |
| S8 | `run_settle` | Run 完成条件成立的提交之后（RD-15） | 提交后观察者 | [LC-03](../../../compositions/session-run-agent-lifecycles/v2/contract.md) 的提交后反应；入队沿 [SE-13](../../session/v2/contract.md) | 观察；可按普通到达入队 trigger 使 Session 开新 Run；没有阻止 Run 结算的路径（RD-17） |
| S9 | `session_lifecycle` | Session 归档/删除的提交之后（[SE-02](../../session/v2/contract.md)） | 提交后观察者 | LC-03 的提交后反应 | 只观察 |
| 旁路 A | `auxiliary_prepare` | 压缩等辅助 Step 的准备阶段与其提交之后（RD-07） | 准备阶段同步贡献者 + 提交后观察者 | 本契约 RD-07；压缩语义归 [MC-10](../../model-execution/v2/contract.md) | 贡献辅助 Step 的输入；观察其结果并以 `system_reminder{hook_context}` 进入下一 Step；不可阻断或替换压缩结果 |
| 旁路 B | `control_committed` | Run 控制受理与进展的提交之后（[RN-03/05](../../run/v2/contract.md)） | 提交后观察者 | LC-03 的提交后反应 | 只观察；不能阻止或改写控制 |
| 旁路 C | `dispatch_settle` | 派发调用与子 Run 结算 | — | — | 本版不开放，随 PF-004 |
| 旁路 D | `recovery` | 崩溃恢复与重取（RD-04/RD-16） | — | — | 本版不开放 |

进程内插件登记扩展点一律按本表的站点与种类登记，站点标签是登记的一等标识；
[external-hooks v1](../../external-hooks/v1/contract.md) 是本表的一个消费者，把外部命令式
hooks 适配到这些站点，不另定义站点，也不获得本表之外的权力。任何站点都不能阻止
Run 结算（RD-17）。本版不开放的站点没有登记入口，尝试登记被拒绝并记录为不支持。

## 与 v2 的差异

| 条款 | 性质 | 内容 | 来源裁决 |
|---|---|---|---|
| RD-01/RD-03/RD-04/RD-05/RD-07/RD-15/RD-16 | 澄清 | 引用升到本批次精确版本；RD-02 的 view 增列登记簿与 context 水位、intent 增 supplement/placeholders 与 AwaitBatch/AwaitClaims；RD-04 增 `superseded` 不可 resume、折叠登记簿；RD-16 增两个恢复窗口行 | 作者裁决 3、作者裁决 8 |
| RD-06 | 兼容扩展 | 切点来源由三类扩展为六类表：补充批、占位、`system_reminder{late_result \| human_answer}`、`system_reminder{system_notice}`、`system_reminder{hook_context}`；删除"问答型 human_answer"作为就绪接续；守卫在准备阶段求值 | 作者裁决 4、7、作者裁决 12、作者裁决 19 |
| RD-08 | 兼容扩展 | 增 `run.step.settled{outcome}` 两值与 `invalid_proposal{reasons}` 的收口与耐久来源；门等待改为登记表述 | 作者裁决 18 |
| RD-09 | 语义变化 | 结算视图表的第四列由"阻止收束"改为登记与关系；新增 `waiting_human` 视图；每个视图值给出恰一个块；晚到结果与答复以 `system_reminder` 呈现；问答型请求附属于内建 `human` 调用 | 作者裁决 8、9、U-44、U-46 |
| RD-10 | 语义变化 | Step 收束 = attempt 已结算且提议已登记；原"阻止收束"改为开下一 Step 的合批规则（每个 tool_use 恰一个块、缺省等本批前台登记注销、三种提前开）；占位首次呈现即开 Step，已呈现不再触发；补自然完成的判定基准；判定顺序增"队首合格文本" | 作者裁决 9、作者裁决 7 |
| RD-11 | 语义变化 | 等待状态收敛为 `waiting` + `waitingFor` 投影；唤醒集合 = 任何注销 + 队首合格文本；出边增取入文本；批准消费的位置表述改为登记 | 作者裁决 7、8、U-59 |
| RD-12 | 语义变化 | `waiting_gate` 不再是 Run 状态：门在登记簿登记 `(gateRef, gateRet)`，放行即注销；补"前提门未恢复时不取入补充批" | §2.6 词表、作者裁决 7 |
| RD-13 | 语义变化 | 收口只覆盖停止类操作；interrupt_then_run 终点改为 `superseded` 并整簿注销；force_stop 在受理提交整簿注销；新增一段：不可恢复失败只处置未准入调用，已准入调用与未答请求继续（U-43） | U-43、作者裁决 2、3、作者裁决 10 |
| RD-14 | 澄清 | Yield 前提改按登记簿陈述：`foreground` / `detach_in_flight` / 已过门未 start 阻止；`human_wait`、未过门与门不阻止；Yield 不注销登记 | 作者裁决 17 |
| RD-17 | 兼容扩展 | 新增受理后取用前的守卫：只能关闭项、由取用者在准备阶段求值、fail-open 且幂等；hooks 贡献的正文只能以 `system_reminder{hook_context}` 进入 | hooks RD-17 行、S1 守卫协议 |
| RD-18 | 新增 | 等待期间取入排队文本：空闲点、取批形态、切点内容、次序、前台语义、basis 与 supplement | 作者裁决 7、[PF-013 变更记录](../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#变更记录) |
| RD-19 | 新增 | Agent Loop 扩展点站点的封闭枚举：四种扩展点、S0～S9 与四条旁路的循环位置、归属与权力上界、本版不开放的站点 | hooks 提案站点与权力表、HK-1 权力上界 |
