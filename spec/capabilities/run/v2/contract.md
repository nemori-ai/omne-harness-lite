# Run、Step、执行权与控制 v2

本契约身份为 `capability.run`，版本 2。与 [v1](../v1/contract.md) 的差异是语义变化与
兼容扩展：v1 的"等待位置集合"收敛为一份**等待登记簿**，成员规则、两条事实与登记／
注销的提交边界写入正文（RN-01）；`waiting_human` 与 `waiting_gate` 不再是 Run 状态，
收成登记簿的 `waitingFor` 投影，终态集合新增 `superseded`（RN-01、RN-04）；不可恢复
失败只结算尚未准入的调用，已准入调用与未答请求保留（RN-02）；控制权限键、收口对
`unknown` 的计入、控制结果形状与隔离记录写入正文（RN-03、RN-05）；`supplement` 批与
按 Step 切点恢复写入正文（RN-02、RN-08）。未在[差异表](#与上一版的差异)中列出的条款
保留 v1 的编号与正文含义。接受依据为
[决定 D-015](../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
v1 保持冻结与可引用，未迁移的消费者继续按 v1。

规范依赖：[共享数据 CD v2](../../../data/core-work/v2/contract.md)、
[共同准入 CC v2](../../../compositions/core-work-coordination/v2/contract.md)、
[耐久记录 DR v2](../../durable-records/v2/contract.md)、
[生命周期组合 LC v2](../../../compositions/session-run-agent-lifecycles/v2/contract.md)。
本版引用但不改写 [session v2](../../session/v2/contract.md)、[tools v2](../../tools/v2/contract.md)、
[human-decisions v2](../../human-decisions/v2/contract.md)、
[live-agent v1](../../live-agent/v1/contract.md)、
[model-execution v2](../../model-execution/v2/contract.md)、
[budget-accounting v1](../../budget-accounting/v1/contract.md) 与
[tenant-governance v1](../../tenant-governance/v1/contract.md) 的条款；驱动器的推进规则由
[run-driver v3](../../run-driver/v3/contract.md) 消费本版定义。

## Run、Step 与执行权

**RN-01**：Run 有 RunRef、启动依据 basis（一批连续用户文本、一条有序命令或一项
trigger 之一，由 [SE-06/07](../../session/v2/contract.md) 的取用建立）、`supplement`（Run 在
等待中经 SE-06 取入既有 Run 的后续批，按取入顺序记录，不改写 basis）、modelSelection、
定义和预算依据、执行 epoch、驱动位置、等待登记簿、阻塞集合及状态。状态为
preparing、running、waiting、interrupted、stopping、completed、failed、cancelled、
superseded；completed、failed、cancelled、superseded 为逻辑终态，之后只接受隔离证据，
不接受推进。v1 的 waiting_human 与 waiting_gate 不再是状态：等人、等工具与等门都是
waiting，由等待登记簿的投影 `waitingFor: WaitClaim[]` 区分。阻塞集合与等待登记簿分开：
登记簿记"本 Run 在等谁办完"，阻塞集合记全 Run／Session 级的控制阻塞（interrupt 后的
全 Run 阻塞、[SE-09](../../session/v2/contract.md) 的 Session hold），只由控制解除。

等待登记簿是"本 Run 在等谁"的唯一权威。登记项为
`WaitClaim{holder: CallRef | GateRef, kind: call | gate, since: StepRef | null, ret?}`：
holder 只能是本 Run 提议并耐久登记的调用，或本 Run 进入的门，不接受任意对象，登记不是
公开端口；一个 holder 至多一条开放登记；`since` 是登记时的当前 Step，首个 Step 之前进入
的依赖门为 null；`ret` 只有门有，等于已耐久的 `run.gate.awaited` 的 gateRet，门只能由匹配
的 `gate_restored` 接续（[SE-13](../../session/v2/contract.md)）放行并返回该值。人类请求不
独立登记，附属于承载它的调用——系统审批附属于等审批的那个调用，问题与 Agent 发起的
批准附属于内建 `human` 调用（[TL-07](../../tools/v2/contract.md)、[HD-03](../../human-decisions/v2/contract.md)）——
一次等待只有一条登记。串行门是 Step 内的派发顺序，驱动器 Yield 是 epoch 交接，都不登记。

登记与注销各是一条耐久事实：`run.wait.claimed{holder, kind, since}` 与
`run.wait.released{holder, outcome}`，`outcome ∈ settled | detached | passed | superseded |
failed | cancelled`。登记与 holder 自己的耐久登记在同一提交：调用在 `tools.call.proposed`
同批登记（从提议起本 Run 就在等它——等门、等审批、等执行都算），门在 `run.gate.awaited`
同批登记。注销恰与释放它的那条事实在同一提交，只有以下几种：该调用的结算到达被裁决为
continuation 的提交（`settled`，[LC-04 行 9](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）、
detach 确认或启动即后台的准入（`detached`，[TL-10](../../tools/v2/contract.md)）、门放行
（`passed`）、Run 的终态提交（`failed | cancelled | superseded`，RN-09）、force_stop 受理进入
stopping 的提交（`cancelled`，RN-05）。结算到达已受理而尚未裁决的窗口
（[SE-18](../../session/v2/contract.md) 的两次提交）里登记仍开放：本 Run 确实还在等它，直到
裁决说这是接续为止。

Run 处于 waiting 当且仅当当前 Step 已收束且等待登记簿非空；Step 收束的判据（本 Step 的
attempt 已结算且其调用提议已耐久登记）归 [RD-09/10](../../run-driver/v3/contract.md)。
"等人 / 等工具 / 等门"不是独立状态，只是 `waitingFor` 对登记项的分类投影；调用上的前台、
转换中与后台等待关系（[TL-10](../../tools/v2/contract.md)）同样是本登记簿的按调用投影，不是
第二份权威。

执行 epoch 表示"当前哪个执行者可以提交"：同一 Run 同一时刻至多一个未封闭的
epoch，发行新 epoch 的提交同时封闭旧 epoch，旧 epoch 的提交被拒绝并作隔离证据
保留。运行时退役（AR-11/12）只封闭 epoch，Run 状态不变，由 Session 级调度以新
epoch 重取。Run 是否持有本 Session 的驱动权（占位）不是 Run 的字段，而是由 Run
状态与其终止受理记录派生的关系，归
[LC-02](../../../compositions/session-run-agent-lifecycles/v2/contract.md)：running、waiting，
以及由活动 Run 的终止受理进入的 stopping 占位；interrupted、由 interrupted 升级进入的
stopping（RN-03）与终态不占位。一个 Run 可多次激活不同 AgentRef，但新 epoch 必须使旧
执行者失去继续提交权。

Step 是一次已绑定模型请求及返回工具批次的工作单元，或具名辅助工作（压缩、
标题等）；每个请求重试使用新的 attempt，但不改变 Step；一个 Step 至多一个
success attempt，它是该 Step 唯一的权威模型输出；后一轮模型决策产生新 Step。
驱动位置是 [SE-10](../../session/v2/contract.md) 注册面上的 projection：从 Run/Step/调用/
请求的已提交事实确定性 fold 出 `{RunRef, epoch, currentStep, phase}`，只可在耐久输入
批次、模型结果/未知处理、工具接纳/结果关联和等待结算等安全边界推进，不序列化
调用栈，恢复时重算而不读取任何循环私有状态。Run 的模型固定到本次 Run，后续用户
选择保存在 Session 供下一 Run 使用，不在 Step 之间静默替换。

**RN-02**：驱动仅在有效 Run epoch、live-agent 工作许可、当前业务资格、没有
全 Run/Session 控制阻塞，且所选 continuation 的本地前提满足时取得下一个
Step。"就绪接续"只由 Inbound 已裁决为 continuation 的 arrival 定义
（[SE-13/14](../../session/v2/contract.md)）：调用结算、暂行回传、门恢复；`human` 调用的
问答与 Agent 发起批准的答复由 HD 作为该调用的执行 owner 结算，同样以调用结算到达，不
另立问答型来源；审批型人类答复是审批就绪，不开 Step，由驱动器的批准消费处理。其他
独立人类请求仍 pending 不阻止已答请求的唯一接续；按耐久就绪顺序串行获得同一 Session
驱动，占位不能复制。没有就绪接续时等待，不产生无意义的模型轮询。tool-returned
记录须匹配原 call/attempt；LLM 返回工具建议不是已执行工具。并发工具结果保留实际
完成顺序和模型呈现顺序的分别记录，不用完成顺序重写模型建议的关联。Run 可在
确认独立后台责任后完成；晚到结果继续归原 Step，后续感知为新的输入／上下文事实。

Run 在 waiting 的空闲点经 [SE-06](../../session/v2/contract.md) 取入的后续用户批不建立新
Run、不换 epoch：该批以 `supplement` 记在本 Run 上（RN-01），与开下一个 Step 在同一提交
（[LC-04 行 3](../../../compositions/session-run-agent-lifecycles/v2/contract.md)），basis 不变。

continuation 结束不等于整个 Run 完成。普通 completed 仅在等待登记簿为空、没有未消费的
就绪接续或审批就绪，且剩余后台责任均已确认独立持有时成立；登记簿非空时 Run 停在
waiting。q1 的接续完成而 q2 未答时，承载 q2 的 `human` 调用仍在登记簿上，Run 回到 waiting
（`waitingFor` 投影为等人）并保留 q2；不得利用普通终态清理取消尚待答的独立请求。

显式 cancel 与 force_stop 沿其具名终止政策关闭剩余请求并结算尚未准入的调用
（RN-03/05）。不可恢复失败（failed）不同：过门是 Run 的动作，因此它只结算尚未准入的
调用（proposed、waiting_approval，其审批请求在同一提交关闭），已准入的调用与未答的人类
请求保留，由各自的执行 owner 继续（[TL-07/08](../../tools/v2/contract.md)）；failed 的终态
提交整簿注销等待登记（`failed`），其后到达的结算与答复按
[SE-14](../../session/v2/contract.md) 的 C 列成为 queue 的 trigger 项，由新 Run 接上。所有终态
都保留原因及已完成接续。

## 控制

**RN-03**：控制请求有 operationId、精确 RunRef、观察 epoch、范围和实际
结果。控制结果为 `complete` 或 `partial{unknown: K}`，K 为收口时物理结果仍为 unknown 的
自有调用数；`partial` 不报告完整成功
（[PF-013.C6](../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)）。
旧目标自然结束返回 ended；Session 当前换成新 Run 返回 stale_target，
不重定向。受理、施加、物理停止、清理与外部效果状态分别表达；跨端重复
点击查询同一事实。控制权限不自动给正文读权：合法发起者是 Session owner，以及持有权限键
`session.emergency_control` 的同租户管理员（[PF-013.C10](../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)；
该资格独立于内容读取权，[TG-02](../../tenant-governance/v1/contract.md)），每次受理记录
发起者与其获准依据。

interrupt 封闭目标新的 Step，终止该 Run 的在途模型观察并请求取消原 Run
所有未结算自有工具（含后台）。安全收口完成的条件是：每个停止请求都已有物理事实
（`quiescent | isolated | unknown`，[TL-09](../../tools/v2/contract.md)）或该调用已结算。
`unknown` 计入收口，Run 照常进入 interrupted；未证实的停止长期留在该调用与控制记录上
可见，不设系统级停止超时，也没有"收口中"的 Run 状态。收口后状态 interrupted，保留
Session、部分历史、恢复位置与等待登记簿——interrupt 不注销任何登记（RN-01），中断期间
到达的结算若其 holder 仍有开放登记，仍是本 Run 的 continuation，保留到 resume 消费
（[SE-14](../../session/v2/contract.md) A 列）。

resume 只对匹配 interrupted 或有可解除阻塞的 waiting 生效，复核
当前资格并取得新 epoch，不能清除仍待人类答复的阻塞，不自动重试已中断工具；对
等门的 Run 的 resume 是复核门后的重取，门仍闭则回到 waiting 且该门的登记保留。
`superseded` 是终态，对它的 resume 返回 superseded（RN-04）。运行时退役
产生的 Yield 不是控制请求，不改写为 interrupt，也不出现在控制结果中；Yield 不改写等待
登记簿。cancel 形成 cancelled 终态，沿相同自有调用范围收口，其终态提交整簿注销等待
登记（`cancelled`），不能被恢复或迟到结果重新启动。

对 interrupted 的 Run 施加 cancel 直接进入 cancelled，不经 stopping：
interrupted 已安全收口、不占位，其自有调用在 interrupt 时已请求停止；若再进入 stopping
会重新占位并与此时正在运行的新 Run 并存，违反占位唯一
（[LC-02](../../../compositions/session-run-agent-lifecycles/v2/contract.md)；本判断由
[D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 引用的 Lifecycles
模型反例得出）。force_stop 同样直达 cancelled，除非该 Run 存在物理结果仍为 unknown、且其
执行 owner 声明 `stop.capability = forced_isolation` 的调用："自有调用已停止"的前提此时
不成立，受理后进入 stopping，按 RN-05 取得隔离依据再进入 cancelled。由 interrupted 升级
进入的 stopping 不重新取得本 Session 的驱动占位（LC-02）：interrupt 时释放的占位不因升级
恢复，它也不阻止此时已在运行的 Run。指向终态 Run 的接续按
[SE-17](../../session/v2/contract.md) 关闭或改判。

**RN-04**：interrupt_then_run 的受理与新输入的排队归 [SE-08](../../session/v2/contract.md)，
同提交形状归 [LC-04 行 8](../../../compositions/session-run-agent-lifecycles/v2/contract.md)。
旧 Run 的可转后台前台工具尝试转后台，失败则中断；不可转后台工具中断，已在后台的调用
保持后台执行（[PF-013.C4](../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)）。
收口完成的条件与 interrupt 相同：每个停止请求都有物理事实，`unknown` 计入收口并按
RN-03 记入控制结果的 `partial{unknown: K}`。

收口后旧 Run 进入终态 `superseded` 并记录 `supersededByInput`。该终态提交同时完成三件事
（[LC-04 行 4](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）：整簿注销
等待登记（`superseded`）；把指向本 Run 的未消费 continuation 改判为 context
（[SE-17](../../session/v2/contract.md)），它们按水位在下一个开 Step 的 Run 可见，不转
trigger、不唤醒等待中的 Run；把一份被保留的工作清单作为 `origin: system`、意图为 context
的到达受理进 Inbound（[SE-13/14](../../session/v2/contract.md)），由本 Session 下一个有模型
Step 的 Run 在切点恰消费一次。清单列出转后台的调用、保持后台的调用、停止未确认的调用、
未答的人类请求，以及本 Run 在该提交里自行取消的未启动调用——它们没有执行 owner 的结算
到达，清单是它们进入新 Run 的唯一入口——各带对调用与请求的引用。

尚待批准的工具未执行，不可 detach；原调用结算 cancelled_before_execution，
相关审批请求关闭。未答的人类请求保留、仍可答；登记随整簿注销后，其答复与其它迟到结算
按 [SE-14](../../session/v2/contract.md) 查登记簿路由：没有开放登记时，当时有活动 Run 则为
context，没有则为 queue 的 trigger 项（[HD-04](../../human-decisions/v2/contract.md)）。

旧 Run 不可 resume：日后对它显式 resume 返回 superseded。被越过的 Run 登记已全部注销、
没有残留接续，其输入又被新输入取代，恢复只会空转；`superseded` 是终态，归档不需要为它
设特殊规则（[LC-05](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。

**RN-05**：force_stop 立即撤销目标 epoch 的继续执行／结果提交权，尽力停止
已受控执行体，记录物理停止、隔离、残留与外部效果未知。受理强停后 Run 进入 stopping，
并持有不可由 resume 清除的终止意图；受理的同一提交整簿注销等待登记（`cancelled`，
RN-01），stopping 期间没有开放登记。旧结果只可作为隔离证据，不修改有效 Run 结果。
后续队列等安全停止/隔离依据确定后才准入。

stopping 只等待声明 `stop.capability = forced_isolation` 的执行 owner 回答：对每个物理
结果仍为 unknown 且其 owner 有此声明的调用发一次 `stopCall{mode: force}`
（[TL-11](../../tools/v2/contract.md)），owner 报 `isolated` 则控制记录对该调用记
`isolation: isolated`，再报 `unknown` 则记 `isolation: unverified`；owner 声明
`cooperative_fence` 或 `unsupported` 的 unknown 调用没有升级路径，在受理时即记
`isolation: unverified`，不阻止进入终态。全部有升级路径的调用回答后进入
cancelled(reason=force_stopped) 并释放驱动占位，控制结果按仍为 unknown 的调用数记
`complete` 或 `partial{unknown: K}`（RN-03）。unknown 不等于安全停止：`isolation: unverified`
长期可见，不冒充隔离，也不因 resume 或迟到结果自动重试。隔离后仍可能存在的外部效果、
费用和清理责任独立记录，不能用 cancelled 表示它们已经回滚。

Session 范围强停对队列的 hold 归 [SE-09](../../session/v2/contract.md)，与本条的受理在同一
提交。stopping 与 cancelled(force_stopped) 的 Run 自有调用的晚到结算只作隔离证据：其
arrival 记 closed(isolated)，不成为接续也不生成 trigger（[SE-14](../../session/v2/contract.md)
D1 列）。结构化后代、脱离委托和 handoff 的传播交给 PF-004 专属关系，不从后台工具
策略推导子 Agent 权限或终止规则。

**RN-06**：basis 为 command 的 Run 由 [SE-07](../../session/v2/contract.md) 的 takeCommand
建立，只由命令处理者结算，不经模型与工具批。其结算映射为 Run 终态：success →
completed，rejected/failed → failed(reason)，unknown 保留占位且长期可见，只由原命令
操作的查询解除；命令 Run 接受 cancel/force_stop，interrupt 返回 not_applicable。命令 Run
没有模型 Step，不消费 RN-04 的工作清单，也不取入 `supplement` 批。

## 状态贡献与恢复

**RN-07**：Run、Step、等待登记簿、阻塞集合与控制是本能力的 authoritative 事实，只经
具名提交条件更新，不提供任意状态赋值。驱动位置由 run-driver 以 projection 贡献
注册到 [SE-10](../../session/v2/contract.md) 的注册面，输入为本能力持有的事实；缺少
解析器或版本不符时该视图 unavailable，不返回默认位置。

**RN-08**：恢复从原合法位置重建，先校验日志前缀、schema/reducer 版本、定义/配置/
组件和执行环境能力。恢复兼容证据包含所需契约版本、实现协议、媒体可达性、外部
工作原引用，以及 Run 记录的驱动绑定与投影 reducer 版本，不仅比较 OS 名称；
resume 与重取都须通过该证据，驱动器实现换代后不兼容的 Run 保持原状态并保留占位，
等待用户控制或兼容实现，不自动迁移。basis 与每个 `supplement` 批各按其取入提交重建，
Run 的可见输入按 Step 切点重建，不重新合批；等待登记簿由 `run.wait.claimed / released`
的事实前缀重算，不另存快照。已开始但无明确结局的调用向原执行 owner
询问；原背景工作仍存活则重新订阅同 call，不能重复派发。无法确认的模型请求/
工具外部效果记 unknown 并阻塞依赖决定，历史读取仍可可用。cancelled 与 superseded 的 Run
不复活，writer/Run 旧 epoch 失效。重取以新 epoch 进行，operationId 从 `(RunRef, 封闭的
epoch)` 派生，且只在 Session 级裁决扫描完成之后（[SE-11/18](../../session/v2/contract.md)、
[LC-08](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。崩溃没有留下
Yield 事实时，"epoch 未封闭但无实例持有"与"epoch 已封闭"在恢复上是同一种情况，
都只能重取。

**RN-09**：Run 到 completed/failed/cancelled/superseded 的终态转移与 Inbound 的接续处理在
同一提交（[SE-17](../../session/v2/contract.md)、
[LC-04 行 4](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）；同一提交
注销全部仍开放的等待登记（`failed | cancelled | superseded`），completed 的前提是登记簿
已空（RN-02）。占位关系随 Run 的已提交事实派生（RN-01），不需要单独的释放事实。结算后由 Session 级调度启动
下一 Run。

本版不承诺多进程部署下旧 epoch 持有者的活性判定；跨协调域部署所需的义务清单见
[LC-09](../../../compositions/session-run-agent-lifecycles/v2/contract.md)。等待登记簿的注销
与释放它的事实同批，在执行 owner 与 Run 分属不同协调域时退化为提交后反应，该情形的
义务也在 LC-09。

## 与上一版的差异

来源裁决列的编号（U-xx、作者裁决 x、缺口表某行）出自
[决定 D-015](../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)
接受的工具执行提案；编号到提案正文与锚点的链接由本能力的可变入口
（`spec/capabilities/run/README.md`）维护，契约正文不引用候选材料。

| 条款 | 性质 | 变更 | 来源裁决 |
|---|---|---|---|
| RN-01 | 语义变化 | "等待位置集合"改为等待登记簿：登记项 `WaitClaim`、成员规则（只有本 Run 提议的调用与它进入的门；人类请求附属于调用；串行门与 Yield 不登记）、两条事实 `run.wait.claimed / released` 与六个注销 outcome、登记与注销的提交边界、受理未裁决窗口内登记仍开放 | U-59、作者裁决 1/8 |
| RN-01 | 语义变化 | 状态集合删 waiting_human / waiting_gate、加终态 `superseded`；"等人/等工具/等门"改为 `waitingFor` 投影；Run waiting ⇔ Step 已收束且登记簿非空 | 作者裁决 3/9 |
| RN-01 | 澄清 | 阻塞集合与等待登记簿的分工；占位派生改为按状态与终止受理记录（配合 RN-03 的升级路径） | 本批次作者裁决（[差异说明](#未由来源直接给出的表达)） |
| RN-01 | 兼容扩展 | Run 字段加 `supplement`（取入既有 Run 的后续批） | 作者裁决 7 |
| RN-02 | 语义变化 | 就绪接续词表：删"问答型人类答复"，`human` 调用的答复经调用结算到达 | U-44、缺口表 SE-13 行 |
| RN-02 | 语义变化 | 完成条件按登记簿陈述；不可恢复失败只结算未准入调用，已准入调用与未答请求保留，终态整簿注销并按 SE-14 C 列接上 | U-43 |
| RN-02 | 兼容扩展 | `supplement` 批与开下一 Step 同提交，basis 不变 | 作者裁决 7 |
| RN-03 | 兼容扩展 | 控制结果形状 `complete \| partial{unknown: K}`；控制权限键 `session.emergency_control` 与合法发起者 | 作者裁决 14、缺口表 RN-03/05 行 |
| RN-03 | 语义变化 | 安全收口写明 `unknown` 计入、无系统级超时、无"收口中"状态；interrupted 保留等待登记簿 | 作者裁决 2 |
| RN-03 | 语义变化 | interrupted 上的 force_stop 在存在可升级 unknown 调用时经 stopping；该 stopping 不重新占位 | 作者裁决 10/14 |
| RN-03 | 澄清 | resume 的目标状态词表随 RN-01 收敛；`superseded` 返回 superseded；Yield 不改登记簿 | 作者裁决 3/13 |
| RN-04 | 语义变化 | 旧 Run 终态由 interrupted 改为新终态 `superseded`；终态提交整簿注销、未消费 continuation 改判 context、被保留工作清单作 `origin: system` 的 context 到达同批受理；不可 resume，删"核对旧逻辑目标是否仍可合法接续" | 作者裁决 3/4/12 |
| RN-04 | 语义变化 | 未答请求的答复按登记簿路由，不再"保留原 Run 的中断阻塞" | 作者裁决 3、缺口表 HD-04 行 |
| RN-05 | 语义变化 | force_stop 受理提交整簿注销；stopping 只等声明 `forced_isolation` 的 owner 回答，其余 unknown 调用记 `isolation: unverified` 且不阻止终态（取代 v1"不能证实隔离时保留 stopping"） | 作者裁决 14 |
| RN-05 | 兼容扩展 | 控制记录对每个 unknown 调用记 `isolation: isolated \| unverified` | 缺口表 RN-05 行 |
| RN-06 | 澄清 | 命令 Run 不消费工作清单、不取入 `supplement` | 作者裁决 12 |
| RN-07 | 澄清 | "等待位置"改称等待登记簿 | 同 RN-01 |
| RN-08 | 兼容扩展 | basis 与 `supplement` 按取入提交、可见输入按 Step 切点重建；登记簿由事实前缀重算；superseded 的 Run 不复活 | 缺口表 RN-02/RN-08 行、作者裁决 3 |
| RN-09 | 语义变化 | 终态集合加 superseded；同一提交注销全部开放登记；completed 以登记簿已空为前提 | 作者裁决 3/8 |
| RN-09 | 澄清 | 交叉引用由"LC-04 行 3"更正为行 4（v1 指向了取批行） | 本批次作者更正 |

### 未由来源直接给出的表达

RN-01 的占位派生与 RN-03 的"由 interrupted 升级进入的 stopping 不重新占位"是本版为使
作者裁决 10/14 与 [v1 RN-03](../v1/contract.md) 的模型发现（interrupted 经 stopping 会重新占位，违反占位唯一）同时成立而写明
的边界；来源提案提出了升级路径，但没有处理它与占位关系的交互。对应的 LC-02 表述见
[LC v2](../../../compositions/session-run-agent-lifecycles/v2/contract.md)；形式模型未覆盖该
转移，覆盖缺口记在本能力的验证范围页。
