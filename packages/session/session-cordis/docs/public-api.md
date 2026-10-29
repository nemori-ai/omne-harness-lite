# session-cordis 的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，插件、配置与撤除的正文归 [Cordis 说明](cordis.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/session-cordis` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 没有调用者。根入口为空，不装配 Cordis 的宿主从 session 取工厂 |
| `@omne-harness/session-cordis/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者。插件树的行用包名与 `./cordis` 的导出名标识本插件（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)） |

根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。四个面的调用方、端口提供者与提交通知的监听者不导入本成员的任何入口。它们依赖服务定义 [session-cordis-contract](../../session-cordis-contract/docs/public-api.md) 与契约 [session-contract](../../session-contract/docs/public-api.md)（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

## 定义索引

### 现有导出

两个入口现在都没有导出。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言两个入口的导出为空。

### 随实现进入的导出

下表的内容由 SPEC 固定。名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| `SessionService` 的具体子类 | `./cordis` | 类，同时是插件。静态 `inject` 只写访问检查、事务端口与内部主体的键，不写服务键 `session` | [性质 1、2](../SPEC.md#服务与依赖)、[插件与服务](cordis.md#插件与服务) |
| 配置 Schema | `./cordis` | 子类的静态 `Config`，Standard Schema。字段 `policy`（`SchedulingPolicy` 的逐字段覆盖）、`disposeWaitMs` 与 `admission`（省略或 `'none'`） | [性质 3](../SPEC.md#服务与依赖)、[配置](cordis.md#配置) |

本成员不导出服务键常量、端口键常量或事件增补，它们只由服务定义成员导出（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。本成员也不转导出工厂、`SchedulingPolicy` 或 `defaultSchedulingPolicy`，它们只由 [session](../../session/docs/public-api.md) 导出，独立宿主从那里取。根入口不导出任何东西（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。

### 经服务键可见的行为

本成员不增加公开操作。调用方经键 `session` 取得的四个面，形状归定义成员，操作归 session-contract。本成员只在这些操作上加两种结果：

| 情形 | 结果 | 依据 |
| --- | --- | --- |
| 调用方没有 intercept 配置，或调用方类不在四类之中 | 该面的每个操作返回 `denied`，`action` 为操作名 | [性质 6](../SPEC.md#唤醒调用方与扫描者) |
| 本插件撤除开始之后 | 每个操作返回 `unavailable`，`owner` 为 `session` | [性质 9](../SPEC.md#撤除与换代) |

其余结局都来自 session 的实例，经本成员原样返回（[行为与失败](../../session/docs/public-api.md#行为与失败)）。
