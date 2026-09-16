# 长期会话、输入队列与到达账本 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.session, 1)`，状态为 candidate、
`acceptance:null`。正文从 `omne-harness-lite-legacy-spec` 的 `capability.session@2`
当前版本重基，保留 SE-01～SE-20 的身份和仍有效语义；旧决定、旧接受、
执行日志和旧模型结果只作 provenance，不自动接受或验证本坐标。

本能力的责任是：Session 身份/所有权、历史与输入队列、到达裁决、状态贡献及会话级调度。 本轮采用 F/S/G 精确候选坐标；尚未迁移的
model-execution、media-content、message-stream 与 external-hooks 引用只表示后续接口需要，
不构成本候选 catalog 的当前依赖。后文出现的 legacy 路径和旧版本号用于恢复来源，
同名新谱系依赖均以本任务 candidate manifest 为准。

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
在同一门内读取 run v2（legacy source: `../../run/v2/contract.md`） 的当前状态
（LC-05（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）），interrupted 也是
非终态；被新输入越过的 Run 进入终态 `superseded`（RN-04（legacy source: `../../run/v2/contract.md`）），与
completed/failed/cancelled 同样不阻止归档，本能力不为它保留特殊规则。成功归档封闭
输入/激活并将未取批队列项结算为 closed_by_archive，删除为 closed_by_delete；accepted 与
classified 而未消费的 arrival 在同一提交 closed
（LC-04 行 1（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））。
恢复不重新入队，重新检查原定义和当前资格，不换成别的定义。归档可受权读历史；
逻辑删除只保留治理允许的墓碑/审计，不承诺物理擦除。

**SE-03**：历史保留原始已受理输入及编辑/取批/运行结果的事实关系，模型输入
视图只包含已取批的有效内容和明确历史切点，不读取当前队列全文。可变目录、
控制状态、模态集合和查询索引分别有 owner 与水位；投影缺失可重建，不制造
空历史、无模态或未占用的结论。摘要是引用原切点的新事实，不能覆盖原件。
历史审计能保留旧输入版本，普通模型上下文不得使用已撤回／未取批版本。

历史的读面形状是 `Message` 记录，它从本 Session 各耐久流的已提交事实**派生**，不是
另一条耐久流。每条 `Message` 的身份从产生它的事实的 `eventId`（DR-01（legacy source: `../../durable-records/v2/contract.md`））与 `ordinal` 确定地派生，
不另发号；位置为 `{domain, seq, index, ordinal}`——协调域的提交序号、该事实在其提交内的
耐久序（DR-01（legacy source: `../../durable-records/v2/contract.md`））、同一事实派生多条时按事实内顺序
编号的序数。历史顺序是 `(seq, index, ordinal)` 的字典序，跨重建稳定，同批两条事实各自
派生的消息因此有确定次序。记录含 `session`、`role: user | assistant | system`（供应方无关的
角色）、`origin`、`step`（进入模型的 Step；未取批的用户输入为 null）、有序 `content:
ContentBlock[]`、助手消息的 `settlement{status, missing[]}`、以及 `supersededBy`（被编辑、
撤回或压缩摘要取代时指向取代它的事实位置，原件保留）。`Origin`、内容块与块内字段的形状
归 CD-03（legacy source: `../../../data/core-work/v2/contract.md`）。

派生是纯函数、按位置单调折叠，规则如下；表外的事实不派生消息：

| 事实 | 派生的消息 | 规则 |
|---|---|---|
| `queue.item.enqueued / edited / withdrawn` | enqueued：一条 `step: null`、`role: user`、`origin: user_input` 的消息，`content` 为该 revision 的输入块；edited：新 revision 的新消息，旧消息 `supersededBy` 指向它；withdrawn：旧消息 `supersededBy` 指向撤回事实，无后继 | 受理即派生，从未取批就撤回的输入也有历史；模型请求投影不取未取批消息 |
| `queue.items.taken{items, run \| into}` | 每个 item 把已派生的用户消息的 `step` 指向消费它的 Step，`ordinal` 按 items 顺序 | 内容本体仍在队列项，消息只引用 |
| 模型 attempt 的结算事实（MC-06（legacy source: `../../model-execution/v2/contract.md`） 记录 `purpose`） | `purpose = reply`：`role: assistant`、`origin: model_attempt` 的消息，`settlement` 记状态与缺失块清单；其余 `purpose` 不派生助手消息 | `partial / cancelled` 也派生：保留全部完整且已耐久的块，未完成的进 `missing`，截断块保留前缀；`failed / unknown` 无内容不派生消息，状态与用量仍保留 |
| `tools.call.proposed`；`run.step.settled{outcome: invalid_proposal{reasons}}`（RD-08（legacy source: `../../run-driver/v3/contract.md`）） | 前者确定该 attempt 助手消息中通过校验的 `tool_call` 块（带调用与动作）；后者把该 attempt 结算记录里被拒的原始片段确定为 `rejected{reason}` 并保留 `raw` | 助手消息的 `tool_call` 块只来自这两条事实，不来自流式参数片段 |
| `tools.call.settled{call, attempt, result}` | 一条 `role: user`、`origin: tool_settlement`、`content: [tool_result]` 的消息，位置为结算提交 | 与该调用是否已占位、Run 是否还会开 Step 无关；归档后到达的结算同样派生 |
| `run.step.opened{cutpoint}` 且切点含 `deferred_receipt` 或 `system_reminder` | `role: user`、`origin: system` 的占位消息；引用类 `system_reminder{late_result \| human_answer}` 的内容是对已派生结果消息的引用，不复制正文；正文类 `system_reminder{hook_context \| system_notice}` 按块原样派生 | 一个调用的最终结果在历史里恰出现一次（结果消息）；同一 Step 输入里多条 reminder 排在新用户文本之前 |
| `hd.decision.recorded` | 不单独派生消息 | 问答与 Agent 发起批准的答复经 `human` 调用的 `tools.call.settled` 成为 `tool_result`（HD-08（legacy source: `../../human-decisions/v2/contract.md`））；审批型决定是系统门事实，不进模型 |
| 压缩摘要（MC-10（legacy source: `../../model-execution/v2/contract.md`）） | 一条 `role: user`、`origin: system` 的摘要消息，被摘要的消息 `supersededBy` 指向它 | 原历史保持，模型视图从摘要起 |

