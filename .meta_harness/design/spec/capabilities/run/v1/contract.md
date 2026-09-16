# Run、Step、执行权与控制 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.run, 1)`，状态为 candidate、
`acceptance:null`。正文从 `omne-harness-lite-legacy-spec` 的 `capability.run@2`
当前版本重基，保留 RN-01～RN-09 的身份和仍有效语义；旧决定、旧接受、
执行日志和旧模型结果只作 provenance，不自动接受或验证本坐标。

本能力的责任是：Run/Step 耐久状态、epoch、等待登记簿、控制、终态和恢复。 本轮采用 F/S/G 精确候选坐标；尚未迁移的
model-execution、media-content、message-stream 与 external-hooks 引用只表示后续接口需要，
不构成本候选 catalog 的当前依赖。后文出现的 legacy 路径和旧版本号用于恢复来源，
同名新谱系依赖均以本任务 candidate manifest 为准。

## Run、Step 与执行权

**RN-01**：Run 有 RunRef、启动依据 basis（一批连续用户文本、一条有序命令或一项
trigger 之一，由 SE-06/07（legacy source: `../../session/v2/contract.md`） 的取用建立）、`supplement`（Run 在
等待中经 SE-06 取入既有 Run 的后续批，按取入顺序记录，不改写 basis）、modelSelection、
定义和预算依据、执行 epoch、驱动位置、等待登记簿、阻塞集合及状态。状态为
preparing、running、waiting、interrupted、stopping、completed、failed、cancelled、
superseded；completed、failed、cancelled、superseded 为逻辑终态，之后只接受隔离证据，
不接受推进。v1 的 waiting_human 与 waiting_gate 不再是状态：等人、等工具与等门都是
waiting，由等待登记簿的投影 `waitingFor: WaitClaim[]` 区分。阻塞集合与等待登记簿分开：
登记簿记"本 Run 在等谁办完"，阻塞集合记全 Run／Session 级的控制阻塞（interrupt 后的
全 Run 阻塞、SE-09（legacy source: `../../session/v2/contract.md`） 的 Session hold），只由控制解除。

等待登记簿是"本 Run 在等谁"的唯一权威。登记项为
`WaitClaim{holder: CallRef | GateRef, kind: call | gate, since: StepRef | null, ret?}`：
holder 只能是本 Run 提议并耐久登记的调用，或本 Run 进入的门，不接受任意对象，登记不是
公开端口；一个 holder 至多一条开放登记；`since` 是登记时的当前 Step，首个 Step 之前进入
的依赖门为 null；`ret` 只有门有，等于已耐久的 `run.gate.awaited` 的 gateRet，门只能由匹配
的 `gate_restored` 接续（SE-13（legacy source: `../../session/v2/contract.md`））放行并返回该值。人类请求不
独立登记，附属于承载它的调用——系统审批附属于等审批的那个调用，问题与 Agent 发起的
批准附属于内建 `human` 调用（TL-16/17（legacy source: `../../tools/v2/contract.md`）、HD-03（legacy source: `../../human-decisions/v2/contract.md`））——
一次等待只有一条登记。串行门是 Step 内的派发顺序，驱动器 Yield 是 epoch 交接，都不登记。

Run 拥有 `run.*` 命名空间下的耐久事实名，本版的封闭清单：`run.lifecycle.created`、
`run.state.changed{to}`（RN-02 的每次状态转移一条）、`run.control.requested{kind}` 与
`run.control.progressed{result}`（RN-03/05）、`run.epoch.closed`（epoch 交接与撤销，RN-02/05）、`run.gate.awaited`、
`run.wait.claimed` 与 `run.wait.released`（本条）、`run.calls.proposed{calls}`（提议批的 Run 侧
准备，与 `tools.call.proposed` 同批）、`run.call.admitted{call}`（准入的 Run 侧登记）与
`run.approval.consumed{call, answer}`（消费一条批准答复，引用被消费答复的 eventId），三者的
提交伙伴归 TL-15（legacy source: `../../tools/v2/contract.md`）。Step 事实 `run.step.opened` 与 `run.step.settled`
在同一命名空间，由驱动器提交、归 RD-08（legacy source: `../../run-driver/v3/contract.md`） 定义。消费者引用
这些名字时以本清单为准，不另起同义事实。

