# @omne-harness-lite/session-runtime-local

`sessionModelRequestPreparation`为现有运行时消费者准备模型请求。Session负责工具解析、历史校准和装配超时求值，应用显式选择此实现。这个准备接口与Model执行池接收的准备请求不同。行为见[规格](SPEC.md#会话模型请求准备)。

根入口另提供createSessionDriverWorkOwner和createSessionCallAccess，供可信运行时构造原工作及Run读面。它们不代表完整driver、恢复执行者或新的Model／Tool权限；行为归[SPEC](SPEC.md)。

[English](README.md)

本包提供Session操作的本机持久准入。根入口独立于Cordis；Session业务承诺由[公开定义](../../core/session-runtime/SPEC.md)拥有，提供者顺序及资源规则见[SPEC](SPEC.md)。

根入口的`createLocalSessionDriver`提供正常Model／Tool路径：扫描持久Session工作并拥有原Run任务。调用者提供实际Run来源、模型服务、Clock及显式policy。停止撤销新工作；关闭等待实际扫描和原任务归还。`./cordis`公开SessionDriver，采用显式policy及Core startup注入；生产来源组合仍须另验，不能据此声明完整产品或冷恢复已经交付。


`createSessionModelReconciler`拥有完整会话日志对账。投影共享原恢复状态和可重试关闭责任。`sessionModelSettlement`同时提供冷回复认回及控制记录追加，不发起模型请求，不关闭借入的执行池。


`createSessionModelSelection`拥有会话模型选择、完整历史读取、求值及原操作收尾。公开类型归Core；调用者显式关闭返回句柄，并持有它直至原任务实际结束。

## 使用

在共享根库组合admissionMigrations，在每租户实际运行库组合admissionUseMigrations，然后以根Storage、可信治理核验端口及显式容量策略调用createLocalAdmission。调用者保管借入依赖。

先持久登记原目标，再只执行active核验；ready的原ticket在实际租户单元消费。使用与原业务回执共同提交，unknown沿原记录认回。ticket只定位记录；guard只在原回调中有效。

登录拒绝与成员拒绝作用域不同。新登录不能抹除未结算成员观察；原Run的连续性另沿持久grant及当前执行栅栏。

## 同单元状态

在租户运行库组合sessionStateMigrations。可信协调者以当前资格、显式容量策略和原工作结算读取端口构造createLocalSessionState。参加者使用调用者的实际StorageUnit；协调者须把日志事实及回执放入同单元。暂存结果不能证明公共受理或消费已成功。

参加者保留待处理位置直至采用，拒绝终态Run身份复用和复制／回滚permit。收尾要求无待处理输入且原工作已结算。完整Session操作和执行恢复仍在施工。

## 同单元回执

在租户运行库组合operationReceiptMigrations，以固定租户、可信当前授权和实际日志参加者构造createLocalOperationReceipts。完整OperationRef定位原回执，创建认回不要求预先知道Session。相同语义保留原快照，异语义拒绝。新回执核本单元日志坐标；协调者负责配对实际业务事实、状态及待处理资格，再统一提交。

## 创建和受理入口

根入口导出createLocalSessionIngress及sessionRuntimeMigrations。可信宿主固定原中心／来源／租户，并借入G28、实际日志及SessionBootstrap。创建先持久固定唯一身份，再在事务外初始化原Context，最后同提交发布事实、空状态和原回执。受理将原消息、事实、pending和回执共同提交；失败不留下半批，重放不重复追加。

operations提供创建、输入及只读查询。可信lifecycle分面另接新Run、首次attempt、输入／结果承接、调用准备和收尾；原grant、日志／状态／pending与StepReceipt共同提交。新Run验证登录，原Run沿持久授权继续。重放返回原回执，不重新签发permit。完整调用协调、恢复接管、取消／归档及正式宿主接线仍由各自施工和验收承担，不能从这个子集推定已经完成。

根通过modelIssue选择原模型参加者，并提供实际当前模型资格和显式容量。可信modelInvocation.admit在原Unit核持久准备及当前permit，将原模型锚点、唯一claim和Session发起证明同提交。只有原模型拥有者可consume该claim；重放不授第二启动权。Run终态或Ingress关闭后，该拥有者仍可只读原精确证明。根须保留借入日志和Storage直至原模型拥有者释放。实际模型来源及原SDK ACK适配由应用选择；工具及完整生产宿主仍未完成。

## 开发

按[开发指南](../../../docs/development.md)准备本树环境并先构建依赖。

```sh
pnpm --filter @omne-harness-lite/session-runtime-local build
pnpm --filter @omne-harness-lite/session-runtime-local typecheck
pnpm --filter @omne-harness-lite/session-runtime-local test
```

测试使用真实SQLite及真实进程崩溃，不替代完整CLI、OpenRouter、工具或宿主恢复验收。本包尚未写模板采用标识。

可信tenancy读面从实际持久预留读取固定Session归属，不使用开发seed。./cordis导出createLocalSessionContext，建立独立Context及显式共享桥。应用以runtimeContext参数提供尚未挂载的新Runtime Context提供者，构造器使用其原plugin、ready、initializer及closeAdmission，不选择具体实现。私有initializer只接原Session，停止等待实际工作及日志borrow释放；释放失败保留责任，可重试原close。正式宿主仍须取得实际合法配方及seed，再确认初始化后发布Session。 currentGeneration观察实际Context生命周期身份；就绪前或撤除后返回null，不授执行权。

原创建票据持久保留实际成员角色。该快照只供原配方捕获，不能替代当前授权。SessionBootstrap接收原票据以认回实际原Session；缺失角色不设默认值。

## 活体访问绑定

createLocalSessionAccess借入真实当前authority、固定的已鉴权主体和租户，并接显式许可及容量策略。工厂独立返回读取服务和私有issuer；issuer不注册为普通服务。使用点重新核当前资格，复制／撤销／关闭的引用不放行；关闭排空原核验而不关闭借入拥有者。行为见[SPEC](SPEC.md#活体sessionaccess发行)。

## 原完整模型结果保管

根通过modelResults提供实际原执行来源和显式容量。可信保管分面沿原Run grant，将完整Pending、必要引用、原发起身份和回执与保管事实同提交；终态迟到不重新取得推进资格。重放核原事实及发起证明，返回原全文与回执；异值或别名结果键拒绝。

引用保管不可用回滚整个单元；未知提交保留原结果身份，只认回、不ACK。保管不推进Run、不设置replyDisposition、不发送ACK。根仍须连接实际模型来源及原模型拥有者的ACK规则。关闭等待已登记工作，不关闭借入依赖。行为归[提供者规格](SPEC.md#原完整模型结果保管)。

## 原Run日志借用

可信根以原协调权限、Scope和Run借用runJournal；每次实际Unit重新核原持久grant。借用提供完整前缀和SessionLog操作，供模型结算使用，不代替当前执行资格或唯一发起claim。

根须等原模型工作及ACK责任结束再归还借用；Ingress关闭等待已接受借用归还。借用close撤新入口并排空实际单元，不关闭物理依赖；进程内generation在关闭时失效。行为归[提供者规格](SPEC.md#原run日志借用)。

原模型结果的最新permit一次采用沿`lifecycle.commitStep(adoptResult)`，行为见[提供者规格](SPEC.md#原模型结果的协调采用)。它不重复写模型回复、不替代原SDK结算或ACK。

## 原模型消费构件

根入口公开`createSessionRunModelBinding`、`createSessionModelResultSource`、`createSessionRunHistory`和`runSessionModelTurn`。这些函数绑定原Run、读取历史，并完成原结果的保管、采用、SDK结算与ACK。应用通过Core接口传入实际Model与结算factory；本包不选择具体Model提供者。先归还Model装配借用，再归还原日志。这些构件不代表完整driver已交付，也不授予新执行权。行为见[规格](SPEC.md#原-run-的模型运行时接线)。

根入口还公开`prepareSessionModelRun`、`createSessionModelAttempt`和`createSessionModelObservations`。提供者消费Core Agent Loop、保留原模型任务，并区分本地等待结束与物理执行结束。这些构件不等于完整driver或工具循环。

`RuntimeOptions.toolIssue`显式启用原工具准入支持。`toolInvocation.support`只接受本Ingress的原协调权限，并在共享事务核验原调用准备、permit及实际工具意图。本支持尚不包含工具结果保管、普通交付或完整driver装配，不能把它当作完整工具路径。

`toolResults`在同一单元中保管并认回原Tool终局证据和Session保管回执。可信根提供不可变的Tool结果来源。完整native工厂组合仍未验证。

`toolDelivery`在同一单元中确认普通工具消息及其ready、confirmed和采用事实。可信根提供现有Runner纯历史解释器。新交付须持有当前permit；认回核完整原批次。完整native和Cordis组合仍须另验。

## 模型发起前的工具采用

正常Model驱动先可靠持久化原report和完整工具表，再创建模型调用。非空工具须匹配原求值选中的精确版本。提交未确认时不发起模型，也不自动重试。显式认回仅接受完整相同的原快照。

根入口导出`inspectSessionToolAdoption`、`sessionToolActionOwner`及`SessionToolAdoption`。读取器核验事实及原Scope和键，不执行IO、不授予Tool权限。投影不会把该事实发给模型。Runner整批与原Native Tool消费已有限定实现；普通交付仍须另核。行为见[薄规格](SPEC.md#原-run-的模型运行时接线)。

## 完整工具批次

`createSessionToolActionHistory`从同一完整prefix读取原模型工具批次、整批完成事实及原Native Tool路由。根提供成熟的Runner结论解释器。该函数不执行IO，也不授予执行权限。

`readSessionRunnerAction`为可信Runner宿主读取原Run日志，返回已持久化的调用、采用报告和稳定anchor。异Run或过期attempt会被拒绝；返回来源不授予执行权。

内部批次消费者调用实际Runner并核其原replay，可靠持久化完整原序后才返回执行locator。asked项保持pending；写入未确认不返回locator，认回原事实不重新dispatch。整批事实不进入模型消息。原Model任务现已通过原同Unit支持消费实际Native Tool。它保留未完成Model工作，逐项prepare，并持有原Native participant与真实stopped。未知结果继续保留原责任，归还本次借用不关闭共享池。每项真实stopped后先经实际不可变结果来源保管，再执行原after_action与普通交付。保管或交付未知保留原责任，不发下一Model。完整批次交付和Tool借用归还可靠完成后，先登记下一Model工作，再完成上一Model责任；Core工具和Runner事实读取器保留event与消息的区别。Cordis与正式生产来源组合仍须通过各自验证。见[SPEC](SPEC.md#原-run-的模型运行时接线)。

## Cordis驱动与操作分面

可信宿主先提供实际Core startup，再加载SessionDriver。插件在原启动返回后发布同一control。
Fiber ACTIVE不证明驱动就绪。撤除终止启动准入，调用原stop和close；
部分启动资源、pending及关闭缺陷仍由root保留。服务撤除或Cordis dispose完成不证明资源closed。

createLocalSessionIngressBinding(original)以空Config将Core四个限定分面绑定到同一借入Ingress。
绑定委派准入、生命周期、工作读取和Run日志借用，不授予资格，也不在撤除时关闭原Ingress。
行为归[SPEC](SPEC.md#cordis驱动插件)。

`sessionModelSettlement`向运行时消费者提供模型结算、持久工作和恢复判断。`createSettlementCoordinator`及`createSettlementWork`也可独立调用。见[职责与生命周期](SPEC.md#模型结算的实际拥有者)。

根函数 `createSessionModelCallFacts` 从会话日志重建并更新调用索引。装配根传入原内容存储，物理运行时保留关闭责任。见[规格](SPEC.md#模型调用事实索引)。

根入口提供createSessionModelReads及固定前缀失败读取。Session拥有历史解释与读取寿命；Model提供原执行视图和借入的内容／ACK能力。

## 原模型调用协调

Session 的 `createAnchoredModelInvocation` 将显式传入的 `invokeModel`、真实 SessionLog 绑定与共同结算协调器
直接组合。它支持一次发出，工具列表可包含已解析的模型面工具定义；可以不属于 Run，也可以带显式
`run`/`attempt` 对，此时锚点以 fenced 方式追加。宿主提供固定的调用、响应与
消息身份、完整档案绑定和选中来源、实际凭据范围与值、策略、传输、owner 和日志代际。
本函数校验这些值；形状不证明授权或凭据来源。一次调用借用精确传输引用，当前交付没有
实现传输热替换。

原传输只规划一次。dispatched 确认先于 HTTP，opened 确认先于任何可见内容。完整 MR11
响应使用原 opened 时刻、实际用量与费用、上游事实和同次调用已交接的安全响应头。
成功或截断回复先交给调用者承担完整的 `PendingModelResponse`，尚无处置或晚到标记；底层 `settleReply('persisted')` 通过同一协调器一次追加
`[AssistantMessage, ModelResponse]`；明确的 vetoed/consumed 处置只追加响应。
确定的失败和系统中断在 outcome 返回前结算；系统中断没有回复，已交付内容保留在 delivered。

`abort()` 请求系统停止。runtime 服务先持久化用户中断意图，再调用锚定句柄的 `interrupt(initiator)`；调用者通过 `runtime.interrupt` 使用完整协议。在途调用在原 owner 登记内执行短控制任务，并发上限为一时同样可用。控制追加回执未知时，实际任务停止后仍须由同一日志的完整权威前缀认回才释放登记；未决响应写入另行保留。`close()` 关闭准入、请求停止，并等待调用、门回调、追加与结算的实际任务停止。只有已确认结算
或从未发出才调用 `releaseBorrowed`。未知锚点或未知结算返回 unavailable，保留句柄、
原结算请求和借用引用。已出门或已开口锚点回执未知时，只由宿主在既有 S-33 时机恢复。
结算追加回执未知时由共同协调器继续持有：其写者实际停止后，之后的 `settleReply` 或
`close()` 读取同源完整前缀。读到完整批即认回；证实缺席才以同一原请求再次结算
（noRun 逐字节相同，Run 批按 S-70④ 只允许更新 `late` 与条目壳）；前缀不可核则保持
unavailable。之后的其他处置或 close 都不能替换保留的原请求。

完成实际宿主准备后，把输入和明确的回复处置传给下例。close 为 unavailable 时，保留返回的 call 和实际宿主 owner。十五方法已组合；生产 Run owner 与模型认证仍须各自证据。

```ts
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import type { ModelPoolInstance } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationInput } from '@omne-harness-lite/model-request-runtime'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'

/** Supply actual host preparation and an explicit caller disposition. */
export async function runPreparedInvocation<P extends PlannedSemantics, R>(
  input: Omit<AnchoredInvocationInput<P, R>, 'execute'>,
  disposition: ReplyDisposition,
  pool: Pick<ModelPoolInstance, 'execute'>,
) {
  const call = createAnchoredModelInvocation({ ...input, execute: pool.execute })
  const outcome = await call.outcome
  const settlement = 'replyPending' in outcome ? await call.settleReply(disposition) : null
  const close = await call.close()
  // Retain call and its host owner when close is unavailable; neither abort nor outcome proves release.
  return { call, outcome, settlement, close }
}
```


## 已准备调用中的工具

通过 `planInput.tools` 传入已解析的 `ModelToolEntry`。`modelEntry` 把已校验的工具定义转换为模型面形状；使用下面示例的消费者应直接依赖 tool-definition 包。

```ts
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import type { ModelPoolInstance } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationInput } from '@omne-harness-lite/model-request-runtime'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { modelEntry, type ToolDefinition } from '@omne-harness-lite/tool-definition'

export function invokeWithTools<P extends PlannedSemantics, R>(
  input: Omit<AnchoredInvocationInput<P, R>, 'execute'>,
  definitions: readonly ToolDefinition[],
  pool: Pick<ModelPoolInstance, 'execute'>,
) {
  return createAnchoredModelInvocation({
    ...input,
    execute: pool.execute,
    planInput: { ...input.planInput, tools: definitions.map(modelEntry) },
  })
}
```

runtime 负责发送定义并装配流式工具调用；调用者负责在后续历史中提供各调用对应的工具结果。该函数不执行工具，也不自动回填结果。非法定义、重名或孤儿调用在新的 dispatched 锚点和 HTTP 请求之前拒绝。内部服务组合构件已能按捕获的会话或 Run 报告范围解析名字；这不是公开的工具执行 API。

## Session model-call composition

`createSessionModelRuntime` composes the Session model-call operations over one original call store.
Supply `execute` from the shared physical Model pool. The Session coordinator retains original issue, ready, ACK, and close responsibilities.

The Cordis entry exports `createSessionModelRuntimeLocal`. Its trusted construction requires the same `execute` and an original `createContentStore` factory.
See [the composition contract](model-runtime.md) and [lifecycle responsibilities](adr/model-service-lifetime.md).
