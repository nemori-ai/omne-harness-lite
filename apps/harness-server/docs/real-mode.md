# 真实模式（`serve`）：行声明、入口对象与装配给

本页是 `apps/harness-server` 真实模式的正文。它依据 L-APP 波 1 的 DP-1 与 DP-5 决定（#978 评论 6561644061，候选第 2 轮 DP1-C1～C19、DP5-C1～C7）。两种模式共同的行为（插件树、可见性、就绪、输出记录、退出码、有序关闭）归 [SPEC.md](../SPEC.md)，本页不重复。公开类型以 `src/types.ts` 与 `src/row.ts` 为准。

## 两种模式

| 项        | `s0`                            | `serve`                                                                                           |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| 名字      | `s0.<键>`                       | 不带前缀。真实行用正式键，`s0-double` 行用装配页的名字。唯一带前缀的名字是 `s0.assemblyLifecycle` |
| allowlist | 只含 `stubPlugin`               | `stubPlugin` 加 `./cordis` 里每个经 `defineRow` 声明的导出                                        |
| 清单      | `src/s0/stubs.ts` 的表          | `stubPlugin` 行用同一张表去掉前缀，真实导出用自带声明                                             |
| 受信表    | `src/s0/aa-rows.json`，加前缀   | 同一份，不加前缀                                                                                  |
| 入口对象  | 入口自己的替身                  | 注册表 `src/entry/index.ts`，加占位规则                                                           |
| 启动之后  | 自动计划停止                    | 等停止请求                                                                                        |
| 配置入口  | `src/profile.ts` 的 `s0Profile` | `src/profile.ts` 的 `serveProfile()`                                                              |

`s0` 的 allowlist 不含真实导出。`s0` 发行层写真实导出时，结果是 `unknown-plugin`，退出 2。

## 三种实现

| `implementation`  | 含义                                | 来源                                                              |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `real`            | 生产实现，或应用成员自己的适配插件  | `src/rows/<行 id>/` 里经 `defineRow` 声明的行                     |
| `contract-double` | 契约成员冻结交付的 `./testing` 替身 | 同上，`implementation: 'contract-double'`。只包装已冻结的替身导出 |
| `s0-double`       | S0 标记替身，没有业务行为           | `stubPlugin`，清单来自 `src/s0/stubs.ts`                          |

`tree` 记录按行写出 `implementation`，`startup-result.implementations` 写出三种各自的行数。

## 行声明：`defineRow`

真实行与契约替身行是一个模块 `src/rows/<行 id>/index.ts`，导出 `defineRow(...)` 的返回值：

```ts
import { defineRow } from '../../row.ts'
import { storageKey, storageHostKey } from '@omne-harness/sql-contract/cordis'

export const storageRow = defineRow({
  row: 'storage',
  implementation: 'real',
  manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
  lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
  plugin: SqliteStoragePlugin,
})
```

规则：

- `row` 是装配页的行 id。真实导出只能装在它声明的行 id 上，装在别的行 id 上装载前退出 2（DP1-C9）。
- `manifest` 里的名字只取定义包导出的键常量，不手写键文本。名字不写 `s0.assemblyLifecycle`，带阶段时由 `defineRow` 加进 `inject`。带 `s0.` 前缀的名字让 `defineRow` 抛出。
- 清单必须与 `src/s0/stubs.ts` 的同一行相同。`tests/real-manifests-sync.spec.ts` 逐行比较 `./cordis` 的每个真实导出。等待装配页补丁的差额写在该测试的 `KNOWN_GAPS`，每条带 AAP 编号。
- `lifecycle` 有三种：`none`（给 `plugin`）、`body`（给 `body`，可带 `Config`）、`entry-object`（给 `plugin` 与 `via`）。成员插件不能直接做带阶段的行：类型不能表达这种写法，见 `tests/serve-types.spec-d.ts`。
- 被包装插件的字面 `inject` 必须包含在声明的 `injects` 里，否则 `defineRow` 抛出，模块装入即失败（IC-8 的补偿）。
- 包装插件在同一个行 fiber 里转交被包装插件的 `Config` 与 `apply`，不建子 fiber。被包装插件可以是对象、函数或类（含 `Service` 子类），处理与 Cordis 4.0.4 的 `Fiber.execute` 相同。
- 装载器用 `rowDeclarationOf(plugin)` 读回声明。不是 `defineRow` 返回的对象读到 `undefined`，在 `serve` 模式里不进 allowlist。

