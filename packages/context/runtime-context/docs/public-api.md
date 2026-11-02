# Runtime Context 供给机制的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的本地行为归 [SPEC](../SPEC.md)，三面操作的输入、结果与失败归 [runtime-context-contract SPEC](../../runtime-context-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/runtime-context` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [runtime-context-cordis](../../runtime-context-cordis/README.md)，以及不装配 Cordis 的独立调用方。runtime-context-cordis 的根入口不导出工厂，独立调用方从这里取 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），见 [Cordis 说明](cordis.md)。

## 定义索引

### 现有导出

| 定义 | 种类 | 内容 | 依据 |
| --- | --- | --- | --- |
| `createRuntimeContext` | 函数 | 唯一的机制工厂。输入 `RuntimeContextOptions`，输出 `RuntimeContextMechanism`。非法上限抛 `RangeError` | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `RuntimeContextOptions` | 类型 | `trust`（必需）、`config`、`onChange`、`diagnose` | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `RuntimeContextMechanism` | 类型 | 契约三面八操作加 `close()`。`bind` 另接受可选的调用方声明 | [SPEC 本地行为](../SPEC.md#本地行为)、[SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |
| `BindCaller` | 类型 | `bind` 的第二参数：Cordis 调用方在 intercept 配置里声明的消费者类 | [SPEC 本地行为](../SPEC.md#本地行为) |
| `RuntimeContextConfig`、`ResolvedRuntimeContextConfig` | 类型 | 七个上限，前者全部可省略，后者全部给出 | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `RUNTIME_CONTEXT_DEFAULTS` | 常量 | 七个上限的初值。初值只是配置初值 | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `resolveRuntimeContextConfig` | 函数 | 补上初值并校验上限，非法值抛 `RangeError`。runtime-context-cordis 的配置 Schema 调用它 | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `RuntimeContextDiagnostic` | 类型 | 诊断事件的封闭集合，不带块值 | [SPEC 诊断](../SPEC.md#诊断) |

[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对根入口的运行时导出集合。

三面操作的签名在契约里写一次。本成员不另写。契约已导出 `RuntimeContextOperations` 等操作类型，见契约的[公开定义索引](../../runtime-context-contract/docs/public-api.md#定义索引)。

机制实例经变化出口 `onChange(scope, revision)` 把视图修订的前进告诉工厂调用方。runtime-context-cordis 用它派发唤醒事件（[runtime-context-cordis 的唤醒](../../runtime-context-cordis/docs/cordis.md#按作用域过滤的唤醒)）。

读取结果的种类沿契约的[读取结果](../../runtime-context-contract/SPEC.md#读取结果)表：成功、拒绝、缺项、未知；`changes` 另有游标作废。本成员不返回表外的结果。
