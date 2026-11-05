# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口                           | 源码                            | 调用者                                                      | 运行时导出                    |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `@omne-harness/mcp-host-local` | [src/index.ts](../src/index.ts) | `McpTransportFactory` 的持有者（`@omne-harness/mcp`、装配） | `createLocalTransportFactory` |

没有 `./provider`、`./testing` 或 `./cordis` 入口。端口类型来自 `@omne-harness/mcp-contract/provider`；本包不导出 SDK 的类型。

## 定义索引

| 定义                          | 源码                            | 输入与输出                                                                         | 失败行为                                                         |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `createLocalTransportFactory` | [factory.ts](../src/factory.ts) | `LocalTransportOptions` → 契约的 `McpTransportFactory`                             | 选项不合法抛 `RangeError`（[options.ts](../src/options.ts)）     |
| `LocalTransportOptions`       | [options.ts](../src/options.ts) | `clientInfo`、`probeTimeoutMs`、`fetch?`                                           | —                                                                |
| `McpTransportFactory.open`    | [factory.ts](../src/factory.ts) | 契约的 `TransportMaterial` 与 `signal` → `Outcome<McpTransport, TransportFailure>` | SPEC [H3](../SPEC.md#h3)：`signal` 已中止答 `not-sent`，不发请求 |
| `McpTransport` 的各方法       | [session.ts](../src/session.ts) | 契约 T1–T9 的输入与结局                                                            | 契约 T8 的行；本包的决定 SPEC [H1–H13](../SPEC.md#结果与不变量)  |

内部模块（不是公开面）：[line.ts](../src/line.ts) 的线路端口、[stdio-line.ts](../src/stdio-line.ts)、[http-line.ts](../src/http-line.ts)、[authorization.ts](../src/authorization.ts)、[message.ts](../src/message.ts)、[limits.ts](../src/limits.ts)、[queue.ts](../src/queue.ts)。
