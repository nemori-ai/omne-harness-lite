# ACK 与模型副本的确认释放

2026-09-29，revision 2，**candidate，未接受、未技术采用、未实现验收**。节点及已有源码仍是 `packages/model/model-request-runtime`。本页扩展现 P-2 `modelRuntime`、ModelCallHost、调用容器、共同 codec 和结算协调器，不建立新 provider、通用内容/GC 平台或正式 Session/Run。

## 输入、状态与实现路径

已核 [catalog](../../../../registry/catalog.json)：RT12=`capability.model-request-runtime/v12`、MS8=`data.messages/v8`、MR11=`data.model-response/v11`、CA4=`data.call-accounts/v4` 均为 candidate，同 baseline `omne-harness-lite-design-2026-09-15`；SL3 保持 accepted。正文依据 [RT12](../../../../spec/capabilities/model-request-runtime/v12/contract.md)、[MS8](../../../../spec/data/messages/v8/contract.md)、[MR11](../../../../spec/data/model-response/v11/contract.md)、[CA4](../../../../spec/data/call-accounts/v4/contract.md)。需求是 PF-013 rev17 §6.19；技术边界取 [正式 brief](../../../../record/proposals/model-runtime-reference-lifecycle/ack-spec-construction-brief.md)、[技术选择 r2](../../../../record/proposals/model-runtime-reference-lifecycle/ack-technical-choices.md)、[四表](../../../../record/proposals/model-runtime-reference-lifecycle/ack-reconciliation.md) 和 [独立架构评审](../../../../record/proposals/model-runtime-reference-lifecycle/ack-architecture-review.md)。该评审只评价提案，不接受本节点或证明实现。

[D110](../../../../record/decisions/model-runtime-reference-lifecycle-adoption/decision.md) 已采用 v20 revision 2；[v21](v21-image-preparation-design.md) 图片异步接入沿其采用边界。本页以单轨候选取代 v20 的“模型私有无 GC、副本默认永久保留”部分，未 ACK 保证和图片准备的原执行所有权不变，旧文件保持原字节。当前源码的 `service-types.ts`、`service-runtime.ts`、`service-plugin.ts`、`service-container.ts`、`service-reconcile.ts` 已存在；ACK、保留控制与本页新表/类型/操作尚未实现，不把 T29 的采用当作这些代码已交付。