读面 `history(session, range, asOf?)` 返回该范围内的派生 `Message` 与其水位：`asOf` 省略
时取当前完整覆盖水位（SE-10），给定时只返回位置不超过 `asOf` 的派生结果，使一次全量重取
的各视图落在同一水位。每次读取按当时的读权裁剪正文（SE-20）；无读权与不存在返回同一
结果，不泄漏存在。派生缓存按 SE-10 携带 stateKey、reducer 版本与水位，越界即重建。

## 输入队列

**SE-04**：队列项具有 inputId、内容引用与 revision、受理序号、当前排序位置、
kind=text/command/trigger、状态 queued/held/taken/withdrawn/closed，保留原受理和修改
关系。closed 携带封闭原因词表 closed_by_archive/closed_by_delete/superseded/
cancelled_run/refused_capacity/refused_origin_cancelled/closed_by_guard/source_invalid：
`closed_by_guard` 是受理之后、取用之前由获准守卫关闭该项（SE-06 末段）；`source_invalid`
只用于 trigger 项在 `takeTrigger` 重查来源权威失败时的结算（SE-06）。trigger 项由 Inbound
意图为 `queue` 的非用户来源 arrival（SE-13）生成，与用户输入同一队列、同一受理序，作为
分隔符一项一 Run；由 continuation 转换而来的 trigger 记录来源 arrival（SE-17）。
容量按已配置项目数/字节上限在受理时检查，满时拒绝并记录；禁止替换旧项腾空间。
附件必须在同一受理中取得有效引用占用；上传完成不意味着输入受理成功。

enqueue 的到达行为由本次选择/用户偏好求值得到 queue 或 interrupt_then_run，
实际值入账。`queue` 的含义是耐久等待到当前 Run 的下一个空闲点或下一个 Run：队首连续
合格 text 项既可由 takeBatch 建立新 Run，也可在当前 Run 处于 `waiting` 的空闲点被取入该
Run（SE-06），两者都不修改在途请求；plain supplementary text 不充当 HITL
answer。读取设置失败时明确失败而不随机中断。接受成功须在内容、身份、队列
位置及整体意图耐久保存之后；重复操作查原结果，不创建额外消息。任何 kind 的
队列项在 queued/held 状态都可撤回（记 withdrawn_by_user），撤回只关闭这次投递，
来源事实仍在其权威处；taken 后不可撤回，只能对所属 Run 施加
RN-03～05（legacy source: `../../run/v2/contract.md`） 的控制。

**SE-05**：edit/reorder/withdraw 使用期望 itemRevision 和 queueRevision；
只对未取批项成立，多端冲突返回当前修订。编辑可替换文本块；媒体不可变，
需要增删附件时作为明确内容修订并更新引用，已取批内容不可编辑。调序给出
明确的有序成员集合／目标位置，不能以过期全列表覆盖新加入项；服务端在当前
队列下判定并返回统一结果。withdraw 不取消其他输入或 Run。

