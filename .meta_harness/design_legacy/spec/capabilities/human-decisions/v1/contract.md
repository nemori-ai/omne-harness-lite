# 耐久人类请求与决定 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.human-decisions, 1)`，状态为 candidate、
`acceptance:null`。正文从 `omne-harness-lite-legacy-spec` 的 `capability.human-decisions@2`
当前版本重基，保留 HD-01～HD-13 的身份和仍有效语义；旧决定、旧接受、
执行日志和旧模型结果只作 provenance，不自动接受或验证本坐标。

本能力的责任是：ask/unavailable、唯一答复、批准消费、暂行决定、撤销和统一决策池。 本轮采用 F/S/G 精确候选坐标；尚未迁移的
model-execution、media-content、message-stream 与 external-hooks 引用只表示后续接口需要，
不构成本候选 catalog 的当前依赖。后文出现的 legacy 路径和旧版本号用于恢复来源，
同名新谱系依赖均以本任务 candidate manifest 为准。

## 请求与合法作答

**HD-01**：请求由相应系统或 Agent 能力创建，具有不复用 requestId、tenant、
来源 Session／Run／调用或独立 WorkRef、kind、不可变内容版本、合法作答者规则、
状态和后果策略。kind 区分 question、agent_approval、system_approval、
specialized_consent、provisional_decision。来源及权限不能由自由文本推导。
question 和 agent_approval 的合法作答者固定为 Session.owner；创建请求不能
配置成管理员或其他成员。管理员的治理关闭权不包含代答权；该限制在 answer
处再次强制验证。专属同意和系统批准仍按具体动作的合法授予主体裁决。
问题说明为何问、答案会影响什么；批准说明真实动作／对象／影响、缺少的授权、
拒绝后去向及可选决定；系统审批内容从冻结 Action 派生。

**HD-02**：状态 pending → answered／cancelled／superseded，后果交付状态独立为
not_ready／pending_delivery／applied／failed／unknown。首个合法答复决定唯一
outcome；comment 对批准请求只记录评论，保持 pending，不占用首次决定。
含糊自由文本不转成 approve/reject；question 的非空/选项/多问项完整性按请求
Schema 校验，错误答案明确拒绝。请求身份、内容版本及 current revision 必须
匹配，迟到／重复答案返回当前真实结果，不改动其他请求；迟到答复不再产生
结算到达，也不重新打开已关闭的继续权。

本能力拥有 `hd.*` 命名空间下的三条耐久事实：`hd.request.created{request, kind, call}`
（请求创建，`kind ∈ system_approval | question | agent_approval`，`call` 是它附属的调用；与
调用的准入或等待在同一提交，见 HD-03 与 TL-15（legacy source: `../../tools/v2/contract.md`））、
`hd.decision.recorded{request, outcome, by}`（首个合法答复或程序化作答被记录，与承载调用的
结算或批准消费同批，HD-06）、`hd.request.closed{request, reason}`（`reason ∈ answered |
cancelled | superseded`，与请求终态转移同一提交）。消费者（tools v2、session v2、
message-stream v1）引用这三个名字，不另起同义事实。

**HD-03**：创建阻塞请求时，耐久提交 Action／request 和来源工作等待关系后才
呈现；相同调用与同一动作不能因通知重试创建多个待办。请求不在
run v2（legacy source: `../../run/v2/contract.md`） 的等待登记簿上独立登记：每个阻塞请求附属于
一个调用——system_approval 附属于等审批的那个调用，question 与 agent_approval
附属于发起它的 `human` 调用（HD-13）——该调用在被提议时已登记，一次等待只有
一条登记。等待因而绑定一个精确位置：该调用在其 Step 的 tool_use 位置。该位置
禁止继续，但不把同一逻辑 Run 的独立请求合成全部答完的屏障。Step 收束后登记簿
非空时 Run 为 `waiting`，"在等人"是登记项的投影而非独立 Run 状态；此时停止普通
模型／工具驱动，仍接受获准答复、精确控制，并按 session v2（legacy source: `../../session/v2/contract.md`）
在空闲点取入排队输入。回答 q1 使 q1 对应接续就绪，q2 仍 pending 也不妨碍 q1
获得串行驱动占位；同一 Session 同时仍只有一个执行驱动。人类请求不设数量上限，
不以工具批次上限变相限制。尚未准入的受控动作不执行；同批已准入工作按其所有权
继续收口并记录，不回滚已发生效果。系统不为等待自动设置答案或超时，热宽限到期
只能释放运行资源。

