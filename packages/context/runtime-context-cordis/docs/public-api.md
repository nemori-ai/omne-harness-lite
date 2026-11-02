# runtime-context-cordis 的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，插件、配置与撤除的正文归 [Cordis 说明](cordis.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/runtime-context-cordis` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 没有调用者。根入口为空，不装配 Cordis 的调用方从 runtime-context 取机制工厂 |
| `@omne-harness/runtime-context-cordis/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者。插件树的行用包名与 `./cordis` 的导出名标识本插件（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)） |

根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。生产者、作用域持有者与读者不导入本成员的任何入口，它们依赖服务定义 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/docs/public-api.md)（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

## 定义索引

### 现有导出

根入口没有导出（[public-entry.spec.ts](../tests/public-entry.spec.ts)）。`./cordis` 的导出如下（[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)）：

| 定义 | 种类 | 内容 | 依据 |
| --- | --- | --- | --- |
| `RuntimeContextProvider` | 类 | `RuntimeContextService` 的具体子类，不写服务键。静态 `inject` 为 `runtimeContextTrust`，静态 `Config` 是配置的 Standard Schema | [SPEC 范围与依据](../SPEC.md#范围与依据)、[插件与服务](cordis.md#插件与服务) |
| `createRuntimeContextPlugin` | 函数 | 不带参数时返回 `RuntimeContextProvider`。`mechanism` 选项替换机制工厂，只供测试使用 | [SPEC 性质 10](../SPEC.md#结果与不变量) |
| `RuntimeContextPluginConfig` | 类型 | 七个上限与 `diagnostics`，全部可省略 | [配置](cordis.md#配置) |
| `RuntimeContextDiagnosticsLevel` | 类型 | `off`、`debug`、`info`、`warn` | [配置](cordis.md#配置) |
| `RuntimeContextMechanismFactory` | 类型 | 机制工厂的形状，即 `createRuntimeContext` 的类型 | [SPEC 性质 10](../SPEC.md#结果与不变量) |

本成员不导出服务键常量。键常量只由服务定义成员导出（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。根入口不导出任何东西（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。机制工厂只由 [runtime-context](../../runtime-context/docs/public-api.md) 导出，独立调用方从那里取。