**SE-06**：takeBatch 在同一短裁决与耐久提交中固定队首连续合格 text 项的
身份、修订、内容和顺序，遇 command 或 trigger 停止；不存在活动驱动占位
（LC-02（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`） 的派生关系，在同一门内读
Run 状态）、队列非 hold、Session open、权限／定义／模型可用方可建立新 Run。队首
失权明确阻塞或结算拒绝，不悄悄跳过不合格成员；不得临时扩充已确认批次。
相同取批重试认回原 Run。消息边界原样保留，合批不把多条原文改写为摘要。
后到输入进入下一批。取项、Run 建立与 epoch 发行在同一提交
（LC-04 行 3（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）），Run 侧记录归
RN-01（legacy source: `../../run/v2/contract.md`）。

takeBatch 还有取入既有 Run 的形态：在同一提交内固定该批并记 `queue.items.taken{into: run}`
与该 Run 的下一个 `run.step.opened{cutpoint}`，不创建 Run、不发行新 epoch、不改变占位。
门是该 Run 处于 `waiting`（Step 已收束且等待登记簿非空，RN-01（legacy source: `../../run/v2/contract.md`））的
空闲点，且它正在等的门不是开这个 Step 的前提；是否处在空闲点由当时持有该 Run 驱动的
驱动器按 RD-10（legacy source: `../../run-driver/v3/contract.md`） 判定，Session 级调度不越过它（SE-15）。
合批规则与上一段相同；队首是 command 或 trigger 时不取入既有 Run，仍等 Run 终态后按
SE-15 一项一 Run。该 Run 的 basis 仍是首批，取入的批在 Run 上记为 `supplement`
（RN-01（legacy source: `../../run/v2/contract.md`）），恢复按 Step 切点重建（RN-08（legacy source: `../../run/v2/contract.md`））；
切点内容与在途调用的占位形态归 run-driver v3（legacy source: `../../run-driver/v3/contract.md`） 与
CD-03（legacy source: `../../../data/core-work/v2/contract.md`）。

队首 trigger 项由 `takeTrigger` 在同一门下领取：门为本条第一段的条件加上该 trigger 来源
的权威在取用时仍有效（连接器条件、日程到期须重查当前权限、依赖与资源；`hook_continuation`
须重查 hook 资产仍启用、装配者成员关系仍有效、Session open，见
external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`））；不合格的 trigger 项明确结算
`closed(source_invalid)` 并记录，不悄悄跳过。一项一 Run。takeBatch/takeCommand/
takeTrigger 三者互斥，由本能力路径启动的 Run 恰有一个启动依据。三者及 Session 级
调度（SE-15）提交的 operationId 从 `(SessionRef, queueRevision, kind)` 确定地派生，
取入既有 Run 的取批其 kind 与建立新 Run 的取批不同；相同重试认回原 Run 或原 Step。

取用者可在取批的短提交之外的准备阶段对队首候选项逐项求值获准的受理后守卫。守卫只能
关闭项，不能改写已耐久的输入，也不能改变受理本身（SE-12 的受理立即成立）：关闭在同一
take 门内与该项来源 arrival 的关闭一起提交（`closed_by_guard`，SE-04、SE-12），随后继续
判定下一队首；求值超时、失败或输出不合法按放行处理，不阻断取用。守卫的登记、权力上界
与运行记录归 external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`） 与
RD-17（legacy source: `../../run-driver/v3/contract.md`），本条只固定关闭的提交边界与词表。

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
命令 Run 的 basis、终态映射与控制语义归 RN-06（legacy source: `../../run/v2/contract.md`）。
本条只覆盖有序命令；IN-01（legacy source: `../../command-input/v1/contract.md`） 的上下文装载型
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
再封闭旧驱动（LC-04 行 8（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））。
新 input 可以是用户输入，也可以是系统按获准配置（
PF-002.C9（legacy source: `../../../../docs/requirements/product/environment/PF-002-external-change-response.md#已确认要求`）
条件触发）发起的 trigger 项；两者共用同一复合意图语义与恢复出口，系统发起的复合打断把
发起依据和配置版本记入意图。旧 Run 的处置与终态归 RN-04（legacy source: `../../run/v2/contract.md`）：它进入
终态 `superseded`，等待登记簿在同一提交整簿注销（SE-17）。新输入和其他 queued 项仍按确认
顺序由 takeBatch 处理，不获得优先通道。旧 Run 自然结束则正常排队；已换成另一 Run 时不
打断它，新输入仍已受理。任何一项停止或交接未知时，复合意图显示 pending/unknown，不能
确认完整成功（
PF-013.C6（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求`））：
控制结果按 `complete | partial{unknown: K}` 区分（RN-05（legacy source: `../../run/v2/contract.md`）），未证实
隔离的调用长期可见；未知不阻止新 Run 开始。重试不再次中断后来的 Run，也不恢复新输入的
旧版本。

旧 Run 的终态提交（LC-04 行 4（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））
在同一提交内受理一条 `system` 来源的 arrival（SE-13），承载被保留的
工作清单：已转后台与保持后台的调用、停止未确认的调用、未答的人类请求，以及在该提交
里由 Run 取消的未启动调用，各带引用。它按 SE-14 裁决为 context，由本 Session 下一个有
模型 Step 的 Run 在切点消费恰一次；没有活动 Run 时它只等待、不触发 Run，命令 Run 没有
模型 Step、不消费它（RN-06（legacy source: `../../run/v2/contract.md`）），它继续等下一个有模型 Step 的
Run。清单进入模型的形态归
RD-06（legacy source: `../../run-driver/v3/contract.md`） 与 CD-03（legacy source: `../../../data/core-work/v2/contract.md`）；清单里的
调用与请求各自的结果与答复此后仍按 SE-14 单独到达。

到达行为为 interrupt_then_run 的队列项在受理的准备阶段先经受理后守卫求值（SE-06 末段）：
守卫关闭它时，该项在受理后立即以 `closed_by_guard` 关闭且不发出中断，旧 Run 继续。

**SE-09**：Session 范围的强停将队列置 hold，与控制受理在同一提交
（LC-04 行 2（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））；仅用户显式
continueQueue 或撤回解除其对应状态，不因为清理完成自动启动下一 Run。单 Run
强停不隐含全会话 hold。继续队列只解除 hold，不越过 stopping 占位，也不恢复被
强停的 Run。Run 侧的 force_stop 语义归 RN-05（legacy source: `../../run/v2/contract.md`）。

## 状态贡献与恢复

**SE-10**：可替换状态贡献注册 stateKey、Schema/version、owner、kind=authoritative/
projection、初始化/升级及撤回政策。authoritative 值只能经所属操作条件更新；
projection 由确定性 fold、输入类型版本和 watermark 重建，不允许旁路写入。
同作用域同 key 冲突拒绝；缺少解析器或不支持数据版本时该能力 unavailable，
不返回默认空值。卸载撤回运行贡献，不删除需保留的耐久状态；重新装载先校验
当前权限和兼容性，不激活旧句柄。持久数据版本迁移须保留原件／显式依据。
Inbound（SE-12～18）是本能力的 authoritative 贡献之一：arrival 的意图与状态只经
裁决与消费操作条件更新；context 水位（SE-16）由 Inbound 拥有并按受理序推进。
驱动位置由 run-driver 以 projection 贡献注册到本注册面，由 run v2（legacy source: `../../run/v2/contract.md`）
持有的事实 fold 得到（RN-07（legacy source: `../../run/v2/contract.md`））。

本注册面上的投影须给出三个读面，并在同一 fold 水位上回答：`changes(session, after, to) →
{batches, completeTo}` 返回本 Session 作用域内序号在 `(after, min(to, completeTo)]` 的已提交
事实，按提交分组、组内按耐久序；`snapshot(session, principal) → {asOf, history, queue,
requests, calls, visibility}` 是全量重取的**单一**读面，全部派生视图取自同一 fold 水位
`asOf`；`floor(session)` 给出可服务下界。完整覆盖水位 `completeTo` 的含义是投影已把序号
不超过它的全部提交折叠进去；确定性 fold 本身不提供这个保证，必须显式给出，`asOf` 不得
越过它。`snapshot` 的 `requests` 与 `calls` 不是投影自有的规则：
HD-09（legacy source: `../../human-decisions/v2/contract.md`） 与 tools v2（legacy source: `../../tools/v2/contract.md`） 各按本条把
它们注册为贡献并在贡献里带自己的可见范围裁剪（待答请求按获准范围，活动调用按工具结果
正文读权），投影只在同一水位调用它们——授权语义仍只有各能力一份权威，时刻只有 `asOf`
一个。同理，`hook_continuation` 的续跑计数（同一 Session
连续由该来源触发的 Run 数）是本注册面上的 projection 贡献，由对 Run 启动事实的确定性
fold 得到，归档不清零、恢复后由 fold 重建（external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`））。

