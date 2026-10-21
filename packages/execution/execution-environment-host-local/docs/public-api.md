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
| `createHostFilesProvider` | 函数 | 无输入，输出契约的 `EnvironmentProvider` | [SPEC 宿主提供者的事实](../SPEC.md#宿主提供者的事实) |

[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对根入口只导出这三个函数。`host-files.ts` 另有一个标为 `@internal` 的测试辅助函数，根入口不导出它，它不属于公开接口。

### `./cordis`

| 名称 | 种类 | 用途 | 依据 |
| --- | --- | --- | --- |
| `ExecutionEnvironmentRegistry<P>` | `ExecutionEnvironmentService<P>` 的具体子类，带静态 `Config` | 直接当插件装载，提供 `executionEnvironment`；每次恢复操作现取 `executionRecoveryAuthority` 服务，取不到答不可用 | [SPEC Service 实现](../SPEC.md#service-实现)、[插件与配置](cordis.md#插件与配置) |
| `filesFacilityPlugin` | 函数插件 | 登记 `files` 设施声明 | 同上 |
| `hostFilesPlugin` | 函数插件 | 登记宿主文件提供者 | 同上 |

`ExecutionEnvironmentRegistry` 的八个方法是抽象类的方法，签名只在契约里写一次（[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)），见 [execution-environment-cordis-contract 的公开接口页](../../execution-environment-cordis-contract/docs/public-api.md)。
