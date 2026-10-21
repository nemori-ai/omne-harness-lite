# 执行环境 Cordis 定义的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，Cordis 定义的正文归 [Cordis 说明](cordis.md)。八个方法的输入、输出与失败归 [execution-environment-contract SPEC](../../execution-environment-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/execution-environment-cordis-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 没有调用者。根入口是空导出 |
| `@omne-harness/execution-environment-cordis-contract/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 集成方、维护者、提供者与设施拥有者的插件，只需要类型增补的一方，以及 Service 实现 execution-environment-host-local |

根入口与 Cordis 无关（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。需要契约类型的一方直接依赖 execution-environment-contract。`./cordis` 只有服务定义，不导入任何实现成员（[性质 8](../SPEC.md#结果与不变量)）。只需要 `Context` 增补的一方用 `import type {} from '@omne-harness/execution-environment-cordis-contract/cordis'`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。

## 定义索引

### 根入口

根入口没有导出。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言导出为空。

### `./cordis`

| 名称 | 种类 | 依据 |
| --- | --- | --- |
| `ExecutionEnvironmentService<P>` | 抽象类，`static readonly provide = 'executionEnvironment'`，八个抽象方法 | [性质 1、2](../SPEC.md#结果与不变量)、[服务定义](cordis.md#服务定义) |
| `executionEnvironmentKey` | 常量，取自 `ExecutionEnvironmentService.provide` | 性质 1 |
| `ExecutionEnvironmentIntercept` | 类型 `{ caller: 'integrator' \| 'maintainer' \| 'provider' }` | 性质 4、[intercept 配置与调用方类](cordis.md#intercept-配置与调用方类) |
| `ExecutionRecoveryAuthorityService` | 抽象类，`static readonly provide = 'executionRecoveryAuthority'`，抽象方法 `authorizeRecovery`，`implements` 契约的 `RecoveryAuthority` | [性质 9](../SPEC.md#结果与不变量)、[服务定义](cordis.md#服务定义) |
| `executionRecoveryAuthorityKey` | 常量，取自 `ExecutionRecoveryAuthorityService.provide` | 性质 9 |
| `Context` 增补 | `executionEnvironment` 属性的类型为 `ExecutionEnvironmentService<unknown>`；`executionRecoveryAuthority` 属性的类型为 `ExecutionRecoveryAuthorityService` | 性质 3、9 |

运行时导出只有两个抽象类与两个键常量。[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 核对这个集合。`ExecutionEnvironmentIntercept` 与 `Context` 增补只是类型。

`ExecutionEnvironmentService` 的八个方法是契约两个操作类型的方法：

| 方法 | 契约类型 | 失败与结果的位置 |
| --- | --- | --- |
| `resolvePlacement`、`acquire`、`inspectAcquisition`、`describe` | `ExecutionEnvironment<P>` | [契约的获取与租约](../../execution-environment-contract/SPEC.md#获取与租约) |
| `recoverOwned`、`releaseScope` | `ExecutionEnvironment<P>` | [契约的恢复](../../execution-environment-contract/SPEC.md#恢复) |
| `registerFacility`、`registerProvider` | `ProviderRegistrations` | [契约的设施协议](../../execution-environment-contract/SPEC.md#设施协议)、[INV-EE18](../../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |

这些签名只在契约里写一次（[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。契约的导出索引见[契约的公开接口页](../../execution-environment-contract/docs/public-api.md)。