**SE-11**：恢复门按以下硬顺序执行，任何一步失败都保持 fail closed：
(1) 同步并校验 Session、queue、inbound、Run 及其依赖权威的完整已提交前缀，撕裂尾部截回、
未回执批次用 operation lookup 定位，schema/reducer/定义/配置不兼容则停止；(2) 从同一已确认
水位 fold 出裁决所需的 Session、Run、等待登记和终态视图；(3) 扫描本提供者拥有的全部
Session（含无 Run、无 live-agent 的空闲 Session），把 accepted 而未 classified 的 arrival
按该视图裁决完（SE-18）；(4) 才允许发行新 epoch、取得工作许可或让驱动器进入 decide。

这条门既约束崩溃恢复，也约束 Yield 后重取和显式 resume；先发行 epoch 再补扫不合法。
已删除 Session 与关闭的 HITL 不复活。历史读面可在完整前缀校验后带水位开放；Run 的
兼容证据、unknown 处理与 epoch 失效归 RN-08。

本版不承诺任意执行栈热迁移、任意 OS 间无转换恢复、工具外部效果自动回滚或
未受理离线草稿保存。实际支持环境由实现验收提供；语义允许未来独立部署，
所需精确身份、耐久意图、当前权限与失败协议不依赖进程内对象传输。

## Session Inbound：到达账本

**SE-12**：每个 Session 有一份耐久的到达账本（Inbound）与一个不依赖驱动器存在的
Session 级裁决者。任何要投递给该 Session 的东西先受理成一条 arrival 事实，再由
裁决者在一次短提交内、在裁决时刻观察到的 Run 状态与等待登记簿上决定投递意图并耐久
记录。arrival 具有不复用的 arrivalId（裁决提交的 operationId 从它派生）、tenantId 与目标
SessionRef（无会话的系统工作用 WorkRef）、source、dedupKey、payloadRef、可选 refs
（被引用的等待位置：call/attempt、requestId、continuationId、gateRef，或 `run`；裁决时由
refs 定位其 holder 与发起 Run，人类请求的 holder 是它附属的调用，
见 RN-01（legacy source: `../../run/v2/contract.md`） 与 HD-03（legacy source: `../../human-decisions/v2/contract.md`））、
可选 originWork（日程到期引用的原工作）、observedRun（裁决时的 RunRef、epoch、
状态，只作溯源）、intent、state 与来源 policy（有界、去抖与合并参数，以及条件
触发/跨会话消息的投递偏好；内部来源没有来源策略）。state 为 accepted → classified →
consumed | converted | closed | withdrawn_by_user；closed 附原因
cancelled_run/isolated/closed_by_archive/closed_by_delete/superseded/refused_capacity/
refused_origin_cancelled/closed_by_guard（受理后守卫关闭其队列项时同批关闭，SE-06）。
consumed 由消费它的 Step、批准消费提交或 Run 在同一提交
写入；不设 delivered 之类的非权威中间态。跨会话消息的目标授权在受理时检查，
未获准不受理也不泄漏存在。`(source, dedupKey)` 相同的到达只有一条 arrival，重投、
重扫、重启收敛到同一逻辑到达并返回原项。

