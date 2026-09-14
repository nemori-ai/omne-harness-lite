# P2 Agent 与 Session 运行接口候选

本稿为 **proposed，待独立架构评审及整合者接受**。它固定 AR/SR 消费者施工前的
接口与交错，不发布新规格，不表示产品 API、真实 P1 或最小运行节点已经交付。
优先结果沿[最小运行基线](runtime-baseline.md)：真实身份、治理、记录及执行者下的
确定性文本→Run→工具→结果闭环；随后完成 M1 的审批、控制与 M2 模型路径。

## 固定输入、语义与证据

| 输入 | 本稿采用范围 |
|---|---|
| [README](README.md)、[scope](scope.md)、[acceptance](acceptance.md)、[implementation-spec](implementation-spec.md)、[plan](plan.md)、[runtime-baseline](runtime-baseline.md) | 工作树 `design/dsh-session-runtime` 的 `de39a862614420da0d63b81e81d0013b6ebc2749`；不缩减 A01–A32，不等待整批 M1 才交接最小节点 |
| [shared-interfaces](shared-interfaces.md)、[observability](observability.md) | 同一基线；沿已接受 P0 接口及 D-010 的 factory/Diagnostics 修订；不假定 writer、admission、diagnostics 产品已存在 |
| [运行身份](../../../../spec/data/agent-runtime-identity/v1/contract.md)、[CD](../../../../spec/data/core-work/v1/contract.md) | `data.agent-runtime-identity@1`、`data.core-work@1`；分别经 D-005、D-008 接受；真实 work-data 默认入口已验证 |
| [AR](../../../../spec/capabilities/live-agent/v1/contract.md)、[CB](../../../../spec/compositions/agent-session-binding/v1/contract.md) | `capability.live-agent@1`、`composition.agent-session-binding@1`；D-005/D-007。catalog 中没有另一个 `cordis-binding` 契约 |
| [SR](../../../../spec/capabilities/session-run/v1/contract.md)、[DR](../../../../spec/capabilities/durable-records/v1/contract.md)、[CC](../../../../spec/compositions/core-work-coordination/v1/contract.md) | `capability.session-run@1`、`capability.durable-records@1`、`composition.core-work-coordination@1`；D-008 |
| [TG](../../../../spec/capabilities/tenant-governance/v1/contract.md)、[AU](../../../../spec/capabilities/action-authorization/v1/contract.md)、[TL](../../../../spec/capabilities/tools/v1/contract.md)、[HD](../../../../spec/capabilities/human-decisions/v1/contract.md)、[OB](../../../../spec/capabilities/engineering-observation/v1/contract.md) | catalog 的同名 accepted v1；仅消费当前资格、调用/请求事实与审计义务，不拥有其状态 |
| 治理施工候选 | `governance-interfaces.md@8b75f30`，从兄弟设计分支按固定 commit 读取；认证、委托、Session 资格及 subjectDefinition 对齐输入，**不是接受依据**。后续治理修订须逐项核对，不消费浮动文件 |