需要返回模型上下文时（由 run-driver v3（legacy source: `../../run-driver/v3/contract.md`） 在开 Step 时
决定），将原未完成调用表示为 CD v2（legacy source: `../../../data/core-work/v2/contract.md`）
的 `deferred_receipt{call, reason: waiting_approval | waiting_human | staged_provisional}`
占位块（含原 request/call 引用），与终态工具结果区分；接续上下文加入已答事实和
未答清单，不伪造 q2 的答案或成功结果。只有依赖该答案/许可的动作受其等待约束，
不能要求所有待答请求归零才处理 q1。request、continuation 与依赖动作关系由系统
权威记录，模型只能提出后续动作，仍经当前工具门。

**HD-04**：等待、请求、动作参数及已发生事实在独立耐久 owner 下存续。Agent
回收只撤除本地等待器／订阅，不能取消请求；重建从同一 requestId 与等待位置
恢复。cancel、force_stop、工作终态清理或明确取代在共同提交内关闭对应阻塞
请求／继续权，迟到答案和恢复不得复活。用户对单个 `human` 调用的停止即撤回
该问题，处置同 cancel。随工具取消的 system_approval 同时 cancelled；没有实际
启动的待批工具不能声称转后台成功。

控制级联分三种。普通 interrupt 保留 question 和 agent_approval 待答事实，
但设置全 Run 人工中断阻塞；后来答复不能自行清除该阻塞，须显式 resume，
其调用的等待登记在 interrupted 期间保持开放。Run 不可恢复失败保留已准入
调用与未答请求：过门是 Run 的动作，只有未准入的受控调用随失败关闭，答复
照常到达并按下段路由在新 Run 接上。interrupt_then_run 使旧 Run 进入终态
`superseded` 并在同一提交注销其整本等待登记簿；未启动的受控调用与其
system_approval 请求随之关闭并结算 `cancelled_before_execution`，question
与 agent_approval 请求保留且仍可答。

被越过、失败或已终态的 Run 的答复不按原 Run 恢复，而按等待登记簿与
session v2（legacy source: `../../session/v2/contract.md`） 的入站裁决路由：holder 在其发起 Run
上仍有开放登记且该 Run 活动时，该结算是这个 Run 的接续，裁决提交同批注销
登记；无开放登记时按发起 Run 与 Session 的当前状态成为 context、成为队列项
触发新 Run，或被关闭。恢复仍受 run v2（legacy source: `../../run/v2/contract.md`） 的合法接续
检查；`superseded` 是终态，不可 resume。

**HD-05**：answer 先认证当前作答者，核对请求特定资格、组织及实际工作状态，
再原子提交唯一决定和待交付后果。会话 owner 不当然有权代设备 owner、外部
账号主体或组织管理者授予专属权限。专用同意经其专属能力结算，普通批准接口
不能伪造它。请求 pool 只转交这个操作，不自行生成授权事实。