**SE-13**：意图只有四种：queue（进入 SE-04 队列，作为下一 Run 的启动依据）、
continuation（使当前非终态 Run 的某个等待位置或 Run 本身就绪）、context（不
启动、不唤醒，只在下一次装配时按水位可见）、control（RN-03～05（legacy source: `../../run/v2/contract.md`）
的操作，不是 arrival 项）。来源是封闭枚举：

| 来源 | 内容与登记 |
|---|---|
| `user_text`、`user_command` | 用户文本与有序动作；keyboard control 直接走 control，不生成 arrival；keyboard 绑定的 command / Skill / named flow 作为 `user_command` 明确入队，固定目标定义、参数与设置 revision；directory 只读取获准目录，选择后才形成动作 |
| `call_settlement` | 任何工具调用的 TL-07（legacy source: `../../tools/v2/contract.md`） 终态结算，含子代理/handoff 派发与定时派发在 WorkRef 下创建的派发调用，也含内建 `human` 调用的答复结算（HD-08（legacy source: `../../human-decisions/v2/contract.md`））；dedupKey 为 `(call, attempt)`；帧不是 arrival |
| `provisional_outcome` | HD-12（legacy source: `../../human-decisions/v2/contract.md`） 暂行决定按声明的回传，"仅改变产物"不生成，"触发补偿"进入独立 WorkRef |
| `human_answer` | 只承载系统发起的审批型决定（HD-08（legacy source: `../../human-decisions/v2/contract.md`））；问答型与 Agent 发起批准的答复由 HD 作为 `human` 调用的执行 owner 在同一提交结算该调用，经 `call_settlement` 承载 |
| `gate_restored` | 预算额度或依赖恢复，仅在存在等待该门的 Run 时由相应能力发出 |
| `connector_passive`、`connector_condition` | 连接器被动供给与条件触发 |
| `schedule_due` | 日程到期，带 originWork；纯通知不进 Inbound |
| `cross_session_message` | 跨会话消息，目标授权在受理时检查 |
| `system` | 内部来源：Run 被新输入越过（终态 `superseded`）时由其收口提交受理的被保留工作清单（SE-08）。它不引用等待位置（无 refs），意图恒为 context，dedupKey 为被越过的 RunRef，无来源策略；容量归内部来源类别，保留期与其它 context 相同（SE-16） |
| `hook_continuation` | 内部来源：外部 hooks 兼容层在 Run 完成后的续跑（external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`））。意图恒为 queue，dedupKey 为 `(RunRef, handler)`，无来源策略，不受 SE-16 的容量拒绝；有界性由续跑刹车与该去重键给出 |

每种人类请求只对应一个来源，同一事实不会以两种来源重复受理。调用结算、人类答复、
暂行回传与门恢复只以已裁决的 arrival 被驱动器消费，但四者释放的责任不同：调用结算
释放 call 登记，门恢复释放 gate 登记；系统审批答复只形成 approval readiness，暂行回传只
形成 provisional readiness，二者都不释放承载调用的登记。驱动器直接读取工具/人类决定权威
只用于 fold 非结算视图、收口与重连，不据此第二次呈现或解除同一位置。

**SE-14**：裁决按被 refs 引用的**发起 Run** 的状态与其等待登记簿分列：判定对象是提议该
调用、进入该门或持有该请求所附属调用的 Run，不是当前恰好占位的 Run；对 call_settlement
即发起该调用的 Run，WorkRef 下派发的调用没有发起 Run。判定顺序固定：Session 非 open →
D2；否则发起 Run 为 cancelled（含 force_stopped）或 stopping → D1；否则 holder 在其发起
Run（running / waiting / interrupted）上有开放登记（RN-01（legacy source: `../../run/v2/contract.md`） 的等待
登记簿）→ A；否则发起 Run 为 running / waiting / interrupted，或 Session 另有活动 Run → B；
否则 → C（此时发起 Run 为 completed / failed / superseded 或不存在，且 Session 没有活动 Run）。
`hook_continuation` 与 `connector_condition` 不走这一顺序，按各自行的固定意图受理。A 列是一次查表，不再从调用视图、请求集合与门集合各自推导。A 列仍按来源区分原子后果：
`call_settlement` 的 continuation 与 call 登记的 `released{settled}` 同批；`gate_restored` 与 gate
登记的 `released{passed}` 同批；`human_answer` 只写 `continuation{readiness: approval}`，不注销
call 登记，批准被消费并 start 后该登记继续开放到真实 call settlement；`provisional_outcome`
同样不释放其承载调用。调用结算没有来源
策略，子代理、handoff 与定时派发一律按此判定。决定表：

| 来源 | A | B | C | D1 | D2 |
|---|---|---|---|---|---|
| call_settlement | continuation（`readiness: settlement`；同批释放 call 登记） | context（无开放登记而发起 Run 或 Session 仍活动） | queue（trigger：发起 Run 已终态或无发起 Run） | closed(cancelled_run)；发起 Run 为 stopping/force_stopped 则 closed(isolated) | closed(closed_by_archive/closed_by_delete) |
| provisional_outcome | 一次接续 → continuation；下次运行可感知 → context | 一次接续 → continuation（refs = run，下一次 Step 收束判定时就绪）；下次运行可感知 → context | 一次接续 → queue 并记 converted；下次运行可感知 → context | closed | closed |
| human_answer | continuation（`readiness: approval`，不释放 call 登记） | 不可能；迟到答复按 HD-02（legacy source: `../../human-decisions/v2/contract.md`） 返回当前结果，不生成 | 同左 | 同左 | 同左 |
| gate_restored | continuation（`readiness: gate`；gateRef 匹配并同批释放 gate 登记） | 不生成 | 不生成 | 不生成 | 不生成 |
| connector_passive | context | context | context | context | 不受理 |
| connector_condition | 按 policy：queue 或系统发起 interrupt_then_run（control + queue） | 同左 | queue | queue | 不受理 |
| schedule_due | queue；判定依据为 originWork | 同左 | queue | originWork 被人取消或强停 → closed(refused_origin_cancelled)；否则 queue | 不受理 |
| cross_session_message | 按目标权限与配置：queue 或 context；绝不自动打断 | 同左 | queue | queue | 不受理 |
| user_text / user_command | queue；或 interrupt_then_run = control + queue | 同左 | queue | queue | 不受理 |
| system | 不适用（无 refs，不引用等待位置） | context | context（无活动 Run 时只等待，不转 queue、不触发 Run） | 不适用 | closed(closed_by_archive/closed_by_delete) |
| hook_continuation | 不生成（续跑只在 Run 已 completed 后受理） | queue（意图恒为 queue，不因 Session 另有活动 Run 改判） | queue（trigger 项，一项一 Run；判定依据为 originWork，即触发它的已完成 Run） | 不生成（cancelled / stopping / superseded 不触发续跑） | closed(closed_by_archive/closed_by_delete) |

每个 arrival 恰被裁决一次；其后它的意图只由 SE-17 的 Run 终态处理改写，不存在第二次
裁决。continuation 只在 A 列判出，因此只指向裁决时非终态、且该 holder 仍在其登记簿上的
Run；发起 Run 处于 interrupted 时 continuation 保留到 resume 消费。context 意图永不创建
Run、永不唤醒等待中的 Run；`system` 来源的清单在无活动 Run 时只等待，由下一个有模型
Step 的 Run 消费。裁决与目标 Run 的终态转移在同一协调域全序，由
LC-04（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`） 声明。