登记与注销各是一条耐久事实：`run.wait.claimed{holder, kind, since}` 与
`run.wait.released{holder, outcome}`，`outcome ∈ settled | detached | passed | superseded |
failed | cancelled`。登记与 holder 自己的耐久登记在同一提交：调用在 `tools.call.proposed`
同批登记（从提议起本 Run 就在等它——等门、等审批、等执行都算），门在 `run.gate.awaited`
同批登记。注销恰与释放它的那条事实在同一提交，只有以下几种：该调用的结算到达被裁决为
continuation 的提交（`settled`，LC-04 行 9（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））、
detach 确认或启动即后台的准入（`detached`，TL-10（legacy source: `../../tools/v2/contract.md`））、门放行
（`passed`）、Run 的终态提交（`failed | cancelled | superseded`，RN-09）、force_stop 受理进入
stopping 的提交（`cancelled`，RN-05）。结算到达已受理而尚未裁决的窗口
（SE-18（legacy source: `../../session/v2/contract.md`） 的两次提交）里登记仍开放：本 Run 确实还在等它，直到
裁决说这是接续为止。

Run 处于 waiting 当且仅当当前 Step 已收束且等待登记簿非空；Step 收束的判据（本 Step 的
attempt 已结算且其调用提议已耐久登记）归 RD-09/10（legacy source: `../../run-driver/v3/contract.md`）。
"等人 / 等工具 / 等门"不是独立状态，只是 `waitingFor` 对登记项的分类投影；调用上的前台、
转换中与后台等待关系（词表归 TL-14（legacy source: `../../tools/v2/contract.md`） 维度 C，投影规则归 TL-16）同样是本登记簿的按调用投影，不是
第二份权威。

执行 epoch 表示"当前哪个执行者可以提交"：同一 Run 同一时刻至多一个未封闭的
epoch，发行新 epoch 的提交同时封闭旧 epoch，旧 epoch 的提交被拒绝并作隔离证据
保留。运行时退役（AR-11/12）只封闭 epoch，Run 状态不变，由 Session 级调度以新
epoch 重取。Run 是否持有本 Session 的驱动权（占位）不是 Run 的字段，而是由 Run
状态与其终止受理记录派生的关系，归
LC-02（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）：running、waiting，
以及由活动 Run 的终止受理进入的 stopping 占位；interrupted、由 interrupted 升级进入的
stopping（RN-03）与终态不占位。一个 Run 可多次激活不同 AgentRef，但新 epoch 必须使旧
执行者失去继续提交权。

Step 是一次已绑定模型请求及返回工具批次的工作单元，或具名辅助工作（压缩、
标题等）；每个请求重试使用新的 attempt，但不改变 Step；一个 Step 至多一个
success attempt，它是该 Step 唯一的权威模型输出；后一轮模型决策产生新 Step。
驱动位置是 SE-10（legacy source: `../../session/v2/contract.md`） 注册面上的 projection：从 Run/Step/调用/
请求的已提交事实确定性 fold 出 `{RunRef, epoch, currentStep, phase}`，只可在耐久输入
批次、模型结果/未知处理、工具接纳/结果关联和等待结算等安全边界推进，不序列化
调用栈，恢复时重算而不读取任何循环私有状态。Run 的模型固定到本次 Run，后续用户
选择保存在 Session 供下一 Run 使用，不在 Step 之间静默替换。

**RN-02**：驱动仅在有效 Run epoch、live-agent 工作许可、当前业务资格、没有
全 Run/Session 控制阻塞，且所选 continuation 的本地前提满足时取得下一个
Step。"就绪接续"只由 Inbound 已裁决为 continuation 的 arrival 定义
（SE-13/14（legacy source: `../../session/v2/contract.md`））：调用结算、暂行回传、门恢复；`human` 调用的
问答与 Agent 发起批准的答复由 HD 作为该调用的执行 owner 结算，同样以调用结算到达，不
另立问答型来源；审批型人类答复是审批就绪，不开 Step，由驱动器的批准消费处理。其他
独立人类请求仍 pending 不阻止已答请求的唯一接续；按耐久就绪顺序串行获得同一 Session
驱动，占位不能复制。没有就绪接续时等待，不产生无意义的模型轮询。tool-returned
记录须匹配原 call/attempt；LLM 返回工具建议不是已执行工具。并发工具结果保留实际
完成顺序和模型呈现顺序的分别记录，不用完成顺序重写模型建议的关联。Run 可在
确认独立后台责任后完成；晚到结果继续归原 Step，后续感知为新的输入／上下文事实。