## 关闭承载

带关闭阶段的行只经 `defineRow` 进入。两种承载（DP1-C15）：

1. **行体承载（`body`）。** 行的代码是应用自己的行体 `(ctx, config) => Promise<RowHandle>`。包装插件运行行体，拿到 `start`、`stop`、`assemblyReportSettled`，再以声明的阶段与行 id 调用 `s0.assemblyLifecycle` 的 `register`。登记发生在包装插件的 `apply` 里，所以落在行 fiber 上。用于 `session-storage`（`composition`）与 `server-entry`（`entry`）。
2. **入口对象承载（`entry-object`）。** 行的插件是成员插件，它把关闭控制交给一个入口对象。入口对象是 `Service` 子类，在被调用的方法里经 `this.ctx` 取得 `s0.assemblyLifecycle` 并登记。经调用方取到的 `Service`，方法里的 `this.ctx` 是调用方的上下文（Cordis 4.0.4，`.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md`），所以登记落在该行的 fiber 上。用于 `storage`：`storageHost` 入口对象在 `attachControl(control)` 里登记 `storage` 阶段的句柄。方法用方法语法，不用箭头函数属性，否则拿不到调用方的 `this`。类里不用 `#` 私有字段，经调用方代理调用时 `this` 不是实例本身。

共同规则：

- 入口对象承载的行写 `via`。该入口对象模块必须声明 `registersFor` 含这个行 id，否则装载前退出 2。
- 句柄登记被拒（`phase-mismatch`、`duplicate`、`generation-change`）时 `register` 抛出，该行 FAILED。
- 应该登记而没有登记的行，关闭时记 `not-registered`，整体 `incomplete`，退出 5。
- `storage` 的适配器先保存每一个交来的控制口，再登记。句柄的 `stop(D)` 对每个保存的控制口调用 `close({ initiator: 'assembly' })`，全部 `closed` 才答 `settled`。`assemblyReportSettled()` 对每个控制口调用同名方法，协调者只在报告确定后调用它。

夹具版本在 `tests/fixtures/serve/entry/storage-host.ts` 与 `tests/fixtures/serve/rows/synthetic.ts`。

## 入口对象注册表

入口对象逐个放 `src/entry/<对象>.ts`，由 `src/entry/index.ts` 汇总成 `entryObjects`。该清单由线负责人单写（L1-06）。模块形状是 `src/types.ts` 的 `EntryObjectModule`：

```ts
export const storageHost: EntryObjectModule = {
  name: storageHostKey, // 定义包的键常量
  implementation: 'real',
  registersFor: ['storage'], // 只在入口对象承载时写
  install(scope, env) {
    new StorageHostAdapter(scope, env) // 构造定义的子类
  },
}
```

规则（DP1-C11）：

- 同一个名字只能有一个模块。重复时装载前退出 2。
- 名字取定义包的键常量。受信与否由受信表决定，模块不自报。受信名的 `install` 收到该名的隔离上下文，其余收到根。
- `install` 只构造服务定义的子类，不用 `scope.provide(名, 值)`。没有服务定义的名字不能有 `real` 入口对象，需要时停下交回。
- `install` 抛出时，入口不装载任何行，stderr 写 `serve: entry-object <名>: install failed`，错误消息不进 stdout，退出 3。
- 入口对象按注册表次序安装，早于第一行装载，晚于装载前检查。
- 入口对象的值不进 `tree`、`entry-object`、`row-state`、stdout 与 stderr。