**SE-15**：队列消费与调度。takeBatch 固定队首连续合格 text 项为一批，遇 command
或 trigger 停止；takeCommand 对队首有序命令一项一 Run；takeTrigger 对队首 trigger
项一项一 Run；三者互斥。Session 级调度由本能力拥有，在无活动占位、队列非 hold
且队首项合格时启动下一 Run，不依赖某个驱动器实例存活；占位被已 Yield 的 Run
持有时，调度只能以新 epoch 重取该 Run。占位仍由一个非终态 Run 持有时，Session 级调度
不启动新 Run：队首合格 text 项改由持有该 Run 驱动的驱动器在该 Run `waiting` 的空闲点按
SE-06 取入（`queue.items.taken{into: run}`），两条路径由占位区分、互斥，队首是 command 或
trigger 时只走前者且等 Run 终态。调度启动先查该 Session 是否已有 ready 的
live-agent 实例，有则直接交驱动，没有才经 live-agent 的激活与工作许可，然后把驱动
交给 run-driver；调度只响应已提交事实的广播与启动扫描，不轮询
（LC-06（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））。调度提交的
operationId 按 SE-06 派生，重取从 `(RunRef, 封闭的 epoch)` 派生（RN-08（legacy source: `../../run/v2/contract.md`））。
keyboard control 是即时控制，不入队；keyboard 绑定的 command / Skill / named flow 是有序动作，按 SE-07 进入队列；directory 读取本身不建 Run。

