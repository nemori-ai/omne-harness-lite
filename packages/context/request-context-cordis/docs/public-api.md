# request-context-cordis 的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，插件、配置与撤除的正文归 [Cordis 说明](cordis.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context-cordis` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 不装配 Cordis、又要与插件相同实现的调用方 |
| `@omne-harness/request-context-cordis/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者。插件树的行用包名与 `./cordis` 的导出名标识本插件（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)） |

根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。贡献者与组装请求的调用方不导入本成员的任何入口，它们依赖服务定义 [request-context-cordis-contract](../../request-context-cordis-contract/docs/public-api.md)（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

## 定义索引

### 现有导出

两个入口现在都没有导出。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言两个入口的导出为空。

### 随实现进入的导出

下表的内容由 SPEC 固定。名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| `RequestContextService` 的具体子类 | `./cordis` | 类，不写服务键 | [SPEC 范围与依据](../SPEC.md#范围与依据)、[插件与服务](cordis.md#插件与服务) |
| 插件 | `./cordis` | 装配用的插件导出 | 同上 |
| 配置 Schema | `./cordis` | 静态 `Config`，Standard Schema。策略选择与参数、修剪阈值、缓存容量 | [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)、[配置与策略选择](cordis.md#配置与策略选择) |
| 工厂 | 根入口 | 函数，输入契约端口、策略实现与配置，输出与插件相同的实现 | [SPEC 范围与依据](../SPEC.md#范围与依据) |

本成员不导出服务键常量。键常量只由服务定义成员导出（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。本成员不增补新事件。根入口的工厂与 request-context 的工厂怎样分工还没有确定，见[内部架构](architecture.md#模块与依赖)。