`install` 收到的 `EntryEnv`：

| 字段                | 含义                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `stateRoot`         | `--state-root`                                                                                |
| `readTrusted(name)` | 入口自己按名读取受信名的上下文                                                                |
| `once(key, create)` | 一次运行内共享。同一符号第二次以不同的 `create` 调用时抛出，`install` 失败，退出 3（DP1-C17） |

`EntryEnv` 不进插件，也不交给任何行。主体权威的符号与工厂只在 `src/entry/principals.ts`（APP-5）。

## 占位规则

一个名字满足下面全部条件时，入口提供一个 `s0-double` 占位对象，`entry-object` 记录标 `s0-double`：

1. 至少一个启用的 `s0-double` 行 inject 它。
2. `stubs.ts` 的表与 `./cordis` 的全部声明里没有行提供它。
3. 注册表没有它。
4. 没有任何启用的 `real` 或 `contract-double` 行 inject 它。

第 2 条按整张表判断，不按启用行。所以运维者停用提供行后，依赖它的替身行停在 PENDING，`missing` 写出这个名字，与 S0 相同。真实消费者永远不得到占位：缺入口对象或缺提供行时它停在 PENDING，`missing` 写出名字。

## 装载前检查与退出码

`serve` 新增的装载前检查（`row-binding`、`double-dependency`、`via-unregistered`、`duplicate-entry-object`、未声明导出的 `unknown-plugin`）与退出码表归 [SPEC.md](../SPEC.md)「装载与可见性」「进程输出与退出码」。全部在零个插件体运行、零个入口对象安装之前决定。

## 新增一行的成本

一个行闭包只写：

- `src/rows/<行 id>/**`：`defineRow` 声明与行内文件。
- `src/entry/<对象>.ts`：只在本行负责的入口对象。
- 本行的测试与行规格 `docs/rows/<行 id>.md`。

然后交回下面的登记条目，由线负责人合入时单写：

| 单写点                           | 一条的内容                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `src/cordis.ts`                  | `export { <名> } from './rows/<行 id>/index.ts'`                                |
| `config/serve.distribution.json` | 该行的 `plugin` 从 `stubPlugin` 换成导出名，配置按行规格。按 DP1-C18 的次序合入 |
| `documentation.json`             | 行规格一条登记                                                                  |
| `src/entry/index.ts`             | 只在新增入口对象时：一条导入与一项清单元素                                      |
| `package.json`                   | 只在新增成员依赖时：一条 `workspace:*` 依赖                                     |

行闭包不改 `run.ts`、`loader.ts`、`bin.ts`、`profile.ts`、`row.ts`、`stubs.ts`、别的行目录与别的入口对象文件。样板是夹具 `tests/fixtures/serve/rows/identity/`，用例 `tests/serve.spec.ts` 的 R1-5。

## 测试级装载入口

行闭包在自己的树里以 `serve` 模式只装本行与它依赖的替身，不改单写点。入口是 `src/run.ts` 的 `runServe`，它有四个测试输入：

| 测试输入       | 替代什么                                |
| -------------- | --------------------------------------- |
| `plugins`      | `./cordis` 的导出表：allowlist 与行声明 |
| `entryObjects` | `src/entry/index.ts` 的清单             |
| `manifests`    | `stubs.ts` 的表（正式名）               |
| `visibility`   | 受信表                                  |

夹具 `tests/fixtures/serve/harness.ts` 的 `serveOnce` 包好了临时状态根、停止信号与记录收集：

```ts
import { serveOnce } from './fixtures/serve/harness.ts'
import { stubPlugin } from '../src/cordis.ts'
import { storageRow } from '../src/rows/storage/index.ts'
import { storageHost } from '../src/entry/storage-host.ts'

const run = await serveOnce({
  distribution: { rows: [{ id: 'storage', plugin: 'storageRow', config: { ... } }] },
  plugins: { stubPlugin, storageRow },
  entryObjects: [storageHost],
})
expect(run.result.exitCode).toBe(0)
expect(run.state('storage')).toMatchObject({ state: 'ACTIVE' })
expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
```

