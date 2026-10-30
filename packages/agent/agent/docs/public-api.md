# Agent 通用实现的构造入口

根入口导出下列类型、`createAgentRuntime`、通用评估器 `agentEvaluator`（契约 `AgentEvaluator` 的实现，装配经 `AgentAdoptions` 为绑定的定义采用它）与它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema`。根入口还导出独立 Model 接收工厂、宿主持有状态和完整材料读取器，说明见下文。`createAgentRuntime` 的协调者要求所采用的评估器以本包的节点集合（Loop 算法页节点表的节点 ID）为 `position` 词汇，并返回本包转移表能承接的 `Next`。经 `AgentAdoptions` 交来的其他评估器只与契约形状兼容，不与本协调者的语义兼容：它的位置与决定没有转移行时，执行以缺陷停止。工厂已实现创建校验与四个面的访问守卫，`invoke` 走 Loop 正常路径的骨架，其他操作本体尚未实现，实际支持范围与未实现的校验见[成员 README](../README_ZH.md#支持范围)。下列行为是设计中的工厂行为，操作和行为由 [纯契约](../../agent-contract/README.md) 拥有。测试装配在 `./testing` 入口，见[成员 README](../README_ZH.md#支持范围)。本包不接收 Cordis Context，不导入任何外部协调者的类型。

## 参数与依赖

输入按四类分责。分类规则见[对象模型](../../agent-contract/docs/object-model.md#值参数与依赖)。

- 构造身份绑定：实例身份、租户、安全作用域和精确的定义采用，写在 `AgentRuntimeBinding`。它们决定实例身份，不是可调整的配置。
- 可序列化配置：`AgentConfiguration`，经过校验，不含业务身份、权限、秘密或运行对象。
- 单次操作参数：当前主体、租户、操作身份、execution、输入和推进资格依据随每次调用传入，不在工厂中保存。
- 注入依赖：`AgentDependencies`，是具名能力的只读记录，不是服务容器，也不提供按名称动态取用的方法。工厂不接受 Cordis Context 或任何可按键取用的容器。

```ts
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  Adoption,
  DurableEvidence,
  AgentInstanceId,
  AgentAdoptions,
  CurrentConditions,
  RequestPreparation,
  ModelSelection,
  ModelContextReader,
  ExtensionImplementations,
  DecisionCards,
  ActionAdmission,
  MessageHandoff,
  AgentMaterials,
  RegisteredReads,
  AgentRegistrationHandle,
  AgentClock,
  AgentRuntime,
  AgentRuntimeControl,
  AgentJournal,
  AgentExecutionRecovery,
  AgentHandle,
  AgentAccessCheck,
  CallerCommit,
  Reply,
} from '@omne-harness/agent-contract'

