# Session 主干工作契约候选

本页是 [#342](https://github.com/nemori-ai/omne-harness-lite/issues/342) 的候选设计，尚未技术接受。已采用保证归 [SPEC](../SPEC.md) 与[状态转移](session-state-transitions.md)。此处的公开操作供内部接入协调者、Agent、恢复者及其他领域提供者消费；网络 SDK、宿主接入和人机界面由 #318 等拥有者承接。根入口目前没有这些操作的生产实现。

Session 保存工作身份、原位置、当前有效推进与逻辑终态。Agent 保存 Loop 的含义，Model/Tool 保存真实执行事实。Session 不把目录、通知、最大 attempt 序号或某个 Agent 对象当权威，不通过重放日志重新发效果。

## 值、当前工作与原位置

下列代码块组成同一候选声明。品牌身份和修订用于防误用；服务端仍检查来源、租户、对象关系和当前资格。Continuation 是 Agent 拥有的版本化数据，Session 只负责保管及受信校验。它不是任意回调，不包含 Context、Fiber、闭包或连接。

```ts
import type { Outcome } from '@omne-harness/kernel-basis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'

declare const sessionIdentity: unique symbol
export type SessionIdentity<K extends string> = string & { readonly [sessionIdentity]: K }
export type SessionId = SessionIdentity<'SessionId'>
export type RunId = SessionIdentity<'RunId'>
export type AttemptId = SessionIdentity<'AttemptId'>
export type InputId = SessionIdentity<'SessionInputId'>
export type BatchId = SessionIdentity<'SessionBatchId'>
export type SessionOperationId = SessionIdentity<'SessionOperationId'>
export type SessionRevision = SessionIdentity<'SessionRevision'>
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>
export type EntryId = SessionIdentity<'SessionEntryId'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type DurableEvidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type AgentInstanceRef = Readonly<{ owner: 'agent'; id: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId; session: SessionId }>
export type Mutation<P> = Access<P> & Readonly<{ operation: SessionOperationId }>
export type AdvanceRef = Readonly<{ run: RunId; attempt: AttemptId; instance: AgentInstanceRef }>
export type AdvanceWrite<P> = Mutation<P> & Readonly<{ advance: AdvanceRef; expected: SessionRevision }>
export type Continuation = Readonly<{
  position: string; definition: Adoption; schema: Adoption; value: JsonValue
}>
export type ProducerRef =
  | Readonly<{ kind: 'model'; call: string }>
  | Readonly<{ kind: 'tool'; call: string }>
export type CallBinding = Readonly<{
  producer: ProducerRef; action: string; consumer: ConsumerRef
  request: DurableEvidence; initiatingAttempt: AttemptId | null
}>
export type ProducedResult = Readonly<{
  producer: ProducerRef; version: string; delivery: string | null; source: DurableEvidence
}>
export type ResultConsumption = Readonly<{
  result: ProducedResult
  custody: DurableEvidence | null; completion: DurableEvidence | null
  release: 'pending' | 'confirmed'
}>
export type Consumption = Readonly<{
  id: ConsumptionId; binding: CallBinding
  results: readonly ResultConsumption[]; resume: Continuation | null
}>
export type InputBatch = Readonly<{
  id: BatchId; boundary: SessionRevision; ordered: readonly InputId[]
}>
export type RunTerminal = Readonly<{
  run: RunId; outcome: 'completed' | 'failed' | 'cancelled'; evidence: DurableEvidence
}>
export type RunState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'active'; run: RunId; adoption: Adoption; batch: InputBatch
      advance: AdvanceRef | null; ordinal: string; continuation: Continuation
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type Waiting =
  | Readonly<{ kind: 'producer'; binding: CallBinding; position: string }>
  | Readonly<{
      kind: 'extension-batch'; passage: string; position: string
      members: readonly Readonly<{ action: string; card: DurableEvidence; decision: DurableEvidence | null }>[]
    }>
export type ControlTarget =
  | Readonly<{ kind: 'run'; run: RunId }>
  | Readonly<{ kind: 'producer'; producer: ProducerRef }>
  | Readonly<{ kind: 'session' }>
export type ControlProgress = Readonly<{
  operation: SessionOperationId; target: ControlTarget; intent: ControlIntent
  state: 'committed' | 'propagating' | 'reconciled'; pending: readonly ProducerRef[]
}>
export type ControlIntent =
  | Readonly<{ kind: 'control'; value: Control }>
  | Readonly<{ kind: 'interrupt'; run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence }>
  | Readonly<{ kind: 'auto-archive'; idleEvidence: DurableEvidence }>
export type RecoveryTask =
  | Readonly<{
      kind: 'initialization'; item: string; owner: string; protocol: Adoption
      input: JsonValue; originalOperation: SessionOperationId
      state: 'pending' | 'unknown' | 'failed'; diagnostic: string | null
    }>
  | Readonly<{
      kind: 'cascade'; child: SessionId; parentControl: SessionOperationId
      childOperation: SessionOperationId; intent: Extract<Control, { kind: 'archive' }>
      basis: DurableEvidence; state: 'pending' | 'unknown' | 'denied'
    }>
  | Readonly<{
      kind: 'routed-input'; originalOperation: SessionOperationId
      value: Exclude<RoutedInput, { kind: 'ordinary' }>; state: 'pending' | 'unknown'
    }>
export type WorkSnapshot = Readonly<{
  session: SessionId; tenant: TenantId; revision: SessionRevision; interpreter: Adoption; source: DurableEvidence
  lifecycle: 'initializing' | 'dormant' | 'active' | 'archived'
  definition: Readonly<{ name: string; adopted: Adoption }>
  execution: Adoption; declarations: DurableEvidence
  run: RunState; pending: readonly InputId[]
  waiting: readonly Waiting[]; consumptions: readonly Consumption[]
  controls: readonly ControlProgress[]; unresolved: readonly SessionOperationId[]
  creation: SessionCreation; tasks: readonly RecoveryTask[]
}>
```

ProducerRef 的 string 由生产领域 codec 解析并核对原关联，不能直接传入 ModelCallId/ToolCallId 的品牌位置。Session 不定义另一套生产者身份格式。AgentInstanceRef 同样由 Agent 的受信实例适配器解析。Run 外调用的 initiatingAttempt 为 null，消费位置仍有实际 owner/work/position；不能造一个空 Run。

WorkSnapshot 来自同一个完整权威提交位置。lifecycle 是事实归约结果，不单独写入另一份状态源；active 当且仅当有未终结 Run。普通展示投影须另标覆盖进度，不能冒充 readWork 返回值。ordinal 只是已提交 attempt 开始顺序，不单独证明 advance 有效。每次推进及实际外部发起均重新检查。

InputBatch.ordered 是 T1 当时全部合格输入的精确集合，boundary 固定所用状态。大批可由实现分段读取，逻辑批界和顺序不能重选；引用版须能恢复同一个完整 ordered 集合。pending 的空集合只有权威读成功时才有意义，读取故障不能变空集合。

Continuation.value 使用 lossless JsonValue，必须通过 schema 所指的精确 Agent 解释器验证。Agent 采用变化时须证明原位置可以安全接续。解释器不可用时仍允许合法查询、控制和保管，不能正常推进或猜一个默认下一步。Session 不在日志归约时执行解释器的外部效果。

## 输入、推进、结果及终态操作

```ts
export type RoutedInput =
  | Readonly<{ kind: 'ordinary'; input: InputId; message: Message; origin: DurableEvidence }>
  | Readonly<{ kind: 'card-decision'; card: DurableEvidence; decision: DurableEvidence; destination: DurableEvidence }>
  | Readonly<{ kind: 'business'; owner: string; input: DurableEvidence; destination: DurableEvidence }>
export type SessionFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'commit-unknown'; operation: SessionOperationId }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'archived' | 'no-input' | 'run-active' | 'stale-advance' | 'blocked' }>
export type Reply<T> = Promise<Outcome<T, SessionFailure>>
export type CommitReceipt = Readonly<{
  operation: SessionOperationId; revision: SessionRevision
  first: EntryId; last: EntryId; recovered: boolean; source: DurableEvidence
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'attempt-rejected'; original: 'unknown'; reason: string }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown' }>
export type StartedRun = Readonly<{
  receipt: CommitReceipt; advance: AdvanceRef; adopted: Adoption; inputs: InputBatch
}>
export type Completion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; position: string
  processing: DurableEvidence; message: Message | null
  extensionConclusions: readonly DurableEvidence[]; resume: Continuation
}>
export type ExternalCompletion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; position: string
  processing: DurableEvidence; message: Message | null
}>
export type BatchPage = Readonly<{
  batch: InputBatch; inputs: readonly Extract<RoutedInput, { kind: 'ordinary' }>[]
  next: string | null; exhausted: boolean
}>
export type FixedRequestMaterial = Readonly<{
  consumption: ConsumptionId; producer: ProducerRef; source: DurableEvidence
  schema: Adoption; value: JsonValue
}>
export type Control =
  | Readonly<{ kind: 'cancel-run'; run: RunId; urgency: 'graceful' | 'force' }>
  | Readonly<{ kind: 'stop-call'; producer: ProducerRef }>
  | Readonly<{ kind: 'background-tool'; producer: Extract<ProducerRef, { kind: 'tool' }> }>
  | Readonly<{ kind: 'archive' }>
  | Readonly<{ kind: 'unarchive' }>
export type RunConclusion =
  | Readonly<{ kind: 'complete'; beforeTerminal: DurableEvidence }>
  | Readonly<{ kind: 'fail'; cause: DurableEvidence }>
export type DerivedMessage =
  | Readonly<{ kind: 'compaction'; message: Message; derivation: DurableEvidence; original: DurableEvidence }>
  | Readonly<{ kind: 'context-reminder'; message: Message; source: DurableEvidence }>
  | Readonly<{ kind: 'background-placeholder'; message: Message; producer: Extract<ProducerRef, { kind: 'tool' }>; source: DurableEvidence }>
export interface SessionWork<P> {
  accept(input: Mutation<P> & Readonly<{ value: RoutedInput }>): Reply<CommitReceipt>
  readWork(input: Access<P>): Reply<WorkSnapshot>
  readBatch(input: Access<P> & Readonly<{ batch: BatchId; cursor: string | null }>): Reply<BatchPage>
  readRequest(input: Access<P> & Readonly<{ consumption: ConsumptionId }>): Reply<FixedRequestMaterial>
  startRun(input: Mutation<P> & Readonly<{
    candidate: Adoption; initial: Continuation; instance: AgentInstanceRef
  }>): Reply<StartedRun>
  takeInputs(input: AdvanceWrite<P> & Readonly<{ position: string }>): Reply<Readonly<{ receipt: CommitReceipt; batch: InputBatch }>>
  claim(input: Mutation<P> & Readonly<{
    run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  reload(input: Mutation<P> & Readonly<{
    run: RunId; candidate: Adoption; instance: AgentInstanceRef; resume: Continuation; handover: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  bindCall(input: AdvanceWrite<P> & Readonly<{
    binding: CallBinding; resume: Continuation
  }>): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  bindExternalCall(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence
    binding: CallBinding & Readonly<{ initiatingAttempt: null }>
  }>): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  preserveResult(input: Mutation<P> & Readonly<{
    consumption: ConsumptionId; result: ProducedResult; custody: DurableEvidence
  }>): Reply<DurableEvidence>
  completeConsumption(input: AdvanceWrite<P> & Readonly<{ completion: Completion }>): Reply<DurableEvidence>
  completeExternalConsumption(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence; completion: ExternalCompletion
  }>): Reply<DurableEvidence>
  recordProgress(input: AdvanceWrite<P> & Readonly<{
    passage: DurableEvidence; resume: Continuation; waiting: readonly Waiting[]
  }>): Reply<CommitReceipt>
  commitDerived(input: AdvanceWrite<P> & Readonly<{
    value: DerivedMessage; judgment: DurableEvidence; resume: Continuation
  }>): Reply<CommitReceipt>
  release(input: AdvanceWrite<P> & Readonly<{ resume: Continuation }>): Reply<CommitReceipt>
  control(input: Mutation<P> & Readonly<{ intent: Control }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  finishRun(input: AdvanceWrite<P> & Readonly<{ conclusion: RunConclusion }>): Reply<Readonly<{ receipt: CommitReceipt; terminal: RunTerminal }>>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  loadRecovery(input: Access<P>): Reply<WorkSnapshot>
}
```

这组操作面向已经创建且可核验身份的 Session。创建、初始化、会话声明与模式/选择修改、关系及自动归档另列管理操作，不能被调用者用 readWork 或 recordProgress 私自完成。create 尚未形成有效第一批时，工作面不得报告就绪。

操作标识在首次提交前确定，按租户、Session、可信来源及方法/参数规范化摘要认回。已经提交的原操作先于新 expected 检查认回，但当前读取资格仍检查。原操作异参数 conflict；原操作未提交而 expected 变化时返回 changed，调用者重读并重新判断，不给旧计算事件换序号提交。异常不替代业务拒绝或未知。

| 操作 | 同一次裁定保护的结果 | 失败及恢复 |
| --- | --- | --- |
| accept ordinary | 可靠消息或内容引用、来源、原身份、去处及待处理资格 | 归档先提交则拒绝；受理先提交而随后归档须保留受理及取消去处，不能无痕丢失 |
| accept card/business | 原目标与拥有者、决定或业务输入、可靠交回责任 | 不进普通队列，不报告原业务效果已经发生。错误目标拒绝 |
| readWork/loadRecovery | 完整权威尾部与适用解释版本 | 不能读取则 unavailable；缺批/损坏/未知相关事件隔离该会话，不提供部分治理状态 |
| readBatch/readRequest | 原批次/消费身份、当前披露资格、固定完整内容与版本 | 不存在返回 invalid，材料暂不可恢复返回 unavailable，不以空正文或最新请求代替 |
| startRun | 非空完整首批、无未结 Run、当前新 Run 准入、最新合法定义采用、首次 attempt 及初始位置 | 登录条件只用于适用新 Run 入口；候选跨源失效重算，不把 Session 尾部不变当充分证明 |
| takeInputs | 原位置合法、当前 advance、全部合格输入集合、原 Run 承接与解除待处理资格 | 本步骤尚待原调用接续则 blocked，不挑选一条以绕过批界 |
| claim | 原 Run 未终态、旧实例已交还或可信排除、新代次及原位置 | 并发两个接手只准一个，目录空/超时/最大序号不足以取得资格 |
| reload | 同定义标识、候选合法、安全交接、原采用更新与旧资格撤销及新 attempt | 候选失败保原合法状态；取消/归档先成立则拒绝晚到 reload |
| bindCall | 原 action/call、固定输入、原 consumer、消费身份与接续责任 | 登记不报告 Model/Tool 已受理或真实执行；原调用未知时不建替代身份 |
| bindExternalCall | 真实 Run 外来源、当前 Session 准入和原 consumer、固定调用及消费责任 | 不要求或制造 Run/attempt；不能代替失效的 bindCall |
| preserveResult | 真实来源/版本、当前承接资格、可靠内容或引用、原位置及后续责任 | 不要求旧 attempt 仍有效；保管不冒称处理或重新取得推进权 |
| completeConsumption | 当前推进及原消费位置、必要扩展结论、业务处理/消息准入与完成依据、后续位置 | 已取消业务不继续；先处理路径不强制额外全文副本；消息拒绝保留真实原结果 |
| completeExternalConsumption | 原 Run 外关联、当前消费者资格、原处理结果与消息准入 | 不改变 Run 位置或取得 advance；已取消投递不得形成后继普通输入 |
| recordProgress | 受信 Agent 原经过、合法状态迁移、实际等待集合和可恢复位置 | 不是任意追加日志接口，不接受调用者编造有效决定或跳过整批屏障 |
| commitDerived | 压缩共同结果、当前感知提醒或原工具后台占位，以及必要准入和接续位置 | 按具名来源验证，不能用任意消息绕过普通输入/结果处理；占位不解除真实结果交付 |
| release | 原 advance 撤销与原位置/待办一起保存 | 不终结 Run，不取消独立 Model/Tool，旧资格不能自行重新生效 |
| control | 原意图、适用逻辑处置、撤资格和传播/核对责任 | 取消 Run 同提交唯一 cancelled 终态；实际停止另查，强制不改变逻辑终态时点 |
| finishRun | 原有效推进、当前队列/等待/模式与 beforeTerminal 结论、唯一终态及撤资格 | 取消先成立不能完成，旧终态不改。afterTerminal 只能后置观察/处理 |
| queryOperation | 原提交身份、范围、回执及权威认回 | 不可用不回空记录；attempt-rejected 不证明整个原操作未提交 |

所有共享结果由提供者用既有日志原生事实表达。调用者不拼 SE 编号，不直接写表或任意 facts。创建/受理、条目范围、操作认回、治理状态及权威读取进度共同提交。展示投影在提交后更新并标明覆盖，通知可以重复或丢失，任务仍由权威状态恢复。

WorkSnapshot.source 是 Session 为该完整权威位置生成的记录证据，可交合法历史读取者解析固定范围；它不授予额外读取资格。commitDerived 校验实际来源、消息角色和完整准入经过。compaction 必须由 Request Context 的 derivation 同时证明摘要及排除原块清单，original 定位原范围；二者与对应消息同提交，不允许半份压缩。context-reminder 只保存获准感知及必要前后值；background-placeholder 核 Tool 原转换及消费关联，只追加一次占位，不写真实终局或解除 delivery。所有分支保存后续 continuation，重复同 operation 认回，内容冲突拒绝。消息前/后扩展沿 Agent 位置协议，尚无所需准入结论时不能提交。

CommitReceipt.source 是 Session 在该操作共同提交时生成的原提交记录证据，绑定操作、范围、结果种类和实际内容摘要，认回时保持相同值。commitDerived 的 source 可由 Request Context 核对已提交的原压缩消息及排除名单，随后接续原 preparation；不由 Agent 将 EntryId 自行包装成证据。queryOperation 的 committed 回执同样返回它，提交未知期间不能提前 resume 为已压缩。

readBatch 按已经提交的 BatchId 读取原 ordered 中的完整消息，包含原 InputId 和来源；分段游标绑定租户、会话、主体范围、批次、内容修订及偏移，每页重新核权。所有页按 ordered 覆盖且不重复，exhausted 才表示完整。首批和后续批都保留这一读取能力，不能要求调用者重扫原生日志或依赖受理者内存。readRequest 按 consumption 解析原 request 证据，返回生产者拥有的精确 schema 和原固定请求数据。受信 codec 将其还原为 Model/Tool 请求并核对身份、摘要及原采用；未知 schema 不得重构新请求。保管参加者在 bind 时就保证此路径可恢复，正文可以在实际材料拥有者处，读取失败仍明确不可用。

bindExternalCall 仅用于本来就没有 Run/attempt 的合法会话关联调用。qualification 指向实际消费者拥有者的原资格材料，由参加者核实来源、租户、消费位置、当前准入及操作范围，不能由调用者用布尔值自授。Session 参与其生产受理/实际动作守卫时检查对应外部关联和归档等当前条件，不要求虚构 advance。Run 内调用不能在取消或换代后改登记为 Run 外调用。completeExternalConsumption 只能完成同一外部消费位置，其 message 经原投递资格和普通输入准入决定是否形成后继工作；不修改活动 Run 的 continuation。原资格撤销时保管和真实事实对账仍可依法继续，业务处理不能借保管资格继续。

## 同提交守卫与跨成员使用

Model/Tool 受理使用 bindCall 的原关联及受信 Session 参加者。参加者在同一 Storage transactionDomain 内读取当前 Run/attempt/控制、原 call/请求/consumer 等事实，再同提交生产者受理。没有 Session 关联的独立调用使用自己的消费拥有者，不调用本参加者或伪造 Session。

参加者只接收版本化 JSON 命令，校验来源与 Schema，在已注册组合中通过被授权的事务端口工作，不自己提交，不把主线程闭包传到 Worker。身份授权及外部采用源必须提供同提交或等价串行的当前事实检查。不能只先 readWork、再异步 admit，以两次成功声称资格与受理共同成立。

实际 Model send/Tool start 的围栏由其执行边界拥有。Session 的撤推进、取消、归档和 reload 提交须参加同一个适用排序域，才能承诺失效推进者不再产生新动作。数据库提交不涵盖网络效果；已启动的独立执行继续报告真实结果。未来远端提供者需明确等价协议，不能把单进程 Context 或锁直接跨进程推广。

会话的保管证据由 preserveResult 在确认本地内容或独立可恢复引用和责任成立后返回，供 Model retained ACK 或 Tool releaseDelivery 消费。completeConsumption 返回处理完成证据，供 processed 路径使用。对方负责验证当前承接者和证据原记录。生产侧确认回执另以具名事实接收操作对账，不因发出确认请求就把 相应 results 项的 release 改 confirmed。

一个 Consumption 固定原调用和消费位置，results 中每项按 producer/version/delivery 唯一定位。Model 的 delivery 为 null，由原结果版本关联其 ACK；Tool 必须给出真实 ToolDeliveryId 的编码值。preserveResult 首次保存某版本时原子追加该项，重复同值认回，不覆盖已有版本的 custody/completion/release。completeConsumption 和 completeExternalConsumption 也只提交 completion.result 指定项，先处理路径可以直接建立有完成证据的项。release 事实同时指明 consumption 和完整 ProducedResult，由当前参加者核对该生产版本的真实确认；旧版确认不能解除新版责任。

Tool 晚到版本仍追加在原消费绑定下，不创建新 Run 或新调用，终态后合法保管者可经 preserveResult 登记。旧结果与新结果、各自保管/处理和确认并存于 loadRecovery。迟到项如仅有保管用途，completion 可为空但 release 可按真实 retained 确认成立；它不修改原 continuation，也不重新触发旧动作。消费版本的源摘要不同或同版交付关系矛盾时拒绝，不能用晚到事实覆盖先前记录。

## 控制、恢复与保管边界

Run 取消撤原推进并形成唯一取消终态，传播到该 Run 的 Model 与前台 Tool。后台、子会话和无关 Run 外调用不自动跟随。单调用控制不撤整个 Run。归档取消本 Session 的原待处理任务、业务等待和全部相关 Model/前后台 Tool 的投递资格，并可靠保留子会话级联待办；逻辑归档不等待物理全停。子方按其权限及原操作独立提交，父方持续保留未完成级联。

撤销归档回休眠并保存新的空闲起点，不恢复原 Run、卡片、调用或子方。原已完成/失败终态不会被归档改成取消。正常后台结果仍有合法后续投递资格时，经 Session 原输入准入可形成后继工作；已因归档取消资格的结果不会因撤销归档自动入队。

loadRecovery 首先给出未知原操作、逻辑控制、未完调用、原等待、保管/处理/生产确认责任。恢复者先认回这些事实，再从原 continuation 推进。仅 Agent 失去连续性时，不把独立 Model/Tool 判为失联。原 Run 普通恢复保留采用；新实例通过 claim 取得新 attempt，旧实例继续存在时没有新推进权。

WorkSnapshot.creation 保存原创建输入及采用。tasks 给出未完初始化的具名输入/协议/原操作、每个尚未完成子归档的目标和固定子操作，以及卡片/业务输入的原路由责任。ControlProgress.intent 保留原控制种类、强制/平缓意图及插队决定；pending 指向尚未核对的生产者。恢复者依原操作查认后传播同一意图，不能从 target 猜停止还是转后台。级联回执经 receive 的 cascade 分支核验后解除对应任务；未知或拒绝保留任务及原因。初始化通过 completeInitialization 收场，路由通过 receive 的 routed-input 分支认回。历史分页不是这些责任的恢复接口，不能把必要原意图藏在提供者私表中。

preserveResult 和真实事实接收不依赖旧 advance。当前合格保管者可处理终态后迟到结果，保存历史与账目；它不能由此提交新的原 Run 业务动作。取消不构成消费完成，双方仍按原身份保管和对账。没有合法读取者时保持责任，不授予无权者内容。

## 创建、声明与历史

管理操作同样按原提交身份认回，不能借其绕过工作面的共同守卫。执行类型拥有者给出固定 Adoption 与必需身份集合；Session 不从定义名称猜执行类型，也不把宿主目录当工作区身份。

```ts
export type Modes = Readonly<{
  permission: 'never' | 'auto_permission' | 'bypass-permissions'
  environment: Adoption
  collaboration: 'co-work' | 'auto-drive'
}>
export type SessionCreation = Readonly<{
  definition: Readonly<{ name: string; candidate: Adoption }>
  execution: Adoption; requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  purpose: string; workspace: Adoption | null
  modes: Readonly<{ kind: 'explicit'; value: Modes }> | Readonly<{ kind: 'tenant-default'; source: Adoption }>
  initial: Extract<RoutedInput, { kind: 'ordinary' }> | null
  entryContract: Adoption
}>
export type InitializationResult = Readonly<{
  item: string; owner: string
  result: Readonly<{ kind: 'ready'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'failed'; diagnostic: string; recovery: DurableEvidence }>
}>
export type DeclarationChange =
  | Readonly<{ kind: 'permission-mode'; value: Modes['permission']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'collaboration-mode'; value: Modes['collaboration']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'environment-mode'; value: Adoption; authorization: DurableEvidence }>
  | Readonly<{ kind: 'workspace'; value: Adoption | null; basis: DurableEvidence }>
  | Readonly<{ kind: 'model'; name: string; basis: DurableEvidence }>
  | Readonly<{ kind: 'context-registration'; registration: DurableEvidence }>
export type Relation =
  | Readonly<{ kind: 'main'; resident: boolean }>
  | Readonly<{ kind: 'child'; parent: SessionId; basis: DurableEvidence }>
  | Readonly<{ kind: 'handoff'; origin: SessionId; basis: DurableEvidence }>
export interface SessionManagement<P> {
  create(input: Mutation<P> & Readonly<{ creation: SessionCreation }>): Reply<Readonly<{ receipt: CommitReceipt; state: WorkSnapshot }>>
  completeInitialization(input: Mutation<P> & Readonly<{ result: InitializationResult }>): Reply<CommitReceipt>
  change(input: Mutation<P> & Readonly<{ declaration: DeclarationChange }>): Reply<CommitReceipt>
  setRelation(input: Mutation<P> & Readonly<{ relation: Relation }>): Reply<CommitReceipt>
  configureAutoArchive(input: Mutation<P> & Readonly<{
    policy: Readonly<{ kind: 'disabled' }> | Readonly<{ kind: 'enabled'; idleMs: string }>
  }>): Reply<CommitReceipt>
  considerAutoArchive(input: Mutation<P> & Readonly<{ idleEvidence: DurableEvidence }>): Reply<Readonly<{
    result: 'archived' | 'not-due' | 'exempt' | 'disabled'; receipt: CommitReceipt | null
  }>>
  interrupt(input: Mutation<P> & Readonly<{
    run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
}
export type ProducerFact =
  | Readonly<{ kind: 'execution'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'account'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'release'; consumption: ConsumptionId; result: ProducedResult; source: DurableEvidence }>
  | Readonly<{ kind: 'control'; control: SessionOperationId; source: DurableEvidence }>
  | Readonly<{ kind: 'cascade'; child: SessionId; childOperation: SessionOperationId; source: DurableEvidence }>
  | Readonly<{ kind: 'routed-input'; originalOperation: SessionOperationId; source: DurableEvidence }>
export interface SessionReconciliation<P> {
  receive(input: Mutation<P> & Readonly<{ fact: ProducerFact }>): Reply<CommitReceipt>
  pending(input: Readonly<{ principal: P; tenant: TenantId; after: string | null; limit: number }>): Reply<Readonly<{
    sessions: readonly SessionId[]; next: string | null
  }>>
}
export type HistoryEntry = Readonly<{
  id: EntryId; revision: SessionRevision; kind: string; schema: Adoption
  payload: JsonValue; origin: DurableEvidence
}>
export type HistoryPage = Readonly<{
  source: string; interpreter: Adoption; upper: SessionRevision
  entries: readonly HistoryEntry[]; scannedThrough: string
  next: string | null; exhausted: boolean
}>
export interface SessionHistory<P> {
  begin(input: Access<P> & Readonly<{
    kinds: readonly string[]; from: EntryId | null; pageBytes: number
  }>): Reply<HistoryPage>
  next(input: Access<P> & Readonly<{ cursor: string }>): Reply<HistoryPage>
}
export interface SessionService<P> {
  readonly work: SessionWork<P>
  readonly management: SessionManagement<P>
  readonly reconciliation: SessionReconciliation<P>
  readonly history: SessionHistory<P>
}
```

create 保存第一份完整创建批次与已确定初值，尚未完成的初始化项留具名责任，不能用 null 假装完成。entryContract 是实际入口的既有契约，专用派发/Job 的必需初值和输入不可由 tenant-default 绕过。指定工作区加载失败不能降为没有工作区。completeInitialization 核验原 item 及 owner，只追加确定结果；重复同值认回，矛盾结果拒绝。所有必要项完成才归约为就绪。

change 只改指定维度或声明，权限模式不扩大结构化许可，auto-drive 不代人回答 Ask。Agent 改模式须有 HITL 的人类显式授权证据；用户可依自己合法资格操作。模型切换允许有明确用户指令的 Agent 代办，合法目标缺凭据可选但要说明暂不可用；切换不新建 attempt、不打断旧请求，后续调用失败不回滚选择。工作区/Context 声明须经其拥有者合法求值，不直接写共享源。

setRelation 核验双方租户及当前关系。child 不能 resident，handoff 不进入原方级联；不能通过改 relation 绕过已有级联责任。自动归档默认 disabled，只有明确 enabled、非 resident、完整连续空闲证据和当前所有关联工作条件同时成立才归档。idleMs 为正十进制毫秒数，无法核验时返回 unavailable，不能视为闲置。considerAutoArchive 不因返回 not-due 等状态制造无意义日志；真正归档复用完整归档原子结果。恢复不因重启自动重置已确认空闲。

interrupt 同提交加急输入与适用逻辑处置/传播责任，保留原 Run。它需要已核实的原目标及允许后台/停止的处置决定，但不假称 Tool 已实际转换。实际确认由 reconciliation.receive 接入。只有模型在途时也可沿模型控制路径插队，不要求虚构工具许可。人工等待按已有明确插队控制记录，不伪造人没有提交的授权答案。

receive 读取并验证生产者原记录、租户、版本及已有消费关联，只保存事实拥有者已成立的报告。execution 包含真实开始/收场或转换，account 只关联原账项，release 核对原生产侧确认，control 核对实际传播/收场进展。它不授予新 advance，不改变生产者的实际终局/费用，也不能由晚到消息复活已终态 Run。生产者记录不同修订须按其协议解释，不以任意新时间戳覆盖旧事实。

pending 供受信恢复者按显式租户扫描未完 Session，limit 受提供者公开容量约束。读取失败不返回空完成。稳定游标和重复扫描覆盖并发新增责任，不能在读取时删除待办；各项操作成功后才由权威归约解除相应责任。

HistoryEntry 使用原生事件目录拥有的 kind 与精确 schema。读取器可以导出未认识但获准读取的原始版本化条目，治理解释器遇到不能证明无关的未知类别则隔离，不能跳过。没有任意公开 append 接口。begin 固定来源、过滤与 upper；next 的 opaque cursor 同时绑定 tenant/session/主体范围/过滤/upper/扫描位置。每页重新核权，授权扩大不能扩大原游标，撤权后不继续披露。空 entries 不表示 exhausted；scannedThrough 记录实际扫描进度而非最后可见条目。

## 当前增量与后续接口

提供者工厂按下列依赖组合工作。变更命令直接引用上述操作参数，避免另造一份可能漂移的字段表；principal 经可信身份适配器转换为可验证参加者材料，不进入通用序列化命令。这里的映射类型只是有限命令联合，不允许调用者指定任意方法或执行闭包。

```ts
export type MutationName =
  | 'accept' | 'startRun' | 'takeInputs' | 'claim' | 'reload' | 'bindCall'
  | 'bindExternalCall' | 'completeExternalConsumption'
  | 'preserveResult' | 'completeConsumption' | 'recordProgress' | 'release'
  | 'commitDerived'
  | 'control' | 'finishRun' | 'create' | 'completeInitialization' | 'change'
  | 'setRelation' | 'configureAutoArchive' | 'considerAutoArchive' | 'interrupt' | 'receive'
type Mutations = Pick<SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>, MutationName>
export type SessionCommand = {
  readonly [K in MutationName]: Readonly<{
    kind: K; input: Omit<Parameters<Mutations[K]>[0], 'principal'>
  }>
}[MutationName]
export type GuardCommand = Readonly<{
  owner: string; participant: string; protocol: Adoption; facts: JsonValue
}>
export interface SessionIdentityBridge<P> {
  prepare(input: Access<P>, command: SessionCommand): Reply<GuardCommand>
}
export interface SessionEvidenceBridge {
  prepare(command: SessionCommand): Reply<readonly GuardCommand[]>
}
export interface SessionTransactionPort<P> {
  commit<K extends MutationName>(input: Readonly<{
    command: Extract<SessionCommand, { kind: K }>; guards: readonly GuardCommand[]
  }>): ReturnType<Mutations[K]>
  readWork(input: Access<P>): Reply<WorkSnapshot>
  readBatch(input: Access<P> & Readonly<{ batch: BatchId; cursor: string | null }>): Reply<BatchPage>
  readRequest(input: Access<P> & Readonly<{ consumption: ConsumptionId }>): Reply<FixedRequestMaterial>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  readonly history: SessionHistory<P>
  pending(input: Readonly<{ principal: P; tenant: TenantId; after: string | null; limit: number }>): Reply<Readonly<{
    sessions: readonly SessionId[]; next: string | null
  }>>
}
export interface SessionNotifier {
  committed(input: Readonly<{ tenant: TenantId; session: SessionId; revision: SessionRevision }>): Promise<void>
}
export type SessionConfiguration = Readonly<{
  maximumPageBytes: number; maximumPendingPage: number; reconciliationDelayMs: number
}>
export type SessionDependencies<P> = Readonly<{
  identity: SessionIdentityBridge<P>; evidence: SessionEvidenceBridge
  transactions: SessionTransactionPort<P>
  notifier: Readonly<{ current(): SessionNotifier | null }>
}>
export declare function createSessionService<P>(
  dependencies: SessionDependencies<P>, configuration: SessionConfiguration,
): SessionService<P>
```

GuardCommand 是参加者拥有的版本化 JSON 需求材料，不是签名后的 allowed 布尔或新的权限模型。owner/protocol 指向实际已登记的身份、资产、Context、Agent、生产者或保管契约；participant 在 Worker 中验证来源、目标与最新权威条件，提交时重新裁定。Session 自己的参数、原操作身份及共同结果在 SessionCommand 中封闭定义，不能放进 facts 逃避公开契约。

identity.prepare 核实 P 的可信来源并生成绑定该 tenant/session/operation/command 的身份参加者需求。其结果不能拿去执行另一命令，不能序列化 P 的秘密。evidence.prepare 按命令种类取得实际需要的采用、保管或解释器材料。startRun/reload 核当前定义采用，preserveResult 核生产来源及耐久保管，completeConsumption/recordProgress 核 Agent 原位置及整批结论，receive 核原生产记录，create/change 核入口、资产及声明条件。资料准备失败保留原状态并报告对应 owner，不能缺一个 guard 仍提交。

commit 校验命令所需完整参加者集合，不信任调用者挑选的 guards。它使用固定 combinationVersion，把 Session 条目、操作认回、治理变更、当前权威进度与本命令参加者放在同一真实 Storage 事务。guard 缺席、协议版本不符、跨租户、来源无权或最新条件改变时拒绝或 changed。临时文件引用只有经保管参加者保证必要耐久后才可进入已确认条目；命令身份摘要固定语义参数，不把每次新生成的临时认证封套当作新业务输入。

本接口保留 Storage 原操作未知及排除证明含义，不把数据库层 rollback 直接等同原业务操作从未提交。同身份仍有旧写未决时只能 attempt-rejected/original unknown。not-committed 的 exclusion 由存储提供者产生且覆盖旧写者/事务/恢复/权威读取/未排队条件；前端或 Agent 不能自填。恢复查询读到 committed 后直接返回原范围和结果，不再次运行判断或发送通知所代表的效果。

读操作仍由 transaction port 的身份/披露边界核权，不能因为 commit 使用 identity bridge 就忽略读取。evidence bridge 不可用时可以继续不依赖它的合法读/控制或已持久任务核对；实际命令缺必要事实时才拒绝相应变更。不能把全站停机当作必然回退。

notifier 是调用期可选能力。一次提交之后重新获取当前 notifier，缺席不阻止提交；失败保留可观测诊断并由 pending/readWork 恢复工作，不回滚成功回执。若某装配把它作为唯一唤醒路径而不扫描耐久待办，该装配不符合可靠受理。读到 old notifier 后的在途调用按其生命周期结束，不能缓存为长期必需引用。

| 值或依赖 | 分类与换代责任 |
| --- | --- |
| principal、tenant、session、目标、operation、固定输入/证据 | 操作参数；每次重新核验，原操作相同内容认回，租户不从 Context 推导 |
| identity | 必需可信身份到当前守卫需求的适配；不能返回永久许可，替换不改变历史主体 |
| evidence | 必需按命令取采用/来源/保管/Agent 解释需求的适配；旧版恢复须仍可解释原采用，缺版本明确不可用 |
| transactions | 必需本域原子命令与权威读能力；选择的提供者兑现组合版本、跨进程写裁定及持久性 |
| notifier.current | 可选能力解析器；提交后按次获取，不决定业务事实是否成立 |
| configuration | 有限正页/批容量及非负核对间隔；加载时验证，不能通过缩页改变逻辑输入批界 |
| 固定定义、执行类型、模式初值、原请求、Continuation | 持久采用/状态；恢复不套最新默认，不序列化运行对象 |

具体生产提供者仍须证明其 Storage 参加者、授权来源和实际动作围栏满足本接口。W3 类型/并发验证及 W4 Agent 消费反查继续核对这些接缝。MODEL-E01 等外域来源限制不被 Session 的 JsonValue 或引用包装解除。当前不声称这些公开操作已有生产实现。