`serveOnce` 看到 `startup-result` 就请求停止。要在启动与停止之间做事，传 `stopAfterStartup: false` 与自己的 `stop: AbortSignal`。要看到根、fiber 与在册句柄，直接用 `startTree` 与 `LifecycleRegistry`，写法见 `tests/serve-lifecycle.spec.ts`。

真实行依赖的替身：契约替身经 `defineRow` 以 `contract-double` 声明。`stubPlugin` 行不能给真实行当提供者（`double-dependency`，退出 2）。

## 真实模式的测试

| 文件                                | 层   | 覆盖                                                                                       |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| `tests/row.spec.ts`                 | fast | `defineRow` 的形状、IC-8 与前缀检查、三种插件形状在同一 fiber、行体承载的登记              |
| `tests/serve-types.spec-d.ts`       | 类型 | 声明类型的负例：成员插件不能直接做带阶段的行                                               |
| `tests/serve.spec.ts`               | fast | 发行替身树、名字前缀、占位规则、夹具行走通、PENDING 诊断、四条装载前拒绝、`once`、四个阶段 |
| `tests/serve-lifecycle.spec.ts`     | fast | `serve` 版可见性、入口对象承载的登记落在行 fiber、`not-registered`                         |
| `tests/real-manifests-sync.spec.ts` | fast | 真实清单与 `stubs.ts` 逐行比较、具名差额清单、无 `s0.` 名字、AAP-7                         |
| `tests/serve-process.spec.ts`       | slow | `dist/bin.js serve`：替身树、`--stop-on-stdin-close`、用法错误、`s0` 的解析路径不变        |

夹具在 `tests/fixtures/serve/`：定义包 `definitions.ts`，行目录 `rows/`，入口对象 `entry/`，装载入口 `harness.ts`。

## IC 映射

| 条款                   | 结论           | 怎样满足或偏离                                                                                      | 可失败的验证                                                     |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| IC-1、IC-2             | 符合           | 真实入口对象构造定义子类，真实行引用定义包键常量（DP1-C4、DP1-C11）                                 | `serve-lifecycle.spec.ts` 对夹具入口对象断言 `instanceof` 定义类 |
| IC-2                   | 偏离，已登记   | `s0-double` 占位对象以 `provide` 普通值提供，`StubService` 用动态键                                 | SPEC「偏离登记」                                                 |
| IC-3                   | 偏离，已登记   | `s0.assemblyLifecycle` 私有键                                                                       | SPEC「偏离登记」                                                 |
| IC-5                   | 符合           | 应用成员是装配拥有者，可以导入它选择的提供者。成员包不导入应用，所以成员插件不能自登记              | `lint:deps`                                                      |
| IC-6                   | 符合           | 受信名经 `trust.ts` 的标签隔离，同标签第二个提供者 FAILED                                           | `serve-lifecycle.spec.ts` 可见性三条                             |
| IC-8                   | 偏离，已登记   | 包装插件的 `inject` 由声明计算。补偿：声明必须包含被包装插件的字面 `inject`，`defineRow` 不符即抛出 | `row.spec.ts` IC-8 两条                                          |
| IC-9                   | 符合           | 按调用现取的端口不进 `inject`，用 `ctx.get`                                                         | 各行成员测试                                                     |
| IC-13                  | 符合           | 两种关闭承载都在行 fiber 上登记                                                                     | `row.spec.ts` 行体承载、`serve-lifecycle.spec.ts` 入口对象承载   |
| IC-14                  | 符合           | 包装插件转交被包装插件的 `Config`，配置错误时行 FAILED                                              | `row.spec.ts` IC-14                                              |
| IC-15、IC-16           | 符合           | 两层树。行 id 绑定（DP1-C9）。运行时对象不进树                                                      | `serve.spec.ts` DP1-C9                                           |
| IC-18                  | 符合           | 两张受信名单按显式主体与租户判定，不从 `ctx` 推断（DP5-C2、DP5-C7）                                 | R3 测试（APP-5）                                                 |
| IC-19                  | 只在单进程成立 | 见下面四条                                                                                          | 拆进程时由协议重新兑现                                           |
| `HOSTFILE-FACTORY-ROW` | 波 1 不涉及    | `execution-host` 在波 1 是 `s0-double`                                                              | 无                                                               |

