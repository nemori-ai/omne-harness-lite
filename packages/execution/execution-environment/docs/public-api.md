# 执行环境登记表的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的本地行为归 [SPEC](../SPEC.md)，八个操作的输入、结果与失败归 [execution-environment-contract SPEC](../../execution-environment-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/execution-environment` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [execution-environment-host-local](../../execution-environment-host-local/README.md)，以及不装配 Cordis 的独立调用方 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），见 [Cordis 说明](cordis.md)。

## 定义索引

| 名称 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| `createEnvironmentRegistry<P>` | 函数 | 输入 `RegistryDependencies`，输出 `EnvironmentRegistry<P>` | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| `EnvironmentRegistry<P>` | 接口，只有类型 | 扩展契约的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations`，另有 `close(): Promise<Retirement>` | [SPEC 结果与不变量](../SPEC.md#结果与不变量)、[SPEC 关闭](../SPEC.md#关闭) |
| `RegistryDependencies` | 类型 | `{ recovery: RecoveryAuthority }` | [SPEC 恢复](../SPEC.md#恢复) |
| `RetirementPending` | 错误类 | 字段 `subject` 与 `resources`。退役待处置时由撤除函数或 Service 卸载抛出 | [SPEC 登记与退役](../SPEC.md#登记与退役) |

[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对运行时导出只有 `createEnvironmentRegistry` 与 `RetirementPending`。

`EnvironmentRegistry<P>` 的方法：

| 方法 | 契约类型 | 本成员的本地行为 |
| --- | --- | --- |
| `resolvePlacement`、`acquire`、`inspectAcquisition`、`describe` | `ExecutionEnvironment<P>` | [SPEC 落点解析](../SPEC.md#落点解析)、[SPEC 获取](../SPEC.md#获取)、[SPEC 描述](../SPEC.md#描述) |
| `recoverOwned`、`releaseScope` | `ExecutionEnvironment<P>` | [SPEC 恢复](../SPEC.md#恢复) |
| `registerFacility`、`registerProvider` | `ProviderRegistrations` | [SPEC 登记与退役](../SPEC.md#登记与退役) |
| `close` | 本成员 | [SPEC 关闭](../SPEC.md#关闭) |

`acquire` 返回的租约是本成员的租约视图，不是提供者的租约原件。租约视图满足契约的 `EnvironmentLease`，行为见 [SPEC 租约视图与逐操作门](../SPEC.md#租约视图与逐操作门)。

拒绝原因沿契约的 `RejectReason`，各操作的取值与触发条件见[契约的拒绝原因](../../execution-environment-contract/SPEC.md#拒绝原因)。本成员在关闭后返回 `ownerStopped`。未铸造租户的 `inspectAcquisition` 返回 `invalidInput`。`inspectAcquisition` 只读本租户在这个键下的记录，没有时答复 `unrecorded`。同一租户同一个键换了请求方作用域、落点或要求时，`acquire` 返回 `invalidInput`；带作用域的绑定层与请求方作用域不同时，`resolvePlacement` 与 `acquire` 也返回 `invalidInput`。同一层两个提供者都满足时，`resolvePlacement` 返回 `ambiguousEnvironment`。

`createLeaseView`、`driveRecovery` 与 `StoredDescriptor` 是内部模块的导出，不从根入口导出，不属于公开接口。
