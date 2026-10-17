<a id="model-实现公开入口候选"></a>
# Model 实现公开入口

本包已实现凭据切片；执行工厂与托管运行仍未实现。领域类型与提供者端口归 [model-contract](../../model-contract/docs/public-api.md)，本页只拥有实际执行函数和本实现的构造形状。下列声明尚未实现，不是可导入示例。

## 执行函数与构造

```ts
import type {
  Access, FixedModelRequest, ModelTransport, IndependentModelFact,
  ModelCommands, ModelSendBoundary, ModelRetryPolicy, ModelInstanceHost,
  ModelClock, ModelProvider, ModelDriver, ModelProfileSource, ModelProfiles,
  ModelPreparationResources, ModelRequestPreparation, ModelConverterCatalog,
  ModelContentAuthority, ModelMessageConversion,
} from '@omne-harness/model-contract'

export declare function executeModel(
  request: FixedModelRequest,
  transport: ModelTransport,
  signal: AbortSignal,
): AsyncIterable<IndependentModelFact>
export type ModelConfiguration = Readonly<{
  outputBatchBytes: number; outputBatchDelayMs: number
  observerBufferBytes: number; readIdleMs: number; resultPageBytes: number
  retryBackoffMs: number; cleanupRetryMs: number
}>
export type ModelDependencies<P> = Readonly<{
  commands: ModelCommands<P>; send: ModelSendBoundary<P>; retry: ModelRetryPolicy<P>
  instances: ModelInstanceHost<P>; clock: ModelClock
}>
export type ModelRuntimeProvider<P> = ModelProvider<P> & Readonly<{ driver: ModelDriver<P> }>
export declare function createModelRuntime<P>(
  dependencies: ModelDependencies<P>, configuration: ModelConfiguration,
): ModelRuntimeProvider<P>
```

ModelDependencies 和 ModelConfiguration 只约束本实现的构造器。其他提供者须实现共同操作与行为，不必复刻该配置。操作参数包含主体、租户、原调用和业务请求；实例宿主、时钟、发送及持久化是显式依赖，不从全局 Cordis Context 取得。

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

这些构造函数不启动网络、读取词表或登记框架服务。profiles 隐藏同名胜出、撤回遮蔽、模态相容和选择解释；preparation 隐藏逐供应商参数及预算校验；conversion 隐藏选择、校验和租约收尾。删除这些 module 会把同一算法散布到调用者。档案维护由实际权威提供者实现共同写协议，不另造一个无行为的转发工厂。

createModelRuntime 只构造对象，返回 runtime 管理面及受信 driver。装配者先创建宿主，再构造 runtime，await host.bind(provider.driver) 成功后才发布普通服务并执行 recover。binding 不在构造期间回调，避免半初始化依赖。普通使用者不能从 ModelRuntime 取得 driver。

## 已实现的凭据入口

此节导航真实源码，不重复声明。凭据的纯契约（`CredentialId`、引用、查询、`CredentialPresence`、`CredentialResolution`、`CredentialPort`、`SendFace`、`MODEL_SEND`、`decodeCredentialId`、`sameCredentialHolder`）归 [model-contract](../../model-contract/docs/public-api.md#凭据引用与解析端口)，本包不导出它们，也不转导。服务定义归 model-cordis-contract，本地保管、插件与注入发送归 [model-host-local](../../model-host-local/docs/public-api.md)。目标归属见[组架构](../../docs/architecture.md#凭据切片的现有装配边界)。

| 消费入口 | 实际源码与能力 |
| --- | --- |
| `@omne-harness/model` | [index.ts](../src/index.ts) 导出 `deliver`、调用记录与发送回执类型，以及存在性与解析的判定函数 `judgePresence`、`judgeResolution` 和它们读取的状态快照类型 `CustodianState`、`Binding`、`BindingLife` |
| `@omne-harness/model/cordis`、`@omne-harness/model/execute` | 源码为空模块。保管与插件迁出后没有内容，入口声明随收口删除，调用者不要依赖 |

判定只读调用者传入的状态快照，不读文件，也不依赖保管实现。快照类型是判定对保管状态的显式依赖形状，从 model 根入口导出，不进任何契约包；`Binding.secret` 与 `CustodianState.factorySecret` 带秘密字段，只作为类型公开，不携带值。[credential.ts](../src/credential.ts) 拥有判定与快照形状。调用记录与发送回执归 [deliver.ts](../src/deliver.ts)。行为承诺归 [SPEC](../SPEC.md#凭据引用与解析)。这些入口不实现上文 executeModel 或 createModelRuntime，也不证明完整模型调用已交付。