**SE-16**：context 意图的 arrival 按受理序号形成 Session 级序列，水位由 Inbound
拥有。开 Step 时读取当前水位并把水位值记入切点；同一 Session 的多个非终态 Run
共享序列，各自记录消费到的水位，该记录只作溯源。可见范围为
`(不再可见下界, 当前水位]`，撤回与保留期到期只推进下界，不改写已记录的切点；
装配按 payloadRef/callId 去重已进入历史的结果。context 只记指针与水位，"内容
可见、已交给模型、模型理解"分别记录。外部来源（user_text、user_command、
connector_passive、connector_condition、schedule_due、cross_session_message）的未消费
arrival 数量有界，满时拒绝并记 closed(refused_capacity)，不覆盖已受理项；去抖、
合并与错过政策在受理时执行。内部事实来源（call_settlement、provisional_outcome、
human_answer、gate_restored、system）不适用满时拒绝，其数量由各自权威的有界性承担：
`system` 的清单按内部来源计数，保留期与其它 context 相同，因下界推进而不再可见是可接受
的——它列出的调用与请求各自仍以迟到结果或人类答复进入（SE-08）。意图为 queue 的
`hook_continuation` 同样不受本条的容量拒绝，其有界性由续跑刹车与去重键
`(RunRef, handler)` 给出（external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`））。

**SE-17**：Run 结算时的接续处理。终态为 completed/failed 时，指向本 Run 的未消费
continuation 转为 queue 的 trigger 项并记 converted；终态为 `superseded`（被新输入越过，
RN-04（legacy source: `../../run/v2/contract.md`））时，等待登记簿在同一提交整簿注销，未消费的 continuation
改判为 context——不转 trigger、不关闭，由此后开模型 Step 的 Run 在水位内看到（SE-16）；
终态为 cancelled（含 force_stopped）或因 Session 归档/删除级联关闭时，一律 closed 并记录，
不复活。这一处理与 Run 的终态转移在同一提交
（LC-04 行 4（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）），Run 侧归
RN-09（legacy source: `../../run/v2/contract.md`）。Run 终态后不存在指向它的 classified 且未消费的
continuation。结算后到达者按 SE-14 的判定顺序裁决：holder 已无开放登记，发起 Run 终态
则按 Session 是否另有活动 Run 落 B 列或 C 列、被停则按 D1 列、Session 非 open 则按 D2 列。failed(context_overflow) 的 Run
留下的后台调用会逐个以 trigger 开新 Run，数量受其已准入调用数约束，是本版接受的代价。

**SE-18**：受理与裁决是两次提交。非预期退出可能留下 accepted 而未 classified 的
arrival；裁决者不依赖驱动器，提供者启动时扫描全部 Session 完成裁决（SE-11），
空闲 Session 不留下永不裁决的 arrival。驱动器只读 classified 的 arrival。`take*`
与重取在本 Session 存在未裁决 arrival 时不进入决策，等待裁决完成。

## Session 的流与读面

**SE-19**：`frames(S)` 是本能力登记的 Session 第四条耐久流，与 session、queue、inbound
三条流同一协调域、同一水位语义（CC-01（legacy source: `../../../compositions/core-work-coordination/v2/contract.md`））。
写入者只有工具执行 owner 经 tools v2（legacy source: `../../tools/v2/contract.md`）：帧缺省耐久，与同一
Session 的日志一起 append-only 追加并按 `(frames(S), seq)` 回放；只有显式声明为 transient
的帧种类不进本流。帧身份、记录等级、缺口词表与读面归 TL-12（legacy source: `../../tools/v2/contract.md`）；
本条只登记归属与位置语义：同一 Session 的帧与消息在同一协调域内按提交顺序可对齐，帧
的保留期随本 Session 的数据治理，不单独裁剪；归档后可受权读取，删除按 SE-02 的治理规则
处理。帧不派生 `Message`（SE-03），客户端按位置读取
（message-stream v1（legacy source: `../../message-stream/v1/contract.md`））。

**SE-20**：本 Session 的读权分两级：`read_metadata`（身份、生命周期、标题等元数据）与
`read_content`（历史正文、队列内容、结果与帧正文）；历史读面、快照与出站订阅按其中相应
一级在每次披露时核对，无读权与不存在返回同一结果。同租户管理员没有默认读权；
`session.emergency_control`（RN-03（legacy source: `../../run/v2/contract.md`））是独立的、可撤销的控制权限，
不扩大为读权（
PF-013.C10（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求`））。
读面 `visibilityVersion(session, subject)` 给出该主体对本 Session 内对象可见范围的版本号，
聚合租户成员资格（TG-01（legacy source: `../../tenant-governance/v1/contract.md`））、对该 Session 的授予与人类
请求的可见范围（HD-09（legacy source: `../../human-decisions/v2/contract.md`））；任何影响该主体对本 Session
内对象读权的授予或撤销都使它变化。版本本身不携带授权，读权仍由各权威在披露时核对。它的
消费者是客户端游标与全量重取（message-stream v1（legacy source: `../../message-stream/v1/contract.md`））：版本
不符即旧游标作废、须全量重取；本能力不逐帧回填被跳过的内容，也不因授权变化改写任何已
提交事实。