export type AgentRuntimeBinding = Readonly<{
  instance: AgentInstanceId
  tenant: TenantId
  scope: DurableEvidence
  definition: Adoption
}>
export type AgentConfiguration = Readonly<{
  observerBufferBytes: number
  reconciliationDelayMs: number
  reconciliationBatchLimit: number
  denialBackoffMs: number
  toolConcurrency: number
  jointCommits: readonly Exclude<CallerCommit['kind'], 'none'>[]
  coordination: 'standalone' | 'coordinated'
  loopGuardPolicy: Adoption
}>
export type AgentRuntimeOptions = Readonly<{
  binding: AgentRuntimeBinding
  configuration: AgentConfiguration
}>
export type AgentDependencies<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  access: AgentAccessCheck<P>
  models: M.ModelRuntime<P>
  tools: T.ToolRuntime<P, B>
  adoptions: AgentAdoptions<P>
  conditions: CurrentConditions<P>
  requests: RequestPreparation<P>
  selection: ModelSelection<P>
  modelContext: ModelContextReader<P>
  extensions: ExtensionImplementations<P>
  cards: DecisionCards<P>
  admission: ActionAdmission<P>
  handoff: MessageHandoff<P>
  materials: AgentMaterials<P, B>
  reads: RegisteredReads<P>
  registration: AgentRegistrationHandle<P> | null
  clock: AgentClock
}>
export interface AgentProvider<P> {
  readonly runtime: AgentRuntime<P>
  readonly observation: AgentHandle<P>
  readonly recovery: AgentExecutionRecovery<P>
  readonly control: AgentRuntimeControl<P>
}
export declare function createAgentRuntime<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  options: AgentRuntimeOptions,
): Reply<AgentProvider<P>>
```

创建先校验配置、安全作用域、精确采用和提供者能力，成功得到 idle 实例。提供者能力包括：Journal 绑定声明的 `capabilities.coordination` 与配置 `coordination` 严格相等，并对配置 `jointCommits` 中每一种共同提交声明了参加者。两项核对都在创建 runtime、登记或写状态之前完成。发布由宿主完成。失败撤除本次创建的临时资源，不能返回半就绪实例。提供登记句柄时，句柄的 instance 必须等于绑定的 instance。配置不能覆盖绑定。纯工厂没有自己的全局注册表。

`AgentProvider.control` 是契约包的 [AgentRuntimeControl](../../agent-contract/docs/public-api/README.md#托管协调与运行实例)，只由宿主持有，不交给执行的调用方。在 Cordis 装配中，宿主插件自己调用工厂，见[本地宿主装配](../../agent-host-local/docs/cordis.md#装载)。其他装配由调用工厂的装配者把它交给宿主。本页不另定义 quiesce 的形状。

### createAgentRuntime 的幂等与失败

createAgentRuntime 没有操作身份，也不是幂等操作：每次调用创建一个新的本地 runtime 对象。纯工厂没有全局注册表，所以不检测同一实例身份的重复创建。实例身份的唯一性由宿主保证：reserve 对同一操作幂等，并为预约的实例提供登记句柄。

| 要素 | 规则                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 授权 | 工厂不接收 Access，也不调用 AgentAccessCheck。能否调用工厂由装配层控制。创建出的 runtime 在每次公开操作时核验主体资格                  |
| 并发 | 各次调用互相独立，不共享可变状态。用同一绑定并发调用会得到两个本地对象。只有交给宿主发布的那一个可以被路由，另一个由调用工厂的一方丢弃 |
| 事件 | 创建不写 Journal，不产生 Agent 事件，也不发布登记                                                                                      |

创建失败的结果如下。

| 失败        | 条件                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| invalid     | 配置越界，或绑定字段非法                                                                                              |
| denied      | 绑定的租户与安全作用域不一致，或登记句柄的实例与绑定的实例不一致                                                      |
| unavailable | 必需依赖缺席，或精确采用无法解析                                                                                      |
| unsupported | 配置 `coordination` 与 Journal 绑定声明的 `capabilities.coordination` 不相等，或配置 `jointCommits` 中有一种共同提交没有出现在 Journal 提供者声明的参加者集合里。创建不保存任何状态，不创建 runtime |

## 依赖逐项分类

必需表示缺席时不能创建 runtime。局部必需表示只有某个能力或路径需要，缺席只影响那条路径。可选表示缺席时 runtime 仍然完整可用。换代表示这项依赖的提供者被替换时的行为。依赖不在 runtime 之下热替换。计划换代时，宿主先 quiesce 旧 runtime 交接在途 execution，再以新提供者创建新的 runtime；在 Cordis 中静态依赖换提供者会使宿主插件重跑，相当于原 runtime 失联，没有先交接，在途 execution 由恢复者经 resume 认回，见[本地宿主页](../../agent-host-local/docs/cordis.md#换代)。局部必需依赖由阶段适配器按阶段重新取得，已进入的阶段不换提供者。在 Cordis 装配中，阶段适配器在阶段子 fiber 内取得依赖，见 [Cordis 页](../../agent-cordis-contract/docs/cordis.md#依赖与定义拥有者)。已进入阶段的提供者换代或离场时，该阶段未完成的操作返回可对账的 unavailable 或 commit-unknown，调用者按原操作身份查询。下一阶段使用当时的提供者。

服务键列是该依赖在 Cordis 中的服务键。键的定义、提供者归属和宿主插件取得依赖的方式归 [Cordis 页](../../agent-cordis-contract/docs/cordis.md#依赖与定义拥有者)，本表不重复。

| 依赖         | 服务键               | 必需性                                                                                                                                              | 缺席时                                                                                                                | 换代时                                                                                                                                         |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| journal      | agentJournal         | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | 新提供者必须能读到同一 execution 的原记录。读不到时，在途 execution 保持 suspended，不由新提供者重新初始化                                     |
| access       | agentAccessCheck     | 必需。端口是契约包的 AgentAccessCheck，由授权领域的适配器实现                                                                                       | 创建返回 unavailable，不创建 runtime                                                                                  | 换代只影响后续操作。已经通过核验并受理的操作不重新核验，已经合法发出的调用沿原身份查询和控制                                                   |
| adoptions    | agentAdoptions       | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | 新实现只影响尚未开始的经过，原经过沿原精确采用，不换实现                                                                                       |
| conditions   | agentConditions      | 必需。端口是契约包的 CurrentConditions，只投影当前推进要求与采用依据，不计算守卫                                                                    | 创建返回 unavailable                                                                                                  | 每次请求准备时读取当前条件，换实现后下一次读取生效，已记录的最终请求不变                                                                       |
| requests     | agentRequests        | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | 换实现影响尚未记录为最终请求的候选，已记录的最终请求和已提交的压缩事实沿原采用。进行中的压缩计划沿 checkpoint 保存的进度继续，新实现不重开计划 |
| selection    | agentModelSelection  | 必需。端口是契约包的 ModelSelection，由 Model 与设置的适配器实现                                                                                    | 创建返回 unavailable                                                                                                  | 换实现影响下一次请求。已记录的最终请求沿原采用，在途调用不受影响                                                                               |
| modelContext | agentModelContext    | 必需。端口是契约包的 ModelContextReader，装配时绑定到模型这个消费者                                                                                 | 创建返回 unavailable                                                                                                  | 换实现后下一次读取生效。未采用的读取丢弃，已采用的覆盖保留在 checkpoint                                                                        |
| handoff      | agentMessageHandoff  | 必需。端口是契约包的 MessageHandoff，由外部协调者或独立调用方的提供者实现                                                                           | 创建返回 unavailable，没有消息准入就不能受理输入                                                                      | 换实现只影响尚未准入的候选。已接纳的消息沿原准入依据，不重新准入                                                                               |
| models       | modelRuntime         | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | 换 Model 提供者不代业务接管，在途调用沿原身份查询，后继 runtime 认回                                                                           |
| tools        | toolRuntime          | 局部必需：采用的定义带有工具动作时                                                                                                                  | 采用的定义声明必需的工具能力时，创建返回 unavailable。其他情况在动作发起处返回 unavailable，不放行，也不伪造结果      | 按上文局部必需依赖的换代规则。换 Tool 提供者不代业务接管，在途调用使用已保存引用查询；未关联 intent 在当前合法资格下沿完整原请求与 consumer 重入 invoke；后来 rejected 不排除历史未知，保留原责任，不建竞争 denied |
| admission    | agentActionAdmission | 局部必需：采用的定义带有工具动作时。端口是契约包的 ActionAdmission，由授权领域的适配器实现                                                          | 采用的定义带有工具动作时，创建返回 unavailable。运行中该端口返回 unavailable 时，该批动作全部被拒绝，不放行，也不出卡 | 换实现后下一次准入生效。已经 allow 的准入证据由 Tool 在发起前按当前权限再核，参数或依据变化时旧批准失效                                        |
| extensions   | agentExtensions      | 局部必需：采用的定义声明了扩展位置时。端口是契约包的 ExtensionImplementations，形状归[扩展规格](../../agent-contract/docs/public-api/extensions.md) | 已声明的必需扩展无法解析时，创建返回 unavailable。可选扩展按其声明的不可用处置跳过                                    | 已开始的经过保留精确采用，不因换代重问、重判或重放效果                                                                                         |
| cards        | agentDecisionCards   | 局部必需：存在可能出卡的扩展或动作准入时。端口是契约包的 DecisionCards，由人在回路领域的适配器实现                                                  | 需要出卡的路径返回 unavailable，按各自声明的不可用处置                                                                | 已呈现的卡片按原身份认回，不重新出卡                                                                                                           |
| materials    | agentMaterials       | 本实现局部必需：读取 received 完整材料；其他 custody 路径也使用它                                                                                    | M3 无法采用 received 结果，显式保留等待或失败                                            | Model 材料与条目共同提交；未知沿原接收操作查询                                                                               |
| reads        | agentReads           | 局部必需：扩展使用具名读取时                                                                                                                        | 该读取返回 unavailable，经过保留原状态                                                                                | 已捕获的读取值不重读                                                                                                                           |
| registration | 无服务键             | 可选：只在需要目录路由和重启后发现时。端口是宿主为本实例提供的 AgentRegistrationHandle，runtime 不取得整个宿主                                      | 实例不被发布。runtime 只能经返回的 provider 使用，connect 与 resolve 不可用，quiesce 跳过撤登记                       | 换宿主前先 quiesce 或 detach。新宿主为新的预约提供新的句柄，旧登记不能撤后继                                                                   |
| clock        | agentClock           | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | now 为新失败候选及 W0 检查读取 UTC 当前时刻，失败为 unavailable（owner 为 agentClock）；waitUntil 等待进程内检查时刻。无法表示的检查时刻返回 unavailable，不伪造或截断。换时钟不改变逻辑终态               |

## 工厂配置

本表是 Agent 自己的可配置取值项的唯一位置。取值项经过校验，默认值只是装配提供的配置初值，可以由装配者替换。本契约不规定数值默认值。

| 配置项                   | 含义                                                                                                                                                                   | 单位 | 校验                                                                                                | 默认值     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- | ---------- |
| observerBufferBytes      | 每个活体订阅在内存中的缓冲上界，包括观察订阅的状态投影和事件订阅已预取的页。超出时该订阅以不可用结束，事件订阅用原游标重连，观察订阅重新 connect。不影响可靠读取与确认 | 字节 | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| reconciliationDelayMs    | 对账未决操作之间的等待间隔，也是查询暂不可用的原项下一次检查之前的间隔                                                                                                 | 毫秒 | 非负整数                                                                                            | 由装配提供 |
| reconciliationBatchLimit | 恢复与等待之内每个处理段最多对账或重读的未决项数。达到限额后 Agent 让出调度机会，下一段接着处理，不丢项。限额不是未决项总数的上界                                      | 项   | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| denialBackoffMs          | 模型回复被消息准入否决之后，发新调用之前的退避                                                                                                                         | 毫秒 | 非负整数。否决次数不设上限                                                                          | 由装配提供 |
| toolConcurrency          | 一个 execution 内同时在途的获准 Tool 调用数上限。超出的动作按原动作顺序等待名额。Tool 自己的并发与排队规则另行适用                                                     | 个   | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| jointCommits             | 本装配会使用的 CallerCommit 共同提交种类。创建时与 Journal 提供者声明的参加者逐种比对，缺一种返回 unsupported。独立调用的装配列空表。它不表达输入与终态的协调能力，那项由 `coordination` 表达 | 无   | 列表元素取自 message、context-transition、custody、processed，不重复。`none` 不需要参加者，不在表中 | 由装配提供 |
| coordination             | 本装配要求的 Journal 协调模式。创建时与 Journal 绑定声明的 `capabilities.coordination` 严格相等，不相等返回 unsupported。没有隐式默认。standalone 配置加 standalone 绑定可独立 invoke、submit 与 finish；coordinated 配置加 coordinated 绑定在 open、attach、submit 与 tryFinish 强制协调核对，规则见 SPEC 的“[提交参加者协议](../../agent-contract/SPEC.md#提交参加者协议)” | 无   | `standalone` 或 `coordinated`，必填 | 由装配提供 |
| loopGuardPolicy          | 循环判断这一受信系统扩展所用检测策略的精确采用。算法与阈值由该采用携带，守卫事实的 `policy` 记录它。阈值不是本表的数值项，Agent 不写死数值                             | 无   | `Adoption` 的四个字段都是非空字符串。通用实现解析不到该采用时，创建返回 unavailable                 | 由装配提供 |

循环判断的默认实现随本通用实现提供，它按 `loopGuardPolicy` 读原始工作事实并记录守卫事实，行为见 SPEC 的“[循环守卫](../../agent-contract/SPEC.md#循环守卫)”。替换这项受信系统扩展是装配方的指定，不走作者声明。工具并行上限 `toolConcurrency` 由 [Loop 算法页的 A2](architecture/loop-algorithm.md#复杂度上界与进展) 使用，每段处理限额 `reconciliationBatchLimit` 由恢复与等待的处理段使用，见[内部机制](architecture/mechanisms.md#等待唤醒与公平)。事件读取窗口的上限不是 AgentConfiguration 的取值项：每次读取的 `limit` 超过提供者声明的上限时返回输入无效，见 SPEC 的“[读取、游标与缺口](../../agent-contract/SPEC.md#读取游标与缺口)”。压缩的预算与计划归 Context，不在本表登记。压缩的步数上界来自 Context 的压缩计划，是 CompactionProgress 的 bound，不是 AgentConfiguration 的取值项。ended 执行的事件与结果保留政策由 Journal 提供者声明，不是 AgentConfiguration 的一项。

## 行为与失败

Journal 必须支持本 execution 的输入与条件终结、原操作查询、可靠事件及围栏。独立提供者不接收外部完成批准。需要与外部协调者共同受理输入和终结的装配，选择 coordinated 的 Journal 绑定并把配置 `coordination` 设为 coordinated；需要 CallerCommit 共同提交的装配，Journal 提供者还须声明对应的提交参加者，装配者核验其适用范围，规则见 SPEC 的“[提交参加者协议](../../agent-contract/SPEC.md#提交参加者协议)”。声明的形状是 `AgentJournal.capabilities` 的 `coordination` 与 `participants`，见[公开接口页](../../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)。六项局部必需依赖可由阶段适配器提供：工具、扩展、卡片、动作准入、材料和具名读取。模型与请求准备是必需依赖，不经阶段适配器，在 Cordis 装配中由宿主以静态 inject 取得。阶段缺席返回原契约的等待或不可用，不能伪造成功。

同 runtime 顺序执行复用解析和可重建缓存。执行之间不沿用的状态见 SPEC 的“[创建、登记与复用](../../agent-contract/SPEC.md#创建登记与复用)”。权限模式由授权提供者解释，协作设置由 CurrentConditions 投影为具名推进要求。守卫阶梯不来自 CurrentConditions，由循环判断按 `loopGuardPolicy` 计算并随 checkpoint 持久。模型选择、Runtime Context 的读取和压缩的规则见 SPEC 的“[请求、扩展和材料接缝](../../agent-contract/SPEC.md#请求扩展和材料接缝)”。定义结构或安全范围变化走新实例与兼容交接。

quiesce 的形状与行为都不在本页：形状见契约包的 AgentRuntimeControl，同一操作的重试、已 unresolved 之后的重试、以及对停用中 runtime 的新 quiesce，行为见 SPEC 的“[托管协调与运行实例](../../agent-contract/SPEC.md#托管协调与运行实例)”。本实现只负责资源释放：工厂取得的依赖为借用对象，只释放自己创建的订阅和资源。Model 与 Tool 的原执行、共享连接和存储由各自拥有者管理。业务保管不依赖本 provider 持续在线。

## 独立 Model 接收入口

根入口导出 `createAgentModelReceiver`、`createModelReceiverState`、`agentModelDeliverySchema` 和 `readModelDeliveryMaterial`。类型由 [receiving-types.ts](../src/receiving-types.ts) 与 [receiving.ts](../src/receiving.ts) 拥有。

`ModelReceiverDependencies` 必须传同一提供者的 journal/entries/materials/received，receive-result 的 access check，原目标查询 targets，Model inspect/dispatches 窄面，账目 outlet 与显式租户容量。`ModelReceptionTarget` 带原 execution、instance 和 model PendingCall。targets 的 resolve 按调用引用取得原绑定，forExecution 返回同租户 execution 的原 Model 绑定集合。两者由保存原消费绑定的提供者实现，核当前保管资格，不按 consumer 文本或当前 attachment 猜身份。received 为 null 时工厂拒绝创建接收方。

`createModelReceiverState()` 的返回值由宿主持有。重装配继续传同一状态。句柄的 push 遵守 Model 接收顺序，共同提交、材料核对及入队后即可返回 saved，不等待 outlet。recover 与 retry 返回 `Reply<ModelReceiverReport>`：先取得原绑定集合，再核每个原 instance/execution 的 receive-result 资格；不存在、无绑定或无权统一 denied，依赖不可用返回具名 unavailable。recover 只读取该集合所属的 received 与材料；retry 只驱动集合内的未知提交与账目。每次出站前和返回报告前重新核当前资格，报告及诊断只含本次已授权集合，不纳入 await 期间新增绑定。inspect 是宿主管理视图，返回全局待办数、blocked 数及诊断副本，不能作为租户公开查询。账目 hard failure 保持 blocked，重装配不会自动重发。状态持有真实任务引用及当前出站驱动代；旧代只完成已开始的交接，不发出后继，实际在途任务结束前不释放出口占用。维护取消结束本次等待与后续驱动，不取消真实交接。最终资格检查尚未完成时，返回无内容 unavailable，owner 为 agent-model-receiver，diagnostic 为 maintenance-cancelled，不返回 counts 或私有诊断。

facts 材料保存原租户编码与完整 ModelDelivery。精确采用为 owner=agent、name=received-model-delivery、revision=1、digest=agent:received-model-delivery/1。`readModelDeliveryMaterial(access, material, expected)` 核对 schema、租户与不含材料引用的原 received 草稿；合法时返回完整 delivery，不合法时返回 null。它不读取存储，也不证明资格或耐久。

正常 loop 只 admit/cancel Model；未知或恢复时 inspect 只作受理对账。M1/M3/I3 消费 Journal 的 received 与同提供者材料，不再保留 processed 完成材料或 Model ACK 管线。保留的 Journal recordResult 服务其他既有责任。

测试装配可显式传 receivingPrincipal 启用公开 Model testing pusher。controls.pusher 暴露 deliveries、settled 与 acknowledgements，controls.receiver 是独立接收方。controls.journal.provider 为同源四视图，targets 在原 PendingCall 提交时保留原绑定。该提供者无磁盘耐久。`createModelReceiverFixture()` 提供真实 memory Journal、原 PendingCall 及显式 Model/Access/outlet 替身，供宿主工厂的公共入口测试使用；它不运行真实 Model host。

## 测试 Journal 的保留引用故障

`@omne-harness/agent/testing` 的 `createMemoryAgentJournal` 提供单进程、非耐久的测试 Journal。`MemoryAgentJournalOptions.retainedToolInvocationFaults` 仅在构造时严格为 `true` 才开启故障控制，默认关闭。以后修改 options 不改变开关。`createTestAgentDependencies({ journal: options })` 将同一选项传入，控制句柄为 `controls.journal`。

开启后，控制句柄的同步方法 `setRetainedToolInvocationFault({ tenant, execution, control, fault })` 只更改一个已保存 Tool control 的 `toolInvocation`。`control` 指接受控制 C 的 operation，不是 recording R。公开类型由已有 `MemoryAgentJournal` 导出；调用者可用 `Parameters` 和 `ReturnType` 取得方法类型。此方法不在 `AgentJournal` port 上。

| fault | 对目标字段的操作 |
| --- | --- |
| `{ kind: 'malformed' }` | 写入固定文本 `memory-journal:malformed-retained-tool-invocation`。这是显式存储损坏 fixture，不是合法引用的品牌铸造 |
| `{ kind: 'foreign-tenant', reference }` | 保存经真实 Tool resolver 确认为外租户的引用原字节。调用方用公开 `encodeToolInvocationRef` 为第二租户构造引用；它不证明存在实际 Tool 调用 |
| `null` | 恢复本设施首次保存的原字段字节，并删除该目标的恢复基线。没有基线也返回 `cleared` |

设置成功返回 `applied`，清除成功返回 `cleared`。开关关闭首先返回 `rejected(disabled)`，不读取输入。开启时按普通对象的精确字段和现有 tenant/Agent ID codec 校验；额外字段、未知 fault、缺少或伪造的 foreign 引用均返回 `rejected(invalid-input)`。foreign payload 的校验先于目标查询。execution 不存在、owner tenant 不同或 control 不存在均返回 `rejected(target-unavailable)`。只有自有非 Tool control 返回 `rejected(not-tool-control)`。所有拒绝保持原状态与恢复基线，结果不携目标详情。

每个实例按 canonical tenant、execution、control 组合保存首次原字段。重复设置或切换 fault 保留首次基线，清除恢复精确原字节，包括合法空白。故障持续到显式清除或实例丢弃。清除只恢复引用，不撤销阶段事实、toolOperation、回执、revision、事件或其他记录。该控制不进入正常写入，不消费排队故障，不改变 pending 原请求、查询记录或参加者响应。

验证先用正常公开操作保存 Tool control，并保存完整正常状态 S0。注入后用 `load` 取得 S1，检查仅目标字段改变，再以真实 `resolveToolInvocationRef` 判定损坏。故障 fixture 的 `load` 静态品牌不证明引用合法，resolver 接受 `unknown`；不要用要求合法品牌的 `readToolInvocationRef` 代替检查。旧 load 快照保持不变。

随后调用真实 `port.recordControl` 的新 R，按 [控制接受与迟到引用](../../agent-contract/SPEC.md#控制接受与迟到引用) 观察精确失败，并核对 S2 等于 S1、原 C/R 回执与完整事件不变、新 R 仍 query unknown。原 R 的同输入认回、异输入冲突及外租户附件次序仍按原业务规则。清除后还须验证真实合法写入。设施自身的 `rejected` 不是业务防御证据。

行为资源为 [保留引用公开观察](../tests/journal-tool-control.spec.ts) 和 [控制隔离与恢复](../tests/memory-journal.spec.ts)。它们覆盖内存存储故障，不证明生产存储损坏、耐久恢复、跨进程隔离或独立 QA 已接受。

接收工厂返回 `Outcome`：联合接收能力存在时为 `ok` 句柄；`received=null` 时为 `failure: { kind: 'unsupported' }`，不创建接收能力。
