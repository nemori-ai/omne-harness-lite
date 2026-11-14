# `server-entry` 行

本页是 `server-entry` 行的行规格。行的代码在 `src/rows/server-entry/`。行用 `defineRow` 声明，承载是行体，阶段是 `entry`。依据是 DP-1 决定中的行体承载，以及[装配页](../../../../docs/architecture/runtime/application-assembly.md)的 `server-entry` 行。两种模式共同的规则归 [real-mode.md](../real-mode.md)。接入本身的行为归 [接入的包组规格](../../../../packages/access/SPEC.md)。

## 这一行做什么

行在回环地址上启动治理位置与会话位置的接入，以及新地址 `/api/<协议名>/v<主版本>/<名字>`。行不实现接入。它从 Cordis 树取出依赖，调用成员的 `createServerEntry`，再把开始与停止交给装配入口。

| 项               | 内容                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| 行 id 与实现     | `server-entry`，`real`                                                                                       |
| 导出名           | `serverEntryRow`（`src/rows/server-entry/index.ts`）                                                         |
| 提供             | `accessRegistry`（成员的 `AccessRegistryProvider`，见[新地址](#新地址)）                                    |
| 必需（`inject`） | `session`、`principalIssuer`（受信）、`definitionMappings`（受信）、`telemetry`、`agentJournal`、`modelDiagnostics`、`modelRuntime`、`s0.assemblyLifecycle`（`defineRow` 加） |
| 按调用现取       | `identityOperations`；`identityGovernance`（受信）；`settingsSecretItems`（受信）；`toolRuntime`。行不为 `principalVerifier` 取值，因为成员不核验主体 |
| 阶段             | `entry`，行体承载                                                                                            |

清单与 `src/s0/stubs.ts` 的同一行相同。`tests/real-manifests-sync.spec.ts` 在行进入 `./cordis` 之后逐项比较。

## 依赖怎样接线

| 成员依赖            | 来源                                           | 说明                                                                                                                                                                    |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`            | `ctx.principalIssuer`                          | 受信名，只有本行看见。成员用它签发 `server-entry` 系统主体与每个会话请求的代租户主体                                                                                    |
| `session`           | `session`，按调用方类取                        | 见下节                                                                                                                                                                  |
| `resolveDefinition` | `definitionResolverOf(ctx.definitionMappings)` | 未知名得到 `undefined`，接入答 `invalid`                                                                                                                                |
| `identity`          | 每次调用时 `ctx.get('identityOperations')`     | 提供者重载后下一次请求就用新的。提供者不在树里时，`issueLogin` 与 `recognizeLogin` 答 `basis-unavailable`。`registerAndActivate` 没有这种结局，所以抛出，接入答空的 500 |
| `settings`          | 每次调用时 `ctx.get('settingsSecretItems')`    | 受信名，只有本行与提供它的 `settings` 行看见。提供者不在树里时，4 个方法都答 `basis-unavailable`，不抛出。准入与范围在提供者里，见[设置行](settings.md) |
| `agentJournal`      | `ctx.agentJournal`                             | 会话诊断投影的结束原因读口。成员只调用 `readFinish`。提供者没有实现它时，成员记缺口 `unsupported` |
| `modelCalls`        | `ctx.modelRuntime.calls`，只包 `inspect` 与 `dispatches` | 会话诊断投影的调用查找与派发记录（每次派发的账目）。成员拿不到运行时的其他成员 |
| `modelDiagnostics`  | `ctx.modelDiagnostics`                         | 会话诊断投影的派发读口。`model-records` 行提供 |
| `toolQueries`       | 每次调用时 `ctx.get('toolRuntime')` 的 `queries`，只包 `lookup`、`account` 与 `readDiagnostics` | 局部依赖。提供者不在树里时，三个方法答 `unavailable`，成员记缺口；入口照常接收其他操作 |
| `diagnostics`       | `entryDiagnostics(ctx.telemetry)`              | 成员的每个 `ServerEntryDiagnostic` 成为事件 `omne.entry.diagnostic`（owner `server-entry`，version 1，级别 `warn`），`system` 作用域，部件 `server-entry`，经 `telemetry` 行的出口写出。记录里只有 `code` 与诊断带的 `path` 或 `operation`，没有租户、请求正文、凭据或错误原文。`path` 只取请求 URL 的路径部分，不带查询串与片段。见 [telemetry 行](telemetry.md#发射行怎样接入) |

### 新地址

行给成员一份 `access`（`src/rows/server-entry/access.ts`），新地址因此打开。行在自己的作用域里装上成员的 `AccessRegistryProvider`，所以树上有 `accessRegistry`：一个领域的接入插件依赖它，把自己的协议挂上去，入口在同一个登记表上立刻看得到；插件卸载，它挂的那一份就撤下。发行里不挂任何领域的贡献，所以新地址上只有入口自己的内置协议 `access/v1`：它唯一的观察 `availability` 不要登录，答「现在挂着哪些协议」（RFC-0015 I-15：有贡献不等于开放）。

| `access` 的字段 | 值 | 说明 |
| --- | --- | --- |
| `registry` | 本行装上的 `AccessRegistryProvider` 的 `registry` | 入口用的和插件经 `accessRegistry` 挂的是同一个登记表。行的 fiber 卸载时服务随之撤下。订阅者抛出时记 `access.listener-fault` |
| `identity` | 每个方法都答 `basis-unavailable` 的端口 | identity 还没有这个端口的适配。发行里没有要登录的协议，可用性不问它；要登录的调用会被拒绝，并留一条 `access.identity-unavailable` |
| `graceMs` | 5000 | 撤下后处理函数还能跑多久，和演示夹具相同 |
| `frameQueueBytes` | 1048576 | 一个观察还没写出去的帧的字节上界 |
| `availabilityBacklog` | 64 | 一个可用性订阅者最多积压几帧变化，再多就改收快照 |
| `diagnostics` | `accessDiagnostics(ctx.telemetry)` | 成员的每个 `AccessDiagnostic` 成为事件 `omne.access.diagnostic`（owner `server-entry`，version 1，级别 `warn`），`system` 作用域，部件 `server-entry`。记录里只有 `code` 与诊断带的 `path` 或 `operation`。`omne.entry.diagnostic` 那一支不变 |

这五个值写在行里，不是运维配置。

### Session 的两个调用方类

装配页给本行 `session` 两个调用方类：`intake` 与 `reader`。一个插件对一个服务只有一项 `inject`，所以行体用两个 intercept 上下文：

- `ctx.intercept('session', { caller: 'intake' }).session` 提供 `management` 与 `work`。
- `ctx.intercept('session', { caller: 'reader' }).session` 提供 `history`。

调用方类是装配事实，不授予资格（Session 契约 IC-18）。

## 配置

配置在行内用 zod 严格解析一次。未知键和越界值让行 `FAILED`，启动失败，退出 3。错误写出出错的键，不重复被拒绝的值。

| 键                              | 初值                                | 取值                                       |
| ------------------------------- | ----------------------------------- | ------------------------------------------ |
| `listenPort`                    | 8787                                | 1 到 65535。不接受 0，因为运维者要知道端口 |
| `maxBodyBytes.small`            | 16384                               | 正整数，治理路径                           |
| `maxBodyBytes.input`            | 1048576                             | 正整数，会话路径                           |
| `heartbeatIntervalMs`           | 15000                               | 正整数                                     |
| `jsonBudgets.maxDepth`          | 32                                  | 正整数                                     |
| `jsonBudgets.maxItems`          | 65536                               | 正整数                                     |
| `jsonBudgets.maxMembers`        | 1024                                | 正整数                                     |
| `jsonBudgets.maxStringLength`   | 1048576                             | 正整数                                     |
| `jsonBudgets.maxNumberLength`   | 64                                  | 正整数                                     |
| `maxPageBytes`                  | 1048576                             | 正整数，`read-history` 的 `pageBytes` 上界 |
| `historyKinds`                  | `message.user`、`message.assistant` | 非空字符串列表                             |
| `observation.perLogin`          | 4                                   | 正整数                                     |
| `observation.perInstance`       | 1000                                | 正整数                                     |
| `observation.cancelRetentionMs` | 60000                               | 非负整数                                   |
| `diagnosticsKinds`              | 无                                  | 非空字符串列表。会话诊断投影向 Session 请求的种类 |
| `maxRuns`                       | 无                                  | 正整数。一页最多的 Run 数                  |
| `maxCallsPerRun`                | 无                                  | 正整数。一个 Run 进入扇出的最多调用数      |

后三项一起给或一起不给。只给其中一部分时，schema 报缺的键，行 `FAILED`。三项都不给时，`read-session-diagnostics` 答 `basis-unavailable`。本机单用户档给全部种类与两个初值，见 [SPEC](../../SPEC.md#运维者层的默认值)。

没有 `listenAddress` 键。行固定在 `127.0.0.1` 上明文监听。写了 `listenAddress` 的配置因未知键而失败。

前四项初值来自装配页补丁 AAP-11。其余初值取自成员 README 的示例。装配页还没有它们，补丁合入后同步。

## 生命周期

1. 行体解析配置，构造成员的服务对象，并用 `ctx.effect` 登记一个撤除动作：行的 fiber 卸载时关闭监听。
2. 行体返回句柄。`defineRow` 在行 fiber 上以阶段 `entry` 登记句柄。到这一步没有任何端口在监听。
3. 全部行 ACTIVE 之后，装配入口调用句柄的 `start`，成员开始监听。有行 PENDING 时不调用 `start`，所以端口不监听。
4. 计划停止时，`entry` 阶段最先停。`stop` 调用成员的 `stop`：停止接受新连接，给每个活动观察发 `ended(unavailable)`，等在途请求写完答复，再关闭全部连接。成员 `stop` 结束后句柄答 `settled`，下一阶段才开始。
5. `start` 失败（例如端口被占）时，启动失败，退出 3。

## 测试

用例在 `tests/rows/server-entry/`，经 `serveOnce` 以 `serve` 模式装本行、真实入口对象与三个契约替身行。替身行是 `identity`（identity 的参考实现）、`session-provider`（记录调用并经 `principalVerifier` 核验主体的 Session 面）、`agent-adoptions`（一条映射），以及投影三个读口的替身 `agent-journal`、`model-records`、`model-host`（没有记录，读口答 `null` 或 `unavailable`）。

| 文件                  | 覆盖                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve.spec.ts`       | 全部 ACTIVE 后监听、有行 PENDING 时不监听、缺 Session 行时 PENDING、只绑回环、畸形配置与初值                                                                  |
| `composition.spec.ts` | 注册、签发登录、会话操作到达 Session 面的主体由 `principalIssuer` 签发并被 `principalVerifier` 核验、调用方类、输出不含登录证明与凭据、缺 identity 行时的答复 |
| `shutdown.spec.ts`    | `entry` 阶段最先停、停止后拒绝新连接、在途请求写完、下一阶段在其后                                                                                            |
| `access.spec.ts`      | 新地址：不带登录订阅可用性得到只有 `access/v1` 的快照，没有 `omne.access.diagnostic`；诊断的门面；慢层用真实的 `serve` 进程与发行树做同一件事（#1249 C9） |
| `registry-provider.spec.ts` | 慢层，发行树：树上取得到 `accessRegistry`；一个接入插件经它挂上测试协议，可用性立刻出现它，不要登录的操作答 `succeeded`；卸载插件后可用性收到撤下，同一地址答 404 |
| `../session-diagnostics/flow.spec.ts` | 真实 `serve` 进程与真实 CLI：同租户并发两个会话时第二个 Run `model-refused capacity`；上游 504 时 `no-reply` 带 `cause` 与 `upstreamStatus`；同一调用的 Model 派发显示失败原因和状态码，账目缺失时明确未知；他租户读 `denied` 退出 3；`shutdown-result` 仍是最后一行；本机单用户档 `serve` 不带参数可读诊断 |

## 已知限制

- 只监听 `127.0.0.1`，明文。TLS 与非回环监听不在本波。
- 新地址的身份端口还没有 identity 的适配，只答 `basis-unavailable`；发行里也没有接入插件挂到 `accessRegistry` 上，新地址上只有 `access/v1`。
- `listenPort` 不接受 0。行不报告实际端口。
- 诊断事件只有在 `telemetry` 行以 `node` 实现就绪时写出。`disabled` 实现计数不写出，桥的引导态不接事件。
- Session 与 identity 是契约替身。真实 Session 提供者按 `intake` 与 `reader` 核对调用方类的行为，要等真实提供者接入后验证。
- 行的 fiber 在运行中被卸载时关闭监听的撤除动作，没有单独的用例。计划停止路径由 `shutdown.spec.ts` 覆盖。
- `read-session-diagnostics` 的 Model 分支使用原调用者的 `inspect` / `read-account` 只读资格。每个读口独立核验并在读后复核；入口释放整页响应前重核原登录和租户成员资格。旧 `facts`、`account`、正文、控制和执行权限不向登录主体开放。采用依据为 [DA2 决定](https://github.com/nemori-ai/omne-harness-lite/issues/1140#issuecomment-6703474020)。检查点与网络发送不构成撤权原子事务。
