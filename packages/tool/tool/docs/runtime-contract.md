# Tool 主干运行契约候选

本页是 [#342](https://github.com/nemori-ai/omne-harness-lite/issues/342) 的候选设计，尚未技术接受。既有行为归 [SPEC](../SPEC.md) 及其必要专题，当前生产根入口只有资产正文端口。本页声明的 runtime、executor 和结果接口尚未实现。共同对象关系见[运行对象模型](../../../../docs/architecture/runtime/runtime-contract-model.md)。

Tool 拥有一次原调用、真实执行、等待、控制、原结果、效果与交付关系。它不替被调用领域写私有状态，不拥有 Run 终态。前台转后台改变等待关系，仍是同一执行。全文保留与待交付关系分开，下面没有 Model ACK 或按其规则清理 Tool 全文的操作。

## 值、定义和固定请求

所有代码块组成同一候选声明。品牌身份防止混用，不代替租户和当前资格核验。`P` 是身份拥有者交付的可信输入；`R` 是普通函数的返回值类型；`B` 是当前具名结果政策允许的块类型。提供者必须验证真实值，不能通过泛型参数声明某种块已经获准。

```ts
import type { Outcome } from '@omne-harness/kernel-basis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'

declare const toolIdentity: unique symbol
export type ToolIdentity<K extends string> = string & { readonly [toolIdentity]: K }
export type ToolCallId = ToolIdentity<'ToolCallId'>
export type ToolOperationId = ToolIdentity<'ToolOperationId'>
export type ToolInstanceId = ToolIdentity<'ToolInstanceId'>
export type ToolWaitId = ToolIdentity<'ToolWaitId'>
export type ToolResultVersion = ToolIdentity<'ToolResultVersion'>
export type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>
export type ToolCursor = ToolIdentity<'ToolCursor'>
export type ToolRevision = ToolIdentity<'ToolRevision'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type DurableEvidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type CallAccess<P> = Access<P> & Readonly<{ call: ToolCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ToolOperationId }>
export type ParameterContract = Readonly<{
  schema: JsonValue; vocabulary: Adoption; descriptions: readonly Readonly<{ path: string; text: string }>[]
}>
export type ToolDefinition = Readonly<{
  adoption: Adoption; name: string; description: string
  requiredCapabilities: readonly string[]
  backgroundAllowed: boolean
  declarations: Adoption
}> & (
  | Readonly<{ kind: 'function'; parameters: ParameterContract }>
  | Readonly<{
      kind: 'commands'; commands: readonly Readonly<{
        name: string; summary: string
        parameters: Readonly<{ kind: 'declared'; value: ParameterContract }> | Readonly<{ kind: 'executor-owned' }>
      }>[]
    }>
)
export type ToolAvailability =
  | Readonly<{ kind: 'available'; definition: ToolDefinition; executor: Adoption }>
  | Readonly<{ kind: 'known-unavailable'; definition: ToolDefinition; reason: string }>
export type ToolArguments = Readonly<{
  original: string; effective: string; complete: boolean
}>
export type ResourceScope =
  | Readonly<{ kind: 'session'; owner: string; session: string }>
  | Readonly<{ kind: 'independent'; owner: string; resource: string }>
export type FixedToolRequest = Readonly<{
  availability: ToolAvailability
  command: string | null
  arguments: ToolArguments
  settings: Adoption; context: Adoption; workspace: Adoption | null
  environment: Adoption; resources: readonly Adoption[]
  scope: ResourceScope; consumer: ConsumerRef
  batchDecision: DurableEvidence | null
  mode: 'foreground' | 'background'
  limits: Readonly<{
    concurrency: number | null; foregroundMs: number | null; backgroundAfterMs: number | null
  }>
}>
```

Adoption 与 DurableEvidence 分别是精确采用和耐久事实引用，摘要只证明内容一致，不证明资格。提供者能按引用恢复完整原采用，不能只保留一个可能失效的地址。ConsumerRef 是消费拥有者登记的稳定位置，实际存在的 Session/Run/attempt/step/action 关联另由受信适配器核验并随原调用保存。资源 scope 是治理键，不是授权输入；session 键必须解析到同租户真实 Session，独立键由该资源拥有者授予使用范围，不能让调用者换键绕过限流。

Tool 的这些类型由 Tool 自己拥有，不导入 Model 的身份或 ACK 类型。跨成员引用在实际适配处逐项映射。相同字段形状不代表可以跳过原记录、租户或来源检查。

定义继续采用现有资产名称和正文规则。函数参数 Schema 的每个参数有说明；多命令清单的每项有名字与一行说明，声明详细参数时也须完整。统一 inspect 返回合法定义、可用性、命令清单及可取得的详细用法；help 使用同一固定采用，不能自行编另一份 Schema。executor-owned 表示由执行者判断参数，不表示任意参数总是合法。

原参数和扩展后生效参数均按原始 JSON 文本保存，使用 json-text 做无重复键的完整解析。complete=false 或解析失败不得启动真实工具。known-unavailable 在托管身份及目标核验后不解析参数、不创建原执行资源，直接形成带原因的不可用结果；这一规则不让调用者绕过租户检查。缺乏任何合法旧定义的目标不构造 dummy。

并发上限必须为正整数，时限为非负有限整数。未声明且无合法配值时为 null，不擅自设生产默认。后台许可来自作者定义，设置只能在许可内选择阈值。固定 settings 与 limits 必须一致；后续设置变化不重写旧执行的采用。实际资格收窄仍立即约束新的受保护动作。

## 返回与执行事实

```ts
export type Attachment = Readonly<{
  storage: string; key: string; mediaType: string; bytes: string; digest: string
}>
export type ToolResult<B extends ContentBlock> = Readonly<{
  content: readonly B[]
  original: Readonly<{ kind: 'none' }> | Readonly<{
    kind: 'offloaded'; source: Attachment; summary: readonly B[]
  }>
  attachments: readonly Attachment[]
}>
export type Effect =
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'not-occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
export type StopReason = 'user' | 'foreground-timeout' | 'run-cancelled'
  | 'session-archived' | 'interruption' | 'agent-owned-background'
export type ToolTerminal =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'failed'; cause: 'arguments' | 'environment' | 'executor' | 'runtime-lost' | 'result'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'interrupted'; reason: StopReason }>
  | Readonly<{ kind: 'no-response'; wait: ToolWaitId; reason: string }>
export type ToolFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: ToolOperationId }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationId }>
  | Readonly<{ kind: 'not-settled' }>
  | Readonly<{ kind: 'stale-instance'; instance: ToolInstanceId }>
  | Readonly<{ kind: 'unsupported'; adoption: Adoption; reason: string }>
export type Reply<T> = Promise<Outcome<T, ToolFailure>>
export type WaitState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'ask'; wait: ToolWaitId; card: DurableEvidence; resume: DurableEvidence
      decision: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'resource'; wait: ToolWaitId; contract: Adoption
      deadline: string | null; resume: DurableEvidence
    }>
export type DeliveryState =
  | Readonly<{ kind: 'pending'; delivery: ToolDeliveryId; consumer: ConsumerRef }>
  | Readonly<{ kind: 'released'; delivery: ToolDeliveryId; consumer: ConsumerRef; evidence: DurableEvidence }>
export type ToolState = Readonly<{
  call: ToolCallId; revision: ToolRevision; wait: WaitState
  source: DurableEvidence; foreground: ForegroundReturn | null
  relation: 'foreground' | 'background'; effect: Effect
  foregroundElapsedMs: string; delivery: DeliveryState
  supplements: readonly Readonly<{
    result: ToolResultVersion; actual: ToolTerminal; delivery: DeliveryState; source: DurableEvidence
  }>[]
}> & (
  | Readonly<{ phase: 'accepted' | 'preparing' | 'queued' }>
  | Readonly<{ phase: 'running'; instance: ToolInstanceId }>
  | Readonly<{ phase: 'suspended'; checkpoint: DurableEvidence }>
  | Readonly<{ phase: 'settled'; terminal: ToolTerminal; result: ToolResultVersion }>
)
export type ResultPage<B extends ContentBlock> = Readonly<{
  result: ToolResultVersion; terminal: ToolTerminal; effect: Effect
  actualTerminal: ToolTerminal | null; relation: 'original' | 'late'; delivery: ToolDeliveryId
  source: DurableEvidence
  value: ToolResult<B>; next: string | null
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; revision: ToolRevision }>
  | Readonly<{ kind: 'rolled-back' | 'not-committed' }>
  | Readonly<{ kind: 'unknown' }>
export type ToolLookup = Readonly<{ kind: 'found'; state: ToolState }>
  | Readonly<{ kind: 'not-accepted'; operation: ToolOperationId }>
```

调用准入失败属于 ToolFailure；已经形成原逻辑结果的参数失败、dummy 不可用、执行失败、中断或等不到资源应答属于 ToolTerminal，供消费者正常处理。失败不推导效果未发生。后台占位不属于 ToolTerminal，已开始的后台执行最终不能是 unavailable，也不能再次返回后台占位。Ask 没有 deadline，不使用 no-response 表示人没有回答。

工具作者通过显式普通返回或结构化返回入口选择语义。普通返回整个值经固定 TextRenderer 转文本，再生成一个人和模型均可见的 text 块。转换失败形成 result 失败，原返回事实仍由提供者以可保管表示保存，不能隐式吞掉它；作者须提供能够完整表示其返回类型的 renderer/codec。只有结构化入口允许 original 与 attachments，不能靠探测某对象是否有 content 字段推定它是 ToolResult。

原件引用包含原大小、摘要与存储键。只有内容及所需保留达到耐久后，才报告 offloaded。分页结果的 next 绑定 call/result/原读取范围，不得换版或静默扩大字段。现有工具全文无到期回收政策，释放 delivery、Run 终态、归档、压缩或 Model ACK 均不改变保留义务。

ResultPage.source 由 Tool 原结果保存操作产生，定位租户、call、精确结果版本、delivery 及实际来源。相同版本各页使用同一来源。消费方将其交给 Session 或原消费者的受信参加者验证，不自填摘要证明结果真实。读取此证据不自动授予解除 delivery 或读取其他版本的资格。

最终允许块全集及嵌套投影仍沿 [MODEL-E01](../../../model/model/docs/open-questions.md#model-e01)。本候选不把 ContentBlock 表示库存当成许可，也不发明递归容器。`B` 由具名结果政策验证；当前文本/图片可形成具体消费例，其他最终块及嵌套结果的完整闭合声明仍受该来源缺口限制。提供者发现采用缺失时保留原结果与失败原因，不重跑工具、不删除原件。

## 普通操作与实例目录

```ts
export type ToolControl =
  | Readonly<{ kind: 'stop'; reason: StopReason }>
  | Readonly<{ kind: 'background'; reason: 'user' | 'threshold' | 'foreground-limit' | 'interruption' }>
export type ControlReceipt = Readonly<{
  operation: ToolOperationId; state: ToolState
  propagation: 'pending' | 'sent' | 'unavailable' | 'completed'
}>
export type ForegroundReturn =
  | Readonly<{ kind: 'final'; result: ToolResultVersion }>
  | Readonly<{ kind: 'background'; call: ToolCallId; reason: string }>
export type ProcessBlock = Readonly<{
  index: string; mode: 'append' | 'replace'; state: 'open' | 'closed'; sequence: string
  content: ContentBlock
  trim: Readonly<{ removed: string; reason: string }> | null
}>
export type ToolObservation =
  | Readonly<{ kind: 'snapshot'; cursor: ToolCursor; state: ToolState; process: readonly ProcessBlock[]; foreground: ForegroundReturn | null }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'unavailable' | 'stale-instance' }>
export interface ToolHandle<P> {
  readonly instance: ToolInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<ToolObservation>
}
export interface ToolDirectory<P> {
  connect(input: CallAccess<P>): Reply<Readonly<{ kind: 'live'; handle: ToolHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
export type Handoff =
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
export interface ToolRuntime<P, B extends ContentBlock> {
  inspect(input: Access<P> & Readonly<{ name: string; command: string | null }>): Reply<ToolAvailability>
  admit(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
  queryOperation(input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>): Reply<OperationResolution>
  control(input: Mutation<P> & Readonly<{ intent: ToolControl }>): Reply<ControlReceipt>
  acceptDecision(input: Mutation<P> & Readonly<{ wait: ToolWaitId; decision: DurableEvidence }>): Reply<WaitState>
  readResult(input: CallAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>): Reply<ResultPage<B>>
  releaseDelivery(input: Mutation<P> & Readonly<{
    result: ToolResultVersion; delivery: ToolDeliveryId; consumer: ConsumerRef; evidence: Handoff
  }>): Reply<DeliveryState>
  account(input: CallAccess<P>): Reply<CallAccount>
  readonly instances: ToolDirectory<P>
}
```

每项操作核验当前身份、显式 tenant 及该资源动作。内容、观察、成本、控制和交付解除分别授权。已知名称、历史句柄或已受理事实均不是永久权限。异常仅用于程序缺陷，预期错误用 Reply。signal 只终止相应观察，不取消真实执行。

| 操作 | 成功、顺序及重复 | 拒绝、未知和责任 |
| --- | --- | --- |
| inspect | 返回当前合法选择或已知不可用旧形状；command 合法时包含已声明用法 | 从未合法取得的定义不泄露；不能为维持同形读取撤权后的新正文 |
| admit | 同提交固定输入、当前资格、原 consumer、原调用和待调度责任。同 call/operation/输入认回 | 异输入 conflict；未知按原 operation 查询。受理不等于环境就绪或真实启动 |
| lookup/queryOperation | 原事实与精确操作分别查询；不以目录无活体判未执行 | not-committed/not-accepted 需要 Storage 完整排除证明；不可读返回 unavailable |
| control | 同提交保存原控制意图及续做责任，重复认回；stop 和 background 不换 call | 不许可后台或正在 Ask 时拒绝转换；停止受理不声称实际停止 |
| acceptDecision | 核 HITL 原卡唯一有效决定与原 wait，答复、等待变化和后续责任同提交 | 无答案是合法决定的一种，不能视为授权；重复不重复执行，冲突及失效卡拒绝 |
| readResult | settled 后按原版本分页，当前资格每页复核；releaseDelivery 后仍可读全文 | 暂不可读不伪造不存在；地址失效报告保管故障，不能重执行原工具 |
| releaseDelivery | 原结果/位置/关系及两条证据之一共同验证后释放指定交付关系 | 未保存或完成未知保持 pending；不同位置 conflict；未知提交认回，不删除全文 |
| account | 原租户费用、用量与未知按修订返回 | 不连带披露正文/附件；多次读取不重计费 |
| connect/observe | 绑定特定实例，首快照和后续游标相接 | 旧实例结束不静默跳后继；观察者退出不撤独立 Tool 宿主 |

## 独立函数与依赖

```ts
export interface TextRenderer<R> {
  render(value: R): Outcome<string, Readonly<{ reason: string }>>
}
export interface ToolExecutor<A, R, E> {
  execute(argumentsValue: A, environment: E, signal: AbortSignal): Promise<R>
}
export declare function executeTool<A, R, E>(
  argumentsValue: A, executor: ToolExecutor<A, R, E>, environment: E, signal: AbortSignal,
): Promise<Outcome<R, Readonly<{ reason: string; effect: 'not-started' | 'unknown' }>>>
export interface ResultPolicy<B extends ContentBlock> {
  readonly adoption: Adoption
  judge(value: ContentBlock): Outcome<B, Readonly<{ reason: string }>>
}
export type ToolExecutionRef = Readonly<{
  tenant: TenantId; call: ToolCallId; instance: ToolInstanceId; generation: string
}>
export type WriteContext = ToolExecutionRef & Readonly<{ operation: ToolOperationId; expected: ToolRevision }>
export type ToolRecovery<B extends ContentBlock> = Readonly<{
  state: ToolState; request: FixedToolRequest; admission: ToolOperationId
  initiator: Readonly<{ owner: string; subject: string; revision: string }>
  execution: ToolExecutionRef | null; checkpoint: DurableEvidence | null
  start: ToolStartRecord | null
  invocations: readonly ToolStartRecord[]
  controls: readonly Readonly<{ operation: ToolOperationId; intent: ToolControl; propagation: ControlReceipt['propagation'] }>[]
  result: ToolResult<B> | null; unresolved: readonly ToolOperationId[]
  tasks: readonly ('prepare' | 'queue' | 'execute' | 'wait' | 'control' | 'deliver' | 'account')[]
}>
export interface ToolCommands<P, B extends ContentBlock> {
  admit(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Reply<ToolState>
  scanPending(input: Access<P> & Readonly<{ after: string | null; limit: number }>): Reply<Readonly<{ calls: readonly ToolCallId[]; next: string | null }>>
  loadRecovery(input: CallAccess<P>): Reply<ToolRecovery<B>>
  claim(input: Mutation<P> & Readonly<{ instance: ToolInstanceId; continuity: DurableEvidence }>): Reply<ToolExecutionRef>
  prepared(input: WriteContext & Readonly<{ resources: DurableEvidence }>): Reply<ToolState>
  enqueue(input: WriteContext): Reply<ToolState>
  prepareStart(input: WriteContext): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'start' }> }>>
  prepareResume(input: WriteContext & Readonly<{ checkpoint: DurableEvidence }>): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'resume' }> }>>
  recordStart(input: WriteContext & Readonly<{ start: 'started' | 'unknown' | 'not-started' }>): Reply<ToolState>
  preserveProcess(input: WriteContext & Readonly<{ blocks: readonly ProcessBlock[] }>): Reply<ToolCursor>
  openWait(input: WriteContext & Readonly<{ wait: Exclude<WaitState, { kind: 'none' }> }>): Reply<WaitState>
  suspend(input: WriteContext & Readonly<{ checkpoint: DurableEvidence }>): Reply<ToolState>
  preserveResult(input: WriteContext & Readonly<{ value: ToolResult<B>; terminal: ToolTerminal; effect: Effect }>): Reply<ToolState>
  recordLateFact(input: Mutation<P> & Readonly<{
    source: DurableEvidence; event: string
    fact: Readonly<{ kind: 'account'; value: CallAccount }> | Readonly<{ kind: 'effect'; value: Effect }>
  }>): Reply<ToolRevision>
  recordLateResult(input: Mutation<P> & Readonly<{
    start: ToolStartRecord; source: DurableEvidence; event: string
    value: ToolResult<B>; actual: ToolTerminal; effect: Effect
  }>): Reply<Readonly<{ result: ToolResultVersion; delivery: DeliveryState }>>
  settleLost(input: Mutation<P> & Readonly<{ continuity: DurableEvidence }>): Reply<ToolState>
  readonly consumers: Pick<ToolRuntime<P, B>, 'lookup' | 'queryOperation' | 'control' | 'acceptDecision' | 'readResult' | 'releaseDelivery' | 'account'>
}
```

独立函数不造租户或 Session，不持久重试。A/R/E 由独立消费者选定，显式提供环境和执行者。访问托管资源时，传入的 E 必须是已经限权的能力集合。不能把 Cordis Context、全局服务容器或全部宿主环境传给不可信代码。函数的 signal 请求执行者停止，效果由实际执行者说明，关闭 Promise 等待不构成逆转。

TextRenderer 是普通返回的转换接缝，其完整语义和实现采用随 executor 固定。String(value) 或 JSON.stringify(value) 不能作为所有 R 的无条件默认；循环结构、精度丢失或无法表达的值必须显式拒绝。结构化作者直接使用 ToolResult<B>，经过独立 ResultPolicy 及附件保管校验。两种入口都不可绕过实际效果与必要事实保存。

ToolCommands 隐藏本域提交、当前资格、队列与保管机制。它只接受具名操作，不提供任意事务回调。scanPending/loadRecovery 使恢复者可以只经公开依赖取得原采用与未完责任。WriteContext 的代次不自证权限，提供者核验受信通道及当前实例绑定。晚到费用/效果用不依赖旧代次的 recordLateFact，只有核实来源和原归属的当前补录者可调用。

## 发起、队列与环境协议

admit 同提交固定当前身份、合法定义/执行者匹配、实际调用参数、原消费位置、完整批判断依据及待办。明确是 dummy 时只形成不可用结果和真实替换件处理账目，不进入真实环境和队列。实际工具先准备环境，再按资源 scope 与工具身份进入队列。环境准备失败不退到更宽松宿主。

enqueue 保存唯一顺序，不以当前内存队列决定先后。session scope 的前台、后台和内部等待共用名额；独立 scope 按自己固定的 concurrency 与同一 FIFO 规则工作，null 表示没有数量上限但仍服从资源提供者容量准入。队列容量不足时，新的受理可以在承诺前拒绝；已经受理的超额并发按序等待，不能当执行失败。

prepareStart 原子核对队首/名额、未取消、原定义与实现匹配、当前推进和业务资格、授权与原批判断适用性，然后保存唯一启动意图及占位名额。真实 executor 调用前还须进入与相关撤权、归档、控制、attempt 换代共用的启动围栏。先资格变化则不启动；先启动则按在途控制处置。占位与外部效果不能同一 SQL 原子提交，recordStart 未知时查询原身份，不再次调用 executor。

实际发起不重跑已经完成且仍适用的扩展。决定所依据的参数、定义或动作发生变化时，旧批准不能沿用，交原协调者重新判断。有效判断不齐不能启动其中已批准的部分。批判断引用由其拥有者验证，不能由 Tool 自报整批已准许。

名额只在真实执行收场或排队/准备确实未启动而取消时释放。后台化、Ask、Agent 退出和观察断线不释放名额。宿主持有环境对象，结束后释放仍属于本执行的资源；释放不删除保管所需附件，也不声称外部效果可撤回。替换宿主先排除旧实际执行能力，不能只换数据库代次。

## 等待、计时与接续

前台累计时间由耐久的累计量及当前计时段决定。进入任何内部等待前保存累计量，内部等待期间不累计；退出等待后新段从实际恢复点开始。后台关系不累计前台时间，重启不把累计量归零。时钟倒退或来源不可用报告故障，不能增大剩余上限。跨进程恢复需要宿主可验证的持续时间来源，不能直接相减两台不相关的单调时钟。

达到 foregroundMs 时，许可后台且当前无 Ask 则保存同 call 后台关系与前台占位，否则保存停止意图，实际停止另查。backgroundAfterMs 是偏好阈值，同样不越过作者许可或 Ask。重复转换认回原控制，已经后台不产生第二占位，不能回前台。

ToolState.foreground 保存已经确定的前台返回。转后台时与原转换共同固定 background 分支，后续收场仍保留该占位事实；始终前台时在真实收场后固定 final。source 由 Tool 为该权威状态产生，能核验原转换和消费关系，供 Session.commitDerived 保存一次后台占位。lookup 返回此耐久事实，不依赖活体 observe 才能恢复；占位只解除本步前台等待，不解除最终结果 delivery。

openWait 要求前台且未收场，保存原 wait、HITL 原卡及接续依据，才能报告等待已成立。Ask 不设置超时，不提供默认答案。acceptDecision 通过 HITL 拥有者核验原卡唯一有效决定，再与原等待和后续责任共同提交；未回答、拒绝及批准是不同决定。业务取消可使等待失效，不能把取消填成答案。

后台不开放需要答复的 ToolWait。resource 分支是有具名期限的资源应答协议，不是普通 Promise 调度；尚在此等待时转换后台须先由原资源协议结束等待，否则拒绝转换。后台内部普通 I/O 的失败归执行失败，不形成新的交互等待或 no-response 终局；后台最终只允许 completed/failed/interrupted。Ask 始终不能通过提前结束或虚构答复换取后台许可。

普通 JS 函数依赖存活协程继续 await，不能因序列化了一段字节就宣称其调用栈可恢复。可恢复 executor 必须在采用中声明 checkpoint Schema、保存边界、恢复入口及旧执行排除条件。实例连续性仍在时从原实例继续；确证丢失后本主干 settleLost 形成异常终局并保留未知效果，不自动重放。恢复型执行者的完整 checkpoint 接口在本页后续提供者增量中闭合，尚未声明的执行者不能被装配为可恢复模式。

## 结果、过程与后继责任

preserveResult 在确认终局前可靠保存原输出、附件保留、实际终局、效果、原位置及交付任务。结果到达但保存未知时保持原操作和责任，不能由 Agent 提前写成功。后台实际收场后按原消费位置交付，不自动创建 Run。被消息或转换拒绝的结果仍保留，只有消费者契约指定回到仍有效 Run 时，由 Session 裁定其失败。

过程帧只给人观察。preserveProcess 先可靠保存当前块、追加/替换方式及游标，再向观察者发布。节流只合并同块合法增量；裁剪须保留数量、原因与最终过程表示。没有过程块不造过程消息，观察发送失败不单独使原执行失败。必要保管失败仍须可见，不能以“过程可选”为由丢已展示事实。过程不被误放进模型上下文，也不代替最终结果。

releaseDelivery 核验真实收场、原消费位置和当前承接者，再按 retained 或 processed 耐久证据释放指定交付关系。retained 保存所需内容/可靠引用及后续责任，processed 保存必要处理结果及完成事实。双方确认未知时各保留原责任，依原 operation 认回。Tool 全文仍由原保管者长期保留，消费者可以依原 Tool 引用恢复，不必复制第二份全文。

released.evidence 是 Tool 生产侧解除该版本 delivery 的耐久回执，记录原 operation、consumer 和已核验的承接证据；它不是把请求中的 custody/completion 原样返回。Session 的 ProducerFact.release.source 引用此回执，并带同一 ProducedResult。Model 对应引用 AckReceipt.custody.receipt。两种接收都核验生产者确认记录，不以消费方自己的保管事实冒称对方已解除。

取回原文的模型工具是一个新的合法 Tool 调用，取得新页并产生新输出，只计取回本身的实际成本，不重做原效果或回写旧占位。独立消费者也能依 call/result 调用 readResult，不需要存储私有文件路径。

## 当前增量与验证边界

环境、执行和等待能力通过下列工厂依赖进入。E 是环境拥有者的运行时能力类型，只有相匹配的准备者和执行边界能组合；它不进入配置、日志或跨线程消息。普通执行者和可接续执行者显式区分，不能用可选字段暗称支持恢复。

```ts
export type DecisionValue =
  | Readonly<{ kind: 'answer'; value: JsonValue }>
  | Readonly<{ kind: 'no-answer' }>
  | Readonly<{ kind: 'declined' }>
export interface ToolDecisionBridge<P> {
  resolve(input: CallAccess<P> & Readonly<{
    wait: ToolWaitId; decision: DurableEvidence
  }>): Reply<DecisionValue>
}
export type ToolExecutionFact<B extends ContentBlock> =
  | Readonly<{ kind: 'process'; blocks: readonly ProcessBlock[] }>
  | Readonly<{ kind: 'wait'; value: Exclude<WaitState, { kind: 'none' }> }>
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'final'; result: ToolResult<B>; terminal: ToolTerminal; effect: Effect }>
export interface ToolLiveExecution<B extends ContentBlock> {
  readonly facts: AsyncIterable<ToolExecutionFact<B>>
  stop(reason: StopReason): Reply<Readonly<{ requested: true }>>
  answer(wait: ToolWaitId, value: DecisionValue, decision: DurableEvidence): Reply<Readonly<{ accepted: true }>>
}
export type ToolStartRecord = Readonly<{
  operation: ToolOperationId; executor: Adoption; execution: ToolExecutionRef
}> & (
  | Readonly<{ kind: 'start' }>
  | Readonly<{ kind: 'resume'; checkpoint: DurableEvidence }>
)
export type ToolStartLookup<B extends ContentBlock> =
  | Readonly<{ kind: 'not-started'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'live'; execution: ToolLiveExecution<B> }>
  | Readonly<{
      kind: 'settled'; source: DurableEvidence; event: string
      fact: Extract<ToolExecutionFact<B>, { kind: 'final' }>
    }>
  | Readonly<{ kind: 'lost'; continuity: DurableEvidence }>
export type ToolExecutorBinding<P, B extends ContentBlock, E> =
  | Readonly<{
      kind: 'live-only'
      start(input: CallAccess<P> & Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; request: FixedToolRequest }>, environment: E): Reply<ToolLiveExecution<B>>
      inspectStart(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<ToolStartLookup<B>>
    }>
  | Readonly<{
      kind: 'checkpointed'; checkpointSchema: Adoption
      start(input: CallAccess<P> & Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; request: FixedToolRequest }>, environment: E): Reply<ToolLiveExecution<B>>
      inspectStart(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<ToolStartLookup<B>>
      suspend(execution: ToolExecutionRef): Reply<DurableEvidence>
      resume(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, { kind: 'resume' }>; request: FixedToolRequest
      }>, environment: E): Reply<ToolLiveExecution<B>>
    }>
export interface PreparedEnvironment<E> {
  readonly value: E
  readonly evidence: DurableEvidence
  release(): Promise<void>
}
export interface ToolEnvironment<P, E> {
  prepare(input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>): Reply<PreparedEnvironment<E>>
}
export interface ToolBindings<P, B extends ContentBlock, E> {
  inspect(input: Access<P> & Readonly<{ name: string; command: string | null }>): Reply<ToolAvailability>
  resolve(input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>): Reply<ToolExecutorBinding<P, B, E>>
}
export interface ToolInstanceHost<P> {
  schedule(input: Readonly<{ tenant: TenantId; call: ToolCallId }>): Reply<Readonly<{ queued: true }>>
  publish(input: ToolExecutionRef, handle: ToolHandle<P>): Reply<Readonly<{ execution: ToolExecutionRef; registration: string }>>
  withdraw(input: Readonly<{ execution: ToolExecutionRef; registration: string }>): Reply<Readonly<{ removed: boolean }>>
  readonly directory: ToolDirectory<P>
}
export interface ToolClock {
  now(): string
  elapsed(evidence: DurableEvidence): Reply<Readonly<{ milliseconds: string; evidence: DurableEvidence }>>
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export type ToolConfiguration = Readonly<{
  processBatchBytes: number; processBatchDelayMs: number; observerBufferBytes: number
  resultPageBytes: number; reconciliationDelayMs: number
}>
export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  commands: ToolCommands<P, B>; bindings: ToolBindings<P, B, E>
  environments: ToolEnvironment<P, E>; decisions: ToolDecisionBridge<P>
  instances: ToolInstanceHost<P>; clock: ToolClock; resultPolicy: ResultPolicy<B>
}>
export interface ToolProvider<P, B extends ContentBlock> {
  readonly runtime: ToolRuntime<P, B>
  recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>>
  quiesce(): Reply<Readonly<{ pending: string; running: string }>>
}
export declare function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>, configuration: ToolConfiguration,
): ToolProvider<P, B>
```

start/resume 是前述启动围栏拥有者提供的操作，封装当前授权、实际能力调用和资源归属。开始返回值未知时保留原执行，不再 start。普通消费者拿不到这些 binding；resolve 不因采用旧引用放宽当前准入。bindings 对执行者的内部 renderer、参数 codec、结果政策和允许资源能力做固定匹配，不能取当前最新实现覆盖原采用。

prepareStart 保存 ToolStartRecord，再交 start，启动边界按此身份认回原启动。start 返回句柄前断线时，恢复者通过原 binding.inspectStart 查询；该查询以当前主体核权，不要求旧 generation 仍有推进权。live 重新连接同一个事实流/stop/answer 端口，不再次启动。settled 返回原确定终局及可核验来源，按原结果正常保存或晚到补录。unknown 继续核对；lost 必须有可信连续性排除，不能由一次连接失败推断。not-started 只有在原启动及所有延迟尝试被排除后成立，此时才允许同身份首次 start。对端无查询/去重能力时仍须实现 unknown 的真实结果，不能假装支持确定恢复或以重试 start 代替查询。

recordLateResult 处理旧实例排除之后、外部已准入操作的原输出和附件到达。当前受信桥接者按原 start、call、executor 和 source 核验来源，原事件同值认回，异值冲突。它可靠保存全文及附件，产生新的结果版本和该版本的待交付关系，同时追加实际终结事实。旧的 runtime-lost 等逻辑终局和原结果版本保持，不改成未曾失败；readResult 明确区分 terminal 与 actualTerminal，以及 original/late 关系。

lookup 的 supplements 列出这些晚到版本及其独立 delivery，消费者按精确版本读取和解除关系。旧版本 delivery 已解除不自动解除新版本，也不允许因此删除原全文。晚到关系沿原 consumer 交当前合格承接者处理历史、保管或允许的后续用途，绝不据此恢复旧 Run/attempt 或已取消投递资格。当前没有合格读取者时，Tool 继续保管；没有必要继续业务也不免除全文保留。这个端口只补真实原结果，不接受新参数、重试、后台占位或 dummy，不产生第二执行。

checkpointed.suspend 先让原执行停在可恢复位置、保存已发生效果及后续步骤，并证明旧执行不会继续。commands.suspend 验证证据后共同保存 suspended、checkpoint 及旧实例撤资格，原名额和等待保留。合法 resume 只能从已提交的同一检查点接续未做步骤，不能重跑 start 或已完成效果。过程中崩溃而不能证明安全暂停时，仍走未知/自身失联分支，不自动补一个检查点。live-only 无此入口，其计算资源不能在等待时随意销毁。

prepareResume 在同一启动排序域内核验当前资格、原检查点及旧执行排除，保存具名 resume 调用记录，不增加第二个并发名额。resume 与 start 都按 ToolStartRecord.operation 认回。inspectStart 对两种记录均适用；恢复返回的 invocations 保留完整原启动/接续链，start 指当前尚需认回的记录。接续回执未知时先查询该记录，不能换操作号再次 resume。controls 保存每项未完控制的原意图及传播进度，恢复者不会从 task 名称猜 stop 或 background。返回 live 时重新连接原控制通道，不重新 prepare 环境或替换原执行资源；只有确证暂停后合法接续，才按原环境采用重新取得所需资源。

answer 只接受 decisions.resolve 已核实的原决定，先由 acceptDecision 保存原等待及接续责任，再交原 live execution。回执丢失按原 wait/decision 认回；执行者也须按同一决定去重，不能重复从等待后的第一步发效果。HITL 只提供决定，动作授权仍由相应领域核验。暂停等待恢复先核原等待及决定再 answer，不从聊天文本猜答案。

facts 的 final 只出现一次，流先耗尽或抛错不当完成。过程块 sequence 是该 index 的非负十进制序列；重复同值认回，异值冲突，open 的 mode 固定，closed 后不能更新。append 的 content 是已累计的完整当前值，必须保留前序内容，replace 只替换同一 index。持久批保存完成后才发布快照，trim 明示实际裁剪而不删除必要原过程责任。

| 输入或依赖 | 分类、缺席与换代 |
| --- | --- |
| principal/tenant/call/operation/request/control/decision | 每次操作参数；不同主体及当前资格重新核验，固定请求不随恢复改变 |
| commands | 必需领域提交能力，内部结合 Storage、授权/消费者守卫与结果保管；不可用不报已保存 |
| bindings | 必需定义/执行者解析能力，普通根函数不用它；换代保留原执行者绑定，未发调用重新核匹配 |
| environments | 必需资源准备能力，E 生命周期由宿主控制；缺条件拒绝，不降级到更宽松环境 |
| decisions | Ask 的必需能力。无 Ask 的执行无须实际调用；能力缺席时不装配支持 Ask 的提供者 |
| instances | 本域独立宿主，登记和撤除不由 Agent 持有；退出留下事实、等待、交付及费用责任 |
| clock | 必需持续时间及等待能力，计时证据跨恢复可核验；不能用 wall clock 倒退延长上限 |
| resultPolicy | 必需块许可校验，采用明确；缺对应政策不把任意 ContentBlock 当合法终局 |
| configuration | 正容量/页大小，非负有限延迟，全部加载时验证；同一个在途操作不随新配置缩小保证 |
| E、PreparedEnvironment、live execution、观察 signal | 临时能力和资源，持有者释放；不序列化，不以释放声称业务已完成 |

recover 使用 scanPending/loadRecovery 从原事实找待办，再分别接续准备、队列、等待、控制、交付及账目。只有原事实证明未启动，才可沿原身份首次 start；已经启动且失联的执行绝不通过 start 重放。quiesce 仅停止新的宿主准入，返回真实未完数量；不是自动取消所有业务的 disposer。PreparedEnvironment 的 release 在本次执行不再需要资源后调用，保管所需内容须先移交独立耐久保管者。

本页仍需 W3 类型/协议消费验证及 W4 Agent 反查。MODEL-E01 限制最终块全集及嵌套投影的完整声明，文本/图片样例不能核销该来源缺口。当前不声称生产可用或 W3 已验收。