IC-19：下面四项保证只在同一进程、同一份模块副本里成立。

1. 核验器的同对象核验：`inProcessPrincipalAuthority` 用 `WeakSet` 记签发的对象。
2. 组件名查表的安全性：只有签发者持有者能铸出组件名（DP5-C1）。
3. `EntryEnv.once` 的共享：一次 `runServe` 内的对象表。
4. 受信可见性与关闭登记：Cordis isolate 标签与 fiber 效应。隔离不是权限。

## 装配给清单

装配入口给每个波 1 真实行什么。「协议给」列写这些东西不保证什么，那部分由契约拥有者负责。

| 行                                    | 装配给                                                                                                                                                    | 协议给（装配不保证）                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `storage`                             | `storageHost`（入口对象，APP-1）、`s0.assemblyLifecycle`                                                                                                  | `storageHost` 的可见范围是装配范围，不是访问控制（sql-contract §2.3） |
| `identity`                            | `storage`（受信存储子树）。时钟在插件内自建（DP1-C16）                                                                                                    | 持久性与单事务由 identity 持久提供者兑现（DP-3）                      |
| `authorization`                       | `principalVerifier`（入口对象，APP-5）、`tenantStanding`（`identity` 行）。维护授权表是发行代码导入，不是装配给的对象                                     | 核验器只证明来源，不证明成员资格                                      |
| `session-storage`                     | `storage`、`sessionAccessCheck`、`s0.assemblyLifecycle`。按调用现取 `sessionCursorSigning`（入口对象，APP-1）                                             | 游标密钥的文件保护靠目录继承（DP1-C19）                               |
| `session-provider`（契约替身）        | `sessionAccessCheck`、`sessionDelegatedTransactions`、`sessionPrincipals`、`sessionWorkPrincipals`（入口对象，APP-5）。按调用现取 `sessionClock`（APP-5） | 替身没有业务持久性                                                    |
| `agent-adoptions`、`adoption-sources` | `definitionMappings`（受信）                                                                                                                              | 映射内容的身份由 DP-2、APP-2 定                                       |
| `server-entry`                        | `session`、签发作用域的 `principalIssuer`（APP-5）、`definitionMappings`、`s0.assemblyLifecycle`。按调用现取 `identityOperations`、`principalVerifier`    | 回环与明文的限制（线包 2.5）                                          |

签发者的受信具名持有者（ID-16）：`src/entry/principals.ts` 与 `server-entry` 行，没有别的。

## 具名差额清单

装配页的名字与 F 上正式键的差额由 Reduce 以装配页补丁 AAP-1～AAP-9 处理。差额落地之前，真实行按正式键声明，`tests/real-manifests-sync.spec.ts` 的 `KNOWN_GAPS` 记下差额与补丁编号。补丁落地、线负责人同步 `stubs.ts` 后，在同一次合入里删掉对应条目。AAP-7（`agentHost`）已在本成员的 `stubs.ts` 完成，不需要装配页补丁。

波 1 `serve` 树的启用次序：`identity` 先于 `authorization`，`authorization` 先于 `session-storage`，`session-provider` 契约替身先于 `server-entry`。次序不对时，依赖行 PENDING 或装载前退出 2。`agent-model-selection` 的真实导出波 1 不进 `serve` 树（DP1-C18）。

## 已知限制

归 [SPEC.md](../SPEC.md)「已知限制」。
