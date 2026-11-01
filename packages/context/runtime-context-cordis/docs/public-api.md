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

根入口没有导出（[public-entry.spec.ts](../tests/public-entry.spec.ts)）。`./cordis` 导出 `createRuntimeContextPlugin(construct)`：插件 `inject` 键 `runtimeContextTrust`，键缺席时停在 PENDING，取出 `authority` 与 `bindings` 交给 `construct`（[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)、[trust-inject.spec.ts](../tests/trust-inject.spec.ts)）。

### 随实现进入的导出

下表的内容由 SPEC 固定。名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 入口 | 种类 | 依据 |
| --- | --- | --- | --- |
| `RuntimeContextService` 的具体子类 | `./cordis` | 类，不写服务键 | [SPEC 范围与依据](../SPEC.md#范围与依据)、[插件与服务](cordis.md#插件与服务) |
| 配置 Schema | `./cordis` | 静态 `Config`，Standard Schema。观察链保留上限、来源调用与回调的超时、诊断级别 | [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)、[配置](cordis.md#配置) |

本成员不导出服务键常量。键常量只由服务定义成员导出（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。根入口不导出任何东西（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。机制工厂只由 [runtime-context](../../runtime-context/docs/public-api.md) 导出，独立调用方从那里取。
