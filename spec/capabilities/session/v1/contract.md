# 会话、耐久输入与到达账本 v1

本契约身份为 `capability.session`，版本 1。它与 [capability.run v1](../../run/v1/contract.md)
一起取代 [session-run v2](../../session-run/v2/contract.md)：v2 中 Session 身份、生命周期、
历史、队列、复合打断的受理、会话级强停的 hold、状态贡献注册、恢复顺序与 Session
Inbound 归本契约；Run、Step、执行权、控制与恢复兼容证据归 run v1；占位、执行者与
级联归 [生命周期组合 LC v1](../../../compositions/session-run-agent-lifecycles/v1/contract.md)。
逐句归属表由 [D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 引用的提案记录；
条款正文除引用与占位相关句外不改动 v2 语义。

规范依赖：[共享数据 CD v1](../../../data/core-work/v1/contract.md)、
[共同准入 CC v2](../../../compositions/core-work-coordination/v2/contract.md)、
[耐久记录 DR v1](../../durable-records/v1/contract.md)、
[生命周期组合 LC v1](../../../compositions/session-run-agent-lifecycles/v1/contract.md)。
本版引用但不改写 [run v1](../../run/v1/contract.md)、[tools v1](../../tools/v1/contract.md)、
[human-decisions v1](../../human-decisions/v1/contract.md)、
[live-agent v1](../../live-agent/v1/contract.md)、
[budget-accounting v1](../../budget-accounting/v1/contract.md) 与
[command-input v1](../../command-input/v1/contract.md) 的条款；驱动器的推进规则由
[run-driver v2](../../run-driver/v2/contract.md) 消费本版定义。接受依据为
[决定 D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md)。

## 长期会话与历史

**SE-01**：Session 保存 SessionRef、不可变 tenant/owner/initiator、原 DefinitionRef
及选用版本、来源关系、生命周期、标题/手动标志、pin、模型选择、历史水位和
控制修订。create 只接受当前获准且可用定义，相同操作重试返回原 Session。
list 支持获准范围内按发起者类型、来源、状态、时间、定义和日程引用过滤；
分页与排序使用系统确认事实，发起者不是 owner 或授权主体的替身。

**SE-02**：生命周期 open → archived → open 或 open/archived → deleted；
deleted 不可恢复，身份不复用。rename/pin 条件更新；人工标题锁定后，迟到自动
标题只能作建议，不覆盖。archive/delete 在仍有非终态 Run 或未安全收口责任时
返回 busy 和有权披露的原因，不能隐式 cancel；用户先控制原工作。"仍有非终态 Run"
在同一门内读取 [run v1](../../run/v1/contract.md) 的当前状态（[LC-05](../../../compositions/session-run-agent-lifecycles/v1/contract.md)），
interrupted 也是非终态。成功归档封闭输入/激活并将未取批队列项结算为
closed_by_archive，删除为 closed_by_delete；accepted 与 classified 而未消费的 arrival
在同一提交 closed（[LC-04 行 1](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）。
恢复不重新入队，重新检查原定义和当前资格，不换成别的定义。归档可受权读历史；
逻辑删除只保留治理允许的墓碑/审计，不承诺物理擦除。

**SE-03**：历史保留原始已受理输入及编辑/取批/运行结果的事实关系，模型输入
视图只包含已取批的有效内容和明确历史切点，不读取当前队列全文。可变目录、
控制状态、模态集合和查询索引分别有 owner 与水位；投影缺失可重建，不制造
空历史、无模态或未占用的结论。摘要是引用原切点的新事实，不能覆盖原件。
历史审计能保留旧输入版本，普通模型上下文不得使用已撤回／未取批版本。

## 输入队列

**SE-04**：队列项具有 inputId、内容引用与 revision、受理序号、当前排序位置、
kind=text/command/trigger、状态 queued/held/taken/withdrawn/closed，保留原受理和修改
关系。closed 携带封闭原因词表 closed_by_archive/closed_by_delete/superseded/
cancelled_run/refused_capacity/refused_origin_cancelled。trigger 项由 Inbound 意图为
`queue` 的非用户来源 arrival（SE-13）生成，与用户输入同一队列、同一受理序，作为
分隔符一项一 Run；由 continuation 转换而来的 trigger 记录来源 arrival（SE-17）。
容量按已配置项目数/字节上限在受理时检查，满时拒绝并记录；禁止替换旧项腾空间。
附件必须在同一受理中取得有效引用占用；上传完成不意味着输入受理成功。

enqueue 的到达行为由本次选择/用户偏好求值得到 queue 或 interrupt_then_run，
实际值入账。queue 不修改在途请求；plain supplementary text 不充当 HITL
answer。读取设置失败时明确失败而不随机中断。接受成功须在内容、身份、队列
位置及整体意图耐久保存之后；重复操作查原结果，不创建额外消息。任何 kind 的
队列项在 queued/held 状态都可撤回（记 withdrawn_by_user），撤回只关闭这次投递，
来源事实仍在其权威处；taken 后不可撤回，只能对所属 Run 施加
[RN-03～05](../../run/v1/contract.md) 的控制。

**SE-05**：edit/reorder/withdraw 使用期望 itemRevision 和 queueRevision；
只对未取批项成立，多端冲突返回当前修订。编辑可替换文本块；媒体不可变，
需要增删附件时作为明确内容修订并更新引用，已取批内容不可编辑。调序给出
明确的有序成员集合／目标位置，不能以过期全列表覆盖新加入项；服务端在当前
队列下判定并返回统一结果。withdraw 不取消其他输入或 Run。

**SE-06**：takeBatch 在同一短裁决与耐久提交中固定队首连续合格 text 项的
身份、修订、内容和顺序，遇 command 或 trigger 停止；不存在活动驱动占位
（[LC-02](../../../compositions/session-run-agent-lifecycles/v1/contract.md) 的派生关系，在同一门内读
Run 状态）、队列非 hold、Session open、权限／定义／模型可用方可建立新 Run。队首
失权明确阻塞或结算拒绝，不悄悄跳过不合格成员；不得临时扩充已确认批次。
相同取批重试认回原 Run。消息边界原样保留，合批不把多条原文改写为摘要。
后到输入进入下一批。取项、Run 建立与 epoch 发行在同一提交
（[LC-04 行 3](../../../compositions/session-run-agent-lifecycles/v1/contract.md)），Run 侧记录归
[RN-01](../../run/v1/contract.md)。

队首 trigger 项由 `takeTrigger` 在同一门下领取：门为 SE-06 条件加上该 trigger 来源
的权威在取用时仍有效（连接器条件、日程到期须重查当前权限、依赖与资源）；不合格
的 trigger 项明确结算 closed 并记录，不悄悄跳过。一项一 Run。takeBatch/takeCommand/
takeTrigger 三者互斥，由本能力路径启动的 Run 恰有一个启动依据。三者及 Session 级
调度（SE-15）提交的 operationId 从 `(SessionRef, queueRevision, kind)` 确定地派生，
相同重试认回原 Run。

**SE-07**：有序 command 声明默认位置、让行规则及是否清除等待文本。命令
受理固定其清除目标集合，只包含当时仍等待的文本；重试不扩张。让行给后到
文本只能到声明的有限次数／截止序号，用户显式调序覆盖原自动位置，禁止
持续新输入导致无限饿死。command 不是任意脚本或跨项成功依赖。独立失败
结算且无未知效果后可继续下一项；unknown 和 hold 不可冒充可继续。
即时 interrupt/cancel/force_stop 不排到目标工作后面执行。

队首 command 由 `takeCommand` 在同一队列/Session 门下领取：核对确切定义、
参数修订、当前资格和期望 queueRevision，将该项 taken、分配唯一命令执行
身份和驱动占位，一起耐久提交。命令处理者只消费该身份，效果使用同一
operation 去重；成功/拒绝/失败/unknown 及后果关联耐久结算，确认安全后
释放占位再处理后续项。崩溃后查询原命令操作，不重建一次新执行。它与
text 取批互斥，不把命令文本交模型猜执行；异步效果沿 CC-05 保留责任。
命令 Run 的 basis、终态映射与控制语义归 [RN-06](../../run/v1/contract.md)。
本条只覆盖有序命令；[IN-01](../../command-input/v1/contract.md) 的上下文装载型
命令在受理时解析，其获准的 Skill/Prompt/上下文与后续正文一起成为同一 text 项，
随 takeBatch 进入模型输入，不走命令处理者。

"立即清除等待文本"是即时控制，在受理时固定并结算目标项，不等待轮到
队首；通过 slash/keyboard 进入时也相同。有序命令若声明在执行阶段清除，
只清除受理固定集合中届时仍未取批的项，已消费项明确 excluded_taken，
不追溯撤销执行。声明必须区分这两个时点，不能仅用含糊 clear 布尔值。
领取命令不免除其实际效果提交时的当前执行权检查；force_stop 已撤销原
epoch 时，迟到 clear 等命令不得继续修改队列，安全停止回执覆盖这条通道。

## 复合打断的受理与会话级强停

**SE-08**：interrupt_then_run 先耐久记录新 input、当时精确 Run 和复合意图，
再封闭旧驱动（[LC-04 行 11](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）。
新 input 可以是用户输入，也可以是系统按获准配置（PF-002.C9 条件触发）发起的
trigger 项；两者共用同一复合意图语义与恢复出口，系统发起的复合打断把发起依据和
配置版本记入意图。旧 Run 的处置与终态归 [RN-04](../../run/v1/contract.md)。
新输入和其他 queued 项仍按确认顺序由 takeBatch 处理，不获得优先通道。
旧 Run 自然结束则正常排队；已换成另一 Run 时不打断它，新输入仍已受理。
任何一项停止/交接未知时，复合意图显示 pending/unknown，不能确认完整成功，
原责任继续阻止新驱动。重试不再次中断后来的 Run，也不恢复新输入的旧版本。

**SE-09**：Session 范围的强停将队列置 hold，与控制受理在同一提交
（[LC-04 行 2](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）；仅用户显式
continueQueue 或撤回解除其对应状态，不因为清理完成自动启动下一 Run。单 Run
强停不隐含全会话 hold。继续队列只解除 hold，不越过 stopping 占位，也不恢复被
强停的 Run。Run 侧的 force_stop 语义归 [RN-05](../../run/v1/contract.md)。

## 状态贡献与恢复

**SE-10**：可替换状态贡献注册 stateKey、Schema/version、owner、kind=authoritative/
projection、初始化/升级及撤回政策。authoritative 值只能经所属操作条件更新；
projection 由确定性 fold、输入类型版本和 watermark 重建，不允许旁路写入。
同作用域同 key 冲突拒绝；缺少解析器或不支持数据版本时该能力 unavailable，
不返回默认空值。卸载撤回运行贡献，不删除需保留的耐久状态；重新装载先校验
当前权限和兼容性，不激活旧句柄。持久数据版本迁移须保留原件／显式依据。
Inbound（SE-12～18）是本能力的 authoritative 贡献之一：arrival 的意图与状态只经
裁决与消费操作条件更新；context 水位（SE-16）由 Inbound 拥有并按受理序推进。
驱动位置由 run-driver 以 projection 贡献注册到本注册面，由 [run v1](../../run/v1/contract.md)
持有的事实 fold 得到（[RN-07](../../run/v1/contract.md)）。

**SE-11**：恢复先校验日志前缀、schema/reducer 版本、定义/配置/组件和执行环境
能力，再从原合法位置重建。已删除 Session 与关闭的 HITL 不复活。恢复时 Session
级裁决先行：本能力提供者在启动时扫描其拥有的全部 Session（含无 Run、无
live-agent 的空闲 Session），把 accepted 而未 classified 的 arrival 在当前 Run 状态下
裁决完（SE-18），驱动器的重取或恢复只在此完成后进入
（[LC-08](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）。历史读面可在
前缀校验后带水位开放。Run 的恢复兼容证据、unknown 处理与 epoch 失效归
[RN-08](../../run/v1/contract.md)。

本版不承诺任意执行栈热迁移、任意 OS 间无转换恢复、工具外部效果自动回滚或
未受理离线草稿保存。实际支持环境由实现验收提供；语义允许未来独立部署，
所需精确身份、耐久意图、当前权限与失败协议不依赖进程内对象传输。

## Session Inbound：到达账本

**SE-12**：每个 Session 有一份耐久的到达账本（Inbound）与一个不依赖驱动器存在的
Session 级裁决者。任何要投递给该 Session 的东西先受理成一条 arrival 事实，再由
裁决者在一次短提交内、在裁决时刻观察到的 Run 状态下决定投递意图并耐久记录。
arrival 具有不复用的 arrivalId（裁决提交的 operationId 从它派生）、tenantId 与目标
SessionRef（无会话的系统工作用 WorkRef）、source、dedupKey、payloadRef、可选 refs
（被引用的 Run 等待位置：call/attempt、requestId、continuationId、gateRef，或 `run`）、
可选 originWork（日程到期引用的原工作）、observedRun（裁决时的 RunRef、epoch、
状态，只作溯源）、intent、state 与来源 policy（有界、去抖与合并参数，以及条件
触发/跨会话消息的投递偏好；调用结算无来源策略）。state 为 accepted → classified →
consumed | converted | closed | withdrawn_by_user；closed 附原因
cancelled_run/isolated/closed_by_archive/closed_by_delete/superseded/refused_capacity/
refused_origin_cancelled。consumed 由消费它的 Step、批准消费提交或 Run 在同一提交
写入；不设 delivered 之类的非权威中间态。跨会话消息的目标授权在受理时检查，
未获准不受理也不泄漏存在。`(source, dedupKey)` 相同的到达只有一条 arrival，重投、
重扫、重启收敛到同一逻辑到达并返回原项。

**SE-13**：意图只有四种：queue（进入 SE-04 队列，作为下一 Run 的启动依据）、
continuation（使当前非终态 Run 的某个等待位置或 Run 本身就绪）、context（不
启动、不唤醒，只在下一次装配时按水位可见）、control（[RN-03～05](../../run/v1/contract.md)
的操作，不是 arrival 项）。来源是封闭枚举：user_text、user_command（有序命令；keyboard
command 是 control）、call_settlement（任何工具调用的 TL-07 终态结算，含子代理/handoff
派发与定时派发在 WorkRef 下创建的派发调用；帧不是 arrival）、provisional_outcome
（HD-12 暂行决定按声明的回传，"仅改变产物"不生成，"触发补偿"进入独立 WorkRef）、
human_answer（HD-08 提交的人类决定；问答型承载答复，审批型只承载决定，获批调用
之后的结算另作 call_settlement）、gate_restored（预算额度或依赖恢复，仅在存在等待
该门的 Run 时由相应能力发出）、connector_passive、connector_condition、schedule_due
（带 originWork；纯通知不进 Inbound）、cross_session_message。每种人类请求只对应
一个来源，同一事实不会以两种来源重复受理。调用结算、人类答复、暂行回传与门
恢复只以已裁决的 arrival 被驱动器消费；驱动器直接读取工具/人类决定权威只用于
fold 非结算视图、收口与重连，不据此第二次呈现或解除同一位置。

**SE-14**：裁决按目标 Run 状态分列，判定对象是被 refs 引用的 Run；对
call_settlement 即发起该调用的 Run，不是当前恰好占位的 Run，WorkRef 下派发的调用
没有发起 Run。A = 被引用的 Run 非终态且尚在等待该位置；B = 被引用的 Run 非终态但
已不在该位置等待，或无引用而当前占位 Run 非终态；C = 被引用的 Run 为
completed/failed，或无引用且 Session 无 Run，或调用没有发起 Run；D1 = 被引用的
Run 为 cancelled（含 force_stopped）或 stopping 且 Session open；D2 = Session 已
archived/deleted。调用结算没有来源策略，子代理、handoff 与定时派发一律按此判定。决定表：

| 来源 | A | B | C | D1 | D2 |
|---|---|---|---|---|---|
| call_settlement | continuation | context（发起 Run 非终态但不在此位置等待） | queue（trigger：发起 Run 已终态或无发起 Run） | closed(cancelled_run)；发起 Run 为 stopping/force_stopped 则 closed(isolated) | closed(closed_by_archive/closed_by_delete) |
| provisional_outcome | 一次接续 → continuation；下次运行可感知 → context | 一次接续 → continuation（refs = run，下一次 Step 收束判定时就绪）；下次运行可感知 → context | 一次接续 → queue 并记 converted；下次运行可感知 → context | closed | closed |
| human_answer | continuation | 不可能；迟到答复按 HD-02 返回当前结果，不生成 | 同左 | 同左 | 同左 |
| gate_restored | continuation（Run 在 waiting_gate 且 gateRef 匹配） | 不生成 | 不生成 | 不生成 | 不生成 |
| connector_passive | context | context | context | context | 不受理 |
| connector_condition | 按 policy：queue 或系统发起 interrupt_then_run（control + queue） | 同左 | queue | queue | 不受理 |
| schedule_due | queue；判定依据为 originWork | 同左 | queue | originWork 被人取消或强停 → closed(refused_origin_cancelled)；否则 queue | 不受理 |
| cross_session_message | 按目标权限与配置：queue 或 context；绝不自动打断 | 同左 | queue | queue | 不受理 |
| user_text / user_command | queue；或 interrupt_then_run = control + queue | 同左 | queue | queue | 不受理 |

每个 arrival 恰被裁决一次；continuation 只指向裁决时非终态的 Run，且该 Run 仍在
等待被引用位置或引用为 run 级位置。context 意图永不创建 Run、永不唤醒等待中的
Run。裁决与目标 Run 的终态转移在同一协调域全序，由
[LC-04](../../../compositions/session-run-agent-lifecycles/v1/contract.md) 声明。

**SE-15**：队列消费与调度。takeBatch 固定队首连续合格 text 项为一批，遇 command
或 trigger 停止；takeCommand 对队首有序命令一项一 Run；takeTrigger 对队首 trigger
项一项一 Run；三者互斥。Session 级调度由本能力拥有，在无活动占位、队列非 hold
且队首项合格时启动下一 Run，不依赖某个驱动器实例存活；占位被已 Yield 的 Run
持有时，调度只能以新 epoch 重取该 Run。调度启动先查该 Session 是否已有 ready 的
live-agent 实例，有则直接交驱动，没有才经 live-agent 的激活与工作许可，然后把驱动
交给 run-driver；调度只响应已提交事实的广播与启动扫描，不轮询
（[LC-06](../../../compositions/session-run-agent-lifecycles/v1/contract.md)）。调度提交的
operationId 按 SE-06 派生，重取从 `(RunRef, 封闭的 epoch)` 派生（[RN-08](../../run/v1/contract.md)）。
keyboard command 是即时控制，不入队。

**SE-16**：context 意图的 arrival 按受理序号形成 Session 级序列，水位由 Inbound
拥有。开 Step 时读取当前水位并把水位值记入切点；同一 Session 的多个非终态 Run
共享序列，各自记录消费到的水位，该记录只作溯源。可见范围为
`(不再可见下界, 当前水位]`，撤回与保留期到期只推进下界，不改写已记录的切点；
装配按 payloadRef/callId 去重已进入历史的结果。context 只记指针与水位，"内容
可见、已交给模型、模型理解"分别记录。外部来源（user_text、user_command、
connector_passive、connector_condition、schedule_due、cross_session_message）的未消费
arrival 数量有界，满时拒绝并记 closed(refused_capacity)，不覆盖已受理项；去抖、
合并与错过政策在受理时执行。内部事实来源（call_settlement、provisional_outcome、
human_answer、gate_restored）不适用满时拒绝，其数量由各自权威的有界性承担。

**SE-17**：Run 结算时的接续处理。终态为 completed/failed 时，指向本 Run 的未消费
continuation 转为 queue 的 trigger 项并记 converted；终态为 cancelled（含
force_stopped）或因 Session 归档/删除级联关闭时，一律 closed 并记录，不复活。
这一处理与 Run 的终态转移在同一提交
（[LC-04 行 3](../../../compositions/session-run-agent-lifecycles/v1/contract.md)），Run 侧归
[RN-09](../../run/v1/contract.md)。Run 终态后不存在指向它的 classified 且未消费的
continuation。结算后到达者按 SE-14 的 C/D1/D2 列裁决。failed(context_overflow) 的 Run
留下的后台调用会逐个以 trigger 开新 Run，数量受其已准入调用数约束，是本版接受的代价。

**SE-18**：受理与裁决是两次提交。非预期退出可能留下 accepted 而未 classified 的
arrival；裁决者不依赖驱动器，提供者启动时扫描全部 Session 完成裁决（SE-11），
空闲 Session 不留下永不裁决的 arrival。驱动器只读 classified 的 arrival。`take*`
与重取在本 Session 存在未裁决 arrival 时不进入决策，等待裁决完成。

本版不承诺通知事件作用域过滤的实现、PF-004 三种派发关系的完整协议、
多进程部署下旧 epoch 持有者的活性判定；它们由后续设计补足，不影响本版语义。
