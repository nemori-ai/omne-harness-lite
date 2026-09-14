# Run 驱动器 v1

本契约身份为 `capability.run-driver`，版本 1。规范依赖：
[session-run v2](../../session-run/v2/contract.md)（Run/Step/占位/Inbound）、
[tools v1](../../tools/v1/contract.md)（调用与执行 owner）、
[human-decisions v1](../../human-decisions/v1/contract.md)（请求与接续）、
[model-execution v1](../../model-execution/v1/contract.md)（attempt 与窗口）、
[共同准入 CC v1](../../../compositions/core-work-coordination/v1/contract.md)、
[durable-records v1](../../durable-records/v1/contract.md)、
[live-agent v1](../../live-agent/v1/contract.md)（工作许可与退役）、
[共享数据 CD v1](../../../data/core-work/v1/contract.md)。本契约只定义驱动器如何在
这些权威的已提交事实上推进，不改写它们的状态转移。接受依据为
[决定 D-012](../../../../docs/decisions/D-012-run-driver-and-inbound.md)，设计来源
从该决定与本能力入口导航。

## 定义与原则

**RD-01**：Run 驱动器是可重建、不持有私有状态权威的推进过程。它对 Run 的已提交
事实求纯函数 `decide(view) → intent`，只在 SR-08 的安全边界推进，每次推进经
CC-01/03 共同提交并核对当前 epoch（SR-08）。驱动位置 `{RunRef, epoch, currentStep,
phase}` 是 SR-13 的 projection，从 Run/Step/调用/请求事实确定性 fold；只有意图是
authoritative：复合打断（SR-11）、接续就绪（SR-16）、终止意图（SR-12）、门等待的
`(gateRef, gateRet)`（SR-08）。相同的已提交事实前缀必得相同意图。

**RD-02**：`view` 只来自已提交前缀（DR-03），含 Run 状态与 epoch、当前 Step 与其
调用批的结算视图（RD-09）、指向本 Run 的已裁决 arrival（只读 classified，SR-21）、
pending 请求集合、阻塞集合、预算立场与资格摘要。`intent` 是封闭联合：
OpenStep(basis | continuations)、AuxiliaryStep(kind)、RequestModel(step)、
ProposeCalls(step, calls)、AwaitCalls(step)、AwaitContinuation(positions)、
AwaitGate(gateRef, ret)、AdmitApproved(calls)、Reattach(calls)、Yield(reason)、
CloseOut(reason)、Settle(run, reason)。

**RD-03**：每次共同提交的 operationId 从事实前缀确定地派生：
`f(RunRef, stepId, commitKind, ordinal)`，commitKind ∈ {open_step, admit_attempt,
dispatch_attempt, settle_attempt, propose_call, admit_call, consume_decision,
settle_step, await_gate, settle_run}，ordinal 为该 Step 内同类提交序号；不同
commitKind 不共用 operationId。恢复重跑与崩溃前那次提交使用同一 operationId，由
CC-03/DR-02 去重认回；同 ID 异输入返回 conflict 时重读前缀重算，不覆盖。Inbound
裁决、`take*`/调度与重取的 operationId 由 session-run v2 各自派生。

## 取得驱动与命令

**RD-04**：驱动只以三种方式取得，均在同一提交内取得 `(SessionRef, RunRef, epoch)`：
新 Run（被 takeBatch/takeCommand/takeTrigger 吸收，SR-06/18）、resume（SR-10）、
重取（占位仍由本 Run 持有而 epoch 已被 Yield 封闭，SR-18）。resume 与重取都执行
完整的取得步骤，缺一步不得进入 decide：(1) 取新 epoch 使旧执行者失去提交权；
(2) 读完整已提交前缀，撕裂尾部截回，未回执批次以 lookupOperation 确认；(3) 等待
Session 级裁决者把本 Session 未裁决的 arrival 裁决完（SR-21）；(4) 折叠驱动位置，对
dispatched/executing/unknown 的模型请求与调用按原 attemptId 向原 owner
inspect/subscribe（TL-11、MC-06），核实不了的记 unknown 且不重发。前提是无全
Run/Session 控制阻塞，不要求阻塞集合为空（HD-04）。

