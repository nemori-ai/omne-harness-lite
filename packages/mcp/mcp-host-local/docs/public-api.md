# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口                                  | 源码                              | 调用者                                                      | 运行时导出                    |
| ------------------------------------- | --------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `@omne-harness/mcp-host-local`        | [src/index.ts](../src/index.ts)   | `McpTransportFactory` 的持有者（`@omne-harness/mcp`、装配） | `createLocalTransportFactory` |
| `@omne-harness/mcp-host-local/cordis` | [src/cordis.ts](../src/cordis.ts) | Cordis 宿主的装配                                           | `createMcpPlugin`             |

`./cordis` 另导出类型 `McpPluginParts`（工厂参数）与 `McpPluginConfig`（插件配置）。插件的行为（配置的检查、端口的现取与缺席、换代、撤除）见 SPEC [Cordis 插件](../SPEC.md#cordis-plugin)，装配的用法见 [cordis.md](cordis.md)。没有 `./provider` 或 `./testing` 入口。端口类型来自 `@omne-harness/mcp-contract/provider`；本包不导出 SDK 的类型。

## 定义索引

| 定义                                | 源码                            | 输入与输出                                                                         | 失败行为                                                                                                                                  |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `createLocalTransportFactory`       | [factory.ts](../src/factory.ts) | `LocalTransportOptions` → 契约的 `McpTransportFactory`                             | 选项不合法抛 `RangeError`（[options.ts](../src/options.ts)）                                                                              |
| `LocalTransportOptions`             | [options.ts](../src/options.ts) | `clientInfo`、`probeTimeoutMs`、`fetch?`                                           | —                                                                                                                                         |
| `McpTransportFactory.open`          | [factory.ts](../src/factory.ts) | 契约的 `TransportMaterial` 与 `signal` → `Outcome<McpTransport, TransportFailure>` | SPEC [H3](../SPEC.md#h3)：`signal` 已中止答 `not-sent`，不发请求                                                                          |
| `McpTransport` 的各方法             | [session.ts](../src/session.ts) | 契约 T1–T9 的输入与结局                                                            | 契约 T8 的行；本包怎样兑现见 SPEC [结果与不变量](../SPEC.md#结果与不变量)                                                                 |
| `createMcpPlugin`                   | [cordis.ts](../src/cordis.ts)   | `McpPluginParts` → 插件对象（经 `definePlugin`，`name` 为 `mcp`）                  | 配置不合形状时 Cordis 以 `ValidationError` 使加载失败；越界值在 `apply` 里抛 `RangeError`（SPEC [Cordis 插件](../SPEC.md#cordis-plugin)） |
| `McpPluginParts`、`McpPluginConfig` | [cordis.ts](../src/cordis.ts)   | 类型：工厂参数（函数与本地对象）、插件配置（可序列化，全部必填）                   | —                                                                                                                                         |

内部模块（不是公开面）：[line.ts](../src/line.ts) 的线路端口、[stdio-line.ts](../src/stdio-line.ts)、[http-line.ts](../src/http-line.ts)、[authorization.ts](../src/authorization.ts)、[body.ts](../src/body.ts)、[limits.ts](../src/limits.ts)、[queue.ts](../src/queue.ts)。会话的计时端口 `Scheduler` 与 `SessionOptions` 在 [session.ts](../src/session.ts)，是内部类型，不经公开根导出。[cordis.ts](../src/cordis.ts) 里的配置 Schema、四个端口适配器、三个服务子类与撤除函数也不导出。