正式身份/版本以上述 [catalog](../../../../spec/catalog.json) 为准。需求沿工作包消费
范围，相关 [PF-013](../../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)、
[运行连续性](../../../requirements/system/runtime-state-and-continuity.md)与
[SYS-TENANT](../../../requirements/system/constraints.md#sys-tenant)仍约束开放路径。
本基线需求文件未改；归档/删除、command、interrupt_then_run、后台 detach、子 Agent
与其它排除项不增设假成功入口，已保存的关闭/终态事实仍必须识别。

本页的 shape、方法名、事件词和权限词是**语言无关的实施候选记法**：`?` 表示缺席，
`A | B` 为带判别值的联合，数组有序且不可变。不是可编译 TS 模块；未做新接口编译、
产品 TDD 或 Cordis 运行探针。落包须先完成下文 R0 的真实公开入口消费验证。

## 四包职责与依赖

| 包及默认公开入口 | 所有状态/行为与消费面 |
|---|---|
| `core/agent` / `@omne-harness-lite/agent` | AR 唯一激活目录、Factory 精确贡献、ActivationPermit、实例资源/工作账目、受限 AgentHandle、退出与有序观察；定义它需要的 Access/Attachment/Driver/Resource 窄协议。无长期 Session、Run 队列或工具执行权威 |
| `session/session` / `@omne-harness-lite/session` | SR 长期 Session、对象访问政策、文本队列、Run/Step/continuation/控制、唯一驱动占位、当前委托、Session attachment 与具名组合；导出状态/事件 decoder 与纯 fold。消费 AR、TG/AU 的窄面及 records/admission/diagnostics |
| `session/projection` / `@omne-harness-lite/session-projection` | 从 SR 已确认事实重建列表/历史/队列/运行视图，管理受管 projection 贡献、版本和水位；无授权裁决、可写 Run 或普通 append。消费 Session 的只读事件/类型，不反向取得提交权 |
| `session/persistence` / `@omne-harness-lite/session-persistence` | 将真实 core-journal envelope 按 Session owner 解码、检查 stream/因果/转移、重建指定水位的 SR 根；可选 checkpoint 校验、缺口/损坏报告。消费 records reader 和 Session 纯 fold，不再拥有第二个 writer/flush 协议 |

Session 不 import persistence/projection；受信宿主将后两者产出的已验证恢复输入/视图
交给 Session 的受限安装/读取适配面。agent 不 import Session 或治理实现；Session
提供 AR attachment 与访问映射，Factory/驱动由装配提供。TG/AU 通过注入的 SR
窄资格/委托端口认回事实，不能反向 import Session；类型依赖同样遵守无环关系。
跨包只用默认公开入口；`/baseline` 的裸 Agent/append/create/flush 不能进入目标应用。

保留 fork 的有用 scope 路由、异步 initiator 隔离、无损事件快照和纯 fold 算法，
直接演化冲突入口；不另造 SessionRepository、通用调度器、事件总线或事务框架。
source Session 内存 append 的成功不能转换为 DR 回执；source projection 同 key
同版复用首份定义改为拒绝重复贡献；source persistence 的 provider handle 改为
真实 records 消费，不套一层仍可从旁边写旧 JSONL 的兼容入口。

## 数据、权威与记录

### 精确引用与身份

所有 SessionRef、AgentRef、UserRef、MembershipRef、DefinitionVersion、RunRef、
StepRef、WorkOwner、Input、ContentBlock、CallRef、RequestRef、Action、OperationRef
直接用 work-data。特别是 `RunRef.session`、`StepRef.run` 和 `CallRef.owner` 保持
原嵌套字段；`Binding` 是工具动作的绑定，不拿它充当没有 parserVersion 的 Factory。
Principal/Causality/Counter/StreamRef/OwnedRecord/Position/Watermark/Receipt 来自 records，
GateFrame/OwnerPublication/ExactUse 来自 admission；不加第二套提交状态或 envelope。

Input.revision 仍为 CD Schema 的正整数 number，入口另限制在精确安全整数范围；
itemRevision 就是它，不能换成 Counter 字符串或 Number 化 stream 修订。queue、
control、stream 修订及排序/序号使用 Counter；输入修订耗尽明确拒绝，不回绕。
成员依据沿治理候选的 `{member:MembershipRef,joinedRevision:Counter,observedRevision:Counter}`；
前者区分移除后重加，后者只解释观察，不作为缓存许可。
身份用无歧义结构值比较；存储键使用 core-json/1 的具名元组规范串，不拼接 tenant
与 sessionId。namespace 使用部署固定值，OperationRef.principalId 按 Principal 规范串
生成；同 operationId 换 tenant/输入冲突。create 在分配 Session ID 前固定 operation
输入，以目标 tenant/选择作为 target，生成的 ID 仅进入拟提交后果和原回执。

| 不可混用的身份 | 本批含义 |
|---|---|
| `Session.owner: Principal` | 长期对象所有者，create 固定为实际创建主体，本批不开放转让/任意代建 owner；当前权限仍逐操作检查 |
| `Session.initiator` | `{principal:Principal, agent:AgentRef|null}` 的原始归因，agent 存在时从可信调用链核实；之后不随运行用户/实例改变 |
| `Session.source` | `{parentSession:SessionRef|null, parentWork:WorkOwner|null, sourceOperation:OperationRef}`；本批普通 create 的两个 parent 为 null，恢复不改原关系。关系不授予权限或终止后代 |
| AR runtime owner | 宿主发行的、已登记关闭权的活能力；独立于 Session.owner/业务 parent/最初调用者 Context |
| 工作委托 | SR 从原受理/运行依据发行的活能力，绑定 principal、tenant、Run/Step、epoch、操作范围与成员加入依据；不是 AgentRef 或 initiator |
| incarnation / generation / epoch | incarnation 区分每次激活；generation 区分 Factory/attachment/驱动提供者绑定；SR epoch 区分原 Run 的执行权。writerEpoch 只隔离记录写者，不能替代 SR epoch |

AR/SR 的新运行身份采用受信宿主的唯一启动命名空间（含本域新 writerEpoch）与各 owner
不回绕的计数形成不透明值；一个 writer 生命周期只允许一份逻辑 AR/SR 权威，第二
Context/Registry 不能重新从零发号。发行器是宿主内部直接函数，无新 ID 服务包。
正式实现须覆盖失败准备、重启及旧 owner 重入；UUID/字符串形状或 TS brand 不证明
唯一性。所有活能力由真实 owner 私有实例表验证，不复制/反序列化/跨新代复活。

### SR 状态与边界

| 状态 | 最小 shape 与解释 |
|---|---|
| Session | `{session, owner, initiator, source, definition:DefinitionVersion, lifecycle, title, manualTitle, pin, modelChoice, historyThrough, controlRevision, queueRevision}`；tenant/owner/initiator/原 DefinitionRef 不可变。lifecycle 识别 open/archived/deleted，首批新建 open；modelChoice 是 Session 的选择/待生效事实，AU 仅拥有保存覆盖 |
| QueueItem | `{input:Input, acceptedOrder:Counter, order:Counter, state:queued|held|taken|withdrawn|closed, acceptedBy:Principal, membershipBasis, takenBy:RunRef|null, closedReason:string|null}`；原输入/编辑关系可追查，busyBehavior 本批仅 queue；held 是全 Session hold 下未取批项的有效状态，原受理状态仍保存 |
| Run | `{run, batch:Input[], definition, executionChoice, epoch:OpaqueId, phase, checkpoint, blockers, controlRevision, delegationBasis, driverBinding, outstanding}`；phase 完整沿 SR-08，batch 冻结精确修订/原消息顺序。outstanding 只存原调用/请求/接续引用及 SR 消费位置，不复制 TL/HD/BG 状态机 |
| Session 驱动占位 | `null | {run:RunRef, epoch:OpaqueId}`；在 takeBatch 逻辑提交时取得。waiting/stopping 仍占位；等待时没有运行中的 JS driver 也不让普通输入穿过 |
| Epoch 的执行者 | `null | {agent:AgentRef, workPermitId, driverGeneration}`；这是当前受管关联，不能由磁盘 DTO 得到能力。退役停驻可清除关联但保持 Run 占位；再次驱动原 Run 要新 epoch |
| Step | `{step:StepRef, epoch, kind:model|auxiliary, requestBinding|null, trigger, status, proposedCalls:CallRef[], presentedOrder:CallRef[]}`；M1 是具名 `auxiliary` 的确定性工具工作，不能伪造模型结果；M2 一个模型决策及其工具批次为一个 Step，新模型决策新 Step |
| continuation | `{continuationId, run, sourceStep, call:CallRef|null, request:RequestRef|null, localPrerequisites, state:blocked|ready|claimed|settled|closed, readyAt:Position|null, claimedEpoch:OpaqueId|null}`；只能由来源事实建立/转移，q1/q2 各自独立。readyAt 相同以本批记录顺序裁决 |
| Control | `{operation:OperationRef, run, observedEpoch, scope:run|session, kind:interrupt|resume|cancel|force_stop, stage:accepted|applying|settled, effect:ended|stale_target|pending|applied, stopEvidence, remaining}`；请求受理/逻辑权撤销/真实停止/清理/效果质量分别保存 |
| Hold | `{operation:OperationRef, revision:Counter, reason:explicit|session_force_stop}` 的活动集合；有任一 hold 就不取新批/Step。continueQueue 携带 expected controlRevision 和明确解除的 hold operations，不用过期清空覆盖新 hold |

`executionChoice` 本批为 `{kind:deterministic, driverKey, driverVersion}` 或
`{kind:model, profileId, profileRevision}`。前者明确没有模型请求/usage，是工作包已选
M1 无模型路径的实施投影；后者须真实 MC 资格。两者固定一个 Run，不能运行中
互换；模型不可用不影响确定性基线，但不能向缺 MC 的模型 Run 返回可运行。
同理预算依据由真实 BG 参与第一次实际收费/零计费调用，Run 元数据不铸造预算许可。

checkpoint 使用 `inputs_taken | step_prepared | calls_recorded | waiting | results_linked |
step_settled` 的具名安全位置，保存原 Step、来源记录位置及未交付后果引用。
它不是反序列化调用栈；恢复可否继续还必须核对原模型/调用的实际接纳与结果。
step_started 将可运行 Run 置 running，无就绪接续的等待保存为 waiting；只有
checkpoint/控制/结算的具名合法事件能推进 phase，不提供任意 setState。
工具实际完成顺序记录 source Position，模型呈现顺序沿原 proposedCalls，不互相覆盖。

### 唯一记录 owner 和事件

SR 记录 owner 固定 `session`，tenant-scoped streams 为具名元组 `session(S)`、
`queue(S)`、`run(R)`；Session stream 保存目录/hold及唯一驱动占位，queue 保存内容
版本/顺序，run 保存 Step/continuation/控制/checkpoint。streamId 使用完整引用的
规范元组；一个 batch 每个 stream 只有一个 append，修订每 batch 加一。输入内容
直接嵌入已校验 Input，无第二份内容仓储。业务事件 version 均为字符串 `"1"`。

| kind（前缀 `session.`，全部 /1） | data 与 fold 义务 |
|---|---|
| `created` | Session 初始完整值；检查身份/原定义/owner，已有 Session 不可重复创建 |
| `input_enqueued` | `{input, acceptedOrder, acceptedBy, membershipBasis, order}`；只接 text，不接受用户伪造 tool_result/deferred_receipt |
| `input_edited` | `{input, previousItemRevision}`；保留原件，必须未 taken，严格下一修订 |
| `queue_reordered` / `input_withdrawn` | `{orderedInputIds, previousQueueRevision}` / `{inputId,itemRevision,previousQueueRevision}`；完整范围与当前成员一致，不丢新加入者 |
| `batch_taken` + `run_created` + `driver_reserved` | queue 的 `{run,batch,previousQueueRevision}`、run 初始值、Session 的 `{run,epoch}`；同一 batch，fold 验证成员/修订/顺序、旧占位为空、三者互指 |
| `step_started` / `checkpoint_saved` | Step 完整初值 / `{run,epoch,checkpoint,sourcePositions}`；匹配当前驱动、合法位置，不能跳过未关联结果 |
| `continuation_waiting` / `continuation_ready` / `continuation_claimed` / `continuation_settled` | 精确 continuation 及原 request/call/来源位置、上一状态、claim epoch；ready 的排序用 envelope Position，claimed 与本次 Step 同批 |
| `call_linked` / `result_linked` | `{step,call,sourcePosition,sourceOwner,protocolVersion,presentationIndex,result:ToolResultBlock|null}`；从 TL 真实事实导入，原 call/attempt 唯一关联；迟到隔离事实不能用此事件替换有效结果 |
| `control_requested` / `control_progressed` | 完整 Control 的合法前后修订、终止意图、已知 stop 事实/剩余责任；force_stop 的 epoch 封闭发生在 accepted 的 logical publication |
| `hold_set` / `holds_released` | Hold / `{operations,previousControlRevision}`；释放明确目标，清理成功不产生此事件 |
| `epoch_parked` / `epoch_replaced` | `{run,oldEpoch,checkpoint,reason}` / `{run,oldEpoch,newEpoch,delegationBasis,driverBinding}`；park 封闭旧执行者，新代恢复不得修改原 batch/定义/模型选择 |
| `run_settled` + `driver_released` | `{run,epoch,phase:completed|failed|cancelled|interrupted,reason,evidence,remainingIndependent}` 与 Session 精确占位；同批且已满足对应安全条件，不能把 unknown 当 stopped |
| `late_fact_recorded` | `{run,oldEpoch,call|null,sourcePosition,classification,remaining}`；只增加原工作隔离/诊断证据，无有效结果或继续权 |
| `operation_denied` | `{operationKind,target,code,observed:Watermark}`；独立 Session 审计 stream，披露按读权裁剪；未保存关键拒绝返回 audit_unavailable |

`run_settled(interrupted)` 是已安全中断，非逻辑终态；此时可和 driver_released
一起释放活动占位，历史/未关闭接续仍属于原 Run。恢复旧 interrupted Run 必须
没有另一活动占位，并核对中间历史/原逻辑目标相容，否则 busy/superseded，不
重定向。仅退役 park/waiting 则保留原 Run 的 Session 占位，恢复可原位换 epoch。
队列还受 hold/当前资格限制，stopping 不因无 JS driver 而释放占位；这不开放
SR-11 的复合控制。一个 Session 可保留多个历史 Run，只有一个当前活动占位。

事件中的 `sourcePosition` 在来源早已耐久时为完整 Position；同批新事实尚未
分配 Position 时使用 `{kind:"this_batch",stream:StreamRef,recordIndex:number}`，
只能引用本 envelope 内真实匹配的来源记录，恢复据本 envelope 得到其 Position。
索引按冻结 appends 的实际排序固定，禁止预猜 seq/commitId；跨批缺回执不得使用
this_batch。source owner/protocol/对象版本同时匹配，不能仅凭一个位置取得事实权。

跨 owner 的同批核对由具名组合和受信恢复装配完成；SR reducer 不要求执行 TL/HD
代码。凡来源未知版本、错误 tenant、call 不属原 Step、非法 epoch 转移或缺少
应当同批的对项，恢复失败；不能跳过后继续写。TL/HD 的 source Position 是来源
引用，不是批准/结果权限。消费状态保存 source owner/protocol/Position 与原对象
引用，幂等按这些精确事实而非通知 ID。

AR 的阶段、attachment/pin/订阅/工作许可为运行权威，不从上述 SR 日志复活。
AR 操作审计另以 owner `agent` 的 tenant 审计 stream 保存
`agent.operation_recorded/1={agent,operationKind,phase,reason,relatedOperation}`；它是
已观察生命周期的审计，不是重建活体目录的指令。激活的准备资源无业务执行权；
ready 发布后在门外保存关键操作审计并分发有序 activated；通知不作为审计回执，
AR 在该激活审计耐久前保持工作面不可用，不允许监听器先启动业务。审计
失败不撤销已经成立的 ready：结果明确 published_but_audit_unavailable，封闭新工作，
保留原句柄/退出责任并收口；重试查询原尝试，不新建一次激活。关闭先同步关门，
随后记录；审计不可用不能阻止安全清理，不能假称审计已保存。通知在 ready/退出
提交时登记原序号、门外逐实例有序分发，审计晚到不会使 disposed 超过 activated。
AR 生命周期本身仍没有跨崩溃 activate 幂等承诺；源/结果丢失按精确 attempt 查询，不能盲重试。

## 当前调用者、对象权限与运行委托

这是待与治理稿共同接受的最小权限政策，不能由方法名自然推出：create 的 owner
是当前真实 Principal；owner 的 `session.read_metadata/read_content/enqueue/edit_queue/
control/activate` 逐项明确授予，前提仍为当前认证/TG 资格与对象可用。其他同 tenant
成员默认无这些权利；`tenant.members` 等管理权不扩大为 Session 读权。
额外 `session.emergency_control` 是 TG 实际登记、可撤销的独立租户权限，仅允许
精确 interrupt/cancel/force_stop，不含正文、resume、新工作或隐式代答；本批不新增
通用 ACL 编辑服务。未来分享/代建政策缺席时明确不支持。

对象正文权归 SR 判断，TG 提供当前成员/明确紧急控制资格；工具资源权限仍归
实际资源 owner/AU。list/history/subscribe/lookup/原 operation 返回都在披露时
再查；权限丢失立即关闭该订阅的新披露，事件 payload 不先排入无权客户端缓冲。
无权与不存在对普通调用者统一 inaccessible；控制回执仅给获权状态/停止信息。

应用的真实身份适配发行治理候选中的 `AuthenticatedInvocation`，每次
`inspectCurrent(frame)` 核验私有身份、Principal、凭据修订及可用性；撤销/失联的
当前状态写入口也参加同一 coordinator。Session 消费这一个协议，不再发一种
Principal DTO 凭证。AR 不 import 应用或治理类型：它声明下面的 RuntimeAccess
消费面，由 SR/治理适配捕获原 invocation；只有受信装配登记的适配能提供它。

用户 enqueue 只授本次受理；每项保存原 acceptedBy/成员加入依据，排队不保留
客户端活连接。takeBatch 的宿主调用使用真实内部系统身份并携带 SR 已登记的
限定派发意图：代表 Session.owner 运行，只能领取该 Session 当前队首输入。
它必须在当前 TG 根重新核对 owner/每项输入主体资格和定义 use 权；输入队首失权
返回具名 blocked，不跳过。最小政策只有 owner 可入队，因此一个批次不混入多个
被代表主体。客户端断开不撤销意图；凭据失效拒绝该旧凭据的新请求，成员/定义/
Session 资格撤回则封闭尚未准入工作。组织移除后再加入不认回旧 joinedRevision。

SR 发行 `RunDelegation` 活能力：`{principal,tenantId,run,epoch,subjectDefinition,
sourceOperation,membershipBasis,allowedOperations}`。公开字段仅为解释；真实对象
必须在 SR 当前表认回，且 Run 当前 epoch/控制/可用性都有效。allowedOperations
仅为推进该 Run、提议其 Step 工具/模型工作、关联原结果；不含 Session 管理、任意
其他对象或代表他人。Step 消费委托必须匹配 `StepRef.run` 与 SR 已登记的 Step。
AU 的 subjectDefinition 从此和 Session 原定义关系取得；Action.definition 仍是
TL 工具定义，二者不能因同用 DefinitionVersion 类型而合并。

resume/recovery 先根据原耐久 delegationBasis 和当前 TG/SR 资格形成新委托及新
epoch，不能从日志反序列化原句柄；紧急控制者不能借 resume 获得 owner 的运行
身份。该委托的消费/撤销/epoch 变化与 TG/AU/AR 检查处于同一门。当前资格失效
关新 Step/Action；已位于 n 的合法工作沿 CC-03 保持其原准入，必要停止另用
精确控制。收口/外部结果核实使用独立清理/事实通道，不冒用失效委托。

## AR：激活、附着与工作面

以下协议由 agent 声明其消费要求，Session/Factory/资源 owner 兑现；不是新包。
“候选”皆属原提供者私有对象，门外准备得到；数据快照附不可变 stamp，任意
结构仿造无效。所有 check 为同一活动 GateFrame 内的同步纯检查，返回
`ready | prepare_again | denied(code) | unavailable(owner,code)`，不调用 resolver/I/O。

| 端口 | 输入、结果与线性化义务 |
|---|---|
| RuntimeAccess.prepare/check | 原适配绑定的调用者、精确 SessionRef/AgentRef、操作 → 私有候选；check 同门核验当前身份/TG/SR 对象权，目标或操作不同不得复用。AR 内不另缓存 allow |
| RuntimeOwner.registerAttempt/closeAdmission | 由稳定宿主持有；预留前登记 AgentRef/清理责任，close 在同门封闭新尝试。对象不是 ownerId 字符串；调用者取消等待不撤销登记 |
| FactoryRegistry.select/prepare/check | `{factoryKey,scopeIdentity,implementationVersion}` → `{registrationId,generation,exactVersion,scopeIdentity}` 的精确 FactoryBinding 和私有资源准备；同解析键重复拒绝，缺版本不 fallback |
| SessionAttachment.prepare | 仅真实 ActivationPermit、精确 SessionRef/选择 → `Attachment`；本批 SR 从已恢复内存根同步建立 held 登记，异步恢复在 activate 前由宿主完成。可替换提供者若异步分配，先登记原 attempt 再 await，丢回执须可 inspect/release 原登记 |
| SessionAttachment.checkActivation | 同门核对 held、原 AgentRef、provider generation、Session 原 DefinitionVersion、open、当前资格/恢复兼容 stamp；stamp 不含无关标题/历史追加。revoked 永不变回 held |
| SessionAttachment.release/inspect | 精确 attachmentRegistrationId → released / retained(diagnosticId,remaining)；不归档、不取消 Run、不删 Session。旧释放不能匹配后来 attachment |
| RuntimeResource.prepare/check/pin/retire | 真实资源先登记给尝试；check/pin 与 retire 共用门，绑定 owner/registration/generation；实例必需、操作必需、可选用途明确。pin 不做 I/O，发行 ExactUse 由资源原 owner 执行 |
| Driver.requestRetire/awaitQuiescent/releaseResources | 前者只关新工作，后两者返回实际 `quiescent` / `blocked(remaining)` 与 `released` / `retained`；不会把 AbortSignal、清空表或超时作为完成 |
| AgentRegistry.activate/lookup/resolve/close/inspectExit | activate 只消费既有 Session/精确 selection/owner/access；返回原 AgentRef 的 preparing/ready/closing 描述和受限句柄，或 conflict/inaccessible/unavailable。lookup 受权描述，resolve 仅精确 AgentRef；close 受理同一次退出，等待取消只结束该等待者。句柄不含 ctx/原 Agent/factory/disposer |
| AgentRegistry.prepareWork/checkWork/pinWork/settle | 绑定精确 AgentRef、RunRef/epoch、整份实际装配、真实 RuntimeAccess；SR 的 input_run/epoch_replaced/step 准入在同门使用。一个 WorkPermit 覆盖该 Run 在本实例的整个执行 epoch 及未移交后代，不按底层函数重取配置 |

WorkPermit 初始随真实 AR pin 被候选扣住；SR 记录 requiredUses 时使用
`{recordOwner:"session",binding:{owner:"agent",resourceId:canonical(AgentRef),
generation:incarnationId,epoch:runEpoch}}`，pin 的私有表另绑定 Factory/必要资源完整
版本。它不是从这份 UseBinding 构造权限。AR 的 ExactUseIssuer 由 AdmissionHost
只交给 AR 一次；生命周期由共享接口的单次 claim/release 协议封闭。

`checkWork` 也用于每个 Step/工具联合准入，校验原许可仍属当前实例/Run epoch，
不再次 claim 同一 ExactUse。不产生 AR 耐久记录的纯资源检查不伪造 agent publication；
requiredUses 的 recordOwner 是实际记录该许可关系的 session。新工具资源另由
TL/执行 owner 持有，不能复用 AR pin 代替工具绑定。工作结算须 SR 确认安全停驻/
终态及全部 AR 后代结算或具名接管；未知分配/未确认移交返回 retained。
AR 另给原 SR 收口者 `checkSettlement(frame,permit,run,epoch,kind)`，只允许 closing
阶段的 checkpoint、原已准入结果、停止/具名接管确认，SR 同时核对自身 epoch/控制
规则；releasing 后拒绝运行结果提交。它不能取得新 Step/工具准入，也不因用户撤权
失去必要清理资格。force_stop 后结果走原事实隔离通道，不能用收口能力绕过撤销。

激活返回/查询另含 `publication:unpublished|published`、`audit:pending|durable|unknown`、
`reason` 和有权可见的 remaining；失败准备若清理未完成仍返回原尝试/inspectExit，
不能只 throw 并遗失资源。AgentHandle 仅允许 inspect、requestClose、waitExit，
每次普通操作经 RuntimeAccess 当前重检；宿主另持原 cleanup capability。内部
WorkPermit 不能从 AgentHandle 转出给用户或工具 body。

激活过程固定：同门当前访问/owner/Factory 检查→预留 SessionRef 与新 AgentRef→
门外私有准备 attachment/资源/driver→同门复核全部 stamp 并一次 ready 发布→
门外审计/有序 activated 通知。资源建立前原尝试已经持清理权，失败/晚到准备归
同一尝试；preparing/ready/closing/releasing 均占位。发布通知可重入 close，
同步异常/异步拒绝单独隔离；activate 返回时句柄可能已 closing，通知不否决发布。

只有受信宿主持一份 Registry 状态；多个 Cordis Context 注入相同受限服务，不能
各构造一份独占表。实例存续必需 binding 撤除先同步关新使用/关闭使用者，再等
真实排空后卸载 Cordis；可选工具一旦被某工作 pin，由 TL 的在途政策保护，不
因此关闭所有 Agent。意外失联封闭相关门并报告原责任，依赖恢复不复活旧尝试。

## SR：公开操作与一个实际 batch

| 表面 | 输入与结果 |
|---|---|
| create | invocation、operationId、tenant、精确 Agent DefinitionVersion/选用；TG 当前 use/选用检查，生成原 Session；AdmissionResult 的已耐久业务结果包含 SessionRef |
| read/list/history/queue/run/subscribe | invocation、精确目标、分页/水位；先当前权限，再一致快照。正文与元数据分开，projection 缺失标 rebuilding/unavailable，不把它当不存在 |
| enqueue/edit/reorder/withdraw | 原 operation、Session、输入/目标、expected queueRevision/itemRevision；text-only、容量/修订/顺序检查；返回原耐久结果及新修订 |
| takeBatch | 受信宿主派发意图、精确 AgentRef、Session、expected queueRevision；队首连续合格 text、配置批大小、固定顺序；成功创建唯一 Run 并把本批全部 taken |
| acquireNextStep | 原 RunDelegation、WorkPermit、RunRef/epoch、确切 continuation 或 inputs_taken 触发；原控制/资格及本地前提满足后串行 claimed，返回已耐久 Step，不能重复驱动 |
| requestControl/readControl | 当前调用者、operationId、精确 RunRef/observedEpoch、kind/scope；重复认回原控制，旧目标 ended/stale_target，不转向新 Run |
| hold/continueQueue | 当前 owner 权限、operationId、Session、expected controlRevision、明确 hold 集合；只改变 hold，不越过 stopping/待答/失权 |
| preparePark/recoverRun | 受信退役/恢复 owner、精确 Run/epoch、checkpoint/原工作核实事实；前者停驻并封闭旧执行者，后者按当前资格/兼容性建新 epoch。不是用户传 JSON 即可调用的恢复入口 |

read/list 等不导出 raw RecordReader。写操作沿共享 AdmissionResult，业务拒绝写入
原 owner outcome，不把 committed 的 denied 说成业务成功。内部 stamp 过期为
prepare_again，门外有界重准备；用户 expected 修订冲突保留原值并按 records 写成
可重试认回的确定冲突，不偷偷改 expected。公开非法输入在准备边界拒绝。

以 takeBatch 为具名 `input_run` 组合，所有准备/检查/发布明确分开：

1. 门外规范化操作；短门核验当前读权并 lookupPrepared，已知结果认回，not_seen
   才准备 TG、AU busy_input/所需模型配置、SR 队列/占位和 AR 工作候选。
2. 门外按当前队首形成唯一冻结 batch、Run/epoch/委托/初始 checkpoint、SR 三个
   stream 的 appends/候选根；AR 准备原资源。模型路径另需要实际 MC 资格，M1
   直接核对确定性 driver。coordinator.prepare 预编码这一整个 batch。
3. 同一个 enter 内再次去重，依次核验真实调用/派发意图和 TG → SR 对象/队列/
   control/原定义 → AU 当前所需配置 → AR 精确 ready/attachment/工作/资源及
   driver 绑定。准备 stamp 变化退出重准备；禁止外部查询、解析、await、通知。
4. AR 同门 pinWork，交入该 batch 的 requiredUses/uses；submit 一次。
   此 batch 只有 `session` 写记录，所以 publications 恰有一个 session；TG/AU
   只读不造假 publication。logical 同步占队列/Run/driver 并封闭冲突。
5. 门外待 coordinator completion；只有 committed 且 publication=ready 才向 driver
   交 Step/工作。writer Promise、Position、已排队的 pin 都不允许启动。unknown
   保留原票据/占位/使用，只 lookup 原操作；冲突不创建第二 Run。

跨 owner 的请求/结果/控制也按同一规则准备一个 PreparedCommit，绝不把上面
步骤拆成 `SR.save()` 再 `HD.save()`；所有写 owner 一一对应 publication，全部
stamp 检查后才能 pin/submit。`publishLogical/publishDurable` 严格同步返回 undefined，
只换已冻结根；异常隔离，不通用回滚。logical 不被旧 durable 根覆盖。

否定事实（hold、interrupt、终止意图、epoch 撤销、TG/AU 收紧）立即封闭后续位置；
正向事实（解除 hold、中断恢复、人类答案、授予/资格增加）必须耐久才供新准入。
当前允许集合与所有未耐久收紧取交集，不能只比最终 logical/durable：例如
hold→clear 都 pending 时不能让 clear 掩掉 hold。普通撤权 n+1 不改 n 的准入；
force_stop 可以封闭原执行权，使 n 耐久后仍不能启动。域失败禁止越过水位缺口。

## TL/HD 的窄交互与独立接续

下面由 SR 声明必需输入/消费责任；TL/HD 各自拥有状态、具体 provider 协议和发行
事实能力。实现前必须与其作者固定相同 shape/版本，不能用调用者填写的 DTO 或
通知 payload 充当已接纳/已停止事实。SR 不提供任意 `setCallState` 或 `unblock`。

| 方向与消费端口 | 必需 shape、核验及同批关系 |
|---|---|
| TL → SR `prepareCallLink/checkCallLink` | 原 WorkOwner=StepRef、Run/epoch、CallRef、proposed 顺序、精确 Action/来源 owner stamp；核对 SR 当前 Step/委托/AR 许可。TL action_execution 聚合 AU 判定、HD 消费（如有）、BG 预留、TL 调用与 SR link，一次 batch |
| HD/TL → SR `prepareWait/checkWait` | `{run,epoch,step,call,request,continuationId,action,requestContentVersion,localPrerequisites}`；来源 owner 私有候选证明原 Action/request。`request_wait` 同批持久 request/Action/调用 waiting 与 SR continuation_waiting/checkpoint；耐久前不展示可答请求 |
| HD → SR `prepareConsequence/checkConsequence` | `{request,contentVersion,outcomeVersion,call,continuationId,sourceOperation,outcome}`；HD 当前唯一决定/后果候选，SR 核对原等待与全局终止。`answer_consequence` 同批保存 HD 决定/后果和 SR ready 或具名 closed 结果；approve 不直接启动工具 |
| TL → SR `prepareResult/checkResult` | `{call,step,sourcePosition,executionEpoch,result:ToolResultBlock,terminalEvidence}`；结果由 TL 原权威认回，引用已耐久原事实或本批拟提交的唯一终态；SR 原绑定匹配后 result_linked，并仅使它依赖的 continuation ready，同批结果确认前不可消费。可同域联合结算；否则 TL 保留具名待交付后果直到 SR 回执 |
| SR → TL/HD `prepareRunControl/checkRunControl` | `{run,observedEpoch,controlOperation,kind,scope,exactCalls,exactRequests}`；所有原非终态自有调用由 SR/TL 同门快照确认，TL/HD 各给自己的记录/publication。SR 保存停止意图/阻塞，HD 关闭应关闭请求/后果，TL 封闭未接纳调用；同域一次 owner_change batch |
| SR → TL `inspectRunCalls/requestStop` | 原 CallRef、执行 owner identity/protocol、原执行 epoch、controlOperation；只查询/停止同一 attempt。异步执行器账本交接沿 CC-05，响应丢失查原操作，SR 保留待交付意图 |
| TL → SR `prepareStopProgress/checkStopProgress` | `{call,executionEpoch,controlOperation,acceptance,physical,isolation,cleanup,effect,sourcePosition}`；各字段独立，证明覆盖迟到 start/旧结果入口。未知/not_found/本地 abort 无法令 SR 释放占位 |
| SR → AU/TG 的只读工作面 | `prepareWorkFacts/checkWorkFacts(frame,...)` 认回 Session 原定义、owner/输入主体、Run/Step/epoch、委托当前可用性、所需对象权；返回私有当前依据，无批准、工具资源权或预算许可 |

普通工具 call/result 关联只给部署信任的 TL owner。公开用户粘贴工具结果是 text。
同域来源若先已耐久，再独立交 SR，源后果以原 CallRef/终态版本稳定去重，SR 返回
原 Receipt；不能以“已收到通知”让 TL 删除待交付责任。强停已封闭或终态后的事实
进入 late_fact_recorded 或原 TL 账目，继续保留外部效果/费用，不更新有效 Run 输出。
普通热释放/恢复后的独立 TL owner 可以把原 call 的合法结果交给当前 SR：原
执行 epoch 与当前 Run epoch 分别核验，原调用未被强停/结算取代、结果来源已核实，
当前接收操作按新的 SR 资格同门提交，不能让旧 Agent 回调代行。结果可在无 Agent
时入账/使接续 ready，取得新 Step 仍须当前 AR 许可；这条事实通道不授新工具执行权。
HD 的决定后果也使用原 request/outcomeVersion；新 attempt 不能消费旧批准。

SR 从 ready continuation 中按耐久 readyAt、同批记录顺序串行 claim；只有当前
运行中的一个 Step 能驱动下一动作。q1 已答、q2 未答时 q1 可准入，q2 的阻塞仍在；
q1 结束不能 completed。普通 completed 的检查必须同时满足：全部本 Run 接续
settled、没有 pending 请求/未消费 ready、所有剩余责任已结算或有具名独立接管
证明；该检查、run_settled 与 driver_released 是同门同批，不能以空 ready 列表
替代。新用户输入始终排队，普通文本不会答复 HD。无 ready 时
保存 waiting 原因并释放可释放观察资源，不运行模型轮询，不给等待自动答案或
人类请求总量上限；分页/当次处理预算有界。激活宽限只影响资源，不取消请求。

工具首次 allow 路径不依赖 HD；但 AU 判为 ask 且真实 HD/request_wait 未交付时，
返回 unavailable(human_decisions_unavailable)，不执行、不伪造批准或在内存等答。
最小节点必须经真实 grant 管理和真实本地预算准入文件工具；这一门必须在最小
节点前通过。完整 q1/q2、持久审批和 M2 deferred receipt 仍是后续本批必交行为。

## 控制、退出和恢复

| 动作 | SR 权限/状态、TL/HD 责任与继续条件 |
|---|---|
| interrupt | 立即关新 Step，持久 Run 中断阻塞；请求全部原自有调用（含以后开放的后台）停止。system_approval 随待批调用取消，question/agent_approval 若存在仍保留，答案不解除全局阻塞。真实安全收口后 interrupted，不自动重试工具 |
| resume | 仅原 interrupted 或存在可解除阻塞的 waiting，且无另一 Run 占位、终止意图、hold/当前资格阻断，核对中间历史/原位置；新 epoch/委托与 AR 许可同批。只解除列名可解除阻塞，不清 HD 待答，不重发 unknown |
| cancel | 同门封闭原 epoch 的新工作，保存不可恢复终止意图、关闭对应请求/继续权、请求原调用停止。收口期间 stopping，取得安全停止/有效隔离后 cancelled，迟到答案/结果不能恢复 |
| force_stop | 受理点立即撤销原 epoch 继续执行及有效结果提交；持 stopping。必须取得覆盖迟到 start/所有旧提交通道的停止/隔离证明才 cancelled(reason=force_stopped) 并释放占位；残留清理、外部 unknown/费用另存 |
| Session force_stop / hold | 精确捕获当前 Run 与所有应控制对象，和 hold 同批；无 Run 也可成立 hold。continueQueue 只解除明确 hold，不能释放 stopping 占位或恢复 cancelled |
| Agent close/owner close/退役 | AR 关新工作→SR 到耐久 checkpoint 停驻，保留 Session/Run/request/call→确认原执行 owner 接管及观察/控制独立→AR settle→真实 quiescent→封闭提交→按依赖释放；不自动等价用户 cancel/interrupt |

控制目标列表在门外准备后以 SR/TL 的当前根 stamp 同门核对；若另一个调用先准入，
必须重准备纳入它；若控制先逻辑生效，则后来的新调用失败。真正执行器 stop 的
异步传输不在短门内，必须消费已保存意图，并在其原账本先建立耐久取消墓碑。
start 在路上/inspect 暂空仍是未核实，不能发安全停止回执。成功终态先成立时
保留成功，控制记 ended；不要把每个收到 stop 的 call 重写为 interrupted。

即使业务 journal 当下不可用，运行宿主仍可同步封闭旧提交/启动通道并尽力停止；
不得报告耐久控制成功或丢失原责任。恢复未核实原 control/attempt 前不开新效果。
自关闭只返回受理，工作内部等待包含自己的排空明确 self_wait；外部宿主继续
等待。deadline 只终止等待，inspectExit 给出阶段、原资源、最近安全错误、可重试性。

独立 TL/HD owner 自始由长期宿主持有；若接管已确认，外部 unknown 可以留给原
owner，AR 仅释放观察资源，不必无限持有 Agent；未确认接管则原 AR 账目继续持有。
等待期停车须一次提交 checkpoint、epoch_parked/当前执行者封闭，然后实际退订；
晚到准备/订阅仍登记原尝试并清理。不能先减工作数再等接管回执，也不能把 Cordis
Fiber disposed 当作任意工具、I/O 或业务后代已停止。

恢复顺序固定：P1 持锁扫描并重新同步有效前缀→全部 owner 的 decoder/fold 在同一
Watermark 装载→SR 校验同批关系、未知事件/状态贡献、定义/配置/驱动协议及环境
能力→原 TL/HD/模型 owner 核实 call/request/attempt 与停止账本→当前身份/TG/AU/
对象资格→重新激活 Agent、原 Run 新 epoch/委托/AR 许可→耐久后才继续。
模型与工具可能已发出但结局不明标 unknown，查询原 attempt；没有未发出证明不
重发。已完成结果恢复原引用且不重复文件效果；cancelled/deleted/closed 请求不
复活。AR 目录从空重建，旧 runtime 对象/Context/ExactUse/句柄永不反序列化。

有权历史读面可以在效果核实未完时开放，但必须带已验证水位/availability；坏前缀
不能靠“projection 还能显示”通过。session/persistence 只读获准 namespace/owner 的
envelopes，缺 TL/HD decoder 时不能声称整个域恢复完毕，实际入口按依赖关闭。
完整安全前缀与 schema/业务转移不一致是恢复错误，不是投影丢失可默认修复。

## 状态贡献、投影和可观测性

SR-13 的注册描述为 `{stateKey,scope,owner,kind:authoritative|projection,
schemaVersion,inputVersions,initialize,upgrade,withdrawPolicy}`，由真实贡献 owner
持有精确 registration/generation。Session 管 authoritative 的受限变更/依赖登记，
projection 管可重建 fold；同 scope/key 重复拒绝，不因版本字符串相同共用首份函数。
本批先实现自身具名状态及必要贡献协议，不开放任意 JSON patch/自定义状态服务器。

| 权威/派生 | 恢复与撤回义务 |
|---|---|
| Session/queue/Run/control/continuation 原事实 | SR authoritative，只有具名条件操作能变；缺 schema/reducer/required contribution 时依赖能力 unavailable，不能初始化空历史/无占位 |
| attachment、AR 工作/资源使用、当前 delegation | 对当前执行有权威性但不耐久；从原事实重新核实/取得，不用 checkpoint 复活权限；撤回先同门关新使用再收口 |
| 历史 surface、列表/过滤/队列展示、run 状态摘要 | projection/derived，输入版本+SessionRef+watermark+贡献 generation 明确；缺失从确定性 fold 重建。不得用旧摘要准入或给控制者额外正文 |
| checkpoint | 绑定 namespace、SessionRef、输入 kind/version、fold/schema 版本和完整源 Watermark；只能加速已验证前缀，越界/错 Session/版本未知则明确弃用并重建或 unavailable，不作为权限或恢复证据 |

初次为空只在真实“新建且无此状态”的事实下初始化。升级由 state owner 明确提供
可验证映射、保留原件与依据；无映射拒绝，不能 deserialize 失败后回默认。
authoritative 贡献卸载不删记录：先关依赖的激活/工作，排空或按声明 busy 拒绝；
重新装载先当前资格/版本校验，新注册身份不接受旧 disposer。projection 撤回只使
相应视图 unavailable，独立历史权限/原件仍由 SR；新 fold 不能重写原数据。

各运行 owner 注入 D-010 Diagnostics；`phase/code` 使用具名常量，关联既有
Principal/Causality/operation/AgentRef/RunRef/StepRef/Position、实际绑定及原尝试。
准备、准入、耐久确认、等待、控制、恢复和清理分别留阶段；正文/工具参数/秘密
不进入普通 log/span。短门只收集有限字段，门外输出，避免日志启动 I/O。
通知/诊断失败不改已耐久业务结果，关键业务审计失败按 CC-07 封闭效果。
本机共享 timer/服务初始化清空 initiator，从可信宿主创建，因果用显式字段传播；
ALS 不承担授权或资源排空。Cordis logger 桥仍沿 observability 的 O11 独立门，
缺桥不允许各包造另一份日志设施，也不要求等 P3 查询 UI 才运行最小节点。

## Cordis 与 fork 映射的证据边界

采用官方 `@deepseek-ai/cordis@4.0.2`，不 patch/fork 官方包。DSH 文档/源码固定
`c291e7961a515f6d7af9304e7fd1d257929aef26`；既有发行物完整性与有限运行证据沿
[运行组合来源](../../runtime-composition/sources.md)、[agent fork 验证](../../agent-runtime/fork/review.md)，
Session 原算法/差异沿[来源基线](../fork/session-source.md)。本次阅读了活动 agent
类型/实现与 provenance；没有把源测试称为本稿 AR/SR 实现验证。

官方[生命周期文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)
说明受管 effect/子插件清理及多个异步 disposer 的并发；[既有源码核对](../../../research/cordis-lifecycle-and-tool-composition.md)
进一步定位同修订 fiber/events 的边界。这支持复用资源原语，不能支持“dispose
返回即业务静止”。本稿选择由原 AR/Driver/Session owner 实现收口顺序，最后才
调用实际卸载；这项顺序是 OMNE 契约的实施映射，不是声称 Cordis 有同名事务 API。

source agent 的单字符串键/裸 AgentHandle、可否决 created、Factory slot 撤除和
creator-agent 归属不足以实现本稿；直接改其 registry/factory/dispatch 类型与行为，
保留可用路由/initiator 算法，不保留绕门 create/execute 兼容层。实际 4.0.2 资源
错误/迟到 disposer、依赖丢失、事件重入均由下表真实探针/符合性测试检验；本稿
只沿用既有事实，不声称新退出协议已由源 inspection 证明。

## 施工输入、真实开放门与 RED→GREEN

以下是待派发的职责/路径，当前只授权本设计文件。产品任务由整合者固定本稿的
接受 commit、前置产物 commit、相应验收和完整可写路径后派发；共享根配置/锁/
索引仍由整合者拥有。接口或验收冲突停止依赖工作并回报，不让应用补业务政策。

| 顺序/角色/可写范围 | 必须消费的真实产物与最小 RED→GREEN |
|---|---|
| R0 共享声明与组合测量，kernel-developer 拥有 `packages/core/agent/src/` 的本稿窄接口及对应测试；capability-developer 顺序交付 `packages/session/session/src/` 数据/事件/纯 fold 与对应测试 | 本稿/治理对应面受审接受；已验证 work-data、最终 records。先让公开编译边界存在，再以错 tenant/非法转移/旧候选/跨包端口错配真正 RED→GREEN；共享接口实际打包、独立消费者编译后才给消费者并行施工。声明通过不开放运行 |
| R1 agent，kernel-developer 独占 `packages/core/agent/` | 真实 P1 writer/admission/diagnostics、R0；SR attachment/访问提供者未齐时只能完成边界符合性，不能宣称产品激活。按 S02/S03/S09 先双激活/晚到准备 RED，再真实 Cordis 准备/退出 GREEN，补通知重入/自等待/失联 |
| R2 Session，capability-developer 独占 `packages/session/session/` | 真实 P1、已交付 TG/AU 当前根/管理面、本机身份适配、R0/R1 公共产物。S01/S04/S05/S06：真实 create/enqueue→单 batch/Run→唯一 Step→控制/停驻恢复，逐项 RED→GREEN；交付 SR 的 attachment/RuntimeAccess/TG-AU 工作事实映射 |
| R3 persistence，infrastructure-developer 独占 `packages/session/persistence/` | R0 事件/纯 fold、真实 records reader/jsonl；S07/S10 用真实 journal kill/reopen、错误版本/同批缺项 RED→GREEN；不自带写提供者。可与 R1/R2 后续行为并行，恢复安装须等真实 SR 根 |
| R4 projection，capability-developer 独占 `packages/session/projection/` | R0/R2 的确认事件、权限快照交接；S01/S08 的缺投影/错 checkpoint/撤回/读权改变 RED→GREEN。完整视图不承担授权，直接扩展原 fold，不能等 P3 再补 SR 可读历史 |
| R5 最小节点装配，application-developer 独占 `apps/local-harness/` 中派定身份/启动/CLI/确定性驱动及普通流程测试；verification-developer 独占另行派定组合/故障测试文件 | 真实 P1、R1–R4、TG/AU/BG 管理/消费产物、真实 TL/local-execution 与资源权限。S01–S10 适用子场景、真实文件闭环及独立 tarball；文档给可启动命令/提交后交接，ask 可保持明确 unavailable。绝不把测试 fixture 放进可交付装配 |
| R6 本批后续，原 SR/TL/HD/Loop owner 各自写原包 | 真实 HD/request_wait/answer_consequence 和 TL 停止协议，完成 S06/S11–S13 的完整审批/动态/控制；M2 接实际 MC/OpenRouter/deferred receipt。必要 AR/SR 安全门不延到此阶段才实现 |

R0 是顺序固定共享面，不意味着两作者可同时写 agent/session 公共文件；固定后
R1/R2 按它并行实现互相需要的注入面，真实 AR+SR 组合是共同接受门，不要求
一方先以替身宣布产品完成。完整包交接后原作者继续负责本包。Root/整合者只整合配置与装配选择，SR 跨能力状态转移
由 SR owner 实现，应用确定性 driver 只调用已声明操作，不私自提交 records。

| 尚未交付依赖 | 提供者、必须固定的形状与解除开放门 |
|---|---|
| 实际 P1 | records 作者交最终端口/codec，diagnostics 作者交 D1；jsonl/admission 作者交真实双视图/锁/失败/恢复和 O09/O10。A05–08 对真实组合通过前 R1/R2 不开放目标运行 |
| 可信身份/派发意图 | application-developer 的本机凭据 owner 实现 AuthenticatedInvocation 与同 gate 撤销；SR 实现受限宿主派发意图/RunDelegation。P2 可先交实际模块、P3 再接 IPC；两凭据/撤销/伪造句柄须真实验证，不能把必要身份完全推迟到 P3 |
| 当前 TG/AU 与对象权限 | TG 当前成员/定义选用/权益和具名 emergency_control；AU busy_input/所需配置及真实 grant；SR 对象政策/委托映射。与治理稿共同接受权限词和各声明的唯一导出归属后编译；不通过 preset 表冒充管理路径 |
| 原定义到 Factory/driver 的装配 | 部署可信定义解码器/Factory owner 提供精确 DefinitionVersion→factoryKey/实现/必要服务/driver 协议，TG 检查实际选用/use；正文不是可执行脚本。缺失/不兼容返回 unavailable，不换默认 Factory |
| 工具资源/本地执行/预算 | TL/资源 owner 提供真实冻结 Action/当前资源 mayPerform/mayDelegate/精确绑定及调用事实；BG 提供真实本地零计费来源与准入；local-execution 持久接纳/停止账本。最小节点前必须实现 allow、结果恢复、unknown 与迟到停止，不能只交 DTO |
| HD | HD 作者提供 request/decision/后果权威、同批片段与对原 source 的消费；SR 上表 wait/consequence/control 提供者先就绪。没有真实 HD 时 ask 禁止执行；完整 M1 前须 S11 全部通过 |
| 模型 | MC/Loop 作者提供模型选择资格、请求/结果/停止事实和真实 M2 驱动；SR 消费与 TL 同等的原 attempt/epoch/停止义务。确定性节点不依赖 MC，模型路径未实现明确 unavailable |

本稿提出的身份协议/对象政策/Factory 映射是需要共同接受的接口选择；它们的当前
实现状态为未交付。可独立完成记录/fold/反例准备，不把临时端口替身或“接口已
验证”当作最小运行资格。没有这些依赖的真实产物和对应门，交付状态保持 blocked/
未开放，不能仅以 P2 包分别全绿进入应用。

### 必须实际运行的反例

| ID / 原验收 | 刺激 → 必须观察的结果与测量 |
|---|---|
| S01 / A01 | 两真实凭据/两租户（相同 sessionId）、同租户管理者无正文权；跨 tenant/伪造 caller/delegation、原回执/订阅重放；当前权限撤回与读/activate/Step 同门竞争 → 无存在/计数/正文泄漏，旧 joinedRevision 不复活；不能只测 parseData |
| S02 / A04 | 同宿主两个 Context/Registry 入口并发 activate 同 Session，另 tenant 同 ID；资源准备在屏障暂停，owner close/attachment revoke 后归还 → 只一占位，另一 tenant 独立，晚到原资源被原 attempt 持有并清理 |
| S03 / A04/A18 | 实际 Cordis 4.0.2 effect、订阅/计时器/受管任务；activated 抛错/异步拒绝/重入 close，必要 binding 撤除和清理失败后再激活 → 发布不可否决，真实资源未收口前冲突，旧 handle/disposer 不控制新代；Fiber 状态不足以通过 |
| S04 / A09 | 真实 queue/run/session streams；并发 edit/reorder/withdraw/enqueue 与两个 takeBatch；同 operation 重试及同键异输入，fsync 挡住 → 一个冻结有序 batch/Run/占位；未取批/撤回版本不入上下文，pending 不启动 driver |
| S05 / A09/A17/A08 | 两个 ready continuation/两个 acquireNextStep，hold→clear 均未耐久、撤权 n+1 与 Step n 同步失败/成功 → 单驱动、正向事实不早用、n 耐久且未精确取消可继续，新位置不能穿过撤销/缺口 |
| S06 / A17/A16 | 精确 interrupt/cancel/force_stop/resume、stop 与真实成功结果竞争、start 尚在途中/inspect not_found、continueQueue 在 stopping 期间 → 真实 stopped/隔离前不放占位，unknown 独立；旧 epoch 不写有效结果，已成功不被改中断 |
| S07 / A17/A19 | 真实 journal/工具文件，取批/工具接纳/效果/结果回执各窗口 kill→持锁恢复；重新附着同 Session 并查原 Run/call → 已完成不重复效果，未明 attempt unknown 不重发，新 epoch 拒旧提交；真实调用者当前资格重检 |
| S08 / A09/SR-13 | 删除可重建投影、错误 Session checkpoint、未知 event/schema、同 key 同版不同贡献、旧撤回器 → 原事实仍在，坏版本依赖入口 unavailable，重建水位可核对，新贡献/权限不被旧对象改变 |
| S09 / A04/A17/A29 | 自关闭等待、在途准备/移交回执丢失、订阅晚到、A 使用 B 且 A 清理失败、原 TL 独立持有 unknown → 自等待拒绝；未确认移交保留原 owner，确认后可释 Agent；保留失败依赖和 cleanup 可查询 |
| S10 / A05–08/A28 | 真实多 owner batch 中 SR 或 HD/TL publication 违规、磁盘/审计/诊断同时失败、旧 writer/准备票据 → 不半发布、不提前效果、不丢原 unknown/使用；committed+blocked 不改称未提交，恢复同水位再开放 |
| S11 / A12/A15/A17 | q1/q2 真 HD 待答，释放 Agent/重启，先答 q1（含 reject）再答 q2，期间 interrupt/hold/cancel → q1 独立耐久串行接续，q2 不被清掉，Run 不提前 completed；答案不清全局阻塞，取消后不复活 |
| S12 / A18/A29 | 定义/Factory/工具准备换代失败与成功、依赖失联/重现、已准入 pin、旧 provider 清理迟到；100 次等待/关闭/恢复循环 → 无同名跟随，真实任务/订阅/timer/fd 回到基线或逐项具名 retained，等待无模型忙轮询 |
| S13 / A24/A30–32 | 真实公开 tarball/独立确定性工具消费者跑最小闭环；M2 后实际 wire 中 q2 deferred receipt 与 q1 结果并存 → 无 baseline 绕门，原 call 不重发，未执行的 M1/M2 子场景单列，不由编译/源测试抵扣 |

这些是施工验收输入，当前均 **未执行本稿产品符合性测试**；S10 的 P1 已有机制
场景也必须在真实业务 owner 接入后验证。两进程 writer 排他沿 A06，两个 AR/SR
调用入口沿 S02/S04，二者各测自己的权威，不能以进程内 Map 假锁抵扣。

## 作者检查与评审请求

作者仅修改本页，暂存证据在 `tmp/session-runtime-design/`。检查基线为 de39a86，
`make docs-check BASELINE=de39a86` 已通过 404 份 Markdown 及其关联检查；
`git diff --check` 通过，允许路径核对仅含本页。使用本 spoke 的 `uv sync --locked`
环境，未修改根锁。最终提交前对最终文字重跑上述文档/路径检查，日志保留于该 tmp。文档检查只证明结构/引用，不接受架构。
独立 architecture-reviewer 由整合者安排，重点核对 AR/SR 同门映射、权限/委托、
停驻与终止差别、TL/HD 多 owner 关系、恢复权及最小节点依赖；本作者不自行接受。
