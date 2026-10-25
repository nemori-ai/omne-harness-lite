# execution-environment-host-local 的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的行为归 [SPEC](../SPEC.md)，Cordis 装配的正文归 [Cordis 说明](cordis.md)。设施操作与环境操作的输入、结果与失败归 [execution-environment-contract SPEC](../../execution-environment-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/execution-environment-host-local` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 不装配 Cordis 的独立调用方与测试；执行适配用 `hostObjectToken` 点名对象 |
| `@omne-harness/execution-environment-host-local/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者 |

根入口与 Cordis 无关（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对根入口可达的模块不导入 Cordis 或 `./cordis`。调用方不导入 `./cordis` 来调用环境操作，而是经服务定义取服务（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

## 定义索引

### 根入口

| 名称 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| `createHostFiles` | 函数 | 无输入，输出契约的 `FileSystemFacility`。读取、查看、写入、关闭四项是真实行为，其余八项返回 `unsupported` | [SPEC 宿主文件使用](../SPEC.md#宿主文件使用)、[SPEC 其余现行行为](../SPEC.md#宿主文件设施的其余现行行为) |
| `hostObjectToken` | 异步函数 | 输入路径，输出该路径当前对象的设备号与 inode。不跟随末段符号链接。不授予访问权 | [SPEC 宿主文件使用](../SPEC.md#宿主文件使用) |
| `createHostFilesDomain` | 函数 | 输入可选的 `HostFilesDomainOptions`，输出 `HostFilesDomain`。配额域为空串时抛出 `RangeError` | [SPEC 宿主文件责任域](../SPEC.md#宿主文件责任域) |
| `HostFilesDomain` | 类型 | 责任域：配额域、进程实例身份、`durability: 'process'`，以及维护入口 `maintain()`（重试仍在释放中的获取的失败关闭，答还剩几项） | 同上 |
| `HostFilesDomainOptions` | 类型 | `quotaDomain`：受信的配额域，缺省 `host-files`；`quota`：按租户的配额策略，每次接纳时读取 | 同上 |
| `HostFilesQuotaPolicy` | 类型 | 配额策略：输入租户，输出按租户上界与全局上界（可空） | 同上 |
| `createHostFilesProvider` | 函数 | 输入 `HostFilesProviderOptions`，输出契约的 `EnvironmentProvider`。缺少本包创建的责任域时抛出 `TypeError`；`drainBoundMs` 不是有限的非负数时抛出 `RangeError` | [SPEC 宿主提供者的事实](../SPEC.md#宿主提供者的事实) |
| `HostFilesProviderOptions` | 类型 | `domain`：这一代加入的责任域，必填；`drainBoundMs`：释放、结清与退役等在途文件操作的上界（毫秒），缺省取初值；`diagnose`：结果为待处置时收到一条诊断 | 同上 |
| `HostFilesDiagnostic` | 类型 | 待处置的诊断：`kind` 为 `drainBoundExceeded`（仍有在途操作）或 `closePending`（只剩关闭失败的描述符）、提供者名与代、在途操作数、打开的描述符数、上界，释放或结清时另带获取键 | 同上 |

[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对根入口的运行导出只有这四个函数；其余名字只在类型层面导出。`host-files.ts` 另有一个标为 `@internal` 的测试辅助函数与共用文件引擎 `createHostFilesEngine`，`host-domain.ts` 另有供提供者使用的责任域内部面；根入口不导出它们，它们不属于公开接口。

### `./cordis`

| 名称 | 种类 | 用途 | 依据 |
| --- | --- | --- | --- |
| `ExecutionEnvironmentRegistry<P>` | `ExecutionEnvironmentService<P>` 的具体子类，带静态 `Config` | 直接当插件装载，提供 `executionEnvironment`；每次使用时从自己装载时的上下文现取 `executionEnvironmentAuthority`、`executionScopeBinding` 与 `executionRecoveryAuthority` 服务，取不到答不可用 | [SPEC Service 实现](../SPEC.md#service-实现)、[插件与配置](cordis.md#插件与配置) |
| `filesFacilityPlugin` | 函数插件 | 登记 `files` 设施声明 | 同上 |
| `createHostFilesPlugin` | 函数 | 输入 `HostFilesDomain`，输出登记一代宿主文件提供者的函数插件；配置 `HostFilesConfig` 可带 `drainBoundMs`；待处置的诊断写到 `ctx.logger` | 同上 |
| `HostFilesConfig` | 类型 | 宿主文件插件的配置：可选的 `drainBoundMs` | 同上 |

`ExecutionEnvironmentRegistry` 的九个方法是抽象类的方法，签名只在契约里写一次（[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)），见 [execution-environment-cordis-contract 的公开接口页](../../execution-environment-cordis-contract/docs/public-api.md)。
