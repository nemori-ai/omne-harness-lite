# `server-entry` 行

本页是 `server-entry` 行的行规格。行的代码在 `src/rows/server-entry/`。行用 `defineRow` 声明，承载是行体，阶段是 `entry`。依据是 DP-1 决定中的行体承载，以及[装配页](../../../../docs/architecture/runtime/application-assembly.md)的 `server-entry` 行。两种模式共同的规则归 [real-mode.md](../real-mode.md)。接入本身的行为归 [`@omne-harness/server-entry` 的 SPEC](../../../../packages/access/server-entry/SPEC.md)。

## 这一行做什么

行在回环地址上启动治理位置与会话位置的接入。行不实现接入。它从 Cordis 树取出依赖，调用成员的 `createServerEntry`，再把开始与停止交给装配入口。

| 项               | 内容                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| 行 id 与实现     | `server-entry`，`real`                                                                                       |
| 导出名           | `serverEntryRow`（`src/rows/server-entry/index.ts`）                                                         |
| 提供             | 无                                                                                                           |
| 必需（`inject`） | `session`、`principalIssuer`（受信）、`definitionMappings`（受信）、`s0.assemblyLifecycle`（`defineRow` 加） |
| 按调用现取       | `identityOperations`。行不为 `principalVerifier` 取值，因为成员不核验主体                                    |
| 阶段             | `entry`，行体承载                                                                                            |

清单与 `src/s0/stubs.ts` 的同一行相同。`tests/real-manifests-sync.spec.ts` 在行进入 `./cordis` 之后逐项比较。

## 依赖怎样接线

| 成员依赖            | 来源                                           | 说明                                                                                                                                                                    |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`            | `ctx.principalIssuer`                          | 受信名，只有本行看见。成员用它签发 `server-entry` 系统主体与每个会话请求的代租户主体                                                                                    |
| `session`           | `session`，按调用方类取                        | 见下节                                                                                                                                                                  |
| `resolveDefinition` | `definitionResolverOf(ctx.definitionMappings)` | 未知名得到 `undefined`，接入答 `invalid`                                                                                                                                |
| `identity`          | 每次调用时 `ctx.get('identityOperations')`     | 提供者重载后下一次请求就用新的。提供者不在树里时，`issueLogin` 与 `recognizeLogin` 答 `basis-unavailable`。`registerAndActivate` 没有这种结局，所以抛出，接入答空的 500 |
| `diagnostics`       | 不给                                           | 装配没有诊断出口，成员的诊断事件不输出                                                                                                                                  |

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

没有 `listenAddress` 键。行固定在 `127.0.0.1` 上明文监听。写了 `listenAddress` 的配置因未知键而失败。

前四项初值来自装配页补丁 AAP-11。其余初值取自成员 README 的示例。装配页还没有它们，补丁合入后同步。

## 生命周期

1. 行体解析配置，构造成员的服务对象，并用 `ctx.effect` 登记一个撤除动作：行的 fiber 卸载时关闭监听。
2. 行体返回句柄。`defineRow` 在行 fiber 上以阶段 `entry` 登记句柄。到这一步没有任何端口在监听。
3. 全部行 ACTIVE 之后，装配入口调用句柄的 `start`，成员开始监听。有行 PENDING 时不调用 `start`，所以端口不监听。
4. 计划停止时，`entry` 阶段最先停。`stop` 调用成员的 `stop`：停止接受新连接，给每个活动观察发 `ended(unavailable)`，等在途请求写完答复，再关闭全部连接。成员 `stop` 结束后句柄答 `settled`，下一阶段才开始。
5. `start` 失败（例如端口被占）时，启动失败，退出 3。

## 测试

用例在 `tests/rows/server-entry/`，经 `serveOnce` 以 `serve` 模式装本行、真实入口对象与三个契约替身行。替身行是 `identity`（identity 的参考实现）、`session-provider`（记录调用并经 `principalVerifier` 核验主体的 Session 面）和 `agent-adoptions`（一条映射）。

| 文件                  | 覆盖                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve.spec.ts`       | 全部 ACTIVE 后监听、有行 PENDING 时不监听、缺 Session 行时 PENDING、只绑回环、畸形配置与初值                                                                  |
| `composition.spec.ts` | 注册、签发登录、会话操作到达 Session 面的主体由 `principalIssuer` 签发并被 `principalVerifier` 核验、调用方类、输出不含登录证明与凭据、缺 identity 行时的答复 |
| `shutdown.spec.ts`    | `entry` 阶段最先停、停止后拒绝新连接、在途请求写完、下一阶段在其后                                                                                            |

## 已知限制

- 只监听 `127.0.0.1`，明文。TLS 与非回环监听不在本波。
- `listenPort` 不接受 0。行不报告实际端口。
- 成员的诊断事件没有出口。
- Session 与 identity 是契约替身。真实 Session 提供者按 `intake` 与 `reader` 核对调用方类的行为，要等真实提供者接入后验证。
- 行的 fiber 在运行中被卸载时关闭监听的撤除动作，没有单独的用例。计划停止路径由 `shutdown.spec.ts` 覆盖。
