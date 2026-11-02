# request-context-cordis 的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，插件、配置与撤除的正文归 [Cordis 说明](cordis.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context-cordis` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 没有调用者。根入口为空，不装配 Cordis 的调用方从 request-context 取机制工厂 |
| `@omne-harness/request-context-cordis/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者。插件树的行用包名与 `./cordis` 的导出名标识本插件（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)） |

根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。贡献者与组装请求的调用方不导入本成员的任何入口，它们依赖服务定义 [request-context-cordis-contract](../../request-context-cordis-contract/docs/public-api.md)（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

## 定义索引

### 现有导出

| 定义 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| `RequestContextProvider` | `./cordis` | 类，`RequestContextService` 的具体子类，也是装配用的插件，不写服务键 | [SPEC 范围与依据](../SPEC.md#范围与依据)、[插件与服务](cordis.md#插件与服务) |
| `RequestContextProviderOptions` | `./cordis` | 类型，账目选项与策略选项（`policies` 与 `selection` 互斥），由装配入口在受信代码里构造，不进插件树 JSON | 同上 |
| 静态 `Config`（`RequestContextProvider.Config`） | `./cordis` | Standard Schema，校验插件选项并在校验时试建两个策略；不合即加载失败，不回退默认 | [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)、[配置与策略选择](cordis.md#配置与策略选择) |

根入口 `src/index.ts` 只有模板标记，没有导出；`src/config.ts` 是 `./cordis` 的内部文件。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出，[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言 `./cordis` 的运行时导出只有 `RequestContextProvider`。

### 随实现进入的导出

下表的内容由 SPEC 固定，名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| 修剪阈值与缓存容量的配置字段 | `./cordis` | 并入静态 `Config`。契约的选择形状先要有这两个字段 | [配置与策略选择](cordis.md#配置与策略选择) |

本成员不导出服务键常量。键常量只由服务定义成员导出（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。本成员不增补新事件。根入口不导出任何东西（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。机制工厂只由 [request-context](../../request-context/docs/public-api.md) 导出，独立调用方从那里取。