程序化作答者是登记在本能力上的受信提供者，只对 system_approval 有效；
question 与 agent_approval 的作答者仍固定为 Session.owner（HD-01），不因
登记而放开。这类提交的实际 actor 是该提供者，它代表装配相应资产的租户成员
（on-behalf-of 记该成员关系的 revision，TG-05（legacy source: `../../tenant-governance/v1/contract.md`））；
提交时重新验证该成员关系仍有效、仍拥有该资产的选用关系、且仍是该 kind 的
合法作答者，任一不成立则拒绝本次提交并保留请求。会话确认模式为 confirm
或组织策略要求人工确认时（AU-04（legacy source: `../../action-authorization/v1/contract.md`）），
程序化的 approve 无效，请求继续等人工答复；程序化的 reject 照常结算。决定
记录区分程序化来源与人工答复，审计可辨，不把它记成该成员亲自作答。

## 批准与执行接续

**HD-06**：system_approval 的 approve 产生仅该 Action 可消费的一次性决定，
不是新的持久 grant。实际执行前再次核对当前规则、原精确绑定、待执行位置及
决定；在共同准入中将该决定标记被原调用消费并记录许可。重复答复、后果重放、
实例重建均不能形成第二次消费或另一个调用。执行结果未知时沿原 attempt 查询，
不能重用批准创建重试 attempt；再次实际尝试须有明确重试政策与新的准入。

approve 后权限变硬拒绝或专属资格丢失，记录 approved_but_not_admitted 及原因，
动作不执行；授权仍可申请但原请求不再适用时关闭旧后果并建立新请求。声明／
实现／参数／资源／环境范围变化不静默替换 Action，原请求 superseded 后重新
解析和判定。已合法批准的历史保留，不改写成人类拒绝。

**HD-07**：reject 结算该调用为 denied_before_execution，产生可信工具结果／
原因，该调用的等待登记随其结算注销，允许同一 Run 在没有其他阻塞且仍有执行权
时从该结果继续。此处“其他阻塞”仅指该 continuation 的前提和全 Run／Session
控制阻塞，不含其它独立请求仍 pending。它不授予执行原动作或自动重试权限，
也不必取消整个 Session。
模式从 standard 改为 unattended 不猜测人类拒绝；按新规则使请求失去可执行
后果并显式关闭／取代，保留设置变化原因。已有充分 grant 或改回 standard
也不自动把 pending 请求标 answered；有权用户可以关闭旧请求后重新请求准入。

**HD-08**：决定与对应工作在同一协调域时，决定结果和唯一 continuation 意图
共同提交；不共域时沿 CC-05，以 requestId/outcomeVersion 为目标去重身份。
接续意图按 kind 分两类：question 与 agent_approval 的答复就是其 `human` 调用
的结算，意图为 `call_settlement`（session v2（legacy source: `../../session/v2/contract.md`） 的
来源枚举），由入站裁决按等待登记簿路由（HD-04）；system_approval 与暂行决定的
后果沿其原意图交付。agent_approval 的答复只是耐久在历史里的用户提示词：它不
产生可被任何门消费的决定，不建立持久授权，之后真正执行的受控动作照常经
tools v2（legacy source: `../../tools/v2/contract.md`） 的调用门，需要人类确认的仍由系统发起
system_approval（PF-005.C2/C10（legacy source: `../../../../docs/requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#已确认要求`））。
continuation 只解除本请求对应位置的阻塞，多个请求独立并按耐久就绪顺序
获得驱动；不越过作用于整个 Run／Session 的 interrupt、hold、
终态、当前租户资格或预算门。目标暂不可达显示 pending_delivery，不要求用户
重复回答。当前端被关闭或通知丢失时可重新投影并重试同一后果。

## 统一决策池

**HD-09**：pool.list/get 是按当前身份获准范围聚合的索引，引用原请求，不拥有
第二份决定。每项包含来源、可自足的必要内容、真实状态、可选动作、当前可答性
和已知后果。可答性区分 available、unreachable、not_placed、unknown；pending
不等于此刻能够提交。跨 tenant 条目保留显式上下文，各项读取／答复独立授权。
首版不离线代收决定；不可达时明确拒绝该次提交而保留请求，不能凭 UI 缓存答复。

