# 公开接口导航

本文件导航本包的公开边界。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/model-host-local` | [index.ts](../src/index.ts) | `createLocalCustodian`、`openLocalCustodian`，类型 `LocalCustodian`、`Diagnostic`、`CreateOptions`、`CustodianOptions`、`LockOptions`、`OpenResult`、`UnavailableCause` | 独立程序或宿主；不启动 Cordis |
| `@omne-harness/model-host-local/cordis` | [cordis.ts](../src/cordis.ts)，`deliverInjected` 在 [deliver-injected.ts](../src/deliver-injected.ts) | `LocalCredentialPlugin`、`deliverInjected` | Cordis 装配者与受信发送边界 |

`./cordis` 不导出 `ModelCredentialService`，服务定义只从 [model-cordis-contract](../../model-cordis-contract/docs/public-api.md) 取得。本包不转导 model 或契约包的任何名字。

## 定义索引

- 保管库句柄、新建与重开、管理操作、关闭与保存确认未知：[SPEC 保管库文件](../SPEC.md#保管库文件)至[关闭](../SPEC.md#关闭)。
- 插件的配置、文件缺失与损坏、撤除：[SPEC 插件](../SPEC.md#插件)。
- 注入发送：[SPEC 注入发送](../SPEC.md#注入发送)。
- 引用、结果与端口的形状：[model-contract](../../model-contract/docs/public-api.md#凭据引用与解析端口)。
- 判定函数与状态形状：[model](../../model/docs/public-api.md#已实现的凭据入口)。

本包没有实现 executeModel 或 createModelRuntime，也不证明完整模型调用已交付。