Cordis 使用 [D025 的官方 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。存储继续用现 `packages/core/storage/src/protocol.ts` 的 Storage.write/read、WriteTx.lockRow/lockSentinel、narrow 与迁移组合；不更换数据库，不把现 JSONL SessionLog 的 append 包装成 Storage 事务。所有下文新增接口、表/列/阶段和内部方法名均为**候选**。

本批配置政策：必要配置、受信来源或能力缺席不可核时，相关路径 unavailable；显式输入非法沿 RT12 invalidInput，不填默认策略、容量、超时或权限。构造必须暴露缺失项，不能发布伪可用清理器；不改变未受影响的已有静态类型/Schema 初始化错误处理。清理重试/唤醒使用显式可配置策略与可替换调度构件，公平调度和存储最终可用是进展前提，未作无条件时限承诺。

## 契约到公开面与 Cordis 投影

| ID／责任 | 操作、插件或兑现位置 | 实现及采用范围 | 依据／缺口 |
|---|---|---|---|
| A22-P1：RT12 S-95/S-96 | 现 service 新增 acknowledgeCall，当前 callAccess 增 action=ack | 原 P-2/root/plugin forwarding；候选为第十五操作 | A22-V1/V2；ACK 不由零 consumer 或 release 推导 |
| A22-P2：RT12 S-96/S-98；MS8 S-58/S-59 | 同调用保留门、原 ACK 批、日志确认后 Storage 事务释放 | 本包私有 ModelCallRetention/Content；真实 Storage 与 SL3 分域 | A22-V3～V7；共同对象写明，非跨库事务 |
| A22-P3：RT12 S-97/S-100/S-101 | 所有指定读、wait、同键 open 的 acknowledged 分支 | 原 call-state/history/reads/reconcile/creation projection | A22-V8/V9；不从旧缓存重新给全文 |
| A22-P4：RT12 S-98/S-102 | 原 host 任务留存、读写许可、内存引用与外部额外保留清理 | 原 preparation/container/observer/assembly owner；无新 fiber | A22-V4/V6/V10；actual stopped 非 abort/Map absence |
| A22-P5：RT12 S-99；MR11 S-46/S-47 | settleReply 可选 retainedResult；独立授权消息写方原同批 persisted | 原 coordinator/两个 core 关系 judge + MS8 语义摘要核验 | A22-V11/V12；不开放 persisted 或 anchored 控制 |
| A22-P6：RT12 S-99⑧/S-103 G-42 | 已实际开始的新 final 原批耐久暂存与自动释放 | 本包私有 ModelCallSettlementWork；[候选接缝](../../../../record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md)已定点评审、修订后可接受；接缝 revision 2 已落地，待主调度复核采用（评审页 `record/proposals/model-runtime-reference-lifecycle/ack-seam-review.md`） | A22-V13/V14；A22-G2，不提升接受状态 |
| A22-P7：CA4 S-43；RT12 S-101；MS8 S-57 | 按 ResponseId 先选 final > ACK witness > ready，再原费用算法 | 原读面/费用消费者；纯 summarize 不改签名 | A22-V15；不同发出不按 CallKey 合一笔 |
| A22-P8：MS8 S-56；RT12 S-100/S-101 | 原 creationInput 和自持 Pending 的角色化语义摘要 | 复用 core messages 唯一摘要定义/公开构件，不在 runtime 重写算法 | A22-V9/V11；原 UTF-8 bytes hash 不作语义比较 |

## 公开接口与唯一增量账本

MS8 独占 CallKey、CreationKey、ModelCallSemanticDigest、ModelCallAcknowledgedRecord、ModelCallAccountingWitness；MR11 独占完整 PendingModelResponse。AckTarget 是 RT12 技术值，代码形状从 MS8 ACK record 的 target 取同定义投影，不再写一套不一致联合。候选服务增加：

摘要创建/核验只调用 [messages v8 候选](../../core/messages/v8-acknowledgement-design.md) 的 `createModelCallSemanticDigest(role,value)`／`judgeModelCallSemanticDigest(role,value,digest)`，runtime 不另写 hash/规范编码。MR11/CA4 的消费边界分别沿 [response v11](../../core/model-response/v11-acknowledgement-design.md) 与 [accounts v4](../../core/call-accounts/v4-acknowledgement-design.md)。最终直接资源边已核为 MR11→MS8/CA4、MS8→CA4；其他旧精确 MP/CB/LC 引用按实际可达定义保持，不采用过渡错误资源边。

```ts
type AckTarget = ModelCallAcknowledgedRecord['target']
type AcknowledgeCallInput = {
  readonly ref: CallKey
  readonly expectedResult: AckTarget
}
type AckPendingReason = 'writer_in_flight' | 'read_in_flight'
  | 'receipt_unknown' | 'storage_unavailable' | 'external_retention'
type CallAcknowledgement = {
  readonly ref: CallKey
  readonly target: AckTarget
  readonly acknowledgedAt: ModelCallAcknowledgedRecord['acknowledgedAt']
} & (
  | { readonly cleanup: 'pending'; readonly pendingReasons: readonly AckPendingReason[] }
  | { readonly cleanup: 'released'; readonly pendingReasons?: never }
)
type AcknowledgeCallResult =
  | { readonly acknowledged: CallAcknowledgement }
  | ServiceInvalidInput | ServiceUnavailable | ServiceCallNotFound | ServiceWrongPhase
// ModelRuntimeService 新增：
// readonly acknowledgeCall: (input: AcknowledgeCallInput) => Promise<AcknowledgeCallResult>
// SettleReplyInput 原 disposition 域保持，仅新增：
// readonly retainedResult?: PendingModelResponse
```

pendingReasons 在运行时强制非空、去重且只来自当前真实阻碍，不能凭数组形状声称成立。acknowledgedAt 取原 ACK 事实，不用重试时钟改写。受信当前主体从原装配捕获，不接受 caller 的账、清单、摘要、ackAllowed 或 actor 覆盖。入口顺序沿 RT12 S-96；命中同 ACK 仍重新核 action=ack。服务关闭执行准入不阻合法耐久 ACK/清理认回，没有必要来源才 unavailable，不新增 runtimeStopped 到 ACK 失败集合。

候选 CallReadView 增加互斥 `acknowledged` 分支，包含 CallAcknowledgement、原创建 origin、terminalState、来源 generation/progress 与 attempts 小结果序列；具体字段取 RT12 S-97，不在旧完整 view 加一个可忽略布尔。attempts 每项保留 ResponseId/dispatch、原账 origin、outcome、Usage/Cost、credentialScope/provider/timing/已知 upstreamRequestId，以及当前真实 final 处分/late 或 disposition_pending。禁止创建输入、完整 route/profile/参数、reply/delivered/raw/inputCalibration。无 dispatch 确知为空，不因来源失败填空。

| 原入口／新增入口 | 候选迁移点及交付责任 |
|---|---|
| legalTargets/displayList/effectiveModel/selectModel | 保持现读/切换；不依 ACK 大 payload，不由 ACK 获新工作权 |
| openCall | 相同 creationKey 已 ACK：当前创建资格→原关联及原输入语义摘要→返回原 ref+acknowledged；不同值 creationConflict。不重算最新 basis/档案，不重新打开 |
| dispatch/dispatchAgain/canDispatchAgain | 先原资格/身份门，再 ACK 所代表真实终态；alreadyEnded，零新 lease/send/锚点；canDispatchAgain 不造新的 refused.why |
| interrupt/releaseCall | 真实终态 alreadyEnded；不将 ACK 解释为取消/工作放弃，不写第二终结 |
| acquireCall/consumer.wait | 每次先当前 read/wait；ACK 确认后直接小视图，不读取即将删除的正文，不使用 handle 缓存。只有确认前已进入真实复制的读取可完成原 owned-copy 或明确失败 |
| consumer.release/abort | 仍只释放自己的观察/等待；不自动 ACK、不占长期读许可；零 consumer 执行规则保持 |
| readAttempts/reconcile | 当前合法 ACK 先于旧 marker 的全文要求，返回小结果序列；按小锚点与来源核验，合法释放不造成整会话永远 unavailable。不隐式确认或自动恢复全文 |
| settleReply | 保持 non-persisted disposition；ACK 后无 final 必填 retainedResult。已有同 final 认回不再索全文，异处分 alreadyEnded；ACK 前给值必须与原权威值相等 |
| acknowledgeCall | 第十五操作；唯一 ACK 任务，确认后 runtime 耐久负责清理，不等 caller 再来 |
| host.close/service.close/recovery | 拒新执行、排空真工作与原批；保留确认/清理任务可认回；不以关闭屏蔽尚可用的耐久读，不以 fiber 消失宣称 released |

独立公开 invokeModel 没有 Session/CallKey 或本包耐久副本保管，不增加 ACK 义务。原 failure consumption、实际原 Run 来源、noRun 及输入计量仍沿既有接口；本页不让后继消费方重新占有原工作。

## 同一 Storage 的保留门与许可

候选 `ModelCallRetention(tenant,session,callId)` 是**所有模型副本读取、旧发布者、确认准备与删除共同触碰的存储对象**；包括 generation、保管 phase（retained/retiring/acknowledged/released）、ACK task/batch 定位、精确 releasablePayloads、创建语义摘要/最小 origin/target、实际许可集合和清理进度。它不另定义执行终态或 ACK 事实；ACK 权威仍是原 Session 日志。

候选 `ModelCallContent` 在 v20 私有行上增加明确 call ownership，保持 locator/version/kind/digest/原 bytes 不可变。现存Content复合唯一约束只防同时冲突，不承担删除后的历史不复用。分配身份必须含不可复用CallKey及该retention行中只增不减的分配序号；分配计数的推进与新Content创建在同一Storage事务，ACK清理不删除该小计数/原精确清单，不回退或重绑旧序号。locator/version是该身份的稳定投影，历史身份即使payload删除也不可再次分配；每条内容和许可引用同一 retention 主键，删除语句限定完整 tenant/session/callId/locator/version/digest，不按 Session 前缀扫删。需要拆许可行时，候选 `ModelCallRetentionUse` 只存 useId、ownerGeneration、kind=read/publish、真实任务关联与状态；其外键/事务域归同包同 Storage。不是依靠进程 Map 计数的另一套锁。

每个准入操作在 Storage.write 内先锁已有 retention 行；首次建立用显式 sentinel 或唯一插入冲突认回，不能对不存在的行调用 lockRow 后假称已锁。phase 与 generation 核准后才登记精确许可；清理也在相同行锁下判准入与许可。SQL 事务不跨网络、JSONL append 或 consumer 业务处理长持；外部在途期间由**已提交的许可记录**阻止删除。

读许可只覆盖真实 content bytes 读取、摘要/形状/来源核验与 owned-copy 形成。进入许可后才取全文；copy 完成或明确失败就释放自己的 useId，已经交付的独立值归 consumer，不再算模型保管。闲置 ref/handle/wait 没有许可。ACK 准备者先以自己的真实读取许可固定原输入/结果，再在同门下转 retiring 并登记唯一 ACK task，关掉新读/发布；自己的源读取完成后同样释放，不把 ACK task 留成永久读占用。

旧 created/ready/final 写方在第一次取得将发布内容前必须登记 publish 许可，跨异步构造和实际 append 保留原批/任务。许可解除要求真实任务停止，并已确认结果或有唯一恢复 owner 接手原批；未知回执不能先撤许可。retiring 拒绝新依赖模型副本的写者，但不伪称旧许可已失效；已进入的原写方可以按原同日志合法性完成。ACK 后自持原值的新处分不取得旧 content 许可，走下节独立新写责任。

存储许可不自行证明进程还活着或已死。原 ModelCallHost 保有每个 useId 对应的实际 Promise/receiver/writer stop 责任；同进程在真实完成后用精确 generation+useId 撤除。跨进程由原恢复装配提供可靠旧进程/连接/追加者已退出及唯一接手证据，才清除旧代许可并恢复任务；超时、attempt fence、Map 空、取消信号、插件卸载都不够。不能证明则保留真实 pending/unavailable，A22-G3 仅阻缺该来源的恢复路径。

## ACK 发布、清理与 unknown

1. 当前授权与真实终态/目标核验后，取得原创建/结果完整值，复用 MS8 摘要编码；ACK 壳取 created 原 origin，witness 取 terminal ready/dispatch 原账 origin。tenant/session/run 与 CallKey 一致，合法跨 attempt 两壳 attempt 可不同；不整壳盲等，不换成 ACK caller 的 Run。
2. 同门进入 retiring，固定唯一 ACK 原批、种类域判重键及原目标。若无可独立读取 final，必须把完整 pending 的语义摘要和 MS8 最小 accountingWitness 一起固定；final 竞争先赢也不删改这份已固定 witness。清单由本包真实 ownership 得到，caller 不供清单，unknown 不补空。
3. ACK append 使用 SL3 unfenced+tailEquals；读同源完整合法前缀核目标及原来源。尾变重读后仅更新追加条件，不重生成 acknowledgedAt、摘要、清单或不同 ACK 内容。原权限准入沿 v20 的可信当前 action 协议覆盖原写者及 append/撤权先后，**不要求授权 SQL 与 JSONL 同事务**。
4. ACK 返回/认回持久确认才是线性化点。随后在 Storage 中记录原 ACK 位置/批定位、进入 acknowledged；这步失败不撤回日志 ACK。重启/读面发现原合法 ACK 可补认回控制状态。未确认 unknown 时返回 unavailable，保存原 ACK 批/键/许可/内容；停尽原可能 writer 后有批认回、确无批才重送同批，不能重建任务。
5. 已确认后清理器取得原精确任务，排空旧实际读/写和外部额外保留，主动清 runtime 的大引用；在同一 Storage.write 锁 retention、重核确认定位/generation/许可和所属内容，删除精确本调用内容并更新 released。事务失败保持原状态；成功回执未知从同存储行认回。日志 ACK 与此删除从来不是一笔事务。
6. 回复 ACK 前实际尝试一次清理或读取已有清理结果：能删则 released；有真实阻碍才 pending 及其闭合原因。不能把“还没调度”编造成 storage_unavailable。删除提交仍未知为 receipt_unknown，真正存储故障为 storage_unavailable；旧 writer/read/external 分别对应其精确责任。ACK 已确认但进度存储不可读，返回 acknowledged+pending/storage_unavailable，并留恢复任务；只有连原 ACK 来源也无法核时整个操作 unavailable。

确认准备可撤回的唯一分支：权威完整来源证明 ACK 未提交、所有可能原 ACK writer 已真实停止，且原当前授权/显式政策不再继续；在原 retention 行核 generation 后恢复 retained，原内容不删。ACK 已确认不可回退；旧 worker 迟到更新须比较 taskId/generation/原 ACK 定位，不能回写新代 phase。

清理任务由现 assembly/host 的耐久恢复责任持有；显式策略在启动、ACK 确认和来源恢复时调度。必要 storage 最终可用、真实工作最终停、实际外部额外保留可解除与调度公平时必须 released，不等历史 consumer、Run 结束或未来处分。没有默认 noGC 开关。策略耗尽可以中止本轮尝试并报告 pending，不删除耐久待办或把 pending 永久成功处理。

## 清除模型私有大引用

发布 released 前，候选本包 release-barrier 关闭该 ref 的全文路径并清除：CallContainer 的 request/messages/tools/固定 profile、pending snapshot、完成的 invocation/outcome Promise 引用、callFacts/creation/result cache、observer 尚未真正交付的队列项、诊断临时正文以及 idle handle 捕获的大 view。consumer handle 闭包只保留 ref/精确实例标识和访问入口，后续 wait 每次查当前门，不闭包捕获旧完整结果。需要真实 drain 的 receiver 仍算实际读取/投递任务，实际 stop 前不得假 released。

对已交付 owned-copy 的 caller Promise/自持值不追删；但 runtime 自己保有同一 resolved Promise/闭包不得再通过它永久持全文。清理证据检查可达持有关系与容器计数，不要求某时刻语言 GC 已回收内存。ACK 准备中用于算摘要的临时完整值同样在固定小批后退出模型持有；由副本交付保留的历史 handle 不成为等待条件。

仅释放模型额外取得的外部 AttachmentRef/raw 保留责任。真实提供者必须给精确所有权与配对 release，两个调用共享内容不得删对方；不能确认解除时 pending/external_retention，记录真实 provider/owner 责任。inline 路径没有此依赖，不为未启用外部内容平台造全局阻断。原 JSONL marker、final、AssistantMessage、补账字节一律不删；合法 ACK 后旧 payload 定位可显式 released，缺 ACK 的缺失仍是原损坏/不可用分支。

## ACK 后真实处分的原批责任

本节投影 RT12 S-99⑧及[候选接缝](../../../../record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md) revision 2 的 R1、R3、R4（B3 见选择表）。接缝已定点评审、修订后可接受；接缝 revision 2 已落地，待主调度复核采用（评审页 `record/proposals/model-runtime-reference-lifecycle/ack-seam-review.md`）；状态保留 A22-G2，不视为接受。ACK 前原权威 pending 不可被 caller 值覆盖；ACK 后已有 final 优先按同/异处分认回；无 final 必须 caller 自持完整 Pending，经当前 settle 资格、原身份/origin、MS8 结果角色摘要、witness 和 MR11 全值判断，才开始新写责任。缺值 wrongPhase；形状/摘要/身份可判矛盾 invalidInput/malformed；来源不可核 unavailable。摘要不能重造全文。

候选私有 `ModelCallSettlementWork(tenant,session,callId,response,workId)` 仅在**实际新处分开始**建立，保存原完整 `[M,R]` 或 `[R]` 批、原键、授权/来源定位、generation 与实际 writer 状态。选单独私有表而非复用已删除 ModelCallContent 的 locator/version，避免恢复旧领取面；不是新 service/journal 平台，也不在 ACK 时预存未来可能需要的全文。首次可能追加前 Storage.write 确认原批已耐久；该提交未知就先认回自身原行，不发 JSONL。来源/资格确认仍必须覆盖实际追加准入，暂存本身不是写权。

**该行保存的是「最近一次结果尚未确知为零写的追加所用完整批」**（接缝 R1），不是曾经构造过的任一批。[S-70④](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果) `tailChanged` 确认该次整批零写、经 [S-71](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-71-争用政策与责任保留) 策略准许重构 `late` 后，重构批须在新追加可能生效之前，于同一 Storage.write 锁该行、核 workId/generation 后原位替换并确认耐久；替换提交未知同样先认回自身行，不发 JSONL。先前追加回执未知（S-70⑤：`unavailable`、丢回执或仍在途）期间**禁止覆盖该行**——那一批可能已提交，是恢复认回的唯一依据。S-99⑧ 本身未写这一精确含义，接缝 R1 已将其记为 v12 版本外勘误、待下一版本并入；本节点按此兑现，不另立语义。

原合法 persisted 写方继续独立核消息写权/真实系统转换来源，组合 messages 的唯一回复关系 judge 与 model-response 的 pending/final judge，取得原协调器窄资格后同日志同批写 M/R；ordinary settleReply 的 disposition 仍排除 persisted，ref/acquire/ACK 不授 anchored 控制。原 pending.reply/calibration 保真，final 只增真实处分/late；ACK 不伪造 consumed。

JSONL 回执 unknown 或旧 writer 未实停时保留 SettlementWork 与原批；崩溃恢复只从这份已经实际开始的暂存和原日志认回，不能取已删 ready 或重跑转换/外部消费。confirmed final+所有可能 writer 停止后，同 Storage 事务删除该 work 及仅为它取得的暂存引用。原写方未崩溃时按原显式结算策略处理：实际全部停、权威完整前缀确证无原批且策略结束本次写责任，清除并返回 unavailable；策略继续则沿 S-70/S-71 原批/允许的 late 重构（上段 R1）。未知不等于零写，不能因新重试碰撞或策略耗尽丢旧批。

**崩溃恢复的默认路径**（接缝 R4，本节点选定）：恢复 owner 先使本次写方实际停止（停止信号、卸载开始、fence 都不算，[S-70⑤](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果)）→ 读权威完整前缀 → 读得本原批按已确认收口，final 确认后删 work；权威读确证缺席则**结束本次物理写责任**、返回明确 `unavailable`、删除该 work，消费者持自持值按 [S-99](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-99-ack-后的真实处分与-retainedresult) 重调 settleReply，以新 workId 开始新的写责任。暂存行或日志读不到按 `unavailable` 保留 work，不作缺席证明。「策略继续、由恢复 owner 代重送」**不是默认**，只作 [S-71](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-71-争用政策与责任保留) 策略的显式选择；选它时，重送前按 work 行记录的原主体与授权定位在当前访问装配重核 S-99② settle 资格——原写方取得的资格不随暂存行转给恢复 owner，资格不可核即 `unavailable`、不重送。ACK 前 final unknown 的 v20 同批重送路径不变，本段只管 ACK 后的 SettlementWork。

新的实际写责任独立报告诊断与暂存字节；原 ACK cleanup=released 不回退，旧 ref 不通过暂存重新领取全文，无需第二 ACK。确认成功或证真结束后自动删暂存，禁止常驻恢复缓存。首次删除随终责确定执行；删除失败或删除回执未知时（接缝 R3），该 work 行本身就是耐久待办，与 retention 行「acknowledged 未 released」同归上文 ACK 清理的**同一套耐久待办、同一可配置策略对象与同一唤醒入口**（启动、来源恢复与策略调度），不另建待办表或计时器；每次重试以 Storage.write 锁该行、重核终责条件再删。删除回执未知从同一行幂等认回：确切读到该行已不存在才算已删，行仍在按同一策略重试，读失败按 `unavailable` 保留待办；不重复报成功，也不因一次读失败宣称已删。该小范围 recovery 是 G-42 的兑现点，不扩充消息、Run 或外域生命周期。

## 账选择与来源当前性

读面复用 v20 的 SL3 readByKey 权威 tail 双读、受信 generation 和投影 watermark 当前性。ACK 投影先于旧 payload 的解析要求；当前日志已确认 ACK 但索引过期时追尾/认回或 unavailable，绝不再交私有缓存全文。pendingReasons 来自当前保留门和实际任务，不能从 ACK 记录捏造删除进度。

按 `(原Session,ResponseId)` 选合法 final，其次 ACK witness，其次可验证 ready；同时可得的来源逐字段核原账身份、dispatch/origin/outcome/Usage/Cost/credentialScope/provider/timing/已知 upstreamRequestId，矛盾不被优先级掩盖。合法删除后不为检查 witness 再读已删全文，核原 ACK/小锚点及当时已验证的摘要/来源即可。创建壳与账壳各核各的 attempt，不能借不同合法 attempt 拒绝真实 witness。

选完唯一原账再用原有效费用、补账和 summarize 算法；witness 不是已应用补账的总数。先前每次 failed final 各保其 ResponseId；ended 无响应不造见证。后继 final 替换账来源，不再加一笔；unknown 保持 unknown、晚补账归原 Run/Session，不改为新 ACK consumer 的归属。

## 存储要求与装卸配对

| 条款 | 对既有存储/日志的要求 | 双方共同对象与失败 |
|---|---|---|
| RT12 S-98/S-102 | 同 Storage 的锁定准入、唯一 use/task、行所属关系、原子删 content+released；小状态耐久、未知提交可认回 | read/publish/ACK prepare/cleanup 均锁 ModelCallRetention；Content/Use 为同域引用，不另靠 in-memory 锁 |
| RT12 S-96/S-101；MS8 S-58 | 独立 ACK 稳定键、整批原子持久、完整前缀/tailEquals、same-call 重复与异值冲突 | ACK 和 final 共同 SessionLog 顺序但各自键；SQL/JSONL 两阶段，不互称回滚 |
| RT12 S-99⑧ | 发前完整新批耐久、workId/generation 唯一、回执未知期间原批不覆盖、确认零写后的重构批于新追加前原位替换并耐久、终责后原子删暂存/标结束 | 新 final writer/恢复/暂存 cleanup 同 SettlementWork 行；旧 content 无需复活 |
| RT12 S-97/S-101；MS8 S-56；CA4 S-43 | 最小来源/摘要/确认定位及费用小值可读，原大内容删除不破坏身份索引 | open/读/账/清理认回同真实日志源；缺源 unavailable，不默认0/空 |
| RT12 S-98 | 启用外部额外保留时真实 owner 配对解除且不损共享者 | 外部 owner 自己的引用协议；本包只释放所持使用权，缺证据 pending |

| 取得的资源/贡献 | owner、可用时点 | 部分失败、撤除与保留 |
|---|---|---|
| 原 P-2 第十五方法/保留迁移 | 原 assembly owner 在构造前留存，依赖/迁移/必要配置就绪才可用相关路径 | 缺源具名 unavailable；不发布假清理成功；原关闭链统一负责 |
| content/read/publish 许可 | 真实 task 在取得 bytes/追加可能性前登记精确代际 | 创建许可未知先认回；释放只删自己许可，任务未停仍持有，重装不能清整桶 |
| ACK 准备/确认批与清理调度 | 原 host/恢复 owner；准备耐久后保有，日志确认后清理责任成立 | construct/append/Storage 故障保留原小任务；卸载取消本代调度入口，不撤 durable 责任，接手须唯一来源 |
| observer/idle handle/cache | 原 consumer/容器 owner；仅实际复制是读占用 | ACK 关闭新全文、丢未入读队列、排空真实接收；已交付 owned 值不回滚，idle 不 pin |
| 新 SettlementWork | 原真实 final 写方，发前耐久确认后可追加 | unknown 留原批；final确认+writer停或证真零写结束后自动清除；删除失败/回执未知时行留作 ACK 清理同一待办，按同一策略与唤醒入口重试，读到行不存在才算已删；卸载只取消本代调度入口，不撤该待办；无第二 ACK |
| 原 Storage/日志连接与权限入口使用权 | 原装配按真实任务保留；不能在 writer 排空前关闭 | 旧在途跑完按各次提交收场；实际 unavailable 留责，close 不当物理停止证据 |

依赖沿现必需 inject，不增可选 inject/service。依据 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（4.0.4，有 probe），重跑需从同代际的耐久控制/原批认回，不能重建另一次 ACK。依据 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（4.0.4，有 probe），不同 effect 不保证异步完成次序；先关准入、等真实任务、交接/留责再释放底层资源，放在原组合 close 里明确等待。Cordis 不替本节点取消在途或提供跨库事务，本页没有新增无 basis 的内核保证。

归装配：既有 examples bootstrap 的 Session identity-scoped assembly owner 承接受信本地身份/ack责任、时钟、Storage/JSONL、调度策略、实际 host stop 及重开；它不是正式 Session 实现。生产 ack/settle 当前权限与撤权次序归原访问装配；可靠旧进程停止/唯一接手归恢复装配；启用外部内容保留归该实际 provider；persisted 归原消息写方。缺外域提供者只限制相应路径，不扩建通用平台、不阻可独立交付的 inline/noRun 场景。

## 精确迁移、选择与缺口

| 消费者/现有位置 | 必须同步的候选变更 |
|---|---|
| src/service-types.ts、service-runtime.ts、service-plugin.ts、index.ts | ACK 第十五方法、当前 action、closed read 不 blanket 拒绝、acknowledged 联合、retainedResult；共享类型单一 owner，不保留旧 noGC 模式 |
| service-calls/reads/reconcile/control/dispatch、call-state/history、callFacts/creation index | 所有入口先核 ACK 与当前来源；创建摘要认回、终态禁止复活、历史小序列和 live 识别；不残留旧 marker 全文必读路径 |
| service-container、observer queue、anchored invocation、settlement coordinator | 每个旧内容读/发布取得同门许可；清原持有链；实际 close/unknown 留责；新 final 暂存/认回/自动删；work 删除重试接入 ACK 清理同一策略对象与唤醒入口，不另建计时器 |
| 本包私有 Storage migration/codec/log settlement | retention/content ownership/use/work 表与约束；MS8 ACK kind、来源/清单/摘要/witness 校验；不删除日志或改原记录 |
| core messages/model-response/call-accounts 消费 | 精确 MS8/MR11/CA4 资源与关系 helper；只编译各公开入口真正可达的 `$ref` 子图，不遍历所有依赖资源的全部 `$defs`；旧精确 MP/CB/LC 引用不为“最新”漂移 |
| 成本读面、诊断、examples 及双语 README | final>witness>ready 后原 sum；诊断只 ref/目标/phase/reason/任务进度，不打全文；保存→ACK→released→旧 ref 小视图→真实延后处分路径两语实际运行 |

不移植 v20 曾提出的整资源图编译前置，也不增加 transport 派生 DTO。Schema 资源依赖以本批最终校对的直接引用及最小可达图为准，公共操作不因资源边修正改变。示例 caller 在 ACK 前自行取得并保存 Pending；原 loop fiber release 不确认，明确 ack 才交接保管。实例替换重新用同 ref 读小状态；失去自持值时不能从摘要恢复，不能误教成“ACK 后可再次取全量”。

| 关键选择 | 落选方最强论据 | 本方弱点/置信度 |
|---|---|---|
| 原 service/host 加操作，无新 fiber/GC服务 | 独立 GC 插件可单独运维 | 原包需完整持有清理生命周期，但只有模型副本责任，无独立消费者边界；高 |
| 持久 retention 门+精确许可+日志后删 | JSONL与内容放同库可简化原子性 | 两提交域需认回和耐久待办；保留已采用日志/Storage边界，不假分布式事务；高 |
| 只保护真实读，不保护 idle handle | 句柄引用计数最容易编码、避免旧 consumer 取值失败 | 所有读取入口必须迁移，同句柄后续变小视图；兑现明确ACK后清理且不等离线consumer；高 |
| 独立 ACK 小批+摘要/witness | ACK与final合批更少状态 | 多一步账选择与摘要核验；避免伪处分并支持之后真实persisted；高 |
| 新 final 用私有 SettlementWork 临时行 | 复用旧 ready 永久保留可省暂存 | 增一次实际写入前耐久和自动清理；仅为已开始写责任保管，避免恢复旧全文领取；中，接缝已定点评审、待主调度复核采用 |
| 崩溃恢复默认「停写方→权威读→缺席即结束并 unavailable」，不代重送 | 恢复 owner 按策略代重送同批：与 ACK 前 final unknown 的 v20 同批重送一致，消费者不必重调 | 消费者须持自持值重调；ACK 前后两条恢复路径不同，实现按是否存在 SettlementWork 行分流；代重送只作 S-71 显式选择且先重核 S-99②；中高 |
| 真实当前 ack 准入，沿原必需 inject | 可序列化签名授权更便于离线调用 | 依赖当前来源；签名/ref无法单独兑现撤权和ack/settle分权；高 |

反例义务：① reader/publisher 先取得原门许可，ACK retiring/确认后清理必须等真实停；反过来 retiring 先提交，新 reader/publisher 必须被拒而不能持旧缓存开工。② JSONL ACK 已落回执 unknown→进程退出→重开，SQL 未记录 acknowledged 仍只能认回原批后删；没有合法 ACK 的同形内容不能删。③ SQL 删除已落回执丢失必须从 released 行认回；拆成删内容/标状态两事务的变异必须失败。④ ACK 先清原 payload，后继自持值的新 persisted unknown→崩溃，原完整暂存足以认回同批，final确认后自动删除；去掉暂存应失败。⑤ A：合法 `tailChanged` 后重构 `late`，未先把重构批耐久替换进暂存行就发新追加→崩溃，恢复只剩旧批；有限模型变异 `spec/capabilities/model-request-runtime/v-next/formal/validity-check/Ack-staleTemp.cfg` 去掉「追加前暂存行须持有将追加批」守卫，`RecoveredMatchesFinal` 必须失败。⑥ B：暂存行或日志读不到被当作零写而结束、删 work；同目录变异 `Ack-absenceUnreadable.cfg` 允许不可读时结束，`EndedMeansAbsent` 必须失败。⑦ C：ACK 前已取得发布许可的原晚 writer 先提交 final，新写不追加第二批——同处分认回原 final、异处分 `alreadyEnded`；work 仍自动删，`cleanup=released` 不回退。⑧ D：新写命中 `alreadyRecorded` 部分碰撞/身份不符/残批（S-70③）：不报成功、不补残批、不换 ID，work 保留、阶段未完成、返回 `unavailable`。⑨ E：旧 workId 的迟到 worker 对新 workId 行写或删，每条语句带 workId+generation 条件而被代际比较拒绝；新行不丢、不被覆盖。⑤–⑨ 即[接缝](../../../../record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md)反例 A–E：A、B 是 spec 侧否定配置，不登记 formal task、不作绑定，实现层仍在 A22-V13/V14 真实交错复现；C–E 只有 A22-V13/V14 的真实并发观察义务（[规格侧验证](../../../../spec/capabilities/model-request-runtime/verification.md)「真实并发验收义务」表）。以上均须真实并发/故障验收，不能以顺序 fixture 代替。

A22-G1：RT12/MS8/MR11/CA4及本节点尚未接受，主线 owner；不释放本增量实施。A22-G2：RT12 S-99⑧/S-103 G-42 的确认后新处分接缝已定点评审、修订后可接受；接缝 revision 2 已落地，待主调度复核采用（评审页 `record/proposals/model-runtime-reference-lifecycle/ack-seam-review.md`）；实际恢复证据仍缺，阻该分支，不能偷用已删 ready。A22-G3：S-95/S-98/S-102真实 ack授权、旧writer停止/唯一恢复和启用外部保留仍由实际装配核实，不由表/布尔完成；缺哪个仅阻对应路径。A22-G4：S-96～S-101 的 Storage/JSONL/内存释放及全入口迁移尚无实现验收，A22-V1～V16由runtime/存储/消息写方与独立验收 owner 完成。绑定新增0；源码存在、候选模型登记、架构提案无阻断均不关闭这些缺口。