本版不承诺 PF-004 三种派发关系的完整协议、多进程部署下旧 epoch 持有者的活性判定，
以及跨协调域的一致读取切点（归
LC-09（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`） 的义务清单）；出站帧
信封、游标编码与投递归 message-stream v1（legacy source: `../../message-stream/v1/contract.md`）。

## Legacy 当前版形成时的来源差异

| 条款 | 性质 | 变更 | 来源裁决 |
|---|---|---|---|
| SE-01 | 无变化 | 原文保留 | — |
| SE-02 | 澄清 | 归档前提明确 `superseded` 与其它终态同样不阻止归档，不再需要被越过 Run 的特殊规则 | 工具执行提案作者裁决 3 |
| SE-03 | 兼容扩展 | 明确历史读面的派生 `Message` 表：`(eventId, ordinal)` 身份、`{domain, seq, index, ordinal}` 位置、未取批输入的派生、attempt 按 `purpose` 分流、`tool_call` 与结算消息的来源、`supersededBy`；新增读面 `history(session, range, asOf?)` | 消息流提案作者裁决 R4/R5/R12、R11/R13、R18 |
| SE-04 | 兼容扩展 | closed 词表加 `closed_by_guard` 与 `source_invalid`；`queue` 到达行为的含义明确为"当前 Run 的下一个空闲点或下一个 Run" | hooks 兼容提案 U5、工具执行提案作者裁决 7 |
| SE-05 | 无变化 | 原文保留 | — |
| SE-06 | 语义变化 | takeBatch 增加取入既有 Run 的形态（`queue.items.taken{into: run}` 与 `run.step.opened` 同提交，只在 Run `waiting` 的空闲点、由驱动器判定，记 `supplement`）；takeTrigger 增加 `hook_continuation` 的来源权威重查与 `closed(source_invalid)`；末段固定受理后守卫关闭项的提交边界 | 工具执行提案作者裁决 7、hooks 兼容提案裁决 q/U5 |
| SE-07 | 无变化 | 原文保留（引用升为 run v2 / command-input v1） | — |
| SE-08 | 澄清＋语义变化 | 交叉引用由"LC-04 行 11"更正为行 8；删去"原责任继续阻止新驱动"，保留"复合意图显示 pending/unknown、不能确认完整成功"并接上 `partial{unknown: K}`；旧 Run 终态为 `superseded`；终态提交同批受理 `system` 来源的被保留工作清单；interrupt_then_run 项在受理准备阶段先经守卫 | 第三轮作者裁决 16、17、作者裁决 3、第二轮作者裁决 12、hooks 兼容提案 U5 |
| SE-09 | 无变化 | 原文保留（引用升为 LC v2 / run v2） | — |
| SE-10 | 兼容扩展 | 投影贡献面增加 `changes` / `snapshot` / `floor` 三个读面与完整覆盖水位语义；`requests` / `calls` 由 HD / tools 注册贡献并自带裁剪；续跑计数登记为 projection 贡献 | 消息流提案 R2、R11、R18、hooks 兼容提案 U3 |
| SE-11 | 无变化 | 原文保留（引用升为 LC v2 / run v2） | — |
| SE-12 | 兼容扩展 | 裁决在"Run 状态与等待登记簿"上做出；refs 明确 holder 与发起 Run 的定位（人类请求附属于调用）；closed 原因加 `closed_by_guard`；"调用结算无来源策略"扩为"内部来源无来源策略" | 第二轮作者裁决 8、hooks 兼容提案缺口表 |
| SE-13 | 兼容扩展 | 来源枚举加 `system` 与 `hook_continuation`（各自的意图、dedupKey、容量类别）；`human_answer` 只承载审批型决定，问答型答复经 `call_settlement` | 第三轮作者裁决 17、缺口表 SE-13 行、hooks 兼容提案缺口表 |
| SE-14 | 语义变化 | A / B 两列判据改为查等待登记簿（A = holder 在其发起 Run 上有开放登记；B = 无开放登记而发起 Run 或 Session 仍活动），判定顺序固定，continuation 与注销同提交；C / D1 / D2 沿原表（C 的终态集合含新终态 `superseded`）；新增 `system` 与 `hook_continuation` 两行 | 第二轮作者裁决 8、第三轮作者裁决 15、17、hooks 兼容提案缺口表 |
| SE-15 | 语义变化 | 占位仍被非终态 Run 持有时，队首合格 text 项由该 Run 的驱动器在空闲点取入；两条路径由占位区分 | 工具执行提案作者裁决 7 |
| SE-16 | 兼容扩展 | `system` 归内部来源类别、保留期同其它 context、丢失可接受；`hook_continuation` 不受容量拒绝，有界性由刹车与去重键给出 | 第三轮作者裁决 17、hooks 兼容提案 U3 |
| SE-17 | 语义变化＋澄清 | 终态 `superseded` 的处置：整簿注销、未消费 continuation 改判 context；结算后到达者按新判定顺序；交叉引用由"LC-04 行 3"更正为行 4 | 作者裁决 3、缺口表 RN-04 / SE-02 / SE-17 行 |
| SE-18 | 无变化 | 原文保留 | — |
| SE-19（新增） | 兼容扩展 | 登记 `frames(S)` 为 Session 第四条耐久流：同协调域、同水位语义、保留期随 Session 治理，内容与读面归 tools v2 | 用户裁决 U-42、U-58 / 决定点 K |
| SE-20（新增） | 兼容扩展 | 读权两级 `read_metadata` / `read_content` 与 `visibilityVersion(session, subject)` 读面；版本变化即旧游标作废，不逐帧回填 | 消息流提案 R3、作用域与投递 §7 落点 |
