# Request Context Cordis 定义的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，Cordis 定义的正文归 [Cordis 说明](cordis.md)。登记面与纯操作的输入、输出与失败归 [request-context-contract SPEC](../../request-context-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context-cordis-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 需要契约词汇类型、又已经依赖本成员的包。只用契约类型或纯操作的包直接依赖 request-context-contract |
| `@omne-harness/request-context-cordis-contract/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 贡献者插件、读取贡献集合的调用方、监听变化事件的一方，以及提供者 request-context-cordis |

根入口与 Cordis 无关，只重导出类型（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。`./cordis` 只有服务定义，不导入任何实现成员（[性质 10](../SPEC.md#结果与不变量)）。只需要 `Context` 与 `Events` 增补的一方用 `import type {} from '@omne-harness/request-context-cordis-contract/cordis'`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。

## 定义索引

### 现有导出

两个入口现在都没有导出。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言两个入口的导出为空。

### 随实现进入的导出

下表的名称由 SPEC 点名。签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 名称 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| `RequestContextService` | `./cordis` | 抽象类，`static readonly provide = 'requestContext'` | [性质 1、2](../SPEC.md#结果与不变量)、[服务定义](cordis.md#服务定义) |
| 服务键常量 | `./cordis` | 常量，取自 `RequestContextService.provide`。常量名随实现确定 | 性质 1 |
| intercept 配置类型 | `./cordis` | 类型 `{ scope: ScopeRef }`。类型名随实现确定 | 性质 7、[intercept 配置与作用域](cordis.md#intercept-配置与作用域) |
| 策略选择的配置形状 | `./cordis` | 类型，选择压缩策略与表示策略的实现。类型名随实现确定 | 性质 8、[策略选择](cordis.md#策略选择) |
| `Events` 增补 | `./cordis` | 事件 `request-context-cordis-contract/changed`，`@mode emit` | 性质 6、[事件](cordis.md#事件) |
| `Context` 增补 | `./cordis` | `requestContext` 属性的类型为 `RequestContextService` | 性质 1 |
| 契约词汇类型的重导出 | 根入口 | 只有类型。具体清单随实现确定，以契约的[公开接口页](../../request-context-contract/docs/public-api.md)为准 | [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) |

`RequestContextService` 的方法是契约登记面操作类型的方法：`contributeSection`、`contributeVariable`、`contributions(scope)`。它们的签名只在契约里写一次（[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。服务上没有 `assemble`、`planCompaction` 等纯操作，它们从契约根入口导出（性质 2）。

明确缺项：契约的[公开接口页](../../request-context-contract/docs/public-api.md)现在没有列出登记面操作类型与 `ScopeRef`。这两项进入契约之后，本成员的抽象类与 intercept 配置类型才能实现。