**RD-05**：basis 为 command 的 Run 只由 SR-07 的命令处理者结算，不经模型与工具
批；上下文装载型命令随 text 项进入模型输入（SR-07）。命令 Run 的结算映射与
控制语义沿 SR-07。

## Step 的开启、模型请求与调用批

**RD-06**：开 Step 前在短提交之外准备：读取模型可消费的就绪接续与 context 水位
（SR-19），按 MC-10 估算窗口；需要压缩则先执行辅助 Step 再重新准备。随后在一次
共同提交内冻结切点并把被消费的接续标为 consumed。切点来自且只来自：Run 的
启动依据（仅首个 Step）、模型可消费的就绪接续（已裁决的 call_settlement、问答型
human_answer、provisional_outcome）、context 水位内的指针。审批型 human_answer
不进入切点，只由 RD-11 消费；两者同时就绪时先消费批准再开 Step。Step 切点
建立后不可变。本 Step 所需的模型路由、技能或工具绑定不可用时不开 Step，Run 进入
waiting_gate(kind=dependency, ret=E1)；调用级依赖丢失沿 TL-06 结算 unavailable，
不在此等待。

**RD-07**：压缩、标题等具名辅助工作作为独立 Step：自有切点与 attempt，不消费
arrival；每次准备最多执行一次辅助 Step，辅助失败、unknown 核实不了或压缩后仍
超限时以 failed(context_overflow) 收口，不重复压缩（MC-10）。

**RD-08**：模型请求沿 MC-03/04：prepare → 共同准入（attempt、预算、epoch）→ 发网
前耐久 dispatched 记录 → dispatch → 帧投影 → settle。准入阶段预算被拒（BG-03）或
路由不可用时不产生 attempt，Run 进入 waiting_gate(kind=budget|dependency, ret=E3)，
恢复后同一 Step 重新准入。attempt 结算的出边封闭：success → 调用批；partial 的
完整内容块作为 attempt 事实保留披露、被截断的 tool_call 不 propose、按 failed 处理；
failed 且政策允许 → 同 Step 新 attempt，切点不变；failed 且政策不允许 → 收口，
Run failed；unknown 可核实 → 按核实结果；unknown 核实不了 → 记 unknown 与费用
暴露，政策允许则新 attempt，否则 failed(unknown)；cancelled → 收口。一个 Step 至多
一个 success attempt，它是该 Step 唯一的权威模型输出。

**RD-09**：调用批沿 TL-07：proposed 耐久登记 → 门 → allow 者在联合提交取得预算
预留、精确使用与执行许可后由独立 owner start；ask 者建 HD 请求；deny 者直接
结算。预算预留被拒时调用停留在 proposed，Run 进入 waiting_gate(kind=budget,
ret=E4)，恢复后从该调用起重新过门。缺省串行下后续调用停在 proposed_pending_gate，
前一个调用的视图不再阻止收束后放行。子代理派发是普通工具调用，其结果路由沿
TL-10/11 与 call_settlement；子 Agent 权限与终止传播沿 SR-12 末段交给 PF-004。

Step 收束的结算视图是封闭词表，settled 只源自指向该调用的已裁决 call_settlement
arrival（SR-16），其余值从工具/人类决定权威的状态 fold：

| 视图值 | 来源 | 进入下一 Step 的块 | 阻止收束 |
|---|---|---|---|
| settled(succeeded / failed / denied_before_execution / cancelled_before_execution / interrupted / unavailable / unknown) | 已裁决 call_settlement | tool_result（unknown 标明未知） | 否 |
| settling | TL-07 已记终态但 arrival 未裁决 | 无 | 是 |
| staged_provisional | HD-11 产物已 staging、请求待决 | tool_result + deferred_receipt | 否 |
| detached_background | executing 且 detach 已确认，或启动即后台 | deferred_receipt | 否 |
| detach_in_flight | 已请求 detach、owner 未确认 | 无 | 是 |
| waiting_approval | HD-03 待人类决定 | deferred_receipt | 否 |
| proposed_pending_gate | 缺省串行下尚未过门 | 无 | 是 |
| executing_foreground | 前台且未 detach | 无 | 是 |
| admitted_pending_start | 已准入但 start 回执或耐久确认未到 | 无 | 是 |

