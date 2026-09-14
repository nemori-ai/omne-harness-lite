# Run、Step、执行权与控制 v1

本契约身份为 `capability.run`，版本 1。它与 [capability.session v1](../../session/v1/contract.md)
一起取代 [session-run v2](../../session-run/v2/contract.md)：v2 中 Run、状态、epoch、Step、
驱动位置投影、取得下一 Step 的条件、控制（interrupt/resume/cancel/force_stop）、复合
打断对旧 Run 的处置、命令 Run 的终态映射与恢复兼容证据归本契约；Session、队列与
Inbound 归 session v1；占位、执行者与级联归
[生命周期组合 LC v1](../../../compositions/session-run-agent-lifecycles/v1/contract.md)。
逐句归属表由 [D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 引用的提案记录。
除引用、占位相关句与一处模型发现（RN-03）外，条款正文不改动 v2 语义。

规范依赖：[共享数据 CD v1](../../../data/core-work/v1/contract.md)、
[共同准入 CC v2](../../../compositions/core-work-coordination/v2/contract.md)、
[耐久记录 DR v1](../../durable-records/v1/contract.md)、
[生命周期组合 LC v1](../../../compositions/session-run-agent-lifecycles/v1/contract.md)。
本版引用但不改写 [session v1](../../session/v1/contract.md)、[tools v1](../../tools/v1/contract.md)、
[human-decisions v1](../../human-decisions/v1/contract.md)、
[live-agent v1](../../live-agent/v1/contract.md)、
[model-execution v1](../../model-execution/v1/contract.md) 与
[budget-accounting v1](../../budget-accounting/v1/contract.md) 的条款；驱动器的推进规则由
[run-driver v2](../../run-driver/v2/contract.md) 消费本版定义。接受依据为
[决定 D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md)。

## Run、Step 与执行权

**RN-01**：Run 有 RunRef、启动依据（一批连续用户文本、一条有序命令或一项
trigger 之一，由 [SE-06/07](../../session/v1/contract.md) 的取用建立）、modelSelection、
定义和预算依据、执行 epoch、驱动位置、等待位置集合、阻塞集合及状态。状态为
preparing、running、waiting、waiting_human、waiting_gate、interrupted、stopping、
completed、failed、cancelled；completed/failed/cancelled 为逻辑终态，之后只接受隔离
证据，不接受推进。waiting_human 是 HD-03 所指"没有合法就绪接续、仍待人类答复"的
等待；waiting_gate 是预算预留被拒或 Run 级依赖不可用时的等待，其阻塞集合恰含一组
`(gateRef = {kind: budget | dependency, ref}, gateRet)`，由 run-driver 登记为
authoritative 意图，只能由对应的 `gate_restored` 接续（[SE-13](../../session/v1/contract.md)）
解除并返回 gateRet。

执行 epoch 表示"当前哪个执行者可以提交"：同一 Run 同一时刻至多一个未封闭的
epoch，发行新 epoch 的提交同时封闭旧 epoch，旧 epoch 的提交被拒绝并作隔离证据
保留。运行时退役（AR-11/12）只封闭 epoch，Run 状态不变，由 Session 级调度以新
epoch 重取。Run 是否持有本 Session 的驱动权（占位）不是 Run 的字段，而是由 Run
状态派生的关系，归 [LC-02](../../../compositions/session-run-agent-lifecycles/v1/contract.md)：
running、waiting、waiting_human、waiting_gate 与 stopping 占位，interrupted 与终态不占位。
一个 Run 可多次激活不同 AgentRef，但新 epoch 必须使旧执行者失去继续提交权。

Step 是一次已绑定模型请求及返回工具批次的工作单元，或具名辅助工作（压缩、
标题等）；每个请求重试使用新的 attempt，但不改变 Step；一个 Step 至多一个
success attempt，它是该 Step 唯一的权威模型输出；后一轮模型决策产生新 Step。
驱动位置是 [SE-10](../../session/v1/contract.md) 注册面上的 projection：从 Run/Step/调用/
请求的已提交事实确定性 fold 出 `{RunRef, epoch, currentStep, phase}`，只可在耐久输入
批次、模型结果/未知处理、工具接纳/结果关联和等待结算等安全边界推进，不序列化
调用栈，恢复时重算而不读取任何循环私有状态。Run 的模型固定到本次 Run，后续用户
选择保存在 Session 供下一 Run 使用，不在 Step 之间静默替换。

**RN-02**：驱动仅在有效 Run epoch、live-agent 工作许可、当前业务资格、没有
全 Run/Session 控制阻塞，且所选 continuation 的本地前提满足时取得下一个
Step。"就绪接续"只由 Inbound 已裁决为 continuation 的 arrival 定义
（[SE-13/14](../../session/v1/contract.md)）：调用结算、问答型人类答复、暂行回传、门恢复；
审批型人类答复是审批就绪，不开 Step，由 run-driver 的批准消费处理。其他独立人类
请求仍 pending 不阻止已答请求的唯一接续；按耐久就绪顺序串行获得同一 Session
驱动，占位不能复制。没有就绪接续时等待，不产生无意义的模型轮询。tool-returned
记录须匹配原 call/attempt；LLM 返回工具建议不是已执行工具。并发工具结果保留实际
完成顺序和模型呈现顺序的分别记录，不用完成顺序重写模型建议的关联。Run 可在
确认独立后台责任后完成；晚到结果继续归原 Step，后续感知为新的输入／上下文事实。

continuation 结束不等于整个 Run 完成。普通 completed 仅在所有本 Run 接续
已结算、没有 pending 阻塞请求、没有未消费的就绪接续或审批就绪、没有 Run 级
等待位置（收束后经批准启动的调用）、不在门等待，且剩余后台责任均已确认独立
持有时成立。q1 接续完成而 q2 未答时，Run 回到 waiting_human 并保留 q2；
不得利用普通终态清理取消尚待答的独立请求。显式 cancel/force_stop 或
不可恢复失败才沿其具名终止政策关闭剩余请求，并保留原因及已完成接续。

## 控制

**RN-03**：控制请求有 operationId、精确 RunRef、观察 epoch、范围和实际
结果。旧目标自然结束返回 ended；Session 当前换成新 Run 返回 stale_target，
不重定向。受理、施加、物理停止、清理与外部效果状态分别表达；跨端重复
点击查询同一事实。控制权限不自动给正文读权。

interrupt 封闭目标新的 Step，终止该 Run 的在途模型观察并请求取消原 Run
所有未结算自有工具（含后台）。逐个取得真实停止/未知及清理结果；安全
收口后状态 interrupted，保留 Session、部分历史和恢复位置。resume 只对
匹配 interrupted 或有可解除阻塞的 waiting/waiting_human/waiting_gate 生效，复核
当前资格并取得新 epoch，不能清除仍待人类答复的阻塞，不自动重试已中断工具；对
waiting_gate 的 resume 是复核门后的重取，门仍闭则回到 waiting_gate。运行时退役
产生的 Yield 不是控制请求，不改写为 interrupt，也不出现在控制结果中。cancel 形成
cancelled 终态，沿相同自有调用范围收口，不能被恢复或迟到结果重新启动。

对 interrupted 的 Run 施加 cancel 或 force_stop 直接进入 cancelled，不经 stopping：
interrupted 已安全收口、不占位，其自有调用在 interrupt 时已停止；若再进入 stopping
会重新占位并与此时正在运行的新 Run 并存，违反占位唯一
（[LC-02](../../../compositions/session-run-agent-lifecycles/v1/contract.md)；本条由
[D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 引用的 Lifecycles 模型反例得出）。指向它的接续按 cancelled 关闭。

**RN-04**：interrupt_then_run 的受理与新输入的排队归 [SE-08](../../session/v1/contract.md)。
旧 Run 的可转后台前台工具尝试转后台，失败则中断；不可转后台工具中断，已后台
工具保持执行。只有各项已确认由独立执行 owner 承担，或停止且安全结算后，才能
释放旧驱动占位。旧 Run 记录 interrupted 和 `supersededByInput`，保留接续与工具
归因；不会自动恢复。尚待批准的工具未执行，不可 detach；原调用结算
cancelled_before_execution，相关审批 superseded。独立问题保留原 Run 的中断阻塞，
不能被新输入误消费。用户日后对旧 interrupted Run 显式 resume 仅在 Session 没有
活动驱动时可受理，并核对中间历史/旧逻辑目标是否仍可合法接续；不相容返回
superseded，不换工作。

**RN-05**：force_stop 立即撤销目标 epoch 的继续执行／结果提交权，尽力停止
已受控执行体，记录物理停止、隔离、残留与外部效果未知。旧结果只可作为
隔离证据，不修改有效 Run 结果。后续队列等安全停止/隔离依据确定后才准入。
受理强停后 Run 进入 stopping，并持有不可由 resume 清除的终止意图。只有
全部原执行者确认停止，或已建立覆盖迟到启动及结果提交的有效隔离后，才
进入 cancelled(reason=force_stopped) 并释放驱动占位。unknown 不等于安全停止；
不能证实隔离时保留 stopping 和原责任。隔离后仍可能存在的外部效果、费用
和清理责任独立记录，不能用 cancelled 表示它们已经回滚。Session 范围强停对
队列的 hold 归 [SE-09](../../session/v1/contract.md)，与本条的受理在同一提交。
stopping 与 cancelled(force_stopped) 的 Run 自有调用的晚到结算只作隔离证据：其
arrival 记 closed(isolated)，不成为接续也不生成 trigger。
结构化后代、脱离委托和 handoff 的传播交给 PF-004 专属关系，不从后台工具
策略推导子 Agent 权限或终止规则。

**RN-06**：basis 为 command 的 Run 由 [SE-07](../../session/v1/contract.md) 的 takeCommand
建立，只由命令处理者结算，不经模型与工具批。其结算映射为 Run 终态：success →
completed，rejected/failed → failed(reason)，unknown 保留占位且长期可见，只由原命令
操作的查询解除；命令 Run 接受 cancel/force_stop，interrupt 返回 not_applicable。

## 状态贡献与恢复

**RN-07**：Run、Step、等待位置、阻塞集合与控制是本能力的 authoritative 事实，只经
具名提交条件更新，不提供任意状态赋值。驱动位置由 run-driver 以 projection 贡献
注册到 [SE-10](../../session/v1/contract.md) 的注册面，输入为本能力持有的事实；缺少
解析器或版本不符时该视图 unavailable，不返回默认位置。

**RN-08**：恢复从原合法位置重建，先校验日志前缀、schema/reducer 版本、定义/配置/
组件和执行环境能力。恢复兼容证据包含所需契约版本、实现协议、媒体可达性、外部
工作原引用，以及 Run 记录的驱动绑定与投影 reducer 版本，不仅比较 OS 名称；
resume 与重取都须通过该证据，驱动器实现换代后不兼容的 Run 保持原状态并保留占位，
等待用户控制或兼容实现，不自动迁移。已开始但无明确结局的调用向原执行 owner
询问；原背景工作仍存活则重新订阅同 call，不能重复派发。无法确认的模型请求/
工具外部效果记 unknown 并阻塞依赖决定，历史读取仍可可用。cancelled Run 不复活，
writer/Run 旧 epoch 失效。重取以新 epoch 进行，operationId 从 `(RunRef, 封闭的
epoch)` 派生，且只在 Session 级裁决扫描完成之后（[SE-11/18](../../session/v1/contract.md)、
[LC-08](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）。崩溃没有留下
Yield 事实时，"epoch 未封闭但无实例持有"与"epoch 已封闭"在恢复上是同一种情况，
都只能重取。

**RN-09**：Run 到 completed/failed/cancelled 的终态转移与 Inbound 的接续处理在同一
提交（[SE-17](../../session/v1/contract.md)、[LC-04 行 3](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）；
占位关系随状态派生，不需要单独的释放事实。结算后由 Session 级调度启动下一 Run。

本版不承诺多进程部署下旧 epoch 持有者的活性判定；跨协调域部署所需的义务清单见
[LC-09](../../../compositions/session-run-agent-lifecycles/v1/contract.md)。
