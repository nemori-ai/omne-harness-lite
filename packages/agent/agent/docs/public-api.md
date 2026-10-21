# Agent 通用实现的构造入口

根入口导出下列类型、`createAgentRuntime`、通用评估器 `agentEvaluator`（契约 `AgentEvaluator` 的实现，装配经 `AgentAdoptions` 为绑定的定义采用它）与它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema`。根入口还导出 `agentProcessedResultSchema`、`readProcessedModelMaterial` 与类型 `ProcessedModelIdentity`，说明见下文。`createAgentRuntime` 的协调者要求所采用的评估器以本包的节点集合（Loop 算法页节点表的节点 ID）为 `position` 词汇，并返回本包转移表能承接的 `Next`。经 `AgentAdoptions` 交来的其他评估器只与契约形状兼容，不与本协调者的语义兼容：它的位置与决定没有转移行时，执行以缺陷停止。工厂已实现创建校验与四个面的访问守卫，`invoke` 走 Loop 正常路径的骨架，其他操作本体尚未实现，实际支持范围与未实现的校验见[成员 README](../README_ZH.md#支持范围)。下列行为是设计中的工厂行为，操作和行为由 [纯契约](../../agent-contract/README.md) 拥有。测试装配在 `./testing` 入口，见[成员 README](../README_ZH.md#支持范围)。本包不接收 Cordis Context，不导入任何外部协调者的类型。

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
  Evidence,
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
  scope: Evidence
  definition: Adoption
}>
export type AgentConfiguration = Readonly<{
  observerBufferBytes: number
  reconciliationDelayMs: number
  reconciliationBatchLimit: number
  denialBackoffMs: number
  toolConcurrency: number
  jointCommits: readonly Exclude<CallerCommit['kind'], 'none'>[]
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

创建先校验配置、安全作用域、精确采用和提供者能力，成功得到 idle 实例。提供者能力包括：Journal 提供者对配置 `jointCommits` 中每一种共同提交声明了参加者。发布由宿主完成。失败撤除本次创建的临时资源，不能返回半就绪实例。提供登记句柄时，句柄的 instance 必须等于绑定的 instance。配置不能覆盖绑定。纯工厂没有自己的全局注册表。

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
| unsupported | 配置 `jointCommits` 中有一种共同提交，没有出现在 Journal 提供者声明的参加者集合里。创建不保存任何状态，不创建 runtime |

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
| tools        | toolRuntime          | 局部必需：采用的定义带有工具动作时                                                                                                                  | 采用的定义声明必需的工具能力时，创建返回 unavailable。其他情况在动作发起处返回 unavailable，不放行，也不伪造结果      | 按上文局部必需依赖的换代规则。换 Tool 提供者不代业务接管，在途调用沿原身份查询                                                                 |
| admission    | agentActionAdmission | 局部必需：采用的定义带有工具动作时。端口是契约包的 ActionAdmission，由授权领域的适配器实现                                                          | 采用的定义带有工具动作时，创建返回 unavailable。运行中该端口返回 unavailable 时，该批动作全部被拒绝，不放行，也不出卡 | 换实现后下一次准入生效。已经 allow 的准入证据由 Tool 在发起前按当前权限再核，参数或依据变化时旧批准失效                                        |
| extensions   | agentExtensions      | 局部必需：采用的定义声明了扩展位置时。端口是契约包的 ExtensionImplementations，形状归[扩展规格](../../agent-contract/docs/public-api/extensions.md) | 已声明的必需扩展无法解析时，创建返回 unavailable。可选扩展按其声明的不可用处置跳过                                    | 已开始的经过保留精确采用，不因换代重问、重判或重放效果                                                                                         |
| cards        | agentDecisionCards   | 局部必需：存在可能出卡的扩展或动作准入时。端口是契约包的 DecisionCards，由人在回路领域的适配器实现                                                  | 需要出卡的路径返回 unavailable，按各自声明的不可用处置                                                                | 已呈现的卡片按原身份认回，不重新出卡                                                                                                           |
| materials    | agentMaterials       | 本实现局部必需：M3 processed 结果；设计中的 custody 路径也使用它                                                                                    | 本实现 M3 不 ACK，保留原 Model 责任；不推广为所有 processed 实现的公共要求                                            | 保存成功而 Journal 绑定未知时保留孤立材料，以原 Journal 操作查询                                                                               |
| reads        | agentReads           | 局部必需：扩展使用具名读取时                                                                                                                        | 该读取返回 unavailable，经过保留原状态                                                                                | 已捕获的读取值不重读                                                                                                                           |
| registration | 无服务键             | 可选：只在需要目录路由和重启后发现时。端口是宿主为本实例提供的 AgentRegistrationHandle，runtime 不取得整个宿主                                      | 实例不被发布。runtime 只能经返回的 provider 使用，connect 与 resolve 不可用，quiesce 跳过撤登记                       | 换宿主前先 quiesce 或 detach。新宿主为新的预约提供新的句柄，旧登记不能撤后继                                                                   |
| clock        | agentClock           | 必需                                                                                                                                                | 创建返回 unavailable                                                                                                  | now 为新失败候选读取 UTC 当前时刻，失败为 unavailable（owner 为 agentClock）；waitUntil 调度退避与对账间隔。换时钟不改变逻辑终态               |

## 工厂配置

本表是 Agent 自己的可配置取值项的唯一位置。取值项经过校验，默认值只是装配提供的配置初值，可以由装配者替换。本契约不规定数值默认值。

| 配置项                   | 含义                                                                                                                                                                   | 单位 | 校验                                                                                                | 默认值     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- | ---------- |
| observerBufferBytes      | 每个活体订阅在内存中的缓冲上界，包括观察订阅的状态投影和事件订阅已预取的页。超出时该订阅以不可用结束，事件订阅用原游标重连，观察订阅重新 connect。不影响可靠读取与确认 | 字节 | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| reconciliationDelayMs    | 对账未决操作之间的等待间隔，也是查询暂不可用的原项下一次检查之前的间隔                                                                                                 | 毫秒 | 非负整数                                                                                            | 由装配提供 |
| reconciliationBatchLimit | 恢复与等待之内每个处理段最多对账或重读的未决项数。达到限额后 Agent 让出调度机会，下一段接着处理，不丢项。限额不是未决项总数的上界                                      | 项   | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| denialBackoffMs          | 模型回复被消息准入否决之后，发新调用之前的退避                                                                                                                         | 毫秒 | 非负整数。否决次数不设上限                                                                          | 由装配提供 |
| toolConcurrency          | 一个 execution 内同时在途的获准 Tool 调用数上限。超出的动作按原动作顺序等待名额。Tool 自己的并发与排队规则另行适用                                                     | 个   | 正整数，不超过安全整数范围                                                                          | 由装配提供 |
| jointCommits             | 本装配会使用的共同提交种类。创建时与 Journal 提供者声明的参加者逐种比对，缺一种返回 unsupported。独立调用的装配列空表                                                  | 无   | 列表元素取自 message、context-transition、custody、processed，不重复。`none` 不需要参加者，不在表中 | 由装配提供 |
| loopGuardPolicy          | 循环判断这一受信系统扩展所用检测策略的精确采用。算法与阈值由该采用携带，守卫事实的 `policy` 记录它。阈值不是本表的数值项，Agent 不写死数值                             | 无   | `Adoption` 的四个字段都是非空字符串。通用实现解析不到该采用时，创建返回 unavailable                 | 由装配提供 |

循环判断的默认实现随本通用实现提供，它按 `loopGuardPolicy` 读原始工作事实并记录守卫事实，行为见 SPEC 的“[循环守卫](../../agent-contract/SPEC.md#循环守卫)”。替换这项受信系统扩展是装配方的指定，不走作者声明。工具并行上限 `toolConcurrency` 由 [Loop 算法页的 A2](architecture/loop-algorithm.md#复杂度上界与进展) 使用，每段处理限额 `reconciliationBatchLimit` 由恢复与等待的处理段使用，见[内部机制](architecture/mechanisms.md#等待唤醒与公平)。事件读取窗口的上限不是 AgentConfiguration 的取值项：每次读取的 `limit` 超过提供者声明的上限时返回输入无效，见 SPEC 的“[读取、游标与缺口](../../agent-contract/SPEC.md#读取游标与缺口)”。压缩的预算与计划归 Context，不在本表登记。压缩的步数上界来自 Context 的压缩计划，是 CompactionProgress 的 bound，不是 AgentConfiguration 的取值项。ended 执行的事件与结果保留政策由 Journal 提供者声明，不是 AgentConfiguration 的一项。

## 行为与失败

Journal 必须支持本 execution 的输入与条件终结、原操作查询、可靠事件及围栏。独立提供者不接收外部完成批准。需要与外部协调者共同提交的装配，Journal 提供者还须声明对应的提交参加者，装配者核验其适用范围，规则见 SPEC 的“[提交参加者协议](../../agent-contract/SPEC.md#提交参加者协议)”。声明的形状是 `AgentJournal.capabilities.participants`，见[公开接口页](../../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)。六项局部必需依赖可由阶段适配器提供：工具、扩展、卡片、动作准入、材料和具名读取。模型与请求准备是必需依赖，不经阶段适配器，在 Cordis 装配中由宿主以静态 inject 取得。阶段缺席返回原契约的等待或不可用，不能伪造成功。

同 runtime 顺序执行复用解析和可重建缓存。执行之间不沿用的状态见 SPEC 的“[创建、登记与复用](../../agent-contract/SPEC.md#创建登记与复用)”。权限模式由授权提供者解释，协作设置由 CurrentConditions 投影为具名推进要求。守卫阶梯不来自 CurrentConditions，由循环判断按 `loopGuardPolicy` 计算并随 checkpoint 持久。模型选择、Runtime Context 的读取和压缩的规则见 SPEC 的“[请求、扩展和材料接缝](../../agent-contract/SPEC.md#请求扩展和材料接缝)”。定义结构或安全范围变化走新实例与兼容交接。

quiesce 的形状与行为都不在本页：形状见契约包的 AgentRuntimeControl，同一操作的重试、已 unresolved 之后的重试、以及对停用中 runtime 的新 quiesce，行为见 SPEC 的“[托管协调与运行实例](../../agent-contract/SPEC.md#托管协调与运行实例)”。本实现只负责资源释放：工厂取得的依赖为借用对象，只释放自己创建的订阅和资源。Model 与 Tool 的原执行、共享连接和存储由各自拥有者管理。业务保管不依赖本 provider 持续在线。

## 本实现的 processed 完成材料

`agentProcessedResultSchema` 是本包拥有的精确版本采用：owner 为 `@omne-harness/agent`，name 为 `agent-processed-model-result`，revision 为 `1`，digest 为 `agent:processed-model-result/1`。它标识 `AgentMaterials.facts` 的解释规则，不是处理完成证明。

M3 将已解释的 reply、partial 或 no-reply 与原 tenant、execution、step、consumption、consumer、ProducedResult、settlement、parts、dispatch/费用及 I3 后续责任一起保存。稳定材料 identity 为 `<execution>/<consumption>/processed/1`，在原租户下同输入认回原回执、异值冲突。保存须不可变且可读，回执 owner 必须与原受理 consumer.owner 一致。协调者直接采用材料回执，不改写 owner。

材料成立后，M3 以 recordResult(processed) 将原 ProducedResult/consumption 与该完成依据绑定。材料与绑定都成立后，从 Journal.results[].completion 读回核对，再在当前原 Authority 下 ACK。保存失败或绑定失败/未知均零 ACK；已存孤立材料保留。缺材料端口或不支持本 schema 时，本实现不能完成这条 processed 路径。

`readProcessedModelMaterial(material, expected)` 接受材料与 `ProcessedModelIdentity`，后者给出原 tenant、execution、step、consumption、consumer 与 ProducedResult。它核对精确 schema、原关联与后续责任，重新解释已存结果，再返回回复、部分结果或无回复。未知 schema、损坏或关联不符返回 failure；它不向 Model 索取全文。

该导出用于拥有者为 Agent 的 Model 完成证据适配器：适配器需要解释本包 schema，不能依赖内部文件路径或自行重写解释规则。当前测试装配的严格证据适配器从根导入此函数并实际消费它。真实宿主适配器仍未由本包交付。读取器单独不证明材料已经保存、Journal 绑定成立或当前资格有效。受信适配器还须读取实际不可变材料，核验原 Model 调用及 consumer、已成立 Journal 绑定和当前消费资格，再认可 ACK。

I3 与当前内部窄接续读取 Journal 完成依据，不依赖旧协调者的结果缓存。该接缝只覆盖原 runtime/Access/Authority、旧驱动已停的必要串行切点；它不提供新的公开恢复端口、custody 或阶段 5 通用水合。

M3 已提交 producer/M4 后，新协调者通过 I3 查询原 reference 的真实 acknowledged 状态，核原 call/version/consumer、ACK operation 与 completion receipt，认回已丢失的原确认依据，不重新 ACK。随后既有 O0 以原 consumption 的稳定操作记录 release.confirmed；Journal 写入未知用原操作 query，unknown 与 unavailable 保持失败及责任。此处只支持本卡主调用接续，O0 的整体责任交清仍由后续阶段接受。