同一 Step 内呈现给模型的结果保持模型发出的顺序；跨 Step 晚到的结果以
deferred_receipt 占位并在到达的 Step 呈现；完成顺序单独记录（SR-09）。

**RD-10**：Step 收束当且仅当批内不存在阻止收束的视图值；存在时驱动器以
AwaitCalls 等待（Run 保持 running 与占位），唤醒集合是任何能使某个阻止者不再
阻止的变化：结算 arrival 被裁决、detach 确认、串行门放行、start 回执或耐久确认。
收束后按顺序判定：完成条件成立（SR-09）→ 结算 Run；有审批就绪 → RD-11；有
模型可消费的接续 → 开新 Step；否则进入等待。只有 deferred_receipt 而没有可喂给
模型的新内容时不开 Step。

## 等待、批准消费与门

**RD-11**：等待时 Run 处于 waiting、waiting_human 或 waiting_gate，释放模型/工具
驱动但保留占位；驱动器订阅指向本 Run 等待位置的已裁决 arrival，没有就绪接续时
休眠，不做模型轮询。出边封闭：模型可消费的接续就绪 → 开 Step；审批就绪 →
消费批准；请求无答复而关闭（HD-06 approved_but_not_admitted、HD-07 模式切换、
TL-06 绑定撤回、请求过期）→ 该位置解除并重评完成条件；门恢复 → 返回 gateRet。

消费批准（AdmitApproved）沿 HD-06：再次核对当前规则、原精确绑定、待执行位置
与决定，在共同准入中把决定标记被原调用消费、取得预算预留与执行许可，由 owner
start；该调用的 Step 已收束时不开新 Step，Run 以"等待该调用结算"为 Run 级位置，
结算即接续就绪，不引入 TL-10 之外的第三种关系。决定为 reject 时在同一节点把
调用结算为 denied_before_execution，其结算另作 call_settlement 进入切点。失败分支：
HD-06 复核不通过 → denied_before_execution，位置解除；预算预留被拒 → 决定未消费，
waiting_gate(kind=budget, ret=E4A)；owner start busy → 保持 admitted_pending_start，
按 TL-08 政策同 attemptId 重发，超出政策结算 unavailable；owner 不可用或绑定撤回
→ unavailable，位置解除。经批准消费而启动的调用，其结算总在 Run 的等待位置集合
中有对应项。

**RD-12**：waiting_gate 的进入点只有 RD-06（dependency）、RD-08（budget/dependency）、
RD-09（budget）、RD-11（budget）四处，进入时以 AwaitGate 在阻塞集合登记
`(gateRef, gateRet)`。退出只有三条路：对应 gate_restored 接续 → 返回 gateRet 在原
节点重新做准入或过门，不跳过门；显式 resume → 复核门后重取，门仍闭则回到
waiting_gate；控制 → 收口。gate_restored 的生产者义务归预算能力与依赖可用性
能力的提供者。waiting_gate 持有占位，该 Session 的普通排队输入在门恢复或用户
interrupt 前不能开新 Run。

## 收口、退役与结算

**RD-13**：所有停止类操作共用收口协议：封闭新 Step → 按处置表逐个处理在途调用
（interrupt 一律中断并留下真实结局；interrupt_then_run 可转后台者转、不可转者
中断、已后台者继续；cancel/force_stop 沿 SR-10/12）→ 取得每个调用的真实停止/
交接/未知结果 → 按原因走终点。收口直接向工具与人类决定权威 inspect，不消费
arrival；收口期间产生的结算 arrival 由 Inbound 裁决为 interrupted Run 的恢复位置
或被关闭。终点：interrupt → interrupted，释放占位；interrupt_then_run → interrupted +
supersededByInput，释放占位；cancel → cancelled；force_stop 隔离已证实 →
cancelled(force_stopped)；隔离未证实 → stopping，保留占位；不可恢复失败 → failed。
未派发即被取消的调用得到合成终态；unknown 允许长期存在但必须可见。