会话和池里的 answer 使用同一操作；并发批准/拒绝只保留首个合法结果。通知是
同 requestId 的投递，不创建新待办；送达／已读／重发／呈现窗口到期均不改变
决定。列表失效、已关闭项和迟到更新根据原权威水位修正，不无限显示悬空可答项。
筛选可按状态、kind、tenant、Session 和创建顺序；分页游标固定查询水位，不
跨权限变化泄漏旧内容。未获准 tenant 不能通过计数或错误泄漏存在性。

本能力另按 session v2（legacy source: `../../session/v2/contract.md`） 的快照贡献登记 `requests`：
给定主体与 `asOf` 水位，返回该主体在本条获准范围内、该 Session 的待答请求视图。
裁剪规则仍是本能力的，投影不另存第二份可见范围；`requests` 与同一快照的其它
派生视图在同一水位上裁剪，因而全量重取得到的是一个一致切面，而不是几个水位
拼起来的列表。

## 合格暂行确认

**HD-10**：只有领域能力显式注册并经验证的 `ProvisionalContract` 可以延后确认，
它必须定义暂行承载、禁止效果、完全撤销函数、依赖登记与回传策略，并绑定
版本和实际执行提供者。注册审批需求不自动获得此资格；不支持完整撤销的发送、
付款等效果仍走事前门，补偿不等于撤销。资格失效后禁止新的暂行执行。

**HD-11**：领域 staging 先过当前暂行准入，生成耐久且受遏制的产物及对应决定
请求；请求拥有独立 WorkRef 和稳定 owner，允许原 Run 继续／完成。不可逆外部
可见效果在 finalize 前被实际提供者阻止。领域原子保存产物/request 关联或沿
可核实交接保留责任，不能形成无主暂行产物。产物依赖是显式无环图，使用暂行
父项产生的后代也必须暂行或在正常门被拦截，不能以“读已成功”绕过关系登记。

**HD-12**：approve 先记录唯一决定，finalize 复核当前资格并只在所有暂行前置
已正式生效时生效；子项先获批准仍保持 staged_waiting_dependencies。reject
立即封闭该产物及其暂行后代新使用，按依赖逆序调用领域完整撤销，结果逐项记录；
撤销失败保留 revoke_failed 与隔离和重试责任，不标已完全撤销。后代已批准但
尚未正式生效不能越过父拒绝；不改写后代历史答案，后果记录 dependency_revoked。
并发 finalize/reject 由领域共同屏障排序；尚有未决依赖不得抢先 finalize。

回传策略必须在产生时声明为只改变产物、下次运行可感知、一次接续或显式补偿
流程；后果交付按原工作权限和去重运行。暂行决定呈现窗口只影响界面位置，
无超时默认决定。暂行路径在等待登记簿上没有特例：产生暂行产物的调用照常按
tools v2（legacy source: `../../tools/v2/contract.md`） 结算，其登记随该结算被裁决时注销；暂行
决定的后果作为独立到达，沿 session v2（legacy source: `../../session/v2/contract.md`） 的入站
裁决处置，不因暂行身份取得额外的等待位置。本版交付资格与治理协议；具体动作
目录及实际完整撤销证据由各领域逐项登记，未登记动作不得声称支持先做后批。

## 内建人类请求工具的执行

**HD-13**：本能力是 tools v2（legacy source: `../../tools/v2/contract.md`） 内建多命令工具 `human` 的
执行 owner，两条命令 `ask_user`（kind = question）与 `request_approval`
（kind = agent_approval）分别创建这两类请求；能力授权申请不是第三条命令，授予本身
走专属同意流程（PF-005.C3（legacy source: `../../../../docs/requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#已确认要求`））。
调用一侧的安排见 TL-17（legacy source: `../../tools/v2/contract.md`）；本条定义本能力在三个执行动作上的
提交义务：`start` 耐久创建请求并把继续位置绑定到该调用，请求创建与调用准入在同一提交，
请求记录该调用与 attempt，费用来源为零费用；`requestStop` 关闭请求，关闭与该调用结算
`cancelled_before_execution` 在同一提交；`answer` 在同一提交内记录 HD-02 的唯一决定、
把该调用结算为成功并受理其结算到达（来源 `call_settlement`，HD-08）。请求与调用是
同一次等待的两面（HD-03），本能力不因作为执行 owner 而持有第二份决定权威。

