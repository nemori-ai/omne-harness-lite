# Cordis 集成

本文件说明本包的 Cordis 集成：`./cordis` 入口、依赖注入、提供的服务、启动次序、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，不在本文件复制。采用的内核是官方发布包 `@deepseek-ai/cordis` 4.0.4，本成员没有自有 fork。

## 集成入口

`@omne-harness/identity-sql/cordis` 只导出 `IdentitySqlPlugin`。它是 kernel-basis `definePlugin` 的函数插件，名字 `identity-sql`，`inject: [storageKey]`。配置是两个 `PT<秒>S` 文本，由 Standard Schema 调用 `parseIdentitySqlConfig` 校验。

| 事项       | 值                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 注入       | `storage`（[sql-contract](../../../storage/sql-contract/docs/cordis.md)）                                                                                        |
| 提供       | `identityOperations`、`tenantStanding`（[identity](../../identity/docs/cordis.md)）。两个键由同一插件体各 `new` 一个子类实例提供，不另写键，不自己 `ctx.provide` |
| 配置       | `{ maxLifetime, idlePeriod }`，初值 `IDENTITY_SQL_DEFAULT_CONFIG`                                                                                                |
| 事件       | 不声明，不监听                                                                                                                                                   |
| 运行时对象 | 时钟在插件体内用系统时钟构造（DP1-C16）。scrypt 模块与假材料在插件体内产生。都不进配置，也不经服务键                                                             |

插件体的次序固定：校验配置，打开 scrypt 并派生假材料，`registerCombination`，构造提供者并提供两个键，登记一个受管 effect。任一步失败时插件抛错，该行 `FAILED`，已打开的 scrypt 模块先关闭。失败的诊断是 `decoy-derive-failed:<code>` 或 `identity combination not registered: <kind>/<reason>`。

## 生命周期与清理

撤除只登记一个 effect。它的撤除函数先调用提供者的 `stop()`，再 `await` scrypt 模块的 `close()`。写在同一个 effect 里的理由：不同 effect 的撤除由 `Promise.all` 并发驱动，注册次序不约束完成次序。只有一个撤除函数能保证「先停准入、再关 scrypt」。

撤除后，两个键都取不到。持有旧引用的调用方得到 [SPEC IS-07](../SPEC.md#is-07) 的答复：注册 `not-loginable`，签发与识别 `basis-unavailable`，读口 `unavailable`。撤除不撤销已提交的事实，也不关闭存储。`registerCombination` 写下的登记是持久的协议元数据，不随 fiber 撤除。

`storage` 换代时插件体重跑（IC-8）：重开 scrypt、重派生假材料、`registerCombination` 幂等认回，产生新的提供者实例。实例内的最晚时钟读数随之重新开始，见 SPEC 已知限制 2。

本行不登记 `assemblyLifecycle` 句柄。有序关闭先停 `entry` 阶段，之后不再有签发与识别。资格读口在 `business` 阶段可能仍被调用，那时 `storage` 还没有关闭。

## IC 核对表

规则出自 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。「验证」列是本包里能失败的用例，不是设计符合的证明。

| IC         | 承载                                                                                                                                                     | 验证                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1、2、3    | 继承 `IdentityOperationsService` 与 `TenantStandingSourceService`，不另写键，不自己 `ctx.provide`。同一插件体逐个 `new` 两个子类                         | `tests/cordis-entry.spec.ts`：装载后两键是这两个子类的实例，撤除后两键都取不到                                                                 |
| 4          | 根入口 `src/index.ts` 不导入 Cordis 与 `./cordis`                                                                                                        | `tests/public-entry.spec.ts` 只经根入口导入，根入口的导出清单不含插件                                                                          |
| 5          | 消费者只从 `@omne-harness/identity/cordis` 取键。除应用行外没有成员依赖本包                                                                              | `lint:deps` 与依赖报告                                                                                                                         |
| 6          | 一个 isolate 内两个键各只有本插件一个提供者。本行装在受信存储子树                                                                                        | 本成员不验证。由装配入口的行注册表保证（DP-1）                                                                                                 |
| 7          | 成员名 `identity-sql` 用限定名表达后端，服务键沿定义拥有者                                                                                               | 包组织页登记核对                                                                                                                               |
| 8          | `inject: [storageKey]` 是数组字面量，元素是定义包导出的键常量。`storage` 换代时插件体重跑                                                                | `tests/public-entry.spec.ts` 断言 `inject` 等于 `['storage']`。换代重跑由 basis `plugin-body-reruns-on-provider-change` 覆盖，本包没有单独用例 |
| 9          | 没有可选依赖                                                                                                                                             | 源码中没有 `ctx.get`、`resolveOptional`                                                                                                        |
| 10、11、12 | 不声明事件，不监听事件                                                                                                                                   | 不适用                                                                                                                                         |
| 13         | `registerCombination` 是存储契约的幂等登记，不是 Cordis 贡献。插件体只登记一个受管 effect，撤除时按次序 `stop()` 后 `await close()`                      | `tests/cordis-entry.spec.ts`：撤除后旧引用按 IS-07 作答。`tests/stopped.spec.ts`：在途调用跑完                                                 |
| 14         | Standard Schema 校验两个时长。解析失败或不大于零时插件抛错，该行 `FAILED`。**偏离**：scrypt 七个参数不进配置，固定为 `SCRYPT_PROFILE`（SPEC 已知限制 3） | `tests/cordis-entry.spec.ts`：`PT0S` 使 fiber `FAILED`。`tests/public-entry.spec.ts`：多余字段与非时长文本被拒绝                               |
| 15、16     | 一条发行层 `identity` 行，配置只有两个可序列化时长。时钟与 scrypt 是运行时对象，在插件体内构造                                                           | 配置含非时长字段时校验失败。行 id 稳定性归装配页                                                                                               |
| 17         | 不按会话装载，没有会话作用域的登记                                                                                                                       | 不适用                                                                                                                                         |
| 18         | 系统作用域只用于 identity 自己的记录。租户是资格读口的输入，不从 `ctx` 推断。`storage` 不是访问控制                                                      | `tests/standing.spec.ts`（R4-5）                                                                                                               |
| 19         | 靠同进程成立的保证：实例内最晚时钟读数、scrypt 名额与队列、假材料、停止标志。拆成多进程时前三项按进程各自成立，结论仍由持久行决定                        | 不适用于 M2 单进程                                                                                                                             |

## 验证资源与限制

`tests/cordis-entry.spec.ts` 在真实 4.0.4 `Context` 上安装一个经真实 sqlite-provider 转发的 `StorageService` 子类，再装入本插件。快层用例核对非法配置使 fiber `FAILED`。慢层用例用 `SCRYPT_PROFILE` 与系统时钟走完注册、签发、识别与读口，然后撤除并核对旧引用的答复。

这些用例不覆盖受信子树的装配、行注册表、材料目录的聚合与应用的有序关闭。那些归 `apps/harness-server`。