**RD-14**：运行时退役（AR-11/12）以 Yield 结束驱动：封闭 epoch、保留占位、Run
状态不变，位置由投影保留，由 Session 级调度以新 epoch 重取（SR-18）。前提沿
AR-12 步骤 1：本实例拥有的前台工作已结算或已移交，即批内不存在
executing_foreground、admitted_pending_start、detach_in_flight；热宽限到期仍不满足时
按 interrupt 收口并记 yield_forced。Yield 不是控制，不改写为 interrupt。

**RD-15**：Run 结算沿 SR-09 的完成条件，与 Inbound 接续处理同一提交（SR-20）；占位
释放与终态同一提交。结算后由 Session 级调度启动下一 Run。

## 恢复

**RD-16**：非预期退出（进程崩溃、OOM、宿主重启、断电、与 owner 分区、writer 隔离）
后的恢复不是重放日志重新执行，而是 RD-04 的四步后用同一个 decide 算出下一步。
成立前提是每个外部效果之前都有耐久意图（CC-04、TL-08、MC-03/04），事实前缀落后
于世界至多一个在途尝试。恢复重跑不会对同一 attempt 再次发网或再次派发同一
attemptId 的 start；新 attempt 只能是经政策与准入的新记录。两项提供者义务：模型
执行提供者在发网前提交 dispatched 记录（MC-04）；工具执行 owner 以同一 attemptId
幂等接纳 start 且重启先恢复账本（TL-08）。逐窗口判定：

| 崩溃窗口 | 恢复判定 |
|---|---|
| 占位后、开 Step 前 | 重新 OpenStep，启动依据认回同一批 |
| 切点提交前 | 重算切点，由重同步后的前缀决定 |
| 辅助 Step 中途 | 同模型窗口；压缩结果未提交视为未压缩 |
| attempt 准入后、dispatch 记录前 | 判定未发出：旧 attempt cancelled，同 Step 新 attempt |
| dispatch 记录后、settle 前 | 记 unknown/partial；有供应方 ID 则查询，否则按政策新 attempt 并保留费用暴露；已流给用户的前缀不可恢复 |
| 提交时 | lookupOperation 认回或重做 |
| 调用 proposed 后、准入前 | 重新过门，按当前授权/预算判定 |
| 准入后、owner 确认 start 前 | 同 attemptId inspect；owner 无此 attempt 且许可有效则同 ID 重发；账本不耐久则 unknown |
| executing 中 | 独立 owner 存活则 subscribe 重连；owner 随进程死亡则 unknown |
| 存活但与 owner 分区 | 不换 epoch；按 TL-11 标 unknown/lost，Run 等待重连或人工处置 |
| 等待中 | 重新订阅；答复期间崩溃按 HD-08/CC-05 补交付；门等待从 gateRet 继续 |
| 批准消费后、start 前 | 同准入后的 start 窗口 |
| 收口中途 | 逐个 inspect 继续收口；墓碑拒绝迟到 start |
| Yield 后、重取前 | 调度重取即 RD-04，不是新 Run |
| 受理后、裁决前 | Session 级裁决者在当前 Run 状态下裁决 |
| writer 隔离 | 停在已确认水位处，不推进 |

本版接受的局限：模型流式前缀不可恢复；同进程前台工具随进程死亡的外部效果只能
unknown；多进程部署下旧 epoch 持有者的活性判定不在本版。

## 可改写与可阻断的站点

**RD-17**：输入准入归 Inbound 与 SR 队列，插件只能作到达行为求值提供者；装配
可改写 prompt section 与 skill 贡献但不可阻断；模型请求不开放改写 hook，模型归
Run 固定；工具前只有 TL-07 门与 TL-13 守卫且守卫只能收紧，参数不可改写；工具后
只能选择进入模型的投影，不改耐久结果；停止边界只有 SR-09 完成条件，没有
"阻止停止"的 hook；压缩是 MC-10 的辅助 Step。