Run 在 waiting 的空闲点经 SE-06（legacy source: `../../session/v2/contract.md`） 取入的后续用户批不建立新
Run、不换 epoch：该批以 `supplement` 记在本 Run 上（RN-01），与开下一个 Step 在同一提交
（LC-04 行 3（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）），basis 不变。

continuation 结束不等于整个 Run 完成。普通 completed 仅在等待登记簿为空、没有未消费的
就绪接续或审批就绪，且剩余后台责任均已确认独立持有时成立；登记簿非空时 Run 停在
waiting。q1 的接续完成而 q2 未答时，承载 q2 的 `human` 调用仍在登记簿上，Run 回到 waiting
（`waitingFor` 投影为等人）并保留 q2；不得利用普通终态清理取消尚待答的独立请求。

显式 cancel 与 force_stop 沿其具名终止政策关闭剩余请求并结算尚未准入的调用
（RN-03/05）。不可恢复失败（failed）不同：过门是 Run 的动作，因此它只结算尚未准入的
调用（proposed、waiting_approval，其审批请求在同一提交关闭），已准入的调用与未答的人类
请求保留，由各自的执行 owner 继续（TL-07/08（legacy source: `../../tools/v2/contract.md`））；failed 的终态
提交整簿注销等待登记（`failed`），其后到达的结算与答复按
SE-14（legacy source: `../../session/v2/contract.md`） 的判定顺序裁决：Session 另有活动 Run 则为 context（B 列），否则成为 queue 的 trigger 项（C 列），由新 Run 接上。所有终态
都保留原因及已完成接续。

## 控制

**RN-03**：控制请求有 operationId、精确 RunRef、观察 epoch、范围和实际
结果。控制结果为 `complete` 或 `partial{unknown: K}`。interrupt/interrupt_then_run 的 K 是
收口时物理结果仍 unknown 的自有调用数；force_stop 的 K 只能是在强隔离已经证实后、外部
效果结局仍 unknown 的调用数，隔离本身 unknown/unverified 时不得终态或报告成功。`partial`
不报告完整成功
（PF-013.C6（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md`））。
旧目标自然结束返回 ended；Session 当前换成新 Run 返回 stale_target，
不重定向。受理、施加、物理停止、清理与外部效果状态分别表达；跨端重复
点击查询同一事实。控制权限不自动给正文读权：合法发起者是 Session owner，以及持有权限键
`session.emergency_control` 的同租户管理员（PF-013.C10（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md`）；
该资格独立于内容读取权，TG-02（legacy source: `../../tenant-governance/v1/contract.md`）），每次受理记录
发起者与其获准依据。

interrupt 封闭目标新的 Step，终止该 Run 的在途模型观察并请求取消原 Run
所有未结算自有工具（含后台）。安全收口完成的条件是：每个停止请求都已有物理事实
（`quiescent | isolated | unknown`，TL-09（legacy source: `../../tools/v2/contract.md`））或该调用已结算。
`unknown` 计入收口，Run 照常进入 interrupted；未证实的停止长期留在该调用与控制记录上
可见，不设系统级停止超时，也没有"收口中"的 Run 状态。收口后状态 interrupted，保留
Session、部分历史、恢复位置与等待登记簿——interrupt 不注销任何登记（RN-01），中断期间
到达的结算若其 holder 仍有开放登记，仍是本 Run 的 continuation，保留到 resume 消费
（SE-14（legacy source: `../../session/v2/contract.md`） A 列）。

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
（LC-02（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）；本判断由
D-014（legacy source: `../../../../docs/decisions/D-014-session-run-agent-lifecycles.md`） 引用的 Lifecycles
模型反例得出）。对 interrupted Run 的 force_stop，只有所有调用已结算或已有 quiescent/
强隔离证据时才能直达 cancelled；存在任何物理结果或隔离仍为 unknown/unverified 的调用时，
受理后进入 stopping 并按 RN-05 等待终态门。由 interrupted 升级进入的 stopping 不重新取得
本 Session 的驱动占位（LC-02），因此不阻止此时已在运行的新 Run；但它自身仍不能无证据
进入 cancelled。指向终态 Run 的接续按
SE-17（legacy source: `../../session/v2/contract.md`） 关闭或改判。