答复是该调用的返回值而不是新的用户输入，恰一次进入模型（两种形态见
TL-19（legacy source: `../../tools/v2/contract.md`））。答复内容按 HD-01 的合法作答者规则与 HD-02 的请求
Schema 校验：`ask_user` 的选项标签即答案值，自定义答案覆盖单选，批量问题按问题 id 回填，
不完整或含糊的答复明确拒绝而不转成决定；`request_approval` 的 approve／reject／comment
按 HD-02 结算（comment 保持 pending 且不占用首次决定），其效力见 HD-08。等人时间不计入
该调用的执行时长；等待期间实例可以退役，请求与调用都耐久，重建从同一 requestId 与原
调用位置继续（HD-04）。

## Legacy 当前版形成时的来源差异

来源以提案与裁决编号给出；正式契约正文不引用提案，各编号的正文与链接从本能力入口
`README.md` 与验证范围页 `verification.md` 找到。

| 条款 | 性质 | 来源裁决 |
|---|---|---|
| HD-02 | 兼容扩展：本能力拥有的三条耐久事实名 `hd.request.created / hd.decision.recorded / hd.request.closed` 及其载荷 | 规格评审 2026-09-15 指出 tools v2 与 message-stream v1 引用的 `hd.*` 事实没有拥有者 |
| HD-02 | 澄清：迟到／重复答复不再产生结算到达，也不重开已关闭的继续权 | 工具执行提案契约措辞缺口表 HD 行；同提案不变式 H-3 |
| HD-03 | 语义变化：请求不独立登记而附属于调用；`waiting_human` 不再是 Run 状态，收成等待登记簿的投影；占位块改用 CD v2 的 `deferred_receipt` 与其原因词表 | 工具执行提案第二轮作者裁决 8、9；用户裁决 U-59 |
| HD-04 | 语义变化：删去“独立问题保留原 Run、答复不驱动新 Run”，改为按等待登记簿与入站裁决路由；interrupt_then_run 使旧 Run 进终态 `superseded` 并整簿注销；Run 不可恢复失败保留已准入调用与未答请求；单次 `stopCall` 撤回问题 | 工具执行提案作者裁决 3、第二轮作者裁决 8；用户裁决 U-43 |
| HD-05 | 兼容扩展：增加只对 system_approval 有效的程序化作答者，含 actor／on-behalf-of、提交时重验与确认模式限制 | hooks 兼容提案决定 p 与用户裁决 U2；该提案“与已接受契约的关系”表 HD-05 行 |
| HD-07 | 澄清：reject 时该调用的等待登记随结算注销 | 工具执行提案 lifecycle.md 的等待登记簿 |
| HD-08 | 语义变化：question 与 agent_approval 的接续意图为 `call_settlement`；agent_approval 的答复不产生可被门消费的决定、不建立持久授权 | 用户裁决 U-44、U-47；工具执行提案契约措辞缺口表 SE-13 行 |
| HD-09 | 兼容扩展：登记 `requests` 快照贡献，按主体与 `asOf` 在同一水位裁剪 | 消息流提案 cordis.md 能力侧（第三轮复核 B-阻1 的处置） |
| HD-12 | 澄清：暂行调用在等待登记簿上没有特例，暂行后果沿入站裁决原行 | 工具执行提案第三轮作者裁决 17 |
| HD-13 | 新增：本能力作为内建 `human` 工具的执行 owner，`start`／`requestStop`／`answer` 的提交边界与答复的两种去向 | 工具执行提案作者裁决 w、x；用户裁决 U-41、U-44 |
