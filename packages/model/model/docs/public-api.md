<a id="model-实现公开入口候选"></a>
# Model 实现公开入口

本包已实现 executeModel、凭据判定、createModelSendBoundary 与 createModelRuntime 的受理、查询、取消意图、原流保存与最小实例观察。已确认调用的收场支持范围见[实现规格](../SPEC.md#已实现的调用收场)，结果读取及 processed ACK 已实现，retained ACK、恢复与生产宿主仍未实现。领域类型与提供者端口归 [model-contract](../../model-contract/docs/public-api.md)，本页只拥有实际执行函数和本实现的构造形状。独立执行签名以 [execute.ts](../src/execute.ts) 为唯一声明，runtime 构造类型以 [runtime.ts](../src/runtime.ts) 为唯一声明，sender 构造类型以 [send/types.ts](../src/send/types.ts) 为唯一声明；下方独立能力工厂仍是未实现设计。

## 执行函数与构造

```ts
import type {
  Access, FixedModelRequest, ModelTransport, IndependentModelFact,
  ModelCommands, ModelSendBoundary, ModelRetryPolicy, ModelInstanceHost,
  ModelClock, ModelProvider, ModelDriver, ModelProfileSource, ModelProfiles,
  ModelPreparationResources, ModelRequestPreparation, ModelConverterCatalog,
  ModelContentAuthority, ModelMessageConversion,
} from '@omne-harness/model-contract'

import { executeModel, createModelRuntime } from '@omne-harness/model'
import type { ModelConfiguration, ModelDependencies, ModelRuntimeProvider } from '@omne-harness/model'

```

ModelDependencies 和 ModelConfiguration 只约束本实现的构造器。其他提供者须实现共同操作与行为，不必复刻该配置。操作参数包含主体、租户、原调用和业务请求；实例宿主、时钟、发送及持久化是显式依赖，不从全局 Cordis Context 取得。

executeModel 接收 FixedModelRequest、ModelTransport 和 AbortSignal，返回 AsyncIterable<IndependentModelFact>。一次返回值只执行一次。原生 generator 的 return 不抢占等待中的 next，停止请求使用 signal。终局交付前已完成全部清理尝试，清理失败在消费者下一次推进时抛出 independent-cleanup-failed，详见 [独立执行](../SPEC.md#独立执行)。

行为归 [SPEC](../SPEC.md)，纯契约不转导本页函数。单机插件及目录装载设计见 [Cordis 装配](cordis.md)。

## 独立能力构造

```ts
export declare function createModelProfiles<P>(source: ModelProfileSource<P>): ModelProfiles<P>
export declare function createModelRequestPreparation<P>(
  resources: ModelPreparationResources<P>,
): ModelRequestPreparation<P>
export declare function createModelMessageConversion<P>(dependencies: Readonly<{
  catalog: ModelConverterCatalog<P>; authority: ModelContentAuthority<P>
}>): ModelMessageConversion<P>
```

这些构造函数不启动网络、读取词表或登记框架服务。profiles 隐藏同名胜出、撤回遮蔽、模态相容和选择解释；preparation 隐藏逐供应商参数与 schema 相容检查，不计量；conversion 隐藏选择、校验和租约收尾。删除这些 module 会把同一算法散布到调用者。档案维护由实际权威提供者实现共同写协议，不另造一个无行为的转发工厂。`ModelPreparationResources` 的生产实现已由下文的 `createModelPreparationResources` 提供。

createModelRuntime 只构造对象，返回 runtime 管理面及受信 driver。装配者先创建宿主，再构造 runtime，await host.bind(provider.driver) 成功后才发布普通服务并执行 recover。binding 不在构造期间回调，避免半初始化依赖。普通使用者不能从 ModelRuntime 取得 driver。

## 已实现的凭据入口

此节导航真实源码，不重复声明。凭据的纯契约（`CredentialId`、引用、查询、`CredentialPresence`、`CredentialResolution`、`CredentialPort`、`SendFace`、`MODEL_SEND`、`decodeCredentialId`、`sameCredentialHolder`）归 [model-contract](../../model-contract/docs/public-api.md#凭据引用与解析端口)，本包不导出它们，也不转导。服务定义归 model-cordis-contract，本地保管、插件与注入发送归 [model-host-local](../../model-host-local/docs/public-api.md)。目标归属见[组架构](../../docs/architecture.md#凭据的现有装配边界)。

| 消费入口 | 实际源码与能力 |
| --- | --- |
| `@omne-harness/model` | [index.ts](../src/index.ts) 导出 `deliver`、调用记录与发送回执类型，以及存在性与解析的判定函数 `judgeGate`、`judgePresence`、`judgeResolution` 和它们读取的状态快照类型 `CustodianState`、`Binding`、`BindingLife` |

包导出根入口和独立 `./testing`，`@omne-harness/model/cordis` 与 `@omne-harness/model/execute` 不再解析。判定只读调用者传入的状态快照，不读文件，也不依赖保管实现。查询租户未经 legal-identity 铸造时，两个判定都返回 `denied`，先于其他判定；快照里有绑定的租户未经铸造时，本应给出工厂秘密的解析同样返回 `denied`。快照类型是判定对保管状态的显式依赖形状，从 model 根入口导出，不进任何契约包；`Binding.secret` 与 `CustodianState.factorySecret` 带秘密字段，只作为类型公开，不携带值。[credential.ts](../src/credential.ts) 拥有判定与快照形状。调用记录与发送回执归 [deliver.ts](../src/deliver.ts)。行为承诺归 [SPEC](../SPEC.md#凭据引用与解析)。根入口还导出 createModelRuntime；它支持受理、原流保存、实例观察及[有限的原终局收场](../SPEC.md#已实现的调用收场)，不证明完整托管调用与消费已交付。

## 内存测试入口

`@omne-harness/model/testing` 从 [testing/index.ts](../src/testing/index.ts) 导出 `createMemoryModelCommands`、`createTestModelDependencies` 及其测试配置、authority、evidence、control 类型。根入口不转导测试工厂、脚本或控制器。

`createMemoryModelCommands(options)` 返回完整的 ModelCommands 与窄控制器。options 和证据端口以 [types.ts](../src/testing/types.ts) 为准。调用者提供当前资格适配器、精确证据采用、免守卫 owner、时钟和有限容量。guarded owner、重复 owner 或缺证据适配器在构造时拒绝。

`createTestModelDependencies(options)` 返回五个 dependencies 及对应 controls。它提供手动 UTC 时钟、有限唤醒队列、按原策略位置保存的重试计划和按 dispatch 的一次性脚本传输。发送先复制本次需求的值字段，保留原租户、主体证明和取消 signal。发送消费根入口 createModelSendBoundary，不另有测试业务编排。sending 显式提供凭据、受信来源与尝试容量；缺少时明确不可用。无发送或重试计划返回明确 unavailable。

```ts
import { createModelRuntime } from '@omne-harness/model'
import { createTestModelDependencies, type TestModelDependenciesOptions } from '@omne-harness/model/testing'

declare const options: TestModelDependenciesOptions<unknown>
const { dependencies, controls } = createTestModelDependencies(options)
const provider = createModelRuntime(dependencies, {
  outputBatchBytes: 1024, outputBatchDelayMs: 0, observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 128, readIdleMs: 1000, retryBackoffMs: 0, cleanupRetryMs: 0,
})
```

上述数值只用于构造示例，不是生产默认。构造不调用依赖。runtime 提供 calls.admit、inspect、dispatches、cancel 与真实目录 connect。admit 在解构与排队前复用[共同 judge](../../model-contract/SPEC.md#封闭输入判断)，保持 principal/tenant 同一性，畸形重放先 invalid。受信 driver 先发布初始实例，再接原发送流、保存和观察。beginRead、readNext、closeRead 与 processed acknowledge 已接真实 Commands。retained acknowledge 静态 unavailable，阶段 6.1；recover 与 quiesce 尚未实现。完整生产宿主仍归 3.5。普通 runtime 不暴露 driver。完整原参认回、正数批延迟的沉默读取限制、观察逻辑额度及并发 next 行为见 [当前构造支持](../SPEC.md#当前构造支持与本地模拟)。observerCheckIntervalMs 是必填正安全整数，专用于等待观察者的当前权限及实例复查，不复用 readIdleMs。
```ts
declare const input: Parameters<typeof provider.runtime.calls.admit>[0]
declare const driveInput: Parameters<typeof provider.driver.drive>[0]
await provider.runtime.calls.admit(input)
await provider.driver.drive(driveInput, new AbortController().signal)
await provider.runtime.calls.inspect({ ...input, admission: input.operation })
await provider.runtime.calls.dispatches(input)
```

宿主负责提供可信稳定的 driveInput，不从普通请求推导执行资格。取消 operation 必须不同于原 admission。停止 drive 不取消原调用。当前实现不提供生产池或跨进程恢复。

测试 limits.resultPageParts 限定每页结果项数，limits.resultPageTargetBytes 是规范 parts 数组 JSON 的 UTF-8 目标。完整 sealed/partial 项不拆分，超目标项独页；整个页不得超过原 capacity.bytes。消费者需容纳接近原容量的页。预算和本地有限上限见 [SPEC](../SPEC.md#当前构造支持与本地模拟)。controls.commands.configureResultPaging({tenant, call, resultPageParts, resultPageTargetBytes}) 只准备尚未收场且没有 read 的调用。两个数值须为正安全整数，结果冻结后拒绝修改。完整配置及最大表示预留进入原容量预算；失败原子不变。runtime 分页由注入的 Commands 拥有，内存测试不证明生产后端。unknown 控制按完整 tenant/call/operation/method 注入 applied 或 not-applied，揭示不能反转真实效果。适配器是受信、同步且不可重入的本地测试模型，不证明外部资格事务、耐久证据、跨进程排除或可靠消费。


## 产品发送构造

根入口 `createModelSendBoundary(options)` 返回共同 `ModelSendBoundary<P>`。公开构造类型 `ModelSendBoundaryOptions`、`SendCoordinator`、`CredentialSelection`、`SendResources`、`SendResource` 与 `SendStart` 的唯一声明在 [send/types.ts](../src/send/types.ts)。操作仍只接受共同 SendDemand 和 AbortSignal；普通调用者不能传 authorized、official、秘密或启动回调。

Commands、同步 coordinator、credentials 和 resources 由受信装配提供。coordinator.check 的 access 阶段先核当前访问及固定业务绑定，再进入本地原尝试；首次取得前的 prepare 阶段另核当前执行与取消资格，已发送或未知的权威记录先于该资格拒绝被识别。withinCurrent 在共享排他区核精确回执与窗口、当前资格及一次性认领，再最多一次同步调用产品闭包。resources.acquire 取得本次资源，startWithCredential 核本次物化归属、临时持有秘密并同步调用 start，finally 清除秘密。maxRetainedAttempts 必须是正安全整数，在取得资源前限制未知或活跃责任。

测试 `MemorySendSource` 显式登记 profile、supplier、recipient、model 和官方查询条件，current 在 MemoryState 排他区核当前来源及绑定。controls.send.createSender(overrides) 构造共用原后端的另一产品 sender，coordinator 为该后端的受控同步适配入口；覆盖项只用于注入测试依赖与故障。脚本计划不再提供 operation 或 window；测试通过实际命令观察生成值。消费者从公共 started 结果取得原 window 与 facts，并将 result.window 连同原执行与分派传给 Commands.preserve；命令仍核全部绑定。

原写认回、流保留、失败分类和资源寿命归 [SPEC](../SPEC.md#产品发送边界)。当前 factory 已实现直接发送边界，driver 已接入原唯一 facts 消费者及最小实例观察。原终局收场的具体支持见[实现规格](../SPEC.md#已实现的调用收场)，结果读取及 processed ACK 已实现，retained ACK 和生产宿主仍未完成。

## 准备资源构造

根入口 `createModelPreparationResources(options)` 返回共同 `ModelPreparationResources<P>`。公开构造类型 `ModelPreparationOptions`、`PreparationBinding`、`PreparationBindingSource` 与 `SupplierPort` 的唯一声明在 [preparation/resources.ts](../src/preparation/resources.ts)。`options.commands` 是 `Pick<ModelCommands, 'dispatches'>`；`options.bindings` 的形状与 pi 家族贡献相同，装配直接传 `composeFamilies(...)`；`options.supplierOf` 由拥有凭据范围的宿主提供；`options.maxCitedCalls` 来自配置。

请求组装方按 acquire、`rules.plan`、`meter.measure`、release 的顺序使用租约。它在 `acquire` 的输入上以 `lineage` 声明被延续的调用与各消息的来源调用；不声明时得到家族计量器本身。计量结果的 `calibration` 报告锚点命中或不命中的原因。读取、判决、报告与释放的行为归 [SPEC“准备资源与校准租约”](../SPEC.md#准备资源与校准租约)，数字的算法归家族包。

## 已实现的收场与返回判别

`createModelRuntime` 的 driver 以真实确认终止证据调用 Commands.settle。普通调用者从 calls.inspect 的 Reply、Lookup、CallState.phase 依次判别到 Settlement。Settlement 的 version 是结果身份，termination 是原终局，source 的 owner、record、revision、digest 是提供者保存的终局依据。完整类型归[共同公开接口](../../model-contract/src/result.ts)，具体接续和未支持路径归[实现规格](../SPEC.md#已实现的调用收场)。

正常输出限额为 completed/limit，输入超限为 failed/input-over-limit。Snapshot 只包含可见 blocks 与状态，不含完整 trims。drive 返回失败不自动推导业务失败，尤其释放失败可能与已收场并存。实际调用方法见[逐步示例](../examples/README.md)，[第五课](../examples/05-read-and-acknowledge.ts)展示 runtime 读取和 processed ACK。

## 已实现的结果消费

四个方法的唯一声明在[ModelConsumption](../../model-contract/src/call-surface.ts)，证据与回执在[result.ts](../../model-contract/src/result.ts)。beginRead 接收 principal、tenant、call、operation、result；readNext 接收原 read 与 after；closeRead 接收原 read。各方法保留身份引用并固定业务字段。

beginRead 的 started 包含 read 和首个 ReadState；acknowledged 只含已确认 custody。ReadState 分 reading/page 与 ended/reason。ResultPage 保留 parts、next 与真实 Settlement；ResultPart 分 sealed/block 与 partial/content/value，并保留 trims。相同 after 返回原页，当前资格和 ended 优先。

acknowledge 接收原 result、operation 与 processed/completion。completion 的四个证据字段由冻结 consumer 的 owner 提供，不能由调用方自称完成。成功返回 AckReceipt 的 call、result 与 custody；未知只用原操作和原证据认回。retained 静态 unavailable 不执行资源鉴权或 handoff。完整支持及刷新边界见[实现规格](../SPEC.md#结果消费支持)，可运行代码见[第五课](../examples/05-read-and-acknowledge.ts)。
