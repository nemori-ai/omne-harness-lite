# 公开接口导航

本文件导航本包的公开边界。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/model-host-local` | [index.ts](../src/index.ts)，发送资源在 [send-resources.ts](../src/send-resources.ts)，本地装配在 [assembly.ts](../src/assembly.ts) | `createLocalCustodian`、`openLocalCustodian`，类型 `LocalCustodian`、`Diagnostic`、`CreateOptions`、`CustodianOptions`、`LockOptions`、`OpenResult`、`UnavailableCause`；`createPiSendResources`、`SendResourceDefect`，类型 `PiSendResources`、`PiSendResourcesConfig`、`SendResourceDefectReason`；`assembleLocalModel`，类型 `LocalModel`、`LocalModelConfig` | 独立程序或宿主；不启动 Cordis |
| `@omne-harness/model-host-local/cordis` | [cordis.ts](../src/cordis.ts)，插件在 [src/plugins/](..)，`deliverInjected` 在 [deliver-injected.ts](../src/deliver-injected.ts) | `LocalCredentialPlugin`、`deliverInjected`；`ModelInstancesLocalPlugin`、`ModelConvertersLocalPlugin`；`createModelRuntimeLocalPlugin`，类型 `ModelHostPluginOptions`、`ModelRuntimeLocalPluginClass`、`ModelRuntimeLocalPluginInstance`、`HostEvent`；`createModelRequestPreparationPlugin`，类型 `ModelPreparationPluginOptions`、`ModelPreparationPlugin`、`ModelRequestPreparationPluginClass`；`createModelSendStagePlugin`，类型 `ModelSendStagePluginOptions`、`ModelSendStagePluginClass`、`ModelSendStageSettings` | Cordis 装配者、受信发送边界与受信宿主 |

`./cordis` 不导出 `ModelCredentialService`，服务定义只从 [model-cordis-contract](../../model-cordis-contract/docs/public-api.md) 取得。本包不转导 model 或契约包的任何名字。

## 定义索引

- 保管库句柄、新建与重开、管理操作、关闭与保存确认未知：[SPEC 保管库文件](../SPEC.md#保管库文件)至[关闭](../SPEC.md#关闭)。
- 插件的配置、文件缺失与损坏、撤除：[SPEC 插件](../SPEC.md#插件)。
- 注入发送：[SPEC 注入发送](../SPEC.md#注入发送)。
- 发送阶段插件：[SPEC 发送阶段插件](../SPEC.md#发送阶段插件)。
- 发送资源与本地装配：[SPEC 发送资源](../SPEC.md#发送资源)、[SPEC 本地 Model 装配](../SPEC.md#本地-model-装配)与[发送路径的所有权](../SPEC.md#发送路径的所有权)。
- `SendResources`、`SendCoordinator` 与发送边界：[model](../../model/docs/public-api.md)。传输配置、网络资源与家族贡献：[pi-ai-transport](../../pi-ai-transport/docs/public-api.md)。
- 引用、结果与端口的形状：[model-contract](../../model-contract/docs/public-api.md#凭据引用与解析端口)。
- 判定函数与状态形状：[model](../../model/docs/public-api.md#已实现的凭据入口)。

`createModelRuntimeLocalPlugin`、`createModelRequestPreparationPlugin` 与 `createModelSendStagePlugin` 造出插件类，因为它们的对象选项不是可序列化配置。发送阶段插件继承 `ModelSendBoundaryService`，静态注入 `modelCredential` 与 `modelCommands`，只有 `maxRetainedAttempts` 一项配置。宿主插件提供 `modelInstanceHost`，尚未提供 `modelRuntime`；准备插件继承 `ModelRequestPreparationService`，并把租约来源作为对象交给装配（不是服务键）。观察资格由装配经 `qualifyObservation` 给出：设计中的注入集合没有它的来源。本包不导出服务定义、键或契约类型，它们只从 model-cordis-contract 与 model-contract 取得。

本包没有实现 executeModel、createModelRuntime 或 createModelPreparationResources。`assembleLocalModel` 只组合发送路径与准备资源；租约的行为归 [model](../../model/SPEC.md)；调用的受理、驱动与收场由调用方经 model 的 `createModelRuntime` 完成，本包不证明完整托管调用已交付。
