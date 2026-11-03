# Schedule 与 Job 公开 API 设计

本页索引已经实现的Schedule协议及应用工厂，并保留尚未实现的Job目标接口。协议为 `omne.calendar-schedule/1`。实际类型和Standard Schema由[schedule-contract源码](../../schedule-contract/src/index.ts)唯一拥有，工厂依赖由[本成员源码](../src/index.ts)拥有。行为归[SPEC](../SPEC.md)，机制归[内部设计](internals.md)。

公共服务协议与本机工厂配置分开维护。可替换服务端口归 schedule-contract，工厂 Dependencies/Configuration 归 schedule，SQL 参加者与具体存储映射归 schedule-local。下文进程内依赖对象不属于 HTTP/远程请求或回执。根公共协议不携带 Context、数据库句柄、函数或运行时实例；取消观察的 signal 由客户端本地处理，不直接序列化。分布式交接与强保证的前提归[安装和部署边界](../../../../docs/package-organization.md#日历与日程的安装和部署边界)。

## 共同编码与可信上下文

Calendar 的实际公开值、查询与供应协议由 [calendar-contract](../../../calendar/calendar-contract/docs/public-api.md)拥有。Schedule 的 CalendarSelection 仍表示下述 Binding 消费投影，不冒充 CalendarResolve 的 selection 字段。日期与可信调用原则见 [Calendar 编码说明](../../../calendar/calendar/docs/public-api-design.md#1-编码版本与调用上下文)。本域不接受模型自报 owner/actor/authContext，不引入 Calendar 到 Schedule 的源码依赖。真实身份定义必须优先复用已接受公共值。

Schedule共同值、管理命令及查询已经源码化。以下Job、Admission、Subscriptions和外部执行设计仍未实现，不是当前可调用接口。

共同值与可信上下文见[values.ts](../../schedule-contract/src/values.ts)，命令元数据见[commands.ts](../../schedule-contract/src/commands.ts)，错误及结果联合见[results.ts](../../schedule-contract/src/results.ts)。这些schema直接派生Tool/SDK参数，不在此重抄字段。

Schedule 命令指纹继续使用 `{protocol,operation,owner,aggregateRef,payload,expectedRevision,consentRef}` 的 RFC 8785 JCS UTF-8 字节与 SHA-256，不含 requestId、operationKey、运行时对象或 retry count。幂等作用域包含 owner、operation、aggregateRef 和 protocol，create 使用 owner 下 create namespace。同 key 同指纹认回原回执，异指纹返回 operation_key_conflict。无默认 TTL 删除历史或去重事实。sourceFingerprint 与 targetFingerprint 分开，旧 proof/receipt 不因 label 修改重写。日期/UUID 先校验，不静默修剪，排序遵循 JCS。跨语言 golden 保留中文、emoji、斜杠、负数、指数、null、空数组和键顺序。

OwnerRef 的 tenant 与 system 分开，source owner 导入 tenant 分支。系统归属必须映射合法 storage 系统命名空间，不能将 systemScopeRef 填进 tenantId。originatingSessionRef 只作可空来源追踪，程序 Job 传 null。civil 为秒精度无 offset 文本，instant 为毫秒 UTC 文本。严格对象拒绝未声明字段，缺失与 null 分开，整数为 safe integer，UUID 为小写，Unicode 保留原值。IANA timezone 必须在固定 tzdb 中可解析。可信 host adapter 构造上下文，应用仍验证当前资格；AbortSignal 不进入 DTO 或指纹。

## 2. 公共值类型

### 2.1 规则、日期及预算

规则及位置定义见[recurrence.ts](../../schedule-contract/src/recurrence.ts)，Binding与完整定义见[definition.ts](../../schedule-contract/src/definition.ts)，工作范围、补跑与重叠声明见[work.ts](../../schedule-contract/src/work.ts)。此处说明约束和用途，字段形状以源码为准。

position.times 是去重升序 `HH:mm:ss` 数组，1..100 项；interval、ordinal、maximum、非空 limit 均正整数。period=quarter 使用 1/4/7/10 月自然季度，周从周一开始。RRULE 内容不含 DTSTART/COUNT/UNTIL，不允许重复参数。包含 BYYEARDAY、BYWEEKNO 的源合法规则必须支持；源验证器接受的其他合法语法以固定基线 golden 逐项验证，未支持不能通过完整复刻验收。源完整合法语法的 parser 对照属于 P1 硬验收，不能只测本文示例。

cron 与 rrule 的 `until` 可空，RuleLimits 的 eligibleLimit 可独立或同时存在。once 不允许非空 overlay、eligibleLimit 只能 null 或 1。lapse 的触发是规定的可恢复 blocker 或 pause 跨期，普通扫描迟到不能自动lapse。根规范 DTO 的 once execution 必须指定 misfire；源兼容 adapter 将省略/null 显式转为 lapse，保留源默认。awaitRecovery 保持原 W 等待同一依赖恢复，没有隐含到期日；非 once 的 misfire 为 null。reminder once 固定 lapse。

Binding 必须显式进入规范 DTO。用户入口默认 followUserEnvironment；固定业务及系统工作使用 explicit。explicit 的 calendarId 不随用户偏好变化，version.latest 仍跟随同一日历发布，version.pinned 固定具体版本。系统归属无用户环境时不得选择 follow。

周期 execution 的 CatchUp 在各恢复/扫描入口只有同一语义。none 不接受 T 前漏过，latest.maximum 只选最近 N 个，T 当刻另计；最旧 pending 无优先权。接口、导入器、预览及持久化定义都不提供 dueSelection 字段；旧字段按未声明字段拒绝。once、环境重锚、reminder 和已接受 Job 恢复分别沿长期 SPEC规则。

calendar-dependent 的 overlay/workingDay selector 必须能从 Binding 解析日历。explicit+null 不满足该条件。follow 必须取得有效环境，不能填 UTC/default calendar 掩盖缺失。

### 2.2 工作与完整 Schedule 定义

执行意图、提醒和完整Schedule定义分别由[work.ts](../../schedule-contract/src/work.ts)及[definition.ts](../../schedule-contract/src/definition.ts)拥有。其声明已可保存和查询，不表示Job执行器已经实现。

label 1..200 code points。instruction 1..65,536 UTF-8 bytes，本设计资源边界，不假称源相同。draft reason 1..1,024 code points。programRef、agentDefinitionRef、sessionRef、returnTo.targetRef 是 Job 契约拥有的 opaque 引用值，具体执行适配器解析。Job 应用服务只消费自己定义的 JobExecutor port 及其可执行性/资格证明，不调用或 import Session/Agent 领域服务。programRef 必须解析为已注册、已采用版本的程序及输入 schema；input 不允许携带任意可执行脚本。

**执行意图的冻结与解释**：Schedule 中的 Work 是未来安排内容，接受时完整复制进 Job.body.frozenWork。program 与 agent 互斥，program 不携带 instruction/session。agent 必须有非空 instruction 和 session 判别分支，不从 actor、创建来源或 instruction 是否存在猜测类型。

new 必须显式提供 modes 和 workspace；无工作区传 null，无资料传 materials=[]。AgentModes 是 Job 所需的运行意图投影：permission/collaboration 的值对齐 Session 公开 Modes，environmentAdoptionRef 指向环境拥有者可解析的精确采用依据。外部 adapter 将这些值映射为 SessionCreation 的 explicit modes、workspace 和 workspaceAttachment；不复制 SessionCreation，也不从发起者会话、agentDefinitionRef 或当前租户默认偷偷补值。WorkspaceInput 的 workspaceRef 是合法工作区身份，instanceRef/basisRef 分别引用工作区实例及采用版本，由工作区拥有者校验，不能用本地路径代替。MaterialInput 引用资料拥有者的一份明确资源版本，不嵌入全量历史、凭证或临时运行时对象；版本未知不得退回最新版本。

materials 可用于 new 或 existing 的本次输入。existing 不允许传 modes/workspace/agentDefinitionRef，也不改变目标会话已采用的运行配置和工作区。inspect 校验所有引用及组合支持，ready 的 workFingerprint 覆盖完整 modes、workspace 和 materials。接受时冻结这些值；start 仍需当前读取、启动及使用资格，冻结不延长授权。解析失败须明确 rejected/blocked，不能忽略资料或改成空工作区。更改运行模式、工作区或资料引用走 replace；已接受 Job 不变。V-SJ13 须覆盖同一 AgentDefinition 的不同运行模式/资料/工作区、明确空值、撤权、未知版本及 existing 禁止覆盖。

- new：每个已接受 Job 新建一个执行会话。适配器以 Job 的稳定执行身份幂等认领，重试及 runtime/attempt 恢复不能新建另一个会话；agentDefinitionRef 只标识稳定 AgentDefinition 身份，不是发布版本。新 Run 开始时由 Session 采用该定义最新合法发布；同一 Run 普通恢复保持原采用。
- existing：向明确的 sessionRef 提交本次 instruction，不再携带 agentDefinitionRef 去覆盖既有会话的 Agent。目标不存在、终局、跨租户或无准入资格时返回明确拒绝/受阻，绝不改为 new。
- Session intake / inbound 决定将 instruction 适配为 SystemReminderMessage、UserMessage 或其他获准输入。Work 中不出现消息类、role、Run/turn 对象或 Session 聚合字段。Job 可记录提交来源供其政策使用，但不能通过伪造 message role 取得权限。
- existing 表示在已有会话中执行本次 Job；是否新建 turn、排队或恢复某个推进点由 Session 拥有者决定。它不自动等同 self-wake，不自动延续旧 Run，也不能只因“消息已入队”把 Job 判为执行成功。
- 源 handoff 不是第三种执行引擎。它映射为 agent + session.new，AgentDefinition 身份由 agentDefinitionRef 承载，源固定发布按目标动态采用规则适配，originating master 由 returnTo.targetRef 承载；回传与实际消息适配都归外部组合。

execution.notifications 必须显式传值。纯执行为 []，执行并通知为非空数组，每个event至多一项，target必须是当前可披露的明确目标。接受时冻结全部声明，Job按每个已选实际事件形成一个稳定义务；模板内容可引用本次已证实成果，不得在失败/取消时生成虚构成功文案。后续仅按真实事件取已冻结声明，不重新读Schedule。通知失败不改执行结局。reminder不带该字段。

提醒 union 不出现 work、device、catchUp 字段，输入有多余字段即拒绝。源兼容adapter明确填overlap=parallel，目标native必须明确选定，不能隐式等待。

reminder 的 admissionDeadline 为 min(W+300s,nextEffectiveSlot)，半开右端点，不允许调用者自由提供；内部 prepare 固定并计算fingerprint，admit读取同一证明。

Reminder 并发投递仍由 notification provider 负责各 intent 的真实结果；每次接受形成notification Job，沿target jobLimit计数，但不产生execution预算消耗或空agent工作。

### 2.3 创建来源与直接工作

```ts
type Author = ScheduleAuthor // 已有类型从schedule-contract导入
type JobOrigin =
  | { kind: 'human'; actorRef: Ref; requestRef: Ref }
  | { kind: 'agent'; actorRef: Ref; originatingSessionRef: Ref; requestRef: Ref }
  | { kind: 'scheduler'; principalRef: Ref; scheduleId: Ref;
      definitionRevision: number; occurrenceKey: Ref; author: Author }
type DirectJobDefinition =
  | { kind: 'execution'; work: Work; scope: Scope;
      notifications: readonly ExecutionNotification[] }
  | { kind: 'notification'; content: ReminderContent }
interface JobCommands {
  create(ctx: CallContext, input: {definition: DirectJobDefinition; meta: CommandMeta}): Promise<CommandResult<JobView>>
  queryOperation(ctx: CallContext, input: {operationRef: Ref}): Promise<QueryResult<OperationView>>
}
```

JobCommands.create 只供当前获授权的人或 agent 直接发起。human 的 originatingSessionRef 必须为 null，agent 必须携带可信入口验证的真实 originatingSessionRef。不满足条件时拒绝，不能从 instruction 推断或补造会话。scheduler 只走内部 ScheduleAdmission.prepare/admit，不通过公开 create 伪造 human/agent。系统归属的机械工作沿系统 Schedule 产生，普通系统 principal 不能调用直接入口取得任意工作创建权。

origin 是应用服务根据可信 ctx 和已保存 Schedule 推导的只读值，不是 create 的输入。Schedule 保存 author，createdBy 是 author 的 actorRef 或 principalRef 的兼容读投影，不另存独立真相。scheduler origin 中的 author 是所采用 definitionRevision 的作者快照。后续编辑另记 revision.actor，不改创建作者，replace 的新定义记当前作者并保留 lineage。origin 不授予执行、回传或披露权限。它与 frozenWork.session、returnTo 及 ResultPolicy 分别解释。

直接入口不接受 recurrence、catchUp、overlap、scheduledAt、calendar binding 或 caller-supplied origin。该输入没有未来时间含义，不创建 Schedule。应用服务在一个受保护提交内校验当前授权、同意和资源准入，保存 Job、接受回执、来源与初始 outbox。缺少适用同意返回 consent_required，零 Job，不自动退化为 draft。直接接受不消耗 Schedule 的 eligibleLimit/jobLimit，也不占 standingWork 配额。执行预算及资源配额仍按其拥有者规则核验，不能借直接入口绕过。

直接请求的幂等作用域为 owner+job.create+可信 principalRef+originatingSessionRef或null+operationKey。fingerprint 包含完整 definition 与 consentRef。requestRef 由首次持久准备分配并随原 operation 保存，重试不得重分配。同键异内容拒绝，同内容认回原 Job。参数要求 expectedRevision=null。业务拒绝不留下 Job，提交结果 unknown 时查原 operation，不换键重发。

JobCommands.queryOperation 独立于 ScheduleCommands，按 operationRef 读取原 Job 命令的操作记录。入口要求 job.operation.read，核验当前 owner 与原 principal/来源会话范围，不能用另一会话或主体的 operationRef 越权查询。创建入口提供的授权能力组合必须同时包含原操作查询权，不能返回调用者无法查询的 unknown。此权只允许读取获准范围中的原操作，不授予新的创建或重试权。HTTP 的 GET /operations/{id} 按原记录的 operation 类型分派到 JobCommands 或 ScheduleCommands，各自核验权限。查不到合法归属时统一 not_found，不通过探测泄漏另一类操作。

JobView 对直接来源固定 scheduleId=null、scheduledAt=null、frozenBasis=null、sources=[]。其 acceptedAt 是服务端接受时刻，不伪造成原定时刻。直接接受回执为 `{receiptId,kind:'direct',requestRef,decidedAt,jobId,operationRef}`。定时回执为第 2.4 节 ReceiptView 的既有字段并带 kind='scheduled'。JobView.receiptId 必须引用同一来源分支的接受回执。直接通知没有 reminder 截止窗口，接受后沿原 notification intent 完成交付或取消。非接受的直接请求只有命令错误或原操作状态，不伪造 scheduled receipt。

### 2.4 公共读值

实际ScheduleView及standing见[views.ts](../../schedule-contract/src/views.ts)，候选和实际依据见[candidates.ts](../../schedule-contract/src/candidates.ts)。下表仅保留后续Job/Preparation/Receipt设计。

| 类型 | 完整业务字段（所有 optional 以 null 表示） |
| --- | --- |
| PreparationView | preparationId、scheduleId、occurrenceKey、candidate、definitionRevision、preparedAt、frozenDefinition、admissionDeadline或null、fingerprint、sourceFingerprint或null |
| ReceiptView | receiptId、occurrenceKey、preparationId、admissionDeadline或null、decidedAt、disposition、reasonCode、jobId或null、notificationIntentId或null、notificationId或null、operationRef |
| JobView | 共同头：jobId、owner、origin、scheduleId或null、receiptId、frozenBasis、sources[]、scheduledAt、acceptedAt、stopState、revision；body是execution/notification联合，见下文 |
| RevisionView | scheduleId、stateRevision、definitionRevision、actor、action、occurredAt、reason、beforeDefinitionRef、afterDefinitionRef、operationRef |

Receipt.disposition 为 acceptedExecution、acceptedReminder、rejected、missed、skipped。acceptedExecution 必须有 jobId；acceptedReminder 必须有 notification Job 的 jobId及notificationIntentId，notificationId 在通知拥有者确认后才可填；其余三种均无 jobId/notificationId。prepared 只存在 Preparation，不伪装 receipt。

JobView.body 为判别联合：execution 分支含 frozenWork、frozenNotifications、notificationObligations、startedAt、executionRef、executionState、executionOutcome、executionAdoptions、resultOutcomes；notification 分支含 frozenContent、notificationIntentId、notificationId或null、primaryOutcome、deliverySummaryRef、acknowledgementRef或null，不含Session/Run/executionWork。notification.primaryOutcome 为 pending/durableAvailable/failed/unknown/cancelled，其中durableAvailable须引用通知拥有者的可取回证明。另有coordinationReason或null。图10的notificationBlocked是协调投影，映射primaryOutcome=pending/unknown加coordinationReason；确定失败才映射failed，不能把unknown变成failed。取消请求不能伪造其已撤回。

execution.executionOutcome 为 succeeded、failed、cancelled、unknown 的带原因/原回执联合。unknown 不是终态证据，不能解除 replace 的停止等待。ResultOutcomes 的精确 shape 见第 6 节。notificationObligations 每项含 obligationId、event、eventReceiptRef、semanticKey、frozenContent、target、intentId、notificationId或null、handoffState、durableAvailableReceiptRef或null、outcome。obligationId/semanticKey按jobId+event唯一，同提交保存事件与义务；handoffState为retained/accepted/unknown，unknown保持本域责任。

## 3. 纯领域操作

当前纯计算导出validateScheduleRecurrence、enumerateScheduleRecurrence、materializeScheduleCivil，见[calculation/index.ts](../src/calculation/index.ts)。管理状态决定为decideScheduleManagement。下列完整Job算法设计中的未对应函数尚未实现。

所有纯操作同步执行或可取消的有界计算，不访问 ports。每个函数返回 `Value | CalculationError` 的判别联合，错误含 invalid、coverageInsufficient、searchLimit，不能 throw 表示普通空结果。

| 根操作 | 输入 | 输出 |
| --- | --- | --- |
| validateDefinition | ScheduleDefinition + resolved environmental basis | normalized validated definition 或字段 errors[] |
| enumerateCivil | Recurrence、after civil、inclusive、scanBudget | civil candidates + scannedThrough + exhausted |
| resolveCandidates | validated definition、basis、snapshot或null、after、count、budget | candidates[]、excluded[]、complete、observedThrough、reason |
| decideControl | ScheduleState、command、authority evidence、now | next state + events，或非法状态 |
| decideAdmission | preparation、current guards、processed sources、active predecessors、budgets、now | proposed decision + required writes，或 rejection |

日历纯函数classifyDay/countWorkingDays/shiftWorkingDays/listWorkingDays/selectNthWorkingDay的唯一形状归[Calendar API](../../../calendar/calendar/docs/public-api-design.md#纯计算根入口)，本域只组合公开值。

`decideAdmission` 不自行提交。应用服务和持久化 participant 负责读当前事实、验证版本及原子保存。纯计算传入的 AuthorityEvidence 只能用于判断，不能作为远期授权凭证。

## 4. 应用服务根接口

公共 Promise 返回明确业务联合。进程故障或程序缺陷可抛异常，host 记录真实失败。adapter 不转为空页或成功。当前公共查询方法没有signal参数。计算提供者在进程内支持取消观察，DTO、哈希和持久命令不包含AbortSignal。

ScheduleCommands与ScheduleQueries的真实方法见[services.ts](../../schedule-contract/src/services.ts)。queryOperation接受原业务identity与expectedFingerprint，或已保存operationRef；精确联合见[operation.ts](../../schedule-contract/src/operation.ts)。

下列JobControl仍为后续目标。

```ts
interface JobControl {
  get(ctx: CallContext, input: {jobId: Ref}): Promise<QueryResult<JobView>>
  cancel(ctx: CallContext, input: {jobId: Ref; reason: string; meta: CommandMeta}): Promise<CommandResult<JobView>>
}
```

分页、筛选、预览及agenda DTO见[queries.ts](../../schedule-contract/src/queries.ts)，执行历史行见[history.ts](../../schedule-contract/src/history.ts)，操作观察联合见[results.ts](../../schedule-contract/src/results.ts)。不从此页复制另一份字段表。

agentRef只匹配安排作者为agent且author.actorRef相等，不匹配执行用的AgentDefinition或会话。createdBy匹配作者兼容投影；多个筛选同时给出时取交集。calendarId匹配当前安排绑定：explicit取definition.binding.calendar的calendarId，follow取已保存adoptedBasis.calendarId。尚无可知日历时不匹配，不为列表读取外域或猜测日历。执行历史仍按原采用依据读取。

total 计算同一筛选、同一 observationRevision 和当前有权可见集合中的全部匹配行，不是本页长度，也不泄露不可见对象数量。ScheduleQueries.list 成功必须返回 exact 总数；不能完成一致计数时返回明确查询错误，不以 unknown 交付成功列表。其余有界计算读面允许 unknown 并给出原因。分页期间数据或权限观察边界变化使原 cursor 失效，不能沿用旧总数；无法取得一致观察边界时明确查询失败。Repository 的 listSchedules 必须在同一观察边界返回页面与总数，HTTP/Tool/SDK 原样携带。验收覆盖 501 条匹配、50 条首屏、过滤及权限变化、计数不可用和截断，不能通过穷举不稳定页面补算。

SchedulePatch.executionText只允许purpose.execution且work.kind=agent。程序引用/输入、会话模式与目标、运行模式、工作区和资料引用变更走replace；draft可通过reviseDraft完整修订。

Calendar 查询的完整形状和默认补全规则归 [Calendar API 设计](../../../calendar/calendar/docs/public-api-design.md#日历值与查询)。

### 4.1 内部应用接口

这些不是 Agent tool，也不允许以普通 owner 身份调用。CalendarSupply 的真实输入与结果见 [Calendar 供应公开索引](../../../calendar/calendar-contract/docs/public-api.md#定义索引)，不在本页复制。

| 服务/操作 | 输入 | 结果 | 资格/幂等 |
|---|---|---|---|
| ScheduleAdmission.prepare | scheduleId、sourceKeys、scheduledAt、expectedRevision、operationKey | durable PreparationView 或 rejected/unknown | scheduler principal，proof key |
| ScheduleAdmission.admit | preparationId、fingerprint、operationKey | ReceiptView 或 rejected/unknown | scheduler principal；occurrence 唯一 |
| ScheduleAdmission.reconcile | scheduleId、authority evidence refs、operationKey | current standing/rebinding result | reconciliation principal；版本单调 |
| ScheduleAdmission.recordOutcome | jobId、outcome={kind:execution,executionReceiptRef} 或 {kind:notification,intentId,notificationReceiptRef}、providerGeneration、operationKey | JobView 或 rejected/unknown | 原 provider 的验证身份 |
| ScheduleAdmission.recover | operationRef | retained progress | recovery principal；禁止任意重放工作 |

持久 ports 不暴露 `transaction(async callback)`。采用 `registerCombination(definition)`、`commit(operationIdentity, typedCommands)`、`query(operationIdentity)`，精确 storage 类型从其公共契约引用。各 participant 独立验证命令参数与 schema，禁止 UI/Tool 直接指定 SQL/表/transactionDomain。

## 5. Job 执行端口与外部组合接缝

| 服务 | 操作签名（均以可信 ctx 开始） | 稳定结果 |
| --- | --- | --- |
| EnvironmentReader | read(ownerRef)；subscribeChanges(scope,observer) | EffectiveEnvironment `{owner,revision,activeTimezone,activeCalendarId,observedAt}`；scope disposer |
| AuthorityReader | evaluate(action,subjectRefs,payloadHash,consentRef) | allowed + authorityEvidence/guardRefs，或 denied/unknown；不返回可复制凭证 |
| AuthorityParticipant | verifyGuards(guardRefs,commitContext) | valid / stale / denied / unavailable；必须与撤权语义同边界 |
| QuotaParticipant | reserve(owner,authorRef,resource=standingWork,delta,policyRevision,operationKey,commitContext) | reserved/rejected/stale；与create/replace/终态变更同提交；查询与补偿沿原operation |
| ProgressMonitor | recordSuspend/recordResume(runRef,traceRef,wakeId,generation,progressCheckpointRef)；evaluate(runRef) | continue/noProgress/lifetimeExceeded，继续原状态，不因挂起重置 |
| ScheduleSubscriptions | listFeatures(PageRequest)；list(PageRequest)；enable(featureId,definitionVersion,parameters或null,meta)；updateParameters(subscriptionId,parameters,meta)；pause/resume/cancel(subscriptionId,meta) | SubscriptionView 或 CommandResult |
| SessionContinuation | suspendUntil({dueAt,reason,checkpointRef,bounds,meta})；retime({wakeId,generation,dueAt,meta})；cancel({wakeId,generation,meta})；get({wakeId}) | WakeView / CommandResult；Session从可信ctx取得 |
| JobExecutor（契约归Job） | inspect({work,owner})；start({jobId,attemptId,frozenWork,basis,guardRefs})；query({jobId,attemptId})；requestStop({executionRef,operationKey,reason}) | inspect→ready/blocked/rejected + prerequisiteProof；start/query→accepted/pending/unknown/rejected，携带executionRef与resolvedTargetRef或null；stopped需真实终态回执 |
| MasterReturn | accept({masterRef,jobId,resultRef,resultVersion,operationKey})；query({operationKey,masterRef}) | queued/accepted/blocked/unknown/rejected + durable returnRef |

SubscriptionView：subscriptionId、owner、featureId、definitionVersion、parameters、control、standing、offsetSeconds、offsetPolicyVersion、createdAt、revision、controllable、controlReason、authorityAssignmentRef或null。FeatureView为featureId、definitionVersion、label、controllable、controlReason、parameterSchemaRef、defaults、windowSeconds、applicabilityRef。parameters 必须按对应 feature 的已注册 StandardSchema 校验，不能传自由脚本；错峰 windowSeconds 来自产品定义。

WakeView：wakeId、sessionRef、generation、dueAt、checkpointRef、reason、state=pending/claimed/resumed/cancelled/expired/blocked、bounds、wakeCount、activeBudgetUsed、runRef、traceRef、progressCheckpointRef、revision。bounds：hardDeadline:Instant、maxWakeCount:positive integer、maxActiveBudgetMs:positive integer、minIntervalMs:positive integer。retime 不能超过 hardDeadline，也不能重置计数或预算。claim/resume 为内部授权方法，不是 Agent 的公开参数。

attemptId 是本次 Job 执行的稳定交接标识，由首次启动准备持久分配。它不是 Session 的 Run attempt 或 runtime 代数；普通恢复、响应丢失和 provider 换代不得重分配。新业务重跑需要显式创建新 Job。

prerequisiteProof：executorKind=program/agent、workFingerprint、owner、targetRef、authorityEvidenceRefs、guardRefs、version、capabilities={query:boolean,stop:boolean}。其中targetRef是opaque值，不嵌入Session/Agent对象。它只陈述受约束的当前可执行性，不成为永久许可。程序不支持真实停止时不得选择依赖停止保证的replace策略。

EnvironmentReader、AuthorityReader 属各自拥有者的公共消费契约候选。JobExecutor 由 Job 契约定义，程序执行适配器和 Agent 执行适配器分别实现它。Agent 适配器可依赖 Session intake/inbound、Agent 装配与执行服务，Schedule/Job 核心不得依赖这些领域。

上表的 SessionContinuation、ProgressMonitor、MasterReturn 及 WakeView 是**外部产品组合**的交接设计，归各自拥有者与适配器，不是 Schedule 的 imports、inject 或根导出。保留这些条目是为了覆盖源 S13/S14，不把其实现责任移入日程域。

## 6. 结果、通知及事件

```ts
type PublicationPlan =
  | { kind: 'none' }
  | { kind: 'master' }
  | { kind: 'provider'; providerRef: Ref }
interface ResultPolicy {
  audience: {kind: 'masterInternal'} | {kind: 'userDeliverable'; target: {kind: 'owner'} | {kind: 'authorizedTarget'; targetRef: Ref}}
  publication: PublicationPlan
  resultSeriesId: Ref | null
  attention: 'silent' | 'inbox' | 'notify'
  archive: {kind: 'none'} | {kind: 'provider'; providerRef: Ref; targetRef: Ref}
}
type Outcome =
  | {kind: 'notRequested'}
  | {kind: 'pending'; operationRef: Ref}
  | {kind: 'succeeded'; operationRef: Ref; resultRef: Ref}
  | {kind: 'failed' | 'blocked'; operationRef: Ref; reasonCode: string}
  | {kind: 'unknown'; operationRef: Ref}
type PublicationOutcome =
  | {kind: 'notRequested'}
  | (Exclude<Outcome, {kind: 'notRequested'}> & {
      phase: 'preparing' | 'publishing'
      artifact: {artifactRef: Ref; artifactVersion: Ref} | null
      preparationReceiptRef: Ref | null
    })
interface ResultOutcomes { masterReturn: Outcome; publication: PublicationOutcome; archive: Outcome }
```

PublicationOutcome.notRequested 无阶段。其余分支必须有 phase，unknown/failed/blocked 保留失败或未知发生的原阶段及 operationRef。preparing 尚无正式成果时 artifact 和 preparationReceiptRef 为 null，准备成功后两者必填。publishing 的全部分支都携带已确认的 artifact 与 preparationReceiptRef。preparing+succeeded 只表示成果已准备，只有 publishing+succeeded 才表示发布完成。ResultQueries 原样返回该联合，不压成普通 Outcome。查询准备未知时按冻结 PublicationPlan 找原 master 适配器或 provider，发布未知只查原发布操作。

ResultPolicy 与 returnTo 联合校验。masterInternal 必须 returnTo 非 null、publication=none、attention=silent。userDeliverable 必须选择 publication.master 或 publication.provider，不能为 none。master 模式要求明确 returnTo，来源会话不自动补成返回目标。provider 模式可以有或没有 returnTo，但始终由指定 provider 形成用户成果；如有返回目标，masterReturn 仍独立执行，不等待它替代 provider 的整理。没有 returnTo 时 masterReturn=notRequested，不创建会话。

接受前须核验所选返回、成果形成、发布和归档能力及当前资格。providerRef 只能指已登记且支持当前结果类型的结果适配器，不能是任意脚本或网络地址。master 模式由外部 master 适配器交回带来源关联的正式 artifact。provider 模式调用 ResultPublication.prepare，依据原执行结果形成正式 artifact。prepare 不代表已发布，不得把 raw report 直接标为可公开成果，也不能隐式启动模型工作。publication 状态另带 phase=preparing/publishing，失败与 unknown 保留原阶段。

ResultPublication.inspect 输入为 `{owner,work,resultPolicy,returnTo}`，输出 ready `{providerRef,guardRefs}`、blocked `{reasonCode}` 或 rejected `{error}`。它通过外部适配检查所选成果路径及支持范围，不向 Job 核心返回 Session 对象。应用服务在 create、日程最终接受及受保护动作处核验适用守卫。

ResultPublication.prepare 输入为 `{jobId,resultEntryId,sourceReportRef,sourceReportVersion,providerRef,audience,operationKey}`。结果为 ready `{artifactRef,artifactVersion,sourceReportRef,preparationReceiptRef}`，或 blocked/failed/unknown 附原 operationRef 和原因。queryPreparation 按原 operationKey 查询。后续 publish 只接受经来源关联和当前披露资格核验的正式 artifact。master 提供的 artifact 同样要核验，不能因返回成功跳过。prepare 与 publish 分别使用稳定 operationKey，unknown 不改用另一 provider、另一 master 或新的执行 Job。准备/发布成功均先保存原回执再推进。

resultEntryId 在首次结果保管时分配并持久关联 jobId+resultVersion，重复事件认回原 entry。resultSeriesId 可 null，直接 Job 不伪造 occurrenceKey。结果读值保留 origin，scheduledAt 可 null，按 scheduledAt 非空否则 acceptedAt，再按 entryId 排序。历史报告、正式 artifact 和归档分别保留，不覆盖原始结果。

| 接缝 | 接受输入 | 查询与结果 |
| --- | --- | --- |
| ResultPublication.publish | jobId、resultSeriesId、resultEntryId、artifactRef、artifactVersion、sourceReportRef、audience、attention、operationKey | queryPublication(operationKey) → Outcome；验证当前披露资格 |
| ThematicArchive | jobId、artifactRef、providerRef、targetRef、operationKey | queryArchive(operationKey) → Outcome；provider拥有主题模型 |
| ResultQueries | getEntry(resultEntryId)；listSeries(resultSeriesId,PageRequest) | entryId、seriesId、occurrenceKey、scheduledAt、artifactRef/version、provenance、outcomes；按audience鉴权 |
| Notification | owner、sourceRef、semanticKey、content、audience、attention、humanRequestRef或null、urgency、safePreview、routePolicyRef、operationKey | acceptIntent→accepted(notificationId)/pending(intentId)/unknown/rejected；queryIntent(intentId) |
| Notification.requestCancelIntent | intentId、operationKey、reason；queryCancellation(operationKey,intentId) | cancelledBeforeAcceptance/acceptedAlready/pending/unknown/rejected，携带原intent及耐久竞争回执；acceptedAlready不能写Job cancelled |
| Notification inbox | PageRequest、ack(notificationId,meta) | InboxPage；ack回执；投递状态和ack独立 |

Notification 公共输出：notificationId、intentId、owner、sourceRef、acceptedAt、content、deliveryState（各attempt汇总）、attempts[]、humanRequestRef或null、lastDeliveryAttemptAt、acknowledgedAt、revision。每个attempt为attemptId、routeRef、routePolicyRevision、state=queued/delivered/failed/unknown、providerReceiptRef或null、startedAt、observedAt、reasonCode。所有attempt引用同一notificationId和已有humanRequestRef，不创建第二份可回答请求。urgency为routine/important/urgent，仅作政策输入，不绕过quiet hours或权限。safePreview为已经过通知策略校验的摘要；完整内容只在认证门面返回。routePolicyRef引用用户/系统权威政策，不能由Agent指定任意recipient。应用不得将 pending 的 intentId 填进 notificationId。Job结果入账必须验证原通知receipt归属同一intent/owner，按provider generation拒绝过期的新动作；重复回执不重复结算。

JobControl.cancel 对notification：未交接的outbox在同提交取消并确认不会send；交接竞争已经开始则保留cancel intent，调用requestCancelIntent并按原key查询。只有cancelledBeforeAcceptance可结算cancelled；acceptedAlready结算真实durableAvailable，pending/unknown保留责任。通知提供者必须按同一intent原子判定接受/取消，不能用HTTP abort表示取消。

内部事件 envelope：`{eventId,type,schemaVersion:1,owner,aggregateRef,aggregateRevision,occurredAt,operationRef,payload}`。events 不当作同步查询真相。消费者 inbox 以 producer+eventId 去重，同聚合 revision 单调；跨聚合无全序承诺。replay 不能绕过当前披露资格。

事件类型与最小 payload：

| 类型 | payload |
| --- | --- |
| calendar/version-published | calendarId、versionId、publicationGeneration、coverage、provenanceRef |
| schedule/definition-changed | scheduleId、definitionRevision、stateRevision、action、actorRef |
| schedule/control-changed | scheduleId、from、to、stateRevision、reason |
| schedule/standing-changed | scheduleId、standingGeneration、from、to、reasonCodes、authorityEvidenceRefs |
| schedule/replaced | predecessorId、successorId、operationRef |
| schedule/occurrence-decided | receiptId、occurrenceKey、preparationId、disposition、jobId或notificationIntentId或null |
| schedule/job-execution-changed | jobId、executionRef、revision、outcomeRef |
| schedule/job-result-changed | jobId、dimension、operationRef、outcome |
| session-continuation/wake-changed | wakeId、sessionRef、generation、state、dueAt |

事件名采用IC-10的owner范围/过去分词形式。`session-continuation`为外域候选拥有者名，接受时以其实际成员名定案，不能由schedule重复声明。持久事件通过outbox交给Cordis只作为唤醒提示，emit成功不等于耐久承接。事件字段仅含必要公开值，不嵌入 secret、Context 或外域运行时对象。外域事件最终沿其拥有者协议，表中名称为本设计候选。

## 7. HTTP、SDK 与错误

HTTP 为可选 transport adapter；业务 API 不依赖它。v1 base `/api/v1`。`Authorization` 由 host 处理；活动 tenant claim 须与身份和请求范围核验。不能直接信任 `X-Omne-Active-Tenant`。写请求 header `Idempotency-Key` 对应 meta.operationKey；`If-Match` 对应 expectedRevision，不允许 header/body 相互矛盾。consentRef 在 body。

| 方法与路径 | 应用方法 | 说明 |
| --- | --- | --- |
| GET /calendars | CalendarQueries.list | 无需先选择日历 |
| GET /calendars/effective | effective | 必须先于动态 id route 匹配 |
| GET /calendars/{id} | get | shipped roster身份 |
| GET /calendars/{id}/resolve | resolve explicit | date XOR from+to XOR after+next |
| GET /calendars/effective/resolve | resolve effective | 同上，version可选 |
| GET /schedules | list | scope 来自 ctx，agent filter 只缩小范围 |
| POST /schedules | create | 完整定义及 initial |
| GET /schedules/agenda | agenda | 静态路由先匹配 |
| POST /schedules/preview | preview | 只读，无 Idempotency-Key 要求 |
| GET /schedules/{id} | get | 无权/不存在统一隐藏 |
| PATCH /schedules/{id} | execute update | SchedulePatch |
| POST /schedules/{id}/actions | execute lifecycle / reconfirmConsent | action + reason，reconfirm另带newConsentRef；不允许任意命令名 |
| PUT /schedules/{id}/draft | execute reviseDraft | 仅draft完整修订 |
| POST /schedules/{id}/replace | execute replace | successor完整定义 |
| GET /schedules/{id}/revisions | revisions | 有界分页 |
| GET /schedules/{id}/executions | executions | 真实账，不把预测混入 |
| GET /jobs/{id} | JobControl.get | 原事实组合 |
| POST /jobs | JobCommands.create | 直接接受，来源由可信 ctx 推导 |
| POST /jobs/{id}/cancel | JobControl.cancel | 请求停止不返回“已撤销效果” |
| GET /operations/{id} | JobCommands.queryOperation 或 ScheduleCommands.queryOperation | 按原操作类型分派，核验 owner、主体及来源范围 |
| GET /schedule-features | subscriptions.listFeatures | 含受影响不可控feature及原因 |
| GET /schedule-subscriptions | subscriptions.list | 用户订阅 |
| GET /result-series/{id}/entries | ResultQueries.listSeries | 按audience与owner鉴权 |
| GET /result-entries/{id} | ResultQueries.getEntry | 原结果身份 |
| POST /schedule-subscriptions | subscriptions.enable | 固定feature版本 |
| POST /schedule-subscriptions/{id}/actions | pause/resume/cancel | CAS与幂等 |
| PATCH /schedule-subscriptions/{id}/parameters | updateParameters | 完整参数替换，其他订阅者不变 |

Self-wake 只暴露 runtime 可信工具适配，v1 不提供让任意 HTTP 调用者指定 sessionId 的通用入口。prepare/admit/recordOutcome/供应写入走 service-only/internal adapter，与上述用户路由分开认证和部署。

成功读返回200，首次create committed返回201；其他committed/noChange返回200；unknown返回202+operationRef+Retry-After，不能返回500后诱导新键重建。HTTP envelope保留kind。业务拒绝按下表映射。

| ErrorCode | HTTP | retryable | 边界 |
|---|---|---|---|
| unauthenticated | 401 | false | 身份未证明 |
| not_found | 404 | false | 对象不存在或该调用者无读取范围，不泄露区别 |
| forbidden | 403 | false | 已公开动作范围内明确无权限，不额外泄露对象 |
| consent_required | 403 | false | 当前请求缺少所需同意，不创建 Job；取得同意后作为新批准命令提交 |
| invalid_input / unsupported_rule / invalid_timezone | 422 | false | 含字段路径，不回传秘密 |
| missing_environment / environment_incoherent | 422 | false | owner环境可理解失败 |
| unknown_calendar_version / coverage_insufficient | 422 | false | 不fallback |
| invalid_transition / no_future_slot | 409 | false | lifecycle / promote |
| revision_conflict / stale_basis / stale_cursor | 409 | true | 读新状态后新决定，不无条件重放旧请求 |
| operation_key_conflict / preparation_conflict | 409 | false | 同键异内容 |
| dependency_blocked / authority_unavailable | 503 | true | 按原操作查询，权限不可证则不放行 |
| search_limit | 422 | false | 返回预算原因，需缩范围或明确治理 |
| capacity_exceeded | 429 | true | Retry-After，不丢已接受责任 |
| provider_failure | 503 | true | 实际提供者故障，不假报业务空结果 |

可重试指允许恢复/再观察，不授予新 identity 重发。unknown不是ErrorCode。查询取消不撤销业务。写请求HTTP断开仅取消等待，服务仍保留operationRef；调用方可按原key查询。

## 8. 独立 Agent tools

日历/日程/Job 工具包只依赖相应应用根契约及 `./cordis` Service 定义，不 import provider 或 Session/Agent 领域。下表 session_wake 属另外的 Session 工具插件，不进入日程工具包。下列为本次目标 tool 名，action ID 是稳定权限语义，不使用整个 tool 名作为唯一许可粒度。

| Tool | command/输入 | inject 必需服务 | 应用调用与动作 |
|---|---|---|---|
| calendar | list/get/effective/resolve | calendarQuery | 对应 CalendarQueries；calendar.read |
| schedule | list/get/preview/agenda/history | scheduleQueries | schedule.read/preview |
| schedule | create/reviseDraft/update/pause/resume/stop/promote/discard/replace/reconfirmConsent | scheduleCommands | schedule.{action}，按作者同意规则检查适用授权；granular 且无适用 standing blanket 时，对已生效安排变更逐命令确认；草稿及 reconfirmConsent 沿各自规则 |
| schedule | operation | scheduleCommands | queryOperation；schedule.operation.read |
| job | create | jobCommands | JobCommands.create；job.create；agent 来源会话来自可信 ctx |
| job | operation | jobCommands | JobCommands.queryOperation；job.operation.read；核验原操作归属 |
| job | get/cancel | jobControl | job.read/job.cancel |
| schedule_subscription | listFeatures/list/enable/updateParameters/pause/resume/cancel | scheduleSubscriptions | subscription.{action} |
| session_wake | suspendUntil/retime/cancel/get | sessionContinuation | session.selfWake.{action}；Session来自ctx |

一个 tool 对多命令使用判别联合 schema，每种命令只接受其字段。创建、修改、取消的 operationKey 由可信 adapter 为本次已批准意图生成并保存，模型重试同一调用时复用。模型若提供稳定请求标识，只作关联提示，不能替代 payload consent hash。

输出保留 kind、operationRef、实体稳定ID、state及少量解释。结果超过上下文预算时返回summary+detailRef+truncated=true，不能删错误或把unknown改为success。Tool不负责自然语言生成业务规则，解析意图后必须向应用服务提交明确完整定义。

### Cordis 采用约束

当前目标锁文件采用 `@deepseek-ai/cordis 4.0.4`。本设计消费现行IC，不推测新版本。服务 key 常量与 Service 定义同源，`static readonly inject` 引用这些常量。示意对应关系为 `ScheduleCommandsService.provide === scheduleCommandsKey`，不复制字符串注册第二个 Service。Provider 继承该 Service 并实现根 ScheduleCommands；tools 只依赖 binding。具体 TypeScript decorator、service constructor 与 package import 路径须取目标锁定版本的源码/官方文档，不由示意代码猜测。

以下是 schedule-cordis-contract 成员内 `./cordis` 的目标定义形状，使用现有 IC-2/3 的索引签名模式。它不引入具体提供者：

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ScheduleCommands } from '@omne-harness/schedule-contract'
/** @owner packages/schedule/schedule-cordis-contract */
export abstract class ScheduleCommandsService extends Service implements ScheduleCommands {
  static readonly provide = 'scheduleCommands'
  constructor(ctx: Context) { super(ctx, ScheduleCommandsService.provide) }
  abstract readonly create: ScheduleCommands['create']
  abstract readonly execute: ScheduleCommands['execute']
  abstract readonly queryOperation: ScheduleCommands['queryOperation']
}
export const scheduleCommandsKey = ScheduleCommandsService.provide
declare module '@deepseek-ai/cordis' {
  interface Context { scheduleCommands: ScheduleCommandsService }
}
```

其他 seam 按同一形状分别拥有：JobExecutor→jobExecutor、ScheduleCommands→scheduleCommands、ScheduleQueries→scheduleQueries、JobCommands→jobCommands、JobControl→jobControl、ScheduleSubscriptions→scheduleSubscriptions。CalendarSupply→calendarSupply 归 calendar-cordis-contract，SessionContinuation 归 Session 的实际成员。tools作者插件声明 `static readonly inject = [scheduleCommandsKey]` 或对应服务key的数组字面量，并通过 `ctx.scheduleCommands` 调用，不能自己new服务/取provider。

Tool贡献的发布、装载与撤除沿[Tool Cordis已接受设计](../../../tool/tool-cordis-contract/docs/cordis.md)及tool-host-local，使用既有绑定与贡献权限协议，不能在本设计另造registerTool全局表。本组 tools 与执行适配尚未实现，P7须补真实装配验收，不能把有抽象Service当作工具已能运行。

依赖消失时停止注册新调用，已接受业务责任由应用/持久化保管。卸载旧 tool 的 disposer 只移除其注册 token，不删新实例同名 tool，也不停止所有 schedule。

## 9. 发布契约前的检查

1. 将本设计类型在实际拥有者写成唯一 TypeScript/StandardSchema 定义，生成JSON schema及SDK，不能手写三套同义字段。
2. 契约测试覆盖每个判别联合合法/非法分支、额外字段、null、长度字节及时间格式，验证tool/HTTP只作映射。
3. 各跨域port由其拥有者签认其前提，尤其authority fence、JobExecutor query/stop及notification durable accept；Session suspend/claim仅由外部组合核对，不能变成Schedule的强制依赖。
4. 将Source 154条与目标N01–N27分配给实际验收入口，未实现/无法验证必须保留。
5. 按已确认的D1–D10同步正式产品、领域与成员正文。D9只保留统一CatchUp，D3明确身份/版本两轴，D4保留双次数，D5保留完整作者生命周期。该动作是落实已确认设计，不再重新征求同一选择。
6. 一次性交付全部已定义用例与真实适配器。施工可以分批，但不得以空实现、兼容模式、隐式回退或未接入的port作为完成状态。

## 设计使用示例与端口边界

以下为等价输入示意，不是可运行导出。纯应用调用、HTTP、Tool 都把同一明确 command 交给应用服务，应用服务核验可信 ctx、同意、CAS 与原操作，adapter 不重做业务决定。

```text
program: {kind:program, programRef:registered-backup-v1, input:{resourceRef:workspace-A}}
agent/new: {kind:agent, instruction:生成本周摘要, session:{mode:new, agentDefinitionRef:agent-definition-42, modes:{permission:never, environmentAdoptionRef:env-1, collaboration:auto-drive}, workspace:null}, materials:[], returnTo:null, resultPolicy:...}
agent/existing: {kind:agent, instruction:补充上次问题的分析, session:{mode:existing, sessionRef:session-7}, materials:[], returnTo:null, resultPolicy:...}
```

JobExecutor 是本域端口，inspect/start/query/requestStop 的输入和结果在第 5 节唯一维护。实现它的 program adapter 和 agent adapter 在装配层分离；程序 adapter 不依赖 Session。start 的 accepted 只表示承接，必须带原 executionRef，pending/unknown 不能结算成功。query 返回原执行观察及可核对终态回执，最终结果由 recordOutcome 的原 receipt 引用入账。requestStop 返回 pending/unknown/rejected 或带真实停止依据的 stopped，不将 AbortSignal 当停止证明。目标引用解析失败绝不改变 session.mode。

JobStore/PreparationStore/OutboxStore 是本域持久消费端口，保存与查询原 operation；组合提交以真实 sql-contract 类型实现。Authority/Environment/Calendar 的版本守卫分别由语义拥有者 participant 提供。缺少强撤权 fence 时对应接受路径 blocked，不把 storage check→commit 窗口写成强保证。SessionContinuation、ProgressMonitor、MasterReturn 和结果/归档/通知接缝是外部组合契约候选，由各自拥有者接纳后实现；它们不是 Schedule 核心 imports、inject 或根导出。

## JobExecutor 精确结果设计

所有方法先接受可信 CallContext，进程内 options 可含 signal。start/query 的稳定寻址是同一 owner+jobId+attemptId。attemptId 是首次启动准备持久分配的交接身份，unknown、恢复和 provider 换代均不得替换。执行拥有者内部恢复不改变此交接身份；新业务重跑显式创建新 Job，不能借换 attempt 重放已有外部效果。

| 方法 | 完整目标输入 | 输出字段与条件 |
| --- | --- | --- |
| inspect | work、owner | ready附prerequisiteProof；blocked附reasonCode、authorityEvidenceRefs、retryAfterMs；rejected附DomainError |
| start | jobId、attemptId、frozenWork、basis、guardRefs | ExecutionObservation；幂等键比较workFingerprint，异内容明确拒绝 |
| query | jobId、attemptId | 原ExecutionObservation，不启动工作；无法找到不等于证明未启动 |
| requestStop | executionRef、operationKey、reason | pending或unknown附原operationRef；rejected附DomainError；stopped附executionRef、stopReceiptRef、observedAt；alreadyTerminal附原terminalReceiptRef及outcome，不能改写原结局 |

ExecutionObservation 的 agent 执行观察另含 executionAdoptions[]，每项为 opaque executionUnitRef、agentDefinitionRef、adoptedReleaseRef、adoptionReceiptRef。这些是执行拥有者出具的实际采用证据，不是 Job 可指定的版本；尚未采用时数组为空。一个 Job 涉及多个新 Run 时按各自执行单元保留证据，恢复不改写旧项。查询和 recordOutcome 保留原关联证据，不能只记录最后版本。

ExecutionObservation是判别联合。accepted含executionRef、resolvedTargetRef、acceptedReceiptRef、acceptedAt与progress，progress为queued、running或terminal。queued没有startedAt/终态；running含startedAt；terminal含startedAt或null、terminalReceiptRef、finishedAt、outcome=succeeded/failed/cancelled及resultEvidenceRefs。pending含operationRef及retryAfterMs，executionRef/resolvedTargetRef可null；unknown含operationRef及已知关联，不提供终态；rejected含DomainError且只能在有确定拒绝依据时使用。已started与未started取消的差别保留在terminal的原receipt，不能仅看Job投影猜测。

PrerequisiteProof的capabilities.query必须为true才可用于后台执行；需要真实停止的overlap=replace还要求stop=true及相应契约。原provider在返回receipt前保管执行与结果；本域recordOutcome验证owner、jobId/attemptId、executionRef、providerGeneration及receipt归属，重复入账认回同结果。新的失效generation不得发新动作，合法原结果仍入原Job。接收持久结果与通知/结果后续操作有独立outbox，记录完毕不意味着所有尾责结束。

## 纯应用工厂与持久端口

当前实现分别导出createScheduleManagementApplication、createSchedulePredictionService和createScheduleQueryApplication。其依赖形状见[management/types.ts](../src/management/types.ts)、[prediction/types.ts](../src/prediction/types.ts)、[queries/types.ts](../src/queries/types.ts)。管理持久命令只实现saveDefinition和replaceDefinition。以下包含Job、扫描和outbox执行的统一工厂及其他命令仍是后续目标，不是当前导出。

目标工厂 createScheduleApplication(dependencies)返回{commands,queries,jobCommands,jobControl,admission,subscriptions}。dependencies为Clock、ScheduleRepository、SchedulePersistence、CalendarQueries与CalendarBasisGuardParticipant、EnvironmentReader/Participant、AuthorityReader/Participant、QuotaParticipant、JobExecutor、Notification、ResultPublication、ThematicArchive以及受管运行器配置。运行器与tools是可选装配，不影响纯API。仅特定操作解析它实际需要的port：program不因缺Session/Agent而失败，查询不因执行/通知未装载而不可读。self-wake/ProgressMonitor/MasterReturn在外部组合中接入，不能进入这个核心工厂的必需依赖。agent的returnTo由外部执行/结果适配承担。

ScheduleRepository提供readSchedule、listSchedules、readRevisions、readExecutions、readJob、readPreparation、readReceipt、loadRecovery、scanOutbox；输入为可信owner、稳定引用、声明的筛选/分页/观察revision。返回ok/absent/changed/unavailable，absent只有权威成功读取且不存在时成立；任何I/O故障不转empty。scanOutbox只给受信dispatcher，不能成为普通查询写入。

SchedulePersistence.commit接收完整operationIdentity和以下唯一typed command，结果保持真实sql-contract联合；query按同身份认回。各command的expectedRevision、guardRefs、payloadHash必须按公开DTO构造，领域participant复核，不接受调用者任意指定表/SQL/transactionDomain。

| typed command | 原子写集合与冲突条件 |
| --- | --- |
| acceptDirectJob | 原可信来源、完整直接定义、当前授权/同意/资源守卫、Job、direct receipt、原 operation 与初始 outbox 同提交；不写 Schedule 或时隙计数 |
| saveDefinition | create/reviseDraft/update/control/reconfirm对应完整定义或合法patch、revision、actor、审计、quota变化、事件outbox；错误零部分写入 |
| replaceDefinition | 原expectedRevision/新定义/新ID；旧superseded、新后继、双向lineage、quota转移与receipt同提交 |
| savePreparation | preparationKey、完整冻结依据和fingerprint；同键同内容认回，异内容preparation_conflict |
| decideOccurrence | preparationId/fingerprint、当前Schedule/Calendar/环境/权限/配额守卫、来源、合格序位、jobLimit、重叠集合；receipt、来源处置、计数、Job与初始outbox一起成立，任一前提stale不半接纳 |
| disposeRecoverySpan | 固定T、timeRuleRevision、已处理区间、选中集合与不补/降级区间；与已判决receipt兼容，不能分页补光 |
| recordControl | jobId/revision、stop意图、start交接状态、通知cancel intent及原控制outbox；和原启动/终态确定判序 |
| recordOutcome | 原execution或notification receipt、原provider generation；结果、实际事件、该事件通知义务和后续outbox一致保存 |
| settleOutbox | 原intent/operation、可靠承接receipt及本方状态；未确认不解除责任，不重新创建Job或事件 |

后台服务用这些端口做prepare/admit/reconcile/recover，不新增第二个后台调度路径。持久实现的表名/索引名是实现细节，但唯一约束必须覆盖owner+schedule+source、有效occurrence、原operation及Job/event通知义务。跨库/远端authority的强保证仍受[真实存储差额](internals.md#实际存储能力与未闭合保证)约束；公开设计完整不表示这些机制已验证。

## 身份与状态值约束

CalendarId是明确业务日历身份，首批三历为cn-legal-holidays、jp-legal-holidays、us-federal-holidays。CalendarVersionId及外域program/profile/session/returnTo/provider/authority refs是不透明的非空稳定引用，schema校验各自语法，不相互替代。目标ScheduleId、JobId、PreparationId、ReceiptId、AttemptId、SubscriptionId、resultSeriesId/resultEntryId分别使用独立的规范小写UUID；导入保留原sourceScheduleKey和映射，不把源job_id直接变成JobId。operationRef指向本域保存的完整storage操作身份，不仅是时间戳；operationKey是调用方提供并在重试保留的稳定字符串。

后续耐久来源去重身份由owner、scheduleId、timeRuleRevision与原civil候选身份确定。当前只读预测的sourceKeys标识规则内原来源，尚未包含Schedule持久去重身份；Admission须在接受时加上该业务作用域。环境/日历平移和不同Preparation不能改变它。occurrenceKey按owner、scheduleId、timeRuleRevision和合并后的有效scheduledAt确定，多个sourceKey可映射一个occurrence；subscriber另包含subscriptionId。哈希输入使用带协议/类别标签的规范tuple，按共同JCS/SHA-256规则编码。去重同时保护sourceKey和有效occurrence，重算换日期不能再次执行已处理来源。

ScheduleView.control枚举draft/active/paused/stopped/exhausted/discarded/superseded；standing为ready/blocked/terminallyInvalidated。revision为正safe integer，每次有效变更单调增加；definitionRevision只随定义变更，timeRuleRevision只随时间意图改变，stateRevision随管理/standing变更。重要变更新建Schedule，不复用旧identity重置序位。当前eligibleConsumed与acceptedJobCount在只读预算/详情中可见，Job计数不退款。

JobView.stopState为none/requested/pending/confirmed/unknown，并保留stopOperationRef或null、原stopReceiptRef或null及reason。只有真实确认可写confirmed；请求先于未启动动作时还要保存不会start的确定证据。executionState是accepted/waiting/startPending/running/blocked/concluded，与ExecutionObservation及stopState分开；concluded需要原terminalReceiptRef，unknown不能自行进入。通知分支的primaryOutcome与intent取消结果在第6节维护，不塞入executionState。公开投影必须保留原receipt及观测位置，不能靠组合字符串推测尚无依据的状态。