**RN-04**：interrupt_then_run 的受理与新输入的排队归 SE-08（legacy source: `../../session/v2/contract.md`），
同提交形状归 LC-04 行 8（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）。
旧 Run 的可转后台前台工具尝试转后台，失败则中断；不可转后台工具中断，已在后台的调用
保持后台执行（PF-013.C4（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md`））。
收口完成的条件与 interrupt 相同：每个停止请求都有物理事实，`unknown` 计入收口并按
RN-03 记入控制结果的 `partial{unknown: K}`。

收口后旧 Run 进入终态 `superseded` 并记录 `supersededByInput`。该终态提交同时完成三件事
（LC-04 行 4（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））：整簿注销
等待登记（`superseded`）；把指向本 Run 的未消费 continuation 改判为 context
（SE-17（legacy source: `../../session/v2/contract.md`）），它们按水位在下一个开 Step 的 Run 可见，不转
trigger、不唤醒等待中的 Run；把一份被保留的工作清单作为 `source: system`、意图为 context
的到达受理进 Inbound（SE-13/14（legacy source: `../../session/v2/contract.md`）），由本 Session 下一个有模型
Step 的 Run 在切点恰消费一次。清单列出转后台的调用、保持后台的调用、停止未确认的调用、
未答的人类请求，以及本 Run 在该提交里自行取消的未启动调用——它们没有执行 owner 的结算
到达，清单是它们进入新 Run 的唯一入口——各带对调用与请求的引用。

尚待批准的工具未执行，不可 detach；原调用结算 cancelled_before_execution，
相关审批请求关闭。未答的人类请求保留、仍可答；登记随整簿注销后，其答复与其它迟到结算
按 SE-14（legacy source: `../../session/v2/contract.md`） 查登记簿路由：没有开放登记时，当时有活动 Run 则为
context，没有则为 queue 的 trigger 项（HD-04（legacy source: `../../human-decisions/v2/contract.md`））。

旧 Run 不可 resume：日后对它显式 resume 返回 superseded。被越过的 Run 登记已全部注销、
没有残留接续，其输入又被新输入取代，恢复只会空转；`superseded` 是终态，归档不需要为它
设特殊规则（LC-05（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））。

**RN-05**：force_stop 立即撤销目标 epoch 的继续执行／结果提交权，尽力停止
已受控执行体，记录物理停止、隔离、残留与外部效果未知。受理强停后 Run 进入 stopping，
并持有不可由 resume 清除的终止意图；受理的同一提交整簿注销等待登记（`cancelled`，
RN-01），stopping 期间没有开放登记。旧结果只可作为隔离证据，不修改有效 Run 结果；
后续队列在该 stopping 持有占位时不得开始新驱动。

进入 cancelled(reason=force_stopped) 的门要求每个尚未明确结算的受控调用满足以下之一：
(a) owner 给出 `quiescent`；(b) 声明 `stop.capability = forced_isolation` 的 owner 给出可验证的
强隔离证据，至少绑定调用/attempt、目标作用域、执行 epoch、provider generation 与隔离
栅栏 revision，并保证该范围不能再产生目标侧效果。真实外部效果是否已经发生仍可为 unknown；
这种“效果未知但强隔离已证实”的收口可报告 `partial{unknown: K}`，K 只计效果结局未知，
不计执行隔离未知。

`isolation: unverified`、普通 `unknown`、超时、`cooperative_fence` 或 `unsupported` 都不满足
终态门；Run 保持 stopping、占位与后续队列屏障，直到取得强隔离/静止证据或有权的新契约
明确接管风险。每个 `forced_isolation` owner 只接收一次同 operationId 的
`stopCall{mode: force}`；重复或迟到报告只追加证据，不越过门。全部调用过门后才进入
cancelled 并释放占位。隔离后仍可能存在的外部效果、费用和清理责任独立记录，不能用
cancelled 表示它们已经回滚。

Session 范围强停对队列的 hold 归 SE-09，与本条受理同批。stopping 与已经通过强隔离门的
cancelled(force_stopped) Run 的晚到结算只作隔离证据，arrival 记 closed(isolated)，不成为
接续或 trigger（SE-14 D1）。结构化后代、脱离委托和 handoff 的传播交给 PF-004 专属关系。

**RN-06**：basis 为 command 的 Run 由 SE-07（legacy source: `../../session/v2/contract.md`） 的 takeCommand
建立，只由命令处理者结算，不经模型与工具批。其结算映射为 Run 终态：success →
completed，rejected/failed → failed(reason)，unknown 保留占位且长期可见，只由原命令
操作的查询解除；命令 Run 接受 cancel/force_stop，interrupt 返回 not_applicable。命令 Run
没有模型 Step，不消费 RN-04 的工作清单，也不取入 `supplement` 批。

## 状态贡献与恢复

**RN-07**：Run、Step、等待登记簿、阻塞集合与控制是本能力的 authoritative 事实，只经
具名提交条件更新，不提供任意状态赋值。驱动位置由 run-driver 以 projection 贡献
注册到 SE-10（legacy source: `../../session/v2/contract.md`） 的注册面，输入为本能力持有的事实；缺少
解析器或版本不符时该视图 unavailable，不返回默认位置。

**RN-08**：恢复从原合法位置重建，并受 SE-11 的恢复门约束。顺序是：校验所有所需
权威的完整已提交前缀与 schema/reducer/定义/配置 → fold Run、Step、等待登记与裁决视图 →
完成本 Session accepted arrivals 的裁决扫描 → inspect/subscribe 在途模型请求、调用和请求 →
核对当前资格与兼容证据 → 最后才在联合准入中发行新 epoch、取得工作许可并进入驱动。
任何较早发行的 epoch 都无效；历史读面可在前缀校验后按水位开放，但不能推进工作。

兼容证据包含本 baseline 的精确 Run/RunDriver 契约坐标、实现协议、媒体可达性、外部工作
原引用、Run 记录的 driver binding 与 projection reducer 版本。resume 与重取都须通过；
不兼容的 Run 保持原状态与占位，等待用户控制或兼容实现，不自动迁移。basis 和 supplement
按各自提交重建，等待登记由 claimed/released 前缀重算。无法确认的模型请求/工具效果记
unknown 并阻塞依赖决定，不重复派发。cancelled/superseded 不复活；新 epoch 的 operationId
从 `(RunRef, 封闭的 epoch)` 派生。崩溃没有 Yield 事实时，无实例持有的旧 epoch 与已封闭
epoch 一样只能经上述门重取。

**RN-09**：Run 到 completed/failed/cancelled/superseded 的终态转移与 Inbound 的接续处理在
同一提交（SE-17（legacy source: `../../session/v2/contract.md`）、
LC-04 行 4（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））；同一提交
注销全部仍开放的等待登记（`failed | cancelled | superseded`），completed 的前提是登记簿
已空（RN-02）。占位关系随 Run 的已提交事实派生（RN-01），不需要单独的释放事实。结算后由 Session 级调度启动
下一 Run。

本版不承诺多进程部署下旧 epoch 持有者的活性判定；跨协调域部署所需的义务清单见
LC-09（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）。等待登记簿的注销
与释放它的事实同批，在执行 owner 与 Run 分属不同协调域时退化为提交后反应，该情形的
义务也在 LC-09。

## Legacy 当前版形成时的来源差异

来源裁决列的编号（U-xx、作者裁决 x、缺口表某行）出自
决定 D-015（legacy source: `../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md`）
接受的工具执行提案；编号到提案正文与锚点的链接由本能力的可变入口
（`spec/capabilities/run/README.md`）维护，契约正文不引用候选材料。

| 条款 | 性质 | 变更 | 来源裁决 |
|---|---|---|---|
| RN-01 | 语义变化 | "等待位置集合"改为等待登记簿：登记项 `WaitClaim`、成员规则（只有本 Run 提议的调用与它进入的门；人类请求附属于调用；串行门与 Yield 不登记）、两条事实 `run.wait.claimed / released` 与六个注销 outcome、登记与注销的提交边界、受理未裁决窗口内登记仍开放 | U-59、作者裁决 1/8 |
| RN-01 | 语义变化 | 状态集合删 waiting_human / waiting_gate、加终态 `superseded`；"等人/等工具/等门"改为 `waitingFor` 投影；Run waiting ⇔ Step 已收束且登记簿非空 | 作者裁决 3/9 |
| RN-01 | 澄清 | 阻塞集合与等待登记簿的分工；占位派生改为按状态与终止受理记录（配合 RN-03 的升级路径） | 本批次作者裁决（[差异说明](#未由来源直接给出的表达)） |
| RN-01 | 兼容扩展 | Run 字段加 `supplement`（取入既有 Run 的后续批） | 作者裁决 7 |
| RN-01 | 兼容扩展 | `run.*` 命名空间耐久事实名的封闭清单（含 `run.calls.proposed`、`run.call.admitted`、`run.approval.consumed`），Step 事实归 RD-08 | 规格评审 2026-09-15 指出 tools v2 引用的 `run.*` 事实没有拥有者 |
| RN-02 | 语义变化 | 就绪接续词表：删"问答型人类答复"，`human` 调用的答复经调用结算到达 | U-44、缺口表 SE-13 行 |
| RN-02 | 语义变化 | 完成条件按登记簿陈述；不可恢复失败只结算未准入调用，已准入调用与未答请求保留，终态整簿注销并按 SE-14 C 列接上 | U-43 |
| RN-02 | 兼容扩展 | `supplement` 批与开下一 Step 同提交，basis 不变 | 作者裁决 7 |
| RN-03 | 兼容扩展 | 控制结果形状 `complete \| partial{unknown: K}`；控制权限键 `session.emergency_control` 与合法发起者 | 作者裁决 14、缺口表 RN-03/05 行 |
| RN-03 | 语义变化 | 安全收口写明 `unknown` 计入、无系统级超时、无"收口中"状态；interrupted 保留等待登记簿 | 作者裁决 2 |
| RN-03 | 语义变化 | interrupted 上 force_stop 只在全部已结算/quiescent/强隔离时直达；存在 isolation unknown/unverified 时进不占位的 stopping 并等待 RN-05 门 | 当前 v1 联合复核 |
| RN-03 | 澄清 | resume 的目标状态词表随 RN-01 收敛；`superseded` 返回 superseded；Yield 不改登记簿 | 作者裁决 3/13 |
| RN-04 | 语义变化 | 旧 Run 终态由 interrupted 改为新终态 `superseded`；终态提交整簿注销、未消费 continuation 改判 context、被保留工作清单作 `source: system` 的 context 到达同批受理；不可 resume，删"核对旧逻辑目标是否仍可合法接续" | 作者裁决 3/4/12 |
| RN-04 | 语义变化 | 未答请求的答复按登记簿路由，不再"保留原 Run 的中断阻塞" | 作者裁决 3、缺口表 HD-04 行 |
| RN-05 | 语义变化 | force_stop 受理提交整簿注销；quiescent 或绑定精确 call/attempt/scope/epoch/generation/fence 的强隔离证据才允许 cancelled；普通 unknown/unverified 不得释放占位或报告成功 | 当前 v1 联合复核 |
| RN-05 | 兼容扩展 | 控制记录对每个 unknown 调用记 `isolation: isolated \| unverified` | 缺口表 RN-05 行 |
| RN-06 | 澄清 | 命令 Run 不消费工作清单、不取入 `supplement` | 作者裁决 12 |
| RN-07 | 澄清 | "等待位置"改称等待登记簿 | 同 RN-01 |
| RN-08 | 兼容扩展 | basis 与 `supplement` 按取入提交、可见输入按 Step 切点重建；登记簿由事实前缀重算；superseded 的 Run 不复活 | 缺口表 RN-02/RN-08 行、作者裁决 3 |
| RN-09 | 语义变化 | 终态集合加 superseded；同一提交注销全部开放登记；completed 以登记簿已空为前提 | 作者裁决 3/8 |
| RN-09 | 澄清 | 交叉引用由"LC-04 行 3"更正为行 4（v1 指向了取批行） | 本批次作者更正 |

### 未由来源直接给出的表达

RN-01 的占位派生与 RN-03 的"由 interrupted 升级进入的 stopping 不重新占位"是本版为使
作者裁决 10/14 与 v1 RN-03（legacy source: `../v1/contract.md`） 的模型发现（interrupted 经 stopping 会重新占位，违反占位唯一）同时成立而写明
的边界；来源提案提出了升级路径，但没有处理它与占位关系的交互。对应的 LC-02 表述见
LC v2（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）；形式模型未覆盖该
转移，覆盖缺口记在本能力的验证范围页。
